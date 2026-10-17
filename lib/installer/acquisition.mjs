import path from 'node:path';
import {spawn as nodeSpawn} from 'node:child_process';
import {readCheckedFile,sameIdentity,typeOf} from './targets.mjs';

import {REQUIRED,SKILLS,snapshotSkill,createReferenceBundle} from './superpowers.mjs';
const ARGV=['clone','--depth','1','--single-branch','--no-tags','--','https://github.com/obra/superpowers'];
const defaultClock={setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id)};
export class AcquisitionError extends Error{
 constructor(message,{code='ARC_ACQUISITION',cause,residualPaths}={}){super(message,{cause});this.name='AcquisitionError';this.code=code;this.exitCode=code==='ARC_ACQUISITION_CANCELLED'?130:1;if(residualPaths)this.residualPaths=residualPaths;}
}
const failure=message=>{throw new AcquisitionError(message);};
function decode(bytes,stream){try{return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{failure(`Upstream Git returned non-UTF-8 ${stream}`);}}
function environment(work){
 const result={};for(const key of ['PATH','LANG','LC_ALL'])if(process.env[key]!==undefined)result[key]=process.env[key];
 Object.assign(result,{CI:'1',DO_NOT_TRACK:'1',HOME:path.join(work,'home'),XDG_CONFIG_HOME:path.join(work,'config'),CODEX_HOME:path.join(work,'codex-runtime'),TMPDIR:path.join(work,'tmp'),XDG_STATE_HOME:path.join(work,'state'),npm_config_cache:path.join(work,'npm-cache'),npm_config_userconfig:path.join(work,'npm-userconfig'),npm_config_globalconfig:path.join(work,'npm-globalconfig'),npm_config_audit:'false',npm_config_fund:'false',npm_config_update_notifier:'false',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:path.join(work,'gitconfig'),GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_COUNT:'3',GIT_CONFIG_KEY_0:'core.hooksPath',GIT_CONFIG_VALUE_0:'/dev/null',GIT_CONFIG_KEY_1:'protocol.file.allow',GIT_CONFIG_VALUE_1:'never',GIT_CONFIG_KEY_2:'submodule.recurse',GIT_CONFIG_VALUE_2:'false'});
 return result;
}
function clearHeldDirectory(directory){
 for(const name of directory.readDir()){
  const before=directory.lstat(name);
  if(typeOf(before)===0o040000){const child=directory.openDir(name);try{if(!sameIdentity(before,child.stat()))failure('Work entry changed before cleanup');clearHeldDirectory(child);}finally{child.close();}directory.rmdir(name);}
  else directory.unlink(name);
 }
}
function groupExists(pid){if(!pid)return false;try{process.kill(-pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;if(error.code==='EPERM')return true;throw error;}}
function signalGroup(pid,signal){if(!pid)return;try{process.kill(-pid,signal);}catch(error){if(error.code!=='ESRCH')throw error;}}
function groupGone(pid,clock){
 if(!groupExists(pid))return Promise.resolve();
 return new Promise((resolve,reject)=>{let poll,done=false;const finish=error=>{if(done)return;done=true;clock.clearTimeout(poll);clock.clearTimeout(deadline);if(error)reject(error);else resolve();};const check=()=>{try{if(!groupExists(pid))finish();else poll=clock.setTimeout(check,20);}catch(error){finish(error);}};const deadline=clock.setTimeout(()=>{try{finish(groupExists(pid)?new AcquisitionError('External skill descendants did not terminate'):undefined);}catch(error){finish(error);}},5000);check();});
}
async function terminateGroup(child,completed,clock){
 const pid=child?.pid;if(!groupExists(pid))return;
 signalGroup(pid,'SIGTERM');let timer;const grace=new Promise(resolve=>{timer=clock.setTimeout(resolve,5000);});
 try{await Promise.race([completed,grace]);if(groupExists(pid))await grace;if(groupExists(pid))signalGroup(pid,'SIGKILL');await groupGone(pid,clock);await completed;}
 finally{clock.clearTimeout(timer);}
}
export async function acquireExternalSkills({work,safeFs,spawn=nodeSpawn,signal,clock=defaultClock}){
 let root,owned=false,transferred=false,child,completed,timer,onAbort,termination;try{
  if(typeof work!=='string'||!path.isAbsolute(work)||path.normalize(work)!==work)failure('Acquisition work must be an absolute normalized directory');
  root=safeFs.openRoot(work);const identity=root.stat();if(root.readDir().length)failure('Acquisition work directory must be empty');owned=true;
  if(signal?.aborted)throw new AcquisitionError('External skill acquisition cancelled',{code:'ARC_ACQUISITION_CANCELLED'});
  for(const name of ['home','config','codex-runtime','npm-cache','state','tmp'])root.mkdir(name,0o700);
  for(const name of ['npm-userconfig','npm-globalconfig','gitconfig']){const file=root.openFile(name,{createExclusive:true,mode:0o600});file.close();}
  async function run(args){
  termination=undefined;
  const stdout=[],stderr=[];let startError;
  child=spawn('git',args,{cwd:work,env:environment(work),stdio:['ignore','pipe','pipe'],detached:true,shell:false});
  completed=new Promise(resolve=>{child.stdout.on('data',bytes=>stdout.push(Buffer.from(bytes)));child.stderr.on('data',bytes=>stderr.push(Buffer.from(bytes)));child.once('error',error=>{startError=error;});child.once('close',(code,killedBy)=>resolve({code,killedBy}));});
  const interrupted=new Promise((resolve,reject)=>{timer=clock.setTimeout(()=>reject(new AcquisitionError('External skill acquisition timed out after 300 seconds',{code:'ARC_ACQUISITION_TIMEOUT'})),300000);onAbort=()=>reject(new AcquisitionError('External skill acquisition cancelled',{code:'ARC_ACQUISITION_CANCELLED'}));signal?.addEventListener('abort',onAbort,{once:true});if(signal?.aborted)onAbort();});
  const result=await Promise.race([completed,interrupted]);clock.clearTimeout(timer);termination=terminateGroup(child,completed,clock);await termination;
  if(signal?.aborted)throw new AcquisitionError('External skill acquisition cancelled',{code:'ARC_ACQUISITION_CANCELLED'});
  if(startError)throw new AcquisitionError(`Cannot start upstream Git: ${startError.message}`,{cause:startError});
  const errorText=decode(Buffer.concat(stderr),'stderr');if(result.code!==0)failure(`Upstream Git failed with exit code ${result.code}${errorText.trim()?': '+errorText.trim():''}`);
  signal?.removeEventListener('abort',onAbort);onAbort=undefined;
  return decode(Buffer.concat(stdout),'stdout');
  }
  await run([...ARGV,path.join(work,'upstream')]);
  const revision=(await run(['-C',path.join(work,'upstream'),'rev-parse','HEAD'])).trim();
  if(!/^[a-f0-9]{40,64}$/.test(revision))failure('Git returned an invalid revision');
  const current=safeFs.openRoot(work);try{const now=current.stat();if(now.dev!==identity.dev||now.ino!==identity.ino)failure('Acquisition work path was replaced');}finally{current.close();}
  const agents=root.openDir('upstream');let directory;try{directory=agents.openDir('skills');}finally{agents.close();}
  const skills=new Map();try{for(const name of SKILLS){const skill=directory.openDir(name);try{skills.set(name,snapshotSkill(skill,path.join(work,'upstream/skills',name),REQUIRED[name]));}finally{skill.close();}}}finally{directory.close();}
  const upstream=root.openDir('upstream');let license;try{license=readCheckedFile(upstream,'LICENSE').bytes;}finally{upstream.close();}
  const references=createReferenceBundle({skills,license,revision});
  let disposed=false;
  const dispose=async()=>{
   if(disposed)return;disposed=true;
   try{clearHeldDirectory(root);}
   catch(cause){throw new AcquisitionError('Cannot dispose private acquisition work; preserve residual work',{code:'ARC_ACQUISITION_CLEANUP',cause,residualPaths:[work]});}
   finally{root.close();}
  };
  transferred=true;return{work,skills,references,dispose};
 }catch(cause){let error=cause instanceof AcquisitionError?cause:new AcquisitionError(`External skill acquisition failed: ${cause.message}`,{cause});
  try{if(child&&completed){termination??=terminateGroup(child,completed,clock);await termination;}if(owned)clearHeldDirectory(root);}catch(cleanup){error=new AcquisitionError(`Acquisition cleanup failed; preserve residual work: ${work}`,{code:'ARC_ACQUISITION_CLEANUP',cause:cleanup,residualPaths:[work]});error.work=work;}
  throw error;
 }finally{if(timer!==undefined)clock.clearTimeout(timer);if(onAbort)signal?.removeEventListener('abort',onAbort);if(!transferred)root?.close();}
}
