import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {validateWorkflowState, validateRequest} from './schema.mjs';
/** Hash complete normalized decision inputs at the trusted caller boundary, never a tool-supplied hash. */
export function fingerprintRequest(input){
 const canonical=value=>{
  if(value===null||typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number'&&Number.isFinite(value))return value;
  if(Array.isArray(value))return value.map(canonical);
  if(value&&Object.getPrototypeOf(value)===Object.prototype)return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  throw Error('Request fingerprint requires complete JSON inputs');
 };
 return 'sha256:'+crypto.createHash('sha256').update(JSON.stringify(canonical(input))).digest('hex');
}
/** A failed/interrupted transaction retains the original state. Locks are never silently recovered. */
export async function transactWorkflow({statePath,expectedRevision,requestId,request,requestFingerprint,decide}){
 if(!path.isAbsolute(statePath)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0||typeof requestId!=='string'||!requestId||typeof decide!=='function')throw Error('Invalid transaction');
 if(typeof requestFingerprint!=='string'||!/^sha256:[a-f0-9]{64}$/.test(requestFingerprint))throw Error('Valid request fingerprint required');
 const normalized=validateRequest(structuredClone(request));
 if(normalized.requestId!==requestId||fingerprintRequest(normalized)!==requestFingerprint)throw Error('Request fingerprint conflict with normalized input');
 const parent=await fs.realpath(path.dirname(statePath));statePath=path.join(parent,path.basename(statePath));
 const lockPath=statePath+'.lock';let lock;let temporary;
 try{
  lock=await fs.open(lockPath,'wx',0o600);
  const stat=await fs.lstat(statePath);if(!stat.isFile()||stat.isSymbolicLink())throw Error('State must be regular file');
  const state=validateWorkflowState(JSON.parse(await fs.readFile(statePath,'utf8')));
  const prior=state.requests.find(r=>r.requestId===requestId);
  if(prior){if(prior.requestFingerprint!==requestFingerprint)throw Error('Request fingerprint conflict');return {state,decision:prior.decision,replayed:true};}
  if(state.revision!==expectedRevision)throw Error('Stale revision');
  const decision=await decide(structuredClone(state));
  if(!decision||!['allow','deny','hold'].includes(decision.decision))throw Error('Invalid decision');
  const next=decision.proposedTransition?structuredClone(decision.proposedTransition):structuredClone(state);
  if(decision.decision!=='allow'&&decision.proposedTransition)throw Error('Denied transition');
  if(next.workflowId!==state.workflowId||JSON.stringify(next.target)!==JSON.stringify(state.target))throw Error('Transaction target mismatch');
  for(const old of state.identities){const current=next.identities.find(i=>i.actorRef===old.actorRef);if(!current||current.taskId!==old.taskId||current.role!==old.role)throw Error('Identity rebind forbidden');}
  for(const old of state.leases){const current=next.leases.find(l=>l.actorRef===old.actorRef);if(old.status==='retired'&&(!current||current.status!=='retired'||current.taskId!==old.taskId))throw Error('Retired lease revival forbidden');}
  next.revision=state.revision+1;next.requests=[...state.requests,{requestId,requestFingerprint,decision}];
  next.audit=[...state.audit,{requestId,revision:next.revision,decision:decision.decision,ruleIds:decision.ruleIds??[],result:'pending'}];
  validateWorkflowState(next);
  temporary=path.join(parent,`.${path.basename(statePath)}.${crypto.randomUUID()}.tmp`);
  const handle=await fs.open(temporary,'wx',0o600);try{await handle.writeFile(JSON.stringify(next,null,2)+'\n');await handle.sync();}finally{await handle.close();}
  await fs.rename(temporary,statePath);temporary=undefined;
  const directory=await fs.open(parent,'r');try{await directory.sync();}finally{await directory.close();}
  return {state:next,decision,replayed:false};
 }finally{
  if(temporary)await fs.unlink(temporary).catch(()=>{});
  if(lock){await lock.close();await fs.unlink(lockPath);}
 }
}
