# Handoff contract

CEO reads before every Coder first start or restart preparation. Coder's independent checkout check is defined in the
Coder profile; Coder reads this file only for sections the brief explicitly cites. First-start preparation
(execution-target choice request, preparation Git mutations, planning-document commit) is in
[handoff-prep.md](handoff-prep.md); the new managed worktree path is in [handoff-worktree.md](handoff-worktree.md).

## Workspace handoff

### Checkout approval

Before every Coder first start and restart, CEO confirms the supplied absolute workspace is accessible and belongs
to the intended Git repository; record its actual absolute path, current branch or detached HEAD, HEAD, and staged,
unstaged, and untracked changes. Stop if the workspace is inaccessible, is not the intended repository, or HEAD
cannot be resolved. Do not initialize Git or switch to another repository automatically.

Only after the complete applicable document set and its approved versions are verified, begin execution preparation.
After applicable design/spec/plan approvals, obtain and record an explicit user choice for the first start: use the
current checkout, create a new task branch from the verified base HEAD in that same checkout, or create a
new managed worktree and task branch under handoff-worktree.md. Present the absolute
workspace, current branch or detached HEAD, base HEAD, and validated candidate when offering a new branch. Planning
approval alone, no response, refusal of a new branch alone, or an unclear response does not select the current
checkout. Without an explicit execution-target choice or verified valid reuse under the choice-lifetime rules below, wait and do not start or restart Coder.

### Coder handoff gate

CEO may start or restart Coder only after all of these conditions are verified:

1. All applicable design/spec/plan approvals are recorded with approved artifact paths or valid depth-omission reasons.
   For a Coder Spike probe, record its approved question, method/scope, acceptance criteria, and constraints.
   The complete current-scope document list, approved versions, plan dependencies/order, and absence of unfinished
   applicable documents are verified. Future implementation artifacts are not part of the probe scope or approved by it.
2. The user explicitly selected the execution target initially, or that initial choice remains valid under the restart rules below.
3. The accessible absolute workspace is the intended Git repository.
4. Actual branch or detached HEAD, HEAD, staged/unstaged/untracked state, preservation, and edit ownership are known.
   Unrelated staged files are preserved and block handoff until CEO resolves preparation.
5. Approved planning-document commits are verified, or no documents were required or produced and the valid depth
   rationale is recorded.
6. After any commit or branch operation, final path, branch, HEAD, and change state are rechecked with no unresolved
   failure or partial completion.
7. The brief includes these preparation and final-verification facts and evidence.

Any missing or failed condition blocks handoff. CEO may continue read-only investigation and authorized preparation
or recovery, but cannot start Coder early. Reverify affected evidence when approved content, execution target, branch,
HEAD, or relevant state changes. Coder independently checks the brief and actual checkout before editing on every
start or restart; missing evidence, mismatched state, or unclear ownership requires a report to CEO and no edits.
Coder does not repair preparation through commits, branch creation/switching, or Git permission changes. CEO resolves
preparation and passes the gate again before Coder resumes.

### Handoff evidence

For the worktree path the canonical record maps source and target absolute paths, Git common directory, base SHA,
selected branch, descriptive name, returned actual path, app-managed current-chat attachment, operationId/result,
registration and preservation checks, and document transfer evidence. Give all five roles the
selected absolute worktree path: Coder, QA, Planner, Reviewer, Scouter. On the same approved worktree,
recheck actual state before reuse of the initial explicit choice; loss of target trust requires a new explicit choice.
Do not automatically recreate, cleanup, or archive a worktree. Each role stays in the supplied workspace.

