import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {createRoutingFixture} from './role-fixtures.mjs';
import {DEFAULT_POLICY} from '../../lib/runtime/role-dispatch-policy.mjs';
import {readLease, writeLease, requestCancel, cancelRequested, readHeartbeat, writeHeartbeat, listLeases, dispatchDirectory, NON_TERMINAL_STATES as NON_TERMINAL} from '../../lib/runtime/role-dispatch-store.mjs';
import {prepareRoleDispatch, withRoutingLock} from '../../lib/runtime/role-routing.mjs';
import {runBridgeDispatch, recordRoleObservation} from '../../lib/runtime/role-bridge.mjs';
import {runSupervisor, processAlive, processStartTime} from '../../lib/runtime/role-supervisor.mjs';
import {runWorkflowCommand} from '../../lib/runtime/command.mjs';
import {parseCompositeProfile} from '../../lib/runtime/role-bridge-args.mjs';

const TERMINAL = ['completed', 'failed', 'cancelled'];
const SECRET = 'sk-test-SECRET-0123456789abcdef';
const policyWith = (over = {}) => ({...DEFAULT_POLICY, probeTimeoutMs: 1000, lockRetryMs: 30000, ...over, gates: {...DEFAULT_POLICY.gates, ...over.gates}});
const codes = result => result.reasons.map(reason => reason.code);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let counter = 0;
const nextId = () => { counter += 1; return `r${counter}`; };

const bases = [];
const cleanup = ctx => {
  if (!ctx.f) return;
  spawnSync('pkill', ['-KILL', '-f', ctx.f.base]);
  for (const pid of ctx.pids ?? []) { try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ } }
};
test.after(() => {
  const list = spawnSync('ps', ['-axo', 'pid=,command='], {encoding: 'utf8'}).stdout.split('\n').filter(line => bases.some(base => line.includes(base)) && !line.includes('ps -axo'));
  assert.deepEqual(list, [], 'leftover fixture processes');
});

async function setup(t, {roles = {arc_planner: 'codex'}, hostPlatform = 'claude', limits, codexScenario = {}, claudeScenario = {}} = {}) {
  const ctx = {pids: []};
  t.after(() => cleanup(ctx));
  const f = ctx.f = await createRoutingFixture(t, {roles, hostPlatform, ...(limits ? {limits} : {})});
  bases.push(f.base);
  f.ctx = ctx;
  // Every scenario keeps a supported version so later setScenario calls never change the pre-start decision.
  for (const [name, version, scenario] of [['codex', 'codex-cli 0.167.0', codexScenario], ['claude', '2.1.322 (Claude Code)', claudeScenario]]) {
    const cli = f[name] = await f.cli(name, {version, ...scenario}), set = cli.setScenario;
    cli.setScenario = value => set({version, ...value});
  }
  return f;
}
const hostClaudeGates = {gates: {G2: 'pass'}};
const prepare = async (f, role, {extra = {}, policy = policyWith(), context} = {}) => {
  const result = await prepareRoleDispatch({context: context ?? f.context(), assignment: {role, requestId: nextId(), taskId: nextId(), ...(role === 'arc_implementer' ? {allowedPaths: ['src/']} : {}), ...extra}, expectedRevision: f.revision, policy});
  assert.equal(result.decision, 'allow', JSON.stringify(result.reasons));
  return result;
};
const run = (f, dispatchId, brief = 'do the task', extra = {}) => runBridgeDispatch({context: extra.context ?? f.context(), dispatchId, brief, policy: policyWith(), ...extra});
async function settle(f, dispatchId, {ms = 40000, context} = {}) {
  const end = Date.now() + ms;
  for (;;) {
    const result = await recordRoleObservation({context: context ?? f.context(), dispatchId, waitMs: 2000, policy: policyWith()});
    if ([...TERMINAL, 'unknown'].includes(result.routeStatus) || Date.now() > end) return result;
  }
}
const records = async cli => (await fs.readFile(cli.recordPath, 'utf8').catch(() => '')).split('\n').filter(Boolean).map(line => JSON.parse(line));
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const waitDead = async (pid, ms = 5000) => { const end = Date.now() + ms; while (alive(pid) && Date.now() < end) await sleep(50); return !alive(pid); };

const THREAD = n => `01a1c596-43f9-77a0-b0bb-${String(n).padStart(12, '0')}`;
const rolloutFile = (f, thread, {sandbox = 'read-only', model = 'gpt-6-luna', effort = 'low', approval = 'never', delegate = false} = {}) => ({
  path: path.join(f.codexHome, 'sessions/2026/11/10', `rollout-2026-11-10T00-00-00-${thread}.jsonl`),
  content: [
    {type: 'session_meta', payload: {id: thread}},
    {type: 'turn_context', payload: {model, effort, approval_policy: approval, sandbox_policy: {type: sandbox}}},
    ...(delegate ? [{type: 'response_item', payload: {type: 'function_call', name: 'spawn_agent'}}] : [])
  ].map(line => JSON.stringify(line)).join('\n') + '\n'
});
const codexEvents = (thread, tail = [{type: 'turn.completed'}]) => [{type: 'thread.started', thread_id: thread}, ...tail];
const codexOk = (f, n, extra = {}, rollout = {}) => { const {writes = [], ...rest} = extra; return {events: codexEvents(THREAD(n)), outputFile: 'RESULT TEXT', ...rest, writes: [rolloutFile(f, THREAD(n), rollout), ...writes]}; };

const claudeTools = (f, suffix) => parseCompositeProfile('claude', readFileSync(path.join(f.claudeHome, `agents/arc-routing-${suffix}.md`))).tools;
const claudeInit = (tools, over = {}) => ({type: 'system', subtype: 'init', session_id: 'sess-1', tools, model: 'claude-haiku-5-5', permissionMode: 'default', ...over});
const claudeResult = (over = {}) => ({type: 'result', subtype: 'success', is_error: false, session_id: 'sess-1', result: 'claude done', ...over});
const transcript = (f, session = 'sess-1', effort = 'low') => ({path: path.join(f.claudeHome, 'projects/proj', `${session}.jsonl`), content: JSON.stringify({type: 'assistant', output_config: {effort}}) + '\n'});
const claudeSetup = (t, over = {}) => setup(t, {roles: {arc_scouter: 'claude'}, hostPlatform: 'codex', ...over});
const artifactOf = result => path.dirname(result.resultPath);
const dirOf = (f, dispatchId) => path.join(f.cwd, '.git/arc/workflows/wf-1/dispatches', dispatchId);
const gitIn = (f, ...args) => { const r = spawnSync('git', args, {cwd: f.cwd, encoding: 'utf8'}); if (r.status !== 0) throw Error(r.stderr); return r.stdout; };
const mode = async file => (await fs.stat(file)).mode & 0o777;
const startInProcess = f => async () => ({pid: process.pid, startTime: processStartTime(process.pid)});

