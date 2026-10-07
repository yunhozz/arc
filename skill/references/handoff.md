# Handoff contract

Read before an execution-target choice request, each preparation Git mutation (branch creation/switch, staging,
commit), and every Coder first start or restart preparation and independent checkout check.

## Workspace handoff

### Execution-target request gate

Before requesting the user's execution-target choice, CEO verifies and records the complete document list, absolute
paths and scope coverage, approved versions and individual approval evidence, plan dependencies and execution order,
and no unfinished applicable documents or unresolved scope/dependency decisions requiring another document.
The set contains required artifacts, not a spec on every path; use planning depth and valid omission rationales.
Unfinished documents or missing approval evidence stop the choice request and preparation. Read-only state checks
are allowed. Do not require choice evidence before asking for that choice: the user's actual choice follows this gate.
Present the verified workspace, current branch or detached HEAD, HEAD, and any validated new-branch candidate under
Checkout approval below. Planning approval, silence, or ambiguous responses never constitute target choice.

### Git mutation evidence gate

Before each preparation Git mutation—branch creation/switch, worktree creation, approved-document staging, or commit—read this
reference and recheck the complete approved document set and approval evidence; explicit execution-target choice
or verified valid reuse; absolute workspace and intended repository; current branch or detached HEAD and HEAD;
staged/unstaged/untracked changes, preservation and edit ownership; and the exact command, target paths, and
approved scope. Confirm no unresolved failure or partial completion. Record these facts in the canonical handoff
record/shared brief before the action. Missing or mismatched evidence stops that mutation until CEO resolves it.
Read-only Git checks remain allowed. Do not infer execution authority from an external skill's early commit step.

Before committing, also verify staged paths/content and the finalized message under Planning document commit.
After every branch or commit operation, verify actual path, branch, HEAD, preserved changes, and result before the
next dependent action. After staging, verify the actual index paths and diff before commit. Preserve unrelated
changes and stop on unrelated staged files; do not automatically unstage, reset, stash, clean, or discard them.
Reverify affected evidence after changes or failures; do not retroactively approve an action taken before its gate.

### Checkout approval

Before every Coder first start and restart, CEO confirms the supplied absolute workspace is accessible and belongs
to the intended Git repository; record its actual absolute path, current branch or detached HEAD, HEAD, and staged,
unstaged, and untracked changes. Stop if the workspace is inaccessible, is not the intended repository, or HEAD
cannot be resolved. Do not initialize Git or switch to another repository automatically.

Only after the complete applicable document set and its approved versions are verified, begin execution preparation.
After applicable design/spec/plan approvals, obtain and record an explicit user choice for the first start: use the
current checkout, create a new task branch from the verified base HEAD in that same checkout, or create a
new worktree and task branch under the dedicated path below. Present the absolute
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

### New task branch

With explicit user approval for the execution target, prepare the new task branch in the existing checkout.
Choose a valid Git branch name in the form `<type>/<short-kebab-case-topic>`. Use a lowercase prefix for the task's
main purpose and a short, specific lowercase kebab-case topic with no spaces. For mixed tasks, choose the main purpose.

| Prefix | Purpose |
|--------|---------|
| feat/ | Add a feature |
| fix/ | Fix a bug |
| refactor/ | Improve code structure while preserving behavior |
| docs/ | Change documentation |
| test/ | Add or change tests |
| build/ | Change build, packaging, or dependencies |
| ci/ | Change CI configuration |
| perf/ | Improve performance |
| style/ | Change formatting or style without behavior changes |
| chore/ | Change operational policy, tools, or maintenance |
| revert/ | Revert a prior change |

Validate the name and check for collisions before creation. If the base name exists, append `-2`, `-3`, and increasing
numeric suffixes to the topic, choosing the first unused name. Never reuse, delete, or overwrite an existing branch.
Distinguish a lookup error from a missing branch. For example: `chore/branch-workspace-policy`, then
`chore/branch-workspace-policy-2`.
Recheck the workspace, current branch or detached HEAD, base HEAD, and candidate before execution. If the approval
target changes, present the new target and obtain explicit user approval. If the candidate changes because of a new
collision, obtain approval for that candidate before creating or switching; without that approval, block handoff.
Use the current checkout only after the user explicitly selects it for this handoff. A failure during creation remains
an operational failure subject to the stop rule below.

Create and switch to the approved new branch from the confirmed base HEAD in the current checkout, for example with
`git switch -c <branch>`. Detached HEAD is acceptable when HEAD is resolved and included in the approval target.
After success, confirm the actual current branch matches the approved candidate, HEAD matches the recorded base, the
checkout absolute path is unchanged, and existing changes are preserved. Do not create a worktree or fall back to
worktree provisioning on failure. Only explicit selection of New worktree and task branch permits worktree creation.

### New worktree and task branch

Only an explicit user choice of this third path authorizes preparation. The selection target includes the
source absolute path, intended repository and Git common directory, source branch or detached HEAD, verified
base SHA, unused branch candidate, target absolute path, and approved document transfer/commit scope.
Use the verified source HEAD SHA as the base. Do not substitute remote HEAD or a default branch or fetch automatically.
Recheck approved source state, base SHA and branch/path candidates before creation, before and after choice.
After selection and before creation, any changes to these values require a fresh explicit choice for the updated target.
This is the pre-creation candidate rule. After successful creation and verification, apply Choice lifetime and restart record.

