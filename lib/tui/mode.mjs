import {installerRegistryOf, mixedLabel} from '../platforms/index.mjs';
import {supportedVersion} from '../platforms/availability.mjs';

// Preserve the State vocabulary and authentication precedence of the home renderer.
function stateLabel(status, runtime) {
  if (runtime.capabilities.install.state !== 'verified') return 'Not verified';
  if (runtime.auth.kind === 'none') {
    if (status.authentication?.reason === 'cli_not_found' || status.cliVersion?.reason === 'cli_not_found') return 'Not Available';
    if (!supportedVersion(status.cliVersion?.version, runtime.cli.supportedVersions)) return 'Unsupported version';
    return 'Available (auth unverified)';
  }
  if (status.state !== 'installed') return {absent: 'Not Available', incomplete: 'Incomplete'}[status.state] ?? status.state;
  if (status.authentication?.reason === 'cli_not_found') return 'Not Available';
  if (status.authentication?.authStatus === 'unauthorized') return 'Unauthorized';
  if (status.authentication?.authStatus === 'unknown') return 'Incomplete';
  return 'Available';
}

export function homeStatusLine(statuses, registry = installerRegistryOf()) {
  return registry.byDisplayOrder().flatMap(({runtime}) => {
    const {id, label} = runtime;
    const status = statuses.find(status => status.platform === id);
    return status ? [`${label}: ${stateLabel(status, runtime)}`] : [];
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
