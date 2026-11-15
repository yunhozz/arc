import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlatformRegistry, getPlatform} from '../../lib/runtime/platform-registry.mjs';
const api = await import('../../lib/platforms/availability.mjs').catch(() => ({}));
const installer = await import('../../lib/platforms/index.mjs').catch(() => ({}));
const fixtures = await import('./fixtures/platforms/zeta.mjs');
const ok = {state: 'installed', authentication: {authStatus: 'authenticated'}};
const ready = {status: 'ready', catalog: {pairs: [{model: 'gpt-5.5', effort: 'high'}]}};
const blocked = reason => ({selectable: false, reason, warning: null});
const available = {selectable: true, reason: null, warning: null};

test('REASON_TEXT maps exactly the six spec codes', () => {
  assert.deepEqual(api.REASON_TEXT, {
    capability_not_verified: 'capability not verified', not_installed: 'not installed',
    unsupported_version: 'unsupported version', unauthorized: 'unauthorized',
    auth_check_failed: 'auth check failed', catalog_error: 'catalog error',
  });
});

test('availability priority follows spec table', () => {
  assert.equal(typeof api.platformAvailability, 'function');
  for (const [id, status, catalog, usage, reason] of [
    ['codex', {...ok, authentication: {reason: 'cli_not_found', authStatus: 'unknown'}}, {status: 'unavailable'}, 'role', 'not_installed'],
    ['codex', {...ok, authentication: {authStatus: 'unauthorized'}}, {status: 'unavailable'}, 'role', 'unauthorized'],
    ['codex', {...ok, authentication: {authStatus: 'unknown'}}, ready, 'host', 'auth_check_failed'],
    ['claude', ok, {status: 'ready', catalog: {pairs: []}}, 'role', 'catalog_error'],
    ['claude', ok, {status: 'unavailable'}, 'host', 'catalog_error'],
    ['codex', ok, null, 'role', 'catalog_error'],
  ]) assert.deepEqual(api.platformAvailability(id, {status, catalog, usage}), blocked(reason));
  assert.deepEqual(api.platformAvailability('codex', {status: ok, catalog: ready, usage: 'role'}), available);
  assert.deepEqual(api.platformAvailability('codex', {status: ok, usage: 'host'}), available);
  assert.deepEqual(api.platformAvailability('codex', {usage: 'role'}), blocked('auth_check_failed'));
  assert.deepEqual(api.platformAvailability('unknown', {status: ok, catalog: ready, usage: 'role'}), blocked('capability_not_verified'));
});

test('standalone ignores CLI, versions and auth but still requires a ready catalog when evaluated', () => {
  assert.equal(typeof api.platformAvailability, 'function');
  for (const authentication of [{authStatus: 'unauthorized'}, {authStatus: 'unknown'}, {authStatus: 'unknown', reason: 'cli_not_found'}]) {
    const status = {state: 'absent', authentication};
    assert.deepEqual(api.platformAvailability('codex', {status, catalog: ready, usage: 'standalone'}), available);
    assert.deepEqual(api.platformAvailability('codex', {status, catalog: {status: 'unavailable'}, usage: 'standalone'}), blocked('catalog_error'));
  }
  assert.deepEqual(api.platformAvailability('claude', {usage: 'standalone'}), available);
});

test('auth kind none passes unknown with warning and does not hide catalog errors', () => {
  assert.equal(typeof fixtures.createTestRegistries, 'function');
  const {platforms: registry} = fixtures.createTestRegistries();
  const status = {...ok, authentication: {authStatus: 'unknown'}};
  for (const usage of ['role', 'host']) {
    assert.deepEqual(api.platformAvailability('zeta', {status, catalog: ready, usage, registry}), {selectable: true, reason: null, warning: 'auth_unverified'});
    assert.deepEqual(api.platformAvailability('zeta', {status, catalog: {status: 'unavailable'}, usage, registry}), blocked('catalog_error'));
    assert.deepEqual(api.platformAvailability('zeta', {status: {...ok, authentication: {authStatus: 'unauthorized'}}, catalog: ready, usage, registry}), blocked('unauthorized'));
  }
  assert.deepEqual(api.platformAvailability('zeta', {status, catalog: ready, usage: 'standalone', registry}), available);
});

