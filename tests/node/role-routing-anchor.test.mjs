import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {createTestRuntimeRegistry} from './fixtures/platforms/zeta.mjs';
import {createRoutingFixture, installFakeCli} from './role-fixtures.mjs';
import {COOPERATIVE_RUNTIME_MODULES, cooperativeVersions} from '../../lib/runtime/bootstrap.mjs';
import {ROUTING_ROLES} from '../../lib/runtime/role-routing-config.mjs';
import * as routing from '../../lib/runtime/role-routing.mjs';
import * as bridge from '../../lib/runtime/role-bridge.mjs';
import {DEFAULT_POLICY} from '../../lib/runtime/role-dispatch-policy.mjs';
import {createLease, listLeases} from '../../lib/runtime/role-dispatch-store.mjs';

const policy = {...DEFAULT_POLICY, lockRetryMs: 0};
const hash = bytes => 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex');
const markerPath = home => path.join(home, 'arc-role-platform-routing.prepared.json');
const activePath = home => path.join(home, 'arc-role-platform-routing.json');
const codes = result => result.reasons.map(entry => entry.code);
const assignment = {role: 'arc_planner', taskId: 'T11', requestId: 'anchor-1'};

async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'arc-anchor-'));
  const root = await fs.realpath(base);
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const userHome = path.join(root, 'home'), cwd = path.join(root, 'repo'), bin = path.join(root, 'bin');
  const homes = {codex: path.join(userHome, '.codex'), claude: path.join(userHome, '.claude'), zeta: path.join(userHome, '.zeta')};
  for (const dir of [...Object.values(homes), cwd, bin]) await fs.mkdir(dir, {recursive: true});
  const runtimePlatforms = createTestRuntimeRegistry();
  const context = {userHome, cwd, env: {PATH: bin, HOME: userHome, CODEX_HOME: homes.codex, ZETA_HOME: homes.zeta}, runtimePlatforms, hostPlatform: 'zeta', executionEnvironment: 'zeta-cli', workflowId: 'anchor-wf'};
  await installFakeCli(t, bin, 'claude', {version: '2.1.322'});
  await fs.symlink(process.execPath, path.join(bin, 'zeta'));
  const config = {version: 2, revision: 'anchor-rev', platforms: ['claude', 'zeta'], roles: Object.fromEntries(ROUTING_ROLES.map(role => [role, {platform: role === 'arc_scouter' ? 'claude' : 'zeta', model: 'haiku', effort: 'low'}]))};
  const bytes = Buffer.from(JSON.stringify(config));
  await fs.writeFile(activePath(homes.claude), bytes);
  const versions = await cooperativeVersions();
  for (const id of config.platforms) {
    const home = homes[id], runtime = path.join(home, 'skills/arc/runtime');
    await fs.mkdir(runtime, {recursive: true});
    for (const module of COOPERATIVE_RUNTIME_MODULES) {
      await fs.mkdir(path.dirname(path.join(runtime, module)), {recursive: true});
      await fs.copyFile(new URL('../../lib/runtime/' + module, import.meta.url), path.join(runtime, module));
    }
    await fs.copyFile(new URL('../../lib/policy/role-policy.json', import.meta.url), path.join(runtime, 'role-policy.json'));
    await fs.mkdir(path.join(home, 'agents'));
    const profiles = {};
    for (const role of ROUTING_ROLES.filter(role => config.roles[role].platform === id)) {
      const relative = `agents/arc-routing-${role.slice(4)}.md`, content = Buffer.from(`---\nname: arc-routing-${role.slice(4)}\n---\n${role}\n`);
      await fs.writeFile(path.join(home, relative), content);
      profiles[role] = {path: relative, hash: hash(content)};
    }
    const marker = {version: 1, revision: config.revision, platform: id, targetHome: home, activeConfigPath: activePath(homes.claude), configHash: hash(bytes), runtime: {version: versions.runtime, hash: versions.runtimeHash, policyHash: versions.policyHash}, profiles};
    await fs.writeFile(markerPath(home), JSON.stringify(marker));
  }
  return {homes, context, config};
}

