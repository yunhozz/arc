import { effortField, validateRoles, ModelValidationError } from './config.mjs';
import { discoverAnthropicCatalog } from './catalog-anthropic.mjs';
import { discoverGeminiCatalog } from './catalog-gemini.mjs';
import { listCodexModelCapabilities } from './codex-catalog.mjs';
import { installerRegistryOf } from '../platforms/index.mjs';
export { discoverAnthropicCatalog } from './catalog-anthropic.mjs';
export { discoverGeminiCatalog } from './catalog-gemini.mjs';
export { listCodexModelCapabilities } from './codex-catalog.mjs';

const unavailable = (code, message) => ({ status: 'unavailable', code, message });
const API_CATALOG_SOURCES = new Map([
  [discoverAnthropicCatalog, {env: 'ANTHROPIC_API_KEY', source: 'anthropic_api'}],
  [discoverGeminiCatalog, {env: 'GEMINI_API_KEY', source: 'gemini_api'}],
]);
const validText = value => typeof value === 'string' && value.length > 0 && value === value.trim() && !/[\p{Cc}\u2028\u2029]/u.test(value);

function codexCatalog(platform, models, secrets) {
  if (!Array.isArray(models) || !models.length) throw Error('invalid catalog');
  const pairs = [], missing = [], seenPairs = new Set(), seenModels = new Set(), supportedModels = new Set();
  for (const item of models) {
    if (!item || !validText(item.model) || secrets.some(secret => item.model.includes(secret)) || !Array.isArray(item.efforts) || !item.efforts.every(value => validText(value) && !secrets.some(secret => value.includes(secret)))) throw Error('invalid model');
    if (!item.efforts.length && !seenModels.has(item.model)) missing.push({ model: item.model, reason: 'Effort capability is unavailable.' });
    seenModels.add(item.model);
    for (const effort of item.efforts) {
      supportedModels.add(item.model);
      const key = JSON.stringify([item.model, effort]);
      if (!seenPairs.has(key)) { seenPairs.add(key); pairs.push({ model: item.model, effort }); }
    }
  }
  return { platform, pairs, unavailable: missing.filter(item => !supportedModels.has(item.model)) };
}

export async function discoverModelCatalog({ platform, platforms, env = process.env, fetchImpl = globalThis.fetch, listCodexModels, signal, timeoutMs = 10000 } = {}) {
  const descriptor = installerRegistryOf({platforms}).getPlatform(platform);
  if (!descriptor) return unavailable('unsupported_platform', 'Catalog is unavailable.');
  if (signal?.aborted) return unavailable('aborted', 'Catalog lookup was cancelled.');
  const usesCodexCapabilities = descriptor.models.discover === listCodexModelCapabilities;
  const discover = usesCodexCapabilities ? listCodexModels : descriptor.models.discover;
  if (typeof discover !== 'function') return unavailable('unavailable', `${descriptor.runtime.label} catalog is unavailable.`);
  if (descriptor.runtime.capabilities?.catalog?.state !== 'verified') return unavailable('capability_not_verified', `${descriptor.runtime.label} catalog is unavailable.`);
  const controller = new AbortController(); let timedOut = false, resolveAbort;
  const abortPromise = new Promise(resolve => { resolveAbort = resolve; });
  const onAbort = () => { controller.abort(); resolveAbort(); };
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => { timedOut = true; onAbort(); }, Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10000);
  const operation = Promise.resolve().then(async () => {
    if (usesCodexCapabilities) return { status: 'ready', catalog: codexCatalog(platform, await discover({ env, signal: controller.signal }), [env?.OPENAI_API_KEY, env?.ANTHROPIC_API_KEY].filter(value => typeof value === 'string' && value.length)) };
    const apiCatalog = API_CATALOG_SOURCES.get(discover);
    const result = await discover({ apiKey: env?.[apiCatalog?.env ?? 'ANTHROPIC_API_KEY'], fetchImpl, signal: controller.signal });
    return apiCatalog && result.status === 'ready' ? { ...result, catalog: { ...result.catalog, source: apiCatalog.source, cliAccountVerified: false } } : result;
  });
  const settled = operation.then(value => ({ value }), error => ({ failed: true, code: error?.code }));
  try {
    const first = await Promise.race([settled, abortPromise.then(() => ({ aborted: true }))]);
    if (first.aborted) {
      if (usesCodexCapabilities) {
        let graceTimer;
        await Promise.race([settled, new Promise(resolve => { graceTimer = setTimeout(resolve, 2100); })]);
        clearTimeout(graceTimer);
      }
      return timedOut ? unavailable('timeout', 'Catalog lookup timed out.') : unavailable('aborted', 'Catalog lookup was cancelled.');
    }
    return first.failed ? unavailable(['execution_error', 'protocol_error'].includes(first.code) ? first.code : 'unavailable', 'Catalog is unavailable.') : first.value;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
}

export function assertCatalogRoles({ platform, roles, catalog, runtimePlatforms } = {}) {
  const validRoles = validateRoles(roles, platform, {runtimePlatforms});
  if (!catalog || catalog.platform !== platform || !Array.isArray(catalog.pairs)) throw new ModelValidationError('Catalog is unavailable.');
  const pairs = new Set();
  for (const pair of catalog.pairs) {
    if (!pair || !validText(pair.model) || !validText(pair.effort)) throw new ModelValidationError('Catalog is invalid.');
    pairs.add(JSON.stringify([pair.model, pair.effort]));
  }
  const effort = effortField(platform, {runtimePlatforms});
  if (Object.values(validRoles).some(value => !pairs.has(JSON.stringify([value.model, value[effort]])))) throw new ModelValidationError('Roles contain a pair absent from the catalog.');
}
