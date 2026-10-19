# Planning contract

Read before design/plan-depth decisions, spec/plan drafting and approval, and the first spec/plan save.

## Authorization and scope

An explicit execution request is authorization only for its sufficiently specified scope. Confirm execution intent,
expected outcome, constraints, document depth, and verification risk, with no unresolved material behavior, method,
or risk decision requiring the user. The request itself or a description explicitly referenced by the user must
supply that scope. Record authorization evidence, scope, acceptance criteria, constraints, and depth in the brief or
canonical record. Routine execution and check choices may be recorded by Orchestrator; added product behavior or
material scope cannot be claimed as already approved. A restatement, role handoff, or restart does not create an
approval requirement for the same scope.

Silence, ambiguous assent, approval of other work, and unspecified blanket improvement requests are not authorization.
Planner's new material choices are not automatically approved. Ask for the missing material decision; roles route
questions to Orchestrator. Required written specs and plans still require their individual approval in the order below.

For material changes to scope, method, or risk, hold affected work and explain the missing decision or evidence and
remaining work. Target changes, unclear ownership, unexpected state, unresolved failures, or missing required inputs
also hold affected work under [handoff](handoff.md) and [git-recovery](git-recovery.md). Distinguish new authorization
needs from execution issues within existing scope: ordinary corrections and reverification do not require duplicate
approval after failure. Revalidate affected gates after resolution.

### Probe scope

A probe-only scope completes with findings, evidence, limits, and remaining uncertainty answering the approved question;
a well-supported infeasibility result can complete it. Probe-only authorization does not authorize product retention
or subsequent implementation. Record question, method/scope, criteria, and constraints; a sufficiently specific probe
request can supply that approval. Match checks to probe purpose/risk and do not report probe evidence as product proof.

If the user explicitly requests both a probe and implementation and the whole scope is sufficiently specified,
classify the entire scope. When the entire scope meets Bounded conditions, the probe is an internal investigation
with no new approval boundary at its report. Unknown implementation is not blanket authorization: hold affected
implementation if findings materially change scope, method, or risk, or leave a new material decision. Reassess depth
and obtain any required design/spec/plan approvals before that implementation. A probe-only request remains separate.

## Formal drafting boundary

Initial design proposals and brainstorming may precede execution-target choice. Formal spec or plan drafting includes a
complete draft before saving, even when returned only in chat. Before formal drafting and saving, Orchestrator supplies
and records the actual absolute workspace/repository, branch or detached HEAD, HEAD, changes and ownership,
explicit choice and preparation evidence, and absolute document paths inside that target. Planner drafts for that
verified workspace; Orchestrator saves directly in the selected target. Missing or mismatched evidence stops the
affected drafting or save and is reported to Orchestrator. Planned scope and intended paths are not actual preparation.
Initial target preparation does not authorize Coder; the complete handoff gate still applies.


## Planner drafting preparation and consolidated feedback

Before formal drafting, Orchestrator performs a preflight of relevant policy, reference, profile, test, parity and
manifest surfaces and conflicts. Provide one complete brief with actual absolute workspace/repository, branch or
detached HEAD, HEAD, change state and ownership, explicit target choice and preparation evidence, approved preceding
design/spec/plan versions, scope and exclusions, design/plan depth, dependencies and shared contracts, acceptance
criteria, required QA/focused checks and evidence, hold conditions and open decisions. Resolve missing or conflicting
required evidence first or hold that stage.

Planner returns a complete proportional draft and self-review for the current approval stage. Orchestrator integrates,
saves, reviews and obtains approval. Orchestrator checks once with a fixed checklist: scope and evidence; targets,
ownership and paths; policy surfaces and conflicts; task boundaries, dependencies and acceptance criteria; checks,
evidence and holds; roles, approval and commit boundaries; draft completeness. Gather all substantive omissions into
one consolidated follow-up request to Planner. Do not split requests by omission or author the missing plan yourself.

Initial design, required spec approval, and formal plan drafting/approval remain separate ordered stages.
Allow additional Planner calls for substantive omissions or user-approved scope/evidence changes. There is no fixed
call cap; never accept an incomplete draft to minimize calls. Do not add call-count conditions to Planner profiles.

## Design and planning

