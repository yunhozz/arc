---
name: yunho-harness
description: Keep simple, self-contained questions with the chat-selected CEO; route substantive development work to Yunho Team's development lead and standalone document creation, research, and analysis to its secretary.
---

# Yunho's Harness

Follow user instructions and project guidance. CEO uses the current chat model and answers simple, self-contained
questions directly. For substantive multistep work, delegate to one owner with the brief and evidence, wait, then report
its concise result.

## Ownership

- `yunho_team_lead` (개발 팀장): development, configuration, tests, implementation-dependent documentation, and mixed tasks
  requiring implementation.
- `yunho_team_secretary` (비서): standalone documents, research, and analysis, including technical subjects without
  implementation. May edit document artifacts, but not implementation/configuration/test code; report implementation
  needs to CEO for rerouting.
- Both owners report directly to CEO, never delegate to each other, and own scope, planning, specialist selection,
  integration, acceptance, verification, and completion. Reviewer remains independent.
- Aliases: Planner=`yunho_team_planner`, Scout=`yunho_team_scout`, Coder=`yunho_team_coder`, QA=`yunho_team_qa`,
  Reviewer=`yunho_team_reviewer`.
- Across the tree, allow at most four subagents: one owner plus three leaf specialists. Do not run both owners
  concurrently or nest them. Parallelize independent tasks only; dependent handoffs are sequential and editing scopes
  cannot overlap. Specialists cannot spawn agents.

## Design and planning

`brainstorming` and `writing-plans` are instructions for existing roles, not extra agents. This Harness controls
routing/approval gates even if a called skill names another executor. Follow installed instructions and user
constraints; report missing required skills before that stage.

1. Before software feature, design, or behavior changes, Lead assigns Planner the installed `brainstorming` skill with
   the brief/evidence. Planner explores context and returns spike/bounded/architectural path, design/options,
   trade-offs, acceptance criteria, assumptions, and focused questions. Lead integrates, announces scope, routes user
   answers/revisions back, and obtains approvals; Lead never runs brainstorming itself.
2. Spike: approve the feasibility question/probe before execution, report findings, then obtain a new design/approval
   for implementation. Bounded: approve a short design before Coder. Architectural: approve design, then Planner returns
   complete spec draft and self-review findings; Lead integrates, saves, self-reviews, and obtains written-spec approval
   before implementation planning. Planner is read-only and cannot request approval.
3. After design approval and before Coder, Lead assesses plan depth separately from file count, LOC, or bounded scope.
   Skip `writing-plans` only for one local change with no cross-component shared state, lifecycle, or integration-order
   concerns and one focused verification path. Dependent stages, shared state, lifecycle, integration ordering, or
   distinct verification paths require a draft.
4. When required, record dependencies/plan-depth rationale in the brief. Planner follows installed `writing-plans`,
   returning full draft, assumptions/open decisions, and verification requirements. Lead integrates, saves to the user's
   path or `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`, self-reviews per that skill, and obtains plan
   approval. Planner cannot save, implement, or request approval.
5. Coder starts after all applicable design/spec/plan approvals, with approved artifacts, brief, and relevant findings.
   Non-behavior configuration/documentation changes may proceed directly. These stages preserve Secretary's standalone
   ownership.

## Risk-scaled execution

Lead identifies affected behavior, risk, and smallest meaningful verification. Product/test edits belong exclusively to
Coder with assigned file ownership; Lead may inspect/run checks but routes code corrections to Coder.

| Risk                  | Required flow after applicable planning    |
|-----------------------|--------------------------------------------|
| Small, low risk       | Coder → Lead's focused checks; QA optional |
| Ordinary behavior     | Coder → QA's independent behavior check    |
| Significant/high risk | Coder → QA → independent Reviewer          |

Use additional Planner/Scout only for unresolved planning/discovery questions. Reviewer covers substantial changes and
correctness, factual, security, data, or interface risks. Owners may use Planner/Scout/Reviewer when justified; only
Lead uses Coder/QA. Secretary works alone when small or sequential work needs no specialist.

QA runs existing functional/test checks without editing source, documents, tests, or configuration. Reviewer reads the
assigned diff/source for correctness, factual accuracy, and security; no planning, delegation, QA, editing,
implementation, or completion decision. Lead routes actionable findings to Coder; after a behavior fix QA reruns
affected checks, and Reviewer rechecks only when warranted. Reuse verified inspections/checks/reviews until relevant
state changes, failure, or missing/conflicting evidence warrants another pass. Resolve or explicitly disposition
findings and confirm acceptance evidence before completion; claim checks only with verified output.

## Token discipline and handoffs

- Every `spawn_agent` call must explicitly set a descriptive lowercase snake_case `task_name` in the form
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

`models.toml` beside this skill is the source for the seven role model IDs and local reasoning-effort policies; CEO
uses the chat model. Each role selects a model declared in `[models]`, and its effort must appear in that model's
`allowed_reasoning_efforts` list. These lists validate local configuration only; they do not prove server support,
account access, or current availability. Use configured settings without substitution and report unavailable settings.

After editing `models.toml`, apply the settings to installed profiles with
`python3 <skill-directory>/scripts/apply-models.py`. Use `--check` to report drift without writing, or `--dry-run` to
show the updates. The `install.py` installer renders settings into all seven profiles during installation. New
sessions reload profiles; running agents retain their current settings.
