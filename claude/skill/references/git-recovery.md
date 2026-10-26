<a id="preserve-state-after-failure"></a>
# Preserve state after failure

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
3. Do not remove locks, `chmod`/`chown`, bypass sandbox or move workspaces. With evidence of permission-system denial of an already authorized operation, request only the supported minimum approval for that exact single command/workspace, never broad Git access.
4. Before authorized retry, recheck branch/HEAD/index/partial completion without repeating completed work. After success verify operation/final state and the entire handoff gate.
5. Denied approval or unresolved OS/ACL issues keep handoff blocked; report actual state/cause. A finalized message avoids unnecessary amend but cannot repair write access. Only authorized successful writes plus verified results prove recovery.

<a id="handoff-record-write-denial"></a>
## Handoff record write denial

If canonical-record writing is denied/unavailable, stop it and report path/error. Never change permissions or bypass sandbox. Use [handoff](handoff.md)'s inline fallback.

Orchestrator inspects related processes/ACLs read-only itself or assigns QA; Scouter/Planner/Reviewer cannot execute commands. Failed profile reapplication must restore replaced bytes/modes. If rollback fails, preserve recovery files/paths; never claim clean state or remove recovery material.
