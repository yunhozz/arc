import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createPlatformRegistry, DEFAULT_PLATFORM_REGISTRY} from '../../lib/runtime/platform-registry.mjs';
import {createInstallerRegistry, DEFAULT_INSTALLER_REGISTRY} from '../../lib/platforms/index.mjs';
import {prepareOperation, executeOperation} from '../../lib/management/operations.mjs';
import {collectStatus} from '../../lib/management/status.mjs';
import {collectInstalledState} from '../../lib/installer/upgrade-state.mjs';
import {homeBytes} from './fixtures/legacy-composite.mjs';
import {runTui} from '../../lib/tui/app.mjs';
import {spawnSync} from 'node:child_process';
import {staticPackageFixture} from './fixtures/static-references.mjs';
import {parseToml} from '../../lib/models/config.mjs';
import {verifyPayload} from '../../lib/installer/manifest.mjs';
import {compositeContext, roles} from './fixtures/install-mode.mjs';
import {refreshManifest} from './fixtures/static-references.mjs';

function verifiedRegistry({reverseDisplay = false} = {}) {
  const runtime = createPlatformRegistry(DEFAULT_PLATFORM_REGISTRY.platforms.map(p => ({...p,
    ...(reverseDisplay ? {displayOrder: 3 - p.displayOrder} : {}),
    ...(p.id === 'grok' ? {capabilities: {...p.capabilities, ...Object.fromEntries(['install', 'standalone', 'nativeProfile', 'catalog'].map(key => [key, {state: 'verified'}]))}} : {}),
  })));
  return {runtimePlatforms: runtime, platforms: createInstallerRegistry({runtime, descriptors: runtime.platforms.map(p => ({...DEFAULT_INSTALLER_REGISTRY.getPlatform(p.id), runtime: p}))})};
}
async function contextFor(t, options) {return {...await compositeContext(t), ...verifiedRegistry(options)};}
async function install(context) {
  const prepared = await prepareOperation(context, {kind: 'install', target: 'grok', language: 'en'});
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

test('grok standalone install layout', async t => {
  const context = await contextFor(t);
  await install(context);
  const home = path.join(context.userHome, '.grok');
  assert.deepEqual(fs.readdirSync(path.join(home, 'agents')).sort(), roles.map(role => `arc-${role}.md`).sort());
  for (const name of ['SKILL.md', 'models.toml', 'settings.toml', 'limits.toml', 'references/coordination.md', 'runtime/cli.mjs', 'runtime/platform-registry.mjs']) assert.ok(fs.existsSync(path.join(home, 'skills/arc', name)), name);
  assert.match(fs.readFileSync(path.join(home, 'AGENTS.md'), 'utf8'), /<!-- arc:begin -->[\s\S]*~\/\.grok\/skills\/arc\/SKILL.md[\s\S]*<!-- arc:end -->/);
  assert.equal(fs.readdirSync(path.join(home, 'skills/arc/references')).filter(name => fs.existsSync(path.join(context.packageRoot, 'grok/skill/references', name))).length, 10);
  for (const role of roles) {
    const text = fs.readFileSync(path.join(home, 'agents', `arc-${role}.md`), 'utf8');
    assert.match(text, /^model: grok-4\.6$/m);
    assert.doesNotMatch(text, /ARC_AGENT_FRAGMENT|ARC_OUTPUT_LANGUAGE_POLICY|^effort:/m);
  }
  const payload = verifyPayload(context);
  assert.ok(payload.modelInputs.grok, 'verified Grok templates must be validated');
  const template = path.join(context.packageRoot, 'grok/agents/arc-qa.md');
  fs.writeFileSync(template, fs.readFileSync(template, 'utf8').replace('{{ARC_AGENT_FRAGMENT:qa.contract-intro}}', ''));
  refreshManifest(context.packageRoot);
  assert.throws(() => verifyPayload(context), {code: 'ARC_PAYLOAD_VALIDATION', message: /Invalid profile markers/});
});

test('config.toml managed edit on install and restore on uninstall', async t => {
  for (const existing of [null, Buffer.from('[cli]\r\ninstaller = "npm"\r\n')]) {
    const context = await contextFor(t), filename = path.join(context.userHome, '.grok/config.toml');
    if (existing) {fs.mkdirSync(path.dirname(filename)); fs.writeFileSync(filename, existing);}
    const installed = await install(context), content = fs.readFileSync(filename);
    assert.ok(installed.plans[0].summary.includes(`${filename}: set [compat.claude] agents, skills, rules = false (arc:managed)`));
    if (existing) assert.deepEqual(content.subarray(0, existing.length), existing);
    else assert.equal(content.toString(), '[compat.claude] # arc:managed\nagents = false # arc:managed\nskills = false # arc:managed\nrules = false # arc:managed\n');
    for (const key of ['agents', 'skills', 'rules']) assert.equal(parseToml(content).compat.claude[key], false);
    const prepared = await prepareOperation(context, {kind: 'uninstall', target: 'grok', removeCli: false});
    assert.ok(prepared.plans[0].summary.includes(`${filename}: restored [compat.claude] managed lines`));
    assert.equal((await executeOperation(context, prepared)).code, 0);
    assert.equal(fs.existsSync(filename), true);
    assert.deepEqual(fs.readFileSync(filename), existing ?? Buffer.alloc(0));
  }
});

for (const [name, text, reason, target] of [
  ['install aborts on user true without changing files', '[compat.claude]\nagents = true\n', '[compat.claude] agents = true is set by the user; set it to false or remove it', 'grok'],
  ['install aborts on invalid TOML', '[[x\n', 'TOML parse failed', 'grok'],
  ['target all aborts before any home changes', '[compat.claude]\nagents = true\n', '[compat.claude] agents = true is set by the user; set it to false or remove it', 'all'],
]) test(name, async t => {
  const context = await contextFor(t), filename = path.join(context.userHome, '.grok/config.toml');
  fs.mkdirSync(path.dirname(filename)); fs.writeFileSync(filename, text);
  const before = homeBytes(context.userHome), grokBefore = files(path.dirname(filename));
  await assert.rejects(prepareOperation(context, {kind: 'install', target, language: 'en'}), {name: 'TargetConfigurationError', message: `Cannot update ${filename}: ${reason}; fix it or use --skip-global`});
  assert.deepEqual(files(path.dirname(filename)), grokBefore);
  assert.deepEqual(homeBytes(context.userHome), before);
});

test('uninstall warns and continues when config.toml cannot be parsed', async t => {
  const context = await contextFor(t), filename = path.join(context.userHome, '.grok/config.toml');
  await install(context); fs.writeFileSync(filename, '[[broken\n');
  const prepared = await prepareOperation(context, {kind: 'uninstall', target: 'grok', removeCli: false});
  assert.ok(prepared.plans[0].summary.includes(`${filename}: ARC-managed [compat.claude] lines were not restored (TOML parse failed); remove lines marked # arc:managed manually`));
  assert.equal((await executeOperation(context, prepared)).code, 0);
  assert.equal(fs.existsSync(path.join(context.userHome, '.grok/skills/arc')), false);
  assert.equal(fs.readFileSync(filename, 'utf8'), '[[broken\n');
});

test('--skip-global leaves config.toml bytes and reports', async t => {
  const context = await contextFor(t), filename = path.join(context.userHome, '.grok/config.toml');
  fs.mkdirSync(path.dirname(filename)); fs.writeFileSync(filename, '[cli]\nx = 1\n');
  const prepared = await prepareOperation(context, {kind: 'install', target: 'grok', language: 'en', skipGlobal: true});
  assert.ok(prepared.plans[0].summary.includes(`${filename}: compatibility settings update skipped (--skip-global).`));
  assert.ok(prepared.plans[0].summary.includes('Native concurrency update skipped (--skip-global).'));
  assert.equal((await executeOperation(context, prepared)).code, 0);
  assert.equal(fs.readFileSync(filename, 'utf8'), '[cli]\nx = 1\n');
  const removed = await prepareOperation(context, {kind: 'uninstall', target: 'grok', removeCli: false, skipGlobal: true});
  assert.ok(removed.plans[0].summary.includes(`${filename}: compatibility settings not restored (--skip-global).`));
  assert.equal((await executeOperation(context, removed)).code, 0);
  assert.equal(fs.readFileSync(filename, 'utf8'), '[cli]\nx = 1\n');
});

test('reinstall idempotent', async t => {
  const context = await contextFor(t);
  await install(context);
  const home = path.join(context.userHome, '.grok'), before = files(home);
  await install(context);
  assert.deepEqual(files(home), before);
});

test('uninstall removes owned only', async t => {
  const context = await contextFor(t), home = path.join(context.userHome, '.grok');
  fs.mkdirSync(path.join(home, 'agents'), {recursive: true});
  const user = new Map([['agents/my.md', Buffer.from('User agent\n')], ['config.toml', Buffer.from('[cli]\ninstaller = "npm"\n')], ['AGENTS.md', Buffer.from('# User instructions\n\n')]]);
  for (const [name, bytes] of user) fs.writeFileSync(path.join(home, name), bytes);
  await install(context);
  const instruction = path.join(home, 'AGENTS.md');
  fs.appendFileSync(instruction, '# User footer\n');
  const before = fs.readFileSync(instruction, 'utf8');
  const outside = before.replace(/<!-- arc:begin -->[\s\S]*?<!-- arc:end -->/, '');
  const prepared = await prepareOperation(context, {kind: 'uninstall', target: 'grok', removeCli: false});
  assert.ok(prepared.plans[0].summary.includes('Grok config.toml is preserved except ARC-managed [compat.claude] lines.'));
  assert.equal((await executeOperation(context, prepared)).code, 0);
  assert.equal(fs.existsSync(path.join(home, 'skills/arc')), false);
  assert.deepEqual(fs.readdirSync(path.join(home, 'agents')), ['my.md']);
  for (const name of ['agents/my.md', 'config.toml']) assert.deepEqual(fs.readFileSync(path.join(home, name)), user.get(name));
  assert.equal(fs.readFileSync(instruction, 'utf8'), outside);
});

test('uninstall allowed with install capability off when traces exist', async t => {
  const context = await contextFor(t);
  await install(context);
  const off = {...context, platforms: DEFAULT_INSTALLER_REGISTRY, runtimePlatforms: DEFAULT_PLATFORM_REGISTRY};
  const status = (await collectStatus(off)).find(item => item.platform === 'grok');
  assert.equal(status.state, 'installed');
  const screens = [], events = [{name: 'down'}, {name: 'down'}, {name: 'enter'}, {name: 'eof'}];
  const session = {viewport: () => ({columns: 120, rows: 40}), render: screen => {screens.push(screen); return {selectionEnabled: true};}, discardInput() {}, setBusy() {}, dispose() {}, async nextEvent() {return events.shift() ?? {name: 'eof'};}};
  await runTui({session, output: {write() {}}, context: off});
  assert.ok(screens.some(screen => screen.title === 'Uninstall' && screen.rows.includes('Grok')));
  assert.ok(screens.filter(screen => screen.title === 'Uninstall').every(screen => !screen.rows.includes('Grok  (not installed)')));
  const prepared = await prepareOperation(off, {kind: 'uninstall', target: 'grok', removeCli: false});
  assert.equal((await executeOperation(off, prepared)).code, 0);
  const remaining = files(path.join(context.userHome, '.grok'));
  assert.deepEqual(Object.keys(remaining), ['AGENTS.md', 'config.toml']);
  assert.equal(Buffer.from(remaining['config.toml'], 'hex').length, 0);
  assert.doesNotMatch(Buffer.from(remaining['AGENTS.md'], 'hex').toString(), /arc:begin/);
});

test('upgrade excludes installed traces with install capability off', async t => {
  const context = await contextFor(t);
  await install(context);
  const off = {...context, platforms: DEFAULT_INSTALLER_REGISTRY, runtimePlatforms: DEFAULT_PLATFORM_REGISTRY};
  assert.equal((await executeOperation(off, await prepareOperation(off, {kind: 'install', target: 'claude', language: 'en'}))).code, 0);
  for (const name of ['SKILL.md', 'settings.toml', 'models.toml', 'limits.toml']) assert.ok(fs.existsSync(path.join(context.userHome, '.grok/skills/arc', name)), name);
  assert.deepEqual(collectInstalledState(off).targets.map(entry => entry.target.platform), ['claude']);
});

test('upgrade ignores a managed block without skills when install capability is off', async t => {
  const context = await compositeContext(t);
  assert.equal((await executeOperation(context, await prepareOperation(context, {kind: 'install', target: 'claude', language: 'en'}))).code, 0);
  const home = path.join(context.userHome, '.grok');
  fs.mkdirSync(home);
  fs.writeFileSync(path.join(home, 'AGENTS.md'), '<!-- arc:begin -->\nARC managed instructions\n<!-- arc:end -->\n');
  assert.equal(fs.existsSync(path.join(home, 'skills/arc')), false);
  assert.doesNotThrow(() => collectInstalledState(context));
  assert.deepEqual(collectInstalledState(context).targets.map(entry => entry.target.platform), ['claude']);
});

test('uninstall order follows displayOrder', async t => {
  const context = await contextFor(t, {reverseDisplay: true});
  const prepared = await prepareOperation(context, {kind: 'uninstall', target: 'all', removeCli: false});
  assert.deepEqual(prepared.plans.map(plan => plan.target.platform), ['grok', 'gemini', 'codex', 'claude']);
  const result = await executeOperation(context, prepared);
  assert.equal(result.code, 0);
  assert.deepEqual(result.results.map(item => item.platform), ['grok', 'gemini', 'codex', 'claude']);
});

// Missing boundary checks must reject both a linked platform home and a linked ancestor.
test('symlinked grok home or ancestor is rejected without file changes', async t => {
  for (const ancestor of [false, true]) {
    const context = await contextFor(t);
    const destination = path.join(context.userHome, 'outside');
    fs.mkdirSync(destination);
    fs.writeFileSync(path.join(destination, 'user.txt'), 'preserve\n');
    const before = files(destination);
    if (ancestor) {
      const link = path.join(context.userHome, 'linked');
      fs.symlinkSync(destination, link);
      context.userHome = path.join(link, 'nested');
    } else fs.symlinkSync(destination, path.join(context.userHome, '.grok'));
    await assert.rejects(prepareOperation(context, {kind: 'install', target: 'grok', language: 'en'}), /symlink|symbolic|unsafe/i);
    assert.deepEqual(files(destination), before);
  }
});

test('models.toml defaults', async t => {
  const context = await contextFor(t);
  await install(context);
  const config = parseToml(fs.readFileSync(path.join(context.userHome, '.grok/skills/arc/models.toml'), 'utf8'));
  assert.equal(config.version, 3n);
  assert.deepEqual(Object.keys(config.roles).sort(), roles.map(role => `arc_${role}`).sort());
  for (const role of roles) assert.deepEqual({...config.roles[`arc_${role}`]}, {model: 'grok-4.6', effort: 'default'});
});

test('grok coordination says run Configure again', async t => {
  const context = await contextFor(t);
  await install(context);
  assert.match(fs.readFileSync(path.join(context.userHome, '.grok/skills/arc/references/coordination.md'), 'utf8'), /run Configure again/);
});

test('role policy renders grok outputs and leaves claude/codex/gemini bytes unchanged', t => {
  const sourceRoot = staticPackageFixture(t);
  const before = Object.fromEntries(['claude', 'codex', 'gemini', 'grok'].map(name => [name, files(path.join(sourceRoot, name))]));
  const skill = path.join(sourceRoot, 'grok/skill/SKILL.md');
  fs.writeFileSync(skill, fs.readFileSync(skill, 'utf8').replace('- [platform.grok]', '- [stale.grok]'));
  const result = spawnSync(process.execPath, [path.join(sourceRoot, 'scripts/update-role-policy.mjs')], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  for (const platform of ['claude', 'codex', 'gemini', 'grok']) assert.deepEqual(files(path.join(sourceRoot, platform)), before[platform]);
  const policy = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'lib/policy/role-policy.json')));
  assert.deepEqual(policy.platforms.grok, {level: 'prompt', notice: 'Role restrictions are prompt-level contracts, not a filesystem sandbox. Grok sandboxing, native tool restriction fields, observer hooks and Git guards are unverified, and Grok may continue without its sandbox. Use only available authorized tools; ARC disables Grok Claude compatibility (agents, skills, rules in config.toml; also MCPs and hooks for bridge children), but whether Grok sessions honor these settings is unverified.'});
});
