---
name: yunho-harness
description: Keep simple, self-contained questions with the chat-selected CEO; route implementation and mixed implementation work to the CEO, and material-based research/analysis plus standalone document writing to its secretary.
---

# Yunho's Harness

Follow user instructions and project guidance. CEO uses the current chat model and answers simple, self-contained
questions directly. For substantive multistep work, route by the requested task: implementation, configuration, tests,
and mixed work requiring implementation belong to CEO; material-based research and analysis using user-provided or
collected documents, data, reference sources, and static logs/reports (including technical material) go to Secretary,
as does standalone document writing whether or not source materials are supplied. Verbs such as “research,” “analyze,”
“inspect,” or “check” alone do not determine routing. Requests to acquire or inspect current disk, cache, system,
filesystem, environment, app, or process operational state, or to perform operational cleanup, are outside Secretary
scope; this boundary makes no owner assignment for those activities.

## Ownership

- CEO is the sole owner of development, configuration, tests, implementation-dependent documentation, and mixed
  tasks requiring implementation. CEO coordinates scope, planning, approvals, integration, acceptance, verification,
  and completion. Coder edits assigned implementation/configuration/test-code files; CEO does not edit them directly.
- `yunho_team_secretary`: Research and analysis centered on source materials, plus standalone document
  writing whether or not source materials are supplied. Research/analysis materials include user-provided or collected
  documents, data, reference sources, and static logs/reports, including technical material. May collect sources and
  read material files, and may edit document artifacts, but not implementation/configuration/test code. Researching
  publicly documented operational methods is in scope; acquiring or inspecting live operational state and performing
  operational cleanup are outside Secretary scope, and this boundary makes no owner assignment for those activities.
  Report mixed requests with implementation/configuration/test-code work to CEO for development coordination.
- All six roles report directly to CEO at depth 2: Secretary, Planner, Scout, Coder, QA, and Reviewer. CEO is depth 1.
  Depth-2 roles cannot create agents or delegate tasks to another role. Reviewer remains independent.
- Aliases: Secretary=`yunho_team_secretary`, Planner=`yunho_team_planner`, Scout=`yunho_team_scout`,
  Coder=`yunho_team_coder`, QA=`yunho_team_qa`, Reviewer=`yunho_team_reviewer`.
- Across the full tree, allow at most four simultaneous subagents, including Secretary; there are no reserved slots.
  Parallelize independent tasks only; dependent handoffs are sequential and editing scopes cannot overlap.
- Secretary owns assigned material/document scope, planning, integration, verification, acceptance, and completion.
  When specialist support is needed, Secretary sends the question, material paths, and expected result to CEO.
  CEO assigns specialist support and passes results back to Secretary; Secretary never delegates directly.

## Instruction and execution adapter

Apply platform, user, and project instructions according to their precedence, then Harness rules for ownership,
permissions, models, concurrency, routing, and approvals, then the installed skill assigned to the role. A called skill
adds no agents or authority. Map executor requests such as `superpowers:executing-plans` and
`superpowers:subagent-driven-development` to CEO's sequential coordination and risk-scaled verification; this replaces
executor mechanics and any separate execution-method choice, including prompts in an existing installed dependency.
Preserve plan approval, workspace, design, spec, and other applicable requirements, including TDD subject to the
explicit Harness exception below. Report conflicts or missing non-executor skills before dependent work.

Planner, Reviewer, and Scout return findings, relevant questions, next actions, and workspace/path issues to the
CEO. Planner preserves complete requested drafts. CEO integrates results, routes decisions and required approvals,
and owns development acceptance and completion. Specialist reporting does not transfer Secretary material/document
duties to development roles. For development work, design/planning approvals, Coder/QA
coordination, implementation acceptance, and completion remain with CEO. Coder implements assigned files; QA checks
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
| [planning](references/planning.md) | Design/plan-depth judgments, spec/plan drafting or approval |
| [handoff](references/handoff.md) | Every Coder first start/restart preparation or independent checkout verification |
| [verification](references/verification.md) | Verification design, QA/Reviewer, correction rechecks, UI acceptance checks |
| [git-recovery](references/git-recovery.md) | Branch collision, Git preparation failure, partial completion, metadata write denial recovery |
| [visual-companion](references/visual-companion.md) | Visual companion offer or operation |

Design and plan depth are independent of verification risk. Planner uses installed brainstorming/writing-plans;
CEO integrates complete drafts and obtains applicable approvals. Complete all current-scope approved documents before
execution-target selection and document commit preparation. A missing required skill blocks its stage.

## Common handoff gate