// Broken codex-home selection must fail both lock placement and persisted native dispatch behavior.
test('routingStatus finds anchor via host marker and locks there', async t => {
  const f = await fixture(t), locks = [], open = fs.open;
  t.mock.method(fs, 'open', async (filename, flags, ...args) => {
    if (flags === 'wx' && String(filename).endsWith('arc-role-platform-routing.lock')) locks.push(filename);
    return open(filename, flags, ...args);
  });
  const status = await routing.routingStatus({context: f.context, policy});
  assert.equal(status.decision, 'allow');
  assert.deepEqual(Object.keys(status.platforms), ['claude', 'zeta']);
  assert.equal(status.roles.arc_planner.profileName, 'arc-routing-planner');
  assert.deepEqual(locks, [path.join(f.homes.claude, 'arc-role-platform-routing.lock')]);
  const invalidOutsideHome = {...f.context, env: {...f.context.env, CODEX_HOME: ''}};
  assert.deepEqual(routing.resolveRuntimeHomes(invalidOutsideHome), {claude: f.homes.claude, zeta: f.homes.zeta});
  assert.equal((await routing.routingStatus({context: invalidOutsideHome, policy})).decision, 'allow');
  await fs.writeFile(path.join(f.homes.claude, 'arc-role-platform-routing.lock'), 'busy');
  const busy = await routing.routingStatus({context: f.context, policy});
  assert.equal(busy.decision, 'hold');
  assert.deepEqual(busy.residualPaths, [path.join(f.homes.claude, 'arc-role-platform-routing.lock')]);
  await fs.unlink(path.join(f.homes.claude, 'arc-role-platform-routing.lock'));
  const prepared = await routing.prepareRoleDispatch({context: f.context, assignment, expectedRevision: f.config.revision, policy});
  assert.equal(prepared.decision, 'allow');
  assert.equal(prepared.route, 'native');
  assert.equal((await listLeases(f.homes.claude, {runtimePlatforms: f.context.runtimePlatforms})).length, 1);
  assert.deepEqual(await listLeases(f.homes.codex), []);
  const observation = await bridge.recordRoleObservation({context: f.context, dispatchId: prepared.dispatchId, event: 'started', nativeAgentId: 'native-zeta', policy});
  assert.equal(observation.routeStatus, 'running');
  assert.equal((await bridge.recordRoleObservation({context: f.context, dispatchId: prepared.dispatchId, event: 'completed', policy})).routeStatus, 'completed');
  const second = await routing.prepareRoleDispatch({context: f.context, assignment: {...assignment, requestId: 'anchor-2'}, expectedRevision: f.config.revision, policy});
  assert.equal(second.decision, 'allow');
  assert.equal((await bridge.cancelRoleDispatch({context: f.context, dispatchId: second.dispatchId, policy})).routeStatus, 'cancelled');
});

