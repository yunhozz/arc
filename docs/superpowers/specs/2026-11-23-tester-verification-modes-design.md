# Tester 검증 모드와 전체 회귀 대체 — 설계 명세

- 날짜: 2026-11-23
- 상태: written spec v1.4 (2026-11-23 사용자 승인, v1.4 개정 2026-11-24 승인)
- 깊이: Architectural (spec + plan)
- 근거: 설계 승인(2026-11-23 사용자 "승인"), 실행 대상 결정 "새 worktree+브랜치"
- 소스: `/Users/yunho/Desktop/project/arc`, `master`, HEAD `f786e4a1155287eff80d4abe56f7cebaf6598e3b` (clean)
- 실행 대상: `.claude/worktrees/tester-verification-modes`, 브랜치 `feat/tester-verification-modes`, base `f786e4a1155287eff80d4abe56f7cebaf6598e3b`
- 적용 범위: 범용(프로젝트 비한정) ARC 정책, 4개 플랫폼(claude/codex/gemini/grok) 대칭, host 중립

## 1. 의도와 배경

현행 ARC는 최종 검증 안에서 트리거 (1)~(4) 중 하나가 해당하거나 판단할 수 없으면, QA가 추가 승인 없이 전체 회귀를 1회 실행한다(`verification.md` "Full regression" 문단). 공유 모듈 정의가 넓어서 사실상 거의 모든 변경이 전체 회귀로 이어진다. 그 결과 시간 비용이 크고, bridge timeout(현행 `arc_qa` 30분)을 넘기며, 부하로 인한 간헐 실패도 섞인다.

이 작업은 세 가지를 한다.

- (A) 검증 역할 하나를 brief 필드 `mode: task | final`로 두 모드로 운영한다.
- (B) 역할 명칭을 QA에서 Tester로 전면 변경하고, legacy 읽기 호환을 둔다.
- (C) 전체 회귀 자동 실행을 없애고 트리거별 대체 검사로 바꾼다. 판단 불가 항목만 사용자 결정을 거쳐 전체 회귀를 실행한다.

최종 검증이 보장하는 의미는 그대로 둔다.

## 2. 목표·비목표·anti-goal

**목표**

- G1. 검증 역할을 task 모드와 최종 모드로 나눠 배정하고, 모드마다 범위·탐색 권한·금지 사항을 정의한다.
- G2. 전체 회귀를 자동으로 실행하지 않는다. 같은 위험은 트리거별 대체 검사와 순서가 고정된 영향 범위 절차로 다룬다.
- G3. 판단할 수 없는 영역은 unverified로 남기고, 사용자 disposition 경로를 정의한다.
- G4. QA 명칭을 Tester로 전면 변경하되, 기존 설치·설정·state·dispatch 기록을 깨지 않는다.

**비목표** (현행 유지, 명칭 표기 변경만 함)

- Reviewer 흐름, Implementer TDD
- Orchestrator 수용·커밋 규칙
- baseline 2단계 분류, result comparison 규칙
- `docs/` 과거 spec·plan과 커밋 이력

**anti-goal**

- 새 검증 역할(신규 agent)을 추가하지 않는다.
- 모드별 모델·effort 키를 두지 않는다.
- legacy 입력을 자동 대체하거나 자동 마이그레이션해서 실행을 이어 가지 않는다(dispatch resume, cooperative 새 기록 모두 해당).
- 저장소 밖 소비자를 검증된 것으로 주장하지 않는다.

## 3. 용어

- **Tester**: 이전 명칭 QA. 정책 역할 id는 `tester`, 모델·routing 키는 `arc_tester`.
- **task 모드 / 최종 모드**: brief 필수 필드 `mode: task | final`의 값.
- **트리거**: 현행 `verification.md`의 (1)~(4). 정의는 바꾸지 않는다.
- **대체 검사**: 트리거마다 전체 회귀 대신 실행하는 영향 범위 테스트.
- **판단 불가**: 영향 범위 절차로 대상 테스트를 확정하지 못한 항목. 결과는 unverified.
- **승인 전체 회귀**: 판단 불가 disposition에서 사용자가 (i)을 고른 경우에만 실행하는 전체 회귀.

## 4. 요구사항

요구사항마다 ID와 수용 기준(AC)을 둔다. 정책 문안의 AC는 구조 검사(계약 테스트)로 입증한다. 구조 검사가 실제 role 행동 준수까지 입증하지는 못한다(7장 한계).

### 4.1 모드 (MODE)

**MODE-1 모드 필드와 단일 모드 배정**

검증 역할 brief는 필수 필드 `mode: task | final`을 가진다. 한 배정은 한 모드만 수행한다. 예외는 최종 모드의 승인 전체 회귀 후속(FR-1) 하나뿐이다.

- AC: 다음 세 곳에 필수 `mode` 필드와 "한 배정 = 한 모드(최종 모드의 승인 전체 회귀 후속만 예외)" 규칙이 나타나고, 계약 테스트가 이를 고정한다.
  - 4개 플랫폼의 `verification.md`
  - `handoff-prep.md` "Verification brief inputs"
  - Tester profile 렌더 결과

**MODE-2 task 모드**

