import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {compositeContext, mixedConfig} from './fixtures/install-mode.mjs';
import {activePath, homeBytes, markerPath} from './fixtures/legacy-composite.mjs';
import {resolveTarget} from '../../lib/installer/targets.mjs';
import {collectInstalledState} from '../../lib/installer/upgrade-state.mjs';
import {buildUpgradePlans, upgradeInstalledTargets} from '../../lib/installer/upgrade.mjs';
import {installTargets} from '../../lib/installer/install.mjs';
import {verifyPayload} from '../../lib/installer/manifest.mjs';
import {reapplyConfiguration} from '../../lib/management/reapply.mjs';
import {currentInstallMode, executeOperation, prepareOperation} from '../../lib/management/operations.mjs';
import {loadStaticModelCatalog} from '../../lib/models/static-catalog.mjs';

const models = {claude: 'sonnet', codex: 'gpt-5.4', gemini: 'gemini-3-flash-preview', grok: 'grok-4.6'};
const json = filename => JSON.parse(fs.readFileSync(filename));
const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const extension = platform => platform === 'codex' ? 'toml' : 'md';
const agent = (context, platform, name) => path.join(resolveTarget(platform, context).home, 'agents', name + '.' + extension(platform));

async function manage(context, kind, target, options = {}) {
  return executeOperation(context, await prepareOperation(context, {kind, target, removeCli: false, ...options}));
}

function assertSuccess(result) {
  assert.equal(result.code, 0, result.error?.stack ?? result.results?.find(item => item.error)?.error?.stack);
}

async function standaloneOperation(context, operation, platform) {
  if (operation !== 'upgrade') return manage(context, operation, platform);
  const state = collectInstalledState(context);
  const plans = buildUpgradePlans({payload: verifyPayload(context), state, safeFs: context.safeFs});
  const result = await installTargets(plans, context);
  return {...result, code: result.results.every(item => item.status === 'installed') ? 0 : 1};
}

function writeAgent(filename, bytes) {
  fs.mkdirSync(path.dirname(filename), {recursive: true});
  fs.writeFileSync(filename, bytes);
}

function seedStandaloneLegacy(context, platform, owned) {
  const named = platform === 'codex' ? 'name = "arc_qa"\n' : `---\nname: arc-qa\ndescription: Legacy reviewer\nmodel: ${models[platform]}\n---\n`;
  const bytes = Buffer.from(named + (owned ? '[ARC role policy: contract begin]\n' : '') + 'Instructions\n');
  const filename = agent(context, platform, 'arc-qa');
  writeAgent(filename, bytes);
  return {filename, bytes};
}

async function seedActiveLegacy(context, platform, edited) {
  for (const [id, version] of [['gemini', '0.68.0'], ['grok', '1.0.0']]) {
    fs.writeFileSync(path.join(context.userHome, 'bin', id), `#!/bin/sh\n[ "$1" = --version ] && echo ${version}\n`, {mode: 0o755});
  }
  const config = await mixedConfig('legacy-before');
  if (!config.platforms.includes(platform)) config.platforms.push(platform);
  config.roles.arc_tester = {platform, ...(await loadStaticModelCatalog(platform)).catalog.pairs[0]};
  assertSuccess(await manage(context, 'install', 'composite', {config}));
  const active = activePath(context, 'claude'), old = json(active);
  old.version = 2;
  old.roles.arc_qa = old.roles.arc_tester;
  delete old.roles.arc_tester;
  const configBytes = Buffer.from(JSON.stringify(old));
  fs.writeFileSync(active, configBytes);

  const newProfile = agent(context, platform, 'arc-routing-tester');
  const filename = agent(context, platform, 'arc-routing-qa');
  const legacyBytes = Buffer.from(fs.readFileSync(newProfile, 'utf8').replace(platform === 'codex'
    ? 'name = "arc_routing_tester"' : 'name: arc-routing-tester',
  platform === 'codex' ? 'name = "arc_routing_qa"' : 'name: arc-routing-qa'));
  fs.unlinkSync(newProfile);
  const bytes = edited ? Buffer.concat([legacyBytes, Buffer.from('\nLocal customization\n')]) : legacyBytes;
  writeAgent(filename, bytes);
  for (const id of config.platforms) {
    const markerFile = markerPath(context, id), marker = json(markerFile);
    marker.configHash = hash(configBytes);
    if (id === platform) {
      marker.profiles.arc_qa = {path: 'agents/' + path.basename(filename), hash: hash(legacyBytes)};
      delete marker.profiles.arc_tester;
    }
    fs.writeFileSync(markerFile, JSON.stringify(marker));
  }
  return {active, config, newProfile, filename, bytes};
}

