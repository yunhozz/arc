# How the ARC harness operates

ARC installs the harness files and the conversation Orchestrator coordinates work. The [Claude](../claude/skill/SKILL.md), [Codex](../codex/skill/SKILL.md), [Gemini](../gemini/skill/SKILL.md) and [Grok](../grok/skill/SKILL.md) skills define the workflow contracts with their references and profiles.

Role instructions govern scheduling and limits through prompt policy. Native settings apply to their own sessions. Verify live behavior and settings in new sessions.

## What ARC installs

| Component | Claude Code | Codex | Gemini CLI | Grok CLI |
|---|---|---|---|---|
| Home | `~/.claude`; conflicting `CLAUDE_CONFIG_DIR` rejected | `~/.codex` or `CODEX_HOME`, resolved relative to the CLI working directory if needed | `~/.gemini`; any `GEMINI_CLI_HOME` rejected | `~/.grok`; any `GROK_HOME` rejected |
| Skill | `skills/arc/` | Same | Same | Same |
| Models | `skills/arc/models.toml` | Same | Same | Same |
| Limits | `skills/arc/limits.toml` | Same | Same | Same |
| Five specialist profiles | `agents/arc-*.md` | `agents/arc-*.toml` | `agents/arc-*.md` | `agents/arc-*.md` |
| Managed instructions | `CLAUDE.md` | `AGENTS.md` | `GEMINI.md` | `AGENTS.md` |
| Native settings | `settings.json` | `config.toml` | Existing settings preserved | `config.toml`, ARC-managed `[compat.claude]` entries only |

- `models.toml` schema v3 has five `[roles.<role>]` tables with `model` and one effort field: `model_reasoning_effort` (Codex) or `effort` (Claude/Gemini/Grok). The Orchestrator uses the conversation model.
- Valid v1/v2 settings convert to v3 on write. Catalog entries are candidates. Saved pairs missing from the catalog remain visible and require reselection before Apply.

## Mixed routing

| Contract | Rule |
|---|---|
| Participants | S = role platforms ∪ hosts; one = standalone, two or more = `Mixed (…)` |
| Anchor | Display and anchor order: Claude > Codex > Gemini > Grok |
| Active file | `<anchor home>/arc-role-platform-routing.json`; new schema v2 explicitly lists anchor-ordered platforms |
| Lock and store | Routing lock and `arc-role-dispatch/` in the anchor home |
| Participants | `arc-role-platform-routing.prepared.json` points to active file; `agents/arc-routing-*` for assigned roles; host-only marker has an empty profile map |
| Activation | Host marker discovers anchor; runtime revalidates active config/all markers under lock and requires matching installed bytes. Historical v1 is migration-only; markers prove no login/permissions/model/effort. Apply publishes; reload in a new session |
| Paths | Symlinked homes/parents refused for install, publication, locks |

- New v2 leases record the assigned role's `targetPlatform` within the participant set. Run, observe, resume and cancel use that target.
- Legacy v1 reads infer native = host and bridge = peer for Claude/Codex. Other v1 hosts hold as `activation_unverified`.

## Status and authentication

| Status or platform | Meaning or method |
|---|---|
| `Available` | CLI available |
| `Not Available` | CLI missing |
| `Unauthorized` | Permanently rejected auth refresh |
| `Incomplete` | Inconclusive check, never `Available` |
| `Not verified`, `Unverified` | Verification/installation consistency unresolved |
| `Unsupported version` | CLI version outside the supported range |
| Claude | `claude auth status` |
| Codex | Home/composite auth uses `codex app-server` `getAuthStatus`; network refresh rotates `CODEX_HOME/auth.json` tokens |
| Gemini | `auth.kind: none`, no probe, status `unknown`; `auth unverified` warning, not proof of login |
| Grok | `auth.kind: none`, no probe, status `unknown`; Status runs only `grok --version`; `auth unverified` warning, not proof of login |

Unknown Claude/Codex auth probe results block participation.

## Execution support

| executionEnvironment | Claude target | Codex target | Gemini target | Grok target |
|---|---|---|---|---|
| `claude-cli` | Native, all roles | Bridge, all roles | Bridge, read roles only (GG1 `fail`; Implementer/QA held as `permission_scope_unverified`) | Bridge, all roles |
| `codex-cli` | Bridge, all roles | Native, all roles | Bridge, read roles only (GG1 `fail`; Implementer/QA held as `permission_scope_unverified`) | Bridge, all roles |
| `gemini-cli` | Held (`capability_not_verified`; GG2 `fail`, `compositeHost` off) | Held (`capability_not_verified`; GG2 `fail`, `compositeHost` off) | Held (`capability_not_verified`; GG2 `fail`, `compositeHost` off) | Held (`capability_not_verified`; GG2 `fail`, `compositeHost` off) |
| `grok-cli` | Bridge, all roles | Bridge, all roles | Bridge, read roles only (GG1 `fail`; Implementer/QA held as `permission_scope_unverified`) | Native, all roles |
| `claude-desktop` | Held (`environment_unverified`) | Held (`environment_unverified`) | Held (`environment_unverified`) | Held (`environment_unverified`) |
| `codex-desktop` | Held (`environment_unverified`) | Held (`environment_unverified`) | Held (`environment_unverified`) | Held (`environment_unverified`) |

