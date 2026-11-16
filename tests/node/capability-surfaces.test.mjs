import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {createPlatformRegistry, DEFAULT_PLATFORM_REGISTRY} from '../../lib/runtime/platform-registry.mjs';
import {resolveLocalCli, probePlatformAuth} from '../../lib/runtime/local-cli.mjs';
import {platformAvailability} from '../../lib/platforms/availability.mjs';
import {homeStatusLine} from '../../lib/tui/mode.mjs';
import {editHosts, runInstallFlow} from '../../lib/tui/setup.mjs';
import {editRole, selectPlatform} from '../../lib/tui/custom-preset.mjs';
import {diagramRows} from '../../lib/tui/diagram.mjs';
import {runTui} from '../../lib/tui/app.mjs';
import {collectStatus} from '../../lib/management/status.mjs';
import {resolveTargets} from '../../lib/installer/targets.mjs';
import {prepareOperation, prepareCompositeOperation, executeOperation} from '../../lib/management/operations.mjs';
import {authenticate, routingStatus, prepareRoleDispatch} from '../../lib/runtime/role-routing.mjs';
import {ROUTING_ROLES} from '../../lib/runtime/role-routing-config.mjs';
import {ZETA_AUTH_NONE, ZETA_CAPABILITY_OFF, createZetaRegistries} from './fixtures/platforms/zeta.mjs';
import {zetaContext} from './fixtures/platforms/package-root.mjs';
import {homeBytes} from './fixtures/legacy-composite.mjs';
import {safeFs} from './fixtures/install-mode.mjs';

const unknown = {authStatus: 'unknown', reason: 'auth_unverified'};
const state = {selected: 0, columns: 120, rows: 40};
const roles = platform => Object.fromEntries(ROUTING_ROLES.map(role => [role, {platform, model: platform === 'zeta' ? 'zeta-model' : 'sonnet', effort: 'high'}]));
const statusOf = (platform, authentication = platform === 'zeta' ? unknown : {authStatus: 'authenticated'}) => ({platform, state: 'installed', authentication, cliVersion: {version: '1.0.0'}, diagnostics: []});
const catalogOf = platform => ({status: 'ready', catalog: {platform, pairs: [{model: platform === 'zeta' ? 'zeta-model' : 'sonnet', effort: 'high'}]}});
const available = {selectable: true, reason: null, warning: null};
const unavailable = {selectable: false, reason: 'capability_not_verified', warning: null};

function tempContext(t, variant = ZETA_AUTH_NONE) {
  const userHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'arc-surfaces-')));
  t.after(() => fs.rmSync(userHome, {recursive: true, force: true}));
  const bin = path.join(userHome, 'bin'); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'zeta'), '#!/bin/sh\nprintf "zeta 1.0.0\\n"\n', {mode: 0o755});
  return {userHome, cwd: userHome, env: {PATH: bin}, safeFs, ...createZetaRegistries(variant)};
}
async function packageContext(t, variant = ZETA_AUTH_NONE) {
  const ctx = {...await zetaContext(t), ...createZetaRegistries(variant)};
  fs.writeFileSync(path.join(ctx.userHome, 'bin/zeta'), '#!/bin/sh\nprintf "zeta 1.0.0\\n"\n');
  return ctx;
}
const availabilityOf = (registry, statuses) => id => platformAvailability(id, {registry, usage: 'role', status: statuses.find(status => status.platform === id)});

// Each assertion catches a skipped prerequisite or a missing boundary surface branch.
test('prerequisite violation throws and operational descriptors remain valid', () => {
  assert.throws(() => createPlatformRegistry([{...ZETA_AUTH_NONE, capabilities: {install: {state: 'verified'}, nativeProfile: {state: 'verified'}, standalone: {state: 'verified'}}}]), {message: 'zeta capability standalone requires catalog'});
  assert.doesNotThrow(() => createPlatformRegistry(DEFAULT_PLATFORM_REGISTRY.platforms));
  for (const [key, prerequisites] of Object.entries({nativeProfile: ['install'], catalog: ['install'], standalone: ['install', 'nativeProfile', 'catalog'], bridge: ['install', 'catalog'], compositeRole: ['bridge'], compositeHost: ['install', 'nativeProfile']})) {
    for (const prerequisite of prerequisites) {
      const capabilities = Object.fromEntries(['install', 'nativeProfile', 'catalog', ...prerequisites, key].filter(name => name !== prerequisite).map(name => [name, {state: 'verified'}]));
      // Isolate the checked capability so another verified dependency cannot fail first.
      for (const name of Object.keys(capabilities)) if (name !== key && name !== 'install' && prerequisite === 'install') delete capabilities[name];
      assert.throws(() => createPlatformRegistry([{...ZETA_AUTH_NONE, capabilities}]), {message: `zeta capability ${key} requires ${prerequisite}`});
    }
  }
});

