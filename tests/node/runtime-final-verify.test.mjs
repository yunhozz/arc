import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {
  VERIFY_COMMANDS, canonicalJson, sha256Hex, expandGlob, buildChildEnv, classifyLoad,
  validateVerifyInput, verifyCleanup, verifyStart, verifyStatus
} from '../../lib/runtime/final-verify.mjs';
import {runVerifyCommand} from '../../lib/runtime/verify-cli.mjs';

const cli = fileURLToPath(new URL('../../lib/runtime/verify-cli.mjs', import.meta.url));
const workflowId = 'task-2';
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !['ARC_BRIDGE_CHILD', 'NODE_TEST_CONTEXT'].includes(key) && !key.startsWith('GIT_')));
const loadavg = () => [0.1, 0.1, 0.1];
const js = (script, ...args) => ({executable: process.execPath, args: ['-e', script, ...args]});
const tap = 'TAP version 13\n1..1\nok 1 - fixture\n';
const tapCommand = () => ({id: 'tests', ...js('process.stdout.write(process.argv[1])', tap), results: {format: 'tap', stream: 'stdout'}});

function startInput(revision = '0'.repeat(40)) {
  return {
    revision, role: 'baseline', hostPlatform: 'codex', executionEnvironment: 'codex-cli', sandboxMode: 'none',
    detach: false, commands: [tapCommand()], keyInputs: {envNames: [], toolVersionCommands: [], dependencyPaths: [], artifactPaths: []}
  };
}

function git(cwd, ...args) {
  const result = spawnSync('git', args, {cwd, env: {...cleanEnv, GIT_OPTIONAL_LOCKS: '0'}, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout.trim();
}

function sourceSnapshot(cwd) {
  function files(directory) {
    return fs.readdirSync(directory, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
      if (entry.name === '.git') return [];
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? files(file) : [trackedBytes(cwd, file)];
    });
  }
  function trackedBytes(root, file) {
    return [path.relative(root, file), fs.readFileSync(file), fs.statSync(file, {bigint: true}).mtimeNs];
  }
  function gitFiles(relative) {
    const file = path.join(cwd, '.git', relative);
    if (!fs.existsSync(file)) return [];
    return fs.statSync(file).isDirectory() ? files(file) : [trackedBytes(cwd, file)];
  }
  return {
    head: git(cwd, 'rev-parse', 'HEAD'), refs: git(cwd, 'show-ref'),
    gitFiles: ['HEAD', 'index', 'packed-refs', 'refs', 'logs'].flatMap(gitFiles),
    files: files(cwd)
  };
}

function makeRepo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-verify-test-'));
  const cwd = fs.realpathSync(root);
  const common = path.join(cwd, '.git');
  git(cwd, 'init', '-q');
  git(cwd, 'config', 'user.name', 'Verify Fixture');
  git(cwd, 'config', 'user.email', 'fixture@example.invalid');
  git(cwd, 'config', 'commit.gpgsign', 'false');
  git(cwd, 'config', 'core.hooksPath', path.join(common, 'hooks'));
  fs.mkdirSync(path.join(cwd, 'tests/deep'), {recursive: true});
  fs.writeFileSync(path.join(cwd, '.gitignore'), '/ignored/\n/ignored-*/\n');
  fs.writeFileSync(path.join(cwd, 'package-lock.json'), 'lock\n');
  fs.writeFileSync(path.join(cwd, 'tests/a.test.mjs'), '// a\n');
  fs.writeFileSync(path.join(cwd, 'tests/deep/b.test.mjs'), '// b\n');
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-qm', 'first');
  const first = git(cwd, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(cwd, 'tracked.txt'), 'tracked\n');
  git(cwd, 'add', 'tracked.txt');
  git(cwd, 'commit', '-qm', 'second');
  const revision = git(cwd, 'rev-parse', 'HEAD');
  const store = path.join(common, 'arc/verify');
  const worktrees = path.join(fs.realpathSync(os.tmpdir()), 'arc-verify', sha256Hex(fs.realpathSync(common)).slice(0, 16));
  let snapshot = sourceSnapshot(cwd);
  const teardown = [];
  t.after(async () => {
    try {
      await Promise.all(teardown.map(cleanup => cleanup()));
      assertSourceUnchanged(cwd, snapshot);
    } finally {
      fs.rmSync(worktrees, {recursive: true, force: true});
      fs.rmSync(root, {recursive: true, force: true});
    }
  });
  return {cwd, common, store, first, revision, teardown, input: startInput(revision), snapshot: () => { snapshot = sourceSnapshot(cwd); }};
}

function assertSourceUnchanged(cwd, snapshot) {
  assert.deepEqual(sourceSnapshot(cwd), snapshot);
}

function runCli(command, cwd, input, env = cleanEnv, options = ['--input', '-']) {
  const result = spawnSync(process.execPath, [cli, command, '--cwd', cwd, '--workflow', workflowId, ...options], {
    input: JSON.stringify(input), env, encoding: 'utf8', timeout: 15000
  });
  assert.ifError(result.error);
  const lines = result.stdout.trimEnd().split('\n');
  assert.equal(lines.length, 1, result.stdout);
  return [result.status, JSON.parse(lines[0])];
}

const runFile = (repo, runId, filename = 'run.json') => path.join(repo.store, 'runs', runId, filename);
const readJson = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));

async function start(t, repo, input = repo.input, {env = cleanEnv, ...internal} = {}) {
  const result = await verifyStart({cwd: repo.cwd, workflowId, input, env}, {loadavg, ...internal});
  if (result.code === 'host_sandbox_blocked') {
    t.skip(result.message ?? result.code);
    return null;
  }
  assert.equal(result.decision, 'allow', JSON.stringify(result));
  return result;
}

test('rejects unknown and missing keys at every nesting level', () => {
  const nested = startInput();
  nested.prepare = [js('')];
  nested.commands[0].isolate = {args: ['{file}']};
  nested.keyInputs.toolVersionCommands = [js('')];
  nested.seedFiles = [{source: path.resolve('seed'), dest: 'seed'}];
  const targets = [
    [input => input, 'role'], [input => input.prepare[0], 'args'],
    [input => input.commands[0], 'id'], [input => input.commands[0].results, 'format'],
    [input => input.commands[0].isolate, 'args'], [input => input.keyInputs, 'envNames'],
    [input => input.keyInputs.toolVersionCommands[0], 'args'], [input => input.seedFiles[0], 'dest'],
  ];
  for (const [get, required] of targets) {
    for (const change of [record => { record.extra = 1; }, record => { delete record[required]; }]) {
      const input = structuredClone(nested);
      change(get(input));
      assert.throws(() => validateVerifyInput('verify-start', input), {code: 'invalid_request'});
      const [exit, output] = runCli('verify-start', path.resolve(os.tmpdir()), input);
      assert.deepEqual([exit, output.decision, output.code], [2, 'deny', 'invalid_request']);
    }
  }
  for (const results of [
    {format: 'junit-xml', path: 'out.xml', stream: 'stdout'},
    {format: 'regex', stream: 'stdout', pattern: '(?<status>ok) (?<name>.*)', statusMap: {pass: ['ok'], fail: [], skip: [], extra: []}},
    {format: 'regex', stream: 'stdout', pattern: '(?<status>ok)', statusMap: {pass: ['ok'], fail: [], skip: []}},
    {format: 'none', stream: 'stdout'},
  ]) {
    const input = startInput();
    input.commands[0].results = results;
    assert.throws(() => validateVerifyInput('verify-start', input), {code: 'invalid_request'});
  }
});

for (const [name, change] of [
  ['rejects host/environment mismatch', input => { input.executionEnvironment = 'claude-cli'; }],
  ['rejects baseline with snapshotWorkingTree', input => { input.snapshotWorkingTree = true; }],
  ['rejects duplicate or malformed command ids', input => { input.commands.push(tapCommand()); }],
  ['rejects malformed command ids', input => { input.commands[0].id = 'invalid/id'; }],
  ['rejects timeoutMs above 21600000', input => { input.commands[0].timeoutMs = 21600001; }],
  ['rejects cwd outside worktree and unsafe relative paths', input => { input.commands[0].cwd = '{worktree}/../outside'; }],
]) {
  test(name, () => {
    const input = startInput();
    change(input);
    assert.deepEqual(runCli('verify-start', path.resolve(os.tmpdir()), input).map((entry, i) => i ? entry.code : entry), [2, 'invalid_request']);
  });
}

test('bridge child env denies every verify command', () => {
  for (const command of VERIFY_COMMANDS) {
    const [exit, output] = runCli(command, path.resolve(os.tmpdir()), {}, {...cleanEnv, ARC_BRIDGE_CHILD: '1'});
    assert.deepEqual([exit, output.decision, output.code], [2, 'deny', 'bridge_child']);
  }
});

test('emits one JSON line with decision, code, workflowId', () => {
  const [exit, output] = runCli('verify-start', path.resolve(os.tmpdir()), {}, cleanEnv, []);
  assert.deepEqual([exit, output.decision, output.code, output.workflowId], [2, 'deny', 'invalid_request', workflowId]);
});

test('unexpected exception is hold verify_error exit 1', async () => {
  let output = '';
  const env = new Proxy({}, {getOwnPropertyDescriptor() { throw new Error('fixture exception'); }});
  const exit = await runVerifyCommand(['verify-start'], {env, output: {write: line => { output += line; }}});
  assert.deepEqual([exit, JSON.parse(output).decision, JSON.parse(output).code], [1, 'hold', 'verify_error']);
});

test('compare, rerun and cleanup deny an unknown run', t => {
  const repo = makeRepo(t);
  const runId = '20261121T000000Z-00000000';
  for (const [command, input] of [
    ['verify-compare', {baseRunId: runId, headRunId: runId}],
    ['verify-rerun', {runId, testId: 'test', attempt: 1, sandboxMode: 'none'}],
    ['verify-cleanup', {runId, dryRun: true}],
  ]) {
    const [exit, output] = runCli(command, repo.cwd, input);
    assert.deepEqual([exit, output.decision, output.code], [2, 'deny', 'unknown_run']);
  }
});

test('unknown revision denies', t => {
  const repo = makeRepo(t);
  const [exit, result] = runCli('verify-start', repo.cwd, startInput());
  assert.deepEqual([exit, result.code], [2, 'unknown_revision']);
});

test('executable_not_found denies', t => {
  const repo = makeRepo(t);
  repo.input.commands[0].executable = 'arc-verify-missing-executable';
  const [exit, result] = runCli('verify-start', repo.cwd, repo.input);
  assert.deepEqual([exit, result.code], [2, 'executable_not_found']);
});

for (const [name, cwd, searchPath] of [
  ['resolves executables through worktree PATH', '.', '{worktree}/bin'],
  ['resolves executables through PATH relative to command cwd', 'tests', 'bin']
]) {
  test(name, async t => {
    const repo = makeRepo(t);
    const bin = path.join(repo.cwd, cwd, 'bin');
    const executable = path.join(bin, 'fixture');
    fs.mkdirSync(bin);
    fs.writeFileSync(executable, '#!/bin/sh\nprintf "%s\\n" revision-fixture\n', {mode: 0o700});
    git(repo.cwd, 'add', '.');
    git(repo.cwd, 'commit', '-qm', 'add fixture executable');
    repo.input.revision = git(repo.cwd, 'rev-parse', 'HEAD');
    fs.writeFileSync(executable, '#!/bin/sh\nexit 9\n');
    repo.snapshot();
    repo.input.commands = [{
      id: 'fixture', executable: 'fixture', args: [], cwd, env: {PATH: searchPath}, results: {format: 'none'}
    }];

    const first = await start(t, repo);
    if (!first) return;
    assert.equal(first.summary.commands[0].exitCode, 0);
    assert.equal(fs.readFileSync(runFile(repo, first.runId, 'raw/fixture.stdout'), 'utf8'), 'revision-fixture\n');

    const second = await start(t, repo);
    assert.equal(second.cacheKeyPhase1, first.cacheKeyPhase1);
    assert.equal(second.cacheHit, true);
  });
}

test('seed_conflicts_tracked denies', t => {
  const repo = makeRepo(t);
  repo.input.seedFiles = [{source: path.join(repo.cwd, 'tracked.txt'), dest: 'tests/a.test.mjs'}];
  const [exit, result] = runCli('verify-start', repo.cwd, repo.input);
  assert.deepEqual([exit, result.code], [2, 'seed_conflicts_tracked']);
});

test('glob_empty holds with exit 3', t => {
  const repo = makeRepo(t);
  repo.input.commands[0].args.push({glob: 'missing/**/*.test.mjs'});
  const [exit, result] = runCli('verify-start', repo.cwd, repo.input);
  assert.deepEqual([exit, result.code], [3, 'glob_empty']);
});

test('expandGlob star does not cross slash', () => {
  assert.deepEqual(expandGlob('tests/?.test.*', ['tests/deep/b.test.mjs', 'tests/a.test.mjs']), ['tests/a.test.mjs']);
});

test('double star matches zero or more directories', () => {
  assert.deepEqual(expandGlob('tests/**/a.test.mjs', ['tests/deep/a.test.mjs', 'tests/a.test.mjs', 'tests/x/y/a.test.mjs']),
    ['tests/a.test.mjs', 'tests/deep/a.test.mjs', 'tests/x/y/a.test.mjs']);
});

test('results are sorted and come from revision tree not working tree', async t => {
  const repo = makeRepo(t);
  fs.writeFileSync(path.join(repo.cwd, 'tests/untracked.test.mjs'), '// not in the tree');
  repo.snapshot();
  repo.input.commands[0].args.push({glob: 'tests/**/*.test.mjs'});
  const result = await start(t, repo);
  if (!result) return;
  const records = readJson(runFile(repo, result.runId, 'result.json'));
  assert.deepEqual(records.commands[0].expandedFiles, ['tests/a.test.mjs', 'tests/deep/b.test.mjs']);
});

