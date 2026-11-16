import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlatformRegistry, DEFAULT_PLATFORM_REGISTRY} from '../../lib/runtime/platform-registry.mjs';
import {createInstallerRegistry, DEFAULT_INSTALLER_REGISTRY} from '../../lib/platforms/index.mjs';
import * as catalog from '../../lib/models/catalog.mjs';

const {GEMINI_MODELS_API, selectGeminiCatalogModels, discoverGeminiCatalog} = await import('../../lib/models/catalog-gemini.mjs').catch(() => ({}));
const apiKey = 'gemini-test-secret';
const model = (id, supportedGenerationMethods = ['generateContent']) => ({name: `models/${id}`, supportedGenerationMethods});
const response = (body, extra = {}) => ({ok: true, status: 200, json: async () => structuredClone(body), ...extra});

function verifiedGeminiPlatforms(state = 'verified') {
  const runtime = createPlatformRegistry(DEFAULT_PLATFORM_REGISTRY.platforms.map(p => p.id === 'gemini' ? {...p, capabilities: {...p.capabilities, catalog: {state}, ...(state === 'off' ? {standalone: {state: 'off'}} : {})}} : p));
  return createInstallerRegistry({runtime, descriptors: runtime.platforms.map(p => ({...DEFAULT_INSTALLER_REGISTRY.getPlatform(p.id), runtime: p}))});
}

// Catch wrong request options, leaked credentials, filtering, paging and capability bypasses.
test('gemini discover sends key only in x-goog-api-key header', async () => {
  const requests = [];
  const result = await discoverGeminiCatalog({apiKey, fetchImpl: async (url, options) => {
    requests.push({url: String(url), options});
    return response({models: [model('gemini-2.5-flash')]}, {url: String(url)});
  }});
  assert.equal(GEMINI_MODELS_API, 'https://generativelanguage.googleapis.com/v1beta/models');
  assert.equal(requests.length, 1);
  const request = requests[0], url = new URL(request.url);
  assert.equal(url.origin + url.pathname, GEMINI_MODELS_API);
  assert.equal(request.url.includes(apiKey), false);
  assert.equal(url.searchParams.has('key'), false);
  assert.equal(url.searchParams.get('pageSize'), '1000');
  assert.equal(request.options.method, 'GET');
  assert.equal(request.options.redirect, 'manual');
  assert.deepEqual(request.options.headers, {'x-goog-api-key': apiKey});
  assert.equal(result.status, 'ready');
  assert.equal(result.catalog.platform, 'gemini');
  assert.equal(JSON.stringify(result).includes(apiKey), false);
});

test('gemini discover selects text family GA models only', async () => {
  const ids = ['gemini-2.5-flash', 'gemini-2.5-flash-preview-tts', 'gemini-flash-latest', 'gemini-2.5-flash-image',
    'gemini-3.1-pro-preview', 'gemini-3.1-pro-preview-customtools', 'gemini-3.1-flash-lite-preview',
    'gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-3.5-flash', 'gemma-4-31b-it', 'gemini-4-argon'];
  const result = await discoverGeminiCatalog({apiKey, fetchImpl: async () => response({models: [
    ...ids.map(id => model(id)), model('gemini-embedding-001', ['embedContent']), model('gemini-4-pro', ['embedContent']),
  ]})});
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.catalog.pairs, [
    {model: 'gemini-2.5-flash', effort: 'default'}, {model: 'gemini-3.1-flash-lite', effort: 'default'}, {model: 'gemini-3.5-flash', effort: 'default'},
  ]);
  assert.deepEqual(result.catalog.unavailable, []);
});

test('selectGeminiCatalogModels drops previews and dedupes', () => {
  assert.deepEqual(selectGeminiCatalogModels(['gemini-3.1-pro-preview', 'gemini-2.5-pro', 'gemini-2.5-pro']), ['gemini-2.5-pro']);
  assert.deepEqual(selectGeminiCatalogModels(['gemini-3-flash', 'gemini-2.5-pro', 'gemini-3-flash', 'gemini-3.1-flash-lite']),
    ['gemini-3-flash', 'gemini-2.5-pro', 'gemini-3.1-flash-lite']);
});

