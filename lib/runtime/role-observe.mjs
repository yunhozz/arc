// Pure observation helpers: stream/transcript/rollout normalization, model, permission and failure judgement, and worktree snapshot comparison.
// The only process started here is read-only `git` for snapshots; no CLI is ever run.
export {normalizeGeminiStreamEvent} from './gemini-stream.mjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import zlib from 'node:zlib';
import {execFile, spawnSync} from 'node:child_process';
import {promisify} from 'node:util';
import {DEFAULT_POLICY, CATALOG_MODEL_ALIASES} from './role-dispatch-policy.mjs';
import {observeCooperativeTarget} from './scope.mjs';

const execFileAsync = promisify(execFile);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value !== '' ? value : undefined;
const defined = object => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));

/** Splits chunked output into JSON objects. Non-JSON lines are counted and ignored; lines over maxLineBytes are dropped and flagged. */
export function createLineParser(onLine, {maxLineBytes = 1048576} = {}) {
  let parts = [], length = 0, skipping = false, overflow = false, ignored = 0;
  const emit = buffer => {
    const line = buffer.toString('utf8').trim();
    if (line === '') return;
    let value;
    try { value = JSON.parse(line); } catch { ignored++; return; }
    if (isObject(value)) onLine(value); else ignored++;
  };
  const drop = () => { overflow = true; skipping = true; parts = []; length = 0; };
  return {
    push(chunk) {
      let start = 0;
      for (;;) {
        const newline = chunk.indexOf(10, start);
        if (newline < 0) {
          if (!skipping) {
            const rest = chunk.subarray(start);
            parts.push(rest); length += rest.length;
            if (length > maxLineBytes) drop();
          }
          return;
        }
        const piece = chunk.subarray(start, newline); start = newline + 1;
        if (skipping) { skipping = false; continue; }
        if (length + piece.length > maxLineBytes) { overflow = true; parts = []; length = 0; continue; }
        const line = parts.length ? Buffer.concat([...parts, piece]) : piece;
        parts = []; length = 0;
        emit(line);
      }
    },
    end() {
      if (!skipping && length > 0) emit(Buffer.concat(parts));
      parts = []; length = 0; skipping = false;
    },
    get overflow() { return overflow; },
    get ignored() { return ignored; }
  };
}

export function normalizeClaudeStreamEvent(obj) {
  if (!isObject(obj)) return null;
  if (obj.type === 'system' && obj.subtype === 'init') {
    return defined({kind: 'init', sessionId: text(obj.session_id), model: text(obj.model), tools: Array.isArray(obj.tools) && obj.tools.every(tool => typeof tool === 'string') ? obj.tools : undefined, permissionMode: text(obj.permissionMode)});
  }
  if (obj.type === 'result') {
    return defined({kind: 'result', sessionId: text(obj.session_id), isError: obj.is_error === true || (obj.subtype !== undefined && obj.subtype !== 'success'), resultText: typeof obj.result === 'string' ? obj.result : undefined});
  }
  return {kind: 'other'};
}

export function normalizeCodexStreamEvent(obj) {
  if (!isObject(obj)) return null;
  if (obj.type === 'thread.started') return defined({kind: 'thread', threadId: text(obj.thread_id)});
  if (obj.type === 'turn.completed') return {kind: 'turn_completed'};
  if (obj.type === 'turn.failed') return defined({kind: 'turn_failed', message: text(obj.error?.message) ?? text(obj.message)});
  if (obj.type === 'error') return defined({kind: 'warning', message: text(obj.message)});
  if (obj.type === 'item.completed' && isObject(obj.item) && obj.item.type === 'error') return defined({kind: 'warning', message: text(obj.item.message)});
  return {kind: 'other'};
}

/** events.jsonl record: free text (resultText, message) never leaves the normalized event. */
export function eventRecord(normalized) {
  if (!isObject(normalized)) return {};
  const {resultText, message, ...rest} = normalized;
  void resultText; void message;
  return rest;
}

export const matchModel = (requested, observed) => {
  if (typeof requested !== 'string' || typeof observed !== 'string' || requested === '' || observed === '') return false;
  return CATALOG_MODEL_ALIASES.includes(requested) ? observed.split('-').includes(requested) : requested === observed;
};

