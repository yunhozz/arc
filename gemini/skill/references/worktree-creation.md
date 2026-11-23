<a id="gemini-managed-worktree-creation"></a>
# Gemini managed worktree creation

Follow the common [managed worktree contract](handoff-worktree.md) only after explicit user selection and verified preparation scope. Preserve the approved source/base, branch candidate, absent destination, unrelated changes and transfer evidence.

In a worktree session, use the ARC runtime command `node <runtime>/cli.mjs handoff-record write --cwd <abs> --slug <slug> --input -` instead of a file tool. Set `<runtime>` to the installed ARC skill runtime directory and send a JSON object with a nonempty `content` string containing the full Markdown record on stdin. Use the existing inline fallback if the command fails.

Gemini native attachment has not been verified. DO NOT substitute Claude EnterWorktree, invent an attachment call or treat Git registration as attachment evidence. Hold managed worktree creation until Orchestrator has an approved, verified attachment method. The current checkout remains available only after explicit target selection.

On failure or partial completion, stop dependent work, preserve actual state and return paths, branch/HEAD, registration, completed steps and required resolution. NEVER retry with a different name, remove a worktree, change permissions or bypass the sandbox.
