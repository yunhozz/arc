import {validateWorkflowState, text} from './schema.mjs';
import {ROLES} from './operations.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fingerprintRequest,saveDurableState} from './store.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
/** Observation is supplied by the trusted platform provider, never agent/tool arguments. */
export function registerAgentObservation(state, observation){
 validateWorkflowState(state);
 const result=(decision,reason)=>({decision,reason,state,proposedTransition:null});
 if(!observation||!text(observation.actorRef)||!text(observation.taskId)||!text(observation.observationRef)||!ROLES.includes(observation.role))return result('hold','complete observed identity required');
 const old=state.identities.find(i=>i.actorRef===observation.actorRef);
 const lease=state.leases.find(l=>l.actorRef===observation.actorRef);
 if(old&&(old.taskId!==observation.taskId||old.role!==observation.role))return result('deny','identity rebind');
 if(lease?.status==='retired')return result('deny','retired identity');
 const p=observation.provenance;
 if(!text(observation.eventRef)||!text(observation.correlationRef)||!p||p.source!=='platform-event'||p.eventRef!==observation.eventRef||p.actorRef!==observation.actorRef||p.platform!==observation.platform||p.correlationRef!==observation.correlationRef||p.verification?.status!=='verified'||!text(p.verification.verifierRef)||p.verification.sourceRef!==observation.eventRef)return result('hold','trusted platform spawn observation and correlation required');
 const assignment=state.assignments.find(a=>a.assignmentId===observation.assignmentId&&a.correlationRef===observation.correlationRef);
 if(!assignment||assignment.taskId!==observation.taskId||assignment.role!==observation.role||assignment.platform!==observation.platform||assignment.approvalRef!==observation.approvalRef||!same(assignment.paths,observation.paths)||!same(assignment.operations,observation.operations))return result('hold','observation does not match approved pending assignment');
 if(old){
  if(assignment.status==='active'&&assignment.actorRef===old.actorRef&&old.observationRef===observation.observationRef&&lease?.status==='active')return result('allow','same confirmed observation');
  return result('hold','existing identity cannot be assigned through another observation');
 }
 if(assignment.status!=='pending'||assignment.actorRef!==null||lease)return result('hold','new identity requires pending unbound assignment');
 const task=state.tasks.find(t=>t.id===assignment.taskId);if(!task||['accepted','committed'].includes(task.status))return result('hold','task no longer accepts agent observations');
 const next=structuredClone(state);const active=next.assignments.find(a=>a.assignmentId===assignment.assignmentId);active.actorRef=observation.actorRef;active.status='active';active.observationRef=observation.observationRef;
 next.identities.push({actorRef:observation.actorRef,taskId:observation.taskId,role:observation.role,observationRef:observation.observationRef});next.leases.push({actorRef:observation.actorRef,taskId:observation.taskId,status:'active'});next.tasks.find(t=>t.id===assignment.taskId).status='assigned';
 validateWorkflowState(next);
 return {decision:'allow',reason:'matching observed spawn bound to pending assignment',state:next,proposedTransition:next};
}

/** A raw start is audit only; verified correlation may bind an existing assignment. */
export async function recordPlannerAgentObservation({statePath,expectedRevision,input,platform,sessionRef,observation}={}){
 if(!path.isAbsolute(statePath??'')||input?.hook_event_name!=='SubagentStart'||input.session_id!==sessionRef||!text(sessionRef)||!text(input.agent_id)||!['codex','claude'].includes(platform))throw Error('Trusted observation target and complete start required');
 const parent=await fs.realpath(path.dirname(statePath));statePath=path.join(parent,path.basename(statePath));let lock;
 try{
  lock=await fs.open(statePath+'.lock','wx',0o600);const stat=await fs.lstat(statePath);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Observation state must be regular file');
  const state=validateWorkflowState(JSON.parse(await fs.readFile(statePath,'utf8'))),eventHash=fingerprintRequest({input,observation:observation??null});
  if(state.plannerObservations?.some(o=>o.eventHash===eventHash))return {decision:'hold',reason:'Observation replay',proposedTransition:null,replayed:true};
  const candidates=state.assignments.filter(a=>a.status==='pending'&&a.role==='planner');
  let decision={decision:'hold',reason:'Raw event lacks verified assignment correlation',proposedTransition:null};
  if(state.revision!==expectedRevision)decision.reason='Stale provider context cannot bind identity';
  else if(observation?.actorRef===input.agent_id&&observation.platform===platform)decision=registerAgentObservation(state,observation);
  const correlated=decision.decision==='allow'&&Boolean(decision.proposedTransition),next=correlated?decision.proposedTransition:structuredClone(state);
  const entry={eventHash,event:'SubagentStart',source:correlated?'verified-provider':'hook-stdin',sessionRef,agentRef:input.agent_id,classification:correlated?'correlated':candidates.length?'uncorrelated':'unmatched',identityVerified:correlated,reason:decision.reason,stageCandidates:candidates.map(a=>({assignmentId:a.assignmentId,stageId:a.plannerStageId??null,requestId:a.requestId})),coverage:{enforcement:'observation-only',nativeVerified:false,prevention:false},deduplication:'content-hash-only'};
  next.plannerObservations=[...(state.plannerObservations??[]),entry];next.revision=state.revision+1;next.audit.push({event:'SubagentStart',eventHash,revision:next.revision,classification:entry.classification,source:entry.source});validateWorkflowState(next);await saveDurableState({statePath,state:next});
  return {...decision,proposedTransition:correlated?next:null,observation:entry,persisted:true};
 }finally{if(lock){await lock.close();await fs.unlink(statePath+'.lock');}}
}
