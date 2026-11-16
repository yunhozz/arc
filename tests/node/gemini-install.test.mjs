import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createPlatformRegistry, DEFAULT_PLATFORM_REGISTRY} from '../../lib/runtime/platform-registry.mjs';
import {createInstallerRegistry, DEFAULT_INSTALLER_REGISTRY} from '../../lib/platforms/index.mjs';
import {prepareOperation, executeOperation} from '../../lib/management/operations.mjs';
import {collectStatus} from '../../lib/management/status.mjs';
import {collectInstalledState} from '../../lib/installer/upgrade-state.mjs';
import {verifyPayload} from '../../lib/installer/manifest.mjs';
import {compositeContext, roles} from './fixtures/install-mode.mjs';
import {refreshManifest} from './fixtures/static-references.mjs';

function verifiedRegistry({reverseDisplay = false} = {}) {
  const runtime = createPlatformRegistry(DEFAULT_PLATFORM_REGISTRY.platforms.map(p => ({...p,
    ...(reverseDisplay ? {displayOrder: 2 - p.displayOrder} : {}),
    ...(p.id === 'gemini' ? {capabilities: {...p.capabilities, ...Object.fromEntries(['install', 'standalone', 'nativeProfile', 'catalog'].map(key => [key, {state: 'verified'}]))}} : {}),
  })));
  return {runtimePlatforms: runtime, platforms: createInstallerRegistry({runtime, descriptors: runtime.platforms.map(p => ({...DEFAULT_INSTALLER_REGISTRY.getPlatform(p.id), runtime: p}))})};
}
async function contextFor(t, options) {return {...await compositeContext(t), ...verifiedRegistry(options)};}
async function install(context) {
  const prepared = await prepareOperation(context, {kind: 'install', target: 'gemini', language: 'en'});
  assert.ok(prepared.plans.every(plan => !plan.globalChanges.some(change => change.path.endsWith('/settings.json'))));
  const result = await executeOperation(context, prepared);
  assert.equal(result.code, 0, result.error?.stack ?? JSON.stringify(result.results));
  return prepared;
}
function files(root, prefix = '') {
  return Object.fromEntries(fs.readdirSync(path.join(root, prefix), {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const name = path.join(prefix, entry.name);
    return entry.isDirectory() ? Object.entries(files(root, name)) : [[name, fs.readFileSync(path.join(root, name)).toString('hex')]];
  }));
}

test('gemini standalone install layout', async t => {
  const context = await contextFor(t);
  await install(context);
  const home = path.join(context.userHome, '.gemini');
  assert.deepEqual(fs.readdirSync(path.join(home, 'agents')).sort(), roles.map(role => `arc-${role}.md`).sort());
  for (const name of ['SKILL.md', 'models.toml', 'settings.toml', 'limits.toml', 'references/coordination.md', 'runtime/cli.mjs', 'runtime/platform-registry.mjs']) assert.ok(fs.existsSync(path.join(home, 'skills/arc', name)), name);
  assert.match(fs.readFileSync(path.join(home, 'GEMINI.md'), 'utf8'), /<!-- arc:begin -->[\s\S]*~\/\.gemini\/skills\/arc\/SKILL.md[\s\S]*<!-- arc:end -->/);
  for (const role of roles) {
    const text = fs.readFileSync(path.join(home, 'agents', `arc-${role}.md`), 'utf8');
    assert.match(text, /^model: gemini-/m);
    assert.doesNotMatch(text, /ARC_AGENT_FRAGMENT|ARC_OUTPUT_LANGUAGE_POLICY|^effort:/m);
  }
  const payload = verifyPayload(context);
  assert.ok(payload.modelInputs.gemini, 'verified Gemini templates must be validated');
  const template = path.join(context.packageRoot, 'gemini/agents/arc-qa.md');
  fs.writeFileSync(template, fs.readFileSync(template, 'utf8').replace('{{ARC_AGENT_FRAGMENT:qa.contract-intro}}', ''));
  refreshManifest(context.packageRoot);
  assert.throws(() => verifyPayload(context), {code: 'ARC_PAYLOAD_VALIDATION', message: /Invalid profile markers/});
});

test('settings.json untouched', async t => {
  for (const existing of [null, Buffer.from('{ "user": true, "env": {"CUSTOM": "value"} }\r\n')]) {
    const context = await contextFor(t), filename = path.join(context.userHome, '.gemini/settings.json');
    if (existing) {fs.mkdirSync(path.dirname(filename)); fs.writeFileSync(filename, existing);}
    await install(context);
    if (existing) assert.deepEqual(fs.readFileSync(filename), existing);
    else assert.equal(fs.existsSync(filename), false);
  }
});

test('Gemini status remains installed when settings.json exists without a native concurrency reader', async t => {
  const context = await contextFor(t);
  await install(context);
  fs.writeFileSync(path.join(context.userHome, '.gemini/settings.json'), '{"user":true}\n');
  const statuses = await collectStatus({...context, env: {...context.env, PATH: ''}});
  const gemini = statuses.find(status => status.platform === 'gemini');
  assert.equal(gemini.state, 'installed', gemini.diagnostics[0]?.stack);
  assert.deepEqual(gemini.diagnostics, []);
});

