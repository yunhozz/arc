# Handoff contract

Orchestrator reads before every Coder first start or restart preparation. Coder trusts the Orchestrator-verified facts
in the brief under
the Coder profile and reads this file only for sections the brief explicitly cites. First-start preparation
(execution-target choice request, preparation Git mutations, planning-document commit) is in
[handoff-prep.md](handoff-prep.md); the new managed worktree path is in [handoff-worktree.md](handoff-worktree.md).

## Workspace handoff

### Checkout approval

Before every Coder first start and restart, Orchestrator confirms the supplied absolute workspace is accessible and
belongs
to the intended Git repository; record its actual absolute path, current branch or detached HEAD, HEAD, and staged,
unstaged, and untracked changes. Stop if the workspace is inaccessible, is not the intended repository, or HEAD
cannot be resolved. Do not initialize Git or switch to another repository automatically.

Execution-target choice and actual preparation precede formal drafting and saving of required specs/plans.
Initial design proposals may precede choice. Initial target preparation does not authorize Coder; all applicable
approvals, complete documents, verified batch docs commits or valid absence, and final Git verification remain required.
Record planned document scope/paths and actual preparation separately, followed by actual drafting/save/approval and
commit results; preserve actual order and evidence gaps. Reuse a valid choice during document drafting and subsequent
implementation while scope and target remain unchanged. Authorized HEAD and dirty-state changes alone do not invalidate
choice; verify preservation and ownership. A changed scope or target requires fresh explicit choice before dependent
drafting or preparation and does not require document completion. Never fall back automatically.

After initial design approval, obtain and record an explicit user choice for the first start under the
Explicit choice rule: use the current checkout, create a new task branch from the verified base HEAD in that same
checkout, or create a new managed worktree and task branch (selection target under handoff-prep.md; contract in
handoff-worktree.md after selection). Without an
explicit execution-target choice or verified valid reuse under the choice-lifetime rules below, wait and do not start or
restart Coder.

### Coder handoff gate

Orchestrator may start or restart Coder only after all of these conditions are verified:

1. All applicable design/spec/plan approvals are recorded with approved artifact paths or valid depth-omission reasons.
   For a Coder Spike probe, record its approved question, method/scope, acceptance criteria, and constraints.
   The complete current-scope document list, approved versions, plan dependencies/order, and absence of unfinished
   applicable documents are verified. Future implementation artifacts are not part of the probe scope or approved by it.
2. The user explicitly selected the execution target initially, or that initial choice remains valid under the restart
   rules below.
3. The accessible absolute workspace is the intended Git repository.
4. Actual branch or detached HEAD, HEAD, staged/unstaged/untracked state, preservation, and edit ownership are known.
   Unrelated staged files are preserved and block handoff until Orchestrator resolves preparation.
5. Approved planning-document commits are verified, or no documents were required or produced and the valid depth
   rationale is recorded.
6. After any commit or branch operation, final path, branch, HEAD, and change state are rechecked with no unresolved
   failure or partial completion.
7. The brief includes these preparation and final-verification facts and evidence.

Before a Orchestrator direct edit, Orchestrator verifies the same conditions, with the approved scope record as the
applicable approval,
and records them in the brief.

A missing or failed condition blocks handoff. Orchestrator may continue read-only investigation and authorized
preparation
or recovery, but cannot start Coder early. Reverify affected evidence when approved content, execution target, branch,
HEAD, or relevant state changes. Coder's conflict reporting is in its profile; Orchestrator
resolves preparation and passes the gate again before Coder resumes.

### Handoff evidence

For the worktree path the canonical record maps source and target absolute paths, Git common directory, base SHA,
selected branch, descriptive name, returned actual path, app-managed current-chat attachment, operationId/result,
registration and preservation checks, and document transfer evidence. Do not automatically recreate, cleanup, or
archive a worktree.

