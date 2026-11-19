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
