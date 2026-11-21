import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {renderAgentProfile} from '../../lib/prompts/render.mjs';

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

const profileRules = {
  qa: [
    {
      lineStart: '1. Use the shared brief, criteria, Implementer summary and relevant prior findings. ',
      rule: 'Independently verify assigned behavior with related tests only: test files directly exercising changed modules, contract tests the change requires updating and matching check scripts; report each selection and reason. Final verification is run by Orchestrator, not QA.',
      after: ' Use approved structural/consistency checks for policy/configuration.',
      phrases: ['with related tests only', 'Final verification is run by Orchestrator, not QA'],
    },
    {
      lineStart: '5. Structural checks prove structural criteria only,',
      before: 'unresolved or unverified with evidence. ',
      rule: "Compare failures with the brief's baseline by test name; only new failures are findings. Rerun a suspected intermittent test alone, up to the brief's limit, as diagnosis rather than retry; report passes-in-isolation and rerun count.",
      phrases: ['by test name', 'passes-in-isolation and rerun count'],
    },
  ],
  implementer: [
    {
      lineStart: '7. Connect criteria to verifiable checks.',
      before: 'Run approved checks or report the precise blocker. ',
      rule: 'Run only related tests per installed ARC `references/verification.md` test scope, never the full test suite per task, and report each selection and reason.',
      after: ' Support success claims with evidence.',
      phrases: ['Run only related tests per installed ARC', 'never the full test suite per task'],
    },
  ],
  planner: [
    {
      lineStart: 'Return one complete plan draft covering all top-level tasks and dependencies;',
      before: 'required QA/focused checks/evidence before acceptance and holds. ',
      rule: "List each task's related tests with reasons. In final verification list the union, all contract tests and check scripts, and a provisional full-regression trigger judgment with reason.",
      after: ' Put inseparable changes in one task from the outset.',
      phrases: ["List each task's related tests with reasons", 'provisional full-regression trigger judgment'],
    },
  ],
};

export function assertProfileTestScope(text, role) {
  const lines = text.split('\n');
  for (const {lineStart, before = lineStart, rule, after, phrases} of profileRules[role]) {
    for (const phrase of phrases) {
      assert.equal(text.split(phrase).length - 1, 1, `${role} must contain this phrase exactly once: ${phrase}`);
    }
    const matchingLines = lines.filter(line => line.startsWith(lineStart));
    assert.equal(matchingLines.length, 1, `${role} must contain exactly one line starting with ${lineStart}`);
    const expected = before + rule + (after ?? '');
    const correctlyPlaced = after ? matchingLines[0].includes(expected) : matchingLines[0].endsWith(expected);
    assert.ok(correctlyPlaced, `${role} must place the rule at its prescribed position: ${rule}`);
  }
}

const registrySource = readFileSync(new URL('../../lib/prompts/agent-fragments.json', import.meta.url), 'utf8');
const registry = JSON.parse(registrySource);
const readAgent = path => readFileSync(new URL(`../../${path}`, import.meta.url));
const renderAgent = path => renderAgentProfile(path, readAgent(path), registry).toString();

test('ARC agent fragments omit the project suite instruction', () => {
  assert.doesNotMatch(registrySource, /project suite/i);
});

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

  for (const role of Object.keys(profileRules)) {
    test(`${platform} ${role} places each test-scope rule exactly once`, () => {
      const extension = platform === 'codex' ? 'toml' : 'md';
      assertProfileTestScope(renderAgent(`${platform}/agents/arc-${role}.${extension}`), role);
    });
  }

  test(`${platform} agent templates and rendered profiles omit the project suite instruction`, () => {
    const directory = new URL(`../../${platform}/agents/`, import.meta.url);
    for (const entry of readdirSync(directory, {withFileTypes: true}).filter(entry => entry.isFile())) {
      const path = `${platform}/agents/${entry.name}`;
      assert.doesNotMatch(readAgent(path).toString(), /project suite/i, path);
      assert.doesNotMatch(renderAgent(path), /project suite/i, `rendered ${path}`);
    }
  });
}