test('canonical JSON sorts keys and keeps ordered arrays', () => {
  assert.equal(canonicalJson({z: [2, 1], a: {y: 3, b: 4}, '2': 2, '10': 10}),
    '{"10":10,"2":2,"a":{"b":4,"y":3},"z":[2,1]}');
});

test('set arrays are sorted before hashing', async t => {
  const repo = makeRepo(t);
  const first = await start(t, repo, {...repo.input, keyInputs: {...repo.input.keyInputs, envNames: ['Z', 'A']}});
  if (!first) return;
  const second = await start(t, repo, {...repo.input, keyInputs: {...repo.input.keyInputs, envNames: ['A', 'Z']}});
  assert.equal(second.cacheKey, first.cacheKey);
  assert.equal(second.cacheHit, true);
});

test('normalizes worktree prefix through tmpdir symlink', async t => {
  const repo = makeRepo(t);
  const alias = path.join(repo.cwd, '.git', 'tmp-alias');
  fs.symlinkSync(os.tmpdir(), alias, 'dir');
  t.mock.method(os, 'tmpdir', () => alias);
  repo.input.commands = [{
    id: 'tests', ...js('console.log(\'<testsuite><testcase file="\'+process.argv[1]+\'" name="fixture"/></testsuite>\')', '{worktree}/tests/a.test.mjs'),
    cwd: '{worktree}', results: {format: 'junit-xml', stream: 'stdout'}
  }];
  const result = await start(t, repo);
  if (!result) return;
  assert.ok(result.worktree.path.startsWith(fs.realpathSync(alias) + path.sep));
  assert.equal(readJson(runFile(repo, result.runId, 'result.json')).commands[0].summary.tests[0].file, 'tests/a.test.mjs');
});

test('changing each phase1 input changes the key', async t => {
  const repo = makeRepo(t);
  const dependency = path.join(repo.common, 'dependency');
  const temp = path.join(repo.common, 'tmp');
  const seed = path.join(repo.cwd, 'seed-source');
  fs.mkdirSync(temp);
  fs.writeFileSync(dependency, 'before');
  fs.writeFileSync(seed, 'before');
  repo.snapshot();
  repo.input.seedFiles = [{source: seed, dest: 'seed-dest'}];
  repo.input.keyInputs = {envNames: ['VERIFY_KEY'], toolVersionCommands: [js('console.log("version")')], dependencyPaths: [dependency], artifactPaths: []};
  const base = await start(t, repo);
  if (!base) return;
  const mutations = [
    ['commit', input => { input.revision = repo.first; }],
    ['command args', input => { input.commands[0].args.push('changed'); }],
    ['env value', input => { input.commands[0].env = {EXTRA: 'changed'}; }],
    ['envNames value', (_input, env) => { env.VERIFY_KEY = 'changed'; }],
    ['timeoutMs', input => { input.commands[0].timeoutMs = 5000; }],
    ['results', input => { input.commands[0].results = {format: 'none'}; }],
    ['prepare', input => { input.prepare = [js('')]; }],
    ['seed content', () => { fs.writeFileSync(seed, 'changed'); repo.snapshot(); return () => { fs.writeFileSync(seed, 'before'); repo.snapshot(); }; }],
    ['OS release', () => { const mock = t.mock.method(os, 'release', () => 'different'); return () => mock.mock.restore(); }],
    ['toolVersion output', input => { input.keyInputs.toolVersionCommands = [js('console.log("other version")')]; }],
    ['dependency content', () => { fs.writeFileSync(dependency, 'changed'); return () => fs.writeFileSync(dependency, 'before'); }],
    ['TMPDIR', (_input, env) => { env.TMPDIR = temp; }],
    ['host', input => { input.hostPlatform = 'claude'; input.executionEnvironment = 'claude-cli'; }],
    ['sandboxMode', input => { input.sandboxMode = 'sandboxed'; }],
    ['filter config', () => { git(repo.cwd, 'config', 'filter.fixture.smudge', 'cat'); return () => git(repo.cwd, 'config', '--remove-section', 'filter.fixture'); }],
    ['machine id', () => {
      const machine = path.join(repo.store, 'machine.json');
      const previous = fs.readFileSync(machine);
      fs.writeFileSync(machine, JSON.stringify({randomId: '6a2cb0ee-7a74-4d22-9cc1-1a8370bd2689'}));
      return () => fs.writeFileSync(machine, previous);
    }],
  ];
  for (const [name, change] of mutations) {
    const input = structuredClone(repo.input);
    const env = {...cleanEnv};
    const restore = change(input, env);
    try {
      const result = await start(t, repo, input, {env});
      assert.notEqual(result.cacheKeyPhase1, base.cacheKeyPhase1, name);
      assert.equal(result.cacheHit, false, name);
    } finally {
      restore?.();
    }
  }

  const runtimeCopy = path.join(repo.common, 'runtime');
  fs.mkdirSync(runtimeCopy);
  for (const name of ['final-verify', 'verify-cli', 'test-results', 'node-test-reporter', 'platform-registry', 'scope']) {
    fs.copyFileSync(new URL('../../lib/runtime/'+name+'.mjs', import.meta.url), path.join(runtimeCopy, name+'.mjs'));
  }
  fs.appendFileSync(path.join(runtimeCopy, 'verify-cli.mjs'), '\n// distinct runtime bytes\n');
  const moved = await import(pathToFileURL(path.join(runtimeCopy, 'final-verify.mjs')).href);
  const result = await moved.verifyStart({cwd: repo.cwd, workflowId, input: repo.input, env: cleanEnv}, {loadavg});
  assert.notEqual(result.cacheKeyPhase1, base.cacheKeyPhase1, 'runtime bytes');
});

test('phase2 change misses after prepare', async t => {
  const repo = makeRepo(t);
  const value = path.join(repo.common, 'volatile');
  fs.writeFileSync(value, 'one');
  repo.input.prepare = [js(
    `const fs = require('node:fs');
    const value = fs.readFileSync(process.argv[1], 'utf8');
    fs.writeFileSync('artifact', value[0]);
    fs.writeFileSync('version', value[1]);
    const ignored = 'ignored-' + value[2];
    fs.mkdirSync(ignored);
    fs.writeFileSync(ignored + '/fixture', 'ignored fixture');`,
    value
  )];
  repo.input.keyInputs.artifactPaths = ['artifact'];
  repo.input.keyInputs.toolVersionCommands = [js('console.log(require("node:fs").readFileSync(process.argv[1],"utf8"))', '{worktree}/version')];
  fs.writeFileSync(value, 'abc');
  let previous = await start(t, repo);
  if (!previous) return;
  for (const next of ['dbc', 'dec', 'def']) {
    fs.writeFileSync(value, next);
    const result = await start(t, repo);
    assert.equal(result.cacheKeyPhase1, previous.cacheKeyPhase1);
    assert.notEqual(result.cacheKey, previous.cacheKey);
    assert.equal(result.cacheHit, false);
    previous = result;
  }
});

for (const [name, reason, arrange] of [
  ['sandboxMode unknown', 'sandbox_mode_unknown', repo => { repo.input.sandboxMode = 'unknown'; }],
  ['toolVersion nonzero', 'tool_version_failed', repo => { repo.input.keyInputs.toolVersionCommands = [js('process.exit(9)')]; }],
  ['toolVersion timeout', 'tool_version_failed', repo => {
    repo.input.keyInputs.toolVersionCommands = [js('setTimeout(()=>{}, 5000)')];
    return {toolVersionTimeoutMs: 20, killGraceMs: 20};
  }],
  ['unreadable dependency path or out-of-root symlink', 'path_hash_failed', repo => {
    const dependency = path.join(repo.common, 'dep');
    fs.mkdirSync(dependency);
    fs.symlinkSync(repo.cwd, path.join(dependency, 'link'), 'dir');
    repo.input.keyInputs.dependencyPaths = [dependency];
  }],
  ['TMPDIR unresolvable', 'tmpdir_unavailable', repo => { return {env: {...cleanEnv, TMPDIR: path.join(repo.common, 'missing')}}; }],
  ['git failure for filter config', 'git_metadata_unavailable', (repo, t) => {
    const spawn = spawnSync('git', ['--version'], {env: cleanEnv, encoding: 'utf8'});
    assert.equal(spawn.status, 0);
    const gitDirectory = (cleanEnv.PATH ?? '').split(path.delimiter).find(dir => fs.existsSync(path.join(dir, 'git')));
    const bin = path.join(repo.common, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'git'), '#!'+process.execPath+'\nconst a=process.argv.slice(2);if(a.includes("--get-regexp"))process.exit(7);const r=require("node:child_process").spawnSync('+JSON.stringify(path.resolve(gitDirectory, 'git'))+',a,{stdio:"inherit"});process.exit(r.status??1);\n', {mode: 0o700});
    return {env: {...cleanEnv, PATH: bin + path.delimiter + cleanEnv.PATH}};
  }],
  ['glob over limit', 'glob_over_limit', repo => {
    repo.input.commands[0].args.push({glob: 'tests/**/*.test.mjs'});
    return {globLimit: 1};
  }],
  ['machine.json unwritable', 'machine_identity_unavailable', repo => {
    fs.mkdirSync(path.join(repo.store, 'machine.json'), {recursive: true});
  }],
]) {
  test(name, async t => {
    const repo = makeRepo(t);
    const internal = arrange(repo, t);
    const result = await start(t, repo, repo.input, internal);
    if (!result) return;
    assert.equal(result.state, 'succeeded');
    assert.equal(result.cacheable, false);
    assert.ok(result.uncacheableReasons.includes(reason), JSON.stringify(result.uncacheableReasons));
  });
}

for (const [name, change, internal] of [
  ['head run is never reused', input => { input.role = 'head'; }],
  ['contended baseline is not reused', input => { input.declaredConcurrent = true; }],
  ['unknown-load baseline is not reused', () => {}, {loadavg: () => [NaN, NaN, NaN]}],
  ['timed out command prevents reuse', input => {
    input.commands = [{id: 'sleep', ...js('setTimeout(()=>{}, 5000)'), timeoutMs: 30, results: {format: 'none'}}];
  }, {killGraceMs: 20}],
]) {
  test(name, async t => {
    const repo = makeRepo(t);
    change(repo.input);
    const first = await start(t, repo, repo.input, internal);
    if (!first) return;
    const second = await start(t, repo, repo.input, internal);
    assert.equal(second.cacheKey, first.cacheKey);
    assert.equal(second.cacheHit, false);
  });
}

for (const invalidate of ['corrupt', 'removed']) {
  test(invalidate === 'corrupt' ? 'corrupt result hash is a miss' : 'removed record is a miss', async t => {
    const repo = makeRepo(t);
    const first = await start(t, repo);
    if (!first) return;
    if (invalidate === 'corrupt') fs.appendFileSync(runFile(repo, first.runId, 'result.json'), ' ');
    else {
      const cache = path.join(repo.store, 'cache', first.cacheKey);
      fs.renameSync(path.join(cache, 'record.json'), path.join(cache, 'record.removed.json'));
    }
    const second = await start(t, repo);
    assert.equal(second.cacheHit, false);
    if (invalidate === 'corrupt') assert.equal(second.cacheMissReason, 'cache_corrupt');
  });
}

test('second identical quiet baseline start is a cache hit without worktree', async t => {
  const repo = makeRepo(t);
  const first = await start(t, repo);
  if (!first) return;
  const second = await start(t, repo);
  assert.deepEqual([first.cacheHit, second.cacheHit, second.cacheKey, second.worktree, second.reusedFrom],
    [false, true, first.cacheKey, null, first.runId]);
});

test('phase2 hit skips commands after prepare', async t => {
  const repo = makeRepo(t);
  repo.input.prepare = [js('require("node:fs").writeFileSync("artifact","fixture")')];
  repo.input.keyInputs.artifactPaths = ['artifact'];
  const first = await start(t, repo);
  if (!first) return;
  const second = await start(t, repo);
  assert.equal(second.cacheHit, true);
  assert.ok(fs.existsSync(path.join(second.worktree.path, 'artifact')));
  assert.deepEqual(readJson(runFile(repo, second.runId)).children.map(child => child.phase), ['prepare']);
});

test('child env excludes ARC_BRIDGE_CHILD and unlisted variables', async t => {
  const repo = makeRepo(t);
  repo.input.keyInputs.envNames = ['ARC_BRIDGE_CHILD', 'NODE_TEST_CONTEXT', 'INCLUDED'];
  repo.input.commands[0] = {
    id: 'env', ...js('console.log(JSON.stringify(process.env))'),
    env: {ARC_BRIDGE_CHILD: 'explicit', NODE_TEST_CONTEXT: 'explicit'}, results: {format: 'none'}
  };
  const parentEnv = {...cleanEnv, ARC_BRIDGE_CHILD: 'parent', NODE_TEST_CONTEXT: 'parent', SECRET_X: 'secret', INCLUDED: 'yes'};
  const result = await start(t, repo, repo.input, {env: parentEnv});
  if (!result) return;
  const env = readJson(runFile(repo, result.runId, 'raw/env.stdout'));
  assert.equal(env.INCLUDED, 'yes');
  for (const key of ['ARC_BRIDGE_CHILD', 'NODE_TEST_CONTEXT', 'SECRET_X']) assert.equal(Object.hasOwn(env, key), false);
  assert.deepEqual(buildChildEnv({parentEnv, envNames: ['INCLUDED'], extraEnv: {EXTRA: 'yes'}}).EXTRA, 'yes');
});

