# 통제된 협력 실행 경로 설계

문서 대상: `/Users/yunho/Desktop/project/arc/docs/superpowers/specs/2026-10-23-controlled-execution-path-design.md`

문서 상태: 서면 승인용 spec 초안. 구현 계획은 별도 문서로 작성한다.

## 1. 목적과 준비된 실행 대상

ARC의 기존 runtime을 실제 작업 흐름에 연결하여, 지원하는 행동의 증거 수집·판정·실행 의도·실행 결과를 한곳에서 관리한다. Orchestrator는 중앙 경로의 허용 결과를 확인한 뒤 native 도구로 행동하고, 직접 확인한 결과를 해당 요청에 연결한다.

준비된 실행 대상은 다음과 같다.

| 항목 | 값 |
|---|---|
| 저장소·workspace | `/Users/yunho/Desktop/project/arc` |
| Git common directory | `/Users/yunho/Desktop/project/arc/.git` |
| 브랜치 | `feat/controlled-runtime-execution` |
| 준비 시 HEAD | `1e3a20fe7d04c6d93ba48dcea5af5d426b180177` |
| 준비 상태 | staged·unstaged·untracked 변경 없음 |
| 대상 선택 | 사용자가 current checkout에 새 브랜치 생성 선택 |
| 소유권 | Orchestrator가 대상·문서 저장·통합 담당, 겹치는 편집 없음 |

위 상태는 Orchestrator가 제공한 실제 준비 증거다. 이후 실행 허용에는 그 시점의 상태를 다시 확인한다.

## 2. 문제와 근거의 구분

사용자는 Planner의 spec/plan 문서를 커밋하기 전에 task 구현이 시작되었고, 구현 커밋 `8c3d5942` 뒤에 문서 커밋 `ff3fcbbb`가 생성되었다고 보고했다. 이 문서에서 해당 사례는 **사용자가 제공한 설명**으로 취급한다. 이번 spec 작성에서 그 두 커밋의 순서나 당시 Coder 시작 시각을 독립적으로 검증한 것으로 표현하지 않는다.

저장소 사전 조사에서 확인된 구조적 사실은 다음과 같다.

- 서면 정책은 필요한 승인 문서의 커밋과 Git 상태 확인을 Coder handoff 전에 요구한다.
- runtime에는 판정·상태 저장·Git 증거 수집·commit preflight/reconciliation 기반이 있다.
- 현재 public CLI에는 workflow lifecycle 진입점이 없다.
- runtime의 `assign-agent`는 pending assignment를 저장하며 실제 agent를 실행하지 않는다.
- 상태 최초 생성과 배정 결과 lifecycle이 완성되어 있지 않다.
- trusted host context와 native 실행 provider는 이 저장소에 제공되어 있지 않다.

따라서 이번 설계는 다음 인과관계를 기록하는 협력 경로를 추가한다.

> 승인 문서 버전 확인 → 실제 문서 커밋 확인 → 최초 Coder 배정 의도 저장 → native 배정 호출 → 직접 확인한 결과 기록

문서 커밋의 현재 ancestry나 커밋 시각만으로 과거 Coder 시작 순서를 증명하지 않는다. 최초 배정 직전 상태와 요청 correlation을 기록한다.

이미 시작한 작업에 나중에 문서 커밋을 추가해 과거 handoff를 정상으로 바꾸지 않는다. 기존 실행 이력이 불명확하면 이를 보존하고, 이후 재개를 위한 판단을 별도로 기록한다.

## 3. 기존 작업과 이번 범위의 경계

관련 기존 산출물은 다음과 같다.

- `docs/superpowers/specs/2026-10-20-cross-platform-runtime-gates-design.md`
- `docs/superpowers/plans/2026-10-20-cross-platform-runtime-gates.md`
- `docs/superpowers/plans/2026-10-20-t5-terminal-revision.md`

Orchestrator가 제공한 승인 범위에 따르면, 이전 plan의 T6에는 `lib/cli/runtime.mjs`와 native/provider/installer 연결이 포함되어 있었으나, T5 amendment와 사용자 승인으로 T6/T7, native provider, 설치 통합, 실제 native enforcement가 이전 작업 범위에서 명시적으로 제외되었다.

