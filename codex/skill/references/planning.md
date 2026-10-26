# Planning contract

Read before design/plan-depth decisions, spec/plan drafting and approval, and the first spec/plan save.

## Authorization and scope

An explicit execution request authorizes only its sufficiently specified scope. Confirm execution intent,
expected outcome, constraints, document depth, and verification risk, with no unresolved material behavior, method,
or risk decision requiring the user. That scope must come from the request or a description the user explicitly references. Record authorization evidence, scope, acceptance criteria, constraints, and depth in the brief or
canonical record. Orchestrator may record routine execution and check choices; added product behavior or material scope is not already approved. Restating or handing off the same scope, or restarting, requires no new approval.

Silence, ambiguous assent, approval of other work, and unspecified blanket improvement requests are not authorization.
Planner's new material choices are not automatically approved. Ask for the missing material decision; roles route
questions to Orchestrator. Required written specs and plans still require their individual approval in the order below.

Material scope, method, or risk changes hold affected work; explain the missing decision or evidence and remaining work. Target changes, unclear ownership, unexpected state, unresolved failures, or missing required inputs
also hold affected work under [handoff](handoff.md) and [git-recovery](git-recovery.md). Distinguish new authorization
needs from execution issues within existing scope: ordinary corrections and reverification do not require duplicate
approval after failure. Revalidate affected gates after resolution.

### Probe scope

A probe-only scope completes by answering the approved question with findings, evidence, limits, and remaining uncertainty; well-supported infeasibility can complete it. Probe-only authorization does not authorize product retention
or subsequent implementation. Record question, method/scope, criteria, and constraints; a sufficiently specific probe
request can supply that approval. Match checks to probe purpose/risk and do not report probe evidence as product proof.

If the user explicitly requests both a probe and implementation and the whole scope is sufficiently specified, classify
the entire scope. When the entire scope meets the Bounded path criteria in Design path and plan depth, the probe is an
internal investigation with no new approval boundary at its report. Unknown implementation is not blanket authorization:
hold affected implementation if findings materially change scope, method, or risk, or leave a new material decision.
Reassess depth and obtain any required design/spec/plan approvals before that implementation. A probe-only request
remains separate.

## Formal drafting boundary

Initial design proposals and brainstorming may precede execution-target choice. Formal spec or plan drafting includes a complete draft before saving, even when returned only in chat. Before formal drafting and saving, Orchestrator supplies
and records the actual absolute workspace/repository, branch or detached HEAD, HEAD, changes and ownership,
explicit choice and preparation evidence, and absolute document paths inside that target. Planner drafts for that
verified workspace; Orchestrator saves directly in the selected target. Missing or mismatched evidence stops the
affected drafting or save and is reported to Orchestrator. Planned scope and paths do not prove actual preparation.
Initial target preparation does not authorize Implementer; the complete handoff gate still applies.


## Planner drafting preparation and consolidated feedback

During initial drafting and revisions, Planner reports progress only to Orchestrator. Keep updates brief: stage,
feedback being applied, actual blocker, or next step. Omit draft prose, long excerpts and incremental draft text.
Return the complete draft and self-review to Orchestrator for review and correction. Raw subagent responses may
appear in app or tool surfaces; prompt policy cannot hide them.

Orchestrator keeps user-facing progress brief and based on Planner status; do not relay draft content.
At approval, present the integrated, saved and reviewed Markdown document without repeating its body in chat.

1. Before formal drafting, Orchestrator performs a preflight of relevant policy, reference, profile, test, parity
   and manifest surfaces and conflicts. Apply the Formal drafting boundary above and coordination's instruction
   provenance, input-state and local-skill rules, including required reference paths, authorized bounded read
   alternatives and return conditions. Missing required inputs or unresolved conflicts hold dependent drafting;
   Planner returns them to Orchestrator. Optional read recovery grants no preparation, verification, writing or
   approval authority.

2. Maintain a compact ledger of original requirements/criteria IDs, approved and open decisions, exclusions and
   scope deltas; merge intervening user changes into one next-brief delta. Distinguish user-approved decisions,
   verified source facts with exact paths and lines, assumptions and open decisions.

