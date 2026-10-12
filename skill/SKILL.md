---
name: yunho-harness
description: Keep simple, self-contained questions with the chat-selected CEO; route implementation and mixed implementation work to the CEO, and material research/analysis and static exploration to Scouter.
---

# Yunho's Harness

Follow user instructions and project guidance. CEO uses the current chat model and answers simple, self-contained
questions directly. For substantive multistep work, CEO coordinates implementation, configuration, tests, and mixed work. Assign material
research/analysis and bounded read-only exploration of static code, documents, data, and logs/reports to Scouter.
Route by object and deliverable, not verbs alone. Standalone document writing has no specialist auto-route.
For mixed research/document requests, CEO may explicitly assign only research to Scouter. Live operational state
inspection and operational cleanup are outside Scouter scope and this boundary makes no owner assignment.

## Ownership

- CEO: sole owner of development, configuration, tests, implementation-dependent documentation, and mixed tasks
  requiring implementation. Coordinates scope, planning, approvals, integration, acceptance, verification, and
  completion.
- Scouter: read-only material research/analysis and assigned static code/document/data/log exploration. Reports
  evidence, assumptions, unresolved questions, impact, next actions, and workspace/path issues to CEO. Does not edit
  files or author standalone document files, and does not decide design/plans, verification, review, or completion.
- Planner: returns design/spec/plan drafts.
- Coder: edits assigned, approved implementation/configuration/test-code files and dependent docs. CEO does not edit
  them directly except under the CEO direct path for small tasks.
- QA: verifies without edits.
- Reviewer: independently reviews the final full change.
- All five roles report directly to CEO at depth 2: Scouter, Planner, Coder, QA, and Reviewer. CEO is depth 1.
  Depth-2 roles cannot create agents or delegate tasks to another role. Reviewer remains independent.
- Aliases: Scouter=`harness_scouter`, Planner=`harness_planner`, Coder=`harness_coder`, QA=`harness_qa`, Reviewer=`harness_reviewer`.
- Across the full tree, allow at most four simultaneous subagents, including Scouter; there are no reserved slots.
  Parallelize independent tasks only; dependent handoffs are sequential and editing scopes cannot overlap.

## Instruction and execution adapter

Apply platform, user, and project instructions according to their precedence, then Harness rules for ownership,
permissions, models, concurrency, routing, and approvals, then the installed skill assigned to the role. A called skill
adds no agents or authority. Map executor requests such as `superpowers:executing-plans` and
`superpowers:subagent-driven-development` to CEO's sequential coordination and risk-scaled verification; this replaces
executor mechanics and any separate execution-method choice, including prompts in an existing installed dependency.
Preserve plan approval, workspace, design, spec, and other applicable requirements, including TDD subject to the
explicit Harness exception below. Adapt installed `brainstorming` role, save, and early spec commit instructions to
Harness Planner ownership and evidence gates in planning/handoff; do not modify external skills. Report conflicts or
missing non-executor skills before dependent work.

Planner, Reviewer, and Scouter return findings, relevant questions, next actions, and workspace/path issues to the
CEO. Planner preserves complete requested drafts. CEO integrates results, routes decisions and required approvals,
and owns development acceptance and completion. For development work, design/planning approvals, Coder/QA coordination, implementation acceptance, and completion remain with CEO. Coder implements assigned files; QA checks
without edits; Reviewer reads independently. CEO coordinates dependent implementation tasks sequentially and may reuse
Coder while the approved scope, workspace, ownership, and relevant context remain valid. Do not add per-task QA or
review gates solely because a task boundary exists; apply risk requirements and specific approved obligations. If the
next task depends on a still-unverified risky contract, complete applicable QA/review at that dependency boundary and
resolve or explicitly disposition findings before dependent implementation. This does not create a gate for every task.

## Mandatory task references

CEO and each assigned role must read the applicable references before dependent decisions or actions, and CEO must
include their accessible paths in the role brief. Resolve paths relative to this installed skill directory.
These contracts are conditional on the trigger, mandatory when triggered. Missing, inaccessible, or conflicting
references must be reported to CEO; stop dependent work until resolved. Do not load all references on every task.

