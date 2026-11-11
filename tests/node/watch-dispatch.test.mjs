import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {makeHomes} from './fixtures/watch/homes.mjs';
import {parseLeaseLenient, createDispatchIndex} from '../../lib/watch/dispatch.mjs';

const scan = (index, gitCommonDirs = [], includeAllLeases = false) => index.scan({gitCommonDirs, includeAllLeases});
const artifacts = (homes, gcd, id, files) => homes.writeArtifacts(gcd, 'w1', `dispatches/${id}`, files);

test('lenient lease parsing ignores extra and missing keys', () => {
  assert.deepEqual(parseLeaseLenient('{"dispatchId":"d1","future":1,"reasons":"x","nativeAgentId":null,"role":4}'), {dispatchId:'d1', reasons:[]});
  assert.deepEqual(parseLeaseLenient('{"dispatchId":"d1","route":"custom route","state":"custom state","reasons":["x",1,null]}'), {dispatchId:'d1', route:'custom route', state:'custom state', reasons:['x']});
  for (const text of ['{', 'null', '[]', '{}', '{"dispatchId":2}']) assert.equal(parseLeaseLenient(text), null);
});

test('a half-written lease is skipped and read on the next scan', async t => {
  const homes = makeHomes(t), index = createDispatchIndex(homes);
  const file = homes.writeLease({dispatchId:'d1'});
  fs.writeFileSync(file, '{"dispatchId":"d1",');
  assert.deepEqual(await scan(index), []);
  homes.writeLease({dispatchId:'d1', state:'running'});
  assert.equal((await scan(index))[0].first, true);
  const ref = index.byId('d1');
  fs.writeFileSync(file, '{');
  assert.deepEqual(await scan(index), []);
  assert.equal(index.byId('d1').state, ref.state);
  const mtime = fs.statSync(file).mtime;
  homes.writeLease({dispatchId:'d1', state:'completed'});
  fs.utimesSync(file, mtime, mtime);
  assert.equal((await scan(index))[0].ref.state, 'completed');
});

test('heartbeat, cancel and temporary files are ignored', async t => {
  const homes = makeHomes(t), index = createDispatchIndex(homes);
  const file = homes.writeLease({dispatchId:'d1'}), dir = path.dirname(file);
  for (const name of ['d1.heartbeat.json', 'd1.cancel', '.d1.x.tmp', '.hidden.json']) fs.writeFileSync(path.join(dir, name), '{"dispatchId":"noise"}');
  assert.equal((await scan(index)).length, 1);
  assert.deepEqual(index.list().map(ref => ref.dispatchId), ['d1']);
  assert.equal(index.byId('missing'), null);
  assert.equal(index.bySession('missing'), null);
});

test('state or reasons changes yield one update; unchanged yields none', async t => {
  const homes = makeHomes(t), index = createDispatchIndex(homes);
  const write = (state, reasons, time) => {
    const file = homes.writeLease({dispatchId:'d1', state, reasons, route:'custom route', role:'arc_routing_qa'});
    fs.utimesSync(file, time, time);
    return file;
  };
  const file = write('running', [], 1000);
  assert.equal((await scan(index))[0].first, true);
  assert.deepEqual(await scan(index), []);
  // Changed contents with unchanged mtime must not be re-read.
  fs.writeFileSync(file, '{"dispatchId":"d1","state":"ignored"}');
  fs.utimesSync(file, 1000, 1000);
  assert.deepEqual(await scan(index), []);
  write('completed', [], 1001);
  const updates = await scan(index);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].first, false);
  assert.equal(updates[0].ref.role, 'qa');
  assert.equal(updates[0].ref.rawRole, 'arc_routing_qa');
  assert.equal(updates[0].ref.route, 'custom route');
  write('completed', ['custom_reason_xyz'], 1002);
  assert.equal((await scan(index)).length, 1);
  assert.deepEqual(await scan(index), []);
});

test('reasons pass through verbatim', async t => {
  const homes = makeHomes(t), index = createDispatchIndex(homes);
  homes.writeLease({dispatchId:'d1', reasons:['host_sandbox_blocked', 'permission_scope_unverified', 'custom_reason_xyz']});
  assert.deepEqual((await scan(index))[0].ref.reasons, ['host_sandbox_blocked', 'permission_scope_unverified', 'custom_reason_xyz']);
});

