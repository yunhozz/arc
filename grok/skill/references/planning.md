<a id="planning-and-approval"></a>
# Planning and approval

<a id="authorization-and-scope"></a>
## Authorization and scope

Shared text for this section: [planning-common.md#authorization-and-scope](planning-common.md#authorization-and-scope). It applies here exactly as if written in place.

<a id="probe-scope"></a>
### Probe scope

Shared text for this section: [planning-common.md#probe-scope](planning-common.md#probe-scope). It applies here exactly as if written in place.

<a id="formal-drafting-boundary"></a>
## Formal drafting boundary

Shared text for this section: [planning-common.md#formal-drafting-boundary](planning-common.md#formal-drafting-boundary). It applies here exactly as if written in place.

<a id="planner-drafting-preparation-and-consolidated-feedback"></a>
## Planner drafting preparation and consolidated feedback

Shared text for this section: [planning-common.md#planner-drafting-preparation-and-consolidated-feedback](planning-common.md#planner-drafting-preparation-and-consolidated-feedback). It applies here exactly as if written in place.

<a id="design-conversation"></a>
### Design conversation

These rules apply to feature/design/behavior design and brainstorming. Spike, the direct path (F1–F8) and non-behavior paths keep their existing rules and need no conversation. Planner never talks to the user directly: Planner → Orchestrator → user → Orchestrator → the same design Planner.

1. Response shape: each design Planner response is exactly one of: one question; 2–3 approaches with a recommendation and a selection question; one design section with a confirmation question; or the final design (Architectural: the start summary). Planner splits each response into a user message and Orchestrator notes; Orchestrator relays the user message unchanged.
2. When to ask: ask one question at a time, only when the answer changes the outcome and neither the sources nor the conversation already answer it. Otherwise state "my judgment" with its reason so the user can correct it.
3. Reason first: when the user's reason is unknown, first ask one open question without options; offer options only after hearing the reason.
4. Short path and opt-out: when the request is clear enough, the first response MAY carry a short design and ask for approval (Architectural: a short start summary and ask for start confirmation). When the user says to just proceed, stop asking, decide the remaining items as author judgments and list them in the final design or start summary.
5. Relay: Orchestrator relays each user answer verbatim to the same design Planner and marks any interpretation it adds separately.
6. No spinning: every call carries a new user answer or new evidence. DO NOT repeat a question without progress; without progress, report the blocked criterion, observed facts and the decision needed to unblock, and hold.
7. Reuse and correction: reuse the same design Planner while role, context and source remain valid. Conversation responses are expected returns, not missing or failed drafts, and use no correction opportunity. Orchestrator's fixed-checklist review and one consolidated correction apply to the final design. On the Architectural path the consolidated correction does not apply to the start summary; Orchestrator checks its decision inventory and scope notation before presenting it, and the spec draft takes Orchestrator's review and direct revision.
8. Full Auto: under [Full Auto](#full-auto-run-mode), Orchestrator records answers decidable within the original request as auto-decisions and sends only questions that need a new decision to the user; [approval.run-mode] limits apply unchanged.

<a id="architectural-start-confirmation"></a>
### Architectural start confirmation

Shared text for this section: [planning-common.md#architectural-start-confirmation](planning-common.md#architectural-start-confirmation). It applies here exactly as if written in place.

<a id="decision-inventory"></a>
### Decision inventory and question classification

1. Decision inventory: before returning the final design or Architectural start summary, Planner lists what spec and plan drafting MUST decide, such as changed files, data formats, table notation, tests and generated artifacts, and classifies each item as a user decision (asked in the conversation; the answer is recorded in the design, or for Architectural in the start summary and then the spec), an author judgment (a minor item that does not change the deliverable; record "my judgment" and the reason) or already answered (cite the existing source or conversation). Bounded short designs carry a proportional inventory of a few lines; the per-file scope notation stays mandatory.
2. Scope notation: designs, specs and plans mark every file or contract "change" or "no change (reason)". DO NOT use ambiguous scope wording such as "review only" or "if needed".
3. Final design: the final design and its design approval request attach the author-judgment list. On the Architectural path the start summary and its start-confirmation request attach it, and the spec records the user decisions and author judgments.
4. Spec and plan questions: spec and plan Planners classify each question raised while drafting. Answered by the design (Architectural: the confirmed start summary): follow it and cite the basis. Minor: decide it as an author judgment and record it in the document's author-judgment list with ID, judgment and reason; it is not an open decision. Genuinely new decision (changes the deliverable and is absent from the design or confirmed start summary): return it as an open decision with why the design review or start confirmation missed it; Orchestrator routes it to the user.
5. Approval attachments: the Architectural [combined approval](#architectural-combined-approval) request attaches the complete author-judgment lists of the spec and every plan, and the Bounded plan approval request attaches the author judgments made since design approval. The approval unit is unchanged.
6. Full Auto: author judgments are not open decisions when [Full Auto](#full-auto-run-mode) counts zero open decisions.

<a id="design-and-planning"></a>
<a id="design-path-and-plan-depth"></a>
## Design path and plan depth

Shared text for this section: [planning-common.md#design-path-and-plan-depth](planning-common.md#design-path-and-plan-depth). It applies here exactly as if written in place.

<a id="architectural-combined-approval"></a>
## Architectural combined approval

1. Sequential drafting (R0): Assign the fresh plan Planner only after the spec Planner returned the complete draft and self-review, Orchestrator saved it in the prepared target, reviewed it and made needed revisions, and the reviewed spec's path, version and SHA-256 are fixed and cited in the plan brief. NEVER draft a plan early or dispatch spec and plan Planners in parallel. Request no approval between the spec and plan stages.
2. Approval unit (R1): Before requesting approval, verify spec↔plan consistency: every spec requirement and acceptance criterion maps to plan tasks or final verification, and the plan cites the current spec version and SHA-256. Request one combined approval for the exact versions and SHA-256 of the spec and every in-scope plan, attaching the complete author-judgment lists of the spec and every plan ([decision inventory](#decision-inventory)); record it once and make every document's `approvalRef` cite it.
3. Partial answers (R2): A reply approving only part of the set, such as approving the spec while asking for plan changes, is a revision request. Orchestrator revises the documents directly, asking the user first for decisions outside approved scope; after any spec change it rechecks spec↔plan consistency; then it requests combined approval for the whole revised set. Partial approvals never carry over.
4. Invalidation (R3): Any content change to any document after the approval request voids that request; request combined approval again for the current set.
5. Spec ownership in the plan stage (R4): The plan Planner never edits the spec; it returns needed spec changes classified under [question classification](#decision-inventory). Within the confirmed start scope Orchestrator revises the spec directly; a genuinely new decision outside it needs user input, which Orchestrator records in the spec; it then rechecks spec↔plan consistency and the affected documents are redrafted.
6. Rework (R5): If spec rejection requires substantive plan rework, use a fresh plan Planner under the normal Planner gate; Orchestrator handles formatting, re-expression, save and patch errors.
7. Commit and Implementer (R6): Before combined approval, commit no planning document and start no Implementer. After it, make one planning-document commit under [handoff-prep](handoff-prep.md#planning-document-commit).

Shared text for this section: [planning-common.md#architectural-combined-approval](planning-common.md#architectural-combined-approval). It applies here exactly as if written in place.

<a id="top-level-plan-tasks"></a>
## Top-level plan tasks

Shared text for this section: [planning-common.md#top-level-plan-tasks](planning-common.md#top-level-plan-tasks). It applies here exactly as if written in place.

Substeps/checkboxes/RED-GREEN/commands are not commits. One top-level task becomes one focused commit after acceptance; [commit](commit.md) governs no-change/hold/resume. Reviewer is never a per-task check. Final whole verification has separate scope/timing; significant work lists one Reviewer after all task acceptances/risk checks and concluded final-mode Tester work. Task boundaries alone add no Tester. Apply only to required plans; omission paths gain no plan obligation. Plans list per-task related tests with reasons and a final verification section per [verification](verification.md#test-scope-and-result-comparison).

Shared text for this section: [planning-common.md#top-level-plan-tasks-2](planning-common.md#top-level-plan-tasks-2). It applies here exactly as if written in place.

<a id="dependency-and-readiness-record"></a>
## Dependency and readiness record

Shared text for this section: [planning-common.md#dependency-and-readiness-record](planning-common.md#dependency-and-readiness-record). It applies here exactly as if written in place.

<a id="document-save-evidence-gates"></a>
## Document-save evidence gates

Shared text for this section: [planning-common.md#document-save-evidence-gates](planning-common.md#document-save-evidence-gates). It applies here exactly as if written in place.

<a id="complete-planning-document-set"></a>
## Complete planning-document set

Shared text for this section: [planning-common.md#complete-planning-document-set](planning-common.md#complete-planning-document-set). It applies here exactly as if written in place.

<a id="plan-updates-during-execution"></a>
## Plan updates during execution

Shared text for this section: [planning-common.md#plan-updates-during-execution](planning-common.md#plan-updates-during-execution). It applies here exactly as if written in place.

<a id="evidence-refresh-and-limits"></a>
## Evidence refresh and limits

Shared text for this section: [planning-common.md#evidence-refresh-and-limits](planning-common.md#evidence-refresh-and-limits). It applies here exactly as if written in place.

NEVER retroactively call early saves/commits compliant or approved. Record actual order/gaps. Structure proves authored contracts only; absent role/approval/save/Git execution records leave runtime compliance unverified. Add no runtime infrastructure or external-skill changes for checks. Only the narrow cooperative exception below applies.

<a id="local-planning-references"></a>
## Local planning references

Shared text for this section: [planning-common.md#local-planning-references](planning-common.md#local-planning-references). It applies here exactly as if written in place.

<a id="instruction-and-input-provenance"></a>
## Instruction and input provenance

Shared text for this section: [planning-common.md#instruction-and-input-provenance](planning-common.md#instruction-and-input-provenance). It applies here exactly as if written in place.

<a id="managed-worktree-preparation"></a>
### Managed worktree preparation

Shared text for this section: [planning-common.md#managed-worktree-preparation](planning-common.md#managed-worktree-preparation). It applies here exactly as if written in place.

[ARC role policy: contract begin]
Generated from lib/policy/role-policy.json; do not edit this managed section manually.
- [git.orchestrator-accept-commit] Only Orchestrator accepts work and performs Git mutations. One approved top-level plan task becomes one focused implementation commit after criteria, required checks and findings are satisfied. Orchestrator accepts, then includes that task's own progress records made after task completion (checkboxes, notes, results, evidence and status) with its implementation work in that commit, without a separate docs/fixup commit or planning-commit amendment for those records. Exclude other tasks; pending approved spec/plan revisions follow planning.plan-revision and preserve the no-change path without empty commits. Plan-level progress records (final verification results, final Reviewer verdicts and finding dispositions, overall completion status) are the sole exception: include them in the plan's next task acceptance or final Reviewer follow-up commit; when no implementation work remains and no standalone closing commit for pending revisions is made, keep them only in the canonical handoff record without changing the plan document or creating a commit. Orchestrator commits without separate user commit approval. Reports, passing checks and Reviewer opinions do not replace acceptance. Preserve unrelated changes and ownership; verify the resulting SHA, content, HEAD and remaining changes. Existing small-task direct and plan-omission paths remain unchanged.
- [approval.run-mode] The installed ARC Run mode is Supervised unless the installed skill states Full Auto. In Full Auto, an Orchestrator decision recorded as `auto-decided (Full Auto)` with gate, choice, reason and evidence counts as the explicit choice or approval for that listed gate only; briefs cite it as `full-auto:<doc>@<version>` or the recorded decision. It never authorizes new product decisions outside the original request, external actions, resolution of failures, holds, unknown state or ownership conflicts, preservation-rule Git actions, permission or sandbox changes, or unknown slots and exhausted capacity, and it changes no plan-depth, commit, Tester, Reviewer or acceptance rule. A user request to stop or use Supervised applies from the next gate.
- [review.significant-no-plan] Significant/high-risk work without a plan follows Implementer → Tester and required Tester rechecks → Reviewer of the final full change → Orchestrator acceptance. DO NOT omit Reviewer because no plan exists. This adds no plan obligation.
- [review.significant-plan] Significant/high-risk plan work follows Implementer → required fresh Tester → Orchestrator acceptance and focused commit for each task. After all tasks are accepted and required Tester is complete, Reviewer reviews the final full change once. Reviewer is not a per-task or per-commit gate. Preserve required checks and necessary finding rechecks.
- [review.final-plan-recheck] Complete required Tester, Tester failure rechecks and final-mode Tester work before the initial final overall Reviewer review; final-mode Tester work concludes when its report is delivered, its new failures are resolved through Implementer → Tester recheck, its new-failure and intermittent candidates are dispositioned, any approved full regression is complete and every undeterminable-scope item is dispositioned. Once that review begins on plan work, every final Reviewer finding, including behavior, follows Implementer → Reviewer without Tester reassignment until resolved. Keep corrections uncommitted through Reviewer rechecks, then accept and create one focused follow-up commit. Tester findings and new failures from final verification follow Implementer → Tester before that review begins. Preserve required Tester outside this final Reviewer exception.
- [planning.plan-revision] Task progress records (checkboxes, notes, results, evidence and status) preserving the approved contract need no new user approval; Orchestrator includes the completed task's own records in its accepted implementation commit and records classification, reason and actual time as applicable. Plan-level progress records preserving the approved contract also need no new user approval and alone never trigger the standalone docs(plan) closing commit. All other spec/plan content changes, contract or mechanical, require applicable approval and preparation; changes to goals, scope, criteria, method, risk, dependencies or required verification need revised-version approval, preparation and holds on affected work before it continues, with a fresh Implementer for remaining work. After approval Orchestrator edits the same document, appends a revision-history row and leaves it uncommitted as an Orchestrator-owned pending revision, recording version, content hash, approval reference, actual time, classification, reason, affected tasks and the full approved content in the canonical handoff record. Orchestrator includes all pending revisions with Plan-Revision, Plan-Approved-At and Plan-Reason trailers in the accepted commit of the first top-level task executed or reconfirmed against the revised version, otherwise in a current task or final Reviewer follow-up commit; only when no implementation work remains before overall completion MAY it make one standalone docs(plan) closing commit without implementation files. Exclude revision hunks from commits of independent tasks accepted on a prior version, or hold that commit when separation is unsafe. NEVER amend or rewrite planning or implementation commits, create any other docs/fixup commit or authorize past work retroactively. After commit verify the committed document content matches the latest approved content apart from classified progress records of that commit's task or committed for other tasks after approval, or plan-level progress records carried by that commit, and that no pending revision remains. Follow planning, handoff-prep, commit and verification for the full contract.
- [planning.planner-brief] Follow planning.md's Planner drafting preparation and review procedure, including preflight, ledger, evidence classification, target preparation, preceding approvals, provenance and reference gates. Before Planner dispatch, evaluate F1–F8 direct-path eligibility and Bounded plan-omission eligibility independently. Enter each path only when all of that path's existing conditions are proven; if neither path qualifies, use normal full evaluation. Send one complete stage-specific initial brief. Reuse the same Planner instance only within the design/brainstorming stage while its role, context and source remain valid, except that on the Architectural path that Planner continues as the spec Planner after start confirmation through a spec-stage delta brief; use a fresh Planner instance for each plan stage, and for an Architectural spec stage when that Planner is unavailable or its role, context or source is no longer valid, whose initial brief contains every required field, saved document paths and approved versions (for the Architectural plan stage, the reviewed spec path, version and SHA-256). Follow-up briefs send changed fields and cite an accessible prior brief for unchanged fields. Reuse evidence only for the same source set, absolute locator, resolved path, content fingerprint, purpose and approval scope in an accessible matching context. Reconfirm affected inputs when source, target or scope changed. Planner returns a complete proportional first draft and self-review. Orchestrator reviews and directly revises the same spec or plan when needed. A missing or failed first draft does not transfer initial authorship to Orchestrator. New product decisions outside approved scope require user input before Orchestrator revises the document. For design and brainstorming, follow planning.md's design conversation: each Planner response is exactly one of one question, 2–3 approaches with a recommendation and a selection question, one design section with a confirmation question, or the final design (Architectural: the start summary). Ask one question at a time only when the answer changes the outcome and is not already answered; otherwise state the judgment and its reason. Ask an open question about the user's reason before offering options. For a clear request, Planner MAY return a short design for approval at once; when the user says to proceed, stop asking and list the remaining author judgments in the final design or start summary. Relay user answers verbatim and mark added interpretation separately. Every call needs a new user answer or new evidence; without progress, report the blocked criterion, observed facts and needed decision, and hold. Conversation responses use no correction opportunity. Orchestrator reviews the final design once with the fixed checklist, including decision-inventory completeness and no ambiguous scope wording, and sends one consolidated correction using changed fields only. On the Architectural path the start summary receives no consolidated correction; Orchestrator checks its decision inventory and scope notation before presenting it, and the spec draft takes Orchestrator's review and direct revision. Further calls require user-approved material scope/evidence changes or concrete unmet checklist items after correction, plus meaningful new input or criterion-state progress. State changed input, target criterion, expected artifact and expected progress. Repeated unmet criteria without new input, evidence or progress hold the stage; report the criterion, observed evidence and exact unblock input/decision. DO NOT split omissions, repeat resolved items or count rewording/agent replacement as progress. DO NOT invoke Planner only for reformatting, re-expression, save errors or patch-application errors; Orchestrator handles these. Evaluate separate substantive work under the normal Planner gate. For Bounded work, obtain design approval before plan drafting. For Architectural work, obtain one start confirmation (scope and explicit target; no design document or design approval) before spec drafting, let the design Planner continue as the spec Planner (a fresh spec Planner when it is unavailable or invalid), then draft the plan with a fresh Planner, assigning the plan Planner only after the spec is saved and reviewed and its path, version and SHA-256 are fixed; NEVER draft them concurrently; then obtain one combined spec+plan approval. Bounded work has no spec stage; required plans keep their own approval. Add no fixed call cap or profile call-count conditions, and NEVER accept an incomplete draft. Keep user progress brief and based on Planner status without relaying draft content. At approval, present the integrated, saved and reviewed Markdown without repeating its body in chat.
- [platform.grok] Role restrictions are prompt-level contracts, not a filesystem sandbox. Grok sandboxing, native tool restriction fields, observer hooks and Git guards are unverified, and Grok may continue without its sandbox. Use only available authorized tools; ARC disables Grok Claude compatibility (agents, skills, rules in config.toml; also MCPs and hooks for bridge children), but whether Grok sessions honor these settings is unverified.
[ARC role policy: contract end]

<a id="approved-cooperative-execution-path-within-the-repository"></a>
## Approved cooperative execution path within the repository

Shared text for this section: [planning-common.md#approved-cooperative-execution-path-within-the-repository](planning-common.md#approved-cooperative-execution-path-within-the-repository). It applies here exactly as if written in place.

<a id="full-auto-run-mode"></a>
## Full Auto run mode

Applies only when the installed SKILL.md contains `**Run mode:** Full Auto.` and the user has not asked in this chat to stop auto-deciding or to use Supervised. Orchestrator first completes every review obligation of the gate, then selects the recommended option. Without a recommendation and supporting evidence, ask the user (fail-safe). Gates not listed as auto stay with the user. `user` and `unchanged` rows, and user conditions inside an `auto` row's Rule (`→ user`, `otherwise user`), take precedence over `auto` rows: an auto question row (`Planner options and questions`, `AskUserQuestion`) answers only questions that none of them covers; otherwise ask the user.

| Gate | Full Auto | Rule |
|---|---|---|
| Execution-target choice | auto | Clean work tree → new task branch in the current checkout; unrelated changes present → managed worktree; detached HEAD, unknown state or unclear ownership → user |
| Branch name collision | auto | Next numeric suffix (`-2`, `-3`, …) |
| Planner options and questions | auto | Recommended option; record assumptions in the brief |
| Design and short-design approval | auto | After Orchestrator review |
| Architectural start confirmation | auto | Scope only within the original request, otherwise user; target follows the Execution-target choice row |
| Architectural spec+plan combined approval | auto | Only with zero open decisions; otherwise user |
| Plan approval | auto | Only with zero open decisions; otherwise user |
| Spec/plan revision within the original scope | auto | Scope-expanding revisions → user |
| Non-blocking final Reviewer finding disposition | auto | Fix or no-fix decision only: recommended disposition within approved scope; scope-expanding fixes → user; Reviewer recheck and acceptance stay unchanged |
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
| Plan depth, local commit, Tester, Reviewer, acceptance | unchanged | — |

Shared text for this section: [planning-common.md#full-auto-run-mode](planning-common.md#full-auto-run-mode). It applies here exactly as if written in place.
