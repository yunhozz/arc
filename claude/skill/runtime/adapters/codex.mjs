import {evaluate} from '../evaluate.mjs';
import {evaluateCapability,plannerHookContextStatus} from '../capabilities.mjs';
import {recordPlannerAgentObservation} from '../identity.mjs';
import {transactWorkflow, fingerprintRequest} from '../store.mjs';
import {runGate} from '../gate.mjs';

const text=v=>typeof v==='string'&&v.length>0;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const supported=new Set(['Read','Glob','Grep','Bash','Write','Edit','MultiEdit','exec_command','apply_patch','Agent','spawn_agent']);
const deny=reason=>({decision:'deny',reason,ruleIds:['runtime.codex'],proposedTransition:null});
/** Context is a trusted host dependency, never deserialized from stdin/tool_input.
 * describeTool must parse the complete tool invocation conservatively, and supply
 * semantic operation, paths and descriptor. No native provider is assumed here. */
export function normalizeCodexEvent(input,context={}){
 const status=plannerHookContextStatus({platform:'codex',input,context});if(status.missing.length)throw Error('Missing trusted hook inputs: '+status.missing.join(', '));
 if(!object(input)||input.hook_event_name!=='PreToolUse'||!text(input.session_id)||input.session_id!==context.sessionRef||!text(context.actorRef)||!text(context.taskId)||!text(context.requestId)||!text(input.tool_use_id)||input.tool_use_id!==context.toolUseId||!text(input.tool_name)||!object(input.tool_input)||!text(input.cwd))throw Error('Verified session identity and complete PreToolUse event required');
 const toolPath=['Agent','spawn_agent'].includes(input.tool_name)?'spawn_agent':input.tool_name;
 const coverage={...evaluateCapability({platform:'codex',toolPath,sessionRef:context.sessionRef}),enforcement:'hook-response-only',nativeVerified:false,startupTimeout:'unknown',existingSessionInput:'unsupported',specializedPaths:'unknown',hostedTools:'unsupported'};
 if(!supported.has(input.tool_name))return {request:null,coverage};
 if(typeof context.describeTool!=='function')throw Error('Trusted semantic tool provider unavailable');
 const semantic=context.describeTool(structuredClone(input));
 if(!object(semantic)||!text(semantic.operation)||!Array.isArray(semantic.paths)||!object(semantic.descriptor))throw Error('Complete semantic tool descriptor required');
 if(['Agent','spawn_agent'].includes(input.tool_name)&&semantic.operation!=='assign-agent')throw Error('Agent tool requires assignment validation');
 return {request:{requestId:context.requestId,platform:'codex',actorRef:context.actorRef,taskId:context.taskId,cwd:input.cwd,toolName:input.tool_name,arguments:structuredClone(input.tool_input),operation:semantic.operation,paths:structuredClone(semantic.paths),descriptor:structuredClone(semantic.descriptor)},coverage};
}
/** Only documented PreToolUse fields are emitted. hold is a native deny. */
export function renderCodexDecision(decision){
 const permissionDecision=decision?.decision==='allow'?'allow':'deny';
 return {hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision,permissionDecisionReason:typeof decision?.reason==='string'?decision.reason:'Runtime gate could not verify permission'}};
}
/** This returns a response, not proof the host applied it. Startup failures,
 * timeout, hosted/specialized paths and existing write_stdin are outside it. */
export async function runCodexGate(input,context={}){
 if(input?.hook_event_name==='SubagentStart'){
  // SubagentStart cannot prevent startup. Only a trusted provider can correlate
  // agent_id with a pending assignment; tool/event agent_type is not authority.
  try{
   if(input.session_id===context.sessionRef&&text(input.agent_id)&&text(context.statePath)){
    let observation;try{if(typeof context.observeAgent==='function')observation=await context.observeAgent(structuredClone(input));}catch{}
    const decision=await recordPlannerAgentObservation({statePath:context.statePath,expectedRevision:context.state?.revision,input,platform:'codex',sessionRef:context.sessionRef,observation});
    if(decision.decision==='allow'&&decision.proposedTransition&&typeof context.persistObservation==='function')await context.persistObservation(decision,observation);
   }
  }catch{/* Observation failure never claims startup was blocked. */}
  return {};
 }
 try{
  const {request,coverage}=normalizeCodexEvent(input,context);
  if(!request)return renderCodexDecision(deny('Tool path has no verified pre-action coverage'));
  if(!text(context.statePath))return renderCodexDecision(deny('Trusted durable workflow store unavailable'));
  const result=await transactWorkflow({statePath:context.statePath,expectedRevision:context.state?.revision,requestId:request.requestId,request,requestFingerprint:fingerprintRequest(request),decide:async state=>{
   const decision=evaluate(context.policy,state,request,context.evidence);
   if(decision.decision!=='allow')return {...decision,coverage};
   if(request.operation==='commit'){
    const git=await runGate({phase:'preflight',state,request,gitEvidence:context.gitEvidence});
    if(git.decision!=='allow')return {...git,coverage};
    return {...decision,expectedCommit:git.expectedCommit,coverage};
   }
   return {...decision,coverage};
  }});
  return renderCodexDecision(result.decision);
 }catch(error){return renderCodexDecision(deny('Runtime validation unavailable: '+error.message));}
}
