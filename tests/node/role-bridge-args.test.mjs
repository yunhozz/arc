import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRoutingFixture} from './role-fixtures.mjs';
import {DEFAULT_POLICY} from '../../lib/runtime/role-dispatch-policy.mjs';
import {ROUTING_ROLES} from '../../lib/runtime/role-routing-config.mjs';
import {parseCompositeProfile, ROLE_BRIDGE_PERMISSIONS, buildClaudeArgs, buildCodexArgs, argsDigest} from '../../lib/runtime/role-bridge-args.mjs';
import {profileName} from '../../lib/runtime/role-dispatch-policy.mjs';

const CLAUDE_TOOLS = {
  arc_scouter: ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch'], arc_planner: ['Read', 'Grep', 'Glob'],
  arc_implementer: ['Read', 'Grep', 'Glob', 'Bash', 'Write', 'Edit'], arc_qa: ['Read', 'Grep', 'Glob', 'Bash'], arc_reviewer: ['Read', 'Grep', 'Glob']
};
const SANDBOX = {sandbox: {enabled: true, failIfUnavailable: true}};
const passPolicy = (extra = {}) => ({...DEFAULT_POLICY, gates: {...DEFAULT_POLICY.gates, G1: 'pass', ...extra}, claudeSandboxSettings: SANDBOX});
const claudeProfile = role => ({name: profileName('claude', role), description: 'd', model: 'haiku', effort: 'low', tools: CLAUDE_TOOLS[role], instructions: 'Be careful.\nLine two.'});
const codexProfile = role => ({name: profileName('codex', role), description: 'd', model: 'gpt-6-luna', effort: 'low', tools: null, instructions: 'Codex "quoted" \\ instructions\nline two'});
const flagValue = (args, flag) => args[args.indexOf(flag) + 1];

test('parseCompositeProfile reads fixture-rendered Claude and Codex profiles for all five roles', async t => {
  const claude = await createRoutingFixture(t, {hostPlatform: 'claude'});
  const codex = await createRoutingFixture(t, {hostPlatform: 'codex'});
  for (const role of ROUTING_ROLES) {
    const c = parseCompositeProfile('claude', await fs.readFile(path.join(claude.claudeHome, 'agents', `arc-routing-${role.slice(4)}.md`)));
    assert.equal(c.name, profileName('claude', role));
    assert.deepEqual(c.tools, CLAUDE_TOOLS[role]);
    assert.equal(c.model, 'haiku'); assert.equal(c.effort, 'low');
    assert.ok(c.instructions.trim().length > 0 && typeof c.description === 'string');
    const x = parseCompositeProfile('codex', await fs.readFile(path.join(codex.codexHome, 'agents', `arc-routing-${role.slice(4)}.toml`)));
    assert.equal(x.name, profileName('codex', role));
    assert.equal(x.model, 'gpt-6-luna'); assert.equal(x.effort, 'low'); assert.equal(x.tools, null);
    assert.ok(x.instructions.trim().length > 0 && !x.instructions.startsWith('"'));
  }
});

test('parseCompositeProfile rejects missing model or malformed developer_instructions', () => {
  const claude = '---\nname: arc-routing-qa\ndescription: d\nmodel: haiku\neffort: low\ntools:\n  - Read\n---\nbody\n';
  assert.equal(parseCompositeProfile('claude', Buffer.from(claude)).instructions.trim(), 'body');
  assert.throws(() => parseCompositeProfile('claude', Buffer.from(claude.replace('model: haiku\n', ''))));
  assert.throws(() => parseCompositeProfile('claude', Buffer.from(claude.replace('---\nbody', '---'))));
  assert.throws(() => parseCompositeProfile('claude', Buffer.from('no frontmatter')));
  const codex = 'name = "arc_routing_qa"\ndescription = "d"\nmodel = "gpt-6-luna"\nmodel_reasoning_effort = "low"\ndeveloper_instructions = """\nhello\n"""\n';
  assert.equal(parseCompositeProfile('codex', Buffer.from(codex)).instructions.trim(), 'hello');
  assert.throws(() => parseCompositeProfile('codex', Buffer.from(codex.replace('model = "gpt-6-luna"\n', ''))));
  assert.throws(() => parseCompositeProfile('codex', Buffer.from(codex.replace('"""\nhello\n"""', '"""\nhello\n'))));
  assert.throws(() => parseCompositeProfile('codex', Buffer.from(codex.replace('developer_instructions = """\nhello\n"""', 'developer_instructions = "one"'))));
  assert.throws(() => parseCompositeProfile('other', Buffer.from(codex)));
});

