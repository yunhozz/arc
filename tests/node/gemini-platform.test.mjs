import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {createPlatformRegistry, DEFAULT_PLATFORM_REGISTRY, getPlatform} from '../../lib/runtime/platform-registry.mjs';
import {createInstallerRegistry, DEFAULT_INSTALLER_REGISTRY} from '../../lib/platforms/index.mjs';
import {resolveTargets} from '../../lib/installer/targets.mjs';
import {resolveLocalCli, probePlatformAuth} from '../../lib/runtime/local-cli.mjs';
import {prepareOperation, executeOperation} from '../../lib/management/operations.mjs';
import {collectStatus} from '../../lib/management/status.mjs';
import {homeStatusLine} from '../../lib/tui/mode.mjs';
import {loadStaticModelCatalog} from '../../lib/models/static-catalog.mjs';
import {compositeContext, mixedConfig} from './fixtures/install-mode.mjs';
import {homeBytes} from './fixtures/legacy-composite.mjs';
import {POLICY_TARGETS, buildPolicyOutputs, validateRolePolicy} from '../../lib/policy/render.mjs';

// Missing registration or an enabled unverified capability must fail these boundaries.
test('Gemini registries agree in anchor and display order with install and nativeProfile verified', () => {
  for (const registry of [DEFAULT_PLATFORM_REGISTRY, DEFAULT_INSTALLER_REGISTRY]) {
    assert.deepEqual(registry.platformIds(), ['claude', 'codex', 'gemini']);
    for (const order of ['byAnchorOrder', 'byDisplayOrder']) assert.deepEqual(registry[order]().map(p => p.runtime?.id ?? p.id), ['claude', 'codex', 'gemini']);
  }
  const runtime = getPlatform('gemini');
  assert.equal(DEFAULT_INSTALLER_REGISTRY.getPlatform('gemini').runtime, runtime);
  assert.deepEqual(runtime.capabilities, {install: {state: 'verified'}, nativeProfile: {state: 'verified'}, ...Object.fromEntries(Object.entries({
    catalog: 'catalog not verified', standalone: 'standalone not verified', bridge: 'bridge contract not verified',
    compositeRole: 'composite role not verified', compositeHost: 'composite host not verified',
    authProbe: 'no official auth status command', watch: 'watch support out of scope',
  }).map(([key, reason]) => [key, {state: 'off', reason}]))});
  assert.equal(runtime.home.env, 'GEMINI_CLI_HOME');
  assert.deepEqual(runtime.cli, {command: 'gemini', supportedVersions: '>=0.68.0 <0.69.0'});
  assert.deepEqual(runtime.auth, {kind: 'none'});
  assert.deepEqual(runtime.models, {effortField: 'effort'});
  assert.equal(runtime.profile.ext, 'md');
  assert.equal(runtime.profile.standaloneName('arc_planner'), 'arc-planner');
  assert.equal(runtime.profile.routingName('arc_planner'), 'arc-routing-planner');
  assert.deepEqual(runtime.executionEnvironments, ['gemini-cli']);
});

test('gemini home env set is unresolved', () => {
  const context = {userHome: '/users/test', env: {}};
  assert.equal(resolveTargets(context).targets.gemini?.home, '/users/test/.gemini');
  for (const value of ['', '/custom', '~/.gemini']) {
    const result = resolveTargets({...context, env: {GEMINI_CLI_HOME: value}});
    assert.equal(result.targets.gemini, undefined);
    assert.deepEqual(result.unresolved.map(item => item.platform), ['gemini']);
  }
});

test('gemini home env set does not block codex/claude install', async t => {
  const context = await compositeContext(t);
  context.env.GEMINI_CLI_HOME = '/unverified-home';
  for (const target of ['claude', 'codex']) {
    const result = await executeOperation(context, await prepareOperation(context, {kind: 'install', target, language: 'en'}));
    assert.equal(result.code, 0, result.error?.stack);
  }
  const statuses = await collectStatus(context);
  for (const target of ['claude', 'codex']) assert.equal(statuses.find(status => status.platform === target).state, 'installed');
  assert.equal(fs.existsSync(path.join(context.userHome, '.gemini')), false);
});