test('gemini discover follows nextPageToken and rejects repeated or invalid token', async () => {
  const requests = [], pages = [
    {models: [model('gemini-2.5-pro')], nextPageToken: 'page-2'},
    {models: [model('gemini-3.5-flash'), model('gemini-2.5-pro')], nextPageToken: ''},
  ];
  const result = await discoverGeminiCatalog({apiKey, fetchImpl: async url => {
    requests.push(new URL(url)); return response(pages[requests.length - 1]);
  }});
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.catalog.pairs, [{model: 'gemini-2.5-pro', effort: 'default'}, {model: 'gemini-3.5-flash', effort: 'default'}]);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].searchParams.has('pageToken'), false);
  assert.equal(requests[1].searchParams.get('pageToken'), 'page-2');
  assert.equal(requests[1].searchParams.get('pageSize'), '1000');
  for (const body of [
    {models: [model('gemini-2.5-flash')], nextPageToken: 'repeated'},
    {models: [model('gemini-2.5-flash')], nextPageToken: 5},
    {models: [model('gemini-2.5-flash')], nextPageToken: null},
    {models: [model('gemini-2.5-flash')], nextPageToken: apiKey}, {},
  ]) {
    let calls = 0;
    const invalid = await discoverGeminiCatalog({apiKey, fetchImpl: async () => {calls++; return response(body);}});
    assert.equal(invalid.code, 'invalid_response');
    assert.ok(calls <= 2);
    assert.equal(JSON.stringify(invalid).includes(apiKey), false);
  }
  let calls = 0;
  const endless = await discoverGeminiCatalog({apiKey, fetchImpl: async () => response({models: [], nextPageToken: `page-${++calls}`})});
  assert.equal(endless.code, 'invalid_response');
  assert.equal(calls, 1000);
  let emptyCalls = 0;
  const emptyFirst = await discoverGeminiCatalog({apiKey, fetchImpl: async () => response(++emptyCalls === 1
    ? {models: [], nextPageToken: 'page-2'} : {models: [model('gemini-2.5-flash')]})});
  assert.equal(emptyFirst.status, 'ready');
  assert.equal(emptyCalls, 2);
});

test('gemini discover rejects ids containing the key and malformed names', async () => {
  for (const name of [`models/gemini-${apiKey}`, 'gemini-2.5-flash', 'models/ bad', 'models/', 'models/gemini-2.5-flash\n', null]) {
    const result = await discoverGeminiCatalog({apiKey, fetchImpl: async () => response({models: [{name, supportedGenerationMethods: ['generateContent']}]})});
    assert.equal(result.code, 'invalid_response');
    assert.equal(JSON.stringify(result).includes(apiKey), false);
  }
});

