import {installerRegistryOf,sortByAnchor} from '../platforms/index.mjs';
import {renderStandaloneProfiles} from './plan.mjs';
import {verifyPayload} from './manifest.mjs';
import {loadModelConfig} from '../models/index.mjs';
import {parseLanguage} from './language.mjs';
import {inspectStandaloneProfile,assertVerifiedInstallMode,readInstallMode} from './install-mode.mjs';
import {runtimeRegistryOf,createPlatformRegistry,routingProfileFile,standaloneProfileFile} from '../runtime/platform-registry.mjs';
import path from 'node:path';
import crypto from 'node:crypto';
import {inspectPath,typeOf,sameObjectIdentity,TargetConfigurationError} from './targets.mjs';
import {assertPlanSnapshot,applyTransaction} from './transaction.mjs';
import {renderProfiles,resolveModelSettings} from '../models/index.mjs';
import {COOPERATIVE_RUNTIME_MODULES,cooperativeVersions} from '../runtime/bootstrap.mjs';
import {acquireRoleRoutingLock} from '../runtime/role-routing.mjs';
import {NON_TERMINAL_STATES,listLeases} from '../runtime/role-dispatch-store.mjs';
import {ROUTING_ROLES,parseRoleRoutingConfig,serializeRoleRoutingConfig,validateRoleRoutingConfig} from '../runtime/role-routing-config.mjs';

const digest=bytes=>'sha256:'+crypto.createHash('sha256').update(bytes).digest('hex');
const validHash=value=>typeof value==='string'&&/^sha256:[a-f0-9]{64}$/.test(value);
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const fail=message=>{throw new TargetConfigurationError(message);};
const profilePath=(target,role,runtimePlatforms)=>path.join(target.home,'agents',routingProfileFile(runtimeRegistryOf({runtimePlatforms}).getPlatform(target.platform),role));
const markerPath=target=>path.join(target.home,'arc-role-platform-routing.prepared.json');
const activePath=(targets,anchor)=>path.join(targets[anchor].home,'arc-role-platform-routing.json');
const read=(safeFs,filename,snapshot)=>inspectPath(safeFs,filename,{kind:'file',read:true,snapshot});

export const legacyAnchorPlatform = 'codex';
// Only installers read the historical v1 order. Runtime activation stays strict.
export function parseInstalledRoutingConfig(text,{runtimePlatforms}={}){
 const registry=runtimeRegistryOf({runtimePlatforms});
 try{return parseRoleRoutingConfig(text,{runtimePlatforms:registry});}catch(cause){
  if(JSON.parse(text)?.version!==1)throw cause;
  const historical=createPlatformRegistry([...registry.byAnchorOrder()].sort((a,b)=>Number(b.id===legacyAnchorPlatform)-Number(a.id===legacyAnchorPlatform)).map((descriptor,anchorOrder)=>({...descriptor,anchorOrder})));
  const config=parseRoleRoutingConfig(text,{runtimePlatforms:historical});
  return validateRoleRoutingConfig({...config,platforms:[...config.platforms].sort((a,b)=>registry.getPlatform(a).anchorOrder-registry.getPlatform(b).anchorOrder)},{runtimePlatforms:registry});
 }
}

export function renameCompositeProfile(bytes,platform,role,revision,context={}){
 return installerRegistryOf(context).getPlatform(platform).profiles.renameForRouting(bytes,role,revision);
}

