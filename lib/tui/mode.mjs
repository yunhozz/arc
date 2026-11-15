import {installerRegistryOf, mixedLabel} from '../platforms/index.mjs';

// Preserve the State vocabulary and authentication precedence of the home renderer.
function stateLabel(status) {
  if (status.state !== 'installed') return {absent: 'Not Available', incomplete: 'Incomplete'}[status.state] ?? status.state;
  if (status.authentication?.reason === 'cli_not_found') return 'Not Available';
  if (status.authentication?.authStatus === 'unauthorized') return 'Unauthorized';
  if (status.authentication?.authStatus === 'unknown') return 'Incomplete';
  return 'Available';
}

export function homeStatusLine(statuses, registry = installerRegistryOf()) {
  return registry.byDisplayOrder().flatMap(({runtime: {id, label}}) => {
    const status = statuses.find(status => status.platform === id);
    return status ? [`${label}: ${stateLabel(status)}`] : [];
  }).join(' / ');
}

export function homeModeLine(installState, statuses, registry = installerRegistryOf()) {
  if (installState.mode === 'unverified') return 'Unverified';
  if (installState.mode === 'composite') return mixedLabel(installState.platforms, registry);
  const labels = registry.byDisplayOrder()
    .filter(({runtime: {id}}) => statuses.some(status => status.platform === id && status.state === 'installed'))
    .map(({runtime: {label}}) => label);
  return labels.length ? labels.join(', ') : 'Not installed';
}
