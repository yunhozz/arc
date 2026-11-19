import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

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
    if (profile.fileIdentity) removeGrokSandboxProfile(profile);
    else if (fd === undefined && profile.dirCreated && profile.directoryIdentity) {
      try {
        checkProfileDirectory(profile);
        fs.rmdirSync(directory);
      } catch { /* retain a concurrently occupied or replaced directory */ }
    }
    throw scopeError('Grok sandbox profile creation failed', cause);
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
  const stat = fs.lstatSync(path.join(grokHome, 'sessions', 'sandbox-events.jsonl'), {throwIfNoEntry: false});
  if (!stat) return {exists: false, size: 0};
  if (!stat.isFile()) throw Error('Grok sandbox events are not a regular file');
  return {exists: true, dev: stat.dev, ino: stat.ino, size: stat.size};
}
