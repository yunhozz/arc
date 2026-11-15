import test from 'node:test';
import assert from 'node:assert/strict';
import * as routing from '../../lib/runtime/role-routing-config.mjs';
import {createTestRuntimeRegistry, createTestRegistries} from './fixtures/platforms/zeta.mjs';

const v1Text = `{
  "version": 1,
  "revision": "rev-1",
  "roles": {
    "arc_scouter": {
      "platform": "codex",
      "model": "gpt-5",
      "effort": "high"
    },
    "arc_planner": {
      "platform": "claude",
      "model": "opus",
      "effort": "max"
    },
    "arc_implementer": {
      "platform": "codex",
      "model": "gpt-5",
      "effort": "high"
    },
    "arc_qa": {
      "platform": "codex",
      "model": "gpt-5",
      "effort": "high"
    },
    "arc_reviewer": {
      "platform": "claude",
      "model": "opus",
      "effort": "max"
    }
  }
}
`;
const v1 = () => JSON.parse(v1Text);
const v2 = () => {
  const {revision, roles} = v1();
  for (const fields of Object.values(roles)) if (fields.platform === 'codex') fields.platform = 'zeta';
  return {version: 2, revision, platforms: ['claude', 'zeta'], roles};
};
const opts = {runtimePlatforms: createTestRuntimeRegistry()};

test('v1 round-trips byte-identically and exposes its implicit participating platforms', () => {
  const config = routing.parseRoleRoutingConfig(v1Text);
  assert.deepEqual(config.platforms, ['codex', 'claude']);
  assert.equal(routing.serializeRoleRoutingConfig(config), v1Text);
  assert.equal(routing.serializeRoleRoutingConfig(v1()), v1Text);
});

test('v1 validation accepts omitted or explicit implicit platforms without mutating input', () => {
  const input = v1();
  const config = routing.validateRoleRoutingConfig(input);
  assert.deepEqual(config, {...input, platforms: ['codex', 'claude']});
  assert.equal(Object.hasOwn(input, 'platforms'), false);
  config.roles.arc_scouter.model = 'changed';
  assert.equal(input.roles.arc_scouter.model, 'gpt-5');
  assert.deepEqual(routing.validateRoleRoutingConfig({...input, platforms: ['codex', 'claude']}), {...input, platforms: ['codex', 'claude']});
});

test('v1 rejects a participating set or role platform outside its implicit pair', () => {
  assert.throws(() => routing.validateRoleRoutingConfig({...v1(), platforms: ['claude', 'zeta']}, opts));
  const input = v1();
  input.roles.arc_scouter.platform = 'zeta';
  assert.throws(() => routing.validateRoleRoutingConfig(input, opts));
});

test('build writes v1 only for codex+claude and normalizes host order and duplicates', () => {
  const {roles} = v1();
  for (const fields of Object.values(roles)) fields.platform = 'codex';
  const config = routing.buildRoleRoutingConfig({revision: 'rev-1', platforms: ['claude', 'codex', 'claude'], roles});
  assert.equal(config.version, 1);
  assert.deepEqual(config.platforms, ['codex', 'claude']);
  assert.equal(Object.hasOwn(JSON.parse(routing.serializeRoleRoutingConfig(config)), 'platforms'), false);
});

test('build unions role platforms with hosts and sorts by anchorOrder for v2', () => {
  const {roles} = v2();
  const config = routing.buildRoleRoutingConfig({revision: 'rev-1', platforms: ['zeta'], roles}, opts);
  assert.deepEqual(config, v2());
  const three = routing.buildRoleRoutingConfig({revision: 'rev-1', platforms: ['zeta', 'codex', 'zeta'], roles}, opts);
  assert.equal(three.version, 2);
  assert.deepEqual(three.platforms, ['codex', 'claude', 'zeta']);
});

test('build can derive the participating set solely from roles', () => {
  const {revision, roles} = v2();
  assert.deepEqual(routing.buildRoleRoutingConfig({revision, roles}, opts), v2());
});

test('build rejects unknown hosts and a participating set with fewer than two members', () => {
  assert.throws(() => routing.buildRoleRoutingConfig({revision: 'rev-1', platforms: ['missing'], roles: v1().roles}, opts));
  const {roles} = v1();
  for (const fields of Object.values(roles)) fields.platform = 'codex';
  assert.throws(() => routing.buildRoleRoutingConfig({revision: 'rev-1', roles}));
});

