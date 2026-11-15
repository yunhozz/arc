import {DEFAULT_PLATFORM_REGISTRY} from '../runtime/platform-registry.mjs';
import {CODEX_INSTALLER} from './codex.mjs';
import {CLAUDE_INSTALLER} from './claude.mjs';

export function createInstallerRegistry({runtime, descriptors}) {
  const ids = runtime.platformIds();
  if (descriptors.length !== ids.length || descriptors.some((descriptor, index) => descriptor.runtime !== runtime.getPlatform(ids[index]))) throw Error('Installer platforms must match runtime ids, order and descriptor references');
  const platforms = Object.freeze(descriptors.map(descriptor => Object.freeze({...descriptor})));
  const byId = new Map(platforms.map(descriptor => [descriptor.runtime.id, descriptor]));
  const displayOrder = Object.freeze(runtime.byDisplayOrder().map(descriptor => byId.get(descriptor.id)));
  return Object.freeze({
    platforms,
    platformIds: () => ids,
    getPlatform: id => byId.get(id) ?? null,
    byDisplayOrder: () => displayOrder,
    byAnchorOrder: () => platforms,
    isPlatformId: value => byId.has(value),
  });
}

export const DEFAULT_INSTALLER_REGISTRY = createInstallerRegistry({runtime: DEFAULT_PLATFORM_REGISTRY, descriptors: [CODEX_INSTALLER, CLAUDE_INSTALLER]});
export const installerRegistryOf = context => context?.platforms ?? DEFAULT_INSTALLER_REGISTRY;
export const platformLabel = (id, registry = DEFAULT_INSTALLER_REGISTRY) => registry.getPlatform(id)?.runtime.label ?? id;
export const sortByDisplay = (ids, registry = DEFAULT_INSTALLER_REGISTRY) => [...ids].sort((a, b) => registry.getPlatform(a).runtime.displayOrder - registry.getPlatform(b).runtime.displayOrder);
export const sortByAnchor = (ids, registry = DEFAULT_INSTALLER_REGISTRY) => [...ids].sort((a, b) => registry.getPlatform(a).runtime.anchorOrder - registry.getPlatform(b).runtime.anchorOrder);
export const mixedLabel = (ids, registry = DEFAULT_INSTALLER_REGISTRY) => `Mixed (${sortByDisplay(ids, registry).map(id => platformLabel(id, registry)).join(' + ')})`;
