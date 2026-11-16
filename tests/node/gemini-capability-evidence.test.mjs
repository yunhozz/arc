import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CAPABILITY_PREREQUISITES, getPlatform} from '../../lib/runtime/platform-registry.mjs';
import {supportedVersion} from '../../lib/platforms/availability.mjs';
import {loadModelConfig, resolveModelSettings} from '../../lib/models/index.mjs';

function catalogEvidenceLists(bytes) {
  const line = label => {
    const value = bytes.toString().split(/\r?\n/).find(line => line.startsWith(`- ${label}: `));
    assert.ok(value, `catalog evidence requires ${label}`);
    return value.slice(`- ${label}: `.length).trim();
  };
  const csv = value => value.split(',').map(item => item.trim()).filter(Boolean);
  const annotated = value => value ? value.split(/,\s*(?=[^\s,\[\]]+\s*\[)/).map(item => {
    const match = /^([^\s,\[\]]+) \[([^\]]+)\]$/.exec(item);
    assert.ok(match, `invalid catalog evidence item: ${item}`);
    return {model: match[1], annotation: match[2]};
  }) : [];
  const accepted = csv(line('accepted (live -m)'));
  const listed = annotated(line('listed (quota-blocked)')).map(({model, annotation}) => {
    const parts = annotation.split(';');
    assert.equal(parts.length, 2, 'listed evidence requires sources and codes');
    return {model, sources: csv(parts[0]), codes: csv(parts[1])};
  });
  const rejected = annotated(line('excluded (rejected)')).map(({model}) => model);
  return {accepted, listed, rejected};
}

function verifyCatalogEvidence(bytes, models, defaults) {
  const {accepted, listed, rejected} = catalogEvidenceLists(bytes);
  const categories = [...accepted, ...listed.map(item => item.model), ...rejected];
  assert.equal(new Set(categories).size, categories.length, 'catalog evidence categories must be disjoint');
  for (const {sources, codes} of listed) {
    assert.ok(sources.length && sources.every(source => ['cli', 'api'].includes(source)), 'listed sources must be cli or api');
    assert.ok(codes.length && codes.every(code => ['429', '503'].includes(code)), 'listed codes must be 429 or 503');
  }
  assert.ok(rejected.every(model => !models.includes(model)), 'rejected models must not appear in the catalog');
  assert.deepEqual(new Set(models), new Set([...accepted, ...listed.map(item => item.model)]), 'static catalog must equal accepted union listed');
  for (const model of defaults) assert.ok(accepted.includes(model), 'role defaults must be accepted live');
}

// Evidence remains test-only; descriptor promotion without a passing supported-version record must fail.
function verifyEvidence(descriptor, files) {
  assert.ok(descriptor, 'Gemini descriptor is required');
  const records = files.filter(file => /^([A-Za-z]+)-\d{4}-\d{2}-\d{2}\.md$/.test(file.name)).map(file => {
    const field = key => new RegExp(`^- ${key}: (.+)$`, 'm').exec(file.bytes)?.[1];
    return {name: file.name, capability: field('capability'), version: field('gemini version')?.split(/\s/)[0], verdict: field('판정')};
  });
  for (const [capability, value] of Object.entries(descriptor.capabilities)) {
    if (value.state !== 'verified') continue;
    for (const required of CAPABILITY_PREREQUISITES[capability]) assert.equal(descriptor.capabilities[required].state, 'verified', `${capability} requires ${required}`);
    assert.ok(records.some(record => record.name.startsWith(`${capability}-`) && record.capability === capability && record.verdict === 'pass' && supportedVersion(record.version, descriptor.cli.supportedVersions)), `${capability} requires passing evidence for a supported Gemini version`);
  }
}
const evidenceDir = new URL('../../docs/superpowers/evidence/gemini/', import.meta.url);
const files = fs.existsSync(evidenceDir) ? fs.readdirSync(evidenceDir).filter(name => name.endsWith('.md')).map(name => ({name, bytes: fs.readFileSync(new URL(name, evidenceDir), 'utf8')})) : [];
const promoted = capabilities => ({cli: {supportedVersions: '>=0.68.0 <0.69.0'}, capabilities});
const record = (capability, version = '0.68.0', verdict = 'pass') => ({name: `${capability}-2026-11-16.md`, bytes: `- capability: ${capability}\n- gemini version: ${version} (recorded CLI output)\n- 판정: ${verdict}\n`});

