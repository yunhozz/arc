# 작은 작업 fast path와 Task Envelope 설계

상태: **초기 설계 초안**. 정식 spec, implementation plan 작성 전.

## 1. 목적과 범위

사용자는 간단한 작업에서도 역할 에이전트가 지침을 반복해서 확인하느라 시간이 걸리는 문제를 줄이기 위해 다음 세 단계를 모두 적용하도록 요청했다.

1. 기존 small/direct path를 선택할 수 있는 충분조건을 먼저 짧게 판정한다.
2. 적용 지침의 revision/hash, 대상·승인, 범위·criteria, 위험, TDD, 필수 검증을 기존 작업 기록에 연결한다.
3. 상태가 달라지면 영향받는 판단과 증거만 갱신하고, 불확실하면 기존 전체 평가 경로로 돌아간다.

목표는 새로운 권한이나 예외를 만드는 것이 아니라, 기존 계약을 충족하는 간단한 작업에서 불필요한 전체 문서 판독과 재서술을 줄이는 것이다. 이 변경 자체는 여러 플랫폼, 역할 정책, handoff, 검증 계약과 회귀 검사를 함께 다루는 Architectural 변경이다.

승인된 대상: `/Users/ma-24-007/Desktop/workspace/arc`, `refactor/arc-instructions`, HEAD `7de7541aaa9daf45bfec3019825ee8a46fbf6172`, clean.

### 범위에 포함

- Codex와 Claude 진입 지침에서 fast path와 full path 선택 순서를 정의한다.
- 직접 경로의 기존 조건을 충분조건 체크리스트로 명확히 하되, 하나라도 입증되지 않으면 기존 전체 평가로 보낸다.
- 현재 handoff record와 brief 안에 짧은 작업 봉투를 두고, 기존 승인·대상·상태 기록을 재사용한다.
- 변경된 지침·범위·대상·파일·소유권에 따라 영향을 받는 판단과 증거를 무효화하고 재평가하는 규칙을 정의한다.
- 양 플랫폼의 계약 검사와 문서 설명을 정렬한다.

### 범위에서 제외

- prompt compiler, 새 runtime service, 별도 증거 DAG 또는 두 번째 영속 원장
- TDD, 사용자 승인, 대상 선택, 역할 신선도, QA/Reviewer 또는 acceptance 기준 완화
- task 크기, 파일 수, 토큰 수만으로 fast path를 자동 허용하는 분류기
- 실시간 준수 보장이나 측정하지 않은 처리 시간 단축률 주장

## 2. 현재 계약과 변경 이유

현재 Codex와 Claude 진입점은 small-task, plan-omission, TDD 예외를 분류하기 전에 handoff의 전체 조건과 planning·verification 기준을 읽게 한다. 예: [Codex SKILL.md](../../../codex/skill/SKILL.md), [Claude SKILL.md](../../../claude/skill/SKILL.md). 작은 작업의 직접 경로는 이미 있고, 조건은 각 플랫폼의 `skill/references/handoff.md`에 정의되어 있다. 중요한 위험 trigger는 `verification.md`가 소유한다.

기존 canonical handoff record는 승인·대상·Git 상태와 재사용 근거를 기록하고, coordination brief는 고정된 필드 순서 및 변경된 필드만 전달하는 방식을 규정한다. 따라서 새 데이터 저장소를 만들 이유는 없다. 이 설계는 기존 기록에 빠른 경로 선택과 근거 재사용을 연결한다.

대상 선택과 작업 상태도 분리해야 한다. 승인된 commit 이후 HEAD가 달라졌다는 사실은 새 HEAD·변경 상태·보존·소유권을 검토하게 하지만, 그 사실만으로 기존 대상 선택을 자동 취소하지는 않는다. 기존 선택의 workspace/repository 신뢰성이나 승인 범위가 달라진 경우에만 관련 target/scope 결정을 다시 받는다.

현재 repo에는 자동 역할별 instruction pruning이나 prompt 재사용 runtime이 없다. 역할 profile은 완전한 계약으로 제공된다. 그러므로 최적화는 Orchestrator의 지침 읽기 순서와 brief의 중복을 줄이며, profile 권한이나 플랫폼 동작에 기대는 새 보장을 만들지 않는다.

## 3. 1단계: 충분조건 fast path

진입점은 짧은 fast-path gate를 먼저 본다. 아래 조건을 **모두 접근 가능한 근거로 입증할 수 있을 때만** 이미 존재하는 small/direct path를 선택한다.

