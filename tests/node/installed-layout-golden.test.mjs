import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {openRoot} from '../../lib/safe-fs/index.mjs';
import {loadNative} from '../../lib/safe-fs/native.mjs';

// 먼저 fixture를 읽어 초기 RED가 기준 산출물의 누락을 드러내게 한다.
const golden = JSON.parse(fs.readFileSync(new URL('./fixtures/installed-layout-golden.json', import.meta.url), 'utf8'));
const {COMBINATIONS, copyPackageSource, computeInstalledLayout} = await import('./fixtures/installed-layout.mjs');
const native = loadNative({artifactDirectory: 'build/native'});
const safeFs = {openRoot: p => openRoot(p, {native})};
const approvedKeys = [
  'claude/omit/en', 'claude/omit/ko', 'claude/write/en', 'claude/write/ko',
  'codex/omit/en', 'codex/omit/ko', 'codex/write/en', 'codex/write/ko',
];

function packageFixture(t) {
  const packageRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'arc-golden-test-')));
  t.after(() => fs.rmSync(packageRoot, {recursive: true, force: true}));
  copyPackageSource(packageRoot);
  return packageRoot;
}

test('golden fixture covers exactly the 8 approved combinations', () => {
  assert.equal(golden.version, 1);
  assert.deepEqual(Object.keys(golden.combinations).sort(), approvedKeys);
  assert.deepEqual(COMBINATIONS.map(({platform, profiles, language}) => `${platform}/${profiles}/${language}`).sort(), approvedKeys);
});

test('current installed layout matches the golden fixture for every combination', t => {
  const packageRoot = packageFixture(t);
  assert.deepEqual(computeInstalledLayout({packageRoot, safeFs}), golden.combinations);
});

test('installed layout is deterministic across homes and runs', t => {
  const packageRoot = packageFixture(t);
  const first = computeInstalledLayout({packageRoot, safeFs});
  assert.deepEqual(computeInstalledLayout({packageRoot, safeFs}), first);
});

test('golden comparison detects a single changed installed byte', t => {
  const packageRoot = packageFixture(t);
  const before = computeInstalledLayout({packageRoot, safeFs});
  const filename = path.join(packageRoot, 'codex/skill/references/limits.md');
  fs.appendFileSync(filename, 'x');
  execFileSync(process.execPath, [path.join(packageRoot, 'scripts/update-manifest.mjs'), '--root', packageRoot], {stdio: 'pipe'});
  const after = computeInstalledLayout({packageRoot, safeFs});
  const changed = [];
  assert.deepEqual(Object.keys(after), Object.keys(before));
  for (const key of Object.keys(before)) {
    assert.deepEqual(Object.keys(after[key]), Object.keys(before[key]));
    for (const name of Object.keys(before[key])) {
      if (after[key][name] !== before[key][name]) changed.push(`${key} ${name}`);
    }
  }
  assert.deepEqual(changed, [
    'codex/omit/en skills/arc/references/limits.md',
    'codex/omit/ko skills/arc/references/limits.md',
    'codex/write/en skills/arc/references/limits.md',
    'codex/write/ko skills/arc/references/limits.md',
  ]);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
  for (const key of ['codex/omit/en', 'codex/omit/ko', 'codex/write/en', 'codex/write/ko']) {
    assert.equal(after[key]['skills/arc/references/limits.md'], hash);
  }
});
