import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import * as argsApi from '../../lib/runtime/role-bridge-args.mjs';
import * as observeApi from '../../lib/runtime/role-observe.mjs';
import * as supervisorApi from '../../lib/runtime/role-supervisor.mjs';
import {grokOffRegistries, writeFakeGrokCli} from './fixtures/platforms/grok-off.mjs';
import {GROK_CONTRACT} from '../../lib/runtime/grok-stream.mjs';
import {DEFAULT_POLICY, BRIDGE_GATE_RESULTS, bridgeGateReasons} from '../../lib/runtime/role-dispatch-policy.mjs';
import {DEFAULT_PLATFORM_REGISTRY, createPlatformRegistry} from '../../lib/runtime/platform-registry.mjs';
import {COOPERATIVE_RUNTIME_MODULES, cooperativeVersions} from '../../lib/runtime/bootstrap.mjs';
import {ROUTING_ROLES} from '../../lib/runtime/role-routing-config.mjs';
import {prepareRoleDispatch} from '../../lib/runtime/role-routing.mjs';
import {cancelRoleDispatch, runBridgeDispatch, resumeRoleDispatch, recordRoleObservation} from '../../lib/runtime/role-bridge.mjs';
import {readLease, requestCancel, listLeases} from '../../lib/runtime/role-dispatch-store.mjs';
import {render, renameForRouting} from '../../lib/platforms/formats/grok-markdown.mjs';

const SESSION = '11111111-1111-4111-8111-111111111111';
const digest = bytes => 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex');
const codes = result => result.reasons.map(item => item.code);
const registry = createPlatformRegistry(DEFAULT_PLATFORM_REGISTRY.platforms.map(p => p.id === 'grok' ? {...p, capabilities: Object.fromEntries(Object.keys(p.capabilities).map(key => [key, {state: 'verified'}]))} : p));
const policy = {...DEFAULT_POLICY, heartbeatMs: 30, cancelGraceMs: 60, probeTimeoutMs: 1000};
const failedHostPolicy = {...policy, gates: {...policy.gates, GK2: 'fail'}};
const source = role => `---\nname: arc-${role.slice(4)}\ndescription: Role instructions\nmodel: grok-test\n---\nPrivate role instructions\n`;
const forbidden = ['--always-approve', '--allow', '-c', '--continue', '-r', '--resume', '--prompt-json', '-p', '--single', '--effort', '--reasoning-effort', 'bypassPermissions'];

// Catches widened permissions, reordered flags, unsafe model values and session substitution.
for (const role of ROUTING_ROLES) test(`AC-K5 arguments for ${role}`, () => {
  assert.equal(typeof argsApi.buildGrokArgs, 'function');
  const args = argsApi.buildGrokArgs({role, profile: {model: 'grok-test'}, sessionId: SESSION, promptFile: '/segment/prompt.md'});
  const writing = ['arc_implementer', 'arc_qa'].includes(role);
  assert.deepEqual(args, ['--prompt-file', '/segment/prompt.md', '--output-format', 'streaming-json', '-m', 'grok-test', '--session-id', SESSION,
    '--permission-mode', writing ? 'acceptEdits' : 'plan', '--sandbox', writing ? 'workspace' : 'read-only',
    ...(writing ? [] : ['--deny', 'Bash', '--deny', 'Edit', '--deny', 'Write', '--deny', 'MCPTool']), '--no-auto-update', '--no-subagents']);
  assert.equal(forbidden.some(flag => args.includes(flag)), false);
  assert.notEqual(args[args.indexOf('--sandbox') + 1], 'off');
});
test('AC-K5 rejects relative promptFile, non UUID and -x model', () => {
  const valid = {role: 'arc_scouter', profile: {model: 'grok-test'}, sessionId: SESSION, promptFile: '/segment/prompt.md'};
  for (const extra of [{promptFile: 'prompt.md'}, {sessionId: 'not-uuid'}, {profile: {model: '-x'}}]) assert.throws(() => argsApi.buildGrokArgs({...valid, ...extra}));
});