| 조건 | 필요한 근거 |
|---|---|
| 승인과 결과가 구체적임 | 요청 또는 유효한 승인이 결과, 범위, criteria와 편집 경계를 정함. 중요한 제품 동작·방법·위험 결정이 미결 상태가 아님. |
| 변경이 하나의 좁은 local change임 | 원인·영향이 이해되고 되돌릴 수 있음. 파일 수나 LOC만으로 판단하지 않음. |
| 의존성이 없음 | dependent stages, cross-component shared state, lifecycle/integration-order 문제가 없음. |
| significant risk가 없음 | shared role/behavior contract, shared state, security/permissions, data loss/migration, public interface, costly install/deploy/rollback 등 기존 trigger를 배제함. |
| 검증 경로가 하나로 명확함 | criteria별 결과를 확인할 focused check와 필요한 독립 검증 역할을 식별함. |
| 대상·보존·소유권이 유효함 | 명시적 target choice 또는 유효한 동일 범위 재사용, 현재 workspace와 파일 상태, unrelated change 보존, 활성 소유권 충돌 부재를 확인함. |
| TDD 판단이 완료됨 | 변경 성격에 따른 기존 TDD 요구를 식별함. waiver/문서 예외는 기존 조건을 충족하고 편집 전에 기록된 경우만 사용함. |
| 지침과 근거가 접근 가능하고 일치함 | 적용 지침 source와 필요한 brief/approval evidence를 확인할 수 있고 충돌이나 누락이 없음. |

위 목록은 **경로를 선택하기 위한 충분조건**이다. 편집 권한·handoff gate·승인·TDD 실행·QA·Reviewer·acceptance를 대신하지 않는다. 실제 첫 편집 또는 Implementer first start/restart 전의 기존 공통 gate와 역할 생성 규칙은 그대로 적용한다.

빠른 선택은 handoff의 기존 canonical direct-path 정의와 연결하고, significant-risk 목록 및 planning-depth 의미의 단일 소유 원천을 유지한다. 해당 원천의 전체 파일을 항상 읽게 하는 대신, gate가 인용한 정확한 섹션/체크리스트만 먼저 확인할 수 있게 한다. 직접 경로에 조건을 충분히 포함할 수 없거나 의미가 모호하면 관련 planning·verification·handoff 전문으로 즉시 승격한다. 필수 TDD, 역할 할당, Git preparation 등 이후 행동을 촉발하는 reference는 해당 행동 전에 계속 읽는다.

## 4. 2단계: Compact Task Envelope

Task Envelope는 새로운 승인 객체나 원장이 아니라, 기존 canonical handoff record 또는 small/direct inline scope record에 두는 짧은 상태 요약이다. specialist brief에 전달할 때도 기존 coordination brief의 필드 순서를 바꾸지 않고 관련 필드 안에 둔다.

| 필드 | 요약할 내용 |
|---|---|
| 작업·경로 | task 식별자와 선택 경로(fast path 또는 full path) |
| 적용 지침 | source 경로/종류, 접근 상태, 해당 작업에서 읽은 지침 revision 또는 정확한 content hash. 사용자 지침은 메시지 참조와 적용 범위. |
| 대상·승인 | absolute workspace/repository, branch/detached HEAD, 확인한 작업 트리 상태, target 선택/재사용 근거와 승인 참조 |
| 범위·criteria | 허용된 파일·소유권·요청 결과·acceptance criteria 또는 정확한 승인 문서 참조 |
| 위험·깊이 | fast-path 충분조건별 짧은 근거, significant trigger 결과, 적용한 plan/spec 판단 |
| TDD | 요구되는 절차·reference 또는 사전 기록된 waiver/비동작 예외의 범위와 이유 |
| 검증 | focused checks와 criteria 연결, 필요한 QA/Reviewer 및 시점, 수락 경계 |
| 재평가 | 마지막 확인 상태, 이후 알려진 변경, 영향을 받은 판단·증거와 해소되지 않은 hold |

지침 revision/hash는 repo HEAD와 별개로 기록한다. 해시는 지침 내용을 식별하는 값일 뿐 권한·승인·의미 판단·실제 runtime 준수를 증명하지 않는다. 동일한 지침 source가 같은 대화 문맥에 있고 그 내용이 바뀌지 않은 경우 이미 읽은 지침 의미를 재사용한다. 재사용 전에는 적용 source의 revision/hash를 한 번에 확인하되, 지침 본문을 모델 context에 다시 넣지는 않는다. 새 역할에는 hash만 주지 않고 native profile과 brief에 필요한 실제 지침/정확한 섹션 경로를 제공한다. source/hash를 확인할 수 없거나 새 역할의 필수 입력이 불완전하면 fast path를 사용하지 않고 기존 전체 확인 흐름을 따른다.

