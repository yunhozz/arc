# Role assignment and coordination

Orchestrator reads this before first creating or assigning a specialist and making related coordination decisions. Also read [limits](limits.md) and installed `../limits.toml` before first creation. Missing, inaccessible or conflicting references stop dependent work; report the exact paths.

## Ownership

- Orchestrator: sole owner of development, configuration, tests, implementation-dependent documentation, and mixed tasks
  requiring implementation, assigning their edits to Implementer. Coordinates scope, planning, approvals, integration,
  acceptance, verification, and completion.
- Scouter: read-only material research/analysis and assigned static code/document/data/log exploration. Reports
  evidence, assumptions, unresolved questions, impact, next actions, and workspace/path issues to Orchestrator.
  Does not edit files, author standalone documents, or decide design/plans, verification, review, or completion.
- Planner: returns design/spec/plan drafts.
- Implementer edits assigned, approved implementation/configuration/test-code files and assigned dependent docs.
  Orchestrator does not edit them directly except under the Orchestrator direct path for small tasks.
- QA: verifies without edits.
- Reviewer: independently reviews the final full change.
- All five roles report directly to Orchestrator at depth 2: Scouter, Planner, Implementer, QA, and Reviewer.
  Orchestrator is depth 1.
  Depth-2 roles cannot create agents or delegate tasks to another role. Reviewer remains independent.
- Claude native subagent names: Scouter=`arc-scouter`, Planner=`arc-planner`, Implementer=`arc-implementer`, QA=`arc-qa`,
  Reviewer=`arc-reviewer`.
- Across the full tree, obey configured limits for simultaneous subagents, including Scouter; there are no reserved slots.
  Before first creating a subagent, read `references/limits.md` and installed `limits.toml`; maintain its cumulative ledger and reservations.
  Parallelize independent tasks only; dependent handoffs are sequential and editing scopes cannot overlap. These are
  ARC limits, not verified runtime concurrency or depth capabilities. Use Claude native subagent execution with
  the installed native name and receive its completion result; report unavailable execution capabilities to
  Orchestrator.
- Scouter, Planner, and Reviewer do not edit, execute commands, or save standalone documents; QA verifies without edits.
  Each role stays within its shipped tool allowlist; a tool list is not a filesystem sandbox.


## Instruction and execution adapter

Native Claude profiles use Markdown frontmatter with the `effort` field.
The native `env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` value is a string, distinct from ARC's ledger limits.
The native tool allowlists and prompt guards are not a filesystem sandbox; local declarations do not prove runtime enforcement.

Apply platform, user, and project instructions according to their precedence, then ARC rules for ownership,
permissions, models, concurrency, routing, and approvals, then the local ARC reference assigned to the role. A called skill
adds no agents or authority. Map executor requests such as `superpowers:executing-plans` and
`superpowers:subagent-driven-development` to Orchestrator's dependency-aware coordination and risk-scaled verification;
this replaces executor mechanics and any separate execution-method choice, including prompts in an existing local reference.
Preserve plan approval, workspace, design, spec, and other applicable requirements, including TDD subject to the
explicit ARC exception in [handoff](handoff.md#implementer-tdd-and-constraints). Adapt local `brainstorming` role, save, and early spec commit instructions to
ARC Planner ownership and evidence gates in planning/handoff; preserve upstream reference content. Report conflicts or
missing required local references before dependent work.

Planner, Reviewer, and Scouter return findings, relevant questions, next actions, and workspace/path issues to the
Orchestrator. Planner preserves complete requested drafts. Orchestrator integrates results (save, route,
obtain approval; never author), routes decisions and required approvals,
and owns development acceptance and completion. Orchestrator runs dependent implementation tasks sequentially and starts a fresh Implementer for each top-level task (Role gate); reuse the current Implementer only for corrections, rework,
or rechecks of the same task while the approved scope, workspace, ownership, and relevant assignment context remain valid;
default to the current Implementer for same-task QA corrections. A QA finding within the current task does not itself create a new task. Before sending corrections or rework to a reused Implementer, Orchestrator rechecks workspace, branch/HEAD and change state against the brief.
Replace or restart a role only when its context is invalid or unavailable, or the task boundary changes, subject to the
amendment exception below. A fresh Implementer for the next task is a restart under handoff (choice reuse and restart brief rules are in handoff).
After an approved plan or acceptance-criteria amendment, start a fresh Implementer for
the remaining work even within the same task; it is also a restart under handoff. Do not add per-task QA or
review gates solely because a task boundary exists; apply risk requirements and specific approved obligations. If the
next task depends on a still-unverified risky contract, complete applicable QA at that dependency boundary and
resolve or explicitly disposition findings before dependent implementation. This does not create a gate for every task.


## Token discipline and handoffs

- Only Orchestrator invokes Claude native subagents or assigns specialist tasks. Give each invocation a descriptive role
  and bounded objective; the installed native profile determines its role and local model declarations.

- Keep one shared brief in this fixed field order: Goal; Criteria (IDs); Exact scope/ownership (absolute workspace,
  branch or detached HEAD and HEAD, handoff record path, when one exists, files);
  Constraints/decisions; Evidence (paths/lines, commands, artifact links); Prior findings; Exact next objective (one
  bounded objective); Return format (conclusion, evidence locations, unresolved points, next step).
  On follow-ups send only changed fields and mark the rest `unchanged` (relative to a brief the recipient received);
  restart briefs follow handoff; a fresh specialist gets every other field in full. Send only the self-contained subset the next role needs and links to accessible artifacts; omit full history, repeated instructions, and raw logs. No findings may be brief; requested deliverables such as complete plan drafts remain
  complete. Cite paths/lines/pages/commands/links instead of logs; investigate gaps only.
- `AskUserQuestion` questions use only `question`, a `header` of at most 12 characters, 2-4 `options` each with `label`
  and `description`, and `multiSelect`.
- Always start an ARC role by its installed native name (`arc-*`) with only the supplied scoped brief;
  never use a context-inheriting fork (such as the `fork` subagent type) for an ARC role; do not claim fresh context
  isolation without evidence. Reuse an existing specialist for related follow-up with only changed facts/objective when
  its context
  remains relevant; start fresh for unrelated or bloated context. Implementer and QA freshness follow the Role gate.
- Cite in the brief the absolute path of each required local ARC reference's SKILL.md (`test-driven-development` for Implementer,
  `brainstorming`/`writing-plans` for Planner); the role Reads it before dependent work.