test('v2 parses with an injected registry and validates without mutating its input', () => {
  const input = v2();
  const config = routing.parseRoleRoutingConfig(JSON.stringify(input), createTestRegistries());
  assert.deepEqual(config, input);
  const validated = routing.validateRoleRoutingConfig(input, opts);
  validated.platforms.push('codex');
  validated.roles.arc_scouter.model = 'changed';
  assert.deepEqual(input, v2());
  assert.throws(() => routing.parseRoleRoutingConfig(JSON.stringify(input)));
});

test('v2 serializes in version, revision, platforms, roles order using v1 formatting', () => {
  const expected = v1Text.replace('"version": 1', '"version": 2')
    .replace('  "roles": {', '  "platforms": [\n    "claude",\n    "zeta"\n  ],\n  "roles": {')
    .replaceAll('"platform": "codex"', '"platform": "zeta"');
  for (const config of [
    routing.parseRoleRoutingConfig(expected, opts),
    routing.validateRoleRoutingConfig(v2(), opts),
    routing.buildRoleRoutingConfig({revision: 'rev-1', platforms: ['zeta', 'claude'], roles: v2().roles}, opts),
  ]) assert.equal(routing.serializeRoleRoutingConfig(config), expected);
});

test('v2 with exactly codex+claude serializes as the existing v1 bytes', () => {
  const config = routing.validateRoleRoutingConfig({...v1(), version: 2, platforms: ['codex', 'claude']});
  assert.equal(config.version, 2);
  assert.equal(routing.serializeRoleRoutingConfig(config), v1Text);
});

for (const [name, platforms] of [
  ['unsorted', ['zeta', 'claude']],
  ['duplicate', ['claude', 'zeta', 'zeta']],
  ['unregistered', ['claude', 'missing']],
  ['missing role platform', ['codex', 'claude']],
  ['empty', []],
  ['length one', ['zeta']],
  ['not an array', 'claude,zeta'],
  ['missing', undefined],
]) test(`v2 rejects ${name} participating platforms`, () => {
  const input = {...v2(), platforms};
  assert.throws(() => routing.validateRoleRoutingConfig(input, opts));
  assert.throws(() => routing.parseRoleRoutingConfig(JSON.stringify(input), opts));
});

test('registry pair rules accept registered zeta and reject unknown platforms or invalid values', () => {
  assert.equal(routing.validRoleValues('zeta', 'opus', 'high', opts), true);
  assert.equal(routing.validRoleValues('zeta', 'invalid model', 'high', opts), false);
  assert.equal(routing.validRoleValues('zeta', 'opus', 'ultra', opts), false);
  assert.equal(routing.validRoleValues('missing', 'opus', 'high', opts), false);
  assert.equal(routing.validRoleValues('zeta', 'opus', 'high'), false);
  assert.equal(routing.validRoleValues('codex', 'any model', 'custom'), true);
  assert.equal(routing.validRoleValues('codex', 'any model', 'custom', {runtimePlatforms: createTestRuntimeRegistry(['claude', 'zeta'])}), false);
  assert.equal(routing.validRoleValues('claude', 'opus', 'max'), true);
  for (const invalid of ['', ' space', 'space ', 'line\nbreak', '\u2028']) {
    assert.equal(routing.validRoleValues('codex', invalid, 'high'), false);
    assert.equal(routing.validRoleValues('claude', 'opus', invalid), false);
  }
});

test('v2 validates role pair rules as well as schema, revision and role completeness', () => {
  const invalidPair = v2();
  invalidPair.roles.arc_scouter.effort = 'ultra';
  const missingRole = v2();
  delete missingRole.roles.arc_qa;
  const extraRoleField = v2();
  extraRoleField.roles.arc_planner.extra = true;
  for (const input of [invalidPair, missingRole, extraRoleField, {...v2(), revision: ''}, {...v2(), extra: true}, {...v2(), version: 3}]) {
    assert.throws(() => routing.validateRoleRoutingConfig(input, opts));
  }
  assert.throws(() => routing.parseRoleRoutingConfig('{broken', opts));
});
