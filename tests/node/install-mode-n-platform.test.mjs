import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readInstallMode} from '../../lib/installer/install-mode.mjs';
import {resolveTargets} from '../../lib/installer/targets.mjs';
import {verifyPayload} from '../../lib/installer/manifest.mjs';
import {collectInstalledState} from '../../lib/installer/upgrade-state.mjs';
import {inspectCompositeRemoval} from '../../lib/installer/role-routing.mjs';
import {compositeContext, standalone, publish, targets, safeFs} from './fixtures/install-mode.mjs';
import {staticPackageFixture} from './fixtures/static-references.mjs';
import {createTestRegistries} from './fixtures/platforms/zeta.mjs';
import {zetaPackageFixture, zetaContext, installAll} from './fixtures/platforms/package-root.mjs';
import {prepareCompositeFiles, publishCompositeFiles, prepareCompositeDeactivation, publishCompositeDeactivation, readCompositeRoutingConfig} from '../../lib/installer/role-routing.mjs';
import {ROUTING_ROLES, buildRoleRoutingConfig} from '../../lib/runtime/role-routing-config.mjs';
import {acquireRoleRoutingLock} from '../../lib/runtime/role-routing.mjs';
import {loadModelConfig} from '../../lib/models/index.mjs';
import {renderStandaloneProfiles} from '../../lib/installer/plan.mjs';
import {mixedConfig} from './fixtures/install-mode.mjs';
import {collectStatus} from '../../lib/management/status.mjs';
import {buildUpgradePlans, upgradeInstalledTargets} from '../../lib/installer/upgrade.mjs';
import {prepareUpdate, runChild} from '../../lib/management/update.mjs';

async function composite(t) {
  const ctx = await compositeContext(t);
  await standalone(ctx);
  assert.equal((await publish(ctx)).code, 0);
  return ctx;
}
const active = (ctx, id) => path.join(resolveTargets(ctx).targets[id].home, 'arc-role-platform-routing.json');
const state = ctx => readInstallMode({...ctx, ...resolveTargets(ctx)});

test('existing codex+claude composite fixture stays composite', async t => {
  const result = state(await composite(t));
  assert.equal(result.mode, 'composite');
  assert.deepEqual(result.platforms, ['claude', 'codex']);
  assert.equal(result.anchor, 'claude');
});
test('unresolved platform outside S is ignored', async t => {
  const ctx = await compositeContext(t);
  await installAll(ctx, ['codex']);
  ctx.env.CLAUDE_CONFIG_DIR = path.join(ctx.userHome, 'other-claude');
  const result = state(ctx);
  assert.equal(result.mode, 'standalone');
  assert.deepEqual(result.homes, {codex: 'standalone', claude: 'unresolved', gemini: 'standalone'});
});
test('two active configs → unverified with both residual', async t => {
  const ctx = await composite(t);
  fs.copyFileSync(active(ctx, 'claude'), active(ctx, 'codex'));
  const result = state(ctx);
  assert.equal(result.mode, 'unverified');
  for (const id of ['claude', 'codex']) assert.ok(result.residualPaths.includes(active(ctx, id)));
});
test('orphan marker or routing profile → unverified', async t => {
  const ctx = await compositeContext(t);
  const home = targets(ctx).codex.home;
  fs.mkdirSync(path.join(home, 'agents'), {recursive: true});
  for (const name of ['arc-role-platform-routing.prepared.json', 'agents/arc-routing-qa.toml']) {
    const filename = path.join(home, name);
    fs.writeFileSync(filename, '{}');
    const result = state(ctx);
    assert.equal(result.mode, 'unverified');
    assert.ok(result.residualPaths.includes(filename));
    fs.unlinkSync(filename);
  }
});
test('management unverified state retains known residual paths', async t => {
  const ctx = await compositeContext(t), home = targets(ctx).codex.home;
  const residualPaths = ['arc-role-platform-routing.prepared.json', 'agents/arc-routing-qa.toml'].map(name => path.join(home, name));
  fs.mkdirSync(path.join(home, 'agents'), {recursive: true});
  for (const filename of residualPaths) fs.writeFileSync(filename, '{}');
  const detected = state(ctx), result = management.currentInstallState(ctx);
  assert.equal(result.mode, 'unverified');
  assert.deepEqual(detected.residualPaths, residualPaths);
  assert.deepEqual(result.residualPaths, detected.residualPaths);
  assert.equal(new Set(result.residualPaths).size, result.residualPaths.length);
});
test('active config not at anchor home → unverified', async t => {
  const ctx = await composite(t);
  const moved = active(ctx, 'codex');
  fs.renameSync(active(ctx, 'claude'), moved);
  for (const target of Object.values(targets(ctx))) {
    const filename = path.join(target.home, 'arc-role-platform-routing.prepared.json');
    const marker = JSON.parse(fs.readFileSync(filename));
    marker.activeConfigPath = moved;
    fs.writeFileSync(filename, JSON.stringify(marker));
    const owned = inspectCompositeRemoval({target, safeFs, activeConfigPath: moved, snapshot: new Map()});
    assert.deepEqual(owned.residualPaths, []);
    assert.ok(owned.removals.includes(filename));
  }
  const result = state(ctx);
  assert.equal(result.mode, 'unverified');
  assert.ok(result.residualPaths.includes(active(ctx, 'codex')));
});
test('injected v2 composite reaches profile ownership checks', async t => {
  const ctx = {...await composite(t), ...createTestRegistries()};
  ctx.env.ZETA_HOME = path.join(ctx.userHome, '.zeta');
  const resolved = resolveTargets(ctx).targets;
  const activeConfigPath = active(ctx, 'claude');
  const config = JSON.parse(fs.readFileSync(activeConfigPath));
  config.version = 2;
  config.platforms = ['claude', 'codex', 'zeta'];
  config.roles.arc_planner.platform = 'zeta';
  const bytes = Buffer.from(JSON.stringify(config));
  fs.writeFileSync(activeConfigPath, bytes);
  const digest = input => 'sha256:' + createHash('sha256').update(input).digest('hex');
  const markers = Object.fromEntries(['claude', 'codex'].map(id => [id, JSON.parse(fs.readFileSync(path.join(resolved[id].home, 'arc-role-platform-routing.prepared.json')))]));
  const planner = markers.claude.profiles.arc_planner;
  markers.zeta = {...markers.claude, platform: 'zeta', targetHome: resolved.zeta.home, profiles: {arc_planner: planner}};
  delete markers.claude.profiles.arc_planner;
  fs.mkdirSync(path.join(resolved.zeta.home, 'agents'), {recursive: true});
  const profile = path.join(resolved.zeta.home, planner.path);
  fs.renameSync(path.join(resolved.claude.home, planner.path), profile);
  for (const [id, marker] of Object.entries(markers)) {
    marker.configHash = digest(bytes);
    fs.writeFileSync(path.join(resolved[id].home, 'arc-role-platform-routing.prepared.json'), JSON.stringify(marker));
  }
  const result = state(ctx);
  assert.equal(result.mode, 'composite');
  assert.deepEqual(result.platforms, ['claude', 'codex', 'zeta']);
  assert.deepEqual(result.homes, {codex: 'composite', claude: 'composite', zeta: 'composite'});
  assert.equal(result.anchor, 'claude');
  const options = {target: resolved.zeta, safeFs, activeConfigPath, runtimePlatforms: ctx.runtimePlatforms};
  assert.ok(inspectCompositeRemoval({...options, snapshot: new Map()}).removals.includes(profile));
  fs.appendFileSync(profile, '\nchanged');
  assert.ok(inspectCompositeRemoval({...options, snapshot: new Map()}).residualPaths.includes(profile));
  assert.equal(state(ctx).mode, 'unverified');
});
test('S member unresolved → unverified', async t => {
  const ctx = await composite(t);
  ctx.env.CODEX_HOME = '';
  const result = state(ctx);
  assert.equal(result.mode, 'unverified');
  assert.equal(result.homes.codex, 'unresolved');
  assert.ok(result.residualPaths.includes(active(ctx, 'claude')));
});
test('zeta package passes verifyPayload with injected registry', t => {
  const manifest = new URL('../../MANIFEST.sha256', import.meta.url), before = fs.readFileSync(manifest);
  const root = zetaPackageFixture(t), registries = createTestRegistries();
  assert.ok(!root.startsWith(path.resolve(new URL('../../', import.meta.url).pathname)));
  assert.ok(fs.readFileSync(path.join(root, 'zeta/skill/models.toml')).equals(fs.readFileSync(path.join(root, 'claude/skill/models.toml'))));
  t.after(() => { assert.equal(fs.existsSync(root), false); assert.ok(fs.readFileSync(manifest).equals(before)); });
  const payload = verifyPayload({packageRoot: root, safeFs, ...registries});
  assert.deepEqual(Object.keys(payload.modelInputs), ['claude', 'codex', 'zeta']);
  const ordinary = staticPackageFixture(t);
  assert.deepEqual(Object.keys(verifyPayload({packageRoot: ordinary, safeFs}).modelInputs), ['claude', 'codex', 'gemini']);
  assert.throws(() => verifyPayload({packageRoot: root, safeFs}), {message: 'Payload verification failed: Duplicate, mutable or unexpected manifest entry: zeta/agents/arc-implementer.md'});
});
test('installAll installs zeta standalone', async t => {
  const ctx = await zetaContext(t);
  assert.equal(ctx.env.HOME, ctx.userHome);
  assert.notEqual(ctx.userHome, process.env.HOME);
  t.after(() => assert.equal(fs.existsSync(ctx.userHome), false));
  await installAll(ctx, ['claude', 'codex', 'zeta']);
  const result = state(ctx);
  assert.equal(result.mode, 'standalone');
  assert.deepEqual(result.homes, {codex: 'standalone', claude: 'standalone', zeta: 'standalone'});
  assert.deepEqual(collectInstalledState(ctx).targets.map(item => item.modelConfig.platform), ['claude', 'codex', 'zeta']);
  for (const id of ['claude', 'codex', 'zeta']) {
    const home = resolveTargets(ctx).targets[id].home;
    assert.ok(fs.readFileSync(path.join(home, 'skills/arc/SKILL.md')).length);
    assert.equal(fs.readdirSync(path.join(home, 'agents')).length, 5);
    for (const name of fs.readdirSync(path.join(home, 'agents'))) assert.ok(!fs.readFileSync(path.join(home, 'agents', name), 'utf8').includes('ARC_AGENT_FRAGMENT'));
  }
});

