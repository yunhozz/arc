<a id="planning-contract"></a>
# Planning contract

Read before depth judgments, spec/plan drafting/approval and first saves.

<a id="authorization-and-scope"></a>
## Authorization and scope

An explicit execution request authorizes only sufficiently specified scope from that request or a description the user explicitly references. Confirm intent/outcome/constraints/document depth/verification risk and no unresolved material behavior/method/risk decision. Record approval evidence, scope, criteria, constraints and depth. Orchestrator may choose routine execution/check details, not unapproved product behavior/material scope. Restating/handoff/restart of unchanged scope needs no new approval.

Silence, ambiguous assent, other-work approval and vague blanket improvements are insufficient. Planner's new material choices are not automatically approved. Request missing decisions through Orchestrator. Required specs/plans retain separate ordered approval.

Material scope/method/risk changes hold affected work with missing decision/evidence/remaining scope reported. Target change, unclear ownership, unexpected state, unresolved failure or missing inputs also hold under [handoff](handoff.md)/[recovery](git-recovery.md). Distinguish new authorization from existing-scope execution issues; routine correction/reverification needs no duplicate approval. Revalidate after resolution.

<a id="probe-scope"></a>
### Probe scope

Probe-only work ends with approved-question findings/evidence/limits/uncertainty, including well-supported infeasibility. It authorizes neither product retention nor subsequent implementation. Record question/method/scope/criteria/constraints; a specific request may approve them. Match checks to purpose/risk, not product-proof claims.

If explicitly requested probe+implementation is fully specified, classify the whole scope. Under Bounded conditions, probing is internal with no new report-time approval boundary. Unknown implementation is not blanket authorization. Materially changed scope/method/risk or new decisions hold implementation for reassessment and required design/spec/plan approvals. Probe-only remains separate.

<a id="formal-drafting-boundary"></a>
## Formal drafting boundary

Initial design/brainstorming may precede target choice. Formal spec/plan includes complete pre-save drafts returned only in chat. Before that, Orchestrator records actual absolute workspace/repository, branch/detached HEAD/HEAD, changes/ownership, explicit choice/preparation and in-target absolute document paths. Planner drafts for verified target; Orchestrator saves there. Missing/mismatched evidence stops affected drafting/saving. Planned paths prove no actual preparation. Initial preparation never starts Implementer without full handoff.

