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
Tell Coder that others share the repository and unrelated work must be preserved.

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
