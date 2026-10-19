# Verification and acceptance

Define observable checks from acceptance criteria. For feature/behavior implementation use test-driven-development:
meaningful test first, observed expected failure, minimal implementation, focused success, then the project suite.
A required skill or test constraint must be reported before dependent edits. A waiver needs a precise Orchestrator
record of narrow scope, understood/reversible risk, no dependent stages or cross-component lifecycle,
and one focused verification path; a documentation exception authorizes only its named structural checks.
Neither is a claim of TDD.

QA runs approved checks without editing source and returns commands, results, failures, evidence and limitations.
Report verification side effects within approved scope. Do not broaden tests, repair failures or claim acceptance
independently. Reviewer independently reads the final complete diff after the required QA/focused checks for
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
Reviewer does not substitute for QA evidence.

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
