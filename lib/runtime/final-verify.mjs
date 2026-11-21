import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash, randomBytes, randomUUID} from 'node:crypto';
import {execFile, spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {getPlatform} from './platform-registry.mjs';
import {inspectPath, within} from './scope.mjs';
import {PARSER_SCHEMA_VERSION, summarizeCommand, validateRegexSpec} from './test-results.mjs';

export const VERIFY_COMMANDS = Object.freeze(['verify-start', 'verify-status', 'verify-compare', 'verify-rerun', 'verify-cleanup']);
export const HEARTBEAT_INTERVAL_MS = 2000;
export const HEARTBEAT_STALE_MS = 15000;
export const LOAD_SAMPLE_MS = 30000;
export const DEFAULT_TIMEOUT_MS = 3600000;
export const MAX_TIMEOUT_MS = 21600000;
export const KILL_GRACE_MS = 10000;
export const RAW_STREAM_CAP = 64 * 1024 * 1024;
export const GLOB_FILE_LIMIT = 100000;
export const TOOL_VERSION_TIMEOUT_MS = 30000;
export const ENV_BASE_ALLOWLIST = Object.freeze(['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'TZ', 'PYTHONDONTWRITEBYTECODE']);
export const LOAD_START_RATIO = 0.5;
export const LOAD_SAMPLE_RATIO = 1.5;
export const RERUN_DEFAULT_LIMIT = 3;
export const RERUN_MAX_LIMIT = 10;
export const DEFAULT_TOP_N = 10;
export const MAX_TOP_N = 100;
export const MAX_WAIT_MS = 600000;

const RUN_ID = /^\d{8}T\d{6}Z-[0-9a-f]{8}$/;
const REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const CACHE_KEY = /^[0-9a-f]{64}$/;
const BLOCKED_CHILD_ENV = new Set(['ARC_BRIDGE_CHILD', 'NODE_TEST_CONTEXT']);
const SANDBOX_MODES = ['none', 'sandboxed', 'escalated', 'unknown'];
const RUNTIME_FILES = ['verify-cli.mjs', 'final-verify.mjs', 'test-results.mjs', 'node-test-reporter.mjs'];
const REPORTER = new URL('./node-test-reporter.mjs', import.meta.url);
const LOCKFILES = new Set([
  'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb',
  'Cargo.lock', 'Gemfile.lock', 'Pipfile.lock', 'poetry.lock', 'uv.lock', 'composer.lock',
  'go.sum', 'go.work.sum', 'gradle.lockfile', 'flake.lock', 'packages.lock.json',
]);
const terminal = state => state === 'succeeded' || state === 'failed';
const nowIso = () => new Date().toISOString();

export class VerifyError extends Error {
  constructor(code, decision = 'deny', extra = {}) {
    super(extra.message ?? code);
    this.code = code;
    this.result = {...extra, code, decision};
  }
}

function expect(condition, message) {
  if (!condition) throw new VerifyError('invalid_request', 'deny', {message});
}

function exact(value, required, optional = []) {
  expect(value && typeof value === 'object' && [null, Object.prototype].includes(Object.getPrototypeOf(value)), 'Expected an object');
  expect(required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key)),
    'Invalid object keys');
}

function string(value) {
  expect(typeof value === 'string' && !value.includes('\0'), 'Expected a string without NUL');
  return value;
}

function nonempty(value) {
  expect(string(value).length > 0, 'Expected a nonempty string');
  return value;
}

function list(value, map) {
  expect(Array.isArray(value), 'Expected an array');
  return value.map(map);
}

function oneOf(value, choices) {
  expect(choices.includes(value), 'Invalid enum value');
  return value;
}

function integer(value, min, max) {
  expect(Number.isSafeInteger(value) && value >= min && value <= max, 'Integer out of range');
  return value;
}

function boolean(value) {
  expect(typeof value === 'boolean', 'Expected a boolean');
  return value;
}

function tagged(value, pattern) {
  expect(pattern.test(nonempty(value)), 'Invalid identifier');
  return value;
}

function optional(record, key, validate, fallback) {
  return Object.hasOwn(record, key) ? validate(record[key]) : fallback;
}

function envName(value) {
  expect(/^[^=]+$/.test(nonempty(value)), 'Invalid environment variable name');
  return value;
}

function envMap(value) {
  expect(value && typeof value === 'object' && [null, Object.prototype].includes(Object.getPrototypeOf(value)), 'Expected an environment object');
  return Object.fromEntries(Object.entries(value).map(([name, item]) => [envName(name), string(item)]));
}

function relativePath(value) {
  nonempty(value);
  expect(!path.posix.isAbsolute(value) && !path.win32.isAbsolute(value) && !/^[a-z]:/i.test(value) &&
    !value.includes('\\') && !value.split('/').some(segment => segment === '..' || segment.toLowerCase() === '.git'), 'Expected a path inside the worktree');
  return path.posix.normalize(value).replace(/\/$/, '');
}

function absolutePath(value) {
  expect(path.isAbsolute(nonempty(value)), 'Expected an absolute path');
  return path.resolve(value);
}

function worktreeCwd(value) {
  nonempty(value);
  if (value === '{worktree}') return value;
  const prefix = '{worktree}/';
  const relative = relativePath(value.startsWith(prefix) ? value.slice(prefix.length) : value);
  return relative === '.' ? '{worktree}' : prefix + relative;
}

function commandArg(value) {
  if (typeof value === 'string') return string(value);
  exact(value, ['glob']);
  return {glob: relativePath(value.glob)};
}

function validateResults(results) {
  exact(results, ['format'], ['path', 'stream', 'pattern', 'statusMap']);
  const {format} = results;
  oneOf(format, ['none', 'tap', 'junit-xml', 'regex']);
  if (format === 'none') {
    exact(results, ['format']);
    return {format};
  }
  if (format !== 'regex') {
    const hasPath = Object.hasOwn(results, 'path');
    exact(results, ['format', hasPath ? 'path' : 'stream']);
    return hasPath ? {format, path: relativePath(results.path)} : {format, stream: oneOf(results.stream, ['stdout', 'stderr'])};
  }
  exact(results, ['format', 'stream', 'pattern', 'statusMap']);
  exact(results.statusMap, ['pass', 'fail', 'skip'], ['fileError']);
  const validated = {
    format, stream: oneOf(results.stream, ['stdout', 'stderr', 'both']), pattern: string(results.pattern),
    statusMap: Object.fromEntries(Object.entries(results.statusMap).map(([key, values]) => [key, list(values, string)]))
  };
  try {
    validateRegexSpec(validated);
  } catch (error) {
    throw new VerifyError('invalid_request', 'deny', {message: error.message});
  }
  return validated;
}

function validateTask(task, command = false) {
  exact(task, command ? ['id', 'executable', 'args', 'results'] : ['executable', 'args'],
    command ? ['cwd', 'env', 'timeoutMs', 'isolate'] : ['cwd', 'env', 'timeoutMs']);
  const {executable, args} = task;
  const validated = {
    executable: nonempty(executable), args: list(args, command ? commandArg : string),
    cwd: optional(task, 'cwd', worktreeCwd, '{worktree}'), env: optional(task, 'env', envMap, {}),
    timeoutMs: optional(task, 'timeoutMs', value => integer(value, 1, MAX_TIMEOUT_MS), DEFAULT_TIMEOUT_MS)
  };
  if (!command) return validated;
  validated.id = tagged(task.id, /^[a-z0-9][a-z0-9_-]{0,31}$/);
  validated.results = validateResults(task.results);
  if (Object.hasOwn(task, 'isolate')) {
    exact(task.isolate, ['args']);
    validated.isolate = {args: list(task.isolate.args, string)};
  }
  return validated;
}

function validateStart(input) {
  exact(input, ['hostPlatform', 'executionEnvironment', 'sandboxMode', 'role', 'revision', 'commands', 'keyInputs', 'detach'],
    ['prepare', 'seedFiles', 'declaredConcurrent', 'snapshotWorkingTree']);
  const {hostPlatform, executionEnvironment, sandboxMode, role, revision, keyInputs} = input;
  expect(getPlatform(hostPlatform)?.executionEnvironments.includes(executionEnvironment), 'Host and execution environment mismatch');
  oneOf(role, ['baseline', 'head']);
  const snapshotWorkingTree = optional(input, 'snapshotWorkingTree', boolean, false);
  expect(!snapshotWorkingTree || role === 'head', 'Snapshot requires a head run');
  const commands = list(input.commands, task => validateTask(task, true));
  expect(commands.length > 0 && new Set(commands.map(task => task.id)).size === commands.length, 'Expected unique command IDs');
  exact(keyInputs, ['envNames', 'toolVersionCommands', 'dependencyPaths', 'artifactPaths']);
  const prepare = optional(input, 'prepare', tasks => list(tasks, task => validateTask(task)), []);
  const seedFiles = optional(input, 'seedFiles', seeds => list(seeds, seed => {
    exact(seed, ['source', 'dest']);
    return {source: absolutePath(seed.source), dest: relativePath(seed.dest)};
  }), []);
  expect(new Set(seedFiles.map(seed => seed.dest)).size === seedFiles.length && seedFiles.every(seed => seed.dest !== '.'),
    'Expected distinct seed destinations');
  return {
    hostPlatform, executionEnvironment, sandboxMode: oneOf(sandboxMode, SANDBOX_MODES), role,
    revision: tagged(revision, REVISION), commands, prepare, seedFiles,
    detach: boolean(input.detach), snapshotWorkingTree, declaredConcurrent: optional(input, 'declaredConcurrent', boolean, false),
    keyInputs: {
      envNames: [...new Set(list(keyInputs.envNames, envName))].sort(),
      toolVersionCommands: list(keyInputs.toolVersionCommands, tool => {
        exact(tool, ['executable', 'args']);
        return {executable: nonempty(tool.executable), args: list(tool.args, string)};
      }),
      dependencyPaths: [...new Set(list(keyInputs.dependencyPaths, absolutePath))].sort(),
      artifactPaths: [...new Set(list(keyInputs.artifactPaths, relativePath))].sort()
    }
  };
}

export function validateVerifyInput(command, input) {
  const runId = value => tagged(value, RUN_ID);
  if (command === 'verify-start') return validateStart(input);
  if (command === 'verify-status') {
    exact(input, ['runId'], ['waitMs']);
    return {runId: runId(input.runId), waitMs: optional(input, 'waitMs', value => integer(value, 0, MAX_WAIT_MS), 0)};
  }
  if (command === 'verify-compare') {
    exact(input, ['baseRunId', 'headRunId'], ['topN']);
    return {baseRunId: runId(input.baseRunId), headRunId: runId(input.headRunId),
      topN: optional(input, 'topN', value => integer(value, 1, MAX_TOP_N), DEFAULT_TOP_N)};
  }
  if (command === 'verify-rerun') {
    exact(input, ['runId', 'testId', 'attempt', 'sandboxMode'], ['limit']);
    return {
      runId: runId(input.runId), testId: nonempty(input.testId), attempt: integer(input.attempt, 1, Number.MAX_SAFE_INTEGER),
      sandboxMode: oneOf(input.sandboxMode, SANDBOX_MODES), limit: optional(input, 'limit', value => integer(value, 1, RERUN_MAX_LIMIT), RERUN_DEFAULT_LIMIT)
    };
  }
  expect(command === 'verify-cleanup', 'Expected verify command');
  const byRun = Boolean(input && Object.hasOwn(input, 'runId'));
  exact(input, ['dryRun', byRun ? 'runId' : 'cacheKey']);
  return {dryRun: boolean(input.dryRun), ...(byRun ? {runId: runId(input.runId)} : {cacheKey: tagged(input.cacheKey, CACHE_KEY)})};
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

export function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

const hashJson = value => sha256Hex(canonicalJson(value));
const posixPath = value => value.split(path.sep).join('/');

function globExpression(pattern) {
  let patternRegex = '';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === '*' && pattern[i + 1] === '*') {
      if (pattern[i + 2] === '/' && (i === 0 || pattern[i - 1] === '/')) {
        patternRegex += '(?:[^/]+/)*';
        i += 2;
      } else {
        patternRegex += '[\\s\\S]*';
        i++;
      }
    } else if (char === '*') patternRegex += '[^/]*';
    else if (char === '?') patternRegex += '[^/]';
    else patternRegex += char.replace(/[|\\{}()[\]^$+.]/g, '\\$&');
  }
  return new RegExp('^' + patternRegex + '(?![\\s\\S])', 'u');
}

