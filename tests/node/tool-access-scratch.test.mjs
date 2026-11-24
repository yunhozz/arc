import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import * as toolAccess from '../../lib/runtime/tool-access.mjs';

const uid = process.getuid();
const mode = async filename => (await fs.lstat(filename)).mode & 0o777;
const api = name => {
  assert.equal(typeof toolAccess[name], 'function', `${name} implements the scratch contract`);
  return toolAccess[name];
};

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'arc-tool-access-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  return {root, scratch: path.join(root, 'scratch'), parent: null, uid};
}

test('createScratch makes 0700 root and four 0700 subdirectories', async t => {
  const createScratch = api('createScratch');
  const input = await fixture(t);
  const previous = process.umask(0o777);
  try { await createScratch(input); } finally { process.umask(previous); }
  assert.equal(await mode(input.scratch), 0o700);
  assert.deepEqual((await fs.readdir(input.scratch)).sort(), ['cache', 'evidence', 'sock', 'tmp']);
  for (const name of ['cache', 'evidence', 'sock', 'tmp']) {
    const stat = await fs.lstat(path.join(input.scratch, name));
    assert.ok(stat.isDirectory(), name);
    assert.equal(stat.mode & 0o777, 0o700, name);
  }
});

test('createScratch refuses pre-existing path of any type', async t => {
  const createScratch = api('createScratch');
  const {root} = await fixture(t);
  const directory = path.join(root, 'directory'), file = path.join(root, 'file'), link = path.join(root, 'link');
  await fs.mkdir(directory);
  await fs.writeFile(file, 'preserve');
  await fs.symlink(directory, link);
  for (const scratch of [directory, file, link]) {
    await assert.rejects(createScratch({scratch, parent: null, uid}), {reasonCode: 'execution_failed'});
  }
  assert.deepEqual(await fs.readdir(directory), []);
  assert.equal(await fs.readFile(file, 'utf8'), 'preserve');
  assert.equal(await fs.readlink(link), directory);
});

test('Claude scratch parent must be an owned real directory', async t => {
  const createScratch = api('createScratch');
  const {root} = await fixture(t);
  const target = path.join(root, 'target'), parent = path.join(root, 'claude');
  const scratch = path.join(parent, 'scratch');
  await fs.mkdir(target);
  await fs.symlink(target, parent);
  await assert.rejects(createScratch({scratch, parent, uid}), {reasonCode: 'permission_scope_unverified'});
  await assert.rejects(createScratch({scratch: path.join(target, 'scratch'), parent: target, uid: uid + 1}), {reasonCode: 'permission_scope_unverified'});
  assert.deepEqual(await fs.readdir(target), []);
  await fs.unlink(parent);
  await createScratch({scratch, parent, uid});
  assert.equal(await mode(parent), 0o700);
  assert.equal(await mode(scratch), 0o700);
});

test('collectEvidence copies only regular entries within limits', async t => {
  const collectEvidence = api('collectEvidence');
  const defaults = {totalBytes: 16, fileBytes: 4, entries: 16, depth: 8};
  async function prepare(t) {
    const {root, scratch} = await fixture(t);
    const evidence = path.join(scratch, 'evidence'), artifactDir = path.join(root, 'artifacts');
    await fs.mkdir(evidence, {recursive: true});
    await fs.mkdir(artifactDir);
    return {root, scratch, evidence, artifactDir, output: path.join(artifactDir, 'evidence')};
  }

  await t.test('skips special entries and stops at the per-file byte limit', async t => {
    const {root, scratch, evidence, artifactDir, output} = await prepare(t);
    const secret = path.join(root, 'secret');
    await fs.writeFile(secret, 'secret');
    await fs.writeFile(path.join(evidence, 'a.txt'), 'keep');
    await fs.symlink(secret, path.join(evidence, 'b-link'));
    execFileSync('mkfifo', [path.join(evidence, 'c-fifo')]);
    await fs.writeFile(path.join(evidence, 'd-large'), 'oversized');
    await fs.writeFile(path.join(evidence, 'z-small'), 'x');
    const result = await collectEvidence({scratch, artifactDir, limits: defaults});
    assert.equal(result.copied, 1);
    assert.equal(result.truncated, true);
    assert.ok(result.skipped.includes('b-link'));
    assert.ok(result.skipped.includes('c-fifo'));
    assert.deepEqual(await fs.readdir(output), ['a.txt']);
    assert.equal(await fs.readFile(path.join(output, 'a.txt'), 'utf8'), 'keep');
    assert.equal(await mode(path.join(output, 'a.txt')), 0o600);
    assert.equal(await fs.readFile(secret, 'utf8'), 'secret');
  });

  await t.test('stops the entire walk on the first entry at depth 9', async t => {
    const {scratch, evidence, artifactDir, output} = await prepare(t);
    const dirs = 'a/b/c/d/e/f/g';
    await fs.mkdir(path.join(evidence, dirs, 'i'), {recursive: true});
    await fs.writeFile(path.join(evidence, dirs, 'h.txt'), 'keep');
    await fs.writeFile(path.join(evidence, dirs, 'i/too-deep.txt'), 'skip');
    await fs.writeFile(path.join(evidence, 'z-small'), 'x');
    const result = await collectEvidence({scratch, artifactDir, limits: defaults});
    assert.equal(result.truncated, true);
    assert.equal(await fs.readFile(path.join(output, dirs, 'h.txt'), 'utf8'), 'keep');
    await assert.rejects(fs.lstat(path.join(output, dirs, 'i/too-deep.txt')), {code: 'ENOENT'});
    await assert.rejects(fs.lstat(path.join(output, 'z-small')), {code: 'ENOENT'});
  });

  await t.test('stops at the 257th entry in lexical DFS order', async t => {
    const {scratch, evidence, artifactDir, output} = await prepare(t);
    for (let index = 256; index >= 0; index--) {
      await fs.writeFile(path.join(evidence, String(index).padStart(3, '0')), '');
    }
    await fs.writeFile(path.join(evidence, 'z-small'), 'x');
    const result = await collectEvidence({scratch, artifactDir, limits: {...defaults, entries: 256}});
    assert.equal(result.copied, 256);
    assert.equal(result.truncated, true);
    assert.equal((await fs.readdir(output)).length, 256);
    await assert.rejects(fs.lstat(path.join(output, '256')), {code: 'ENOENT'});
    await assert.rejects(fs.lstat(path.join(output, 'z-small')), {code: 'ENOENT'});
  });

  await t.test('rejects a destination symlink and stops at the total byte limit', async t => {
    const {root, scratch, evidence, artifactDir, output} = await prepare(t);
    const outside = path.join(root, 'outside');
    await fs.mkdir(outside);
    await fs.writeFile(path.join(evidence, 'a'), '1234');
    await fs.writeFile(path.join(evidence, 'b'), '5678');
    await fs.writeFile(path.join(evidence, 'z-small'), 'x');
    await fs.symlink(outside, output);
    await assert.rejects(collectEvidence({scratch, artifactDir, limits: defaults}));
    assert.deepEqual(await fs.readdir(outside), []);
    await fs.unlink(output);
    const result = await collectEvidence({scratch, artifactDir, limits: {...defaults, totalBytes: 5}});
    assert.equal(result.truncated, true);
    assert.deepEqual(await fs.readdir(output), ['a']);
  });
});

