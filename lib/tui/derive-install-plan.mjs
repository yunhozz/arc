import {installerRegistryOf, mixedLabel, platformLabel, sortByAnchor} from '../platforms/index.mjs';

export function deriveInstallPlan({roles, hosts, current, registry = installerRegistryOf()}) {
  const platforms = sortByAnchor([...new Set([...Object.values(roles).map(role => role.platform), ...hosts])], registry);
  const anchor = platforms[0];
  const previous = sortByAnchor([...new Set(current.platforms ?? [])], registry);
  const removed = previous.filter(id => !platforms.includes(id));
  const added = platforms.filter(id => !previous.includes(id));
  const same = removed.length === 0 && added.length === 0;
  const rule = current.mode === 'unverified' ? 'D1-f'
    : platforms.length === 1 ? (current.mode === 'composite' ? 'D1-b' : 'D1-a')
      : current.mode !== 'composite' ? 'D1-c' : same ? 'D1-d' : 'D1-e';
  return {
    rule, platforms, anchor, previous, removed, added,
    anchorMove: rule === 'D1-e' && previous[0] !== anchor,
    modeLabel: rule === 'D1-f' ? 'Unverified'
      : platforms.length === 1 ? platformLabel(anchor, registry) : mixedLabel(platforms, registry),
  };
}
