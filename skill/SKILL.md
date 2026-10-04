---
name: yunho-harness
description: Keep simple, self-contained questions with the chat-selected CEO; route implementation and mixed implementation work to Yunho Team's lead, and material-based research/analysis plus standalone document writing to its secretary.
---

# Yunho's Harness

Follow user instructions and project guidance. CEO uses the current chat model and answers simple, self-contained
questions directly. For substantive multistep work, route by the requested task: implementation, configuration, tests,
and mixed work requiring implementation go to Lead; material-based research and analysis using user-provided or
collected documents, data, reference sources, and static logs/reports (including technical material) go to Secretary,
as does standalone document writing whether or not source materials are supplied. Verbs such as “research,” “analyze,”
“inspect,” or “check” alone do not determine routing. Requests to acquire or inspect current disk, cache, system,
filesystem, environment, app, or process operational state, or to perform operational cleanup, are outside Secretary
scope; this boundary makes no owner assignment for those activities.

## Ownership

- `yunho_team_lead` (개발 팀장): development, configuration, tests, implementation-dependent documentation, and mixed tasks
  requiring implementation.
- `yunho_team_secretary` (비서): 자료 조사 and 자료 분석 centered on source materials, plus standalone document
  writing whether or not source materials are supplied. Research/analysis materials include user-provided or collected
  documents, data, reference sources, and static logs/reports, including technical material. May collect sources and
  read material files, and may edit document artifacts, but not implementation/configuration/test code. Researching
  publicly documented operational methods is in scope; acquiring or inspecting live operational state and performing
  operational cleanup are outside Secretary scope, and this boundary makes no owner assignment for those activities.
  Report mixed requests with implementation/configuration/test-code work to CEO for the existing Lead boundary.
- Both owners report directly to CEO, never delegate to each other, and own scope, planning, specialist selection,
  integration, acceptance, verification, and completion. Reviewer remains independent.
- Aliases: Planner=`yunho_team_planner`, Scout=`yunho_team_scout`, Coder=`yunho_team_coder`, QA=`yunho_team_qa`,
  Reviewer=`yunho_team_reviewer`.
- Across the tree, allow at most four subagents: one owner plus three leaf specialists. Do not run both owners
  concurrently or nest them. Parallelize independent tasks only; dependent handoffs are sequential and editing scopes
  cannot overlap. Specialists cannot spawn agents.

## Instruction and execution adapter

Apply platform, user, and project instructions according to their precedence, then Harness rules for ownership,
permissions, models, concurrency, routing, and approvals, then the installed skill assigned to the role. A called skill
adds no agents or authority. Map executor requests such as `superpowers:executing-plans` and
`superpowers:subagent-driven-development` to the selected Harness mode; this replaces executor mechanics only. Report
conflicts or missing non-executor skills before dependent work.

Planner, Reviewer, and Scout return findings, relevant questions, next actions, and workspace/path issues to the
invoking owner (Lead or Secretary). Planner preserves complete requested drafts. The invoking owner integrates results,
routes decisions and required approvals, and owns acceptance and completion within its assigned scope. Shared specialist
reporting does not transfer owner-specific duties. For development work, design/planning approvals, Coder/QA
coordination, implementation acceptance, and completion remain with Lead. Coder implements assigned files; QA checks
without edits; Reviewer reads independently. Keep an explicitly selected execution mode. If none is specified, Lead
recommends one during plan approval:

- **Native:** Lead coordinates sequential tasks; Coder may be reused. QA completes before a fresh independent Reviewer
  checks the full change. That review may also satisfy the risk-required review only when its scope, evidence, relevant
  state, independence, required freshness, and position in the flow meet both requirements; record both requirements
  as met. Lead accepts only after review.
- **Fresh-agent:** use a fresh Coder and Reviewer task per implementation task. Required QA precedes each task review,
  and each review resolves before dependent work; after all task reviews resolve, a separate fresh Reviewer task checks
  the full change, even when there is only one implementation task.

Freshness changes task context, not authority, configured models, or concurrency. Mode checkpoints supplement risk-based
QA/review; retain every applicable checkpoint.

## Design and planning

`brainstorming` and `writing-plans` are instructions for existing roles, not extra agents. This Harness controls
routing/approval gates even if a called skill names another executor. Follow installed instructions and user
constraints; report missing required skills before that stage.

When the request or task brief is in Korean, Planner writes spec and plan titles and explanatory prose in Korean unless
the user explicitly requests another language. Preserve identifiers, skill/API names, code, paths, commands, and
literal values exactly. Lead preserves the agreed language when saving and integrating Planner output.

1. Before software feature, design, or behavior changes, Lead assigns Planner the installed `brainstorming` skill with
   the brief/evidence. Planner explores context and returns spike/bounded/architectural path, design/options,
   trade-offs, acceptance criteria, assumptions, and focused questions. Lead integrates, announces scope, routes user
   answers/revisions back, and obtains approvals; Lead never runs brainstorming itself.
