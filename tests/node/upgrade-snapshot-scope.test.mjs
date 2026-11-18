import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createPlatformRegistry} from '../../lib/runtime/platform-registry.mjs';
import {createInstallerRegistry, DEFAULT_INSTALLER_REGISTRY} from '../../lib/platforms/index.mjs';
import {resolveTarget, resolveTargets, inspectPath} from '../../lib/installer/targets.mjs';
import {readInstallMode, inspectStandaloneProfile} from '../../lib/installer/install-mode.mjs';
import {collectInstalledState} from '../../lib/installer/upgrade-state.mjs';
import {buildUpgradePlans} from '../../lib/installer/upgrade.mjs';
import {buildInstallPlan} from '../../lib/installer/plan.mjs';
import {installTargets} from '../../lib/installer/install.mjs';
import {verifyPayload} from '../../lib/installer/manifest.mjs';
import {renderManagedBlock, removeManagedBlock, agentsBlockBody} from '../../lib/installer/global-config.mjs';
import {attachShellCompletionCleanup} from '../../lib/installer/shell-completion.mjs';
import {compositeContext, standalone, publish} from './fixtures/install-mode.mjs';

async function contextFor(t, {composite = true} = {}) {
  const context = await compositeContext(t);
  // Put a standalone platform before the last composite participant without Grok.
  const order = ['claude', 'gemini', 'codex'];
  const runtimePlatforms = createPlatformRegistry(DEFAULT_INSTALLER_REGISTRY.byAnchorOrder().map(({runtime}) => {
    const index = order.indexOf(runtime.id);
    return {...runtime, anchorOrder: index < 0 ? order.length + runtime.anchorOrder : index,
      ...(index < 0 ? {capabilities: {}} : {}),
    };
  }));
  const platforms = createInstallerRegistry({runtime: runtimePlatforms, descriptors: runtimePlatforms.byAnchorOrder().map(runtime => ({
    ...DEFAULT_INSTALLER_REGISTRY.getPlatform(runtime.id), runtime,
  }))});
  Object.assign(context, {runtimePlatforms, platforms});
  await standalone(context);
  if (composite) assert.equal((await publish(context)).code, 0);
  return context;
}

function homeBytes(home) {
  const result = {};
  function visit(relative) {
    const filename = path.join(home, relative), stat = fs.lstatSync(filename);
    if (stat.isSymbolicLink()) result[relative] = ['link', fs.readlinkSync(filename)];
    else if (stat.isDirectory()) {result[relative] = ['directory']; for (const name of fs.readdirSync(filename).sort()) visit(path.join(relative, name));}
    else result[relative] = ['file', fs.readFileSync(filename).toString('hex')];
  }
  visit('');
  return result;
}

// Freeze the pre-fix collection inputs independently of entry.snapshot/modeKeys.
function legacySnapshots(context, state) {
  const modeSnapshot = new Map();
  readInstallMode({...context, ...resolveTargets(context), snapshot: modeSnapshot});
  return state.targets.map(({target}) => {
    const snapshot = new Map(), arc = path.join(target.home, 'skills/arc');
    inspectPath(context.safeFs, arc, {kind: 'directory', tree: true, allowLinks: true, snapshot});
    if (state.mode !== 'composite' || !state.platforms.includes(target.platform)) for (const name of target.profileNames) {
      inspectStandaloneProfile({...context, target, role: name.split('.')[0].replace('-', '_'), snapshot});
    }
    inspectPath(context.safeFs, target.instructionPath, {kind: 'file', read: true, snapshot});
    for (const name of ['SKILL.md', 'settings.toml', 'models.toml', 'limits.toml']) inspectPath(context.safeFs, path.join(arc, name), {kind: 'file', read: true, snapshot});
    if (typeof context.platforms.getPlatform(target.platform).runtimeConfig.readConcurrency === 'function') inspectPath(context.safeFs, target.runtimeConfigPath, {kind: 'file', read: true, snapshot});
    inspectPath(context.safeFs, path.join(context.userHome, '.zshrc'), {kind: 'file', read: true, snapshot});
    if (state.mode === 'composite') for (const [filename, value] of modeSnapshot) if (value) snapshot.set(filename, value);
    return new Map([...snapshot].filter(([, value]) => value));
  });
}

const serializable = value => JSON.stringify(value, (key, item) => key === 'atimeNs' ? undefined : typeof item === 'bigint' ? item.toString() : item instanceof Map || item instanceof Set ? [...item] : item);

test('composite upgrade with an earlier standalone target installs every target', async t => {
  const context = await contextFor(t), target = resolveTarget('gemini', context), profile = path.join(target.home, 'agents', target.profileNames[0]);
  // An owned but stale profile proves that the earlier standalone plan rewrites it.
  fs.appendFileSync(profile, '\nold installed profile\n');
  const before = fs.readFileSync(profile), state = collectInstalledState(context);
  assert.equal(state.mode, 'composite');
  const plans = buildUpgradePlans({payload: verifyPayload(context), state, safeFs: context.safeFs});
  assert.deepEqual(plans.map(plan => plan.target.platform), ['claude', 'gemini', 'codex']);
  assert.ok(plans[1].profileWrites.size > 0);
  const result = await installTargets(plans, context);
  assert.deepEqual(result.results.map(item => [item.platform, item.status, item.error?.code]), [
    ['claude', 'installed', undefined], ['gemini', 'installed', undefined], ['codex', 'installed', undefined],
  ]);
  assert.notDeepEqual(fs.readFileSync(profile), before);
});

