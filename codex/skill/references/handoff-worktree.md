<a id="managed-worktree-handoff-contract"></a>
# Managed worktree handoff contract

After explicit new-managed-worktree selection, Orchestrator reads this before creation, branch work or document transfer. Also apply [handoff-prep](handoff-prep.md) and [handoff](handoff.md).

<a id="workspace-handoff"></a>
## Workspace handoff

<a id="new-managed-worktree"></a>
### New managed worktree

After the first required chat draft and focused preparation gate, verify actual creation, managed registration, platform attachment evidence defined in worktree-creation, repository, common directory, base, approved branch and source preservation below. Review and save new documents directly in the verified target. Planned paths prove no preparation; initial preparation authorizes neither Implementer nor document commits.

1. Only explicit selection of this third path authorizes preparation. Use the selection target verified under handoff-prep's request gate. Use verified full source HEAD SHA as base, never remote HEAD/default branch or automatic fetch.
2. After choice and immediately before the call, recheck source state, base SHA, approved candidate/collision, name and document scope. Changed pre-creation inputs require fresh explicit choice. After successful creation/verification, handoff lifetime/restart rules apply.
3. Before creation through [worktree-creation](worktree-creation.md), validate candidate/collision under handoff-prep. Collisions require new explicit choice, never automatic suffixes. Existing-branch reuse is forbidden by default. Only this managed path permits an approved existing branch at the same base and not checked out in any worktree, after both checks. Unexpected branch, different base or uncertain lookup stops work.
4. Creation uses only [worktree-creation](worktree-creation.md).

No saving/transfer/staging/commit/Implementer before completed registration, platform attachment evidence defined in worktree-creation and branch verification. Read git-recovery before dependent recovery.

Verify creation in order:

1. Verify returned absolute path and platform attachment evidence defined in [worktree-creation](worktree-creation.md).
2. Record initial branch or detached HEAD, approved candidate, final branch and target HEAD equal to approved ref.
3. Verify linked registration, source/target common-directory identity, registered path and target dirty state. Verify source branch/HEAD/index/files preservation. Approved-target shared metadata additions are authorized. Linked `.git` may be a file; repository identity requires neither identical top-level path nor a `.git` directory.
4. After registration/attachment/base checks, create/check out the approved branch: `git switch -c <approved-branch> <ref>` if detached, or `git switch <approved-branch>` under the existing-branch exception. No pointer moves, alternate branches, `--force` or `-B`. If creation already returned the approved branch, verify without repeating completed work.
5. Unexpected branch/HEAD mismatch stops work. Verify final branch/HEAD before formal drafting, saving, transfer, batch docs commit, final Git checks and handoff.

Transfer rules below apply only to existing approved documents in legacy/restart/explicit-target-change cases, not normal new documents.

- Untracked approved documents MUST be absent from source HEAD/index, with working-tree bytes matching latest approval.
- Tracked documents require source index blob/mode equal to HEAD and working-tree bytes equal to latest approval. Approved working revisions may differ from HEAD/index. DO NOT stage source documents to repair or verify them.
- Mismatches, unrelated staged changes, required uncommitted implementation/configuration/test changes or unclear ownership block preparation. Clearly unrelated unstaged/untracked changes stay in source.
- NEVER automatically stash/commit/reset/clean/unstage or transfer dirty implementation. Transfer existing approved documents below before target document preparation.

<a id="worktree-document-transfer"></a>
### Worktree document transfer

Only for existing approved documents in legacy/pre-existing-document, restart, or explicit-target-change cases; not normal new documents:

1. Verify existing approved commit SHA/message/paths/content and validity at base/target; reuse them.
2. Copy only uncommitted approved spec/plan documents to the same relative paths. NEVER move/delete/modify source documents. Stop for destinations escaping the worktree, including symlinks. Target HEAD MUST equal selected source base SHA before transfer.
3. Before replacing a destination, prove clean base state: no staged/unstaged changes, index/working bytes equal base. Documents absent from base MUST also be absent at destination. NEVER overwrite unexpected changes.
4. Verify approved bytes before reusing identical content; verify approved bytes after transfer.
5. Record approvals, versions, evidence, absolute source and target paths, common relative paths and content checks. Changed content/approval scope needs revised approval. Transfer nothing else. Failure/partial transfer blocks dependent staging, commits and Implementer handoff.

<a id="worktree-failures-and-partial-completion"></a>
### Worktree failures and partial completion

Managed-worktree creation/registration/attachment/identity/base/checkout/transfer/stage/commit failures stop dependent work/handoff. Branch-only or partial-path creation, registration/path mismatch, wrong base/branch and partial transfer count as partial completion.

Record source/target commands/errors/branch/HEAD/common directory/registration/index/files, target dirty state and source preservation. Include platform attachment evidence defined in worktree-creation, initial/final branch, base/ref SHA and ownership. Inspect actual state/completed work before authorized retry.

No automatic alternate path/branch, deletion, `git worktree prune`, `--force`/`-B`, cleanup or archive. Normal preparation after explicit managed selection is allowed; arbitrary recovery workspace moves are not. Resolve and revalidate the full gate; renewed choice follows handoff lifetime rules. Preserve completion and platform recovery/no-fallback limits defined in [worktree-creation](worktree-creation.md).
