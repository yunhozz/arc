import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DEFAULT_PLATFORM_REGISTRY, getPlatform} from '../../lib/runtime/platform-registry.mjs';
import {DEFAULT_INSTALLER_REGISTRY} from '../../lib/platforms/index.mjs';
import {collectStatus} from '../../lib/management/status.mjs';
import {prepareOperation, executeOperation} from '../../lib/management/operations.mjs';
import {homeStatusLine} from '../../lib/tui/mode.mjs';
import {grokOffRegistries, writeFakeGrokCli} from './fixtures/platforms/grok-off.mjs';
import {statusInfo} from '../../lib/tui/mode.mjs';
import {loadStaticModelCatalog} from '../../lib/models/static-catalog.mjs';
import {discoverModelCatalog} from '../../lib/models/catalog.mjs';
import {TargetConfigurationError} from '../../lib/installer/target-errors.mjs';
import {compositeContext, mixedConfig, safeFs} from './fixtures/install-mode.mjs';
import {homeBytes} from './fixtures/legacy-composite.mjs';
import {ZETA_CAPABILITY_OFF, ZETA_AUTH_NONE, createZetaRegistries} from './fixtures/platforms/zeta.mjs';

const descriptor = () => {const value = getPlatform('grok'); assert.ok(value, 'Grok descriptor is required'); return value;};
const source = '---\nname: arc-planner\ndescription: Plan carefully\nmodel: grok-4.6\n---\n[ARC role policy: contract begin]\nPlan the work.\n';
const setting = {model: 'grok-test', effort: 'default'};

// Missing registration, premature capability promotion and unsafe scalar acceptance break these boundaries.
test('AC-K1 Grok registries agree in anchor and display order with descriptor references', () => {
  for (const registry of [DEFAULT_PLATFORM_REGISTRY, DEFAULT_INSTALLER_REGISTRY]) {
    assert.deepEqual(registry.platformIds(), ['claude', 'codex', 'gemini', 'grok']);
    for (const order of ['byAnchorOrder', 'byDisplayOrder']) assert.deepEqual(registry[order]().map(p => p.runtime?.id ?? p.id), ['claude', 'codex', 'gemini', 'grok']);
  }
  const p = descriptor(), installer = DEFAULT_INSTALLER_REGISTRY.getPlatform('grok');
  assert.equal(installer.runtime, p);
  assert.equal(p.label, 'Grok'); assert.equal(p.displayOrder, 3); assert.equal(p.anchorOrder, 3);
  assert.equal(p.home.env, 'GROK_HOME');
  assert.deepEqual(p.cli, {command: 'grok', supportedVersions: '>=1.0.0 <1.1.0'});
  assert.deepEqual(p.auth, {kind: 'none'}); assert.deepEqual(p.models, {effortField: 'effort'});
  assert.equal(p.profile.ext, 'md');
  assert.equal(p.profile.standaloneName('arc_planner'), 'arc-planner');
  assert.equal(p.profile.routingName('arc_planner'), 'arc-routing-planner');
  assert.deepEqual(p.executionEnvironments, ['grok-cli']);
  assert.equal(installer.payloadPrefix, 'grok');
  assert.deepEqual(installer.instructionTemplates, ['AGENTS.md', 'instructions.md']);
  assert.equal(installer.instructionFile, 'AGENTS.md'); assert.equal(installer.runtimeConfigFile, 'config.toml');
  assert.deepEqual(installer.globalPaths, ['AGENTS.md', 'config.toml']);
  assert.equal(typeof installer.runtimeConfig.globalRender, 'function');
  assert.equal(typeof installer.runtimeConfig.globalRemove, 'function');
  assert.deepEqual(Object.keys(installer.runtimeConfig), ['globalRender', 'globalRemove']); assert.deepEqual(installer.isolationEnv(), {});
  assert.equal(installer.uninstallSummary, 'Grok config.toml is preserved except ARC-managed [compat.claude] lines.');
  assert.equal(Object.hasOwn(installer.models, 'discover'), false);
});

test('GROK_HOME set throws GROK_HOME is not verified', () => {
  const p = descriptor();
  assert.equal(p.home.resolve({userHome: '/users/test', env: {}}), '/users/test/.grok');
  for (const value of ['', '/custom', '~/.grok']) assert.throws(() => p.home.resolve({userHome: '/users/test', env: {GROK_HOME: value}}), {message: 'GROK_HOME is not verified'});
});

