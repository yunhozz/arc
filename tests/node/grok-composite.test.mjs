import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {createPlatformRegistry, DEFAULT_PLATFORM_REGISTRY} from '../../lib/runtime/platform-registry.mjs';
import {createInstallerRegistry, DEFAULT_INSTALLER_REGISTRY} from '../../lib/platforms/index.mjs';
import * as management from '../../lib/management/operations.mjs';
import {resolveTargets} from '../../lib/installer/targets.mjs';
import {ROUTING_ROLES} from '../../lib/runtime/role-routing-config.mjs';
import {prepareRoleDispatch} from '../../lib/runtime/role-routing.mjs';
import {readLease, listLeases} from '../../lib/runtime/role-dispatch-store.mjs';
import {loadStaticModelCatalog} from '../../lib/models/static-catalog.mjs';
import {compositeContext} from './fixtures/install-mode.mjs';
import {activePath, markerPath} from './fixtures/legacy-composite.mjs';

const ids = ['claude', 'codex', 'gemini', 'grok'];
const revision = 'grok-composite-t6';

async function contextFor(t) {
  const context = await compositeContext(t);
  // Keep Grok host/standalone capabilities off: only role participation is verified.
  const runtimePlatforms = createPlatformRegistry(DEFAULT_PLATFORM_REGISTRY.platforms.map(descriptor => descriptor.id === 'grok' ? {
    ...descriptor, capabilities: {...descriptor.capabilities,
      ...Object.fromEntries(['install', 'catalog', 'bridge', 'compositeRole'].map(key => [key, {state: 'verified'}])),
    },
  } : descriptor));
  Object.assign(context, {runtimePlatforms, platforms: createInstallerRegistry({runtime: runtimePlatforms,
    descriptors: runtimePlatforms.platforms.map(runtime => ({...DEFAULT_INSTALLER_REGISTRY.getPlatform(runtime.id), runtime})),
  })});
  context.env.HOME = context.userHome;
  context.env.TMPDIR = process.env.TMPDIR;
  // Auth is unverified; only local fake --version commands may run.
  for (const [id, version] of [['gemini', '0.68.0'], ['grok', '1.0.0']]) {
    fs.writeFileSync(path.join(context.userHome, 'bin', id), `#!/bin/sh\nif [ "$1" = "--version" ]; then echo ${version}; else echo unexpected >> "$HOME/unexpected-command"; exit 1; fi\n`, {mode: 0o755});
  }
  return context;
}

const home = (context, id) => resolveTargets(context).targets[id].home;
async function preparePublication(context, platforms) {
  const pairs = {};
  for (const id of platforms) pairs[id] = (await loadStaticModelCatalog(id, context)).catalog.pairs[0];
  const roles = Object.fromEntries(ROUTING_ROLES.map((role, index) => {
    const platform = platforms[index % platforms.length];
    return [role, {platform, ...pairs[platform]}];
  }));
  for (const role of ['arc_scouter', 'arc_qa']) roles[role] = {platform: 'grok', ...pairs.grok};
  return management.prepareOperation(context, {kind: 'install', target: 'composite', platforms,
    config: {revision, platforms, roles}});
}

async function execute(context, prepared) {
  const result = await management.executeOperation(context, prepared);
  assert.equal(result.code, 0, result.error?.stack ?? result.results?.find(item => item.error)?.error?.stack);
  assert.equal(result.activation, 'published');
  assert.equal(fs.existsSync(path.join(context.userHome, 'unexpected-command')), false);
}

function assertPublished(context, platforms) {
  assert.deepEqual(management.currentInstallState(context), {mode: 'composite', platforms, anchor: 'claude'});
  const config = JSON.parse(fs.readFileSync(activePath(context, 'claude'), 'utf8'));
  assert.equal(config.version, 2);
  assert.equal(config.revision, revision);
  assert.deepEqual(config.platforms, platforms);
  for (const id of ids) {
    assert.equal(fs.existsSync(activePath(context, id)), id === 'claude', id);
    assert.equal(fs.existsSync(markerPath(context, id)), platforms.includes(id), id);
    if (!platforms.includes(id)) continue;
    const marker = JSON.parse(fs.readFileSync(markerPath(context, id), 'utf8'));
    assert.equal(marker.version, 1);
    assert.equal(marker.platform, id);
    assert.equal(marker.targetHome, home(context, id));
    assert.equal(marker.revision, revision);
    assert.equal(marker.activeConfigPath, activePath(context, 'claude'));
  }
  const marker = JSON.parse(fs.readFileSync(markerPath(context, 'grok'), 'utf8'));
  assert.ok(marker.profiles.arc_scouter);
  assert.ok(marker.profiles.arc_qa);
  for (const role of Object.keys(marker.profiles)) {
    const relative = `agents/arc-routing-${role.slice(4)}.md`;
    assert.equal(marker.profiles[role].path, relative);
    const text = fs.readFileSync(path.join(home(context, 'grok'), relative), 'utf8');
    assert.match(text, /^description:.*\[arc-routing rev grok-composite-t6\]/m);
  }
}

