import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import * as dispatchPolicy from '../../lib/runtime/role-dispatch-policy.mjs';
import * as routing from '../../lib/runtime/role-routing.mjs';
import {cancelRoleDispatch, leaseTargetPlatform, recordRoleObservation, resumeRoleDispatch, runBridgeDispatch} from '../../lib/runtime/role-bridge.mjs';
import {cancelRequested, listLeases, readLease, requestCancel} from '../../lib/runtime/role-dispatch-store.mjs';
import {buildBridgeInvocation, runSupervisor} from '../../lib/runtime/role-supervisor.mjs';
import {DEFAULT_PLATFORM_REGISTRY, createPlatformRegistry, routingProfileFile} from '../../lib/runtime/platform-registry.mjs';
import {buildRoleRoutingConfig, parseRoleRoutingConfig, ROUTING_ROLES} from '../../lib/runtime/role-routing-config.mjs';
import {cooperativeVersions, COOPERATIVE_RUNTIME_MODULES} from '../../lib/runtime/bootstrap.mjs';
import {createInstallerRegistry, DEFAULT_INSTALLER_REGISTRY, defaultCompositePlatformIds} from '../../lib/platforms/index.mjs';
import {prepareCompositeOperation, prepareOperation} from '../../lib/management/operations.mjs';
import {installFakeCli} from './role-fixtures.mjs';
import {compositeContext, mixedConfig} from './fixtures/install-mode.mjs';
import {createTestRegistries, ZETA_INSTALLER} from './fixtures/platforms/zeta.mjs';
import {writeFakeGrokCli} from './fixtures/platforms/grok-off.mjs';
import {installPsStub} from './fixtures/ps-stub.mjs';

test('defaultCompositePlatformIds still returns claude and codex after Grok promotion', () => {
  assert.deepEqual(defaultCompositePlatformIds(), ['claude', 'codex']);
});

test('defaultCompositePlatformIds requires defaultComposite and a verified compositeHost', () => {
  const runtime = createPlatformRegistry(DEFAULT_PLATFORM_REGISTRY.platforms.map(platform => {
    if (!['claude', 'grok'].includes(platform.id)) return platform;
    const state = platform.id === 'claude' ? 'off' : 'verified';
    return {...platform, capabilities: {...platform.capabilities, compositeHost: {state}}};
  }));
  const registry = createInstallerRegistry({runtime, descriptors: runtime.platforms.map(platform => ({
    ...DEFAULT_INSTALLER_REGISTRY.getPlatform(platform.id), runtime: platform,
  }))});
  assert.deepEqual(defaultCompositePlatformIds(registry), ['codex']);

  const {runtimePlatforms, platforms} = createTestRegistries();
  assert.deepEqual(defaultCompositePlatformIds(platforms), ['claude', 'codex', 'zeta']);
  const withoutZetaDefault = createInstallerRegistry({runtime: runtimePlatforms, descriptors: platforms.byAnchorOrder().map(descriptor =>
    descriptor.runtime.id === 'zeta' ? {...ZETA_INSTALLER, runtime: descriptor.runtime, defaultComposite: undefined} : descriptor,
  )});
  assert.deepEqual(defaultCompositePlatformIds(withoutZetaDefault), ['claude', 'codex']);
});

test('prepareCompositeOperation without platforms uses claude and codex plus role platforms', async t => {
  const context = await compositeContext(t);
  const config = await mixedConfig('host-defaults');
  const prepared = await prepareCompositeOperation(context, {kind: 'install', config});
  assert.deepEqual(prepared.config.platforms, ['claude', 'codex']);
});

test('explicit grok platforms include Grok as host after promotion', async t => {
  const context = await compositeContext(t);
  const config = await mixedConfig('host-explicit-grok');
  writeFakeGrokCli({bin: path.join(context.userHome, 'bin'), marker: path.join(context.userHome, 'grok-version')});
  const prepared = await prepareOperation(context, {kind: 'install', target: 'composite', platforms: ['claude', 'codex', 'grok'], config});
  assert.deepEqual(prepared.config.platforms, ['claude', 'codex', 'grok']);
  assert.equal(prepared.files.anchor, 'claude');
});

