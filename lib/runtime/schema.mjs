/**
 * @typedef {object} WorkflowState
 * @property {1} schemaVersion
 * @property {string} workflowId
 * @property {number} revision
 * @property {object} versions
 * @property {object} target
 * @property {Array<object>} tasks
 * @property {Array<object>} assignments
 * @property {Array<object>} identities
 * @property {Array<object>} leases
 * @typedef {object} NormalizedRequest
 * @property {string} requestId
 * @property {'codex'|'claude'} platform
 * @property {string} operation
 * @property {string} actorRef
 * @property {string} taskId
 * @property {string} cwd
 * @property {string} toolName
 * @property {object} arguments
 * @property {string[]} paths
 * @property {object} descriptor
 * @typedef {object} EvidenceBundle
 * @property {Array<object>} provenance Provider-observed references, never raw tool arguments.
 * @property {Array<object>} [facts] Provider-confirmed facts tied to state and source references.
 */
import path from 'node:path';
import {ROLES, OPERATIONS} from './operations.mjs';
const fail = message => {throw new Error(`Runtime schema: ${message}`);};
export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const text = value => typeof value === 'string' && value.length > 0;
const hash = value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
const strings = value => Array.isArray(value) && value.every(text) && new Set(value).size === value.length;
const absolute = value => text(value) && path.isAbsolute(value) && path.normalize(value) === value;
const unique = (items,key) => items.every(x=>object(x)&&text(x[key])) && new Set(items.map(x=>x[key])).size===items.length;
function approval(a){return object(a)&&text(a.id)&&['user-message','human-confirmation'].includes(a.source)&&text(a.messageRef)&&hash(a.contentHash)&&object(a.scope)&&text(a.scope.taskId)&&absolute(a.scope.target)&&strings(a.scope.operations)&&a.scope.operations.every(op=>OPERATIONS.includes(op))&&strings(a.scope.paths)&&a.scope.paths.every(absolute);}
/** Validate stored workflow data. Observed provenance must still be checked by evaluate. */
export function validateWorkflowState(s){
 if(object(s)&&s.workflowKind!==undefined)fail('provider state cannot use cooperative contract');
 if(!object(s)||s.schemaVersion!==1||!text(s.workflowId)||!Number.isSafeInteger(s.revision)||s.revision<0)fail('version or identity');
 if(!object(s.versions)||['policy','runtime','adapter','policyHash','runtimeHash','adapterHash'].some(k=>!text(s.versions[k])))fail('versions');
 if(['policyHash','runtimeHash','adapterHash'].some(k=>!hash(s.versions[k])))fail('hash algorithm');
 if(!object(s.target)||!absolute(s.target.realpath)||['repository','worktree','baseHead','head'].some(k=>!text(s.target[k]))||!(s.target.branch===null||text(s.target.branch)))fail('target');
 if(!['plan','small-task','no-plan'].includes(s.mode))fail('mode');
 for(const k of ['documents','approvals','tasks','assignments','identities','leases','checks','findings','acceptances','commits','audit','capabilities','requests'])if(!Array.isArray(s[k]))fail(k);
 if(!unique(s.tasks,'id')||s.tasks.some(t=>!['pending','assigned','rework','verification','accepted','committed'].includes(t.status)||!strings(t.paths)||t.paths.some(p=>!absolute(p))||!strings(t.dependencies)||!text(t.baseCommit)||!strings(t.criteria)||!strings(t.requiredChecks)))fail('tasks');
 if(!unique(s.approvals,'id')||s.approvals.some(a=>!approval(a)))fail('approval provenance');
 if(!unique(s.identities,'actorRef')||s.identities.some(i=>!ROLES.includes(i.role)||!text(i.taskId)||!text(i.observationRef)))fail('identity');
 if(!unique(s.leases,'actorRef')||s.leases.some(l=>!text(l.taskId)||!['active','suspended','retired'].includes(l.status)))fail('lease');
 if(s.assignments.some(a=>!object(a)||!((a.status==='pending'&&a.actorRef===null&&text(a.assignmentId)&&text(a.correlationRef)&&text(a.requestId)&&text(a.requestedBy)&&['codex','claude'].includes(a.platform))||text(a.actorRef))||!text(a.taskId)||!ROLES.includes(a.role)||!strings(a.paths)||a.paths.some(p=>!absolute(p))||!strings(a.operations)||a.operations.some(op=>!OPERATIONS.includes(op))||!text(a.approvalRef)))fail('assignment');
 for(const a of s.assignments){
  if(a.checks!==undefined&&(!Array.isArray(a.checks)||a.checks.some(c=>!object(c)||!absolute(c.executable)||!Array.isArray(c.args)||!c.args.every(x=>typeof x==='string')||!absolute(c.cwd)||!object(c.env)||!strings(c.outputs)||c.outputs.some(p=>!absolute(p)))))fail('check descriptor');
  if(a.temporary!==undefined&&(!object(a.temporary)||!strings(a.temporary.paths)||a.temporary.paths.some(p=>!absolute(p))||!text(a.temporary.cleanupOwner)||!Number.isFinite(Date.parse(a.temporary.expiresAt))))fail('temporary assignment');
 }
 if(new Set(s.assignments.map(a=>a.status==='pending'?'pending:'+a.assignmentId:'actor:'+a.actorRef)).size!==s.assignments.length)fail('ambiguous assignment');
 if(s.documents.some(d=>!object(d)||!['spec','plan'].includes(d.kind)||!absolute(d.path)||!text(d.gitPath)||path.isAbsolute(d.gitPath)||d.gitPath.split('/').includes('..')||!hash(d.contentHash)||!text(d.approvalRef)))fail('document');
 if(s.checks.some(c=>!object(c)||!text(c.id)||!text(c.taskId)||!['passed','failed','pending','unknown'].includes(c.status)||!text(c.fingerprint)||!text(c.actorRef)||!text(c.resultRef)))fail('checks');
 if(s.findings.some(f=>!object(f)||!text(f.id)||!text(f.taskId)))fail('findings');
 if(s.acceptances.some(a=>!object(a)||!text(a.taskId)||!text(a.actorRef)||!text(a.fingerprint)||!strings(a.criteria)||!strings(a.checkIds)||!strings(a.findingIds)))fail('acceptances');
 if(s.commits.some(c=>!object(c)||!text(c.purpose)||!text(c.taskId)||!text(c.expectedParent)||!text(c.expectedTree)))fail('commits');
 if(s.requests.some(r=>!object(r)||!text(r.requestId)||!hash(r.requestFingerprint)||!object(r.decision))||new Set(s.requests.map(r=>r.requestId)).size!==s.requests.length)fail('request replay');
 if(s.plannerLedger!==undefined){validatePlannerLedger(s.plannerLedger);if(s.plannerLedger.stages.some(stage=>stage.workflowId!==s.workflowId))fail('Planner workflow binding');}
 return s;
}
export function validateRequest(r){
 if(!object(r)||['requestId','actorRef','taskId','toolName'].some(k=>!text(r[k]))||!['codex','claude'].includes(r.platform)||!OPERATIONS.includes(r.operation)||!absolute(r.cwd)||!object(r.arguments)||!object(r.descriptor)||!strings(r.paths)||r.paths.some(p=>!absolute(p)))fail('request');
 return r;
}
export function validateEvidence(e){
 if(!object(e)||!Array.isArray(e.provenance)||!unique(e.provenance,'id'))fail('evidence');
 if(e.resolvedPaths!==undefined&&(!Array.isArray(e.resolvedPaths)||e.resolvedPaths.some(p=>!object(p)||!absolute(p.path)||!absolute(p.realpath))))fail('resolved paths');
 if(e.facts!==undefined&&(!Array.isArray(e.facts)||e.facts.some(f=>!object(f)||!text(f.kind)||!text(f.workflowId)||!Number.isSafeInteger(f.revision)||!object(f.target)||!hash(f.policyHash)||!text(f.sourceRef)||!object(f.data))))fail('facts');
 for(const p of e.provenance){
  if(!['platform-event','user-message','human-confirmation'].includes(p.source))fail('provenance source');
  if(p.source==='platform-event'&&(!text(p.eventRef)||!text(p.actorRef)||!['codex','claude'].includes(p.platform)))fail('platform provenance');
  if(p.source!=='platform-event'&&(!text(p.messageRef)||!hash(p.contentHash)))fail('approval provenance');
  if(!object(p.verification)||p.verification.status!=='verified'||!text(p.verification.verifierRef)||!text(p.verification.sourceRef))fail('unverified provenance');
 }
 return e;
}

