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
needs QA (default to the current QA for post-fix rechecks of the same task while the approved scope, workspace,
ownership, and relevant assignment context remain valid), or Orchestrator focused checks for small, low-risk tasks; Reviewer is never a
plan-task acceptance prerequisite. Do not delay an independently acceptable task for final-only checks,
and do not defer currently required task checks to final verification. For significant work with a plan,
Reviewer reviews once on the final full change after all plan tasks are accepted with their risk-scaled checks and any
QA recheck at the final relevant state; without a plan, Reviewer follows QA before acceptance.
A task commit does not mark unperformed final verification complete.

Fresh-per-task rules apply to Coder and QA, not Reviewer. Orchestrator may reuse a Reviewer only while independent
of implementation and self-review, relevant assignment context remains valid, and refreshed review scope, target
state, and evidence are provided; otherwise assign another independent Reviewer. Reusing a Reviewer does not reuse
an earlier verdict or waive required review timing or coverage.

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

For QA execution failure or an unmet criterion within the current task, Orchestrator defaults to the current Coder
for correction and the current QA for a post-fix recheck, subject to the context, task-boundary and amendment rules in
[coordination](coordination.md). The finding alone does not create a new task. QA reruns the
reproduction path and invalidated related checks before Reviewer, reporting the actual actor, target state, outcomes, and limitations,
and the prior finding resolved, unresolved, or unverified with evidence. Reusing QA does not reuse stale evidence.
An unresolved finding returns to Coder correction and another QA recheck before Reviewer.
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

For Orchestrator, **Evidence verdict**: each criterion is proven, unmet, or unverified; passing runs, reports, or disposition never turn unverified into proven; reports keep unverified scope visible.

## Risk-scaled execution

