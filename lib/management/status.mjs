import path from 'node:path';
import {createHash} from 'node:crypto';
import {renderNativeHooks} from '../installer/native-hooks.mjs';
import {resolveTarget,inspectPath,sameIdentity} from '../installer/targets.mjs';
import {parseLanguage} from '../installer/language.mjs';
import {parseLimits} from '../installer/limits.mjs';
import {loadModelConfig} from '../models/index.mjs';
import {removeManagedBlock} from '../installer/global-config.mjs';
import {readRuntimeConcurrency} from '../installer/runtime-config.mjs';
import {removeShellCompletion} from '../installer/shell-completion.mjs';
function callbackStatus(context,record){
 try{
  const root=path.join(context.userHome,'.arc','state','native-diagnostics'),snap=new Map();
  for(const directory of [path.join(context.userHome,'.arc'),path.join(context.userHome,'.arc','state'),root]){
   const found=inspectPath(context.safeFs,directory,{kind:'directory',snapshot:snap});if(!found.exists||(snap.get(directory).mode&0o077n)!==0n)return 'unknown';
   const handle=context.safeFs.openRoot(directory);try{const stat=handle.stat();if(!sameIdentity(stat,snap.get(directory))||typeof process.getuid==='function'&&stat.uid!==BigInt(process.getuid()))return 'unknown';}finally{handle.close();}
  }
  const filename=path.join(root,'codex.jsonl'),file=inspectPath(context.safeFs,filename,{kind:'file',read:true,snapshot:snap}),meta=snap.get(filename);
  if(!file.exists||(meta.mode&0o077n)!==0n||meta.size>1048576n)return 'unknown';
  const dir=context.safeFs.openRoot(root);try{const opened=dir.openFile('codex.jsonl',{read:true});try{const stat=opened.stat();if(!sameIdentity(stat,meta)||stat.nlink!==1n||typeof process.getuid==='function'&&stat.uid!==BigInt(process.getuid()))return 'unknown';}finally{opened.close();}}finally{dir.close();}
  const text=new TextDecoder('utf-8',{fatal:true}).decode(file.bytes);if(!text.endsWith('\n'))return 'unknown';
  const records=text.trimEnd().split('\n').map(line=>JSON.parse(line));
  const valid=r=>r&&typeof r==='object'&&!Array.isArray(r)&&Object.keys(r).sort().join(',')==='callback,definitionHash,event,observedAt,platform,platformVersion,runtimeHash'&&r.platform==='codex'&&r.callback===true&&['PreToolUse','SubagentStart','unknown'].includes(r.event)&&/^(?:sha256:)[a-f0-9]{64}$/.test(r.definitionHash)&&/^(?:sha256:)[a-f0-9]{64}$/.test(r.runtimeHash)&&/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(r.platformVersion)&&typeof r.observedAt==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(r.observedAt)&&Number.isFinite(Date.parse(r.observedAt))&&new Date(r.observedAt).toISOString()===r.observedAt;
  if(!records.length||!records.every(valid))return 'unknown';
  return records.some(r=>r.definitionHash==='sha256:'+record.hash&&r.runtimeHash==='sha256:'+record.runtimeHash&&r.platformVersion===record.cli?.version)?'recorded':'unknown';
 }catch{return 'unknown';}
}
/** @typedef {{platform:string,target?:object,state:'absent'|'installed'|'incomplete',settings?:object,diagnostics:Error[]}} TargetStatus */
export async function collectStatus(context){return ['codex','claude'].map(platform=>{
 let target;try{target=resolveTarget(platform,context);const snapshot=new Map(),read=(name,kind='file')=>inspectPath(context.safeFs,name,{kind,read:true,snapshot,tree:kind==='directory',allowLinks:kind==='directory'}),arc=path.join(target.home,'skills/arc'),skill=read(arc,'directory'),profiles=target.profileNames.map(name=>read(path.join(target.home,'agents',name))),instruction=read(target.instructionPath),managed=instruction.exists&&removeManagedBlock(instruction.bytes).changed;
 if(!skill.exists&&!profiles.some(x=>x.exists)&&!managed)return{platform,target,state:'absent',diagnostics:[]};
 const mandatory=name=>{const found=read(path.join(arc,name));if(!found.exists||!found.bytes.length)throw Error(`Incomplete ARC installation: missing ${name} at ${target.home}`);return found.bytes;};
 mandatory('SKILL.md');if(profiles.some(x=>!x.exists||!x.bytes.length))throw Error(`Incomplete ARC installation: missing profile at ${target.home}`);
 const settings={language:parseLanguage(mandatory('settings.toml')).language,modelConfig:loadModelConfig(mandatory('models.toml'),platform),limits:parseLimits(mandatory('limits.toml'))};const native=read(target.runtimeConfigPath);if(native.exists)readRuntimeConcurrency(platform,native.bytes);const shell=read(path.join(context.userHome,'.zshrc'));if(shell.exists)removeShellCompletion(shell.bytes);
 let nativeHooks={registration:'unknown',entrypoint:'unknown',trust:'unknown',callbackObserved:'unknown',mode:platform==='codex'?'diagnostic-only':'unsupported'};
 if(platform==='codex'){
  try{
   const owner=read(path.join(arc,'native-hooks.json'));
   if(!owner.exists)nativeHooks.registration='absent';
   else{
    const record=JSON.parse(owner.bytes),entry=read(path.join(arc,'runtime/native-hook.mjs'));
    if(record.entryPoint===path.join(arc,'runtime/native-hook.mjs')&&entry.exists&&createHash('sha256').update(entry.bytes).digest('hex')===record.runtimeHash)nativeHooks.entrypoint='connected';
    nativeHooks.callbackObserved=callbackStatus(context,record);
    if(native.exists&&record.settingsPath===target.runtimeConfigPath&&renderNativeHooks({platform:'codex',original:native.bytes,definitions:record,previousRecord:record}).action==='unchanged')nativeHooks.registration='registered';
   }
  }catch(error){nativeHooks.registration='unknown';}
 }
 return{platform,target,state:'installed',settings,snapshot,diagnostics:[],nativeHooks};
 }catch(error){return{platform,target,state:'incomplete',diagnostics:[error]};}
 });}