이번 승인은 **별도의 신규 협력 CLI와 운영 경로**를 위한 것이다. 이전 T6/T7의 복원이나 native 통합 재개로 취급하지 않는다. 기존 승인 기록과 산출물을 수정하거나 완료 상태를 소급 변경하지 않는다.

재사용 대상은 기존 작업에서 실제로 남아 있는 다음 기반이다.

- `lib/runtime/`의 schema·evaluate·gate·store·Git evidence·identity 기반.
- 기존 runtime 계약과 관련 검증 자산.
- runtime·정책·manifest 생성 경로.
- 현재 역할·handoff·승인·검증 정책.

기존 native adapter를 협력 CLI의 입력 변환기로 사용해 가짜 플랫폼 이벤트를 생성하지 않는다. 과거 계획에 파일명이 등장했다는 이유만으로 해당 구현 범위를 재개하지 않는다.

## 4. 목표와 제외 범위

목표는 다음과 같다.

- 지원 행동의 판정과 근거를 durable 상태로 남긴다.
- 첫 Coder 배정 전에 필요한 승인 문서와 실제 문서 커밋을 확인한다.
- 대상·scope·버전 변경, 중복 요청, 미확정 결과를 후속 행동의 보류 조건으로 다룬다.
- QA·Reviewer, acceptance·commit, 외부 작업까지 같은 상태·증거 계약으로 확장한다.
- 직접 관찰, 독립 검증되지 않은 진술, provider 검증을 구별한다.
- 기존 문서 생략 경로와 역할별 책임을 유지한다.

제외 범위는 다음과 같다.

- native hook 설치·수정.
- native provider·desktop agent API·installer 연동.
- 외부 skill 변경.
- 임의 shell 명령의 의미를 완전하게 해석하는 범용 통제.
- 중앙 경로 밖의 모든 행동 차단.
- 호출자의 실제 역할·신원에 대한 기술적 인증.
- 사용자 승인·설계 품질·review 충분성 등 사람의 판단 대체.
- 동일 로컬 사용자 권한의 악의적 변조를 막는 보안 시스템.

## 5. 선택한 협력 방식과 보장

검토한 방식은 다음과 같다.

| 방식 | 특성 | 결정 |
|---|---|---|
| 협력 경로 | CLI 판정·기록 후 Orchestrator가 native 호출과 결과 기록을 연결 | 승인된 기본 방식 |
| 실행 provider를 포함하는 controller | controller가 실제 실행과 결과 조회까지 수행 | 이번 범위에서 제외 |
| 단발 검사 명령 | 실행 의도·결과와 연결되지 않는 판정 출력 | 기록 공백 해소에 부족하여 채택하지 않음 |

CLI는 native `spawn_agent`를 호출하지 않는다. 직접 native 호출을 차단하거나 그런 호출이 없었다는 사실을 증명하지 못한다.

보장하는 것은 중앙 경로에서 수행한 검증, durable하게 기록한 판단 순서, 직접 관찰한 로컬 사실, Orchestrator가 확인했다고 진술한 승인·실행 결과다.

판정 후 native 호출 사이에 상태가 바뀔 수 있다. Orchestrator는 허용된 역할·task·대상·scope·버전을 그대로 사용하고 관련 변경이 있으면 새 판정을 받아야 한다. 이 준수는 협력 계약이다.

## 6. 증거와 신원 계약

### 6.1 출처 구분

| 출처 | 정의 | 보장 |
|---|---|---|
| 로컬 직접 관찰 | 코드가 직접 읽은 Git 객체·index·파일 내용·resolved path | 관찰 시점의 로컬 사실 |
| `operator-attested` | Orchestrator가 사용자 승인 또는 native 도구 결과를 직접 확인했다고 남긴 진술 | 독립 검증되지 않은 사람 진술 수준의 기록 |
| provider 검증 | trusted host가 실제 신원·이벤트·correlation을 확인하여 제공 | 기존 provider 계약이 검증하는 사실 |

`operator-attested`는 **진술의 출처 표시**로만 사용한다. 신원 인증, 권한 증명, 실제 플랫폼 이벤트 검증을 의미하지 않는다.

