import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoutingFixture} from './role-fixtures.mjs';
import {DEFAULT_POLICY} from '../../lib/runtime/role-dispatch-policy.mjs';
import {createLease} from '../../lib/runtime/role-dispatch-store.mjs';
import {recordRoleObservation} from '../../lib/runtime/role-bridge.mjs';

const policy = {...DEFAULT_POLICY, probeTimeoutMs: 10000, lockRetryMs: 30000};
const observed = {source: 'fixture'};
const claims = Object.fromEntries(['identity', 'model', 'effort', 'permissions', 'terminal'].map(key => [key, {level: 'runtime-observed', ...observed}]));

for (const [environment, expected] of [['claude-cli', 'verified'], ['claude-desktop', 'unverified']]) {
  test(`completed bridge lease with five runtime-observed claims reports supportStatus ${expected} in ${environment}`, async t => {
    const f = await createRoutingFixture(t, {roles: {arc_planner: 'codex'}, hostPlatform: 'claude'});
    // The lease is written directly; supportStatus is derived from the lease alone.
    const now = '2026-11-10T00:00:00.000Z';
    await createLease(f.userHome + '/.codex', {version: 1, dispatchId: 'sup-1', workflowId: 'wf-1', taskId: 't1', requestId: 'r1', role: 'arc_planner', route: 'bridge', hostPlatform: 'claude', executionEnvironment: environment, revision: f.revision, profileHash: null, argsDigest: null, state: 'completed', supervisor: null, child: null, sessionId: 's', timeoutMinutes: 20, claims, reasons: [], allowedPaths: [], resultPath: null, segment: 0, nativeAgentId: null, createdAt: now, updatedAt: now});
    const result = await recordRoleObservation({context: f.context({executionEnvironment: environment}), dispatchId: 'sup-1', waitMs: 0, policy});
    assert.equal(result.routeStatus, 'completed', JSON.stringify(result));
    assert.equal(result.supportStatus, expected);
  });
}

for (const [environment, unverifiedClaim, expected] of [
  ['codex-cli', null, 'verified'],
  ...['identity', 'model', 'effort', 'permissions', 'terminal'].map(key => ['codex-cli', key, 'unverified']),
  ['codex-desktop', null, 'unverified']
]) {
  test(`Codex-host Claude bridge reports ${expected} in ${environment} with ${unverifiedClaim ?? 'no'} unverified claim`, async t => {
    const f = await createRoutingFixture(t, {roles: {arc_planner: 'claude'}, hostPlatform: 'codex'});
    const leaseClaims = unverifiedClaim ? {...claims, [unverifiedClaim]: {level: 'unverified', source: 'none'}} : claims;
    const now = '2026-11-10T00:00:00.000Z';
    await createLease(f.codexHome, {version: 1, dispatchId: 'sup-codex', workflowId: 'wf-1', taskId: 't1', requestId: 'r1', role: 'arc_planner', route: 'bridge', hostPlatform: 'codex', executionEnvironment: environment, revision: f.revision, profileHash: null, argsDigest: null, state: 'completed', supervisor: null, child: null, sessionId: 's', timeoutMinutes: 20, claims: leaseClaims, reasons: [], allowedPaths: [], resultPath: null, segment: 0, nativeAgentId: null, createdAt: now, updatedAt: now});
    const result = await recordRoleObservation({context: f.context({executionEnvironment: environment}), dispatchId: 'sup-codex', waitMs: 0, policy});
    assert.equal(result.routeStatus, 'completed', JSON.stringify(result));
    assert.equal(result.requested.platform, 'claude');
    assert.equal(result.supportStatus, expected);
  });
}
