import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRoutingFixture} from './role-fixtures.mjs';
import * as dispatchPolicy from '../../lib/runtime/role-dispatch-policy.mjs';
import {DEFAULT_POLICY} from '../../lib/runtime/role-dispatch-policy.mjs';
import {ROUTING_ROLES} from '../../lib/runtime/role-routing-config.mjs';
import {parseCompositeProfile, ROLE_BRIDGE_PERMISSIONS, buildClaudeArgs, buildCodexArgs, buildGeminiArgs, buildGrokArgs, argsDigest} from '../../lib/runtime/role-bridge-args.mjs';
import {profileName} from '../../lib/runtime/role-dispatch-policy.mjs';
import * as codexArgs from '../../lib/runtime/role-bridge-args.mjs';
import {buildToolContext, resolveForbidden} from '../../lib/runtime/tool-access.mjs';
import {buildBridgeInvocation} from '../../lib/runtime/role-supervisor.mjs';

const CLAUDE_TOOLS = {
  arc_scouter: ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch'], arc_planner: ['Read', 'Grep', 'Glob'],
  arc_implementer: ['Read', 'Grep', 'Glob', 'Bash', 'Write', 'Edit'], arc_tester: ['Read', 'Grep', 'Glob', 'Bash'], arc_reviewer: ['Read', 'Grep', 'Glob']
};
const SANDBOX = {sandbox: {enabled: true, failIfUnavailable: true}};
const passPolicy = (extra = {}) => ({...DEFAULT_POLICY, gates: {...DEFAULT_POLICY.gates, G1: 'pass', ...extra}, claudeSandboxSettings: SANDBOX});
const claudeProfile = role => ({name: profileName('claude', role), description: 'd', model: 'haiku', effort: 'low', tools: CLAUDE_TOOLS[role], instructions: 'Be careful.\nLine two.'});
const codexProfile = role => ({name: profileName('codex', role), description: 'd', model: 'gpt-6-luna', effort: 'low', tools: null, instructions: 'Codex "quoted" \\ instructions\nline two'});
const flagValue = (args, flag) => args[args.indexOf(flag) + 1];
const toolAccess = overrides => ({network: null, domains: [], unixSockets: [], paths: [], services: [], envPresets: [], ...overrides});
const codexContext = (role, worktree, access) => buildToolContext({
  platform: 'codex', role, dispatchId: '01234567-1111-4111-8111-111111111111', uid: 501,
  userHome: '/home/test', homes: {codex: '/config/codex'}, worktree,
  gitDir: '/main/.git/worktrees/test', gitCommonDir: '/main/.git', toolAccess: access,
});
const envItems = context => context.env.flatMap(([key, value]) => ['-c', `shell_environment_policy.set.${key}=${JSON.stringify(value)}`]);
const codexInput = {role: 'arc_tester', profile: codexProfile('arc_tester'), worktree: '/w', resultPath: '/result'};
const loopbackContext = () => codexContext(codexInput.role, codexInput.worktree, toolAccess({network: 'loopback'}));

