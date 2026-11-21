import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp, realpath, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  assignTestIds, buildReport, compareRuns, normalizeTestFile, parseJunitXml,
  parseRegex, parseTap, summarizeCommand, validateRegexSpec
} from '../../lib/runtime/test-results.mjs';

const ctx = {worktree: '/WT', fileExists: file => ['a.test.mjs', 'b.test.mjs', 'c.test.mjs'].includes(file)};
const passingXml = '<testsuite><testcase name="works"/></testsuite>';
const failingXml = '<testsuite><testcase name="breaks"><failure/></testcase></testsuite>';
const regexResults = {
  format: 'regex',
  stream: 'both',
  pattern: '^(?<status>\\w+) (?<file>[^ ]+) (?<suite>[^ ]+) (?<name>[^ ]+)(?: (?<duration>\\d+))?',
  statusMap: {pass: ['OK'], fail: ['FAIL'], skip: ['SKIP'], fileError: ['LOAD']}
};

// Node v22.18.0 shape, with the Step 0 load-failure excerpt and shortened diagnostics.
const NODE22_TAP_FIXTURE = `TAP version 13
# Subtest: passes
ok 1 - passes
  ---
  duration_ms: 0.5
  type: 'test'
  ...
# Subtest: breaks
not ok 2 - breaks
  ---
  duration_ms: 2.25
  type: 'test'
  location: '/WT/a.test.mjs:4:1'
  failureType: 'testCodeFailure'
  ...
# Subtest: outer
    # Subtest: inner
    ok 1 - inner
      ---
      duration_ms: 0.3
      type: 'test'
      ...
    1..1
ok 3 - outer
  ---
  duration_ms: 0.8
  type: 'suite'
  ...
# Subtest: b.test.mjs
not ok 4 - b.test.mjs
  ---
  duration_ms: 22.339
  type: 'test'
  location: '/WT/b.test.mjs:1:1'
  failureType: 'testCodeFailure'
  ...
# Subtest: passes
ok 5 - passes
1..5
`;

test('junit-xml parses nested suites, entities, CDATA and classifies failure/error/skipped', () => {
  const result = parseJunitXml(`
    <?xml version="1.0"?> <!-- comment --> <?report keep="no"?>
    <testsuites><testsuite name="outer" file="/WT/a.test.mjs"><testsuite name="inner">
      <testcase classname="Class" name="&lt;&amp;&#65;&#x42;&gt;&quot;&apos;" time=".125"/>
      <testcase name="failure"><failure><![CDATA[<not-a-tag>&]]></failure></testcase>
      <testcase name="error"><error message="bad"/></testcase>
      <testcase name="skipped"><skipped/></testcase>
    </testsuite></testsuite></testsuites>`.trim(), ctx);
  assert.deepEqual(result.incomplete, []);
  assert.deepEqual(result.tests.map(({testId, status, durationMs}) => [testId, status, durationMs]), [
    ['a.test.mjs::outer/inner/Class::<&AB>"\'#1', 'passed', 125],
    ['a.test.mjs::outer/inner::failure#1', 'failed', null],
    ['a.test.mjs::outer/inner::error#1', 'failed', null],
    ['a.test.mjs::outer/inner::skipped#1', 'skipped', null]
  ]);
});

test('junit-xml rejects DOCTYPE as parse_error', () => {
  const text = '<!DOCTYPE testsuite [<!ENTITY e SYSTEM "file:///data">]><testsuite/>';
  assert.deepEqual(parseJunitXml(text, ctx).incomplete, [{scope: 'command', reason: 'parse_error'}]);
  assert.deepEqual(parseJunitXml('<testsuite><testcase name="unclosed"></testsuite>', ctx).incomplete,
    [{scope: 'command', reason: 'parse_error'}]);
});

test("junit-xml file precedence testcase@file > testsuite@file > path-like testsuite@name > '-'", () => {
  const text = `<testsuites>
    <testsuite name="a.test.mjs" file="/WT/b.test.mjs"><testsuite name="inner">
      <testcase name="explicit" file="file:///WT/c.test.mjs"/><testcase name="inherited"/>
    </testsuite></testsuite>
    <testsuite name="a.test.mjs"><testcase name="inferred"/></testsuite>
    <testsuite name="missing.test.mjs"><testcase name="unknown"/></testsuite>
  </testsuites>`;
  assert.deepEqual(parseJunitXml(text, ctx).tests.map(item => item.file),
    ['c.test.mjs', 'b.test.mjs', 'a.test.mjs', '-']);
});

