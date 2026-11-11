import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openRoot} from '../../lib/safe-fs/index.mjs';
import {loadNative} from '../../lib/safe-fs/native.mjs';
import {publishCompositeFiles} from '../../lib/installer/role-routing.mjs';
import {createLease, dispatchDirectory} from '../../lib/runtime/role-dispatch-store.mjs';

const native = loadNative({artifactDirectory: 'build/native'});
const safeFs = {openRoot: p => openRoot(p, {native})};
const now = '2026-11-10T00:00:00.000Z';

function fixture(t) {
  const userHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'arc-publish-')));
  t.after(() => { try { fs.chmodSync(dispatchDirectory(path.join(userHome, '.codex')), 0o700); } catch { /* absent */ } fs.rmSync(userHome, {recursive: true, force: true}); });
  const codex = path.join(userHome, '.codex'), claude = path.join(userHome, '.claude');
  fs.mkdirSync(codex, {recursive: true}); fs.mkdirSync(claude, {recursive: true});
  const target = platform => ({platform, home: platform === 'codex' ? codex : claude, userHome});
  const prepared = {target: target('codex'), targets: {codex: target('codex'), claude: target('claude')}, config: {version: 1, revision: 'rev-1', roles: {}}, bytes: Buffer.from('{}'), snapshot: new Map(), managedPaths: [], externalPaths: [], desired: {codex: {}, claude: {}}, existingProfiles: {codex: {}, claude: {}}};
  return {codex, claude, prepared, context: {safeFs}};
}
const lease = (dispatchId, route, state) => ({version: 1, dispatchId, workflowId: 'wf-1', taskId: `task-${dispatchId}`, requestId: `req-${dispatchId}`, role: 'arc_planner', route, hostPlatform: 'claude', executionEnvironment: 'claude-cli', revision: 'rev-1', profileHash: null, argsDigest: null, state, supervisor: null, child: null, sessionId: null, timeoutMinutes: 20, claims: null, reasons: [], allowedPaths: [], resultPath: null, segment: 0, nativeAgentId: null, createdAt: now, updatedAt: now});
const attempt = async f => { try { return {published: await publishCompositeFiles(f)}; } catch (error) { return {error}; } };
const lockPath = f => path.join(f.codex, 'arc-role-platform-routing.lock');

test('publish is refused with activation held and dispatch ids while a bridge lease is reserved, starting, running or unknown', async t => {
  const f = fixture(t);
  const ids = [];
  for (const state of ['reserved', 'starting', 'running', 'unknown']) { ids.push(`b-${state}`); await createLease(f.codex, lease(`b-${state}`, 'bridge', state)); }
  const {error, published} = await attempt(f);
  assert.equal(published, undefined);
  assert.equal(error.name, 'TargetConfigurationError');
  assert.equal(error.activation, 'held');
  assert.deepEqual([...error.activeDispatches].sort(), [...ids].sort());
  assert.equal(fs.existsSync(lockPath(f)), false, 'the lock is released');
  assert.deepEqual(fs.readdirSync(f.codex).filter(name => name !== 'arc-role-dispatch'), [], 'nothing was written');
  for (const state of ['reserved', 'starting', 'running', 'unknown']) {
    const g = fixture(t);
    await createLease(g.codex, lease(`only-${state}`, 'bridge', state));
    const single = await attempt(g);
    assert.equal(single.error.activation, 'held', state);
    assert.deepEqual(single.error.activeDispatches, [`only-${state}`], state);
  }
});

test('native non-terminal lease and terminal bridge leases do not block publication', async t => {
  const f = fixture(t);
  await createLease(f.codex, lease('n-running', 'native', 'running'));
  await createLease(f.codex, lease('n-reserved', 'native', 'reserved'));
  for (const state of ['completed', 'failed', 'cancelled']) await createLease(f.codex, lease(`b-${state}`, 'bridge', state));
  const {error} = await attempt(f);
  // The guard passed: publication continued to the installed-runtime check, which this empty fixture cannot satisfy.
  assert.match(error.message, /Installed cooperative runtime is incomplete/);
  assert.equal(error.activeDispatches, undefined);
  assert.notEqual(error.activation, 'unknown');
});

test('unreadable lease directory refuses publication', async t => {
  if (process.getuid?.() === 0) return t.skip('root ignores directory permissions');
  const f = fixture(t);
  await createLease(f.codex, lease('b-running', 'bridge', 'running'));
  fs.chmodSync(dispatchDirectory(f.codex), 0o000);
  const {error} = await attempt(f);
  fs.chmodSync(dispatchDirectory(f.codex), 0o700);
  assert.equal(error.name, 'TargetConfigurationError');
  assert.equal(error.activation, 'held');
  assert.equal(error.activeDispatches, null);
  assert.equal(fs.existsSync(lockPath(f)), false);
  const g = fixture(t);
  await createLease(g.codex, lease('corrupt', 'bridge', 'completed'));
  fs.writeFileSync(path.join(dispatchDirectory(g.codex), 'broken.json'), '{not json');
  const second = await attempt(g);
  assert.equal(second.error.activation, 'held');
  assert.equal(second.error.activeDispatches, null);
});