test('run-dispatch starts a detached supervisor and reaches completed with result.md', async t => {
  const f = await setup(t);
  await f.codex.setScenario(codexOk(f, 1));
  const prepared = await prepare(f, 'arc_planner');
  const started = await run(f, prepared.dispatchId, 'brief — 한글 body');
  assert.equal(started.decision, 'allow');
  assert.equal(started.routeStatus, 'starting');
  assert.equal(started.dispatchId, prepared.dispatchId);
  const done = await settle(f, prepared.dispatchId);
  assert.equal(done.routeStatus, 'completed', JSON.stringify(done.reasons));
  // User config (MCP servers) is not controlled for a Codex child, so permissions stay operator-attested and support never becomes verified.
  assert.equal(done.claims.permissions.level, 'operator-attested');
  assert.match(done.claims.permissions.details, /user-config-mcp-not-controlled/);
  assert.equal(done.supportStatus, 'unverified');
  const [record] = await records(f.codex);
  assert.equal(record.stdin, 'brief — 한글 body');
  assert.equal(record.bridgeChild, prepared.dispatchId);
  assert.equal(record.argv.includes('brief'), false);
  assert.equal(await fs.readFile(done.resultPath, 'utf8'), 'RESULT TEXT');
  const dir = artifactOf(done);
  assert.equal(await mode(dir), 0o700);
  for (const name of ['brief.md', 'events.jsonl', 'record.json', 'result.md']) assert.equal(await mode(path.join(dir, name)), 0o600, name);
  assert.equal(await fs.readFile(path.join(dir, 'brief.md'), 'utf8'), 'brief — 한글 body');
  const lease = await readLease(f.codexHome, prepared.dispatchId);
  assert.equal(lease.state, 'completed');
  assert.ok(lease.supervisor.pid > 0 && lease.child.pid > 0 && lease.argsDigest.startsWith('sha256:'));
  assert.equal(lease.sessionId, THREAD(1));
  assert.ok(await waitDead(lease.supervisor.pid), 'supervisor exits after the terminal write');
});

test('run-dispatch denies non-reserved, native, empty, non-string and 262145-byte briefs; accepts exactly 262144 bytes', async t => {
  const f = await setup(t, {roles: {arc_planner: 'codex'}});
  await f.codex.setScenario(codexOk(f, 2));
  const bridge = await prepare(f, 'arc_planner'), native = await prepare(f, 'arc_scouter');
  for (const brief of ['', 123, null, undefined, {}, 'a'.repeat(262145), '가'.repeat(87382)]) {
    const result = await runBridgeDispatch({context: f.context(), dispatchId: bridge.dispatchId, brief, policy: policyWith()});
    assert.equal(result.decision, 'deny', String(brief).slice(0, 10));
    assert.deepEqual(codes(result), ['invalid_request']);
  }
  const nativeResult = await run(f, native.dispatchId, 'x');
  assert.equal(nativeResult.decision, 'deny');
  assert.deepEqual(codes(nativeResult), ['invalid_request']);
  const unknown = await run(f, 'does-not-exist', 'x');
  assert.equal(unknown.decision, 'deny');
  assert.equal((await readLease(f.codexHome, bridge.dispatchId)).state, 'reserved');
  assert.equal((await readLease(f.codexHome, native.dispatchId)).state, 'reserved');
  assert.equal((await records(f.codex)).length, 0);
  const exact = 'a'.repeat(262144);
  assert.equal((await run(f, bridge.dispatchId, exact)).routeStatus, 'starting');
  assert.equal((await settle(f, bridge.dispatchId)).routeStatus, 'completed');
  assert.equal((await records(f.codex))[0].stdin.length, 262144);
  const again = await run(f, bridge.dispatchId, 'x');
  assert.equal(again.decision, 'deny', 'terminal dispatch cannot be run again');
});

test('second run-dispatch for the same dispatch is denied and no second child is spawned', async t => {
  const f = await setup(t);
  await f.codex.setScenario(codexOk(f, 3, {delayMs: 600}));
  const prepared = await prepare(f, 'arc_planner');
  const [a, b] = await Promise.all([run(f, prepared.dispatchId), run(f, prepared.dispatchId)]);
  assert.deepEqual([a.decision, b.decision].sort(), ['allow', 'deny']);
  const third = await run(f, prepared.dispatchId);
  assert.equal(third.decision, 'deny');
  assert.deepEqual(codes(third), ['invalid_request']);
  assert.equal((await settle(f, prepared.dispatchId)).routeStatus, 'completed');
  assert.equal((await records(f.codex)).length, 1);
});

test('profile changed after prepare holds activation_unverified without spawning', async t => {
  const f = await setup(t);
  await f.codex.setScenario(codexOk(f, 4));
  const prepared = await prepare(f, 'arc_planner');
  const file = path.join(f.codexHome, 'agents/arc-routing-planner.toml');
  await fs.writeFile(file, Buffer.concat([await fs.readFile(file), Buffer.from('\n# changed\n')]));
  const result = await run(f, prepared.dispatchId);
  assert.equal(result.decision, 'hold');
  assert.deepEqual(codes(result), ['activation_unverified']);
  assert.equal((await readLease(f.codexHome, prepared.dispatchId)).state, 'reserved');
  assert.equal((await records(f.codex)).length, 0);
});

test('Claude init with extra tool kills the child group and records failed permission_scope_mismatch', async t => {
  const f = await claudeSetup(t);
  await f.claude.setScenario({version: '2.1.322 (Claude Code)', events: [claudeInit([...claudeTools(f, 'scouter'), 'Bash'])], hang: true, grandchild: true, grandchildPidFile: path.join(f.base, 'gc.pid')});
  const prepared = await prepare(f, 'arc_scouter', {policy: policyWith(hostClaudeGates)});
  await run(f, prepared.dispatchId);
  const done = await settle(f, prepared.dispatchId);
  assert.equal(done.routeStatus, 'failed');
  assert.equal(codes(done)[0], 'permission_scope_mismatch');
  const lease = await readLease(f.codexHome, prepared.dispatchId);
  assert.equal(alive(lease.child.pid), false);
  const grandchild = Number(await fs.readFile(path.join(f.base, 'gc.pid'), 'utf8'));
  assert.ok(await waitDead(grandchild), 'grandchild in the process group is gone');
});

test('Claude init model mismatch fails model_effort_mismatch; alias haiku with claude-haiku-5-5 completes with model runtime-observed', async t => {
  const f = await claudeSetup(t);
  const tools = claudeTools(f, 'scouter');
  await f.claude.setScenario({version: '2.1.322 (Claude Code)', events: [claudeInit(tools, {model: 'claude-sonnet-5-1'})], hang: true});
  const bad = await prepare(f, 'arc_scouter', {policy: policyWith(hostClaudeGates)});
  await run(f, bad.dispatchId);
  const failed = await settle(f, bad.dispatchId);
  assert.equal(failed.routeStatus, 'failed');
  assert.equal(codes(failed)[0], 'model_effort_mismatch');
  await f.claude.setScenario({version: '2.1.322 (Claude Code)', events: [claudeInit(tools), claudeResult()], writes: [transcript(f)]});
  const good = await prepare(f, 'arc_scouter', {policy: policyWith(hostClaudeGates)});
  await run(f, good.dispatchId);
  const done = await settle(f, good.dispatchId);
  assert.equal(done.routeStatus, 'completed', JSON.stringify(done.reasons));
  assert.equal(done.claims.model.level, 'runtime-observed');
  assert.equal(done.claims.model.observed, 'claude-haiku-5-5');
  assert.equal(done.claims.effort.level, 'runtime-observed');
  assert.equal(done.supportStatus, 'verified');
  assert.equal(await fs.readFile(done.resultPath, 'utf8'), 'claude done');
});

