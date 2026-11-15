import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CAPABILITY_KEYS, createPlatformRegistry, DEFAULT_PLATFORM_REGISTRY, RUNTIME_PLATFORMS,
  platformIds, getPlatform, byDisplayOrder, byAnchorOrder, isPlatformId,
  runtimeRegistryOf, standaloneProfileFile, routingProfileFile,
} from '../../lib/runtime/platform-registry.mjs';
import {resolveConfigHome, resolveLocalCli, localCliEnvironment} from '../../lib/runtime/local-cli.mjs';
import {ZETA_RUNTIME, createTestRuntimeRegistry} from './fixtures/platforms/zeta.mjs';

test('runtime registry exposes codex and claude with spec values', () => {
  assert.deepEqual(CAPABILITY_KEYS, ['install', 'standalone', 'compositeRole', 'compositeHost', 'bridge', 'nativeProfile', 'authProbe', 'catalog', 'watch']);
  assert.deepEqual(platformIds(), ['codex', 'claude']);
  assert.deepEqual(byDisplayOrder().map(p => p.id), ['claude', 'codex']);
  assert.deepEqual(byAnchorOrder().map(p => p.id), ['codex', 'claude']);
  assert.equal(RUNTIME_PLATFORMS, DEFAULT_PLATFORM_REGISTRY.platforms);
  assert.equal(runtimeRegistryOf(), DEFAULT_PLATFORM_REGISTRY);
  assert.equal(getPlatform('zeta'), null);
  for (const value of ['eta', null, 1, {}, 'toString']) assert.equal(isPlatformId(value), false);
  for (const [id, label, displayOrder, anchorOrder, homeEnv, authKind, ext, standaloneName, routingName, environments] of [
    ['codex', 'Codex', 1, 0, 'CODEX_HOME', 'codex-refresh', 'toml', 'arc_planner', 'arc_routing_planner', ['codex-cli', 'codex-desktop']],
    ['claude', 'Claude', 0, 1, 'CLAUDE_CONFIG_DIR', 'cli-status-json', 'md', 'arc-planner', 'arc-routing-planner', ['claude-cli', 'claude-desktop']],
  ]) {
    const p = getPlatform(id);
    assert.equal(isPlatformId(id), true);
    assert.equal(p.label, label); assert.equal(p.displayOrder, displayOrder); assert.equal(p.anchorOrder, anchorOrder);
    assert.equal(p.home.env, homeEnv); assert.equal(p.auth.kind, authKind);
    assert.equal(p.cli.command, id); assert.equal(p.cli.supportedVersions, null);
    assert.equal(p.profile.ext, ext);
    assert.equal(p.profile.standaloneName('arc_planner'), standaloneName);
    assert.equal(p.profile.routingName('arc_planner'), routingName);
    assert.equal(standaloneProfileFile(p, 'arc_planner'), `arc-planner.${ext}`);
    assert.equal(routingProfileFile(p, 'arc_planner'), `arc-routing-planner.${ext}`);
    assert.deepEqual(p.executionEnvironments, environments);
    for (const key of CAPABILITY_KEYS) assert.deepEqual(p.capabilities[key], {state: 'verified'});
  }
});

test('createPlatformRegistry defaults capabilities to off and rejects duplicates', () => {
  const input = {...ZETA_RUNTIME, capabilities: {install: {state: 'verified'}}};
  const registry = createPlatformRegistry([input]);
  const zeta = registry.getPlatform('zeta');
  assert.deepEqual(zeta.capabilities.install, {state: 'verified'});
  for (const key of CAPABILITY_KEYS.slice(1)) assert.deepEqual(zeta.capabilities[key], {state: 'off'});
  input.capabilities.install.state = 'off';
  assert.equal(zeta.capabilities.install.state, 'verified');
  for (const value of [CAPABILITY_KEYS, registry, registry.platforms, registry.platformIds(), registry.byDisplayOrder(), registry.byAnchorOrder(), zeta, zeta.home, zeta.cli, zeta.auth, zeta.profile, zeta.routing, zeta.executionEnvironments, zeta.capabilities, zeta.capabilities.watch]) assert.equal(Object.isFrozen(value), true);
  assert.throws(() => { zeta.capabilities.watch.state = 'verified'; }, TypeError);
  for (const duplicate of [
    {...ZETA_RUNTIME, anchorOrder: 4, displayOrder: 4},
    {...ZETA_RUNTIME, id: 'other', displayOrder: 4},
    {...ZETA_RUNTIME, id: 'other', anchorOrder: 4},
  ]) assert.throws(() => createPlatformRegistry([ZETA_RUNTIME, duplicate]), Error);
  assert.deepEqual(createPlatformRegistry([]).platformIds(), []);
});

