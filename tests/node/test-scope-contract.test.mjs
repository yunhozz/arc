import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {renderAgentProfile} from '../../lib/prompts/render.mjs';

const platforms = ['claude', 'codex', 'gemini', 'grok'];
const anchorId = 'id="test-scope-and-result-comparison"';
const anchor = `<a ${anchorId}></a>`;
const heading = '## Test scope and result comparison';
const preservationException = 'The only exception is the ARC-owned base worktree under [verification](references/verification.md#test-scope-and-result-comparison), which Orchestrator removes after all final dispositions only if it is still clean.';
const riskAnchor = '<a id="risk-scaled-execution"></a>';
const finalVerificationParagraph = "**Final verification** runs once per plan, either carried by the last task's QA under the last-task final scope below or, otherwise, after all tasks are accepted and committed as one fresh QA assignment at the verified HEAD of the execution target worktree: all contract tests, all check scripts and the related tests of re-changed files; it does not rerun the union of tests that task QA already passed. A re-changed file is a file that a task's QA verified, as a changed file or a related test file it ran, and that a later commit changed after that task's focused commit (`git diff --name-only <task commit> HEAD`), plus every non-documentation file changed in base..HEAD by a commit that no task QA verified; under last-task final scope it also includes every file that an earlier task's QA verified and that the last task's uncommitted diff, including untracked files, changes. Orchestrator computes the list, under last-task final scope at QA start, and cites it in the brief; QA cross-checks it with read-only `git diff`, MAY add items only within the three categories above with reasons, and reports the reason when the list is empty. A fresh QA final verification records `git status --porcelain` at start and end; a state that is not clean is an environment block that holds final verification. While it runs, neither Orchestrator nor any Implementer writes in that workspace; the read-only final Reviewer MAY run concurrently. A new failure from that fresh QA final verification follows Implementer → QA even after the final Reviewer has started; Reviewer evidence for affected files becomes stale and needs a refreshed-diff recheck.";
const lastTaskFinalScopeParagraph = "**Last-task final scope:** Orchestrator designates in the brief, as last-task QA with final scope, the task QA that starts after every other plan task is accepted and committed, and records the HEAD at its start; this applies to single-task plans too. If parallel execution leaves no such QA, a fresh QA final verification runs. That QA runs the task's related tests, the final verification scope above and full regression once when triggered. It records `git status --porcelain` at start and end; at end it may show only the last task's uncommitted diff, and any other state is an environment block. It reports a task verdict, the basis for task acceptance, and a final-scope verdict; final-only checks never delay an independently acceptable task. Orchestrator skips the separate fresh QA final verification only if all hold: (a) the final-scope verdict passed and every failure is dispositioned as baseline or unrelated; (b) the parent of the task's focused commit is the HEAD recorded at QA start; (c) the committed content equals the tree that QA last verified, except classified plan-document progress records and pending revision rows; (d) `git status --porcelain` is clean after the commit; (e) no later commit or integration by merge, rebase or cherry-pick follows, except a standalone `docs(plan)` closing commit that touches only plan documents no check reads. If the last task is corrected after a final-scope failure and the same QA reruns the final scope on the corrected tree and it passes, the skip stays valid. Otherwise one fresh QA final verification runs at the verified HEAD.";
const fullRegressionParagraph = "**Full regression** runs once within final verification only if at least one trigger applies: (1) the change modifies a shared module; (2) changes made by others were integrated after the approved base, by merge, rebase onto a newer base or cherry-pick; (3) the change modifies dependency manifests or lockfiles, language or runtime versions, or build or test configuration; (4) the change removes, renames or changes the signature of a public interface such as an exported function, CLI option or configuration key. A shared module is code, configuration, schema, data or generator input that more than one task, role, component or execution or delivery path imports, loads or renders at run time, including its mirrors and generated outputs; documentation read only by people and modules used by a single component are not shared. Decide from actual consumers; when they cannot be determined, treat the module as shared. Planner records a provisional judgment in the plan. Orchestrator cites its provisional judgment and reasons, including the integration history up to QA start for trigger (2), in the brief that carries the final scope, and QA independently checks triggers (1), (3) and (4) from the base..HEAD diff and log, plus the uncommitted diff under last-task final scope. If either finds a trigger applies or cannot determine applicability, QA runs it once without further authorization; if no trigger applies, omit it and report the reason. An integration after that QA starts breaks skip condition (e). Change size, risk level alone and out-of-scope failures seen during task checks are not triggers; report such failures as findings. Full regression failures follow the base check below.";
const baselineParagraph = "**Baseline:** No baseline run is recorded in advance, and no base worktree is prepared in advance. QA classifies each failure in two steps. First, a static check against the approved base: task QA, which verifies uncommitted work, uses read-only `git diff --name-only <approved base>` plus the untracked files from `git status --porcelain`; a fresh QA final verification uses `git diff --name-only <approved base> HEAD`, and last-task QA with final scope uses the task QA form. QA checks whether the test file, the modules it directly imports or loads, the fixtures or data it reads, or its test configuration changed. If none changed, it is an unrelated failure: report it separately with that evidence; it is not a finding, and Orchestrator dispositions it. Because it rests on the diff, not a run, NEVER report it as a baseline failure. If any changed, or the check cannot decide (for example a dynamic import, a failure without a test name, or a file-level load failure), report the failure as needing a base run, with the changed paths. Second, only for those failures, Orchestrator prepares a clean detached worktree of the approved base revision at `<git-common-dir>/arc/base/<workflow>`, never under a managed worktree directory (such as `.claude/worktrees/`) or inside the execution target worktree, reuses it for that workflow, runs no tests there, and sends its path and prerequisite state (prepared, or not prepared with the needed commands) to the current QA. After all final dispositions Orchestrator removes it only if it is still clean; this ARC-owned base worktree is the only exception to the Preservation rule's worktree-deletion ban, and any other state holds removal for the user. QA runs only those test names alone in the base worktree, for example with Node `--test-name-pattern` or a Python node id. A failure under the same name at base is a baseline failure; a pass at base, or a test or file absent at base, makes it a new failure; a base run that was not performed, was blocked by the environment, failed to load or lacks the name makes it a new-failure candidate. NEVER absorb a candidate as a baseline failure. Check a file-level load or collection failure by loading the same file at base; an identical load failure at base stays a new-failure candidate (same at base) for Orchestrator disposition. If base needs prerequisites or the sandbox prevents running there, QA installs or generates nothing and reports an environment block; Orchestrator then prepares the prerequisites or assigns a separate QA whose workspace is the base worktree. If both are blocked, those failures stay new-failure candidates for Orchestrator disposition. Static checks and base reruns classify failures; they are not intermittency diagnosis.";
const correctionChecksParagraph = "Before the one follow-up commit, Orchestrator runs focused checks, checks only and without edits or the direct path, on the Reviewer-resolved uncommitted correction diff at a fixed fingerprint, limited to the three task-check categories in [test scope](#test-scope-and-result-comparison). It records commands, results, failure names, `git status --porcelain` and actor `orchestrator` in the canonical record and with the plan-level progress records, and reruns them if the diff changes. It dispositions a failure that the static check shows unrelated; any other failure is a correction finding that follows Implementer → Reviewer on the refreshed diff and then a focused-check rerun, with no baseline absorption and no base run. These checks suffice even when the correction meets a full-regression trigger.";
const committedPlanCorrectionSentence = "Reuse/assign independent Reviewer and repeat Implementer → Reviewer until resolved, run the Orchestrator focused checks in the [final plan Reviewer correction loop](#final-plan-reviewer-correction-loop), then accept/commit one focused follow-up.";
const resultComparisonParagraph = "**Result comparison:** Compare failures by test name; only new failures are findings, and unrelated failures and new-failure candidates need Orchestrator disposition. Report baseline and unrelated failures separately. Identify tests by name from structured results such as JUnit XML, TAP or a declared line pattern; a failure without a test name, or in a command or file whose results are incomplete, is a new-failure candidate, never a baseline failure. Report intermittent candidates, tests whose outcomes differ across runs with the same inputs, separately from baseline and new failures. Report the slowest files and tests (default ten) for information only. If a failure looks intermittent, rerun only that test in isolation at HEAD, up to three times unless the brief sets another limit. This is diagnosis, not an automatic retry. Report \"passes in isolation: yes/no\" and the rerun count. A pass in isolation never erases the original failure; Orchestrator dispositions it. A failure in isolation is a new-failure finding. For each failure report the test name and file, HEAD command and result, static-check result (changed related paths, or none), base revision, command and result (pass, fail, absent, load-fail or not-run) when a base run was needed, verdict, isolated rerun count and outcome, and environment limits.";
const handoffBriefInputsParagraph = "Implementer and QA briefs that assign checks MUST include the approved base revision, the base worktree path and its prerequisite state when one already exists (prepared, or not prepared with the needed commands), the related-test list with reasons and the intermittent-failure isolated rerun limit under [verification](verification.md#test-scope-and-result-comparison). Briefs that carry the final scope, for last-task QA with final scope or a fresh QA final verification, also include the re-changed-file list and the provisional full-regression trigger judgment with reasons, including integration history up to QA start; a last-task QA brief also records the designation and the HEAD at QA start.";
const planningFinalTimingPhrase = "Final whole verification has separate scope, and separate timing unless the last task's QA carries it;";
const structuredResultsSentence = 'Identify tests by name from structured results such as JUnit XML, TAP or a declared line pattern; a failure without a test name, or in a command or file whose results are incomplete, is a new-failure candidate, never a baseline failure. Report intermittent candidates, tests whose outcomes differ across runs with the same inputs, separately from baseline and new failures. Report the slowest files and tests (default ten) for information only.';
const runtimeCommandsAnchor = 'final-verification-runtime-commands';
const finalScopeSentence = "**Final verification** runs once per plan, either carried by the last task's QA under the last-task final scope below or, otherwise, after all tasks are accepted and committed as one fresh QA assignment at the verified HEAD of the execution target worktree: all contract tests, all check scripts and the related tests of re-changed files; it does not rerun the union of tests that task QA already passed.";
const fullRegressionQaSentence = 'If either finds a trigger applies or cannot determine applicability, QA runs it once without further authorization; if no trigger applies, omit it and report the reason.';
const baseVerdictSentence = 'A failure under the same name at base is a baseline failure; a pass at base, or a test or file absent at base, makes it a new failure; a base run that was not performed, was blocked by the environment, failed to load or lacks the name makes it a new-failure candidate.';
const finalFailureRule = "A new failure from that fresh QA final verification follows Implementer → QA even after the final Reviewer has started; Reviewer evidence for affected files becomes stale and needs a refreshed-diff recheck.";
const finalPlanRecheckId = 'review.final-plan-recheck';
const finalPlanRecheckSentence = 'Separate QA findings and new failures from a fresh QA final verification, which may run concurrently with the final Reviewer, follow Implementer → QA; Reviewer evidence for affected files then needs a refreshed-diff recheck.';
const retiredFinalPlanRecheckSentence = 'Separate QA findings and new failures from final verification, which may run concurrently with the final Reviewer, follow Implementer → QA; Reviewer evidence for affected files then needs a refreshed-diff recheck.';
const correctionChecksPolicySentence = 'Before the commit, Orchestrator runs focused related checks only, without edits, on the Reviewer-resolved correction diff; a failure not shown unrelated returns as a correction finding to Implementer → Reviewer.';
const significantPlanClause = "; the last task's QA may carry the final verification scope, otherwise one fresh QA runs final verification.";
const oldFinalPlanRecheckSentence = 'Separate QA findings follow Implementer → QA.';
const reviewerVerificationSentence = 'QA owns task and final functional/test verification; Orchestrator owns overall completion and acceptance.';
const reviewerFindingsSentence = 'New failures from a fresh QA final verification follow Implementer → QA; affected evidence needs a refreshed-diff recheck. A failed Orchestrator focused check on a resolved correction diff returns as a correction finding for your recheck.';
const oldReviewerVerificationPhrase = 'QA owns functional/test verification';
const profileRoles = ['scouter', 'planner', 'implementer', 'qa', 'reviewer'];
const wholePlanReviewerRule = 'Whole-plan Reviewer is part of final verification;';
const qaAdditionsRule = 'additions within these categories with reasons are authorized;';
const qaRerunLimit = "up to the brief's limit (default three),";
const implementerFinalRegressionRule = 'full regression only in final QA verification when triggered.';
const retiredPhrases = [
  'Final verification is run by Orchestrator',
  "Compare failures with the brief's baseline",
  'Orchestrator runs final verification',
  'In final verification list the union',
  "full regression only in Orchestrator's final verification",
  'Separate QA findings and new failures from final verification, which',
  'New failures from final verification follow Implementer → QA',
];
const retiredReferencePhrases = [
  'A new failure from final verification follows',
  'Final verification QA briefs also include',
  'in the final QA brief',
  'final verification QA uses `git diff',
  'Final whole verification has separate scope/timing',
];
const testScopeLink = /\[[^\]\n]+\]\(verification\.md#test-scope-and-result-comparison\)/g;
const sectionPhrases = [
  'related to the change',
  'Last-task final scope',
  '**Full regression**',
  'A shared module is',
  'by test name',
  'in isolation',
  'rerun count',
  're-changed',
  'base worktree',
  'new-failure candidate',
  'fresh QA assignment',
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
      rule: `Independently verify assigned behavior with related tests only: test files directly exercising changed modules, contract tests the change requires updating and matching check scripts; ${qaAdditionsRule} report each selection and reason. When assigned final verification, run all contract tests, all check scripts and the brief's re-changed-file tests at the verified HEAD, plus full regression once when the brief's provisional judgment or your own check of triggers (1), (3) and (4) finds one applies or cannot decide. When assigned last-task final scope, run the same scope with the task's related tests on the uncommitted tree, record \`git status --porcelain\` at start and end, and report a task verdict and a final-scope verdict separately.`,
      after: ' Use approved structural/consistency checks for policy/configuration.',
      phrases: ['with related tests only', qaAdditionsRule, "the brief's re-changed-file tests at the verified HEAD", 'your own check of triggers (1), (3) and (4)', 'a task verdict and a final-scope verdict'],
    },
    {
      lineStart: '5. Structural checks prove structural criteria only,',
      before: 'unresolved or unverified with evidence. ',
      rule: `Classify each HEAD failure first by read-only diff against the approved base (unrelated when its test, direct imports, fixtures and test configuration are unchanged), and report the rest as needing a base run; when Orchestrator supplies a base worktree, rerun only those by test name and classify them as baseline, new or new-failure candidate. Only new failures are findings; unrelated failures and candidates need Orchestrator disposition. Rerun a suspected intermittent test alone, ${qaRerunLimit} as diagnosis rather than retry; report passes-in-isolation and rerun count.`,
      phrases: ['by test name', qaRerunLimit, 'passes-in-isolation and rerun count', 'read-only diff against the approved base'],
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
      rule: "List each task's related tests with reasons. In final verification list all contract tests and check scripts, expected cross-task file overlap that may need recheck, and a provisional full-regression trigger judgment with reason. That section defines the final scope whether the last task's QA carries it or a fresh QA runs it.",
      after: ' Put inseparable changes in one task from the outset.',
      phrases: ["List each task's related tests with reasons", 'provisional full-regression trigger judgment', 'expected cross-task file overlap that may need recheck'],
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
  assert.ok(!text.includes(retiredFinalPlanRecheckSentence));
  assert.ok(text.includes(`uncommitted through Reviewer rechecks. ${correctionChecksPolicySentence} Then accept`));
  assert.ok(text.includes(`create one focused follow-up commit. ${finalPlanRecheckSentence} Preserve required QA`));
});

