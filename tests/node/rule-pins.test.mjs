import test from 'node:test';
import assert from 'node:assert/strict';
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
const pendingW2 = [
  'tests/node/test-scope-contract.test.mjs',
  'tests/node/composite-instructions.test.mjs',
  'tests/node/plan-level-records-contract.test.mjs',
  'tests/node/run-mode-contract.test.mjs',
  'tests/test_arc_policy.py',
  'tests/test_claude_payload.py',
  'tests/test_harness_contract.py',
];

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

test('rule pin texts appear in no other test file', () => {
  const excluded = new Set([
    'tests/node/fixtures/rule-pins.json',
    'tests/installer-parity.json',
    'tests/node/fixtures/installed-layout-golden.json',
    ...pendingW2,
  ]);
  const pins = fixture.rules.map(({ id, text }) => ({
    id, plain: ws(text), escaped: ws(JSON.stringify(text).slice(1, -1)),
  }));
  const duplicates = [];
  for (const name of testFiles('tests')) {
    if (excluded.has(name)) continue;
    const content = ws(read(name));
    for (const { id, plain, escaped } of pins) {
      if (content.includes(plain) || content.includes(escaped)) duplicates.push(`${id} ${name}`);
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
