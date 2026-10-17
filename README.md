# ARC (Agent Role Coordination)

ARC coordinates research, design, implementation, and verification in Codex and Claude Code.
The Orchestrator assigns work and accepts the result.

![Task flow diagram](docs/images/role-flow.svg)

## 👥 Roles and workflow

Read [How the ARC harness operates](docs/harness-operation.md) for installation/refresh boundaries,
role responsibilities, approval and preparation, dependency scheduling, verification, commits, and recovery.

The Orchestrator routes simple questions directly, research to Scouter, design/spec/plan drafts to Planner,
and implementation to a fresh Coder. QA supplies independent criterion evidence; the Orchestrator accepts results.
Significant planned work receives final whole-change Reviewer review after task acceptances; significant unplanned
work receives review before acceptance. Accepted plan tasks get focused commits; no-change tasks get records.

Design depth (Spike, Bounded, Architectural) and verification risk are separate. Approved documents and explicit
platform preparation precede implementation. Ready independent tasks may run within policy and runtime capacity;
Coder completion alone never releases dependents. Codex supports a managed worktree option; Claude v1 uses the
current checkout. The default limits are 100 created and 5 concurrent subagents per ARC session/tree.
Scheduling and cumulative limits are prompt-level policy; structural tests do not prove live runtime compliance.

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
arc install --target codex --preset balanced --language en
arc install --target all --preset smart --language en --check
arc install --target claude --preset economy --language en --dry-run
```

Alternatively, install from GitHub or a repository checkout. Interactive setup prompts for target, preset,
omitted limits (initial defaults: total 100, concurrent 5), then output language:

```sh
npx --yes github:yunhozz/arc install
```

For explicit target/preset selection (non-interactive execution preserves omitted limits):

```sh
npx --yes github:yunhozz/arc install --target codex --preset balanced --language en
./install.command --target claude --preset smart --language en
```

| Option | Purpose |
|---|---|
| `--target` | Select `claude`, `codex`, or `all`; interactive default: Claude |
| `--preset` | Select `economy`, `balanced`, or `smart`; interactive default: Balanced |
| `--language` | Select `en` (English) or `ko` (한국어); this is the final interactive question |
| `--check` | Validate distributed files and install paths without changes |
| `--dry-run` | Preview changes without writing |
| `--skip-global` | Skip global instructions, Codex config, and `.zshrc` access for this invocation |
| `--help`, `--version` | Show usage or version |

Without choices, a terminal prompts for target, preset, total limit, concurrent limit, then language.
Use Up/Down and Enter to select English or 한국어. Non-interactive runs require `--target`, `--preset`, and `--language`.
For `all`, one language applies to both targets. A shared existing language is preselected; otherwise English is selected.
Each target stores the choice in `skills/arc/settings.toml`. The installed default applies to Orchestrator and all five roles,
including progress updates, reports, and planning documents. Explicit user language requests override it.
`--skip-global` omits the global instructions block; installed skill and role policies still use the selected language.
Check and dry-run validate the included references locally without network access or checking upstream freshness.

### 📁 Installed files

| Target | Location and managed files |
|---|---|
| Codex | `~/.codex` (or `CODEX_HOME`): `skills/`, `agents/`, `AGENTS.md`, `config.toml` |
| Claude Code | `~/.claude`: `skills/`, `agents/`, `CLAUDE.md`, `settings.json` |

Installation adds a managed `arc:begin`/`arc:end` instruction block, preserving surrounding content.
Codex also sets `min_wait_timeout_ms = 120000` and `default_wait_timeout_ms = 300000` under `[features.multi_agent_v2]`
when that entry is a standalone table; otherwise manual guidance is printed. Claude requires the default `~/.claude`
configuration directory.

The installer fetches `brainstorming`, `writing-plans`, and `test-driven-development` from
[obra/superpowers](https://github.com/obra/superpowers) from a fresh shallow clone of its default branch.
Each npm `postinstall` refreshes both package trees at `codex/skill/references/superpowers/` and
`claude/skill/references/superpowers/` from one revision. Every actual `arc install` fetches again for each target,
publishing full skill trees under `skills/arc/references/superpowers/` together with ARC. Existing global/shared
superpowers copies and links are untouched; roles read ARC's local Markdown and companion files directly.
Reinstallation replaces managed ARC files and local model edits. No persistent backup is created.

Git and network access are required for each refresh; upstream scripts and hooks are never executed during collection.
Collection or publication failure fails installation; a two-platform publication failure restores both prior trees. Completion registration remains best-effort. Inspect any reported `Residual path:` before recovery.
`npm --ignore-scripts`, Git clone and ZIP downloads do not run postinstall automatically; the next actual `arc install`
still fetches the latest snapshot. Actual ARC installation stages new references without rewriting package files,
so a read-only package is supported. Concurrent refreshes of the same package are unsupported.

The bundled upstream material retains its [MIT license](https://github.com/obra/superpowers/blob/main/LICENSE),
including the Jesse Vincent copyright notice, in each `references/superpowers/LICENSE`.
`provenance.json` records the collected revision, timestamp, hashes and relative links for local consistency checks;
it does not authenticate upstream or a malicious local rewrite.

With `--target all`, targets install independently: Codex succeeds before Claude runs, and a later failure keeps the
earlier success. Inspect per-target status and any `Residual path:` output before retrying only the failed target.
Concurrent installation or removal against the same target is unsupported.

### 🗑️ Remove ARC

```sh
arc uninstall --target codex
arc uninstall --target all --dry-run
arc uninstall --target claude --skip-global
```

To remove the globally installed npm package:

```sh
npm uninstall -g @yunhozz/arc
```

`arc uninstall --target ...` removes installed harness configuration. npm package removal leaves that
configuration and shared shell completion registration in place.

Without a target, `arc uninstall` prompts in a terminal; non-interactive removal requires `--target`.
It removes the selected ARC skill, five role profiles, and managed instruction block, including edited ARC files.
Existing external skills, other profiles, Codex wait settings, both native concurrency keys, and shell completion registration remain.
No persistent backup is created.

### ⌨️ Shell completion

Global npm installation registers completion for supported ordinary zsh users. Start a new interactive shell,
or activate it now:

```zsh
eval "$(arc completion zsh)"
```

For permanent manual activation, add that command to your zsh startup file; for bash, use
`eval "$(arc completion bash)"`. `arc completion zsh` and `arc completion bash` print the scripts.

Automatic registration may be skipped by shell, runtime, permissions, `ZDOTDIR`, or npm script policy.
To see hook diagnostics, use `npm i -g --foreground-scripts @yunhozz/arc`. Completion failure does not fail npm
installation. `--skip-global` does not undo earlier registration; uninstall retains the shared completion block.

## ⚙️ Model settings

The Orchestrator uses the current conversation's model. Other roles use `models.toml`: [Codex](codex/skill/models.toml)
· [Claude Code](claude/skill/models.toml).

Both use `version = 1`, a root `preset`, and `roles.<role>.economy`, `.balanced`, and `.smart` variants.
Installation retains all three variants and selects the requested preset. Codex entries use `model` and
`model_reasoning_effort`; Claude entries use `model` and `effort`. All variants are validated, including inactive ones.

Change the installed preset without reinstalling:

```sh
arc preset smart --target codex
arc preset balanced --target all --check
arc preset economy --target claude --dry-run
```

Omit the preset or target in a terminal to choose it with arrow keys. Non-interactive runs require both.
Preset switching preserves custom model variants, profile instructions, language, limits, and global settings.
All selected targets are checked before writing; each target updates atomically in Codex → Claude order.
A later target failure keeps earlier successful changes. Open a new session to load changed profiles.

After editing the installed file, apply it with the optional Python 3.11+ tool:

```sh
python3 ~/.claude/skills/arc/scripts/apply-models.py
python3 ~/.codex/skills/arc/scripts/apply-models.py
```

Legacy schemas are rejected; reinstall or migrate to the linked schema. Reinstallation replaces local model edits.

## 🧑‍💻 Maintenance

Update `MANIFEST.sha256` when changing distributed files (`models.toml` is excluded).
Install development dependencies with `npm ci --ignore-scripts`, then prepare the verified native test fixture for your
host before running `npm test`.

| Check | Command |
|---|---|
| Node regression suite | `npm test` |
| Python tool, policy, and payload checks | `python3 -B -m unittest discover -s tests` |
| Installer parity | `node scripts/check-installer-parity.mjs --complete` |
| Manifest | `node scripts/update-manifest.mjs --check` |
| Real upstream integration | `node tests/node/live-upstream.mjs` |
| Optional Codex token report (not installed) | `python3 codex/tools/codex_token_usage.py --since YYYY-MM-DD` |

The regular Node suite uses a deterministic Git snapshot fixture. The real-upstream check needs network access;
network failure leaves that result unverified.

### 📦 Publish to npm

The `npm-publish.yml` workflow publishes stable version changes pushed to `master` when repository variable
`NPM_PUBLISH_ENABLED` is `true`. It skips published versions, rejects versions below `latest`, and stops on registry
errors.

1. Publish once from the release checkout with npm permission for `@yunhozz`: `npm publish --access public`.
2. In npm package settings, configure GitHub Actions Trusted publishing: owner `yunhozz`, repository `arc`,
   workflow `npm-publish.yml`, empty environment. Allow direct `npm publish`.
3. Set repository Actions variable `NPM_PUBLISH_ENABLED=true`; no npm token secret is needed.
4. Bump the stable version in `package.json` and `package-lock.json`, refresh `MANIFEST.sha256`, and merge to `master`.

Complete the first trusted publication within two days of configuring the publisher, or configure it again.
Later releases repeat step 4. The workflow uses OIDC and provenance; it does not create version bumps or publish
prereleases. See [npm Trusted publishing](https://docs.npmjs.com/trusted-publishers/).

## 📚 Operating guides

| Environment | Guide | References |
|---|---|---|
| Codex | [Operating guide](codex/skill/SKILL.md) | [Planning](codex/skill/references/planning.md) · [Handoff](codex/skill/references/handoff.md) · [Verification](codex/skill/references/verification.md) |
| Claude Code | [Operating guide](claude/skill/SKILL.md) | [Planning](claude/skill/references/planning.md) · [Handoff](claude/skill/references/handoff.md) · [Verification](claude/skill/references/verification.md) |


### Subagent limits

`arc install --target all --preset balanced --language en --max-total-subagents 100 --max-concurrent-subagents 5`
sets the maximum created subagents (default **100**) and simultaneous subagents (default **5**).
TTY installation asks for omitted values even when target/preset are supplied. Enter preserves each
target's existing value, or its initial default; a typed value applies to every selected target.
Non-interactive installs require target/preset; omitted limits preserve existing policy or use defaults.
Positive safe ASCII decimal integers are required. Total and concurrent limits are independent.

The installer writes `skills/arc/limits.toml` and merges native concurrency into Codex
`[agents].max_concurrent_threads_per_session` as an integer and Claude
`settings.json.env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` as a string, preserving unrelated settings.
Reinstallation preserves ARC limits; native concurrency drift requires an explicit concurrency
selection (the flag or TTY confirmation). Malformed configuration stops installation.
`--check` and `--dry-run` show policy/native changes without applying them.
`--skip-global` installs ARC policy only and skips global instruction, native config and shell access.

The cumulative limit counts created descendants in one ARC coordination session/tree, including
completed agents. Reusing the same instance costs no additional creation; fresh replacements do.
ARC maintains reservations and a ledger using prompt-level instructions; it does not intercept spawn
calls or provide hard cumulative runtime enforcement. Lower runtime capacity still applies.
Independent sessions/platforms/accounts have separate budgets. New settings apply to new sessions;
writing configuration does not demonstrate runtime support in the current process.
Uninstall removes ARC policy with the skill but preserves both native concurrency keys and Codex wait
settings. Remove the CLI separately with `npm uninstall -g @yunhozz/arc`.

- **Internal Superpowers references:** installation refreshes ARC's managed references under `skills/arc/references/superpowers`. Existing global/shared skill copies and links remain untouched. A reported `Residual path:` requires manual attention.