test('junit-xml testsuite with errors and no testcase marks file_error', () => {
  const text = `<testsuites><testsuite file="a.test.mjs" errors="1"/>
    <testsuite name="b.test.mjs"><error>load failed</error></testsuite>
    <testsuite file="c.test.mjs" errors="1"><testsuite><testcase name="error"><error/></testcase></testsuite></testsuite>
  </testsuites>`;
  assert.deepEqual(parseJunitXml(text, ctx).incomplete, [
    {scope: 'file', path: 'a.test.mjs', reason: 'file_error'},
    {scope: 'file', path: 'b.test.mjs', reason: 'file_error'}
  ]);
});

test('tap parses node subtests with YAML location and duration_ms', () => {
  const {tests} = parseTap(NODE22_TAP_FIXTURE, ctx);
  assert.deepEqual(tests.map(({testId, durationMs}) => [testId, durationMs]), [
    ['-::::passes#1', 0.5],
    ['a.test.mjs::::breaks#1', 2.25],
    ['-::outer::inner#1', 0.3],
    ['-::::passes#2', null]
  ]);
  const wrapped = `TAP version 14
# Subtest: a.test.mjs
    ok 1 - one
    1..1
ok 1 - a.test.mjs
1..1`;
  assert.equal(parseTap(wrapped, ctx).tests[0].testId, 'a.test.mjs::::one#1');
});

