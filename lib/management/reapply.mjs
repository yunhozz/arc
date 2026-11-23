import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {TargetConfigurationError} from '../installer/targets.mjs';
import {assertPlanSnapshot} from '../installer/transaction.mjs';
import {loadStaticModelCatalog} from '../models/static-catalog.mjs';
import {installerRegistryOf,platformLabel} from '../platforms/index.mjs';
import {deriveInstallPlan} from '../tui/derive-install-plan.mjs';
import {initializeInstallDraft,installPrepareOptions,installSettingsDraft,loadInstallCatalog,loadRoleDefaults} from '../tui/setup.mjs';
import {createManagementContext,currentInstallState,executeOperation,prepareOperation,readCompositeConfig} from './operations.mjs';
import {collectStatus} from './status.mjs';

export async function buildReapplyRequest({context,installState,statuses,target,currentConfig,loadCatalog}){
 const registry=installerRegistryOf(context),draft={registry};
 if(installState.mode==='composite'&&!currentConfig)throw new TargetConfigurationError('Mixed routing configuration is missing');
 await initializeInstallDraft({
  draft,installState,currentConfig,registry,initialTarget:()=>target,
  loadRoleDefaults:id=>loadRoleDefaults({context,statuses,target:id}),
 });
 const plan=deriveInstallPlan({roles:draft.roles,hosts:draft.hosts,current:installState,registry});
 if(plan.rule!==(target===undefined?'D1-d':'D1-a'))throw new TargetConfigurationError('Configure Apply requires confirmation');
 draft.settings=installSettingsDraft(statuses,plan.platforms);
 const loader=loadCatalog??(id=>loadStaticModelCatalog(id,{signal:context.signal,platforms:registry}));
 const catalogs={};
 for(const id of plan.platforms){
  const result=await loadInstallCatalog(id,{loadCatalog:loader,registry});
  context.signal?.throwIfAborted();
  if(result.status!=='ready')throw new TargetConfigurationError('Model catalog unavailable for '+platformLabel(id,registry));
  catalogs[id]=result.catalog;
 }
 return installPrepareOptions(plan,draft,catalogs);
}

function assertDraftSnapshot(context,statuses,platforms){
 const snapshot=new Map();
 for(const {platform,target,snapshot:source} of statuses){
  if(!source||!platforms.includes(platform))continue;
  for(const name of ['models.toml','settings.toml','limits.toml']){
   const filename=path.join(target.home,'skills/arc',name);
   snapshot.set(filename,source.get(filename));
  }
 }
 assertPlanSnapshot({snapshot},{safeFs:context.safeFs});
}

async function applyConfiguration(context,options){
 const {installState,statuses,target,currentConfig}=options;
 try{
  context.signal?.throwIfAborted();
  const request=await buildReapplyRequest({context,...options});
  const prepared=await prepareOperation(context,request);
  if(prepared.kind!==(target===undefined?'composite':'install'))throw new TargetConfigurationError('Configure Apply requires confirmation');
  // Catalog and auth checks can yield before the installer takes its own snapshots.
  if(target===undefined?!isDeepStrictEqual(readCompositeConfig(context),currentConfig):currentInstallState(context).mode!==installState.mode){
   throw new TargetConfigurationError('Installed ARC configuration changed during re-apply');
  }
  assertDraftSnapshot(context,statuses,target===undefined?request.platforms:[target]);
  context.signal?.throwIfAborted();
  const result=await executeOperation(context,prepared);
  const error=result.error??result.results.find(item=>item.error)?.error;
  return {
   code:result.code,error,
   unknown:result.activation==='unknown'||result.results.some(item=>item.rollback==='failed'),
   messages:result.messages?.filter(message=>result.activation==='unknown'
    ?!message.startsWith('Residual path: '):message.startsWith('Dispatch history stays in ')),
   published:target===undefined?result.activation==='published':result.results.some(item=>item.status==='installed'),
   legacyResiduals:result.legacyResiduals??[],
   residualPaths:[...(result.publication?.residualPaths??[]),...(error?.residualPaths??[]),...result.results.flatMap(item=>item.residualPaths??[])],
  };
 }catch(error){return {code:context.signal?.aborted?130:1,error,residualPaths:error.residualPaths??[]};}
}

export async function reapplyConfiguration(options={}){
 const {signal,loadCatalog}=options;
 const residualPaths=new Set(),legacyResiduals=new Set(),applied=[],failures=[],messages=[];
 let mode,unknown;
 const incomplete=(error,code=signal?.aborted?130:1)=>({
  status:unknown?'unknown':'held',mode,code,error:unknown?.error??error,residualPaths:[...residualPaths],legacyResiduals:[...legacyResiduals],
  ...(unknown?{messages:unknown.messages}:error.activeDispatches?{activeDispatches:error.activeDispatches}:{}),
  ...(applied.length?{applied}:{}),
 });
 const completed=(code,error)=>({status:'applied',mode,platforms:applied,residualPaths:[...residualPaths],legacyResiduals:[...legacyResiduals],code,...(messages.length?{messages}:{}),...(error?{error}:{})});
 try{
  signal?.throwIfAborted();
  const context=await createManagementContext(options),installState=currentInstallState(context);
  mode=installState.mode;
  if(mode!=='composite'&&mode!=='standalone')return {status:'skipped'};
  const currentConfig=mode==='composite'?readCompositeConfig(context):undefined;
  const statuses=await collectStatus(context);
  signal?.throwIfAborted();
  const targets=mode==='composite'?[undefined]:installerRegistryOf(context).byDisplayOrder()
   .map(({runtime})=>runtime.id).filter(id=>statuses.some(status=>status.platform===id&&status.state==='installed'));
  if(!targets.length)return {status:'skipped'};
  const expected=mode==='composite'?installState.platforms.length:targets.length;
  for(const target of targets){
   const result=await applyConfiguration(context,{installState,statuses,target,currentConfig,loadCatalog});
   for(const filename of result.residualPaths)residualPaths.add(filename);
   for(const filename of result.legacyResiduals??[])legacyResiduals.add(filename);
   const error=result.error??new TargetConfigurationError('Configure Apply did not complete');
   if(result.unknown){
    unknown={error,messages:result.messages};
    return incomplete(error,result.code===130||signal?.aborted?130:1);
   }
   if(result.published){
    applied.push(...(target===undefined?installState.platforms:[target]));
    messages.push(...(result.messages??[]));
   }
   if(result.code===130||signal?.aborted){
    return applied.length===expected?completed(130,result.error??failures[0]):incomplete(error,130);
   }
   if(!result.published||result.code!==0)failures.push(error);
  }
  const error=failures.length>1?new AggregateError(failures,failures.map(failure=>failure.message).join(', ')):failures[0];
  if(applied.length!==expected)return incomplete(error);
  return completed(error?1:0,error);
 }catch(error){
  for(const filename of error.residualPaths??[])residualPaths.add(filename);
  return incomplete(error);
 }
}
