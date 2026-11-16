import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import * as management from '../../lib/management/operations.mjs';
import {DEFAULT_INSTALLER_REGISTRY} from '../../lib/platforms/index.mjs';
import {DEFAULT_PLATFORM_REGISTRY, createPlatformRegistry} from '../../lib/runtime/platform-registry.mjs';
import {buildRoleRoutingConfig, parseRoleRoutingConfig, serializeRoleRoutingConfig} from '../../lib/runtime/role-routing-config.mjs';
import {parseInstalledRoutingConfig, publishCompositeFiles} from '../../lib/installer/role-routing.mjs';
import {prepareRoleDispatch, routingStatus} from '../../lib/runtime/role-routing.mjs';
import {runBridgeDispatch, recordRoleObservation, resumeRoleDispatch, cancelRoleDispatch} from '../../lib/runtime/role-bridge.mjs';
import {createLease, readLease, writeLease, listLeases} from '../../lib/runtime/role-dispatch-store.mjs';
import {DEFAULT_POLICY} from '../../lib/runtime/role-dispatch-policy.mjs';
import {createRoutingFixture} from './role-fixtures.mjs';
import {mixedConfig} from './fixtures/install-mode.mjs';
import {staticPackageFixture} from './fixtures/static-references.mjs';
import {legacyComposite, legacyState, activePath, markerPath, homeBytes, legacyLease} from './fixtures/legacy-composite.mjs';

const policy = {...DEFAULT_POLICY, probeTimeoutMs: 10000, lockRetryMs: 0};
const historical = () => createPlatformRegistry(DEFAULT_PLATFORM_REGISTRY.platforms.map(descriptor => ({
  ...descriptor, anchorOrder: descriptor.id === 'codex' ? 0 : 1,
})));
const operationalLegacy = async t => Object.assign(await legacyComposite(t, {operational: true}), {
  platforms: DEFAULT_INSTALLER_REGISTRY, runtimePlatforms: DEFAULT_PLATFORM_REGISTRY, packageRoot: staticPackageFixture(t),
});
const prepare = async context => management.prepareOperation(context, {kind: 'install', target: 'composite',
  platforms: ['claude', 'codex'], config: await mixedConfig('flip-v2')});

test('AC-A5 publish after migration is v2 and lock order claude then codex', async t => {
  const context = await operationalLegacy(t), prepared = await prepare(context), locks = [], open = fsp.open;
  assert.equal(prepared.files.anchor, 'claude');
  t.mock.method(fsp, 'open', async (filename, flags, ...args) => {
    const handle = await open(filename, flags, ...args);
    if (flags === 'wx' && path.basename(String(filename)) === 'arc-role-platform-routing.lock') locks.push(path.basename(path.dirname(filename)).slice(1));
    return handle;
  });
  const result = await management.executeOperation(context, prepared);
  assert.equal(result.code, 0, result.error?.stack);
  assert.equal(JSON.parse(fs.readFileSync(activePath(context, 'claude'))).version, 2);
  assert.deepEqual(locks, ['claude', 'codex']);
  assert.equal(fs.existsSync(activePath(context, 'codex')), false);
});

