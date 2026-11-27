# Role assignment and coordination — shared text

This file holds text shared by every platform's coordination.md. Each part belongs to the section that links to it and has the same force there.

<a id="role-assignment-and-coordination"></a>
# Role assignment and coordination

Orchestrator reads this before the first specialist creation or assignment and related decisions. Also read [limits](limits.md) and installed `../limits.toml` before creation. Report exact missing, inaccessible or conflicting paths; hold dependent work.

<a id="ownership"></a>
## Ownership

| Role | Ownership and return |
|---|---|
| Orchestrator | Sole coordinator of development/configuration/tests/dependent docs/mixed implementation. Assigns edits to Implementer; owns scope, planning, approval, integration (save/review/directly revise the same spec or plan after Planner first draft, route decisions and request approval), verification, acceptance and completion |
| Scouter | Read-only material research/analysis and assigned static exploration. Reports evidence, assumptions, questions, impact, next actions and path issues. No editing, standalone documents or design/plan/verification/review/completion decisions |
| Planner | Returns design/spec/plan drafts |
| Implementer | Edits approved assigned implementation/configuration/tests/dependent docs; Orchestrator direct edits only under the small-task path |
| Tester | Verifies without editing |
| Reviewer | Independently reviews the final full change |

Orchestrator is depth 1. All five specialists report directly at depth 2 without creating agents/delegating. Reviewer stays independent.

<a id="coordination-execution-mode"></a>
### Execution mode

Obey concurrency limits across the tree, including Scouter. No reserved role slots. Read limits before first creation and maintain cumulative ledger/reservations. Parallelize independent tasks only; dependent handoffs are sequential and edit scopes never overlap.

<a id="instruction-and-execution-adapter"></a>
## Instruction and execution adapter

Apply platform/user/project instructions by precedence, then ARC ownership/permissions/models/concurrency/routing/approval and role-local references. Skills add neither agents nor authority. Map `superpowers:executing-plans`/`superpowers:subagent-driven-development` to dependency-aware Orchestrator coordination and risk-scaled verification, replacing executor mechanics and separate execution-method prompts in existing references.

