import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createRoutingFixture, reapFixtureProcesses} from './role-fixtures.mjs';
import {ORIGINAL_PATH, psAvailable, realPs, withPath} from './fixtures/ps-stub.mjs';
import {DEFAULT_POLICY} from '../../lib/runtime/role-dispatch-policy.mjs';
import {prepareRoleDispatch} from '../../lib/runtime/role-routing.mjs';
import {readLease} from '../../lib/runtime/role-dispatch-store.mjs';
import {cancelRoleDispatch, recordRoleObservation, runBridgeDispatch} from '../../lib/runtime/role-bridge.mjs';
import * as supervisor from '../../lib/runtime/role-supervisor.mjs';
import {parseCompositeProfile} from '../../lib/runtime/role-bridge-args.mjs';
import * as geminiProfile from '../../lib/platforms/formats/gemini-markdown.mjs';
import * as grokProfile from '../../lib/platforms/formats/grok-markdown.mjs';

const REAL_PS_SKIP = 'real ps unavailable (sandbox/PATH): identity tests use tests/fixtures/bin/ps stub';
const START = 'Sat Nov 21 12:00:00 2026';
const REUSED = 'Sat Nov 21 12:00:01 2026';
const row = (pid, ppid, pgid = pid, startTime = START) => ({pid, ppid, pgid, startTime});
const ROOT_PID = 80000000;
const root = row(ROOT_PID, process.pid);

test('parses macOS and Linux process rows and discards malformed lines', () => {
  assert.equal(typeof supervisor.parseProcessTable, 'function', 'parseProcessTable export is required');
  const stdout = [
    ' 101   1 101 Sat Nov  7 12:00:00 2026',
    ' 202   101 202 Sat Nov 21 12:00:00 2026',
    'bad 101 202 Sat Nov 21 12:00:00 2026',
    '303 202 303 missing date',
    '404 202',
  ].join('\n');
  assert.deepEqual(supervisor.parseProcessTable(stdout), [
    row(101, 1, 101, 'Sat Nov 7 12:00:00 2026'), row(202, 101),
  ]);
});

function tracker() {
  assert.equal(typeof supervisor.createDescendantTracker, 'function', 'createDescendantTracker export is required');
  return supervisor.createDescendantTracker({rootPid: ROOT_PID, rootPgid: ROOT_PID, selfPid: process.pid, limit: 256});
}

test('tracks a reverse-ordered lineage through the original group and retains it after reparenting', () => {
  const tracked = tracker();
  const sameGroup = row(ROOT_PID + 1, ROOT_PID, ROOT_PID);
  const escaped = row(ROOT_PID + 2, sameGroup.pid);
  const deeper = row(ROOT_PID + 3, escaped.pid);
  const unrelated = row(ROOT_PID + 4, 1);
  const escapedPids = () => tracked.escaped().map(({pid}) => pid).sort((a, b) => a - b);
  tracked.update([deeper, unrelated, escaped, sameGroup, root]);
  assert.deepEqual(escapedPids(), [escaped.pid, deeper.pid]);

  tracked.update([row(escaped.pid, 1), row(deeper.pid, 1), unrelated]);
  assert.deepEqual(escapedPids(), [escaped.pid, deeper.pid]);
});

test('excludes the supervisor and its ancestors from escape tracking', () => {
  const tracked = tracker();
  const escaped = row(ROOT_PID + 1, ROOT_PID);
  const ancestor = row(process.ppid, 1, ROOT_PID);
  tracked.update([root, escaped, ancestor, row(process.pid, process.ppid)]);
  tracked.update([row(ancestor.pid, 1), row(process.pid, ancestor.pid), escaped]);
  assert.deepEqual(tracked.escaped().map(({pid}) => pid), [escaped.pid]);
});

