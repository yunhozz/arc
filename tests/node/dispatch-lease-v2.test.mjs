import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {COOPERATIVE_RUNTIME_MODULES, cooperativeVersions} from '../../lib/runtime/bootstrap.mjs';
import {createPlatformRegistry} from '../../lib/runtime/platform-registry.mjs';
import {ROUTING_ROLES} from '../../lib/runtime/role-routing-config.mjs';
import {prepareRoleDispatch} from '../../lib/runtime/role-routing.mjs';
import {leaseTargetPlatform, recordRoleObservation, runBridgeDispatch} from '../../lib/runtime/role-bridge.mjs';
import {createLease, dispatchDirectory, listLeases, readLease, validateLease} from '../../lib/runtime/role-dispatch-store.mjs';
import {DEFAULT_POLICY, RELEASE_CONDITIONS} from '../../lib/runtime/role-dispatch-policy.mjs';
import {buildBridgeInvocation} from '../../lib/runtime/role-supervisor.mjs';
import {createTestRuntimeRegistry} from './fixtures/platforms/zeta.mjs';
import {installFakeCli} from './role-fixtures.mjs';

const registry = createTestRuntimeRegistry();
const policy = {...DEFAULT_POLICY, lockRetryMs: 0};
const codes = result => result.reasons.map(entry => entry.code);
const digest = bytes => 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex');
const lease = (extra = {}) => ({
  version: 1, dispatchId: 'lease-1', workflowId: 'wf-lease', taskId: 'T5', requestId: 'request-1', role: 'arc_scouter', route: 'bridge', hostPlatform: 'codex', executionEnvironment: 'codex-cli',
  revision: 'lease-rev', profileHash: null, argsDigest: null, state: 'reserved', supervisor: null, child: null, sessionId: null, timeoutMinutes: 20,
  claims: null, reasons: [], allowedPaths: [], resultPath: null, segment: 0, nativeAgentId: null, createdAt: '2026-11-16T00:00:00.000Z', updatedAt: '2026-11-16T00:00:00.000Z', ...extra,
});
const offRegistry = (id, capability) => createPlatformRegistry(registry.platforms.map(platform => platform.id === id
  ? {...platform, capabilities: {...platform.capabilities, [capability]: {state: 'off'}}} : platform));

// Real activation markers and installed bytes keep capability failures separate from activation failures.
async function fixture(t) {
  const base = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'arc-lease-v2-'));
  t.after(() => fs.rm(base, {recursive: true, force: true}));
  const userHome = path.join(base, 'home'), cwd = path.join(base, 'repo'), bin = path.join(base, 'bin');
  const homes = Object.fromEntries(registry.platformIds().map(id => [id, path.join(userHome, '.' + id)]));
  for (const dir of [...Object.values(homes), cwd, bin]) await fs.mkdir(dir, {recursive: true});
  await installFakeCli(t, bin, 'claude', {version: '2.1.322'});
  await fs.symlink(process.execPath, path.join(bin, 'zeta'));
  const config = {version: 2, revision: 'lease-rev', platforms: ['claude', 'codex', 'zeta'], roles: Object.fromEntries(ROUTING_ROLES.map(role => [role,
    {platform: role === 'arc_planner' ? 'zeta' : role === 'arc_qa' ? 'codex' : 'claude', model: 'haiku', effort: 'low'}]))};
  const bytes = Buffer.from(JSON.stringify(config)), activePath = path.join(homes.claude, 'arc-role-platform-routing.json');
  await fs.writeFile(activePath, bytes);
  const versions = await cooperativeVersions();
  for (const id of config.platforms) {
    const home = homes[id], runtime = path.join(home, 'skills/arc/runtime');
    await fs.mkdir(runtime, {recursive: true});
    for (const module of COOPERATIVE_RUNTIME_MODULES) {
      await fs.mkdir(path.dirname(path.join(runtime, module)), {recursive: true});
      await fs.copyFile(new URL('../../lib/runtime/' + module, import.meta.url), path.join(runtime, module));
    }
    await fs.copyFile(new URL('../../lib/policy/role-policy.json', import.meta.url), path.join(runtime, 'role-policy.json'));
    await fs.mkdir(path.join(home, 'agents'));
    const profiles = {};
    for (const role of ROUTING_ROLES.filter(role => config.roles[role].platform === id)) {
      const relative = `agents/arc-routing-${role.slice(4)}.${registry.getPlatform(id).profile.ext}`, content = Buffer.from(`${role}\n`);
      await fs.writeFile(path.join(home, relative), content);
      profiles[role] = {path: relative, hash: digest(content)};
    }
    await fs.writeFile(path.join(home, 'arc-role-platform-routing.prepared.json'), JSON.stringify({version: 1, revision: config.revision, platform: id, targetHome: home,
      activeConfigPath: activePath, configHash: digest(bytes), runtime: {version: versions.runtime, hash: versions.runtimeHash, policyHash: versions.policyHash}, profiles}));
  }
  await fs.writeFile(path.join(homes.claude, 'skills/arc/limits.toml'), 'version = 1\nmax_total_subagents = 100\nmax_concurrent_subagents = 5\n');
  const context = {userHome, cwd, env: {PATH: bin, HOME: userHome, CODEX_HOME: homes.codex, ZETA_HOME: homes.zeta}, runtimePlatforms: registry,
    hostPlatform: 'claude', executionEnvironment: 'claude-cli', workflowId: 'wf-lease'};
  const prepare = (role, overrides = {}) => prepareRoleDispatch({context: {...context, ...overrides}, assignment: {role, taskId: 'T5', requestId: role}, expectedRevision: config.revision, policy});
  return {homes, context, config, prepare};
}