Before every Coder first start/restart, CEO verifies applicable approvals/artifacts or valid omissions, explicit initial
execution-target choice or verified valid reuse, accessible intended repository/workspace, actual branch/detached HEAD,
HEAD, staged/unstaged/untracked state, preservation/ownership, approved document commits or valid absence, and final
state without unresolved failure/partial completion. Coder independently checks before editing; missing evidence,
mismatches, unclear ownership or unresolved preparation block edits and require CEO resolution and full revalidation.
Depth-2 roles use the supplied workspace and report path/state conflicts; they cannot create/switch workspaces or branches.
Coder cannot repair preparation by commits, permission changes, lock deletion, sandbox bypass or reset/stash/clean.
The canonical record, delta restart brief, choice lifetime, branch protection and docs-commit order are in handoff.
Same approved scope/workspace/repository/target restarts retain a valid initial choice with fresh state checks;
changed scope/target/candidate or a failure invalidating target trust requires a fresh explicit choice.

## Coder TDD and constraints

Before feature, bug-fix, or behavior edits, Coder follows installed `test-driven-development` unless the explicit
Harness exception applies. TDD is waived only when all small, low-risk criteria hold (narrow, understood, readily
reversible, and verifiable through focused checks) and all plan-skip criteria hold (one local change, no dependent
stages, cross-component shared state, lifecycle, or integration-order concerns, and one focused verification path).
Before Coder starts, CEO records the scope, why every criterion is met, acceptance criteria, and focused verification
in the brief. An explicit user or task-specific TDD request overrides this waiver. For qualifying tasks only, this
approved Harness exception takes precedence over the generic trigger in the installed `test-driven-development`
skill; do not change that skill.

The waiver skips only failure-first/RED-GREEN TDD steps. Focused checks, evidence and limits reporting, and
risk-appropriate QA/Reviewer remain required; do not claim TDD was followed. If risk is unclear or scope expands,
Coder stops and asks CEO to reclassify. Ordinary multi-step or significant/high-risk work is not eligible; behavior
edits outside this exception still require TDD.

If an unavoidable constraint blocks a required TDD step, Coder pauses before editing and gives CEO the scope, exact
constraint and evidence, required TDD steps, alternatives, uncertainty, and approval needed. CEO records the decision
in the brief/plan and obtains any required human approval; internal approval is not a substitute. Non-behavior
documentation/configuration may use only a specifically authorized exception recorded in the brief; run approved
structural checks, state their limits, and do not claim TDD or generalize that exception to behavior work.

## Risk-scaled execution

CEO assigns edits exclusively to Coder and determines affected behavior, risk, and smallest meaningful verification.

| Risk | Minimum flow |
|---|---|
| Small, low risk | Coder → CEO's focused checks → acceptance |
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
work, without QA, planning, edits, delegation, or completion decisions. CEO routes fixes to Coder, obtains affected QA
rechecks and required final review, and accepts after findings/evidence gaps are resolved or explicitly dispositioned.
Criterion verdicts must preserve unverified scope; passing runs or disposition cannot substitute for proof.
Read verification for evidence fields, failure/finding flow, UI permissions, cleanup and acceptance reporting.

## Optional commit after acceptance

After applicable checks and reviews are complete and findings are resolved or explicitly dispositioned, CEO may accept
a task and optionally create a focused commit for that accepted task. Confirm the staged diff contains only the
accepted task; do not commit unresolved acceptance criteria or required checks. A commit does not replace QA, review,
acceptance, or remaining integration checks. Follow Conventional Commits with the message form
`<type>(<scope>): <description>`. Use a concise, specific Korean description without a trailing period, a lowercase
scope when useful, one logical change per commit, and body/footer only when needed while preserving Git trailer syntax.
This permits commits only; push, merge, publishing, deployment, and installation still follow their separate approval
rules.

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
- Before handoff, post one short update with role/objective/expected output; after return, combine findings and next
  stage concisely. CEO may reuse it. Do not expose hidden reasoning or raw prompts.

## Models

`models.toml` beside this skill is the source for the six role model IDs and reasoning-effort selections; CEO uses
the chat model. Each role directly declares its model and effort in `[roles.<role>]`. The local configuration does not
prove server support, account access, or current availability. Use configured settings without substitution and report
unavailable settings.

After editing `models.toml`, apply the settings to installed profiles with
`python3 <skill-directory>/scripts/apply-models.py`. Use `--check` to report drift without writing, or `--dry-run` to
show the updates. The `install.py` installer renders settings into all six profiles during installation. New
sessions reload profiles; running agents retain their current settings and parent relationships. These policy changes
do not automatically reparent running agents or prove runtime parent behavior.