test('a reused parent PID does not establish lineage for a new process', () => {
  const tracked = tracker();
  const known = row(ROOT_PID + 1, ROOT_PID);
  tracked.update([root, known]);
  const untracked = row(ROOT_PID + 2, known.pid);
  tracked.update([root, {...known, ppid: 1, startTime: REUSED}, untracked]);
  assert.deepEqual(tracked.entries(), []);
});

test('F5 root identity requires its original parent and group in every sample', () => {
  const tracked = tracker();
  const original = row(ROOT_PID + 1, ROOT_PID);
  tracked.update([root, original]);
  tracked.update([{...root, ppid: 1}, original, row(ROOT_PID + 2, ROOT_PID)]);
  tracked.update([{...root, pgid: ROOT_PID + 3}, original, row(ROOT_PID + 4, ROOT_PID)]);
  assert.deepEqual(tracked.entries().map(entry => entry.pid), [original.pid]);
});

test('a group match alone neither tracks nor signals a process', async () => {
  const tracked = tracker();
  const groupOnly = row(ROOT_PID + 1, 1, ROOT_PID);
  const descendant = row(ROOT_PID + 2, ROOT_PID);
  tracked.update([root, groupOnly, descendant]);
  assert.deepEqual(tracked.entries().map(({pid}) => pid), [descendant.pid]);
  const escapedGroupOnly = {...groupOnly, pgid: groupOnly.pid};
  tracked.update([root, escapedGroupOnly, descendant]);
  const signals = [];
  await supervisor.reapDescendants(tracked.escaped(), {
    sample: async () => [escapedGroupOnly, descendant],
    kill(pid) { signals.push(Math.abs(pid)); },
    graceMs: 0, timeoutMs: 500,
  });
  assert.ok(signals.includes(descendant.pid));
  assert.ok(!signals.includes(groupOnly.pid));
});

test('keeps at most 256 escaped descendants and records truncation', () => {
  const tracked = tracker();
  const children = Array.from({length: 257}, (_, i) => row(ROOT_PID + i + 1, ROOT_PID));
  tracked.update([root, ...children.slice(0, 255)]);
  assert.equal(tracked.truncated, false);
  tracked.update([root, ...children]);
  assert.equal(tracked.escaped().length, 256);
  assert.equal(tracked.truncated, true);

  const untracked = {...children[256], ppid: 1};
  tracked.update([root, children[0], untracked]);
  assert.deepEqual(tracked.escaped(), [children[0]]);
  assert.equal(tracked.truncated, true);
});

test('expired same-group descendants free capacity for a new escaped descendant', () => {
  const tracked = tracker();
  for (let i = 0; i < 300; i++) {
    tracked.update([root, row(ROOT_PID + i + 1, ROOT_PID, ROOT_PID, `start-${i}`)]);
    tracked.update([root]);
  }

  const escaped = row(ROOT_PID + 301, ROOT_PID);
  tracked.update([root, escaped]);
  assert.deepEqual(tracked.escaped(), [escaped]);
  assert.equal(tracked.truncated, false);
});

test('signals only tracked identities that still match before each signal', async () => {
  assert.equal(typeof supervisor.reapDescendants, 'function', 'reapDescendants export is required');
  const tracked = tracker();
  const reusedBeforeTerm = row(ROOT_PID + 1, ROOT_PID);
  const reusedBeforeKill = row(ROOT_PID + 2, ROOT_PID);
  const unrelated = row(ROOT_PID + 3, 1);
  tracked.update([root, reusedBeforeTerm, reusedBeforeKill, unrelated]);
  const replacement = {...reusedBeforeTerm, startTime: REUSED};
  const first = [replacement, reusedBeforeKill, unrelated];
  const later = [replacement, {...reusedBeforeKill, startTime: REUSED}, unrelated];
  let table = first;
  const signals = [];
  await supervisor.reapDescendants(tracked.escaped(), {
    sample: async () => table,
    kill(pid, signal) { signals.push([pid, signal]); table = later; },
    graceMs: 0, timeoutMs: 500,
  });
  assert.deepEqual(signals, [[reusedBeforeKill.pid, 'SIGTERM'], [-reusedBeforeKill.pid, 'SIGTERM']]);
});