test('Codex services grant adds host dir read entry after protection entries', () => {
  const toolContext = codexContext(codexInput.role, codexInput.worktree, toolAccess({services: ['browser-cdp']}));
  const args = buildCodexArgs({...codexInput, toolContext});
  assert.ok(args.includes('permissions.arc_bridge.filesystem={"/w/.git"="read","/w/.codex"="read","/private/tmp/arc-host-01234567"="read"}'));
});
const claudeScratch = '/private/tmp/claude-501/arc-bridge-01234567';
const claudeContext = (role, access, envNames, homes = {claude: '/config/claude'}) => buildToolContext({
  platform: 'claude', role, dispatchId: '01234567-1111-4111-8111-111111111111', uid: 501,
  userHome: '/home/test', homes, worktree: '/w', toolAccess: access, envNames,
});
const claudeArgs = (role, toolContext) => buildClaudeArgs({role, profile: claudeProfile(role), toolContext});
const d2Prime = {
  permissions: {deny: ['Edit(./.git/**)']},
  sandbox: {
    enabled: true, autoAllowBashIfSandboxed: true, allowUnsandboxedCommands: false, failIfUnavailable: true,
    filesystem: {denyWrite: ['./.git']},
  },
};

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
  const claude = '---\nname: arc-routing-tester\ndescription: d\nmodel: haiku\neffort: low\ntools:\n  - Read\n---\nbody\n';
  assert.equal(parseCompositeProfile('claude', Buffer.from(claude)).instructions.trim(), 'body');
  assert.throws(() => parseCompositeProfile('claude', Buffer.from(claude.replace('model: haiku\n', ''))));
  assert.throws(() => parseCompositeProfile('claude', Buffer.from(claude.replace('---\nbody', '---'))));
  assert.throws(() => parseCompositeProfile('claude', Buffer.from('no frontmatter')));
  const codex = 'name = "arc_routing_tester"\ndescription = "d"\nmodel = "gpt-6-luna"\nmodel_reasoning_effort = "low"\ndeveloper_instructions = """\nhello\n"""\n';
  assert.equal(parseCompositeProfile('codex', Buffer.from(codex)).instructions.trim(), 'hello');
  assert.throws(() => parseCompositeProfile('codex', Buffer.from(codex.replace('model = "gpt-6-luna"\n', ''))));
  assert.throws(() => parseCompositeProfile('codex', Buffer.from(codex.replace('"""\nhello\n"""', '"""\nhello\n'))));
  assert.throws(() => parseCompositeProfile('codex', Buffer.from(codex.replace('developer_instructions = """\nhello\n"""', 'developer_instructions = "one"'))));
  assert.throws(() => parseCompositeProfile('other', Buffer.from(codex)));
});

test('ROLE_BRIDGE_PERMISSIONS follows spec 5.5', () => {
  const p = ROLE_BRIDGE_PERMISSIONS;
  for (const role of ['arc_scouter', 'arc_planner', 'arc_reviewer', 'arc_tester']) assert.equal(p.claude[role].permissionMode, 'default');
  assert.equal(p.claude.arc_implementer.permissionMode, 'acceptEdits');
  assert.deepEqual(ROUTING_ROLES.filter(r => p.claude[r].sandbox), ['arc_implementer', 'arc_tester']);
  for (const role of ['arc_scouter', 'arc_planner', 'arc_reviewer']) assert.equal(p.codex[role].sandboxMode, 'read-only');
  for (const role of ['arc_tester', 'arc_implementer']) assert.equal(p.codex[role].sandboxMode, 'workspace-write');
  assert.deepEqual(ROUTING_ROLES.filter(r => p.codex[r].search), ['arc_scouter']);
});

for (const role of ['arc_implementer', 'arc_tester']) test(`AC4 Grok ${role} requires a valid custom sandbox name`, () => {
  const input = {role, profile: {model: 'grok-test'}, sessionId: '11111111-1111-4111-8111-111111111111', promptFile: '/segment/prompt.md'};
  for (const sandboxProfile of [undefined, 'workspace', 'arc-bridge-0123Abcd', 'arc-bridge-0123abc', 'arc-bridge-0123abcd\n']) {
    assert.throws(() => buildGrokArgs({...input, sandboxProfile}), /sandbox/i);
  }
  assert.equal(ROLE_BRIDGE_PERMISSIONS.grok[role].sandbox, 'custom');
  const args = buildGrokArgs({...input, sandboxProfile: 'arc-bridge-0123abcd'});
  assert.equal(flagValue(args, '--sandbox'), 'arc-bridge-0123abcd');
  assert.ok(!args.includes('workspace'));
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
  const tester = buildClaudeArgs({role: 'arc_tester', profile: claudeProfile('arc_tester'), policy: passPolicy()});
  assert.equal(flagValue(tester, '--permission-mode'), 'default');
  assert.ok(tester.includes('--settings'));
  for (const args of [planner, impl, tester]) {
    // no positional prompt: every non-flag argument is the value of the preceding flag
    args.forEach((arg, i) => { if (!arg.startsWith('--') && arg !== '-p') assert.ok(args[i - 1].startsWith('--'), `positional argument at ${i}`); });
  }
  assert.ok(planner.includes('--strict-mcp-config'));
  const loose = buildClaudeArgs({role: 'arc_planner', profile: claudeProfile('arc_planner'), policy: {...DEFAULT_POLICY, gates: {...DEFAULT_POLICY.gates, G6: 'loose'}}});
  assert.ok(!loose.includes('--strict-mcp-config'));
  assert.throws(() => buildClaudeArgs({role: 'arc_tester', profile: claudeProfile('arc_tester'), policy: {...passPolicy(), claudeSandboxSettings: null}}), /sandbox/i);
});

