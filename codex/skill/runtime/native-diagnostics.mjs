import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
const hash=value=>typeof value==='string'&&/^(?:sha256:)?[a-f0-9]{64}$/.test(value)?(value.startsWith('sha256:')?value:'sha256:'+value):null;
const version=value=>typeof value==='string'&&/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(value)?value:null;

/** The caller supplies a diagnostic-only sink; no workflow state is accessed. */
export async function recordNativeDiagnostic({input,installation={},storage}){
 const record={
  platform:'codex',
  event:['PreToolUse','SubagentStart'].includes(input?.hook_event_name)?input.hook_event_name:'unknown',
  callback:true,
  definitionHash:hash(installation.definitionHash),
  runtimeHash:hash(installation.runtimeHash),
  platformVersion:version(installation.platformVersion),
  observedAt:new Date().toISOString()
 };
 if(typeof storage?.record==='function')await storage.record(record);
 return record;
}

/** Explicit user-home storage; caller controls the target used by tests or the entrypoint. */
export function createNativeDiagnosticStorage({userHome,maxBytes=1024*1024}){
 if(typeof userHome!=='string'||!path.isAbsolute(userHome))throw Error('Absolute user home required');
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>1024*1024)throw Error('Invalid diagnostic storage bound');
 const dir=path.join(userHome,'.arc','state','native-diagnostics');
 return {async record(value){
  const observedAt=typeof value?.observedAt==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.observedAt)&&Number.isFinite(Date.parse(value.observedAt))&&new Date(value.observedAt).toISOString()===value.observedAt?value.observedAt:null;
  if(!observedAt)throw Error('Invalid diagnostic observation');
  const data={platform:'codex',event:['PreToolUse','SubagentStart'].includes(value?.event)?value.event:'unknown',callback:true,definitionHash:hash(value?.definitionHash),runtimeHash:hash(value?.runtimeHash),platformVersion:version(value?.platformVersion),observedAt};
  if(constants.O_NOFOLLOW===undefined)throw Error('Safe diagnostic storage unavailable');
  const root=path.resolve(userHome),home=await fs.lstat(root);
  if(!home.isDirectory()||home.isSymbolicLink()||await fs.realpath(root)!==root)throw Error('Unsafe diagnostic home');
  let current=root;const directories=[];
  for(const part of ['.arc','state','native-diagnostics']){
   current=path.join(current,part);try{await fs.mkdir(current,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
   const stat=await fs.lstat(current);
   if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||(typeof process.getuid==='function'&&stat.uid!==process.getuid())||await fs.realpath(current)!==current)throw Error('Unsafe diagnostic directory');
   directories.push({path:current,dev:stat.dev,ino:stat.ino});
  }
  const checkDirectories=async()=>{for(const entry of directories){const stat=await fs.lstat(entry.path);if(!stat.isDirectory()||stat.isSymbolicLink()||stat.dev!==entry.dev||stat.ino!==entry.ino||(stat.mode&0o077)!==0||(typeof process.getuid==='function'&&stat.uid!==process.getuid())||await fs.realpath(entry.path)!==entry.path)throw Error('Diagnostic directory changed');}};
  const lockPath=path.join(dir,'codex.lock');let lock;
  for(let attempt=0;attempt<50;attempt++){
   await checkDirectories();
   try{lock=await fs.open(lockPath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);break;}
   catch(error){if(error.code!=='EEXIST'||attempt===49)throw error;await new Promise(resolve=>setTimeout(resolve,10));}
  }
  let lockStat;
  try{
   lockStat=await lock.stat();await checkDirectories();
   if(!lockStat.isFile()||lockStat.nlink!==1||(lockStat.mode&0o077)!==0||(typeof process.getuid==='function'&&lockStat.uid!==process.getuid()))throw Error('Unsafe diagnostic lock');
   const filename=path.join(dir,'codex.jsonl');let existing;
   try{existing=await fs.lstat(filename);}catch(error){if(error.code!=='ENOENT')throw error;}
   if(existing&&(!existing.isFile()||existing.isSymbolicLink()||existing.nlink!==1||(existing.mode&0o077)!==0||(typeof process.getuid==='function'&&existing.uid!==process.getuid())))throw Error('Unsafe diagnostic file');
   const file=await fs.open(filename,constants.O_WRONLY|constants.O_APPEND|constants.O_CREAT|constants.O_NOFOLLOW|(constants.O_NONBLOCK??0),0o600);
   try{
    const stat=await file.stat(),named=await fs.lstat(filename);await checkDirectories();
    if(!stat.isFile()||stat.nlink!==1||(stat.mode&0o077)!==0||(typeof process.getuid==='function'&&stat.uid!==process.getuid())||stat.dev!==named.dev||stat.ino!==named.ino)throw Error('Unsafe diagnostic file');
    const line=Buffer.from(JSON.stringify(data)+'\n');if(stat.size+line.length>maxBytes)throw Error('Diagnostic storage full');
    const written=await file.write(line);if(written.bytesWritten!==line.length){const after=await file.stat();if(after.size===stat.size+written.bytesWritten)await file.truncate(stat.size);throw Error('Incomplete diagnostic write');}
    await file.sync();
   }finally{await file.close();}
   const directory=await fs.open(dir,'r');try{await directory.sync();}finally{await directory.close();}
  }finally{
   await lock.close();
   if(lockStat)try{await checkDirectories();const named=await fs.lstat(lockPath);if(named.isFile()&&!named.isSymbolicLink()&&named.dev===lockStat.dev&&named.ino===lockStat.ino)await fs.unlink(lockPath);}catch{/* Leave an uncertain lock untouched. */}
  }
 }};
}