CLI 인자와 저장 상태에 있는 actor·approval reference·agent ID는 provider가 확인한 identity/event가 아니다. 이 경로는 임의 호출자가 다른 역할을 가장하거나 허위 진술을 입력하는 일을 기술적으로 막지 못한다.

판정·상태 조회·감사 기록에는 협력 모드와 증거 출처를 표시한다. 입력된 값을 `platform-event`로 포장하거나 provider 검증 증거로 재분류하지 않는다.

### 6.2 기존 trusted 경로 보존

현재 provider 경로의 필수 출처 조건을 전역으로 완화하지 않는다. 협력 모드에는 별도의 명시적 검증 계약을 두고, 공통 정책 조건과 Git 검증을 재사용한다.

`runtime.status: decision-only`, adapter의 `nativeVerified:false` 등 기존 표시는 실제 연결 수준 이상으로 승격하지 않는다. 협력 CLI의 coverage는 별도로 표현한다.

### 6.3 승인 기록

승인 기록은 다음을 연결한다.

- 직접 확인한 실제 승인 메시지 또는 확인의 참조.
- 확인했다고 진술한 operator.
- 승인 대상 task·역할·행동·경로·실행 대상.
- 승인된 scope 및 문서 버전.
- 증거 출처.

문서 내용 해시와 승인 메시지 내용 해시는 구별한다. 승인 참조 문자열을 입력했다는 사실만으로 실제 승인이 확인되었다고 취급하지 않는다.

승인의 의미와 충분성은 Orchestrator가 판단한다. 협력 기록은 그 판단을 보존하며 독립적으로 인증하지 않는다.

## 7. 공통 상태와 bootstrap

### 7.1 상태 계약

모든 단계는 같은 workflow 저장소와 버전 계약을 사용한다.

| 요소 | 역할 |
|---|---|
| workflow·schema version·mode·coverage | 지원 범위와 호환성 표시 |
| target | canonical workspace, Git common directory, branch/detached 상태, HEAD |
| policy/runtime 버전 | 판정에 사용한 규칙 버전 |
| actor·assignment·lease | 진술된 역할, task, 배정 범위와 활성 상태 |
| scope·approval·documents | 승인 범위와 문서 버전 |
| tasks·dependencies | task 상태와 선행 조건 |
| requests·intents·results | 요청 fingerprint, 판정, 실행 의도, 결과 |
| checks·findings·acceptances·commits | 후속 단계 근거 |
| audit·unresolved conditions | 실제 기록 순서와 미해결 불일치 |

actor·lease는 협력 경로 내부의 역할·작업 상관관계다. 실제 호출자의 인증된 신원을 의미하지 않는다.

나중 단계의 증거가 아직 없다는 사실과 해당 단계가 통과했다는 상태를 구별한다.

### 7.2 초기 생성과 저장

workflow 상태는 실제 관찰한 Git common directory 아래 ARC 전용 namespace에 둔다. workflow별 상태는 대상 경로에 묶어, common directory를 공유하는 worktree들을 혼동하지 않는다.

초기 생성은 다음을 만족해야 한다.

- 실제 Git root·common directory·branch/HEAD를 직접 확인한다.
- 대상 선택과 승인에 대한 진술 출처를 기록한다.
- 기존 workflow를 덮어쓰지 않는다.
- 경로 탈출·symlink 우회·잘못된 식별자를 거절한다.
- 존재하지 않는 승인·역할·배정 이력을 생성하지 않는다.
- root operator도 provider가 인증한 신원으로 표시하지 않는다.

bootstrap은 branch 전환, worktree 생성, stage 또는 commit을 수행하지 않는다.

저장은 기존 lock·revision·schema 검증·atomic replacement 기반을 확장한다. 저장 실패 시 durable한 허용이나 완료를 주장하지 않는다.

## 8. 요청과 실행 결과 lifecycle

지원 행동의 공통 흐름은 다음과 같다.

