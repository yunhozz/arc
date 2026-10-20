import {evaluate} from '../evaluate.mjs';
import {evaluateCapability} from '../capabilities.mjs';
import {registerAgentObservation} from '../identity.mjs';
import {transactWorkflow, fingerprintRequest} from '../store.mjs';
import {runGate} from '../gate.mjs';
import {classifyGitCommand} from '../git-query.mjs';

const text=v=>typeof v==='string'&&v.length>0;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const supported=new Set(['Read','Glob','Grep','Bash','Write','Edit','MultiEdit','Agent']);
const deny=reason=>({decision:'deny',reason,ruleIds:['runtime.claude'],proposedTransition:null});
/** Host-verified support for this installed version is required. A config value
 * alone cannot establish hook failure blocking; provider wiring belongs to T6. */
export function claudeFailureBlockingReady(support){
 return support?.status==='verified'&&support.onFailure==='block'&&text(support.platformVersion)&&text(support.verificationRef);
}
/** Context is a trusted host dependency, never deserialized from stdin/tool_input.
 * describeTool must parse the complete tool invocation conservatively, and supply
 * semantic operation, paths and descriptor. No native provider is assumed here. */
export function normalizeClaudeEvent(input,context={}){
 if(!object(input)||input.hook_event_name!=='PreToolUse'||!text(input.session_id)||input.session_id!==context.sessionRef||!text(context.actorRef)||!text(context.taskId)||!text(context.requestId)||!text(input.tool_use_id)||input.tool_use_id!==context.toolUseId||!text(input.tool_name)||!object(input.tool_input)||!text(input.cwd))throw Error('Verified session identity and complete PreToolUse event required');
 const toolPath=input.tool_name;
 const coverage={...evaluateCapability({platform:'claude',toolPath,sessionRef:context.sessionRef}),enforcement:'hook-response-only',nativeVerified:false,startupTimeout:'unknown',existingSessionInput:'unsupported',specializedPaths:'unknown',hostedTools:'unsupported'};
 if(!claudeFailureBlockingReady(context.failureBlocking))throw Error('Verified current-version onFailure block contract required');
 if(!supported.has(input.tool_name))return {request:null,coverage};
 if(typeof context.describeTool!=='function')throw Error('Trusted semantic tool provider unavailable');
 const semantic=context.describeTool(structuredClone(input));
 if(!object(semantic)||!text(semantic.operation)||!Array.isArray(semantic.paths)||!object(semantic.descriptor))throw Error('Complete semantic tool descriptor required');
 if(input.tool_name==='Agent'&&semantic.operation!=='assign-agent')throw Error('Agent tool requires assignment validation');
 return {request:{requestId:context.requestId,platform:'claude',actorRef:context.actorRef,taskId:context.taskId,cwd:input.cwd,toolName:input.tool_name,arguments:structuredClone(input.tool_input),operation:semantic.operation,paths:structuredClone(semantic.paths),descriptor:structuredClone(semantic.descriptor)},coverage};
}
/** Only documented PreToolUse fields are emitted. hold is a native deny. */
export function renderClaudeDecision(decision){
 if(decision?.decision==='allow')return {};
 const permissionDecision='deny';
 return {hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision,permissionDecisionReason:typeof decision?.reason==='string'?decision.reason:'Runtime gate could not verify permission'}};
}
/** This returns a response, not proof the host applied it. Startup failures,
 * timeout, hosted/specialized paths and existing write_stdin are outside it. */
export async function runClaudeGate(input,context={}){
 if(input?.hook_event_name==='PostToolUse'){
  // Result recording cannot authorize assignment/start or prevent a completed call.
  try{if(input.session_id===context.sessionRef&&input.tool_use_id===context.toolUseId&&text(context.actorRef)&&typeof context.recordToolResult==='function')await context.recordToolResult(structuredClone(input));}catch{}
  return {};
 }
 if(input?.hook_event_name==='SubagentStart'){
  // SubagentStart cannot prevent startup. Only a trusted provider can correlate
  // agent_id with a pending assignment; tool/event agent_type is not authority.
  try{
   if(input.session_id===context.sessionRef&&text(input.agent_id)&&typeof context.observeAgent==='function'){
    const observation=await context.observeAgent(structuredClone(input));
    if(observation?.actorRef===input.agent_id&&observation.platform==='claude'){
     const decision=registerAgentObservation(context.state,observation);
     if(decision.decision==='allow'&&decision.proposedTransition&&typeof context.persistObservation==='function')await context.persistObservation(decision,observation);
    }
   }
  }catch{/* Observation failure never claims startup was blocked. */}
  return {};
 }
 try{
  const {request,coverage}=normalizeClaudeEvent(input,context);
  if(!request)return renderClaudeDecision(deny('Tool path has no verified pre-action coverage'));
  if(!text(context.statePath))return renderClaudeDecision(deny('Trusted durable workflow store unavailable'));
  const result=await transactWorkflow({statePath:context.statePath,expectedRevision:context.state?.revision,requestId:request.requestId,request,requestFingerprint:fingerprintRequest(request),decide:async state=>{
   const decision=evaluate(context.policy,state,request,context.evidence);
   if(decision.decision!=='allow')return {...decision,coverage};
   const actor=state.identities.find(identity=>identity.actorRef===request.actorRef);
   if(request.toolName==='Bash'&&actor?.role!=='orchestrator'){
    const query=classifyGitCommand(request.arguments.command,context.policy.git);
    if(!query.allowed)return {...deny('Specialist Git guard: '+query.reason),coverage};
   }
   if(request.operation==='commit'){
    const git=await runGate({phase:'preflight',state,request,gitEvidence:context.gitEvidence});
    if(git.decision!=='allow')return {...git,coverage};
    return {...decision,expectedCommit:git.expectedCommit,coverage};
   }
   return {...decision,coverage};
  }});
  return renderClaudeDecision(result.decision);
 }catch(error){return renderClaudeDecision(deny('Runtime validation unavailable: '+error.message));}
}
