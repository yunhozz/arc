import {ROLES} from './operations.mjs';
import {assertSecretFree} from './external.mjs';
import {object,text,validatePlannerLedger} from './schema.mjs';
import {absolute,validateWorkflowId} from './scope.mjs';
import path from 'node:path';
const fail=message=>{throw Error('Cooperative schema: '+message);};
const hash=value=>typeof value==='string'&&/^sha256:[a-f0-9]{64}$/.test(value);
const revision=value=>Number.isSafeInteger(value)&&value>=0;
const actor=value=>object(value)&&text(value.id)&&Object.keys(value).every(k=>['id','role'].includes(k))&&(value.role===undefined||ROLES.includes(value.role));
const statement=value=>object(value)&&text(value.messageRef)&&object(value.data);
function fields(value,allowed){if(!object(value)||Object.keys(value).some(k=>!allowed.includes(k)))fail('unexpected input field');}
function json(value){try{const encoded=JSON.stringify(value);if(encoded===undefined)fail('JSON input');}catch{fail('JSON input');}}
const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const oid=value=>typeof value==='string'&&/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const time=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&/(?:Z|[+-]\d\d:\d\d)$/.test(value);
const unique=value=>Array.isArray(value)&&new Set(value).size===value.length;
const gitPath=value=>text(value)&&!/[\\\x00\r\n:]/.test(value)&&!value.startsWith('/')&&!value.split('/').some(part=>!part||part==='.'||part==='..');
const ref=value=>text(value)&&/^refs\/[A-Za-z0-9][A-Za-z0-9._\/-]*$/.test(value)&&!value.includes('..')&&!value.includes('//')&&!value.endsWith('/')&&!value.endsWith('.')&&!value.endsWith('.lock');
const approval=value=>exact(value,['ref','version','hash','approvedAt'])&&text(value.ref)&&Number.isSafeInteger(value.version)&&value.version>0&&hash(value.hash)&&time(value.approvedAt);
const document=value=>exact(value,['version','hash','content'])&&Number.isSafeInteger(value.version)&&value.version>0&&hash(value.hash)&&typeof value.content==='string'&&Buffer.byteLength(value.content)<=1024*1024;
export function validatePlanAmendArguments(a){
 if(!exact(a,['classification','reason','changedAt','affectedTaskIds','plan','history','approvals','writers','ownership','publication','remotes','recovery'])||!['contract','mechanical'].includes(a.classification)||!text(a.reason)||!time(a.changedAt)||!unique(a.affectedTaskIds)||!a.affectedTaskIds.length||!a.affectedTaskIds.every(text))fail('plan-amend request');
 if(!exact(a.plan,['path','gitPath','old','new'])||!absolute(a.plan.path)||!gitPath(a.plan.gitPath)||!document(a.plan.old)||!document(a.plan.new)||a.plan.new.version<=a.plan.old.version)fail('plan-amend document');
 if(!exact(a.history,['base','planCommit','head','branch'])||![a.history.base,a.history.planCommit,a.history.head].every(oid)||!text(a.history.branch)||/[\x00\r\n]/.test(a.history.branch))fail('plan-amend history');
 if(!exact(a.approvals,['original','amendment'])||!approval(a.approvals.original)||!(a.classification==='mechanical'&&a.approvals.amendment===null||approval(a.approvals.amendment)))fail('plan-amend approvals');
 if(!Array.isArray(a.writers)||!a.writers.length||a.writers.some(w=>!exact(w,['assignmentId','stoppedAt','evidenceRef'])||!text(w.assignmentId)||!time(w.stoppedAt)||!text(w.evidenceRef))||!unique(a.writers.map(w=>w.assignmentId)))fail('plan-amend writers');
 if(!['exclusive','shared','unknown'].includes(a.ownership)||!['unpublished','published','unknown'].includes(a.publication)||!Array.isArray(a.remotes)||a.remotes.some(r=>!exact(r,['name','identity','complete','refs','observedAt','evidenceRef'])||!text(r.name)||!hash(r.identity)||r.complete!==true||!time(r.observedAt)||!text(r.evidenceRef)||!Array.isArray(r.refs)||r.refs.some(x=>!exact(x,['name','oid'])||!ref(x.name)||!oid(x.oid))||!unique(r.refs.map(x=>x.name)))||!unique(a.remotes.map(r=>r.name)))fail('plan-amend remote snapshot');
 if(!exact(a.recovery,['ref','oid'])||!ref(a.recovery.ref)||!a.recovery.ref.startsWith('refs/arc/recovery/')||!oid(a.recovery.oid)||path.normalize(a.plan.path)!==a.plan.path)fail('plan-amend recovery');
 return a;
}
export function validateCooperativeCommand(command){
 assertSecretFree(command);fields(command,['command','input']);const {input,command:name}=command;
 if(!['init','record','status','reconcile','prepare','result'].includes(name))fail('command');
 if(name==='status'){if(input!==undefined)fail('status takes no input');return command;}
 const resultStatement=name==='reconcile'||name==='result'&&input?.operation===undefined;
 const allowed=name==='init'?['mode','actor','selection']:name==='record'?['requestId','expectedRevision','actor','evidence']:resultStatement?['requestId','expectedRevision','actor','intentId','result']:['requestId','expectedRevision','actor','operation','taskId','arguments'];
 fields(input,allowed);json(input);
 if(!actor(input.actor))fail('actor attestation');
 if(name==='init'){
  if(!['plan','no-plan','small-task'].includes(input.mode)||!object(input.selection)||!text(input.selection.messageRef)||!hash(input.selection.contentHash)||Object.keys(input.selection).some(k=>!['messageRef','contentHash'].includes(k)))fail('target selection');
  return command;
 }
 if(!text(input.requestId)||input.requestId.length>128||!revision(input.expectedRevision))fail('request identity or revision');
 if(name==='record'){
  fields(input.evidence,['kind','messageRef','data']);
  if(input.evidence?.data?.affectedTaskIds!==undefined&&(!Array.isArray(input.evidence.data.affectedTaskIds)||!input.evidence.data.affectedTaskIds.every(text)||new Set(input.evidence.data.affectedTaskIds).size!==input.evidence.data.affectedTaskIds.length))fail('affected task IDs');
  if(!statement(input.evidence)||!['note','approval','external-approval','document','scope','check','finding','review','acceptance-evidence','planner-stage','planner-evidence','planner-result','planner-review'].includes(input.evidence.kind))fail('evidence');
 }
 if(resultStatement){
  fields(input.result,['status','messageRef','data','notExecutedEvidence']);
  if(!text(input.intentId)||!statement(input.result)||!['succeeded','failed','unknown','mismatch','cancelled'].includes(input.result.status))fail('result evidence');
  if(input.result.status==='cancelled'&&(!object(input.result.notExecutedEvidence)||!text(input.result.notExecutedEvidence.messageRef)))fail('cancel requires not-executed evidence');
 }
 if((name==='prepare'||name==='result'&&!resultStatement)&&!text(input.operation))fail('operation');
 if(name==='prepare'&&input.operation==='plan-amend')validatePlanAmendArguments(input.arguments);
 return command;
}
export function validateCooperativeState(state){
 if(!object(state)||state.workflowKind!=='cooperative'||state.contractVersion!==1||state.schemaVersion!==1||!revision(state.revision)||state.mode!=='plan')fail('explicit cooperative contract');
 validateWorkflowId(state.workflowId);
 if(!object(state.target)||!absolute(state.target.realpath)||!absolute(state.target.gitCommonDir)||!absolute(state.target.gitDir)||!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(state.target.head)||!(state.target.branch===null||text(state.target.branch)))fail('target');
 if(!object(state.versions)||!text(state.versions.policy)||!text(state.versions.runtime)||!hash(state.versions.policyHash)||!hash(state.versions.runtimeHash))fail('versions');
 if(!object(state.coverage)||state.coverage.provenance!=='operator-attested'||state.coverage.nativeVerified!==false||state.coverage.enforcement!=='cooperative')fail('coverage');
 for(const key of ['actors','selections','assignments','identities','leases','scopes','approvals','documents','tasks','requests','intents','results','checks','findings','acceptances','commits','audit','unresolved','records','targetHistory'])if(!Array.isArray(state[key]))fail(key);
 if(state.tasks.some(t=>!object(t)||!text(t.id)||!Array.isArray(t.paths)||!Array.isArray(t.criteria)||!Array.isArray(t.requiredChecks)||!Array.isArray(t.dependencies))||new Set(state.tasks.map(t=>t.id)).size!==state.tasks.length)fail('task contracts');
 if(state.commitObservations!==undefined&&(!Array.isArray(state.commitObservations)||state.commitObservations.some(o=>!object(o)||o.source!=='local-git'||!text(o.intentId)||!revision(o.revision))))fail('commit observations');
 if(state.planAmendObservations!==undefined&&(!Array.isArray(state.planAmendObservations)||state.planAmendObservations.some(o=>!object(o)||o.source!=='local-git'||!text(o.intentId)||!revision(o.revision))))fail('plan-amend observations');
 if(state.planAmendments!==undefined&&(!Array.isArray(state.planAmendments)||state.planAmendments.some(a=>!object(a)||a.source!=='operator-attested'||a.observationSource!=='local-git'||!text(a.intentId)||!absolute(a.path)||!hash(a.oldHash)||!hash(a.newHash)||!oid(a.oldCommit)||!oid(a.newCommit)||!Array.isArray(a.mapping)||!a.mapping.length)))fail('plan-amend connections');
 if(!revision(state.scopeVersion)||!revision(state.targetVersion))fail('scope/target version');
 if(state.actors.some(a=>!actor(a.actor)||a.source!=='operator-attested')||state.selections.some(s=>s.source!=='operator-attested'||!text(s.messageRef)))fail('attestations');
 for(const key of ['scopes','approvals','documents','checks','findings','acceptances','commits'])if(state[key].some(entry=>!object(entry)||entry.source!=='operator-attested'))fail('attestation source');
 if(state.records.some(r=>!actor(r.actor)||r.source!=='operator-attested'||!text(r.kind)||!statement(r)))fail('records');
 if(state.requests.some(r=>!text(r.requestId)||!hash(r.requestFingerprint)||!object(r.decision))||new Set(state.requests.map(r=>r.requestId)).size!==state.requests.length)fail('request replay');
 if(state.intents.some(i=>!text(i.requestId)||!['prepared','succeeded','failed','unknown','mismatch','cancelled'].includes(i.status)||!hash(i.fingerprint))||new Set(state.intents.map(i=>i.requestId)).size!==state.intents.length)fail('intents');
 for(const intent of state.intents.filter(i=>i.operation==='plan-amend')){validatePlanAmendArguments(intent.arguments);if(!object(intent.target)||!object(intent.versions)||!object(intent.observation)||intent.source!=='operator-attested'||intent.checkpoint!==undefined&&!object(intent.checkpoint))fail('plan-amend intent');}
 if(state.results.some(r=>!text(r.requestId)||!['succeeded','failed','unknown','mismatch','cancelled'].includes(r.status)||r.source!=='operator-attested'||!object(r.data)))fail('results');
 if(state.plannerLedger!==undefined){validatePlannerLedger(state.plannerLedger);if(state.plannerLedger.stages.some(stage=>stage.workflowId!==state.workflowId||!Array.isArray(stage.artifacts)))fail('Planner workflow binding or artifacts');}
 assertSecretFree(state);json(state);return state;
}