1. 상태와 직접 관찰 가능한 증거를 읽는다.
2. 요청의 행동·대상·scope·승인 버전을 검증한다.
3. 판정과 실행 의도를 하나의 transaction으로 저장한다.
4. `allow`이면 Orchestrator가 대응하는 native 행동을 수행한다.
5. 직접 확인한 반환과 재관찰 결과를 같은 요청에 기록한다.
6. 일치하면 완료 상태로 전이하고 불일치는 보존한다.

request ID와 정규화된 fingerprint를 함께 사용한다. 같은 ID에 다른 내용을 넣으면 거절한다. 과거 `allow`를 새로운 부작용의 허가로 재사용하지 않는다.

최소한 다음 상태를 구별한다.

- 거절 또는 보류.
- 실행 허용과 intent 저장 완료, 결과 없음.
- 실행 실패 확인.
- 실행 성공과 결과 일치 확인.
- 실행 여부 또는 결과 일치 불명.
- 실제 행동이 허용 내용과 불일치.

native 실행 동안 파일 lock을 유지하지 않는다. 요청·lease·revision과 미완료 상태로 충돌을 제어한다.

대상·scope·승인·문서·정책 또는 관련 상태가 바뀌면 새 실행 허용이 필요하다. 이미 발생한 행동의 결과는 기록하되, stale 허용으로 실행된 사실을 정상 준수로 바꾸지 않는다.

## 9. 1단계: 문서에서 Coder 배정까지

### 9.1 정확한 지원 범위

1단계는 완전한 승인 spec+plan 경로를 opt-in으로 지원한다.

필요한 CLI 기능은 다음과 같다.

| 기능 | 책임 |
|---|---|
| workflow 초기 생성 | 준비 대상과 기본 상태 생성 |
| 승인·문서 기록 | 진술 출처와 정확한 문서 버전 연결 |
| 배정 준비·판정 | 실제 Git 확인, 정책 판정, intent 저장 |
| 배정 결과 기록 | 직접 확인한 native 반환을 요청에 연결 |
| 상태 조회 | 보장 수준·부족한 증거·미확정 요청 표시 |
| 재관찰·복구 | 실제 상태와 기록 비교, 해결 근거 추가 |

CLI는 실제 Coder를 실행하지 않는다. 승인 문서의 커밋은 Orchestrator가 기존 절차로 수행한다.

### 9.2 최초 Coder 배정 조건

다음 조건을 모두 확인해야 한다.

- task·역할·경로·행동이 기록된 승인 범위에 있다.
- 실제 대상과 Git 상태가 준비·승인 기록에 맞는다.
- 필요한 spec과 plan의 정확한 버전이 승인되어 있다고 기록되어 있다.
- 두 문서가 정확한 문서 집합으로 커밋되어 있다.
- 실제 Git 객체 내용이 승인 문서 해시와 일치한다.
- 현재 문서 상태가 승인 버전에서 달라지지 않았다.
- 문서 커밋이 현재 대상의 적절한 이력에 존재한다.
- 충돌하는 활성 배정이나 이전 실행 여부 불명 상태가 없다.
- 최초 intent에 문서 커밋·문서 버전·대상·correlation을 저장할 수 있다.

배정 결과는 실제 native 반환에서 확인한 agent ID와 요청 연결을 기록한다. 해당 ID는 `operator-attested` 결과이며 인증된 플랫폼 신원이 아니다.

### 9.3 기존 실행과 소급 처리

새 workflow 생성만으로 이전 실행이 없었다고 보장하지 않는다.

기존 구현·배정이 알려져 있거나 이력이 불명확하면 이를 기록한다. 늦은 문서 커밋 뒤 기존 Coder를 계속 사용해도 최초 준수 배정으로 표시하지 않는다.

복구 후 재개에 대한 새로운 판단은 기록할 수 있다. 과거의 증거 공백은 유지한다.

## 10. 9개 영역의 단계별 적용

모든 실행 전 통제는 중앙 경로에 요청된 지원 행동에만 적용된다.

