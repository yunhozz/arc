# 계획 개정을 구현 커밋에 포함 (최초 계획 커밋 amend 폐지) 설계

- 경로: Architectural, plan 필요, 위험도 중상
- 기준: 브랜치 `fix/plan-revision-in-task-commit`, HEAD `ec91fc08ded203d3d95df2faff78eabb73c7335a`
- 설계 승인: 2026-11-16 사용자 승인
  - 이어지는 작업이 없을 때는 후속 커밋에 넣고, 그것도 없으면 종결 커밋 하나를 허용한다.
  - 런타임 plan-amend는 완전히 제거한다.
  - rule id는 `planning.plan-revision`, trailer 화살표는 ASCII `->`를 쓴다.

## 1. 목표

1. 실행 중에 생기는 spec/plan 본문 변경(진행 기록 제외)을 최초 계획 커밋 amend와 replay로 반영하던 방식을 없앤다. 대신 이후에 수락되는 커밋에 함께 넣는다.
2. history rewrite가 없으므로 rewrite 안전 절차, old→new SHA 매핑, recovery ref를 지침, 정책, 런타임, 테스트에서 모두 제거한다.
3. 개정의 승인 시점과 내용은 세 곳에 남겨 추적한다. 문서 안의 "개정 이력" 표, canonical record의 대기 개정 항목과 전체 본문 사본, 커밋 trailer다.
4. rule id `planning.plan-amend`를 `planning.plan-revision`으로 바꾼다.

## 2. 비목표

- 승인 요건은 바꾸지 않는다. contract 개정에 필요한 승인, preparation, hold, fresh Implementer 조건과 진행 기록 규칙은 그대로다.
- 개정 커밋 규칙을 런타임이 강제하게 만들지 않는다. trailer 검사나 대기 개정 추적 기능은 넣지 않는다.
- 과거 `docs/superpowers/**` 문서는 수정하지 않는다.
- 이미 만들어진 `refs/arc/recovery/*` ref는 삭제하지 않는다.
- "approved plan/acceptance-criteria amendment requires a fresh Implementer" 문구와 관련 테스트는 유지한다. 해당 위치는 `coordination.md:45,47`, `role.orchestrator-boundary`, `tests/test_arc_policy.py`, `tests/test_claude_payload.py:352`, `tests/installer-parity.json`의 `test_plan_amendment_restarts_*`다. 여기서 amendment는 계획 내용의 개정을 뜻하고 커밋 amend와 관계가 없다.
- cooperative CLI의 `documents` 커밋 종류(최초 spec+plan 묶음 전용, `evaluate.mjs:172-173`)는 확장하지 않는다.

## 3. 확인된 사실 (HEAD ec91fc0)

- **지침** (claude/와 codex/ 양쪽에 같은 내용)
  - `skill/SKILL.md:29` Preservation rule에 amend 예외와 SHA 매핑이 있다.
  - `references/planning.md:113`: "original-commit updates below"
  - `references/planning.md:116-126`: `plan-updates-during-execution`
  - `references/handoff-prep.md:75`: "separate amend needs scope/current HEAD/publication checks"
  - `references/handoff-prep.md:81-90`: 앵커 `execution-time-plan-amendment`
  - `references/commit.md:9,22,24,28-35`: `execution-time-plan-document-updates`
  - `references/verification.md:50-55`: 앵커 `evidence-after-plan-history-rewrite`
  - `git-recovery.md:8,22`의 amend는 일반 금지 문구라서 유지한다.
- **정책**
  - `lib/policy/role-policy.json:339-360`: `planning.plan-amend`. operations는 `non-progress-planning-commit-amend`, evidence는 `rewrite-safety`, `sha-mapping`이다.
  - `role-policy.json:107`: `git.orchestrator-accept-commit`
  - `lib/policy/placement.mjs:6,8,9,10`의 projection
  - 생성 섹션 `[ARC role policy: contract begin]`
  - `lib/prompts/agent-fragments.json:14`: profile Preservation rule의 "original planning-document commit amendment" 예외 문장