test('escalates a surviving group leader and counts EPERM as survived', async () => {
  assert.equal(typeof supervisor.reapDescendants, 'function', 'reapDescendants export is required');
  const exitsOnTerm = row(ROOT_PID + 1, ROOT_PID, ROOT_PID + 9);
  const exitsOnKill = row(ROOT_PID + 2, ROOT_PID);
  const denied = row(ROOT_PID + 3, ROOT_PID, ROOT_PID + 9);
  const alive = new Map([exitsOnTerm, exitsOnKill, denied].map(entry => [entry.pid, entry]));
  const signals = [];
  const result = await supervisor.reapDescendants([...alive.values()], {
    sample: async () => [...alive.values()],
    kill(pid, signal) {
      signals.push([pid, signal]);
      if (pid === denied.pid) throw Object.assign(new Error('not permitted'), {code: 'EPERM'});
      if (pid === exitsOnTerm.pid || (pid === exitsOnKill.pid && signal === 'SIGKILL')) alive.delete(pid);
    },
    graceMs: 0, timeoutMs: 500,
  });
  assert.deepEqual(signals.filter(([pid]) => pid !== denied.pid), [
    [exitsOnTerm.pid, 'SIGTERM'], [exitsOnKill.pid, 'SIGTERM'], [-exitsOnKill.pid, 'SIGTERM'],
    [exitsOnKill.pid, 'SIGKILL'], [-exitsOnKill.pid, 'SIGKILL'],
  ]);
  assert.ok(signals.some(([pid, signal]) => pid === denied.pid && signal === 'SIGTERM'));
  assert.deepEqual(result, {observed: 3, reaped: 2, survived: 1, truncated: false});
});

test('group EPERM after a successful direct signal still counts an exited leader as reaped', async () => {
  const leader = row(ROOT_PID + 1, ROOT_PID);
  let table = [leader];
  let samples = 0;
  const signals = [];
  const result = await supervisor.reapDescendants([leader], {
    sample: async () => { samples++; return table; },
    kill(pid, signal) {
      signals.push([pid, signal]);
      if (pid < 0) throw Object.assign(new Error('group not permitted'), {code: 'EPERM'});
      table = [];
    },
    graceMs: 0, timeoutMs: 0,
  });
  assert.deepEqual(signals, [[leader.pid, 'SIGTERM'], [-leader.pid, 'SIGTERM']]);
  assert.deepEqual(result, {observed: 1, reaped: 1, survived: 0, truncated: false});
  assert.equal(samples, 2, 'group EPERM must not bypass the post-TERM sample');
});

test('F2 group signals require every current member to be an eligible tracked identity', async () => {
  const leader = row(ROOT_PID + 1, ROOT_PID);
  const member = row(ROOT_PID + 2, leader.pid, leader.pid);
  const untracked = row(ROOT_PID + 3, 1, leader.pid);
  const self = row(process.pid, process.ppid, leader.pid);
  const samples = [[leader, member, untracked], [leader, {...member, startTime: REUSED}, self], []];
  const signals = [];
  await supervisor.reapDescendants([leader, member], {
    sample: async () => samples.shift() ?? [],
    kill(pid, signal) { signals.push([pid, signal]); },
    graceMs: 0, timeoutMs: 0,
  });
  assert.deepEqual(signals, [[leader.pid, 'SIGTERM'], [member.pid, 'SIGTERM'], [leader.pid, 'SIGKILL']]);
});