/** Inspect only ARC-owned composite paths; existing unknown files are never replaced. */
export function prepareCompositeFiles({context,targets,platforms=installerRegistryOf(context).byAnchorOrder().map(descriptor=>descriptor.runtime.id),anchor=sortByAnchor(platforms,installerRegistryOf(context))[0],config,profileInputs,modelConfigs,previous}){
 const mode=assertVerifiedInstallMode({safeFs:context.safeFs,targets,platforms:context.platforms});
 previous??=mode.mode==='composite'?{platforms:mode.platforms,anchor:mode.anchor}:undefined;
 const {runtimePlatforms}=context;
 config=validateRoleRoutingConfig(config,{runtimePlatforms});
 if(config.version===1&&anchor!==legacyAnchorPlatform)config=validateRoleRoutingConfig({...config,version:2},{runtimePlatforms});
 const bytes=Buffer.from(config.version===2&&anchor!==legacyAnchorPlatform?JSON.stringify(config,null,2)+'\n':serializeRoleRoutingConfig(config)),snapshot=new Map(),active=activePath(targets,anchor),activeFile=read(context.safeFs,active,snapshot);
 const previousActive=activePath(targets,previous?.anchor??anchor),previousFile=previousActive===active?activeFile:read(context.safeFs,previousActive,snapshot);
 let previousConfig=null;if(previousFile.exists)try{previousConfig=parseInstalledRoutingConfig(previousFile.bytes.toString('utf8'),{runtimePlatforms});}catch{fail('Existing composite configuration cannot be verified');}
 if(previousConfig?.revision===config.revision&&!previousFile.bytes.equals(bytes))fail('A published revision cannot be reused with different content');
 const markers={},existingProfiles={},desired={};
 for(const platform of platforms){
  const target=targets[platform],found=read(context.safeFs,markerPath(target),snapshot);let marker=null;
  if(found.exists)try{marker=JSON.parse(found.bytes.toString('utf8'));}catch{fail('Existing composite marker cannot be verified');}
  const oldRoles=marker&&marker.profiles&&typeof marker.profiles==='object'&&!Array.isArray(marker.profiles)?Object.keys(marker.profiles):[];
  if(marker&&(!exact(marker,['version','revision','platform','targetHome','activeConfigPath','configHash','runtime','profiles'])||marker.version!==1||typeof marker.revision!=='string'||!marker.revision||marker.platform!==platform||marker.targetHome!==target.home||marker.activeConfigPath!==previousActive||!validHash(marker.configHash)||!exact(marker.runtime,['version','hash','policyHash'])||typeof marker.runtime.version!=='string'||!marker.runtime.version||!validHash(marker.runtime.hash)||!validHash(marker.runtime.policyHash)||oldRoles.some(role=>!ROUTING_ROLES.includes(role))||previousConfig&&(marker.revision!==previousConfig.revision||marker.configHash!==digest(previousFile.bytes)||!exact(marker.profiles,ROUTING_ROLES.filter(role=>previousConfig.roles[role].platform===platform)))))fail('Existing composite marker does not match configuration');
  markers[platform]=marker;existingProfiles[platform]={};
  for(const role of ROUTING_ROLES){
   const filename=profilePath(target,role,runtimePlatforms),file=read(context.safeFs,filename,snapshot),old=marker?.profiles?.[role];
   if(old&&(!exact(old,['path','hash'])||old.path!==path.relative(target.home,filename).split(path.sep).join('/')||!file.exists||old.hash!==digest(file.bytes)))fail('Existing composite profile does not match its marker');
   if(file.exists&&!old)fail('Unmanaged composite profile already exists');
   existingProfiles[platform][role]=Boolean(old);
  }
  const roles=ROUTING_ROLES.filter(role=>config.roles[role].platform===platform);if(!roles.length)continue;
  const descriptor=installerRegistryOf(context).getPlatform(platform),settings=resolveModelSettings(modelConfigs[platform],{runtimePlatforms}),field=descriptor.models.effortField;
  for(const role of roles)settings.roles[role]={model:config.roles[role].model,[field]:config.roles[role].effort};
  const rendered=renderProfiles(profileInputs[platform],settings,{runtimePlatforms});desired[platform]={};
  for(const role of roles){
   const original=standaloneProfileFile(descriptor.runtime,role),value=rendered.get(original);if(!value)fail('Composite profile source is unavailable');
   desired[platform][role]=renameCompositeProfile(value,platform,role,config.revision,context);
  }
 }
 if(previousConfig&&!Object.values(markers).some(Boolean)&&!previous?.platforms.some(platform=>!platforms.includes(platform)))fail('Existing composite configuration has no ownership marker');
 const standaloneRemovals=[],residualPaths=[];
 for(const platform of platforms)for(const role of ROUTING_ROLES){const found=inspectStandaloneProfile({safeFs:context.safeFs,target:targets[platform],role,snapshot,platforms:context.platforms});if(found.owned)standaloneRemovals.push(found.path);else if(found.exists)residualPaths.push(found.path);}
 const transitionRemovals=[],standaloneWrites=[],externalPaths=[],removed=(previous?.platforms??[]).filter(platform=>!platforms.includes(platform));
 const payload=removed.length?verifyPayload(context):null;
 for(const platform of removed){
  const target=targets[platform],owned=inspectCompositeRemoval({target,safeFs:context.safeFs,activeConfigPath:previousActive,snapshot,runtimePlatforms});
  transitionRemovals.push(...owned.removals);residualPaths.push(...owned.residualPaths);
  const restored=restoreStandaloneSpecs({context,target,payload,snapshot});standaloneWrites.push(...restored.writes);externalPaths.push(...restored.externalPaths);residualPaths.push(...restored.residualPaths);
 }
 if(previous&&previous.anchor!==anchor)transitionRemovals.push(previousActive);
 const managedPaths=[...new Set([...standaloneRemovals,active,...platforms.flatMap(platform=>[markerPath(targets[platform]),...ROUTING_ROLES.map(role=>profilePath(targets[platform],role,runtimePlatforms))]),...transitionRemovals,...standaloneWrites.map(spec=>spec.path)])];
 return {target:targets[anchor],targets,platforms,anchor,previous,config,bytes,snapshot,managedPaths,externalPaths,desired,existingProfiles,standaloneRemovals,transitionRemovals:[...new Set(transitionRemovals)],standaloneWrites,residualPaths};
}