Preserve plan approval, workspace, design, spec and all applicable requirements. TDD applies to permitted test work under [handoff](handoff.md#implementer-tdd-and-constraints)'s explicit ARC exceptions. Follow an applicable higher-priority prohibition on adding or running tests; when its precedence and scope are clear, neither report a conflict on that basis nor ask permission to violate it. Record unperformed verification; hold only affected work and acceptance when scope or precedence is genuinely unclear or required verification is blocked. Adapt local `brainstorming` role/save/early-spec-commit instructions to Planner ownership and planning/handoff evidence gates, preserving upstream text. Report conflicts/missing required references before dependent work.

Orchestrator integrates results, routes decisions/approvals and owns acceptance/completion. Run dependent implementation sequentially with a fresh Implementer per top-level task. Reuse current Implementer only for same-task correction/rework/rechecks while scope/workspace/ownership/context remain valid. Default same-task Tester corrections to it; findings alone create no new task. Before reuse, compare actual workspace, branch/HEAD and change state to the brief.

For each plan task, keep the current Implementer conversation ID, status, last result and reuse/replacement decision in the canonical handoff record. Before each call, identify the task and current Implementer. Send same-task corrections, rework and rechecks as follow-up work in that conversation. A completed or idle turn, partial implementation, failed result, missing brief, division by step or file, or Tester/Reviewer finding alone does not justify a new Implementer; consolidate the missing information or findings and send them to the current one. For an initial successful call, record the returned ID; if its result is uncertain, reconcile it before another assignment.

Before a same-task replacement, establish an allowed reason: the existing context is invalid/unavailable or the Implementer cannot continue, or an approved plan/acceptance-criteria amendment requires a fresh Implementer. Record the prior conversation ID, status, reason and supporting evidence before calling. Hold if the reason is not established. After a successful call, update the current ID; reconcile an uncertain result before any further assignment. These are prompt-level procedures, not proof of automatic interception of native collaboration calls.

Replace/restart only for invalid/unavailable context or changed task boundary, except approved plan/criteria amendments require a fresh Implementer for remaining work even within the same task. Next-task and amendment assignments are handoff restarts, subject to choice reuse/restart briefs. Follow [risk-scaled execution](verification.md#risk-scaled-execution) at task boundaries.

<a id="local-superpowers-references"></a>
### Local Superpowers references

Supply absolute paths under the selected installed ARC directory. Planner reads `references/brainstorming.md`/`references/writing-plans.md`; Implementer reads `references/test-driven-development.md` and required relative references. Resolve relatives within skill directories. Runtime needs no global discovery/external Skill call/automatic download. Missing/damaged files stop dependent work; report paths without global fallback. Preserve ARC approvals, ownership, TDD exceptions and executor adapters.

<a id="token-discipline-and-handoffs"></a>
### Local Superpowers references

Return the complete first required draft and self-review from the verified source before target preparation; compare the prepared target before saving or handoff.

<a id="coordination-context-discipline-and-handoffs"></a>
## Context discipline and handoffs

Use this fixed brief order:

1. Goal
2. Criteria (IDs)
3. Exact scope/ownership: absolute workspace, branch or detached HEAD and HEAD, existing record path, files
4. Constraints/decisions
5. Evidence: paths/lines, commands, artifact links
6. Prior findings
7. Exact next objective: one bounded objective
8. Return format: conclusion, evidence locations, unresolved points, next step

<a id="coordination-context-discipline-and-handoffs-2"></a>
## Context discipline and handoffs

The [task envelope](handoff.md#orchestrator-direct-path-for-small-tasks) fits this fixed brief order: Goal carries task/path/outcome; Criteria carries IDs and checks; Exact scope/ownership carries target/state/ownership/record; Constraints/decisions carries approval, F1–F8, risk/depth and TDD; Evidence carries fingerprint and approval/check evidence; Prior findings carries changes, revalidation and holds; Exact next objective gives the bounded next goal; Return format requests evidence, limits and unresolved points. Give a new role its native profile and actual applicable instructions, not hash alone.

<a id="coordination-planner-dispatch-efficiency"></a>
## Planner dispatch efficiency

Before Planner dispatch, evaluate F1–F8 direct-path eligibility and Bounded plan-omission eligibility independently. Enter each path only when all of that path's existing conditions are proven; if neither path qualifies, use normal full evaluation. Orchestrator can read a few already identified files; route material research and broad static exploration to Scouter. Planner briefs carry path/line-verified evidence and a Read/Grep exploration budget (default about 15 for Bounded and about 30 for Architectural when no task-specific number is set; state a number before depth is chosen or for Spike work); additional broad exploration goes to Scouter, not Planner. NEVER reuse a Planner across stages, except that on the Architectural path the design Planner continues as the spec Planner after [start confirmation](planning.md#architectural-start-confirmation) while role, context and source remain valid. Within the design/brainstorming stage one Planner handles every [design conversation](planning.md#design-conversation) response, the final design, its consolidated correction and any eligible further call; within a spec or plan stage, that stage's Planner is reused only for a budget-hold delta. Every plan stage, and an Architectural spec stage without that continuation, uses a fresh Planner whose brief contains every required field plus saved document paths and approved versions (for the Architectural plan stage, the reviewed spec path, version and SHA-256); cite a prior brief only when it is an accessible file. A Planner return that stops at the budget with a Scouter request is an input hold, not a missing or failed draft: after Scouter evidence arrives, resend that stage's brief as a delta to the same stage Planner, which counts as new input. In the design stage, conversation responses are expected returns and use no correction opportunity; calls after the final-design correction still need new input. Orchestrator MAY set a handback size limit in the brief.

<a id="models"></a>
## Models

Adjacent `models.toml` is authoritative for role models/effort. Orchestrator uses the current model. DO NOT substitute settings or reduce effort; report unavailability. Declarations prove no provider support/account access/alias resolution/actual model-effort application/concurrency/depth enforcement. New sessions reload profiles; running agents retain settings/parents. Changes do not automatically reparent or prove runtime parent behavior.

<a id="instruction-and-input-provenance"></a>
## Instruction and input provenance

Briefs identify source/applicability/version or approval/access state for user instructions, discovered workspace instructions, installed references and task inputs. Optional read recovery follows policy only; report first failure and dependent/independent work. Return missing required inputs without inventing authority/interpretation. Full fields follow [handoff](handoff.md#instruction-sources-bounded-read-recovery-visual-evidence-and-resumption).

<a id="coordination-composite-platform-role-dispatch"></a>
## Composite Platform Role Dispatch

`Mixed routing` keeps the current session as the Orchestrator. Each role runs either as a native `arc-routing-*` profile on the host or as a bridge: a child process of the peer CLI started by the runtime. Invoke `$ARC_RUNTIME_ENTRY` as described in [planning](planning.md#approved-cooperative-execution-path-within-the-repository): `node "$ARC_RUNTIME_ENTRY" <command> --cwd <absolute worktree> --workflow <workflow ID> --input -`, with one JSON object on stdin. Output is one JSON line. Exit codes: allow 0, deny 2, hold 3, error 1. Every input is validated against an exact key set; a missing or unknown key is denied with `invalid_request`. `hostPlatform` (`codex`, `claude`, `gemini` or `grok`) and `executionEnvironment` (`codex-cli`, `claude-cli`, `gemini-cli`, `grok-cli`, `codex-desktop`, or `claude-desktop`) are caller-provided claims, not host attestations. Gemini host routing is held in this release (see the host support table below).

Choose `executionEnvironment` by where the session actually runs: a terminal CLI or TUI session, including one in an IDE integrated terminal, uses `codex-cli`, `claude-cli`, `gemini-cli` or `grok-cli` for its host. Desktop values apply only to Codex and Claude. Use them only for a session confirmed to run inside the corresponding Desktop app. NEVER infer the environment from paths or directory names (for example `~/Desktop/...`). When unsure, declare the CLI value.

Procedure, in order:

1. `routing-status` with `hostPlatform`, `executionEnvironment`. Reads the active revision, each role's route, profile, model and effort, platform authentication and CLI versions without reserving anything. Authentication and version probes start a child process. The Codex authentication probe refreshes the login token over the network through `codex app-server`; a permanently rejected refresh is `Unauthorized` and a probe that cannot decide is `Incomplete`.
2. `prepare-dispatch` with `hostPlatform`, `executionEnvironment`, `role` (`arc_scouter`, `arc_planner`, `arc_implementer`, `arc_tester`, or `arc_reviewer`), `expectedRevision` (the revision from step 1), `requestId`, `taskId`, and `allowedPaths` (worktree-relative path array; required and non-empty for `arc_implementer`, optional for `arc_tester` where empty or omitted allows no writes, omitted for other roles). `allow` returns `dispatchId`, the route and initial claims and reserves a lease; `hold` returns every reason with its release condition; `deny` rejects the request. Reuse of a `requestId`, or a non-terminal dispatch for the same workflow, task and role, is denied with `duplicate_dispatch`.
3. Native route: before spawning, compare the `[arc-routing rev <revision>]` tag in the agent list description with the `routing-status` revision. If it differs or is not shown, hold the role as `native_profile_reload_unverified` and report that a new session is required. Then spawn: Claude host Agent tool `subagent_type: "arc-routing-<suffix>"`; Codex host `spawn_agent` `agent_type: "arc_routing_<suffix>"` with the existing `fork_turns="none"` and `task_name` rules. On Grok use `spawn_subagent` with `subagent_type: "arc-routing-<suffix>"`. The revision tag appears in the `subagent_type` description. Use the returned `subagent_id` as `nativeAgentId`. The Grok child uses the session model, so its model claim remains `operator-attested`. The child has no `spawn_subagent` tool. NEVER pass a model argument. On Claude and Codex the profile decides. Record the lifecycle with `observe` using `dispatchId`, `event` (`started`, `completed`, `failed`, or `cancelled`) and `nativeAgentId`. `nativeAgentId` is required with `started` and forbidden with every other event. A `cancelled` event is also accepted for a `reserved` native lease that was never started (without `nativeAgentId`). These are `operator-attested` claims.
4. Bridge route: `run-dispatch` with `hostPlatform`, `executionEnvironment`, `dispatchId`, `brief` (UTF-8, at most 256 KiB, delivered on stdin only). It starts a detached supervisor and returns at once with `routeStatus` and `resultPath`. Then `observe` with `hostPlatform`, `executionEnvironment`, `dispatchId` and optional `waitMs` (0 to 540000). Use the maximum wait for each call and DO NOT run a short polling loop. With `waitMs`, `observe` returns only when the dispatch reaches `completed`, `failed`, `cancelled` or `unknown`, or when `waitMs` elapses; a transition such as `starting` to `running` does not end the wait. `observe` returns status, claims, `resultPath` and reasons; `failed` and `unknown` are reported as hold (exit 3).
5. `resume` with `hostPlatform`, `executionEnvironment`, `dispatchId`, `brief`. It continues the same session as a new segment only for a dispatch in `completed` or `failed` state with a recorded session ID and an unchanged active revision (otherwise `revision_changed`). All flags are re-specified, the concurrency limit is checked again, and a session ID mismatch makes the state `unknown`. `unknown` and `cancelled` dispatches cannot be resumed. New Tester or Reviewer assignments never reuse a session.
6. `cancel` with `hostPlatform`, `executionEnvironment`, `dispatchId`. A `reserved` lease (native or bridge) becomes `cancelled` at once; a `starting` or `running` native lease is denied and is closed with `observe` events. A cancelled `unknown` lease keeps its recorded reasons. A running child gets SIGTERM, a 10 second grace, then SIGKILL; the result is `cancelling` and `cancelled` is recorded only after exit is observed. A reused PID or missing child information (including a `starting` lease whose supervisor is lost and that has no child record) is left unchanged and the result is hold, because exit cannot be observed; clean it up manually.

<a id="coordination-host-rules"></a>
### Host rules

| executionEnvironment | Claude target | Codex target | Gemini target | Grok target |
|---|---|---|---|---|
| `claude-cli` | Native, all roles | Bridge, all roles | Bridge, read roles only (GG1 `fail`; Implementer/Tester held as `permission_scope_unverified`) | Bridge, all roles |
| `codex-cli` | Bridge, all roles | Native, all roles | Bridge, read roles only (GG1 `fail`; Implementer/Tester held as `permission_scope_unverified`) | Bridge, all roles |
| `gemini-cli` | Held (`capability_not_verified`; GG2 `fail`, `compositeHost` off) | Held (`capability_not_verified`; GG2 `fail`, `compositeHost` off) | Held (`capability_not_verified`; GG2 `fail`, `compositeHost` off) | Held (`capability_not_verified`; GG2 `fail`, `compositeHost` off) |
| `grok-cli` | Bridge, all roles | Bridge, all roles | Bridge, read roles only (GG1 `fail`; Implementer/Tester held as `permission_scope_unverified`) | Native, all roles |
| `claude-desktop` | Held (`environment_unverified`) | Held (`environment_unverified`) | Held (`environment_unverified`) | Held (`environment_unverified`) |
| `codex-desktop` | Held (`environment_unverified`) | Held (`environment_unverified`) | Held (`environment_unverified`) | Held (`environment_unverified`) |

Read roles are Scouter, Planner and Reviewer. The table shows which routes the recorded gates permit; apply the host rules and check each dispatch result.

**Claude**

- Approval: No per-call ARC approval gate.
- Target home probe: None.
- Desktop: Held as described below.

**Codex**

- On a Codex host ask the user for escalation approval each time any runtime command (`routing-status`, `prepare-dispatch`, `run-dispatch`, `observe`, `resume`, `cancel`) runs, because each may write `CODEX_HOME`. The runtime does not check this approval; asking for it is an Orchestrator obligation. Without approval or on failure the result is `host_sandbox_blocked`.
- In a Codex host sandbox writes to `CODEX_HOME` are denied (G2), so a Codex-host bridge is not held in advance but runs only with the per-call escalation approval; a refused approval or a denied write is `host_sandbox_blocked`. Detached supervisor survival itself was observed under variant conditions, and native routes there remain supported.
- Target home probe: None.
- Desktop: Held as described below.

**Gemini**

- Approval: Hold the host pending live host measurement (GG2). The registry lists `gemini` and `gemini-cli`, but `compositeHost` is off.
- Target home probe: See the shared probe rule below. The capability hold applies before the probe.
- Desktop: No Desktop value.

**Grok**

GK2 is `approval`.

- On a Grok host start the session with `grok --permission-mode default` (ask), keep the platform-default sandbox off, and ask the user for approval each time any runtime command (`routing-status`, `prepare-dispatch`, `run-dispatch`, `observe`, `resume`, `cancel`) runs; NEVER use auto-review, `/auto`, `bypassPermissions`, `--always-approve` or `--yolo`, and DO NOT choose `Always allow`, which saves `permission_mode = "always-approve"` to the Grok config. Spawn with `spawn_subagent` only roles whose route is `native`; Grok can also list Claude `arc-routing-*` profiles, which remain bridge roles. The runtime does not check this approval; asking for it is an Orchestrator obligation. A denied write (for example by a host sandbox) is `host_sandbox_blocked`; ARC does not detect whether the host sandbox is on.
- Target home probe: See the shared probe rule below.
- Desktop: No Desktop value.

<a id="coordination-shared-host-rules"></a>
#### Shared host rules

- On a Grok or Gemini host, bridge `prepare-dispatch`, `run-dispatch` and `resume` first check that the target platform home is writable: a denied write is `host_sandbox_blocked`, a missing home is `activation_unverified`, and a probe file that cannot be removed is reported in `residualPaths`.
- On Desktop hosts (`codex-desktop`, `claude-desktop`) every role (native and bridge) is held as `environment_unverified` in this release; the manual checklist in the ARC operation guide is a list of manual checks for a future ARC update that may change the support status, and recording it releases nothing. Even then `supportStatus` is at most `unverified`.

<a id="coordination-bridge-target-rules"></a>
### Bridge target rules

- Bridge prepare, run and resume hold `permission_scope_unverified` when `allowedPaths` cover `.`, `.git`, `.claude`, `.claude/settings*.json`, `.codex` or `.codex/config.toml`; any change to `.git` config, hooks or info (except `info/refs`, which `git update-server-info` may rewrite after a fetch or gc; that change alone is recorded under `tolerated.control`), `.claude/settings*.json` or `.codex/config.toml` fails the dispatch as `permission_violation_observed` regardless of role and `allowedPaths`, and Grok writing roles also fail on changes to the security keys of the Grok home `config.toml` or to its `sandbox.toml`.
- All bridge children: Apply the shared child guard in [Shared dispatch rules](coordination.md#coordination-shared-dispatch-rules). The guard denies routing commands only; native delegation inside a child follows each platform's Delegation item below.

**Claude**

- Writing roles: Claude bridge `arc_implementer` and `arc_tester` run with recorded sandbox settings on every host and are held as `permission_scope_unverified` when an injected G1 fails or settings are missing (G1). Claude Implementer/Tester bridges also deny writes under `.git` (permission rules and sandbox `denyWrite`), and are held as `permission_scope_unverified` when the worktree `.claude/settings.json` or `.claude/settings.local.json` would widen their scope (additional directories, allow rules for tools outside the safe list (Bash, Read, Grep, Glob, WebFetch, WebSearch), hooks, sandbox or defaultMode).
- Permission claim: Compare the `init` event with the expected tools and permission mode. If `init` is missing, the `permissions` claim is `unverified`. If the tools or permission mode differ, the claim is `unverified` and the reason is `permission_scope_mismatch`.
- Delegation: Role instructions forbid re-delegation. Claude children expose no Task tool.
- Execution confirmation: Check the stream session identity and model, transcript effort, and the observed terminal result.

**Codex**

- Gate: G4 applies to every Codex bridge role. G4 `pass` permits dispatch; a failed G4 holds as `permission_scope_unverified`.
- Writing roles: Codex `workspace-write` may reach beyond the worktree (G5): writes outside the worktree are outside post-run detection.
- Permission claim: For a Codex bridge the `permissions` claim is at most `operator-attested` and notes `user-config-mcp-not-controlled`, because the child loads the user's Codex configuration (for example MCP servers), which ARC does not control; its `supportStatus` is therefore never `verified`.
- Delegation: Codex rollout checks apply. The re-delegation of a Codex child is not blocked, and a spawn found afterwards in its rollout fails the dispatch as `delegation_observed` (G3).
- Execution confirmation: Check the rollout for model, effort, sandbox mode and approval policy, and check the observed terminal result.

**Gemini**

- Writing roles: Gemini bridge `arc_implementer` and `arc_tester` are held as `permission_scope_unverified` while GG1 is `fail`. Scouter, Planner and Reviewer remain supported.
- Permission claim: The worktree snapshot covers only Git-visible worktree changes.
- Delegation: The dispatch record reports `unverifiedContracts.delegation` as `undetectable`.
- Execution confirmation: Check the stream session ID against the recorded ID, the observed model and the terminal result. Effort stays `unverified`.

**Grok**

- Writing roles: Grok bridge `arc_implementer` and `arc_tester` use a per-dispatch sandbox profile and require a verified `ProfileApplied` event after execution (GK1), with read-role behavior unchanged. Writing roles are held as `permission_scope_unverified` if GK1 is anything other than `pass`.
- Grok records `ProfileApplied` itself in a file the child can write. If a Grok version neither applies the profile nor emits the event, a single forged candidate is indistinguishable from a genuine one. A forgery alongside a genuine event fails the two-candidate check.
- On cancellation, the events check adds no `permission_scope_mismatch` if a valid events file has no matching `ProfileApplied` candidate or the file was absent both before and after execution. Other reasons still apply.
- Permission claim: The worktree snapshot covers only Git-visible worktree changes.
- Delegation: The dispatch record reports `unverifiedContracts.delegation` as `undetectable`.
- Execution confirmation: Check the stream session ID against the recorded ID, the observed model and the terminal result. Effort stays `unverified`.

<a id="coordination-bridge-tool-access"></a>
### Bridge tool access

The Orchestrator requests `toolAccess` only for the current bridge dispatch when the approved task needs it (D-a). Use scratch first. Scouter, Planner and Reviewer cannot request `toolAccess`. Implementer MAY request loopback, registered path or socket IDs, and the `ci`, `daemon-off` and `polling` presets. Tester MAY also request domain-scoped or full network access and registered browser services, subject to the platform gates. On Codex, Claude and Gemini, the gates for full network access and all three Playwright services have the value `held`; on Grok they are `unmeasured`. NEVER enable additional access by default for Tester. Check the dispatch's `toolAccess.conditions` when a grant is conditional.

Use `ARC_SCRATCH_DIR` for temporary files and put files that MUST survive the dispatch in `ARC_EVIDENCE_DIR` for supervisor collection. Read `ARC_HOST_SERVICES_FILE` for service endpoints when a host service was granted. When a host-only operation blocks a check, report it as “environment constraint (host only)” and identify the blocked check and what remains unverified. Host-only operations include process inspection (`ps`, `pgrep`), Docker, writes to actual CLI authentication or configuration, dependency installation and its remote fetches, Git writes, Cypress, and Keychain operations. The Orchestrator handles host verification within existing authority.
