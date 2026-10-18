# Prepare the current checkout

Claude v1 supports the current checkout only; ARC-managed worktree execution is unsupported.
Do not create or attach worktrees as a fallback. Report unsupported requests before dependent work.

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

Batch-commit all remaining approved planning documents together in one focused docs commit before the first Coder
handoff. Stage only those document paths and verify the staged content and scope.
Verify the resulting SHA, subject, paths, branch, HEAD and remaining state. Already committed approved documents need no
duplicate commit. Record actual preparation order and any deviation honestly, then complete the handoff gate before the
next Coder start. User authorization persists for the unchanged approved target and scope; do not repeatedly ask for the
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

Validate the name and check collisions before creation. If the base name exists, append `-2`, `-3`, and so on to the
topic, choosing the first unused name (`chore/branch-policy`, then `chore/branch-policy-2`).
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
