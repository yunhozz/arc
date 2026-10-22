import {EXTERNAL_ACTIONS,reconcileCooperativeExternal,cooperativeSupport} from './external.mjs';
import {reconcileCooperativeCommit} from './acceptance.mjs';
import {evaluateCooperativeVerification,invalidateAffectedEvidence,readCooperativeChanges} from './verification.mjs';
import {readAssignmentGitEvidence,readCooperativeCommitGitEvidence} from './git-evidence.mjs';
import {recordCooperativeAssignmentResult} from './assignment.mjs';
import fs from 'node:fs/promises';
import {validateCooperativeCommand,validateCooperativeState} from './cooperative-schema.mjs';
import {observeCooperativeTarget,validateObservedTarget,validateWorkflowId,workflowStatePath,inspectPath,absolute,within} from './scope.mjs';
import {fingerprintRequest,saveDurableState,applyCooperativeCommitTransition} from './store.mjs';
import {commandResult,cooperativeVersions} from './bootstrap.mjs';
import {evaluateCooperative,reconcileCooperativeResult} from './evaluate.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sameCheckout=(a,b)=>['realpath','gitCommonDir','gitDir'].every(k=>a[k]===b[k]);
/** Only trusted code may inject observation/storage. CLI JSON cannot set either. */
export async function runCooperativeCommand({cwd,workflowId,command,input,observe=observeCooperativeTarget,storage={},readGit=readAssignmentGitEvidence,readChanges=readCooperativeChanges,readCommitGit=readCooperativeCommitGitEvidence}){
 validateWorkflowId(workflowId);validateCooperativeCommand({command,input});
 if(command==='init')throw Error('Use initializeCooperativeWorkflow for init');
 const target=await validateObservedTarget(cwd,await observe(cwd)),statePath=await workflowStatePath(target,workflowId);
 const read=async()=>{await inspectPath(statePath);const state=validateCooperativeState(JSON.parse(await fs.readFile(statePath,'utf8')));if(state.workflowId!==workflowId)throw Error('Workflow identity mismatch');return state;};
 const result=(state,decision,extra={})=>commandResult({workflowId,state,input,...decision,...extra});
 if(command==='status'){
  const state=await read();
  if(!sameCheckout(state.target,target))return result(undefined,{decision:'hold',ruleIds:['cooperative.target']});
  const changes=state.tasks.length?await readChanges({state}):undefined;
  const evaluation=evaluateCooperative({state,request:{command,input},evidence:{target,versions:await cooperativeVersions(),changes}});
  const unresolved=state.unresolved.some(entry=>!entry.resolvedBy)||state.intents.some(i=>['prepared','unknown','mismatch'].includes(i.status)&&!(['check','review'].includes(i.operation)&&i.stale));
  return {...result(state,evaluation.decision==='allow'&&unresolved?{decision:'hold',ruleIds:['cooperative.unresolved']}:evaluation,{persisted:true}),state,support:cooperativeSupport(),...(changes?{changeFingerprints:changes}:{})};
 }
 let lock;
 try{
  lock=await fs.open(statePath+'.lock','wx',0o600);let state=await read();
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
  const commitIntent=['result','reconcile'].includes(command)?state.intents.find(i=>i.requestId===input.intentId&&i.operation==='commit'):undefined;
  if(command==='prepare'&&['accept','commit'].includes(input.operation)||commitIntent){
   try{git=await readCommitGit({target:currentTarget,...(commitIntent&&input.result?.data?.commit?{commit:input.result.data.commit}:{})});}catch(error){gitError=error.message;}
  }
  const changes=state.tasks.length?await readChanges({state}):undefined;
  let decision=evaluateCooperative({state,request:{command,input},evidence:{target:currentTarget,versions,git,changes}});
  if(gitError)decision={decision:'hold',ruleIds:[input.operation==='assign-agent'?'cooperative.documents':'cooperative.git-evidence'],reason:gitError};
  if(command==='prepare'&&decision.decision==='allow'){
   if(decision.proposedTransition?.intent)state.intents.push(decision.proposedTransition.intent);
   if(decision.proposedTransition?.acceptance){state.acceptances.push(decision.proposedTransition.acceptance);state.tasks.find(t=>t.id===input.taskId).status='accepted';}
  }
  if(['reconcile','result'].includes(command)&&input.result){
   if(input.expectedRevision!==state.revision)state.unresolved.push({kind:'stale-result',requestId:input.requestId,expectedRevision:input.expectedRevision,revision:state.revision+1});
   let intent=state.intents.find(i=>i.requestId===input.intentId);
   decision=EXTERNAL_ACTIONS.includes(intent?.operation)?reconcileCooperativeExternal({state,intent,result:input.result}):intent?.operation==='commit'?reconcileCooperativeCommit({state,intent,result:input.result,gitEvidence:git}):['check','review'].includes(intent?.operation)?evaluateCooperativeVerification({state,request:{...input,operation:'verification-result'},evidence:{changes}}):intent?.operation==='assign-agent'?recordCooperativeAssignmentResult({state,intent,result:input.result,observations:{target:currentTarget}}):reconcileCooperativeResult({state,intent,result:input.result,observations:{target:currentTarget}});
   if(['assign-agent','check','review','commit',...EXTERNAL_ACTIONS].includes(intent?.operation)&&!same(versions,state.versions))decision={...decision,decision:'hold',ruleIds:['cooperative.versions']};
   if(input.expectedRevision!==state.revision)decision={...decision,decision:'hold',ruleIds:['cooperative.revision']};
   if((intent?.operation==='commit'||EXTERNAL_ACTIONS.includes(intent?.operation))&&input.actor.role!=='orchestrator')decision={...decision,decision:'hold',ruleIds:['cooperative.acceptance-actor']};
   if(['check','review'].includes(intent?.operation)&&!same(currentTarget,state.target))decision={...decision,decision:'hold',ruleIds:['cooperative.target']};
   if(intent?.operation==='commit'){
    const verified=decision.proposedTransition;
    // Failed reconciliation records what actually happened without changing target.
    const observation={intentId:input.intentId,revision:state.revision+1,observation:verified?.observation??git??null,source:'local-git',...(gitError?{error:gitError}:{})};
    if(decision.decision==='allow'){
     state=applyCooperativeCommitTransition({state,decision});
     intent=state.intents.find(i=>i.requestId===input.intentId);
     const committedChanges=await readChanges({state});state.commits.at(-1).postCommitFingerprint=committedChanges.tasks[intent.taskId];
     for(const entry of state.unresolved)if(entry.kind==='target-changed'&&entry.intentId===input.intentId)entry.resolvedBy=input.requestId;
    }
    state.commitObservations??=[];state.commitObservations.push(observation);
    if(decision.decision!=='allow'&&verified?.result?.status==='succeeded')verified.result.status='mismatch';
   }
   const verification=decision.proposedTransition;
   if(verification?.check){
    if(decision.decision!=='allow'&&verification.check.status==='passed'){verification.check.status='unverified';verification.check.stale=true;verification.findings=[];verification.result.status='mismatch';}
    state.checks.push(verification.check);for(const finding of verification.findings){const index=state.findings.findIndex(f=>f.id===finding.id);if(index<0)state.findings.push(finding);else state.findings[index]=finding;}
   }
   if(EXTERNAL_ACTIONS.includes(intent?.operation)&&decision.decision!=='allow'&&decision.proposedTransition?.result&&(decision.proposedTransition.result.status==='succeeded'||decision.ruleIds[0]!=='cooperative.external'))decision.proposedTransition.result.status='mismatch';
   const actualResult=decision.proposedTransition?.result??input.result;
   // Preserve actual statements even when runtime/HEAD changed, without rebinding target.
   if(!same(currentTarget,state.target)){state.targetHistory.push({target:currentTarget,revision:state.revision+1,source:'local-observation'});state.unresolved.push({kind:'target-changed',...(intent?.operation==='commit'?{intentId:input.intentId}:{}),revision:state.revision+1});}
   if(!same(versions,state.versions))state.unresolved.push({kind:'versions-changed',revision:state.revision+1});
   state.results.push({...actualResult,requestId:input.intentId,recordRequestId:input.requestId,actor:input.actor,source:'operator-attested'});
   if(intent&&(['assign-agent','check','review','commit',...EXTERNAL_ACTIONS].includes(intent.operation)?decision.proposedTransition?.result&&['prepared','unknown','mismatch'].includes(intent.status):true)){
    intent.status=actualResult.status;
    if(decision.decision==='allow'&&actualResult.status==='succeeded'&&intent.operation==='assign-agent')state.assignments.push({intentId:intent.requestId,taskId:intent.taskId,agentId:actualResult.data.agentId,status:'active',source:'operator-attested',identityVerified:false});
   }
   else state.unresolved.push({kind:'unmatched-result',requestId:input.intentId,revision:state.revision+1});
  }else if(command==='record'&&decision.decision==='allow'){
   const entry={...input.evidence,actor:input.actor,source:'operator-attested',requestId:input.requestId,revision:state.revision+1,scopeVersion:state.scopeVersion,targetVersion:state.targetVersion};
   if(entry.kind==='scope'){
    if(!Array.isArray(entry.data.paths)||entry.data.paths.some(p=>!absolute(p)||!within(state.target.realpath,p)))throw Error('Scope paths must stay inside workspace');
    state=invalidateAffectedEvidence({state,changedVersions:{scopeVersion:state.scopeVersion+1},affectedTaskIds:entry.data.affectedTaskIds});entry.scopeVersion=state.scopeVersion;state.scopes.push(entry);
    state.unresolved.push({kind:'scope-changed',revision:state.revision+1,scopeVersion:state.scopeVersion});
   }
   if(['document','approval'].includes(entry.kind)&&state.tasks.length)state=invalidateAffectedEvidence({state,changedVersions:{[entry.kind+'Version']:entry.revision},affectedTaskIds:entry.data.affectedTaskIds});
   if(decision.proposedTransition?.task){const task=decision.proposedTransition.task,index=state.tasks.findIndex(t=>t.id===task.id);if(index>=0){state=invalidateAffectedEvidence({state,changedVersions:{taskVersion:entry.revision},affectedTaskIds:[task.id]});state.tasks[index]=task;}else state.tasks.push(task);}
   if(decision.proposedTransition?.finding){const finding=decision.proposedTransition.finding,index=state.findings.findIndex(f=>f.id===finding.id);if(index<0)state.findings.push(finding);else state.findings[index]=finding;}
   state.records.push(entry);
  }
  // A held request is durable audit, never an executable intent.
  state.revision++;
  const output=result(state,decision,{persisted:true});
  state.requests.push({requestId:input.requestId,requestFingerprint,request:structuredClone({command,input}),decision:output});
  state.audit.push({command,requestId:input.requestId,revision:state.revision,decision:output.decision,ruleIds:output.ruleIds,source:'operator-attested',actor:input.actor,...(input.intentId?{intentId:input.intentId,resolution:state.results.at(-1)?.status}:{}),...(input.operation?{operation:input.operation}:{})});
  validateCooperativeState(state);await inspectPath(statePath);await saveDurableState({statePath,state,storage});return output;
 }finally{if(lock){await lock.close();await fs.unlink(statePath+'.lock');}}
}
