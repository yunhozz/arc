# Preserve state after failure

Read on branch collision, Git preparation failure, partial completion, or Git metadata write denial.

On an actual failed Git/tool command, partial completion, unexpected branch/HEAD, missing assigned path, or conflicting edit, stop dependent work. Inspect and record the actual absolute path, branch or detached HEAD, HEAD, index, worktree/untracked files, ownership, and completed steps. Report the precise blocker and needed resolution to Orchestrator. Do not retry, fall back, or repeat completed mutations automatically.

Never automatically stash, reset, clean, unstage, discard, amend, delete branches/worktrees, remove locks, change permissions to bypass a blocker, or bypass sandbox restrictions. Preserve all unrelated work and recovery artifacts. Orchestrator obtains any needed human decision, resolves preparation within authorization, then revalidates affected gates and issues a precise delta restart brief. An explicit user selection is required where a choice is needed; silence, planning approval and refusal of another option do not count.

A profile reapplication failure should restore all previously replaced profile bytes and modes. If rollback itself fails, preserve recovery files and report their paths; do not claim a clean state or remove manual recovery material.

## Branch collision and invalid names

For an invalid name, branch creation/switch failure, lookup error, or unexpected current branch, inspect and record the error and actual Git state, then stop Coder handoff. A branch created without a successful switch is partial completion: report it, never delete it automatically, and do not treat preparation as complete. Do not fall back to another branch or checkout. A new collision suffix requires fresh user approval of the candidate (handoff-prep). Existing staged/unstaged/untracked changes stay preserved; if they block a switch or ownership is unclear, stop until Orchestrator resolves it.

## Git metadata write denial

If authorized staging, commit, branch creation, or switch is denied writing `.git/index.lock` or other Git metadata, block handoff and inspect read-only the exact command, workspace, error, failed path, Git directory, branch, HEAD, index, partial completion, lock existence, related processes, and OS permissions/ACLs, sandbox restrictions, and concurrent Git activity (Orchestrator performs read-only inspection of related processes and ACLs itself or assigns it to QA; Scouter, Planner, and Reviewer cannot run commands); record supported causes and remaining uncertainty. Lock-creation denial alone does not prove a stale lock. Do not delete locks, change permissions/ownership, bypass the sandbox, or move workspaces. If the denial is a permission-system prompt for an already authorized operation, request only the permission system's approval for that exact single Git command and workspace, never broad Git access. Before retrying recheck branch, HEAD, index, and partial completion; do not repeat completed work. After success verify the result and revalidate the whole handoff gate. Denied approval keeps handoff blocked; report the actual state.

## Handoff record write denial

If writing the canonical handoff record is denied or unavailable, stop that write, report the path and error to Orchestrator, and do not change permissions or bypass the sandbox. Use the inline-record fallback in handoff.
