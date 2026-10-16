import path from 'node:path';
import {metadataOf,sameIdentity,sameObjectIdentity,typeOf,readCheckedFile} from './targets.mjs';
function fail(message){throw new Error(message);}
export function captureCleanupEntry(parent,name){
 const stat=parent.lstat(name),type=typeOf(stat);
 if(type===0o100000)return readCheckedFile(parent,name,stat).metadata;
 if(type===0o120000){const link=parent.readlink(name);if(!sameIdentity(stat,parent.lstat(name)))fail('Cleanup link changed during inspection');return{...metadataOf(stat),type:'symlink',link};}
 if(type!==0o040000)fail('Unsafe cleanup item type');
 const directory=parent.openDir(name);try{if(!sameIdentity(stat,directory.stat()))fail('Cleanup directory changed during inspection');const children=new Map();for(const child of directory.readDir())children.set(child,captureCleanupEntry(directory,child));if(!sameIdentity(stat,directory.stat()))fail('Cleanup directory changed during inspection');return{...metadataOf(stat),type:'directory',children};}finally{directory.close();}
}
function matches(expected,actual,{moved=false}={}){
 const fields=['dev','ino','mode','size','mtimeNs','type','link',...(expected.type==='file'?['sha256']:[]),...(moved?[]:['ctimeNs'])];
 if(!fields.every(key=>expected[key]===actual[key]))return false;
 if(expected.children){if(!actual.children||expected.children.size!==actual.children.size)return false;for(const[name,item]of expected.children)if(!actual.children.has(name)||!matches(item,actual.children.get(name)))return false;}
 return true;
}
// Only a currently held, transaction-owned stage and its recorded children may
// be removed. No stale-prefix scanning, pathname recursion or symlink following.
export function cleanupStage(area,{safeFs,hooks={}}){
 const guard=()=>{const named=safeFs.openRoot(path.dirname(area.path));try{if(!sameObjectIdentity(named.stat(),area.parent.stat()))fail('Cleanup parent namespace changed');}finally{named.close();}if(!sameObjectIdentity(area.identity,area.stage.stat())||!sameObjectIdentity(area.identity,area.parent.lstat(area.name)))fail('Cleanup stage identity changed');};
 const namesMatch=(directory,expected)=>{const names=directory.readDir();if(names.length!==expected.size||names.some(name=>!expected.has(name)))fail('Unknown or missing cleanup entry');};
 const verify=(parent,name,expected)=>{if(!matches(expected,captureCleanupEntry(parent,name),{moved:true}))fail('Cleanup item drift: '+name);};
 const remove=(parent,name,expected,absolute)=>{
  guard();verify(parent,name,expected);
  if(expected.type==='directory'){
   const directory=parent.openDir(name);try{if(!sameObjectIdentity(expected,directory.stat()))fail('Cleanup directory identity changed');const remaining=new Map(expected.children);for(const[child,item]of expected.children){namesMatch(directory,remaining);remove(directory,child,item,absolute+'/'+child);remaining.delete(child);}namesMatch(directory,remaining);directory.sync();}finally{directory.close();}
  }
  hooks.fault?.({phase:'before-cleanup-item',path:absolute});guard();
  if(expected.type==='directory'){
   if(!sameObjectIdentity(expected,parent.lstat(name)))fail('Cleanup directory identity changed before deletion');const directory=parent.openDir(name);try{if(!sameObjectIdentity(expected,directory.stat())||directory.readDir().length)fail('Cleanup directory changed before deletion');}finally{directory.close();}
   if(!sameObjectIdentity(expected,parent.lstat(name)))fail('Cleanup directory identity changed before deletion');parent.rmdir(name);
  }else{verify(parent,name,expected);parent.unlink(name);}
  parent.sync();hooks.fault?.({phase:'after-cleanup-item',path:absolute});
 };
 try{
  guard();namesMatch(area.stage,area.expected);for(const[name,expected]of area.expected)verify(area.stage,name,expected);
  const remaining=new Map(area.expected);for(const[name,expected]of area.expected){guard();namesMatch(area.stage,remaining);remove(area.stage,name,expected,area.path+'/'+name);remaining.delete(name);}
  guard();namesMatch(area.stage,remaining);area.stage.sync();guard();area.parent.rmdir(area.name);area.parent.sync();return{residualPaths:[],cleanupError:null};
 }catch(cause){const cleanupError=Object.assign(new Error(`Stage cleanup failed for ${area.path}: ${cause.message}`,{cause}),{code:'ARC_INSTALL_CLEANUP',residualPaths:[area.path]});return{residualPaths:[area.path],cleanupError};}
}
