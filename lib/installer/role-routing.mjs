import path from 'node:path';
import crypto from 'node:crypto';
import {inspectPath,TargetConfigurationError} from './targets.mjs';
import {assertPlanSnapshot,applyTransaction} from './transaction.mjs';
import {renderProfiles,resolveModelSettings} from '../models/index.mjs';
import {COOPERATIVE_RUNTIME_MODULES,cooperativeVersions} from '../runtime/bootstrap.mjs';
import {acquireRoleRoutingLock} from '../runtime/role-routing.mjs';
import {ROUTING_ROLES,parseRoleRoutingConfig,serializeRoleRoutingConfig,validateRoleRoutingConfig} from '../runtime/role-routing-config.mjs';

const digest=bytes=>'sha256:'+crypto.createHash('sha256').update(bytes).digest('hex');
const validHash=value=>typeof value==='string'&&/^sha256:[a-f0-9]{64}$/.test(value);
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const fail=message=>{throw new TargetConfigurationError(message);};
const profilePath=(target,role)=>path.join(target.home,'agents',`arc-routing-${role.slice(4)}.${target.platform==='codex'?'toml':'md'}`);
const markerPath=target=>path.join(target.home,'arc-role-platform-routing.prepared.json');
const activePath=targets=>path.join(targets.codex.home,'arc-role-platform-routing.json');
const read=(safeFs,filename,snapshot)=>inspectPath(safeFs,filename,{kind:'file',read:true,snapshot});

function renameProfile(bytes,platform,role){
 const suffix=role.slice(4),old=platform==='codex'?`arc_${suffix}`:`arc-${suffix}`,next=platform==='codex'?`arc_routing_${suffix}`:`arc-routing-${suffix}`;
 const text=bytes.toString('utf8'),pattern=platform==='codex'?new RegExp(`^name[ \\t]*=[ \\t]*["']${old}["']([ \\t]*(?:#[^\\r\\n]*)?)(\\r?)$`,'m'):new RegExp(`^name: ${old}(\\r?)$`,'m');
 const matches=[...text.matchAll(new RegExp(pattern.source,'gm'))];if(matches.length!==1)fail('Cannot identify the managed composite profile name');
 return Buffer.from(platform==='codex'?text.replace(pattern,(_match,comment,cr)=>`name = "${next}"${comment}${cr}`):text.replace(pattern,(_match,cr)=>`name: ${next}${cr}`));
}