test('missing transcript effort completes with effort unverified and supportStatus unverified', async t => {
  const f = await claudeSetup(t);
  await f.claude.setScenario({version: '2.1.322 (Claude Code)', events: [claudeInit(claudeTools(f, 'scouter')), claudeResult()]});
  const prepared = await prepare(f, 'arc_scouter', {policy: policyWith(hostClaudeGates)});
  await run(f, prepared.dispatchId);
  const done = await settle(f, prepared.dispatchId);
  assert.equal(done.routeStatus, 'completed');
  assert.equal(done.claims.effort.level, 'unverified');
  assert.equal(done.claims.model.level, 'runtime-observed');
  assert.equal(done.supportStatus, 'unverified');
});

test('Codex rollout sandbox mismatch fails permission_scope_mismatch; spawn_agent call fails delegation_observed', async t => {
  const f = await setup(t, {roles: {arc_planner: 'codex', arc_reviewer: 'codex'}});
  await f.codex.setScenario({...codexOk(f, 5, {}, {sandbox: 'workspace-write'}), hang: true});
  const mismatch = await prepare(f, 'arc_planner');
  await run(f, mismatch.dispatchId);
  const failed = await settle(f, mismatch.dispatchId);
  assert.equal(failed.routeStatus, 'failed');
  assert.equal(codes(failed)[0], 'permission_scope_mismatch');
  assert.equal(alive((await readLease(f.codexHome, mismatch.dispatchId)).child.pid), false);
  await f.codex.setScenario(codexOk(f, 6, {}, {delegate: true}));
  const delegated = await prepare(f, 'arc_reviewer');
  await run(f, delegated.dispatchId);
  const second = await settle(f, delegated.dispatchId);
  assert.equal(second.routeStatus, 'failed');
  assert.equal(codes(second)[0], 'delegation_observed');
});

test('read-only role writing a tracked file fails permission_violation_observed; untouched pre-existing dirty file passes', async t => {
  const f = await setup(t, {roles: {arc_planner: 'codex', arc_reviewer: 'codex'}});
  await fs.writeFile(path.join(f.cwd, 'a.txt'), 'one\n'); await fs.writeFile(path.join(f.cwd, 'dirty.txt'), 'base\n');
  gitIn(f, 'add', '.'); gitIn(f, 'commit', '-q', '-m', 'files');
  await fs.writeFile(path.join(f.cwd, 'dirty.txt'), 'edited before the role\n'); await fs.writeFile(path.join(f.cwd, 'untracked.txt'), 'new\n');
  await f.codex.setScenario(codexOk(f, 7, {writes: [{path: path.join(f.cwd, 'a.txt'), content: 'changed by role\n'}]}));
  const violating = await prepare(f, 'arc_planner');
  await run(f, violating.dispatchId);
  const failed = await settle(f, violating.dispatchId);
  assert.equal(failed.routeStatus, 'failed');
  assert.deepEqual(codes(failed), ['permission_violation_observed']);
  const record = JSON.parse(await fs.readFile(path.join(artifactOf(failed), 'record.json'), 'utf8'));
  assert.deepEqual(record.violations.changedPaths, ['a.txt']);
  await f.codex.setScenario(codexOk(f, 8));
  const clean = await prepare(f, 'arc_reviewer');
  await run(f, clean.dispatchId);
  const done = await settle(f, clean.dispatchId);
  assert.equal(done.routeStatus, 'completed', JSON.stringify(done.reasons));
  assert.equal(await fs.readFile(path.join(f.cwd, 'dirty.txt'), 'utf8'), 'edited before the role\n');
});

test('timeout kills the process group including a grandchild and records failed timeout', async t => {
  const f = await setup(t);
  const gcFile = path.join(f.base, 'gc.pid');
  await f.codex.setScenario({...codexOk(f, 9), hang: true, grandchild: true, grandchildPidFile: gcFile});
  const prepared = await prepare(f, 'arc_planner');
  const started = await run(f, prepared.dispatchId, 'x', {startSupervisor: startInProcess(f)});
  assert.equal(started.routeStatus, 'starting');
  await runSupervisor({codexHome: f.codexHome, dispatchId: prepared.dispatchId, cwd: f.cwd, userHome: f.userHome, env: f.env, timeoutMs: 600, graceMs: 200, heartbeatMs: 100});
  const lease = await readLease(f.codexHome, prepared.dispatchId);
  assert.equal(lease.state, 'failed');
  assert.deepEqual(lease.reasons.map(reason => reason.code), ['timeout']);
  const grandchild = Number(await fs.readFile(gcFile, 'utf8'));
  assert.ok(await waitDead(grandchild), 'grandchild terminated by the group signal');
  assert.equal(alive(lease.child.pid), false);
});

test('child ignoring SIGTERM is SIGKILLed after grace', async t => {
  const f = await setup(t);
  await f.codex.setScenario({...codexOk(f, 10), hang: true, ignoreSigterm: true});
  const prepared = await prepare(f, 'arc_planner');
  await run(f, prepared.dispatchId, 'x', {startSupervisor: startInProcess(f)});
  const begin = Date.now();
  await runSupervisor({codexHome: f.codexHome, dispatchId: prepared.dispatchId, cwd: f.cwd, userHome: f.userHome, env: f.env, timeoutMs: 600, graceMs: 400, heartbeatMs: 100});
  const lease = await readLease(f.codexHome, prepared.dispatchId);
  assert.equal(lease.state, 'failed');
  assert.deepEqual(lease.reasons.map(reason => reason.code), ['timeout']);
  assert.ok(Date.now() - begin >= 900, 'waited the grace period before SIGKILL');
  assert.equal(alive(lease.child.pid), false);
});

test('killed supervisor leads observe to unknown terminal_state_unverified and the lease still counts toward capacity', async t => {
  const f = await setup(t, {roles: {arc_planner: 'codex', arc_reviewer: 'codex'}, limits: {total: 100, concurrent: 1}});
  await f.codex.setScenario({...codexOk(f, 11), hang: true});
  const prepared = await prepare(f, 'arc_planner');
  await run(f, prepared.dispatchId);
  let lease;
  for (const end = Date.now() + 20000; ;) { lease = await readLease(f.codexHome, prepared.dispatchId); if (lease.state === 'running' || Date.now() > end) break; await sleep(100); }
  assert.equal(lease.state, 'running');
  process.kill(lease.supervisor.pid, 'SIGKILL');
  assert.ok(await waitDead(lease.supervisor.pid));
  const early = await recordRoleObservation({context: f.context(), dispatchId: prepared.dispatchId, waitMs: 0, now: Date.now(), policy: policyWith()});
  assert.equal(early.routeStatus, 'running', 'a recent heartbeat is not a lost supervisor');
  const lost = await recordRoleObservation({context: f.context(), dispatchId: prepared.dispatchId, waitMs: 0, now: Date.now() + 31000, policy: policyWith()});
  assert.equal(lost.routeStatus, 'unknown');
  assert.equal(lost.decision, 'hold');
  assert.deepEqual(codes(lost), ['terminal_state_unverified']);
  const next = await prepareRoleDispatch({context: f.context(), assignment: {role: 'arc_reviewer', requestId: nextId(), taskId: nextId()}, expectedRevision: f.revision, policy: policyWith()});
  assert.equal(next.decision, 'hold');
  assert.ok(codes(next).includes('capacity_exhausted'));
  assert.equal((await readLease(f.codexHome, prepared.dispatchId)).state, 'unknown');
});

