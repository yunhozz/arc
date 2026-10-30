import * as portablePath from './path-core.mjs';
import {createRuntimeSchema} from './schema-core.mjs';
import {ROLES, ROLE_OPERATIONS, GIT_OPERATIONS, EXTERNAL_OPERATIONS} from './operations.mjs';

/** The Node and Mod adapters share one decision implementation. */
export function createPolicyCore({path,schema}){
 const {validateWorkflowState,validateRequest,validateEvidence,validatePlannerStage}=schema;
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const within=(base,file)=>{const relative=path.relative(base,file),sep=path.separator?.(base)??path.sep;return relative===''||(!relative.startsWith('..'+sep)&&relative!=='..'&&!path.isAbsolute(relative));};
/** Pure policy decision. Evidence is supplied by a trusted adapter/provider, never tool arguments. */
function evaluate(policy, state, request, evidence){
 const result=(decision,id,reason,requiredEvidence=[])=>({decision,ruleIds:[id],reason,requiredEvidence,expectedRevision:state?.revision??0,proposedTransition:null,coverage:{platform:request?.platform??'unknown',enforcement:'decision-only'}});
 try{validateWorkflowState(state);validateRequest(request);validateEvidence(evidence);}catch(error){return result('hold','runtime.schema',error.message,['valid-state-request-evidence']);}
 if(policy?.runtime?.schemaVersion!==1||!same(policy.runtime.roles,ROLES)||!Array.isArray(policy.runtime.ruleIds)||!Array.isArray(policy.runtime.requiredEvidence)||policy.runtime.status!=='decision-only')return result('hold','runtime.policy','runtime policy unavailable',['runtime-policy']);
 const actor=state.identities.find(i=>i.actorRef===request.actorRef);
 if(!actor)return result('hold','runtime.identity','platform identity unresolved',['platform-identity']);
 const role=actor.role;
 const roleRule={orchestrator:'role.orchestrator-boundary',scouter:'role.scouter-read-only',planner:'role.planner-draft-only',implementer:'role.implementer-implementation',qa:'role.qa-verification',reviewer:'role.reviewer-independent'}[role];
 if(!ROLE_OPERATIONS[role]?.includes(request.operation))return result('deny',GIT_OPERATIONS.includes(request.operation)?'git.specialists-deny':roleRule,'operation forbidden for assigned role');
 const lease=state.leases.find(l=>l.actorRef===actor.actorRef);
 if(lease?.status==='retired')return result('deny','runtime.identity','retired identity');
 if(!lease||lease.status!=='active'||lease.taskId!==request.taskId||actor.taskId!==request.taskId)return result('hold','runtime.identity','active task lease missing',['active-lease']);
 const observation=evidence.provenance.find(p=>p.id===actor.observationRef&&p.source==='platform-event'&&p.actorRef===actor.actorRef&&p.platform===request.platform&&p.verification.sourceRef===p.eventRef);
 if(!observation)return result('hold','runtime.identity','platform observation unavailable',['platform-observation']);
 if(!same(evidence.target,state.target)||evidence.revision!==state.revision||!same(evidence.versions,state.versions))return result('hold','runtime.target','target revision or versions mismatch',['current-target-versions']);
 if(!within(state.target.realpath,request.cwd))return result('deny','scope.non-escalation','cwd outside workspace');
 const assignment=state.assignments.find(a=>a.actorRef===actor.actorRef&&a.taskId===request.taskId&&a.role===role);
 if(!assignment||!assignment.operations.includes(request.operation))return result('hold','runtime.assignment','approved operation assignment missing',['assignment']);
 const approval=state.approvals.find(a=>a.id===assignment.approvalRef);
 const proof=evidence.provenance.find(p=>p.id===approval?.id&&p.source===approval?.source&&p.messageRef===approval?.messageRef&&p.contentHash===approval?.contentHash&&p.verification.sourceRef===p.messageRef);
 if(!approval||!proof||approval.scope.taskId!==request.taskId||approval.scope.target!==state.target.realpath||!approval.scope.operations.includes(request.operation))return result('hold','runtime.approval','user approval provenance unavailable',['user-approval']);
 for(const filename of [request.cwd,...request.paths]){
  const resolved=evidence.resolvedPaths?.find(p=>p.path===filename)?.realpath;
  if(!resolved||!path.isAbsolute(resolved))return result('hold','runtime.paths','resolved path evidence missing',['resolved-paths']);
  if(!within(state.target.realpath,resolved))return result('deny','scope.non-escalation','resolved path escapes workspace');
  if(filename!==request.cwd&&(!assignment.paths.some(p=>within(p,resolved))||!approval.scope.paths.some(p=>within(p,resolved))))return result('deny','scope.non-escalation','path outside assigned approval');
 }
 const fact=kind=>evidence.facts?.find(f=>f.kind===kind&&f.workflowId===state.workflowId&&f.revision===state.revision&&same(f.target,state.target)&&f.policyHash===state.versions.policyHash&&evidence.provenance.some(p=>p.id===f.sourceRef));
 const task=state.tasks.find(t=>t.id===request.taskId);
 if(!task)return result('hold','runtime.assignment','task unavailable',['task']);
 if(role==='implementer'&&['accepted','committed'].includes(task.status))return result('deny','runtime.identity','task execution ended');
 if(request.operation==='temporary-write'){
  const temporary=assignment.temporary;
  if(!temporary||temporary.cleanupOwner!==request.actorRef||!Number.isFinite(Date.parse(temporary.expiresAt))||!Number.isFinite(Date.parse(evidence.observedAt))||Date.parse(temporary.expiresAt)<=Date.parse(evidence.observedAt)||!request.paths.every(p=>temporary.paths?.some(base=>within(base,p))))return result('hold','role.qa-verification','temporary scope lifetime and cleanup ownership required',['temporary-assignment']);
 }
 if(request.operation==='check'){
  if(!assignment.checks?.some(c=>same(c,request.descriptor)))return result('hold',roleRule,'exact assigned check descriptor required',['check-descriptor']);
 }
 if(role==='orchestrator'&&request.operation==='write'&&request.descriptor.kind!=='document')return result('hold','role.orchestrator-boundary','direct implementation requires reviewed small-task exception',['small-task-exception']);
 if(request.operation==='assign-agent'){
  const d=request.descriptor;
  if(!ROLES.includes(d.role)||d.taskId!==request.taskId)return result('deny','runtime.identity','invalid assignment');
  const previous=state.identities.find(i=>i.actorRef===d.actorRef);
  if(previous&&(previous.taskId!==d.taskId||state.leases.some(l=>l.actorRef===d.actorRef&&l.status==='retired')))return result('deny','runtime.identity','identity cannot cross tasks or revive');
  if(d.role==='implementer'){
   if(state.mode==='plan'){
    // T3 supplies verified Git object evidence. Local assertions never satisfy this gate.
    if(!state.documents.some(d=>d.kind==='spec')||!state.documents.some(d=>d.kind==='plan'))return result('hold','runtime.docs-commit','approved complete spec and plan required',['approved-documents','docs-only-commit']);
    const docs=fact('docs-commit')?.data;
    const approved=state.documents.every(d=>state.approvals.some(a=>a.id===d.approvalRef&&a.contentHash===d.contentHash&&evidence.provenance.some(p=>p.id===a.id&&p.source===a.source&&p.verification.sourceRef===p.messageRef&&p.messageRef===a.messageRef&&p.contentHash===d.contentHash)));
    if(!approved||!docs||!docs.commit||!docs.parent||!docs.tree||!same(docs.documents,state.documents)||!same([...docs.paths??[]].sort(),state.documents.map(d=>d.gitPath).sort())||state.documents.some(d=>d.commit!==docs.commit))return result('hold','runtime.docs-commit','Git object and approval verification required',['verified-docs-only-commit']);
   }
   else return result('hold','runtime.mode','mode name does not establish exception eligibility',['verified-mode-exception']);
  }
  const correlation=fact('assignment-correlation');
  const expected={requestId:request.requestId,platform:request.platform,...d};
  const correlationProof=evidence.provenance.find(p=>p.id===correlation?.sourceRef&&p.source==='platform-event'&&p.verification.sourceRef===p.eventRef&&p.platform===request.platform&&p.actorRef===request.actorRef&&p.correlationRef===d.correlationRef&&p.requestId===request.requestId);
  if(d.actorRef!==undefined||!d.correlationRef||!correlationProof||!same(correlation?.data,expected))return result('hold','runtime.identity','trusted platform request correlation required',['assignment-correlation']);
  if(!Array.isArray(d.paths)||!d.paths.length||!same([...d.paths].sort(),[...request.paths].sort())||!Array.isArray(d.operations)||!d.operations.length||d.approvalRef!==approval.id||!approval.scope.roles?.some(role=>role===d.role)||d.paths.some(p=>!task.paths.some(base=>within(base,p)))||d.operations.some(op=>!ROLE_OPERATIONS[d.role].includes(op)||!approval.scope.operations.includes(op)))return result('hold','runtime.assignment','delegated role paths operations and approval must match',['delegated-scope']);
  if(d.checks&&(!Array.isArray(approval.scope.checks)||d.checks.some(c=>!approval.scope.checks.some(approved=>same(approved,c)))))return result('hold','runtime.assignment','delegated checks not approved',['delegated-checks']);
  if(d.temporary&&!same(d.temporary,approval.scope.temporary))return result('hold','runtime.assignment','delegated temporary scope not approved',['delegated-temporary-scope']);
  if(state.assignments.some(a=>a.assignmentId===request.requestId||a.correlationRef===d.correlationRef))return result('hold','runtime.identity','assignment correlation already registered',['new-assignment-correlation']);
  const next=structuredClone(state);
  if(d.role==='planner'){
   const stage=state.plannerLedger?.stages.find(s=>s.id===d.plannerCall?.stageId),proof=fact('planner-call');
   const contract=stage&&{document:stage.document,inputVersion:stage.inputVersion,criteriaVersion:stage.criteriaVersion,scopeVersion:stage.scopeVersion};
   if(!stage||stage.workflowId!==state.workflowId||stage.approvalRef!==approval.id||!same(approval.scope.plannerStage,contract)||!d.paths.includes(stage.document.path)||proof?.sourceRef!==correlation.sourceRef||!same({stageId:proof?.data.stageId,inputVersion:proof?.data.inputVersion,criteriaVersion:proof?.data.criteriaVersion,scopeVersion:proof?.data.scopeVersion},{stageId:stage.id,inputVersion:stage.inputVersion,criteriaVersion:stage.criteriaVersion,scopeVersion:stage.scopeVersion}))return result('hold','runtime.planner-call','Current approved Planner stage and provider evidence required',['planner-stage-ledger','planner-call-evidence']);
   if(stage.document.kind==='plan'&&!state.documents.some(doc=>doc.kind==='spec'&&state.approvals.some(a=>a.id===doc.approvalRef&&a.contentHash===doc.contentHash&&evidence.provenance.some(p=>p.id===a.id&&p.messageRef===a.messageRef&&p.contentHash===doc.contentHash&&p.verification.sourceRef===a.messageRef))))return result('hold','runtime.planner-call','Approved spec prerequisite required',['approved-spec']);
   const planner=evaluatePlannerCall({stage,request:{...d.plannerCall,requestId:request.requestId},evidence:{artifacts:proof.data.artifacts,semanticProvenance:'operator-attested'}});
   if(planner.decision!=='allow')return planner;
   next.plannerLedger.stages[next.plannerLedger.stages.findIndex(s=>s.id===stage.id)]=planner.proposedTransition;
  }
  next.assignments.push({assignmentId:request.requestId,requestId:request.requestId,requestedBy:request.actorRef,status:'pending',actorRef:null,platform:request.platform,correlationRef:d.correlationRef,role:d.role,taskId:d.taskId,paths:[...d.paths],operations:[...d.operations],approvalRef:d.approvalRef,...(d.role==='planner'?{plannerStageId:d.plannerCall.stageId}:{}),...(d.checks?{checks:structuredClone(d.checks)}:{}),...(d.temporary?{temporary:structuredClone(d.temporary)}:{})});
  try{validateWorkflowState(next);}catch{return result('hold','runtime.assignment','invalid pending assignment scope',['valid-assignment']);}
  return {...result('allow','runtime.assignment','pending assignment authorized; observed spawn result still required'),proposedTransition:next};
 }
 if(request.operation==='accept'){
  const d=request.descriptor;const observed=fact('acceptance')?.data;
  const checks=Array.isArray(d.checkIds)&&task.requiredChecks?.every(id=>d.checkIds?.includes(id)&&state.checks.some(c=>c.id===id&&c.taskId===task.id&&c.status==='passed'&&c.fingerprint===d.fingerprint&&c.resultRef&&c.actorRef!==actor.actorRef&&state.identities.some(i=>i.actorRef===c.actorRef&&i.taskId===task.id&&i.role==='qa')));
  const findings=state.findings.filter(f=>f.taskId===task.id);
  if(!observed||!same(observed,d)||!d.fingerprint||!task.criteria?.length||!same(task.criteria,d.criteria)||!checks||findings.some(f=>!Array.isArray(d.findingIds)||!d.findingIds.includes(f.id)||!f.resolutionRef))return result('hold','git.orchestrator-accept-commit','criteria checks findings and fingerprint verification required',['acceptance-evidence']);
 }
 if(GIT_OPERATIONS.includes(request.operation)){
  const d=request.descriptor;const observed=fact('git-index')?.data;
  const relative=p=>typeof p==='string'&&p.length>0&&!/[\\\x00\r\n:]/.test(p)&&!p.startsWith('/')&&!p.split('/').some(x=>!x||x==='.'||x==='..');
  if(!observed||!same(observed,d)||d.parent!==state.target.head||!d.indexTree||!Array.isArray(d.paths)||!d.paths.length||!d.paths.every(relative)||new Set(d.paths).size!==d.paths.length||!same([...d.paths.map(p=>path.join(state.target.realpath,...p.split('/')))].sort(),[...request.paths].sort()))return result('hold','git.orchestrator-accept-commit','actual Git objects and relative path verification required',['git-evidence']);
  if(d.kind==='documents'){
   if(state.mode!=='plan'||state.documents.length!==2||!same(state.documents.map(x=>x.kind).sort(),['plan','spec'])||!same([...d.paths].sort(),state.documents.map(x=>x.gitPath).sort())||state.documents.some(doc=>doc.path!==path.join(state.target.realpath,...doc.gitPath.split('/'))||!state.approvals.some(a=>a.id===doc.approvalRef&&a.contentHash===doc.contentHash&&evidence.provenance.some(p=>p.id===a.id&&p.source===a.source&&p.messageRef===a.messageRef&&p.contentHash===doc.contentHash&&p.verification.sourceRef===a.messageRef))))return result('hold','runtime.docs-commit','exact approved documents required',['approved-documents']);
  }else{
   const accepted=state.acceptances.find(a=>a.taskId===task.id&&a.fingerprint===d.fingerprint&&state.identities.some(i=>i.actorRef===a.actorRef&&i.role==='orchestrator'));
   if(d.kind!=='task'||!accepted||task.status!=='accepted'||request.paths.some(p=>!task.paths.some(base=>within(base,p))))return result('hold','git.orchestrator-accept-commit','accepted task verification required',['git-evidence']);
  }
 }
 if(EXTERNAL_OPERATIONS.includes(request.operation))return result('hold','external.explicit-user-authority','explicit external target approval must be verified',['external-approval']);
 if(request.operation==='transition')return result('hold','runtime.transition','result confirmation required',['observed-result']);
 return result('allow',roleRule,'assigned operation with verified provenance');
}

/** Pure Planner decision. Artifact verification belongs to the trusted reader;
 * semantic judgments retain their recorded source and never become native proof. */
function evaluatePlannerCall({stage,request,evidence}={}){
 const base={expectedRevision:stage?.revision??0,proposedTransition:null,coverage:{enforcement:'decision-only',semanticProvenance:evidence?.semanticProvenance==='operator-attested'?'operator-attested':'unverified',nativeVerified:false}};
 const result=(decision,reason,requiredEvidence=[])=>({...base,decision,ruleIds:['runtime.planner-call'],reason,requiredEvidence});
 if(['format-only','re-expression-only','save-error-only','patch-error-only'].includes(request?.intent))return result('deny','Orchestrator handles non-progress delivery and formatting work');
 try{validatePlannerStage(stage);}catch(error){return result('hold',error.message,['planner-stage-ledger']);}
 if(!request||!['initial','correction','further'].includes(request.kind)||request.intent!=='substantive'||typeof request.requestId!=='string'||!request.requestId||request.stageId!==stage.id||!Array.isArray(request.criterionIds)||new Set(request.criterionIds).size!==request.criterionIds.length||!Array.isArray(request.evidenceRefs)||new Set(request.evidenceRefs).size!==request.evidenceRefs.length)return result('hold','Valid stage-bound Planner request required',['planner-request']);
 if(stage.pending)return result('hold','Reconcile the pending Planner call before another request',['confirmed-planner-result']);
 if(stage.calls.some(c=>c.requestId===request.requestId))return result('hold','Planner request already recorded',['new-request-id']);
 const initial=stage.calls.find(c=>c.kind==='initial'),correction=stage.calls.find(c=>c.kind==='correction');
 if(request.kind==='initial'&&stage.calls.length)return result('deny','Initial draft opportunity already used');
 if(request.kind!=='initial'){
  if(!initial||!['succeeded','failed'].includes(initial.status)||!stage.result||!['succeeded','failed'].includes(stage.result.status)||stage.result.requestId!==stage.calls.at(-1).requestId||!['succeeded','failed'].includes(stage.calls.at(-1).status))return result('hold','A confirmed prior result is required',['confirmed-planner-result']);
  if(!stage.review?.full||stage.review.resultRef!==stage.result.ref||stage.review.criteriaVersion!==stage.criteriaVersion||request.reviewRef!==stage.review.ref||stage.review.source!=='operator-attested')return result('hold','A complete review of the recorded result is required',['consolidated-review']);
  if(request.kind==='correction'&&correction)return result('deny','Consolidated correction opportunity already used');
  if(request.kind==='further'&&!correction)return result('hold','Use the consolidated correction before further calls',['consolidated-correction']);
 }
 const used=new Set(stage.calls.flatMap(c=>c.evidenceHashes)),artifacts=request.evidenceRefs.map(ref=>evidence?.artifacts?.find(a=>a.ref===ref));
 if(request.kind==='further'){
  if(!request.criterionIds.length||request.criterionIds.some(id=>!stage.criteria.some(c=>c.id===id&&c.status==='open')))return result('deny','Concrete open criteria are required');
  if(!request.evidenceRefs.length)return result('hold','Unresolved criteria alone are not new progress',['new-criterion-evidence']);
 }
 if(artifacts.some(a=>a&&a.stageId!==stage.id))return result('deny','Evidence belongs to another stage');
 if(artifacts.some(a=>!a||!['input','progress','finding'].includes(a.purpose)||a.verification?.status!=='verified'||a.verification.source!=='local-bytes'||!/^sha256:[a-f0-9]{64}$/.test(a.hash??'')))return result('hold','Accessible locally verified input or progress bytes are required',['verified-artifact-bytes']);
 if(request.kind==='further'){
  if(artifacts.some(a=>used.has(a.hash)))return result('deny','Identical evidence bytes cannot authorize another call');
  if(request.criterionIds.some(id=>!artifacts.some(a=>a.criterionIds?.includes(id))))return result('hold','Evidence must address every requested criterion',['criterion-evidence-link']);
  if(artifacts.some(a=>!a.semantic||a.semantic.meaningful!==true||a.semantic.source!=='operator-attested'||!a.semantic.judgmentRef||a.semantic.targetHash!==a.hash))return result('hold','A hash-bound semantic judgment is required',['semantic-attestation']);
 }
 const next=structuredClone(stage),call={requestId:request.requestId,kind:request.kind,intent:request.intent,criterionIds:[...request.criterionIds],evidenceHashes:artifacts.map(a=>a.hash),evidenceRefs:[...request.evidenceRefs],reviewRef:request.reviewRef??null,status:'reserved',ordinal:stage.calls.length+1};
 next.calls.push(call);next.pending=request.requestId;next.ready=false;
 return {...result('allow','Planner call reserved; dispatch and result remain unverified'),proposedTransition:next};
}


 return {evaluate,evaluatePlannerCall};
}
export function evaluateNative(policy,state,request,evidence){
 try{
  const path=portablePath.forTarget(state?.target?.realpath);
  return createPolicyCore({path,schema:createRuntimeSchema(path)}).evaluate(policy,state,request,evidence);
 }catch(error){
  return {decision:'hold',ruleIds:['runtime.schema'],reason:error.message,requiredEvidence:['valid-state-request-evidence'],expectedRevision:state?.revision??0,proposedTransition:null,coverage:{platform:request?.platform??'unknown',enforcement:'decision-only'}};
 }
}