- **런타임**
  - `operations.mjs:5-6`
  - `cooperative-schema.mjs:22-29,56,68-69,76`
  - `evaluate.mjs:19,28-29,50,56-75,179,195-197,203`
  - `cooperative.mjs:4,14,19,30,53-57,100,102,127-139,151,154,174`
  - `git-evidence.mjs:192-240`
  - `shared/skill/runtime/*`는 `scripts/update-runtime-assets.mjs`로 생성하고 `MANIFEST.sha256`도 갱신한다.
- **예전 state 호환**
  - `validateCooperativeState`는 최상위 키를 exact 검사하지 않는다. `planAmend*` 키는 `cooperative-schema.mjs:68-69`에서만 검사한다.
  - `evaluateCooperative`의 검사 순서는 schema → policy → mode → target → versions → revision → plan-amend unresolved 순이다(`evaluate.mjs:189-196`).
  - 이번 작업으로 runtime hash가 바뀌므로 예전 state는 `cooperative.versions`에서 hold된다.
- **cooperative 커밋 경로**
  - task 커밋은 모든 경로가 `task.paths` 안에 있어야 한다(`acceptance.mjs:39,47`, `evaluate.mjs:176`).
  - 여러 task가 경로를 공유하는 경우는 `snapshotConnections`가 지원한다(`cooperative.mjs:112-119`).
  - 이 제약은 진행 기록을 task 커밋에 넣는 현재 규칙에도 똑같이 걸린다.
- **fixture**: `tests/node/fixtures/instruction-contracts.json`은 생성기가 없는 수동 관리 파일이다. 참조하는 곳은 `instruction-layout.test.mjs`와 `agent-fragments.test.mjs`다.
- **테스트 기준 상태**: master에서 `npm test`를 돌리면 57개가 실패한다(설치·dispatch 계열 기존 실패). 워크트리에는 `node_modules`와 `build`가 없어서 설치 계열 테스트가 파일 단위로 추가 실패한다.

## 4. 규칙 정의

- **R-1 범위**: 실행 중 spec/plan 본문 변경은 두 가지로 나눈다.
  - (a) 작업 진행 기록: checkbox, note, result, evidence, status
  - (b) 그 밖의 모든 본문 변경("계획 개정"): contract 개정(goals, task 경계, scope, criteria, method, risk, dependencies, required checks)과 기계적 정정(오타, 경로, 명령, 설명)
  - (a)는 기존 규칙을 따른다. 승인 없이 해당 작업의 수락 커밋에 넣고 분류, 사유, 실제 시각을 기록한다.
- **R-2 승인 요건 (변경 없음)**
  - 계획 개정은 해당하는 승인과 preparation을 거친다.
  - contract 개정은 개정 버전 승인, preparation, 영향 작업 hold, 남은 작업의 fresh Implementer가 필요하다.
  - spec 개정은 written-spec 승인을 받은 뒤에 그에 의존하는 plan 개정으로 넘어간다.
  - 진행 기록의 제거, 성공 조작, 근거 없는 수락, scope 혼합 변경은 기계적 정정이 아니다.
- **R-3 반영**
  - 승인 뒤 Orchestrator가 같은 파일을 직접 고쳐 최신 승인 본문으로 만들고 "개정 이력" 행을 추가한다. 그다음 커밋하지 않은 채 둔다.
  - 누적 개정도 같은 파일에 덮어써서 반영하고 행을 하나 더 추가한다.
- **R-4 개정 이력 표**
  - 문서 끝에 `버전 | 승인 시각 | 분류 | 영향 작업 | 사유` 열로 둔다.
  - 행은 추가만 하고 SHA는 적지 않는다.
  - v1(최초 승인) 행은 첫 개정 때 최초 승인의 실제 시각으로 함께 추가한다.