| 항목 | 규칙 |
|---|---|
| 배정 | top-level task마다 fresh Tester |
| 범위 | 현행 3범주: (a) 변경 모듈을 직접 검사하는 테스트 파일, (b) 갱신이 필요한 계약 테스트, (c) 대응 check 스크립트. 범주 안의 추가는 이유를 붙여 허용 |
| 대상 | 미커밋 작업. static check는 `git diff --name-only <approved base>`와 `git status --porcelain` untracked |
| 탐색 | brief 확인과 3범주 결정을 위한 읽기만 허용. 역의존성 탐색 금지 |
| 실패 | Implementer → Tester 재검사. 같은 task의 현재 Tester를 재사용 |
| 금지 | 전체 회귀, 대체 검사 |

- AC: task 모드 규칙에 위 표의 각 항목이 명시된다. 계약 테스트는 "task 모드에서 전체 회귀 금지"와 "task 모드에서 역의존성 탐색 금지"를 문구 단위로 고정한다.

**MODE-3 최종 모드**

모든 task를 수용·커밋한 뒤, execution target worktree의 verified HEAD에서 fresh Tester를 1회 배정한다.

실행 묶음은 다음과 같다.

- **현행 묶음**
  - 모든 계약 테스트
  - 모든 check 스크립트
  - 재변경 파일의 관련 테스트. 현행 정의를 유지하고, Orchestrator가 계산하며 Tester가 교차 확인한다.
  - clean 상태가 아니면 환경 차단
  - 시작·종료 시 `git status --porcelain` 기록
  - 실행 중 그 workspace에 쓰기 금지
  - 읽기 전용 final Reviewer 동시 실행 허용
  - 새 실패는 Implementer → Tester로 처리하고, Reviewer는 영향 파일을 refreshed-diff로 재검사
- **4번째 범주**: 트리거 대체 검사(4.2)

탐색과 도구 사용 조건은 다음과 같다.

- 읽기 전용 역의존성 탐색을 허용한다.
- 프로젝트 affected 도구는 list/dry-run 형태이고, 쓰기·설치·캐시 생성이 없을 때만 쓴다.
- 이 조건을 못 지키면 환경 차단으로 보고하고, 영향 범위 절차의 다음 단계로 넘어간다(IMP-1).

AC:

- 최종 검증 문단이 4범주를 열거한다.
- 현행 묶음 문장(재변경 파일 정의, `git status --porcelain`, 쓰기 금지, Reviewer 동시 실행, 새 실패 라우팅)은 의미 변경 없이 명칭만 Tester로 바뀐다.
- affected 도구 사용 조건과 환경 차단 후 다음 단계 진행이 명시된다.
- 계약 테스트가 이 문단을 고정한다.

**MODE-4 대체 검사는 최종 모드에서만 (D2)**

- AC:
  - task 모드 규칙과 Implementer profile 문구는 대체 검사와 전체 회귀를 최종 모드에만 귀속한다.
  - Implementer 템플릿의 "full regression only in final QA verification when triggered." 문구는 retired phrase로 바뀐다.

### 4.2 트리거와 대체 검사 (SUB)

**SUB-0 트리거 정의 유지**

다음은 의미를 바꾸지 않고 유지한다. 바뀌는 것은 결과(전체 회귀 → 대체 검사)뿐이다.

- (1)~(4) 트리거 정의
- shared module 정의: mirror·generated output 포함, 사람만 읽는 문서와 단일 component 모듈 제외, 실제 소비자 기준, 결정 불가 시 shared로 취급
- "규모·위험도만으로는 트리거가 아님"
- "task check 중 본 범위 밖 실패는 finding"

AC:

- 위 문장들이 4개 플랫폼 `verification.md`에서 동일하다(계약 테스트로 고정).
- "QA runs it once without further authorization"에 해당하는 자동 실행 문장은 없다(retired phrase).

**SUB-1 ~ SUB-4 트리거별 대체 검사**

| ID | 트리거 | 대체 검사 | 판단 불가 조건 |
|---|---|---|---|
| SUB-1 (D7) | (1) 공유 모듈 | 역의존성을 전이 추적해 도달한 테스트를 실행한다. 역의존성은 정적 import/require/load와 경로 문자열 참조이며 mirror·generated output을 포함한다. 확정하지 못하면 패키지 경계로 한 단계 확장한다. 경계는 가장 가까운 package manifest 디렉터리, 없으면 테스트 디렉터리다 | 동적 참조 의심 |
| SUB-2 | (2) 외부 변경 통합 | 들어온 변경과 충돌 해결 파일을 changed set에 넣고 같은 절차를 따른다. 외부 CI·검증 증거는 같은 commit/tree hash일 때만 재사용한다 | 통합 이력 미확정 |
| SUB-3a | (3) 의존성 | lockfile diff에서 실제 해석 버전이 바뀐 패키지(전이 포함)를 찾고, 그것을 import하는 모듈의 테스트를 실행한다 | lockfile 없음 또는 해석 불가 |
| SUB-3b (D9) | (3) 언어·런타임·빌드·테스트 설정 | 스모크 계층: 패키지·테스트 디렉터리마다 대표 테스트 1개. 프로젝트가 선언한 smoke를 우선하고, 없으면 디렉터리별 사전순 첫 테스트 파일. 선택 이유를 기록한다 | 구조 식별 불가 |
| SUB-4 | (4) 공개 인터페이스 | 저장소 안 호출부(식별자, CLI 옵션 문자열, 설정 키)를 검색해 해당 테스트를 실행한다. 계약 테스트는 최종 검증에서 이미 전체 실행한다. 저장소 밖 소비자는 범위 밖이므로 unverified | 동적 참조 의심 |

- AC: 각 행의 탐색 대상, 확장 규칙, 선택 우선순위, 판단 불가 조건이 문안에 모두 있다.