/** Inspect only ARC-owned composite paths; existing unknown files are never replaced. */
export function prepareCompositeFiles({context,targets,config,profileInputs,modelConfigs}){
 config=validateRoleRoutingConfig(config);const bytes=Buffer.from(serializeRoleRoutingConfig(config)),snapshot=new Map(),active=activePath(targets),activeFile=read(context.safeFs,active,snapshot);
 let previous=null;if(activeFile.exists)try{previous=parseRoleRoutingConfig(activeFile.bytes.toString('utf8'));}catch{fail('Existing composite configuration cannot be verified');}
 if(previous?.revision===config.revision&&!activeFile.bytes.equals(bytes))fail('A published revision cannot be reused with different content');
 const markers={},existingProfiles={},desired={};
 for(const platform of ['codex','claude']){
  const target=targets[platform],found=read(context.safeFs,markerPath(target),snapshot);let marker=null;
  if(found.exists)try{marker=JSON.parse(found.bytes.toString('utf8'));}catch{fail('Existing composite marker cannot be verified');}
  const oldRoles=marker&&marker.profiles&&typeof marker.profiles==='object'&&!Array.isArray(marker.profiles)?Object.keys(marker.profiles):[];
  if(marker&&(!exact(marker,['version','revision','platform','targetHome','activeConfigPath','configHash','runtime','profiles'])||marker.version!==1||typeof marker.revision!=='string'||!marker.revision||marker.platform!==platform||marker.targetHome!==target.home||marker.activeConfigPath!==active||!validHash(marker.configHash)||!exact(marker.runtime,['version','hash','policyHash'])||typeof marker.runtime.version!=='string'||!marker.runtime.version||!validHash(marker.runtime.hash)||!validHash(marker.runtime.policyHash)||oldRoles.some(role=>!ROUTING_ROLES.includes(role))||previous&&(marker.revision!==previous.revision||marker.configHash!==digest(activeFile.bytes)||!exact(marker.profiles,ROUTING_ROLES.filter(role=>previous.roles[role].platform===platform)))))fail('Existing composite marker does not match configuration');
  markers[platform]=marker;existingProfiles[platform]={};
  for(const role of ROUTING_ROLES){
   const filename=profilePath(target,role),file=read(context.safeFs,filename,snapshot),old=marker?.profiles?.[role];
   if(old&&(!exact(old,['path','hash'])||old.path!==path.relative(target.home,filename).split(path.sep).join('/')||!file.exists||old.hash!==digest(file.bytes)))fail('Existing composite profile does not match its marker');
   if(file.exists&&!old)fail('Unmanaged composite profile already exists');
   existingProfiles[platform][role]=Boolean(old);
  }
  const settings=resolveModelSettings(modelConfigs[platform]),field=platform==='codex'?'model_reasoning_effort':'effort';
  for(const role of ROUTING_ROLES)if(config.roles[role].platform===platform)settings.roles[role]={model:config.roles[role].model,[field]:config.roles[role].effort};
  const rendered=renderProfiles(profileInputs[platform],settings);desired[platform]={};
  for(const role of ROUTING_ROLES.filter(role=>config.roles[role].platform===platform)){
   const original=`${role.replace('_','-')}.${platform==='codex'?'toml':'md'}`,value=rendered.get(original);if(!value)fail('Composite profile source is unavailable');
   desired[platform][role]=renameProfile(value,platform,role);
  }
 }
 if(previous&&!Object.values(markers).some(Boolean))fail('Existing composite configuration has no ownership marker');
 const managedPaths=[active,...['codex','claude'].flatMap(platform=>[markerPath(targets[platform]),...ROUTING_ROLES.map(role=>profilePath(targets[platform],role))])];
 return {target:targets.codex,targets,config,bytes,snapshot,managedPaths,externalPaths:[],desired,existingProfiles};
}

export function readCompositeRoutingConfig(context,targets){
 const snapshot=new Map(),found=read(context.safeFs,activePath(targets),snapshot);if(!found.exists)return null;
 return parseRoleRoutingConfig(found.bytes.toString('utf8'));
}

/** Return only composite paths whose current bytes match the active marker. */
export function inspectCompositeRemoval({target,safeFs,activeConfigPath,snapshot}){
 const markerFile=read(safeFs,markerPath(target),snapshot),activeFile=activeConfigPath?read(safeFs,activeConfigPath,snapshot):{exists:false},files={};
 for(const role of ROUTING_ROLES)files[role]=read(safeFs,profilePath(target,role),snapshot);
 const existing=[...(markerFile.exists?[markerPath(target)]:[]),...ROUTING_ROLES.filter(role=>files[role].exists).map(role=>profilePath(target,role)),...(target.platform==='codex'&&activeFile.exists?[activeConfigPath]:[])];
 if(!existing.length)return {removals:[],residualPaths:[]};
 try{
  if(!activeFile.exists||!markerFile.exists)throw Error('Incomplete composite ownership');
  const config=parseRoleRoutingConfig(activeFile.bytes.toString('utf8')),marker=JSON.parse(markerFile.bytes.toString('utf8')),roles=ROUTING_ROLES.filter(role=>config.roles[role].platform===target.platform);
  if(!exact(marker,['version','revision','platform','targetHome','activeConfigPath','configHash','runtime','profiles'])||marker.version!==1||marker.revision!==config.revision||marker.platform!==target.platform||marker.targetHome!==target.home||marker.activeConfigPath!==activeConfigPath||marker.configHash!==digest(activeFile.bytes)||!exact(marker.profiles,roles))throw Error('Marker mismatch');
  for(const role of ROUTING_ROLES){const entry=marker.profiles[role],file=files[role],relative=path.relative(target.home,profilePath(target,role)).split(path.sep).join('/');if(entry&&(!exact(entry,['path','hash'])||entry.path!==relative||!file.exists||entry.hash!==digest(file.bytes))||file.exists&&!entry)throw Error('Profile ownership mismatch');}
  return {removals:existing,residualPaths:[]};
 }catch{return {removals:[],residualPaths:existing};}
}

