import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {renderAgentProfile} from '../../lib/prompts/render.mjs';

const platforms = ['claude', 'codex', 'gemini', 'grok'];
const anchorId = 'id="test-scope-and-result-comparison"';
const anchor = `<a ${anchorId}></a>`;
const heading = '## Test scope and result comparison';
const riskAnchor = '<a id="risk-scaled-execution"></a>';
const cleanWorktreeSentence = 'Run it in a clean detached worktree of the verified HEAD commit, prepared with the same prerequisites as the baseline, for example through the runtime [final verification commands](#final-verification-runtime-commands); uncommitted changes MAY be captured as a snapshot commit without changing refs, the index or working files, reporting included and excluded paths.';
const fullRegressionWorktreeSentence = 'Full regression uses the same clean worktree and prerequisites as the baseline.';
const backgroundBaselineSentence = 'Orchestrator MAY record the baseline in the background in a separate clean worktree immediately after base approval while continuing independent work, but MUST complete it before the result comparison. Record its load (quiet, contended or unknown), and by default DO NOT run baseline and HEAD verification concurrently. Reuse a cached baseline only when every cache key input matches and the cached run was quiet and complete; a missing, unreadable or differing input requires a fresh record, and a contended or unknown baseline serves only the current comparison.';
const structuredResultsSentence = 'Identify tests by name from structured results such as JUnit XML, TAP or a declared line pattern; a failure without a test name, or in a command or file whose results are incomplete, is a new-failure candidate, never a baseline failure. Report intermittent candidates, tests whose outcomes differ across runs with the same inputs, separately from baseline and new failures. Report the slowest files and tests (default ten) for information only.';
const runtimeCommandsAnchor = '<a id="final-verification-runtime-commands"></a>';
const runtimeCommandsHeading = '## Final verification runtime commands';
const runtimeCommandsParagraph = "Orchestrator MAY run `node <skill>/runtime/verify-cli.mjs <command> --cwd <workspace> --workflow <id> --input -` with `verify-start`, `verify-status`, `verify-compare`, `verify-rerun` or `verify-cleanup`. The commands reject bridge children, never retry, restart or delete automatically, create worktrees only under the system temporary directory and store records under `<git-common-dir>/arc/verify`. Commands receive only a fixed environment allowlist plus declared `envNames` and command `env`, all of which enter the cache key; declare any other variable a check needs. Use `detach: true` only on a host whose detached-process survival is verified in [coordination](coordination.md); otherwise run with `detach: false`, through the host's own background facility where available. `verify-rerun` runs one isolated attempt per call within the rerun limit, and `verify-cleanup` removes only worktrees the tool created and recorded, on explicit request.";
const handoffRunIdSentence = "While a background baseline run is still active, the brief MAY cite its `runId` and recording conditions instead of the completed record; the executor's comparison waits for its completion.";
const finalFailureRule = 'A new failure from final verification follows Implementer → QA even after the final Reviewer has started; Reviewer evidence for affected files becomes stale and needs a refreshed-diff recheck.';
const finalPlanRecheckId = 'review.final-plan-recheck';
const finalPlanRecheckSentence = 'Separate QA findings and new failures from final verification, which may run concurrently with the final Reviewer, follow Implementer → QA; Reviewer evidence for affected files then needs a refreshed-diff recheck.';
const oldFinalPlanRecheckSentence = 'Separate QA findings follow Implementer → QA.';
const reviewerVerificationSentence = 'QA owns task functional/test verification; Orchestrator runs final verification and owns overall completion and acceptance.';
const reviewerFindingsSentence = 'New failures from final verification follow Implementer → QA; affected evidence needs a refreshed-diff recheck.';
const oldReviewerVerificationPhrase = 'QA owns functional/test verification';
const profileRoles = ['scouter', 'planner', 'implementer', 'qa', 'reviewer'];
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

test('canonical final-plan-recheck policy routes final verification failures to QA', () => {
  const policy = JSON.parse(readAgent('lib/policy/role-policy.json'));
  const rules = policy.rules.filter(rule => rule.id === finalPlanRecheckId);
  assert.equal(rules.length, 1);
  const [{id, roles, effect, controls, text}] = rules;
  assert.deepEqual({id, roles, effect, controls}, {
    id: finalPlanRecheckId,
    roles: ['orchestrator', 'scouter', 'planner', 'implementer', 'qa', 'reviewer'],
    effect: 'require',
    controls: {codex: 'prompt', claude: 'prompt', gemini: 'prompt', grok: 'prompt'},
  });
  assertOccursOnce(text, finalPlanRecheckSentence);
  assert.ok(!text.includes(oldFinalPlanRecheckSentence));
  assert.ok(text.includes(`create one focused follow-up commit. ${finalPlanRecheckSentence} Preserve required QA`));
});

