import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {renameSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import zlib from 'node:zlib';
import {DEFAULT_POLICY, CODEX_DELEGATION_CALL_NAMES} from '../../lib/runtime/role-dispatch-policy.mjs';
import {grokConfigSecurityProjection} from '../../lib/runtime/grok-sandbox.mjs';
import * as roleObserve from '../../lib/runtime/role-observe.mjs';
import {
  createLineParser, normalizeClaudeStreamEvent, normalizeCodexStreamEvent, eventRecord, matchModel, evaluateClaudeInit,
  readClaudeTranscriptEffort, readCodexTurnContext, evaluateCodexContext, classifyFailure, snapshotWorktree, detectViolations,
  snapshotControlFiles, allowedPathsCoverControl
} from '../../lib/runtime/role-observe.mjs';

const FIXTURES = new URL('./fixtures/role-bridge/', import.meta.url).pathname;
const fixtureLines = async name => (await fs.readFile(path.join(FIXTURES, name), 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line));
const tempDir = async t => {
  const dir = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'arc-observe-'));
  t.after(async () => { spawnSync('chmod', ['-R', 'u+rwx', dir]); await fs.rm(dir, {recursive: true, force: true}); });
  return dir;
};
const git = (cwd, ...args) => {
  const env = {...process.env, HOME: path.dirname(cwd), GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1'};
  const r = spawnSync('git', args, {cwd, env, encoding: 'utf8'});
  if (r.status !== 0) throw Error(r.stderr);
  return r.stdout;
};
const makeRepo = async t => {
  const dir = path.join(await tempDir(t), 'repo');
  await fs.mkdir(dir);
  git(dir, 'init', '-q'); git(dir, 'config', 'user.email', 't@example.com'); git(dir, 'config', 'user.name', 't');
  await fs.mkdir(path.join(dir, 'src')); await fs.mkdir(path.join(dir, 'docs'));
  await fs.writeFile(path.join(dir, 'src/a.txt'), 'a\n'); await fs.writeFile(path.join(dir, 'docs/b.txt'), 'b\n'); await fs.writeFile(path.join(dir, 'dirty.txt'), 'clean\n');
  git(dir, 'add', '.'); git(dir, 'commit', '-q', '-m', 'init');
  await fs.writeFile(path.join(dir, 'dirty.txt'), 'pre-existing local edit\n'); await fs.writeFile(path.join(dir, 'untracked-before.txt'), 'u\n');
  return dir;
};

test('fixture git uses a temporary HOME and disables global and system config', async t => {
  const dir = await makeRepo(t);
  const env = git(dir, '-c', 'alias.fixture-env=!printf "%s\\n" "$HOME" "$GIT_CONFIG_GLOBAL" "$GIT_CONFIG_NOSYSTEM"', 'fixture-env');
  assert.deepEqual(env.trimEnd().split('\n'), [path.dirname(dir), '/dev/null', '1']);
});

test('line parser joins split chunks, ignores non-JSON and flags lines over 1 MiB', () => {
  const seen = [];
  const parser = createLineParser(value => seen.push(value));
  const line = JSON.stringify({type: 'x', text: 'héllo'});
  const bytes = Buffer.from(line + '\n');
  parser.push(bytes.subarray(0, 7)); parser.push(bytes.subarray(7, 20)); parser.push(bytes.subarray(20));
  parser.push(Buffer.from('not json at all\n{"type":"y"}\n[1,2]\n"str"\n\n'));
  parser.push(Buffer.from('{"type":"tail"}'));
  assert.deepEqual(seen, [{type: 'x', text: 'héllo'}, {type: 'y'}]);
  parser.end();
  assert.deepEqual(seen.at(-1), {type: 'tail'});
  assert.equal(parser.overflow, false);
  assert.ok(parser.ignored >= 3);

  const big = [], p2 = createLineParser(value => big.push(value), {maxLineBytes: 1048576});
  const chunk = Buffer.alloc(300000, 'a');
  p2.push(Buffer.from('{"type":"before"}\n')); p2.push(Buffer.from('{"k":"')); for (let i = 0; i < 5; i++) p2.push(chunk); p2.push(Buffer.from('"}\n{"type":"after"}\n'));
  p2.end();
  assert.deepEqual(big, [{type: 'before'}, {type: 'after'}]);
  assert.equal(p2.overflow, true);
  const p3 = createLineParser(() => {}, {maxLineBytes: 10}); p3.push(Buffer.alloc(50, 'b')); p3.end();
  assert.equal(p3.overflow, true);
});

test('Claude init/result normalize from fixtures; eventRecord drops result text', async () => {
  const [init] = await fixtureLines('claude-init.jsonl'), [result] = await fixtureLines('claude-result.jsonl');
  const n = normalizeClaudeStreamEvent(init);
  assert.deepEqual(n, {kind: 'init', sessionId: init.session_id, model: 'claude-haiku-5-5', tools: ['Bash'], permissionMode: 'default'});
  const r = normalizeClaudeStreamEvent(result);
  assert.equal(r.kind, 'result'); assert.equal(r.isError, false); assert.equal(r.resultText, 'G1 DONE'); assert.equal(r.sessionId, init.session_id);
  assert.equal(normalizeClaudeStreamEvent({...result, is_error: true}).isError, true);
  assert.equal(normalizeClaudeStreamEvent({type: 'assistant', message: {}}).kind, 'other');
  assert.equal(normalizeClaudeStreamEvent(null), null);
  assert.equal(normalizeClaudeStreamEvent('text'), null);
  const record = eventRecord(r);
  assert.ok(!('resultText' in record) && !JSON.stringify(record).includes('G1 DONE'));
  assert.equal(record.kind, 'result');
  assert.ok(!('message' in eventRecord({kind: 'warning', message: 'secret text'})));
});

test('Codex thread/turn events normalize and type=error warning items are warnings', async () => {
  const events = (await fixtureLines('codex-exec.jsonl')).map(normalizeCodexStreamEvent);
  assert.deepEqual(events[0], {kind: 'thread', threadId: '01a1c596-43f9-77a0-b0bb-3cfcdd195652'});
  assert.equal(events[1].kind, 'warning'); assert.match(events[1].message, /Under-development features/);
  assert.equal(events[2].kind, 'other');
  assert.equal(events.at(-1).kind, 'turn_completed');
  assert.equal(events.filter(e => e.kind === 'turn_completed').length, 1);
  const failed = normalizeCodexStreamEvent({type: 'turn.failed', error: {message: 'boom'}});
  assert.deepEqual(failed, {kind: 'turn_failed', message: 'boom'});
  assert.equal(normalizeCodexStreamEvent({type: 'error', message: 'stream warn'}).kind, 'warning');
  assert.equal(normalizeCodexStreamEvent([]), null);
  assert.ok(!('message' in eventRecord(events[1])));
  assert.equal(eventRecord(events[0]).threadId, '01a1c596-43f9-77a0-b0bb-3cfcdd195652');
});

test('matchModel follows D6', () => {
  assert.equal(matchModel('haiku', 'claude-haiku-5-5'), true);
  assert.equal(matchModel('opus', 'claude-sonnet-5'), false);
  assert.equal(matchModel('claude-haiku-5-5', 'claude-haiku-5-5'), true);
  assert.equal(matchModel('gpt-5.5', 'gpt-5.5-mini'), false);
  assert.equal(matchModel('haiku', 'claude-haikux-5'), false);
  assert.equal(matchModel('haiku', undefined), false);
});

test('evaluateClaudeInit detects extra tool, mcp__ tool, wrong permissionMode and model mismatch', () => {
  const expected = {tools: ['Read', 'Grep'], permissionMode: 'default', model: 'haiku'};
  const init = {kind: 'init', sessionId: 's1', model: 'claude-haiku-5-5', tools: ['Grep', 'Read'], permissionMode: 'default'};
  const ok = evaluateClaudeInit({init, expected});
  assert.equal(ok.reason, null);
  assert.equal(ok.claims.identity.level, 'runtime-observed');
  assert.equal(ok.claims.model.level, 'runtime-observed'); assert.equal(ok.claims.model.observed, 'claude-haiku-5-5');
  assert.equal(ok.claims.permissions.level, 'runtime-observed');
  for (const bad of [{tools: ['Read', 'Grep', 'Bash']}, {tools: ['Read', 'Grep', 'mcp__srv__tool']}, {tools: ['Read']}, {permissionMode: 'acceptEdits'}]) {
    const r = evaluateClaudeInit({init: {...init, ...bad}, expected});
    assert.equal(r.reason, 'permission_scope_mismatch', JSON.stringify(bad));
    assert.notEqual(r.claims.permissions.level, 'runtime-observed');
  }
  const wrongModel = evaluateClaudeInit({init: {...init, model: 'claude-sonnet-5'}, expected});
  assert.equal(wrongModel.reason, 'model_effort_mismatch');
  assert.notEqual(wrongModel.claims.model.level, 'runtime-observed');
  assert.equal(wrongModel.claims.permissions.level, 'runtime-observed');
  assert.equal(evaluateClaudeInit({init: null, expected}).reason, null);
});

test('transcript effort read returns value or null when absent', async t => {
  const claudeHome = await tempDir(t), sessionId = '334250eb-1ecc-4091-b027-c4dd43ccc2fe';
  assert.equal(await readClaudeTranscriptEffort({claudeHome, sessionId}), null);
  const dir = path.join(claudeHome, 'projects', '-work-repo'); await fs.mkdir(dir, {recursive: true});
  await fs.copyFile(path.join(FIXTURES, 'claude-transcript.jsonl'), path.join(dir, `${sessionId}.jsonl`));
  assert.equal(await readClaudeTranscriptEffort({claudeHome, sessionId}), 'low');
  await fs.writeFile(path.join(dir, 'other.jsonl'), '{"effort":"high"}\n');
  assert.equal(await readClaudeTranscriptEffort({claudeHome, sessionId: 'other'}), 'high');
  await fs.writeFile(path.join(dir, 'noeffort.jsonl'), 'garbage\n{"type":"user"}\n');
  assert.equal(await readClaudeTranscriptEffort({claudeHome, sessionId: 'noeffort'}), null);
  assert.equal(await readClaudeTranscriptEffort({claudeHome, sessionId: '../escape'}), null);
});

const placeRollout = async (codexHome, threadId, fixture, depth = 3) => {
  const dir = path.join(codexHome, 'sessions', ...['2026', '11', '10', 'x', 'y'].slice(0, depth)); await fs.mkdir(dir, {recursive: true});
  await fs.copyFile(path.join(FIXTURES, fixture), path.join(dir, `rollout-2026-11-10T13-12-01-${threadId}.jsonl`));
};

test('rollout turn_context yields model, effort, sandbox and approval; spawn function_call sets delegationObserved', async t => {
  const codexHome = await tempDir(t), plain = '01a1c596-43f9-77a0-b0bb-3cfcdd195652', spawn = '01a1c595-429a-7d62-99b9-846844484cfd';
  assert.equal(await readCodexTurnContext({codexHome, threadId: plain, delegationNames: CODEX_DELEGATION_CALL_NAMES}), null);
  await placeRollout(codexHome, plain, 'codex-rollout.jsonl'); await placeRollout(codexHome, spawn, 'codex-rollout-spawn.jsonl');
  assert.deepEqual(await readCodexTurnContext({codexHome, threadId: plain, delegationNames: CODEX_DELEGATION_CALL_NAMES}),
    {model: 'gpt-6-luna', effort: 'low', sandboxMode: 'workspace-write', approvalPolicy: 'never', delegationObserved: false,
      turns: Array(2).fill({model: 'gpt-6-luna', effort: 'low', sandboxMode: 'workspace-write', approvalPolicy: 'never'})});
  const s = await readCodexTurnContext({codexHome, threadId: spawn, delegationNames: CODEX_DELEGATION_CALL_NAMES});
  assert.equal(s.delegationObserved, true); assert.equal(s.model, 'gpt-6-luna');
  assert.equal((await readCodexTurnContext({codexHome, threadId: spawn, delegationNames: ['other_call']})).delegationObserved, false);
  const deep = await tempDir(t); await placeRollout(deep, plain, 'codex-rollout.jsonl', 5);
  assert.equal(await readCodexTurnContext({codexHome: deep, threadId: plain, delegationNames: []}), null);
});

test('evaluateCodexContext caps permissions at operator-attested when G3 failed and records wide writable root when G5 is wide', () => {
  const expected = {model: 'gpt-6-luna', effort: 'low', sandboxMode: 'workspace-write', approvalPolicy: 'never'};
  const context = {model: 'gpt-6-luna', effort: 'low', sandboxMode: 'workspace-write', approvalPolicy: 'never', delegationObserved: false};
  const wide = evaluateCodexContext({context, expected, policy: DEFAULT_POLICY});
  assert.equal(wide.reason, null);
  assert.equal(wide.claims.model.level, 'runtime-observed'); assert.equal(wide.claims.effort.level, 'runtime-observed');
  assert.equal(wide.claims.permissions.level, 'operator-attested', 'user config (MCP) is not controlled, so permissions never reach runtime-observed');
  assert.match(String(wide.claims.permissions.details), /user-config-mcp-not-controlled/);
  assert.match(String(wide.claims.permissions.details), /writable-root-wider-than-worktree/);
  const g3 = evaluateCodexContext({context, expected, policy: {...DEFAULT_POLICY, gates: {...DEFAULT_POLICY.gates, G3: 'fail', G5: 'narrow'}}});
  assert.equal(g3.claims.permissions.level, 'operator-attested');
  assert.ok(!String(g3.claims.permissions.details).includes('writable-root-wider-than-worktree'));
  assert.equal(evaluateCodexContext({context: {...context, delegationObserved: true}, expected, policy: DEFAULT_POLICY}).reason, 'delegation_observed');
  assert.equal(evaluateCodexContext({context: {...context, sandboxMode: 'danger-full-access'}, expected, policy: DEFAULT_POLICY}).reason, 'permission_scope_mismatch');
  assert.equal(evaluateCodexContext({context: {...context, approvalPolicy: 'on-request'}, expected, policy: DEFAULT_POLICY}).reason, 'permission_scope_mismatch');
  assert.equal(evaluateCodexContext({context: {...context, model: 'gpt-6-luna-mini'}, expected, policy: DEFAULT_POLICY}).reason, 'model_effort_mismatch');
  const effort = evaluateCodexContext({context: {...context, effort: 'high'}, expected, policy: DEFAULT_POLICY});
  assert.equal(effort.reason, 'model_effort_mismatch'); assert.notEqual(effort.claims.effort.level, 'runtime-observed');
  assert.equal(evaluateCodexContext({context: null, expected, policy: DEFAULT_POLICY}).reason, null);
  assert.equal(evaluateCodexContext({context: null, expected, policy: DEFAULT_POLICY}).claims.model.level, 'unverified');
});

test('classifyFailure distinguishes auth, model, effort, missing terminal and unclassified', () => {
  const base = {exitCode: 1, signal: null, terminal: true, messages: []};
  assert.equal(classifyFailure({...base, messages: ['HTTP 401 Unauthorized']}), 'auth_rejected');
  assert.equal(classifyFailure({...base, messages: ['Not logged in']}), 'auth_rejected');
  assert.equal(classifyFailure({...base, messages: ['The model gpt-x does not exist']}), 'model_rejected');
  assert.equal(classifyFailure({...base, messages: ['model foo is not supported']}), 'model_rejected');
  assert.equal(classifyFailure({...base, messages: ['reasoning effort is not supported']}), 'effort_rejected');
  assert.equal(classifyFailure({...base, messages: ['effort level invalid']}), 'effort_rejected');
  assert.equal(classifyFailure({...base, terminal: false}), 'invalid_output');
  assert.equal(classifyFailure({exitCode: 0, signal: null, terminal: false, messages: []}), 'invalid_output');
  assert.equal(classifyFailure({...base, messages: ['something odd']}), 'execution_failed');
  assert.equal(classifyFailure({exitCode: null, signal: 'SIGSEGV', terminal: true, messages: []}), 'execution_failed');
  assert.equal(classifyFailure({...base, messages: ['author of unauthorizedness']}), 'execution_failed');
});

test('detectViolations on a repo with pre-existing dirty and untracked files', async t => {
  const dir = await makeRepo(t);
  const run = async (role, allowedPaths, change) => {
    const before = await snapshotWorktree(dir);
    await change();
    return detectViolations({role, allowedPaths, before, after: await snapshotWorktree(dir)});
  };
  const snap = await snapshotWorktree(dir);
  assert.match(snap.head, /^[a-f0-9]{40}$/); assert.ok(snap.branch);
  assert.ok(snap.entries.has('dirty.txt') && snap.entries.has('untracked-before.txt'));
  assert.match(snap.entries.get('dirty.txt'), /^ M:[a-f0-9]{64}$/);
  assert.match(snap.entries.get('untracked-before.txt'), /^\?\?:[a-f0-9]{64}$/);

  // Review Focus 3: pre-existing dirty files untouched by a read-only role are not violations
  assert.deepEqual(await run('arc_reviewer', undefined, async () => {}), {reason: null, changedPaths: [], headChanged: false, refsChanged: false, controlChanged: []});
  // read-only role edits a tracked file, an already-dirty file, or creates a file
  for (const change of [() => fs.writeFile(path.join(dir, 'src/a.txt'), 'changed\n'), () => fs.writeFile(path.join(dir, 'dirty.txt'), 'edited again\n'), () => fs.writeFile(path.join(dir, 'new.txt'), 'n\n'), () => fs.rm(path.join(dir, 'untracked-before.txt'))]) {
    const result = await run('arc_scouter', undefined, change);
    assert.equal(result.reason, 'permission_violation_observed'); assert.equal(result.changedPaths.length, 1);
  }
  git(dir, 'checkout', '--', 'src/a.txt');
  // Implementer inside allowedPaths (file entry and directory prefix)
  assert.equal((await run('arc_implementer', ['src/'], () => fs.writeFile(path.join(dir, 'src/a.txt'), 'impl\n'))).reason, null);
  assert.equal((await run('arc_implementer', ['src/a.txt', 'src/new.txt'], () => fs.writeFile(path.join(dir, 'src/new.txt'), 'x\n'))).reason, null);
  // Implementer outside allowedPaths, untracked outside, and a sibling prefix that is not a directory match
  const outside = await run('arc_implementer', ['src/'], () => fs.writeFile(path.join(dir, 'docs/b.txt'), 'out\n'));
  assert.equal(outside.reason, 'permission_violation_observed'); assert.deepEqual(outside.changedPaths, ['docs/b.txt']);
  assert.equal((await run('arc_implementer', ['src/'], () => fs.writeFile(path.join(dir, 'untracked-new.txt'), 'x'))).reason, 'permission_violation_observed');
  assert.equal((await run('arc_implementer', ['src/'], () => fs.writeFile(path.join(dir, 'srcx.txt'), 'x'))).reason, 'permission_violation_observed');
  // QA with empty or missing allowedPaths: any change is a violation
  assert.equal((await run('arc_qa', [], () => fs.writeFile(path.join(dir, 'qa.txt'), 'x'))).reason, 'permission_violation_observed');
  assert.equal((await run('arc_qa', undefined, () => fs.writeFile(path.join(dir, 'qa2.txt'), 'x'))).reason, 'permission_violation_observed');
  assert.equal((await run('arc_qa', [], async () => {})).reason, null);
  // HEAD change
  const committed = await run('arc_implementer', ['src/', 'docs/', 'dirty.txt', 'qa.txt', 'qa2.txt', 'new.txt', 'untracked-new.txt', 'srcx.txt', 'untracked-before.txt'], async () => { git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'role commit'); });
  assert.equal(committed.headChanged, true); assert.equal(committed.reason, 'permission_violation_observed');
  const branched = await run('arc_reviewer', undefined, async () => { git(dir, 'checkout', '-q', '-b', 'other'); });
  assert.equal(branched.headChanged, true); assert.equal(branched.reason, 'permission_violation_observed');
});

