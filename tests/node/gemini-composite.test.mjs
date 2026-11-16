import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {createPlatformRegistry, DEFAULT_PLATFORM_REGISTRY} from '../../lib/runtime/platform-registry.mjs';
import {createInstallerRegistry, DEFAULT_INSTALLER_REGISTRY} from '../../lib/platforms/index.mjs';
import * as management from '../../lib/management/operations.mjs';
import {resolveTargets} from '../../lib/installer/targets.mjs';
import {publishCompositeFiles} from '../../lib/installer/role-routing.mjs';
import {ROUTING_ROLES} from '../../lib/runtime/role-routing-config.mjs';
import {createLease} from '../../lib/runtime/role-dispatch-store.mjs';
import {loadStaticModelCatalog} from '../../lib/models/static-catalog.mjs';
import {compositeContext} from './fixtures/install-mode.mjs';
import {staticPackageFixture} from './fixtures/static-references.mjs';
import {legacyComposite, legacyLease, homeBytes, activePath, markerPath} from './fixtures/legacy-composite.mjs';

const sets = [['claude', 'gemini'], ['claude', 'codex', 'gemini'], ['codex', 'gemini']];
const ids = ['claude', 'codex', 'gemini'];
function verifiedRegistries() {
  const runtimePlatforms = createPlatformRegistry(DEFAULT_PLATFORM_REGISTRY.platforms.map(descriptor => ({
    ...descriptor,
    ...(descriptor.id === 'gemini' ? {capabilities: {...descriptor.capabilities,
      ...Object.fromEntries(['install', 'nativeProfile', 'catalog', 'standalone', 'bridge', 'compositeRole', 'compositeHost'].map(key => [key, {state: 'verified'}])),
    }} : {}),
  })));
  return {runtimePlatforms, platforms: createInstallerRegistry({runtime: runtimePlatforms,
    descriptors: runtimePlatforms.platforms.map(runtime => ({...DEFAULT_INSTALLER_REGISTRY.getPlatform(runtime.id), runtime})),
  })};
}
async function contextFor(t, {legacy = false} = {}) {
  const context = legacy ? {...await legacyComposite(t, {operational: true}), packageRoot: staticPackageFixture(t)} : await compositeContext(t);
  Object.assign(context, verifiedRegistries());
  context.env.HOME = context.userHome;
  context.env.TMPDIR = process.env.TMPDIR;
  // Only the version command is allowed; auth.kind=none must never invoke a probe.
  fs.writeFileSync(path.join(context.userHome, 'bin/gemini'), '#!/bin/sh\nif [ "$1" = "--version" ]; then echo 0.68.0; else echo unexpected >> "$HOME/gemini-unexpected-command"; exit 1; fi\n', {mode: 0o755});
  return context;
}
async function configFor(context, platforms, revision = 'gemini-composite') {
  const pairs = {};
  for (const id of platforms) pairs[id] = (await loadStaticModelCatalog(id, context)).catalog.pairs[0];
  return {revision, platforms, roles: Object.fromEntries(ROUTING_ROLES.map((role, index) => {
    const platform = platforms[index % platforms.length];
    return [role, {platform, ...pairs[platform]}];
  }))};
}
async function prepare(context, platforms, revision, extra = {}) {
  return management.prepareOperation(context, {kind: 'install', target: 'composite', platforms,
    config: await configFor(context, platforms, revision), ...extra});
}
async function execute(context, prepared) {
  const result = await management.executeOperation(context, prepared);
  assert.equal(result.code, 0, result.error?.stack ?? result.results?.find(item => item.error)?.error?.stack);
  assert.equal(fs.existsSync(path.join(context.userHome, 'gemini-unexpected-command')), false);
  return result;
}
async function publish(context, platforms, revision) {
  const prepared = await prepare(context, platforms, revision);
  return {prepared, result: await execute(context, prepared)};
}
async function installAll(context) {
  await execute(context, await management.prepareOperation(context, {kind: 'install', target: 'all', language: 'en'}));
}
const home = (context, id) => resolveTargets(context).targets[id].home;
const profiles = (context, id) => homeBytes(path.join(home(context, id), 'agents'));
function assertComposite(context, platforms, anchor) {
  assert.deepEqual(management.currentInstallState(context), {mode: 'composite', platforms, anchor});
  const config = JSON.parse(fs.readFileSync(activePath(context, anchor)));
  assert.equal(config.version, 2);
  assert.deepEqual(config.platforms, platforms);
  for (const id of ids) {
    assert.equal(fs.existsSync(activePath(context, id)), id === anchor, id);
    assert.equal(fs.existsSync(markerPath(context, id)), platforms.includes(id), id);
    if (platforms.includes(id)) {
      const marker = JSON.parse(fs.readFileSync(markerPath(context, id)));
      assert.equal(marker.activeConfigPath, activePath(context, anchor));
      assert.equal(marker.platform, id);
      assert.equal(marker.targetHome, home(context, id));
      for (const [role, pair] of Object.entries(config.roles).filter(([, pair]) => pair.platform === id)) {
        const entry = marker.profiles[role];
        assert.ok(entry, role);
        const text = fs.readFileSync(path.join(home(context, id), entry.path), 'utf8');
        assert.ok(text.includes(pair.model), role);
        if (id === 'gemini') assert.doesNotMatch(text, /^effort:/m);
      }
    }
  }
}