const {BRIDGE_GATE_RESULTS, DEFAULT_POLICY, bridgeGateReasons} = dispatchPolicy;
const {prepareRoleDispatch, routingStatus} = routing;
const approval = {...DEFAULT_POLICY, probeTimeoutMs: 10000, lockRetryMs: 300, gates: {...BRIDGE_GATE_RESULTS, GK2: 'approval', GG2: 'approval'}};
const hostGates = {grok: 'GK2', gemini: 'GG2'};
const hosts = Object.keys(hostGates);
const blockedValues = ['fail', undefined, 'escalation', 'wide', ''];
const blocked = ['host_sandbox_blocked'];
const codes = result => result.reasons.map(reason => reason.code);
const digest = bytes => 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex');
const starter = async () => ({pid: process.pid, startTime: 'fixture-supervisor'});
const rootSkip = process.getuid?.() === 0 ? 'root can write to chmod 0500 directories' : false;

function policyWithGate(host, value) {
  const gates = {...approval.gates}, gate = hostGates[host];
  if (value === undefined) delete gates[gate];
  else gates[gate] = value;
  return {...approval, gates};
}

const readOnly = dir => fs.chmod(dir, 0o500);

async function assertNoProbe(home) {
  assert.deepEqual((await fs.readdir(home)).filter(name => name.startsWith('.arc-host-probe-')), []);
}

const assertNoLock = anchor => assert.rejects(fs.access(path.join(anchor, 'arc-role-platform-routing.lock')), {code: 'ENOENT'});
const assertAllowed = result => assert.equal(result.decision, 'allow', JSON.stringify(result.reasons));

function profileBytes(platform, role, descriptor, {model, effort}) {
  const name = descriptor.profile.routingName(role);
  if (platform === 'codex') return `name = "${name}"\ndescription = "Role instructions"\nmodel = "${model}"\nmodel_reasoning_effort = "${effort}"\ndeveloper_instructions = """Private role instructions"""\n`;
  const options = platform === 'claude' ? `effort: ${effort}\ntools:\n  - Read\n` : '';
  return `---\nname: ${name}\ndescription: Role instructions\nmodel: ${model}\n${options}---\nPrivate role instructions\n`;
}