test('snapshot and violations use the worktree root when given a subdirectory (Review Focus 5)', async t => {
  const dir = await makeRepo(t), sub = path.join(dir, 'src');
  const rootSnap = await snapshotWorktree(dir), subSnap = await snapshotWorktree(sub);
  assert.deepEqual([...subSnap.entries], [...rootSnap.entries]); assert.equal(subSnap.head, rootSnap.head);
  await fs.writeFile(path.join(dir, 'docs/b.txt'), 'changed outside the subdirectory\n');
  const after = await snapshotWorktree(sub);
  const result = detectViolations({role: 'arc_reviewer', allowedPaths: undefined, before: subSnap, after});
  assert.deepEqual(result.changedPaths, ['docs/b.txt']);
});

test('snapshotWorktree handles deleted, renamed and space-containing paths without throwing', async t => {
  const dir = await makeRepo(t);
  await fs.rm(path.join(dir, 'docs/b.txt')); await fs.writeFile(path.join(dir, 'with space.txt'), 'x');
  git(dir, 'mv', 'src/a.txt', 'src/renamed.txt');
  const snap = await snapshotWorktree(dir);
  assert.ok(snap.entries.has('with space.txt'));
  assert.match(snap.entries.get('docs/b.txt'), /^ D:/);
  assert.ok([...snap.entries.keys()].some(k => k === 'src/renamed.txt'));
});