test('absent envNames value is recorded as "absent"', async t => {
  const repo = makeRepo(t);
  repo.input.keyInputs.envNames = ['VERIFY_ABSENT'];
  const result = await start(t, repo);
  if (!result) return;
  assert.equal(readJson(runFile(repo, result.runId)).keyEnvironment.VERIFY_ABSENT, 'absent');
  const explicit = await start(t, repo, repo.input, {env: {...cleanEnv, VERIFY_ABSENT: 'absent'}});
  assert.notEqual(explicit.cacheKeyPhase1, result.cacheKeyPhase1);
});

test('creates detached locked worktree under tmp arc-verify with owner.json', async t => {
  const repo = makeRepo(t);
  const result = await start(t, repo);
  if (!result) return;
  const dir = path.dirname(result.worktree.path);
  const owner = readJson(path.join(dir, 'owner.json'));
  assert.deepEqual([owner.tool, owner.runId, owner.commonDir], ['arc-verify', result.runId, fs.realpathSync(repo.common)]);
  assert.equal(path.basename(path.dirname(dir)), owner.repoHash);
  assert.match(git(repo.cwd, 'worktree', 'list', '--porcelain'), new RegExp('detached\\nlocked arc-verify:'+result.runId));
});

test('start holds unsafe_temp_path', async t => {
  for (const scenario of ['symlink', 'wrong mode', 'writable ancestor without sticky bit', 'wrong owner']) {
    await t.test(scenario, async t => {
      const repo = makeRepo(t);
      const ancestor = path.join(repo.common, 'ancestor');
      const temp = path.join(ancestor, 'tmp');
      const root = path.join(temp, 'arc-verify');
      fs.mkdirSync(temp, {recursive: true, mode: 0o700});
      let unsafe = root;
      const internal = {loadavg};
      if (scenario === 'symlink') fs.symlinkSync(repo.common, root, 'dir');
      if (scenario === 'wrong mode') {
        fs.mkdirSync(root);
        fs.chmodSync(root, 0o777);
      }
      if (scenario === 'writable ancestor without sticky bit') {
        fs.chmodSync(ancestor, 0o702);
        unsafe = ancestor;
      }
      if (scenario === 'wrong owner') {
        fs.mkdirSync(root, {mode: 0o700});
        internal.lstat = (filename, options) => {
          const stat = fs.lstatSync(filename, options);
          if (filename === root) stat.uid = process.geteuid() + 1;
          return stat;
        };
      }
      const registered = git(repo.cwd, 'worktree', 'list', '--porcelain');
      // The in-process foreground runner reads TMPDIR from process.env.
      const original = process.env.TMPDIR;
      process.env.TMPDIR = temp;
      let result;
      try {
        result = await verifyStart({cwd: repo.cwd, workflowId, input: repo.input, env: {...cleanEnv, TMPDIR: temp}}, internal);
      } finally {
        if (original === undefined) delete process.env.TMPDIR;
        else process.env.TMPDIR = original;
      }
      if (result.code === 'host_sandbox_blocked') return t.skip(result.message ?? result.code);
      assert.deepEqual([result.decision, result.code, result.path], ['hold', 'unsafe_temp_path', unsafe]);
      assert.equal(git(repo.cwd, 'worktree', 'list', '--porcelain'), registered);
    });
  }
});

test('start creates a worktree with mode 0700 under the selected TMPDIR', t => {
  const repo = makeRepo(t);
  const temp = path.join(repo.common, 'tmp');
  fs.mkdirSync(temp, {mode: 0o700});
  const [exit, result] = runCli('verify-start', repo.cwd, repo.input, {...cleanEnv, TMPDIR: temp});
  if (result.code === 'host_sandbox_blocked') return t.skip(result.message ?? result.code);
  assert.equal(exit, 0, JSON.stringify(result));
  const {path: worktree} = result.worktree;
  const directory = path.dirname(worktree);
  const parent = path.dirname(directory);
  const root = path.dirname(parent);
  assert.equal(root, path.join(temp, 'arc-verify'));
  for (const item of [root, parent, directory, worktree]) {
    assert.equal(fs.lstatSync(item).mode & 0o7777, 0o700, item);
  }
});

test('post-checkout hook does not run', async t => {
  const repo = makeRepo(t);
  const hook = path.join(repo.common, 'hooks/post-checkout');
  const marker = path.join(repo.common, 'hook-ran');
  fs.writeFileSync(hook, '#!/bin/sh\ntouch "'+marker+'"\n', {mode: 0o700});
  const result = await start(t, repo);
  if (!result) return;
  assert.equal(fs.existsSync(marker), false);
});

test('oid mismatch or unclean worktree fails run', async t => {
  const repo = makeRepo(t);
  const result = await start(t, repo, repo.input, {afterCreate: wt => fs.writeFileSync(path.join(wt, 'unexpected'), 'x')});
  if (!result) return;
  assert.deepEqual([result.state, result.failure.code, result.worktree.state], ['failed', 'worktree_unclean', 'retained']);
});

test('prepare touching tracked file is prepare_dirtied_tree', async t => {
  const repo = makeRepo(t);
  repo.input.prepare = [js('require("node:fs").appendFileSync("tracked.txt","change")')];
  const result = await start(t, repo);
  if (!result) return;
  assert.deepEqual([result.state, result.failure.code], ['failed', 'prepare_dirtied_tree']);
});

test('seed files are the only untracked paths', async t => {
  const repo = makeRepo(t);
  repo.input.seedFiles = [{source: path.join(repo.cwd, 'tracked.txt'), dest: 'seed/fixture.txt'}];
  const result = await start(t, repo);
  if (!result) return;
  assert.equal(git(result.worktree.path, 'status', '--porcelain=v1', '--untracked-files=all', '--ignored'), '?? seed/fixture.txt');
  assert.equal(fs.readFileSync(path.join(result.worktree.path, 'seed/fixture.txt'), 'utf8'), 'tracked\n');
});

test('ignored file in source checkout does not leak into head run', async t => {
  const repo = makeRepo(t);
  fs.mkdirSync(path.join(repo.cwd, 'ignored'));
  fs.writeFileSync(path.join(repo.cwd, 'ignored/poison'), 'local');
  repo.snapshot();
  const check = js('process.exit(require("node:fs").existsSync("ignored/poison") ? 1 : 0)');
  assert.equal(spawnSync(check.executable, check.args, {cwd: repo.cwd, env: cleanEnv}).status, 1);
  repo.input.role = 'head';
  repo.input.commands = [{id: 'asymmetry', ...check, results: {format: 'none'}}];
  const result = await start(t, repo);
  if (!result) return;
  assert.equal(result.summary.commands[0].exitCode, 0);
});

test('timeout sends SIGTERM to group then SIGKILL after grace', async t => {
  const repo = makeRepo(t);
  const child = 'process.on("SIGTERM",()=>{console.log("child term")});console.log("child ready");setInterval(()=>{},500)';
  repo.input.commands = [{
    id: 'timeout', ...js('process.on("SIGTERM",()=>{console.log("term")});require("node:child_process").spawn(process.execPath,["-e",process.argv[1]],{stdio:"inherit"});setInterval(()=>{},500)', child),
    timeoutMs: 800, results: {format: 'none'}
  }];
  const result = await start(t, repo, repo.input, {killGraceMs: 80});
  if (!result) return;
  const [command] = result.summary.commands;
  assert.deepEqual([result.state, command.timedOut, command.signal], ['succeeded', true, 'SIGKILL']);
  const raw = fs.readFileSync(runFile(repo, result.runId, 'raw/timeout.stdout'), 'utf8');
  assert.match(raw, /^term$/m);
  if (process.platform !== 'win32') assert.match(raw, /^child term$/m);
});

test('raw stream over cap marks output_truncated', async t => {
  const repo = makeRepo(t);
  repo.input.commands = [{id: 'large', ...js('console.log("x".repeat(200))'), results: {format: 'none'}}];
  const result = await start(t, repo, repo.input, {rawCap: 25});
  if (!result) return;
  assert.ok(result.summary.commands[0].incomplete.some(issue => issue.reason === 'output_truncated'));
  assert.equal(fs.statSync(runFile(repo, result.runId, 'raw/large.stdout')).size, 25);
});

test('result copy storage failure persists failed run', async t => {
  const repo = makeRepo(t);
  repo.input.commands = [{
    id: 'report', ...js('require("node:fs").writeFileSync("report.xml", "<testsuite/>")'),
    results: {format: 'junit-xml', path: 'report.xml'}
  }];
  const result = await verifyStart({cwd: repo.cwd, workflowId, input: repo.input, env: cleanEnv}, {
    loadavg,
    afterCreate(worktree) {
      const runId = path.basename(path.dirname(worktree));
      fs.mkdirSync(runFile(repo, runId, 'raw/report.results/report.xml'), {recursive: true});
    }
  });
  if (result.code === 'host_sandbox_blocked') return t.skip(result.message ?? result.code);
  assert.deepEqual([result.decision, result.code], ['hold', 'storage_unavailable']);
  assert.match(result.runId, /^\d{8}T\d{6}Z-[0-9a-f]{8}$/);
  const {state, failure} = readJson(runFile(repo, result.runId));
  assert.deepEqual({state, failure}, {state: 'failed', failure: {code: 'storage_unavailable', phase: 'commands'}});
  const status = await verifyStatus({
    cwd: repo.cwd, workflowId, input: {runId: result.runId}, env: cleanEnv,
    now: Date.now() + 30000
  });
  assert.equal(status.state, 'failed');
});

test('foreground run with junit-xml stream infers files via worktree', async t => {
  const repo = makeRepo(t);
  fs.writeFileSync(path.join(repo.cwd, 'tests/a.test.mjs'),
    'import {describe, it} from "node:test"; describe("tests/a.test.mjs", () => it("works", () => {}));\n');
  fs.writeFileSync(path.join(repo.common, 'outside.test.mjs'), '');
  fs.symlinkSync(path.join(repo.common, 'outside.test.mjs'), path.join(repo.cwd, 'tests/linked.test.mjs'));
  git(repo.cwd, 'add', 'tests');
  git(repo.cwd, 'commit', '-qm', 'add result inference fixtures');
  repo.input.revision = git(repo.cwd, 'rev-parse', 'HEAD');
  // A file found only in the source checkout must not become a result identity.
  fs.writeFileSync(path.join(repo.cwd, 'tests/source-only.test.mjs'), '');
  repo.snapshot();
  const junit = {format: 'junit-xml', stream: 'stdout'};
  const inferredXml = '<testsuites>' +
    ['tests/a.test.mjs', 'tests/source-only.test.mjs', 'tests/linked.test.mjs', 'tests/deep', '../outside.test.mjs']
      .map(name => '<testsuite name="' + name + '"><testcase name="inferred"/></testsuite>').join('') + '</testsuites>';
  const tapOutput = [
    'TAP version 13', '# Subtest: tests/a.test.mjs', '    ok 1 - named', '    1..1', 'ok 1 - tests/a.test.mjs',
    'not ok 2 - loader problem', '  ---', '  location: tests/deep/b.test.mjs:1:1', '  ...', '1..2'
  ].join('\n');
  repo.input.commands = [
    {id: 'reporter', executable: process.execPath, args: ['--test', '--test-reporter={arcNodeReporter}',
      '--test-reporter-destination=stdout', 'tests/a.test.mjs'], results: junit},
    {id: 'inference', ...js('console.log(process.argv[1])', inferredXml), results: junit},
    {id: 'tap', ...js('console.log(process.argv[1])', tapOutput), results: {format: 'tap', stream: 'stdout'}}
  ];
  const result = await start(t, repo);
  if (!result) return;
  assert.equal(result.state, 'succeeded');
  const [reporter, inference, tap] = readJson(runFile(repo, result.runId, 'result.json')).commands.map(({summary}) => summary);
  assert.deepEqual(reporter.tests.map(({file, name, status}) => [file, name, status]),
    [['tests/a.test.mjs', 'works', 'passed']]);
  assert.deepEqual(inference.tests.map(({file}) => file), ['tests/a.test.mjs', '-', '-', '-', '-']);
  assert.deepEqual(tap.tests.map(({file, name}) => [file, name]), [['tests/a.test.mjs', 'named']]);
  assert.ok(tap.incomplete.some(({scope, path, reason}) =>
    scope === 'file' && path === 'tests/deep/b.test.mjs' && reason === 'file_error'));
});

test('worktree file inference rejects symlinks in JUnit and TAP', async t => {
  const repo = makeRepo(t);
  repo.input.prepare = [js(`
    const fs = require('node:fs');
    fs.symlinkSync('a.test.mjs', 'tests/alias.mjs');
    fs.symlinkSync('deep', 'tests/linked-dir', 'dir');
  `)];
  const files = ['tests/a.test.mjs', 'tests/alias.mjs', 'tests/linked-dir/b.test.mjs'];
  const junit = '<testsuites>' + files.map(file =>
    '<testsuite name="' + file + '"><testcase name="fixture"/></testsuite>').join('') + '</testsuites>';
  const tapNames = ['TAP version 13', ...files.map((file, i) => 'ok ' + (i + 1) + ' - ' + file), '1..3'].join('\n');
  const tapLocations = ['TAP version 13', ...files.flatMap((file, i) =>
    ['ok ' + (i + 1) + ' - fixture', '  ---', '  location: ' + file + ':2:1', '  ...']), '1..3'].join('\n');
  repo.input.commands = [
    {id: 'junit-names', format: 'junit-xml', output: junit},
    {id: 'tap-names', format: 'tap', output: tapNames},
    {id: 'tap-locations', format: 'tap', output: tapLocations}
  ].map(({id, format, output}) => ({
    id, ...js('process.stdout.write(process.argv[1])', output), results: {format, stream: 'stdout'}
  }));
  const result = await start(t, repo);
  if (!result) return;
  const {commands} = readJson(runFile(repo, result.runId, 'result.json'));
  assert.equal(result.state, 'succeeded');
  for (const {id, summary} of commands) {
    await t.test(id, () => {
      assert.deepEqual(summary.tests.map(({file}) => file), ['tests/a.test.mjs', '-', '-']);
    });
  }
});