test('auth none probe spawns no process', async t => {
  const context = tempContext(t), cli = resolveLocalCli('zeta', context);
  const spawn = t.mock.method(childProcess, 'spawn', () => assert.fail('auth none must not spawn'));
  syncBuiltinESMExports();
  t.after(() => { spawn.mock.restore(); syncBuiltinESMExports(); });
  assert.deepEqual(await probePlatformAuth(cli), unknown);
  assert.equal(spawn.mock.callCount(), 0);
});

test('auth none passes role/host gate with warning; cli missing and out of range block', () => {
  const {platforms: registry} = createZetaRegistries();
  for (const usage of ['role', 'host']) {
    assert.deepEqual(platformAvailability('zeta', {registry, usage, status: statusOf('zeta')}), {selectable: true, reason: null, warning: 'auth_unverified'});
    for (const [status, reason] of [[{...statusOf('zeta'), authentication: {authStatus: 'unknown', reason: 'cli_not_found'}}, 'not_installed'], [{...statusOf('zeta'), cliVersion: {version: '2.0.0'}}, 'unsupported_version']]) {
      assert.deepEqual(platformAvailability('zeta', {registry, usage, status}), {selectable: false, reason, warning: null});
    }
  }
});

test('status line wording follows four conditions with capability off first', () => {
  for (const [variant, status, want] of [
    [ZETA_CAPABILITY_OFF, {...statusOf('zeta'), authentication: {reason: 'cli_not_found'}}, 'Zeta: Not verified'],
    [ZETA_AUTH_NONE, {...statusOf('zeta'), authentication: {reason: 'cli_not_found'}}, 'Zeta: Not Available'],
    [ZETA_AUTH_NONE, {...statusOf('zeta'), cliVersion: {version: '2.0.0'}}, 'Zeta: Unsupported version'],
    [ZETA_AUTH_NONE, statusOf('zeta'), 'Zeta: Available (auth unverified)'],
  ]) assert.equal(homeStatusLine([status], createZetaRegistries(variant).platforms), want);
});

test('status includes auth none and version without an auth subprocess', async t => {
  const ctx = tempContext(t), record = path.join(ctx.userHome, 'commands');
  fs.writeFileSync(path.join(ctx.userHome, 'bin/zeta'), `#!/bin/sh\nprintf '%s\\n' "$*" >> '${record}'\nprintf 'zeta 1.0.0\\n'\n`);
  const statuses = await collectStatus(ctx), zeta = statuses.find(status => status.platform === 'zeta');
  assert.deepEqual(zeta.authentication, unknown);
  assert.deepEqual(zeta.cliVersion, {version: '1.0.0'});
  assert.equal(fs.readFileSync(record, 'utf8'), '--version\n');
});

test('capability off surfaces: platform list is unavailable and cannot select zeta', async () => {
  const registry = createZetaRegistries(ZETA_CAPABILITY_OFF).platforms;
  let calls = 0;
  assert.equal(await selectPlatform({roleName: 'Planner', current: 'zeta', registry, availabilityOf: id => id === 'zeta' ? unavailable : available, ui: {menu: async (_title, rows) => {
    assert.equal(rows[2], 'Zeta - Unavailable  (capability not verified)');
    return calls++ === 0 ? 2 : null;
  }}}), null);
  assert.equal(calls, 2);
});

