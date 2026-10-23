import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {absolute,inspectPath,observeCooperativeTarget,workflowStatePath,validateWorkflowId} from '../runtime/scope.mjs';
import {validateCooperativeCommand} from '../runtime/cooperative-schema.mjs';
import {runWorkflowCommand} from '../runtime/command.mjs';
const invalid=message=>Object.assign(Error(message),{code:'ARC_CLI_INPUT'});
export async function observeWorkspace(cwd){
 await inspectPath(cwd,{directory:true});
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.toUpperCase().startsWith('GIT_')));
 Object.assign(env,{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null',GIT_OPTIONAL_LOCKS:'0',GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0'});
 const result=spawnSync('git',['--no-pager','-c','core.fsmonitor=false','rev-parse','--show-toplevel'],{cwd,env,encoding:'utf8',timeout:10000,maxBuffer:1024*1024});
 if(result.status!==0||result.error||!result.stdout.endsWith('\n')||result.stdout.slice(0,-1).includes('\n'))throw invalid('Cannot observe repository root.');
 return observeCooperativeTarget(result.stdout.slice(0,-1));
}
export async function readWorkflowJson(filename){
 if(!absolute(filename))throw invalid('An absolute JSON file path is required.');
 await inspectPath(filename);let input;try{input=JSON.parse(await fs.readFile(filename,'utf8'));}catch{throw invalid('Cannot parse workflow JSON file.');}
 return input;
}
export async function listWorkflows(cwd){
 const target=await observeWorkspace(cwd),directory=path.join(target.gitCommonDir,'arc','workflows');
 try{await inspectPath(directory,{directory:true});}catch(error){if(error.code==='ENOENT')return[];throw error;}
 const entries=await fs.readdir(directory,{withFileTypes:true}),items=[];
 for(const entry of entries){if(!entry.isDirectory())continue;try{validateWorkflowId(entry.name);}catch{continue;}
  const filename=await workflowStatePath(target,entry.name);try{const state=JSON.parse(await fs.readFile(filename,'utf8'));items.push({id:entry.name,revision:state.revision,target:state.target,foreign:!sameTarget(target,state.target)});}catch(error){if(error.code==='ENOENT')continue;items.push({id:entry.name,invalid:true});}
 }
 return items.sort((a,b)=>a.id.localeCompare(b.id));
}
function sameTarget(a,b){return b&&['realpath','gitCommonDir','gitDir','branch','head'].every(key=>a[key]===b[key]);}
export async function prepareWorkflow({cwd,workflowId,command,input,jsonPath}){
 validateWorkflowId(workflowId);const target=await observeWorkspace(cwd);cwd=target.realpath;const filename=await workflowStatePath(target,workflowId);
 if(jsonPath!==undefined)input=await readWorkflowJson(jsonPath);
 if(command!=='status'){try{validateCooperativeCommand({command,input});}catch{throw invalid('Invalid workflow input. Check the command schema; payload is not displayed.');}}
 else if(input!==undefined)throw invalid('Status takes no input.');
 if(!['init','status','record','prepare','result','reconcile'].includes(command))throw invalid('Invalid workflow command.');
 if(!['status','init'].includes(command)){const state=JSON.parse(await fs.readFile(filename,'utf8'));if(!sameTarget(target,state.target))throw invalid('Workflow target differs from this checkout or HEAD. Use the matching target before mutation.');}
 return{cwd,workflowId,command,input:input===undefined?undefined:structuredClone(input),target};
}
// Only expose structural status fields. Evidence payloads, operator statements,
// request arguments and runtime error text may contain secrets and stay private.
export function workflowView(body,code){
 const state=body.state;
 return{code,decision:body.decision,workflowId:body.workflowId,revision:body.revision,persisted:body.persisted,ruleIds:body.ruleIds??[],requiredEvidence:(body.requiredEvidence??[]).map(value=>typeof value==='string'?value:'Additional runtime evidence required'),nextActions:(body.nextActions??[]).map(value=>typeof value==='string'?value:'Consult installed runtime instructions'),...(body.error?{error:'Workflow command rejected. Check runtime inputs and target.'}:{}),...(state?{target:state.target,tasks:(state.tasks??[]).map(t=>({id:t.id,status:t.status})),unresolved:(state.unresolved??[]).map(()=> 'Unresolved runtime condition')}: {})};
}
export async function executeWorkflow(prepared){
 const current=await observeWorkspace(prepared.cwd);if(!sameTarget(current,prepared.target))return{code:3,decision:'hold',workflowId:prepared.workflowId,ruleIds:['cooperative.target'],error:'Workspace target changed. Review again.',nextActions:[]};
 let text='';const args=[prepared.command,'--cwd',prepared.cwd,'--workflow',prepared.workflowId];if(prepared.command!=='status')args.push('--input','-');
 const code=await runWorkflowCommand(args,{input:JSON.stringify(prepared.input),output:{write(chunk){text+=chunk;}}});
 return workflowView(JSON.parse(text),code);
}
