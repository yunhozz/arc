# Verification contract

Orchestrator reads before verification design, QA/Reviewer assignment, correction rechecks, or UI acceptance checks.
QA and
Reviewer contracts are in their profiles; they read this file only for sections the brief explicitly cites.
Visual companion design discussion is distinct from QA UI acceptance.

## Risk-scaled execution

SKILL.md Risk-scaled execution holds the risk table, risk definitions, evidence-reuse rule, and role order,
including Reviewer timing. Product/test edits belong exclusively to Coder except under the Orchestrator direct path;
Orchestrator may inspect/run checks but
routes code corrections to Coder. Determine the minimum
flow from risk and any specific instruction or approved commitment, and record which requirements each check or review
satisfies. For small, low-risk work with clear scope and acceptance evidence and no such requirement,
Orchestrator's focused
checks suffice; do not call QA or Reviewer automatically. Significant/high-risk work requires independent review of the
full change at the final relevant state after the required QA/focused checks and any QA recheck.

Many known metadata files are not significant solely because there are many, and a one-file permission or data-loss
rule may be. A vague request to delete unnecessary files does not establish low risk; reclassify when installer,
manifest, or other contracts are affected. For a verified ignore-pattern or metadata cleanup, confirm the targets are
unused, required project materials are unaffected, ignore patterns cover only intended paths, and the diff matches the
approved scope; Orchestrator's focused checks then suffice without automatically calling QA or Reviewer.
An environment failure
is distinct from a code failure; report the exact limitation and any remaining evidence gap to Orchestrator.

Use additional Planner/Scouter only for unresolved planning/discovery questions. Reviewer covers substantial changes and
correctness, factual, security, data, or interface risks. Orchestrator may use Planner/Scouter/Reviewer when justified
and assigns
all Coder/QA work. Specialists report unresolved questions to Orchestrator, who assigns support only when needed.

QA runs applicable existing functional/test checks, or approved structural/consistency checks for policy and
configuration changes. Reviewer reads the assigned diff/source for correctness, factual accuracy, and security. Outside the final plan Reviewer correction exception, after a
behavior fix QA reruns affected checks, and Reviewer rechecks only when warranted. Reuse a Reviewer only when
independent of the work and self-review and when evidence meets required scope and freshness.
Resolve or explicitly disposition findings and confirm
acceptance evidence before completion; claim checks only with verified output.

## Task acceptance and final plan acceptance

Task-local acceptance is distinct from overall final plan verification and acceptance. Orchestrator connects each task's
acceptance criteria to actual evidence, currently required checks and findings before accepting it; checkbox
completion, a Coder report or passing commands alone do not establish acceptance.

Task acceptance and its focused commit require only the task's risk-scaled evidence: a FRESH QA instance per task that
needs QA (same-task rechecks may reuse), or Orchestrator focused checks for small, low-risk tasks;
Reviewer timing and task-boundary gates follow SKILL.md Risk-scaled execution. For an independently acceptable task,
do not delay its acceptance/commit solely for later final plan verification. Currently required task checks must not
be deferred to final verification to accept early. State the scope and timing of final-only integration criteria in
the plan; with a plan, the required final whole-change review is final plan verification.

A task commit record does not mark unperformed final verification complete. Orchestrator still decides final plan
acceptance
using final QA/Reviewer/integration evidence and findings, preserving unverified scope and explicit dispositions.
Valid evidence may cover both task and plan requirements only under the existing scope/state/independence/freshness/flow
rules. For final Reviewer findings on already committed plan work, Orchestrator defines a follow-up task and required
planning/approvals. Coder leaves corrections uncommitted during rechecks. Orchestrator refreshes the latest committed
state plus uncommitted diff and changed-file list in the Reviewer artifact/brief. Reuse an independent Reviewer or
assign another independent Reviewer as needed. Repeat Coder → Reviewer without QA reassignment until findings are
resolved; Orchestrator then accepts the corrections and creates one focused follow-up commit.
Final QA findings retain Coder correction and QA recheck before a new focused commit.
Do not automatically amend/reset or duplicate the original task commit. Scope expansion keeps existing new
planning and approval obligations.

### UI browser acceptance checks