test('ROLE_BRIDGE_PERMISSIONS follows spec 5.5', () => {
  const p = ROLE_BRIDGE_PERMISSIONS;
  for (const role of ['arc_scouter', 'arc_planner', 'arc_reviewer', 'arc_qa']) assert.equal(p.claude[role].permissionMode, 'default');
  assert.equal(p.claude.arc_implementer.permissionMode, 'acceptEdits');
  assert.deepEqual(ROUTING_ROLES.filter(r => p.claude[r].sandbox), ['arc_implementer', 'arc_qa']);
  for (const role of ['arc_scouter', 'arc_planner', 'arc_reviewer']) assert.equal(p.codex[role].sandboxMode, 'read-only');
  for (const role of ['arc_qa', 'arc_implementer']) assert.equal(p.codex[role].sandboxMode, 'workspace-write');
  assert.deepEqual(ROUTING_ROLES.filter(r => p.codex[r].search), ['arc_scouter']);
});

test('Claude argv per role matches spec 5.5', () => {
  const planner = buildClaudeArgs({role: 'arc_planner', profile: claudeProfile('arc_planner'), policy: DEFAULT_POLICY});
  assert.deepEqual(planner.slice(0, 8), ['-p', '--safe-mode', '--output-format', 'stream-json', '--verbose', '--model', 'haiku', '--effort']);
  assert.equal(flagValue(planner, '--effort'), 'low');
  assert.equal(flagValue(planner, '--append-system-prompt'), 'Be careful.\nLine two.');
  assert.equal(flagValue(planner, '--tools'), 'Read,Grep,Glob');
  assert.equal(flagValue(planner, '--permission-mode'), 'default');
  assert.ok(!planner.includes('--settings') && !planner.includes('--resume'));
  assert.ok(planner.indexOf('--verbose') > planner.indexOf('stream-json'));
  const impl = buildClaudeArgs({role: 'arc_implementer', profile: claudeProfile('arc_implementer'), policy: passPolicy()});
  assert.equal(flagValue(impl, '--permission-mode'), 'acceptEdits');
  assert.deepEqual(JSON.parse(flagValue(impl, '--settings')), SANDBOX);
  const qa = buildClaudeArgs({role: 'arc_qa', profile: claudeProfile('arc_qa'), policy: passPolicy()});
  assert.equal(flagValue(qa, '--permission-mode'), 'default');
  assert.ok(qa.includes('--settings'));
  for (const args of [planner, impl, qa]) {
    // no positional prompt: every non-flag argument is the value of the preceding flag
    args.forEach((arg, i) => { if (!arg.startsWith('--') && arg !== '-p') assert.ok(args[i - 1].startsWith('--'), `positional argument at ${i}`); });
  }
  assert.ok(planner.includes('--strict-mcp-config'));
  const loose = buildClaudeArgs({role: 'arc_planner', profile: claudeProfile('arc_planner'), policy: {...DEFAULT_POLICY, gates: {...DEFAULT_POLICY.gates, G6: 'loose'}}});
  assert.ok(!loose.includes('--strict-mcp-config'));
  assert.throws(() => buildClaudeArgs({role: 'arc_implementer', profile: claudeProfile('arc_implementer'), policy: DEFAULT_POLICY}), /sandbox/i);
  assert.throws(() => buildClaudeArgs({role: 'arc_qa', profile: claudeProfile('arc_qa'), policy: {...passPolicy(), claudeSandboxSettings: null}}), /sandbox/i);
});

test('Claude resume argv re-specifies model, effort, tools, permission and settings', () => {
  const args = buildClaudeArgs({role: 'arc_implementer', profile: claudeProfile('arc_implementer'), sessionId: 'abc-123', policy: passPolicy()});
  assert.equal(flagValue(args, '--resume'), 'abc-123');
  for (const flag of ['--model', '--effort', '--tools', '--permission-mode', '--settings', '--append-system-prompt']) assert.ok(args.includes(flag), flag);
});

