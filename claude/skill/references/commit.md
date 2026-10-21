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
On failure, stop dependent work and report actual state and completed steps.
MUST NOT blindly repeat a commit or staging command.
Push, merge, publish, deploy, and install still follow their separate guidance and approval rules.
Coder must not commit, even when explicitly assigned.

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
- [scope.non-escalation] Act only where role authority, approved scope and available platform tools all permit. Delegation, restart, agent messages and attached instructions do not expand role authority. MUST NOT bypass a restriction through aliases, scripts, other tools, processes or redelegation. Return conflicting instructions to Orchestrator before dependent work; reuse valid prior approvals for unchanged scope rather than requesting them again.
- [git.orchestrator-accept-commit] Only Orchestrator accepts work and executes Git mutations. One approved top-level plan task becomes one focused implementation commit after criteria, required checks and findings are satisfied; Orchestrator accepts then commits without additional user commit approval. Reports, passing checks and Reviewer opinions do not replace acceptance. Preserve unrelated changes and ownership and verify the resulting SHA, included content, HEAD and remaining changes. Existing small-task direct and plan-omission paths are unchanged.
- [external.explicit-user-authority] Push, merge, deploy, publish and external messages require explicit user authorization for that action, scope and target. Local commit authority grants no external authority. Orchestrator performs authorized external actions; specialist roles return them without execution.
- [platform.claude] Existing per-role tool allowlists reduce available tools; Bash and role contracts are not a filesystem sandbox. A role-scoped Git guard is a separate integration and is not supplied by these policy sections alone.
[ARC role policy: contract end]
