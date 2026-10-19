# Commit contract

Orchestrator reads before accepting an approved top-level plan task and creating its focused commit, and before resuming
a task whose commit result is unclear.

## Automatic commit after plan-task acceptance

One approved top-level task is the unit of one focused implementation commit. Orchestrator verifies the task's
acceptance
criteria, currently required checks (Reviewer timing: SKILL.md Risk-scaled execution), and findings,
accepts the task by its own judgment, then immediately
creates its focused local Git commit without additional user commit approval.
After Orchestrator accepts a task, the next action is the required Git state/scope checks, staging, and focused commit.
Do not commit before task acceptance or defer the task commit until the plan ends.
Only Orchestrator accepts the task and executes its focused commit; Coder completion does not replace acceptance.
Substeps and checkboxes are progress records, not separate commit units. Checkbox completion, Coder reports, and
passing checks alone do not establish task acceptance: connect criteria's conditions and expected results to actual
evidence. Existing plan-skip paths have no new plan obligation; their commits follow applicable guidance and user
requests.

Before committing, Orchestrator verifies the approved plan version, task ID and accepted scope, actual absolute
workspace,
repository, branch or detached HEAD, HEAD, staged/unstaged/untracked state and edit ownership. Verify staged paths and
content match only that task, and verify the finalized commit message. If the same file contains other tasks or user
changes, prove safe separation before committing. Unrelated staged changes stop the commit under the Preservation
rule. After committing, verify SHA, actual message, included
paths and content, post-commit HEAD, actual branch and remaining staged/unstaged/untracked state. Command exit success
alone does not establish completion. In the accessible canonical record link plan path/version, task ID, acceptance
evidence and Orchestrator judgment, required checks and findings, commit results and state, hold/no-change/reuse
reasons,
and remaining final plan verification.

Hold the task commit for unmet or unresolved criteria, required checks that failed or were not run,
unresolved findings or evidence gaps without disposition, scope expansion or revised-plan needs, ownership or staged
scope/content mismatch, unexpected workspace, branch, HEAD or Git state, or Git failure/partial completion. Record the
reason and required next action. Do not waive unmet criteria or required checks to commit. Explicit disposition follows
existing policy and the Evidence verdict. After a Git failure inspect actual branch, HEAD, index,
working tree and partial completion before retrying; if commit creation is unclear, stop rather than retry immediately.
Orchestrator follows git-recovery and reverifies affected evidence after resolving the failure.

For a no-change task, make no empty commit; record acceptance evidence and no change. On resume, verify the same task's
existing commit SHA, content and validity, then reuse it; do not duplicate a successful task commit.
For a missing record,
inspect the actual result before any retry. Normal accepted task commits retain valid choice reuse under handoff, with
fresh state and ownership checks. Task acceptance/commit is distinct from final plan acceptance; remaining final
QA/Reviewer/integration checks still apply with the timing in verification.

For final Reviewer findings on already committed plan work, Orchestrator defines a follow-up task and required
planning/approvals. Coder leaves corrections uncommitted during rechecks. Orchestrator refreshes the latest committed
state plus uncommitted diff and changed-file list in the Reviewer artifact/brief. Reuse an independent Reviewer or
assign another independent Reviewer as needed. Repeat Coder → Reviewer without QA reassignment until findings are
resolved; Orchestrator then accepts the corrections and creates one focused follow-up commit.
Final QA findings retain Coder correction and QA recheck before a new focused commit.
Do not automatically amend/reset or duplicate the original task commit. Scope expansion keeps existing new
planning and approval obligations.

This local commit authority does not authorize early planning-document commits: pre-Coder document approvals,
explicit execution-target choice and batch preparation remain unchanged. Historical spec/plan records are not changed
retroactively. Structural checks of this contract do not prove actual agent runtime compliance.
Follow Conventional Commits with the message form
`<type>(<scope>): <description>`. Use a concise, specific English description without a trailing period, a lowercase
scope when useful, one top-level task's logical change per commit, and body/footer only when needed while preserving
Git trailer syntax.

## Shared-checkout coordination

Orchestrator serializes shared-checkout Git mutations, including index/staging and commits, across concurrent tasks;
parallel Coders do not operate competing Git transactions. Preserve every other task's unfinished staged, unstaged
and untracked changes and ownership. Commit only the accepted task after scope/content verification; unrelated staged
changes block the commit under the Preservation rule. Do not require unrelated unstaged work to finish or include it
in the accepted task's commit. Unclear separation or ownership holds affected work for resolution.

After each normal independent task commit, verify and record SHA/content/HEAD and remaining state, update the canonical
record and affected briefs, revalidate affected gates and reevaluate task readiness immediately. An authorized HEAD
change alone does not invalidate execution-target choice or require waiting for an unrelated batch. A predecessor
releases dependents only after required checks, Orchestrator acceptance and verified commit; accepted no-change evidence
replaces a commit for a no-change task, never an empty commit. Unexpected HEAD/ownership changes or Git failures stop
affected work until Orchestrator resolves and revalidates; existing recovery and approval rules remain in force.

Approval scope and continuity are defined in [planning](planning.md#authorization-and-scope); completion and evidence
limits are defined in [verification](verification.md#completion-continuity). This plan-task commit contract adds no
commit obligation to no-plan work and does not turn a local commit into overall completion.

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
