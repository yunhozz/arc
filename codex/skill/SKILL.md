---
name: arc
description: Keep simple, self-contained questions with the chat-selected Orchestrator; route implementation and mixed implementation work to the Orchestrator, and material research/analysis and static exploration to Scouter.
---

# ARC

{{ARC_OUTPUT_LANGUAGE_POLICY}}

Role gate: design, spec, plan, and brainstorming drafts are authored ONLY by Planner (`arc_planner`);
Orchestrator MUST NEVER author them and MUST NEVER invoke `brainstorming` or `writing-plans` through its own Skill tool.
If either auto-triggers in Orchestrator context, Orchestrator stops and routes to Planner, citing that skill's SKILL.md
path in the brief. A user request to skip questions never waives design or approval gates; Planner returns questions to
Orchestrator. Each top-level task (a plan task, or the whole request without a plan) gets a FRESH Coder,
and each task that needs QA (risk-scaled, unchanged) gets a FRESH QA, never one reused from another task;
same-task rechecks may reuse.

Follow user instructions and project guidance. Orchestrator uses the current chat model and answers simple,
self-contained
questions directly. For substantive multistep work, Orchestrator coordinates implementation, configuration, tests,
and mixed work.
Orchestrator handles research directly when the needed material is already in its context or the check is a quick read
of a few known
files; all other material research/analysis and bounded exploration (read-only, of static code, documents, data, and
logs/reports) goes to Scouter with its configured settings (a bounded lookup gets a narrow brief: known paths,
specific facts, no synthesis). Route by object and deliverable, not verbs alone.
Standalone document writing has no specialist auto-route. Design, spec, plan, and brainstorming drafts are not
standalone document writing (see Role gate).
For mixed research/document requests, Orchestrator may explicitly assign only research to Scouter.
Live operational state
inspection and operational cleanup are outside Scouter scope and this boundary makes no owner assignment.

## Ownership

- Orchestrator: sole owner of development, configuration, tests, implementation-dependent documentation, and mixed tasks
  requiring implementation, assigning their edits to Coder. Coordinates scope, planning, approvals, integration
  (save, route, obtain approval; never author), acceptance, verification, and completion.
- Scouter: read-only material research/analysis and assigned static code/document/data/log exploration. Reports
  evidence, assumptions, unresolved questions, impact, next actions, and workspace/path issues to Orchestrator.
  Does not edit
  files or author standalone document files, and does not decide design/plans, verification, review, or completion.
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
explicit ARC exception below. Adapt local `brainstorming` role, save, and early spec commit instructions to
ARC Planner ownership and evidence gates in planning/handoff; preserve upstream reference content. Report conflicts or
missing required local references before dependent work.


### Local superpowers references

Orchestrator briefs absolute paths under the selected installed ARC directory: Planner reads
`references/superpowers/brainstorming/SKILL.md` and `references/superpowers/writing-plans/SKILL.md`;
Coder reads `references/superpowers/test-driven-development/SKILL.md`, including required relative references.
Resolve paths within each skill directory. Runtime needs no global discovery, external Skill invocation, or automatic download.
Missing/damaged local files stop dependent work: report exact paths to Orchestrator, without global fallback.
ARC approval, ownership, TDD exceptions and executor adapters still apply.

Orchestrator integrates role results, routes decisions and required approvals,
and owns development acceptance and completion. Orchestrator coordinates dependent implementation tasks sequentially and
starts
a fresh Coder for each top-level task (Role gate); reuse the current Coder only for corrections, rework,
or rechecks of the same task while the
approved scope, workspace, ownership, and relevant context remain valid; before sending corrections or rework to a
reused Coder, Orchestrator rechecks workspace, branch/HEAD and change state against the brief.
A fresh Coder for the next task is a restart under handoff (choice reuse and restart brief rules are there).
After an approved plan or acceptance-criteria amendment, start a fresh Coder for
the remaining work even within the same task; it is also a restart under handoff. Task-boundary gates
follow Risk-scaled execution.

## Dependency analysis and parallel dispatch

Before the first Coder assignment for an approved plan, Orchestrator records its dependency/readiness map and
initial ready batch under [planning](references/planning.md), which owns record fields and readiness conditions.
File separation alone never proves independence. Pass the full approval/preparation and handoff gates for every
assignment; unresolved dependencies, shared contracts, or ownership conflicts hold affected work.
Start all ready independent tasks concurrently with fresh Coders within capacity under [limits](references/limits.md)
and any lower actual runtime limit; record capacity and serialization reasons. Same-file concurrent Coder edits are
prohibited, even on different lines. ARC's cap is not a claim of runtime capability.

Reassess readiness after completion reports, new check evidence, acceptance, commit, slot return, or a new conflict.
Coder completion alone does not release dependents: require predecessor checks, Orchestrator acceptance and verified
focused commit, or accepted no-change evidence under [commit](references/commit.md). Start newly ready tasks without
waiting for unrelated batch members; failures hold affected dependents while unaffected ready work may continue.
Preserve risk-scaled QA/Reviewer timing and execution-target restrictions. Shared-checkout Git coordination belongs to
commit.md; refresh assignment evidence under [handoff](references/handoff.md).