export function expandGlob(pattern, trackedPaths) {
  const matches = globExpression(pattern);
  return trackedPaths.filter(filename => matches.test(filename)).sort();
}

export function buildChildEnv({parentEnv = process.env, envNames = [], extraEnv = {}} = {}) {
  const entries = new Map();
  for (const key of [...ENV_BASE_ALLOWLIST, ...envNames]) {
    if (Object.hasOwn(parentEnv, key) && typeof parentEnv[key] === 'string') entries.set(key, parentEnv[key]);
  }
  for (const [key, value] of Object.entries(extraEnv)) entries.set(key, value);
  return Object.fromEntries([...entries].filter(([key]) => !BLOCKED_CHILD_ENV.has(key.toUpperCase())));
}

export function classifyLoad({platform, cpus, startLoadavg, samples = [], overlaps = [], declaredConcurrent = false, samplesMissing = false}) {
  if (samplesMissing || !Array.isArray(startLoadavg) || !startLoadavg.length || !Number.isFinite(startLoadavg[0]) || !cpus ||
      (platform === 'win32' && startLoadavg.every(value => value === 0))) return 'unknown';
  if (declaredConcurrent || overlaps.length || startLoadavg[0] / cpus >= LOAD_START_RATIO ||
      samples.some(sample => sample.loadavg[0] > cpus * LOAD_SAMPLE_RATIO)) return 'contended';
  return 'quiet';
}

function allow(payload) {
  return {decision: 'allow', code: 'ok', ...payload};
}

function storageError(error, extra = {}) {
  return new VerifyError('storage_unavailable', 'hold', {...extra, message: error.message});
}

function isSandboxError(error) {
  return /operation not permitted|permission denied|sandbox/i.test(error.message) || ['EACCES', 'EPERM'].includes(error.code);
}

function notImplemented() {
  return {decision: 'hold', code: 'verify_error', message: 'not implemented'};
}

function verifyErrorResult(error) {
  if (error instanceof VerifyError) return error.result;
  throw error;
}

export async function dispatchVerify(command, ctx) {
  if (command === 'verify-start') return verifyStart(ctx);
  if (command === 'verify-status') return verifyStatus(ctx);
  try {
    validateVerifyInput(command, ctx.input);
    return notImplemented();
  } catch (error) {
    return verifyErrorResult(error);
  }
}