test('runner exception marks run failed and stops heartbeat', async t => {
  const repo = makeRepo(t);
  const result = await start(t, repo, repo.input, {
    heartbeatIntervalMs: 10,
    afterCreate() { throw new Error('fixture runner exception'); }
  });
  if (!result) return;
  const stored = readJson(runFile(repo, result.runId));
  assert.deepEqual([result.state, stored.state, stored.failure.phase, stored.failure.message, stored.worktree.state],
    ['failed', 'failed', 'worktree', 'fixture runner exception', 'retained']);
  assert.deepEqual(result.failure, stored.failure);
  const heartbeat = runFile(repo, result.runId, 'heartbeat.json');
  const before = readJson(heartbeat);
  await delay(60);
  assert.deepEqual(readJson(heartbeat), before);
  const statusResult = await status(repo, result.runId, 0, () => Date.now() + 30000);
  assert.deepEqual([statusResult.state, statusResult.failure], ['failed', stored.failure]);
});

test('parser exception records parse_error and run succeeds', async t => {
  const repo = makeRepo(t);
  const output = 'TAP version 13\nok 1 - fixture parser exception\n1..1\n';
  const split = String.prototype.split;
  const parserFault = t.mock.method(String.prototype, 'split', function (...args) {
    if (String(this) === output && String(args[0]) === String(/\r?\n/)) throw new Error('fixture parser exception');
    return split.apply(this, args);
  });
  repo.input.commands = [{
    id: 'report', ...js('process.stdout.write(process.argv[1])', output), results: {format: 'tap', stream: 'stdout'}
  }, tapCommand()];
  let result;
  try {
    result = await start(t, repo);
  } finally {
    parserFault.mock.restore();
  }
  if (!result) return;
  assert.equal(result.state, 'succeeded');
  const [report, following] = result.summary.commands;
  assert.ok(report.incomplete.some(({scope, reason}) => scope === 'command' && reason === 'parse_error'));
  assert.equal(following.tests.passed, 1);
});

test('status reports phases and summary', async t => {
  const repo = makeRepo(t);
  const [exit, result] = runCli('verify-start', repo.cwd, repo.input);
  if (result.code === 'host_sandbox_blocked') return t.skip(result.message ?? result.code);
  assert.deepEqual([exit, result.decision, result.state], [0, 'allow', 'succeeded']);
  const [statusExit, status] = runCli('verify-status', repo.cwd, {runId: result.runId, waitMs: 5});
  assert.equal(statusExit, 0);
  assert.deepEqual(status.summary.commands[0].tests, {total: 1, passed: 1, failed: 0, skipped: 0});
  assert.ok(status.phases.every(phase => phase.name && phase.startedAt && phase.endedAt && phase.ms >= 0));
  assert.ok(status.phases.some(phase => phase.name === 'commands'));
  assert.deepEqual(status, result);
  assert.equal(runCli('verify-status', repo.cwd, {runId: '20261121T000000Z-00000000'})[1].code, 'unknown_run');
  fs.writeFileSync(runFile(repo, result.runId), '{');
  assert.equal((await verifyStatus({cwd: repo.cwd, workflowId, input: {runId: result.runId}, env: cleanEnv})).state, 'unknown');
});

test('classifyLoad boundaries', () => {
  const quiet = {platform: 'linux', cpus: 8, startLoadavg: [3.99, 0, 0]};
  assert.equal(classifyLoad(quiet), 'quiet');
  for (const change of [
    {startLoadavg: [4, 0, 0]}, {samples: [{loadavg: [12.01, 0, 0]}]},
    {declaredConcurrent: true}, {overlaps: ['other']}
  ]) assert.equal(classifyLoad({...quiet, ...change}), 'contended');
  assert.equal(classifyLoad({...quiet, samples: [{loadavg: [12, 0, 0]}]}), 'quiet');
  for (const change of [{platform: 'win32', startLoadavg: [0, 0, 0]}, {samplesMissing: true}]) {
    assert.equal(classifyLoad({...quiet, ...change}), 'unknown');
  }
});

test('store lives under realpath git-common-dir arc/verify with 0700/0600', async t => {
  const repo = makeRepo(t);
  const result = await start(t, repo);
  if (!result) return;
  assert.equal(fs.realpathSync(repo.store), path.join(fs.realpathSync(repo.common), 'arc/verify'));
  if (process.platform !== 'win32') {
    for (const directory of [repo.store, path.dirname(runFile(repo, result.runId)), result.worktree.path]) {
      assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
    }
    for (const file of [path.join(repo.store, 'machine.json'), runFile(repo, result.runId), runFile(repo, result.runId, 'result.json')]) {
      assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    }
  }
});

test('machine id differs when randomId differs', async t => {
  const source = makeRepo(t);
  const second = makeRepo(t);
  const first = await start(t, source);
  if (!first) return;
  const other = await start(t, second);
  assert.notEqual(readJson(path.join(source.store, 'machine.json')).randomId, readJson(path.join(second.store, 'machine.json')).randomId);
  assert.notEqual(readJson(runFile(source, first.runId)).machineId, readJson(runFile(second, other.runId)).machineId);
  assert.match(first.runId, /^\d{8}T\d{6}Z-[0-9a-f]{8}$/);
});

test('new modules import only node builtins and sibling files', () => {
  for (const name of ['verify-cli', 'final-verify', 'node-test-reporter']) {
    const text = fs.readFileSync(new URL('../../lib/runtime/'+name+'.mjs', import.meta.url), 'utf8');
    const imports = [...text.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)];
    assert.ok(imports.length);
    for (const [, specifier] of imports) assert.match(specifier, /^(?:node:[^/]+(?:\/.+)?|\.\/[\w-]+\.mjs)$/);
  }
});

function dirtySnapshot(repo) {
  fs.writeFileSync(path.join(repo.cwd, 'tracked.txt'), 'modified\n');
  fs.unlinkSync(path.join(repo.cwd, 'tests/a.test.mjs'));
  fs.writeFileSync(path.join(repo.cwd, 'new\tfile.txt'), 'untracked\n');
  fs.mkdirSync(path.join(repo.cwd, 'ignored'));
  fs.writeFileSync(path.join(repo.cwd, 'ignored/local'), 'excluded\n');
  repo.snapshot();
  return {...repo.input, role: 'head', snapshotWorkingTree: true};
}

test('snapshot leaves refs, index, reflog and working files byte- and mtime-identical', async t => {
  const repo = makeRepo(t);
  const result = await start(t, repo, dirtySnapshot(repo));
  if (!result) return;
  assert.equal(result.state, 'succeeded');
  assert.equal(git(result.worktree.path, 'rev-parse', 'HEAD'), result.snapshot.commit);
  assert.equal(git(result.worktree.path, 'rev-parse', 'HEAD^{tree}'), result.snapshot.tree);
  assert.equal(git(repo.cwd, 'rev-parse', result.commit + '^'), repo.revision);
  assert.equal(fs.readFileSync(path.join(result.worktree.path, 'tracked.txt'), 'utf8'), 'modified\n');
  assert.equal(fs.existsSync(path.join(result.worktree.path, 'tests/a.test.mjs')), false);
  for (const filename of ['snapshot.index', 'run.json', 'heartbeat.json', 'result.json']) {
    assert.equal(fs.statSync(runFile(repo, result.runId, filename)).mode & 0o777, 0o600, filename);
  }
});

test('snapshot reports included and excluded ignored paths', async t => {
  const repo = makeRepo(t);
  const result = await start(t, repo, dirtySnapshot(repo));
  if (!result) return;
  assert.deepEqual(result.snapshot.included, [
    {status: 'A', path: 'new\tfile.txt'}, {status: 'D', path: 'tests/a.test.mjs'}, {status: 'M', path: 'tracked.txt'}
  ]);
  assert.deepEqual(result.snapshot.excluded, {ignored: ['ignored/'], submodules: []});
});

test('snapshot from subdirectory cwd includes changes outside cwd', async t => {
  const repo = makeRepo(t);
  const input = dirtySnapshot(repo);
  const result = await start(t, {...repo, cwd: path.join(repo.cwd, 'tests/deep')}, input);
  if (!result) return;
  assert.equal(result.state, 'succeeded');
  assert.deepEqual(result.snapshot.included, [
    {status: 'A', path: 'new\tfile.txt'}, {status: 'D', path: 'tests/a.test.mjs'}, {status: 'M', path: 'tracked.txt'}
  ]);
  assert.deepEqual(result.snapshot.excluded.ignored, ['ignored/']);
  assert.equal(fs.readFileSync(path.join(result.worktree.path, 'tracked.txt'), 'utf8'), 'modified\n');
});

test('same tree yields same snapshot OID', async t => {
  const repo = makeRepo(t);
  const input = dirtySnapshot(repo);
  const first = await start(t, repo, input);
  if (!first) return;
  const second = await start(t, repo, input);
  assert.notEqual(second.runId, first.runId);
  assert.equal(second.snapshot.tree, first.snapshot.tree);
  assert.equal(second.snapshot.commit, first.snapshot.commit);
  assert.equal(git(repo.cwd, 'show', '-s', '--format=%s', first.snapshot.commit), 'arc-verify snapshot');
});

test('snapshot with HEAD mismatch denies revision_mismatch', t => {
  const repo = makeRepo(t);
  const [exit, result] = runCli('verify-start', repo.cwd, {...dirtySnapshot(repo), revision: repo.first});
  assert.deepEqual([exit, result.decision, result.code], [2, 'deny', 'revision_mismatch']);
});

test('snapshot failure holds snapshot_failed and keeps temp index', async t => {
  const repo = makeRepo(t);
  const result = await verifyStart({cwd: repo.cwd, input: dirtySnapshot(repo), env: cleanEnv}, {
    beforeSnapshotWriteTree() { throw Error('fixture write-tree failure'); }
  });
  assert.deepEqual([result.decision, result.code], ['hold', 'snapshot_failed']);
  const index = runFile(repo, result.runId, 'snapshot.index');
  assert.ok(fs.statSync(index).isFile());
  assert.equal(fs.statSync(index).mode & 0o777, 0o600);
});

test('dirty submodule content is reported in excluded.submodules', async t => {
  const source = makeRepo(t);
  const repo = makeRepo(t);
  git(repo.cwd, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', source.cwd, 'nested repo');
  git(repo.cwd, 'commit', '-qm', 'add submodule');
  const revision = git(repo.cwd, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(repo.cwd, 'nested repo/tracked.txt'), 'dirty\n');
  repo.snapshot();
  const result = await start(t, repo, {...repo.input, role: 'head', revision, snapshotWorkingTree: true});
  if (!result) return;
  assert.deepEqual(result.snapshot.excluded.submodules, ['nested repo']);
  assert.deepEqual(result.snapshot.included, []);
});

function gatedRun(repo, name = 'gate') {
  const gate = path.join(repo.common, name);
  const task = js(`
    const fs = require('node:fs');
    const poll = setInterval(() => {
      if (fs.existsSync(process.argv[1])) clearInterval(poll);
    }, 10);
  `, gate);
  const release = () => fs.writeFileSync(gate, '');
  repo.teardown.push(release);
  return {
    input: {...repo.input, role: 'head',
      commands: [{id: 'gate', ...task, timeoutMs: 9000, results: {format: 'none'}}]},
    release
  };
}

function status(repo, runId, waitMs = 0, now = Date.now) {
  return verifyStatus({cwd: repo.cwd, input: {runId, waitMs}, env: cleanEnv, now});
}

async function until(read, accept, ms = 6500) {
  const deadline = performance.now() + ms;
  do {
    const value = await read();
    if (accept(value)) return value;
    await delay(25);
  } while (performance.now() < deadline);
  assert.fail('Timed out waiting for fixture state');
}

function pidGone(pid) {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    assert.equal(error.code, 'ESRCH');
    return true;
  }
}

function trackDetached(repo, result) {
  if (result.decision !== 'allow' || !['queued', 'preparing'].includes(result.state)) return;
  assert.ok(Number.isInteger(result.pid) && result.pid > 0 && result.pid !== process.pid);
  repo.teardown.push(async () => {
    await until(() => pidGone(result.pid), Boolean, 11000);
    assert.throws(() => process.kill(result.pid, 0), {code: 'ESRCH'});
  });
}

async function detach(t, repo, input, internal) {
  const result = await start(t, repo, {...input, detach: true}, internal);
  if (result) trackDetached(repo, result);
  return result;
}

function running(repo, runId) {
  return until(() => status(repo, runId), value =>
    value.state === 'unknown' || value.state === 'failed' ||
    value.state === 'running' && value.children.some(child => child.phase === 'commands'));
}

test('detach start returns queued or preparing immediately and status waits to succeeded', async t => {
  const repo = makeRepo(t);
  const gate = gatedRun(repo);
  const result = await detach(t, repo, gate.input);
  if (!result) return;
  assert.equal(result.state, 'preparing');
  assert.equal((await running(repo, result.runId)).state, 'running');
  const waiting = status(repo, result.runId, 7000);
  gate.release();
  assert.equal((await waiting).state, 'succeeded');
});

test('other commands work while detached run is active', async t => {
  const repo = makeRepo(t);
  const gate = gatedRun(repo);
  const result = await detach(t, repo, gate.input);
  if (!result) return;
  assert.equal((await running(repo, result.runId)).state, 'running');
  const [exit, current] = runCli('verify-status', repo.cwd, {runId: result.runId});
  assert.deepEqual([exit, current.decision, current.state], [0, 'allow', 'running']);
  gate.release();
});

