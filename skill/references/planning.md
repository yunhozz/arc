# Planning contract

Read before design/plan-depth decisions or spec/plan drafting and approval.

## Design and planning

`brainstorming` and `writing-plans` are instructions for existing roles, not extra agents. This Harness controls
routing/approval gates even if a called skill names another executor. Follow installed instructions and user
constraints; report missing required skills before that stage.

When the request or task brief is in Korean, Planner writes spec and plan titles and explanatory prose in Korean unless
the user explicitly requests another language. Preserve identifiers, skill/API names, code, paths, commands, and
literal values exactly. CEO preserves the agreed language when saving and integrating Planner output.

Assess design and plan depth separately from verification risk; risk determines the required checks and review, not the
design path or plan approval gates.

1. Before software feature, design, or behavior changes, CEO assigns Planner the installed `brainstorming` skill with
   the brief/evidence. Planner explores context and returns spike/bounded/architectural path, design/options,
   trade-offs, acceptance criteria, assumptions, and focused questions. CEO integrates, announces scope, routes user
   answers/revisions back, and obtains approvals; CEO never runs brainstorming itself.
2. Spike: approve the feasibility question/probe before execution, report findings, then obtain a new design/approval
   for implementation. Bounded: approve a short design before Coder. Architectural: approve design, then Planner returns
   complete spec draft and self-review findings; CEO integrates, saves, self-reviews, and obtains written-spec approval
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
   `Workspace handoff` gate below, with approved artifacts, brief, and relevant findings. Non-behavior
   configuration/documentation may skip inapplicable design/planning stages, but still requires the handoff gate.
   These stages preserve Secretary's standalone ownership.

### Complete planning-document set

The applicable document set means all specs and plans required for the current approved execution scope, not future
project work. CEO records scope, design/plan depth, absolute document paths and coverage, approved versions/status,
plan dependencies and execution order, skipped stages with rationale, and documents still awaiting writing or approval
in the shared brief. The set is complete only when every required document is written and individually approved and
no unresolved scope or dependency decision requires another document. Do not omit required documents from the list.

Normal order: design approval → required spec writing/saving/self-review and written-spec approval → required plans
writing/saving/self-review and individual approvals → complete applicable set → explicit execution-target choice and
any approved branch switch → existing-commit verification and one batch commit of remaining approved documents →
final Git verification → Coder handoff. Written-spec approval still precedes implementation planning.

While documents are being written, reviewed, or approved, do not request execution-checkout selection, create/switch
branches, stage documents, or commit planning documents for this task's execution preparation. Read-only workspace,
repository, and Git-state inspection is allowed. An incomplete set or any missing approval blocks preparation and
handoff; approval of some plans does not permit starting their Coder work ahead of the remaining applicable plans.

This Harness explicitly defers the installed `brainstorming` instruction to commit the spec before written-spec review:
save and self-review the spec, obtain written-spec approval without committing it, then write and obtain approval for
all applicable plans. Commit the spec only in the final batch preparation. Do not describe an uncommitted spec as
committed in approval requests. Do not modify external skills. `writing-plans` implementation-step commit instructions
are not permission for document commits during planning or for starting Coder.

| Path | Applicable approvals and preparation |
|------|--------------------------------------|
| Spike probe | Approve the feasibility question, probe method/scope, acceptance criteria, and constraints. Do not force specs/plans for still-unknown implementation. If Coder executes the probe, pass the common handoff gate after probe approval. Read-only CEO/Planner investigation without Coder does not trigger that gate. |
| Bounded, plan skipped | Approve the short design and record the existing plan-skip criteria/rationale. Complete applicable approvals, select the target, prepare any actual approved documents, or record valid document absence, then pass the common gate. |
| Bounded, plan required | Approve the short design and every required plan; write a spec only when the existing depth judgment requires it. Complete all applicable artifacts before one preparation batch and the common gate. |
| Architectural | Approve design, then written spec, then every required plan using `writing-plans`; complete the document set before target selection, batch preparation, final verification, and the common gate. |
| Non-behavior documentation/configuration | Record scope, acceptance criteria, and why design/planning stages are inapplicable; still select the target, verify Git state, prepare actual approved documents or record absence, and pass the common gate. |

Spike probe and subsequent implementation are separate approval scopes. Report probe findings, reassess implementation
design/plan depth, and approve its required spec and all plans before its preparation batch. Probe approval or code
does not approve later implementation. Document omission skips only document obligations, never explicit execution-target
choice, Git state/ownership checks, or handoff evidence. Record design/plan depth and verification risk independently;
bounded or document omission does not imply low risk, and architectural depth does not add QA/Reviewer at every stage.
Apply existing risk-scaled QA/Reviewer and specific approved obligations separately.

If planning reveals new scope, reassess the list, depth, and dependencies and obtain additional required approvals
before preparation. Changed approved documents require approval of the revised version. If implementation reveals new
scope, stop affected execution until that scope's documents, approvals, and preparation are complete. Do not amend old
commits to retroactively include it. An already-running Coder must stop before edits dependent on new plans; inspect
current changes/Git state and do not retroactively claim preparation. A restart without document changes reuses verified
valid commits and a still-valid initial execution-target choice under [handoff.md](handoff.md), with fresh actual-state checks.