test('Claude writing roles get D2 settings without --setting-sources', () => {
  const settings = {
    permissions: {deny: ['Edit(./.git/**)']},
    sandbox: {
      enabled: true, autoAllowBashIfSandboxed: true, allowUnsandboxedCommands: false, failIfUnavailable: true,
      filesystem: {denyWrite: ['./.git']},
    },
  };
  for (const role of ['arc_implementer', 'arc_tester']) {
    const args = buildClaudeArgs({role, profile: claudeProfile(role), policy: DEFAULT_POLICY});
    assert.equal(args.includes('--setting-sources'), false, role);
    assert.equal(args.filter(arg => arg === '--settings').length, 1, role);
    assert.deepEqual(JSON.parse(flagValue(args, '--settings')), settings, role);
  }
});

test('Claude read roles get neither --settings nor --setting-sources', () => {
  for (const role of ['arc_scouter', 'arc_planner', 'arc_reviewer']) {
    const args = buildClaudeArgs({role, profile: claudeProfile(role), policy: DEFAULT_POLICY});
    assert.equal(args.includes('--settings'), false, role);
    assert.equal(args.includes('--setting-sources'), false, role);
  }
});

test('Claude writing roles get D2′ plus base/caches env settings bytes', () => {
  for (const role of ['arc_implementer', 'arc_tester']) {
    const context = claudeContext(role);
    const args = claudeArgs(role, context);
    const env = Object.fromEntries(context.env);
    assert.equal(env.TMPDIR, `${claudeScratch}/tmp`);
    assert.equal(env.npm_config_cache, `${claudeScratch}/cache/npm`);
    assert.equal(flagValue(args, '--settings'), JSON.stringify({...d2Prime, env}));
  }
});

test('Claude allowedTools absent from profile tools throws', () => {
  const role = 'arc_scouter';
  for (const missing of ['WebFetch', 'WebSearch']) {
    const profile = {...claudeProfile(role), tools: CLAUDE_TOOLS[role].filter(tool => tool !== missing)};
    assert.throws(() => buildClaudeArgs({role, profile}), {message: 'Claude allowedTools must be listed in profile tools'});
  }
});

test('Claude bridge invocation holds when an allowed tool is absent from the reserved profile', async t => {
  const role = 'arc_scouter';
  const f = await createRoutingFixture(t, {hostPlatform: 'codex', roles: {[role]: 'claude'}});
  const filename = path.join(f.claudeHome, 'agents/arc-routing-scouter.md');
  const original = await fs.readFile(filename, 'utf8');
  const modified = original.replace(/^\s+- WebSearch\r?\n/m, '');
  assert.ok(parseCompositeProfile('claude', Buffer.from(original)).tools.includes('WebSearch'));
  assert.ok(!parseCompositeProfile('claude', Buffer.from(modified)).tools.includes('WebSearch'));
  const invocation = {
    lease: {version: 2, role, route: 'bridge', hostPlatform: 'codex', targetPlatform: 'claude', sessionId: null,
      profileHash: 'sha256:' + createHash('sha256').update(modified).digest('hex')},
    config: f.config, homes: f.homes, worktree: f.cwd, resultPath: path.join(f.base, 'result'), userHome: f.userHome, env: f.env,
  };
  await fs.writeFile(filename, modified);
  await assert.rejects(buildBridgeInvocation(invocation), {reasonCode: 'permission_scope_unverified', message: 'Profile arguments unavailable'});
});