test('F1 recorded escapes require the same dispatch, segment and child identity', async t => {
  const artifact = await fs.mkdtemp(path.join(os.tmpdir(), 'arc-descendants-record-'));
  t.after(() => fs.rm(artifact, {recursive: true, force: true}));
  const file = path.join(artifact, 'descendants.json');
  const lease = {dispatchId: 'current-dispatch', segment: 2, child: {pid: ROOT_PID, startTime: ' Sat  Nov 21 12:00:00 2026\n'}};
  const escaped = row(ROOT_PID + 1, ROOT_PID);
  const inGroup = row(ROOT_PID + 2, ROOT_PID, ROOT_PID);
  const snapshot = {version: 1, dispatchId: lease.dispatchId, segment: 2, rootPid: ROOT_PID, rootPgid: ROOT_PID, rootStartTime: START, truncated: false, entries: [escaped, inGroup]};
  const signals = [];
  let samples = 0;
  const opts = {
    sample: async () => { samples++; return signals.length ? [inGroup] : [escaped, inGroup]; },
    kill(pid, signal) { signals.push([pid, signal]); },
    graceMs: 0, timeoutMs: 0,
  };
  for (const change of [
    {dispatchId: 'previous-dispatch'}, {segment: 1}, {rootPid: ROOT_PID + 3, rootPgid: ROOT_PID + 3},
    {rootStartTime: undefined}, {rootStartTime: 'invalid'}, {rootStartTime: REUSED},
  ]) {
    await fs.writeFile(file, JSON.stringify({...snapshot, ...change}), {mode: 0o600});
    assert.deepEqual(await supervisor.reapRecordedDescendants(artifact, lease, opts), {}, JSON.stringify(change));
  }
  await fs.writeFile(file, JSON.stringify(snapshot), {mode: 0o600});
  for (const startTime of [undefined, `stub ${ROOT_PID}`, 'unavailable']) {
    const invalidLease = {...lease, child: {...lease.child, startTime}};
    assert.deepEqual(await supervisor.reapRecordedDescendants(artifact, invalidLease, opts), {}, String(startTime));
  }
  assert.equal(samples, 0, 'stale or malformed records must never start sampling');
  assert.deepEqual(signals, []);

  await fs.writeFile(file, JSON.stringify({...snapshot, rootStartTime: '\tSat Nov  21 12:00:00 2026 '}), {mode: 0o600});
  assert.deepEqual(await supervisor.reapRecordedDescendants(artifact, lease, opts), {
    escapedDescendants: {observed: 1, reaped: 1, survived: 0, truncated: false},
  });
  assert.deepEqual(signals, [[escaped.pid, 'SIGTERM'], [-escaped.pid, 'SIGTERM']]);
});

const bases = [];
const policy = {...DEFAULT_POLICY, gates: {...DEFAULT_POLICY.gates, G2: 'pass'}, cancelGraceMs: 250, supervisorLostMs: 1};
const session = '01a1c596-43f9-77a0-b0bb-000000000001';
const digest = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');

async function setup(t, platform) {
  let base, child;
  // Register before createRoutingFixture registers its directory removal.
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    if (base && psAvailable()) await reapFixtureProcesses(base, {graceMs: 0});
  });
  const role = 'arc_scouter';
  const f = await createRoutingFixture(t, {
    hostPlatform: platform === 'claude' ? 'codex' : 'claude',
    roles: {[role]: platform === 'claude' ? 'claude' : 'codex'},
  });
  base = f.base;
  bases.push(base);
  if (platform === 'claude') {
    const profile = await fs.readFile(path.join(f.claudeHome, 'agents/arc-routing-scouter.md'));
    await f.cli('claude', {version: '2.1.322 (Claude Code)', events: [
      {type: 'system', subtype: 'init', session_id: session, tools: parseCompositeProfile('claude', profile).tools, model: 'claude-haiku-5-5', permissionMode: 'default'},
      {type: 'result', subtype: 'success', is_error: false, session_id: session, result: 'claude done'},
    ]});
  } else if (platform === 'codex') {
    await f.cli('codex', {version: 'codex-cli 0.167.0', outputFile: 'codex done', events: [
      {type: 'thread.started', thread_id: session}, {type: 'turn.completed'},
    ], writes: [{path: path.join(f.codexHome, 'sessions/2026/11/10', `rollout-2026-11-10T00-00-00-${session}.jsonl`), content: [
      {type: 'session_meta', payload: {id: session}},
      {type: 'turn_context', payload: {model: 'gpt-6-luna', effort: 'low', approval_policy: 'never', sandbox_policy: {type: 'read-only'}}},
    ].map(value => JSON.stringify(value)).join('\n') + '\n'}]});
  } else {
    await installReplay(f, platform, role);
  }
  return {...f, role, rememberChild(value) { child = value; }};
}

