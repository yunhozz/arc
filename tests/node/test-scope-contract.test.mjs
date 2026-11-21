import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';

const platforms = ['claude', 'codex', 'gemini', 'grok'];
const anchorId = 'id="test-scope-and-result-comparison"';
const anchor = `<a ${anchorId}></a>`;
const heading = '## Test scope and result comparison';
const riskAnchor = '<a id="risk-scaled-execution"></a>';
const testScopeLink = /\[[^\]\n]+\]\(verification\.md#test-scope-and-result-comparison\)/g;
const sectionPhrases = [
  'related to the change',
  "union of all tasks' related tests",
  '**Full regression**',
  'A shared module is',
  'by test name',
  'in isolation',
  'rerun count',
  'baseline-incomplete',
  'Orchestrator runs it directly, not through QA',
  'diagnosis, not an automatic retry',
];

export function assertTestScopeSection(text) {
  const lines = text.split('\n').map(line => line.trimEnd());
  assert.equal(text.split(anchorId).length - 1, 1, 'test-scope anchor must occur once');
  assert.equal(lines.filter(line => line === heading).length, 1, 'test-scope heading must occur once');
  const anchorIndex = lines.indexOf(anchor);
  const headingIndex = lines.indexOf(heading);
  const riskIndex = lines.indexOf(riskAnchor);
  assert.ok(anchorIndex >= 0, 'test-scope anchor tag must be present');
  assert.equal(headingIndex, anchorIndex + 1, 'heading must follow its anchor');
  assert.ok(headingIndex < riskIndex, 'test scope must precede risk-scaled execution');
  const bodyEnd = lines.findIndex((line, index) => index > headingIndex && /^(?:## |<a id=")/.test(line));
  const body = lines.slice(headingIndex + 1, bodyEnd).join('\n');
  for (const phrase of sectionPhrases) {
    assert.ok(body.includes(phrase), `test-scope body must include ${phrase}`);
  }
}

export function assertTestScopeLink(text, name) {
  assert.equal([...text.matchAll(testScopeLink)].length, 1, `${name} must contain exactly one complete test-scope link`);
}

for (const platform of platforms) {
  const references = new URL(`../../${platform}/skill/references/`, import.meta.url);
  const readReference = name => readFileSync(new URL(name, references), 'utf8');

  test(`${platform} verification defines test scope before risk-scaled execution`, () => {
    assertTestScopeSection(readReference('verification.md'));
  });

  test(`${platform} handoff, planning and handoff preparation link to test scope`, () => {
    for (const name of ['handoff.md', 'planning.md', 'handoff-prep.md']) {
      assertTestScopeLink(readReference(name), name);
    }
  });

  test(`${platform} ARC references omit the project suite instruction`, () => {
    for (const name of readdirSync(references).filter(name => name.endsWith('.md'))) {
      assert.doesNotMatch(readReference(name), /project suite/i, name);
    }
  });
}
