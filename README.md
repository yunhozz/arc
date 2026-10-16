# ARC (Agent Role Coordination)

ARC splits research, design, implementation, and verification across roles in Codex and Claude Code. The CEO judges and coordinates the work, then accepts the result.

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

The CEO judges a request on two separate axes: **design depth** and **risk**. Design depth sets the approval steps before execution; risk sets the verification strength after execution.

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

Run without a repository checkout, install the command globally with npm, or use the shell entry point at the repository root.

```sh
npx --yes github:yunhozz/arc
npx --yes github:yunhozz/arc --target codex --preset balanced
./install.command
./install.command --target claude --preset smart
./install.command --target all --preset economy
```

Alternatively, install the `arc-install` command globally with npm (Node.js 22 or later), then run it. The flags are the same as above.

```sh
npm i -g github:yunhozz/arc
arc-install
arc-install --target codex --preset balanced
arc-install --target all --preset smart --check
arc-install --target claude --preset economy --dry-run
```

`arc-install` accepts `--target <claude|codex|all>`, `--preset <economy|balanced|smart>`, `--check` or `--dry-run`, `--skip-global`, `--help`, and `--version`. Run without flags in a terminal, it prompts interactively as described below.

An interactive run, when stdin and stdout are both TTYs, asks only for the missing values, in English. Use Up/Down to move the selection and Enter to confirm; navigation wraps at either end. The first prompt is `Select an installation target:` with `Claude`, `Codex`, and `All`; Claude is initially selected. The next is `Select a performance preset:` with `Economy`, `Balanced`, and `Smart`; Balanced is initially selected, so Enter applies Balanced. There is no separate confirmation prompt. A non-interactive run must pass both `--target` and `--preset`.