// Keep the anchor writable when exercising a read-only Claude target.
async function hostFixture(t, {host, anchor = 'claude', policy = approval, rolePlatforms = {}}) {
  installPsStub();
  const base = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'arc-host-'));
  const cwd = path.join(base, 'repo'), userHome = path.join(base, 'home'), bin = path.join(base, 'bin');
  const runtimePlatforms = createPlatformRegistry(DEFAULT_PLATFORM_REGISTRY.platforms.map(platform => ({
    ...platform,
    anchorOrder: anchor === 'codex' && platform.anchorOrder < 2 ? 1 - platform.anchorOrder : platform.anchorOrder,
    capabilities: {...platform.capabilities, compositeHost: {state: 'verified'}},
  })));
  const homes = Object.fromEntries(runtimePlatforms.platformIds().map(id => [id, path.join(userHome, '.' + id)]));
  t.after(async () => {
    for (const home of Object.values(homes)) await fs.chmod(home, 0o700);
    await fs.rm(base, {recursive: true, force: true});
  });
  for (const dir of [cwd, bin, ...Object.values(homes)]) await fs.mkdir(dir, {recursive: true, mode: 0o700});
  const env = {PATH: [bin, path.dirname(process.execPath), '/usr/bin', '/bin'].join(path.delimiter), HOME: userHome, GIT_CONFIG_NOSYSTEM: '1'};
  for (const args of [['init', '-q'], ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture']]) {
    const result = spawnSync('git', args, {cwd, env, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr ?? result.error?.message);
  }
  const anchorHome = homes[anchor], revision = 'host-test', workflowId = 'wf-host';
  const context = {cwd, userHome, env, runtimePlatforms, hostPlatform: host, executionEnvironment: host + '-cli', workflowId};
  const values = {claude: {model: 'haiku', effort: 'low'}, codex: {model: 'gpt-6-luna', effort: 'low'}, grok: {model: 'grok-test', effort: 'default'}, gemini: {model: 'gemini-test', effort: 'default'}};
  const roles = Object.fromEntries(ROUTING_ROLES.map(role => {
    const platform = rolePlatforms[role] ?? (role === 'arc_scouter' ? 'claude' : role === 'arc_reviewer' ? 'codex' : host);
    return [role, {platform, ...values[platform]}];
  }));
  const config = buildRoleRoutingConfig({revision, roles}, {runtimePlatforms});
  const activePath = path.join(anchorHome, 'arc-role-platform-routing.json'), bytes = Buffer.from(JSON.stringify(config));
  await fs.writeFile(activePath, bytes);
  const versions = await cooperativeVersions();
  for (const id of config.platforms) {
    const home = homes[id], runtime = path.join(home, 'skills/arc/runtime');
    await fs.mkdir(runtime, {recursive: true});
    for (const module of COOPERATIVE_RUNTIME_MODULES) {
      const target = path.join(runtime, module);
      await fs.mkdir(path.dirname(target), {recursive: true});
      await fs.copyFile(new URL('../../lib/runtime/' + module, import.meta.url), target);
    }
    await fs.copyFile(new URL('../../lib/policy/role-policy.json', import.meta.url), path.join(runtime, 'role-policy.json'));
    await fs.mkdir(path.join(home, 'agents'));
    const profiles = {};
    for (const role of ROUTING_ROLES.filter(role => roles[role].platform === id)) {
      const descriptor = runtimePlatforms.getPlatform(id);
      const relative = 'agents/' + routingProfileFile(descriptor, role);
      const content = profileBytes(id, role, descriptor, roles[role]);
      await fs.writeFile(path.join(home, relative), content);
      profiles[role] = {path: relative, hash: digest(content)};
    }
    const marker = {version: 1, revision, platform: id, targetHome: home, activeConfigPath: activePath, configHash: digest(bytes),
      runtime: {version: versions.runtime, hash: versions.runtimeHash, policyHash: versions.policyHash}, profiles};
    await fs.writeFile(path.join(home, 'arc-role-platform-routing.prepared.json'), JSON.stringify(marker));
  }
  await fs.writeFile(path.join(homes[host], 'skills/arc/limits.toml'), 'version = 1\nmax_total_subagents = 100\nmax_concurrent_subagents = 5\n');
  for (const id of hosts) {
    const target = path.join(bin, id);
    await fs.copyFile(new URL(`./fixtures/${id}/fake-${id}.mjs`, import.meta.url), target);
    await fs.chmod(target, 0o755);
    env[`ARC_FAKE_${id.toUpperCase()}_RECORD`] = path.join(base, id + '-child.json');
  }
  env.ARC_FAKE_GEMINI_FIXTURE = new URL('./fixtures/gemini/stream-ok.jsonl', import.meta.url).pathname;
  const thread = '01a1c596-43f9-77a0-b0bb-000000000001', session = 'host-fixture-session';
  const claude = await installFakeCli(t, bin, 'claude', {
    version: '2.1.322 (Claude Code)',
    events: [{type: 'system', subtype: 'init', session_id: session, tools: ['Read'], model: 'claude-haiku-5-5', permissionMode: 'default'},
      {type: 'result', subtype: 'success', is_error: false, session_id: session, result: 'Claude result'}],
    writes: [{path: path.join(homes.claude, 'projects/proj', session + '.jsonl'), content: JSON.stringify({type: 'assistant', output_config: {effort: 'low'}}) + '\n'}],
  });
  const codex = await installFakeCli(t, bin, 'codex', {
    version: 'codex-cli 0.167.0',
    events: [{type: 'thread.started', thread_id: thread}, {type: 'turn.completed'}],
    outputFile: 'Codex result',
    writes: [{path: path.join(homes.codex, 'sessions/2026/11/19', `rollout-2026-11-19T00-00-00-${thread}.jsonl`), content: [
      {type: 'session_meta', payload: {id: thread}},
      {type: 'turn_context', payload: {model: values.codex.model, effort: 'low', approval_policy: 'never', sandbox_policy: {type: 'read-only'}}},
    ].map(value => JSON.stringify(value)).join('\n') + '\n'}],
  });
  for (const cli of [claude, codex]) env[cli.envName] = cli.scenarioPath;
  const prepare = (role, selectedPolicy = policy, assignmentOptions = {}) => prepareRoleDispatch({context, policy: selectedPolicy, expectedRevision: revision,
    assignment: {role, taskId: crypto.randomUUID(), requestId: crypto.randomUUID(), ...assignmentOptions}});
  const input = (dispatchId, extra) => ({context, dispatchId, policy, ...extra});
  const run = (id, extra) => runBridgeDispatch(input(id, {brief: 'Run brief', startSupervisor: starter, ...extra}));
  const resume = (id, extra) => resumeRoleDispatch(input(id, {brief: 'Resume brief', startSupervisor: starter, ...extra}));
  const observe = (id, extra) => recordRoleObservation(input(id, extra));
  const cancel = id => cancelRoleDispatch(input(id));
  const supervise = (dispatchId, selectedPolicy = policy) => runSupervisor({codexHome: anchorHome, dispatchId, cwd, userHome, env, runtimePlatforms, policy: selectedPolicy});
  const read = id => readLease(anchorHome, id, {runtimePlatforms});
  const artifacts = id => path.join(cwd, '.git/arc/workflows', workflowId, 'dispatches', id);
  return {anchorHome, homes, cwd, context, config, prepare, run, resume, observe, cancel, supervise, read, artifacts,
    childRecords: [claude.recordPath, codex.recordPath, env.ARC_FAKE_GROK_RECORD, env.ARC_FAKE_GEMINI_RECORD]};
}

async function completeBridge(f, role) {
  const prepared = await f.prepare(role);
  assertAllowed(prepared);
  assert.equal(prepared.route, 'bridge');
  const id = prepared.dispatchId;
  const started = await f.run(id);
  assertAllowed(started);
  assert.equal(started.routeStatus, 'starting');
  await f.supervise(id);
  const observed = await f.observe(id, {waitMs: 1000});
  assert.equal(observed.routeStatus, 'completed', JSON.stringify(observed.reasons));
  return id;
}

test('HOST_SANDBOX_GATES and HOST_GATE_ALLOWED are frozen with the spec values', () => {
  assert.deepEqual(dispatchPolicy.HOST_SANDBOX_GATES, hostGates);
  assert.deepEqual(dispatchPolicy.HOST_GATE_ALLOWED, ['pass', 'approval']);
  assert.ok(Object.isFrozen(dispatchPolicy.HOST_SANDBOX_GATES));
  assert.ok(Object.isFrozen(dispatchPolicy.HOST_GATE_ALLOWED));
});

test('BRIDGE_GATE_RESULTS records GK1 pass, GK2 approval and GG1/GG2 fail', () => {
  assert.equal(BRIDGE_GATE_RESULTS.GK1, 'pass');
  assert.equal(BRIDGE_GATE_RESULTS.GK2, 'approval');
  for (const gate of ['GG1', 'GG2']) assert.equal(BRIDGE_GATE_RESULTS[gate], 'fail', gate);
});

test('hostGateReasons allows pass and approval for grok and gemini hosts', () => {
  for (const hostPlatform of hosts) for (const value of ['pass', 'approval']) {
    assert.deepEqual(dispatchPolicy.hostGateReasons({hostPlatform, policy: policyWithGate(hostPlatform, value)}), []);
  }
});

test('hostGateReasons blocks fail, missing, escalation, wide and empty gate values', () => {
  for (const hostPlatform of hosts) for (const value of blockedValues) {
    assert.deepEqual(dispatchPolicy.hostGateReasons({hostPlatform, policy: policyWithGate(hostPlatform, value)}), blocked);
  }
  for (const [hostPlatform, expected] of [['grok', []], ['gemini', blocked]]) {
    assert.deepEqual(dispatchPolicy.hostGateReasons({hostPlatform}), expected);
    assert.deepEqual(dispatchPolicy.hostGateReasons({hostPlatform, policy: {...approval, gates: null}}), expected);
  }
});

test('hostGateReasons ignores claude and codex hosts for any gate value', () => {
  for (const hostPlatform of ['claude', 'codex']) for (const value of [...blockedValues, 'pass', 'approval']) {
    assert.deepEqual(dispatchPolicy.hostGateReasons({hostPlatform, policy: policyWithGate('grok', value)}), []);
  }
});

test('bridgeGateReasons host part matches prepare for every host gate input', async t => {
  for (const hostPlatform of hosts) await t.test(hostPlatform, async t => {
    const f = await hostFixture(t, {host: hostPlatform});
    for (const value of ['pass', 'approval', ...blockedValues]) {
      const policy = policyWithGate(hostPlatform, value), label = String(value);
      const prepared = await f.prepare('arc_planner', policy);
      assert.equal(prepared.route, 'native', label);
      const want = !['pass', 'approval'].includes(value);
      assert.equal(bridgeGateReasons({platform: 'claude', role: 'arc_scouter', hostPlatform, policy}).includes(blocked[0]), want, label);
      assert.equal(codes(prepared).includes(blocked[0]), want, label);
      assert.equal(dispatchPolicy.hostGateReasons({hostPlatform, policy}).length > 0, want, label);
    }
  });
});

test('missing host gate key is fail-closed in prepare without DEFAULT fallback', async t => {
  const f = await hostFixture(t, {host: 'grok'});
  const result = await f.prepare('arc_planner', policyWithGate('grok', undefined));
  assert.equal(result.decision, 'hold');
  assert.deepEqual(codes(result), blocked);
  const fallback = await f.prepare('arc_planner', {...DEFAULT_POLICY, probeTimeoutMs: 10000});
  assertAllowed(fallback);
  assert.equal((await f.cancel(fallback.dispatchId)).decision, 'allow');
});

test('default policy holds Gemini QA under GG1 and Grok Implementer under the Gemini host gate', async t => {
  for (const {host, target, role, assignment} of [
    {host: 'grok', target: 'gemini', role: 'arc_tester'},
    {host: 'gemini', target: 'grok', role: 'arc_implementer', assignment: {allowedPaths: ['src/']}},
  ]) {
    const policy = {...DEFAULT_POLICY, probeTimeoutMs: 10000};
    const f = await hostFixture(t, {host, policy, rolePlatforms: {[role]: target}});
    const result = await f.prepare(role, policy, assignment);
    assert.equal(result.route, 'bridge');
    assert.equal(result.requested.platform, target);
    assert.equal(result.decision, 'hold');
    const reasons = codes(result);
    if (host === 'grok') {
      assert.ok(reasons.includes('permission_scope_unverified'), JSON.stringify(result.reasons));
    } else {
      assert.ok(reasons.includes('host_sandbox_blocked'), JSON.stringify(result.reasons));
      assert.ok(!reasons.includes('permission_scope_unverified'), JSON.stringify(result.reasons));
    }
    assert.equal(result.dispatchId, null);
    assert.deepEqual(await listLeases(f.anchorHome, f.context), []);
  }
});

for (const host of hosts) test(`${host} host with injected approval completes native and bridge lifecycles`, async t => {
  const f = await hostFixture(t, {host});
  assertAllowed(await routingStatus({context: f.context, policy: approval}));
  const native = await f.prepare('arc_planner');
  assertAllowed(native);
  assert.equal(native.route, 'native');
  assert.equal((await f.observe(native.dispatchId, {event: 'started', nativeAgentId: 'agent-1'})).routeStatus, 'running');
  assert.equal((await f.observe(native.dispatchId, {event: 'completed'})).routeStatus, 'completed');
  for (const role of ['arc_scouter', 'arc_reviewer']) {
    const id = await completeBridge(f, role);
    const resumed = await f.resume(id);
    assertAllowed(resumed);
    assert.equal(resumed.segment, 1);
    await f.supervise(id);
    const observed = await f.observe(id, {waitMs: 1000});
    assert.equal(observed.routeStatus, 'completed', JSON.stringify(observed.reasons));
  }
  const separate = await f.prepare('arc_scouter');
  assertAllowed(separate);
  assert.equal((await f.cancel(separate.dispatchId)).routeStatus, 'cancelled');
});

test('injected fail gates hold every grok and gemini host step without leases or children', async t => {
  for (const host of hosts) await t.test(host, async t => {
    const f = await hostFixture(t, {host});
    const policy = policyWithGate(host, 'fail');
    for (const role of ['arc_planner', 'arc_scouter', 'arc_reviewer']) {
      const prepared = await f.prepare(role, policy);
      assert.equal(prepared.decision, 'hold');
      assert.deepEqual(codes(prepared), blocked);
    }
    for (const [role, targetPlatform] of [['arc_scouter', 'claude'], ['arc_reviewer', 'codex']]) {
      await assert.rejects(buildBridgeInvocation({lease: {version: 2, hostPlatform: host, role, targetPlatform},
        config: f.config, homes: f.homes, worktree: f.cwd, resultPath: path.join(f.cwd, 'result.md'), policy}), {reasonCode: blocked[0]});
    }
    assert.deepEqual(await listLeases(f.anchorHome), []);
    for (const record of f.childRecords) await assert.rejects(fs.access(record), {code: 'ENOENT'});
  });
});

test('Grok host supervisor fails the lease without spawning a child when GK2 changes to fail', async t => {
  const f = await hostFixture(t, {host: 'grok', policy: approval});
  const prepared = await f.prepare('arc_scouter');
  assertAllowed(prepared);
  assert.equal(prepared.route, 'bridge');
  const id = prepared.dispatchId;
  const startSupervisor = t.mock.fn(starter);
  const started = await f.run(id, {startSupervisor});
  assertAllowed(started);
  assert.equal(started.routeStatus, 'starting');
  assert.equal(startSupervisor.mock.callCount(), 1);

  await f.supervise(id, policyWithGate('grok', 'fail'));
  const lease = await f.read(id);
  assert.equal(lease.state, 'failed');
  assert.ok(codes(lease).includes('host_sandbox_blocked'), JSON.stringify(lease.reasons));
  for (const record of f.childRecords) await assert.rejects(fs.access(record), {code: 'ENOENT'});
});

async function tempHome(t) {
  const base = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'arc-host-probe-test-'));
  t.after(async () => {
    await fs.chmod(base, 0o700);
    await fs.rm(base, {recursive: true, force: true});
  });
  return base;
}

