import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as sleep} from 'node:timers/promises';
import {createRoutingFixture} from './role-fixtures.mjs';
import {prepareRoleDispatch, withRoutingLock} from '../../lib/runtime/role-routing.mjs';
import {readLease, writeLease} from '../../lib/runtime/role-dispatch-store.mjs';
import {recordRoleObservation} from '../../lib/runtime/role-bridge.mjs';

async function setup(t, state) {
  const f = await createRoutingFixture(t, {roles: {arc_qa: 'codex'}});
  await f.cli('codex', {version: 'codex-cli 0.167.0'});
  const prepared = await prepareRoleDispatch({context: f.context(), assignment: {role: 'arc_qa', requestId: 'observe-req', taskId: 'observe-task'}, expectedRevision: f.revision});
  assert.equal(prepared.decision, 'allow', JSON.stringify(prepared.reasons));
  assert.equal(prepared.route, 'bridge');
  f.dispatchId = prepared.dispatchId;
  assert.equal((await readLease(f.codexHome, f.dispatchId)).state, 'reserved');
  await changeLease(f, state, {supervisor: {pid: process.pid, startTime: 'fixture'}});
  return f;
}

const changeLease = (f, state, extra = {}) => withRoutingLock(f.codexHome, async () => {
  const lease = await readLease(f.codexHome, f.dispatchId);
  return writeLease(f.codexHome, {...lease, ...extra, state});
});
const observe = (f, extra = {}) => recordRoleObservation({context: f.context(), dispatchId: f.dispatchId, waitMs: 5000, pollMs: 50, ...extra});

// A return on any state change would expose running instead of the terminal outcome.
for (const [state, decision] of [['completed', 'allow'], ['failed', 'hold'], ['cancelled', 'allow']]) {
  test(state === 'completed' ? 'observe keeps waiting through starting to running and returns on a terminal state' : `observe keeps waiting through starting to running and returns ${state}`, async t => {
    const f = await setup(t, 'starting');
    const begin = Date.now();
    const transition = (async () => {
      await sleep(300);
      await changeLease(f, 'running');
      await sleep(Math.max(0, begin + 700 - Date.now()));
      await changeLease(f, state);
    })();
    let result, elapsed;
    try {
      result = await observe(f);
      elapsed = Date.now() - begin;
    } finally {
      await transition;
    }
    assert.equal(result.routeStatus, state);
    assert.equal(result.decision, decision);
    assert.ok(elapsed >= 650 && elapsed < 5000, `elapsed: ${elapsed}ms`);
  });
}

test('observe returns unknown without waiting for waitMs', async t => {
  const f = await setup(t, 'running');
  const begin = Date.now();
  const transition = sleep(300).then(() => changeLease(f, 'unknown'));
  let result, elapsed;
  try {
    result = await observe(f);
    elapsed = Date.now() - begin;
  } finally {
    await transition;
  }
  assert.equal(result.routeStatus, 'unknown');
  assert.equal(result.decision, 'hold');
  assert.ok(elapsed < 5000, `elapsed: ${elapsed}ms`);
});

test('observe returns the running state when waitMs elapses', async t => {
  const f = await setup(t, 'running');
  const begin = Date.now();
  const result = await observe(f, {waitMs: 400});
  const elapsed = Date.now() - begin;
  assert.equal(result.routeStatus, 'running');
  assert.ok(elapsed >= 350 && elapsed < 3000, `elapsed: ${elapsed}ms`);
});

test('a supervisor lost during the wait is marked unknown and returned before waitMs', async t => {
  const f = await setup(t, 'running');
  const child = spawn(process.execPath, ['-e', ''], {stdio: 'ignore'});
  await once(child, 'exit');
  await changeLease(f, 'running', {supervisor: {pid: child.pid, startTime: 'gone'}});
  const begin = Date.now();
  const result = await observe(f, {lostMs: 200});
  const elapsed = Date.now() - begin;
  assert.equal(result.routeStatus, 'unknown');
  assert.equal(result.decision, 'hold');
  assert.deepEqual(result.reasons.map(reason => reason.code), ['terminal_state_unverified']);
  assert.equal((await readLease(f.codexHome, f.dispatchId)).state, 'unknown');
  assert.ok(elapsed < 5000, `elapsed: ${elapsed}ms`);
});

test('a terminal lease returns at once even with a long waitMs', async t => {
  const f = await setup(t, 'completed');
  const begin = Date.now();
  const result = await observe(f);
  assert.equal(result.routeStatus, 'completed');
  assert.ok(Date.now() - begin < 1000);
});
