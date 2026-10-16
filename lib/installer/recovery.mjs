import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {sameObjectIdentity,typeOf} from './targets.mjs';
function failure(source,cause,paths=[source]){return Object.assign(new Error(`Stage recovery failed for ${source}: ${cause.message}`,{cause}),{code:'ARC_INSTALL_RECOVERY',recoveryPaths:paths});}
function namespace(safeFs,absolute,held){const named=safeFs.openRoot(absolute);try{if(!sameObjectIdentity(named.stat(),held.stat()))throw Error(`Recovery namespace changed: ${absolute}`);}finally{named.close();}}
function child(parent,name){let stat;try{stat=parent.lstat(name);}catch(error){if(error.code!=='ENOENT')throw error;parent.mkdir(name,0o700);stat=parent.lstat(name);}if(typeOf(stat)!==0o040000)throw Object.assign(Error(`Unsafe recovery directory: ${name}`),{code:'ENOTDIR'});const handle=parent.openDir(name);if(!sameObjectIdentity(stat,handle.stat())){handle.close();throw Error('Recovery directory identity changed');}return handle;}
function destination(target,{safeFs,backupRoot}){const handles=[];try{let absolute=target.home,handle=safeFs.openRoot(absolute);handles.push(handle);for(const name of backupRoot?path.relative(target.home,backupRoot).split('/'):['backups','arc-'+randomUUID()]){handle=child(handle,name);handles.push(handle);absolute+='/'+name;}handle=child(handle,'recovery');handles.push(handle);absolute+='/recovery';return{handle,absolute,close(){for(const h of handles.reverse())h.close();}};}catch(error){for(const h of handles.reverse())h.close();throw error;}}
export function preserveStage(target,area,{safeFs,backupRoot}={}){
 const source=area.path,parentPath=path.dirname(source),name=path.basename(source);let stage=area.stage,owned=false,dest,movedPath;
 try{
  namespace(safeFs,parentPath,area.parent);const stat=area.parent.lstat(name);if(typeOf(stat)!==0o040000)throw Error('Stage prefix entry is not a directory');if(!stage){stage=area.parent.openDir(name);owned=true;}if(!sameObjectIdentity(stat,stage.stat())||area.identity&&!sameObjectIdentity(area.identity,stage.stat()))throw Error('Stage identity changed');
  try{dest=destination(target,{safeFs,backupRoot});}catch(error){if(!['EACCES','EPERM','EROFS','ENOTDIR','EXDEV'].includes(error.code))throw error;}
  const move=(to,absolute,newName)=>{namespace(safeFs,parentPath,area.parent);namespace(safeFs,absolute,to);if(!sameObjectIdentity(stage.stat(),area.parent.lstat(name)))throw Error('Stage identity changed before recovery');area.parent.renameNoReplaceTo(name,to,newName);movedPath=absolute+'/'+newName;if(!sameObjectIdentity(stage.stat(),to.lstat(newName)))throw Error('Recovered stage identity changed');namespace(safeFs,parentPath,area.parent);namespace(safeFs,absolute,to);area.parent.sync();to.sync();};
  if(dest){try{move(dest.handle,dest.absolute,randomUUID());}catch(error){if(movedPath||!['EACCES','EPERM','EROFS','EXDEV'].includes(error.code))throw error;move(area.parent,parentPath,'.arc-recovery-'+randomUUID());}}
  else move(area.parent,parentPath,'.arc-recovery-'+randomUUID());
  return movedPath;
 }catch(error){throw failure(source,error,[movedPath??source]);}finally{dest?.close();if(owned)stage?.close();}
}
export function recoverTargetStages(target,{safeFs}){
 const areas=[],paths=[],parents=new Set();try{for(const group of ['skills','agents']){const absolute=target.home+'/'+group;let parent;try{parent=safeFs.openRoot(absolute);}catch(error){if(error.code==='ENOENT')continue;throw error;}parents.add(parent);const names=parent.readDir().filter(name=>name.startsWith('.arc-stage-'));if(!names.length)continue;for(const name of names){const source=absolute+'/'+name;let stat;try{stat=parent.lstat(name);if(typeOf(stat)!==0o040000)throw Error('Stage prefix entry is not a directory');}catch(error){throw failure(source,error);}areas.push({parent,name,path:source,identity:stat});}}
 for(const area of areas)paths.push(preserveStage(target,area,{safeFs}));return paths;
 }catch(error){error.recoveryPaths=[...paths,...(error.recoveryPaths??[])];throw error;}finally{for(const parent of parents)parent.close();}
}