test('Gemini catalog accepts only default effort and safe model identifiers', async () => {
  const result = await loadStaticModelCatalog('gemini');
  assert.equal(result.status, 'ready');
  const validate = getPlatform('gemini').routing.validatePair;
  for (const pair of result.catalog.pairs) {assert.equal(pair.effort, 'default'); assert.equal(validate(pair.model, pair.effort), true);}
  assert.equal(validate('gemini-x', 'high'), false);
  assert.equal(validate('gemini-x', 'default'), true);
  assert.equal(validate('provider/model:v1@alias+test-1.0', 'default'), true);
  for (const model of ['', '-gemini', 'gemini x', 'gemini\n', null]) assert.equal(validate(model, 'default'), false);
});

test('composite defaults exclude unverified Gemini but explicit participation is rejected', async t => {
  const context = await compositeContext(t);
  context.env.GEMINI_CLI_HOME = '/unverified-home';
  const config = await mixedConfig('gemini-off');
  const prepared = await prepareOperation(context, {kind: 'install', target: 'composite', config});
  assert.deepEqual(prepared.config.platforms, ['claude', 'codex']);
  assert.deepEqual(prepared.plans.map(plan => plan.target.platform), ['claude', 'codex']);
  assert.equal((await executeOperation(context, prepared)).code, 0);
  assert.equal(fs.existsSync(path.join(context.userHome, '.gemini')), false);
  await assert.rejects(prepareOperation(context, {kind: 'install', target: 'composite', config, platforms: ['claude', 'codex', 'gemini']}), {message: 'Gemini is not available: capability not verified'});
});

test('Gemini profiles render owned markdown and rename only the routing identity and revision', () => {
  const descriptor = DEFAULT_INSTALLER_REGISTRY.getPlatform('gemini'); assert.ok(descriptor);
  assert.equal(descriptor.payloadPrefix, 'gemini'); assert.equal(descriptor.instructionFile, 'GEMINI.md');
  assert.equal(descriptor.runtimeConfigFile, 'settings.json');
  assert.deepEqual(descriptor.globalPaths, ['GEMINI.md', 'settings.json']);
  assert.equal(descriptor.models.discover, null);
  assert.deepEqual(descriptor.runtimeConfig, {});
  assert.deepEqual(descriptor.isolationEnv('/work'), {});
  assert.equal(descriptor.uninstallSummary, 'Gemini settings.json is preserved.');
  for (const eol of ['\n', '\r\n']) for (const suffix of ['scouter', 'planner', 'implementer', 'qa', 'reviewer']) {
    const role = `arc_${suffix}`, source = `---\nname: arc-${suffix}\ndescription: Role instructions\nmodel: gemini-x\n---\n[ARC role policy: contract begin]\nInstructions\n[ARC role policy: contract end]\n`.replaceAll('\n', eol);
    const rendered = descriptor.profiles.render(source, role, {model: 'gemini-y', effort: 'default'});
    assert.equal(rendered.toString(), source.replace('model: gemini-x', 'model: gemini-y'));
    assert.equal(descriptor.profiles.isOwnedStandalone(rendered, role), true);
    assert.equal(descriptor.profiles.isOwnedStandalone(Buffer.from(rendered.toString().replace('[ARC role policy: contract begin]', '')), role), false);
    assert.doesNotMatch(rendered.toString().split(`---${eol}`)[1], /^effort:/m);
    const routed = descriptor.profiles.renameForRouting(rendered, role, 'rev-1');
    assert.equal(routed.toString(), rendered.toString().replace(`name: arc-${suffix}`, `name: arc-routing-${suffix}`).replace('description: Role instructions', 'description: Role instructions [arc-routing rev rev-1]'));
    assert.equal(descriptor.profiles.isOwnedStandalone(routed, role), false);
    assert.equal(routed.toString().replace(`name: arc-routing-${suffix}`, `name: arc-${suffix}`).replace(' [arc-routing rev rev-1]', ''), rendered.toString());
    for (const field of ['name', 'model']) assert.throws(() => descriptor.profiles.render(source.replace(new RegExp(`^${field}:.*\\r?\\n`, 'm'), ''), role, {model: 'gemini-y', effort: 'default'}));
    assert.throws(() => descriptor.profiles.renameForRouting(rendered, role, 'bad revision'));
  }
});

