import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {runNpm as defaultRunNpm} from './process.mjs';
const validVersion=value=>typeof value==='string'&&/^\d+\.\d+\.\d+$/.test(value);
function cancelled(){return Object.assign(Error('Upgrade cancelled'),{code:'ARC_CANCELLED'});}
export async function resolveLatest({context,env,cwd,signal,runNpm=defaultRunNpm}){
 const result=await runNpm(context.npmCli,['view','@yunhozz/arc@latest','--json'],{env,cwd,signal});
 let value;try{value=JSON.parse(result.stdout);}catch{}
 if(result.code!==0||result.signal||value?.name!=='@yunhozz/arc'||!validVersion(value.version))throw Error('Cannot resolve a valid latest ARC package');
 return{name:'@yunhozz/arc',version:value.version};
}
export async function upgradeGlobal({context,expectedVersion,env,cwd,signal,runNpm=defaultRunNpm}){
 if(context.kind!=='global'||!path.isAbsolute(context.prefix)||!validVersion(expectedVersion))throw Error('Invalid global upgrade version or prefix');
 const result=await runNpm(context.npmCli,['install','--global','@yunhozz/arc@'+expectedVersion,'--prefix',context.prefix,'--ignore-scripts'],{env,cwd,signal});
 return result.code===0&&!result.signal?{packageStatus:'updated',version:expectedVersion}:{packageStatus:'failed',error:Error('CLI replacement failed; the package may have changed')};
}
export async function runUpgradeChild({entryPath,request,env,cwd,signal}){
 if(signal?.aborted)throw cancelled();
 if(!path.isAbsolute(entryPath))throw Error('Invalid upgrade child path');
 const entry=fs.realpathSync(entryPath);if(!fs.statSync(entry).isFile())throw Error('Invalid upgrade child');
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[entry],{cwd,env,stdio:['pipe','pipe','pipe'],shell:false});let stdout='',stderr='',startError,aborted=false;
  child.stdout.on('data',bytes=>{stdout+=bytes;});child.stderr.on('data',bytes=>{stderr+=bytes;});child.stdin.on('error',()=>{});
  const abort=()=>{aborted=true;child.kill('SIGTERM');};signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  child.once('error',error=>{startError=error;});child.once('close',(code,killedBy)=>{signal?.removeEventListener('abort',abort);if(aborted)resolve({code:130,signal:killedBy,stdout,stderr});else if(startError)reject(Error('Cannot start the new ARC CLI',{cause:startError}));else resolve({code,signal:killedBy,stdout,stderr});});
  child.stdin.end(JSON.stringify(request));
 });
}
// Resolve the npm-exec payload from its own bin, then use only that payload's
// verified management runtime. The global-only private child is not reused.
export async function runNpxUpgrade({context,expectedVersion,expectedStateToken,env,cwd,signal,runNpm=defaultRunNpm}){
 if(context.kind!=='npx'||!validVersion(expectedVersion)||typeof expectedStateToken!=='string'||!/^[a-f0-9]{64}$/.test(expectedStateToken))throw Error('Invalid pinned npx upgrade request');
 if(signal?.aborted)throw cancelled();
 const bootstrap=`import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {pathToFileURL} from 'node:url';
 try{
  const expectedVersion=${JSON.stringify(expectedVersion)},expectedStateToken=${JSON.stringify(expectedStateToken)},cwd=${JSON.stringify(cwd)};
  const bin=process.env.PATH.split(path.delimiter).map(p=>path.join(p,'arc')).find(p=>fs.existsSync(p));
  if(!bin)throw Error('Cannot locate pinned ARC payload');
  const entry=fs.realpathSync(bin),root=path.dirname(path.dirname(entry)),pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  if(pkg.name!=='@yunhozz/arc'||pkg.version!==expectedVersion||entry!==path.join(root,'bin/arc.mjs'))throw Error('Pinned ARC package identity mismatch');
  const management=await import(pathToFileURL(path.join(root,'lib/management/update.mjs')));
  if(typeof management.runtime!=='function'||typeof management.report!=='function')throw Error('Pinned ARC management runtime is unavailable');
  const api=await management.runtime({});
  if(typeof api.inspectNpmContext!=='function'||typeof api.collectInstalledState!=='function'||typeof api.upgradeInstalledTargets!=='function')throw Error('Pinned ARC management API is unavailable');
  const context=await api.inspectNpmContext({packageRoot:root,entryPath:entry,env:process.env,cwd});
  if(context.kind!=='npx'||context.packageRoot!==root)throw Error('Cannot verify pinned npm exec context');
  const state=api.collectInstalledState({safeFs:api.safeFs,userHome:os.homedir(),env:process.env,cwd});
  if(state.stateToken!==expectedStateToken||!state.targets.length)throw Error('Installed ARC settings changed before pinned upgrade');
  const controller=new AbortController(),abort=()=>controller.abort();process.once('SIGINT',abort);process.once('SIGTERM',abort);
  try{process.exitCode=management.report(await api.upgradeInstalledTargets({packageRoot:root,state,safeFs:api.safeFs,signal:controller.signal}),process.stdout,process.stderr);}finally{process.removeListener('SIGINT',abort);process.removeListener('SIGTERM',abort);}
 }catch(error){console.error('Error: '+error.message);process.exitCode=2;}`;
 return runNpm(context.npmCli,['exec','--yes','--package','@yunhozz/arc@'+expectedVersion,'--',process.execPath,'--input-type=module','-e',bootstrap],{env,cwd,signal});
}
