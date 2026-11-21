import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {
  VERIFY_COMMANDS, canonicalJson, sha256Hex, expandGlob, buildChildEnv, classifyLoad,
  validateVerifyInput, verifyStart, verifyStatus
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
      return entry.isDirectory() ? files(file) : [[path.relative(cwd, file), fs.readFileSync(file)]];
    });
  }
  return {
    head: git(cwd, 'rev-parse', 'HEAD'), refs: git(cwd, 'show-ref'),
    index: fs.readFileSync(path.join(cwd, '.git/index')), files: files(cwd)
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
  t.after(() => {
    try {
      assertSourceUnchanged(cwd, snapshot);
    } finally {
      fs.rmSync(worktrees, {recursive: true, force: true});
      fs.rmSync(root, {recursive: true, force: true});
    }
  });
  return {cwd, common, store, first, revision, input: startInput(revision), snapshot: () => { snapshot = sourceSnapshot(cwd); }};
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

test('future paths return a not implemented hold', t => {
  const repo = makeRepo(t);
  const runId = '20261121T000000Z-00000000';
  for (const [command, input] of [
    ['verify-start', {...repo.input, detach: true}],
    ['verify-start', {...repo.input, role: 'head', snapshotWorkingTree: true}],
    ['verify-compare', {baseRunId: runId, headRunId: runId}],
    ['verify-rerun', {runId, testId: 'test', attempt: 1, sandboxMode: 'none'}],
    ['verify-cleanup', {runId, dryRun: true}],
  ]) {
    const [exit, output] = runCli(command, repo.cwd, input);
    assert.deepEqual([exit, output.decision, output.code, output.message], [3, 'hold', 'verify_error', 'not implemented']);
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