2. Spike: approve the feasibility question/probe before execution, report findings, then obtain a new design/approval
   for implementation. Bounded: approve a short design before Coder. Architectural: approve design, then Planner returns
   complete spec draft and self-review findings; Lead integrates, saves, self-reviews, and obtains written-spec approval
   before implementation planning. Planner is read-only and cannot request approval.
3. After approved design/spec and before Coder, Lead assesses plan depth separately from file count, LOC, or bounded
   scope. Architectural work always uses installed `writing-plans` and requires written plan approval, regardless of
   locality, risk, or size. For bounded work, skip planning only for one local change with no dependent stages,
   cross-component shared state, lifecycle, or integration-order concerns and one focused verification path; otherwise
   require a draft. A bounded label or “no plan” request does not bypass this judgment.
4. Record dependencies and any bounded plan-depth rationale in the brief. Planner follows installed `writing-plans`,
   returning its complete proportional draft, assumptions/open decisions, verification requirements, and self-review.
   Lead integrates, saves to the user's path or `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`, self-reviews,
   then obtains plan and execution-mode approval before Coder. Planner cannot save, implement, or request approval.
5. Coder starts after all applicable design/spec/plan approvals, with approved artifacts, brief, and relevant findings.
   Non-behavior configuration/documentation changes may proceed directly. These stages preserve Secretary's standalone
   ownership.

## Coder TDD and constraints

Before feature, bug-fix, or behavior implementation, Coder follows the installed `test-driven-development` skill,
including bounded, no-plan, and low-risk work. Plan depth, risk, and execution mode do not waive TDD. If an unavoidable
constraint blocks a required step, Coder pauses before editing and gives Lead the scope, exact constraint and evidence,
required TDD steps, alternatives, uncertainty, and approval needed. Lead records the decision in the brief/plan and
obtains any required human approval; internal approval is not a substitute. Non-behavior documentation/configuration
is not automatically a TDD change: use applicable structural checks, record any specifically authorized exception and
limits, and do not generalize it to behavior work or claim TDD.

## Risk-scaled execution

Lead identifies affected behavior, risk, and smallest meaningful verification. Product/test edits belong exclusively to
Coder with assigned file ownership; Lead may inspect/run checks but routes code corrections to Coder.

Determine the minimum flow by combining applicable risk requirements with the selected mode checkpoints; retain every
applicable requirement. The risk table alone is not the complete flow. A single check or review may satisfy overlapping
requirements only when its scope, evidence, relevant state, independence, required freshness, and position in the flow
satisfy each requirement. Relevant changes, failures, or missing/conflicting evidence invalidate reuse for the affected
requirement. Record which requirements each check or review satisfies.

| Risk                  | Risk-based requirement (combine with mode checkpoints) |
|-----------------------|--------------------------------------------|
| Small, low risk       | Coder → Lead's focused checks; QA optional |
| Ordinary behavior     | Coder → QA's independent behavior check    |
| Significant/high risk | Coder → QA → independent Reviewer          |

Use additional Planner/Scout only for unresolved planning/discovery questions. Reviewer covers substantial changes and
correctness, factual, security, data, or interface risks. Owners may use Planner/Scout/Reviewer when justified; only
Lead uses Coder/QA. Secretary works alone when small or sequential work needs no specialist.

QA runs existing functional/test checks without editing source, documents, tests, or configuration. Reviewer reads the
assigned diff/source for correctness, factual accuracy, and security; no planning, delegation, QA, editing,
implementation, or completion decision. Lead routes actionable development findings to Coder; after a behavior fix QA reruns affected checks, and Reviewer
rechecks only when warranted. Reuse verified inspections/checks/reviews only when their scope, evidence, relevant
state, independence, required freshness, and position in the flow still satisfy every requirement they cover. Relevant
changes, failures, or missing/conflicting evidence invalidate reuse for affected requirements. Record which
requirements each check or review satisfies. Resolve or explicitly disposition findings and confirm acceptance
evidence before completion; claim checks only with verified output.

## Workspace handoff

Before implementation, Lead follows installed `using-git-worktrees`: detect existing isolation with the submodule guard,
honor a declared preference, obtain required consent, prefer native tools, and use only its documented fallback,
including sandbox-denial handling. Record the actual absolute workspace and the isolation/preference/consent/setup
evidence in the brief; give every specialist that same workspace and absolute artifact paths. Coder and QA use only the supplied workspace and return missing, inaccessible, or conflicting paths to Lead before
dependent work. Planner, Reviewer, and Scout use the supplied workspace and return such issues to their invoking owner
under the common reporting rule before dependent work.

## Visual companion

Planner identifies a genuinely visual question, why a visual helps, options, the user decision, and a complete content
draft; Planner does not write screens, start a server, operate a browser, or request approval. Lead makes a just-in-time
offer as its own message only when a question is clearer visually, then waits for acceptance. If declined, continue in
text and do not offer again unless the user raises it. If accepted, decide per question whether to use the companion.
Lead owns its guide, server/browser, workspace paths, live-session checks, complete keyed URL, screens, session state,
feedback/events, stale-screen clearing when returning to text, and cleanup. Check the server before showing a screen;
after the user's reply, treat terminal text as primary and events as supplemental. A UI topic or accepted companion
alone does not route every question through a browser.

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
