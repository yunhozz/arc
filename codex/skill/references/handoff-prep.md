# Handoff preparation contract

Orchestrator reads before an execution-target choice request and each preparation Git mutation (branch creation/switch,
staging, commit). The new managed worktree option's selection target is listed in the Execution-target request gate.
The Coder start gate, handoff evidence and choice lifetime are in [handoff.md](handoff.md).

## Workspace handoff

### Execution-target request gate

Before requesting the user's execution-target choice, Orchestrator verifies and records the complete document list, absolute
paths and scope coverage, approved versions and individual approval evidence, plan dependencies and execution order,
and no unfinished applicable documents or unresolved scope/dependency decisions requiring another document.
The set contains required artifacts, not a spec on every path; use planning depth and valid omission rationales.
Unfinished documents or missing approval evidence stop the choice request and preparation. Read-only state checks
are allowed. Do not require choice evidence before asking for that choice: the user's actual choice follows this gate
under the Explicit choice rule. Present the verified absolute workspace, current branch or detached HEAD, base HEAD, and any validated
new-branch candidate.
When offering the new managed worktree option, Orchestrator first verifies and then presents its selection target (source absolute
path, intended repository and Git common directory, source branch or detached HEAD, verified full source HEAD SHA,
approved branch candidate and collision status, descriptive name, approved document transfer/commit scope). Verification
validates the approved branch candidate and collision status under New task branch naming rules and checks source state
(unrelated staged changes; approved document HEAD/index/working-tree state) before offering. The app chooses the actual
destination path: do not ask the user for a destination path or propose one, and do not fetch or substitute a remote HEAD
or default branch for the base. Read [handoff-worktree.md](handoff-worktree.md) only after the user
explicitly selects that option and before its creation, branch work, or document transfer.

### Git mutation evidence gate

Before each preparation Git mutation—branch creation/switch, worktree creation, approved-document staging, or commit—read this
reference and recheck the complete approved document set and approval evidence; explicit execution-target choice
or verified valid reuse; absolute workspace and intended repository; current branch or detached HEAD and HEAD;
staged/unstaged/untracked changes, preservation and edit ownership; and the exact command, target paths, and
approved scope. Confirm no unresolved failure or partial completion. Record these facts in the canonical handoff
record/shared brief before the action. Missing or mismatched evidence stops that mutation until Orchestrator resolves it.
Read-only Git checks remain allowed. Do not infer execution authority from an external skill's early commit step.

Before committing, also verify staged paths/content and the finalized message under Planning document commit.
After every branch or commit operation, verify actual path, branch, HEAD, preserved changes, and result before the
next dependent action. After staging, verify the actual index paths and diff before commit. Apply the Preservation
rule; unrelated staged files stop the mutation.
Reverify affected evidence after changes or failures; do not retroactively approve an action taken before its gate.

### New task branch

With explicit user approval for the execution target, prepare the new task branch in the existing checkout.
Choose a valid Git branch name in the form `<type>/<short-kebab-case-topic>`. Use a lowercase prefix for the task's
main purpose and a short, specific lowercase kebab-case topic with no spaces. For mixed tasks, choose the main purpose.

| Prefix | Purpose |
|--------|---------|
| feat/ | Add a feature |
| fix/ | Fix a bug |
| refactor/ | Improve code structure while preserving behavior |
| docs/ | Change documentation |
| test/ | Add or change tests |
| build/ | Change build, packaging, or dependencies |
| ci/ | Change CI configuration |
| perf/ | Improve performance |
| style/ | Change formatting or style without behavior changes |
| chore/ | Change operational policy, tools, or maintenance |
| revert/ | Revert a prior change |

Validate the name and check for collisions before creation. If the base name exists, never automatically substitute a suffix; present a new candidate for explicit approval. Never reuse, delete, or overwrite an existing branch.
Distinguish a lookup error from a missing branch.
Recheck the workspace, current branch or detached HEAD, base HEAD, and candidate before execution. If the approval
target changes, present the new target and obtain explicit user approval. If the candidate changes because of a new
collision, obtain approval for that candidate before creating or switching; without that approval, block handoff.
Use the current checkout only after the user explicitly selects it for this handoff. A failure during creation remains
an operational failure subject to Stop and inspect (SKILL.md) and Recovery prerequisite below.

Create and switch to the approved new branch from the confirmed base HEAD in the current checkout, for example with
`git switch -c <branch>`. Detached HEAD is acceptable when HEAD is resolved and included in the approval target.
After success, confirm the actual current branch matches the approved candidate, HEAD matches the recorded base, the
checkout absolute path is unchanged, and existing changes are preserved. Do not create a worktree or fall back to
worktree provisioning on failure. Only explicit selection of New managed worktree and task branch permits worktree creation.

### Current checkout

Only after the user explicitly selects the current checkout for this handoff, or valid reuse is verified, confirm the absolute workspace,
current branch or detached HEAD, HEAD, and existing changes with their preservation and edit ownership. Record this
state and the choice evidence in the brief. Missing choice, unconfirmed state, or unclear ownership blocks handoff.

### Planning document commit

Begin only after the Execution-target request gate holds and the choice is made. On the new task branch path, verify the successful switch, actual branch, unchanged checkout path, and preserved
changes first. On the current checkout path, verify the selected branch or detached HEAD, path, and existing changes.
On the new worktree path, verify the created app-managed worktree, current-chat attachment, identity/base, approved
branch and document transfer before any target docs commit.
At the target, commit only remaining approved documents once; do not automatically make a source document commit.
Record the selected base SHA and post-commit HEAD.
Orchestrator verifies each approved spec/plan already committed for this task by SHA, actual message, included paths, and
content matching the approved version and validity in the selected checkout; reuse valid commits without recommitting them.

For approved documents still uncommitted, Orchestrator records the approved versions and paths, finalizes the specific Korean
Conventional Commit message before the first commit, and stages only those documents for one focused docs commit
before handoff. Batch all remaining uncommitted approved documents together in that single commit. If all are
validly committed, verify only; do not create duplicate or empty commits, or amend, reset, or recommit past commits
merely to combine them into one SHA. Verify both staged paths and staged diff match exactly the approved
documents; unrelated staged files stop the commit under the Preservation rule. Never include implementation files. Do not first commit a generic temporary message and routinely use `git commit --amend` to
repair it. A separately needed amend requires rechecking its approval scope, current HEAD, and publication state.

If the docs commit fails or staged content differs, stop handoff and apply the Stop and inspect rule to the actual
branch, HEAD, index, and partial completion. Resolve the issue before resuming; do not commit implementation instead. After success verify SHA, actual
message, included paths/content, post-commit HEAD, final branch, and staged/unstaged/untracked state in the brief.
A successful command exit alone does not prove preparation complete. This commit is not implementation acceptance
or push approval; do not push without a separate explicit user request.

Skip this commit only when no planning documents were required and none were produced under the design/plan depth
rules; record that fact and the applicable depth rationale. Uncommitted documents cannot be treated as absent.
This does not require new documents or bypass checkout choice or any other handoff-gate condition.

### Recovery prerequisite

On branch collisions, Git preparation failures, partial completion, or metadata write denial, read
[git-recovery.md](git-recovery.md) before dependent recovery. Its stop and preservation rules are mandatory.