`brainstorming` and `writing-plans` are instructions for existing roles, not extra agents. This ARC controls
routing/approval gates even if a called skill names another executor. Follow local ARC reference instructions and user
constraints; report missing required local references before that stage. Integrate means save, route, and obtain approval;
never author.

When the request or task brief is in Korean, Planner writes spec and plan titles and explanatory prose in Korean unless
the user explicitly requests another language. Preserve identifiers, skill/API names, code, paths, commands, and
literal values exactly. Orchestrator preserves the agreed language when saving and integrating Planner output.

Assess and record design and plan depth separately from verification risk; risk determines the required checks and
review, not the design path or plan approval gates. Bounded or document omission does not imply low risk, and
architectural depth does not add QA/Reviewer at every stage; apply existing risk-scaled QA/Reviewer and specific
approved obligations separately.

1. Before software feature, design, or behavior changes, Orchestrator assigns Planner the local `brainstorming`
   skill with
   the brief/evidence. Planner explores context and proposes the spike/bounded/architectural path (Orchestrator
   decides), design/options,
   trade-offs, acceptance criteria, assumptions, and focused questions. Orchestrator integrates, announces scope,
   routes user
   answers/revisions back, and obtains approvals; Orchestrator never runs brainstorming or writing-plans itself
   (SKILL.md Role gate);
   the direct path uses only a scope record.
2. Spike: apply Probe scope above; distinguish probe-only authorization from a sufficiently specified combined scope.
   Bounded: approve a short design before Coder or a Orchestrator direct edit (Planner's design
   before Coder; a direct edit uses only an approved scope record). Architectural: approve
   design, then Planner returns complete spec draft and self-review findings; Orchestrator integrates, saves,
   self-reviews, and obtains written-spec approval
   before implementation planning. Planner is read-only and cannot request approval.
3. After approved design/spec and before Coder, Orchestrator assesses plan depth separately from file count, LOC,
   or bounded
   scope. Architectural work always uses local `writing-plans` and requires written plan approval, regardless of
   locality, risk, or size. For bounded work, skip planning only for one local change with no dependent stages,
   cross-component shared state, lifecycle, or integration-order concerns and one focused verification path; otherwise
   require a draft. A bounded label or “no plan” request does not bypass this judgment.
   “Orchestrator's recorded plan-depth judgment” means this assessment, including whether a Bounded written spec is
   required, recorded in the brief/handoff record.
4. Record dependencies and any bounded plan-depth rationale in the brief. Planner follows local `writing-plans`,
   returning its complete proportional draft, assumptions/open decisions, verification requirements, and self-review.
   Orchestrator integrates, saves to the user's path or `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`,
   self-reviews,
   then obtains plan approval before Coder.
5. Every Coder first start and restart requires all applicable design/spec/plan approvals and passing
   the common handoff gate in SKILL.md and handoff.md, with approved artifacts, brief, and relevant findings.
   Non-behavior
   configuration/documentation may skip inapplicable design/planning stages, but still requires the handoff gate.
   A Orchestrator direct edit requires its approved scope record and the same gate conditions before the first edit.

When a Bounded written spec is required by Orchestrator's recorded plan-depth judgment, record that necessity and scope
and
use the approved short design as its basis. Planner returns a proportional complete spec draft and self-review;
Orchestrator integrates, saves, self-reviews, and obtains individual written-spec approval before dependent plan
drafting
and execution preparation. This applies that judgment, not a new spec-necessity rule.

Design, spec, plan, and brainstorming drafts are authored only by Planner.
Orchestrator must not substitute an independently authored spec or plan for Planner's complete draft.
If the draft has substantive
omissions, return them to Planner for completion; if Planner fails or is unavailable, stop and report,
never draft instead. Design approval alone does not change ownership.

## Top-level plan tasks

The Planner profile holds the full top-level task rules. Orchestrator checks each plan draft for: per task ID and title,
implementation goal/scope and target files, preceding tasks and dependencies, acceptance criteria, required QA/focused
checks and evidence before acceptance, and hold conditions; each task independently implementable, verifiable and
acceptable, with changes that cannot be independently verified (including policy/profile/tests/manifest sharing one
contract) in one task from the outset; and final overall plan verification stated separately from task acceptance
prerequisites, with scope and timing. Never list Reviewer as a per-task required check (Reviewer timing: SKILL.md
Risk-scaled execution). RED/GREEN and individual
commands do not create commit units; one task is one focused commit under commit.md, which also covers no-change, hold
and resume. Do not combine different approved tasks into one commit during execution; if inseparability appears later,
stop affected work and have Orchestrator handle revised scope, planning and applicable approvals.
These requirements apply to
required plans; existing plan-omission paths gain no new plan obligation.