test('heartbeat updates while detached run is running', async t => {
  const repo = makeRepo(t);
  const gate = gatedRun(repo);
  const result = await detach(t, repo, gate.input);
  if (!result) return;
  const before = await running(repo, result.runId);
  assert.equal(before.state, 'running');
  const after = await until(() => status(repo, result.runId), value => Date.parse(value.heartbeatAt) > Date.parse(before.heartbeatAt));
  assert.equal(after.state, 'running');
  assert.equal(after.pid, result.pid);
});

test('killed runner reports unknown with child pids and no restart', async t => {
  const repo = makeRepo(t);
  const gate = gatedRun(repo);
  const result = await detach(t, repo, gate.input);
  if (!result) return;
  const live = await running(repo, result.runId);
  assert.equal(live.state, 'running');
  const child = live.children.find(entry => entry.phase === 'commands');
  assert.ok(child.pid > 0);
  repo.teardown.push(() => until(() => pidGone(child.pid), Boolean));
  process.kill(result.pid, 'SIGKILL');
  await until(() => pidGone(result.pid), Boolean);
  assert.equal(pidGone(child.pid), false);
  const at = new Date(Date.now() - 15001).toISOString();
  fs.writeFileSync(runFile(repo, result.runId, 'heartbeat.json'), JSON.stringify({at, pid: result.pid}));
  for (const elapsed of [15001, 30002]) {
    const dead = await status(repo, result.runId, 0, Date.parse(at) + elapsed);
    assert.deepEqual([dead.state, dead.pid, dead.children], ['unknown', result.pid, live.children]);
  }
  assert.deepEqual(fs.readdirSync(path.join(repo.store, 'runs')), [result.runId]);
  gate.release();
});

test('stale heartbeat boundary 15000ms reports unknown only after the boundary', async t => {
  const repo = makeRepo(t);
  const gate = gatedRun(repo);
  const result = await detach(t, repo, gate.input);
  if (!result) return;
  const current = await running(repo, result.runId);
  assert.equal(current.state, 'running');
  const at = Date.parse(current.heartbeatAt);
  for (const [elapsed, expected] of [[14999, 'running'], [15000, 'running'], [15001, 'unknown']]) {
    assert.equal((await status(repo, result.runId, 0, at + elapsed)).state, expected);
  }
});

test('unreadable run.json reports unknown', async t => {
  const repo = makeRepo(t);
  const result = await start(t, repo);
  if (!result) return;
  fs.writeFileSync(runFile(repo, result.runId), '{');
  assert.equal((await status(repo, result.runId)).state, 'unknown');
});

for (const declaredConcurrent of [false, true]) {
  test(declaredConcurrent ? 'declaredConcurrent does not bypass queue but marks contended' : 'second start queues behind active run', async t => {
    const repo = makeRepo(t);
    const gate = gatedRun(repo);
    const first = await detach(t, repo, gate.input);
    if (!first) return;
    assert.equal((await running(repo, first.runId)).state, 'running');
    const second = await detach(t, repo, {...gate.input, declaredConcurrent});
    assert.deepEqual([second.state, second.queuedBehind], ['queued', [first.runId]]);
    assert.equal((await status(repo, second.runId)).state, 'queued');
    gate.release();
    const finished = await status(repo, second.runId, 7000);
    assert.equal(finished.state, 'succeeded');
    assert.deepEqual(finished.load.overlaps, []);
    if (declaredConcurrent) assert.equal(finished.load.class, 'contended');
  });
}

function startCliAsync(repo, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'verify-start', '--cwd', repo.cwd, '--workflow', workflowId, '--input', '-'], {
      env: cleanEnv, stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', exit => {
      if (!stdout) return reject(Error('verify-start did not report a result: ' + stderr));
      try {
        const result = JSON.parse(stdout);
        trackDetached(repo, result);
        resolve([exit, result]);
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(JSON.stringify(input));
  });
}

test('concurrent starts serialize through the queue and share machine id', async t => {
  const repo = makeRepo(t);
  const gate = gatedRun(repo);
  const input = {...gate.input, detach: true};
  const starts = await Promise.all([startCliAsync(repo, input), startCliAsync(repo, input)]);
  for (const [exit, result] of starts) assert.deepEqual([exit, result.decision], [0, 'allow'], JSON.stringify(result));
  const [first, second] = starts.map(([, value]) => value).sort((a, b) => a.queuedBehind.length - b.queuedBehind.length);
  assert.deepEqual([first.state, second.state, second.queuedBehind], ['preparing', 'queued', [first.runId]]);
  const machine = readJson(runFile(repo, first.runId)).machineId;
  assert.ok(machine);
  assert.equal(readJson(runFile(repo, second.runId)).machineId, machine);
  gate.release();
  assert.equal((await status(repo, second.runId, 7000)).state, 'succeeded');
});

test('foreground run follows the same queue', async t => {
  const repo = makeRepo(t);
  const gate = gatedRun(repo);
  const first = await detach(t, repo, gate.input);
  if (!first) return;
  const pending = start(t, repo, gate.input);
  repo.teardown.push(() => pending);
  const queued = await until(() => fs.readdirSync(path.join(repo.store, 'runs')).find(id => id !== first.runId &&
    fs.existsSync(runFile(repo, id))), Boolean, 3500);
  assert.equal((await status(repo, queued)).state, 'queued');
  gate.release();
  const second = await pending;
  assert.deepEqual([second.state, second.queuedBehind], ['succeeded', [first.runId]]);
});

test('slow worktree Git keeps heartbeat fresh and the next run queued', async t => {
  const repo = makeRepo(t);
  const entered = path.join(repo.common, 'smudge-entered');
  const release = path.join(repo.common, 'smudge-release');
  const filter = path.join(repo.common, 'slow-smudge.cjs');
  fs.writeFileSync(filter, `
    const fs = require('node:fs');
    const contents = fs.readFileSync(0);
    fs.writeFileSync(process.argv[2], '');
    const deadline = Date.now() + 2500;
    const timer = setInterval(() => {
      if (!fs.existsSync(process.argv[3]) && Date.now() < deadline) return;
      clearInterval(timer);
      process.stdout.write(contents);
    }, 10);
  `);
  repo.teardown.push(() => fs.writeFileSync(release, ''));
  const smudge = [process.execPath, filter, entered, release].map(arg => JSON.stringify(arg)).join(' ');
  git(repo.cwd, 'config', 'filter.slow.smudge', smudge);
  fs.writeFileSync(path.join(repo.cwd, '.gitattributes'), 'tracked.txt filter=slow\n');
  git(repo.cwd, 'add', '.gitattributes');
  git(repo.cwd, 'commit', '-qm', 'add slow smudge filter');
  repo.input.revision = git(repo.cwd, 'rev-parse', 'HEAD');
  repo.snapshot();

  const internal = {heartbeatIntervalMs: 35, heartbeatStaleMs: 450};
  const input = {...repo.input, role: 'head'};
  const first = start(t, repo, input, internal);
  repo.teardown.push(() => first);
  await until(() => fs.existsSync(entered), Boolean);
  const runs = path.join(repo.store, 'runs');
  const [firstId] = fs.readdirSync(runs);
  const firstStatus = () => verifyStatus({cwd: repo.cwd, input: {runId: firstId}, env: cleanEnv}, internal);
  const before = await firstStatus();

  const second = start(t, repo, input, internal);
  repo.teardown.push(() => second);
  const other = await until(() => fs.readdirSync(runs).find(id => id !== firstId && fs.existsSync(runFile(repo, id))), Boolean);
  await delay(internal.heartbeatStaleMs);
  const during = await firstStatus();
  assert.equal(during.state, 'preparing');
  assert.equal(during.phases.find(phase => phase.name === 'worktree').endedAt, null);
  assert.ok(Date.parse(during.heartbeatAt) > Date.parse(before.heartbeatAt));
  const queued = await status(repo, other);
  assert.deepEqual([queued.state, queued.queuedBehind], ['queued', [firstId]]);

  fs.writeFileSync(release, '');
  const finished = await Promise.all([first, second]);
  assert.deepEqual(finished.map(run => run.state), ['succeeded', 'succeeded']);
});

function queueLock(repo, {pid = process.pid, hostname = os.hostname()} = {}) {
  fs.mkdirSync(repo.store, {recursive: true, mode: 0o700});
  const filename = path.join(repo.store, 'queue.lock');
  fs.writeFileSync(filename, JSON.stringify({pid, hostname, createdAt: new Date().toISOString()}), {mode: 0o600});
  return filename;
}

test('published queue lock contains its owner immediately', async t => {
  const repo = makeRepo(t);
  const lock = path.join(repo.store, 'queue.lock');
  const published = [];
  const open = fs.openSync;
  const link = fs.linkSync;
  t.mock.method(fs, 'openSync', (filename, flags, ...args) => {
    const fd = open(filename, flags, ...args);
    if (filename === lock && flags === 'wx') published.push(fs.readFileSync(lock, 'utf8'));
    return fd;
  });
  t.mock.method(fs, 'linkSync', (source, dest) => {
    link(source, dest);
    if (dest === lock) published.push(fs.readFileSync(lock, 'utf8'));
  });
  assert.equal((await start(t, repo)).state, 'succeeded');
  assert.equal(published.length, 1);
  assert.ok(published[0], 'queue.lock became visible before its owner was written');
  const owner = JSON.parse(published[0]);
  assert.deepEqual([owner.pid, owner.hostname], [process.pid, os.hostname()]);
  assert.ok(Number.isFinite(Date.parse(owner.createdAt)));
  assert.deepEqual(fs.readdirSync(repo.store).filter(name => name.startsWith('queue.lock')), []);
});

test('ownerless queue lock temporary files do not block start', async t => {
  const repo = makeRepo(t);
  fs.mkdirSync(repo.store, {recursive: true, mode: 0o700});
  const orphan = path.join(repo.store, 'queue.lock.0123456789abcdef.tmp');
  const writing = path.join(repo.store, 'queue.lock.0123456789fedcba.tmp');
  fs.writeFileSync(orphan, '', {mode: 0o600});
  const fd = fs.openSync(writing, 'wx', 0o600);
  try {
    assert.equal((await start(t, repo)).state, 'succeeded');
    assert.equal(fs.statSync(writing).isFile(), true);
  } finally {
    fs.closeSync(fd);
  }
});

test('dead queue lock owner is reclaimed by concurrent starts', async t => {
  const repo = makeRepo(t);
  const gate = gatedRun(repo);
  const dead = spawnSync(process.execPath, ['-e', '']);
  assert.equal(dead.status, 0);
  assert.throws(() => process.kill(dead.pid, 0), {code: 'ESRCH'});
  const lock = queueLock(repo, {pid: dead.pid});
  const started = performance.now();
  const results = await Promise.all([
    startCliAsync(repo, {...gate.input, detach: true}),
    startCliAsync(repo, {...gate.input, detach: true})
  ]);
  for (const [exit, result] of results) assert.deepEqual([exit, result.decision], [0, 'allow'], JSON.stringify(result));
  assert.ok(performance.now() - started < 5000);
  const [first, second] = results.map(([, result]) => result).sort((a, b) => a.queuedBehind.length - b.queuedBehind.length);
  assert.deepEqual([first.state, second.state, second.queuedBehind], ['preparing', 'queued', [first.runId]]);
  gate.release();
  assert.equal((await status(repo, second.runId, 7000)).state, 'succeeded');
  assert.equal(fs.existsSync(lock), false);
});

test('live queue lock owner blocks admission until release', async t => {
  const repo = makeRepo(t);
  const lock = queueLock(repo);
  let completed = false;
  const pending = start(t, repo).finally(() => { completed = true; });
  try {
    const runs = path.join(repo.store, 'runs');
    await until(() => fs.existsSync(runs), Boolean);
    await delay(300);
    assert.equal(completed, false);
    assert.equal(readJson(lock).pid, process.pid);
    assert.deepEqual(fs.readdirSync(runs).filter(id => fs.existsSync(runFile(repo, id))), []);
  } finally {
    if (fs.existsSync(lock)) fs.unlinkSync(lock);
    await pending;
  }
  assert.equal((await pending).state, 'succeeded');
});

test('unverifiable queue lock owner holds with the reason and preserves the lock', async t => {
  const foreign = makeRepo(t);
  const unreadable = makeRepo(t);
  const remoteLock = queueLock(foreign, {hostname: os.hostname() + '-other'});
  const invalidLock = queueLock(unreadable);
  fs.writeFileSync(invalidLock, '{');
  await Promise.all([[foreign, remoteLock, /another host/i], [unreadable, invalidLock, /unreadable/i]].map(async ([repo, lock, reason]) => {
    const original = fs.readFileSync(lock);
    const result = await verifyStart({cwd: repo.cwd, input: repo.input, env: cleanEnv}, {queueLockWaitMs: 200});
    assert.deepEqual([result.decision, result.code], ['hold', 'storage_unavailable']);
    assert.match(result.message, reason);
    assert.deepEqual(fs.readFileSync(lock), original);
  }));
});

test('samples are recorded at LOAD_SAMPLE_MS', async t => {
  const repo = makeRepo(t);
  const gate = gatedRun(repo);
  let observed = false;
  const pending = start(t, repo, gate.input, {sampleMs: 25, loadavg: () => {
    if (!observed) { observed = true; return loadavg(); }
    return [1e6, 0, 0];
  }});
  repo.teardown.push(() => pending);
  const runs = path.join(repo.store, 'runs');
  const runId = await until(() => fs.existsSync(runs) && fs.readdirSync(runs).find(id => fs.existsSync(runFile(repo, id))), Boolean);
  assert.equal((await running(repo, runId)).state, 'running');
  await delay(100);
  gate.release();
  const result = await pending;
  assert.equal(result.load.class, 'contended');
  assert.ok(result.load.samples.length > 1);
  assert.ok(result.load.samples.every(sample => sample.loadavg[0] === 1e6 && sample.freemem > 0 && Number.isFinite(Date.parse(sample.at))));
});

