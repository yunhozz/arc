import {normalizeRole, ROLES} from './operations.mjs';
import {assertSecretFree} from './external.mjs';
import {object,text} from './schema.mjs';
import {absolute,validateWorkflowId} from './scope.mjs';
const fail=message=>{throw Error('Cooperative schema: '+message);};
const hash=value=>typeof value==='string'&&/^sha256:[a-f0-9]{64}$/.test(value);
const revision=value=>Number.isSafeInteger(value)&&value>=0;
const actor=value=>object(value)&&text(value.id)&&Object.keys(value).every(k=>['id','role'].includes(k))&&(value.role===undefined||ROLES.includes(normalizeRole(value.role)));
const statement=value=>object(value)&&text(value.messageRef)&&object(value.data);
function fields(value,allowed){if(!object(value)||Object.keys(value).some(k=>!allowed.includes(k)))fail('unexpected input field');}
function json(value){try{const encoded=JSON.stringify(value);if(encoded===undefined)fail('JSON input');}catch{fail('JSON input');}}
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
  if(!statement(input.evidence)||!['note','approval','external-approval','document','scope','check','finding','review','acceptance-evidence'].includes(input.evidence.kind))fail('evidence');
 }
 if(resultStatement){
  fields(input.result,['status','messageRef','data','notExecutedEvidence']);
  if(!text(input.intentId)||!statement(input.result)||!['succeeded','failed','unknown','mismatch','cancelled'].includes(input.result.status))fail('result evidence');
  if(input.result.status==='cancelled'&&(!object(input.result.notExecutedEvidence)||!text(input.result.notExecutedEvidence.messageRef)))fail('cancel requires not-executed evidence');
 }
 if((name==='prepare'||name==='result'&&!resultStatement)&&!text(input.operation))fail('operation');
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
 if(!revision(state.scopeVersion)||!revision(state.targetVersion))fail('scope/target version');
 if(state.actors.some(a=>!actor(a.actor)||a.source!=='operator-attested')||state.selections.some(s=>s.source!=='operator-attested'||!text(s.messageRef)))fail('attestations');
 for(const key of ['scopes','approvals','documents','checks','findings','acceptances','commits'])if(state[key].some(entry=>!object(entry)||entry.source!=='operator-attested'))fail('attestation source');
 if(state.records.some(r=>!actor(r.actor)||r.source!=='operator-attested'||!text(r.kind)||!statement(r)))fail('records');
 if(state.requests.some(r=>!text(r.requestId)||!hash(r.requestFingerprint)||!object(r.decision))||new Set(state.requests.map(r=>r.requestId)).size!==state.requests.length)fail('request replay');
 if(state.intents.some(i=>!text(i.requestId)||!['prepared','succeeded','failed','unknown','mismatch','cancelled'].includes(i.status)||!hash(i.fingerprint))||new Set(state.intents.map(i=>i.requestId)).size!==state.intents.length)fail('intents');
 if(state.results.some(r=>!text(r.requestId)||!['succeeded','failed','unknown','mismatch','cancelled'].includes(r.status)||r.source!=='operator-attested'||!object(r.data)))fail('results');
 assertSecretFree(state);json(state);return state;
}