const CLAUDE_EXPECTED = {tools: ['Read'], permissionMode: 'default', model: 'haiku'};
const CODEX_EXPECTED = {model: 'gpt-6-luna', effort: 'low', sandboxMode: 'read-only', approvalPolicy: 'never'};
const turn = (extra = {}) => ({model: 'gpt-6-luna', effort: 'low', sandboxMode: 'read-only', approvalPolicy: 'never', ...extra});
const codexContext = (extra = {}, turns = [turn(extra)]) => ({...turns.at(-1), delegationObserved: false, turns, ...extra});
const G3PASS = {...DEFAULT_POLICY, gates: {...DEFAULT_POLICY.gates, G3: 'pass'}};

test('F-1 missing observed values are unverified, not mismatches', () => {
  const claude = evaluateClaudeInit({init: {kind: 'init', sessionId: 's', tools: ['Read'], permissionMode: 'default'}, expected: CLAUDE_EXPECTED});
  assert.equal(claude.reason, null); assert.equal(claude.claims.model.level, 'unverified');
  assert.equal(claude.claims.identity.level, 'runtime-observed'); assert.equal(claude.claims.permissions.level, 'runtime-observed');
  assert.equal(evaluateClaudeInit({init: {kind: 'init', sessionId: 's', tools: ['Read'], permissionMode: 'default', model: 'claude-sonnet-5'}, expected: CLAUDE_EXPECTED}).reason, 'model_effort_mismatch');
  for (const missing of [{effort: null}, {model: null}]) {
    const r = evaluateCodexContext({context: codexContext(missing), expected: CODEX_EXPECTED, policy: G3PASS});
    assert.equal(r.reason, null, JSON.stringify(missing));
    assert.equal(r.claims[Object.keys(missing)[0]].level, 'unverified');
  }
  assert.equal(evaluateCodexContext({context: codexContext({effort: 'high'}), expected: CODEX_EXPECTED, policy: G3PASS}).reason, 'model_effort_mismatch');
});

