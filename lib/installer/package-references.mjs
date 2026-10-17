import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openRoot} from '../safe-fs/index.mjs';
import {loadNative} from '../safe-fs/native.mjs';
import {acquireExternalSkills} from './acquisition.mjs';
import {DYNAMIC_ROOTS,validateReferenceBundle} from './superpowers.mjs';
import {inspectPath} from './targets.mjs';
import {applyTransaction} from './transaction.mjs';

export async function refreshPackageReferences({packageRoot,safeFs,acquisition,signal,hooks={}}){
 if(!safeFs){const native=loadNative({root:packageRoot});safeFs={openRoot:p=>openRoot(p,{native})};}
 const paths=DYNAMIC_ROOTS.map(root=>path.join(packageRoot,root)),snapshot=new Map();
 for(const filename of paths)inspectPath(safeFs,filename,{kind:'directory',tree:true,allowLinks:true,snapshot});
 let acquired;
 try{
  if(acquisition)acquired=await acquisition({signal});
  else{
   const work=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'arc-package-acquire-'));
   try{acquired=await acquireExternalSkills({work,safeFs,signal});}catch(error){if(!error.residualPaths?.length)fs.rmdirSync(work);throw error;}
   const dispose=acquired.dispose;acquired.dispose=async()=>{await dispose();fs.rmdirSync(work);};
  }
  validateReferenceBundle(acquired.references);
  const plan={target:{home:packageRoot},managedPaths:paths,externalPaths:[],snapshot};
  const result=applyTransaction(plan,{safeFs,signal,hooks,specs:paths.map(filename=>({path:filename,tree:acquired.references.entries}))});
  if(result.cleanupError)throw result.cleanupError;
  return{...result,provenance:acquired.references.provenance};
 }catch(error){
  if(acquired?.dispose){const owned=acquired;acquired=undefined;try{await owned.dispose();}catch(cleanup){throw Object.assign(new AggregateError([error,cleanup],'Reference refresh and cleanup failed'),{residualPaths:[...new Set([...(error.residualPaths??[]),...(cleanup.residualPaths??[])])]});}}
  throw error;
 }finally{if(acquired?.dispose)await acquired.dispose();}
}
