export const GEMINI_MODELS_API = 'https://generativelanguage.googleapis.com/v1beta/models';
const unavailable = (code, message) => ({status: 'unavailable', code, message});

export function selectGeminiCatalogModels(ids) {
  return [...new Set(ids.filter(id => typeof id === 'string' && id === id.trim() && /^gemini-(\d+(?:\.\d+)?)-(pro|flash|flash-lite)$/.test(id)))];
}

export async function discoverGeminiCatalog({apiKey, fetchImpl = globalThis.fetch, signal} = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey)) return unavailable('missing_api_key', 'Gemini API key is unavailable.');
  if (typeof fetchImpl !== 'function') return unavailable('unavailable', 'Gemini catalog is unavailable.');
  const ids = [], tokens = new Set();
  let token;
  try {
    for (let pageNumber = 0; pageNumber < 1000; pageNumber++) {
      if (signal?.aborted) return unavailable('aborted', 'Catalog lookup was cancelled.');
      const url = new URL(GEMINI_MODELS_API);
      url.searchParams.set('pageSize', '1000');
      if (token) url.searchParams.set('pageToken', token);
      const response = await fetchImpl(url, {
        method: 'GET', redirect: 'manual', signal,
        headers: {'x-goog-api-key': apiKey},
      });
      if (!response?.ok || response.redirected === true) return unavailable('http_error', 'Gemini catalog is unavailable.');
      if (response.url) {
        const actual = new URL(response.url);
        if (actual.origin !== url.origin || actual.pathname !== url.pathname) return unavailable('http_error', 'Gemini catalog is unavailable.');
      }
      const page = await response.json();
      if (!page || !Array.isArray(page.models)) throw Error('invalid page');
      for (const model of page.models) {
        if (!model || typeof model.name !== 'string' || !model.name.startsWith('models/')) throw Error('invalid model');
        const id = model.name.slice('models/'.length);
        if (id !== id.trim() || !/^[A-Za-z0-9][A-Za-z0-9._:/@+\-]*$/.test(id) || id.includes(apiKey)) throw Error('invalid model');
        if (Array.isArray(model.supportedGenerationMethods) && model.supportedGenerationMethods.includes('generateContent')) ids.push(id);
      }
      if (page.nextPageToken === undefined || page.nextPageToken === '') {
        const pairs = selectGeminiCatalogModels(ids).map(model => ({model, effort: 'default'}));
        if (!pairs.length) throw Error('empty catalog');
        return {status: 'ready', catalog: {platform: 'gemini', pairs, unavailable: []}};
      }
      if (typeof page.nextPageToken !== 'string' || tokens.has(page.nextPageToken) || page.nextPageToken.includes(apiKey)) throw Error('invalid token');
      token = page.nextPageToken; tokens.add(token);
    }
    throw Error('too many pages');
  } catch {
    return signal?.aborted ? unavailable('aborted', 'Catalog lookup was cancelled.') : unavailable('invalid_response', 'Gemini catalog is unavailable.');
  }
}