Only when assigned UI acceptance criteria and the brief supplies the workspace, existing launch command or URL,
required account and test-data scope, and permitted interactions, QA may use the existing approved test environment
to launch the app or open the URL with available approved browser tools. Follow tool instructions and any applicable
installed browser skill. This permission does not authorize source/document/test/configuration editing, installing
dependencies, or changing environment configuration. Report missing prerequisites to Orchestrator and leave affected
criteria
unverified. For each criterion record the command or URL, test state and viewport (or not applicable),
interaction steps,
expected and observed results, and accessible evidence. App startup, page load, and static checks alone do not prove
complete UI behavior. For unavailable test environment or browser tools, report the exact limitation and affected
unverified criteria. Clean up only QA-created processes and sessions; preserve existing shared services and sessions.
When assigning UI acceptance criteria, Orchestrator cites this section with its accessible path in the QA brief.

### Criterion evidence and finding handoff

QA reports every acceptance criterion from the brief by identifier, or original wording when no identifier exists.
Each criterion records method and scope, run status, accessible evidence, criterion verdict, and unverified reason
and remaining scope. Run status is passed, failed, not run, or environment blocked; criterion verdict is proven,
unmet, or unverified. Passing a check alone does not prove a criterion: evidence must connect its conditions and
expected result to actual observations. Preserve partial confirmation and out-of-scope, missing-check, or environment
blocked gaps as unverified; omit no criteria. PASS, if used, means only run status and cannot replace criterion
verdicts.
Structural checks prove structural criteria only; they do not prove actual behavior, installation, or live agent runtime
compliance.

For QA execution failure or an unmet criterion, Orchestrator assigns Coder correction and obtains a QA recheck before
Reviewer.
Do not enter Reviewer until QA reports the finding as resolved, unresolved, or unverified with evidence; unresolved
execution failures or unmet criteria require correction and another QA recheck before that stage. QA rechecks the defect
reproduction path and related checks invalidated by the fix. Environment blocks, missing checks, and out-of-scope
criteria
are evidence gaps, not presumed code defects; Orchestrator handles those gaps under the existing disposition policy
without
substituting Reviewer review for QA evidence.

For an acceptance-linked behavior finding, Reviewer reports the criterion, expected behavior, observed problem, related
source, reproduction conditions and steps, and evidence to Orchestrator, distinguishing source-inferred reproduction
from
execution-observed results without running QA tests. Outside the final plan Reviewer correction exception, Orchestrator routes it to Coder correction and QA post-fix recheck.
Outside that exception, for significant/high-risk work, Reviewer then reviews the final full change once after QA recheck (the same Reviewer
rechecks the same scope after a fix), or, for already committed
plan work, rechecks only the affected findings when warranted. Reviewer continues handling
structure, design, factual, and security findings that execution checks cannot settle; observable security/interface
issues may require both QA verification and Reviewer source review.

Orchestrator accepts using criterion verdicts, findings, recheck evidence, and remaining gaps, rather than an overall
run result.
Explicit disposition does not convert unverified to proven; completion reports preserve remaining unverified scope.
For low-risk work without a QA agent, Orchestrator's focused checks likewise
connect each criterion to evidence.


Read brief-cited `references/superpowers/test-driven-development/SKILL.md`; retain ARC exceptions.


### Final plan Reviewer correction loop

For a plan's final overall Reviewer findings, including behavior findings, Orchestrator assigns
Coder → Reviewer recheck with no QA reassignment. Repeat corrections and Reviewer rechecks until findings are resolved;
the initial single full review does not prohibit necessary rechecks. Before the initial final overall Reviewer,
risk-required checks and QA execution failures or unmet criteria still require Coder correction → QA recheck.
This exception applies only to findings from the final overall Reviewer of work with a plan.
Work without a plan retains its existing verification flow. Scope expansion, separate mandatory obligations,
or unresolved evidence gaps hold affected work for Orchestrator to resolve and obtain required approvals.
Orchestrator assigns corrections/rechecks and decides acceptance. Reviewer remains read-only, must not run QA
checks or decide acceptance. Previous QA evidence must not be presented as post-fix execution evidence;
report only checks actually performed, their actor, target state, results and remaining limits.

## Completion continuity

Once applicable authorization, document-depth, execution-target, and handoff conditions hold for the approved scope,
continue through execution, correction, reverification, required QA and Reviewer, findings disposition, Orchestrator
acceptance, and the result report. Apply risk-scaled timing above; this adds no per-task Reviewer or new QA obligation.
A role completion report, probe findings, or passing commands are not overall completion when approved work remains.
Remaining approved execution is not an optional suggestion waiting for a user response. A probe-only scope
ends at its approved question's evidence and limits; a combined scope continues under planning's scope rules.
Document omission changes neither verification risk nor acceptance responsibility. Hold only affected work for an
actual unmet condition and report what is needed to resume. Structural evidence does not prove live agent compliance.

