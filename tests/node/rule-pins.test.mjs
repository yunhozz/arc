import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentsBlockBody } from '../../lib/installer/global-config.mjs';
import { renderAgentProfile } from '../../lib/prompts/render.mjs';
import { effectiveSection, effectiveText } from './fixtures/effective-doc.mjs';
import fixture from './fixtures/rule-pins.json' with { type: 'json' };

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const registry = JSON.parse(read('lib/prompts/agent-fragments.json'));
const ws = (text) => text.replace(/\s+/g, ' ');
const platforms = ['claude', 'codex', 'gemini', 'grok'];
const categories = ['approval', 'prohibition', 'permission', 'git', 'external', 'role-boundary'];
const docs = [
  'core', 'arc-visual-companion', 'commit', 'coordination', 'git-recovery', 'handoff',
  'handoff-prep', 'limits', 'planning', 'verification', 'worktree-creation',
  'shared:handoff-worktree', 'agent:implementer', 'agent:planner', 'agent:reviewer',
  'agent:scouter', 'agent:tester', 'bootstrap',
];
const j32Protected = {
  'RP-283': ['PolicyContractTests.test_commit_checker_preserves_hold_and_reuse_contracts'],
  'RP-284': ['PolicyContractTests.test_commit_checker_preserves_hold_and_reuse_contracts'],
  'RP-676': ['COMMIT_RULE_PATTERN', 'COMMON_CONTRACTS'],
};

function targetText(platform, doc) {
  if (doc === 'bootstrap') return agentsBlockBody(`/Users/u/.${platform}`, '/Users/u', 'en', platform);
  if (doc === 'shared:handoff-worktree') return read('shared/skill/references/handoff-worktree.md');
  if (doc.startsWith('agent:')) {
    const ext = platform === 'codex' ? 'toml' : 'md';
    const target = `${platform}/agents/arc-${doc.slice('agent:'.length)}.${ext}`;
    return renderAgentProfile(target, fs.readFileSync(path.join(root, target)), registry).toString();
  }
  return effectiveText(platform, doc);
}

test('rule pins follow the schema', () => {
  assert.equal(fixture.version, 1);
  const ids = new Set();
  const pairs = new Map();
  for (const rule of fixture.rules) {
    const { id, doc, text, origin, category } = rule;
    assert.match(id, /^RP-\d{3}$/);
    assert.ok(!ids.has(id), id);
    ids.add(id);
    assert.ok(docs.includes(doc), id);
    assert.ok(categories.includes(category), id);
    assert.ok(Array.isArray(rule.platforms) && rule.platforms.length > 0 &&
      rule.platforms.every((platform) => platforms.includes(platform)), id);
    assert.ok(Array.isArray(origin) && origin.length > 0, id);
    assert.ok(typeof text === 'string' && text.trim().length > 0, id);
    const pair = JSON.stringify([doc, ws(text)]);
    const previous = pairs.get(pair) ?? [];
    for (const other of previous) {
      assert.ok(rule.mergedFrom?.includes(other.id) && other.mergedFrom?.includes(id), `${other.id}/${id}`);
    }
    pairs.set(pair, [...previous, rule]);
  }
});

test('every rule pin appears in its target text on each platform', () => {
  for (const { id, doc, platforms, text } of fixture.rules) {
    for (const platform of platforms) {
      assert.ok(ws(targetText(platform, doc)).includes(ws(text)), `${id}/${platform}`);
    }
  }
});

function* testFiles(directory) {
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const name = `${directory}/${entry.name}`;
    if (entry.isDirectory()) yield* testFiles(name);
    if (entry.isFile() && /\.(mjs|py|json)$/.test(name)) yield name;
  }
}

function protectedRange(lines, name) {
  if (!name.includes('.')) {
    const start = lines.findIndex(line => line.startsWith(`${name} = `));
    assert.notEqual(start, -1, name);
    const close = { '(': ')', '{': '}' }[lines[start].at(-1)];
    assert.ok(close, name);
    const end = lines.indexOf(close, start + 1);
    assert.notEqual(end, -1, name);
    return [start, end + 1];
  }
  const [className, methodName] = name.split('.');
  const classStart = lines.findIndex(line => line.startsWith(`class ${className}(`));
  assert.notEqual(classStart, -1, name);
  const classEnd = lines.findIndex((line, index) => index > classStart && /^\S/.test(line));
  const members = lines.slice(classStart + 1, classEnd === -1 ? lines.length : classEnd);
  const methodStart = members.findIndex(line => line.startsWith(`    def ${methodName}(`));
  assert.notEqual(methodStart, -1, name);
  const methodEnd = members.findIndex((line, index) => index > methodStart && /^ {4}\S/.test(line));
  const start = classStart + 1 + methodStart;
  const end = methodEnd === -1 ? classStart + 1 + members.length : classStart + 1 + methodEnd;
  return [start + 1, end];
}

