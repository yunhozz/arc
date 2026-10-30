import test from 'node:test';
import assert from 'node:assert/strict';
import { claudePages, codexPages, fakeCodex } from './fixtures/model-catalog.mjs';

const anthropic = await import('../../lib/models/catalog-anthropic.mjs').catch(() => ({}));
const codex = await import('../../lib/models/codex-catalog.mjs').catch(() => ({}));
const api = await import('../../lib/models/catalog.mjs').catch(() => ({}));
const response = (body, extra = {}) => ({ ok: true, status: 200, json: async () => structuredClone(body), ...extra });

test('Claude catalog returns only supported model effort pairs across pages', async () => {
  assert.equal(typeof anthropic.discoverAnthropicCatalog, 'function');
  const requests = [];
  const result = await anthropic.discoverAnthropicCatalog({ apiKey: 'test-secret', fetchImpl: async (url, options) => {
    requests.push({ url: String(url), options });
    return { ok: true, status: 200, json: async () => structuredClone(claudePages[requests.length - 1]) };
  } });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.catalog.pairs, [
    { model: 'claude-a', effort: 'low' }, { model: 'claude-a', effort: 'high' },
    { model: 'claude-b', effort: 'medium' }, { model: 'claude-b', effort: 'xhigh' }, { model: 'claude-b', effort: 'max' },
  ]);
  assert.deepEqual(result.catalog.unavailable, []);
  assert.equal(requests.length, 2);
  assert.equal(new URL(requests[0].url).origin, 'https://api.anthropic.com');
  assert.equal(new URL(requests[1].url).searchParams.get('after_id'), 'claude-a');
  assert.equal(requests[0].options.redirect, 'manual');
  assert.equal(requests[0].options.headers['anthropic-version'], '2026-10-21');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer test-secret');
});

test('Claude missing API key returns unavailable without sending a request', async () => {
  assert.equal(typeof anthropic.discoverAnthropicCatalog, 'function');
  let calls = 0;
  const result = await anthropic.discoverAnthropicCatalog({ apiKey: '', fetchImpl: async () => { calls++; } });
  assert.equal(result.status, 'unavailable'); assert.equal(calls, 0);
});

test('Claude reports unsupported or missing capability without inventing effort pairs', async () => {
  assert.equal(typeof anthropic.discoverAnthropicCatalog, 'function');
  const page = structuredClone(claudePages[1]);
  page.data.push({ ...structuredClone(page.data[0]), id: 'claude-unknown', capabilities: null });
  page.data[0].capabilities.effort.ultra = { supported: true };
  const result = await anthropic.discoverAnthropicCatalog({ apiKey: 'key', fetchImpl: async () => response(page) });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.catalog.pairs, [{ model: 'claude-b', effort: 'medium' }, { model: 'claude-b', effort: 'xhigh' }, { model: 'claude-b', effort: 'max' }]);
  assert.deepEqual(result.catalog.unavailable.map(item => item.model), ['claude-unknown']);
});

test('Claude de-duplicates a model when a later page confirms its capability', async () => {
  assert.equal(typeof anthropic.discoverAnthropicCatalog, 'function');
  const first = structuredClone(claudePages[0]), second = structuredClone(claudePages[1]);
  first.data[0].capabilities = null; second.data[0].id = 'claude-a'; second.first_id = second.last_id = 'claude-a';
  let calls = 0;
  const result = await anthropic.discoverAnthropicCatalog({ apiKey: 'key', fetchImpl: async () => response([first, second][calls++]) });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.catalog.pairs, [{ model: 'claude-a', effort: 'medium' }, { model: 'claude-a', effort: 'xhigh' }, { model: 'claude-a', effort: 'max' }]);
  assert.deepEqual(result.catalog.unavailable, []);
});