test('probeHomeWritable creates and removes a probe file in a writable home', async t => {
  const home = await tempHome(t);
  assert.deepEqual(await routing.probeHomeWritable(home), {ok: true});
  await assertNoProbe(home);
});

test('probeHomeWritable maps a read-only home to host_sandbox_blocked', {skip: rootSkip}, async t => {
  const home = await tempHome(t);
  await readOnly(home);
  assert.deepEqual(await routing.probeHomeWritable(home), {ok: false, code: blocked[0]});
  await assertNoProbe(home);
});

test('probeHomeWritable maps a missing home to activation_unverified', async t => {
  const home = await tempHome(t);
  assert.deepEqual(await routing.probeHomeWritable(path.join(home, 'missing')), {ok: false, code: 'activation_unverified'});
});

test('probeHomeWritable reports residualPaths when unlink fails', async t => {
  const home = await tempHome(t);
  const unlink = async () => { throw Object.assign(Error('fixture denied unlink'), {code: 'EPERM'}); };
  const result = await routing.probeHomeWritable(home, {unlink});
  assert.equal(result.ok, false);
  assert.equal(result.code, blocked[0]);
  assert.equal(result.residualPaths.length, 1);
  const [probe] = result.residualPaths;
  assert.equal(path.dirname(probe), home);
  assert.match(path.basename(probe), /^\.arc-host-probe-/);
  assert.equal((await fs.stat(probe)).mode & 0o777, 0o600);
  await fs.unlink(probe);
});

