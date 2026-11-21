import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import * as argsApi from '../../lib/runtime/role-bridge-args.mjs';
import * as observeApi from '../../lib/runtime/role-observe.mjs';
import * as supervisorApi from '../../lib/runtime/role-supervisor.mjs';
import {DEFAULT_POLICY, BRIDGE_GATE_RESULTS, bridgeGateReasons} from '../../lib/runtime/role-dispatch-policy.mjs';
import {DEFAULT_PLATFORM_REGISTRY, createPlatformRegistry} from '../../lib/runtime/platform-registry.mjs';
import {COOPERATIVE_RUNTIME_MODULES, cooperativeVersions} from '../../lib/runtime/bootstrap.mjs';
import {ROUTING_ROLES} from '../../lib/runtime/role-routing-config.mjs';
import {prepareRoleDispatch} from '../../lib/runtime/role-routing.mjs';
import {runBridgeDispatch, resumeRoleDispatch, recordRoleObservation} from '../../lib/runtime/role-bridge.mjs';
import {readLease, requestCancel} from '../../lib/runtime/role-dispatch-store.mjs';
import {render, renameForRouting} from '../../lib/platforms/formats/gemini-markdown.mjs';

const SESSION = '11111111-1111-4111-8111-111111111111';
const digest = bytes => 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex');
const codes = result => result.reasons.map(item => item.code);
const registry = createPlatformRegistry(DEFAULT_PLATFORM_REGISTRY.platforms.map(p => p.id === 'gemini' ? {...p, capabilities: Object.fromEntries(Object.keys(p.capabilities).map(key => [key, {state: 'verified'}]))} : p));
const policy = {...DEFAULT_POLICY, heartbeatMs: 30, cancelGraceMs: 60, probeTimeoutMs: 1000};
const source = role => `---\nname: arc-${role.slice(4)}\ndescription: Role instructions\nmodel: gemini-test\n---\nPrivate role instructions\n`;
const forbidden = ['--allowed-tools', '--yolo', 'yolo', '--skip-trust', '--raw-output'];

for (const role of ROUTING_ROLES) test(`Gemini arguments enforce permissions and omit unsafe flags for ${role}`, () => {
  assert.equal(typeof argsApi.buildGeminiArgs, 'function');
  const args = argsApi.buildGeminiArgs({role, model: 'gemini-test', sessionId: SESSION, policyFile: '/policy/role.toml'});
  const writing = ['arc_implementer', 'arc_qa'].includes(role);
  assert.deepEqual(args.slice(0, 9), ['-p', 'Follow the role instructions and task on stdin.', '-m', 'gemini-test', '-o', 'stream-json', '--session-id', SESSION, '--approval-mode']);
  assert.equal(args[9], writing ? 'auto_edit' : 'plan');
  assert.equal(args[args.indexOf('--policy') + 1], '/policy/role.toml');
  assert.equal(args.includes('--sandbox'), writing);
  assert.equal(forbidden.some(flag => args.includes(flag)), false);
  assert.deepEqual(args.slice(-4), ['-e', 'none', '--allowed-mcp-server-names', '__arc_none__']);
  assert.equal(args.includes('--resume'), false);
  const resumed = argsApi.buildGeminiArgs({role, model: 'gemini-test', sessionId: SESSION, policyFile: '/policy/role.toml', resume: true});
  assert.equal(resumed[resumed.indexOf('--resume') + 1], SESSION);
  assert.equal(forbidden.some(flag => resumed.includes(flag)), false);
});

test('Gemini arguments reject unsafe model and prompt inputs', () => {
  for (const model of ['yolo', '--yolo', '--skip-trust', 'gemini test']) assert.throws(() => argsApi.buildGeminiArgs({role: 'arc_scouter', model, sessionId: SESSION, policyFile: '/policy/role.toml'}));
  assert.throws(() => argsApi.buildGeminiArgs({role: 'arc_scouter', model: 'gemini-test', sessionId: SESSION, policyFile: '/policy/role.toml', promptFlag: 'yolo'}));
});

