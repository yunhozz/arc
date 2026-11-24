import path from 'node:path';

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
  // Codex 0.170.0 / Claude 2.1.327, 2026-11-24, T0·T0b SX4, SC3, SX7
  'service.browser-cdp': 'conditional',
  // Codex 0.170.0 / Claude 2.1.327, 2026-11-24, T0·T0b B10, B11
  'service.browser-playwright-chromium': 'conditional',
  'service.browser-playwright-firefox': 'conditional',
  'service.browser-playwright-webkit': 'conditional',
};
const uniformGates = state => Object.fromEntries(Object.keys(writingGates).map(mechanism => [mechanism, state]));

const playwrightCondition = 'host Playwright server isolation pending MI-B';
const browserConditions = {
  'service.browser-cdp': 'host Chrome reads ~/Library (SX7); narrowing pending MI-A',
  'service.browser-playwright-chromium': playwrightCondition,
  'service.browser-playwright-firefox': playwrightCondition,
  'service.browser-playwright-webkit': playwrightCondition,
};

const noAdapter = {scratchRoot: null, scratchParent: null, extraMechanisms: () => [], preflight: [], conditions: {}};
const claudeScratchParent = ({uid}) => `/private/tmp/claude-${uid}`;
export const TOOL_ACCESS_ADAPTERS = deepFreeze({
  codex: {
    ...noAdapter,
    gates: {
      ...writingGates,
      // Codex 0.170.0 / Claude 2.1.327, 2026-11-24, T0·T0b B1
      codexProfile: 'conditional',
    },
    conditions: {
      ...browserConditions,
      codexProfile: 'profile mode requires worktree .git and .codex read entries (B1); exec acceptance pending MI-1/MI-3',
      'network.domains': 'tools that ignore the network proxy (for example npm) fail (B2)',
    },
    scratchRoot: ({id8}) => `/private/tmp/arc-bridge-${id8}`,
    extraMechanisms: grants => (grants.network !== null || grants.paths.length || grants.unixSockets.length) ? ['codexProfile'] : [],
  },
  claude: {
    ...noAdapter,
    gates: writingGates,
    conditions: {...browserConditions, 'network.domains': 'Read tool denial unverified until MI-7'},
    scratchRoot: ({id8, uid}) => `${claudeScratchParent({uid})}/arc-bridge-${id8}`,
    scratchParent: claudeScratchParent,
  },
  grok: {...noAdapter, gates: uniformGates('unmeasured')},
  gemini: {...noAdapter, gates: uniformGates('held')},
});

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

export async function toolAccessPreflight(context) {
  for (const check of TOOL_ACCESS_ADAPTERS[context.platform]?.preflight ?? []) {
    const reason = await check(context);
    if (reason !== null) return [reason];
  }
  return [];
}