/** Shared stage shape. Missing ledgers remain valid legacy state, never fresh history. */
export function validatePlannerStage(stage){
 if(stage?.ready!==undefined&&typeof stage.ready!=='boolean')fail('Planner readiness type');
 if(!object(stage)||!text(stage.id)||!text(stage.workflowId)||!object(stage.document)||!absolute(stage.document.path)||!['spec','plan'].includes(stage.document.kind)||!text(stage.document.phase)||!text(stage.approvalRef)||!Number.isSafeInteger(stage.inputVersion)||stage.inputVersion<1||!Number.isSafeInteger(stage.scopeVersion)||stage.scopeVersion<0||!Number.isSafeInteger(stage.criteriaVersion)||stage.criteriaVersion<1)fail('Planner stage identity');
 if(!Array.isArray(stage.criteria)||!stage.criteria.length||!unique(stage.criteria,'id')||stage.criteria.some(c=>!['open','resolved'].includes(c.status)||!text(c.judgmentRef)))fail('Planner criteria');
 if(!Array.isArray(stage.calls)||!unique(stage.calls,'requestId')||stage.calls.some(c=>!['initial','correction','further'].includes(c.kind)||!['reserved','unknown','succeeded','failed'].includes(c.status)||!Array.isArray(c.evidenceHashes)||c.evidenceHashes.some(h=>!hash(h)))||stage.calls.filter(c=>c.kind==='initial').length>1||stage.calls.filter(c=>c.kind==='correction').length>1)fail('Planner call history');
 if(stage.pending!==null&&(!text(stage.pending)||!stage.calls.some(c=>c.requestId===stage.pending&&['reserved','unknown'].includes(c.status))))fail('Planner pending call');
 const pending=stage.calls.filter(c=>['reserved','unknown'].includes(c.status));if(pending.length>1||pending.length!==(stage.pending===null?0:1))fail('Planner orphan reservation');
 if(stage.artifacts!==undefined&&(!Array.isArray(stage.artifacts)||!unique(stage.artifacts,'ref')||stage.artifacts.some(a=>!absolute(a.path)||!hash(a.hash)||!Array.isArray(a.criterionIds)||!['draft','self-review','input','progress','finding'].includes(a.purpose)||a.verification?.status!=='verified'||a.verification.source!=='local-bytes'||a.semantic&&a.semantic.source!=='operator-attested')))fail('Planner artifact evidence');
 if(stage.ready===true&&(stage.pending!==null||stage.criteria.some(c=>c.status!=='resolved')||stage.result?.status!=='succeeded'||stage.review?.complete!==true||stage.review?.full!==true||stage.review?.resultRef!==stage.result.ref||!stage.artifacts?.some(a=>a.ref===stage.result.artifactRef&&a.purpose==='draft')||!stage.artifacts?.some(a=>a.ref===stage.result.selfReviewRef&&a.purpose==='self-review')))fail('Planner incomplete readiness');
 return stage;
}
export function validatePlannerLedger(ledger){
 if(!object(ledger)||ledger.version!==1||!Array.isArray(ledger.stages)||!unique(ledger.stages,'id'))fail('Planner ledger');
 for(const stage of ledger.stages)validatePlannerStage(stage);
 return ledger;
}