Hash 수집이 매 task마다 전체 문서를 다시 모델 context에 넣는 절차가 되지 않도록 한다. 적용 지침 set의 revision은 처음 읽을 때 기록한다. 이후 빠른 비교를 위해 적용 파일의 현재 hash를 한 번에 확인하고, 같으면 이전 판단을 재사용한다. 새로운 대화/문맥 소실, hash 차이, 또는 접근 상태 변화가 있으면 달라진 파일만 다시 읽고 영향받은 판단을 갱신한다. 정확한 hash 집합, 명령과 필드 표기는 formal spec에서 기존 installer/manifest capability 및 플랫폼 차이를 확인한 뒤 고정한다.

Envelope가 요구하는 기록은 이미 승인된 record나 brief를 참조하고 새로 반복해서 쓰지 않는다. 저장 record를 사용할 수 없는 현재 direct path에서는 기존 계약이 허용하는 inline scope record를 유지하며, 승인·대상·criteria 같은 필수 필드를 삭제하지 않는다. Envelope만으로 작은 작업에 별도 spec/plan, 새 commit, 새로운 영속 storage 의무를 만들지 않는다.

## 5. 3단계: 영향별 무효화와 fail-closed 복귀

Envelope의 최초 평가를 보존하고, 기존 handoff가 요구하는 first-edit, assignment/restart, resumption, acceptance 지점에서 현재 상태와 적용 지침 revision을 확인한다. 알려진 관련 변화가 중간에 발생하면 다음 종합 재검토까지 미루지 않고 영향을 받은 작업을 보류한다.

| 변화 | 처리 |
|---|---|
| 승인된 HEAD/dirty 변화 | 현재 diff·보존·소유권과 관련 criteria/check 영향을 갱신한다. 영향이 없다고 근거를 대면 기존 target choice와 무관한 판단은 유지한다. HEAD 변화만으로 target choice를 자동 취소하지 않는다. |
| 적용 지침 source/hash 변화 | 달라진 source 및 연결된 fast-path/TDD/risk 판단을 다시 읽고 판정한다. 영향이 확인될 때까지 관련 fast-path 선택을 재사용하지 않는다. |
| 승인 범위·criteria·방법·risk 변화 | 영향받는 task와 결정만 hold하고, 기존 reassessment 및 필요한 수정 승인/target/preparation 절차로 돌아간다. |
| workspace/repository/target 변화 또는 신뢰성 상실 | 관련 target/ownership 승인 재평가를 요구한다. 필요한 명시적 target choice가 없으면 dependent edit/handoff를 보류한다. |
| 파일 충돌·활성 편집 소유권 변경·실패·partial/unknown state | 영향받은 edits/checks를 즉시 중단하고 기존 보존·incident/recovery 규칙을 따른다. 해결되지 않은 상태를 fast path로 우회하지 않는다. |
| 지침·근거 누락/접근 불가/충돌/영향 불명 | fast-path 충분조건은 미입증으로 처리하고 해당 입력이 해결될 때까지 dependent work를 보류한다. 분류를 재개할 때 기존 전체 handoff/planning/verification path를 따른다. |
| direct check 실패 또는 QA finding | 기존 Implementer/recheck ownership으로 넘긴다. Envelope 갱신이 Orchestrator 자기수정 권한을 주지 않는다. |

전체 경로 복귀는 이전 유효 승인 전체를 자동 폐기하거나 새 권한을 부여한다는 뜻이 아니다. 기존 정책에 따라 영향받는 조건·승인·증거만 재검증하고, 유효한 unchanged 근거는 재사용한다. 모든 필수 확인이 끝나기 전에는 관련 작업을 수락하지 않는다.

## 6. 보존하는 하네스 동작

- 단순 질의·몇 개의 알려진 파일 읽기는 현재처럼 Orchestrator가 처리한다.
- fast-path 조건에서 벗어난 구현은 fresh Implementer와 해당 risk에 필요한 fresh QA/Reviewer 규칙을 따른다.
- 같은 task의 수정·recheck 재사용, plan/criteria amendment에 따른 Implementer 재시작, Planner 소유권을 유지한다.
- TDD override, 사전 waiver 조건, focused checks, significant-risk trigger를 유지한다.
- QA/Reviewer 독립성, correction owner, acceptance/commit 역할과 plan-task 경계를 유지한다.
- Codex/Claude의 native profile, reference adapter와 서로 다른 도구 지원을 동일하게 취급하지 않는다.
- prompt-level 판단을 실제 observer/hook/runtime enforcement인 것처럼 표현하지 않는다.