test('overlapping runs are recorded in overlaps', async t => {
  const repo = makeRepo(t);
  const first = gatedRun(repo, 'first-gate');
  const second = gatedRun(repo, 'second-gate');
  const firstPending = start(t, repo, first.input, {sampleMs: 25});
  repo.teardown.push(() => firstPending);
  const runs = path.join(repo.store, 'runs');
  const firstId = await until(() => fs.existsSync(runs) && fs.readdirSync(runs).find(id => fs.existsSync(runFile(repo, id))), Boolean);
  const started = await running(repo, firstId);
  assert.equal(started.state, 'running');
  // A second runner can start after the first heartbeat goes stale.
  fs.writeFileSync(runFile(repo, firstId, 'heartbeat.json'), JSON.stringify({
    at: new Date(Date.now() - 16000).toISOString(), pid: started.pid
  }));
  const secondPending = start(t, repo, second.input, {sampleMs: 25});
  repo.teardown.push(() => secondPending);
  const secondId = await until(() => fs.readdirSync(runs).find(id => id !== firstId && fs.existsSync(runFile(repo, id))), Boolean);
  assert.equal((await running(repo, secondId)).state, 'running');
  await until(() => status(repo, firstId), value => value.load?.overlaps.includes(secondId));
  await until(() => status(repo, secondId), value => value.load?.overlaps.includes(firstId));
  first.release();
  second.release();
  const [a, b] = await Promise.all([firstPending, secondPending]);
  assert.deepEqual([a.load.class, a.load.overlaps], ['contended', [secondId]]);
  assert.deepEqual([b.load.class, b.load.overlaps], ['contended', [firstId]]);
});

function editRun(repo, runId, change) {
  const filename = runFile(repo, runId);
  const run = readJson(filename);
  change(run);
  fs.writeFileSync(filename, JSON.stringify(run));
}

function verifyCli(repo, operation, input, exit, code = 'ok', env = cleanEnv) {
  const [actualExit, result] = runCli('verify-' + operation, repo.cwd, input, env);
  assert.deepEqual([actualExit, result.decision, result.code], [exit, {0: 'allow', 2: 'deny', 3: 'hold'}[exit], code],
    JSON.stringify(result));
  return result;
}

function compare(repo, base, head, options = {}) {
  return verifyCli(repo, 'compare', {baseRunId: base.runId, headRunId: head.runId, ...options}, 0);
}

const newFailureId = 'tests/a.test.mjs::fixture::new (case)+$#1';
const originalFailureId = 'tests/a.test.mjs::fixture::prior fail#1';

function comparisonInput(repo) {
  const script = `
    const fs = require('node:fs');
    const changed = fs.existsSync('tracked.txt') &&
      !fs.existsSync(process.argv[1]);
    const test = (name, file, time, fail) =>
      '<testcase name="' + name + '" file="' + file + '" time="' + time + '">' +
      (fail ? '<failure/>' : '') + '</testcase>';
    fs.writeFileSync('results.xml', '<testsuites><testsuite name="fixture">' +
      test('new (case)+$', 'tests/a.test.mjs', 0.012, changed) +
      test('prior fail', 'tests/a.test.mjs', 0.010, true) +
      test('slow file', 'tests/deep/b.test.mjs', 0.020, false) +
      test('quick', 'tests/c.test.mjs', 0.001, false) + '</testsuite>' +
      (changed ? '<testsuite file="tests/c.test.mjs" errors="1"/>' : '') +
      '</testsuites>');
  `;
  const isolate = {args: ['-e', `
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    const [file, name, pattern, id, worktree] = process.argv.slice(1);
    assert.equal(file, 'tests/a.test.mjs');
    assert.equal(name, 'new (case)+$');
    assert.equal(pattern, '^new \\\\(case\\\\)\\\\+\\\\$$');
    assert.equal(id, 'tests/a.test.mjs::fixture::new (case)+$#1');
    assert.equal(process.cwd(), worktree);
    assert.ok(fs.existsSync(file));
    fs.writeFileSync('results.xml', '<testsuite name="fixture"><testcase name="' + name + '" file="' + file + '"/></testsuite>');
  `, '{file}', '{name}', '{namePattern}', '{testId}', '{worktree}']};
  const command = js(script, path.join(repo.common, 'pass-new'));
  return {...repo.input, commands: [{id: 'tests', ...command,
    isolate, args: [...command.args, {glob: 'tests/**/*.test.mjs'}],
    results: {format: 'junit-xml', path: 'results.xml'}}]};
}

async function comparisonRuns(t, repo) {
  fs.rmSync(path.join(repo.cwd, 'tests/deep/b.test.mjs'));
  fs.writeFileSync(path.join(repo.cwd, 'tests/c.test.mjs'), '// c\n');
  git(repo.cwd, 'add', '-A');
  git(repo.cwd, 'commit', '-qm', 'change test files');
  const input = comparisonInput(repo);
  repo.snapshot();
  const base = await start(t, repo, {...input, revision: repo.first});
  const head = await start(t, repo, {...input, revision: git(repo.cwd, 'rev-parse', 'HEAD'), role: 'head'});
  assert.deepEqual([base.state, head.state], ['succeeded', 'succeeded']);
  return {base, head};
}

for (const [name, code, change] of [
  ['run_failed', 'run_failed', run => { run.state = 'failed'; }],
  ['run_unknown', 'run_unknown', run => { run.state = 'unknown'; }],
  ['role_mismatch', 'role_mismatch', run => { run.role = 'baseline'; }],
  ['command_set_mismatch for a different id', 'command_set_mismatch', run => { run.input.commands[0].id = 'other'; }],
  ['command_set_mismatch for a different glob template', 'command_set_mismatch', run => {
    run.input.commands[0].args.push({glob: '**/*.test.mjs'});
  }],
  ['execution_mismatch for a different sandboxMode', 'execution_mismatch', run => { run.input.sandboxMode = 'sandboxed'; }],
  ['execution_mismatch for a different host', 'execution_mismatch', run => { run.input.hostPlatform = 'claude'; }],
  ['execution_mismatch for a different machine id', 'execution_mismatch', run => { run.machineId = 'another-machine'; }]
]) {
  test('compare holds ' + name, async t => {
    const repo = makeRepo(t);
    const base = await start(t, repo);
    const head = await start(t, repo, {...repo.input, role: 'head'});
    editRun(repo, head.runId, change);
    verifyCli(repo, 'compare', {baseRunId: base.runId, headRunId: head.runId}, 3, code);
  });
}

test('compare writes reports when only executionEnvironment differs', async t => {
  const repo = makeRepo(t);
  const base = await start(t, repo);
  const head = await start(t, repo, {...repo.input, role: 'head', executionEnvironment: 'codex-desktop'});
  assert.notEqual(base.cacheKeyPhase1, head.cacheKeyPhase1);

  const {reportJson, reportMd, verdict} = compare(repo, base, head);
  const report = readJson(reportJson);
  assert.deepEqual([report.base.runId, report.head.runId], [base.runId, head.runId]);
  assert.equal(report.conditions.executionEnvironment, 'codex-desktop');
  assert.equal(verdict, 'no-new-failures');
  assert.ok(fs.readFileSync(reportMd, 'utf8').includes(head.runId));
});

test('compare holds prepare_mismatch for different prepare commands', async t => {
  const repo = makeRepo(t);
  const base = await start(t, repo);
  const head = await start(t, repo, {...repo.input, role: 'head', prepare: [js('')]});
  verifyCli(repo, 'compare', {baseRunId: base.runId, headRunId: head.runId}, 3, 'prepare_mismatch');
});

test('compare holds prepare_mismatch when bytes at the same seed path differ', async t => {
  const repo = makeRepo(t);
  const source = path.join(repo.cwd, 'seed.txt');
  const input = {...repo.input, seedFiles: [{source, dest: 'seed.txt'}]};
  fs.writeFileSync(source, 'old');
  const base = await start(t, repo, input);
  fs.writeFileSync(source, 'new');
  repo.snapshot();
  const head = await start(t, repo, {...input, role: 'head'});
  verifyCli(repo, 'compare', {baseRunId: base.runId, headRunId: head.runId}, 3, 'prepare_mismatch');
});

test('compare holds run_incomplete while base is running', async t => {
  const repo = makeRepo(t);
  const head = await start(t, repo, {...repo.input, role: 'head'});
  const gate = gatedRun(repo);
  const base = await detach(t, repo, {...gate.input, role: 'baseline'});
  if (!base) return;
  assert.equal((await running(repo, base.runId)).state, 'running');
  verifyCli(repo, 'compare', {baseRunId: base.runId, headRunId: head.runId}, 3, 'run_incomplete');
  gate.release();
  assert.equal((await status(repo, base.runId, 7000)).state, 'succeeded');
});

test('compare writes report json and md and returns verdict', async t => {
  const repo = makeRepo(t);
  const {base, head} = await comparisonRuns(t, repo);
  const {reportJson, reportMd, verdict, counts} = compare(repo, base, head);
  const reportPath = path.join(repo.store, 'reports', base.runId + '..' + head.runId);
  assert.deepEqual([reportJson, reportMd, verdict], [reportPath + '.json', reportPath + '.md', 'new-failures']);
  const result = readJson(reportJson);
  assert.deepEqual(result.newFailures, [{commandId: 'tests', testId: newFailureId}]);
  assert.deepEqual(result.baselineReproduced, [{commandId: 'tests', testId: originalFailureId}]);
  assert.deepEqual(result.newFailureCandidates, [{commandId: 'tests', testId: null, reason: 'file_error'}]);
  assert.deepEqual([counts.newFailures, counts.baselineReproduced, counts.newFailureCandidates], [1, 1, 1]);
  assert.equal(result.base.runId, base.runId);
  assert.equal(result.head.runId, head.runId);
  assert.ok(result.generatedAt);
  assert.ok(result.schemaVersion);
  assert.equal(result.conditions.sandboxMode, 'none');
  assert.ok(result.conditions.tmpdir.realpath);
  assert.deepEqual(result.intermittentCandidates, []);
  assert.match(fs.readFileSync(reportMd, 'utf8'), /기록 조건[\s\S]*새 실패[\s\S]*기준선 재현[\s\S]*간헐 후보[\s\S]*느린 상위/);
});

test('tap load failure of symlinked test file is command incomplete symlinked_test_file', async t => {
  const repo = makeRepo(t);
  const outside = path.join(repo.common, 'outside.mjs');
  fs.writeFileSync(outside, '');
  const prepare = [js([
    'const fs = require("node:fs");',
    'fs.symlinkSync("a.test.mjs", "tests/alias.mjs");',
    'fs.symlinkSync("deep", "tests/linked-dir", "dir");',
    'fs.symlinkSync(process.argv[1], "tests/outside-link.mjs");',
    'fs.symlinkSync("missing.mjs", "tests/dangling-link.mjs");'
  ].join('\n'), outside)];
  const commands = [
    ['link-name', 'not ok 1 - tests/alias.mjs'],
    ['link-location', 'not ok 1 - loader error\n  ---\n  location: tests/alias.mjs:1:1\n  ...'],
    ['parent-link-name', 'not ok 1 - tests/linked-dir/b.test.mjs'],
    ['parent-link-location', 'not ok 1 - loader error\n  ---\n  location: tests/linked-dir/b.test.mjs:1:1\n  ...'],
    ['outside-link-name', 'not ok 1 - tests/outside-link.mjs'],
    ['dangling-link-location', 'not ok 1 - loader error\n  ---\n  location: tests/dangling-link.mjs:1:1\n  ...']
  ].map(([id, point]) => ({
    id, ...js('process.stdout.write(process.argv[1]); process.exitCode = 1;', 'TAP version 13\n' + point + '\n1..1\n'),
    results: {format: 'tap', stream: 'stdout'}
  }));
  const input = {...repo.input, prepare, commands};
  const base = await start(t, repo, input);
  if (!base) return;
  const head = await start(t, repo, {...input, role: 'head'});
  if (!head) return;
  await t.test('runner records command incomplete for both path forms in both runs', () => {
    for (const result of [base, head]) {
      assert.equal(result.state, 'succeeded');
      const records = readJson(runFile(repo, result.runId, 'result.json')).commands;
      const incomplete = records.filter(({summary}) => summary.incomplete.some(({scope, reason}) =>
        scope === 'command' && reason === 'symlinked_test_file'));
      assert.deepEqual(incomplete.map(({id}) => id), commands.map(({id}) => id));
      assert.deepEqual(records.flatMap(({summary}) => summary.tests), []);
    }
  });
  await t.test('compare reports candidates when base and head both have link load failures', () => {
    const {reportJson, verdict} = compare(repo, base, head);
    assert.equal(verdict, 'candidates');
    const report = readJson(reportJson);
    assert.deepEqual(report.newFailureCandidates.filter(({reason}) => reason === 'symlinked_test_file'),
      commands.map(({id}) => ({commandId: id, testId: null, reason: 'symlinked_test_file'})));
    assert.deepEqual(report.baselineReproduced, []);
  });
});

test('tap load failure distinguishes symlinked, regular, missing and external paths', async t => {
  const repo = makeRepo(t);
  const outside = path.join(repo.common, 'outside.mjs');
  fs.writeFileSync(outside, '');
  const prepare = [js('require("node:fs").symlinkSync("deep", "tests/linked-dir", "dir");')];
  const tapOutput = [
    'TAP version 13',
    'not ok 1 - tests/a.test.mjs',
    'not ok 2 - tests/missing.mjs',
    'not ok 3 - tests/linked-dir/missing.mjs',
    'not ok 4 - ' + outside,
    'not ok 5 - ../outside.mjs',
    '1..5'
  ].join('\n');
  const commands = [{id: 'tap', ...js('console.log(process.argv[1]); process.exitCode = 1;', tapOutput),
    results: {format: 'tap', stream: 'stdout'}}];
  const result = await start(t, repo, {...repo.input, prepare, commands});
  if (!result) return;
  const [{summary}] = readJson(runFile(repo, result.runId, 'result.json')).commands;
  assert.deepEqual(summary.incomplete, [
    {scope: 'file', path: 'tests/a.test.mjs', reason: 'file_error'},
    {scope: 'command', reason: 'symlinked_test_file'}
  ]);
  assert.deepEqual(summary.tests.map(({file, name, status}) => [file, name, status]),
    ['tests/missing.mjs', outside, '../outside.mjs'].map(name => ['-', name, 'failed']));
});

