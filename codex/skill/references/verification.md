# Verification contract

Orchestrator reads before verification design, QA/Reviewer assignment, correction rechecks, or UI acceptance checks.
QA and
Reviewer contracts are in their profiles; they read this file only for sections the brief explicitly cites.
Visual companion design discussion is distinct from QA UI acceptance.

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
When risk is unclear, investigate or use the higher flow. Environment failure does not waive checks or determine design depth.

Do not add per-task QA or review gates solely because a task boundary exists. Reviewer is never a plan-task acceptance
prerequisite; for significant work with a plan, it reviews the final full change once after all plan tasks are accepted
with their risk-scaled checks, following the last plan task's required checks and any QA recheck at the final relevant
state; significant work without a plan keeps Reviewer after QA before acceptance. Preserve specific approved
obligations. If the next task depends on a still-unverified risky contract, complete applicable QA at that dependency
boundary and resolve or explicitly disposition findings before dependent implementation.
Reuse evidence only when scope, relevant state, independence, freshness, and flow
position satisfy each covered requirement; changes, failures, or missing/conflicting evidence invalidate affected reuse.
QA checks independently without edits; Reviewer reviews without QA, planning, edits, delegation, or completion
decisions. Orchestrator routes fixes to Coder (a failed direct-path check returns to the normal flow),
obtains affected QA rechecks outside the final plan Reviewer correction exception and required final review, and accepts after findings/evidence gaps are resolved or
explicitly dispositioned.

Criterion verdicts follow the Evidence verdict.

Fresh-per-task rules apply to Coder and QA, not Reviewer. Orchestrator may reuse a Reviewer only while independent
of implementation and self-review, relevant assignment context remains valid, and refreshed review scope, target
state, and evidence are provided; otherwise assign another independent Reviewer. Reusing a Reviewer does not reuse
an earlier verdict or waive required review timing or coverage.

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



