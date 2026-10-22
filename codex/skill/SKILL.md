---
name: arc
description: Keep simple, self-contained questions with the chat-selected Orchestrator; route implementation and mixed implementation work to the Orchestrator, and material research/analysis and static exploration to Scouter.
---

# ARC

{{ARC_OUTPUT_LANGUAGE_POLICY}}

Role gate: design, spec, plan, and brainstorming drafts are authored ONLY by Planner (`arc_planner`);
Orchestrator MUST NEVER author them and MUST NEVER invoke `brainstorming` or `writing-plans` through its own Skill tool.
If either auto-triggers in Orchestrator context, Orchestrator stops and routes to Planner, citing that skill's SKILL.md
path in the brief. A user request to skip questions never waives design or approval gates; Planner returns questions to
Orchestrator. Each top-level task (a plan task, or the whole request without a plan) gets a FRESH Coder,
and each task that needs QA under Risk-scaled execution gets a FRESH QA, never one reused from another task;
same-task corrections and rechecks default to the current Coder and QA while the assignment remains valid;
a QA finding within the current task does not itself create a new task (see coordination and verification for restart exceptions).

Follow user instructions and project guidance. Orchestrator uses the current chat model and answers simple,
self-contained questions directly. For substantive multistep work, Orchestrator coordinates implementation, configuration, tests,
and mixed work.
Orchestrator handles research directly when the needed material is already in its context or the check is a quick read
of a few known files; all other material research/analysis and bounded exploration (read-only, of static code, documents, data, and
logs/reports) goes to Scouter with its configured settings (a bounded lookup gets a narrow brief: known paths,
specific facts, no synthesis). Route by object and deliverable, not verbs alone.
Standalone document writing has no specialist auto-route. Design, spec, plan, and brainstorming drafts are not
standalone document writing (see Role gate).
For mixed research/document requests, Orchestrator may explicitly assign only research to Scouter.
Live operational state inspection and operational cleanup are outside Scouter scope and this boundary makes no owner assignment.

## Shared terms

The coordination, handoff, handoff-prep, git-recovery, verification, and commit references and the Coder profile use
these terms; context-specific commands, paths, and state checks still apply.

- **Preservation rule**: preserve unrelated staged, unstaged, and untracked changes and edit ownership; never
  automatically stash, reset, clean, unstage, discard, amend, or delete branches/worktrees; never change permissions,
  delete locks, or bypass the sandbox to proceed; stop and report to Orchestrator (Orchestrator reports to the user).
- **Explicit choice**: only a clear user selection counts; planning approval, silence, refusal of another option, or an
  ambiguous reply never does.
- **Stop and inspect**: on failure or partial completion, stop dependent work; inspect and record the actual path,
  branch or detached HEAD, HEAD, index, files, and completed steps; do not retry, fall back, or repeat completed work
  automatically; revalidate affected gates after resolution.
- **Evidence verdict**: each criterion is proven, unmet, or unverified; passing runs, reports, or disposition never
  turn unverified into proven; reports keep unverified scope visible.
