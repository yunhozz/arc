import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const sandbox = await import('../../lib/runtime/grok-sandbox.mjs').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND' || !error.url?.endsWith('/lib/runtime/grok-sandbox.mjs')) throw error;
  return {};
});
const deny = [
  '.grok/sandbox.toml', '~/.grok/skills', '~/.grok/agents', '~/.grok/rules',
  '~/.grok/workflows', '~/.grok/plugins', '~/.grok/installed-plugins', '~/.grok/plugin-data',
  '~/.grok/personas', '~/.grok/memory', '~/.grok/memory-v2', '~/.grok/AGENTS.md',
  '~/.grok/statusline.sh', '~/.grok/lsp.json', '~/.grok/bin', '~/.grok/downloads',
  '~/.grok/bundled', '~/.grok/bundles', '~/.grok/settings.json', '~/.grok/pager.toml',
  '~/.grok/mcp_credentials.json', '~/.grok/worktrees', '~/.grok/workspaces', '~/.grok/daemon',
];
const rendered = Buffer.from('[profiles.arc-bridge-0123abcd]\nextends = "workspace"\ndeny = [".grok/sandbox.toml", "~/.grok/skills", "~/.grok/agents", "~/.grok/rules", "~/.grok/workflows", "~/.grok/plugins", "~/.grok/installed-plugins", "~/.grok/plugin-data", "~/.grok/personas", "~/.grok/memory", "~/.grok/memory-v2", "~/.grok/AGENTS.md", "~/.grok/statusline.sh", "~/.grok/lsp.json", "~/.grok/bin", "~/.grok/downloads", "~/.grok/bundled", "~/.grok/bundles", "~/.grok/settings.json", "~/.grok/pager.toml", "~/.grok/mcp_credentials.json", "~/.grok/worktrees", "~/.grok/workspaces", "~/.grok/daemon"]\n');
const permissionError = {reasonCode: 'permission_scope_unverified'};
const sha256 = bytes => 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex');

function fixture(t) {
  const worktree = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-grok-sandbox-'));
  t.after(() => fs.rmSync(worktree, {recursive: true, force: true}));
  const directory = path.join(worktree, '.grok');
  return {worktree, directory, file: path.join(directory, 'sandbox.toml')};
}

test('AC5 renders a fixed workspace profile and validates its name', () => {
  assert.deepEqual(sandbox.GROK_SANDBOX_DENY, deny);
  assert.ok(Object.isFrozen(sandbox.GROK_SANDBOX_DENY));
  assert.equal(sandbox.GROK_SANDBOX_RELATIVE, '.grok/sandbox.toml');
  assert.deepEqual(sandbox.renderGrokSandboxProfile('arc-bridge-0123abcd'), rendered);
  for (const name of ['arc-bridge-0123Abcd', 'arc-bridge-0123abc', '']) {
    assert.throws(() => sandbox.renderGrokSandboxProfile(name), /profile/i);
  }
});

test('E6 derives the profile name from the lowercase hex dispatch prefix', () => {
  assert.equal(typeof sandbox.grokSandboxProfileName, 'function');
  assert.equal(sandbox.grokSandboxProfileName('0123abcd-1111-4111-8111-111111111111'), 'arc-bridge-0123abcd');
  for (const invalid of ['0123ABCD-1111-4111-8111-111111111111', '0123abcd'.slice(0, 7), '0123abcx-1111-4111-8111-111111111111', null]) {
    assert.equal(sandbox.grokSandboxProfileName(invalid), null);
  }
});

test('E2 protects the profile and all entries inside .grok', () => {
  assert.equal(typeof sandbox.grokProfileCovered, 'function');
  for (const entry of ['.grok/sandbox.toml', '.grok/', '.grok', '.grok/x']) assert.equal(sandbox.grokProfileCovered([entry]), true, entry);
  for (const entries of [['src/'], ['.grokfoo'], []]) assert.equal(sandbox.grokProfileCovered(entries), false);
});