function gitRunner(env, envNames = [], internalEnv = {}) {
  const allowed = buildChildEnv({parentEnv: env, envNames});
  const gitEnv = Object.fromEntries(Object.entries(allowed).filter(([key]) => !key.toUpperCase().startsWith('GIT_')));
  Object.assign(gitEnv, {GIT_OPTIONAL_LOCKS: '0', GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0'});
  return (cwd, args) => new Promise((resolve, reject) => {
    execFile('git', ['--no-pager', '-c', 'core.fsmonitor=false', ...args], {
      cwd, env: {...gitEnv, ...internalEnv}, shell: false, encoding: 'utf8', maxBuffer: RAW_STREAM_CAP
    }, (error, stdout, stderr) => {
      if (error && typeof error.code !== 'number') reject(error);
      else resolve({status: error?.code ?? 0, stdout, stderr});
    });
  });
}

async function gitOutput(run, cwd, args, accepted = [0]) {
  const result = await run(cwd, args);
  if (!accepted.includes(result.status)) throw Error(result.stderr.trim() || 'Git failed: ' + args.join(' '));
  return result.stdout;
}

async function getStorage(cwd, git) {
  try {
    const common = (await gitOutput(git, cwd, ['rev-parse', '--git-common-dir'])).replace(/\r?\n$/, '');
    const commonDir = fs.realpathSync(path.resolve(cwd, common));
    return {commonDir, store: path.join(commonDir, 'arc', 'verify')};
  } catch (error) {
    throw storageError(error);
  }
}

function makeDirectory(directory, recursive = false) {
  fs.mkdirSync(directory, {mode: 0o700, recursive});
}

function atomicWrite(filename, data) {
  const temp = filename + '.' + randomBytes(8).toString('hex') + '.tmp';
  const fd = fs.openSync(temp, 'wx', 0o600);
  try {
    try {
      fs.writeFileSync(fd, data);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temp, filename);
  } catch (error) {
    fs.rmSync(temp, {force: true});
    throw error;
  }
}

function writeJson(filename, data) {
  atomicWrite(filename, JSON.stringify(data) + '\n');
}

function readJson(filename) {
  const st = fs.lstatSync(filename);
  if (!st.isFile()) throw Error('Expected a regular JSON file');
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function appendJson(filename, data) {
  const fd = fs.openSync(filename, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_APPEND | (fs.constants.O_NOFOLLOW ?? 0), 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(data) + '\n');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function machineIdentity(store) {
  const filename = path.join(store, 'machine.json');
  let machine;
  let fd;
  try {
    fd = fs.openSync(filename, 'wx', 0o600);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  if (fd === undefined) machine = readJson(filename);
  else {
    try {
      machine = {randomId: randomUUID()};
      fs.writeFileSync(fd, JSON.stringify(machine) + '\n');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }
  if (!/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/.test(machine.randomId)) throw Error('Invalid machine identifier');
  const cpus = os.cpus();
  return hashJson([machine.randomId, os.hostname(), os.platform(), os.arch(), cpus[0]?.model ?? '', cpus.length,
    os.totalmem(), os.userInfo().uid, fs.realpathSync(os.homedir())]);
}

function makeRunId() {
  return nowIso().replace(/[:-]/g, '').replace(/\.\d{3}Z$/, 'Z') + '-' + randomBytes(4).toString('hex');
}

function executablePath(executable, env, cwd) {
  const candidates = path.isAbsolute(executable) ? [executable] :
    (env.PATH?.split(path.delimiter) ?? []).map(directory => path.resolve(cwd, directory, executable));
  for (const candidate of candidates) {
    const extensions = process.platform === 'win32' && !path.extname(candidate) ? ['', '.exe', '.com'] : [''];
    for (const extension of extensions) {
      try {
        const file = fs.realpathSync(candidate + extension);
        fs.accessSync(file, fs.constants.X_OK);
        if (fs.statSync(file).isFile()) return file;
      } catch (error) {
        if (!['ENOENT', 'EACCES', 'ENOTDIR', 'EPERM', 'ELOOP'].includes(error.code)) throw error;
      }
    }
  }
  throw new VerifyError('executable_not_found', 'deny', {message: 'Executable not found: ' + executable});
}

function normalizeWorktreePrefix(value, worktree) {
  if (value === worktree) return '{worktree}';
  const prefix = worktree + path.sep;
  return value.startsWith(prefix) ? '{worktree}/' + posixPath(value.slice(prefix.length)) : value;
}

function resolveTask(task, cwd, environment, trackedPaths, reporter, addReason, globLimit) {
  const env = {...environment, ...buildChildEnv({parentEnv: {}, extraEnv: task.env})};
  const worktreeLookup = !path.isAbsolute(task.executable) && env.PATH?.split(path.delimiter).some(directory =>
    directory.includes('{worktree}') || !path.isAbsolute(directory));
  const executable = worktreeLookup ? task.executable : executablePath(task.executable, env, cwd);
  const expandedFiles = [];
  const args = task.args.flatMap(arg => {
    if (typeof arg === 'string') return [arg.replaceAll('{arcNodeReporter}', () => reporter)];
    const files = expandGlob(arg.glob, trackedPaths);
    if (!files.length) throw new VerifyError('glob_empty', 'hold', {message: arg.glob});
    if (files.length > globLimit) addReason('glob_over_limit');
    expandedFiles.push(...files);
    return files;
  });
  return {...task, executable, args, env, expandedFiles};
}

async function readRevision(git, cwd, revision, addReason) {
  let commit;
  try {
    commit = (await gitOutput(git, cwd, ['rev-parse', '--verify', revision + '^{commit}'])).trim();
  } catch {
    throw new VerifyError('unknown_revision');
  }
  let tree = null;
  const entries = new Map();
  try {
    tree = (await gitOutput(git, cwd, ['rev-parse', '--verify', commit + '^{tree}'])).trim();
  } catch {
    addReason('git_metadata_unavailable');
  }
  try {
    for (const entry of (await gitOutput(git, cwd, ['ls-tree', '-rz', tree ?? commit])).split('\0')) {
      if (!entry) continue;
      const tab = entry.indexOf('\t');
      const [mode, type, oid] = entry.slice(0, tab).split(' ');
      entries.set(entry.slice(tab + 1), {mode, type, oid});
    }
  } catch {
    addReason('git_metadata_unavailable');
    return {commit, tree, entries: null};
  }
  return {commit, tree, entries};
}

export async function createSnapshot({cwd, head, runDir}, {env = process.env, envNames = [], beforeSnapshotWriteTree} = {}) {
  const index = path.join(runDir, 'snapshot.index');
  const git = gitRunner(env, envNames, {GIT_INDEX_FILE: index});
  const read = args => gitOutput(git, cwd, args);
  const writeIndex = async args => {
    try {
      return await read(args);
    } finally {
      // Git can replace the index with a new file created under its umask.
      if (pathStat(index)) fs.chmodSync(index, 0o600);
    }
  };
  try {
    await writeIndex(['read-tree', head]);
    await writeIndex(['add', '-A', '--', '.']);
    await beforeSnapshotWriteTree?.();
    const tree = (await writeIndex(['write-tree'])).trim();
    const date = (await read(['show', '-s', '--format=%cI', head])).trim();
    const commitGit = gitRunner(env, envNames, {
      GIT_AUTHOR_NAME: 'arc-verify', GIT_AUTHOR_EMAIL: 'arc-verify',
      GIT_COMMITTER_NAME: 'arc-verify', GIT_COMMITTER_EMAIL: 'arc-verify',
      GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date
    });
    const commit = (await gitOutput(commitGit, cwd, ['-c', 'commit.gpgSign=false', '-c', 'i18n.commitEncoding=UTF-8',
      'commit-tree', tree, '-p', head, '-m', 'arc-verify snapshot'])).trim();
    const names = (await read(['diff-tree', '-r', '--no-renames', '--name-status', '-z', head, tree])).split('\0');
    const included = [];
    for (let i = 0; i + 1 < names.length; i += 2) included.push({status: names[i], path: names[i + 1]});
    const ignored = (await read(['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z'])).split('\0').filter(Boolean);
    const submodules = (await read(['status', '--porcelain=v2', '-z', '--no-renames', '--ignore-submodules=none'])).split('\0')
      .map(record => /^1 \S+ S.([M.][U.])(?: \S+){5} ([\s\S]+)$/.exec(record))
      .filter(record => record && record[1] !== '..')
      .map(record => record[2]);
    return {commit, tree, included, excluded: {ignored, submodules}};
  } catch (error) {
    throw new VerifyError('snapshot_failed', 'hold', {runId: path.basename(runDir), message: error.message});
  }
}

async function worktreeRevisionFiles(git, runCwd, input) {
  if (input.seedFiles.length || input.commands.some(task => task.args.some(arg => typeof arg !== 'string'))) {
    // Git can still enumerate the isolated index when tree inspection is unavailable.
    const paths = (await gitOutput(git, runCwd, ['ls-files', '-z', '--cached'])).split('\0').filter(Boolean);
    return new Map(paths.map(filename => [filename, null]));
  }
  return new Map();
}

function readSeeds(input, cwd, entries) {
  const base = fs.realpathSync(cwd);
  return input.seedFiles.map(({source, dest}) => {
    const overlaps = other => other === dest || other.startsWith(dest + '/') || dest.startsWith(other + '/');
    if ([...entries.keys()].some(overlaps)) throw new VerifyError('seed_conflicts_tracked');
    expect(!input.seedFiles.some(seed => seed.dest !== dest && overlaps(seed.dest)), 'Seed destinations overlap');
    let data;
    try {
      const resolved = fs.realpathSync(source);
      if (!within(base, resolved) || resolved.split(path.sep).some(part => part.toLowerCase() === '.git') ||
          !fs.statSync(resolved).isFile()) throw Error('Seed source must be a regular file in the checkout');
      data = fs.readFileSync(resolved);
    } catch (error) {
      throw new VerifyError('invalid_request', 'deny', {message: error.message});
    }
    return {dest, data};
  });
}

function pathStat(filename) {
  try {
    return fs.lstatSync(filename);
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error.code)) return null;
    throw error;
  }
}

function pathDigest(filename, root, relative) {
  const stat = pathStat(filename);
  if (!stat) return 'absent';
  const resolved = fs.realpathSync(filename);
  if (!within(root, resolved)) throw Error('Hash input escapes its root');
  if (stat.isSymbolicLink()) return sha256Hex(posixPath(fs.readlinkSync(filename)));
  if (stat.isFile()) {
    const bytes = fs.readFileSync(filename);
    return sha256Hex(Buffer.concat([Buffer.from(relative + '\0' + stat.mode.toString(8) + '\0'), bytes]));
  }
  if (!stat.isDirectory()) throw Error('Hash input is not a regular file or directory');
  const children = fs.readdirSync(filename).sort().map(name => {
    const child = relative === '.' ? name : relative + '/' + name;
    return [name, pathDigest(path.join(filename, name), root, child)];
  });
  return hashJson(children);
}

function attemptKeyInput(addReason, reason, read) {
  try {
    return read();
  } catch {
    addReason(reason);
    return null;
  }
}

function dependencyDigest(filename) {
  const stat = pathStat(filename);
  if (!stat) return 'absent';
  const root = stat.isDirectory() ? fs.realpathSync(filename) : fs.realpathSync(path.dirname(filename));
  return pathDigest(filename, root, path.basename(filename));
}

function dependences(paths, entries, cwd, addReason) {
  const expected = new Set(paths.filter(filename => within(cwd, filename)).map(filename => posixPath(path.relative(cwd, filename))));
  const blobs = [...entries].filter(([filename, entry]) =>
    entry?.type === 'blob' && (LOCKFILES.has(path.posix.basename(filename)) || expected.has(filename) ||
      [...expected].some(directory => filename.startsWith(directory + '/')))).map(([filename, entry]) => [filename, entry.oid]);
  return {
    blobs,
    external: paths.map(filename => [posixPath(filename), attemptKeyInput(addReason, 'path_hash_failed', () => dependencyDigest(filename))])
  };
}

function tempIdentity(directory) {
  const real = fs.realpathSync(directory);
  return {path: posixPath(real), type: fs.statfsSync(real).type};
}

async function readGitMetadata(git, cwd) {
  const version = (await gitOutput(git, cwd, ['--version'])).trim();
  const result = await git(cwd, ['config', '--get-regexp', '^filter\\.']);
  if (result.status !== 0 && !(result.status === 1 && !result.stderr && !result.stdout)) {
    throw Error(result.stderr || 'Failed to read Git filter configuration');
  }
  return {version, filterConfig: sha256Hex(result.stdout)};
}

function readRuntimeIdentity() {
  return {
    files: Object.fromEntries(RUNTIME_FILES.map(name => [name, sha256Hex(fs.readFileSync(new URL('./' + name, import.meta.url)))])),
    parserSchemaVersion: PARSER_SCHEMA_VERSION
  };
}

function materializeTask(task, worktree) {
  const replace = value => value.replaceAll('{worktree}', () => worktree);
  return {
    ...task, args: task.args.map(replace), cwd: path.normalize(replace(task.cwd)),
    env: Object.fromEntries(Object.entries(task.env).map(([key, value]) => [key, replace(value)]))
  };
}

function runChild(task, {rawCap = RAW_STREAM_CAP, killGraceMs = KILL_GRACE_MS, onSpawn} = {}) {
  return new Promise((resolve, reject) => {
    const groupKill = process.platform !== 'win32';
    const started = performance.now();
    const child = spawn(task.executable, task.args, {
      cwd: task.cwd, env: task.env, shell: false, detached: groupKill, stdio: ['ignore', 'pipe', 'pipe']
    });
    const buffers = {stdout: [], stderr: []};
    let remaining = rawCap;
    let truncated = false;
    let timedOut = false;
    let close;
    let grace;
    let error;
    const send = signal => {
      try {
        if (groupKill) return process.kill(-child.pid, signal);
        return child.kill(signal);
      } catch (failure) {
        if (failure.code !== 'ESRCH') error ??= failure;
        return false;
      }
    };
    const capture = stream => data => {
      if (data.length > remaining) truncated = true;
      if (remaining > 0) buffers[stream].push(Buffer.from(data.subarray(0, remaining)));
      remaining = Math.max(remaining - data.length, 0);
    };
    child.stdout.on('data', capture('stdout'));
    child.stderr.on('data', capture('stderr'));
    child.on('error', failure => { error ??= failure; });
    if (child.pid !== undefined) {
      try {
        onSpawn?.({pid: child.pid, groupKill});
      } catch (failure) {
        error ??= failure;
      }
    }
    const timeout = setTimeout(() => {
      if (!child.pid) return;
      timedOut = true;
      if (send('SIGTERM')) {
        grace = setTimeout(() => {
          send('SIGKILL');
          grace = undefined;
          if (close) finish();
        }, killGraceMs);
      }
    }, task.timeoutMs);
    function finish() {
      clearTimeout(timeout);
      clearTimeout(grace);
      if (error) reject(error);
      else resolve({
        buffers: {stdout: Buffer.concat(buffers.stdout), stderr: Buffer.concat(buffers.stderr)},
        exit: {...close, timedOut}, groupKill, truncated, wallMs: performance.now() - started
      });
    }
    child.once('close', (code, signal) => {
      close = {code, signal};
      if (!grace || !groupKill || !send(0)) finish();
    });
  });
}

function versionCommand(task, {cwd, env, timeoutMs}, reporter) {
  return {
    executable: executablePath(task.executable, env, cwd),
    args: task.args.map(arg => arg.replaceAll('{arcNodeReporter}', () => reporter)),
    cwd, env, timeoutMs
  };
}

async function versionDigests(tasks, {cwd, worktree, addReason, internal}) {
  const versions = [];
  for (const task of tasks) {
    const runnable = worktree ? materializeTask({...task, cwd: '{worktree}'}, worktree) : {...task, cwd};
    try {
      const result = await runChild(runnable, internal);
      if (result.exit.code !== 0 || result.exit.timedOut || result.truncated) addReason('tool_version_failed');
      const summarize = buffer => worktree
        ? buffer.toString('utf8').split('\n').map(line => normalizeWorktreePrefix(line, worktree)).join('\n')
        : buffer;
      versions.push({
        executable: posixPath(task.executable), args: task.args, exitCode: result.exit.code,
        stdout: sha256Hex(summarize(result.buffers.stdout)), stderr: sha256Hex(summarize(result.buffers.stderr))
      });
    } catch {
      addReason('tool_version_failed');
      versions.push({executable: posixPath(task.executable), args: task.args, exitCode: null});
    }
  }
  return versions;
}

function phase1Task(task, worktree) {
  const executable = worktree ? normalizeWorktreePrefix(task.executable, worktree) : task.executable;
  return {...task, executable: posixPath(executable)};
}

async function statusEntries(git, worktree, all = false) {
  const args = ['status', '--porcelain=v1', '-z', '--ignored'];
  if (all) args.push('--untracked-files=all');
  const records = (await gitOutput(git, worktree, args)).split('\0');
  const entries = [];
  for (let i = 0; i < records.length; i++) {
    if (!records[i]) continue;
    const status = records[i].slice(0, 2);
    const filename = records[i].slice(3);
    entries.push({status, path: filename, ...(/[RC]/.test(status) ? {from: records[++i]} : {})});
  }
  return entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

function topLevelIgnored(entries) {
  return [...new Set(entries.filter(entry => entry.status === '!!').map(entry => entry.path.split('/')[0]))].sort();
}

function matchingWorktreePaths(pattern, root, limit, addReason) {
  if (!/[*?]/.test(pattern)) return [pattern];
  const prefix = pattern.slice(0, pattern.search(/[*?]/)).split('/').slice(0, -1).join('/');
  const start = path.resolve(root, prefix);
  const matches = globExpression(pattern);
  const found = [];
  function visit(directory, relative) {
    if (!within(root, fs.realpathSync(directory))) throw Error('Glob escapes its root');
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      if (entry.name.toLowerCase() === '.git') continue;
      const filename = relative ? relative + '/' + entry.name : entry.name;
      if (matches.test(filename)) {
        found.push(filename);
        if (found.length > limit) {
          addReason('glob_over_limit');
          return;
        }
      }
      if (entry.isDirectory()) visit(path.join(directory, entry.name), filename);
      if (found.length > limit) return;
    }
  }
  if (fs.existsSync(start)) visit(start, prefix);
  return found.sort();
}

function artifactDigests(patterns, worktree, limit, addReason) {
  const paths = new Set();
  for (const pattern of patterns) {
    const matches = attemptKeyInput(addReason, 'path_hash_failed', () => matchingWorktreePaths(pattern, worktree, limit, addReason));
    for (const filename of matches?.length ? matches : [pattern]) paths.add(filename);
  }
  return [...paths].sort().map(relative => [relative, attemptKeyInput(addReason, 'path_hash_failed', () => {
    const filename = path.resolve(worktree, relative);
    if (relative !== '.') return pathDigest(filename, worktree, relative);
    const children = fs.readdirSync(worktree).filter(name => name !== '.git').sort();
    return hashJson(children.map(name => [name, pathDigest(path.join(worktree, name), worktree, name)]));
  })]);
}

function readResultFiles(resultPath, id, worktree, raw, limit, addReason, runId) {
  const paths = matchingWorktreePaths(resultPath, worktree, limit, addReason);
  const files = [];
  for (const relative of paths) {
    const filename = path.join(worktree, relative);
    let bytes;
    try {
      const resolved = fs.realpathSync(filename);
      if (!within(worktree, resolved) || !fs.statSync(resolved).isFile()) continue;
      bytes = fs.readFileSync(resolved);
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
      continue;
    }
    const copy = path.join(raw, id + '.results', relative);
    try {
      makeDirectory(path.dirname(copy), true);
      atomicWrite(copy, bytes);
    } catch (error) {
      throw storageError(error, {runId});
    }
    files.push({text: bytes.toString('utf8')});
  }
  return files;
}

function cacheEligible(result) {
  return Array.isArray(result?.commands) && result.commands.length > 0 && result.commands.every(({summary}) =>
    summary && !summary.timedOut && Array.isArray(summary.incomplete) && summary.incomplete.length === 0);
}

async function cacheLookup(store, run) {
  if (!run.cacheable || run.role !== 'baseline') return null;
  const dir = path.join(store, 'cache', run.cacheKey);
  const filename = path.join(dir, 'record.json');
  try {
    await inspectPath(dir, {missing: true, directory: true});
    if (!pathStat(filename)) return null;
    const record = readJson(filename);
    if (record.cacheKey !== run.cacheKey || !RUN_ID.test(record.runId) || !CACHE_KEY.test(record.resultSha256)) throw Error('Invalid record');
    if (record.loadClass !== 'quiet') return null;
    const previousDir = path.join(store, 'runs', record.runId);
    await inspectPath(previousDir, {directory: true});
    const previous = readJson(path.join(previousDir, 'run.json'));
    if (previous.state !== 'succeeded' || previous.role !== 'baseline' || previous.load?.class !== 'quiet' ||
        !previous.cacheable || previous.cacheKey !== run.cacheKey) return null;
    const resultFile = path.join(previousDir, 'result.json');
    if (!fs.lstatSync(resultFile).isFile()) throw Error('Expected a regular result file');
    const bytes = fs.readFileSync(resultFile);
    if (sha256Hex(bytes) !== record.resultSha256) throw Error('Result hash mismatch');
    const result = JSON.parse(bytes.toString('utf8'));
    if (!cacheEligible(result)) return null;
    return {runId: record.runId, bytes, result, resultSha256: record.resultSha256};
  } catch {
    run.cacheMissReason = 'cache_corrupt';
    return null;
  }
}

async function validateStorePath(directory, {create = false} = {}) {
  try {
    await inspectPath(directory, {missing: true, directory: true});
    if (create) makeDirectory(directory, true);
  } catch (error) {
    throw storageError(error);
  }
}

async function recordHistory(store, run, resultSha256, result) {
  const cacheDir = path.join(store, 'cache', run.cacheKey ?? run.cacheKeyPhase1);
  const byPhase1 = path.join(store, 'cache', 'by-phase1');
  await validateStorePath(cacheDir, {create: true});
  await validateStorePath(byPhase1, {create: true});
  const entry = {runId: run.runId, role: run.role, state: run.state, loadClass: run.load.class, resultSha256};
  appendJson(path.join(cacheDir, 'history.jsonl'), entry);
  appendJson(path.join(byPhase1, run.cacheKeyPhase1 + '.jsonl'), {...entry, cacheKey: run.cacheKey});
  if (run.role === 'baseline' && run.state === 'succeeded' && run.cacheable && !run.cacheHit &&
      run.load.class === 'quiet' && cacheEligible(result)) {
    writeJson(path.join(cacheDir, 'record.json'), {
      cacheKey: run.cacheKey, runId: run.runId, resultSha256, loadClass: run.load.class, createdAt: nowIso()
    });
  }
}

function statusPayload(run, heartbeat, result) {
  return allow({
    runId: run.runId, role: run.role ?? null, state: run.state, revision: run.revision ?? null,
    commit: run.commit ?? null, tree: run.tree ?? null, cacheKeyPhase1: run.cacheKeyPhase1 ?? null,
    cacheKey: run.cacheKey ?? null, cacheable: run.cacheable ?? null, uncacheableReasons: run.uncacheableReasons ?? [],
    cacheHit: run.cacheHit ?? false, ...(run.reusedFrom ? {reusedFrom: run.reusedFrom} : {}),
    ...(run.cacheMissReason ? {cacheMissReason: run.cacheMissReason} : {}),
    ...(run.snapshot ? {snapshot: run.snapshot} : {}),
    queuedBehind: run.queuedBehind ?? [], worktree: run.worktree ?? null, phases: run.phases ?? [],
    load: run.load ?? null, heartbeatAt: heartbeat?.at ?? null, pid: run.pid ?? heartbeat?.pid ?? null,
    children: (run.children ?? []).filter(child => run.state !== 'unknown' || !child.endedAt),
    ...(run.failure ? {failure: run.failure} : {}),
    ignoredAfterPrepare: run.ignoredAfterPrepare ?? [],
    summary: result ? {commands: result.commands.map(({id, expandedFiles, summary}) => ({
      id, expandedFiles, exitCode: summary.exitCode, signal: summary.signal, timedOut: summary.timedOut,
      wallMs: summary.wallMs, tests: summary.counts, incomplete: summary.incomplete
    }))} : null
  });
}

function readHeartbeat(dir) {
  try { return readJson(path.join(dir, 'heartbeat.json')); } catch { return null; }
}

function heartbeatAlive(heartbeat, now, staleMs = HEARTBEAT_STALE_MS) {
  const at = Date.parse(heartbeat?.at);
  return Number.isFinite(at) && now - at <= staleMs;
}

function readRunStatus(dir, runId, now, staleMs) {
  if (!pathStat(dir)) throw new VerifyError('unknown_run');
  const heartbeat = readHeartbeat(dir);
  const run = readStoredRun(dir, runId);
  let result = null;
  if (!['queued', 'preparing', 'running', 'succeeded', 'failed'].includes(run?.state)) {
    return statusPayload({runId, state: 'unknown'}, heartbeat, null);
  }
  if (run.state === 'succeeded') {
    try {
      const saved = readJson(path.join(dir, 'result.json'));
      if (Array.isArray(saved.commands) && saved.commands.every(command => command?.summary)) result = saved;
    } catch {}
  } else if (!terminal(run.state) && !heartbeatAlive(heartbeat, now, staleMs)) {
    run.state = 'unknown';
    if (run.load) run.load.class = 'unknown';
  }
  return statusPayload(run, heartbeat, result);
}

export async function verifyStatus({cwd, input, env = process.env, now = Date.now}, internal = {}) {
  try {
    const {runId, waitMs} = validateVerifyInput('verify-status', input);
    const {store} = await getStorage(cwd, gitRunner(env));
    const dir = path.join(store, 'runs', runId);
    if (!pathStat(dir)) throw new VerifyError('unknown_run');
    await validateStorePath(dir);
    const expires = performance.now() + waitMs;
    const clock = typeof now === 'function' ? now : () => Number(now);
    for (;;) {
      const status = readRunStatus(dir, runId, clock(), internal.heartbeatStaleMs);
      const remaining = expires - performance.now();
      if (terminal(status.state) || status.state === 'unknown' || remaining <= 0) return status;
      await delay(Math.min(remaining, 200));
    }
  } catch (error) {
    return verifyErrorResult(error);
  }
}

class RunFailure extends Error {
  constructor(code, details) {
    super(code + (details ? ': ' + details : ''));
    this.code = code;
  }
}

async function createWorktree({git, cwd, commonDir, run, persist, internal}) {
  let worktree;
  let noHooks;
  try {
    const repoHash = sha256Hex(commonDir).slice(0, 16);
    const temporary = fs.realpathSync(os.tmpdir());
    const parent = path.join(temporary, 'arc-verify', repoHash);
    await inspectPath(parent, {missing: true, directory: true});
    makeDirectory(parent, true);
    const runDir = path.join(parent, run.runId);
    makeDirectory(runDir);
    worktree = path.join(runDir, 'wt');
    noHooks = path.join(runDir, 'no-hooks');
    makeDirectory(noHooks);
    writeJson(path.join(runDir, 'owner.json'), {tool: 'arc-verify', runId: run.runId, repoHash, commonDir, createdAt: nowIso()});
  } catch (error) {
    throw storageError(error, {runId: run.runId});
  }
  run.worktree = {path: worktree, state: 'creating'};
  persist();
  try {
    await gitOutput(git, cwd, ['-c', 'core.hooksPath=' + noHooks, 'worktree', 'add', '--detach', '--lock', '--reason',
      'arc-verify:' + run.runId, worktree, run.commit]);
  } catch (error) {
    if (isSandboxError(error)) {
      throw new VerifyError('host_sandbox_blocked', 'hold', {runId: run.runId, message: error.message});
    }
    throw new RunFailure('worktree_create_failed', error.message);
  }
  fs.chmodSync(worktree, 0o700);
  run.worktree.path = fs.realpathSync(worktree);
  run.worktree.state = 'retained';
  await internal.afterCreate?.(run.worktree.path);
  try {
    if ((await gitOutput(git, worktree, ['rev-parse', 'HEAD'])).trim() !== run.commit) throw new RunFailure('worktree_oid_mismatch');
    if ((await statusEntries(git, worktree, true)).length) throw new RunFailure('worktree_unclean');
  } catch (error) {
    if (error instanceof RunFailure) throw error;
    throw new RunFailure('worktree_unclean', error.message);
  }
  return run.worktree.path;
}

async function seedWorktree(seeds, worktree, git) {
  if (!seeds.length) return;
  try {
    for (const {dest, data} of seeds) {
      const filename = path.join(worktree, dest);
      if (pathStat(filename)) throw Error('Seed destination exists');
      makeDirectory(path.dirname(filename), true);
      atomicWrite(filename, data);
    }
    const expected = seeds.map(seed => seed.dest).sort();
    const entries = await statusEntries(git, worktree, true);
    if (entries.some(({status}) => status !== '??') || canonicalJson(entries.map(({path}) => path)) !== canonicalJson(expected)) {
      throw Error('Worktree does not contain only the requested untracked seeds');
    }
  } catch (error) {
    throw new RunFailure('worktree_unclean', error.message);
  }
}

function resolveTaskCwd(cwd, worktree, runId) {
  try {
    const realCwd = fs.realpathSync(cwd);
    expect(within(worktree, realCwd) && fs.statSync(realCwd).isDirectory(), 'Command cwd must be inside the worktree');
    return realCwd;
  } catch (error) {
    throw new VerifyError('invalid_request', 'deny', {runId, message: error.message});
  }
}

function bindWorktreeExecutable(task, worktree, runId) {
  if (path.isAbsolute(task.executable)) return task;
  const runnable = materializeTask(task, worktree);
  const cwd = resolveTaskCwd(runnable.cwd, worktree, runId);
  return {...task, executable: executablePath(task.executable, runnable.env, cwd)};
}

async function runTask(task, {worktree, phase, id, run, raw, persist, internal}) {
  const runnable = materializeTask(task, worktree);
  runnable.cwd = resolveTaskCwd(runnable.cwd, worktree, run.runId);
  let result;
  let activeChild;
  try {
    result = await runChild(runnable, {
      ...internal, onSpawn: child => {
        activeChild = {...child, phase, id};
        run.children.push(activeChild);
        persist();
      }
    });
  } catch (error) {
    if (error instanceof VerifyError) throw error;
    throw new RunFailure(phase === 'prepare' ? 'prepare_failed' : 'command_spawn_failed', error.message);
  } finally {
    if (activeChild) activeChild.endedAt = nowIso();
  }
  try {
    for (const [stream, bytes] of Object.entries(result.buffers)) atomicWrite(path.join(raw, id + '.' + stream), bytes);
  } catch (error) {
    throw storageError(error, {runId: run.runId});
  }
  return result;
}

function makeLoad(input, loadavg) {
  const load = {cpus: os.cpus().length, start: {loadavg: loadavg()}, samples: [], overlaps: [],
    declaredConcurrent: input.declaredConcurrent};
  refreshLoadClass(load);
  return load;
}

function refreshLoadClass(load) {
  load.class = classifyLoad({...load, platform: os.platform(), startLoadavg: load.start.loadavg});
}

function queueLockState(filename, hostname) {
  let stat;
  let owner;
  try {
    stat = fs.lstatSync(filename, {bigint: true});
    owner = readJson(filename);
  } catch (error) {
    return error.code === 'ENOENT' ? {} : {reason: 'Queue lock is unreadable: ' + error.message};
  }
  if (!owner || !Number.isSafeInteger(owner.pid) || owner.pid <= 0 || typeof owner.hostname !== 'string' ||
      !owner.hostname || typeof owner.createdAt !== 'string' || !Number.isFinite(Date.parse(owner.createdAt))) {
    return {reason: 'Queue lock owner metadata is unreadable'};
  }
  if (owner.hostname !== hostname) return {reason: 'Queue lock owner is on another host: ' + owner.hostname};
  try {
    process.kill(owner.pid, 0);
    return {reason: 'Queue lock owner is still running: ' + owner.pid};
  } catch (error) {
    if (error.code !== 'ESRCH') return {reason: 'Queue lock owner could not be verified: ' + error.message};
    const identity = hashJson([String(stat.dev), String(stat.ino), String(stat.ctimeNs), owner]).slice(0, 24);
    return {identity};
  }
}

function publishQueueOwner(filename, hostname) {
  const temporary = filename + '.' + randomBytes(8).toString('hex') + '.tmp';
  writeJson(temporary, {pid: process.pid, hostname, createdAt: nowIso()});
  try {
    // Publish only after the complete owner JSON has been flushed.
    fs.linkSync(temporary, filename);
    return true;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    return false;
  } finally {
    try { fs.unlinkSync(temporary); } catch { /* Leftover staging files do not participate in locking. */ }
  }
}

function reclaimQueueLock(filename, identity, hostname) {
  const deadClaims = [];
  for (let attempt = 0; ; attempt++) {
    // One recoverer can inspect and unlink this generation. A dead recoverer leaves
    // its slot behind so contenders agree on the next exclusive claim.
    const claim = filename + '.recover-' + identity + '-' + attempt;
    const previous = queueLockState(claim, hostname);
    if (previous.identity) {
      deadClaims.push(claim);
      continue;
    }
    if (previous.reason) return previous.reason;
    if (!publishQueueOwner(claim, hostname)) return 'Queue lock recovery is in progress';
    try {
      if (queueLockState(filename, hostname).identity === identity) fs.unlinkSync(filename);
      return null;
    } finally {
      for (const deadClaim of deadClaims) fs.rmSync(deadClaim, {force: true});
      fs.unlinkSync(claim);
    }
  }
}

async function withQueueLock(store, action, waitMs = HEARTBEAT_STALE_MS) {
  const filename = path.join(store, 'queue.lock');
  const hostname = os.hostname();
  const deadline = performance.now() + waitMs;
  for (;;) {
    let reason;
    try {
      const owner = queueLockState(filename, hostname);
      if (owner.identity) reason = reclaimQueueLock(filename, owner.identity, hostname);
      else if (owner.reason) reason = owner.reason;
      else if (publishQueueOwner(filename, hostname)) break;
    } catch (error) {
      throw storageError(error);
    }
    const remaining = deadline - performance.now();
    if (remaining <= 0 && reason) throw storageError(Error(reason));
    if (reason) await delay(Math.min(25, remaining));
  }
  try {
    return await action();
  } finally {
    try {
      fs.unlinkSync(filename);
    } catch (error) {
      throw storageError(error);
    }
  }
}

function readStoredRun(dir, id) {
  try {
    const run = readJson(path.join(dir, 'run.json'));
    if (run.runId === id) return run;
  } catch {}
  return null;
}

function runIds(runsDir) {
  return fs.readdirSync(runsDir, {withFileTypes: true})
    .filter(entry => entry.isDirectory() && RUN_ID.test(entry.name)).map(entry => entry.name).sort();
}

function activeRun(runsDir, id, now, staleMs) {
  const dir = path.join(runsDir, id);
  const run = readStoredRun(dir, id);
  return ['queued', 'preparing', 'running'].includes(run?.state) && heartbeatAlive(readHeartbeat(dir), now, staleMs);
}

function recordOverlaps(run, runsDir, staleMs) {
  const now = Date.now();
  for (const id of runIds(runsDir)) {
    if (id === run.runId || run.load.overlaps.includes(id)) continue;
    const dir = path.join(runsDir, id);
    const other = readStoredRun(dir, id);
    if (!other?.executionStartedAt || (run.executionEndedAt && other.executionStartedAt >= run.executionEndedAt)) continue;
    const heartbeat = other.executionEndedAt ? null : readHeartbeat(dir);
    const overlaps = other.executionEndedAt
      ? other.executionEndedAt > run.executionStartedAt
      : heartbeatAlive(heartbeat, now, staleMs) || heartbeat?.at > run.executionStartedAt;
    if (overlaps) run.load.overlaps.push(id);
  }
  run.load.overlaps.sort();
}

function resolveRunCommands(input, entries, {cwd, environment, reporter, globLimit, addReason}) {
  const trackedPaths = [...entries.keys()];
  return input.commands.map(task => resolveTask(task, cwd, environment, trackedPaths, reporter, addReason, globLimit));
}

async function preflight({cwd, input, environment, git, store, revision, internal, addReason}) {
  const {envNames, toolVersionCommands, dependencyPaths} = input.keyInputs;
  const keyEnvironment = Object.fromEntries([...new Set([...Object.keys(environment), ...envNames])]
    .filter(key => !BLOCKED_CHILD_ENV.has(key.toUpperCase()))
    .map(key => [key, Object.hasOwn(environment, key) ? environment[key] : 'absent']));
  const absentEnvNames = Object.keys(keyEnvironment).filter(key => !Object.hasOwn(environment, key));
  const globLimit = internal.globLimit ?? GLOB_FILE_LIMIT;
  const reporter = fs.realpathSync(REPORTER);
  const prep = input.prepare.map(task => resolveTask(task, cwd, environment, [], reporter, addReason, globLimit));
  const commands = revision.entries ? resolveRunCommands(input, revision.entries, {cwd, environment, reporter, globLimit, addReason}) : null;
  const seeds = revision.entries ? readSeeds(input, cwd, revision.entries) : null;
  const versionTasks = toolVersionCommands.map(task => versionCommand(task, {
    cwd, env: environment, timeoutMs: internal.toolVersionTimeoutMs ?? TOOL_VERSION_TIMEOUT_MS
  }, reporter));
  const inWorktree = task => task.args.some(arg => arg.includes('{worktree}'));
  const deferredVersions = versionTasks.filter(inWorktree);
  await validateStorePath(store, {create: true});
  const versions = await versionDigests(versionTasks.filter(task => !inWorktree(task)), {cwd: store, addReason, internal});
  const dependencies = dependences(dependencyPaths, revision.entries ?? new Map(), cwd, addReason);
  const tempDirectories = new Set([environment.TMPDIR ?? os.tmpdir(),
    ...[...input.commands, ...input.prepare].map(task => task.env.TMPDIR).filter(value => value !== undefined && !value.includes('{worktree}'))]);
  const tmpdir = [...tempDirectories].map(directory =>
    attemptKeyInput(addReason, 'tmpdir_unavailable', () => tempIdentity(path.resolve(cwd, directory))));
  const gitMetadata = await readGitMetadata(git, cwd).catch(() => {
    addReason('git_metadata_unavailable');
    return null;
  });
  const phase1 = {
    commit: revision.commit, tree: revision.tree, seeds: seeds?.map(seed => [seed.dest, sha256Hex(seed.data)]) ?? input.seedFiles,
    os: {platform: os.platform(), arch: os.arch(), release: os.release()}, nodeVersion: process.version,
    toolVersionCommands: versions, dependencies, env: keyEnvironment, absentEnvNames, tmpdir,
    hostPlatform: input.hostPlatform, executionEnvironment: input.executionEnvironment, sandboxMode: input.sandboxMode,
    git: gitMetadata, runtime: readRuntimeIdentity()
  };
  return {prep, seeds, commands, deferredVersions, phase1, keyEnvironment, globLimit};
}

function phase1Key(phase1, commands, prep, worktree) {
  return hashJson({
    ...phase1, commands: commands.map(task => phase1Task(task, worktree)),
    prepare: prep.map(task => phase1Task(task, worktree))
  });
}

export async function verifyStart({cwd, input, env = process.env}, internal = {}) {
  try {
    input = validateVerifyInput('verify-start', input);
    return await startRun({cwd: path.resolve(cwd), input, env, internal});
  } catch (error) {
    return verifyErrorResult(error);
  }
}

async function startRun({cwd, input, env, internal}) {
  const reasons = new Set();
  const addReason = reason => reasons.add(reason);
  if (input.sandboxMode === 'unknown') addReason('sandbox_mode_unknown');
  const {envNames} = input.keyInputs;
  const git = gitRunner(env, envNames);
  const environment = buildChildEnv({parentEnv: env, envNames});
  const {store, commonDir} = await getStorage(cwd, git);
  let revision = await readRevision(git, cwd, input.revision, addReason);
  const runId = makeRunId();
  const runsDir = path.join(store, 'runs');
  const runDir = path.join(runsDir, runId);
  async function createRunDir() {
    await validateStorePath(runsDir, {create: true});
    try {
      makeDirectory(runDir);
      makeDirectory(path.join(runDir, 'raw'));
    } catch (error) {
      throw storageError(error, {runId});
    }
  }
  let snapshot;
  if (input.snapshotWorkingTree) {
    if ((await gitOutput(git, cwd, ['rev-parse', '--verify', '-q', 'HEAD'], [0, 1])).trim() !== input.revision) {
      throw new VerifyError('revision_mismatch');
    }
    await createRunDir();
    snapshot = await createSnapshot({cwd, head: revision.commit, runDir}, {env, envNames,
      beforeSnapshotWriteTree: internal.beforeSnapshotWriteTree});
    revision = await readRevision(git, cwd, snapshot.commit, addReason);
  }
  const context = await preflight({cwd, input, environment, git, store, revision, internal, addReason});
  if (!snapshot) await createRunDir();
  const {prep, seeds, commands, deferredVersions, phase1, keyEnvironment, globLimit} = context;
  const needsWorktreeKey = !commands || [...prep, ...commands].some(task => !path.isAbsolute(task.executable));
  const hasPhase2 = prep.length > 0 || deferredVersions.length > 0 || input.keyInputs.artifactPaths.length > 0;
  const execution = {cwd, prep, seeds, commands, deferredVersions, phase1, globLimit, needsWorktreeKey, hasPhase2};
  const {run, heartbeat} = await withQueueLock(store, async () => {
    const machineId = attemptKeyInput(addReason, 'machine_identity_unavailable', () => machineIdentity(store));
    phase1.machineId = machineId;
    const cacheKeyPhase1 = needsWorktreeKey ? null : phase1Key(phase1, commands, prep);
    const now = Date.now();
    const queuedBehind = runIds(runsDir).filter(id => activeRun(runsDir, id, now, internal.heartbeatStaleMs));
    const run = {
      schemaVersion: 1, runId, role: input.role, state: queuedBehind.length ? 'queued' : 'preparing',
      revision: input.revision, commit: revision.commit, tree: revision.tree, ...(snapshot ? {snapshot} : {}),
      input, cacheKeyPhase1, cacheKey: hasPhase2 ? null : cacheKeyPhase1,
      cacheable: !reasons.size, uncacheableReasons: [...reasons], cacheHit: 'pending', worktree: null,
      phases: [], load: makeLoad(input, internal.loadavg ?? os.loadavg), pid: process.pid, children: [],
      ignoredAfterPrepare: [], queuedBehind, keyEnvironment, machineId
    };
    if (input.detach) {
      // Pin the preflight inputs so detach does not repeat tool probes or reread seed files.
      run.runner = {...execution, seeds: seeds?.map(({dest, data}) => ({dest, data: data.toString('base64')})) ?? null};
      const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--run', runDir],
        {detached: true, stdio: 'ignore', shell: false, env: environment, cwd: runDir});
      try {
        await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
      } catch (error) {
        if (isSandboxError(error)) throw new VerifyError('host_sandbox_blocked', 'hold', {runId, message: error.message});
        throw error;
      }
      child.unref();
      run.pid = child.pid;
    }
    const heartbeat = {at: nowIso(), pid: run.pid};
    try {
      writeJson(path.join(runDir, 'heartbeat.json'), heartbeat);
      writeJson(path.join(runDir, 'run.json'), run);
    } catch (error) {
      throw storageError(error, {runId});
    }
    return {run, heartbeat};
  }, internal.queueLockWaitMs);

  if (input.detach) return statusPayload(run, heartbeat, null);
  return executeRun({run, runDir, store, commonDir, git, environment, execution, internal});
}

export async function runRunner(runDir) {
  if (!path.isAbsolute(runDir) || !RUN_ID.test(path.basename(runDir)) || path.basename(path.dirname(runDir)) !== 'runs') {
    throw Error('Invalid runner directory');
  }
  await validateStorePath(runDir);
  const store = path.dirname(path.dirname(runDir));
  // The parent registers the child PID before releasing the admission lock.
  const run = await withQueueLock(store, () => readStoredRun(runDir, path.basename(runDir)));
  if (run?.pid !== process.pid || !run.runner || !['queued', 'preparing'].includes(run.state)) throw Error('Invalid runner handoff');
  const execution = run.runner;
  delete run.runner;
  execution.seeds = execution.seeds?.map(({dest, data}) => ({dest, data: Buffer.from(data, 'base64')})) ?? null;
  const {envNames} = run.input.keyInputs;
  const git = gitRunner(process.env, envNames);
  const environment = buildChildEnv({envNames});
  const commonDir = path.dirname(path.dirname(store));
  await executeRun({run, runDir, store, commonDir, git, environment, execution, internal: {}});
}

async function executeRun({run, runDir, store, commonDir, git, environment, execution, internal}) {
  const {runId, input} = run;
  const {cwd, prep, seeds, commands, deferredVersions, phase1, globLimit, needsWorktreeKey, hasPhase2} = execution;
  const reasons = new Set(run.uncacheableReasons);
  const addReason = reason => reasons.add(reason);
  const raw = path.join(runDir, 'raw');
  const runFile = path.join(runDir, 'run.json');
  const heartbeatFile = path.join(runDir, 'heartbeat.json');
  const resultFile = path.join(runDir, 'result.json');
  const runsDir = path.dirname(runDir);
  const loadavg = internal.loadavg ?? os.loadavg;
  const staleMs = internal.heartbeatStaleMs;

  let heartbeat;
  let heartbeatError;
  function beat() {
    try {
      heartbeat = {at: nowIso(), pid: process.pid};
      writeJson(heartbeatFile, heartbeat);
    } catch (error) {
      heartbeatError ??= storageError(error, {runId});
    }
  }

  function persist() {
    if (heartbeatError) throw heartbeatError;
    run.cacheable = reasons.size === 0;
    run.uncacheableReasons = [...reasons];
    refreshLoadClass(run.load);
    try {
      writeJson(runFile, run);
    } catch (error) {
      throw storageError(error, {runId});
    }
  }

  let currentPhase = 'preflight';
  async function phase(name, action) {
    currentPhase = name;
    const started = performance.now();
    const step = {name, startedAt: nowIso(), endedAt: null, ms: null};
    run.phases.push(step);
    persist();
    try {
      return await action();
    } finally {
      step.endedAt = nowIso();
      step.ms = performance.now() - started;
      persist();
    }
  }

  let result = null;
  let resultSha256 = null;
  let hit;
  let hold;
  beat();
  persist();
  const heartbeatTimer = setInterval(beat, internal.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS);
  let loadTimer;
  try {
    if (input.detach) {
      const {store: actualStore} = await getStorage(cwd, git);
      if (actualStore !== store) throw new RunFailure('worktree_create_failed', 'Runner storage does not match checkout');
    }
    if (run.state === 'queued') {
      currentPhase = 'queue';
      for (;;) {
        if (heartbeatError) throw heartbeatError;
        const now = Date.now();
        if (!run.queuedBehind.some(id => activeRun(runsDir, id, now, staleMs))) break;
        await delay(200);
      }
      run.state = 'preparing';
      run.load = makeLoad(input, loadavg);
    }
    run.executionStartedAt = nowIso();
    recordOverlaps(run, runsDir, staleMs);
    loadTimer = setInterval(() => {
      try {
        run.load.samples.push({at: nowIso(), loadavg: loadavg(), freemem: os.freemem()});
        recordOverlaps(run, runsDir, staleMs);
        persist();
      } catch (error) {
        heartbeatError ??= error instanceof VerifyError ? error : storageError(error, {runId});
      }
    }, internal.sampleMs ?? LOAD_SAMPLE_MS);
    if (!hasPhase2 && !needsWorktreeKey) hit = await phase('cache', () => cacheLookup(store, run));
    if (!hit) {
      const worktree = await phase('worktree', () => createWorktree({git, cwd, commonDir, run, persist, internal}));
      const entries = commands ? null : await worktreeRevisionFiles(git, worktree, input);
      let executionCommands = commands ?? resolveRunCommands(input, entries, {
        cwd, environment, reporter: fs.realpathSync(REPORTER), globLimit, addReason
      });
      await phase('prepare', async () => {
        await seedWorktree(seeds ?? readSeeds(input, cwd, entries), worktree, git);
        const before = topLevelIgnored(await statusEntries(git, worktree));
        for (const [index, task] of prep.entries()) {
          const resolved = bindWorktreeExecutable(task, worktree, runId);
          prep[index] = resolved;
          const output = await runTask(resolved, {worktree, phase: 'prepare', id: 'prepare.' + (index + 1), run, raw, persist, internal});
          if (output.exit.code !== 0 || output.exit.timedOut) throw new RunFailure('prepare_failed');
        }
        const after = await statusEntries(git, worktree);
        if (after.some(({status}) => status !== '??' && status !== '!!')) throw new RunFailure('prepare_dirtied_tree');
        run.ignoredAfterPrepare = topLevelIgnored(after).filter(filename => !before.includes(filename));
        if (needsWorktreeKey) {
          executionCommands = executionCommands.map(task => bindWorktreeExecutable(task, worktree, runId));
          run.cacheKeyPhase1 = phase1Key(phase1, executionCommands, prep, worktree);
          run.cacheKey = run.cacheKeyPhase1;
        }
        if (hasPhase2) {
          const versions = await versionDigests(deferredVersions, {worktree, addReason, internal});
          const artifacts = artifactDigests(input.keyInputs.artifactPaths, worktree, globLimit, addReason);
          const phase2 = hashJson({artifacts, versions, status: hashJson(after)});
          run.cacheKey = sha256Hex(run.cacheKeyPhase1 + phase2);
        }
      });
      if (hasPhase2 || needsWorktreeKey) hit = await phase('cache', () => cacheLookup(store, run));
      if (!hit) {
        run.state = 'running';
        result = await phase('commands', async () => {
          const summaries = [];
          for (const task of executionCommands) {
            const output = await runTask(task, {worktree, phase: 'commands', id: task.id, run, raw, persist, internal});
            const {id, results, expandedFiles} = task;
            const files = results.path ? readResultFiles(results.path, id, worktree, raw, globLimit, addReason, runId) : [];
            const summary = summarizeCommand({
              format: results.format, results, resultFiles: files, ctx: {worktree, commandId: id},
              streams: Object.fromEntries(Object.entries(output.buffers).map(([key, bytes]) => [key, bytes.toString('utf8')])),
              exit: output.exit, truncated: output.truncated
            });
            if (output.truncated && results.format === 'none') summary.incomplete.push({scope: 'command', reason: 'output_truncated'});
            summaries.push({id, format: results.format, expandedFiles, summary: {...summary, wallMs: output.wallMs, groupKill: output.groupKill}});
          }
          try { run.statusAfterCommands = await statusEntries(git, worktree); } catch { run.statusAfterCommands = null; }
          return {commands: summaries};
        });
      }
    }
    currentPhase = 'result';
    if (hit) {
      run.reusedFrom = hit.runId;
      result = hit.result;
    }
    run.cacheHit = Boolean(hit);
    const bytes = hit?.bytes ?? Buffer.from(JSON.stringify(result) + '\n');
    try {
      atomicWrite(resultFile, bytes);
    } catch (error) {
      throw storageError(error, {runId});
    }
    resultSha256 = hit?.resultSha256 ?? sha256Hex(bytes);
    run.state = 'succeeded';
  } catch (error) {
    if (!(error instanceof VerifyError) && !(error instanceof RunFailure)) {
      clearInterval(heartbeatTimer);
      throw error;
    }
    if (error instanceof VerifyError) hold = error;
    run.state = 'failed';
    run.cacheHit = false;
    run.failure = {code: error.code, phase: currentPhase};
    if (run.worktree) run.worktree.state = 'retained';
  } finally {
    clearInterval(loadTimer);
  }
  try {
    if (run.executionStartedAt) {
      run.executionEndedAt = nowIso();
      recordOverlaps(run, runsDir, staleMs);
      refreshLoadClass(run.load);
    }
    beat();
    if (!heartbeatError && run.cacheKeyPhase1 && hold?.code !== 'storage_unavailable') {
      await recordHistory(store, run, resultSha256, result);
    }
    persist();
  } catch (error) {
    const failure = error instanceof VerifyError ? error : storageError(error, {runId});
    run.state = 'failed';
    run.failure = {code: failure.code, phase: 'storage'};
    if (!heartbeatError) persist();
    throw failure;
  } finally {
    clearInterval(heartbeatTimer);
  }
  if (hold) throw hold;
  return statusPayload(run, heartbeat, run.state === 'succeeded' ? result : null);
}

if (process.argv[1] && fs.realpathSync(process.argv[1], {throwIfNoEntry: false}) === fileURLToPath(import.meta.url) &&
    process.argv[2] === '--run') {
  try {
    await runRunner(process.argv[3]);
  } catch (error) {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
  }
}
