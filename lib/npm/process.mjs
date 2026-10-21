import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
function failure(message,code,cause){return Object.assign(new Error(message,{cause}),{code});}
export async function runNpm(npmCli,args,{cwd,env,signal}={}){
 if(signal?.aborted)throw failure('npm cancelled','ARC_NPM_CANCELLED');
 if(!path.isAbsolute(npmCli)||!Array.isArray(args)||args.some(arg=>typeof arg!=='string'))throw failure('Invalid npm invocation','ARC_NPM_START');
 let cli;try{cli=fs.realpathSync(npmCli);if(!fs.statSync(cli).isFile())throw Error('Not a regular file');}catch(cause){throw failure('Cannot resolve npm CLI','ARC_NPM_START',cause);}
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[cli,...args],{cwd,env,stdio:['ignore','pipe','pipe'],shell:false});
  const stdout=[],stderr=[];let startError,cancelled=false;
  child.stdout.on('data',bytes=>stdout.push(bytes));child.stderr.on('data',bytes=>stderr.push(bytes));
  const abort=()=>{cancelled=true;child.kill('SIGTERM');};signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  child.once('error',error=>{startError=error;});
  child.once('close',(code,killedBy)=>{signal?.removeEventListener('abort',abort);if(cancelled)reject(failure('npm cancelled','ARC_NPM_CANCELLED'));else if(startError)reject(failure('Cannot start npm','ARC_NPM_START',startError));else resolve({code,signal:killedBy,stdout:Buffer.concat(stdout).toString('utf8'),stderr:Buffer.concat(stderr).toString('utf8')});});
 });
}
