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

- **Install or update:** Open `Install / Update`, choose Codex, Claude Code, or both, then set the preset, limits, language, and global settings. Select `Execute` and press Enter. To change only the preset, use `Change Preset`, select `Apply`, and press Enter. Blank lines are not selectable. ARC validates and executes these actions without a review screen.
- **Check version:** `Check Version` shows the current and latest CLI versions. `Version Upgrade` appears only when a newer version is available. Enter applies that version and preserves installed settings. A global upgrade replaces the CLI and ends the session; an npx upgrade uses the displayed payload without replacing the global CLI. Use `Install / Update` to reconfigure the same version.
- **Uninstall:** Choose the harness targets and global instructions, then review with `Edit` or `Cancel`. ARC removes the verified global CLI only after all selected harnesses are removed successfully, including in an npx session. A harness failure or interruption skips CLI removal. Results report partial removals and CLI failures. Unselected harnesses, user files, other npm packages, and the shared npx cache remain. To remove only the CLI, run `npm uninstall -g @yunhozz/arc`.

The TUI requires terminal input and output. It supports only `arc`, `arc --help`, and `arc --version`. Help and version also work without a TTY.

## Models and language

The Orchestrator uses the current conversation model. Specialist roles use the selected preset in [Codex](codex/skill/models.toml) or [Claude Code](claude/skill/models.toml). The TUI is in English; the selected response language applies to agents in new sessions.

## Guides

[Harness operation](docs/harness-operation.md) · [Codex guide](codex/skill/SKILL.md) · [Claude Code guide](claude/skill/SKILL.md)