test('runtime Gemini parser round trips installer render and rejects missing required fields', () => {
  for (const role of ROUTING_ROLES) for (const eol of ['\n', '\r\n']) {
    const bytes = render(source(role).replaceAll('\n', eol), role, {model: 'gemini-test', effort: 'default'});
    const parsed = argsApi.parseCompositeProfile('gemini', bytes);
    assert.equal(parsed.name, `arc-${role.slice(4)}`);
    assert.equal(parsed.model, 'gemini-test'); assert.equal(parsed.effort, 'default');
    assert.equal(parsed.instructions, 'Private role instructions\n');
    assert.equal(argsApi.parseCompositeProfile('gemini', renameForRouting(bytes, role, 't12')).name, `arc-routing-${role.slice(4)}`);
    for (const key of ['name', 'description', 'model']) assert.throws(() => argsApi.parseCompositeProfile('gemini', bytes.toString().replace(new RegExp(`^${key}:.*\\r?\\n`, 'm'), '')));
  }
  assert.throws(() => argsApi.parseCompositeProfile('gemini', source('arc_scouter').replace('model: gemini-test', 'model: gemini-test\neffort: high')));
});

test('GG1 and GG2 hold writing roles and Gemini hosts', () => {
  assert.equal(BRIDGE_GATE_RESULTS.GG1, 'fail'); assert.equal(BRIDGE_GATE_RESULTS.GG2, 'fail');
  for (const role of ['arc_implementer', 'arc_qa']) assert.deepEqual(bridgeGateReasons({platform: 'gemini', hostPlatform: 'claude', role}), ['permission_scope_unverified']);
  assert.deepEqual(bridgeGateReasons({platform: 'codex', hostPlatform: 'gemini', role: 'arc_scouter'}), ['host_sandbox_blocked']);
  assert.deepEqual(bridgeGateReasons({platform: 'gemini', hostPlatform: 'claude', role: 'arc_scouter'}), []);
});

test('unknown Gemini events retain the complete raw event', () => {
  assert.equal(typeof observeApi.normalizeGeminiStreamEvent, 'function');
  const raw = {type: 'future_event', payload: {untouched: 'raw event'}};
  const normalized = observeApi.normalizeGeminiStreamEvent(raw);
  assert.equal(normalized.kind, 'unknown'); assert.deepEqual(observeApi.eventRecord(normalized).raw, raw);
});


test('Gemini result status determines terminal errors without legacy result fields', () => {
  for (const status of ['success', 'error', 'cancelled', undefined]) {
    const normalized = observeApi.normalizeGeminiStreamEvent({type: 'result', status, stats: {models: {'gemini-test': {}}}});
    assert.equal(normalized.kind, 'result');
    assert.equal(normalized.isError, status !== 'success');
    assert.equal(normalized.resultText, undefined);
  }
});

