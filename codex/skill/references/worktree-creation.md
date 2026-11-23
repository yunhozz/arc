<a id="codex-managed-worktree-creation"></a>
# Codex managed worktree creation

Use this procedure only under the [managed-worktree handoff contract](handoff-worktree.md) after explicit new-managed-worktree selection. The app chooses the actual path; DO NOT propose siblings or require user-specified paths.

In a worktree session, use the ARC runtime command `node <runtime>/cli.mjs handoff-record write --cwd <abs> --slug <slug> --input -` instead of a file tool. Set `<runtime>` to the installed ARC skill runtime directory and send a JSON object with a nonempty `content` string containing the full Markdown record on stdin. Use the existing inline fallback if the command fails.

Use only the app tool:

    mcp__codex_app__create_worktree({
      allowAsync: true,
      name: "<approved-descriptive-name>",
      ref: "<verified-source-head-full-sha>"
    })

The descriptive name does not guarantee a path or branch. There are no destination-path/branch arguments. Pass full SHA `ref` explicitly; NEVER omit or rely on remote defaults. For `operationId`, use `mcp__codex_app__get_worktree_creation_status` until completed. Preparing/creating/registering is not success.

Only registration failure permits reattachment of the returned workspace with `mcp__codex_app__attach_worktree`. Missing tools, failed reattachment or mismatched results stop with actual-state reporting. No raw Git worktree fallback, alternate name/ref/path/branch retries or automatic cleanup/deletion/prune/archive.

Platform attachment evidence for Codex means app-artifact management/current-chat attachment of the returned absolute path. Verify that evidence in the creation checks required by handoff-worktree. The tool copies no uncommitted changes.

For failure evidence, include tool inputs/operationId/results/returned path and app management/current-chat attachment. Preserve completion/attach-retry/no-fallback limits. Recheck completion/current-chat attachment after attach retry; failure or unverifiable results stop with actual-state reporting. Directory existence does not prove app management.
