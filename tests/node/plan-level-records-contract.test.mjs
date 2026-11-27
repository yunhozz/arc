import test from 'node:test';
import assert from 'node:assert/strict';
import {effectiveSection} from './fixtures/effective-doc.mjs';

const platforms = ['claude', 'codex', 'gemini', 'grok'];

for (const platform of platforms) {
  test(`${platform} references/planning.md preserves the plan-level records clauses exactly once`, () => {
    const section = effectiveSection(platform, 'planning', '## Full Auto run mode');
    const gates = section.split('\n')
      .filter(line => line.startsWith('| '))
      .map(line => line.split('|')[1].trim());
    const revision = 'Spec/plan revision within the original scope';
    const finding = 'Non-blocking final Reviewer finding disposition';
    const external = 'Push, merge, deploy, publish, external messages';
    for (const gate of [revision, finding, external]) {
      assert.equal(gates.filter(name => name === gate).length, 1, gate);
    }
    assert.equal(gates[gates.indexOf(finding) - 1], revision);
  });
}