test('validatePair keeps current rules', () => {
  const codex = getPlatform('codex').routing.validatePair, claude = getPlatform('claude').routing.validatePair;
  assert.equal(codex('gpt-5.5', 'anything'), true);
  for (const [model, effort] of [['', 'x'], [' gpt', 'high'], ['gpt', ''], ['gpt', ' high'], ['gpt\n', 'high'], ['gpt', 'hi\u2028gh'], [null, 'high']]) assert.equal(codex(model, effort), false);
  for (const effort of ['low', 'medium', 'high', 'xhigh', 'max']) assert.equal(claude('opus', effort), true);
  assert.equal(claude('provider/model:v1@alias+test-1.0', 'max'), true);
  for (const [model, effort] of [['opus', 'minimal'], ['opus', 'MAX'], ['-opus', 'high'], ['op us', 'high'], ['opus', ''], ['', 'high']]) assert.equal(claude(model, effort), false);
});

test('test registry orders zeta after claude', () => {
  const registry = createTestRuntimeRegistry();
  assert.deepEqual(registry.platformIds(), ['codex', 'claude', 'zeta']);
  assert.deepEqual(registry.byDisplayOrder().map(p => p.id), ['claude', 'codex', 'zeta']);
  assert.deepEqual(createTestRuntimeRegistry(['zeta', 'claude', 'codex']).platformIds(), ['codex', 'claude', 'zeta']);
  assert.equal(runtimeRegistryOf({runtimePlatforms: registry}), registry);
  const zeta = registry.getPlatform('zeta');
  assert.deepEqual(zeta.capabilities.watch, {state: 'off'});
  for (const key of CAPABILITY_KEYS.slice(0, -1)) assert.deepEqual(zeta.capabilities[key], {state: 'verified'});
  const eta = createTestRuntimeRegistry(['eta']).getPlatform('eta');
  for (const key of CAPABILITY_KEYS) assert.deepEqual(eta.capabilities[key], {state: 'off'});
});

test('resolveConfigHome delegates without behavior change', () => {
  const context = {userHome: '/users/test', cwd: '/work', env: {}};
  assert.equal(resolveConfigHome('codex', context), '/users/test/.codex');
  assert.equal(resolveConfigHome('claude', context), '/users/test/.claude');
  for (const [value, want] of [['relative', '/work/relative'], ['~/custom', '/users/test/custom'], ['/custom', '/custom']]) assert.equal(resolveConfigHome('codex', {...context, env: {CODEX_HOME: value}}), want);
  assert.equal(resolveConfigHome('claude', {...context, env: {CLAUDE_CONFIG_DIR: '~/.claude'}}), '/users/test/.claude');
  for (const value of ['', 'relative', '/custom']) assert.throws(() => resolveConfigHome('claude', {...context, env: {CLAUDE_CONFIG_DIR: value}}), {message: 'CLAUDE_CONFIG_DIR must select the default ~/.claude directory'});
  for (const value of ['', 'relative', undefined]) assert.throws(() => resolveConfigHome('codex', {...context, userHome: value}), {message: 'userHome must be an absolute user directory'});
  assert.throws(() => resolveConfigHome('codex', {...context, env: null}), {message: 'env must be an environment object'});
  assert.throws(() => resolveConfigHome('codex', {...context, env: {CODEX_HOME: ''}}), {message: 'CODEX_HOME is empty or invalid'});
  assert.throws(() => resolveConfigHome('codex', {...context, cwd: 'relative', env: {CODEX_HOME: 'relative'}}), {message: 'cwd must be absolute for relative CODEX_HOME'});
  for (const value of ['/', '/users/test']) assert.throws(() => resolveConfigHome('codex', {...context, env: {CODEX_HOME: value}}), {message: 'Target home must not be the filesystem or user-home root'});
  assert.throws(() => resolveConfigHome('zeta', context), {message: 'Target must be codex or claude'});
  assert.equal(resolveConfigHome('zeta', {...context, runtimePlatforms: createTestRuntimeRegistry(), env: {ZETA_HOME: '/zeta'}}), '/zeta');
});