`All` runs both preflight checks, then installs Codex and Claude independently in that order. If Claude fails after Codex succeeds, the Codex success is kept and only Claude is recovered. Check the printed per-platform status and the `Backup:`/`Recovery:` paths, then rerun only the failed target with the same preset.

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
arc-uninstall
arc-uninstall --target codex
arc-uninstall --target all --dry-run
arc-uninstall --target claude --skip-global
```

With no target, a TTY menu offers **Claude**, **Codex**, **All** in that order; Claude is initially selected. Use Up/Down (wrapping) and Enter. No preset is requested. An explicit `--target` skips the menu; non-interactive execution requires it. EOF or Ctrl-C cancels with exit code 130. `--preset` is not accepted. `--help` and `--version` need no native binary or target selection.

Uninstall removes only the selected target's `skills/arc` directory, its five `agents/arc-{scouter,planner,coder,qa,reviewer}` role files (`.toml` for Codex, `.md` for Claude), and the unique well-formed ARC marker block in `AGENTS.md` or `CLAUDE.md`. Edited ARC files are included and their exact bytes are backed up under `<target>/backups/arc-<UUID>/` before removal. The global file remains present, even if empty; bytes outside the block, including BOM and line endings, are preserved. Unmarked global files remain unchanged. `--skip-global` does not access the global instruction file.

Shared skills, `.agents/skills`, other profiles, old backups/recovery, and Codex `config.toml` wait settings are preserved. Wait settings cannot be automatically restored because no previous-value record exists. Custom `CODEX_HOME` is respected. Unsafe types, symlinks (including within the ARC tree), and malformed, duplicate, or reversed markers fail before removal. Missing ARC entries are successful no-ops and create no empty backup.

All selected targets are inspected before removal. Each target has its own transaction: an earlier success remains committed if a later target fails. Output reports each target's status, rollback, `Backup:` and `Recovery:` paths. Failure exits 1, including cross-target overlap rejected during selected-set preflight and reported as per-target failures. Input/runtime errors and single-target configuration errors that abort during plan construction exit 2. Rollback never overwrites a newly created user entry; preserve reported recovery material if rollback conflicts. A changing uninstall reuses the stage recovery rules below; `--dry-run` reads only and performs no backup, recovery, or removal. Uninstall performs no preset processing, acquisition, npx, or network access. Concurrent install, uninstall, or recovery against the same target is unsupported.

### What the install changes

- **Global instructions:** adds or updates a managed block between `arc:begin`/`arc:end` markers at the end of `AGENTS.md` (Codex) or `CLAUDE.md` (Claude). Content outside the markers is left as is. Older descriptive managed markers are not migrated automatically and are rejected before any write.
- **Codex `config.toml`:** sets only `min_wait_timeout_ms = 120000` and `default_wait_timeout_ms = 300000` under `[features.multi_agent_v2]`. If that entry is not its own table, nothing is modified and manual setup instructions are printed.
- **Backups:** existing managed files are backed up to `<home>/backups/arc-<UUID>/` before being updated (`<home>` is `~/.codex` or `~/.claude`). On a fresh install the backup folder may be empty.
- **Codex external skills:** existing copies under `~/.agents/skills/<skill>` are backed up and then updated. User profiles that are not install targets are not changed.
- **Claude path:** a `CLAUDE_CONFIG_DIR` that is non-default, empty, or relative is rejected. Use `~/.claude`.
- **Claude external skill links:** if all three external skills are symlinks to same-named `~/.codex/skills/<name>` directories, they are replaced with independent Claude directories holding verified upstream content. Codex-side files and user edits are left alone. Any other link (parent or intermediate path links, a different destination or name, broken links, circular links, file destinations, links inside the Codex destination path) is rejected. The original links are backed up under `~/.claude/backups/` and restored if the install fails. If recovery itself fails, preserve the material at the printed recovery path.
- **`models.toml`:** reinstalling updates the settings and the five role profiles together with the selected Economy/Balanced/Smart preset (the previous file stays in the backup).
- **Recovery material:** `Backup:` is the backup of previous managed files; `Recovery:` reports preserved staging material. On normal success or rollback, every private `0700` `.arc-stage-*` directory created by that transaction is moved intact to `<target>/backups/arc-UUID/recovery/<unique-name>`, with a same-parent `.arc-recovery-UUID` fallback when the preferred move cannot safely complete. Unknown files, modes, and symlinks are retained; stage contents are never recursively deleted. After preflight succeeds, the next changing install also recovers stale `.arc-stage-*` directories directly inside the selected target’s `skills` and `agents`. This stale scan excludes target-home globals, shared skill parents, and nested directories. `--check` and `--dry-run` perform no recovery writes. A failed move or sync reports an error and the source or preserved recovery path; a cleanup failure after commit leaves the installed files in place and the command exits unsuccessfully. If a parent namespace changed, reported paths are last-known locations. Preserve the material and inspect the reported error before further action. Concurrent install, uninstall, or recovery against the same target is unsupported.

`--skip-global` leaves the global instructions and the Codex `config.toml` untouched.

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

Per-role models and reasoning effort live in `models.toml` for [Codex](codex/skill/models.toml) and [Claude Code](claude/skill/models.toml). The CEO uses the model of the current conversation.

Only if you edit an installed `models.toml` by hand can you apply it to the role profiles with the optional tool `apply-models.py` (shipped at `claude/skill/scripts/` and `codex/skill/scripts/`, and installed under `~/.claude/skills/arc/scripts/` and `~/.codex/skills/arc/scripts/`). This manual tool needs Python 3.11 or later and is not a dependency of the npm install or preset application. The old `python3 install.py` entry point has been removed.

```sh
python3 ~/.claude/skills/arc/scripts/apply-models.py
python3 ~/.codex/skills/arc/scripts/apply-models.py
```

## 🧑‍💻 Development

- When you change a distributed file, update `MANIFEST.sha256` (`models.toml` is excluded).
- Node tests: `npm ci --ignore-scripts`, prepare the verified native test fixture for your host, then `npm test`.
- Maintenance Python regression tests: `python3 -B -m unittest discover -s tests` (for the optional tool, policy, and payload checks).
- Parity check: `node scripts/check-installer-parity.mjs --complete`; manifest check: `node scripts/update-manifest.mjs --check`.
- Isolated check against real upstream: `node tests/node/live-upstream.mjs`. A network failure is reported as an unverified result. The regular `npm test` replaces only the external npx with a deterministic fixture.

## 📚 Learn more

- [Codex operating guide](codex/skill/SKILL.md) · [Claude Code operating guide](claude/skill/SKILL.md)
- Codex: [Planning](codex/skill/references/planning.md) · [Handoff](codex/skill/references/handoff.md) · [Verification](codex/skill/references/verification.md)
- Claude Code: [Planning](claude/skill/references/planning.md) · [Handoff](claude/skill/references/handoff.md) · [Verification](claude/skill/references/verification.md)
- Optional tool (not installed): per-role Codex token usage report `python3 codex/tools/codex_token_usage.py --since YYYY-MM-DD`