test('capability off surfaces: Hosts cannot check zeta and editor arrows skip it', async () => {
  const registry = createZetaRegistries(ZETA_CAPABILITY_OFF).platforms, availabilityOf = id => id === 'zeta' ? unavailable : available;
  let calls = 0;
  assert.deepEqual(await editHosts({registry, hosts: [], rolePlatforms: [], availabilityOf, ui: {menu: async (_title, rows) => {
    assert.equal(rows[2], '[ ] Zeta - Unavailable  (capability not verified)');
    return calls++ === 0 ? 2 : 3;
  }}}), []);
  const edited = await editRole({registry, roleName: 'Planner', current: {platform: 'codex', model: 'model-a', effort: 'high'}, availabilityOf, loadCatalog: async platform => ({platform, pairs: [{model: 'model-a', effort: 'high'}]}), defaultsFor: async () => ({model: 'model-a', effort: 'high'}), ui: {menu: async (_title, _rows, options) => {
    options.onHorizontal({...state, direction: 'right'});
    assert.equal(options.renderBody(state).rows[0], 'Platform ‹ Claude ›');
    return 3;
  }}});
  assert.equal(edited.platform, 'claude');
});

test('capability off surfaces: off platform is absent from the normal diagram', async () => {
  const registry = createZetaRegistries(ZETA_CAPABILITY_OFF).platforms;
  await runInstallFlow({registry, statuses: [statusOf('claude'), statusOf('codex'), statusOf('zeta')], draft: {}, installState: {mode: 'standalone', platforms: []}, loadRoleDefaults: async () => Object.fromEntries(ROUTING_ROLES.map(role => [role, {model: 'sonnet', effort: 'high'}])), loadCatalog: async id => catalogOf(id), prepare: () => assert.fail('must not prepare'), ui: {menu: async (_title, _rows, options) => {
    assert.doesNotMatch(options.renderBody(state).rows.join('\n'), /Zeta/);
    return null;
  }}});
});

test('capability off surfaces: uninstall absent zeta is disabled, traces allow removal', async () => {
  for (const installed of [false, true]) {
    const events = ['down', 'down', 'enter', 'down', 'down', 'enter', ...(installed ? ['up', 'enter', 'enter'] : []), 'escape', 'escape'];
    const screens = []; let prepared;
    const session = {viewport: () => ({columns: 120, rows: 40}), render(screen) {screens.push(screen); return {selectionEnabled: true};}, nextEvent: async () => ({name: events.shift() ?? 'escape'}), discardInput() {}, setBusy() {}, dispose() {}};
    await runTui({session, context: createZetaRegistries(ZETA_CAPABILITY_OFF), services: {collectStatus: async () => [{platform: 'zeta', state: installed ? 'incomplete' : 'absent', diagnostics: []}], currentInstallState: () => ({mode: 'standalone', platforms: []}), prepareOperation: async (_ctx, options) => {prepared = options; return {kind: 'uninstall'};}, executeOperation: async () => ({code: 0, results: []})}});
    assert.ok(screens.some(screen => screen.title === 'Uninstall' && screen.rows.includes(installed ? 'Zeta' : 'Zeta  (not installed)')));
    assert.equal(prepared?.target, installed ? 'zeta' : undefined);
  }
});

test('capability off surfaces: direct management target refuses without file changes', async t => {
  const ctx = await packageContext(t, ZETA_CAPABILITY_OFF), before = homeBytes(ctx.userHome);
  await assert.rejects(prepareOperation(ctx, {kind: 'install', target: 'zeta'}), {message: 'Zeta is not available: capability not verified'});
  assert.deepEqual(homeBytes(ctx.userHome), before);
});

test('capability off surfaces: composite zeta refuses without file changes', async t => {
  const ctx = await packageContext(t, ZETA_CAPABILITY_OFF);
  fs.writeFileSync(path.join(ctx.userHome, 'bin/zeta'), '#!/bin/sh\nprintf probed > "$ZETA_HOME-probed"\nprintf "zeta 1.0.0\\n"\n');
  const before = homeBytes(ctx.userHome);
  await assert.rejects(prepareCompositeOperation(ctx, {kind: 'install', platforms: ['claude', 'zeta'], config: {revision: 'off', roles: roles('zeta')}}), /capability not verified/);
  assert.deepEqual(homeBytes(ctx.userHome), before);
});

