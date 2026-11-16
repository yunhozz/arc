import fsp from 'node:fs/promises';
import path from 'node:path';
import {DEFAULT_PLATFORM_REGISTRY} from '../runtime/platform-registry.mjs';

const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const validHash = value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);

function validMarker(marker, platform, home) {
  return exact(marker, ['version', 'revision', 'platform', 'targetHome', 'activeConfigPath', 'configHash', 'runtime', 'profiles'])
    && marker.version === 1 && typeof marker.revision === 'string' && marker.revision.length > 0
    && marker.platform === platform && marker.targetHome === home && validHash(marker.configHash)
    && exact(marker.runtime, ['version', 'hash', 'policyHash'])
    && typeof marker.runtime.version === 'string' && marker.runtime.version.length > 0
    && validHash(marker.runtime.hash) && validHash(marker.runtime.policyHash)
    && marker.profiles && typeof marker.profiles === 'object' && !Array.isArray(marker.profiles)
    && typeof marker.activeConfigPath === 'string' && path.isAbsolute(marker.activeConfigPath)
    && path.normalize(marker.activeConfigPath) === marker.activeConfigPath
    && path.basename(marker.activeConfigPath) === 'arc-role-platform-routing.json';
}

/** Discover one registered anchor without locking or changing watched files. */
export async function resolveDispatchStore({homes, registry = DEFAULT_PLATFORM_REGISTRY,
  readMarker = file => fsp.readFile(file, 'utf8')}) {
  const platforms = registry.byAnchorOrder().filter(({id}) => typeof homes[id] === 'string' && path.isAbsolute(homes[id]));
  const registeredHomes = new Set(platforms.map(({id}) => path.resolve(homes[id]))), candidates = new Set();
  for (const {id} of platforms) {
    const home = homes[id];
    try {
      const marker = JSON.parse(await readMarker(path.join(home, 'arc-role-platform-routing.prepared.json')));
      if (!validMarker(marker, id, home)) continue;
      const candidate = path.dirname(marker.activeConfigPath);
      if (registeredHomes.has(candidate)) candidates.add(candidate);
    } catch { /* An unavailable or invalid marker does not disable session sources. */ }
  }
  if (candidates.size > 1) return {kind:'ambiguous'};
  if (candidates.size === 1) return {kind:'anchor', dir:path.join([...candidates][0], 'arc-role-dispatch')};
  if (platforms.some(({id}) => id === 'codex')) {
    const dir = path.join(homes.codex, 'arc-role-dispatch');
    try { if ((await fsp.stat(dir)).isDirectory()) return {kind:'legacy', dir}; }
    catch { /* An absent or unreadable legacy store is an empty source. */ }
  }
  return {kind:'none'};
}
