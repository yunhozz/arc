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

The TUI requires terminal input and output. It supports only `arc`, `arc --help`, and `arc --version`. Help and version also work without a TTY.

## Models and language

The Orchestrator uses the current conversation model. Specialist roles use the selected preset in [Codex](codex/skill/models.toml) or [Claude Code](claude/skill/models.toml). The TUI is in English; the selected response language applies to agents in new sessions.

## Guides

[Harness operation](docs/harness-operation.md) · [Codex guide](codex/skill/SKILL.md) · [Claude Code guide](claude/skill/SKILL.md)