for (const platform of platforms) {
  const references = new URL(`../../${platform}/skill/references/`, import.meta.url);
  const readReference = name => readFileSync(new URL(name, references), 'utf8');
  const extension = platform === 'codex' ? 'toml' : 'md';
  const profilePath = role => `${platform}/agents/arc-${role}.${extension}`;

  test(`${platform} reviewer render places the final verification sentences exactly once`, () => {
    const reviewer = renderAgent(profilePath('reviewer'));
    assertOccursOnce(reviewer, reviewerVerificationSentence);
    assertOccursOnce(reviewer, reviewerFindingsSentence);
    assert.ok(!reviewer.includes(oldReviewerVerificationPhrase));
    assert.ok(reviewer.includes(`after required QA/focused checks and QA rechecks. ${reviewerVerificationSentence}\n`));
    assert.ok(reviewer.includes(`before this final stage. ${reviewerFindingsSentence}\n`));
  });

  test(`${platform} non-reviewer renders omit the reviewer verification sentences`, () => {
    for (const role of profileRoles.filter(role => role !== 'reviewer')) {
      const rendered = renderAgent(profilePath(role));
      assert.ok(!rendered.includes(reviewerVerificationSentence), profilePath(role));
      assert.ok(!rendered.includes(reviewerFindingsSentence), profilePath(role));
    }
  });

  const policyPaths = [
    ...profileRoles.map(profilePath),
    ...['planning', 'handoff', 'verification'].map(name => `${platform}/skill/references/${name}.md`),
  ];
  for (const path of policyPaths) {
    test(`${path} places the final-plan-recheck sentence in its managed rule exactly once`, () => {
      const source = readAgent(path).toString();
      assertOccursOnce(source, finalPlanRecheckSentence);
      assert.ok(!source.includes(oldFinalPlanRecheckSentence));
      const managed = source.split('[ARC role policy: contract begin]')[1]?.split('[ARC role policy: contract end]')[0];
      const rule = managed?.split('\n').find(line => line.startsWith(`- [${finalPlanRecheckId}] `));
      assert.ok(rule?.includes(`create one focused follow-up commit. ${finalPlanRecheckSentence} Preserve required QA`));
    });
  }

  test(`${platform} verification defines test scope before risk-scaled execution`, () => {
    assertTestScopeSection(readReference('verification.md'));
  });

  test(`${platform} final verification runs in a clean worktree`, () => {
    const reference = readReference('verification.md');
    for (const sentence of [cleanWorktreeSentence, fullRegressionWorktreeSentence, backgroundBaselineSentence, structuredResultsSentence]) {
      assertOccursOnce(reference, sentence);
    }
    const paragraphs = reference.split('\n\n');
    const finalVerification = paragraphs.find(text => text.startsWith('**Final verification**'));
    const fullRegression = paragraphs.find(text => text.startsWith('**Full regression**'));
    const baseline = paragraphs.find(text => text.startsWith('**Baseline:**'));
    const resultComparison = paragraphs.find(text => text.startsWith('**Result comparison:**'));
    assert.ok(finalVerification?.includes(`${cleanWorktreeSentence} Orchestrator then performs the result comparison below`));
    assert.ok(fullRegression?.endsWith(fullRegressionWorktreeSentence));
    assert.ok(baseline?.includes(`NEVER absorb them as baseline failures. ${backgroundBaselineSentence}`));
    assert.ok(resultComparison?.includes(`Report baseline failures separately. ${structuredResultsSentence} If a failure looks intermittent`));
  });

  test(`${platform} runtime commands section sits between test scope and risk-scaled execution`, () => {
    const reference = readReference('verification.md');
    assertOccursOnce(reference, runtimeCommandsAnchor);
    const lines = reference.split('\n');
    const runtimeIndex = lines.indexOf(runtimeCommandsAnchor);
    assert.ok(lines.indexOf(heading) < runtimeIndex);
    assert.deepEqual(lines.slice(runtimeIndex - 2, runtimeIndex + 6), [
      lines.find(line => line.startsWith('**Result comparison:**')),
      '', runtimeCommandsAnchor, runtimeCommandsHeading, '', runtimeCommandsParagraph, '', riskAnchor,
    ]);
  });

  test(`${platform} handoff-prep allows citing an active baseline runId`, () => {
    const reference = readReference('handoff-prep.md');
    assertOccursOnce(reference, handoffRunIdSentence);
    const paragraph = reference.split('### Verification brief inputs\n\n')[1]?.split('\n\n')[0];
    assert.ok(paragraph?.endsWith(handoffRunIdSentence));
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
      assertProfileTestScope(renderAgent(profilePath(role)), role);
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
