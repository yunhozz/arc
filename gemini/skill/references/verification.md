<a id="verification-and-acceptance"></a>
# Verification and acceptance

Behavior work follows meaningful failing test observation → minimal implementation → focused success → scoped checks under [Test scope and result comparison](#test-scope-and-result-comparison). Report skill/test constraints before edits. Waivers need recorded narrow/understood/reversible scope, no dependent/cross-component lifecycle stages and one check path. Docs exceptions permit named structural checks only, never TDD claims. Report side effects within scope. Reviewer lacks Bash and requests runtime checks. Local tests prove neither remote models nor effort application. Policy prose needs independent role/approval review; text presence proves no compliance. Unexpected failure triggers diagnosis/holds; expected RED grants no unrelated repairs.

Read before verification design, Tester/Reviewer assignment, correction rechecks or UI acceptance. Tester/Reviewer use their profiles and brief-cited sections only. Design companions differ from UI acceptance.

**Evidence verdict:** Criteria are proven, unmet or unverified. Passing runs/reports/dispositions never convert unverified to proven; retain gaps.

<a id="visual-evidence-and-adjudication"></a>
## Visual evidence and adjudication

Each criterion needs the exact approved source, version, approval and access state; IDs, properties and comparison method; and a link between output and revision. Implementer reporting does not replace fresh Tester. Record pass/mismatch/unverified and connect to criterion verdicts; pass needs accessible supporting evidence. Missing linkage is unverified; visible difference is mismatch, separately, without inferring current branch UI. Hold comparison when materials are inaccessible or interpretation approval is missing.

Policy, generated-file and manifest checks prove structure, not role behavior, installed builds, Gemini CLI compliance or fidelity. Report changes, exclusions, checks run and omitted, criterion evidence and limits, and platform availability. Report baseline failures separately; independent progress does not relax checks.

<a id="test-scope-and-result-comparison"></a>
## Test scope and result comparison

Tester briefs MUST include the required field `mode: task | final`. One assignment performs one mode; the only exception is the approved full regression follow-up in final mode.

**Task mode** assigns a fresh Tester for each top-level task requiring Tester verification. Task checks and rechecks verify uncommitted work and run only tests related to the change: test files that directly exercise a changed module, contract tests that the change requires updating, and the matching check scripts. The brief lists the minimum set; executors MAY add only items in these three categories, each with a reason. Other additions need Orchestrator authorization. Report every selected item and why. Read only to confirm the brief and identify tests in those categories. In task mode, never run full regression or substitute checks. In task mode, do not search reverse dependencies. Failures follow Implementer → Tester recheck, reusing the current Tester for the same task. This rule takes precedence over the upstream TDD per-task project-suite instruction; upstream text is unchanged. Report every failure observed in any run by name.

**Final mode** runs once after all tasks are accepted and committed, as one fresh Tester assignment at the verified HEAD of the execution target worktree. Run (1) all contract tests, (2) all check scripts, (3) the related tests of re-changed files and (4) substitute checks for applicable triggers. Final mode does not rerun the union of tests that task Tester already passed. A re-changed file is a file that a task's Tester verified, as a changed file or a related test file it ran, and that a later commit changed after that task's focused commit (`git diff --name-only <task commit> HEAD`), plus every non-documentation file changed in base..HEAD by a commit that no task Tester verified. Orchestrator computes the list and cites it in the brief; Tester cross-checks it with read-only `git diff`, MAY add items only within the three categories above with reasons, and reports the reason when the list is empty. Tester records `git status --porcelain` at start and end; a state that is not clean is an environment block that holds final verification. While it runs, neither Orchestrator nor any Implementer writes in that workspace. A new failure from final verification follows Implementer → Tester. The final Reviewer starts only after final-mode Tester work concludes: the final Tester report is delivered, every new failure is resolved through Implementer → Tester recheck, every new-failure candidate and intermittent candidate is dispositioned, any approved full regression is complete and every undeterminable-scope item is dispositioned under **Undeterminable scope** below. Reviewer output produced before that point is not the initial final review.

Read-only reverse dependency search is allowed in final mode. Use the project's affected tool only in list or dry-run form with no writes, installs or cache generation; otherwise report an environment block and continue with the next step of the impact procedure.

**Trigger substitute checks** run in final mode for each applicable trigger: (1) the change modifies a shared module; (2) changes made by others were integrated after the approved base, by merge, rebase onto a newer base or cherry-pick; (3) the change modifies dependency manifests or lockfiles, language or runtime versions, or build or test configuration; (4) the change removes, renames or changes the signature of a public interface such as an exported function, CLI option or configuration key. A shared module is code, configuration, schema, data or generator input that more than one task, role, component or execution or delivery path imports, loads or renders at run time, including its mirrors and generated outputs; documentation read only by people and modules used by a single component are not shared. Decide from actual consumers; when they cannot be determined, treat the module as shared.

Planner records a provisional trigger judgment with the substitute-check list and reasons in the plan. Orchestrator cites its provisional judgment and reasons in the final-mode Tester brief. Tester independently checks triggers (1), (3) and (4) from the base..HEAD diff and log and checks trigger (2) using the integration history cited by Orchestrator. If trigger applicability is undeterminable, report it as unverified. If no trigger applies, omit substitute checks and report the reason. Change size, risk level alone and out-of-scope failures seen during task checks are not triggers; report such failures as findings.

| Trigger | Substitute check | Undeterminable when |
| --- | --- | --- |
| (1) Shared module | Trace reverse dependencies transitively and run tests reached. Include static import, require, load and path-string references, including mirrors and generated outputs. If the set cannot be determined, expand once to the nearest package manifest directory, otherwise the test directory. | A suspected dynamic reference. |
| (2) Integrated changes | Add incoming changes and conflict-resolution files to the changed set and apply the same impact procedure. Reuse external CI or verification evidence only for the same commit or tree hash. | An uncertain integration history. |
| (3) Dependencies | Use the lockfile diff to find packages whose resolved version changed, including transitive dependencies. Run tests for modules that import those packages. | A missing or unreadable lockfile. |
| (3) Language, runtime, build or test configuration | Run one representative test per package or test directory. Use project-declared smoke tests first, otherwise select the lexicographically first test file per directory, and record why each test was selected. | An unidentifiable package or test layout. |
| (4) Public interface | Search for in-repository callers by identifiers, CLI option strings and configuration keys and run their tests. Final mode already runs all contract tests. Report that consumers outside the repository are unverified because they are outside this search scope. | A suspected dynamic reference. |

Select substitute checks in this impact procedure order:

1. Reuse evidence for the same commit or tree hash and record the basis.
2. Use the project's affected tool under the final-mode conditions above.
3. Trace reverse dependencies and record why steps 1 and 2 were not used.
4. If the affected set remains unclear, expand the boundary one step to the nearest package manifest directory, otherwise the test directory.
5. If the scope still cannot be determined, report as undeterminable (unverified).

A suspected dynamic reference goes directly to step 5.

**Undeterminable scope** requires Tester to report each item, cause, substitute checks run and remaining unverified scope. Orchestrator asks the user to (i) approve full regression, (ii) substitute the project CI full test results, or (iii) disposition as unverified. Until the user decides, final acceptance and the final Reviewer are held, while independent work continues. Resolution of unknown state is never auto-decided in Full Auto. A disposition as unverified does not turn a criterion into proven.

**Approved full regression** requires explicit user approval, and the current final-mode Tester runs it as a follow-up; no new Tester is assigned. On resume, bridge resumes the same dispatch and native continues the same assignment. For bridge, each segment starts a new lease.timeoutMinutes timer. When resuming either route, if the same assignment cannot continue, report an environment block and hold; the user decides whether to assign a new Tester. Approval is valid only for that workflow and HEAD and expires when HEAD changes. The approved full regression runs once. Approved full regression failures follow the base check below.

**CI substitution** requires results for the same commit SHA as the verified HEAD or a matching tree hash with evidence, all jobs completed, accessible per-test-name results, results collected read-only by Orchestrator and cited in the brief, and an explicit user approval record. Use CI results as evidence only for the tests and scope they cover when every condition is met; otherwise a new-failure candidate or unverified is the applicable classification. This collection grants no external action authority.

**Baseline:** No baseline run is recorded in advance, and no base worktree is prepared in advance. Tester classifies each failure in two steps. First, a static check against the approved base: task Tester, which verifies uncommitted work, uses read-only `git diff --name-only <approved base>` plus the untracked files from `git status --porcelain`; final verification Tester uses `git diff --name-only <approved base> HEAD`. Tester checks whether the test file, the modules it directly imports or loads, the fixtures or data it reads, or its test configuration changed. If none changed, it is an unrelated failure: report it separately with that evidence; it is not a finding, and Orchestrator dispositions it. Because it rests on the diff, not a run, NEVER report it as a baseline failure. If any changed, or the check cannot decide (for example a dynamic import, a failure without a test name, or a file-level load failure), report the failure as needing a base run, with the changed paths. Second, only for those failures, Orchestrator prepares a clean detached worktree of the approved base revision at `<git-common-dir>/arc/base/<workflow>`, never under a managed worktree directory (such as `.claude/worktrees/`) or inside the execution target worktree, reuses it for that workflow, runs no tests there, and sends its path and prerequisite state (prepared, or not prepared with the needed commands) to the current Tester. After all final dispositions Orchestrator removes it only if it is still clean; this ARC-owned base worktree is the only exception to the Preservation rule's worktree-deletion ban, and any other state holds removal for the user. Tester runs only those test names alone in the base worktree, for example with Node `--test-name-pattern` or a Python node id. A failure under the same name at base is a baseline failure; a pass at base, or a test or file absent at base, makes it a new failure; a base run that was not performed, was blocked by the environment, failed to load or lacks the name makes it a new-failure candidate. NEVER absorb a candidate as a baseline failure. Check a file-level load or collection failure by loading the same file at base; an identical load failure at base stays a new-failure candidate (same at base) for Orchestrator disposition. If base needs prerequisites or the sandbox prevents running there, Tester installs or generates nothing and reports an environment block; Orchestrator then prepares the prerequisites or assigns a separate Tester whose workspace is the base worktree. If both are blocked, those failures stay new-failure candidates for Orchestrator disposition. Static checks and base reruns classify failures; they are not intermittency diagnosis.

**Result comparison:** Compare failures by test name; only new failures are findings, and unrelated failures and new-failure candidates need Orchestrator disposition. Report baseline and unrelated failures separately. Identify tests by name from structured results such as JUnit XML, TAP or a declared line pattern; a failure without a test name, or in a command or file whose results are incomplete, is a new-failure candidate, never a baseline failure. Report intermittent candidates, tests whose outcomes differ across runs with the same inputs, separately from baseline and new failures. Report the slowest files and tests (default ten) for information only. If a failure looks intermittent, rerun only that test in isolation at HEAD, up to three times unless the brief sets another limit. This is diagnosis, not an automatic retry. Report "passes in isolation: yes/no" and the rerun count. A pass in isolation never erases the original failure; Orchestrator dispositions it. A failure in isolation is a new-failure finding. For each failure report the test name and file, HEAD command and result, static-check result (changed related paths, or none), base revision, command and result (pass, fail, absent, load-fail or not-run) when a base run was needed, verdict, isolated rerun count and outcome, and environment limits.

<a id="risk-scaled-execution"></a>
## Risk-scaled execution

The [fast gate](handoff.md#orchestrator-direct-path-for-small-tasks) references this risk definition; refresh affected evidence when inputs change and preserve independent verification boundaries.

Edits belong to Implementer except the [small direct path](handoff.md#orchestrator-direct-path-for-small-tasks). Orchestrator determines behavior, risk and minimum meaningful checks.

| Risk | Minimum flow |
|---|---|
| Small, low risk | Implementer or direct edit → Orchestrator focused checks → acceptance |
| Ordinary behavior | Implementer → independent Tester → acceptance |
| Significant/high risk, no plan | Implementer → Tester/rechecks → final full-change Reviewer → acceptance |
| Significant/high risk, plan | Per task Implementer → required fresh Tester → acceptance/commit; final independent whole-change Reviewer once after all accepted tasks/required checks/rechecks and concluded final-mode Tester work |

Ordinary/significant tasks need fresh Tester before acceptance. Low risk requires narrow/understood/reversible/focused-verifiable work. Ordinary behavior fails these without significant triggers. Shared role/behavior contracts/state, lifecycle/integration order, security/permissions, data loss/migration, public interfaces and costly install/deploy/rollback are significant. Substantial behavior/contracts are significant regardless of file count. Unclear risk requires investigation/higher flow. Environment failure waives no check or depth judgment.

- Task boundaries alone add no Tester/review. Reviewer is never a plan-task/commit prerequisite. Plans review once at final relevant state after task acceptances/checks and concluded final-mode Tester work; no-plan Reviewer follows Tester before acceptance.
- Preserve specific commitments. Risky unverified dependencies need Tester/resolved or explicitly dispositioned findings before implementation.
- Reuse evidence only for matching scope/state/independence/freshness/flow position. Changes/failures/missing-conflicting evidence invalidate affected reuse.
- Tester independently checks without edits. Reviewer performs no Tester/planning/editing/delegation/completion decisions. Orchestrator routes fixes to Implementer and required Tester rechecks; direct-check failures return to normal flow. Accept after findings/gaps resolved or dispositioned.
- Fresh-per-task applies to Implementer/Tester, not Reviewer. Reuse Reviewer only with independence, valid context and refreshed scope/target/evidence, never an old verdict or waived timing/coverage.

Record which risk/instruction/approved obligations each check satisfies. DO NOT automatically assign Tester/Reviewer for clear low-risk scope with sufficient evidence and no requirement. Metadata counts alone prove no significance; one permission/loss rule may. Vague file deletion is not low-risk evidence; reclassify installer/manifest impacts. Confirm cleanup targets unused, required materials intact, ignore patterns scoped and diff approved before focused-check-only acceptance.

Distinguish environment failures from code failures and report exact limits and gaps. Use Planner/Scouter only for unresolved planning/discovery. Reviewer covers substantial correctness/factual/security/data/interface risks. Orchestrator assigns support as needed. Claim only verified outputs. Read cited `references/test-driven-development.md`, preserving exceptions.

<a id="final-plan-reviewer-correction-loop"></a>
### Final plan Reviewer correction loop

Only final overall Reviewer findings on plan work, including behavior, follow Implementer → Reviewer without Tester reassignment until resolved. One initial full review permits necessary rechecks. Before it, risk checks/final-mode Tester work/Tester failures/unmet criteria still need Implementer → Tester and conclude. No-plan flow remains unchanged.

Expanded scope/separate obligations/gaps hold affected work for resolution/approval. Orchestrator assigns/accepts; Reviewer stays read-only without Tester/acceptance. NEVER present old Tester as post-fix execution. Report actual actor/target/check/result/limits only.

<a id="evidence-after-plan-revision-commit"></a>
## Evidence after plan revision commit

Verify every committed document blob against its latest approved content hash and full approved copy. If no progress records have been committed since approval, the SHA-256 of the committed document content (not the Git blob OID) MUST equal the latest approved `contentHash`. Otherwise the diff from the latest approved copy MUST contain only classified progress records belonging to that commit's task or committed for other tasks after approval (including R-8 separation), or classified plan-level progress records carried by that commit. Record the SHA-256 of the expected content used for this comparison in the canonical record; NEVER overwrite approved copies. Verify each pending revision's status is `committed` and no pending revision remains before overall completion. Link commit SHA in the canonical record only, not the document. Preserve actual approval chronology; later committed content proves no earlier approval.

Existing commit evidence links remain valid because history is unchanged. For a contract revision, affected checks and rechecks MUST be rerun against the revised version. Stale evidence from plan-file changes requires refresh under existing rules. Preserve exact-HEAD/document/policy/fingerprint requirements; NEVER rewrite old fingerprints to suggest execution at a new state. Refresh briefs/gates before dependencies. Structure proves no live compliance.

<a id="task-acceptance-and-final-plan-acceptance"></a>
<a id="reviewer-timing-and-task-acceptance"></a>
## Task acceptance and final plan acceptance

Task acceptance differs from final verification/acceptance. Connect criteria/observations/current checks/findings, not checkboxes/reports/passing commands alone. Use fresh Tester where required or low-risk focused checks. For same-task Tester findings and required Tester rechecks, reuse the current Tester while scope/workspace/ownership/context remain valid. Final overall Reviewer findings on plan work follow Implementer → Reviewer without Tester reassignment; see the [final plan Reviewer correction loop](#final-plan-reviewer-correction-loop).

DO NOT delay independently acceptable tasks solely for final-only checks or defer currently required checks to accept early. State final integration scope/timing separately. Whole-plan Reviewer is part of final verification; task commits prove no unperformed final checks. Orchestrator decides final acceptance with Tester/Reviewer/integration evidence/findings and unverified/disposition records. Shared evidence MUST satisfy all reuse rules. Before the overall completion report and any push, PR or merge authorization request, Orchestrator verifies that plan-level progress records are carried by the verified next commit of the plan or, when none follows, recorded only in the canonical handoff record with the plan document unchanged and a clean working tree. While a user decision on a non-blocking final Reviewer finding is pending, hold overall completion; a fix decision follows plan revision and a new task whose accepted commit carries the records, and a no-fix disposition stays canonical only when no later commit follows.

Committed-plan final Reviewer findings need a follow-up task/planning/approvals. Keep corrections uncommitted; refresh committed state plus uncommitted diff/files in Reviewer artifacts/briefs. Reuse/assign independent Reviewer and repeat Implementer → Reviewer until resolved, then accept/commit one focused follow-up. Final-mode Tester findings use Implementer → Tester and conclude before the initial final review. No automatic amend/reset/duplicate originals; scope growth retains planning/approvals.

Orchestrator writes approved-base final base..HEAD diff/changed-file list to `<git-common-dir>/arc/review/<slug>.diff`, using handoff slug and absolute brief citation; inline if small/write denied. Reviewer reads artifact, not Git commands, stating limits.

<a id="ui-browser-acceptance-checks"></a>
### UI browser acceptance checks

Tester has no browser tool: launch/exercise apps/URLs through Bash only with assigned criteria/cited prerequisites, following installed browser-skill CLI guidance.

Briefs MUST supply workspace, existing launch command/URL, account/test-data scope, allowed interactions and this section's accessible citation. Use existing approved environment/tool/browser-skill instructions. No source/docs/tests/config edits, dependencies or environment changes. Missing prerequisites/tools/environment leave exact reported limits/unverified criteria.

For each criterion record command/URL, test state/viewport or inapplicability, interactions, expected/observed results and evidence. Startup/page-load/static checks alone prove no complete UI. Clean only Tester-created processes/sessions; preserve shared services/sessions.

<a id="criterion-evidence-and-finding-handoff"></a>
### Criterion evidence and finding handoff

Report every criterion by ID or wording: method/scope, run status, evidence, verdict, unverified reason/remaining scope. Run status: passed/failed/not run/environment blocked. Verdict: proven/unmet/unverified. Connect conditions/expectations to actual observations; partial/out-of-scope/missing/environment gaps stay unverified. PASS means run status only. Structure proves structure only.

Current-task failures/unmet criteria default to current Implementer/current Tester under coordination context/boundary/amendment rules; findings alone create no task. Before Reviewer, rerun reproduction/invalidated checks, reporting actor/target/results/limits and prior finding resolved/unresolved/unverified with evidence. Repeat Implementer→Tester if unresolved; Tester reuse is no stale-evidence reuse. Environment/missing/out-of-scope are gaps, not presumed code defects; Reviewer cannot replace Tester.

Reviewer behavior findings report criterion/expectation/problem/source/reproduction/evidence, separating source inference/execution. No Tester execution. Outside final-plan exception route Implementer→Tester; other Reviewer rechecks depend on scope/independence. Continue source review of structure/design/facts/security; observable security/interfaces may need both Tester/Reviewer.

Accept from criterion verdicts/findings/rechecks/gaps, not overall run status. Disposition never proves unverified. Low-risk work also links each criterion to focused evidence.

<a id="completion-continuity"></a>
## Completion continuity

Once approval/depth/target/handoff hold, continue execution/correction/reverification/required Tester-Reviewer/disposition/acceptance/report. Preserve timing without new task-level gates. Reports/probes/commands never complete remaining approved scope. DO NOT make authorized execution an optional offer awaiting response. Probe-only ends at question/evidence/limits; combined work follows planning. Omission changes neither risk nor acceptance. Hold only actual affected conditions and report resume requirements. Structure proves no live compliance.

<a id="verification-lifecycle-in-the-cooperative-cli"></a>
## Verification lifecycle in the cooperative CLI

Supported `workflow` is approved complete spec+plan. No-plan/small-task/omission is `cooperative.unsupported`, not policy violation/new documents. CLI executes no checks/Reviewer. Actors/results/verdicts are `operator-attested`, not identity/independence/semantic/enforcement proof.

1. Orchestrator (`actor.role: "orchestrator"`) registers through `record`/`acceptance-evidence` with `data: {kind: "task", task: {...}}`. Task includes `id`, absolute `paths`, `criteria`, `requiredChecks`, `dependencies`, `approvalRef`, `approvalVersion`, `documentVersion`, `scopeVersion`, `targetVersion`. Pending-only registration is not acceptance/commit. Descriptor: `{executable, args, cwd, env, outputs}`; executable/cwd/outputs absolute, cwd/outputs inside workspace. No Reviewer in task checks.
2. `status` observes `changeFingerprints.tasks[taskId]`/`changeFingerprints.final` independently from read-only Git inventory/index and current regular-file bytes/modes/deletions. Task covers owned paths, final the repository. Symlinks/submodules/unmerged indexes hold. This is no atomic observation/execution sandbox. RuntimeHash drift stays stale/hold without automatic stored-version update/migration/reapproval.
3. Check preparation: `operation: "check"`, `taskId`, `arguments: {scope: "task", actor: {id, role: "tester"}, descriptor, changeFingerprint, findingIds?}`. Tester identity attestation MUST differ from Implementer/Orchestrator; cross-task Tester/Implementer reuse is rejected. Descriptor exactly matches registration. After durable intent, execute only existing authorized scope.
4. `result`/`reconcile` records `intentId`, `{status, messageRef, data}` with same actor/descriptor/scope, taskId where applicable, fingerprint and `verdict: "proven" | "unmet" | "unverified"`. Even succeeded/proven applies only to that version. It replaces neither semantic proof nor acceptance. Failed/unknown/mismatch/unverified is not passing evidence. Preserve history.

Failed checks/reviews leave findings. Open separately via `data: {action: "open", id, checkId, message}`. After fixes record `data: {action: "resolve", id, actor: {id, role: "implementer"}, changeFingerprint}` plus evidence messageRef. Actor MUST be assigned to the task or relevant overall task. Resolved becomes closed only after later prepare `findingIds` and same-version successful revalidation. Prior Tester failures retain Implementer→Tester.

Final-mode Tester results are not cooperative checks; record them in the plan-level progress record and the canonical handoff record. Record undeterminable dispositions, approved full regression and CI substitution there as well.

Final review uses `operation: "review"`, `scope: "final"`, `actor.role: "reviewer"`, `descriptor: {kind: "source-review", paths: [...]}` without taskId. Initial final review needs all tasks accepted/current required Tester/concluded final-mode Tester work, never task acceptance/commit prerequisite. Plan-final findings repeat Implementer resolution→Reviewer without Tester reassignment; old Tester is not subsequent-fix execution. Separate unresolved Tester remains.

Scope/document/approval records preserve history. `data.affectedTaskIds` invalidates those tasks/dependents and task/check/acceptance evidence; omitted IDs hold all. Final evidence becomes stale. Preserve unaffected independent evidence. Orchestrator determines semantic impact. Affected tasks need new current-scope approval/contracts before preparation, not revived old approvals; fresh checks/reviews/revalidation too. Current evidence supersedes failures without deletion. Acceptance/commit/completion stay Orchestrator decisions.

<a id="task-acceptance-and-focused-commit-reconciliation-in-the-cooperative-cli"></a>
### Task acceptance and focused commit reconciliation in the cooperative CLI

Plan-mode `prepare` supports `operation: "accept"`/`operation: "commit"`. Acceptance attests `actor.role: "orchestrator"`, taskId and arguments messageRef/same criteria/current exact Tester checkIds/all findingIds/current fingerprint. Latest required descriptors MUST be passed/proven and findings closed by fixes/Tester. Successful attestation marks accepted; reports/checks alone do not. `operator-attested` means operator confirms semantics/identity.

Acceptance pins actual index tree/staged diff/paths/fingerprint. Stage approved paths beforehand and confirm Tester for that index. Unrelated/other-task paths or in-scope unstaged/untracked changes hold. Code cannot identify semantically unrelated same-file hunks; Orchestrator reads diff.

Commit preparation references `arguments: {"acceptanceId": "acceptance requestId"}`. Check current approval/contract/Tester/findings/index match acceptance and persist expected parent/tree/paths/residual paths. CLI stages/commits nothing. Orchestrator makes one matching focused commit.

Submit intentId/`actor.role: "orchestrator"` and `result: {"status": "succeeded", "messageRef": "actual result evidence", "data": {"commit": "full OID"}}` through reconcile/result. CLI rereads local object/parent/tree/paths/HEAD/index/residual changes. Only complete match updates target HEAD/committed. Preserve failed/unknown/mismatch/history; never arbitrary target updates. Same request/completed intent permits no repeated effect. Inspect/resolve/reconcile existing intent after failure.

NEVER rewrite Tester fingerprints after commit. Separate post-commit observations detect changes. Final review needs current task evidence/final fingerprint. RuntimeHash drift keeps existing stale/hold without automatic version update.

[ARC role policy: contract begin]
Generated from lib/policy/role-policy.json; do not edit this managed section manually.
- [git.orchestrator-accept-commit] Only Orchestrator accepts work and performs Git mutations. One approved top-level plan task becomes one focused implementation commit after criteria, required checks and findings are satisfied. Orchestrator accepts, then includes that task's own progress records made after task completion (checkboxes, notes, results, evidence and status) with its implementation work in that commit, without a separate docs/fixup commit or planning-commit amendment for those records. Exclude other tasks; pending approved spec/plan revisions follow planning.plan-revision and preserve the no-change path without empty commits. Plan-level progress records (final verification results, final Reviewer verdicts and finding dispositions, overall completion status) are the sole exception: include them in the plan's next task acceptance or final Reviewer follow-up commit; when no implementation work remains and no standalone closing commit for pending revisions is made, keep them only in the canonical handoff record without changing the plan document or creating a commit. Orchestrator commits without separate user commit approval. Reports, passing checks and Reviewer opinions do not replace acceptance. Preserve unrelated changes and ownership; verify the resulting SHA, content, HEAD and remaining changes. Existing small-task direct and plan-omission paths remain unchanged.
- [review.significant-no-plan] Significant/high-risk work without a plan follows Implementer → Tester and required Tester rechecks → Reviewer of the final full change → Orchestrator acceptance. DO NOT omit Reviewer because no plan exists. This adds no plan obligation.
- [review.significant-plan] Significant/high-risk plan work follows Implementer → required fresh Tester → Orchestrator acceptance and focused commit for each task. After all tasks are accepted and required Tester is complete, Reviewer reviews the final full change once. Reviewer is not a per-task or per-commit gate. Preserve required checks and necessary finding rechecks.
- [review.final-plan-recheck] Complete required Tester, Tester failure rechecks and final-mode Tester work before the initial final overall Reviewer review; final-mode Tester work concludes when its report is delivered, its new failures are resolved through Implementer → Tester recheck, its new-failure and intermittent candidates are dispositioned, any approved full regression is complete and every undeterminable-scope item is dispositioned. Once that review begins on plan work, every final Reviewer finding, including behavior, follows Implementer → Reviewer without Tester reassignment until resolved. Keep corrections uncommitted through Reviewer rechecks, then accept and create one focused follow-up commit. Tester findings and new failures from final verification follow Implementer → Tester before that review begins. Preserve required Tester outside this final Reviewer exception.
- [planning.plan-revision] Task progress records (checkboxes, notes, results, evidence and status) preserving the approved contract need no new user approval; Orchestrator includes the completed task's own records in its accepted implementation commit and records classification, reason and actual time as applicable. Plan-level progress records preserving the approved contract also need no new user approval and alone never trigger the standalone docs(plan) closing commit. All other spec/plan content changes, contract or mechanical, require applicable approval and preparation; changes to goals, scope, criteria, method, risk, dependencies or required verification need revised-version approval, preparation and holds on affected work before it continues, with a fresh Implementer for remaining work. After approval Orchestrator edits the same document, appends a revision-history row and leaves it uncommitted as an Orchestrator-owned pending revision, recording version, content hash, approval reference, actual time, classification, reason, affected tasks and the full approved content in the canonical handoff record. Orchestrator includes all pending revisions with Plan-Revision, Plan-Approved-At and Plan-Reason trailers in the accepted commit of the first top-level task executed or reconfirmed against the revised version, otherwise in a current task or final Reviewer follow-up commit; only when no implementation work remains before overall completion MAY it make one standalone docs(plan) closing commit without implementation files. Exclude revision hunks from commits of independent tasks accepted on a prior version, or hold that commit when separation is unsafe. NEVER amend or rewrite planning or implementation commits, create any other docs/fixup commit or authorize past work retroactively. After commit verify the committed document content matches the latest approved content apart from classified progress records of that commit's task or committed for other tasks after approval, or plan-level progress records carried by that commit, and that no pending revision remains. Follow planning, handoff-prep, commit and verification for the full contract.
- [platform.gemini] Role restrictions are prompt-level contracts, not a filesystem sandbox. Native tool restriction fields, observer hooks and Git guards are unverified. Use only available authorized tools; ARC does not write Gemini settings.json.
[ARC role policy: contract end]

<a id="external-operations-and-recovery-in-the-cooperative-cli"></a>
## External operations and recovery in the cooperative CLI

Three phases cover state/documents/assignment; scope/verification/acceptance/focused commits; external approval/results/audit recovery. Inspect nine areas/limits with `status.support`. Support is spec+plan `plan`, not no-plan/omission. CLI executes no native/provider/push/merge/deploy/publish calls.

Operator-confirmed approvals/results are `operator-attested`, `nativeVerified: false`, `remoteVerified: false`; no outside-call blocking or independent remote verification.

Record already confirmed external approval using `evidence: {kind: "external-approval", messageRef, data: {operation, scope, descriptor}}`. `scope` is unique absolute checkout paths. Local commit approval grants no external approval. Record exact action/scope/target and all descriptor fields:

| operation | descriptor fields |
|---|---|
| push | repository, destination, refspec, sourceOid, expectedRemoteOid |
| merge | repository, changeRef, targetRef, expectedTargetOid |
| deploy | service, project, environment, artifactId, destination |
| publish | service, namespace, name, version, artifactHash, destination |

Git OIDs are full lowercase 40/64-character hex; artifactHash is `sha256:<64-hex>`. Without remote observation OIDs are asserted expectations, not verified state. Destination is secret-free. No URL userinfo/query/fragment/password/token/credentials. Recognized secrets are rejected before persistence, but arbitrary-string secrecy cannot be guaranteed.

`prepare` accepts `{requestId, expectedRevision, actor: {id, role: "orchestrator"}, operation, arguments: {approvalRef, scope, descriptor}}`; approvalRef matches external approval messageRef. Persist only exact approval/scope/target/runtime versions with no unresolved effects. After `allow`/`persisted: true`, Orchestrator executes separately approved scope; CLI expands no authority.

`result`/`reconcile` accept `{requestId, expectedRevision, actor, intentId, result: {status, messageRef, data: {operation, scope, descriptor}}}`, with prepare requestId as intentId. Mismatch/unknown/stale outcomes hold while preserving attestations. After interruption inspect intent/`state.requests`/`state.audit`/`state.results` through `status` and investigate actual effects. Reconcile that same intent, not fresh preparation or replayed approvals.

Cancellation also requires `notExecutedEvidence: {messageRef}`; approval remains consumed. No automatic update/migration/renewed permission to fix drift. Report holds. Succeeded results remain attestations, not remote proof. `audit` links request→decision→intent→result→resolution but is locally editable, not tamper-proof. NEVER retry uncertain external outcomes.
