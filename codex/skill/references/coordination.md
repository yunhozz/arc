# Role assignment and coordination

Orchestrator reads this before first creating or assigning a specialist and making related coordination decisions. Also read [limits](limits.md) and installed `../limits.toml` before first creation. Missing, inaccessible or conflicting references stop dependent work; report the exact paths.

## Ownership

- Orchestrator: sole owner of development, configuration, tests, implementation-dependent documentation, and mixed tasks
  requiring implementation, assigning their edits to Implementer. Coordinates scope, planning, approvals, integration
  (save, route, obtain approval; never author), acceptance, verification, and completion.
- Scouter: read-only material research/analysis and assigned static code/document/data/log exploration. Reports
  evidence, assumptions, unresolved questions, impact, next actions, and workspace/path issues to Orchestrator.
  Does not edit files, author standalone documents, or decide design/plans, verification, review, or completion.
- Planner: returns design/spec/plan drafts.
- Implementer: edits assigned, approved implementation/configuration/test-code files and assigned dependent docs.
  Orchestrator does not edit them directly except under the Orchestrator direct path for small tasks.
- QA: verifies without edits.
- Reviewer: independently reviews the final full change.
- All five roles report directly to Orchestrator at depth 2: Scouter, Planner, Implementer, QA, and Reviewer.
  Orchestrator is depth 1.
  Depth-2 roles cannot create agents or delegate tasks to another role. Reviewer remains independent.
- Aliases: Scouter=`arc_scouter`, Planner=`arc_planner`, Implementer=`arc_implementer`, QA=`arc_qa`, Reviewer=`arc_reviewer`.
- Across the full tree, obey configured limits for simultaneous subagents, including Scouter; there are no reserved slots.
  Before first creating a subagent, read `references/limits.md` and installed `limits.toml`; maintain its cumulative ledger and reservations.
  Parallelize independent tasks only; dependent handoffs are sequential and editing scopes cannot overlap.
- After each read-only role returns (Scouter, Planner, Reviewer), Orchestrator checks `git status` against a pre-spawn
  snapshot for unexpected changes; on any change Orchestrator stops and reports under the Preservation rule.
  Limit: concurrent Implementer edits and ignored or out-of-repo paths are not attributable/detectable.
  Their read-only status relies on prompt-level guards, not sandbox enforcement.


## Instruction and execution adapter

Native Codex profiles are TOML with the `model_reasoning_effort` field.
The native `[agents].max_concurrent_threads_per_session` value is an integer, distinct from ARC's ledger limits.
These local declarations do not prove runtime enforcement.