// Real markers, profile hashes, leases and worktree snapshots; only the child CLI is fake.
async function fixture(t, extraEnv = {}) {
  const base = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'arc-gemini-'));
  t.after(async () => {
    const {fixturePidFile, reapFixtureProcesses} = await import('./role-fixtures.mjs');
    await reapFixtureProcesses(base);
    await fs.rm(fixturePidFile(base), {force: true});
    spawnSync('chmod', ['-R', 'u+rwx', base]);
    await fs.rm(base, {recursive: true, force: true});
  });
  const cwd = path.join(base, 'repo'), userHome = path.join(base, 'home'), bin = path.join(base, 'bin');
  const homes = Object.fromEntries(registry.platformIds().map(id => [id, path.join(userHome, '.' + id)]));
  for (const dir of [cwd, bin, ...Object.values(homes)]) await fs.mkdir(dir, {recursive: true});
  for (const args of [['init', '-q'], ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture']]) {
    const result = spawnSync('git', args, {cwd, encoding: 'utf8'}); assert.equal(result.status, 0, result.stderr);
  }
  await fs.copyFile(new URL('./fixtures/gemini/fake-gemini.mjs', import.meta.url), path.join(bin, 'gemini'));
  await fs.chmod(path.join(bin, 'gemini'), 0o755);
  const config = {version: 2, revision: 't12', platforms: ['claude', 'gemini'], roles: Object.fromEntries(ROUTING_ROLES.map(role => [role, {platform: 'gemini', model: 'gemini-test', effort: 'default'}]))};
  const bytes = Buffer.from(JSON.stringify(config)), activePath = path.join(homes.claude, 'arc-role-platform-routing.json'), versions = await cooperativeVersions();
  await fs.writeFile(activePath, bytes);
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
      const relative = `agents/arc-routing-${role.slice(4)}.md`, content = renameForRouting(render(source(role), role, {model: 'gemini-test', effort: 'default'}), role, 't12');
      await fs.writeFile(path.join(home, relative), content); profiles[role] = {path: relative, hash: digest(content)};
    }
    await fs.writeFile(path.join(home, 'arc-role-platform-routing.prepared.json'), JSON.stringify({version: 1, revision: 't12', platform: id, targetHome: home, activeConfigPath: activePath, configHash: digest(bytes), runtime: {version: versions.runtime, hash: versions.runtimeHash, policyHash: versions.policyHash}, profiles}));
  }
  await fs.writeFile(path.join(homes.claude, 'skills/arc/limits.toml'), 'version = 1\nmax_total_subagents = 100\nmax_concurrent_subagents = 5\n');
  const record = path.join(base, 'child.json');
  const context = {cwd, userHome, hostPlatform: 'claude', executionEnvironment: 'claude-cli', workflowId: 'wf-t12', runtimePlatforms: registry,
    env: {PATH: [bin, path.dirname(process.execPath), '/usr/bin', '/bin'].join(path.delimiter), HOME: userHome, TMPDIR: process.env.TMPDIR, ARC_FAKE_GEMINI_RECORD: record, ARC_FAKE_GEMINI_FIXTURE: new URL('./fixtures/gemini/stream-ok.jsonl', import.meta.url).pathname, ...extraEnv}};
  const prepare = async (role = 'arc_scouter') => prepareRoleDispatch({context, assignment: {role, taskId: crypto.randomUUID(), requestId: crypto.randomUUID(), ...(role === 'arc_implementer' ? {allowedPaths: ['src/']} : {})}, expectedRevision: 't12', policy});
  const starter = async () => ({pid: process.pid, startTime: 'fixture-supervisor'});
  const supervise = (id, extra = {}) => supervisorApi.runSupervisor({codexHome: homes.claude, dispatchId: id, cwd, userHome, env: context.env, runtimePlatforms: registry, policy, ...extra});
  const observe = id => recordRoleObservation({context, dispatchId: id, policy});
  const run = async (id, extra = {}) => {
    const result = await runBridgeDispatch({context, dispatchId: id, brief: 'Private task brief', policy, startSupervisor: starter});
    assert.equal(result.decision, 'allow', JSON.stringify(result.reasons)); await supervise(id, extra); return observe(id);
  };
  return {base, context, homes, config, prepare, run, supervise, observe, starter, record};
}

