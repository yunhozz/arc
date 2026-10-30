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
import {validateCooperativeState,validateCooperativeCommand} from './cooperative-schema.mjs';
import * as schema from './schema.mjs';
import {createPolicyCore} from './policy-core.mjs';
const {validatePlannerStage}=schema;
const {evaluate,evaluatePlannerCall}=createPolicyCore({path,schema});
export {evaluate,evaluatePlannerCall};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const within=(base,file)=>{const relative=path.relative(base,file);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));};
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
 if(request.command==='record'&&request.input.evidence.kind==='external-approval'&&request.input.actor.role!=='orchestrator')return hold('cooperative.external-approval','Orchestrator records explicit external approval');
 if(request.command==='record'&&request.input.evidence.kind.startsWith('planner-')||request.command==='prepare'&&request.input.operation==='planner-call')return evaluateCooperativePlanner({state,request,evidence});
 if(request.command==='prepare'){
  if(unresolvedExternal(state))return hold('cooperative.external-unresolved','Investigate unresolved external effects before follow-up');
  if(EXTERNAL_ACTIONS.includes(request.input.operation))return evaluateCooperativeExternal({state,request:request.input,approvalEvidence:state.records.findLast(r=>r.kind==='external-approval'&&r.messageRef===request.input.arguments?.approvalRef)});
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
