# Planner runtime integration scope

ARC does not install, update, or remove Codex or Claude native observer hooks or the Claude Bash Git guard. Role profiles do not generate ARC-managed hooks, and ARC provides no hook-only stdin entry points or observation-recording API.

The general `runCodexGate` and `runClaudeGate` APIs, Git command classification, and cooperative workflow, Planner ledger, assignment, and approval verification remain available. These APIs evaluate calls using trusted context supplied by the caller; they do not automatically connect to Codex or Claude hosts or forcibly block tool execution. Role Git restrictions and approval and review contracts still apply.

## Existing native settings

When processing general concurrency and wait settings, the installer preserves existing hook data as user settings. The uninstall plan neither inspects nor modifies native hook settings. ARC provides no cleanup or migration for the actual `~/.codex/config.toml`, Claude native settings, Codex `hooks.state`, or existing `.git/arc/planner-observations` data.

Existing hook commands may therefore remain in settings. After an update or uninstall, a command becomes a stale reference if its dedicated target file is gone; existing hooks may continue to run while older files remain. Removing source files does not establish that existing user settings have been cleaned up or current host callbacks have been verified.

## Runtime hashes and evidence

Policy bytes and the removal of hook-only functions change `policyHash` and `runtimeHash`. Cooperative workflows storing earlier hashes may hold at the existing `cooperative.versions` check. ARC does not automatically rewrite stored versions or Planner ledgers or reset workflows.

General adapter and cooperative checks verify shared contracts using synthetic trusted context and temporary workflows. Distribution payload checks verify that hook-only assets are absent and the shared runtime remains present. These results do not prove that an actual host stopped a tool call. `plannerHookContextStatus` and capability diagnostics describe the context shared API consumers must supply and the limits of verification.
