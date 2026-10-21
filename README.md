# 🤖 ARC — Agent Role Coordination

ARC brings clear roles, scoped handoffs, and verification to work in Codex and Claude Code.

![ARC workflow](docs/images/role-flow.svg)

## 👥 Roles

| Role | Responsibility |
|---|---|
| Orchestrator | Routes work and accepts results |
| Scouter | Researches and explores sources |
| Planner | Drafts designs, specs, and plans |
| Coder | Implements assigned changes |
| QA | Runs assigned verification |
| Reviewer | Independently reviews changes |

## 🚀 Quick start

**Requirements:** Node.js 22+, npm, Git, and network access. Supported platforms are macOS 13+ and Linux with glibc 2.28+ (arm64 or x64). Windows and musl Linux are not supported. Python, a compiler, and `node-gyp` are not required.

Run the interactive installer:

```sh
npx --yes @yunhozz/arc
```

Choose a target, model preset, agent limits, and output language. For a non-interactive install, provide the target, preset, and language:

```sh
npx --yes @yunhozz/arc --target codex --preset balanced --language en
```

## ⚙️ Common options

| Option | Purpose |
|---|---|
| `--target <claude\|codex\|all>` | Choose where to install |
| `--preset <economy\|balanced\|smart>` | Choose specialist model settings |
| `--language <en\|ko>` | Set the default output language |
| `--max-total-subagents <count>` | Set the session-wide agent limit (default: 100) |
| `--max-concurrent-subagents <count>` | Set the simultaneous agent limit (default: 5) |
| `--check` | Validate without writing changes |
| `--dry-run` | Preview changes without applying them |
| `--skip-global` | Skip global instructions, native settings, and shell configuration |

## 🔁 Manage ARC

Change the preset or remove an installation without a global CLI:

```sh
npx --yes @yunhozz/arc preset smart --target codex
npx --yes @yunhozz/arc uninstall --target codex
```

## 🧰 Optional: use the global CLI

If you run ARC management commands regularly, you can install the CLI globally and keep using the `arc` command:

```sh
npm i -g @yunhozz/arc
arc
```

The first command installs the CLI. Run `arc` to install the ARC harness. Afterward, use `arc preset` or `arc uninstall` to manage it. `arc uninstall` removes the harness; `npm uninstall -g @yunhozz/arc` removes the CLI and leaves the harness installed.

## 🎛️ Models and language

The Orchestrator uses the current conversation's model. The five specialist roles use the selected preset from their platform model file: [Codex](codex/skill/models.toml) · [Claude Code](claude/skill/models.toml). The configured language applies across ARC; an explicit user language request takes precedence.

## 📚 Guides

[How the ARC harness operates](docs/harness-operation.md) · [Codex guide](codex/skill/SKILL.md) · [Claude Code guide](claude/skill/SKILL.md)