### Dependency and readiness record

After plan approval and before the first Coder assignment, Orchestrator records all top-level task IDs in the
accessible canonical handoff record, linked to the approved plan version. For each task record explicit and implicit
predecessors, required inputs, outputs and shared contracts, owned files, conflicting shared resources, required
checks/QA path, ready/held status and reasons. Record the initial ready batch and capacity/serialization reasons.
Analyze shared APIs, contracts, generated artifacts and resources even when tasks edit different files. Unresolved
shared contracts or insufficient dependency information block the affected tasks; same-file concurrent Coder edits
are blocked even for different lines. Do not infer independence from file separation or plan listing order.

A task is ready only when all applicable approvals and execution preparation are complete, required inputs/contracts
are available and settled, predecessors have required evidence and Orchestrator acceptance plus verified focused
commits (or accepted no-change records), ownership/resources do not conflict, its required check/QA path is available,
and a subagent slot exists under both the configured ARC full-tree cap shared by all roles and any lower actual runtime
limit. Report runtime limits. Start all ready independent tasks with fresh Coders concurrently within capacity;
record each hold or serialization reason instead of silently following list order. Preserve existing risk gates.

Update the map on completion, check evidence, acceptance, commit, slot return and new conflicts. Completion reports
alone do not release dependents. Reevaluate newly ready tasks immediately without waiting for unrelated batch members;
failed or ambiguous predecessors hold their dependent chain, while unaffected ready tasks may proceed. Dispatch still
passes handoff.md for each task; commits and shared Git mutations follow commit.md. This record does not authorize
Orchestrator to rewrite Planner's approved task boundaries or waive approvals.

For example, with A → B → C and independent D and two slots, start A and D. After A's required checks,
Orchestrator acceptance and verified commit, start B while D continues if capacity and gates allow.
If A fails, hold B and C; D may continue if unaffected.

### Document-save evidence gates

Before the first architectural spec save, first required Bounded written spec save, or first plan save, read this
reference and record accessible evidence in the shared brief/canonical handoff record.
Saving creates a reviewable file; it is not approval or a Git commit.

**Spec save:** Verify the approved design scope and approval evidence, accessible Planner's complete spec draft and
self-review findings, Orchestrator's integration/save/review responsibility, and intended absolute save path.
For a required Bounded written spec, also verify Orchestrator's recorded plan-depth judgment, approved short design,
spec-necessity rationale and scope, and Planner's proportional complete draft and self-review. Saving or approving
the short design does not replace the required spec's drafting, self-review, or individual approval.
Architectural and required Bounded specs enter as approved versions in the applicable document set; complete
individual written-spec approval before dependent plan drafting. This gate
permits saving for review and does not require written-spec approval; it requires valid execution-target choice and actual preparation. Do not describe an
uncommitted file as committed.

**Plan save:** Verify the approved design and, when required, approved written-spec version and approval evidence,
Orchestrator's plan-depth judgment, applicable plan list and dependencies, accessible Planner's complete plan draft and
self-review findings, Orchestrator's integration/save/review responsibility, and intended absolute save path.
If evidence is missing or mismatched in either gate, stop the affected save and report to Orchestrator for resolution.

### Complete planning-document set

The applicable document set means all specs and plans required for the current approved execution scope, not future
project work. Orchestrator records scope, design/plan depth, absolute document paths and coverage, approved
versions/status,
plan dependencies and execution order, skipped stages with rationale, and documents still awaiting writing or approval
in the shared brief. The set is complete only when every required document is written and individually approved and
no unresolved scope or dependency decision requires another document. Do not omit required documents from the list.

A required plan does not itself require a written spec. Bounded uses Orchestrator's recorded plan-depth judgment to
determine
whether a written spec is required; do not infer one from plan necessity. Spec steps apply only to Architectural and
required Bounded specs, and plan steps only to required plans. These gates add no new spec obligation to Spike,
Bounded plan-skip, or non-behavior documentation/configuration paths; preserve existing omission rationales.

