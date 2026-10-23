import fs from 'node:fs';
import path from 'node:path';
import {initializeCooperativeWorkflow,commandResult} from './bootstrap.mjs';
import {runCooperativeCommand} from './cooperative.mjs';
import {validateWorkflowId} from './scope.mjs';
export async function runWorkflowCommand(args,io={}){
 const output=io.output??process.stdout;let workflowId=null;
 try{
  const [command,...rest]=args,options={};
  if(!['init','record','status','reconcile','prepare','result'].includes(command))throw Error('Expected workflow command');
  for(let i=0;i<rest.length;i+=2){const key=rest[i];if(!['--cwd','--workflow','--input'].includes(key)||options[key]!==undefined||typeof rest[i+1]!=='string')throw Error('Invalid workflow option');options[key]=rest[i+1];}
  const cwd=options['--cwd'];workflowId=options['--workflow'];validateWorkflowId(workflowId);
  if(typeof cwd!=='string'||!path.isAbsolute(cwd)||path.normalize(cwd)!==cwd)throw Error('Absolute workspace required');
  if(command==='status'?options['--input']!==undefined:options['--input']!=='-')throw Error('Mutations require --input -; status takes no input');
  // Check/review, commit and external intents are recorded for the operator.
  // Actual Git mutations remain Orchestrator actions; reconciliation observes their results.
  const input=command==='status'?undefined:JSON.parse(io.input??fs.readFileSync(0,'utf8'));
  const result=await(command==='init'?initializeCooperativeWorkflow({cwd,workflowId,input}):runCooperativeCommand({cwd,workflowId,command,input}));
  output.write(JSON.stringify(result)+'\n');return result.decision==='deny'?2:result.decision==='hold'?3:0;
 }catch(error){output.write(JSON.stringify(commandResult({workflowId,decision:'hold',ruleId:'cooperative.error',error:error.message}))+'\n');return 1;}
}