export function readCompositeRoutingConfig(context,targets){
 const {anchor}=readInstallMode({safeFs:context.safeFs,targets,platforms:context.platforms});if(!anchor)return null;
 const snapshot=new Map(),found=read(context.safeFs,activePath(targets,anchor),snapshot);if(!found.exists)return null;
 return parseInstalledRoutingConfig(found.bytes.toString('utf8'),{runtimePlatforms:context.runtimePlatforms});
}

/** Return only composite paths whose current bytes match the active marker. */
export function inspectCompositeRemoval({target,safeFs,activeConfigPath,snapshot,runtimePlatforms}){
 const markerFile=read(safeFs,markerPath(target),snapshot),activeFile=activeConfigPath?read(safeFs,activeConfigPath,snapshot):{exists:false},files={};
 for(const role of ROUTING_ROLES)files[role]=read(safeFs,profilePath(target,role,runtimePlatforms),snapshot);
 const existing=[...(markerFile.exists?[markerPath(target)]:[]),...ROUTING_ROLES.filter(role=>files[role].exists).map(role=>profilePath(target,role,runtimePlatforms)),...(activeFile.exists&&target.home===path.dirname(activeConfigPath)?[activeConfigPath]:[])];
 if(!existing.length)return {removals:[],residualPaths:[]};
 try{
  if(!activeFile.exists||!markerFile.exists)throw Error('Incomplete composite ownership');
  const config=parseInstalledRoutingConfig(activeFile.bytes.toString('utf8'),{runtimePlatforms}),marker=JSON.parse(markerFile.bytes.toString('utf8')),roles=ROUTING_ROLES.filter(role=>config.roles[role].platform===target.platform);
  if(!exact(marker,['version','revision','platform','targetHome','activeConfigPath','configHash','runtime','profiles'])||marker.version!==1||marker.revision!==config.revision||marker.platform!==target.platform||marker.targetHome!==target.home||marker.activeConfigPath!==activeConfigPath||marker.configHash!==digest(activeFile.bytes)||!exact(marker.profiles,roles))throw Error('Marker mismatch');
  for(const role of ROUTING_ROLES){const entry=marker.profiles[role],file=files[role],relative=path.relative(target.home,profilePath(target,role,runtimePlatforms)).split(path.sep).join('/');if(entry&&(!exact(entry,['path','hash'])||entry.path!==relative||!file.exists||entry.hash!==digest(file.bytes))||file.exists&&!entry)throw Error('Profile ownership mismatch');}
  return {removals:existing,residualPaths:[]};
 }catch{return {removals:[],residualPaths:existing};}
}