test('compare records expanded file lists in the report', async t => {
  const repo = makeRepo(t);
  const {base, head} = await comparisonRuns(t, repo);
  const {reportJson} = compare(repo, base, head);
  const {commands, addedFiles, removedFiles} = readJson(reportJson);
  assert.deepEqual(commands[0].base.expandedFiles, ['tests/a.test.mjs', 'tests/deep/b.test.mjs']);
  assert.deepEqual(commands[0].head.expandedFiles, ['tests/a.test.mjs', 'tests/c.test.mjs']);
  assert.deepEqual(addedFiles, [{commandId: 'tests', path: 'tests/c.test.mjs'}]);
  assert.deepEqual(removedFiles, [{commandId: 'tests', path: 'tests/deep/b.test.mjs'}]);
});

test('compare slowest has files, tests and phases topN', async t => {
  const repo = makeRepo(t);
  const {base, head} = await comparisonRuns(t, repo);
  const {reportJson} = compare(repo, base, head, {topN: 2});
  const {slowest} = readJson(reportJson);
  assert.deepEqual(slowest.files.map(({file}) => file), ['tests/a.test.mjs', 'tests/deep/b.test.mjs']);
  assert.deepEqual(slowest.tests.map(({durationMs}) => durationMs), [20, 12]);
  assert.equal(slowest.phases.length, 2);
  assert.ok(slowest.phases[0].ms >= slowest.phases[1].ms);
});

test('compare history mismatch under the same cacheKey yields intermittent candidate', async t => {
  const repo = makeRepo(t);
  const {base, head} = await comparisonRuns(t, repo);
  fs.writeFileSync(path.join(repo.common, 'pass-new'), '');
  const second = await start(t, repo, {...comparisonInput(repo), revision: head.commit, role: 'head'});
  assert.equal(second.cacheKey, head.cacheKey);
  const {reportJson} = compare(repo, base, second);
  const {intermittentCandidates, verdict} = readJson(reportJson);
  const candidate = intermittentCandidates.find(item => item.testId === newFailureId);
  assert.deepEqual(candidate.history, [
    {runId: head.runId, loadClass: 'quiet', status: 'failed'},
    {runId: second.runId, loadClass: 'quiet', status: 'passed'}
  ]);
  assert.equal(verdict, 'candidates');
});

function rerun(repo, head, options = {}, exit = 0, code = 'ok') {
  return verifyCli(repo, 'rerun', {runId: head.runId, testId: newFailureId, attempt: 1, sandboxMode: 'none', ...options}, exit, code);
}

test('rerun passes attempt in isolation and reports passesInIsolation yes', async t => {
  const repo = makeRepo(t);
  const {head} = await comparisonRuns(t, repo);
  const result = rerun(repo, head);
  assert.deepEqual([result.runStatus, result.passesInIsolation, result.limit], ['passed', 'yes', 3]);
  assert.deepEqual(result.attempts.map(({attempt, status}) => [attempt, status]), [[1, 'passed']]);
  assert.ok(result.attempts[0].ms >= 0);
  assert.ok(fs.existsSync(runFile(repo, head.runId, 'reruns.jsonl')));
});

test('rerun with filter matching zero tests is no_match and not a pass', async t => {
  const repo = makeRepo(t);
  fs.writeFileSync(path.join(repo.cwd, 'tests/a.test.mjs'),
    'import {test} from "node:test"; test("target", () => {});\n');
  git(repo.cwd, 'add', 'tests/a.test.mjs');
  git(repo.cwd, 'commit', '-qm', 'add filtered test');
  repo.snapshot();
  const args = ['--test', '--test-reporter={arcNodeReporter}', '--test-reporter-destination=stdout'];
  const input = {...repo.input, role: 'head', revision: git(repo.cwd, 'rev-parse', 'HEAD'), commands: [{
    id: 'node', executable: process.execPath, args: [...args, 'tests/a.test.mjs'],
    isolate: {args: [...args, '--test-name-pattern=^does not exist$', '{file}']},
    results: {format: 'junit-xml', stream: 'stdout'}
  }]};
  const head = await start(t, repo, input);
  if (!head) return;
  const result = rerun(repo, head, {testId: 'tests/a.test.mjs::::target#1'});
  assert.deepEqual([result.runStatus, result.attempts[0].status, result.passesInIsolation],
    ['inconclusive', 'no_match', null]);
});

test('rerun passes only when target test parsed as passed', async t => {
  const repo = makeRepo(t);
  const evidence = path.join(repo.common, 'isolation.xml');
  const xml = (file, suite, child = '') => '<testsuite name="' + suite + '"><testcase name="target" file="' +
    file + '">' + child + '</testcase></testsuite>';
  const target = 'tests/a.test.mjs';
  const command = js('require("node:fs").writeFileSync("report.xml", process.argv[1])', xml(target, 'suite', '<failure/>'));
  const input = {...repo.input, role: 'head', commands: [{
    id: 'report', ...command, results: {format: 'junit-xml', path: 'report.xml'},
    isolate: {args: js(`
      const fs = require('node:fs');
      if (fs.existsSync(process.argv[1])) fs.copyFileSync(process.argv[1], 'report.xml');
    `, evidence).args}
  }]};
  const head = await start(t, repo, input);
  if (!head) return;
  const testId = 'tests/a.test.mjs::suite::target#1';
  const cases = [
    ['different file', xml('tests/deep/b.test.mjs', 'suite'), 'inconclusive', 'no_match', null],
    ['different suite', xml(target, 'other'), 'inconclusive', 'no_match', null],
    ['invalid report', '<testsuite>', 'inconclusive', 'incomplete', null],
    ['skipped target', xml(target, 'suite', '<skipped/>'), 'inconclusive', 'skipped', null],
    ['failed target', xml(target, 'suite', '<failure/>'), 'failed', 'failed', 'no'],
    ['passed target', xml(target, 'suite'), 'passed', 'passed', 'yes'],
    ['stale report', null, 'inconclusive', 'incomplete', 'yes']
  ];
  for (const [i, [name, output, runStatus, status, passes]] of cases.entries()) {
    await t.test(name, () => {
      if (output === null) fs.unlinkSync(evidence);
      else fs.writeFileSync(evidence, output);
      const result = rerun(repo, head, {testId, attempt: i + 1, limit: cases.length});
      assert.deepEqual([result.runStatus, result.attempts.at(-1).status, result.passesInIsolation],
        [runStatus, status, passes]);
    });
  }
});

test('rerun attempt out of order denies', async t => {
  const repo = makeRepo(t);
  const {head} = await comparisonRuns(t, repo);
  rerun(repo, head, {attempt: 2}, 2, 'attempt_out_of_order');
  assert.equal(fs.existsSync(runFile(repo, head.runId, 'reruns.jsonl')), false);
});

test('rerun fourth attempt with default limit denies rerun_limit', async t => {
  const repo = makeRepo(t);
  const {head} = await comparisonRuns(t, repo);
  for (const attempt of [1, 2, 3]) rerun(repo, head, {attempt});
  rerun(repo, head, {attempt: 4}, 2, 'rerun_limit');
});

test('rerun limit option permits up to 10 attempts', async t => {
  const repo = makeRepo(t);
  const {head} = await comparisonRuns(t, repo);
  for (let attempt = 1; attempt <= 10; attempt++) {
    assert.equal(rerun(repo, head, {attempt, limit: 10}).attempts.length, attempt);
  }
  rerun(repo, head, {attempt: 11, limit: 10}, 2, 'rerun_limit');
  rerun(repo, head, {attempt: 11, limit: 11}, 2, 'invalid_request');
});

test('rerun with no isolate template returns not-run exit 0', async t => {
  const repo = makeRepo(t);
  const head = await start(t, repo, {...repo.input, role: 'head'});
  const result = rerun(repo, head, {testId: '-::::fixture#1'});
  assert.deepEqual([result.runStatus, result.reason, result.attempts, result.passesInIsolation],
    ['not-run', 'no_isolation_template', [], null]);
});

test('rerun on non-succeeded run holds run_incomplete', async t => {
  const repo = makeRepo(t);
  const head = await start(t, repo, {...repo.input, role: 'head'});
  editRun(repo, head.runId, run => { run.state = 'failed'; });
  rerun(repo, head, {}, 3, 'run_incomplete');
});

test('rerun with different sandboxMode holds execution_mismatch', async t => {
  const repo = makeRepo(t);
  const {head} = await comparisonRuns(t, repo);
  rerun(repo, head, {sandboxMode: 'sandboxed'}, 3, 'execution_mismatch');
});

test('rerun isolated pass keeps newFailures classification in next compare', async t => {
  const repo = makeRepo(t);
  const {base, head} = await comparisonRuns(t, repo);
  rerun(repo, head);
  const {reportJson} = compare(repo, base, head);
  const report = readJson(reportJson);
  assert.deepEqual(report.newFailures, [{commandId: 'tests', testId: newFailureId}]);
  assert.equal(report.intermittentCandidates[0].testId, newFailureId);
  assert.equal(report.intermittentCandidates[0].passesInIsolation, 'yes');
  assert.equal(report.intermittentCandidates[0].reruns.length, 1);
});

function cleanup(repo, run, dryRun = false, exit = 0, code = 'ok', env = cleanEnv) {
  return verifyCli(repo, 'cleanup', {runId: run.runId, dryRun}, exit, code, env);
}

function cleanupTarget(run) {
  return [{kind: 'worktree', path: run.worktree.path}];
}

test('cleanup dryRun returns immediately while detached run is active', async t => {
  const repo = makeRepo(t);
  const gate = gatedRun(repo);
  const run = await detach(t, repo, gate.input);
  if (!run) return;
  assert.equal((await running(repo, run.runId)).state, 'running');
  cleanup(repo, run, true, 3, 'run_active');
  assert.equal((await status(repo, run.runId)).state, 'running');
  gate.release();
  assert.equal((await status(repo, run.runId, 7000)).state, 'succeeded');
});

test('cleanup dryRun lists targets without changes', async t => {
  const repo = makeRepo(t);
  const run = await start(t, repo);
  const before = fs.readFileSync(runFile(repo, run.runId));
  const registration = git(repo.cwd, 'worktree', 'list', '--porcelain');
  const result = cleanup(repo, run, true);
  assert.deepEqual([result.dryRun, result.targets, result.removed, result.residualPaths],
    [true, cleanupTarget(run), [], []]);
  assert.deepEqual(fs.readFileSync(runFile(repo, run.runId)), before);
  assert.equal(git(repo.cwd, 'worktree', 'list', '--porcelain'), registration);
  assert.ok(fs.existsSync(run.worktree.path));
});

test('cleanup removes tool worktree and keeps runs evidence', async t => {
  const repo = makeRepo(t);
  const run = await start(t, repo);
  const result = cleanup(repo, run);
  assert.deepEqual(result.targets, cleanupTarget(run));
  assert.ok(result.removed.includes(run.worktree.path));
  assert.deepEqual(result.residualPaths, []);
  assert.equal(fs.existsSync(path.dirname(run.worktree.path)), false);
  assert.ok(fs.existsSync(runFile(repo, run.runId, 'result.json')));
  assert.ok(fs.existsSync(runFile(repo, run.runId)));
  assert.ok(!git(repo.cwd, 'worktree', 'list', '--porcelain').includes(run.worktree.path));
});

test('cleanup denies a user-created worktree even with a forged run.json path', async t => {
  const repo = makeRepo(t);
  const userTree = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-verify-user-'));
  t.after(() => fs.rmSync(userTree, {recursive: true, force: true}));
  const run = await start(t, repo);
  git(repo.cwd, 'worktree', 'add', '--detach', '--lock', '--reason', 'arc-verify:' + run.runId, userTree, run.commit);
  editRun(repo, run.runId, saved => { saved.worktree.path = userTree; });
  cleanup(repo, run, false, 2, 'not_tool_owned');
  assert.ok(fs.existsSync(path.join(userTree, 'tracked.txt')));
  assert.ok(fs.existsSync(run.worktree.path));
});

test('cleanup denies an owner.json mismatch', async t => {
  const repo = makeRepo(t);
  const run = await start(t, repo);
  const filename = path.join(path.dirname(run.worktree.path), 'owner.json');
  fs.writeFileSync(filename, JSON.stringify({...readJson(filename), tool: 'different-tool'}));
  cleanup(repo, run, false, 2, 'not_tool_owned');
  assert.ok(fs.existsSync(run.worktree.path));
});

test('cleanup denies an OID mismatch or a different lock reason', async t => {
  const repo = makeRepo(t);
  const run = await start(t, repo);
  const {path: worktree} = run.worktree;
  git(worktree, 'checkout', '--detach', repo.first);
  cleanup(repo, run, false, 2, 'not_tool_owned');
  git(worktree, 'checkout', '--detach', run.commit);
  git(repo.cwd, 'worktree', 'unlock', worktree);
  git(repo.cwd, 'worktree', 'lock', '--reason', 'manual lock', worktree);
  cleanup(repo, run, false, 2, 'not_tool_owned');
  assert.ok(fs.existsSync(worktree));
});