async function compositeFilesFixture(t, platforms, rolePlatforms) {
  const context = await zetaContext(t);
  await installAll(context, ['claude', 'codex', 'zeta']);
  const targets = resolveTargets(context).targets, payload = verifyPayload(context);
  const profileInputs = {}, modelConfigs = {}, standaloneBytes = new Map();
  for (const id of platforms) {
    const target = targets[id];
    modelConfigs[id] = loadModelConfig(fs.readFileSync(path.join(target.home, 'skills/arc/models.toml')), id, context);
    profileInputs[id] = renderStandaloneProfiles({payload, target, modelConfig: modelConfigs[id], language: 'en', ...context});
    for (const name of fs.readdirSync(path.join(target.home, 'agents'))) {
      const filename = path.join(target.home, 'agents', name);
      standaloneBytes.set(filename, fs.readFileSync(filename));
    }
  }
  const roles = (await mixedConfig('n-files-1')).roles;
  const pairs = {codex: roles.arc_qa, claude: roles.arc_planner};
  for (const [index, role] of ROUTING_ROLES.entries()) {
    const platform = rolePlatforms[index % rolePlatforms.length];
    const pair = pairs[platform === 'codex' ? 'codex' : 'claude'];
    roles[role] = {platform, model: pair.model, effort: pair.effort};
  }
  const config = buildRoleRoutingConfig({revision: 'n-files-1', platforms, roles}, context);
  return {context, targets, payload, platforms, anchor: platforms[0], config, profileInputs, modelConfigs, standaloneBytes};
}

async function f4Fixture(t) {
  const fixture = await compositeFilesFixture(t, ['claude', 'codex'], ['codex', 'claude']);
  await publishCompositeFiles({context: fixture.context, prepared: prepareCompositeFiles(fixture)});
  return fixture;
}

test('F4 status reports standalone outside S during composite', async t => {
  const {context, targets} = await f4Fixture(t);
  const ordinary = await collectStatus({...context, platforms: undefined, runtimePlatforms: undefined});
  const statuses = await collectStatus(context);
  assert.deepEqual([...statuses.filter(item => item.platform !== 'zeta'), {
    platform: 'gemini', target: resolveTargets({...context, platforms: undefined, runtimePlatforms: undefined}).targets.gemini,
    state: 'absent', diagnostics: [], residualPaths: [],
    authentication: {authStatus: 'unknown', reason: 'auth_unverified'},
    cliVersion: {version: null, reason: 'cli_not_found'},
  }], ordinary);
  const zeta = statuses.find(item => item.platform === 'zeta');
  assert.equal(zeta.state, 'installed');
  assert.ok(zeta.snapshot.has(path.join(targets.zeta.home, 'agents/arc-qa.md')));
  fs.unlinkSync(path.join(targets.zeta.home, 'agents/arc-qa.md'));
  const damaged = (await collectStatus(context)).find(item => item.platform === 'zeta');
  assert.equal(damaged.state, 'incomplete');
  assert.match(damaged.diagnostics[0].message, /missing profile/);
});

test('F4 upgrade rewrites standalone profiles outside S', async t => {
  const {context, payload, targets} = await f4Fixture(t);
  const profiles = id => Object.fromEntries(Object.entries(homeBytes(targets[id].home)).filter(([name]) => name.startsWith('agents/')));
  const before = Object.fromEntries(['claude', 'codex'].map(id => [id, profiles(id)]));
  const state = collectInstalledState(context);
  const plans = buildUpgradePlans({payload, state, safeFs, registry: context.platforms});
  for (const id of ['claude', 'codex']) assert.equal(plans.find(plan => plan.target.platform === id).profileWrites.size, 0);
  assert.deepEqual([...plans.find(plan => plan.target.platform === 'zeta').profileWrites.keys()].sort(), [
    'arc-implementer.md', 'arc-planner.md', 'arc-qa.md', 'arc-reviewer.md', 'arc-scouter.md',
  ]);
  const result = await upgradeInstalledTargets({...context, state, registry: context.platforms});
  assert.deepEqual(result.results.map(item => [item.platform, item.status]), [['claude', 'installed'], ['codex', 'installed'], ['zeta', 'installed']]);
  for (const id of ['claude', 'codex']) assert.deepEqual(profiles(id), before[id]);
  for (const [name, bytes] of plans.find(plan => plan.target.platform === 'zeta').profileWrites) assert.deepEqual(fs.readFileSync(path.join(targets.zeta.home, 'agents', name)), bytes);
});

test('F4 upgrade uses context registry', async t => {
  const {context} = await f4Fixture(t);
  const npmContext = {kind: 'global', packageRoot: context.packageRoot};
  const deps = {...context, inspectNpmContext: async () => npmContext, resolveLatest: async () => ({version: '999.0.0'})};
  const ordinary = await prepareUpdate({...deps, platforms: undefined, runtimePlatforms: undefined});
  assert.deepEqual(ordinary.state.targets.map(item => item.target.platform), ['claude', 'codex']);
  const prepared = await prepareUpdate(deps);
  assert.deepEqual(prepared.state.targets.map(item => item.target.platform), ['claude', 'codex', 'zeta']);
  const plans = buildUpgradePlans({payload: verifyPayload(context), state: prepared.state, safeFs});
  assert.deepEqual(plans.map(plan => plan.target.platform), ['claude', 'codex', 'zeta']);
  let stdout = '', stderr = '';
  const code = await runChild({protocol: 1, expectedVersion: prepared.currentVersion, expectedStateToken: prepared.state.stateToken, invocationCwd: context.cwd}, {env: context.env, output: {write: text => stdout += text}, error: {write: text => stderr += text}}, deps);
  assert.equal(code, 0, stderr);
  assert.match(stdout, /zeta: installed/);
});

