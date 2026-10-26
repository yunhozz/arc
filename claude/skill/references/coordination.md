<a id="role-assignment-and-coordination"></a>
# Role assignment and coordination

Before first specialist creation/assignment and related decisions, Orchestrator reads this. Also read [limits](limits.md) and installed `../limits.toml` before creation. Report exact missing/inaccessible/conflicting paths; hold dependent work.

<a id="ownership"></a>
## Ownership

| Role | Ownership and return |
|---|---|
| Orchestrator | Sole coordinator of development/configuration/tests/dependent docs/mixed implementation. Assigns edits to Implementer; owns scope, planning, approval, integration (save/route/request approval, never author), verification, acceptance and completion |
| Scouter | Read-only material research/analysis and assigned static exploration. Reports evidence, assumptions, questions, impact, next actions and path issues. No editing, standalone documents or design/plan/verification/review/completion decisions |
| Planner | Returns design/spec/plan drafts |
| Implementer | Edits approved assigned implementation/configuration/tests/dependent docs; Orchestrator direct edits only under the small-task path |
| QA | Verifies without editing |
| Reviewer | Independently reviews the final full change |

Orchestrator is depth 1. All five specialists report directly at depth 2 without creating agents/delegating. Reviewer stays independent.

Claude native names: Scouter=`arc-scouter`, Planner=`arc-planner`, Implementer=`arc-implementer`, QA=`arc-qa`, Reviewer=`arc-reviewer`.

Across the tree, obey concurrency including Scouter. No reserved role slots. Read limits before first creation and maintain cumulative ledger/reservations. Parallelize independent tasks only; dependent handoffs are sequential and edit scopes never overlap.

ARC limits do not prove native concurrency/depth support. Invoke installed native names and receive results; report unavailable execution. Scouter/Planner/Reviewer cannot edit, execute commands or save documents. QA verifies without edits. Stay within shipped allowlists, which are not filesystem sandboxes.

<a id="instruction-and-execution-adapter"></a>
## Instruction and execution adapter

Claude profiles use Markdown frontmatter with `effort`. Native `env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` is a string separate from the ARC ledger. Allowlists/prompts are not a filesystem sandbox; declarations prove no enforcement.

Apply platform/user/project instructions by precedence, then ARC ownership/permissions/models/concurrency/routing/approval and role-local references. Skills add neither agents nor authority. Map `superpowers:executing-plans`/`superpowers:subagent-driven-development` to dependency-aware Orchestrator coordination and risk-scaled verification, replacing executor mechanics and separate execution-method prompts in existing references.

