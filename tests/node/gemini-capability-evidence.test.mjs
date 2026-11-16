import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CAPABILITY_PREREQUISITES, getPlatform} from '../../lib/runtime/platform-registry.mjs';
import {selectGeminiCatalogModels} from '../../lib/models/catalog-gemini.mjs';
import {loadStaticModelCatalog} from '../../lib/models/static-catalog.mjs';
import {loadModelConfig, resolveModelSettings} from '../../lib/models/index.mjs';

const VERIFIED = ['install', 'nativeProfile', 'catalog', 'standalone', 'bridge', 'compositeRole'];
const SUPPORTED = '>=0.68.0 <0.69.0';
const LIVE_ACCEPTED = ['gemini-2.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.6-flash'];
const LIVE_REJECTED = ['gemini-2.5-pro', 'gemini-2.5-flash-lite'];

function verifyCatalogEvidence(models, defaults) {
  assert.deepEqual(selectGeminiCatalogModels(models), models, 'static catalog must pass model selection unchanged');
  assert.ok(LIVE_REJECTED.every(model => !models.includes(model)), 'rejected models must not appear in the catalog');
  for (const model of defaults) assert.ok(LIVE_ACCEPTED.includes(model), 'role defaults must be accepted live');
}

// Live results are recorded in the Phase B plan progress record and promotion commit message.
function verifyEvidence(descriptor, models, defaults) {
  assert.ok(descriptor, 'Gemini descriptor is required');
  const verified = Object.entries(descriptor.capabilities).filter(([, value]) => value.state === 'verified').map(([key]) => key);
  for (const capability of verified) {
    for (const required of CAPABILITY_PREREQUISITES[capability] ?? []) {
      assert.equal(descriptor.capabilities[required]?.state, 'verified', `${capability} requires ${required}`);
    }
  }
  assert.deepEqual(new Set(verified), new Set(VERIFIED), 'verified capabilities must equal the fixed verified set');
  assert.equal(descriptor.cli.supportedVersions, SUPPORTED, 'supported versions must equal the fixed range');
  if (descriptor.capabilities.catalog.state === 'verified') verifyCatalogEvidence(models, defaults);
}

const promoted = () => ({cli: {supportedVersions: SUPPORTED}, capabilities: Object.fromEntries(VERIFIED.map(key => [key, {state: 'verified'}]))});
const catalogModels = ['gemini-3.8-flash', ...LIVE_ACCEPTED];
const roleDefaults = ['gemini-2.5-flash'];

test('operational Gemini capabilities, catalog and role defaults satisfy the fixed live contract', async () => {
  const result = await loadStaticModelCatalog('gemini');
  assert.equal(result.status, 'ready');
  const settings = resolveModelSettings(loadModelConfig(fs.readFileSync(new URL('../../gemini/skill/models.toml', import.meta.url)), 'gemini'));
  verifyEvidence(getPlatform('gemini'), result.catalog.pairs.map(pair => pair.model), Object.values(settings.roles).map(role => role.model));
});

test('fixed contract accepts listed catalog models and all live-accepted role defaults', () => {
  assert.doesNotThrow(() => verifyEvidence(promoted(), catalogModels, LIVE_ACCEPTED));
});

test('fixed contract requires a Gemini descriptor', () => {
  assert.throws(() => verifyEvidence(null, catalogModels, roleDefaults), /Gemini descriptor is required/);
});

test('verified capabilities require every verified prerequisite', () => {
  for (const capability of VERIFIED) {
    for (const required of CAPABILITY_PREREQUISITES[capability]) {
      const descriptor = promoted();
      descriptor.capabilities[required] = {state: 'off'};
      assert.throws(() => verifyEvidence(descriptor, catalogModels, roleDefaults), new RegExp(`requires ${required}`));
    }
  }
});

test('fixed contract rejects verified capabilities outside the fixed set', () => {
  for (const capability of ['compositeHost', 'authProbe', 'watch', 'unrecorded']) {
    const descriptor = promoted();
    descriptor.capabilities[capability] = {state: 'verified'};
    assert.throws(() => verifyEvidence(descriptor, catalogModels, roleDefaults), /verified capabilities must equal the fixed verified set/);
  }
});

test('fixed contract rejects a missing verified capability', () => {
  const descriptor = promoted();
  delete descriptor.capabilities.compositeRole;
  assert.throws(() => verifyEvidence(descriptor, catalogModels, roleDefaults), /verified capabilities must equal the fixed verified set/);
});

test('fixed contract rejects changed or missing supported-version ranges', () => {
  for (const supportedVersions of ['>=0.68.0', '>=0.68.0 <0.70.0', null]) {
    const descriptor = promoted();
    descriptor.cli.supportedVersions = supportedVersions;
    assert.throws(() => verifyEvidence(descriptor, catalogModels, roleDefaults), /supported versions must equal the fixed range/);
  }
});

test('catalog rejects models changed or removed by model selection', () => {
  for (const model of ['gemini-3.8-flash-preview', 'gemini-3.8-flash', 'gemini-embedding-001']) {
    assert.throws(() => verifyEvidence(promoted(), [...catalogModels, model], roleDefaults), /static catalog must pass model selection unchanged/);
  }
});

for (const model of LIVE_REJECTED) test(`catalog rejects live-rejected model ${model}`, () => {
  assert.throws(() => verifyEvidence(promoted(), [...catalogModels, model], roleDefaults), /rejected models must not appear/);
});

test('catalog rejects a role default outside live accepted, including a listed-only model', () => {
  for (const model of ['gemini-3.8-flash', 'gemini-2.5-pro']) {
    assert.throws(() => verifyEvidence(promoted(), catalogModels, [model]), /role defaults must be accepted live/);
  }
});