test('PID reuse: alive pid with different start time is treated as dead', async t => {
  assert.equal(typeof processStartTime(process.pid), 'string');
  assert.equal(processStartTime(2147483000), null);
  const own = processStartTime(process.pid);
  assert.equal(processAlive({pid: process.pid, startTime: own}), true);
  assert.equal(processAlive({pid: process.pid, startTime: 'Thu Jan  1 00:00:00 1970'}), false);
  assert.equal(processAlive({pid: 2147483000, startTime: own}), false);
  const f = await setup(t);
  const prepared = await prepare(f, 'arc_planner');
  const stale = async startTime => withRoutingLock(f.codexHome, async () => {
    const lease = await readLease(f.codexHome, prepared.dispatchId);
    await writeLease(f.codexHome, {...lease, state: 'starting', supervisor: {pid: process.pid, startTime}}, {now: Date.now() - 100000});
  });
  await stale('Thu Jan  1 00:00:00 1970');
  const lost = await recordRoleObservation({context: f.context(), dispatchId: prepared.dispatchId, now: Date.now(), policy: policyWith()});
  assert.equal(lost.routeStatus, 'unknown');
  const f2 = await setup(t);
  const prepared2 = await prepare(f2, 'arc_planner');
  await withRoutingLock(f2.codexHome, async () => writeLease(f2.codexHome, {...(await readLease(f2.codexHome, prepared2.dispatchId)), state: 'starting', supervisor: {pid: process.pid, startTime: own}}, {now: Date.now() - 100000}));
  const still = await recordRoleObservation({context: f2.context(), dispatchId: prepared2.dispatchId, now: Date.now(), policy: policyWith()});
  assert.equal(still.routeStatus, 'starting', 'live supervisor with matching start time is not lost');
});

const listFiles = async dir => { const out = []; for (const entry of await fs.readdir(dir, {withFileTypes: true})) { const full = path.join(dir, entry.name); if (entry.isDirectory()) out.push(...await listFiles(full)); else out.push(full); } return out; };
const runCli = (f, command, input) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(f.codexHome, 'skills/arc/runtime/cli.mjs'), command, '--cwd', f.cwd, '--workflow', 'wf-1', '--input', '-'], {env: f.env, stdio: ['pipe', 'pipe', 'pipe']});
  let stdout = '', stderr = ''; const timer = setTimeout(() => child.kill('SIGKILL'), 40000);
  child.stdout.on('data', c => { stdout += c; }); child.stderr.on('data', c => { stderr += c; });
  child.on('error', reject);
  child.on('close', code => { clearTimeout(timer); resolve({code, stdout, stderr, json: stdout.trim() ? JSON.parse(stdout.trim().split('\n').at(-1)) : null}); });
  child.stdin.end(JSON.stringify(input));
});

test('secret environment values never appear in argv record, lease, heartbeat, dispatch directory files or command stdout', async t => {
  const f = await setup(t);
  f.env = {...f.env, ARC_TEST_SECRET: SECRET, OPENAI_API_KEY: SECRET};
  await f.codex.setScenario(codexOk(f, 12, {events: codexEvents(THREAD(12), [{type: 'error', message: `leak ${SECRET}`}, {type: 'turn.completed'}])}));
  const prepared = await prepare(f, 'arc_planner');
  const base = {hostPlatform: 'claude', executionEnvironment: 'claude-cli'};
  const started = await runCli(f, 'run-dispatch', {...base, dispatchId: prepared.dispatchId, brief: 'plain brief'});
  assert.equal(started.code, 0, started.stderr);
  let observed;
  for (const end = Date.now() + 40000; ;) { observed = await runCli(f, 'observe', {...base, dispatchId: prepared.dispatchId, waitMs: 2000}); if (TERMINAL.includes(observed.json.routeStatus) || Date.now() > end) break; }
  assert.equal(observed.json.routeStatus, 'completed', observed.stdout);
  assert.equal(observed.code, 0);
  const lease = await readLease(f.codexHome, prepared.dispatchId);
  const files = [...await listFiles(dispatchDirectory(f.codexHome)), ...await listFiles(artifactOf(observed.json)), f.codex.recordPath];
  for (const file of files) assert.equal((await fs.readFile(file, 'utf8')).includes(SECRET), false, file);
  for (const out of [started.stdout, started.stderr, observed.stdout, observed.stderr]) assert.equal(out.includes(SECRET), false);
  assert.equal(JSON.stringify(lease).includes(SECRET), false);
  assert.ok(await waitDead(lease.supervisor.pid));
});

test('events.jsonl holds only normalized fields and truncates at the configured cap with record flag', async t => {
  const f = await setup(t);
  const noise = Array.from({length: 200}, (_, index) => ({type: 'item.completed', n: index, text: 'FREE-TEXT-NOT-STORED'}));
  await f.codex.setScenario(codexOk(f, 13, {events: [{type: 'thread.started', thread_id: THREAD(13)}, {type: 'error', message: 'MSG-UNIQUE'}, ...noise, {type: 'turn.completed'}]}));
  const prepared = await prepare(f, 'arc_planner');
  await run(f, prepared.dispatchId, 'x', {startSupervisor: startInProcess(f)});
  await runSupervisor({codexHome: f.codexHome, dispatchId: prepared.dispatchId, cwd: f.cwd, userHome: f.userHome, env: f.env, eventsMaxBytes: 1024, heartbeatMs: 100});
  const lease = await readLease(f.codexHome, prepared.dispatchId);
  assert.equal(lease.state, 'completed');
  const dir = path.dirname(lease.resultPath);
  const events = await fs.readFile(path.join(dir, 'events.jsonl'), 'utf8');
  assert.ok(Buffer.byteLength(events) <= 1024);
  assert.ok(events.length > 0);
  for (const line of events.split('\n').filter(Boolean)) assert.deepEqual(Object.keys(JSON.parse(line)).filter(key => !['kind', 'threadId', 'sessionId', 'model', 'tools', 'permissionMode', 'isError'].includes(key)), []);
  assert.equal(events.includes('MSG-UNIQUE') || events.includes('FREE-TEXT-NOT-STORED'), false);
  const record = JSON.parse(await fs.readFile(path.join(dir, 'record.json'), 'utf8'));
  assert.equal(record.eventsTruncated, true);
});

