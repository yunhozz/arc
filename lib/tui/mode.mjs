import {installerRegistryOf, mixedLabel} from '../platforms/index.mjs';
import {REASON_TEXT, supportedVersion} from '../platforms/availability.mjs';
import {cellWidth, escapeTerminalText} from './render.mjs';

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

export function statusInfo(installState, statuses, registry = installerRegistryOf()) {
  const platforms = registry.byDisplayOrder().flatMap(({runtime}) => {
    const status = statuses.find(status => status.platform === runtime.id);
    return status ? [{runtime, status, state: stateLabel(status, runtime)}] : [];
  });
  const width = text => [...escapeTerminalText(text)].reduce((sum, character) => sum + cellWidth(character), 0);
  const labelWidth = Math.max(width('Mode'), ...platforms.map(({runtime}) => width(runtime.label)));
  const row = (label, value) => label + ' '.repeat(labelWidth - width(label) + 3) + value;
  const info = [row('Mode', homeModeLine(installState, statuses, registry)), ''];
  const infoTones = [undefined, undefined], notes = new Map();
  const humanize = value => value.replace(/\b[a-z]+(?:_[a-z0-9]+)+\b/g, token => REASON_TEXT[token] ?? token.replaceAll('_', ' '));
  const diagnosticText = value => {
    const code = value.trim();
    return /^[a-z]+(?:_[a-z0-9]+)+$/.test(code) ? REASON_TEXT[code] ?? code.replaceAll('_', ' ') : value;
  };
  for (const {runtime, status, state} of platforms) {
    const value = state.replace(' (auth unverified)', ' · auth unverified');
    info.push(row(runtime.label, value));
    infoTones.push('platform-status');
    const repeated = new Set([state.toLowerCase(), ...(state.includes('auth unverified') ? ['auth unverified'] : []),
      ...(state === 'Not Available' ? ['not installed', 'cli not found'] : []),
      ...(state === 'Not verified' ? ['capability not verified'] : [])]);
    const authReason = status.authentication?.reason;
    const diagnostics = (status.diagnostics ?? []).map(error => error.message).filter(Boolean).map(diagnosticText);
    for (const reason of [...diagnostics, ...(authReason ? [humanize(authReason)] : [])]) {
      const message = reason.trim();
      if (!message || repeated.has(message.toLowerCase())) continue;
      if (!notes.has(message)) notes.set(message, new Set());
      notes.get(message).add(runtime.label);
    }
  }
  if (notes.size) {
    info.push('', 'Notes');
    infoTones.push(undefined, undefined);
    for (const [message, labels] of notes) {
      info.push(`• ${message} (${[...labels].join(', ')})`);
      infoTones.push('note');
    }
  }
  return {info, infoTones};
}
