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
| QA | Verifies without editing |
| Reviewer | Independently reviews the final full change |

Orchestrator is depth 1. All five specialists report directly at depth 2 without creating agents/delegating. Reviewer stays independent.

### Execution mode

Before the first specialist creation or assignment, check whether `arc-role-platform-routing.prepared.json` exists in the platform home that contains this skill (`../../arc-role-platform-routing.prepared.json` relative to this skill directory). If it exists, ARC runs in `Claude & Codex` mode: follow [Composite Platform Role Dispatch](#composite-platform-role-dispatch) for every role, starting with `routing-status`, and use only the profile or bridge it returns. Never invoke `arc-<role>` or `arc_<role>` names in this mode, even if they are listed. Otherwise use the standalone names below.

Standalone native names: Scouter=`arc-scouter`, Planner=`arc-planner`, Implementer=`arc-implementer`, QA=`arc-qa`, Reviewer=`arc-reviewer`.

Composite native names (`Claude & Codex`): Claude-routed roles use `arc-routing-<suffix>`, Codex-routed roles use `arc_routing_<suffix>`; the suffix is the role name. Never pass a model argument when spawning them.

Obey concurrency limits across the tree, including Scouter. No reserved role slots. Read limits before first creation and maintain cumulative ledger/reservations. Parallelize independent tasks only; dependent handoffs are sequential and edit scopes never overlap.

ARC limits do not prove native concurrency/depth support. Invoke installed native names and receive results; report unavailable execution. Scouter/Planner/Reviewer cannot edit, execute commands or save documents. QA verifies without edits. Stay within shipped allowlists, which are not filesystem sandboxes.

<a id="instruction-and-execution-adapter"></a>
## Instruction and execution adapter

Claude profiles use Markdown frontmatter with `effort`. Native `env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` is a string separate from the ARC ledger. Allowlists/prompts are not a filesystem sandbox; declarations prove no enforcement.

Apply platform/user/project instructions by precedence, then ARC ownership/permissions/models/concurrency/routing/approval and role-local references. Skills add neither agents nor authority. Map `superpowers:executing-plans`/`superpowers:subagent-driven-development` to dependency-aware Orchestrator coordination and risk-scaled verification, replacing executor mechanics and separate execution-method prompts in existing references.

Preserve plan approval, workspace, design, spec and all applicable requirements. TDD applies to permitted test work under [handoff](handoff.md#implementer-tdd-and-constraints)'s explicit ARC exceptions. Follow an applicable higher-priority prohibition on adding or running tests; when its precedence and scope are clear, neither report a conflict on that basis nor ask permission to violate it. Record unperformed verification; hold only affected work and acceptance when scope or precedence is genuinely unclear or required verification is blocked. Adapt local `brainstorming` role/save/early-spec-commit instructions to Planner ownership and planning/handoff evidence gates, preserving upstream text. Report conflicts/missing required references before dependent work.

Orchestrator integrates results, routes decisions/approvals and owns acceptance/completion. Run dependent implementation sequentially with a fresh Implementer per top-level task. Reuse current Implementer only for same-task correction/rework/rechecks while scope/workspace/ownership/context remain valid. Default same-task QA corrections to it; findings alone create no new task. Before reuse, compare actual workspace, branch/HEAD and change state to the brief.

For each plan task, keep the current Implementer conversation ID, status, last result and reuse/replacement decision in the canonical handoff record. Before each call, identify the task and current Implementer. Send same-task corrections, rework and rechecks as follow-up work in that conversation. A completed or idle turn, partial implementation, failed result, missing brief, division by step or file, or QA/Reviewer finding alone does not justify a new Implementer; consolidate the missing information or findings and send them to the current one. For an initial successful call, record the returned ID; if its result is uncertain, reconcile it before another assignment.

Before a same-task replacement, establish an allowed reason: the existing context is invalid/unavailable or the Implementer cannot continue, or an approved plan/acceptance-criteria amendment requires a fresh Implementer. Record the prior conversation ID, status, reason and supporting evidence before calling. Hold if the reason is not established. After a successful call, update the current ID; reconcile an uncertain result before any further assignment. These are prompt-level procedures, not proof of automatic interception of native collaboration calls.

Replace/restart only for invalid/unavailable context or changed task boundary, except approved plan/criteria amendments require a fresh Implementer for remaining work even within the same task. Next-task and amendment assignments are handoff restarts, subject to choice reuse/restart briefs. Follow [risk-scaled execution](verification.md#risk-scaled-execution) at task boundaries.

Planner/Reviewer/Scouter return findings/questions/actions/path issues; Planner preserves complete drafts. Task boundaries alone add no QA/review. Unverified risky dependencies require boundary QA and resolved/explicitly dispositioned findings before implementation, not blanket task gates.

<a id="local-superpowers-references"></a>
### Local Superpowers references

Supply absolute paths under the selected installed ARC directory. Planner reads `references/brainstorming.md`/`references/writing-plans.md`; Implementer reads `references/test-driven-development.md` and required relative references. Resolve relatives within skill directories. Runtime needs no global discovery/external Skill call/automatic download. Missing/damaged files stop dependent work; report paths without global fallback. Preserve ARC approvals, ownership, TDD exceptions and executor adapters.

<a id="token-discipline-and-handoffs"></a>
Return the complete first required draft and self-review from the verified source before target preparation; compare the prepared target before saving or handoff.

## Context discipline and handoffs

Only Orchestrator invokes/assigns Claude roles. Describe role and bounded objective. Installed native profiles determine role/local models.

Use this fixed brief order:

1. Goal
2. Criteria (IDs)
3. Exact scope/ownership: absolute workspace, branch or detached HEAD and HEAD, existing record path, files
4. Constraints/decisions
5. Evidence: paths/lines, commands, artifact links
6. Prior findings
7. Exact next objective: one bounded objective
8. Return format: conclusion, evidence locations, unresolved points, next step

- Follow-ups send changed fields only; mark others `unchanged` relative to a received brief. Restarts follow handoff; fresh specialists receive other fields in full.
- Send a self-contained needed subset and accessible artifacts. Omit full history/repeated instructions/raw logs. No-findings reports may be brief; requested full drafts remain complete. Cite locations/commands/links, investigating gaps only.
- `AskUserQuestion` uses only `question`, `header` of at most 12 characters, 2–4 `options` with `label`/`description`, and `multiSelect`.
- Start installed `arc-*` names with scoped briefs only, never inheriting forks such as `fork`; claim fresh isolation only with evidence. Reuse valid related context, not unrelated/bloated context. Role gate governs Implementer/QA freshness.
- Brief absolute local ARC SKILL.md paths: `test-driven-development` for Implementer, `brainstorming`/`writing-plans` for Planner. Read before dependent work.
- Write final base..HEAD diff/changed-file list to `<git-common-dir>/arc/review/<slug>.diff`, using handoff slug/approved base HEAD. Inline if small or write denied. Reviewer reads and states limits; follow verification.
- Implementer briefs cite spec/plan task-section line ranges and needed excerpts/criteria/constraints; never request whole-document reading.
- Follow [Planner preparation/feedback](planning.md#planner-drafting-preparation-and-consolidated-feedback). Complete the initial brief and whole-draft checklist; directly revise the same spec or plan after Planner returns its complete first draft and self-review. Preserve the Planner path for design/brainstorming revisions.
- Before optional calls name the unresolved question/expected artifact. Skip questions already resolved by evidence/direct inspection.
- Use foreground Agent results or background completion notifications. Report unavailable execution; invent no API. Never poll/sleep-poll for timeout/delay. Batch corrections in one brief. Long Bash uses sufficient `timeout` or `run_in_background` plus completion notification.
- Read needed file/output ranges only (`rg -n`, `sed -n`, `head`/`tail`) and cap output. Do not reread unchanged context material. Already-read unchanged mandatory references/SKILL.md need no follow-up reread; newly triggered mandatory reads remain required.
- At plan completion or before another plan in a long session, record canonical handoff and recommend a new session.
- Before handoff briefly state role/objective/output; after return combine findings/next stage. Never expose hidden reasoning/raw prompts.

The [task envelope](handoff.md#orchestrator-direct-path-for-small-tasks) fits this fixed brief order: Goal carries task/path/outcome; Criteria carries IDs and checks; Exact scope/ownership carries target/state/ownership/record; Constraints/decisions carries approval, F1–F8, risk/depth and TDD; Evidence carries fingerprint and approval/check evidence; Prior findings carries changes, revalidation and holds; Exact next objective gives the bounded next goal; Return format requests evidence, limits and unresolved points. Give a new role its native profile and actual applicable instructions, not hash alone.

## Planner dispatch efficiency

Before Planner dispatch, evaluate F1–F8 direct-path eligibility and Bounded plan-omission eligibility independently. Enter each path only when all of that path's existing conditions are proven; if neither path qualifies, use normal full evaluation. Orchestrator can read a few already identified files; route material research and broad static exploration to Scouter. Planner briefs carry path/line-verified evidence and a Read/Grep exploration budget (default about 15 for Bounded and about 30 for Architectural when no task-specific number is set); additional broad exploration goes to Scouter, not Planner. Reuse one Planner only within the design/brainstorming stage (initial draft and its consolidated correction). After design approval, the spec stage and the plan stage each use a fresh Planner whose brief contains every required field plus saved document paths and approved versions; cite a prior brief only when it is an accessible file. Orchestrator may set a handback size limit in the brief.

<a id="models"></a>
## Models

Adjacent `models.toml` is authoritative for role models/effort. Orchestrator uses the current model. Do not substitute settings or reduce effort; report unavailability. Declarations prove no provider support/account access/alias resolution/actual model-effort application/concurrency/depth enforcement. New sessions reload profiles; running agents retain settings/parents. Changes do not automatically reparent or prove runtime parent behavior.

`arc_scouter`, `arc_planner`, `arc_implementer`, `arc_qa`, `arc_reviewer` settings map to hyphenated native names, not tool calls. For visualization read [visual companion](arc-visual-companion.md), use only actual allowlisted tools and report unavailable/unverified scope. Shipped `model`/`effort` defaults are replaced with active `models.toml` role settings at installation.

<a id="instruction-and-input-provenance"></a>
## Instruction and input provenance

Briefs identify source/applicability/version or approval/access state for user instructions, discovered workspace instructions, installed references and task inputs. Optional read recovery follows policy only; report first failure and dependent/independent work. Return missing required inputs without inventing authority/interpretation. Full fields follow [handoff](handoff.md#instruction-sources-bounded-read-recovery-visual-evidence-and-resumption).

[ARC role policy: contract begin]
Generated from lib/policy/role-policy.json; do not edit this managed section manually.
- [git.specialists-deny] Specialists MUST not change Git state during implementation or recovery: no stage, commit, push, merge, rebase, reset, branch creation/switching or worktree creation/removal. Explicit Orchestrator assignment cannot authorize these actions; return them to Orchestrator. Read-only Git inspection remains allowed within the assigned scope.
- [role.scouter-read-only] Research assigned static sources and report findings, evidence and limits. Do not edit, install, execute checks, prepare targets, inspect live operational state or change external state. Do not decide design, verification, review or acceptance.
- [role.planner-draft-only] Return design/brainstorming drafts and complete first spec/plan drafts with dependencies, criteria, holds and verification needs in the response. During initial drafting and revisions, report progress only to Orchestrator: briefly state the stage, feedback being applied, actual blocker or next step, without draft prose or excerpts. Return the complete first draft and self-review for Orchestrator review; Orchestrator directly revises the same spec or plan when needed. Raw responses may appear in app/tool surfaces; prompt policy cannot hide them. Do not save documents, implement, run checks, prepare targets, request user approval or decide acceptance. The first required document draft uses the verified source and selected target intent before target preparation. Require a verified prepared target before saving or handoff. Route decisions to Orchestrator.
- [role.implementer-implementation] Edit only assigned, approved files and run focused checks under the existing TDD contract. Report changed files, RED/GREEN or approved exception evidence, results, limits and follow-up. Do not plan, independently QA/review your own work, accept the task or declare overall completion. Git mutations remain forbidden after successful implementation. Implementer and fresh QA handoffs include the exact approved visual source, version, approval and access state; criterion IDs, required properties and comparison method; and actual-output identity, revision and comparison basis. Record pass, mismatch or unverified with accessible evidence and limits. Implementer self-report does not replace fresh QA and its actual comparison. A missing output-to-revision link is unverified; record a visible difference separately as mismatch without inferring current branch UI state. Missing source/output, inaccessible evidence or unapproved interpretation holds the affected visual claim for Orchestrator. Do not silently substitute or redesign.
- [role.qa-verification] Run approved checks and report commands, observations, reproduction, evidence and limits. Create only essential temporary data/logs/reports within brief-authorized locations and lifetimes. Do not edit product source, tests, fixtures or configuration to pass checks, deploy or accept work. Persistent product-state checks need explicit scope and cleanup ownership. Return failures for Implementer correction and required QA recheck. Implementer and fresh QA handoffs include the exact approved visual source, version, approval and access state; criterion IDs, required properties and comparison method; and actual-output identity, revision and comparison basis. Record pass, mismatch or unverified with accessible evidence and limits. Implementer self-report does not replace fresh QA and its actual comparison. A missing output-to-revision link is unverified; record a visible difference separately as mismatch without inferring current branch UI state. Missing source/output, inaccessible evidence or unapproved interpretation holds the affected visual claim for Orchestrator. Do not silently substitute or redesign.
- [role.reviewer-independent] Independently inspect assigned final changes and evidence, and report actionable findings and limits. Remain read-only: do not execute QA tests, edit files, perform Git mutations or decide acceptance.
- [platform.claude] Existing per-role tool allowlists reduce available tools; Bash and role contracts are not a filesystem sandbox. ARC supplies no native observer hook or Bash Git guard; Git restrictions remain prompt-level role contracts.
[ARC role policy: contract end]

## Composite Platform Role Dispatch

`Claude & Codex` keeps the current session as the Orchestrator. Each role runs either as a native `arc-routing-*` profile on the host or as a bridge: a child process of the peer CLI started by the runtime. Invoke `$ARC_RUNTIME_ENTRY` as described in [planning](planning.md#approved-cooperative-execution-path-within-the-repository): `node "$ARC_RUNTIME_ENTRY" <command> --cwd <absolute worktree> --workflow <workflow ID> --input -`, with one JSON object on stdin. Output is one JSON line. Exit codes: allow 0, deny 2, hold 3, error 1. Every input is validated against an exact key set; a missing or unknown key is denied with `invalid_request`. `hostPlatform` (`codex` or `claude`) and `executionEnvironment` (`codex-cli`, `claude-cli`, `codex-desktop`, or `claude-desktop`) are caller-provided claims, not host attestations.

Procedure, in order:

1. `routing-status` with `hostPlatform`, `executionEnvironment`. Reads the active revision, each role's route, profile, model and effort, platform authentication and CLI versions without reserving anything. Authentication and version probes start a child process. The Codex authentication probe refreshes the login token over the network through `codex app-server`; a permanently rejected refresh is `Unauthorized` and a probe that cannot decide is `Incomplete`.
2. `prepare-dispatch` with `hostPlatform`, `executionEnvironment`, `role` (`arc_scouter`, `arc_planner`, `arc_implementer`, `arc_qa`, or `arc_reviewer`), `expectedRevision` (the revision from step 1), `requestId`, `taskId`, and `allowedPaths` (worktree-relative path array; required and non-empty for `arc_implementer`, optional for `arc_qa` where empty or omitted allows no writes, omitted for other roles). `allow` returns `dispatchId`, the route and initial claims and reserves a lease; `hold` returns every reason with its release condition; `deny` rejects the request. Reuse of a `requestId`, or a non-terminal dispatch for the same workflow, task and role, is denied with `duplicate_dispatch`.
3. Native route: before spawning, compare the `[arc-routing rev <revision>]` tag in the agent list description with the `routing-status` revision. If it differs or is not shown, hold the role as `native_profile_reload_unverified` and report that a new session is required. Then spawn: Claude host Agent tool `subagent_type: "arc-routing-<suffix>"`; Codex host `spawn_agent` `agent_type: "arc_routing_<suffix>"` with the existing `fork_turns="none"` and `task_name` rules. Never pass a model argument; the profile decides. Record the lifecycle with `observe` using `dispatchId`, `event` (`started`, `completed`, `failed`, or `cancelled`) and `nativeAgentId`. `nativeAgentId` is required with `started` and forbidden with every other event. A `cancelled` event is also accepted for a `reserved` native lease that was never started (without `nativeAgentId`). These are `operator-attested` claims.
4. Bridge route: `run-dispatch` with `hostPlatform`, `executionEnvironment`, `dispatchId`, `brief` (UTF-8, at most 256 KiB, delivered on stdin only). It starts a detached supervisor and returns at once with `routeStatus` and `resultPath`. Then `observe` with `hostPlatform`, `executionEnvironment`, `dispatchId` and optional `waitMs` (0 to 540000). Use the maximum wait for each call and do not run a short polling loop. With `waitMs`, `observe` returns only when the dispatch reaches `completed`, `failed`, `cancelled` or `unknown`, or when `waitMs` elapses; a transition such as `starting` to `running` does not end the wait. `observe` returns status, claims, `resultPath` and reasons; `failed` and `unknown` are reported as hold (exit 3).
5. `resume` with `hostPlatform`, `executionEnvironment`, `dispatchId`, `brief`. It continues the same session as a new segment only for a dispatch in `completed` or `failed` state with a recorded session ID and an unchanged active revision (otherwise `revision_changed`). All flags are re-specified, the concurrency limit is checked again, and a session ID mismatch makes the state `unknown`. `unknown` and `cancelled` dispatches cannot be resumed. New QA or Reviewer assignments never reuse a session.
6. `cancel` with `hostPlatform`, `executionEnvironment`, `dispatchId`. A `reserved` lease (native or bridge) becomes `cancelled` at once; a `starting` or `running` native lease is denied and is closed with `observe` events. A cancelled `unknown` lease keeps its recorded reasons. A running child gets SIGTERM, a 10 second grace, then SIGKILL; the result is `cancelling` and `cancelled` is recorded only after exit is observed. A reused PID or missing child information (including a `starting` lease whose supervisor is lost and that has no child record) is left unchanged and the result is hold, because exit cannot be observed; clean it up manually.

Rules:

- Bridge children receive the profile instructions only and never load ARC `SKILL.md`. Role instructions forbid re-delegation. Claude children expose no Task tool.
- Fixed timeouts: `arc_implementer` 60 minutes, `arc_qa` 30 minutes, others 20 minutes. At timeout the child group is terminated; `failed` is recorded only after observed exit, otherwise `unknown`.
- `unknown` (`terminal_state_unverified`) keeps its slot and is never released or re-run automatically. After a supervisor loss, inspect the dispatch in `<CODEX_HOME>/arc-role-dispatch/` and its artifacts under `<gitCommonDir>/arc/workflows/<workflowId>/dispatches/<dispatchId>/` and perform manual cleanup. ARC does not delete or release such leases, nor residual lock files, automatically; it reports them. Only leases in `completed`, `failed` or `cancelled` for more than 30 days are pruned.
- Active bridge dispatches block publishing the composite configuration (`Active bridge dispatches: <ids>`); finish or cancel them first. Native leases do not block.
- `execution_identity_unverified` (no session ID was obtained) is recorded by the supervisor after exit and exposed by `observe`; `resume` holds with it for a dispatch without a session ID. The `run-dispatch` response and `prepare-dispatch` never carry it.
- A leftover orphaned process group after the child leader exits by itself is reaped (SIGTERM, grace, then SIGKILL) before the post-run snapshot is taken, and `orphanGroupReaped` is recorded; if the group cannot be observed gone the dispatch is `unknown` (`terminal_state_unverified`) and keeps its slot.
- For a Codex bridge the `permissions` claim is at most `operator-attested` and notes `user-config-mcp-not-controlled`, because the child loads the user's Codex configuration (for example MCP servers), which ARC does not control; its `supportStatus` is therefore never `verified`.
- Post-run detection compares the changed paths, `HEAD`, the branch and every Git ref. Branch, tag and other ref creation, deletion or movement during a run is a `permission_violation_observed` for every role, assuming no other Git activity changes refs during the run. Changes to Git-ignored paths are outside post-run detection.
- `ARC_BRIDGE_CHILD` is set in the environment of every bridge child; routing commands are denied in a process that has it. Re-running `codex exec` or `claude -p` through a shell is not a detected `delegation_observed` case and stays outside detection.
- Supported CLI versions: Claude Code `>=2.1.322 <2.2.0`, codex-cli `>=0.167.0 <0.168.0`. Outside the range, or when the version cannot be parsed, only that platform's bridge is held as `permission_scope_unverified`; native routes are unaffected.
- First-release support follows the recorded gates. Claude bridge `arc_implementer` and `arc_qa` on a Codex host (the only host with a Claude bridge) are held as `permission_scope_unverified` because the injected sandbox is not verified (G1); every bridge on a Codex host is currently held as `host_sandbox_blocked` as well (G2). In a Codex host sandbox writes to `CODEX_HOME` are denied (G2), so Codex-host bridges are conservatively held as `host_sandbox_blocked`; detached supervisor survival itself was observed under variant conditions, and native routes there remain supported. For Codex bridge children, re-delegation of a Codex child is not blocked, and a spawn found afterwards in its rollout fails the dispatch as `delegation_observed` (G3). Codex `workspace-write` may reach beyond the worktree (G5): writes outside the worktree are outside post-run detection. A `claude-cli` host supports native routes and Codex bridges. On Desktop hosts (`codex-desktop`, `claude-desktop`) every role (native and bridge) is held as `environment_unverified` in this release; the manual checklist in the ARC operation guide is a list of manual checks for a future ARC update that may change the support status, and recording it releases nothing. Even then `supportStatus` is at most `unverified`.
- On a Codex host ask the user for escalation approval each time `run-dispatch`, `resume`, `cancel`, or a lease-writing `prepare-dispatch` or `observe` runs. Without approval or on failure the result is `host_sandbox_blocked`.
- There is no automatic fallback, substitution or retry. On any hold, deny or failure, report the reasons and release conditions and do not use another model or platform. Run `routing-status` again only after the condition changed. Bridge dispatches count in the instance ledger; see [limits](limits.md).
- After an ARC upgrade that changes the cooperative runtime version, run Install / Update again; until then routing holds as `activation_unverified`.
