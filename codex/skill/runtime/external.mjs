import {fingerprintRequest} from './store.mjs';
import {absolute,within} from './scope.mjs';
export const EXTERNAL_ACTIONS=Object.freeze(['push','merge','deploy','publish']);
const keys={push:['repository','destination','refspec','sourceOid','expectedRemoteOid'],merge:['repository','changeRef','targetRef','expectedTargetOid'],deploy:['service','project','environment','artifactId','destination'],publish:['service','namespace','name','version','artifactHash','destination']};
const text=v=>typeof v==='string'&&v.length>0;
const same=(a,b)=>a===undefined||b===undefined?a===b:fingerprintRequest(a)===fingerprintRequest(b);
const fields=(v,allowed)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===allowed.length&&allowed.every(k=>Object.hasOwn(v,k));
/** Reject credentials before audit persistence; errors never contain input values. */
export function assertSecretFree(value){
 if(typeof value==='string'){
  if(/(?:[a-z][a-z0-9+.-]*:\/\/|^)[^\s/]+:[^\s/]+@|[?&#](?:access[_-]?token|token|key|password|secret|signature|credential|auth)=|\b(?:Bearer|Basic)\s+\S+/i.test(value))throw Error('Secret-free identifiers required');
 }else if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){
  if(/^(?:password|passwd|token|accessToken|access_token|secret|credentials?|authorization|apiKey|api_key|privateKey)$/i.test(key))throw Error('Secret-free identifiers required');assertSecretFree(item);
 }
}
function descriptorValid(operation,d){
 if(!keys[operation]||!fields(d,keys[operation])||!Object.values(d).every(v=>text(v)&&!/[\r\n\x00]/.test(v)))return false;
 if(d.destination&&/[?#]/.test(d.destination))return false;
 const oid=v=>/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(v);
 if(operation==='push'&&(!oid(d.sourceOid)||!oid(d.expectedRemoteOid)))return false;
 if(operation==='merge'&&!oid(d.expectedTargetOid))return false;
 return operation!=='publish'||/^sha256:[a-f0-9]{64}$/.test(d.artifactHash);
}
const coverage={enforcement:'cooperative',provenance:'operator-attested',nativeVerified:false,remoteVerified:false};
const decision=(state,reason,transition=null,allow=false)=>({expectedRevision:state?.revision??0,decision:allow?'allow':'hold',ruleIds:['cooperative.external'],reason,coverage:{...coverage},requiredEvidence:[],nextActions:[],proposedTransition:transition});
export const unresolvedExternal=state=>state.intents.some(i=>EXTERNAL_ACTIONS.includes(i.operation)&&['prepared','unknown','mismatch'].includes(i.status));
export function evaluateCooperativeExternal({state,request,approvalEvidence}={}){
 const a=request?.arguments;
 try{assertSecretFree(request);assertSecretFree(approvalEvidence);}catch{return decision(state,'Secret-free identifiers required');}
 if(state?.mode!=='plan'||request?.expectedRevision!==state.revision||request.actor?.role!=='orchestrator'||!fields(a,['approvalRef','scope','descriptor'])||!descriptorValid(request.operation,a.descriptor)||!Array.isArray(a.scope)||!a.scope.length||new Set(a.scope).size!==a.scope.length||a.scope.some(p=>!absolute(p)||!within(state.target.realpath,p)))return decision(state,'Exact external action, scope and secret-free target required');
 const approval=state.records.findLast(r=>r.kind==='external-approval'&&r.messageRef===a.approvalRef);
 if(!approval||approval.source!=='operator-attested'||approval.scopeVersion!==state.scopeVersion||approval.targetVersion!==state.targetVersion||!same(approval,approvalEvidence)||!same(approval.data,{operation:request.operation,scope:a.scope,descriptor:a.descriptor}))return decision(state,'Exact explicit external approval required; local approval is insufficient');
 if(unresolvedExternal(state)||state.unresolved.some(u=>!u.resolvedBy)||state.intents.some(i=>i.requestId===request.requestId||EXTERNAL_ACTIONS.includes(i.operation)&&i.approvalRef===a.approvalRef))return decision(state,'Unresolved effects or consumed approval require investigation; never retry');
 return decision(state,'External intent only; operator execution is separate',{intent:{requestId:request.requestId,operation:request.operation,status:'prepared',scope:structuredClone(a.scope),descriptor:structuredClone(a.descriptor),approvalRef:a.approvalRef,approvalFingerprint:fingerprintRequest(approval),scopeVersion:state.scopeVersion,targetVersion:state.targetVersion,target:structuredClone(state.target),versions:structuredClone(state.versions),fingerprint:fingerprintRequest(request),source:'operator-attested'}},true);
}
export function reconcileCooperativeExternal({state,intent,result}={}){
 if(!intent||!EXTERNAL_ACTIONS.includes(intent.operation)||!['prepared','unknown','mismatch'].includes(intent.status))return decision(state,'Matching unresolved external intent required; replay cannot authorize another effect');
 try{assertSecretFree(result);}catch{return decision(state,'Secret-free result required');}
 const transition={result:{...structuredClone(result),status:'mismatch',messageRef:result?.messageRef??'invalid-result',data:{...structuredClone(result?.data??{}),remoteVerified:false},source:'operator-attested'}};
 const reject=reason=>decision(state,reason,transition);
 if(!result||!text(result.messageRef)||!['succeeded','failed','unknown','mismatch','cancelled'].includes(result.status))return reject('Exact external result statement required');
 if(!fields(result.data,['operation','scope','descriptor'])||result.data.operation!==intent.operation||!same(result.data.scope,intent.scope)||!same(result.data.descriptor,intent.descriptor))return reject('External result action, scope or target mismatch');
 transition.result={...structuredClone(result),data:{...structuredClone(result.data),remoteVerified:false},source:'operator-attested'};
 const approval=state.records.findLast(r=>r.kind==='external-approval'&&r.messageRef===intent.approvalRef);
 if(!approval||fingerprintRequest(approval)!==intent.approvalFingerprint||state.mode!=='plan'||!same(intent.target,state.target)||!same(intent.versions,state.versions)||intent.scopeVersion!==state.scopeVersion||intent.targetVersion!==state.targetVersion){transition.result.status='mismatch';return reject('Stale external approval, target or versions');}
 if(result.status==='succeeded')return decision(state,'Operator result recorded; no independent remote verification',transition,true);
 if(result.status==='cancelled'&&text(result.notExecutedEvidence?.messageRef))return decision(state,'Operator attests no execution; approval remains consumed',transition,true);
 return reject('External effect unresolved or unsuccessful; investigate without retry');
}
export function cooperativeSupport(){return {phases:[{phase:1,status:'supported',areas:['durable-state','documents','assignment']},{phase:2,status:'supported',areas:['scope','verification','acceptance-commit']},{phase:3,status:'supported',areas:['external-approval','external-result','audit-recovery']}],modes:{plan:'supported','no-plan':'unsupported',omission:'unsupported'},limits:['operator-attested identity and approval','direct calls outside CLI are not blocked','no network, native or provider execution','audit is local mutable evidence','unknown effects require investigation, not retry'],remoteVerified:false};}