test('operational Gemini verified capabilities have passing supported-version evidence and prerequisites', () => verifyEvidence(getPlatform('gemini'), files));
test('L1 operational Gemini install has its passing live evidence record', () => {
  assert.equal(getPlatform('gemini').capabilities.install.state, 'verified');
  const evidence = files.find(file => file.name === 'install-2026-11-16.md');
  assert.ok(evidence, 'L1 install evidence is required');
  verifyEvidence(promoted({install: getPlatform('gemini').capabilities.install}), [evidence]);
});
test('L3 operational Gemini nativeProfile has its passing live evidence record', () => {
  assert.equal(getPlatform('gemini').capabilities.nativeProfile.state, 'verified');
  const evidence = files.find(file => file.name === 'nativeProfile-2026-11-16.md');
  assert.ok(evidence, 'L3 nativeProfile evidence is required');
  verifyEvidence(promoted({install: getPlatform('gemini').capabilities.install, nativeProfile: getPlatform('gemini').capabilities.nativeProfile}), [files.find(file => file.name === 'install-2026-11-16.md'), evidence]);
});
test('L2 operational Gemini catalog has its passing live evidence record', () => {
  assert.equal(getPlatform('gemini').capabilities.catalog.state, 'verified');
  const evidence = files.find(file => file.name === 'catalog-2026-11-16.md');
  assert.ok(evidence, 'L2 catalog evidence is required');
  verifyEvidence(promoted({install: getPlatform('gemini').capabilities.install, catalog: getPlatform('gemini').capabilities.catalog}), [files.find(file => file.name === 'install-2026-11-16.md'), evidence]);
});

test('L4 operational Gemini standalone has its passing live evidence record', () => {
  assert.equal(getPlatform('gemini').capabilities.standalone.state, 'verified');
  const evidence = files.find(file => file.name === 'standalone-2026-11-16.md');
  assert.ok(evidence, 'L4 standalone evidence is required');
  assert.match(evidence.bytes, /invoke_agent.*agent_name: "arc-scouter"/);
  assert.match(evidence.bytes, /gemini-2\.5-flash.*role `subagent`/);
  verifyEvidence(getPlatform('gemini'), files);
});

test('catalog evidence categories cover the static catalog exactly', () => {
  const evidence = files.find(file => file.name === 'catalog-2026-11-16.md');
  assert.ok(evidence, 'L2 catalog evidence is required');
  const catalog = JSON.parse(fs.readFileSync(new URL('../../lib/models/gemini-models.json', import.meta.url)));
  const settings = resolveModelSettings(loadModelConfig(fs.readFileSync(new URL('../../gemini/skill/models.toml', import.meta.url)), 'gemini'));
  verifyCatalogEvidence(evidence.bytes, catalog.pairs.map(pair => pair.model), Object.values(settings.roles).map(role => role.model));
});

const categoryFixture = '- accepted (live -m): gemini-2.5-flash\n- listed (quota-blocked): gemini-3.5-flash [cli,api; 503,429], gemini-3.8-flash [api; 429]\n- excluded (rejected): gemini-2.5-pro [no longer available to new users]\n';
const categoryModels = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-2.5-flash'];
test('catalog evidence parser preserves bracketed source and code lists', () => {
  assert.deepEqual(catalogEvidenceLists(Buffer.from(categoryFixture)), {
    accepted: ['gemini-2.5-flash'],
    listed: [{model: 'gemini-3.5-flash', sources: ['cli', 'api'], codes: ['503', '429']}, {model: 'gemini-3.8-flash', sources: ['api'], codes: ['429']}],
    rejected: ['gemini-2.5-pro'],
  });
  assert.doesNotThrow(() => verifyCatalogEvidence(categoryFixture, categoryModels, ['gemini-2.5-flash']));
});
test('catalog evidence rejects a listed 404 code', () => {
  assert.throws(() => verifyCatalogEvidence(categoryFixture.replace('503,429', '404'), categoryModels, ['gemini-2.5-flash']), /listed codes must be 429 or 503/);
});
test('catalog evidence rejects a catalog containing a rejected model', () => {
  assert.throws(() => verifyCatalogEvidence(categoryFixture, [...categoryModels, 'gemini-2.5-pro'], ['gemini-2.5-flash']), /rejected models must not appear/);
});
test('catalog evidence rejects a role default that is only listed', () => {
  assert.throws(() => verifyCatalogEvidence(categoryFixture, categoryModels, ['gemini-3.5-flash']), /role defaults must be accepted live/);
});
test('verified without evidence is rejected', () => assert.throws(() => verifyEvidence(promoted({install: {state: 'verified'}}), []), /install requires passing evidence/));
test('evidence parser accepts pass and rejects wrong version, verdict, capability, filename and missing fields', () => {
  const descriptor = promoted({install: {state: 'verified'}});
  assert.doesNotThrow(() => verifyEvidence(descriptor, [record('install')]));
  for (const file of [record('install', '0.69.0'), record('install', '0.67.9'), record('install', '0.68.0', 'fail'), record('catalog'), {...record('install'), name: 'install-latest.md'}, {...record('install'), bytes: '- capability: install\n'}]) assert.throws(() => verifyEvidence(descriptor, [file]), /passing evidence/);
});
test('verified capability with passing evidence still requires verified prerequisites', () => {
  assert.throws(() => verifyEvidence(promoted({install: {state: 'off'}, nativeProfile: {state: 'verified'}}), [record('nativeProfile')]), /nativeProfile requires install/);
});
