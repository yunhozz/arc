import path from 'node:path';
import {constants} from 'node:fs';
import fsp from 'node:fs/promises';
import {resolveWorktree} from './role-observe.mjs';
import {hostDirFor, hostServicePreflight} from './host-service.mjs';

function deepFreeze(value) {
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === 'object') deepFreeze(child);
  }
  return Object.freeze(value);
}

export const TOOL_ACCESS_KEYS = Object.freeze(['network', 'domains', 'unixSockets', 'paths', 'services', 'envPresets']);
export const TOOL_ACCESS_SERVICES = Object.freeze([
  'browser-cdp', 'browser-playwright-chromium', 'browser-playwright-firefox', 'browser-playwright-webkit',
]);
export const ALWAYS_ENV_PRESETS = Object.freeze(['base', 'caches']);
export const REQUESTABLE_ENV_PRESETS = Object.freeze(['ci', 'daemon-off', 'polling']);
export const TOOL_PATHS = Object.freeze({});
export const TOOL_UNIX_SOCKETS = Object.freeze({});

export const TOOL_ENV_PRESETS = deepFreeze({
  base: {
    TMPDIR: '<S>/tmp', XDG_CACHE_HOME: '<S>/cache/xdg', GIT_TERMINAL_PROMPT: '0', DO_NOT_TRACK: '1',
    NEXT_TELEMETRY_DISABLED: '1', NPM_CONFIG_UPDATE_NOTIFIER: 'false', HOMEBREW_NO_AUTO_UPDATE: '1',
    HOMEBREW_NO_ANALYTICS: '1', AGENT_BROWSER_NO_VERSION_CHECK: '1', AGENT_BROWSER_SOCKET_DIR: '<S>/sock',
    ARC_SCRATCH_DIR: '<S>', ARC_EVIDENCE_DIR: '<S>/evidence', ARC_HOST_SERVICES_FILE: '<S>/services.json',
  },
  caches: {
    npm_config_cache: '<S>/cache/npm', PYTHONPYCACHEPREFIX: '<S>/cache/pyc', UV_CACHE_DIR: '<S>/cache/uv',
    YARN_CACHE_FOLDER: '<S>/cache/yarn', PIP_CACHE_DIR: '<S>/cache/pip', POETRY_CACHE_DIR: '<S>/cache/poetry',
    GOCACHE: '<S>/cache/go-build', HOMEBREW_CACHE: '<S>/cache/brew',
  },
  ci: {CI: '1', NO_COLOR: '1', PIP_NO_INPUT: '1'},
  'daemon-off': {NX_DAEMON: 'false', GRADLE_OPTS: '-Dorg.gradle.daemon=false'},
  polling: {
    CHOKIDAR_USEPOLLING: '1', WATCHPACK_POLLING: 'true',
    TSC_WATCHFILE: 'DynamicPriorityPolling', TSC_WATCHDIRECTORY: 'DynamicPriorityPolling',
  },
});

const dir = path => ({path, kind: 'dir'});
const file = path => ({path, kind: 'file'});
const externalReads = [
  dir('~/.ssh'), dir('~/.aws'), dir('~/.config/gh'), dir('~/.config/gcloud'), file('~/.npmrc'),
  file('~/.netrc'), dir('~/.docker'), dir('~/.kube'), dir('~/.gnupg'), file('~/.gitconfig'), dir('<cli-homes>'),
];
export const FORBIDDEN = deepFreeze({
  write: [
    dir('<wt>/.git'), dir('<wt>/.codex'), ...externalReads,
    file('~/.zshrc'), file('~/.zprofile'), file('~/.zshenv'), file('~/.bashrc'), file('~/.bash_profile'), file('~/.profile'),
    dir('~/Library/LaunchAgents'), dir('~/Library/Keychains'),
  ],
  sockets: ['/var/run/docker.sock', '~/.docker', '~/.colima', '$SSH_AUTH_SOCK', '~/.gnupg'],
  readWhenExternal: externalReads,
  envWhenExternal: [
    '*TOKEN*', '*SECRET*', '*PASSWORD*', '*PASSWD*', '*API_KEY*', '*ACCESS_KEY*', '*PRIVATE_KEY*', '*CREDENTIAL*',
    'AWS_*', 'GH_*', 'GITHUB_*', 'SSH_AUTH_SOCK', 'GPG_AGENT_INFO',
  ],
});