test('|S|=3 publish writes active only at anchor and markers in all homes', async t => {
  const fixture = await compositeFilesFixture(t, ['claude', 'codex', 'zeta'], ['codex', 'claude']);
  // A host needs no role model/profile inputs to receive its ownership marker.
  delete fixture.profileInputs.zeta;
  delete fixture.modelConfigs.zeta;
  const prepared = prepareCompositeFiles(fixture);
  const result = await publishCompositeFiles({context: fixture.context, prepared});
  assert.equal(result.published, true);
  const activeConfigPath = active(fixture.context, 'claude');
  const config = JSON.parse(fs.readFileSync(activeConfigPath));
  assert.equal(config.version, 2);
  assert.deepEqual(config.platforms, ['claude', 'codex', 'zeta']);
  for (const id of fixture.platforms) {
    assert.equal(fs.existsSync(active(fixture.context, id)), id === 'claude');
    const marker = JSON.parse(fs.readFileSync(path.join(fixture.targets[id].home, 'arc-role-platform-routing.prepared.json')));
    assert.equal(marker.activeConfigPath, activeConfigPath);
    assert.deepEqual(Object.keys(marker.profiles), ROUTING_ROLES.filter(role => config.roles[role].platform === id));
    if (id === 'zeta') assert.deepEqual(marker.profiles, {});
  }
  assert.equal(state(fixture.context).mode, 'composite');
  assert.deepEqual(readCompositeRoutingConfig(fixture.context, fixture.targets), fixture.config);
});

test('publish lock lives at anchor home', async t => {
  const fixture = await compositeFilesFixture(t, ['claude', 'zeta'], ['claude', 'zeta']);
  const prepared = prepareCompositeFiles(fixture);
  const releaseAnchor = await acquireRoleRoutingLock(fixture.targets.claude.home);
  try {
    await assert.rejects(publishCompositeFiles({context: fixture.context, prepared}), {code: 'EEXIST'});
    assert.equal(fs.existsSync(active(fixture.context, 'claude')), false);
  } finally { await releaseAnchor(); }
  const releaseOutside = await acquireRoleRoutingLock(fixture.targets.codex.home);
  try {
    assert.equal((await publishCompositeFiles({context: fixture.context, prepared})).published, true);
  } finally { await releaseOutside(); }
  assert.equal(fs.existsSync(active(fixture.context, 'codex')), false);
  assert.equal(state(fixture.context).anchor, 'claude');
  assert.deepEqual(readCompositeRoutingConfig(fixture.context, fixture.targets), fixture.config);
  const marker = JSON.parse(fs.readFileSync(path.join(fixture.targets.zeta.home, 'arc-role-platform-routing.prepared.json')));
  for (const [role, entry] of Object.entries(marker.profiles)) {
    assert.equal(entry.path, `agents/arc-routing-${role.slice(4)}.md`);
    const text = fs.readFileSync(path.join(fixture.targets.zeta.home, entry.path), 'utf8');
    assert.ok(text.includes(`effort: ${fixture.config.roles[role].effort}\n`));
    assert.ok(text.includes(`model: ${fixture.config.roles[role].model}\n`));
  }
});

test('deactivation restores standalone across S', async t => {
  for (const platforms of [['claude', 'codex', 'zeta'], ['claude', 'zeta']]) {
    const fixture = await compositeFilesFixture(t, platforms, platforms);
    await publishCompositeFiles({context: fixture.context, prepared: prepareCompositeFiles(fixture)});
    const prepared = prepareCompositeDeactivation(fixture);
    const release = await acquireRoleRoutingLock(fixture.targets[fixture.anchor].home);
    try {
      await assert.rejects(publishCompositeDeactivation({context: fixture.context, prepared}), {code: 'EEXIST'});
    } finally { await release(); }
    const result = await publishCompositeDeactivation({context: fixture.context, prepared});
    assert.deepEqual(result.residualPaths, []);
    for (const [filename, bytes] of fixture.standaloneBytes) assert.ok(fs.readFileSync(filename).equals(bytes), filename);
    for (const id of fixture.platforms) {
      assert.equal(fs.existsSync(active(fixture.context, id)), false);
      assert.equal(fs.existsSync(path.join(fixture.targets[id].home, 'arc-role-platform-routing.prepared.json')), false);
      assert.ok(fs.readdirSync(path.join(fixture.targets[id].home, 'agents')).every(name => !name.startsWith('arc-routing-')));
    }
    assert.equal(state(fixture.context).mode, 'standalone');
    assert.equal(readCompositeRoutingConfig(fixture.context, fixture.targets), null);
  }
});

import * as management from '../../lib/management/operations.mjs';
import {buildUninstallPlan} from '../../lib/installer/uninstall.mjs';
import {buildPresetPlan} from '../../lib/installer/preset.mjs';

function homeBytes(home) {
  const result = {};
  function visit(relative) {
    const filename = path.join(home, relative), stat = fs.lstatSync(filename);
    if (stat.isSymbolicLink()) result[relative] = ['link', fs.readlinkSync(filename)];
    else if (stat.isDirectory()) { result[relative] = ['directory']; for (const name of fs.readdirSync(filename).sort()) visit(path.join(relative, name)); }
    else result[relative] = ['file', fs.readFileSync(filename).toString('hex')];
  }
  visit(''); return result;
}
async function managementPublish(ctx, options = {}) {
  const prepared = await management.prepareCompositeOperation(ctx, {kind: 'install', config: await mixedConfig('management-1'), ...options});
  const result = await management.executeCompositeOperation(ctx, prepared);
  assert.equal(result.code, 0, result.error?.stack);
  return {prepared, result};
}

