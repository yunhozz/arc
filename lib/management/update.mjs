import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const packageRoot=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const inputError=message=>Object.assign(Error(message),{code:'ARC_CLI_INPUT'});
const configurationError=message=>Object.assign(Error(message),{code:'ARC_TARGET_CONFIGURATION'});
function identity(root){const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));if(pkg.name!=='@yunhozz/arc'||!/^\d+\.\d+\.\d+$/.test(pkg.version))throw configurationError('Invalid ARC package identity');return pkg;}
export async function runtime(deps){
 const [context,state,upgrade,npm]=await Promise.all([import('../npm/context.mjs'),import('../installer/upgrade-state.mjs'),import('../installer/upgrade.mjs'),import('../npm/upgrade.mjs')]);
 let safeFs=deps.safeFs;if(!safeFs){const[{loadNative},{openRoot}]=await Promise.all([import('../safe-fs/native.mjs'),import('../safe-fs/index.mjs')]);const native=loadNative();safeFs={openRoot:root=>openRoot(root,{native})};}
 return{...context,...state,...upgrade,...npm,...deps,safeFs};
}
export function report(result,output,error){
 for(const item of result.results){output.write(item.platform+': '+item.status+'; rollback: '+item.rollback+'\n');for(const filename of item.residualPaths??[])output.write('Residual path: '+filename+'\n');if(item.error)error.write('Error: '+item.error.message+'\n');}
 if(result.interrupted)return 130;
 if(result.results.every(item=>item.status==='installed'&&!item.error)){output.write('ARC version '+result.version+' harness upgraded! Previous harness version: not recorded.\n');return 0;}
 error.write('Harness update did not complete. Retry arc upgrade or npx --yes @yunhozz/arc@latest upgrade.\n');return 1;
}
export function failure(cause,error){error.write('Error: '+cause.message+'\n');return ['ARC_CANCELLED','ARC_NPM_CANCELLED'].includes(cause.code)?130:['ARC_CLI_INPUT','ARC_TARGET_CONFIGURATION','ARC_UNSUPPORTED_RUNTIME','ARC_NATIVE_UNAVAILABLE'].includes(cause.code)?2:1;}
export async function runChild(request,io={},deps={}){
 const output=io.output??process.stdout,error=io.error??process.stderr;let onInterrupt;
 try{
  if(!request||Object.keys(request).sort().join(',')!=='expectedStateToken,expectedVersion,invocationCwd,protocol'||request.protocol!==1||typeof request.expectedVersion!=='string'||!/^\d+\.\d+\.\d+$/.test(request.expectedVersion)||typeof request.expectedStateToken!=='string'||!/^[a-f0-9]{64}$/.test(request.expectedStateToken)||typeof request.invocationCwd!=='string'||!path.isAbsolute(request.invocationCwd)||fs.realpathSync(request.invocationCwd)!==request.invocationCwd)throw inputError('Invalid private upgrade request');
  const root=deps.packageRoot??packageRoot,pkg=identity(root);if(pkg.version!==request.expectedVersion)throw configurationError('The new ARC package version does not match the requested upgrade');
  const api=await runtime(deps),env=io.env??process.env,cwd=request.invocationCwd,context=await api.inspectNpmContext({packageRoot:root,entryPath:path.join(root,'bin/arc-upgrade.mjs'),env,cwd});
  if(context.kind!=='global'||context.packageRoot!==root)throw configurationError('Cannot verify the replaced global ARC package');
  const state=api.collectInstalledState({safeFs:api.safeFs,userHome:deps.userHome??os.homedir(),env,cwd});if(state.stateToken!==request.expectedStateToken)throw configurationError('Installed ARC settings changed during CLI replacement; retry upgrade');
  if(!state.targets.length)throw configurationError('No installed ARC harness found');
  const controller=new AbortController();onInterrupt=()=>controller.abort();process.once('SIGINT',onInterrupt);process.once('SIGTERM',onInterrupt);
  return report(await api.upgradeInstalledTargets({packageRoot:root,state,safeFs:api.safeFs,signal:controller.signal}),output,error);
 }catch(cause){return failure(cause,error);}finally{if(onInterrupt){process.removeListener('SIGINT',onInterrupt);process.removeListener('SIGTERM',onInterrupt);}}
}

