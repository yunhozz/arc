import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const cli = fileURLToPath(new URL('../../lib/runtime/cli.mjs', import.meta.url));
const loadWriter = () => import('../../lib/runtime/handoff-record.mjs');

async function linkedWorktree(t) {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'arc-handoff-')));
  t.after(() => fs.rm(directory, {recursive: true, force: true}));
  const repo = path.join(directory, 'repo');
  const cwd = path.join(directory, 'linked');
  const git = (...args) => execFileSync('git', args, {cwd: directory, stdio: 'pipe'});
  git('init', repo);
  git('-C', repo, '-c', 'user.name=ARC Test', '-c', 'user.email=arc@example.invalid',
    'commit', '--allow-empty', '--no-gpg-sign', '-m', 'Initial commit');
  git('-C', repo, 'worktree', 'add', '--detach', cwd);
  const arc = path.join(repo, '.git', 'arc');
  return {directory, cwd, arc, handoff: path.join(arc, 'handoff')};
}

test('writes and updates record from a linked worktree', async t => {
  const {writeHandoffRecord} = await loadWriter();
  const {cwd, handoff} = await linkedWorktree(t);
  const slug = '2026-11-24-task_T7.v3';
  const record = path.join(handoff, `${slug}.md`);
  assert.deepEqual(await writeHandoffRecord({cwd, slug, content: '# Initial\n'}),
    {decision: 'allow', path: record, created: true});
  assert.equal(await fs.readFile(record, 'utf8'), '# Initial\n');
  if (process.platform !== 'win32') assert.equal((await fs.stat(handoff)).mode & 0o777, 0o700);
  assert.deepEqual(await writeHandoffRecord({cwd, slug, content: '# Updated\n'}),
    {decision: 'allow', path: record, created: false});
  assert.equal(await fs.readFile(record, 'utf8'), '# Updated\n');
  assert.deepEqual(await fs.readdir(handoff), [`${slug}.md`]);
});

test('rejects slug with traversal or separators', async t => {
  const {writeHandoffRecord} = await loadWriter();
  const {cwd, arc} = await linkedWorktree(t);
  for (const slug of ['../x', 'a/b', '..', '', 'a..b', 'a\\b']) {
    const result = await writeHandoffRecord({cwd, slug, content: '# Record\n'});
    assert.equal(result.decision, 'deny', slug);
    assert.equal(result.reasonCode, 'invalid_slug', slug);
    assert.ok(result.message);
  }
  await assert.rejects(fs.lstat(arc), {code: 'ENOENT'});
});

test('rejects symlinked handoff directory', async t => {
  const {writeHandoffRecord} = await loadWriter();
  const {directory, cwd, arc, handoff} = await linkedWorktree(t);
  const outside = path.join(directory, 'outside');
  await fs.mkdir(outside);
  await fs.mkdir(arc);
  await fs.symlink(outside, handoff, 'junction');
  const result = await writeHandoffRecord({cwd, slug: 'task', content: '# Record\n'});
  assert.equal(result.decision, 'deny');
  assert.equal(result.reasonCode, 'path_outside_common_dir');
  assert.ok(result.message);
  assert.deepEqual(await fs.readdir(outside), []);
});

test('reports failure with inline fallback', async t => {
  const {writeHandoffRecord} = await loadWriter();
  const {cwd, arc} = await linkedWorktree(t);
  await fs.writeFile(arc, 'existing file');
  const result = await writeHandoffRecord({cwd, slug: 'task', content: '# Record\n'});
  assert.equal(result.decision, 'hold');
  assert.equal(result.reasonCode, 'handoff_write_failed');
  assert.equal(result.fallback, 'inline');
  assert.ok(result.message);
  assert.equal(await fs.readFile(arc, 'utf8'), 'existing file');
});

test('cli parses handoff-record write options', async t => {
  const {cwd, handoff} = await linkedWorktree(t);
  const run = (slug, input, inputOption = '-') => {
    const result = spawnSync(process.execPath,
      [cli, 'handoff-record', 'write', '--cwd', cwd, '--slug', slug, '--input', inputOption],
      {input, encoding: 'utf8'});
    assert.ifError(result.error);
    assert.equal(result.stderr, '');
    assert.match(result.stdout, /^[^\n]+\n$/);
    return [result.status, JSON.parse(result.stdout)];
  };
  const record = path.join(handoff, 'task.md');
  const input = JSON.stringify({content: '# CLI record\n'});
  assert.deepEqual(run('task', input), [0, {decision: 'allow', path: record, created: true}]);
  assert.equal(await fs.readFile(record, 'utf8'), '# CLI record\n');
  const [denied, denial] = run('../task', input);
  assert.equal(denied, 2);
  assert.equal(denial.reasonCode, 'invalid_slug');
  for (const [body, inputOption] of [['{'], ['{"content":""}'], ['{"content":3}'], [input, 'file']]) {
    const [failed, exception] = run('task', body, inputOption);
    assert.equal(failed, 1);
    assert.equal(exception.fallback, 'inline');
  }
  await fs.mkdir(path.join(handoff, 'blocked.md'));
  const [held, hold] = run('blocked', input);
  assert.equal(held, 3);
  assert.equal(hold.reasonCode, 'handoff_write_failed');
  assert.equal(hold.fallback, 'inline');
  assert.equal(await fs.readFile(record, 'utf8'), '# CLI record\n');
});
