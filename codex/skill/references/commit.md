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
Immediately means the next action is the required Git state/scope checks, staging, and focused commit,
without an unexplained wait until the plan ends.
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