export async function prepareUpdate(context){
 const root=context.packageRoot??packageRoot,pkg=identity(root),api=await runtime(context),cwd=fs.realpathSync(context.cwd??process.cwd()),env=context.env??process.env;
 const state=api.collectInstalledState({safeFs:api.safeFs,userHome:context.userHome??os.homedir(),env,cwd});
 if(!state.targets.length)throw configurationError('No installed ARC harness found. Run npx --yes @yunhozz/arc to install it first');
 let plans,version;
 if(!context.upgradeInstalledTargets){const[{verifyPayload},{buildUpgradePlans}]=await Promise.all([import('../installer/manifest.mjs'),import('../installer/upgrade.mjs')]);const payload=verifyPayload({packageRoot:root,safeFs:api.safeFs});plans=buildUpgradePlans({payload,state,safeFs:api.safeFs});version=JSON.parse(payload.files.get('package.json')).version;}
 return{kind:'update',root,pkg,cwd,env,state,plans,version};
}
export async function executeUpdate(context,prepared){
 let packageStarted=false;const messages=[];try{
  const api=await runtime(context),{root,pkg,cwd,env,state}=prepared;
  const{assertPlanSnapshot}=await import('../installer/transaction.mjs');for(const entry of state.targets)assertPlanSnapshot(entry,{safeFs:api.safeFs});
  const npmContext=await api.inspectNpmContext({packageRoot:root,entryPath:path.join(root,'bin/arc.mjs'),env,cwd});
  if(!['global','npx'].includes(npmContext.kind))throw configurationError('Run upgrade from a verified global ARC installation or npx --yes @yunhozz/arc@latest upgrade');
  if(npmContext.kind==='npx'){
   let result;if(prepared.plans){const[{installTargets},{acquisitionFor,operationResult}]=await Promise.all([import('../installer/install.mjs'),import('./operations.mjs')]);result=operationResult({version:prepared.version,...await installTargets(prepared.plans,{safeFs:api.safeFs,signal:context.signal,acquisition:acquisitionFor({...context,safeFs:api.safeFs})})});}else{const{operationResult}=await import('./operations.mjs');result=operationResult(await api.upgradeInstalledTargets({packageRoot:root,state,safeFs:api.safeFs,signal:context.signal}));}return result;
  }
  const latest=await api.resolveLatest({context:npmContext,env,cwd,signal:context.signal});packageStarted=true;
  const replaced=await api.upgradeGlobal({context:npmContext,expectedVersion:latest.version,env,cwd,signal:context.signal});if(replaced.packageStatus!=='updated')throw replaced.error??Error('CLI replacement failed');
  messages.push('CLI: updated to '+latest.version+' (previous '+pkg.version+').\n');
  const child=await api.runUpgradeChild({entryPath:path.join(npmContext.packageRoot,'bin/arc-upgrade.mjs'),request:{protocol:1,expectedVersion:latest.version,invocationCwd:cwd,expectedStateToken:state.stateToken},env,cwd,signal:context.signal});
  return{...child,code:child.code===0&&!child.signal?0:child.code===130?130:1,exitSession:true,results:[],messages};
 }catch(error){return{code:['ARC_CANCELLED','ARC_NPM_CANCELLED'].includes(error.code)?130:['ARC_CLI_INPUT','ARC_TARGET_CONFIGURATION','ARC_UNSUPPORTED_RUNTIME','ARC_NATIVE_UNAVAILABLE'].includes(error.code)?2:1,exitSession:packageStarted,results:[],error,messages};}
}