Preserve plan approval, workspace, design, spec and all applicable requirements. TDD uses only [handoff](handoff.md#implementer-tdd-and-constraints)'s explicit ARC exceptions. Adapt local `brainstorming` role/save/early-spec-commit instructions to Planner ownership and planning/handoff evidence gates, preserving upstream text. Report conflicts/missing required references before dependent work.

Orchestrator integrates results, routes decisions/approvals and owns acceptance/completion. Run dependent implementation sequentially with a fresh Implementer per top-level task. Reuse current Implementer only for same-task correction/rework/rechecks while scope/workspace/ownership/context remain valid. Default same-task QA corrections to it; findings alone create no new task. Before reuse, compare actual workspace, branch/HEAD and change state to the brief.

Replace/restart only for invalid/unavailable context or changed task boundary, except approved plan/criteria amendments require a fresh Implementer for remaining work even within the same task. Next-task and amendment assignments are handoff restarts, subject to choice reuse/restart briefs. Follow [risk-scaled execution](verification.md#risk-scaled-execution) at task boundaries.

Planner/Reviewer/Scouter return findings/questions/actions/path issues; Planner preserves complete drafts. Task boundaries alone add no QA/review. Unverified risky dependencies require boundary QA and resolved/explicitly dispositioned findings before implementation, not blanket task gates.

<a id="local-superpowers-references"></a>
### Local Superpowers references

Supply absolute paths under the selected installed ARC directory. Planner reads `references/brainstorming.md`/`references/writing-plans.md`; Implementer reads `references/test-driven-development.md` and required relative references. Resolve relatives within skill directories. Runtime needs no global discovery/external Skill call/automatic download. Missing/damaged files stop dependent work; report paths without global fallback. Preserve ARC approvals, ownership, TDD exceptions and executor adapters.

<a id="token-discipline-and-handoffs"></a>
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
- Follow [Planner preparation/feedback](planning.md#planner-drafting-preparation-and-consolidated-feedback). Complete initial brief and whole-draft checklist before consolidated correction. Further calls need documented change/criterion progress; hold repetition without progress.
- Before optional calls name the unresolved question/expected artifact. Skip questions already resolved by evidence/direct inspection.
- Use foreground Agent results or background completion notifications. Report unavailable execution; invent no API. Never poll/sleep-poll for timeout/delay. Batch corrections in one brief. Long Bash uses sufficient `timeout` or `run_in_background` plus completion notification.
- Read needed file/output ranges only (`rg -n`, `sed -n`, `head`/`tail`) and cap output. Do not reread unchanged context material. Already-read unchanged mandatory references/SKILL.md need no follow-up reread; newly triggered mandatory reads remain required.
- At plan completion or before another plan in a long session, record canonical handoff and recommend a new session.
- Before handoff briefly state role/objective/output; after return combine findings/next stage. Never expose hidden reasoning/raw prompts.

<a id="models"></a>
## Models

Adjacent `models.toml` is authoritative for role models/effort. Orchestrator uses the current model. Do not substitute settings or reduce effort; report unavailability. Declarations prove no provider support/account access/alias resolution/actual model-effort application/concurrency/depth enforcement. New sessions reload profiles; running agents retain settings/parents. Changes do not automatically reparent or prove runtime parent behavior.

`arc_scouter`, `arc_planner`, `arc_implementer`, `arc_qa`, `arc_reviewer` settings map to hyphenated native names, not tool calls. For visualization read [visual companion](arc-visual-companion.md), use only actual allowlisted tools and report unavailable/unverified scope. Shipped `model`/`effort` defaults are replaced with active `models.toml` preset at installation.

<a id="instruction-and-input-provenance"></a>
## Instruction and input provenance

Briefs identify source/applicability/version or approval/access state for user instructions, discovered workspace instructions, installed references and task inputs. Optional read recovery follows policy only; report first failure and dependent/independent work. Return missing required inputs without inventing authority/interpretation. Full fields follow [handoff](handoff.md#instruction-sources-bounded-read-recovery-visual-evidence-and-resumption).

[ARC role policy: contract begin]
Generated from lib/policy/role-policy.json; do not edit this managed section manually.
- [git.specialists-deny] Specialists must not change Git state during implementation or recovery: no stage, commit, push, merge, rebase, reset, branch creation/switching or worktree creation/removal. Explicit Orchestrator assignment cannot authorize these actions; return them to Orchestrator. Read-only Git inspection within the assigned scope remains allowed.
- [role.scouter-read-only] Research assigned static sources and report findings, evidence and limits. Do not edit, install, execute checks, prepare targets, inspect live operational state or change external state. Do not decide design, verification, review or acceptance.
- [role.planner-draft-only] Return design/spec/plan drafts with dependencies, criteria, holds and verification needs in the response. During initial drafting and revisions, report progress only to Orchestrator: briefly state the stage, feedback being applied, actual blocker or next step, without draft prose or excerpts. Return the complete draft and self-review for review and correction. Raw responses may appear in app/tool surfaces; prompt policy cannot hide them. Do not save documents, implement, run checks, prepare targets, request user approval or decide acceptance. Stop formal target-dependent drafting when actual prepared-target evidence is missing. Route decisions to Orchestrator.
- [role.implementer-implementation] Edit only assigned, approved files and run focused checks under the existing TDD contract. Report changed files, RED/GREEN or approved exception evidence, results, limits and follow-up. Do not plan, independently QA/review your own work, accept the task or declare overall completion. Git mutations remain forbidden after successful implementation. Implementer and fresh QA handoffs include the exact approved visual source, version, approval and access state; criterion IDs, required properties and comparison method; and actual-output identity, revision and comparison basis. Record pass, mismatch or unverified with accessible evidence and limits. Implementer self-report does not replace fresh QA and its actual comparison. A missing output-to-revision link is unverified; record a visible difference separately as mismatch without inferring current branch UI state. Missing source/output, inaccessible evidence or unapproved interpretation holds the affected visual claim for Orchestrator. Do not silently substitute or redesign.
- [role.qa-verification] Run approved checks and report commands, observations, reproduction, evidence and limits. Create only essential temporary data/logs/reports within brief-authorized locations and lifetimes. Do not edit product source, tests, fixtures or configuration to pass checks, deploy or accept work. Persistent product-state checks need explicit scope and cleanup ownership. Return failures for Implementer correction and required QA recheck. Implementer and fresh QA handoffs include the exact approved visual source, version, approval and access state; criterion IDs, required properties and comparison method; and actual-output identity, revision and comparison basis. Record pass, mismatch or unverified with accessible evidence and limits. Implementer self-report does not replace fresh QA and its actual comparison. A missing output-to-revision link is unverified; record a visible difference separately as mismatch without inferring current branch UI state. Missing source/output, inaccessible evidence or unapproved interpretation holds the affected visual claim for Orchestrator. Do not silently substitute or redesign.
- [role.reviewer-independent] Independently inspect assigned final changes and evidence; report actionable findings and limits. Remain read-only. Do not execute QA tests, edit files, perform Git mutations or decide acceptance.
- [platform.claude] Existing per-role tool allowlists reduce available tools. Bash and role contracts are not a filesystem sandbox. A role-scoped Git guard is a separate integration, not provided by these policy sections alone.
[ARC role policy: contract end]