test('cleanup holds run_active', async t => {
  const repo = makeRepo(t);
  const run = await start(t, repo);
  editRun(repo, run.runId, saved => { saved.state = 'running'; });
  cleanup(repo, run, false, 3, 'run_active');
  assert.ok(fs.existsSync(run.worktree.path));
});

test('cleanup allows unknown run only when pid is gone', async t => {
  const repo = makeRepo(t);
  const run = await start(t, repo);
  editRun(repo, run.runId, saved => { saved.state = 'unknown'; });
  cleanup(repo, run, false, 3, 'run_unknown');
  const gone = spawnSync(process.execPath, ['-e', ''], {env: cleanEnv, shell: false});
  assert.equal(gone.status, 0);
  assert.throws(() => process.kill(gone.pid, 0), {code: 'ESRCH'});
  editRun(repo, run.runId, saved => { saved.pid = gone.pid; });
  cleanup(repo, run);
  assert.equal(fs.existsSync(run.worktree.path), false);
});

test('cleanup marks a missing worktree as residual without pruning Git registration', async t => {
  const repo = makeRepo(t);
  const run = await start(t, repo);
  const {path: worktree} = run.worktree;
  fs.rmSync(worktree, {recursive: true});
  const result = cleanup(repo, run, false, 3, 'cleanup_partial');
  assert.deepEqual(result.residualPaths, [worktree]);
  assert.match(git(repo.cwd, 'worktree', 'list', '--porcelain'), new RegExp(run.runId + '/wt'));
  assert.equal(readJson(runFile(repo, run.runId)).cleanup.state, 'partial');
});

test('cleanup records partial state and skips removed items on re-call', async t => {
  const repo = makeRepo(t);
  const run = await start(t, repo);
  const {path: worktree} = run.worktree;
  const noHooks = path.join(path.dirname(worktree), 'no-hooks');
  const blocker = path.join(noHooks, 'do-not-remove');
  fs.writeFileSync(blocker, 'keep');
  const first = cleanup(repo, run, false, 3, 'cleanup_partial');
  assert.ok(first.removed.includes(worktree));
  assert.ok(first.residualPaths.includes(noHooks));
  assert.deepEqual(readJson(runFile(repo, run.runId)).cleanup, {
    state: 'partial', removed: first.removed, residualPaths: first.residualPaths
  });
  assert.equal(fs.readFileSync(blocker, 'utf8'), 'keep');
  fs.unlinkSync(blocker);
  const second = cleanup(repo, run);
  assert.deepEqual(second.residualPaths, []);
  assert.equal(fs.existsSync(path.dirname(worktree)), false);
  assert.ok(fs.existsSync(runFile(repo, run.runId, 'result.json')));
});

test('cleanup by cacheKey renames record to record.removed.json and keeps history', async t => {
  const repo = makeRepo(t);
  const run = await start(t, repo);
  const directory = path.join(repo.store, 'cache', run.cacheKey);
  const record = path.join(directory, 'record.json');
  const history = path.join(directory, 'history.jsonl');
  const oldHistory = fs.readFileSync(history);
  const oldRecord = fs.readFileSync(record);
  const input = {cacheKey: run.cacheKey, dryRun: true};
  const dryRun = verifyCli(repo, 'cleanup', input, 0);
  assert.deepEqual(dryRun.targets, [{kind: 'cache-record', path: record}]);
  assert.deepEqual(fs.readFileSync(record), oldRecord);
  const result = verifyCli(repo, 'cleanup', {...input, dryRun: false}, 0);
  assert.deepEqual(result.removed, [record]);
  assert.deepEqual(fs.readFileSync(path.join(directory, 'record.removed.json')), oldRecord);
  assert.deepEqual(fs.readFileSync(history), oldHistory);
  assert.equal(fs.existsSync(record), false);
  assert.ok(fs.existsSync(run.worktree.path));
});

test('cleanup leaves source checkout, user worktree and an external symlink target unchanged', async t => {
  const repo = makeRepo(t);
  const userTree = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'arc-verify-user-')));
  t.after(() => fs.rmSync(userTree, {recursive: true, force: true}));
  git(repo.cwd, 'worktree', 'add', '--detach', userTree, repo.revision);
  fs.writeFileSync(path.join(userTree, 'personal.txt'), 'preserve');
  const run = await start(t, repo);
  fs.symlinkSync(userTree, path.join(run.worktree.path, 'external'), 'dir');
  const registration = git(repo.cwd, 'worktree', 'list', '--porcelain').split('\n\n').find(entry =>
    entry.split('\n')[0] === 'worktree ' + userTree);
  const before = sourceSnapshot(repo.cwd);
  cleanup(repo, run);
  assertSourceUnchanged(repo.cwd, before);
  assert.equal(fs.readFileSync(path.join(userTree, 'personal.txt'), 'utf8'), 'preserve');
  assert.ok(git(repo.cwd, 'worktree', 'list', '--porcelain').includes(registration));
});

for (const [name, createNested, dryRun] of [
  ['nested registered worktree holds nested_worktree and deletes nothing', (repo, nested) =>
    git(repo.cwd, 'worktree', 'add', '--detach', nested, repo.revision), false],
  ['nested registered worktree with alternate casing holds without a .git marker', (repo, nested) => {
    const uppercase = path.join(path.dirname(path.dirname(nested)), 'WT');
    const registered = fs.existsSync(uppercase) ? path.join(uppercase, path.basename(nested)) : nested;
    git(repo.cwd, 'worktree', 'add', '--detach', '--lock', registered, repo.revision);
    fs.unlinkSync(path.join(nested, '.git'));
    assert.ok(git(repo.cwd, 'worktree', 'list', '--porcelain').includes('worktree ' + registered + '\n'));
  }, false],
  ['nested foreign .git holds nested_worktree', (_repo, nested) => {
    fs.mkdirSync(nested);
    git(nested, 'init', '-q');
  }, false],
  ['nested Git directory with filesystem-matched casing holds nested_worktree', (_repo, nested) => {
    fs.mkdirSync(nested);
    git(nested, 'init', '-q');
    const marker = path.join(nested, '.git');
    const alternate = path.join(nested, '.GIT');
    if (fs.existsSync(alternate)) {
      const renamed = path.join(nested, 'git-marker');
      fs.renameSync(marker, renamed);
      fs.renameSync(renamed, alternate);
      assert.ok(fs.readdirSync(nested).includes('.GIT'));
    }
    assert.equal(git(nested, 'rev-parse', '--show-toplevel'), nested);
  }, false],
  ['dryRun reports nestedPaths', (_repo, nested) => {
    fs.mkdirSync(nested);
    fs.writeFileSync(path.join(nested, '.git'), 'gitdir: elsewhere\n');
  }, true],
  ['nested bare repository holds nested_worktree', (_repo, nested) => {
    fs.mkdirSync(nested);
    git(nested, 'init', '-q', '--bare');
  }, false]
]) {
  test('cleanup ' + name, async t => {
    const repo = makeRepo(t);
    const run = await start(t, repo);
    const nested = path.join(run.worktree.path, 'nested with space');
    createNested(repo, nested);
    const keeping = path.join(run.worktree.path, 'ordinary.txt');
    fs.writeFileSync(keeping, 'keep');
    const registered = git(repo.cwd, 'worktree', 'list', '--porcelain');
    const result = cleanup(repo, run, dryRun, 3, 'nested_worktree');
    assert.deepEqual(result.nestedPaths, [nested]);
    assert.equal(git(repo.cwd, 'worktree', 'list', '--porcelain'), registered);
    assert.equal(fs.readFileSync(keeping, 'utf8'), 'keep');
    assert.ok(fs.existsSync(nested));
  });
}

test('cleanup nested check reruns after unlock before remove', async t => {
  const repo = makeRepo(t);
  const run = await start(t, repo);
  const worktree = run.worktree.path;
  const nested = path.join(worktree, 'new-bare');
  const actualGit = cleanEnv.PATH.split(path.delimiter).map(directory => path.join(directory, 'git')).find(filename =>
    fs.existsSync(filename));
  const shimDir = path.join(repo.common, 'git-shim');
  fs.mkdirSync(shimDir);
  fs.writeFileSync(path.join(shimDir, 'git'), `#!${process.execPath}
    const {spawnSync} = require('node:child_process');
    const fs = require('node:fs');
    const actual = ${JSON.stringify(actualGit)};
    const args = process.argv.slice(2);
    const call = spawnSync(actual, args, {stdio: 'inherit', shell: false});
    if (call.status !== 0) process.exit(call.status ?? 1);
    if (args.includes('unlock')) {
      const nested = ${JSON.stringify(nested)};
      fs.mkdirSync(nested);
      process.exitCode = spawnSync(actual, ['init', '-q', '--bare', nested], {stdio: 'inherit', shell: false}).status;
    }
  `, {mode: 0o700});
  const env = {...cleanEnv, PATH: shimDir + path.delimiter + cleanEnv.PATH};
  const result = cleanup(repo, run, false, 3, 'nested_worktree', env);
  assert.deepEqual(result.nestedPaths, [nested]);
  assert.ok(fs.existsSync(path.join(nested, 'HEAD')));
  assert.ok(fs.existsSync(path.join(worktree, 'tracked.txt')));
  assert.match(git(repo.cwd, 'worktree', 'list', '--porcelain'), new RegExp('locked arc-verify:' + run.runId));
  fs.rmSync(nested, {recursive: true});
  cleanup(repo, run);
});

test('cleanup holds cleanup_unsafe_path for a symlink in the tool path', async t => {
  const repo = makeRepo(t);
  const run = await start(t, repo);
  const worktree = run.worktree.path;
  const moved = path.join(repo.common, 'moved-worktree');
  fs.renameSync(worktree, moved);
  fs.symlinkSync(moved, worktree, 'dir');
  const registered = git(repo.cwd, 'worktree', 'list', '--porcelain');
  for (const dryRun of [true, false]) cleanup(repo, run, dryRun, 3, 'cleanup_unsafe_path');
  assert.equal(git(repo.cwd, 'worktree', 'list', '--porcelain'), registered);
  assert.ok(fs.lstatSync(worktree).isSymbolicLink());
  assert.equal(fs.readFileSync(path.join(moved, 'tracked.txt'), 'utf8'), 'tracked\n');
});

test('cleanup holds cleanup_unsafe_path for a tool directory with a mode other than 0700', async t => {
  const repo = makeRepo(t);
  const temp = path.join(repo.common, 'temp');
  fs.mkdirSync(temp, {mode: 0o700});
  const env = {...cleanEnv, TMPDIR: temp};
  const run = verifyCli(repo, 'start', repo.input, 0, 'ok', env);
  const worktree = run.worktree.path;
  const registered = git(repo.cwd, 'worktree', 'list', '--porcelain');
  for (let directory = worktree; directory !== temp; directory = path.dirname(directory)) {
    assert.equal(fs.lstatSync(directory).mode & 0o7777, 0o700, directory);
    fs.chmodSync(directory, 0o755);
    try {
      for (const dryRun of [true, false]) cleanup(repo, run, dryRun, 3, 'cleanup_unsafe_path', env);
      assert.equal(git(repo.cwd, 'worktree', 'list', '--porcelain'), registered);
      assert.ok(fs.existsSync(path.join(worktree, 'tracked.txt')));
    } finally {
      fs.chmodSync(directory, 0o700);
    }
  }
});

test('cleanup holds cleanup_unsafe_path for a writable ancestor without sticky bit', async t => {
  const repo = makeRepo(t);
  const ancestor = path.join(repo.common, 'shared');
  const temp = path.join(ancestor, 'temp');
  fs.mkdirSync(ancestor, {mode: 0o700});
  fs.mkdirSync(temp, {mode: 0o700});
  const env = {...cleanEnv, TMPDIR: temp};
  const run = verifyCli(repo, 'start', repo.input, 0, 'ok', env);
  fs.chmodSync(ancestor, 0o777);
  const registered = git(repo.cwd, 'worktree', 'list', '--porcelain');
  for (const dryRun of [true, false]) {
    const result = cleanup(repo, run, dryRun, 3, 'cleanup_unsafe_path', env);
    assert.equal(result.path, ancestor);
  }
  assert.equal(git(repo.cwd, 'worktree', 'list', '--porcelain'), registered);
  assert.ok(fs.existsSync(path.join(run.worktree.path, 'tracked.txt')));
});

test('cleanup allows a writable ancestor with sticky bit', async t => {
  const repo = makeRepo(t);
  const temp = path.join(repo.common, 'sticky-temp');
  fs.mkdirSync(temp, {mode: 0o700});
  fs.chmodSync(temp, 0o1777);
  const env = {...cleanEnv, TMPDIR: temp};
  const run = verifyCli(repo, 'start', repo.input, 0, 'ok', env);
  assert.deepEqual(cleanup(repo, run, true, 0, 'ok', env).targets, cleanupTarget(run));
  assert.ok(cleanup(repo, run, false, 0, 'ok', env).removed.includes(run.worktree.path));
});

test('cleanup holds cleanup_unsafe_path for an ancestor owned by another user', async t => {
  const repo = makeRepo(t);
  const run = await start(t, repo);
  const root = path.parse(run.worktree.path).root;
  const registered = git(repo.cwd, 'worktree', 'list', '--porcelain');
  const lstat = (filename, options) => {
    const stat = fs.lstatSync(filename, options);
    if (filename === root) stat.uid = process.geteuid() + 1;
    return stat;
  };
  for (const dryRun of [true, false]) {
    const result = await verifyCleanup({cwd: repo.cwd, input: {runId: run.runId, dryRun}, env: cleanEnv}, {lstat});
    assert.deepEqual([result.decision, result.code, result.path], ['hold', 'cleanup_unsafe_path', root]);
  }
  assert.equal(git(repo.cwd, 'worktree', 'list', '--porcelain'), registered);
  assert.ok(fs.existsSync(path.join(run.worktree.path, 'tracked.txt')));
});