test('Claude rejects HTTP failures, malformed pages, repeated cursor, redirects and redacts secrets', async () => {
  assert.equal(typeof anthropic.discoverAnthropicCatalog, 'function');
  const secret = 'sensitive-token';
  for (const status of [401, 403, 429, 500]) {
    const result = await anthropic.discoverAnthropicCatalog({ apiKey: secret, fetchImpl: async () => response({}, { ok: false, status, json: async () => { throw Error(secret); } }) });
    assert.equal(result.status, 'unavailable'); assert.doesNotMatch(JSON.stringify(result), /sensitive-token/);
  }
  let calls = 0;
  const redirect = await anthropic.discoverAnthropicCatalog({ apiKey: secret, fetchImpl: async () => { calls++; return response({}, { ok: false, status: 302, url: 'https://attacker.invalid/v1/models' }); } });
  assert.equal(redirect.status, 'unavailable'); assert.equal(calls, 1); assert.doesNotMatch(JSON.stringify(redirect), /sensitive-token|attacker/);
  const repeated = await anthropic.discoverAnthropicCatalog({ apiKey: secret, fetchImpl: async () => response(claudePages[0]) });
  assert.equal(repeated.status, 'unavailable');
  for (const fetchImpl of [async () => response({ data: [], has_more: true, last_id: null }), async () => response({}, { json: async () => { throw Error(secret); } }), async () => { throw Error(secret); }]) {
    const result = await anthropic.discoverAnthropicCatalog({ apiKey: secret, fetchImpl });
    assert.equal(result.status, 'unavailable'); assert.doesNotMatch(JSON.stringify(result), /sensitive-token/);
  }
});

test('catalog candidates never expose supplied API keys', async () => {
  assert.equal(typeof anthropic.discoverAnthropicCatalog, 'function');
  assert.equal(typeof codex.listCodexModelCapabilities, 'function');
  assert.equal(typeof api.discoverModelCatalog, 'function');
  const secret = 'sensitive-token';
  const claudePage = structuredClone(claudePages[1]); claudePage.data[0].id = secret;
  const claudeResult = await anthropic.discoverAnthropicCatalog({ apiKey: secret, fetchImpl: async () => response(claudePage) });
  assert.equal(claudeResult.status, 'unavailable'); assert.doesNotMatch(JSON.stringify(claudeResult), /sensitive-token/);
  const page = structuredClone(codexPages[1]); page.data[0].model = secret;
  const fake = fakeCodex({ pages: [page] });
  await assert.rejects(codex.listCodexModelCapabilities({ cwd: '/safe/projectless', env: { OPENAI_API_KEY: secret }, spawnImpl: () => fake.child }), error => !String(error).includes(secret));
  const result = await api.discoverModelCatalog({ platform: 'codex', env: { OPENAI_API_KEY: secret }, listCodexModels: async () => [{ model: secret, efforts: ['high'] }] });
  assert.equal(result.status, 'unavailable'); assert.doesNotMatch(JSON.stringify(result), /sensitive-token/);
});

test('Codex child uses explicit cwd and exact model descriptors across pages', async () => {
  assert.equal(typeof codex.listCodexModelCapabilities, 'function');
  const fake = fakeCodex(); let spawnCall;
  const result = await codex.listCodexModelCapabilities({ cwd: '/safe/projectless', env: { PATH: '/bin', HOME: '/home/user', CODEX_HOME: '/home/user/codex', OPENAI_API_KEY: 'secret', ANTHROPIC_API_KEY: 'secret' }, spawnImpl: (...args) => { spawnCall = args; return fake.child; } });
  assert.deepEqual(result, [{ model: 'exec-a', efforts: ['low', 'high'] }, { model: 'exec-b', efforts: ['medium'] }]);
  assert.equal(spawnCall[0], 'codex'); assert.deepEqual(spawnCall[1], ['app-server']);
  assert.equal(spawnCall[2].cwd, '/safe/projectless'); assert.equal(spawnCall[2].env.CODEX_HOME, '/home/user/codex');
  assert.equal(spawnCall[2].env.OPENAI_API_KEY, undefined); assert.equal(spawnCall[2].env.ANTHROPIC_API_KEY, undefined);
  assert.deepEqual(fake.messages.map(item => item.method), ['initialize', 'initialized', 'model/list', 'model/list']);
  assert.equal(fake.messages[2].params.includeHidden, true);
  assert.equal(fake.messages[3].params.cursor, 'page-2');
});

