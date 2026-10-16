# Git recovery contract

Read on branch collision, Git preparation failure, partial completion, or metadata write denial.
Use [handoff-prep.md](handoff-prep.md) for approved branch selection, [handoff-worktree.md](handoff-worktree.md) for the managed worktree path, and [handoff.md](handoff.md) for the complete restart gate.

### Git metadata write denial

If authorized staging, committing, branch creation, or switching is denied while writing `.git/index.lock` or other
Git metadata, CEO blocks handoff and safely inspects the exact command, workspace, error, failed path, actual Git
directory, branch, HEAD, index state, and partial completion. Read-only inspection includes lock existence and any
observable related processes, sandbox restrictions, OS permissions/ACLs, and concurrent Git activity. Record supported
causes and remaining uncertainty; denial of lock creation alone does not prove a stale lock.

Apply the Preservation rule: do not delete lock files, use `chmod` or `chown`, bypass the sandbox, or move to another
workspace. If
evidence confirms sandbox denial of an already authorized operation, request through the permission system only (not
a sandbox bypass) the tool-supported minimum escalation for only the exact single Git command and workspace, never
broad Git access. Before retrying,
recheck branch, HEAD, index, and partial completion; do not repeat work already completed. After success verify the
commit or branch result and final state, then reevaluate the entire handoff gate. Denied escalation or unresolved OS
permission/ACL problems keep handoff blocked; report the reason and actual state to CEO/user. Choosing the final
message in advance prevents unnecessary amend but does not repair required Git write access; only successful
authorized writes and verified results establish recovery.

### Existing changes and failures

A branch does not isolate uncommitted changes into a separate directory as a worktree does. Record how existing staged,
unstaged, and untracked changes relate to the task and their preservation and edit ownership in the brief. Apply the
Preservation rule and do not automatically commit or delete changes to prepare the checkout. Only the
approved docs commit on all three paths is an exception to that no-commit rule; preserve all unrelated dirty files.
If existing changes prevent switching or ownership is unclear, stop handoff until CEO resolves the state and scope.

For an invalid name, branch creation or switching failure, lookup error, or unexpected current branch, inspect and
record the error and actual Git state, then stop Coder handoff. A branch created without a successful switch is partial
completion: report it, do not automatically delete it, and do not treat preparation as complete. Do not automatically
fall back to the current checkout path after an operational failure. Both operational failure and missing
execution-target choice block handoff. CEO resolves the problem and rechecks preparation before handoff.


### Worktree failures and partial completion

Worktree creation, registration, attachment, identity/base verification, checkout, document transfer, staging, or commit failure means stop dependent work
and Coder handoff. Partial completion includes branch-only creation, partial path creation, registration/actual-path
mismatch, wrong base or branch, and partial document transfer. Record source and target exact command, error,
branch, HEAD, Git common directory, registration, index and files, including target dirty state and source preservation.
Before any authorized retry, inspect actual state and completed work under the Stop and inspect rule; do not repeat
completed actions.
Do not automatically fallback, retry another path/branch, delete paths, prune registrations with `git worktree prune`,
or use `--force` or `-B`; apply the Preservation rule.
Normal worktree preparation after explicit third-path selection is permitted under handoff; moving to an arbitrary
workspace during recovery remains prohibited. Resolve preparation and revalidate the full gate; a new explicit choice
follows Choice lifetime and restart record in handoff.md. No automatic cleanup/archive is authorized.

For managed worktree failures record tool inputs, operationId, result/error, returned actual path, app-managed
registration and current-chat attachment, initial/final branch, base/ref SHA, source/target HEAD/index/files and ownership.
The completion, attach-retry and no-fallback limits of New managed worktree in handoff-worktree.md apply; after an
attach retry check completion and current-chat attachment again; if it still fails or results cannot be verified, stop
and report actual state. Never treat a directory as proof of app management.
