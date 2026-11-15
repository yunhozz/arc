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
