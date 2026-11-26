import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root));

// Omitting the whole-plan instruction could split one approved plan into per-task drafts.
test('planner profiles request one complete plan covering all top-level tasks', async () => {
  const { renderAgentProfile } = await import('../../lib/prompts/render.mjs');
  const registry = JSON.parse(await read('lib/prompts/agent-fragments.json'));
  for (const target of ['codex/agents/arc-planner.toml', 'claude/agents/arc-planner.md']) {
    const rendered = renderAgentProfile(target, await read(target), registry).toString();
    assert.ok(/one complete plan (?:draft )?(?:covering|containing) all top-level tasks/i.test(rendered), `${target} lacks the whole-plan instruction`);
  }
});

test('expands all approved profile templates to their independently recorded original bytes', async () => {
  let renderer;
  try { renderer = await import('../../lib/prompts/render.mjs'); } catch (error) {
    assert.fail(`fragment renderer must be available: ${error.message}`);
  }
  const registry = JSON.parse(await read('lib/prompts/agent-fragments.json'));
  const fixture = JSON.parse(await read('tests/node/fixtures/instruction-contracts.json'));
  assert.equal(registry.fragments.length, 26);
  assert.equal(registry.targets.length, 20);
  assert.deepEqual(registry.targets.map((target) => target.fragments.length), [8, 14, 10, 12, 11, 5, 12, 8, 10, 9, 6, 12, 8, 10, 9, 6, 12, 8, 10, 9]);
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
  const required = [
    "Architectural plan drafting requires the saved, Orchestrator-reviewed spec's path, version and SHA-256; NEVER draft a plan before or in parallel with the spec. The spec and plans receive one combined approval; Bounded work has no spec stage.",
    "without a separate spec approval; a fresh plan Planner drafts next.",
    "In the Architectural plan stage, whose brief cites the reviewed spec's path, version and SHA-256, always read brief-cited `references/writing-plans.md`, regardless of size, locality or risk. NEVER edit the spec; return needed spec changes under the question classification above.",
  ];
  const removed = ['Required written-spec approval precedes', 'obtains written-spec approval', 'After written-spec approval'];
  for (const { path } of targets) {
    const rendered = renderAgentProfile(path, await read(path), registry).toString();
    for (const phrase of required) assert.ok(rendered.includes(phrase), `${path} lacks: ${phrase}`);
    for (const phrase of removed) assert.ok(!rendered.includes(phrase), `${path} still has: ${phrase}`);
  }
});

test('rendered planner profiles carry design conversation inventory and question classification', async () => {
  const { renderAgentProfile } = await import('../../lib/prompts/render.mjs');
  const registry = JSON.parse(await read('lib/prompts/agent-fragments.json'));
  const targets = registry.targets.filter(({ path }) => /\/agents\/arc-planner\.(?:md|toml)$/.test(path));
  assert.equal(targets.length, 4);
  const conversation = "Converse through Orchestrator under planning.md's design conversation: each response is exactly one of one question, 2–3 approaches with a recommendation and a selection question, one design section with a confirmation question, or the final design (on the Architectural path, the start summary) with context, Spike/Bounded/Architectural path, options, tradeoffs, criteria and assumptions. Split each response into a user message, which Orchestrator relays unchanged, and Orchestrator notes. Ask one question at a time only when the answer changes the outcome and is not already answered; otherwise state your judgment and reason. Ask an open question about the user's reason before offering options. For a clear request, the first response may be a short design for approval; when the user says to proceed, stop asking and list the remaining author judgments. Each call carries a new user answer, relayed verbatim with any Orchestrator interpretation marked, or new evidence; without progress, return the blocked criterion, observed facts and needed decision as a hold. The same design Planner continues while role, context and source remain valid; conversation responses use no correction opportunity, and only the final design receives Orchestrator's one consolidated correction. Before the final design or Architectural start summary, build a decision inventory classifying each item as user decision, author judgment or already answered, mark every file or contract change or no change (reason) without ambiguous scope wording, and attach the author-judgment list.";
  const classification = "- In spec and plan stages, classify each drafting question: answered by the design or confirmed start summary → follow it and cite the basis; minor, with no deliverable change → decide it as an author judgment and list it with ID, judgment and reason (not an open decision); genuinely new decision that changes the deliverable and is absent from the design or confirmed start summary → return it as an open decision with why the design review or start confirmation missed it. Mark every file or contract change or no change (reason).";
  const plan = "When needed, return the complete proportional plan, dependencies, assumptions, author judgments, open decisions, verification needs and self-review.";
  const specHandoff = 'without a separate spec approval; a fresh plan Planner drafts next.';
  for (const { path } of targets) {
    const rendered = renderAgentProfile(path, await read(path), registry).toString();
    const lines = rendered.split('\n');
    const conversationIndex = lines.findIndex(line => line.startsWith('- ') && line.includes(conversation) && line.endsWith(specHandoff));
    assert.ok(conversationIndex >= 0, `${path} lacks the design conversation and spec handoff bullet`);
    assert.ok(lines[conversationIndex].includes("On the Architectural path there is no design document or design approval: after Orchestrator relays the start confirmation in a spec-stage delta brief, continue as the spec Planner and return a complete spec and self-review;"), path);
    assert.equal(lines[conversationIndex + 1], classification, path);
    assert.ok(lines.some(line => line.startsWith('- ') && line.includes(plan)), `${path} lacks the plan return fields`);
    assert.ok(!rendered.includes('and focused questions'), `${path} retains obsolete design questions wording`);
  }
});
