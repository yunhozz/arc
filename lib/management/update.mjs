import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {installerRegistryOf,platformLabel,sortByDisplay} from '../platforms/index.mjs';
const packageRoot=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const inputError=message=>Object.assign(Error(message),{code:'ARC_CLI_INPUT'});
const configurationError=message=>Object.assign(Error(message),{code:'ARC_TARGET_CONFIGURATION'});
function identity(root){const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));if(pkg.name!=='@yunhozz/arc'||!/^\d+\.\d+\.\d+$/.test(pkg.version))throw configurationError('Invalid ARC package identity');return pkg;}
export async function runtime(deps){
 const [context,state,upgrade,npm,reapply]=await Promise.all([import('../npm/context.mjs'),import('../installer/upgrade-state.mjs'),import('../installer/upgrade.mjs'),import('../npm/upgrade.mjs'),import('./reapply.mjs')]);
 let safeFs=deps.safeFs;if(!safeFs){const[{loadNative},{openRoot}]=await Promise.all([import('../safe-fs/native.mjs'),import('../safe-fs/index.mjs')]);const native=loadNative();safeFs={openRoot:root=>openRoot(root,{native})};}
 return{...context,...state,...upgrade,...npm,...reapply,...deps,safeFs};
}
export function report(result,output,error){
 const residualPaths=new Set(),writeResidual=filename=>{if(residualPaths.has(filename))return;residualPaths.add(filename);output.write('Residual path: '+filename+'\n');};
 for(const item of result.results){output.write((item.status==='installed'?platformLabel(item.platform,installerRegistryOf())+': harness updated':item.platform+': '+item.status)+'\n');for(const filename of item.residualPaths??[])writeResidual(filename);if(item.error)error.write('Error: '+item.error.message+'\n');}
 for(const filename of result.residualPaths??[])writeResidual(filename);
 if(result.interrupted)return 130;
 if(result.results.every(item=>item.status==='installed'&&!item.error)){output.write('ARC harness updated to '+result.version+'.\n');return 0;}
 error.write('Harness update did not complete. Run arc again and choose Configure to retry the harness update.\n');return 1;
}
export function failure(cause,error){error.write('Error: '+cause.message+'\n');return ['ARC_CANCELLED','ARC_NPM_CANCELLED'].includes(cause.code)?130:['ARC_CLI_INPUT','ARC_TARGET_CONFIGURATION','ARC_UNSUPPORTED_RUNTIME','ARC_NATIVE_UNAVAILABLE'].includes(cause.code)?2:1;}
export async function upgradeAndReapply({api,root,state,output,error,signal,env,cwd,userHome}){
 const platforms=api.platforms??state.registry;
 const code=report(await api.upgradeInstalledTargets({packageRoot:root,state,safeFs:api.safeFs,signal,registry:platforms}),output,error);
 if(signal?.aborted)return 130;
 if(code!==0)return code;
 let result;
 try{
  result=await api.reapplyConfiguration({packageRoot:root,userHome,cwd,env,safeFs:api.safeFs,signal,platforms,runtimePlatforms:api.runtimePlatforms,loadCatalog:api.loadCatalog});
 }catch(cause){result={status:'held',code:1,error:cause,activeDispatches:cause.activeDispatches,residualPaths:cause.residualPaths};}
 if(result.status==='skipped')return signal?.aborted?130:0;
 const interrupted=signal?.aborted||result.code===130;
 const registry=installerRegistryOf({platforms});
 const labels=ids=>sortByDisplay(ids,registry).map(id=>platformLabel(id,registry));
 if(result.status==='unknown'){
  error.write('Configuration re-apply state is unknown.\n');
  const notices=result.messages?.length?result.messages:['Configuration publication state is unknown; inspect the reported paths before retrying.'];
  for(const notice of notices)error.write(notice+'\n');
  if(result.applied?.length)error.write('Configuration re-applied for: '+labels(result.applied).join(', ')+'.\n');
  if(result.error)error.write('Error: '+result.error.message+'\n');
  for(const filename of new Set(result.residualPaths))error.write('Residual path: '+filename+'\n');
  return interrupted?130:result.code;
 }
 if(result.status==='applied'){
  const names=labels(result.platforms);
  const label=result.mode==='composite'?'Mixed routing ('+names.join(' + ')+')':names.join(', ');
  output.write('Configuration re-applied: '+label+'.\n');
  if(interrupted)error.write('Interrupted after the configuration was re-applied.\n');
  if(result.error)error.write('Error: '+result.error.message+'\n');
 }else if(interrupted&&result.applied?.length){
  error.write('Configuration was re-applied only for: '+labels(result.applied).join(', ')+'.\n');
  error.write('Interrupted before the remaining platforms were re-applied.\n');
  error.write('Run arc → Configure → Apply to re-apply the configuration.\n');
 }else{
  if(result.applied?.length)error.write('Configuration was re-applied only for: '+labels(result.applied).join(', ')+'.\n');
  error.write('Configuration was not re-applied.\n');
  if(result.activeDispatches?.length){
   error.write('Active bridge dispatches ('+result.activeDispatches.length+'): '+result.activeDispatches.join(', ')+'\n');
   error.write('After they finish, run arc → Configure → Apply.\n');
  }else{
   error.write('Error: '+result.error.message+'\n');
   error.write('Run arc → Configure → Apply to re-apply the configuration.\n');
  }
 }
 for(const filename of new Set(result.residualPaths))output.write('Residual path: '+filename+'\n');
 return interrupted?130:result.code;
}

