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

In `Claude & Codex` under `Install / Update` and `Change Preset`, choose `Economy`, `Balanced`, `Smart`, or `Custom`. The built-in presets update each role using its assigned platform's settings. `Custom` opens an editor whose Apply updates the draft; the outer Apply saves the composite settings. New configurations start with `Balanced`, assigning Planner and Reviewer to Claude and the other roles to Codex; individual roles can also be edited. `Use default role mapping` restores the default platforms while retaining Custom values for roles whose platform stays the same. Changed platforms use the last selected built-in preset, or `Balanced` if none was selected.

Model and effort choices come from the packaged Codex and Claude catalogs, without a model-list API call or a separate API key. They are static candidates and do not establish that an account, CLI version, or provider can use a selection. A saved model and effort absent from the catalog remains visible and must be reselected before applying new settings. Login checks continue to use each local CLI's status command.

The composite configuration separates saving and activation from role execution support. Every role remains `held / unverified` because trusted execution identity, permission enforcement, and observation of the actual model and effort have not been established. Do not infer execution support for CLI sessions or local Codex Desktop and Claude Desktop Code sessions. Applying a new profile requires a new session on that host and separate execution evidence.

## Guides

[Harness operation](docs/harness-operation.md) · [Codex guide](codex/skill/SKILL.md) · [Claude Code guide](claude/skill/SKILL.md)
