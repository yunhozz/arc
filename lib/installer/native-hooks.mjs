import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {parseToml} from '../models/config.mjs';
import {parseClaudeSettings} from './runtime-config.mjs';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const plain=v=>Array.isArray(v)?v.map(plain):object(v)?Object.fromEntries(Object.entries(v).map(([k,value])=>[k,plain(value)])):v;
const sameGroup=(a,b)=>isDeepStrictEqual(plain(a),plain(b));
const recordHash=r=>hash({platform:r.platform,event:r.event,entryPoint:r.entryPoint,settingsPath:r.settingsPath,mode:r.mode,cli:r.cli,group:r.group,createdHooks:r.createdHooks,createdEvent:r.createdEvent,block:r.block,blockOffset:r.blockOffset,blockIndex:r.blockIndex});
const supported=version=>{if(typeof version!=='string'||!/^\d+\.\d+\.\d+$/.test(version))return false;const [major,minor,patch]=version.split('.').map(Number);return major>2||major===2&&(minor>1||minor===1&&patch>=295);};
const quote=s=>`'${s.replaceAll("'", "'\\''")}'`;
const decode=original=>original===null?'':new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(original);
function parsed(platform,text) {
 const data=platform==='claude'?parseClaudeSettings(text):platform==='codex'?parseToml(text):null;
 if(!data)throw new Error('Unknown native platform');
 if(data.hooks!==undefined&&!object(data.hooks))throw new Error('Invalid hooks table');
 if(data.hooks?.PreToolUse!==undefined&&!Array.isArray(data.hooks.PreToolUse))throw new Error('Invalid PreToolUse hooks');
 return data;
}
function validRecord(platform,r) {
 return object(r)&&r.platform===platform&&r.event==='PreToolUse'&&object(r.group)&&r.hash===recordHash(r)&&typeof r.entryPoint==='string';
}
function groups(data){return data.hooks?.PreToolUse??[];}
function similar(group,entryPoint) {return JSON.stringify(group).includes(entryPoint);}
function conflict(original,message,entryPoint,remove=false) {
 return remove?{content:original,removed:false,conflicts:[message],retainedReferences:[entryPoint].filter(Boolean)}:{content:original,record:null,action:'conflict',conflicts:[message],notes:[]};
}
export function buildNativeHookDefinitions({platform,entryPoint,nodePath,cli,settingsPath=null}) {
 if(!['codex','claude'].includes(platform)||typeof entryPoint!=='string'||!entryPoint||typeof nodePath!=='string'||!nodePath)throw new Error('Invalid native hook definition');
 const handler=platform==='claude'?{type:'command',command:nodePath,args:[entryPoint]}:{type:'command',command:`${quote(nodePath)} ${quote(entryPoint)}`};
 if(platform==='claude'&&cli?.status==='detected'&&cli.failureBlocking===true&&supported(cli.version))handler.onFailure='block';
 return {platform,event:'PreToolUse',entryPoint,settingsPath,mode:platform==='codex'?'diagnostic':'gate',cli:cli??null,group:{hooks:[handler]}};
}
function codexBlock(group,eol) {
 return `${eol}[[hooks.PreToolUse]]${eol}[[hooks.PreToolUse.hooks]]${eol}type = "command"${eol}command = ${JSON.stringify(group.hooks[0].command)}${eol}`;
}
export function renderNativeHooks({platform,original,definitions,previousRecord}) {
 const text=decode(original),data=parsed(platform,text);
 if(!object(definitions)||definitions.platform!==platform||definitions.event!=='PreToolUse'||!object(definitions.group)||typeof definitions.entryPoint!=='string')throw new Error('Invalid native hook definitions');
 const all=groups(data),equal=all.filter(g=>sameGroup(g,definitions.group));
 if(previousRecord) {
  if(!validRecord(platform,previousRecord)||previousRecord.settingsPath!==definitions.settingsPath||previousRecord.mode!==definitions.mode)return conflict(original,'Invalid ownership record',definitions.entryPoint);
  const prior=all.filter(g=>sameGroup(g,previousRecord.group));
  if(prior.length!==1||all.some(g=>!sameGroup(g,previousRecord.group)&&(similar(g,previousRecord.entryPoint)||similar(g,definitions.entryPoint))))return conflict(original,'Owned hook missing or ambiguous',previousRecord.entryPoint);
  if(platform!=='codex'){
   if(previousRecord.entryPoint!==definitions.entryPoint||!sameGroup(previousRecord.cli,definitions.cli))return conflict(original,'Ownership metadata changed',previousRecord.entryPoint);
   if(sameGroup(previousRecord.group,definitions.group))return {content:original,record:previousRecord,action:'unchanged',conflicts:[],notes:[]};
   return conflict(original,'Owned hook requires removal before replacement',previousRecord.entryPoint);
  }
  const oldBlock=previousRecord.block,index=all.findIndex(g=>sameGroup(g,previousRecord.group)),offset=typeof oldBlock==='string'?(previousRecord.blockIndex===undefined?(text.endsWith(oldBlock)?text.length-oldBlock.length:-1):text.indexOf(oldBlock)):-1;
  if(typeof oldBlock!=='string'||!Number.isSafeInteger(offset)||offset<0||(previousRecord.blockIndex!==undefined&&(!Number.isSafeInteger(previousRecord.blockIndex)||previousRecord.blockIndex!==index))||text.slice(offset,offset+oldBlock.length)!==oldBlock||text.indexOf(oldBlock)!==offset||text.lastIndexOf(oldBlock)!==offset||oldBlock!==codexBlock(previousRecord.group,/\r?\n/.exec(oldBlock)?.[0]??'\n'))return conflict(original,'Owned hook text changed or moved',previousRecord.entryPoint);
  const sameDefinition=sameGroup(previousRecord.group,definitions.group),sameMetadata=previousRecord.entryPoint===definitions.entryPoint&&sameGroup(previousRecord.cli,definitions.cli);
  if(sameDefinition&&sameMetadata&&(previousRecord.blockIndex===undefined||previousRecord.blockOffset===offset))return {content:original,record:previousRecord,action:'unchanged',conflicts:[],notes:[]};
  const block=sameDefinition?oldBlock:codexBlock(definitions.group,/\r?\n/.exec(oldBlock)?.[0]??'\n');
  const updated=text.slice(0,offset)+block+text.slice(offset+oldBlock.length),expected=parsed(platform,text);
  expected.hooks.PreToolUse[index]=definitions.group;
  if(!sameGroup(parsed(platform,updated),expected))return conflict(original,'Cannot safely replace owned hook',previousRecord.entryPoint);
  const record={...definitions,createdHooks:previousRecord.createdHooks,createdEvent:previousRecord.createdEvent,block,blockOffset:offset,blockIndex:index};record.hash=recordHash(record);
  return {content:Buffer.from(updated),record,action:'updated',conflicts:[],notes:['Registration does not establish host trust or execution']};
 }
 if(equal.length||all.some(g=>similar(g,definitions.entryPoint)))return conflict(original,'Existing hook may refer to ARC entry point',definitions.entryPoint);
 const record={...definitions,createdHooks:data.hooks===undefined,createdEvent:data.hooks?.PreToolUse===undefined};
 let content;
 if(platform==='claude') {
  data.hooks??={};data.hooks.PreToolUse??=[];data.hooks.PreToolUse.push(definitions.group);
  content=Buffer.from(JSON.stringify(data,null,2)+'\n');
 } else {
  const eol=/\r?\n/.exec(text)?.[0]??'\n',block=codexBlock(definitions.group,eol);
  const updated=text+block; const next=parsed(platform,updated);
  if(groups(next).length!==all.length+1||!sameGroup(groups(next).at(-1),definitions.group))throw new Error('Cannot safely add Codex hook');
  record.block=block;record.blockOffset=text.length;record.blockIndex=all.length;content=Buffer.from(updated);
 }
 record.hash=recordHash(record);
 return {content,record,action:'added',conflicts:[],notes:['Registration does not establish host trust or execution']};
}
export function removeNativeHooks({platform,original,record}) {
 const text=decode(original),data=parsed(platform,text);
 if(!validRecord(platform,record))return conflict(original,'Invalid ownership record',record?.entryPoint,true);
 const all=groups(data),matches=all.filter(g=>sameGroup(g,record.group));
 if(matches.length!==1||all.some(g=>!sameGroup(g,record.group)&&similar(g,record.entryPoint)))return conflict(original,'Owned hook missing or ambiguous',record.entryPoint,true);
 let content;
 if(platform==='claude') {
  data.hooks.PreToolUse.splice(all.findIndex(g=>sameGroup(g,record.group)),1);
  if(record.createdEvent&&data.hooks.PreToolUse.length===0)delete data.hooks.PreToolUse;
  if(record.createdHooks&&Object.keys(data.hooks).length===0)delete data.hooks;
  content=Buffer.from(JSON.stringify(data,null,2)+'\n');
 } else {
  const block=record.block,index=all.findIndex(g=>sameGroup(g,record.group)),offset=typeof block==='string'?(record.blockIndex===undefined?(text.endsWith(block)?text.length-block.length:-1):text.indexOf(block)):-1;
  if(typeof block!=='string'||!Number.isSafeInteger(offset)||offset<0||(record.blockIndex!==undefined&&(!Number.isSafeInteger(record.blockIndex)||record.blockIndex!==index))||text.slice(offset,offset+block.length)!==block||text.indexOf(block)!==offset||text.lastIndexOf(block)!==offset||block!==codexBlock(record.group,/\r?\n/.exec(block)?.[0]??'\n'))return conflict(original,'Owned hook text changed or moved',record.entryPoint,true);
  const updated=text.slice(0,offset)+text.slice(offset+block.length),next=parsed(platform,updated),expected=parsed(platform,text);
  expected.hooks.PreToolUse.splice(all.findIndex(g=>sameGroup(g,record.group)),1);
  if(expected.hooks.PreToolUse.length===0)delete expected.hooks.PreToolUse;
  if(Object.keys(expected.hooks).length===0)delete expected.hooks;
  if(!sameGroup(next,expected))return conflict(original,'Cannot safely remove owned hook',record.entryPoint,true);
  content=Buffer.from(updated);
 }
 return {content,removed:true,conflicts:[],retainedReferences:[]};
}