**SUB-5 독립 확인**

최종 모드 Tester는 (1)(3)(4)를 base..HEAD diff와 log로 독립 확인한다. (2)는 Orchestrator가 brief에 인용한 통합 이력을 근거로 한다.

- AC: 현행 "QA independently checks triggers (1), (3) and (4)"의 의미가 Tester 명칭으로 유지된다.

### 4.3 영향 범위 절차 (IMP)

**IMP-1 순서 고정**

대체 검사 대상은 다음 순서로 정한다.

1. 같은 commit/tree hash의 증거를 재사용한다. 근거를 기록한다.
2. 프로젝트 affected 도구를 dry-run으로 쓴다(MODE-3 조건).
3. 역의존성을 탐색한다. 1·2를 쓰지 않은 이유를 기록한다.
4. 경계를 한 단계 확장한다.
5. 판단 불가로 보고한다(unverified).

동적 참조가 의심되면 어느 단계에서든 곧바로 5로 간다.

- AC: 5단계 순서, 3단계의 "1·2 미사용 이유 기록", 동적 참조 즉시 판단 불가가 명시되고, 계약 테스트가 순서를 고정한다.

### 4.4 판단 불가 처리 (UND)

**UND-1 Tester 보고**

Tester는 판단 불가 항목마다 네 가지를 보고한다.

- 항목
- 원인
- 실행한 대체 검사
- 남은 미검증 범위

- AC: Tester profile과 `verification.md`에 이 4요소가 열거된다.

**UND-2 Orchestrator disposition**

Orchestrator는 사용자에게 세 선택지를 제시한다.

- (i) 전체 회귀 승인
- (ii) 프로젝트 CI 전체 테스트 결과로 갈음
- (iii) unverified로 disposition

결정 전까지 최종 수용은 보류한다. Reviewer와 독립 작업은 계속 진행한다. 이 disposition은 unknown state 해소에 해당하므로 Full Auto에서도 자동 결정 대상이 아니다(`approval.run-mode` 기존 규칙).

- AC:
  - 세 선택지, 최종 수용 보류, Reviewer·독립 작업 계속, Full Auto 자동 결정 제외가 명시된다.
  - unverified disposition이 criterion을 proven으로 바꾸지 않는다는 Evidence verdict 규칙과 충돌하지 않는다.

### 4.5 승인 전체 회귀 (FR)

**FR-1 실행 주체와 방식**

- 현재 최종 모드 Tester가 후속 작업으로 실행한다. 새 Tester는 배정하지 않는다.
- bridge route에서는 같은 dispatch를 resume한다. segment마다 `lease.timeoutMinutes`로 새 타이머가 걸린다(현행 동작, 누적 아님).
- native route에서는 같은 Tester 배정을 이어 간다.
- 같은 배정을 이어 갈 수 없으면 환경 차단으로 보고하고 hold한다. 예: native 재개 불가, dispatch 소실, resume hold. 새 Tester 배정 여부는 사용자가 정한다.

AC:

- 문안에 "현재 최종 모드 Tester의 후속, 새 배정 없음, bridge는 같은 dispatch resume, 이어 갈 수 없으면 hold"가 명시된다.
- runtime 테스트가 bridge resume의 segment당 timeout이 `arc_tester` 60분임을 확인한다.

**FR-2 승인 범위**

- 승인은 해당 workflow와 HEAD에만 유효하다. HEAD가 바뀌면 무효다.
- 1회만 실행한다.
- 실패는 현행 baseline 2단계 분류를 따른다.

- AC: 세 조건이 명시되고, "Full regression failures follow the base check below" 연결이 "승인 전체 회귀 실패"로 유지된다.

### 4.6 CI 갈음 (CI)

**CI-1 조건**

다음을 모두 충족해야 CI 결과로 갈음한다.

- verified HEAD와 같은 commit SHA. 근거가 있으면 tree hash 일치도 인정한다.
- 모든 job 완료
- 테스트 이름 단위 결과에 접근 가능
- Orchestrator가 읽기 전용으로 수집해 brief에 인용
- 사용자 명시 승인 기록

하나라도 불완전하면 new-failure candidate 또는 unverified로 처리한다.

- AC: 5조건과 불완전 시 분류가 명시된다. CI 수집은 Orchestrator의 읽기 전용 작업이며 external action 권한을 만들지 않는다.

### 4.7 Plan·brief 입력 (BRF)

**BRF-1 Planner**

plan의 최종 검증 항목에 "잠정 트리거 판단과 대체 검사 목록, 이유"를 쓴다. 현행 "provisional full-regression trigger judgment"를 대체한다.

- AC:
  - Planner fragment(`agent-fragments.json`)와 `planning.md`에 새 문구가 있다.
  - 구 문구는 retired phrase다.
  - `test-scope-contract` planner rule이 갱신된다.

**BRF-2 Orchestrator**

최종 모드 brief는 다음을 인용한다.

- `mode: final`
- 잠정 판단과 이유
- 통합 이력
- 재사용 증거(commit/tree hash)
- 전체 회귀 승인 기록(있으면)
- 재변경 파일 목록

task 모드 brief는 다음을 인용한다.

- `mode: task`
- approved base
- base worktree 상태
- 관련 테스트 목록과 이유
- 간헐 실패 재실행 한도

- AC: 4개 플랫폼 `handoff-prep.md` "Verification brief inputs"에 두 모드의 필드가 있고, 계약 테스트가 고정한다.

