const API = 'https://api.anthropic.com/v1/models';
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const unavailable = (code, message) => ({ status: 'unavailable', code, message });

export async function discoverAnthropicCatalog({ apiKey, fetchImpl = globalThis.fetch, signal } = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey)) return unavailable('missing_api_key', 'Anthropic API key is unavailable.');
  if (typeof fetchImpl !== 'function') return unavailable('unavailable', 'Anthropic catalog is unavailable.');
  const pairs = [], unavailableModels = [], seenPairs = new Set(), seenModels = new Set(), supportedModels = new Set(), cursors = new Set();
  let cursor;
  try {
    for (let pageNumber = 0; pageNumber < 1000; pageNumber++) {
      if (signal?.aborted) return unavailable('aborted', 'Catalog lookup was cancelled.');
      const url = new URL(API);
      if (cursor) url.searchParams.set('after_id', cursor);
      const response = await fetchImpl(url, {
        method: 'GET', redirect: 'manual', signal,
        headers: { 'anthropic-version': '2026-10-21', Authorization: `Bearer ${apiKey}` },
      });
      if (!response?.ok) return unavailable('http_error', 'Anthropic catalog is unavailable.');
      if (response.url) {
        const actual = new URL(response.url);
        if (actual.origin !== url.origin || actual.pathname !== url.pathname) return unavailable('http_error', 'Anthropic catalog is unavailable.');
      }
      const page = await response.json();
      if (!page || !Array.isArray(page.data) || !page.data.length || typeof page.has_more !== 'boolean') throw Error('invalid page');
      for (const model of page.data) {
        if (!model || typeof model.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/@+\-]*$/.test(model.id) || model.id.includes(apiKey)) throw Error('invalid model');
        const capability = model.capabilities?.effort;
        const supported = capability?.supported === true ? EFFORTS.filter(effort => capability[effort]?.supported === true) : [];
        if (!supported.length && !seenModels.has(model.id)) unavailableModels.push({ model: model.id, reason: 'Effort capability is unavailable.' });
        seenModels.add(model.id);
        for (const effort of supported) {
          supportedModels.add(model.id);
          const key = JSON.stringify([model.id, effort]);
          if (!seenPairs.has(key)) { seenPairs.add(key); pairs.push({ model: model.id, effort }); }
        }
      }
      if (!page.has_more) return { status: 'ready', catalog: { platform: 'claude', pairs, unavailable: unavailableModels.filter(item => !supportedModels.has(item.model)) } };
      if (typeof page.last_id !== 'string' || !page.last_id || page.last_id !== page.data.at(-1).id || cursors.has(page.last_id)) throw Error('invalid cursor');
      cursor = page.last_id; cursors.add(cursor);
    }
    throw Error('too many pages');
  } catch {
    return signal?.aborted ? unavailable('aborted', 'Catalog lookup was cancelled.') : unavailable('invalid_response', 'Anthropic catalog is unavailable.');
  }
}
