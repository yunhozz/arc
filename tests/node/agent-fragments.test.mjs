import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root));

test('expands all approved profile templates to their independently recorded original bytes', async () => {
  let renderer;
  try { renderer = await import('../../lib/prompts/render.mjs'); } catch (error) {
    assert.fail(`fragment renderer must be available: ${error.message}`);
  }
  const registry = JSON.parse(await read('lib/prompts/agent-fragments.json'));
  const fixture = JSON.parse(await read('tests/node/fixtures/instruction-contracts.json'));
  assert.equal(registry.fragments.length, 25);
  assert.equal(registry.targets.length, 10);
  assert.deepEqual(registry.targets.map((target) => target.fragments.length), [8, 13, 10, 12, 11, 5, 11, 8, 10, 9]);
  for (const target of registry.targets) {
    const source = await read(target.path);
    const before = Buffer.from(source);
    const expanded = renderer.renderAgentProfile(target.path, source, registry);
    assert.deepEqual(source, before);
    assert.equal(createHash('sha256').update(expanded).digest('hex'), fixture.agentProfileBaseline.profiles[target.path]);
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