3. Send one complete brief for the initial call of each stage, using coordination's shared fields and evidence-link
   rules. Include the prepared workspace, branch or detached HEAD, HEAD and ownership; scope, exclusions, depth,
   dependencies, shared contracts, acceptance criteria, required QA/focused checks, evidence and holds. Identify
   preceding approved versions, document/output paths, current behavior and connected source, generated, runtime,
   installer and documentation surfaces, policy conflicts and resolution direction, open decisions and the exact
   stage deliverable. For visual work, include approved sources/versions, criteria and unresolved interpretations.

4. Planner returns a complete proportional draft and self-review. Orchestrator integrates, saves, reviews and
   obtains approval; never authors missing content. Review the complete draft once with this fixed checklist:
   scope and evidence; targets, ownership and paths; policy surfaces and conflicts; task boundaries, dependencies
   and acceptance criteria; checks, evidence and holds; roles, approval and commit boundaries; draft completeness.
   Finish the checklist before sending all substantive omissions in one consolidated follow-up request.
   Identify each criterion, defect, evidence and expected correction. Follow coordination's changed-fields-only
   and `unchanged` rules. Do not split requests by omission.

5. After that correction, additional Planner calls require user-approved material scope/evidence changes or
   concrete unmet checklist items, plus meaningful new input or criterion-state progress. Identify changed input,
   target criterion, expected artifact and expected progress. Distinguish approved scope changes from ordinary
   omissions within existing scope; omissions require no renewed scope approval. If the same criterion remains
   unmet without meaningful new input, evidence or progress, hold the stage and report the criterion, observed
   evidence and exact unblock input or decision. Do not repeat resolved questions, reword the same request, or
   count rewording or agent replacement as meaningful input or progress.

Allow the initial draft and one consolidated correction. Do not invoke Planner only to reformat or re-express a
draft, fix a save error, or fix a patch-application error. Orchestrator handles these operations. Evaluate separate
substantive work under the normal Planner gate.

Initial design, required spec approval, and formal plan drafting/approval remain separate ordered stages;
written-spec approval precedes dependent plan drafting. No fixed call cap applies; never accept an incomplete draft
to reduce calls or add call-count conditions to Planner profiles.

## Design and planning

`brainstorming` and `writing-plans` are instructions for existing roles, not extra agents. This ARC controls
routing/approval gates even if a called skill names another executor. Follow local ARC reference instructions and user
constraints; report a missing required skill or local reference before that stage; it blocks that stage. Integrate means save, route, and obtain approval;
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
   the brief/evidence. Planner explores context. Planner proposes, Orchestrator decides the spike/bounded/architectural path; Planner also
   proposes design/options,
   trade-offs, acceptance criteria, assumptions, and focused questions. Orchestrator integrates, announces scope,
   routes user
   answers/revisions back, and obtains approvals; Orchestrator never runs brainstorming or writing-plans itself
   (SKILL.md Role gate);
   the direct path uses only a scope record.
2. Spike: apply Probe scope above; distinguish probe-only authorization from a sufficiently specified combined scope.
   Bounded: approve a short design before Implementer or an Orchestrator direct edit (Planner's design
   before Implementer; a direct edit uses only an approved scope record). Architectural: approve
   design, then Planner returns complete spec draft and self-review findings; Orchestrator integrates, saves,
   self-reviews, and obtains written-spec approval
   before implementation planning. Planner is read-only and cannot request approval.
3. After approved design/spec and before Implementer, Orchestrator assesses plan depth separately from file count, LOC,
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
   then obtains plan approval before Implementer.
5. Every Implementer first start and restart requires all applicable design/spec/plan approvals and passing
   the Common handoff gate in SKILL.md and handoff.md, with approved artifacts, brief, and relevant findings.
   Non-behavior
   configuration/documentation may skip inapplicable design/planning stages, but still requires the handoff gate.
   An Orchestrator direct edit requires its approved scope record and the same gate conditions before the first edit.

