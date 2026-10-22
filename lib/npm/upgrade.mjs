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
