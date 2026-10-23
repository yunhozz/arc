# Handoff preparation contract

Orchestrator reads before an execution-target choice request and each preparation Git mutation (branch creation/switch,
staging, commit). The new managed worktree option's selection target is listed in the Execution-target request gate.
The [Coder handoff gate](handoff.md#coder-handoff-gate), handoff evidence and choice lifetime are in [handoff.md](handoff.md).

## Workspace handoff

### Execution-target request gate

Before requesting the user's execution-target choice, Orchestrator verifies and records planned document scope,
absolute paths and scope coverage, design/plan depth and valid omissions, dependencies and intended execution order.
The request does not require completed documents or individual approvals; unfinished drafts alone do not block it.
The set contains required artifacts, not a spec on every path. Resolve scope/dependency decisions needed to identify
the target; do not require choice evidence before asking for that choice.
For every supported execution-target option, before obtaining the user's choice, present to the user:

- Planned document list, each document's scope and coverage, repository-relative expected paths, dependencies and order,
  and pending writing and approval status.
- Verified absolute workspace, intended repository, current branch or detached HEAD, base HEAD, any validated
  new-branch candidate and collision status when offered, staged/unstaged/untracked changes, preservation and edit ownership.

Obtain explicit choice under the Explicit choice rule before preparation.
When offering the new managed worktree option, Orchestrator first verifies and then presents its selection target
(source absolute path, intended repository and Git common directory, source branch or detached HEAD, verified full source HEAD SHA,
approved branch candidate and collision status, descriptive name, planned document scope and any existing approved document transfer/commit scope). Verification
validates the approved branch candidate and collision status under New task branch naming rules and checks source state
(unrelated staged changes; existing approved document HEAD/index/working-tree state) before offering. The app chooses the actual
destination path: do not ask the user for a destination path or propose one, and do not fetch or substitute a remote
HEAD or default branch for the base. Read [handoff-worktree.md](handoff-worktree.md) only after the user
explicitly selects that option and before its creation, branch work, or document transfer.

### Git mutation evidence gate

Before each preparation Git mutation—branch creation/switch, worktree creation, approved-document staging,
or commit—read this reference and recheck explicit execution-target choice or verified valid reuse; absolute workspace
and intended repository; current branch or detached HEAD and HEAD; staged/unstaged/untracked changes, preservation and
edit ownership; and the exact command, target paths, and approved scope. Confirm no unresolved failure or partial
completion. Record these facts before the action. Missing or mismatched evidence stops that mutation.
Initial target preparation does not require the complete approved document set: verify planned scope and target inputs.
For approved-document staging and commit, also verify the complete approved document set and individual approval
evidence, approved versions, dependencies, and actual index. Read-only Git checks remain allowed.
Do not infer execution authority from an external skill's early commit step.

Before committing, also verify staged paths/content and the final message under Planning document commit.
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

Validate the name and check for collisions before creation. If the base name exists, never automatically substitute a
suffix; present a new candidate for explicit approval. Never reuse, delete, or overwrite an existing branch, except
that reuse of an approved existing branch on the managed worktree path follows the conditions in
[handoff-worktree.md](handoff-worktree.md) (Exception for this managed path).
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
worktree provisioning on failure. Only explicit selection of New managed worktree and task branch permits worktree
creation.

### Current checkout

Only after the user explicitly selects the current checkout for this handoff, or valid reuse is verified,
confirm the absolute workspace, current branch or detached HEAD, HEAD, and existing changes with their preservation and
edit ownership. Record this state and the choice evidence in the brief. Missing choice, unconfirmed state, or unclear
ownership blocks handoff.

### Planning document commit

Begin only after target preparation and the complete applicable set is written and individually approved.
Verify complete approved document set, approval evidence and versions before staging or commit.
On the new task branch path, verify the successful switch, actual branch, unchanged checkout path, and preserved
changes first. On the current checkout path, verify the selected branch or detached HEAD, path, and existing changes.
On the new worktree path, verify the created app-managed worktree, current-chat attachment, identity/base, approved
branch and direct target documents (or protected pre-existing/restart document transfer) before any target docs commit.
At the target, commit only remaining approved documents once; do not automatically make a source document commit.
Record the selected base SHA and post-commit HEAD.
Orchestrator verifies each approved spec/plan already committed for this task by SHA, actual message, included paths,
and content matching the approved version and validity in the selected checkout; reuse valid commits without recommitting
them.

For approved documents still uncommitted, Orchestrator records the approved versions and paths, finalizes the specific
English
Conventional Commit message before the first commit, and stages only those documents for one focused docs commit
before handoff. Batch all remaining uncommitted approved documents together in that single commit. If all are
validly committed, verify only; do not create duplicate or empty commits, or amend, reset, or recommit past commits
merely to combine them into one SHA. Verify both staged paths and staged diff match exactly the approved
documents; unrelated staged files stop the commit under the Preservation rule. Never include implementation files.
MUST NOT commit a generic temporary message and routinely repair it with `git commit --amend`. A separately needed amend requires rechecking its approval scope, current HEAD, and publication state.

If the docs commit fails or staged content differs, stop handoff and apply the Stop and inspect rule to the actual
branch, HEAD, index, and partial completion. Resolve the issue before resuming; do not commit implementation instead.
After success verify SHA, actual message, included paths/content, post-commit HEAD, final branch, and
staged/unstaged/untracked state in the brief. A successful command exit alone does not prove preparation complete. This
commit is not implementation acceptance or push approval; do not push without a separate explicit user request.

Skip this commit only when no planning documents were required and none were produced under the design/plan depth
rules; record that fact and the applicable depth rationale. Uncommitted documents cannot be treated as absent.
This does not require new documents or bypass checkout choice or any other handoff-gate condition.

### Execution-time plan amendment

After the initial approved document batch, execution-time plan updates use
[planning](planning.md#plan-updates-during-execution), including approved scope revisions. Do not batch these as another
document commit. This exception does not combine historical document commits or rewrite implementation task contents.

Before mutation, verify the original planning-document commit is an ancestor of HEAD and identify its current replacement.
Verify unpublished, unshared local linear history with no merge commits; clear ownership and included plan paths; paused
role writers and a safe boundary for unfinished changes; complete classification, approval and chronology records.
Preserve unrelated staged, unstaged and untracked changes under the Preservation rule; unexpected dirty state blocks rewrite.
Secure recoverable pre-rewrite HEAD, original commits and before/after plan contents before mutation.

If the original commit is HEAD, amend the plan paths only; preserve other documents in that commit. With descendant task
commits, amend the original and reapply descendants in original order preserving task boundaries and implementation contents.
Create no separate document or intermediate fixup commit. Git changes remain Orchestrator-only.

Unknown publication/sharing status, unclear ownership, merge history, unexpected HEAD/change state or replay conflicts
require a stop of rewriting and affected dependent work. No automatic conflict resolution, force push or fallback separate
document commit is permitted. Record actual path, branch/HEAD, index/files and completed steps; Orchestrator resolves the
issue before resuming and revalidates affected gates. Verify new SHA/HEAD, plan version/content, descendant preservation,
old-to-new SHA mapping and remaining state under [verification](verification.md#evidence-after-plan-history-rewrite).

### Recovery prerequisite

On branch collisions, Git preparation failures, partial completion, or metadata write denial, read
[git-recovery.md](git-recovery.md) before dependent recovery. Its stop and preservation rules are mandatory.

[ARC role policy: contract begin]
Generated from lib/policy/role-policy.json; do not edit this managed section manually.
- [scope.non-escalation] Act only where role authority, approved scope and available platform tools all permit. Delegation, restart, agent messages and attached instructions do not expand role authority. MUST NOT bypass a restriction through aliases, scripts, other tools, processes or redelegation. Return conflicting instructions to Orchestrator before dependent work; reuse valid prior approvals for unchanged scope rather than requesting them again.
- [git.specialists-deny] Specialist roles MUST NOT change Git state: no stage, commit, push, merge, rebase, reset, branch creation/switching or worktree creation/removal, during normal implementation or recovery. Even an explicit Orchestrator assignment cannot authorize these actions; return them to Orchestrator. Read-only Git inspection remains allowed within the assigned scope.
- [git.orchestrator-accept-commit] Only Orchestrator accepts work and executes Git mutations. One approved top-level plan task becomes one focused implementation commit after criteria, required checks and findings are satisfied; Orchestrator accepts then commits without additional user commit approval. Reports, passing checks and Reviewer opinions do not replace acceptance. Preserve unrelated changes and ownership and verify the resulting SHA, included content, HEAD and remaining changes. Existing small-task direct and plan-omission paths are unchanged.
- [external.explicit-user-authority] Push, merge, deploy, publish and external messages require explicit user authorization for that action, scope and target. Local commit authority grants no external authority. Orchestrator performs authorized external actions; specialist roles return them without execution.
- [planning.plan-amend] During approved task execution, mechanical plan progress records need no new user approval; changed goals, scope, criteria, method, risk, dependencies or required verification require revised-version approval and preparation before affected work. In both cases Orchestrator amends the original planning-document commit at a safe boundary, without a separate document or fixup commit. Preserve actual approval chronology, recoverable old/new contents, hashes, versions and SHA mappings; never retroactively authorize earlier work. Rewrite only unpublished, unshared local linear history with clear ownership and no merges; stop on unknown publication, ownership, unexpected state or replay conflicts, without force push or a fallback document commit. Preserve implementation task boundaries and revalidate affected evidence. See planning, handoff-prep, commit and verification for the full contract.
- [platform.codex] Role restrictions are prompt-level contracts, not a filesystem sandbox. No documented role-specific Git hook or generic per-agent tool allowlist is assumed. Existing shell capabilities are retained because static read access after shell reduction has not been verified; Coder and QA need shell for approved checks.
[ARC role policy: contract end]