## Shared terms

The handoff, git-recovery, and commit references and the Coder profile use these terms; context-specific commands,
paths, and state checks still apply.

- **Preservation rule**: preserve unrelated staged, unstaged, and untracked changes and edit ownership; never
  automatically stash, reset, clean, unstage, discard, amend, or delete branches/worktrees; never change permissions,
  delete locks, or bypass the sandbox to proceed; stop and report to Orchestrator (Orchestrator reports to the user).
- **Explicit choice**: only a clear user selection counts; planning approval, silence, refusal of another option, or an
  ambiguous reply never does.
- **Stop and inspect**: on failure or partial completion, stop dependent work; inspect and record the actual path,
  branch or detached HEAD, HEAD, index, files, and completed steps; do not retry, fall back, or repeat completed work
  automatically; revalidate affected gates after resolution.
- **Evidence verdict**: each criterion is proven, unmet, or unverified; passing runs, reports, or disposition never
  turn unverified into proven; reports keep unverified scope visible.

## Mandatory task references

Orchestrator and each assigned role must read the applicable references before dependent decisions or actions,
and Orchestrator must
include in the role brief the accessible path and section name of each reference section the role must read.
Resolve paths relative to this installed skill directory.
These contracts are conditional on the trigger, mandatory when triggered. Missing, inaccessible, or conflicting
references must be reported to Orchestrator; stop dependent work until resolved.
Do not load all references on every task.

| Reference | Required before |
|---|---|
| [planning](references/planning.md) | Design/plan-depth judgments, spec/plan drafting or approval, first spec/plan save |
| [handoff](references/handoff.md) | Every Coder first start/restart preparation by Orchestrator, and before each Orchestrator direct edit's first edit; Coder trusts the Orchestrator-verified brief under its profile and reads only brief-cited sections |
| [handoff-prep](references/handoff-prep.md) | Execution-target choice request, each preparation Git mutation (branch creation/switch, staging, commit) |
| [handoff-worktree](references/handoff-worktree.md) | After explicit new managed worktree selection, before its creation, branch work or document transfer |
| [commit](references/commit.md) | Plan-task acceptance and its focused commit, resuming a task with an unclear commit result |
| [verification](references/verification.md) | Orchestrator's verification design, QA/Reviewer assignment, correction rechecks, UI acceptance checks; QA and Reviewer use their profiles and only brief-cited sections |
| [git-recovery](references/git-recovery.md) | Branch collision, Git preparation failure, partial completion, metadata write denial recovery |
| [visual-companion](references/visual-companion.md) | Visual companion offer or operation |

Design and plan depth are independent of verification risk. Planner alone uses local brainstorming/writing-plans
(Role gate); Planner proposes, Orchestrator decides the path and plan depth;
Orchestrator integrates complete drafts and obtains applicable approvals. Architectural specs and Bounded written specs
required by Orchestrator's recorded plan-depth judgment (planning item 3) use planning save gates; a required plan alone
does not require a spec. Obtain explicit execution-target choice and verify actual target preparation before formal drafting
and saving. Complete all current-scope individual document approvals before the batch docs commit. A missing required skill blocks its stage.

## Common handoff gate

Before every Coder first start/restart, Orchestrator passes the full gate in
[handoff](references/handoff.md): applicable approvals/artifacts or valid omissions, explicit execution-target choice
or verified reuse, intended accessible repository/workspace, actual Git identity/state, preservation/ownership,
verified document commits or valid absence, and no unresolved failure/partial completion.
Missing evidence, mismatches, unclear ownership or unresolved preparation block handoff and require Orchestrator
resolution and full revalidation. Handoff owns the evidence fields, canonical handoff record, restart brief, choice lifetime
and reuse. Coder trusts the Orchestrator-verified brief and reports actual conflicts under its self-contained profile;
never replace its local guards with a requirement to load Orchestrator procedures.
Depth-2 roles use the supplied workspace and report path/state conflicts; they cannot create/switch workspaces or
branches. The same conditions apply before a Orchestrator direct edit.
For a selected worktree, handoff requires common directory, registration, app-managed current-chat attachment,
approved branch, and source preservation; prepare only through the selected managed-worktree contract.

## Coder TDD and constraints

Before feature, bug-fix, or behavior edits, Coder follows local `test-driven-development` unless the explicit
ARC exception applies; the Coder profile holds Coder's full TDD rules. TDD is waived only when every small,
low-risk criterion (Risk-scaled execution) and every plan-skip criterion (Orchestrator direct path) holds.
Before Coder starts,
Orchestrator records the scope, why every criterion is met, acceptance criteria, and focused verification in the brief.
An explicit user or task-specific TDD request overrides
this waiver. For qualifying tasks only, this exception takes precedence over the generic trigger in the local reference;
do not change that skill. Ordinary multi-step or significant/high-risk work is not eligible. The waiver skips only
RED-GREEN steps; focused checks and risk-appropriate QA/Reviewer remain, and do not claim TDD was followed.
If a constraint blocks a required TDD step, Orchestrator records the
decision in the brief/plan and obtains any required human approval; internal approval is not a substitute.
Non-behavior documentation/configuration uses only a specifically authorized exception recorded in the brief; do not
generalize it to behavior work.