test('F-2 Codex permissions stay operator-attested at G3 pass or not (user config is never controlled; M3 supersedes the G3 lift)', () => {
  for (const [g3, level] of [['pass', 'operator-attested'], ['fail', 'operator-attested'], ['pending', 'operator-attested'], [undefined, 'operator-attested'], ['', 'operator-attested']]) {
    const r = evaluateCodexContext({context: codexContext(), expected: CODEX_EXPECTED, policy: {...DEFAULT_POLICY, gates: {...DEFAULT_POLICY.gates, G3: g3}}});
    assert.equal(r.claims.permissions.level, level, String(g3));
  }
  const noDetect = evaluateCodexContext({context: codexContext({delegationObserved: true}), expected: CODEX_EXPECTED, policy: {...DEFAULT_POLICY, gates: {...DEFAULT_POLICY.gates, G3: 'pending'}}});
  assert.equal(noDetect.reason, null);
});

test('F-3 every turn_context must match the request', async t => {
  const wrong = evaluateCodexContext({context: codexContext({}, [turn({sandboxMode: 'workspace-write'}), turn()]), expected: CODEX_EXPECTED, policy: G3PASS});
  assert.equal(wrong.reason, 'permission_scope_mismatch'); assert.notEqual(wrong.claims.permissions.level, 'runtime-observed');
  assert.equal(evaluateCodexContext({context: codexContext({}, [turn(), turn({approvalPolicy: 'on-request'})]), expected: CODEX_EXPECTED, policy: G3PASS}).reason, 'permission_scope_mismatch');
  assert.equal(evaluateCodexContext({context: codexContext({}, [turn({model: 'other'}), turn()]), expected: CODEX_EXPECTED, policy: G3PASS}).reason, 'model_effort_mismatch');
  assert.equal(evaluateCodexContext({context: codexContext({}, [turn({effort: 'high'}), turn()]), expected: CODEX_EXPECTED, policy: G3PASS}).reason, 'model_effort_mismatch');
  const partial = evaluateCodexContext({context: codexContext({}, [turn({effort: null}), turn()]), expected: CODEX_EXPECTED, policy: G3PASS});
  assert.equal(partial.reason, null); assert.equal(partial.claims.effort.level, 'unverified');
  assert.equal(evaluateCodexContext({context: codexContext({}, [turn(), turn()]), expected: CODEX_EXPECTED, policy: G3PASS}).reason, null);
  const codexHome = await tempDir(t), id = 'aaaa1111-2222-3333-4444-555566667777', dir = path.join(codexHome, 'sessions/2026/11/10'); await fs.mkdir(dir, {recursive: true});
  const ctx = (sandbox, extra = {}) => JSON.stringify({type: 'turn_context', payload: {model: 'gpt-6-luna', effort: 'low', approval_policy: 'never', sandbox_policy: {type: sandbox}, ...extra}});
  await fs.writeFile(path.join(dir, `rollout-x-${id}.jsonl`), [ctx('workspace-write'), ctx('read-only')].join('\n') + '\n');
  const read = await readCodexTurnContext({codexHome, threadId: id, delegationNames: []});
  assert.deepEqual(read.turns.map(item => item.sandboxMode), ['workspace-write', 'read-only']);
  assert.equal(evaluateCodexContext({context: read, expected: CODEX_EXPECTED, policy: G3PASS}).reason, 'permission_scope_mismatch');
});

