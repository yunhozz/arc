import {spawnSync} from 'node:child_process';
import {accessSync, constants, mkdtempSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const PS_STUB_DIR = fileURLToPath(new URL('../../fixtures/bin', import.meta.url));
export const ORIGINAL_PATH = process.env.PATH;

try {
  accessSync(path.join(PS_STUB_DIR, 'ps'), constants.X_OK);
} catch (error) {
  throw new Error('tests/fixtures/bin/ps is not executable', {cause: error});
}

export const NODE_SHIM_DIR = mkdtempSync(path.join(os.tmpdir(), 'arc-ps-node-'));
process.on('exit', () => rmSync(NODE_SHIM_DIR, {recursive: true, force: true}));
symlinkSync(process.execPath, path.join(NODE_SHIM_DIR, 'node'));

export function psStubPath(base) {
  return [PS_STUB_DIR, NODE_SHIM_DIR, base].join(path.delimiter);
}

export function installPsStub() {
  if (process.env.PATH?.split(path.delimiter, 1)[0] !== PS_STUB_DIR) {
    process.env.PATH = psStubPath(process.env.PATH);
  }
}

export function realPs(args) {
  return spawnSync('ps', args, {encoding: 'utf8', env: {PATH: ORIGINAL_PATH, LC_ALL: 'C'}, timeout: 5000});
}

let available;
export function psAvailable() {
  if (available === undefined) {
    const result = realPs(['-o', 'lstart=', '-p', String(process.pid)]);
    available = result.status === 0 && Boolean(result.stdout?.trim());
  }
  return available;
}

export async function withPath(value, fn) {
  const previous = process.env.PATH;
  if (value === undefined) delete process.env.PATH;
  else process.env.PATH = value;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.PATH;
    else process.env.PATH = previous;
  }
}

export function writeFailingPs(dir, recordFile) {
  const quotedRecordFile = "'" + recordFile.replaceAll("'", "'\"'\"'") + "'";
  writeFileSync(path.join(dir, 'ps'), `#!/bin/sh\nprintf '%s\\n' "$4" >> ${quotedRecordFile}\nexit 1\n`, {mode: 0o755});
}
