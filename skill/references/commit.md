# Commit contract

CEO reads before accepting an approved top-level plan task and creating its focused commit, and before resuming
a task whose commit result is unclear.

## Automatic commit after plan-task acceptance

One approved top-level task is the unit of one focused implementation commit. CEO verifies the task's acceptance
criteria, currently required checks/reviews, and findings, accepts the task by its own judgment, then immediately
creates its focused local Git commit without additional user commit approval. Immediately means the next action is
the required Git state/scope checks, staging, and commit, rather than an unexplained wait until the plan ends.
Substeps and checkboxes are progress records, not separate commit units. Checkbox completion, Coder reports, and
passing checks alone do not establish task acceptance: connect criteria's conditions and expected results to actual
evidence. Existing plan-skip paths have no new plan obligation; their commits follow applicable guidance and user requests.

Before committing, CEO verifies the approved plan version, task ID and accepted scope, actual absolute workspace,
repository, branch or detached HEAD, HEAD, staged/unstaged/untracked state and edit ownership. Verify staged paths and
content match only that task, and verify the finalized commit message. If the same file contains other tasks or user
changes, prove safe separation before committing. Preserve unrelated staged changes and stop; do not automatically
unstage them or use stash/reset/clean to clear user changes. After committing, verify SHA, actual message, included
paths and content, post-commit HEAD, actual branch and remaining staged/unstaged/untracked state. Command exit success
alone does not establish completion. In the accessible canonical record link plan path/version, task ID, acceptance
evidence and CEO judgment, required checks/reviews and findings, commit results and state, hold/no-change/reuse reasons,
and remaining final plan verification.

Hold the task commit for unmet or unresolved criteria, required checks/reviews that failed or were not run,
unresolved findings or evidence gaps without disposition, scope expansion or revised-plan needs, ownership or staged
scope/content mismatch, unexpected workspace, branch, HEAD or Git state, or Git failure/partial completion. Record the
reason and required next action. Do not waive unmet criteria or required checks to commit. Explicit disposition follows
existing policy and does not turn unverified into proven. After a Git failure inspect actual branch, HEAD, index,
working tree and partial completion before retrying; if commit creation is unclear, stop rather than retry immediately.
CEO follows git-recovery and reverifies affected evidence after resolving the failure.

For a no-change task, make no empty commit; record acceptance evidence and no change. On resume, verify the same task's
existing commit SHA, content and validity, then reuse it; do not duplicate a successful task commit. For a missing record,
inspect the actual result before any retry. Normal accepted task commits retain valid choice reuse under handoff, with
fresh state and ownership checks. Task acceptance/commit is distinct from final plan acceptance; remaining final
QA/Reviewer/integration checks still apply. Follow verification for their timing: later final verification alone does
not delay an independently acceptable task, but any review designated as its acceptance prerequisite must finish first.

If final QA/Reviewer findings require changing already committed work, CEO defines a follow-up task with required
planning and approvals, correction and reverification, then a new focused commit. Do not automatically amend/reset
the existing commit or rerun the original task to produce a duplicate commit.

This local commit authority does not authorize early planning-document commits: pre-Coder document approvals,
explicit execution-target choice and batch preparation remain unchanged. Historical spec/plan records are not changed
retroactively. Structural checks of this contract do not prove actual agent runtime compliance.
Follow Conventional Commits with the message form
`<type>(<scope>): <description>`. Use a concise, specific Korean description without a trailing period, a lowercase
scope when useful, one top-level task's logical change per commit, and body/footer only when needed while preserving
Git trailer syntax. Push, merge, publish, deploy, and install still follow their separate guidance and approval rules.