test('D1-a leaves other homes byte-identical', async t => {
  const ctx = await compositeContext(t); await standalone(ctx);
  const before = homeBytes(targets(ctx).codex.home);
  const result = await management.executeOperation(ctx, await management.prepareOperation(ctx, {kind: 'install', target: 'claude', language: 'ko'}));
  assert.equal(result.code, 0, result.error?.stack);
  assert.deepEqual(homeBytes(targets(ctx).codex.home), before);
  assert.match(fs.readFileSync(path.join(targets(ctx).claude.home, 'skills/arc/settings.toml'), 'utf8'), /ko/);
});
test('D1-a works when claude home is unresolved', async t => {
  const ctx = await compositeContext(t); await installAll(ctx, ['codex']);
  ctx.env.CLAUDE_CONFIG_DIR = path.join(ctx.userHome, 'non-default-claude');
  const result = await management.executeOperation(ctx, await management.prepareOperation(ctx, {kind: 'install', target: 'codex', language: 'ko'}));
  assert.equal(result.code, 0, result.error?.stack);
  assert.deepEqual(management.currentInstallState(ctx), {mode: 'standalone', platforms: [], anchor: null});
  assert.equal(fs.existsSync(ctx.env.CLAUDE_CONFIG_DIR), false);
});
test('composite platforms default to current S or codex+claude', async t => {
  const ordinary = await compositeContext(t);
  const first = await management.prepareCompositeOperation(ordinary, {kind: 'install', config: await mixedConfig('defaults')});
  assert.deepEqual(first.files.platforms, ['claude', 'codex']);
  const ctx = await zetaContext(t);
  const config = {revision: 'current-s', roles: Object.fromEntries(ROUTING_ROLES.map(role => [role, {platform: 'claude', model: 'claude-opus-4-6', effort: 'high'}]))};
  // Choose a published catalog pair without assuming the default Claude model.
  const {loadStaticModelCatalog} = await import('../../lib/models/static-catalog.mjs');
  const pair = (await loadStaticModelCatalog('claude')).catalog.pairs[0];
  for (const role of ROUTING_ROLES) config.roles[role] = {platform: 'claude', ...pair};
  await managementPublish(ctx, {config, platforms: ['zeta', 'claude']});
  const next = await management.prepareCompositeOperation(ctx, {kind: 'install', config: {...config, revision: 'current-s-2'}});
  assert.deepEqual(next.files.platforms, ['claude', 'zeta']);
  assert.deepEqual(management.currentInstallState(ctx), {mode: 'composite', platforms: ['claude', 'zeta'], anchor: 'claude'});
  assert.equal(management.currentInstallMode(ctx), 'composite');
  assert.deepEqual(management.readCompositeConfig(ctx).platforms, ['claude', 'zeta']);
});
test('|S|=3 install-composite publishes at claude anchor', async t => {
  const ctx = await zetaContext(t);
  const {prepared, result} = await managementPublish(ctx, {platforms: ['zeta', 'claude', 'zeta']});
  assert.deepEqual(prepared.plans.map(plan => plan.target.platform), ['claude', 'codex', 'zeta']);
  assert.equal(result.messages[0], 'Mixed (Claude + Codex + Zeta) activated.');
  assert.deepEqual(management.currentInstallState(ctx), {mode: 'composite', platforms: ['claude', 'codex', 'zeta'], anchor: 'claude'});
  for (const id of ['claude', 'codex', 'zeta']) {
    assert.equal(fs.existsSync(active(ctx, id)), id === 'claude');
    const marker = JSON.parse(fs.readFileSync(path.join(resolveTargets(ctx).targets[id].home, 'arc-role-platform-routing.prepared.json')));
    assert.equal(marker.activeConfigPath, active(ctx, 'claude'));
    if (id === 'zeta') assert.deepEqual(marker.profiles, {});
  }
});
test('partial install failure does not publish', async t => {
  const ctx = await zetaContext(t);
  const prepared = await management.prepareCompositeOperation(ctx, {kind: 'install', platforms: ['claude', 'zeta'], config: await mixedConfig('partial')});
  ctx.hooks = {fault(event) { if (event.phase === 'before-prepare' && event.plan.target.platform === 'zeta') throw Error('zeta install failed'); }};
  const result = await management.executeCompositeOperation(ctx, prepared);
  assert.equal(result.code, 1); assert.equal(result.activation, 'held');
  assert.deepEqual(result.results.map(item => item.status), ['installed', 'installed', 'failed']);
  for (const id of ['claude', 'codex', 'zeta']) assert.equal(fs.existsSync(active(ctx, id)), false);
  assert.equal(fs.existsSync(path.join(resolveTargets(ctx).targets.codex.home, 'skills/arc/SKILL.md')), true);
});
test('D1-d republish keeps v2 bytes and claude lock/store', async t => {
  const ctx = await compositeContext(t); await managementPublish(ctx);
  const filename = active(ctx, 'claude'), before = fs.readFileSync(filename);
  assert.deepEqual(Object.keys(JSON.parse(before)), ['version', 'revision', 'platforms', 'roles']);
  assert.equal(JSON.parse(before).version, 2);
  assert.deepEqual(JSON.parse(before).platforms, ['claude', 'codex']);
  const store = path.join(targets(ctx).claude.home, 'arc-role-dispatch');
  fs.mkdirSync(store, {recursive: true}); fs.writeFileSync(path.join(store, 'history'), 'retained history');
  const release = await acquireRoleRoutingLock(targets(ctx).claude.home);
  try {
    const prepared = await management.prepareCompositeOperation(ctx, {kind: 'install', config: await mixedConfig('management-1')});
    assert.ok(prepared.plans.every(plan => plan.profileWrites.size === 0));
    const held = await management.executeCompositeOperation(ctx, prepared);
    assert.equal(held.activation, 'held'); assert.equal(held.error?.code, 'EEXIST');
  }
  finally { await release(); }
  assert.ok(fs.readFileSync(filename).equals(before));
  // A failed publication has installed fresh files: prepare a fresh snapshot for republish.
  const next = await management.prepareCompositeOperation(ctx, {kind: 'install', config: await mixedConfig('management-1')});
  const result = await management.executeCompositeOperation(ctx, next);
  assert.equal(result.code, 0, result.error?.stack); assert.ok(fs.readFileSync(filename).equals(before));
  assert.equal(result.messages[0], 'Mixed (Claude + Codex) activated.');
  assert.equal(fs.readFileSync(path.join(store, 'history'), 'utf8'), 'retained history');
  assert.equal(fs.existsSync(path.join(targets(ctx).claude.home, 'arc-role-platform-routing.lock')), false);
});
test('kind preset, skipGlobal and target all remain accepted', async t => {
  const ctx = await zetaContext(t);
  const all = await management.prepareOperation(ctx, {kind: 'install', target: 'all', skipGlobal: true});
  assert.deepEqual(all.plans.map(plan => plan.target.platform), ['claude', 'codex', 'zeta']);
  assert.ok(all.plans.every(plan => plan.skipGlobal));
  assert.equal((await management.executeOperation(ctx, all)).code, 0);
  const preset = await management.prepareOperation(ctx, {kind: 'preset', target: 'zeta'});
  assert.equal((await management.executeOperation(ctx, preset)).code, 0);
  const removal = await management.prepareOperation(ctx, {kind: 'uninstall', target: 'all', removeCli: false, skipGlobal: true});
  assert.deepEqual(removal.plans.map(plan => plan.target.platform), ['claude', 'codex', 'zeta']);
  assert.equal((await management.executeOperation(ctx, removal)).code, 0);
});
test('activation message uses display-ordered mixed label', async t => {
  const ctx = await compositeContext(t), {result} = await managementPublish(ctx);
  assert.deepEqual(result.messages, ['Mixed (Claude + Codex) activated.', 'After upgrading ARC, run Install / Update again.']);
});
test('management composite rejects unknown or singleton participating sets', async t => {
  const ctx = await zetaContext(t), config = await mixedConfig('invalid-set');
  await assert.rejects(management.prepareCompositeOperation(ctx, {kind: 'install', platforms: ['unknown'], config}), {message: 'Unknown platform: unknown'});
  const roles = Object.fromEntries(ROUTING_ROLES.map(role => [role, {...config.roles.arc_qa}]));
  await assert.rejects(management.prepareCompositeOperation(ctx, {kind: 'install', platforms: ['codex'], config: {...config, roles}}), {message: 'Mixed routing requires at least two platforms'});
  roles.arc_planner = {platform: 'unknown', model: 'model', effort: 'high'};
  await assert.rejects(management.prepareCompositeOperation(ctx, {kind: 'install', platforms: ['claude', 'codex'], config: {...config, roles}}), {message: 'Unknown platform: unknown'});
});
test('composite availability gates only S and rechecks host CLI at execution', async t => {
  const ctx = await zetaContext(t), config = await mixedConfig('availability');
  fs.unlinkSync(path.join(ctx.userHome, 'bin/zeta'));
  await assert.rejects(management.prepareCompositeOperation(ctx, {kind: 'install', platforms: ['claude', 'codex', 'zeta'], config}), {message: 'zeta: Not Available'});
  const prepared = await management.prepareCompositeOperation(ctx, {kind: 'install', platforms: ['claude', 'codex'], config});
  fs.unlinkSync(path.join(ctx.userHome, 'bin/claude'));
  const result = await management.executeCompositeOperation(ctx, prepared);
  assert.equal(result.activation, 'held'); assert.equal(result.error.message, 'claude: Not Available');
  assert.equal(fs.existsSync(active(ctx, 'claude')), false);
});
test('composite checks all home pairs including non-anchor platforms', async t => {
  const ctx = await zetaContext(t); ctx.env.ZETA_HOME = path.join(ctx.userHome, '.claude/nested');
  await assert.rejects(management.prepareCompositeOperation(ctx, {kind: 'install', platforms: ['claude', 'codex', 'zeta'], config: await mixedConfig('overlap')}), {message: 'Selected platform homes overlap'});
});
test('uninstall injected standalone and composite zeta preserves ownership and anchor lock', async t => {
  const ctx = await zetaContext(t); await installAll(ctx, ['zeta']);
  const target = resolveTargets(ctx).targets.zeta;
  const standalonePlan = buildUninstallPlan({...ctx, target, removeCompletion: false});
  assert.ok(standalonePlan.removals.includes(path.join(target.home, 'agents/arc-qa.md')));
  const {loadStaticModelCatalog} = await import('../../lib/models/static-catalog.mjs');
  const pair = (await loadStaticModelCatalog('claude')).catalog.pairs[0];
  const config = {revision: 'uninstall-anchor', roles: Object.fromEntries(ROUTING_ROLES.map(role => [role, {platform: 'claude', ...pair}]))};
  await managementPublish(ctx, {platforms: ['claude', 'zeta'], config});
  const removal = await management.prepareOperation(ctx, {kind: 'uninstall', target: 'all', removeCli: false});
  assert.ok(removal.plans.find(plan => plan.target.platform === 'zeta').removals.includes(path.join(target.home, 'arc-role-platform-routing.prepared.json')));
  const release = await acquireRoleRoutingLock(resolveTargets(ctx).targets.claude.home);
  try {
    await assert.rejects(management.executeOperation(ctx, removal), {code: 'EEXIST'});
    assert.equal(fs.existsSync(path.join(target.home, 'skills/arc')), true);
  } finally { await release(); }
});
test('preset injected zeta reads and renders owned and residual profiles', async t => {
  const ctx = await zetaContext(t); await installAll(ctx, ['zeta']);
  const target = resolveTargets(ctx).targets.zeta;
  const owned = buildPresetPlan({...ctx, target}); assert.deepEqual(owned.specs, []);
  const roles = Object.fromEntries(ROUTING_ROLES.map(role => [role, {model: 'zeta-model', effort: 'high'}]));
  const verifiedCatalog = {platform: 'zeta', pairs: [{model: 'zeta-model', effort: 'high'}]};
  const custom = buildPresetPlan({...ctx, target, roles, verifiedCatalog});
  assert.ok(custom.specs.some(spec => spec.path.endsWith('/models.toml')));
  assert.equal((await management.executeOperation(ctx, {kind: 'preset', plans: [custom]})).code, 0);
  assert.match(fs.readFileSync(path.join(target.home, 'skills/arc/models.toml'), 'utf8'), /zeta-model/);
  assert.match(fs.readFileSync(path.join(target.home, 'agents/arc-qa.md'), 'utf8'), /model: zeta-model/);
  fs.writeFileSync(path.join(target.home, 'agents/arc-qa.md'), 'user profile');
  const residual = buildPresetPlan({...ctx, target, roles, verifiedCatalog, loadPayload: () => verifyPayload(ctx)});
  assert.deepEqual(residual.residualPaths, [path.join(target.home, 'agents/arc-qa.md')]);
});

