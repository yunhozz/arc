import {readInstallMode,assertVerifiedInstallMode} from '../installer/install-mode.mjs';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {resolveTarget,resolveTargets} from '../installer/targets.mjs';
import {installerRegistryOf,sortByAnchor,mixedLabel} from '../platforms/index.mjs';
import {platformAvailability} from '../platforms/availability.mjs';
import {buildInstallPlan,renderStandaloneProfiles,validatePlanSet} from '../installer/plan.mjs';
import {verifyPayload} from '../installer/manifest.mjs';
import {buildPresetPlan,switchPresetTargets} from '../installer/preset.mjs';
import {buildUninstallPlan,uninstallTargets} from '../installer/uninstall.mjs';
import {installTargets} from '../installer/install.mjs';
import {attachShellCompletionCleanup} from '../installer/shell-completion.mjs';
import {inspectGlobalArc} from '../npm/context.mjs';
import {uninstallGlobal,sameGlobalArc} from '../npm/uninstall.mjs';
import {collectStatus} from './status.mjs';
import {loadModelConfig,serializeModelConfig} from '../models/index.mjs';
import {readModelFileVersion} from '../models/config.mjs';
import {buildRoleRoutingConfig} from '../runtime/role-routing-config.mjs';
import {loadStaticModelCatalog,assertCompositeCatalogRoles} from '../models/static-catalog.mjs';
import {prepareCompositeFiles,publishCompositeFiles,readCompositeRoutingConfig,prepareCompositeDeactivation,publishCompositeDeactivation} from '../installer/role-routing.mjs';
import {inspectPath,sameObjectIdentity,TargetConfigurationError} from '../installer/targets.mjs';
import {assertPlanSnapshot} from '../installer/transaction.mjs';
import {acquireRoleRoutingLock} from '../runtime/role-routing.mjs';
import {parseLanguage} from '../installer/language.mjs';
import path from 'node:path';
/** @typedef {{packageRoot:string,userHome:string,cwd:string,env:object,safeFs:object,signal?:AbortSignal}} ManagementContext */
/** @typedef {{kind:string,plans:object[],options:object}} PreparedOperation */
/** @typedef {{code:number,exitSession:boolean,results:object[],interrupted:boolean}} OperationResult */
export async function createManagementContext(options={}){
 let safeFs=options.safeFs;if(!safeFs){const[{loadNative},{openRoot}]=await Promise.all([import('../safe-fs/native.mjs'),import('../safe-fs/index.mjs')]);const native=loadNative();safeFs={openRoot:p=>openRoot(p,{native})};}
 return{packageRoot:fileURLToPath(new URL('../../',import.meta.url)),userHome:os.homedir(),cwd:process.cwd(),env:process.env,...options,safeFs};
}
export async function prepareOperation(context,options,{selections=[]}={}){
 if(options.target==='composite')return prepareCompositeOperation(context,options);
 if(options.kind==='update'){const{prepareUpdate}=await import('./update.mjs');return prepareUpdate(context);}
 if(!['install','preset','uninstall'].includes(options.kind))throw Object.assign(Error('Unknown management operation'),{code:'ARC_CLI_INPUT'});
 const registry=installerRegistryOf(context),resolved=resolveTargets(context),targets=resolved.targets;
 const modeOptions={safeFs:context.safeFs,...resolved,platforms:registry};
 if(registry.isPlatformId(options.target)||(options.target==='all'&&options.kind!=='uninstall')){
  const mode=readInstallMode(modeOptions);
  if(mode.mode==='unverified')assertVerifiedInstallMode(modeOptions);
  if(mode.mode==='composite'){if(options.target==='all'||!options.switchFromComposite)throw new TargetConfigurationError('Mixed routing is active; confirm the switch first');return{kind:'switch',operation:options.kind,deactivation:prepareCompositeDeactivation({context,targets,payload:verifyPayload(context)}),options:{...options}};}
 }
 if(options.kind==='uninstall')options={...options,removeCli:options.removeCli!==false};
 let compositeActivePath;if(options.kind==='uninstall'){const mode=readInstallMode(modeOptions),anchor=mode.mode==='composite'?mode.anchor:registry.byAnchorOrder().find(descriptor=>targets[descriptor.runtime.id])?.runtime.id;if(anchor)compositeActivePath=path.join(targets[anchor].home,'arc-role-platform-routing.json');}
 const platforms=options.target==='all'?(options.kind==='uninstall'?registry.byDisplayOrder():registry.byAnchorOrder()).map(descriptor=>descriptor.runtime.id):[options.target],payload=options.kind==='install'?verifyPayload(context):null;
 const plans=platforms.map(platform=>{const target=resolveTarget(platform,context),selection=selections.find(item=>item.target.platform===platform&&item.target.home===target.home);if(options.kind==='preset')return buildPresetPlan({platforms:registry,runtimePlatforms:context.runtimePlatforms,loadPayload:()=>verifyPayload(context),target,roles:options.roles,safeFs:context.safeFs,verifiedCatalog:options.verifiedCatalog});if(options.kind==='uninstall')return buildUninstallPlan({platforms:registry,runtimePlatforms:context.runtimePlatforms,target,safeFs:context.safeFs,skipGlobal:options.skipGlobal,removeCompletion:options.removeCli!==false,compositeActivePath});return buildInstallPlan({platforms:registry,runtimePlatforms:context.runtimePlatforms,payload,target,limitsPreview:selection?.preview,languagePreview:selection?.languagePreview,roles:options.roles,verifiedCatalog:options.verifiedCatalog,language:options.language,skipGlobal:options.skipGlobal,safeFs:context.safeFs,limits:{...(options.maxTotalSubagents===undefined?{}:{max_total_subagents:options.maxTotalSubagents}),...(options.maxConcurrentSubagents===undefined?{}:{max_concurrent_subagents:options.maxConcurrentSubagents})},concurrentExplicit:options.maxConcurrentSubagents!==undefined||Boolean(options.concurrentSelected)});});
 if(options.kind==='install')attachShellCompletionCleanup(plans,context);
 // Uninstall plans initially share the completion snapshot; its executor assigns one owner.
 if(options.kind!=='uninstall')validatePlanSet(plans);
 const globalArc=options.kind==='uninstall'&&options.removeCli!==false?await(context.inspectGlobalArc??inspectGlobalArc)({env:context.env,cwd:context.cwd,runNpm:context.runNpm}):undefined;
 return{kind:options.kind,plans,options:{...options},...(compositeActivePath?{compositeActivePath}:{}),...(globalArc?{globalArc}:{})};
}
const compositeTargets=context=>resolveTargets(context).targets;
function installState(context){return readInstallMode({safeFs:context.safeFs,...resolveTargets(context),platforms:installerRegistryOf(context)});}
async function assertCompositeAvailability(context,config,statuses){
 const registry=installerRegistryOf(context),ids=config.platforms,results=await Promise.all(ids.map(platform=>loadStaticModelCatalog(platform,{signal:context.signal,platforms:registry}))),catalogs={};
 for(const [index,platform]of ids.entries()){
  const availability=platformAvailability(platform,{status:statuses.find(status=>status.platform===platform),catalog:results[index],usage:Object.values(config.roles).some(role=>role.platform===platform)?'role':'host',registry});
  if(!availability.selectable)throw new TargetConfigurationError(`${platform}: ${availability.reason==='not_installed'?'Not Available':availability.reason==='unauthorized'?'Unauthorized':'Incomplete'}`);
  catalogs[platform]=results[index].catalog;
 }
 try{assertCompositeCatalogRoles({roles:config.roles,catalogs,platforms:registry});}catch(error){throw new TargetConfigurationError(error.message);}
}
export function currentInstallState(context){const {mode,platforms,anchor}=installState(context);return{mode,platforms,anchor};}
export function currentInstallMode(context){return currentInstallState(context).mode;}
export function readCompositeConfig(context){return readCompositeRoutingConfig(context,compositeTargets(context));}
export async function prepareCompositeOperation(context,options){
 if(!['install','preset'].includes(options.kind))throw new TargetConfigurationError('Unsupported composite operation');
 const registry=installerRegistryOf(context),resolved=resolveTargets(context),targets=resolved.targets,mode=assertVerifiedInstallMode({safeFs:context.safeFs,...resolved,platforms:registry});
 const ids=[...new Set([...(options.platforms??(mode.mode==='composite'?mode.platforms:['codex','claude'])),...Object.values(options.config.roles).map(role=>role.platform)])];
 for(const id of ids)if(!registry.isPlatformId(id))throw new TargetConfigurationError(`Unknown platform: ${id}`);
 if(ids.length<2)throw new TargetConfigurationError('Mixed routing requires at least two platforms');
 const platforms=sortByAnchor(ids,registry),anchor=platforms[0],config=buildRoleRoutingConfig({revision:options.config.revision,platforms,roles:options.config.roles},context),statuses=await collectStatus(context);
 await assertCompositeAvailability(context,config,statuses);
 for(let i=0;i<platforms.length;i++)for(let j=0;j<i;j++){const a=targets[platforms[i]].home,b=targets[platforms[j]].home;if(a===b||a.startsWith(b+path.sep)||b.startsWith(a+path.sep))throw new TargetConfigurationError('Selected platform homes overlap');}
 if(options.kind==='preset'&&statuses.some(status=>platforms.includes(status.platform)&&status.state!=='installed'))throw new TargetConfigurationError('Both ARC installations are required to change composite settings');
 const plans=[],profileInputs={},modelConfigs={},sourceSnapshot=new Map(),externalPaths=[];
 if(options.kind==='install'){
  const payload=verifyPayload(context);
  for(const platform of platforms){
   const target=targets[platform],status=statuses.find(item=>item.platform===platform),existing=new Map(),modelFile=inspectPath(context.safeFs,path.join(target.home,'skills/arc/models.toml'),{kind:'file',read:true,snapshot:existing}),languageFile=inspectPath(context.safeFs,path.join(target.home,'skills/arc/settings.toml'),{kind:'file',read:true,snapshot:existing});
   const modelConfig=loadModelConfig(modelFile.exists?modelFile.bytes:payload.modelInputs[platform].models,platform,context),language=options.settings?.language??(languageFile.exists?parseLanguage(languageFile.bytes).language:'en');
   const plan=buildInstallPlan({platforms:registry,runtimePlatforms:context.runtimePlatforms,payload,target,profiles:mode.mode==='composite'&&mode.platforms.includes(platform)?'omit':'write',modelConfig,language,safeFs:context.safeFs,limits:{...(options.settings?.maxTotalSubagents===undefined?{}:{max_total_subagents:options.settings.maxTotalSubagents}),...(options.settings?.maxConcurrentSubagents===undefined?{}:{max_concurrent_subagents:options.settings.maxConcurrentSubagents})},skipGlobal:options.settings?.skipGlobal??false,concurrentExplicit:Boolean(options.settings?.concurrentSelected)||options.settings?.maxConcurrentSubagents!==undefined});assertPlanSnapshot({snapshot:existing},{safeFs:context.safeFs});
   plans.push(plan);profileInputs[platform]=plan.generated.profiles;modelConfigs[platform]=modelConfig;
  }
  attachShellCompletionCleanup(plans,context);validatePlanSet(plans);
 }else for(const platform of platforms){
  const target=targets[platform],status=statuses.find(item=>item.platform===platform);modelConfigs[platform]=status.settings.modelConfig;profileInputs[platform]=new Map();
  profileInputs[platform]=renderStandaloneProfiles({platforms:registry,runtimePlatforms:context.runtimePlatforms,payload:verifyPayload(context),target,modelConfig:status.settings.modelConfig,language:status.settings.language});
  for(const name of ['models.toml','settings.toml']){const filename=path.join(target.home,'skills/arc',name);inspectPath(context.safeFs,filename,{kind:'file',read:true,snapshot:sourceSnapshot});externalPaths.push(filename);}
 }
 const files=prepareCompositeFiles({context,targets,platforms,anchor,config,profileInputs,modelConfigs,previous:mode.mode==='composite'?{platforms:mode.platforms,anchor:mode.anchor}:undefined});for(const item of sourceSnapshot)files.snapshot.set(...item);
 files.modelWrites=[];
 if(options.kind==='preset')for(const platform of platforms){
  const filename=path.join(targets[platform].home,'skills/arc/models.toml'),found=inspectPath(context.safeFs,filename,{kind:'file',read:true,snapshot:files.snapshot});
  if(found.exists&&readModelFileVersion(found.bytes)<3){files.modelWrites.push({path:filename,bytes:Buffer.from(serializeModelConfig(modelConfigs[platform],context))});files.managedPaths.push(filename);}
 }
 files.externalPaths.push(...externalPaths.filter(filename=>!files.modelWrites.some(write=>write.path===filename)));
 return {kind:'composite',operation:options.kind,plans,files,config,options:{target:'composite'},summary:['Composite configuration will be published only after all participating targets are ready.','Per-role execution support is reported by routing-status.']};
}
export async function executeCompositeOperation(context,prepared){
 const held={routeStatus:'held',supportStatus:'unverified',reason:'Per-role execution support is reported by routing-status.'};
 let result={results:[],interrupted:false},installationHeld;
 try{
  await assertCompositeAvailability(context,prepared.config,await collectStatus(context,{codexCheck:'local'}));
  assertPlanSnapshot(prepared.files,{safeFs:context.safeFs});
  const moving=prepared.files.previous&&prepared.files.previous.anchor!==prepared.files.anchor;
  if(moving)for(const plan of prepared.plans)assertPlanSnapshot(plan,{safeFs:context.safeFs});
  const ready=async({createdHomes=[]}={})=>{
  // Acquiring our locks changes home directory timestamps, but not its identity.
  if(moving)for(const plan of prepared.plans)if([prepared.files.previous.anchor,prepared.files.anchor].includes(plan.target.platform)){
   const home=plan.target.home,snapshot=new Map();inspectPath(context.safeFs,home,{kind:'directory',snapshot});
   const expected=plan.snapshot.get(home),actual=snapshot.get(home);
   if(!actual||!(expected?sameObjectIdentity(expected,actual):createdHomes.includes(home)))throw new TargetConfigurationError('Install home changed while acquiring mixed routing locks');
   plan.snapshot.set(home,snapshot.get(home));
  }
  if(prepared.operation==='install'){result=await installTargets(prepared.plans,{safeFs:context.safeFs,signal:context.signal,hooks:context.hooks,platforms:installerRegistryOf(context)});if(result.interrupted||result.results.some(item=>item.status!=='installed'||item.error)){installationHeld={...operationResult(result),activation:'held',support:held};throw new TargetConfigurationError('Participating installations are incomplete');}}
  if(prepared.operation==='install')for(const plan of prepared.plans)for(const name of plan.profileWrites.keys()){const filename=path.join(plan.target.home,'agents',name);inspectPath(context.safeFs,filename,{kind:'file',read:true,snapshot:prepared.files.snapshot});if(!prepared.files.standaloneRemovals.includes(filename)){prepared.files.standaloneRemovals.push(filename);prepared.files.managedPaths.push(filename);}}
  if(context.signal?.aborted){installationHeld={...operationResult({...result,interrupted:true}),activation:'held',support:held};throw new TargetConfigurationError('Install interrupted');}
  const statuses=await collectStatus(context,{codexCheck:'local'});await assertCompositeAvailability(context,prepared.config,statuses);if(prepared.operation!=='install'&&statuses.some(status=>prepared.config.platforms.includes(status.platform)&&status.state!=='installed'))throw new TargetConfigurationError('Both ARC installations must be complete before publication');
  };
  if(!moving)await ready();
  const publication=await publishCompositeFiles({context,prepared:prepared.files,...(moving?{beforePublish:ready}:{})});
  const history=moving?[`Dispatch history stays in ${prepared.files.targets[prepared.files.previous.anchor].home}/arc-role-dispatch.`]:[];
  return {...operationResult(result),code:publication.cleanupError?1:0,activation:'published',publication,support:held,...(publication.cleanupError?{error:publication.cleanupError}:{}),messages:[`${mixedLabel(prepared.config.platforms,installerRegistryOf(context))} activated.`,'After upgrading ARC, run Install / Update again.',...history,...(publication.residualPaths??[]).map(value=>'Residual path: '+value)]};
 }catch(error){if(installationHeld&&!error.lockReleaseFailed)return installationHeld;return {code:context.signal?.aborted?130:1,exitSession:false,interrupted:Boolean(context.signal?.aborted),results:result.results,activation:error.activation??'held',support:held,error,messages:[...(Array.isArray(error.activeDispatches)?[`${prepared.files.previous&&prepared.files.previous.anchor!==prepared.files.anchor?'Active dispatches':'Active bridge dispatches'}: ${error.activeDispatches.join(', ')}`]:[]),...(error.activation==='unknown'?['Configuration publication state is unknown; inspect the reported paths before retrying.']:[]),...(error.residualPaths??[]).map(value=>'Residual path: '+value)]};}
}
export function operationResult(result,successStatuses=['installed']){return{...result,code:result.interrupted?130:result.results.every(item=>successStatuses.includes(item.status)&&!item.error)?0:1,exitSession:false};}
async function uninstallPrepared(context,prepared,options){
 let release,result,error,home;
 try{if(prepared.plans.some(plan=>plan.compositeOwned)){home=path.dirname(prepared.compositeActivePath);release=await acquireRoleRoutingLock(home);}result=await uninstallTargets(prepared.plans,options);}catch(cause){error=cause;}
 const released=release?await release():true;if(error)throw error;
 if(!released){const failure=new TargetConfigurationError('Composite removal lock ownership could not be verified');return {...result,results:result.results.map((item,index)=>index?item:{...item,error:failure,residualPaths:[...item.residualPaths,path.join(home,'arc-role-platform-routing.lock')]})};}
 return result;
}
export async function executeOperation(context,prepared){
 if(prepared.kind==='switch'){
  let deactivation;const messages=[];
  try{deactivation=await publishCompositeDeactivation({context,prepared:prepared.deactivation});messages.push('Mixed routing turned off.',...deactivation.residualPaths.map(p=>'Residual path: '+p));if(deactivation.cleanupError)return{code:1,exitSession:false,interrupted:false,results:[],messages,error:deactivation.cleanupError};
   const next=await prepareOperation(context,{...prepared.options,switchFromComposite:false}),result=await executeOperation(context,next);return{...result,messages:[...messages,...(result.messages??[])]};
  }catch(error){return{code:context.signal?.aborted?130:1,exitSession:false,interrupted:Boolean(context.signal?.aborted),results:[],error,messages:[...messages,...(error.activeDispatches?[`Active bridge dispatches: ${error.activeDispatches.join(', ')}`]:[]),...(error.residualPaths??[]).map(p=>'Residual path: '+p)]};}
 }
 if(prepared.kind==='composite')return executeCompositeOperation(context,prepared);
 if(prepared.kind==='update'){const{executeUpdate}=await import('./update.mjs');return executeUpdate(context,prepared);}
 const options={safeFs:context.safeFs,signal:context.signal,hooks:context.hooks,platforms:installerRegistryOf(context)};
 if(prepared.kind==='install')return operationResult(await installTargets(prepared.plans,options));
 if(prepared.kind==='preset')return operationResult(await switchPresetTargets(prepared.plans,options),['updated','unchanged']);
 if(prepared.kind==='uninstall'){
  if(prepared.options?.removeCli===false)return operationResult(await uninstallPrepared(context,prepared,options),['uninstalled']);
  let result;
  try{
   const current=await(context.inspectGlobalArc??inspectGlobalArc)({context:prepared.globalArc,env:context.env,cwd:context.cwd,runNpm:context.runNpm});
   if(!sameGlobalArc(prepared.globalArc,current))throw Error('Global ARC installation changed; prepare uninstall again');
   result=operationResult(await uninstallPrepared(context,prepared,options),['uninstalled']);
   if(result.code!==0||context.signal?.aborted)return{...result,code:context.signal?.aborted?130:result.code,cli:{status:'skipped'}};
   const cli=await(context.uninstallGlobal??uninstallGlobal)({context:prepared.globalArc,env:context.env,cwd:context.cwd,signal:context.signal,runNpm:context.runNpm});
   return{...result,code:cli.code??(cli.packageStatus==='failed'?1:0),interrupted:result.interrupted||Boolean(cli.interrupted),exitSession:Boolean(cli.started),cli:{...cli,status:cli.packageStatus},stdout:cli.stdout,stderr:cli.stderr};
  }catch(error){return{...(result??{results:[],interrupted:false}),code:context.signal?.aborted?130:1,exitSession:false,cli:{status:'skipped'},error};}
 }
 throw Object.assign(Error('Unknown prepared operation'),{code:'ARC_CLI_INPUT'});
}
