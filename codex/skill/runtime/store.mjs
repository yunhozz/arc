import {verifiedCooperativeReconciliation} from './acceptance.mjs';
import {verifiedReconciliation} from './gate.mjs';
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
  let decision;
  if(prior){
   if(prior.requestFingerprint!==requestFingerprint)throw Error('Request fingerprint conflict');
   const current=await decide(structuredClone(state));
   if(!current||!['allow','deny','hold'].includes(current.decision))throw Error('Invalid replay decision');
   const completing=normalized.operation==='commit'&&prior.decision.decision==='allow'&&prior.decision.expectedCommit&&current.decision==='allow'&&current.proposedTransition&&verifiedReconciliation(current,state,current.proposedTransition,prior.decision.expectedCommit)&&!state.commits.some(c=>c.requestId===requestId);
   if(completing)decision=current;
   else{
    const replay={...current,proposedTransition:null};
    if(current.decision==='allow'&&(current.proposedTransition||!['read','draft','review'].includes(normalized.operation))){replay.decision='hold';replay.reason='Replay cannot authorize repeated state or external effects';}
    return {state,decision:replay,replayed:true};
   }
  }
  if(state.revision!==expectedRevision)throw Error('Stale revision');
  decision??=await decide(structuredClone(state));
  if(!decision||!['allow','deny','hold'].includes(decision.decision))throw Error('Invalid decision');
  const next=decision.proposedTransition?structuredClone(decision.proposedTransition):structuredClone(state);
  if(decision.decision!=='allow'&&decision.proposedTransition)throw Error('Denied transition');
  if(next.workflowId!==state.workflowId||(JSON.stringify(next.target)!==JSON.stringify(state.target)&&!verifiedReconciliation(decision,state,next)))throw Error('Transaction target mismatch');
  for(const old of state.identities){const current=next.identities.find(i=>i.actorRef===old.actorRef);if(!current||current.taskId!==old.taskId||current.role!==old.role)throw Error('Identity rebind forbidden');}
  for(const old of state.leases){const current=next.leases.find(l=>l.actorRef===old.actorRef);if(old.status==='retired'&&(!current||current.status!=='retired'||current.taskId!==old.taskId))throw Error('Retired lease revival forbidden');}
  next.revision=state.revision+1;next.requests=prior?state.requests.map(r=>r.requestId===requestId?{requestId,requestFingerprint,decision}:r):[...state.requests,{requestId,requestFingerprint,decision}];
  next.audit=[...state.audit,{requestId,revision:next.revision,decision:decision.decision,ruleIds:decision.ruleIds??[],result:'pending'}];
  validateWorkflowState(next);
  await saveDurableState({statePath,state:next});
  return {state:next,decision,replayed:false};
 }finally{
  if(temporary)await fs.unlink(temporary).catch(()=>{});
  if(lock){await lock.close();await fs.unlink(lockPath);}
 }
}

/** Shared durability primitive. A post-rename sync error is reported as failure;
 * the caller must re-read rather than assume rollback or repeat an effect. */
export async function saveDurableState({statePath,state,create=false,storage={}}){
 const parent=path.dirname(statePath),temporary=path.join(parent,`.${path.basename(statePath)}.${crypto.randomUUID()}.tmp`);
 let exists=false;
 try{
  const handle=await fs.open(temporary,'wx',0o600);exists=true;
  try{await handle.writeFile(JSON.stringify(state,null,2)+'\n');await handle.sync();}finally{await handle.close();}
  if(create){await (storage.link??fs.link)(temporary,statePath);await fs.unlink(temporary);}else await (storage.rename??fs.rename)(temporary,statePath);
  exists=false;
  const directory=await fs.open(parent,'r');try{await directory.sync();}finally{await directory.close();}
 }finally{if(exists)await fs.unlink(temporary).catch(()=>{});}
}

/** Only a locally verified cooperative commit may advance the stored target. */
export function applyCooperativeCommitTransition({state,decision}){
 if(decision?.decision!=='allow'||!verifiedCooperativeReconciliation(decision,state)||!decision.proposedTransition?.commit)throw Error('Verified cooperative reconciliation required');
 const next=structuredClone(state),transition=decision.proposedTransition;
 next.targetHistory.push({target:structuredClone(state.target),revision:state.revision+1,source:'local-observation',kind:'verified-commit-parent'});
 next.target=structuredClone(transition.target);next.commits.push(structuredClone(transition.commit));next.tasks.find(t=>t.id===transition.commit.taskId).status='committed';
 return next;
}