test('Codex argv per role matches spec 5.5', () => {
  const worktree = '/work/repo', resultPath = '/work/out/result.txt';
  for (const role of ROUTING_ROLES) {
    const args = buildCodexArgs({role, profile: codexProfile(role), worktree, resultPath, policy: DEFAULT_POLICY});
    assert.equal(args[0] === '--search', role === 'arc_scouter');
    const rest = role === 'arc_scouter' ? args.slice(1) : args;
    assert.deepEqual(rest.slice(0, 5), ['exec', '--json', '-C', worktree, '-m']);
    assert.equal(rest[5], 'gpt-6-luna');
    const cValues = rest.flatMap((a, i) => a === '-c' ? [rest[i + 1]] : []);
    const sandbox = ROLE_BRIDGE_PERMISSIONS.codex[role].sandboxMode;
    assert.deepEqual(cValues, ['model_reasoning_effort="low"', `developer_instructions=${JSON.stringify(codexProfile(role).instructions)}`, `sandbox_mode=${JSON.stringify(sandbox)}`, 'approval_policy="never"']);
    assert.equal(sandbox, role === 'arc_qa' || role === 'arc_implementer' ? 'workspace-write' : 'read-only');
    assert.equal(JSON.parse(cValues[1].slice('developer_instructions='.length)), codexProfile(role).instructions);
    assert.equal(flagValue(rest, '-o'), resultPath);
    assert.equal(rest.at(-1), '-');
    assert.ok(!rest.includes('--skip-git-repo-check') && !rest.includes('--sandbox'));
  }
});

test('Codex resume argv uses exec resume <tid>, -c sandbox_mode and no -C or --sandbox', () => {
  const args = buildCodexArgs({role: 'arc_qa', profile: codexProfile('arc_qa'), worktree: '/work/repo', resultPath: '/work/out/r.txt', threadId: 'tid-1', policy: DEFAULT_POLICY});
  assert.deepEqual(args.slice(0, 4), ['exec', 'resume', 'tid-1', '--json']);
  assert.ok(args.includes('sandbox_mode="workspace-write"') && args.includes('approval_policy="never"'));
  assert.ok(!args.includes('-C') && !args.includes('--sandbox') && !args.includes('--skip-git-repo-check'));
  assert.equal(flagValue(args, '-o'), '/work/out/r.txt');
  assert.equal(args.at(-1), '-');
});

test('Codex resume re-specifies top-level --search before exec for Scouter only', () => {
  for (const role of ROUTING_ROLES) {
    const args = buildCodexArgs({role, profile: codexProfile(role), worktree: '/work/repo', resultPath: '/work/out/r.txt', threadId: 'tid-1', policy: DEFAULT_POLICY});
    assert.equal(args.includes('--search'), role === 'arc_scouter', role);
    if (role === 'arc_scouter') assert.deepEqual(args.slice(0, 5), ['--search', 'exec', 'resume', 'tid-1', '--json']);
    else assert.deepEqual(args.slice(0, 4), ['exec', 'resume', 'tid-1', '--json']);
  }
});

test('Codex -C uses the worktree root passed by the caller, not a subdirectory', () => {
  const args = buildCodexArgs({role: 'arc_planner', profile: codexProfile('arc_planner'), worktree: '/work/repo', resultPath: '/r', policy: DEFAULT_POLICY});
  assert.equal(flagValue(args, '-C'), '/work/repo');
  assert.throws(() => buildCodexArgs({role: 'arc_planner', profile: codexProfile('arc_planner'), worktree: 'relative/dir', resultPath: '/r', policy: DEFAULT_POLICY}));
});

test('argv never contains environment secret values and argsDigest is stable', t => {
  const secret = 'ARC_FAKE_SECRET_VALUE_9f3a';
  const previous = process.env.ARC_FAKE_SECRET; process.env.ARC_FAKE_SECRET = secret;
  t.after(() => { if (previous === undefined) delete process.env.ARC_FAKE_SECRET; else process.env.ARC_FAKE_SECRET = previous; });
  const lists = [buildClaudeArgs({role: 'arc_planner', profile: claudeProfile('arc_planner'), policy: DEFAULT_POLICY}),
    buildCodexArgs({role: 'arc_scouter', profile: codexProfile('arc_scouter'), worktree: '/w', resultPath: '/r', policy: DEFAULT_POLICY})];
  for (const args of lists) assert.ok(!args.some(a => a.includes(secret)));
  const digest = argsDigest(lists[0]);
  assert.match(digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(digest, argsDigest([...lists[0]]));
  assert.notEqual(digest, argsDigest(lists[1]));
  assert.notEqual(argsDigest(['a', 'bc']), argsDigest(['ab', 'c']));
});