test('catalog role validation passes the injected zeta runtime registry', async () => {
  const {assertCatalogRoles} = await import('../../lib/models/catalog.mjs');
  const registries = createTestRegistries();
  const roles = Object.fromEntries(ROUTING_ROLES.map(role => [role, {model: 'zeta-model', effort: 'high'}]));
  const catalog = {platform: 'zeta', pairs: [{model: 'zeta-model', effort: 'high'}]};
  assert.doesNotThrow(() => assertCatalogRoles({...registries, platform: 'zeta', roles, catalog}));
  assert.throws(() => assertCatalogRoles({...registries, platform: 'zeta', roles: {...roles, arc_qa: {model: 'other', effort: 'high'}}, catalog}), /absent from the catalog/);
});

test('install plan validates zeta custom roles using the injected registry', async t => {
  const ctx = await zetaContext(t);
  const roles = Object.fromEntries(ROUTING_ROLES.map(role => [role, {model: 'zeta-model', effort: 'high'}]));
  const prepared = await management.prepareOperation(ctx, {kind: 'install', target: 'zeta', roles, verifiedCatalog: {platform: 'zeta', pairs: [{model: 'zeta-model', effort: 'high'}]}});
  assert.equal(prepared.plans[0].target.platform, 'zeta');
  assert.match(prepared.plans[0].generated.profiles.get('arc-qa.md').toString(), /model: zeta-model/);
});

import {createLease} from '../../lib/runtime/role-dispatch-store.mjs';

async function setChangeConfig(ctx, revision) {
  const config = await mixedConfig(revision), pair = config.roles.arc_planner;
  return {...config, roles: Object.fromEntries(ROUTING_ROLES.map(role => [role, {...pair, platform: 'claude'}]))};
}
async function prepareSetChange(ctx, platforms, revision, options = {}) {
  let prepared;
  await assert.doesNotReject(async () => {
    prepared = await management.prepareCompositeOperation(ctx, {kind: 'install', platforms, config: await setChangeConfig(ctx, revision), ...options});
  }, 'a verified previous composite must permit changing S and anchor');
  return prepared;
}

async function codexAnchorConfig(revision) {
  const config = await mixedConfig(revision), pair = config.roles.arc_qa;
  return {...config, platforms: ['codex', 'zeta'], roles: Object.fromEntries(ROUTING_ROLES.map(role => [role, {...pair}]))};
}
async function publishCodexAnchor(context) {
  return managementPublish(context, {platforms: ['codex', 'zeta'], config: await codexAnchorConfig('before-move')});
}

async function f6MoveFixture(t) {
  const context = await zetaContext(t);
  await installAll(context, ['claude', 'codex', 'zeta']);
  await publishCodexAnchor(context);
  const prepared = await prepareSetChange(context, ['claude', 'zeta'], 'f6-move');
  assert.equal(prepared.files.previous.anchor, 'codex');
  assert.equal(prepared.files.anchor, 'claude');
  return {context, prepared};
}

test('F6 symlinked home ancestor rejects anchor-move publish without changes', async t => {
  const {context, prepared} = await f6MoveFixture(t);
  const linkParent = context.userHome, realParent = `${linkParent}-real`;
  t.after(() => fs.rmSync(realParent, {recursive: true, force: true}));
  fs.renameSync(linkParent, realParent);
  fs.symlinkSync(realParent, linkParent);
  const snapshot = () => ({link: fs.readlinkSync(linkParent), files: homeBytes(realParent)});
  const before = snapshot();
  // Management may refuse at its installation-state inspection before publication.
  await assert.rejects(management.prepareCompositeOperation(context, {
    kind: 'install', platforms: ['claude', 'zeta'], config: await setChangeConfig(context, 'f6-move')
  }), {message: `Symlink destination is unsafe: ${linkParent}`});
  assert.deepEqual(snapshot(), before);
  // Also exercise prepareLockHome with an already-prepared anchor move.
  await assert.rejects(publishCompositeFiles({context, prepared: prepared.files}), {
    message: `Expected destination directory: ${linkParent}`
  });
  assert.deepEqual(snapshot(), before);
  // Restore only the parent layout; homes and marker path strings stay identical.
  fs.unlinkSync(linkParent);
  fs.renameSync(realParent, linkParent);
  let control;
  await assert.doesNotReject(async () => {
    control = await management.prepareCompositeOperation(context, {
      kind: 'install', platforms: ['claude', 'zeta'], config: await setChangeConfig(context, 'f6-move')
    });
  });
  const result = await management.executeCompositeOperation(context, control);
  assert.equal(result.code, 0, result.error?.stack);
  assert.equal(state(context).anchor, 'claude');
});

