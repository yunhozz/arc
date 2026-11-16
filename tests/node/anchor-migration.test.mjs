import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as management from '../../lib/management/operations.mjs';
import {collectStatus} from '../../lib/management/status.mjs';
import {resolveTargets} from '../../lib/installer/targets.mjs';
import {publishCompositeFiles} from '../../lib/installer/role-routing.mjs';
import {createLease, writeLease} from '../../lib/runtime/role-dispatch-store.mjs';
import {routingStatus, prepareRoleDispatch} from '../../lib/runtime/role-routing.mjs';
import {DEFAULT_POLICY} from '../../lib/runtime/role-dispatch-policy.mjs';
import {collectInstalledState} from '../../lib/installer/upgrade-state.mjs';
import {upgradeInstalledTargets} from '../../lib/installer/upgrade.mjs';
import {prepareUpdate, executeUpdate} from '../../lib/management/update.mjs';
import {mixedConfig} from './fixtures/install-mode.mjs';
import {legacyComposite, legacyState, activePath, markerPath, homeBytes, legacyLease} from './fixtures/legacy-composite.mjs';

const prepare = async (context, extra = {}) => management.prepareOperation(context, {kind: 'install', target: 'composite', platforms: ['claude', 'codex'], config: await mixedConfig('migrated-v2'), ...extra});
const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const storeMetadata = home => Object.keys(homeBytes(home)).map(relative => {
  const {ino,mode,mtimeNs,ctimeNs} = fs.lstatSync(path.join(home,relative),{bigint:true});
  return [relative,ino,mode,mtimeNs,ctimeNs];
});
function rewriteConfig(context, config) {
  const bytes = Buffer.from(JSON.stringify(config));
  fs.writeFileSync(activePath(context, 'codex'), bytes);
  for (const id of ['codex', 'claude']) {
    const marker = JSON.parse(fs.readFileSync(markerPath(context, id)));
    marker.configHash = hash(bytes);
    fs.writeFileSync(markerPath(context, id), JSON.stringify(marker));
  }
}

test('legacy v1 at codex home is composite with legacyAnchor', async t => {
  const context = await legacyComposite(t), raw = JSON.parse(fs.readFileSync(activePath(context, 'codex')));
  assert.deepEqual(legacyState(context), {mode: 'composite', platforms: ['claude', 'codex'], anchor: 'codex',
    homes: {claude: 'composite', codex: 'composite', zeta: 'standalone'}, config: {...raw, version: 2, platforms: ['claude', 'codex']}, residualPaths: [], legacyAnchor: true});
  assert.deepEqual(management.currentInstallState(context), {mode: 'composite', platforms: ['claude', 'codex'], anchor: 'codex', legacyAnchor: true});
  assert.deepEqual(management.readCompositeConfig(context), legacyState(context).config);
});
test('v2 at codex home is unverified', async t => {
  const context = await legacyComposite(t), config = JSON.parse(fs.readFileSync(activePath(context, 'codex')));
  rewriteConfig(context, {...config, version: 2, platforms: ['claude', 'codex']});
  assert.equal(legacyState(context).mode, 'unverified');
  assert.equal('legacyAnchor' in legacyState(context), false);
});
test('configs at both homes are unverified', async t => {
  const context = await legacyComposite(t);
  fs.copyFileSync(activePath(context, 'codex'), activePath(context, 'claude'));
  assert.equal(legacyState(context).mode, 'unverified');
  assert.equal('legacyAnchor' in legacyState(context), false);
});
test('marker mismatch is unverified', async t => {
  const context = await legacyComposite(t), marker = JSON.parse(fs.readFileSync(markerPath(context, 'claude')));
  marker.activeConfigPath = activePath(context, 'claude');
  fs.writeFileSync(markerPath(context, 'claude'), JSON.stringify(marker));
  assert.equal(legacyState(context).mode, 'unverified');
  assert.equal('legacyAnchor' in legacyState(context), false);
});
test('non-legacy result has no legacyAnchor key', async t => {
  const context = await legacyComposite(t, {operational: true});
  assert.equal('legacyAnchor' in legacyState(context), false);
});