test('Codex rejects an unmatched response ID and hides child error details', async () => {
  assert.equal(typeof codex.listCodexModelCapabilities, 'function');
  const wrongId = fakeCodex({ responseIdOffset: 9 });
  await assert.rejects(codex.listCodexModelCapabilities({ cwd: '/safe/projectless', env: {}, spawnImpl: () => wrongId.child }));
  const failed = fakeCodex({ hang: true });
  const pending = codex.listCodexModelCapabilities({ cwd: '/safe/projectless', env: {}, spawnImpl: () => failed.child });
  setImmediate(() => failed.child.emit('error', Error('secret-child-error')));
  await assert.rejects(pending, error => !String(error).includes('secret-child-error'));
});

test('Codex rejects a repeated cursor and cleans up its child', async () => {
  assert.equal(typeof codex.listCodexModelCapabilities, 'function');
  const fake = fakeCodex({ pages: [codexPages[0], codexPages[0]] });
  await assert.rejects(codex.listCodexModelCapabilities({ cwd: '/safe/projectless', env: { PATH: '/bin' }, spawnImpl: () => fake.child }));
  assert.equal(fake.child.stdin.writableEnded, true);
});

test('Codex abort closes the child without exposing stderr', async () => {
  assert.equal(typeof codex.listCodexModelCapabilities, 'function');
  const fake = fakeCodex({ hang: true }); const controller = new AbortController();
  fake.child.stderr.write('secret-stderr');
  const pending = codex.listCodexModelCapabilities({ cwd: '/safe/projectless', env: { PATH: '/bin' }, spawnImpl: () => fake.child, signal: controller.signal });
  setTimeout(() => controller.abort(), 5);
  await assert.rejects(pending, error => !String(error).includes('secret-stderr'));
  assert.equal(fake.child.stdin.writableEnded, true);
});

test('Codex rejects a malformed initialization response before requesting models', async () => {
  assert.equal(typeof codex.listCodexModelCapabilities, 'function');
  const fake = fakeCodex({ initializeResult: null });
  await assert.rejects(codex.listCodexModelCapabilities({ cwd: '/safe/projectless', env: { PATH: '/bin' }, spawnImpl: () => fake.child }));
  assert.deepEqual(fake.messages.map(message => message.method), ['initialize']);
  assert.equal(fake.child.stdin.writableEnded, true);
});

test('Codex honors abort that occurs during child creation', async () => {
  assert.equal(typeof codex.listCodexModelCapabilities, 'function');
  const fake = fakeCodex({ hang: true }), controller = new AbortController();
  const pending = codex.listCodexModelCapabilities({ cwd: '/safe/projectless', env: { PATH: '/bin' }, signal: controller.signal, timeoutMs: 200, spawnImpl: () => { controller.abort(); return fake.child; } });
  const finished = await Promise.race([pending.then(() => 'unexpected', () => 'aborted'), new Promise(resolve => setTimeout(() => resolve('late'), 40))]);
  assert.equal(finished, 'aborted'); assert.equal(fake.child.stdin.writableEnded, true);
});

test('Codex rejects when abort arrives with the final response', async () => {
  assert.equal(typeof codex.listCodexModelCapabilities, 'function');
  const controller = new AbortController();
  const fake = fakeCodex({ pages: [codexPages[1]], afterModelReply: () => controller.abort() });
  await assert.rejects(codex.listCodexModelCapabilities({ cwd: '/safe/projectless', env: {}, signal: controller.signal, spawnImpl: () => fake.child }));
  assert.equal(fake.child.stdin.writableEnded, true);
});

test('Codex honors abort while waiting for child cleanup', async () => {
  assert.equal(typeof codex.listCodexModelCapabilities, 'function');
  const controller = new AbortController();
  const fake = fakeCodex({ pages: [codexPages[1]], closeOnEnd: false, closeOnKill: false, afterModelReply: () => {
    setTimeout(() => controller.abort(), 5); setTimeout(() => fake.child.emit('close', 0, null), 20);
  } });
  await assert.rejects(codex.listCodexModelCapabilities({ cwd: '/safe/projectless', env: {}, signal: controller.signal, spawnImpl: () => fake.child }));
});