- **R-5 canonical record**
  - `.git/arc/handoff/` workflow record에 대기 개정 항목을 남긴다. 필드는 `gitPath`, `fromVersion`, `toVersion`, `contentHash`(승인 본문 sha256), `approvalRef`, `approvedAt`, `classification`(contract|mechanical), `reason`, `affectedTaskIds`, `status`(pending|committed)다.
  - 승인된 버전마다 전체 본문 사본을 `.git/arc/handoff/<workflow>/plan-revisions/<평탄화한 gitPath>.v<N>.md`에 보관한다.
  - 예전 승인과 사본은 덮어쓰지 않는다.
- **R-6 예상된 dirty state**
  - 대기 개정은 Orchestrator가 소유하는 예상된 dirty state다.
  - 역할 brief에는 작업 트리의 개정 버전과 `contentHash`를 적고 그 파일이 Orchestrator 소유임을 밝힌다. 승인 뒤 다른 작업의 진행 기록이 이미 커밋되었다면, brief에는 작업 트리 문서 내용의 SHA-256도 함께 적는다. 이때 작업 트리 문서는 승인 본문에 그 진행 기록이 더해진 상태다.
  - Implementer와 QA는 그 변경을 자기 것이나 무관한 사용자 변경으로 다루지 않고 손대지 않는다.
- **R-7 포함할 커밋 (우선순위 순)**
  1. 개정 승인 뒤 개정 버전을 기준으로 실행되었거나 재확인된 첫 상위 작업의 수락 커밋. 대기 개정 전체(spec과 plan 모두)와 trailer를 넣는다.
  2. 그런 작업이 없으면 진행 중인 작업의 수락 커밋이나 최종 Reviewer 지적 후속 작업의 커밋.
  3. 그런 작업도 없고 전체 계획 완료 판정 전이면, trailer를 단 단독 `docs(plan): <설명>` 종결 커밋 하나를 허용한다.
     - 조건: 남은 구현 작업이 없음을 확인하고 그 근거를 canonical record에 남길 것, 대기 개정을 모두 넣을 것, 구현 파일을 넣지 않을 것.
     - 이 커밋이 "별도 docs/fixup 커밋 금지"의 유일한 예외다.
  - 전체 계획 완료 판정은 대기 개정이 비어 있어야 내릴 수 있다.
- **R-8 분리**
  - 옛 버전 기준으로 진행 중이던 독립 작업이 먼저 수락되면 그 커밋에서 개정 hunk를 빼고 그 작업의 진행 기록 hunk만 stage한다.
  - 안전하게 분리할 수 없으면 그 커밋을 보류한다.
- **R-9 trailer**: 문서마다 따로 쓰고 ASCII `->`를 쓴다. 같은 키를 반복할 수 있다.
  - `Plan-Revision: <gitPath> v<from> -> v<to>`: 문서당 한 줄
  - `Plan-Approved-At: <gitPath> v<N> <ISO 8601 실제 승인 시각>`: from 다음 버전부터 to까지 버전마다 한 줄
  - `Plan-Reason: <gitPath> v<N> <사유>`: 버전마다 한 줄
  - 기존 Git trailer 보존 규칙(`commit.md`)을 따른다.
- **R-10 커밋 뒤 확인**
  - 커밋에 들어간 각 문서 blob의 내용을 확인한다. Git blob OID가 아니라 내용 바이트의 SHA-256으로 비교한다.
    - 승인 뒤 커밋된 진행 기록이 하나도 없으면, 커밋된 내용의 SHA-256이 최신 승인 `contentHash`와 같아야 한다.
    - 진행 기록이 있으면, 최신 승인 본문 사본과의 차이가 분류된 진행 기록뿐이어야 한다. 대상은 이 커밋 작업의 진행 기록과, 승인 뒤 먼저 커밋된 다른 작업(R-8 분리 포함)의 진행 기록이다.
    - 이 판정에 쓴 기대 본문의 SHA-256을 canonical record에 남긴다. 승인 사본은 덮어쓰지 않는다.
  - 해당 대기 개정이 `committed`가 되어 대기 개정이 비었는지 확인한다.
  - 커밋 SHA는 record에만 연결하고 문서에는 적지 않는다.