test('resolveLocalCli uses registry for ids', t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'arc-registry-')));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const runtimePlatforms = createTestRuntimeRegistry();
  const options = {cwd: root, userHome: root, env: {PATH: root}, runtimePlatforms};
  assert.equal(resolveLocalCli('zeta', options).reason, 'cli_not_found');
  assert.equal(resolveLocalCli('eta', options).reason, 'unsupported_platform');
  assert.equal(resolveLocalCli('zeta', {...options, runtimePlatforms: undefined}).reason, 'unsupported_platform');
  fs.writeFileSync(path.join(root, 'zeta-command'), '#!/bin/sh\nexit 0\n', {mode: 0o700});
  const custom = createPlatformRegistry([{...ZETA_RUNTIME, cli: {command: 'zeta-command', supportedVersions: null}}]);
  const context = resolveLocalCli('zeta', {...options, runtimePlatforms: custom, env: {PATH: root, ZETA_HOME: path.join(root, 'custom')}});
  assert.equal(context.reason, undefined);
  assert.equal(context.executable, path.join(root, 'zeta-command'));
  assert.equal(context.configHome, path.join(root, 'custom'));
  assert.deepEqual(localCliEnvironment(context), {PATH: root, ZETA_HOME: path.join(root, 'custom')});
});

test('runtime registry imports only runtime-local modules', () => {
  const source = fs.readFileSync(new URL('../../lib/runtime/platform-registry.mjs', import.meta.url), 'utf8');
  for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)['"]([^'"]+)['"]/g)) assert.match(match[1], /^(?:\.\/|node:)/);
});

// Task 2: wrong registry order/reference, display sorting and format extraction regressions.
const installer = await import('../../lib/platforms/index.mjs').catch(() => ({}));
const fixtureRegistries = await import('./fixtures/platforms/zeta.mjs');

test('installer and runtime registries agree and reject mismatches', () => {
  assert.equal(typeof installer.createInstallerRegistry, 'function');
  const registry = installer.DEFAULT_INSTALLER_REGISTRY;
  assert.deepEqual(registry.platformIds(), ['codex', 'claude']);
  assert.deepEqual(registry.byAnchorOrder().map(p => p.runtime.id), ['codex', 'claude']);
  assert.deepEqual(registry.byDisplayOrder().map(p => p.runtime.id), ['claude', 'codex']);
  for (const id of registry.platformIds()) assert.equal(registry.getPlatform(id).runtime, getPlatform(id));
  assert.equal(registry.getPlatform('missing'), null);
  assert.equal(registry.isPlatformId('toString'), false);
  assert.equal(installer.installerRegistryOf(), registry);
  const descriptors = [...registry.platforms];
  for (const invalid of [descriptors.toReversed(), descriptors.slice(1), [...descriptors, descriptors[0]], [{...descriptors[0], runtime: {...getPlatform('codex')}}, descriptors[1]]]) {
    assert.throws(() => installer.createInstallerRegistry({runtime: DEFAULT_PLATFORM_REGISTRY, descriptors: invalid}));
  }
  const injected = fixtureRegistries.createTestRegistries(['eta', 'zeta', 'claude', 'codex']);
  assert.deepEqual(injected.platforms.platformIds(), ['codex', 'claude', 'zeta', 'eta']);
  for (const id of injected.runtimePlatforms.platformIds()) assert.equal(injected.platforms.getPlatform(id).runtime, injected.runtimePlatforms.getPlatform(id));
  assert.equal(installer.installerRegistryOf(injected), injected.platforms);
});

