# ARC 하네스 지침 리팩토링 및 승인 연속성 설계

- 작성일: 2026-10-19
- 상태: 사용자 승인 설계를 반영한 SPEC 초안. 서면 SPEC 승인 전.
- 대상 문서: /Users/ma-24-007/.codex/worktrees/harness-instruction-refactor/arc/docs/superpowers/specs/2026-10-19-arc-harness-instruction-refactor-design.md
- 대상 workspace: /Users/ma-24-007/.codex/worktrees/harness-instruction-refactor/arc
- 대상 branch: chore/harness-instruction-refactor
- 기준 HEAD: f39fc3e763ba0b519984b876c78ab1b75520f6f1
- 초안 소유권: Planner
- 통합·저장·승인 요청·개발 수락 책임: Orchestrator

## 1. 목적과 배경

이번 변경의 목적은 다음 두 가지다.

1. 서면 spec/plan을 생략할 수 있는 Spike probe와 간결한 Bounded 작업에서, 사용자가 이미 승인한 실행 범위를 중복 승인 요청으로 끊지 않고 필요한 검증과 수락까지 수행하도록 정책을 명확히 한다.
2. superpowers runtime bundles를 제외한 Codex·Claude 하네스 지침을 전반적으로 점검하고, 계약의 책임 위치를 정리하며 중복·불일치와 불필요한 읽기 비용을 줄인다.

현행 정책은 문서 생략을 허용하면서도 적용 가능한 승인, 실행 대상 선택, Git·소유권 증거, handoff, 위험별 검증을 요구한다. 이러한 경계에서의 보류는 정당하다. 보완할 대상은 구체적인 실행 요청이 이미 승인한 범위를 다시 승인받거나, 승인된 실행·검증이 남았는데 중간 역할의 결과 보고만으로 작업을 종료하는 동작이다.

사용자는 앞선 사례를 Spike 작업의 중도 중단으로 보고했다. 그러나 참고 스레드 01a15154-55d2-7f42-a80d-5f13b06c6994의 확인된 최신 응답은 plan·QA·Reviewer를 거쳐 별도 worktree에서 완료했다고 보고한다. 이 스레드를 no-doc 작업의 중도 중단을 재현한 증거로 사용하지 않는다. 사용자 보고, 확인된 스레드 내용, 정책 문서에서 도출한 결론을 구별한다.

## 2. 승인 범위와 준비 증거

### 2.1 사용자 승인 범위

사용자는 앞서 제안한 승인 연속성 설계를 승인했고, 작업 범위를 superpowers를 제외한 전체 하네스 지침의 리팩토링·최적화로 확대했다. 이후 제시된 전체 설계와 별도 worktree의 branch candidate를 승인했다.

승인된 설계 방향은 다음과 같다.

- 계약별 책임 파일을 명확히 한다.
- core, 역할 프로필, 상세 참조, 설치 주입문 사이의 중복과 불일치를 줄인다.
- 플랫폼별 payload와 실제 플랫폼 차이를 유지한다.
- 양 플랫폼의 공통 불변 계약을 검사한다.
- 승인 연속성을 명시하되 실행 대상·Git·검증·수락 경계를 유지한다.

이번 SPEC은 이 설계를 구체화한 초안이다. SPEC 자체의 사용자 승인이나 구현 착수를 승인받았다고 간주하지 않는다.

공통 원본에서 양 플랫폼 지침을 생성하는 새 생성기, 플랫폼 기능 확대, 새로운 실행 권한은 이번 설계에 포함하지 않는다. 필요성이 새로 드러나면 범위 변경으로 다룬다.

### 2.2 실제 준비 증거

Orchestrator가 제공한 canonical record는 다음을 확인한다.