export function resolveForbidden({worktree, userHome, homes, env}) {
  const resolvePath = value => {
    if (value.startsWith('<wt>/')) return path.resolve(worktree, value.slice(5));
    if (value.startsWith('~/')) return path.resolve(userHome, value.slice(2));
    return path.resolve(worktree, value);
  };
  const resolveEntries = entries => entries.flatMap(({path, kind}) =>
    (path === '<cli-homes>' ? Object.values(homes) : [path]).map(value => ({path: resolvePath(value), kind})));
  const sockets = FORBIDDEN.sockets.flatMap(value => value === '$SSH_AUTH_SOCK' ? (env?.SSH_AUTH_SOCK ? [env.SSH_AUTH_SOCK] : []) : [value]);
  return {
    write: resolveEntries(FORBIDDEN.write),
    sockets: sockets.map(resolvePath),
    readWhenExternal: resolveEntries(FORBIDDEN.readWhenExternal),
    envWhenExternal: [...FORBIDDEN.envWhenExternal],
  };
}

const writingGates = {
  // Codex 0.170.0 / Claude 2.1.327, 2026-11-24, T0·T0b SX3, SC0·SC2
  scratch: 'pass',
  // Codex 0.170.0 / Claude 2.1.327, 2026-11-24, T0·T0b SX3, SC2, B4
  'env.base': 'pass',
  'env.caches': 'pass',
  // Codex 0.170.0 / Claude 2.1.327, 2026-11-24, T0·T0b SX3, SC2, B9 (mechanism only)
  'env.ci': 'pass',
  'env.daemon-off': 'pass',
  'env.polling': 'pass',
  // Codex 0.170.0 / Claude 2.1.327, 2026-11-24, T0·T0b SX1, SC1, B3
  'network.loopback': 'pass',
  // Codex 0.170.0 / Claude 2.1.327, 2026-11-24, T0·T0b SX4, SC3, B5
  'unixSockets.scratch': 'pass',
  'unixSockets.registered': 'pass',
  // Codex 0.170.0 / Claude 2.1.327, 2026-11-24, T0·T0b B13
  paths: 'pass',
  // Codex 0.170.0 / Claude 2.1.327, 2026-11-24, T0·T0b B2, B6, B7
  'network.domains': 'conditional',
  // Codex 0.170.0 / Claude 2.1.327, 2026-11-24, T0·T0b SX1
  'network.full': 'held',
  // Chrome 158.0.8127.37, 2026-11-24, MI-A
  'service.browser-cdp': 'conditional',
  // Chrome 158.0.8127.37, 2026-11-24, MI-B
  'service.browser-playwright-chromium': 'held',
  'service.browser-playwright-firefox': 'held',
  'service.browser-playwright-webkit': 'held',
};
const uniformGates = state => Object.fromEntries(Object.keys(writingGates).map(mechanism => [mechanism, state]));

const playwrightCondition = 'no host-global Playwright install; isolation unmeasured (MI-B)';
const browserConditions = {
  'service.browser-cdp': 'home and ~/Library reads denied (MI-A); files outside home such as /etc remain readable through file://',
  'service.browser-playwright-chromium': playwrightCondition,
  'service.browser-playwright-firefox': playwrightCondition,
  'service.browser-playwright-webkit': playwrightCondition,
};

