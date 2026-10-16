import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const module = await import('../../lib/safe-fs/index.mjs').catch(() => ({}));
const loader = await import('../../lib/safe-fs/native.mjs').catch(() => ({}));
let native;
try { native = loader.loadNative({ artifactDirectory: 'build/native' }); } catch {}
const api = { openRoot: typeof module.openRoot === 'function' ? p => module.openRoot(p, { native }) : undefined };
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'arc-safe-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
test('safe filesystem exports the descriptor root API', () => assert.equal(typeof api.openRoot, 'function'));
test('rejects unsafe components and symlink roots and leaves', t => {
  const p = fixture(t); fs.mkdirSync(`${p}/real`); fs.symlinkSync('real', `${p}/link`);
  assert.throws(() => api.openRoot(`${p}/link`));
  const d = api.openRoot(p); t.after(() => d.close());
  for (const name of ['', '.', '..', 'a/b', 'a\0b']) assert.throws(() => d.openDir(name));
  assert.throws(() => d.openDir('link'));
  fs.writeFileSync(`${p}/real/file`, 'secret'); fs.symlinkSync('real/file', `${p}/leaf`);
  assert.throws(() => d.openFile('leaf'));
});
test('held parent survives replacement without following outside sentinel', t => {
  const p = fixture(t); fs.mkdirSync(`${p}/inside`); fs.mkdirSync(`${p}/outside`);
  fs.writeFileSync(`${p}/outside/sentinel`, 'outside');
  const root = api.openRoot(p); const held = root.openDir('inside');
  t.after(() => { held.close(); root.close(); });
  fs.renameSync(`${p}/inside`, `${p}/old`); fs.symlinkSync('outside', `${p}/inside`);
  assert.throws(() => root.openDir('inside'));
  const f = held.openFile('sentinel', { create: true, exclusive: true }); f.write(Buffer.from('inside')); f.close();
  assert.equal(fs.readFileSync(`${p}/outside/sentinel`, 'utf8'), 'outside');
  assert.equal(fs.readFileSync(`${p}/old/sentinel`, 'utf8'), 'inside');
});
test('rejects FIFO without blocking and rejects directories as files', t => {
  const p = fixture(t); const result = spawnSync('mkfifo', [`${p}/pipe`]); assert.equal(result.status, 0);
  const d = api.openRoot(p); t.after(() => d.close());
  assert.throws(() => d.openFile('pipe')); assert.throws(() => d.openFile('missing'));
  fs.mkdirSync(`${p}/dir`); assert.throws(() => d.openFile('dir'));
});
test('file metadata, relative rename, timestamps and closed handles', t => {
  const p = fixture(t); const d = api.openRoot(p); d.mkdir('sub'); const sub = d.openDir('sub');
  const f = d.openFile('a', { create: true, exclusive: true });
  f.write(Buffer.from('hello')); f.sync(); assert.equal(f.read().toString(), 'hello');
  assert.equal(f.stat().size, 5n); assert.ok(f.stat().ino); f.chmod(0o600); f.setTimes(1700000000, 1700000000); f.close();
  assert.throws(() => f.read()); d.renameTo('a', sub, 'b'); assert.deepEqual(sub.readDir(), ['b']);
  assert.equal(sub.lstat('b').size, 5n); sub.unlink('b'); sub.close(); d.rmdir('sub'); d.sync(); d.close(); assert.throws(() => d.stat());
});
test('open file keeps identity when leaf is replaced by outside symlink', t => {
  const p = fixture(t); fs.writeFileSync(`${p}/file`, 'inside'); fs.writeFileSync(`${p}/sentinel`, 'outside');
  const d = api.openRoot(p), f = d.openFile('file'); t.after(() => { f.close(); d.close(); });
  fs.renameSync(`${p}/file`, `${p}/saved`); fs.symlinkSync('sentinel', `${p}/file`);
  assert.equal(f.read().toString(), 'inside'); assert.throws(() => d.openFile('file'));
  d.unlink('file'); assert.equal(fs.readFileSync(`${p}/sentinel`, 'utf8'), 'outside');
});
test('failed exclusive creation does not truncate existing content', t => {
  const p = fixture(t); fs.writeFileSync(`${p}/existing`, 'preserve'); const d = api.openRoot(p); t.after(() => d.close());
  assert.throws(() => d.openFile('existing', { create: true, exclusive: true })); assert.equal(fs.readFileSync(`${p}/existing`, 'utf8'), 'preserve');
});
test('creates and reads a symlink relative to held directory without following it', t => {
  const p = fixture(t); fs.mkdirSync(`${p}/inside`); fs.mkdirSync(`${p}/outside`); fs.writeFileSync(`${p}/outside/sentinel`, 'outside');
  const d = api.openRoot(p); const held = d.openDir('inside'); t.after(() => { held.close(); d.close(); });
  fs.renameSync(`${p}/inside`, `${p}/saved`); fs.symlinkSync('outside', `${p}/inside`);
  held.symlink('../outside/sentinel', 'link'); assert.equal(held.readlink('link'), '../outside/sentinel');
  assert.throws(() => held.openFile('link')); held.unlink('link');
  assert.equal(fs.readFileSync(`${p}/outside/sentinel`, 'utf8'), 'outside');
});
test('preserves bigint identities and nanosecond timestamps', t => {
  const p = fixture(t); fs.writeFileSync(`${p}/file`, 'abc'); const d = api.openRoot(p); const f = d.openFile('file');
  t.after(() => { f.close(); d.close(); }); const expected = fs.statSync(`${p}/file`, { bigint: true });
  for (const actual of [f.stat(), d.lstat('file')]) {
    for (const field of ['dev', 'ino', 'size', 'mode', 'mtimeNs', 'ctimeNs', 'atimeNs']) assert.equal(actual[field], expected[field], field);
  }
});
test('applies explicit directory and exclusive file modes without truncation', t => {
  const p = fixture(t); const d = api.openRoot(p); t.after(() => d.close());
  d.mkdir('dir', 0o750); assert.equal(Number(fs.statSync(`${p}/dir`, { bigint: true }).mode & 0o777n), 0o750 & ~process.umask());
  const f = d.openFile('created', { createExclusive: true, mode: 0o640 }); f.write('value'); f.close();
  assert.equal(fs.statSync(`${p}/created`).mode & 0o777, 0o640 & ~process.umask());
  assert.throws(() => d.openFile('created', { createExclusive: true, mode: 0o600 }), { code: 'EEXIST' });
  const read = d.openFile('created', { read: true }); assert.equal(read.read().toString(), 'value'); assert.throws(() => read.write('oops')); read.close();
});
test('OS errors expose stable errno codes', t => { const p = fixture(t); const d = api.openRoot(p); t.after(() => d.close()); assert.throws(() => d.openFile('missing'), { code: 'ENOENT' }); });
import net from 'node:net';
test('rejects Unix sockets without opening or reading their peer', async t => {
  const p = fixture(t); const socket = net.createServer(); await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(`${p}/socket`, resolve); });
  try { const d = api.openRoot(p); try { assert.throws(() => d.openFile('socket')); } finally { d.close(); } }
  finally { await new Promise(resolve => socket.close(resolve)); }
});
test('failed file-type validation closes the newly opened descriptor', t => {
  const p = fixture(t); fs.mkdirSync(`${p}/directory`); const d = api.openRoot(p); t.after(() => d.close());
  const before = fs.readdirSync('/dev/fd').length;
  for (let i = 0; i < 64; i++) assert.throws(() => d.openFile('directory'));
  assert.equal(fs.readdirSync('/dev/fd').length, before);
});
test('readAll and writeAll provide complete descriptor IO', t => {
  const p = fixture(t); const d = api.openRoot(p); const f = d.openFile('file', { createExclusive: true });
  t.after(() => { f.close(); d.close(); });
  const content = Buffer.alloc(150000, 0x61); assert.equal(f.writeAll(content), content.length); assert.deepEqual(f.readAll(), content);
});
test('setTimes accepts metadata nanoseconds without losing precision', t => {
  const p = fixture(t); const d = api.openRoot(p); const f = d.openFile('file', { createExclusive: true });
  t.after(() => { f.close(); d.close(); });
  const times = { atimeNs: 1700000000123456789n, mtimeNs: 1700000000987654321n };
  f.setTimes(times); assert.equal(f.stat().atimeNs, times.atimeNs); assert.equal(f.stat().mtimeNs, times.mtimeNs);
  d.setTimes(times); assert.equal(d.stat().mtimeNs, times.mtimeNs); assert.equal(d.stat().atimeNs, times.atimeNs);
  assert.throws(() => f.setTimes({ atimeNs: 1700000000, mtimeNs: 1700000000 }), /BigInt/);
});