for (const [scenario, env, want] of [
  ['ok', {}, null], ['ok', {ARC_FAKE_GEMINI_WHOLE_MESSAGE: '1'}, null], ['ok', {ARC_FAKE_GEMINI_MISSING_MODEL: '1'}, null], ['model-mismatch', {}, 'model_effort_mismatch'],
  ['session-mismatch', {}, 'execution_identity_unverified'], ['ok', {ARC_FAKE_GEMINI_MISSING_SESSION: '1'}, 'execution_identity_unverified'],
  ['ok', {ARC_FAKE_GEMINI_EXIT: '1', ARC_FAKE_GEMINI_NO_RESULT: '1'}, 'execution_failed'], ['error', {}, 'execution_failed'], ['empty', {}, 'invalid_output'],
  ['unknown-event', {}, null], ['ok', {ARC_FAKE_GEMINI_WRITE: '1'}, 'permission_violation_observed'],
]) test(`fake Gemini ${scenario} ${JSON.stringify(env)} produces ${want ?? 'completed'}`, async t => {
  const f = await fixture(t, {...env, ARC_FAKE_GEMINI_FIXTURE: new URL(`./fixtures/gemini/stream-${scenario}.jsonl`, import.meta.url).pathname});
  const prepared = await f.prepare(); assert.equal(prepared.decision, 'allow', JSON.stringify(prepared.reasons));
  const reserved = await readLease(f.homes.claude, prepared.dispatchId, {runtimePlatforms: registry});
  assert.match(reserved.sessionId, /^[0-9a-f-]{36}$/);
  const done = await f.run(prepared.dispatchId);
  if (want) {assert.equal(done.decision, 'hold'); assert.ok(codes(done).includes(want), JSON.stringify(done));}
  else {
    assert.equal(done.decision, 'allow', JSON.stringify(done)); assert.equal(done.routeStatus, 'completed');
    assert.deepEqual(done.claims.identity, {level: 'runtime-observed', source: 'gemini-stream-session', observed: reserved.sessionId});
    assert.equal(done.claims.model.level, env.ARC_FAKE_GEMINI_MISSING_MODEL ? 'unverified' : 'runtime-observed');
    assert.deepEqual(done.claims.effort, {level: 'unverified', source: 'none', requested: 'default', observed: null});
    assert.deepEqual(done.claims.permissions, {level: 'runtime-observed', source: 'worktree-snapshot', details: 'git-visible worktree only'});
    assert.equal(await fs.readFile(done.resultPath, 'utf8'), 'L5-TOKEN-4b1d');
  }
  const record = JSON.parse(await fs.readFile(f.record, 'utf8'));
  assert.equal(record.argv[record.argv.indexOf('--session-id') + 1], reserved.sessionId);
  assert.deepEqual(record.argv.slice(-4), ['-e', 'none', '--allowed-mcp-server-names', '__arc_none__']);
  assert.equal(record.argv.includes('--resume'), false);
  if (scenario === 'error') assert.equal(done.routeStatus, 'failed');
  assert.match(record.stdin, /Private role instructions/); assert.match(record.stdin, /Private task brief/);
  assert.equal(forbidden.some(flag => record.argv.includes(flag)), false);
  assert.equal(record.argv.some(arg => arg.includes('Private')), false);
  if (scenario === 'unknown-event') {
    const events = (await fs.readFile(path.join(path.dirname(done.resultPath), 'events.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.deepEqual(events.find(event => event.kind === 'unknown').raw, {type: 'future_event', payload: {untouched: 'raw event'}});
  }
});

test('Gemini writing dispatches are held before a child is spawned', async t => {
  const f = await fixture(t);
  for (const role of ['arc_implementer', 'arc_qa']) {
    const result = await f.prepare(role); assert.equal(result.decision, 'hold'); assert.ok(codes(result).includes('permission_scope_unverified'));
  }
  await assert.rejects(fs.access(f.record), {code: 'ENOENT'});
});

test('Gemini resume off holds without mutation; injected on uses UUID and rejects a different session', async t => {
  const f = await fixture(t), prepared = await f.prepare(); assert.equal(prepared.decision, 'allow');
  await f.run(prepared.dispatchId);
  const before = await readLease(f.homes.claude, prepared.dispatchId, {runtimePlatforms: registry});
  const input = {context: f.context, dispatchId: prepared.dispatchId, brief: 'Resume brief', policy, startSupervisor: f.starter};
  const held = await resumeRoleDispatch(input); assert.equal(held.decision, 'hold'); assert.deepEqual(codes(held), ['resume_unverified']);
  assert.deepEqual(await readLease(f.homes.claude, prepared.dispatchId, {runtimePlatforms: registry}), before);
  const implementations = new Map(supervisorApi.SUPERVISOR_IMPLEMENTATIONS);
  implementations.set('gemini', {...implementations.get('gemini'), resume: 'on'});
  assert.equal((await resumeRoleDispatch({...input, supervisorImplementations: implementations})).decision, 'allow');
  f.context.env.ARC_FAKE_GEMINI_FIXTURE = new URL('./fixtures/gemini/stream-session-mismatch.jsonl', import.meta.url).pathname;
  await f.supervise(prepared.dispatchId, {supervisorImplementations: implementations});
  const done = await f.observe(prepared.dispatchId); assert.equal(done.decision, 'hold'); assert.ok(codes(done).includes('execution_identity_unverified'));
  const record = JSON.parse(await fs.readFile(f.record, 'utf8'));
  assert.equal(record.argv[record.argv.indexOf('--resume') + 1], before.sessionId);
  assert.equal(forbidden.some(flag => record.argv.includes(flag)), false);
});

test('Gemini cancellation uses SIGTERM then SIGKILL and observes cancelled', async t => {
  const f = await fixture(t, {ARC_FAKE_GEMINI_HANG: '1'}), prepared = await f.prepare();
  assert.equal(prepared.decision, 'allow'); const signals = [];
  const done = await f.run(prepared.dispatchId, {
    afterSpawn: () => {setTimeout(() => requestCancel(f.homes.claude, prepared.dispatchId), 150);},
    signalGroup: (pid, signal) => {signals.push(signal); process.kill(pid, signal);},
  });
  assert.equal(done.routeStatus, 'cancelled', JSON.stringify(done));
  assert.deepEqual(signals.slice(0, 2), ['SIGTERM', 'SIGKILL']);
});

test('effort unverified non-blocking matches Claude transcript-not-found path', async t => {
  const f = await fixture(t);
  assert.equal(typeof supervisorApi.SUPERVISOR_IMPLEMENTATIONS?.get('gemini')?.observe, 'function');
  const terminalClaim = {level: 'runtime-observed', source: 'supervisor-exit'};
  const common = {terminalClaim, lease: {sessionId: SESSION}, homes: {claude: f.homes.claude}};
  const claude = await supervisorApi.SUPERVISOR_IMPLEMENTATIONS.get('claude').observe({...common, requested: {effort: 'low'}, state: {init: {sessionId: SESSION}, initEval: {claims: {}}}});
  const gemini = await supervisorApi.SUPERVISOR_IMPLEMENTATIONS.get('gemini').observe({...common, requested: {model: 'gemini-test', effort: 'default'}, invocation: {expected: {model: 'gemini-test'}}, state: {init: {sessionId: SESSION, model: 'gemini-test'}}});
  assert.equal(claude.claims.effort.level, 'unverified'); assert.equal(gemini.claims.effort.level, 'unverified');
  assert.equal(claude.effortMismatch, false); assert.equal(gemini.effortMismatch, false);
  assert.equal(claude.reason ?? null, null); assert.equal(gemini.reason ?? null, null);
});

test('Gemini host native preparation is held by GG2', async t => {
  const f = await fixture(t);
  const result = await prepareRoleDispatch({context: {...f.context, hostPlatform: 'gemini', executionEnvironment: 'gemini-cli'}, assignment: {role: 'arc_scouter', taskId: 'host', requestId: 'host'}, expectedRevision: 't12', policy});
  assert.equal(result.decision, 'hold'); assert.ok(codes(result).includes('host_sandbox_blocked'), JSON.stringify(result));
});

test('Gemini cancellation before any stream identity uses the existing cancelled state', async t => {
  const f = await fixture(t, {ARC_FAKE_GEMINI_HANG: '1', ARC_FAKE_GEMINI_NO_EVENTS: '1'}), prepared = await f.prepare();
  assert.equal(prepared.decision, 'allow');
  const done = await f.run(prepared.dispatchId, {afterSpawn: () => {setTimeout(() => requestCancel(f.homes.claude, prepared.dispatchId), 150);}});
  assert.equal(done.routeStatus, 'cancelled', JSON.stringify(done)); assert.equal(done.decision, 'allow');
});