| 영역 | 실행 전 통제 | 탐지·기록과 사람의 판단 | 필요한 증거·연결 |
|---|---|---|---|
| 문서 커밋 선행 | 1단계: 필요한 문서·승인·커밋 없이 Coder 배정 불허 | 과거 시작 순서와 직접 호출 부재는 증명 불가 | 실제 Git, 승인 버전, 최초 intent·correlation |
| 대상·worktree·stale state | 1단계부터 대상·revision·버전 불일치 보류 | 대상 선택은 사용자 판단. 호출 사이 변경은 사후 발견 가능 | 직접 경로·Git 관찰, 선택 기록 |
| 역할·task·scope·path | 1단계 배정 범위, 후속 단계 지원 행동별 범위 검증 | 실제 호출자 인증과 agent 내부 모든 행동 통제는 제공하지 않음 | 역할 진술, assignment, resolved path, descriptor |
| 범위 확대·재승인 | 1단계부터 기록된 변경에 대해 기존 허용 무효화 | 의미적 요구 확대의 식별·재분류는 Orchestrator 판단 | scope·문서·승인 버전, 영향 task |
| QA·Reviewer 순서·freshness | 2단계: 필요한 check·독립성·순서·diff 조건 없으면 보류 | check 적절성·review 품질·finding 해결은 역할별 판단 | descriptor·결과·역할 기록·fingerprint·finding |
| acceptance·집중 커밋 | 2단계: 수용 근거·실제 index·task 범위 불일치 보류 | 동일 파일의 의미상 무관 변경은 사람의 검토 필요 | acceptance, check/finding, index tree·paths, 실제 commit |
| 동시성·replay·재시작 | 1단계부터 충돌·stale revision·중복 효과·불명 요청 보류 | 불확실한 실제 실행은 재관찰·판단 필요 | intent/result, lock·revision·correlation |
| 외부 작업 승인 | 3단계: 행동·대상·scope를 특정한 승인 없이 불허 | 승인 해석·외부 결과 확인은 사람에게 남음 | 승인 출처, destination/ref/environment, 실제 결과 |
| audit·reconciliation | 1단계부터 미해결 불일치가 영향받는 후속 행동 보류 | 경로 밖 전체 이력·악의적 로컬 변조는 증명하지 못함 | 요청→판정→결과→전이, 재관찰·해결 기록 |

9개 영역 모두 중앙 경로에서 다룰 수 있지만, 배정 gate 하나로 후속 행동까지 통제하지 않는다. 각 행동이 해당 단계의 요청·판정·결과 경로에 연결되어야 한다.

### 10.1 2단계의 명시적 범위

2단계는 task lifecycle, QA/check와 finding, 최종 Reviewer, Orchestrator acceptance, 집중 commit의 preflight·결과 reconciliation을 연결한다.

significant plan work는 task별 필요한 QA와 Orchestrator 수용·집중 커밋 뒤, 전체 task 수용 후 최종 전체 변경에 대해 Reviewer를 한 번 수행한다. Reviewer를 task별 필수 gate로 추가하지 않는다.

최종 plan Reviewer finding은 기존 정책대로 Coder→Reviewer 재확인을 적용한다. 그 이전의 필요한 QA와 실패 재확인을 유지한다. plan 없는 significant/high-risk 경로의 Reviewer 의무도 유지한다.

check·review·acceptance는 실제 diff 버전에 연결한다. 이후 변경이 해당 근거를 자동으로 통과하지 않는다.

CLI는 수용 근거를 확인하고 기록하며 Orchestrator의 수용 판단을 대체하지 않는다.

commit은 사전 허용과 완료를 구별한다. 실제 parent·tree·paths·HEAD·잔여 변경이 예상과 맞아야 완료 처리한다.

### 10.2 3단계의 명시적 범위

3단계는 지원되는 push·merge·deploy·publish 등 외부 행동의 명시 승인, intent, Orchestrator가 수행한 행동, 직접 확인한 결과를 연결한다.

지원 행동별 정확한 대상과 descriptor를 사용한다. 임의 shell 문자열을 범용 외부 행동으로 허용하지 않는다. 로컬 commit 권한을 외부 행동 권한으로 확장하지 않는다.

provider 검증이 없으면 결과는 `operator-attested`로 표시한다. 확인하지 못한 결과는 완료 처리하지 않는다.

## 11. 문서 생략 경로 호환성

기존에 유효한 문서 생략 경로에 새 spec/plan 의무를 만들지 않는다.