for (const platforms of sets) test(`AC-G8 publish ${platforms.join('+')} writes v2 and all home markers`, async t => {
  const context = await contextFor(t);
  const {prepared, result} = await publish(context, platforms);
  assert.equal(result.activation, 'published');
  assert.deepEqual(prepared.warnings, ['gemini:auth_unverified']);
  assertComposite(context, platforms, platforms[0]);
});

test('AC-A5 three-platform publish acquires locks claude then codex then gemini', async t => {
  const context = await contextFor(t), prepared = await prepare(context, ids), locks = [], open = fsp.open;
  t.mock.method(fsp, 'open', async (filename, flags, ...args) => {
    const handle = await open(filename, flags, ...args);
    if (flags === 'wx' && path.basename(String(filename)) === 'arc-role-platform-routing.lock') locks.push(path.basename(path.dirname(filename)).slice(1));
    return handle;
  });
  await execute(context, prepared);
  assert.deepEqual(locks, ['claude', 'codex', 'gemini']);
  for (const id of ids) assert.equal(fs.existsSync(path.join(home(context, id), 'arc-role-platform-routing.lock')), false);
});

test('operational codex+claude publication retains the claude-only lock path', async t => {
  const context = await compositeContext(t), prepared = await prepare(context, ['claude', 'codex']), locks = [], open = fsp.open;
  t.mock.method(fsp, 'open', async (filename, flags, ...args) => {
    const handle = await open(filename, flags, ...args);
    if (flags === 'wx' && path.basename(String(filename)) === 'arc-role-platform-routing.lock') locks.push(path.basename(path.dirname(filename)).slice(1));
    return handle;
  });
  await execute(context, prepared);
  assertComposite(context, ['claude', 'codex'], 'claude');
  assert.deepEqual(locks, ['claude']);
});

for (const platforms of sets) test(`AC-M3 D1-b ${platforms.join('+')} requires confirmation and restores every standalone`, async t => {
  const context = await contextFor(t);
  await installAll(context);
  const standalone = Object.fromEntries(ids.map(id => [id, profiles(context, id)]));
  await publish(context, platforms);
  const before = homeBytes(context.userHome);
  await assert.rejects(management.prepareOperation(context, {kind: 'install', target: 'gemini'}), /Mixed routing is active/);
  assert.deepEqual(homeBytes(context.userHome), before);
  const prepared = await management.prepareOperation(context, {kind: 'install', target: 'gemini', language: 'en', switchFromComposite: true});
  const result = await execute(context, prepared);
  assert.deepEqual(prepared.deactivation.platforms, platforms);
  assert.ok(result.messages.includes('Mixed routing turned off.'));
  assert.deepEqual(management.currentInstallState(context), {mode: 'standalone', platforms: [], anchor: null});
  for (const id of ids) {
    assert.deepEqual(profiles(context, id), standalone[id], id);
    assert.equal(fs.existsSync(activePath(context, id)), false);
    assert.equal(fs.existsSync(markerPath(context, id)), false);
  }
});

test('AC-M5 D1-e adds and removes gemini at the same claude anchor', async t => {
  const context = await contextFor(t);
  await installAll(context);
  const standalone = profiles(context, 'gemini'), skill = homeBytes(path.join(home(context, 'gemini'), 'skills/arc'));
  await publish(context, ['claude', 'codex'], 'pair');
  await publish(context, ids, 'add-gemini');
  assertComposite(context, ids, 'claude');
  await publish(context, ['claude', 'codex'], 'remove-gemini');
  assertComposite(context, ['claude', 'codex'], 'claude');
  assert.deepEqual(profiles(context, 'gemini'), standalone);
  assert.deepEqual(homeBytes(path.join(home(context, 'gemini'), 'skills/arc')), skill);
});

test('AC-M5 anchor move codex+gemini to claude+gemini restores codex and retains history', async t => {
  const context = await contextFor(t);
  await installAll(context);
  const standalone = profiles(context, 'codex');
  await publish(context, ['codex', 'gemini'], 'before-move');
  await createLease(home(context, 'codex'), {...legacyLease('history', 'completed', 'native', 2), hostPlatform: 'gemini', executionEnvironment: 'gemini-cli', targetPlatform: 'gemini'}, context);
  const store = path.join(home(context, 'codex'), 'arc-role-dispatch'), history = homeBytes(store);
  const {result} = await publish(context, ['claude', 'gemini'], 'after-move');
  assertComposite(context, ['claude', 'gemini'], 'claude');
  assert.deepEqual(profiles(context, 'codex'), standalone);
  assert.deepEqual(homeBytes(store), history);
  assert.ok(result.messages.includes(`Dispatch history stays in ${store}.`));
});