test('non-JSON lines and missing result event produce failed invalid_output without crashing', async t => {
  const f = await setup(t, {roles: {arc_planner: 'codex', arc_reviewer: 'codex'}});
  await f.codex.setScenario(codexOk(f, 14, {events: ['plain text, not json', '{"broken', 'x'.repeat(1.2 * 1024 * 1024), {type: 'thread.started', thread_id: THREAD(14)}], outputFile: undefined}));
  const first = await prepare(f, 'arc_planner');
  await run(f, first.dispatchId);
  const done = await settle(f, first.dispatchId);
  assert.equal(done.routeStatus, 'failed');
  assert.deepEqual(codes(done), ['invalid_output']);
  const record = JSON.parse(await fs.readFile(path.join(dirOf(f, first.dispatchId), 'record.json'), 'utf8'));
  assert.ok(record.ignoredLines >= 2 && record.lineOverflow === true, JSON.stringify(record));
  await f.codex.setScenario({events: [], exitCode: 1});
  const second = await prepare(f, 'arc_reviewer');
  await run(f, second.dispatchId);
  const crashed = await settle(f, second.dispatchId);
  assert.equal(crashed.routeStatus, 'failed');
  assert.deepEqual(codes(crashed), ['invalid_output']);
});

test('auth, model and effort error streams classify to distinct failed reasons; no retry or substitution', async t => {
  const f = await setup(t);
  const cases = [['401 Unauthorized: please log in', 'auth_rejected'], ['The model `gpt-x` does not exist', 'model_rejected'], ['reasoning effort xhigh is not supported', 'effort_rejected']];
  let expected = 0;
  for (const [index, [message, code]] of cases.entries()) {
    await f.codex.setScenario({events: codexEvents(THREAD(20 + index), [{type: 'turn.failed', error: {message}}]), exitCode: 1, writes: [rolloutFile(f, THREAD(20 + index))]});
    const prepared = await prepare(f, 'arc_planner');
    await run(f, prepared.dispatchId);
    const done = await settle(f, prepared.dispatchId);
    assert.equal(done.routeStatus, 'failed');
    assert.deepEqual(codes(done), [code]);
    expected += 1;
    assert.equal((await records(f.codex)).length, expected, 'exactly one execution per dispatch');
  }
  await f.codex.setScenario({events: codexEvents(THREAD(30), [{type: 'turn.failed', error: {message: 'something odd'}}]), exitCode: 1, writes: [rolloutFile(f, THREAD(30))]});
  const odd = await prepare(f, 'arc_planner');
  await run(f, odd.dispatchId);
  assert.deepEqual(codes(await settle(f, odd.dispatchId)), ['execution_failed']);
});

test('supervisor lease writes during concurrent prepare-dispatch never surface activation_unverified', async t => {
  const f = await setup(t, {roles: {arc_planner: 'codex', arc_qa: 'codex'}, limits: {total: 200, concurrent: 100}});
  await f.codex.setScenario(codexOk(f, 40, {delayMs: 1200}));
  const first = await prepare(f, 'arc_planner');
  const running = run(f, first.dispatchId);
  const results = await Promise.all(Array.from({length: 20}, () => prepareRoleDispatch({context: f.context(), assignment: {role: 'arc_qa', requestId: nextId(), taskId: nextId()}, expectedRevision: f.revision, policy: policyWith()})));
  await running;
  for (const result of results) assert.equal(result.decision, 'allow', JSON.stringify(result.reasons));
  assert.equal(results.some(result => codes(result).includes('activation_unverified')), false);
  const done = await settle(f, first.dispatchId);
  assert.equal(done.routeStatus, 'completed', JSON.stringify(done.reasons) + await fs.readFile(path.join(dirOf(f, first.dispatchId), 'record.json'), 'utf8').catch(() => ''));
});

test('native observe started→completed records operator-attested claims; invalid transitions are denied', async t => {
  const f = await setup(t, {roles: {arc_planner: 'codex'}});
  const native = await prepare(f, 'arc_scouter');
  const observe = extra => recordRoleObservation({context: f.context(), dispatchId: native.dispatchId, policy: policyWith(), ...extra});
  assert.equal((await observe({})).decision, 'deny', 'native requires an event');
  assert.equal((await observe({event: 'completed'})).decision, 'deny', 'reserved cannot complete');
  assert.equal((await observe({event: 'started'})).decision, 'deny', 'started needs nativeAgentId');
  assert.equal((await observe({event: 'bogus', nativeAgentId: 'a'})).decision, 'deny');
  assert.equal((await observe({event: 'started', nativeAgentId: 'agent-1', waitMs: 10})).decision, 'deny', 'native takes no waitMs');
  const started = await observe({event: 'started', nativeAgentId: 'agent-1'});
  assert.equal(started.decision, 'allow');
  assert.equal(started.routeStatus, 'running');
  assert.equal((await observe({event: 'started', nativeAgentId: 'agent-2'})).decision, 'deny', 'running cannot start again');
  const done = await observe({event: 'completed'});
  assert.equal(done.routeStatus, 'completed');
  assert.equal(done.supportStatus, 'unverified');
  for (const claim of Object.values(done.claims)) assert.equal(claim.level, 'operator-attested');
  assert.equal((await readLease(f.codexHome, native.dispatchId)).nativeAgentId, 'agent-1');
  assert.equal((await observe({event: 'failed'})).decision, 'deny', 'terminal is final');
  const other = await prepare(f, 'arc_reviewer');
  const failedEarly = await recordRoleObservation({context: f.context(), dispatchId: other.dispatchId, event: 'failed', policy: policyWith()});
  assert.equal(failedEarly.decision, 'deny', 'reserved cannot fail');
  await recordRoleObservation({context: f.context(), dispatchId: other.dispatchId, event: 'started', nativeAgentId: 'agent-3', policy: policyWith()});
  const cancelled = await recordRoleObservation({context: f.context(), dispatchId: other.dispatchId, event: 'cancelled', policy: policyWith()});
  assert.equal(cancelled.routeStatus, 'cancelled');
  const bridge = await prepare(f, 'arc_planner');
  assert.equal((await recordRoleObservation({context: f.context(), dispatchId: bridge.dispatchId, event: 'started', nativeAgentId: 'x', policy: policyWith()})).decision, 'deny', 'bridge takes no native event');
  for (const waitMs of [-1, 540001, 1.5, '5']) assert.equal((await recordRoleObservation({context: f.context(), dispatchId: bridge.dispatchId, waitMs, policy: policyWith()})).decision, 'deny', String(waitMs));
  assert.equal((await recordRoleObservation({context: f.context({workflowId: 'other-wf'}), dispatchId: bridge.dispatchId, policy: policyWith()})).decision, 'deny', 'another workflow cannot observe it');
});

