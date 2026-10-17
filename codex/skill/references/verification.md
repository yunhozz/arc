# Verification contract

Orchestrator reads before verification design, QA/Reviewer assignment, correction rechecks, or UI acceptance checks. QA and
Reviewer contracts are in their profiles; they read this file only for sections the brief explicitly cites.
Visual companion design discussion is distinct from QA UI acceptance.

## Risk-scaled execution

SKILL.md Risk-scaled execution holds the risk table, risk definitions, evidence-reuse rule, and role order,
including Reviewer timing. Product/test edits belong exclusively to Coder except under the Orchestrator direct path; Orchestrator may inspect/run checks but
routes code corrections to Coder. Determine the minimum
flow from risk and any specific instruction or approved commitment, and record which requirements each check or review
satisfies. For small, low-risk work with clear scope and acceptance evidence and no such requirement, Orchestrator's focused
checks suffice; do not call QA or Reviewer automatically. Significant/high-risk work requires independent review of the
full change at the final relevant state after the required QA/focused checks and any QA recheck.

Many known metadata files are not significant solely because there are many, and a one-file permission or data-loss
rule may be. A vague request to delete unnecessary files does not establish low risk; reclassify when installer,
manifest, or other contracts are affected. For a verified ignore-pattern or metadata cleanup, confirm the targets are
unused, required project materials are unaffected, ignore patterns cover only intended paths, and the diff matches the
approved scope; Orchestrator's focused checks then suffice without automatically calling QA or Reviewer. An environment failure
is distinct from a code failure; report the exact limitation and any remaining evidence gap to Orchestrator.

Use additional Planner/Scouter only for unresolved planning/discovery questions. Reviewer covers substantial changes and
correctness, factual, security, data, or interface risks. Orchestrator may use Planner/Scouter/Reviewer when justified and assigns
all Coder/QA work. Specialists report unresolved questions to Orchestrator, who assigns support only when needed.

QA runs applicable existing functional/test checks, or approved structural/consistency checks for policy and
configuration changes. Reviewer reads the assigned diff/source for correctness, factual accuracy, and security. After a
behavior fix QA reruns affected checks, and Reviewer rechecks only when warranted. Reuse a Reviewer only when
independent of the work and self-review and when evidence meets required scope and freshness. Resolve or explicitly disposition findings and confirm
acceptance evidence before completion; claim checks only with verified output.

## Task acceptance and final plan acceptance

Task-local acceptance is distinct from overall final plan verification and acceptance. Orchestrator connects each task's
acceptance criteria to actual evidence, currently required checks and findings before accepting it; checkbox
completion, a Coder report or passing commands alone do not establish acceptance.

Task acceptance and its focused commit require only the task's risk-scaled evidence: a FRESH QA instance per task that needs QA (same-task rechecks may reuse), or Orchestrator focused checks for small, low-risk tasks;
Reviewer timing and task-boundary gates follow SKILL.md Risk-scaled execution. For an independently acceptable task,
do not delay its acceptance/commit solely for later final plan verification. Currently required task checks must not
be deferred to final verification to accept early. State the scope and timing of final-only integration criteria in
the plan; with a plan, the required final whole-change review is final plan verification.

A task commit record does not mark unperformed final verification complete. Orchestrator still decides final plan acceptance
using final QA/Reviewer/integration evidence and findings, preserving unverified scope and explicit dispositions.
Valid evidence may cover both task and plan requirements only under the existing scope/state/independence/freshness/flow
rules. If final findings affect already committed work, Orchestrator manages a follow-up task, applicable planning/approvals,
correction and QA recheck before a new focused commit; Reviewer then rechecks only the affected findings when
warranted. Do not automatically amend/reset or duplicate the original task commit.

### UI browser acceptance checks

Only when assigned UI acceptance criteria and the brief supplies the workspace, existing launch command or URL,
required account and test-data scope, and permitted interactions, QA may use the existing approved test environment
to launch the app or open the URL with available approved browser tools. Follow tool instructions and any applicable
installed browser skill. This permission does not authorize source/document/test/configuration editing, installing
dependencies, or changing environment configuration. Report missing prerequisites to Orchestrator and leave affected criteria
unverified. For each criterion record the command or URL, test state and viewport (or not applicable), interaction steps,
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
blocked gaps as unverified; omit no criteria. PASS, if used, means only run status and cannot replace criterion verdicts.
Structural checks prove structural criteria only; they do not prove actual behavior, installation, or live agent runtime
compliance.

For QA execution failure or an unmet criterion, Orchestrator assigns Coder correction and obtains a QA recheck before Reviewer.
Do not enter Reviewer until QA reports the finding as resolved, unresolved, or unverified with evidence; unresolved
execution failures or unmet criteria require correction and another QA recheck before that stage. QA rechecks the defect
reproduction path and related checks invalidated by the fix. Environment blocks, missing checks, and out-of-scope criteria
are evidence gaps, not presumed code defects; Orchestrator handles those gaps under the existing disposition policy without
substituting Reviewer review for QA evidence.

For an acceptance-linked behavior finding, Reviewer reports the criterion, expected behavior, observed problem, related
source, reproduction conditions and steps, and evidence to Orchestrator, distinguishing source-inferred reproduction from
execution-observed results without running QA tests. Orchestrator routes it to Coder correction and QA post-fix recheck.
For significant/high-risk work, Reviewer then reviews the final full change once after QA recheck (the same Reviewer rechecks the same scope after a fix), or, for already committed
plan work, rechecks only the affected findings when warranted. Reviewer continues handling
structure, design, factual, and security findings that execution checks cannot settle; observable security/interface
issues may require both QA verification and Reviewer source review.

Orchestrator accepts using criterion verdicts, findings, recheck evidence, and remaining gaps, rather than an overall run result.
Explicit disposition does not convert unverified to proven; completion reports preserve remaining unverified scope.
For low-risk work without a QA agent, Orchestrator's focused checks likewise
connect each criterion to evidence.

