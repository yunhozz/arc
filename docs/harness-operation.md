<a id="how-the-arc-harness-operates"></a>
# How the ARC harness operates

ARC combines an installation package and agent coordination instructions. Normative sources are [Claude Code](../claude/skill/SKILL.md), [Codex](../codex/skill/SKILL.md), [Gemini CLI](../gemini/skill/SKILL.md), linked references and role profiles. This guide explains contracts/current installer behavior without adding approval gates.

Scheduling/cumulative limits are **prompt-level policy**, not a spawn interceptor/sandbox. Native settings constrain their own sessions. Structural checks prove neither live compliance nor native settings taking effect in the current process. Verify application separately in supported new sessions.

<a id="what-arc-installs"></a>
## What ARC installs

The Node.js CLI validates/installs files. The conversation Orchestrator then routes requests, obtains approvals, assigns scope and accepts evidence. Installation itself starts no coordination workflow.

| Component | Claude Code | Codex | Gemini CLI |
|---|---|---|---|
| Root | Default `~/.claude`; conflicting `CLAUDE_CONFIG_DIR` rejected | `~/.codex` or `CODEX_HOME`; relative values resolve from CLI cwd | Default `~/.gemini`; any `GEMINI_CLI_HOME` value is rejected as unverified |
| Skill | `skills/arc/` | `skills/arc/` | `skills/arc/` |
| Five profiles | `agents/arc-*.md` | `agents/arc-*.toml` | `agents/arc-*.md` |
| Models/limits | `skills/arc/models.toml`, `skills/arc/limits.toml` | Same relative paths | Same relative paths |
| Managed instructions | `CLAUDE.md` | `AGENTS.md` | `GEMINI.md` |
| Native configuration | `settings.json` | `config.toml` | `settings.json` is preserved; ARC writes no native settings |

Installed roles are Scouter/Planner/Implementer/QA/Reviewer; Orchestrator uses the current conversation model, not a sixth profile. Active role settings are in the installed copies of [Claude Code models.toml](../claude/skill/models.toml), [Codex models.toml](../codex/skill/models.toml), or [Gemini models.toml](../gemini/skill/models.toml); edit them through the `Install / Update` role boxes. Models use schema v3: `version = 3` and five `[roles.<role>]` tables, each containing exactly `model` and its effort field. Legacy v1/v2 files are validated and converted to their active values; writes use v3 only. Codex uses `model_reasoning_effort`; Claude and Gemini use `effort`. Gemini accepts only `default`; its Markdown profile has no effort field.

`Mixed routing` lets each role use a participating platform and any model/effort pair in that platform's static catalog. The participant set **S = role platforms ∪ hosts** includes CLIs used as hosts even when no role runs on them. One participant means standalone; two or more mean composite routing, displayed as `Mixed (…)` with labels joined by ` + ` in display order (Claude, Codex, Gemini). All five roles may use the same platform while another participates only as a host. Claude, Codex, and Gemini are registered; Gemini participation remains gated by capability verification.

Platform homes and their parent directories must not be symbolic links; ARC refuses to install, publish or take routing locks through them.

The **anchor** is the participant with the minimum `anchorOrder`: Claude 0, Codex 1, Gemini 2 (`claude > codex > gemini`). Display order is also Claude, Codex, Gemini. The active file is `<anchor home>/arc-role-platform-routing.json`; the routing lock and `<anchor home>/arc-role-dispatch/` store also live there. New active configurations always use schema v2 with an explicit, anchor-ordered `platforms` list. The installer can read historical v1 configurations for migration; runtime activation still requires the current anchor and matching installed bytes. Each participant gets an `arc-role-platform-routing.prepared.json` marker pointing to the active file and separate `agents/arc-routing-*` profiles for its assigned roles; a host-only participant has an empty marker profile map. Runtime commands discover the anchor through the host marker and revalidate the active configuration and every participant's marker under the anchor lock. These markers do not prove CLI login or actual execution permissions, model, or effort. `Apply` publishes; start a new session on that host to load new profiles.

New dispatch leases always use v2 and record `targetPlatform`, taken from the assigned role's platform. The target must belong to the active configuration's participant set: native targets equal `hostPlatform`, bridge targets differ. Run, observe, resume, and cancel derive the target from the lease. Read compatibility for v1 leases is limited to historical Claude/Codex hosts: native targets are the host; bridge targets are the other member of that pair. A v1 lease with another host is `activation_unverified`.

The home status labels `Available`, `Not Available`, `Incomplete`, `Unauthorized`, and `Not verified` distinguish installation state from local CLI authentication. Codex authentication is checked by refreshing the login token through `codex app-server` (`getAuthStatus`), both on the home screen and for composite routing; this needs network access and rotates the tokens in `CODEX_HOME/auth.json`. A refresh that is permanently rejected is `Unauthorized`, and a check that cannot decide is `Incomplete`, never `Available`. Claude authentication uses `claude auth status`. Gemini uses `auth.kind: none`: status is `unknown` without an authentication probe. Once its required capability, CLI/version, and catalog gates pass, composite participation is allowed with `auth unverified` warnings (including `(auth unverified)` in Hosts). Unknown authentication from an existing Codex or Claude probe still blocks participation.

Model and effort choices come from packaged static Claude, Codex, and Gemini catalogs (`lib/models/static-catalog.mjs`, used by `lib/management/operations.mjs`), with no model-list API call or API key. These are candidates only: they do not prove availability for an account, CLI version, or provider. A saved model/effort pair absent from the catalog remains visible and must be reselected before applying new settings.

Composite role execution support is per environment and per role. Publishing the configuration starts nothing; `routing-status` reports each role's route, profile, authentication and CLI versions. Support grades below describe Claude/Codex routes; Gemini gates are listed separately:

| Environment | Grade |
|---|---|
| `claude-cli` host | Supported: native routes and Codex bridges (Codex bridge limits below apply) |
| `codex-cli` host | Native routes supported; on a Codex host every runtime command, native routes included, needs per-call escalation approval because each may write `CODEX_HOME`. Claude bridge `arc_scouter`, `arc_planner` and `arc_reviewer` run only after the user approves escalation for each call (G2 is recorded as `escalation`): writes to `CODEX_HOME` are denied in the Codex host sandbox, so without approval, or when a write is still denied, the result is `host_sandbox_blocked`; the runtime does not check the approval, so asking for it before every runtime command is an Orchestrator obligation; detached supervisor survival itself was observed under variant conditions. Claude bridge `arc_implementer` and `arc_qa` on a Codex host stay held as `permission_scope_unverified` because the injected sandbox is not verified (G1). A completed Claude bridge reports `supportStatus` `verified` only when every claim is runtime-observed |
| `claude-desktop`, `codex-desktop` | Every role (native and bridge) is held as `environment_unverified` in this release; `supportStatus` is capped at `unverified` |

Choosing executionEnvironment: Choose `executionEnvironment` by where the session actually runs: a terminal CLI or TUI session, including one in an IDE integrated terminal, is `codex-cli` or `claude-cli`; use `codex-desktop` or `claude-desktop` only when the session is confirmed to run inside the Desktop app. NEVER infer the environment from paths or directory names (for example `~/Desktop/...`). When unsure, declare the CLI value.