When a Bounded written spec is required by Orchestrator's recorded plan-depth judgment, record that necessity and scope
and use the approved short design as its basis. Planner returns a proportional complete spec draft and self-review;
Orchestrator integrates, saves, self-reviews, and obtains individual written-spec approval before dependent plan
drafting and execution preparation. This applies that judgment without adding a spec-necessity rule.

Design, spec, plan, and brainstorming drafts are authored only by Planner.
Orchestrator must not substitute an independently authored spec or plan for Planner's complete draft.
Return substantive draft omissions to Planner for completion; if Planner fails or is unavailable, stop and report,
never draft instead. Design approval does not transfer ownership.

## Top-level plan tasks

The Planner profile holds the full top-level task rules. Orchestrator checks each plan draft for: per task ID and title,
implementation goal/scope and target files, preceding tasks and dependencies, acceptance criteria, required QA/focused
checks and evidence before acceptance, and hold conditions; each task independently implementable, verifiable and
acceptable, with changes that cannot be independently verified (including policy/profile/tests/manifest sharing one
contract) in one task from the outset; and final overall plan verification stated separately from task acceptance
prerequisites, with scope and timing. Never list Reviewer as a per-task required check (Reviewer timing: [Risk-scaled execution](verification.md#risk-scaled-execution)). RED/GREEN and individual
commands do not create commit units; one task is one focused commit under commit.md, which also covers no-change, hold
and resume. Do not combine different approved tasks into one commit during execution; if inseparability appears later,
stop affected work and have Orchestrator handle revised scope, planning and applicable approvals.
These requirements apply to required plans; existing plan-omission paths gain no new plan obligation.

### Dependency and readiness record

After plan approval and before the first Implementer assignment, Orchestrator records all top-level task IDs in the
accessible canonical handoff record, linked to the approved plan version. For each task record explicit and implicit
predecessors, required inputs, outputs and shared contracts, owned files, conflicting shared resources, required
checks/QA path, ready/held status and reasons. Record the initial ready batch and capacity/serialization reasons.
Analyze shared APIs, contracts, generated artifacts and resources even when tasks edit different files. Unresolved
shared contracts or insufficient dependency information block the affected tasks; same-file concurrent Implementer edits
are blocked even for different lines. Do not infer independence from file separation or plan listing order.

A task is ready only when all applicable approvals and execution preparation are complete, required inputs/contracts
are available and settled, predecessors have required evidence and Orchestrator acceptance plus verified focused
commits (or accepted no-change records), ownership/resources do not conflict, its required check/QA path is available,
and a subagent slot exists under both the configured ARC full-tree cap shared by all roles and any lower actual runtime
limit (see [limits](limits.md)). Report runtime limits; ARC's cap is not a claim of runtime capability. Start all ready
independent tasks with fresh Implementers concurrently within capacity; record each hold or serialization reason instead of
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

### Document-save evidence gates

Before the first architectural spec save, first required Bounded written spec save, or first plan save, read this
reference and record accessible evidence in the shared brief/canonical handoff record.
Saving creates a reviewable file; it grants no approval and creates no Git commit.

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

The applicable document set covers all specs and plans required for the current approved execution scope, excluding future project work. Orchestrator records scope, design/plan depth, absolute document paths and coverage, approved
versions/status, plan dependencies and execution order, skipped stages with rationale, and documents still awaiting writing or approval
in the shared brief. The set is complete only when every required document is written and individually approved, with no unresolved scope or dependency decision requiring another document. Do not omit required documents from the list.

A required plan does not itself require a written spec. Bounded uses Orchestrator's recorded plan-depth judgment to
determine whether a written spec is required; do not infer one from plan necessity. Spec steps apply only to Architectural and
required Bounded specs, and plan steps only to required plans. These gates add no new spec obligation to Spike,
Bounded plan-skip, or non-behavior documentation/configuration paths; preserve existing omission rationales.

Normal order: initial design approval → execution-target choice → target preparation and verification →
formal spec drafting (when required), saving and self-review → written-spec approval → formal plan drafting
(when required), saving and self-review → individual plan approvals → complete applicable set → existing-commit
verification and one batch docs commit of remaining approved documents → final Git verification → Implementer handoff.
Written-spec approval precedes dependent plan drafting. On document-omission paths skip only the inapplicable document
steps; preserve target choice, preparation, state/ownership checks and Implementer gates.

While documents are being written, reviewed, or approved, do not stage documents or commit planning documents.
Select and initially prepare the target before formal drafting. Document completion gates staging/commit, not initial preparation. An incomplete set or missing applicable approval blocks document commit and Implementer, but not the initial choice request. No early Implementer work is authorized by approval of only some documents.

This ARC explicitly defers the local `brainstorming` instruction to commit the spec before written-spec review:
save and self-review the spec, obtain written-spec approval without committing it, then write and obtain approval for
all applicable plans. Commit the spec only in the final batch preparation. Do not modify external skills.
`writing-plans` implementation-step commit instructions
are not permission for document commits during planning or for starting Implementer.

| Path | Applicable approvals and preparation |
|------|--------------------------------------|
| Spike probe | Approve the feasibility question, probe method/scope, acceptance criteria, and constraints. Do not force specs/plans for still-unknown implementation; no new spec obligation is added by this gate. If Implementer executes the probe, pass the Common handoff gate after probe approval. Read-only Orchestrator/Planner investigation without Implementer does not trigger that gate. |
| Bounded, plan skipped | Approve the short design and record the existing plan-skip criteria/rationale; this gate adds no new spec obligation. Complete applicable approvals, select the target, prepare any actual approved documents, or record valid document absence, then pass the Common handoff gate. |
| Bounded, plan required | Approve the short design and every required plan; write a spec only when Orchestrator's recorded plan-depth judgment requires it, then obtain its individual written-spec approval before dependent plan drafting. Select and prepare the target before formal drafting; complete all applicable artifacts before one docs batch and the Common handoff gate. |
| Architectural | Approve design, then written spec, then every required plan using `writing-plans`; select and prepare the target before formal drafting; complete the document set before batch preparation, final verification, and the Common handoff gate. |
| Non-behavior documentation/configuration | Record scope, acceptance criteria, and why design/planning stages are inapplicable; this gate adds no new spec obligation. Still select the target, verify Git state, prepare actual approved documents or record absence, and pass the Common handoff gate. |

Apply Authorization and scope above to probe-only and combined requests; preserve required design/spec/plan gates.
These gates add no new spec obligation for Spike, Bounded plan-skip, or non-behavior documentation/configuration paths.
Document omission skips only document obligations, never explicit
execution-target choice, Git state/ownership checks, or handoff evidence.

If planning reveals new scope, reassess the list, depth, and dependencies and obtain additional required approvals
before dependent drafting or commit. Changed approved document bodies require approval of the revised version, except
mechanical execution records defined below. If implementation reveals new scope, stop affected execution until that
scope's documents, approvals, and preparation are complete. Then reflect the approved plan version in its original
planning-document commit under the update contract below; never retroactively authorize work before actual approval.
An already-running Implementer must stop before edits dependent on new plans; inspect
current changes/Git state and do not retroactively claim preparation. A restart without document changes follows Choice
lifetime and restart record in [handoff.md](handoff.md).

## Plan updates during execution

Mechanical execution records may be recorded without new user approval: checkbox completion, actual results, evidence
links and task completion state that preserve the approved execution contract. Record their classification, reason and actual recording time in the canonical handoff record. Required checks' removal, invented success, unsupported acceptance
or scope changes mixed with a completion mark are not mechanical records.

Changes to goals, task scope or boundaries, acceptance criteria, method, risk, dependencies or required verification
require revised-version approval before affected work. Hold affected execution, obtain necessary design/spec/plan approvals
in order, and complete target, ownership, checks and handoff preparation before resuming. Other approved body corrections
follow the document-version approval rules; classify typos, paths, commands and explanations by their semantic effect.

Both mechanical records and approved contract revisions amend the original planning-document commit at a safe checkpoint.
Make no separate document commit or fixup commit, including for newly approved scope. Preserve implementation task commits.
This history update does not backdate approval: the latest plan in the original commit does not prove its contents were approved from the outset. Never use rewritten history to justify work started before approval.

In the canonical handoff record preserve plan absolute/Git paths; before and after content hashes and versions; prior and
revised approval references and actual times; change reason and classification; affected tasks and hold/preparation/resume
evidence. For mechanical records explain why no new approval is needed and record the time. Preserve recoverable document
contents, not hashes alone, and each old-to-new SHA mapping for the original document commit and descendant task commits.
Do not overwrite earlier approval references or the contents they approved.

Orchestrator alone performs the safe rewrite in [handoff-prep](handoff-prep.md#execution-time-plan-amendment) and
[commit](commit.md#execution-time-plan-document-updates). Shared/published or unknown history, merges, unclear ownership,
unexpected HEAD/dirty state and replay conflicts stop affected work. No force push or fallback document commit.
After rewriting, connect evidence to the new state under [verification](verification.md#evidence-after-plan-history-rewrite).
This contract adds no Git automation, runtime enforcement, authority or exemption from required checks/QA/Reviewer gates.

### Evidence refresh and limits

Missing or mismatched evidence, unfinished approvals, unclear ownership, or unresolved failure blocks the affected
save, execution-target request, Git mutation, or Implementer handoff: stop and report to Orchestrator.
Orchestrator resolves the issue and reverifies affected evidence before resumption. Reverify evidence when scope,
approved versions, paths, target, or relevant Git state changes. Preserve unrelated changes under handoff rules;
read-only investigation remains allowed.

Do not retroactively treat an early save or commit as satisfying these gates or as user approval. Record the actual
order and any evidence gap. Structural checks prove only the repository's written policy contract, not consuming-agent
runtime compliance. Without execution records for role returns, approvals, saves, and Git actions, leave runtime
compliance unverified. Do not add runtime infrastructure or modify external skills for these checks.
The narrow exception below applies only to the explicitly approved cooperative CLI path within this repository.

### Managed worktree preparation

See [handoff-worktree.md](handoff-worktree.md) for the managed worktree contract.

## Local planning references

Orchestrator briefs absolute ARC paths `references/brainstorming.md` and
`references/writing-plans.md`. Planner reads them directly; resolve relative references from the installed
`references/` directory. Missing files stop the stage; report paths without global fallback. Keep ARC approval and ownership gates.



## Instruction and Input Provenance

Give the Planner the exact paths and access state for required skills and references, distinguish user-provided instructions from discovered files, and identify approved input versions and open questions. Criteria that use visual materials must link the approved source, version, access state, criterion IDs, and comparison method. Missing required inputs and unapproved interpretations hold dependent parts of the draft. Optional read alternatives must meet the pre-authorized conditions in [handoff](handoff.md#instruction-sources-bounded-read-recovery-visual-evidence-and-resumption). The Planner remains draft-only during recovery.

[ARC role policy: contract begin]
Generated from lib/policy/role-policy.json; do not edit this managed section manually.
- [git.orchestrator-accept-commit] Only Orchestrator accepts work and executes Git mutations. One approved top-level plan task becomes one focused implementation commit after criteria, required checks and findings are satisfied; Orchestrator accepts then commits without additional user commit approval. Reports, passing checks and Reviewer opinions do not replace acceptance. Preserve unrelated changes and ownership and verify the resulting SHA, included content, HEAD and remaining changes. Existing small-task direct and plan-omission paths are unchanged.
- [review.significant-no-plan] For significant/high-risk work without a plan: Implementer → QA and required QA rechecks → Reviewer of the final full change → Orchestrator acceptance. MUST NOT omit Reviewer because no plan exists. This creates no new plan obligation.
- [review.significant-plan] For significant/high-risk plan work: each task uses Implementer → fresh QA as required → Orchestrator acceptance and focused commit. Reviewer reviews the final full change once after all tasks are accepted and required QA is complete. Reviewer is NOT a per-task or per-commit required gate. Preserve required checks and necessary finding rechecks.
- [review.final-plan-recheck] For final overall Reviewer findings on plan work, including behavior findings, use Implementer → Reviewer without QA reassignment; repeat until resolved. This exception applies only at the final plan stage. Preserve required QA and QA failure rechecks before initial final review and outside this exception.
- [planning.plan-amend] During approved task execution, mechanical plan progress records need no new user approval; changed goals, scope, criteria, method, risk, dependencies or required verification require revised-version approval and preparation before affected work. In both cases Orchestrator amends the original planning-document commit at a safe boundary, without a separate document or fixup commit. Preserve actual approval chronology, recoverable old/new contents, hashes, versions and SHA mappings; never retroactively authorize earlier work. Rewrite only unpublished, unshared local linear history with clear ownership and no merges; stop on unknown publication, ownership, unexpected state or replay conflicts, without force push or a fallback document commit. Preserve implementation task boundaries and revalidate affected evidence. See planning, handoff-prep, commit and verification for the full contract.
- [planning.planner-brief] Follow planning.md's Planner drafting preparation and consolidated feedback procedure, including preflight, ledger, evidence classification, target preparation, preceding approvals, provenance and reference gates. Allow the initial draft and one consolidated correction. Send one complete stage-specific initial brief. Planner returns a complete proportional draft and self-review; Orchestrator reviews once with the fixed checklist and sends one consolidated correction using changed fields only. Additional Planner calls require user-approved material scope/evidence changes or concrete unmet checklist items after correction, plus meaningful new input or criterion-state progress; state changed input, target criterion, expected artifact and expected progress. Hold repeated unmet criteria without new input, evidence or progress and report the criterion, observed evidence and exact unblock input or decision. Do not split omissions, repeat resolved items, or count rewording or agent replacement as progress. Do not invoke Planner only to reformat or re-express a draft, fix a save error, or fix a patch-application error. Orchestrator handles these operations. Evaluate separate substantive work under the normal Planner gate. Preserve separate sequential design/spec/plan approvals; no fixed call cap, Planner-profile call-count conditions or incomplete draft acceptance. Keep user-facing progress brief and based on Planner status; do not relay draft content. At approval, present the integrated, saved and reviewed Markdown document without repeating its body in chat.
- [platform.codex] Role restrictions are prompt-level contracts, not a filesystem sandbox. No documented role-specific Git hook or generic per-agent tool allowlist is assumed. Existing shell capabilities are retained because static read access after shell reduction has not been verified; Implementer and QA need shell for approved checks.
[ARC role policy: contract end]

## Approved cooperative execution path within the repository

The approved installed workflow entry connects document commits to the initial Implementer assignment in plan mode.
Resolve `<target-home>/skills/arc/runtime/cli.mjs` from the actual loaded ARC skill location selected by the installation
resolver, including custom homes. Invoke `node` with that path and command options as separate arguments; for shell
calls use `node "$ARC_RUNTIME_ENTRY" <command> --cwd "$ARC_CHECKOUT" --workflow "$ARC_WORKFLOW_ID" --input -`
with safely assigned, quoted values. See [handoff](handoff.md) for invocation and continuity requirements.
An entry update does not migrate existing state or renew approvals; runtime/target drift still requires current evidence.
Its scope is decisions and records within the repository's cooperative path. It adds no authority to install native hooks/providers/installers or block direct tool calls.
`no-plan`/omission is unsupported by this CLI, and this boundary remains in Phases 2 and 3. This does not imply an omission policy violation or a new obligation to write documents.

Orchestrator records the SHA-256 values of the user-approved spec and plan, their shared docs-only commit, document version and approval version.
The CLI verifies the exact changed paths in actual Git objects and the current document bytes before persisting an assignment intent.
A new workflow or late document commit cannot prove earlier execution was compliant. Earlier agent history and execution outside this path remain unverified.
Approval attestations and native returns are `operator-attested`; an agent ID is not an authenticated identity.