test('F6 installer and runtime verdicts agree', async t => {
  const cases = [
    {name: 'ancestor symlink', allowed: false},
    {name: 'home symlink', allowed: false},
    {name: 'dispatch directory symlink', allowed: true},
    {name: 'lock file symlink', allowed: false},
    {name: 'normal', allowed: true}
  ];
  for (const entry of cases) {
    await t.test(entry.name, async t => {
      const {context, prepared} = await f6MoveFixture(t);
      const realHome = prepared.files.targets.claude.home;
      let home = realHome;
      if (entry.name === 'ancestor symlink') {
        const linkParent = path.join(context.userHome, 'linkParent');
        fs.symlinkSync(context.userHome, linkParent);
        home = path.join(linkParent, '.claude');
      } else if (entry.name === 'home symlink') {
        home = path.join(context.userHome, 'linkHome');
        fs.symlinkSync(realHome, home);
      } else if (entry.name === 'dispatch directory symlink') {
        const directory = path.join(context.userHome, 'real-dispatch');
        fs.mkdirSync(directory);
        fs.writeFileSync(path.join(directory, 'sentinel'), 'preserve dispatch target');
        fs.symlinkSync(directory, path.join(home, 'arc-role-dispatch'));
      } else if (entry.name === 'lock file symlink') {
        const filename = path.join(context.userHome, 'real-lock');
        fs.writeFileSync(filename, 'preserve lock target');
        fs.symlinkSync(filename, path.join(home, 'arc-role-platform-routing.lock'));
      }
      const target = {...prepared.files.targets.claude, home};
      prepared.files = {...prepared.files, target, targets: {...prepared.files.targets, claude: target}};
      const before = homeBytes(context.userHome);
      let release, runtimeError;
      try {
        release = await acquireRoleRoutingLock(home);
      } catch (error) { runtimeError = error; }
      const runtimeAllowed = typeof release === 'function';
      if (release) assert.equal(await release(), true);
      assert.equal(runtimeAllowed, entry.allowed, runtimeError?.stack);
      assert.deepEqual(homeBytes(context.userHome), before);
      let installerAllowed = false, installerError;
      try {
        const result = await publishCompositeFiles({context, prepared: prepared.files});
        installerAllowed = result.published;
      } catch (error) { installerError = error; }
      assert.equal(installerAllowed, entry.allowed, installerError?.stack);
      assert.equal(installerAllowed, runtimeAllowed);
      if (!entry.allowed) {
        assert.deepEqual(homeBytes(context.userHome), before);
        if (entry.name === 'lock file symlink') {
          assert.equal(runtimeError.code, 'EEXIST');
          assert.equal(installerError.code, 'EEXIST');
        } else {
          assert.equal(runtimeError.message, 'Unsafe symlink path');
          assert.match(installerError.message, /^Expected destination directory: /);
        }
      } else {
        assert.equal(state(context).anchor, 'claude');
        if (entry.name === 'dispatch directory symlink') {
          assert.equal(fs.readlinkSync(path.join(home, 'arc-role-dispatch')), path.join(context.userHome, 'real-dispatch'));
          assert.deepEqual(homeBytes(path.join(context.userHome, 'real-dispatch')), {
            '': ['directory'], sentinel: ['file', Buffer.from('preserve dispatch target').toString('hex')]
          });
        }
      }
      t.diagnostic(`installer=${installerAllowed ? 'allow' : 'reject'}, runtime=${runtimeAllowed ? 'allow' : 'reject'}`);
    });
  }
});
const routingNames = home => fs.readdirSync(path.join(home, 'agents')).filter(name => name.startsWith('arc-routing-'));
const markerName = home => path.join(home, 'arc-role-platform-routing.prepared.json');
const routingLock = home => path.join(home, 'arc-role-platform-routing.lock');
const moveLease = (dispatchId, state = 'reserved', route = 'native') => ({
  version: 1, dispatchId, workflowId: 'move', taskId: 'task-10', requestId: dispatchId, role: 'arc_planner', route,
  hostPlatform: 'claude', executionEnvironment: 'claude-cli', revision: 'before-move', profileHash: null, argsDigest: null,
  state, supervisor: null, child: null, sessionId: null, timeoutMinutes: 20, claims: null, reasons: [], allowedPaths: [],
  resultPath: null, segment: 0, nativeAgentId: null, createdAt: '2026-11-15T00:00:00.000Z', updatedAt: '2026-11-15T00:00:00.000Z'
});

test('D1-e same anchor adds zeta and removes nothing', async t => {
  const ctx = await zetaContext(t); await installAll(ctx, ['claude', 'codex', 'zeta']);
  await managementPublish(ctx);
  const prepared = await prepareSetChange(ctx, ['claude', 'codex', 'zeta'], 'same-anchor-add');
  const result = await management.executeCompositeOperation(ctx, prepared);
  assert.equal(result.code, 0, result.error?.stack);
  assert.deepEqual(management.currentInstallState(ctx), {mode: 'composite', platforms: ['claude', 'codex', 'zeta'], anchor: 'claude'});
  for (const target of Object.values(resolveTargets(ctx).targets)) assert.ok(fs.existsSync(markerName(target.home)));
  assert.equal(result.messages.some(message => message.startsWith('Dispatch history stays')), false);
});

test("D1-e removes S'\\S routing files and restores standalone", async t => {
  const ctx = await zetaContext(t); await installAll(ctx, ['claude', 'codex', 'zeta']);
  const zeta = resolveTargets(ctx).targets.zeta.home;
  const standalone = homeBytes(path.join(zeta, 'agents')), skill = homeBytes(path.join(zeta, 'skills/arc'));
  await managementPublish(ctx, {platforms: ['claude', 'codex', 'zeta']});
  const prepared = await prepareSetChange(ctx, ['claude', 'codex'], 'same-anchor-remove');
  const result = await management.executeCompositeOperation(ctx, prepared);
  assert.equal(result.code, 0, result.error?.stack);
  assert.equal(fs.existsSync(markerName(zeta)), false);
  assert.deepEqual(routingNames(zeta), []);
  assert.deepEqual(homeBytes(path.join(zeta, 'agents')), standalone);
  assert.deepEqual(homeBytes(path.join(zeta, 'skills/arc')), skill);
  assert.equal(state(ctx).mode, 'composite');
  assert.deepEqual(state(ctx).platforms, ['claude', 'codex']);
});

test('anchor move codex→claude rewrites active, markers, old active removed', async t => {
  const ctx = await zetaContext(t); await installAll(ctx, ['claude', 'codex', 'zeta']);
  const targets = resolveTargets(ctx).targets, profiles = homeBytes(path.join(targets.codex.home, 'agents'));
  await publishCodexAnchor(ctx);
  await createLease(targets.codex.home, moveLease('old-history', 'completed'));
  const history = homeBytes(path.join(targets.codex.home, 'arc-role-dispatch'));
  const prepared = await prepareSetChange(ctx, ['claude', 'zeta'], 'move-to-claude');
  const result = await management.executeCompositeOperation(ctx, prepared);
  assert.equal(result.code, 0, result.error?.stack);
  assert.deepEqual(management.currentInstallState(ctx), {mode: 'composite', platforms: ['claude', 'zeta'], anchor: 'claude'});
  assert.equal(JSON.parse(fs.readFileSync(active(ctx, 'claude'))).version, 2);
  for (const id of ['claude', 'zeta']) assert.equal(JSON.parse(fs.readFileSync(markerName(targets[id].home))).activeConfigPath, active(ctx, 'claude'));
  assert.equal(fs.existsSync(active(ctx, 'codex')), false);
  assert.equal(fs.existsSync(markerName(targets.codex.home)), false);
  assert.deepEqual(routingNames(targets.codex.home), []);
  assert.deepEqual(homeBytes(path.join(targets.codex.home, 'agents')), profiles);
  assert.deepEqual(homeBytes(path.join(targets.codex.home, 'arc-role-dispatch')), history);
  assert.ok(result.messages.includes(`Dispatch history stays in ${targets.codex.home}/arc-role-dispatch.`));
});