### 4.8 명칭 변경 (REN, D1)

**REN-1 전면 변경 대상**

| 구분 | 현행 | 변경 |
|---|---|---|
| 표기 | QA | Tester |
| 정책 역할 | `qa` | `tester` |
| 규칙 id | `role.qa-verification` | `role.tester-verification` |
| route 토큰 | `fresh-qa`, `required-qa`, `qa-rechecks` | `fresh-tester`, `required-tester`, `tester-rechecks` |
| evidence 토큰 | `relevant-qa-evidence` | `relevant-tester-evidence` |
| 모델·routing 키 | `arc_qa` | `arc_tester` |
| native / Codex 이름 | `arc-qa` / `arc_qa` | `arc-tester` / `arc_tester` |
| routing profile | `arc-routing-qa` / `arc_routing_qa` | `arc-routing-tester` / `arc_routing_tester` |
| profile 파일 | `arc-qa.md` / `arc-qa.toml` | `arc-tester.md` / `arc-tester.toml` |
| fragment id | `qa.*` | `tester.*` |
| watch label | `QA` | `TESTER` |
| TUI 표시 | `QA` | `Tester` |
| cooperative actor·역할 enum | `qa` | `tester` |
| runtime 연산명 | `qa` (`operations.mjs:5`) | `test` |

- AC:
  - 검색 패턴: `\bqa\b|arc_qa|arc-qa|fresh-qa|required-qa|qa-rechecks|\bQA\b`
  - 검색 범위: `lib/`, `shared/`, `claude/`, `codex/`, `gemini/`, `grok/`, `tests/`, `README.md`, `MANIFEST.sha256`
  - 검색 결과는 MIG-*의 legacy 읽기·거부 코드, 그 테스트, legacy 입력을 표현하는 fixture에만 남는다.
  - 남은 출현마다 legacy 사유를 plan의 잔존 목록에 기록한다.

**REN-2 변경 제외**

`docs/` 과거 spec·plan과 커밋 이력은 바꾸지 않는다.

- AC: base..HEAD diff에 기존 `docs/superpowers/**` 파일의 수정이 없다. 새 spec·plan 추가만 허용한다.

**REN-3 생성물 동기화**

다음은 원천에서 재생성한다.

- 관리 섹션(`update-role-policy`)
- runtime mirror(`shared/skill/runtime/*`, `scripts/update-runtime-assets.mjs`)
- `MANIFEST.sha256`(`update-manifest`)
- 렌더 profile

- AC: 다음이 통과한다.
  - `npm run check:role-policy`
  - `npm run check:manifest`
  - runtime assets check
  - installer parity check(`scripts/check-installer-parity.mjs`)

### 4.9 호환·마이그레이션 (MIG)

**MIG-1 models.toml (D3, D4)**

- 읽기: version 1·2·3의 `arc_qa`를 `arc_tester` 값으로 해석한다.
- 쓰기: 항상 version 4와 `arc_tester`로 쓴다.
- version 4는 정확히 5개 역할(`arc_scouter`, `arc_planner`, `arc_implementer`, `arc_tester`, `arc_reviewer`)을 요구한다. version 4에 `arc_qa`가 있으면 거부한다.
- 같은 규칙을 Node(`lib/models/config.mjs`)와 Python(`claude/skill/scripts/model_config.py`, `codex/skill/scripts/model_config.py`)에 모두 적용한다(installer parity).

AC:

- v3 fixture의 `arc_qa` model·effort 값이 upgrade·재기록 후 v4 `arc_tester`에 보존된다.
- v4에 `arc_qa`가 있으면 쓰기 없이 거부된다.
- Node와 Python parity 항목이 `tests/installer-parity.json`에 등록된다.

**MIG-2 composite routing 설정 JSON**

models.toml과 같은 방식이다. legacy `arc_qa`를 읽고 새 키 `arc_tester`로 쓰며, 설정 버전을 한 단계 올린다.

- AC: legacy 설정이 검증을 통과하고, 재기록하면 새 키·새 버전으로 저장된다. 새 버전에 `arc_qa`가 있으면 거부된다.

**MIG-3 dispatch 기록 (D5)**

| 동작 | 처리 |
|---|---|
| observe / cancel / watch | legacy `arc_qa`·`arc-routing-qa` 기록을 읽고 TESTER로 표시 |
| legacy dispatch resume | 사유 코드(예: `legacy_role_resume_unsupported`)와 함께 hold. 자동 대체 없음 |
| prepare-dispatch `arc_qa` 입력 | 사유 코드(예: `legacy_role_arc_qa`)와 함께 거부 |

- AC: 테스트가 다음을 확인한다.
  - legacy 기록에 대한 observe·cancel 성공, watch 표시 TESTER
  - legacy resume → hold와 사유 코드
  - prepare-dispatch `arc_qa` → 거부와 사유 코드, state·파일 쓰기 없음

**MIG-4 구 agents/ profile 정리**

upgrade는 새 payload에 없는 구 profile을 자동 제거하지 않는다(Scouter 확인, `lib/installer/plan.mjs:76`, `transaction.mjs:62`). 그래서 다음을 추가한다.

- install·upgrade 단계에서 각 플랫폼 대상 agents 디렉터리의 legacy 이름 profile을 찾는다. 대상은 `arc-qa.md`, `arc-qa.toml`, routing `arc-routing-qa.*`/`arc_routing_qa.*`, native 이름이다.
- 소유 판정은 기존 규칙을 그대로 쓴다.
  - standalone: marker와 역할 이름(`install-mode.mjs`, `platforms/formats/*.mjs`)
  - composite: marker와 profile hash(`lib/installer/role-routing.mjs:98`)
