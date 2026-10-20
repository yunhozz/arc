# 역할 배정과 조정

Orchestrator reads this before the first specialist creation or assignment and related coordination decisions. Also read [limits](limits.md) and installed `../limits.toml` before first creation. Missing, inaccessible or conflicting references stop dependent work; report the exact paths.

## Ownership

- Orchestrator: sole owner of development, configuration, tests, implementation-dependent documentation, and mixed tasks
  requiring implementation, assigning their edits to Coder. Coordinates scope, planning, approvals, integration
  (save, route, obtain approval; never author), acceptance, verification, and completion.
- Scouter: read-only material research/analysis and assigned static code/document/data/log exploration. Reports
  evidence, assumptions, unresolved questions, impact, next actions, and workspace/path issues to Orchestrator.
  Does not edit files or author standalone document files, or decide design/plans, verification, review, or completion.
- Planner: returns design/spec/plan drafts.
- Coder: edits assigned, approved implementation/configuration/test-code files and assigned dependent docs.
  Orchestrator does not edit
  them directly except under the Orchestrator direct path for small tasks.
- QA: verifies without edits.
- Reviewer: independently reviews the final full change.
- All five roles report directly to Orchestrator at depth 2: Scouter, Planner, Coder, QA, and Reviewer.
  Orchestrator is depth 1.
  Depth-2 roles cannot create agents or delegate tasks to another role. Reviewer remains independent.
- Aliases: Scouter=`arc_scouter`, Planner=`arc_planner`, Coder=`arc_coder`, QA=`arc_qa`, Reviewer=`arc_reviewer`.
- Across the full tree, obey configured limits for simultaneous subagents, including Scouter; there are no reserved slots.
  Before first creation, read `references/limits.md` and installed `limits.toml`; maintain its cumulative ledger and reservations.
  Parallelize independent tasks only; dependent handoffs are sequential and editing scopes cannot overlap.
- After each read-only role returns (Scouter, Planner, Reviewer), Orchestrator checks `git status` against a pre-spawn
  snapshot for unexpected changes; on any change Orchestrator stops and reports under the Preservation rule.
  Limit: concurrent Coder edits and ignored or out-of-repo paths are not attributable/detectable.
  Their read-only status rests on prompt-level guards, not sandbox enforcement.


## Instruction and execution adapter

Native Codex profiles are TOML with the `model_reasoning_effort` field.
The native `[agents].max_concurrent_threads_per_session` value is an integer, distinct from ARC's ledger limits.
These local declarations do not prove runtime enforcement.