test('GROK_HOME set does not block other platforms', async t => {
  descriptor();
  const ctx = await compositeContext(t); ctx.env.GROK_HOME = '/unverified-home';
  const statuses = await collectStatus(ctx);
  for (const id of ['claude', 'codex', 'gemini']) assert.equal(statuses.find(s => s.platform === id).state, 'absent');
  assert.equal(statuses.find(s => s.platform === 'grok').state, 'incomplete');
  const text = statusInfo({mode: 'standalone', platforms: []}, statuses).info.join('\n');
  assert.match(text, /Grok +Unsupported version/); assert.match(text, /GROK_HOME is not verified \(Grok\)/);
  assert.doesNotMatch(text, /capability not verified/);
  assert.equal((await prepareOperation(ctx, {kind: 'install', target: 'codex', language: 'en'})).plans[0].target.platform, 'codex');
});

test('AC-K2 Grok capabilities match the verified and off contract', () => {
  assert.deepEqual(descriptor().capabilities, {
    ...Object.fromEntries(['install', 'nativeProfile', 'catalog', 'standalone', 'bridge', 'compositeRole', 'compositeHost'].map(key => [key, {state: 'verified'}])),
    authProbe: {state: 'off', reason: 'no official auth status command'},
    watch: {state: 'off', reason: 'watch support out of scope'},
  });
});

test('AC-K10 Grok catalog pairs use default effort and safe model identifiers', async () => {
  const validate = descriptor().routing.validatePair, result = await loadStaticModelCatalog('grok');
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.catalog, {platform: 'grok', pairs: ['grok-4.6', 'grok-4.5'].map(model => ({model, effort: 'default'}))});
  for (const pair of result.catalog.pairs) {assert.equal(pair.effort, 'default'); assert.match(pair.model, /^[A-Za-z0-9][A-Za-z0-9._:/@+\-]*$/); assert.equal(validate(pair.model, pair.effort), true);}
  for (const [model, effort] of [['grok-4.6', 'high'], ['-grok', 'default'], ['grok 4', 'default'], ['', 'default'], ['grok\n', 'default'], [null, 'default']]) assert.equal(validate(model, effort), false);
  assert.equal((await discoverModelCatalog({platform: 'grok'})).status, 'unavailable');
  assert.equal(fs.readFileSync(new URL('../../lib/models/grok-models.json', import.meta.url), 'utf8'), '{\n  "platform": "grok",\n  "pairs": [\n    {"model": "grok-4.6", "effort": "default"},\n    {"model": "grok-4.5", "effort": "default"}\n  ]\n}\n');
});

test('AC-K9 Grok render ownership and routing round trip uses exactly three frontmatter keys', () => {
  descriptor(); const format = DEFAULT_INSTALLER_REGISTRY.getPlatform('grok').profiles;
  for (const eol of ['\n', '\r\n']) {
    const rendered = format.render(source.replaceAll('\n', eol), 'arc_planner', setting);
    assert.equal(format.isOwnedStandalone(rendered, 'arc_planner'), true);
    assert.equal(format.isOwnedStandalone(rendered, 'arc_qa'), false);
    assert.deepEqual(rendered.toString().split(/\r?\n---\r?\n/)[0].split(/\r?\n/).slice(1).map(line => line.split(':')[0]), ['name', 'description', 'model']);
    assert.match(rendered.toString(), /model: grok-test/);
    assert.doesNotMatch(rendered.toString(), /model: grok-4.6/);
    assert.doesNotMatch(rendered.toString(), /permissionMode|disallowedTools|tools|effort:/);
    const routing = format.renameForRouting(rendered, 'arc_planner', 't3-revision');
    assert.match(routing.toString(), /name: arc-routing-planner/);
    assert.match(routing.toString(), /description: Plan carefully \[arc-routing rev t3-revision\]/);
    assert.equal(format.isOwnedStandalone(routing, 'arc_planner'), false);
    assert.deepEqual(format.render(routing.toString().replace('name: arc-routing-planner', 'name: arc-planner').replace(' [arc-routing rev t3-revision]', ''), 'arc_planner', setting), rendered);
  }
});

test('AC-K9 Grok rejects effort missing fields empty instructions and invalid scalars', () => {
  descriptor(); const format = DEFAULT_INSTALLER_REGISTRY.getPlatform('grok').profiles;
  const invalid = [source.replace('model:', 'effort: high\nmodel:'), source.replace('name: arc-planner\n', ''), source.replace('model: grok-4.6\n', ''), source.slice(0, source.indexOf('[ARC'))];
  for (const scalar of ['[x]', '"[x]"', '- item', '|', '>', '&a', '*a']) invalid.push(source.replace('Plan carefully', scalar));
  for (const text of invalid) {
    assert.throws(() => format.render(text, 'arc_planner', setting), /Grok/);
    assert.equal(format.isOwnedStandalone(Buffer.from(text), 'arc_planner'), false);
    assert.throws(() => format.renameForRouting(Buffer.from(text), 'arc_planner', 'rev'), /Grok/);
  }
});

