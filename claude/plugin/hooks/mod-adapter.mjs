import {evaluateNative} from './runtime/policy-core.mjs';
/** An event is an observation, not a verified caller or approval. */
export function normalizeToolCheck(event){
 if(!event||typeof event!=='object'||Array.isArray(event)||typeof event.tool!=='string'||!event.tool||!event.input||typeof event.input!=='object'||Array.isArray(event.input))throw Error('Incomplete tool.check event');
 return {platform:'claude',toolName:event.tool,arguments:structuredClone(event.input),actorRef:null,hostIntegrity:'unverified',activation:'unavailable'};
}

/** The portable core sees no provider state until host provenance is verified. */
export function assessToolCheck(event,observation,resolution){
 const normalized=normalizeToolCheck(event),binding=resolution?.binding;
 const lease=resolution?.state?.leases?.find(item=>item.actorRef===binding?.actorRef);
 if(resolution?.status!=='ready'||binding?.status!=='active'||!observation||typeof observation.sessionId!=='string'||!observation.sessionId||binding.sessionId!==observation.sessionId||binding.agentId!==(event.agentId??null)||observation.agentId!==(event.agentId??null)||typeof event.tool_use_id!=='string'||!event.tool_use_id||!binding.actorRef||!binding.taskId||!binding.leaseId||lease?.status!=='active'||lease.leaseId!==binding.leaseId||lease.taskId!==binding.taskId){
  return {...evaluateNative(null,null,normalized,null),activeBinding:null};
 }
 const operation=event.tool==='Read'?'read':event.tool==='Write'?'write':null;
 if(!operation||typeof event.input.file_path!=='string')return {...evaluateNative(null,null,normalized,null),activeBinding:null};
 const request={requestId:event.tool_use_id,platform:'claude',actorRef:binding.actorRef,taskId:binding.taskId,cwd:observation.cwd,toolName:event.tool,arguments:structuredClone(event.input),operation,paths:[event.input.file_path],descriptor:{}};
 return {...evaluateNative(resolution.policy,resolution.state,request,resolution.evidence),activeBinding:binding};
}
