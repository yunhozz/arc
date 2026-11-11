import {readInstallMode,assertVerifiedInstallMode} from '../installer/install-mode.mjs';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {resolveTarget} from '../installer/targets.mjs';
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
import {validateRoleRoutingConfig} from '../runtime/role-routing-config.mjs';
import {loadStaticModelCatalog,assertCompositeCatalogRoles} from '../models/static-catalog.mjs';
import {prepareCompositeFiles,publishCompositeFiles,readCompositeRoutingConfig,prepareCompositeDeactivation,publishCompositeDeactivation} from '../installer/role-routing.mjs';
import {inspectPath,TargetConfigurationError} from '../installer/targets.mjs';
import {assertPlanSnapshot} from '../installer/transaction.mjs';
import {acquireRoleRoutingLock} from '../runtime/role-routing.mjs';
import {parseLanguage} from '../installer/language.mjs';
import path from 'node:path';
import {cooperativeVersions} from '../runtime/bootstrap.mjs';
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
 if(['codex','claude'].includes(options.target)){
  const targets=compositeTargets(context),mode=readInstallMode({safeFs:context.safeFs,targets});
  if(mode.mode==='unverified')assertVerifiedInstallMode({safeFs:context.safeFs,targets});
  if(mode.mode==='composite'){if(!options.switchFromComposite)throw new TargetConfigurationError('Claude & Codex is active; confirm the switch first');return{kind:'switch',operation:options.kind,deactivation:prepareCompositeDeactivation({context,targets,payload:verifyPayload(context)}),options:{...options}};}
 }
 if(options.kind==='uninstall')options={...options,removeCli:options.removeCli!==false};
 let compositeActivePath;if(options.kind==='uninstall')try{compositeActivePath=path.join(resolveTarget('codex',context).home,'arc-role-platform-routing.json');}catch{}
 const platforms=options.target==='all'?(options.kind==='uninstall'?['claude','codex']:['codex','claude']):[options.target],payload=options.kind==='install'?verifyPayload(context):null;
 const plans=platforms.map(platform=>{const target=resolveTarget(platform,context),selection=selections.find(item=>item.target.platform===platform&&item.target.home===target.home);if(options.kind==='preset')return buildPresetPlan({target,roles:options.roles,safeFs:context.safeFs,verifiedCatalog:options.verifiedCatalog});if(options.kind==='uninstall')return buildUninstallPlan({target,safeFs:context.safeFs,skipGlobal:options.skipGlobal,removeCompletion:options.removeCli!==false,compositeActivePath});return buildInstallPlan({payload,target,limitsPreview:selection?.preview,languagePreview:selection?.languagePreview,roles:options.roles,verifiedCatalog:options.verifiedCatalog,language:options.language,skipGlobal:options.skipGlobal,safeFs:context.safeFs,limits:{...(options.maxTotalSubagents===undefined?{}:{max_total_subagents:options.maxTotalSubagents}),...(options.maxConcurrentSubagents===undefined?{}:{max_concurrent_subagents:options.maxConcurrentSubagents})},concurrentExplicit:options.maxConcurrentSubagents!==undefined||Boolean(options.concurrentSelected)});});
 if(options.kind==='install')attachShellCompletionCleanup(plans,context);
 // Uninstall plans initially share the completion snapshot; its executor assigns one owner.
 if(options.kind!=='uninstall')validatePlanSet(plans);
 const globalArc=options.kind==='uninstall'&&options.removeCli!==false?await(context.inspectGlobalArc??inspectGlobalArc)({env:context.env,cwd:context.cwd,runNpm:context.runNpm}):undefined;
 return{kind:options.kind,plans,options:{...options},...(globalArc?{globalArc}:{})};
}
const compositeTargets=context=>Object.fromEntries(['codex','claude'].map(platform=>[platform,resolveTarget(platform,context)]));
function assertCompositeAvailability(statuses){
 for(const status of statuses)if(status.authentication?.authStatus!=='authenticated')throw new TargetConfigurationError(`${status.platform}: ${status.authentication?.authStatus==='unauthorized'?'Unauthorized':status.authentication?.reason==='cli_not_found'?'Not Available':'Incomplete'}`);
}
async function assertCompositeCatalog(config,signal){
 const platforms=['codex','claude'],results=await Promise.all(platforms.map(platform=>loadStaticModelCatalog(platform,{signal}))),catalogs={};
 for(const [index,platform] of platforms.entries()){if(results[index].status!=='ready')throw new TargetConfigurationError(`${platform} model catalog is unavailable or invalid`);catalogs[platform]=results[index].catalog;}
 try{assertCompositeCatalogRoles({roles:config.roles,catalogs});}catch(error){throw new TargetConfigurationError(error.message);}
}
export function currentInstallMode(context){return readInstallMode({safeFs:context.safeFs,targets:compositeTargets(context)}).mode;}
export function readCompositeConfig(context){return readCompositeRoutingConfig(context,compositeTargets(context));}
export async function prepareCompositeOperation(context,options){
 if(!['install','preset'].includes(options.kind))throw new TargetConfigurationError('Unsupported composite operation');
 const config=validateRoleRoutingConfig(options.config),targets=compositeTargets(context),mode=assertVerifiedInstallMode({safeFs:context.safeFs,targets}).mode,statuses=await collectStatus(context);assertCompositeAvailability(statuses);await assertCompositeCatalog(config,context.signal);
 if(targets.codex.home===targets.claude.home||targets.codex.home.startsWith(targets.claude.home+'/')||targets.claude.home.startsWith(targets.codex.home+'/'))throw new TargetConfigurationError('Selected platform homes overlap');
 if(options.kind==='preset'&&statuses.some(status=>status.state!=='installed'))throw new TargetConfigurationError('Both ARC installations are required to change composite settings');
 const plans=[],profileInputs={},modelConfigs={},sourceSnapshot=new Map(),externalPaths=[];
 if(options.kind==='install'){
  const payload=verifyPayload(context);
  for(const platform of ['codex','claude']){
   const target=targets[platform],status=statuses.find(item=>item.platform===platform),existing=new Map(),modelFile=inspectPath(context.safeFs,path.join(target.home,'skills/arc/models.toml'),{kind:'file',read:true,snapshot:existing}),languageFile=inspectPath(context.safeFs,path.join(target.home,'skills/arc/settings.toml'),{kind:'file',read:true,snapshot:existing});
   const modelConfig=loadModelConfig(modelFile.exists?modelFile.bytes:payload.modelInputs[platform].models,platform),language=options.settings?.language??(languageFile.exists?parseLanguage(languageFile.bytes).language:'en');
   const plan=buildInstallPlan({payload,target,profiles:mode==='composite'?'omit':'write',modelConfig,language,safeFs:context.safeFs,limits:{...(options.settings?.maxTotalSubagents===undefined?{}:{max_total_subagents:options.settings.maxTotalSubagents}),...(options.settings?.maxConcurrentSubagents===undefined?{}:{max_concurrent_subagents:options.settings.maxConcurrentSubagents})},skipGlobal:options.settings?.skipGlobal??false,concurrentExplicit:Boolean(options.settings?.concurrentSelected)||options.settings?.maxConcurrentSubagents!==undefined});assertPlanSnapshot({snapshot:existing},{safeFs:context.safeFs});
   plans.push(plan);profileInputs[platform]=plan.generated.profiles;modelConfigs[platform]=modelConfig;
  }
  attachShellCompletionCleanup(plans,context);validatePlanSet(plans);
 }else for(const platform of ['codex','claude']){
  const target=targets[platform],status=statuses.find(item=>item.platform===platform);modelConfigs[platform]=status.settings.modelConfig;profileInputs[platform]=new Map();
  profileInputs[platform]=renderStandaloneProfiles({payload:verifyPayload(context),target,modelConfig:status.settings.modelConfig,language:status.settings.language});
  for(const name of ['models.toml','settings.toml']){const filename=path.join(target.home,'skills/arc',name);inspectPath(context.safeFs,filename,{kind:'file',read:true,snapshot:sourceSnapshot});externalPaths.push(filename);}
 }
 const files=prepareCompositeFiles({context,targets,config,profileInputs,modelConfigs});for(const item of sourceSnapshot)files.snapshot.set(...item);
 files.modelWrites=[];
 if(options.kind==='preset')for(const platform of ['codex','claude']){
  const filename=path.join(targets[platform].home,'skills/arc/models.toml'),found=inspectPath(context.safeFs,filename,{kind:'file',read:true,snapshot:files.snapshot});
  if(found.exists&&readModelFileVersion(found.bytes)<3){files.modelWrites.push({path:filename,bytes:Buffer.from(serializeModelConfig(modelConfigs[platform]))});files.managedPaths.push(filename);}
 }
 files.externalPaths.push(...externalPaths.filter(filename=>!files.modelWrites.some(write=>write.path===filename)));
 return {kind:'composite',operation:options.kind,plans,files,config,options:{target:'composite'},summary:['Composite configuration will be published only after both targets are ready.','Per-role execution support is reported by routing-status.']};
}
export async function executeCompositeOperation(context,prepared){
 const held={routeStatus:'held',supportStatus:'unverified',reason:'Per-role execution support is reported by routing-status.'};
 let result={results:[],interrupted:false};
 try{
  assertCompositeAvailability(await collectStatus(context,{codexCheck:'local'}));
  const refreshCatalog=()=>assertCompositeCatalog(prepared.config,context.signal);
  await refreshCatalog();
  assertPlanSnapshot(prepared.files,{safeFs:context.safeFs});
  if(prepared.operation==='install'){result=await installTargets(prepared.plans,{safeFs:context.safeFs,signal:context.signal,hooks:context.hooks});if(result.interrupted||result.results.some(item=>item.status!=='installed'||item.error))return {...operationResult(result),activation:'held',support:held};}
  if(prepared.operation==='install')for(const plan of prepared.plans)for(const name of plan.profileWrites.keys()){const filename=path.join(plan.target.home,'agents',name);inspectPath(context.safeFs,filename,{kind:'file',read:true,snapshot:prepared.files.snapshot});if(!prepared.files.standaloneRemovals.includes(filename)){prepared.files.standaloneRemovals.push(filename);prepared.files.managedPaths.push(filename);}}
  if(context.signal?.aborted)return {...operationResult({...result,interrupted:true}),activation:'held',support:held};
  const statuses=await collectStatus(context,{codexCheck:'local'});assertCompositeAvailability(statuses);if(prepared.operation!=='install'&&statuses.some(status=>status.state!=='installed'))throw new TargetConfigurationError('Both ARC installations must be complete before publication');await refreshCatalog();
  const publication=await publishCompositeFiles({context,prepared:prepared.files});
  return {...operationResult(result),code:publication.cleanupError?1:0,activation:'published',publication,support:held,...(publication.cleanupError?{error:publication.cleanupError}:{}),messages:['Composite configuration activated.','Role execution: per-role status via routing-status.',`After an ARC upgrade that changes the cooperative runtime version (now ${(await cooperativeVersions()).runtime}), run Install / Update again to refresh installed markers.`,...(publication.residualPaths??[]).map(value=>'Residual path: '+value)]};
 }catch(error){return {code:context.signal?.aborted?130:1,exitSession:false,interrupted:Boolean(context.signal?.aborted),results:result.results,activation:error.activation??'held',support:held,error,messages:[...(Array.isArray(error.activeDispatches)?[`Active bridge dispatches: ${error.activeDispatches.join(', ')}`]:[]),...(error.activation==='unknown'?['Configuration publication state is unknown; inspect the reported paths before retrying.']:[]),...(error.residualPaths??[]).map(value=>'Residual path: '+value)]};}
}
export function operationResult(result,successStatuses=['installed']){return{...result,code:result.interrupted?130:result.results.every(item=>successStatuses.includes(item.status)&&!item.error)?0:1,exitSession:false};}
async function uninstallPrepared(context,prepared,options){
 let release,result,error,home;
 try{if(prepared.plans.some(plan=>plan.compositeOwned)){home=resolveTarget('codex',context).home;release=await acquireRoleRoutingLock(home);}result=await uninstallTargets(prepared.plans,options);}catch(cause){error=cause;}
 const released=release?await release():true;if(error)throw error;
 if(!released){const failure=new TargetConfigurationError('Composite removal lock ownership could not be verified');return {...result,results:result.results.map((item,index)=>index?item:{...item,error:failure,residualPaths:[...item.residualPaths,path.join(home,'arc-role-platform-routing.lock')]})};}
 return result;
}
export async function executeOperation(context,prepared){
 if(prepared.kind==='switch'){
  let deactivation;const messages=[];
  try{deactivation=await publishCompositeDeactivation({context,prepared:prepared.deactivation});messages.push('Claude & Codex turned off.',...deactivation.residualPaths.map(p=>'Residual path: '+p));if(deactivation.cleanupError)return{code:1,exitSession:false,interrupted:false,results:[],messages,error:deactivation.cleanupError};
   const next=await prepareOperation(context,{...prepared.options,switchFromComposite:false}),result=await executeOperation(context,next);return{...result,messages:[...messages,...(result.messages??[])]};
  }catch(error){return{code:context.signal?.aborted?130:1,exitSession:false,interrupted:Boolean(context.signal?.aborted),results:[],error,messages:[...messages,...(error.activeDispatches?[`Active bridge dispatches: ${error.activeDispatches.join(', ')}`]:[]),...(error.residualPaths??[]).map(p=>'Residual path: '+p)]};}
 }
 if(prepared.kind==='composite')return executeCompositeOperation(context,prepared);
 if(prepared.kind==='update'){const{executeUpdate}=await import('./update.mjs');return executeUpdate(context,prepared);}
 const options={safeFs:context.safeFs,signal:context.signal,hooks:context.hooks};
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