1단계의 미지원 경로는 명시적으로 안내한다. 빈 문서나 가짜 `plan` 모드로 통과시키지 않으며, 생략 경로 사용 자체를 정책 위반으로 표시하지 않는다.

후속 지원에서는 문서 존재 대신 생략 조건·적용 근거·scope·수용 기준을 기록하고 해당 정책을 검증한다. 대상 선택, Git 상태, ownership, 승인 범위, handoff 증거는 유지한다.

미지원 행동을 정상 허용이나 준수 완료로 표시하지 않는다.

## 12. 오류·보류·복구 UX

출력에는 다음을 제공한다.

- 판정과 rule ID.
- 협력 모드와 증거 출처.
- workflow·task·request·revision.
- 대상과 관련 버전 요약.
- 부족하거나 불일치한 증거.
- 다음에 필요한 관찰·판단·복구 조치.

| 상황 | 처리 |
|---|---|
| 문서 커밋 없음·내용 불일치 | 배정 보류, 부족한 문서·버전 표시 |
| 대상·HEAD·정책 변경 | 새 증거와 판정 요구 |
| 같은 요청 ID에 다른 내용 | 요청 충돌 거절 |
| intent 저장 후 중단 | 결과 미확정 상태 유지 |
| native 호출 후 결과 저장 전 중단 | 자동 재배정 금지, 실제 결과 확인 요구 |
| 실제 결과와 허용 내용 불일치 | 결과 보존, 영향받는 후속 행동 보류 |
| lock·저장·schema 오류 | 허용·완료를 주장하지 않고 오류 보고 |
| 미지원 mode·행동 | 지원 범위 안내 |

복구는 실패나 과거 이력을 삭제하지 않는다. 실제 관찰, 해결 판단, 재개 근거를 추가한다. 범용 `force allow`나 자동 lock 탈취를 제공하지 않는다.

## 13. 구현 영향과 정책 변경

정본은 `lib/runtime/`이다. 기존 기반을 확장하여 중복된 판정 엔진이나 호환되지 않는 두 번째 상태 저장소를 만들지 않는다.

주요 표면은 다음과 같다.

- `lib/cli/root.mjs`, `bin/arc.mjs`: 신규 협력 workflow 명령과 안내.
- `lib/runtime/`: bootstrap, 협력 provenance, intent/result lifecycle, 기존 판정·Git 검증 연결.
- 역할·handoff·planning·verification 안내: 실제 사용 경로와 보장 범위.
- `lib/policy/role-policy.json`: 필요한 source-of-truth 변경.
- `scripts/update-runtime-assets.mjs`: Codex/Claude runtime 복사본 생성.
- `scripts/update-role-policy.mjs`: 생성 정책·역할 표면 갱신.
- `scripts/update-manifest.mjs`: payload 해시 갱신.

`codex/skill/runtime/`, `claude/skill/runtime/`와 생성된 agent profile을 개별 수작업으로 수정하지 않는다. Planner의 draft-only 책임과 Orchestrator의 수용·Git 책임을 유지한다.

payload 재생성과 manifest 갱신은 배포 정합성 작업이다. native gate의 설치 등록이나 installer 연동 재개를 포함하지 않는다.

`planning.md`의 runtime 추가 금지에는 다음 의미의 좁은 예외를 둔다.

> 승인된 저장소 내부 협력 실행 경로는 기존 runtime을 재사용할 수 있다. 지원 행동, 증거 출처, 실행 의도와 결과의 연결, 직접 호출과 신원 가장을 기술적으로 막지 못하는 한계를 명시해야 한다.

구조 검사가 실제 runtime 준수를 증명하지 않는다는 설명, 소급 준수 금지, 외부 skill 변경 제한은 유지한다. Codex/Claude 대응 안내는 같은 의미를 가져야 한다.

## 14. 무결성과 보안 경계

경로 canonicalization, schema, 파일 형식·권한, request fingerprint, lock·revision, 실제 Git 재관찰은 우발적 오작동과 기록 불일치를 줄이는 장치다.

이 설계는 다음을 주장하지 않는다.