test('AC-L2 claude-anchored composite prepare/run/observe/resume/cancel match Phase A', async t => {
  async function exercise(runtimePlatforms) {
    const f = await createRoutingFixture(t, {roles: {arc_planner: 'codex'}, runtimePlatforms});
    for (const id of ['claude', 'codex']) await f.cli(id);
    const home = path.dirname(f.activePath), context = f.context(), results = [], ids = [];
    const prepareOne = async (role, requestId) => {
      const result = await prepareRoleDispatch({context, assignment: {role, taskId: requestId, requestId}, expectedRevision: f.revision, policy});
      assert.equal(result.decision, 'allow', JSON.stringify(result.reasons));
      ids.push(result.dispatchId); results.push(result); return result.dispatchId;
    };
    const native = await prepareOne('arc_scouter', 'native');
    results.push(await recordRoleObservation({context, dispatchId: native, event: 'started', nativeAgentId: 'native-agent', policy}));
    results.push(await recordRoleObservation({context, dispatchId: native, event: 'completed', policy}));
    const bridge = await prepareOne('arc_planner', 'bridge'), starts = [];
    // Exercise the real run/resume transitions without starting a detached process.
    const startSupervisor = async args => { starts.push(args.codexHome); return {pid: process.pid, startTime: 'fixture'}; };
    results.push(await runBridgeDispatch({context, dispatchId: bridge, brief: 'first', policy, startSupervisor}));
    let lease = await readLease(home, bridge, {runtimePlatforms});
    assert.equal(lease.state, 'starting');
    await writeLease(home, {...lease, state: 'completed', supervisor: null, sessionId: 'session-1'}, {runtimePlatforms});
    results.push(await recordRoleObservation({context, dispatchId: bridge, waitMs: 0, policy}));
    results.push(await resumeRoleDispatch({context, dispatchId: bridge, brief: 'next', policy, startSupervisor}));
    lease = await readLease(home, bridge, {runtimePlatforms});
    assert.equal(lease.segment, 1);
    await writeLease(home, {...lease, state: 'completed', supervisor: null}, {runtimePlatforms});
    const cancelled = await prepareOne('arc_reviewer', 'cancel');
    results.push(await cancelRoleDispatch({context, dispatchId: cancelled, policy}));
    assert.deepEqual(starts, [home, home]);
    assert.deepEqual((await listLeases(home, {runtimePlatforms})).map(item => item.state).sort(), ['cancelled', 'completed', 'completed']);
    assert.equal(fs.existsSync(path.join(home === f.claudeHome ? f.codexHome : f.claudeHome, 'arc-role-dispatch')), false);
    const normalize = value => JSON.parse(JSON.stringify(value, (key, item) => typeof item === 'string'
      ? ids.reduce((text, id, index) => text.replaceAll(id, `dispatch-${index}`), item.replaceAll(f.base, '<base>')) : item));
    return {home, f, results: normalize(results)};
  }
  const before = await exercise(historical()), after = await exercise(DEFAULT_PLATFORM_REGISTRY);
  assert.equal(before.home, before.f.codexHome);
  assert.equal(after.home, after.f.claudeHome);
  assert.deepEqual(after.results, before.results);
});

test('AC-A2 operational legacy migration', async t => {
  const context = await operationalLegacy(t), raw = JSON.parse(fs.readFileSync(activePath(context, 'codex')));
  assert.deepEqual(legacyState(context), {mode: 'composite', platforms: ['claude', 'codex'], anchor: 'codex',
    homes: {claude: 'composite', codex: 'composite'}, config: {...raw, version: 2, platforms: ['claude', 'codex']}, residualPaths: [], legacyAnchor: true});
  const before = homeBytes(context.userHome), runtimeContext = {...context, hostPlatform: 'claude', executionEnvironment: 'claude-cli', workflowId: 'legacy'};
  assert.deepEqual((await routingStatus({context: runtimeContext, policy})).reasons.map(reason => reason.code), ['activation_unverified']);
  assert.deepEqual(homeBytes(context.userHome), before);
  await createLease(path.dirname(activePath(context, 'codex')), legacyLease('history', 'completed'), context);
  const history = homeBytes(path.join(path.dirname(activePath(context, 'codex')), 'arc-role-dispatch'));
  const oldStore = path.join(path.dirname(activePath(context, 'codex')), 'arc-role-dispatch');
  const metadata = () => Object.keys(homeBytes(oldStore)).map(relative => {
    const {ino, mode, mtimeNs, ctimeNs} = fs.lstatSync(path.join(oldStore, relative), {bigint: true});
    return [relative, ino, mode, mtimeNs, ctimeNs];
  });
  const oldMetadata = metadata();
  const prepared = await prepare(context);
  assert.deepEqual(prepared.anchorMove, {from: 'codex', to: 'claude'});
  const result = await management.executeOperation(context, prepared);
  assert.equal(result.code, 0);
  assert.ok(result.messages.includes(`Dispatch history stays in ${oldStore}.`));
  assert.equal(JSON.parse(fs.readFileSync(activePath(context, 'claude'))).version, 2);
  for (const id of ['claude', 'codex']) assert.equal(JSON.parse(fs.readFileSync(markerPath(context, id))).activeConfigPath, activePath(context, 'claude'));
  assert.equal(fs.existsSync(activePath(context, 'codex')), false);
  assert.deepEqual(homeBytes(path.join(path.dirname(activePath(context, 'codex')), 'arc-role-dispatch')), history);
  assert.deepEqual(metadata(), oldMetadata);
  assert.equal('legacyAnchor' in legacyState(context), false);
  assert.equal('anchorMove' in await prepare(context), false);
});

