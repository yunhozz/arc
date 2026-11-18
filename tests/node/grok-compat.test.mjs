import test from 'node:test';
import assert from 'node:assert/strict';
import {renderGrokCompat, removeGrokCompat} from '../../lib/installer/grok-compat.mjs';
import {parseToml} from '../../lib/models/config.mjs';
import {DEFAULT_INSTALLER_REGISTRY} from '../../lib/platforms/index.mjs';

const table = '[compat.claude] # arc:managed\nagents = false # arc:managed\nskills = false # arc:managed\nrules = false # arc:managed\n';
const render = text => renderGrokCompat(Buffer.from(text));

// Missing edits, unsafe overwrites and byte normalization violate the config contract.
test('null creates managed table', () => {
  const result = renderGrokCompat(null);
  assert.deepEqual(result.content, Buffer.from(table));
  assert.equal(result.action, 'set Grok Claude compatibility');
  assert.deepEqual(result.notes, ['set [compat.claude] agents, skills, rules = false (arc:managed)']);
});
test('empty or comment-only file gets managed table', () => {
  for (const text of ['', '# c\n']) assert.equal(render(text).content.toString(), text + table);
});
test('appends with CRLF and missing final EOL preserved', () => {
  assert.equal(render('[cli]\r\ninstaller = "npm"').content.toString(), '[cli]\r\ninstaller = "npm"\r\n[compat.claude] # arc:managed\r\nagents = false # arc:managed\r\nskills = false # arc:managed\r\nrules = false # arc:managed\r\n');
});
test('inserts at end of existing unmarked table before next header', () => {
  assert.equal(render('[compat.claude]\nmcps = true\n[other]\nx = 1\n').content.toString(), '[compat.claude]\nmcps = true\nagents = false # arc:managed\nskills = false # arc:managed\nrules = false # arc:managed\n[other]\nx = 1\n');
});
test('subtable-only appends managed header at EOF', () => {
  const result = render('[compat.claude.extra]\nx = 1\n');
  assert.equal(result.content.toString(), '[compat.claude.extra]\nx = 1\n' + table);
  assert.deepEqual(parseToml(result.content).compat.claude, parseToml('[compat.claude]\nagents = false\nskills = false\nrules = false\n[compat.claude.extra]\nx = 1\n').compat.claude);
});
test('user false is kept with note', () => {
  const result = render('[compat.claude]\nagents = false\n');
  assert.equal(result.content.toString(), '[compat.claude]\nagents = false\nskills = false # arc:managed\nrules = false # arc:managed\n');
  assert.deepEqual(result.notes, ['[compat.claude] agents = false is user-owned and kept', 'set [compat.claude] skills, rules = false (arc:managed)']);
});
test('user true aborts', () => {
  assert.throws(() => render('[compat.claude]\nskills = true\n'), {message: '[compat.claude] skills = true is set by the user; set it to false or remove it'});
});
test('managed reinstall is unchanged', () => {
  const first = renderGrokCompat(null), result = renderGrokCompat(first.content);
  assert.deepEqual(result.content, first.content);
  assert.equal(result.action, 'unchanged');
  assert.deepEqual(result.notes, []);
});
test('managed true resets to false', () => {
  const result = render(table.replace('agents = false', 'agents = true'));
  assert.equal(result.content.toString(), table);
  assert.deepEqual(result.notes, ['[compat.claude] agents reset to false (arc:managed)', 'set [compat.claude] agents = false (arc:managed)']);
});
for (const [input, message] of [
  [Buffer.from([0xff]), 'config.toml is not UTF-8'],
  ['[compat.claude\n', 'TOML parse failed'],
  ...['compat = 1\n', 'compat = {claude = {agents = false}}\n', 'compat.claude.agents = false\n', '[compat]\nclaude = {agents = false}\n'].map(text => [text, '[compat.claude] uses an unsupported representation']),
  ['[compat.claude]\nagents = "no"\n', '[compat.claude] agents must be a boolean'],
  ['[compat.claude]\n"agents" = false\n', '[compat.claude] agents uses an unsupported representation'],
  ['[compat.claude]\nagents = false\nagents = false # arc:managed\n', /^(TOML parse failed|\[compat\.claude\] agents uses an unsupported representation)$/],
]) test(`unsupported inputs abort: ${JSON.stringify(input)}`, () => {
  assert.throws(() => renderGrokCompat(Buffer.from(input)), {message});
});
test('BOM is preserved or rejected', () => {
  const bom = Buffer.from([0xef, 0xbb, 0xbf]), input = Buffer.concat([bom, Buffer.from('[cli]\nx = 1\n')]);
  let result;
  try {result = renderGrokCompat(input);} catch (error) {assert.equal(error.message, 'TOML parse failed'); return;}
  assert.deepEqual(result.content.subarray(0, 3), bom);
});
test('BOM managed table reinstall preserves all bytes unchanged', () => {
  const input = Buffer.from('\uFEFF' + table), result = renderGrokCompat(input);
  assert.deepEqual(result.content, input);
  assert.equal(result.action, 'unchanged');
  assert.deepEqual(result.notes, []);
});
test('BOM user true aborts with the user-owned setting reason', () => {
  assert.throws(() => render('\uFEFF[compat.claude]\nagents = true\n'), {message: '[compat.claude] agents = true is set by the user; set it to false or remove it'});
});
test('BOM subtable-only config appends managed header at EOF', () => {
  const result = render('\uFEFF[compat.claude.extra]\nx = 1\n');
  assert.deepEqual(result.content, Buffer.from('\uFEFF[compat.claude.extra]\nx = 1\n' + table));
});
test('render rejects a table-like multiline string with the safe edit reason', () => {
  assert.throws(() => render('x = """\n[compat.claude]\nagents = false # arc:managed\n"""\n'), {message: 'cannot verify the safe edit'});
});
test('render keeps the safe edit rejection for a header-only multiline string', () => {
  assert.throws(() => render('x = """\n[compat.claude]\nfoo\n"""\n'), {message: 'cannot verify the safe edit'});
});