test('anchor move blocked by any non-terminal lease', async t => {
  const ctx = await zetaContext(t); await installAll(ctx, ['claude', 'codex', 'zeta']);
  await publishCodexAnchor(ctx);
  const targets = resolveTargets(ctx).targets;
  for (const id of ['claude', 'codex']) for (const state of ['reserved', 'starting', 'running', 'unknown']) {
    const dispatchId = `${id}-${state}`, leasePath = path.join(targets[id].home, 'arc-role-dispatch', `${dispatchId}.json`);
    await createLease(targets[id].home, moveLease(dispatchId, state));
    const prepared = await prepareSetChange(ctx, ['claude', 'zeta'], `blocked-${dispatchId}`, {settings: {language: 'ko'}});
    const before = Object.fromEntries(Object.entries(targets).map(([id, target]) => [id, homeBytes(target.home)]));
    const result = await management.executeCompositeOperation(ctx, prepared);
    assert.equal(result.activation, 'held');
    assert.equal(result.error?.message, 'Active dispatches block moving mixed routing; finish or cancel them first');
    assert.deepEqual(result.error.activeDispatches, [dispatchId]);
    for (const [id, target] of Object.entries(targets)) assert.deepEqual(homeBytes(target.home), before[id], id);
    fs.unlinkSync(leasePath);
  }
});

test('anchor move lock release failure reports both lock paths', async t => {
  for (const rollback of [false, true]) {
    const ctx = await zetaContext(t); await installAll(ctx, ['claude', 'codex', 'zeta']);
    await publishCodexAnchor(ctx);
    const targets = resolveTargets(ctx).targets, before = homeBytes(ctx.userHome);
    const prepared = await prepareSetChange(ctx, ['claude', 'zeta'], `release-failure-${rollback}`);
    let sabotaged = false;
    ctx.hooks = {fault(event) {
      if (event.phase !== 'after-publish' || event.path !== active(ctx, 'claude')) return;
      sabotaged = true;
      for (const id of ['claude', 'codex']) {
        const filename = routingLock(targets[id].home);
        assert.equal(fs.existsSync(filename), true, `${id} lock held during publication`);
        fs.writeFileSync(filename, '{}');
      }
      if (rollback) throw Error('force restored rollback');
    }};
    const result = await management.executeCompositeOperation(ctx, prepared);
    assert.equal(sabotaged, true);
    assert.equal(result.code, 1);
    assert.equal(result.activation, rollback ? 'held' : 'unknown');
    assert.equal(result.error.lockReleaseFailed, true);
    assert.deepEqual(result.error.residualPaths.filter(filename => filename.endsWith('.lock')).sort(), ['claude', 'codex'].map(id => routingLock(targets[id].home)).sort());
    for (const id of ['claude', 'codex']) fs.unlinkSync(routingLock(targets[id].home));
    if (rollback) assert.deepEqual(homeBytes(ctx.userHome), before);
  }
});

test('D1-e codex+zeta adds claude and writes only the joining standalone profiles', async t => {
  const ctx = await zetaContext(t); await installAll(ctx, ['claude', 'codex', 'zeta']);
  await managementPublish(ctx, {platforms: ['codex', 'zeta'], config: await codexAnchorConfig('old-codex-anchor')});
  const prepared = await prepareSetChange(ctx, ['claude', 'codex', 'zeta'], 'join-claude');
  for (const plan of prepared.plans) assert.equal(plan.profileWrites.size, plan.target.platform === 'claude' ? ROUTING_ROLES.length : 0, plan.target.platform);
  const result = await management.executeCompositeOperation(ctx, prepared);
  assert.equal(result.code, 0, result.error?.stack);
  assert.deepEqual(management.currentInstallState(ctx), {mode: 'composite', platforms: ['claude', 'codex', 'zeta'], anchor: 'claude'});
  assert.equal(fs.existsSync(active(ctx, 'codex')), false, 'the old anchor remains in S but loses its active file');
  for (const target of Object.values(resolveTargets(ctx).targets)) assert.equal(JSON.parse(fs.readFileSync(markerName(target.home))).activeConfigPath, active(ctx, 'claude'));
  assert.ok(result.messages.includes(`Dispatch history stays in ${resolveTargets(ctx).targets.codex.home}/arc-role-dispatch.`));
});

test('anchor move can install a joining anchor with no existing home and blocks without creating it', async t => {
  const ctx = await zetaContext(t);
  await managementPublish(ctx, {platforms: ['codex', 'zeta'], config: await codexAnchorConfig('no-claude-home')});
  const targets = resolveTargets(ctx).targets;
  assert.equal(fs.existsSync(targets.claude.home), false);
  await createLease(targets.codex.home, moveLease('old-native'));
  let prepared = await prepareSetChange(ctx, ['claude', 'codex', 'zeta'], 'create-claude', {settings: {language: 'ko'}});
  const before = homeBytes(ctx.userHome);
  let result = await management.executeCompositeOperation(ctx, prepared);
  assert.equal(result.activation, 'held');
  assert.equal(result.error?.message, 'Active dispatches block moving mixed routing; finish or cancel them first');
  assert.deepEqual(homeBytes(ctx.userHome), before);
  fs.unlinkSync(path.join(targets.codex.home, 'arc-role-dispatch/old-native.json'));
  prepared = await prepareSetChange(ctx, ['claude', 'codex', 'zeta'], 'create-claude');
  result = await management.executeCompositeOperation(ctx, prepared);
  assert.equal(result.code, 0, result.error?.stack ?? result.results.find(item => item.error)?.error?.stack);
  assert.equal(state(ctx).anchor, 'claude');
});

test('F1 non-anchor participant switch', async t => {
  const ctx = await zetaContext(t); await installAll(ctx, ['claude', 'codex', 'zeta']);
  const targets = resolveTargets(ctx).targets;
  const profiles = Object.fromEntries(Object.entries(targets).map(([id, target]) => [id, homeBytes(path.join(target.home, 'agents'))]));
  await managementPublish(ctx, {platforms: ['claude', 'codex', 'zeta']});
  assert.deepEqual(management.currentInstallState(ctx), {mode: 'composite', platforms: ['claude', 'codex', 'zeta'], anchor: 'claude'});
  const prepared = await management.prepareOperation(ctx, {kind: 'install', target: 'zeta', switchFromComposite: true});
  const result = await management.executeOperation(ctx, prepared);
  assert.equal(result.code, 0, result.error?.stack);
  assert.deepEqual(prepared.deactivation.platforms, ['claude', 'codex', 'zeta']);
  assert.equal(prepared.deactivation.anchor, 'claude');
  assert.deepEqual(result.messages, ['Mixed routing turned off.']);
  for (const id of ['claude', 'codex', 'zeta']) {
    assert.equal(fs.existsSync(active(ctx, id)), false, id);
    assert.equal(fs.existsSync(markerName(targets[id].home)), false, id);
    assert.deepEqual(routingNames(targets[id].home), [], id);
    assert.deepEqual(homeBytes(path.join(targets[id].home, 'agents')), profiles[id], id);
  }
  const zetaProfiles = Object.entries(profiles.zeta).filter(([, entry]) => entry[0] === 'file');
  assert.equal(zetaProfiles.length, ROUTING_ROLES.length);
  for (const [name, [, bytes]] of zetaProfiles) {
    const filename = path.join(targets.zeta.home, 'agents', name);
    assert.equal(fs.existsSync(filename), true, name);
    assert.deepEqual(fs.readFileSync(filename), Buffer.from(bytes, 'hex'), name);
  }
  assert.deepEqual(management.currentInstallState(ctx), {mode: 'standalone', platforms: [], anchor: null});
});