Use the New task branch name format and collision rules. The default candidate is `../<repo>-<topic>-worktree`,
a sibling under the same parent as the source root; repo is the source root name and topic excludes the branch type
and slash. Resolve the actual absolute path and require the same parent. Any file, directory, symlink, or registered
worktree is a collision. Empty directories are collisions; do not reuse them. Distinguish lookup error from missing
branch/path; uncertain lookup stops preparation. Use branch topic suffixes `-2`, `-3` for the first unused name,
and propose path suffixes such as `-worktree-2`. Never reuse, delete, or overwrite an existing branch or worktree.
A collision after selection and before creation means stop and obtain a new explicit choice for the final branch/path pair;
do not automatically retry another path or branch, infer a path from silence, or fall back to another execution path.

Create only the approved target with `git worktree add -b <branch> <absolute-path> <base-sha>`.
Do not use --force or -B.
Preserve the source branch, HEAD, index, and files. Additions to shared Git metadata for the approved branch and
worktree registration are authorized. After success verify the actual absolute target root, linked-worktree registration,
source and target Git common directory identity, selected branch, base SHA, registered path/branch versus actual
state, and target dirty state. Reverify preservation of source branch, HEAD, index and files.
Linked worktree `.git` may be a file; do not require the same top-level path or a `.git` directory for repository identity.

For untracked approved spec/plan documents, no index entry is normal: verify working-tree bytes against the approved
version. For tracked approved documents, index bytes and working-tree bytes must both match the approved version.
Any mismatch means stop; do not resolve it by staging source documents. Unrelated staged changes, required uncommitted
implementation/configuration/test changes, and unclear ownership block preparation. Clearly unrelated unstaged/untracked
changes may remain in source and are not transferred. Do not automatically stash, commit, reset, clean, or unstage;
do not transfer dirty implementation files. Use Worktree document transfer before target docs preparation.

### Worktree document transfer

Verify existing approved commits by SHA, message, paths and approved content valid at base and target; reuse them.
Copy only uncommitted approved spec/plan documents to the target at the same repository-relative path.
Do not move, delete, or modify the source documents. If a destination resolves outside the worktree, including through
an escaping symlink, stop. Before replacing an existing destination, prove its clean base state and bytes match the
base version; then replace with the approved version. For unexpected changes, do not overwrite; stop.
For identical content, verify approved bytes before reuse. After transfer verify bytes match the approved version.
The canonical record includes each document approval/version/evidence, source and target absolute paths and the common
relative path plus content verification. Changed content or approval scope requires approval of the revised version.
Transfer no other files. Failure or partial transfer blocks all dependent staging, commit and Coder handoff.

### Current checkout

Only after the user explicitly selects the current checkout for this handoff, or valid reuse is verified, confirm the absolute workspace,
current branch or detached HEAD, HEAD, and existing changes with their preservation and edit ownership. Record this
state and the choice evidence in the brief. Missing choice, unconfirmed state, or unclear ownership blocks handoff.

### Planning document commit

Begin only after all applicable specs/plans are written, individually approved, and the document set is complete.
On the new task branch path, verify the successful switch, actual branch, unchanged checkout path, and preserved
changes first. On the current checkout path, verify the selected branch or detached HEAD, path, and existing changes.
On the new worktree path, verify the created worktree and document transfer before any target docs commit.
At the target, commit only remaining approved documents once; do not automatically make a source document commit.
Record the selected base SHA and post-commit HEAD.
CEO verifies each approved spec/plan already committed for this task by SHA, actual message, included paths, and
content matching the approved version and validity in the selected checkout; reuse valid commits without recommitting them.

For approved documents still uncommitted, CEO records the approved versions and paths, finalizes the specific Korean
Conventional Commit message before the first commit, and stages only those documents for one focused docs commit
before handoff. Batch all remaining uncommitted approved documents together in that single commit, including all specs
and plans when none are committed. If only some remain, verify/reuse existing commits and commit the remainder once.
If all are validly committed, verify only; do not create duplicate or empty commits. Do not amend, reset, or recommit
past commits merely to combine them into one SHA. Verify both staged paths and staged diff match exactly the approved documents. If unrelated staged
files exist, preserve them and stop; do not automatically unstage, reset, stash, clean, or discard them. Never include
implementation files. Do not first commit a generic temporary message and routinely use `git commit --amend` to
repair it. A separately needed amend requires rechecking its approval scope, current HEAD, and publication state.

If the docs commit fails or staged content differs, stop handoff and inspect actual branch, HEAD, index, and partial
completion. Resolve the issue before resuming; do not commit implementation instead. After success verify SHA, actual
message, included paths/content, post-commit HEAD, final branch, and staged/unstaged/untracked state in the brief.
A successful command exit alone does not prove preparation complete. This commit is not implementation acceptance
or push approval; do not push without a separate explicit user request.

Skip this commit only when no planning documents were required and none were produced under the design/plan depth
rules; record that fact and the applicable depth rationale. Uncommitted documents cannot be treated as absent.
This does not require new documents or bypass checkout choice or any other handoff-gate condition.

### Recovery prerequisite

On branch collisions, Git preparation failures, partial completion, or metadata write denial, read
[git-recovery.md](git-recovery.md) before dependent recovery. Its stop and preservation rules are mandatory.

### Handoff evidence

For the worktree path the canonical record maps source and target absolute paths, Git common directory, base SHA,
selected branch/path, registration and preservation checks, and document transfer evidence. Give all six roles the
selected absolute worktree path: Coder, QA, Planner, Reviewer, Scout, Secretary. On the same approved worktree,
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
Record applicable approvals and the initial explicit execution-target choice or verified reuse for each first start or restart. Give all six
roles the same actual workspace, selected execution checkout, preparation evidence, and absolute artifact paths. Coder and QA work only in the supplied workspace; Planner, Reviewer, Scout, and Secretary use
that same workspace. Every role reports missing, inaccessible, or conflicting paths and unexpected branch state to
CEO before dependent work. Roles do not independently create or switch workspaces or branches.

### Choice lifetime and restart record

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
