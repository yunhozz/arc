import test from 'node:test';
import assert from 'node:assert/strict';
import {ROLES} from '../../lib/models/config.mjs';
import {mixedLabel} from '../../lib/platforms/index.mjs';
import {createTestRegistries} from './fixtures/platforms/zeta.mjs';

const load = url => import(url).catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND' || error.url !== new URL(url, import.meta.url).href) throw error;
  return {};
});
const plan = await load('../../lib/tui/derive-install-plan.mjs');
const mode = await load('../../lib/tui/mode.mjs');
const {platforms: registry} = createTestRegistries(['codex', 'claude', 'zeta', 'eta']);
const all = platform => Object.fromEntries(ROLES.map(role => [role, {platform, model: 'm', effort: 'high'}]));
const standalone = {mode: 'standalone', platforms: null};
const composite = platforms => ({mode: 'composite', platforms});
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

// Literal results catch wrong D1 branches, set differences, anchor selection and label ordering.
const cases = [
  {
    name: 'D1-a: one Claude platform remains standalone',
    roles: all('claude'), hosts: [], current: standalone,
    want: {rule: 'D1-a', platforms: ['claude'], anchor: 'claude', previous: [], removed: [], added: ['claude'], anchorMove: false, modeLabel: 'Claude'},
  },
  {
    name: 'D1-b: clearing every host with all Codex roles turns mixed routing off (Review Focus 2)',
    roles: all('codex'), hosts: [], current: composite(['codex', 'claude']),
    want: {rule: 'D1-b', platforms: ['codex'], anchor: 'codex', previous: ['codex', 'claude'], removed: ['claude'], added: [], anchorMove: false, modeLabel: 'Codex'},
  },
  {
    name: 'D1-c: all Codex roles plus a Claude host derive a composite install (AC-T10)',
    roles: all('codex'), hosts: ['claude'], current: standalone,
    want: {rule: 'D1-c', platforms: ['codex', 'claude'], anchor: 'codex', previous: [], removed: [], added: ['codex', 'claude'], anchorMove: false, modeLabel: 'Mixed (Claude + Codex)'},
  },
  {
    name: 'D1-c: three platforms are deduplicated and sorted by anchor order',
    roles: all('zeta'), hosts: ['claude', 'codex', 'zeta', 'claude'], current: standalone,
    want: {rule: 'D1-c', platforms: ['codex', 'claude', 'zeta'], anchor: 'codex', previous: [], removed: [], added: ['codex', 'claude', 'zeta'], anchorMove: false, modeLabel: 'Mixed (Claude + Codex + Zeta)'},
  },
  {
    name: 'D1-d: equal sets compare by membership regardless of input order',
    roles: all('claude'), hosts: ['codex'], current: composite(['claude', 'codex']),
    want: {rule: 'D1-d', platforms: ['codex', 'claude'], anchor: 'codex', previous: ['codex', 'claude'], removed: [], added: [], anchorMove: false, modeLabel: 'Mixed (Claude + Codex)'},
  },
  {
    name: 'D1-e: replacing a member can keep the same anchor',
    roles: all('eta'), hosts: ['codex'], current: composite(['zeta', 'codex']),
    want: {rule: 'D1-e', platforms: ['codex', 'eta'], anchor: 'codex', previous: ['codex', 'zeta'], removed: ['zeta'], added: ['eta'], anchorMove: false, modeLabel: 'Mixed (Codex + Eta)'},
  },
  {
    name: 'D1-e: adding Codex moves the anchor from Claude',
    roles: all('zeta'), hosts: ['codex', 'claude'], current: composite(['zeta', 'claude']),
    want: {rule: 'D1-e', platforms: ['codex', 'claude', 'zeta'], anchor: 'codex', previous: ['claude', 'zeta'], removed: [], added: ['codex'], anchorMove: true, modeLabel: 'Mixed (Claude + Codex + Zeta)'},
  },
  {
    name: 'D1-e: removing Codex moves the anchor to Claude',
    roles: all('zeta'), hosts: ['claude'], current: composite(['zeta', 'codex', 'claude']),
    want: {rule: 'D1-e', platforms: ['claude', 'zeta'], anchor: 'claude', previous: ['codex', 'claude', 'zeta'], removed: ['codex'], added: [], anchorMove: true, modeLabel: 'Mixed (Claude + Zeta)'},
  },
  {
    name: 'hosts [] derives S from role platforms only',
    roles: {...all('zeta'), [ROLES[0]]: {platform: 'claude', model: 'm', effort: 'high'}}, hosts: [], current: standalone,
    want: {rule: 'D1-c', platforms: ['claude', 'zeta'], anchor: 'claude', previous: [], removed: [], added: ['claude', 'zeta'], anchorMove: false, modeLabel: 'Mixed (Claude + Zeta)'},
  },
  ...['claude', 'zeta'].map(platform => ({
    name: `D1-f: unverified overrides the ${platform === 'claude' ? 'single' : 'mixed'} preview`,
    roles: all(platform), hosts: ['claude'], current: {mode: 'unverified', platforms: null},
    want: platform === 'claude'
      ? {rule: 'D1-f', platforms: ['claude'], anchor: 'claude', previous: [], removed: [], added: ['claude'], anchorMove: false, modeLabel: 'Unverified'}
      : {rule: 'D1-f', platforms: ['claude', 'zeta'], anchor: 'claude', previous: [], removed: [], added: ['claude', 'zeta'], anchorMove: false, modeLabel: 'Unverified'},
  })),
];