export async function runChild(request,io={},deps={}){
 const output=io.output??process.stdout,error=io.error??process.stderr;let onInterrupt;
 try{
  if(!request||Object.keys(request).sort().join(',')!=='expectedStateToken,expectedVersion,invocationCwd,protocol'||request.protocol!==1||typeof request.expectedVersion!=='string'||!/^\d+\.\d+\.\d+$/.test(request.expectedVersion)||typeof request.expectedStateToken!=='string'||!/^[a-f0-9]{64}$/.test(request.expectedStateToken)||typeof request.invocationCwd!=='string'||!path.isAbsolute(request.invocationCwd)||fs.realpathSync(request.invocationCwd)!==request.invocationCwd)throw inputError('Invalid private upgrade request');
  const root=deps.packageRoot??packageRoot,pkg=identity(root);if(pkg.version!==request.expectedVersion)throw configurationError('The new ARC package version does not match the requested upgrade');
  const api=await runtime(deps),env=io.env??process.env,cwd=request.invocationCwd,context=await api.inspectNpmContext({packageRoot:root,entryPath:path.join(root,'bin/arc-upgrade.mjs'),env,cwd});
  if(context.kind!=='global'||context.packageRoot!==root)throw configurationError('Cannot verify the replaced global ARC package');
  const userHome=deps.userHome??os.homedir(),state=api.collectInstalledState({safeFs:api.safeFs,userHome,env,cwd,platforms:api.platforms,runtimePlatforms:api.runtimePlatforms});if(state.stateToken!==request.expectedStateToken)throw configurationError('Installed ARC settings changed during CLI replacement; retry upgrade');
  if(!state.targets.length)throw configurationError('No installed ARC harness found');
  const controller=new AbortController();onInterrupt=()=>controller.abort();process.once('SIGINT',onInterrupt);process.once('SIGTERM',onInterrupt);
  return await upgradeAndReapply({api,root,state,output,error,signal:controller.signal,env,cwd,userHome});
 }catch(cause){return failure(cause,error);}finally{if(onInterrupt){process.removeListener('SIGINT',onInterrupt);process.removeListener('SIGTERM',onInterrupt);}}
}

