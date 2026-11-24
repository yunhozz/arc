import assert from 'node:assert/strict';
import {lstat, mkdir, mkdtemp, readFile, rmdir, symlink, unlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';

const moduleUrl = new URL('../../lib/runtime/tool-access.mjs', import.meta.url);
const toolAccess = async () => {
  const module = await import(moduleUrl).catch(error => {
    if (error.code !== 'ERR_MODULE_NOT_FOUND' || error.url !== moduleUrl.href) throw error;
    assert.fail('tool-access request contract is missing');
  });
  return module;
};
const request = (overrides = {}) => ({network: null, domains: [], unixSockets: [], paths: [], services: [], envPresets: [], ...overrides});
const tester = 'arc_tester';
const impl = 'arc_implementer';

test('toolAccess requires exactly the six keys', async () => {
  const {validateToolAccess, TOOL_ACCESS_KEYS} = await toolAccess();
  const {network, ...otherKeys} = request();
  assert.equal(validateToolAccess(tester, otherKeys), null);
  assert.equal(validateToolAccess(tester, request({extra: true})), null);
  assert.deepEqual(Object.keys(validateToolAccess(tester, {...otherKeys, network})), TOOL_ACCESS_KEYS);
});

test('array elements must be unique strings and are normalized by name', async () => {
  const {validateToolAccess} = await toolAccess();
  const input = request({envPresets: ['polling', 'ci']});
  assert.deepEqual(validateToolAccess(tester, input).envPresets, ['ci', 'polling']);
  assert.deepEqual(input.envPresets, ['polling', 'ci']);
  for (const envPresets of [['ci', 'ci'], [1], Array(1)]) {
    assert.equal(validateToolAccess(tester, request({envPresets})), null);
  }
});

test('role table', async () => {
  const {validateToolAccess} = await toolAccess();
  for (const [role, overrides, allowed] of [
    ['arc_scouter', {}, false], ['arc_planner', {}, false], ['arc_reviewer', {}, false],
    [impl, {network: 'domains', domains: ['example.com']}, false],
    [impl, {network: 'loopback'}, true], [impl, {services: ['browser-cdp']}, false],
    [tester, {services: ['browser-cdp']}, true], [tester, {envPresets: ['base']}, false],
    [tester, {envPresets: ['caches']}, false], [tester, {paths: ['x']}, false], [tester, {unixSockets: ['x']}, false],
  ]) assert.equal(validateToolAccess(role, request(overrides)) !== null, allowed, JSON.stringify([role, overrides]));
});

test('domains accept/reject table', async () => {
  const {isValidDomain, validateToolAccess} = await toolAccess();
  for (const name of ['Example.com', 'example.com.', 'a..b.com', '[::1]', '127.0.0.1', 'localhost', 'foo.localhost',
    'foo.local', 'foo.internal', 'x.home.arpa', 'https://a.com', 'a.com:443', '*.a.com', 'example.com\n', 'x.xn--', 'a.b1']) {
    assert.equal(isValidDomain(name), false, JSON.stringify(name));
    assert.equal(validateToolAccess(tester, request({network: 'domains', domains: [name]})), null, JSON.stringify(name));
  }
  const punycode = 'xn--p1ai.xn--p1ai';
  assert.equal(isValidDomain(punycode), true);
  assert.ok(validateToolAccess(tester, request({network: 'domains', domains: [punycode]})));
  assert.equal(validateToolAccess(tester, request({network: 'loopback', domains: ['a.com']})), null);
  assert.equal(validateToolAccess(tester, request({network: 'domains'})), null);
  const domains = Array.from({length: 16}, (_, i) => `domain${i}.com`);
  for (const name of domains) assert.equal(isValidDomain(name), true, name);
  assert.ok(validateToolAccess(tester, request({network: 'domains', domains})));
  assert.equal(validateToolAccess(tester, request({network: 'domains', domains: [...domains, 'last.com']})), null);
});

test('effective network rises to loopback when services are requested', async () => {
  const {effectiveGrants} = await toolAccess();
  const grants = effectiveGrants('codex', tester, request({services: ['browser-cdp'], envPresets: ['ci']}));
  assert.equal(grants.network, 'loopback');
  assert.deepEqual(grants.mechanisms, [
    'scratch', 'env.base', 'env.caches', 'env.ci', 'codexProfile', 'network.loopback', 'unixSockets.scratch', 'service.browser-cdp',
  ]);
});

test('gate states map to reasons', async () => {
  const {toolAccessReasons} = await toolAccess();
  const pass = {codex: 'pass'};
  const gates = {'scratch': pass, 'env.base': pass, 'env.caches': pass, 'codexProfile': pass, 'unixSockets.scratch': pass};
  const reasons = (toolAccessGates, network = 'full') => toolAccessReasons({
    platform: 'codex', role: tester, route: 'bridge', toolAccess: request({network}), policy: {toolAccessGates},
  });
  assert.deepEqual(reasons({...gates, 'network.full': pass}), {reasons: [], conditions: []});
  for (const toolAccessGates of [gates, {...gates, 'network.full': {codex: 'held'}}]) {
    assert.deepEqual(reasons(toolAccessGates), {reasons: ['permission_scope_unverified'], conditions: []});
  }
  assert.deepEqual(reasons({...gates, codexProfile: {codex: 'conditional'}, 'network.loopback': pass}, 'loopback'), {
    reasons: [], conditions: [{mechanism: 'codexProfile', condition: 'profile mode requires worktree .git and .codex read entries (verified by MI-1/MI-3)'}],
  });
});

test('initial gates hold full on every platform and any toolAccess on grok and gemini', async () => {
  const {toolAccessReasons} = await toolAccess();
  for (const [platform, network] of [['codex', 'full'], ['claude', 'full'], ['grok', null], ['gemini', null]]) {
    assert.deepEqual(toolAccessReasons({platform, role: tester, route: 'bridge', toolAccess: request({network})}),
      {reasons: ['permission_scope_unverified'], conditions: []}, platform);
  }
});

test('native route with toolAccess is permission_scope_unverified', async () => {
  const {toolAccessReasons} = await toolAccess();
  const context = {platform: 'codex', role: tester, route: 'native'};
  assert.deepEqual(toolAccessReasons(context), {reasons: [], conditions: []});
  assert.deepEqual(toolAccessReasons({...context, toolAccess: request()}), {reasons: ['permission_scope_unverified'], conditions: []});
  assert.deepEqual(toolAccessReasons({...context, toolAccess: {}}), {reasons: ['invalid_request'], conditions: []});
});

test('always-on grants apply only where scratch and env.base/env.caches pass', async () => {
  const {effectiveGrants, toolAccessPreflight} = await toolAccess();
  for (const platform of ['grok', 'gemini']) assert.equal(effectiveGrants(platform, tester, null), null);
  for (const platform of ['codex', 'claude']) {
    assert.equal(effectiveGrants(platform, 'arc_scouter', null), null);
    const grants = effectiveGrants(platform, tester, null);
    assert.deepEqual(grants.envPresets, ['base', 'caches']);
    assert.deepEqual(grants.mechanisms, ['scratch', 'env.base', 'env.caches']);
    assert.deepEqual(await toolAccessPreflight({platform, role: tester, grants}), []);
  }
});

test('Claude domains stays conditional with the measured read denials', async () => {
  const {toolAccessReasons} = await toolAccess();
  assert.deepEqual(toolAccessReasons({platform: 'claude', role: tester, route: 'bridge',
    toolAccess: request({network: 'domains', domains: ['example.com']})}), {
    reasons: [], conditions: [{mechanism: 'network.domains',
      condition: 'tools that ignore the network proxy (for example npm) fail (B2); Read tool denial verified by MI-7, directory denyRead by MI-9'}],
  });
});

test('Claude allowWrite preflight holds an unresolved path grant', async () => {
  const {toolAccessPreflight} = await toolAccess();
  const context = {platform: 'claude', role: tester, grants: {paths: ['missing']}};
  assert.deepEqual(await toolAccessPreflight(context), ['permission_scope_unverified']);
});

test('Claude allowWrite preflight requires a real directory for each registered path', async t => {
  const {toolAccessPreflight} = await toolAccess();
  const root = await mkdtemp(path.join(tmpdir(), 'arc-claude-allow-write-'));
  const toolPaths = {
    directory: path.join(root, 'directory'),
    file: path.join(root, 'file'),
    missing: path.join(root, 'missing'),
    link: path.join(root, 'link'),
  };
  await mkdir(toolPaths.directory);
  await writeFile(toolPaths.file, 'fixture');
  await symlink(toolPaths.directory, toolPaths.link, 'dir');
  t.after(async () => {
    await unlink(toolPaths.link);
    await unlink(toolPaths.file);
    await rmdir(toolPaths.directory);
    await rmdir(root);
  });
  for (const id of ['directory', 'file', 'missing', 'link']) {
    await t.test(id, async () => {
      const context = {platform: 'claude', role: tester, grants: {paths: [id]}, io: {lstat}};
      assert.deepEqual(await toolAccessPreflight(context, {toolPaths}), id === 'directory' ? [] : ['permission_scope_unverified']);
    });
  }
});

test('env preset data has no shared keys and valid names', async () => {
  const {TOOL_ENV_PRESETS} = await toolAccess();
  const keys = new Set();
  assert.deepEqual(Object.keys(TOOL_ENV_PRESETS), ['base', 'caches', 'ci', 'daemon-off', 'polling']);
  for (const values of Object.values(TOOL_ENV_PRESETS)) {
    assert.ok(Object.isFrozen(values));
    for (const [key, value] of Object.entries(values)) {
      assert.match(key, /^[A-Za-z_][A-Za-z0-9_]*$/);
      assert.equal(keys.has(key), false, key);
      assert.match(value, /^(?:<S>[^<>]*|[^<>]+)$/);
      keys.add(key);
    }
  }
});

test('FORBIDDEN is the single source', async () => {
  const {FORBIDDEN, resolveForbidden, TOOL_PATHS, TOOL_UNIX_SOCKETS} = await toolAccess();
  const homes = {codex: '/cli/codex', claude: '/cli/claude', grok: '/cli/grok', gemini: '/cli/gemini'};
  const args = {worktree: '/w', userHome: '/u', homes, env: {SSH_AUTH_SOCK: '/tmp/ssh.sock'}};
  const resolved = resolveForbidden(args);
  for (const path of ['/w/.git', '/w/.codex', ...Object.values(homes)]) {
    assert.ok(resolved.write.some(entry => entry.path === path && entry.kind === 'dir'), path);
  }
  for (const path of Object.values(homes)) assert.ok(resolved.readWhenExternal.some(entry => entry.path === path));
  assert.ok(resolved.sockets.includes('/var/run/docker.sock'));
  assert.ok(resolved.sockets.includes('/tmp/ssh.sock'));
  assert.ok(!resolveForbidden({...args, env: {}}).sockets.includes('$SSH_AUTH_SOCK'));
  assert.deepEqual(resolved.envWhenExternal, FORBIDDEN.envWhenExternal);
  const forbidden = new Set([...resolved.write.map(entry => entry.path), ...resolved.sockets]);
  for (const path of [...Object.values(TOOL_PATHS), ...Object.values(TOOL_UNIX_SOCKETS)]) assert.ok(!forbidden.has(path));
});

test('new modules contain no platform name branches', async () => {
  await toolAccess();
  for (const url of [moduleUrl, new URL('host-service.mjs', moduleUrl)]) {
    const source = await readFile(url, 'utf8');
    assert.doesNotMatch(source, /(===|!==)\s*['"](codex|claude|grok|gemini)['"]/);
    assert.doesNotMatch(source, /case ['"](codex|claude|grok|gemini)['"]/);
  }
});

test('measured host service gates expose the MI-A and MI-B conditions', async () => {
  const {TOOL_ACCESS_GATES, TOOL_ACCESS_CONDITIONS} = await toolAccess();
  for (const platform of ['codex', 'claude']) {
    assert.equal(TOOL_ACCESS_GATES['service.browser-cdp'][platform], 'conditional');
    assert.equal(TOOL_ACCESS_CONDITIONS['service.browser-cdp'][platform],
      'home and ~/Library reads denied (MI-A); files outside home such as /etc remain readable through file://');
    for (const engine of ['chromium', 'firefox', 'webkit']) {
      const mechanism = `service.browser-playwright-${engine}`;
      assert.equal(TOOL_ACCESS_GATES[mechanism][platform], 'held');
      assert.equal(TOOL_ACCESS_CONDITIONS[mechanism][platform], 'no host-global Playwright install; isolation unmeasured (MI-B)');
    }
  }
});

test('host directory rejects protected paths in both containment directions', async t => {
  const {buildToolContext} = await toolAccess();
  const hostDir = '/private/tmp/arc-host-01234567';
  const build = protectedHome => buildToolContext({
    platform: 'codex', role: tester, dispatchId: '01234567-1111-4111-8111-111111111111',
    toolAccess: request({services: ['browser-cdp']}), uid: 501, userHome: '/users/test',
    homes: {codex: protectedHome}, worktree: '/worktree',
  });
  for (const [name, home] of [
    ['protected path contains host directory', '/private/tmp'],
    ['host directory contains protected path', hostDir + '/codex'],
  ]) {
    await t.test(name, () => {
      assert.throws(() => build(home), {reasonCode: 'permission_scope_unverified'});
    });
  }
  assert.equal(build(hostDir + '-sibling').hostDir, hostDir);
});