for (const {name, want, ...input} of cases) test(name, () => {
  assert.equal(typeof plan.deriveInstallPlan, 'function');
  const before = structuredClone(input);
  assert.deepEqual(plan.deriveInstallPlan({...freeze(input), registry}), want);
  assert.deepEqual(input, before);
});

test('deriveInstallPlan defaults to the production installer registry', () => {
  assert.equal(typeof plan.deriveInstallPlan, 'function');
  assert.deepEqual(plan.deriveInstallPlan({roles: all('codex'), hosts: ['claude'], current: standalone}), {
    rule: 'D1-c', platforms: ['codex', 'claude'], anchor: 'codex', previous: [], removed: [], added: ['codex', 'claude'], anchorMove: false, modeLabel: 'Mixed (Claude + Codex)',
  });
});

test('four fake ids use display order in homeStatusLine and mixedLabel (AC-T9)', () => {
  assert.equal(typeof mode.homeStatusLine, 'function');
  const ids = ['codex', 'claude', 'zeta', 'eta'];
  assert.deepEqual(registry.platformIds(), ids);
  const statuses = freeze(ids.map(platform => ({platform, state: 'installed'})));
  assert.equal(mode.homeStatusLine(statuses, registry), 'Claude: Available / Codex: Available / Zeta: Available / Eta: Available');
  assert.equal(mixedLabel(ids, registry), 'Mixed (Claude + Codex + Zeta + Eta)');
  assert.equal(mode.homeModeLine(composite(ids), statuses, registry), 'Mixed (Claude + Codex + Zeta + Eta)');
  assert.equal(plan.deriveInstallPlan({roles: all('eta'), hosts: ['zeta', 'claude', 'codex'], current: standalone, registry}).modeLabel, 'Mixed (Claude + Codex + Zeta + Eta)');
});

// The old renderer's auth precedence must survive extraction, including fallback states.
for (const [status, want] of [
  [{state: 'absent'}, 'Not Available'],
  [{state: 'absent', authentication: {authStatus: 'unauthorized'}}, 'Not Available'],
  [{state: 'incomplete'}, 'Incomplete'],
  [{state: 'installed', authentication: {reason: 'cli_not_found', authStatus: 'unauthorized'}}, 'Not Available'],
  [{state: 'installed', authentication: {authStatus: 'unauthorized'}}, 'Unauthorized'],
  [{state: 'installed', authentication: {authStatus: 'unknown'}}, 'Incomplete'],
  [{state: 'installed', authentication: {authStatus: 'authenticated'}}, 'Available'],
  [{state: 'installed'}, 'Available'],
  [{state: 'custom'}, 'custom'],
]) test(`homeStatusLine preserves State mapping: ${JSON.stringify(status)}`, () => {
  assert.equal(typeof mode.homeStatusLine, 'function');
  assert.equal(mode.homeStatusLine(freeze([{platform: 'codex', ...status}])), `Codex: ${want}`);
});

test('homeStatusLine returns an empty line for no statuses', () => {
  assert.equal(typeof mode.homeStatusLine, 'function');
  assert.equal(mode.homeStatusLine([]), '');
});

// Mode describes the install, independently of CLI authentication or input ordering.
for (const [name, installState, statuses, want] of [
  ['composite uses only its participants', composite(['zeta', 'claude']), [{platform: 'codex', state: 'installed'}], 'Mixed (Claude + Zeta)'],
  ['standalone uses installed statuses in display order', standalone, [
    {platform: 'eta', state: 'absent'}, {platform: 'codex', state: 'installed', authentication: {authStatus: 'unauthorized'}},
    {platform: 'zeta', state: 'incomplete'}, {platform: 'claude', state: 'installed', authentication: {reason: 'cli_not_found', authStatus: 'unknown'}},
  ], 'Claude, Codex'],
  ['one standalone installation', standalone, [{platform: 'zeta', state: 'installed'}], 'Zeta'],
  ['no installations', standalone, [{platform: 'codex', state: 'absent'}, {platform: 'claude', state: 'incomplete'}], 'Not installed'],
  ['no statuses', standalone, [], 'Not installed'],
  ['unverified overrides installed statuses', {mode: 'unverified', platforms: ['codex', 'claude']}, [{platform: 'codex', state: 'installed'}], 'Unverified'],
]) test(`homeModeLine: ${name}`, () => {
  assert.equal(typeof mode.homeModeLine, 'function');
  assert.equal(mode.homeModeLine(freeze(installState), freeze(statuses), registry), want);
});

test('homeModeLine defaults to the production installer registry', () => {
  assert.equal(typeof mode.homeModeLine, 'function');
  assert.equal(mode.homeModeLine(composite(['codex', 'claude']), []), 'Mixed (Claude + Codex)');
});