// Missing v2 activation, a participant marker or a Grok revision tag must fail.
test('publish S={claude,grok}', async t => {
  const context = await contextFor(t);
  assert.equal(home(context, 'grok'), path.join(context.userHome, '.grok'));
  await execute(context, await preparePublication(context, ['claude', 'grok']));
  assertPublished(context, ['claude', 'grok']);
});

// Observe real successful exclusive opens; retain all lock filesystem effects.
test('publish S={codex,claude,gemini,grok}', async t => {
  const context = await contextFor(t);
  const prepared = await preparePublication(context, ['codex', 'claude', 'gemini', 'grok']);
  const locks = [], open = fsp.open;
  t.mock.method(fsp, 'open', async (filename, flags, ...args) => {
    const handle = await open(filename, flags, ...args);
    if (flags === 'wx' && path.basename(String(filename)) === 'arc-role-platform-routing.lock') locks.push(path.basename(path.dirname(filename)).slice(1));
    return handle;
  });
  await execute(context, prepared);
  assertPublished(context, ['claude', 'codex', 'gemini', 'grok']);
  assert.deepEqual(locks, ['claude', 'codex', 'gemini', 'grok']);
  for (const id of ids) assert.equal(fs.existsSync(path.join(home(context, id), 'arc-role-platform-routing.lock')), false, id);
});

// Dropping Grok from UUID reservation or writing a v1/wrong-target lease must fail.
test('prepare arc_scouter targeting grok records lease v2', async t => {
  const context = await contextFor(t);
  await execute(context, await preparePublication(context, ['claude', 'grok']));
  const prepared = await prepareRoleDispatch({context: {...context, hostPlatform: 'claude', executionEnvironment: 'claude-cli', workflowId: 't6-scouter'},
    expectedRevision: revision, assignment: {role: 'arc_scouter', taskId: 'T6-scouter', requestId: 't6-scouter'}});
  assert.equal(prepared.decision, 'allow', JSON.stringify(prepared.reasons));
  assert.equal(prepared.routeStatus, 'reserved');
  assert.equal(prepared.route, 'bridge');
  const raw = JSON.parse(fs.readFileSync(path.join(home(context, 'claude'), 'arc-role-dispatch', `${prepared.dispatchId}.json`), 'utf8'));
  assert.equal(raw.version, 2);
  assert.equal(raw.targetPlatform, 'grok');
  assert.match(raw.sessionId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  const lease = await readLease(home(context, 'claude'), prepared.dispatchId, context);
  assert.equal(lease.version, 2);
  assert.equal(lease.targetPlatform, 'grok');
  assert.equal(lease.sessionId, raw.sessionId);
  assert.equal(lease.hostPlatform, 'claude');
  assert.equal(lease.role, 'arc_scouter');
  assert.equal(lease.state, 'reserved');
  assert.equal(fs.existsSync(path.join(context.userHome, 'unexpected-command')), false);
});

// A widened GK1 gate or a lease written despite the hold must fail.
test('prepare arc_qa targeting grok holds permission_scope_unverified without lease', async t => {
  const context = await contextFor(t);
  await execute(context, await preparePublication(context, ['claude', 'grok']));
  const prepared = await prepareRoleDispatch({context: {...context, hostPlatform: 'claude', executionEnvironment: 'claude-cli', workflowId: 't6-qa'},
    expectedRevision: revision, assignment: {role: 'arc_qa', taskId: 'T6-qa', requestId: 't6-qa'}});
  assert.equal(prepared.decision, 'hold');
  assert.equal(prepared.route, 'bridge');
  assert.deepEqual(prepared.reasons.map(reason => reason.code), ['permission_scope_unverified']);
  assert.equal(prepared.dispatchId, null);
  for (const id of ids) assert.deepEqual(await listLeases(home(context, id), context), [], id);
  assert.equal(fs.existsSync(path.join(context.userHome, 'unexpected-command')), false);
});
