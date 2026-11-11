import { readFile } from 'node:fs/promises';
import { ROUTING_ROLES, validRoleValues } from '../runtime/role-routing-config.mjs';

const files = {
  codex: new URL('./codex-models.json', import.meta.url),
  claude: new URL('./claude-models.json', import.meta.url),
};
const pairKey = (model, effort) => JSON.stringify([model, effort]);
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

function validateCatalog(platform, catalog, { strict = true } = {}) {
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog) || (strict && !exact(catalog, ['platform', 'pairs'])) || catalog.platform !== platform || !Array.isArray(catalog.pairs) || !catalog.pairs.length) throw Error(`${platform} model catalog is invalid`);
  const pairs = new Set();
  for (const pair of catalog.pairs) {
    if (!exact(pair, ['model', 'effort']) || !validRoleValues(platform, pair.model, pair.effort)) throw Error(`${platform} model catalog is invalid`);
    const key = pairKey(pair.model, pair.effort);
    if (pairs.has(key)) throw Error(`${platform} model catalog is invalid`);
    pairs.add(key);
  }
  return pairs;
}

export async function loadStaticModelCatalog(platform, { signal } = {}) {
  if (!Object.hasOwn(files, platform)) return { status: 'unavailable', code: 'unsupported_platform', message: `${platform} model catalog is unavailable` };
  try {
    const catalog = JSON.parse(await readFile(files[platform], { encoding: 'utf8', signal }));
    validateCatalog(platform, catalog);
    return { status: 'ready', catalog };
  } catch {
    return { status: 'unavailable', code: signal?.aborted ? 'aborted' : 'unavailable', message: `${platform} model catalog is unavailable or invalid` };
  }
}

export function assertCompositeCatalogRoles({ roles, catalogs }) {
  const available = Object.fromEntries(['codex', 'claude'].map(platform => [platform, validateCatalog(platform, catalogs?.[platform], { strict: false })]));
  if (!exact(roles, ROUTING_ROLES)) throw Error('Invalid composite roles');
  for (const role of ROUTING_ROLES) {
    const value = roles[role];
    if (!exact(value, ['platform', 'model', 'effort']) || !validRoleValues(value.platform, value.model, value.effort)) throw Error(`Invalid role routing values for ${role}`);
    if (!available[value.platform].has(pairKey(value.model, value.effort))) throw Error(`${value.platform} model and effort are unavailable for ${role}`);
  }
}