test('cwd in a subdirectory uses the worktree root for -C and snapshots', async t => {
  const f = await setup(t);
  await fs.mkdir(path.join(f.cwd, 'sub/deeper'), {recursive: true});
  await f.codex.setScenario(codexOk(f, 50, {writes: [{path: path.join(f.cwd, 'top.txt'), content: 'outside the subdirectory\n'}]}));
  const context = f.context({cwd: path.join(f.cwd, 'sub/deeper')});
  const prepared = await prepare(f, 'arc_planner', {context});
  const started = await run(f, prepared.dispatchId, 'x', {context});
  assert.equal(started.decision, 'allow', JSON.stringify(started.reasons));
  const done = await settle(f, prepared.dispatchId, {context});
  const [record] = await records(f.codex);
  assert.equal(record.argv[record.argv.indexOf('-C') + 1], f.cwd);
  assert.equal(record.cwd, f.cwd);
  assert.equal(done.routeStatus, 'failed');
  assert.deepEqual(codes(done), ['permission_violation_observed']);
  assert.ok(done.resultPath.startsWith(path.join(f.cwd, '.git/arc/workflows/wf-1/dispatches/')));
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(artifactOf({resultPath: done.resultPath}), 'record.json'), 'utf8')).violations.changedPaths, ['top.txt']);
});

test('installed cli maps run-dispatch and observe results to exit codes and validates exact keys', async t => {
  const f = await setup(t, {roles: {arc_planner: 'codex'}});
  await f.codex.setScenario(codexOk(f, 60));
  const base = {hostPlatform: 'claude', executionEnvironment: 'claude-cli'};
  const prepared = await prepare(f, 'arc_planner');
  const extraKey = await runCli(f, 'run-dispatch', {...base, dispatchId: prepared.dispatchId, brief: 'x', extra: 1});
  assert.equal(extraKey.code, 2);
  assert.deepEqual(codes(extraKey.json), ['invalid_request']);
  const missing = await runCli(f, 'run-dispatch', {...base, dispatchId: prepared.dispatchId});
  assert.equal(missing.code, 2);
  const unknownObserve = await runCli(f, 'observe', {...base, dispatchId: prepared.dispatchId, nope: 1});
  assert.equal(unknownObserve.code, 2);
  assert.equal((await records(f.codex)).length, 0);
  const started = await runCli(f, 'run-dispatch', {...base, dispatchId: prepared.dispatchId, brief: 'x'});
  assert.equal(started.code, 0, started.stderr);
  assert.equal(started.json.routeStatus, 'starting');
  assert.equal(started.json.workflowId, 'wf-1');
  let observed;
  for (const end = Date.now() + 40000; ;) { observed = await runCli(f, 'observe', {...base, dispatchId: prepared.dispatchId, waitMs: 2000}); if (TERMINAL.includes(observed.json.routeStatus) || Date.now() > end) break; }
  assert.equal(observed.code, 0);
  assert.equal(observed.json.routeStatus, 'completed');
  await f.codex.setScenario({events: codexEvents(THREAD(61), [{type: 'turn.failed', error: {message: 'x'}}]), exitCode: 1, writes: [rolloutFile(f, THREAD(61))]});
  const second = await prepare(f, 'arc_planner');
  await runCli(f, 'run-dispatch', {...base, dispatchId: second.dispatchId, brief: 'x'});
  for (const end = Date.now() + 40000; ;) { observed = await runCli(f, 'observe', {...base, dispatchId: second.dispatchId, waitMs: 2000}); if (TERMINAL.includes(observed.json.routeStatus) || Date.now() > end) break; }
  assert.equal(observed.json.routeStatus, 'failed');
  assert.equal(observed.code, 3);
});

test('store heartbeat and cancel marker files stay out of lease listings and are written without the lock', async t => {
  const f = await setup(t);
  const prepared = await prepare(f, 'arc_planner');
  assert.equal(await readHeartbeat(f.codexHome, prepared.dispatchId), null);
  await writeHeartbeat(f.codexHome, prepared.dispatchId, {at: 1234, pid: 42});
  assert.deepEqual(await readHeartbeat(f.codexHome, prepared.dispatchId), {at: 1234, pid: 42});
  assert.equal(await cancelRequested(f.codexHome, prepared.dispatchId), false);
  await requestCancel(f.codexHome, prepared.dispatchId);
  assert.equal(await cancelRequested(f.codexHome, prepared.dispatchId), true);
  assert.deepEqual((await listLeases(f.codexHome)).map(lease => lease.dispatchId), [prepared.dispatchId]);
  assert.equal(await mode(path.join(dispatchDirectory(f.codexHome), `${prepared.dispatchId}.heartbeat.json`)), 0o600);
});

test('cancel marker stops the child group and the supervisor records cancelled only after the exit is observed', async t => {
  const f = await setup(t);
  await f.codex.setScenario({...codexOk(f, 70), hang: true});
  const prepared = await prepare(f, 'arc_planner');
  await run(f, prepared.dispatchId, 'x', {startSupervisor: startInProcess(f)});
  const finished = runSupervisor({codexHome: f.codexHome, dispatchId: prepared.dispatchId, cwd: f.cwd, userHome: f.userHome, env: f.env, graceMs: 300, heartbeatMs: 100});
  for (const end = Date.now() + 20000; (await readLease(f.codexHome, prepared.dispatchId)).state !== 'running' && Date.now() < end;) await sleep(50);
  await requestCancel(f.codexHome, prepared.dispatchId);
  await finished;
  const lease = await readLease(f.codexHome, prepared.dispatchId);
  assert.equal(lease.state, 'cancelled');
  assert.deepEqual(lease.reasons, []);
  assert.equal(alive(lease.child.pid), false);
});

// Leader dies on SIGTERM at once while a grandchild ignores SIGTERM: only the group SIGKILL after the grace period removes it.
async function installStubbornGrandchild(f, gcFile) {
  const script = `#!${process.execPath}
const cp=require('node:child_process'),fs=require('node:fs');
const args=process.argv.slice(2);
if(args[0]==='login'){process.stdout.write('Logged in');process.exit(0);}
if(args.length===1&&args[0]==='--version'){process.stdout.write('codex-cli 0.167.0');process.exit(0);}
fs.readFileSync(0);
const gc=cp.spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'ignore'});
fs.writeFileSync(${JSON.stringify(gcFile)},String(gc.pid));
process.stdout.write(JSON.stringify({type:'thread.started',thread_id:${JSON.stringify(THREAD(80))}})+'\\n');
setInterval(()=>{},1000);
`;
  await fs.writeFile(path.join(f.binDir, 'codex'), script, {mode: 0o755});
  await fs.mkdir(path.join(f.codexHome, 'sessions/2026/11/10'), {recursive: true});
  const rollout = rolloutFile(f, THREAD(80));
  await fs.writeFile(rollout.path, rollout.content);
}
for (const path_ of ['timeout', 'cancel']) {
  test(`${path_}: grandchild ignoring SIGTERM is killed after the leader already exited, and the terminal state follows the group exit`, async t => {
    const f = await setup(t);
    const gcFile = path.join(f.base, 'gc.pid');
    await installStubbornGrandchild(f, gcFile);
    const prepared = await prepare(f, 'arc_planner');
    await run(f, prepared.dispatchId, 'x', {startSupervisor: startInProcess(f)});
    const finished = runSupervisor({codexHome: f.codexHome, dispatchId: prepared.dispatchId, cwd: f.cwd, userHome: f.userHome, env: f.env, timeoutMs: path_ === 'timeout' ? 800 : 600000, graceMs: 400, heartbeatMs: 100});
    if (path_ === 'cancel') {
      for (const end = Date.now() + 20000; (await readLease(f.codexHome, prepared.dispatchId)).state !== 'running' && Date.now() < end;) await sleep(50);
      for (const end = Date.now() + 5000; !(await fs.readFile(gcFile, 'utf8').catch(() => '')) && Date.now() < end;) await sleep(50);
      await requestCancel(f.codexHome, prepared.dispatchId);
    }
    await finished;
    const lease = await readLease(f.codexHome, prepared.dispatchId);
    const gc = Number(await fs.readFile(gcFile, 'utf8'));
    t.after(() => { try { process.kill(gc, 'SIGKILL'); } catch { /* gone */ } });
    assert.equal(alive(gc), false, 'grandchild must be gone before the terminal state is recorded');
    assert.equal(lease.state, path_ === 'timeout' ? 'failed' : 'cancelled');
    assert.deepEqual(lease.reasons.map(reason => reason.code), path_ === 'timeout' ? ['timeout'] : []);
  });
}

