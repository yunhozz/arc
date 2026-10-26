<a id="git-recovery-contract"></a>
# Git recovery contract

Read on branch collision, Git preparation failure/partial completion, metadata or handoff-record write denial. Use [handoff-prep](handoff-prep.md) for branch selection and [handoff](handoff.md) for full restart gates.

On actual Git/tool failure, partial completion, unexpected branch/HEAD, missing path or conflicting edit, stop dependent work. Record absolute path, branch or detached HEAD, HEAD, index, working-tree/untracked files, ownership and completed steps. Return the precise blocker/resolution to Orchestrator. Never automatically retry, fall back or repeat completed mutations.

Apply Preservation rule: preserve unrelated work/recovery artifacts. No automatic stash/reset/clean/unstage/discard/amend, branch/worktree deletion, lock removal, permission changes or sandbox bypass. Orchestrator obtains needed human decisions, resolves within authority, revalidates gates and supplies a delta restart brief. Explicit choice is required where applicable; silence, planning approval and refusal of another option do not count.

<a id="branch-collision-and-invalid-names"></a>
## Branch collisions and invalid names

Invalid names, creation/switch failures, lookup errors or unexpected branches require recorded errors/state and stopped handoff. Branch creation without switching is partial completion; report it without automatic deletion or success claims. No branch/checkout fallback. New collision suffixes need approval. Preserve staged/unstaged/untracked changes; blocked switching or unclear ownership waits for Orchestrator.

<a id="git-metadata-write-denial"></a>
## Git metadata write denial

1. Denial of authorized stage/commit/branch creation/switch at `.git/index.lock` or other metadata blocks handoff.
2. Inspect exact command/workspace/error/failed path, actual Git directory/branch/HEAD/index/partial completion read-only. Inspect lock existence, observable processes, sandbox limits, OS permissions/ACLs and concurrent Git activity. Record supported causes/uncertainty. Lock-creation denial alone proves no stale lock.
3. Do not remove locks, `chmod`/`chown`, bypass sandbox or move workspaces. Only when evidence confirms that the sandbox denied an already authorized operation, request through the permission system only the supported minimum escalation for that exact single Git command and workspace, never broad Git access.
4. Before authorized retry, recheck branch/HEAD/index/partial completion without repeating completed work. After success verify operation/final state and the entire handoff gate.
5. Denied approval or unresolved OS/ACL issues keep handoff blocked; report actual state/cause. A finalized message avoids unnecessary amend but cannot repair write access. Only authorized successful writes plus verified results prove recovery.

<a id="handoff-record-write-denial"></a>
## Handoff record write denial

If canonical-record writing is denied/unavailable, stop it and report path/error. Never change permissions or bypass sandbox. Use [handoff](handoff.md)'s inline fallback.

<a id="recovery-cases"></a>
## Recovery cases

<a id="existing-changes-and-failures"></a>
### Existing changes and failures

A branch does not isolate uncommitted changes in another directory. Record task relationship/preservation/ownership in the brief. Never automatically commit/delete changes to prepare. Approved docs commits on the three paths are the sole exception; preserve unrelated dirty files. Switching blocks or unclear ownership hold handoff until resolution. Both operational failure and missing target choice block handoff.

<a id="worktree-failures-and-partial-completion"></a>
### Worktree failures and partial completion

[Managed-worktree](handoff-worktree.md) creation/registration/attachment/identity/base/checkout/transfer/stage/commit failures stop dependent work/handoff. Branch-only or partial-path creation, registration/path mismatch, wrong base/branch and partial transfer count as partial completion.

Record source/target commands/errors/branch/HEAD/common directory/registration/index/files, target dirty state and source preservation. Include tool inputs/operationId/results/returned path, app management/current-chat attachment, initial/final branch, base/ref SHA and ownership. Inspect actual state/completed work before authorized retry.

No automatic alternate path/branch, deletion, `git worktree prune`, `--force`/`-B`, cleanup or archive. Normal preparation after explicit managed selection is allowed; arbitrary recovery workspace moves are not. Resolve and revalidate the full gate; renewed choice follows handoff lifetime rules. Preserve completion/attach-retry/no-fallback limits. Recheck completion/current-chat attachment after attach retry; failure or unverifiable results stop with actual-state reporting. Directory existence does not prove app management.
