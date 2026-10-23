import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const packageRoot=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const usage='Usage: arc upgrade [--help]';
const inputError=message=>Object.assign(Error(message),{code:'ARC_CLI_INPUT'});
const configurationError=message=>Object.assign(Error(message),{code:'ARC_TARGET_CONFIGURATION'});
function identity(root){const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));if(pkg.name!=='@yunhozz/arc'||!/^\d+\.\d+\.\d+$/.test(pkg.version))throw configurationError('Invalid ARC package identity');return pkg;}
async function runtime(deps){
 const [context,state,upgrade,npm]=await Promise.all([import('../npm/context.mjs'),import('../installer/upgrade-state.mjs'),import('../installer/upgrade.mjs'),import('../npm/upgrade.mjs')]);
 let safeFs=deps.safeFs;if(!safeFs){const[{loadNative},{openRoot}]=await Promise.all([import('../safe-fs/native.mjs'),import('../safe-fs/index.mjs')]);const native=loadNative();safeFs={openRoot:root=>openRoot(root,{native})};}
 return{...context,...state,...upgrade,...npm,...deps,safeFs};
}
function report(result,output,error){
 for(const item of result.results){output.write(item.platform+': '+item.status+'; rollback: '+item.rollback+'\n');for(const filename of item.residualPaths??[])output.write('Residual path: '+filename+'\n');if(item.error)error.write('Error: '+item.error.message+'\n');}
 if(result.interrupted)return 130;
 if(result.results.every(item=>item.status==='installed'&&!item.error)){output.write('ARC version '+result.version+' harness upgraded! Previous harness version: not recorded.\n');return 0;}
 error.write('Harness update did not complete. Retry arc upgrade or npx --yes @yunhozz/arc@latest upgrade.\n');return 1;
}
function failure(cause,error){error.write('Error: '+cause.message+'\n');return ['ARC_CANCELLED','ARC_NPM_CANCELLED'].includes(cause.code)?130:['ARC_CLI_INPUT','ARC_TARGET_CONFIGURATION','ARC_UNSUPPORTED_RUNTIME','ARC_NATIVE_UNAVAILABLE'].includes(cause.code)?2:1;}
export async function runCli(args=process.argv.slice(2),io={},deps={}){
 const output=io.output??process.stdout,error=io.error??process.stderr;let controller,onInterrupt,packageStarted=false;
 try{
  if(args.length===1&&args[0]==='--help'){output.write(usage+'\nUpdates the global CLI and installed harness; npm exec updates the harness only.\n');return 0;}
  if(args.length)throw inputError('Expected no arguments or --help');
  const root=deps.packageRoot??packageRoot,pkg=identity(root),env=io.env??process.env,cwd=fs.realpathSync(io.cwd??process.cwd()),api=await runtime(deps);
  const context=await api.inspectNpmContext({packageRoot:root,entryPath:path.join(root,'bin/arc.mjs'),env,cwd});
  if(!['global','npx'].includes(context.kind))throw configurationError('Run upgrade from a verified global ARC installation or npx --yes @yunhozz/arc@latest upgrade');
  const state=api.collectInstalledState({safeFs:api.safeFs,userHome:deps.userHome??os.homedir(),env,cwd});
  if(!state.targets.length)throw configurationError('No installed ARC harness found. Run npx --yes @yunhozz/arc to install it first');
  controller=new AbortController();onInterrupt=()=>controller.abort();process.once('SIGINT',onInterrupt);process.once('SIGTERM',onInterrupt);
  if(context.kind==='npx')return report(await api.upgradeInstalledTargets({packageRoot:root,state,safeFs:api.safeFs,signal:controller.signal}),output,error);
  const latest=await api.resolveLatest({context,env,cwd,signal:controller.signal});packageStarted=true;
  const replaced=await api.upgradeGlobal({context,expectedVersion:latest.version,env,cwd,signal:controller.signal});
  if(replaced.packageStatus!=='updated')throw replaced.error??Error('CLI replacement failed');
  output.write('CLI: updated to '+latest.version+' (previous '+pkg.version+').\n');
  const result=await api.runUpgradeChild({entryPath:path.join(context.packageRoot,'bin/arc-upgrade.mjs'),request:{protocol:1,expectedVersion:latest.version,invocationCwd:cwd,expectedStateToken:state.stateToken},env,cwd,signal:controller.signal});
  if(result.stdout)output.write(result.stdout);if(result.stderr)error.write(result.stderr);
  if(result.code===0&&!result.signal)return 0;
  error.write('CLI was updated but the harness update did not complete. Retry arc upgrade or npx --yes @yunhozz/arc@latest upgrade.\n');return result.code===130?130:1;
 }catch(cause){const code=failure(cause,error);if(cause.code==='ARC_CLI_INPUT')error.write(usage+'\n');if(packageStarted)error.write('CLI state may have changed. Retry arc upgrade; if it is unavailable, run npx --yes @yunhozz/arc@latest upgrade.\n');return code;}
 finally{if(onInterrupt){process.removeListener('SIGINT',onInterrupt);process.removeListener('SIGTERM',onInterrupt);}}
}
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
