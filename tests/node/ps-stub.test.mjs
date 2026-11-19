import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {accessSync, constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {processStartTime} from '../../lib/runtime/role-supervisor.mjs';

const stub = fileURLToPath(new URL('../fixtures/bin/ps', import.meta.url));

test('ps stub is executable', () => {
  accessSync(stub, constants.X_OK);
});

const runPs = (...args) => spawnSync(process.execPath, [stub, ...args], {encoding: 'utf8'});

test('ps stub reports a stable identity for a live PID', () => {
  const result = runPs('-o', 'lstart=', '-p', String(process.pid));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `stub ${process.pid}\n`);
});

test('processStartTime runs the ps stub through the node shim', async () => {
  const {psStubPath, withPath} = await import('./fixtures/ps-stub.mjs');
  const identity = await withPath(psStubPath('/usr/bin:/bin'), () => processStartTime(process.pid));
  assert.equal(identity, `stub ${process.pid}`);
});

test('ps stub fails for a nonexistent PID', () => {
  const result = runPs('-o', 'lstart=', '-p', '2147483000');
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

test('ps stub rejects unsupported arguments', () => {
  const result = runPs('-axo', 'pid=,command=');
  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.stderr, 'ps stub: unsupported arguments\n');
});

test('psStubPath puts the stub and node shim before the base PATH', async () => {
  const {NODE_SHIM_DIR, psStubPath} = await import('./fixtures/ps-stub.mjs');
  const base = '/usr/bin:/bin';
  assert.equal(psStubPath(base), [path.dirname(stub), NODE_SHIM_DIR, base].join(path.delimiter));
});

test('installPsStub prepends the stub and node shim only once', async () => {
  const {NODE_SHIM_DIR, installPsStub, withPath} = await import('./fixtures/ps-stub.mjs');
  const base = '/usr/bin:/bin';
  await withPath(base, () => {
    const expected = [path.dirname(stub), NODE_SHIM_DIR, base].join(path.delimiter);
    installPsStub();
    assert.equal(process.env.PATH, expected);
    installPsStub();
    assert.equal(process.env.PATH, expected);
  });
});
