<a id="planning-and-approval"></a>
# Planning and approval

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

Initial design/brainstorming MAY precede target choice. Before the first required spec/plan draft, record verified source workspace/repository, branch/HEAD, changes/ownership, explicit choice, approved scope/depth/document set and planned relative paths. Planner returns the complete first draft and self-review in chat before target preparation. Revalidate source and selected target at the focused preparation gate, prepare the chosen target, compare actual target and preservation, then review and save in the verified prepared target. Planned paths prove no preparation. Missing or mismatched evidence holds affected work; preparation alone never starts Implementer.

Small-task direct edits follow only [handoff](handoff.md#orchestrator-direct-path-for-small-tasks), stopping/reclassifying changed scope/risk. Otherwise follow this reference. `brainstorming`/`writing-plans` instruct existing roles, not extra agents; ARC routing/approval overrides alternate executors. Missing required skills block their stage. Integration includes saving, reviewing and directly revising the same spec or plan after the complete Planner first draft; design/brainstorming retain their Planner drafting path.

For Korean requests and briefs, Planner uses Korean titles and prose unless another language is requested, preserving identifiers, skill/API names, code, paths, commands and literals. Orchestrator preserves agreed language when saving.

<a id="planner-drafting-preparation-and-consolidated-feedback"></a>
## Planner drafting preparation and consolidated feedback

Planner reports initial/revision progress only to Orchestrator: brief stage/feedback/blocker/next step, never body/excerpts/incremental drafts. Return complete draft/self-review. Raw responses may appear in app/tool surfaces; prompt policy cannot hide them. User updates stay brief/status-based without draft content. At approval present integrated/saved/reviewed Markdown without repeating its body in chat.

Before Planner dispatch, evaluate F1–F8 direct-path eligibility and Bounded plan-omission eligibility independently. Enter each path only when all of that path's existing conditions are proven; if neither path qualifies, use normal full evaluation. Orchestrator can read a few already identified files directly; route material research and broad static exploration to Scouter.

1. Preflight relevant policy/references/profiles/tests/parity/manifest/conflicts. Apply formal-target and coordination provenance/input/local-skill gates, including required paths, approved bounded read alternatives and return conditions. Missing inputs/conflicts hold drafting. Read recovery grants no preparation/check/write/approval authority.
2. Maintain a compact ledger of original requirements/IDs, approved/open decisions, exclusions and scope deltas. Consolidate intervening user changes into one brief delta. Separate approvals, path/line-verified facts, assumptions and open decisions.
3. NEVER reuse a Planner instance across stages. Within the design/brainstorming stage, reuse one Planner instance for the initial draft, its consolidated correction and any eligible further call while role, context and source remain valid; within a spec or plan stage, reuse that stage's Planner only for a budget-hold delta. After design approval, the spec stage and the plan stage each use a fresh Planner; its initial brief contains every required field plus saved document paths and approved versions, and cites a prior brief only when that brief is an accessible file. Send one complete stage-specific initial brief. Include verified source/HEAD/ownership, selected target intent and planned paths (or prepared target for later stages), and scope/exclusions/depth/dependencies/shared contracts/criteria/checks/evidence/holds. Include preceding approved versions and paths, current behavior and connected source/generated/runtime/installer/docs, policy conflicts/resolution direction and exact deliverable. Visual work includes approved sources/versions/criteria/open interpretations. Follow-up briefs send changed fields and cite an accessible prior brief for unchanged fields; inaccessible conversations or hashes alone cannot replace required inputs. Reuse evidence only for the same source set, absolute locator, resolved path, content fingerprint, purpose, approval scope and accessible context. When source, target or scope changed, reconfirm affected inputs.
4. Planner returns the complete proportional first draft and self-review. Bounded plan density follows the Planner profile's ARC adaptation (per task ID/title, goal/scope/files, predecessors, criteria and required checks; short self-review checklist), while Architectural plans keep full writing-plans.md density. Briefs carry the Read/Grep exploration budget and MAY set a handback size limit. A return that stops at the exploration budget with a Scouter request is an input hold, not a missing or failed first draft; resend the stage brief as a delta with the Scouter evidence to the same stage Planner. In the design stage, a resend after a return without a draft uses the consolidated-correction opportunity. Orchestrator saves and reviews it against the fixed checklist: scope/evidence; targets/ownership/paths; policy/conflicts; task boundaries/dependencies/criteria; checks/evidence/holds; roles/approval/commit boundaries; completeness. For spec or plan, Orchestrator directly revises the same document, including substantive omissions, before requesting approval. New product decisions outside approved scope require user input first; Orchestrator then revises the document. Missing or failed first drafts stop the stage and do not transfer initial authorship.
5. For design and brainstorming, finish the checklist before one consolidated correction covering every substantive omission with criterion/defect/evidence/expected fix. Use deltas/`unchanged`; NEVER split by omission. Further calls after correction need approved material scope/evidence changes or concrete unmet checklist items plus meaningful new input/criterion progress. State changed input/target criterion/expected artifact/progress. Existing-scope omissions need no renewed scope approval. Repeated unmet criteria without new input/evidence/progress hold the stage; report criterion/observation/exact unblock decision. DO NOT repeat resolved questions or count rewording/agent replacement as progress.

For design and brainstorming, allow initial draft and one consolidated correction. Orchestrator handles reformatting, re-expression, save and patch errors without Planner calls. Separate substantive work uses normal gates. Design/spec/plan stages remain separately ordered; spec approval precedes dependent planning. Add no fixed call cap/profile count condition or incomplete-draft acceptance.

<a id="design-and-planning"></a>
<a id="design-path-and-plan-depth"></a>
## Design path and plan depth

Record depth separately from risk. Risk controls checks/review, not design paths/plan approval. Bounded/omission is not low risk; Architectural adds no QA/Reviewer at every stage. Apply risk rules and specific obligations.

1. Before feature/design/behavior work, assign brief/evidence/local `brainstorming` to Planner. Planner proposes context/path/options/tradeoffs/criteria/assumptions/questions; Orchestrator selects path, integrates, announces scope, routes revisions and obtains approval. NEVER run drafting skills itself. Direct path uses scope record only.
2. Spike distinguishes probe-only from specific combined scope. Bounded approves short design before Implementer; direct edits use approved scope record. Architectural approves design, then complete Planner spec/self-review, Orchestrator save/review and written-spec approval before planning. Planner is read-only and requests no approval.
3. Assess plan depth after design/spec approval and before Implementer, separately from files/LOC/Bounded label. Architectural always uses `writing-plans` and written-plan approval regardless of size/locality/risk. Bounded skips only for one local change, no dependent stages/cross-component shared state/lifecycle/integration-order concerns and one verification path. Otherwise require a plan. Labels/no-plan requests do not bypass judgment, which also records Bounded spec necessity.
4. Record dependencies/depth reasons; also post the design path, depth and risk judgments in the SKILL.md Pre-action gate record. Planner returns complete plan/assumptions/open decisions/checks/self-review. Orchestrator saves/reviews/obtains approval before Implementer at user path or `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`. Default spec path is `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`.
5. Every Implementer first start/restart needs applicable approvals/artifacts/brief/findings and full handoff. Non-behavior docs/config omit only inapplicable stages. Direct edits need approved scope record and same first-edit gates.

If Bounded requires written spec, record necessity/scope using approved short design as basis. Planner returns proportional full spec/self-review; After actual preparation, Orchestrator saves/reviews/obtains individual approval in the prepared target before the dependent plan. Short design approval never substitutes. This applies recorded judgment, not new spec necessity. Required plans alone imply no written spec.

Only Planner authors the first complete spec or plan draft and self-review. Orchestrator reviews and directly revises the same document before approval. Unavailable/failed Planner stops first drafting rather than transferring authorship. Design approval does not transfer initial authorship.

For initial fast judgment apply the [fast gate](handoff.md#orchestrator-direct-path-for-small-tasks); its sufficient conditions do not change these depth decisions.

<a id="top-level-plan-tasks"></a>
## Top-level plan tasks

Apply Planner rules: ID/title, goal/scope/files, predecessors/dependencies, criteria, required pre-acceptance QA/checks/evidence and holds. Tasks MUST be independently implementable/verifiable/acceptable. Inseparable policy/profile/tests/manifest contracts start in one task. If inseparability appears later, stop for revised scope/planning/approvals; NEVER merge distinct approved tasks during execution.

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

Saving for review does not require prior written-spec approval, but does require valid target choice/actual preparation. Individually approved specs enter the document set before dependent planning. NEVER call uncommitted files committed. Missing or mismatched evidence stops the affected save.

<a id="complete-planning-document-set"></a>
## Complete planning-document set

Include all current-scope required specs/plans, excluding future projects. Record scope/depth/absolute paths/coverage/versions/status/dependencies/order/omissions/reasons/pending drafting and approvals. Complete means every required document written/individually approved and no unresolved decision requiring another document. Omit no required artifact.

A required plan implies no spec. Bounded follows recorded judgment; spec stages cover Architectural/required Bounded only, plan stages required plans only. Add no spec duty to Spike/plan-skip/non-behavior paths.

Order: initial design approval → explicit target and source snapshot → first required draft/self-review → focused preparation gate → actual preparation/comparison → save/review/individual approval → dependent plans drafting/save/review/individual approval → full set → verify existing commits/batch remaining approvals → final Git → Implementer. Omission skips only inapplicable documents with rationale. Complete documents precede staging/commit/handoff, not initial preparation/choice request. Partial approvals authorize no early implementation.

Defer local `brainstorming`'s early spec commit: save/self-review/approve uncommitted spec, approve all plans, then final batch. Modify no external skill. `writing-plans` implementation commits grant neither planning-document commits nor early Implementer.

| Path | Approval/preparation |
|---|---|
| Spike | Approve question/method/scope/criteria/constraints; no forced unknown-implementation docs. Implementer probes require handoff; read-only Orchestrator/Planner probes without Implementer do not trigger it |
| Bounded, plan skipped | Approve short design; record omission conditions. Complete approvals, target choice, actual docs or valid absence, then handoff |
| Bounded, plan required | Approve design/all required plans; approve necessary specs before dependent planning. Draft the first required document before target preparation; complete set before batch/handoff |
| Architectural | Design → written spec → all `writing-plans` plans. First spec draft before target preparation; full set before batch/final checks/handoff |
| Non-behavior docs/config | Record scope/criteria/inapplicability. Preserve target/Git/docs-or-absence/handoff |

New planning scope requires list/depth/dependency reassessment and approvals before dependent drafting/commit. Approved-body changes need revised approval except task progress records below. New implementation scope holds execution until docs/approvals/preparation complete. Running Implementer stops before newly dependent edits; inspect actual changes/Git without retrospective preparation claims. Reflect approved versions through pending revisions below. Unchanged-document restarts follow handoff lifetime.

<a id="plan-updates-during-execution"></a>
## Plan updates during execution

Task progress records (checkboxes, notes, results, evidence and completion status) preserving the approved contract need no new approval; record classification/reason/actual time. Plan-level progress records (final verification results, final Reviewer round verdicts and finding dispositions with user-decision references, and overall completion status) follow [commit](commit.md#execution-time-plan-document-updates): they ride the plan's next task acceptance or final Reviewer follow-up commit, otherwise they stay only in the canonical record. After task completion Orchestrator includes that task's own records with its accepted implementation work in the same focused commit, excluding other tasks. DO NOT amend the original planning commit or create a separate docs/fixup commit for those records. Accepted no-change tasks follow the no-change path without empty commits. Removing checks, invented success, unsupported acceptance or mixed scope changes are not progress records.

Changes to goals, task boundaries, scope, criteria, method, risk, dependencies or checks require revised approval before affected work. Hold, obtain ordered design/spec/plan approvals and prepare target/ownership/checks/handoff. Other body corrections follow version approval; classify typos/paths/commands/explanations by semantic effect. Every non-progress content change, including a mechanical correction, is a plan revision requiring applicable approval/preparation. A contract revision requires a fresh Implementer for remaining work; obtain written-spec approval before a dependent plan revision.

After approval Orchestrator edits the same file, appends a revision-history row and leaves the revision uncommitted. Apply cumulative revisions to that file and append another row. At document end use `Version | Approval time | Classification | Affected tasks | Reason`; keep rows append-only, with no SHA. Add v1 at the first revision using the actual initial approval time. Preserve actual approval chronology, not retroactive authorization; later committed content proves no earlier approval.

Keep all approved spec/plan revisions pending for the accepted commit of the first top-level task executed or reconfirmed against the revised version. Otherwise include them in a current task acceptance or final Reviewer follow-up commit. Only when no implementation work remains before overall completion MAY Orchestrator make one standalone `docs(plan)` closing commit: record that evidence canonically, include all pending revisions/trailers and no implementation files. No separate docs/fixup commit is allowed outside this sole closing exception. Plan-level progress records alone never trigger it. Overall completion requires no pending revisions. Exclude revision hunks from independent tasks accepted on a prior version; hold that commit if safe separation is impossible.

NEVER amend planning or implementation commits, reset, replay or rewrite their history. Preserve canonical pending revisions, approved content copies, versions/hashes, approval references/actual times, classification/reason, affected tasks and hold/preparation/resume evidence under [preparation](handoff-prep.md#execution-time-plan-revision). NEVER overwrite old approvals/content. Follow [commit](commit.md#execution-time-plan-document-updates) and [verification](verification.md#evidence-after-plan-revision-commit). Add no Git automation/runtime enforcement/authority/check exemptions.

<a id="evidence-refresh-and-limits"></a>
## Evidence refresh and limits

Missing/mismatched evidence, unfinished approvals, unclear ownership or unresolved failures block affected save/choice request/Git mutation/handoff. Resolve/reverify before resume and on changed scope/version/path/target/Git state. Preserve unrelated changes; read-only investigation remains allowed.

NEVER retroactively call early saves/commits compliant or approved. Record actual order/gaps. Structure proves authored contracts only; absent role/approval/save/Git execution records leave runtime compliance unverified. Add no runtime infrastructure or external-skill changes for checks. Only the narrow cooperative exception below applies.

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
- [git.orchestrator-accept-commit] Only Orchestrator accepts work and performs Git mutations. One approved top-level plan task becomes one focused implementation commit after criteria, required checks and findings are satisfied. Orchestrator accepts, then includes that task's own progress records made after task completion (checkboxes, notes, results, evidence and status) with its implementation work in that commit, without a separate docs/fixup commit or planning-commit amendment for those records. Exclude other tasks; pending approved spec/plan revisions follow planning.plan-revision and preserve the no-change path without empty commits. Orchestrator commits without separate user commit approval. Reports, passing checks and Reviewer opinions do not replace acceptance. Preserve unrelated changes and ownership; verify the resulting SHA, content, HEAD and remaining changes. Existing small-task direct and plan-omission paths remain unchanged.
- [approval.run-mode] The installed ARC Run mode is Supervised unless the installed skill states Full Auto. In Full Auto, an Orchestrator decision recorded as `auto-decided (Full Auto)` with gate, choice, reason and evidence counts as the explicit choice or approval for that listed gate only; briefs cite it as `full-auto:<doc>@<version>` or the recorded decision. It never authorizes new product decisions outside the original request, external actions, resolution of failures, holds, unknown state or ownership conflicts, preservation-rule Git actions, permission or sandbox changes, or unknown slots and exhausted capacity, and it changes no plan-depth, commit, QA, Reviewer or acceptance rule. A user request to stop or use Supervised applies from the next gate.
- [review.significant-no-plan] Significant/high-risk work without a plan follows Implementer → QA and required QA rechecks → Reviewer of the final full change → Orchestrator acceptance. DO NOT omit Reviewer because no plan exists. This adds no plan obligation.
- [review.significant-plan] Significant/high-risk plan work follows Implementer → required fresh QA → Orchestrator acceptance and focused commit for each task. After all tasks are accepted and required QA is complete, Reviewer reviews the final full change once. Reviewer is not a per-task or per-commit gate. Preserve required checks and necessary finding rechecks.
- [review.final-plan-recheck] Complete required QA and QA failure rechecks before the initial final overall Reviewer review. Once that review begins on plan work, every final Reviewer finding, including behavior, follows Implementer → Reviewer without QA reassignment until resolved. Keep corrections uncommitted through Reviewer rechecks, then accept and create one focused follow-up commit. Separate QA findings follow Implementer → QA. Preserve required QA outside this final Reviewer exception.
- [planning.plan-revision] Task progress records (checkboxes, notes, results, evidence and status) preserving the approved contract need no new user approval; Orchestrator includes the completed task's own records in its accepted implementation commit and records classification, reason and actual time as applicable. All other spec/plan content changes, contract or mechanical, require applicable approval and preparation; changes to goals, scope, criteria, method, risk, dependencies or required verification need revised-version approval, preparation and holds on affected work before it continues, with a fresh Implementer for remaining work. After approval Orchestrator edits the same document, appends a revision-history row and leaves it uncommitted as an Orchestrator-owned pending revision, recording version, content hash, approval reference, actual time, classification, reason, affected tasks and the full approved content in the canonical handoff record. Orchestrator includes all pending revisions with Plan-Revision, Plan-Approved-At and Plan-Reason trailers in the accepted commit of the first top-level task executed or reconfirmed against the revised version, otherwise in a current task or final Reviewer follow-up commit; only when no implementation work remains before overall completion MAY it make one standalone docs(plan) closing commit without implementation files. Exclude revision hunks from commits of independent tasks accepted on a prior version, or hold that commit when separation is unsafe. NEVER amend or rewrite planning or implementation commits, create any other docs/fixup commit or authorize past work retroactively. After commit verify the committed document content matches the latest approved content apart from classified progress records of that commit's task or committed for other tasks after approval, and that no pending revision remains. Follow planning, handoff-prep, commit and verification for the full contract.
- [planning.planner-brief] Follow planning.md's Planner drafting preparation and review procedure, including preflight, ledger, evidence classification, target preparation, preceding approvals, provenance and reference gates. Before Planner dispatch, evaluate F1–F8 direct-path eligibility and Bounded plan-omission eligibility independently. Enter each path only when all of that path's existing conditions are proven; if neither path qualifies, use normal full evaluation. Send one complete stage-specific initial brief. Reuse the same Planner instance only within the design/brainstorming stage while its role, context and source remain valid; after design approval, use a fresh Planner instance for each spec and plan stage, whose initial brief contains every required field, saved document paths and approved versions. Follow-up briefs send changed fields and cite an accessible prior brief for unchanged fields. Reuse evidence only for the same source set, absolute locator, resolved path, content fingerprint, purpose and approval scope in an accessible matching context. When source, target or scope changed, reconfirm affected inputs. Planner returns a complete proportional first draft and self-review. Orchestrator reviews and directly revises the same spec or plan when needed. A missing or failed first draft does not transfer initial authorship to Orchestrator. New product decisions outside approved scope require user input before Orchestrator revises the document. For design and brainstorming, allow the initial draft and one consolidated correction. Orchestrator reviews once with the fixed checklist and sends one consolidated correction using changed fields only. Further calls require user-approved material scope/evidence changes or concrete unmet checklist items after correction, plus meaningful new input or criterion-state progress. State changed input, target criterion, expected artifact and expected progress. Repeated unmet criteria without new input, evidence or progress hold the stage; report the criterion, observed evidence and exact unblock input/decision. DO NOT split omissions, repeat resolved items or count rewording/agent replacement as progress. DO NOT invoke Planner only for reformatting, re-expression, save errors or patch-application errors; Orchestrator handles these. Evaluate separate substantive work under the normal Planner gate. Preserve separate sequential design/spec/plan approvals. Add no fixed call cap or profile call-count conditions, and NEVER accept an incomplete draft. Keep user progress brief and based on Planner status without relaying draft content. At approval, present the integrated, saved and reviewed Markdown without repeating its body in chat.
- [platform.gemini] Role restrictions are prompt-level contracts, not a filesystem sandbox. Native tool restriction fields, observer hooks and Git guards are unverified. Use only available authorized tools; ARC does not write Gemini settings.json.
[ARC role policy: contract end]

<a id="approved-cooperative-execution-path-within-the-repository"></a>
## Approved cooperative execution path within the repository

Installed workflow connects plan-mode document commits to initial Implementer assignment. Resolve `<target-home>/skills/arc/runtime/cli.mjs` from the actual loaded skill selected by the installer, including custom homes. Pass path/options as separate `node` arguments. Shell uses safely assigned/quoted `node "$ARC_RUNTIME_ENTRY" <command> --cwd "$ARC_CHECKOUT" --workflow "$ARC_WORKFLOW_ID" --input -`. Follow [handoff](handoff.md) invocation/continuity.

Entry updates migrate no state/renew no approvals; drift requires current evidence. Scope is repository cooperative decisions/records, not native hook/provider/installer installation or blocking direct tools. `no-plan`/omission stays unsupported through Phases 2/3, implying neither policy violation nor new document duty.

Record approved spec/plan SHA-256, shared docs-only commit and document/approval versions. CLI verifies exact Git-object paths/current bytes before assignment intent. New workflows/late commits prove no past compliance. Prior history/outside execution stays unverified. Approval/native results are `operator-attested`; agent IDs are not authenticated identity.

<a id="full-auto-run-mode"></a>
## Full Auto run mode

Applies only when the installed SKILL.md contains `**Run mode:** Full Auto.` and the user has not asked in this chat to stop auto-deciding or to use Supervised. Orchestrator first completes every review obligation of the gate, then selects the recommended option. Without a recommendation and supporting evidence, ask the user (fail-safe). Gates not listed as auto stay with the user. `user` and `unchanged` rows, and user conditions inside an `auto` row's Rule (`→ user`, `otherwise user`), take precedence over `auto` rows: an auto question row (`Planner options and questions`, `AskUserQuestion`) answers only questions that none of them covers; otherwise ask the user.

| Gate | Full Auto | Rule |
|---|---|---|
| Execution-target choice | auto | Clean work tree → new task branch in the current checkout; unrelated changes present → managed worktree; detached HEAD, unknown state or unclear ownership → user |
| Branch name collision | auto | Next numeric suffix (`-2`, `-3`, …) |
| Planner options and questions | auto | Recommended option; record assumptions in the brief |
| Design and short-design approval | auto | After Orchestrator review |
| Written spec approval | auto | After Orchestrator review |
| Plan approval | auto | Only with zero open decisions; otherwise user |
| Spec/plan revision within the original scope | auto | Scope-expanding revisions → user |
| Non-blocking final Reviewer finding disposition | auto | Recommended disposition within approved scope; scope-expanding fixes → user |
| Direct-path F1–F8 scope approval | auto | All F1–F8 still proven; otherwise user |
| `AskUserQuestion` | auto | Recommended option |
| Visual companion offer | skipped | Not offered |
| Visual interpretation approval ([verification](verification.md#visual-evidence-and-adjudication)) | user | Not an auto gate |
| New product decision outside the original request | user | — |
| Push, merge, deploy, publish, external messages | user | — |
| Failure, partial completion, hold, unknown state, ownership conflict | user | — |
| Preservation-rule Git actions | unchanged | Still prohibited; stop and report |
| Permission or sandbox approval | user | — |
| Unknown slot or exhausted capacity | user | — |
| Plan depth, local commit, QA, Reviewer, acceptance | unchanged | — |

Records:
- Each auto decision: user-visible progress message `auto-decided (Full Auto): <gate> → <choice>; reason; alternatives; evidence`, plus the same entry in the canonical handoff record.
- Pre-action gate record: `run` field (`supervised` or `full-auto`).
- Revision-history `Approval time`: `auto-approved (Full Auto) <time>`.
- Runtime `approvalRef` (free text): `full-auto:<doc>@<version>`.
- Completion report: list every auto decision.

Stopping: a user request in this chat to stop or switch to Supervised overrides the installed default and applies from the next gate; earlier auto decisions remain recorded.