test('gemini discover rejects non-ok and redirected responses', async () => {
  for (const extra of [
    {ok: false, status: 403}, {ok: false, status: 429}, {ok: false, status: 302},
    {ok: true, redirected: true, url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000'},
    {url: 'https://attacker.invalid/v1beta/models'}, {url: 'https://generativelanguage.googleapis.com/other'},
  ]) {
    let jsonCalls = 0;
    const result = await discoverGeminiCatalog({apiKey, fetchImpl: async () => response({}, {...extra, json: async () => {jsonCalls++; throw Error(apiKey);}})});
    assert.equal(result.code, 'http_error');
    assert.equal(jsonCalls, 0);
    assert.equal(JSON.stringify(result).includes(apiKey), false);
  }
});

test('gemini discover without usable key does not fetch', async () => {
  let calls = 0;
  for (const key of [undefined, '', '  ', 'a\nb', 'a\rb']) {
    const result = await discoverGeminiCatalog({apiKey: key, fetchImpl: async () => {calls++;}});
    assert.deepEqual(result, {status: 'unavailable', code: 'missing_api_key', message: 'Gemini API key is unavailable.'});
  }
  assert.equal(calls, 0);
});

test('gemini discover aborted signal returns aborted', async () => {
  const controller = new AbortController(); controller.abort();
  let calls = 0;
  const result = await discoverGeminiCatalog({apiKey, signal: controller.signal, fetchImpl: async () => {calls++;}});
  assert.equal(result.code, 'aborted');
  assert.equal(calls, 0);
  const duringFetch = new AbortController();
  const aborted = await discoverGeminiCatalog({apiKey, signal: duringFetch.signal, fetchImpl: async () => {duringFetch.abort(); throw Error(apiKey);}});
  assert.equal(aborted.code, 'aborted');
  assert.equal(JSON.stringify(aborted).includes(apiKey), false);
});

test('gemini discover with no selectable model is invalid_response', async () => {
  for (const models of [[], [model('gemini-3.1-pro-preview')], [model('gemini-2.5-flash', ['embedContent'])]]) {
    const result = await discoverGeminiCatalog({apiKey, fetchImpl: async () => response({models})});
    assert.deepEqual(result, {status: 'unavailable', code: 'invalid_response', message: 'Gemini catalog is unavailable.'});
  }
});

test('discoverModelCatalog gemini uses GEMINI_API_KEY and marks gemini_api', async () => {
  const anthropicKey = 'anthropic-test-secret', requests = [];
  const result = await catalog.discoverModelCatalog({platform: 'gemini', platforms: verifiedGeminiPlatforms(),
    env: {GEMINI_API_KEY: apiKey, ANTHROPIC_API_KEY: anthropicKey}, fetchImpl: async (url, options) => {
      requests.push({url: String(url), options});
      return response({models: [model('gemini-2.5-flash')]});
    }});
  assert.equal(catalog.discoverGeminiCatalog, discoverGeminiCatalog);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.headers['x-goog-api-key'], apiKey);
  assert.equal(JSON.stringify(requests).includes(anthropicKey), false);
  assert.deepEqual(result, {status: 'ready', catalog: {platform: 'gemini', pairs: [{model: 'gemini-2.5-flash', effort: 'default'}],
    unavailable: [], source: 'gemini_api', cliAccountVerified: false}});
  assert.equal(JSON.stringify(result).includes(apiKey), false);
  const missing = await catalog.discoverModelCatalog({platform: 'gemini', platforms: verifiedGeminiPlatforms(),
    env: {ANTHROPIC_API_KEY: anthropicKey}, fetchImpl: async () => assert.fail('No Gemini key must prevent fetch')});
  assert.equal(missing.code, 'missing_api_key');
});

test('discoverModelCatalog gemini catalog off returns capability_not_verified without fetch', async () => {
  let calls = 0;
  const result = await catalog.discoverModelCatalog({platform: 'gemini', platforms: verifiedGeminiPlatforms('off'), env: {GEMINI_API_KEY: apiKey}, fetchImpl: async () => {calls++;}});
  assert.deepEqual(result, {status: 'unavailable', code: 'capability_not_verified', message: 'Gemini catalog is unavailable.'});
  assert.equal(calls, 0);
});

test('gemini discover hides fetch and JSON errors and handles unavailable fetch', async () => {
  const unavailable = await discoverGeminiCatalog({apiKey, fetchImpl: null});
  assert.deepEqual(unavailable, {status: 'unavailable', code: 'unavailable', message: 'Gemini catalog is unavailable.'});
  for (const fetchImpl of [async () => {throw Error(apiKey);}, async () => response({}, {json: async () => {throw Error(apiKey);}})]) {
    const result = await discoverGeminiCatalog({apiKey, fetchImpl});
    assert.deepEqual(result, {status: 'unavailable', code: 'invalid_response', message: 'Gemini catalog is unavailable.'});
    assert.equal(JSON.stringify(result).includes(apiKey), false);
  }
});
