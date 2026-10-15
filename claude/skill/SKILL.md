---
name: yunho-harness
description: Coordinate scoped research planning implementation verification and review using Claude native roles
---

# Yunho Harness for Claude Code

Follow user instructions and project guidance. CEO uses the current chat model and answers simple, self-contained
questions directly. For substantive multistep work, CEO coordinates implementation, configuration, tests, and mixed work. Assign material
research/analysis and bounded read-only exploration of static code, documents, data, and logs/reports to Scouter.
CEO handles research directly when the needed material is already in its context or the check is a quick read of a few known
files; a bounded lookup (known paths, locating or extracting specific facts, no synthesis) goes to Scouter with a bounded brief under Models; material research, synthesis, or broad exploration uses Scouter's configured settings; when unsure,
use configured settings. Route by object and deliverable, not verbs alone. Standalone document writing has no specialist auto-route.
For mixed research/document requests, CEO may explicitly assign only research to Scouter. Live execution-state investigation or cleanup are outside Scouter scope and this boundary makes no owner assignment.

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
- Claude native subagent names: Scouter=`harness-scouter`, Planner=`harness-planner`, Coder=`harness-coder`, QA=`harness-qa`, Reviewer=`harness-reviewer`.
- Across the full tree, allow at most four simultaneous subagents, including Scouter; there are no reserved slots.
  Parallelize independent tasks only; dependent handoffs are sequential and editing scopes cannot overlap. These are
  Harness limits, not verified runtime concurrency or depth capabilities. Use Claude native subagent execution with
  the installed native name and receive its completion result; report unavailable execution capabilities to CEO.
- Scouter, Planner, and Reviewer do not edit, execute commands, or save standalone documents; QA verifies without edits.
  Each role stays within its shipped tool allowlist; a tool list is not a filesystem sandbox.

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
and owns development acceptance and completion. CEO coordinates dependent implementation tasks sequentially and starts
a fresh Coder for each top-level task; reuse the current Coder only for corrections, rework, or rechecks of the same task while the
approved scope, workspace, ownership, and relevant context remain valid; before sending corrections or rework to a reused Coder, CEO rechecks workspace, branch/HEAD and change state against the brief. A fresh Coder for the next task in the same
approved scope is a restart under handoff: it reuses a still-valid initial execution-target choice with fresh state
checks and a delta-only restart brief (delta relative to the record file the fresh Coder reads; every other brief field in full). After an approved plan or acceptance-criteria amendment, start a fresh Coder for
the remaining work even within the same task; it is also a restart under handoff with a delta brief. Do not add per-task QA or
review gates solely because a task boundary exists; apply risk requirements and specific approved obligations. If the
next task depends on a still-unverified risky contract, complete applicable QA at that dependency boundary and
resolve or explicitly disposition findings before dependent implementation. This does not create a gate for every task.

## Shared terms

The handoff, git-recovery, and commit references and the Coder profile use these terms; context-specific commands,
paths, and state checks still apply.

- **Preservation rule**: preserve unrelated staged, unstaged, and untracked changes and edit ownership; never
  automatically stash, reset, clean, unstage, discard, amend, or delete branches/worktrees; never change permissions,
  delete locks, or bypass the sandbox to proceed; stop and report to CEO (CEO reports to the user).
- **Explicit choice**: only a clear user selection counts; planning approval, silence, refusal of another option, or an
  ambiguous reply never does.
- **Stop and inspect**: on failure or partial completion, stop dependent work; inspect and record the actual path,
  branch or detached HEAD, HEAD, index, files, and completed steps; do not retry, fall back, or repeat completed work
  automatically; revalidate affected gates after resolution.
- **Evidence verdict**: each criterion is proven, unmet, or unverified; passing runs, reports, or disposition never
  turn unverified into proven; reports keep unverified scope visible.

## Mandatory task references

