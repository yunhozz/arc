# Coder handoff

CEO verifies the absolute workspace/repository, branch or detached HEAD, HEAD, staged/unstaged/untracked state, ownership, document approvals and committed planning documents before first start and restart. The approved execution target must remain valid. Claude v1 supports current checkout execution and does not support Harness-managed worktrees.

Resolve the Git common directory and keep one canonical initial record at `<git-common-dir>/yunho-harness/handoff/<plan-or-task-slug>.md`, outside the working tree. Never stage it or store secrets there. Record approved document paths/versions/coverage/dependencies and approval evidence; explicit target choice; prior and resulting Git state; document commit SHA/subject/files; task scope, ownership, checks and limits. If a gate or record was late, record actual order and resolve forward; never claim retroactive compliance.

The Coder brief supplies absolute workspace, verified branch/HEAD, canonical record path, approved task/criteria, exact file ownership, expected tests, dependency limits and blocked conditions. A restart supplies only verified deltas and marks unchanged fields by reference to the record. Coder trusts CEO verified prep rather than independently repeating approval/Git evidence checks, reads fields marked unchanged, and stops on an actual observed conflict. Tell Coder that others share the repository and unrelated work must be preserved.

Roles report directly to CEO. Do not delegate at depth 2. CEO sequences dependent work, resolves actual blockers and revalidates affected gates before resume. No automatic retry after unexpected Git or tool failure.
