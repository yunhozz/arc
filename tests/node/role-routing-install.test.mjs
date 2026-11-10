import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {openRoot} from '../../lib/safe-fs/index.mjs';
import {loadNative} from '../../lib/safe-fs/native.mjs';
import {applyPreset, loadModelConfig, renderProfiles, resolveModelSettings} from '../../lib/models/index.mjs';
import {parseToml} from '../../lib/models/config.mjs';
import {prepareCompositeFiles, publishCompositeFiles, renameCompositeProfile} from '../../lib/installer/role-routing.mjs';
import {ROUTING_ROLES} from '../../lib/runtime/role-routing-config.mjs';
import {revisionTag} from '../../lib/runtime/role-dispatch-policy.mjs';
import {routingStatus} from '../../lib/runtime/role-routing.mjs';
import {createRoutingFixture} from './role-fixtures.mjs';

const root = new URL('../../', import.meta.url).pathname;
const native = loadNative({artifactDirectory: 'build/native'});
const safeFs = {openRoot: p => openRoot(p, {native})};
const digest = bytes => 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex');
const EXT = {codex: 'toml', claude: 'md'};

async function inputsFor(platform) {
  const inputs = {};
  for (const role of ['scouter', 'planner', 'implementer', 'qa', 'reviewer']) {
    const name = `arc-${role}.${EXT[platform]}`;
    inputs[name] = await fs.readFile(path.join(root, platform, 'agents', name));
  }
  const base = loadModelConfig(await fs.readFile(path.join(root, platform, 'skill/models.toml'), 'utf8'), platform);
  return {inputs, modelConfig: applyPreset(base, 'smart')};
}

// Starts from the fixture's runtime copies, then clears its pre-published composite state so the real prepare/publish path runs.
async function freshInstall(t, revision, roles = {arc_qa: 'codex'}) {
  const f = await createRoutingFixture(t, {roles, revision: /^[A-Za-z0-9._-]{1,128}$/.test(revision) ? revision : 'rev-fixture'});
  const names = ROUTING_ROLES.map(role => role.slice(4));
  for (const platform of ['codex', 'claude']) {
    await fs.rm(path.join(f.homes[platform], 'arc-role-platform-routing.prepared.json'));
    for (const name of names) await fs.rm(path.join(f.homes[platform], 'agents', `arc-routing-${name}.${EXT[platform]}`), {force: true});
  }
  await fs.rm(f.activePath);
  const targets = {}, profileInputs = {}, modelConfigs = {};
  for (const platform of ['codex', 'claude']) {
    targets[platform] = {platform, home: f.homes[platform], userHome: f.userHome};
    const {inputs, modelConfig} = await inputsFor(platform);
    profileInputs[platform] = inputs; modelConfigs[platform] = modelConfig;
  }
  const context = {safeFs};
  return {f, targets, profileInputs, modelConfigs, context, config: {...f.config, revision}};
}
const install = async s => {
  const prepared = prepareCompositeFiles({context: s.context, targets: s.targets, config: s.config, profileInputs: s.profileInputs, modelConfigs: s.modelConfigs});
  return publishCompositeFiles({context: s.context, prepared});
};

test('composite profiles carry the revision tag on both platforms and markers hash the tagged bytes', {timeout: 60000}, async t => {
  const rev = 'rev-tag.1_A';
  const s = await freshInstall(t, rev);
  await install(s);
  const tag = `[arc-routing rev ${rev}]`;
  const codexQa = await fs.readFile(path.join(s.f.codexHome, 'agents/arc-routing-qa.toml'));
  assert.ok(parseToml(codexQa.toString('utf8')).description.endsWith(` ${tag}`));
  const claudeBytes = await fs.readFile(path.join(s.f.claudeHome, 'agents/arc-routing-planner.md'));
  const line = claudeBytes.toString('utf8').split('\n').find(l => l.startsWith('description:'));
  assert.ok(line.endsWith(` ${tag}`));
  for (const platform of ['codex', 'claude']) {
    const home = s.f.homes[platform], marker = JSON.parse(await fs.readFile(path.join(home, 'arc-role-platform-routing.prepared.json'), 'utf8'));
    assert.ok(Object.keys(marker.profiles).length > 0);
    for (const entry of Object.values(marker.profiles)) assert.equal(entry.hash, digest(await fs.readFile(path.join(home, entry.path))));
  }
});

test('routing-status revisionTag equals the tag inside the installed profile', {timeout: 60000}, async t => {
  const rev = 'rev-status';
  const s = await freshInstall(t, rev);
  await install(s);
  await s.f.cli('claude', {version: '2.1.322 (Claude Code)'}); await s.f.cli('codex', {version: 'codex-cli 0.167.0'});
  const status = await routingStatus({context: s.f.context(), policy: undefined});
  const tag = status.roles.arc_qa.revisionTag;
  assert.equal(tag, revisionTag(rev));
  const codexQa = await fs.readFile(path.join(s.f.codexHome, 'agents/arc-routing-qa.toml'), 'utf8');
  assert.ok(parseToml(codexQa).description.endsWith(` ${tag}`));
  const planner = await fs.readFile(path.join(s.f.claudeHome, 'agents/arc-routing-planner.md'), 'utf8');
  assert.ok(planner.split('\n').find(l => l.startsWith('description:')).endsWith(` ${tag}`));
});

test('untaggable revision is rejected before publication', {timeout: 60000}, async t => {
  for (const rev of ['bad rev', 'bad]rev', 'a'.repeat(129), 'révision']) {
    const s = await freshInstall(t, rev);
    assert.throws(() => prepareCompositeFiles({context: s.context, targets: s.targets, config: s.config, profileInputs: s.profileInputs, modelConfigs: s.modelConfigs}),
      error => error.name === 'TargetConfigurationError' && error.message === 'Composite revision cannot be tagged', JSON.stringify(rev));
    for (const platform of ['codex', 'claude']) assert.deepEqual((await fs.readdir(path.join(s.f.homes[platform], 'agents'))).filter(n => n.startsWith('arc-routing-')), []);
  }
  const bytes = Buffer.from('name: arc-qa\ndescription: a\ndescription: b\n');
  assert.throws(() => renameCompositeProfile(bytes, 'claude', 'arc_qa', 'rev-1'), /Cannot identify|cannot be tagged/);
});

test('standard arc-* profiles are unchanged', {timeout: 60000}, async t => {
  const s = await freshInstall(t, 'rev-std');
  await install(s);
  for (const platform of ['codex', 'claude']) {
    const settings = resolveModelSettings(s.modelConfigs[platform]), rendered = renderProfiles(s.profileInputs[platform], settings);
    for (const [name, bytes] of rendered) assert.ok(!bytes.toString('utf8').includes('[arc-routing rev'), name);
    const agents = await fs.readdir(path.join(s.f.homes[platform], 'agents'));
    assert.deepEqual(agents.filter(n => !n.startsWith('arc-routing-')), []);
  }
});
