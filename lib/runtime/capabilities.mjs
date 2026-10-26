// Declarations describe documented hooks, never proof that this installation ran them.
const contracts = {
  codex: {spawn_agent:'Agent', followup_task:null, SubagentStart:null},
  claude: {Agent:'Agent', SubagentStart:null},
};
function operationOf(receipt, platform) {
  const matcher = contracts[platform]?.[receipt.operation];
  return matcher && receipt.toolPath === matcher ? receipt.operation : null;
}
export function summarizeProbe(receipts, {platform, sessionRef, platformVersion, attemptRef} = {}) {
  const candidates = Array.isArray(receipts) ? receipts.filter(r => r && r.source === 'native' &&
    r.platform === platform && operationOf(r,platform) &&
    typeof sessionRef === 'string' && sessionRef.length > 0 && r.sessionRef === sessionRef &&
    typeof platformVersion === 'string' && platformVersion.length > 0 && r.platformVersion === platformVersion &&
    typeof attemptRef === 'string' && attemptRef.length > 0 && r.attemptRef === attemptRef &&
    r.event === 'PreToolUse' && ['host-result','hook-decision'].includes(r.kind) &&
    r.decision === 'deny' && (r.kind !== 'host-result' || (r.toolExecuted === false && r.success === true))) : [];
  // JSON is unauthenticated. No native host verifier is available here, so even
  // a structurally valid current receipt is only an unverified observation.
  return {platform,sessionRef,platformVersion,attemptRef,verifiedDeny:false,status:'unknown',source:'unverified',
    toolPaths:[...new Set(candidates.map(r=>operationOf(r,platform)))]};
}
export function evaluateCapability({platform,toolPath,sessionRef,platformVersion,attemptRef,receipts=[]} = {}) {
  const known=Object.hasOwn(contracts[platform] ?? {},toolPath);
  const observationOnly=known && toolPath === 'SubagentStart';
  const observed=summarizeProbe(receipts,{platform,sessionRef,platformVersion,attemptRef});
  return {platform,toolPath,sessionRef,platformVersion,attemptRef,observationOnly,
    declared:{source:'documentation',matcher:contracts[platform]?.[toolPath] ?? null},
    status:!known || observationOnly ? 'unsupported':'unknown',verifiedDeny:false,
    source:!known || observationOnly ? 'documentation':'unverified',
    observation:observationOnly?'documented':toolPath==='followup_task'?'unknown':'not-verified',enforcement:observationOnly?'observation-only':'unverified',
    observedPaths:observed.toolPaths.filter(p=>p === toolPath)};
}

/** Raw event fields identify an invocation, not its approved role or semantics. */
export function plannerHookContextStatus({platform,input,context={}}={}){
 const text=v=>typeof v==='string'&&v.length>0,object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 const fields={
  'hook.hook_event_name':input?.hook_event_name==='PreToolUse','hook.session_id':text(input?.session_id),'hook.tool_use_id':text(input?.tool_use_id),'hook.tool_name':text(input?.tool_name),'hook.tool_input':object(input?.tool_input),'hook.cwd':text(input?.cwd),
  'context.sessionRef':text(context.sessionRef),'context.actorRef':text(context.actorRef),'context.taskId':text(context.taskId),'context.requestId':text(context.requestId),'context.toolUseId':text(context.toolUseId),'context.statePath':text(context.statePath),'context.state':object(context.state),'context.policy':object(context.policy),'context.evidence':object(context.evidence),'context.describeTool':typeof context.describeTool==='function',
 };
 const missing=Object.keys(fields).filter(k=>!fields[k]);
 return {platform,available:Object.keys(fields).filter(k=>fields[k]),missing,enforcement:missing.length?'unavailable':'hook-response-only',nativeVerified:false,source:'context-validation'};
}
