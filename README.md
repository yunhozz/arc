# ARC (Agent Role Coordination)

ARC coordinates research, design, implementation, and verification in Codex and Claude Code.
The Orchestrator assigns work and accepts results.

![Task flow diagram](docs/images/role-flow.svg)

## 🚀 Install and manage ARC

Start interactive installation without a global CLI:

```sh
npx --yes github:yunhozz/arc
```

Choose target → preset → total limit → concurrent limit → output language with Up/Down and Enter.
For non-interactive installation, supply target, preset, and language:

```sh
npx --yes github:yunhozz/arc --target codex --preset balanced --language ko
```

The same package can manage an existing installation:

```sh
npx --yes github:yunhozz/arc preset smart --target codex
npx --yes github:yunhozz/arc uninstall --target codex
```

These npx commands do not install a global `arc` executable. To install the CLI globally:

```sh
npm i -g github:yunhozz/arc
arc
arc preset smart --target codex
arc uninstall --target codex
```

The npm command installs the CLI only. Run bare `arc` to install the harness and register zsh
completion. For the current shell, run `eval "$(arc completion zsh)"` after harness installation.

Bare `arc` starts installation; the `install` subcommand has been removed. A repository checkout
also supports `./install.command` with the same installation options.

### Requirements and options

| Requirement | Supported |
|---|---|
| Runtime | Node.js 22+ with npm (`npx`), Git, network access |
| macOS | 13+, arm64/x64 |
| Linux | glibc 2.28+, arm64/x64 |
| Unsupported | Windows, musl Linux |

Bundled native files handle installation; Python, a compiler, and `node-gyp` are unnecessary.

| Installation option | Purpose |
|---|---|
| `--target <claude\|codex\|all>` | Installation target; interactive default: Claude |
| `--preset <economy\|balanced\|smart>` | Role model preset; interactive default: Balanced |
| `--language <en\|ko>` | English or 한국어; the final question |
| `--max-total-subagents <count>` | Created subagents per session/tree; initial default: 100 |
| `--max-concurrent-subagents <count>` | Simultaneous subagents; initial default: 5 |
| `--check` | Validate payload and paths without writing |
| `--dry-run` | Preview writes without applying them |
| `--skip-global` | Skip global instructions, native configuration, and `.zshrc` access |
| `--help`, `--version` | Show usage or version without loading native files |

Check and dry-run validate included references locally, without network access or upstream freshness checks.
For example:

```sh
npx --yes github:yunhozz/arc --target all --preset smart --language en --check
./install.command --target claude --preset economy --language ko --dry-run
```

### Output language

Each target stores `en` or `ko` in `skills/arc/settings.toml`. The language applies to the Orchestrator
and all five roles, including progress, reports, and planning documents. An explicit user language request
overrides this default; the input language alone does not change it. Code, commands, paths, identifiers,
literals, quotations, and actual tool output retain their original form. Open a new session to load changed policies.

For `all`, one selection applies to both targets. A common existing language is preselected; otherwise English
is selected. `--skip-global` omits the global instruction block while retaining skill and role language policies.

### Installed files and refreshes

| Target | Location and managed files |
|---|---|
| Codex | `~/.codex` (or `CODEX_HOME`): `skills/`, `agents/`, `AGENTS.md`, `config.toml` |
| Claude Code | `~/.claude`: `skills/`, `agents/`, `CLAUDE.md`, `settings.json` |

The installer preserves content outside the managed `arc:begin`/`arc:end` instruction block.
For Codex, it sets `min_wait_timeout_ms = 120000` and `default_wait_timeout_ms = 300000` when
`[features.multi_agent_v2]` is a standalone table; otherwise it prints manual guidance.
Claude requires the default `~/.claude` configuration directory.

