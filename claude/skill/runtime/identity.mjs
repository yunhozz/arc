import {validateWorkflowState, text} from './schema.mjs';
import {ROLES} from './operations.mjs';
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
