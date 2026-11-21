import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {makeHomes} from './fixtures/watch/homes.mjs';
import {parseLeaseLenient, createDispatchIndex} from '../../lib/watch/dispatch.mjs';
import {createTestRuntimeRegistry} from './fixtures/platforms/zeta.mjs';

const scan = (index, gitCommonDirs = []) => index.scan({gitCommonDirs});
const artifacts = (homes, gcd, id, files) => homes.writeArtifacts(gcd, 'w1', `dispatches/${id}`, files);

async function resolveStore(args) {
  const file = new URL('../../lib/watch/anchor-store.mjs', import.meta.url);
  assert.ok(fs.existsSync(file), 'watch anchor store resolver must exist');
  return (await import(file.href)).resolveDispatchStore(args);
}

test('watch reads claude anchor store', async t => {
  const h = makeHomes(t), homes = {codex:h.codexHome, claude:h.claudeHome};
  h.writeMarker('codex', homes.codex, homes.claude);
  h.writeMarker('claude', homes.claude);
  h.writeLease({dispatchId:'claude-anchor'}, homes.claude);
  h.writeLease({dispatchId:'old-anchor'});
  const before = await h.snapshot(), result = await resolveStore({homes});
  assert.deepEqual(result, {kind:'anchor', dir:path.join(homes.claude, 'arc-role-dispatch')});
  const index = createDispatchIndex({storeDir:result.dir});
  await scan(index, []);
  assert.deepEqual(index.list().map(ref => ref.dispatchId), ['claude-anchor']);
  assert.deepEqual(await h.snapshot(), before);
});

test('watch reads codex anchor store for S={codex,zeta}', async t => {
  const h = makeHomes(t), homes = {codex:h.codexHome, zeta:path.join(h.userHome, '.zeta')};
  h.writeMarker('codex', homes.codex);
  h.writeMarker('zeta', homes.zeta, homes.codex);
  h.writeLease({dispatchId:'codex-anchor'});
  const visited = [], result = await resolveStore({homes, registry:createTestRuntimeRegistry(['zeta', 'codex']),
    readMarker:async file => { visited.push(path.dirname(file)); return fs.promises.readFile(file, 'utf8'); }});
  assert.deepEqual(visited, [homes.codex, homes.zeta]);
  assert.deepEqual(result, {kind:'anchor', dir:path.join(homes.codex, 'arc-role-dispatch')});
  const index = createDispatchIndex({storeDir:result.dir});
  await scan(index, []);
  assert.deepEqual(index.list().map(ref => ref.dispatchId), ['codex-anchor']);
});

test('watch falls back to CODEX_HOME store with zero candidates', async t => {
  const h = makeHomes(t);
  h.writeLease({dispatchId:'legacy'});
  const result = await resolveStore({homes:{codex:h.codexHome, claude:h.claudeHome}});
  assert.deepEqual(result, {kind:'legacy', dir:path.join(h.codexHome, 'arc-role-dispatch')});
  const index = createDispatchIndex({storeDir:result.dir});
  await scan(index, []);
  assert.deepEqual(index.list().map(ref => ref.dispatchId), ['legacy']);
  assert.deepEqual(await resolveStore({homes:{claude:h.claudeHome}}), {kind:'none'});
});

test('unregistered activeConfigPath is not a candidate', async t => {
  const h = makeHomes(t), outside = path.join(h.root, 'unregistered');
  h.writeMarker('claude', h.claudeHome, outside);
  const before = await h.snapshot();
  assert.deepEqual(await resolveStore({homes:{claude:h.claudeHome, user:outside}}), {kind:'none'});
  assert.deepEqual(await h.snapshot(), before);
});

test('parseLeaseLenient reads v2 like v1', () => {
  const lease = {dispatchId:'d-v2', workflowId:'wf', role:'arc_qa', route:'bridge', hostPlatform:'codex',
    state:'running', sessionId:'session', nativeAgentId:'agent', createdAt:'created', updatedAt:'updated', reasons:['reason']};
  assert.deepEqual(parseLeaseLenient(JSON.stringify({version:2, targetPlatform:'claude', ...lease})),
    parseLeaseLenient(JSON.stringify({version:1, ...lease})));
});

test('watch ignores malformed, mismatched and noncanonical markers', async t => {
  const h = makeHomes(t), homes = {claude:h.claudeHome};
  const invalid = [
    {version:2}, {revision:''}, {platform:'codex'}, {targetHome:h.codexHome}, {configHash:'bad'},
    {runtime:{version:'1', hash:'bad', policyHash:'bad'}}, {profiles:[]}, {extra:true},
    {activeConfigPath:'relative/arc-role-platform-routing.json'},
    {activeConfigPath:path.join(h.claudeHome, 'other.json')},
    {activeConfigPath:h.claudeHome + '/../.claude/arc-role-platform-routing.json'},
  ];
  for (const overrides of invalid) {
    h.writeMarker('claude', h.claudeHome, h.claudeHome, overrides);
    assert.deepEqual(await resolveStore({homes}), {kind:'none'}, JSON.stringify(overrides));
  }
  const marker = h.writeMarker('claude', h.claudeHome);
  fs.writeFileSync(marker, '{');
  assert.deepEqual(await resolveStore({homes}), {kind:'none'});
  assert.deepEqual(await resolveStore({homes, readMarker:async () => { throw Error('unreadable'); }}), {kind:'none'});
  assert.deepEqual(await resolveStore({homes:{codex:h.codexHome}}), {kind:'none'});
});

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
  const absent = createDispatchIndex({storeDir:null});
  assert.equal((await scan(absent, [gcd])).length, 1);
  assert.equal(absent.bySession('T1').inScope, true);
  assert.deepEqual(absent.list().map(ref => ref.dispatchId), ['d1']);
  assert.equal(absent.byId('d2'), null);
  assert.deepEqual(await homes.snapshot(), withLease);
});