test('mode keys overlapping other plan writes are excluded only there', async t => {
  const context = await contextFor(t), targets = resolveTargets(context).targets;
  const sibling = path.join(targets.gemini.home, 'agents', targets.gemini.profileNames[0] + '.user');
  fs.writeFileSync(sibling, 'user profile beside a managed path');
  const state = collectInstalledState(context), snapshots = state.targets.map(entry => new Map(entry.snapshot));
  const plans = buildUpgradePlans({payload: verifyPayload(context), state, safeFs: context.safeFs});
  const agents = path.join(targets.gemini.home, 'agents'), profile = path.join(agents, targets.gemini.profileNames[0]);
  for (const [index, plan] of plans.entries()) {
    const own = plan.target.platform === 'gemini';
    assert.equal(plan.snapshot.has(agents), own, `${plan.target.platform}: standalone agents tree`);
    assert.equal(plan.snapshot.has(profile), own, `${plan.target.platform}: standalone profile`);
    assert.ok(plan.snapshot.has(sibling), 'a shared string prefix is not path overlap');
    assert.ok(plan.snapshot.has(plan.target.home), 'own home remains checked');
    assert.ok(state.targets[index].modeKeys instanceof Set);
    assert.ok(state.targets[index].modeKeys.has(agents));
    assert.deepEqual(state.targets[index].snapshot, snapshots[index], 'entry snapshot is unchanged');
    for (const [id, name] of [['claude', 'arc-routing-planner.md'], ['codex', 'arc-routing-implementer.toml']]) {
      const home = targets[id].home;
      assert.ok(plan.snapshot.has(path.join(home, 'arc-role-platform-routing.prepared.json')));
      assert.ok(plan.snapshot.has(path.join(home, 'agents', name)));
    }
    assert.ok(plan.snapshot.has(path.join(targets.claude.home, 'arc-role-platform-routing.json')));
  }
});

for (const damage of ['participant profile', 'routing definition', 'nonparticipant routing profile']) test(`drift after planning still fails before writes: ${damage}`, async t => {
  const context = await contextFor(t), targets = resolveTargets(context).targets;
  const plans = buildUpgradePlans({payload: verifyPayload(context), state: collectInstalledState(context), safeFs: context.safeFs});
  const filename = damage === 'participant profile' ? path.join(targets.codex.home, 'agents/arc-routing-implementer.toml')
    : damage === 'routing definition' ? path.join(targets.claude.home, 'arc-role-platform-routing.json')
    : path.join(targets.gemini.home, 'agents/arc-routing-x.md');
  fs.appendFileSync(filename, '\nexternal change\n');
  const before = homeBytes(context.userHome), result = await installTargets(plans, context);
  assert.ok(result.results.some(item => item.status === 'failed' && item.error?.code === 'ARC_INSTALL_DRIFT'));
  assert.ok(result.results.every(item => item.status !== 'installed'));
  assert.deepEqual(homeBytes(context.userHome), before, 'preflight drift prevents every target write');
});

for (const composite of [true, false]) test(`stateToken is unchanged by the fix: ${composite ? 'composite' : 'standalone'}`, async t => {
  const context = await contextFor(t, {composite}), state = collectInstalledState(context), snapshots = legacySnapshots(context, state);
  const hash = createHash('sha256');
  for (const [index, entry] of state.targets.entries()) {
    assert.equal(serializable([...entry.snapshot]), serializable([...snapshots[index]]), 'pre-fix snapshot contents');
    hash.update(entry.target.platform + '\0' + entry.target.home + '\0');
    for (const pair of [...snapshots[index]].sort(([a], [b]) => a.localeCompare(b))) hash.update(serializable(pair));
  }
  assert.equal(state.stateToken, hash.digest('hex'));
  const before = state.stateToken;
  buildUpgradePlans({payload: verifyPayload(context), state, safeFs: context.safeFs});
  assert.equal(state.stateToken, before);
  assert.equal(collectInstalledState(context).stateToken, before);
});

test('standalone upgrade plans retain the pre-fix snapshot and writes', async t => {
  const context = await contextFor(t, {composite: false}), state = collectInstalledState(context), payload = verifyPayload(context);
  const expected = state.targets.map(entry => {
    const {target, language, modelConfig, limits} = entry;
    const plan = buildInstallPlan({...context, payload, target, language, modelConfig, limits, skipGlobal: true});
    for (const [name, value] of entry.snapshot) plan.snapshot.set(name, value);
    const current = inspectPath(context.safeFs, target.instructionPath, {kind: 'file', read: true, snapshot: plan.snapshot});
    if (current.exists && removeManagedBlock(current.bytes).changed) {
      const rendered = renderManagedBlock(current.bytes, agentsBlockBody(target.home, target.userHome, language, target.platform));
      plan.managedPaths.push(target.instructionPath);
      if (!rendered.content.equals(current.bytes)) plan.globalChanges.push({path: target.instructionPath, original: current.bytes, ...rendered});
    }
    return plan;
  });
  attachShellCompletionCleanup(expected, context);
  const plans = buildUpgradePlans({payload, state, safeFs: context.safeFs});
  assert.equal(serializable(plans), serializable(expected));
  for (const entry of state.targets) assert.deepEqual(entry.modeKeys, new Set());
});