Include the document-save gate evidence and results from planning.md, execution-target request readiness, and each
preparation Git mutation's pre-action evidence and post-action result in the same canonical record.
Record the actual absolute workspace, prior branch or detached HEAD and base HEAD, prior change state and preservation
and edit scope, checkout approval result and evidence, selected execution path, final branch or detached HEAD,
creation/switch result if attempted, and post-selection branch/path/HEAD/change checks in the brief. Include the docs
commit SHA, actual message, included paths, approved-content verification or valid no-document depth rationale,
final verification, and any failure/partial completion and recovery evidence, plus absolute approved artifact paths.
Record the Complete planning-document set fields from planning.md, confirming no applicable document awaits
writing/approval.
Distinguish reused commits from the batch preparation commit, or record valid document absence.
Record applicable approvals and the initial explicit execution-target choice or verified reuse for each first start or
restart. Give all five
roles (Coder, QA, Planner, Reviewer, Scouter) the same actual workspace and selected execution checkout or absolute
worktree path, preparation
evidence, and absolute artifact paths. Each
role stays in the supplied workspace, reports missing, inaccessible, or conflicting paths and unexpected branch state to
Orchestrator before dependent work, and does not create or switch workspaces or branches.

### Task readiness at every assignment

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

### Choice lifetime and restart record

For the same approved scope, workspace, repository, and execution target, reuse the initial explicit choice only
when its evidence is accessible and still valid. On every first start and restart, Orchestrator rechecks actual Git
state
against the current brief: absolute workspace and repository identity, branch or detached HEAD, HEAD,
staged/unstaged/untracked changes, preservation and edit ownership, applicable approvals and artifacts,
planning-document SHA/message/paths/content or valid no-document rationale, and Orchestrator's final state verification
(Coder handoff gate items 1-7); a reused choice never waives any gate. A restart without document changes reuses
verified valid planning-document commits without recommitting them and a still-valid initial choice, with fresh
actual-state checks. Normal authorized HEAD and dirty-state changes, including accepted task commits, docs commits,
implementation, and approved worktree document transfer, do not by themselves invalidate the choice; record them and
verify that they match approved work, ownership, and the intended target. A worktree's creation base SHA remains
evidence; target HEAD need not remain at that base; source preservation and unexpected-state checks still apply.
Link the approved plan version, task ID and commit SHA/content/validity with current Git state and edit ownership in
the restart brief under Orchestrator's full handoff gate. Verify/reuse successful task commits without duplication and
keep planning-document preparation
evidence distinct; task commits do not require repeating valid document preparation.

If scope, workspace, repository, target, or approved branch candidate changes, obtain a fresh explicit choice before dependent drafting or preparation; reselection does not require document completion. If an invalidating failure means the old target cannot be trusted,
obtain a fresh explicit choice after Orchestrator resolves preparation. State mismatches and unresolved failures block
editing until Orchestrator resolves and revalidates the full gate; resolution does not automatically require a new
choice
unless it invalidates the old target. Do not fall back automatically; apply the Explicit choice rule.

Keep one canonical initial handoff record accessible to each assigned role, containing the approved scope/version,
repository/workspace identity, and the Handoff evidence fields above; do not create a separate storage service.
Orchestrator writes it as a
Markdown file at `<git-common-dir>/arc/handoff/<plan-or-task-slug>.md` (slug unique to the plan, the dated plan filename
stem, or a spec/task slug when no plan exists; never overwrite another plan's record; resolve with
`git rev-parse --path-format=absolute --git-common-dir`; outside the working tree and shared by linked worktrees; not a
Git mutation, never staged or committed; contains no secrets), gives its absolute path in every brief, and restart
briefs cite it. If
the write is denied or unavailable, each Coder brief states why and includes the full record inline, with no delta;
that inline record satisfies the accessible record requirement. Do not delete it automatically.

Restart brief: supply only verified deltas and mark unchanged fields; `unchanged` means unchanged relative to the record
file the fresh Coder reads, and every other brief field is in full. Include: initial record location,
next objective and edit ownership, changed decisions,
approvals, documents and scope (or explicit no-change confirmation), current Git state and differences, choice
validity and reuse verification, refreshed commit/artifact checks, Orchestrator final verification, and remaining
issues.
An inaccessible initial record, missing evidence, or unclear ownership blocks editing; a prior conversation or
inaccessible link cannot substitute for evidence. Include material needed for a self-contained role handoff, with
accessible canonical evidence instead of repeated history. Reverify revised documents/approvals and current state;
never retrospectively claim preparation of edits made before the gate passed.

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