test('missing session id with a result event records unknown execution_identity_unverified and keeps the slot and resultPath', async t => {
  const f = await setup(t, {limits: {total: 100, concurrent: 1}});
  await f.codex.setScenario({events: [{type: 'turn.completed'}], outputFile: 'RESULT WITHOUT IDENTITY'});
  const prepared = await prepare(f, 'arc_planner');
  await run(f, prepared.dispatchId);
  const done = await settle(f, prepared.dispatchId);
  assert.equal(done.routeStatus, 'unknown');
  assert.equal(done.decision, 'hold');
  assert.deepEqual(codes(done), ['execution_identity_unverified']);
  assert.equal(await fs.readFile(done.resultPath, 'utf8'), 'RESULT WITHOUT IDENTITY');
  const next = await prepareRoleDispatch({context: f.context(), assignment: {role: 'arc_planner', requestId: nextId(), taskId: nextId()}, expectedRevision: f.revision, policy: policyWith()});
  assert.ok(codes(next).includes('capacity_exhausted'), 'unknown keeps the slot');
});

test('Claude init permissionMode mismatch and mcp tool exposure fail permission_scope_mismatch; Codex approval_policy mismatch too', async t => {
  const f = await setup(t, {roles: {arc_scouter: 'claude', arc_planner: 'codex'}, hostPlatform: 'codex'});
  const tools = claudeTools(f, 'scouter');
  const gates = policyWith(hostClaudeGates);
  for (const init of [claudeInit(tools, {permissionMode: 'bypassPermissions'}), claudeInit([...tools, 'mcp__srv__tool'])]) {
    await f.claude.setScenario({events: [init], hang: true});
    const prepared = await prepare(f, 'arc_scouter', {policy: gates, context: f.context({hostPlatform: 'codex', executionEnvironment: 'codex-cli'})});
    await run(f, prepared.dispatchId, 'x', {context: f.context({hostPlatform: 'codex', executionEnvironment: 'codex-cli'})});
    const done = await settle(f, prepared.dispatchId, {context: f.context({hostPlatform: 'codex', executionEnvironment: 'codex-cli'})});
    assert.equal(done.routeStatus, 'failed');
    assert.equal(codes(done)[0], 'permission_scope_mismatch');
  }
});

test('Codex turn_context approval_policy mismatch fails permission_scope_mismatch', async t => {
  const f = await setup(t);
  await f.codex.setScenario({...codexOk(f, 81, {}, {sandbox: 'read-only', approval: 'on-request'}), hang: true});
  const prepared = await prepare(f, 'arc_planner');
  await run(f, prepared.dispatchId);
  const done = await settle(f, prepared.dispatchId);
  assert.equal(done.routeStatus, 'failed');
  assert.equal(codes(done)[0], 'permission_scope_mismatch');
});

for (const survives of [false, true]) {
  test(`post-spawn exception ${survives ? 'with a surviving child records unknown' : 'with a stopped child records failed'} in record.json with spawned and childPid`, async t => {
    const f = await setup(t);
    await f.codex.setScenario({...codexOk(f, survives ? 91 : 90), hang: true});
    const prepared = await prepare(f, 'arc_planner');
    await run(f, prepared.dispatchId, 'x', {startSupervisor: startInProcess(f)});
    let spawnedPid;
    await runSupervisor({codexHome: f.codexHome, dispatchId: prepared.dispatchId, cwd: f.cwd, userHome: f.userHome, env: f.env, graceMs: 200, heartbeatMs: 100,
      afterSpawn: async child => { spawnedPid = child.pid; throw Error('injected'); }, ...(survives ? {signalGroup: () => {}} : {})});
    const lease = await readLease(f.codexHome, prepared.dispatchId);
    const record = JSON.parse(await fs.readFile(path.join(dirOf(f, prepared.dispatchId), 'record.json'), 'utf8'));
    assert.equal(await mode(path.join(dirOf(f, prepared.dispatchId), 'record.json')), 0o600);
    assert.equal(record.spawned, true);
    assert.equal(record.childPid, spawnedPid);
    t.after(() => { try { process.kill(-spawnedPid, 'SIGKILL'); } catch { /* gone */ } });
    if (survives) {
      assert.equal(lease.state, 'unknown');
      assert.equal(record.state, 'unknown');
      assert.deepEqual(record.reasons, ['execution_failed', 'terminal_state_unverified']);
      assert.deepEqual(lease.reasons.map(r => r.code), ['execution_failed', 'terminal_state_unverified']);
      assert.equal(alive(record.childPid), true);
      process.kill(-record.childPid, 'SIGKILL');
    } else {
      assert.equal(lease.state, 'failed');
      assert.equal(record.state, 'failed');
      assert.deepEqual(record.reasons, ['execution_failed']);
      assert.equal(alive(record.childPid), false);
    }
  });
}