async function installReplay(f, platform, role) {
  const home = path.join(f.userHome, `.${platform}`);
  const executable = path.join(f.binDir, platform);
  await fs.copyFile(new URL(`./fixtures/${platform}/fake-${platform}.mjs`, import.meta.url), executable);
  await fs.chmod(executable, 0o755);
  await fs.mkdir(path.join(home, 'agents'), {recursive: true});
  await fs.cp(path.join(f.claudeHome, 'skills'), path.join(home, 'skills'), {recursive: true});
  const model = `${platform}-test`, effort = 'default';
  const format = platform === 'gemini' ? geminiProfile : grokProfile;
  const source = `---\nname: arc-scouter\ndescription: Role instructions\nmodel: ${model}\n---\nPrivate role instructions\n`;
  const content = format.renameForRouting(format.render(source, role, {model, effort}), role, f.revision);
  const relative = 'agents/arc-routing-scouter.md';
  await fs.writeFile(path.join(home, relative), content);

  f.config.platforms.push(platform);
  f.config.roles[role] = {platform, model, effort};
  const configBytes = Buffer.from(JSON.stringify(f.config));
  const markerFile = home => path.join(home, 'arc-role-platform-routing.prepared.json');
  const claudeMarker = await readJson(markerFile(f.claudeHome));
  const configHash = digest(configBytes);
  await fs.writeFile(f.activePath, configBytes);
  await fs.writeFile(markerFile(f.claudeHome), JSON.stringify({...claudeMarker, configHash}));
  const codexMarker = await readJson(markerFile(f.codexHome));
  delete codexMarker.profiles[role];
  await fs.writeFile(markerFile(f.codexHome), JSON.stringify({...codexMarker, configHash}));
  await fs.writeFile(markerFile(home), JSON.stringify({...claudeMarker, platform, targetHome: home, configHash, profiles: {[role]: {path: relative, hash: digest(content)}}}));
  Object.assign(f.env, {
    PATH: [f.binDir, path.dirname(process.execPath), ORIGINAL_PATH].join(path.delimiter),
    ARC_FAKE_GEMINI_FIXTURE: new URL('./fixtures/gemini/stream-ok.jsonl', import.meta.url).pathname,
    [`ARC_FAKE_${platform.toUpperCase()}_RECORD`]: path.join(f.base, 'child.json'),
  });
}