/** Publication is serialized with T2's preflight; all execution paths remain held. */
export async function publishCompositeFiles({context,prepared}){
 let release,published=false,publication,failure,failed=false;const {targets,config,bytes}=prepared;
 try{
  release=await acquireRoleRoutingLock(targets.codex.home);assertPlanSnapshot(prepared,{safeFs:context.safeFs});
  const versions=await cooperativeVersions(),runtimeSnapshot=new Map(),markers={};
  for(const platform of ['codex','claude']){
   const target=targets[platform],dir=path.join(target.home,'skills','arc','runtime'),modules=[];
   for(const name of COOPERATIVE_RUNTIME_MODULES){const file=read(context.safeFs,path.join(dir,name),runtimeSnapshot);if(!file.exists)fail('Installed cooperative runtime is incomplete');modules.push(file.bytes);}
   const policy=read(context.safeFs,path.join(dir,'role-policy.json'),runtimeSnapshot);if(!policy.exists)fail('Installed role policy is missing');
   const runtimeHash=digest(Buffer.concat(modules)),policyHash=digest(policy.bytes);
   if(runtimeHash!==versions.runtimeHash||policyHash!==versions.policyHash)fail('Installed runtime or policy differs from the current package');
   const profiles={};for(const [role,content] of Object.entries(prepared.desired[platform]))profiles[role]={path:path.relative(target.home,profilePath(target,role)).split(path.sep).join('/'),hash:digest(content)};
   markers[platform]={version:1,revision:config.revision,platform,targetHome:target.home,activeConfigPath:activePath(targets),configHash:digest(bytes),runtime:{version:versions.runtime,hash:runtimeHash,policyHash},profiles};
  }
  assertPlanSnapshot({snapshot:runtimeSnapshot},{safeFs:context.safeFs});
  const specs=[];
  for(const platform of ['codex','claude'])for(const role of ROUTING_ROLES){const filename=profilePath(targets[platform],role),content=prepared.desired[platform][role];if(content)specs.push({path:filename,bytes:content});else if(prepared.existingProfiles[platform][role])specs.push({path:filename,remove:true});}
  for(const platform of ['codex','claude'])specs.push({path:markerPath(targets[platform]),bytes:Buffer.from(JSON.stringify(markers[platform],null,2)+'\n')});
  specs.push({path:activePath(targets),bytes});
  const hooks={...context.hooks,fault:event=>{if(event.phase==='before-publish'&&event.path===activePath(targets))assertPlanSnapshot({snapshot:runtimeSnapshot},{safeFs:context.safeFs});context.hooks?.fault?.(event);}};
  let result;try{result=applyTransaction(prepared,{safeFs:context.safeFs,signal:context.signal,hooks,specs});}catch(error){error.activation=error.rollback==='restored'?'held':'unknown';throw error;}
  published=true;publication={published:true,revision:config.revision,residualPaths:result.residualPaths,cleanupError:result.cleanupError};
 }catch(error){failure=error;failed=true;}
 let released=true;if(release)try{released=await release();}catch{released=false;}
 if(!released){
  const lockPath=path.join(targets.codex.home,'arc-role-platform-routing.lock');
  if(failed){
   if(!failure||typeof failure!=='object')failure=new Error('Composite publication failed',{cause:failure});
   failure.residualPaths=[...new Set([...(Array.isArray(failure.residualPaths)?failure.residualPaths:[]),lockPath])];failure.lockReleaseFailed=true;
   failure.message=(typeof failure.message==='string'?failure.message:'Composite publication failed')+'; Composite publication lock ownership could not be verified';
  }else{
   failure=new TargetConfigurationError('Composite publication lock ownership could not be verified',publication?.cleanupError?{cause:publication.cleanupError}:undefined);
   failure.activation=published?'unknown':'held';failure.lockReleaseFailed=true;
   failure.residualPaths=[...new Set([...(Array.isArray(publication?.residualPaths)?publication.residualPaths:[]),...(Array.isArray(publication?.cleanupError?.residualPaths)?publication.cleanupError.residualPaths:[]),lockPath])];
   if(publication?.cleanupError)failure.cleanupError=publication.cleanupError;
   failed=true;
  }
 }
 if(failed)throw failure;
 return publication;
}