// Each case leaves the other guards valid, so removing the named guard exposes an allow.
test('anchor/host mismatch, host∉S, marker re-check mismatch → activation_unverified', async t => {
  const f = await fixture(t), options = {anchorHome: f.homes.claude, host: 'zeta', runtimePlatforms: f.context.runtimePlatforms};
  assert.equal((await routing.routingStatus({context: f.context, policy})).decision, 'allow');
  await assert.rejects(routing.readActivation(f.homes, f.config.revision, {...options, host: 'codex'}), /Host outside/);
  const moved = activePath(f.homes.zeta);
  await fs.copyFile(activePath(f.homes.claude), moved);
  for (const id of ['claude', 'zeta']) {
    const file = markerPath(f.homes[id]), marker = JSON.parse(await fs.readFile(file));
    marker.activeConfigPath = moved;
    await fs.writeFile(file, JSON.stringify(marker));
  }
  assert.deepEqual(codes(await routing.routingStatus({context: f.context, policy})), ['activation_unverified']);
  await assert.rejects(routing.readActivation(f.homes, f.config.revision, {...options, anchorHome: f.homes.zeta}), /Anchor mismatch/);
  for (const id of ['claude', 'zeta']) {
    const file = markerPath(f.homes[id]), marker = JSON.parse(await fs.readFile(file));
    marker.activeConfigPath = activePath(f.homes.claude);
    await fs.writeFile(file, JSON.stringify(marker));
  }
  const hostMarker = markerPath(f.homes.zeta), original = await fs.readFile(hostMarker), lstat = fs.lstat, open = fs.open;
  const lastProfile = path.join(f.homes.zeta, 'agents/arc-routing-reviewer.md');
  const root = f.context.userHome;
  async function snapshot() {
    const entries = {};
    async function visit(relative) {
      const filename = path.join(root, relative), stat = await fs.lstat(filename);
      if (stat.isDirectory()) {
        entries[relative] = ['directory'];
        for (const name of (await fs.readdir(filename)).sort()) await visit(path.join(relative, name));
      } else entries[relative] = ['file', (await fs.readFile(filename)).toString('hex')];
    }
    await visit(''); return entries;
  }
  const changedMarker = Buffer.from(JSON.stringify({...JSON.parse(original), activeConfigPath: moved}));
  const expected = await snapshot();
  expected[path.relative(root, hostMarker)] = ['file', changedMarker.toString('hex')];
  let lastProfileRead = false, markerChanged = false;
  const openSpy = t.mock.method(fs, 'open', async (filename, ...args) => {
    const handle = await open(filename, ...args);
    if (filename === lastProfile) {
      const readFile = handle.readFile.bind(handle);
      t.mock.method(handle, 'readFile', async (...readArgs) => {
        const bytes = await readFile(...readArgs);
        lastProfileRead = true;
        return bytes;
      });
    }
    return handle;
  });
  const statSpy = t.mock.method(fs, 'lstat', async (...args) => {
    const stat = await lstat(...args);
    // Once profiles have been read, this is the host marker's snapshot check.
    // Return its captured stat, then let the final host lookup see the changed marker.
    if (lastProfileRead && !markerChanged && args[0] === hostMarker && args[1]?.bigint === true) {
      markerChanged = true;
      await fs.writeFile(hostMarker, changedMarker);
    }
    return stat;
  });
  try {
    await assert.rejects(routing.readActivation(f.homes, f.config.revision, options), {message: 'Host marker changed'});
    assert.deepEqual(await fs.readFile(hostMarker), changedMarker);
    assert.deepEqual(await snapshot(), expected);
  } finally { openSpy.mock.restore(); statSpy.mock.restore(); await fs.writeFile(hostMarker, original); }
  const marker = JSON.parse(original);
  await fs.writeFile(markerPath(f.homes.codex), JSON.stringify({...marker, platform: 'codex', targetHome: f.homes.codex, profiles: {}}));
  assert.deepEqual(codes(await routing.routingStatus({context: {...f.context, hostPlatform: 'codex', executionEnvironment: 'codex-cli'}, policy})), ['activation_unverified']);
  await fs.writeFile(hostMarker, '{}');
  await assert.rejects(routing.locateAnchorHome({host: 'zeta', homes: f.homes}));
});

test('host outside S without marker → activation_unverified', async t => {
  const f = await fixture(t);
  assert.equal((await routing.routingStatus({context: f.context, policy})).decision, 'allow');
  const context = {...f.context, hostPlatform: 'codex', executionEnvironment: 'codex-cli'};
  const status = await routing.routingStatus({context, policy});
  assert.equal(status.decision, 'hold');
  assert.deepEqual(codes(status), ['activation_unverified']);
  assert.deepEqual(codes(await routing.prepareRoleDispatch({context, assignment, expectedRevision: f.config.revision, policy})), ['activation_unverified']);
  await assert.rejects(fs.stat(path.join(f.homes.codex, 'arc-role-platform-routing.lock')), {code: 'ENOENT'});
});

test('default codex+claude layout unchanged', async t => {
  const f = await createRoutingFixture(t);
  await f.cli('claude', {version: '2.1.322'});
  const locks = [], open = fs.open;
  t.mock.method(fs, 'open', async (filename, flags, ...args) => {
    if (flags === 'wx' && String(filename).endsWith('arc-role-platform-routing.lock')) locks.push(filename);
    return open(filename, flags, ...args);
  });
  const result = await routing.prepareRoleDispatch({context: f.context(), assignment, expectedRevision: f.revision, policy});
  assert.equal(result.decision, 'allow');
  assert.deepEqual(locks, [path.join(f.codexHome, 'arc-role-platform-routing.lock')]);
  assert.equal((await listLeases(f.codexHome)).length, 1);
  assert.deepEqual(await listLeases(f.claudeHome), []);
});