Include accessible Planner spec/plan drafts and self-review findings, CEO integration/save/review responsibility,
approval versions/evidence, absolute save paths, document-save gate results, execution-target request readiness,
and each preparation Git mutation's pre-action evidence and post-action result in the same canonical record.
Record the actual absolute workspace, prior branch or detached HEAD and base HEAD, prior change state and preservation
and edit scope, checkout approval result and evidence, selected execution path, final branch or detached HEAD,
creation/switch result if attempted, and post-selection branch/path/HEAD/change checks in the brief. Include the docs
commit SHA, actual message, included paths, approved-content verification or valid no-document depth rationale,
final verification, and any failure/partial completion and recovery evidence, plus absolute approved artifact paths.
Record the complete current-scope document list, absolute paths/coverage, approved versions/status, plan dependencies
and execution order, skipped-stage reasons, and confirmation that no applicable document awaits writing/approval.
Distinguish reused existing commits from the batch preparation commit, or record valid document absence.
Record applicable approvals and the initial explicit execution-target choice or verified reuse for each first start or restart. Give all five
roles the same actual workspace, selected execution checkout, preparation evidence, and absolute artifact paths. Coder and QA work only in the supplied workspace; Planner, Reviewer, and Scouter use
that same workspace. Every role reports missing, inaccessible, or conflicting paths and unexpected branch state to
CEO before dependent work. Roles do not independently create or switch workspaces or branches.

### Choice lifetime and restart record

Normal accepted task commits do not by themselves invalidate the initial choice for the same approved scope,
workspace, repository and execution target. Link the approved plan version, task ID and commit SHA/content/validity
with current Git state and edit ownership in the restart brief; retain the full handoff gate and independent checks.
Verify/reuse successful task commits without duplication and keep planning-document preparation evidence distinct.
Task commits do not require repeating valid document preparation or asking again for a still-valid initial choice.

After successful worktree creation and verification, normal changes in the selected target are governed by this
reuse rule: authorized HEAD and dirty-state changes, including approved document transfer, docs commits, and
implementation, do not by themselves invalidate the initial choice. The creation base SHA remains evidence;
target HEAD need not remain at that base. This does not waive source preservation or unexpected-state checks.

On every first start and restart, CEO and Coder independently recheck actual Git state against the current brief:
absolute workspace and repository identity, branch or detached HEAD, HEAD, staged/unstaged/untracked changes,
preservation and edit ownership, applicable approvals and artifacts, planning-document SHA/message/paths/content
or valid no-document rationale, and CEO's final state verification. A reused choice never waives any gate.

For the same approved scope, workspace, repository, and execution target, reuse the initial explicit choice only
when its evidence is accessible and still valid. If scope, workspace, repository, target, or approved branch candidate
changes, obtain a fresh explicit choice after applicable approvals and document completeness. If an invalidating
failure means the old target cannot be trusted, obtain a fresh explicit choice after CEO resolves preparation.
Normal authorized HEAD and dirty-state changes do not by themselves invalidate the choice; record them and verify
that they match approved work, ownership, and the intended target. State mismatches and unresolved failures block
editing until CEO resolves and revalidates the full gate; resolution does not automatically require a new choice
unless it invalidates the old target. Do not fall back automatically or infer approval from silence or plan approval.

Keep one canonical initial handoff record accessible to each assigned role, containing the approved scope/version,
applicable approvals and absolute approved artifact paths, repository/workspace identity, explicit choice evidence and
selected target, prior/final Git state, preservation/ownership, complete document set/dependencies/order and omissions,
verified existing or batch docs commits, final verification, and failure/partial-completion/recovery evidence.
The Handoff evidence fields above define this record; do not create a separate storage service.

Use a delta-only restart brief: initial record location, next objective and edit ownership, changed decisions,
approvals, documents and scope (or explicit no-change confirmation), current Git state and differences, choice
validity and reuse verification, refreshed commit/artifact checks, CEO final verification, and remaining issues.
An inaccessible initial record, missing evidence, or unclear ownership blocks editing; a prior conversation or
inaccessible link cannot substitute for evidence. Include material needed for a self-contained role handoff, with
accessible canonical evidence instead of repeated history. Reverify revised documents/approvals and current state;
never retrospectively claim preparation of edits made before the gate passed.