- **R-11 금지**
  - 계획 커밋이든 구현 커밋이든 amend, reset, replay, history rewrite를 하지 않는다.
  - R-7(3) 밖의 docs/fixup 커밋을 만들지 않는다.
  - 과거 작업을 소급해 승인하지 않는다. 최신 본문이 이후 커밋에 들어갔다고 해서 앞선 승인이 증명되지는 않는다.
- **R-12 증거**
  - SHA를 다시 쓰지 않으므로 기존 커밋의 증거 연결은 유지된다.
  - contract 개정이 영향을 주는 check와 recheck는 개정 버전 기준으로 다시 실행한다.
  - 계획 파일 변경으로 stale이 된 검증은 기존 규칙대로 갱신한다.

## 5. 지침별 변경 (claude/와 codex/에 같은 내용)

| 파일 | 변경 |
|---|---|
| `skill/SKILL.md:29` | Preservation rule에서 amend 예외, SHA 매핑, rewrite 문구를 뺀다. "진행 기록과 승인된 계획 개정은 이후 수락 커밋에 포함하고, 단독 docs(plan) 종결 커밋 예외를 제외하면 별도 docs/fixup 커밋을 만들지 않으며, 계획이나 구현 history를 amend/rewrite하지 않는다"로 바꾸고 planning과 commit 앵커로 연결한다. 바뀐 앵커를 가리키는 링크를 갱신한다. |
| `references/planning.md:113` | "original-commit updates below"를 "pending revisions below"로 바꾼다. |
| `references/planning.md:116-126` | 앵커는 유지한다. 118, 120행은 유지하되 120행에는 기계적 정정도 계획 개정임을 밝힌다. 122-126행을 R-3~R-8, R-11로 바꾼다. 보존 필드는 R-5로 바꾸고 old→new 매핑을 삭제한다. |
| `references/handoff-prep.md:75` | "separate amend needs scope/current HEAD/publication checks"를 삭제한다. routine amend 금지는 유지한다. |
| `references/handoff-prep.md:81-90` | 앵커를 `execution-time-plan-revision`, 제목을 "Execution-time plan revision"으로 바꾼다. 절차는 다음 다섯 단계로 교체한다. 1. 분류, 승인, 실제 시각 확인. 2. 문서 수정과 이력 행 추가, 사본과 대기 항목 기록. 3. brief 기재(R-6). 4. 포함 커밋 선택과 분리(R-7, R-8). 5. 커밋 뒤 확인(R-10). |
| `references/commit.md:9,22,24` | "DO NOT amend the original planning commit"은 유지한다. 22, 24행의 원 계획 amend 예외를 삭제하고 "NEVER amend planning or implementation commits"로 바꾼다. |
| `references/commit.md:28-35` | 앵커는 유지하고 본문을 R-7~R-11로 바꾼다. 커밋 전 staged 범위 확인에 대기 개정 포함 여부와 trailer 확인을 넣는다. |
| `references/verification.md:50-55` | 앵커를 `evidence-after-plan-revision-commit`, 제목을 "Evidence after plan revision commit"으로 바꾸고 본문을 R-10, R-12로 바꾼다. 들어오는 링크를 모두 갱신한다. |
| `references/handoff.md` (cooperative 섹션) | cooperative task contract의 `task.paths`에 spec/plan 경로를 넣어야 진행 기록과 대기 개정을 task 커밋에 넣을 수 있다고 한 문장 추가한다. 경로가 없으면 hold가 나고 scope 개정으로 해소한다. cooperative CLI는 R-7(3) 종결 커밋을 지원하지 않으므로 대기 개정은 task나 후속 커밋에 넣는다는 점도 적는다. |
| 생성 섹션 | 생성기로만 다시 만든다. |
| `docs/harness-operation.md:220` | R-1, R-7, R-9, R-11 요약으로 교체한다. |
| `lib/prompts/agent-fragments.json:14` | profile Preservation rule의 원 계획 amend 예외 문장을 삭제한다. |

