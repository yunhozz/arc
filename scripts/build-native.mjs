import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { supportedTuple } from '../lib/safe-fs/native.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
function argument(name, fallback) { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; }
const tuple = argument('--tuple', supportedTuple());
if (tuple !== supportedTuple()) throw new Error('Native builds must run on the selected target tuple');
const output = path.resolve(argument('--output', `build/native/${tuple}`));
const headerCache = path.join(root, 'build/node-headers');
const build = spawnSync(process.execPath, [path.join(root, 'node_modules/node-gyp/bin/node-gyp.js'), 'rebuild', '--devdir', headerCache, '--directory', path.join(root, 'native')], { stdio: 'inherit', env: { ...process.env, MACOSX_DEPLOYMENT_TARGET: '13.0' } });
if (build.status !== 0) process.exit(build.status ?? 1);
const binary = fs.readFileSync(path.join(root, 'native/build/Release/arc_safe_fs.node'));
const digest = crypto.createHash('sha256');
for (const name of ['native/binding.c', 'native/binding.gyp', 'scripts/build-native.mjs', 'package-lock.json']) digest.update(name).update('\0').update(fs.readFileSync(path.join(root, name))).update('\0');
const command = (cmd, args) => { const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8' }); if (r.status !== 0) throw new Error(`Cannot identify build input: ${cmd}`); return r.stdout.trim(); };
const headerDigest = crypto.createHash('sha256');
function hashTree(directory, relative = '') {
  for (const name of fs.readdirSync(path.join(directory, relative)).sort()) {
    const child = path.join(relative, name); const filename = path.join(directory, child);
    if (fs.lstatSync(filename).isDirectory()) hashTree(directory, child);
    else headerDigest.update(child).update('\0').update(fs.readFileSync(filename)).update('\0');
  }
}
hashTree(path.join(headerCache, process.versions.node, 'include/node'));
const libc = process.platform === 'linux' ? command('getconf', ['GNU_LIBC_VERSION']) : null;
if (libc && libc !== 'glibc 2.28') throw new Error('Release Linux native builds require the glibc 2.28 build image');
const record = { sha256: crypto.createHash('sha256').update(binary).digest('hex'), sourceCommit: command('git', ['rev-parse', 'HEAD']), nativeInputDigest: digest.digest('hex'), napi: 8, nodeHeaders: process.versions.node, nodeHeadersDigest: headerDigest.digest('hex'), sourceDirty: Boolean(command('git', ['status', '--porcelain', '--untracked-files=no'])), buildImage: process.env.ARC_BUILD_IMAGE ?? null, libc, compiler: command('cc', ['--version']), sysroot: process.platform === 'darwin' ? command('xcrun', ['--show-sdk-path']) : command('cc', ['-print-sysroot']) || '/', deploymentTarget: process.platform === 'darwin' ? '13.0' : 'glibc-2.28', tuple };
fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, 'arc_safe_fs.node'), binary);
fs.writeFileSync(path.join(output, 'provenance.json'), JSON.stringify(record, null, 2) + '\n');
const base = path.dirname(output); const indexFile = path.join(base, 'index.json');
const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile)) : { artifacts: {} };
index.artifacts[tuple] = record; fs.writeFileSync(indexFile, JSON.stringify(index, null, 2) + '\n');
console.log(`Built ${tuple}: ${record.sha256}`);