test('canonical significant-plan policy lets the last task QA carry final scope', () => {
  const policy = JSON.parse(readAgent('lib/policy/role-policy.json'));
  const rule = policy.rules.find(rule => rule.id === 'review.significant-plan');
  assert.ok(rule?.text.includes(`for each task${significantPlanClause} After all tasks`));
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
      assert.ok(!source.includes(retiredFinalPlanRecheckSentence));
      const managed = source.split('[ARC role policy: contract begin]')[1]?.split('[ARC role policy: contract end]')[0];
      const rule = managed?.split('\n').find(line => line.startsWith(`- [${finalPlanRecheckId}] `));
      assert.ok(rule?.includes(`create one focused follow-up commit. ${finalPlanRecheckSentence} Preserve required QA`));
    });
  }

  test(`${platform} verification defines test scope before risk-scaled execution`, () => {
    assertTestScopeSection(readReference('verification.md'));
  });

  test(`${platform} test scope paragraphs match the approved text`, () => {
    const reference = readReference('verification.md');
    const paragraphs = reference.split('\n\n');
    for (const [prefix, expected] of [
      ['**Final verification**', finalVerificationParagraph],
      ['**Last-task final scope:**', lastTaskFinalScopeParagraph],
      ['**Full regression**', fullRegressionParagraph],
      ['**Baseline:**', baselineParagraph],
      ['**Result comparison:**', resultComparisonParagraph],
    ]) {
      assert.deepEqual(paragraphs.filter(text => text.startsWith(prefix)), [expected], prefix);
    }
    const finalVerificationIndex = paragraphs.indexOf(finalVerificationParagraph);
    assert.deepEqual(paragraphs.slice(finalVerificationIndex + 1, finalVerificationIndex + 3), [
      lastTaskFinalScopeParagraph,
      fullRegressionParagraph,
    ]);
    assertOccursOnce(reference, structuredResultsSentence);
    const resultComparison = paragraphs.find(text => text.startsWith('**Result comparison:**'));
    assert.ok(resultComparison?.includes(`Report baseline and unrelated failures separately. ${structuredResultsSentence} If a failure looks intermittent`));
  });

  test(`${platform} verification omits the runtime commands section`, () => {
    const reference = readReference('verification.md');
    for (const phrase of [runtimeCommandsAnchor, '## Final verification runtime commands', 'verify-cli', 'arc/verify']) {
      assert.ok(!reference.includes(phrase), `must omit ${phrase}`);
    }
    const lines = reference.split('\n');
    const riskIndex = lines.indexOf(riskAnchor);
    assert.equal(lines[riskIndex - 1], '');
    assert.equal(lines[riskIndex - 2], resultComparisonParagraph);
  });

  test(`${platform} handoff-prep brief inputs cite the approved base`, () => {
    const reference = readReference('handoff-prep.md');
    const paragraph = reference.split('### Verification brief inputs\n\n')[1]?.split('\n\n')[0];
    assert.equal(paragraph, handoffBriefInputsParagraph);
    assert.ok(!reference.includes('runId'));
    assert.ok(!reference.includes('baseline record reference'));
  });

  test(`${platform} fresh final QA routes new failures after the Reviewer starts`, () => {
    const reference = readReference('verification.md');
    assertOccursOnce(reference, finalFailureRule);
    const paragraph = reference.split('\n\n').find(text => text.startsWith('**Final verification**'));
    assert.ok(paragraph?.endsWith(`the read-only final Reviewer MAY run concurrently. ${finalFailureRule}`));
  });

  test(`${platform} final QA scope, full regression and base verdict sentences sit in place`, () => {
    const paragraphs = readReference('verification.md').split('\n\n');
    const finalVerification = paragraphs.find(text => text.startsWith('**Final verification**'));
    const fullRegression = paragraphs.find(text => text.startsWith('**Full regression**'));
    const baseline = paragraphs.find(text => text.startsWith('**Baseline:**'));
    assert.ok(finalVerification?.startsWith(finalScopeSentence));
    assert.ok(fullRegression?.includes(`from the base..HEAD diff and log, plus the uncommitted diff under last-task final scope. ${fullRegressionQaSentence} An integration after that QA starts breaks skip condition (e). Change size`));
    assert.ok(baseline?.startsWith('**Baseline:** No baseline run is recorded in advance, and no base worktree is prepared in advance.'));
    assert.ok(baseline?.includes("a fresh QA final verification uses `git diff --name-only <approved base> HEAD`, and last-task QA with final scope uses the task QA form."));
    assert.ok(baseline?.includes(`or a Python node id. ${baseVerdictSentence} NEVER absorb a candidate as a baseline failure.`));
    assert.ok(baseline?.includes('never under a managed worktree directory (such as `.claude/worktrees/`) or inside the execution target worktree'));
    assert.ok(!baseline?.includes('never under `.claude/worktrees/` or inside the execution target worktree'));
  });

  test(`${platform} final plan Reviewer correction loop requires Orchestrator focused checks`, () => {
    const reference = readReference('verification.md');
    const correctionParagraphs = reference.split('### Final plan Reviewer correction loop\n\n')[1]?.split('\n\n');
    assert.equal(correctionParagraphs?.[1], correctionChecksParagraph);
    assertOccursOnce(reference, committedPlanCorrectionSentence);
    assertOccursOnce(reference, 'Final QA findings still use Implementer → QA.');
  });

  test(`${platform} planning separates final timing unless the last task carries it`, () => {
    const reference = readReference('planning.md');
    assertOccursOnce(reference, planningFinalTimingPhrase);
    assertTestScopeLink(reference, 'planning.md');
  });

  test(`${platform} references omit retired final verification sentences`, () => {
    for (const name of ['verification.md', 'handoff-prep.md', 'planning.md']) {
      const reference = readReference(name);
      for (const phrase of retiredReferencePhrases) {
        assert.ok(!reference.includes(phrase), `${name} must omit ${phrase}`);
      }
    }
  });

  test(`${platform} preservation rule allows only the ARC-owned base worktree exception`, () => {
    const skill = readAgent(`${platform}/skill/SKILL.md`).toString();
    assertOccursOnce(skill, preservationException);
    assert.ok(skill.includes(`NEVER automatically stash, reset, clean, unstage, discard, amend or delete branches/worktrees. ${preservationException}`));
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
    test(`${platform} implementer template assigns full regression to final QA verification`, () => {
      const template = readAgent(`${platform}/agents/arc-implementer.md`).toString();
      assertOccursOnce(template, implementerFinalRegressionRule);
      assert.ok(template.includes(`related checks; ${implementerFinalRegressionRule} If blocked,`));
    });
  }

  test(`${platform} rendered profiles omit the retired verification sentences`, () => {
    for (const role of profileRoles) {
      const path = profilePath(role);
      const rendered = renderAgent(path);
      for (const phrase of retiredPhrases) {
        assert.ok(!rendered.includes(phrase), `${path} rendering must omit ${phrase}`);
      }
    }
    const path = profilePath('implementer');
    const template = readAgent(path).toString();
    for (const phrase of retiredPhrases) {
      assert.ok(!template.includes(phrase), `${path} template must omit ${phrase}`);
    }
  });

  test(`${platform} agent templates and rendered profiles omit the project suite instruction`, () => {
    const directory = new URL(`../../${platform}/agents/`, import.meta.url);
    for (const entry of readdirSync(directory, {withFileTypes: true}).filter(entry => entry.isFile())) {
      const path = `${platform}/agents/${entry.name}`;
      assert.doesNotMatch(readAgent(path).toString(), /project suite/i, path);
      assert.doesNotMatch(renderAgent(path), /project suite/i, `rendered ${path}`);
    }
  });
}