test('Codex hides executable errors and handles early child exit', async () => {
  assert.equal(typeof codex.listCodexModelCapabilities, 'function');
  await assert.rejects(codex.listCodexModelCapabilities({ cwd: '/safe/projectless', env: {}, spawnImpl: () => { throw Error('secret-start'); } }), error => !String(error).includes('secret-start'));
  const fake = fakeCodex({ hang: true });
  const pending = codex.listCodexModelCapabilities({ cwd: '/safe/projectless', env: {}, spawnImpl: () => fake.child });
  setImmediate(() => fake.child.emit('close', 1, null));
  await assert.rejects(pending);
});

test('Codex escalates to forced kill when termination does not close the child', async () => {
  assert.equal(typeof codex.listCodexModelCapabilities, 'function');
  const fake = fakeCodex({ hang: true, closeOnEnd: false, closeOnKill: signal => signal === 'SIGKILL' });
  await assert.rejects(codex.listCodexModelCapabilities({ cwd: '/safe/projectless', env: {}, timeoutMs: 5, spawnImpl: () => fake.child }));
  assert.deepEqual(fake.signals, ['SIGTERM', 'SIGKILL']);
});

test('Codex close failure returns safely even if the child later emits an error', async () => {
  assert.equal(typeof codex.listCodexModelCapabilities, 'function');
  const fake = fakeCodex({ hang: true, closeOnEnd: false, closeOnKill: false });
  await assert.rejects(codex.listCodexModelCapabilities({ cwd: '/safe/projectless', env: {}, timeoutMs: 5, spawnImpl: () => fake.child }));
  assert.deepEqual(fake.signals, ['SIGTERM', 'SIGKILL']);
  assert.doesNotThrow(() => fake.child.emit('error', Error('secret-late-error')));
});

test('Claude lookup deadline returns promptly even if fetch ignores abort', async () => {
  assert.equal(typeof api.discoverModelCatalog, 'function');
  const pending = api.discoverModelCatalog({ platform: 'claude', env: { ANTHROPIC_API_KEY: 'secret' }, timeoutMs: 10, fetchImpl: async () => new Promise(() => {}) });
  const result = await Promise.race([pending, new Promise(resolve => setTimeout(() => resolve('late'), 100))]);
  assert.notEqual(result, 'late'); assert.equal(result.status, 'unavailable'); assert.doesNotMatch(JSON.stringify(result), /secret/);
});

test('catalog routing uses injected Codex capabilities without HTTP or API key', async () => {
  assert.equal(typeof api.discoverModelCatalog, 'function');
  let calls = 0;
  const result = await api.discoverModelCatalog({ platform: 'codex', env: {}, fetchImpl: async () => { throw Error('unexpected HTTP'); }, listCodexModels: async () => { calls++; return [{ model: 'exec-a', efforts: ['low', 'high'] }]; } });
  assert.equal(calls, 1); assert.equal(result.status, 'ready');
  assert.deepEqual(result.catalog.pairs, [{ model: 'exec-a', effort: 'low' }, { model: 'exec-a', effort: 'high' }]);
});

test('Codex catalog de-duplicates a later confirmed model capability', async () => {
  assert.equal(typeof api.discoverModelCatalog, 'function');
  const result = await api.discoverModelCatalog({ platform: 'codex', env: {}, listCodexModels: async () => [{ model: 'exec-a', efforts: [] }, { model: 'exec-a', efforts: ['high'] }] });
  assert.equal(result.status, 'ready'); assert.deepEqual(result.catalog.pairs, [{ model: 'exec-a', effort: 'high' }]);
  assert.deepEqual(result.catalog.unavailable, []);
});

test('catalog rejects non-exact role pairs without mutating inputs', () => {
  assert.equal(typeof api.assertCatalogRoles, 'function');
  const roles = Object.fromEntries(['arc_scouter', 'arc_planner', 'arc_implementer', 'arc_qa', 'arc_reviewer'].map(role => [role, { model: 'exec-a', model_reasoning_effort: 'high' }]));
  const catalog = { platform: 'codex', pairs: [{ model: 'exec-a', effort: 'high' }], unavailable: [] }, before = structuredClone({ roles, catalog });
  assert.doesNotThrow(() => api.assertCatalogRoles({ platform: 'codex', roles, catalog }));
  roles.arc_scouter.model = 'exec';
  assert.throws(() => api.assertCatalogRoles({ platform: 'codex', roles, catalog }));
  roles.arc_scouter.model = 'exec-a'; assert.deepEqual({ roles, catalog }, before);
});