for (const kind of ['install', 'uninstall']) {
  test(`full registry ${kind} switch deactivates claude+zeta under the claude lock`, async t => {
    const ctx = await zetaContext(t); await installAll(ctx, ['claude', 'codex', 'zeta']);
    const targets = resolveTargets(ctx).targets;
    const codexBefore = homeBytes(targets.codex.home);
    const profiles = Object.fromEntries(['claude', 'zeta'].map(id => [id, homeBytes(path.join(targets[id].home, 'agents'))]));
    await managementPublish(ctx, {platforms: ['claude', 'zeta'], config: await setChangeConfig(ctx, `switch-${kind}`)});
    const prepared = await management.prepareOperation(ctx, {kind, target: 'claude', switchFromComposite: true, removeCli: false});
    const locks = [];
    ctx.hooks = {fault(event) {
      if (event.phase === 'before-publish' && event.plan === prepared.deactivation) {
        locks.push(['claude', 'codex', 'zeta'].filter(id => fs.existsSync(routingLock(targets[id].home))));
      }
    }};
    const result = await management.executeOperation(ctx, prepared);
    assert.equal(result.code, 0, result.error?.stack);
    assert.deepEqual(prepared.deactivation.platforms, ['claude', 'zeta']);
    assert.equal(prepared.deactivation.anchor, 'claude');
    assert.ok(locks.length > 0);
    for (const held of locks) assert.deepEqual(held, ['claude']);
    assert.deepEqual(result.messages, ['Mixed routing turned off.']);
    assert.deepEqual(homeBytes(targets.codex.home), codexBefore);
    for (const id of ['claude', 'zeta']) {
      assert.equal(fs.existsSync(active(ctx, id)), false);
      assert.equal(fs.existsSync(markerName(targets[id].home)), false);
      assert.deepEqual(routingNames(targets[id].home), []);
      for (const [name, bytes] of Object.entries(profiles[id])) {
        if (bytes[0] !== 'file') continue;
        const restored = prepared.deactivation.writes.find(write => write.path === path.join(targets[id].home, 'agents', name));
        assert.equal(restored?.bytes.toString('hex'), bytes[1]);
      }
      if (kind === 'install' || id === 'zeta') assert.deepEqual(homeBytes(path.join(targets[id].home, 'agents')), profiles[id]);
      else assert.equal(fs.existsSync(path.join(targets[id].home, 'skills/arc')), false);
    }
    assert.deepEqual(management.currentInstallState(ctx), {mode: 'standalone', platforms: [], anchor: null});
    assert.equal((await management.prepareOperation(ctx, {kind: 'install', target: 'claude'})).kind, 'install');
  });
}

const zetaLease = (id, state, route = 'bridge') => ({...moveLease(id, state, route), hostPlatform: 'zeta', executionEnvironment: 'zeta-cli'});

test('publication accepts terminal zeta-host leases with the full registry', async t => {
  const fixture = await compositeFilesFixture(t, ['claude', 'zeta'], ['claude', 'zeta']);
  for (const state of ['completed', 'failed', 'cancelled']) await createLease(fixture.targets.claude.home, zetaLease(`publish-${state}`, state), fixture.context);
  const history = homeBytes(path.join(fixture.targets.claude.home, 'arc-role-dispatch'));
  const result = await publishCompositeFiles({context: fixture.context, prepared: prepareCompositeFiles(fixture)});
  assert.equal(result.published, true);
  assert.equal(state(fixture.context).mode, 'composite');
  assert.deepEqual(homeBytes(path.join(fixture.targets.claude.home, 'arc-role-dispatch')), history);
});

test('publication still blocks non-terminal zeta-host bridge leases', async t => {
  const fixture = await compositeFilesFixture(t, ['claude', 'zeta'], ['claude', 'zeta']);
  await createLease(fixture.targets.claude.home, zetaLease('publish-running', 'running'), fixture.context);
  const before = homeBytes(fixture.context.userHome);
  await assert.rejects(publishCompositeFiles({context: fixture.context, prepared: prepareCompositeFiles(fixture)}), error => {
    assert.equal(error.message, 'Active bridge dispatches block composite publication; finish or cancel them first');
    assert.equal(error.activation, 'held');
    assert.deepEqual(error.activeDispatches, ['publish-running']);
    return true;
  });
  assert.deepEqual(homeBytes(fixture.context.userHome), before);
});

test('anchor move accepts terminal zeta-host leases in both stores', async t => {
  const ctx = await zetaContext(t); await installAll(ctx, ['claude', 'codex', 'zeta']);
  await publishCodexAnchor(ctx);
  const targets = resolveTargets(ctx).targets, history = {};
  for (const id of ['claude', 'codex']) {
    for (const state of ['completed', 'failed', 'cancelled']) await createLease(targets[id].home, zetaLease(`${id}-${state}`, state), ctx);
    history[id] = homeBytes(path.join(targets[id].home, 'arc-role-dispatch'));
  }
  const result = await management.executeCompositeOperation(ctx, await prepareSetChange(ctx, ['claude', 'zeta'], 'zeta-terminal-move'));
  assert.equal(result.code, 0, result.error?.stack);
  assert.deepEqual(management.currentInstallState(ctx), {mode: 'composite', platforms: ['claude', 'zeta'], anchor: 'claude'});
  for (const id of ['claude', 'codex']) assert.deepEqual(homeBytes(path.join(targets[id].home, 'arc-role-dispatch')), history[id]);
});

test('anchor move still blocks non-terminal zeta-host native leases in either store', async t => {
  const ctx = await zetaContext(t); await installAll(ctx, ['claude', 'codex', 'zeta']);
  await publishCodexAnchor(ctx);
  const targets = resolveTargets(ctx).targets;
  for (const id of ['claude', 'codex']) {
    const dispatchId = `${id}-zeta-reserved`;
    await createLease(targets[id].home, zetaLease(dispatchId, 'reserved', 'native'), ctx);
    const prepared = await prepareSetChange(ctx, ['claude', 'zeta'], dispatchId);
    const before = homeBytes(ctx.userHome);
    const result = await management.executeCompositeOperation(ctx, prepared);
    assert.equal(result.activation, 'held');
    assert.equal(result.error?.message, 'Active dispatches block moving mixed routing; finish or cancel them first');
    assert.deepEqual(result.error.activeDispatches, [dispatchId]);
    assert.deepEqual(homeBytes(ctx.userHome), before);
    fs.unlinkSync(path.join(targets[id].home, 'arc-role-dispatch', `${dispatchId}.json`));
  }
});

for (const kind of ['install', 'uninstall']) {
  test(`standalone zeta ${kind} outside composite S needs no switch and preserves participants`, async t => {
    const ctx = await zetaContext(t); await installAll(ctx, ['claude', 'codex', 'zeta']);
    await managementPublish(ctx, {platforms: ['claude', 'codex']});
    const targets = resolveTargets(ctx).targets;
    const before = Object.fromEntries(['claude', 'codex'].map(id => [id, homeBytes(targets[id].home)]));
    await assert.rejects(management.prepareOperation(ctx, {kind, target: 'claude', removeCli: false}), {message: 'Mixed routing is active; confirm the switch first'});
    const prepared = await management.prepareOperation(ctx, {kind, target: 'zeta', language: 'ko', removeCli: false});
    assert.equal(prepared.kind, kind);
    const result = await management.executeOperation(ctx, prepared);
    assert.equal(result.code, 0, result.results.find(item => item.error)?.error?.stack);
    assert.equal(result.messages?.includes('Mixed routing turned off.') ?? false, false);
    for (const id of ['claude', 'codex']) assert.deepEqual(homeBytes(targets[id].home), before[id]);
    assert.deepEqual(management.currentInstallState(ctx), {mode: 'composite', platforms: ['claude', 'codex'], anchor: 'claude'});
    if (kind === 'install') assert.match(fs.readFileSync(path.join(targets.zeta.home, 'skills/arc/settings.toml'), 'utf8'), /ko/);
    else assert.equal(fs.existsSync(path.join(targets.zeta.home, 'skills/arc')), false);
  });
}