for (const kind of ['file', 'symlink', 'directory']) test(`E3 refuses an existing profile slot of type ${kind}`, t => {
  const {worktree, directory, file} = fixture(t);
  const userFile = kind === 'file' ? file : path.join(worktree, 'user-file');
  fs.mkdirSync(directory);
  fs.writeFileSync(userFile, 'user content');
  if (kind === 'symlink') fs.symlinkSync(userFile, file);
  else if (kind === 'directory') fs.mkdirSync(file);
  const before = sha256(fs.readFileSync(userFile));
  assert.throws(() => sandbox.inspectGrokProfileSlot(worktree), permissionError);
  assert.equal(sha256(fs.readFileSync(userFile)), before);
});

for (const kind of ['file', 'symlink']) test(`E4 refuses a .grok entry of type ${kind}`, t => {
  const {worktree, directory} = fixture(t);
  if (kind === 'file') fs.writeFileSync(directory, 'user content');
  else fs.symlinkSync(worktree, directory);
  assert.throws(() => sandbox.inspectGrokProfileSlot(worktree), permissionError);
});

test('creates a read-only profile and cleans up its own directory', t => {
  const {worktree, directory, file} = fixture(t);
  assert.equal(typeof sandbox.createGrokSandboxProfile, 'function');
  const entry = sandbox.createGrokSandboxProfile({worktree, bytes: rendered});
  const {dev: dirDev, ino: dirIno} = fs.lstatSync(directory);
  const {dev: fileDev, ino: fileIno} = fs.lstatSync(file);
  assert.deepEqual(entry, {
    path: file, sha256: sha256(rendered), dirCreated: true,
    directoryIdentity: {dev: dirDev, ino: dirIno}, fileIdentity: {dev: fileDev, ino: fileIno},
  });
  assert.equal(fs.statSync(file).mode & 0o777, 0o444);
  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  assert.deepEqual(fs.readFileSync(file), rendered);
  assert.deepEqual(sandbox.removeGrokSandboxProfile(entry), {removed: true, dirRemoved: true, violation: false});
  assert.equal(fs.existsSync(directory), false);
});

test('E5 exclusive creation preserves a preexisting file even with matching bytes', t => {
  const {worktree, directory, file} = fixture(t);
  fs.mkdirSync(directory);
  fs.writeFileSync(file, rendered);
  assert.throws(() => sandbox.createGrokSandboxProfile({worktree, bytes: rendered}), permissionError);
  assert.deepEqual(fs.readFileSync(file), rendered);
});

function replaceProfileSlot({worktree, directory, file}, kind) {
  if (kind === 'directory') {
    fs.renameSync(directory, path.join(worktree, 'original-grok'));
    fs.mkdirSync(directory);
  } else {
    fs.renameSync(file, path.join(worktree, 'original-profile'));
  }
  fs.writeFileSync(file, rendered);
  return fs.statSync(file).ino;
}

for (const kind of ['directory', 'file']) test(`E4/E5 creation rejects a concurrently replaced ${kind}`, t => {
  const paths = fixture(t);
  const originalChmod = fs.fchmodSync;
  let replacementIno;
  const chmod = t.mock.method(fs, 'fchmodSync', (fd, mode) => {
    originalChmod(fd, mode);
    replacementIno = replaceProfileSlot(paths, kind);
  });
  try {
    assert.throws(() => sandbox.createGrokSandboxProfile({worktree: paths.worktree, bytes: rendered}), permissionError);
  } finally {
    chmod.mock.restore();
  }
  assert.ok(replacementIno);
  assert.equal(fs.statSync(paths.file).ino, replacementIno);
  assert.deepEqual(fs.readFileSync(paths.file), rendered);
});

