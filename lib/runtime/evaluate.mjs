import {evaluateCooperativeExternal,reconcileCooperativeExternal,EXTERNAL_ACTIONS,unresolvedExternal} from './external.mjs';
export {evaluateCooperativeExternal,reconcileCooperativeExternal};
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
import crypto from 'node:crypto';
import {fingerprintRequest} from './store.mjs';
import {validateCooperativeState,validateCooperativeCommand,validatePlanAmendArguments} from './cooperative-schema.mjs';
import {validateWorkflowState, validateRequest, validateEvidence,validatePlannerStage} from './schema.mjs';
import {ROLES, ROLE_OPERATIONS, GIT_OPERATIONS, EXTERNAL_OPERATIONS} from './operations.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const within=(base,file)=>{const relative=path.relative(base,file);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));};
const objectFields=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const hashBytes=value=>'sha256:'+crypto.createHash('sha256').update(value).digest('hex');
const gitBlob=(value,length)=>crypto.createHash(length===64?'sha256':'sha1').update(`blob ${Buffer.byteLength(value)}\0`).update(value).digest('hex');
const planCoverage={enforcement:'cooperative',provenance:'operator-attested',nativeVerified:false,remoteVerified:false};
const planDecision=(state,reason,transition=null,allow=false)=>({expectedRevision:state?.revision??0,decision:allow?'allow':'hold',ruleIds:['cooperative.plan-amend'],reason,coverage:{...planCoverage},requiredEvidence:[],nextActions:[],proposedTransition:transition});
const unresolvedPlan=state=>state.intents.some(i=>i.operation==='plan-amend'&&['prepared','unknown','mismatch','failed'].includes(i.status));
const remoteIdentities=remotes=>remotes.map(r=>r.name+'\0'+r.identity).sort();
function remoteSnapshotValid(remotes,configured,at,protectedOids){
 if(!Number.isFinite(at)||!Array.isArray(configured)||!Array.isArray(remotes)||configured.some(r=>!objectFields(r,['name','identity'])||typeof r.name!=='string'||!/^sha256:[a-f0-9]{64}$/.test(r.identity??''))||new Set(configured.map(r=>r.name)).size!==configured.length||!same(remoteIdentities(remotes),remoteIdentities(configured)))return false;
 return remotes.every(r=>r.complete===true&&Number.isFinite(Date.parse(r.observedAt))&&at-Date.parse(r.observedAt)>=0&&at-Date.parse(r.observedAt)<=300000&&r.refs.every(ref=>ref.oid.length===protectedOids[0]?.length&&!protectedOids.includes(ref.oid)));
}
function planEntries(commit,length){
 const validOid=value=>typeof value==='string'&&new RegExp(`^[a-f0-9]{${length}}$`).test(value);
 return commit&&validOid(commit.oid)&&validOid(commit.parent)&&typeof commit.author==='string'&&typeof commit.authorDate==='string'&&typeof commit.message==='string'&&Array.isArray(commit.headerTemplate)&&commit.headerTemplate.every(header=>typeof header==='string')&&['tree','parent','committer'].every(name=>commit.headerTemplate.filter(header=>header===name).length===1)&&Array.isArray(commit.tree)&&new Set(commit.tree.map(row=>row.path)).size===commit.tree.length&&commit.tree.every(row=>objectFields(row,['path','mode','oid'])&&typeof row.path==='string'&&row.path.length>0&&!row.path.startsWith('/')&&!/[\\\x00\r\n:]/.test(row.path)&&!row.path.split('/').some(p=>!p||p==='.'||p==='..')&&['100644','100755','120000','160000'].includes(row.mode)&&validOid(row.oid));
}
function oldPlanObservation(a,g,target){
 const h=g?.history,commits=h?.commits,length=target.head.length,oldBlob=gitBlob(a.plan.old.content,length);
 if(!same(g?.target,target)||!g.index||!new RegExp(`^[a-f0-9]{${length}}$`).test(g.index.tree??'')||g.index.tree!==g.index.headTree||g.index.stagedPaths?.length!==0||g.worktree?.planClean!==true||!/^sha256:[a-f0-9]{64}$/.test(g.worktree?.nonPlanFingerprint??'')||g.plan?.path!==a.plan.path||g.plan.content!==a.plan.old.content||g.plan.hash!==a.plan.old.hash||g.plan.originalHash!==a.plan.old.hash||!h||h.base!==a.history.base||h.planCommit!==a.history.planCommit||h.head!==a.history.head||!Array.isArray(commits)||!commits.length||commits.length>256||commits.some(c=>!c)||commits[0].oid!==a.history.planCommit||commits.at(-1).oid!==a.history.head||new Set(commits.map(c=>c.oid)).size!==commits.length)return false;
 const originalMode=commits[0].tree?.find(row=>row.path===a.plan.gitPath)?.mode;
 return ['100644','100755'].includes(originalMode)&&g.plan.mode===originalMode&&commits.every((c,index)=>planEntries(c,length)&&c.parent===(index?commits[index-1].oid:a.history.base)&&c.tree.filter(row=>row.path===a.plan.gitPath).length===1&&c.tree.some(row=>row.path===a.plan.gitPath&&row.mode===originalMode&&row.oid===oldBlob));
}
function approvalRecord(state,a,approval){
 const record=state.records.findLast(r=>r.kind==='approval'&&r.messageRef===approval.ref);
 return record?.source==='operator-attested'&&record.actor?.role==='orchestrator'&&record.targetVersion===state.targetVersion&&record.scopeVersion===state.scopeVersion&&record.data?.kind==='plan'&&record.data.path===a.plan.path&&record.data.version===approval.version&&record.data.contentHash===approval.hash&&record.data.approvedAt===approval.approvedAt;
}
function planAuthorization(state,a,at){
 if(!Number.isFinite(at)||a.ownership!=='exclusive'||a.publication!=='unpublished'||a.history.head!==state.target.head||a.history.branch!==state.target.branch||!state.target.branch||a.recovery.oid!==state.target.head||a.plan.path!==path.join(state.target.realpath,...a.plan.gitPath.split('/'))||a.plan.old.hash!==hashBytes(a.plan.old.content)||a.plan.new.hash!==hashBytes(a.plan.new.content)||a.plan.old.hash===a.plan.new.hash)return false;
 const old=a.approvals.original,next=a.approvals.amendment,changed=Date.parse(a.changedAt);
 if(old.version!==a.plan.old.version||old.hash!==a.plan.old.hash||Date.parse(old.approvedAt)>changed||changed>at||!approvalRecord(state,a,old))return false;
 if(a.classification==='contract'&&!next||next&&(next.version!==a.plan.new.version||next.hash!==a.plan.new.hash||Date.parse(next.approvedAt)<changed||Date.parse(next.approvedAt)>at||!approvalRecord(state,a,next)))return false;
 return a.writers.every(w=>Date.parse(w.stoppedAt)<=at&&state.records.some(r=>r.kind==='note'&&r.messageRef===w.evidenceRef&&r.source==='operator-attested'&&r.actor?.role==='orchestrator'&&r.targetVersion===state.targetVersion&&r.scopeVersion===state.scopeVersion&&r.data?.type==='writer-stopped'&&r.data.assignmentId===w.assignmentId&&r.data.stoppedAt===w.stoppedAt));
}
export function prepareCooperativePlanAmend({state,request,evidence}={}){
 const a=request?.arguments,g=evidence?.git,at=evidence?.now;
 try{validatePlanAmendArguments(a);}catch{return planDecision(state,'Exact plan-amend evidence required');}
 if(request.actor?.role!=='orchestrator'||request.expectedRevision!==state.revision||state.unresolved.some(x=>!x.resolvedBy)||state.intents.some(i=>i.operation==='plan-amend'&&['prepared','unknown','mismatch','failed'].includes(i.status))||!planAuthorization(state,a,at)||!oldPlanObservation(a,g,state.target)||g.recoveryRef!==null||!remoteSnapshotValid(a.remotes,g.configuredRemotes,at,g.history.commits.map(c=>c.oid)))return planDecision(state,'Approval, stopped writers, clean index, local history and unpublished remote attestations required');
 return planDecision(state,'Durable intent only; the operator performs any rewrite',{intent:{requestId:request.requestId,operation:'plan-amend',status:'prepared',arguments:structuredClone(a),target:structuredClone(state.target),versions:structuredClone(state.versions),scopeVersion:state.scopeVersion,targetVersion:state.targetVersion,observation:structuredClone(g),fingerprint:fingerprintRequest(request),source:'operator-attested'}},true);
}
export function checkpointCooperativePlanAmend({state,request,evidence}={}){
 const d=request?.evidence?.data,intent=state.intents.find(i=>i.requestId===d?.intentId&&i.operation==='plan-amend'),a=intent?.arguments,g=evidence?.git;
 if(request?.actor?.role!=='orchestrator'||!objectFields(d,['type','intentId'])||d.type!=='plan-amend-checkpoint'||!intent||intent.status!=='prepared'||intent.checkpoint||!same(intent.target,state.target)||!same(intent.versions,state.versions)||!planAuthorization(state,a,evidence?.now)||!oldPlanObservation(a,g,state.target)||!same(g.recoveryRef,{name:a.recovery.ref,oid:a.recovery.oid})||g.worktree.nonPlanFingerprint!==intent.observation.worktree.nonPlanFingerprint||g.index.tree!==intent.observation.index.tree||!same(g.history.commits,intent.observation.history.commits)||!remoteSnapshotValid(a.remotes,g.configuredRemotes,evidence.now,g.history.commits.map(c=>c.oid)))return planDecision(state,'Current prepared intent, recovery ref and pre-rewrite observation required');
 return planDecision(state,'Pre-rewrite checkpoint recorded',{checkpoint:{intentId:intent.requestId,messageRef:request.evidence.messageRef,observedAt:new Date(evidence.now).toISOString(),observation:structuredClone(g)}},true);
}
export function reconcileCooperativePlanAmend({state,intent,result,observations,now}={}){
 const transition={result:{...structuredClone(result),status:result?.status==='unknown'?'unknown':result?.status==='failed'?'failed':'mismatch',data:{...structuredClone(result?.data??{}),remoteVerified:false},source:'operator-attested'},observation:observations?.git??null};
 const hold=reason=>planDecision(state,reason,transition);
 if(!intent||intent.operation!=='plan-amend'||!['prepared','unknown','mismatch'].includes(intent.status)||!intent.checkpoint||!same(intent.target,state.target)||!same(intent.versions,state.versions)||intent.scopeVersion!==state.scopeVersion||intent.targetVersion!==state.targetVersion)return hold('Matching unresolved plan-amend intent and checkpoint required');
 if(result?.status!=='succeeded')return hold('Rewrite did not establish a successful result');
 const d=result.data,a=intent.arguments,g=observations?.git,target=observations?.target,mapping=d?.mapping,old=intent.observation.history.commits,next=g?.history?.newCommits;
 try{validatePlanAmendArguments({...a,remotes:d?.remotes});}catch{return hold('Exact result and fresh remote attestations required');}
 if(!objectFields(d,['head','mapping','remotes'])||!Array.isArray(mapping)||mapping.length!==old.length||!mapping.length||mapping.some(m=>!objectFields(m,['old','new']))||new Set(mapping.map(m=>m.old)).size!==mapping.length||new Set(mapping.map(m=>m.new)).size!==mapping.length||!Array.isArray(next)||next.length!==mapping.length||!target||target.realpath!==intent.target.realpath||target.gitCommonDir!==intent.target.gitCommonDir||target.gitDir!==intent.target.gitDir||target.branch!==intent.target.branch||target.head!==d.head||mapping.at(-1).new!==target.head||!same(g?.target,target)||g.index?.tree!==g.index?.headTree||g.index?.stagedPaths?.length!==0||g.worktree?.planClean!==true||g.worktree.nonPlanFingerprint!==intent.observation.worktree.nonPlanFingerprint||!same(g.recoveryRef,{name:a.recovery.ref,oid:a.recovery.oid})||g.plan?.path!==a.plan.path||g.plan.content!==a.plan.new.content||g.plan.hash!==a.plan.new.hash||g.plan.originalHash!==a.plan.old.hash||!same(g.history.commits,old)||!same(remoteIdentities(d.remotes),remoteIdentities(a.remotes))||!remoteSnapshotValid(d.remotes,g.configuredRemotes,now,[...old.map(c=>c.oid),...mapping.map(m=>m.new)]))return hold('Observed target, preservation, mapping, document or remote evidence differs');
 const planOid=gitBlob(a.plan.new.content,target.head.length),originalMode=old[0].tree.find(row=>row.path===a.plan.gitPath)?.mode;if(g.plan.mode!==originalMode)return hold('Working plan mode differs');
 for(let i=0;i<mapping.length;i++){
  const before=old[i],after=next[i],m=mapping[i];
  if(!planEntries(after,target.head.length)||m.old!==before.oid||m.new!==after.oid||after.parent!==(i?mapping[i-1].new:a.history.base)||after.author!==before.author||after.authorDate!==before.authorDate||after.message!==before.message||!same(after.headerTemplate,before.headerTemplate))return hold('Commit mapping or metadata differs');
  const plan=after.tree.filter(row=>row.path===a.plan.gitPath),oldPlan=before.tree.find(row=>row.path===a.plan.gitPath);if(plan.length!==1||!oldPlan||plan[0].mode!==oldPlan.mode||plan[0].oid!==planOid)return hold('Unexpected plan bytes or mode in rewritten history');
  const other=rows=>rows.filter(row=>row.path!==a.plan.gitPath).sort((x,y)=>x.path<y.path?-1:x.path>y.path?1:0);
  if(!same(other([...before.tree]),other([...after.tree])))return hold('Non-plan tree changed');
 }
 transition.result.status='succeeded';transition.target=structuredClone(target);transition.mapping=structuredClone(mapping);return planDecision(state,'Locally observed same-intent amendment; remote claims remain operator-attested',transition,true);
}
/** Pure policy decision. Evidence is supplied by a trusted adapter/provider, never tool arguments. */
export function evaluate(policy, state, request, evidence){
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
 if(request.operation==='plan-amend')return result('hold','runtime.plan-amend','Cooperative plan-amend requires its durable intent and local observer',['plan-amend-intent']);
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
 const checkpoint=request.command==='record'&&request.input.evidence.kind==='note'&&request.input.evidence.data?.type==='plan-amend-checkpoint';
 if(unresolvedPlan(state)&&((request.command==='prepare')||(request.command==='record'&&!checkpoint)))return hold('cooperative.plan-amend-unresolved','Resolve the same plan-amend intent before further work');
 if(checkpoint)return checkpointCooperativePlanAmend({state,request:request.input,evidence});
 if(request.command==='record'&&request.input.evidence.kind==='external-approval'&&request.input.actor.role!=='orchestrator')return hold('cooperative.external-approval','Orchestrator records explicit external approval');
 if(request.command==='record'&&request.input.evidence.kind.startsWith('planner-')||request.command==='prepare'&&request.input.operation==='planner-call')return evaluateCooperativePlanner({state,request,evidence});
 if(request.command==='prepare'){
  if(unresolvedExternal(state))return hold('cooperative.external-unresolved','Investigate unresolved external effects before follow-up');
  if(EXTERNAL_ACTIONS.includes(request.input.operation))return evaluateCooperativeExternal({state,request:request.input,approvalEvidence:state.records.findLast(r=>r.kind==='external-approval'&&r.messageRef===request.input.arguments?.approvalRef)});
  if(request.input.operation==='plan-amend')return prepareCooperativePlanAmend({state,request:request.input,evidence});
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

/** Pure Planner decision. Artifact verification belongs to the trusted reader;
 * semantic judgments retain their recorded source and never become native proof. */
export function evaluatePlannerCall({stage,request,evidence}={}){
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

/** Cooperative Planner records are attestations with separately observed bytes. */
export function evaluateCooperativePlanner({state,request,evidence}={}){
 const base={expectedRevision:state.revision,coverage:{enforcement:'cooperative',provenance:'operator-attested',nativeVerified:false},proposedTransition:null,requiredEvidence:[]};
 const result=(decision,reason)=>({...base,decision,ruleIds:['cooperative.planner'],reason});
 if(request.input.actor.role!=='orchestrator')return result('hold','Orchestrator records and prepares Planner work');
 if(!state.plannerLedger)return result('hold','Existing workflow Planner history has no ledger; reconciliation required');
 const ledger=structuredClone(state.plannerLedger),input=request.input,data=input.evidence?.data;
 const stage=ledger.stages.find(s=>s.id===(data?.stageId??input.arguments?.stageId));
 const observed=evidence.plannerArtifacts??[];
 const artifact=ref=>observed.find(a=>a.ref===ref&&a.stageId===stage?.id&&a.verification?.status==='verified');
 const transition=(s,reason,decision='allow',uncertainty=false)=>({...result(decision,reason),proposedTransition:{plannerLedger:ledger,...(s?{stageId:s.id}:{}),...(uncertainty?{recordUncertainty:true}:{})}});
 if(request.command==='prepare'){
  if(!stage)return result('hold','Planner stage ledger unavailable');
  if(stage.workflowId!==state.workflowId||stage.scopeVersion!==state.scopeVersion||stage.targetVersion!==state.targetVersion)return result('hold','Planner stage contract version changed');
  const d=evaluatePlannerCall({stage,request:{...input.arguments,requestId:input.requestId},evidence:{artifacts:observed,semanticProvenance:'operator-attested'}});
  if(d.decision!=='allow')return {...d,coverage:base.coverage,expectedRevision:state.revision};
  ledger.stages[ledger.stages.indexOf(stage)]=d.proposedTransition;
  return {...transition(stage,d.reason),proposedTransition:{plannerLedger:ledger,intent:{requestId:input.requestId,operation:'planner-call',stageId:stage.id,taskId:input.taskId??null,status:'prepared',fingerprint:evidence.requestFingerprint,source:'operator-attested',identityVerified:false,target:structuredClone(state.target),kind:input.arguments.kind}}};
 }
 const kind=input.evidence.kind,ref=input.evidence.messageRef;
 if(kind==='planner-stage'){
  if(ledger.stages.some(s=>s.id===data.id))return result('deny','Planner stage ID already exists');
  const contract={document:data.document,inputVersion:data.inputVersion,criteriaVersion:data.criteriaVersion,scopeVersion:data.scopeVersion};
  const approval=state.records.find(r=>r.kind==='approval'&&r.messageRef===data.approvalRef&&r.source==='operator-attested'&&r.scopeVersion===state.scopeVersion&&r.targetVersion===state.targetVersion);
  const approved=approval?.data?.plannerStage;
  if(!approved||!same(contract.document,approved.document)||['inputVersion','criteriaVersion','scopeVersion'].some(k=>contract[k]!==approved[k])||contract.scopeVersion!==state.scopeVersion||!within(state.target.realpath,data.document?.path))return result('hold','Approved stage contract and current scope are required');
  if(data.document.kind==='plan'&&!approval.data.prerequisiteRefs?.some(ref=>state.records.some(r=>r.kind==='approval'&&r.messageRef===ref&&r.data.kind==='spec'&&r.source==='operator-attested')))return result('hold','Approved spec prerequisite is required for plan drafting');
  const previous=[...ledger.stages,...(evidence.plannerHistory??[]).map(h=>h.stage)].filter(s=>s.document.path===data.document.path&&s.document.kind===data.document.kind&&s.document.phase===data.document.phase);
  if(evidence.plannerHistoryError)return result('hold','Planner history could not be verified: '+evidence.plannerHistoryError);
  if(previous.length){
   const prior=previous.find(s=>data.previousStageRef?.workflowId===s.workflowId&&data.previousStageRef?.stageId===s.id);
   if(!prior||approved.newScope!==true||!same(approved.previousStageRef,data.previousStageRef)||data.inputVersion<=prior.inputVersion||data.approvalRef===prior.approvalRef)return result('hold','Existing stage history requires an approved scope transition and predecessor link');
  }
  const created={...structuredClone(data),workflowId:state.workflowId,targetVersion:state.targetVersion,targetIdentity:{realpath:state.target.realpath,gitCommonDir:state.target.gitCommonDir,gitDir:state.target.gitDir},calls:[],pending:null,result:null,review:null,artifacts:[],ready:false};
  try{validatePlannerStage(created);}catch(error){return result('hold',error.message);}
  ledger.stages.push(created);return transition(created,'Planner stage registered without resetting prior history');
 }
 if(!stage)return result('hold','Planner stage ledger unavailable');
 if(stage.scopeVersion!==state.scopeVersion||stage.targetVersion!==state.targetVersion)return result('hold','Planner stage contract version changed');
 if(kind==='planner-evidence'){
  if(stage.artifacts.some(a=>a.ref===ref))return result('deny','Planner evidence reference already recorded');
  const item=observed.find(a=>a.ref===ref&&a.stageId===stage.id);
  if(!item||item.verification?.status!=='verified'||!['draft','self-review','input','progress','finding'].includes(data.purpose)||!Array.isArray(data.criterionIds)||data.criterionIds.some(id=>!stage.criteria.some(c=>c.id===id)))return result('hold','Accessible stage-bound artifact bytes and purpose required');
  if(data.semantic&&(data.semantic.source!==undefined&&data.semantic.source!=='operator-attested'||typeof data.semantic.meaningful!=='boolean'||!data.semantic.judgmentRef||data.semantic.targetHash!==item.hash))return result('hold','Semantic attestation must bind the observed artifact hash');
  stage.artifacts.push({...item,purpose:data.purpose,criterionIds:[...data.criterionIds],...(data.semantic?{semantic:{...data.semantic,source:'operator-attested'}}:{})});return transition(stage,'Artifact bytes recorded separately from semantic attestation');
 }
 if(kind==='planner-result'){
  const call=stage.calls.find(c=>c.requestId===data.callRequestId);
  if(!call||stage.pending!==call.requestId||!['reserved','unknown'].includes(call.status)||!['succeeded','failed','unknown'].includes(data.status))return result('hold','A pending Planner call and confirmed result identity are required');
  if(data.status==='succeeded'&&(!artifact(data.artifactRef)||artifact(data.artifactRef).purpose!=='draft'||!artifact(data.selfReviewRef)||artifact(data.selfReviewRef).purpose!=='self-review'))return result('hold','Verified full draft and self-review artifacts are required');
  call.status=data.status;call.resultRef=ref;stage.result={ref,requestId:call.requestId,status:data.status,artifactRef:data.artifactRef??null,selfReviewRef:data.selfReviewRef??null,source:'operator-attested'};stage.ready=false;
  if(data.status!=='unknown')stage.pending=null;
  return transition(stage,data.status==='unknown'?'Planner execution remains unknown':'Planner result statement recorded',data.status==='unknown'?'hold':'allow',data.status==='unknown');
 }
 if(kind==='planner-review'){
  if(stage.pending||!stage.result||!['succeeded','failed'].includes(stage.result.status)||data.resultRef!==stage.result.ref||data.full!==true||typeof data.complete!=='boolean'||!Array.isArray(data.criteria)||data.criteria.length!==stage.criteria.length||new Set(data.criteria.map(c=>c.id)).size!==stage.criteria.length||data.criteria.some(c=>!stage.criteria.some(old=>old.id===c.id)||!['open','resolved'].includes(c.status)||!c.judgmentRef))return result('hold','Full review must bind the confirmed result and all criteria');
  for(const old of stage.criteria)if(old.status==='resolved'&&data.criteria.find(c=>c.id===old.id).status==='open'){
   const reassessment=data.reassessments?.find(r=>r.criterionId===old.id&&r.previousJudgmentRef===old.judgmentRef&&r.reasonRef),proof=artifact(reassessment?.newEvidenceRef);
   if(!reassessment||!proof||!proof.criterionIds.includes(old.id)||!proof.semantic?.meaningful||stage.calls.some(c=>c.evidenceHashes.includes(proof.hash)))return result('hold','Resolved criteria require a new evidence-bound reassessment');
  }
  if(data.complete&&(data.criteria.some(c=>c.status!=='resolved')||!artifact(stage.result.artifactRef)||!artifact(stage.result.selfReviewRef)))return result('hold','Incomplete draft cannot become ready or accepted');
  stage.criteria=structuredClone(data.criteria);stage.review={ref,resultRef:data.resultRef,criteriaVersion:stage.criteriaVersion,full:true,complete:data.complete,source:'operator-attested'};stage.ready=data.complete;
  return transition(stage,'Semantic completeness and criterion judgments remain operator-attested');
 }
 return result('hold','Unsupported Planner record');
}