/** A non-terminal bridge lease still owns a running or unverified child, so composite settings cannot change under it. Native leases never block. */
async function assertNoActiveBridgeDispatch(codexHome,runtimePlatforms){
 let leases;
 try{leases=await listLeases(codexHome,{runtimePlatforms});}
 catch(cause){const error=new TargetConfigurationError('Dispatch leases cannot be read; composite settings are not published',{cause});error.activation='held';error.activeDispatches=null;throw error;}
 const active=leases.filter(lease=>lease.route==='bridge'&&NON_TERMINAL_STATES.includes(lease.state)).map(lease=>lease.dispatchId);
 if(active.length){const error=new TargetConfigurationError('Active bridge dispatches block composite publication; finish or cancel them first');error.activation='held';error.activeDispatches=active;throw error;}
}
async function assertNoActiveMovingDispatches(homes,runtimePlatforms){
 let leases;
 try{leases=(await Promise.all(homes.map(home=>listLeases(home,{runtimePlatforms})))).flat();}
 catch(cause){const error=new TargetConfigurationError('Dispatch leases cannot be read; composite settings are not published',{cause});error.activation='held';error.activeDispatches=null;throw error;}
 const active=[...new Set(leases.filter(lease=>NON_TERMINAL_STATES.includes(lease.state)).map(lease=>lease.dispatchId))];
 if(active.length){const error=new TargetConfigurationError('Active dispatches block moving mixed routing; finish or cancel them first');error.activation='held';error.activeDispatches=active;throw error;}
}
// A joining anchor may not have an installation yet. Retain descriptors so a
// refused move can remove only the empty directories created for its locks.
function prepareLockHome({safeFs,home,created,handles}){
 let directory=safeFs.openRoot('/'),filename='';handles.push(directory);
 for(const name of home.split('/').filter(Boolean)){
  filename+='/'+name;let stat;
  try{stat=directory.lstat(name);}catch(error){if(error.code!=='ENOENT')throw error;directory.mkdir(name,0o700);stat=directory.lstat(name);created.push({parent:directory,name,path:filename,identity:stat});}
  if(typeOf(stat)!==0o040000)fail(`Expected destination directory: ${filename}`);
  const next=directory.openDir(name);handles.push(next);if(!sameObjectIdentity(stat,next.stat()))fail('Anchor home changed while preparing routing lock');directory=next;
 }
}
/** Publication is serialized with T2's preflight; all execution paths remain held. */
export async function publishCompositeFiles({context,prepared,beforePublish}){
 let published=false,publication,failure,failed=false,installing=false;const releases=[],created=[],handles=[],{targets,platforms=installerRegistryOf(context).byAnchorOrder().map(descriptor=>descriptor.runtime.id),anchor=sortByAnchor(platforms,installerRegistryOf(context))[0],config,bytes}=prepared,{runtimePlatforms}=context;
 const moving=prepared.previous&&prepared.previous.anchor!==anchor,anchors=moving?sortByAnchor([prepared.previous.anchor,anchor],installerRegistryOf(context)):[anchor];
 try{
  if(moving)for(const id of anchors)prepareLockHome({safeFs:context.safeFs,home:targets[id].home,created,handles});
  for(const id of anchors)releases.push({home:targets[id].home,release:await acquireRoleRoutingLock(targets[id].home)});
  if(moving)await assertNoActiveMovingDispatches(anchors.map(id=>targets[id].home),runtimePlatforms);else await assertNoActiveBridgeDispatch(targets[anchor].home,runtimePlatforms);
  // Management installs must run after the move guard and under both locks.
  if(beforePublish){installing=true;await beforePublish({createdHomes:created.map(item=>item.path)});}
  assertPlanSnapshot(prepared,{safeFs:context.safeFs});
  const versions=await cooperativeVersions(),runtimeSnapshot=new Map(),markers={};
  for(const platform of platforms){
   const target=targets[platform],dir=path.join(target.home,'skills','arc','runtime'),modules=[];
   for(const name of COOPERATIVE_RUNTIME_MODULES){const file=read(context.safeFs,path.join(dir,name),runtimeSnapshot);if(!file.exists)fail('Installed cooperative runtime is incomplete');modules.push(file.bytes);}
   const policy=read(context.safeFs,path.join(dir,'role-policy.json'),runtimeSnapshot);if(!policy.exists)fail('Installed role policy is missing');
   const runtimeHash=digest(Buffer.concat(modules)),policyHash=digest(policy.bytes);
   if(runtimeHash!==versions.runtimeHash||policyHash!==versions.policyHash)fail('Installed runtime or policy differs from the current package');
   const profiles={};for(const [role,content] of Object.entries(prepared.desired[platform]??{}))profiles[role]={path:path.relative(target.home,profilePath(target,role,runtimePlatforms)).split(path.sep).join('/'),hash:digest(content)};
   markers[platform]={version:1,revision:config.revision,platform,targetHome:target.home,activeConfigPath:activePath(targets,anchor),configHash:digest(bytes),runtime:{version:versions.runtime,hash:runtimeHash,policyHash},profiles};
  }
  assertPlanSnapshot({snapshot:runtimeSnapshot},{safeFs:context.safeFs});
  const specs=[...(prepared.modelWrites??[]),...(prepared.standaloneRemovals??[]).map(path=>({path,remove:true})),...(prepared.transitionRemovals??[]).map(path=>({path,remove:true})),...(prepared.standaloneWrites??[])];
  for(const platform of platforms)for(const role of ROUTING_ROLES){const filename=profilePath(targets[platform],role,runtimePlatforms),content=prepared.desired[platform]?.[role];if(content)specs.push({path:filename,bytes:content});else if(prepared.existingProfiles[platform][role])specs.push({path:filename,remove:true});}
  for(const platform of platforms)specs.push({path:markerPath(targets[platform]),bytes:Buffer.from(JSON.stringify(markers[platform],null,2)+'\n')});
  specs.push({path:activePath(targets,anchor),bytes});
  const hooks={...context.hooks,fault:event=>{if(event.phase==='before-publish'&&event.path===activePath(targets,anchor))assertPlanSnapshot({snapshot:runtimeSnapshot},{safeFs:context.safeFs});context.hooks?.fault?.(event);}};
  let result;try{result=applyTransaction(prepared,{safeFs:context.safeFs,signal:context.signal,hooks,specs});}catch(error){error.activation=error.rollback==='restored'?'held':'unknown';throw error;}
  published=true;publication={published:true,revision:config.revision,residualPaths:[...(prepared.residualPaths??[]),...result.residualPaths],cleanupError:result.cleanupError};
 }catch(error){failure=error;failed=true;}
 const failedLocks=[];
 for(const {home,release}of releases.reverse()){let released=false;try{released=await release();}catch{}if(!released)failedLocks.push(path.join(home,'arc-role-platform-routing.lock'));}
 if(failedLocks.length){
  if(failed){
   if(!failure||typeof failure!=='object')failure=new Error('Composite publication failed',{cause:failure});
   failure.residualPaths=[...new Set([...(Array.isArray(failure.residualPaths)?failure.residualPaths:[]),...failedLocks])];failure.lockReleaseFailed=true;
   if(moving)failure.activation??=published?'unknown':'held';
   failure.message=(typeof failure.message==='string'?failure.message:'Composite publication failed')+'; Composite publication lock ownership could not be verified';
  }else{
   failure=new TargetConfigurationError('Composite publication lock ownership could not be verified',publication?.cleanupError?{cause:publication.cleanupError}:undefined);
   failure.activation=published?'unknown':'held';failure.lockReleaseFailed=true;
   failure.residualPaths=[...new Set([...(Array.isArray(publication?.residualPaths)?publication.residualPaths:[]),...(Array.isArray(publication?.cleanupError?.residualPaths)?publication.cleanupError.residualPaths:[]),...failedLocks])];
   if(publication?.cleanupError)failure.cleanupError=publication.cleanupError;
   failed=true;
  }
 }
 if(!installing&&!published)for(const item of created.reverse())try{
  if(!sameObjectIdentity(item.identity,item.parent.lstat(item.name)))throw Error('Created anchor directory identity changed');
  item.parent.rmdir(item.name);
 }catch{
  failure??=new TargetConfigurationError('Anchor lock directory cleanup could not be verified');failure.activation??='held';failure.residualPaths=[...new Set([...(failure.residualPaths??[]),item.path])];failed=true;
 }
 for(const handle of handles.reverse())handle.close();
 if(failed)throw failure;
 return publication;
}