CEO and each assigned role must read the applicable references before dependent decisions or actions, and CEO must
include in the role brief the accessible path and section name of each reference section the role must read. Resolve paths relative to this installed skill directory.
These contracts are conditional on the trigger, mandatory when triggered. Missing, inaccessible, or conflicting
references must be reported to CEO; stop dependent work until resolved. Do not load all references on every task.

| Reference | Required before |
|---|---|
| [planning](references/planning.md) | Design/plan-depth judgments, spec/plan drafting or approval, first spec/plan save |
| [handoff](references/handoff.md) | Every Coder first start/restart preparation by CEO, and before each CEO direct edit's first edit; Coder trusts the CEO-verified brief under its profile and reads only brief-cited sections |
| [handoff-prep](references/handoff-prep.md) | Execution-target choice request, each preparation Git mutation (branch creation/switch, staging, commit) |
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
state without unresolved failure/partial completion. Missing evidence, mismatches, unclear ownership or unresolved
preparation block handoff and require CEO resolution and full revalidation. Coder trusts these CEO-verified brief
facts without re-verifying them or asking CEO to reconfirm them, and reports only conflicts it actually hits while working.
Depth-2 roles use the supplied workspace and report path/state conflicts; they cannot create/switch workspaces or branches.
The canonical handoff record, delta restart brief, choice lifetime and reuse, branch protection, docs-commit
order are in handoff; Coder repair limits are in the Coder profile. The same conditions apply before a CEO direct edit.

Claude v1 supports the current checkout only. Present the actual workspace, branch/HEAD and exact proposed branch
name/base, and obtain an explicit choice to reuse the current branch or create a task branch before preparation.
Commit the approved planning documents together before Coder starts. Keep the canonical handoff record outside the
working tree under the Git common directory. Harness-managed worktree execution is unsupported; report an isolated
worktree request before dependent work and obtain an approved supported target. Do not create, move, restore,
archive or attach worktrees as a fallback; preserve existing user checkouts.

## Coder TDD and constraints

Before feature, bug-fix, or behavior edits, Coder follows installed `test-driven-development` unless the explicit
Harness exception applies; the Coder profile holds Coder's full TDD rules. TDD is waived only when every small,
low-risk criterion (Risk-scaled execution) and every plan-skip criterion (CEO direct path) holds. Before Coder starts,
CEO records the scope, why every criterion is met, acceptance criteria, and focused verification in the brief. An explicit user or task-specific TDD request overrides
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
| Significant/high risk | Coder → QA → independent Reviewer of the final full change → acceptance; with a plan, each plan task risk-scaled Coder → QA or CEO focused checks → acceptance/commit satisfies the QA step, then independent Reviewer once on the final full change after all plan tasks |

Small, low risk means narrow, understood, readily reversible, and verifiable by focused checks. Ordinary behavior
fails those conditions without a significant-risk trigger. Significant risk includes shared role/behavior contracts,
shared state, lifecycle/integration order, security/permissions, data loss/migration, public interfaces, or costly
installation/deployment/rollback. Substantial behavior or contract changes are significant regardless of file count. Unclear risk requires
investigation or the higher flow. Environment failure does not waive checks or determine design depth.

Do not add per-task gates automatically. Reviewer is never a plan-task acceptance prerequisite; for significant work with a
plan, it reviews the final full change once after all plan tasks are accepted with their risk-scaled checks, following the last plan task's required checks and any QA recheck at the final relevant state; significant work without a plan
keeps Reviewer after QA before acceptance. Preserve specific approved obligations and complete risky dependency checks
before dependent implementation. Reuse evidence only when scope, relevant state, independence, freshness, and flow
position satisfy each covered requirement; changes, failures, or missing/conflicting evidence invalidate affected reuse.
QA checks independently without edits; Reviewer independently reads the final full change after QA for significant
work, without QA, planning, edits, delegation, or completion decisions. CEO routes fixes to Coder (or corrects them
within an eligible CEO direct path), obtains affected QA rechecks and required final review, and accepts after findings/evidence gaps are resolved or explicitly dispositioned.
Criterion verdicts follow the Evidence verdict.
Read verification for evidence fields, failure/finding flow, UI permissions, cleanup and acceptance reporting.