test('F-4 classifyFailure returns null for successful termination and scopes message input', () => {
  assert.equal(classifyFailure({exitCode: 0, signal: null, terminal: true, messages: ['I reviewed the authentication flow']}), null);
  assert.equal(classifyFailure({exitCode: 0, signal: null, terminal: true, terminalError: true, messages: ['401 unauthorized']}), 'auth_rejected');
  assert.equal(classifyFailure({exitCode: 0, signal: null, terminal: true, terminalError: true, messages: []}), 'execution_failed');
  assert.equal(classifyFailure({exitCode: 1, signal: null, terminal: true, messages: []}), 'execution_failed');
  assert.equal(classifyFailure({exitCode: 0, signal: null, terminal: false, messages: []}), 'invalid_output');
  assert.equal(classifyFailure({exitCode: 0, signal: 'SIGTERM', terminal: true, messages: []}), 'execution_failed');
});

test('F-5 rollout file must end with -<threadId>.jsonl and be unique', async t => {
  const codexHome = await tempDir(t), full = 'bbbb1111-2222-3333-4444-555566667777', dir = path.join(codexHome, 'sessions/2026/11/10'); await fs.mkdir(dir, {recursive: true});
  const line = JSON.stringify({type: 'turn_context', payload: {model: 'm', effort: 'low', approval_policy: 'never', sandbox_policy: {type: 'read-only'}}}) + '\n';
  await fs.writeFile(path.join(dir, `rollout-a-${full}.jsonl`), line);
  assert.ok(await readCodexTurnContext({codexHome, threadId: full, delegationNames: []}));
  assert.equal(await readCodexTurnContext({codexHome, threadId: 'bbbb1111', delegationNames: []}), null);
  assert.equal(await readCodexTurnContext({codexHome, threadId: '555566667777', delegationNames: []}), null);
  assert.equal(await readCodexTurnContext({codexHome, threadId: full.slice(0, -1), delegationNames: []}), null);
  await fs.mkdir(path.join(codexHome, 'sessions/2026/11/11'), {recursive: true});
  await fs.writeFile(path.join(codexHome, 'sessions/2026/11/11', `rollout-b-${full}.jsonl`), line);
  assert.equal(await readCodexTurnContext({codexHome, threadId: full, delegationNames: []}), null);
});

test('F-7 compressed .jsonl.zst rollouts are read like plain ones; corrupt, unsupported or ambiguous give null', async t => {
  const id = '01a1c596-43f9-77a0-b0bb-3cfcdd195652', plainHome = await tempDir(t), zstHome = await tempDir(t);
  const place = async (home, name, bytes) => { const dir = path.join(home, 'sessions/2026/11/10'); await fs.mkdir(dir, {recursive: true}); await fs.writeFile(path.join(dir, name), bytes); };
  const source = await fs.readFile(path.join(FIXTURES, 'codex-rollout.jsonl'));
  await place(plainHome, `rollout-x-${id}.jsonl`, source);
  await place(zstHome, `rollout-x-${id}.jsonl.zst`, zlib.zstdCompressSync(source));
  const plain = await readCodexTurnContext({codexHome: plainHome, threadId: id, delegationNames: CODEX_DELEGATION_CALL_NAMES});
  assert.ok(plain);
  assert.deepEqual(await readCodexTurnContext({codexHome: zstHome, threadId: id, delegationNames: CODEX_DELEGATION_CALL_NAMES}), plain);
  const spawnId = '01a1c595-429a-7d62-99b9-846844484cfd';
  await place(zstHome, `rollout-y-${spawnId}.jsonl.zst`, zlib.zstdCompressSync(await fs.readFile(path.join(FIXTURES, 'codex-rollout-spawn.jsonl'))));
  assert.equal((await readCodexTurnContext({codexHome: zstHome, threadId: spawnId, delegationNames: CODEX_DELEGATION_CALL_NAMES})).delegationObserved, true);
  // both forms present -> ambiguous
  await place(zstHome, `rollout-z-${id}.jsonl`, source);
  assert.equal(await readCodexTurnContext({codexHome: zstHome, threadId: id, delegationNames: []}), null);
  // corrupt
  const corrupt = await tempDir(t); await place(corrupt, `rollout-x-${id}.jsonl.zst`, Buffer.from('not zstd data'));
  assert.equal(await readCodexTurnContext({codexHome: corrupt, threadId: id, delegationNames: []}), null);
  // zstd unsupported (injected) and decompressed size over the cap
  assert.equal(await readCodexTurnContext({codexHome: zstHome, threadId: spawnId, delegationNames: [], zstdDecompress: null}), null);
  assert.equal(await readCodexTurnContext({codexHome: zstHome, threadId: spawnId, delegationNames: [], zstdDecompress: () => Buffer.alloc(64 * 1024 * 1024 + 1)}), null);
  assert.equal(await readCodexTurnContext({codexHome: zstHome, threadId: spawnId, delegationNames: [], zstdDecompress: () => { throw Error('boom'); }}), null);
  // plain files are unaffected by missing zstd support
  assert.ok(await readCodexTurnContext({codexHome: plainHome, threadId: id, delegationNames: [], zstdDecompress: null}));
});

test('Codex permissions claim never reaches runtime-observed even when G3 passes and every observed setting matches', () => {
  const expected = {model: 'gpt-6-luna', effort: 'low', sandboxMode: 'read-only', approvalPolicy: 'never'};
  const context = {model: 'gpt-6-luna', effort: 'low', sandboxMode: 'read-only', approvalPolicy: 'never', delegationObserved: false};
  const ok = evaluateCodexContext({context, expected, policy: DEFAULT_POLICY});
  assert.equal(ok.claims.permissions.level, 'operator-attested');
  assert.match(ok.claims.permissions.details, /user-config-mcp-not-controlled/);
  const mismatch = evaluateCodexContext({context: {...context, sandboxMode: 'workspace-write'}, expected, policy: DEFAULT_POLICY});
  assert.equal(mismatch.claims.permissions.level, 'unverified');
});

test('matchModel accepts only catalog short aliases for the alias rule', () => {
  for (const alias of ['opus', 'sonnet', 'haiku', 'fable']) assert.equal(matchModel(alias, `claude-${alias}-5-5`), true, alias);
  assert.equal(matchModel('claude', 'claude-haiku-5-5'), false, 'a vendor prefix is not a catalog alias');
  assert.equal(matchModel('five', 'claude-haiku-5-five'), false);
  assert.equal(matchModel('gpt', 'gpt-6-luna'), false);
  assert.equal(matchModel('latest', 'claude-haiku-latest'), false);
});