test('Claude network settings for loopback, domains and sockets', () => {
  const role = 'arc_tester';
  const loopback = claudeContext(role, toolAccess({network: 'loopback'}));
  const loopbackNetwork = {allowedDomains: ['localhost', '127.0.0.1'], allowLocalBinding: true, allowUnixSockets: [`${claudeScratch}/sock`]};
  assert.equal(flagValue(claudeArgs(role, loopback), '--settings'), JSON.stringify({
    ...d2Prime, sandbox: {...d2Prime.sandbox, network: loopbackNetwork}, env: Object.fromEntries(loopback.env),
  }));

  const homes = {grok: '/opt/grok', codex: '/home/test/.config/codex-cli', claude: '/config/claude', gemini: '/home/test/.git-tools/gemini'};
  const domains = claudeContext(role, toolAccess({network: 'domains', domains: ['z.example.com', 'a.example.com']}), ['ZZ_TOKEN', 'AWS_PROFILE', 'LANG'], homes);
  const denyRead = ['/config/claude', '/home/test/.aws', '/home/test/.config/codex-cli', '/home/test/.config/gcloud',
    '/home/test/.config/gh', '/home/test/.docker', '/home/test/.git-tools/gemini', '/home/test/.gitconfig',
    '/home/test/.gnupg', '/home/test/.kube', '/home/test/.netrc', '/home/test/.npmrc', '/home/test/.ssh', '/opt/grok'];
  const readRules = ['Read(//config/claude/**)', 'Read(//home/test/.aws/**)', 'Read(//home/test/.config/codex-cli/**)',
    'Read(//home/test/.config/gcloud/**)', 'Read(//home/test/.config/gh/**)', 'Read(//home/test/.docker/**)',
    'Read(//home/test/.git-tools/gemini/**)', 'Read(//home/test/.gitconfig)', 'Read(//home/test/.gnupg/**)',
    'Read(//home/test/.kube/**)', 'Read(//home/test/.netrc)', 'Read(//home/test/.npmrc)', 'Read(//home/test/.ssh/**)', 'Read(//opt/grok/**)'];
  const env = {...Object.fromEntries(domains.env), AWS_PROFILE: '', ZZ_TOKEN: ''};
  assert.equal(flagValue(claudeArgs(role, domains), '--settings'), JSON.stringify({
    permissions: {deny: ['Edit(./.git/**)', ...readRules]},
    sandbox: {...d2Prime.sandbox, filesystem: {denyWrite: ['./.git'], denyRead},
      network: {...loopbackNetwork, allowedDomains: ['localhost', '127.0.0.1', 'a.example.com', 'z.example.com']}},
    env: Object.fromEntries(Object.keys(env).sort().map(name => [name, env[name]])),
  }));
});

test('Claude domains secret env names change argsDigest', () => {
  const role = 'arc_tester';
  const access = toolAccess({network: 'domains', domains: ['a.example.com']});
  const digest = names => argsDigest(claudeArgs(role, claudeContext(role, access, names)));
  assert.notEqual(digest(['A_TOKEN']), digest(['B_TOKEN']));
  assert.equal(digest(['A_TOKEN', 'LANG']), digest(['A_TOKEN']));
});

test('other Claude roles have no allowedTools', () => {
  for (const role of ROUTING_ROLES.filter(role => role !== 'arc_scouter')) {
    assert.ok(!claudeArgs(role, claudeContext(role)).includes('--allowedTools'), role);
  }
});

test('G1 fail still holds Claude writing roles', () => {
  for (const role of ['arc_implementer', 'arc_tester']) {
    assert.throws(() => buildClaudeArgs({role, profile: claudeProfile(role), policy: passPolicy({G1: 'fail'})}), /sandbox/i, role);
  }
});

test('Claude resume argv re-specifies model, effort, tools, permission and settings', () => {
  const args = buildClaudeArgs({role: 'arc_implementer', profile: claudeProfile('arc_implementer'), sessionId: 'abc-123', policy: passPolicy()});
  assert.equal(flagValue(args, '--resume'), 'abc-123');
  for (const flag of ['--model', '--effort', '--tools', '--permission-mode', '--settings', '--append-system-prompt']) assert.ok(args.includes(flag), flag);
});