## CEO direct path for small tasks

CEO may edit directly only when every small, low-risk criterion holds: narrow, understood, readily reversible, and verifiable through focused checks. Every plan-skip criterion must also hold: one local change, no dependent stages, no cross-component shared state, lifecycle, or integration-order concerns, and one focused verification path. Significant, architectural, ordinary-behavior, unclear-risk work and edits overlapping a running Coder's assigned files are ineligible.

Significant risk includes shared role/behavior contracts, shared state, lifecycle/integration order, security/permissions, data loss/migration, public interfaces, or costly installation/deployment/rollback, and excludes work from the CEO direct path. Substantial behavior or contract changes are significant regardless of file count. Unclear risk requires investigation or the higher flow; do not infer eligibility from a small file count.

Before editing, CEO records a short design with scope and files, why every criterion holds, acceptance criteria, and focused verification; presents it to the user and obtains explicit approval before the first edit. Silence, an ambiguous response, or approval of other work is not approval. CEO then verifies the same handoff gate as a Coder first start: explicit execution-target choice or valid reuse, accessible intended workspace and repository, branch or detached HEAD, HEAD, staged/unstaged/untracked state, preservation and ownership, and no unresolved failure or partial completion. Read the [handoff](references/handoff.md) and [handoff preparation](references/handoff-prep.md) references before checking this gate.

CEO edits only the approved files, preserves others' edits, and makes surgical changes without unrelated refactoring or unapproved dependencies. Behavior edits follow the Coder TDD rules and applicable recorded waiver criteria; an explicit user or task-specific TDD request still requires test-driven-development. Do not claim TDD under a waiver. After editing, CEO records changed files, runs focused checks, connects each acceptance criterion to evidence, and reports unverified scope. CEO is not an independent reviewer of its own edits; assign QA when evidence is incomplete. Recheck any approved-file correction. If scope expands, risk becomes unclear, or any criterion fails, stop editing, record completed changes, and return subsequent edits to the normal Planner/Coder flow.

If a criterion fails, return subsequent edits to the normal Planner/Coder flow and reclassify. Like other plan-skip
paths, there is no automatic task commit; commits follow applicable guidance and user requests.

## Automatic commit after plan-task acceptance

CEO accepts each approved top-level task by its own judgment and immediately creates one focused local commit for that
task without additional user commit approval. Read [commit](references/commit.md) before the acceptance and commit.
Push, merge, publish, deploy, and install still follow their separate guidance and approval rules.

## Token discipline and handoffs

- Only CEO invokes Claude native subagents or assigns specialist tasks. Give each invocation a descriptive role
  and bounded objective; the installed native profile determines its role and local model declarations.

- Keep one shared brief with fixed field order: Goal; Criteria (IDs); Exact scope/ownership (absolute workspace, branch or detached HEAD and HEAD, handoff record path, when one exists, files);
  Constraints/decisions; Evidence (paths/lines, commands, artifact links); Prior findings; Exact next objective (one
  bounded objective); Return format (conclusion, evidence locations, unresolved points, next step). On follow-ups and
  restarts send only changed fields and mark the rest `unchanged`; `unchanged` means unchanged relative to a cited artifact the recipient can read (the handoff record file or a brief it received); a fresh specialist, including a fresh restart Coder, gets every other field in full. Send only the
  self-contained subset needed by the next role and links to accessible artifacts; omit full history, repeated
  instructions, and raw logs. No findings may be brief; requested deliverables such as complete plan drafts remain
  complete. Cite paths/lines/pages/commands/links instead of logs; investigate gaps only.