test('the policy alias list equals the short model names of the Claude catalog', async () => {
  const {CATALOG_MODEL_ALIASES} = await import('../../lib/runtime/role-dispatch-policy.mjs');
  const catalog = JSON.parse(await fs.readFile(new URL('../../lib/models/claude-models.json', import.meta.url), 'utf8'));
  const shortNames = [...new Set(catalog.pairs.map(pair => pair.model).filter(model => /^[a-z]+$/.test(model)))].sort();
  assert.deepEqual([...CATALOG_MODEL_ALIASES].sort(), shortNames);
});

test('snapshotWorktree records refs and detectViolations treats ref creation, deletion and movement as violations for every role', async t => {
  const dir = await makeRepo(t);
  const gitHere = (...args) => git(dir, ...args);
  const check = async (role, allowedPaths, change) => {
    const before = await snapshotWorktree(dir);
    await change();
    return detectViolations({role, allowedPaths, before, after: await snapshotWorktree(dir)});
  };
  const snap = await snapshotWorktree(dir);
  assert.ok(Object.keys(snap.refs).some(name => name.startsWith('refs/heads/')));
  assert.deepEqual(await check('arc_reviewer', undefined, async () => {}), {reason: null, changedPaths: [], headChanged: false, refsChanged: false, controlChanged: []});
  const branch = await check('arc_implementer', ['src/'], async () => gitHere('branch', 'side'));
  assert.equal(branch.refsChanged, true); assert.equal(branch.reason, 'permission_violation_observed'); assert.equal(branch.headChanged, false);
  const tag = await check('arc_implementer', ['src/'], async () => gitHere('tag', 'v1'));
  assert.equal(tag.refsChanged, true); assert.equal(tag.reason, 'permission_violation_observed');
  const removed = await check('arc_qa', ['src/'], async () => gitHere('branch', '-D', 'side'));
  assert.equal(removed.refsChanged, true);
  gitHere('branch', 'mover');
  const moved = await check('arc_planner', undefined, async () => gitHere('branch', '-f', 'mover', 'HEAD'));
  assert.equal(moved.refsChanged, false, 'a ref set to the same object is unchanged');
  gitHere('commit', '-q', '--allow-empty', '-m', 'next');
  const forced = await check('arc_planner', undefined, async () => gitHere('branch', '-f', 'mover', 'HEAD'));
  assert.equal(forced.refsChanged, true);
});

const controlTarget = dir => ({gitCommonDir: path.join(dir, '.git'), gitDir: path.join(dir, '.git'), worktree: dir});
const controlChange = async (target, change, {role = 'arc_implementer', allowedPaths = ['src/a.js']} = {}) => {
  const snapshot = async () => ({
    ...await snapshotWorktree(target.worktree),
    control: await snapshotControlFiles(target),
  });
  const before = await snapshot();
  await change();
  return detectViolations({role, allowedPaths, before, after: await snapshot()});
};
const assertControlViolation = (result, label) => {
  assert.deepEqual(result.controlChanged, [label]);
  assert.equal(result.reason, 'permission_violation_observed');
};

test('control snapshot labels hook add, modify and delete; config; info/exclude; config.worktree', async t => {
  const dir = await makeRepo(t), target = controlTarget(dir);
  git(dir, 'config', 'extensions.worktreeConfig', 'true');
  const hook = path.join(target.gitCommonDir, 'hooks/pre-commit');
  for (const change of [() => fs.writeFile(hook, 'first'), () => fs.writeFile(hook, 'second'), () => fs.unlink(hook)]) {
    assertControlViolation(await controlChange(target, change), 'git:hooks/pre-commit');
  }
  assertControlViolation(await controlChange(target, () => git(dir, 'config', 'core.filemode', 'false')), 'git:config');
  assertControlViolation(await controlChange(target, () => fs.appendFile(path.join(target.gitCommonDir, 'info/exclude'), '\nignored.txt\n')), 'git:info/exclude');
  assertControlViolation(await controlChange(target, () => git(dir, 'config', '--worktree', 'core.filemode', 'true')), 'git:config.worktree');
});

test('git-ignored .claude/settings.local.json creation is a control violation with no changedPaths', async t => {
  const dir = await makeRepo(t);
  await fs.writeFile(path.join(dir, '.gitignore'), '.claude/settings.local.json\n');
  await fs.mkdir(path.join(dir, '.claude'));
  const result = await controlChange(controlTarget(dir), () => fs.writeFile(path.join(dir, '.claude/settings.local.json'), '{}'));
  assert.deepEqual(result.changedPaths, []);
  assertControlViolation(result, 'worktree:.claude/settings.local.json');
});

test('.codex/config.toml creation is labelled worktree:.codex/config.toml', async t => {
  const dir = await makeRepo(t);
  await fs.mkdir(path.join(dir, '.codex'));
  const result = await controlChange(controlTarget(dir), () => fs.writeFile(path.join(dir, '.codex/config.toml'), 'model = "a"\n'));
  assertControlViolation(result, 'worktree:.codex/config.toml');
});

test('extra entries are compared under their label', async t => {
  const dir = await makeRepo(t), home = await tempDir(t);
  const config = path.join(home, 'config.toml'), entry = {label: 'grok-home:config.toml', path: config};
  await fs.writeFile(config, 'first');
  const target = {...controlTarget(dir), extra: [entry]};
  assertControlViolation(await controlChange(target, () => fs.writeFile(config, 'second')), 'grok-home:config.toml');
  const projected = {...target, extra: [{...entry, project: () => 'same'}]};
  const result = await controlChange(projected, async () => {
    await fs.writeFile(path.join(home, 'new.toml'), 'third');
    await fs.rename(path.join(home, 'new.toml'), config);
  });
  assert.deepEqual(result.controlChanged, []);
  assert.equal(result.reason, null);
});

test('extra entry whose parent directory is a symlink is recorded without reading through it', async t => {
  const dir = await makeRepo(t), home = await tempDir(t), outside = await tempDir(t);
  const parent = path.join(home, '.grok'), config = path.join(parent, 'config.toml');
  const label = 'grok-home:config.toml', bytes = 'permission_mode = "ask"\n';
  await fs.mkdir(parent);
  await fs.writeFile(config, bytes);
  await fs.writeFile(path.join(outside, 'config.toml'), bytes);
  const target = {...controlTarget(dir), extra: [{label, path: config, project: grokConfigSecurityProjection}]};
  const before = await snapshotControlFiles(target);
  await fs.rename(parent, path.join(home, 'original'));
  await fs.symlink(outside, parent);
  const after = await snapshotControlFiles(target);

  assert.match(before.get(label), /^[a-f0-9]{64}$/);
  assert.equal(after.get(label), `parent-symlink:${outside}`);
  const worktree = {entries: new Map()};
  assertControlViolation(detectViolations({
    role: 'arc_implementer', before: {...worktree, control: before}, after: {...worktree, control: after},
  }), label);
});

