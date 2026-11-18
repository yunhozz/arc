import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {compositeContext, mixedConfig} from './fixtures/install-mode.mjs';
import {zetaContext, installAll} from './fixtures/platforms/package-root.mjs';
import {createTestRegistries} from './fixtures/platforms/zeta.mjs';
import {resolveTargets} from '../../lib/installer/targets.mjs';
import {verifyPayload} from '../../lib/installer/manifest.mjs';
import {renderStandaloneProfiles} from '../../lib/installer/plan.mjs';
import {loadModelConfig} from '../../lib/models/index.mjs';
import {buildRoleRoutingConfig, ROUTING_ROLES} from '../../lib/runtime/role-routing-config.mjs';
import {prepareCompositeFiles, publishCompositeFiles, prepareCompositeDeactivation, publishCompositeDeactivation} from '../../lib/installer/role-routing.mjs';
import {prepareCompositeOperation} from '../../lib/management/operations.mjs';
import {loadRoleDefaults} from '../../lib/tui/setup.mjs';

// Reading directories can change atime; compare planned outputs, not observation timestamps.
const plannedOutput = ({snapshot, ...output}) => output;

async function routingInputs(t, injected) {
  const context = await (injected ? zetaContext(t) : compositeContext(t));
  await installAll(context, injected ? ['claude', 'codex', 'zeta'] : ['claude', 'codex']);
  const payload = verifyPayload(context);
  if (injected) Object.assign(context, createTestRegistries(['claude', 'zeta']));
  const platforms = injected ? ['claude', 'zeta'] : ['claude', 'codex'], anchor = platforms[0];
  const targets = resolveTargets(context).targets, profileInputs = {}, modelConfigs = {};
  for (const id of platforms) {
    modelConfigs[id] = loadModelConfig(fs.readFileSync(path.join(targets[id].home, 'skills/arc/models.toml')), id, context);
    profileInputs[id] = renderStandaloneProfiles({...context, payload, target: targets[id], modelConfig: modelConfigs[id], language: 'en'});
  }
  const pair = (await mixedConfig('residual-defaults')).roles.arc_planner;
  const roles = Object.fromEntries(ROUTING_ROLES.map(role => [role, {...pair}]));
  const config = buildRoleRoutingConfig({revision: 'residual-defaults', platforms, roles}, context);
  return {context, targets, platforms, anchor, config, profileInputs, modelConfigs, payload};
}

for (const injected of [false, true]) {
  const label = injected ? 'injected claude+zeta registry' : 'production defaults';
  test(`role-routing preparation preserves bytes and paths for ${label}`, async t => {
    const input = await routingInputs(t, injected);
    const explicit = prepareCompositeFiles(input);
    const {platforms, anchor, ...defaults} = input;
    const prepared = prepareCompositeFiles(defaults);
    assert.deepEqual(plannedOutput(prepared), plannedOutput(explicit));
    assert.deepEqual(prepared.platforms, platforms);
    assert.equal(prepared.anchor, anchor);
    const value = injected
      ? {version: 2, revision: input.config.revision, platforms: ['claude', 'zeta'], roles: input.config.roles}
      : {version: 2, revision: input.config.revision, platforms: ['claude', 'codex'], roles: input.config.roles};
    assert.equal(prepared.bytes.toString(), JSON.stringify(value, null, 2) + '\n');
    assert.ok(prepared.managedPaths.includes(path.join(input.targets[anchor].home, 'arc-role-platform-routing.json')));
  });

  test(`role-routing publication defaults preserve profile and marker bytes for ${label}`, async t => {
    const input = await routingInputs(t, injected), prepared = prepareCompositeFiles(input);
    const {platforms, anchor, ...defaults} = prepared;
    // Exercise publication fallback when no config platform list is supplied.
    const {platforms: configPlatforms, ...configWithoutPlatforms} = defaults.config;
    defaults.config = configWithoutPlatforms;
    assert.equal((await publishCompositeFiles({context: input.context, prepared: defaults})).published, true);
    const active = path.join(input.targets[anchor].home, 'arc-role-platform-routing.json');
    assert.deepEqual(fs.readFileSync(active), prepared.bytes);
    for (const id of platforms) {
      const marker = JSON.parse(fs.readFileSync(path.join(input.targets[id].home, 'arc-role-platform-routing.prepared.json')));
      assert.equal(marker.platform, id);
      assert.equal(marker.activeConfigPath, active);
      assert.deepEqual(Object.keys(marker.profiles), Object.keys(prepared.desired[id] ?? {}));
      for (const [role, bytes] of Object.entries(prepared.desired[id] ?? {})) {
        assert.deepEqual(fs.readFileSync(path.join(input.targets[id].home, marker.profiles[role].path)), bytes);
      }
    }
  });

  test(`role-routing deactivation defaults preserve restore bytes and paths for ${label}`, async t => {
    const input = await routingInputs(t, injected), prepared = prepareCompositeFiles(input);
    await publishCompositeFiles({context: input.context, prepared});
    const explicit = prepareCompositeDeactivation(input);
    const {platforms, anchor, ...defaults} = input;
    const removal = prepareCompositeDeactivation(defaults);
    assert.deepEqual(plannedOutput(removal), plannedOutput(explicit));
    const {anchor: omitted, ...publicationDefaults} = removal;
    await publishCompositeDeactivation({context: input.context, prepared: publicationDefaults});
    for (const filename of removal.removals) assert.equal(fs.existsSync(filename), false, filename);
    for (const write of removal.writes) assert.deepEqual(fs.readFileSync(write.path), write.bytes);
  });
}