- ARC 소유로 판정된 파일은 같은 transaction에서 제거한다.
- 소유가 아니거나 판정할 수 없으면 보존하고, 결과 보고에 residual 경로로 표시한다.
- 소유 판정 규칙의 의미는 바꾸지 않는다.
- uninstall에도 같은 소유 판정을 적용한다(Q2 결정). 소유가 확인된 legacy profile은 제거하고, 아닌 파일은 보존하며 residual로 보고한다.
- 활성 composite 설치(v0.5.1 이하, routing 설정에 `arc_qa` 항목과 `arc-routing-qa.*` profile)는 install-mode 판정에서 legacy profile을 tester 역할 자리로 인정한다(읽기 전용 alias, 판정 전용). 소유 판정 규칙은 그대로다.
  - hash 일치: 같은 transaction에서 새 tester profile을 쓰고 legacy profile을 제거한다. 활성 marker가 제거된 경로를 가리키지 않게 한다.
  - hash 불일치(사용자가 수정한 파일): legacy profile은 보존하고 `legacyResiduals`로 보고한다. tester 자리는 비어 있는 것으로 보고 새 tester profile을 쓴 뒤 진행한다. uninstall은 보존·보고 후 나머지를 제거한다.

AC: 테스트가 다음을 확인한다.

- 4개 플랫폼 각각에서 install·upgrade·uninstall 시 소유 legacy profile 제거
- marker 없는 동명 파일 보존과 residual 보고
- composite hash 불일치 시 보존과 residual 보고
- 실패 시 transaction rollback으로 원상태 유지
- 활성 legacy composite 설치의 install·upgrade·uninstall이 중단 없이 진행된다(hash 일치·불일치 각각)

**MIG-5 cooperative state**

- 저장된 `qa`는 읽기 전용 legacy alias로 보고 `tester`와 같은 것으로 해석한다.
  - 대상 기록: check·intent의 `verificationActor.role`, finding의 `recheckActor.role`, identity role
  - 적용 위치: 독립성 검사(`verification.mjs:30`), 최종 review 선행 조건(`verification.mjs:76`), acceptance(`acceptance.mjs:23,25`), evaluate(`evaluate.mjs:101`)
- 새 기록은 `tester`로만 쓴다.
- 새 요청에서 `actor.role: "qa"`가 오면 사유 코드와 함께 거부한다. 정규화해서 기록하지 않는다(D5와 일관).
- runtime 연산명도 같은 방식으로 처리한다(2026-11-23 사용자 결정).
  - 저장된 연산 `qa`는 읽기 전용 legacy alias로 보고 `test`로 해석한다. 저장 위치: `approvals[].scope.operations`, `assignments[].operations`, `audit`
  - 새 기록은 `test`로만 쓴다.
  - 새 요청의 연산 `qa`는 거부한다.
  - 근거: `lib/runtime/schema.mjs:37`, `store.mjs:55`, `cooperative.mjs:184`. 기존 state가 이 enum으로 검증된다.
- RuntimeHash drift는 기존대로 stale/hold이다. 자동 갱신·마이그레이션은 없다.

AC: 테스트가 다음을 확인한다.

- legacy `qa` check가 있는 state의 status 조회·스키마 검증 성공
- 같은 actor id가 `qa`·`tester` 사이에서 role mismatch로 오판되지 않음
- legacy `qa`의 다른 task 재사용은 계속 거부
- 새 check prepare에서 `tester` 수용, `qa` 거부
- RuntimeHash drift state hold 유지

### 4.10 모델·effort·timeout (MOD)

**MOD-1 단일 키 (D3)**

모델·effort 키는 `arc_tester` 하나다. 모드는 brief로만 구분한다.

- AC: 모드별 키가 없다. 모델 카탈로그, preset, TUI setup의 역할이 5개다.

**MOD-2 timeout (D6)**

`ROLE_TIMEOUT_MINUTES.arc_tester = 60`. `coordination.md` Shared dispatch rules의 고정 timeout 문장도 같이 갱신한다.

- AC: `role-dispatch-policy` 테스트가 60분을 확인한다. resume segment에도 같은 값이 적용된다(FR-1 AC).

**MOD-3 권한 설정 유지**

다음은 값과 의미를 바꾸지 않고 키만 `arc_tester`로 옮긴다.

- `role-bridge-args.mjs`의 플랫폼별 `arc_qa` 권한·sandbox 설정
- `role-dispatch-policy.mjs:123-125`의 gate(`permission_scope_unverified`)
- `role-observe.mjs`·`role-routing.mjs`의 allowedPaths 규칙

- AC: 기존 권한·gate 테스트가 키 이름만 바뀐 채 같은 기대값으로 통과한다.

### 4.11 cooperative CLI (COOP)

**COOP-1 task 모드 check 기록**

- 기록 형태: `operation: "check"`, `scope: "task"`, `actor.role: "tester"`
- 신원 독립성(Implementer·Orchestrator와 다른 신원)과 다른 task 재사용 거부(`verification.mjs:27,77`)는 유지한다.
- acceptance는 actor 역할 `tester`를 확인한다. legacy `qa`는 MIG-5에 따라 읽기 전용으로만 인정한다.