| 항목 | 확인된 값 |
|---|---|
| Source workspace | /Users/ma-24-007/Desktop/workspace/arc |
| Source branch | master |
| Source HEAD | f39fc3e763ba0b519984b876c78ab1b75520f6f1 |
| Target workspace | /Users/ma-24-007/.codex/worktrees/harness-instruction-refactor/arc |
| Target branch | chore/harness-instruction-refactor |
| Target HEAD | f39fc3e763ba0b519984b876c78ab1b75520f6f1 |
| Git common directory | /Users/ma-24-007/Desktop/workspace/arc/.git |
| Target 등록·연결 | Git worktree 등록 및 현재 chat의 app artifact attachment 확인 |
| 변경 상태 | Source·target 모두 clean, 소유권 충돌 없음 |
| Source 보존 | Target 준비 이후 source branch·HEAD·index·working tree 보존 확인 |
| 문서 디렉터리 | Target의 docs/superpowers/specs 존재 확인 |

이 증거는 정식 초안 작성 대상의 준비를 확인한다. 향후 저장·문서 커밋·Coder handoff에는 해당 시점의 gate를 다시 적용한다.

## 3. 범위와 비목표

### 3.1 점검 대상

이하 경로는 모두 대상 workspace를 기준으로 한다.

| 영역 | 대상 |
|---|---|
| Codex core | codex/skill/SKILL.md |
| Codex 상세 참조 | commit.md, git-recovery.md, handoff-prep.md, handoff-worktree.md, handoff.md, limits.md, planning.md, verification.md, visual-companion.md |
| Codex 역할 | codex/agents/의 Scouter·Planner·Coder·QA·Reviewer 프로필 |
| Claude core | claude/skill/SKILL.md |
| Claude 상세 참조 | 위 공통 참조에서 handoff-worktree.md를 제외한 8개 |
| Claude 역할 | claude/agents/의 Scouter·Planner·Coder·QA·Reviewer 프로필 |
| 설치 지침 | lib/installer/global-config.mjs의 관리 지침 블록 |
| 렌더링 경계 | lib/installer/language.mjs, lib/installer/plan.mjs 및 관련 profile rendering 계약 |
| 운영 설명 | README.md, docs/harness-operation.md |
| 회귀 검사 | 관련 Python 정책·payload 검사와 Node 설치·profile 검사 |
| 배포 무결성 | package.json, MANIFEST.sha256, manifest 생성·검증 경로 |

상세 참조는 각 플랫폼의 skill/references/ 아래에 있다.

전체 점검은 모든 대상 파일을 반드시 수정한다는 뜻이 아니다. 점검 결과에 따라 유지·축약·이관·수정 여부와 근거를 식별한다.

### 3.2 비목표