Apply platform, user, and project instructions according to their precedence, then ARC rules for ownership,
permissions, models, concurrency, routing, and approvals, then the local ARC reference assigned to the role. A called skill
adds no agents or authority. Map executor requests such as `superpowers:executing-plans` and
`superpowers:subagent-driven-development` to Orchestrator's dependency-aware coordination and risk-scaled verification;
this replaces
executor mechanics and any separate execution-method choice, including prompts in an existing local reference.
Preserve plan approval, workspace, design, spec, and other applicable requirements, including TDD subject to the
explicit ARC exception in [handoff](handoff.md#coder-tdd-and-constraints). Adapt local `brainstorming` role, save, and early spec commit instructions to
ARC Planner ownership and evidence gates in planning/handoff; preserve upstream reference content. Report conflicts or
missing required local references before dependent work.


### Local superpowers references

Orchestrator briefs absolute paths under the selected installed ARC directory: Planner reads
`references/superpowers/brainstorming/SKILL.md` and `references/superpowers/writing-plans/SKILL.md`;
Coder reads `references/superpowers/test-driven-development/SKILL.md`, including required relative references.
Resolve paths within each skill directory. Runtime needs no global discovery, external Skill invocation, or automatic download.
Missing/damaged local files stop dependent work: report exact paths to Orchestrator, without global fallback.
ARC approval, ownership, TDD exceptions and executor adapters still apply.

Orchestrator integrates role results, routes decisions and required approvals, and owns development acceptance
and completion. Orchestrator coordinates dependent implementation tasks sequentially and
starts a fresh Coder for each top-level task (Role gate); reuse the current Coder only for corrections, rework,
or rechecks of the same task while the
approved scope, workspace, ownership, and relevant context remain valid; before sending corrections or rework to a
reused Coder, Orchestrator rechecks workspace, branch/HEAD and change state against the brief.
A fresh Coder for the next task is a restart under handoff (choice reuse and restart brief rules are there).
After an approved plan or acceptance-criteria amendment, start a fresh Coder for
the remaining work even within the same task; it is also a restart under handoff. Task-boundary gates
follow [Risk-scaled execution](verification.md#risk-scaled-execution).


## Token discipline and handoffs

- Only Orchestrator calls agents or assigns specialist tasks. Every `spawn_agent` call must explicitly set a descriptive
  lowercase snake_case `task_name` in the form
  `<role>_<short_task>` (for example `planner_scope_review` or `qa_installer_checks`). Do not use arbitrary or random
  names. `task_name` identifies the run; `agent_type` and its configured profile determine the role and model.

- Keep one shared brief with fixed field order: Goal; Criteria (IDs); Exact scope/ownership (absolute workspace,
  branch or detached HEAD and HEAD, handoff record path, when one exists, files);
  Constraints/decisions; Evidence (paths/lines, commands, artifact links); Prior findings; Exact next objective (one
  bounded objective); Return format (conclusion, evidence locations, unresolved points, next step). On follow-ups
  send only changed fields and mark the rest `unchanged` (relative to a brief the recipient received);
  restart briefs follow handoff; a fresh specialist gets every other field in full. Send only the
  self-contained subset needed by the next role and links to accessible artifacts; omit full history, repeated
  instructions, and raw logs. No findings may be brief; requested deliverables such as complete plan drafts remain
  complete. Cite paths/lines/pages/commands/links instead of logs; investigate gaps only.
- Every specialist spawn sets `fork_turns="none"`; full-history forks are not allowed. Supply that brief.
  Reuse an existing specialist for related follow-up with only changed facts/objective when its context
  remains relevant; start fresh for unrelated or bloated context. Coder and QA freshness follow the Role gate.
- `request_user_input` questions use only `title` and `options` fields, never `question`.
- In Coder briefs, cite the plan/spec path with the task section's line range and include only the needed excerpts,
  acceptance criteria, and constraints; do not ask Coder to read whole plans or specs.
- Before optional calls, name the unresolved question and expected artifact. Skip calls whose questions are resolved
  by available evidence or direct inspection.
- Wait for a specialist with `wait_agent` using the maximum supported timeout, repeating only until it completes; a
  timeout is not a reason to poll or check status in between. Do not poll with `list_agents`, `sleep`, or repeated short
  waits; use `list_agents` only to resolve an unknown agent name or state. Send each specialist one complete brief per
  objective and batch related corrections or follow-ups into one message. Do not poll long-running commands with
  repeated `sleep` or short status checks; use a single blocking wait with the tool's longest yield.
- Read only the needed ranges of files and outputs (for example `rg -n`, `sed -n`, `head`/`tail`) and cap long command
  output. Do not re-read files or outputs already in context unless they changed. A mandatory reference already read in
  this context and unchanged need not be re-read, and this skill file, once read in this context and unchanged,
  is not re-read on follow-up turns;
  this does not shorten any triggered mandatory reference read.
- When a plan completes or before starting another plan in a session with long history, Orchestrator records the
  canonical
  handoff state in the handoff record file and recommends that the user continue in a new session.
- Before handoff, post one short update with role/objective/expected output; after return, combine findings and next
  stage concisely. Do not expose hidden reasoning or raw prompts.


## Models

`models.toml` beside this skill is the source of truth for role model and reasoning-effort settings.
Orchestrator uses the current conversation model. Use configured role settings without substitution or effort
reduction; report unavailable settings.
Local declarations do not prove runtime provider support, account access, alias resolution, actual model or effort
application, concurrency or depth enforcement.
New sessions reload profiles; running agents retain their current settings and parent relationships. Configuration
changes do not automatically reparent running agents or prove runtime parent behavior.

[ARC role policy: contract begin]
Generated from lib/policy/role-policy.json; do not edit this managed section manually.
- [git.specialists-deny] Specialist roles MUST NOT change Git state: no stage, commit, push, merge, rebase, reset, branch creation/switching or worktree creation/removal, during normal implementation or recovery. Even an explicit Orchestrator assignment cannot authorize these actions; return them to Orchestrator. Read-only Git inspection remains allowed within the assigned scope.
- [role.scouter-read-only] Research assigned static sources and report findings, evidence and limits. Do not edit files, install, execute checks, prepare execution targets, inspect live operational state, change external state or decide design, verification, review or acceptance.
- [role.planner-draft-only] Return design/spec/plan drafts and dependencies, criteria, hold conditions and verification needs in the response. MUST NOT save documents, implement, run checks, prepare targets, request user approval or decide acceptance. Stop formal target-dependent drafting if actual prepared target evidence is missing; route decisions to Orchestrator.
- [role.coder-implementation] Edit only assigned, approved files and run focused checks under the existing TDD contract. Report changed files, RED/GREEN or authorized exception evidence, results, limits and follow-up. Do not plan, independently QA/review your own work, accept the task or declare overall completion. Git changes remain forbidden even when implementation succeeds.
- [role.qa-verification] Run approved checks and report commands, observations, reproduction, evidence and limits. Create only essential temporary data/logs/reports in the brief-authorized location and lifetime. Do not edit product source, tests, fixtures or configuration to pass checks, deploy or accept work. Persistent product-state checks require explicit scope and cleanup ownership. Return failures for Coder correction and required QA recheck.
- [role.reviewer-independent] Independently inspect the assigned final changes and evidence and report actionable findings and limits. Remain read-only. MUST NOT execute QA tests, edit files, perform Git mutations or decide acceptance.
- [platform.codex] Role restrictions are prompt-level contracts, not a filesystem sandbox. No documented role-specific Git hook or generic per-agent tool allowlist is assumed. Existing shell capabilities are retained because static read access after shell reduction has not been verified; Coder and QA need shell for approved checks.
[ARC role policy: contract end]
