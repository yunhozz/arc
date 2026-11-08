# Shared Role Reporting and Minimum Flow Task Brief

## Goal and criteria

Align the common Planner/Reviewer/Scout reporting target with the invoking owner and specify a minimum verification flow that retains both risk-level and Native/Fresh-agent checkpoints.
Do not transfer owner-specific authority, approval, or completion obligations. Clarify when a Native full review can conditionally satisfy overlapping requirements and when Fresh-agent requires a separate fresh final review.

## Scope and decisions

- Payload to modify: `skill/SKILL.md`, `agents/arc-planner.toml`, `agents/arc-reviewer.toml`, `agents/arc-scout.toml`,
  `agents/arc-lead.toml`, `MANIFEST.sha256`.
- Exclude README, other profiles, dependency, installer, and models. Preserve user-designated protected areas byte-for-byte from the starting state.
- CEO relayed the user's approval of the short design and Native mode. Plan approval had not yet been given.
- This clarifies policy documents and does not modify executable code or tests. Only TOML parsing, document examples and diff checks, and installer `--check` are planned. Tests and dependency installation are prohibited. Do not claim TDD.
- One Coder task: a proportionate plan is needed because policy → profiles → manifest have dependent consistency requirements. Follow with QA → fresh full Reviewer → Lead acceptance.

## Paths and evidence

- Planning workspace: `/Users/yunho/Desktop/project/arc`.
- Plan: `/Users/yunho/Desktop/project/arc/docs/superpowers/plans/2026-10-04-owner-reporting-minimum-flow.md`.
- Apply the installed brainstorming/writing-plans/using-git-worktrees guidance. Planner returned a read-only draft, which Lead integrated in Korean.
- At this point, `git-dir`/`git-common-dir` were `.git`, there was no superproject output, and the branch was `master`. Native `list_artifacts` returned an empty list.
  This was a normal checkout; the current workspace preference and consent were undetermined.
- Do not use an in-place record from an earlier brief as approval for this work. Obtain workspace consent under using-git-worktrees Step 0 before implementation.
- No payload changes had been made. Structural verification and tests had not yet been run.

## Exact next step

CEO relayed the user's approval of the plan and a new managed worktree. Retain Native mode. Native create_worktree created and registered
`/Users/yunho/.codex/worktrees/owner-reporting-flow/arc` from `master`. Its git-dir and common-dir differ, and there was no superproject output;
the starting state was clean. `python3 install.py --check` exited 0, with 22 manifest entries and preflight passing. The baseline is
`/private/tmp/owner-reporting-flow-baseline.json`. Preserve the plan and brief at the original path; do not assume they are copied automatically.
No tests or dependency installation were performed.

Proceed only with the six files in the actual workspace above, in Coder → QA → fresh full Reviewer order. The protected areas are the entire first introductory paragraph of the baseline skill, the entire Secretary
entry under Ownership, and the entire Secretary profile. Verify preservation of the other payload, models, and dependency against baseline hashes as well.

## TDD constraint and pause

Coder read the installed `/Users/yunho/.agents/skills/test-driven-development/SKILL.md` and stopped before editing.
That skill applies Always to behavior changes and requires human permission even for a configuration exception.
This change affects the behavioral contract of agent instructions and is not excluded solely because it is documentation. The approved plan prohibits running tests and permits only TOML, manual policy examples, diff, and installer checks.
The requirement to write a failing-first test and observe failure → make the minimal change → pass the relevant test and suite cannot be fulfilled under the current constraints.

An explicit TDD exception limited to the six files' behavioral instruction/configuration changes, replacing TDD with the structural and manual checks, QA, and fresh full review above, or authorization for a test-first plan and execution that verifies actual behavior is required.
Internal judgment does not replace human approval. Structural checks do not prove actual agent compliance and cannot support a failing-first claim.
Coder and Lead confirmed that no edits had been made and the worktree was clean. The next step is for CEO to relay this exact constraint and alternatives to the user for a decision.

## Human decision and resumption

CEO relayed the user's direct decision, “approve the TDD exception limited to six files” (translated). The exception applies only to the two approved clarifications in `skill/SKILL.md`, `agents/arc-planner.toml`,
`agents/arc-reviewer.toml`, `agents/arc-scout.toml`, `agents/arc-lead.toml`, and `MANIFEST.sha256`.
Perform TOML parsing, policy examples, protected-area and diff checks, `python3 install.py --check`, independent QA, and a fresh full Reviewer review.
Do not run failing-first tests or the test suite and do not claim TDD. Do not expand or change the implementation scope, protected areas, or TDD requirements for future work.
Resume Coder in the existing managed worktree.

## Implementation result and next gate

Coder completed the six assigned files, synchronizing the common reporting path, minimum verification flow, review overlap conditions, and separate Fresh-agent final review. Coder corrected the remaining Planner path-reporting sentence found by Lead to use the invoking
owner. Coder reported: four TOML files parsed, installer `--check` exited 0 with 22 manifest entries and preflight passing, and diff whitespace passed;
protected areas and the remaining 35 baseline files were preserved. No tests, installation, or commits were performed. Lead's direct diff whitespace check also passed.
Independent QA was then checking structure, policy examples, and baseline protection in the same workspace and scope; a fresh full Reviewer remained required afterward.

Independent QA completed with no findings. Installer `--check` exited 0 (22 manifest entries and preflight); diff check exited 0; four TOML files parsed and protected-area/35 non-target hash comparisons exited
0; only the five designated manifest digest lines changed, with order and all other lines preserved; and six risk/mode combinations plus owner/development authority/overlap conditions and a fresh single-task case passed.
QA checked without tests, installation, or file edits. A fresh full Reviewer was assigned to the same six files and was reviewing the Native final gate.
The Native review and risk-level review requirements can be recorded together in this one review when full scope, independence, freshness, timing after QA, and state-preservation conditions are met.

## Acceptance complete

A fresh independent Reviewer examined the full diff of the six assigned files after QA and returned no substantive correctness, factual, or security findings or unresolved issues.
Because the change state and full scope, independence, freshness, and timing conditions were retained, this review satisfies both the Native final checkpoint and the applicable risk-level review requirement.
Lead's final hash comparison confirmed that exactly the six approved files changed and the other 35 files were identical. Final `git diff --check` exited 0, and git status showed only the six files.

Lead acceptance is complete. Evidence: `/private/tmp/owner-reporting-flow-acceptance.json`, baseline
`/private/tmp/owner-reporting-flow-baseline.json`, and the QA/Reviewer results for the task. The modifications remain in managed worktree
`/Users/yunho/.codex/worktrees/owner-reporting-flow/arc`, preserving linked artifact. The plan and brief remain in the original checkout.
No tests, failing-first work, suite, runtime compliance verification, installation, commit, or merge was performed, and no such claim is made. The next step is to report the results and paths to CEO.