- 모든 references/superpowers/**의 bytes, 내용, license, provenance 변경.
- superpowers runtime bundle의 갱신·획득 방식을 바꾸는 작업.
- Claude에 ARC-managed worktree 지원 추가.
- 모델·preset·effort·언어·동시 실행 제한의 기본값이나 설정 스키마 변경.
- installer transaction, 안전한 파일 접근, 복구 기능의 일반 리팩토링.
- 새 지침 생성기 또는 새 runtime 정책 엔진 도입.
- push, merge, 배포·게시 등 별도 권한이 필요한 동작의 자동 승인.
- 특정 모델의 실제 지침 준수를 구조 검사만으로 보장하는 주장.

요청된 설계 문서가 docs/superpowers/specs/ 아래에 위치하는 것은 runtime bundle 변경에 해당하지 않는다.

## 4. 지침 구조와 계약 책임

### 4.1 책임 배치

각 계약은 플랫폼별로 책임 위치를 갖는다.

| 책임 위치 | 규정할 내용 |
|---|---|
| 설치 관리 블록 | 언어, ARC 진입 조건, 역할 소유권의 최소 안내, core 진입점 |
| SKILL.md | 역할 라우팅, 핵심 경계, 위험 분류, 상세 참조를 읽을 시점 |
| planning.md | 설계·문서 깊이, 승인 근거, 문서 순서, 생략 판단, 의존성·준비 상태 |
| handoff.md | 실행 시작·재개 조건, canonical record, 승인·선택 재사용, 실제 상태 증거 |
| handoff-prep.md | 실행 대상 요청 및 준비 Git 동작의 선행 조건 |
| handoff-worktree.md | Codex managed worktree의 생성·등록·연결·branch·이전 계약 |
| verification.md | 검사 증거, 지적 처분, 작업·전체 수락, 증거 한계 |
| commit.md | 수락과 집중 커밋 경계, no-change·재개·수정 커밋 처리 |
| git-recovery.md | 실패·부분 완료·충돌 상황의 확인 및 복구 경계 |
| limits.md | 생성·동시 실행 예산, 기록·재개·고갈 처리 |
| visual-companion.md | 시각적 설계 지원의 사용 조건과 운영 경계 |
| 역할 프로필 | 역할의 책임·금지·입력·산출물·보고 및 필요한 로컬 경계 |

상세 조건을 다른 파일에서 다시 정의하기보다 책임 파일을 연결한다. 요약이 필요한 경우 원본 계약의 조건과 예외를 바꾸지 않는다.

역할 프로필에 독립 실행을 위해 필요한 금지·증거·보고 조건은 남긴다. 역할이 Orchestrator core 전체를 읽어야만 자기 권한을 알 수 있게 만들지 않는다.

### 4.2 최적화 판단

최적화는 줄 수 감소만으로 판단하지 않는다.

- 같은 절차를 여러 곳에서 다르게 정의하는 중복을 제거한다.
- 조건과 예외가 멀리 떨어져 잘못 적용될 가능성을 줄인다.
- 역할·단계별 필수 읽기를 식별하고 불필요한 반복 읽기를 줄인다.
- 재개에 필요한 canonical evidence를 재사용하되 실제 변경에 영향을 받는 증거는 갱신한다.
- 완전한 역할 계약과 플랫폼 차이를 보존한다.

파일별 변경과 책임 이동을 설명할 수 있어야 한다. 단순 축약 때문에 보존 조건이나 보류 사유가 사라져서는 안 된다.

## 5. 승인 연속성 요구사항

### AUTH-01. 구체적 실행 요청의 승인 인정

사용자의 명시적 실행 요청은 다음 조건을 충족하는 범위에서 승인 근거가 된다.

- 요청이 조사·설명만 요구하는지, 실행까지 요구하는지 명확하다.
- 요청 자체 또는 사용자가 명시적으로 참조한 설명으로 범위와 기대 결과가 충분히 특정된다.
- 실행에 중요한 제약과 허용 범위가 확인된다.
- 필요한 문서 깊이와 검증 위험을 판단할 수 있다.
- 사용자 결정이 필요한 중요한 동작·방법·위험 선택이 남아 있지 않다.

Orchestrator는 승인 근거, 범위, 수용 기준, 제약 및 문서 깊이 판단을 brief 또는 canonical record에 기록한다. 사용자가 승인한 범위를 다시 서술하거나 역할에 전달했다는 이유만으로 승인을 반복하지 않는다.

검증 세부사항 등 통상적인 실행 선택은 Orchestrator가 기록할 수 있다. 제품 동작이나 중요한 범위를 새로 추가한 뒤 사용자가 이미 승인했다고 주장할 수는 없다.

### AUTH-02. 승인으로 인정하지 않는 경우

다음은 충분한 승인 근거가 아니다.

- 침묵이나 무응답.
- 실행 여부가 모호한 동의.
- 다른 작업에 대한 승인.
- 범위가 충분히 특정되지 않은 포괄적 개선 요청.
- Planner가 새로 제안한 중요한 선택에 대한 추정 동의.
- probe만 승인한 요청에서 추론한 후속 구현 승인.

중요한 불확실성이 있으면 Orchestrator가 필요한 결정을 사용자에게 묻는다. 역할들은 질문과 판단 필요사항을 Orchestrator에 보고한다.

### AUTH-03. 승인 범위의 완료 의무

적용 가능한 승인, 문서 깊이 판단, 실행 대상 및 handoff 조건이 충족되면 승인된 범위를 완료하기 위해 계속 진행한다.

완료 경로에는 해당 작업에 필요한 실행, 수정, 재검증, QA·Reviewer, 지적 처분, Orchestrator 수락, 결과 보고가 포함된다.

역할의 완료 보고, 조사 결과, 통과한 명령만으로 전체 작업을 완료 처리하지 않는다. 이미 승인된 실행이 남아 있는데 이를 다시 선택적 제안으로 돌려 사용자 응답을 기다리지 않는다.

### AUTH-04. 승인·대상 선택 재사용

같은 승인 범위와 실행 대상에 대한 유효한 승인·선택 증거는 재사용한다. 재개나 새 역할 배정만으로 중복 승인을 요구하지 않는다.

재사용은 실제 workspace, repository, branch/HEAD, 변경 상태, 보존·소유권, 문서 및 준비 증거 확인을 생략하지 않는다. 승인된 정상 변경으로 HEAD나 dirty state가 달라졌다는 사실만으로 기존 선택을 무효화하지 않는다.

### AUTH-05. 변경과 보류

중요한 범위·방법·위험 변경, 대상 변경, 모호한 소유권, 예상하지 못한 상태, 해결되지 않은 실패 또는 필수 입력 부재가 있으면 영향을 받는 작업을 보류한다.

Orchestrator는 보류 이유, 미충족 조건, 남은 작업, 재개에 필요한 결정·증거를 설명한다. 새 승인이 필요한 변경과 기존 범위에서 해결할 수 있는 실행 문제를 구별한다.

통상적인 승인 범위 내 수정·재검증은 계속한다. 실패했다는 이유만으로 같은 수정 범위를 다시 승인받지 않는다.

## 6. Spike와 Bounded의 처리

### 6.1 Probe 전용 Spike

승인된 범위는 질문, 방법·범위, 기준, 제약으로 기록한다. 구체적인 probe 실행 요청이 이를 충분히 특정하면 같은 probe 승인을 반복하지 않는다.

완료는 승인된 질문에 대한 결과, 근거, 한계, 남은 불확실성의 보고다. 결과가 기대와 다르거나 실행 가능성이 없다는 결론도 충분한 근거와 함께 승인된 질문을 해결했다면 완료가 될 수 있다.

probe 승인만으로 산출물을 제품 구현으로 유지하거나 후속 구현을 시작하지 않는다. 필요한 검증 깊이는 probe의 목적과 위험에 맞추되, 미검증 결과를 제품 수준의 검증으로 표현하지 않는다.

### 6.2 Probe와 구현을 함께 승인한 범위

사용자가 조사와 후속 수정을 명시적으로 함께 요청하고 그 전체 범위가 충분히 특정되면, Orchestrator는 전체 범위를 분류한다.

전체가 Bounded 조건을 충족한다면 probe는 내부 조사 단계가 될 수 있다. 조사 보고 자체를 새 승인 경계로 만들지 않는다.

조사 결과가 구현 범위·방법·위험을 중요하게 바꾸거나 처음부터 알려지지 않은 구현을 새로 결정해야 한다면 영향을 받는 구현을 보류한다. “조사 후 수정”이라는 표현을 미확정 구현 전체의 포괄 승인으로 해석하지 않는다.

### 6.3 간결한 Bounded

짧은 설계와 별도의 plan-depth 판단을 유지한다. 기존 plan 생략 조건은 다음과 같다.

- 한 로컬 변경.
- 의존 단계 없음.
- cross-component shared state, lifecycle, integration-order 우려 없음.
- 집중 검증 경로 하나.

Bounded라는 이름, 작은 파일 수, 사용자의 no-plan 요청만으로 조건을 충족했다고 간주하지 않는다. 필요한 spec이나 plan이 있으면 해당 작성·승인 순서를 따른다.

문서 생략은 대상 선택, 실제 준비, Git·소유권 확인, handoff 및 위험별 검증을 생략하지 않는다.

## 7. 정책 상태 전이

| 상태 | 다음 상태로 진행하는 조건 |
|---|---|
| 요청 수신·분류 | 요청 범위·의도, 설계·문서 깊이, 위험을 판단 |
| 범위 승인 확인 | 구체적 요청의 승인 근거를 기록하거나 부족한 결정을 승인받음 |
| 실행 대상 선택·준비 | 플랫폼이 지원하는 대상을 명시적으로 선택하고 실제 준비 증거 확인 |
| 필요 문서 작성·승인 | 필요한 경우 spec 승인 후 plan 작성·승인. 유효한 생략 경로는 근거를 기록 |
| 실행 준비 완료 | 적용 가능한 승인·문서·Git·소유권·의존성·용량·handoff 조건 충족 |
| 실행·수정 | 승인 범위에서 수행. 필요한 역할 보고·상태 갱신 |
| 검사·수정 반복 | 위험별 검사 및 필요한 재검증. 지적과 증거 공백 처리 |
| 수락·완료 | Orchestrator가 기준과 증거를 연결해 수락하고 결과 보고 |
| 보류 | 영향을 받는 조건을 해결하고 실제 상태·gate를 재검증한 뒤 해당 단계로 복귀 |

이미 명시적으로 선택된 유효한 대상은 재사용할 수 있다. 초기 설계 제안은 대상 준비 전 가능하지만, 정식 spec/plan 초안과 저장은 실제 준비 이후 수행한다.

현재 변경 자체는 architectural 경로다. 이 SPEC의 서면 승인을 먼저 받는다. 이후 Planner가 승인된 workspace와 절대 문서 경로를 포함한 brief를 받아 종속 plan을 작성하며, plan 승인 전 Coder를 시작하지 않는다.

## 8. 보존해야 할 실행 계약

### 8.1 역할과 소유권

- Planner가 설계·spec·plan 초안을 작성한다.
- Orchestrator가 통합·저장·승인 요청·배정·개발 수락·완료를 담당한다.
- Coder가 구현·설정·검사 코드 수정을 담당한다.
- QA와 Reviewer는 편집 없이 각각의 검증·검토 책임을 수행한다.
- 작은 저위험 Orchestrator direct path의 기존 자격·제약을 유지한다.
- depth-2 역할의 위임·추가 에이전트 생성 금지를 유지한다.
- 다른 작업과 사용자 변경의 보존 및 파일 소유권 경계를 유지한다.

### 8.2 검증·수락·커밋

설계·문서 깊이와 검증 위험을 독립적으로 판단한다.

- 작은 저위험 작업에는 필요한 집중 검사와 Orchestrator 수락을 적용한다.
- 일반 동작 변경에는 독립 QA를 적용한다.
- 상당한 위험의 변경에는 필요한 QA와 최종 전체 변경의 독립 Reviewer를 적용한다.
- 계획 작업의 task 수락 조건과 최종 전체 검증을 구별한다.
- Reviewer를 모든 task의 수락 선행 조건으로 추가하지 않는다.
- 기존 final plan Reviewer 지적 수정 경로의 예외와 그 이전 단계의 QA·실패 재검증을 보존한다.
- Coder 보고나 검사 통과만으로 Orchestrator 수락을 대체하지 않는다.
- 계획의 승인된 top-level task는 수락 후 집중 커밋한다.
- no-plan 작업에 계획 작업 전용 커밋 의무를 새로 적용하지 않는다.
- no-change·성공한 기존 커밋 재사용·실패 확인·복구 경계를 유지한다.

### 8.3 Limits·재개·복구

예산·동시 실행 제한, 실제 runtime capacity, ledger 보존과 재개, 불확실한 생성 결과 처리, 역할 freshness 및 소유권 제약을 유지한다.

예산 고갈이나 도구·환경 실패가 필수 QA·Reviewer·승인·준비 조건을 생략할 권한이 되지 않는다. 해결되지 않은 실패나 부분 완료는 실제 상태를 확인하고 영향을 받는 작업을 보류한다.

### 8.4 Visual companion

설계 시각화와 QA의 UI 수용 검사를 구별한다. 사용 조건·역할·도구 경계를 유지하고, 단순 정책 설명에 불필요한 시각화 운영 단계를 추가하지 않는다.

## 9. 플랫폼 차이

공통 계약은 의미가 일치해야 하지만 플랫폼별 명령·권한·형식은 일치시킬 대상이 아니다.

| 영역 | 보존할 차이 |
|---|---|
| 실행 대상 | Codex managed worktree 지원, Claude current-checkout-only |
| 역할 형식 | Codex TOML과 Claude Markdown/frontmatter |
| 도구·식별자 | 각 플랫폼의 실제 agent·도구 이름과 호출 방식 |
| 모델 설정 | 각 플랫폼의 model·effort rendering |
| 동시 실행 | 각 플랫폼의 native 설정 및 실제 capacity 제약 |
| 대기·재개 | 플랫폼별 지원 API와 완료 관찰 방식 |

Claude payload에 Codex 도구·worktree 권한이 유입되거나, 공통 prose를 맞추기 위해 실제 기능 차이를 지우지 않는다.

## 10. 설치·package·manifest 무결성

기존 설치 payload 경로와 사용자 설정의 의미를 유지한다.

- 관리 블록 바깥 사용자 내용을 보존한다.
- 언어 설정과 명시적 사용자 언어 요청의 우선순위를 유지한다.
- language marker의 필수 개수·치환 계약을 보존한다.
- 모델·preset 적용이 역할의 prose나 다른 설정을 훼손하지 않도록 한다.
- 설치·검사·dry-run 및 기존 안전성·실패 처리 계약을 유지한다.
- npm package에 필요한 runtime 파일이 포함되고 상대 참조가 유효해야 한다.
- 변경된 보호 payload에 맞게 manifest를 갱신하고 검증한다.
- manifest 정합성을 실제 agent 실행 준수의 증거로 표현하지 않는다.
- superpowers 제외를 manifest 검증의 보호 범위 확대로 오해하지 않는다. bundle 불변 여부는 별도로 확인한다.

설치 코드 수정은 지침 통합과 호환성 보존에 필요한 범위로 제한한다.

## 11. 수용 기준

| ID | 기준 | 필요한 증거 |
|---|---|---|
| AC-01 | 전체 비-superpowers 지침의 점검 범위와 책임 위치가 식별됨 | 대상 목록, 유지·수정·이관 근거, 책임 계약 대응 |
| AC-02 | 구체적 실행 요청의 승인 인정과 불인정 조건이 양 플랫폼에 일치함 | 관련 지침 및 양·음성 계약 검사 |
| AC-03 | 유효한 no-doc 범위의 실행·수정·검증·수락까지 연속 수행 의무가 명시됨 | 책임 지침, 중간 보고와 완료를 구별하는 검사·검토 |
| AC-04 | probe 전용과 probe+구현의 승인 범위를 구별함 | 두 경로 및 범위 확대 보류 사례의 계약 증거 |
| AC-05 | Bounded 생략 판단과 필요 문서 승인 순서를 보존함 | 생략·비생략 경로, spec 선행 승인 검사 |
| AC-06 | 대상 선택·실제 준비·Git·소유권·재개 gate가 보존됨 | 플랫폼별 handoff·복구 계약 검사 |
| AC-07 | 역할 경계·위험별 QA/Reviewer·최종 수락·commit 경계가 보존됨 | 프로필 및 책임 파일 검사, 변경 의미 검토 |
| AC-08 | 플랫폼 차이와 역할의 독립 실행 계약이 보존됨 | 플랫폼별 payload 검사, 반전·혼합을 검출하는 검사 |
| AC-09 | 불필요한 반복과 상충 정의가 줄고 참조가 유효함 | 변경 전후 책임 대응, 중복 제거 근거, 링크·참조 검사 |
| AC-10 | 설치·언어·model/profile·package·manifest 계약이 유지됨 | 관련 Python/Node 및 package·manifest 검사 결과 |
| AC-11 | superpowers runtime bundles가 변경되지 않음 | 기준 상태 대비 해당 경로의 변경 없음 증거 |
| AC-12 | 완료 보고가 실행 증거와 한계를 정확히 구별함 | 기준별 판정·검사 출력·미검증 범위·Orchestrator 수락 기록 |

계약 삭제, 승인 순서 반전, probe 승인에서 구현 권한으로의 확대, Claude worktree 지원 혼입 등 잘못된 변경이 검사에서 탐지되는지도 확인한다. 문장 위치나 동일한 표현만을 고정하는 검사보다 계약의 조건·예외·책임을 검사한다.

## 12. 검증과 증거의 한계

관련 기존 검사 표면은 다음과 같다.

- tests/test_harness_contract.py
- tests/test_arc_policy.py
- tests/test_claude_payload.py
- tests/test_codex_models.py
- tests/node/profile-render.test.mjs
- 변경에 영향을 받는 설치·언어·package·manifest 검사

구체적인 검사 명령과 각 구현 단위의 필수 QA·집중 검사 범위는 승인된 plan에서 정한다. 검사를 통과시키기 위해 보호하던 계약을 약화하지 않는다.

구조·payload 검사는 문서 계약의 존재, 플랫폼 차이, 렌더링·배포 정합성을 입증한다. 실제 에이전트가 항상 승인 연속성을 따르거나 특정 대화에서 중도 종료하지 않는다는 사실까지 입증하지 않는다.

실제 실행 관찰이 있다면 실행 대상, 요청·승인 범위, 수행된 단계와 중단 사유를 기록한다. 관찰하지 않았다면 이를 미검증으로 명시한다. 별도 runtime 실험을 수행하지 않았다는 이유로 구조적 증거를 실제 실행 증거로 확대하지 않는다.

검사 실패, 환경 제약, 미실행 필수 검사, 미해결 지적 또는 기준 미충족은 수락 기록에 드러나야 한다. 명령의 성공 여부와 각 수용 기준의 판정을 구별한다.

## 13. 주요 위험과 보류 조건

| 위험 | 대응 |
|---|---|
| 축약 과정에서 안전·승인 예외 삭제 | 계약별 대응과 음성 검사, 최종 전체 의미 검토 |
| 중복 제거로 역할 계약 불완전 | 역할별 독립 실행 관점으로 점검 |
| 요청 기반 승인이 포괄 권한으로 확대 | 명시적 범위·중요 결정·probe 분리 조건 고정 |
| 플랫폼 차이 소실 | 플랫폼별 adapter 계약과 혼합 탐지 검사 |
| 설치 형식·marker·manifest 손상 | 기존 렌더링·설치·package 검사 유지 |
| 검사와 prose가 함께 약화됨 | 기준 상태 대비 보존 계약 검토 및 독립 최종 Reviewer |
| 구조 검사를 runtime 준수로 과장 | 증거 유형과 미검증 범위 명시 |

중요한 새 기능, 새 생성기, 플랫폼 지원 확대, 승인 의미 변경, 필수 계약 제거, 소유권 충돌 또는 준비 증거 불일치는 영향을 받는 작업의 보류 조건이다. Orchestrator가 범위와 필요한 승인·준비를 해결한다.

## 14. 후속 단계와 완료 정의

이 SPEC의 서면 승인을 먼저 받는다. 이후 Planner가 승인된 workspace와 절대 문서 경로를 포함한 brief를 받아 종속 plan을 작성한다. plan은 독립적으로 수락 가능한 단위를 구분하고, 함께 검증해야 하는 변경은 처음부터 같은 단위에 포함한다.

각 top-level task에는 범위·대상 파일·의존성·수용 기준·필수 QA 또는 집중 검사·필요 증거·보류 조건을 포함한다. Orchestrator가 각 단위를 수락한 후 집중 커밋한다. 모든 단위 수락 이후 최종 전체 변경의 독립 Reviewer 검토와 필요한 지적 처분을 수행한다.

전체 완료에는 다음이 필요하다.

- 승인 범위의 지침 점검·리팩토링 완료.
- 수용 기준과 실제 증거의 연결.
- 필수 검사·QA 및 최종 전체 Reviewer 요구 충족.
- 지적과 증거 공백의 해결 또는 명시적 처분.
- superpowers 불변, package·manifest 정합성 확인.
- 실제 source/target 상태와 남은 변경의 보고.
- Orchestrator의 최종 수락.
- 확인한 사실, 실행하지 않은 검사, runtime 준수의 미검증 범위를 구별한 완료 보고.

이 초안 작성 시점에는 구현·테스트·QA·Reviewer 결과가 없으며, 이를 완료했다고 주장하지 않는다.