test('removeScratch removes the tree without following symlinks and reports false on failure', async t => {
  const removeScratch = api('removeScratch');
  const {root, scratch} = await fixture(t);
  const outside = path.join(root, 'outside');
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'keep'), 'preserve');
  await fs.symlink(outside, scratch);
  assert.equal(await removeScratch(scratch), false);
  await fs.unlink(scratch);
  await fs.mkdir(scratch);
  await fs.symlink(outside, path.join(scratch, 'link'));
  assert.equal(await removeScratch(scratch), true);
  await assert.rejects(fs.lstat(scratch), {code: 'ENOENT'});
  assert.equal(await fs.readFile(path.join(outside, 'keep'), 'utf8'), 'preserve');
  if (uid !== 0) {
    const parent = path.join(root, 'locked'), locked = path.join(parent, 'scratch');
    await fs.mkdir(locked, {recursive: true});
    await fs.chmod(parent, 0o500);
    try {
      assert.equal(await removeScratch(locked), false);
    } finally {
      await fs.chmod(parent, 0o700);
    }
  }
  assert.equal(await removeScratch(scratch), false);
});

test('renderEnv substitutes scratch and sorts keys', () => {
  const renderEnv = api('renderEnv');
  const entries = renderEnv(['base', 'caches'], '/x');
  const keys = entries.map(([key]) => key);
  assert.equal(keys[0], 'AGENT_BROWSER_NO_VERSION_CHECK');
  assert.deepEqual(keys, [...keys].sort());
  assert.ok(entries.every(([, value]) => !value.includes('<S>')));
  assert.equal(Object.fromEntries(entries).TMPDIR, '/x/tmp');
  assert.equal(Object.fromEntries(entries).npm_config_cache, '/x/cache/npm');
  assert.throws(() => renderEnv(['base', 'base'], '/x'));
});

test('buildToolContext is deterministic for the same inputs and null for read roles and grok/gemini without toolAccess', () => {
  const buildToolContext = api('buildToolContext');
  const input = {
    platform: 'codex', role: 'arc_tester', dispatchId: 'aabbccdd-eeff-4000-8000-0123456789ab',
    uid, userHome: '/home/test', homes: {codex: '/home/test/.codex'}, envNames: ['Z_TOKEN', 'PATH', 'AWS_REGION'],
    worktree: '/repo', gitDir: '/repo/.git', gitCommonDir: '/repo/.git',
  };
  const context = buildToolContext(input);
  assert.deepEqual(context, buildToolContext({...input}));
  assert.equal(context.scratch, '/private/tmp/arc-bridge-aabbccdd');
  assert.equal(context.parent, null);
  assert.equal(context.hostDir, null);
  assert.deepEqual(context.secretEnvNames, []);
  const claude = buildToolContext({...input, platform: 'claude', toolAccess: {
    network: 'domains', domains: ['example.com'], unixSockets: [], paths: [], services: [], envPresets: ['ci'],
  }});
  assert.equal(claude.parent, `/private/tmp/claude-${uid}`);
  assert.equal(claude.scratch, `/private/tmp/claude-${uid}/arc-bridge-aabbccdd`);
  assert.deepEqual(claude.secretEnvNames, ['AWS_REGION', 'Z_TOKEN']);
  assert.equal(Object.fromEntries(claude.env).CI, '1');
  assert.equal(buildToolContext({...input, role: 'arc_scouter'}), null);
  for (const platform of ['grok', 'gemini']) assert.equal(buildToolContext({...input, platform}), null);
});
