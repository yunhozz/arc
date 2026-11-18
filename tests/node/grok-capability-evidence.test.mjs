import test from 'node:test';
import assert from 'node:assert/strict';
import {CAPABILITY_KEYS, CAPABILITY_PREREQUISITES, getPlatform} from '../../lib/runtime/platform-registry.mjs';

function verifyEvidence(descriptor) {
  assert.ok(descriptor, 'Grok descriptor is required');
  const verified = Object.entries(descriptor.capabilities).filter(([, value]) => value.state === 'verified').map(([key]) => key);
  for (const capability of verified) for (const required of CAPABILITY_PREREQUISITES[capability] ?? []) assert.equal(descriptor.capabilities[required]?.state, 'verified', `${capability} requires ${required}`);
  assert.deepEqual(verified, [], 'Grok verified capabilities must remain empty');
  assert.equal(descriptor.cli.supportedVersions, '>=1.0.0 <1.1.0');
}

test('operational Grok verified set is empty with no prerequisite violations and the fixed supported range', () => {
  verifyEvidence(getPlatform('grok'));
});

test('Grok capability evidence rejects any injected verified capability', () => {
  for (const key of CAPABILITY_KEYS) {
    const capabilities = Object.fromEntries(CAPABILITY_KEYS.map(name => [name, {state: 'off'}]));
    const promote = name => {capabilities[name] = {state: 'verified'}; for (const required of CAPABILITY_PREREQUISITES[name]) promote(required);};
    promote(key);
    assert.throws(() => verifyEvidence({cli: {supportedVersions: '>=1.0.0 <1.1.0'}, capabilities}), /Grok verified capabilities must remain empty/);
  }
});
