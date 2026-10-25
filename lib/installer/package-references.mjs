import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openRoot} from '../safe-fs/index.mjs';
import {loadNative} from '../safe-fs/native.mjs';
import {acquireExternalSkills} from './acquisition.mjs';
import {REFERENCE_PATH_MAP,flattenReferenceBundle} from './superpowers.mjs';
import {verifyPayload,renderManifest} from './manifest.mjs';
import {inspectPath} from './targets.mjs';
import {applyTransaction} from './transaction.mjs';

export async function refreshPackageReferences({packageRoot,safeFs,acquisition,signal,hooks={}}){
 if(!safeFs){const native=loadNative({root:packageRoot});safeFs={openRoot:p=>openRoot(p,{native})};}
 const payload=verifyPayload({packageRoot,safeFs,payloadMode:'source'}),paths=['codex','claude'].flatMap(platform=>REFERENCE_PATH_MAP.map(({destination})=>path.join(packageRoot,platform,'skill/references',destination)));
 paths.push(path.join(packageRoot,'MANIFEST.sha256'));
 const snapshot=new Map([...payload.snapshot].map(([name,item])=>[path.join(packageRoot,name),item]));
 for(const name of ['MANIFEST.sha256','package-lock.json'])inspectPath(safeFs,path.join(packageRoot,name),{kind:'file',snapshot});
 let acquired;
 try{
  if(acquisition)acquired=await acquisition({signal});
  else{
   const work=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'arc-package-acquire-'));
   try{acquired=await acquireExternalSkills({work,safeFs,signal});}catch(error){if(!error.residualPaths?.length)fs.rmdirSync(work);throw error;}
   const dispose=acquired.dispose;acquired.dispose=async()=>{await dispose();fs.rmdirSync(work);};
  }
  const flat=flattenReferenceBundle(acquired.references),candidate=new Map(payload.files),specs=[];
  for(const platform of ['codex','claude'])for(const[destination,entry]of flat){const name=platform+'/skill/references/'+destination;candidate.set(name,entry.bytes);specs.push({path:path.join(packageRoot,name),bytes:entry.bytes});}
  specs.push({path:path.join(packageRoot,'MANIFEST.sha256'),bytes:renderManifest(candidate)});
  const plan={target:{home:packageRoot},managedPaths:paths,externalPaths:[],snapshot};
  const result=applyTransaction(plan,{safeFs,signal,hooks,specs});
  if(result.cleanupError)throw result.cleanupError;
  return{...result,provenance:acquired.references.provenance};
 }catch(error){
  if(acquired?.dispose){const owned=acquired;acquired=undefined;try{await owned.dispose();}catch(cleanup){throw Object.assign(new AggregateError([error,cleanup],'Reference refresh and cleanup failed'),{residualPaths:[...new Set([...(error.residualPaths??[]),...(cleanup.residualPaths??[])])]});}}
  throw error;
 }finally{if(acquired?.dispose)await acquired.dispose();}
}
