import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
export const absolute=value=>typeof value==='string'&&path.isAbsolute(value)&&path.normalize(value)===value;
export const within=(base,file)=>absolute(file)&&!path.relative(base,file).split(path.sep).includes('..')&&!path.isAbsolute(path.relative(base,file));
/** Inspect every component, including ancestors outside the ARC namespace. */
export async function inspectPath(filename,{missing=false,directory=false}={}){
 if(!absolute(filename))throw Error('Unsafe absolute path');
 let cursor=path.parse(filename).root;
 const parts=filename.slice(cursor.length).split(path.sep).filter(Boolean);
 for(let i=0;i<parts.length;i++){
  cursor=path.join(cursor,parts[i]);let stat;
  try{stat=await fs.lstat(cursor);}catch(error){if(missing&&error.code==='ENOENT')return;throw error;}
  if(stat.isSymbolicLink())throw Error('Unsafe symlink path');
  if(i<parts.length-1||directory){if(!stat.isDirectory())throw Error('Unsafe directory type');}
  else if(!stat.isFile())throw Error('State must be a regular file');
 }
}
export function validateWorkflowId(id){if(typeof id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id))throw Error('Invalid workflow ID');return id;}
/** Shell-free, read-only observation; inherited Git target/config overrides are removed. */
export async function observeCooperativeTarget(cwd){
 if(!absolute(cwd))throw Error('Absolute workspace required');await inspectPath(cwd,{directory:true});
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.toUpperCase().startsWith('GIT_')));
 Object.assign(env,{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null',GIT_OPTIONAL_LOCKS:'0',GIT_NO_REPLACE_OBJECTS:'1',GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0'});
 const query=(args,detached=false)=>{const r=spawnSync('git',['--no-pager','-c','core.fsmonitor=false',...args],{cwd,env,encoding:'utf8',timeout:10000,maxBuffer:1024*1024});if(detached&&r.status===1&&!r.error)return null;if(r.status!==0||r.error||!r.stdout.endsWith('\n')||r.stdout.slice(0,-1).includes('\n'))throw Error('Git target observation failed');return r.stdout.slice(0,-1);};
 const target={realpath:query(['rev-parse','--show-toplevel']),gitCommonDir:query(['rev-parse','--path-format=absolute','--git-common-dir']),gitDir:query(['rev-parse','--absolute-git-dir']),head:query(['rev-parse','HEAD']),branch:query(['symbolic-ref','--quiet','--short','HEAD'],true)};
 await validateObservedTarget(cwd,target);return target;
}
export async function validateObservedTarget(cwd,target){
 if(!absolute(cwd)||!target||target.realpath!==cwd||!absolute(target.gitCommonDir)||!absolute(target.gitDir)||!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(target.head)||!(target.branch===null||typeof target.branch==='string'&&target.branch))throw Error('Invalid observed target');
 await inspectPath(cwd,{directory:true});await inspectPath(target.gitCommonDir,{directory:true});
 return target;
}
export async function workflowStatePath(target,workflowId){
 validateWorkflowId(workflowId);const statePath=path.join(target.gitCommonDir,'arc','workflows',workflowId,'state.json');await inspectPath(statePath,{missing:true});return statePath;
}