for (const [role, route, target] of [['arc_scouter', 'native', 'claude'], ['arc_planner', 'bridge', 'zeta']]) {
  test(`new lease is v2 with targetPlatform for ${route}`, async t => {
    const f = await fixture(t), prepared = await f.prepare(role);
    assert.equal(prepared.decision, 'allow', JSON.stringify(prepared.reasons));
    const saved = await readLease(f.homes.claude, prepared.dispatchId, {runtimePlatforms: registry});
    assert.equal(saved.version, 2);
    assert.equal(saved.route, route);
    assert.equal(saved.targetPlatform, target);
  });
}

test('v1 lease resolves target with 2-platform rule under 3 registered without hold', async t => {
  const f = await fixture(t), old = lease();
  await createLease(f.homes.claude, old, {runtimePlatforms: registry});
  assert.equal(leaseTargetPlatform(old, registry), 'claude');
  assert.equal(leaseTargetPlatform(lease({route: 'native'}), registry), 'codex');
  const observed = await recordRoleObservation({context: {...f.context, hostPlatform: 'codex', executionEnvironment: 'codex-cli'}, dispatchId: old.dispatchId, policy});
  assert.equal(observed.decision, 'allow', JSON.stringify(observed.reasons));
  assert.equal(observed.requested.platform, 'claude');
});

for (const route of ['native', 'bridge']) {
  test(`v1 lease with host outside codex/claude is activation_unverified for ${route}`, async t => {
    const f = await fixture(t), old = lease({route, hostPlatform: 'zeta', executionEnvironment: 'zeta-cli'});
    await createLease(f.homes.claude, old, {runtimePlatforms: registry});
    assert.throws(() => leaseTargetPlatform(old, registry), /unknown platform/);
    const observed = await recordRoleObservation({context: {...f.context, hostPlatform: 'zeta', executionEnvironment: 'zeta-cli'}, dispatchId: old.dispatchId, policy});
    assert.equal(observed.decision, 'hold');
    assert.deepEqual(codes(observed), ['activation_unverified']);
  });
}

test('valid v2 uses explicit registered target and enforces S only with config', () => {
  const value = lease({version: 2, targetPlatform: 'zeta'}), options = {runtimePlatforms: registry};
  assert.deepEqual(validateLease(value, options), value);
  assert.equal(leaseTargetPlatform(value, registry), 'zeta');
  assert.deepEqual(validateLease(value, {...options, config: {roles: {arc_planner: {platform: 'zeta'}, arc_qa: {platform: 'codex'}}}}), value);
});

