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

- `models.toml` schema v3 has five `[roles.<role>]` tables with `model` and one effort field: `effort` for Claude, `model_reasoning_effort` for Codex, and `effort` for Gemini and Grok. The Orchestrator uses the conversation model.
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
| `claude-cli` | Native, all roles | Bridge, all roles | Bridge, read roles only (GG1 `fail`; Implementer/Tester held as `permission_scope_unverified`) | Bridge, all roles |
| `codex-cli` | Bridge, all roles | Native, all roles | Bridge, read roles only (GG1 `fail`; Implementer/Tester held as `permission_scope_unverified`) | Bridge, all roles |
| `gemini-cli` | Held (`capability_not_verified`; GG2 `fail`, `compositeHost` off) | Held (`capability_not_verified`; GG2 `fail`, `compositeHost` off) | Held (`capability_not_verified`; GG2 `fail`, `compositeHost` off) | Held (`capability_not_verified`; GG2 `fail`, `compositeHost` off) |
| `grok-cli` | Bridge, all roles | Bridge, all roles | Bridge, read roles only (GG1 `fail`; Implementer/Tester held as `permission_scope_unverified`) | Native, all roles |
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
| GG1 `fail` | Gemini bridge Implementer/Tester hold as `permission_scope_unverified`. Read roles remain supported. |
| GK1 `pass` | Grok bridge write roles require a per-dispatch sandbox profile and a verified `ProfileApplied` event. Live evidence covers Grok 1.0.89 on macOS. Unlisted home paths, session files and temporary directories remain writable. Reads and network access are allowed. |
| Claims | `supportStatus: verified` requires all five claims to be `runtime-observed`. User MCP configuration caps Codex permission evidence at `operator-attested`. |
| Versions | Routing reports CLI versions. Configure and Status use the registry's supported ranges, and Configure blocks composite platform selection outside those ranges. |
| Target home probe | On Gemini or Grok hosts, bridge prepare/run/resume probe the target home. A denial holds as `host_sandbox_blocked`, a missing home as `activation_unverified`, and a failed cleanup reports `residualPaths`. The probe covers the home directory itself. |
| Child guard | `ARC_BRIDGE_CHILD` blocks routing commands. Shell launches of a platform CLI fall outside `delegation_observed` detection. |