- AC: `runtime-verification`·`runtime-acceptance` 테스트가 tester 기준으로 갱신·통과하고, legacy 사례를 포함한다.

**COOP-2 최종 모드 결과 기록 (범위 최소화)**

현행대로 `scope: "final"`은 `operation: "review"`만 허용한다(`verification.mjs:70-74`). 최종 모드 Tester 결과는 cooperative check로 기록하지 않는다. 최종 모드 결과, 판단 불가 disposition, 승인 전체 회귀, CI 갈음 기록은 plan-level progress record와 canonical handoff record에 남긴다.

근거:

- (a) 현행 최종 검증 결과도 cooperative check가 아니다. 그래서 동작 변화가 없다.
- (b) final check를 새로 도입하면 schema, 최종 review 선행 조건, acceptance 의미가 함께 바뀐다. 이는 비목표에 가깝다.
- (c) 마이그레이션 표면을 task check로 한정할 수 있다.

트레이드오프: 최종 모드 결과는 CLI gate로 강제되지 않는다(현행과 같음).

- AC:
  - `verification.mjs`의 final scope 규칙이 바뀌지 않는다.
  - `verification.md` cooperative 절에 "최종 모드 Tester 결과는 cooperative check가 아니며 plan-level·canonical 기록에 남는다"가 명시된다.

### 4.12 플랫폼 대칭·host 중립 (PLT)

**PLT-1**

모든 정책 문안, profile, 마이그레이션, 테스트는 4개 플랫폼에 대칭으로 적용한다. 문서는 특정 host를 전제하지 않는다. "resume"은 route 중립으로 표현한다(bridge: 같은 dispatch, native: 같은 배정).

- AC:
  - 4개 플랫폼 `verification.md`의 test-scope 문단이 동일하다(계약 테스트).
  - MIG-3·MIG-4 테스트가 4개 플랫폼을 다룬다.
  - 새 문안에 host 전용 도구명이 전제로 나타나지 않는다(검토 항목).

### 4.13 이번 작업 자체 검증 (SELF, D8)

**SELF-1**

이번 작업의 최종 검증에는 새 규칙(최종 모드, 4범주, 대체 검사, 영향 범위 절차)을 적용한다. 판단 불가 항목만 사용자에게 전체 회귀 여부를 묻는다.

- AC: 최종 모드 Tester 보고에 다음이 있다.
  - 트리거별 판단과 근거
  - 대체 검사 목록과 선택 이유
  - 판단 불가 항목의 4요소
  - 사용자 disposition 기록 인용

### 4.14 worktree 세션 handoff 기록 쓰기 (HND, 2026-11-23 범위 추가)

**배경**

managed worktree에 진입한 세션(Claude `EnterWorktree`)에서 Write/Edit 도구로 canonical handoff 기록 `<git-common-dir>/arc/handoff/<slug>.md`를 쓰면, harness가 이를 거부한다.

- 거부 메시지: "This session is isolated in the worktree … Edit the worktree copy of this file instead of the shared-checkout path."
- 재현: 2026-11-23, 이 작업의 worktree 진입 직후
- 원인: sandbox나 OS 권한이 아니라 파일 도구의 worktree 격리 가드다.
- 현행 지침에는 inline fallback만 있다(`git-recovery.md` "Handoff record write denial", `handoff.md`). 이를 Bash 등으로 우회하면 `scope.non-escalation` 위반이다.

**HND-1 지원되는 기록 경로**

ARC는 worktree 세션에서도 canonical handoff 기록을 쓸 수 있는 공식 경로로 runtime 명령을 신설한다(Q3 결정 (a)). 예: `handoff-record write --slug <slug> --input -`. node runtime이 `<git-common-dir>/arc/handoff/<slug>.md`에 기록을 작성하거나 갱신하며, 기록 위치는 바뀌지 않는다. 다음 조건을 지킨다.

- 4개 플랫폼에서 동작하고 host 중립이다.
- 기록 위치와 내용 계약(`handoff.md`의 canonical record 필드)은 의미를 유지한다.
- 쓰기에 실패하면 현행 inline fallback으로 처리한다.
- 권한 변경이나 sandbox 우회를 하지 않는다.

**HND-2 문서 갱신**

`handoff.md`, `git-recovery.md`, `worktree-creation.md`(플랫폼별)에 worktree 세션의 기록 절차를 명시한다.

**AC**

- 테스트가 다음을 확인한다.
  - worktree 세션을 모사한 상황에서 공식 경로로 기록 작성·갱신 성공
  - git-common-dir 밖 경로나 `..`가 포함된 slug 거부
  - 실패 시 오류 보고와 fallback 안내
- 문서 계약 테스트가 HND-2 문구를 고정한다.
- 실제 host 세션 동작은 수동 확인 항목으로 둔다(구조 검사의 한계).

## 5. 결정 추적

| 결정 | 내용 | 요구 ID |
|---|---|---|
| D1 | 전면 명칭 변경 + 호환 | REN-1~3, MIG-1~5 |
| D2 | 대체 검사는 최종 모드에서만 | MODE-4, SUB-* |
| D3 | 단일 키 `arc_tester` | MOD-1, MIG-1 |
| D4 | models.toml version 4 | MIG-1 |
| D5 | prepare-dispatch `arc_qa` 거부 + 사유 코드 | MIG-3, MIG-5 |
| D6 | `arc_tester` 60분 | MOD-2, FR-1 |
| D7 | 경계 확장 단위: 가장 가까운 package manifest 디렉터리, 없으면 테스트 디렉터리 | SUB-1, IMP-1 |
| D8 | 이번 작업 검증에 새 규칙 적용 | SELF-1 |
| D9 | 스모크 대표 선정: 프로젝트 선언 우선, 없으면 사전순 첫 파일 | SUB-3b |
| 번호 없음 | 모드, 트리거·대체 검사, 영향 범위 절차, 판단 불가, 승인 전체 회귀, CI 갈음, plan/brief | MODE, SUB, IMP, UND, FR, CI, BRF |

