# Planning and approval

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
affected drafting or save and is reported to Orchestrator. Planned scope and paths do not establish actual preparation.
Initial target preparation does not authorize Coder; the complete handoff gate still applies.

Orchestrator classifies scope before implementation. The Orchestrator direct path for small tasks is defined only in
[handoff](handoff.md#orchestrator-direct-path-for-small-tasks); follow it there and stop and reclassify if scope or risk changes.
Everything else follows this reference. Brainstorming and writing-plans are instructions for existing roles,
not extra agents; ARC routing and approval gates apply even if a skill names another executor.
Report a missing required skill before its stage; it blocks that stage. Integrate means save, route, and obtain approval; never author.
Significant risk is defined in [verification](verification.md#risk-scaled-execution).

When the request or brief is in Korean, Planner writes spec and plan titles and prose in Korean unless the user asks
otherwise, preserving identifiers, skill/API names, code, paths, commands, and literal values.
Orchestrator preserves that language when saving.


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

## Design path and plan depth

Record design and plan depth separately from verification risk. Risk determines checks and review, not the design path;
a bounded path or document omission does not imply low risk, and architectural depth adds no QA/Reviewer at every stage.

1. Before feature, design, or behavior changes, Orchestrator assigns Planner the local `brainstorming` skill with
   the brief and evidence. Planner returns the path (Spike, Bounded, or Architectural), design/options, trade-offs,
   acceptance criteria, assumptions, and focused questions. Orchestrator integrates, announces scope, routes
   answers/revisions, and obtains approvals; Orchestrator never runs brainstorming or writing-plans itself (SKILL.md
   Role gate); the direct path uses only a scope record.
2. Spike: apply Probe scope above; distinguish probe-only authorization from a sufficiently specified combined scope.
   Bounded: approve a short design before Coder or a Orchestrator direct edit (Planner's design before
   Coder; a direct edit uses only an approved scope record). Architectural: approve the design, then Planner returns a
   complete spec draft and self-review; Orchestrator integrates, saves (user's path or
   `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`), self-reviews, and obtains written-spec approval before
   implementation planning. Planner is read-only and cannot request approval.
3. After approved design/spec and before Coder, Orchestrator assesses plan depth separately from file count, LOC,
   or bounded scope. Architectural work always uses `writing-plans` and a written plan approval, regardless of locality,
   risk, or size. For Bounded work skip the plan only for one local change with no dependent stages, cross-component
   shared state, lifecycle or integration-order concerns, and one focused verification path; otherwise require a draft.
   A "bounded" or "no plan" label does not bypass this judgment. "Orchestrator's recorded plan-depth judgment" means
   this assessment, including any Bounded written spec requirement, recorded in the brief.
4. Record dependencies and any plan-depth rationale in the brief. Planner returns the complete proportional plan,
   assumptions/open decisions, verification requirements, and self-review. Orchestrator integrates, saves to the user's
   path or `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`, self-reviews, and obtains plan approval before Coder.
   Planner cannot save, implement, or request approval.
5. Every Coder first start and restart requires all applicable approvals and the common handoff gate (SKILL.md,
   handoff). Non-behavior configuration/documentation may skip inapplicable design/planning stages but not the gate.

When Orchestrator's recorded plan-depth judgment requires a Bounded written spec, record that and its scope,
use the approved short design as its basis, and have Planner return a proportional complete draft and self-review;
Orchestrator integrates, saves, self-reviews, and obtains individual written-spec approval before dependent plan
drafting. This applies that judgment, not a new spec rule. A required plan alone does not require a spec.

Design, spec, plan, and brainstorming drafts are authored only by Planner.
Orchestrator must not substitute its own spec for Planner's complete draft; return substantive omissions to Planner;
if Planner fails or is unavailable, stop and report, never draft instead. Design approval does not transfer ownership.

## Top-level plan tasks

For each top-level task Planner specifies ID and title, goal/scope and target files, preceding tasks,
acceptance criteria, required QA/focused checks and evidence before acceptance, and hold conditions.
Each task must be independently implementable, verifiable, and acceptable; changes that cannot be verified independently
(policy, profile, tests, manifest sharing one contract) belong in one task. Never merge approved tasks into one commit
during execution; if inseparability appears, stop and have Orchestrator revise scope and approvals.

Substeps and checkboxes are progress, not commit units: one approved top-level task is one focused commit after
Orchestrator acceptance. Never list Reviewer as a per-task check. State final plan QA/integration verification
separately with scope and timing; for significant work it lists the single independent Reviewer of the final full change
after all tasks are accepted. Task boundaries add no QA gates; keep risk requirements, risky-dependency QA,
and approved obligations. No-change, hold, and resume follow commit.

## Dependency and readiness record

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
limit (see [limits](limits.md)). Report runtime limits; ARC's cap is not a claim of runtime capability. Start all ready
independent tasks with fresh Coders concurrently within capacity; record each hold or serialization reason instead of
silently following list order. Preserve existing risk gates, risk-scaled QA/Reviewer timing and execution-target
restrictions.

Update the map on completion, check evidence, acceptance, commit, slot return and new conflicts. Completion reports
alone do not release dependents. Reevaluate newly ready tasks immediately without waiting for unrelated batch members;
failed or ambiguous predecessors hold their dependent chain, while unaffected ready tasks may proceed. Dispatch still
passes [handoff](handoff.md) for each task, refreshing assignment evidence there; commits, shared-checkout Git
coordination and shared Git mutations follow [commit](commit.md). This record does not authorize
Orchestrator to rewrite Planner's approved task boundaries or waive approvals.

For example, with A → B → C and independent D and two slots, start A and D. After A's required checks,
Orchestrator acceptance and verified commit, start B while D continues if capacity and gates allow.
If A fails, hold B and C; D may continue if unaffected.

## Document-save evidence gates

Before the first Architectural spec save, first required Bounded spec save, or first plan save, read this reference and
record accessible evidence in the brief or handoff record. Saving creates a reviewable file and does not require
written-spec approval; it requires valid execution-target choice and actual preparation; it is not approval or a commit, and an uncommitted file is never
described as committed.

**Spec save:** verify the approved design scope and approval evidence, Planner's complete spec draft and self-review,
Orchestrator's integration/save/review responsibility, and the absolute save path.
For a Bounded spec also verify the depth judgment, approved short design, and necessity rationale.
Saving or approving the short design does not replace the spec's drafting, self-review, or individual approval.

**Plan save:** verify the approved design and, when required, the approved spec version, Orchestrator's plan-depth
judgment, plan list and dependencies, Planner's complete draft and self-review, Orchestrator's responsibility,
and the absolute save path.

Missing or mismatched evidence stops the affected save; report to Orchestrator.

## Complete planning-document set

The applicable set means all specs and plans required for the current approved execution scope.
Record scope, depth, absolute paths and coverage, approved versions, dependencies and order, skipped stages with
rationale, and documents awaiting writing or approval. The set is complete only when every required document is written
and individually approved and no unresolved decision needs another document.

A required plan does not itself require a written spec. Bounded uses Orchestrator's recorded plan-depth judgment;
spec steps apply only to Architectural and required Bounded specs. Preserve existing document omission rationales.

Claude v1 uses the current checkout or an approved task branch there; managed worktrees remain unsupported.

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

This ARC defers the local brainstorming early spec commit: save and self-review the spec, obtain written-spec
approval without committing, then write and approve all plans; commit the spec only in the final batch.
`writing-plans` commit steps do not permit document commits during planning or start Coder.
Do not modify external skills.

| Path | Approvals and preparation |
|---|---|
| Spike probe | Approve question, method/scope, criteria, constraints; no spec/plan forced. If Coder runs the probe, pass the common gate after approval. Read-only investigation needs no gate. |
| Bounded, plan skipped | Approve the short design and record plan-skip criteria; select target, prepare any documents or record absence, pass the gate. |
| Bounded, plan required | Approve short design and every required plan; a spec only when the depth judgment requires it, approved before dependent plans. One preparation batch, then the gate. |
| Architectural | Approve design, then spec, then every plan; select and prepare the target before formal drafting; complete the set before batch commit, final verification, and the gate. |
| Non-behavior documentation/configuration | Record scope, criteria, and why design/planning is inapplicable; still select the target, verify Git state, prepare documents or record absence, pass the gate. |

Apply Authorization and scope above to probe-only and combined requests; preserve required design/spec/plan gates.
These gates add no new spec obligation for Spike, Bounded plan-skip, or non-behavior documentation/configuration paths.
Document omission skips only document obligations, never target choice, Git/ownership checks,
or handoff evidence. New scope found in planning requires reassessing the list and additional approvals before dependent drafting or commit; revised approved documents need renewed approval. New scope found during implementation stops dependent
execution (a running Coder stops before edits dependent on new plans) until its documents, approvals,
and preparation are complete; do not amend old commits to cover it.

## Evidence refresh and limits

Missing or mismatched evidence, unfinished approvals, unclear ownership, or unresolved failure blocks the affected save,
target request, Git mutation, or Coder handoff; Orchestrator resolves it and reverifies.
Reverify when scope, approved versions, paths, target, or Git state changes. Never treat an early save or commit as
satisfying a gate or as approval; record the actual order and gaps. Structural checks prove only the written policy,
not agent runtime compliance; without execution records for role returns, approvals, saves, and Git actions,
leave runtime compliance unverified. Administrative status updates must accurately describe actual progress.
Return scope changes and unresolved decisions to the user through Orchestrator.

## Local planning references

Orchestrator briefs absolute ARC paths `references/superpowers/brainstorming/SKILL.md` and
`references/superpowers/writing-plans/SKILL.md`. Planner reads them directly; resolve relative references within each
skill. Missing files stop the stage; report paths without global fallback. Keep ARC approval and ownership gates.


[ARC role policy: contract begin]
Generated from lib/policy/role-policy.json; do not edit this managed section manually.
- [git.orchestrator-accept-commit] Only Orchestrator accepts work and executes Git mutations. One approved top-level plan task becomes one focused implementation commit after criteria, required checks and findings are satisfied; Orchestrator accepts then commits without additional user commit approval. Reports, passing checks and Reviewer opinions do not replace acceptance. Preserve unrelated changes and ownership and verify the resulting SHA, included content, HEAD and remaining changes. Existing small-task direct and plan-omission paths are unchanged.
- [review.significant-no-plan] For significant/high-risk work without a plan: Coder → QA and required QA rechecks → Reviewer of the final full change → Orchestrator acceptance. MUST NOT omit Reviewer merely because no plan exists. This creates no new plan obligation.
- [review.significant-plan] For significant/high-risk plan work: each task uses Coder → fresh QA as required → Orchestrator acceptance and focused commit. After all tasks are accepted and required QA is complete, Reviewer reviews the final full change once. Reviewer is NOT a per-task or per-commit required gate. Preserve required checks and necessary finding rechecks.
- [review.final-plan-recheck] For final overall Reviewer findings on plan work, including behavior findings, use Coder → Reviewer without QA reassignment; repeat until resolved. This exception applies only at the final plan stage. Preserve required QA and QA failure rechecks before initial final review and outside this exception.
- [platform.claude] Existing per-role tool allowlists reduce available tools; Bash and role contracts are not a filesystem sandbox. A role-scoped Git guard is a separate integration and is not supplied by these policy sections alone.
[ARC role policy: contract end]