For bridge target rules and the control files they cover, see [Claude](../claude/skill/references/coordination.md#bridge-target-rules) · [Codex](../codex/skill/references/coordination.md#bridge-target-rules) · [Gemini](../gemini/skill/references/coordination.md#bridge-target-rules) · [Grok](../grok/skill/references/coordination.md#bridge-target-rules).

### Post-run detection limits

The supervisor compares Git-visible paths, HEAD, branch, refs and the control files listed in the bridge target rules before and after the run. Detected violations leave files in place and report affected control-file labels in `controlFiles.changed`. Outside the selected control files, Git-ignored paths and external `core.hooksPath` directories are missed. Changes within a hooks or info tree that exceeds 1,000 entries may go undetected while both snapshots report `overflow`. A failed before snapshot stops execution as `execution_failed`. A failed after snapshot leaves permissions unverified and yields no comparison verdict. Check `tolerated.refs` with `git log` and `git reflog` before rebasing, merging or accepting because the comparison cannot identify who made those changes.

### Working alongside a running bridge

In the dispatch worktree, make only fast-forward commits on its current branch, within `allowedPaths` for Implementer and for Tester with non-empty `allowedPaths`. Avoid amending, rebasing, resetting, switching branches or writing `.git/config` (including via `git push -u`).

Avoid saving host permission rules in the dispatch checkout. Claude Code's “don't ask again” can change `.claude/settings.local.json` and fail the dispatch as `permission_violation_observed`. Use a linked worktree to isolate bridge work.

## Bridge tool access

The Orchestrator requests only the minimum access verification needs for that bridge dispatch (D-a). Read roles are Scouter, Planner and Reviewer; write roles are Implementer and Tester. The baseline below shows each target platform's existing bridge behavior together with the scope where `toolAccess` applies.

| Target | Read roles | Implementer | Tester |
|---|---|---|---|
| Claude | Scouter uses `--allowedTools WebFetch,WebSearch` (B12·MI-8). Planner and Reviewer have no Bash | D2′ sandbox with scratch and default presets. `Edit(./.git/**)` and sandbox `denyWrite` protect Git (MI-4). Loopback bind confirmed (MI-5) | Same baseline plus domain and service requests the role table and gates allow |
| Codex | Existing arguments kept. Web lookup works as measured with `--search` (B12) | `workspace-write` with scratch and default presets. A permission profile applies when effective network access or registered paths or sockets are granted (MI-1·MI-3) | Same baseline plus domain and service requests the role table and gates allow |
| Gemini | Existing read-role bridge kept | Bridge held because GG1 failed | Bridge held because GG1 failed |
| Grok | Existing arguments kept. The built-in read-only mode is not guaranteed to be enforced | Existing GK1 per-dispatch sandbox. `toolAccess` unmeasured (B14) | Existing GK1 per-dispatch sandbox. `toolAccess` unmeasured (B14) |

### Tool categories

● needed, ○ sometimes needed, – not applicable. Need is recorded separately from whether access is allowed.

| ID | Category | Read / Implementer / Tester | Handling and measurement evidence |
|---|---|---|---|
| C1 | Temporary files | – / ● / ● | M1 scratch. SX3·SC0·SC2·MI-C |
| C2 | Package and toolchain caches | – / ● / ● | M2 `caches`, plus registered M3 paths if needed. B4 confirmed npm, Python and uv. Gradle, Go and Maven unmeasured |
| C3 | Dependency installs and remote fetch | – / ○ / – | M7 host only (D-h) |
| C4 | Browsers and test runners | – / ○ / ● | M6 CDP (SX4·SC3·MI-A). Playwright host connection succeeded (B10), in-sandbox launch failed (B11), host isolation unmeasured (MI-B). Cypress is M7 |
| C5 | Local TCP services | – / ○ / ● | M4 `loopback`. SX1·SC1 |
| C6 | Unix sockets | – / ○ / ● | M4 allows scratch sockets automatically when network is enabled. 0 registered IDs. SX4·SC3·B5 |
| C7 | Docker, Colima, SSH agent, GPG agent | – / – / ○ | M5 never granted. B5 confirmed the Docker socket is denied |
| C8 | Own server bind | – / ○ / ● | M4 request-based `loopback`. B3·MI-1·MI-5 |
| C9 | CLI auth and config reads | ○ / ● / ● | Existing behavior kept. M5 read restrictions under `domains`. B6·MI-7·MI-9 |
| C10 | CLI auth and config writes | – / – / – | M5·M7. B1 confirmed writes to `~/.codex` are blocked |
| C11 | Language servers and build daemons | – / ○ / ○ | M2 `daemon-off`. Effect unmeasured |
| C12 | Process inspection and signals | – / ○ / ○ | Signals to own child processes allowed; inspecting other processes is M7. B8 |
| C13 | File watching and EMFILE | – / ○ / ○ | M2 `polling`. B9 confirmed recursive `fs.watch` fails |
| C14 | `.git` writes | – / – / – | M5, Codex profile protection (R1), Git writes are M7. B1·MI-1·MI-3·MI-4 |
| C15 | Keychain, GUI and OS services | – / – / – | M5; keychain operations are M7 |
| C16 | Telemetry and update checks | – / ● / ● | Disabled in M2 `base`. SC3 confirmed the agent-browser version check is blocked |
| C17 | Interactive prompts | – / ○ / ○ | `GIT_TERMINAL_PROMPT=0` in M2 `base` and the requestable `ci` |
| C18 | Long-running background processes | – / ○ / ● | Allowed during the dispatch; the process group is terminated at terminal state |
| C19 | Evidence artifacts | – / ○ / ● | Copied from M1 `evidence/` to the artifact directory. B10 |
| C20 | Read-role web lookup | ● / – / – | Claude Scouter web tools allowed. Existing Codex behavior kept. B12·MI-8 |
| C21 | Read-role tool execution | ● / – / – | Existing role tool scope applies |

Review a new tool in this order: repository writes, the never-granted list, env bypass, registered paths, the narrowest network scope, a host service that does not run repository code, and host only.

### Access mechanisms

- **M1 scratch** — For each Claude or Codex bridge write role, the supervisor creates a 0700 directory with `tmp/`, `cache/`, `sock/` and `evidence/`. Claude uses `/private/tmp/claude-<uid>/arc-bridge-<id8>`, owned by the current user, and Codex uses `/private/tmp/arc-bridge-<id8>`. Roles keep temporary files in `ARC_SCRATCH_DIR` and files to keep in `ARC_EVIDENCE_DIR`. On exit, only regular files and directories are copied to the dispatch artifact's `evidence/`. Limits are 64 MiB total, 16 MiB per file, 256 entries and depth 8. Overflow is recorded as `truncated`. Both normal cleanup and recovery check the owner and dev/ino of scratch and hostDir, `rename` them to a quarantine location the role cannot write, check again and delete recursively. The first quarantine location is under the segment artifact. If the volumes differ and `EXDEV` occurs, `arc-role-dispatch/` in the anchor home is used. If moving fails at both locations, the files stay at the original path. If verification or deletion fails after the move, they stay under `.cleanup-*` in that quarantine location, and the warning persists even when recovery is retried.
- **M2 env preset** — `base` passes the temporary, cache and socket paths, three `ARC_*` variables, and prompt, telemetry and update settings. `caches` points the npm, Python, uv, Yarn, pip, Poetry, Go build and Homebrew caches under scratch. `base` and `caches` apply automatically to supported write roles. `ci` requests non-interactive execution, `daemon-off` stops Nx and Gradle daemons, and `polling` requests polling watchers in tools that support it. Claude uses the settings `env` and Codex uses `shell_environment_policy.set`. B4 confirmed npm, Python and uv behavior; the other cache variables and the per-tool effect of requestable presets are unmeasured.
- **M3 registered paths** — `paths` accepts only IDs registered with ARC. There are currently 0 registrations. An absolute realpath is required, and paths that are symlinks, the home itself, or overlap a CLI home or a never-granted path are refused. Claude puts existing directories in `sandbox.filesystem.allowWrite` and Codex puts `"write"` in the profile (B13).
- **M4 network and Unix sockets** — When a service request has `network` set to `null`, the effective value is `loopback`. When the effective value is not `null`, the scratch `sock/` is allowed automatically. Additional sockets are specified only by registered ID, and there are currently 0 registrations. Claude puts `allowedDomains`, `allowLocalBinding` and `allowUnixSockets` in the sandbox settings. Codex uses the `arc_bridge` profile to grant network access or registered paths and sockets, and both new runs and resume pass `default_permissions` and, when network is used, `features.network_proxy` (MI-1). The profile sets the absolute paths of the worktree's `.git` and `.codex` to read-only (MI-1·MI-3). If the user's or the worktree's Codex config already has `permissions.arc_bridge`, the request is held because of the merge risk (MI-2).
- **M5 never granted** — `FORBIDDEN` prohibits granting writes to the worktree's `.git` and `.codex`, each platform's CLI home, `~/.ssh`, `~/.aws`, `~/.config/gh`, `~/.config/gcloud`, `~/.npmrc`, `~/.netrc`, `~/.docker`, `~/.kube`, `~/.gnupg`, `~/.gitconfig`, shell startup files (`~/.zshrc`, `~/.zprofile`, `~/.zshenv`, `~/.bashrc`, `~/.bash_profile`, `~/.profile`), `~/Library/LaunchAgents` and `~/Library/Keychains`. Forbidden sockets are `/var/run/docker.sock`, `~/.docker`, `~/.colima`, the path `$SSH_AUTH_SOCK` points to, and `~/.gnupg`. Scratch, registered paths and sockets, and host service directories are also checked for overlap with this list. Under `domains`, reads of 10 auth and config paths and the CLI home are blocked, and env variables matching credential patterns are cleared. Claude applies sandbox `denyRead` together with `Read` deny rules and sets those env variables to empty strings; Codex uses filesystem `"none"` and env `exclude`.
- **M6 host services** — On a Tester request, the supervisor starts services after creating scratch and before launching the CLI, and stops and cleans them up on every terminal path. Host services do not run repository code or the worktree's `node_modules`. The role reads each service ID's endpoint from the `services.json` that `ARC_HOST_SERVICES_FILE` points to. CDP launches Chrome with an isolated profile and a temporary user data directory. The three Playwright services are currently held. Their design needs a host-global `playwright` or `playwright-core`, and MI-B could not measure the launcher and isolated profile. A service start failure is recorded as `execution_failed`, and a cleanup failure as a warning.
- **M7 host only** — Covers inspecting other processes such as `ps` and `pgrep`, Docker, real CLI auth and config writes, dependency installs and the remote fetches they need, Git writes, Cypress, and keychain operations. When a bridge role cannot finish a check because of these limits, it reports "environment limit (host only)" and lists the blocked checks and unverified scope. The Orchestrator handles the host check within its existing permissions.

### Request contract

When you use the optional `prepare-dispatch` key `toolAccess`, pass all six keys below. Arrays accept only unique strings and are normalized to name order when stored. A shape or role table violation is `invalid_request`. A request uses lease v3; omitting it uses v2. Passing a valid request on a native route holds as `permission_scope_unverified`.

```json
{"network": "loopback", "domains": [], "unixSockets": [], "paths": [], "services": [], "envPresets": []}
```

| Key | Read roles | Implementer | Tester |
|---|---|---|---|
| `toolAccess` | `invalid_request` | Optional | Optional |
| `network` | — | `null`, `"loopback"` | `null`, `"loopback"`, `"domains"`, `"full"` |
| `domains` | — | `[]` | 1–16 entries when `"domains"`, otherwise `[]` |
| `unixSockets` | — | Registered IDs (currently 0) | Registered IDs (currently 0) |
| `paths` | — | Registered IDs (currently 0) | Registered IDs (currently 0) |
| `services` | — | `[]` | `browser-cdp`, `browser-playwright-chromium`, `browser-playwright-firefox`, `browser-playwright-webkit` |
| `envPresets` | — | `ci`, `daemon-off`, `polling` | `ci`, `daemon-off`, `polling` |

A domain must be a lowercase ASCII name with at least one dot. The total length is at most 253 characters and each label at most 63, and the top-level label is 2–63 letters or a valid `xn--` name. Wildcards, IP literals, `localhost` and its subdomains, names ending in `.local`, `.internal` or `.home.arpa`, schemes, ports, paths, trailing dots, uppercase letters and whitespace are refused.

Even a validly shaped request is granted only when every applicable gate is `pass` or `conditional`. `held`, `unmeasured` or a failed required precheck is `permission_scope_unverified`. The scope of a conditional grant is recorded in the result's `toolAccess.conditions`. `network.full` and the Playwright service IDs are in the contract but are currently held by their gates.

### Gates and measurement evidence

Values follow `TOOL_ACCESS_GATES`. The common Gemini evidence is GG1, and the common Grok evidence is B14 (402 persisted on 2026-11-24, so T6 was skipped). `—` means no gate is defined for that platform.

| Mechanism | Claude | Codex | Gemini | Grok | Measurement IDs and conditions |
|---|---|---|---|---|---|
| `scratch` | pass | pass | held | unmeasured | SX3·SC0·SC2·MI-C |
| `env.base` | pass | pass | held | unmeasured | SX3·SC2 |
| `env.caches` | pass | pass | held | unmeasured | SX3·SC2·B4 |
| `env.ci` | pass | pass | held | unmeasured | SX3·SC2. Env delivery confirmed |
| `env.daemon-off` | pass | pass | held | unmeasured | SX3·SC2. Env delivery confirmed |
| `env.polling` | pass | pass | held | unmeasured | SX3·SC2. B9 confirmed watcher limits |
| `codexProfile` | — | conditional | — | — | B1·MI-1·MI-3. Read-only entries for the worktree's `.git` and `.codex` required |
| `network.loopback` | pass | pass | held | unmeasured | SX1·SC1·B3·MI-1·MI-5 |
| `unixSockets.scratch` | pass | pass | held | unmeasured | SX4·SC3·B5·MI-1 |
| `unixSockets.registered` | pass | pass | held | unmeasured | B5. 0 registered IDs |
| `paths` | pass | pass | held | unmeasured | B13. 0 registered IDs |
| `network.domains` | conditional | conditional | held | unmeasured | B2·B6·B7·MI-6·MI-7·MI-9. Tools that ignore the proxy fail; Claude Read tool and directory read limits and Codex external read limits confirmed |
| `network.full` | held | held | held | unmeasured | SX1·D-d. Held on Claude and Codex, where domains can be narrowed |
| `service.browser-cdp` | conditional | conditional | held | unmeasured | SX4·SC3·SX7·MI-A·R-1. Reads of home and `~/Library` denied. Files outside home such as `/etc` are reachable through `file://`. Another loopback dispatch running at the same time can connect to the unauthenticated CDP port |
| `service.browser-playwright-chromium` | held | held | held | unmeasured | B10·B11·MI-B. Isolation unmeasured because host-global Playwright is absent |
| `service.browser-playwright-firefox` | held | held | held | unmeasured | B10·B11·MI-B. Isolation unmeasured because host-global Playwright is absent |
| `service.browser-playwright-webkit` | held | held | held | unmeasured | B10·B11·MI-B. Isolation unmeasured because host-global Playwright is absent |

### Operational limits and findings

- **Loopback** cannot be limited by port. It can reach other local services on the same host, such as databases, and the Implementer can send write requests to local services. Tools that ignore the Codex proxy fail even when the target is in the `domains` allowlist (npm in B2). Domain format checks cannot detect DNS rebinding, where a name resolves to a private IP.
- **Claude env** — Variables cleared under `domains` are set to `""` rather than removed. CLI auth persisted in MI-6, but auth can fail in environments whose credentials depend on those env variables. Claude Bash can set `TMPDIR` to its own path, so use `ARC_EVIDENCE_DIR` for evidence.
- **Codex config** — If `permissions` and `arc_bridge` both appear, outside comments, in the user's or the worktree's `config.toml`, profile mode requests are held as `permission_scope_unverified`. For `domains` requests, the request is also held when `shell_environment_policy` and `exclude` both appear. R-6 confirmed that the CLI `exclude` argument replaces the existing list. Requests can be held even when the tokens are in different sections or strings. System and managed config layers are not checked (unmeasured).
- **Post-run change detection** compares the worktree and the selected control files. Writes outside the repository beyond that scope cannot be detected. The scope limit of Codex `workspace-write` is recorded in G5.
- **Evidence integrity** — Another write dispatch running at the same time can write to this dispatch's `evidence/` and hostDir. Evidence is material the role provides, and its integrity is not guaranteed.
- **File watching and process inspection** — In B9, Node's recursive `fs.watch` failed with `EMFILE`. The `polling` preset applies only to tools that support it and does not change direct Node calls. Inspecting other processes such as `ps` and `pgrep` is host only (B8).
- **Chrome CDP** — MI-A confirmed local pages and screenshots, and denied file reads in home and `~/Library`. `file:///etc/hosts` was readable. The sandbox limits outbound network traffic to localhost. In real Chrome, R-1 and N1 confirmed external connections are blocked in both the default context and a context with changed proxy settings. N1 measured Unix socket connections and DNS denial with a dummy socket and `getaddrinfo` under `sandbox-exec` with the same rules; Chrome's own DNS queries were not observed. Access to host sockets such as Docker is forbidden. WebRTC paths need separate measurement. Another loopback dispatch running at the same time can connect to the unauthenticated CDP port. `--use-mock-keychain` avoids hangs on keychain access.
- **Host service recovery** — On `cancel` and on an `observe` transition to `unknown`, records bound to the dispatch and segment are verified. Before sending a signal, the same process list is checked again to confirm the supervisor is gone. If `EPERM` occurs while waiting for the service group to exit, recovery waits until the exit-confirmation deadline. Quarantine residue is checked before evidence is copied. If `evidence/` already exists, the copy goes to a separate `evidence-recovery-*`, and a retry compares the existing recovery copy with the current evidence. If the role CLI's group remains, quarantine residue exists, or copying or comparison cannot finish, deletion of scratch and hostDir is held and the response carries `hostServiceRecovery: "warning"`. If services became ready but the recovery record could not be written at start, the normal run and exit cleanup continue and the result's `toolAccess.hostServiceRecovery` records `"warning"`.
- **Playwright** — Without a host-global package, MI-B could not verify per-browser isolation, `~/Library` reads or `file://` access. The Chromium, Firefox and WebKit services are all `held`. Connections can fail when the Playwright client and server versions differ.
- **AC9 component live checks** — Claude and Codex Testers confirmed the `services.json` endpoint, CDP `/json/version`, localhost pages and screenshots, blocked external connections, and blocked reads of `~/.gitconfig`. The harness called scratch and host directory cleanup directly and also passed `ARC_*` to Claude as process env. A live check of a full supervisor dispatch follows merge and install, per the user's decision.

Two observations about existing roles:

- Claude Planner and Reviewer bridges have no Bash. Checks that need shell execution are reported as unverified in that role's result.
- Grok bridge read roles do not get an enforced CLI built-in read-only mode. The read-only scope from the role instructions and the post-run change check apply.

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
| Global settings | Skipping global changes preserves existing instructions and settings. Claude Code writes the concurrency limit in `settings.json.env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`. Codex config supports wait and concurrency settings. |
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
| Selection | Check the platforms to watch; all supported platforms are checked by default. Unsupported platforms are marked and cannot be checked. Confirming with no platform checked is refused. Back, Escape and EOF exit 0. Ctrl-C in the menu exits 130 |
| Sources | Supported platform transcripts and dispatch leases/artifacts. Codex Desktop sessions are excluded. |
| Scope | Watch follows one selected Git worktree or the current directory outside Git. The picker lists linked worktrees regardless of location and selects the current worktree by default. Other worktrees are outside the selected scope. Events use the session working directory at the time of the event. Dispatches are matched by their workflow target or an in-scope session linked to the dispatch artifact |
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

The Orchestrator owns routing, approvals, integration, acceptance, and commits. It answers simple questions directly and can ask a Scouter to research sources or explore the repository. Design depth and verification risk are separate decisions.

| Design depth | Approval and preparation |
|---|---|
| Spike | Approve the question and method, explore, report findings, and reassess the implementation and documents. |
| Bounded | Approve a short design. Add a spec if required and a plan if needed. Omission requires narrow eligibility. |
| Architectural | Approve the design direction, written spec, and implementation plan in order. |

The Planner drafts each applicable stage for user approval. Approved documents precede platform preparation and handoff. Verify the complete document set, the explicit execution target choice, the document commit, and actual workspace state. Execution targets include the current checkout, a new task branch, and a managed worktree on each platform.

Assign a fresh Implementer to each ready top-level task after verifying ownership, inputs, accepted predecessors, and capacity. Reserve slots within the total, concurrent, and runtime limits, and avoid concurrent edits to the same file. All specialists report back to the Orchestrator. The Orchestrator releases dependent work after acceptance and reassesses readiness as work proceeds.

Low-risk work uses focused checks. Ordinary and significant work require fresh Tester verification and evidence for each criterion. Accept each planned task and create a focused commit or record a no-change result. Significant planned work gets a whole-change Reviewer review after task acceptance. Significant unplanned work gets Reviewer review before acceptance. If verification fails, hold the affected work, inspect and resolve the failure, and revalidate before proceeding.

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