async function codexUserProfileConflict({grants, worktree, homes, io}) {
  if (!grants.mechanisms.includes('codexProfile')) return null;
  const hold = 'permission_scope_unverified';
  if (typeof worktree !== 'string') return hold;
  try {
    // Prepare receives the caller's cwd, which can be below the worktree root.
    const {realpath} = await resolveWorktree(worktree);
    const configs = [path.join(homes.codex, 'config.toml'), path.join(realpath, '.codex', 'config.toml')];
    for (const filename of configs) {
      let config;
      try { config = await io.readFile(filename, 'utf8'); }
      catch (error) {
        if (error.code === 'ENOENT') continue;
        return hold;
      }
      if (/^\s*\[\s*permissions\s*\.\s*"?arc_bridge"?\s*[\].]/m.test(config)
        || /^\s*permissions\s*\.\s*"?arc_bridge"?\s*[.=]/m.test(config)
        || (/^\s*\[\s*permissions\s*\]/m.test(config) && /^\s*"?arc_bridge"?\s*[.=]/m.test(config))) return hold;
    }
  } catch { return hold; }
  return null;
}

async function claudeAllowWriteDirsExist({grants, io}, {toolPaths = TOOL_PATHS} = {}) {
  const hold = 'permission_scope_unverified';
  for (const id of grants.paths) {
    if (!Object.hasOwn(toolPaths, id)) return hold;
    try {
      if (!(await io.lstat(toolPaths[id])).isDirectory()) return hold;
    } catch { return hold; }
  }
  return null;
}

const noAdapter = {scratchRoot: null, scratchParent: null, extraMechanisms: () => [], preflight: [], conditions: {}};
const claudeScratchParent = ({uid}) => `/private/tmp/claude-${uid}`;
export const TOOL_ACCESS_ADAPTERS = deepFreeze({
  codex: {
    ...noAdapter,
    gates: {
      ...writingGates,
      // Codex 0.170.0, 2026-11-24, MI-1, MI-3
      codexProfile: 'conditional',
      // Codex 0.170.0, 2026-11-24, MI-9
      'network.domains': 'conditional',
    },
    conditions: {
      ...browserConditions,
      codexProfile: 'profile mode requires worktree .git and .codex read entries (verified by MI-1/MI-3)',
      'network.domains': 'tools that ignore the network proxy (for example npm) fail (B2); external read denials verified by MI-9',
    },
    scratchRoot: ({id8}) => `/private/tmp/arc-bridge-${id8}`,
    extraMechanisms: grants => (grants.network !== null || grants.paths.length || grants.unixSockets.length) ? ['codexProfile'] : [],
    preflight: [codexUserProfileConflict, checkHostServices],
  },
  claude: {
    ...noAdapter,
    gates: {
      ...writingGates,
      // Claude 2.1.327, 2026-11-24, MI-5
      'network.loopback': 'pass',
      // Claude 2.1.327, 2026-11-24, MI-6
      // Claude 2.1.327, 2026-11-24, MI-7
      // Claude 2.1.327, 2026-11-24, MI-9
      'network.domains': 'conditional',
    },
    conditions: {
      ...browserConditions,
      'network.domains': 'tools that ignore the network proxy (for example npm) fail (B2); Read tool denial verified by MI-7, directory denyRead by MI-9',
    },
    scratchRoot: ({id8, uid}) => `${claudeScratchParent({uid})}/arc-bridge-${id8}`,
    scratchParent: claudeScratchParent,
    preflight: [claudeAllowWriteDirsExist, checkHostServices],
  },
  grok: {...noAdapter, gates: uniformGates('unmeasured')},
  gemini: {...noAdapter, gates: uniformGates('held')},
});

function checkHostServices({grants, io}) {
  return hostServicePreflight({services: grants.services ?? [], io});
}

function mechanismView(field) {
  const view = {};
  for (const [platform, adapter] of Object.entries(TOOL_ACCESS_ADAPTERS)) {
    for (const [mechanism, value] of Object.entries(adapter[field])) {
      (view[mechanism] ??= {})[platform] = value;
    }
  }
  return deepFreeze(view);
}

