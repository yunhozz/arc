import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BRIDGE_GATE_RESULTS } from '../../lib/runtime/role-dispatch-policy.mjs';

test('README host table matches recorded bridge gate results', async (t) => {
  const lines = readFileSync(new URL('../../README.md', import.meta.url), 'utf8').split('\n');
  const hostGates = [
    ['Claude', 'G1', /Implementer\/QA held/],
    ['Grok', 'GK1', /write roles held/],
    ['Gemini', 'GG1', /write roles held/],
  ];

  for (const [platform, gate, heldPattern] of hostGates) {
    await t.test(`${platform} (${gate})`, () => {
      const rows = lines.filter((line) => line.startsWith(`| ${platform} |`));
      assert.equal(rows.length, 1);
      const [row] = rows;

      if (BRIDGE_GATE_RESULTS[gate] === 'pass') {
        assert.doesNotMatch(row, heldPattern);
        assert.ok(row.includes(`\`${gate}\``), `README row must include \`${gate}\``);
      } else {
        assert.match(row, heldPattern);
      }
    });
  }
});