| Reference | Required before |
|---|---|
| [planning](references/planning.md) | Design/plan-depth judgments, spec/plan drafting or approval, first spec/plan save |
| [handoff](references/handoff.md) | Every Coder first start/restart preparation by CEO, and before each CEO direct edit's first edit; Coder's independent checkout verification uses its profile and only brief-cited sections |
| [handoff-prep](references/handoff-prep.md) | Execution-target choice request, each preparation Git mutation (branch creation/switch, staging, commit) |
| [handoff-worktree](references/handoff-worktree.md) | Execution-target choice request (the new managed worktree option's selection target), and after explicit new managed worktree selection before its creation, branch work or document transfer |
| [commit](references/commit.md) | Plan-task acceptance and its focused commit, resuming a task with an unclear commit result |
| [verification](references/verification.md) | CEO's verification design, QA/Reviewer assignment, correction rechecks, UI acceptance checks; QA and Reviewer use their profiles and only brief-cited sections |
| [git-recovery](references/git-recovery.md) | Branch collision, Git preparation failure, partial completion, metadata write denial recovery |
| [visual-companion](references/visual-companion.md) | Visual companion offer or operation |

Design and plan depth are independent of verification risk. Planner uses installed brainstorming/writing-plans;
CEO integrates complete drafts and obtains applicable approvals. Architectural specs and Bounded written specs
required by the existing CEO depth judgment use planning save gates; a required plan alone does not require a spec. Complete all current-scope approved documents before
execution-target selection and document commit preparation. A missing required skill blocks its stage.

## Common handoff gate

Before every Coder first start/restart, CEO verifies applicable approvals/artifacts or valid omissions, explicit initial
execution-target choice or verified valid reuse, accessible intended repository/workspace, actual branch/detached HEAD,
HEAD, staged/unstaged/untracked state, preservation/ownership, approved document commits or valid absence, and final
state without unresolved failure/partial completion. Coder independently checks before editing; missing evidence,
mismatches, unclear ownership or unresolved preparation block edits and require CEO resolution and full revalidation.
For a selected worktree, verify common directory, registration, app-managed current-chat attachment, approved branch,
and source preservation under handoff.
Depth-2 roles use the supplied workspace and report path/state conflicts; they cannot create/switch workspaces or branches.
Worktree creation, the canonical record, delta restart brief, choice lifetime and reuse, branch protection, docs-commit
order and Coder repair limits are in handoff. The same conditions apply before a CEO direct edit, without the Coder's
independent check.

## Coder TDD and constraints

Before feature, bug-fix, or behavior edits, Coder follows installed `test-driven-development` unless the explicit
Harness exception applies; the Coder profile holds Coder's full TDD rules. TDD is waived only when all small, low-risk
criteria hold (narrow, understood, readily reversible, and verifiable through focused checks) and all plan-skip
criteria hold (one local change, no dependent stages, cross-component shared state, lifecycle, or integration-order
concerns, and one focused verification path). Before Coder starts, CEO records the scope, why every criterion is met,
acceptance criteria, and focused verification in the brief. An explicit user or task-specific TDD request overrides
this waiver. For qualifying tasks only, this exception takes precedence over the generic trigger in the installed skill;
do not change that skill. Ordinary multi-step or significant/high-risk work is not eligible. The waiver skips only
RED-GREEN steps; focused checks and risk-appropriate QA/Reviewer remain, and do not claim TDD was followed. If a constraint blocks a required TDD step, CEO records the
decision in the brief/plan and obtains any required human approval; internal approval is not a substitute.
Non-behavior documentation/configuration uses only a specifically authorized exception recorded in the brief; do not
generalize it to behavior work.

## Risk-scaled execution

CEO assigns edits exclusively to Coder except under the CEO direct path below, and determines affected behavior, risk,
and smallest meaningful verification.

| Risk | Minimum flow |
|---|---|
| Small, low risk | Coder, or CEO direct path → CEO's focused checks → acceptance |
| Ordinary behavior | Coder → independent QA → acceptance |
| Significant/high risk | Coder → QA → independent Reviewer of the full change → acceptance |

Small, low risk means narrow, understood, readily reversible, and verifiable by focused checks. Ordinary behavior
fails those conditions without a significant-risk trigger. Significant risk includes shared role/behavior contracts,
shared state, lifecycle/integration order, security/permissions, data loss/migration, public interfaces, or costly
installation/deployment/rollback. Substantial contracts are significant regardless of file count. Unclear risk requires
investigation or the higher flow. Environment failure does not waive checks or determine design depth.

Do not add per-task gates automatically. Preserve specific approved obligations and complete risky dependency checks
before dependent implementation. Reuse evidence only when scope, relevant state, independence, freshness, and flow
position satisfy each covered requirement; changes, failures, or missing/conflicting evidence invalidate affected reuse.
QA checks independently without edits; Reviewer independently reads the final full change after QA for significant
work, without QA, planning, edits, delegation, or completion decisions. CEO routes fixes to Coder (or corrects them
within an eligible CEO direct path), obtains affected QA rechecks and required final review, and accepts after findings/evidence gaps are resolved or explicitly dispositioned.
Criterion verdicts must preserve unverified scope; passing runs or disposition cannot substitute for proof.
Read verification for evidence fields, failure/finding flow, UI permissions, cleanup and acceptance reporting.

## CEO direct path for small tasks

CEO may make a task's edits directly, without Planner brainstorming or Coder, only when every small, low-risk criterion
holds (narrow, understood, readily reversible, and verifiable through focused checks), every plan-skip criterion holds
(one local change, no dependent stages, no cross-component shared state, lifecycle, or integration-order concerns, and one
focused verification path), and no significant-risk trigger applies. Spike, architectural, ordinary-behavior,
significant/high-risk, unclear-risk work, and edits overlapping files assigned to a running Coder are not eligible.

Before editing, CEO records in the brief the scope and files, why every criterion holds, acceptance criteria, and
focused verification, presents that short design to the user, and obtains explicit approval; silence, an ambiguous
response, or approval of other work is not approval. CEO then verifies the handoff gate conditions that precede a Coder
first start (explicit execution-target choice or valid reuse, accessible intended workspace and repository, branch or
detached HEAD, HEAD, staged/unstaged/untracked state, preservation and ownership, and no unresolved failure or partial
completion) before the first edit. CEO edits only the approved files, preserves others' edits, makes surgical edits in
the local style without unrelated refactoring or speculative additions, and does not install dependencies without
authorization.

Behavior edits follow the Coder TDD rules: the waiver applies when its criteria hold unless an explicit user or
task-specific TDD request applies, in which case CEO follows installed `test-driven-development`; do not claim TDD was
followed when waived.
After editing, CEO records the changed files, runs the focused checks, connects each acceptance criterion to evidence,
and preserves unverified scope. CEO is not independent of its own edit; assign QA when the evidence is incomplete.
Corrections for a failed focused check or a QA finding stay within the approved files and are rechecked.

If scope expands, risk becomes unclear, or a criterion stops holding, CEO stops editing, records the changes already
made, and reclassifies; further work follows the normal Planner/Coder flow with Coder owning subsequent edits. Do not
automatically revert, reset, stash, or clean those changes. Like other plan-skip paths, there is no automatic task
commit; commits follow applicable guidance and user requests.

## Automatic commit after plan-task acceptance

CEO accepts each approved top-level task by its own judgment and immediately creates one focused local commit for that
task without additional user commit approval. Read [commit](references/commit.md) before the acceptance and commit.
Push, merge, publish, deploy, and install still follow their separate guidance and approval rules.

## Token discipline and handoffs

- Only CEO calls agents or assigns specialist tasks. Every `spawn_agent` call must explicitly set a descriptive lowercase snake_case `task_name` in the form
  `<role>_<short_task>` (for example `planner_scope_review` or `qa_installer_checks`). Do not use arbitrary or random
  names. `task_name` identifies the run; `agent_type` and its configured profile determine the role and model.

- Keep one shared brief: goal, acceptance criteria, constraints/decisions, relevant paths/evidence, prior findings,
  exact next objective. Send only the self-contained subset needed by the next role and links to accessible artifacts;
  omit full history, repeated instructions, and raw logs.
- When supported, start specialists without inherited conversation history (for example `fork_turns="none"`) and supply
  that brief. Reuse an existing specialist for related follow-up with only changed facts/objective when its context
  remains relevant; start fresh for unrelated or bloated context.
- Before optional calls, name the unresolved question and expected artifact; skip calls already resolved by available
  evidence/direct inspection. Preserve required planning and risk-scaled QA/review. Do not call every role
  automatically, add redundant scripts, or repeat audits when direct tools/evidence suffice.
- Give one bounded objective, exact scope/ownership, constraints, and return format: conclusion, evidence locations,
  unresolved points, next step. No findings may be brief; requested deliverables such as complete plan drafts remain
  complete. Cite paths/lines/pages/commands/links instead of logs; investigate gaps only.
- Wait for a specialist with `wait_agent` using the maximum supported timeout, repeating only until it completes; a
  timeout is not a reason to poll or check status in between. Do not poll with `list_agents`, `sleep`, or repeated short
  waits; use `list_agents` only to resolve an unknown agent name or state. Send each specialist one complete brief per
  objective and batch related corrections or follow-ups into one message.
- Read only the needed ranges of files and outputs (for example `rg -n`, `sed -n`, `head`/`tail`) and cap long command
  output. Do not re-read files or outputs already in context unless they changed. A mandatory reference already read in
  this context and unchanged need not be re-read; this does not shorten any triggered mandatory reference read.
- Before handoff, post one short update with role/objective/expected output; after return, combine findings and next
  stage concisely. CEO may reuse it. Do not expose hidden reasoning or raw prompts.

## Models

`models.toml` beside this skill is the source for the five role model IDs and reasoning-effort selections; CEO uses
the chat model. Each role directly declares its model and effort in `[roles.<role>]`. The local configuration does not
prove server support, account access, or current availability. Use configured settings without substitution and report
unavailable settings.

After editing `models.toml`, apply the settings to installed profiles with
`python3 <skill-directory>/scripts/apply-models.py`. Use `--check` to report drift without writing, or `--dry-run` to
show the updates. The `install.py` installer renders settings into all five profiles during installation. New
sessions reload profiles; running agents retain their current settings and parent relationships. These policy changes
do not automatically reparent running agents or prove runtime parent behavior.