test('Codex argv per role matches spec 5.5', () => {
  const worktree = '/work/repo', resultPath = '/work/out/result.txt';
  for (const role of ROUTING_ROLES) {
    const toolContext = codexContext(role, worktree);
    const args = buildCodexArgs({role, profile: codexProfile(role), worktree, resultPath, policy: DEFAULT_POLICY, toolContext});
    assert.equal(args[0] === '--search', role === 'arc_scouter');
    const rest = role === 'arc_scouter' ? args.slice(1) : args;
    assert.deepEqual(rest.slice(0, 5), ['exec', '--json', '-C', worktree, '-m']);
    assert.equal(rest[5], 'gpt-6-luna');
    const cValues = rest.flatMap((a, i) => a === '-c' ? [rest[i + 1]] : []);
    const sandbox = ROLE_BRIDGE_PERMISSIONS.codex[role].sandboxMode;
    assert.deepEqual(cValues, ['model_reasoning_effort="low"', `developer_instructions=${JSON.stringify(codexProfile(role).instructions)}`, `sandbox_mode=${JSON.stringify(sandbox)}`, 'approval_policy="never"',
      ...(toolContext ? envItems(toolContext).filter((_, index) => index % 2) : [])]);
    assert.equal(sandbox, role === 'arc_tester' || role === 'arc_implementer' ? 'workspace-write' : 'read-only');
    assert.equal(JSON.parse(cValues[1].slice('developer_instructions='.length)), codexProfile(role).instructions);
    assert.equal(flagValue(rest, '-o'), resultPath);
    assert.equal(rest.at(-1), '-');
    assert.ok(!rest.includes('--skip-git-repo-check') && !rest.includes('--sandbox'));
  }
});

test('Codex writer sandbox mode argv equals base plus sorted env items', () => {
  for (const role of ['arc_implementer', 'arc_tester']) {
    const input = {...codexInput, role, profile: codexProfile(role)};
    const toolContext = codexContext(role, input.worktree);
    const base = buildCodexArgs(input);
    const args = buildCodexArgs({...input, toolContext});
    const env = envItems(toolContext);
    const output = args.indexOf('-o');
    assert.deepEqual(toolContext.env.map(([key]) => key), toolContext.env.map(([key]) => key).sort());
    assert.deepEqual(args.slice(output - env.length, output), env);
    assert.deepEqual([...args.slice(0, output - env.length), ...args.slice(output)], base);
    assert.deepEqual(buildCodexArgs({...input, toolContext: null}), base);
  }
});