for (const [key, value] of [['tools', 'Read'], ['permissionMode', 'default'], ['disallowedTools', 'Bash'], ['extra', 'value']]) {
  const text = source.replace('model:', `${key}: ${value}\nmodel:`);
  test(`AC-K9 Grok render rejects extra ${key} frontmatter`, () => {
    descriptor(); const format = DEFAULT_INSTALLER_REGISTRY.getPlatform('grok').profiles;
    assert.throws(() => format.render(text, 'arc_planner', setting), TargetConfigurationError);
  });
  test(`AC-K9 Grok ownership rejects extra ${key} frontmatter`, () => {
    descriptor(); const format = DEFAULT_INSTALLER_REGISTRY.getPlatform('grok').profiles;
    assert.equal(format.isOwnedStandalone(Buffer.from(text), 'arc_planner'), false);
  });
  test(`AC-K9 Grok routing rejects extra ${key} frontmatter`, () => {
    descriptor(); const format = DEFAULT_INSTALLER_REGISTRY.getPlatform('grok').profiles;
    assert.throws(() => format.renameForRouting(Buffer.from(text), 'arc_planner', 'rev'), TargetConfigurationError);
  });
}

test('AC-K3 management refuses Grok install and composite without changing HOME', async t => {
  descriptor(); const ctx = {...await compositeContext(t), ...grokOffRegistries()}, before = homeBytes(ctx.userHome);
  await assert.rejects(prepareOperation(ctx, {kind: 'install', target: 'grok'}), {message: 'Grok is not available: capability not verified'});
  await assert.rejects(prepareOperation(ctx, {kind: 'install', target: 'composite', platforms: ['claude', 'codex', 'grok'], config: await mixedConfig('t3-off')}), {message: 'Grok is not available: capability not verified'});
  assert.deepEqual(homeBytes(ctx.userHome), before);
});

test('AC-K3 target all install preset and uninstall plans exclude Grok', async t => {
  descriptor(); const ctx = {...await compositeContext(t), ...grokOffRegistries()};
  const install = await prepareOperation(ctx, {kind: 'install', target: 'all', language: 'en'});
  assert.deepEqual(install.plans.map(p => p.target.platform), ['claude', 'codex', 'gemini']);
  assert.equal((await executeOperation(ctx, install)).code, 0);
  for (const kind of ['preset', 'uninstall']) {
    const prepared = await prepareOperation(ctx, {kind, target: 'all', removeCli: false});
    assert.deepEqual(prepared.plans.map(p => p.target.platform), ['claude', 'codex', 'gemini']);
  }
});

test('AC-K3 target all install preset and uninstall plans include Grok', async t => {
  descriptor(); const ctx = await compositeContext(t);
  const install = await prepareOperation(ctx, {kind: 'install', target: 'all', language: 'en'});
  assert.deepEqual(install.plans.map(p => p.target.platform), ['claude', 'codex', 'gemini', 'grok']);
  assert.equal((await executeOperation(ctx, install)).code, 0);
  for (const kind of ['preset', 'uninstall']) {
    const prepared = await prepareOperation(ctx, {kind, target: 'all', removeCli: false});
    assert.deepEqual(prepared.plans.map(p => p.target.platform), ['claude', 'codex', 'gemini', 'grok']);
  }
});

test('AC-K3 status skips Grok CLI and auth probes', async t => {
  descriptor(); const ctx = {...await compositeContext(t), ...grokOffRegistries()}, status = (await collectStatus(ctx)).find(s => s.platform === 'grok');
  assert.deepEqual(status.cliVersion, {version: null, reason: 'capability_not_verified'});
  assert.deepEqual(status.authentication, {authStatus: 'unknown', reason: 'capability_not_verified'});
});

test('fake grok on PATH is never executed', async t => {
  descriptor(); const ctx = {...await compositeContext(t), ...grokOffRegistries()}, marker = path.join(ctx.userHome, 'grok-executed');
  writeFakeGrokCli({bin: path.join(ctx.userHome, 'bin'), marker});
  await collectStatus(ctx);
  await assert.rejects(prepareOperation(ctx, {kind: 'install', target: 'grok'}), /Grok is not available: capability not verified/);
  await assert.rejects(prepareOperation(ctx, {kind: 'install', target: 'composite', platforms: ['claude', 'codex', 'grok'], config: await mixedConfig('fake-grok')}), /Grok is not available: capability not verified/);
  const install = await prepareOperation(ctx, {kind: 'install', target: 'all', language: 'en'});
  assert.equal(install.plans.some(p => p.target.platform === 'grok'), false);
  const removal = await prepareOperation(ctx, {kind: 'uninstall', target: 'grok', removeCli: false});
  assert.equal((await executeOperation(ctx, removal)).code, 0);
  assert.equal(fs.existsSync(marker), false);
});

