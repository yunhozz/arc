# Coder handoff

Orchestrator verifies the absolute workspace/repository, branch or detached HEAD, HEAD, staged/unstaged/untracked state,
ownership, document approvals and committed planning documents before first start and restart.
The approved execution target must remain valid. Claude v1 supports current checkout execution and does not support
ARC-managed worktrees.

Execution-target choice and actual preparation precede formal drafting and saving of required specs/plans.
Initial design proposals may precede choice. Initial target preparation does not authorize Coder; all applicable
approvals, complete documents, verified batch docs commits or valid absence, and final Git verification remain required.
Record planned document scope/paths and actual preparation separately, followed by actual drafting/save/approval and
commit results; preserve actual order and evidence gaps. Reuse a valid choice during document drafting and subsequent
implementation while scope and target remain unchanged. Authorized HEAD and dirty-state changes alone do not invalidate
choice; verify preservation and ownership. A changed scope or target requires fresh explicit choice before dependent
drafting or preparation and does not require document completion. Never fall back automatically.

Resolve the Git common directory (`git rev-parse --path-format=absolute --git-common-dir`) and keep one canonical record
at `<git-common-dir>/arc/handoff/<plan-or-task-slug>.md`, outside the working tree.
The slug is unique per plan: the dated plan filename stem, or a spec/task slug when no plan exists; never overwrite
another plan's record. Never stage it or store secrets there. Orchestrator updates the record after each accepted task
commit (task ID, SHA, state). Record approved document paths/versions/coverage/dependencies and approval evidence;
explicit target choice; prior and resulting Git state; document commit SHA/subject/files; task scope, ownership,
checks and limits. If a gate or record was late, record actual order and resolve forward; never claim retroactive
compliance.

The Coder brief supplies absolute workspace, verified branch/HEAD, canonical record path, approved task/criteria,
exact file ownership, expected tests, dependency limits and blocked conditions. Restart brief: supply only verified
deltas and mark unchanged fields; `unchanged` means unchanged relative to the record file the fresh Coder reads,
and every other brief field is in full. Coder trusts Orchestrator verified prep rather than independently repeating
approval/Git evidence checks, reads fields marked unchanged, and stops on an actual observed conflict.
Tell Coder that others share the repository and unrelated work MUST be preserved.

Roles report directly to Orchestrator. Do not delegate at depth 2. Orchestrator sequences dependent work,
resolves actual blockers and revalidates affected gates before resume. No automatic retry after unexpected Git or tool
failure.

If the record write is denied or unavailable, Orchestrator carries the full record inline in every Coder brief (no
delta, no record-file `unchanged`) and states why; that satisfies the accessible-record requirement.
Do not delete it automatically.

## Task readiness at every assignment

Before each first start or restart, if an approved plan exists, link its current dependency/readiness record
(planning.md) in the canonical record and brief. Where plan omission is valid under existing rules, do not create a
plan or map solely to satisfy this linking duty; record the applicable omission judgment and rationale in the
canonical record and brief. Plan absence alone does not qualify for omission, and an unapproved required plan
cannot bypass its approval gate.

