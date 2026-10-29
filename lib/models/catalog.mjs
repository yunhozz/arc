import { effortField, validateRoles, ModelValidationError } from './config.mjs';
import { discoverAnthropicCatalog } from './catalog-anthropic.mjs';
export { discoverAnthropicCatalog } from './catalog-anthropic.mjs';
export { listCodexModelCapabilities } from './codex-catalog.mjs';

const unavailable = (code, message) => ({ status: 'unavailable', code, message });
const validText = value => typeof value === 'string' && value.length > 0 && value === value.trim() && !/[\p{Cc}\u2028\u2029]/u.test(value);

function codexCatalog(models, secrets) {
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
  return { platform: 'codex', pairs, unavailable: missing.filter(item => !supportedModels.has(item.model)) };
}

export async function discoverModelCatalog({ platform, env = process.env, fetchImpl = globalThis.fetch, listCodexModels, signal, timeoutMs = 10000 } = {}) {
  if (!['codex', 'claude'].includes(platform)) return unavailable('unsupported_platform', 'Catalog is unavailable.');
  if (signal?.aborted) return unavailable('aborted', 'Catalog lookup was cancelled.');
  if (platform === 'codex' && typeof listCodexModels !== 'function') return unavailable('unavailable', 'Codex catalog is unavailable.');
  const controller = new AbortController(); let timedOut = false, resolveAbort;
  const abortPromise = new Promise(resolve => { resolveAbort = resolve; });
  const onAbort = () => { controller.abort(); resolveAbort(); };
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => { timedOut = true; onAbort(); }, Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10000);
  const operation = Promise.resolve().then(async () => platform === 'codex'
    ? { status: 'ready', catalog: codexCatalog(await listCodexModels({ env, signal: controller.signal }), [env?.OPENAI_API_KEY, env?.ANTHROPIC_API_KEY].filter(value => typeof value === 'string' && value.length)) }
    : discoverAnthropicCatalog({ apiKey: env?.ANTHROPIC_API_KEY, fetchImpl, signal: controller.signal }));
  const settled = operation.then(value => ({ value }), () => ({ failed: true }));
  try {
    const first = await Promise.race([settled, abortPromise.then(() => ({ aborted: true }))]);
    if (first.aborted) {
      if (platform === 'codex') {
        let graceTimer;
        await Promise.race([settled, new Promise(resolve => { graceTimer = setTimeout(resolve, 2100); })]);
        clearTimeout(graceTimer);
      }
      return timedOut ? unavailable('timeout', 'Catalog lookup timed out.') : unavailable('aborted', 'Catalog lookup was cancelled.');
    }
    return first.failed ? unavailable('unavailable', 'Catalog is unavailable.') : first.value;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
}

export function assertCatalogRoles({ platform, roles, catalog } = {}) {
  const validRoles = validateRoles(roles, platform);
  if (!catalog || catalog.platform !== platform || !Array.isArray(catalog.pairs)) throw new ModelValidationError('Catalog is unavailable.');
  const pairs = new Set();
  for (const pair of catalog.pairs) {
    if (!pair || !validText(pair.model) || !validText(pair.effort)) throw new ModelValidationError('Catalog is invalid.');
    pairs.add(JSON.stringify([pair.model, pair.effort]));
  }
  const effort = effortField(platform);
  if (Object.values(validRoles).some(value => !pairs.has(JSON.stringify([value.model, value[effort]])))) throw new ModelValidationError('Roles contain a pair absent from the catalog.');
}