test('symlinked claude home ancestor is rejected after flip without file changes', async t => {
  const context = await operationalLegacy(t), prepared = await prepare(context);
  assert.equal(prepared.files.anchor, 'claude');
  const real = context.userHome + '-real';
  t.after(() => fs.rmSync(real, {recursive: true, force: true}));
  fs.renameSync(context.userHome, real); fs.symlinkSync(real, context.userHome);
  const before = homeBytes(real), link = fs.readlinkSync(context.userHome);
  await assert.rejects(publishCompositeFiles({context, prepared: prepared.files}), {message: `Expected destination directory: ${context.userHome}`});
  assert.deepEqual(homeBytes(real), before); assert.equal(fs.readlinkSync(context.userHome), link);
  fs.unlinkSync(context.userHome); fs.renameSync(real, context.userHome);
  assert.equal((await management.executeOperation(context, await prepare(context))).code, 0);
});

for (const platforms of [undefined, ['codex', 'claude']]) test(`installed historical v1 ${platforms ? 'explicit' : 'implicit'} platforms serialize to runtime-compatible v2`, async () => {
  const {roles} = await mixedConfig('installed-round-trip');
  const input = {version: 1, revision: 'installed-round-trip', ...(platforms ? {platforms} : {}), roles};
  const installed = parseInstalledRoutingConfig(JSON.stringify(input));
  const bytes = serializeRoleRoutingConfig(installed);
  const expected = {version: 2, revision: input.revision, platforms: ['claude', 'codex'], roles};
  assert.deepEqual(installed, expected);
  assert.deepEqual(JSON.parse(bytes), expected);
  assert.deepEqual(parseRoleRoutingConfig(bytes), expected);
});

test('serializer always emits v2 for the pair and runtime keeps strict v1 read compatibility', async () => {
  const {roles} = await mixedConfig('serialization'), old = {version: 1, revision: 'serialization', roles};
  const runtimePlatforms = historical();
  for (const platforms of [undefined, ['codex', 'claude']]) {
    const input = {...old, ...(platforms ? {platforms} : {})};
    const parsed = parseRoleRoutingConfig(JSON.stringify(input), {runtimePlatforms});
    assert.deepEqual(JSON.parse(serializeRoleRoutingConfig(parsed)), {...old, version: 2, platforms: ['codex', 'claude']});
    assert.throws(() => parseRoleRoutingConfig(JSON.stringify(input)));
    assert.deepEqual(parseInstalledRoutingConfig(JSON.stringify(input)).platforms, ['claude', 'codex']);
  }
  assert.throws(() => parseRoleRoutingConfig(JSON.stringify({...old, platforms: ['claude', 'codex']})));
  assert.throws(() => parseInstalledRoutingConfig(JSON.stringify({...old, platforms: ['claude', 'codex']})));
  const config = buildRoleRoutingConfig({revision: old.revision, platforms: ['codex', 'claude'], roles});
  assert.equal(config.version, 2);
  assert.deepEqual(JSON.parse(serializeRoleRoutingConfig(config)), {...old, version: 2, platforms: ['claude', 'codex']});
});