for (const host of hosts) {
  const options = {host, anchor: 'codex', policy: policyWithGate(host, 'pass')};
  test(`${host} host bridge prepare holds host_sandbox_blocked on a read-only target home`, {skip: rootSkip}, async t => {
    const f = await hostFixture(t, options);
    await readOnly(f.homes.claude);
    const result = await f.prepare('arc_scouter');
    assert.equal(result.decision, 'hold');
    assert.deepEqual(codes(result), blocked);
    assert.deepEqual(await listLeases(f.anchorHome), []);
    await assertNoProbe(f.homes.claude);
    await assertNoLock(f.anchorHome);
  });

  test(`${host} host run-dispatch holds without starting the supervisor on a read-only target home`, {skip: rootSkip}, async t => {
    const f = await hostFixture(t, options);
    const prepared = await f.prepare('arc_scouter');
    assertAllowed(prepared);
    const id = prepared.dispatchId, before = await f.read(id);
    await readOnly(f.homes.claude);
    const startSupervisor = t.mock.fn(starter);
    const result = await f.run(id, {startSupervisor});
    assert.equal(result.decision, 'hold');
    assert.deepEqual(codes(result), blocked);
    assert.equal(startSupervisor.mock.callCount(), 0);
    assert.equal(before.state, 'reserved');
    assert.deepEqual(await f.read(id), before);
    assert.equal(await fs.readFile(path.join(f.artifacts(id), 'brief.md'), 'utf8'), 'Run brief');
    await assertNoProbe(f.homes.claude);
    await assertNoLock(f.anchorHome);
  });

  test(`${host} host resume holds without starting the supervisor on a read-only target home`, {skip: rootSkip}, async t => {
    const f = await hostFixture(t, options);
    const id = await completeBridge(f, 'arc_scouter'), before = await f.read(id);
    await readOnly(f.homes.claude);
    const startSupervisor = t.mock.fn(starter);
    const result = await f.resume(id, {startSupervisor});
    assert.equal(result.decision, 'hold');
    assert.deepEqual(codes(result), blocked);
    assert.equal(startSupervisor.mock.callCount(), 0);
    assert.equal(before.state, 'completed');
    assert.deepEqual(await f.read(id), before);
    await assertNoProbe(f.homes.claude);
    await assertNoLock(f.anchorHome);
  });

  test(`${host} host resume keeps an existing cancel marker when the target home probe fails`, {skip: rootSkip}, async t => {
    const f = await hostFixture(t, options);
    const id = await completeBridge(f, 'arc_scouter');
    await requestCancel(f.anchorHome, id);
    assert.equal(await cancelRequested(f.anchorHome, id), true);
    const before = await f.read(id);
    assert.equal(before.state, 'completed');
    await readOnly(f.homes.claude);

    const startSupervisor = t.mock.fn(starter);
    const result = await f.resume(id, {startSupervisor});
    assert.equal(result.decision, 'hold');
    assert.deepEqual(codes(result), blocked);
    assert.equal(startSupervisor.mock.callCount(), 0);
    assert.deepEqual(await f.read(id), before);
    assert.equal(await cancelRequested(f.anchorHome, id), true, 'resume removed the cancel marker');
  });

  test(`${host} host bridge prepare, run-dispatch and resume map a missing target home to activation_unverified`, async t => {
    const f = await hostFixture(t, options);
    const targetHome = f.homes.claude;
    const movedHome = targetHome + '-moved';
    const open = fs.open;
    const role = 'arc_scouter';
    const commands = [
      ['prepare', null, () => f.prepare(role)],
      ['run-dispatch', async () => {
        const prepared = await f.prepare(role);
        assertAllowed(prepared);
        return prepared.dispatchId;
      }, f.run],
      ['resume', () => completeBridge(f, role), f.resume],
    ];
    for (const [command, arrange, dispatch] of commands) {
      await t.test(command, async t => {
        const id = arrange ? await arrange() : null;
        const before = id ? await f.read(id) : null;
        const startSupervisor = t.mock.fn(starter);
        let moved = false;
        t.mock.method(fs, 'open', async (filename, ...args) => {
          if (!moved && path.dirname(filename) === targetHome && path.basename(filename).startsWith('.arc-host-probe-')) {
            await fs.rename(targetHome, movedHome);
            moved = true;
          }
          return open(filename, ...args);
        });

        try {
          const result = await dispatch(id, {startSupervisor});
          assert.equal(result.decision, 'hold');
          assert.deepEqual(codes(result), ['activation_unverified']);
          assert.equal(moved, true, 'command did not reach the target home probe');
          if (id) {
            assert.equal(startSupervisor.mock.callCount(), 0);
            assert.deepEqual(await f.read(id), before);
          } else {
            assert.deepEqual(await listLeases(f.anchorHome), []);
          }
        } finally {
          if (moved) await fs.rename(movedHome, targetHome);
        }
      });
    }
  });
}

