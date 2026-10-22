import {readAssignmentGitEvidence} from './git-evidence.mjs';
import {recordCooperativeAssignmentResult} from './assignment.mjs';
import fs from 'node:fs/promises';
import {validateCooperativeCommand,validateCooperativeState} from './cooperative-schema.mjs';
import {observeCooperativeTarget,validateObservedTarget,validateWorkflowId,workflowStatePath,inspectPath,absolute,within} from './scope.mjs';
import {fingerprintRequest,saveDurableState} from './store.mjs';
import {commandResult,cooperativeVersions} from './bootstrap.mjs';
import {evaluateCooperative,reconcileCooperativeResult} from './evaluate.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sameCheckout=(a,b)=>['realpath','gitCommonDir','gitDir'].every(k=>a[k]===b[k]);
/** Only trusted code may inject observation/storage. CLI JSON cannot set either. */
export async function runCooperativeCommand({cwd,workflowId,command,input,observe=observeCooperativeTarget,storage={},readGit=readAssignmentGitEvidence}){
 validateWorkflowId(workflowId);validateCooperativeCommand({command,input});
 if(command==='init')throw Error('Use initializeCooperativeWorkflow for init');
 const target=await validateObservedTarget(cwd,await observe(cwd)),statePath=await workflowStatePath(target,workflowId);
 const read=async()=>{await inspectPath(statePath);const state=validateCooperativeState(JSON.parse(await fs.readFile(statePath,'utf8')));if(state.workflowId!==workflowId)throw Error('Workflow identity mismatch');return state;};
 const result=(state,decision,extra={})=>commandResult({workflowId,state,input,...decision,...extra});
 if(command==='status'){
  const state=await read();
  if(!sameCheckout(state.target,target))return result(undefined,{decision:'hold',ruleIds:['cooperative.target']});
  const evaluation=evaluateCooperative({state,request:{command,input},evidence:{target,versions:await cooperativeVersions()}});
  const unresolved=state.unresolved.length||state.intents.some(i=>['prepared','unknown','mismatch'].includes(i.status));
  return {...result(state,evaluation.decision==='allow'&&unresolved?{decision:'hold',ruleIds:['cooperative.unresolved']}:evaluation,{persisted:true}),state};
 }
 let lock;
 try{
  lock=await fs.open(statePath+'.lock','wx',0o600);const state=await read();
  if(!sameCheckout(state.target,target))return result(state,{decision:'hold',ruleIds:['cooperative.target']});
  const requestFingerprint=fingerprintRequest({command,input});const prior=state.requests.find(r=>r.requestId===input.requestId);
  if(prior){if(prior.requestFingerprint!==requestFingerprint)throw Error('Request fingerprint conflict');return result(state,{decision:'hold',ruleIds:['cooperative.replay']},{replayed:true});}
  if(!['reconcile','result'].includes(command)&&input.expectedRevision!==state.revision)return result(state,{decision:'hold',ruleIds:[['prepare','result'].includes(command)?'cooperative.unsupported':'cooperative.revision']});
  const currentTarget=await validateObservedTarget(cwd,await observe(cwd));
  if(!sameCheckout(state.target,currentTarget))return result(state,{decision:'hold',ruleIds:['cooperative.target']});
  const versions=await cooperativeVersions();
  let git,gitError;
  if(command==='prepare'&&input.operation==='assign-agent'&&input.arguments&&same(currentTarget,state.target)){
   try{git=await readGit({target:currentTarget,documents:input.arguments?.documents??[]});}catch(error){gitError=error.message;}
  }
  let decision=evaluateCooperative({state,request:{command,input},evidence:{target:currentTarget,versions,git}});
  if(gitError)decision={decision:'hold',ruleIds:['cooperative.documents'],reason:gitError};
  if(command==='prepare'&&decision.decision==='allow')state.intents.push(decision.proposedTransition.intent);
  if(['reconcile','result'].includes(command)&&input.result){
   if(input.expectedRevision!==state.revision)state.unresolved.push({kind:'stale-result',requestId:input.requestId,expectedRevision:input.expectedRevision,revision:state.revision+1});
   const intent=state.intents.find(i=>i.requestId===input.intentId);
   decision=intent?.operation==='assign-agent'?recordCooperativeAssignmentResult({state,intent,result:input.result,observations:{target:currentTarget}}):reconcileCooperativeResult({state,intent,result:input.result,observations:{target:currentTarget}});
   if(intent?.operation==='assign-agent'&&!same(versions,state.versions))decision={...decision,decision:'hold',ruleIds:['cooperative.versions']};
   if(input.expectedRevision!==state.revision)decision={...decision,decision:'hold',ruleIds:['cooperative.revision']};
   const actualResult=decision.proposedTransition?.result??input.result;
   // Preserve actual statements even when runtime/HEAD changed, without rebinding target.
   if(!same(currentTarget,state.target)){state.targetHistory.push({target:currentTarget,revision:state.revision+1,source:'local-observation'});state.unresolved.push({kind:'target-changed',revision:state.revision+1});}
   if(!same(versions,state.versions))state.unresolved.push({kind:'versions-changed',revision:state.revision+1});
   state.results.push({...actualResult,requestId:input.intentId,recordRequestId:input.requestId,actor:input.actor,source:'operator-attested'});
   if(intent&&(intent.operation!=='assign-agent'||decision.proposedTransition?.result&&['prepared','unknown','mismatch'].includes(intent.status))){
    intent.status=actualResult.status;
    if(decision.decision==='allow'&&actualResult.status==='succeeded'&&intent.operation==='assign-agent')state.assignments.push({intentId:intent.requestId,taskId:intent.taskId,agentId:actualResult.data.agentId,status:'active',source:'operator-attested',identityVerified:false});
   }
   else state.unresolved.push({kind:'unmatched-result',requestId:input.intentId,revision:state.revision+1});
  }else if(command==='record'&&decision.decision==='allow'){
   const entry={...input.evidence,actor:input.actor,source:'operator-attested',requestId:input.requestId,revision:state.revision+1,scopeVersion:state.scopeVersion,targetVersion:state.targetVersion};
   if(entry.kind==='scope'){
    if(!Array.isArray(entry.data.paths)||entry.data.paths.some(p=>!absolute(p)||!within(state.target.realpath,p)))throw Error('Scope paths must stay inside workspace');
    state.scopeVersion++;entry.scopeVersion=state.scopeVersion;state.scopes.push(entry);state.unresolved.push({kind:'scope-changed',revision:state.revision+1,scopeVersion:state.scopeVersion});
   }
   state.records.push(entry);
  }
  // A held request is durable audit, never an executable intent.
  state.revision++;
  const output=result(state,decision,{persisted:true});
  state.requests.push({requestId:input.requestId,requestFingerprint,decision:output});
  state.audit.push({command,requestId:input.requestId,revision:state.revision,decision:output.decision,ruleIds:output.ruleIds,source:'operator-attested',actor:input.actor});
  validateCooperativeState(state);await inspectPath(statePath);await saveDurableState({statePath,state,storage});return output;
 }finally{if(lock){await lock.close();await fs.unlink(statePath+'.lock');}}
}
