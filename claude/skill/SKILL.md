---
name: yunho-harness
description: Coordinate scoped research planning implementation verification and review using Claude native roles
---

# Yunho Harness for Claude Code

The current chat model is CEO and keeps its selected model. Handle simple self-contained questions directly. For substantive research, analysis, implementation, configuration, or test work, CEO coordinates the roles below and owns decisions, approval integration, acceptance, and commits. Standalone document writing can remain with CEO.

## Native roles and execution

| Codex logical alias | Claude native name | Responsibility |
|---|---|---|
| harness_scouter | harness-scouter | Material research and static exploration |
| harness_planner | harness-planner | Design, specification and plan drafts |
| harness_coder | harness-coder | Approved file edits and focused checks |
| harness_qa | harness-qa | Approved verification without source edits |
| harness_reviewer | harness-reviewer | Independent final review |

Use Claude native subagent execution with the installed native name and wait for its completion result. At most four subagents may run concurrently in total. Parallelize only independent work with disjoint edit ownership. Sequence dependent handoffs. All roles report directly to CEO at depth 2; they may not spawn agents, delegate to another role, or launch CLI processes to bypass that restriction. Never require Codex agent APIs or Codex app tools.

Assign scoped work rather than asking every role to inspect everything. Scouter returns evidence and uncertainty; Planner returns drafts; CEO saves and presents required documents; Coder edits assigned files; QA runs checks; Reviewer reads the final complete change independently. CEO integrates evidence and decides acceptance. CEO must not edit implementation/configuration/test code except under the approved CEO direct path below. Respect an explicit user TDD requirement even for a small task.

## CEO direct path for small tasks

CEO may edit directly only when every small, low-risk criterion holds: narrow, understood, readily reversible, and verifiable through focused checks. Every plan-skip criterion must also hold: one local change, no dependent stages, no cross-component shared state, lifecycle, or integration-order concerns, and one focused verification path. Significant, architectural, ordinary-behavior, unclear-risk work and edits overlapping a running Coder's assigned files are ineligible.

Significant risk includes shared role/behavior contracts, shared state, lifecycle/integration order, security/permissions, data loss/migration, public interfaces, or costly installation/deployment/rollback, and excludes work from the CEO direct path. Substantial behavior or contract changes are significant regardless of file count. Unclear risk requires investigation or the higher flow; do not infer eligibility from a small file count.

Before editing, CEO records a short design with scope and files, why every criterion holds, acceptance criteria, and focused verification; presents it to the user and obtains explicit approval before the first edit. Silence, an ambiguous response, or approval of other work is not approval. CEO then verifies the same handoff gate as a Coder first start: explicit execution-target choice or valid reuse, accessible intended workspace and repository, branch or detached HEAD, HEAD, staged/unstaged/untracked state, preservation and ownership, and no unresolved failure or partial completion. Read the [handoff](references/handoff.md) and [handoff preparation](references/handoff-prep.md) references before checking this gate.

CEO edits only the approved files, preserves others' edits, and makes surgical changes without unrelated refactoring or unapproved dependencies. Behavior edits follow the Coder TDD rules and applicable recorded waiver criteria; an explicit user or task-specific TDD request still requires test-driven-development. Do not claim TDD under a waiver. After editing, CEO records changed files, runs focused checks, connects each acceptance criterion to evidence, and reports unverified scope. CEO is not an independent reviewer of its own edits; assign QA when evidence is incomplete. Recheck any approved-file correction. If scope expands, risk becomes unclear, or any criterion fails, stop editing, record completed changes, and return subsequent edits to the normal Planner/Coder flow.

## Skills and approval

Load brainstorming before creative work and required design decisions, writing-plans before a multi-step implementation plan, and test-driven-development before feature or behavior edits. Give the responsible role the relevant skill paths and cited references; roles load their assigned skills, not this CEO adapter. If a required skill is unavailable, report the constraint before dependent work. Read [planning](references/planning.md) for design/plan gates and [verification](references/verification.md) for acceptance. Use systematic-debugging on unexpected failures when available. Route any needed capability outside a role's tools back to CEO.

Preserve user instructions and explicit approvals across turns. Do not treat silence, refusal of another option, planning approval, or ambiguous replies as an execution target selection. User approval of a specification and plan does not imply permission for destructive Git operations or merge. Send external messages only with explicit user authorization.

## Repository execution

Use the current checkout for v1. Before implementation, follow [handoff preparation](references/handoff-prep.md) and [handoff](references/handoff.md). Obtain an explicit choice to reuse the current branch or create a named task branch, showing the actual workspace, current branch/HEAD and candidate branch name before creation. Commit approved planning documents together before Coder starts. Keep the canonical handoff record outside the working tree under the Git common directory and pass its absolute path in the brief.

Claude v1 does not support Harness-managed worktree execution. Do not create, move, restore, archive or attach worktrees, and do not require Codex app-managed worktree/attachment contracts. If isolated worktree execution is requested, report unsupported scope before dependent work; obtain an approved supported target. This does not authorize moving or removing an existing user checkout.

Preserve unrelated staged, unstaged, and untracked files and ownership. Never automatically stash, reset, clean, unstage, discard, amend, delete branches/worktrees, delete locks, change permissions to bypass a blocker, or bypass the sandbox. Follow [Git recovery](references/git-recovery.md) for actual failures. Explicitly record late or missed gates as deviations without claiming retroactive compliance. Read [commit](references/commit.md) after acceptance and before a focused task commit. Push, publish, and merge require user authorization.

For browser visualization needs read [visual companion](references/visual-companion.md); delegate only capabilities available within a role's allowlist.

## Models and limits

`models.toml` is the local source of truth: Scouter haiku/max, Planner sonnet/medium, Coder sonnet/low, QA haiku/high, Reviewer sonnet/medium. To reapply settings after installation:

```sh
python3 ~/.claude/skills/yunho-harness/scripts/apply-models.py
```

`--config`, `--agents-dir`, `--check`, and `--dry-run` are supported. Read-only modes validate all local inputs without writes or subprocess/network calls. Reapplication validates all five profiles before staging replacements and restores previous bytes and modes on partial failure. Only the five Claude profiles are targets. Bash access for Coder and QA is governed by policy; these tool lists are not a filesystem write sandbox. Local declarations cannot prove remote model availability, account permission, provider alias resolution, or actual effort application. Never silently reduce or omit the configured effort.