Read roles are Scouter, Planner and Reviewer. The table shows which routes the recorded gates permit; apply the host rules and check each dispatch result.

| Host | Runtime approval and target home checks |
|---|---|
| Claude | ARC applies no per-call approval gate or target home probe. |
| Codex | G2 `escalation` requires user approval on every runtime call, including native calls. The Orchestrator obtains approval. Refusal or a denied write holds as `host_sandbox_blocked`. Detached supervisor survival was observed under variant conditions. |
| Gemini | GG2 `fail` holds the CLI host pending live measurement. |
| Grok | GK2 `approval` requires ask mode and per-call user approval. Start with `grok --permission-mode default`, keep the host sandbox off, and select `Allow once`. `Always allow` saves `permission_mode = "always-approve"` to the Grok config. A denied write holds as `host_sandbox_blocked`. ARC cannot detect whether the host sandbox is on. |

The caller declares `executionEnvironment` from the session. Use the host's CLI value for a terminal, TUI or IDE terminal and when unsure. Use a Desktop value only for a confirmed Claude or Codex Desktop session. Both Desktop environments hold as `environment_unverified`. A future release would need to check CLI discovery, shared auth, a shared worktree, supervisor survival, per-call escalation and a matching native revision tag. Recording those checks releases nothing in this version.

| Bridge contract | Result and operational impact |
|---|---|
| G1 `pass` | Claude bridge write roles use the recorded sandbox and deny writes to `.git`. Unsafe or unreadable project settings hold as `permission_scope_unverified`. Live evidence covers Claude 2.1.327 on macOS. |
| G3 `pass` | A Codex rollout with a detected child spawn fails as `delegation_observed`. |
| G4 `pass` | Codex routes pass this gate. A failed G4 holds as `permission_scope_unverified`. |
| G5 `wide` | Codex `workspace-write` may reach beyond the worktree, outside post-run detection. |
| GG1 `fail` | Gemini bridge Implementer/QA hold as `permission_scope_unverified`. Read roles remain supported. |
| GK1 `pass` | Grok bridge write roles require a per-dispatch sandbox profile and a verified `ProfileApplied` event. Live evidence covers Grok 1.0.89 on macOS. Unlisted home paths, session files and temporary directories remain writable. Reads and network access are allowed. |
| Claims | `supportStatus: verified` requires all five claims to be `runtime-observed`. User MCP configuration caps Codex permission evidence at `operator-attested`. |
| Versions | Routing reports CLI versions. Configure and Status use the registry's supported ranges, and Configure blocks composite platform selection outside those ranges. |
| Target home probe | On Grok or Gemini hosts, bridge prepare/run/resume probe the target home. A denial holds as `host_sandbox_blocked`, a missing home as `activation_unverified`, and a failed cleanup reports `residualPaths`. The probe covers the home directory itself. |
| Child guard | `ARC_BRIDGE_CHILD` blocks routing commands. Shell launches of a platform CLI fall outside `delegation_observed` detection. |