## Risk-scaled execution

Orchestrator assigns edits exclusively to Coder except under the Orchestrator direct path below, and determines affected
behavior, risk,
and smallest meaningful verification.

| Risk | Minimum flow |
|---|---|
| Small, low risk | Coder, or Orchestrator direct path → Orchestrator's focused checks → acceptance |
| Ordinary behavior | Coder → independent QA → acceptance |
| Significant/high risk | Coder → QA → independent Reviewer of the final full change → acceptance; with a plan, each plan task Coder → FRESH QA → acceptance/commit satisfies the QA step, then independent Reviewer once on the final full change after all plan tasks |

Ordinary and significant plan tasks need a FRESH QA before acceptance; only small, low-risk tasks may be accepted on
Orchestrator focused checks. Small, low risk means narrow, understood, readily reversible, and verifiable by focused
checks. Ordinary behavior
fails those conditions without a significant-risk trigger. Significant risk includes shared role/behavior contracts,
shared state, lifecycle/integration order, security/permissions, data loss/migration, public interfaces, or costly
installation/deployment/rollback. Substantial behavior or contract changes are significant regardless of file count.
Unclear risk requires
investigation or the higher flow. Environment failure does not waive checks or determine design depth.

Do not add per-task QA or review gates solely because a task boundary exists. Reviewer is never a plan-task acceptance
prerequisite; for significant work with a plan, it reviews the final full change once after all plan tasks are accepted
with their risk-scaled checks, following the last plan task's required checks and any QA recheck at the final relevant
state; significant work without a plan keeps Reviewer after QA before acceptance. Preserve specific approved
obligations. If the next task depends on a still-unverified risky contract, complete applicable QA at that dependency
boundary and resolve or explicitly disposition findings before dependent implementation.
Reuse evidence only when scope, relevant state, independence, freshness, and flow
position satisfy each covered requirement; changes, failures, or missing/conflicting evidence invalidate affected reuse.
QA checks independently without edits; Reviewer reviews without QA, planning, edits, delegation, or completion
decisions. Orchestrator routes fixes to Coder (a failed direct-path check returns to the normal flow),
obtains affected QA rechecks and required final review, and accepts after findings/evidence gaps are resolved or
explicitly dispositioned.
Criterion verdicts follow the Evidence verdict.


## Orchestrator direct path for small tasks

Orchestrator may make a task's edits directly, without Planner brainstorming or Coder, only when every small,
low-risk criterion
holds, every plan-skip criterion holds
(one local change, no dependent stages, no cross-component shared state, lifecycle, or integration-order concerns,
and one
focused verification path), and no significant-risk trigger applies. Spike, architectural, ordinary-behavior,
significant/high-risk, unclear-risk work, and edits overlapping files assigned to a running Coder are not eligible.

Before editing, Orchestrator records in the brief the scope and files, why every criterion holds, acceptance criteria,
and
focused verification, presents that scope record (not a brainstorming design) to the user, and obtains explicit
approval; silence, an ambiguous
response, or approval of other work is not approval. Orchestrator then passes the Coder handoff gate in handoff,
with the
approved scope record as the applicable approval, before the first edit. Orchestrator edits only the approved files,
preserves others' edits, makes surgical edits in
the local style without unrelated refactoring or speculative additions, and does not install dependencies without
authorization.

Behavior edits follow Coder TDD and constraints; when TDD applies, Orchestrator follows local
`test-driven-development`.
After editing, Orchestrator records the changed files, runs the focused checks, connects each acceptance criterion to
evidence,
and preserves unverified scope. Orchestrator is not independent of its own edit; assign QA when the evidence is
incomplete.
After a failed focused check or a QA finding, Orchestrator routes the correction to Coder and obtains a recheck.

If scope expands, risk becomes unclear, or a criterion stops holding, Orchestrator stops editing, records the changes
already
made, and reclassifies; further work follows the normal Planner/Coder flow with Coder owning subsequent edits. Do not
automatically revert, reset, stash, or clean those changes. Like other plan-skip paths, there is no automatic task
commit; commits follow applicable guidance and user requests.

## Automatic commit after plan-task acceptance

Orchestrator accepts each approved top-level task by its own judgment and immediately creates one focused local commit
for that
task without additional user commit approval. Read [commit](references/commit.md) before the acceptance and commit.
Push, merge, publish, deploy, and install still follow their separate guidance and approval rules.

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
- Before optional calls, name the unresolved question and expected artifact; skip calls already resolved by available
  evidence/direct inspection.
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
