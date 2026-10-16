import path from 'node:path';
import {spawn as nodeSpawn} from 'node:child_process';
import {readCheckedFile,sameIdentity,typeOf,metadataOf} from './targets.mjs';

const REQUIRED={
 'brainstorming':['SKILL.md','visual-companion.md','scripts/start-server.sh','scripts/stop-server.sh','scripts/server.cjs','scripts/helper.js','scripts/frame-template.html'],
 'writing-plans':['SKILL.md'],
 'test-driven-development':['SKILL.md','writing-good-tests.md'],
};
const SKILLS=Object.keys(REQUIRED);
const ARGV=['--yes','skills@latest','add','https://github.com/obra/superpowers','--skill',...SKILLS,'--agent','universal','--yes','--copy','--json'];
const defaultClock={setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id)};
export class AcquisitionError extends Error{
 constructor(message,{code='ARC_ACQUISITION',cause,recoveryPaths}={}){super(message,{cause});this.name='AcquisitionError';this.code=code;this.exitCode=code==='ARC_ACQUISITION_CANCELLED'?130:1;if(recoveryPaths)this.recoveryPaths=recoveryPaths;}
}
const failure=message=>{throw new AcquisitionError(message);};
function decode(bytes,stream){try{return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{failure(`External skill CLI returned non-UTF-8 ${stream}`);}}
function environment(work){
 const result={};for(const key of ['PATH','LANG','LC_ALL'])if(process.env[key]!==undefined)result[key]=process.env[key];
 Object.assign(result,{CI:'1',DO_NOT_TRACK:'1',HOME:path.join(work,'home'),XDG_CONFIG_HOME:path.join(work,'config'),CODEX_HOME:path.join(work,'codex-runtime'),TMPDIR:path.join(work,'tmp'),XDG_STATE_HOME:path.join(work,'state'),npm_config_cache:path.join(work,'npm-cache'),npm_config_userconfig:path.join(work,'npm-userconfig'),npm_config_globalconfig:path.join(work,'npm-globalconfig'),npm_config_audit:'false',npm_config_fund:'false',npm_config_update_notifier:'false',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:path.join(work,'gitconfig'),GIT_TERMINAL_PROMPT:'0'});
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
function validateRecords(stdout,work){
 let records;try{records=JSON.parse(stdout);}catch{failure('External skill CLI returned invalid JSON');}
 if(!Array.isArray(records))failure('External skill CLI JSON must be a list');const seen=new Set();
 for(const record of records){if(!record||typeof record!=='object'||Array.isArray(record)||!SKILLS.includes(record.name)||seen.has(record.name))failure('External skill CLI returned an unexpected or duplicate skill');seen.add(record.name);
  if(record.status!=='installed'||record.source!=='obra/superpowers'||!Object.hasOwn(record,'ref')||record.ref!==null||record.scope!=='project'||!Array.isArray(record.agents)||record.agents.length!==1||record.agents[0]!=='Universal'||record.mode!=='copy'||record.path!==path.join(work,'.agents/skills',record.name))failure(`External skill CLI returned invalid installation metadata for ${record.name}`);
 }if(seen.size!==SKILLS.length)failure('External skill CLI omitted required skills');
}
function snapshotSkill(root,absolute,required){
 const rootBefore=root.stat(),entries=new Map(),snapshot=new Map();
 function walk(directory,prefix=''){
  const before=directory.stat(),names=directory.readDir();
  for(const name of names){const relative=prefix?prefix+'/'+name:name,stat=directory.lstat(name),type=typeOf(stat);
   if(type===0o040000){const child=directory.openDir(name);try{if(!sameIdentity(stat,child.stat()))failure('Acquired directory changed during validation');entries.set(relative,{type:'directory',mode:stat.mode});snapshot.set(relative,{...metadataOf(stat),type:'directory'});walk(child,relative);}finally{child.close();}}
   else if(type===0o100000){const file=readCheckedFile(directory,name,stat);entries.set(relative,{type:'file',bytes:file.bytes,mode:stat.mode});snapshot.set(relative,file.metadata);}
   else if(type===0o120000){const raw=directory.readlink(name);const after=directory.lstat(name);if(!sameIdentity(stat,after))failure('Acquired symlink changed during validation');entries.set(relative,{type:'symlink',raw,mode:stat.mode});snapshot.set(relative,{...metadataOf(stat),type:'symlink',link:raw});}
   else failure('Acquired tree contains a special file');
  }if(!sameIdentity(before,directory.stat()))failure('Acquired directory changed during validation');
 }
 walk(root);
 const resolvedLinks=new Map();
 function targetOf(name,trail=new Set()){
  if(trail.has(name))failure('Acquired symlink cycle');
  if(resolvedLinks.has(name))return resolvedLinks.get(name);
  const entry=entries.get(name);if(!entry||entry.type!=='symlink')failure('Invalid acquired link');
  const active=new Set(trail);active.add(name);
  const parent=path.posix.dirname(name);const target=resolvePath(entry.raw,parent==='.'?[]:parent.split('/'),active);
  resolvedLinks.set(name,target);return target;
 }
 function resolvePath(raw,base=[],trail=new Set()){
  let current=[...base],parts;
  if(raw.startsWith('/')){if(!raw.startsWith(absolute+'/'))failure('Acquired link escapes its root');current=[];parts=raw.slice(absolute.length+1).split('/');}
  else parts=raw.split('/');
  for(let i=0;i<parts.length;i++){
   const part=parts[i];if(!part||part==='.')continue;
   if(part==='..'){if(!current.length)failure('Acquired link escapes its root');current.pop();continue;}
   const name=[...current,part].join('/'),entry=entries.get(name);if(!entry)failure('Acquired link is dangling');
   const canonical=entry.type==='symlink'?targetOf(name,trail):name;
   if(i<parts.length-1&&entries.get(canonical)?.type!=='directory')failure('Acquired link parent is not a directory');
   current=canonical.split('/');
  }
  const result=current.join('/');if(!result||!entries.has(result))failure('Acquired link resolves to its root or a missing entry');return result;
 }
 for(const[name,entry]of entries)if(entry.type==='symlink')targetOf(name);
 for(const[name,target]of resolvedLinks){const entry=entries.get(name);entry.target=target;entry.link=path.posix.relative(path.posix.dirname(name),target);delete entry.raw;}
 // Build directory edges, including directory symlinks, to reject cycles that
 // resolve individually but would create recursive staging traversals.
 const graph=new Map([['',new Set()]]);for(const[relative,entry]of entries){const parent=path.posix.dirname(relative)==='.'?'':path.posix.dirname(relative);if(!graph.has(parent))graph.set(parent,new Set());if(entry.type==='directory'){graph.get(parent).add(relative);if(!graph.has(relative))graph.set(relative,new Set());}else if(entry.type==='symlink'&&entries.get(entry.target)?.type==='directory')graph.get(parent).add(entry.target);}
 const active=new Set(),done=new Set();function visit(node){if(active.has(node))failure('Acquired directory links create a cycle');if(done.has(node))return;active.add(node);for(const next of graph.get(node)??[])visit(next);active.delete(node);done.add(node);}visit('');
 for(const name of required){const actual=resolvePath(name);if(entries.get(actual)?.type!=='file')failure('Required acquired skill file is missing or not regular');}
 if(!sameIdentity(rootBefore,root.stat()))failure('Acquired root changed during validation');
 return{root:absolute,rootMetadata:{...metadataOf(rootBefore),type:'directory',entries:root.readDir()},entries,snapshot};
}
export async function acquireExternalSkills({work,safeFs,spawn=nodeSpawn,signal,clock=defaultClock}){
 let root,owned=false,transferred=false,child,completed,timer,onAbort,termination;try{
  if(typeof work!=='string'||!path.isAbsolute(work)||path.normalize(work)!==work)failure('Acquisition work must be an absolute normalized directory');
  root=safeFs.openRoot(work);const identity=root.stat();if(root.readDir().length)failure('Acquisition work directory must be empty');owned=true;
  if(signal?.aborted)throw new AcquisitionError('External skill acquisition cancelled',{code:'ARC_ACQUISITION_CANCELLED'});
  for(const name of ['home','config','codex-runtime','npm-cache','state','tmp'])root.mkdir(name,0o700);
  for(const name of ['npm-userconfig','npm-globalconfig','gitconfig']){const file=root.openFile(name,{createExclusive:true,mode:0o600});file.close();}
  const stdout=[],stderr=[];let startError;
  child=spawn('npx',[...ARGV],{cwd:work,env:environment(work),stdio:['ignore','pipe','pipe'],detached:true,shell:false});
  completed=new Promise(resolve=>{child.stdout.on('data',bytes=>stdout.push(Buffer.from(bytes)));child.stderr.on('data',bytes=>stderr.push(Buffer.from(bytes)));child.once('error',error=>{startError=error;});child.once('close',(code,killedBy)=>resolve({code,killedBy}));});
  const interrupted=new Promise((resolve,reject)=>{timer=clock.setTimeout(()=>reject(new AcquisitionError('External skill acquisition timed out after 300 seconds',{code:'ARC_ACQUISITION_TIMEOUT'})),300000);onAbort=()=>reject(new AcquisitionError('External skill acquisition cancelled',{code:'ARC_ACQUISITION_CANCELLED'}));signal?.addEventListener('abort',onAbort,{once:true});if(signal?.aborted)onAbort();});
  const result=await Promise.race([completed,interrupted]);clock.clearTimeout(timer);termination=terminateGroup(child,completed,clock);await termination;
  if(signal?.aborted)throw new AcquisitionError('External skill acquisition cancelled',{code:'ARC_ACQUISITION_CANCELLED'});
  if(startError)throw new AcquisitionError(`Cannot start external skill CLI: ${startError.message}`,{cause:startError});
  const errorText=decode(Buffer.concat(stderr),'stderr');if(result.code!==0)failure(`External skill CLI failed with exit code ${result.code}${errorText.trim()?': '+errorText.trim():''}`);
  validateRecords(decode(Buffer.concat(stdout),'stdout'),work);
  const current=safeFs.openRoot(work);try{const now=current.stat();if(now.dev!==identity.dev||now.ino!==identity.ino)failure('Acquisition work path was replaced');}finally{current.close();}
  const agents=root.openDir('.agents');let directory;try{directory=agents.openDir('skills');}finally{agents.close();}
  const skills=new Map();try{for(const name of SKILLS){const skill=directory.openDir(name);try{skills.set(name,snapshotSkill(skill,path.join(work,'.agents/skills',name),REQUIRED[name]));}finally{skill.close();}}}finally{directory.close();}
  let disposed=false;
  const dispose=async()=>{
   if(disposed)return;disposed=true;
   try{clearHeldDirectory(root);}
   catch(cause){throw new AcquisitionError('Cannot dispose private acquisition work; preserve recovery material',{code:'ARC_ACQUISITION_CLEANUP',cause,recoveryPaths:[work]});}
   finally{root.close();}
  };
  transferred=true;return{work,skills,dispose};
 }catch(cause){let error=cause instanceof AcquisitionError?cause:new AcquisitionError(`External skill acquisition failed: ${cause.message}`,{cause});
  try{if(child&&completed){termination??=terminateGroup(child,completed,clock);await termination;}if(owned)clearHeldDirectory(root);}catch(cleanup){error=new AcquisitionError(`Acquisition cleanup failed; preserve work for recovery: ${work}`,{code:'ARC_ACQUISITION_CLEANUP',cause:cleanup});error.work=work;}
  throw error;
 }finally{if(timer!==undefined)clock.clearTimeout(timer);if(onAbort)signal?.removeEventListener('abort',onAbort);if(!transferred)root?.close();}
}
