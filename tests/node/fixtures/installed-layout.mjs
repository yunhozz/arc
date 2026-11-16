import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createPlatformRegistry, DEFAULT_PLATFORM_REGISTRY} from '../../../lib/runtime/platform-registry.mjs';
import {createInstallerRegistry, DEFAULT_INSTALLER_REGISTRY} from '../../../lib/platforms/index.mjs';
import {verifyPayload} from '../../../lib/installer/manifest.mjs';
import {buildInstallPlan} from '../../../lib/installer/plan.mjs';
import {resolveTarget} from '../../../lib/installer/targets.mjs';
import {openRoot} from '../../../lib/safe-fs/index.mjs';
import {loadNative} from '../../../lib/safe-fs/native.mjs';

const sourceRoot = fileURLToPath(new URL('../../../', import.meta.url));
export const GOLDEN_PATH = fileURLToPath(new URL('./installed-layout-golden.json', import.meta.url));
export const COMBINATIONS = Object.freeze(['codex', 'claude', 'gemini'].flatMap(platform =>
  ['write', 'omit'].flatMap(profiles => ['en', 'ko'].map(language =>
    Object.freeze({platform, profiles, language})))));

export function copyPackageSource(destination) {
  const entries = [
    'README.md', 'install.command', 'package.json', 'package-lock.json',
    'bin', 'lib', 'scripts', 'vendor', 'prebuilds', 'native', 'codex', 'claude', 'gemini',
  ];
  if (fs.existsSync(path.join(sourceRoot, 'shared'))) entries.push('shared');
  for (const entry of entries) {
    fs.cpSync(path.join(sourceRoot, entry), path.join(destination, entry), {
      recursive: true,
      filter(source) {
        const relative = path.relative(sourceRoot, source).split(path.sep).join('/');
        return relative !== 'scripts/update-superpowers-local.sh'
          && !relative.split('/').some(name => name === '__pycache__' || name === '.DS_Store');
      },
    });
  }
  execFileSync(process.execPath, [path.join(destination, 'scripts/update-manifest.mjs'), '--root', destination], {stdio: 'pipe'});
}

export function computeInstalledLayout({packageRoot, safeFs}) {
  const runtimePlatforms = createPlatformRegistry(DEFAULT_PLATFORM_REGISTRY.platforms.map(p => p.id === 'gemini' ? {...p, capabilities: {...p.capabilities, ...Object.fromEntries(['install', 'standalone', 'nativeProfile', 'catalog'].map(key => [key, {state: 'verified'}]))}} : p));
  const platforms = createInstallerRegistry({runtime: runtimePlatforms, descriptors: runtimePlatforms.platforms.map(p => ({...DEFAULT_INSTALLER_REGISTRY.getPlatform(p.id), runtime: p}))});
  const context = {platforms, runtimePlatforms};
  const payload = verifyPayload({packageRoot, safeFs, payloadMode: 'package', ...context});
  const combinations = [];
  for (const {platform, profiles, language} of COMBINATIONS) {
    const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'arc-golden-home-')));
    try {
      const target = resolveTarget(platform, {userHome: home, env: {}, cwd: home, ...context});
      const plan = buildInstallPlan({payload, target, profiles, language, safeFs, skipGlobal: true, ...context});
      const files = [...plan.generated.skill].map(([name, bytes]) => [`skills/arc/${name}`, bytes]);
      if (profiles === 'write') {
        for (const [name, bytes] of plan.profileWrites) files.push([`agents/${name}`, bytes]);
      }
      const hashes = files.map(([name, bytes]) => [name, crypto.createHash('sha256').update(bytes).digest('hex')]);
      hashes.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
      combinations.push([`${platform}/${profiles}/${language}`, Object.fromEntries(hashes)]);
    } finally {
      fs.rmSync(home, {recursive: true, force: true});
    }
  }
  combinations.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return Object.fromEntries(combinations);
}

function main(mode) {
  if (!['--write', '--diff'].includes(mode)) throw new Error('Usage: installed-layout.mjs --write | --diff');
  const packageRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'arc-golden-package-')));
  try {
    copyPackageSource(packageRoot);
    const native = loadNative({artifactDirectory: 'build/native'});
    const safeFs = {openRoot: p => openRoot(p, {native})};
    const combinations = computeInstalledLayout({packageRoot, safeFs});
    if (mode === '--write') {
      fs.writeFileSync(GOLDEN_PATH, JSON.stringify({version: 1, combinations}, null, 2) + '\n');
      return;
    }
    const golden = JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8')).combinations;
    const lines = [];
    for (const key of new Set([...Object.keys(golden), ...Object.keys(combinations)])) {
      const previous = golden[key] ?? {}, current = combinations[key] ?? {};
      for (const name of new Set([...Object.keys(previous), ...Object.keys(current)])) {
        if (!Object.hasOwn(previous, name)) lines.push(`+ ${key} ${name}`);
        else if (!Object.hasOwn(current, name)) lines.push(`- ${key} ${name}`);
        else if (previous[name] !== current[name]) lines.push(`~ ${key} ${name}`);
      }
    }
    for (const line of lines.sort()) console.log(line);
  } finally {
    fs.rmSync(packageRoot, {recursive: true, force: true});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv[2]);