## 6. 영향 파일·생성물·테스트

**원천(손 편집)**

- 정책: `lib/policy/role-policy.json`, `lib/policy/render.mjs`, `lib/policy/placement.mjs`
- 프롬프트: `lib/prompts/agent-fragments.json`, `lib/prompts/render.mjs`
- 모델: `lib/models/config.mjs`, `lib/models/profiles.mjs`, `lib/models/static-catalog.mjs`
- runtime:
  - `lib/runtime/{operations,verification,acceptance,evaluate,schema,cooperative-schema,role-routing-config,role-routing,role-dispatch-policy,role-bridge-args,role-observe}.mjs`
  - mirror는 재생성
- installer: `lib/installer/{targets,manifest,language,plan,transaction,upgrade-state,install-mode,role-routing}.mjs` 중 필요한 것
- 플랫폼 포맷: `lib/platforms/formats/{markdown,toml,gemini-markdown,grok-markdown}.mjs`
- watch·TUI: `lib/watch/{labels,model,render}.mjs`, `lib/tui/setup.mjs`
- Python 모델 스크립트: `claude/skill/scripts/model_config.py`, `codex/skill/scripts/model_config.py`
- 플랫폼 문서(4개 플랫폼): `skill/SKILL.md`, `skill/models.toml`, `skill/references/{verification,handoff,handoff-prep,planning,coordination,commit,limits,git-recovery,arc-visual-companion}.md`
- 프로필(4개 플랫폼): `agents/arc-*.{md,toml}` 템플릿. 파일명 변경 포함
- 기타: `README.md`
- HND:
  - runtime 명령 신설: `lib/runtime/` CLI 진입점과 연산 정의, 그리고 mirror
  - 4개 플랫폼 `skill/references/{handoff,git-recovery}.md`와 플랫폼별 worktree 생성 문서

**생성물**

- 관리 섹션
- `shared/skill/runtime/*`
- `MANIFEST.sha256`
- `tests/node/fixtures/{installed-layout-golden,instruction-contracts}.json`

**테스트**

- 갱신(Node):
  - `test-scope-contract`, `role-policy`, `instruction-layout`, `instruction-language`, `composite-instructions`, `profile-render`
  - `models`, `model-catalog`, `preset`
  - `role-routing-*`, `role-bridge-*`, `role-observe`, `role-dispatch-store`, `dispatch-lease-v2`
  - `runtime-*`
  - `install-mode*`, `upgrade-harness`, `uninstall`, `targets`, `plan`, `management-*`
  - `watch-*`, `tui-*`, gemini·grok 계열
- 갱신(Python): `tests/test_arc_policy.py`, `test_claude_payload.py`, `test_codex_models.py`, `test_harness_contract.py`, `test_token_usage.py`, `tests/qa_model_cases.py`
- 갱신(parity): `tests/installer-parity.json`
- 신규:
  - MIG-1~5 마이그레이션 테스트
  - MOD-2 timeout
  - FR-1 resume timeout
  - PLT-1 대칭
- legacy 입력을 표현하는 fixture(`tests/fixtures/qa-legacy-model-values.json`, `models-*-v1.toml`)는 이름과 내용을 보존한다.

## 7. 검증 전략

**task 모드**

각 task의 3범주 관련 테스트만 실행한다. task별 목록과 이유는 plan에서 확정한다.

**최종 모드(SELF-1)**

- 모든 계약 테스트
- 모든 check 스크립트: `check:role-policy`, `check:manifest`, installer parity, runtime assets
- 재변경 파일의 관련 테스트
- 대체 검사

**잠정 트리거 판단(이번 작업)**

| 트리거 | 판단 | 근거 |
|---|---|---|
| (1) | 해당 | 정책·runtime·prompt 원천과 mirror·생성물이 바뀐다 |
| (2) | 미해당 예정 | 통합 없음. Orchestrator가 통합 이력을 확인한다 |
| (3-a) | 미해당 예정 | `package.json`·lockfile 변경 없음 |
| (3-b) | 미해당 예정 | 테스트 설정 변경 없음 |
| (4) | 해당 | 설정 키 `arc_qa`, `ROLES` 상수, profile 파일명, CLI 역할 식별자가 바뀐다 |

**대체 검사 진행 방식**

- 2단계(affected 도구): 이 저장소에는 affected 도구가 없으므로 건너뛰고 그 이유를 기록한다.
- 3단계(역의존성 탐색): 정적 import와 경로 문자열 참조를 기준으로 탐색하고, 도달하는 `tests/node/*`와 Python 테스트를 대상으로 삼는다.
- 예상되는 판단 불가: 템플릿 문자열로 경로를 조합하는 테스트(예: `${platform}/agents/arc-${role}.${extension}`)는 동적 참조로 판단 불가 처리될 가능성이 높다. 이 경우 UND-2에 따라 사용자 결정을 받는다.
- CI 갈음: 이 저장소 workflow는 `native-prebuilds.yml`, `npm-publish.yml`뿐이라 테스트 CI 결과로 갈음하기는 어렵다.