const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
async function readIfPresent(file) {
  return fs.readFile(file, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
}

async function start(f, starter = async () => ({pid: process.pid, startTime: 'fixture-supervisor'})) {
  const context = f.context();
  const prepared = await prepareRoleDispatch({context, assignment: {role: f.role, taskId: 'escape-task', requestId: 'escape-request'}, expectedRevision: f.revision, policy});
  assert.equal(prepared.decision, 'allow', JSON.stringify(prepared.reasons));
  const {dispatchId} = prepared;
  const started = await runBridgeDispatch({context, dispatchId, brief: 'Fixture brief', policy, startSupervisor: starter});
  assert.equal(started.decision, 'allow', JSON.stringify(started.reasons));
  const artifact = supervisor.segmentDirectory(await supervisor.resolveWorktree(f.cwd), context.workflowId, dispatchId, 0);
  return {dispatchId, context, artifact, read: () => readLease(f.claudeHome, dispatchId)};
}

function supervise(f, dispatchId, extra = {}) {
  return supervisor.runSupervisor({
    codexHome: f.claudeHome, dispatchId, cwd: f.cwd, userHome: f.userHome, env: f.env,
    policy, timeoutMs: 6000, graceMs: 250, afterSpawn: f.rememberChild, ...extra,
  });
}

function manualTimeout(t, milliseconds) {
  const pending = new Map();
  const set = globalThis.setTimeout;
  const clear = globalThis.clearTimeout;
  let scheduled = 0;
  t.mock.method(globalThis, 'setTimeout', (callback, wait, ...args) => {
    if (wait !== milliseconds) return set(callback, wait, ...args);
    const handle = {};
    pending.set(handle, () => callback(...args));
    scheduled++;
    return handle;
  });
  t.mock.method(globalThis, 'clearTimeout', handle => {
    if (!pending.delete(handle)) clear(handle);
  });
  return {
    get scheduled() { return scheduled; },
    fire() {
      for (const [handle, callback] of [...pending]) {
        pending.delete(handle);
        callback();
      }
    },
  };
}

const cleanupPlatforms = ['claude', 'codex', 'gemini', 'grok'];

for (const platform of cleanupPlatforms) {
  test(`${platform} F3 finished group handling blocks pending KILL and late supervisor TERM`, async t => {
    const graceMs = 41237;
    const timer = manualTimeout(t, graceMs);
    const allSignals = [];
    for (const abortBeforeExit of [true, false]) {
      const f = await setup(t, platform);
      const dispatch = await start(f);
      const controller = new AbortController();
      const signals = [];
      let samples = 0;
      await supervise(f, dispatch.dispatchId, {
        graceMs, descendantSampleMs: 60000, stopSignal: controller.signal,
        afterSpawn(child) {
          f.rememberChild(child);
          if (abortBeforeExit) controller.abort();
        },
        signalGroup(_pid, signal) { signals.push(signal); },
        sampleProcesses: async () => {
          if (++samples === 2) {
            if (abortBeforeExit) timer.fire();
            else controller.abort();
          }
          return [];
        },
      });
      assert.equal(samples, 2);
      allSignals.push(signals);
    }
    assert.ok(timer.scheduled >= 1, 'the early stop must schedule group escalation');
    assert.deepEqual(allSignals, [['SIGTERM'], []]);
  });

  test(`${platform} F4 the execution deadline cannot turn a completed CLI into a timeout during cleanup`, async t => {
    const timeoutMs = 41238;
    const timer = manualTimeout(t, timeoutMs);
    const f = await setup(t, platform);
    const dispatch = await start(f);
    let samples = 0;
    const signals = [];
    await supervise(f, dispatch.dispatchId, {
      timeoutMs, descendantSampleMs: 60000,
      signalGroup(_pid, signal) { signals.push(signal); },
      sampleProcesses: async () => {
        if (++samples === 2) timer.fire();
        return [];
      },
    });
    assert.equal(samples, 2);
    assert.equal(timer.scheduled, 1);
    const lease = await dispatch.read();
    assert.deepEqual(lease.reasons.map(reason => reason.code), []);
    assert.equal(lease.state, 'completed');
    assert.deepEqual(signals, []);
  });
}

function processRows() {
  const result = realPs(['-A', '-ww', '-o', 'pid=,ppid=,pgid=,lstart=,stat=,command=']);
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  return result.stdout.split('\n').flatMap(line => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+((?:\S+\s+){4}\S+)\s+(\S+)\s*(.*)$/.exec(line);
    if (!match) return [];
    const [, pid, ppid, pgid, lstart, stat, command] = match;
    return [{...row(Number(pid), Number(ppid), Number(pgid), lstart.replace(/\s+/g, ' ')), stat, command}];
  });
}

const running = entry => !entry.stat.startsWith('Z');
const sameIdentity = (a, b) => a.pid === b.pid && a.startTime === b.startTime;
async function until(find, message, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await find();
    if (result) return result;
    if (Date.now() >= deadline) assert.fail(message);
    await delay(25);
  }
}