## 6. 정책과 런타임 변경, 호환 처리

### 6.1 정책

- `planning.plan-amend`를 `planning.plan-revision`으로 바꾼다.
  - roles, effect, authority, controls는 유지한다.
  - operations: `["non-progress-spec-plan-content-update","pending-plan-revision-commit"]`
  - evidence: `["non-progress-content-change-classification","actual-approval-chronology","approved-revision-content-hash","plan-revision-trailers"]`
  - text 초안:
    > Task progress records (checkboxes, notes, results, evidence and status) preserving the approved contract need no new user approval; Orchestrator includes the completed task's own records in its accepted implementation commit and records classification, reason and actual time as applicable. All other spec/plan content changes, contract or mechanical, require applicable approval and preparation; changes to goals, scope, criteria, method, risk, dependencies or required verification need revised-version approval, preparation and holds on affected work before it continues, with a fresh Implementer for remaining work. After approval Orchestrator edits the same document, appends a revision-history row and leaves it uncommitted as an Orchestrator-owned pending revision, recording version, content hash, approval reference, actual time, classification, reason, affected tasks and the full approved content in the canonical handoff record. Orchestrator includes all pending revisions with Plan-Revision, Plan-Approved-At and Plan-Reason trailers in the accepted commit of the first top-level task executed or reconfirmed against the revised version, otherwise in a current task or final Reviewer follow-up commit; only when no implementation work remains before overall completion MAY it make one standalone docs(plan) closing commit without implementation files. Exclude revision hunks from commits of independent tasks accepted on a prior version, or hold that commit when separation is unsafe. NEVER amend or rewrite planning or implementation commits, create any other docs/fixup commit or authorize past work retroactively. After commit verify the committed document content matches the latest approved content apart from classified progress records of that commit's task or committed for other tasks after approval, and that no pending revision remains. Follow planning, handoff-prep, commit and verification for the full contract.
- `git.orchestrator-accept-commit`: "Exclude other tasks"를 "Exclude other tasks; pending approved spec/plan revisions follow planning.plan-revision"으로 바꾼다.
- `placement.mjs` 4개 projection의 id를 교체한다.

### 6.2 런타임 제거

- `operations.mjs`: `OPERATIONS`와 `ROLE_OPERATIONS.orchestrator`에서 `plan-amend`를 뺀다.
- `cooperative-schema.mjs`: `validatePlanAmendArguments`, prepare 분기, `planAmend*` state 키 검증, plan-amend intent 검증을 삭제한다. 다른 곳에서 쓰지 않게 된 helper도 삭제한다.
- `evaluate.mjs`: 관련 import, `planDecision`, `unresolvedPlan`, prepare/checkpoint/reconcile 함수 3개, `runtime.plan-amend`, unresolved와 checkpoint 분기, prepare 분기를 삭제한다.
- `cooperative.mjs`: `readPlanAmendGit` 매개변수와 import, failed 특례, plan-amend 분기, 작업 목록의 `'plan-amend'`, checkpoint 처리를 삭제한다.
- `git-evidence.mjs`: `readPlanAmendGitEvidence`와 recovery ref 관찰 코드를 삭제한다.
- `scripts/update-runtime-assets.mjs`로 `shared/skill/runtime/*`와 `MANIFEST.sha256`을 다시 생성한다.

### 6.3 예전 state 호환

- **H-1**: 최상위 미지 키를 계속 허용한다. `planAmendments`와 `planAmendObservations`는 검증하지도 읽거나 쓰지도 않는다.
- **H-2**: `operation==='plan-amend'` intent는 공통 intent 검증만 받는다.
- **H-3**: schema 검증 직후, policy/target/versions 검사보다 먼저 판정한다.
  - 조건: `operation==='plan-amend'`이면서 status가 `prepared|unknown|mismatch|failed`인 intent가 있다.
  - 결과: 모든 명령을 `ruleIds:['cooperative.plan-amend-removed']`로 hold한다.
  - reason은 고정 문구다. "Legacy plan-amend intent is no longer supported; inspect Git history and any refs/arc/recovery/* refs manually, then start a new workflow"
  - nextActions: `['inspect-legacy-plan-amend','start-new-workflow']`
