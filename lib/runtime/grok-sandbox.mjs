import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {EVENTS_MAX_BYTES} from './role-dispatch-policy.mjs';

export const GROK_SANDBOX_RELATIVE = '.grok/sandbox.toml';
export const GROK_SANDBOX_DENY = Object.freeze([
  '.grok/sandbox.toml', '~/.grok/skills', '~/.grok/agents', '~/.grok/rules',
  '~/.grok/workflows', '~/.grok/plugins', '~/.grok/installed-plugins', '~/.grok/plugin-data',
  '~/.grok/personas', '~/.grok/memory', '~/.grok/memory-v2', '~/.grok/AGENTS.md',
  '~/.grok/statusline.sh', '~/.grok/lsp.json', '~/.grok/bin', '~/.grok/downloads',
  '~/.grok/bundled', '~/.grok/bundles', '~/.grok/settings.json', '~/.grok/pager.toml',
  '~/.grok/mcp_credentials.json', '~/.grok/worktrees', '~/.grok/workspaces', '~/.grok/daemon',
]);

const digest = bytes => 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex');
const scopeError = (message, cause) => Object.assign(Error(message, {cause}), {reasonCode: 'permission_scope_unverified'});
const sameEntry = (first, second) => first.dev === second.dev && first.ino === second.ino;
const identityOf = ({dev, ino}) => ({dev, ino});
const sandboxEventsPath = grokHome => path.join(grokHome, 'sessions', 'sandbox-events.jsonl');

function parseConfigKeyPath(source) {
  const segment = /\s*(?:"([^"\\]*)"|'([^'\\]*)'|([\w-]+))\s*/y;
  const segments = [];
  for (;;) {
    const match = segment.exec(source);
    if (!match) return null;
    segments.push(match[1] ?? match[2] ?? match[3]);
    if (source[segment.lastIndex] !== '.') return {segments, rest: source.slice(segment.lastIndex)};
    segment.lastIndex += 1;
  }
}

function isGrokSecurityPath(segments) {
  return segments.includes('permission_mode') || (segments[0] === 'compat' && segments[1] === 'claude')
    || /^sandbox[\w-]*$/.test(segments[0]);
}

function arrayDepthAfterLine(value, depth) {
  let quote = null;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (quote) {
      if (quote === '"' && char === '\\') i += 1;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '#') {
      break;
    } else if (char === '[') {
      depth += 1;
    } else if (char === ']') {
      depth -= 1;
      if (depth < 0) return null;
    }
  }
  return quote ? null : depth;
}

export function grokConfigSecurityProjection(bytes) {
  let config;
  try { config = new TextDecoder('utf-8', {fatal: true}).decode(bytes); } catch { return null; }
  if (config.includes('"""') || config.includes("'''")) return null;

  const lines = [];
  let table = [];
  let arrayDepth = 0, securityValue = false;
  for (const raw of config.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (arrayDepth > 0) {
      arrayDepth = arrayDepthAfterLine(line, arrayDepth);
      if (arrayDepth === null) return null;
      if (securityValue) lines.push(`${table.join('.')}\t${line}`);
      continue;
    }
    if (line.startsWith('[')) {
      const arrayTable = line.startsWith('[[');
      const header = parseConfigKeyPath(line.slice(arrayTable ? 2 : 1));
      const closing = arrayTable ? /^\]\]\s*(?:#.*)?$/ : /^\]\s*(?:#.*)?$/;
      if (!header || !closing.test(header.rest)) return null;
      table = header.segments;
      if (isGrokSecurityPath(table)) lines.push(`${table.join('.')}\t${line}`);
      continue;
    }
    const key = parseConfigKeyPath(line);
    if (!key || !key.rest.startsWith('=')) return null;
    arrayDepth = arrayDepthAfterLine(key.rest.slice(1), 0);
    if (arrayDepth === null) return null;
    securityValue = isGrokSecurityPath([...table, ...key.segments]);
    if (securityValue) lines.push(`${table.join('.')}\t${line}`);
  }
  return arrayDepth === 0 ? lines.join('\n') : null;
}

export function grokSandboxProfileName(dispatchId) {
  const prefix = typeof dispatchId === 'string' ? dispatchId.slice(0, 8) : '';
  return /^[0-9a-f]{8}$/.test(prefix) ? 'arc-bridge-' + prefix : null;
}