- `AskUserQuestion` questions use only `question`, a `header` of at most 12 characters, 2-4 `options` each with `label` and `description`, and `multiSelect`.
- Always start a Harness role by its installed native name (`harness-*`) with only the supplied scoped brief; never use a context-inheriting fork (such as the `fork` subagent type) for a Harness role; do not claim fresh context isolation without evidence. Reuse an existing specialist for related follow-up with only changed facts/objective when its context
  remains relevant; start fresh for unrelated or bloated context. Coder reuse follows the per-task rule above.
- Cite in the brief the absolute path of each required external skill's SKILL.md (`test-driven-development` for Coder, `brainstorming`/`writing-plans` for Planner); the role Reads it before dependent work.
- For Reviewer, CEO writes the final base..HEAD diff plus changed-file list to `<git-common-dir>/yunho-harness/review/<slug>.diff` (same slug as the handoff record; base is the approved base HEAD recorded at handoff; inline when small or write denied) and cites its absolute path in the brief; Reviewer reads it and states limits. See verification.
- In Coder briefs, cite the plan/spec path with the task section's line range and include only the needed excerpts,
  acceptance criteria, and constraints; do not ask Coder to read whole plans or specs.
- Before optional calls, name the unresolved question and expected artifact; skip calls already resolved by available
  evidence/direct inspection. Preserve required planning and risk-scaled QA/review. Do not call every role
  automatically, add redundant scripts, or repeat audits when direct tools/evidence suffice.
- Run each Harness role as a foreground Agent call and use its returned result, or run it in the background and wait for the completion notification; report unavailable execution to CEO rather than inventing an API. Do not poll status in loops; never sleep-poll. A timeout or delay is not a reason to poll or check status in between. Send one complete brief per objective and batch related corrections. For long Bash commands set a sufficient `timeout` or use `run_in_background` and wait for its completion notification.

- Read only the needed ranges of files and outputs (for example `rg -n`, `sed -n`, `head`/`tail`) and cap long command
  output. Do not re-read files or outputs already in context unless they changed. A mandatory reference already read in
  this context and unchanged need not be re-read, and this skill file, once read in this context and unchanged, is not re-read on follow-up turns;
  this does not shorten any triggered mandatory reference read.
- When a plan completes or before starting another plan in a session with long history, CEO records the canonical
  handoff state in the handoff record file and recommends that the user continue in a new session.
- Before handoff, post one short update with role/objective/expected output; after return, combine findings and next
  stage concisely. CEO may reuse it. Do not expose hidden reasoning or raw prompts.

## Models

`models.toml` beside this skill is the local source of truth; `scripts/model_config.py` validates exactly five
underscore configuration keys: `harness_scouter`, `harness_planner`, `harness_coder`, `harness_qa`, and
`harness_reviewer`. These keys map to the hyphenated native profile names in Ownership and are not invocation names.
CEO uses the current chat model. Current local declarations are Scouter haiku/max, Planner sonnet/medium,
Coder sonnet/low, QA haiku/high, and Reviewer sonnet/medium. Local configuration does not prove runtime provider
support, account access, alias resolution, actual effort application, concurrency or depth enforcement. Use configured
settings without silent substitution or effort reduction; report unavailable settings. A bounded Scouter lookup uses
its configured profile: no per-call effort override is supported by this adapter.

After editing `models.toml`, reapply installed profile settings with:

```sh
python3 ~/.claude/skills/yunho-harness/scripts/apply-models.py
```

The supported options are `--config`, `--agents-dir`, `--check`, and `--dry-run`. Check and dry-run validate local
inputs without writing or invoking a provider. Reapplication validates all five profiles before replacements and
restores prior bytes and modes on partial failure; only the five Claude profiles are targets. Installation renders
settings into all five profiles. New sessions reload profiles; running agents retain their current settings and parent
relationships. These declarations and local checks do not prove runtime model/effort application or parent behavior.

For browser visualization needs read [visual-companion](references/visual-companion.md). Use only capabilities
available within each role's exact allowlist; report unavailable capabilities and preserve unverified visual scope.
