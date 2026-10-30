import {isDeepStrictEqual} from 'node:util';
import {parseToml} from '../models/config.mjs';
const KEY='max_concurrent_threads_per_session';
const ENV='CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS';
const fail=message=>{throw new Error(message);};
function decode(bytes) {
 if(bytes===null)return '';
 if(!Buffer.isBuffer(bytes))fail('Runtime configuration must be bytes');
 return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
}
function object(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&!(value instanceof Date);}
function positive(value){if(!Number.isSafeInteger(value)||value<1)fail('Concurrency must be a positive safe integer');return value;}
function codex(text) {
 const data=parseToml(text);
 if(data.agents!==undefined&&!object(data.agents))fail('Codex agents must be a table');
 const value=data.agents?.[KEY];
 if(value!==undefined&&(typeof value!=='bigint'||value<1n||value>BigInt(Number.MAX_SAFE_INTEGER)))fail('Invalid Codex concurrency integer');
 return data;
}
export function readRuntimeConcurrency(platform,original) {
 const text=decode(original);
 if(platform==='codex'){const value=codex(text).agents?.[KEY];return value===undefined?null:Number(value);}
 if(platform==='claude'){const value=parseClaudeSettings(text).env?.[ENV];return value===undefined?null:Number(value);}
 fail('Unknown runtime platform');
}
export function renderCodexConcurrency(original,value) {
 positive(value);const text=decode(original),data=codex(text);
 if(data.agents?.[KEY]===BigInt(value))return {content:Buffer.from(text),action:'unchanged'};
 const eol=/\r?\n/.exec(text)?.[0]??'\n',lines=text.match(/[^\n]*\n|[^\n]+$/g)??[];
 const header=/^[ \t]*\[[ \t]*agents[ \t]*\][ \t]*(?:#[^\r\n]*)?\r?\n?$/;
 const index=lines.findIndex(line=>header.test(line));
 let updated;
 if(index<0) {
  // An explicit agents value (inline or dotted) requires manual editing.
  if(data.agents!==undefined&&!lines.some(line=>/^\s*\[agents\./.test(line)))fail('Unsupported Codex agents representation');
  let prefix=text;if(prefix&&!prefix.endsWith('\n'))prefix+=eol;
  updated=prefix+`[agents]${eol}${KEY} = ${value}${eol}`;
 } else {
  let end=lines.findIndex((line,i)=>i>index&&/^[ \t]*\[/.test(line));if(end<0)end=lines.length;
  let found=false;
  for(let i=index+1;i<end;i++) {
   const match=/^([ \t]*max_concurrent_threads_per_session[ \t]*=[ \t]*)([^#\r\n]*?)([ \t]*(?:#[^\r\n]*)?)(\r?\n)?$/.exec(lines[i]);
   if(match){if(found)fail('Ambiguous Codex concurrency');found=true;lines[i]=match[1]+value+match[3]+(match[4]??'');}
  }
  if(data.agents?.[KEY]!==undefined&&!found)fail('Unsupported Codex concurrency representation');
  if(!found){if(!lines[end-1].endsWith('\n'))lines[end-1]+=eol;lines.splice(end,0,`${KEY} = ${value}${eol}`);}
  updated=lines.join('');
 }
 const expected=parseToml(text);expected.agents??=Object.create(null);expected.agents[KEY]=BigInt(value);
 if(!isDeepStrictEqual(parseToml(updated),expected))fail('Cannot verify safe Codex concurrency edit');
 return {content:Buffer.from(updated),action:'set Codex concurrency'};
}
export function parseClaudeSettings(text) {
 const data=text===''?{}:JSON.parse(text);
 // Validate duplicate names before JSON.parse can silently discard them.
 const tokens=[...text.matchAll(/"(?:[^"\\]|\\[\s\S])*"|[{}\[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g)].map(match=>match[0]);
 const stack=[];
 for(let i=0;i<tokens.length;i++) {
  const token=tokens[i];
  if(token==='{')stack.push(new Set());
  else if(token==='[')stack.push(null);
  else if(token==='}'||token===']')stack.pop();
  else if(token.startsWith('"')&&tokens[i+1]===':') {
   const key=JSON.parse(token),keys=stack.at(-1);
   if(keys?.has(key))fail('Duplicate Claude settings key');
   keys?.add(key);
  } else if(/^-?\d/.test(token)) {
   const number=Number(token);
   if(!Number.isFinite(number)||Number.isInteger(number)&&!Number.isSafeInteger(number))fail('Unsafe Claude JSON number');
  }
 }
 if(!object(data))fail('Claude settings root must be an object');
 if(data.env!==undefined&&!object(data.env))fail('Claude env must be an object');
 const value=data.env?.[ENV];
 if(value!==undefined&&(typeof value!=='string'||! /^[0-9]+$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)<1))fail('Invalid Claude concurrency string');
 return data;
}
export function renderClaudeConcurrency(original,value) {
 positive(value);const text=decode(original),data=parseClaudeSettings(text);
 if(data.env?.[ENV]===String(value))return {content:Buffer.from(text),action:'unchanged'};
 data.env??={};data.env[ENV]=String(value);
 const content=Buffer.from(JSON.stringify(data,null,2)+'\n');
 if(!isDeepStrictEqual(JSON.parse(content),data))fail('Cannot verify safe Claude concurrency edit');
 return {content,action:'set Claude concurrency'};
}
