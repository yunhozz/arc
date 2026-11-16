// U-B1/B3/B4/B7/B9: fixture-only assumptions, never evidence for live capability verification.
export const GEMINI_CONTRACT = Object.freeze({
  prompt: 'Follow the role instructions and task on stdin.',
  eventKinds: Object.freeze({init: 'init', message: 'message', tool_use: 'tool_use', tool_result: 'tool_result', result: 'result'}),
  isolationArgs: Object.freeze([]), // U-B4: no guessed MCP or extension blocking flags.
  resumeFlag: '--resume', // U-B9: UUID acceptance is unverified; implementation resume stays off.
  delegation: 'undetectable', // U-B7: no verified delegation event schema.
});
const text = value => typeof value === 'string' && value !== '' ? value : undefined;
export function normalizeGeminiStreamEvent(line) {
  let raw = line;
  if (typeof line === 'string') {try {raw = JSON.parse(line);} catch {return {kind: 'unknown', raw};}}
  const kind = raw && Object.hasOwn(GEMINI_CONTRACT.eventKinds, raw.type) ? GEMINI_CONTRACT.eventKinds[raw.type] : 'unknown';
  if (kind === 'unknown') return {kind, raw};
  return {kind, raw, ...(text(raw.session_id) ? {sessionId: raw.session_id} : {}), ...(text(raw.model) ? {model: raw.model} : {}),
    ...(typeof raw.content === 'string' ? {text: raw.content} : {}),
    ...(kind === 'result' ? {isError: raw.is_error === true, ...(typeof raw.result === 'string' ? {resultText: raw.result} : {})} : {})};
}
export function evaluateGeminiObservation({state, expected, sessionId}) {
  const observedSession = state.geminiSessionId ?? state.init?.sessionId, model = state.geminiModel ?? state.init?.model;
  const identityOk = Boolean(observedSession && observedSession === sessionId && !state.geminiSessionMismatch);
  const modelMismatch = state.geminiModelMismatch || Boolean(model && model !== expected.model);
  return {reason: !identityOk ? 'execution_identity_unverified' : modelMismatch ? 'model_effort_mismatch' : null,
    claims: {
      identity: identityOk ? {level: 'runtime-observed', source: 'gemini-stream-session', observed: observedSession} : {level: 'unverified', source: 'none'},
      model: {level: model && !modelMismatch ? 'runtime-observed' : 'unverified', source: model ? 'gemini-stream-model' : 'none', requested: expected.model, observed: model ?? null},
      effort: {level: 'unverified', source: 'none', requested: 'default', observed: null},
      permissions: {level: 'runtime-observed', source: 'worktree-snapshot', details: 'git-visible worktree only'},
    }};
}
