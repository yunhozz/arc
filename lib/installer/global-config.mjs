import{languagePolicy}from'./language.mjs';
import{isDeepStrictEqual}from'node:util';import{parseToml}from'../models/config.mjs';
import path from 'node:path';
import {buildRuntimeObserverCommand,isRuntimeObserverCommand} from '../policy/claude-hook.mjs';
export class GlobalConfigurationError extends Error{constructor(message,options){super(message,options);this.name='GlobalConfigurationError';this.code='ARC_GLOBAL_CONFIGURATION';}}
const fail=message=>{throw new GlobalConfigurationError(message);};
const BEGIN='<!-- arc:begin -->',END='<!-- arc:end -->';
const OBSERVER_BEGIN='# arc:planner-observer:begin',OBSERVER_END='# arc:planner-observer:end';
const observerEvents=['PreToolUse','PostToolUse','SubagentStart'];
function decode(bytes){if(bytes===null)return'';if(!Buffer.isBuffer(bytes))fail('Global configuration must be read as bytes');try{return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{fail('Global file is not UTF-8; fix it or use --skip-global');}}
export function removeManagedBlock(original){return removeBlock(original,false,true);}
function removeBlock(original,consumeEol,consumeTerminalEol=false){
 const text=decode(original);
 if(/<!--\s*[A-Za-z0-9_-]+\s*:\s*begin\b[^\r\n]*managed\s+by\s+install\.py/i.test(text)||/<!--\s*(?!arc\s*:)[A-Za-z0-9_-]+\s*:\s*(?:begin|end)\b/i.test(text))fail('Unsupported prior managed markers; automatic migration is not supported');
 const begins=text.split(BEGIN).length-1,ends=text.split(END).length-1,starts=[...text.matchAll(/<!--\s*arc\b/gi)].length;
 if(starts!==begins+ends||begins!==ends||begins>1||(begins&&text.indexOf(BEGIN)>text.indexOf(END)))fail('Malformed ARC managed markers');
 let rest=text;if(begins){const start=text.indexOf(BEGIN);let stop=text.indexOf(END)+END.length;if(consumeEol||consumeTerminalEol&&/^(?:\r\n|\n)*$/.test(text.slice(stop))){if(text.slice(stop,stop+2)==='\r\n')stop+=2;else if(text[stop]==='\n')stop++;}rest=text.slice(0,start)+text.slice(stop);}
 return{content:Buffer.from(rest),changed:Boolean(begins)};
}
export function renderManagedBlock(original,body){
 const text=decode(original),eol=/\r?\n/.exec(text)?.[0]??'\n';
 const {content:removed}=removeBlock(original,true);
 const begins=text.includes(BEGIN);let rest=removed.toString('utf8');
 const outside=rest;
 if(rest&&!rest.endsWith('\n'))rest+=eol;
 const separator=!rest||rest.endsWith(eol+eol)?'':eol;
 const normalizedBody=body.replace(/\r?\n/g,eol);const block=BEGIN+eol+'## Agent Role Coordination'+eol+eol+normalizedBody+(normalizedBody.endsWith(eol)?'':eol)+END+eol;
 return{content:Buffer.from(rest+separator+block),action:original===null?'create with managed ARC block':begins?'update managed ARC block at the end':'append managed ARC block',notes:/^(#{1,6})[ \t]+(?:\d+\.[ \t]*)?(?:ARC|Agent Role Coordination)[ \t]*\r?$/im.test(outside)?['An existing ARC section outside the managed block was preserved']:[]};
}
export function renderWaitSettings(original){
 const text=decode(original);let data;try{data=parseToml(text);}catch(cause){throw new GlobalConfigurationError(`Cannot parse Codex config.toml: ${cause.message}`,{cause});}
 const wanted={min_wait_timeout_ms:120000n,default_wait_timeout_ms:300000n};const features=data.features,current=features?.multi_agent_v2;
 if(current&&typeof current==='object'&&Object.entries(wanted).every(([k,v])=>current[k]===v))return{content:Buffer.from(text),action:'unchanged'};
 const manual=reason=>({content:null,action:`skip: set [features.multi_agent_v2] wait settings manually (${reason})`});
 const lines=text.match(/[^\n]*\n|[^\n]+$/g)??[],eol=/\r?\n/.exec(text)?.[0]??'\n';
 const index=lines.findIndex(line=>/^[ \t]*\[[ \t]*features[ \t]*\.[ \t]*multi_agent_v2[ \t]*\][ \t]*(?:#[^\r\n]*)?\r?\n?$/.test(line));
 if(features!==undefined&&(!features||typeof features!=='object'||Array.isArray(features))||current!==undefined&&(!current||typeof current!=='object'||Array.isArray(current)||index<0))return manual('features.multi_agent_v2 is not its own table');
 let updated;if(index<0){let prefix=text;if(prefix&&!prefix.endsWith('\n'))prefix+=eol;if(prefix&&!prefix.endsWith(eol+eol))prefix+=eol;updated=prefix+'[features.multi_agent_v2]'+eol+Object.entries(wanted).map(([k,v])=>`${k} = ${v}${eol}`).join('');}
 else{if(!lines[index].endsWith('\n'))lines[index]+=eol;let end=lines.findIndex((line,i)=>i>index&&/^[ \t]*\[/.test(line));if(end<0)end=lines.length;const section=lines.slice(index+1,end),remaining=new Map(Object.entries(wanted));for(let i=0;i<section.length;i++){const m=/^([ \t]*(min_wait_timeout_ms|default_wait_timeout_ms)[ \t]*=[ \t]*)([^#\r\n]*?)([ \t]*(?:#[^\r\n]*)?)(\r?\n)?$/.exec(section[i]);if(m&&remaining.has(m[2])){section[i]=m[1]+remaining.get(m[2])+m[4]+(m[5]??'');remaining.delete(m[2]);}}
 let insertion=section.length;while(insertion&&!section[insertion-1].trim())insertion--;if(insertion&& !section[insertion-1].endsWith('\n'))section[insertion-1]+=eol;section.splice(insertion,0,...[...remaining].map(([k,v])=>`${k} = ${v}${eol}`));updated=[...lines.slice(0,index+1),...section,...lines.slice(end)].join('');}
 const expected=parseToml(text);expected.features??=Object.create(null);expected.features.multi_agent_v2??=Object.create(null);Object.assign(expected.features.multi_agent_v2,wanted);
 try{if(!isDeepStrictEqual(parseToml(updated),expected))return manual('automatic edit could not be verified');}catch{return manual('automatic edit could not be verified');}
 return{content:Buffer.from(updated),action:'set ARC wait settings'};
}

export function removeRuntimeObserverHooks({platform,original}){
 const text=decode(original);if(!text)return {content:Buffer.from(text),changed:false};
 if(platform==='codex'){
  const begins=text.split(OBSERVER_BEGIN).length-1,ends=text.split(OBSERVER_END).length-1;
  if(begins!==ends||begins>1||begins&&text.indexOf(OBSERVER_BEGIN)>text.indexOf(OBSERVER_END))fail('Malformed ARC observer markers');
  if(!begins)return {content:Buffer.from(text),changed:false};
  const start=text.indexOf(OBSERVER_BEGIN),finish=text.indexOf(OBSERVER_END)+OBSERVER_END.length;
  const block=text.slice(start+OBSERVER_BEGIN.length,text.indexOf(OBSERVER_END)),data=parseToml(block);
  if(Object.keys(data).length!==1||!data.hooks||Object.keys(data.hooks).length!==3||observerEvents.some(event=>!Array.isArray(data.hooks[event])||data.hooks[event].length!==1||data.hooks[event][0].matcher!==(event==='SubagentStart'?'*':'Agent')||data.hooks[event][0].hooks?.length!==1||!isRuntimeObserverCommand(data.hooks[event][0].hooks[0].command)||data.hooks[event][0].hooks[0].type!=='command'||Object.keys(data.hooks[event][0]).some(k=>!['matcher','hooks'].includes(k))||Object.keys(data.hooks[event][0].hooks[0]).some(k=>!['type','command','timeout'].includes(k))))fail('Edited ARC observer block requires manual resolution');
  let end=finish;if(text.slice(end,end+2)==='\r\n')end+=2;else if(text[end]==='\n')end++;
  return {content:Buffer.from(text.slice(0,start)+text.slice(end)),changed:true};
 }
 if(platform!=='claude')fail('Unknown observer platform');
 const data=JSON.parse(text);if(!data||typeof data!=='object'||Array.isArray(data))fail('Claude settings must be an object');let changed=false;
 if(data.hooks!==undefined){
  if(!data.hooks||typeof data.hooks!=='object'||Array.isArray(data.hooks))fail('Claude hooks must be an object');
  for(const event of observerEvents){
   if(data.hooks[event]===undefined)continue;if(!Array.isArray(data.hooks[event]))fail('Claude hook event must be an array');
   data.hooks[event]=data.hooks[event].flatMap(group=>{
    if(!group||!Array.isArray(group.hooks))fail('Claude hook group must contain handlers');
    const handlers=group.hooks.filter(h=>{if(isRuntimeObserverCommand(h?.command)){changed=true;return false;}return true;});return handlers.length?[{...group,hooks:handlers}]:[];
   });if(!data.hooks[event].length)delete data.hooks[event];
  }
  if(!Object.keys(data.hooks).length)delete data.hooks;
 }
 return {content:changed?Buffer.from(JSON.stringify(data,null,2)+'\n'):Buffer.from(text),changed};
}
/** Installed hooks only observe until a trusted context provider is available. */
export function renderRuntimeObserverHooks({platform,original,skillPath}){
 const removed=removeRuntimeObserverHooks({platform,original}),text=removed.content.toString(),command=buildRuntimeObserverCommand(path.join(skillPath,'hooks/runtime-gate.mjs'));
 let content;
 if(platform==='codex'){
  const eol=/\r?\n/.exec(text)?.[0]??'\n',prefix=text&&!text.endsWith('\n')?text+eol:text;
  const block=observerEvents.map(event=>`[[hooks.${event}]]${eol}matcher = "${event==='SubagentStart'?'*':'Agent'}"${eol}[[hooks.${event}.hooks]]${eol}type = "command"${eol}command = ${JSON.stringify(command)}${eol}timeout = 10${eol}`).join(eol);
  content=Buffer.from(prefix+OBSERVER_BEGIN+eol+block+OBSERVER_END+eol);
  const expected=parseToml(text);expected.hooks??=Object.create(null);const parsedBlock=parseToml(block);
  for(const event of observerEvents){if(expected.hooks[event]!==undefined&&!Array.isArray(expected.hooks[event]))fail('Unsupported Codex hook representation');expected.hooks[event]=[...(expected.hooks[event]??[]),...parsedBlock.hooks[event]];}
  if(!isDeepStrictEqual(parseToml(content.toString()),expected))fail('Cannot preserve Codex hooks while adding observer');
 }else if(platform==='claude'){
  const data=text?JSON.parse(text):{};data.hooks??={};
  for(const event of observerEvents){data.hooks[event]??=[];if(!Array.isArray(data.hooks[event]))fail('Claude hook event must be an array');data.hooks[event].push({matcher:event==='SubagentStart'?'*':'Agent',hooks:[{type:'command',command,timeout:10,onFailure:'continue'}]});}
  content=Buffer.from(JSON.stringify(data,null,2)+'\n');
 }else fail('Unknown observer platform');
 return {content,action:'set ARC Planner observation hooks',enforcement:'observation-only',nativeVerified:false,notes:['Planner hooks record observations; trusted native context and host denial remain unverified.']};
}
export function agentsBlockBody(home,userHome,language='en',platform='codex'){const skill=home+'/skills/arc/SKILL.md',within=skill.startsWith(userHome+'/'),shown=within?'~/'+skill.slice(userHome.length+1):skill;return '- '+languagePolicy(language)+'\n'+'- For requests requiring substantive multi-step research, analysis, or implementation, configuration, or test work, and for design, spec, plan, and brainstorming requests (these are NOT standalone document writing), load and follow `'+shown+'`; keep following it in relevant follow-up turns of the same chat without re-reading it unless it changed.'+(within?" Resolve `~` to the current user's home directory.":'')+' ARC subagents (depth 2) follow their role profile and brief instead and do not load `SKILL.md`.\n'+'- Design, spec, plan, and brainstorming drafts are authored ONLY by the Planner. Orchestrator MUST NEVER author them; route drafting skills to the Planner.\n'+
'- For repository implementation, configuration, or test work, Orchestrator owns coordination and acceptance; assign file edits and other work to the other roles according to their defined responsibilities. Orchestrator must not edit implementation, configuration, or test-code files directly, except under the ARC Orchestrator direct path for small, low-risk tasks.\n';}