export const TOOL_ACCESS_GATES = mechanismView('gates');
export const TOOL_ACCESS_CONDITIONS = mechanismView('conditions');

function gateFor(mechanism, platform, overrides) {
  return overrides == null ? TOOL_ACCESS_ADAPTERS[platform]?.gates?.[mechanism] : overrides[mechanism]?.[platform];
}

const domainPattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
const internalDomain = /\.(?:localhost|local|internal|home\.arpa)$/;
export const isValidDomain = name => typeof name === 'string' && domainPattern.test(name) && !internalDomain.test(name);

const roleAccess = deepFreeze({
  arc_implementer: {networks: [null, 'loopback'], services: []},
  arc_tester: {networks: [null, 'loopback', 'domains', 'full'], services: TOOL_ACCESS_SERVICES},
});
const arrayKeys = TOOL_ACCESS_KEYS.slice(1);

export function validateToolAccess(role, value) {
  if (!Object.hasOwn(roleAccess, role) || !value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== TOOL_ACCESS_KEYS.length || !TOOL_ACCESS_KEYS.every(key => Object.hasOwn(value, key))) return null;
  const allowed = roleAccess[role];
  if (!allowed.networks.includes(value.network)) return null;
  const normalized = {network: value.network};
  for (const key of arrayKeys) {
    if (!Array.isArray(value[key])) return null;
    const items = [...value[key]];
    if (items.some(item => typeof item !== 'string') || new Set(items).size !== items.length) return null;
    normalized[key] = items.sort();
  }
  const {network, domains, unixSockets, paths, services, envPresets} = normalized;
  if (network === 'domains' ? domains.length < 1 || domains.length > 16 || !domains.every(isValidDomain) : domains.length !== 0) return null;
  if (!unixSockets.every(id => Object.hasOwn(TOOL_UNIX_SOCKETS, id)) || !paths.every(id => Object.hasOwn(TOOL_PATHS, id))
    || !services.every(id => allowed.services.includes(id)) || !envPresets.every(id => REQUESTABLE_ENV_PRESETS.includes(id))) return null;
  return normalized;
}

const alwaysMechanisms = ['scratch', ...ALWAYS_ENV_PRESETS.map(id => `env.${id}`)];
const networkMechanisms = {loopback: ['network.loopback'], domains: ['network.loopback', 'network.domains'], full: ['network.full']};

export function effectiveGrants(platform, role, toolAccess) {
  if (!Object.hasOwn(roleAccess, role)) return null;
  if (toolAccess === null && !alwaysMechanisms.every(id => gateFor(id, platform) === 'pass')) return null;
  const access = toolAccess ?? {network: null, domains: [], unixSockets: [], paths: [], services: [], envPresets: []};
  const network = access.network ?? (access.services.length ? 'loopback' : null);
  const grants = {...access, network, envPresets: [...ALWAYS_ENV_PRESETS, ...access.envPresets]};
  const mechanisms = [
    ...alwaysMechanisms,
    ...access.envPresets.map(id => `env.${id}`),
    ...(TOOL_ACCESS_ADAPTERS[platform]?.extraMechanisms?.(grants) ?? []),
    ...(networkMechanisms[network] ?? []),
  ];
  if (network !== null) mechanisms.push('unixSockets.scratch');
  if (access.unixSockets.length) mechanisms.push('unixSockets.registered');
  if (access.paths.length) mechanisms.push('paths');
  mechanisms.push(...access.services.map(id => `service.${id}`));
  return {...grants, mechanisms: [...new Set(mechanisms)]};
}

