import {createInstallerRegistry, DEFAULT_INSTALLER_REGISTRY} from '../../../../lib/platforms/index.mjs';
import {CLAUDE_INSTALLER} from '../../../../lib/platforms/claude.mjs';
import path from 'node:path';
import {CAPABILITY_KEYS, createPlatformRegistry, getPlatform} from '../../../../lib/runtime/platform-registry.mjs';

export const ZETA_RUNTIME = {
  id: 'zeta', label: 'Zeta', anchorOrder: 2, displayOrder: 2,
  home: {
    env: 'ZETA_HOME',
    resolve({userHome, env = {}}) {
      const home = env.ZETA_HOME ?? path.join(userHome, '.zeta');
      if (typeof home !== 'string' || !path.isAbsolute(home) || !home.trim()) throw Error('ZETA_HOME must be absolute');
      return path.resolve(home);
    },
  },
  cli: {command: 'zeta', supportedVersions: null},
  auth: {kind: 'none'},
  models: {effortField: 'effort'},
  profile: {
    ext: 'md',
    standaloneName: role => `arc-${role.slice(4)}`,
    routingName: role => `arc-routing-${role.slice(4)}`,
  },
  executionEnvironments: ['zeta-cli'],
  routing: {validatePair: (model, effort) => getPlatform('claude').routing.validatePair(model, effort)},
  capabilities: Object.fromEntries(CAPABILITY_KEYS.filter(key => key !== 'watch').map(key => [key, {state: 'verified'}])),
};

export const ETA_RUNTIME = {
  ...ZETA_RUNTIME, id: 'eta', label: 'Eta', anchorOrder: 3, displayOrder: 3,
  models: {effortField: 'effort'},
  capabilities: {},
};

export function createTestRuntimeRegistry(ids = ['codex', 'claude', 'zeta']) {
  return createPlatformRegistry(ids.map(id => {
    const descriptor = id === 'zeta' ? ZETA_RUNTIME : id === 'eta' ? ETA_RUNTIME : getPlatform(id);
    if (!descriptor) throw Error(`Unknown test platform: ${id}`);
    return descriptor;
  }));
}

export const ZETA_INSTALLER = {
  ...CLAUDE_INSTALLER, runtime: ZETA_RUNTIME,
  agentTemplates: {expectationsFrom: 'claude'},
  payloadPrefix: 'zeta', instructionFile: 'ZETA.md', runtimeConfigFile: 'settings.json',
  globalPaths: ['ZETA.md', 'settings.json'],
  models: {staticCatalog: new URL('./zeta-models.json', import.meta.url), effortField: ZETA_RUNTIME.models.effortField, discover: null},
};

export const ETA_INSTALLER = {
  ...ZETA_INSTALLER, runtime: ETA_RUNTIME, payloadPrefix: 'eta',
  models: {...ZETA_INSTALLER.models, effortField: ETA_RUNTIME.models.effortField},
};

export function createTestRegistries(ids = ['codex', 'claude', 'zeta']) {
  const runtimePlatforms = createTestRuntimeRegistry(ids);
  const platforms = createInstallerRegistry({runtime: runtimePlatforms, descriptors: runtimePlatforms.platformIds().map(id => ({
    ...(id === 'zeta' ? ZETA_INSTALLER : id === 'eta' ? ETA_INSTALLER : DEFAULT_INSTALLER_REGISTRY.getPlatform(id)),
    runtime: runtimePlatforms.getPlatform(id),
  }))});
  return {runtimePlatforms, platforms};
}
