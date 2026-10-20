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
    observedPaths:observed.toolPaths.filter(p=>p === toolPath)};
}