for (const kind of ['install', 'preset']) test(`legacy Install/Update moves anchor to claude (${kind})`, async t => {
  const context = await legacyComposite(t), targets = resolveTargets(context).targets;
  await createLease(targets.codex.home, legacyLease('history', 'completed'), context);
  fs.writeFileSync(path.join(targets.codex.home, 'arc-role-dispatch/history.cancel'), 'preserve history');
  const history = homeBytes(path.join(targets.codex.home, 'arc-role-dispatch'));
  const metadata = storeMetadata(path.join(targets.codex.home, 'arc-role-dispatch'));
  const prepared = await prepare(context, {kind});
  assert.deepEqual(prepared.anchorMove, {from: 'codex', to: 'claude'});
  const result = await management.executeOperation(context, prepared);
  assert.equal(result.code, 0, result.error?.stack ?? result.results.find(item => item.error)?.error?.stack);
  const config = JSON.parse(fs.readFileSync(activePath(context, 'claude')));
  assert.equal(config.version, 2);
  assert.deepEqual(config.platforms, ['claude', 'codex']);
  assert.equal(fs.existsSync(activePath(context, 'codex')), false);
  for (const id of ['codex', 'claude']) assert.equal(JSON.parse(fs.readFileSync(markerPath(context, id))).activeConfigPath, activePath(context, 'claude'));
  assert.deepEqual(homeBytes(path.join(targets.codex.home, 'arc-role-dispatch')), history);
  assert.deepEqual(storeMetadata(path.join(targets.codex.home, 'arc-role-dispatch')), metadata);
  assert.ok(result.messages.includes(`Dispatch history stays in ${targets.codex.home}/arc-role-dispatch.`));
  assert.equal(legacyState(context).mode, 'composite');
  assert.equal('legacyAnchor' in legacyState(context), false);
  assert.equal('anchorMove' in await prepare(context, {config: await mixedConfig('no-move')}), false);
});
test('legacy {codex,claude} → {codex,claude,zeta} moves and changes set in one transaction', async t => {
  const context = await legacyComposite(t), prepared = await prepare(context, {platforms: ['claude', 'codex', 'zeta']});
  const paths = [];
  context.hooks = {fault: event => { if (event.phase === 'before-publish') paths.push(event.path); }};
  const result = await management.executeOperation(context, prepared);
  assert.equal(result.code, 0, result.error?.stack);
  assert.deepEqual(JSON.parse(fs.readFileSync(activePath(context, 'claude'))).platforms, ['claude', 'codex', 'zeta']);
  for (const id of ['claude', 'codex', 'zeta']) assert.equal(JSON.parse(fs.readFileSync(markerPath(context, id))).activeConfigPath, activePath(context, 'claude'));
  assert.equal(fs.existsSync(activePath(context, 'codex')), false);
  assert.equal(paths.filter(filename => filename === activePath(context, 'claude')).length, 1);
});

for (const id of ['codex', 'claude']) for (const version of [1, 2]) test(`legacy migration held with non-terminal lease in either store (${id}, v${version})`, async t => {
  const context = await legacyComposite(t), target = resolveTargets(context).targets[id], dispatchId = `${id}-v${version}`;
  await createLease(target.home, legacyLease(dispatchId, 'reserved', version === 1 ? 'native' : 'bridge', version), context);
  const prepared = await prepare(context), before = homeBytes(context.userHome);
  const result = await management.executeOperation(context, prepared);
  assert.equal(result.activation, 'held');
  assert.deepEqual(result.error.activeDispatches, [dispatchId]);
  assert.ok(result.messages.includes(`Active dispatches: ${dispatchId}`));
  assert.deepEqual(homeBytes(context.userHome), before);
});
test('legacy migration held then succeeds after lease terminal', async t => {
  const context = await legacyComposite(t), home = resolveTargets(context).targets.codex.home, lease = legacyLease('finish-first', 'running');
  await createLease(home, lease, context);
  assert.equal((await management.executeOperation(context, await prepare(context))).activation, 'held');
  await writeLease(home, {...lease, state: 'completed'}, context);
  const history = homeBytes(path.join(home, 'arc-role-dispatch'));
  assert.equal((await management.executeOperation(context, await prepare(context))).code, 0);
  assert.deepEqual(homeBytes(path.join(home, 'arc-role-dispatch')), history);
});
test('rollback restored keeps legacy state', async t => {
  const context = await legacyComposite(t), prepared = await prepare(context, {platforms: ['claude', 'codex', 'zeta']}), before = homeBytes(context.userHome);
  let injected = false;
  context.hooks = {fault: event => { if (event.phase === 'before-publish' && event.path === activePath(context, 'claude')) { injected = true; throw Error('Injected routing publication failure'); } }};
  await assert.rejects(publishCompositeFiles({context, prepared: prepared.files}), error => { assert.equal(error.rollback, 'restored'); return true; });
  assert.equal(injected, true);
  assert.deepEqual(homeBytes(context.userHome), before);
  assert.equal(legacyState(context).legacyAnchor, true);
});

