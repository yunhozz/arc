# Handoff contract

Orchestrator reads before every Coder first start or restart preparation. Coder trusts the Orchestrator-verified facts in the brief under
the Coder profile and reads this file only for sections the brief explicitly cites. First-start preparation
(execution-target choice request, preparation Git mutations, planning-document commit) is in
[handoff-prep.md](handoff-prep.md); the new managed worktree path is in [handoff-worktree.md](handoff-worktree.md).

## Workspace handoff

### Checkout approval

Before every Coder first start and restart, Orchestrator confirms the supplied absolute workspace is accessible and belongs
to the intended Git repository; record its actual absolute path, current branch or detached HEAD, HEAD, and staged,
unstaged, and untracked changes. Stop if the workspace is inaccessible, is not the intended repository, or HEAD
cannot be resolved. Do not initialize Git or switch to another repository automatically.

Only after the complete applicable document set and its approved versions are verified, begin execution preparation.
After applicable design/spec/plan approvals, obtain and record an explicit user choice for the first start under the
Explicit choice rule: use the current checkout, create a new task branch from the verified base HEAD in that same
checkout, or create a new managed worktree and task branch (selection target under handoff-prep.md; contract in handoff-worktree.md after selection). Without an
explicit execution-target choice or verified valid reuse under the choice-lifetime rules below, wait and do not start or restart Coder.

### Coder handoff gate

Orchestrator may start or restart Coder only after all of these conditions are verified:

1. All applicable design/spec/plan approvals are recorded with approved artifact paths or valid depth-omission reasons.
   For a Coder Spike probe, record its approved question, method/scope, acceptance criteria, and constraints.
   The complete current-scope document list, approved versions, plan dependencies/order, and absence of unfinished
   applicable documents are verified. Future implementation artifacts are not part of the probe scope or approved by it.
2. The user explicitly selected the execution target initially, or that initial choice remains valid under the restart rules below.
3. The accessible absolute workspace is the intended Git repository.
4. Actual branch or detached HEAD, HEAD, staged/unstaged/untracked state, preservation, and edit ownership are known.
   Unrelated staged files are preserved and block handoff until Orchestrator resolves preparation.
5. Approved planning-document commits are verified, or no documents were required or produced and the valid depth
   rationale is recorded.
6. After any commit or branch operation, final path, branch, HEAD, and change state are rechecked with no unresolved
   failure or partial completion.
7. The brief includes these preparation and final-verification facts and evidence.

Before a Orchestrator direct edit, Orchestrator verifies the same conditions, with the approved scope record as the applicable approval,
and records them in the brief.

Any missing or failed condition blocks handoff. Orchestrator may continue read-only investigation and authorized preparation
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
Record the Complete planning-document set fields from planning.md, confirming no applicable document awaits writing/approval.
Distinguish reused existing commits from the batch preparation commit, or record valid document absence.
Record applicable approvals and the initial explicit execution-target choice or verified reuse for each first start or restart. Give all five
roles (Coder, QA, Planner, Reviewer, Scouter) the same actual workspace and selected execution checkout or absolute worktree path, preparation
evidence, and absolute artifact paths. Each
role stays in the supplied workspace, reports missing, inaccessible, or conflicting paths and unexpected branch state to
Orchestrator before dependent work, and does not create or switch workspaces or branches.

### Task readiness at every assignment

Before each first start or restart, link the approved plan's current dependency/readiness record (planning.md) in the
canonical record and brief. Verify all applicable document approvals and execution preparation, required inputs and
settled shared contracts, required predecessor checks, Orchestrator acceptance and verified focused commits, or
accepted no-change evidence without an empty commit. A Coder completion report alone is insufficient. Verify owned
files and shared resources have no conflict with running work; same-file concurrent Coder edits are forbidden even
on different lines. Uncertain dependencies or unresolved contracts hold affected tasks only. Verify the task's
required check/QA path and capacity under the full-tree four-subagent cap and any lower runtime limit; report limits.
The readiness record supplements every existing handoff gate and execution-target restriction; it never waives one.

Reassess on completion/evidence/acceptance/commit/slot return/new conflict and start ready independent tasks without
waiting for unrelated batch members. For normal authorized commits from independent tasks, record the resulting
HEAD and preserved in-progress ownership/state, refresh canonical evidence and affected briefs, and revalidate affected
gates before further edits or dispatch; valid choice reuse still applies. Unexpected HEAD or ownership changes stop
affected work for Orchestrator resolution and revalidation under the existing failure rules.

### Choice lifetime and restart record

For the same approved scope, workspace, repository, and execution target, reuse the initial explicit choice only
when its evidence is accessible and still valid. On every first start and restart, Orchestrator rechecks actual Git state
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
the restart brief under Orchestrator's full handoff gate. Verify/reuse successful task commits without duplication and keep planning-document preparation
evidence distinct; task commits do not require repeating valid document preparation.

If scope, workspace, repository, target, or approved branch candidate changes, obtain a fresh explicit choice after
applicable approvals and document completeness. If an invalidating failure means the old target cannot be trusted,
obtain a fresh explicit choice after Orchestrator resolves preparation. State mismatches and unresolved failures block
editing until Orchestrator resolves and revalidates the full gate; resolution does not automatically require a new choice
unless it invalidates the old target. Do not fall back automatically; apply the Explicit choice rule.

Keep one canonical initial handoff record accessible to each assigned role, containing the approved scope/version,
repository/workspace identity, and the Handoff evidence fields above; do not create a separate storage service. Orchestrator writes it as a
Markdown file at `<git-common-dir>/arc/handoff/<plan-or-task-slug>.md` (slug unique to the plan, the dated plan filename stem, or a spec/task slug when no plan exists; never overwrite another plan's record; resolve with
`git rev-parse --path-format=absolute --git-common-dir`; outside the working tree and shared by linked worktrees; not a
Git mutation, never staged or committed; contains no secrets), gives its absolute path in every brief, and restart
briefs cite it. If
the write is denied or unavailable, each Coder brief states why and includes the full record inline, with no delta; that inline record satisfies the accessible record requirement. Do not delete it automatically.

Restart brief: supply only verified deltas and mark unchanged fields; `unchanged` means unchanged relative to the record file the fresh Coder reads, and every other brief field is in full. Include: initial record location, next objective and edit ownership, changed decisions,
approvals, documents and scope (or explicit no-change confirmation), current Git state and differences, choice
validity and reuse verification, refreshed commit/artifact checks, Orchestrator final verification, and remaining issues.
An inaccessible initial record, missing evidence, or unclear ownership blocks editing; a prior conversation or
inaccessible link cannot substitute for evidence. Include material needed for a self-contained role handoff, with
accessible canonical evidence instead of repeated history. Reverify revised documents/approvals and current state;
never retrospectively claim preparation of edits made before the gate passed.
