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

for (const phase of ['partial write', 'complete write', 'opened identity', 'chmod']) test(`M1 reports cleanup after a failed ${phase}`, t => {
  const {worktree, file} = fixture(t);
  const failure = Error('injected profile creation failure');
  const method = phase === 'opened identity' ? 'fstatSync' : phase === 'chmod' ? 'fchmodSync' : 'writeFileSync';
  const write = fs.writeFileSync;
  const injection = t.mock.method(fs, method, (fd, bytes) => {
    if (phase === 'complete write') write(fd, bytes);
    if (phase === 'partial write') fs.writeSync(fd, bytes.subarray(0, 8));
    throw failure;
  });
  const retained = phase === 'partial write' || phase === 'opened identity';
  try {
    assert.throws(() => sandbox.createGrokSandboxProfile({worktree, bytes: rendered}), {
      ...permissionError, cause: failure,
      cleanup: {path: file, retained, violation: retained, dirRemoved: !retained},
    });
  } finally {
    injection.mock.restore();
  }
  if (retained) assert.deepEqual(fs.readFileSync(file), rendered.subarray(0, phase === 'partial write' ? 8 : 0));
  else assert.equal(fs.existsSync(file), false);
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

const worktreeRealpath = '/fixture/worktree';
const name = 'arc-bridge-0123abcd';
const spawnAtMs = Date.parse('2026-11-19T10:22:45.232Z');
const profileApplied = {
  timestamp: '2026-11-19T10:22:45.232832Z',
  event_type: 'ProfileApplied',
  profile: name,
  workspace: worktreeRealpath,
  platform: 'macos/seatbelt',
  enforced: true,
  restrict_network: false,
  read_write_paths: [worktreeRealpath],
  deny_paths: ['/fixture/worktree/.grok/sandbox.toml'],
};
const appliedEvidence = {timestamp: '2026-11-19T10:22:45.232832Z', enforced: true, inherited: false, denyOk: true};
const eventLine = overrides => JSON.stringify({...profileApplied, ...overrides}) + '\n';
const baseline = {exists: true, dev: 1, ino: 2, size: 128};
const appliedContext = {spawnAtMs, name, worktreeRealpath};

function evaluateApplied(text, overrides = {}) {
  return sandbox.evaluateGrokProfileApplied({
    ...appliedContext, text, baseline,
    current: {...baseline, regular: true, size: baseline.size + Buffer.byteLength(text)},
    ...overrides,
  });
}

for (const [label, input, overrides] of [
  ['one candidate in the spawn millisecond', eventLine()],
  ['a candidate with inherited explicitly false', eventLine({inherited: false})],
  ['an unrelated malformed line', '{bad json\n' + eventLine()],
  ['an incomplete trailing candidate', eventLine() + eventLine().trimEnd()],
  ['other profiles and workspaces', eventLine({profile: 'other'}) + eventLine({workspace: '/other'}) + eventLine()],
  ['no pre-spawn event file', eventLine(), {
    baseline: {exists: false, size: 0}, current: {exists: true, regular: true, dev: 1, ino: 2, size: Buffer.byteLength(eventLine())},
  }],
]) test(`AC7 ProfileApplied accepts ${label}`, () => {
  assert.equal(typeof sandbox.evaluateGrokProfileApplied, 'function');
  assert.deepEqual(evaluateApplied(input, overrides), {ok: true, reason: null, candidates: 1, applied: appliedEvidence});
});

for (const [label, input, reason, candidates] of [
  ['no event', '', 'no_candidate', 0],
  ['an incomplete line alone', eventLine().trimEnd(), 'no_candidate', 0],
  ['duplicate candidates', eventLine().repeat(2), 'multiple_candidates', 2],
  ['another event type', eventLine({event_type: 'Other'}), 'no_candidate', 0],
  ['another profile', eventLine({profile: 'other'}), 'no_candidate', 0],
  ['another workspace', eventLine({workspace: '/other'}), 'no_candidate', 0],
  ['one millisecond before spawn', eventLine({timestamp: '2026-11-19T10:22:45.231832Z'}), 'no_candidate', 0],
  ['an invalid timestamp next to a valid event', eventLine({timestamp: 'invalid'}) + eventLine(), 'timestamp_invalid', 2],
  ['enforced false', eventLine({enforced: false}), 'not_enforced', 1],
  ['enforced absent', eventLine({enforced: undefined}), 'not_enforced', 1],
  ['an inherited profile', eventLine({inherited: true}), 'inherited', 1],
  ['deny_paths absent', eventLine({deny_paths: undefined}), 'deny_missing', 1],
  ['deny_paths as a string', eventLine({deny_paths: '/fixture/worktree/.grok/sandbox.toml'}), 'deny_missing', 1],
  ['deny_paths without the profile', eventLine({deny_paths: ['/other']}), 'deny_missing', 1],
]) test(`AC7 ProfileApplied rejects ${label}`, () => {
  assert.deepEqual(evaluateApplied(input), {ok: false, reason, candidates, applied: null});
});

for (const [changes, reason] of [
  [{regular: false}, 'not_regular'],
  [{ino: 3}, 'rotated'],
  [{size: baseline.size - 1}, 'truncated'],
  [{size: baseline.size + 4194305}, 'too_large'],
]) test(`AC7 ProfileApplied rejects event file metadata with ${reason}`, () => {
  const current = {...baseline, regular: true, ...changes};
  assert.deepEqual(evaluateApplied('', {current}), {ok: false, reason, candidates: 0, applied: null});
});

test('AC7 event reader scans only the appended interval and preserves the file', t => {
  const {directory: grokHome} = fixture(t);
  const events = path.join(grokHome, 'sessions', 'sandbox-events.jsonl');
  fs.mkdirSync(path.dirname(events), {recursive: true});
  fs.writeFileSync(events, eventLine());
  const baseline = sandbox.grokEventsBaseline(grokHome);
  fs.appendFileSync(events, eventLine());
  assert.equal(typeof sandbox.readGrokProfileApplied, 'function');
  assert.deepEqual(sandbox.readGrokProfileApplied({grokHome, baseline, ...appliedContext}), {
    ok: true, reason: null, candidates: 1, applied: appliedEvidence,
  });
  assert.equal(fs.readFileSync(events, 'utf8'), eventLine().repeat(2));
});

test('grokConfigSecurityProjection keeps only security keys', () => {
  const project = source => sandbox.grokConfigSecurityProjection(Buffer.from(source));
  const config = 'model = "a"\npermission_mode = "ask"\n[compat.claude]\nagents = false';
  const expected = '\tpermission_mode = "ask"\ncompat.claude\t[compat.claude]\ncompat.claude\tagents = false';
  assert.equal(project(config), expected);
  for (const source of [
    config.replace('"a"', '"b"'),
    '# display preferences\n' + config,
    config + '\n[ui]\ntheme = "dark"',
  ]) assert.equal(project(source), expected);
  for (const source of [
    config.replace('"ask"', '"always-approve"'),
    config.replace('agents = false', 'agents = true'),
    'sandbox_profile = "x"\n' + config,
    config + '\n[sandbox]\nmode = "workspace"',
  ]) assert.notEqual(project(source), expected);
  assert.equal(project('model = """multi\nline"""'), null);
  assert.equal(project("model = '''multi\nline'''"), null);
  assert.equal(project([0xff]), null);
});

test('grokConfigSecurityProjection includes quoted and dotted security keys', async t => {
  const model = 'model = "a"\n';
  for (const change of [
    '"permission_mode" = "always-approve"',
    'sandbox.x = 1',
    '"sandbox".x = 1',
    'compat . claude . agents = true',
    '[ "compat" . claude ]\nagents = true',
  ]) {
    await t.test(change, () => {
      const projection = sandbox.grokConfigSecurityProjection(Buffer.from(model + change));
      assert.equal(typeof projection, 'string');
      assert.ok(projection.includes(change.split('\n').at(-1)));
    });
  }
  assert.equal(sandbox.grokConfigSecurityProjection(Buffer.from('"sandbox.x" = 1')), '');
});

test('grokConfigSecurityProjection falls back for escaped or unbalanced keys', async t => {
  for (const config of ['"sand\\u0062ox".x = 1', '"sandbox.x = 1']) {
    await t.test(config, () => {
      assert.equal(sandbox.grokConfigSecurityProjection(Buffer.from(config)), null);
    });
  }
});

test('grokConfigSecurityProjection keeps the root table across nested array values', () => {
  const project = source => sandbox.grokConfigSecurityProjection(Buffer.from(source));
  const config = 'x = [\n[1]\n]\n';
  assert.equal(project(config), '');
  assert.equal(project(config + 'permission_mode = "always-approve"'), '\tpermission_mode = "always-approve"');
});

test('grokConfigSecurityProjection detects changes inside a multiline sandbox array', () => {
  const project = source => sandbox.grokConfigSecurityProjection(Buffer.from(source));
  const config = 'sandbox_paths = [\n"/a"\n]\n';
  const before = project(config);
  const after = project(config.replace('/a', '/b'));
  assert.equal(typeof before, 'string');
  assert.equal(typeof after, 'string');
  assert.notEqual(after, before);
});

test('grokConfigSecurityProjection includes permission_mode anywhere in the effective path', () => {
  const project = source => sandbox.grokConfigSecurityProjection(Buffer.from(source));
  assert.equal(project('[ui]\npermission_mode = "x"'), 'ui\tpermission_mode = "x"');
  assert.equal(project('ui.permission_mode.override = true'), '\tui.permission_mode.override = true');
});

test('grokConfigSecurityProjection ignores array brackets in strings and comments', () => {
  const config = [
    'x = [ # ]',
    '"escaped quote: \\" and bracket: ]",',
    "'literal quote: \" and bracket: [',",
    ']',
    'permission_mode = "ask"',
  ].join('\n');
  assert.equal(sandbox.grokConfigSecurityProjection(Buffer.from(config)), '\tpermission_mode = "ask"');
});

test('grokConfigSecurityProjection falls back for an unclosed array or a value quote spanning lines', async t => {
  for (const config of ['x = [\n1', 'x = [\n"first\nsecond"\n]']) {
    await t.test(config, () => {
      assert.equal(sandbox.grokConfigSecurityProjection(Buffer.from(config)), null);
    });
  }
});