export function renderGrokSandboxProfile(name) {
  if (typeof name !== 'string' || !/^arc-bridge-[0-9a-f]{8}$/.test(name)) throw Error('Invalid Grok profile name');
  const deny = GROK_SANDBOX_DENY.map(entry => JSON.stringify(entry)).join(', ');
  return Buffer.from(`[profiles.${name}]\nextends = "workspace"\ndeny = [${deny}]\n`);
}

export function grokProfileCovered(allowedPaths) {
  return allowedPaths.some(entry => (entry.endsWith('/') ? GROK_SANDBOX_RELATIVE.startsWith(entry) : entry === GROK_SANDBOX_RELATIVE)
    || entry === '.grok' || entry.startsWith('.grok/'));
}

export function inspectGrokProfileSlot(worktree) {
  const file = path.join(worktree, GROK_SANDBOX_RELATIVE), directory = path.dirname(file);
  try {
    const parent = fs.lstatSync(directory, {throwIfNoEntry: false});
    if (parent && !parent.isDirectory()) throw Error('.grok is not a real directory');
    if (fs.lstatSync(file, {throwIfNoEntry: false})) throw Error('Sandbox profile slot is occupied');
  } catch (cause) {
    throw scopeError('Grok sandbox profile slot unavailable', cause);
  }
}

export function checkGrokHome({grokHome, userHome, childEnv}) {
  if (typeof grokHome !== 'string' || childEnv?.GROK_HOME !== grokHome) return false;
  try {
    if (Object.hasOwn(childEnv, 'HOME') && fs.realpathSync(childEnv.HOME) !== fs.realpathSync(userHome)) return false;
    return !fs.lstatSync(grokHome, {throwIfNoEntry: false})?.isSymbolicLink();
  } catch {
    return false;
  }
}

export function createGrokSandboxProfile({worktree, bytes}) {
  const file = path.join(worktree, GROK_SANDBOX_RELATIVE), directory = path.dirname(file);
  const profile = {path: file, sha256: digest(bytes), dirCreated: false};
  let fd;
  try {
    try {
      fs.mkdirSync(directory, 0o700);
      profile.dirCreated = true;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    const parent = fs.lstatSync(directory);
    if (!parent.isDirectory()) throw Error('.grok is not a real directory');
    profile.directoryIdentity = identityOf(parent);
    // During creation, the parent .grok can become a symlink between its identity lstat and open.
    fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o444);
    try {
      const opened = fs.fstatSync(fd);
      if (!opened.isFile()) throw Error('Grok sandbox profile is not a regular file');
      profile.fileIdentity = identityOf(opened);
      checkProfileEntries(profile);
      fs.writeFileSync(fd, bytes);
      fs.fchmodSync(fd, 0o444);
    } finally {
      fs.closeSync(fd);
    }
    checkProfileEntries(profile);
    return profile;
  } catch (cause) {
    const error = scopeError('Grok sandbox profile creation failed', cause);
    if (fd !== undefined) {
      const {removed, dirRemoved, violation} = profile.fileIdentity
        ? removeGrokSandboxProfile(profile)
        : {removed: false, dirRemoved: false, violation: true};
      error.cleanup = {path: file, retained: !removed, violation, dirRemoved};
    } else if (profile.dirCreated && profile.directoryIdentity) {
      try {
        checkProfileDirectory(profile);
        fs.rmdirSync(directory);
      } catch { /* retain a concurrently occupied or replaced directory */ }
    }
    throw error;
  }
}

function checkProfileDirectory({path: file, directoryIdentity}) {
  const parent = fs.lstatSync(path.dirname(file));
  if (!parent.isDirectory() || !sameEntry(parent, directoryIdentity)) throw Error('Grok sandbox directory changed');
}

function checkProfileEntries(profile) {
  checkProfileDirectory(profile);
  const stat = fs.lstatSync(profile.path);
  if (!stat.isFile() || !sameEntry(stat, profile.fileIdentity)) throw Error('Grok sandbox profile was replaced');
}

export function verifyGrokSandboxProfile(profile) {
  const {path: file, sha256, fileIdentity} = profile;
  try {
    checkProfileEntries(profile);
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
      const opened = fs.fstatSync(fd);
      if (!opened.isFile() || !sameEntry(opened, fileIdentity) || digest(fs.readFileSync(fd)) !== sha256) return false;
    } finally {
      fs.closeSync(fd);
    }
    checkProfileEntries(profile);
    return true;
  } catch {
    return false;
  }
}

