import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {serializeLimits} from '../../lib/installer/limits.mjs';
import {createLease, ensureDispatchDirectory, dispatchDirectory, listLeases, pruneTerminalLeases, readHostLimits, readLease, validateLease, writeLease, NON_TERMINAL_STATES, TERMINAL_STATES} from '../../lib/runtime/role-dispatch-store.mjs';

const DAY = 86400000;
const lease = (id, extra = {}) => ({
  version: 1, dispatchId: id, workflowId: 'wf-1', taskId: 'T1', requestId: `req-${id}`, role: 'arc_qa', route: 'bridge', hostPlatform: 'claude', executionEnvironment: 'claude-cli',
  revision: 'rev-1', profileHash: 'sha256:' + 'a'.repeat(64), argsDigest: null, state: 'reserved', supervisor: null, child: null, sessionId: null, timeoutMinutes: 30,
  claims: null, reasons: [], allowedPaths: [], resultPath: null, segment: 0, nativeAgentId: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...extra
});
const tmp = async t => { const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arc-store-')); t.after(async () => { await fs.chmod(path.join(dir, 'arc-role-dispatch'), 0o700).catch(() => {}); await fs.rm(dir, {recursive: true, force: true}); }); return dir; };

test('state sets are disjoint and complete', () => {
  assert.deepEqual([...NON_TERMINAL_STATES].sort(), ['reserved', 'running', 'starting', 'unknown']);
  assert.deepEqual([...TERMINAL_STATES].sort(), ['cancelled', 'completed', 'failed']);
});

test('lease create/read/write keeps 0600 file and 0700 directory and exact keys', async t => {
  const home = await tmp(t), created = await createLease(home, lease('d1'));
  assert.equal(created.dispatchId, 'd1');
  const file = path.join(dispatchDirectory(home), 'd1.json');
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  assert.equal((await fs.stat(dispatchDirectory(home))).mode & 0o777, 0o700);
  assert.deepEqual(await readLease(home, 'd1'), created);
  assert.equal(await readLease(home, 'missing'), null);
  await assert.rejects(createLease(home, lease('d1')), {code: 'EEXIST'});
  const written = await writeLease(home, {...created, state: 'running'});
  assert.equal(written.state, 'running');
  assert.notEqual(written.updatedAt, created.updatedAt);
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  assert.deepEqual((await fs.readdir(dispatchDirectory(home))), ['d1.json']);
  assert.throws(() => validateLease({...lease('d2'), extra: 1}));
  const missing = lease('d3'); delete missing.segment;
  assert.throws(() => validateLease(missing));
  assert.throws(() => validateLease(lease('d4', {state: 'bogus'})));
  assert.throws(() => validateLease(lease('../escape')));
  await assert.rejects(readLease(home, '../x'));
});

test('listLeases throws on an unparsable lease file', async t => {
  const home = await tmp(t);
  assert.deepEqual(await listLeases(home), []);
  await createLease(home, lease('d1'));
  assert.equal((await listLeases(home)).length, 1);
  await fs.writeFile(path.join(dispatchDirectory(home), 'bad.json'), '{nope');
  await assert.rejects(listLeases(home));
});

test('pruneTerminalLeases removes only terminal leases older than 30 days', async t => {
  const home = await tmp(t), now = Date.parse('2026-06-30T00:00:00.000Z'), at = days => new Date(now - days * DAY).toISOString();
  const cases = [['completed', 31, true], ['failed', 31, true], ['cancelled', 29, false], ['unknown', 90, false], ['running', 90, false]];
  for (const [state, days] of cases) await createLease(home, lease(state, {state, updatedAt: at(days)}));
  assert.deepEqual(await pruneTerminalLeases(home, {now, retentionMs: 30 * DAY}), {removed: 2, errors: 0});
  const left = (await fs.readdir(dispatchDirectory(home))).sort();
  assert.deepEqual(left, ['cancelled.json', 'running.json', 'unknown.json']);
  assert.deepEqual(await pruneTerminalLeases(path.join(home, 'none'), {now, retentionMs: 30 * DAY}), {removed: 0, errors: 0});
});

test('pruneTerminalLeases counts unlink errors without throwing', async t => {
  if (process.getuid?.() === 0) return t.skip('root ignores directory permissions');
  const home = await tmp(t), now = Date.parse('2026-06-30T00:00:00.000Z');
  await createLease(home, lease('old', {state: 'completed', updatedAt: new Date(now - 40 * DAY).toISOString()}));
  await fs.chmod(dispatchDirectory(home), 0o500);
  const result = await pruneTerminalLeases(home, {now, retentionMs: 30 * DAY});
  assert.equal(result.removed, 0);
  assert.ok(result.errors > 0);
});

test('readHostLimits accepts serializeLimits output and comments, rejects unknown keys or version 2', async t => {
  const home = await tmp(t), file = path.join(home, 'skills/arc/limits.toml');
  await fs.mkdir(path.dirname(file), {recursive: true});
  await fs.writeFile(file, serializeLimits({version: 1, max_total_subagents: 7, max_concurrent_subagents: 3}));
  assert.deepEqual(readHostLimits(home), {maxTotal: 7, maxConcurrent: 3});
  await fs.writeFile(file, '# header\n\nversion = 1\n# note\nmax_total_subagents = 9\nmax_concurrent_subagents = 2 # trailing\n');
  assert.deepEqual(readHostLimits(home), {maxTotal: 9, maxConcurrent: 2});
  for (const bad of ['version = 2\nmax_total_subagents = 9\nmax_concurrent_subagents = 2\n', 'version = 1\nmax_total_subagents = 9\nmax_concurrent_subagents = 2\nextra = 1\n', 'version = 1\nmax_total_subagents = 9\n', 'version = 1\nmax_total_subagents = 0\nmax_concurrent_subagents = 2\n', 'version = 1\nmax_total_subagents = x\nmax_concurrent_subagents = 2\n'])
    { await fs.writeFile(file, bad); assert.throws(() => readHostLimits(home), bad); }
  await fs.rm(file); assert.throws(() => readHostLimits(home));
});

test('a lease directory that is too open and owned by the current user is corrected to 0700; a foreign-owned or symlinked one is refused', async t => {
  const home = await tmp(t);
  await fs.mkdir(dispatchDirectory(home), {recursive: true, mode: 0o755});
  await fs.chmod(dispatchDirectory(home), 0o777);
  await createLease(home, lease('wide'));
  assert.equal((await fs.stat(dispatchDirectory(home))).mode & 0o777, 0o700);
  await fs.chmod(dispatchDirectory(home), 0o755);
  await writeLease(home, lease('wide'));
  assert.equal((await fs.stat(dispatchDirectory(home))).mode & 0o777, 0o700, 'writeLease also corrects the directory');
  await assert.rejects(ensureDispatchDirectory(home, {uid: process.getuid() + 1}), /not owned/i);
  const other = await tmp(t), target = await fs.mkdtemp(path.join(os.tmpdir(), 'arc-store-target-'));
  t.after(() => fs.rm(target, {recursive: true, force: true}));
  await fs.symlink(target, dispatchDirectory(other));
  await assert.rejects(createLease(other, lease('linked')), /directory/i);
});
