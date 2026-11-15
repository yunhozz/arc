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
  assert.deepEqual(result.platforms, ['codex', 'claude']);
  assert.equal(result.anchor, 'codex');
});
test('unresolved platform outside S is ignored', async t => {
  const ctx = await compositeContext(t);
  await installAll(ctx, ['codex']);
  ctx.env.CLAUDE_CONFIG_DIR = path.join(ctx.userHome, 'other-claude');
  const result = state(ctx);
  assert.equal(result.mode, 'standalone');
  assert.deepEqual(result.homes, {codex: 'standalone', claude: 'unresolved'});
});
test('two active configs → unverified with both residual', async t => {
  const ctx = await composite(t);
  fs.copyFileSync(active(ctx, 'codex'), active(ctx, 'claude'));
  const result = state(ctx);
  assert.equal(result.mode, 'unverified');
  for (const id of ['codex', 'claude']) assert.ok(result.residualPaths.includes(active(ctx, id)));
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
test('active config not at anchor home → unverified', async t => {
  const ctx = await composite(t);
  const moved = active(ctx, 'claude');
  fs.renameSync(active(ctx, 'codex'), moved);
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
  assert.ok(result.residualPaths.includes(active(ctx, 'claude')));
});
test('injected v2 composite reaches profile ownership checks', async t => {
  const ctx = {...await composite(t), ...createTestRegistries()};
  ctx.env.ZETA_HOME = path.join(ctx.userHome, '.zeta');
  const resolved = resolveTargets(ctx).targets;
  const activeConfigPath = active(ctx, 'codex');
  const config = JSON.parse(fs.readFileSync(activeConfigPath));
  config.version = 2;
  config.platforms = ['codex', 'claude', 'zeta'];
  config.roles.arc_planner.platform = 'zeta';
  const bytes = Buffer.from(JSON.stringify(config));
  fs.writeFileSync(activeConfigPath, bytes);
  const digest = input => 'sha256:' + createHash('sha256').update(input).digest('hex');
  const markers = Object.fromEntries(['codex', 'claude'].map(id => [id, JSON.parse(fs.readFileSync(path.join(resolved[id].home, 'arc-role-platform-routing.prepared.json')))]));
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
  assert.deepEqual(result.platforms, ['codex', 'claude', 'zeta']);
  assert.deepEqual(result.homes, {codex: 'composite', claude: 'composite', zeta: 'composite'});
  assert.equal(result.anchor, 'codex');
  const options = {target: resolved.zeta, safeFs, activeConfigPath, runtimePlatforms: ctx.runtimePlatforms};
  assert.ok(inspectCompositeRemoval({...options, snapshot: new Map()}).removals.includes(profile));
  fs.appendFileSync(profile, '\nchanged');
  assert.ok(inspectCompositeRemoval({...options, snapshot: new Map()}).residualPaths.includes(profile));
  assert.equal(state(ctx).mode, 'unverified');
});
test('S member unresolved → unverified', async t => {
  const ctx = await composite(t);
  ctx.env.CLAUDE_CONFIG_DIR = path.join(ctx.userHome, 'other-claude');
  const result = state(ctx);
  assert.equal(result.mode, 'unverified');
  assert.equal(result.homes.claude, 'unresolved');
  assert.ok(result.residualPaths.includes(active(ctx, 'codex')));
});
test('zeta package passes verifyPayload with injected registry', t => {
  const manifest = new URL('../../MANIFEST.sha256', import.meta.url), before = fs.readFileSync(manifest);
  const root = zetaPackageFixture(t), registries = createTestRegistries();
  assert.ok(!root.startsWith(path.resolve(new URL('../../', import.meta.url).pathname)));
  assert.ok(fs.readFileSync(path.join(root, 'zeta/skill/models.toml')).equals(fs.readFileSync(path.join(root, 'claude/skill/models.toml'))));
  t.after(() => { assert.equal(fs.existsSync(root), false); assert.ok(fs.readFileSync(manifest).equals(before)); });
  const payload = verifyPayload({packageRoot: root, safeFs, ...registries});
  assert.deepEqual(Object.keys(payload.modelInputs), ['codex', 'claude', 'zeta']);
  const ordinary = staticPackageFixture(t);
  assert.deepEqual(Object.keys(verifyPayload({packageRoot: ordinary, safeFs}).modelInputs), ['codex', 'claude']);
  assert.throws(() => verifyPayload({packageRoot: root, safeFs}), {message: 'Payload verification failed: Duplicate, mutable or unexpected manifest entry: zeta/agents/arc-implementer.md'});
});
test('installAll installs zeta standalone', async t => {
  const ctx = await zetaContext(t);
  assert.equal(ctx.env.HOME, ctx.userHome);
  assert.notEqual(ctx.userHome, process.env.HOME);
  t.after(() => assert.equal(fs.existsSync(ctx.userHome), false));
  await installAll(ctx, ['codex', 'claude', 'zeta']);
  const result = state(ctx);
  assert.equal(result.mode, 'standalone');
  assert.deepEqual(result.homes, {codex: 'standalone', claude: 'standalone', zeta: 'standalone'});
  assert.deepEqual(collectInstalledState(ctx).targets.map(item => item.modelConfig.platform), ['codex', 'claude', 'zeta']);
  for (const id of ['codex', 'claude', 'zeta']) {
    const home = resolveTargets(ctx).targets[id].home;
    assert.ok(fs.readFileSync(path.join(home, 'skills/arc/SKILL.md')).length);
    assert.equal(fs.readdirSync(path.join(home, 'agents')).length, 5);
    for (const name of fs.readdirSync(path.join(home, 'agents'))) assert.ok(!fs.readFileSync(path.join(home, 'agents', name), 'utf8').includes('ARC_AGENT_FRAGMENT'));
  }
});

async function compositeFilesFixture(t, platforms, rolePlatforms) {
  const context = await zetaContext(t);
  await installAll(context, ['codex', 'claude', 'zeta']);
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

test('|S|=3 publish writes active only at anchor and markers in all homes', async t => {
  const fixture = await compositeFilesFixture(t, ['codex', 'claude', 'zeta'], ['codex', 'claude']);
  // A host needs no role model/profile inputs to receive its ownership marker.
  delete fixture.profileInputs.zeta;
  delete fixture.modelConfigs.zeta;
  const prepared = prepareCompositeFiles(fixture);
  const result = await publishCompositeFiles({context: fixture.context, prepared});
  assert.equal(result.published, true);
  const activeConfigPath = active(fixture.context, 'codex');
  const config = JSON.parse(fs.readFileSync(activeConfigPath));
  assert.equal(config.version, 2);
  assert.deepEqual(config.platforms, ['codex', 'claude', 'zeta']);
  for (const id of fixture.platforms) {
    assert.equal(fs.existsSync(active(fixture.context, id)), id === 'codex');
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
  for (const platforms of [['codex', 'claude', 'zeta'], ['claude', 'zeta']]) {
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