export function removeGrokSandboxProfile(profile) {
  const {path: file, dirCreated} = profile;
  const result = {removed: false, dirRemoved: false, violation: false};
  if (!verifyGrokSandboxProfile(profile)) return {...result, violation: true};
  try {
    // Node has no unlinkat, so a race remains between the final identity check and unlink.
    fs.unlinkSync(file);
    result.removed = true;
    if (dirCreated) {
      try {
        checkProfileDirectory(profile);
        fs.rmdirSync(path.dirname(file));
        result.dirRemoved = true;
      } catch (error) {
        if (error.code !== 'ENOTEMPTY') throw error;
      }
    }
  } catch {
    result.violation = true;
  }
  return result;
}

export function grokEventsBaseline(grokHome) {
  const stat = fs.lstatSync(sandboxEventsPath(grokHome), {throwIfNoEntry: false});
  if (!stat) return {exists: false, size: 0};
  if (!stat.isFile()) throw Error('Grok sandbox events are not a regular file');
  return {exists: true, dev: stat.dev, ino: stat.ino, size: stat.size};
}

const unapplied = (reason, candidates = 0) => ({ok: false, reason, candidates, applied: null});

function eventsFileIssue(baseline, current, maxBytes) {
  if (!current.exists) return baseline.exists ? 'rotated' : 'no_candidate';
  if (!current.regular) return 'not_regular';
  if (baseline.exists && !sameEntry(baseline, current)) return 'rotated';
  if (current.size < baseline.size) return 'truncated';
  if (current.size - baseline.size > maxBytes) return 'too_large';
  return null;
}

export function evaluateGrokProfileApplied({text, baseline, current, spawnAtMs, name, worktreeRealpath, maxBytes = EVENTS_MAX_BYTES}) {
  const issue = eventsFileIssue(baseline, current, maxBytes);
  if (issue) return unapplied(issue);

  const lines = text.split('\n');
  lines.pop(); // The last entry is empty or an unfinished append.
  let candidate = null, candidates = 0, invalidTimestamp = false;
  for (const line of lines) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event?.event_type !== 'ProfileApplied' || event.profile !== name || event.workspace !== worktreeRealpath) continue;
    const timestamp = typeof event.timestamp === 'string' ? Date.parse(event.timestamp) : NaN;
    if (Number.isNaN(timestamp)) {
      invalidTimestamp = true;
      candidates++;
    } else if (timestamp >= spawnAtMs) {
      candidate = event;
      candidates++;
    }
  }
  if (invalidTimestamp) return unapplied('timestamp_invalid', candidates);
  if (!candidates) return unapplied('no_candidate');
  if (candidates > 1) return unapplied('multiple_candidates', candidates);
  if (candidate.enforced !== true) return unapplied('not_enforced', candidates);
  if (candidate.inherited === true) return unapplied('inherited', candidates);
  const expectedDeny = path.join(worktreeRealpath, GROK_SANDBOX_RELATIVE);
  if (!Array.isArray(candidate.deny_paths) || !candidate.deny_paths.includes(expectedDeny)) return unapplied('deny_missing', candidates);
  const applied = {timestamp: candidate.timestamp, enforced: true, inherited: false, denyOk: true};
  return {ok: true, reason: null, candidates, applied};
}

export function readGrokProfileApplied({grokHome, baseline, spawnAtMs, name, worktreeRealpath}) {
  const file = sandboxEventsPath(grokHome);
  try {
    const stat = fs.lstatSync(file, {throwIfNoEntry: false});
    const current = stat ? {exists: true, regular: stat.isFile(), dev: stat.dev, ino: stat.ino, size: stat.size} : {exists: false};
    const issue = eventsFileIssue(baseline, current, EVENTS_MAX_BYTES);
    if (issue) return unapplied(issue);

    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
      const opened = fs.fstatSync(fd);
      if (!sameEntry(opened, stat)) return unapplied('rotated');
      if (!opened.isFile()) return unapplied('not_regular');
      if (opened.size < stat.size) return unapplied('truncated');

      const bytes = Buffer.alloc(stat.size - baseline.size);
      let offset = 0;
      while (offset < bytes.length) {
        const read = fs.readSync(fd, bytes, offset, bytes.length - offset, baseline.size + offset);
        if (read === 0) return unapplied('truncated');
        offset += read;
      }
      return evaluateGrokProfileApplied({text: bytes.toString('utf8'), baseline, current, spawnAtMs, name, worktreeRealpath});
    } finally {
      fs.closeSync(fd);
    }
  } catch (error) {
    return unapplied(error.code === 'ENOENT' || error.code === 'ELOOP' ? 'rotated' : 'not_regular');
  }
}