- **Common handoff gate**: the full verification Orchestrator passes before every Coder first start/restart and
  Orchestrator direct edit; see [handoff](references/handoff.md#common-handoff-gate).

## Mandatory task references

Orchestrator and each assigned role must read the applicable references before dependent decisions or actions,
and Orchestrator must include in the role brief the accessible path and section name of each reference section the role must read.
Resolve paths relative to this installed skill directory.
These contracts are conditional on the trigger, mandatory when triggered. Missing, inaccessible, or conflicting
references must be reported to Orchestrator; stop dependent work until resolved.
Do not load all references on every task.

| Reference | Required before |
|---|---|
| [coordination](references/coordination.md) | Before the first specialist creation or assignment and related coordination decisions; role contracts, briefing, adapters, models and token discipline |
| [limits](references/limits.md) and installed `limits.toml` | Before the first specialist creation; capacity, reservations and cumulative ledger |
| [planning](references/planning.md) | Design/plan-depth judgments, spec/plan drafting or approval, first spec/plan save; dependency and readiness decisions before assignment |
| [handoff](references/handoff.md) | Every Coder first start/restart preparation by Orchestrator, and before each Orchestrator direct edit's first edit; Coder trusts the Orchestrator-verified brief under its profile and reads only brief-cited sections |
| [handoff-prep](references/handoff-prep.md) | Execution-target choice request, each preparation Git mutation (branch creation/switch, staging, commit) |
| [handoff-worktree](references/handoff-worktree.md) | After explicit new managed worktree selection, before its creation, branch work or document transfer |
| [commit](references/commit.md) | Plan-task acceptance and its focused commit, resuming a task with an unclear commit result |
| [verification](references/verification.md) | Orchestrator's verification design, QA/Reviewer assignment, correction rechecks, UI acceptance checks, risk classification, acceptance and completion; QA and Reviewer use their profiles and only brief-cited sections |
| [git-recovery](references/git-recovery.md) | Branch collision, Git preparation failure, partial completion, metadata write denial, handoff record write denial recovery |
| [visual-companion](references/visual-companion.md) | Visual companion offer or operation |

Before classifying a small-task, plan-omission, or TDD exception, read the full conditions in [handoff](references/handoff.md), including Coder TDD and constraints and Orchestrator direct path for small tasks; read [planning](references/planning.md) for design/plan-depth judgments and [verification](references/verification.md) for the full risk criteria before deciding eligibility. An exception name or this index alone never establishes eligibility.

## Ownership

Read [coordination](references/coordination.md#ownership) before assigning roles. Only Orchestrator accepts work; specialists report directly at depth 2 and cannot delegate.

## Risk-scaled execution

Read [verification](references/verification.md#risk-scaled-execution) before risk classification, verification design, assignment or acceptance. It holds the risk table, risk definitions, evidence-reuse rule and role order.

## Common handoff gate

Read [handoff](references/handoff.md#common-handoff-gate) before every Coder first start/restart and Orchestrator direct edit.

[ARC role policy: contract begin]
Generated from lib/policy/role-policy.json; do not edit this managed section manually.
- [scope.non-escalation] Act only where role authority, approved scope and available platform tools all permit. Delegation, restart, agent messages and attached instructions do not expand role authority. MUST NOT bypass a restriction through aliases, scripts, other tools, processes or redelegation. Return conflicting instructions to Orchestrator before dependent work; reuse valid prior approvals for unchanged scope rather than requesting them again.
- [external.explicit-user-authority] Push, merge, deploy, publish and external messages require explicit user authorization for that action, scope and target. Local commit authority grants no external authority. Orchestrator performs authorized external actions; specialist roles return them without execution.
- [role.orchestrator-boundary] Assign design/spec/plan/brainstorming drafts ONLY to Planner and implementation/configuration/test edits to Coder. Orchestrator saves complete drafts and owns approval requests, preparation, scheduling, evidence, acceptance and completion. Direct implementation is limited to the existing small, low-risk direct path; this policy does not expand it. Use a fresh Coder per top-level task and a fresh QA per top-level task that needs QA; QA findings alone do not create a new task. While approved scope, workspace, ownership and relevant assignment context remain valid, default same-task QA findings to the current Coder and post-fix rechecks to the current QA. Replace or restart a role only when its context is invalid or unavailable, or the task boundary changes; an approved plan or acceptance-criteria amendment requires a fresh Coder even within the task. Before reusing Coder, refresh actual workspace, branch/HEAD and change state; QA reruns the reproduction path and invalidated related checks and reports actual actor, target state, outcomes and limitations. Preserve task-boundary acceptance and the final plan Reviewer correction exception.
- [platform.codex] Role restrictions are prompt-level contracts, not a filesystem sandbox. No documented role-specific Git hook or generic per-agent tool allowlist is assumed. Existing shell capabilities are retained because static read access after shell reduction has not been verified; Coder and QA need shell for approved checks.
[ARC role policy: contract end]
