# Planning and approval — shared text

This file holds text shared by every platform's planning.md. Each part belongs to the section that links to it and has the same force there.

<a id="authorization-and-scope"></a>
## Authorization and scope

Use the [fast gate and envelope](handoff.md#orchestrator-direct-path-for-small-tasks) alongside these existing scope and approval rules; reuse valid approvals and hold changed scope under these rules.

An explicit execution request authorizes only sufficiently specified scope from that request or a description the user explicitly references. Confirm intent/outcome/constraints/document depth/verification risk and no unresolved material behavior/method/risk decision. Record approval evidence, scope, criteria, constraints and depth. Orchestrator MAY choose routine execution/check details, not unapproved product behavior/material scope. Restating/handoff/restart of unchanged scope needs no new approval.

Silence, ambiguous assent, other-work approval and vague blanket improvements are insufficient. Planner's new material choices are not automatically approved. Request missing decisions through Orchestrator. Required specs/plans retain separate ordered approval.

Hold affected work for material changes to scope, method or risk, and report the missing decision, evidence and remaining scope. Target change, unclear ownership, unexpected state, unresolved failure or missing inputs also hold under [handoff](handoff.md)/[recovery](git-recovery.md). Distinguish new authorization from existing-scope execution issues; routine correction/reverification needs no duplicate approval. Revalidate after resolution.

<a id="probe-scope"></a>
### Probe scope

Probe-only work ends with approved-question findings/evidence/limits/uncertainty, including well-supported infeasibility. It authorizes neither product retention nor subsequent implementation. Record question/method/scope/criteria/constraints; a specific request may approve them. Match checks to purpose/risk, not product-proof claims.

If explicitly requested probe+implementation is fully specified, classify the whole scope. Under Bounded conditions, probing is internal with no new report-time approval boundary. Unknown implementation is not blanket authorization. Materially changed scope/method/risk or new decisions hold implementation for reassessment and required design/spec/plan approvals. Probe-only remains separate.

<a id="formal-drafting-boundary"></a>
## Formal drafting boundary

Initial design/brainstorming MAY precede target choice. On the Architectural path, [start confirmation](planning.md#architectural-start-confirmation) supplies the approved scope/depth/document set and the explicit choice that the next sentence requires. Before the first required spec/plan draft, record verified source workspace/repository, branch/HEAD, changes/ownership, explicit choice, approved scope/depth/document set and planned relative paths. Planner returns the complete first draft and self-review in chat before target preparation. Revalidate source and selected target at the focused preparation gate, prepare the chosen target, compare actual target and preservation, then review and save in the verified prepared target. Planned paths prove no preparation. Missing or mismatched evidence holds affected work; preparation alone never starts Implementer.

Small-task direct edits follow only [handoff](handoff.md#orchestrator-direct-path-for-small-tasks), stopping/reclassifying changed scope/risk. Otherwise follow this reference. `brainstorming`/`writing-plans` instruct existing roles, not extra agents; ARC routing/approval overrides alternate executors. Missing required skills block their stage. Integration includes saving, reviewing and directly revising the same spec or plan after the complete Planner first draft; design/brainstorming retain their Planner drafting path.

For Korean requests and briefs, Planner uses Korean titles and prose unless another language is requested, preserving identifiers, skill/API names, code, paths, commands and literals. Orchestrator preserves agreed language when saving.

<a id="planner-drafting-preparation-and-consolidated-feedback"></a>
## Planner drafting preparation and consolidated feedback

Planner reports initial/revision progress only to Orchestrator: brief stage/feedback/blocker/next step, never body/excerpts/incremental drafts. Return complete draft/self-review. Raw responses may appear in app/tool surfaces; prompt policy cannot hide them. User updates stay brief/status-based without draft content. At approval present integrated/saved/reviewed Markdown without repeating its body in chat.

Before Planner dispatch, evaluate F1–F8 direct-path eligibility and Bounded plan-omission eligibility independently. Enter each path only when all of that path's existing conditions are proven; if neither path qualifies, use normal full evaluation. Orchestrator can read a few already identified files directly; route material research and broad static exploration to Scouter.

1. Preflight relevant policy/references/profiles/tests/parity/manifest/conflicts. Apply formal-target and coordination provenance/input/local-skill gates, including required paths, approved bounded read alternatives and return conditions. Missing inputs/conflicts hold drafting. Read recovery grants no preparation/check/write/approval authority.
2. Maintain a compact ledger of original requirements/IDs, approved/open decisions, exclusions and scope deltas. Consolidate intervening user changes into one brief delta. Separate approvals, path/line-verified facts, assumptions and open decisions.
3. NEVER reuse a Planner instance across stages, except the Architectural continuation below. Within the design/brainstorming stage, reuse one Planner instance for every [design conversation](planning.md#design-conversation) response, the final design, its consolidated correction and any eligible further call while role, context and source remain valid; within a spec or plan stage, reuse that stage's Planner only for a budget-hold delta. On the Architectural path, the design Planner returns the start summary instead of a final design and, after [start confirmation](planning.md#architectural-start-confirmation), continues as the spec Planner through a spec-stage delta brief while role, context and source remain valid. Every plan stage, and an Architectural spec stage without that continuation, uses a fresh Planner; its initial brief contains every required field plus saved document paths and approved versions (for the Architectural plan stage, the reviewed spec path, version and SHA-256), and cites a prior brief only when that brief is an accessible file. Send one complete stage-specific initial brief. Include verified source/HEAD/ownership, selected target intent and planned paths (or prepared target for later stages), and scope/exclusions/depth/dependencies/shared contracts/criteria/checks/evidence/holds. Include preceding approved versions and paths, current behavior and connected source/generated/runtime/installer/docs, policy conflicts/resolution direction and exact deliverable. Visual work includes approved sources/versions/criteria/open interpretations. Follow-up briefs send changed fields and cite an accessible prior brief for unchanged fields; inaccessible conversations or hashes alone cannot replace required inputs. Reuse evidence only for the same source set, absolute locator, resolved path, content fingerprint, purpose, approval scope and accessible context. When source, target or scope changed, reconfirm affected inputs.
4. Planner returns the complete proportional first draft and self-review. Bounded plan density follows the Planner profile's ARC adaptation (per task ID/title, goal/scope/files, predecessors, criteria and required checks; short self-review checklist), while Architectural plans keep full writing-plans.md density. Briefs carry the Read/Grep exploration budget and MAY set a handback size limit. A return that stops at the exploration budget with a Scouter request is an input hold, not a missing or failed first draft; resend the stage brief as a delta with the Scouter evidence to the same stage Planner. In the design stage, [design conversation](planning.md#design-conversation) responses are expected returns and use no correction opportunity. Orchestrator saves and reviews it against the fixed checklist: scope/evidence; targets/ownership/paths; policy/conflicts; task boundaries/dependencies/criteria; checks/evidence/holds; roles/approval/commit boundaries; completeness; inventory/scope notation (final design, Architectural start summary and Architectural spec: complete [decision inventory](planning.md#decision-inventory); every document: every file or contract marked change or no change (reason), no ambiguous scope wording). For spec or plan, Orchestrator directly revises the same document, including substantive omissions, before requesting approval. New product decisions outside approved scope require user input first; Orchestrator then revises the document. Missing or failed first drafts stop the stage and do not transfer initial authorship.
5. For design and brainstorming, finish the checklist on the final design before one consolidated correction covering every substantive omission with criterion/defect/evidence/expected fix. Use deltas/`unchanged`; NEVER split by omission. Further calls after correction need approved material scope/evidence changes or concrete unmet checklist items plus meaningful new input/criterion progress. State changed input/target criterion/expected artifact/progress. Existing-scope omissions need no renewed scope approval. Repeated unmet criteria without new input/evidence/progress hold the stage; report criterion/observation/exact unblock decision. DO NOT repeat resolved questions or count rewording/agent replacement as progress.

For design and brainstorming, converse under [design conversation](planning.md#design-conversation) and allow one consolidated correction on the final design. On the Architectural path the conversation ends with the start summary instead of a final design; the summary receives no consolidated correction, and Orchestrator's review and direct revision apply to the spec draft. Orchestrator handles reformatting, re-expression, save and patch errors without Planner calls. Separate substantive work uses normal gates. Design, spec and plan stages remain separately ordered: Architectural plan drafting starts only after the spec is saved, reviewed and revised and its reviewed path, version and SHA-256 are fixed; NEVER draft spec and plan concurrently. Add no fixed call cap/profile count condition or incomplete-draft acceptance.

<a id="architectural-start-confirmation"></a>
### Architectural start confirmation

1. Scope: on the Architectural path there is no design document and no design approval. Bounded keeps its design approval; Spike, the direct path (F1–F8) and non-behavior paths are unchanged.
2. Start summary: when the [design conversation](planning.md#design-conversation) ends, the design Planner returns a short start summary instead of a final design: scope to change, user decisions, author judgments, already-answered items, open checks, path/depth/risk judgment, document set with planned relative paths, and every file or contract marked change or no change (reason). It carries the [decision inventory](planning.md#decision-inventory).
3. Confirmation: Orchestrator checks the summary's decision inventory and scope notation, presents it and, in one confirmation, obtains the user's scope confirmation and explicit target choice under [handoff](handoff.md). The summary is neither saved nor committed. The confirmed summary supplies the approved scope/depth/document set and explicit choice required by the [formal drafting boundary](planning.md#formal-drafting-boundary).
4. Continuation: Orchestrator sends the same Planner a spec-stage delta brief with verified source/branch/HEAD/ownership, the target choice, confirmed scope/depth, document set, planned paths and exploration budget; that Planner returns the complete first spec draft and self-review. If that Planner is unavailable or its role, context or source is no longer valid, assign a fresh spec Planner with a complete initial brief.
5. Records: the spec records the conversation's user decisions and author judgments; later author judgments join the same list. A genuinely new decision during spec or plan drafting goes to the user; Orchestrator records the answer in the spec, rechecks spec↔plan consistency and redrafts affected documents. No design approval is requested.
6. Full Auto: under [Full Auto](planning.md#full-auto-run-mode), scope confirmation within the original request MAY be auto-decided; target choice follows the Execution-target choice row; [approval.run-mode] limits apply unchanged.

<a id="design-path-and-plan-depth"></a>
## Design path and plan depth

Record depth separately from risk. Risk controls checks/review, not design paths/plan approval. Bounded/omission is not low risk; Architectural adds no Tester/Reviewer at every stage. Apply risk rules and specific obligations.

1. Before feature/design/behavior work, assign brief/evidence/local `brainstorming` to Planner. Planner proposes context/path/options/tradeoffs/criteria/assumptions/questions; Orchestrator selects path, integrates, announces scope, routes revisions and obtains approval. NEVER run drafting skills itself. Direct path uses scope record only.
2. Spike distinguishes probe-only from specific combined scope. Bounded approves short design before Implementer; direct edits use approved scope record. Architectural replaces design approval with one [start confirmation](planning.md#architectural-start-confirmation), then complete Planner spec/self-review and Orchestrator save/review/revision without a separate spec approval request; a fresh plan Planner then drafts from the reviewed spec, and the spec and every plan receive one [combined approval](planning.md#architectural-combined-approval). Planner is read-only and requests no approval.
3. Assess plan depth after design approval (Architectural: start confirmation) and before Implementer, separately from files/LOC/Bounded label. Architectural always uses `writing-plans` and the combined spec+plan approval regardless of size/locality/risk. Bounded skips only for one local change, no dependent stages/cross-component shared state/lifecycle/integration-order concerns and one verification path. Otherwise require a plan. Labels/no-plan requests do not bypass judgment.
4. Record dependencies/depth reasons; also post the design path, depth and risk judgments in the SKILL.md Pre-action gate record. Planner returns complete plan/assumptions/open decisions/checks/self-review. Orchestrator saves/reviews/obtains approval before Implementer at user path or `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`. Default spec path is `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`.
5. Every Implementer first start/restart needs applicable approvals/artifacts/brief/findings and full handoff. Non-behavior docs/config omit only inapplicable stages. Direct edits need approved scope record and same first-edit gates.

Bounded has no spec stage, spec approval or spec-necessity record. If Bounded work appears to need a spec-level document, DO NOT write one inside Bounded: reassess the design path as Architectural, inform the user and obtain the path-change approval required by existing rules before dependent drafting. Required plans alone imply no written spec.

Only Planner authors the first complete spec or plan draft and self-review. Orchestrator reviews and directly revises the same document before approval. Unavailable/failed Planner stops first drafting rather than transferring authorship. Design approval or start confirmation does not transfer initial authorship.

<a id="architectural-combined-approval"></a>
## Architectural combined approval

For initial fast judgment apply the [fast gate](handoff.md#orchestrator-direct-path-for-small-tasks); its sufficient conditions do not change these depth decisions.

<a id="top-level-plan-tasks"></a>
## Top-level plan tasks

Apply Planner rules: ID/title, goal/scope/files, predecessors/dependencies, criteria, required pre-acceptance Tester/checks/evidence and holds. Tasks MUST be independently implementable/verifiable/acceptable. Inseparable policy/profile/tests/manifest contracts start in one task. If inseparability appears later, stop for revised scope/planning/approvals; NEVER merge distinct approved tasks during execution.

<a id="top-level-plan-tasks-2"></a>
## Top-level plan tasks

Include the provisional trigger judgment with the substitute-check list and reasons in the plan's final verification section.

<a id="dependency-and-readiness-record"></a>
## Dependency and readiness record

After approval and before first assignment, canonically link every task ID to plan version. Record explicit/implicit predecessors, inputs/outputs/shared contracts, files/conflicting resources, check/Tester paths, ready/held/reasons, initial ready batch and capacity/serialization reasons. Analyze shared APIs/contracts/generated artifacts/resources even across files. Unsettled contracts/incomplete dependencies block affected tasks; same-file concurrent Implementers are forbidden even on different lines. File separation/list order proves no independence.

Ready requires approvals/preparation, settled inputs/contracts, predecessor checks/Orchestrator acceptance/verified commits or accepted no-change, nonconflicting ownership/resources, available checks/Tester and slots under both full-tree ARC and lower actual runtime limits. Read [limits](limits.md); report runtime constraints without claiming capability. Start ready independent tasks concurrently with fresh Implementers within capacity. Record holds/serialization rather than silently following order. Preserve risk/Tester/Reviewer/target gates.

Update on reports/checks/acceptance/commit/slot return/conflicts. Completion alone releases no dependent. Immediately reassess newly ready tasks without waiting for unrelated batches. Failed/uncertain predecessors hold only their chains. Refresh handoff each dispatch; shared Git follows commit rules. This map cannot rewrite approved boundaries or waive approval.

Example: with A → B → C, independent D and two slots, start A/D. After A's checks/acceptance/verified commit, B may start while D continues. A failure holds B/C, not unaffected D.

<a id="document-save-evidence-gates"></a>
## Document-save evidence gates

Before the first Architectural spec save or any plan save, read this and record accessible brief/canonical evidence. Saving creates reviewable files, not approval/commits.

| Save | Required evidence |
|---|---|
| Spec | Confirmed start scope/evidence ([start confirmation](planning.md#architectural-start-confirmation)), complete Planner draft/self-review, Orchestrator integration/save/review ownership and absolute path. Architectural only |
| Plan | Bounded: approved design; Architectural: confirmed start scope and the reviewed spec path/version/SHA-256 and review evidence; depth judgment, plan list/dependencies, complete Planner draft/self-review, ownership and absolute path |

Saving for review requires no prior document approval, but does require valid target choice/actual preparation. The reviewed Architectural spec enters the document set before dependent planning; approval follows once for the full set. NEVER call uncommitted files committed. Missing or mismatched evidence stops the affected save.

<a id="complete-planning-document-set"></a>
## Complete planning-document set

Include all current-scope required specs/plans, excluding future projects. Record scope/depth/absolute paths/coverage/versions/status/dependencies/order/omissions/reasons/pending drafting and approvals. Complete means every required document written and approved (Architectural: one combined spec+plan approval; Bounded: plan approval) and no unresolved decision requiring another document. Omit no required artifact.

A required plan implies no spec. Spec stages cover Architectural only; plan stages cover required plans only. Add no spec duty to Spike/plan-skip/non-behavior paths.

Order: initial design approval → explicit target and source snapshot → first required draft/self-review → focused preparation gate → actual preparation/comparison → save/review/revision → Architectural: dependent plan drafting/save/review/revision → spec↔plan consistency check → one combined approval; Bounded: plan approval → full set → verify existing commits/batch remaining approvals → final Git → Implementer. On the Architectural path, [start confirmation](planning.md#architectural-start-confirmation) takes the place of initial design approval in this order and carries the explicit target choice. Omission skips only inapplicable documents with rationale. Complete documents precede staging/commit/handoff, not initial preparation/choice request. Partial approvals authorize no early implementation.

Defer local `brainstorming`'s early spec commit: save/self-review/review the uncommitted spec, draft/save/review all plans, obtain the combined approval, then final batch. Modify no external skill. `writing-plans` implementation commits grant neither planning-document commits nor early Implementer.

| Path | Approval/preparation |
|---|---|
| Spike | Approve question/method/scope/criteria/constraints; no forced unknown-implementation docs. Implementer probes require handoff; read-only Orchestrator/Planner probes without Implementer do not trigger it |
| Bounded, plan skipped | Approve short design; record omission conditions. Complete approvals, target choice, actual docs or valid absence, then handoff |
| Bounded, plan required | Approve design and all required plans; no spec. Draft the first required plan before target preparation; complete set before batch/handoff |
| Architectural | Start confirmation → reviewed written spec → all `writing-plans` plans → one combined spec+plan approval. First spec draft before target preparation; full set before batch/final checks/handoff |
| Non-behavior docs/config | Record scope/criteria/inapplicability. Preserve target/Git/docs-or-absence/handoff |

New planning scope requires list/depth/dependency reassessment and approvals before dependent drafting/commit. Approved-body changes need revised approval except task progress records below. New implementation scope holds execution until docs/approvals/preparation complete. Running Implementer stops before newly dependent edits; inspect actual changes/Git without retrospective preparation claims. Reflect approved versions through pending revisions below. Unchanged-document restarts follow handoff lifetime.

<a id="plan-updates-during-execution"></a>
## Plan updates during execution

Task progress records (checkboxes, notes, results, evidence and completion status) preserving the approved contract need no new approval; record classification/reason/actual time. Plan-level progress records (final verification results, final Reviewer round verdicts and finding dispositions with user-decision references, and overall completion status) follow [commit](commit.md#execution-time-plan-document-updates): they ride the plan's next task acceptance or final Reviewer follow-up commit, or a standalone closing commit made for pending revisions; otherwise they stay only in the canonical record. After task completion Orchestrator includes that task's own records with its accepted implementation work in the same focused commit, excluding other tasks. DO NOT amend the original planning commit or create a separate docs/fixup commit for those records. Accepted no-change tasks follow the no-change path without empty commits. Removing checks, invented success, unsupported acceptance or mixed scope changes are not progress records.

Changes to goals, task boundaries, scope, criteria, method, risk, dependencies or checks require revised approval before affected work. Hold, obtain the applicable design approval (Bounded; Architectural records the new decision in the revised spec) and document approvals below and prepare target/ownership/checks/handoff. Other body corrections follow version approval; classify typos/paths/commands/explanations by semantic effect. Every non-progress content change, including a mechanical correction, is a plan revision requiring applicable approval/preparation. A contract revision requires a fresh Implementer for remaining work.

Execution-time document revisions take this approval: a spec change with affected plans needs one combined revision approval for the spec and those plans; a plan-only change needs plan approval; a spec-only change needs spec approval after Orchestrator records why no plan is affected. Partial approvals never carry over.

After approval Orchestrator edits the same file, appends a revision-history row and leaves the revision uncommitted. Apply cumulative revisions to that file and append another row. At document end use `Version | Approval time | Classification | Affected tasks | Reason`; keep rows append-only, with no SHA. Add v1 at the first revision using the actual initial approval time. Preserve actual approval chronology, not retroactive authorization; later committed content proves no earlier approval.

Keep all approved spec/plan revisions pending for the accepted commit of the first top-level task executed or reconfirmed against the revised version. Otherwise include them in a current task acceptance or final Reviewer follow-up commit. Only when no implementation work remains before overall completion MAY Orchestrator make one standalone `docs(plan)` closing commit: record that evidence canonically, include all pending revisions/trailers and no implementation files. No separate docs/fixup commit is allowed outside this sole closing exception. Plan-level progress records alone never trigger it. Overall completion requires no pending revisions. Exclude revision hunks from independent tasks accepted on a prior version; hold that commit if safe separation is impossible.

NEVER amend planning or implementation commits, reset, replay or rewrite their history. Preserve canonical pending revisions, approved content copies, versions/hashes, approval references/actual times, classification/reason, affected tasks and hold/preparation/resume evidence under [preparation](handoff-prep.md#execution-time-plan-revision). NEVER overwrite old approvals/content. Follow [commit](commit.md#execution-time-plan-document-updates) and [verification](verification.md#evidence-after-plan-revision-commit). Add no Git automation/runtime enforcement/authority/check exemptions.

<a id="evidence-refresh-and-limits"></a>
## Evidence refresh and limits

Missing/mismatched evidence, unfinished approvals, unclear ownership or unresolved failures block affected save/choice request/Git mutation/handoff. Resolve/reverify before resume and on changed scope/version/path/target/Git state. Preserve unrelated changes; read-only investigation remains allowed.

<a id="local-planning-references"></a>
## Local planning references

Brief absolute installed `references/brainstorming.md`/`references/writing-plans.md`. Planner reads directly, resolving relatives from installed `references/`. Missing paths stop the stage without global fallback. Preserve ARC approval/ownership.

<a id="instruction-and-input-provenance"></a>
## Instruction and input provenance

Supply exact skill/reference paths/access state. Separate user instructions/discovered files, approved versions/open questions. Visual criteria link approved source/version/access/IDs/method. Missing inputs/unapproved interpretation hold dependent drafting. Optional alternatives follow [handoff](handoff.md#instruction-sources-bounded-read-recovery-visual-evidence-and-resumption). Planner stays draft-only in recovery.

<a id="managed-worktree-preparation"></a>
### Managed worktree preparation

Follow [handoff-worktree](handoff-worktree.md).

<a id="approved-cooperative-execution-path-within-the-repository"></a>
## Approved cooperative execution path within the repository

Installed workflow connects plan-mode document commits to initial Implementer assignment. Resolve `<target-home>/skills/arc/runtime/cli.mjs` from the actual loaded skill selected by the installer, including custom homes. Pass path/options as separate `node` arguments. Shell uses safely assigned/quoted `node "$ARC_RUNTIME_ENTRY" <command> --cwd "$ARC_CHECKOUT" --workflow "$ARC_WORKFLOW_ID" --input -`. Follow [handoff](handoff.md) invocation/continuity.

Entry updates migrate no state/renew no approvals; drift requires current evidence. Scope is repository cooperative decisions/records, not native hook/provider/installer installation or blocking direct tools. `no-plan`/omission stays unsupported through Phases 2/3, implying neither policy violation nor new document duty.

Record approved planning-document SHA-256 (Architectural spec and plans; Bounded plans), shared docs-only commit and document/approval versions. CLI verifies exact Git-object paths/current bytes before assignment intent. New workflows/late commits prove no past compliance. Prior history/outside execution stays unverified. Approval/native results are `operator-attested`; agent IDs are not authenticated identity.

<a id="full-auto-run-mode"></a>
## Full Auto run mode

Records:
- Each auto decision: user-visible progress message `auto-decided (Full Auto): <gate> → <choice>; reason; alternatives; evidence`, plus the same entry in the canonical handoff record.
- Pre-action gate record: `run` field (`supervised` or `full-auto`).
- Revision-history `Approval time`: `auto-approved (Full Auto) <time>`.
- Runtime `approvalRef` (free text): `full-auto:<doc>@<version>`.
- Completion report: list every auto decision.

Stopping: a user request in this chat to stop or switch to Supervised overrides the installed default and applies from the next gate; earlier auto decisions remain recorded.
