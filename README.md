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

- **Install or update:** Choose Codex, Claude Code, or both in `Install / Update`, edit each role, then select `Apply`. `Settings` configures language, subagent limits, and global configuration for installation. `Change Models` edits role models and efforts.
- **Version:** `Check Version` shows `<current> → <latest>` with `Upgrade` when an upgrade is available, `Up to date (<current>)` for the current version, or current/latest details and any lookup error otherwise. `Upgrade` preserves settings; global upgrades exit ARC, while npx upgrades leave the global CLI unchanged.
- **Uninstall:** Choose `Codex`, `Claude`, or `Everything (incl. CLI)`, then confirm with `Remove` (the default is `Back`). `Back` returns to Uninstall; Esc returns home. Everything removes both harnesses and the global CLI only if harness removal succeeds. Unselected harnesses and user files remain. To remove only the CLI, run `npm uninstall -g @yunhozz/arc`.

The TUI requires terminal input and output. Public commands: `arc`, `arc watch`, `arc --help`, `arc --version`; help, version and `arc watch` also work without a TTY.

## Watch sessions

![arc watch flow](docs/images/watch-flow.svg)

`arc watch` streams Claude Code and Codex activity read-only. Default scope: every worktree of the current Git repository, or the current directory outside Git.

- **Shown:** user and agent messages in full; other events on one line.
- **Hidden:** tool and command outputs. Common secret patterns are masked, but masking is not complete.
- **Excluded:** Codex Desktop sessions. Bridge roles on Codex hosts stay held as `host_sandbox_blocked` until they run.

Run `arc watch --help` for scope, platform, history and JSON options; press Ctrl-C to stop.

## Models and language

The Orchestrator uses the current conversation model. Specialist roles use the active role settings in [Codex](codex/skill/models.toml) or [Claude Code](claude/skill/models.toml). The TUI is in English; the selected response language applies to agents in new sessions.

In `Claude & Codex` under `Install / Update` and `Change Models`, the role editor opens immediately. Each role can use either platform and any model/effort pair in that platform's static catalog. New configurations assign Planner and Reviewer to Claude and the other roles to Codex, using installed active values or package defaults. All five roles may use the same platform. `Apply` publishes the configuration directly. Installation offers shared `Settings` for both platforms; `Global config` defaults to On.

Model and effort choices come from the packaged Codex and Claude catalogs, without a model-list API call or a separate API key. They are static candidates and do not establish that an account, CLI version, or provider can use a selection. A saved model and effort absent from the catalog remains visible and must be reselected before applying new settings. Codex authentication is checked by refreshing the login token through `codex app-server`; this needs network access and rotates the tokens in `CODEX_HOME/auth.json`. Claude authentication checks continue to use `claude auth status`.

The composite configuration separates saving and activation from role execution. Role execution support is reported per role and environment by `routing-status`: `claude-cli` hosts support native routes and Codex bridges, `codex-cli` hosts support native routes while every bridge is held as `host_sandbox_blocked` (G2; Claude bridge Implementer and QA on a Codex host are additionally held as `permission_scope_unverified` by G1), and on Codex Desktop and Claude Desktop Code sessions every role (native and bridge) is held as `environment_unverified` in this release (the manual checklist in `docs/harness-operation.md` is a list of manual checks for a future ARC update, not a way to release the hold). Applying a new profile requires a new session on that host, and the `cooperative-8` runtime requires running Install / Update again.

Composite mode removes owned standalone `arc-*` profiles from both homes and keeps per-role `arc-routing-*` profiles. Selecting Codex or Claude shows a switch confirmation; after `Continue`, choosing `Apply` turns off composite mode, restores standalone profiles for installed platforms, and performs the selected operation.

## Guides

[Harness operation](docs/harness-operation.md) · [Codex guide](codex/skill/SKILL.md) · [Claude Code guide](claude/skill/SKILL.md)
