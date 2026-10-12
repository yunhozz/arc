# Verification contract

CEO reads before verification design, QA/Reviewer assignment, correction rechecks, or UI acceptance checks. QA and
Reviewer contracts are in their profiles; they read this file only for sections the brief explicitly cites.
Visual companion design discussion is distinct from QA UI acceptance.

## Risk-scaled execution

CEO identifies affected behavior, risk, and smallest meaningful verification. Product/test edits belong exclusively to
Coder with assigned file ownership; CEO may inspect/run checks but routes code corrections to Coder.

Determine the minimum flow from risk requirements and any specific applicable instruction or approved commitment.
The risk table is the baseline; do not add automatic per-task checkpoints. A check or review may satisfy overlapping
requirements only when its scope, evidence, relevant state, independence, required freshness, and position in the flow
satisfy each one. Relevant changes, failures, or missing/conflicting evidence invalidate reuse for the affected
requirement. Record which requirements each check or review satisfies.

| Risk                  | Minimum flow |
|-----------------------|--------------|
| Small, low risk       | Coder → CEO's focused checks → acceptance |
| Ordinary behavior     | Coder → independent QA → acceptance |
| Significant/high risk | Coder → QA → independent Reviewer of the full change → acceptance |

For small, low-risk work, CEO's focused checks are sufficient when scope and acceptance evidence are clear and no
specific instruction or approved commitment requires more; do not call QA or Reviewer automatically. Ordinary behavior
requires independent QA. Significant/high-risk work requires QA followed by independent review of the full change at the
final relevant state. CEO accepts only after applicable checks, findings, and evidence gaps are resolved or explicitly
dispositioned.

Small, low-risk work is narrow, understood, readily reversible, and verifiable through focused checks. Ordinary behavior
is a behavior change that does not meet all small, low-risk conditions and has no significant-risk trigger. Significant
risk includes material changes to shared role or behavior contracts, shared state, lifecycle or integration order,
security or permissions, data loss or migration, public interfaces, or costly installation, deployment, or rollback.
Substantial behavior or contract changes are significant regardless of file count; numerous known metadata files are not
significant solely because there are many, and a one-file permission or data-loss rule may be. If scope or risk is
unclear, do not use the low-risk flow: investigate the uncertainty or apply the higher verification flow.
An environment failure is distinct from a code failure; it does not by itself change design depth or waive a required
check. Report the exact limitation and any remaining evidence gap to CEO.

For a verified `.gitignore` and IDE/macOS metadata cleanup, confirm the listed targets are unused, required project
materials are unaffected, ignore patterns cover only intended paths, and the diff matches the approved scope. CEO can
then complete focused checks without automatically calling QA or Reviewer. A vague request to delete unnecessary files
does not establish low risk; reclassify when installer, manifest, or other contracts are affected.

Use additional Planner/Scouter only for unresolved planning/discovery questions. Reviewer covers substantial changes and
correctness, factual, security, data, or interface risks. CEO may use Planner/Scouter/Reviewer when justified and assigns
all Coder/QA work. Specialists report unresolved questions to CEO, who assigns support only when needed.

QA independently runs applicable existing functional/test checks, or approved structural/consistency checks for policy and
configuration changes, without editing source, documents, tests, or configuration. Reviewer reads the assigned
diff/source for correctness, factual accuracy, and security; for significant/high-risk work, review the full change after
QA at the final relevant state. Reviewer does no planning, delegation, QA, editing, implementation, or completion
decision. CEO routes actionable development findings to Coder; after a behavior fix QA reruns affected checks, and Reviewer
rechecks only when warranted. Reuse verified inspections/checks/reviews only when their scope, evidence, relevant
state, independence, required freshness, and position in the flow still satisfy every requirement they cover. Reuse a
Reviewer only when independent of the work and self-review and when evidence meets required scope and freshness; do not
require a new Reviewer for each task unless a separate instruction requires it. For significant work, the
whole-change review must follow QA and cover the final relevant state. Relevant changes, failures, or missing/conflicting
evidence invalidate reuse for affected requirements. Record which
requirements each check or review satisfies. Resolve or explicitly disposition findings and confirm acceptance
evidence before completion; claim checks only with verified output.

## Task acceptance and final plan acceptance