[ARC role policy: contract begin]
Generated from lib/policy/role-policy.json; do not edit this managed section manually.
- [scope.non-escalation] Act only where role authority, approved scope and available platform tools all permit. Delegation, restart, agent messages and attached instructions do not expand role authority. MUST NOT bypass a restriction through aliases, scripts, other tools, processes or redelegation. Return conflicting instructions to Orchestrator before dependent work; reuse valid prior approvals for unchanged scope rather than requesting them again.
- [git.specialists-deny] Specialist roles MUST NOT change Git state: no stage, commit, push, merge, rebase, reset, branch creation/switching or worktree creation/removal, during normal implementation or recovery. Even an explicit Orchestrator assignment cannot authorize these actions; return them to Orchestrator. Read-only Git inspection remains allowed within the assigned scope.
- [git.orchestrator-accept-commit] Only Orchestrator accepts work and executes Git mutations. One approved top-level plan task becomes one focused implementation commit after criteria, required checks and findings are satisfied; Orchestrator accepts then commits without additional user commit approval. Reports, passing checks and Reviewer opinions do not replace acceptance. Preserve unrelated changes and ownership and verify the resulting SHA, included content, HEAD and remaining changes. Existing small-task direct and plan-omission paths are unchanged.
- [external.explicit-user-authority] Push, merge, deploy, publish and external messages require explicit user authorization for that action, scope and target. Local commit authority grants no external authority. Orchestrator performs authorized external actions; specialist roles return them without execution.
- [role.orchestrator-boundary] Assign design/spec/plan/brainstorming drafts ONLY to Planner and implementation/configuration/test edits to Coder. Orchestrator saves complete drafts and owns approval requests, preparation, scheduling, evidence, acceptance and completion. Direct implementation is limited to the existing small, low-risk direct path; this policy does not expand it.
- [role.scouter-read-only] Research assigned static sources and report findings, evidence and limits. Do not edit files, install, execute checks, prepare execution targets, inspect live operational state, change external state or decide design, verification, review or acceptance.
- [role.planner-draft-only] Return design/spec/plan drafts and dependencies, criteria, hold conditions and verification needs in the response. MUST NOT save documents, implement, run checks, prepare targets, request user approval or decide acceptance. Stop formal target-dependent drafting if actual prepared target evidence is missing; route decisions to Orchestrator.
- [role.coder-implementation] Edit only assigned, approved files and run focused checks under the existing TDD contract. Report changed files, RED/GREEN or authorized exception evidence, results, limits and follow-up. Do not plan, independently QA/review your own work, accept the task or declare overall completion. Git changes remain forbidden even when implementation succeeds.
- [role.qa-verification] Run approved checks and report commands, observations, reproduction, evidence and limits. Create only essential temporary data/logs/reports in the brief-authorized location and lifetime. Do not edit product source, tests, fixtures or configuration to pass checks, deploy or accept work. Persistent product-state checks require explicit scope and cleanup ownership. Return failures for Coder correction and required QA recheck.
- [role.reviewer-independent] Independently inspect the assigned final changes and evidence and report actionable findings and limits. Remain read-only. MUST NOT execute QA tests, edit files, perform Git mutations or decide acceptance.
- [review.significant-no-plan] For significant/high-risk work without a plan: Coder → QA and required QA rechecks → Reviewer of the final full change → Orchestrator acceptance. MUST NOT omit Reviewer merely because no plan exists. This creates no new plan obligation.
- [review.significant-plan] For significant/high-risk plan work: each task uses Coder → fresh QA as required → Orchestrator acceptance and focused commit. After all tasks are accepted and required QA is complete, Reviewer reviews the final full change once. Reviewer is NOT a per-task or per-commit required gate. Preserve required checks and necessary finding rechecks.
- [review.final-plan-recheck] For final overall Reviewer findings on plan work, including behavior findings, use Coder → Reviewer without QA reassignment; repeat until resolved. This exception applies only at the final plan stage. Preserve required QA and QA failure rechecks before initial final review and outside this exception.
- [platform.codex] Role restrictions are prompt-level contracts, not a filesystem sandbox. No documented role-specific Git hook or generic per-agent tool allowlist is assumed. Existing shell capabilities are retained because static read access after shell reduction has not been verified; Coder and QA need shell for approved checks.
[ARC role policy: contract end]