export function toolAccessReasons({platform, role, route, toolAccess, policy}) {
  if (toolAccess === undefined) return {reasons: [], conditions: []};
  const normalized = validateToolAccess(role, toolAccess);
  if (normalized === null) return {reasons: ['invalid_request'], conditions: []};
  if (route === 'native') return {reasons: ['permission_scope_unverified'], conditions: []};
  const {mechanisms} = effectiveGrants(platform, role, normalized);
  const conditions = [];
  for (const mechanism of mechanisms) {
    const gate = gateFor(mechanism, platform, policy?.toolAccessGates);
    if (gate === 'conditional') conditions.push({mechanism, condition: TOOL_ACCESS_ADAPTERS[platform]?.conditions?.[mechanism] ?? ''});
    else if (gate !== 'pass') return {reasons: ['permission_scope_unverified'], conditions: []};
  }
  return {reasons: [], conditions};
}

export async function toolAccessPreflight(context, options) {
  for (const check of TOOL_ACCESS_ADAPTERS[context.platform]?.preflight ?? []) {
    const reason = await check(context, options);
    if (reason !== null) return [reason];
  }
  return [];
}

export const EVIDENCE_LIMITS = Object.freeze({totalBytes: 67108864, fileBytes: 16777216, entries: 256, depth: 8});

export function renderEnv(presetIds, scratch) {
  const values = new Map();
  for (const id of presetIds) {
    for (const [key, value] of Object.entries(TOOL_ENV_PRESETS[id])) {
      if (values.has(key)) throw Error(`Duplicate tool environment key: ${key}`);
      values.set(key, value.replaceAll('<S>', () => scratch));
    }
  }
  return [...values.keys()].sort().map(key => [key, values.get(key)]);
}

export function buildToolContext({platform, role, dispatchId, toolAccess, uid, userHome, homes, env, envNames = [], worktree, gitDir, gitCommonDir, policy}) {
  const grants = effectiveGrants(platform, role, toolAccess ?? null);
  if (grants === null) return null;
  const adapter = TOOL_ACCESS_ADAPTERS[platform];
  const scratch = adapter.scratchRoot({id8: dispatchId.replaceAll('-', '').slice(0, 8), uid});
  const forbidden = resolveForbidden({worktree, userHome, homes, env});
  const hostDir = grants.services.length ? hostDirFor(dispatchId) : null;
  if (hostDir && forbidden.write.some(({path: filename}) => containsPath(filename, hostDir) || containsPath(hostDir, filename))) {
    throw Object.assign(Error('Host service directory overlaps a protected path'), {reasonCode: 'permission_scope_unverified'});
  }
  const {conditions} = toolAccessReasons({platform, role, route: 'bridge', toolAccess, policy});
  const secretPatterns = grants.network === 'domains' ? forbidden.envWhenExternal.map(glob => new RegExp(`^${glob.replaceAll('*', '.*')}$`)) : [];
  return {
    scratch, parent: adapter.scratchParent?.({uid}) ?? null, env: renderEnv(grants.envPresets, scratch), grants, forbidden,
    secretEnvNames: envNames.filter(name => secretPatterns.some(pattern => pattern.test(name))).sort(),
    hostDir, worktree, gitDir, gitCommonDir, conditions,
  };
}