// Leader exits on its own (exit 0 after turn.completed) while a grandchild keeps running in the process group.
async function installOrphaningCodex(f, {gcFile, readyFile, termWrite = null, ignoreTerm = false, thread = 90}) {
  const gcSource = `${ignoreTerm ? "process.on('SIGTERM',()=>{});" : ''}${termWrite ? `process.on('SIGTERM',()=>{require('fs').writeFileSync(${JSON.stringify(termWrite)},'late');process.exit(0)});` : ''}require('fs').writeFileSync(${JSON.stringify(readyFile)},'1');setInterval(()=>{},1000);`;
  const script = `#!${process.execPath}
const cp=require('node:child_process'),fs=require('node:fs');
const args=process.argv.slice(2);
if(args[0]==='login'){process.stdout.write('Logged in');process.exit(0);}
if(args.length===1&&args[0]==='--version'){process.stdout.write('codex-cli 0.167.0');process.exit(0);}
fs.readFileSync(0);
const at=args.indexOf('-o');if(at>=0)fs.writeFileSync(args[at+1],'RESULT TEXT');
const gc=cp.spawn(process.execPath,['-e',${JSON.stringify(gcSource)}],{stdio:'ignore'});
gc.unref();fs.writeFileSync(${JSON.stringify(gcFile)},String(gc.pid));
while(!fs.existsSync(${JSON.stringify(readyFile)}))Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,20);
process.stdout.write(JSON.stringify({type:'thread.started',thread_id:${JSON.stringify(THREAD(thread))}})+'\\n'+JSON.stringify({type:'turn.completed'})+'\\n');
`;
  await fs.writeFile(path.join(f.binDir, 'codex'), script, {mode: 0o755});
  const rollout = rolloutFile(f, THREAD(thread));
  await fs.mkdir(path.dirname(rollout.path), {recursive: true});
  await fs.writeFile(rollout.path, rollout.content);
}
const runOrphanDispatch = async (f, extra = {}) => {
  const prepared = await prepare(f, 'arc_planner');
  await run(f, prepared.dispatchId, 'x', {startSupervisor: startInProcess(f)});
  await runSupervisor({codexHome: f.codexHome, dispatchId: prepared.dispatchId, cwd: f.cwd, userHome: f.userHome, env: f.env, graceMs: 300, heartbeatMs: 100, ...extra});
  return prepared.dispatchId;
};
const recordOf = async (f, id) => JSON.parse(await fs.readFile(path.join(f.base, 'repo/.git/arc/workflows/wf-1/dispatches', id, 'record.json'), 'utf8'));

test('a leader that exits by itself leaves no grandchild: the group is reaped, the lease completes and the record notes orphanGroupReaped', async t => {
  const f = await setup(t);
  const gcFile = path.join(f.base, 'gc.pid');
  await installOrphaningCodex(f, {gcFile, readyFile: path.join(f.base, 'ready')});
  const id = await runOrphanDispatch(f);
  const gc = Number(await fs.readFile(gcFile, 'utf8'));
  t.after(() => { try { process.kill(gc, 'SIGKILL'); } catch { /* gone */ } });
  assert.equal(alive(gc), false, 'grandchild is reaped before the terminal state');
  const lease = await readLease(f.codexHome, id);
  assert.equal(lease.state, 'completed', JSON.stringify(lease.reasons));
  const record = await recordOf(f, id);
  assert.equal(record.orphanGroupReaped, true);
  assert.equal(record.state, 'completed');
});

test('the post-run snapshot is taken after the orphaned group is reaped', async t => {
  const f = await setup(t);
  const gcFile = path.join(f.base, 'gc.pid');
  await installOrphaningCodex(f, {gcFile, readyFile: path.join(f.base, 'ready'), termWrite: path.join(f.cwd, 'late-write.txt')});
  const id = await runOrphanDispatch(f);
  const lease = await readLease(f.codexHome, id);
  assert.equal(lease.state, 'failed');
  assert.deepEqual(lease.reasons.map(reason => reason.code), ['permission_violation_observed']);
  const record = await recordOf(f, id);
  assert.deepEqual(record.violations.changedPaths, ['late-write.txt']);
  assert.equal(record.orphanGroupReaped, true);
});

test('an orphaned group that cannot be reaped leaves unknown terminal_state_unverified and keeps the slot', async t => {
  const f = await setup(t);
  const gcFile = path.join(f.base, 'gc.pid');
  await installOrphaningCodex(f, {gcFile, readyFile: path.join(f.base, 'ready'), ignoreTerm: true});
  const id = await runOrphanDispatch(f, {signalGroup: () => {}, graceMs: 100});
  const gc = Number(await fs.readFile(gcFile, 'utf8'));
  t.after(() => { try { process.kill(gc, 'SIGKILL'); } catch { /* gone */ } });
  const lease = await readLease(f.codexHome, id);
  assert.equal(lease.state, 'unknown');
  assert.ok(lease.reasons.some(reason => reason.code === 'terminal_state_unverified'));
  assert.ok(NON_TERMINAL.includes(lease.state));
});

test('branch and tag creation by a role fails permission_violation_observed and the record names refsChanged', async t => {
  const f = await setup(t, {roles: {arc_planner: 'codex', arc_implementer: 'codex'}});
  for (const [n, args] of [[91, ['branch', 'created-by-role']], [92, ['tag', 'tag-by-role']]]) {
    const script = `#!${process.execPath}
const cp=require('node:child_process'),fs=require('node:fs');
const args=process.argv.slice(2);
if(args[0]==='login'){process.stdout.write('Logged in');process.exit(0);}
if(args.length===1&&args[0]==='--version'){process.stdout.write('codex-cli 0.167.0');process.exit(0);}
fs.readFileSync(0);
const at=args.indexOf('-o');if(at>=0)fs.writeFileSync(args[at+1],'RESULT TEXT');
const r=cp.spawnSync('git',${JSON.stringify(args)},{cwd:process.cwd()});if(r.status!==0)process.exit(9);
process.stdout.write(JSON.stringify({type:'thread.started',thread_id:${JSON.stringify(THREAD(n))}})+'\\n'+JSON.stringify({type:'turn.completed'})+'\\n');
`;
    await fs.writeFile(path.join(f.binDir, 'codex'), script, {mode: 0o755});
    const rollout = rolloutFile(f, THREAD(n), {sandbox: 'workspace-write'});
    await fs.mkdir(path.dirname(rollout.path), {recursive: true}); await fs.writeFile(rollout.path, rollout.content);
    const prepared = await prepare(f, 'arc_implementer');
    await run(f, prepared.dispatchId);
    const done = await settle(f, prepared.dispatchId);
    assert.equal(done.routeStatus, 'failed', args.join(' ') + JSON.stringify(done.reasons));
    assert.deepEqual(codes(done), ['permission_violation_observed']);
    const record = await recordOf(f, prepared.dispatchId);
    assert.equal(record.violations.refsChanged, true);
    assert.equal(record.violations.headChanged, false);
  }
});

test('routing commands are denied inside a bridge child (ARC_BRIDGE_CHILD set) and nothing is reserved or started', async t => {
  const f = await setup(t);
  const base = {hostPlatform: 'claude', executionEnvironment: 'claude-cli'};
  const inputs = {'routing-status': base, 'prepare-dispatch': {...base, role: 'arc_planner', expectedRevision: f.revision, requestId: 'bc-1', taskId: 'bc-t'}, 'run-dispatch': {...base, dispatchId: 'nope', brief: 'x'}, observe: {...base, dispatchId: 'nope'}, resume: {...base, dispatchId: 'nope', brief: 'x'}, cancel: {...base, dispatchId: 'nope'}};
  for (const [command, input] of Object.entries(inputs)) {
    let out = '';
    const code = await runWorkflowCommand([command, '--cwd', f.cwd, '--workflow', 'wf-1', '--input', '-'], {output: {write: chunk => { out += chunk; }}, input: JSON.stringify(input), env: {...f.env, ARC_BRIDGE_CHILD: 'some-dispatch'}});
    const json = JSON.parse(out.trim());
    assert.equal(code, 2, command);
    assert.equal(json.decision, 'deny', command);
    assert.match(json.message, /bridge child/i);
  }
  assert.deepEqual(await listLeases(f.codexHome), []);
});