test('Codex profile mode omits sandbox_mode and starts filesystem with R1 entries', () => {
  const args = buildCodexArgs({...codexInput, toolContext: loopbackContext()});
  assert.ok(!args.some(arg => arg.startsWith('sandbox_mode=')));
  assert.deepEqual(args.slice(4, 8), ['-c', 'default_permissions="arc_bridge"', '-c', 'features.network_proxy=true']);
  assert.match(args.find(arg => arg.startsWith('permissions.arc_bridge.filesystem=')) ?? '',
    /^permissions\.arc_bridge\.filesystem=\{"\/w\/\.git"="read","\/w\/\.codex"="read"/);
  assert.ok(args.includes('permissions.arc_bridge.network.unix_sockets={"/private/tmp/arc-bridge-01234567/sock"="allow"}'));
});

// Codex 0.170.0, 2026-11-24, MI-1
const MI1_PROFILE_SELECTION = ['-c', 'default_permissions="arc_bridge"', '-c', 'features.network_proxy=true'];
const MI1_PROFILE_SETTINGS = [
  '-c', 'permissions.arc_bridge.extends=":workspace"',
  '-c', 'permissions.arc_bridge.filesystem={"/w/.git"="read","/w/.codex"="read"}',
  '-c', 'permissions.arc_bridge.network.enabled=true',
  '-c', 'permissions.arc_bridge.network.domains={"127.0.0.1"="allow"}',
  '-c', 'permissions.arc_bridge.network.allow_local_binding=true',
  '-c', 'permissions.arc_bridge.network.unix_sockets={"/private/tmp/arc-bridge-01234567/sock"="allow"}',
  '-c', 'approval_policy="never"',
  '-c', 'shell_environment_policy.set.TMPDIR="/private/tmp/arc-bridge-01234567/tmp"',
];
test('Codex profile argv matches MI-1 recorded form', () => {
  const toolContext = {...loopbackContext(), env: [['TMPDIR', '/private/tmp/arc-bridge-01234567/tmp']]};
  const model = ['-m', 'gpt-6-luna', '-c', 'model_reasoning_effort="low"', '-c',
    `developer_instructions=${JSON.stringify(codexInput.profile.instructions)}`];
  const settings = [...MI1_PROFILE_SELECTION, ...model, ...MI1_PROFILE_SETTINGS, '-o', '/result', '-'];
  assert.deepEqual(buildCodexArgs({...codexInput, toolContext}), ['exec', '--json', '-C', '/w', ...settings]);
  // The bridge keeps its existing resume thread ID position.
  assert.deepEqual(buildCodexArgs({...codexInput, toolContext, threadId: 'tid-1'}), ['exec', 'resume', 'tid-1', '--json', ...settings]);
});

test('missing protection entries throw', () => {
  assert.throws(() => codexArgs.assertCodexProtection([['/w/.codex', 'read']], '/w'),
    {message: 'Codex profile protection entries missing'});
});

test('paths-only grant uses profile mode without network keys', () => {
  const toolContext = codexContext(codexInput.role, '/w', toolAccess({paths: ['first', 'second']}));
  const args = buildCodexArgs({...codexInput, toolContext}, {toolPaths: {first: '/z/output', second: '/a/output'}});
  assert.ok(args.includes('default_permissions="arc_bridge"'));
  assert.ok(args.includes('permissions.arc_bridge.filesystem={"/w/.git"="read","/w/.codex"="read","/a/output"="write","/z/output"="write"}'));
  assert.ok(!args.some(arg => arg === '--enable' || arg.includes('network_proxy') || arg.startsWith('permissions.arc_bridge.network.')));
});

test('domains renders none entries for readWhenExternal and env exclude', () => {
  const toolContext = codexContext(codexInput.role, '/w', toolAccess({network: 'domains', domains: ['z.example.com', 'a.example.com']}));
  const forbidden = resolveForbidden({worktree: '/w', userHome: '/home/test', homes: {codex: '/config/codex'}});
  const denied = forbidden.readWhenExternal.map(entry => JSON.stringify(entry.path)).sort().map(key => `${key}="none"`);
  const args = buildCodexArgs({...codexInput, toolContext});
  assert.ok(args.includes(`permissions.arc_bridge.filesystem={"/w/.git"="read","/w/.codex"="read",${denied.join(',')}}`));
  assert.ok(args.includes('permissions.arc_bridge.network.domains={"127.0.0.1"="allow","a.example.com"="allow","z.example.com"="allow"}'));
  assert.deepEqual(args.slice(-5, -3), ['-c', `shell_environment_policy.exclude=${JSON.stringify(forbidden.envWhenExternal)}`]);
});

test('git entries follow CODEX_PROFILE_GIT_ENTRIES', () => {
  // Codex 0.170.0, 2026-11-24, MI-3
  assert.equal(dispatchPolicy.CODEX_PROFILE_GIT_ENTRIES, false);
  assert.deepEqual(codexArgs.codexFilesystemEntries(loopbackContext()), [['/w/.git', 'read'], ['/w/.codex', 'read']]);
});

test('Codex read roles ignore toolContext', () => {
  for (const role of ['arc_scouter', 'arc_planner', 'arc_reviewer']) {
    for (const threadId of [null, 'tid-1']) {
      const input = {...codexInput, role, profile: codexProfile(role), threadId};
      assert.deepEqual(buildCodexArgs({...input, toolContext: loopbackContext()}), buildCodexArgs(input));
    }
  }
});

test('Codex resume argv uses exec resume <tid>, -c sandbox_mode and no -C or --sandbox', () => {
  const args = buildCodexArgs({role: 'arc_tester', profile: codexProfile('arc_tester'), worktree: '/work/repo', resultPath: '/work/out/r.txt', threadId: 'tid-1', policy: DEFAULT_POLICY});
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

// Omitting isolation flags would start user or extension MCP servers in a bridge child.
for (const role of ROUTING_ROLES) test(`Gemini bridge arguments isolate MCP and extensions for ${role}`, () => {
  const sessionId = '11111111-1111-4111-8111-111111111111';
  const writing = ['arc_implementer', 'arc_tester'].includes(role);
  const args = buildGeminiArgs({role, model: 'gemini-test', sessionId, policyFile: '/policy/role.toml'});
  assert.deepEqual(args, ['-p', 'Follow the role instructions and task on stdin.', '-m', 'gemini-test', '-o', 'stream-json', '--session-id', sessionId,
    '--approval-mode', writing ? 'auto_edit' : 'plan', '--policy', '/policy/role.toml', ...(writing ? ['--sandbox'] : []),
    '-e', 'none', '--allowed-mcp-server-names', '__arc_none__']);
  assert.equal(args.includes('--resume'), false);
});