for (const [name, variant, expected] of [['verified', ZETA_AUTH_NONE, ['claude', 'codex', 'zeta']], ['off', ZETA_CAPABILITY_OFF, ['claude', 'codex']], ['standalone off', {...ZETA_AUTH_NONE, capabilities: {...ZETA_AUTH_NONE.capabilities, standalone: {state: 'off'}}}, ['claude', 'codex']]]) {
  test(`all includes verified install+standalone only: ${name}`, async t => {
    const ctx = await packageContext(t, variant), prepared = await prepareOperation(ctx, {kind: 'install', target: 'all'});
    assert.deepEqual(prepared.plans.map(plan => plan.target.platform), expected);
    if (expected.includes('zeta')) assert.deepEqual(prepared.warnings, ['zeta:auth_unverified']);
    else assert.equal(Object.hasOwn(prepared, 'warnings'), false);
  });
}

test('runtime auth none reports unverified instead of authenticated', async t => {
  const context = tempContext(t);
  assert.deepEqual((await authenticate('zeta', context, {probeTimeoutMs: 1000})).authentication, unknown);
});

test('auth none composite prepare warnings and routingStatus authentication are exact', async t => {
  const ctx = await packageContext(t), config = {revision: 'auth-none', roles: roles('zeta')};
  const prepared = await prepareCompositeOperation(ctx, {kind: 'install', platforms: ['claude', 'zeta'], config});
  assert.deepEqual(prepared.warnings, ['zeta:auth_unverified']);
  const result = await executeOperation(ctx, prepared); assert.equal(result.code, 0, result.error?.stack);
  const context = {...ctx, hostPlatform: 'zeta', executionEnvironment: 'zeta-cli', workflowId: 't9'};
  const status = await routingStatus({context});
  assert.equal(status.decision, 'allow', JSON.stringify(status));
  assert.deepEqual(status.platforms.zeta.authentication, unknown);
  const dispatch = await prepareRoleDispatch({context, expectedRevision: 'auth-none', assignment: {role: 'arc_planner', taskId: 'T9', requestId: 'T9-1'}});
  assert.equal(dispatch.decision, 'allow', JSON.stringify(dispatch));
  const held = await prepareRoleDispatch({context: {...context, ...createZetaRegistries(ZETA_CAPABILITY_OFF)}, expectedRevision: 'auth-none', assignment: {role: 'arc_planner', taskId: 'T9-off', requestId: 'T9-off'}});
  assert.equal(held.decision, 'hold');
  assert.deepEqual(held.reasons.map(reason => reason.code), ['capability_not_verified']);
});

for (const problem of ['missing', 'out of range']) test(`auth none management composite blocks ${problem} CLI without writes`, async t => {
  const ctx = await packageContext(t), executable = path.join(ctx.userHome, 'bin/zeta');
  if (problem === 'missing') fs.unlinkSync(executable);
  else fs.writeFileSync(executable, '#!/bin/sh\nprintf "zeta 2.0.0\\n"\n');
  const before = homeBytes(ctx.userHome);
  for (const platform of ['claude', 'zeta']) await assert.rejects(prepareCompositeOperation(ctx, {kind: 'install', platforms: ['claude', 'zeta'], config: {revision: 'blocked', roles: roles(platform)}}), /zeta: (Not Available|Incomplete)/);
  assert.deepEqual(homeBytes(ctx.userHome), before);
});