Before assignment, apply every readiness condition in
[planning.md, Dependency and readiness record](planning.md#dependency-and-readiness-record), including predecessor
checks, Orchestrator acceptance and verified focused commit or accepted no-change evidence. A Coder completion report
alone is insufficient. Verify the linked record is current and capacity and file ownership permit assignment.
Readiness supplements the full handoff gate and execution-target restrictions; it never waives them.
For authorized HEAD or state changes, refresh this record and affected briefs, verify preservation and ownership,
revalidate affected gates, and reassess readiness under planning.md and [commit.md](commit.md#shared-checkout-coordination).
Unexpected HEAD or ownership changes stop affected work for Orchestrator resolution and revalidation.

## Choice lifetime and reuse

Accepted task commits do not by themselves invalidate the initial execution-target choice for the same approved scope,
workspace, repository, and target; verify and reuse successful task commits without duplication.
On every first start and restart recheck actual state against the brief (workspace/repository identity,
branch or detached HEAD, HEAD, changes, ownership, approvals, document commits or valid absence); reuse never waives a
gate. Reuse the choice only while its evidence is accessible and valid. If scope, workspace, repository, target,
or approved branch candidate changes, or a failure means the old target cannot be trusted, obtain a fresh explicit
choice before dependent drafting or preparation; reselection does not require document completion. Authorized HEAD and dirty-state changes alone do not
invalidate it; record them and verify they match approved work. State mismatches block editing until Orchestrator
revalidates the gate; resolution does not by itself require a new choice unless it invalidates the old target;
never fall back automatically (apply the Explicit choice rule). Inaccessible records or unclear ownership block editing;
prior conversation cannot substitute for evidence.

## Authorization continuity

Use [planning](planning.md#authorization-and-scope) for approval evidence and scope classification. Record that evidence,
its scope, criteria, constraints, and valid document-depth omissions alongside execution-target choice and preparation.
Reuse valid authorization for the same approved scope and target. A restart or new role assignment does not require
repeat approval. Reuse never waives verification of actual workspace/repository, branch or detached HEAD, HEAD,
changes, preservation, ownership, applicable documents, and preparation evidence by Orchestrator. Refresh actual state
and affected briefs for authorized changes; they alone do not invalidate approval. Coder trusts the verified brief
under its profile. Material scope/method/risk changes and invalid target evidence hold affected work; resolve using
planning and the choice-lifetime rules above. Report the missing condition and resume evidence rather than asking
for an approval already valid for that scope.

Before any exception judgment, Orchestrator reads [Risk-scaled execution](verification.md#risk-scaled-execution) and [planning](planning.md) for the full risk and plan-depth conditions.

## Common handoff gate

Before every Coder first start/restart, Orchestrator passes the full gate:
applicable approvals/artifacts or valid omissions, explicit execution-target choice
or verified reuse, intended accessible repository/workspace, actual Git identity/state, preservation/ownership,
verified document commits or valid absence, and no unresolved failure/partial completion.
Missing evidence, mismatches, unclear ownership or unresolved preparation block handoff and require Orchestrator
resolution and full revalidation. Handoff owns the evidence fields, canonical handoff record, restart brief, choice lifetime
and reuse. Coder trusts the Orchestrator-verified brief and reports actual conflicts under its self-contained profile;
never replace its local guards with a requirement to load Orchestrator procedures.
Depth-2 roles use the supplied workspace and report path/state conflicts; they cannot create/switch workspaces or
branches. The same conditions apply before a Orchestrator direct edit.
Claude v1 supports the current checkout only; obtain the explicit current-branch or task-branch choice and complete
approved document preparation under [handoff-prep](handoff-prep.md).
ARC-managed worktree execution is unsupported; report an isolated worktree request before dependent work.


## Coder TDD and constraints

Before feature, bug-fix, or behavior edits, Coder follows local `test-driven-development` unless the explicit
ARC exception applies; the Coder profile holds Coder's full TDD rules. TDD is waived only when every small,
low-risk criterion (Risk-scaled execution) and every plan-skip criterion (Orchestrator direct path) holds.
Before Coder starts,
Orchestrator records the scope, why every criterion is met, acceptance criteria, and focused verification in the brief.
An explicit user or task-specific TDD request overrides
this waiver. For qualifying tasks only, this exception takes precedence over the generic trigger in the local reference;
do not change that skill. Ordinary multi-step or significant/high-risk work is not eligible. The waiver skips only
RED-GREEN steps; focused checks and risk-appropriate QA/Reviewer remain, and do not claim TDD was followed.
If a constraint blocks a required TDD step, Orchestrator records the
decision in the brief/plan and obtains any required human approval; internal approval is not a substitute.
Non-behavior documentation/configuration uses only a specifically authorized exception recorded in the brief; do not
generalize it to behavior work.


## Orchestrator direct path for small tasks

Orchestrator may edit directly only when every small, low-risk criterion (Risk-scaled execution) holds.
Every plan-skip criterion must also hold: one local change, no dependent stages, no cross-component shared state,
lifecycle, or integration-order concerns, and one focused verification path. Significant, architectural,
ordinary-behavior, unclear-risk work and edits overlapping a running Coder's assigned files are ineligible.

Significant risk is defined in Risk-scaled execution and excludes work from the Orchestrator direct path;
do not infer eligibility from a small file count.

Before editing, Orchestrator records a scope record (not a brainstorming design) with scope and files,
why every criterion holds, acceptance criteria, and focused verification. Apply authorization in
[planning](planning.md#authorization-and-scope): an existing sufficiently specific user request can approve
that scope; no duplicate approval is needed. Otherwise present the scope record to the user and obtain explicit
approval before editing. Silence, an ambiguous response, or approval of other work is not approval.
Orchestrator then verifies the same handoff gate as a Coder first start: explicit execution-target choice or valid
reuse, accessible intended workspace and repository, branch or detached HEAD, HEAD, staged/unstaged/untracked state,
preservation and ownership, and no unresolved failure or partial completion. Read this reference
and [handoff preparation](handoff-prep.md) before checking this gate.

Orchestrator edits only the approved files, preserves others' edits, and makes surgical changes without unrelated
refactoring or unapproved dependencies. Behavior edits follow the Coder TDD rules and applicable recorded waiver
criteria; an explicit user or task-specific TDD request still requires test-driven-development.
Do not claim TDD under a waiver. After editing, Orchestrator records changed files, runs focused checks,
connects each acceptance criterion to evidence, and reports unverified scope. Orchestrator is not an independent
reviewer of its own edits; assign QA when evidence is incomplete. If scope expands, risk becomes unclear,
or any criterion fails, stop editing, record completed changes, and return subsequent edits to the normal Planner/Coder
flow. A failed focused check or a QA finding routes the correction to Coder, and it is rechecked; Orchestrator does not
self-correct.

Like other plan-skip
paths, there is no automatic task commit; commits follow applicable guidance and user requests.


[ARC role policy: contract begin]
Generated from lib/policy/role-policy.json; do not edit this managed section manually.
- [git.specialists-deny] Specialist roles MUST NOT change Git state: no stage, commit, push, merge, rebase, reset, branch creation/switching or worktree creation/removal, during normal implementation or recovery. Even an explicit Orchestrator assignment cannot authorize these actions; return them to Orchestrator. Read-only Git inspection remains allowed within the assigned scope.
- [role.coder-implementation] Edit only assigned, approved files and run focused checks under the existing TDD contract. Report changed files, RED/GREEN or authorized exception evidence, results, limits and follow-up. Do not plan, independently QA/review your own work, accept the task or declare overall completion. Git changes remain forbidden even when implementation succeeds.
- [review.significant-no-plan] For significant/high-risk work without a plan: Coder → QA and required QA rechecks → Reviewer of the final full change → Orchestrator acceptance. MUST NOT omit Reviewer merely because no plan exists. This creates no new plan obligation.
- [review.significant-plan] For significant/high-risk plan work: each task uses Coder → fresh QA as required → Orchestrator acceptance and focused commit. After all tasks are accepted and required QA is complete, Reviewer reviews the final full change once. Reviewer is NOT a per-task or per-commit required gate. Preserve required checks and necessary finding rechecks.
- [review.final-plan-recheck] For final overall Reviewer findings on plan work, including behavior findings, use Coder → Reviewer without QA reassignment; repeat until resolved. This exception applies only at the final plan stage. Preserve required QA and QA failure rechecks before initial final review and outside this exception.
- [platform.claude] Existing per-role tool allowlists reduce available tools; Bash and role contracts are not a filesystem sandbox. A role-scoped Git guard is a separate integration and is not supplied by these policy sections alone.
[ARC role policy: contract end]
