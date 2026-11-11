import {renderStandaloneProfiles} from './plan.mjs';
import {loadModelConfig} from '../models/index.mjs';
import {parseLanguage} from './language.mjs';
import {inspectStandaloneProfile,assertVerifiedInstallMode} from './install-mode.mjs';
import path from 'node:path';
import crypto from 'node:crypto';
import {inspectPath,TargetConfigurationError} from './targets.mjs';
import {assertPlanSnapshot,applyTransaction} from './transaction.mjs';
import {renderProfiles,resolveModelSettings} from '../models/index.mjs';
import {COOPERATIVE_RUNTIME_MODULES,cooperativeVersions} from '../runtime/bootstrap.mjs';
import {acquireRoleRoutingLock} from '../runtime/role-routing.mjs';
import {NON_TERMINAL_STATES,listLeases} from '../runtime/role-dispatch-store.mjs';
import {revisionTag} from '../runtime/role-dispatch-policy.mjs';
import {ROUTING_ROLES,parseRoleRoutingConfig,serializeRoleRoutingConfig,validateRoleRoutingConfig} from '../runtime/role-routing-config.mjs';

const digest=bytes=>'sha256:'+crypto.createHash('sha256').update(bytes).digest('hex');
const validHash=value=>typeof value==='string'&&/^sha256:[a-f0-9]{64}$/.test(value);
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const fail=message=>{throw new TargetConfigurationError(message);};
const profilePath=(target,role)=>path.join(target.home,'agents',`arc-routing-${role.slice(4)}.${target.platform==='codex'?'toml':'md'}`);
const markerPath=target=>path.join(target.home,'arc-role-platform-routing.prepared.json');
const activePath=targets=>path.join(targets.codex.home,'arc-role-platform-routing.json');
const read=(safeFs,filename,snapshot)=>inspectPath(safeFs,filename,{kind:'file',read:true,snapshot});

export function renameCompositeProfile(bytes,platform,role,revision){
 if(typeof revision!=='string'||!/^[A-Za-z0-9._-]{1,128}$/.test(revision))fail('Composite revision cannot be tagged');
 const suffix=role.slice(4),old=platform==='codex'?`arc_${suffix}`:`arc-${suffix}`,next=platform==='codex'?`arc_routing_${suffix}`:`arc-routing-${suffix}`;
 const text=bytes.toString('utf8'),pattern=platform==='codex'?new RegExp(`^name[ \\t]*=[ \\t]*["']${old}["']([ \\t]*(?:#[^\\r\\n]*)?)(\\r?)$`,'m'):new RegExp(`^name: ${old}(\\r?)$`,'m');
 const matches=[...text.matchAll(new RegExp(pattern.source,'gm'))];if(matches.length!==1)fail('Cannot identify the managed composite profile name');
 const renamed=platform==='codex'?text.replace(pattern,(_match,comment,cr)=>`name = "${next}"${comment}${cr}`):text.replace(pattern,(_match,cr)=>`name: ${next}${cr}`);
 return Buffer.from(tagDescription(renamed,platform,revision));
}

/** Only the header (before developer_instructions or the closing frontmatter fence) is searched, so instruction text cannot be mistaken for a description. */
function tagDescription(text,platform,revision){
 const tag=revisionTag(revision),lines=text.split('\n'),codex=platform==='codex',end=lines.findIndex((line,index)=>codex?/^developer_instructions[ \t]*=/.test(line):index>0&&line.replace(/\r$/,'')==='---'),limit=end<0?lines.length:end;
 const pattern=codex?/^(description[ \t]*=[ \t]*"(?:[^"\\]|\\.)*)("[ \t]*(?:#[^\r\n]*)?\r?)$/:/^(description: .*?)(\r?)$/,hits=[];
 for(let i=0;i<limit;i++)if(/^description[ \t]*[=:]/.test(lines[i]))hits.push(i);
 const match=hits.length===1?pattern.exec(lines[hits[0]]):null;if(!match)fail('Composite revision cannot be tagged');
 lines[hits[0]]=`${match[1]} ${tag}${match[2]}`;
 return lines.join('\n');
}

/** Inspect only ARC-owned composite paths; existing unknown files are never replaced. */
export function prepareCompositeFiles({context,targets,config,profileInputs,modelConfigs}){
 assertVerifiedInstallMode({safeFs:context.safeFs,targets});
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
   desired[platform][role]=renameCompositeProfile(value,platform,role,config.revision);
  }
 }
 if(previous&&!Object.values(markers).some(Boolean))fail('Existing composite configuration has no ownership marker');
 const standaloneRemovals=[],residualPaths=[];
 for(const platform of ['codex','claude'])for(const role of ROUTING_ROLES){const found=inspectStandaloneProfile({safeFs:context.safeFs,target:targets[platform],role,snapshot});if(found.owned)standaloneRemovals.push(found.path);else if(found.exists)residualPaths.push(found.path);}
 const managedPaths=[...standaloneRemovals,active,...['codex','claude'].flatMap(platform=>[markerPath(targets[platform]),...ROUTING_ROLES.map(role=>profilePath(targets[platform],role))])];
 return {target:targets.codex,targets,config,bytes,snapshot,managedPaths,externalPaths:[],desired,existingProfiles,standaloneRemovals,residualPaths};
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

