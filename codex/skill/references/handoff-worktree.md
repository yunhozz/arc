# Managed worktree handoff contract

Orchestrator reads after the user explicitly selects the new managed worktree option, before its creation,
branch work or document transfer. Apply [handoff-prep.md](handoff-prep.md) and [handoff.md](handoff.md) gates as well.

## Workspace handoff

### New managed worktree

Before formal drafting and saving, complete actual creation, managed registration, current-chat attachment,
repository/common directory and base verification, approved branch verification, and source preservation checks below.
The normal new-document path drafts and saves directly in the verified target. Planned destination paths are not
preparation evidence. Initial preparation does not authorize Implementer or a document commit.

Only an explicit user choice of this third path authorizes preparation. Its selection target is the one verified
under the Execution-target request gate in handoff-prep.md.
The app determines the actual destination path; do not propose a sibling path or require a user-specified path
candidate.
Use the verified source HEAD full SHA as the base; do not substitute remote HEAD or a default branch or fetch
automatically.
Recheck approved source state, base SHA, approved branch candidate/collision status, name and approved document scope
after choice and immediately before the tool call. After selection and before creation, any changes require
a fresh explicit choice for the updated inputs. This is the pre-creation candidate rule. After successful creation
and verification, apply Choice lifetime and restart record in handoff.md.

Before calling mcp__codex_app__create_worktree, validate the approved branch candidate and collision state with
New task branch naming rules in handoff-prep.md. A collision requires a new explicit choice; never automatically
substitute a suffix.
Default is the prohibition on reusing an existing branch in handoff-prep.md; only this narrow exception applies.
Exception for this managed path: an existing approved branch at the same base and not checked out in any worktree
may be reused; verify both conditions before reuse. An unexpected branch, different base or lookup uncertainty means
stop.

Create using only the app tool:

    mcp__codex_app__create_worktree({
      allowAsync: true,
      name: "<approved-descriptive-name>",
      ref: "<verified-source-head-full-sha>"
    })

The name describes the work; it guarantees neither a path nor a branch. There are no destination path or branch arguments.
Pass ref explicitly as the full SHA; do not omit it or rely on a remote default. If an operationId is returned,
use mcp__codex_app__get_worktree_creation_status until completed. Preparing/creating/registering progress is not
success.
For registration failure only, retry the returned workspace with mcp__codex_app__attach_worktree. Before completed
managed registration, current-chat attachment and approved branch verification, perform no formal drafting, saving, document transfer, staging,
commit or Implementer start. If tools are unavailable, reattachment fails or results mismatch, stop and record actual state.
Do not fall back to raw Git worktree creation, automatically retry other name/ref/path/branch inputs,
or perform automatic cleanup, delete, prune or archive. See git-recovery.md before dependent recovery.

Verify the returned actual absolute worktree path and app-managed current-chat attachment using app artifacts.
Record initial branch or detached HEAD, approved branch candidate, final branch, and target HEAD equal to approved ref.
Verify linked-worktree registration and source/target Git common directory identity, registered path,
target dirty state, and source branch, HEAD, index and files preservation; shared Git metadata additions for the approved target are
authorized.
Linked worktree .git may be a file; do not require the same top-level path or a .git directory for repository identity.
Verify registration, attachment and base before creating/checking out the approved branch. If initially detached,
use `git switch -c <approved-branch> <ref>`; if the existing approved branch has the same base and is not checked out
in any worktree, use `git switch <approved-branch>` (the exception above to the default no-reuse rule in
handoff-prep.md). Do not move a branch pointer, choose another branch or use --force
or -B.
If the app initially returns the approved branch, verify it and its base rather than repeating completed work.
Unexpected branch or mismatched HEAD means stop. Verify final approved branch and HEAD before formal drafting, saving, document transfer,
the batch docs commit, final Git verification and Implementer handoff.

The tool does not copy uncommitted changes. The following transfer rules apply only to legacy or restart cases
with existing approved documents (including an explicitly selected target change), not the normal new-document path. For untracked approved documents, source HEAD and index paths must be
absent and source working-tree bytes must match the latest approved version. For tracked approved documents, source
index blob and mode must equal source HEAD, while source working-tree bytes must match the latest approved version.
Approved working-tree revisions may differ from HEAD/index; do not repair or verify them by staging source documents.
Any mismatch means stop. Unrelated staged changes, required uncommitted implementation/configuration/test changes,
and unclear ownership block preparation. Clearly unrelated unstaged/untracked changes remain in source.
Do not automatically stash, commit, reset, clean, or unstage; do not transfer dirty implementation files.
For those existing approved documents, use Worktree document transfer before target docs preparation.

### Worktree document transfer

Use only for existing approved documents in pre-existing-document or restart/target-change cases.

Verify existing approved commits by SHA, message, paths and approved content valid at base and target; reuse them.
Copy only uncommitted approved spec/plan documents to the target at the same repository-relative path.
Do not move, delete, or modify the source documents. If a destination resolves outside the worktree, including through
an escaping symlink, stop. Before transfer verify target HEAD equals the selected source base SHA.
Before replacing an existing destination, prove its clean base state with no staged/unstaged changes and index and
working-tree bytes matching the base version; then replace with the approved version. A document absent from base must
also be absent at the destination. For unexpected changes, do not overwrite; stop.
For identical content, verify approved bytes before reuse. After transfer verify bytes match the approved version.
The canonical record includes each document approval/version/evidence, source and target absolute paths and the common
relative path plus content verification. Changed content or approval scope requires approval of the revised version.
Transfer no other files. Failure or partial transfer blocks all dependent staging, commit and Implementer handoff.
