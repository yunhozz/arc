# Focused commits — shared text

This file holds text shared by every platform's commit.md. Each part belongs to the section that links to it and has the same force there.

<a id="automatic-commit-after-plan-task-acceptance"></a>
## Automatic commit after plan-task acceptance

One approved top-level task is one focused implementation commit. Orchestrator verifies criteria, current checks and findings, accepts by judgment, then immediately commits locally without separate user commit approval. After acceptance, Orchestrator records that task's progress (checkboxes, notes, results, evidence and status) and includes it with that task's implementation work in the same commit. DO NOT amend the original planning commit or create a separate docs/fixup commit for those records. After acceptance, check Git state/scope, stage and commit. NEVER commit before acceptance or defer until plan completion. Implementer completion is not acceptance; explicit assignment never permits Implementer commits.

Substeps and checkboxes track progress, not commits. Completion marks, reports and passing checks do not establish acceptance; connect conditions and expected results to evidence. Plan omission creates neither new plans nor automatic commits; follow applicable guidance/user requests. Push/merge/publish/deploy/install retain separate approvals. Reviewer timing follows [verification](verification.md#risk-scaled-execution).

1. Before commit verify approved plan version/task ID/accepted scope, actual absolute workspace/repository/branch or detached HEAD/HEAD, staged/unstaged/untracked state and ownership.
2. Verify staged content/paths include only this task, its own progress records, eligible plan-level progress records, eligible pending approved spec/plan revisions and final message; verify revision scope and required trailers. Prove safe separation of other tasks/user changes in shared files. Unrelated staging blocks commit under Preservation rule.
3. After commit verify SHA/message/paths/content, HEAD/branch and remaining state. Successful exit alone proves no completion.
4. Canonically link plan path/version, task ID, acceptance evidence/judgment, required checks/findings, commit results/state, hold/no-change/reuse reasons and remaining final verification.

Hold commits for unmet/unresolved criteria, failed/not-run required checks, undispositioned findings/gaps, scope expansion/revised-plan needs, ownership/staged scope/content mismatch, unexpected workspace/branch/HEAD/Git state or failure/partial completion. Record reason/next action; NEVER waive criteria/checks to commit. Disposition follows Evidence verdict. Inspect actual branch/HEAD/index/working tree/partial completion before retry; uncertain commit creation stops immediate retries. Orchestrator follows [recovery](git-recovery.md), resolves and revalidates evidence.

No-change tasks record acceptance/no change without empty commits. Resume verifies/reuses the same task's SHA/content/validity without duplication. Missing records require actual-result inspection before retry. Normal accepted commits retain valid choice reuse with fresh state/ownership checks. Task acceptance/commit differs from final plan acceptance; remaining Tester/Reviewer/integration checks retain their timing.

For final Reviewer findings on committed plan work, define follow-up task/required planning/approvals. Implementer leaves corrections uncommitted through rechecks. Orchestrator refreshes committed state plus uncommitted diff/changed-file list in Reviewer artifacts/briefs. Reuse/assign an independent Reviewer; repeat Implementer → Reviewer without Tester reassignment until resolved, then accept and create one focused follow-up commit. Final Tester findings retain Implementer → Tester before a new commit. NEVER automatically amend/reset/duplicate original implementation commits. NEVER amend planning or implementation commits. Scope expansion retains planning/approval duties.

Local commit authority never permits early planning-document commits. Pre-Implementer approvals/explicit target/batch preparation remain. NEVER amend planning or implementation commits or retroactively authorize past work. Structural checks prove no live compliance.

<a id="execution-time-plan-document-updates"></a>
## Execution-time plan document updates

Follow [planning](planning.md#plan-updates-during-execution) and [preparation](handoff-prep.md#execution-time-plan-revision). Include all pending approved spec/plan revisions in the accepted commit of the first top-level task executed or reconfirmed against the revised version; otherwise use a current task acceptance or final Reviewer follow-up commit. Same-task progress records follow the task implementation commit path above. Preserve actual approval chronology; NEVER authorize past work retroactively.

Plan-level progress records are final verification results, each final Reviewer round's verdict and finding dispositions (including references to user decisions) and overall completion status. Preserving the approved contract, they need no new approval; changing it makes them a plan revision. They are the sole exception to excluding other tasks' records: Orchestrator includes them in that plan's next commit, either a task acceptance commit created by final Reviewer finding work or the final Reviewer follow-up commit. When no implementation work remains, such as a final Reviewer approval without findings or a user decision not to fix a non-blocking finding, Orchestrator creates no commit for them alone: unless a standalone closing commit made for pending revisions carries them, Orchestrator keeps them only in the canonical handoff record, leaves the plan document unchanged and the working tree clean, and states this in the completion report. Plan-level progress records alone never trigger the standalone `docs(plan)` closing commit. Write plan-level progress records into the plan document only while staging the commit that carries them; until then keep them in the canonical handoff record.

Only when no implementation work remains before overall completion MAY Orchestrator create one standalone `docs(plan): <description>` closing commit. Record the supporting evidence canonically, include all pending revisions and required trailers, and include no implementation files. This is the sole separate docs/fixup exception; overall completion requires no pending revision. NEVER amend planning or implementation commits, reset, replay or rewrite their history. When this closing commit is made for pending revisions, it also carries the plan-level progress records.

For independent tasks accepted against a prior version, exclude pending revision hunks and stage only that task's own progress records; hold the commit if separation is unsafe. Before staging/commit verify pending revision inclusion/exclusion against the selected task/version and compare staged scope/content to approved copies. For every document add `Plan-Revision: <gitPath> v<from> -> v<to>`; for each version after from through to add `Plan-Approved-At: <gitPath> v<N> <actual ISO 8601 approval time>` and `Plan-Reason: <gitPath> v<N> <reason>`. Use ASCII `->`, repeat keys as needed, preserve existing Git trailers and verify trailers before commit.

After commit verify blobs/latest approved content and clear pending revisions under [verification](verification.md#evidence-after-plan-revision-commit). Preserve implementation acceptance, focused commits and correction follow-ups. Initial complete approved batch still precedes handoff; existing approvals/authority remain.

<a id="shared-checkout-coordination"></a>
## Shared-checkout coordination

Orchestrator serializes shared Git/index/staging/commits across tasks; parallel Implementers NEVER compete in Git transactions. Preserve all other unfinished changes/ownership. Commit accepted work only after scope/content checks. Unrelated staging blocks, but unrelated unstaged work need not finish or enter this commit. Unclear separation/ownership holds affected work.

After each normal independent commit verify/record SHA/content/HEAD/remaining state, refresh canonical record/briefs/gates and immediately reassess readiness. Authorized HEAD changes alone invalidate neither choice nor independent dispatch. Predecessors release dependents only after checks/acceptance/verified commit; accepted no-change replaces commits, never empty commits. Unexpected HEAD/ownership/Git failure stops affected work until resolution/revalidation.

Authorization follows [planning](planning.md#authorization-and-scope); completion/limits follow [verification](verification.md#completion-continuity). Add no no-plan commit duty or claim that local commits establish overall completion.