test('capability off wins first for every usage and standalone checks install too', () => {
  assert.equal(typeof fixtures.createTestRegistries, 'function');
  const {platforms: registry} = fixtures.createTestRegistries(['codex', 'claude', 'zeta', 'eta']);
  for (const usage of ['role', 'host', 'standalone']) assert.deepEqual(api.platformAvailability('eta', {status: {authentication: {reason: 'cli_not_found'}}, catalog: {status: 'unavailable'}, usage, registry}), blocked('capability_not_verified'));
  for (const [key, usage] of [['install', 'standalone'], ['standalone', 'standalone'], ['compositeRole', 'role'], ['compositeHost', 'host']]) {
    const runtime = createPlatformRegistry([{...getPlatform('codex'), capabilities: {...getPlatform('codex').capabilities, [key]: {state: 'off'}}}]);
    const registry = installer.createInstallerRegistry({runtime, descriptors: [{...installer.DEFAULT_INSTALLER_REGISTRY.getPlatform('codex'), runtime: runtime.getPlatform('codex')}]});
    assert.deepEqual(api.platformAvailability('codex', {status: ok, catalog: ready, usage, registry}), blocked('capability_not_verified'));
    if (key === 'compositeRole') assert.deepEqual(api.platformAvailability('codex', {status: ok, catalog: ready, usage: 'host', registry}), available);
    if (key === 'compositeHost') assert.deepEqual(api.platformAvailability('codex', {status: ok, catalog: ready, usage: 'role', registry}), available);
  }
});

function versionRegistry(range) {
  const runtime = createPlatformRegistry([{...getPlatform('codex'), cli: {command: 'codex', supportedVersions: range}}]);
  return installer.createInstallerRegistry({runtime, descriptors: [{...installer.DEFAULT_INSTALLER_REGISTRY.getPlatform('codex'), runtime: runtime.getPlatform('codex')}]});
}

test('supportedVersions gates role and host before auth and catalog, while null is unrestricted', () => {
  assert.equal(typeof api.platformAvailability, 'function');
  for (const [range, version, passes] of [
    ['>=1.2.0 <2.0.0', '1.2.0', true], ['>=1.2.0 <2.0.0', '2.0.0', false],
    ['^1.2.3', '1.9.0', true], ['^1.2.3', '2.0.0', false],
    ['^0.2.3', '0.3.0', false], ['~1.2.3', '1.3.0', false],
    ['1.2.x', '1.2.9', true], ['1.2.x', '1.3.0', false],
    ['1.2.3 || >=3.0.0', '3.1.0', true], ['1.2.3', '1.2.4', false],
    ['1.2.3 - 2.0.0', '2.0.0', true], ['>=1.0.0', '2.0.0-beta.1', false],
    ['>=2.0.0-beta.1 <2.0.0', '2.0.0-beta.2', true],
    ['>=1.0.0', null, false], [null, null, true],
  ]) {
    const registry = versionRegistry(range), status = {...ok, cliVersion: {version}};
    for (const usage of ['role', 'host']) assert.deepEqual(api.platformAvailability('codex', {status, catalog: ready, usage, registry}), passes ? available : blocked('unsupported_version'), `${range}: ${version}`);
    assert.deepEqual(api.platformAvailability('codex', {status, catalog: ready, usage: 'standalone', registry}), available);
  }
  const registry = versionRegistry('>=2.0.0');
  assert.deepEqual(api.platformAvailability('codex', {status: {cliVersion: {version: '1.0.0'}, authentication: {authStatus: 'unauthorized'}}, catalog: {status: 'unavailable'}, usage: 'role', registry}), blocked('unsupported_version'));
  assert.deepEqual(api.platformAvailability('codex', {status: {authentication: {reason: 'cli_not_found'}}, usage: 'role', registry}), blocked('not_installed'));
});

test('reasonDetail includes fixed reason text and available diagnostic messages', () => {
  assert.equal(typeof api.reasonDetail, 'function');
  assert.equal(api.reasonDetail('codex', available, ok), '');
  const detail = api.reasonDetail('codex', blocked('auth_check_failed'), {authentication: {reason: 'timeout'}, diagnostics: [new Error('Probe timed out')]});
  assert.match(detail, /auth check failed/);
  assert.match(detail, /timeout/);
  assert.match(detail, /Probe timed out/);
});
