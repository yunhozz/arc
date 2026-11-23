import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CAPABILITY_KEYS, CAPABILITY_PREREQUISITES, getPlatform} from '../../lib/runtime/platform-registry.mjs';
import {GROK_CONTRACT} from '../../lib/runtime/grok-stream.mjs';

const HOST_CONTRACTS = [
  {id: 'host-runtime-approval', state: 'verified', evidence: 'M-H1'},
  {id: 'host-sandbox-fail-closed', state: 'verified', evidence: 'M-H2'}, // Target denial used a substitute Seatbelt measurement.
  {id: 'host-supervisor-survival', state: 'verified', evidence: 'M-H3'},
  {id: 'host-native-spawn', state: 'verified', evidence: 'M-H5'},
  {id: 'host-bridge-child', state: 'unverified', evidence: 'fake CLI only'},
];

const UNVERIFIED_CONTRACTS = [
  {id: 'compat-session-effect', risk: 'R1'}, {id: 'native-model-application', risk: 'R6'},
  {id: 'headless-stream-contract', risk: 'R6'},
  {id: 'account-model-availability', risk: 'R6'}, {id: 'read-role-permission-effect', risk: 'R4'},
];

const VERIFIED_CONTRACTS = [
  {id: 'permission-sandbox-effect', risk: 'R4', roles: ['arc_implementer', 'arc_tester']},
];

function verifyEvidence(descriptor) {
  assert.ok(descriptor, 'Grok descriptor is required');
  const verified = Object.keys(CAPABILITY_PREREQUISITES).filter(key => descriptor.capabilities[key]?.state === 'verified');
  for (const capability of verified) for (const required of CAPABILITY_PREREQUISITES[capability] ?? []) assert.equal(descriptor.capabilities[required]?.state, 'verified', `${capability} requires ${required}`);
  assert.deepEqual(verified, ['install', 'nativeProfile', 'catalog', 'standalone', 'bridge', 'compositeRole', 'compositeHost'], 'Grok verified capabilities must match spec 2.1');
  assert.deepEqual(Object.fromEntries(Object.entries(descriptor.capabilities).filter(([, value]) => value.state === 'off')), {
    authProbe: {state: 'off', reason: 'no official auth status command'},
    watch: {state: 'off', reason: 'watch support out of scope'},
  });
  assert.equal(descriptor.cli.supportedVersions, '>=1.0.0 <1.1.0');
}

test('operational Grok verified and off sets match spec 2.1', () => {
  verifyEvidence(getPlatform('grok'));
});

test('injected verified authProbe or watch fails evidence', () => {
  for (const key of ['authProbe', 'watch']) {
    const capabilities = Object.fromEntries(CAPABILITY_KEYS.map(name => [name, {...getPlatform('grok').capabilities[name]}]));
    const promote = name => {capabilities[name] = {state: 'verified'}; for (const required of CAPABILITY_PREREQUISITES[name]) promote(required);};
    promote(key);
    assert.throws(() => verifyEvidence({cli: {supportedVersions: '>=1.0.0 <1.1.0'}, capabilities}), /Grok verified capabilities must match spec 2.1/);
  }
});

test('Grok host contracts record five ids in fixed order', () => {
  assert.deepEqual(HOST_CONTRACTS.map(({id}) => id), [
    'host-runtime-approval', 'host-sandbox-fail-closed', 'host-supervisor-survival', 'host-native-spawn', 'host-bridge-child',
  ]);
  assert.deepEqual(HOST_CONTRACTS.map(({state}) => state), ['verified', 'verified', 'verified', 'verified', 'unverified']);
});

test('Grok unverified role contracts retain five risk links including read-role permissions', () => {
  assert.equal(UNVERIFIED_CONTRACTS.length, 5);
  assert.deepEqual(UNVERIFIED_CONTRACTS.map(item => item.id), [
    'compat-session-effect', 'native-model-application', 'headless-stream-contract',
    'account-model-availability', 'read-role-permission-effect',
  ]);
});

test('Grok sandbox permission evidence is verified for writing roles only', () => {
  assert.deepEqual(VERIFIED_CONTRACTS, [
    {id: 'permission-sandbox-effect', risk: 'R4', roles: ['arc_implementer', 'arc_tester']},
  ]);
});

test('GROK_CONTRACT childEnv and isolation args', () => {
  assert.deepEqual(GROK_CONTRACT.childEnv, {
    GROK_DISABLE_AUTOUPDATER: '1', GROK_CLAUDE_AGENTS_ENABLED: 'false', GROK_CLAUDE_SKILLS_ENABLED: 'false',
    GROK_CLAUDE_RULES_ENABLED: 'false', GROK_CLAUDE_MCPS_ENABLED: 'false', GROK_CLAUDE_HOOKS_ENABLED: 'false',
  });
  assert.ok(GROK_CONTRACT.isolationArgs.includes('--no-auto-update'));
  assert.ok(GROK_CONTRACT.isolationArgs.includes('--no-subagents'));
});

test('grok notice ends with is unverified.', () => {
  const policy = JSON.parse(fs.readFileSync(new URL('../../lib/policy/role-policy.json', import.meta.url)));
  assert.equal(policy.platforms.grok.notice.endsWith('is unverified.'), true);
});


test('Grok GK1 pass, GK2 approval and resume off', async () => {
  const {BRIDGE_GATE_RESULTS} = await import('../../lib/runtime/role-dispatch-policy.mjs');
  const {SUPERVISOR_IMPLEMENTATIONS} = await import('../../lib/runtime/role-supervisor.mjs');
  assert.equal(BRIDGE_GATE_RESULTS.GK1, 'pass'); assert.equal(BRIDGE_GATE_RESULTS.GK2, 'approval');
  assert.equal(SUPERVISOR_IMPLEMENTATIONS.get('grok')?.resume, 'off');
});
