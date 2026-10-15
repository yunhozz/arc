# Planning and approval

CEO classifies scope before implementation. The CEO direct path for small tasks is defined only in SKILL.md ("CEO direct path for small tasks"); follow it there and stop and reclassify if scope or risk changes. Everything else follows this reference. Brainstorming and writing-plans are instructions for existing roles, not extra agents; ARC routing and approval gates apply even if a skill names another executor. Report a missing required skill before its stage.

Significant risk includes shared role/behavior contracts, shared state, lifecycle/integration order, security/permissions, data loss/migration, public interfaces, or costly installation/deployment/rollback, and excludes work from the CEO direct path. Substantial behavior or contract changes are significant regardless of file count. Unclear risk requires investigation or the higher flow.

When the request or brief is in Korean, Planner writes spec and plan titles and prose in Korean unless the user asks otherwise, preserving identifiers, skill/API names, code, paths, commands, and literal values. CEO preserves that language when saving.

## Design path and plan depth

Record design and plan depth separately from verification risk. Risk determines checks and review, not the design path; a bounded path or document omission does not imply low risk, and architectural depth adds no QA/Reviewer at every stage.

1. Before feature, design, or behavior changes, CEO assigns Planner the installed `brainstorming` skill with the brief and evidence. Planner returns the path (Spike, Bounded, or Architectural), design/options, trade-offs, acceptance criteria, assumptions, and focused questions. CEO integrates, announces scope, routes answers/revisions, and obtains approvals; CEO never runs brainstorming itself except under the CEO direct path.
2. Spike: approve the feasibility question/probe first, report findings, then obtain a new design and approval for implementation. Bounded: approve a short design before Coder or a CEO direct edit. Architectural: approve the design, then Planner returns a complete spec draft and self-review; CEO integrates, saves, self-reviews, and obtains written-spec approval before implementation planning. Planner is read-only and cannot request approval.
3. After approved design/spec and before Coder, CEO assesses plan depth separately from file count, LOC, or bounded scope. Architectural work always uses `writing-plans` and a written plan approval, regardless of locality, risk, or size. For Bounded work skip the plan only for one local change with no dependent stages, cross-component shared state, lifecycle or integration-order concerns, and one focused verification path; otherwise require a draft. A "bounded" or "no plan" label does not bypass this judgment.
4. Record dependencies and any plan-depth rationale in the brief. Planner returns the complete proportional plan, assumptions/open decisions, verification requirements, and self-review. CEO integrates, saves to the user's path or `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`, self-reviews, and obtains plan approval before Coder. Planner cannot save, implement, or request approval.
5. Every Coder first start and restart requires all applicable approvals and the common handoff gate (SKILL.md, handoff). Non-behavior configuration/documentation may skip inapplicable design/planning stages but not the gate.

When the existing depth judgment requires a Bounded written spec, record that and its scope, use the approved short design as its basis, and have Planner return a proportional complete draft and self-review; CEO integrates, saves, self-reviews, and obtains individual written-spec approval before dependent plan drafting. This applies the existing judgment, not a new spec rule. A required plan alone does not require a spec.

CEO must not substitute its own spec for Planner's complete draft; return substantive omissions to Planner. A user may explicitly change writing responsibility; record that change and its evidence. Design approval alone does not.

## Top-level plan tasks

For each top-level task Planner specifies ID and title, goal/scope and target files, preceding tasks, acceptance criteria, required QA/focused checks and evidence before acceptance, and hold conditions. Each task must be independently implementable, verifiable, and acceptable; changes that cannot be verified independently (policy, profile, tests, manifest sharing one contract) belong in one task. Never merge approved tasks into one commit during execution; if inseparability appears, stop and have CEO revise scope and approvals.

Substeps and checkboxes are progress, not commit units: one approved top-level task is one focused commit after CEO acceptance. Never list Reviewer as a per-task check. State final plan QA/integration verification separately with scope and timing; for significant work it lists the single independent Reviewer of the final full change after all tasks are accepted. Task boundaries add no QA gates; keep risk requirements, risky-dependency QA, and approved obligations. No-change, hold, and resume follow commit.