test('management composite fallback keeps production v2 bytes, paths and options', async t => {
  const context = await compositeContext(t), config = await mixedConfig('management-default');
  const prepared = await prepareCompositeOperation(context, {kind: 'install', config});
  const explicit = await prepareCompositeOperation(context, {kind: 'install', config, platforms: ['claude', 'codex']});
  assert.deepEqual(prepared, explicit);
  assert.equal(prepared.files.bytes.toString(), JSON.stringify(config, null, 2) + '\n');
  assert.deepEqual(prepared.plans.map(plan => plan.target.platform), ['claude', 'codex']);
  assert.deepEqual(prepared.options, {target: 'composite'});
  assert.equal(prepared.files.anchor, 'claude');
});

test('management composite fallback includes injected host-only zeta in anchor order', async t => {
  const context = await zetaContext(t), config = await mixedConfig('management-injected');
  const prepared = await prepareCompositeOperation(context, {kind: 'install', config});
  assert.deepEqual(prepared.files.platforms, ['claude', 'codex', 'zeta']);
  assert.deepEqual(prepared.plans.map(plan => plan.target.platform), ['claude', 'codex', 'zeta']);
  assert.equal(prepared.config.version, 2);
  assert.equal(prepared.files.anchor, 'claude');
});

test('setup role defaults keep production values and unknown-target error', () => {
  const context = {packageRoot: new URL('../../', import.meta.url).pathname};
  for (const target of ['claude', 'codex']) {
    const modelConfig = loadModelConfig(fs.readFileSync(path.join(context.packageRoot, target, 'skill/models.toml')), target);
    assert.deepEqual(loadRoleDefaults({context, statuses: [], target}), modelConfig.roles);
    assert.deepEqual(loadRoleDefaults({context, statuses: [{platform: target, settings: {modelConfig}}], target}), modelConfig.roles);
  }
  assert.throws(() => loadRoleDefaults({context, statuses: [], target: 'missing'}), {name: 'ModelValidationError', message: 'Unsupported role target', code: 'ARC_MODEL_VALIDATION'});
});

test('setup role defaults honor injected registry for package and installed models', () => {
  const context = {packageRoot: '/fixture', ...createTestRegistries()};
  const roles = Object.fromEntries(ROUTING_ROLES.map(role => [role, {model: 'zeta-model', effort: 'high'}]));
  const text = 'version = 3\n' + ROUTING_ROLES.map(role => `[roles.${role}]\nmodel = "zeta-model"\neffort = "high"\n`).join('\n');
  const readText = filename => { assert.equal(filename, '/fixture/zeta/skill/models.toml'); return text; };
  assert.deepEqual(loadRoleDefaults({context, statuses: [], target: 'zeta', readText}), roles);
  const modelConfig = {platform: 'zeta', version: 3, roles};
  assert.deepEqual(loadRoleDefaults({context, statuses: [{platform: 'zeta', settings: {modelConfig}}], target: 'zeta', readText: () => assert.fail('installed settings take priority')}), roles);
});

// Platform branches stay in descriptor/adapter boundaries, including T12 bridge gates and session reservation.
test('Platform literal branches stay inside the platform hardcoding allowlist', () => {
  const violations = [];
  const runtimeAllowlist = /^(?:lib|shared\/skill)\/runtime\/(?:platform-registry\.mjs|adapters\/.*|capabilities\.mjs|role-bridge-args\.mjs|role-supervisor\.mjs|role-bridge\.mjs|role-dispatch-policy\.mjs|role-routing\.mjs|local-cli\.mjs)$/;
  for (const relative of ['lib', 'shared/skill/runtime']) {
    const directory = new URL('../../' + relative + '/', import.meta.url);
    for (const entry of fs.readdirSync(directory, {recursive: true, withFileTypes: true})) {
      if (!entry.isFile() || !entry.name.endsWith('.mjs')) continue;
      const filename = path.relative(new URL('../../', import.meta.url).pathname, path.join(entry.parentPath, entry.name)).split(path.sep).join('/');
      if (/^lib\/(?:platforms|watch)\//.test(filename) || runtimeAllowlist.test(filename)) continue;
      fs.readFileSync(new URL('../../' + filename, import.meta.url), 'utf8').split('\n').forEach((line, index) => {
        if (/===\s*['"](?:gemini|grok)['"]/.test(line)) violations.push(`${filename}:${index + 1}: ${line}`);
      });
    }
  }
  assert.deepEqual(violations, [], violations.join('\n'));
});
