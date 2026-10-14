# Planning contract

Read before design/plan-depth decisions, spec/plan drafting and approval, and the first spec/plan save.

## Design and planning

`brainstorming` and `writing-plans` are instructions for existing roles, not extra agents. This Harness controls
routing/approval gates even if a called skill names another executor. Follow installed instructions and user
constraints; report missing required skills before that stage.

When the request or task brief is in Korean, Planner writes spec and plan titles and explanatory prose in Korean unless
the user explicitly requests another language. Preserve identifiers, skill/API names, code, paths, commands, and
literal values exactly. CEO preserves the agreed language when saving and integrating Planner output.

Assess and record design and plan depth separately from verification risk; risk determines the required checks and
review, not the design path or plan approval gates. Bounded or document omission does not imply low risk, and
architectural depth does not add QA/Reviewer at every stage; apply existing risk-scaled QA/Reviewer and specific
approved obligations separately.

1. Before software feature, design, or behavior changes, CEO assigns Planner the installed `brainstorming` skill with
   the brief/evidence. Planner explores context and returns spike/bounded/architectural path, design/options,
   trade-offs, acceptance criteria, assumptions, and focused questions. CEO integrates, announces scope, routes user
   answers/revisions back, and obtains approvals; CEO never runs brainstorming itself except under the CEO direct path
   in core policy, where CEO presents the short design itself.
2. Spike: approve the feasibility question/probe before execution, report findings, then obtain a new design/approval
   for implementation. Bounded: approve a short design before Coder or a CEO direct edit. Architectural: approve
   design, then Planner returns complete spec draft and self-review findings; CEO integrates, saves, self-reviews, and obtains written-spec approval
   before implementation planning. Planner is read-only and cannot request approval.
3. After approved design/spec and before Coder, CEO assesses plan depth separately from file count, LOC, or bounded
   scope. Architectural work always uses installed `writing-plans` and requires written plan approval, regardless of
   locality, risk, or size. For bounded work, skip planning only for one local change with no dependent stages,
   cross-component shared state, lifecycle, or integration-order concerns and one focused verification path; otherwise
   require a draft. A bounded label or “no plan” request does not bypass this judgment.
4. Record dependencies and any bounded plan-depth rationale in the brief. Planner follows installed `writing-plans`,
   returning its complete proportional draft, assumptions/open decisions, verification requirements, and self-review.
   CEO integrates, saves to the user's path or `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`, self-reviews,
   then obtains plan approval before Coder. Planner cannot save, implement, or request approval.
5. Every Coder first start and restart requires all applicable design/spec/plan approvals and the complete
   the common handoff gate in core and handoff.md, with approved artifacts, brief, and relevant findings. Non-behavior
   configuration/documentation may skip inapplicable design/planning stages, but still requires the handoff gate.
   A CEO direct edit requires its approved short design and the same gate conditions before the first edit.

When a Bounded written spec is required by the existing CEO depth judgment, record that necessity and scope and
use the approved short design as its basis. Planner returns a proportional complete spec draft and self-review;
CEO integrates, saves, self-reviews, and obtains individual written-spec approval before dependent plan drafting
and execution preparation. This applies the existing depth judgment, not a new spec-necessity rule.

CEO must not substitute an independently authored spec for Planner's complete draft. If the draft has substantive
omissions, return them to Planner for completion. A user may explicitly change the writing responsibility; record
that change and its evidence in the brief. Design approval alone does not change ownership.

## Top-level plan tasks

For each top-level task, Planner specifies ID and title, implementation goal/scope and target files, preceding tasks
and dependencies, acceptance criteria, required QA/focused checks and evidence before acceptance, and hold conditions.
Make each task independently implementable, verifiable and acceptable. Changes that cannot be independently verified
belong in one top-level task from the outset, including policy/profile/tests/manifest when they share one contract.
Do not combine different approved tasks into one commit during execution; if inseparability appears later, stop affected
work and have CEO handle revised scope, planning and applicable approvals.

Substeps and checkboxes express implementation/check progress, not separate commit units; RED/GREEN and individual
commands do not create commit units. One approved top-level task is one focused implementation commit. CEO verifies
criteria, required checks and findings, accepts the task, then commits without additional user commit approval.
Coder reports and passing checks do not replace CEO acceptance. Never list Reviewer as a per-task required check;
Reviewer is never a task acceptance prerequisite. State final overall plan QA/integration verification separately from
task acceptance prerequisites, stating scope and timing; for significant/high-risk work, final plan verification lists the
single independent Reviewer review of the final full change after all tasks are accepted with their risk-scaled checks. Keep task-required
checks before acceptance; later final checks alone do not delay an independently acceptable task. Task boundaries alone
add no QA gates; preserve risk requirements, QA at a risky dependency boundary and specific approved obligations. No-change, hold and resume processing follow core policy.
These requirements apply to required plans; existing plan-omission paths gain no new plan obligation.

### Document-save evidence gates

Before the first architectural spec save, first required Bounded written spec save, or first plan save, read this
reference and record accessible evidence in the shared brief/canonical handoff record. Saving creates a reviewable file; it is not approval or a Git commit.

**Spec save:** Verify the approved design scope and approval evidence, accessible Planner's complete spec draft and
self-review findings, CEO's integration/save/review responsibility, and intended absolute save path.
For a required Bounded written spec, also verify the existing CEO depth judgment, approved short design,
spec-necessity rationale and scope, and Planner's proportional complete draft and self-review. Saving or approving
the short design does not replace the required spec's drafting, self-review, or individual approval.
Architectural and required Bounded specs enter as approved versions in the applicable document set; complete
individual written-spec approval before dependent plan drafting and execution preparation. This gate
permits saving for review and does not require written-spec approval or execution-target choice. Do not describe an
uncommitted file as committed.