test('leaseTargetPlatform holds with three registered platforms', async t => {
  const f = await fixture(t);
  assert.equal((await routing.routingStatus({context: f.context, policy})).decision, 'allow');
  const native = await routing.prepareRoleDispatch({context: f.context, assignment, expectedRevision: f.config.revision, policy});
  assert.equal(native.decision, 'allow');
  assert.equal(bridge.leaseTargetPlatform({route: 'native', hostPlatform: 'zeta'}, f.context.runtimePlatforms), 'zeta');
  assert.equal(bridge.leaseTargetPlatform({route: 'bridge', hostPlatform: 'zeta'}, createTestRuntimeRegistry(['claude', 'zeta'])), 'claude');
  assert.throws(() => bridge.leaseTargetPlatform({route: 'bridge', hostPlatform: 'zeta'}, f.context.runtimePlatforms), /unknown platform/);
  const file = path.join(f.homes.claude, 'arc-role-dispatch', native.dispatchId + '.json');
  const lease = JSON.parse(await fs.readFile(file));
  await fs.writeFile(file, JSON.stringify({...lease, route: 'bridge'}));
  const result = await bridge.recordRoleObservation({context: f.context, dispatchId: native.dispatchId, policy});
  assert.equal(result.decision, 'hold');
  assert.deepEqual(codes(result), ['activation_unverified']);
});

// Trusting an unregistered marker directory must never create even a transient lock.
test('F5 marker pointing outside registered homes creates no files', async t => {
  const f = await fixture(t), outside = path.join(path.dirname(f.homes.zeta), 'outside');
  await fs.mkdir(outside);
  const file = markerPath(f.homes.zeta), marker = JSON.parse(await fs.readFile(file));
  await fs.writeFile(file, JSON.stringify({...marker, activeConfigPath: activePath(outside)}));
  const writes = [], open = fs.open;
  t.mock.method(fs, 'open', async (filename, flags, ...args) => {
    if (typeof flags === 'string' && /[wa+]/.test(flags)) writes.push(filename);
    return open(filename, flags, ...args);
  });
  const options = {context: f.context, policy}, dispatchId = 'outside-dispatch';
  const results = [
    await routing.routingStatus(options),
    await routing.prepareRoleDispatch({...options, assignment, expectedRevision: f.config.revision}),
    await bridge.runBridgeDispatch({...options, dispatchId, brief: 'T2'}),
    await bridge.recordRoleObservation({...options, dispatchId, event: 'started', nativeAgentId: 'native-zeta'}),
    await bridge.resumeRoleDispatch({...options, dispatchId, brief: 'T2'}),
    await bridge.cancelRoleDispatch({...options, dispatchId})
  ];
  assert.deepEqual(results.map(result => codes(result)), results.map(() => ['activation_unverified']));
  assert.deepEqual(results.map(result => result.decision), results.map(() => 'hold'));
  assert.deepEqual(await fs.readdir(outside), []);
  for (const home of Object.values(f.homes)) {
    await assert.rejects(fs.stat(path.join(home, 'arc-role-platform-routing.lock')), {code: 'ENOENT'});
  }
  assert.deepEqual(writes, []);
});