`executionEnvironment` is declared by the caller and not verified by the runtime; declaring a CLI value from a Desktop session bypasses the Desktop hold, so declare the Desktop value whenever the session is confirmed to run inside the Desktop app.

Claude and Codex bridge CLI versions are not restricted; the probed version is reported for information only and never holds those bridges. Gemini availability uses its registered supported-version range. Re-delegation of a Codex bridge child is not blocked; a spawn found afterwards in its rollout fails the dispatch as `delegation_observed` (G3). Codex `workspace-write` bridge children may write outside the worktree, which post-run detection does not cover (G5). A bridge `supportStatus` is `verified` only when all five claims are `runtime-observed`; a Codex bridge never qualifies because its `permissions` claim is capped at `operator-attested` (`user-config-mcp-not-controlled`: the child loads the user's Codex configuration, including MCP servers, which ARC does not control). Post-run detection compares changed paths, `HEAD`, the branch and every Git ref (creation, deletion or movement is a violation); changes to Git-ignored paths are not detected. Bridge children carry `ARC_BRIDGE_CHILD` and routing commands are denied in such a process, but re-running `codex exec` or `claude -p` through a shell is not detected as `delegation_observed`.

Desktop manual checklist. This release has no way to record it and every role (native and bridge) on Desktop stays `environment_unverified`; the list is the set of manual checks a future ARC update would need before it may change the support status: host CLI discovery (the same `claude` and `codex` executables the CLI would use are found), authentication sharing (the Desktop session and the CLI use the same authentication home), same worktree (all roles use the identical checkout), supervisor survival (a detached bridge supervisor keeps running after the command returns), escalation (approval prompts on a Codex host are granted each time), native tag check (the `[arc-routing rev <revision>]` tag in the agent list equals the `routing-status` revision in a new session).

`cooperative-9` migration: This version no longer holds Codex-host bridges in advance as `host_sandbox_blocked` (G2 is recorded as `escalation`; every call still needs explicit escalation approval), and documents how to choose `executionEnvironment`, including a release condition for `environment_unverified` that points to the CLI value. The runtime version changed, so existing prepared markers no longer match and routing reports `activation_unverified` until Install / Update is run again for all participants. In-progress cooperative workflows keep their recorded `state.versions`. When the runtime or policy version differs, every plan-mode command of an existing workflow, including status, holds with `cooperative.versions` ("Policy or runtime changed"); only results are recorded, and `versions-changed` stays in unresolved. There is no automatic migration of workflow state and no renewal of approvals: finish or hand off in-flight workflows before updating, or start a new workflow with fresh evidence and approvals afterwards. Active bridge dispatches block publishing; finish or cancel them first. Leases left in `unknown` or a `starting` state without a supervisor need manual cleanup under `<anchor home>/arc-role-dispatch/`; nothing is deleted automatically.

### Gemini capability and permission gates

Gemini `install`, `nativeProfile`, `catalog`, and `standalone` in `lib/runtime/platform-registry.mjs` are verified by live evidence ([install](superpowers/evidence/gemini/install-2026-11-16.md), [nativeProfile](superpowers/evidence/gemini/nativeProfile-2026-11-16.md), [catalog](superpowers/evidence/gemini/catalog-2026-11-16.md), [standalone](superpowers/evidence/gemini/standalone-2026-11-16.md)); the other five capabilities remain `off`: `bridge`, `compositeRole`, `compositeHost`, `authProbe`, and `watch`. The home screen shows `Not Available` when the CLI is missing, `Unsupported version` outside the supported range, and `Available (auth unverified)` otherwise; role and Hosts selection show `Unavailable  (capability not verified)`. Explicit management installation with `target:'gemini'` is available, and `target:'all'` includes Gemini because its `install` and `standalone` capabilities are verified. TUI Uninstall can still remove existing Gemini files through its individual row; `settings.json` is preserved. Everything uses the same verified-platform filter as management `target:'all'`, so it can leave off-platform files behind. Static assets and fake-CLI tests prove no live support.

Runtime prepare and run recheck the host's `compositeHost`, the target's `compositeRole`, and the target's `bridge` for bridge routes. An off capability holds as `capability_not_verified`: `Update ARC to a release that verifies this platform capability.` This prevents manually edited or stale configuration from bypassing installer gates.

GG1 and GG2 in `BRIDGE_GATE_RESULTS` currently equal `fail`. GG1 holds Gemini bridge Implementer and QA as `permission_scope_unverified` until a future ARC release records verified enforcement of the writing-role policy, approved scope, and sandbox (including Gemini home/session writes), and GG1 is recorded as `pass`. GG2 holds Gemini-host dispatches, native and bridge, as `host_sandbox_blocked` until anchor-home writes, lock/store access, and detached supervisor survival are verified and the gate is recorded as `pass`. Passing a capability gate alone releases neither hold. No automatic fallback disables the sandbox or uses `--yolo`.

Gemini role permissions are checked only after the fact, and only within the git-visible worktree. The snapshot detects tracked/untracked changes except Git-ignored paths, and HEAD, branch, and ref changes. For read-only Gemini bridges, the `permissions` claim is `runtime-observed` from `worktree-snapshot`, with details `git-visible worktree only`. It proves no prevention of writes outside the worktree, changes to ignored files or non-ref Git internals, changes reverted before exit, network/API/MCP effects, or secret reads. Native Gemini permissions remain an `operator-attested` `prompt-contract`.

Gemini bridge effort stays `default` and its effort claim remains unverified without holding solely for that reason. The bridge implementation has `resume: 'off'`: resume holds as `resume_unverified`, with release condition `Update ARC after verifying Gemini session resume against the recorded session UUID.` Verify UUID-based resume or an ARC-preserved session file in a future release before enabling it; never substitute `latest` or a session index. A resumed session ID mismatch is `execution_identity_unverified`.

Capability promotion requires live evidence from an authenticated Gemini CLI, run by the Orchestrator in the user environment. In dependency order, verify install → catalog → nativeProfile → standalone → bridge → compositeRole → compositeHost. Keep `authProbe` and `watch` off while their contracts remain unsupported. Record each result in `docs/superpowers/evidence/gemini/<capability>-<date>.md` (`date` is `YYYY-MM-DD`): capability, CLI version, OS/host, ARC commit, full redacted command, observed output/session/model, result hash and write-detection results, pass/fail reason, executor, and time. Exclude tokens, account emails, and other personal data. A promotion commit must contain the descriptor change, passing evidence, and a regression test; insufficient evidence leaves the capability off. Supported versions are `>=0.68.0 <0.69.0`; adding another minor requires fresh live evidence for every verified capability. Bridge verification covers run/observe/cancel on Claude and Codex hosts, while resume and GG1/GG2 need their own verified evidence.

Installation preserves bytes outside `arc:begin` / `arc:end`. Codex wait settings merge into supported standalone `[features.multi_agent_v2]`; unsupported structure receives manual guidance. Native concurrency writes integer `[agents].max_concurrent_threads_per_session` for Codex and string `settings.json.env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` for Claude, preserving unrelated settings.

Static references include brainstorming/writing-plans/test-driven-development, related Markdown/mockups/license/provenance. Repository/package sources keep Superpowers-derived static references (Markdown/mockups/license/provenance) in `shared/skill/references/` (scripts/HTML in `shared/skill/references/scripts/`), platform-specific references in `<platform>/skill/references/`, and the cooperative runtime copy in `shared/skill/runtime/` (generated from `lib/runtime` by `scripts/update-runtime-assets.mjs`); installation composes references and runtime into each platform's `skills/arc/references/` and `skills/arc/runtime/`, respectively. Existing shared/global skills/links are separately preserved. Source packages have no npm install hook. Published artifacts have informational postinstall only. npm installation neither downloads/installs the harness nor connects TTY/changes shell. It prints `Run arc to install or manage the ARC harness.`

<a id="installation-and-refresh-lifecycle"></a>
## Installation and refresh lifecycle

1. `arc` opens the English TUI when both streams are TTYs. Public syntax: `arc`, `arc watch`, `arc --help`, `arc --version`. No-argument non-TTY and other commands/options exit 2 without controlling-terminal reconnection. Help/version/watch require no native installer.
2. Home actions: `Install / Update`, `Check Version`, `Uninstall`, `Exit`. Statuses appear separately in display order; `Mode:` shows `Mixed (…)`, installed standalone labels, `Not installed`, or `Unverified`. `Install / Update` opens the role diagram immediately; edit roles, `Hosts`, and `Settings`, then `Apply`. `Back` returns from the diagram to home; Esc returns home (and exits from home). Details below.
3. Preparation validates payload/settings/paths and snapshots them. Execution revalidates and stops on drift. Selected package determines reference revision.
4. Install verified platform-local bytes. Install/reinstall/upgrade never collects Superpowers, queries its latest revision or runs updater. Imported Markdown/mockups stay unchanged.
5. Report target transaction/rollback/residual recovery paths. Later target failure preserves earlier success. Settings apply in new agent sessions.

TUI stays English regardless of harness language. `Workflow`/automatic platform integration share the internal runtime endpoint. TUI inspection proves no workflow approval. `Check Version` displays `<current> → <latest>` and `Upgrade`/`Back` when an upgrade is available. A resolved latest version that is equal or older shows `Up to date (<current>)` and `Back`. Lookup failure shows `<current> (latest unavailable)`, the first error line, and `Back`. Enter revalidates package identity/npm context/installed state then applies the exact displayed version without requerying latest. Equal/older/unavailable versions offer no upgrade. Success shows `Upgraded to <version>.` Escape returns home. Global replacement ends the session; npx runs pinned payload without replacing global CLI. Same-version refresh uses `Install / Update`. If CLI cannot start, run `npx --yes @yunhozz/arc@latest`.

### Diagram, editor, Hosts, and Settings

Role boxes put the role name on the top border and the platform, model, and `effort: <value>` inside. The selected border blinks; a blocked role has ` !` after its name. Navigation follows Scouter, Planner, Implementer, QA, Reviewer, `Hosts`, `Settings`, `Apply`, `Back`. `Mode:` previews the mode derived from S; the first blocking reason appears below it. Compact terminals show one row per role with the same information and controls; below 40 columns or 16 rows the viewport guard asks for more space.

Initial values reuse a session draft first. Otherwise a current composite supplies its roles and hosts=S. With standalone installations, the first installed platform in display order supplies installed `models.toml` values and is the sole host. With no installation, choose the first platform passing the initial role availability check, falling back to the first registered platform (Claude), and use package defaults with that platform as host. This initial choice precedes catalog loading; a later catalog failure blocks Apply without automatically choosing another platform. An unverified state still opens the diagram with `Mode: Unverified`; Apply stays blocked.

Enter on a role opens one screen with `Platform`, `Model`, `Effort`, `Done`, and `Back`. Left/right cycles available platforms, catalog models, or efforts supported by the model. Enter on Platform opens the platform list in fixed display order; unavailable rows cannot be selected and show their full reason in the info area. Enter on either Model or Effort opens the model selection flow followed by effort selection. `Done` saves to the diagram draft; `Back` discards that role's edits. Changing platform resets model/effort to that role's installed defaults, or package defaults if absent; a pair missing from the catalog falls back to its first pair. Changing model resets an unsupported effort to the first supported effort. Reset fields show `(reset)` until edited. An unavailable current platform still allows model/effort editing unless its catalog failed.

`Hosts — CLIs you will work in` lists registered platforms in display order. Enter toggles a checkbox; `Done` applies the selection and `Back` cancels. Platforms used by roles stay checked and locked as `(used by roles)`. Unavailable hosts cannot be added but can be unchecked if already selected; the info area shows the reason. S always includes role platforms, even if no optional host is selected. Composite role and host participants require verified capabilities, a discovered CLI, supported version, authentication, and a ready catalog. Standalone installation requires install/standalone capabilities and a ready catalog, without requiring CLI authentication. Gemini authentication is `unknown` and warns `(auth unverified)` without blocking by itself; capability and other availability gates still apply. Unknown authentication from a Codex or Claude probe blocks composite participation.

The diagram initially loads catalogs only for S; opening a role editor also preloads catalogs for selectable platforms and the current platform. Catalog errors leave the diagram accessible and block Apply only when the failed platform participates. `Settings` contains `Language`, `Total subagents`, `Concurrent subagents`, and `Back`. Language cycles `EN`/`KR` with left/right or Enter; limits use positive whole-number input. Values that differ across S show `(mixed)`. Unchanged mixed fields are omitted from preparation so each platform keeps its value; edited fields apply across S. Uninstalled platforms contribute defaults of English, 100 total, and 5 concurrent. The TUI always includes managed instructions and native settings (`skipGlobal:false`); non-TUI management options retain their existing meaning.

`Apply` rechecks the derived gates. A blocked participant keeps the diagram open and highlights its reason. For an unverified installation, Apply cannot prepare an operation; after participant gates pass it opens `Operation unavailable` with `No changes were applied.` Management validation and the TUI's `Operation unavailable` page list the known residual paths as `Residual path: …`. Otherwise Apply prepares and executes directly, with the standalone switch confirmation below as the exception.

### Installation mode transitions

Successful `Mixed (…)` publication removes owned standalone profiles in S and keeps per-role `arc-routing-*` profiles, every participant's marker, and the active configuration in the anchor home. A failed publication transaction restores the original bytes, including standalone profiles. Role profiles render from the payload, selected role values, and each platform's language settings.

With S={P}, Apply installs or updates P alone and leaves other standalone homes untouched (D1-a). If the current mode is composite (D1-b), Apply first opens `Switch to <Label>` with `Mixed routing will be turned off.`, `Continue`, and default `Back`. Confirmation changes no files by itself. On Continue, execution removes composite files and restores standalone profiles in one transaction, only in homes containing `skills/arc`. The selected operation is then prepared again and executed; if it fails, the restored standalone installations remain.

With two or more participants, Apply installs S in anchor order and publishes at the anchor (D1-c), or republishes there if S is unchanged (D1-d). A changed participant set (D1-e) uses the diagram's Mode preview without another confirmation: added participants are installed; one routing transaction removes departing participants' routing files, restores their standalone profiles, and publishes the new configuration and markers. Departing homes retain their ARC installation. If the anchor moves, acquire both old and new anchor locks in ascending anchor order and release in reverse. Any non-terminal lease in either dispatch store, native or bridge, holds the move before installation or publication. The routing transaction writes the new active file and markers and removes the old active file, even if the old anchor remains a participant. Dispatch history is neither moved nor deleted; the result says `Dispatch history stays in <old home>/arc-role-dispatch.` Lock release failures report the lock paths as residuals.

Uninstall of a composite participant also shows the turn-off notice, deactivates composite mode, then removes the selected platform. Other participants remain standalone installations. Full uninstall passes the active path in the anchor home to the removal plans and locks that home, without a separate switch. In composite mode, npm upgrades neither create standalone profiles nor modify leftover standalone profiles. Run `Install / Update` again after upgrading to refresh routing.

Standalone profiles are overwritten or removed only when they are regular files with the matching role name and role contract marker. Unverified profiles are preserved and reported as `Residual path:` entries. Unverified composite files block publication, deactivation, and switching. Routing remnants without an active file, conflicting active files, mismatched markers/profiles, or an unresolved participating home produce an unverified mode; unrelated unresolved homes do not invalidate a verified participant set. Active bridge dispatches also block publication and deactivation; anchor moves additionally check all non-terminal leases in both stores.

### Legacy anchor migration and held recovery

A legacy composite has exactly one active configuration in the Codex home, using historical schema v1, and passes every remaining participant-home, marker, profile, residual-path, and non-overlapping-home check. The installer reports `mode:'composite'`, `legacyAnchor:true`, and anchor `codex`; the home and diagram still show `Mixed (Claude + Codex)`. A Codex-home v2 file, multiple active files, or any failed consistency check is unverified, not legacy.

After upgrading, run `Install / Update` and `Apply` (or publish with management `target:'composite'`). Status says `Mixed routing will move to the Claude home on the next Install / Update.`; the preview says `Mixed routing files will move to the Claude home.` No extra confirmation is added. Management preparation reports `anchorMove:{from:'codex', to:'claude'}`.

1. Acquire the old and new anchor locks in ascending anchor order (Claude, then Codex).
2. Check both stores for all non-terminal leases, native and bridge. Any such lease returns `activation:'held'` and `activeDispatches`, with `Active dispatches: <ids>`, before installation or publication. Finish or cancel those dispatches, then apply again. Lost supervisors, unreadable/corrupt leases, and uncertain exit need inspection and manual cleanup in the reported anchor-home store; nothing is automatically released or deleted.
3. In one routing transaction, write the v2 active configuration in the Claude home, repoint every participant marker, and remove the old Codex-home active file. Participant-set changes can share this transaction.
4. Leave previous dispatch history in the Codex home. The result says `Dispatch history stays in <old home>/arc-role-dispatch.` Release locks in reverse order. Inspect reported residual paths if recovery is incomplete; a restored rollback leaves the legacy layout available for a later apply.

Runtime does not activate the legacy layout and reports `activation_unverified`; run Install / Update again after upgrading. It does not read the old store after migration. Legacy deactivation or Uninstall can still use the old Codex anchor without moving it. After migration, older ARC versions may report unverified or standalone mode because the old active file is gone; to use composite after downgrading, run Install / Update in that older version. Dispatch history created before an anchor move stays in the old anchor home.

### Watch

`arc watch` reads Codex rollout JSONL, Claude Code transcripts (including persisted bridge transcripts), and ARC dispatch leases and artifacts. It defaults to the current Git worktree, or the current directory outside Git; `--cwd`, `--all`, `--session` and `--platform` select scope. Running from a subdirectory watches its entire worktree. Other linked worktrees, including nested ones, are excluded. Shared dispatch artifacts require a matching workflow target or a followed session; dispatches with no identifiable worktree are available with `--all` or `--session`. Each event line is scoped by its session's working directory at that line (Claude `cwd`; Codex `session_meta`, `turn_context` and `thread_settings_applied` cwd, not per-command workdirs); sessions that move between worktrees start or stop appearing, and subagents are scoped by their own working directory while keeping parent-based labels. With `--all` or `--session`, subagents follow their tracked parent. Descendants of Codex Desktop sessions stay excluded. Codex Desktop sessions are excluded.

At startup, watch resolves homes in anchor order and reads prepared markers without locks. It accepts each marker's active-file directory only when it exactly matches a resolved registered home, then deduplicates candidates. One candidate selects `<anchor home>/arc-role-dispatch/`; no candidates use the Codex-home legacy store when available. Multiple candidates suppress dispatch-store reading and show `dispatch store ambiguous`; session and workflow-artifact sources remain available. Watch does not merge history left in the old anchor home. Gemini session discovery and conversation display are unsupported. Gemini dispatch leases/artifacts in the selected store use the existing unknown-platform behavior without a Gemini platform label.

Dispatch thread/init events and saved session IDs map bridge activity to role and dispatch labels; missing transcripts leave dispatch events visible. Codex-host bridges appear once they run after per-call escalation approval; a refused approval is `host_sandbox_blocked`, and Claude bridge Implementer and QA stay held as `permission_scope_unverified`; without a lease there is no dispatch to display.

The stream is read-only: no CLI execution except restricted Git discovery and `git ls-files -z --cached --others --exclude-standard`, no network requests, and no changes to homes, repositories or artifacts. Shell change detection reads only the Git file list and `lstat` metadata, never file contents. Tool and command outputs are never shown. Reasoning appears only with `--verbose`; common secrets are masked, but masking is not complete. `--json` uses the same content policy. Signals stop the watcher immediately with exit 0; after a pipe reader closes, it exits with 0 on its next output.

Human output uses `HH:MM:SS <platform> <KIND> <text>` without a session label column. User and agent messages are shown in full, preserving newlines and indentation; continuation lines are indented by the prefix width, and blank lines stay empty. On a TTY, or when `--width` is supplied, messages and file lists soft-wrap by display width, preferring the last fitting space (which is discarded) or splitting at a grapheme boundary when none fits. Wrapping is disabled when fewer than 20 body columns are available. Continuations start at the body column without repeating the original indentation. Non-TTY output without `--width` does not wrap. `EDIT`, `CREATE` and `DELETE` show optional text and each path on separate lines, preserving input order without a path-count limit. Paths inside the session's repository or worktree start with its root folder name (for example, `arc/docs/harness-operation.md`), even when the session cwd is a subdirectory. Outside Git, the session cwd is the root. Root aliases such as `/tmp` and `/private/tmp` are recognized via realpath. Paths outside the root stay absolute, relative paths stay unchanged, and JSON keeps absolute paths unchanged. Other events use one line, clipped to `--width`.

Tool events with a `skill` use the `SKILL` tag; those with only a `plugin` use `PLUGIN`, and those with neither use `TOOL`. Failures keep `TOOL!`. The `SKILL` body is `<skill>` only; skill args are not shown; the `PLUGIN` body is `<plugin> <tool>`. Skill failure bodies are `Skill <skill>`. These use the one-line rule. The `SKILL` and `PLUGIN` lines do not show skill definition contents, `SKILL.md` or `Base directory` paths, or MCP arguments and results.

In default mode, a successful Codex command containing only skill reads emits `SKILL` once per skill per turn instead of `CMD`; rereading an already announced skill emits neither. `--verbose` also shows `CMD`. Commands mixing skill reads with other commands retain `CMD` after any new `SKILL` events; failed commands show only `CMD(n)`.

Codex structured file changes distinguish `CREATE`, `EDIT` and `DELETE`; JSON uses `file_create`, `file_change` and `file_delete`. Claude Bash calls keep their `CMD` event and additionally emit `DELETE` after a successful literal `rm` result. Quoted paths, common non-interactive removal flags, `--` and a single `cd <path> && rm ...` prefix are supported; relative paths use the command cwd. Failed, interrupted or background calls and commands with expansions, wildcards or other shell expressions do not produce these literal-command deletion events. Literal-command parsing reports successful command targets, not a filesystem audit; for example, `rm -f` can succeed for an already absent target.

Independently of command parsing, transcript activity in a Git repository schedules a comparison of the Git file list and `lstat` fingerprints (`mtimeMs:size:ino:mode`). A baseline is recorded at attachment without emitting changes; history replay does not trigger a scan or record tool-path claims. Scans wait about one second after activity, run no more often than every three seconds per root, and also run during continuous activity once it has been pending for three seconds and the minimum scan interval has elapsed. At most two roots are scanned per tick, in rotation. New, changed and missing files emit `CREATE`, `EDIT` and `DELETE`, with every affected path listed, including bulk changes from checkout or similar operations. A path reported by a live tool file event suppresses at most one inferred report of that path within two minutes. A claim is consumed only when it suppresses an observed create, change or delete; unchanged paths retain their claims until they are older than two minutes at scan start. Claims arriving after scan start are left untouched for a later scan. Inferred changes are attributed to the most recently active session still being followed in that root. Human output has no inference marker; JSON adds `inferred:true`. Detection stops for a root after more than 20000 listed files or three consecutive `git ls-files` failures, with one notice visible even without `--verbose`: `shell change detection off for <root>: more than 20000 files` or `shell change detection off for <root>: git ls-files failed 3 times`. A listing exceeding the buffer limit or a listing timeout counts as a failed `git ls-files` run toward the three-failure disable.

Shell change detection is observation, not an audit. Concurrent sessions can cause incorrect attribution, external editor changes can be included, untracked files excluded by `.gitignore` are not detected, and tool file events arriving after a scan can duplicate an inferred report. Changes preserving all fingerprint fields can be missed. Sessions outside Git repositories have no shell change detection. Symlinks are compared using their own metadata and directories are excluded. Missing paths are treated as deletions; other `lstat` errors retain the previous fingerprint for that round. Detection tracks at most 32 repository roots.

Agent messages always use the `AGENT` KIND tag. When `role` is `scouter`, `planner`, `implementer`, `qa`, `reviewer` or `orchestrator`, the first body line starts with `[Scouter] `, `[Planner] `, `[Implementer] `, `[QA] `, `[Reviewer] ` or `[Orchestrator] `, respectively. This prefix counts toward the soft-wrap width and is not repeated on explicit or soft-wrapped continuation lines, which start at the body column. In color output, only the role name inside the brackets is bold (SGR `1`); the brackets and message retain the existing body color. Without color, the prefix is plain text. Non-ARC agents, sessions and bridges without a role have no prefix, and empty messages show only the tag. JSON retains the original `role` and message text. Other KIND tags never include a role. The KIND column has a minimum width of 8; longer tags have one following space, and continuation indentation follows the full prefix width.

A spinner on the last line shows while a followed session has a turn in progress (TTY human output only, including with `NO_COLOR`); a Claude Esc interrupt ends the turn (shown as `END interrupted by user`), and it clears after five minutes without activity.

Ctrl-L clears the screen and scrollback (`ESC[H ESC[2J ESC[3J`) in TTY human output; raw mode is restored on exit, and Ctrl-C still stops the watcher.

Colors are enabled only for TTY output without `NO_COLOR`, and never for `--json`. Platform columns show `CODEX` and `CLAUDE` in uppercase and use `36` (cyan) for Codex, `38;5;208` (orange) for Claude and `2` (dim) for watch/ARC. KIND colors cover the entire tag, including parentheses, but exclude padding spaces:

| KIND | ANSI SGR |
|---|---|
| `USER` | `1;35` |
| `AGENT` | `32` |
| `CMD` | `38;5;242` |
| `EDIT` | `33` |
| `CREATE` | `38;5;69` |
| `DELETE` | `31` |
| `TOOL` | `2` |
| `SKILL` | `38;5;110` |
| `PLUGIN` | `38;5;175` |
| `SPAWN` | `38;5;141` |
| `DISPATCH` | `38;5;137` |
| `APPROVE` | `1;4` |
| `FAIL`, `ERROR`, `TOOL!` | `31` |
| `SESSION`, `END`, `NOTICE`, `SETTINGS`, `TURN`, `THINK`, `ITEM` | `2` |

Bodies use their KIND color without bold or underline attributes: `USER` bodies use `35`, `APPROVE` bodies have no color, and failure bodies stay red (`31`). Each nonempty message or file-list fragment, including soft-wrapped continuations, is colored separately; indentation is not colored. KIND tags never use the platform cyan or orange. There is no fallback for terminals without 256-color support. One-line events other than `EDIT`, `CREATE` and `DELETE` whose prefix exceeds `--width` are printed without color.

Messages have terminal escapes and controls removed, line endings normalized, tabs expanded to four spaces, trailing whitespace and outer blank lines removed, and secrets masked across the full text (including multiline PEM blocks). JSON stays at schema `v:1` and keeps the existing `label` field. All reported `paths` are retained without a fixed count limit; normalization only deduplicates paths. File events inferred from a Git file-list and `lstat` comparison include `inferred:true`; ordinary file events omit it. User and agent `text` preserves newlines without a length limit or a `truncated` field; other kinds collapse whitespace, cap `text` at 1000 code points and set `truncated:true` when clipped.

Files are polled every 500 ms, discovery every 2 seconds, and worktree exclusions every 30 seconds (a nested worktree first seen in a session line is excluded immediately). Tracking is limited to 64 files, 1 MiB per file per tick, 256 KiB of history per session, 64 KiB latest-cwd probe per file (a Codex session without a turn cwd in its last 64 KiB is judged by its session_meta cwd), 4 MiB per line, 30 minutes of inactivity and 32 repositories in all-scope mode. Merge order is per tick, not globally guaranteed. A transcript truncated and regrown past the previous read offset between polls is not detected.

Install/update/uninstall remove valid old ARC management completion blocks and add no registrations. Status never edits shell files. Preserve user settings and block-external content.

| Operation | Publication/recovery boundary |
|---|---|
| `bash scripts/update-superpowers-local.sh` | Ignored wrapper calls tracked `node scripts/update-superpowers.mjs`. One acquired revision updates both mapped platforms/static manifest together. Failure restores previous files/manifest; cleanup may report residuals. No completion registration |
| Participating TUI targets | Installation runs independent transactions in anchor order (Claude, Codex, Gemini); removal normally runs in display order (Claude, Codex, Gemini), with the active composite anchor removed last. Later failure preserves earlier success. Check per-target status and residual paths |
| `Mixed (…)` configuration | After rechecking participating installation results, authentication, and catalogs, publish profiles and prepared markers under the anchor lock (both anchor locks for a move), then replace the active file last. Failures before publication do not publish a new active revision; report paths when recovery state is unclear. If the previous active file remains but no longer matches the actual files, role execution remains held |

`superpowers-provenance.json` records revision/time/original-path hashes/relative links. It proves local consistency, not upstream authenticity or protection from malicious local rewriting. Git/network are needed only for explicit maintainer updater use. npm/`npm --ignore-scripts`/ZIP/plain clones/harness install-upgrade use packaged static references. Read-only packages are supported.

`scripts/update-superpowers-local.sh` is current-worktree-only, ignored by exact `/scripts/update-superpowers-local.sh`, absent from Git/npm/releases and not created in other clones/worktrees. Tracked updater owns acquisition/validation/flat mapping/publication/manifest/recovery. Verified source checkouts may retain this exact local regular file outside protected/installed payload; packaged artifacts reject it. Concurrent refresh/install/remove against one target is unsupported.

Use executable `./scripts/update-superpowers-local.sh` to refresh both vendored platforms/manifest. It calls the adjacent tracked updater, also works by absolute path elsewhere and forwards arguments/stdout/stderr/status unchanged. Prepare the wrapper separately per clone/worktree.

Reinstallation replaces managed profiles/local model edits without persistent backup. Omitted limits preserve valid policy or use 100 total/5 concurrent. TUI preserves each target by default; explicit values apply to all selected targets. Malformed policy/config stops installation. Native/stored concurrency mismatch needs explicit TUI selection before replacement. Skipping global settings omits instructions/native settings/shell access for that operation, not earlier changes.

<a id="request-routing-and-role-responsibilities"></a>
## Request routing and role responsibilities

Simple questions stay with Orchestrator; material/static research goes to Scouter; design/spec/plan/brainstorming drafts to Planner; implementation/configuration/tests to Implementer except approved low-risk direct edits. Mixed dependent documentation follows implementation ownership. Standalone writing is not automatically design/spec/plan.

| Role | Return to Orchestrator |
|---|---|
| Scouter | Sources/facts/evidence/uncertainty, no edits |
| Planner | Complete drafts/criteria, no implementation |
| Implementer | Scoped changes/checks/limits, no self-acceptance |
| QA | Independent criterion evidence/gaps, no edits |
| Reviewer | Final source/diff correctness/facts/security findings, no edits |

Specialists report at depth 2 without delegation. Orchestrator owns coordination/approval/integration/acceptance/Git. Returns/notifications are evidence, not acceptance/dependency release. Codex uses `arc_scouter` / `arc_planner` / `arc_implementer` / `arc_qa` / `arc_reviewer` and native waits. Claude uses hyphenated names and foreground/background completion. These differences are intentional.

<a id="design-and-preparation"></a>
## Design and preparation

Depth and verification risk are separate. Unclear risk needs investigation/stronger checks.

| Path | Approval |
|---|---|
| Spike | Question/method/scope/criteria/constraints; separate probe-only from specified combined implementation |
| Bounded | Short design, required spec by judgment, plan when scope needs it |
| Architectural | Design → written spec → implementation plan |

Planner drafts, Orchestrator obtains approval before dependencies. Plan omission requires one local change, no dependent stages/cross-component shared state/lifecycle/integration-order concerns and one focused path, not apparent smallness.

Order: initial design approval → explicit target → preparation/verification → required spec draft/save/self-review/individual approval → required plan draft/save/review/individual approval → full set → verify existing commits/batch remaining approvals → final Git → Implementer. Required specs precede dependent plans. Omissions skip inapplicable document stages only with reasons. Complete docs precede staging/commit/handoff, not initial preparation. Plan approval selects no target.

Approved-documents/preparation/handoff summaries never replace this order. Both platforms offer current checkout, new task branch, or new managed worktree and task branch; only creation differs: Codex uses its app tool, while Claude uses `git worktree add -b <branch> .claude/worktrees/<name> <full-sha>` followed by `EnterWorktree({path})`. Branches share files, worktrees separate directories. Verify repository/common directory/registration/source preservation/transfer evidence. Preserve unrelated changes/ownership.

<a id="instruction-provenance-and-visual-evidence"></a>
### Instruction provenance and visual evidence

Briefs separate user/discovered/installed/input sources, applicability/version-approval/access. Applicable user instructions remain valid without root AGENTS.md. Missing required material/conflicts hold dependencies.

Visual work gives Implementer/fresh QA exact approved source/version/approval/access, IDs/properties/method and actual output identity/revision/basis. Self-report never replaces comparison. Supported criteria are `pass`, visible differences `mismatch`, missing access/linkage `unverified`. Record historical differences/linkage separately without current-branch UI inference. Return unapproved interpretations/substitutions.

Approved TUI mockups/attachments in reliability review compare past examples only. ARC-mark differences and linkage limits are separate, neither UI-change authority. Static instruction parity is not execution. Synthetic `Claude.app` prompt observation is not `Claude Code CLI` verification. Unavailable tools/unobserved behavior stay unverified.

<a id="approval-reuse-and-completion-continuity"></a>
### Approval reuse and completion continuity

Specific requests may approve their scope. Confirm outcome/constraints/depth/risk from requests/explicitly referenced explanations; record basis/criteria. Restating/handoff/restart needs no duplicate. Silence/ambiguity/other-task/broad vague improvements are insufficient. Required spec/plan approvals remain separate.

Probe-only ends with evidence/limits/uncertainty, including supported infeasibility, never product retention/implementation authority. Explicit specified Bounded probe+implementation uses internal investigation without new report-time approval; continue already approved work. Unknown implementation is not automatic authorization.

Material scope/method/risk changes/new decisions/target/ownership/state/failure/missing inputs hold affected work. Routine corrections need no duplicate approval. Revalidate then continue execution→correction→checks→risk-scaled QA/Reviewer→disposition→acceptance→report. Notifications/findings/passing commands alone never complete remaining scope.

Canonical records include versions/path/branch-dettached HEAD/HEAD/index/worktree/untracked/ownership/choice/document commits/readiness/checks. Implementer trusts verified facts and reads `unchanged`; inaccessible records/actual conflicts block. Follow [Codex handoff](../codex/skill/references/handoff.md), [worktree](../shared/skill/references/handoff-worktree.md), [Claude handoff](../claude/skill/references/handoff.md). Reuse valid approvals/targets and record omissions. Material changes wait for revised approval.

<a id="scheduling-and-limits"></a>
## Scheduling and limits

Before dispatch record explicit/implicit dependencies, inputs/outputs/contracts/resources/files/conflicts/checks/ready batches/holds. File names prove no independence. Ready needs full approvals/preparation/inputs/contracts, predecessor evidence/acceptance/verified commit or no-change, ownership/check paths and policy/runtime capacity.

For A→B→C plus D/two slots, start A/D. A evidence/acceptance/commit may release B while D runs; similarly C. A failure holds B/C, not D. Reports alone release nothing. Reassess evidence/acceptance/commit/slot/conflicts immediately. Serialize shared Git and same-file edits.

Ledger excludes Orchestrator but counts every nested/non-ARC descendant. Completion frees active, never cumulative budget. Same-instance follow-up adds none; replacement does. Waiting/blocked/resumable idle consume concurrency until completion/termination.

Read/freeze valid installed limits; missing/unreadable/malformed blocks creation. Reserve whole batches under cumulative/concurrent/lower actual limits. Convert successes to IDs; release only proved no-creation failures, holding uncertainty until reconciled. No role reserves. Preserve across resume/compaction; unknown is not zero. Exhaustion holds creation/reports work, never waives role freshness/QA/Reviewer/ownership/approval. Sessions/accounts/platforms share no ledger; Teams/hosted APIs are outside. Follow [Codex](../codex/skill/references/limits.md)/[Claude](../claude/skill/references/limits.md).

<a id="verification-acceptance-and-commits"></a>
## Verification, acceptance and commits

| Risk | Flow |
|---|---|
| Narrow/understood/reversible/focused-verifiable | Implementer or approved direct edit → focused checks |
| Ordinary behavior | Implementer → fresh QA |
| Significant contracts/state/lifecycle/security/loss/interfaces/costly deployment | Implementer/fresh QA and independent final whole-change Reviewer at applicable time |

Each task gets fresh Implementer/required QA; same-task QA corrections may reuse. Behavior uses failure-first TDD. Recorded low-risk plan-skip waiver skips RED-GREEN only. Non-behavior exceptions permit named structural checks only.

QA reports every criterion's method/scope/run/evidence/verdict/gaps. Structure cannot prove compliance/installation/readability; source/render evidence differs. Orchestrator judges criteria/findings, not passes/self-report alone.

After required checks/acceptance promptly commit one task without separate approval, verifying SHA/content/state. No-change records no empty commit. Exclude unrelated work and never combine approved tasks. Resume verifies/reuses commits.

Significant plans receive one final Reviewer after task acceptance/QA, never each commit. No-plan review precedes acceptance. Omission gains no automatic commits. Task/final acceptance differ. Push/merge/publish/deploy need separate approval. Follow [Codex verification](../codex/skill/references/verification.md)/[commit](../codex/skill/references/commit.md) and [Claude verification](../claude/skill/references/verification.md)/[commit](../claude/skill/references/commit.md).

During approved execution, task progress records (checkboxes, notes, results, evidence and status) preserving the approved contract need no new approval and belong in that task's acceptance commit. All other spec/plan content changes, including mechanical corrections, are plan revisions requiring applicable approval and preparation. Orchestrator leaves approved revisions uncommitted, then includes all pending revisions in the acceptance commit of the first top-level task executed or reconfirmed against the revised version. Otherwise use a current task acceptance or final Reviewer follow-up commit. Only if neither exists and no implementation work remains before overall completion, allow one standalone `docs(plan): <description>` closing commit. Record supporting evidence canonically, include all pending revisions and trailers, and include no implementation files. Overall completion requires no pending revisions. Add `Plan-Revision: <gitPath> v<from> -> v<to>` per document, and `Plan-Approved-At: <gitPath> v<N> <actual ISO 8601 approval time>` and `Plan-Reason: <gitPath> v<N> <reason>` per version after from through to. Use ASCII `->`, repeat keys as needed and preserve existing Git trailers. NEVER amend, reset, replay or rewrite planning or implementation commits, create any other docs/fixup commit or authorize past work retroactively. Follow [Codex planning](../codex/skill/references/planning.md#plan-updates-during-execution), [handoff-prep](../codex/skill/references/handoff-prep.md#execution-time-plan-revision), [commit](../codex/skill/references/commit.md#execution-time-plan-document-updates) and [Claude planning](../claude/skill/references/planning.md#plan-updates-during-execution), [handoff-prep](../claude/skill/references/handoff-prep.md#execution-time-plan-revision), [commit](../claude/skill/references/commit.md#execution-time-plan-document-updates) for the full rules.

Complete required QA and QA failure rechecks before the initial final overall Reviewer review. Once that review begins on plan work, every Reviewer finding, including behavior, repeats Implementer→Reviewer without QA reassignment until resolved. Define follow-up/approvals, keep fixes uncommitted and supply current committed state/diff/files, then accept/commit one focused follow-up. Separate QA findings remain Implementer→QA.

Conventional Commits follow user/repository instructions. This repository requires concise, specific Korean descriptions; upstream English defaults do not override user instructions.

<a id="failure-resume-and-maintenance"></a>
## Failure, resume and maintenance

Failures/partial completion hold affected work while inspecting path/branch-dettached HEAD/HEAD/index/files/completed steps. Update record, resolve/revalidate then resume. No automatic retries/fallback/repeats/stash/reset/clean/lock deletion/permission changes/sandbox bypass. Preserve unrelated work; reuse valid choices/commits and record changed preparation only.

Optional failed reads permit only brief-preauthorized side-effect-free alternatives with exact locator/material/version/purpose/authority/equivalent evidence. Same-version read methods are an example. Return missing inputs/mismatches/partial changes/unknown/unauthorized-ambiguous-failed alternatives immediately. No guessed paths/chained alternatives/mutation retries/environment changes.

After first-failure/alternative/evidence/limits reporting:

1. Record exact failed check, baseline/current revision, results/evidence/state.
2. Classify baseline/current impact/dependencies.
3. Hold affected/dependent or impact-unknown work only.
4. Orchestrator validates authority/target/inputs/ownership/gates and releases approved independent work without unrelated delays.
5. Keep acceptance held for required unresolved checks.

Roles never self-authorize release or hide failures/change criteria/waive checks. Resume preserves approvals/completed work/failure/resolution/valid-invalid evidence/holds/next goal. Restart adds no authority.

Agent Git recovery coordinates checkout/index; installer rollback handles publication/acquisition cleanup. Residual paths need inspection; rollback labels prove no cleanup. Neither guarantees persistent backup. Follow [Codex](../codex/skill/references/git-recovery.md)/[Claude](../claude/skill/references/git-recovery.md).

| Maintenance | Effect |
|---|---|
| Models | For Codex and Claude, edit installed v3 `models.toml`: one `[roles.<role>]` per role with `model` and `model_reasoning_effort` (Codex) or `effort` (Claude). Python apply-models validates/renders v1/v2/v3; serialization writes v3. Gemini effort stays `default`. No ARC/upstream refresh |
| Manifest | Update/check `MANIFEST.sha256` after protected changes; models excluded, dynamic upstream has provenance |
| Reinstall | Installed active model values survive reinstall and upgrade; other packaged static managed files are refreshed; upstream needs explicit updater, valid omitted limits preserved |
| Harness removal | Below |
| CLI only | `npm uninstall -g @yunhozz/arc` leaves harness settings |

`Uninstall` lists registered platforms in display order (`Claude`, `Codex`, `Gemini`), then `Everything (incl. CLI)` and `Back`. Absent harnesses show `<Label>  (not installed)` and cannot be selected. Confirmation asks `Remove ARC from <Label>?` or `Remove ARC from all platforms and the arc CLI?`, with `Remove` and default `Back`. Selecting a composite participant also shows `Mixed routing will be turned off.`. `Back` returns to Uninstall; Esc returns home (and exits from home). Removal deletes selected skill/five profiles/managed blocks, including edited ARC files. Preserve other skills/profiles, Codex wait/native concurrency/workflow records. Non-TUI management calls can retain global instructions; review removal scope. Clean valid completion blocks. Only all-success harness removal permits npm removal of verified global `@yunhozz/arc`, including npx runs. Harness failure/cleanup/interruption skips CLI removal; identity/context failure blocks harness changes. Report separately; CLI failure preserves harness success. Once CLI removal begins, success/failure/interruption ends session. Preserve unselected harnesses/user files/other packages/shared npx cache.

Removal of a single composite participant first restores standalone profiles as described above. Everything removes owned composite profiles and prepared markers in the selected homes and the active file in the anchor home only when configuration, marker paths, and hashes match. Preserve files with unclear ownership and report their residual paths; leftover routing files do not establish readiness.

Results use `ARC installed for <Label>.` for installation, with `Mixed (…) activated.` for composite publication. A single-platform removal shows `Removed from <Label>.`; Everything shows `Removed ARC and CLI.` when the CLI was removed, or `Removed ARC.` when it was already absent. A switch adds `Mixed routing turned off.` before the operation result. Upgrade success shows `Upgraded to <version>.` Failures retain a one-line `Error: <message>`, deduplicated `Residual path: …` entries, and `Exit code: N`; partial target success remains visible.

Use [maintenance](../README.md#manage-arc)/[models](../README.md#models-and-language)/[removal](../README.md#manage-arc). New settings need new sessions; structure alone proves no support.

<a id="source-map"></a>
## Source map

| Concern | Source |
|---|---|
| Platform contracts | [Codex](../codex/skill/SKILL.md), [Claude](../claude/skill/SKILL.md) |
| Planning/readiness | [Codex](../codex/skill/references/planning.md), [Claude](../claude/skill/references/planning.md) |
| Preparation/docs commits | [Codex](../codex/skill/references/handoff-prep.md), [Claude](../claude/skill/references/handoff-prep.md) |
| Profiles | [Codex](../codex/agents), [Claude](../claude/agents) |
| CLI/lifecycle | [Root](../lib/cli/root.mjs), [TUI](../lib/tui/app.mjs), [management](../lib/management/operations.mjs) |
| Paths/plans/settings | [Targets](../lib/installer/targets.mjs), [plans](../lib/installer/plan.mjs), [merge](../lib/installer/runtime-config.mjs) |
| Install/remove | [Install](../lib/installer/install.mjs), [uninstall](../lib/installer/uninstall.mjs) |
| Publication/rollback | [Transactions](../lib/installer/transaction.mjs) |
| Refresh | [Updater](../scripts/update-superpowers.mjs), [references](../lib/installer/package-references.mjs), [acquisition](../lib/installer/acquisition.mjs), [validation](../lib/installer/superpowers.mjs) |
| Completion | [Cleanup](../lib/installer/shell-completion.mjs) |
| Structural regressions | [Harness](../tests/test_harness_contract.py), [Python](../tests), [Node](../tests/node) |
| Maintenance | [Manifest](../scripts/update-manifest.mjs), [updater](../scripts/update-superpowers.mjs), [commands](../README.md#manage-arc) |

The [flow diagram](images/role-flow.svg) summarizes routing/order; normative sources retain full gates/platform differences.

<a id="file-by-file-scope-of-responsibility-review"></a>
### File-by-file responsibility review

Earlier T1 compared 29 non-Superpowers runtime guides (2 core, 9 Codex references, 8 Claude references, 10 profiles). Paired sources shared responsibilities while retaining adapter differences. Consolidation used sources/links without removing local safeguards.

| Responsibility | Reviewed source |
|---|---|
| Routing/risk/continuity/detail links | Both `skill/SKILL.md` |
| Approvals/probes/depth/dependencies/order | Both `skill/references/planning.md` |
| Handoff/preparation/commit evidence | Both `handoff.md`, `handoff-prep.md` |
| Managed worktree preparation | [handoff-worktree](../shared/skill/references/handoff-worktree.md) |
| Limits/adapters | Both `limits.md` |
| Risk/acceptance/final corrections/continuity | Both `verification.md` |
| Task/no-change/correction commits | Both `commit.md` |
| Failure/partial-state recovery | Both `git-recovery.md` |
| Visual tools | Both `arc-visual-companion.md`; imported `references/visual-companion.md` |
| Scope/reporting/no-delegation/check duties | `codex/agents/arc-{scouter,planner,implementer,qa,reviewer}.toml`, `claude/agents/arc-{scouter,planner,implementer,qa,reviewer}.md` |

Earlier T2 aligned [bootstrap routing](../lib/installer/global-config.mjs). [Language](../lib/installer/language.mjs), [plans](../lib/installer/plan.mjs), [profiles](../lib/models/profiles.mjs), [manifest validation](../lib/installer/manifest.mjs), [metadata](../package.json), [manifest updater](../scripts/update-manifest.mjs) were checked for interface/language/marker-external/package-license compatibility. Models/apply-models retained responsibilities linked in [model guidance](../README.md#models-and-language). T3 aligned README/operations/document contracts. Runtime Superpowers remained excluded.

Source maps and structural/package/manifest checks establish authored/package consistency only. Actual approval continuity/native application/visual readability need direct observation. Reference conversations or interrupted-run reproduction alone do not prove these claims.


## Fast Path and task evidence

Select the existing small direct path only when all F1–F8 in the platform handoff's `Orchestrator direct path for small tasks` are proven. Initial judgment reads the direct path, planning authorization and depth, and verification risk sections, plus the TDD section when applicable. All subsequent action gates remain in force. Reuse instruction reading only after verifying the actual source-set and hashes and the same conversation context; place the task envelope in the existing handoff or inline scope record. Approved HEAD or expected dirty changes alone do not invalidate target choice: separately refresh current state and affected evidence. Missing, conflicting, inaccessible or ambiguous evidence requires full evaluation and the existing hold procedure.