for (const id of ['claude', 'codex']) for (const route of ['native', 'bridge']) test(`AC-M8 anchor move holds every non-terminal ${route} lease in ${id} store`, async t => {
  const context = await contextFor(t);
  await installAll(context);
  await publish(context, ['codex', 'gemini'], 'before-move');
  for (const state of ['reserved', 'starting', 'running', 'unknown']) {
    const dispatchId = `${id}-${route}-${state}`;
    await createLease(home(context, id), {...legacyLease(dispatchId, state, route, 2), hostPlatform: 'gemini', executionEnvironment: 'gemini-cli', targetPlatform: route === 'native' ? 'gemini' : 'codex'}, context);
    const prepared = await prepare(context, ['claude', 'gemini'], `held-${dispatchId}`, {settings: {language: 'ko'}});
    const before = homeBytes(context.userHome);
    const result = await management.executeOperation(context, prepared);
    assert.equal(result.code, 1);
    assert.equal(result.activation, 'held');
    assert.deepEqual(result.error?.activeDispatches, [dispatchId]);
    assert.deepEqual(homeBytes(context.userHome), before);
    fs.unlinkSync(path.join(home(context, id), 'arc-role-dispatch', `${dispatchId}.json`));
  }
});

test('AC-G8 legacy pair adds gemini and moves anchor in one routing transaction', async t => {
  const context = await contextFor(t, {legacy: true});
  assert.equal(management.currentInstallState(context).legacyAnchor, true);
  const prepared = await prepare(context, ids, 'legacy-add-gemini'), transactions = [], paths = [], locks = [], open = fsp.open;
  assert.deepEqual(prepared.anchorMove, {from: 'codex', to: 'claude'});
  t.mock.method(fsp, 'open', async (filename, flags, ...args) => {
    const handle = await open(filename, flags, ...args);
    if (flags === 'wx' && path.basename(String(filename)) === 'arc-role-platform-routing.lock') locks.push(path.basename(path.dirname(filename)).slice(1));
    return handle;
  });
  context.hooks = {fault(event) {
    if (event.plan !== prepared.files) return;
    if (event.phase === 'before-prepare') transactions.push(event.plan);
    if (event.phase === 'before-publish') paths.push(event.path);
  }};
  await execute(context, prepared);
  assertComposite(context, ids, 'claude');
  assert.deepEqual(locks, ['claude', 'codex', 'gemini']);
  assert.equal(transactions.length, 1);
  for (const filename of [activePath(context, 'claude'), activePath(context, 'codex'), ...ids.map(id => markerPath(context, id))]) assert.equal(paths.filter(value => value === filename).length, 1, filename);
});

test('AC-G8 legacy add-gemini publication rollback restores the entire legacy routing state', async t => {
  const context = await contextFor(t, {legacy: true});
  await execute(context, await management.prepareOperation(context, {kind: 'install', target: 'gemini', language: 'en'}));
  const prepared = await prepare(context, ids, 'rollback-gemini'), before = homeBytes(context.userHome);
  let injected = false;
  context.hooks = {fault(event) {
    if (event.phase === 'before-publish' && event.path === activePath(context, 'claude')) {
      injected = true;
      throw Error('Injected Gemini migration publication failure');
    }
  }};
  await assert.rejects(publishCompositeFiles({context, prepared: prepared.files}), error => {
    assert.equal(error.rollback, 'restored');
    assert.equal(error.activation, 'held');
    return true;
  });
  assert.equal(injected, true);
  assert.deepEqual(homeBytes(context.userHome), before);
  assert.equal(management.currentInstallState(context).legacyAnchor, true);
});

for (const role of [false, true]) test(`operational gemini-off rejects composite ${role ? 'role' : 'host'} without changing files`, async t => {
  const context = await compositeContext(t);
  context.env.HOME = context.userHome;
  const config = await configFor(context, ['claude', 'codex'], 'operational-off');
  if (role) config.roles.arc_qa = {platform: 'gemini', model: 'gemini-2.5-flash', effort: 'default'};
  else await publish(context, ['claude', 'codex'], 'operational-existing-pair');
  const before = homeBytes(context.userHome);
  await assert.rejects(management.prepareOperation(context, {kind: 'install', target: 'composite', platforms: ids, config}), /Gemini is not available: capability not verified/);
  assert.deepEqual(homeBytes(context.userHome), before);
});