**Plan save:** Verify the approved design and, when required, approved written-spec version and approval evidence,
CEO's plan-depth judgment, applicable plan list and dependencies, accessible Planner's complete plan draft and
self-review findings, CEO's integration/save/review responsibility, and intended absolute save path.
If evidence is missing or mismatched in either gate, stop the affected save and report to CEO for resolution.

### Complete planning-document set

The applicable document set means all specs and plans required for the current approved execution scope, not future
project work. CEO records scope, design/plan depth, absolute document paths and coverage, approved versions/status,
plan dependencies and execution order, skipped stages with rationale, and documents still awaiting writing or approval
in the shared brief. The set is complete only when every required document is written and individually approved and
no unresolved scope or dependency decision requires another document. Do not omit required documents from the list.

A required plan does not itself require a written spec. Bounded uses the existing CEO depth judgment to determine
whether a written spec is required; do not infer one from plan necessity. Spec steps apply only to Architectural and
required Bounded specs, and plan steps only to required plans. These gates add no new spec obligation to Spike,
Bounded plan-skip, or non-behavior documentation/configuration paths; preserve existing omission rationales.

Normal order: design approval → required spec writing/saving/self-review and written-spec approval → required plans
writing/saving/self-review and individual approvals → complete applicable set → explicit execution-target choice and
any approved branch switch or worktree creation → existing-commit verification and one batch commit of remaining approved documents →
final Git verification → Coder handoff. For the selected worktree path, creation/identity verification and
approved-document transfer precede the target batch docs commit; preserve source changes under handoff. Written-spec approval still precedes implementation planning.

While documents are being written, reviewed, or approved, do not request execution-checkout selection, create/switch
branches, perform worktree creation, stage documents, or commit planning documents for this task's execution preparation. Read-only workspace,
repository, and Git-state inspection is allowed. An incomplete set or any missing approval blocks preparation and
handoff; approval of some plans does not permit starting their Coder work ahead of the remaining applicable plans.

This Harness explicitly defers the installed `brainstorming` instruction to commit the spec before written-spec review:
save and self-review the spec, obtain written-spec approval without committing it, then write and obtain approval for
all applicable plans. Commit the spec only in the final batch preparation. Do not modify external skills. `writing-plans` implementation-step commit instructions
are not permission for document commits during planning or for starting Coder.

| Path | Applicable approvals and preparation |
|------|--------------------------------------|
| Spike probe | Approve the feasibility question, probe method/scope, acceptance criteria, and constraints. Do not force specs/plans for still-unknown implementation; no new spec obligation is added by this gate. If Coder executes the probe, pass the common handoff gate after probe approval. Read-only CEO/Planner investigation without Coder does not trigger that gate. |
| Bounded, plan skipped | Approve the short design and record the existing plan-skip criteria/rationale; this gate adds no new spec obligation. Complete applicable approvals, select the target, prepare any actual approved documents, or record valid document absence, then pass the common gate. |
| Bounded, plan required | Approve the short design and every required plan; write a spec only when the existing CEO depth judgment requires it, then obtain its individual written-spec approval before dependent plan drafting and preparation. Complete all applicable artifacts before one preparation batch and the common gate. |
| Architectural | Approve design, then written spec, then every required plan using `writing-plans`; complete the document set before target selection, batch preparation, final verification, and the common gate. |
| Non-behavior documentation/configuration | Record scope, acceptance criteria, and why design/planning stages are inapplicable; this gate adds no new spec obligation. Still select the target, verify Git state, prepare actual approved documents or record absence, and pass the common gate. |

Spike probe and subsequent implementation are separate approval scopes. Report probe findings, reassess implementation
design/plan depth, and approve its required spec and all plans before its preparation batch. Probe approval or code
does not approve later implementation. Document omission skips only document obligations, never explicit execution-target
choice, Git state/ownership checks, or handoff evidence.

If planning reveals new scope, reassess the list, depth, and dependencies and obtain additional required approvals
before preparation. Changed approved documents require approval of the revised version. If implementation reveals new
scope, stop affected execution until that scope's documents, approvals, and preparation are complete. Do not amend old
commits to retroactively include it. An already-running Coder must stop before edits dependent on new plans; inspect
current changes/Git state and do not retroactively claim preparation. A restart without document changes reuses verified
valid commits and a still-valid initial execution-target choice under [handoff.md](handoff.md), with fresh actual-state checks.

### Evidence refresh and limits

Missing or mismatched evidence, unfinished approvals, unclear ownership, or unresolved failure blocks the affected
save, execution-target request, Git mutation, or Coder handoff: stop and report to CEO. CEO resolves the issue and
reverifies affected evidence before resumption. Reverify evidence when scope, approved versions, paths, target, or
relevant Git state changes. Preserve unrelated changes under handoff rules; read-only investigation remains allowed.

Do not retroactively treat an early save or commit as satisfying these gates or as user approval. Record the actual
order and any evidence gap. Structural checks prove only the repository's written policy contract, not consuming-agent
runtime compliance. Without execution records for role returns, approvals, saves, and Git actions, leave runtime
compliance unverified. Do not add runtime infrastructure or modify external skills for these checks.

### Managed worktree preparation

See [handoff-worktree.md](handoff-worktree.md) for the third-path managed worktree contract.