function restoreStandaloneSpecs({context,target,payload,snapshot}){
 const writes=[],residualPaths=[],externalPaths=[],platform=target.platform;
 const arc=path.join(target.home,'skills/arc');if(!inspectPath(context.safeFs,arc,{kind:'directory',snapshot}).exists)return{writes,residualPaths,externalPaths};
 const inputs={};for(const name of ['models.toml','settings.toml']){const filename=path.join(arc,name),found=read(context.safeFs,filename,snapshot);if(!found.exists)fail(`Installed settings missing: ${filename}`);inputs[name]=found.bytes;externalPaths.push(filename);}
 const profiles=renderStandaloneProfiles({payload,target,modelConfig:loadModelConfig(inputs['models.toml'],platform,{runtimePlatforms:context.runtimePlatforms}),language:parseLanguage(inputs['settings.toml']).language,platforms:context.platforms,runtimePlatforms:context.runtimePlatforms});
 for(const role of ROUTING_ROLES){const found=inspectStandaloneProfile({safeFs:context.safeFs,target,role,snapshot,platforms:context.platforms});if(found.exists&&!found.owned){residualPaths.push(found.path);continue;}writes.push({path:found.path,bytes:profiles.get(path.basename(found.path))});}
 return{writes,residualPaths,externalPaths};
}
/** Restore standalone profiles and remove verified routing files in one transaction. */
export function prepareCompositeDeactivation({context,targets,payload,platforms=installerRegistryOf(context).byAnchorOrder().map(descriptor=>descriptor.runtime.id),anchor=sortByAnchor(platforms,installerRegistryOf(context))[0]}){
 const snapshot=new Map();assertVerifiedInstallMode({safeFs:context.safeFs,targets,snapshot,platforms:context.platforms});
 const removals=[],writes=[],residualPaths=[],externalPaths=[];
 for(const platform of platforms){
  const target=targets[platform],owned=inspectCompositeRemoval({target,safeFs:context.safeFs,activeConfigPath:activePath(targets,anchor),snapshot,runtimePlatforms:context.runtimePlatforms});removals.push(...owned.removals);
  const restored=restoreStandaloneSpecs({context,target,payload,snapshot});writes.push(...restored.writes);residualPaths.push(...restored.residualPaths);externalPaths.push(...restored.externalPaths);
 }
 return{target:targets[anchor],targets,platforms,anchor,snapshot,managedPaths:[...new Set([...removals,...writes.map(item=>item.path)])],externalPaths,removals:[...new Set(removals)],writes,residualPaths};
}
export async function publishCompositeDeactivation({context,prepared}){
 let release,result,failure;const {anchor=sortByAnchor(prepared.platforms??installerRegistryOf(context).byAnchorOrder().map(descriptor=>descriptor.runtime.id),installerRegistryOf(context))[0]}=prepared;
 try{
  release=await acquireRoleRoutingLock(prepared.targets[anchor].home);await assertNoActiveBridgeDispatch(prepared.targets[anchor].home,context.runtimePlatforms);
  assertPlanSnapshot(prepared,{safeFs:context.safeFs});assertVerifiedInstallMode({safeFs:context.safeFs,targets:prepared.targets,platforms:context.platforms});
  const applied=applyTransaction(prepared,{safeFs:context.safeFs,signal:context.signal,hooks:context.hooks,specs:[...prepared.removals.map(path=>({path,remove:true})),...prepared.writes]});
  result={residualPaths:[...prepared.residualPaths,...applied.residualPaths],cleanupError:applied.cleanupError};
 }catch(error){failure=error;}
 let released=true;if(release)try{released=await release();}catch{released=false;}
 if(!released){const lockPath=path.join(prepared.targets[anchor].home,'arc-role-platform-routing.lock');failure??=new TargetConfigurationError('Composite publication lock ownership could not be verified');failure.lockReleaseFailed=true;failure.residualPaths=[...new Set([...(failure.residualPaths??[]),...(result?.residualPaths??[]),lockPath])];if(result?.cleanupError)failure.cleanupError=result.cleanupError;}
 if(failure)throw failure;return result;
}
