# ARC (Agent Role Coordination)

ARC coordinates research, design, implementation, and verification in Codex and Claude Code. The Orchestrator assigns work and accepts the result.

![Task flow diagram](docs/images/role-flow.svg)

## 👥 Roles and workflow

| Role | Responsibility |
|---|---|
| Orchestrator | Assigns work, obtains approvals, integrates, accepts, and commits |
| Scouter | Research and static exploration; no edits |
| Planner | Design, spec, and plan drafts; no repository edits |
| Coder | Implementation, configuration, and tests in assigned files |
| QA | Independent checks against acceptance criteria; no edits |
| Reviewer | Final independent review of significant changes; no edits |

All roles report directly to the Orchestrator; subagents never delegate. At most four subagents run concurrently. Each top-level task starts a fresh Coder and, when needed, fresh QA. Simple questions stay with the Orchestrator.

### 🧭 Design and approval

The Planner authors design, spec, plan, and brainstorming drafts. The Orchestrator obtains user approval before implementation.

| Path | Use for | Approval sequence |
|---|---|---|
| Spike | Feasibility questions | Question and method → findings → reassess implementation |
| Bounded | Clear, limited scope | Short design → plan if needed → implementation |
| Architectural | Structural or contract changes | Design → spec → plan → implementation |

A Bounded change can omit the plan only for one local change with no dependent stages, shared state, or integration-order concerns and one verification path. Approved planning documents are committed together before implementation; the user explicitly chooses the execution checkout or branch.

### 🔍 Verification by risk

| Risk | Verification |
|---|---|
| Small, low risk: narrow, understood, reversible, focused checks suffice | Coder or approved Orchestrator direct edit → Orchestrator checks |
| Ordinary behavior change | Coder → fresh QA |
| Significant: shared contracts/state, lifecycle, security, data loss, public interfaces, costly installation/deployment | Coder → fresh QA → final Reviewer |

Design depth and risk are independent. Unclear risk requires investigation or stronger verification. Feature and behavior edits follow TDD; only small, low-risk work needing no plan can qualify for an approved exception. With a plan, the Orchestrator accepts and commits each top-level task; the Reviewer checks the complete significant change once. Push, merge, and deployment need separate approval.

## 🚀 Install

| Requirement | Supported |
|---|---|
| Runtime | Node.js 22+ with npm (`npx`), Git, network access |
| macOS | 13+, arm64/x64 |
| Linux | glibc 2.28+, arm64/x64 |
| Unsupported | Windows, musl Linux |

Installation uses bundled native files; Python, a compiler, and `node-gyp` are unnecessary.

After the first npm publication, install the CLI globally and apply ARC:

```sh
npm i -g @yunhozz/arc
arc install
```

Use explicit choices for non-interactive installation:

```sh
arc install --target codex --preset balanced
arc install --target all --preset smart --check
arc install --target claude --preset economy --dry-run
```

Alternatively, install from GitHub or a repository checkout:

```sh
npx --yes github:yunhozz/arc install --target codex --preset balanced
./install.command --target claude --preset smart
```

| Option | Purpose |
|---|---|
| `--target` | Select `claude`, `codex`, or `all`; interactive default: Claude |
| `--preset` | Select `economy`, `balanced`, or `smart`; interactive default: Balanced |
| `--check` | Validate distributed files and install paths without changes |
| `--dry-run` | Preview changes without writing |
| `--skip-global` | Skip global instructions, Codex config, and `.zshrc` access for this invocation |
| `--help`, `--version` | Show usage or version |

Without choices, a terminal prompts for target and preset. Non-interactive runs require both. Check and dry-run use no network and do not verify external skill content; actual installation does.

### 📁 Installed files

| Target | Location and managed files |
|---|---|
| Codex | `~/.codex` (or `CODEX_HOME`): `skills/`, `agents/`, `AGENTS.md`, `config.toml` |
| Claude Code | `~/.claude`: `skills/`, `agents/`, `CLAUDE.md` |

Installation adds a managed `arc:begin`/`arc:end` instruction block, preserving surrounding content. Codex also sets `min_wait_timeout_ms = 120000` and `default_wait_timeout_ms = 300000` under `[features.multi_agent_v2]` when that entry is a standalone table; otherwise manual guidance is printed. Claude requires the default `~/.claude` configuration directory.

