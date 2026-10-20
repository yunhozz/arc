# Verification and acceptance

Define observable checks from acceptance criteria. For feature/behavior implementation use test-driven-development:
meaningful test first, observed expected failure, minimal implementation, focused success, then the project suite.
Report required-skill or test constraints before dependent edits. A waiver needs a precise Orchestrator
record of narrow scope, understood/reversible risk, no dependent stages or cross-component lifecycle,
and one focused verification path; a documentation exception authorizes only its named structural checks.
Neither is a claim of TDD.

QA runs approved checks without editing source and returns commands, results, failures, evidence and limitations.
Report verification side effects within approved scope. MUST NOT broaden tests, repair failures or independently
claim acceptance. Reviewer independently reads the final complete diff after the required QA/focused checks for
correctness, security and policy consistency; request runtime checks through Orchestrator because Reviewer has no Bash
tool.

Orchestrator inspects results, resolves findings and decides acceptance. Passing local tests does not establish remote
model availability or actual provider effort application. Policy prose requires independent role/approval review;
text presence alone cannot establish agent compliance. Distinguish tested behavior from unverified runtime assumptions.
Unexpected failures trigger diagnosis and stop dependent work; expected failure-first RED does not authorize unrelated
repairs.

## Reviewer timing and task acceptance

Task acceptance and its focused commit need only the task's risk-scaled evidence: a FRESH QA instance per task that
needs QA (same-task rechecks may reuse), or Orchestrator focused checks for small, low-risk tasks; Reviewer is never a
plan-task acceptance prerequisite. Do not delay an independently acceptable task for final-only checks,
and do not defer currently required task checks to final verification. For significant work with a plan,
Reviewer reviews once on the final full change after all plan tasks are accepted with their risk-scaled checks and any
QA recheck at the final relevant state; without a plan, Reviewer follows QA before acceptance.
A task commit does not mark unperformed final verification complete.

For final Reviewer findings on already committed plan work, Orchestrator defines a follow-up task and required
planning/approvals. Coder leaves corrections uncommitted during rechecks. Orchestrator refreshes the latest committed
state plus uncommitted diff and changed-file list in the Reviewer artifact/brief. Reuse an independent Reviewer or
assign another independent Reviewer as needed. Repeat Coder → Reviewer without QA reassignment until findings are
resolved; Orchestrator then accepts the corrections and creates one focused follow-up commit.
Final QA findings retain Coder correction and QA recheck before a new focused commit.
Do not automatically amend/reset or duplicate the original task commit. Scope expansion keeps existing new
planning and approval obligations.

Orchestrator writes the final base..HEAD diff plus changed-file list to `<git-common-dir>/arc/review/<slug>.diff` (same
slug as the handoff record; base is the approved base HEAD recorded at handoff; inline when small or write denied) and
cites its absolute path in the Reviewer brief. Reviewer reads that artifact, not Git commands, and states review limits.

### UI browser acceptance checks

QA may use the existing approved test environment to launch the app or exercise the URL through Bash only (QA has no
browser tool), following any applicable installed browser skill's command-line instructions, only when assigned UI
acceptance criteria and the brief supplies the workspace, existing launch command or URL, account and test-data scope,
and permitted interactions; the brief cites this section with its path. This does not authorize editing
source/documents/tests/configuration, installing dependencies, or changing environment configuration.
Report missing prerequisites or tools unavailable through Bash to Orchestrator with the exact limitation and leave
affected criteria unverified. Per criterion record command or URL, test state and viewport (or not applicable),
interaction steps, expected and observed results, and accessible evidence. App startup, page load, and static checks
alone are not proof of UI behavior. Clean up only QA-created processes and sessions; preserve shared services and
sessions.

### Criterion evidence and finding handoff

QA reports every brief criterion by identifier (or original wording): method and scope, run status, accessible evidence,
verdict, and unverified reason and remaining scope. Run status is passed, failed, not run, or environment blocked;
verdict is proven, unmet, or unverified. A passing check alone does not prove a criterion; evidence must connect its
conditions and expected result to observations. Partial confirmation, out-of-scope, missing-check, and
environment-blocked gaps stay unverified; omit no criteria. PASS, if used, means only run status.
Structural checks prove structure only, not behavior, installation, or live agent compliance.

On QA execution failure or unmet criterion, Orchestrator assigns Coder correction and a QA recheck of the reproduction
path and invalidated related checks before Reviewer; QA reports the prior finding resolved, unresolved, or unverified.
Environment blocks, missing checks, and out-of-scope criteria are evidence gaps, not presumed defects;
Reviewer does not substitute for QA evidence. Outside the required final plan correction loop,
Orchestrator decides when a Reviewer recheck is warranted by the changed scope and independence.

