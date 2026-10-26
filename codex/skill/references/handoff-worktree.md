<a id="managed-worktree-handoff-contract"></a>
# Managed worktree handoff contract

After explicit new-managed-worktree selection, Orchestrator reads this before creation, branch work or document transfer. Also apply [handoff-prep](handoff-prep.md) and [handoff](handoff.md).

<a id="workspace-handoff"></a>
## Workspace handoff

<a id="new-managed-worktree"></a>
### New managed worktree

Before formal drafting/saving, verify actual creation, managed registration, current-chat attachment, repository/common directory/base, approved branch and source preservation below. Draft/save new documents directly in the verified target. Planned paths prove no preparation; initial preparation authorizes neither Implementer nor document commits.

1. Only explicit selection of this third path authorizes preparation. Use the selection target verified under handoff-prep's request gate. The app chooses the actual path; do not propose siblings or require user-specified paths. Use verified full source HEAD SHA as base, never remote HEAD/default branch or automatic fetch.
2. After choice and immediately before the call, recheck source state, base SHA, approved candidate/collision, name and document scope. Changed pre-creation inputs require fresh explicit choice. After successful creation/verification, handoff lifetime/restart rules apply.
3. Before `mcp__codex_app__create_worktree`, validate candidate/collision under handoff-prep. Collisions require new explicit choice, never automatic suffixes. Existing-branch reuse is forbidden by default. Only this managed path permits an approved existing branch at the same base and not checked out in any worktree, after both checks. Unexpected branch, different base or uncertain lookup stops work.
4. Use only the app tool:

    mcp__codex_app__create_worktree({
      allowAsync: true,
      name: "<approved-descriptive-name>",
      ref: "<verified-source-head-full-sha>"
    })

The descriptive name guarantees no path/branch. There are no destination-path/branch arguments. Pass full SHA `ref` explicitly; never omit or rely on remote defaults. For `operationId`, use `mcp__codex_app__get_worktree_creation_status` until completed. Preparing/creating/registering is not success.

Only registration failure permits reattachment of the returned workspace with `mcp__codex_app__attach_worktree`. No formal drafting/saving/transfer/staging/commit/Implementer before completed registration, current-chat attachment and branch verification. Missing tools, failed reattachment or mismatched results stop with actual-state reporting. No raw Git worktree fallback, alternate name/ref/path/branch retries or automatic cleanup/deletion/prune/archive. Read git-recovery before dependent recovery.

Verify creation in order:

1. Verify returned absolute path and app-artifact management/current-chat attachment.
2. Record initial branch or detached HEAD, approved candidate, final branch and target HEAD equal to approved ref.
3. Verify linked registration, source/target common-directory identity, registered path and target dirty state. Verify source branch/HEAD/index/files preservation. Approved-target shared metadata additions are authorized. Linked `.git` may be a file; repository identity requires neither identical top-level path nor a `.git` directory.
4. After registration/attachment/base checks, create/check out the approved branch: `git switch -c <approved-branch> <ref>` if detached, or `git switch <approved-branch>` under the existing-branch exception. No pointer moves, alternate branches, `--force` or `-B`. If the app already returned the approved branch, verify without repeating completed work.
5. Unexpected branch/HEAD mismatch stops work. Verify final branch/HEAD before formal drafting, saving, transfer, batch docs commit, final Git checks and handoff.

The tool copies no uncommitted changes. Transfer rules below apply only to existing approved documents in legacy/restart/explicit-target-change cases, not normal new documents.

- Untracked approved documents must be absent from source HEAD/index, with working-tree bytes matching latest approval.
- Tracked documents require source index blob/mode equal to HEAD and working-tree bytes equal to latest approval. Approved working revisions may differ from HEAD/index. Do not stage source documents to repair or verify them.
- Mismatches, unrelated staged changes, required uncommitted implementation/configuration/test changes or unclear ownership block preparation. Clearly unrelated unstaged/untracked changes stay in source.
- Never automatically stash/commit/reset/clean/unstage or transfer dirty implementation. Transfer existing approved documents below before target document preparation.

<a id="worktree-document-transfer"></a>
### Worktree document transfer

Only for existing approved documents in legacy/pre-existing-document, restart, or explicit-target-change cases; not normal new documents:

1. Verify existing approved commit SHA/message/paths/content and validity at base/target; reuse them.
2. Copy only uncommitted approved spec/plan documents to the same relative paths. Never move/delete/modify source documents. Stop for destinations escaping the worktree, including symlinks. Target HEAD must equal selected source base SHA before transfer.
3. Before replacing a destination, prove clean base state: no staged/unstaged changes, index/working bytes equal base. Documents absent from base must also be absent at destination. Never overwrite unexpected changes.
4. Verify approved bytes before reusing identical content; verify approved bytes after transfer.
5. Record approvals/versions/evidence, absolute source/target paths, common relative paths and content checks. Changed content/approval scope needs revised approval. Transfer nothing else. Failure/partial transfer blocks dependent staging, commits and Implementer handoff.