test('mixedLabel and sort helpers use runtime display and anchor order', () => {
  assert.equal(typeof installer.mixedLabel, 'function');
  assert.equal(installer.mixedLabel(['codex', 'claude']), 'Mixed (Claude + Codex)');
  const {platforms} = fixtureRegistries.createTestRegistries();
  const ids = ['zeta', 'codex', 'claude'];
  assert.deepEqual(installer.sortByDisplay(ids, platforms), ['claude', 'codex', 'zeta']);
  assert.deepEqual(installer.sortByAnchor(ids, platforms), ['codex', 'claude', 'zeta']);
  assert.deepEqual(ids, ['zeta', 'codex', 'claude']);
  assert.equal(installer.platformLabel('zeta', platforms), 'Zeta');
});

test('installer descriptors expose format and leaf-module behavior', async () => {
  assert.ok(installer.DEFAULT_INSTALLER_REGISTRY);
  const {renameCompositeProfile} = await import('../../lib/installer/role-routing.mjs');
  const {isOwnedStandaloneProfile} = await import('../../lib/installer/install-mode.mjs');
  const {renderProfiles} = await import('../../lib/models/profiles.mjs');
  const {loadModelConfig, resolveModelSettings} = await import('../../lib/models/index.mjs');
  for (const [id, ext, instruction, config, field] of [['codex', 'toml', 'AGENTS.md', 'config.toml', 'model_reasoning_effort'], ['claude', 'md', 'CLAUDE.md', 'settings.json', 'effort']]) {
    const p = installer.DEFAULT_INSTALLER_REGISTRY.getPlatform(id);
    assert.equal(p.payloadPrefix, id); assert.equal(p.instructionFile, instruction); assert.equal(p.runtimeConfigFile, config);
    assert.deepEqual(p.globalPaths, [instruction, config]); assert.equal(p.models.effortField, field);
    assert.equal(JSON.parse(fs.readFileSync(p.models.staticCatalog, 'utf8')).platform, id);
    assert.equal(typeof p.models.discover, 'function');
    const settings = resolveModelSettings(loadModelConfig(fs.readFileSync(new URL(`../../${id}/skill/models.toml`, import.meta.url)), id));
    const inputs = Object.fromEntries(Object.keys(settings.roles).map(role => [`${role.replace('_', '-')}.${ext}`, fs.readFileSync(new URL(`../../${id}/agents/${role.replace('_', '-')}.${ext}`, import.meta.url))]));
    for (const eol of ['\n', '\r\n']) {
      const normalized = Object.fromEntries(Object.entries(inputs).map(([name, bytes]) => [name, Buffer.from(bytes.toString().replace(/\r?\n/g, eol))]));
      const rendered = renderProfiles(normalized, settings);
      for (const [role, setting] of Object.entries(settings.roles)) {
        const name = `${role.replace('_', '-')}.${ext}`, bytes = normalized[name];
        assert.deepEqual(p.profiles.render(bytes.toString(), role, setting), rendered.get(name));
        assert.equal(p.profiles.isOwnedStandalone(bytes, role), true);
        assert.equal(p.profiles.isOwnedStandalone(Buffer.from(bytes.toString().replace('[ARC role policy: contract begin]', '')), role), false);
      }
    }
    const source = id === 'codex' ? 'name = "arc_planner" # keep\r\ndescription = "Plan" # note\r\ndeveloper_instructions = "body"\r\n' : '---\r\nname: arc-planner\r\ndescription: Plan\r\n---\r\nbody\r\n';
    const expected = id === 'codex' ? 'name = "arc_routing_planner" # keep\r\ndescription = "Plan [arc-routing rev rev-1]" # note\r\ndeveloper_instructions = "body"\r\n' : '---\r\nname: arc-routing-planner\r\ndescription: Plan [arc-routing rev rev-1]\r\n---\r\nbody\r\n';
    assert.deepEqual(p.profiles.renameForRouting(Buffer.from(source), 'arc_planner', 'rev-1'), Buffer.from(expected));
    assert.deepEqual(renameCompositeProfile(Buffer.from(source), id, 'arc_planner', 'rev-1'), Buffer.from(expected));
    assert.throws(() => p.profiles.renameForRouting(Buffer.from(source), 'arc_planner', 'bad revision'), {name: 'TargetConfigurationError', message: 'Composite revision cannot be tagged'});
    assert.throws(() => p.profiles.renameForRouting(Buffer.from(source.replace('description', 'other')), 'arc_planner', 'rev-1'), {name: 'TargetConfigurationError', message: 'Composite revision cannot be tagged'});
    assert.equal(p.runtimeConfig.readConcurrency(null), null);
    const out = p.runtimeConfig.renderConcurrency(null, 3);
    assert.equal(p.runtimeConfig.readConcurrency(out.content), 3);
    assert.deepEqual(p.runtimeConfig.renderConcurrency(out.content, 3), {content: out.content, action: 'unchanged'});
    assert.equal(p.runtimeConfig.extraRender === null, id === 'claude');
    assert.deepEqual(p.isolationEnv('/work'), id === 'codex' ? {CODEX_HOME: '/work/codex-runtime'} : {});
  }
  assert.equal(isOwnedStandaloneProfile(Buffer.from(''), 'missing', 'arc_planner'), false);
  const zeta = fixtureRegistries.createTestRegistries().platforms.getPlatform('zeta');
  assert.equal(zeta.models.discover, null);
  assert.deepEqual(JSON.parse(fs.readFileSync(zeta.models.staticCatalog, 'utf8')), {platform: 'zeta', pairs: [{model: 'zeta-model', effort: 'high'}]});
});

