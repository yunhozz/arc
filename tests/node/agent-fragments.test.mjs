import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root));

test('expands all approved profile templates to their independently recorded original bytes', async () => {
  let renderer;
  try { renderer = await import('../../lib/prompts/render.mjs'); } catch (error) {
    assert.fail(`fragment renderer must be available: ${error.message}`);
  }
  const registry = JSON.parse(await read('lib/prompts/agent-fragments.json'));
  const fragments = new Map(registry.fragments.map(({id, text}) => [id, text]));
  assert.equal(registry.fragments.length, 26);
  assert.equal(registry.targets.length, 20);
  assert.deepEqual(registry.targets.map((target) => target.fragments.length), [8, 14, 10, 12, 11, 8, 14, 10, 12, 11, 6, 12, 8, 10, 9, 6, 12, 8, 10, 9]);
  for (const target of registry.targets) {
    const source = await read(target.path);
    const before = Buffer.from(source);
    const expanded = renderer.renderAgentProfile(target.path, source, registry).toString();
    assert.deepEqual(source, before);
    assert.ok(!expanded.includes('{{ARC_AGENT_FRAGMENT:'), target.path);
    let end = 0;
    for (const id of target.fragments) {
      const text = fragments.get(id);
      const start = expanded.indexOf(text);
      assert.ok(start >= end, `${target.path}: missing or out-of-order fragment ${id}`);
      assert.equal(expanded.indexOf(text, start + text.length), -1, `${target.path}: duplicate fragment ${id}`);
      end = start + text.length;
    }
  }
});

test('rejects altered inventory and markers outside the authorized body', async () => {
  const { validateAgentRegistry, renderAgentProfile } = await import('../../lib/prompts/render.mjs');
  const registry = JSON.parse(await read('lib/prompts/agent-fragments.json'));
  const changed = structuredClone(registry);
  changed.targets[0].fragments.reverse();
  assert.throws(() => validateAgentRegistry(changed));
  const duplicate = structuredClone(registry);
  duplicate.fragments.push(duplicate.fragments[0]);
  assert.throws(() => validateAgentRegistry(duplicate));
  const target = registry.targets[0];
  const bytes = await read(target.path);
  const text = bytes.toString();
  const marker = `{{ARC_AGENT_FRAGMENT:${target.fragments[0]}}}`;
  assert.throws(() => renderAgentProfile(target.path, Buffer.from(text.replace(marker, '')), registry));
  assert.throws(() => renderAgentProfile(target.path, Buffer.from(text.replace(marker, marker + marker)), registry));
  assert.throws(() => renderAgentProfile(target.path, Buffer.from(text.replace(marker, '{{ARC_AGENT_FRAGMENT:unknown}}')), registry));
  assert.throws(() => renderAgentProfile(target.path, Buffer.from(text.replace(marker, '{{ARC_AGENT_FRAGMENT:bad')), registry));
  assert.throws(() => renderAgentProfile(target.path, Buffer.from(text.replace('---\n', `---\n${marker}\n`)), registry));
});

test('rejects commit language policy markers in agent fragments', async () => {
  const { validateAgentRegistry } = await import('../../lib/prompts/render.mjs');
  const registry = JSON.parse(await read('lib/prompts/agent-fragments.json'));
  assert.doesNotThrow(() => validateAgentRegistry(registry));
  const changed = structuredClone(registry);
  changed.fragments[0].text += ' {{ARC_COMMIT_LANGUAGE_POLICY}}';
  assert.throws(() => validateAgentRegistry(changed), /Invalid fragment/);
});

test('preserves CRLF and does not mutate the registry across deterministic renders', async () => {
  const { renderAgentProfile } = await import('../../lib/prompts/render.mjs');
  const registry = JSON.parse(await read('lib/prompts/agent-fragments.json'));
  const before = structuredClone(registry);
  const target = registry.targets[0];
  const source = Buffer.from((await read(target.path)).toString().replaceAll('\n', '\r\n'));
  const first = renderAgentProfile(target.path, source, registry);
  assert.deepEqual(first, renderAgentProfile(target.path, source, registry));
  assert.deepEqual(registry, before);
  assert.equal(first.toString().replaceAll('\r\n', '').includes('\n'), false);
});

test('rejects Codex markers hidden in a multiline description instead of root instructions', async () => {
  const { renderAgentProfile } = await import('../../lib/prompts/render.mjs');
  const { parseToml } = await import('../../lib/models/config.mjs');
  const registry = JSON.parse(await read('lib/prompts/agent-fragments.json'));
  const target = registry.targets.find(item => item.path === 'codex/agents/arc-implementer.toml');
  const markers = target.fragments.map(id => `{{ARC_AGENT_FRAGMENT:${id}}}`).join('\n');
  const source = (await read(target.path)).toString().replace(/\{\{ARC_AGENT_FRAGMENT:[^}]+\}\}/g, '');
  const fake = source.replace(/^description = .*$/m, `description = '''\ndeveloper_instructions = """\n${markers}\n"""\n'''`);
  assert.doesNotThrow(() => parseToml(fake));
  assert.throws(() => renderAgentProfile(target.path, Buffer.from(fake), registry), /Invalid profile markers/);
});


test('rendered planner profiles require a reviewed spec and one combined approval', async () => {
  const { renderAgentProfile } = await import('../../lib/prompts/render.mjs');
  const registry = JSON.parse(await read('lib/prompts/agent-fragments.json'));
  const targets = registry.targets.filter(({ path }) => /\/agents\/arc-planner\.(?:md|toml)$/.test(path));
  assert.equal(targets.length, 4);
  const removed = ['Required written-spec approval precedes', 'obtains written-spec approval', 'After written-spec approval'];
  for (const { path } of targets) {
    const rendered = renderAgentProfile(path, await read(path), registry).toString();
    for (const phrase of removed) assert.ok(!rendered.includes(phrase), `${path} still has: ${phrase}`);
  }
});

test('rendered planner profiles carry design conversation inventory and question classification', async () => {
  const { renderAgentProfile } = await import('../../lib/prompts/render.mjs');
  const registry = JSON.parse(await read('lib/prompts/agent-fragments.json'));
  const targets = registry.targets.filter(({ path }) => /\/agents\/arc-planner\.(?:md|toml)$/.test(path));
  assert.equal(targets.length, 4);
  for (const { path } of targets) {
    const rendered = renderAgentProfile(path, await read(path), registry).toString();
    assert.ok(!rendered.includes('and focused questions'), `${path} retains obsolete design questions wording`);
  }
});