test('AC-K9 runtime parseGrok round trip and exact fields', () => {
  for (const role of ROUTING_ROLES) for (const eol of ['\n', '\r\n']) {
    const bytes = render(source(role).replaceAll('\n', eol), role, {model: 'grok-test', effort: 'default'});
    const parsed = argsApi.parseCompositeProfile('grok', bytes);
    assert.deepEqual(parsed, {name: `arc-${role.slice(4)}`, description: 'Role instructions', model: 'grok-test', effort: 'default', tools: null, instructions: 'Private role instructions\n'});
    assert.equal(argsApi.parseCompositeProfile('grok', renameForRouting(bytes, role, 't12')).name, `arc-routing-${role.slice(4)}`);
    for (const key of ['name', 'description', 'model']) assert.throws(() => argsApi.parseCompositeProfile('grok', bytes.toString().replace(new RegExp(`^${key}:.*\\r?\\n`, 'm'), '')));
  }
  for (const field of ['effort: default', 'tools: Bash', 'permissionMode: plan', 'extra: value', 'model: duplicate']) assert.throws(() => argsApi.parseCompositeProfile('grok', source('arc_scouter').replace('model: grok-test', `model: grok-test\n${field}`)));
  for (const scalar of ['true', 'null', '123', '2026-11-18', 'a: b', '"quoted"', '[list]', 'x # comment']) assert.throws(() => argsApi.parseCompositeProfile('grok', source('arc_scouter').replace('description: Role instructions', `description: ${scalar}`)));
});

test('normalize preserves data, thought isolation and unknown raw events', async () => {
  const api = await import('../../lib/runtime/grok-stream.mjs').catch(() => ({}));
  assert.equal(typeof api.normalizeGrokStreamEvent, 'function');
  const normalize = api.normalizeGrokStreamEvent;
  assert.deepEqual(normalize({type: 'text', data: 'body', model: 'grok-test'}), {kind: 'text', raw: {type: 'text', data: 'body', model: 'grok-test'}, text: 'body', model: 'grok-test'});
  assert.equal(normalize({type: 'thought', data: 'private'}).text, undefined);
  for (const raw of ['not JSON', {type: 'future', data: {nested: true}}]) assert.deepEqual(normalize(raw), {kind: 'unknown', raw});
  assert.deepEqual(normalize({type: 'end', sessionId: SESSION, stopReason: 'end_turn'}), {kind: 'end', raw: {type: 'end', sessionId: SESSION, stopReason: 'end_turn'}, sessionId: SESSION, stopReason: 'end_turn'});
  assert.equal(Object.isFrozen(api.GROK_CONTRACT), true);
});

