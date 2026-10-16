# ARC (Agent Role Coordination)

ARC coordinates research, design, implementation, and verification in Codex and Claude Code. The CEO assigns the work and accepts the result.

![Task flow diagram](docs/images/role-flow.svg)

## 👥 Roles

| Role | Responsibility | Edits |
|---|---|---|
| CEO | Judges work, assigns roles, requests approvals, integrates, accepts and commits | Directly only for small, low-risk tasks |
| Scouter | Material research; static exploration of code, documents, and logs | None |
| Planner | Design, spec, and plan drafts | None |
| Coder | Implementation, configuration, and test edits within the approved scope | Assigned files only |
| QA | Independent verification against each acceptance criterion | None |
| Reviewer | Final independent review of significant changes | None |

- Every role reports only to the CEO and never creates other agents or hands work off.
- At most 4 subagents run concurrently. Dependent work runs in order.
- Simple questions, or checks that need only a few already-known files, are handled by the CEO directly.
- **Role gate:** design, spec, plan, and brainstorming drafts are authored ONLY by the Planner. The CEO never authors them and never invokes `brainstorming` or `writing-plans` through its own Skill tool. If one auto-triggers, the CEO stops and routes to the Planner. A request to skip questions does not waive the design and approval gates.
- **Freshness:** each top-level task (a plan task, or the whole request without a plan) starts a FRESH Coder, and each task that needs QA gets a FRESH QA. A Coder or QA is reused only for corrections or rechecks of the same task.
- **Codex read-only roles:** Scouter, Planner, and Reviewer are read-only by prompt-level guards, not sandbox enforcement (no `sandbox_mode`). After each of them returns, the CEO checks `git status` against a pre-spawn snapshot for unexpected changes.

## 🧭 Task flow

The CEO assesses **design depth** to set approval steps and **risk** to set verification strength.

### Design depth

The Planner proposes the path and drafts; the CEO integrates them and obtains user approval.

| Path | When | Approval order |
|---|---|---|
| **Spike** | You first need to find out whether something is possible | Approve question and method → explore → report findings → reassess depth and approve implementation anew |
| **Bounded** | A change with a clear scope | Approve a short design → (if needed) approve a plan → implement |
| **Architectural** | A change to structure or contracts | Approve design → approve spec → approve plan → implement |

- Bounded skips the plan only when it changes a single place, has no dependent steps, shared state, or integration-order concerns, and has a single verification path.
- Approved design, spec, and plan documents are bundled into one documentation commit before implementation.
- Before implementation, the user chooses between using the current branch as is and creating a work branch.

### Verification by risk

| Risk | Criteria | Flow |
|---|---|---|
| **Small, low risk** | Narrow scope, understood, easy to revert, verifiable by focused checks | Coder or CEO direct edit → CEO focused checks → acceptance |
| **Ordinary** | Behavior changes beyond the low-risk conditions | Coder → FRESH QA → acceptance |
| **Significant / high risk** | Shared role contracts, shared state, lifecycle or integration order, security or permissions, data loss or migration, public interfaces, costly install or deployment | Coder → FRESH QA → Reviewer → acceptance |

- If the risk is unclear, investigate first or follow the higher flow.
- With a plan, each top-level task is one commit. The CEO verifies, accepts, and then commits each task, with a FRESH Coder per task and a FRESH QA for each task that needs QA.
- The Reviewer does not take part in each task. After all tasks are accepted, the Reviewer reviews the full final change once.
- A CEO direct edit is allowed only for small, low-risk work that needs no plan. Record scope, files, criteria, and focused checks, and get user approval before the first edit.
- Coders follow TDD for feature and behavior changes. TDD may be skipped only for small, low-risk work that needs no plan.

The two axes are independent. Architectural does not add QA or Reviewer at every step, and Bounded does not mean low risk. Push, merge, and deployment always need separate approval.

## 🚀 Installation

**Requires:** Node.js 22 or later with npm (`npx`), Git, and a network connection for fetching external skills. The npm install and preset application need no Python, compiler, or `node-gyp`. The package bundles prebuilt native files for four platforms.

Supported environments are macOS 13 or later (arm64/x64) and Linux with glibc 2.28 or later (arm64/x64). Windows and musl Linux are not supported. An unsupported environment, or a missing or tampered native file, fails before any file is changed.

The `@yunhozz/arc` registry package is not published yet. After publication, install the `arc` command globally, then apply ARC settings with `arc install`:

```sh
npm i -g @yunhozz/arc
arc install
arc install --target codex --preset balanced
arc install --target all --preset smart --check
arc install --target claude --preset economy --dry-run
```

Global npm installation makes the CLI available and registers zsh completion when supported (see [Shell completion](#shell-completion)). `arc install` installs the selected role profiles, skills, and settings.

To apply ARC without installing a global command, use `npx`. From a repository checkout, use `install.command`; both accept the same installation flags.

```sh
npx --yes github:yunhozz/arc install
npx --yes github:yunhozz/arc install --target codex --preset balanced
./install.command
./install.command --target claude --preset smart
./install.command --target all --preset economy
```

`arc install` accepts `--target <claude|codex|all>`, `--preset <economy|balanced|smart>`, `--check` or `--dry-run`, `--skip-global`, `--help`, and `--version`. Without flags in a terminal, it prompts for the missing choices.

Interactive runs require both stdin and stdout to be TTYs. English menus ask for missing values: target (`Claude`, `Codex`, `All`; default Claude), then preset (`Economy`, `Balanced`, `Smart`; default Balanced). Use Up/Down to move, wrapping at either end, and Enter to select. There is no additional confirmation. After the final choice, a spinner shows `Installing ARC…` while installation is in progress. Check and dry-run show `Checking ARC…` and `Preparing ARC dry run…`; non-interactive output prints the status once without animation. A non-interactive run must pass both `--target` and `--preset`.

`All` runs both preflight checks, then installs Codex and Claude independently in that order. If Claude fails after Codex succeeds, the Codex success is kept and only Claude is rolled back. Check the printed per-platform status and any `Residual path:` lines, then rerun only the failed target with the same preset.

| Target | Install location |
|---|---|
| Codex | `~/.codex` (or `CODEX_HOME`): `skills/`, `agents/`, `AGENTS.md`, `config.toml` |
| Claude Code | `~/.claude`: `skills/`, `agents/`, `CLAUDE.md` |

The installer fetches the external skills `brainstorming`, `writing-plans`, and `test-driven-development` from [obra/superpowers](https://github.com/obra/superpowers). It uses an unpinned `skills@latest`, so the content may differ between install times.

### Pre-install checks

```sh
./install.command --target codex --preset balanced --check
./install.command --target all --preset smart --dry-run
```

- `--check` verifies the distributed files (MANIFEST) and the install paths; `--dry-run` shows which files would change.
- Neither changes files or uses subprocesses or the network. Both pass even in a fresh environment without the external skills. The existence and content of the external skills are verified at actual install time.
- Safety of the external skill paths is checked by the same rules as a real install, so the result predicts the real install result.

### Remove ARC

```sh
arc uninstall
arc uninstall --target codex
arc uninstall --target all --dry-run
arc uninstall --target claude --skip-global
```

With no target, a TTY menu offers **Claude**, **Codex**, **All** in that order; Claude is initially selected. Use Up/Down (wrapping) and Enter. No preset is requested. An explicit `--target` skips the menu; non-interactive execution requires it. EOF or Ctrl-C cancels with exit code 130. `--preset` is not accepted. `--help` and `--version` need no native binary or target selection.

Uninstall removes only the selected target's `skills/arc` directory, its five `agents/arc-{scouter,planner,coder,qa,reviewer}` role files (`.toml` for Codex, `.md` for Claude), and the unique well-formed ARC marker block in `AGENTS.md` or `CLAUDE.md`. Edited ARC files are included. Previous bytes are held only in transaction-owned temporary stages until removal commits, then deleted; no persistent backup is created. The global file remains present, even if empty; bytes outside the block, including BOM and line endings, are preserved. Unmarked global files remain unchanged. `--skip-global` does not access the global instruction file.

Shared skills, `.agents/skills`, other profiles, old backups/recovery, and Codex `config.toml` wait settings are preserved. Wait settings cannot be automatically restored because no previous-value record exists. Custom `CODEX_HOME` is respected. Unsafe types, symlinks (including within the ARC tree), and malformed, duplicate, or reversed markers fail before removal. Missing ARC entries are successful no-ops.

All selected targets are inspected before removal. Each target has its own transaction: an earlier success remains committed if a later target fails. Output reports each target's status, rollback, and any `Residual path:` requiring attention. Failure exits 1, including cross-target overlap rejected during selected-set preflight and reported as per-target failures. Input/runtime errors and single-target configuration errors that abort during plan construction exit 2. Rollback never overwrites a newly created user entry; preserve reported residual material if rollback conflicts. A changing uninstall uses the stage cleanup rules below; `--dry-run` reads only and performs no cleanup or removal. Uninstall performs no preset processing, acquisition, npx, or network access. Concurrent install or uninstall against the same target is unsupported.

### What the install changes

- **Global instructions:** adds or updates a managed block between `arc:begin`/`arc:end` markers at the end of `AGENTS.md` (Codex) or `CLAUDE.md` (Claude). Content outside the markers is left as is. Older descriptive managed markers are not migrated automatically and are rejected before any write.
- **Codex `config.toml`:** sets only `min_wait_timeout_ms = 120000` and `default_wait_timeout_ms = 300000` under `[features.multi_agent_v2]`. If that entry is not its own table, nothing is modified and manual setup instructions are printed.
- **Previous files:** installation and removal create no persistent backup or recovery files. Reinstall replaces local edits to managed files, including model settings. Previous originals are retained only during the transaction for rollback and deleted after publication succeeds.
- **Codex external skills:** existing copies under `~/.agents/skills/<skill>` are install targets replaced with verified upstream copies. Previous originals are held only in the private transaction stage for rollback and deleted after publication succeeds. Any reported `Residual path:` requires manual attention. User profiles that are not install targets are not changed.
- **Claude path:** a `CLAUDE_CONFIG_DIR` that is non-default, empty, or relative is rejected. Use `~/.claude`.
- **Claude external skill links:** if all three external skills are symlinks to same-named `~/.codex/skills/<name>` directories, they are replaced with independent Claude directories holding verified upstream content. Codex-side files and user edits are left alone. Any other link (parent or intermediate path links, a different destination or name, broken links, circular links, file destinations, links inside the Codex destination path) is rejected. Original links are held in temporary stages and restored if installation fails before cleanup. If rollback conflicts, preserve the material at the printed residual path.
- **`models.toml`:** reinstalling updates the settings and the five role profiles together with the selected Economy/Balanced/Smart preset (reinstallation replaces local model edits).
- **Temporary stages:** transaction-owned private `0700` `.arc-stage-*` directories live beside managed targets during installation or removal. Normal success and completed rollback delete the known staged items and stages through held directory handles, checking identity and snapshots without following links. Unknown entries, unsafe types, metadata/content drift, or replaced namespaces are preserved and reported with `Residual path:` and an error. A cleanup failure after publication keeps the installed/removed state and exits unsuccessfully; it does not roll back after original deletion starts. Old backups, recovery paths and stale stages are never automatically moved or removed. Forced termination, power loss or filesystem errors can leave stages requiring manual inspection. Paths under a replaced parent are last-known locations. Concurrent install or uninstall against the same target is unsupported.

`arc install --skip-global` skips global instructions, Codex `config.toml`, and `.zshrc` access for that invocation. It does not undo completion registered by npm.

### Manual setup with `--skip-global`

Append the block below to the end of the target file (`AGENTS.md` or `CLAUDE.md`). `<SKILL>` is `~/.codex/skills/arc/SKILL.md` for Codex and `~/.claude/skills/arc/SKILL.md` for Claude.

````md
<!-- arc:begin -->
## Agent Role Coordination

- For requests requiring substantive multi-step research, analysis, or implementation, configuration, or test work, and for design, spec, plan, and brainstorming requests (these are NOT standalone document writing), load and follow `<SKILL>`; keep following it in relevant follow-up turns of the same chat without re-reading it unless it changed. Resolve `~` to the current user's home directory. ARC subagents (depth 2) follow their role profile and brief instead and do not load `SKILL.md`.
- Design, spec, plan, and brainstorming drafts are authored ONLY by the Planner. CEO MUST NEVER author them or invoke `brainstorming`/`writing-plans` through its own Skill tool; if one auto-triggers, CEO stops and routes to the Planner.
- For repository implementation, configuration, or test work, CEO owns coordination and acceptance; assign file edits and other work to the other roles according to their defined responsibilities. CEO must not edit implementation, configuration, or test-code files directly, except under the ARC CEO direct path for small, low-risk tasks. The other roles stay within their assigned scopes and report to CEO.
<!-- arc:end -->
````

Codex also adds the following to `~/.codex/config.toml`.

```toml
[features.multi_agent_v2]
min_wait_timeout_ms = 120000
default_wait_timeout_ms = 300000
```

## ⚙️ Model settings

Per-role models and reasoning effort live in `models.toml` for [Codex](codex/skill/models.toml) and [Claude Code](claude/skill/models.toml). The CEO uses the model of the current conversation. Each file uses integer `version = 1`, a root `preset = "balanced"`, and settings under `roles.<role>.economy`, `roles.<role>.balanced`, and `roles.<role>.smart`. All three variants are retained when installation selects a preset; change `preset` to switch the active variant. Claude entries contain `model` and `effort`; Codex entries contain `model` and `model_reasoning_effort`. Every variant is validated, including inactive ones. The former `presets.toml` overlay is removed.

Legacy Codex version 5 and Claude role-only version 1 files are rejected by the manual tool before any profile is changed. Reinstall ARC or rewrite the file using the unified schema; reinstallation replaces local model edits.

After editing an installed `models.toml`, apply it to the role profiles with the optional `apply-models.py` tool (shipped at `claude/skill/scripts/` and `codex/skill/scripts/`, and installed under `~/.claude/skills/arc/scripts/` and `~/.codex/skills/arc/scripts/`). This manual tool needs Python 3.11 or later and is not a dependency of the npm install or preset application. The old `python3 install.py` entry point has been removed.

```sh
python3 ~/.claude/skills/arc/scripts/apply-models.py
python3 ~/.codex/skills/arc/scripts/apply-models.py
```

## 🧑‍💻 Development

- When you change a distributed file, update `MANIFEST.sha256` (`models.toml` is excluded).
- Install local development dependencies with `npm ci --ignore-scripts`; this does not install the global CLI or apply ARC settings. Prepare the verified native test fixture for your host, then run `npm test`.
- Maintenance Python regression tests: `python3 -B -m unittest discover -s tests` (for the optional tool, policy, and payload checks).
- Parity check: `node scripts/check-installer-parity.mjs --complete`; manifest check: `node scripts/update-manifest.mjs --check`.
- Isolated check against real upstream: `node tests/node/live-upstream.mjs`. A network failure is reported as an unverified result. The regular `npm test` replaces only the external npx with a deterministic fixture.

## 📚 Learn more

- [Codex operating guide](codex/skill/SKILL.md) · [Claude Code operating guide](claude/skill/SKILL.md)
- Codex: [Planning](codex/skill/references/planning.md) · [Handoff](codex/skill/references/handoff.md) · [Verification](codex/skill/references/verification.md)
- Claude Code: [Planning](claude/skill/references/planning.md) · [Handoff](claude/skill/references/handoff.md) · [Verification](claude/skill/references/verification.md)
- Optional tool (not installed): per-role Codex token usage report `python3 codex/tools/codex_token_usage.py --since YYYY-MM-DD`

### Shell completion

`arc <Tab>` offers `install`, `uninstall`, and `completion`. Later positions offer options, targets, presets, and shells. `arc completion zsh` and `arc completion bash` print the scripts.

Global npm installation automatically adds the ARC managed block to `~/.zshrc` only when all of these conditions hold:

- The package is at npm's final global install location on macOS or Linux.
- An identifiable, ordinary user runs zsh (`SHELL` names zsh), and `ZDOTDIR` is unset or points to that user's home.
- The bundled native runtime is available and the startup file passes safety checks.

Local dependency installs, development installs, npx temporary installs, and Git preparation checkouts do not access home startup files. Automatic registration is skipped for other or unknown shells, a separate `ZDOTDIR`, root/elevated or unknown users, and unsupported runtimes. `--ignore-scripts` or npm script policy prevents the hook from running.

Completion starts in a **new interactive zsh session** that reads its startup files and can find `arc` on PATH. Activate it in the current session with:

```zsh
eval "$(arc completion zsh)"
```

For manual permanent activation, add that command to the startup file your zsh actually reads. For bash, add `eval "$(arc completion bash)"` to your bash startup file.

Registration uses the same managed block as `arc install`. Reinstallation keeps one block and preserves outside bytes, BOM, line endings, and existing file mode. Invalid UTF-8, malformed markers, symlinks, unsafe types, insufficient permissions, and concurrent changes prevent unsafe writes. The transaction and temporary-stage rules above apply; no persistent backup or recovery files are created.

Completion registration failure does not fail npm installation. The hook reports registration, skip, or failure and manual activation guidance, but npm may hide this output. To see diagnostics, use `npm i -g --foreground-scripts @yunhozz/arc`. Any reported `Residual path:` requires attention.

`arc install --skip-global` skips `.zshrc` access only for that invocation; it does not undo the npm hook. `--check` and `--dry-run` leave startup files unchanged. `arc uninstall` and `npm uninstall -g @yunhozz/arc` retain the shared managed block. There is no npm removal hook; the managed block checks that `arc` exists before loading completion.
