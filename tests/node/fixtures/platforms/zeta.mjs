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
  capabilities: {},
};

export function createTestRuntimeRegistry(ids = ['codex', 'claude', 'zeta']) {
  return createPlatformRegistry(ids.map(id => {
    const descriptor = id === 'zeta' ? ZETA_RUNTIME : id === 'eta' ? ETA_RUNTIME : getPlatform(id);
    if (!descriptor) throw Error(`Unknown test platform: ${id}`);
    return descriptor;
  }));
}