// Pruning before the profile check deletes evidence from an unverified activation.
test('F5 terminal lease cleanup only after full verification', async t => {
  const f = await createRoutingFixture(t);
  await f.cli('claude', {version: '2.1.322'});
  const now = Date.parse('2026-11-16T00:00:00.000Z');
  const old = new Date(now - policy.leaseRetentionMs - 1).toISOString();
  const lease = {version: 1, dispatchId: 'expired', workflowId: 'old-wf', taskId: 'old-task', requestId: 'old-request', role: 'arc_planner', route: 'native', hostPlatform: 'claude', executionEnvironment: 'claude-cli', revision: f.revision, profileHash: 'sha256:' + 'b'.repeat(64), argsDigest: null, state: 'completed', supervisor: null, child: null, sessionId: null, timeoutMinutes: 30, claims: null, reasons: [], allowedPaths: [], resultPath: null, segment: 0, nativeAgentId: null, createdAt: old, updatedAt: old};
  await createLease(f.codexHome, lease);
  const leasePath = path.join(f.codexHome, 'arc-role-dispatch/expired.json');
  const originalLease = await fs.readFile(leasePath, 'utf8');
  const profile = path.join(f.claudeHome, 'agents/arc-routing-planner.md'), originalProfile = await fs.readFile(profile);
  await fs.appendFile(profile, '\nmodified profile\n');
  const deletions = [], unlink = fs.unlink;
  t.mock.method(fs, 'unlink', async filename => {
    if (filename === leasePath) {
      const lock = await fs.stat(path.join(f.codexHome, 'arc-role-platform-routing.lock'));
      deletions.push(lock.isFile());
    }
    return unlink(filename);
  });
  const options = {context: f.context(), now, policy};
  const status = await routing.routingStatus(options);
  const prepared = await routing.prepareRoleDispatch({...options, assignment, expectedRevision: f.revision});
  assert.deepEqual(codes(status), ['activation_unverified']);
  assert.deepEqual(codes(prepared), ['activation_unverified']);
  assert.deepEqual(status.pruned, {removed: 0, errors: 0});
  assert.equal(await fs.readFile(leasePath, 'utf8'), originalLease);
  assert.deepEqual(deletions, []);
  await fs.writeFile(profile, originalProfile);
  const verified = await routing.routingStatus(options);
  assert.equal(verified.decision, 'allow');
  assert.deepEqual(verified.pruned, {removed: 1, errors: 0});
  await assert.rejects(fs.stat(leasePath), {code: 'ENOENT'});
  await createLease(f.codexHome, lease);
  assert.equal((await routing.prepareRoleDispatch({...options, assignment, expectedRevision: f.revision})).decision, 'allow');
  await assert.rejects(fs.stat(leasePath), {code: 'ENOENT'});
  assert.deepEqual(deletions, [true, true]);
});

// Prefix or parent matching would authorize directories outside the registered home.
test('F5 matchRegisteredHome exact match only', () => {
  assert.equal(typeof routing.matchRegisteredHome, 'function');
  const homes = {claude: '/tmp/arc-t2/.claude', zeta: '/tmp/arc-t2/.zeta/'};
  for (const [dir, expected] of [
    ['/tmp/arc-t2/.claude', 'claude'],
    ['/tmp/arc-t2/.claude/', 'claude'],
    ['/tmp/arc-t2/.claude/../.zeta', 'zeta'],
    ['/tmp/arc-t2/.claude/agents', null],
    ['/tmp/arc-t2', null],
    ['/tmp/arc-t2/.claude-other', null],
    ['/tmp/arc-t2/.zeta', 'zeta']
  ]) assert.equal(routing.matchRegisteredHome({dir, homes}), expected, dir);
});

test('F6 symlinked home ancestor rejects runtime lock without changes', async t => {
  const f = await fixture(t), root = path.dirname(f.context.userHome);
  const linkParent = path.join(root, 'linkParent');
  await fs.symlink(f.context.userHome, linkParent);
  const home = path.join(linkParent, '.claude');
  const context = {...f.context, env: {...f.context.env, CLAUDE_CONFIG_DIR: home}};
  const hostMarker = markerPath(f.homes.zeta), marker = JSON.parse(await fs.readFile(hostMarker));
  await fs.writeFile(hostMarker, JSON.stringify({...marker, activeConfigPath: activePath(home)}));
  async function snapshot() {
    const entries = {};
    async function visit(relative) {
      const filename = path.join(root, relative), stat = await fs.lstat(filename);
      if (stat.isSymbolicLink()) entries[relative] = ['link', await fs.readlink(filename)];
      else if (stat.isDirectory()) {
        entries[relative] = ['directory'];
        for (const name of (await fs.readdir(filename)).sort()) await visit(path.join(relative, name));
      } else entries[relative] = ['file', (await fs.readFile(filename)).toString('hex')];
    }
    await visit(''); return entries;
  }
  const before = await snapshot(), writes = [], open = fs.open;
  t.mock.method(fs, 'open', async (filename, flags, ...args) => {
    if (typeof flags === 'string' && /[wa+]/.test(flags)) writes.push(filename);
    return open(filename, flags, ...args);
  });
  await assert.rejects(routing.acquireRoleRoutingLock(home), {message: 'Unsafe symlink path'});
  const result = await routing.routingStatus({context, policy});
  assert.equal(result.decision, 'hold');
  assert.deepEqual(codes(result), ['activation_unverified']);
  assert.deepEqual(writes, []);
  for (const realHome of Object.values(f.homes)) {
    await assert.rejects(fs.lstat(path.join(realHome, 'arc-role-platform-routing.lock')), {code: 'ENOENT'});
  }
  assert.deepEqual(await snapshot(), before);
});
