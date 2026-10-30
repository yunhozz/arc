import os from 'node:os';
import {detectNativeCli} from '../installer/native-cli.mjs';
import {fileURLToPath} from 'node:url';
import {resolveTarget} from '../installer/targets.mjs';
import {buildInstallPlan,validatePlanSet} from '../installer/plan.mjs';
import {verifyPayload} from '../installer/manifest.mjs';
import {buildPresetPlan,switchPresetTargets} from '../installer/preset.mjs';
import {buildUninstallPlan,uninstallTargets} from '../installer/uninstall.mjs';
import {installTargets} from '../installer/install.mjs';
import {attachShellCompletionCleanup} from '../installer/shell-completion.mjs';
import {inspectGlobalArc} from '../npm/context.mjs';
import {uninstallGlobal,sameGlobalArc} from '../npm/uninstall.mjs';
/** @typedef {{packageRoot:string,userHome:string,cwd:string,env:object,safeFs:object,signal?:AbortSignal}} ManagementContext */
/** @typedef {{kind:string,plans:object[],options:object}} PreparedOperation */
/** @typedef {{code:number,exitSession:boolean,results:object[],interrupted:boolean}} OperationResult */
export async function createManagementContext(options={}){
 let safeFs=options.safeFs;if(!safeFs){const[{loadNative},{openRoot}]=await Promise.all([import('../safe-fs/native.mjs'),import('../safe-fs/index.mjs')]);const native=loadNative();safeFs={openRoot:p=>openRoot(p,{native})};}
 return{packageRoot:fileURLToPath(new URL('../../',import.meta.url)),userHome:os.homedir(),cwd:process.cwd(),env:process.env,...options,safeFs};
}
export async function prepareOperation(context,options,{selections=[]}={}){
 if(options.kind==='update'){const{prepareUpdate}=await import('./update.mjs');return prepareUpdate(context);}
 if(!['install','preset','uninstall'].includes(options.kind))throw Object.assign(Error('Unknown management operation'),{code:'ARC_CLI_INPUT'});
 if(options.kind==='uninstall')options={...options,removeCli:options.removeCli!==false};
 const platforms=options.target==='all'?['codex','claude']:[options.target],payload=options.kind==='install'?verifyPayload(context):null;
 const nativeCli=options.kind==='install'&&!options.skipGlobal&&platforms.includes('codex')?await detectNativeCli({platform:'codex',env:context.env,cwd:context.cwd}):undefined;
 const plans=platforms.map(platform=>{const target=resolveTarget(platform,context),selection=selections.find(item=>item.target.platform===platform&&item.target.home===target.home);if(options.kind==='preset')return buildPresetPlan({target,preset:options.preset,safeFs:context.safeFs,customRoles:options.customRoles,verifiedCatalog:options.verifiedCatalog});if(options.kind==='uninstall')return buildUninstallPlan({target,safeFs:context.safeFs,skipGlobal:options.skipGlobal,removeCompletion:options.removeCli!==false});return buildInstallPlan({payload,target,nativeCli:platform==='codex'?nativeCli:undefined,limitsPreview:selection?.preview,languagePreview:selection?.languagePreview,preset:options.preset,customRoles:options.customRoles,preservedCustomRoles:options.preservedCustomRoles,verifiedCatalog:options.verifiedCatalog,language:options.language,skipGlobal:options.skipGlobal,safeFs:context.safeFs,limits:{...(options.maxTotalSubagents===undefined?{}:{max_total_subagents:options.maxTotalSubagents}),...(options.maxConcurrentSubagents===undefined?{}:{max_concurrent_subagents:options.maxConcurrentSubagents})},concurrentExplicit:options.maxConcurrentSubagents!==undefined||Boolean(options.concurrentSelected)});});
 if(options.kind==='install')attachShellCompletionCleanup(plans,context);
 // Uninstall plans initially share the completion snapshot; its executor assigns one owner.
 if(options.kind!=='uninstall')validatePlanSet(plans);
 const globalArc=options.kind==='uninstall'&&options.removeCli!==false?await(context.inspectGlobalArc??inspectGlobalArc)({env:context.env,cwd:context.cwd,runNpm:context.runNpm}):undefined;
 return{kind:options.kind,plans,options:{...options},...(globalArc?{globalArc}:{})};
}
export function operationResult(result,successStatuses=['installed']){return{...result,code:result.interrupted?130:result.results.every(item=>successStatuses.includes(item.status)&&!item.error)?0:1,exitSession:false};}
export async function executeOperation(context,prepared){
 if(prepared.kind==='update'){const{executeUpdate}=await import('./update.mjs');return executeUpdate(context,prepared);}
 const options={safeFs:context.safeFs,signal:context.signal,hooks:context.hooks};
 if(prepared.kind==='install')return operationResult(await installTargets(prepared.plans,options));
 if(prepared.kind==='preset')return operationResult(await switchPresetTargets(prepared.plans,options),['updated','unchanged']);
 if(prepared.kind==='uninstall'){
  if(prepared.options?.removeCli===false)return operationResult(await uninstallTargets(prepared.plans,options),['uninstalled']);
  let result;
  try{
   const current=await(context.inspectGlobalArc??inspectGlobalArc)({context:prepared.globalArc,env:context.env,cwd:context.cwd,runNpm:context.runNpm});
   if(!sameGlobalArc(prepared.globalArc,current))throw Error('Global ARC installation changed; prepare uninstall again');
   result=operationResult(await uninstallTargets(prepared.plans,options),['uninstalled']);
   if(result.code!==0||context.signal?.aborted)return{...result,code:context.signal?.aborted?130:result.code,cli:{status:'skipped'}};
   const cli=await(context.uninstallGlobal??uninstallGlobal)({context:prepared.globalArc,env:context.env,cwd:context.cwd,signal:context.signal,runNpm:context.runNpm});
   return{...result,code:cli.code??(cli.packageStatus==='failed'?1:0),interrupted:result.interrupted||Boolean(cli.interrupted),exitSession:Boolean(cli.started),cli:{...cli,status:cli.packageStatus},stdout:cli.stdout,stderr:cli.stderr};
  }catch(error){return{...(result??{results:[],interrupted:false}),code:context.signal?.aborted?130:1,exitSession:false,cli:{status:'skipped'},error};}
 }
 throw Object.assign(Error('Unknown prepared operation'),{code:'ARC_CLI_INPUT'});
}