function containsPath(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

async function lstatIfPresent(filename) {
  try { return await fsp.lstat(filename); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return null;
  }
}

export async function createScratch({scratch, parent, uid}) {
  let created = false;
  try {
    if (parent) {
      let madeParent = false;
      try { await fsp.mkdir(parent, {mode: 0o700}); madeParent = true; } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
      const stat = await fsp.lstat(parent);
      if (!stat.isDirectory() || stat.uid !== uid) {
        throw Object.assign(Error('Scratch parent must be an owned directory'), {reasonCode: 'permission_scope_unverified'});
      }
      if (madeParent) await fsp.chmod(parent, 0o700);
    }
    await fsp.mkdir(scratch, {mode: 0o700});
    created = true;
    await fsp.chmod(scratch, 0o700);
    for (const name of ['tmp', 'cache', 'sock', 'evidence']) {
      const directory = path.join(scratch, name);
      await fsp.mkdir(directory, {mode: 0o700});
      await fsp.chmod(directory, 0o700);
    }
  } catch (error) {
    if (created) await removeScratch(scratch);
    throw Object.assign(error, {reasonCode: error.reasonCode ?? 'execution_failed'});
  }
}

export async function removeScratch(scratch) {
  try {
    if (!(await fsp.lstat(scratch)).isDirectory()) return false;
    await fsp.rm(scratch, {recursive: true, force: false});
    return true;
  } catch {
    return false;
  }
}

const sameEntry = (a, b) => a && a.dev === b.dev && a.ino === b.ino;

async function readEvidenceFile(filename, stat, maxBytes, parentIntact) {
  const source = await fsp.open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const current = await source.stat();
    if (!current.isFile() || !sameEntry(current, stat) || !await parentIntact()) return {skipped: true};
    if (current.size > maxBytes) return {truncated: true};
    // Read at most one extra byte so a file that grows during collection cannot bypass the limits.
    const buffer = Buffer.alloc(current.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const {bytesRead} = await source.read(buffer, length, buffer.length - length, length);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    if (length > current.size) return {truncated: true};
    return {bytes: buffer.subarray(0, length)};
  } finally {
    await source.close();
  }
}

export async function collectEvidence({scratch, artifactDir, limits = EVIDENCE_LIMITS}) {
  const result = {copied: 0, skipped: [], truncated: false};
  const skip = (relative, truncated = false) => {
    if (result.skipped.length < EVIDENCE_LIMITS.entries) result.skipped.push(relative);
    if (truncated) result.truncated = true;
  };
  const sourceRoot = path.join(scratch, 'evidence');
  const scratchStat = await lstatIfPresent(scratch);
  if (!scratchStat?.isDirectory()) return result;
  const sourceStat = await lstatIfPresent(sourceRoot);
  if (!sourceStat) return result;
  if (!sourceStat.isDirectory()) { skip('.'); return result; }
  if (!(await fsp.lstat(artifactDir)).isDirectory()) throw Error('Evidence artifact directory is not a directory');
  const destinationRoot = path.join(artifactDir, 'evidence');
  const makeDirectory = async filename => {
    await fsp.mkdir(filename, {mode: 0o700});
    await fsp.chmod(filename, 0o700);
  };
  await makeDirectory(destinationRoot);
  let visited = 0, totalBytes = 0;
  const walk = async (directory, stat, parentIntact, depth) => {
    const intact = async () => await parentIntact() && sameEntry(await lstatIfPresent(directory), stat);
    if (!await intact()) return;
    const names = (await fsp.readdir(directory)).sort();
    if (!await intact()) return;
    for (const name of names) {
      if (!await intact()) return;
      const source = path.join(directory, name);
      const relative = path.relative(sourceRoot, source);
      const destination = path.join(destinationRoot, relative);
      if (path.relative(destinationRoot, destination).startsWith('..')) { skip(relative); continue; }
      if (visited >= limits.entries) { skip(relative, true); return; }
      visited++;
      if (depth > limits.depth) { skip(relative, true); return; }
      const entry = await lstatIfPresent(source);
      if (entry?.isDirectory()) {
        await makeDirectory(destination);
        await walk(source, entry, intact, depth + 1);
        if (result.truncated) return;
      } else if (entry?.isFile()) {
        const maxBytes = Math.min(limits.fileBytes, limits.totalBytes - totalBytes);
        if (entry.size > maxBytes) { skip(relative, true); return; }
        const {bytes, truncated} = await readEvidenceFile(source, entry, maxBytes, intact);
        if (truncated) { skip(relative, true); return; }
        if (!bytes) { skip(relative); continue; }
        const output = await fsp.open(destination, 'wx', 0o600);
        try {
          await output.writeFile(bytes);
          await output.chmod(0o600);
        } finally { await output.close(); }
        totalBytes += bytes.length;
        result.copied++;
      } else {
        skip(relative);
      }
    }
  };
  await walk(sourceRoot, sourceStat, async () => sameEntry(await lstatIfPresent(scratch), scratchStat), 1);
  return result;
}
