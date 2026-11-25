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
const modeField = '`mode: task | final`';
const singleModeRule = 'One assignment performs one mode; the only exception is the approved full regression follow-up in final mode.';
const taskModeParagraph = "**Task mode** assigns a fresh Tester for each top-level task requiring Tester verification. Task checks and rechecks verify uncommitted work and run only tests related to the change: test files that directly exercise a changed module, contract tests that the change requires updating, and the matching check scripts. The brief lists the minimum set; executors MAY add only items in these three categories, each with a reason. Other additions need Orchestrator authorization. Report every selected item and why. Read only to confirm the brief and identify tests in those categories. In task mode, never run full regression or substitute checks. In task mode, do not search reverse dependencies. Failures follow Implementer → Tester recheck, reusing the current Tester for the same task. This rule takes precedence over the upstream TDD per-task project-suite instruction; upstream text is unchanged. Report every failure observed in any run by name.";
const finalScopeSentence = '**Final mode** runs once after all tasks are accepted and committed, as one fresh Tester assignment at the verified HEAD of the execution target worktree. Run (1) all contract tests, (2) all check scripts, (3) the related tests of re-changed files and (4) substitute checks for applicable triggers. Final mode does not rerun the union of tests that task Tester already passed.';
const finalFailureRule = 'A new failure from final verification follows Implementer → Tester.';
const finalReviewerStartSentence = 'The final Reviewer starts only after final-mode Tester work concludes: the final Tester report is delivered, every new failure is resolved through Implementer → Tester recheck, every new-failure candidate and intermittent candidate is dispositioned, any approved full regression is complete and every undeterminable-scope item is dispositioned under **Undeterminable scope** below.';
const preReviewOutputSentence = 'Reviewer output produced before that point is not the initial final review.';
const finalVerificationParagraph = finalScopeSentence + " A re-changed file is a file that a task's Tester verified, as a changed file or a related test file it ran, and that a later commit changed after that task's focused commit (`git diff --name-only <task commit> HEAD`), plus every non-documentation file changed in base..HEAD by a commit that no task Tester verified. Orchestrator computes the list and cites it in the brief; Tester cross-checks it with read-only `git diff`, MAY add items only within the three categories above with reasons, and reports the reason when the list is empty. Tester records `git status --porcelain` at start and end; a state that is not clean is an environment block that holds final verification. While it runs, neither Orchestrator nor any Implementer writes in that workspace."
  + ` ${finalFailureRule} ${finalReviewerStartSentence} ${preReviewOutputSentence}`;