test('Gemini profiles reject non-string scalars, YAML syntax and malformed frontmatter', () => {
  const profiles = DEFAULT_INSTALLER_REGISTRY.getPlatform('gemini').profiles;
  const source = '---\nname: arc-qa\ndescription: Role instructions\nmodel: gemini-x\n---\n[ARC role policy: contract begin]\nInstructions\n[ARC role policy: contract end]\n';
  const malformed = [
    ...['[x]', '[]', ']x', '{a: b}', '- item', '? item', ': item', ',item', '@item', '`item', '%YAML 1.2',
      '|', '> text', '&anchor text', '*anchor', '!tag text', 'text # comment', '"text"', "'text'",
      'true', 'False', 'null', '~', 'yes', 'off', '123', '-1.5', '0x10', '.inf', '2026-11-16', 'text\u0001'].map(value => ({
      label: `description: ${value}`, text: source.replace('description: Role instructions', `description: ${value}`),
    })),
    {label: 'invalid opening delimiter', text: source.replace(/^---/, '--')},
    {label: 'invalid closing delimiter', text: source.replace('\n---\n[ARC', '\n--\n[ARC')},
    {label: 'duplicate key', text: source.replace('model: gemini-x', 'model: gemini-x\nmodel: gemini-y')},
    {label: 'effort key', text: source.replace('model: gemini-x', 'model: gemini-x\neffort: default')},
  ];
  for (const eol of ['\n', '\r\n']) for (const {label, text} of malformed) {
    const bytes = Buffer.from(text.replaceAll('\n', eol));
    assert.throws(() => profiles.render(bytes.toString(), 'arc_qa', {model: 'gemini-y', effort: 'default'}), {code: 'ARC_TARGET_CONFIGURATION'}, label);
    assert.equal(profiles.isOwnedStandalone(bytes, 'arc_qa'), false, label);
    assert.throws(() => profiles.renameForRouting(bytes, 'arc_qa', 'rev-1'), {code: 'ARC_TARGET_CONFIGURATION'}, label);
  }
  const rendered = profiles.render(source, 'arc_qa', {model: 'gemini-y', effort: 'default'});
  assert.deepEqual(profiles.render(rendered.toString(), 'arc_qa', {model: 'gemini-y', effort: 'default'}), rendered);
  const tagged = source.replace('Role instructions', 'Role instructions [arc-routing rev rev-1]');
  assert.equal(profiles.isOwnedStandalone(Buffer.from(tagged), 'arc_qa'), true);
  assert.equal(profiles.render(tagged, 'arc_qa', {model: 'gemini-x', effort: 'default'}).toString(), tagged);
});

test('L3 rendered Gemini routing profile has exactly the live-verified frontmatter keys', () => {
  const profiles = DEFAULT_INSTALLER_REGISTRY.getPlatform('gemini').profiles;
  const source = fs.readFileSync(new URL('../../gemini/agents/arc-scouter.md', import.meta.url), 'utf8');
  const rendered = profiles.render(source, 'arc_scouter', {model: 'gemini-2.5-flash', effort: 'default'});
  const routed = profiles.renameForRouting(rendered, 'arc_scouter', 'l3-rev-b').toString();
  assert.deepEqual(routed.split('---')[1].trim().split(/\r?\n/).map(line => line.split(':')[0]), ['name', 'description', 'model']);
});