test('extra entry records a non-directory parent', async t => {
  const dir = await makeRepo(t), home = await tempDir(t);
  const parent = path.join(home, '.grok'), label = 'grok-home:config.toml';
  await fs.writeFile(parent, 'not a directory');
  const states = await snapshotControlFiles({
    ...controlTarget(dir), extra: [{label, path: path.join(parent, 'config.toml')}],
  });
  assert.equal(states.get(label), 'parent-not-directory');
});

test('extra entry records a parent replacement after reading', async t => {
  const dir = await makeRepo(t), home = await tempDir(t);
  const parent = path.join(home, '.grok'), replacement = path.join(home, 'replacement');
  const config = path.join(parent, 'config.toml'), label = 'grok-home:config.toml';
  await fs.mkdir(parent);
  await fs.mkdir(replacement);
  await fs.writeFile(config, 'permission_mode = "ask"\n');
  const project = bytes => {
    renameSync(parent, path.join(home, 'original'));
    renameSync(replacement, parent);
    return grokConfigSecurityProjection(bytes);
  };
  const states = await snapshotControlFiles({...controlTarget(dir), extra: [{label, path: config, project}]});
  assert.equal(states.get(label), 'parent-changed');
});

test('multiline Grok config detects edits inside non-security strings', async t => {
  const dir = await makeRepo(t), home = await tempDir(t);
  const config = path.join(home, 'config.toml'), label = 'grok-home:config.toml';
  const bytes = 'description = """\nfirst line\n"""\npermission_mode = "ask"\n';
  await fs.writeFile(config, bytes);
  const target = {...controlTarget(dir), extra: [{label, path: config, project: grokConfigSecurityProjection}]};
  assertControlViolation(await controlChange(target, () => fs.writeFile(config, bytes.replace('first line', 'edited line'))), label);
});

for (const [parent, name, label] of [
  ['.claude', 'settings.json', 'worktree:.claude/'],
  ['.codex', 'config.toml', 'worktree:.codex/'],
  ['.git/hooks', 'pre-commit', 'git:hooks'],
  ['.git/info/nested', 'config', 'git:info/nested'],
]) {
  test(`control snapshot records a symlink replacing ${parent} without reading its target`, async t => {
    const dir = await makeRepo(t), outside = await tempDir(t), target = controlTarget(dir);
    const watched = path.join(dir, parent);
    await fs.mkdir(watched, {recursive: true});
    await fs.writeFile(path.join(watched, name), 'same bytes');
    await fs.writeFile(path.join(outside, name), 'same bytes');

    const result = await controlChange(target, async () => {
      await fs.rename(watched, path.join(path.dirname(dir), 'original'));
      await fs.symlink(outside, watched);
    });
    assert.equal(result.reason, 'permission_violation_observed');
    assert.ok(result.controlChanged.includes(label));
    const after = await snapshotControlFiles(target);
    assert.equal(after.get(label), `symlink:${outside}`);
    assert.ok(!after.has(`${label.replace(/\/$/, '')}/${name}`));
  });
}

test('replacement by an identical new file or a symlink is detected', async t => {
  const dir = await makeRepo(t), target = controlTarget(dir);
  const hook = path.join(target.gitCommonDir, 'hooks/pre-commit');
  const replacement = path.join(target.gitCommonDir, 'replacement');
  await fs.writeFile(hook, 'same bytes');
  await fs.writeFile(replacement, 'same bytes');
  assertControlViolation(await controlChange(target, () => fs.rename(replacement, hook)), 'git:hooks/pre-commit');
  assertControlViolation(await controlChange(target, async () => {
    await fs.unlink(hook);
    await fs.symlink('pre-commit.sample', hook);
  }), 'git:hooks/pre-commit');
});

test('more than 1000 hook entries collapse to one overflow state', async t => {
  const dir = await makeRepo(t), target = controlTarget(dir);
  const hooks = path.join(target.gitCommonDir, 'hooks');
  await fs.rm(hooks, {recursive: true, force: true});
  await fs.mkdir(hooks);
  for (let i = 0; i < 1000; i++) await fs.writeFile(path.join(hooks, String(i)), '');
  const before = await snapshotControlFiles(target);
  assert.equal(before.get('git:hooks'), undefined);
  assert.equal([...before].filter(([label]) => label.startsWith('git:hooks/')).length, 1000);
  const result = await controlChange(target, () => fs.writeFile(path.join(hooks, '1000'), ''));
  assert.equal(result.reason, 'permission_violation_observed');
  assert.ok(result.controlChanged.includes('git:hooks'));
  const after = await snapshotControlFiles(target);
  assert.deepEqual([...after].filter(([label]) => label.startsWith('git:hooks')), [['git:hooks', 'overflow']]);
});

test('arc, index, objects, logs and lock files are ignored', async t => {
  const dir = await makeRepo(t), target = controlTarget(dir);
  const result = await controlChange(target, async () => {
    await fs.mkdir(path.join(target.gitCommonDir, 'arc'));
    await fs.writeFile(path.join(target.gitCommonDir, 'arc/x'), 'lease');
    await fs.writeFile(path.join(dir, 'src/a.js'), 'allowed');
    git(dir, 'add', 'src/a.js');
    await fs.appendFile(path.join(target.gitCommonDir, 'logs/HEAD'), '\n');
    await fs.writeFile(path.join(target.gitCommonDir, 'objects/test-entry'), 'object');
    await fs.writeFile(path.join(target.gitCommonDir, 'info/exclude.lock'), 'lock');
  });
  assert.deepEqual(result.controlChanged, []);
  assert.equal(result.reason, null);
});

test('unchanged control files and absent .claude/.codex give no reason', async t => {
  const dir = await makeRepo(t);
  const result = await controlChange(controlTarget(dir), async () => {});
  assert.deepEqual(result.controlChanged, []);
  assert.equal(result.reason, null);
});

test('allowedPaths and read roles do not exempt control files', async t => {
  const dir = await makeRepo(t), target = controlTarget(dir);
  await fs.mkdir(path.join(dir, '.claude'));
  for (const role of ['arc_implementer', 'arc_reviewer']) {
    const result = await controlChange(target, () => fs.writeFile(path.join(dir, '.claude/settings.json'), role), {role, allowedPaths: ['.claude/']});
    assertControlViolation(result, 'worktree:.claude/settings.json');
  }
});