- actor 필드가 실제 호출자의 역할을 인증한다.
- approval reference가 실제 사용자 승인을 증명한다.
- agent ID가 실제 플랫폼 이벤트를 독립 검증한다.
- `operator-attested` 기록이 허위 진술 입력을 차단한다.
- `allow`가 native 실행 성공을 의미한다.
- audit가 변조 불가능하다.
- 직접 호출이나 동일 권한 사용자의 악의적 행동을 차단한다.

증거 연결에 필요한 정보만 저장하고 비밀정보·전체 도구 출력을 불필요하게 보존하지 않는다. 기록 문자열을 명령이나 신뢰할 지침으로 취급하지 않는다.

## 15. 수용 기준

1. bootstrap부터 판정·intent·result까지 durable하게 연결된다.
2. 증거 누락·저장 실패 시 허용·완료를 잘못 출력하지 않는다.
3. 첫 Coder 배정 전에 정확한 승인 문서와 실제 문서 커밋을 확인하고 intent에 연결한다.
4. ancestry나 늦은 문서 커밋으로 과거 준수를 소급 인정하지 않는다.
5. 사용자 보고·직접 관찰·operator 진술·provider 검증을 구별한다.
6. 협력 입력을 검증된 identity/event로 가장하거나 기존 provider 요구를 약화하지 않는다.
7. 신원 가장·직접 호출 차단을 보장하지 않는 한계를 출력과 안내에 명시한다.
8. 대상·scope·승인·문서·정책 변경과 stale revision을 영향받는 실행의 보류 조건으로 처리한다.
9. 재시작·중복 요청·결과 불명이 자동 중복 실행으로 이어지지 않는다.
10. 결과 불일치를 보존하고 재개 근거를 별도로 기록한다.
11. 기존 omission 경로에 새 문서 의무를 만들지 않는다.
12. 9개 영역의 단계별 지원 범위를 표시하고 미구현 기능을 준수 완료로 표시하지 않는다.
13. 2단계의 check·review·acceptance는 실제 변경 버전에 연결되고 commit은 결과 reconciliation 후 완료된다.
14. 3단계의 외부 행동은 행동·scope·대상을 특정한 승인에 연결된다.
15. 기존 T5 amendment와 승인 범위를 유지하며 이전 T6/T7 또는 native/installer 통합을 재개하지 않는다.
16. 기존 승인 기록·산출물을 수정하지 않고 runtime 정본·생성물·manifest 정합성을 유지한다.

## 16. 검증 개요

향후 구현 검증은 다음 행동을 중심으로 계획한다.

- 문서 커밋 전 배정 거절과 정확한 커밋 뒤 허용.
- 기존 실행·늦은 문서 커밋의 소급 정상화 방지.
- target·문서 해시·승인 버전·scope·revision 불일치.
- 협력 provenance와 기존 trusted-provider 경로의 분리.
- 최초 생성, 중복 요청, 동시 요청, 중단·재시작·불명 결과.
- 기존 omission 및 QA·Reviewer 계약 보존.
- 후속 단계의 freshness·acceptance·commit 결과·외부 승인.
- CLI 오류 안내, runtime parity, 역할 정책, manifest 정합성.

기존 `runtime-*`, `role-policy`, `cli`, `manifest` 검증 자산을 재사용하고 필요한 행동 검증을 계획한다. 이 spec 작성에서는 코드 수정·파일 저장·명령·검사·테스트를 수행하지 않았다.

## 17. 위험과 후속 결정

잔여 위험은 중앙 경로 우회, 신원·승인·결과에 대한 허위 또는 잘못된 진술, 판정과 native 실행 사이 변경이다. 이 한계를 안내와 audit에 유지한다.

실행 여부 불명을 해결할 때 플랫폼 조회 정보가 부족할 수 있다. 확인 불가능한 결과를 자동 성공이나 자동 실패로 변환하지 않는다.

세 단계의 공통 계약과 적용 범위는 이 spec에서 정한다. 구체적인 명령명·인자·직렬화 필드·독립 구현 단위는 별도 plan에서 결정한다. 그 결정이 증거 등급·보장 범위·기존 승인 경계를 바꾸면 설계 변경으로 다룬다.

native provider·hook·installer 통합이나 전역 강제 실행을 추가하려면 별도의 범위 결정이 필요하다.