async function runReporter(t, sources) {
  const dir = await mkdtemp(join(tmpdir(), 'arc-node-reporter-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const worktree = await realpath(dir);
  const files = Object.keys(sources);
  await Promise.all(files.map(file => writeFile(join(worktree, file), sources[file])));
  const env = {...process.env};
  delete env.ARC_BRIDGE_CHILD;
  delete env.NODE_TEST_CONTEXT;
  const reporter = fileURLToPath(new URL('../../lib/runtime/node-test-reporter.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [
    '--test', `--test-reporter=${reporter}`, '--test-reporter-destination=stdout', ...files
  ], {cwd: worktree, env, encoding: 'utf8', shell: false});
  assert.ifError(result.error);
  assert.equal(result.status, 1, result.stderr);
  return {text: result.stdout, ctx: {worktree, fileExists: file => existsSync(join(worktree, file))}};
}

test('arc node reporter gives every test its file', async t => {
  const {text, ctx: local} = await runReporter(t, {
    'a.test.mjs': `import {test, describe} from 'node:test';
      test('passes', () => {});
      test('fails', () => { throw new Error('failed'); });
      test.skip('skipped', () => {});
      test.todo('todo', () => { throw new Error('pending'); });
      describe('outer', () => {
        test('inner', () => {});
        describe('nested', () => { test('deep', () => {}); });
      });`,
    'b.test.mjs': "throw new Error('load failed');",
    'c.test.mjs': `import {test} from 'node:test';
      test('passes', () => {});
      test.skip('skipped', () => {});
      test.todo('todo');`
  });
  const result = parseJunitXml(text, local);
  assert.deepEqual(result.incomplete, [{scope: 'file', path: 'b.test.mjs', reason: 'file_error'}], text);
  assert.deepEqual(Object.fromEntries(result.tests.map(({testId, status}) => [testId, status])), {
    'a.test.mjs::::passes#1': 'passed',
    'a.test.mjs::::fails#1': 'failed',
    'a.test.mjs::::skipped#1': 'skipped',
    'a.test.mjs::::todo#1': 'skipped',
    'a.test.mjs::outer::inner#1': 'passed',
    'a.test.mjs::outer/nested::deep#1': 'passed',
    'c.test.mjs::::passes#1': 'passed',
    'c.test.mjs::::skipped#1': 'skipped',
    'c.test.mjs::::todo#1': 'skipped'
  });
  assert.ok(result.tests.every(({durationMs}) => Number.isFinite(durationMs)));
  assert.match(text, /<skipped message="todo"\/>/);
});

test('arc node reporter escapes XML special characters in names and messages', async t => {
  const name = `case <&"' >`;
  const message = `message <&"' >`;
  const {text, ctx: local} = await runReporter(t, {
    'a.test.mjs': `import {test} from 'node:test';
      test(${JSON.stringify(name)}, () => { throw new Error(${JSON.stringify(message)}); });`
  });
  const result = parseJunitXml(text, local);
  assert.deepEqual(result.incomplete, [], text);
  assert.deepEqual(result.tests.map(({name, status}) => [name, status]), [[name, 'failed']]);
  const attribute = text.match(/<failure message="([^"]*)"/)?.[1];
  assert.ok(attribute, text);
  const restored = parseJunitXml(`<testsuite><testcase name="${attribute}"/></testsuite>`, local);
  assert.equal(restored.tests[0].name, message);
});

test('arc node reporter records a parent test body failure separately from subtest failures', async t => {
  const {text, ctx: local} = await runReporter(t, {
    'a.test.mjs': "import {test} from 'node:test';\n" +
      "test('parent', async t => {\n" +
      "  await t.test('child', () => {});\n" +
      "  throw new Error('parent assertion');\n" +
      "});\n" +
      "test('aggregate', async t => {\n" +
      "  await t.test('child', () => { throw new Error('child assertion'); });\n" +
      "});\n"
  });
  const result = parseJunitXml(text, local);
  assert.deepEqual(result.incomplete, [], text);
  assert.deepEqual(Object.fromEntries(result.tests.map(({testId, status}) => [testId, status])), {
    'a.test.mjs::::parent#1': 'failed',
    'a.test.mjs::parent::child#1': 'passed',
    'a.test.mjs::aggregate::child#1': 'failed'
  });
  assert.match(text, /<failure message="parent assertion"\/>/);
});

test('tap load failure without subtests marks file incomplete file_error', () => {
  assert.deepEqual(parseTap(NODE22_TAP_FIXTURE, ctx).incomplete,
    [{scope: 'file', path: 'b.test.mjs', reason: 'file_error'}]);
  assert.deepEqual(parseTap('not ok 1 - b.test.mjs\n1..1', ctx).incomplete,
    [{scope: 'file', path: 'b.test.mjs', reason: 'file_error'}]);
});

test('tap nested failed leaf whose description is a worktree file marks file_error', () => {
  const text = [
    '# Subtest: outer',
    '    not ok 1 - a.test.mjs',
    '    not ok 2 - missing.test.mjs',
    '    1..2',
    'not ok 1 - outer',
    '1..1'
  ].join('\n');
  const {tests, incomplete} = parseTap(text, ctx);
  assert.deepEqual(incomplete, [{scope: 'file', path: 'a.test.mjs', reason: 'file_error'}]);
  assert.deepEqual(tests.map(({testId, status}) => [testId, status]),
    [['-::outer::missing.test.mjs#1', 'failed']]);
});

test('tap TODO not ok is not failed and SKIP is skipped', () => {
  const text = 'not ok 1 - pending # TODO later\nok 2 - absent # SKIP unsupported\n1..2';
  assert.deepEqual(parseTap(text, ctx).tests.map(({name, status}) => [name, status]),
    [['pending', 'skipped'], ['absent', 'skipped']]);
});

test('tap Bail out and plan mismatch mark command incomplete', () => {
  for (const text of ['Bail out! fatal', '1..2\nok 1 - only',
    '# Subtest: parent\n    ok 1 - one\n    1..2\nok 1 - parent\n1..1']) {
    assert.deepEqual(parseTap(text, ctx).incomplete, [{scope: 'command', reason: 'parse_error'}]);
  }
});

test('regex maps statusMap, fileError and counts unmapped', () => {
  const result = parseRegex(
    'OK a.test.mjs s one 12\nFAIL a.test.mjs s two\nSKIP a.test.mjs s three\nLOAD b.test.mjs s load\nUNKNOWN - s four\nOTHER - s five',
    ctx, regexResults
  );
  assert.deepEqual(result.tests.map(({testId, status, durationMs}) => [testId, status, durationMs]), [
    ['a.test.mjs::s::one#1', 'passed', 12],
    ['a.test.mjs::s::two#1', 'failed', null],
    ['a.test.mjs::s::three#1', 'skipped', null]
  ]);
  assert.deepEqual(result.incomplete, [{scope: 'file', path: 'b.test.mjs', reason: 'file_error'}]);
  assert.equal(result.unmappedStatusCount, 2);
});

test('regex requires named groups status and name', () => {
  for (const pattern of ['(?<status>OK)', '(?<name>leaf)', '[(?<status>](?<name>leaf)', '[']) {
    assert.throws(() => validateRegexSpec({...regexResults, pattern}), {code: 'invalid_request'});
  }
  assert.doesNotThrow(() => validateRegexSpec(regexResults));
});

test('strips worktree realpath and file:// prefixes', () => {
  assert.equal(normalizeTestFile('file:///WT/sub/a%20b.mjs', '/WT'), 'sub/a b.mjs');
  assert.equal(normalizeTestFile('/WT/sub/./a.mjs', '/WT'), 'sub/a.mjs');
  assert.equal(normalizeTestFile('sub\\a.mjs', '/WT'), 'sub/a.mjs');
  assert.equal(normalizeTestFile('/WT-other/a.mjs', '/WT'), '-');
  assert.equal(normalizeTestFile('../outside.mjs', '/WT'), '-');
  assert.equal(normalizeTestFile(null, '/WT'), '-');
});

test('duplicate names get #k in order', () => {
  const first = {file: 'a.test.mjs', suite: 's', name: 'same', status: 'passed', durationMs: 0};
  assert.deepEqual(assignTestIds([first, {...first, file: 'b.test.mjs'}, first]).map(({testId, k}) => [testId, k]), [
    ['a.test.mjs::s::same#1', 1], ['b.test.mjs::s::same#1', 1], ['a.test.mjs::s::same#2', 2]
  ]);
});

function summarize(overrides = {}) {
  return summarizeCommand({
    format: 'junit-xml', results: {stream: 'stdout'}, streams: {stdout: passingXml, stderr: ''},
    resultFiles: null, exit: {code: 0, signal: null, timedOut: false}, truncated: false, ctx, ...overrides
  });
}

test('none passes on exit 0 and fails otherwise', () => {
  const opts = {format: 'none', truncated: true};
  assert.equal(summarize(opts).status, 'pass');
  for (const exit of [{code: 1}, {code: null, signal: 'SIGTERM'}, {code: 0, timedOut: true}]) {
    const summary = summarize({...opts, exit});
    assert.equal(summary.status, 'fail');
    assert.deepEqual(summary.incomplete, []);
  }
});

test('nonzero exit without parsed failures is unattributed', () => {
  for (const exit of [{code: 1}, {code: null, signal: 'SIGTERM'}, {code: 0, timedOut: true}]) {
    assert.deepEqual(summarize({exit}).incomplete, [{scope: 'command', reason: 'unattributed'}]);
  }
});

test('zero results is no_results', () => {
  const parsed = summarize({streams: {stdout: '<testsuite/>'}});
  assert.deepEqual(parsed.incomplete, [{scope: 'command', reason: 'no_results'}]);
});

test('missing result file is results_missing', () => {
  const result = summarize({results: {path: '*.xml'}, resultFiles: []});
  assert.ok(result.incomplete.some(item => item.scope === 'command' && item.reason === 'results_missing'));
});

test('truncated output is output_truncated', () => {
  assert.deepEqual(summarize({truncated: true}).incomplete, [{scope: 'command', reason: 'output_truncated'}]);
});

test('exit 0 with failures is recorded as is', () => {
  const result = summarize({streams: {stdout: failingXml}});
  assert.deepEqual(result.incomplete, []);
  assert.deepEqual(result.counts, {total: 1, passed: 0, failed: 1, skipped: 0});
});

test('summary uses the selected stream and numbers duplicate results across files', () => {
  const fromStderr = summarize({results: {stream: 'stderr'}, streams: {stdout: passingXml, stderr: failingXml}});
  assert.equal(fromStderr.tests[0].name, 'breaks');
  const fromFiles = summarize({results: {path: '*.xml'}, resultFiles: [
    {path: '1.xml', text: passingXml}, {path: '2.xml', text: passingXml}
  ]});
  assert.deepEqual(fromFiles.tests.map(item => item.testId), ['-::::works#1', '-::::works#2']);
  const regex = summarize({format: 'regex', results: regexResults,
    streams: {stdout: 'OK a.test.mjs s one', stderr: 'FAIL a.test.mjs s two'}});
  assert.deepEqual(regex.counts, {total: 2, passed: 1, failed: 1, skipped: 0});
});

function row(name, status, file = 'a.test.mjs', durationMs = null) {
  return {testId: `${file}::::${name}#1`, file, suite: '', name, k: 1, status, durationMs};
}

function command(tests = [], {id = 'unit', format = 'tap', expandedFiles = [], incomplete = [], status} = {}) {
  return {id, format, expandedFiles, summary: {tests, incomplete, status, exitCode: 0, wallMs: 20}};
}

const run = (...commands) => ({commands});
const fileError = path => ({scope: 'file', path, reason: 'file_error'});
const commandError = reason => ({scope: 'command', reason});

test('compare classifies new, reproduced, not reproduced, candidates, disappeared, added, file diffs', () => {
  const base = run(command([
    row('new', 'skipped'), row('same', 'failed'), row('fixed', 'failed'), row('gone', 'passed'),
    row('unknown', 'failed', 'b.test.mjs'), row('omitted', 'passed', 'c.test.mjs')
  ], {expandedFiles: ['a.test.mjs', 'old.test.mjs'], incomplete: [fileError('b.test.mjs')]}));
  const head = run(command([
    row('new', 'failed'), row('same', 'failed'), row('fixed', 'passed'), row('added', 'passed'),
    row('unknown', 'failed', 'b.test.mjs'), row('fresh failure', 'failed')
  ], {expandedFiles: ['a.test.mjs', 'new.test.mjs'], incomplete: [fileError('c.test.mjs')]}));
  const result = compareRuns({base, head});
  const ids = key => result[key].map(item => item.testId);
  assert.deepEqual(ids('newFailures'), ['a.test.mjs::::new#1', 'a.test.mjs::::fresh failure#1']);
  assert.deepEqual(ids('baselineReproduced'), ['a.test.mjs::::same#1']);
  assert.deepEqual(ids('baselineNotReproduced'), ['a.test.mjs::::fixed#1']);
  assert.deepEqual(ids('newFailureCandidates'), [null, 'b.test.mjs::::unknown#1']);
  assert.deepEqual(ids('disappearedTests'), ['a.test.mjs::::gone#1']);
  assert.deepEqual(ids('addedTests'), ['a.test.mjs::::added#1', 'a.test.mjs::::fresh failure#1']);
  assert.deepEqual(result.addedFiles, [{commandId: 'unit', path: 'new.test.mjs'}]);
  assert.deepEqual(result.removedFiles, [{commandId: 'unit', path: 'old.test.mjs'}]);
});

test('failure in base-incomplete file is a candidate, never baseline', () => {
  const failure = row('repeat', 'failed');
  for (const incomplete of [fileError('a.test.mjs'), commandError('parse_error')]) {
    const result = compareRuns({
      base: run(command([failure], {incomplete: [incomplete]})), head: run(command([failure]))
    });
    assert.deepEqual(result.newFailureCandidates,
      [{commandId: 'unit', testId: 'a.test.mjs::::repeat#1', reason: incomplete.reason}]);
    assert.deepEqual(result.baselineReproduced, []);
  }
});

test('compare retains head incomplete and a named failure in the same base-incomplete file', () => {
  const incomplete = [fileError('a.test.mjs')];
  const base = run(command([], {incomplete}));
  const head = run(command([row('named', 'failed')], {incomplete}));
  const result = compareRuns({base, head});
  assert.deepEqual(result.newFailureCandidates, [
    {commandId: 'unit', testId: null, reason: 'file_error'},
    {commandId: 'unit', testId: 'a.test.mjs::::named#1', reason: 'file_error'}
  ]);
  assert.deepEqual(result.newFailures, []);
  assert.deepEqual(result.baselineReproduced, []);
  assert.equal(result.verdict, 'candidates');
});

test('none command failing in head is a command candidate even if base failed', () => {
  const none = run(command([], {format: 'none', status: 'fail'}));
  const result = compareRuns({base: none, head: none});
  assert.deepEqual(result.newFailureCandidates.map(({commandId, testId}) => [commandId, testId]), [['unit', null]]);
});

test('verdict precedence new-failures > candidates > no-new-failures', () => {
  const base = run(command());
  const headError = {incomplete: [fileError('b.test.mjs')]};
  assert.equal(compareRuns({base, head: run(command([row('new', 'failed')], headError))}).verdict, 'new-failures');
  assert.equal(compareRuns({base, head: run(command([], headError))}).verdict, 'candidates');
  assert.equal(compareRuns({base, head: base}).verdict, 'no-new-failures');
});

test('intermittent from history mismatch and from rerun pass keeps original classification', () => {
  const base = run(command([row('one', 'passed'), row('two', 'failed')]));
  const head = run(command([row('one', 'failed'), row('two', 'failed')]));
  const one = 'a.test.mjs::::one#1';
  const two = 'a.test.mjs::::two#1';
  const history = [
    {runId: 'r1', loadClass: 'quiet', commands: [command([row('two', 'passed')])]},
    {runId: 'r2', loadClass: 'busy', commands: [command([row('two', 'failed')])]}
  ];
  const attempts = [{attempt: 1, status: 'passed'}, {attempt: 2, status: 'failed'}];
  const result = compareRuns({base, head, history, reruns: [{commandId: 'unit', testId: one, attempts}]});
  assert.deepEqual(result.newFailures.map(item => item.testId), [one]);
  assert.deepEqual(result.baselineReproduced.map(item => item.testId), [two]);
  assert.deepEqual(result.intermittentCandidates.find(item => item.testId === one), {
    commandId: 'unit', testId: one, history: [], reruns: attempts, passesInIsolation: 'yes'
  });
  assert.deepEqual(result.intermittentCandidates.find(item => item.testId === two), {
    commandId: 'unit', testId: two, history: [
      {runId: 'r1', loadClass: 'quiet', status: 'passed'}, {runId: 'r2', loadClass: 'busy', status: 'failed'}
    ], reruns: [], passesInIsolation: 'no'
  });
});

function makeReport() {
  const base = {runId: 'base', commit: 'c1', tree: 't1', load: {}, cacheHit: true, reusedFrom: 'earlier',
    ...run(command([row('prior', 'passed', 'a.test.mjs', 1000)]))};
  const head = {runId: 'head', commit: 'c2', tree: 't2', load: {}, cacheHit: false,
    ...run(command([
      row('one', 'passed', 'a.test.mjs', 5), row('two', 'passed', 'a.test.mjs', 6),
      row('three', 'passed', 'b.test.mjs', 10), row('four', 'passed', 'c.test.mjs', 1)
    ], {expandedFiles: ['a.test.mjs', 'b.test.mjs', 'c.test.mjs']}))};
  const conditions = {machineId: 'machine', os: 'test-os', node: 'v22.18.0', sandboxMode: 'workspace-write',
    hostPlatform: 'codex', executionEnvironment: 'codex-cli', tmpdir: {realpath: '/tmp', fsType: 'local'},
    envNames: ['PATH'], prepareDigest: 'p', seedDigest: 's'};
  const phases = [{name: 'prepare-1', ms: 2}, {name: 'prepare-2', ms: 9}, {name: 'prepare-3', ms: 4}];
  return buildReport({base, head, comparison: compareRuns({base, head}), conditions, phases, topN: 2,
    generatedAt: '2026-11-21T00:00:00Z'});
}

test('report json has every §9.6 field and slowest topN', () => {
  const {json} = makeReport();
  assert.deepEqual(Object.keys(json).sort(), [
    'schemaVersion', 'base', 'head', 'conditions', 'commands', 'newFailures', 'baselineReproduced',
    'baselineNotReproduced', 'newFailureCandidates', 'intermittentCandidates', 'disappearedTests',
    'addedTests', 'addedFiles', 'removedFiles', 'slowest', 'verdict', 'generatedAt'
  ].sort());
  assert.equal(json.schemaVersion, 1);
  assert.deepEqual(json.base, {runId: 'base', commit: 'c1', tree: 't1', load: {}, cacheHit: true, reusedFrom: 'earlier'});
  assert.equal(json.conditions.tmpdir.realpath, '/tmp');
  assert.equal(json.commands[0].head.wallMs, 20);
  assert.deepEqual(json.commands[0].head.tests, {total: 4, passed: 4, failed: 0, skipped: 0});
  assert.deepEqual(json.commands[0].head.expandedFiles, ['a.test.mjs', 'b.test.mjs', 'c.test.mjs']);
  assert.deepEqual(json.slowest.files.map(({file, durationMs}) => [file, durationMs]),
    [['a.test.mjs', 11], ['b.test.mjs', 10]]);
  assert.deepEqual(json.slowest.tests.map(({testId}) => testId), ['b.test.mjs::::three#1', 'a.test.mjs::::two#1']);
  assert.deepEqual(json.slowest.phases.map(({name}) => name), ['prepare-2', 'prepare-3']);
});

test('report md sections follow §9.6 order', () => {
  const {md} = makeReport();
  assert.deepEqual([...md.matchAll(/^## (.+)$/gm)].map(match => match[1]), [
    '기록 조건', '명령별 합계 및 실행 시간', '새 실패', '기준선 재현', '기준선 미재현',
    '간헐 후보', 'incomplete 및 none 후보', '사라진 테스트 및 새 테스트', '느린 상위 2개'
  ]);
});
