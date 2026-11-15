import path from 'node:path';

export const CAPABILITY_KEYS = Object.freeze([
  'install', 'standalone', 'compositeRole', 'compositeHost', 'bridge',
  'nativeProfile', 'authProbe', 'catalog', 'watch',
]);

function frozenCopy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(frozenCopy));
  if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, frozenCopy(entry)])));
  return value;
}

export function createPlatformRegistry(descriptors) {
  const ids = new Set(), anchors = new Set(), displays = new Set();
  const platforms = Object.freeze(descriptors.map(descriptor => {
    const {id, anchorOrder, displayOrder} = descriptor;
    if (ids.has(id)) throw Error(`Duplicate platform id: ${id}`);
    if (anchors.has(anchorOrder)) throw Error(`Duplicate platform anchorOrder: ${anchorOrder}`);
    if (displays.has(displayOrder)) throw Error(`Duplicate platform displayOrder: ${displayOrder}`);
    ids.add(id); anchors.add(anchorOrder); displays.add(displayOrder);
    const capabilities = Object.fromEntries(CAPABILITY_KEYS.map(key => [key, descriptor.capabilities?.[key] ?? {state: 'off'}]));
    return frozenCopy({...descriptor, capabilities});
  }).sort((a, b) => a.anchorOrder - b.anchorOrder));
  const byId = new Map(platforms.map(platform => [platform.id, platform]));
  const platformIds = Object.freeze(platforms.map(platform => platform.id));
  const displayOrder = Object.freeze([...platforms].sort((a, b) => a.displayOrder - b.displayOrder));
  return Object.freeze({
    platforms,
    platformIds: () => platformIds,
    getPlatform: id => byId.get(id) ?? null,
    byDisplayOrder: () => displayOrder,
    byAnchorOrder: () => platforms,
    isPlatformId: value => byId.has(value),
  });
}

function resolveHome(platform, {userHome, env = {}, cwd} = {}) {
  if (typeof userHome !== 'string' || !path.isAbsolute(userHome) || !userHome.trim()) throw Error('userHome must be an absolute user directory');
  userHome = path.resolve(userHome);
  if (!env || typeof env !== 'object') throw Error('env must be an environment object');
  const expand = value => value === '~' ? userHome : value.startsWith('~/') ? path.join(userHome, value.slice(2)) : value;
  let home;
  if (platform === 'codex') {
    const raw = env.CODEX_HOME;
    if (raw !== undefined && (typeof raw !== 'string' || !raw.trim())) throw Error('CODEX_HOME is empty or invalid');
    const expanded = expand(raw ?? path.join(userHome, '.codex'));
    if (path.isAbsolute(expanded)) home = path.resolve(expanded);
    else { const base = cwd ?? process.cwd(); if (typeof base !== 'string' || !path.isAbsolute(base)) throw Error('cwd must be absolute for relative CODEX_HOME'); home = path.resolve(base, expanded); }
  } else {
    home = path.join(userHome, '.claude'); const raw = env.CLAUDE_CONFIG_DIR;
    if (raw !== undefined && (typeof raw !== 'string' || !raw.trim() || !path.isAbsolute(expand(raw)) || path.resolve(expand(raw)) !== home)) throw Error('CLAUDE_CONFIG_DIR must select the default ~/.claude directory');
  }
  if (home === '/' || home === userHome) throw Error('Target home must not be the filesystem or user-home root');
  return home;
}

const validText = value => typeof value === 'string' && value.length > 0 && value === value.trim() && !/[\p{Cc}\u2028\u2029]/u.test(value);
const verifiedCapabilities = Object.fromEntries(CAPABILITY_KEYS.map(key => [key, {state: 'verified'}]));

export const DEFAULT_PLATFORM_REGISTRY = createPlatformRegistry([
  {
    id: 'codex', label: 'Codex', displayOrder: 1, anchorOrder: 0,
    home: {env: 'CODEX_HOME', resolve: context => resolveHome('codex', context)},
    cli: {command: 'codex', supportedVersions: null},
    auth: {kind: 'codex-refresh'},
    profile: {
      ext: 'toml',
      standaloneName: role => role,
      routingName: role => `arc_routing_${role.slice(4)}`,
    },
    executionEnvironments: ['codex-cli', 'codex-desktop'],
    routing: {validatePair: (model, effort) => validText(model) && validText(effort)},
    capabilities: verifiedCapabilities,
  },
  {
    id: 'claude', label: 'Claude', displayOrder: 0, anchorOrder: 1,
    home: {env: 'CLAUDE_CONFIG_DIR', resolve: context => resolveHome('claude', context)},
    cli: {command: 'claude', supportedVersions: null},
    auth: {kind: 'cli-status-json'},
    profile: {
      ext: 'md',
      standaloneName: role => `arc-${role.slice(4)}`,
      routingName: role => `arc-routing-${role.slice(4)}`,
    },
    executionEnvironments: ['claude-cli', 'claude-desktop'],
    routing: {validatePair: (model, effort) => validText(model) && validText(effort) && /^[A-Za-z0-9][A-Za-z0-9._:/@+\-]*$/.test(model) && ['low', 'medium', 'high', 'xhigh', 'max'].includes(effort)},
    capabilities: verifiedCapabilities,
  },
]);

export const RUNTIME_PLATFORMS = DEFAULT_PLATFORM_REGISTRY.platforms;
export const {platformIds, getPlatform, byDisplayOrder, byAnchorOrder, isPlatformId} = DEFAULT_PLATFORM_REGISTRY;
export const runtimeRegistryOf = context => context?.runtimePlatforms ?? DEFAULT_PLATFORM_REGISTRY;
export const standaloneProfileFile = (descriptor, role) => `arc-${role.slice(4)}.${descriptor.profile.ext}`;
export const routingProfileFile = (descriptor, role) => `arc-routing-${role.slice(4)}.${descriptor.profile.ext}`;