for (const [name, extra] of [
  ['target outside S', {targetPlatform: 'zeta'}],
  ['unregistered target', {targetPlatform: 'missing'}],
  ['native target differs from host', {route: 'native', targetPlatform: 'claude'}],
  ['bridge target equals host', {targetPlatform: 'codex'}],
  ['extra key', {extra: true}],
  ['missing target', {targetPlatform: undefined}],
  ['missing base key', {segment: undefined}],
]) {
  test(`invalid v2 rejected: ${name}`, () => {
    const value = lease({version: 2, targetPlatform: 'claude', ...extra});
    for (const key of Object.keys(value)) if (value[key] === undefined) delete value[key];
    assert.throws(() => validateLease(value, {runtimePlatforms: registry, config: {roles: {arc_qa: {platform: 'codex'}, arc_scouter: {platform: 'claude'}}}}));
  });
}

test('v1 exact keys reject targetPlatform and unsupported lease versions', () => {
  assert.throws(() => validateLease(lease({targetPlatform: 'claude'}), {runtimePlatforms: registry}));
  assert.throws(() => validateLease(lease({version: 3}), {runtimePlatforms: registry}));
});

test('v2 invocation rejects a target that differs from the active role target', async () => {
  await assert.rejects(buildBridgeInvocation({lease: lease({version: 2, targetPlatform: 'claude'}),
    config: {roles: {arc_scouter: {platform: 'zeta', model: 'haiku', effort: 'low'}}}, homes: {}}), {reasonCode: 'activation_unverified'});
});

for (const [id, capability] of [['zeta', 'compositeRole'], ['claude', 'compositeHost'], ['zeta', 'bridge']]) {
  test(`capability off blocks prepare without lease: ${id}.${capability}`, async t => {
    const f = await fixture(t), result = await f.prepare('arc_planner', {runtimePlatforms: offRegistry(id, capability)});
    assert.equal(result.decision, 'hold');
    assert.deepEqual(codes(result), ['capability_not_verified']);
    assert.equal(result.dispatchId, null);
    assert.deepEqual(await listLeases(f.homes.claude, {runtimePlatforms: registry}), []);
    await assert.rejects(fs.stat(dispatchDirectory(f.homes.claude)), {code: 'ENOENT'});
  });
}

for (const [id, capability] of [['zeta', 'compositeRole'], ['claude', 'compositeHost'], ['zeta', 'bridge']]) {
  test(`run rechecks capability: ${id}.${capability}`, async t => {
    const f = await fixture(t), prepared = await f.prepare('arc_planner');
    assert.equal(prepared.decision, 'allow', JSON.stringify(prepared.reasons));
    const before = await readLease(f.homes.claude, prepared.dispatchId, {runtimePlatforms: registry});
    const result = await runBridgeDispatch({context: {...f.context, runtimePlatforms: offRegistry(id, capability)}, dispatchId: prepared.dispatchId, brief: 'T5', policy});
    assert.equal(result.decision, 'hold');
    assert.deepEqual(codes(result), ['capability_not_verified']);
    assert.deepEqual(await readLease(f.homes.claude, prepared.dispatchId, {runtimePlatforms: registry}), before);
    await assert.rejects(fs.stat(path.join(f.context.cwd, '.git')), {code: 'ENOENT'});
  });
}

test('release conditions describe all markers and the anchor home', () => {
  assert.equal(RELEASE_CONDITIONS.capability_not_verified, 'Update ARC to a release that verifies this platform capability.');
  assert.equal(RELEASE_CONDITIONS.activation_unverified, 'Verify the active configuration, all prepared markers, installed bytes, host limits and the shared lock, and inspect the lease records in <anchor home>/arc-role-dispatch for unreadable or corrupted files.');
  assert.equal(RELEASE_CONDITIONS.host_sandbox_blocked, 'Allow the host to write the anchor home and keep a detached supervisor alive, with explicit user approval.');
});