for (const kind of ['directory', 'file']) test(`E14/RF2 cleanup preserves a replacement ${kind} with the same profile bytes`, t => {
  const paths = fixture(t);
  const entry = sandbox.createGrokSandboxProfile({worktree: paths.worktree, bytes: rendered});
  const replacementIno = replaceProfileSlot(paths, kind);
  assert.deepEqual(sandbox.removeGrokSandboxProfile(entry), {removed: false, dirRemoved: false, violation: true});
  assert.equal(fs.statSync(paths.file).ino, replacementIno);
  assert.deepEqual(fs.readFileSync(paths.file), rendered);
});

for (const preexisting of [false, true]) test(`RF2 keeps neighboring files (directory preexisting: ${preexisting})`, t => {
  const {worktree, directory} = fixture(t);
  const userFile = path.join(directory, 'user-file');
  if (preexisting) {
    fs.mkdirSync(directory);
    fs.writeFileSync(userFile, 'preserved');
  }
  const entry = sandbox.createGrokSandboxProfile({worktree, bytes: rendered});
  if (!preexisting) fs.writeFileSync(userFile, 'preserved');
  assert.equal(entry.dirCreated, !preexisting);
  assert.deepEqual(sandbox.removeGrokSandboxProfile(entry), {removed: true, dirRemoved: false, violation: false});
  assert.equal(fs.readFileSync(userFile, 'utf8'), 'preserved');
});

for (const kind of ['missing', 'changed', 'symlink']) test(`E14 leaves a ${kind} profile slot alone`, t => {
  const {worktree, directory, file} = fixture(t);
  const entry = sandbox.createGrokSandboxProfile({worktree, bytes: rendered});
  fs.unlinkSync(file);
  if (kind === 'changed') fs.writeFileSync(file, 'changed');
  const target = path.join(worktree, 'target');
  if (kind === 'symlink') {
    fs.writeFileSync(target, rendered);
    fs.symlinkSync(target, file);
  }
  assert.deepEqual(sandbox.removeGrokSandboxProfile(entry), {removed: false, dirRemoved: false, violation: true});
  assert.equal(fs.statSync(directory).isDirectory(), true);
  if (kind === 'missing') assert.equal(fs.existsSync(file), false);
  if (kind === 'changed') assert.equal(fs.readFileSync(file, 'utf8'), 'changed');
  if (kind === 'symlink') assert.equal(fs.readlinkSync(file), target);
});

test('E7 checks the effective Grok home, real HOME and Grok home symlink', t => {
  const {worktree: userHome, directory: grokHome} = fixture(t);
  fs.mkdirSync(grokHome);
  const alias = path.join(userHome, 'alias');
  fs.symlinkSync(userHome, alias);
  const childEnv = {GROK_HOME: grokHome, HOME: alias};
  const check = env => sandbox.checkGrokHome({grokHome, userHome, childEnv: env});
  assert.equal(check(childEnv), true);
  assert.equal(check({GROK_HOME: grokHome}), true);
  assert.equal(check({...childEnv, GROK_HOME: path.join(userHome, 'different')}), false);
  assert.equal(check({HOME: userHome}), false);
  assert.equal(check({...childEnv, HOME: grokHome}), false);
  fs.rmdirSync(grokHome);
  fs.symlinkSync(userHome, grokHome);
  assert.equal(check(childEnv), false);
});

test('E9 takes only a regular event file as the baseline', t => {
  const {directory: grokHome} = fixture(t);
  const events = path.join(grokHome, 'sessions', 'sandbox-events.jsonl');
  assert.deepEqual(sandbox.grokEventsBaseline(grokHome), {exists: false, size: 0});
  fs.mkdirSync(path.dirname(events), {recursive: true});
  fs.writeFileSync(events, 'fixture\n');
  const {dev, ino} = fs.statSync(events);
  assert.deepEqual(sandbox.grokEventsBaseline(grokHome), {exists: true, dev, ino, size: 8});
  fs.unlinkSync(events);
  fs.symlinkSync(path.dirname(events), events);
  assert.throws(() => sandbox.grokEventsBaseline(grokHome));
  fs.unlinkSync(events);
  fs.mkdirSync(events);
  assert.throws(() => sandbox.grokEventsBaseline(grokHome));
});