Every harness installation fetches fresh references per target from the
[obra/superpowers](https://github.com/obra/superpowers) default branch and publishes full
`brainstorming`, `writing-plans`, and `test-driven-development` trees under
`skills/arc/references/superpowers/`. Roles read this local Markdown and its companion files.
Existing global/shared copies and links remain untouched.

Git and network access are required for harness installation; collection never executes upstream
scripts or hooks. npm installation has no lifecycle hooks and does not fetch references or edit shell
configuration. Harness installation stages references without rewriting package files, so read-only
packages work. Collection or publication failure fails the target installation.

Bundled references retain their
[MIT license](https://github.com/obra/superpowers/blob/main/LICENSE), including Jesse Vincent's notice.
`provenance.json` records revision, timestamp, hashes, and relative links for local consistency checks;
it does not authenticate upstream or a malicious local rewrite.

Reinstallation replaces managed ARC files and local model edits, preserves ARC limits, and creates no
persistent backup. All selected target paths are checked before writing. Harness targets then install
independently in Codex → Claude order: a later failure retains earlier success. Inspect per-target status
and any `Residual path:` before recovery or retrying only the failed target. Concurrent installation,
preset changes, or removal against the same target are unsupported.

## ⚙️ Models and presets

The Orchestrator uses the current conversation's model. Other roles use `models.toml`:
[Codex](codex/skill/models.toml) · [Claude Code](claude/skill/models.toml).

Both schemas use `version = 1`, a root `preset`, and `roles.<role>.economy`, `.balanced`, and `.smart` variants.
Codex entries use `model` and `model_reasoning_effort`; Claude entries use `model` and `effort`.
Installation keeps all three variants and validates inactive ones too. Legacy schemas require migration
to the linked schema or reinstallation.

Switch presets without reinstalling or downloading references:

```sh
arc preset smart --target codex
arc preset balanced --target all --check
arc preset economy --target claude --dry-run
```

Use the npx form above if the CLI is not globally installed. In a terminal, omitted preset and target
are selected with arrow keys; non-interactive runs require both. Switching preserves custom model variants,
profile instructions, language, limits, and global settings. It also reapplies model fields that have drifted.
All targets are checked first, then each updates atomically in Codex → Claude order. A later failure keeps
earlier success; failed target writes are rolled back and any remaining recovery paths are reported.
Open a new session to load changed profiles.

After editing an installed model file, apply its active preset with `arc preset`, or use the optional
Python 3.11+ tool:

```sh
python3 ~/.claude/skills/arc/scripts/apply-models.py
python3 ~/.codex/skills/arc/scripts/apply-models.py
```

## Subagent limits

TTY installation asks for omitted limits even when target and preset are supplied. Enter preserves each
target's existing value or its initial default; typed values apply to every selected target.
Non-interactive installation preserves omitted limits. Both values must be positive safe ASCII decimal integers;
total and concurrent limits are independent.

The installer writes `skills/arc/limits.toml` and merges native concurrency into Codex
`[agents].max_concurrent_threads_per_session` as an integer and Claude
`settings.json.env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` as a string, preserving unrelated settings.
Native drift requires explicit concurrency selection through the flag or TTY confirmation.
Malformed configuration stops installation. Check and dry-run preview policy/native changes;
`--skip-global` writes only ARC policy and skips global instruction, native configuration, and shell access.

The cumulative limit counts all created descendants in an ARC session/tree, including completed agents.
Reusing an instance adds no creation; fresh replacements do. Reservations and the ledger are prompt-level
policy: ARC does not intercept spawn calls or enforce a hard cumulative runtime limit. Lower runtime capacity
still applies. Independent sessions, platforms, and accounts have separate budgets. New settings apply to
new sessions; configuration writes do not demonstrate runtime support in the current process.

## 🗑️ Remove ARC

```sh
arc uninstall --target codex
arc uninstall --target all --dry-run
arc uninstall --target claude --skip-global
```

Use the npx form above without a global CLI. A terminal prompts for an omitted target;
non-interactive removal requires `--target`. Removal deletes the selected ARC skill (including language
and limit settings), five role profiles, and managed instruction block, including edited ARC files.
It preserves external skills, other profiles, Codex wait settings, native concurrency keys, and shared
shell completion registration. No persistent backup is created.

Remove the global CLI separately:

```sh
npm uninstall -g @yunhozz/arc
```

npm package removal leaves the installed harness configuration and shared completion block in place.
`uninstall` remains available to remove that deployed configuration.

## ⌨️ Shell completion

Global npm installation registers completion for supported ordinary zsh users. Start a new interactive
shell or activate it now:

```zsh
eval "$(arc completion zsh)"
```

For permanent manual activation, add the command to your zsh startup file. For bash, use
`eval "$(arc completion bash)"`. Direct `completion zsh` and `completion bash` calls print the scripts.
At the first empty command position, Tab suggests only `preset` and `uninstall`; option prefixes offer
installation options. The setup-only `completion` command remains callable by name.

Automatic registration may be skipped by shell, runtime, permissions, `ZDOTDIR`, or npm script policy.
Use `npm i -g --foreground-scripts @yunhozz/arc` for hook diagnostics. Completion failure does not fail npm
installation. `--skip-global` does not undo existing registration, and both forms of uninstall retain it.

## 👥 Roles and workflow

Read [How the ARC harness operates](docs/harness-operation.md) for responsibilities, approval and preparation,
dependency scheduling, verification, commits, refresh boundaries, and recovery.

The Orchestrator answers simple questions, routes research to Scouter and design/spec/plan drafts to Planner,
and assigns implementation to a fresh Coder. Independent QA supplies evidence for acceptance. Significant
planned work receives a final Reviewer pass after task acceptances; significant unplanned work receives review
before acceptance. Accepted plan tasks get focused commits; tasks with no changes get records.

Design depth (Spike, Bounded, Architectural) and verification risk are separate. Approved documents and explicit
platform preparation precede implementation. Ready independent tasks may run within policy and runtime capacity;
Coder completion alone never releases dependents. Codex supports managed worktrees; Claude v1 uses the current
checkout. Structural tests do not prove live runtime compliance with scheduling or limits.

## 🧑‍💻 Maintenance

Refresh `MANIFEST.sha256` after changing distributed files (`models.toml` is excluded).
Run `npm ci --ignore-scripts`, then prepare the verified native test fixture for your host before `npm test`.

| Check | Command |
|---|---|
| Node regression suite | `npm test` |
| Python tool, policy, and payload checks | `python3 -B -m unittest discover -s tests` |
| Installer parity | `node scripts/check-installer-parity.mjs --complete` |
| Manifest | `node scripts/update-manifest.mjs --check` |
| Real upstream integration | `node tests/node/live-upstream.mjs` |
| Optional Codex token report (not installed) | `python3 codex/tools/codex_token_usage.py --since YYYY-MM-DD` |

The Node suite uses a deterministic Git snapshot fixture. The upstream check requires network access;
network failure leaves that result unverified.

### 📦 Publish to npm

The `npm-publish.yml` workflow publishes stable version changes pushed to `master` when repository variable
`NPM_PUBLISH_ENABLED` is `true`. It skips published versions, rejects versions below `latest`, and stops on registry errors.

1. Publish once from a release checkout with npm permission for `@yunhozz`: `npm publish --access public`.
2. Configure npm GitHub Actions Trusted publishing: owner `yunhozz`, repository `arc`, workflow `npm-publish.yml`,
   empty environment. Allow direct `npm publish`.
3. Set repository Actions variable `NPM_PUBLISH_ENABLED=true`; no npm token secret is needed.
4. Bump stable versions in `package.json` and `package-lock.json`, refresh the manifest, and merge to `master`.

Complete the first trusted publication within two days of configuration, or configure the publisher again.
Later releases repeat step 4. The workflow uses OIDC and provenance; it does not bump versions or publish prereleases.
See [npm Trusted publishing](https://docs.npmjs.com/trusted-publishers/).

## 📚 Operating guides

| Environment | Guide | References |
|---|---|---|
| Codex | [Operating guide](codex/skill/SKILL.md) | [Planning](codex/skill/references/planning.md) · [Handoff](codex/skill/references/handoff.md) · [Verification](codex/skill/references/verification.md) |
| Claude Code | [Operating guide](claude/skill/SKILL.md) | [Planning](claude/skill/references/planning.md) · [Handoff](claude/skill/references/handoff.md) · [Verification](claude/skill/references/verification.md) |
