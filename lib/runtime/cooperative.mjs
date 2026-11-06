import {EXTERNAL_ACTIONS,reconcileCooperativeExternal,cooperativeSupport} from './external.mjs';
import {reconcileCooperativeCommit} from './acceptance.mjs';
import {evaluateCooperativeVerification,invalidateAffectedEvidence,readCooperativeChanges} from './verification.mjs';
import {readAssignmentGitEvidence,readCooperativeCommitGitEvidence,readPlanAmendGitEvidence} from './git-evidence.mjs';
import {recordCooperativeAssignmentResult} from './assignment.mjs';
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {validateCooperativeCommand,validateCooperativeState} from './cooperative-schema.mjs';
import {observeCooperativeTarget,validateObservedTarget,validateWorkflowId,workflowStatePath,inspectPath,absolute,within} from './scope.mjs';
import {fingerprintRequest,saveDurableState,applyCooperativeCommitTransition,applyCooperativeTargetTransition} from './store.mjs';
import {commandResult,cooperativeVersions} from './bootstrap.mjs';
import {evaluateCooperative,reconcileCooperativeResult,reconcileCooperativePlanAmend} from './evaluate.mjs';
import {evaluateTargetPreparation,readTargetPreparationEvidence} from './target-preparation.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sameCheckout=(a,b)=>['realpath','gitCommonDir','gitDir'].every(k=>a[k]===b[k]);
/** Only trusted code may inject observation/storage. CLI JSON cannot set either. */
export async function runCooperativeCommand({cwd,workflowId,command,input,observe=observeCooperativeTarget,storage={},readGit=readAssignmentGitEvidence,readChanges=readCooperativeChanges,readCommitGit=readCooperativeCommitGitEvidence,readPlanAmendGit=readPlanAmendGitEvidence,clock=Date.now}){
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
  const unresolved=state.plannerLedger?.stages.some(s=>s.pending)||state.unresolved.some(entry=>!entry.resolvedBy)||state.intents.some(i=>(['prepared','unknown','mismatch'].includes(i.status)||i.operation==='plan-amend'&&i.status==='failed')&&!(['check','review'].includes(i.operation)&&i.stale));
  return {...result(state,evaluation.decision==='allow'&&unresolved?{decision:'hold',ruleIds:['cooperative.unresolved']}:evaluation,{persisted:true}),state,support:cooperativeSupport(),...(changes?{changeFingerprints:changes}:{})};
 }
 let lock,plannerLock;
 try{
  lock=await fs.open(statePath+'.lock','wx',0o600);let state=await read();
  const plannerWork=command==='prepare'&&input.operation==='planner-call'||command==='record'&&input.evidence.kind.startsWith('planner-');
  if(plannerWork)plannerLock=await fs.open(path.join(target.gitCommonDir,'arc','planner.lock'),'wx',0o600);
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
  const planIntent=state.intents.find(i=>i.operation==='plan-amend'&&i.requestId===((command==='record'&&input.evidence.kind==='note'&&input.evidence.data?.type==='plan-amend-checkpoint')?input.evidence.data.intentId:['result','reconcile'].includes(command)?input.intentId:null));
  const planArguments=command==='prepare'&&input.operation==='plan-amend'?input.arguments:planIntent?.arguments;
  let now;
  if(planArguments){
   try{git=await readPlanAmendGit({target:currentTarget,arguments:planArguments,mapping:command==='reconcile'&&input.result?.status==='succeeded'?input.result.data?.mapping??[]:[]});}catch(error){gitError=error.message;}
  }
  const changes=state.tasks.length?await readChanges({state}):undefined;
  const plannerArtifacts=plannerWork?await readPlannerArtifacts(state,command==='record'&&input.evidence.kind==='planner-evidence'?input.evidence:undefined):undefined;
  const plannerHistory=command==='record'&&input.evidence.kind==='planner-stage'?await readPlannerHistory(state,statePath,input.evidence.data.document?.path):{};
  if(planArguments&&!gitError){try{now=clock();if(!Number.isFinite(now))throw Error('Invalid observation clock');}catch(error){gitError=error.message;}}
  let destinationReview=false;
  let decision=evaluateCooperative({state,request:{command,input},evidence:{target:currentTarget,versions,git,changes,requestFingerprint,plannerArtifacts,now,...plannerHistory}});
  if(command==='record'&&input.evidence.kind==='planner-review'){
   const data=input.evidence.data,stage=state.plannerLedger?.stages.find(s=>s.id===data.stageId),intent=state.targetIntents?.find(i=>i.id===stage?.targetIntentId),transition=state.targetTransitions?.find(t=>t.intentId===intent?.id&&t.targetVersion===state.targetVersion),document=intent?.documents.find(d=>d.kind===stage?.document.kind);
   if(transition&&document){
    let observed;try{observed=await readTargetPreparationEvidence({state,targetIntent:intent,destination:{realpath:state.target.realpath,path:document.path},observe,readChanges});}catch{}
    const valid=input.actor.role==='orchestrator'&&stage.scopeVersion===state.scopeVersion&&same(versions,state.versions)&&same(currentTarget,state.target)&&!stage.pending&&stage.result?.status==='succeeded'&&stage.result.ref===data.resultRef&&stage.result.chatDraft?.complete===true&&data.full===true&&data.complete===true&&observed?.destination?.document?.hash===data.hash&&Array.isArray(data.criteria)&&data.criteria.length===stage.criteria.length&&new Set(data.criteria.map(c=>c.id)).size===stage.criteria.length&&data.criteria.every(c=>stage.criteria.some(s=>s.id===c.id)&&c.status==='resolved'&&typeof c.judgmentRef==='string'&&c.judgmentRef);
    destinationReview=!!valid;
    decision=valid?{decision:'allow',ruleIds:['cooperative.target-preparation']}:{decision:'hold',ruleIds:['cooperative.target-preparation'],reason:'Current destination bytes and complete source-bound review required'};
   }
  }
  if(command==='record'&&['document','approval'].includes(input.evidence.kind)&&state.targetIntents?.some(intent=>!state.targetTransitions?.some(t=>t.intentId===intent.id)&&intent.documents.some(doc=>doc.kind===input.evidence.data.kind&&(input.evidence.data.path===doc.path||input.evidence.data.path===path.join(intent.sourceTarget.realpath,doc.path)))))decision={decision:'hold',ruleIds:['cooperative.target-preparation'],reason:'Prepared target transition required before document records'};
  if(command==='record'&&input.evidence.kind==='approval'){
   const data=input.evidence.data,intent=state.targetIntents?.find(i=>state.targetTransitions?.some(t=>t.intentId===i.id&&t.targetVersion===state.targetVersion)&&i.documents.some(d=>d.kind===data.kind));
   if(intent){
    const document=intent.documents.find(d=>d.kind===data.kind),firstStage=state.plannerLedger?.stages.find(s=>s.id===intent.firstStageId);
    const stage=firstStage?.document.kind===data.kind?firstStage:state.plannerLedger?.stages.find(s=>s.document.kind===data.kind&&s.document.path===path.join(state.target.realpath,document.path)&&s.targetVersion===state.targetVersion);
    const review=state.records.findLast(r=>r.kind==='planner-review'&&r.scopeVersion===state.scopeVersion&&r.targetVersion===state.targetVersion&&r.data?.stageId===stage?.id&&r.data?.resultRef===stage?.result?.ref&&r.data?.full===true&&r.data?.complete===true&&r.data?.hash===data.contentHash);
    let observed;try{observed=await readTargetPreparationEvidence({state,targetIntent:intent,destination:{realpath:state.target.realpath,path:document.path},observe,readChanges});}catch{}
    if(stage?.scopeVersion!==state.scopeVersion||![document.path,path.join(state.target.realpath,document.path)].includes(data.path)||!review||observed?.destination?.document?.hash!==data.contentHash||!same(currentTarget,state.target)||!same(versions,state.versions)||input.actor.role!=='orchestrator')decision={decision:'hold',ruleIds:['cooperative.target-preparation'],reason:'Current reviewed destination bytes required for approval'};
   }
  }
  if(command==='record'&&input.evidence.kind==='target-preparation'){
   let observed;
   try{const intent=state.targetIntents?.find(i=>i.id===input.evidence.data.intentId);observed=await readTargetPreparationEvidence({state,targetIntent:intent,destination:input.evidence.data.destination,observe,readChanges});}catch{}
   decision=input.actor.role==='orchestrator'&&same(versions,state.versions)?evaluateTargetPreparation({state,request:input.evidence.data,evidence:{...observed,versions}}):{decision:'hold',ruleIds:['cooperative.target-preparation']};
  }
  if(gitError)decision={decision:'hold',ruleIds:[input.operation==='assign-agent'?'cooperative.documents':'cooperative.git-evidence'],reason:gitError};
  if(command==='prepare'&&decision.decision==='allow'){
   if(decision.proposedTransition?.plannerLedger)state.plannerLedger=decision.proposedTransition.plannerLedger;
   if(decision.proposedTransition?.intent)state.intents.push(decision.proposedTransition.intent);
   if(decision.proposedTransition?.acceptance){state.acceptances.push(decision.proposedTransition.acceptance);state.tasks.find(t=>t.id===input.taskId).status='accepted';}
  }
  if(['reconcile','result'].includes(command)&&input.result){
   if(input.expectedRevision!==state.revision)state.unresolved.push({kind:'stale-result',requestId:input.requestId,intentId:input.intentId,expectedRevision:input.expectedRevision,revision:state.revision+1});
   let intent=state.intents.find(i=>i.requestId===input.intentId);
   decision=EXTERNAL_ACTIONS.includes(intent?.operation)?reconcileCooperativeExternal({state,intent,result:input.result,observations:{target:currentTarget}}):intent?.operation==='commit'?reconcileCooperativeCommit({state,intent,result:input.result,gitEvidence:git}):intent?.operation==='plan-amend'?reconcileCooperativePlanAmend({state,intent,result:input.result,observations:{target:currentTarget,git},now}):['check','review'].includes(intent?.operation)?evaluateCooperativeVerification({state,request:{...input,operation:'verification-result'},evidence:{changes}}):intent?.operation==='assign-agent'?recordCooperativeAssignmentResult({state,intent,result:input.result,observations:{target:currentTarget}}):reconcileCooperativeResult({state,intent,result:input.result,observations:{target:currentTarget}});
   if(['assign-agent','check','review','commit','plan-amend',...EXTERNAL_ACTIONS].includes(intent?.operation)&&!same(versions,state.versions))decision={...decision,decision:'hold',ruleIds:['cooperative.versions']};
   if(input.expectedRevision!==state.revision)decision={...decision,decision:'hold',ruleIds:['cooperative.revision']};
   if((['commit','plan-amend'].includes(intent?.operation)||EXTERNAL_ACTIONS.includes(intent?.operation))&&input.actor.role!=='orchestrator')decision={...decision,decision:'hold',ruleIds:['cooperative.acceptance-actor']};
   if(['check','review'].includes(intent?.operation)&&!same(currentTarget,state.target))decision={...decision,decision:'hold',ruleIds:['cooperative.target']};
   if(intent?.operation==='commit'){
    const verified=decision.proposedTransition;
    // Failed reconciliation records what actually happened without changing target.
    const observation={intentId:input.intentId,revision:state.revision+1,observation:verified?.observation??git??null,source:'local-git',...(gitError?{error:gitError}:{})};
    if(decision.decision==='allow'){
     state=applyCooperativeCommitTransition({state,decision});
     intent=state.intents.find(i=>i.requestId===input.intentId);
     const committedChanges=await readChanges({state}),commit=state.commits.at(-1);commit.postCommitFingerprint=committedChanges.tasks[intent.taskId];
     if(committedChanges.taskSnapshots){
      commit.snapshot=structuredClone(committedChanges.taskSnapshots[intent.taskId]);
      const changedPaths=commit.paths.map(p=>state.target.realpath+'/'+p);
      for(const prior of state.commits.slice(0,-1)){
       const snapshot=prior.snapshotConnections?.at(-1)?.snapshot??prior.snapshot,current=committedChanges.taskSnapshots[prior.taskId];
       if(!snapshot||!current||!changedPaths.some(p=>snapshot.paths.some(base=>within(base,p))))continue;
       const projected=structuredClone(snapshot);for(const key of ['index','rows'])projected[key]=[...snapshot[key].filter(row=>!changedPaths.includes(row.path)),...current[key].filter(row=>changedPaths.includes(row.path))].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
       prior.snapshotConnections??=[];prior.snapshotConnections.push({commit:commit.commit,requestId:input.requestId,snapshot:projected,fingerprint:fingerprintRequest(projected)});prior.postCommitFingerprint=fingerprintRequest(projected);
      }
     }
     for(const entry of state.unresolved)if(entry.kind==='target-changed'&&entry.intentId===input.intentId)entry.resolvedBy=input.requestId;
    }
    state.commitObservations??=[];state.commitObservations.push(observation);
    if(decision.decision!=='allow'&&verified?.result?.status==='succeeded')verified.result.status='mismatch';
   }
   if(intent?.operation==='plan-amend'){
    if(command!=='reconcile'||gitError||state.unresolved.some(u=>!u.resolvedBy&&!(u.intentId===input.intentId&&['target-changed','stale-result'].includes(u.kind))))decision={...decision,decision:'hold',ruleIds:['cooperative.plan-amend']};
    if(decision.decision!=='allow'&&decision.proposedTransition?.result?.status==='succeeded')decision.proposedTransition.result.status='mismatch';
    const observed={intentId:input.intentId,revision:state.revision+1,source:'local-git',target:currentTarget,observation:git??null,...(gitError?{error:gitError}:{})};
    if(decision.decision==='allow'){
     const previous=structuredClone(state.target),nextVersion=state.targetVersion+1,a=intent.arguments,transition=decision.proposedTransition;
     state=invalidateAffectedEvidence({state,changedVersions:{targetVersion:nextVersion,documentVersion:a.plan.new.version},affectedTaskIds:a.affectedTaskIds});
     state.targetHistory.push({target:previous,revision:state.revision+1,source:'local-observation',kind:'verified-plan-amend-parent',intentId:input.intentId});state.target=structuredClone(transition.target);state.targetVersion=nextVersion;
     state.planAmendments??=[];state.planAmendments.push({intentId:input.intentId,path:a.plan.path,oldVersion:a.plan.old.version,newVersion:a.plan.new.version,oldHash:a.plan.old.hash,newHash:a.plan.new.hash,oldCommit:a.history.planCommit,newCommit:transition.mapping[0].new,mapping:structuredClone(transition.mapping),approvalRefs:structuredClone(a.approvals),source:'operator-attested',observationSource:'local-git'});
     for(const u of state.unresolved)if(!u.resolvedBy&&u.intentId===input.intentId&&u.kind==='target-changed')u.resolvedBy=input.requestId;
     intent=state.intents.find(i=>i.requestId===input.intentId);
    }
    state.planAmendObservations??=[];state.planAmendObservations.push(observed);
   }
   const verification=decision.proposedTransition;
   if(verification?.check){
    if(decision.decision!=='allow'&&verification.check.status==='passed'){verification.check.status='unverified';verification.check.stale=true;verification.findings=[];verification.result.status='mismatch';}
    state.checks.push(verification.check);for(const finding of verification.findings){const index=state.findings.findIndex(f=>f.id===finding.id);if(index<0)state.findings.push(finding);else state.findings[index]=finding;}
   }
   if(intent?.operation==='assign-agent'&&decision.decision!=='allow'&&decision.proposedTransition?.result&&['succeeded','failed'].includes(decision.proposedTransition.result.status))decision.proposedTransition.result.status='mismatch';
   if(EXTERNAL_ACTIONS.includes(intent?.operation)&&decision.decision!=='allow'&&decision.proposedTransition?.result&&(decision.proposedTransition.result.status==='succeeded'||decision.ruleIds[0]!=='cooperative.external'))decision.proposedTransition.result.status='mismatch';
   if(decision.decision==='allow'&&input.expectedRevision===state.revision&&['succeeded','failed','cancelled'].includes(decision.proposedTransition?.result?.status))for(const entry of state.unresolved)if(entry.kind==='stale-result'&&entry.intentId===input.intentId&&!entry.resolvedBy){entry.resolvedBy=input.requestId;entry.resolutionEvidence={intentId:input.intentId,resultRef:input.result.messageRef,revision:state.revision};}
   const actualResult=decision.proposedTransition?.result??input.result;
   // Preserve actual statements even when runtime/HEAD changed, without rebinding target.
   if(!same(currentTarget,state.target)){state.targetHistory.push({target:currentTarget,revision:state.revision+1,source:'local-observation'});state.unresolved.push({kind:'target-changed',...(['commit','plan-amend'].includes(intent?.operation)?{intentId:input.intentId}:{}),revision:state.revision+1});}
   if(!same(versions,state.versions))state.unresolved.push({kind:'versions-changed',revision:state.revision+1});
   state.results.push({...actualResult,requestId:input.intentId,recordRequestId:input.requestId,actor:input.actor,source:'operator-attested'});
   if(intent&&(['assign-agent','check','review','commit','plan-amend',...EXTERNAL_ACTIONS].includes(intent.operation)?decision.proposedTransition?.result&&['prepared','unknown','mismatch'].includes(intent.status):true)){
    intent.status=actualResult.status;
    if(decision.decision==='allow'&&actualResult.status==='succeeded'&&intent.operation==='assign-agent')state.assignments.push({intentId:intent.requestId,taskId:intent.taskId,agentId:actualResult.data.agentId,status:'active',source:'operator-attested',identityVerified:false});
   }
   else state.unresolved.push({kind:'unmatched-result',requestId:input.intentId,revision:state.revision+1});
  }else if(command==='record'&&input.evidence.kind.startsWith('planner-')){
   if(destinationReview||decision.proposedTransition?.plannerLedger&&(decision.decision==='allow'||decision.proposedTransition.recordUncertainty)){
    if(!destinationReview)state.plannerLedger=decision.proposedTransition.plannerLedger;
    state.records.push({...input.evidence,actor:input.actor,source:'operator-attested',requestId:input.requestId,revision:state.revision+1,scopeVersion:state.scopeVersion,targetVersion:state.targetVersion});
    if(input.evidence.kind==='planner-result'){
     const intent=state.intents.find(i=>i.operation==='planner-call'&&i.requestId===input.evidence.data.callRequestId);
     if(intent)intent.status=input.evidence.data.status;
    }
   }
  }else if(command==='record'&&decision.decision==='allow'){
   if(input.evidence.kind==='target-preparation'&&input.evidence.data.type==='transition')state=applyCooperativeTargetTransition({state,decision,messageRef:input.evidence.messageRef});
   if(input.evidence.kind==='target-preparation'&&decision.proposedTransition?.intent){state.targetIntents??=[];state.targetIntents.push(decision.proposedTransition.intent);}
   if(input.evidence.kind==='target-preparation'&&decision.proposedTransition?.checkpoint){state.targetCheckpoints??=[];state.targetCheckpoints.push({...decision.proposedTransition.checkpoint,messageRef:input.evidence.messageRef,source:'operator-attested'});}
   if(input.evidence.kind==='target-preparation'&&decision.proposedTransition?.destination){state.targetDocuments??=[];state.targetDocuments.push({...decision.proposedTransition.destination,messageRef:input.evidence.messageRef});}
   const entry={...input.evidence,actor:input.actor,source:'operator-attested',requestId:input.requestId,revision:state.revision+1,scopeVersion:state.scopeVersion,targetVersion:state.targetVersion};
   if(entry.kind==='note'&&decision.proposedTransition?.checkpoint){const intent=state.intents.find(i=>i.operation==='plan-amend'&&i.requestId===decision.proposedTransition.checkpoint.intentId);if(!intent)throw Error('Checkpoint intent unavailable');intent.checkpoint=structuredClone(decision.proposedTransition.checkpoint);}
   if(entry.kind==='scope'){
    if(!Array.isArray(entry.data.paths)||entry.data.paths.some(p=>!absolute(p)||!within(state.target.realpath,p)))throw Error('Scope paths must stay inside workspace');
    state=invalidateAffectedEvidence({state,changedVersions:{scopeVersion:state.scopeVersion+1},affectedTaskIds:entry.data.affectedTaskIds});entry.scopeVersion=state.scopeVersion;state.scopes.push(entry);
    state.unresolved.push({kind:'scope-changed',revision:state.revision+1,scopeVersion:state.scopeVersion,affectedTaskIds:state.tasks.filter(t=>t.invalidatedBy?.scopeVersion===state.scopeVersion).map(t=>t.id)});
   }
   if(['document','approval'].includes(entry.kind)&&state.tasks.length)state=invalidateAffectedEvidence({state,changedVersions:{[entry.kind+'Version']:entry.revision},affectedTaskIds:entry.data.affectedTaskIds});
   if(decision.proposedTransition?.task){const task=decision.proposedTransition.task,index=state.tasks.findIndex(t=>t.id===task.id);if(index>=0){state=invalidateAffectedEvidence({state,changedVersions:{taskVersion:entry.revision},affectedTaskIds:[task.id]});state.tasks[index]=task;}else state.tasks.push(task);}
   if(decision.proposedTransition?.finding){const finding=decision.proposedTransition.finding,index=state.findings.findIndex(f=>f.id===finding.id);if(index<0)state.findings.push(finding);else state.findings[index]=finding;}
   state.records.push(entry);
   if(decision.proposedTransition?.task)for(const marker of state.unresolved.filter(u=>u.kind==='scope-changed'&&!u.resolvedBy&&u.scopeVersion<=state.scopeVersion)){
    const ids=marker.affectedTaskIds?.length?marker.affectedTaskIds:state.tasks.map(t=>t.id),proof=[];let ready=ids.length>0;
    for(const id of ids){
     const task=state.tasks.find(t=>t.id===id),approval=state.records.findLast(r=>r.kind==='approval'&&(!r.data.affectedTaskIds||r.data.affectedTaskIds.includes(id)));
     if(!task||task.invalidated||task.scopeVersion!==state.scopeVersion||!approval||approval.revision<=marker.revision||approval.scopeVersion!==state.scopeVersion||approval.targetVersion!==state.targetVersion||task.approvalRef!==approval.messageRef||task.approvalVersion!==approval.data.approvalVersion||task.documentVersion!==approval.data.documentVersion){ready=false;break;}
     const documents=approval.data.documents;
     if(!Array.isArray(documents)||documents.length!==2||!['spec','plan'].every(kind=>documents.some(d=>d.kind===kind))){ready=false;break;}
     try{const observed=await readGit({target:currentTarget,documents});if(!same(observed.target,currentTarget)||!observed.docsCommit||!same(observed.docsCommit.documents,documents)||documents.some(d=>d.commit!==observed.docsCommit.commit||d.approvalRef!==approval.messageRef||!observed.documents?.some(o=>o.path===d.path&&o.gitPath===d.gitPath&&o.observedHash===d.contentHash&&o.currentHash===d.contentHash))){ready=false;break;}}
     catch{ready=false;break;}
     const scope=state.scopes.find(s=>s.scopeVersion===state.scopeVersion);if(!scope||task.paths.some(p=>!scope.data.paths.some(base=>within(base,p)))){ready=false;break;}
     proof.push({taskId:id,taskRef:task.messageRef,approvalRef:approval.messageRef,documents:structuredClone(documents)});
    }
    if(ready){marker.resolvedBy=input.requestId;marker.resolutionEvidence={taskIds:ids,contracts:proof,scopeVersion:state.scopeVersion};}
   }
  }
  // The observed identifiers contain no URLs and do not verify remote state.
  if(planArguments&&Array.isArray(git?.configuredRemotes)&&git.configuredRemotes.every(r=>r&&typeof r.name==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(r.name)&&/^sha256:[a-f0-9]{64}$/.test(r.identity??'')))decision={...decision,observedRemoteIdentities:{source:'local-git',remotes:git.configuredRemotes.map(r=>({name:r.name,identity:r.identity}))}};
  // A held request is durable audit, never an executable intent.
  state.revision++;
  const output=result(state,decision,{persisted:true});
  state.requests.push({requestId:input.requestId,requestFingerprint,request:structuredClone({command,input}),decision:output});
  state.audit.push({command,requestId:input.requestId,revision:state.revision,decision:output.decision,ruleIds:output.ruleIds,source:'operator-attested',actor:input.actor,...(input.intentId?{intentId:input.intentId,resolution:state.results.at(-1)?.status}:{}),...(input.operation?{operation:input.operation}:{})});
  validateCooperativeState(state);await inspectPath(statePath);await saveDurableState({statePath,state,storage});return output;
 }finally{if(plannerLock){await plannerLock.close();await fs.unlink(path.join(target.gitCommonDir,'arc','planner.lock'));}if(lock){await lock.close();await fs.unlink(statePath+'.lock');}}
}