test('Grok host bridge prepare, run-dispatch and resume report a probe file that cannot be removed', async t => {
  const role = 'arc_scouter';
  const unlink = fs.unlink;
  const commands = [
    ['prepare', null, f => f.prepare(role)],
    ['run-dispatch', async f => {
      const prepared = await f.prepare(role);
      assertAllowed(prepared);
      return prepared.dispatchId;
    }, (f, id, startSupervisor) => f.run(id, {startSupervisor})],
    ['resume', async f => {
      const id = await completeBridge(f, role);
      await requestCancel(f.anchorHome, id);
      assert.equal(await cancelRequested(f.anchorHome, id), true);
      return id;
    }, (f, id, startSupervisor) => f.resume(id, {startSupervisor})],
  ];
  for (const [command, arrange, dispatch] of commands) {
    await t.test(command, async t => {
      const f = await hostFixture(t, {host: 'grok', anchor: 'codex'});
      const targetHome = f.homes.claude;
      const id = arrange ? await arrange(f) : null;
      const before = id ? await f.read(id) : null;
      const startSupervisor = t.mock.fn(starter);
      t.mock.method(fs, 'unlink', async (filename, ...args) => {
        if (path.dirname(filename) === targetHome && path.basename(filename).startsWith('.arc-host-probe-')) {
          throw Object.assign(Error('fixture denied unlink'), {code: 'EPERM'});
        }
        return unlink(filename, ...args);
      });

      const result = await dispatch(f, id, startSupervisor);
      assert.equal(result.decision, 'hold');
      assert.deepEqual(codes(result), blocked);
      assert.equal(result.residualPaths.length, 1);
      const [probe] = result.residualPaths;
      assert.equal(path.dirname(probe), targetHome);
      assert.match(path.basename(probe), /^\.arc-host-probe-/);
      assert.equal((await fs.stat(probe)).isFile(), true);
      if (id) {
        assert.equal(startSupervisor.mock.callCount(), 0);
        assert.deepEqual(await f.read(id), before);
      } else {
        assert.deepEqual(await listLeases(f.anchorHome), []);
      }
      if (command === 'resume') assert.equal(await cancelRequested(f.anchorHome, id), true);
    });
  }
});