## 7. 변경 및 검증 대상

Formal spec에서 정확한 문구와 파일을 고정한다. 현재 확인된 연결 범위는 다음과 같다.

| 영역 | 역할 |
|---|---|
| 양 플랫폼 `skill/SKILL.md` | 직접 경로 fast gate로의 초기 진입과 full-path fallback 연결 |
| 양 플랫폼 `skill/references/handoff.md` | 기존 direct-path 정의, task envelope 필드, invalidation/re-evaluation 조건 |
| 양 플랫폼 `planning.md` / `verification.md` | 기존 plan-depth·significant-risk 단일 소유 원천과 section-level read trigger 정렬 |
| 양 플랫폼 `coordination.md` | 기존 brief field order를 유지하며 필요한 envelope summary를 전달 |
| `docs/harness-operation.md` | 실제 prompt-level 운영 방식과 문서 설명 동기화 |
| `tests/node/instruction-layout.test.mjs`, `tests/test_claude_payload.py`, 관련 fixtures 및 계약 검사 | 기존 full-read 문구 의존 assertion을 fail-closed fast gate assertion으로 교체하고 위험/승인/TDD/role 경계 보존 |

회귀 기준은 두 종류다.

1. **빠른 경로의 보수성:** 모든 충분조건이 명확히 참인 좁은 작업만 fast path를 얻고, 한 조건이라도 거짓·불명·누락이면 기존 전체 평가를 사용한다.
2. **동작 동등성:** 승인·target choice·scope·TDD·risk·role freshness·QA/Reviewer·acceptance/commit 결정은 현재 계약과 일치한다. 승인된 HEAD/dirty 변화는 target choice를 자동 무효화하지 않고 실제 영향에 연결된 evidence만 새로 평가한다.

구조 검사는 작성된 계약의 일관성만 입증한다. 실제 처리 시간 감소는 별도 대표 작업 측정으로 확인해야 한다. 기록할 수 있는 경우 reference re-read 횟수/범위, agent spawn 횟수, end-to-end 지연을 분리해 비교하며 사전 단축률을 약속하지 않는다.

## 8. 남은 formal-spec 결정

- 간결한 충분조건과 단일 소유 risk trigger 사이의 연결 및 section-level 읽기 범위를 양 플랫폼에서 정한다.
- 지침 revision/hash가 설치된 Codex/Claude profile과 project-local instruction source를 식별하는 현실적인 방법을 선택하고, 접근 불가 시 fail-closed 동작을 검증한다.
- 현재 brief 고정 순서를 유지하는 정확한 envelope placement와 최소 field schema를 정한다.
- 구조 계약과 fixture 갱신 범위, 현재 기준선에서 불일치하는 Python literal 검사 처리 방법을 정한다.
- 구현에 필요한 focused test 작성/실행 범위를 정하고 사용자 승인 여부를 확인한다.

정식 spec과 plan은 이 초기 설계에 대한 사용자 승인 이후에만 작성한다. 기존 승인, handoff, risk 판단을 임의로 변경하지 않으며 새로운 product decision이 필요하면 Orchestrator가 사용자에게 먼저 묻는다.

## 9. Orchestrator review와 self-review

- 사용자 선택의 세 단계를 모두 포함했다. prompt compiler나 runtime gate DAG를 대신 선택하지 않았다.
- sufficient-condition path와 실제 권한·공통 handoff gate를 분리했다.
- 새로운 record store를 추가하지 않고 기존 canonical record와 brief를 확장한다.
- revision/hash를 승인·의미·준수 증거로 취급하지 않으며 새 역할에 실제 적용 지침을 계속 제공한다.
- 승인된 HEAD/dirty 변화, target-choice 유효성, 검증 evidence 무효화를 서로 구분했다.
- Codex/Claude reference gate, role freshness, TDD, QA/Reviewer, acceptance와 commit 경계를 유지한다.
- 실행 시간 단축을 보장하지 않고 추후 별도 측정 대상으로 남겼다.
- 정책·코드·테스트를 변경하거나 실행하지 않았다. 정식 spec/plan도 아직 없다.
