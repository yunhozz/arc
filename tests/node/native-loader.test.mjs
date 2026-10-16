import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
const api = await import('../../lib/safe-fs/native.mjs').catch(() => ({}));
const root = fileURLToPath(new URL('../../', import.meta.url));
const tuple = api.supportedTuple();
function fixture(t) { const p = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-loader-')); t.after(() => fs.rmSync(p, { recursive: true, force: true })); return p; }
function artifact(t) {
  const p = fixture(t); const base = `${p}/prebuilds`; fs.mkdirSync(`${base}/${tuple}`, { recursive: true });
  const bytes = fs.readFileSync(`${root}/build/native/${tuple}/arc_safe_fs.node`);
  const record = { sha256: crypto.createHash('sha256').update(bytes).digest('hex'), napi: 8 };
  fs.writeFileSync(`${base}/${tuple}/arc_safe_fs.node`, bytes);
  fs.writeFileSync(`${base}/index.json`, JSON.stringify({ artifacts: { [tuple]: record } }));
  return { p, base, bytes, record };
}
test('native loader exists', () => assert.equal(typeof api.loadNative, 'function'));
test('unsupported runtime rejects before artifact lookup', () => {
  for (const [runtime, message] of [
    [{ platform: 'win32', arch: 'x64', node: '22.0.0' }, /Unsupported/],
    [{ platform: 'linux', arch: 'riscv64', node: '22.0.0', glibc: '2.28' }, /Unsupported/],
    [{ platform: 'linux', arch: 'x64', node: '22.0.0' }, /glibc/],
    [{ platform: 'linux', arch: 'x64', node: '22.0.0', glibc: '2.27' }, /glibc/],
    [{ platform: 'darwin', arch: 'arm64', node: '20.0.0' }, /Node.js/],
  ]) assert.throws(() => api.loadNative({ root: '/nonexistent', runtime }), message);
});
test('missing native index fails without writes', t => {
  const p = fixture(t); assert.throws(() => api.loadNative({ root: p }), /index unavailable/); assert.deepEqual(fs.readdirSync(p), []);
});
test('tampered bytes and wrong binary type fail without modifying package', t => {
  const { p, base, record } = artifact(t);
  const filename = `${base}/${tuple}/arc_safe_fs.node`; fs.writeFileSync(filename, 'tamper');
  assert.throws(() => api.loadNative({ root: p }), /hash mismatch/);
  record.sha256 = crypto.createHash('sha256').update('tamper').digest('hex'); fs.writeFileSync(`${base}/index.json`, JSON.stringify({ artifacts: { [tuple]: record } }));
  assert.throws(() => api.loadNative({ root: p }), /Invalid native/);
  assert.equal(fs.readFileSync(filename, 'utf8'), 'tamper'); assert.deepEqual(fs.readdirSync(p), ['prebuilds']);
});
test('valid host artifact loads without creating temporary files', t => {
  const { p, base, bytes } = artifact(t);
  const temporary = path.join(p, 'temporary'); fs.mkdirSync(temporary);
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import fs from 'node:fs';
    import os from 'node:os';
    import assert from 'node:assert/strict';
    import { pathToFileURL } from 'node:url';
    const { loadNative } = await import(pathToFileURL(process.argv[1]));
    const before = fs.readdirSync(os.tmpdir()).sort();
    const native = loadNative({ root: process.argv[2] });
    assert.equal(typeof native.openRoot, 'function');
    assert.deepEqual(fs.readdirSync(os.tmpdir()).sort(), before);
  `, path.join(root, 'lib/safe-fs/native.mjs'), p], {
    encoding: 'utf8', env: { ...process.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary },
  });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(fs.readFileSync(`${base}/${tuple}/arc_safe_fs.node`), bytes);
});
import { spawnSync } from 'node:child_process';
test('manifest checker detects protected payload drift', t => {
  const p = fixture(t); fs.writeFileSync(`${p}/README.md`, 'original');
  const script = `${root}/scripts/update-manifest.mjs`;
  let run = spawnSync(process.execPath, [script, '--root', p], { encoding: 'utf8' }); assert.equal(run.status, 0, run.stderr);
  fs.writeFileSync(`${p}/README.md`, 'changed'); run = spawnSync(process.execPath, [script, '--root', p, '--check'], { encoding: 'utf8' }); assert.equal(run.status, 1);
});
test('parity checker detects removal of a legacy assertion', t => {
  const p = fixture(t); fs.mkdirSync(`${p}/tests`);
  fs.writeFileSync(`${p}/tests/test_install.py`, 'class Example:\n    def test_one(self): pass\n'); fs.writeFileSync(`${p}/tests/test_target_install.py`, '');
  fs.writeFileSync(`${p}/tests/installer-parity.json`, JSON.stringify({ entries: [] }));
  const run = spawnSync(process.execPath, [`${root}/scripts/check-installer-parity.mjs`, '--root', p, '--task', 'T1'], { encoding: 'utf8' });
  assert.equal(run.status, 1); assert.match(run.stderr, /Missing legacy assertion/);
});
test('macOS before 13 is rejected before loading', () => {
  assert.throws(() => api.loadNative({ root: '/nonexistent', runtime: { platform: 'darwin', arch: 'arm64', node: '22.0.0', release: '21.6.0' } }), /macOS 13/);
});
test('uses GNU tuple tags and stable loader classification', t => {
  assert.equal(api.supportedTuple({ platform: 'linux', arch: 'x64', node: '22.0.0', glibc: '2.28' }), 'linux-x64-gnu');
  assert.equal(api.supportedTuple({ platform: 'linux', arch: 'arm64', node: '24.0.0', glibc: '2.28' }), 'linux-arm64-gnu');
  assert.throws(() => api.loadNative({ root: fixture(t) }), { code: 'ARC_NATIVE_UNAVAILABLE' });
  assert.throws(() => api.loadNative({ runtime: { platform: 'win32', arch: 'x64', node: '22.0.0' } }), { code: 'ARC_UNSUPPORTED_RUNTIME' });
});