test('operational status and home wording remain unchanged with an off injected platform', async t => {
  const ctx = await packageContext(t, ZETA_CAPABILITY_OFF);
  const injected = await collectStatus(ctx);
  const ordinary = await collectStatus({...ctx, platforms: undefined, runtimePlatforms: undefined});
  assert.deepEqual([...injected.filter(status => status.platform !== 'zeta'), {
    platform: 'gemini', target: resolveTargets({...ctx, platforms: undefined, runtimePlatforms: undefined}).targets.gemini,
    state: 'absent', diagnostics: [], residualPaths: [],
    authentication: {authStatus: 'unknown', reason: 'auth_unverified'},
    cliVersion: {version: null, reason: 'cli_not_found'},
  }], ordinary);
  assert.equal(homeStatusLine(ordinary), 'Claude: Not Available / Codex: Not Available / Gemini: Not verified');
  for (const [authStatus, expected] of [['authenticated', 'Claude: Available / Codex: Available'], ['unauthorized', 'Claude: Unauthorized / Codex: Unauthorized'], ['unknown', 'Claude: Incomplete / Codex: Incomplete']]) {
    assert.equal(homeStatusLine(['claude', 'codex'].map(id => statusOf(id, {authStatus}))), expected);
  }
  const prepared = await prepareOperation(ctx, {kind: 'install', target: 'all'});
  assert.deepEqual(Object.keys(prepared).sort(), ['kind', 'options', 'plans']);
  assert.deepEqual(prepared.options, {kind: 'install', target: 'all'});
});

test('auth unverified info line appears in platform picker and role editor', async () => {
  const registry = createZetaRegistries().platforms, statuses = ['claude', 'codex', 'zeta'].map(id => statusOf(id)), availability = availabilityOf(registry, statuses);
  const expected = ['Zeta: auth unverified — ARC cannot confirm Zeta CLI login.'];
  await selectPlatform({registry, roleName: 'Planner', current: 'zeta', availabilityOf: availability, ui: {menu: async (_title, _rows, options) => {
    assert.deepEqual(options.info({...state, selected: 2}), expected); return null;
  }}});
  await editRole({registry, roleName: 'Planner', current: {platform: 'zeta', model: 'zeta-model', effort: 'high'}, availabilityOf: availability, loadCatalog: async platform => catalogOf(platform), defaultsFor: async () => ({model: 'sonnet', effort: 'high'}), ui: {menu: async (_title, _rows, options) => {
    assert.deepEqual(options.info(state), expected);
    assert.ok(options.renderBody(state).rows.includes(expected[0])); return 3;
  }}});
});

test('Hosts shows auth unverified and reason line appears only when no block', async () => {
  const registry = createZetaRegistries().platforms, statuses = ['claude', 'codex', 'zeta'].map(id => statusOf(id));
  await editHosts({registry, hosts: ['zeta'], rolePlatforms: [], availabilityOf: availabilityOf(registry, statuses), ui: {menu: async (_title, rows) => {assert.equal(rows[2], '[x] Zeta (auth unverified)'); return null;}}});
  for (const blocked of [false, true]) {
    const saved = statuses.map(status => blocked && status.platform === 'claude' ? {...status, authentication: {authStatus: 'unauthorized'}} : status);
    await runInstallFlow({registry, statuses: saved, draft: {roles: roles('zeta'), hosts: ['claude', 'zeta']}, installState: {mode: 'standalone', platforms: []}, loadRoleDefaults: async () => ({}), loadCatalog: async id => catalogOf(id), prepare: () => assert.fail('must not prepare'), ui: {menu: async (_title, _rows, options) => {
      if (blocked) {assert.ok(options.info.some(row => row.startsWith('! Hosts: Claude'))); assert.ok(!options.info.includes('Zeta: auth unverified'));}
      else assert.ok(options.info.includes('Zeta: auth unverified'));
      return null;
    }}});
  }
});

test('effort row fixed for single-effort platform after both arrow keys and diagram', async () => {
  const registry = createZetaRegistries().platforms;
  const value = await editRole({registry, roleName: 'Planner', current: {platform: 'zeta', model: 'zeta-model', effort: 'default'}, availabilityOf: id => id === 'zeta' ? available : unavailable, loadCatalog: async () => ({pairs: [{model: 'zeta-model', effort: 'default'}]}), defaultsFor: async () => ({model: 'zeta-model', effort: 'default'}), ui: {menu: async (_title, _rows, options) => {
    for (const direction of ['left', 'right']) {options.onHorizontal({...state, selected: 2, direction}); assert.equal(options.renderBody({...state, selected: 2}).rows[2], 'Effort ‹ default ›');}
    return 3;
  }}});
  assert.equal(value.effort, 'default');
  assert.match(diagramRows(ROUTING_ROLES.map(role => ({role, ...value})), {registry, columns: 180, rows: 50}).rows.join('\n'), /effort: default/);
});
