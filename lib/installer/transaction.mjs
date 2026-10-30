import {composeStaticArcSkillTree} from './superpowers.mjs';
import path from 'node:path';
import {cleanupStage,captureCleanupEntry} from './stage-cleanup.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {inspectPath,typeOf,metadataOf,sameObjectIdentity,readCheckedFile} from './targets.mjs';
import {parseToml} from '../models/config.mjs';
import {parseClaudeSettings} from './runtime-config.mjs';

export class InstallError extends Error {
 constructor(message,code='ARC_INSTALL_FAILED',details={}) {super(message,{cause:details.cause});this.name='InstallError';this.code=code;Object.assign(this,details);}
}
function fail(message,code='ARC_INSTALL_FAILED',details){throw new InstallError(message,code,details);}
export function findNativeReferences({platform,original,files}){
 const text=new TextDecoder('utf-8',{fatal:true}).decode(original),data=platform==='codex'?parseToml(text):parseClaudeSettings(text),hooks=data.hooks;
 if(hooks===undefined)return[];if(!hooks||typeof hooks!=='object'||Array.isArray(hooks))throw Error('Native settings hooks are invalid');
 const found=new Set();for(const[event,groups]of Object.entries(hooks)){if(!/^[A-Z]/.test(event))continue;if(!Array.isArray(groups))throw Error('Native settings hooks are invalid');for(const group of groups){if(!group||typeof group!=='object'||!Array.isArray(group.hooks))throw Error('Native settings hooks are invalid');for(const handler of group.hooks){if(!handler||typeof handler!=='object')throw Error('Native settings hooks are invalid');if(handler.type!=='command')continue;const command=handler.command;if(typeof command!=='string'||handler.args!==undefined&&!Array.isArray(handler.args))throw Error('Native settings hooks are invalid');for(const file of files){const quoted="'"+file.replaceAll("'","'\\''")+"'",i=command.indexOf(file),raw=i>=0&&(i===0||/[\s'"=]/.test(command[i-1]))&&(i+file.length===command.length||/[\s'";&|]/.test(command[i+file.length]));if(handler.args?.includes(file)||command.includes(quoted)||raw)found.add(file);}}}}
 return [...found];
}
export function inspectRetainedNativeReferences(plan,{safeFs},reason='Native hook cleanup failed; ARC assets retained'){
 const native=plan.nativeChange,files=[...plan.snapshot].filter(([name,entry])=>name.startsWith(native.arc+'/')&&entry?.type==='file').map(([name])=>name);
 try{const found=inspectPath(safeFs,native.path,{kind:'file',read:true}),references=found.exists?findNativeReferences({platform:plan.target.platform,original:found.bytes,files}):[];return{residualPaths:[native.arc],retainedReferences:references,retainedReasons:[references.length?'Native settings reference ARC assets; ARC assets retained':reason]};}
 catch{return{residualPaths:[native.arc],retainedReferences:[],retainedReasons:['Native settings could not be rechecked; ARC assets retained']};}
}
function exists(parent,name){try{return parent.lstat(name);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
function metadataEqual(a,b){if(a===null||b===null)return a===b;return ['dev','ino','mode','size','mtimeNs','ctimeNs','type','sha256','link'].every(key=>a[key]===b[key])&&JSON.stringify(a.entries)===JSON.stringify(b.entries);}
function inspectOne(safeFs,filename,expected,snapshot,tree=expected?.type==='directory'){
 inspectPath(safeFs,filename,{kind:expected?.type==='file'?'file':'directory',tree,allowLinks:true,allowLeafLink:expected?.type==='symlink',snapshot});
}
export function capturePlanSnapshot(plan,{safeFs}){
 const snapshot=new Map();for(const filename of [...plan.managedPaths,...plan.externalPaths]){let parent;let stat=null;try{parent=safeFs.openRoot(path.dirname(filename));stat=exists(parent,path.basename(filename));}catch(error){if(error.code!=='ENOENT')throw error;}finally{parent?.close();}
 inspectOne(safeFs,filename,stat?{type:typeOf(stat)===0o100000?'file':typeOf(stat)===0o120000?'symlink':'directory'}:null,snapshot);}
 plan.snapshot=snapshot;return snapshot;
}
export function assertPlanSnapshot(plan,{safeFs}){
 const fresh=new Map();try{
 for(const[filename,expected]of plan.snapshot)inspectOne(safeFs,filename,expected,fresh,expected?.type==='directory'&&Object.hasOwn(expected,'entries'));
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
 else if(type===0o120000)entries.set(key,{type:'symlink',mode:stat.mode,link:handle.readlink(name),times:metadataOf(stat)});
 else fail('Special file in backup source');}}
 walk(directory);return entries;
}
function finishDirectory(directory,mode,times){
 const permissions=Number(mode&0o7777n);directory.chmod(permissions);if(times)directory.setTimes(times);directory.sync();
 const actual=directory.stat();if(Number(actual.mode&0o7777n)!==permissions||times&&(actual.atimeNs!==times.atimeNs||actual.mtimeNs!==times.mtimeNs))fail('Copied directory metadata verification failed');
}
function writeTree(directory,entries){
 const handles=new Map([['',directory]]);try{for(const[key,entry]of [...entries].sort((a,b)=>a[0].split('/').length-b[0].split('/').length||a[0].localeCompare(b[0]))){const parentKey=path.posix.dirname(key)==='.'?'':path.posix.dirname(key),parent=handles.get(parentKey);if(!parent)fail('Staged entry parent is missing');const name=path.posix.basename(key);
 if(entry.type==='directory'){parent.mkdir(name,0o700);handles.set(key,parent.openDir(name));}
 else if(entry.type==='file'){const file=parent.openFile(name,{createExclusive:true,mode:Number(entry.mode&0o7777n)});try{file.writeAll(entry.bytes);file.chmod(Number(entry.mode&0o7777n));if(entry.times)file.setTimes(entry.times);file.sync();}finally{file.close();}}
 else if(entry.type==='symlink')parent.symlink(entry.link,name);else fail('Unknown staged entry type');}
 for(const[key,handle]of [...handles].reverse()){if(key){const entry=entries.get(key);finishDirectory(handle,entry.mode,entry.times);}}
 }finally{for(const[key,handle]of handles)if(key)handle.close();}
}
function snapshotEntry(parent,name){const stat=exists(parent,name);if(!stat)return null;const type=typeOf(stat);if(type===0o100000)return readCheckedFile(parent,name,stat).metadata;if(type===0o120000)return{...metadataOf(stat),type:'symlink',link:parent.readlink(name)};if(type===0o040000){const dir=parent.openDir(name);try{if(!sameObjectIdentity(stat,dir.stat()))fail('Entry directory changed');const entries=treeFromDirectory(dir);const hash=createHash('sha256');for(const[k,v]of entries){hash.update(JSON.stringify([k,v.type,...['dev','ino','mode','size','mtimeNs','ctimeNs'].map(field=>String(v.times[field])),v.bytes?.toString('hex')??v.link??null]));}return{...metadataOf(stat),type:'directory',sha256:hash.digest('hex'),children:captureCleanupEntry(parent,name).children};}finally{dir.close();}}fail('Special target entry');}
function equalMoved(a,b){return a&&b&&['dev','ino','mode','size','mtimeNs','type','sha256','link'].every(k=>a[k]===b[k]);}
export function applyTransaction(plan,{safeFs,signal,hooks={},specs:explicitSpecs,verifyPublished}){
 assertPlanSnapshot(plan,{safeFs});const actions=[],areas=[],parents=[],created=[],actionLog=[],byParent=new Map();
 const cleanAreas=()=>{const paths=[],errors=[];for(const area of areas){const result=cleanupStage(area,{safeFs,hooks:{fault:event=>hooks.fault?.({...event,plan})}});paths.push(...result.residualPaths);if(result.cleanupError)errors.push(result.cleanupError);}return{paths,error:errors.length?Object.assign(new AggregateError(errors,errors.map(error=>error.message).join('; ')),{code:'ARC_INSTALL_CLEANUP',residualPaths:paths}):null};};
 const event=(phase,details={})=>{actionLog.push({phase,...details});if(signal?.aborted)throw new InstallError('Install interrupted','ARC_INSTALL_CANCELLED');hooks.fault?.({phase,...details,plan});};
 try{
  event('before-prepare');
  const specs=explicitSpecs??plan.uninstallSpecs??[{path:plan.target.home+'/skills/arc',tree:composeStaticArcSkillTree(plan.generated.skill)},...[...plan.generated.profiles].map(([name,bytes])=>({path:plan.target.home+'/agents/'+name,bytes})),...plan.globalChanges.map(change=>({path:change.path,bytes:change.content}))];
  for(const spec of specs){if(!spec.remove&&!spec.tree&&!Buffer.isBuffer(spec.bytes))fail('Missing verified staged data');const parent=openParent(safeFs,spec.path,created);parents.push(parent);const name=path.basename(spec.path);event('before-stage',{path:spec.path});let area=byParent.get(path.dirname(spec.path));if(area&&!sameObjectIdentity(parent.stat(),area.parent.stat()))fail('Reused staging parent identity changed','ARC_INSTALL_DRIFT');if(!area){const stageName='.arc-stage-'+randomUUID();parent.mkdir(stageName,0o700);const stage=parent.openDir(stageName);area={parent,stage,name:stageName,path:path.dirname(spec.path)+'/'+stageName,identity:stage.stat(),expected:new Map()};areas.push(area);byParent.set(path.dirname(spec.path),area);}const stage=area.stage,preparedName='prepared-'+actions.length,previousName='previous-'+actions.length,rollbackName='rollback-installed-'+actions.length;
   if(spec.remove){}
   else if(spec.tree){stage.mkdir(preparedName,0o700);const dir=stage.openDir(preparedName);try{writeTree(dir,spec.tree);if(spec.rootMetadata)finishDirectory(dir,spec.rootMetadata.mode,spec.rootMetadata);else dir.sync();}finally{dir.close();}}
   else{const prior=exists(parent,name),file=stage.openFile(preparedName,{createExclusive:true,mode:prior?Number(prior.mode&0o7777n):0o600});try{file.writeAll(spec.bytes);if(prior){file.chmod(Number(prior.mode&0o7777n));file.setTimes(metadataOf(prior));}file.sync();}finally{file.close();}}
   if(!spec.remove)area.expected.set(preparedName,snapshotEntry(stage,preparedName));
   const previous=snapshotEntry(parent,name);
   actions.push({remove:spec.remove,path:spec.path,parent,name,stage,area,preparedName,previousName,rollbackName,previous,prepared:snapshotEntry(stage,preparedName),moved:false,published:false});event('after-stage',{path:spec.path});
  }
  // Directory metadata changed due to our private staging, so recheck actual
  // managed leaves rather than treating installer-created siblings as drift.
  const leafSnapshot=new Map([...plan.snapshot].filter(([filename])=>[...plan.managedPaths,...plan.externalPaths].some(root=>filename===root||filename.startsWith(root+'/'))));
  assertPlanSnapshot({...plan,snapshot:leafSnapshot},{safeFs});
  for(const action of actions){if(!equalNullable(action.previous,snapshotEntry(action.parent,action.name)))fail('Target changed during staging','ARC_INSTALL_DRIFT');}
  for(const action of actions){event('before-preserve',{path:action.path});assertParentNamespace(safeFs,action);if(!equalNullable(action.previous,snapshotEntry(action.parent,action.name)))fail('Target changed immediately before replacement','ARC_INSTALL_DRIFT');if(action.previous){action.parent.renameNoReplaceTo(action.name,action.stage,action.previousName);action.moved=true;action.area.expected.set(action.previousName,action.previous);if(!equalMoved(action.previous,snapshotEntry(action.stage,action.previousName)))fail('Moved target identity is uncertain','ARC_INSTALL_RECOVERY');}event('after-preserve',{path:action.path});event('before-publish',{path:action.path});assertParentNamespace(safeFs,action);if(!action.remove){action.stage.renameNoReplaceTo(action.preparedName,action.parent,action.name);action.published=true;action.area.expected.delete(action.preparedName);if(!equalMoved(action.prepared,snapshotEntry(action.parent,action.name)))fail('Published target identity is uncertain','ARC_INSTALL_RECOVERY');action.installed=snapshotEntry(action.parent,action.name);}event('after-publish',{path:action.path});assertParentNamespace(safeFs,action);action.parent.sync();}
  for(const action of actions)assertParentNamespace(safeFs,action);
  if(verifyPublished){const verified=verifyPublished({plan,safeFs});if(verified&&typeof verified.then==='function'){Promise.resolve(verified).catch(()=>{});fail('verifyPublished must be synchronous');}}
  const cleaned=cleanAreas();return{actionLog,installedSnapshot:new Map(actions.map(a=>[a.path,a.installed])),residualPaths:cleaned.paths,cleanupError:cleaned.error};
 }catch(cause){const recovery=[],detachedParents=new Set();for(const action of [...actions].reverse()){try{hooks.fault?.({phase:'before-rollback',path:action.path,plan});if(action.published){if(!equalMoved(action.installed??action.prepared,snapshotEntry(action.parent,action.name)))fail('Installed target changed before rollback');action.parent.renameNoReplaceTo(action.name,action.stage,action.rollbackName);action.area.expected.set(action.rollbackName,action.installed??action.prepared);if(!equalMoved(action.installed??action.prepared,snapshotEntry(action.stage,action.rollbackName)))fail('Rollback source changed');}if(action.moved||action.published)try{assertParentNamespace(safeFs,action);}catch(error){detachedParents.add(path.dirname(action.path));throw error;}if(action.moved){if(!equalMoved(action.previous,snapshotEntry(action.stage,action.previousName)))fail('Previous entry changed');action.stage.renameNoReplaceTo(action.previousName,action.parent,action.name);action.area.expected.delete(action.previousName);try{assertParentNamespace(safeFs,action);}catch(error){detachedParents.add(path.dirname(action.path));if(!equalMoved(action.previous,snapshotEntry(action.parent,action.name)))throw error;action.parent.renameNoReplaceTo(action.name,action.stage,action.previousName);action.area.expected.set(action.previousName,action.previous);throw error;}}hooks.fault?.({phase:'after-rollback',path:action.path,plan});}catch{recovery.push(action.path,action.area.path);}}
  const cleaned=recovery.length?{paths:areas.map(area=>area.path),error:null}:cleanAreas();
  const details={cause,actionLog,detachedParents:[...detachedParents],residualPaths:[...new Set([...recovery,...cleaned.paths])],cleanupError:cleaned.error,rollback:recovery.length?'failed':'restored'};
  if(recovery.length)throw new InstallError(detachedParents.size?'Rollback namespace unavailable; reported stage paths are last-known locations':'Rollback conflict; preserve reported residual paths','ARC_INSTALL_RECOVERY',details);
  if(cleaned.error)throw new InstallError('Rollback restored targets; '+cleaned.error.message,'ARC_INSTALL_CLEANUP',details);
  throw new InstallError(cause.message,cause.code==='ARC_INSTALL_CANCELLED'?'ARC_INSTALL_CANCELLED':cause.code==='ARC_INSTALL_DRIFT'?'ARC_INSTALL_DRIFT':'ARC_INSTALL_FAILED',details);
 }finally{for(const area of areas)area.stage.close();for(const parent of parents)parent.close();}
}
function equalNullable(a,b){return a===null||b===null?a===b:equalMoved(a,b)&&a.ctimeNs===b.ctimeNs;}
export function applyUninstallTransaction(plan,options){
 if(!plan.removals.length&&!plan.globalChanges.length)return{residualPaths:[],cleanupError:null,installedSnapshot:new Map(),actionLog:[]};
 if(plan.nativeChange){
  const native=plan.nativeChange,verify=(snapshot=new Map())=>{const found=inspectPath(options.safeFs,native.path,{kind:'file',read:true,snapshot});if(!found.exists||!found.bytes.equals(native.content))fail('Native hook cleanup changed before verification','ARC_INSTALL_DRIFT');return snapshot;};
  let nativeVerified=false;
  try{
   const first=applyTransaction({...plan,uninstallSpecs:[{path:native.path,bytes:native.content}]},{...options,verifyPublished:()=>{verify();nativeVerified=true;}});
   if(first.cleanupError)return{...first,partial:true,retainedReasons:['Native hook cleanup was verified; ARC asset removal deferred after stage cleanup failure'],residualPaths:[...new Set([...first.residualPaths,native.arc])]};
   const snapshot=verify(new Map(plan.snapshot));
   const rest={...plan,snapshot,uninstallSpecs:[...plan.removals.map(path=>({path,remove:true})),...plan.globalChanges.filter(change=>change.path!==native.path).map(change=>({path:change.path,bytes:change.content}))]};
   const second=applyTransaction(rest,{...options,verifyPublished:context=>{verify();return options.verifyPublished?.(context);}});
   return{...second,actionLog:[...first.actionLog,...second.actionLog],installedSnapshot:new Map([...first.installedSnapshot,...second.installedSnapshot]),residualPaths:[...new Set([...first.residualPaths,...second.residualPaths])]};
  }catch(error){const retained=inspectRetainedNativeReferences(plan,options,nativeVerified?'Native hook cleanup was verified; ARC asset removal failed':'Native hook cleanup could not be verified; ARC assets retained');error.residualPaths=[...new Set([...(error.residualPaths??[]),...retained.residualPaths])];error.retainedReferences=retained.retainedReferences;error.retainedReasons=[...(error.retainedReasons??[]),...retained.retainedReasons];error.nativeRetentionInspected=true;throw error;}
 }
 return applyTransaction({...plan,uninstallSpecs:[...plan.removals.map(path=>({path,remove:true})),...plan.globalChanges.map(change=>({path:change.path,bytes:change.content}))]},options);
}