- **H-4**: 종료 상태(`succeeded|cancelled`)의 plan-amend intent는 무시한다.
- **H-5**: `prepare`에 `operation:'plan-amend'`가 들어오면 allow가 아닌 결과를 돌려준다. 예외로 죽지 않아야 하고 reason은 고정 문구다.
- **H-6**: `refs/arc/recovery/*` ref와 state 파일은 런타임이 삭제, 이동, 재작성하지 않는다.

### 6.4 cooperative 커밋 경로

런타임은 바꾸지 않는다. task.paths에 spec/plan 경로가 있으면 R-7(1)(2) 흐름이 막히지 않고, 없으면 기존 hold가 난다. 이 점은 5절의 handoff.md 문장으로 안내한다.

## 7. 테스트 변경

- `tests/node/runtime-plan-amend.test.mjs`를 삭제하고, H-1~H-5를 검사하는 `tests/node/runtime-legacy-plan-amend.test.mjs`를 추가한다. 삭제한 파일이 테스트 목록, parity, MANIFEST에 등록되어 있으면 함께 갱신한다.
- `tests/node/role-policy.test.mjs`: id, operations, evidence, placement 기대값을 바꾼다.
- `tests/node/fixtures/instruction-contracts.json`: profile Preservation 문구와 commit 문구를 새 본문에 맞춘다. coordination 문구는 유지한다.
- `tests/test_harness_contract.py`
  - `PLAN_UPDATE_CLASSIFICATION` 정규식을 R-7, R-11로 바꾼다.
  - `PLAN_AMEND_SAFETY`를 `PLAN_REVISION_COMMIT`으로 바꾼다.
  - `PLAN_AMEND_EVIDENCE`를 `PLAN_REVISION_EVIDENCE`로 바꾼다.
  - 두 adapter 모두에서 계약이 빠지면 실패해야 한다.
- `tests/test_arc_policy.py:307`: 섹션 이름을 "execution-time plan revision"으로 바꾼다. Preservation rule 원문 대조(1348행 부근)를 다시 확인한다.
- 남은 참조 grep: `docs/superpowers/**`를 뺀 저장소에 `plan-amend|planAmend|PlanAmend|old→new|refs/arc/recovery|evidence-after-plan-history-rewrite|execution-time-plan-amendment|planning-document commit amendment`가 남지 않아야 한다. legacy 테스트와 H-3 문구 안의 의도된 참조는 예외다.

## 8. 수락 기준

- **AC-P1**: `role-policy.json`에 `planning.plan-revision`이 6.1의 의미로 있고 `planning.plan-amend`는 없다.
- **AC-P2**: `placement.mjs`의 4개 projection이 새 id를 쓰고 projection 검증이 통과한다.
- **AC-P3**: 생성 섹션이 생성기 산출물과 같고 claude와 codex 모든 대상 파일에서 drift가 없다.
- **AC-P4**: `agent-fragments.json`에 amend 예외 문장이 없고 생성 profile과 fixture가 같다.
- **AC-G1**: 5절 표의 지침이 claude와 codex에서 같은 의미로 바뀌었고 R-1~R-12가 모두 지침에 있다.
- **AC-G2**: 바뀐 앵커로 들어오는 링크가 모두 유효하다.
- **AC-G3**: fresh Implementer 관련 "amendment" 문구와 테스트는 그대로다.
- **AC-R1**: 6.2 삭제 항목이 `lib/runtime`과 `shared/skill/runtime`에 남아 있지 않다.
- **AC-R2**: H-1~H-6이 테스트로 증명된다.
- **AC-R3**: `shared/skill/runtime`이 생성기 산출물과 같고 `MANIFEST.sha256`이 맞다.
- **AC-R4**: 기존 cooperative 커밋, 수락, 공유 경로 테스트가 계속 통과한다.
- **AC-T1**: 7절 테스트가 바뀌었고 대상 테스트가 통과한다.
- **AC-T2**: 전체 `npm test`와 pytest 실패 집합이 같은 실행 환경에서 기록한 baseline(HEAD ec91fc0)의 부분집합이다. 새 실패는 0개다.
- **AC-D1**: `docs/harness-operation.md`가 새 규칙과 맞다.
- **AC-D2**: `docs/superpowers/**`의 과거 문서에는 diff가 없다. 이 spec과 이 작업의 plan은 예외다.

