import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {createRoutingFixture} from './role-fixtures.mjs';
import {DEFAULT_POLICY} from '../../lib/runtime/role-dispatch-policy.mjs';
import {readLease, writeLease, cancelRequested, listLeases} from '../../lib/runtime/role-dispatch-store.mjs';
import {prepareRoleDispatch} from '../../lib/runtime/role-routing.mjs';
import {runBridgeDispatch, recordRoleObservation, resumeRoleDispatch, cancelRoleDispatch} from '../../lib/runtime/role-bridge.mjs';
import {runSupervisor, processStartTime} from '../../lib/runtime/role-supervisor.mjs';
import {parseCompositeProfile} from '../../lib/runtime/role-bridge-args.mjs';
import {serializeRoleRoutingConfig} from '../../lib/runtime/role-routing-config.mjs';
import {runWorkflowCommand} from '../../lib/runtime/command.mjs';

const TERMINAL = ['completed', 'failed', 'cancelled'];
const policyWith = (over = {}) => ({...DEFAULT_POLICY, probeTimeoutMs: 10000, lockRetryMs: 30000, ...over, gates: {...DEFAULT_POLICY.gates, ...over.gates}});
const hostClaudeGates = {gates: {G2: 'pass'}};
const codes = result => result.reasons.map(reason => reason.code);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let counter = 0;
const nextId = () => { counter += 1; return `s${counter}`; };
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const waitDead = async (pid, ms = 5000) => { const end = Date.now() + ms; while (alive(pid) && Date.now() < end) await sleep(50); return !alive(pid); };