test('legacy D1-b turns off without move', async t => {
  const context = await legacyComposite(t), prepared = await management.prepareOperation(context, {kind: 'install', target: 'codex', switchFromComposite: true});
  assert.equal(prepared.deactivation.anchor, 'codex');
  const result = await management.executeOperation(context, prepared);
  assert.equal(result.code, 0, result.error?.stack);
  assert.equal(legacyState(context).mode, 'standalone');
  for (const id of ['claude', 'codex']) assert.equal(fs.existsSync(activePath(context, id)), false);
  assert.ok(result.messages.includes('Mixed routing turned off.'));
  assert.ok(result.messages.every(message => !message.includes('Dispatch history stays')));
});
test('legacy Uninstall without move', async t => {
  const context = await legacyComposite(t), prepared = await management.prepareOperation(context, {kind: 'uninstall', target: 'all', removeCli: false});
  assert.equal(prepared.compositeActivePath, activePath(context, 'codex'));
  const result = await management.executeOperation(context, prepared);
  assert.equal(result.code, 0, result.error?.stack ?? result.results.find(item => item.error)?.error?.stack);
  for (const id of ['claude', 'codex']) {
    assert.equal(fs.existsSync(activePath(context, id)), false);
    assert.equal(fs.existsSync(markerPath(context, id)), false);
  }
});
test('runtime under legacy is activation_unverified and creates no files', async t => {
  const context = {...await legacyComposite(t), hostPlatform: 'claude', executionEnvironment: 'claude-cli', workflowId: 'legacy-wf'}, before = homeBytes(context.userHome);
  const policy = {...DEFAULT_POLICY, enabled: true};
  for (const result of [await routingStatus({context, policy}), await prepareRoleDispatch({context, policy, expectedRevision: 'legacy-v1', assignment: {role: 'arc_planner', taskId: 'T7', requestId: 'legacy-runtime'}})]) {
    assert.deepEqual(result.reasons.map(reason => reason.code), ['activation_unverified']);
  }
  assert.deepEqual(homeBytes(context.userHome), before);
});
test('package install / arc upgrade / status move no files', async t => {
  const context = await legacyComposite(t), before = homeBytes(context.userHome);
  // Package acquisition is external; execute the real post-acquisition harness path.
  const npmContext = {kind: 'npx'};
  Object.assign(context, {inspectNpmContext: async () => npmContext, resolveLatest: async () => ({version: '999.0.0'}), runNpxUpgrade: async () => ({code: 0})});
  assert.equal((await executeUpdate(context, await prepareUpdate(context))).code, 0);
  await collectStatus(context);
  assert.deepEqual(homeBytes(context.userHome), before);
  const state = collectInstalledState(context);
  const result = await upgradeInstalledTargets({...context, state, registry: context.platforms});
  assert.ok(result.results.every(item => item.status === 'installed'), result.results.find(item => item.error)?.error?.stack);
  assert.deepEqual(homeBytes(context.userHome), before);
});
test('legacy status adds move diagnostic', async t => {
  const context = await legacyComposite(t), before = homeBytes(context.userHome), statuses = await collectStatus(context);
  for (const id of ['claude', 'codex']) {
    const status = statuses.find(item => item.platform === id);
    assert.equal(status.state, 'installed');
    assert.deepEqual(status.diagnostics.map(error => error.message), ['Mixed routing will move to the Claude home on the next Install / Update.']);
  }
  assert.deepEqual(homeBytes(context.userHome), before);
});
test('injected codex-first order: codex v1 at codex home stays normal composite without legacyAnchor', async t => {
  const context = await legacyComposite(t, {operational: true}), raw = JSON.parse(fs.readFileSync(activePath(context, 'codex')));
  assert.deepEqual(legacyState(context), {mode: 'composite', platforms: ['codex', 'claude'], anchor: 'codex', homes: {codex: 'composite', claude: 'composite', zeta: 'standalone'}, config: {...raw, version: 2, platforms: ['codex', 'claude']}, residualPaths: []});
  assert.deepEqual(management.currentInstallState(context), {mode: 'composite', platforms: ['codex', 'claude'], anchor: 'codex'});
  assert.equal('anchorMove' in await prepare(context), false);
});