Normal order: initial design approval → execution-target choice → target preparation and verification →
formal spec drafting (when required), saving and self-review → written-spec approval → formal plan drafting
(when required), saving and self-review → individual plan approvals → complete applicable set → existing-commit
verification and one batch docs commit of remaining approved documents → final Git verification → Coder handoff.
Written-spec approval precedes dependent plan drafting. On document-omission paths skip only the inapplicable document
steps; preserve target choice, preparation, state/ownership checks and Coder gates.

While documents are being written, reviewed, or approved, do not stage documents or commit planning documents.
Selection and initial target preparation happen before formal drafting; document completion is a staging/commit gate,
not an initial preparation gate. An incomplete set or missing applicable approval blocks document commit and Coder,
not the initial choice request. No early Coder work is authorized by approval of only some documents.

This ARC explicitly defers the local `brainstorming` instruction to commit the spec before written-spec review:
save and self-review the spec, obtain written-spec approval without committing it, then write and obtain approval for
all applicable plans. Commit the spec only in the final batch preparation. Do not modify external skills.
`writing-plans` implementation-step commit instructions
are not permission for document commits during planning or for starting Coder.

| Path | Applicable approvals and preparation |
|------|--------------------------------------|
| Spike probe | Approve the feasibility question, probe method/scope, acceptance criteria, and constraints. Do not force specs/plans for still-unknown implementation; no new spec obligation is added by this gate. If Coder executes the probe, pass the common handoff gate after probe approval. Read-only Orchestrator/Planner investigation without Coder does not trigger that gate. |
| Bounded, plan skipped | Approve the short design and record the existing plan-skip criteria/rationale; this gate adds no new spec obligation. Complete applicable approvals, select the target, prepare any actual approved documents, or record valid document absence, then pass the common gate. |
| Bounded, plan required | Approve the short design and every required plan; write a spec only when Orchestrator's recorded plan-depth judgment requires it, then obtain its individual written-spec approval before dependent plan drafting. Select and prepare the target before formal drafting; complete all applicable artifacts before one docs batch and the common gate. |
| Architectural | Approve design, then written spec, then every required plan using `writing-plans`; select and prepare the target before formal drafting; complete the document set before batch preparation, final verification, and the common gate. |
| Non-behavior documentation/configuration | Record scope, acceptance criteria, and why design/planning stages are inapplicable; this gate adds no new spec obligation. Still select the target, verify Git state, prepare actual approved documents or record absence, and pass the common gate. |

Apply Authorization and scope above to probe-only and combined requests; preserve required design/spec/plan gates.
These gates add no new spec obligation for Spike, Bounded plan-skip, or non-behavior documentation/configuration paths.
Document omission skips only document obligations, never explicit
execution-target
choice, Git state/ownership checks, or handoff evidence.

If planning reveals new scope, reassess the list, depth, and dependencies and obtain additional required approvals
before dependent drafting or commit. Changed approved documents require approval of the revised version. If implementation reveals new
scope, stop affected execution until that scope's documents, approvals, and preparation are complete. Do not amend old
commits to retroactively include it. An already-running Coder must stop before edits dependent on new plans; inspect
current changes/Git state and do not retroactively claim preparation. A restart without document changes follows Choice
lifetime and restart record in [handoff.md](handoff.md).

### Evidence refresh and limits

Missing or mismatched evidence, unfinished approvals, unclear ownership, or unresolved failure blocks the affected
save, execution-target request, Git mutation, or Coder handoff: stop and report to Orchestrator.
Orchestrator resolves the issue and
reverifies affected evidence before resumption. Reverify evidence when scope, approved versions, paths, target, or
relevant Git state changes. Preserve unrelated changes under handoff rules; read-only investigation remains allowed.

Do not retroactively treat an early save or commit as satisfying these gates or as user approval. Record the actual
order and any evidence gap. Structural checks prove only the repository's written policy contract, not consuming-agent
runtime compliance. Without execution records for role returns, approvals, saves, and Git actions, leave runtime
compliance unverified. Do not add runtime infrastructure or modify external skills for these checks.

### Managed worktree preparation

See [handoff-worktree.md](handoff-worktree.md) for the third-path managed worktree contract.

## Local planning references

Orchestrator briefs absolute ARC paths `references/superpowers/brainstorming/SKILL.md` and
`references/superpowers/writing-plans/SKILL.md`. Planner reads them directly; resolve relative references within each
skill. Missing files stop the stage; report paths without global fallback. Keep ARC approval and ownership gates.