test('format and leaf modules do not import lib/platforms', () => {
  const files = ['lib/models/profiles.mjs', 'lib/models/codex-catalog.mjs', 'lib/models/catalog-anthropic.mjs', 'lib/installer/runtime-config.mjs', 'lib/installer/global-config.mjs', 'lib/platforms/formats/toml.mjs', 'lib/platforms/formats/markdown.mjs'];
  for (const filename of files) {
    assert.equal(fs.existsSync(new URL('../../' + filename, import.meta.url)), true, filename);
    const source = fs.readFileSync(new URL('../../' + filename, import.meta.url), 'utf8');
    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)['"]([^'"]+)['"]/g)) {
      if (match[1].startsWith('node:')) continue;
      const resolved = new URL(match[1], new URL('../../' + filename, import.meta.url));
      assert.equal(resolved.pathname.includes('/lib/platforms/'), false, `${filename}: ${match[1]}`);
    }
  }
});

test('effortField comes from runtime registry', async () => {
  const {effortField, platformOf} = await import('../../lib/models/config.mjs');
  for (const [id, field] of [['codex', 'model_reasoning_effort'], ['claude', 'effort']]) {
    assert.equal(getPlatform(id).models?.effortField, field);
    assert.equal(installer.DEFAULT_INSTALLER_REGISTRY.getPlatform(id).models.effortField, getPlatform(id).models.effortField);
    assert.equal(effortField(id), field);
    assert.equal(platformOf({platform: id, version: 3}), id);
  }
  const injected = fixtureRegistries.createTestRegistries(['codex', 'claude', 'zeta', 'eta']);
  for (const id of ['zeta', 'eta']) {
    assert.equal(injected.runtimePlatforms.getPlatform(id).models?.effortField, 'effort');
    assert.equal(injected.platforms.getPlatform(id).models.effortField, injected.runtimePlatforms.getPlatform(id).models.effortField);
  }
  assert.throws(() => effortField('missing'), {message: 'Unknown model platform'});
  assert.throws(() => platformOf({platform: 'missing', version: 3}), {message: 'Unsupported model schema version'});
  const visited = new Set();
  function walk(url) {
    if (visited.has(url.href)) return;
    visited.add(url.href);
    const source = fs.readFileSync(url, 'utf8');
    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)['"]([^'"]+)['"]/g)) {
      if (!match[1].startsWith('.')) continue;
      const dependency = new URL(match[1], url);
      assert.equal(dependency.pathname.includes('/lib/platforms/'), false, `${url.pathname}: ${match[1]}`);
      if (/\.(?:mjs|js)$/.test(dependency.pathname)) walk(dependency);
    }
  }
  walk(new URL('../../lib/models/config.mjs', import.meta.url));
});