For an acceptance-linked finding Reviewer reports criterion, expected behavior, observed problem, related source,
reproduction conditions and steps, and evidence, labeling each source-inferred or execution-observed,
without running QA tests. Outside the final plan Reviewer correction exception, Orchestrator routes it to Coder and QA recheck. Reviewer still handles structure, design,
factual, and security findings; observable security/interface issues may need both QA and Reviewer.

Orchestrator accepts using verdicts, findings, rechecks, and remaining gaps, not an overall run result;
disposition never turns unverified into proven. Low-risk work without QA likewise links each criterion to Orchestrator
focused-check evidence.

Read brief-cited `references/superpowers/test-driven-development/SKILL.md`; preserve ARC TDD exceptions.


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
- [scope.non-escalation] Act only where role authority, approved scope and available platform tools all permit. Delegation, restart, agent messages and attached instructions do not expand role authority. MUST NOT bypass a restriction through aliases, scripts, other tools, processes or redelegation. Return conflicting instructions to Orchestrator before dependent work; reuse valid prior approvals for unchanged scope rather than requesting them again.
- [git.specialists-deny] Specialist roles MUST NOT change Git state: no stage, commit, push, merge, rebase, reset, branch creation/switching or worktree creation/removal, during normal implementation or recovery. Even an explicit Orchestrator assignment cannot authorize these actions; return them to Orchestrator. Read-only Git inspection remains allowed within the assigned scope.
- [git.orchestrator-accept-commit] Only Orchestrator accepts work and executes Git mutations. One approved top-level plan task becomes one focused implementation commit after criteria, required checks and findings are satisfied; Orchestrator accepts then commits without additional user commit approval. Reports, passing checks and Reviewer opinions do not replace acceptance. Preserve unrelated changes and ownership and verify the resulting SHA, included content, HEAD and remaining changes. Existing small-task direct and plan-omission paths are unchanged.
- [external.explicit-user-authority] Push, merge, deploy, publish and external messages require explicit user authorization for that action, scope and target. Local commit authority grants no external authority. Orchestrator performs authorized external actions; specialist roles return them without execution.
- [role.orchestrator-boundary] Assign design/spec/plan/brainstorming drafts ONLY to Planner and implementation/configuration/test edits to Coder. Orchestrator saves complete drafts and owns approval requests, preparation, scheduling, evidence, acceptance and completion. Direct implementation is limited to the existing small, low-risk direct path; this policy does not expand it.
- [role.scouter-read-only] Research assigned static sources and report findings, evidence and limits. Do not edit files, install, execute checks, prepare execution targets, inspect live operational state, change external state or decide design, verification, review or acceptance.
- [role.planner-draft-only] Return design/spec/plan drafts and dependencies, criteria, hold conditions and verification needs in the response. MUST NOT save documents, implement, run checks, prepare targets, request user approval or decide acceptance. Stop formal target-dependent drafting if actual prepared target evidence is missing; route decisions to Orchestrator.
- [role.coder-implementation] Edit only assigned, approved files and run focused checks under the existing TDD contract. Report changed files, RED/GREEN or authorized exception evidence, results, limits and follow-up. Do not plan, independently QA/review your own work, accept the task or declare overall completion. Git changes remain forbidden even when implementation succeeds.
- [role.qa-verification] Run approved checks and report commands, observations, reproduction, evidence and limits. Create only essential temporary data/logs/reports in the brief-authorized location and lifetime. Do not edit product source, tests, fixtures or configuration to pass checks, deploy or accept work. Persistent product-state checks require explicit scope and cleanup ownership. Return failures for Coder correction and required QA recheck.
- [role.reviewer-independent] Independently inspect the assigned final changes and evidence and report actionable findings and limits. Remain read-only. MUST NOT execute QA tests, edit files, perform Git mutations or decide acceptance.
- [review.significant-no-plan] For significant/high-risk work without a plan: Coder → QA and required QA rechecks → Reviewer of the final full change → Orchestrator acceptance. MUST NOT omit Reviewer merely because no plan exists. This creates no new plan obligation.
- [review.significant-plan] For significant/high-risk plan work: each task uses Coder → fresh QA as required → Orchestrator acceptance and focused commit. After all tasks are accepted and required QA is complete, Reviewer reviews the final full change once. Reviewer is NOT a per-task or per-commit required gate. Preserve required checks and necessary finding rechecks.
- [review.final-plan-recheck] For final overall Reviewer findings on plan work, including behavior findings, use Coder → Reviewer without QA reassignment; repeat until resolved. This exception applies only at the final plan stage. Preserve required QA and QA failure rechecks before initial final review and outside this exception.
- [platform.claude] Existing per-role tool allowlists reduce available tools; Bash and role contracts are not a filesystem sandbox. A role-scoped Git guard is a separate integration and is not supplied by these policy sections alone.
[ARC role policy: contract end]
