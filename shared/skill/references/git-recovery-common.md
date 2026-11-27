# Preserve state after failure — shared text

This file holds text shared by every platform's git-recovery.md. Each part belongs to the section that links to it and has the same force there.

<a id="branch-collision-and-invalid-names"></a>
## Branch collisions and invalid names

Invalid names, creation/switch failures, lookup errors or unexpected branches require recorded errors/state and stopped handoff. Branch creation without switching is partial completion; report it without automatic deletion or success claims. No branch/checkout fallback. New collision suffixes need approval. Preserve staged/unstaged/untracked changes; blocked switching or unclear ownership waits for Orchestrator.

<a id="handoff-record-write-denial"></a>
## Handoff record write denial

In a worktree session, use the ARC runtime command `node <runtime>/cli.mjs handoff-record write --cwd <abs> --slug <slug> --input -` instead of a file tool. Set `<runtime>` to the installed ARC skill runtime directory and send a JSON object with a nonempty `content` string containing the full Markdown record on stdin. Use the existing inline fallback if the command fails.

Failed profile reapplication MUST restore replaced bytes/modes. If rollback fails, preserve recovery files/paths; NEVER claim clean state or remove recovery material.