function pythonStrings(source) {
  const script = [
    'import ast, json, sys',
    'tree = ast.parse(sys.stdin.read())',
    'print(json.dumps([(node.lineno - 1, node.end_lineno, node.value)',
    '    for node in ast.walk(tree)',
    '    if isinstance(node, ast.Constant) and isinstance(node.value, str)]))',
  ].join('\n');
  return JSON.parse(execFileSync('python3', ['-B', '-c', script], {
    input: source,
    encoding: 'utf8',
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  }));
}

function searchableParts(lines, strings, start, end) {
  return [ws(lines.slice(start, end).join('\n')), ...strings
    .filter(([first, last]) => start <= first && last <= end)
    .map(([, , value]) => ws(value))];
}

const containsPin = (part, pin) => part.includes(pin.plain) || part.includes(pin.escaped);

test('rule pin texts appear in no other test file', () => {
  const excluded = new Set([
    'tests/node/fixtures/rule-pins.json',
    'tests/installer-parity.json',
    'tests/node/fixtures/installed-layout-golden.json',
  ]);
  const pins = fixture.rules.map(({ id, text }) => ({
    id, plain: ws(text), escaped: ws(JSON.stringify(text).slice(1, -1)),
  }));
  const protectedFile = 'tests/test_harness_contract.py';
  const protectedSource = read(protectedFile);
  const protectedLines = protectedSource.split(/\r?\n/);
  const protectedStrings = pythonStrings(protectedSource);
  const protectedOutside = new Map();
  for (const [id, names] of Object.entries(j32Protected)) {
    const pin = pins.find(pin => pin.id === id);
    assert.ok(pin, `Unknown J32 rule pin ${id}`);
    const ranges = names.map(name => {
      const [start, end] = protectedRange(protectedLines, name);
      const body = searchableParts(protectedLines, protectedStrings, start, end);
      assert.ok(body.some(part => containsPin(part, pin)), `${id} is absent from ${name}`);
      return [start, end];
    }).sort(([a], [b]) => a - b);
    const outside = ranges.flatMap(([start], index) =>
      searchableParts(protectedLines, protectedStrings, ranges[index - 1]?.[1] ?? 0, start));
    outside.push(...searchableParts(protectedLines, protectedStrings, ranges.at(-1)[1], protectedLines.length));
    protectedOutside.set(id, outside);
  }
  const duplicates = [];
  for (const name of testFiles('tests')) {
    if (excluded.has(name)) continue;
    const source = name === protectedFile ? protectedSource : read(name);
    const strings = name === protectedFile ? protectedStrings : name.endsWith('.py') ? pythonStrings(source) : [];
    const content = [ws(source), ...strings.map(([, , value]) => ws(value))];
    for (const pin of pins) {
      const parts = (name === protectedFile && protectedOutside.get(pin.id)) || content;
      if (parts.some(part => containsPin(part, pin))) duplicates.push(`${pin.id} ${name}`);
    }
  }
  assert.deepEqual(duplicates, []);
});

test('effective sections join platform and shared parts', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-effective-doc-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const local = '## Scope\nPlatform text\n## Next\nOther text';
  const shared = '# Shared\n## Scope\nFirst part\n### Details\nMore details\n## Scope\nSecond part\n# End';
  for (const [directory, filename, text] of [
    ['codex', 'handoff.md', local], ['shared', 'handoff-common.md', shared],
  ]) {
    const references = path.join(temp, directory, 'skill', 'references');
    fs.mkdirSync(references, { recursive: true });
    fs.writeFileSync(path.join(references, filename), text);
  }
  assert.equal(effectiveText('codex', 'handoff', temp), `${local}\n${shared}`);
  assert.equal(effectiveSection('codex', 'handoff', '## Scope', temp),
    '## Scope\nPlatform text\n## Scope\nFirst part\n### Details\nMore details\n## Scope\nSecond part');
  assert.throws(() => effectiveSection('codex', 'handoff', '## Missing', temp), /Missing heading/);
});
