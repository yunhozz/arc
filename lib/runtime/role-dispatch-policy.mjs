import {runtimeRegistryOf} from './platform-registry.mjs';
// Fixed policy values for composite role dispatch. G2 'escalation' means the bridge runs only with per-call user escalation approval on a Codex host; it is not a verified pass.
// GK2/GG2 'approval' means a Grok/Gemini host keeps its platform-default sandbox (off), runs in ask mode, and obtains user approval for each runtime command; it is not a verified pass.
export const BRIDGE_GATE_RESULTS = Object.freeze({G1: 'pass', G2: 'escalation', G3: 'pass', G4: 'pass', G5: 'wide', G6: 'strict', G7: 'pass', G8: 'pass', GG1: 'fail', GG2: 'fail', GK1: 'fail', GK2: 'fail'});
export const HOST_SANDBOX_GATES = Object.freeze({grok: 'GK2', gemini: 'GG2'});
export const HOST_GATE_ALLOWED = Object.freeze(['pass', 'approval']);

function deepFreeze(value) {
  for (const nested of Object.values(value)) {
    if (nested !== null && typeof nested === 'object') deepFreeze(nested);
  }
  return Object.freeze(value);
}

// Claude 2.1.328, 2026-11-19, macOS Seatbelt: /private/tmp/claude-<uid> is writable, Bash exits 71 per command if sandboxing is unavailable, and M-C4 found no widening in trusted or untrusted workspaces.
const RECORDED_CLAUDE_SANDBOX_SETTINGS = deepFreeze({
  sandbox: {
    enabled: true,
    autoAllowBashIfSandboxed: true,
    allowUnsandboxedCommands: false,
    failIfUnavailable: true,
  },
});
const isRecordedObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
export const CLAUDE_SANDBOX_SETTINGS = BRIDGE_GATE_RESULTS.G1 === 'pass' && isRecordedObject(RECORDED_CLAUDE_SANDBOX_SETTINGS) ? RECORDED_CLAUDE_SANDBOX_SETTINGS : null;
/** G1 counts as passed only with an explicitly recorded settings object; otherwise the settings are null. */
export const effectiveClaudeSandboxSettings = policy => policy?.gates?.G1 === 'pass' && isRecordedObject(policy.claudeSandboxSettings) ? policy.claudeSandboxSettings : null;
// Short Claude model aliases of the lib/models Claude catalog (claude-models.json). The runtime cannot import lib/models, so they are fixed here; a test keeps both in sync.
export const CATALOG_MODEL_ALIASES = Object.freeze(['fable', 'opus', 'sonnet', 'haiku']);
export const CODEX_DELEGATION_CALL_NAMES = Object.freeze(['spawn_agent', 'wait_agent']);
export const DESKTOP_CHECKLIST_PASSED = Object.freeze({'claude-desktop': false, 'codex-desktop': false});
export const ROLE_TIMEOUT_MINUTES = Object.freeze({arc_scouter: 20, arc_planner: 20, arc_implementer: 60, arc_qa: 30, arc_reviewer: 20});
export const HEARTBEAT_MS = 5000;
export const SUPERVISOR_LOST_MS = 30000;
export const OBSERVE_MAX_WAIT_MS = 540000;
export const BRIEF_MAX_BYTES = 262144;
export const EVENTS_MAX_BYTES = 4194304;
export const CANCEL_GRACE_MS = 10000;
export const LOCK_RETRY_MS = 2000;
export const LEASE_RETENTION_MS = 2592000000;
export const PROBE_TIMEOUT_MS = 10000;

export const DEFAULT_POLICY = Object.freeze({
  gates: BRIDGE_GATE_RESULTS,
  claudeSandboxSettings: CLAUDE_SANDBOX_SETTINGS,
  codexDelegationCallNames: CODEX_DELEGATION_CALL_NAMES,
  desktopChecklist: DESKTOP_CHECKLIST_PASSED,
  roleTimeoutMinutes: ROLE_TIMEOUT_MINUTES,
  heartbeatMs: HEARTBEAT_MS,
  supervisorLostMs: SUPERVISOR_LOST_MS,
  observeMaxWaitMs: OBSERVE_MAX_WAIT_MS,
  briefMaxBytes: BRIEF_MAX_BYTES,
  eventsMaxBytes: EVENTS_MAX_BYTES,
  cancelGraceMs: CANCEL_GRACE_MS,
  lockRetryMs: LOCK_RETRY_MS,
  leaseRetentionMs: LEASE_RETENTION_MS,
  probeTimeoutMs: PROBE_TIMEOUT_MS
});