async function readPlannerArtifacts(state,newRecord){
 const entries=(state.plannerLedger?.stages??[]).flatMap(s=>(s.artifacts??[]).map(a=>({...a,stageId:s.id})));
 if(newRecord)entries.push({...newRecord.data,ref:newRecord.messageRef});
 return Promise.all(entries.map(async artifact=>{
  try{
   if(!absolute(artifact.path)||!within(state.target.realpath,artifact.path))throw Error('Artifact path escapes workspace');
   await inspectPath(artifact.path);const handle=await fs.open(artifact.path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);let bytes;
   try{const before=await handle.stat();if(!before.isFile())throw Error('Artifact must be a regular file');bytes=await handle.readFile();const after=await handle.stat(),named=await fs.lstat(artifact.path);if(before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||after.dev!==named.dev||after.ino!==named.ino)throw Error('Artifact changed while reading');}finally{await handle.close();}
   await inspectPath(artifact.path);if(!within(state.target.realpath,await fs.realpath(artifact.path)))throw Error('Artifact realpath escapes workspace');
   const hash='sha256:'+createHash('sha256').update(bytes).digest('hex');
   if(artifact.hash&&artifact.hash!==hash||artifact.contentHash&&artifact.contentHash!==hash)throw Error('Artifact hash mismatch');
   return {...artifact,hash,verification:{status:'verified',source:'local-bytes'}};
  }catch(error){return {...artifact,verification:{status:'unverified',source:'local-bytes'},error:error.message};}
 }));
}
async function readPlannerHistory(state,statePath,documentPath){
 const plannerHistory=[];
 try{
  const root=path.dirname(path.dirname(statePath));await inspectPath(root,{directory:true});
  for(const entry of await fs.readdir(root,{withFileTypes:true})){
   if(entry.name===state.workflowId)continue;
   if(!entry.isDirectory()||entry.isSymbolicLink())throw Error('Unsafe workflow history path');
   const filename=path.join(root,entry.name,'state.json');await inspectPath(filename);const other=validateCooperativeState(JSON.parse(await fs.readFile(filename,'utf8')));
   if(!sameCheckout(state.target,other.target))continue;
   if(!other.plannerLedger&&other.documents.some(d=>d.path===documentPath||d.data?.path===documentPath))throw Error('Existing document history has no Planner ledger');
   for(const stage of other.plannerLedger?.stages??[])plannerHistory.push({workflowId:other.workflowId,stage});
  }
  return {plannerHistory};
 }catch(error){return {plannerHistory,plannerHistoryError:error.message};}
}
