# Focused commits

Orchestrator reviews task evidence and accepts the approved task before committing.
Verify approved plan/task, absolute workspace, branch/HEAD, index/worktree/untracked state and ownership.
Stage exactly the accepted task paths; inspect staged scope and content to exclude unrelated changes.
After acceptance, Orchestrator creates the focused local commit without additional user commit approval.
After Orchestrator accepts a task, the next action is the required Git state/scope checks, staging, and focused commit.
Do not commit before task acceptance or defer the task commit until the plan ends.
Only Orchestrator accepts the task and executes its focused commit; Coder completion does not replace acceptance.
Existing plan-skip paths have no new automatic commit obligation; their commits follow applicable guidance and user requests.
Commit one logical task promptly, using Conventional Commits with a concise English description.
Task acceptance/commit is distinct from final plan acceptance; remaining final checks and Reviewer timing follow verification.
Planning documents have their own batch docs commit before Coder handoff.

After commit, verify exact SHA, subject, included paths, branch/HEAD and remaining index/worktree state.
Preserve unrelated changes; never automatically unstage, amend, reset, clean, stash, or delete branches.
On failure stop dependent work and report actual state and completed steps. Do not blindly repeat a commit or staging
command. Push, publication and merge require user authorization. Coder must not commit, even when explicitly assigned.

Hold the task commit for unmet or unresolved criteria, failed or not-run required checks, undispositioned findings or
evidence gaps, scope expansion, ownership or staged scope/content mismatch, unexpected workspace/branch/HEAD/Git state,
or Git failure/partial completion; record the reason and next action. Never waive unmet criteria or required checks to
commit. If commit creation is unclear, stop and inspect before any retry (see git-recovery).

For a no-change task make no empty commit; record acceptance evidence and no change.
On resume verify the same task's existing commit SHA, content, and validity and reuse it; never duplicate a successful
task commit. For final Reviewer findings on already committed plan work, Orchestrator defines a follow-up task and required
planning/approvals. Coder leaves corrections uncommitted during rechecks. Orchestrator refreshes the latest committed
state plus uncommitted diff and changed-file list in the Reviewer artifact/brief. Reuse an independent Reviewer or
assign another independent Reviewer as needed. Repeat Coder → Reviewer without QA reassignment until findings are
resolved; Orchestrator then accepts the corrections and creates one focused follow-up commit.
Final QA findings retain Coder correction and QA recheck before a new focused commit.
Do not automatically amend/reset or duplicate the original task commit. Scope expansion keeps existing new
planning and approval obligations.

Commit message form: `<type>(<scope>): <description>` (Conventional Commits) with a concise, specific English description
without trailing period, lowercase scope when useful, one top-level task per commit, body/footer only when needed.

In the accessible canonical record link plan path/version, task ID, acceptance evidence and Orchestrator judgment,
required checks and findings, commit results and state, hold/no-change/reuse reasons, and remaining final verification.

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
- [platform.claude] Existing per-role tool allowlists reduce available tools; Bash and role contracts are not a filesystem sandbox. A role-scoped Git guard is a separate integration and is not supplied by these policy sections alone.
[ARC role policy: contract end]
