import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {effectiveSection, effectiveText} from './fixtures/effective-doc.mjs';
import {agentsBlockBody} from '../../lib/installer/global-config.mjs';
import {validateAgentRegistry} from '../../lib/prompts/render.mjs';

const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const platforms = ['claude', 'codex', 'gemini', 'grok'];
const runModeMarker = '{{ARC_RUN_MODE_POLICY}}';
const planningHeading = '## Full Auto run mode';
const planningAnchor = '<a id="full-auto-run-mode"></a>';

for (const platform of platforms) {
  test(`${platform} SKILL.md has the Run mode marker exactly once after the language marker`, () => {
    const skill = effectiveText(platform, 'core');
    assert.equal(skill.split(runModeMarker).length - 1, 1);
    assert.ok(skill.includes(`\n{{ARC_OUTPUT_LANGUAGE_POLICY}}\n\n${runModeMarker}\n\n`));
  });

  test(`${platform} SKILL.md includes each static Run mode clause once`, () => {
    const skill = effectiveText(platform, 'core');
    const records = skill.split('\n').filter(line => line.startsWith('**Pre-action gate record:**'));
    assert.equal(records.length, 1);
    assert.deepEqual(records[0].match(/`(?:mode|run|supervised|full-auto)`/g),
      ['`mode`', '`run`', '`supervised`', '`full-auto`']);
  });

  test(`${platform} planning.md ends with one approved Full Auto section`, () => {
    const local = read(`${platform}/skill/references/planning.md`);
    const lines = local.split('\n');
    assert.equal(lines.filter(line => line === planningAnchor).length, 1);
    assert.equal(lines.filter(line => line === planningHeading).length, 1);
    const headingIndex = lines.indexOf(planningHeading);
    assert.equal(lines[headingIndex - 1], planningAnchor);
    assert.ok(!lines.slice(headingIndex + 1).some(line => /^#{1,2}\s/.test(line)));

    const section = effectiveSection(platform, 'planning', planningHeading);
    assert.match(section, /^\| Gate \| Full Auto \| Rule \|$/m);
    for (const token of [
      '`run`', '`supervised`', '`full-auto`', '`Approval time`',
      '`auto-approved (Full Auto) <time>`', '`approvalRef`', '`full-auto:<doc>@<version>`',
    ]) {
      assert.ok(section.includes(token), token);
    }
  });
}

test('one specialist fragment includes the approved Run mode choice clause', () => {
  const {fragments} = JSON.parse(read('lib/prompts/agent-fragments.json'));
  const references = fragments.filter(({text}) => text.includes('[approval.run-mode]'));
  assert.deepEqual(references.map(({id}) => id), ['common.preservation-choice-inspection']);
});

test('agentsBlockBody appends the Full Auto line only in full-auto', () => {
  const args = ['/tmp/user/.codex', '/tmp/user', 'en', 'codex'];
  const fullAutoLine = '- ARC Run mode is Full Auto: Orchestrator auto-decides only the gates listed in the installed ARC skill, records each decision, and asks the user for everything else.\n';
  const defaultBody = agentsBlockBody(...args);
  assert.equal(agentsBlockBody(...args, 'supervised'), defaultBody);
  assert.doesNotMatch(defaultBody, /ARC Run mode is Full Auto/);
  assert.equal(agentsBlockBody(...args, 'full-auto'), defaultBody + fullAutoLine);
  assert.throws(() => agentsBlockBody(...args, 'auto'), /Invalid run mode/);
});

test('agent registry rejects the Run mode marker in a fragment', () => {
  const original = JSON.parse(read('lib/prompts/agent-fragments.json'));
  const modified = structuredClone(original);
  modified.fragments[0].text += ` ${runModeMarker}`;
  assert.doesNotThrow(() => validateAgentRegistry(original));
  assert.throws(() => validateAgentRegistry(modified), /Invalid fragment/);
});
