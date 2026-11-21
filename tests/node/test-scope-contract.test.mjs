import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {renderAgentProfile} from '../../lib/prompts/render.mjs';

const platforms = ['claude', 'codex', 'gemini', 'grok'];
const anchorId = 'id="test-scope-and-result-comparison"';
const anchor = `<a ${anchorId}></a>`;
const heading = '## Test scope and result comparison';
const riskAnchor = '<a id="risk-scaled-execution"></a>';
const finalFailureRule = 'A new failure from final verification follows Implementer → QA even after the final Reviewer has started; Reviewer evidence for affected files becomes stale and needs a refreshed-diff recheck.';
const baselineCoverage = 'covering every command final verification may run, including the full suite when the provisional trigger judgment is run or undetermined.';
const wholePlanReviewerRule = 'Whole-plan Reviewer is part of final verification;';
const qaAdditionsRule = 'additions within these categories with reasons are authorized;';
const qaRerunLimit = "up to the brief's limit (default three),";
const implementerFinalRegressionRule = "full regression only in Orchestrator's final verification when triggered.";
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

function assertOccursOnce(text, phrase) {
  assert.equal(text.split(phrase).length - 1, 1, `must contain exactly once: ${phrase}`);
}

const profileRules = {
  qa: [
    {
      lineStart: '1. Use the shared brief, criteria, Implementer summary and relevant prior findings. ',
      rule: `Independently verify assigned behavior with related tests only: test files directly exercising changed modules, contract tests the change requires updating and matching check scripts; ${qaAdditionsRule} report each selection and reason. Final verification is run by Orchestrator, not QA.`,
      after: ' Use approved structural/consistency checks for policy/configuration.',
      phrases: ['with related tests only', qaAdditionsRule, 'Final verification is run by Orchestrator, not QA'],
    },
    {
      lineStart: '5. Structural checks prove structural criteria only,',
      before: 'unresolved or unverified with evidence. ',
      rule: `Compare failures with the brief's baseline by test name; only new failures are findings. Rerun a suspected intermittent test alone, ${qaRerunLimit} as diagnosis rather than retry; report passes-in-isolation and rerun count.`,
      phrases: ['by test name', qaRerunLimit, 'passes-in-isolation and rerun count'],
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
      assertOccursOnce(text, phrase);
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

  test(`${platform} final verification routes new failures after the Reviewer starts`, () => {
    const reference = readReference('verification.md');
    assertOccursOnce(reference, finalFailureRule);
    const paragraph = reference.split('\n\n').find(text => text.startsWith('**Final verification**'));
    assert.ok(paragraph?.endsWith(`and records the verdict. ${finalFailureRule}`));
  });

  test(`${platform} baseline covers the provisional final verification scope`, () => {
    const reference = readReference('verification.md');
    assertOccursOnce(reference, baselineCoverage);
    const paragraph = reference.split('\n\n').find(text => text.startsWith('**Baseline:**'));
    assert.ok(paragraph?.includes(`commands, environment, revision and failures by test name, ${baselineCoverage} A file-level load`));
  });

  test(`${platform} final plan acceptance places the whole-plan Reviewer within final verification`, () => {
    const reference = readReference('verification.md');
    assertOccursOnce(reference, wholePlanReviewerRule);
    const acceptanceSection = reference.split('## Task acceptance and final plan acceptance\n')[1]?.split('\n<a id="')[0];
    assert.ok(acceptanceSection?.includes(`State final integration scope/timing separately. ${wholePlanReviewerRule} task commits`));
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

  if (platform !== 'codex') {
    test(`${platform} implementer template assigns full regression to Orchestrator`, () => {
      const template = readAgent(`${platform}/agents/arc-implementer.md`).toString();
      assertOccursOnce(template, implementerFinalRegressionRule);
      assert.ok(template.includes(`related checks; ${implementerFinalRegressionRule} If blocked,`));
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