export async function prepareUpdate(context){
 const root=context.packageRoot??packageRoot,pkg=identity(root),api=await runtime(context),cwd=fs.realpathSync(context.cwd??process.cwd()),env=context.env??process.env;
 const state=api.collectInstalledState({safeFs:api.safeFs,userHome:context.userHome??os.homedir(),env,cwd,platforms:api.platforms,runtimePlatforms:api.runtimePlatforms});
 const npmContext=await api.inspectNpmContext({packageRoot:root,entryPath:path.join(root,'bin/arc.mjs'),env,cwd});
 if(!['global','npx'].includes(npmContext.kind))throw configurationError('Run arc from a verified global ARC installation or npx');
 let latestVersion=null,latestError;
 try{const latest=await api.resolveLatest({context:npmContext,env,cwd,signal:context.signal});if(!/^\d+\.\d+\.\d+$/.test(latest.version))throw Error('Invalid latest ARC version');latestVersion=latest.version;}catch(error){if(['ARC_CANCELLED','ARC_NPM_CANCELLED'].includes(error.code))throw error;latestError=error;}
 return{kind:'update',root,pkg,cwd,env,state,npmContext,currentVersion:pkg.version,latestVersion,canUpgrade:state.targets.length>0&&latestVersion!==null&&isNewerVersion(latestVersion,pkg.version),latestError};
}
export function isNewerVersion(left,right){const a=left.split('.').map(BigInt),b=right.split('.').map(BigInt);for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return false;}

export async function executeUpdate(context,prepared){
 let packageStarted=false;const messages=[];try{
  const api=await runtime(context),{root,pkg,cwd,env,state}=prepared;
  if(!state?.targets?.length)throw configurationError('No installed ARC harness found');
  if(!prepared.canUpgrade||typeof prepared.latestVersion!=='string'||!/^\d+\.\d+\.\d+$/.test(prepared.latestVersion)||!isNewerVersion(prepared.latestVersion,prepared.currentVersion))throw configurationError('No newer ARC version is available');
  if(identity(root).version!==pkg.version||pkg.version!==prepared.currentVersion)throw configurationError('ARC package changed after checking its version');
  const{assertPlanSnapshot}=await import('../installer/transaction.mjs');for(const entry of state.targets)assertPlanSnapshot(entry,{safeFs:api.safeFs});
  const currentState=api.collectInstalledState({safeFs:api.safeFs,userHome:context.userHome??os.homedir(),env,cwd,platforms:api.platforms,runtimePlatforms:api.runtimePlatforms});if(currentState.stateToken!==state.stateToken)throw configurationError('Installed ARC settings changed; check the version again');
  const npmContext=await api.inspectNpmContext({packageRoot:root,entryPath:path.join(root,'bin/arc.mjs'),env,cwd});
  if(!['global','npx'].includes(npmContext.kind)||['kind','packageRoot','entryPath','npmCli','prefix'].some(key=>npmContext[key]!==prepared.npmContext[key]))throw configurationError('ARC npm context changed; check the version again');
  const expectedVersion=prepared.latestVersion;
  if(npmContext.kind==='npx'){
   const child=await api.runNpxUpgrade({context:npmContext,expectedVersion,expectedStateToken:state.stateToken,env,cwd,signal:context.signal});
   return{...child,code:child.code===0&&!child.signal?0:child.code===130?130:1,exitSession:false,results:[],messages};
  }
  packageStarted=true;
  const replaced=await api.upgradeGlobal({context:npmContext,expectedVersion,env,cwd,signal:context.signal});if(replaced.packageStatus!=='updated')throw replaced.error??Error('CLI replacement failed');
  messages.push('arc CLI: '+pkg.version+' → '+expectedVersion+'.\n');
  const child=await api.runUpgradeChild({entryPath:path.join(npmContext.packageRoot,'bin/arc-upgrade.mjs'),request:{protocol:1,expectedVersion,invocationCwd:cwd,expectedStateToken:state.stateToken},env,cwd,signal:context.signal});
  return{...child,code:child.code===0&&!child.signal?0:child.code===130?130:1,exitSession:true,results:[],messages};
 }catch(error){return{code:['ARC_CANCELLED','ARC_NPM_CANCELLED'].includes(error.code)?130:['ARC_CLI_INPUT','ARC_TARGET_CONFIGURATION','ARC_UNSUPPORTED_RUNTIME','ARC_NATIVE_UNAVAILABLE'].includes(error.code)?2:1,exitSession:packageStarted,results:[],error,messages};}
}