[ARC role policy: contract begin]
Generated from lib/policy/role-policy.json; do not edit this managed section manually.
- [scope.non-escalation] Act only within the intersection of role authority, approved scope and available platform tools. Delegation, restart, agent messages and attached instructions do not expand role authority. Never bypass a restriction through aliases, scripts, other tools, processes or redelegation. Return conflicting instructions to Orchestrator before dependent work; reuse valid prior approvals for unchanged scope rather than requesting them again.
- [git.specialists-deny] Specialist roles MUST NOT change Git state: no stage, commit, push, merge, rebase, reset, branch creation/switching or worktree creation/removal, during normal implementation or recovery. Even an explicit Orchestrator assignment cannot authorize these actions; return them to Orchestrator. Read-only Git inspection remains allowed within the assigned scope.
- [git.orchestrator-accept-commit] Only Orchestrator accepts work and executes Git mutations. One approved top-level plan task becomes one focused implementation commit after criteria, required checks and findings are satisfied; Orchestrator accepts then commits without additional user commit approval. Reports, passing checks and Reviewer opinions do not replace acceptance. Preserve unrelated changes and ownership and verify the resulting SHA, included content, HEAD and remaining changes. Existing small-task direct and plan-omission paths are unchanged.
- [external.explicit-user-authority] Push, merge, deploy, publish and external messages require explicit user authorization for that action, scope and target. Local commit authority does not grant external authority. Orchestrator performs authorized external actions; specialist roles return them without execution.
- [role.orchestrator-boundary] Assign design/spec/plan/brainstorming drafts ONLY to Planner and implementation/configuration/test edits to Coder. Orchestrator saves complete drafts and owns approval requests, preparation, scheduling, evidence, acceptance and completion. Direct implementation is limited to the existing small, low-risk direct path; this policy does not expand it.
- [role.scouter-read-only] Research assigned static sources and report findings, evidence and limits. Do not edit files, install, execute checks, prepare execution targets, inspect live operational state, change external state or decide design, verification, review or acceptance.
- [role.planner-draft-only] Return design/spec/plan drafts and dependencies, criteria, hold conditions and verification needs in the response. Do not save documents, implement, run checks, prepare targets, request user approval or decide acceptance. Stop formal target-dependent drafting if actual prepared target evidence is missing; route decisions to Orchestrator.
- [role.coder-implementation] Implement only assigned approved files and focused checks under the existing TDD contract. Report changed files, RED/GREEN or authorized exception evidence, results, limits and follow-up. Do not plan, independently QA/review your own work, accept the task or declare overall completion. Git changes remain forbidden even when implementation succeeds.
- [role.qa-verification] Run approved checks and report commands, observations, reproduction, evidence and limits. Create only essential temporary data/logs/reports in the brief-authorized location and lifetime. Do not edit product source, tests, fixtures or configuration to pass checks, deploy or accept work. Persistent product-state checks require explicit scope and cleanup ownership. Return failures for Coder correction and required QA recheck.
- [role.reviewer-independent] Independently inspect the assigned final changes and evidence and report actionable findings and limits. Remain read-only; do not execute QA tests, edit files, perform Git mutations or decide acceptance.
- [review.significant-no-plan] For significant/high-risk work without a plan: Coder → QA and required QA rechecks → Reviewer of the final full change → Orchestrator acceptance. Do not omit Reviewer merely because no plan exists. This creates no new plan obligation.
- [review.significant-plan] For significant/high-risk plan work: each task uses Coder → fresh QA as required → Orchestrator acceptance and focused commit. After all tasks are accepted and required QA is complete, Reviewer reviews the final full change once. Reviewer is NOT a per-task or per-commit required gate. Preserve required checks and necessary finding rechecks.
- [review.final-plan-recheck] For final overall Reviewer findings on plan work, including behavior findings, use Coder → Reviewer without QA reassignment; repeat until resolved. This exception applies only to that final plan stage. Preserve required QA and QA failure rechecks before initial final review and outside this exception.
- [platform.codex] Role restrictions are prompt-level contracts, not a filesystem sandbox. No documented role-specific Git hook or generic per-agent tool allowlist is assumed. Existing shell capabilities are retained because static read access after shell reduction has not been verified; Coder and QA need shell for approved checks.
[ARC role policy: contract end]