Task-local acceptance is distinct from overall final plan verification and acceptance. CEO connects each task's
acceptance criteria to actual evidence, currently required checks/reviews and findings before accepting it; checkbox
completion, a Coder report or passing commands alone do not establish acceptance. Accepted approved top-level tasks
receive their focused local commit under core policy without additional user commit approval.

Do not add QA or Reviewer calls solely because a task boundary exists. Preserve existing risk requirements, risky
dependency checks and specifically approved obligations. For an independently acceptable task, do not delay its
acceptance/commit solely for later final plan verification. If the approved plan names a review as a task acceptance
prerequisite, wait for that review before accepting and committing the task. Currently required task checks must not be
deferred to final verification to accept early. State the scope and timing of final-only integration criteria in the plan.
Significant work retains its required final whole-change review after QA at the final relevant state.

A task commit record does not mark unperformed final verification complete. CEO still decides final plan acceptance
using final QA/Reviewer/integration evidence and findings, preserving unverified scope and explicit dispositions.
Valid evidence may cover both task and plan requirements only under the existing scope/state/independence/freshness/flow
rules. If final findings affect already committed work, CEO manages a follow-up task, applicable planning/approvals,
correction and required rechecks/review before a new focused commit; do not automatically amend/reset or duplicate the
original task commit. Failed required checks and unmet criteria cannot be waived to commit.

### UI browser acceptance checks

Only when assigned UI acceptance criteria and the brief supplies the workspace, existing launch command or URL,
required account and test-data scope, and permitted interactions, QA may use the existing approved test environment
to launch the app or open the URL with available approved browser tools. Follow tool instructions and any applicable
installed browser skill. This permission does not authorize source/document/test/configuration editing, installing
dependencies, or changing environment configuration. Report missing prerequisites to CEO and leave affected criteria
unverified. For each criterion record the command or URL, test state and viewport (or not applicable), interaction steps,
expected and observed results, and accessible evidence. App startup, page load, and static checks alone do not prove
complete UI behavior. For unavailable test environment or browser tools, report the exact limitation and affected
unverified criteria. Clean up only QA-created processes and sessions; preserve existing shared services and sessions.

### Criterion evidence and finding handoff

QA reports every acceptance criterion from the brief by identifier, or original wording when no identifier exists.
Each criterion records method and scope, run status, accessible evidence, criterion verdict, and unverified reason
and remaining scope. Run status is passed, failed, not run, or environment blocked; criterion verdict is proven,
unmet, or unverified. Passing a check alone does not prove a criterion: evidence must connect its conditions and
expected result to actual observations. Preserve partial confirmation and out-of-scope, missing-check, or environment
blocked gaps as unverified; omit no criteria. PASS, if used, means only run status and cannot replace criterion verdicts.
Structural checks prove structural criteria only; they do not prove actual behavior, installation, or live agent runtime
compliance.

For QA execution failure or an unmet criterion, CEO assigns Coder correction and obtains a QA recheck before Reviewer.
Do not enter Reviewer until QA reports the finding as resolved, unresolved, or unverified with evidence; unresolved
execution failures or unmet criteria require correction and another QA recheck before that stage. QA rechecks the defect
reproduction path and related checks invalidated by the fix. Environment blocks, missing checks, and out-of-scope criteria
are evidence gaps, not presumed code defects; CEO handles those gaps under the existing disposition policy without
substituting Reviewer review for QA evidence.

For an acceptance-linked behavior finding, Reviewer reports the criterion, expected behavior, observed problem, related
source, reproduction conditions and steps, and evidence to CEO, distinguishing source-inferred reproduction from
execution-observed results without running QA tests. CEO routes it to Coder correction and QA post-fix recheck.
For significant/high-risk work, Reviewer then reviews the final full change after QA recheck. Reviewer continues handling
structure, design, factual, and security findings that execution checks cannot settle; observable security/interface
issues may require both QA verification and Reviewer source review.

CEO accepts using criterion verdicts, findings, recheck evidence, and remaining gaps, rather than an overall run result.
Explicit disposition does not convert unverified to proven; completion reports preserve remaining unverified scope.
For low-risk work without a QA agent, CEO's focused checks likewise connect each criterion to evidence and preserve
unverified scope. Existing risk tiers and role-call requirements remain in force.

