# ARC — Agent Role Coordination

ARC coordinates work in Codex and Claude Code through scoped roles, clear handoffs, and verification.

![ARC workflow](docs/images/role-flow.svg)

## Roles

| Role | Responsibility |
|---|---|
| Orchestrator | Routes work and accepts results |
| Scouter | Researches sources and explores the repository |
| Planner | Drafts designs, specs, and plans |
| Implementer | Makes assigned changes |
| QA | Runs assigned verification |
| Reviewer | Independently reviews changes |

## Install

**Requirements:** Node.js 22+, npm, Git, and network access. Supported platforms: macOS 13+ and Linux with glibc 2.28+ (arm64 or x64). Windows and musl Linux are not supported. Python, a compiler, and `node-gyp` are not required.

```sh
npm install --global @yunhozz/arc
arc
```

Package installation provides the CLI, not the harness. Install or manage the harness in the interactive TUI. To open it without a global install, run `npx --yes @yunhozz/arc`.

## Manage ARC

- **Install or update:** Choose Codex, Claude Code, or both in `Install / Update`, configure options, then select `Execute`. `Change Preset` changes only the preset.
- **Version:** `Check Version` shows installed and latest CLI versions. `Version Upgrade` appears when available and preserves settings; global upgrades exit ARC, while npx upgrades leave the global CLI unchanged.
- **Uninstall:** Removes selected harnesses; the global CLI is removed only if all succeed. Unselected harnesses and user files remain. To remove only the CLI, run `npm uninstall -g @yunhozz/arc`.

The TUI requires terminal input and output. Public commands: `arc`, `arc watch`, `arc --help`, `arc --version`; help, version and `arc watch` also work without a TTY.

## Watch sessions

`arc watch` follows Claude Code and Codex activity in a read-only stream; by default it includes every worktree of the current Git repository, or the current directory outside Git.
Tool and command outputs are never shown; common secret patterns are masked, but masking is not complete.
Codex Desktop sessions are excluded. Bridge roles on Codex hosts remain held as `host_sandbox_blocked` and appear once they run.
Use `arc watch --help` for scope, platform, history and JSON options; press Ctrl-C to stop.

## Models and language

The Orchestrator uses the current conversation model. Specialist roles use the selected preset in [Codex](codex/skill/models.toml) or [Claude Code](claude/skill/models.toml). The TUI is in English; the selected response language applies to agents in new sessions.

In `Claude & Codex` under `Install / Update` and `Change Preset`, choose `Economy`, `Balanced`, `Smart`, or `Custom`. The built-in presets update each role using its assigned platform's settings. `Custom` opens an editor whose Apply updates the draft; the outer Apply saves the composite settings. New configurations start with `Balanced`, assigning Planner and Reviewer to Claude and the other roles to Codex; individual roles can also be edited. `Use default role mapping` restores the default platforms while retaining Custom values for roles whose platform stays the same. Changed platforms use the last selected built-in preset, or `Balanced` if none was selected.

Model and effort choices come from the packaged Codex and Claude catalogs, without a model-list API call or a separate API key. They are static candidates and do not establish that an account, CLI version, or provider can use a selection. A saved model and effort absent from the catalog remains visible and must be reselected before applying new settings. Codex authentication is checked by refreshing the login token through `codex app-server`; this needs network access and rotates the tokens in `CODEX_HOME/auth.json`. Claude authentication checks continue to use `claude auth status`.

The composite configuration separates saving and activation from role execution. Role execution support is reported per role and environment by `routing-status`: `claude-cli` hosts support native routes and Codex bridges, `codex-cli` hosts support native routes while every bridge is held as `host_sandbox_blocked` (G2; Claude bridge Implementer and QA on a Codex host are additionally held as `permission_scope_unverified` by G1), and on Codex Desktop and Claude Desktop Code sessions every role (native and bridge) is held as `environment_unverified` in this release (the manual checklist in `docs/harness-operation.md` is a list of manual checks for a future ARC update, not a way to release the hold). Applying a new profile requires a new session on that host, and the `cooperative-8` runtime requires running Install / Update again.

## Guides

[Harness operation](docs/harness-operation.md) · [Codex guide](codex/skill/SKILL.md) · [Claude Code guide](claude/skill/SKILL.md)
