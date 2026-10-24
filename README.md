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

Choose `Configure` to select Codex, Claude Code, or both, then set the model preset, agent limits, response language, and global settings. Review the planned changes before applying them. `Update` preserves installation settings. `Uninstall` removes the selected ARC harness and managed profiles but keeps the CLI; `npm uninstall -g @yunhozz/arc` removes only the CLI.

The TUI requires a terminal with input and output. Its only commands are `arc`, `arc --help`, and `arc --version`; help and version also work without a TTY.

## Models and language

The Orchestrator uses the current conversation model. Specialist roles use the selected preset in [Codex](codex/skill/models.toml) or [Claude Code](claude/skill/models.toml). The TUI is in English; the selected response language applies to agents in new sessions.

## Guides

[Harness operation](docs/harness-operation.md) · [Codex guide](codex/skill/SKILL.md) · [Claude Code guide](claude/skill/SKILL.md)