const substituteHeading = '**Trigger substitute checks**';
const triggerParagraph = substituteHeading + " run in final mode for each applicable trigger: (1) the change modifies a shared module; (2) changes made by others were integrated after the approved base, by merge, rebase onto a newer base or cherry-pick; (3) the change modifies dependency manifests or lockfiles, language or runtime versions, or build or test configuration; (4) the change removes, renames or changes the signature of a public interface such as an exported function, CLI option or configuration key. A shared module is code, configuration, schema, data or generator input that more than one task, role, component or execution or delivery path imports, loads or renders at run time, including its mirrors and generated outputs; documentation read only by people and modules used by a single component are not shared. Decide from actual consumers; when they cannot be determined, treat the module as shared.";
const triggerCheck = 'Tester independently checks triggers (1), (3) and (4) from the base..HEAD diff and log';
const plannerRule = 'provisional trigger judgment with the substitute-check list and reasons';
const triggerJudgmentParagraph = "Planner records a " + plannerRule + " in the plan. Orchestrator cites its provisional judgment and reasons in the final-mode Tester brief. " + triggerCheck + " and checks trigger (2) using the integration history cited by Orchestrator. If trigger applicability is undeterminable, report it as unverified. If no trigger applies, omit substitute checks and report the reason. Change size, risk level alone and out-of-scope failures seen during task checks are not triggers; report such failures as findings.";
const implementerRule = 'substitute checks and full regression only in final-mode Tester verification';
const undeterminableReport = 'item, cause, substitute checks run and remaining unverified scope';
const baselineParagraph = "**Baseline:** No baseline run is recorded in advance, and no base worktree is prepared in advance. Tester classifies each failure in two steps. First, a static check against the approved base: task Tester, which verifies uncommitted work, uses read-only `git diff --name-only <approved base>` plus the untracked files from `git status --porcelain`; final verification Tester uses `git diff --name-only <approved base> HEAD`. Tester checks whether the test file, the modules it directly imports or loads, the fixtures or data it reads, or its test configuration changed. If none changed, it is an unrelated failure: report it separately with that evidence; it is not a finding, and Orchestrator dispositions it. Because it rests on the diff, not a run, NEVER report it as a baseline failure. If any changed, or the check cannot decide (for example a dynamic import, a failure without a test name, or a file-level load failure), report the failure as needing a base run, with the changed paths. Second, only for those failures, Orchestrator prepares a clean detached worktree of the approved base revision at `<git-common-dir>/arc/base/<workflow>`, never under a managed worktree directory (such as `.claude/worktrees/`) or inside the execution target worktree, reuses it for that workflow, runs no tests there, and sends its path and prerequisite state (prepared, or not prepared with the needed commands) to the current Tester. After all final dispositions Orchestrator removes it only if it is still clean; this ARC-owned base worktree is the only exception to the Preservation rule's worktree-deletion ban, and any other state holds removal for the user. Tester runs only those test names alone in the base worktree, for example with Node `--test-name-pattern` or a Python node id. A failure under the same name at base is a baseline failure; a pass at base, or a test or file absent at base, makes it a new failure; a base run that was not performed, was blocked by the environment, failed to load or lacks the name makes it a new-failure candidate. NEVER absorb a candidate as a baseline failure. Check a file-level load or collection failure by loading the same file at base; an identical load failure at base stays a new-failure candidate (same at base) for Orchestrator disposition. If base needs prerequisites or the sandbox prevents running there, Tester installs or generates nothing and reports an environment block; Orchestrator then prepares the prerequisites or assigns a separate Tester whose workspace is the base worktree. If both are blocked, those failures stay new-failure candidates for Orchestrator disposition. Static checks and base reruns classify failures; they are not intermittency diagnosis.";
const resultComparisonParagraph = "**Result comparison:** Compare failures by test name; only new failures are findings, and unrelated failures and new-failure candidates need Orchestrator disposition. Report baseline and unrelated failures separately. Identify tests by name from structured results such as JUnit XML, TAP or a declared line pattern; a failure without a test name, or in a command or file whose results are incomplete, is a new-failure candidate, never a baseline failure. Report intermittent candidates, tests whose outcomes differ across runs with the same inputs, separately from baseline and new failures. Report the slowest files and tests (default ten) for information only. If a failure looks intermittent, rerun only that test in isolation at HEAD, up to three times unless the brief sets another limit. This is diagnosis, not an automatic retry. Report \"passes in isolation: yes/no\" and the rerun count. A pass in isolation never erases the original failure; Orchestrator dispositions it. A failure in isolation is a new-failure finding. For each failure report the test name and file, HEAD command and result, static-check result (changed related paths, or none), base revision, command and result (pass, fail, absent, load-fail or not-run) when a base run was needed, verdict, isolated rerun count and outcome, and environment limits.";
const handoffBriefInputsParagraph = "Tester briefs MUST include the required field " + modeField + ". " + singleModeRule + " Implementer and Tester briefs that assign checks MUST include the approved base revision, the base worktree path and its prerequisite state when one already exists (prepared, or not prepared with the needed commands), the related-test list with reasons and the intermittent-failure isolated rerun limit under [verification](verification.md#test-scope-and-result-comparison). A `mode: task` brief cites those inputs for uncommitted task work. A `mode: final` brief also cites the provisional trigger judgment with reasons, integration history, reused evidence with its commit or tree hash, the full regression approval record when present, and the re-changed-file list.";
const structuredResultsSentence = 'Identify tests by name from structured results such as JUnit XML, TAP or a declared line pattern; a failure without a test name, or in a command or file whose results are incomplete, is a new-failure candidate, never a baseline failure. Report intermittent candidates, tests whose outcomes differ across runs with the same inputs, separately from baseline and new failures. Report the slowest files and tests (default ten) for information only.';
const runtimeCommandsAnchor = 'final-verification-runtime-commands';
const baseVerdictSentence = 'A failure under the same name at base is a baseline failure; a pass at base, or a test or file absent at base, makes it a new failure; a base run that was not performed, was blocked by the environment, failed to load or lacks the name makes it a new-failure candidate.';
const finalPlanRecheckId = 'review.final-plan-recheck';
const finalPlanRecheckSentence = 'Tester findings and new failures from final verification follow Implementer → Tester before that review begins.';
const finalPlanRecheckText = 'Complete required Tester, Tester failure rechecks and final-mode Tester work before the initial final overall Reviewer review; final-mode Tester work concludes when its report is delivered, its new failures are resolved through Implementer → Tester recheck, its new-failure and intermittent candidates are dispositioned, any approved full regression is complete and every undeterminable-scope item is dispositioned. Once that review begins on plan work, every final Reviewer finding, including behavior, follows Implementer → Reviewer without Tester reassignment until resolved. Keep corrections uncommitted through Reviewer rechecks, then accept and create one focused follow-up commit. Tester findings and new failures from final verification follow Implementer → Tester before that review begins. Preserve required Tester outside this final Reviewer exception.';
const oldFinalPlanRecheckSentence = 'Separate Tester findings follow Implementer → Tester.';
const plannerFinalPlanRecheckSentence = 'Preserve required Tester, Tester failure rechecks and concluded final-mode Tester work before the initial final review.';
const reviewerVerificationSentence = 'Tester owns task and final functional/test verification; Orchestrator owns overall completion and acceptance.';
const reviewerFindingsSentence = 'Final-mode Tester work, including Implementer → Tester rechecks of its new failures, concludes before this final stage begins.';
const oldReviewerVerificationPhrase = 'Tester owns functional/test verification';
const profileRoles = ['scouter', 'planner', 'implementer', 'tester', 'reviewer'];
const wholePlanReviewerRule = 'Whole-plan Reviewer is part of final verification;';
const qaAdditionsRule = 'additions within these categories with reasons are authorized;';
const qaRerunLimit = "up to the brief's limit (default three),";
const retiredPhrases = [
  'Final verification is run by Orchestrator',
  "Compare failures with the brief's baseline",
  'Orchestrator runs final verification',
  'In final verification list the union',
  "full regression only in Orchestrator's final verification",
  'full regression only in final QA verification when triggered.',
  'full regression only in final Tester verification when triggered.',
  'runs it once without further authorization',
  'provisional full-regression trigger judgment',
  'Full regression failures follow the base check below.',
  '**Full regression** runs once within final verification',
  "plus full regression once when the brief's provisional judgment",
];
const retiredFinalOrderPhrases = [
  'MAY run concurrently',
  'even after the final Reviewer has started',
  'which may run concurrently with the final Reviewer',
  'while Reviewer and independent work continue',
];
const testScopeLink = /\[[^\]\n]+\]\(verification\.md#test-scope-and-result-comparison\)/g;
const sectionPhrases = [
  'related to the change',
  substituteHeading,
  'A shared module is',
  'by test name',
  'in isolation',
  'rerun count',
  're-changed',
  'base worktree',
  'new-failure candidate',
  'fresh Tester assignment',
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
  tester: [
    {
      lineStart: '1. Use the shared brief, criteria, Implementer summary and relevant prior findings. ',
      rule: `Require the field ${modeField} in the brief. ${singleModeRule} In task mode, independently verify uncommitted work with related tests only: test files directly exercising changed modules, contract tests the change requires updating and matching check scripts; ${qaAdditionsRule} report each selection and reason. In task mode, never run full regression or substitute checks. In task mode, do not search reverse dependencies. Recheck fixes as the current Tester for the same task. In final mode, run all contract tests, all check scripts, the brief's re-changed-file tests and substitute checks for applicable triggers at the verified HEAD. Independently check triggers (1), (3) and (4) from the base..HEAD diff and log and use the brief's integration history for trigger (2). Follow the impact procedure in installed ARC \`references/verification.md\`.`,
      after: ' Use approved structural/consistency checks for policy/configuration.',
      phrases: ['with related tests only', qaAdditionsRule, "the brief's re-changed-file tests", 'Independently check triggers (1), (3) and (4)'],
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
      rule: 'Run only related tests per installed ARC `references/verification.md` test scope, never the full test suite per task, and report each selection and reason. Keep ' + implementerRule + '.',
      after: ' Support success claims with evidence.',
      phrases: ['Run only related tests per installed ARC', 'never the full test suite per task', implementerRule],
    },
  ],
  planner: [
    {
      lineStart: 'Return one complete plan draft covering all top-level tasks and dependencies;',
      before: 'required Tester/focused checks/evidence before acceptance and holds. ',
      rule: "List each task's related tests with reasons. In final verification list all contract tests and check scripts, expected cross-task file overlap that may need recheck, and a " + plannerRule + ".",
      after: ' Put inseparable changes in one task from the outset.',
      phrases: ["List each task's related tests with reasons", plannerRule, 'expected cross-task file overlap that may need recheck'],
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
const readPlatformReference = (platform, name) => readAgent(`${platform}/skill/references/${name}.md`).toString();
const renderPlatformProfile = (platform, role) =>
  renderAgent(`${platform}/agents/arc-${role}.${platform === 'codex' ? 'toml' : 'md'}`);
const verification = platform => readPlatformReference(platform, 'verification');
const testScope = platform => verification(platform).split(heading + '\n')[1]?.split(riskAnchor)[0] ?? '';
const findParagraph = (text, prefix) => text.split('\n\n').find(paragraph => paragraph.startsWith(prefix)) ?? '';

function assertPhrases(text, phrases, source) {
  for (const phrase of phrases) {
    assert.ok(text.includes(phrase), `${source} must include ${phrase}`);
  }
}

test('mode field and single-mode assignment', () => {
  for (const platform of platforms) {
    const brief = readPlatformReference(platform, 'handoff-prep').split('### Verification brief inputs\n\n')[1] ?? '';
    for (const [name, content] of [
      ['verification test scope', testScope(platform)],
      ['Verification brief inputs', brief],
      ['rendered Tester', renderPlatformProfile(platform, 'tester')],
    ]) {
      assertPhrases(content, [modeField, singleModeRule], `${platform} ${name}`);
    }
  }
});

test('task mode forbids full regression and reverse dependency search', () => {
  for (const platform of platforms) {
    assert.equal(findParagraph(testScope(platform), '**Task mode**'), taskModeParagraph, platform);
    assertPhrases(renderPlatformProfile(platform, 'tester'), [
      'In task mode, never run full regression or substitute checks.',
      'In task mode, do not search reverse dependencies.',
      'Recheck fixes as the current Tester for the same task.',
    ], platform);
    assertOccursOnce(renderPlatformProfile(platform, 'implementer'), implementerRule);
  }
});

test('final mode lists four categories and affected tool conditions', () => {
  const expectedScope = testScope(platforms[0]);
  for (const platform of platforms) {
    const section = testScope(platform);
    assert.equal(findParagraph(section, '**Final mode**'), finalVerificationParagraph, platform);
    assertPhrases(findParagraph(section, 'Read-only reverse dependency search'), [
      'only in list or dry-run form with no writes, installs or cache generation',
      'otherwise report an environment block and continue with the next step of the impact procedure',
    ], platform);
    assert.equal(section, expectedScope, `${platform} test scope must be byte-identical`);
  }
});

test('trigger substitute checks table', () => {
  const cases = [
    ['(1) Shared module', ['reverse dependencies', 'static import, require, load and path-string references', 'mirrors and generated outputs', 'nearest package manifest directory', 'otherwise the test directory', 'suspected dynamic reference']],
    ['(2) Integrated changes', ['incoming changes and conflict-resolution files', 'commit or tree hash', 'uncertain integration history']],
    ['(3) Dependencies', ['lockfile diff', 'resolved version changed', 'transitive dependencies', 'missing or unreadable lockfile']],
    ['(3) Language, runtime, build or test configuration', ['one representative test per package or test directory', 'project-declared smoke tests first', 'lexicographically first test file', 'record why', 'unidentifiable package or test layout']],
    ['(4) Public interface', ['identifiers, CLI option strings and configuration keys', 'all contract tests', 'consumers outside the repository are unverified', 'suspected dynamic reference']],
  ];
  for (const platform of platforms) {
    const section = testScope(platform);
    assert.equal(findParagraph(section, substituteHeading), triggerParagraph, platform);
    assert.equal(findParagraph(section, 'Planner records a provisional trigger judgment'), triggerJudgmentParagraph, platform);
    const table = findParagraph(section, '| Trigger | Substitute check |');
    for (const [trigger, phrases] of cases) {
      const row = table.split('\n').find(line => line.startsWith(`| ${trigger} |`)) ?? '';
      assertPhrases(row, phrases, `${platform} ${trigger}`);
    }
  }
});

test('impact procedure order', () => {
  const steps = [
    'same commit or tree hash',
    'affected tool',
    'reverse dependencies',
    'expand the boundary one step',
    'report as undeterminable (unverified)',
  ];
  for (const platform of platforms) {
    const section = testScope(platform);
    const impact = findParagraph(section, '1. Reuse evidence');
    const lines = impact.split('\n');
    assert.equal(lines.length, steps.length, platform);
    let previousIndex = -1;
    for (const [index, phrase] of steps.entries()) {
      assert.ok(lines[index].startsWith(`${index + 1}. `), `${platform} step ${index + 1}`);
      const position = impact.indexOf(phrase);
      assert.ok(position > previousIndex, `${platform} impact procedure order: ${phrase}`);
      assertPhrases(lines[index], [phrase], platform);
      previousIndex = position;
    }
    assertPhrases(lines[2], ['record why steps 1 and 2 were not used'], platform);
    assertOccursOnce(section, 'A suspected dynamic reference goes directly to step 5.');
  }
});

test('undeterminable report and disposition', () => {
  for (const platform of platforms) {
    assertPhrases(findParagraph(testScope(platform), '**Undeterminable scope**'), [
      undeterminableReport,
      '(i) approve full regression',
      '(ii) substitute the project CI full test results',
      '(iii) disposition as unverified',
      'final acceptance and the final Reviewer are held, while independent work continues',
      'never auto-decided in Full Auto',
      'does not turn a criterion into proven',
    ], platform);
    assertOccursOnce(renderPlatformProfile(platform, 'tester'), undeterminableReport);
    assertOccursOnce(verification(platform), 'Passing runs/reports/dispositions never convert unverified to proven');
  }
});

test('approved full regression follow-up', () => {
  const expiration = 'Approval is valid only for that workflow and HEAD and expires when HEAD changes.';
  const expiredApproval = 'If HEAD changes before the final Reviewer starts, an expired approval needs re-approval and a rerun at the new HEAD, or a fresh disposition under **Undeterminable scope**, before the Reviewer starts.';
  const runLimit = 'The approved full regression runs once per approval.';
  for (const platform of platforms) {
    assertPhrases(findParagraph(testScope(platform), '**Approved full regression**'), [
      'the current final-mode Tester runs it as a follow-up; no new Tester is assigned',
      'bridge resumes the same dispatch',
      'native continues the same assignment',
      'each segment starts a new lease.timeoutMinutes timer',
      'if the same assignment cannot continue, report an environment block and hold; the user decides whether to assign a new Tester',
      `${expiration} ${expiredApproval}`,
      runLimit,
      'Approved full regression failures follow the base check below.',
    ], platform);
    assertOccursOnce(verification(platform), expiredApproval);
    assertOccursOnce(verification(platform), runLimit);
  }
});

test('ci substitution conditions', () => {
  for (const platform of platforms) {
    assertPhrases(findParagraph(testScope(platform), '**CI substitution**'), [
      'same commit SHA as the verified HEAD',
      'matching tree hash',
      'all jobs completed',
      'per-test-name results',
      'collected read-only by Orchestrator and cited in the brief',
      'explicit user approval record',
      'otherwise a new-failure candidate or unverified',
      'grants no external action authority',
    ], platform);
  }
});

test('planner and brief inputs', () => {
  for (const platform of platforms) {
    assertOccursOnce(readPlatformReference(platform, 'planning'), plannerRule);
    assertProfileTestScope(renderPlatformProfile(platform, 'planner'), 'planner');
    const brief = readPlatformReference(platform, 'handoff-prep').split('### Verification brief inputs\n\n')[1];
    assert.equal(brief?.split('\n\n')[0], handoffBriefInputsParagraph, platform);
  }
});

test('final-mode results are not cooperative checks', () => {
  const placement = 'Final-mode Tester results are not cooperative checks; record them in the plan-level progress record and the canonical handoff record.';
  for (const platform of platforms) {
    const section = verification(platform).split('## Verification lifecycle in the cooperative CLI\n')[1]?.split('\n<a id="')[0] ?? '';
    assertPhrases(section, [
      placement,
      'Record undeterminable dispositions, approved full regression and CI substitution there as well.',
      'Final review uses `operation: "review"`, `scope: "final"`',
    ], platform);
  }
});

test('ARC agent fragments omit the project suite instruction', () => {
  assert.doesNotMatch(registrySource, /project suite/i);
});

test('canonical final-plan-recheck policy routes final verification failures to Tester', () => {
  const policy = JSON.parse(readAgent('lib/policy/role-policy.json'));
  const rules = policy.rules.filter(rule => rule.id === finalPlanRecheckId);
  assert.equal(rules.length, 1);
  const [{id, roles, effect, controls, text}] = rules;
  assert.deepEqual({id, roles, effect, controls}, {
    id: finalPlanRecheckId,
    roles: ['orchestrator', 'scouter', 'planner', 'implementer', 'tester', 'reviewer'],
    effect: 'require',
    controls: {codex: 'prompt', claude: 'prompt', gemini: 'prompt', grok: 'prompt'},
  });
  assertOccursOnce(text, finalPlanRecheckSentence);
  assert.ok(!text.includes(oldFinalPlanRecheckSentence));
  assert.ok(text.includes(`create one focused follow-up commit. ${finalPlanRecheckSentence} Preserve required Tester`));
});

test('canonical final-plan-recheck policy matches the approved text', () => {
  const policy = JSON.parse(readAgent('lib/policy/role-policy.json'));
  assert.equal(policy.rules.find(rule => rule.id === finalPlanRecheckId)?.text, finalPlanRecheckText);
});

test('policy and fragment sources omit the retired final order phrases', () => {
  for (const path of [
    'lib/policy/role-policy.json',
    'lib/prompts/agent-fragments.json',
    'shared/skill/runtime/role-policy.json',
  ]) {
    const source = readAgent(path).toString();
    for (const phrase of retiredFinalOrderPhrases) {
      assert.ok(!source.includes(phrase), `${path} must omit ${phrase}`);
    }
  }
});

for (const platform of platforms) {
  const references = new URL(`../../${platform}/skill/references/`, import.meta.url);
  const readReference = name => readFileSync(new URL(name, references), 'utf8');
  const extension = platform === 'codex' ? 'toml' : 'md';
  const profilePath = role => `${platform}/agents/arc-${role}.${extension}`;

  test(`${platform} planner render places the final-plan-recheck sentence exactly once`, () => {
    assertOccursOnce(renderAgent(profilePath('planner')), plannerFinalPlanRecheckSentence);
  });

  test(`${platform} reviewer render places the final verification sentences exactly once`, () => {
    const reviewer = renderAgent(profilePath('reviewer'));
    assertOccursOnce(reviewer, reviewerVerificationSentence);
    assertOccursOnce(reviewer, reviewerFindingsSentence);
    assert.ok(!reviewer.includes(oldReviewerVerificationPhrase));
    assert.ok(reviewer.includes(`after required Tester/focused checks and Tester rechecks. ${reviewerVerificationSentence}\n`));
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
      assert.ok(rule?.includes(`create one focused follow-up commit. ${finalPlanRecheckSentence} Preserve required Tester`));
    });
  }

  test(`${platform} verification defines test scope before risk-scaled execution`, () => {
    assertTestScopeSection(readReference('verification.md'));
  });

  test(`${platform} test scope paragraphs match the approved text`, () => {
    const reference = readReference('verification.md');
    const paragraphs = reference.split('\n\n');
    for (const [prefix, expected] of [
      ['**Final mode**', finalVerificationParagraph],
      [substituteHeading, triggerParagraph],
      ['**Baseline:**', baselineParagraph],
      ['**Result comparison:**', resultComparisonParagraph],
    ]) {
      assert.deepEqual(paragraphs.filter(text => text.startsWith(prefix)), [expected], prefix);
    }
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

  test(`${platform} final Reviewer starts only after final-mode Tester work concludes`, () => {
    const reference = readReference('verification.md');
    for (const sentence of [finalFailureRule, finalReviewerStartSentence, preReviewOutputSentence]) {
      assertOccursOnce(reference, sentence);
    }
    const paragraph = findParagraph(reference, '**Final mode**');
    assert.ok(paragraph?.endsWith(`neither Orchestrator nor any Implementer writes in that workspace. ${finalFailureRule} ${finalReviewerStartSentence} ${preReviewOutputSentence}`));
  });

  test(`${platform} base verdict sentences sit in place`, () => {
    const baseline = findParagraph(readReference('verification.md'), '**Baseline:**');
    assert.ok(baseline?.startsWith('**Baseline:** No baseline run is recorded in advance, and no base worktree is prepared in advance.'));
    assert.ok(baseline?.includes(`or a Python node id. ${baseVerdictSentence} NEVER absorb a candidate as a baseline failure.`));
    assert.ok(baseline?.includes('never under a managed worktree directory (such as `.claude/worktrees/`) or inside the execution target worktree'));
    assert.ok(!baseline?.includes('never under `.claude/worktrees/` or inside the execution target worktree'));
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

  test(`${platform} sources and rendered profiles omit the retired verification sentences`, () => {
    for (const name of ['verification.md', 'handoff-prep.md', 'planning.md']) {
      for (const phrase of retiredPhrases) {
        assert.ok(!readReference(name).includes(phrase), `${name} must omit ${phrase}`);
      }
    }
    for (const phrase of retiredPhrases) {
      assert.ok(!registrySource.includes(phrase), `fragment registry must omit ${phrase}`);
    }
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

  test(`${platform} sources and rendered profiles omit the retired final order phrases`, () => {
    const sources = [
      [`${platform}/skill/SKILL.md`, readAgent(`${platform}/skill/SKILL.md`).toString()],
      ...['verification.md', 'planning.md', 'handoff.md'].map(name => [name, readReference(name)]),
      ...profileRoles.map(role => [profilePath(role), renderAgent(profilePath(role))]),
    ];
    for (const [path, source] of sources) {
      for (const phrase of retiredFinalOrderPhrases) {
        assert.ok(!source.includes(phrase), `${path} must omit ${phrase}`);
      }
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
