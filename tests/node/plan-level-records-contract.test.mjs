import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const platforms = ['claude', 'codex', 'gemini', 'grok'];
const revisionRow = '| Spec/plan revision within the original scope | auto | Scope-expanding revisions → user |';
const findingRow = '| Non-blocking final Reviewer finding disposition | auto | Fix or no-fix decision only: recommended disposition within approved scope; scope-expanding fixes → user; Reviewer recheck and acceptance stay unchanged |';
const externalRow = '| Push, merge, deploy, publish, external messages | user | — |';
const planningClosing = 'No separate docs/fixup commit is allowed outside this sole closing exception.';

const contracts = {
  'references/commit.md': [
    'its own progress records, eligible plan-level progress records, eligible pending approved spec/plan revisions',
    "Plan-level progress records are final verification results, each final Reviewer round's verdict and finding dispositions (including references to user decisions) and overall completion status. Preserving the approved contract, they need no new approval; changing it makes them a plan revision. They are the sole exception to excluding other tasks' records: Orchestrator includes them in that plan's next commit, either a task acceptance commit created by final Reviewer finding work or the final Reviewer follow-up commit. When no implementation work remains, such as a final Reviewer approval without findings or a user decision not to fix a non-blocking finding, Orchestrator creates no commit for them alone: unless a standalone closing commit made for pending revisions carries them, Orchestrator keeps them only in the canonical handoff record, leaves the plan document unchanged and the working tree clean, and states this in the completion report. Plan-level progress records alone never trigger the standalone `docs(plan)` closing commit.",
    'Write plan-level progress records into the plan document only while staging the commit that carries them; until then keep them in the canonical handoff record.',
    'When this closing commit is made for pending revisions, it also carries the plan-level progress records.',
    'Only when no implementation work remains before overall completion MAY Orchestrator create one standalone `docs(plan): <description>` closing commit.',
  ],
  'references/planning.md': [
    "Plan-level progress records (final verification results, final Reviewer round verdicts and finding dispositions with user-decision references, and overall completion status) follow [commit](commit.md#execution-time-plan-document-updates): they ride the plan's next task acceptance or final Reviewer follow-up commit, or a standalone closing commit made for pending revisions; otherwise they stay only in the canonical record.",
    'Plan-level progress records alone never trigger it.',
    planningClosing,
    findingRow,
    externalRow,
  ],
  'references/handoff-prep.md': [
    'Plan-level progress records follow [commit](commit.md#execution-time-plan-document-updates) and alone never justify the closing commit.',
    '(including R-8 separation) and plan-level progress records carried by this commit',
  ],
  'references/verification.md': [
    '(including R-8 separation), or classified plan-level progress records carried by that commit',
    'Before the overall completion report and any push, PR or merge authorization request, Orchestrator verifies that plan-level progress records are carried by the verified next commit of the plan or, when none follows, recorded only in the canonical handoff record with the plan document unchanged and a clean working tree. While a user decision on a non-blocking final Reviewer finding is pending, hold overall completion; a fix decision follows plan revision and a new task whose accepted commit carries the records, and a no-fix disposition stays canonical only when no later commit follows.',
  ],
  'references/handoff.md': [
    'Plan-level progress records follow the same `task.paths` rule; when no task or follow-up commit follows, they stay only in the canonical record, and the cooperative CLI adds no support for them.',
  ],
  'SKILL.md': [
    "Plan-level progress records ride the plan's next commit or stay only in the canonical record.",
  ],
};

for (const platform of platforms) {
  for (const [file, phrases] of Object.entries(contracts)) {
    test(`${platform} ${file} preserves the plan-level records clauses exactly once`, () => {
      const content = readFileSync(new URL(`../../${platform}/skill/${file}`, import.meta.url), 'utf8');
      for (const phrase of phrases) {
        assert.equal(content.split(phrase).length - 1, 1, phrase);
      }
      if (file === 'references/planning.md') {
        const lines = content.split('\n');
        assert.equal(lines[lines.indexOf(findingRow) - 1], revisionRow);
      }
    });
  }
}

const commitGateContracts = [
  {
    name: 'Commit gate',
    files: ['SKILL.md'],
    phrase: "**Commit gate:** Before every `git commit`, Orchestrator inspects the staged paths and the exact message. A docs-only commit that modifies an existing spec or plan is made only to carry pending user-approved revisions with `Plan-Revision`/`Plan-Approved-At`/`Plan-Reason` trailers. Plan-level progress records (final verification results, final Reviewer verdicts and dispositions, completion status) NEVER justify a commit alone: when no implementation work remains they stay only in the canonical handoff record and the plan document stays unchanged. A final Reviewer finding on the plan or spec document itself is a plan revision that needs user approval before any edit. If the gate fails, do not commit; report to the user.",
  },
  {
    name: 'staged commit gate',
    files: ['references/commit.md'],
    phrase: "Then apply the SKILL.md Commit gate to `git diff --cached --name-status` and the exact message file; hold the commit if it is docs-only, modifies an existing spec or plan and lacks a `Plan-Revision` trailer for each modified document.",
  },
  {
    name: 'new commit recheck',
    files: ['references/commit.md'],
    phrase: "Recheck the new commit against the Commit gate with `git show --name-status --format=%B <sha>`.",
  },
  {
    name: 'closing commit eligibility',
    files: ['references/commit.md'],
    phrase: "The closing commit exists only to carry pending user-approved spec/plan revisions: with no pending revision there is no closing commit, whatever plan-level progress records remain.",
  },
  {
    name: 'plan or spec revision approval',
    files: ['references/commit.md'],
    phrase: "Changing plan or spec content other than progress records, including fixing its final verification section or wording after a final Reviewer finding, is a plan revision: obtain applicable user approval under [planning](planning.md#plan-updates-during-execution) before editing; until then record the finding and its disposition only in the canonical handoff record.",
  },
  {
    name: 'plan commit range audit',
    files: ['references/verification.md'],
    phrase: "Before the overall completion report and any push, PR or merge authorization request, Orchestrator lists every commit in the plan's base..HEAD range with `git log --name-status --format='%h %s%n%(trailers:key=Plan-Revision)'` and confirms none is a docs-only commit modifying an existing spec or plan without `Plan-Revision` trailers; any such commit holds completion and is reported to the user.",
  },
  {
    name: 'role policy commit gate',
    files: ['references/commit.md', 'references/planning.md', 'references/handoff-prep.md', 'references/verification.md'],
    phrase: "Before every commit Orchestrator applies the Commit gate; a docs-only commit modifying an existing spec or plan without Plan-Revision trailers for approved pending revisions is never made.",
  },
];

for (const platform of platforms) {
  for (const {name, files, phrase} of commitGateContracts) {
    test(`${platform} includes the ${name} clause exactly once in each target`, () => {
      for (const file of files) {
        const content = readFileSync(new URL(`../../${platform}/skill/${file}`, import.meta.url), 'utf8');
        assert.equal(content.split(phrase).length - 1, 1, file);
      }
    });
  }
}