test('bridge implementations cover every bridge-verified platform', async () => {
  const bridge = await import('../../lib/runtime/role-bridge-args.mjs');
  const supervisor = await import('../../lib/runtime/role-supervisor.mjs');
  for (const ids of [bridge.BRIDGE_PLATFORM_IDS, supervisor.SUPERVISOR_PLATFORM_IDS]) {
    assert.ok(Array.isArray(ids), 'bridge implementation ids are exported');
    assert.equal(Object.isFrozen(ids), true);
    for (const platform of RUNTIME_PLATFORMS.filter(p => p.capabilities.bridge.state === 'verified')) assert.ok(ids.includes(platform.id), platform.id);
  }
  assert.throws(() => bridge.parseCompositeProfile('eta', ''), {message: 'Invalid composite profile: unknown platform'});
  assert.throws(() => bridge.buildBridgeArgs('eta', {}), {message: 'Invalid composite profile: unknown platform'});
});

test('lease hostPlatform accepts only registered ids', async () => {
  const {validateLease} = await import('../../lib/runtime/role-dispatch-store.mjs');
  const lease = {
    version: 1, dispatchId: 'd1', workflowId: 'wf-1', taskId: 'T1', requestId: 'req-d1', role: 'arc_qa', route: 'bridge',
    hostPlatform: 'codex', executionEnvironment: 'codex-cli', revision: 'rev-1', profileHash: null, argsDigest: null,
    state: 'reserved', supervisor: null, child: null, sessionId: null, timeoutMinutes: 30, claims: null, reasons: [],
    allowedPaths: [], resultPath: null, segment: 0, nativeAgentId: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };
  assert.equal(validateLease(lease).hostPlatform, 'codex');
  assert.throws(() => validateLease({...lease, hostPlatform: 'eta'}), {message: 'Invalid lease values'});
});

test('environmentOf uses registry environments', async () => {
  const {routingStatus} = await import('../../lib/runtime/role-routing.mjs');
  const mismatch = await routingStatus({context: {hostPlatform: 'codex', executionEnvironment: 'claude-cli'}});
  assert.equal(mismatch.decision, 'deny');
  const runtimePlatforms = createPlatformRegistry([{...getPlatform('codex'), executionEnvironments: ['custom-cli']}]);
  const accepted = await routingStatus({context: {hostPlatform: 'codex', executionEnvironment: 'custom-cli', runtimePlatforms}});
  assert.equal(accepted.executionEnvironment, 'custom-cli');
  assert.equal(accepted.decision, 'hold');
  const removed = await routingStatus({context: {hostPlatform: 'codex', executionEnvironment: 'codex-cli', runtimePlatforms}});
  assert.equal(removed.decision, 'deny');
  const injected = await routingStatus({context: {hostPlatform: 'eta', executionEnvironment: 'zeta-cli', runtimePlatforms: createTestRuntimeRegistry(['eta'])}});
  assert.equal(injected.hostPlatform, 'eta');
  assert.equal(injected.executionEnvironment, 'zeta-cli');
  assert.equal(injected.decision, 'hold');
});