- For Reviewer, Orchestrator writes the final base..HEAD diff plus changed-file list to
  `<git-common-dir>/arc/review/<slug>.diff` (same slug as the handoff record; base is the approved base HEAD recorded at
  handoff; inline when small or write denied) and cites its absolute path in the brief; Reviewer reads it and states
  limits. See verification.
- In Implementer briefs, cite the plan/spec path with the task section's line range and include only the needed excerpts,
  acceptance criteria, and constraints; do not ask Implementer to read whole plans or specs.
- Follow [Planner drafting preparation and consolidated feedback](planning.md#planner-drafting-preparation-and-consolidated-feedback).
  Complete the initial brief and whole-draft checklist before sending consolidated corrections. Gate further calls
  on documented changes or criterion progress; hold repetition without progress.
- Before optional calls, name the unresolved question and expected artifact. Skip calls for questions resolved by available evidence or direct inspection.
- Run each ARC role as a foreground Agent call and use its returned result, or run it in the background and wait for the
  completion notification; report unavailable execution to Orchestrator rather than inventing an API.
  Do not poll status in loops; never sleep-poll. A timeout or delay is not a reason to poll or check status in between.
  Send one complete brief per objective and batch related corrections. For long Bash commands set a sufficient `timeout`
  or use `run_in_background` and wait for its completion notification.

- Read only the needed ranges of files and outputs (for example `rg -n`, `sed -n`, `head`/`tail`) and cap long command
  output. Do not re-read files or outputs already in context unless they changed. A mandatory reference already read in this context and unchanged need not be re-read, and this skill file, once read in this context and unchanged, is not re-read on follow-up turns; this does not shorten any triggered mandatory reference read.
- When a plan completes or before starting another plan in a session with long history, Orchestrator records the canonical handoff state in the handoff record file and recommends that the user continue in a new session.
- Before handoff, post one short update with role/objective/expected output; after return, combine findings and next
  stage concisely. Do not expose hidden reasoning or raw prompts.

### Local superpowers references

Orchestrator briefs absolute paths under the selected installed ARC directory: Planner reads
`references/brainstorming.md` and `references/writing-plans.md`;
Implementer reads `references/test-driven-development.md`, including required relative references.
Resolve paths within each skill directory. Runtime needs no global discovery, external Skill invocation, or automatic download.
Missing/damaged local files stop dependent work: report exact paths to Orchestrator, without global fallback.
ARC approval, ownership, TDD exceptions and executor adapters still apply.


## Models

`models.toml` beside this skill is the source of truth for role model and reasoning-effort settings.
Configuration keys `arc_scouter`, `arc_planner`, `arc_implementer`, `arc_qa`, and `arc_reviewer` map to the hyphenated
Claude native subagent names above; they are not tool-call names.
Orchestrator uses the current conversation model. Use configured role settings without substitution or effort reduction; report unavailable settings.
Local declarations do not prove runtime provider support, account access, alias resolution, actual model or effort
application, concurrency or depth enforcement.
New sessions reload profiles; running agents retain their current settings and parent relationships. Configuration
changes do not automatically reparent running agents or prove runtime parent behavior.

For browser visualization needs read [visual-companion](arc-visual-companion.md). Use only capabilities
available within each role's exact allowlist; report unavailable capabilities and preserve unverified visual scope.

Claude profile `model` and `effort` frontmatter values are shipped defaults; installation overwrites them with the active `models.toml` preset values.

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
- [platform.claude] Existing per-role tool allowlists reduce available tools; Bash and role contracts are not a filesystem sandbox. A role-scoped Git guard is a separate integration and is not supplied by these policy sections alone.
[ARC role policy: contract end]