test('remove missing or unmanaged config leaves it alone', () => {
  assert.deepEqual(removeGrokCompat(null), {content: null, notes: []});
  assert.deepEqual(removeGrokCompat(Buffer.from('[compat.claude]\nagents = false\n')), {content: null, notes: []});
});
test('remove BOM managed table preserves exactly the BOM bytes', () => {
  const result = removeGrokCompat(Buffer.from('\uFEFF' + table));
  assert.deepEqual(result.content, Buffer.from([0xef, 0xbb, 0xbf]));
  assert.deepEqual(result.notes, ['restored [compat.claude] managed lines']);
});
test('remove rejects a table-like multiline string with the safe edit reason', () => {
  assert.throws(() => removeGrokCompat(Buffer.from('x = """\n[compat.claude]\nagents = false # arc:managed\n"""\n')), {message: 'cannot verify the safe edit'});
});
test('remove leaves a table-like multiline string without managed keys alone', () => {
  assert.deepEqual(removeGrokCompat(Buffer.from('x = """\n[compat.claude]\nfoo\n"""\n')), {content: null, notes: []});
});
test('remove rejects a managed header inside a multiline string with the safe edit reason', () => {
  assert.throws(() => removeGrokCompat(Buffer.from('x = """\n[compat.claude] # arc:managed\n"""\n')), {message: 'cannot verify the safe edit'});
});
for (const [name, input, expected] of [
  ['managed table becomes empty file', table, ''],
  ['keeps managed header with user keys', '[cli]\ninstaller = "npm"\n[compat.claude] # arc:managed\nmcps = true\nagents = false # arc:managed\n', '[cli]\ninstaller = "npm"\n[compat.claude] # arc:managed\nmcps = true\n'],
  ['keeps unmarked header and removes managed true', '[compat.claude]\nagents = true # arc:managed\n', '[compat.claude]\n'],
  ['keeps comments and blank lines', '[compat.claude] # arc:managed\n# note\n\nagents = false # arc:managed\n', '# note\n\n'],
  ['removes CRLF table', table.replaceAll('\n', '\r\n'), ''],
  ['preserves CRLF user bytes', '[cli]\r\ninstaller = "npm"\r\n' + table.replaceAll('\n', '\r\n'), '[cli]\r\ninstaller = "npm"\r\n'],
]) test(`remove ${name}`, () => {
  const result = removeGrokCompat(Buffer.from(input));
  assert.deepEqual(result.content, Buffer.from(expected));
  assert.deepEqual(result.notes, ['restored [compat.claude] managed lines']);
});
test('remove rejects invalid UTF-8 or TOML', () => {
  assert.throws(() => removeGrokCompat(Buffer.from([0xff])), {message: 'config.toml is not UTF-8'});
  assert.throws(() => removeGrokCompat(Buffer.from('[[x\n')), {message: 'TOML parse failed'});
});
test('only grok descriptor defines global hooks', () => {
  for (const id of ['claude', 'codex', 'gemini']) {
    const config = DEFAULT_INSTALLER_REGISTRY.getPlatform(id).runtimeConfig;
    assert.equal(Object.hasOwn(config, 'globalRender'), false);
    assert.equal(Object.hasOwn(config, 'globalRemove'), false);
  }
  const config = DEFAULT_INSTALLER_REGISTRY.getPlatform('grok').runtimeConfig;
  assert.equal(typeof config.globalRender, 'function');
  assert.equal(typeof config.globalRemove, 'function');
});