test('Gemini installed-state collection accepts settings.json without a native concurrency reader', async t => {
  const context = await contextFor(t);
  await install(context);
  const filename = path.join(context.userHome, '.gemini/settings.json'), bytes = '{"user":true}\n';
  fs.writeFileSync(filename, bytes);
  const state = collectInstalledState(context);
  assert.deepEqual(state.targets.map(entry => entry.target.platform), ['gemini']);
  assert.equal(fs.readFileSync(filename, 'utf8'), bytes);
});

test('payload policy verification follows install capabilities and checks verified Gemini outputs', async t => {
  const context = await contextFor(t);
  const skill = path.join(context.packageRoot, 'gemini/skill/SKILL.md');
  const source = fs.readFileSync(skill, 'utf8');
  assert.ok(source.includes('- [platform.gemini]'));
  fs.writeFileSync(skill, source.replace('- [platform.gemini]', '- [platform.gemini] Stale notice.'));
  refreshManifest(context.packageRoot);
  const runtime = createPlatformRegistry(DEFAULT_PLATFORM_REGISTRY.platforms.map(p => p.id === 'gemini' ? {...p, capabilities: {...p.capabilities, install: {state: 'off'}, nativeProfile: {state: 'off'}, catalog: {state: 'off'}}} : p));
  const platforms = createInstallerRegistry({runtime, descriptors: runtime.platforms.map(p => ({...DEFAULT_INSTALLER_REGISTRY.getPlatform(p.id), runtime: p}))});
  assert.doesNotThrow(() => verifyPayload({...context, platforms, runtimePlatforms: runtime}));
  for (const candidate of [context, {...context, platforms: DEFAULT_INSTALLER_REGISTRY, runtimePlatforms: DEFAULT_PLATFORM_REGISTRY}]) {
    assert.throws(() => verifyPayload(candidate), {code: 'ARC_PAYLOAD_VALIDATION', message: /Stale role policy output: gemini\/skill\/SKILL\.md/});
  }
});

test('reinstall idempotent', async t => {
  const context = await contextFor(t);
  await install(context);
  const home = path.join(context.userHome, '.gemini'), before = files(home);
  await install(context);
  assert.deepEqual(files(home), before);
});

test('uninstall removes owned only', async t => {
  const context = await contextFor(t), home = path.join(context.userHome, '.gemini');
  fs.mkdirSync(path.join(home, 'agents'), {recursive: true});
  const user = new Map([['agents/my.md', Buffer.from('User agent\n')], ['settings.json', Buffer.from('User settings: opaque bytes\n')], ['GEMINI.md', Buffer.from('# User instructions\n\n')]]);
  for (const [name, bytes] of user) fs.writeFileSync(path.join(home, name), bytes);
  await install(context);
  const instruction = path.join(home, 'GEMINI.md');
  fs.appendFileSync(instruction, '# User footer\n');
  const before = fs.readFileSync(instruction, 'utf8');
  const outside = before.replace(/<!-- arc:begin -->[\s\S]*?<!-- arc:end -->/, '');
  const prepared = await prepareOperation(context, {kind: 'uninstall', target: 'gemini', removeCli: false});
  assert.ok(prepared.plans[0].summary.includes('Gemini settings.json is preserved.'));
  assert.equal((await executeOperation(context, prepared)).code, 0);
  assert.equal(fs.existsSync(path.join(home, 'skills/arc')), false);
  assert.deepEqual(fs.readdirSync(path.join(home, 'agents')), ['my.md']);
  for (const name of ['agents/my.md', 'settings.json']) assert.deepEqual(fs.readFileSync(path.join(home, name)), user.get(name));
  assert.equal(fs.readFileSync(instruction, 'utf8'), outside);
});

test('uninstall allowed with install capability off when traces exist', async t => {
  const context = await contextFor(t);
  await install(context);
  const runtime = createPlatformRegistry(DEFAULT_PLATFORM_REGISTRY.platforms.map(p => p.id === 'gemini' ? {...p, capabilities: {...p.capabilities, install: {state: 'off'}, nativeProfile: {state: 'off'}, catalog: {state: 'off'}}} : p));
  const platforms = createInstallerRegistry({runtime, descriptors: runtime.platforms.map(p => ({...DEFAULT_INSTALLER_REGISTRY.getPlatform(p.id), runtime: p}))});
  const off = {...context, platforms, runtimePlatforms: runtime};
  const prepared = await prepareOperation(off, {kind: 'uninstall', target: 'gemini', removeCli: false});
  assert.equal((await executeOperation(off, prepared)).code, 0);
  const remaining = files(path.join(context.userHome, '.gemini'));
  assert.deepEqual(Object.keys(remaining), ['GEMINI.md']);
  assert.doesNotMatch(Buffer.from(remaining['GEMINI.md'], 'hex').toString(), /arc:begin/);
});

test('uninstall order follows displayOrder', async t => {
  const context = await contextFor(t, {reverseDisplay: true});
  const prepared = await prepareOperation(context, {kind: 'uninstall', target: 'all', removeCli: false});
  assert.deepEqual(prepared.plans.map(plan => plan.target.platform), ['gemini', 'codex', 'claude']);
  const result = await executeOperation(context, prepared);
  assert.equal(result.code, 0);
  assert.deepEqual(result.results.map(item => item.platform), ['gemini', 'codex', 'claude']);
});
