import {evaluateCooperativeAcceptance,prepareCooperativeCommit} from './acceptance.mjs';
import {evaluateCooperativeVerification} from './verification.mjs';
import {prepareCooperativeAssignment} from './assignment.mjs';
/**
 * @typedef {object} GateDecision
 * @property {'allow'|'deny'|'hold'} decision
 * @property {string[]} ruleIds
 * @property {string} reason
 * @property {string[]} requiredEvidence
 * @property {number} expectedRevision
 * @property {object|null} proposedTransition
 * @property {object} coverage
 */
import path from 'node:path';
import {validateCooperativeState,validateCooperativeCommand} from './cooperative-schema.mjs';
import {validateWorkflowState, validateRequest, validateEvidence} from './schema.mjs';
import {ROLES, ROLE_OPERATIONS, GIT_OPERATIONS, EXTERNAL_OPERATIONS} from './operations.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const within=(base,file)=>{const relative=path.relative(base,file);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));};
/** Pure policy decision. Evidence is supplied by a trusted adapter/provider, never tool arguments. */
export function evaluate(policy, state, request, evidence){
 const result=(decision,id,reason,requiredEvidence=[])=>({decision,ruleIds:[id],reason,requiredEvidence,expectedRevision:state?.revision??0,proposedTransition:null,coverage:{platform:request?.platform??'unknown',enforcement:'decision-only'}});
 try{validateWorkflowState(state);validateRequest(request);validateEvidence(evidence);}catch(error){return result('hold','runtime.schema',error.message,['valid-state-request-evidence']);}
 if(policy?.runtime?.schemaVersion!==1||!same(policy.runtime.roles,ROLES)||!Array.isArray(policy.runtime.ruleIds)||!Array.isArray(policy.runtime.requiredEvidence)||policy.runtime.status!=='decision-only')return result('hold','runtime.policy','runtime policy unavailable',['runtime-policy']);
 const actor=state.identities.find(i=>i.actorRef===request.actorRef);
 if(!actor)return result('hold','runtime.identity','platform identity unresolved',['platform-identity']);
 const role=actor.role;
 const roleRule={orchestrator:'role.orchestrator-boundary',scouter:'role.scouter-read-only',planner:'role.planner-draft-only',coder:'role.coder-implementation',qa:'role.qa-verification',reviewer:'role.reviewer-independent'}[role];
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
 if(role==='coder'&&['accepted','committed'].includes(task.status))return result('deny','runtime.identity','task execution ended');
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
  if(d.role==='coder'){
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
  if(!Array.isArray(d.paths)||!d.paths.length||!same([...d.paths].sort(),[...request.paths].sort())||!Array.isArray(d.operations)||!d.operations.length||d.approvalRef!==approval.id||!approval.scope.roles?.includes(d.role)||d.paths.some(p=>!task.paths.some(base=>within(base,p)))||d.operations.some(op=>!ROLE_OPERATIONS[d.role].includes(op)||!approval.scope.operations.includes(op)))return result('hold','runtime.assignment','delegated role paths operations and approval must match',['delegated-scope']);
  if(d.checks&&(!Array.isArray(approval.scope.checks)||d.checks.some(c=>!approval.scope.checks.some(approved=>same(approved,c)))))return result('hold','runtime.assignment','delegated checks not approved',['delegated-checks']);
  if(d.temporary&&!same(d.temporary,approval.scope.temporary))return result('hold','runtime.assignment','delegated temporary scope not approved',['delegated-temporary-scope']);
  if(state.assignments.some(a=>a.assignmentId===request.requestId||a.correlationRef===d.correlationRef))return result('hold','runtime.identity','assignment correlation already registered',['new-assignment-correlation']);
  const next=structuredClone(state);next.assignments.push({assignmentId:request.requestId,requestId:request.requestId,requestedBy:request.actorRef,status:'pending',actorRef:null,platform:request.platform,correlationRef:d.correlationRef,role:d.role,taskId:d.taskId,paths:[...d.paths],operations:[...d.operations],approvalRef:d.approvalRef,...(d.checks?{checks:structuredClone(d.checks)}:{}),...(d.temporary?{temporary:structuredClone(d.temporary)}:{})});
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

/** Cooperative statements never enter provider validation or identity resolution. */
export function evaluateCooperative({policy,state,request,evidence}={}){
 const base={expectedRevision:state?.revision??0,coverage:{enforcement:'cooperative',provenance:'operator-attested',nativeVerified:false}};
 const hold=(id,reason)=>({...base,decision:'hold',ruleIds:[id],reason,requiredEvidence:[],nextActions:[],proposedTransition:null});
 try{validateCooperativeState(state);validateCooperativeCommand(request);}catch(error){return hold('cooperative.schema',error.message);}
 if(policy!==undefined&&policy.workflowKind!=='cooperative')return hold('cooperative.contract','Explicit cooperative policy required');
 if(state.mode!=='plan'||request.command==='result')return hold('cooperative.unsupported','Operation is not supported in this CLI phase');
 if(!evidence||!same(evidence.target,state.target))return hold('cooperative.target','Observed target changed');
 if(!same(evidence.versions,state.versions))return hold('cooperative.versions','Policy or runtime changed');
 if(request.input&&request.input.expectedRevision!==state.revision)return hold('cooperative.revision','Stale revision');
 if(request.command==='prepare'){
  if(request.input.operation==='accept')return evaluateCooperativeAcceptance({state,request:request.input,evidence});
  if(request.input.operation==='commit')return prepareCooperativeCommit({state,request:request.input,evidence,gitEvidence:evidence.git});
  return request.input.operation==='assign-agent'?prepareCooperativeAssignment({policy,state,request:request.input,observations:{target:evidence.target,git:evidence.git}}):evaluateCooperativeVerification({state,request:request.input,evidence});
 }
 if(request.command==='record'&&(['check','review','finding'].includes(request.input.evidence.kind)||request.input.evidence.kind==='acceptance-evidence'&&request.input.evidence.data.kind==='task'))return evaluateCooperativeVerification({state,request:{...request.input,operation:'verification-record'},evidence});
 if(request.command==='status'&&(state.tasks.some(t=>t.invalidated||t.status==='committed'&&!state.commits.some(c=>c.taskId===t.id&&c.postCommitFingerprint===evidence.changes?.tasks?.[t.id]))||state.findings.some(f=>f.status!=='closed')||state.checks.some((c,index)=>!(c.scope==='task'&&state.tasks.some(t=>t.id===c.taskId&&t.status==='committed'))&&!state.checks.slice(index+1).some(next=>next.scope===c.scope&&next.taskId===c.taskId&&same(next.descriptor,c.descriptor))&&(c.stale||c.status!=='passed'||c.changeFingerprint!==(c.scope==='final'?evidence.changes?.final:evidence.changes?.tasks?.[c.taskId])))))return hold('cooperative.verification-stale','Verification or findings require current evidence');
 return {...base,decision:'allow',ruleIds:['cooperative.recorded'],requiredEvidence:[],nextActions:[],proposedTransition:null};
}

/** Result statements preserve uncertainty. They do not authenticate native events. */
export function reconcileCooperativeResult({state,intent,result,observations}={}){
 const base={expectedRevision:state?.revision??0,coverage:{enforcement:'cooperative',provenance:'operator-attested',nativeVerified:false},requiredEvidence:[],nextActions:[],proposedTransition:null};
 try{validateCooperativeState(state);}catch(error){return {...base,decision:'hold',ruleIds:['cooperative.schema'],reason:error.message};}
 return {...base,decision:'hold',ruleIds:[!intent?'cooperative.intent':result?.status==='unknown'?'cooperative.unknown':'cooperative.reconciliation'],requiredEvidence:[],nextActions:[],proposedTransition:null,reason:!intent?'No matching durable intent':'Recorded operator statement requires reconciliation; no execution authorized'};
}