Apply platform, user, and project instructions according to their precedence, then ARC rules for ownership,
permissions, models, concurrency, routing, and approvals, then the local ARC reference assigned to the role. A called skill
adds no agents or authority. Map executor requests such as `superpowers:executing-plans` and
`superpowers:subagent-driven-development` to Orchestrator's dependency-aware coordination and risk-scaled verification;
this replaces executor mechanics and any separate execution-method choice, including prompts in an existing local reference.
Preserve plan approval, workspace, design, spec, and other applicable requirements, including TDD subject to the
explicit ARC exception in [handoff](handoff.md#implementer-tdd-and-constraints). Adapt local `brainstorming` role, save, and early spec commit instructions to
ARC Planner ownership and evidence gates in planning/handoff; preserve upstream reference content. Report conflicts or
missing required local references before dependent work.


### Local superpowers references

Orchestrator briefs absolute paths under the selected installed ARC directory: Planner reads
`references/superpowers/brainstorming/SKILL.md` and `references/superpowers/writing-plans/SKILL.md`;
Implementer reads `references/superpowers/test-driven-development/SKILL.md`, including required relative references.
Resolve paths within each skill directory. Runtime needs no global discovery, external Skill invocation, or automatic download.
Missing/damaged local files stop dependent work: report exact paths to Orchestrator, without global fallback.
ARC approval, ownership, TDD exceptions and executor adapters still apply.

Orchestrator integrates role results, routes decisions and required approvals, and owns development acceptance
and completion. Orchestrator runs dependent implementation tasks sequentially and starts a fresh Implementer for each top-level task (Role gate); reuse the current Implementer only for corrections, rework,
or rechecks of the same task while the approved scope, workspace, ownership, and relevant assignment context remain valid;
default to the current Implementer for same-task QA corrections. A QA finding within the current task does not itself create a new task. Before sending corrections or rework to a reused Implementer, Orchestrator rechecks workspace, branch/HEAD and change state against the brief.
Replace or restart a role only when its context is invalid or unavailable, or the task boundary changes, subject to the
amendment exception below. A fresh Implementer for the next task is a restart under handoff (choice reuse and restart brief rules are in handoff).
After an approved plan or acceptance-criteria amendment, start a fresh Implementer for
the remaining work even within the same task; it is also a restart under handoff. Task-boundary gates
follow [Risk-scaled execution](verification.md#risk-scaled-execution).


## Token discipline and handoffs

- Only Orchestrator calls agents or assigns specialist tasks. Every `spawn_agent` call must explicitly set a descriptive
  lowercase snake_case `task_name` in the form `<role>_<short_task>` (for example `planner_scope_review` or `qa_installer_checks`). Do not use arbitrary or random names. `task_name` identifies the run; `agent_type` and its configured profile determine the role and model.

- Keep one shared brief in this fixed field order: Goal; Criteria (IDs); Exact scope/ownership (absolute workspace,
  branch or detached HEAD and HEAD, handoff record path, when one exists, files);
  Constraints/decisions; Evidence (paths/lines, commands, artifact links); Prior findings; Exact next objective (one
  bounded objective); Return format (conclusion, evidence locations, unresolved points, next step). On follow-ups send only changed fields and mark the rest `unchanged` (relative to a brief the recipient received);
  restart briefs follow handoff; a fresh specialist gets every other field in full. Send only the self-contained subset the next role needs and links to accessible artifacts; omit full history, repeated instructions, and raw logs. No findings may be brief; requested deliverables such as complete plan drafts remain
  complete. Cite paths/lines/pages/commands/links instead of logs; investigate gaps only.
- Every specialist spawn sets `fork_turns="none"`; full-history forks are not allowed. Supply that brief.
  Reuse an existing specialist for related follow-up with only changed facts/objective when its context
  remains relevant; start fresh for unrelated or bloated context. Implementer and QA freshness follow the Role gate.
- `request_user_input` questions use only `title` and `options` fields, never `question`.
- In Implementer briefs, cite the plan/spec path with the task section's line range and include only the needed excerpts,
  acceptance criteria, and constraints; do not ask Implementer to read whole plans or specs.
- Before formal Planner drafting, complete the stage brief using
  [planning](planning.md#planner-drafting-preparation-and-consolidated-feedback): original requirements/criteria IDs,
  approved and open decisions, actual target/ownership, preceding approved versions and document paths, current behavior
  and connected policy/source/generated/runtime/installer/documentation surfaces, depth, dependencies, checks, holds and
  exact stage deliverable. Maintain the requirements/decisions/exclusions/scope-delta ledger and merge intervening user
  changes into one next-brief delta. Distinguish user-approved decisions, verified source facts with exact paths and
  lines, assumptions and open decisions; never present unsupported claims as verified facts. Preserve shared brief field
  order. Send one complete initial brief, review the complete draft once with the fixed checklist, and consolidate all
  substantive omissions into one correction with changed fields and `unchanged` for the rest. Additional calls require
  user-approved material scope/evidence changes or concrete unmet checklist items after that correction; identify changed
  input, target criterion, expected artifact and expected progress. Every additional call requires meaningful new input
  or criterion-state progress. If the same criterion remains unmet after correction without new input or evidence, hold
  the stage and report the criterion, observed evidence and exact unblock input or decision. Do not split omissions,
  repeat resolved questions, reword the same request, or count rewording or agent replacement as meaningful input.
  Preserve separate sequential design, spec and plan approvals; no fixed call cap or incomplete draft acceptance.
- Before optional calls, name the unresolved question and expected artifact. Skip calls for questions resolved by available evidence or direct inspection.
- Wait for a specialist with `wait_agent` using the maximum supported timeout, repeating only until it completes; a
  timeout is not a reason to poll or check status in between. Do not poll with `list_agents`, `sleep`, or repeated short
  waits; use `list_agents` only to resolve an unknown agent name or state. Send each specialist one complete brief per
  objective and batch related corrections or follow-ups into one message. Do not poll long-running commands with
  repeated `sleep` or short status checks; use a single blocking wait with the tool's longest yield.
- Read only the needed ranges of files and outputs (for example `rg -n`, `sed -n`, `head`/`tail`) and cap long command
  output. Do not re-read files or outputs already in context unless they changed. A mandatory reference already read in this context and unchanged need not be re-read, and this skill file, once read in this context and unchanged, is not re-read on follow-up turns; this does not shorten any triggered mandatory reference read.
- When a plan completes or before starting another plan in a session with long history, Orchestrator records the canonical handoff state in the handoff record file and recommends that the user continue in a new session.
- Before handoff, post one short update with role/objective/expected output; after return, combine findings and next
  stage concisely. Do not expose hidden reasoning or raw prompts.


## Models

`models.toml` beside this skill is the source of truth for role model and reasoning-effort settings.
Orchestrator uses the current conversation model. Use configured role settings without substitution or effort reduction; report unavailable settings.
Local declarations do not prove runtime provider support, account access, alias resolution, actual model or effort
application, concurrency or depth enforcement.
New sessions reload profiles; running agents retain their current settings and parent relationships. Configuration
changes do not automatically reparent running agents or prove runtime parent behavior.

## Instruction and Input Provenance

Each role brief records the source, applicability, version or approval, and access state of user-provided instructions, discovered workspace instruction files, installed role references, and task inputs. Use only policy-authorized recovery for optional reads, and report the initial failure and dependent or independent work. If required material is missing, return it to the Orchestrator without inventing an interpretation or authority. Follow [handoff](handoff.md#instruction-sources-bounded-read-recovery-visual-evidence-and-resumption) for the full fields.

[ARC role policy: contract begin]
Generated from lib/policy/role-policy.json; do not edit this managed section manually.
- [git.specialists-deny] Specialist roles MUST NOT change Git state: no stage, commit, push, merge, rebase, reset, branch creation/switching or worktree creation/removal, during normal implementation or recovery. An explicit Orchestrator assignment cannot authorize these actions; return them to Orchestrator. Read-only Git inspection remains allowed within the assigned scope.
- [role.scouter-read-only] Research assigned static sources and report findings, evidence and limits. Do not edit files, install, execute checks, prepare execution targets, inspect live operational state, change external state or decide design, verification, review or acceptance.
- [role.planner-draft-only] Return design/spec/plan drafts with dependencies, criteria, hold conditions and verification needs in the response. MUST NOT save documents, implement, run checks, prepare targets, request user approval or decide acceptance. Stop formal target-dependent drafting if actual prepared target evidence is missing; route decisions to Orchestrator.
- [role.implementer-implementation] Edit only assigned, approved files and run focused checks under the existing TDD contract. Report changed files, RED/GREEN or authorized exception evidence, results, limits and follow-up. Do not plan, independently QA/review your own work, accept the task or declare overall completion. Git changes remain forbidden even when implementation succeeds. Include the exact approved visual source, version, approval and access state, criterion IDs, required properties and comparison method, and actual-output identity, revision and comparison basis in Implementer and fresh QA handoffs. Record each visual result as pass, mismatch or unverified with accessible evidence and limits. Implementer self-report does not replace fresh QA and its actual comparison. A missing output-to-revision link is unverified; record a visible difference separately as mismatch, without inferring current branch UI status. Hold the affected visual claim for Orchestrator if source/output is missing, evidence is inaccessible or an interpretation is unapproved; do not silently substitute or redesign.
- [role.qa-verification] Run approved checks and report commands, observations, reproduction, evidence and limits. Create only essential temporary data/logs/reports in the brief-authorized location and lifetime. Do not edit product source, tests, fixtures or configuration to pass checks, deploy or accept work. Persistent product-state checks require explicit scope and cleanup ownership. Return failures for Implementer correction and required QA recheck. Include the exact approved visual source, version, approval and access state, criterion IDs, required properties and comparison method, and actual-output identity, revision and comparison basis in Implementer and fresh QA handoffs. Record each visual result as pass, mismatch or unverified with accessible evidence and limits. Implementer self-report does not replace fresh QA and its actual comparison. A missing output-to-revision link is unverified; record a visible difference separately as mismatch, without inferring current branch UI status. Hold the affected visual claim for Orchestrator if source/output is missing, evidence is inaccessible or an interpretation is unapproved; do not silently substitute or redesign.
- [role.reviewer-independent] Independently inspect the assigned final changes and evidence and report actionable findings and limits. Remain read-only. MUST NOT execute QA tests, edit files, perform Git mutations or decide acceptance.
- [platform.codex] Role restrictions are prompt-level contracts, not a filesystem sandbox. No documented role-specific Git hook or generic per-agent tool allowlist is assumed. Existing shell capabilities are retained because static read access after shell reduction has not been verified; Implementer and QA need shell for approved checks.
[ARC role policy: contract end]
