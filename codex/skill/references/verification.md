<a id="verification-contract"></a>
# Verification contract

Read before verification design, Tester/Reviewer assignment, correction rechecks or UI acceptance. Tester/Reviewer use their profiles and brief-cited sections only. Design companions differ from UI acceptance.

**Evidence verdict:** Criteria are proven, unmet or unverified. Passing runs/reports/dispositions never convert unverified to proven; retain gaps.

<a id="visual-evidence-and-adjudication"></a>
## Visual evidence and adjudication

Each criterion needs the exact approved source, version, approval and access state; IDs, properties and comparison method; and a link between output and revision. Implementer reporting does not replace fresh Tester. Record pass/mismatch/unverified and connect to criterion verdicts; pass needs accessible supporting evidence. Missing linkage is unverified; visible difference is mismatch, separately, without inferring current branch UI. Hold comparison when materials are inaccessible or interpretation approval is missing.

Policy, generated-file and manifest checks prove structure, not role behavior, installed builds, Claude Code CLI compliance or fidelity. Report changes, exclusions, checks run and omitted, criterion evidence and limits, and platform availability. Report baseline failures separately; independent progress does not relax checks.

<a id="test-scope-and-result-comparison"></a>
## Test scope and result comparison

Shared text for this section: [verification-common.md#test-scope-and-result-comparison](verification-common.md#test-scope-and-result-comparison). It applies here exactly as if written in place.

**Result comparison:** Compare failures by test name; only new failures are findings, and unrelated failures and new-failure candidates need Orchestrator disposition. Report baseline and unrelated failures separately. Identify tests by name from structured results such as JUnit XML, TAP or a declared line pattern; a failure without a test name, or in a command or file whose results are incomplete, is a new-failure candidate, never a baseline failure. Report intermittent candidates, tests whose outcomes differ across runs with the same inputs, separately from baseline and new failures. Report the slowest files and tests (default ten) for information only. If a failure looks intermittent, rerun only that test in isolation at HEAD, up to three times unless the brief sets another limit. This is diagnosis, not an automatic retry. Report "passes in isolation: yes/no" and the rerun count. A pass in isolation never erases the original failure; Orchestrator dispositions it. A failure in isolation is a new-failure finding. For each failure report the test name and file, HEAD command and result, static-check result (changed related paths, or none), base revision, command and result (pass, fail, absent, load-fail or not-run) when a base run was needed, verdict, isolated rerun count and outcome, and environment limits.

<a id="risk-scaled-execution"></a>
## Risk-scaled execution

Shared text for this section: [verification-common.md#risk-scaled-execution](verification-common.md#risk-scaled-execution). It applies here exactly as if written in place.

Edits belong to Implementer except the [small direct path](handoff.md#orchestrator-direct-path-for-small-tasks). Orchestrator determines behavior, risk and minimum meaningful checks.

| Risk | Minimum flow |
|---|---|
| Small, low risk | Implementer or direct edit → Orchestrator focused checks → acceptance |
| Ordinary behavior | Implementer → independent Tester → acceptance |
| Significant/high risk, no plan | Implementer → Tester/rechecks → final full-change Reviewer → acceptance |
| Significant/high risk, plan | Per task Implementer → required fresh Tester → acceptance/commit; final independent whole-change Reviewer once after all accepted tasks/required checks/rechecks and concluded final-mode Tester work |

Shared text for this section: [verification-common.md#risk-scaled-execution-2](verification-common.md#risk-scaled-execution-2). It applies here exactly as if written in place.

<a id="final-plan-reviewer-correction-loop"></a>
### Final plan Reviewer correction loop

Shared text for this section: [verification-common.md#final-plan-reviewer-correction-loop](verification-common.md#final-plan-reviewer-correction-loop). It applies here exactly as if written in place.

<a id="evidence-after-plan-revision-commit"></a>
## Evidence after plan revision commit

Shared text for this section: [verification-common.md#evidence-after-plan-revision-commit](verification-common.md#evidence-after-plan-revision-commit). It applies here exactly as if written in place.

<a id="task-acceptance-and-final-plan-acceptance"></a>
<a id="reviewer-timing-and-task-acceptance"></a>
## Task acceptance and final plan acceptance

Shared text for this section: [verification-common.md#reviewer-timing-and-task-acceptance](verification-common.md#reviewer-timing-and-task-acceptance). It applies here exactly as if written in place.

DO NOT delay independently acceptable tasks solely for final-only checks or defer currently required checks to accept early. State final integration scope/timing separately. Whole-plan Reviewer is part of final verification; task commits prove no unperformed final checks. Orchestrator decides final acceptance with Tester/Reviewer/integration evidence/findings and unverified/disposition records. Shared evidence MUST satisfy all reuse rules. Before the overall completion report and any push, PR or merge authorization request, Orchestrator verifies that plan-level progress records are carried by the verified next commit of the plan or, when none follows, recorded only in the canonical handoff record with the plan document unchanged and a clean working tree. While a user decision on a non-blocking final Reviewer finding is pending, hold overall completion; a fix decision follows plan revision and a new task whose accepted commit carries the records, and a no-fix disposition stays canonical only when no later commit follows.

Committed-plan final Reviewer findings need a follow-up task/planning/approvals. Keep corrections uncommitted; refresh committed state plus uncommitted diff/files in Reviewer artifacts/briefs. Reuse/assign independent Reviewer and repeat Implementer → Reviewer until resolved, then accept/commit one focused follow-up. Final-mode Tester findings use Implementer → Tester and conclude before the initial final review. No automatic amend/reset/duplicate originals; scope growth retains planning/approvals.



<a id="ui-browser-acceptance-checks"></a>
### UI browser acceptance checks

With assigned criteria/cited prerequisites, Tester MAY use available approved browser tools for apps/URLs.

Shared text for this section: [verification-common.md#ui-browser-acceptance-checks](verification-common.md#ui-browser-acceptance-checks). It applies here exactly as if written in place.

For each criterion record command/URL, test state/viewport or inapplicability, interactions, expected/observed results and evidence. Startup/page-load/static checks alone prove no complete UI. Clean only Tester-created processes/sessions; preserve shared services/sessions.

<a id="criterion-evidence-and-finding-handoff"></a>
### Criterion evidence and finding handoff

Shared text for this section: [verification-common.md#criterion-evidence-and-finding-handoff](verification-common.md#criterion-evidence-and-finding-handoff). It applies here exactly as if written in place.

<a id="completion-continuity"></a>
## Completion continuity

Shared text for this section: [verification-common.md#completion-continuity](verification-common.md#completion-continuity). It applies here exactly as if written in place.

<a id="verification-lifecycle-in-the-cooperative-cli"></a>
## Verification lifecycle in the cooperative CLI

Shared text for this section: [verification-common.md#verification-lifecycle-in-the-cooperative-cli](verification-common.md#verification-lifecycle-in-the-cooperative-cli). It applies here exactly as if written in place.

<a id="task-acceptance-and-focused-commit-reconciliation-in-the-cooperative-cli"></a>
### Task acceptance and focused commit reconciliation in the cooperative CLI

Shared text for this section: [verification-common.md#task-acceptance-and-focused-commit-reconciliation-in-the-cooperative-cli](verification-common.md#task-acceptance-and-focused-commit-reconciliation-in-the-cooperative-cli). It applies here exactly as if written in place.

[ARC role policy: contract begin]
Generated from lib/policy/role-policy.json; do not edit this managed section manually.
- [git.orchestrator-accept-commit] Only Orchestrator accepts work and performs Git mutations. One approved top-level plan task becomes one focused implementation commit after criteria, required checks and findings are satisfied. Orchestrator accepts, then includes that task's own progress records made after task completion (checkboxes, notes, results, evidence and status) with its implementation work in that commit, without a separate docs/fixup commit or planning-commit amendment for those records. Exclude other tasks; pending approved spec/plan revisions follow planning.plan-revision and preserve the no-change path without empty commits. Plan-level progress records (final verification results, final Reviewer verdicts and finding dispositions, overall completion status) are the sole exception: include them in the plan's next task acceptance or final Reviewer follow-up commit; when no implementation work remains and no standalone closing commit for pending revisions is made, keep them only in the canonical handoff record without changing the plan document or creating a commit. Orchestrator commits without separate user commit approval. Reports, passing checks and Reviewer opinions do not replace acceptance. Preserve unrelated changes and ownership; verify the resulting SHA, content, HEAD and remaining changes. Existing small-task direct and plan-omission paths remain unchanged.
- [review.significant-no-plan] Significant/high-risk work without a plan follows Implementer → Tester and required Tester rechecks → Reviewer of the final full change → Orchestrator acceptance. DO NOT omit Reviewer because no plan exists. This adds no plan obligation.
- [review.significant-plan] Significant/high-risk plan work follows Implementer → required fresh Tester → Orchestrator acceptance and focused commit for each task. After all tasks are accepted and required Tester is complete, Reviewer reviews the final full change once. Reviewer is not a per-task or per-commit gate. Preserve required checks and necessary finding rechecks.
- [review.final-plan-recheck] Complete required Tester, Tester failure rechecks and final-mode Tester work before the initial final overall Reviewer review; final-mode Tester work concludes when its report is delivered, its new failures are resolved through Implementer → Tester recheck, its new-failure and intermittent candidates are dispositioned, any approved full regression is complete and every undeterminable-scope item is dispositioned. Once that review begins on plan work, every final Reviewer finding, including behavior, follows Implementer → Reviewer without Tester reassignment until resolved. Keep corrections uncommitted through Reviewer rechecks, then accept and create one focused follow-up commit. Tester findings and new failures from final verification follow Implementer → Tester before that review begins. Preserve required Tester outside this final Reviewer exception.
- [planning.plan-revision] Task progress records (checkboxes, notes, results, evidence and status) preserving the approved contract need no new user approval; Orchestrator includes the completed task's own records in its accepted implementation commit and records classification, reason and actual time as applicable. Plan-level progress records preserving the approved contract also need no new user approval and alone never trigger the standalone docs(plan) closing commit. All other spec/plan content changes, contract or mechanical, require applicable approval and preparation; changes to goals, scope, criteria, method, risk, dependencies or required verification need revised-version approval, preparation and holds on affected work before it continues, with a fresh Implementer for remaining work. After approval Orchestrator edits the same document, appends a revision-history row and leaves it uncommitted as an Orchestrator-owned pending revision, recording version, content hash, approval reference, actual time, classification, reason, affected tasks and the full approved content in the canonical handoff record. Orchestrator includes all pending revisions with Plan-Revision, Plan-Approved-At and Plan-Reason trailers in the accepted commit of the first top-level task executed or reconfirmed against the revised version, otherwise in a current task or final Reviewer follow-up commit; only when no implementation work remains before overall completion MAY it make one standalone docs(plan) closing commit without implementation files. Exclude revision hunks from commits of independent tasks accepted on a prior version, or hold that commit when separation is unsafe. NEVER amend or rewrite planning or implementation commits, create any other docs/fixup commit or authorize past work retroactively. After commit verify the committed document content matches the latest approved content apart from classified progress records of that commit's task or committed for other tasks after approval, or plan-level progress records carried by that commit, and that no pending revision remains. Follow planning, handoff-prep, commit and verification for the full contract.
- [platform.codex] Role restrictions are prompt-level contracts, not a filesystem sandbox. ARC supplies no native observer hook or role-specific Git guard. Existing shell capabilities are retained because static read access after shell reduction has not been verified; Implementer and Tester need shell for approved checks.
[ARC role policy: contract end]

<a id="external-operations-and-recovery-in-the-cooperative-cli"></a>
## External operations and recovery in the cooperative CLI

Shared text for this section: [verification-common.md#external-operations-and-recovery-in-the-cooperative-cli](verification-common.md#external-operations-and-recovery-in-the-cooperative-cli). It applies here exactly as if written in place.