// Real markers, profile hashes, leases and worktree snapshots; only the child CLI is fake.
async function fixture(t, extraEnv = {}, hostBridge = false) {
  const base = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'arc-grok-'));
  t.after(() => fs.rm(base, {recursive: true, force: true}));
  const cwd = path.join(base, 'repo'), userHome = path.join(base, 'home'), bin = path.join(base, 'bin');
  const homes = Object.fromEntries(registry.platformIds().map(id => [id, path.join(userHome, '.' + id)]));
  for (const dir of [cwd, bin, ...Object.values(homes)]) await fs.mkdir(dir, {recursive: true});
  for (const args of [['init', '-q'], ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture']]) {
    const result = spawnSync('git', args, {cwd, encoding: 'utf8'}); assert.equal(result.status, 0, result.stderr);
  }
  await fs.copyFile(new URL('./fixtures/grok/fake-grok.mjs', import.meta.url), path.join(bin, 'grok'));
  await fs.chmod(path.join(bin, 'grok'), 0o755);
  const config = {version: 2, revision: 't12', platforms: ['claude', 'grok'], roles: Object.fromEntries(ROUTING_ROLES.map(role => [role, {platform: 'grok', model: 'grok-test', effort: 'default'}]))};
  if (hostBridge) config.roles.arc_scouter = {platform: 'claude', model: 'sonnet', effort: 'high'};
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
      const relative = `agents/arc-routing-${role.slice(4)}.md`, content = id === 'claude' ? Buffer.from(`---\nname: arc-routing-${role.slice(4)}\ndescription: Role instructions [arc-routing rev t12]\nmodel: sonnet\neffort: high\ntools:\n  - Read\n---\nPrivate role instructions\n`) : renameForRouting(render(source(role), role, {model: 'grok-test', effort: 'default'}), role, 't12');
      await fs.writeFile(path.join(home, relative), content); profiles[role] = {path: relative, hash: digest(content)};
    }
    await fs.writeFile(path.join(home, 'arc-role-platform-routing.prepared.json'), JSON.stringify({version: 1, revision: 't12', platform: id, targetHome: home, activeConfigPath: activePath, configHash: digest(bytes), runtime: {version: versions.runtime, hash: versions.runtimeHash, policyHash: versions.policyHash}, profiles}));
  }
  await fs.writeFile(path.join(homes.claude, 'skills/arc/limits.toml'), 'version = 1\nmax_total_subagents = 100\nmax_concurrent_subagents = 5\n');
  const record = path.join(base, 'child.json');
  const context = {cwd, userHome, hostPlatform: 'claude', executionEnvironment: 'claude-cli', workflowId: 'wf-t12', runtimePlatforms: registry,
    env: {PATH: [bin, path.dirname(process.execPath), '/usr/bin', '/bin'].join(path.delimiter), HOME: userHome, TMPDIR: process.env.TMPDIR, ARC_FAKE_GROK_RECORD: record, ...extraEnv}};
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