// Removing the install gate must execute the marker even for a non-Grok descriptor.
for (const auth of ['none', 'cli-status-json', 'codex-refresh']) test(`P-K7 install off skips all probes for injected ${auth} platform`, async t => {
  const userHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'arc-grok-probe-')));
  t.after(() => fs.rmSync(userHome, {recursive: true, force: true}));
  const marker = path.join(userHome, 'executed');
  fs.writeFileSync(path.join(userHome, 'zeta'), `#!/bin/sh\nprintf executed > '${marker}'\nprintf 'zeta 1.0.0\\n'\n`, {mode: 0o755});
  const ctx = {userHome, cwd: userHome, env: {PATH: userHome}, safeFs, ...createZetaRegistries({...ZETA_CAPABILITY_OFF, auth: {kind: auth}})};
  const status = (await collectStatus(ctx)).find(s => s.platform === 'zeta');
  assert.equal(fs.existsSync(marker), false);
  assert.deepEqual(status.cliVersion, {version: null, reason: 'capability_not_verified'});
  assert.deepEqual(status.authentication, {authStatus: 'unknown', reason: 'capability_not_verified'});
});

test('P-K7 install verified retains the CLI version probe', async t => {
  const userHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'arc-grok-verified-')));
  t.after(() => fs.rmSync(userHome, {recursive: true, force: true}));
  const marker = path.join(userHome, 'commands');
  fs.writeFileSync(path.join(userHome, 'zeta'), `#!/bin/sh\nprintf '%s\\n' "$*" >> '${marker}'\nprintf 'zeta 1.0.0\\n'\n`, {mode: 0o755});
  const statuses = await collectStatus({userHome, cwd: userHome, env: {PATH: userHome}, safeFs, ...createZetaRegistries(ZETA_AUTH_NONE)});
  assert.deepEqual(statuses.find(s => s.platform === 'zeta').cliVersion, {version: '1.0.0'});
  assert.equal(fs.readFileSync(marker, 'utf8'), '--version\n');
});

test('AC-K7 every controls entry has grok prompt with platforms.grok payload metadata', () => {
  const policy = JSON.parse(fs.readFileSync(new URL('../../lib/policy/role-policy.json', import.meta.url)));
  let count = 0;
  const visit = value => {if (!value || typeof value !== 'object') return; if (value.controls) {count++; assert.equal(value.controls.grok, 'prompt');} for (const child of Object.values(value)) visit(child);};
  visit(policy); assert.equal(count, 16); assert.equal(Object.hasOwn(policy.platforms, 'grok'), true);
});

test('operational Grok status without CLI', async t => {
  const ctx = await compositeContext(t), statuses = await collectStatus(ctx), status = statuses.find(item => item.platform === 'grok');
  assert.deepEqual(status.cliVersion, {version: null, reason: 'cli_not_found'});
  assert.deepEqual(status.authentication, {authStatus: 'unknown', reason: 'auth_unverified'});
  assert.match(statusInfo({mode: 'standalone', platforms: []}, statuses).info.join('\n'), /Grok +Not Available/);
});

test('operational Grok status runs only --version', async t => {
  const ctx = await compositeContext(t), marker = path.join(ctx.userHome, 'grok-commands');
  writeFakeGrokCli({bin: path.join(ctx.userHome, 'bin'), marker});
  const statuses = await collectStatus(ctx), status = statuses.find(item => item.platform === 'grok');
  assert.deepEqual(status.cliVersion, {version: '1.0.89'});
  assert.deepEqual(status.authentication, {authStatus: 'unknown', reason: 'auth_unverified'});
  assert.equal(fs.readFileSync(marker, 'utf8'), '--version\n');
  assert.match(statusInfo({mode: 'standalone', platforms: []}, statuses).info.join('\n'), /Grok +Available · auth unverified/);
  assert.ok(homeStatusLine(statuses).includes('Grok: Available (auth unverified)'));
});

test('operational Grok status rejects an unsupported CLI version', async t => {
  const ctx = await compositeContext(t), marker = path.join(ctx.userHome, 'grok-commands');
  writeFakeGrokCli({bin: path.join(ctx.userHome, 'bin'), marker, version: '1.1.0'});
  const statuses = await collectStatus(ctx);
  assert.deepEqual(statuses.find(item => item.platform === 'grok').cliVersion, {version: '1.1.0'});
  assert.match(statusInfo({mode: 'standalone', platforms: []}, statuses).info.join('\n'), /Grok +Unsupported version/);
  assert.equal(fs.readFileSync(marker, 'utf8'), '--version\n');
});