## 9. 위험

- 생성 섹션, 앵커, 수동 관리 fixture가 동시에 바뀐다. 생성기를 먼저 돌린 뒤 grep과 앵커를 검사한다.
- claude와 codex 양쪽 parity가 깨질 수 있다.
- 대기 개정이 dirty state로 남아 역할이 이를 오인할 수 있다. 그래서 R-6 brief 기재가 필수다.
- 공유 계획 파일 변경이 다른 task의 fingerprint를 stale로 만들 수 있다.
- 예전 state에 미해결 intent가 있으면 workflow를 새로 시작해야 한다.
- 기준 테스트에 기존 실패가 있고 워크트리 실행 환경이 다르다. plan은 baseline 기록 단계와 실행 환경 조건을 따로 둔다.
- R-7(3) 예외가 남용될 수 있다.

## 10. 결정된 세부 사항 (Orchestrator)

- **D1**: R-10 hash 비교는 진행 기록 유무에 따라 판정한다(4절 R-10).
- **D2**: cooperative CLI가 단독 종결 커밋을 지원하지 않는 점은 문서화된 한계로 둔다.
- **D3**: task.paths 요건은 안내 문장으로만 둔다.
- **D4**: fresh Implementer 관련 "amendment" 용어는 유지한다.
- **D5**: 사본 경로는 R-5에 적은 경로로 정한다.

## 11. plan 단계에 넘길 작업 초안

| 작업 | 내용 | 선행 |
|---|---|---|
| T1 정책 원본 | role-policy.json, placement.mjs, agent-fragments.json, role-policy.test.mjs, 생성 섹션과 fixture. fresh QA를 둔다. | 없음 |
| T2 지침 | 5절과 python 계약 테스트 | T1 |
| T3 런타임 | 6.2, 6.3, 7절 node 테스트, runtime asset 재생성. fresh QA를 둔다. | T1. T2와 함께 `MANIFEST.sha256`을 고치므로 plan에서 순서를 정하거나 manifest 갱신 소유 작업을 하나로 정한다. |
| T4 운영 문서 | harness-operation.md와 잔여 grep | T2, T3 |

모든 작업이 수락된 뒤 최종 Reviewer를 1회 둔다. 작업마다 baseline 대비 실패 집합을 비교한다.

## 개정 이력

| 버전 | 승인 시각 | 분류 | 영향 작업 | 사유 |
|---|---|---|---|---|
| v1 | 2026-11-16 (spec 승인) | 최초 승인 | 전체 | - |
| v2 | 2026-11-16 (최종 Reviewer 지적 처리, 사용자 위임에 따른 Orchestrator 승인) | contract | 최종 Reviewer 후속 작업 | R-10이 Git blob OID와 내용 SHA-256을 섞어 쓰고, R-8 분리 뒤 먼저 커밋된 다른 작업의 진행 기록을 고려하지 않았다. R-6, R-10의 비교 기준을 바로잡는다. |
| v3 | 2026-11-16 (최종 Reviewer 재확인 N1 처리, 사용자 위임에 따른 Orchestrator 승인) | contract | 최종 Reviewer 후속 작업 | 6.1 rule text의 커밋 뒤 확인 요약이 v2의 R-10보다 좁았다. 다른 작업의 진행 기록도 허용하도록 맞춘다. |