async function activeOperation(context, operation, fixture) {
  if (operation === 'uninstall') return manage(context, 'uninstall', 'all');
  if (operation === 'install') return manage(context, 'install', 'composite', {config: {...fixture.config, revision: 'legacy-after'}});
  const result = await upgradeInstalledTargets({...context, state: collectInstalledState(context)});
  assert.ok(result.results.every(item => item.status === 'installed'), result.results.find(item => item.error)?.error?.stack);
  return reapplyConfiguration(context);
}

for (const platform of Object.keys(models)) for (const operation of ['install', 'upgrade', 'uninstall']) {
  const suffix = ` (${platform} ${operation})`;

  test('owned legacy profile is removed' + suffix, async t => {
    const context = await compositeContext(t);
    if (operation !== 'install') assertSuccess(await manage(context, 'install', platform));
    const {filename} = seedStandaloneLegacy(context, platform, true);
    if (operation === 'upgrade') fs.unlinkSync(agent(context, platform, 'arc-tester'));
    const result = await standaloneOperation(context, operation, platform);
    assertSuccess(result);
    assert.equal(fs.existsSync(filename), false);
    assert.deepEqual(result.results[0].legacyResiduals, []);
    assert.equal(fs.existsSync(agent(context, platform, 'arc-tester')), operation !== 'uninstall');
  });

  test('foreign legacy profile is preserved and reported' + suffix, async t => {
    const context = await compositeContext(t);
    if (operation !== 'install') assertSuccess(await manage(context, 'install', platform));
    const {filename, bytes} = seedStandaloneLegacy(context, platform, false);
    const routing = agent(context, platform, 'arc-routing-qa');
    writeAgent(routing, bytes);
    const result = await standaloneOperation(context, operation, platform);
    assertSuccess(result);
    assert.deepEqual(fs.readFileSync(filename), bytes);
    assert.deepEqual(fs.readFileSync(routing), bytes);
    assert.deepEqual(result.results[0].legacyResiduals?.sort(), [filename, routing].sort());
  });

  test('failure rolls back legacy removal' + suffix, async t => {
    const context = await compositeContext(t);
    if (operation !== 'install') assertSuccess(await manage(context, 'install', platform));
    const {filename} = seedStandaloneLegacy(context, platform, true);
    const home = resolveTarget(platform, context).home, before = homeBytes(home);
    let removed = false;
    context.hooks = {fault(event) {
      if (event.phase !== 'after-publish' || event.path !== filename) return;
      removed = !fs.existsSync(filename);
      throw Error('Injected failure after legacy removal');
    }};
    const result = await standaloneOperation(context, operation, platform);
    assert.equal(result.code, 1);
    assert.equal(removed, true);
    assert.equal(result.results[0].rollback, 'restored');
    assert.deepEqual(homeBytes(home), before);
  });

  for (const edited of [false, true]) {
    test((edited ? 'active legacy composite keeps edited profile as residual' : 'active legacy composite migrates with matching hash') + suffix, async t => {
      const context = await compositeContext(t);
      const fixture = await seedActiveLegacy(context, platform, edited);
      const result = await activeOperation(context, operation, fixture);
      assertSuccess(result);
      assert.deepEqual(result.legacyResiduals, edited ? [fixture.filename] : []);
      if (edited) assert.deepEqual(fs.readFileSync(fixture.filename), fixture.bytes);
      else assert.equal(fs.existsSync(fixture.filename), false);
      if (operation === 'uninstall') {
        assert.equal(fs.existsSync(fixture.active), false);
        for (const id of fixture.config.platforms) assert.equal(fs.existsSync(markerPath(context, id)), false);
      } else {
        assert.equal(currentInstallMode(context), 'composite');
        assert.equal(Object.hasOwn(json(fixture.active).roles, 'arc_qa'), false);
        const profiles = json(markerPath(context, platform)).profiles;
        assert.equal(Object.hasOwn(profiles, 'arc_qa'), false);
        assert.deepEqual(profiles.arc_tester, {path: 'agents/' + path.basename(fixture.newProfile), hash: hash(fs.readFileSync(fixture.newProfile))});
      }
    });
  }
}
