import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createNativeDiagnosticStorage,recordNativeDiagnostic} from './native-diagnostics.mjs';

/** Codex's native callback is diagnostic only; it never invokes the policy gate. */
export async function runNativeHook({platform,input,installation,storage}){
 if(platform!=='codex')throw Error('Native provider unavailable');
 try{await recordNativeDiagnostic({input,installation,storage});}catch{/* Diagnostics never become a policy decision. */}
 return {};
}

async function readInstallation(entryPoint){
 if(constants.O_NOFOLLOW===undefined)throw Error('Native installation unavailable');
 const filename=path.join(path.dirname(path.dirname(entryPoint)),'native-hooks.json'),named=await fs.lstat(filename);
 if(!named.isFile()||named.isSymbolicLink()||named.size>65536)throw Error('Native installation unavailable');
 const file=await fs.open(filename,constants.O_RDONLY|constants.O_NOFOLLOW|(constants.O_NONBLOCK??0));
 try{
  const stat=await file.stat();if(!stat.isFile()||stat.dev!==named.dev||stat.ino!==named.ino||stat.size>65536)throw Error('Native installation unavailable');
  const record=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await file.readFile()));
  if(record?.platform!=='codex'||record.mode!=='diagnostic'||typeof record.entryPoint!=='string'||!path.isAbsolute(record.entryPoint)||path.resolve(record.entryPoint)!==path.resolve(entryPoint))throw Error('Native provider unavailable');
  return {definitionHash:record.hash,runtimeHash:record.runtimeHash,platformVersion:record.cli?.version};
 }finally{await file.close();}
}
async function readPayload(stream){
 const chunks=[];let size=0;for await(const chunk of stream){const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=bytes.length;if(size>1024*1024)throw Error('Native payload too large');chunks.push(bytes);}
 const input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid native payload');
 return input;
}
/** This entrypoint accepts only a Codex installation record and never emits a policy response. */
export async function runCodexNativeEntrypoint({entryPoint=fileURLToPath(import.meta.url),input=process.stdin,userHome=os.homedir()}={}){
 const installation=await readInstallation(entryPoint);
 let payload;try{payload=await readPayload(input);}catch{return;}
 await runNativeHook({platform:'codex',input:payload,installation,storage:createNativeDiagnosticStorage({userHome})});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{await runCodexNativeEntrypoint();}catch{process.exitCode=1;}
}