/** A non-terminal bridge lease still owns a running or unverified child, so composite settings cannot change under it. Native leases never block. */
async function assertNoActiveBridgeDispatch(codexHome){
 let leases;
 try{leases=await listLeases(codexHome);}
 catch(cause){const error=new TargetConfigurationError('Dispatch leases cannot be read; composite settings are not published',{cause});error.activation='held';error.activeDispatches=null;throw error;}
 const active=leases.filter(lease=>lease.route==='bridge'&&NON_TERMINAL_STATES.includes(lease.state)).map(lease=>lease.dispatchId);
 if(active.length){const error=new TargetConfigurationError('Active bridge dispatches block composite publication; finish or cancel them first');error.activation='held';error.activeDispatches=active;throw error;}
}
/** Publication is serialized with T2's preflight; all execution paths remain held. */
export async function publishCompositeFiles({context,prepared}){
 let release,published=false,publication,failure,failed=false;const {targets,config,bytes}=prepared;
 try{
  release=await acquireRoleRoutingLock(targets.codex.home);
  await assertNoActiveBridgeDispatch(targets.codex.home);
  assertPlanSnapshot(prepared,{safeFs:context.safeFs});
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
  const specs=[...(prepared.modelWrites??[]),...(prepared.standaloneRemovals??[]).map(path=>({path,remove:true}))];
  for(const platform of ['codex','claude'])for(const role of ROUTING_ROLES){const filename=profilePath(targets[platform],role),content=prepared.desired[platform][role];if(content)specs.push({path:filename,bytes:content});else if(prepared.existingProfiles[platform][role])specs.push({path:filename,remove:true});}
  for(const platform of ['codex','claude'])specs.push({path:markerPath(targets[platform]),bytes:Buffer.from(JSON.stringify(markers[platform],null,2)+'\n')});
  specs.push({path:activePath(targets),bytes});
  const hooks={...context.hooks,fault:event=>{if(event.phase==='before-publish'&&event.path===activePath(targets))assertPlanSnapshot({snapshot:runtimeSnapshot},{safeFs:context.safeFs});context.hooks?.fault?.(event);}};
  let result;try{result=applyTransaction(prepared,{safeFs:context.safeFs,signal:context.signal,hooks,specs});}catch(error){error.activation=error.rollback==='restored'?'held':'unknown';throw error;}
  published=true;publication={published:true,revision:config.revision,residualPaths:[...(prepared.residualPaths??[]),...result.residualPaths],cleanupError:result.cleanupError};
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

/** Restore standalone profiles and remove verified routing files in one transaction. */
export function prepareCompositeDeactivation({context,targets,payload}){
 const snapshot=new Map();assertVerifiedInstallMode({safeFs:context.safeFs,targets,snapshot});
 const removals=[],writes=[],residualPaths=[],externalPaths=[];
 for(const platform of ['codex','claude']){
  const target=targets[platform],owned=inspectCompositeRemoval({target,safeFs:context.safeFs,activeConfigPath:activePath(targets),snapshot});removals.push(...owned.removals);
  const arc=path.join(target.home,'skills/arc');if(!inspectPath(context.safeFs,arc,{kind:'directory',snapshot}).exists)continue;
  const inputs={};for(const name of ['models.toml','settings.toml']){const filename=path.join(arc,name),found=read(context.safeFs,filename,snapshot);if(!found.exists)fail(`Installed settings missing: ${filename}`);inputs[name]=found.bytes;externalPaths.push(filename);}
  const profiles=renderStandaloneProfiles({payload,target,modelConfig:loadModelConfig(inputs['models.toml'],platform),language:parseLanguage(inputs['settings.toml']).language});
  for(const role of ROUTING_ROLES){const found=inspectStandaloneProfile({safeFs:context.safeFs,target,role,snapshot});if(found.exists&&!found.owned){residualPaths.push(found.path);continue;}writes.push({path:found.path,bytes:profiles.get(path.basename(found.path))});}
 }
 return{target:targets.codex,targets,snapshot,managedPaths:[...new Set([...removals,...writes.map(item=>item.path)])],externalPaths,removals:[...new Set(removals)],writes,residualPaths};
}
export async function publishCompositeDeactivation({context,prepared}){
 let release,result,failure;
 try{
  release=await acquireRoleRoutingLock(prepared.targets.codex.home);await assertNoActiveBridgeDispatch(prepared.targets.codex.home);
  assertPlanSnapshot(prepared,{safeFs:context.safeFs});assertVerifiedInstallMode({safeFs:context.safeFs,targets:prepared.targets});
  const applied=applyTransaction(prepared,{safeFs:context.safeFs,signal:context.signal,hooks:context.hooks,specs:[...prepared.removals.map(path=>({path,remove:true})),...prepared.writes]});
  result={residualPaths:[...prepared.residualPaths,...applied.residualPaths],cleanupError:applied.cleanupError};
 }catch(error){failure=error;}
 let released=true;if(release)try{released=await release();}catch{released=false;}
 if(!released){const lockPath=path.join(prepared.targets.codex.home,'arc-role-platform-routing.lock');failure??=new TargetConfigurationError('Composite publication lock ownership could not be verified');failure.lockReleaseFailed=true;failure.residualPaths=[...new Set([...(failure.residualPaths??[]),...(result?.residualPaths??[]),lockPath])];if(result?.cleanupError)failure.cleanupError=result.cleanupError;}
 if(failure)throw failure;return result;
}