Small-task direct edits follow only [handoff](handoff.md#orchestrator-direct-path-for-small-tasks), stopping/reclassifying changed scope/risk. Otherwise follow this reference. `brainstorming`/`writing-plans` instruct existing roles, not extra agents; ARC routing/approval overrides alternate executors. Missing required skills block their stage. Integration includes saving, reviewing and directly revising the same spec or plan after the complete Planner first draft; design/brainstorming retain their Planner drafting path.

For Korean requests/briefs, Planner uses Korean titles/prose unless another language is requested, preserving identifiers, skill/API names, code, paths, commands and literals. Orchestrator preserves agreed language when saving.

<a id="planner-drafting-preparation-and-consolidated-feedback"></a>
## Planner drafting preparation and consolidated feedback

Planner reports initial/revision progress only to Orchestrator: brief stage/feedback/blocker/next step, never body/excerpts/incremental drafts. Return complete draft/self-review. Raw responses may appear in app/tool surfaces; prompt policy cannot hide them. User updates stay brief/status-based without draft content. At approval present integrated/saved/reviewed Markdown without repeating its body in chat.

1. Preflight relevant policy/references/profiles/tests/parity/manifest/conflicts. Apply formal-target and coordination provenance/input/local-skill gates, including required paths, approved bounded read alternatives and return conditions. Missing inputs/conflicts hold drafting. Read recovery grants no preparation/check/write/approval authority.
2. Maintain a compact ledger of original requirements/IDs, approved/open decisions, exclusions and scope deltas. Consolidate intervening user changes into one brief delta. Separate approvals, path/line-verified facts, assumptions and open decisions.
3. Send one complete stage-specific initial brief: prepared target/HEAD/ownership, scope/exclusions/depth/dependencies/shared contracts/criteria/checks/evidence/holds; preceding approved versions, paths, current behavior and connected source/generated/runtime/installer/docs, policy conflicts/resolution direction and exact deliverable. Visual work includes approved sources/versions/criteria/open interpretations.
4. Planner returns the complete proportional first draft and self-review. Orchestrator saves and reviews it against the fixed checklist: scope/evidence; targets/ownership/paths; policy/conflicts; task boundaries/dependencies/criteria; checks/evidence/holds; roles/approval/commit boundaries; completeness. For spec or plan, Orchestrator directly revises the same document, including substantive omissions, before requesting approval. New product decisions outside approved scope require user input first; Orchestrator then revises the document. Missing or failed first drafts stop the stage and do not transfer initial authorship.
5. For design and brainstorming, finish the checklist before one consolidated correction covering every substantive omission with criterion/defect/evidence/expected fix. Use deltas/`unchanged`; never split by omission. Further calls after correction need approved material scope/evidence changes or concrete unmet checklist items plus meaningful new input/criterion progress. State changed input/target criterion/expected artifact/progress. Existing-scope omissions need no renewed scope approval. Repeated unmet criteria without new input/evidence/progress hold the stage; report criterion/observation/exact unblock decision. Do not repeat resolved questions or count rewording/agent replacement as progress.

For design and brainstorming, allow initial draft and one consolidated correction. Reformatting/re-expression/save/patch errors belong to Orchestrator, not Planner calls. Separate substantive work uses normal gates. Design/spec/plan stages remain separately ordered; spec approval precedes dependent planning. Add no fixed call cap/profile count condition or incomplete-draft acceptance.

<a id="design-and-planning"></a>
<a id="design-path-and-plan-depth"></a>
## Design path and plan depth

Record depth separately from risk. Risk controls checks/review, not design paths/plan approval. Bounded/omission is not low risk; Architectural adds no QA/Reviewer at every stage. Apply risk rules and specific obligations.

1. Before feature/design/behavior work, assign brief/evidence/local `brainstorming` to Planner. Planner proposes context/path/options/tradeoffs/criteria/assumptions/questions; Orchestrator selects path, integrates, announces scope, routes revisions and obtains approval. Never run drafting skills itself. Direct path uses scope record only.
2. Spike distinguishes probe-only from specific combined scope. Bounded approves short design before Implementer; direct edits use approved scope record. Architectural approves design, then complete Planner spec/self-review, Orchestrator save/review and written-spec approval before planning. Planner is read-only and requests no approval.
3. Assess plan depth after design/spec approval and before Implementer, separately from files/LOC/Bounded label. Architectural always uses `writing-plans` and written-plan approval regardless of size/locality/risk. Bounded skips only for one local change, no dependent stages/cross-component shared state/lifecycle/integration-order concerns and one verification path. Otherwise require a plan. Labels/no-plan requests do not bypass judgment, which also records Bounded spec necessity.
4. Record dependencies/depth reasons. Planner returns complete plan/assumptions/open decisions/checks/self-review. Orchestrator saves/reviews/obtains approval before Implementer at user path or `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`. Default spec path is `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`.
5. Every Implementer first start/restart needs applicable approvals/artifacts/brief/findings and full handoff. Non-behavior docs/config omit only inapplicable stages. Direct edits need approved scope record and same first-edit gates.

If Bounded requires written spec, record necessity/scope using approved short design as basis. Planner returns proportional full spec/self-review; Orchestrator saves/reviews/obtains individual approval before dependent plan/preparation. Short design approval never substitutes. This applies recorded judgment, not new spec necessity. Required plans alone imply no written spec.

Only Planner authors the first complete spec or plan draft and self-review. Orchestrator reviews and directly revises the same document before approval. Unavailable/failed Planner stops first drafting rather than transferring authorship. Design approval does not transfer initial authorship.

<a id="top-level-plan-tasks"></a>
## Top-level plan tasks

Apply Planner rules: ID/title, goal/scope/files, predecessors/dependencies, criteria, required pre-acceptance QA/checks/evidence and holds. Tasks must be independently implementable/verifiable/acceptable. Inseparable policy/profile/tests/manifest contracts start in one task. If inseparability appears later, stop for revised scope/planning/approvals; never merge distinct approved tasks during execution.

Substeps/checkboxes/RED-GREEN/commands are not commits. One top-level task becomes one focused commit after acceptance; [commit](commit.md) governs no-change/hold/resume. Reviewer is never a per-task check. Final whole verification has separate scope/timing; significant work lists one Reviewer after all task acceptances/risk checks. Task boundaries alone add no QA. Apply only to required plans; omission paths gain no plan obligation.

<a id="dependency-and-readiness-record"></a>
## Dependency and readiness record

After approval and before first assignment, canonically link every task ID to plan version. Record explicit/implicit predecessors, inputs/outputs/shared contracts, files/conflicting resources, check/QA paths, ready/held/reasons, initial ready batch and capacity/serialization reasons. Analyze shared APIs/contracts/generated artifacts/resources even across files. Unsettled contracts/incomplete dependencies block affected tasks; same-file concurrent Implementers are forbidden even on different lines. File separation/list order proves no independence.

Ready requires approvals/preparation, settled inputs/contracts, predecessor checks/Orchestrator acceptance/verified commits or accepted no-change, nonconflicting ownership/resources, available checks/QA and slots under both full-tree ARC and lower actual runtime limits. Read [limits](limits.md); report runtime constraints without claiming capability. Start ready independent tasks concurrently with fresh Implementers within capacity. Record holds/serialization rather than silently following order. Preserve risk/QA/Reviewer/target gates.

Update on reports/checks/acceptance/commit/slot return/conflicts. Completion alone releases no dependent. Immediately reassess newly ready tasks without waiting for unrelated batches. Failed/uncertain predecessors hold only their chains. Refresh handoff each dispatch; shared Git follows commit rules. This map cannot rewrite approved boundaries or waive approval.

Example: with A → B → C, independent D and two slots, start A/D. After A's checks/acceptance/verified commit, B may start while D continues. A failure holds B/C, not unaffected D.

<a id="document-save-evidence-gates"></a>
## Document-save evidence gates

Before first Architectural spec, required Bounded spec or plan save, read this and record accessible brief/canonical evidence. Saving creates reviewable files, not approval/commits.

| Save | Required evidence |
|---|---|
| Spec | Approved design scope/evidence, complete Planner draft/self-review, Orchestrator integration/save/review ownership and absolute path. Required Bounded specs also need depth judgment, short design, necessity/scope |
| Plan | Approved design and required approved spec/version/evidence, depth judgment, plan list/dependencies, complete Planner draft/self-review, ownership and absolute path |

Saving for review does not require prior written-spec approval, but does require valid target choice/actual preparation. Individually approved specs enter the document set before dependent planning. Never call uncommitted files committed. Missing/mismatched evidence stops the affected save.

<a id="complete-planning-document-set"></a>
## Complete planning-document set

Include all current-scope required specs/plans, excluding future projects. Record scope/depth/absolute paths/coverage/versions/status/dependencies/order/omissions/reasons/pending drafting and approvals. Complete means every required document written/individually approved and no unresolved decision requiring another document. Omit no required artifact.

A required plan implies no spec. Bounded follows recorded judgment; spec stages cover Architectural/required Bounded only, plan stages required plans only. Add no spec duty to Spike/plan-skip/non-behavior paths.

Order: initial design approval → explicit target → actual preparation/verification → required spec drafting/save/self-review/individual approval → required plans drafting/save/review/individual approval → full set → verify existing commits/batch remaining approvals → final Git → Implementer. Omission skips only inapplicable documents with rationale. Complete documents precede staging/commit/handoff, not initial preparation/choice request. Partial approvals authorize no early implementation.

Defer local `brainstorming`'s early spec commit: save/self-review/approve uncommitted spec, approve all plans, then final batch. Modify no external skill. `writing-plans` implementation commits grant neither planning-document commits nor early Implementer.

| Path | Approval/preparation |
|---|---|
| Spike | Approve question/method/scope/criteria/constraints; no forced unknown-implementation docs. Implementer probes require handoff; read-only Orchestrator/Planner probes without Implementer do not trigger it |
| Bounded, plan skipped | Approve short design; record omission conditions. Complete approvals, target choice, actual docs or valid absence, then handoff |
| Bounded, plan required | Approve design/all required plans; approve necessary specs before dependent planning. Prepare target before drafting, complete set before batch/handoff |
| Architectural | Design → written spec → all `writing-plans` plans. Target before drafting; full set before batch/final checks/handoff |
| Non-behavior docs/config | Record scope/criteria/inapplicability. Preserve target/Git/docs-or-absence/handoff |

New planning scope requires list/depth/dependency reassessment and approvals before dependent drafting/commit. Approved-body changes need revised approval except mechanical records below. New implementation scope holds execution until docs/approvals/preparation complete. Running Implementer stops before newly dependent edits; inspect actual changes/Git without retrospective preparation claims. Reflect approved versions through original-commit updates below. Unchanged-document restarts follow handoff lifetime.

<a id="plan-updates-during-execution"></a>
## Plan updates during execution

Mechanical checkboxes/results/evidence/completion preserving the approved contract need no new approval; record classification/reason/actual time. Removing checks, invented success, unsupported acceptance or mixed scope changes are not mechanical.

Goal/task boundary/scope/criteria/method/risk/dependency/check changes require revised approval before affected work. Hold, obtain ordered design/spec/plan approvals and prepare target/ownership/checks/handoff. Other body corrections follow version approval; classify typos/paths/commands/explanations by semantic effect.

Both kinds amend the original planning commit at safe boundaries, never separate docs/fixup commits, including new scope. Preserve implementation commits. Rewriting does not backdate approval; latest content in an old commit proves no earlier authorization.

Preserve absolute/Git plan paths, old/new hashes/versions, prior/revised approval refs/actual times, reason/classification, affected tasks and hold/preparation/resume evidence. Mechanical records state why no approval/time. Keep recoverable contents, not hashes only, and old→new mappings for original/descendant commits. Never overwrite old approvals/content.

Orchestrator alone rewrites under [preparation](handoff-prep.md#execution-time-plan-amendment)/[commit](commit.md#execution-time-plan-document-updates). Shared/published/unknown history, merges, unclear ownership, unexpected HEAD/dirty state/replay conflicts stop work. No force push/fallback docs commit. Reconnect evidence under [verification](verification.md#evidence-after-plan-history-rewrite). Add no Git automation/runtime enforcement/authority/check exemptions.

<a id="evidence-refresh-and-limits"></a>
## Evidence refresh and limits

Missing/mismatched evidence, unfinished approvals, unclear ownership or unresolved failures block affected save/choice request/Git mutation/handoff. Resolve/reverify before resume and on changed scope/version/path/target/Git state. Preserve unrelated changes; read-only investigation remains allowed.

Never retroactively call early saves/commits compliant or approved. Record actual order/gaps. Structure proves authored contracts only; absent role/approval/save/Git execution records leave runtime compliance unverified. Add no runtime infrastructure or external-skill changes for checks. Only the narrow cooperative exception below applies.

<a id="local-planning-references"></a>
## Local planning references

Brief absolute installed `references/brainstorming.md`/`references/writing-plans.md`. Planner reads directly, resolving relatives from installed `references/`. Missing paths stop the stage without global fallback. Preserve ARC approval/ownership.

<a id="instruction-and-input-provenance"></a>
## Instruction and input provenance

Supply exact skill/reference paths/access state. Separate user instructions/discovered files, approved versions/open questions. Visual criteria link approved source/version/access/IDs/method. Missing inputs/unapproved interpretation hold dependent drafting. Optional alternatives follow [handoff](handoff.md#instruction-sources-bounded-read-recovery-visual-evidence-and-resumption). Planner stays draft-only in recovery.


<a id="managed-worktree-preparation"></a>
### Managed worktree preparation

Follow [handoff-worktree](handoff-worktree.md).

[ARC role policy: contract begin]
Generated from lib/policy/role-policy.json; do not edit this managed section manually.
- [git.orchestrator-accept-commit] Only Orchestrator accepts work and performs Git mutations. One approved top-level plan task becomes one focused implementation commit after criteria, required checks and findings are satisfied. Orchestrator accepts, then commits without separate user commit approval. Reports, passing checks and Reviewer opinions do not replace acceptance. Preserve unrelated changes and ownership; verify the resulting SHA, content, HEAD and remaining changes. Existing small-task direct and plan-omission paths remain unchanged.
- [review.significant-no-plan] Significant/high-risk work without a plan follows Implementer → QA and required QA rechecks → Reviewer of the final full change → Orchestrator acceptance. Do not omit Reviewer because no plan exists. This adds no plan obligation.
- [review.significant-plan] Significant/high-risk plan work follows Implementer → required fresh QA → Orchestrator acceptance and focused commit for each task. After all tasks are accepted and required QA is complete, Reviewer reviews the final full change once. Reviewer is not a per-task or per-commit gate. Preserve required checks and necessary finding rechecks.
- [review.final-plan-recheck] Final overall Reviewer findings on plan work, including behavior findings, follow Implementer → Reviewer without QA reassignment until resolved. This exception applies only at the final plan stage. Preserve required QA and QA failure rechecks before the initial final review and outside this exception.
- [planning.plan-amend] Mechanical plan progress records during approved execution need no new user approval. Changes to goals, scope, criteria, method, risk, dependencies or required verification need revised-version approval and preparation before affected work. In both cases Orchestrator amends the original planning-document commit at a safe boundary, with no separate document or fixup commit. Preserve actual approval chronology, recoverable old/new content, hashes, versions and SHA mappings; never authorize past work retroactively. Rewrite only unpublished, unshared local linear history with clear ownership and no merges. Unknown publication/ownership, unexpected state or replay conflicts stop rewriting; no force push or fallback document commit. Preserve implementation task boundaries and revalidate affected evidence. Follow planning, handoff-prep, commit and verification for the full contract.
- [planning.planner-brief] Follow planning.md's Planner drafting preparation and review procedure, including preflight, ledger, evidence classification, target preparation, preceding approvals, provenance and reference gates. Send one complete stage-specific initial brief. Planner returns a complete proportional first draft and self-review. Orchestrator reviews and directly revises the same spec or plan when needed. A missing or failed first draft does not transfer initial authorship to Orchestrator. New product decisions outside approved scope require user input before Orchestrator revises the document. For design and brainstorming, allow the initial draft and one consolidated correction. Orchestrator reviews once with the fixed checklist and sends one consolidated correction using changed fields only. Further calls require user-approved material scope/evidence changes or concrete unmet checklist items after correction, plus meaningful new input or criterion-state progress. State changed input, target criterion, expected artifact and expected progress. Repeated unmet criteria without new input, evidence or progress hold the stage; report the criterion, observed evidence and exact unblock input/decision. Do not split omissions, repeat resolved items or count rewording/agent replacement as progress. Do not invoke Planner only for reformatting, re-expression, save errors or patch-application errors; Orchestrator handles these. Evaluate separate substantive work under the normal Planner gate. Preserve separate sequential design/spec/plan approvals. Add no fixed call cap or profile call-count conditions, and never accept an incomplete draft. Keep user progress brief and based on Planner status without relaying draft content. At approval, present the integrated, saved and reviewed Markdown without repeating its body in chat.
- [platform.codex] Role restrictions are prompt-level contracts, not a filesystem sandbox. ARC supplies no native observer hook or role-specific Git guard. Existing shell capabilities are retained because static read access after shell reduction has not been verified; Implementer and QA need shell for approved checks.
[ARC role policy: contract end]

<a id="approved-cooperative-execution-path-within-the-repository"></a>
## Approved cooperative execution path within the repository

Installed workflow connects plan-mode document commits to initial Implementer assignment. Resolve `<target-home>/skills/arc/runtime/cli.mjs` from the actual loaded skill selected by the installer, including custom homes. Pass path/options as separate `node` arguments. Shell uses safely assigned/quoted `node "$ARC_RUNTIME_ENTRY" <command> --cwd "$ARC_CHECKOUT" --workflow "$ARC_WORKFLOW_ID" --input -`. Follow [handoff](handoff.md) invocation/continuity.

Entry updates migrate no state/renew no approvals; drift requires current evidence. Scope is repository cooperative decisions/records, not native hook/provider/installer installation or blocking direct tools. `no-plan`/omission stays unsupported through Phases 2/3, implying neither policy violation nor new document duty.

Record approved spec/plan SHA-256, shared docs-only commit and document/approval versions. CLI verifies exact Git-object paths/current bytes before assignment intent. New workflows/late commits prove no past compliance. Prior history/outside execution stays unverified. Approval/native results are `operator-attested`; agent IDs are not authenticated identity.