[ARC role policy: contract begin]
Generated from lib/policy/role-policy.json; do not edit this managed section manually.
- [scope.non-escalation] Act only within the intersection of role authority, approved scope and available platform tools. Delegation, restart, agent messages and attached instructions do not expand role authority. Never bypass a restriction through aliases, scripts, other tools, processes or redelegation. Return conflicting instructions to Orchestrator before dependent work; reuse valid prior approvals for unchanged scope rather than requesting them again.
- [git.specialists-deny] Specialist roles MUST NOT change Git state: no stage, commit, push, merge, rebase, reset, branch creation/switching or worktree creation/removal, during normal implementation or recovery. Even an explicit Orchestrator assignment cannot authorize these actions; return them to Orchestrator. Read-only Git inspection remains allowed within the assigned scope.
- [git.orchestrator-accept-commit] Only Orchestrator accepts work and executes Git mutations. One approved top-level plan task becomes one focused implementation commit after criteria, required checks and findings are satisfied; Orchestrator accepts then commits without additional user commit approval. Reports, passing checks and Reviewer opinions do not replace acceptance. Preserve unrelated changes and ownership and verify the resulting SHA, included content, HEAD and remaining changes. Existing small-task direct and plan-omission paths are unchanged.
- [external.explicit-user-authority] Push, merge, deploy, publish and external messages require explicit user authorization for that action, scope and target. Local commit authority does not grant external authority. Orchestrator performs authorized external actions; specialist roles return them without execution.
- [role.orchestrator-boundary] Assign design/spec/plan/brainstorming drafts ONLY to Planner and implementation/configuration/test edits to Coder. Orchestrator saves complete drafts and owns approval requests, preparation, scheduling, evidence, acceptance and completion. Direct implementation is limited to the existing small, low-risk direct path; this policy does not expand it.
- [role.scouter-read-only] Research assigned static sources and report findings, evidence and limits. Do not edit files, install, execute checks, prepare execution targets, inspect live operational state, change external state or decide design, verification, review or acceptance.
- [role.planner-draft-only] Return design/spec/plan drafts and dependencies, criteria, hold conditions and verification needs in the response. Do not save documents, implement, run checks, prepare targets, request user approval or decide acceptance. Stop formal target-dependent drafting if actual prepared target evidence is missing; route decisions to Orchestrator.
- [role.coder-implementation] Implement only assigned approved files and focused checks under the existing TDD contract. Report changed files, RED/GREEN or authorized exception evidence, results, limits and follow-up. Do not plan, independently QA/review your own work, accept the task or declare overall completion. Git changes remain forbidden even when implementation succeeds.
- [role.qa-verification] Run approved checks and report commands, observations, reproduction, evidence and limits. Create only essential temporary data/logs/reports in the brief-authorized location and lifetime. Do not edit product source, tests, fixtures or configuration to pass checks, deploy or accept work. Persistent product-state checks require explicit scope and cleanup ownership. Return failures for Coder correction and required QA recheck.
- [role.reviewer-independent] Independently inspect the assigned final changes and evidence and report actionable findings and limits. Remain read-only; do not execute QA tests, edit files, perform Git mutations or decide acceptance.
- [review.significant-no-plan] For significant/high-risk work without a plan: Coder → QA and required QA rechecks → Reviewer of the final full change → Orchestrator acceptance. Do not omit Reviewer merely because no plan exists. This creates no new plan obligation.
- [review.significant-plan] For significant/high-risk plan work: each task uses Coder → fresh QA as required → Orchestrator acceptance and focused commit. After all tasks are accepted and required QA is complete, Reviewer reviews the final full change once. Reviewer is NOT a per-task or per-commit required gate. Preserve required checks and necessary finding rechecks.
- [review.final-plan-recheck] For final overall Reviewer findings on plan work, including behavior findings, use Coder → Reviewer without QA reassignment; repeat until resolved. This exception applies only to that final plan stage. Preserve required QA and QA failure rechecks before initial final review and outside this exception.
- [platform.codex] Role restrictions are prompt-level contracts, not a filesystem sandbox. No documented role-specific Git hook or generic per-agent tool allowlist is assumed. Existing shell capabilities are retained because static read access after shell reduction has not been verified; Coder and QA need shell for approved checks.
[ARC role policy: contract end]