export const RELEASE_CONDITIONS = Object.freeze({
  activation_unverified: 'Verify the active configuration, all prepared markers, installed bytes, host limits and the shared lock, and inspect the lease records in <anchor home>/arc-role-dispatch for unreadable or corrupted files.',
  resume_unverified: 'Update ARC after verifying platform session resume against the recorded session UUID.',
  capability_not_verified: 'Update ARC to a release that verifies this platform capability.',
  'Not Available': 'Install the target platform CLI so that it is found on PATH.',
  Unauthorized: 'Authenticate the target platform CLI.',
  Incomplete: 'Make the target platform CLI authentication status check complete successfully.',
  environment_unverified: 'Desktop hosts are held in this release. If this session is not running inside a Desktop app (for example a terminal or IDE terminal session), declare codex-cli or claude-cli instead; otherwise use a CLI host or a later ARC update that changes the support status.',
  host_sandbox_blocked: 'Allow the host to write the anchor home and keep a detached supervisor alive, with explicit user approval.',
  capacity_exhausted: 'Finish or release active bridge executions, or raise the host limits.',
  permission_scope_unverified: 'Update ARC and verify enforcement of the role permissions and approved scope before starting.',
  native_profile_reload_unverified: 'Verify that the host session loaded the requested profile revision.',
  revision_changed: 'Re-run routing-status and prepare a new dispatch under the current revision.',
  duplicate_dispatch: 'Use a new requestId, or finish the existing dispatch for the same workflow, task and role.',
  invalid_request: 'Provide a valid request with exactly the documented keys.',
  permission_scope_mismatch: 'Inspect the recorded permission mismatch before dependent work.',
  model_effort_mismatch: 'Inspect the observed model and effort against the requested values.',
  auth_rejected: 'Authenticate the target platform CLI.',
  model_rejected: 'Choose a model the target platform accepts.',
  effort_rejected: 'Choose an effort the target platform accepts.',
  permission_violation_observed: 'Reconcile the observed changes before dependent work.',
  delegation_observed: 'Reconcile the observed delegation before dependent work.',
  invalid_output: 'Inspect the dispatch record; the CLI produced no usable result.',
  execution_failed: 'Inspect the dispatch record for the abnormal exit.',
  timeout: 'Inspect the dispatch record and decide whether to resume or start a new dispatch.',
  execution_identity_unverified: 'Verify the assignment-to-execution identity before observing or resuming.',
  terminal_state_unverified: 'Inspect the supervisor and child process state; the slot stays occupied.',
  model_effort_unverified: 'Provide a trusted observer for the requested model and effort.'
});
export const reason = code => {
  if (!Object.hasOwn(RELEASE_CONDITIONS, code)) throw Error(`Unknown reason code: ${code}`);
  return {code, releaseCondition: RELEASE_CONDITIONS[code]};
};
export const profileName = (platform, role, options) => runtimeRegistryOf(options).getPlatform(platform).profile.routingName(role);
export const revisionTag = revision => `[arc-routing rev ${revision}]`;

export function capabilityReasons({hostPlatform, targetPlatform, route, runtimePlatforms}) {
  const registry = runtimeRegistryOf({runtimePlatforms});
  const host = registry.getPlatform(hostPlatform), target = registry.getPlatform(targetPlatform);
  return host?.capabilities.compositeHost.state === 'verified'
    && target?.capabilities.compositeRole.state === 'verified'
    && (route !== 'bridge' || target?.capabilities.bridge.state === 'verified') ? [] : ['capability_not_verified'];
}

export function hostGateReasons({hostPlatform, policy = DEFAULT_POLICY}) {
  if (!Object.hasOwn(HOST_SANDBOX_GATES, hostPlatform)) return [];
  const gates = policy.gates ?? BRIDGE_GATE_RESULTS;
  return HOST_GATE_ALLOWED.includes(gates[HOST_SANDBOX_GATES[hostPlatform]]) ? [] : ['host_sandbox_blocked'];
}

export function bridgeGateReasons({platform, role, hostPlatform, policy = DEFAULT_POLICY}) {
  const gates = policy.gates ?? BRIDGE_GATE_RESULTS, codes = [];
  if (platform === 'claude' && (role === 'arc_implementer' || role === 'arc_qa') && effectiveClaudeSandboxSettings({gates, claudeSandboxSettings: policy.claudeSandboxSettings}) === null) codes.push('permission_scope_unverified');
  if (platform === 'gemini' && (role === 'arc_implementer' || role === 'arc_qa') && gates.GG1 !== 'pass') codes.push('permission_scope_unverified');
  if (platform === 'grok' && (role === 'arc_implementer' || role === 'arc_qa') && gates.GK1 !== 'pass') codes.push('permission_scope_unverified');
  codes.push(...hostGateReasons({hostPlatform, policy}));
  if (platform === 'codex' && gates.G4 === 'fail') codes.push('permission_scope_unverified');
  if (hostPlatform === 'codex' && gates.G2 === 'fail') codes.push('host_sandbox_blocked');
  return [...new Set(codes)];
}
export function environmentReasons(executionEnvironment, policy = DEFAULT_POLICY) {
  const checklist = policy.desktopChecklist ?? DESKTOP_CHECKLIST_PASSED;
  return typeof executionEnvironment === 'string' && executionEnvironment.endsWith('-desktop') && checklist[executionEnvironment] !== true ? ['environment_unverified'] : [];
}
/** route is 'native' or 'bridge'; requested optionally carries the requested model and effort for the claims. */
export function initialClaims(route, policy = DEFAULT_POLICY, requested = {}) {
  void policy;
  const attested = source => ({level: 'operator-attested', source});
  if (route === 'native') return {
    identity: attested('orchestrator'),
    model: {...attested('orchestrator'), requested: requested.model ?? null},
    effort: {...attested('orchestrator'), requested: requested.effort ?? null},
    permissions: {...attested('prompt-contract'), details: 'Role permissions are a prompt contract, not enforced by ARC.'},
    terminal: attested('orchestrator')
  };
  const unverified = {level: 'unverified', source: 'none'};
  return {
    identity: {...unverified}, model: {...unverified, requested: requested.model ?? null}, effort: {...unverified, requested: requested.effort ?? null},
    permissions: {...unverified, details: null}, terminal: {...unverified}
  };
}