const bases = [];
const cleanup = ctx => {
  if (!ctx.f) return;
  spawnSync('pkill', ['-KILL', '-f', ctx.f.base]);
  for (const pid of ctx.pids) { try { process.kill(-pid, 'SIGKILL'); } catch { /* gone */ } try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
};
test.after(() => {
  const list = spawnSync('ps', ['-axo', 'pid=,command='], {encoding: 'utf8'}).stdout.split('\n').filter(line => bases.some(base => line.includes(base)) && !line.includes('ps -axo'));
  assert.deepEqual(list, [], 'leftover fixture processes');
});

async function setup(t, {roles = {arc_planner: 'codex'}, hostPlatform = 'claude', limits} = {}) {
  const ctx = {pids: []};
  t.after(() => cleanup(ctx));
  const f = ctx.f = await createRoutingFixture(t, {roles, hostPlatform, ...(limits ? {limits} : {})});
  bases.push(f.base);
  f.ctx = ctx;
  for (const [name, version] of [['codex', 'codex-cli 0.167.0'], ['claude', '2.1.322 (Claude Code)']]) {
    const cli = f[name] = await f.cli(name, {version}), set = cli.setScenario;
    cli.setScenario = value => set({version, ...value});
  }
  return f;
}
const claudeSetup = t => setup(t, {roles: {arc_scouter: 'claude'}, hostPlatform: 'codex'});
const prepare = async (f, role, policy = policyWith()) => {
  const result = await prepareRoleDispatch({context: f.context(), assignment: {role, requestId: nextId(), taskId: nextId()}, expectedRevision: f.revision, policy});
  assert.equal(result.decision, 'allow', JSON.stringify(result.reasons));
  return result;
};
const run = (f, dispatchId, brief = 'do the task', extra = {}) => runBridgeDispatch({context: f.context(), dispatchId, brief, policy: policyWith(), ...extra});
const resume = (f, dispatchId, brief = 'continue', extra = {}) => resumeRoleDispatch({context: f.context(), dispatchId, brief, policy: policyWith(hostClaudeGates), ...extra});
const cancel = (f, dispatchId, extra = {}) => cancelRoleDispatch({context: f.context(), dispatchId, policy: policyWith({cancelGraceMs: 200}), ...extra});
async function settle(f, dispatchId, {ms = 40000} = {}) {
  const end = Date.now() + ms;
  for (;;) {
    const result = await recordRoleObservation({context: f.context(), dispatchId, waitMs: 2000, policy: policyWith()});
    if ([...TERMINAL, 'unknown'].includes(result.routeStatus) || Date.now() > end) return result;
  }
}
async function waitState(f, dispatchId, state, ms = 20000) {
  for (const end = Date.now() + ms; (await readLease(f.codexHome, dispatchId)).state !== state && Date.now() < end;) await sleep(50);
  return readLease(f.codexHome, dispatchId);
}
const records = async cli => (await fs.readFile(cli.recordPath, 'utf8').catch(() => '')).split('\n').filter(Boolean).map(line => JSON.parse(line));
const startInProcess = () => async () => ({pid: process.pid, startTime: processStartTime(process.pid)});
const THREAD = n => `01a1c596-43f9-77a0-b0bb-${String(n).padStart(12, '0')}`;
const rolloutFile = (f, thread) => ({
  path: path.join(f.codexHome, 'sessions/2026/11/10', `rollout-2026-11-10T00-00-00-${thread}.jsonl`),
  content: [{type: 'session_meta', payload: {id: thread}}, {type: 'turn_context', payload: {model: 'gpt-6-luna', effort: 'low', approval_policy: 'never', sandbox_policy: {type: 'read-only'}}}].map(line => JSON.stringify(line)).join('\n') + '\n'
});
const codexOk = (f, n, extra = {}) => ({events: [{type: 'thread.started', thread_id: THREAD(n)}, {type: 'turn.completed'}], outputFile: 'RESULT TEXT', writes: [rolloutFile(f, THREAD(n))], ...extra});
const claudeTools = f => parseCompositeProfile('claude', readFileSync(path.join(f.claudeHome, 'agents/arc-routing-scouter.md'))).tools;
const claudeInit = (tools, over = {}) => ({type: 'system', subtype: 'init', session_id: 'sess-1', tools, model: 'claude-haiku-5-5', permissionMode: 'default', ...over});
const claudeResult = (text = 'claude done') => ({type: 'result', subtype: 'success', is_error: false, session_id: 'sess-1', result: text});
const transcript = f => ({path: path.join(f.claudeHome, 'projects/proj/sess-1.jsonl'), content: JSON.stringify({type: 'assistant', output_config: {effort: 'low'}}) + '\n'});
const dirOf = (f, dispatchId) => path.join(f.cwd, '.git/arc/workflows/wf-1/dispatches', dispatchId);
const mode = async file => (await fs.stat(file)).mode & 0o777;
const flag = (argv, name) => argv[argv.indexOf(name) + 1];

async function completedClaude(t) {
  const f = await claudeSetup(t);
  await f.claude.setScenario({events: [claudeInit(claudeTools(f)), claudeResult('first')], writes: [transcript(f)]});
  const prepared = await prepare(f, 'arc_scouter', policyWith(hostClaudeGates));
  await run(f, prepared.dispatchId, 'first brief');
  const done = await settle(f, prepared.dispatchId);
  assert.equal(done.routeStatus, 'completed', JSON.stringify(done.reasons));
  return {f, id: prepared.dispatchId};
}

test('resume of completed Claude dispatch runs claude -p --resume <sid> with all flags re-specified and writes segments/1', async t => {
  const {f, id} = await completedClaude(t);
  await f.claude.setScenario({events: [claudeInit(claudeTools(f)), claudeResult('second')], writes: [transcript(f)]});
  const started = await resume(f, id, 'second brief — 한글');
  assert.equal(started.decision, 'allow', JSON.stringify(started.reasons));
  assert.equal(started.routeStatus, 'starting');
  assert.equal(started.segment, 1);
  const done = await settle(f, id);
  assert.equal(done.routeStatus, 'completed', JSON.stringify(done.reasons));
  const [first, second] = (await records(f.claude)).filter(record => record.argv.includes('-p'));
  assert.equal(first.argv.includes('--resume'), false);
  assert.equal(flag(second.argv, '--resume'), 'sess-1');
  assert.equal(second.argv[0], '-p');
  for (const name of ['--model', '--effort', '--append-system-prompt', '--tools', '--permission-mode']) assert.equal(flag(second.argv, name), flag(first.argv, name), name);
  assert.equal(flag(second.argv, '--effort'), 'low');
  assert.equal(second.stdin, 'second brief — 한글');
  assert.equal(second.argv.some(arg => arg.includes('second brief')), false);
  const segment = path.join(dirOf(f, id), 'segments/1');
  assert.equal(done.segment ?? (await readLease(f.codexHome, id)).segment, 1);
  const lease = await readLease(f.codexHome, id);
  assert.equal(lease.segment, 1);
  assert.equal(lease.resultPath, path.join(segment, 'result.md'));
  assert.equal(await fs.readFile(path.join(segment, 'result.md'), 'utf8'), 'second');
  assert.equal(await fs.readFile(path.join(segment, 'brief.md'), 'utf8'), 'second brief — 한글');
  for (const name of ['brief.md', 'events.jsonl', 'result.md']) assert.equal(await mode(path.join(segment, name)), 0o600, name);
  assert.equal(await fs.readFile(path.join(dirOf(f, id), 'result.md'), 'utf8'), 'first', 'segment 0 artifacts stay');
  assert.equal(lease.sessionId, 'sess-1');
});

test('resume of failed Codex dispatch runs exec resume <tid> with -m, model_reasoning_effort and sandbox_mode, without -C or --sandbox', async t => {
  const f = await setup(t);
  await f.codex.setScenario({events: [{type: 'thread.started', thread_id: THREAD(1)}], exitCode: 1, writes: [rolloutFile(f, THREAD(1))]});
  const prepared = await prepare(f, 'arc_planner');
  await run(f, prepared.dispatchId, 'first');
  const failed = await settle(f, prepared.dispatchId);
  assert.equal(failed.routeStatus, 'failed');
  assert.equal((await readLease(f.codexHome, prepared.dispatchId)).sessionId, THREAD(1));
  await f.codex.setScenario(codexOk(f, 1));
  const started = await resume(f, prepared.dispatchId, 'again');
  assert.equal(started.decision, 'allow', JSON.stringify(started.reasons));
  const done = await settle(f, prepared.dispatchId);
  assert.equal(done.routeStatus, 'completed', JSON.stringify(done.reasons));
  const second = (await records(f.codex)).at(-1);
  assert.deepEqual(second.argv.slice(0, 4), ['exec', 'resume', THREAD(1), '--json']);
  assert.equal(flag(second.argv, '-m'), 'gpt-6-luna');
  assert.ok(second.argv.includes('model_reasoning_effort="low"'));
  assert.ok(second.argv.includes('sandbox_mode="read-only"'));
  assert.equal(second.argv.includes('-C'), false);
  assert.equal(second.argv.includes('--sandbox'), false);
  assert.equal(second.argv.at(-1), '-');
  assert.equal(second.stdin, 'again');
  assert.equal(await fs.realpath(second.cwd), await fs.realpath(f.cwd));
  const segment = path.join(dirOf(f, prepared.dispatchId), 'segments/1');
  assert.equal(flag(second.argv, '-o'), path.join(segment, 'result.md'));
  assert.equal(await fs.readFile(path.join(segment, 'result.md'), 'utf8'), 'RESULT TEXT');
  assert.equal((await readLease(f.codexHome, prepared.dispatchId)).segment, 1);
});

test('resume is denied for reserved, running, unknown and cancelled; held revision_changed after a new revision is active; held execution_identity_unverified without sessionId', async t => {
  const f = await setup(t);
  await f.codex.setScenario({...codexOk(f, 2), hang: true});
  const reserved = await prepare(f, 'arc_planner');
  const before = (await records(f.codex)).length;
  let result = await resume(f, reserved.dispatchId);
  assert.equal(result.decision, 'deny');
  assert.deepEqual(codes(result), ['invalid_request']);
  const running = await prepare(f, 'arc_planner');
  await run(f, running.dispatchId);
  await waitState(f, running.dispatchId, 'running');
  result = await resume(f, running.dispatchId);
  assert.equal(result.decision, 'deny');
  assert.equal((await cancel(f, running.dispatchId)).routeStatus, 'cancelling');
  assert.equal((await settle(f, running.dispatchId)).routeStatus, 'cancelled');
  result = await resume(f, running.dispatchId);
  assert.equal(result.decision, 'deny', 'cancelled');
  assert.deepEqual(codes(result), ['invalid_request']);
  const unknown = await prepare(f, 'arc_planner');
  await writeLease(f.codexHome, {...(await readLease(f.codexHome, unknown.dispatchId)), state: 'unknown', sessionId: THREAD(2)});
  result = await resume(f, unknown.dispatchId);
  assert.equal(result.decision, 'deny', 'unknown');
  assert.deepEqual(codes(result), ['invalid_request']);
  assert.equal((await records(f.codex)).length, before + 1, 'only the one running child was spawned');

  await f.codex.setScenario(codexOk(f, 3));
  const done = await prepare(f, 'arc_planner');
  await run(f, done.dispatchId);
  assert.equal((await settle(f, done.dispatchId)).routeStatus, 'completed');
  const completed = await readLease(f.codexHome, done.dispatchId), count = (await records(f.codex)).length;
  await writeLease(f.codexHome, {...completed, sessionId: null});
  result = await resume(f, done.dispatchId);
  assert.equal(result.decision, 'hold');
  assert.deepEqual(codes(result), ['execution_identity_unverified']);
  await writeLease(f.codexHome, completed);
  await fs.writeFile(f.activePath, serializeRoleRoutingConfig({...f.config, revision: 'rev-2'}));
  result = await resume(f, done.dispatchId);
  assert.equal(result.decision, 'hold');
  assert.deepEqual(codes(result), ['revision_changed']);
  assert.equal((await records(f.codex)).length, count, 'no child for held or denied resumes');
  assert.equal((await readLease(f.codexHome, done.dispatchId)).state, 'completed');
  await fs.writeFile(f.activePath, serializeRoleRoutingConfig(f.config));
  await f.codex.setScenario({version: '0.1.0'});
  result = await resume(f, done.dispatchId);
  assert.equal(result.decision, 'hold');
  assert.deepEqual(codes(result), ['permission_scope_unverified'], 'CLI version check is applied again');
  assert.equal((await readLease(f.codexHome, done.dispatchId)).segment, 0);
});

test('resume input cannot carry a session id', async t => {
  const {f, id} = await completedClaude(t);
  const count = (await records(f.claude)).length;
  const lines = [];
  const code = await runWorkflowCommand(['resume', '--cwd', f.cwd, '--workflow', 'wf-1', '--input', '-'], {input: JSON.stringify({hostPlatform: 'codex', executionEnvironment: 'codex-cli', dispatchId: id, brief: 'x', sessionId: 'other'}), output: {write: line => lines.push(line)}});
  assert.equal(code, 2);
  const result = JSON.parse(lines.join(''));
  assert.equal(result.decision, 'deny');
  assert.deepEqual(codes(result), ['invalid_request']);
  assert.equal((await records(f.claude)).length, count);
  assert.equal((await readLease(f.codexHome, id)).segment, 0);
});

test('cancel running dispatch sends SIGTERM to the group and records cancelled only after exit', async t => {
  const f = await setup(t);
  const gcFile = path.join(f.base, 'gc.pid');
  await f.codex.setScenario({...codexOk(f, 4), hang: true, grandchild: true, grandchildPidFile: gcFile});
  const prepared = await prepare(f, 'arc_planner');
  await run(f, prepared.dispatchId);
  const running = await waitState(f, prepared.dispatchId, 'running');
  // The fake child writes gc.pid after the supervisor records running; cancel only once the grandchild exists.
  for (const end = Date.now() + 20000; !(await fs.readFile(gcFile, 'utf8').catch(() => '')) && Date.now() < end;) await sleep(25);
  const result = await cancel(f, prepared.dispatchId);
  assert.equal(result.decision, 'allow');
  assert.equal(result.routeStatus, 'cancelling');
  const done = await settle(f, prepared.dispatchId);
  assert.equal(done.routeStatus, 'cancelled', JSON.stringify(done.reasons));
  assert.deepEqual(done.reasons, []);
  assert.equal(alive(running.child.pid), false, 'cancelled is recorded only after the child exit');
  assert.ok(await waitDead(Number(await fs.readFile(gcFile, 'utf8'))), 'grandchild in the group is gone');
  assert.ok(await waitDead((await readLease(f.codexHome, prepared.dispatchId)).supervisor.pid));
});

test('cancel of TERM-ignoring child escalates to SIGKILL after grace', async t => {
  const f = await setup(t);
  await f.codex.setScenario({...codexOk(f, 5), hang: true, ignoreSigterm: true});
  const prepared = await prepare(f, 'arc_planner');
  await run(f, prepared.dispatchId, 'x', {startSupervisor: startInProcess()});
  const finished = runSupervisor({codexHome: f.codexHome, dispatchId: prepared.dispatchId, cwd: f.cwd, userHome: f.userHome, env: f.env, graceMs: 200, heartbeatMs: 100});
  const running = await waitState(f, prepared.dispatchId, 'running');
  const begin = Date.now();
  assert.equal((await cancel(f, prepared.dispatchId)).routeStatus, 'cancelling');
  await sleep(100);
  assert.equal(alive(running.child.pid), true, 'SIGTERM alone does not stop the child');
  await finished;
  const lease = await readLease(f.codexHome, prepared.dispatchId);
  assert.equal(lease.state, 'cancelled');
  assert.equal(alive(lease.child.pid), false);
  assert.ok(Date.now() - begin >= 200, 'KILL only after the grace period');
});

test('cancel is a no-op on terminal and denied on native', async t => {
  const {f, id} = await completedClaude(t);
  const before = await readLease(f.codexHome, id);
  const result = await cancel(f, id);
  assert.equal(result.decision, 'allow');
  assert.equal(result.routeStatus, 'completed');
  assert.deepEqual(await readLease(f.codexHome, id), before, 'terminal lease is not rewritten');
  assert.equal(await cancelRequested(f.codexHome, id), false, 'no cancel marker is left for a terminal dispatch');
  const native = await prepare(f, 'arc_planner');
  const denied = await cancel(f, native.dispatchId);
  assert.equal(denied.decision, 'deny');
  assert.deepEqual(codes(denied), ['invalid_request']);
  assert.equal((await readLease(f.codexHome, native.dispatchId)).state, 'reserved');
  assert.equal((await cancel(f, 'does-not-exist')).decision, 'deny');
});

test('cancel cleans up an orphaned reserved bridge lease under the lock and frees the slot', async t => {
  const f = await setup(t);
  const prepared = await prepare(f, 'arc_planner');
  assert.equal((await readLease(f.codexHome, prepared.dispatchId)).state, 'reserved');
  const result = await cancel(f, prepared.dispatchId);
  assert.equal(result.decision, 'allow');
  assert.equal(result.routeStatus, 'cancelled');
  const lease = await readLease(f.codexHome, prepared.dispatchId);
  assert.equal(lease.state, 'cancelled');
  assert.equal(lease.supervisor, null);
  assert.equal(await cancelRequested(f.codexHome, prepared.dispatchId), false);
  assert.deepEqual((await listLeases(f.codexHome)).filter(item => ['reserved', 'starting', 'running', 'unknown'].includes(item.state)), []);
  assert.equal((await run(f, prepared.dispatchId)).decision, 'deny', 'a cancelled lease cannot be run');
  assert.equal((await records(f.codex)).length, 0);
});

async function unknownLease(f, child) {
  const prepared = await prepare(f, 'arc_planner');
  const lease = await readLease(f.codexHome, prepared.dispatchId);
  await writeLease(f.codexHome, {...lease, state: 'unknown', child, reasons: [{code: 'terminal_state_unverified', releaseCondition: 'x'}]});
  return prepared.dispatchId;
}
const startStray = (f, ignoreTerm = false) => {
  const child = spawn(process.execPath, ['-e', `${ignoreTerm ? "process.on('SIGTERM',()=>{});" : ''}setInterval(()=>{},1000)`, f.base], {detached: true, stdio: 'ignore'});
  f.ctx.pids.push(child.pid); child.unref();
  return child;
};

test('cancel of unknown terminates a live child identified by pid and start time, then records cancelled after the group is gone', async t => {
  const f = await setup(t);
  const child = startStray(f, true);
  await sleep(200);
  const id = await unknownLease(f, {pid: child.pid, startTime: processStartTime(child.pid)});
  const result = await cancel(f, id);
  assert.equal(result.routeStatus, 'cancelled', JSON.stringify(result.reasons));
  assert.equal(result.decision, 'allow');
  assert.equal(alive(child.pid), false);
  assert.equal((await readLease(f.codexHome, id)).state, 'cancelled');
});

test('cancel of unknown keeps unknown when the process cannot be identified, and never signals a reused pid', async t => {
  const f = await setup(t);
  const noChild = await unknownLease(f, null);
  let result = await cancel(f, noChild);
  assert.equal(result.routeStatus, 'unknown');
  assert.equal(result.decision, 'hold');
  assert.equal((await readLease(f.codexHome, noChild)).state, 'unknown');
  const stray = startStray(f);
  await sleep(200);
  const reused = await unknownLease(f, {pid: stray.pid, startTime: 'Mon Jan  1 00:00:00 2001'});
  result = await cancel(f, reused);
  assert.equal(result.routeStatus, 'unknown');
  assert.equal(alive(stray.pid), true, 'a process with a different start time is not signalled');
  assert.equal((await readLease(f.codexHome, reused)).state, 'unknown');
  const gone = await unknownLease(f, {pid: 999999, startTime: 'Mon Jan  1 00:00:00 2001'});
  result = await cancel(f, gone);
  assert.equal(result.routeStatus, 'cancelled', 'an exited pid is observed gone');
});

test('resume checks the bridge concurrency limit under the lock: others + 1 must fit, and the workflow total is not increased', async t => {
  const f = await setup(t, {limits: {total: 100, concurrent: 2}});
  await f.codex.setScenario(codexOk(f, 11));
  const a = await prepare(f, 'arc_planner');
  await run(f, a.dispatchId);
  assert.equal((await settle(f, a.dispatchId)).routeStatus, 'completed');
  const b = await prepare(f, 'arc_planner'), c = await prepare(f, 'arc_planner');
  const count = (await records(f.codex)).length;
  let result = await resume(f, a.dispatchId);
  assert.equal(result.decision, 'hold');
  assert.deepEqual(codes(result), ['capacity_exhausted']);
  assert.equal((await records(f.codex)).length, count, 'no child for a capacity hold');
  const lease = await readLease(f.codexHome, a.dispatchId);
  assert.equal(lease.state, 'completed');
  assert.equal(lease.segment, 0);
  assert.equal((await cancel(f, c.dispatchId)).routeStatus, 'cancelled');
  result = await resume(f, a.dispatchId);
  assert.equal(result.decision, 'allow', JSON.stringify(result.reasons));
  assert.equal((await settle(f, a.dispatchId)).routeStatus, 'completed');
  assert.equal((await readLease(f.codexHome, b.dispatchId)).state, 'reserved');
  const g = await setup(t, {limits: {total: 1, concurrent: 1}});
  await g.codex.setScenario(codexOk(g, 12));
  const only = await prepare(g, 'arc_planner');
  await run(g, only.dispatchId);
  assert.equal((await settle(g, only.dispatchId)).routeStatus, 'completed');
  result = await resume(g, only.dispatchId);
  assert.equal(result.decision, 'allow', 'a follow-up segment of the same dispatch does not count against the workflow total');
  assert.equal((await settle(g, only.dispatchId)).routeStatus, 'completed');
});

test('resume segment whose observed session id differs from the lease is unknown with execution_identity_unverified and keeps the recorded session', async t => {
  const {f, id} = await completedClaude(t);
  await f.claude.setScenario({events: [claudeInit(claudeTools(f), {session_id: 'sess-other'}), claudeResult('second')], writes: [transcript(f)]});
  assert.equal((await resume(f, id)).decision, 'allow');
  const done = await settle(f, id);
  assert.equal(done.routeStatus, 'unknown');
  assert.ok(codes(done).includes('execution_identity_unverified'), JSON.stringify(codes(done)));
  const lease = await readLease(f.codexHome, id);
  assert.equal(lease.sessionId, 'sess-1');
  assert.equal(lease.state, 'unknown');
  assert.equal(lease.claims.identity.level, 'unverified');
  assert.equal(alive(lease.child.pid), false);
  const g = await setup(t);
  await g.codex.setScenario(codexOk(g, 13));
  const p = await prepare(g, 'arc_planner');
  await run(g, p.dispatchId);
  assert.equal((await settle(g, p.dispatchId)).routeStatus, 'completed');
  await g.codex.setScenario(codexOk(g, 14));
  assert.equal((await resume(g, p.dispatchId)).decision, 'allow');
  const second = await settle(g, p.dispatchId);
  assert.equal(second.routeStatus, 'unknown');
  assert.ok(codes(second).includes('execution_identity_unverified'));
  assert.equal((await readLease(g.codexHome, p.dispatchId)).sessionId, THREAD(13));
});

test('resume of a Codex Scouter dispatch passes top-level --search before exec; Planner resume has none', async t => {
  const f = await setup(t, {roles: {arc_scouter: 'codex', arc_planner: 'codex'}});
  await f.codex.setScenario(codexOk(f, 21));
  const scouter = await prepare(f, 'arc_scouter');
  await run(f, scouter.dispatchId);
  assert.equal((await settle(f, scouter.dispatchId)).routeStatus, 'completed');
  assert.equal((await resume(f, scouter.dispatchId)).decision, 'allow');
  assert.equal((await settle(f, scouter.dispatchId)).routeStatus, 'completed');
  const [first, second] = await records(f.codex);
  assert.equal(first.argv[0], '--search');
  assert.deepEqual(second.argv.slice(0, 5), ['--search', 'exec', 'resume', THREAD(21), '--json']);
  await f.codex.setScenario(codexOk(f, 22));
  const planner = await prepare(f, 'arc_planner');
  await run(f, planner.dispatchId);
  assert.equal((await settle(f, planner.dispatchId)).routeStatus, 'completed');
  assert.equal((await resume(f, planner.dispatchId)).decision, 'allow');
  assert.equal((await settle(f, planner.dispatchId)).routeStatus, 'completed');
  const last = (await records(f.codex)).at(-1);
  assert.equal(last.argv.includes('--search'), false);
  assert.deepEqual(last.argv.slice(0, 4), ['exec', 'resume', THREAD(22), '--json']);
});

test('cancel in starting: a live supervisor gets the marker and records cancelled after the child exit; a dead supervisor without child stays starting', async t => {
  const f = await setup(t);
  await f.codex.setScenario({...codexOk(f, 23), hang: true});
  const prepared = await prepare(f, 'arc_planner');
  await run(f, prepared.dispatchId, 'x', {startSupervisor: startInProcess()});
  const starting = await readLease(f.codexHome, prepared.dispatchId);
  assert.equal(starting.state, 'starting');
  assert.equal(starting.child, null);
  const result = await cancel(f, prepared.dispatchId);
  assert.equal(result.decision, 'allow');
  assert.equal(result.routeStatus, 'cancelling');
  assert.equal(await cancelRequested(f.codexHome, prepared.dispatchId), true);
  await runSupervisor({codexHome: f.codexHome, dispatchId: prepared.dispatchId, cwd: f.cwd, userHome: f.userHome, env: f.env, graceMs: 200, heartbeatMs: 100});
  const lease = await readLease(f.codexHome, prepared.dispatchId);
  assert.equal(lease.state, 'cancelled');
  assert.deepEqual(lease.reasons, []);
  if (lease.child) assert.equal(alive(lease.child.pid), false);
  const orphan = await prepare(f, 'arc_planner');
  await writeLease(f.codexHome, {...(await readLease(f.codexHome, orphan.dispatchId)), state: 'starting', supervisor: {pid: 999999, startTime: 'Mon Jan  1 00:00:00 2001'}});
  const held = await cancel(f, orphan.dispatchId);
  assert.equal(held.decision, 'hold');
  assert.equal(held.routeStatus, 'starting');
  assert.equal((await readLease(f.codexHome, orphan.dispatchId)).state, 'starting', 'a child that may have started cannot be proven absent');
});