test('thread and init events map sessions, including resume segments', async t => {
  const homes = makeHomes(t), index = createDispatchIndex(homes), gcd = path.join(homes.root, 'git');
  const dir = artifacts(homes, gcd, 'd1', {'events.jsonl':'{"kind":"thread","threadId":"T1"}\n', 'segments/1/events.jsonl':'{"kind":"thread","threadId":"T2"}\n'});
  artifacts(homes, gcd, 'd2', {'events.jsonl':'{"kind":"init","sessionId":"C1"}\n', 'segments/1/events.jsonl':'{"kind":"init","sessionId":"C2"}\n'});
  await scan(index, [gcd]);
  assert.equal(index.bySession('T1'), index.bySession('T2'));
  assert.equal(index.bySession('T1').childPlatform, 'codex');
  assert.equal(index.bySession('C1'), index.bySession('C2'));
  assert.equal(index.bySession('C1').childPlatform, 'claude');
  fs.appendFileSync(path.join(dir, 'events.jsonl'), '{"kind":"other"}\n{"kind":"thread","threadId":"T3');
  assert.deepEqual(await scan(index, [gcd]), []);
  assert.equal(index.bySession('T3'), null);
  fs.appendFileSync(path.join(dir, 'events.jsonl'), '"}\n');
  assert.deepEqual(await scan(index, [gcd]), []);
  assert.deepEqual(index.byId('d1').sessionIds, ['T1', 'T2', 'T3']);
});

test('lease sessionId maps after completion without events', async t => {
  const homes = makeHomes(t), index = createDispatchIndex(homes);
  homes.writeLease({dispatchId:'d1', sessionId:'done', state:'completed', nativeAgentId:null});
  await scan(index);
  assert.equal(index.bySession('done'), index.byId('d1'));
  assert.equal(index.bySession('done').childPlatform, null);
});

test('repo scope includes only dispatches with artifacts under the scoped git common dir', async t => {
  const homes = makeHomes(t), index = createDispatchIndex(homes), gcd = path.join(homes.root, 'git'), other = path.join(homes.root, 'other');
  homes.writeLease({dispatchId:'d1'});
  homes.writeLease({dispatchId:'d2'});
  artifacts(homes, gcd, 'd1', {'record.json':{role:'arc_qa', state:'running'}});
  artifacts(homes, other, 'd2', {'record.json':{state:'running'}});
  await scan(index, [gcd]);
  assert.equal(index.byId('d1').inScope, true);
  assert.equal(index.byId('d2').inScope, false);
  await scan(index, [gcd], true);
  assert.ok(index.list().every(ref => ref.inScope));
  await scan(index, [other]);
  assert.equal(index.byId('d1').inScope, false);
  assert.equal(index.byId('d2').inScope, true);
});

test('pruned lease falls back to record.json', async t => {
  const homes = makeHomes(t), index = createDispatchIndex(homes), gcd = path.join(homes.root, 'git');
  const file = homes.writeLease({dispatchId:'d1', role:'arc_implementer', state:'running'});
  artifacts(homes, gcd, 'd1', {'record.json':{role:'arc_qa', state:'completed', reasons:['custom_reason_xyz']}});
  artifacts(homes, gcd, 'd2', {'segments/1/record.json':{role:'arc_reviewer', state:'failed'}});
  await scan(index, [gcd]);
  assert.equal(index.byId('d1').role, 'implementer');
  assert.equal(index.byId('d2').role, 'reviewer');
  fs.unlinkSync(file);
  const updates = await scan(index, [gcd]);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].first, false);
  assert.equal(index.byId('d1').role, 'qa');
  assert.equal(index.byId('d1').state, 'completed');
  assert.deepEqual(index.byId('d1').reasons, ['custom_reason_xyz']);
});

test('hostPlatform does not change mapping', async t => {
  const homes = makeHomes(t), gcd = path.join(homes.root, 'git');
  artifacts(homes, gcd, 'd1', {'events.jsonl':'{"kind":"init","sessionId":"C1"}\n'});
  const refs = [];
  for (const hostPlatform of ['codex', 'claude']) {
    homes.writeLease({dispatchId:'d1', hostPlatform, role:'arc_qa'});
    const index = createDispatchIndex(homes);
    await scan(index, [gcd]);
    const {hostPlatform:host, ...ref} = index.bySession('C1');
    assert.equal(host, hostPlatform);
    refs.push(ref);
  }
  assert.deepEqual(refs[0], refs[1]);
  assert.equal(refs[0].childPlatform, 'claude');
});

test('scan never creates or modifies files', async t => {
  const homes = makeHomes(t), gcd = path.join(homes.root, 'git');
  artifacts(homes, gcd, 'd1', {'events.jsonl':'{"kind":"thread","threadId":"T1"}\n', 'record.json':{state:'completed'}});
  const index = createDispatchIndex(homes), before = await homes.snapshot();
  await scan(index, [gcd]);
  assert.deepEqual(await homes.snapshot(), before);
  assert.equal(fs.existsSync(path.join(homes.codexHome, 'arc-role-dispatch')), false);
  homes.writeLease({dispatchId:'d2'});
  const withLease = await homes.snapshot();
  await scan(index, [gcd]);
  assert.deepEqual(await homes.snapshot(), withLease);
  const absent = createDispatchIndex({codexHome:null});
  assert.deepEqual(await scan(absent, [gcd], true), []);
  assert.deepEqual(absent.list(), []);
});
