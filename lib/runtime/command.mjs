import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {initializeCooperativeWorkflow,commandResult} from './bootstrap.mjs';
import {runCooperativeCommand} from './cooperative.mjs';
import {validateWorkflowId} from './scope.mjs';
import {prepareRoleDispatch,routingStatus,invalidRoutingRequest} from './role-routing.mjs';
import {runBridgeDispatch,recordRoleObservation,resumeRoleDispatch,cancelRoleDispatch,heldRoutingResult} from './role-bridge.mjs';
export async function runWorkflowCommand(args,io={}){
 const output=io.output??process.stdout;let workflowId=null,isRouting=false;
 try{
  const [command,...rest]=args,options={};
  isRouting=['routing-status','prepare-dispatch','run-dispatch','observe','resume','cancel'].includes(command);
  if(!['init','record','status','reconcile','prepare','result'].includes(command)&&!isRouting)throw Error('Expected workflow command');
  // A bridge child must not drive routing itself: the supervisor sets ARC_BRIDGE_CHILD for the child CLI process tree.
  if(isRouting&&(io.env??process.env).ARC_BRIDGE_CHILD){output.write(JSON.stringify({workflowId:null,...invalidRoutingRequest({}),message:'Routing commands are not available inside a bridge child.'})+'\n');return 2;}
  for(let i=0;i<rest.length;i+=2){const key=rest[i];if(!['--cwd','--workflow','--input'].includes(key)||options[key]!==undefined||typeof rest[i+1]!=='string')throw Error('Invalid workflow option');options[key]=rest[i+1];}
  const cwd=options['--cwd'];workflowId=options['--workflow'];validateWorkflowId(workflowId);
  if(typeof cwd!=='string'||!path.isAbsolute(cwd)||path.normalize(cwd)!==cwd)throw Error('Absolute workspace required');
  if(command==='status'?options['--input']!==undefined:options['--input']!=='-')throw Error('Mutations require --input -; status takes no input');
  // Check/review, commit and external intents are recorded for the operator.
  // Actual Git mutations remain Orchestrator actions; reconciliation observes their results.
  const input=command==='status'?undefined:JSON.parse(io.input??fs.readFileSync(0,'utf8'));
  let result;
  if(isRouting){
   if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid routing input');
   const context={cwd,userHome:os.homedir(),env:process.env,workflowId,hostPlatform:input.hostPlatform,executionEnvironment:input.executionEnvironment};
   const keys=Object.keys(input),allowed={'routing-status':[['hostPlatform','executionEnvironment'],[]],'prepare-dispatch':[['hostPlatform','executionEnvironment','role','expectedRevision','requestId','taskId'],['allowedPaths']],'run-dispatch':[['hostPlatform','executionEnvironment','dispatchId','brief'],[]],observe:[['hostPlatform','executionEnvironment','dispatchId'],['waitMs','event','nativeAgentId']],resume:[['hostPlatform','executionEnvironment','dispatchId','brief'],[]],cancel:[['hostPlatform','executionEnvironment','dispatchId'],[]]}[command];
   if(allowed&&(allowed[0].some(key=>!Object.hasOwn(input,key))||keys.some(key=>!allowed[0].includes(key)&&!allowed[1].includes(key))))result=invalidRoutingRequest(context);
   else result=command==='routing-status'?await routingStatus({context}):command==='prepare-dispatch'?await prepareRoleDispatch({context,assignment:{role:input.role,requestId:input.requestId,taskId:input.taskId,...(Object.hasOwn(input,'allowedPaths')?{allowedPaths:input.allowedPaths}:{})},expectedRevision:input.expectedRevision}):command==='run-dispatch'?await runBridgeDispatch({context,dispatchId:input.dispatchId,brief:input.brief}):command==='observe'?await recordRoleObservation({context,dispatchId:input.dispatchId,...(Object.hasOwn(input,'waitMs')?{waitMs:input.waitMs}:{}),...(Object.hasOwn(input,'event')?{event:input.event}:{}),...(Object.hasOwn(input,'nativeAgentId')?{nativeAgentId:input.nativeAgentId}:{})}):command==='resume'?await resumeRoleDispatch({context,dispatchId:input.dispatchId,brief:input.brief}):await cancelRoleDispatch({context,dispatchId:input.dispatchId});
   result={workflowId,...result};
  }else result=await(command==='init'?initializeCooperativeWorkflow({cwd,workflowId,input}):runCooperativeCommand({cwd,workflowId,command,input}));
  output.write(JSON.stringify(result)+'\n');return result.decision==='deny'?2:result.decision==='hold'?3:0;
 }catch(error){
  const result=isRouting?{workflowId:null,...heldRoutingResult('activation_unverified','Provide a valid routing request and verify the active configuration and installed markers.')}:commandResult({workflowId,decision:'hold',ruleId:'cooperative.error',error:error.message});
  output.write(JSON.stringify(result)+'\n');return 1;
 }
}