test('linked worktree sees common hooks and its own config.worktree', async t => {
  const dir = await makeRepo(t), worktree = path.join(path.dirname(dir), 'linked');
  git(dir, 'config', 'extensions.worktreeConfig', 'true');
  git(dir, 'worktree', 'add', '--detach', worktree);
  const target = {
    gitCommonDir: path.join(dir, '.git'),
    gitDir: git(worktree, 'rev-parse', '--absolute-git-dir').trim(),
    worktree,
  };
  assertControlViolation(await controlChange(target, () => fs.writeFile(path.join(target.gitCommonDir, 'hooks/post-checkout'), 'test')), 'git:hooks/post-checkout');
  assertControlViolation(await controlChange(target, () => git(worktree, 'config', '--worktree', 'core.filemode', 'true')), 'git:config.worktree');
});

test('snapshotControlFiles rejects relative paths, a missing gitCommonDir and an unreadable hooks directory', async t => {
  const dir = await makeRepo(t), target = controlTarget(dir);
  for (const key of ['gitCommonDir', 'gitDir', 'worktree']) {
    await assert.rejects(snapshotControlFiles({...target, [key]: 'relative'}));
  }
  await assert.rejects(snapshotControlFiles({...target, gitCommonDir: path.join(dir, 'missing')}));
  await t.test('unreadable hooks directory', {skip: process.getuid?.() === 0}, async () => {
    const hooks = path.join(target.gitCommonDir, 'hooks'), {mode} = await fs.stat(hooks);
    await fs.chmod(hooks, 0o000);
    try {
      await assert.rejects(snapshotControlFiles(target), {code: 'EACCES'});
    } finally {
      await fs.chmod(hooks, mode);
    }
  });
});

test('snapshotControlFiles records an unreadable hooks subdirectory as a control change', {skip: process.getuid?.() === 0}, async t => {
  const dir = await makeRepo(t), target = controlTarget(dir);
  const subdir = path.join(target.gitCommonDir, 'hooks/x'), label = 'git:hooks/x/';
  await t.test('unreadable subtree', async t => {
    const result = await controlChange(target, async () => {
      await fs.mkdir(subdir);
      t.after(() => fs.chmod(subdir, 0o700));
      await fs.chmod(subdir, 0o000);
    });
    assertControlViolation(result, label);
    assert.equal((await snapshotControlFiles(target)).get(label), 'unreadable');
  });
});

test('claudeProjectSettingsWidenScope checks both project settings files', async t => {
  const cases = [
    ['absent settings', null, null],
    ['benign settings', '{"permissions":{"allow":["Bash(npm test)"],"additionalDirectories":[]},"env":{"A":"1"}}', null],
    ['symlink', 'symlink', /regular file/],
    ['directory', 'directory', /regular file/],
    ['invalid JSON', '{', /invalid JSON/],
    ['additionalDirectories', '{"permissions":{"additionalDirectories":["../outside"]}}', /additionalDirectories/],
    ...['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].map(tool => [tool, `{"permissions":{"allow":["Bash(npm test)","${tool}(src/**)"]}}`, /permissions\.allow/]),
    ['hooks', '{"hooks":{}}', /hooks/],
    ['sandbox', '{"sandbox":null}', /sandbox/],
    ['defaultMode', '{"permissions":{"defaultMode":"default"}}', /defaultMode/],
  ];
  for (const [name, contents, expected] of cases) {
    await t.test(name, async t => {
      const worktree = await tempDir(t);
      const settings = path.join(worktree, '.claude/settings.local.json');
      if (contents !== null) {
        await fs.mkdir(path.dirname(settings));
        await fs.writeFile(path.join(worktree, '.claude/settings.json'), '{}');
        if (contents === 'symlink') await fs.symlink('settings.json', settings);
        else if (contents === 'directory') await fs.mkdir(settings);
        else await fs.writeFile(settings, contents);
      }
      const result = await roleObserve.claudeProjectSettingsWidenScope?.(worktree);
      if (expected === null) assert.equal(result, null);
      else {
        assert.match(result, expected);
        assert.match(result, /\.claude\/settings\.local\.json/);
      }
    });
  }
});

test('claudeProjectSettingsWidenScope allows only safe tool names in permissions.allow', async t => {
  const held = [['Write'], ['Edit'], [' Edit(//x/**)'], ['write(src/**)'], ['*'], ['mcp__srv__tool'], [1], 'Write'];
  const cases = [
    ...held.map(allow => [allow, '.claude/settings.json: permissions.allow']),
    [['Bash(npm test)', 'Read', 'Grep(**)', 'Glob', 'WebFetch(domain:x)', 'WebSearch'], null],
    [[' bash (npm test)', 'READ'], null],
  ];
  for (const [allow, expected] of cases) {
    await t.test(JSON.stringify(allow), async t => {
      const worktree = await tempDir(t), settings = path.join(worktree, '.claude/settings.json');
      await fs.mkdir(path.dirname(settings));
      await fs.writeFile(settings, JSON.stringify({permissions: {allow}}));
      const result = await roleObserve.claudeProjectSettingsWidenScope(worktree);
      assert.equal(result, expected);
    });
  }
});

test('claudeProjectSettingsWidenScope holds when .claude is a symlink even without settings files', async t => {
  await t.test('symlink to an empty outside directory', async t => {
    const worktree = await tempDir(t);
    const outside = await tempDir(t);
    await fs.symlink(outside, path.join(worktree, '.claude'));
    assert.ok(await roleObserve.claudeProjectSettingsWidenScope(worktree));
  });

  await t.test('regular file', async t => {
    const worktree = await tempDir(t);
    await fs.writeFile(path.join(worktree, '.claude'), '');
    assert.ok(await roleObserve.claudeProjectSettingsWidenScope(worktree));
  });
});

test('allowedPathsCoverControl', () => {
  for (const entry of ['.git/', '.git', '.git/hooks/pre-commit', './.git/config', '.GIT/hooks/', '.claude/', '.claude',
    '.claude/settings.json', '.claude/settings.local.json', '.Claude/Settings.json', '.codex/', '.codex/config.toml', '.', './']) {
    assert.equal(allowedPathsCoverControl([entry]), true, entry);
  }
  for (const entry of ['src/a.js', '.claude/agents/x.md', '.github/', '.gitignore', '.claude-plugin/x', '.codexrc']) {
    assert.equal(allowedPathsCoverControl([entry]), false, entry);
  }
  assert.equal(allowedPathsCoverControl([]), false);
});