const sameSet = (left, right) => left.length === right.length && new Set(left).size === left.length && new Set(right).size === right.length && left.every(item => right.includes(item));
const observedClaim = (level, source, extra) => ({level, source, ...extra});

export function evaluateClaudeInit({init, expected}) {
  if (!isObject(init) || init.kind !== 'init') {
    const none = {level: 'unverified', source: 'none'};
    return {reason: null, claims: {identity: {...none}, model: {...none, requested: expected?.model ?? null}, permissions: {...none, details: null}}};
  }
  const tools = Array.isArray(init.tools) ? init.tools : null;
  const toolsOk = tools !== null && sameSet(tools, expected.tools) && !tools.some(tool => tool.startsWith('mcp__'));
  const permissionOk = toolsOk && init.permissionMode === expected.permissionMode;
  const modelMissing = init.model === undefined || init.model === null || init.model === '', modelOk = !modelMissing && matchModel(expected.model, init.model);
  const claims = {
    identity: observedClaim(init.sessionId ? 'runtime-observed' : 'unverified', 'claude-stream-init', {observed: init.sessionId ?? null}),
    model: observedClaim(modelOk ? 'runtime-observed' : 'unverified', 'claude-stream-init', {requested: expected.model, observed: init.model ?? null, ...(modelMissing ? {label: 'model_effort_unverified'} : {})}),
    permissions: observedClaim(permissionOk ? 'runtime-observed' : 'unverified', 'claude-stream-init', {details: permissionOk ? null : 'tools or permissionMode differ from the requested values', observed: {tools, permissionMode: init.permissionMode ?? null}})
  };
  return {reason: !permissionOk ? 'permission_scope_mismatch' : !modelOk && !modelMissing ? 'model_effort_mismatch' : null, claims};
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const readLines = async function* (filename) {
  const reader = readline.createInterface({input: fs.createReadStream(filename, {encoding: 'utf8'}), crlfDelay: Infinity});
  try {
    for await (const line of reader) {
      if (line === '') continue;
      try { const value = JSON.parse(line); if (isObject(value)) yield value; } catch { /* unparsable lines are skipped */ }
    }
  } finally { reader.close(); }
};

/** Reads only the effort fields (output_config.effort or effort) from projects/<dir>/<sessionId>.jsonl; returns the last value or null. */
export async function readClaudeTranscriptEffort({claudeHome, sessionId}) {
  if (typeof sessionId !== 'string' || !SAFE_ID.test(sessionId)) return null;
  let directories;
  try { directories = await fsp.readdir(path.join(claudeHome, 'projects'), {withFileTypes: true}); } catch { return null; }
  let effort = null;
  for (const entry of directories.filter(item => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const filename = path.join(claudeHome, 'projects', entry.name, `${sessionId}.jsonl`);
    try { await fsp.access(filename); } catch { continue; }
    try {
      for await (const line of readLines(filename)) {
        const value = text(line.output_config?.effort) ?? text(line.effort);
        if (value !== undefined) effort = value;
      }
    } catch { /* unreadable transcript: keep what was read */ }
  }
  return effort;
}

/** Collects rollout files named rollout-*-<threadId>.jsonl (suffix match only; also .jsonl.zst) up to three directories below sessions/. */
async function findRollouts(directory, suffixes, depth = 0, found = []) {
  let entries;
  try { entries = await fsp.readdir(directory, {withFileTypes: true}); } catch { return found; }
  entries.sort((x, y) => x.name.localeCompare(y.name));
  for (const entry of entries) if (entry.isFile() && entry.name.startsWith('rollout-') && suffixes.some(suffix => entry.name.endsWith(suffix))) found.push(path.join(directory, entry.name));
  if (depth < 3) for (const entry of entries) if (entry.isDirectory()) await findRollouts(path.join(directory, entry.name), suffixes, depth + 1, found);
  return found;
}

/** Returns every turn_context of the thread as turns[] (plus the last one's fields); null when the rollout is missing, ambiguous or has no turn_context. */
const THREAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLLOUT_MAX_BYTES = 64 * 1024 * 1024;
const parseJsonLines = function* (content) {
  for (const line of content.split('\n')) {
    if (line === '') continue;
    try { const value = JSON.parse(line); if (isObject(value)) yield value; } catch { /* unparsable lines are skipped */ }
  }
};
/** zstdDecompress is injectable for tests; null (or a missing zlib function) means compressed rollouts cannot be read. */
export async function readCodexTurnContext({codexHome, threadId, delegationNames = [], zstdDecompress = zlib.zstdDecompressSync}) {
  if (typeof threadId !== 'string' || !THREAD_ID.test(threadId)) return null; // only a full thread UUID can match the -<threadId>.jsonl suffix unambiguously
  const files = await findRollouts(path.join(codexHome, 'sessions'), [`-${threadId}.jsonl`, `-${threadId}.jsonl.zst`]);
  if (files.length !== 1) return null;
  const turns = []; let delegationObserved = false;
  try {
    let lines;
    if (files[0].endsWith('.zst')) {
      if (typeof zstdDecompress !== 'function') return null;
      const compressed = await fsp.readFile(files[0]);
      if (compressed.length > ROLLOUT_MAX_BYTES) return null;
      const output = zstdDecompress(compressed, {maxOutputLength: ROLLOUT_MAX_BYTES});
      if (!Buffer.isBuffer(output) || output.length > ROLLOUT_MAX_BYTES) return null;
      lines = parseJsonLines(output.toString('utf8'));
    } else lines = readLines(files[0]);
    for await (const line of lines) {
      if (line.type === 'turn_context' && isObject(line.payload)) {
        const p = line.payload;
        turns.push({model: text(p.model) ?? null, effort: text(p.effort) ?? text(p.collaboration_mode?.settings?.reasoning_effort) ?? null, sandboxMode: text(p.sandbox_policy?.type) ?? null, approvalPolicy: text(p.approval_policy) ?? null});
      } else if (line.type === 'response_item' && line.payload?.type === 'function_call' && delegationNames.includes(line.payload.name)) delegationObserved = true;
    }
  } catch { return null; }
  if (turns.length === 0) return null;
  return {...turns.at(-1), delegationObserved, turns};
}

export function evaluateCodexContext({context, expected, policy = DEFAULT_POLICY}) {
  const gates = policy.gates ?? DEFAULT_POLICY.gates;
  if (!isObject(context)) {
    const none = {level: 'unverified', source: 'none'};
    return {reason: null, claims: {model: {...none, requested: expected.model}, effort: {...none, requested: expected.effort}, permissions: {...none, details: null}}};
  }
  const turns = Array.isArray(context.turns) && context.turns.length ? context.turns : [context];
  const present = value => value !== undefined && value !== null && value !== '';
  // Per field: 'ok' when every turn matches, 'mismatch' when any observed value differs, 'missing' when a value was not observed.
  const judge = (field, same) => {
    if (turns.some(item => present(item[field]) && !same(item[field]))) return 'mismatch';
    return turns.every(item => present(item[field])) ? 'ok' : 'missing';
  };
  const model = judge('model', value => matchModel(expected.model, value)), effort = judge('effort', value => value === expected.effort);
  const sandbox = judge('sandboxMode', value => value === expected.sandboxMode), approval = judge('approvalPolicy', value => value === expected.approvalPolicy);
  const settings = sandbox === 'mismatch' || approval === 'mismatch' ? 'mismatch' : sandbox === 'ok' && approval === 'ok' ? 'ok' : 'missing';
  const delegationDetectable = gates.G3 === 'pass', delegated = delegationDetectable && context.delegationObserved === true;
  // The child loads the user's Codex config (MCP servers and so on), which ARC does not control: the claim never exceeds operator-attested.
  const notes = ['user-config-mcp-not-controlled'];
  if (gates.G5 === 'wide') notes.push('writable-root-wider-than-worktree');
  if (!delegationDetectable) notes.push('delegation-not-detectable');
  if (settings === 'mismatch') notes.push('sandbox or approval policy differs from the requested values');
  if (settings === 'missing') notes.push('sandbox or approval policy not observed');
  if (delegated) notes.push('delegation call observed');
  const permissionLevel = settings !== 'ok' || delegated ? 'unverified' : 'operator-attested';
  const claimOf = (state, requested, field) => observedClaim(state === 'ok' ? 'runtime-observed' : 'unverified', 'codex-rollout', {requested, observed: context[field] ?? null, ...(state === 'missing' ? {label: 'model_effort_unverified'} : {})});
  const claims = {
    model: claimOf(model, expected.model, 'model'), effort: claimOf(effort, expected.effort, 'effort'),
    permissions: observedClaim(permissionLevel, 'codex-rollout', {details: notes.length ? notes.join('; ') : null, observed: {sandboxMode: context.sandboxMode ?? null, approvalPolicy: context.approvalPolicy ?? null}})
  };
  return {reason: settings === 'mismatch' ? 'permission_scope_mismatch' : model === 'mismatch' || effort === 'mismatch' ? 'model_effort_mismatch' : delegated ? 'delegation_observed' : null, claims};
}

const AUTH = /\b(401|unauthori[sz]ed|not logged in|authentication)\b/i;
const MODEL = /model\b.*\b(not found|not supported|does not exist|unavailable|invalid)\b/i;
const EFFORT = /(effort|reasoning)\b.*\b(invalid|unsupported|not supported)\b/i;
/**
 * Returns null for a successful termination, otherwise the failure class.
 * - terminal: true only when a terminal event was observed (Claude result, Codex turn.completed/turn.failed).
 * - terminalError: true when that terminal event reports an error (Claude result.is_error, Codex turn.failed).
 * - messages: error-source text only: Claude result/error text when is_error is true, Codex turn.failed/error event messages, and stderr.
 *   Never pass assistant output or successful result text; the auth/model/effort patterns would match ordinary prose.
 */
export function classifyFailure({exitCode, signal, terminal, terminalError = false, messages = []}) {
  if (exitCode === 0 && (signal === null || signal === undefined) && terminal === true && terminalError !== true) return null;
  const lines = (Array.isArray(messages) ? messages : []).filter(message => typeof message === 'string');
  if (lines.some(line => AUTH.test(line))) return 'auth_rejected';
  if (lines.some(line => MODEL.test(line))) return 'model_rejected';
  if (lines.some(line => EFFORT.test(line))) return 'effort_rejected';
  return terminal ? 'execution_failed' : 'invalid_output';
}

const gitEnv = () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')));
  return Object.assign(env, {GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_OPTIONAL_LOCKS: '0', GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0'});
};
const git = async (cwd, args, {allowFailure = false} = {}) => {
  try {
    const {stdout} = await execFileAsync('git', ['--no-pager', '-c', 'core.fsmonitor=false', ...args], {cwd, env: gitEnv(), encoding: 'utf8', timeout: 60000, maxBuffer: 256 * 1024 * 1024});
    return stdout;
  } catch (error) {
    if (allowFailure) return null;
    throw Error(`Git observation failed: ${args[0]}${error.code ? ` (${error.code})` : ''}`);
  }
};
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

/** Resolve the worktree root for a cwd that may be a subdirectory. */
export async function resolveWorktree(cwd) {
  const result = spawnSync('git', ['--no-pager', 'rev-parse', '--show-toplevel'], {cwd, env: gitEnv(), encoding: 'utf8', timeout: 10000});
  if (result.error || result.status !== 0 || !result.stdout.endsWith('\n')) throw Error('Worktree root unavailable');
  return observeCooperativeTarget(result.stdout.slice(0, -1));
}

async function contentDigest(filename) {
  let stat;
  try { stat = await fsp.lstat(filename); } catch (error) { return error.code === 'ENOENT' ? sha256('deleted') : sha256('unreadable'); }
  if (stat.isSymbolicLink()) { try { return sha256('link:' + await fsp.readlink(filename)); } catch { return sha256('unreadable'); } }
  if (!stat.isFile()) return sha256('directory');
  return await new Promise(resolve => {
    const hash = crypto.createHash('sha256'), stream = fs.createReadStream(filename);
    stream.on('data', chunk => hash.update(chunk)); stream.on('end', () => resolve(hash.digest('hex'))); stream.on('error', () => resolve(sha256('unreadable')));
  });
}

const missingTree = error => error.code === 'ENOENT' || error.code === 'ENOTDIR';
const CONTROL_TREE_LIMIT = 1000;
const controlStat = filename => fsp.lstat(filename).catch(error => {
  if (missingTree(error)) return null;
  throw error;
});
const sameControlEntry = (stat, current) => current?.dev === stat.dev && current?.ino === stat.ino;
const entryIntact = async (filename, stat) => sameControlEntry(stat, await controlStat(filename));
const rootIntact = async () => true;

async function controlFileState(filename, {project, stat, parentIntact = rootIntact} = {}) {
  let handle, bytes, digest;
  let intact = parentIntact;
  try {
    if (!await parentIntact()) return 'changed';
    stat ??= await controlStat(filename);
    if (!stat) return sha256('deleted');
    intact = async () => await parentIntact() && await entryIntact(filename, stat);
    if (!await intact()) return 'changed';
    if (stat.isSymbolicLink()) {
      const target = await fsp.readlink(filename);
      return await intact() ? `symlink:${target}` : 'changed';
    }
    if (!stat.isFile()) return sha256('directory');

    // Refuse a replacement symlink and verify the opened file before reading bytes.
    const {O_RDONLY, O_NOFOLLOW, O_NONBLOCK} = fs.constants;
    handle = await fsp.open(filename, O_RDONLY | O_NOFOLLOW | O_NONBLOCK);
    if (!sameControlEntry(stat, await handle.stat()) || !await intact()) return 'changed';
    if (project) {
      bytes = await handle.readFile();
    } else {
      const hash = crypto.createHash('sha256');
      for await (const chunk of handle.createReadStream({autoClose: false})) hash.update(chunk);
      digest = hash.digest('hex');
    }
    if (!await intact()) return 'changed';
  } catch {
    return await intact().catch(() => true) ? sha256('unreadable') : 'changed';
  } finally {
    if (handle) await handle.close();
  }
  const projection = project ? project(bytes) : null;
  return projection === null ? `${digest ?? sha256(bytes)}:${stat.dev}:${stat.ino}` : sha256('projection:' + projection);
}

async function snapshotControlTree(root, label) {
  const entries = new Map();
  const walk = async (dir, prefix, stat, parentIntact) => {
    const intact = async () => await parentIntact() && await entryIntact(dir, stat);
    const markChanged = () => {
      for (const entry of entries.keys()) if (entry.startsWith(prefix + '/')) entries.delete(entry);
      entries.set(prefix, 'changed');
    };
    if (!await intact()) return markChanged();
    let names;
    try { names = await fsp.readdir(dir); } catch (error) {
      if (missingTree(error)) return markChanged();
      const stillIntact = prefix === label ? await intact() : await intact().catch(() => true);
      if (!stillIntact) return markChanged();
      if (prefix !== label) {
        entries.set(prefix + '/', 'unreadable');
        return;
      }
      throw error;
    }
    if (!await intact()) return markChanged();
    for (const name of names) {
      if (name.endsWith('.lock')) continue;
      if (!await intact()) return markChanged();
      const filename = path.join(dir, name), entry = `${prefix}/${name}`;
      let state;
      try { state = await controlStat(filename); } catch {
        entries.set(entry, sha256('unreadable'));
      }
      if (state?.isDirectory()) {
        entries.set(entry + '/', `directory:${state.dev}:${state.ino}`);
        if (entries.size <= CONTROL_TREE_LIMIT) await walk(filename, entry, state, intact);
      } else if (state) {
        entries.set(entry, await controlFileState(filename, {stat: state, parentIntact: intact}));
      }
      if (entries.size > CONTROL_TREE_LIMIT) break;
    }
    if (!await intact()) markChanged();
  };

  const stat = await controlStat(root);
  if (!stat) return entries;
  if (!stat.isDirectory()) return new Map([[label, await controlFileState(root, {stat})]]);
  await walk(root, label, stat, rootIntact);
  return entries.size > CONTROL_TREE_LIMIT ? new Map([[label, 'overflow']]) : entries;
}

async function snapshotWorktreeControlDirectory(worktree, name, files, entries) {
  const dir = path.join(worktree, name), label = `worktree:${name}/`;
  let stat;
  try { stat = await controlStat(dir); } catch {
    entries.set(label, sha256('unreadable'));
    return;
  }
  if (stat && !stat.isDirectory()) {
    entries.set(label, await controlFileState(dir, {stat}));
    return;
  }
  const intact = async () => stat ? await entryIntact(dir, stat) : (await controlStat(dir)) === null;
  const states = [];
  for (const file of files) {
    states.push(stat ? await controlFileState(path.join(dir, file), {parentIntact: intact}) : sha256('deleted'));
  }
  if (!await intact()) entries.set(label, 'changed');
  else files.forEach((file, i) => entries.set(label + file, states[i]));
}

async function extraControlFileState({path: filename, project}) {
  const parent = path.dirname(filename);
  const stat = await controlStat(parent).catch(() => undefined);
  if (stat === undefined) return sha256('unreadable');
  if (!stat) return sha256('deleted');

  const parentIntact = () => entryIntact(parent, stat).catch(() => false);
  if (stat.isSymbolicLink()) {
    const target = await fsp.readlink(parent).catch(() => null);
    if (!await parentIntact()) return 'parent-changed';
    return target === null ? sha256('unreadable') : `parent-symlink:${target}`;
  }
  if (!stat.isDirectory()) return 'parent-not-directory';
  const state = await controlFileState(filename, {project, parentIntact});
  return await parentIntact() ? state : 'parent-changed';
}

const CLAUDE_SAFE_ALLOW_TOOLS = new Set(['bash', 'read', 'grep', 'glob', 'webfetch', 'websearch']);

function claudeSettingsScopeReason(bytes) {
  let settings;
  try { settings = JSON.parse(bytes.toString('utf8')); } catch { return 'invalid JSON'; }
  if (!isObject(settings)) return null;
  if (Object.hasOwn(settings, 'hooks')) return 'hooks';
  if (Object.hasOwn(settings, 'sandbox')) return 'sandbox';
  const {permissions} = settings;
  if (!isObject(permissions)) return null;
  if (permissions.additionalDirectories?.length > 0) return 'permissions.additionalDirectories';
  if (Object.hasOwn(permissions, 'allow')) {
    const {allow} = permissions;
    if (!Array.isArray(allow) || allow.some(rule =>
      typeof rule !== 'string' || !CLAUDE_SAFE_ALLOW_TOOLS.has(rule.split('(', 1)[0].trim().toLowerCase())
    )) return 'permissions.allow';
  }
  if (Object.hasOwn(permissions, 'defaultMode')) return 'permissions.defaultMode';
  return null;
}

/** Check Claude project and local settings before starting a writing bridge. */
export async function claudeProjectSettingsWidenScope(worktree) {
  for (const label of ['.claude/settings.json', '.claude/settings.local.json']) {
    let scopeReason;
    const state = await extraControlFileState({path: path.join(worktree, label), project: bytes => {
      scopeReason = claudeSettingsScopeReason(bytes);
      return 'claude-settings-read';
    }}).catch(() => 'unreadable');
    if (state === sha256('deleted')) continue;
    if (state === sha256('projection:claude-settings-read')) {
      if (scopeReason) return `${label}: ${scopeReason}`;
      continue;
    }
    if (state === sha256('directory') || state.startsWith('symlink:')) return `${label}: not a regular file`;
    return `${label}: settings path could not be verified`;
  }
  return null;
}

/** Snapshot of selected Git, worktree and optional platform control files. */
export async function snapshotControlFiles({gitCommonDir, gitDir, worktree, extra = []}) {
  if (![gitCommonDir, gitDir, worktree].every(dir => typeof dir === 'string' && path.isAbsolute(dir))) {
    throw Error('Control snapshot requires absolute Git and worktree paths');
  }
  if (!(await fsp.lstat(gitCommonDir)).isDirectory()) throw Error('Git common directory is not a directory');
  const files = [
    {label: 'git:config', path: path.join(gitCommonDir, 'config')},
    {label: 'git:config.worktree', path: path.join(gitDir, 'config.worktree')},
  ];
  const entries = new Map();
  for (const file of files) entries.set(file.label, await controlFileState(file.path));
  await snapshotWorktreeControlDirectory(worktree, '.claude', ['settings.json', 'settings.local.json'], entries);
  await snapshotWorktreeControlDirectory(worktree, '.codex', ['config.toml'], entries);
  for (const file of extra) entries.set(file.label, await extraControlFileState(file));
  for (const tree of ['hooks', 'info']) {
    for (const [label, state] of await snapshotControlTree(path.join(gitCommonDir, tree), `git:${tree}`)) entries.set(label, state);
  }
  return entries;
}

export function allowedPathsCoverControl(allowedPaths) {
  return allowedPaths.some(entry => {
    const normalized = path.posix.normalize(entry).replace(/\/$/, '').toLowerCase();
    return normalized.startsWith('.git/') || ['.', '.git', '.claude', '.claude/settings.json', '.claude/settings.local.json', '.codex', '.codex/config.toml'].includes(normalized);
  });
}

/** Snapshot of HEAD, branch, every ref (name and object) and every changed or untracked path; paths are relative to the worktree root even when worktree is a subdirectory. */
export async function snapshotWorktree(worktree) {
  const root = (await git(worktree, ['rev-parse', '--show-toplevel'])).trim();
  const head = (await git(root, ['rev-parse', '--verify', '--quiet', 'HEAD'], {allowFailure: true}))?.trim() || null;
  const branch = (await git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'], {allowFailure: true}))?.trim() || null;
  const refs = {};
  for (const line of (await git(root, ['for-each-ref', '--format=%(refname) %(objectname)'])).split('\n')) {
    const at = line.lastIndexOf(' ');
    if (at > 0) refs[line.slice(0, at)] = line.slice(at + 1);
  }
  const status = await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  const tokens = status.split('\0'), entries = new Map();
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '') continue;
    const code = token.slice(0, 2), file = token.slice(3);
    entries.set(file, `${code}:${await contentDigest(path.join(root, file))}`);
    if (code.includes('R') || code.includes('C')) { const origin = tokens[++i]; if (origin) entries.set(origin, `${code}:${sha256('deleted')}`); }
  }
  return {head, branch, refs, entries};
}

const allowedBy = (allowedPaths, file) => allowedPaths.some(entry => entry.endsWith('/') ? file.startsWith(entry) : file === entry);
/** Implementer and QA may change only allowedPaths (QA: none when empty or missing); read-only roles may change nothing; any HEAD, branch or ref change (created, deleted or moved) is a violation. Ordinary worktree snapshots omit Git-ignored paths; control files are compared regardless of allowedPaths and role. */
export function detectViolations({role, allowedPaths, before, after}) {
  const headChanged = before.head !== after.head || before.branch !== after.branch;
  const refsBefore = before.refs ?? {}, refsAfter = after.refs ?? {};
  const refsChanged = [...new Set([...Object.keys(refsBefore), ...Object.keys(refsAfter)])].some(name => refsBefore[name] !== refsAfter[name]);
  const allowed = (role === 'arc_implementer' || role === 'arc_qa') && Array.isArray(allowedPaths) ? allowedPaths : [];
  const changed = new Set();
  for (const file of new Set([...before.entries.keys(), ...after.entries.keys()])) if (before.entries.get(file) !== after.entries.get(file)) changed.add(file);
  const changedPaths = [...changed].filter(file => !allowedBy(allowed, file)).sort();
  const controlBefore = before.control ?? new Map(), controlAfter = after.control ?? new Map();
  const controlChanged = [...new Set([...controlBefore.keys(), ...controlAfter.keys()])]
    .filter(label => controlBefore.get(label) !== controlAfter.get(label)).sort();
  return {reason: headChanged || refsChanged || changedPaths.length || controlChanged.length ? 'permission_violation_observed' : null, changedPaths, headChanged, refsChanged, controlChanged};
}
