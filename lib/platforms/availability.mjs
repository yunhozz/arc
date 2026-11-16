import {DEFAULT_INSTALLER_REGISTRY, platformLabel} from './index.mjs';

export const REASON_TEXT = Object.freeze({
  capability_not_verified: 'capability not verified',
  not_installed: 'not installed',
  unsupported_version: 'unsupported version',
  unauthorized: 'unauthorized',
  auth_check_failed: 'auth check failed',
  catalog_error: 'catalog error',
});

// Range evaluation stays local: the installer has no runtime package dependencies.
function versionParts(text, partial = false) {
  if (typeof text !== 'string') return null;
  const match = /^(?:v|=)?(0|[1-9]\d*|[xX*])(?:\.(0|[1-9]\d*|[xX*]))?(?:\.(0|[1-9]\d*|[xX*]))?(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(text);
  if (!match) return null;
  const numbers = match.slice(1, 4).map(value => value === undefined || /^[xX*]$/.test(value) ? null : Number(value));
  if (!partial && numbers.includes(null)) return null;
  if (numbers.some(value => value !== null && !Number.isSafeInteger(value))) return null;
  const pre = match[4]?.split('.') ?? [];
  if (pre.some(value => /^\d+$/.test(value) && value.length > 1 && value.startsWith('0'))) return null;
  return {numbers, pre};
}
function compare(a, b) {
  for (let i = 0; i < 3; i++) if (a.numbers[i] !== b.numbers[i]) return a.numbers[i] < b.numbers[i] ? -1 : 1;
  if (!a.pre.length || !b.pre.length) return a.pre.length === b.pre.length ? 0 : a.pre.length ? -1 : 1;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i], y = b.pre[i];
    if (x === y) continue;
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    const xn = /^\d+$/.test(x), yn = /^\d+$/.test(y);
    if (xn && yn) return BigInt(x) < BigInt(y) ? -1 : 1;
    if (xn !== yn) return xn ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}
const bound = numbers => ({numbers, pre: []});
function comparators(token) {
  const match = /^(>=|<=|>|<|=|\^|~)?(.*)$/.exec(token), op = match[1] ?? '=', value = versionParts(match[2], true);
  if (!value) return null;
  const missing = value.numbers.indexOf(null), low = {...value, numbers: value.numbers.map(n => n ?? 0)}, [major, minor, patch] = low.numbers;
  const next = missing === 0 ? null : bound(missing === 1 ? [major + 1, 0, 0] : [major, minor + 1, 0]);
  if (op === '^' || op === '~') {
    if (missing === 0) return [];
    const high = op === '~' ? (missing === 1 ? [major + 1, 0, 0] : [major, minor + 1, 0])
      : major > 0 || missing === 1 ? [major + 1, 0, 0] : minor > 0 || missing === 2 ? [0, minor + 1, 0] : [0, 0, patch + 1];
    return [['>=', low], ['<', bound(high)]];
  }
  if (missing < 0) return [[op, low]];
  if (missing === 0) return op === '>' || op === '<' ? null : [];
  if (op === '=') return [['>=', low], ['<', next]];
  if (op === '>') return [['>=', next]];
  if (op === '<=') return [['<', next]];
  return [[op, low]];
}
export function supportedVersion(version, range) {
  if (range === null) return true;
  const current = versionParts(version);
  if (!current || typeof range !== 'string') return false;
  return range.split('||').some(part => {
    const expanded = part.trim().replace(/(\S+)\s+-\s+(\S+)/g, '>= $1 <= $2').replace(/(>=|<=|>|<|=|\^|~)\s+/g, '$1');
    const groups = expanded ? expanded.split(/\s+/).map(comparators) : [[]];
    if (groups.includes(null)) return false;
    const checks = groups.flat();
    if (current.pre.length && !checks.some(([, target]) => target.pre.length && target.numbers.every((n, i) => n === current.numbers[i]))) return false;
    return checks.every(([op, target]) => {
      const result = compare(current, target);
      return op === '>=' ? result >= 0 : op === '<=' ? result <= 0 : op === '>' ? result > 0 : op === '<' ? result < 0 : result === 0;
    });
  });
}

export function platformAvailability(id, {status, catalog, usage, registry = DEFAULT_INSTALLER_REGISTRY} = {}) {
  const runtime = registry.getPlatform(id)?.runtime;
  const required = usage === 'standalone' ? ['install', 'standalone'] : [usage === 'role' ? 'compositeRole' : 'compositeHost'];
  const blocked = reason => ({selectable: false, reason, warning: null});
  if (!runtime || required.some(key => runtime.capabilities[key]?.state !== 'verified')) return blocked('capability_not_verified');
  let warning = null;
  if (usage !== 'standalone') {
    const auth = status?.authentication;
    if (auth?.reason === 'cli_not_found' || status?.cliVersion?.reason === 'cli_not_found') return blocked('not_installed');
    if (!supportedVersion(status?.cliVersion?.version, runtime.cli.supportedVersions)) return blocked('unsupported_version');
    if (auth?.authStatus === 'unauthorized') return blocked('unauthorized');
    if (auth?.authStatus !== 'authenticated') {
      if (runtime.auth.kind !== 'none') return blocked('auth_check_failed');
      warning = 'auth_unverified';
    }
  }
  if (catalog !== undefined && (catalog?.status !== 'ready' || !Array.isArray(catalog.catalog?.pairs) || !catalog.catalog.pairs.length)) return blocked('catalog_error');
  return {selectable: true, reason: null, warning};
}

export function reasonDetail(id, availability, status, registry = DEFAULT_INSTALLER_REGISTRY) {
  if (!availability?.reason) return availability?.warning === 'auth_unverified' ? `${platformLabel(id, registry)}: auth unverified — ARC cannot confirm ${platformLabel(id, registry)} CLI login.` : '';
  const messages = [status?.authentication?.reason, ...(status?.diagnostics ?? []).map(error => error?.message)].filter(Boolean);
  return `${platformLabel(id, registry)}: ${REASON_TEXT[availability.reason]}${messages.length ? ': ' + messages.join('; ') : ''}`;
}
