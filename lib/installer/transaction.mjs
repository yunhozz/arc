import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {inspectPath,typeOf,metadataOf,sameObjectIdentity,readCheckedFile} from './targets.mjs';

export class InstallError extends Error {
 constructor(message,code='ARC_INSTALL_FAILED',details={}) {super(message,{cause:details.cause});this.name='InstallError';this.code=code;Object.assign(this,details);}
}
function fail(message,code='ARC_INSTALL_FAILED',details){throw new InstallError(message,code,details);}
function exists(parent,name){try{return parent.lstat(name);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
function metadataEqual(a,b){if(a===null||b===null)return a===b;return ['dev','ino','mode','size','mtimeNs','ctimeNs','type','sha256','link'].every(key=>a[key]===b[key])&&JSON.stringify(a.entries)===JSON.stringify(b.entries);}
function inspectOne(safeFs,filename,expected,snapshot){
 inspectPath(safeFs,filename,{kind:expected?.type==='file'?'file':'directory',tree:expected?.type==='directory',allowLinks:true,allowLeafLink:expected?.type==='symlink',snapshot});
}
export function capturePlanSnapshot(plan,{safeFs}){
 const snapshot=new Map();for(const filename of [...plan.managedPaths,...plan.externalPaths]){let parent;let stat=null;try{parent=safeFs.openRoot(path.dirname(filename));stat=exists(parent,path.basename(filename));}catch(error){if(error.code!=='ENOENT')throw error;}finally{parent?.close();}
 inspectOne(safeFs,filename,stat?{type:typeOf(stat)===0o100000?'file':typeOf(stat)===0o120000?'symlink':'directory'}:null,snapshot);}
 plan.snapshot=snapshot;return snapshot;
}
export function assertPlanSnapshot(plan,{safeFs}){
 const fresh=new Map();try{
 for(const[filename,expected]of plan.snapshot)inspectOne(safeFs,filename,expected,fresh);
 for(const[filename,expected]of plan.snapshot){const actual=fresh.get(filename)??null;if(!metadataEqual(expected,actual))fail(`Install target changed: ${filename}`,'ARC_INSTALL_DRIFT');}
 }catch(error){if(error instanceof InstallError)throw error;throw new InstallError('Install target snapshot changed','ARC_INSTALL_DRIFT',{cause:error});}
}
function assertParentNamespace(safeFs,action){
 let named;try{named=safeFs.openRoot(path.dirname(action.path));if(!sameObjectIdentity(named.stat(),action.parent.stat()))fail('Destination parent namespace changed','ARC_INSTALL_DRIFT');}catch(cause){if(cause instanceof InstallError)throw cause;throw new InstallError('Destination parent cannot be revalidated','ARC_INSTALL_DRIFT',{cause});}finally{named?.close();}
}
function openParent(safeFs,absolute,created){
 const components=path.dirname(absolute).split('/').filter(Boolean);let current=safeFs.openRoot('/'),prefix='';
 try{for(const name of components){prefix+='/'+name;let stat=exists(current,name);if(!stat){current.mkdir(name,0o700);stat=current.lstat(name);created.push(prefix);}if(typeOf(stat)!==0o040000)fail('Unsafe install parent');const next=current.openDir(name);if(!sameObjectIdentity(stat,next.stat())){next.close();fail('Install parent changed');}current.close();current=next;}return current;}catch(error){current.close();throw error;}
}
function treeFromDirectory(directory){
 const entries=new Map();function walk(handle,prefix=''){for(const name of handle.readDir()){const key=prefix?prefix+'/'+name:name,stat=handle.lstat(name),type=typeOf(stat);
 if(type===0o040000){const child=handle.openDir(name);try{if(!sameObjectIdentity(stat,child.stat()))fail('Backup directory changed');entries.set(key,{type:'directory',mode:stat.mode,times:metadataOf(stat)});walk(child,key);}finally{child.close();}}
 else if(type===0o100000){const item=readCheckedFile(handle,name,stat);entries.set(key,{type:'file',mode:stat.mode,bytes:item.bytes,times:item.metadata});}
 else if(type===0o120000)entries.set(key,{type:'symlink',mode:stat.mode,link:handle.readlink(name)});
 else fail('Special file in backup source');}}
 walk(directory);return entries;
}
function writeTree(directory,entries){
 const handles=new Map([['',directory]]);try{for(const[key,entry]of [...entries].sort((a,b)=>a[0].split('/').length-b[0].split('/').length||a[0].localeCompare(b[0]))){const parentKey=path.posix.dirname(key)==='.'?'':path.posix.dirname(key),parent=handles.get(parentKey);if(!parent)fail('Staged entry parent is missing');const name=path.posix.basename(key);
 if(entry.type==='directory'){parent.mkdir(name,Number(entry.mode&0o7777n));handles.set(key,parent.openDir(name));}
 else if(entry.type==='file'){const file=parent.openFile(name,{createExclusive:true,mode:Number(entry.mode&0o7777n)});try{file.writeAll(entry.bytes);file.chmod(Number(entry.mode&0o7777n));if(entry.times)file.setTimes(entry.times);file.sync();}finally{file.close();}}
 else if(entry.type==='symlink')parent.symlink(entry.link,name);else fail('Unknown staged entry type');}
 for(const[key,handle]of [...handles].reverse()){if(key){const entry=entries.get(key);handle.chmod(Number(entry.mode&0o7777n));if(entry.times)handle.setTimes(entry.times);handle.sync();}}
 }finally{for(const[key,handle]of handles)if(key)handle.close();}
}
function buffersAsTree(buffers){const entries=new Map();for(const[name,bytes]of buffers){if(!name||name.startsWith('/')||name.split('/').some(x=>!x||x==='.'||x==='..'))fail('Unsafe generated entry');const parts=name.split('/');for(let i=1;i<parts.length;i++)entries.set(parts.slice(0,i).join('/'),{type:'directory',mode:0o700n});entries.set(name,{type:'file',mode:0o600n,bytes});}return entries;}
function snapshotEntry(parent,name){const stat=exists(parent,name);if(!stat)return null;const type=typeOf(stat);if(type===0o100000)return readCheckedFile(parent,name,stat).metadata;if(type===0o120000)return{...metadataOf(stat),type:'symlink',link:parent.readlink(name)};if(type===0o040000){const dir=parent.openDir(name);try{if(!sameObjectIdentity(stat,dir.stat()))fail('Entry directory changed');const entries=treeFromDirectory(dir);const hash=createHash('sha256');for(const[k,v]of entries){hash.update(k).update(v.type).update(v.bytes??v.link??'');}return{...metadataOf(stat),type:'directory',sha256:hash.digest('hex')};}finally{dir.close();}}fail('Special target entry');}
function equalMoved(a,b){return a&&b&&['dev','ino','mode','size','mtimeNs','type','sha256','link'].every(k=>a[k]===b[k]);}
export function applyTransaction(plan,{safeFs,acquired,signal,hooks={}}){
 assertPlanSnapshot(plan,{safeFs});const actions=[],areas=[],parents=[],created=[],actionLog=[],byParent=new Map();let backupRoot,backup;
 const event=(phase,details={})=>{actionLog.push({phase,...details});if(signal?.aborted)throw new InstallError('Install interrupted','ARC_INSTALL_CANCELLED');hooks.fault?.({phase,...details,plan});};
 function backupEntry(source,name,destination,destName,stat){const type=typeOf(stat);if(type===0o100000){const item=readCheckedFile(source,name,stat),file=destination.openFile(destName,{createExclusive:true,mode:Number(stat.mode&0o7777n)});try{file.writeAll(item.bytes);file.chmod(Number(stat.mode&0o7777n));file.setTimes(item.metadata);file.sync();}finally{file.close();}}
 else if(type===0o120000)destination.symlink(source.readlink(name),destName);
 else if(type===0o040000){const src=source.openDir(name);destination.mkdir(destName,Number(stat.mode&0o7777n));const dest=destination.openDir(destName);try{if(!sameObjectIdentity(stat,src.stat()))fail('Backup source changed');writeTree(dest,treeFromDirectory(src));dest.chmod(Number(stat.mode&0o7777n));dest.setTimes(metadataOf(stat));dest.sync();}finally{src.close();dest.close();}}else fail('Invalid backup entry');}
 try{
  event('before-prepare');const backupParent=openParent(safeFs,plan.target.home+'/backups/placeholder',created);try{const name='arc-'+randomUUID();backupParent.mkdir(name,0o700);backupRoot=plan.target.home+'/backups/'+name;backup=backupParent.openDir(name);}finally{backupParent.close();}
  const specs=[...plan.externalPaths.map(p=>({path:p,tree:acquired.skills.get(path.basename(p))?.entries,rootMetadata:acquired.skills.get(path.basename(p))?.rootMetadata})),{path:plan.target.home+'/skills/arc',tree:buffersAsTree(plan.generated.skill)},...[...plan.generated.profiles].map(([name,bytes])=>({path:plan.target.home+'/agents/'+name,bytes})),...plan.globalChanges.map(change=>({path:change.path,bytes:change.content}))];
  for(const spec of specs){if(!spec.tree&&!Buffer.isBuffer(spec.bytes))fail('Missing verified staged data');const parent=openParent(safeFs,spec.path,created);parents.push(parent);const name=path.basename(spec.path);event('before-stage',{path:spec.path});let area=byParent.get(path.dirname(spec.path));if(area&&!sameObjectIdentity(parent.stat(),area.parent.stat()))fail('Reused staging parent identity changed','ARC_INSTALL_DRIFT');if(!area){const stageName='.arc-stage-'+randomUUID();parent.mkdir(stageName,0o700);const stage=parent.openDir(stageName);area={parent,stage,name:stageName,path:path.dirname(spec.path)+'/'+stageName,identity:stage.stat(),expected:new Map()};areas.push(area);byParent.set(path.dirname(spec.path),area);}const stage=area.stage,preparedName='prepared-'+actions.length,previousName='previous-'+actions.length,rollbackName='rollback-installed-'+actions.length;
   if(spec.tree){stage.mkdir(preparedName,0o700);const dir=stage.openDir(preparedName);try{writeTree(dir,spec.tree);if(spec.rootMetadata){dir.chmod(Number(spec.rootMetadata.mode&0o7777n));dir.setTimes(spec.rootMetadata);}dir.sync();}finally{dir.close();}}
   else{const prior=exists(parent,name),file=stage.openFile(preparedName,{createExclusive:true,mode:prior?Number(prior.mode&0o7777n):0o600});try{file.writeAll(spec.bytes);if(prior){file.chmod(Number(prior.mode&0o7777n));file.setTimes(metadataOf(prior));}file.sync();}finally{file.close();}}
   area.expected.set(preparedName,snapshotEntry(stage,preparedName));
   const previous=snapshotEntry(parent,name);const backupName=spec.path.startsWith(plan.target.home+'/')?(path.dirname(spec.path)===plan.target.home?'global/'+name:spec.path.slice(plan.target.home.length+1)):'legacy-agents-skills/'+name;
   if(previous){const dest=openRelativeParent(backup,backupName);try{backupEntry(parent,name,dest,path.posix.basename(backupName),parent.lstat(name));}finally{dest.close();}}
   actions.push({path:spec.path,parent,name,stage,area,preparedName,previousName,rollbackName,previous,prepared:snapshotEntry(stage,preparedName),moved:false,published:false});event('after-stage',{path:spec.path});
  }
  // Directory metadata changed due to our private staging, so recheck actual
  // managed leaves rather than treating installer-created siblings as drift.
  const leafSnapshot=new Map([...plan.snapshot].filter(([filename])=>[...plan.managedPaths,...plan.externalPaths].some(root=>filename===root||filename.startsWith(root+'/'))));
  assertPlanSnapshot({...plan,snapshot:leafSnapshot},{safeFs});
  for(const action of actions){if(!equalNullable(action.previous,snapshotEntry(action.parent,action.name)))fail('Target changed during staging','ARC_INSTALL_DRIFT');}
  for(const action of actions){event('before-preserve',{path:action.path});assertParentNamespace(safeFs,action);if(!equalNullable(action.previous,snapshotEntry(action.parent,action.name)))fail('Target changed immediately before replacement','ARC_INSTALL_DRIFT');if(action.previous){action.parent.renameNoReplaceTo(action.name,action.stage,action.previousName);action.moved=true;action.area.expected.set(action.previousName,action.previous);if(!equalMoved(action.previous,snapshotEntry(action.stage,action.previousName)))fail('Moved target identity is uncertain','ARC_INSTALL_RECOVERY');}event('after-preserve',{path:action.path});event('before-publish',{path:action.path});assertParentNamespace(safeFs,action);action.stage.renameNoReplaceTo(action.preparedName,action.parent,action.name);action.published=true;action.area.expected.delete(action.preparedName);if(!equalMoved(action.prepared,snapshotEntry(action.parent,action.name)))fail('Published target identity is uncertain','ARC_INSTALL_RECOVERY');action.installed=snapshotEntry(action.parent,action.name);event('after-publish',{path:action.path});assertParentNamespace(safeFs,action);action.parent.sync();}
  for(const action of actions)assertParentNamespace(safeFs,action);
  return{backupRoot,actionLog,installedSnapshot:new Map(actions.map(a=>[a.path,a.installed])),recoveryPaths:areas.map(area=>area.path)};
 }catch(cause){const recovery=[],detachedParents=new Set();for(const action of [...actions].reverse()){try{hooks.fault?.({phase:'before-rollback',path:action.path,plan});if(action.published){if(!equalMoved(action.installed??action.prepared,snapshotEntry(action.parent,action.name)))fail('Installed target changed before rollback');action.parent.renameNoReplaceTo(action.name,action.stage,action.rollbackName);action.area.expected.set(action.rollbackName,action.installed??action.prepared);if(!equalMoved(action.installed??action.prepared,snapshotEntry(action.stage,action.rollbackName)))fail('Rollback source changed');}if(action.moved||action.published)try{assertParentNamespace(safeFs,action);}catch(error){detachedParents.add(path.dirname(action.path));throw error;}if(action.moved){if(!equalMoved(action.previous,snapshotEntry(action.stage,action.previousName)))fail('Previous entry changed');action.stage.renameNoReplaceTo(action.previousName,action.parent,action.name);action.area.expected.delete(action.previousName);try{assertParentNamespace(safeFs,action);}catch(error){detachedParents.add(path.dirname(action.path));if(!equalMoved(action.previous,snapshotEntry(action.parent,action.name)))throw error;action.parent.renameNoReplaceTo(action.name,action.stage,action.previousName);action.area.expected.set(action.previousName,action.previous);throw error;}}hooks.fault?.({phase:'after-rollback',path:action.path,plan});}catch{recovery.push(action.path,action.area.path);}}
  const details={cause,backupRoot,actionLog,detachedParents:[...detachedParents],recoveryPaths:[...new Set([...recovery,...areas.map(area=>area.path)])],rollback:recovery.length?'failed':'restored'};if(recovery.length)throw new InstallError(detachedParents.size?'Rollback namespace unavailable; stage paths under detachedParents are last-known paths; material retained through held descriptors':'Rollback conflict; recovery material preserved','ARC_INSTALL_RECOVERY',details);throw new InstallError(cause.message,cause.code==='ARC_INSTALL_CANCELLED'?'ARC_INSTALL_CANCELLED':cause.code==='ARC_INSTALL_DRIFT'?'ARC_INSTALL_DRIFT':'ARC_INSTALL_FAILED',details);
 }finally{backup?.close();for(const area of areas)area.stage.close();for(const parent of parents)parent.close();}
}
function equalNullable(a,b){return a===null||b===null?a===b:equalMoved(a,b)&&a.ctimeNs===b.ctimeNs;}
function openRelativeParent(root,name){let current=root;const opened=[];try{for(const component of name.split('/').slice(0,-1)){if(!exists(current,component))current.mkdir(component,0o700);const next=current.openDir(component);opened.push(next);current=next;}if(!opened.length)fail('Backup path requires a group');const final=opened.pop();for(const h of opened)h.close();return final;}catch(error){for(const h of opened)h.close();throw error;}}
export function rebaseCommittedLinkDependencies(plan,committedPlan,installed,{safeFs}){
 if(plan.target.platform!=='claude'||committedPlan.target.platform!=='codex'||committedPlan.target.home!==plan.target.userHome+'/.codex')return;
 const allowed=[];for(const linked of plan.externalPaths){const expected=plan.snapshot.get(linked);if(expected?.type!=='symlink')continue;const source=path.resolve(path.dirname(linked),expected.link);if(source!==plan.target.userHome+'/.codex/skills/'+path.basename(linked)||!committedPlan.externalPaths.includes(source))continue;
 const parent=safeFs.openRoot(path.dirname(source));try{if(!equalMoved(installed.installedSnapshot.get(source),snapshotEntry(parent,path.basename(source))))fail('Committed Codex source changed','ARC_INSTALL_DRIFT');}finally{parent.close();}allowed.push(source);}
 if(!allowed.length)return;
 const unaffected=new Map([...plan.snapshot].filter(([filename])=>!allowed.some(root=>filename===root||filename.startsWith(root+'/')||root.startsWith(filename+'/'))));assertPlanSnapshot({...plan,snapshot:unaffected},{safeFs});
 const next=new Map(plan.snapshot);for(const root of allowed){for(const filename of next.keys())if(filename===root||filename.startsWith(root+'/'))next.delete(filename);inspectPath(safeFs,root,{kind:'directory',tree:true,allowLinks:true,snapshot:next});for(const[filename,metadata]of plan.snapshot){if(root.startsWith(filename+'/')&&metadata?.type==='directory'){const handle=safeFs.openRoot(filename);try{const stat=handle.stat();if(!sameObjectIdentity(metadata,stat))fail('Dependency ancestor changed','ARC_INSTALL_DRIFT');next.set(filename,{...metadata,...metadataOf(stat)});}finally{handle.close();}}}}
 plan.snapshot=next;
}
