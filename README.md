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

Choose `Install / Update` to select Codex, Claude Code, or both, set the preset, limits, language, and global settings, then select `Execute` and press Enter. `Change Preset` edits a draft; select the focused `Apply` row and press Enter to apply it. The blank line above either action is not selectable. These actions run after validation without a review screen.

`Check Version` shows the current and latest CLI versions. A selectable `Version Upgrade` appears only when a newer version is available. Enter applies that displayed version while preserving installed settings. Global upgrades replace the CLI and end the session; npx upgrades use the displayed payload without replacing the global CLI. Use `Install / Update` to reconfigure or refresh the same version.

`Uninstall` retains target/global-instruction selection and review with `Edit` and `Cancel`. After every selected harness is removed successfully, it removes the verified global CLI, including from an npx session. Harness failures or interruptions skip CLI removal. Results distinguish partial harness removal and CLI failure. Unselected harnesses, user files, other npm packages, and shared npx cache remain. `npm uninstall -g @yunhozz/arc` removes only the CLI.

The TUI requires a terminal with input and output. Its only commands are `arc`, `arc --help`, and `arc --version`; help and version also work without a TTY.

## Models and language

The Orchestrator uses the current conversation model. Specialist roles use the selected preset in [Codex](codex/skill/models.toml) or [Claude Code](claude/skill/models.toml). The TUI is in English; the selected response language applies to agents in new sessions.

## Guides

[Harness operation](docs/harness-operation.md) · [Codex guide](codex/skill/SKILL.md) · [Claude Code guide](claude/skill/SKILL.md)