test('codex and claude host bridges do not probe the target home', {skip: rootSkip}, async t => {
  for (const [host, target, role] of [['codex', 'claude', 'arc_scouter'], ['claude', 'codex', 'arc_reviewer']]) {
    await t.test(host, async t => {
      const f = await hostFixture(t, {host, anchor: host}), policy = {...approval, gates: {...approval.gates, G2: 'pass'}};
      await readOnly(f.homes[target]);
      const prepared = await f.prepare(role, policy);
      assertAllowed(prepared);
      const startSupervisor = t.mock.fn(starter);
      const started = await f.run(prepared.dispatchId, {policy, startSupervisor});
      assertAllowed(started);
      assert.equal(started.routeStatus, 'starting');
      assert.equal(startSupervisor.mock.callCount(), 1);
      await assertNoProbe(f.homes[target]);
      await assertNoLock(f.anchorHome);
    });
  }
});

test('read-only anchor home blocks grok and gemini host commands without lock or lease', {skip: rootSkip}, async t => {
  for (const host of hosts) await t.test(host, async t => {
    const f = await hostFixture(t, {host});
    await readOnly(f.anchorHome);
    const startSupervisor = t.mock.fn(starter);
    for (const command of [
      () => routingStatus({context: f.context, policy: approval}), () => f.prepare('arc_scouter'),
      () => f.run('no-lease', {startSupervisor}), () => f.cancel('no-lease'),
    ]) {
      const result = await command();
      assert.equal(result.decision, 'hold');
      assert.deepEqual(codes(result), blocked);
    }
    assert.equal(startSupervisor.mock.callCount(), 0);
    assert.deepEqual(await listLeases(f.anchorHome), []);
    await assertNoLock(f.anchorHome);
  });
});

test('v1 leases reject grok and gemini hosts', () => {
  for (const hostPlatform of hosts) assert.throws(() => leaseTargetPlatform({version: 1, hostPlatform, route: 'bridge'}), /Invalid composite profile/);
});

test('v1 configs reject grok platforms', () => {
  const roles = Object.fromEntries(ROUTING_ROLES.map(role => [role, {platform: 'claude', model: 'haiku', effort: 'low'}]));
  const config = {version: 1, revision: 'host-test', platforms: ['claude', 'codex', 'grok'], roles};
  assert.throws(() => parseRoleRoutingConfig(JSON.stringify(config)), /Invalid role routing platforms/);
});

test('v1Platforms stay codex and claude', async () => {
  for (const module of ['role-bridge.mjs', 'role-routing-config.mjs']) {
    const bytes = await fs.readFile(new URL('../../lib/runtime/' + module, import.meta.url), 'utf8');
    assert.ok(bytes.includes("v1Platforms = Object.freeze(['codex', 'claude'])"), module);
  }
});