The installer fetches `brainstorming`, `writing-plans`, and `test-driven-development` from [obra/superpowers](https://github.com/obra/superpowers) using unpinned `skills@latest`. Reinstallation replaces managed files and local model edits, and may replace existing external skill copies. No persistent backup is created.

With `--target all`, targets install independently: Codex succeeds before Claude runs, and a later failure keeps the earlier success. Inspect per-target status and any `Residual path:` output before retrying only the failed target. Concurrent installation or removal against the same target is unsupported.

### 🗑️ Remove ARC

```sh
arc uninstall --target codex
arc uninstall --target all --dry-run
arc uninstall --target claude --skip-global
```

Without a target, `arc uninstall` prompts in a terminal; non-interactive removal requires `--target`. It removes the selected ARC skill, five role profiles, and managed instruction block, including edited ARC files. Shared external skills, other profiles, Codex wait settings, and shell completion registration remain. No persistent backup is created.

### ⌨️ Shell completion

Global npm installation registers completion for supported ordinary zsh users. Start a new interactive shell, or activate it now:

```zsh
eval "$(arc completion zsh)"
```

For permanent manual activation, add that command to your zsh startup file; for bash, use `eval "$(arc completion bash)"`. `arc completion zsh` and `arc completion bash` print the scripts.

Automatic registration may be skipped by shell, runtime, permissions, `ZDOTDIR`, or npm script policy. To see hook diagnostics, use `npm i -g --foreground-scripts @yunhozz/arc`. Completion failure does not fail npm installation. `--skip-global` does not undo earlier registration; uninstall retains the shared completion block.

## ⚙️ Model settings

The Orchestrator uses the current conversation's model. Other roles use `models.toml`: [Codex](codex/skill/models.toml) · [Claude Code](claude/skill/models.toml).

Both use `version = 1`, a root `preset`, and `roles.<role>.economy`, `.balanced`, and `.smart` variants. Installation retains all three variants and selects the requested preset. Codex entries use `model` and `model_reasoning_effort`; Claude entries use `model` and `effort`. All variants are validated, including inactive ones.

After editing the installed file, apply it with the optional Python 3.11+ tool:

```sh
python3 ~/.claude/skills/arc/scripts/apply-models.py
python3 ~/.codex/skills/arc/scripts/apply-models.py
```

Legacy schemas are rejected; reinstall or migrate to the linked schema. Reinstallation replaces local model edits.

## 🧑‍💻 Maintenance

Update `MANIFEST.sha256` when changing distributed files (`models.toml` is excluded). Install development dependencies with `npm ci --ignore-scripts`, then prepare the verified native test fixture for your host before running `npm test`.

| Check | Command |
|---|---|
| Node regression suite | `npm test` |
| Python tool, policy, and payload checks | `python3 -B -m unittest discover -s tests` |
| Installer parity | `node scripts/check-installer-parity.mjs --complete` |
| Manifest | `node scripts/update-manifest.mjs --check` |
| Real upstream integration | `node tests/node/live-upstream.mjs` |
| Optional Codex token report (not installed) | `python3 codex/tools/codex_token_usage.py --since YYYY-MM-DD` |

The regular Node suite uses a deterministic external-npx fixture. The real-upstream check needs network access; network failure leaves that result unverified.

### 📦 Publish to npm

The `npm-publish.yml` workflow publishes stable version changes pushed to `master` when repository variable `NPM_PUBLISH_ENABLED` is `true`. It skips published versions, rejects versions below `latest`, and stops on registry errors.

1. Publish once from the release checkout with npm permission for `@yunhozz`: `npm publish --access public`.
2. In npm package settings, configure GitHub Actions Trusted publishing: owner `yunhozz`, repository `arc`, workflow `npm-publish.yml`, empty environment. Allow direct `npm publish`.
3. Set repository Actions variable `NPM_PUBLISH_ENABLED=true`; no npm token secret is needed.
4. Bump the stable version in `package.json` and `package-lock.json`, refresh `MANIFEST.sha256`, and merge to `master`.

Complete the first trusted publication within two days of configuring the publisher, or configure it again. Later releases repeat step 4. The workflow uses OIDC and provenance; it does not create version bumps or publish prereleases. See [npm Trusted publishing](https://docs.npmjs.com/trusted-publishers/).

## 📚 Operating guides

| Environment | Guide | References |
|---|---|---|
| Codex | [Operating guide](codex/skill/SKILL.md) | [Planning](codex/skill/references/planning.md) · [Handoff](codex/skill/references/handoff.md) · [Verification](codex/skill/references/verification.md) |
| Claude Code | [Operating guide](claude/skill/SKILL.md) | [Planning](claude/skill/references/planning.md) · [Handoff](claude/skill/references/handoff.md) · [Verification](claude/skill/references/verification.md) |
