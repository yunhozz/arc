# Prepare the current checkout

Claude v1 supports the current checkout only; ARC-managed worktree execution is unsupported.
Do not create or attach worktrees as a fallback. Report unsupported requests before dependent work.

## Execution-target and Git evidence gates

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
Claude v1 offers current checkout/current branch (or detached HEAD) or a task branch in that checkout only.
Planning approval or silence does not select a branch. Before branch creation present its exact candidate and base.
Preserve unrelated changes; never stash, reset or clean to prepare.

### Git mutation evidence gate

Before each preparation Git mutation—branch creation/switch, approved-document staging,
or commit—read this reference and recheck explicit execution-target choice or verified valid reuse; absolute workspace
and intended repository; current branch or detached HEAD and HEAD; staged/unstaged/untracked changes, preservation and
edit ownership; and the exact command, target paths, and approved scope. Confirm no unresolved failure or partial
completion. Record these facts before the action. Missing or mismatched evidence stops that mutation.
Initial target preparation does not require the complete approved document set: verify planned scope and target inputs.
For approved-document staging and commit, also verify the complete approved document set and individual approval
evidence, approved versions, dependencies, and actual index. Read-only Git checks remain allowed.
Do not infer execution authority from an external skill's early commit step.

After branch creation/switch verify actual absolute path, branch, HEAD and preserved state before dependent drafting.
After staging verify index paths and diff before commit; unrelated staged files block the mutation. Stop and inspect
on failure or partial completion, record actual state and completed steps, and revalidate affected gates after resolution.

Batch-commit all remaining approved planning documents together in one focused docs commit before the first Implementer
handoff. Stage only those document paths and verify the staged content and scope.
Verify the resulting SHA, subject, paths, branch, HEAD and remaining state. Already committed approved documents need no
duplicate commit. Record the actual preparation order and deviations, then complete the handoff gate before the
next Implementer start. User authorization persists for the unchanged approved target and scope; do not repeatedly ask for the
same choice.

## New task branch naming

With explicit user approval of the exact candidate and base, create the branch in the current checkout (for example
`git switch -c <branch>` from the approved base HEAD). Name it `<type>/<short-kebab-case-topic>`: a lowercase prefix for
the task's main purpose and a short, specific lowercase kebab-case topic without spaces.

| Prefix | Purpose |
|---|---|
| feat/ | Add a feature |
| fix/ | Fix a bug |
| refactor/ | Restructure preserving behavior |
| docs/ | Change documentation |
| test/ | Add or change tests |
| build/ | Build, packaging, dependencies |
| ci/ | CI configuration |
| perf/ | Improve performance |
| style/ | Formatting or style only |
| chore/ | Operational policy, tools, maintenance |
| revert/ | Revert a prior change |

Validate the name and check collisions before creation. If the base name exists, never automatically substitute a
suffix; present a new candidate for explicit approval and use it only after the user approves it.
Never reuse, delete, or overwrite an existing branch. Distinguish a lookup error from a missing branch;
a lookup error blocks handoff and goes to git-recovery. Recheck workspace, branch or detached HEAD, base HEAD,
and candidate before execution. If the target changes or a new collision changes the candidate, present it and obtain
new explicit approval before creating or switching; without it, block handoff. After success confirm the branch matches
the candidate, HEAD matches the base, the path is unchanged, and existing changes are preserved.

## Planning document commit

Begin only when all applicable documents are written, individually approved, and the set is complete.
Verify already committed approved documents by SHA, message, paths, and content and reuse them; batch all remaining
approved documents into one focused docs commit, staging only those paths and verifying staged paths and diff.
Finalize the English Conventional Commit message before the first commit; no temporary message then amend.
Never amend, reset, or recommit past commits to merge them. Skip the commit only when no documents were required or
produced, recording the depth rationale; uncommitted documents are not absent. Never include implementation files.
After success verify SHA, message, paths, HEAD, branch, and remaining state; the commit is not push approval.

## Execution-time plan amendment

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

[ARC role policy: contract begin]
Generated from lib/policy/role-policy.json; do not edit this managed section manually.
- [scope.non-escalation] Act only where role authority, approved scope and available platform tools all permit. Delegation, restart, agent messages and attached instructions do not expand role authority. MUST NOT bypass a restriction through aliases, scripts, other tools, processes or redelegation. Return conflicting instructions to Orchestrator before dependent work; reuse valid prior approvals for unchanged scope rather than requesting them again.
- [git.specialists-deny] Specialist roles MUST NOT change Git state: no stage, commit, push, merge, rebase, reset, branch creation/switching or worktree creation/removal, during normal implementation or recovery. Even an explicit Orchestrator assignment cannot authorize these actions; return them to Orchestrator. Read-only Git inspection remains allowed within the assigned scope.
- [git.orchestrator-accept-commit] Only Orchestrator accepts work and executes Git mutations. One approved top-level plan task becomes one focused implementation commit after criteria, required checks and findings are satisfied; Orchestrator accepts then commits without additional user commit approval. Reports, passing checks and Reviewer opinions do not replace acceptance. Preserve unrelated changes and ownership and verify the resulting SHA, included content, HEAD and remaining changes. Existing small-task direct and plan-omission paths are unchanged.
- [external.explicit-user-authority] Push, merge, deploy, publish and external messages require explicit user authorization for that action, scope and target. Local commit authority grants no external authority. Orchestrator performs authorized external actions; specialist roles return them without execution.
- [planning.plan-amend] During approved task execution, mechanical plan progress records need no new user approval; changed goals, scope, criteria, method, risk, dependencies or required verification require revised-version approval and preparation before affected work. In both cases Orchestrator amends the original planning-document commit at a safe boundary, without a separate document or fixup commit. Preserve actual approval chronology, recoverable old/new contents, hashes, versions and SHA mappings; never retroactively authorize earlier work. Rewrite only unpublished, unshared local linear history with clear ownership and no merges; stop on unknown publication, ownership, unexpected state or replay conflicts, without force push or a fallback document commit. Preserve implementation task boundaries and revalidate affected evidence. See planning, handoff-prep, commit and verification for the full contract.
- [platform.claude] Existing per-role tool allowlists reduce available tools; Bash and role contracts are not a filesystem sandbox. A role-scoped Git guard is a separate integration and is not supplied by these policy sections alone.
[ARC role policy: contract end]