Orchestrator assigns edits exclusively to Coder except under the Orchestrator direct path in [handoff](handoff.md#orchestrator-direct-path-for-small-tasks), and determines affected
behavior, risk, and smallest meaningful verification.

| Risk | Minimum flow |
|---|---|
| Small, low risk | Coder, or Orchestrator direct path → Orchestrator's focused checks → acceptance |
| Ordinary behavior | Coder → independent QA → acceptance |
| Significant/high risk | Coder → QA → independent Reviewer of the final full change → acceptance; with a plan, each plan task Coder → FRESH QA → acceptance/commit satisfies the QA step, then independent Reviewer once on the final full change after all plan tasks |

Ordinary and significant plan tasks need a FRESH QA before acceptance; only small, low-risk tasks may be accepted on
Orchestrator focused checks. Small, low risk means narrow, understood, readily reversible, and verifiable by focused
checks. Ordinary behavior fails those conditions without a significant-risk trigger. Significant risk includes shared
role/behavior contracts, shared state, lifecycle/integration order, security/permissions, data loss/migration, public interfaces, or costly
installation/deployment/rollback. Substantial behavior or contract changes are significant regardless of file count.
Unclear risk requires investigation or the higher flow. Environment failure does not waive checks or determine design depth.

Do not add per-task gates automatically. Reviewer is never a plan-task acceptance prerequisite; for significant work
with a plan, it reviews the final full change once after all plan tasks are accepted with their risk-scaled checks,
following the last plan task's required checks and any QA recheck at the final relevant state; significant work without
a plan keeps Reviewer after QA before acceptance. Preserve specific approved obligations and complete risky dependency checks
before dependent implementation. Reuse evidence only when scope, relevant state, independence, freshness, and flow
position satisfy each covered requirement; changes, failures, or missing/conflicting evidence invalidate affected reuse.
QA checks independently without edits; Reviewer independently reads the final full change after QA for significant
work, without QA, planning, edits, delegation, or completion decisions. Orchestrator routes fixes to Coder,
obtains affected QA rechecks outside the final plan Reviewer correction exception and required final review, and accepts after findings/evidence gaps are resolved or
explicitly dispositioned.

Criterion verdicts follow the Evidence verdict.

Authorization evidence and probe/combined scope are owned by [planning](planning.md#authorization-and-scope);
valid reuse and actual-state refresh by [handoff](handoff.md#authorization-continuity).
After gates hold, continue approved scope without saved documents through required checks and Orchestrator acceptance under
Completion continuity above; a role report alone does not complete the work.


## 협력 CLI의 검증 수명주기

`workflow`의 지원 경로는 승인된 완전한 spec+plan이다. no-plan, small-task와 문서 생략 경로는 계속
`cooperative.unsupported`이며, 이 결과는 기존 ARC 정책 위반이나 새 문서 작성 의무를 뜻하지 않는다.
CLI는 check를 실행하거나 Reviewer를 호출하지 않는다. 모든 actor·결과·판정은 `operator-attested`이며 실제
신원 인증, 독립성의 실재, 의미적 충분성이나 실행 강제를 증명하지 않는다.

Orchestrator actor(`actor.role: "orchestrator"`)가 `record`의 `acceptance-evidence`에
`data: {kind: "task", task: {...}}`를 기록해 검증 계약을 등록한다. task에는 `id`, 절대 경로 `paths`,
`criteria`, `requiredChecks`, `dependencies`, `approvalRef`, `approvalVersion`, `documentVersion`,
`scopeVersion`, `targetVersion`을 명시한다. task 상태는 pending만 등록할 수 있고, 이 기록은 수용·commit이 아니다.
requiredChecks의 각 descriptor는 `{executable, args, cwd, env, outputs}`이며 executable·cwd·outputs는 절대 경로다.
cwd와 outputs는 workspace 안에 있어야 한다. Reviewer를 task requiredChecks에 넣지 않는다.

`status`의 `changeFingerprints.tasks[taskId]`와 `changeFingerprints.final`은 독립된 관찰 값이다.
읽기 전용 Git inventory/index와 현재 regular file 바이트·mode·삭제를 포함하고, task는 소유 경로만,
final은 저장소 전체 snapshot을 반영한다. symlink, submodule, unmerged index 등 지원하지 않는 관찰은 보류한다.
관찰과 실행 사이를 원자적으로 잠그는 sandbox는 아니다. runtimeHash drift는 기존 버전을 자동 갱신하거나
migration·재승인으로 바꾸지 않고 stale/hold로 남긴다.

`prepare`의 `operation: "check"`는 `taskId`와
`arguments: {scope: "task", actor: {id, role: "qa"}, descriptor, changeFingerprint, findingIds?}`를 받는다.
actor ID 진술은 Coder·Orchestrator와 독립이어야 하고 task 간 QA/Coder 재사용을 거부한다. descriptor는 등록된
requiredChecks와 정확히 같아야 한다. intent가 저장된 후 실제 실행은 기존 승인 범위의 담당자가 수행한다.
`result` 또는 `reconcile`은 `intentId`와 `{status, messageRef, data}`를 기록한다. data에는 intent와 같은
`actor`, `descriptor`, `scope`, task의 경우 `taskId`, `changeFingerprint`, 그리고
`verdict: "proven" | "unmet" | "unverified"`를 명시한다. succeeded와 proven의 결합도 해당 변경 버전에만
유효하다. 이는 운영자의 판정 기록이며 criterion의 의미적 입증이나 Orchestrator 수용을 대신하지 않는다.
실패·unknown·mismatch·unverified는 통과 근거가 아니다. 이전 결과와 실패 기록을 보존한다.

실패한 check/review는 open finding을 남긴다. 별도 finding은 `record`의
`data: {action: "open", id, checkId, message}`로 기존 check/review에 연결한다. Coder 수정 후
`data: {action: "resolve", id, actor: {id, role: "coder"}, changeFingerprint}`와 수정 근거 messageRef를
기록한다. actor는 해당 task(전체 finding이면 관련 task)에 배정된 Coder여야 한다. 이 기록은 resolved이며,
후속 prepare의 `findingIds`가 해당 finding을 포함하고 같은 변경 버전의 재검증이 통과해야 closed가 된다.
그 이전 QA 실패는 Coder→QA 재확인을 유지한다.

`operation: "review"`는 `scope: "final"`, `actor.role: "reviewer"`,
`descriptor: {kind: "source-review", paths: [...]}`를 사용하고 taskId를 넣지 않는다. 최초 final review는 모든
task가 수용되고 현재 필수 task QA 근거가 있을 때 가능하다. task 수용·집중 commit의 선행 gate로 Reviewer를
요구하지 않는다. 지원하는 plan의 final Reviewer finding은 Coder 해결→Reviewer 재검증을 반복하며 QA 재배정을
요구하지 않는다. 이전 QA 근거를 수정 후 실행 근거로 표시하지 않는다. 별도 미해결 QA 실패는 이 예외로 생략하지 않는다.

scope·document·approval 변경 기록은 과거 기록을 덮어쓰지 않는다. `data.affectedTaskIds`를 지정하면 해당 task와
의존 chain의 task·검증·수용 근거를 무효화하고, 생략하면 모든 task를 보류한다. final 근거도 stale이 된다.
영향받지 않은 독립 task의 근거는 보존한다. 의미적 영향 범위는 Orchestrator가 판단한다. 영향 task는 현재 scope의
새 승인 기록과 task 계약 갱신으로 다시 준비해야 하며, 과거 승인으로 되살릴 수 없다. 새 check/review와 finding
재검증도 필요하다. 최신 근거는 과거 실패를 삭제하지 않고 대체하며, 수용·commit·최종 완료 판단은 Orchestrator에게 남는다.

[ARC role policy: contract begin]
Generated from lib/policy/role-policy.json; do not edit this managed section manually.
- [git.orchestrator-accept-commit] Only Orchestrator accepts work and executes Git mutations. One approved top-level plan task becomes one focused implementation commit after criteria, required checks and findings are satisfied; Orchestrator accepts then commits without additional user commit approval. Reports, passing checks and Reviewer opinions do not replace acceptance. Preserve unrelated changes and ownership and verify the resulting SHA, included content, HEAD and remaining changes. Existing small-task direct and plan-omission paths are unchanged.
- [review.significant-no-plan] For significant/high-risk work without a plan: Coder → QA and required QA rechecks → Reviewer of the final full change → Orchestrator acceptance. MUST NOT omit Reviewer merely because no plan exists. This creates no new plan obligation.
- [review.significant-plan] For significant/high-risk plan work: each task uses Coder → fresh QA as required → Orchestrator acceptance and focused commit. After all tasks are accepted and required QA is complete, Reviewer reviews the final full change once. Reviewer is NOT a per-task or per-commit required gate. Preserve required checks and necessary finding rechecks.
- [review.final-plan-recheck] For final overall Reviewer findings on plan work, including behavior findings, use Coder → Reviewer without QA reassignment; repeat until resolved. This exception applies only at the final plan stage. Preserve required QA and QA failure rechecks before initial final review and outside this exception.
- [platform.claude] Existing per-role tool allowlists reduce available tools; Bash and role contracts are not a filesystem sandbox. A role-scoped Git guard is a separate integration and is not supplied by these policy sections alone.
[ARC role policy: contract end]