**기준선 Python 실패 36건**

- 의도된 기준선이다(contract-test-baseline 대조표 표 3).
- 현행 2단계 분류를 그대로 적용한다. 대조표는 Orchestrator disposition 근거로만 인용하고, 자동으로 기준선에 흡수하지 않는다.
- 실행할 때 `PYTHONDONTWRITEBYTECODE=1`을 설정한다.

**한계**

- 계약·구조 검사는 문안이 존재한다는 것만 입증한다.
- 실제 role 행동 준수, 원격 모델, 설치된 빌드 동작은 입증하지 않는다.
- MIG 테스트는 로컬 fixture 기준이다.

**final Reviewer**

모든 task를 수용한 뒤 전체 변경을 1회 검토한다(significant plan).

## 8. 위험과 완화

| ID | 위험 | 완화 |
|---|---|---|
| RS-1 | rename 누락으로 legacy와 신규 이름이 섞임 | REN-1 검색 AC, 잔존 목록, check 스크립트 |
| RS-2 | 사용자 models.toml·routing 설정 값 유실 | MIG-1·2 값 보존 테스트, 쓰기 전 검증 |
| RS-3 | 구 profile이 남아 host가 `arc-qa`를 계속 노출 | MIG-4 제거·residual 보고 |
| RS-4 | 소유 판정 오류로 사용자 파일 삭제 | 기존 판정 규칙 재사용, 판정 불가 시 보존, transaction rollback |
| RS-5 | 진행 중 cooperative state·dispatch 단절 | MIG-3·5 읽기 alias, resume hold 사유 코드, RuntimeHash drift hold |
| RS-6 | 대체 검사 범위가 좁아 회귀 누락 | 영향 범위 절차, 판단 불가 시 unverified와 사용자 disposition, 계약 테스트 전체 유지 |
| RS-7 | 판단 불가가 잦아 사용자 결정이 빈번해짐 | 증거 재사용과 affected 도구를 먼저 시도. 빈도는 운용 후 관찰 |
| RS-8 | 승인 전체 회귀가 timeout 초과 | `arc_tester` 60분, segment별 resume 타이머 |
| RS-9 | Python 기준선 실패와 신규 실패 혼동 | 2단계 분류 유지 |
| RS-10 | 4개 플랫폼 문서 비대칭 | PLT-1 계약 테스트 |

## 9. 범위 밖

- Reviewer 흐름, Implementer TDD, Orchestrator 수용·커밋 규칙
- baseline 2단계 분류와 result comparison 의미
- cooperative final check 신설(COOP-2)
- 저장소 밖 소비자 검증
- `docs/` 과거 문서·커밋 이력 수정
- 판단 불가 빈도 측정, CI 연동 신설
- push·PR·merge(별도 사용자 권한 필요)

## 10. 구현 시 정할 세부

- 정확한 문안 표현(계약 테스트로 고정)
- 사유 코드의 최종 문자열
- routing 설정 새 버전 번호
- 테스트 파일 분할
- 마이그레이션 구현 위치(upgrade plan / transaction)

## 11. 열린 질문

모두 결정됨(2026-11-23).

- Q2 → uninstall에도 적용(MIG-4).
- Q3 → (a) runtime 명령 신설(HND-1). 검토했던 선택지:
  - (a) runtime 명령 신설: 예 `handoff-record write --slug <slug> --input -`. node runtime이 `<git-common-dir>/arc/handoff/`에 쓴다. bridge dispatch가 이미 `<gitCommonDir>/arc/workflows/`에 쓰는 것과 같은 경로다. 기록 위치는 유지된다.
  - (b) 기록 위치 이동: worktree 안의 git-ignored 경로(예 `<worktree>/.arc/handoff/`)로 옮긴다. 파일 도구로 바로 쓸 수 있다. 대신 worktree를 지우면 기록도 사라지고, 다른 worktree나 source에서 찾기 어렵다.
  - (c) 절차 규칙만 추가: EnterWorktree 진입 전이나 ExitWorktree(keep) 후에만 기록한다. 코드 변경은 없다. 대신 진입 중 갱신이 불가능하다.

## 개정 이력

| 버전 | 날짜 | 내용 |
|---|---|---|
| v1 | 2026-11-23 | Planner 첫 초안을 Orchestrator가 검토하고 수정: D7·D9를 SUB-1·SUB-3b에 연결, cooperative `qa` 새 요청 거부(MIG-5), 승인 전체 회귀를 이어 갈 수 없을 때 hold(FR-1), UND-2 Full Auto 제외 명시, MOD-2에 coordination 문장 갱신 추가 |
| v1.1 | 2026-11-23 | 사용자 요청으로 HND(worktree 세션 handoff 기록 쓰기) 범위 추가, Q3 추가 |
| v1.2 | 2026-11-23 | Q2(uninstall 적용)·Q3(runtime 명령 신설) 결정 반영. 사용자 written-spec 승인("결정 반영 후 승인") |
| v1.3 | 2026-11-23 | T1 hold(저장 연산 `qa`) 해소: MIG-5에 연산 legacy alias 추가(사용자 결정 "test로 변경+legacy 읽기") |
| v1.4 | 2026-11-24 | T4 hold(활성 legacy composite 설치 판정 불가) 해소: MIG-4에 판정 전용 alias와 hash 일치·불일치 처리 추가(사용자 결정 "alias 판정+진행") |