## Document-save evidence gates

Before the first Architectural spec save, first required Bounded spec save, or first plan save, read this reference and record accessible evidence in the brief or handoff record. Saving creates a reviewable file and does not require written-spec approval or execution-target choice; it is not approval or a commit, and an uncommitted file is never described as committed.

**Spec save:** verify the approved design scope and approval evidence, Planner's complete spec draft and self-review, CEO's integration/save/review responsibility, and the absolute save path. For a Bounded spec also verify the depth judgment, approved short design, and necessity rationale. Saving or approving the short design does not replace the spec's drafting, self-review, or individual approval.

**Plan save:** verify the approved design and, when required, the approved spec version, CEO's plan-depth judgment, plan list and dependencies, Planner's complete draft and self-review, CEO's responsibility, and the absolute save path.

Missing or mismatched evidence stops the affected save; report to CEO.

## Complete planning-document set

The applicable set means all specs and plans required for the current approved execution scope. Record scope, depth, absolute paths and coverage, approved versions, dependencies and order, skipped stages with rationale, and documents awaiting writing or approval. The set is complete only when every required document is written and individually approved and no unresolved decision needs another document.

Normal order (current checkout only): design approval, required spec writing/saving/self-review and written-spec approval, required plans likewise, complete set, explicit execution-target choice (reuse the current branch or approved task branch), existing-commit verification and one batch commit of remaining approved documents, final Git verification, Coder handoff. Written-spec approval precedes implementation planning. While documents are written or approved, do not request target choice, create or switch branches, stage, or commit planning documents; read-only inspection is allowed. An incomplete set or missing approval blocks preparation; approving some plans does not start their Coder work early.

This ARC defers the installed brainstorming early spec commit: save and self-review the spec, obtain written-spec approval without committing, then write and approve all plans; commit the spec only in the final batch. `writing-plans` commit steps do not permit document commits during planning or start Coder. Do not modify external skills.

| Path | Approvals and preparation |
|---|---|
| Spike probe | Approve question, method/scope, criteria, constraints; no spec/plan forced. If Coder runs the probe, pass the common gate after approval. Read-only investigation needs no gate. |
| Bounded, plan skipped | Approve the short design and record plan-skip criteria; select target, prepare any documents or record absence, pass the gate. |
| Bounded, plan required | Approve short design and every required plan; a spec only when the depth judgment requires it, approved before dependent plans. One preparation batch, then the gate. |
| Architectural | Approve design, then spec, then every plan; complete the set before target selection, batch commit, final verification, and the gate. |
| Non-behavior documentation/configuration | Record scope, criteria, and why design/planning is inapplicable; still select the target, verify Git state, prepare documents or record absence, pass the gate. |

Spike probe and implementation are separate approval scopes: report findings, reassess depth, and approve required specs and plans before implementation preparation. These gates add no new spec obligation for Spike, Bounded plan-skip, or non-behavior paths. Document omission skips only document obligations, never target choice, Git/ownership checks, or handoff evidence. New scope found in planning requires reassessing the list and additional approvals before preparation; revised approved documents need renewed approval. New scope found during implementation stops dependent execution (a running Coder stops before edits dependent on new plans) until its documents, approvals, and preparation are complete; do not amend old commits to cover it.

## Evidence refresh and limits

Missing or mismatched evidence, unfinished approvals, unclear ownership, or unresolved failure blocks the affected save, target request, Git mutation, or Coder handoff; CEO resolves it and reverifies. Reverify when scope, approved versions, paths, target, or Git state changes. Never treat an early save or commit as satisfying a gate or as approval; record the actual order and gaps. Structural checks prove only the written policy, not agent runtime compliance; without execution records for role returns, approvals, saves, and Git actions, leave runtime compliance unverified. Administrative status updates must accurately describe actual progress. Return scope changes and unresolved decisions to the user through CEO. Define verifiable acceptance criteria, failure-first tests, scoped ownership, and QA/Reviewer follow-up before code work.
