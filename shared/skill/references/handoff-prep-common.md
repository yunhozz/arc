# Handoff preparation contract — shared text

This file holds text shared by every platform's handoff-prep.md. Each part belongs to the section that links to it and has the same force there.

<a id="execution-target-request-gate"></a>
### Execution-target request gate

Obtain explicit choice before preparation.

<a id="git-mutation-evidence-gate"></a>
### Git mutation evidence gate

Before branch/worktree preparation, obtain the complete first required draft and self-review and pass the focused source/intent/preservation check. Before every preparation mutation (branch creation/switch, worktree creation, approved-doc staging/commit), read this and record/recheck:

1. Explicit choice or verified valid reuse.
2. Absolute workspace/intended repository, actual branch or detached HEAD and HEAD.
3. Staged/unstaged/untracked state, preservation and ownership.
4. Exact command/paths/approved scope; no unresolved failure or partial completion.

Missing or mismatched evidence blocks mutation. Initial preparation verifies planned scope/inputs without requiring complete approved documents. Document staging/commit also verifies the full set, applicable approvals (Architectural combined spec+plan approval; Bounded plan approval)/versions/dependencies and actual index. Read-only Git remains allowed. External skills' early commits grant no authority.

After branch/commit operations verify path/branch/HEAD/preservation/result before dependent action. After staging verify index paths/diff and finalized message. Unrelated staged paths block changes. Revalidate affected evidence after a change or failure; NEVER retroactively authorize pre-gate actions.

<a id="current-checkout"></a>
### Current checkout

After explicit selection or valid reuse, verify absolute workspace, branch/detached HEAD, HEAD and existing changes/preservation/ownership. Record state/choice. Missing choice, uncertain state or unclear ownership blocks handoff.

<a id="planning-document-commit"></a>
### Planning document commit

Skip only when depth rules required no documents and none were created; record why. Uncommitted documents are not absent. This adds neither documents nor gate exceptions. Unchanged authorized target/scope needs no repeated choice. NEVER automatically commit or delete other changes to prepare a target; approved planning-document commits are the sole exception, and unrelated dirty files stay preserved.

<a id="execution-time-plan-revision"></a>
### Execution-time plan revision

After initial document batching, follow [planning](planning.md#plan-updates-during-execution) for spec/plan revisions and same-task progress records. Orchestrator alone manages pending revisions and Git; preserve unrelated work and actual approval chronology.

1. Classify progress records versus contract/mechanical plan revisions. Verify applicable approvals under [planning](planning.md#plan-updates-during-execution) (combined spec+plan revision approval, plan approval, or spec approval with recorded no-plan-impact), actual approval time, preparation and holds; contract revisions require a fresh Implementer for remaining work. NEVER authorize past work retroactively.
2. After approval edit the same document, append its revision-history row and leave it uncommitted. Record each pending revision with its approved content hash and approval in the canonical `.git/arc/handoff/<workflow>/` record: `gitPath`, `fromVersion`, `toVersion`, `contentHash` (approved content SHA-256), `approvalRef`, `approvedAt` (actual time), `classification` (`contract|mechanical`), `reason`, `affectedTaskIds`, `status` (`pending|committed`). Preserve each full approved version at `.git/arc/handoff/<workflow>/plan-revisions/<flattened-gitPath>.v<N>.md`; NEVER overwrite prior approvals or copies.
3. In every role brief identify the Orchestrator-owned pending revision, working-tree version and `contentHash`. If another task's progress records were committed after approval, also include in the brief the SHA-256 of the working-tree document content, which is the approved content plus those progress records. Implementer and Tester preserve it untouched as neither their own work nor unrelated user changes.
4. Include all pending revisions in the accepted commit of the first top-level task executed or reconfirmed against the revised version, otherwise a current task or final Reviewer follow-up commit. Only before overall completion, a standalone `docs(plan)` closing commit MAY include all pending revisions/trailers and no implementation files when no implementation work remains; keep canonical supporting evidence. Exclude pending revision hunks from independent prior-version task commits; hold the commit if separation is unsafe. Add `Plan-Revision: <gitPath> v<from> -> v<to>`, `Plan-Approved-At: <gitPath> v<N> <actual ISO 8601 approval time>` and `Plan-Reason: <gitPath> v<N> <reason>`: one revision trailer per document, approval/reason trailers per version after from through to; repeat keys as needed and preserve existing Git trailers. Use ASCII `->`. Plan-level progress records follow [commit](commit.md#execution-time-plan-document-updates) and alone never justify the closing commit.
5. After commit verify the SHA-256 of each committed document's content (not the Git blob OID) equals the latest approved `contentHash` if no progress records have been committed since approval. Otherwise compare against the latest approved copy and allow only classified progress records of this commit's task or committed for other tasks after approval (including R-8 separation) and plan-level progress records carried by this commit. Record the SHA-256 of the expected content used for this comparison in the canonical record; NEVER overwrite approved copies. Mark recorded revisions `committed` and verify no pending revisions remain under [verification](verification.md#evidence-after-plan-revision-commit). Link commit SHA only in the canonical record, never the document. NEVER amend/reset/replay/rewrite planning or implementation commits or create other docs/fixup commits.

<a id="recovery-prerequisite"></a>
### Recovery prerequisite

Read [git-recovery](git-recovery.md) before dependent collision/failure/partial-completion/metadata-denial recovery. Stop/preservation rules are mandatory.

<a id="instruction-and-input-provenance"></a>
## Instruction and input provenance

Distinguish instruction/input sources, versions/approvals and access. Missing root AGENTS.md alone implies no missing user instructions. Optional reads follow only [handoff](handoff.md#instruction-sources-bounded-read-recovery-visual-evidence-and-resumption)'s pre-authorization. This exception never covers Git/generation/preparation failure or partial changes. Verify resolution evidence/gates before resume.
