import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
export function hostRuntime() {
  return { platform: process.platform, arch: process.arch, node: process.versions.node, release: os.release(),
    glibc: process.report?.getReport().header.glibcVersionRuntime };
}
function runtimeError(message) { return Object.assign(new Error(message), { code: 'ARC_UNSUPPORTED_RUNTIME' }); }
export function supportedTuple(runtime = hostRuntime()) {
  const major = Number(runtime.node?.split('.')[0]);
  if (!Number.isInteger(major) || major < 22) throw runtimeError('Node.js 22 or later is required');
  if (!['darwin', 'linux'].includes(runtime.platform) || !['arm64', 'x64'].includes(runtime.arch)) throw runtimeError('Unsupported operating system or CPU');
  if (runtime.platform === 'darwin' && !(Number(runtime.release?.split('.')[0]) >= 22)) throw runtimeError('macOS 13 or later is required');
  if (runtime.platform === 'linux') {
    const [major, minor] = (runtime.glibc ?? '').split('.').map(Number);
    if (!(major > 2 || major === 2 && minor >= 28)) throw runtimeError('glibc 2.28 or later is required');
  }
  return `${runtime.platform}-${runtime.arch}${runtime.platform === 'linux' ? '-gnu' : ''}`;
}
function verifyHeader(bytes, tuple) {
  const [platform, arch] = tuple.split('-');
  if (platform === 'darwin') {
    if (bytes.length < 32 || bytes.readUInt32LE(0) !== 0xfeedfacf || bytes.readUInt32LE(4) !== (arch === 'arm64' ? 0x100000c : 0x1000007)) throw new Error('Invalid native Mach-O binary');
  } else if (bytes.length < 64 || bytes.subarray(0, 4).toString('hex') !== '7f454c46' || bytes[4] !== 2 || bytes[5] !== 1 || bytes.readUInt16LE(18) !== (arch === 'arm64' ? 183 : 62)) throw new Error('Invalid native ELF binary');
}
export function loadNative({ root = packageRoot, runtime = hostRuntime(), artifactDirectory = 'prebuilds' } = {}) {
  const tuple = supportedTuple(runtime);
  try {
  const artifactRoot = path.join(root, artifactDirectory);
  let records;
  try { records = JSON.parse(fs.readFileSync(path.join(artifactRoot, 'index.json'), 'utf8')).artifacts; }
  catch (error) { throw new Error('Native artifact index unavailable: ' + error.message); }
  const record = records?.[tuple];
  if (!record || record.napi !== 8 || !/^[a-f0-9]{64}$/.test(record.sha256 ?? '')) throw new Error('Invalid native artifact record');
  const binaryPath = path.join(artifactRoot, tuple, 'arc_safe_fs.node');
  const descriptor = fs.openSync(binaryPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  let bytes;
  try {
    if (!fs.fstatSync(descriptor).isFile()) throw new Error('Native artifact is not a regular file');
    bytes = fs.readFileSync(descriptor);
  } finally { fs.closeSync(descriptor); }
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== record.sha256) throw new Error('Native artifact hash mismatch');
  verifyHeader(bytes, tuple);
  // The package is trusted executable code. Concurrent replacement of package
  // code between verification and loading is outside the target-directory race
  // protection boundary. Bootstrap performs no filesystem writes.
  return require(binaryPath);
  } catch (cause) { throw Object.assign(new Error(cause.message, { cause }), { code: 'ARC_NATIVE_UNAVAILABLE' }); }
}