test.after(() => {
  if (!psAvailable()) {
    console.log('Skipping leftover fixture process check: real ps unavailable (sandbox/PATH)');
    return;
  }
  const leftovers = processRows().filter(entry => running(entry) && bases.some(base => entry.command.includes(base)));
  assert.deepEqual(leftovers, [], 'leftover fixture processes (pid and command)');
});

for (const platform of ['codex', 'claude', 'gemini', 'grok']) {
  test(`${platform} reaps a sampled escaped grandchild when the CLI exits normally`, async t => {
    if (!psAvailable()) return t.skip(REAL_PS_SKIP);
    const f = await setup(t, platform);
    const pidFile = f.env.ARC_FAKE_ESCAPE_PID_FILE = path.join(f.base, 'escaped.pid');
    const release = f.env.ARC_FAKE_ESCAPE_RELEASE_FILE = path.join(f.base, 'release');
    await withPath(ORIGINAL_PATH, async () => {
      const dispatch = await start(f);
      let escaped;
      await supervise(f, dispatch.dispatchId, {
        descendantSampleMs: 20,
        async sampleProcesses() {
          const table = processRows();
          const pid = Number(await readIfPresent(pidFile));
          const entry = table.find(entry => entry.pid === pid && entry.pgid === pid && entry.command.includes(f.base));
          if (!escaped && entry) {
            escaped = entry;
            await fs.writeFile(release, 'sampled');
          }
          return table.filter(running).map(({pid, ppid, pgid, startTime}) => ({pid, ppid, pgid, startTime}));
        },
      });
      assert.ok(escaped, 'supervisor never sampled the escaped grandchild to release the CLI');
      assert.equal(processRows().some(entry => running(entry) && sameIdentity(entry, escaped)), false);
      const record = await readJson(path.join(dispatch.artifact, 'record.json'));
      assert.ok(record.escapedDescendants?.reaped >= 1);
      assert.equal(record.escapedDescendants.survived, 0);
      const lease = await dispatch.read();
      assert.equal(lease.state, 'completed', JSON.stringify(lease.reasons));
    });
  });
}

async function startDetached(f) {
  const pidFile = f.env.ARC_FAKE_ESCAPE_PID_FILE = path.join(f.base, 'escaped.pid');
  f.env.ARC_FAKE_GEMINI_HANG = '1';
  const dispatch = await start(f, supervisor.startSupervisor);
  const child = await until(async () => (await dispatch.read()).child, 'detached supervisor did not start its CLI');
  const pid = await until(async () => Number(await readIfPresent(pidFile)), 'fake Gemini did not start an escaped grandchild');
  const artifact = path.join(dispatch.artifact, 'descendants.json');
  const escaped = await until(async () => {
    const raw = await readIfPresent(artifact);
    if (raw === null) return null;
    const snapshot = JSON.parse(raw);
    assert.deepEqual(Object.keys(snapshot).sort(), ['dispatchId', 'entries', 'rootPgid', 'rootPid', 'rootStartTime', 'segment', 'truncated', 'version']);
    assert.equal(snapshot.version, 1);
    assert.equal(snapshot.dispatchId, dispatch.dispatchId);
    assert.equal(snapshot.segment, 0);
    assert.equal(snapshot.rootPid, child.pid);
    assert.equal(snapshot.rootPgid, child.pid);
    assert.equal(snapshot.rootStartTime, child.startTime);
    assert.equal(snapshot.truncated, false);
    assert.ok(Array.isArray(snapshot.entries));
    assert.ok(!snapshot.entries.some(entry => entry.pid === child.pid));
    return snapshot.entries.find(entry => entry.pid === pid);
  }, `descendants.json never recorded escaped pid ${pid}`);
  assert.deepEqual(Object.keys(escaped).sort(), ['pgid', 'pid', 'ppid', 'startTime']);
  assert.equal(escaped.ppid, child.pid);
  assert.equal(escaped.pgid, pid);
  assert.equal((await fs.stat(artifact)).mode & 0o777, 0o600);
  assert.ok(processRows().some(entry => running(entry) && sameIdentity(entry, escaped) && entry.pgid !== child.pid));
  return {...dispatch, child, escaped, owner: (await dispatch.read()).supervisor};
}