For bridge target rules and the control files they cover, see [Claude](../claude/skill/references/coordination.md#bridge-target-rules) · [Codex](../codex/skill/references/coordination.md#bridge-target-rules) · [Gemini](../gemini/skill/references/coordination.md#bridge-target-rules) · [Grok](../grok/skill/references/coordination.md#bridge-target-rules).

### Post-run detection limits

The supervisor compares Git-visible paths, HEAD, branch, refs and the control files listed in the bridge target rules before and after the run. Detected violations leave files in place and report affected control-file labels in `controlFiles.changed`. Outside the selected control files, Git-ignored paths and external `core.hooksPath` directories are missed. Changes within a hooks or info tree that exceeds 1,000 entries may go undetected while both snapshots report `overflow`. A failed before snapshot stops execution as `execution_failed`. A failed after snapshot leaves permissions unverified and yields no comparison verdict. Check `tolerated.refs` with `git log` and `git reflog` before rebasing, merging or accepting because the comparison cannot identify who made those changes.

### Working alongside a running bridge

In the dispatch worktree, make only fast-forward commits on its current branch, within `allowedPaths` for Implementer and for QA with non-empty `allowedPaths`. Avoid amending, rebasing, resetting, switching branches or writing `.git/config` (including via `git push -u`).

Avoid saving host permission rules in the dispatch checkout. Claude Code's “don't ask again” can change `.claude/settings.local.json` and fail the dispatch as `permission_violation_observed`. Use a linked worktree to isolate bridge work.

## Install, update, remove

Management and watch require an interactive terminal for input and output, including when watch uses `--json`. `arc --help`, `arc --version` and `arc watch --help` work without a terminal.

| Operation or mode | Action and confirmation |
|---|---|
| Settings | Configure defaults to Supervised, English, 100 total and 5 concurrent subagents. Edited mixed fields apply across participants. For the gates Full Auto can decide, see [Claude](../claude/skill/references/planning.md#full-auto-run-mode) · [Codex](../codex/skill/references/planning.md#full-auto-run-mode) · [Gemini](../gemini/skill/references/planning.md#full-auto-run-mode) · [Grok](../grok/skill/references/planning.md#full-auto-run-mode). |
| Standalone | Apply updates the selected home. Switching out of Mixed requires confirmation and restores standalone profiles before the selected operation. |
| New or same-participant Mixed | Install in anchor order, then publish at the anchor. Publication replaces owned standalone profiles with routing profiles. |
| Changed Mixed participants | Preview the mode, install additions and restore departing homes to standalone. An anchor move locks both stores and holds on non-terminal leases. |
| Update | Status revalidates the offered version. Global CLI replacement ends the session. An npx update leaves the global CLI in place. If the global CLI is broken, run `npx --yes @yunhozz/arc@latest`. Use Configure for a same-version refresh. |
| Preservation and holds | Preserve unrelated settings, shared skills and content outside managed blocks. Invalid policy or config, unresolved routing and active bridges can block applicable operations. |
| Global settings | Skipping global changes preserves existing instructions and settings. Codex config supports wait and concurrency settings. Claude Code writes the concurrency limit in `settings.json.env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`. |
| Recovery | Check reported residual paths. A rollback label alone provides no evidence of cleanup or backup. |

Automatic re-application uses the same path as manual Configure → Apply. It runs once for Mixed routing or once per installed standalone platform. On success, it applies the current ARC configuration to ARC-managed global instructions and native concurrency settings, overwriting edits within the managed scope. The native concurrency drift check holds automatic re-application only when the request omits a concurrency limit and an existing native value differs from that platform's saved ARC limit. For example, automatic re-application omits the limit when Mixed participants have different saved limits. If this check holds re-application, explicitly select the concurrency limit in Configure before choosing Apply. See [Upgrade](../README.md#upgrade) for the first npx upgrade from 0.4.6 or earlier and re-application recovery.

### Legacy migration

Configure → Apply moves a consistent legacy Codex-home v1 Mixed installation to the Claude anchor. The transaction repoints markers and leaves dispatch history in the old store.
Finish or cancel non-terminal leases before migration. Inspect lost supervisors, corrupt leases and uncertain exits manually. Legacy removal uses the old anchor. After downgrade, run Configure in the older version.
`cooperative.versions` holds in-flight plans when runtime or policy versions change. Finish or hand off before upgrade, or start a new workflow with fresh evidence and approvals.

| Uninstall | Scope and boundaries |
|---|---|
| Platform row | Confirm Remove (default Back); absent rows disabled. Mixed participant first restores others to standalone. Remove selected skill/profiles/managed blocks including edited ARC files; preserve other skills/profiles, native concurrency/wait/workflow records, unselected homes/user files; unclear ownership preserved/reported |
| Everything (incl. CLI) | Verified install/standalone platforms only; refused when a platform home cannot be resolved. Harness success required before verified global CLI removal, including npx; identity/context failure blocks harness writes; CLI failure preserves harness success; CLI removal ends session; preserve other packages/npx cache |
| CLI only | `npm uninstall -g @yunhozz/arc`; harness remains |

## Watch

Run `arc watch --help` for history and output options.

| Concern | Behavior and limits |
|---|---|
| Selection | Choose All supported platforms or one supported platform. Unsupported platforms are marked and unavailable. Back, Escape and EOF exit 0. Ctrl-C in the menu exits 130 |
| Sources | Supported platform transcripts and dispatch leases/artifacts. Codex Desktop sessions are excluded. |
| Scope | Every selection watches the current Git worktree or the current directory outside Git. Linked and nested worktrees are excluded. Events use the session working directory at the time of the event. Dispatches are matched by their workflow target or an in-scope session linked to the dispatch artifact |
| Anchor | Marker active directory must match resolved registered home; one candidate selects store, none → legacy Codex, multiple → `dispatch store ambiguous` (other sources continue). No old-history merge |
| Shown | Full USER, AGENT and PROMPT messages; role badge on its own line above the message when known; EDIT/CREATE/DELETE list all paths (two or more as `- ` items; a single path has no `- `); other events one line |
| Hidden | Tool/command outputs, skill definitions/args, MCP args/results; reasoning only verbose; incomplete secret masking applies to JSON too |
| Read-only | No network or CLI except restricted Git discovery/listing; no writes |
| Display | TTY/width wraps messages/file lists; in a TTY, a bottom status block shows the watched path, with `working…` below it while a turn is in progress; JSON v1 preserves message lines/absolute paths; other text capped at 1000 code points. During watch, Ctrl-L clears the screen and Ctrl-C or a stop signal exits 0. `working…` ends after interrupt or 5 minutes idle |
| Shell detection | Git file lists and metadata infer edits, including possible external edits or duplicates. Ignored paths, unchanged fingerprints and non-Git roots are missed. Watch disables shell detection above 20,000 files or after three consecutive listing failures. Inferred JSON events carry `inferred:true`. |

| KIND | Meaning |
|---|---|
| USER | User message |
| AGENT | Agent message (ARC role prefix when known) |
| PROMPT | Agent-generated prompt sent to a child session (`kind: "prompt"` in `--json` output) |
| CMD | Command; literal successful Claude rm targets are not a filesystem audit |
| EDIT | File edit |
| CREATE | File creation |
| DELETE | File deletion |
| TOOL | Tool call |
| SKILL | Skill call; Codex skill-only reads deduplicated per turn; verbose also shows CMD |
| PLUGIN | Plugin call |
| TOOL! | Tool failure |
| SPAWN | Agent creation |
| DISPATCH | Routing dispatch |
| APPROVE | Approval |
| FAIL | Turn failure |
| ERROR | Error |
| SESSION | Session |
| END | Turn end |
| NOTICE | Notice |
| SETTINGS | Settings |
| TURN | Turn start |
| THINK | Reasoning |
| ITEM | Other item |

With color enabled in a TTY, watch renders Markdown in AGENT and PROMPT messages. `NO_COLOR`, piped output and `--json` preserve the Markdown source text.

## Workflow contracts

Use the installed skill and its references for role ownership, approvals, limits, verification, recovery and commits. The repository also provides the [shared role policy](../lib/policy/role-policy.json).

Repository commit descriptions are concise Korean.

## Maintenance and source map

| Maintenance | Effect and boundaries |
|---|---|
| Reinstall | Refreshes packaged files and replaces managed profiles. Valid model settings and omitted limits survive. Open new sessions to load the changes. |
| Packaged references and runtime | Shared and platform sources compose into packaged references and a generated runtime. Published postinstall is informational. |
| Explicit upstream refresh | Run the Updater in the checkout to refresh mapped references and the manifest together. Publication errors trigger rollback and may leave reported residual paths. If cleanup fails after publication, the published files remain in place. Install and upgrade use packaged references. |
| Manifest | Update and check `MANIFEST.sha256`. Model settings are excluded. |
| Cleanup | Install removes valid legacy completion blocks. Status leaves shell files alone. Inspect residuals separately from agent Git recovery. |

| Concern | Source |
|---|---|
| References | [Claude](../claude/skill/references), [Codex](../codex/skill/references), [Gemini](../gemini/skill/references), [Grok](../grok/skill/references), [shared](../shared/skill/references) |
| Profiles and models | [Claude](../claude/agents), [Codex](../codex/agents), [Gemini](../gemini/agents), [Grok](../grok/agents), [model settings](../README.md#models-and-language) |
| CLI and management | [Root](../lib/cli/root.mjs), [TUI](../lib/tui/app.mjs), [operations](../lib/management/operations.mjs), [watch](../lib/watch/index.mjs) |
| Installation and routing | [Targets](../lib/installer/targets.mjs), [plans](../lib/installer/plan.mjs), [settings](../lib/installer/runtime-config.mjs), [install](../lib/installer/install.mjs), [remove](../lib/installer/uninstall.mjs), [transactions](../lib/installer/transaction.mjs), [bridge gates](../lib/runtime/role-dispatch-policy.mjs) |
| Maintenance checks | [Updater](../scripts/update-superpowers.mjs), [manifest](../scripts/update-manifest.mjs), [runtime copies](../scripts/update-runtime-assets.mjs), [harness tests](../tests/test_harness_contract.py), [Node tests](../tests/node) |