Authorization evidence and probe/combined scope are owned by [planning](planning.md#authorization-and-scope);
valid reuse and actual-state refresh by [handoff](handoff.md#authorization-continuity).
After gates hold, continue approved scope without saved documents through required checks and Orchestrator acceptance under
Completion continuity below; a role report alone does not complete the work.



The Risk-scaled execution section above holds the risk table, risk definitions, evidence-reuse rule, and role order,
including Reviewer timing. Product/test edits belong exclusively to Coder except under the Orchestrator direct path;
Orchestrator may inspect/run checks but routes code corrections to Coder. Determine the minimum
flow from risk and any specific instruction or approved commitment, and record which requirements each check or review
satisfies. For small, low-risk work with clear scope and acceptance evidence and no such requirement,
Orchestrator's focused checks suffice; do not call QA or Reviewer automatically. Significant/high-risk work requires
independent review of the full change at the final relevant state after the required QA/focused checks and any QA recheck.

Many known metadata files are not significant solely because there are many, and a one-file permission or data-loss
rule may be. A vague request to delete unnecessary files does not establish low risk; reclassify when installer,
manifest, or other contracts are affected. For a verified ignore-pattern or metadata cleanup, confirm the targets are
unused, required project materials are unaffected, ignore patterns cover only intended paths, and the diff matches the
approved scope; Orchestrator's focused checks then suffice without automatically calling QA or Reviewer.
An environment failure is distinct from a code failure; report the exact limitation and any remaining evidence gap to Orchestrator.

Use additional Planner/Scouter only for unresolved planning/discovery questions. Reviewer covers substantial changes and
correctness, factual, security, data, or interface risks. Orchestrator may use Planner/Scouter/Reviewer when justified
and assigns all Coder/QA work. Specialists report unresolved questions to Orchestrator, who assigns support only when needed.

QA runs applicable existing functional/test checks, or approved structural/consistency checks for policy and
configuration changes. Reviewer reads the assigned diff/source for correctness, factual accuracy, and security. Outside the final plan Reviewer correction exception, after a
behavior fix QA reruns affected checks, and Reviewer rechecks only when warranted. Reuse a Reviewer only when
independent of the work and self-review and when evidence meets required scope and freshness.
Before completion, resolve or explicitly disposition findings and confirm acceptance evidence. Claim checks only
with verified output.

## Task acceptance and final plan acceptance

Task-local acceptance is distinct from overall final plan verification and acceptance. Orchestrator connects each task's
acceptance criteria to actual evidence, currently required checks and findings before accepting it; checkbox
completion, a Coder report or passing commands alone do not establish acceptance.

Task acceptance and its focused commit require only the task's risk-scaled evidence: a FRESH QA instance per task that
needs QA (default to the current QA for post-fix rechecks of the same task while the approved scope, workspace,
ownership, and relevant assignment context remain valid), or Orchestrator focused checks for small, low-risk tasks;
Reviewer timing and task-boundary gates follow the Risk-scaled execution section above. For an independently acceptable task,
do not delay its acceptance/commit solely for later final plan verification. Currently required task checks must not
be deferred to final verification to accept early. State the scope and timing of final-only integration criteria in
the plan; with a plan, the required final whole-change review is final plan verification.

A task commit record does not mark unperformed final verification complete. Orchestrator still decides final plan
acceptance using final QA/Reviewer/integration evidence and findings, preserving unverified scope and explicit dispositions.
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
criteria unverified. For each criterion record the command or URL, test state and viewport (or not applicable),
interaction steps, expected and observed results, and accessible evidence. App startup, page load, and static checks alone do not prove
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

For QA execution failure or an unmet criterion within the current task, Orchestrator defaults to the current Coder
for correction and the current QA for a post-fix recheck, subject to the context, task-boundary and amendment rules in
[coordination](coordination.md). The finding alone does not create a new task. QA reruns the
reproduction path and invalidated related checks before Reviewer, reporting the actual actor, target state, outcomes, and limitations,
and the prior finding resolved, unresolved, or unverified with evidence. Reusing QA does not reuse stale evidence.
An unresolved finding returns to Coder correction and another QA recheck before Reviewer.
Environment blocks, missing checks, and out-of-scope criteria are evidence gaps, not presumed code defects; Orchestrator
handles those gaps under the existing disposition policy without substituting Reviewer review for QA evidence.

For an acceptance-linked behavior finding, Reviewer reports the criterion, expected behavior, observed problem, related
source, reproduction conditions and steps, and evidence to Orchestrator, distinguishing source-inferred reproduction
from execution-observed results without running QA tests. Outside the final plan Reviewer correction exception,
Orchestrator routes it to Coder correction and QA post-fix recheck. Outside the required final plan correction loop,
Orchestrator decides when a Reviewer recheck is warranted by the changed scope and independence. Reviewer continues handling
structure, design, factual, and security findings that execution checks cannot settle; observable security/interface
issues may require both QA verification and Reviewer source review.

Orchestrator accepts using criterion verdicts, findings, recheck evidence, and remaining gaps, rather than an overall
run result.
Explicit disposition does not convert unverified to proven; completion reports preserve remaining unverified scope.
For low-risk work without QA, Orchestrator's focused checks likewise connect each criterion to evidence.


Read brief-cited `references/superpowers/test-driven-development/SKILL.md`; retain ARC exceptions.


## Completion continuity

Once applicable authorization, document-depth, execution-target, and handoff conditions hold for the approved scope,
continue through execution, correction, reverification, required QA and Reviewer, findings disposition, Orchestrator
acceptance, and the result report. Apply risk-scaled timing above; this adds no per-task Reviewer or new QA obligation.
A role completion report, probe findings, or passing commands are not overall completion when approved work remains.
Remaining approved execution is not an optional suggestion waiting for a user response. A probe-only scope
ends at its approved question's evidence and limits; a combined scope continues under planning's scope rules.
Document omission changes neither verification risk nor acceptance responsibility. Hold only affected work for an
actual unmet condition and report what is needed to resume. Structural evidence does not prove live agent compliance.

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

### 협력 CLI의 task 수용과 집중 commit 대조

현재 plan mode의 `prepare`는 `operation: "accept"`와 `operation: "commit"`을 지원한다.
수용은 Orchestrator가 `actor.role: "orchestrator"`, `taskId`, 그리고 `arguments`의
`messageRef`, task와 동일한 `criteria`, 현재 필수 QA의 정확한 `checkIds`, 해당 task의 전체
`findingIds`, 현재 `changeFingerprint`를 명시하는 진술이다. 필수 descriptor별 최신 QA 결과가
passed/proven이어야 하며, finding은 Coder 수정과 QA 재확인을 거쳐 closed여야 한다.
이 진술이 통과하면 accepted가 되며, passing command나 Coder 보고만으로는 수용되지 않는다.
기록의 출처는 `operator-attested`이며 criterion의 의미적 충족과 actor 신원은 운영자가 확인한다.

수용 시 code는 실제 index tree·staged diff·경로와 task fingerprint를 함께 고정한다. Orchestrator는
그 전에 승인된 task 경로만 stage하고, 해당 index 상태에 대해 필수 QA를 확인한다. 무관 경로·다른
등록 task의 변경 혼입·scope 안의 unstaged/untracked 변경은 hold다. 같은 파일 내부의 의미상 무관한
hunk를 code가 자동 구분할 수는 없으므로 Orchestrator가 실제 diff를 읽어 확인한다.

`prepare`의 `operation: "commit"`은 `arguments: {"acceptanceId": "수용 requestId"}`로 정확한
수용을 참조한다. code는 최신 승인·task 계약·QA·finding·index가 수용 당시와 같은지 확인하고,
예상 parent·tree·paths·잔여 경로를 담은 durable intent를 저장한다. CLI는 stage나 commit을 실행하지
않는다. Orchestrator가 이 기대값에 맞춰 하나의 집중 implementation commit을 수행한다.

이후 `reconcile` 또는 result 형식의 `result`에 `intentId`, `actor.role: "orchestrator"`,
`result: {"status": "succeeded", "messageRef": "실제 결과 근거", "data": {"commit": "전체 OID"}}`를
제출한다. CLI는 로컬 Git에서 실제 commit 객체·parent·tree·paths·HEAD·index·잔여 변경을 다시 읽는다.
기대값이 모두 맞을 때만 target HEAD와 task를 committed로 바꾼다. 실패·unknown·mismatch의 관찰과 실제
이력은 보존되며 target을 임의로 갱신하지 않는다. 같은 request 또는 완료된 intent의 재사용은 두 번째
효과를 허가하지 않는다. 실패 후에는 실제 상태를 읽고 원인을 해결한 뒤 기존 intent를 대조해야 한다.

정상 commit 뒤에도 과거 QA의 fingerprint를 새 값으로 바꾸지 않는다. 별도의 post-commit 파일·index
관찰값이 후속 변경을 감지하며, final review는 기존 규칙대로 현재 task 근거와 final fingerprint를
요구한다. runtimeHash가 달라지면 기존 stale/hold 규칙이 적용되고 저장된 버전은 자동 갱신되지 않는다.

[ARC role policy: contract begin]
Generated from lib/policy/role-policy.json; do not edit this managed section manually.
- [git.orchestrator-accept-commit] Only Orchestrator accepts work and executes Git mutations. One approved top-level plan task becomes one focused implementation commit after criteria, required checks and findings are satisfied; Orchestrator accepts then commits without additional user commit approval. Reports, passing checks and Reviewer opinions do not replace acceptance. Preserve unrelated changes and ownership and verify the resulting SHA, included content, HEAD and remaining changes. Existing small-task direct and plan-omission paths are unchanged.
- [review.significant-no-plan] For significant/high-risk work without a plan: Coder → QA and required QA rechecks → Reviewer of the final full change → Orchestrator acceptance. MUST NOT omit Reviewer merely because no plan exists. This creates no new plan obligation.
- [review.significant-plan] For significant/high-risk plan work: each task uses Coder → fresh QA as required → Orchestrator acceptance and focused commit. After all tasks are accepted and required QA is complete, Reviewer reviews the final full change once. Reviewer is NOT a per-task or per-commit required gate. Preserve required checks and necessary finding rechecks.
- [review.final-plan-recheck] For final overall Reviewer findings on plan work, including behavior findings, use Coder → Reviewer without QA reassignment; repeat until resolved. This exception applies only at the final plan stage. Preserve required QA and QA failure rechecks before initial final review and outside this exception.
- [platform.codex] Role restrictions are prompt-level contracts, not a filesystem sandbox. No documented role-specific Git hook or generic per-agent tool allowlist is assumed. Existing shell capabilities are retained because static read access after shell reduction has not been verified; Coder and QA need shell for approved checks.
[ARC role policy: contract end]


## 협력 CLI의 외부 작업과 복구

세 phase는 상태·문서·배정, scope·검증·수용 및 집중 commit, 외부 승인·결과·audit 복구를 지원한다.
`status.support`에서 아홉 영역과 한계를 조회한다. 지원 mode는 spec+plan의 `plan`이며 no-plan·생략은
unsupported다. CLI는 native/provider 호출이나 push·merge·deploy·publish를 실행하지 않는다.
운영자가 확인한 사용자 승인과 실행 결과는 `operator-attested`, `nativeVerified: false`,
`remoteVerified: false`다. CLI 밖 직접 호출 차단과 원격 독립 검증은 제공하지 않는다.

Orchestrator는 이미 확인한 명시 승인을 `record`의
`evidence: {kind: "external-approval", messageRef, data: {operation, scope, descriptor}}`로 기록한다.
`scope`는 checkout 안의 중복 없는 절대 경로 배열이다. 로컬 commit 승인은 외부 작업 승인이 아니다.
승인에 정확한 action·scope·대상을 포함하고 다음 descriptor 필드를 빠짐없이 기록한다.

| operation | descriptor 필드 |
|---|---|
| push | repository, destination, refspec, sourceOid, expectedRemoteOid |
| merge | repository, changeRef, targetRef, expectedTargetOid |
| deploy | service, project, environment, artifactId, destination |
| publish | service, namespace, name, version, artifactHash, destination |

Git OID는 전체 40/64자리 소문자 hex, artifactHash는 `sha256:<64-hex>`다. 원격 관찰이 없는 OID는
사용자가 진술한 기대값이며 검증된 원격 상태가 아니다. destination은 비밀정보 없는 식별자여야 한다.
URL userinfo·query·fragment와 password·token·credential 등 인증정보를 입력하지 않는다.
CLI는 인식한 credential 입력을 저장 전에 거부하지만 모든 임의 문자열의 비밀 여부를 판별할 수는 없다.

`prepare`에 `{requestId, expectedRevision, actor: {id, role: "orchestrator"}, operation,
arguments: {approvalRef, scope, descriptor}}`를 전달한다. approvalRef는 외부 승인 messageRef와 같다.
정확한 승인·scope/target 버전·runtime 버전이 맞고 미해결 효과가 없을 때만 intent를 저장한다.
`allow`와 `persisted: true`를 확인한 후 실제 외부 수행은 별도 승인 범위에서 Orchestrator가 담당한다.
이 CLI는 그 실행 권한을 확대하지 않는다.

`result`/`reconcile`은 `{requestId, expectedRevision, actor, intentId,
result: {status, messageRef, data: {operation, scope, descriptor}}}`를 받는다. intentId는 prepare requestId다.
대상 불일치·unknown·stale 결과는 hold이며 과거 진술을 보존한다. 중단 후 `status`로 intent와
`state.requests`·`state.audit`·`state.results`를 조회하고 실제 발생 여부를 조사한다. 새 prepare나 같은
승인으로 재실행하지 말고 같은 intent에 조사 결과를 `reconcile`한다. 취소에는 실행하지 않았다는
`notExecutedEvidence: {messageRef}` 진술이 추가로 필요하다. 취소 뒤에도 해당 승인은 소모된 기록으로 남는다.
버전 drift는 자동 갱신·migration·재허가로 해소하지 않는다. hold 원인을 Orchestrator에게 보고한다.

결과가 succeeded여도 운영자의 결과 진술이며 독립 remote verification이 아니다. `audit`에는
request→decision→intent→result→resolution의 연결이 남지만 로컬 수정 가능한 기록이며 변조 불가능한
보안 증거가 아니다. 실제 외부 결과가 불확실하면 재시도하지 않는다.