function liveTarget(target) {
  return processRows().some(entry => running(entry) && sameIdentity(entry, target));
}

function liveGroup(pid) {
  return processRows().some(entry => running(entry) && entry.pgid === pid);
}

for (const signal of ['SIGTERM', 'SIGKILL']) {
  test(`detached supervisor ${signal} ${signal === 'SIGTERM' ? 'reaps the child group and escaped descendant' : 'leaves escapes alive until explicit cancel'}`, async t => {
    if (!psAvailable()) return t.skip(REAL_PS_SKIP);
    const f = await setup(t, 'gemini');
    await withPath(ORIGINAL_PATH, async () => {
      const d = await startDetached(f);
      assert.ok(liveTarget(d.owner), 'detached supervisor is alive before it is signalled');
      process.kill(d.owner.pid, signal);
      await until(() => !liveTarget(d.owner), 'detached supervisor did not exit', 25000);
      if (signal === 'SIGTERM') {
        const record = await readJson(path.join(d.artifact, 'record.json'));
        assert.equal(record.terminatedBy, 'supervisor_signal');
        assert.ok(record.escapedDescendants?.reaped >= 1);
      } else {
        const lost = await recordRoleObservation({context: d.context, dispatchId: d.dispatchId, now: Date.now() + policy.supervisorLostMs + 1, policy});
        assert.equal(lost.routeStatus, 'unknown', JSON.stringify(lost.reasons));
        assert.ok(liveTarget(d.escaped), 'lost observation must leave the escaped descendant alive');
        const snapshot = await readJson(path.join(d.artifact, 'descendants.json'));
        assert.equal(snapshot.rootStartTime, (await d.read()).child.startTime, 'cancel must recover the recorded child identity');
        const cancelled = await cancelRoleDispatch({context: d.context, dispatchId: d.dispatchId, policy});
        assert.equal(cancelled.routeStatus, 'cancelled', JSON.stringify(cancelled.reasons));
        assert.ok(cancelled.escapedDescendants?.reaped >= 1);
        assert.deepEqual(cancelled.reasons, lost.reasons);
        assert.equal((await d.read()).state, 'cancelled');
      }
      assert.equal(liveGroup(d.child.pid), false, 'original child group is stopped');
      assert.equal(liveTarget(d.escaped), false, 'escaped descendant is stopped');
    });
  });
}

for (const platform of cleanupPlatforms) {
  test(`${platform} surviving escaped descendants do not change the lease state or reasons`, async t => {
    const clean = await setup(t, platform);
    const baseline = await start(clean);
    await supervise(clean, baseline.dispatchId, {sampleProcesses: async () => []});
    const expected = await baseline.read();
    assert.equal(expected.state, 'completed', JSON.stringify(expected.reasons));
    assert.deepEqual(expected.reasons, []);
    const baselineRecord = await readJson(path.join(baseline.artifact, 'record.json'));
    assert.equal(Object.hasOwn(baselineRecord, 'escapedDescendants'), false);
    assert.deepEqual(baselineRecord.reasons, []);

    const f = await setup(t, platform);
    const dispatch = await start(f);
    let table = [];
    await supervise(f, dispatch.dispatchId, {
      afterSpawn(child) {
        f.rememberChild(child);
        table = [row(child.pid, process.pid), row(ROOT_PID, child.pid)];
      },
      sampleProcesses: async () => table,
      killProcess() {},
    });
    const record = await readJson(path.join(dispatch.artifact, 'record.json'));
    assert.equal(record.escapedDescendants?.survived, 1);
    const actual = await dispatch.read();
    assert.equal(actual.state, expected.state);
    assert.deepEqual(actual.reasons, expected.reasons);
    assert.deepEqual(record.reasons, baselineRecord.reasons);
  });
}
