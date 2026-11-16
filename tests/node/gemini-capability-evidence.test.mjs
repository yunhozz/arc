import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CAPABILITY_PREREQUISITES, getPlatform} from '../../lib/runtime/platform-registry.mjs';
import {supportedVersion} from '../../lib/platforms/availability.mjs';

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
  verifyEvidence(getPlatform('gemini'), [files.find(file => file.name === 'install-2026-11-16.md'), evidence]);
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
