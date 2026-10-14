# Preserve state after failure

On an actual failed Git/tool command, partial completion, unexpected branch/HEAD, missing assigned path, or conflicting edit, stop dependent work. Inspect and record the actual absolute path, branch or detached HEAD, HEAD, index, worktree/untracked files, ownership, and completed steps. Report the precise blocker and needed resolution to CEO. Do not retry, fall back, or repeat completed mutations automatically.

Never automatically stash, reset, clean, unstage, discard, amend, delete branches/worktrees, remove locks, change permissions to bypass a blocker, or bypass sandbox restrictions. Preserve all unrelated work and recovery artifacts. CEO obtains any needed human decision, resolves preparation within authorization, then revalidates affected gates and issues a precise delta restart brief. An explicit user selection is required where a choice is needed; silence, planning approval and refusal of another option do not count.

A profile reapplication failure should restore all previously replaced profile bytes and modes. If rollback itself fails, preserve recovery files and report their paths; do not claim a clean state or remove manual recovery material.
