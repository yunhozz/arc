<a id="handoff-contract"></a>
# Handoff contract

Orchestrator reads this before every first-start or restart preparation; Implementer trusts the verified brief and profile and reads only cited sections. Initial preparation follows [handoff-prep](handoff-prep.md).

<a id="instruction-sources-bounded-read-recovery-visual-evidence-and-resumption"></a>
## Instruction sources, bounded read recovery, visual evidence and resumption

Keep shared brief field order, recording source/status within fields. Distinguish user instructions, discovered workspace instructions, installed references and inputs by source/applicability/version or approval/access. A missing root AGENTS.md does not negate user instructions. Missing required skills/references/approved inputs and conflicts hold dependent work.

Optional alternatives need exact locator, material identity, approved version, purpose, method, preconditions, equivalent evidence and return conditions pre-authorized in the brief. Verify alternate locations identify the same material/version. Only side-effect-free reads; no chained search, guessed paths, mutation retries or environment/dependency/permission changes. Return required-input omissions, authority/target/ownership mismatches, partial changes, unknown states and unapproved/ambiguous/failed alternatives immediately. Report first failure/alternative/observations/limits and held dependent/independent work. Orchestrator validates scope/evidence before independent release; unresolved required checks still block acceptance.

Shared text for this section: [handoff-common.md#instruction-sources-bounded-read-recovery-visual-evidence-and-resumption](handoff-common.md#instruction-sources-bounded-read-recovery-visual-evidence-and-resumption). It applies here exactly as if written in place.

<a id="workspace-handoff"></a>
## Workspace handoff

<a id="checkout-approval"></a>
### Checkout approval

Shared text for this section: [handoff-common.md#checkout-approval](handoff-common.md#checkout-approval). It applies here exactly as if written in place.

<a id="implementer-handoff-gate"></a>
### Implementer handoff gate

Shared text for this section: [handoff-common.md#implementer-handoff-gate](handoff-common.md#implementer-handoff-gate). It applies here exactly as if written in place.

<a id="handoff-evidence"></a>
### Handoff evidence

One canonical record includes:

- Document-save gate/results, choice readiness and each mutation's pre-evidence/post-result.
- Absolute workspace, prior branch/detached HEAD/base/state/preservation/ownership, checkout approval/evidence/selected path.
- Final branch, attempted creation/switch results and post-selection path/branch/HEAD/state.
- Document SHA/message/paths/approved content; reused versus batch commits or valid absence/depth rationale.
- Absolute approved artifacts, full set/versions/coverage/dependencies/order and no pending writing/approval.
- Final verification, failures/partial completion/recovery and each start/restart's approval/choice/reuse.
- Each plan task ID and current Implementer conversation ID, status, last result and reuse/replacement decision. Before same-task replacement, record the prior ID and status, allowed reason and supporting evidence; hold if the reason is not established. Record the returned ID after a successful initial or replacement call, and reconcile an uncertain call result before another assignment.
- Worktree source/target paths/common directory/base/branch/name/returned path/app attachment/operationId/registration/source preservation/transfer evidence. No automatic recreation/cleanup/archive.

Shared text for this section: [handoff-common.md#handoff-evidence](handoff-common.md#handoff-evidence). It applies here exactly as if written in place.

<a id="task-readiness-at-every-assignment"></a>
## Task readiness at every assignment

Shared text for this section: [handoff-common.md#task-readiness-at-every-assignment](handoff-common.md#task-readiness-at-every-assignment). It applies here exactly as if written in place.

<a id="choice-lifetime-and-restart-record"></a>
<a id="choice-lifetime-and-reuse"></a>
## Choice lifetime and restart record

Shared text for this section: [handoff-common.md#choice-lifetime-and-restart-record](handoff-common.md#choice-lifetime-and-restart-record). It applies here exactly as if written in place.

Maintain one accessible initial canonical record, not a separate service. Resolve `git rev-parse --path-format=absolute --git-common-dir`; write `<git-common-dir>/arc/handoff/<plan-or-task-slug>.md` with scope/version/identity/evidence. Use a unique dated-plan stem or no-plan spec/task slug; NEVER overwrite another record. It is outside working tree, shared by linked worktrees, not a Git mutation, never staged/committed, secret-free. Give every brief its absolute path; update task ID/SHA/state after accepted commits. NEVER delete automatically.

Shared text for this section: [handoff-common.md#choice-lifetime-and-restart-record-2](handoff-common.md#choice-lifetime-and-restart-record-2). It applies here exactly as if written in place.

<a id="authorization-continuity"></a>
## Authorization continuity

Shared text for this section: [handoff-common.md#authorization-continuity](handoff-common.md#authorization-continuity). It applies here exactly as if written in place.

<a id="common-handoff-gate"></a>
## Common handoff gate

Before every start/restart verify approvals/artifacts or omissions, explicit target/reuse, accessible intended repository/workspace, actual Git identity/state, preservation/ownership, docs commits or absence and no unresolved failure/partial completion. Missing/mismatched/unclear evidence blocks until resolution/full revalidation. This reference owns records/restarts/lifetime. Implementer uses self-contained guards, not mandatory Orchestrator-procedure loading. Depth 2 NEVER creates/switches workspace/branches. Direct edits require the same.
Selected worktrees require common directory, registration, app-managed current-chat attachment, approved branch and source preservation through [managed preparation](handoff-worktree.md) only.

<a id="implementer-tdd-and-constraints"></a>
## Implementer TDD and constraints

Shared text for this section: [handoff-common.md#implementer-tdd-and-constraints](handoff-common.md#implementer-tdd-and-constraints). It applies here exactly as if written in place.

Waiver skips RED-GREEN only, preserving focused checks/risk-scaled Tester/Reviewer; NEVER claim TDD. Follow an applicable higher-priority prohibition on adding or running tests; when precedence and scope are clear, DO NOT report a conflict on that basis or ask permission to violate it. TDD remains applicable to permitted test work. Record unperformed verification and its limits; if precedence or scope is genuinely unclear, or required verification is blocked, hold only affected work and acceptance and report the evidence. Other blocked required steps need recorded decision/required human approval, not internal substitutes. Non-behavior docs/config use specifically approved exceptions only, NEVER generalize to behavior. Test scope follows [verification](verification.md#test-scope-and-result-comparison) and takes precedence over upstream TDD's per-task project-suite instruction.

<a id="orchestrator-direct-path-for-small-tasks"></a>
## Orchestrator direct path for small tasks

Record target choice/reuse before first edit; scope approval alone selects no target. Direct edits without Planner/Implementer need every low-risk/plan-skip condition: one local change, no dependent stages/cross-component shared state/lifecycle/integration-order concerns, one check path and no significant trigger. Exclude Spike/Architectural, ordinary behavior/significant/high/unclear risk and active Implementer file overlaps. File count proves no eligibility.

Shared text for this section: [handoff-common.md#orchestrator-direct-path-for-small-tasks](handoff-common.md#orchestrator-direct-path-for-small-tasks). It applies here exactly as if written in place.


### Fast gate

Select the existing direct path only when all eight conditions are `proven`. Record each as `proven`, `unmet`, or `unverified` with evidence; any `unmet`, `unverified`, missing or ambiguous condition requires full evaluation. Missing required inputs or operational failure also holds dependent work; full evaluation is no bypass.

- **F1**: Scope authorization identifies outcome, scope, criteria and edit boundaries, with no unresolved material behavior, method or risk decision.
- **F2**: One local, understood, reversible change with understood impact and outcome.
- **F3**: No dependent stages, cross-component shared state, lifecycle or integration-order concerns.
- **F4**: Meets [risk-scaled execution](verification.md#risk-scaled-execution) low-risk conditions and no existing direct-path exclusion applies.
- **F5**: One focused verification path covers criteria and identifies required independent Tester/Reviewer.
- **F6**: Explicit target choice or valid reuse, current workspace and change state, preservation and no active ownership conflict are established.
- **F7**: Applicable TDD is identified; any waiver or non-behavior exception meets existing conditions and is recorded beforehand. Explicit user/task TDD overrides waiver.
- **F8**: Applicable instruction source-set and approval, target, criteria and verification evidence are accessible, consistent and unambiguous.

Shared text for this section: [handoff-common.md#handoff-fast-gate](handoff-common.md#handoff-fast-gate). It applies here exactly as if written in place.

### Instruction fingerprint

Shared text for this section: [handoff-common.md#handoff-instruction-fingerprint](handoff-common.md#handoff-instruction-fingerprint). It applies here exactly as if written in place.

### Task envelope

Shared text for this section: [handoff-common.md#handoff-task-envelope](handoff-common.md#handoff-task-envelope). It applies here exactly as if written in place.

### Evidence refresh

Shared text for this section: [handoff-common.md#handoff-evidence-refresh](handoff-common.md#handoff-evidence-refresh). It applies here exactly as if written in place.

<a id="cooperative-cli-verification-handoff"></a>
## Cooperative CLI verification handoff

Shared text for this section: [handoff-common.md#cooperative-cli-verification-handoff](handoff-common.md#cooperative-cli-verification-handoff). It applies here exactly as if written in place.

[ARC role policy: contract begin]
Generated from lib/policy/role-policy.json; do not edit this managed section manually.
- [git.specialists-deny] Specialists MUST NOT change Git state during implementation or recovery: no stage, commit, push, merge, rebase, reset, branch creation/switching or worktree creation/removal. Explicit Orchestrator assignment cannot authorize these actions; return them to Orchestrator. Read-only Git inspection remains allowed within the assigned scope.
- [role.implementer-implementation] Edit only assigned, approved files and run focused checks under the existing TDD contract. Report changed files, RED/GREEN or approved exception evidence, results, limits and follow-up. DO NOT plan, perform Tester or Reviewer verification of your own work, accept the task or declare overall completion. Git mutations remain forbidden after successful implementation. Implementer and fresh Tester handoffs include the exact approved visual source, version, approval and access state; criterion IDs, required properties and comparison method; and actual-output identity, revision and comparison basis. Record pass, mismatch or unverified with accessible evidence and limits. Implementer self-report does not replace fresh Tester and its actual comparison. A missing output-to-revision link is unverified; record a visible difference separately as mismatch without inferring current branch UI state. Missing source/output, inaccessible evidence or unapproved interpretation holds the affected visual claim for Orchestrator. DO NOT silently substitute or redesign.
- [review.significant-no-plan] Significant/high-risk work without a plan follows Implementer → Tester and required Tester rechecks → Reviewer of the final full change → Orchestrator acceptance. DO NOT omit Reviewer because no plan exists. This adds no plan obligation.
- [review.significant-plan] Significant/high-risk plan work follows Implementer → required fresh Tester → Orchestrator acceptance and focused commit for each task. After all tasks are accepted and required Tester is complete, Reviewer reviews the final full change once. Reviewer is not a per-task or per-commit gate. Preserve required checks and necessary finding rechecks.
- [review.final-plan-recheck] Complete required Tester, Tester failure rechecks and final-mode Tester work before the initial final overall Reviewer review; final-mode Tester work concludes when its report is delivered, its new failures are resolved through Implementer → Tester recheck, its new-failure and intermittent candidates are dispositioned, any approved full regression is complete and every undeterminable-scope item is dispositioned. Once that review begins on plan work, every final Reviewer finding, including behavior, follows Implementer → Reviewer without Tester reassignment until resolved. Keep corrections uncommitted through Reviewer rechecks, then accept and create one focused follow-up commit. Tester findings and new failures from final verification follow Implementer → Tester before that review begins. Preserve required Tester outside this final Reviewer exception.
- [platform.codex] Role restrictions are prompt-level contracts, not a filesystem sandbox. ARC supplies no native observer hook or role-specific Git guard. Existing shell capabilities are retained because static read access after shell reduction has not been verified; Implementer and Tester need shell for approved checks.
[ARC role policy: contract end]

<a id="initial-implementer-assignment-through-the-cooperative-cli"></a>
## Initial Implementer assignment through the cooperative CLI

Shared text for this section: [handoff-common.md#initial-implementer-assignment-through-the-cooperative-cli](handoff-common.md#initial-implementer-assignment-through-the-cooperative-cli). It applies here exactly as if written in place.

<a id="external-operations-and-recovery-in-the-cooperative-cli"></a>
## External operations and recovery in the cooperative CLI

Shared text for this section: [handoff-common.md#external-operations-and-recovery-in-the-cooperative-cli](handoff-common.md#external-operations-and-recovery-in-the-cooperative-cli). It applies here exactly as if written in place.

<a id="composite-bridge-results-and-briefs"></a>
## Composite bridge results and briefs

Shared text for this section: [handoff-common.md#composite-bridge-results-and-briefs](handoff-common.md#composite-bridge-results-and-briefs). It applies here exactly as if written in place.
