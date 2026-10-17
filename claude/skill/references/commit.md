# Focused commits

Orchestrator reviews task evidence and accepts the approved task before committing.
Verify approved plan/task, absolute workspace, branch/HEAD, index/worktree/untracked state and ownership.
Stage exactly the accepted task paths; inspect staged scope and content to exclude unrelated changes.
After acceptance, Orchestrator creates the focused local commit without additional user commit approval.
Existing plan-skip paths have no new automatic commit obligation; their commits follow applicable guidance and user requests.
Commit one logical task promptly, using Conventional Commits with a concise English description.
Planning documents have their own batch docs commit before Coder handoff.

After commit, verify exact SHA, subject, included paths, branch/HEAD and remaining index/worktree state.
Preserve unrelated changes; never automatically unstage, amend, reset, clean, stash, or delete branches.
On failure stop dependent work and report actual state and completed steps. Do not blindly repeat a commit or staging
command. Push, publication and merge require user authorization. A role may commit only when Orchestrator explicitly
assigns that action; Orchestrator retains acceptance authority.

Hold the task commit for unmet or unresolved criteria, failed or not-run required checks, undispositioned findings or
evidence gaps, scope expansion, ownership or staged scope/content mismatch, unexpected workspace/branch/HEAD/Git state,
or Git failure/partial completion; record the reason and next action. Never waive unmet criteria or required checks to
commit. If commit creation is unclear, stop and inspect before any retry (see git-recovery).

For a no-change task make no empty commit; record acceptance evidence and no change.
On resume verify the same task's existing commit SHA, content, and validity and reuse it; never duplicate a successful
task commit. If final findings affect committed work, Orchestrator defines a follow-up task with required approvals,
correction and QA recheck, then a new focused commit; never amend/reset the existing commit.
Task acceptance is distinct from final plan acceptance; final checks still apply.

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
