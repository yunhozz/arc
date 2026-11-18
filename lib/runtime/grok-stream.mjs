// Unverified CLI contract: public documentation only; no live enforcement evidence.
// Sources: https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-shell/README.md
// https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/22-permissions-and-safety.md
// U-K5: the shell README and permissions guide document rule syntax:
// ToolPrefix(glob_pattern), bare prefix matches the whole tool type; blocking effect unverified.
// https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/14-headless-mode.md
// U-K6: the headless guide example {"type":"text","data":…}.
// U-K7: the same guide lists end_turn, max_tokens, max_turn_requests, refusal, cancelled.
export const GROK_CONTRACT = Object.freeze({
  outputFormat: 'streaming-json',
  isolationArgs: Object.freeze(['--no-auto-update', '--no-subagents']),
  childEnv: Object.freeze({
    GROK_DISABLE_AUTOUPDATER: '1',
    GROK_CLAUDE_AGENTS_ENABLED: 'false',
    GROK_CLAUDE_SKILLS_ENABLED: 'false',
    GROK_CLAUDE_RULES_ENABLED: 'false',
    GROK_CLAUDE_MCPS_ENABLED: 'false',
    GROK_CLAUDE_HOOKS_ENABLED: 'false',
  }),
  eventKinds: Object.freeze({text: 'text', thought: 'thought', tool_call: 'tool_call', tool_call_update: 'tool_call_update', usage: 'usage', plan: 'plan', available_commands: 'available_commands', error: 'error', end: 'end'}),
  successStopReasons: Object.freeze(['end_turn']),
  resumeFlag: '--resume',
  delegation: 'undetectable',
  readOnlyDeny: Object.freeze(['Bash', 'Edit', 'Write', 'MCPTool']),
});
export function normalizeGrokStreamEvent(line) {
  let raw = line;
  if (typeof line === 'string') {try {raw = JSON.parse(line);} catch {return {kind: 'unknown', raw};}}
  const kind = raw && Object.hasOwn(GROK_CONTRACT.eventKinds, raw.type) ? GROK_CONTRACT.eventKinds[raw.type] : 'unknown';
  if (kind === 'unknown') return {kind, raw};
  return {kind, raw, ...(typeof raw.model === 'string' ? {model: raw.model} : {}),
    ...(kind === 'end' ? {...(typeof raw.sessionId === 'string' ? {sessionId: raw.sessionId} : {}), ...(typeof raw.stopReason === 'string' ? {stopReason: raw.stopReason} : {})} : {}),
    ...(kind === 'text' && typeof raw.data === 'string' ? {text: raw.data} : {})};
}
export function evaluateGrokObservation({state, expected, sessionId}) {
  const observedSession = state.grokSessionId, model = state.grokModel;
  const identityOk = observedSession === sessionId && !state.grokSessionMismatch;
  const modelMismatch = state.grokModelMismatch || Boolean(model && model !== expected.model);
  return {reason: !identityOk ? 'execution_identity_unverified' : modelMismatch ? 'model_effort_mismatch' : null,
    claims: {
      identity: identityOk ? {level: 'runtime-observed', source: 'grok-stream-session', observed: observedSession} : {level: 'unverified', source: 'none'},
      model: {level: model && !modelMismatch ? 'runtime-observed' : 'unverified', source: model ? 'grok-stream-model' : 'none', requested: expected.model, observed: model ?? null},
      effort: {level: 'unverified', source: 'none', requested: 'default', observed: null},
      permissions: {level: 'runtime-observed', source: 'worktree-snapshot', details: 'git-visible worktree only'},
    }};
}