for (const [scenario, want] of [
  ['ok', null], ['session-mismatch', 'execution_identity_unverified'], ['no-end', 'execution_failed'], ['error-event', 'execution_failed'],
  ['empty-text', 'invalid_output'], ['stop-max-tokens', 'execution_failed'], ['model-mismatch', 'model_effort_mismatch'], ['no-model', null],
  ['unknown-event', null], ['exit-nonzero', 'execution_failed'], ['write', 'permission_violation_observed'],
]) test(`AC-K5 fake Grok ${scenario} produces ${want ?? 'completed'}`, async t => {
  const f = await fixture(t, {ARC_FAKE_GROK_SCENARIO: scenario});
  const prepared = await f.prepare(); assert.equal(prepared.decision, 'allow', JSON.stringify(prepared.reasons));
  const reserved = await readLease(f.homes.claude, prepared.dispatchId, {runtimePlatforms: registry});
  assert.match(reserved.sessionId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  const done = await f.run(prepared.dispatchId);
  if (want) {
    assert.equal(done.decision, 'hold'); assert.ok(codes(done).includes(want), JSON.stringify(done));
    // No end means no observed session identity: execution fails while its slot stays unknown.
    assert.equal(done.routeStatus, ['session-mismatch', 'no-end'].includes(scenario) ? 'unknown' : 'failed');
    if (scenario === 'no-end') assert.ok(codes(done).includes('execution_identity_unverified'));
  } else {
    assert.equal(done.decision, 'allow', JSON.stringify(done)); assert.equal(done.routeStatus, 'completed');
    assert.deepEqual(done.claims.identity, {level: 'runtime-observed', source: 'grok-stream-session', observed: reserved.sessionId});
    assert.equal(done.claims.model.level, scenario === 'no-model' ? 'unverified' : 'runtime-observed');
    assert.equal(done.claims.model.source, scenario === 'no-model' ? 'none' : 'grok-stream-model');
    assert.deepEqual(done.claims.effort, {level: 'unverified', source: 'none', requested: 'default', observed: null});
    assert.deepEqual(done.claims.permissions, {level: 'runtime-observed', source: 'worktree-snapshot', details: 'git-visible worktree only'});
    assert.equal(await fs.readFile(done.resultPath, 'utf8'), 'GROK-TOKEN-7c2e');
    assert.equal((await fs.stat(done.resultPath)).mode & 0o777, 0o600);
  }
  const child = JSON.parse(await fs.readFile(f.record, 'utf8'));
  assert.equal(child.argv[child.argv.indexOf('--session-id') + 1], reserved.sessionId);
  assert.equal(forbidden.some(flag => child.argv.includes(flag)), false);
  assert.equal(child.stdin, ''); assert.equal(child.prompt, 'Private role instructions\n\n\nPrivate task brief');
  assert.equal(child.mode, 0o600); assert.equal(child.autoUpdater, '1');
  const directory = path.dirname(child.argv[child.argv.indexOf('--prompt-file') + 1]);
  const record = JSON.parse(await fs.readFile(path.join(directory, 'record.json'), 'utf8'));
  assert.deepEqual(record.unverifiedContracts, {delegation: 'undetectable'});
  assert.equal(record.argsDigest, (await readLease(f.homes.claude, prepared.dispatchId, {runtimePlatforms: registry})).argsDigest);
  if (scenario === 'unknown-event') {
    const events = (await fs.readFile(path.join(directory, 'events.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.deepEqual(events.find(event => event.kind === 'unknown').raw, {type: 'future_event', payload: {untouched: 'raw event'}});
  }
});

test('grok bridge child env overrides parent compat values', async t => {
  const f = await fixture(t, {GROK_CLAUDE_AGENTS_ENABLED: 'true', GROK_CLAUDE_HOOKS_ENABLED: 'true'});
  const prepared = await f.prepare(); assert.equal(prepared.decision, 'allow', JSON.stringify(prepared.reasons));
  const done = await f.run(prepared.dispatchId);
  assert.equal(done.decision, 'allow', JSON.stringify(done)); assert.equal(done.routeStatus, 'completed');
  const child = JSON.parse(await fs.readFile(f.record, 'utf8'));
  assert.deepEqual(child.claudeEnv, {AGENTS: 'false', SKILLS: 'false', RULES: 'false', MCPS: 'false', HOOKS: 'false'});
  assert.equal(child.autoUpdater, '1');
});

test('existing or symlinked prompt.md fails before spawn', async t => {
  for (const kind of ['existing', 'symlink']) {
    const f = await fixture(t), prepared = await f.prepare(); assert.equal(prepared.decision, 'allow');
    assert.equal((await runBridgeDispatch({context: f.context, dispatchId: prepared.dispatchId, brief: 'Private task brief', policy, startSupervisor: f.starter})).decision, 'allow');
    const lease = await readLease(f.homes.claude, prepared.dispatchId, {runtimePlatforms: registry});
    const prompt = path.join(path.dirname(lease.resultPath), 'prompt.md'), target = path.join(f.base, 'target');
    await fs.writeFile(target, 'preserved');
    if (kind === 'symlink') await fs.symlink(target, prompt); else await fs.writeFile(prompt, 'preserved');
    await f.supervise(prepared.dispatchId);
    const done = await f.observe(prepared.dispatchId); assert.ok(codes(done).includes('execution_failed'), JSON.stringify(done));
    await assert.rejects(fs.access(f.record), {code: 'ENOENT'});
    assert.equal(await fs.readFile(target, 'utf8'), 'preserved'); assert.equal(await fs.readFile(prompt, 'utf8'), 'preserved');
  }
});

test('prompt permissions use the opened file when its path becomes a symlink', async t => {
  const f = await fixture(t), prepared = await f.prepare(); assert.equal(prepared.decision, 'allow');
  assert.equal((await runBridgeDispatch({context: f.context, dispatchId: prepared.dispatchId, brief: 'Private task brief', policy, startSupervisor: f.starter})).decision, 'allow');
  const lease = await readLease(f.homes.claude, prepared.dispatchId, {runtimePlatforms: registry});
  const prompt = path.join(path.dirname(lease.resultPath), 'prompt.md'), opened = prompt + '.opened', target = path.join(f.base, 'target');
  await fs.writeFile(target, 'preserved', {mode: 0o644});
  const originalOpen = fsSync.openSync, originalWrite = fsSync.writeFileSync;
  let promptFd, swapped = false;
  const open = t.mock.method(fsSync, 'openSync', function(filename, ...args) {
    const fd = originalOpen.call(this, filename, ...args);
    if (filename === prompt) promptFd = fd;
    return fd;
  });
  const write = t.mock.method(fsSync, 'writeFileSync', function(filename, ...args) {
    const result = originalWrite.call(this, filename, ...args);
    if (filename === promptFd && !swapped) {
      swapped = true;
      fsSync.renameSync(prompt, opened);
      fsSync.symlinkSync(target, prompt);
    }
    return result;
  });
  try {await f.supervise(prepared.dispatchId);} finally {open.mock.restore(); write.mock.restore();}
  assert.equal((await fs.lstat(prompt)).isSymbolicLink(), true);
  assert.equal((await fs.stat(target)).mode & 0o777, 0o644);
  assert.equal((await fs.stat(opened)).mode & 0o777, 0o600);
  assert.equal(await fs.readFile(target, 'utf8'), 'preserved');
  assert.equal(await fs.readFile(opened, 'utf8'), 'Private role instructions\n\n\nPrivate task brief');
});

test('AC-K6 Implementer/QA hold without spawning', async t => {
  const f = await fixture(t);
  for (const role of ['arc_implementer', 'arc_qa']) {
    const result = await f.prepare(role); assert.equal(result.decision, 'hold'); assert.ok(codes(result).includes('permission_scope_unverified'));
  }
  await assert.rejects(fs.access(f.record), {code: 'ENOENT'});
});

test('AC-K6 Grok hosts hold native and bridge prepare', async t => {
  for (const hostBridge of [false, true]) {
    const f = await fixture(t, {}, hostBridge);
    const result = await prepareRoleDispatch({context: {...f.context, hostPlatform: 'grok', executionEnvironment: 'grok-cli'}, assignment: {role: 'arc_scouter', taskId: crypto.randomUUID(), requestId: crypto.randomUUID()}, expectedRevision: 't12', policy: failedHostPolicy});
    assert.equal(result.route, hostBridge ? 'bridge' : 'native');
    assert.equal(result.decision, 'hold'); assert.ok(codes(result).includes('host_sandbox_blocked'), JSON.stringify(result));
  }
  const route = {platform: 'codex', hostPlatform: 'grok', role: 'arc_scouter'};
  assert.deepEqual(bridgeGateReasons({...route, policy: failedHostPolicy}), ['host_sandbox_blocked']);
  assert.deepEqual(bridgeGateReasons(route), []);
});

test('AC-K6 segment > 0 resume_unverified without mutation', async t => {
  const f = await fixture(t), prepared = await f.prepare(); assert.equal(prepared.decision, 'allow');
  await f.run(prepared.dispatchId);
  const before = await readLease(f.homes.claude, prepared.dispatchId, {runtimePlatforms: registry});
  const prompt = path.join(path.dirname(before.resultPath), 'prompt.md'), bytes = await fs.readFile(prompt);
  const held = await resumeRoleDispatch({context: f.context, dispatchId: prepared.dispatchId, brief: 'Resume', policy, startSupervisor: f.starter});
  assert.deepEqual(codes(held), ['resume_unverified']); assert.equal(held.decision, 'hold');
  assert.equal(held.reasons[0].releaseCondition, 'Update ARC after verifying platform session resume against the recorded session UUID.');
  assert.deepEqual(await readLease(f.homes.claude, prepared.dispatchId, {runtimePlatforms: registry}), before);
  assert.deepEqual(await fs.readFile(prompt), bytes);
  await assert.rejects(supervisorApi.buildBridgeInvocation({lease: {...before, segment: 1}, config: f.config, homes: f.homes, worktree: f.context.cwd, resultPath: before.resultPath, policy}), {reasonCode: 'resume_unverified'});
});

for (const noIdentity of [false, true]) test(`cancel uses SIGTERM then SIGKILL${noIdentity ? ' before identity' : ''}`, async t => {
  const f = await fixture(t, {ARC_FAKE_GROK_SCENARIO: 'hang', ...(noIdentity ? {ARC_FAKE_GROK_NO_EVENTS: '1'} : {})}), prepared = await f.prepare();
  assert.equal(prepared.decision, 'allow'); const signals = [];
  const done = await f.run(prepared.dispatchId, {
    afterSpawn: () => {setTimeout(() => requestCancel(f.homes.claude, prepared.dispatchId), 200);},
    signalGroup: (pid, signal) => {signals.push(signal); process.kill(pid, signal);},
  });
  assert.equal(done.routeStatus, 'cancelled', JSON.stringify(done)); assert.equal(done.decision, 'allow');
  assert.deepEqual(signals.slice(0, 2), ['SIGTERM', 'SIGKILL']);
});

test('Grok invocation reserves prompt path without writing; existing Claude invocation needs no resultPath', async t => {
  const f = await fixture(t), prepared = await f.prepare(); assert.equal(prepared.decision, 'allow');
  const lease = await readLease(f.homes.claude, prepared.dispatchId, {runtimePlatforms: registry});
  const resultPath = path.join(f.base, 'segment', 'result.md');
  const invocation = await supervisorApi.buildBridgeInvocation({lease, config: f.config, homes: f.homes, worktree: f.context.cwd, resultPath, policy});
  assert.equal(invocation.promptFile.path, path.join(f.base, 'segment', 'prompt.md'));
  assert.equal(invocation.promptFile.instructions, 'Private role instructions\n');
  assert.deepEqual(invocation.childEnv, {
    GROK_DISABLE_AUTOUPDATER: '1',
    GROK_CLAUDE_AGENTS_ENABLED: 'false',
    GROK_CLAUDE_SKILLS_ENABLED: 'false',
    GROK_CLAUDE_RULES_ENABLED: 'false',
    GROK_CLAUDE_MCPS_ENABLED: 'false',
    GROK_CLAUDE_HOOKS_ENABLED: 'false',
  });
  assert.deepEqual(Object.keys(GROK_CONTRACT.childEnv), ['GROK_DISABLE_AUTOUPDATER', 'GROK_CLAUDE_AGENTS_ENABLED', 'GROK_CLAUDE_SKILLS_ENABLED', 'GROK_CLAUDE_RULES_ENABLED', 'GROK_CLAUDE_MCPS_ENABLED', 'GROK_CLAUDE_HOOKS_ENABLED']);
  assert.equal(Object.isFrozen(GROK_CONTRACT.childEnv), true);
  assert.deepEqual(invocation.expected, {model: 'grok-test', effort: 'default'});
  assert.equal(invocation.argsDigest, digest(JSON.stringify(invocation.args)));
  await assert.rejects(fs.access(invocation.promptFile.path), {code: 'ENOENT'});
  await assert.rejects(supervisorApi.buildBridgeInvocation({lease: {...lease, hostPlatform: 'grok'}, config: f.config, homes: f.homes, resultPath, policy: failedHostPolicy}), {reasonCode: 'host_sandbox_blocked'});
  const legacy = await fixture(t, {}, true);
  const claudeLease = {version: 2, targetPlatform: 'claude', hostPlatform: 'claude', role: 'arc_scouter', segment: 0, sessionId: null, profileHash: digest(await fs.readFile(path.join(legacy.homes.claude, 'agents/arc-routing-scouter.md')))};
  const claude = await supervisorApi.buildBridgeInvocation({lease: claudeLease, config: legacy.config, homes: legacy.homes, worktree: legacy.context.cwd, policy});
  assert.equal(claude.platform, 'claude'); assert.equal(claude.promptFile, undefined);
});

// Operational registry must retain the permission, host and resume boundaries after promotion.
test('operational Grok Implementer and QA hold without leases', async t => {
  const f = await fixture(t), context = {...f.context, runtimePlatforms: DEFAULT_PLATFORM_REGISTRY};
  const marker = path.join(f.base, 'version-commands');
  writeFakeGrokCli({bin: path.join(f.base, 'bin'), marker});
  for (const role of ['arc_implementer', 'arc_qa']) {
    const result = await prepareRoleDispatch({context, assignment: {role, taskId: crypto.randomUUID(), requestId: crypto.randomUUID(), ...(role === 'arc_implementer' ? {allowedPaths: ['src/']} : {})}, expectedRevision: 't12', policy});
    assert.equal(result.decision, 'hold');
    assert.deepEqual(codes(result), ['permission_scope_unverified']);
    assert.equal(result.dispatchId, null);
  }
  assert.deepEqual(await listLeases(f.homes.claude, {runtimePlatforms: DEFAULT_PLATFORM_REGISTRY}), []);
});

test('Grok hosts with capability off hold native and bridge before sandbox checks', async t => {
  const {runtimePlatforms} = grokOffRegistries();
  for (const hostBridge of [false, true]) {
    const f = await fixture(t, {}, hostBridge);
    const context = {...f.context, runtimePlatforms, hostPlatform: 'grok', executionEnvironment: 'grok-cli'};
    writeFakeGrokCli({bin: path.join(f.base, 'bin'), marker: path.join(f.base, 'version-commands')});
    const result = await prepareRoleDispatch({context, assignment: {role: 'arc_scouter', taskId: crypto.randomUUID(), requestId: crypto.randomUUID()}, expectedRevision: 't12', policy});
    assert.equal(result.route, hostBridge ? 'bridge' : 'native');
    assert.equal(result.decision, 'hold');
    assert.deepEqual(codes(result), ['capability_not_verified']);
    assert.equal(result.dispatchId, null);
    assert.deepEqual(await listLeases(f.homes.claude, {runtimePlatforms}), []);
  }
});

test('operational Grok hosts pass capability and GK2 gates', async t => {
  for (const hostBridge of [false, true]) {
    const f = await fixture(t, {}, hostBridge);
    const context = {...f.context, runtimePlatforms: DEFAULT_PLATFORM_REGISTRY, hostPlatform: 'grok', executionEnvironment: 'grok-cli'};
    writeFakeGrokCli({bin: path.join(f.base, 'bin'), marker: path.join(f.base, 'version-commands')});
    const result = await prepareRoleDispatch({context, assignment: {role: 'arc_scouter', taskId: crypto.randomUUID(), requestId: crypto.randomUUID()}, expectedRevision: 't12', policy});
    if (result.decision === 'allow') {
      assert.equal((await cancelRoleDispatch({context, dispatchId: result.dispatchId, policy})).decision, 'allow');
    }
    assert.equal(result.route, hostBridge ? 'bridge' : 'native');
    assert.equal(codes(result).includes('capability_not_verified'), false, JSON.stringify(result.reasons));
    assert.equal(codes(result).includes('host_sandbox_blocked'), false, JSON.stringify(result.reasons));
  }
});

test('operational Grok segment above zero remains resume_unverified', async t => {
  const f = await fixture(t), context = {...f.context, runtimePlatforms: DEFAULT_PLATFORM_REGISTRY};
  writeFakeGrokCli({bin: path.join(f.base, 'bin'), marker: path.join(f.base, 'version-commands')});
  const result = await prepareRoleDispatch({context, assignment: {role: 'arc_scouter', taskId: crypto.randomUUID(), requestId: crypto.randomUUID()}, expectedRevision: 't12', policy});
  assert.equal(result.decision, 'allow', JSON.stringify(result.reasons));
  const lease = await readLease(f.homes.claude, result.dispatchId, context);
  await assert.rejects(supervisorApi.buildBridgeInvocation({lease: {...lease, segment: 1}, config: f.config, homes: f.homes, worktree: context.cwd, resultPath: path.join(f.base, 'result.md'), policy}), {reasonCode: 'resume_unverified'});
});
