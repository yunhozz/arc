# Prepare the current checkout

Claude v1 supports the current checkout only; Harness-managed worktree execution is unsupported. Do not invoke Codex app worktree tools or shell worktree creation as a fallback. Report unsupported requests before dependent work.

Before each preparation Git mutation, confirm the approved document set, absolute repository/workspace, branch or detached HEAD, HEAD commit, index, worktree/untracked files, and ownership. Present this state and obtain an explicit user choice to reuse the current branch or create a task branch. Before creating a branch, present its exact candidate name and base. Planning approval or silence does not select a branch. Preserve all unrelated changes; if they block preparation, stop and report rather than stashing, resetting or cleaning.

Batch-commit all remaining approved planning documents together in one focused docs commit before the first Coder handoff. Stage only those document paths and verify the staged content and scope. Verify the resulting SHA, subject, paths, branch, HEAD and remaining state. Already committed approved documents need no duplicate commit. Record actual preparation order and any deviation honestly, then complete the handoff gate before the next Coder start. User authorization persists for the unchanged approved target and scope; do not repeatedly ask for the same choice.