test('L1 operational Gemini install verification still refuses standalone management without file changes', async t => {
  const context = await compositeContext(t);
  assert.equal(getPlatform('gemini').capabilities.standalone.state, 'off');
  const before = homeBytes(context.userHome);
  await assert.rejects(prepareOperation(context, {kind: 'install', target: 'gemini'}), {message: 'Gemini is not available: capability not verified'});
  assert.deepEqual(homeBytes(context.userHome), before);
  const prepared = await prepareOperation(context, {kind: 'install', target: 'all'});
  assert.deepEqual(prepared.plans.map(plan => plan.target.platform), ['claude', 'codex']);
  const statuses = await collectStatus(context);
  assert.equal(homeStatusLine(statuses), 'Claude: Not Available / Codex: Not Available / Gemini: Not Available');
  assert.deepEqual(homeBytes(context.userHome), before);
  assert.equal(fs.existsSync(path.join(context.userHome, '.gemini')), false);
});

test('L1 operational Gemini home follows CLI status with auth none after install verification', () => {
  for (const [cliVersion, authentication, want] of [
    [{version: null, reason: 'cli_not_found'}, {authStatus: 'unknown', reason: 'auth_unverified'}, 'Gemini: Not Available'],
    [{version: '0.68.0'}, {authStatus: 'unknown', reason: 'cli_not_found'}, 'Gemini: Not Available'],
    [{version: '0.69.0'}, {authStatus: 'unknown', reason: 'auth_unverified'}, 'Gemini: Unsupported version'],
    [{version: '0.68.0'}, {authStatus: 'unknown', reason: 'auth_unverified'}, 'Gemini: Available (auth unverified)'],
  ]) assert.equal(homeStatusLine([{platform: 'gemini', state: 'absent', cliVersion, authentication}]), want);
});

test('Gemini auth none probe does not spawn and returns unknown', async t => {
  const context = await compositeContext(t);
  fs.writeFileSync(path.join(context.userHome, 'bin/gemini'), '#!/bin/sh\nexit 99\n', {mode: 0o755});
  const cli = resolveLocalCli('gemini', context); assert.equal(cli.reason, undefined);
  const spawn = t.mock.method(childProcess, 'spawn', () => assert.fail('Gemini auth must not spawn'));
  syncBuiltinESMExports(); t.after(() => {spawn.mock.restore(); syncBuiltinESMExports();});
  assert.deepEqual(await probePlatformAuth(cli), {authStatus: 'unknown', reason: 'auth_unverified'});
});

test('range out version unsupported after install verification while off takes precedence', () => {
  const status = {platform: 'gemini', state: 'installed', authentication: {authStatus: 'unknown', reason: 'auth_unverified'}, cliVersion: {version: '0.69.0'}};
  assert.equal(homeStatusLine([status]), 'Gemini: Unsupported version');
  assert.ok(getPlatform('gemini'));
  const runtime = createPlatformRegistry(DEFAULT_PLATFORM_REGISTRY.platforms.map(p => p.id === 'gemini' ? {...p, capabilities: {...p.capabilities, install: {state: 'off'}, nativeProfile: {state: 'off'}}} : p));
  const registry = createInstallerRegistry({runtime, descriptors: runtime.platforms.map(p => ({...DEFAULT_INSTALLER_REGISTRY.getPlatform(p.id), runtime: p}))});
  assert.equal(homeStatusLine([status], registry), 'Gemini: Not verified');
});

test('Gemini controls preserve codex/claude policy outputs byte for byte with Gemini payload targets', () => {
  const policy = JSON.parse(fs.readFileSync(new URL('../../lib/policy/role-policy.json', import.meta.url)));
  for (const rule of policy.rules) assert.equal(rule.controls.gemini, 'prompt');
  assert.doesNotThrow(() => validateRolePolicy(policy));
  assert.ok(POLICY_TARGETS.some(target => target.platform === 'gemini'));
  assert.ok(POLICY_TARGETS.every(target => ['codex', 'claude', 'gemini'].includes(target.platform)));
  const inputs = new Map(POLICY_TARGETS.map(target => [target.path, fs.readFileSync(new URL('../../' + target.path, import.meta.url))]));
  assert.deepEqual(buildPolicyOutputs(inputs, policy), inputs);
});
