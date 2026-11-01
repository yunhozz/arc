# ARC 하네스 지침·문서 게이트·테스트 리팩터 명세

상태: 두 번째 통합 명세 버전(v2), 개별 승인 전
문서 경로: /Users/yunho/Desktop/project/arc/docs/superpowers/specs/2026-11-01-arc-harness-guidance-tests-design.md

## 1. 의도와 승인된 방향

ARC의 기존 실행 흐름을 보존하면서 ARC 소유 지침을 간결하고 일관된 영어로 정리하고, Implementer 배정이나 Orchestrator의 코드 편집 전에 필요한 문서·승인·Git 증거를 판정하는 계약을 명확히 한다. 테스트는 동일한 조건과 의미를 중복해 검증하는 코드만 통합하고, 고유한 계약과 실패 조건은 유지한다.

사용자가 승인한 방향은 planning.md를 깊이·문서 의무의 기준으로 두고 다른 문서와 역할 프로필에 해당 시점의 짧은 체크포인트와 링크를 남기는 것이다. 기존 파일 구조와 주요 앵커를 보존한다. 새 정책 계층, 런타임 강제 기능, 또는 기존에 요구되지 않던 사용자 승인 단계를 추가하지 않는다.

이 명세는 한국어로 작성한다. 리팩터 대상 지침의 본문은 간결하고 명확한 영어로 작성하며, 식별자·skill/API 이름·코드·경로·명령·literal 값은 그대로 둔다.

## 2. 대상과 승인 상태

| 항목 | 확인된 증거 |
|---|---|
| 작업공간·저장소 | /Users/yunho/Desktop/project/arc |
| 사용자 선택 | refactor/arc-harness-guidance-tests 브랜치 |
| 브랜치 준비 | master에서 선택 브랜치를 생성하고 같은 HEAD를 확인 |
| 준비 기준 HEAD | d901e807b2f12a3f8408279745dcfd9575cff3ab |
| 준비 상태 | index, tracked worktree, untracked 파일이 모두 clean |
| 초기 설계 | 사용자가 승인한 통합 설계 |
| 명세 v1 승인 | 사용자가 저장된 v1을 승인했으며, 정확한 응답은 spec 승인. UI가 messageRef를 제공하지 않아 그 필드는 사용할 수 없음 |
| 현재 명세 | 아래 test/QA 실행 요청을 반영한 v2. v1의 SHA-256은 9f676c8d9b2fab9228be0e3fad99601adede4ff5a5f7474adaffe5da21c1e3bc이며 canonical handoff에 v1 원문을 보존 |
| 명세 v2 상태 | 아직 별도 승인 전; 이 승인 전에는 plan 초안을 작성하지 않음 |
| 후속 plan 경로 | /Users/yunho/Desktop/project/arc/docs/superpowers/plans/2026-11-01-arc-harness-guidance-tests.md |

이 증거는 정식 명세 작성과 저장의 전제다. 이 명세의 승인, plan 작성·승인, 기획 문서 커밋, 또는 구현 준비 완료를 대신하지 않는다. 대상·범위·승인된 문서·Git 상태가 바뀌면 영향을 받는 증거를 다시 확인한다.

## 3. 목표와 비목표

목표:

- 기존 ARC 실행·승인·소유권·검증 동작을 유지한다.
- 깊이 판단, 필요한 문서와 의존성, 유효한 생략의 ARC 기준과 근거를 기록한다.
- Implementer 배정 또는 직접 코드 편집 전에 요구된 문서의 개별 승인과 문서 전용 커밋, 최종 Git 증거를 확인한다.
- ARC 소유 지침의 반복, 장문, 용어 불일치를 줄인다.
- 동일한 의미와 실패 조건을 검증하는 테스트 코드 중복을 통합한다.

비목표:

- installer 동작이나 런타임 정책을 변경하는 것.
- 역할·승인 흐름을 전면 재설계하거나 새 런타임 강제 기능을 만드는 것.
- Superpowers에서 가져온 원본 문서·리소스를 수정하는 것.
- 관련 없는 구현 코드나 일반 문서를 수정하는 것.
- 문서 길이, 테스트 케이스 수, 실행 시간의 임의 감축률을 정하는 것.

## 4. 변경 범위와 제외

검토 후 필요한 부분만 수정한다. 이미 간결하고 명확한 문장은 유지한다.

- README.md 중 ARC 동작을 약속하는 진입·사용 안내.
- docs/harness-operation.md.
- codex/skill/SKILL.md와 claude/skill/SKILL.md.
- 양 플랫폼의 ARC 소유 비 Superpowers instruction references 전체.
- codex/agents/와 claude/agents/의 역할 프로필.
- 관리 구간의 원본인 lib/policy/role-policy.json과 변경한 원본에 대응하는 생성물·런타임 복사본.
- ARC 소유 지침인 arc-visual-companion.md.

관리 구간은 원본을 수정하고 lib/policy/render.mjs, scripts/update-role-policy.mjs, scripts/update-runtime-assets.mjs의 기존 생성 절차를 사용한다. 생성 결과를 직접 편집하여 원본과 다른 계약을 만들지 않는다. 필요하다면 기존 manifest 갱신 절차를 따른다. 생성기와 installer의 동작은 변경하지 않는다.

다음은 수정하지 않는다.

- lib/installer/superpowers.mjs의 import mapping으로 관리하는 brainstorming.md, writing-plans.md, test-driven-development.md, writing-good-tests.md, visual-companion.md, builder-check-prompt.md.
- 이 import mapping이 제공하는 helper scripts와 templates.
- 양 플랫폼의 references/superpowers/**.
- 기존 docs/superpowers/** 내용과 provenance.

이번 작업의 새 ARC 기획 산출물인 이 명세와 지정된 후속 plan은 기존 Superpowers 파일의 수정을 뜻하지 않는다. docs/runtime/planner-hook-context.md는 런타임 입력 자료이며 사람에게 적용할 지침이 아니므로 변경하지 않는다.

## 5. 보존할 ARC 동작

문장을 합치거나 줄여도 다음을 약화하지 않는다.

- Host, Orchestrator, Planner, Implementer, QA, Reviewer의 역할·소유권·권한.
- 설계/브레인스토밍과 첫 완성 spec/plan 초안은 Planner가 작성하고, Orchestrator가 저장·검토·동일 문서를 수정한 뒤 각각 별도 승인을 요청하는 규칙.
- 사용자 선택 또는 유효한 재사용 증거, 실제 대상 준비, 변경 보존, 소유권 확인.
- 적용되는 전체 기획 문서 집합과 각 문서의 승인 순서·버전·경로·의존성.
- 적용되지 않는 문서 단계를 기존 ARC 기준으로 생략하는 조건과 그 판단·근거 기록.
- Orchestrator의 직접 편집에 적용되는 좁은 자격 조건.
- TDD 요건과 기존 예외, 위험에 비례한 QA·Reviewer 및 필요한 재검증.
- 작업별 수락·집중 구현 커밋과 최종 전체 변경 Reviewer의 시점.
- 실패·복구·재개 시 영향받는 종속 작업을 보류하고 허용된 독립 작업은 재검증 후 처리하는 규칙.
- 외부 작업에 대한 명시적 사용자 권한, 플랫폼별 기능 차이, 기존 Git·보존 규칙.

조건을 다른 곳으로 옮겼다는 이유만으로 필수 의무를 제거하지 않는다. 참조 링크만 남겨 역할별 필수 입력이나 중단 조건이 사라지게 하지 않는다.

## 6. Implementer 이전의 문서·준비 판정

모든 Implementer 배정과 Orchestrator의 직접 코드 편집 전에 같은 체크포인트를 적용한다. 증거는 기존 canonical handoff record와 brief에 연결한다.

| 판정 | 기록하고 확인할 내용 |
|---|---|
| 작업 깊이 | 적용 경로와 각 ARC 기준을 충족하거나 적용하지 않는 이유 |
| 검증 위험 | 깊이와 별도로 위험 수준, 필요한 확인·QA·최종 검토 |
| 문서 의무 | 필요한 설계·spec·plan의 전체 목록, 범위, 경로, 버전, 의존 순서. 각 생략에는 ARC 기준, 실제 범위, 충족 증거 |
| 선택 대상 | 명시적 사용자 선택 또는 변경되지 않은 유효한 재사용 근거 |
| 실제 준비 상태 | 절대 workspace/repository 경로, branch 또는 detached HEAD, HEAD, index/worktree/untracked 상태, 보존·소유권 |
| 승인 | 적용되는 전체 문서 집합의 완료 및 각 문서의 승인 버전·승인 증거 |
| 문서 커밋 | 유효한 기존 커밋을 검증해 재사용하거나 남은 승인 문서만 담은 docs-only 커밋의 SHA·경로·내용 확인 |
| 최종 상태 | 준비 mutation 후 경로·branch·HEAD·파일 상태와 미해결 실패·부분 완료 여부 |

필수 항목이 누락·불일치·미검증이면 영향받는 구현을 보류한다. 파일 존재, 요약, 보고서, 승인되지 않은 임시 문서, 명령 실행 결과만으로 gate를 통과 처리하지 않는다.

여기서 docs-only 커밋은 구현 전에 필요한 승인된 기획 문서의 커밋이다. 지침 리팩터 결과를 구현 전에 커밋하라는 의미가 아니다. 유효한 과거 선택·승인·문서 커밋은 실제 상태와 내용을 확인한 뒤 재사용하며, 중복 승인이나 빈 커밋을 만들지 않는다. 이 gate는 대상 준비나 검토용 문서 저장에 전체 승인을 미리 요구하는 순환 조건을 만들지 않는다.

## 7. 깊이·생략 조건과 승인 순서

깊이와 검증 위험은 별도로 판정한다. 파일 수, 변경량, “작은 작업” 또는 Bounded라는 이름만으로 문서나 검증 의무를 생략하지 않는다.

| 경로 | 유지할 판정 |
|---|---|
| Spike | 질문·방법·범위·기준·제약을 승인·기록한다. 미정 구현에 spec/plan을 강제하지 않고, probe 승인은 이후 구현을 허가하지 않는다. |
| Bounded | 짧은 설계를 승인하고 written spec의 필요성과 plan 깊이를 각각 판단한다. 필요하면 spec 필요성·범위를 짧은 설계에 근거해 기록한다. |
| Bounded plan 생략 | 하나의 local 변경이고, 종속 단계·교차 컴포넌트 공유 상태·lifecycle·통합 순서 문제가 없으며, 하나의 집중 검증 경로라는 조건을 모두 확인·기록한다. |
| Orchestrator 직접 편집 | 한 가지 local 변경이고, 종속 단계·교차 컴포넌트 공유 상태·lifecycle·통합 순서 우려가 없으며, 집중 검증 경로가 하나이고 유의미한 위험 트리거가 없다는 조건을 각각 근거와 함께 확인한다. 일반적인 동작 변경은 low-risk 조건을 충족하지 않는다. Spike, Architectural, 일반 다단계·유의미·높음·불명확 위험, 활성 Implementer와 같은 파일을 편집하는 경우는 제외한다. |
| Architectural | 설계 승인 후 written spec과 plan을 각각 작성·검토·개별 승인한다. 크기·locality·위험에 관계없이 plan이 필요하다. |
| 비행동 문서·설정 | 적용되지 않는 문서 단계와 이유를 기록한다. 대상·Git·문서 또는 유효한 부재·handoff 조건은 유지한다. |

필수 plan만으로 written spec 의무를 만들지 않는다. Bounded spec이 필요하면 그 필요성과 범위를 별도 판단한다. 짧은 설계 승인으로 필요한 written spec 승인을 대신하지 않는다.

정식 순서는 다음과 같다.

1. 초기 설계 승인.
2. 명시적 대상 선택 후 실제 준비와 확인.
3. 필요한 spec 완성 초안, 저장·검토, 개별 승인.
4. 필요한 plan 완성 초안, 저장·검토, 개별 승인.
5. 현재 범위의 전체 기획 문서 집합과 의존성 완료 확인.
6. 기존 승인 커밋 확인 및 남은 승인 기획 문서의 단일 docs-only 커밋.
7. 최종 Git 확인과 Implementer 이전 체크포인트.
8. Implementer 배정 또는 허용된 직접 편집.

초기 설계 제안은 대상 선택 전에 할 수 있다. 실제로 준비된 대상 증거 없이 완성 spec/plan 초안을 작성하거나 저장하지 않는다. 필수 spec 승인은 종속 plan 작성보다 앞선다. 이 작업은 Architectural이며, 초기 설계 승인과 대상 선택·준비는 완료되었지만 이 명세 승인, plan 승인, 문서 커밋, 최종 handoff는 남아 있다. 현재 문서 단계의 생략은 없다.

## 8. 영어 지침 리팩터 기준

- 간결하고 명확한 영어를 사용하며 한 문장에 하나의 의무나 중단 조건을 둔다.
- 주체, 행동, 시점, 필요한 증거, 결과를 명시한다.
- 같은 개념의 용어와 규범 수준을 일관되게 사용한다.
- 중복 문장은 제거하되 현재 역할이 실행 시점에 알아야 할 조건은 남긴다.
- 주요 제목·앵커·경로·링크와 플랫폼별 실제 차이를 유지한다.
- 모든 문서를 같은 형식에 억지로 맞추거나 파일을 합치지 않는다. 읽기 쉽도록 역할과 목적에 맞는 반복 가능한 형식만 적용한다.

## 9. 테스트 중복 리팩터

기존 테스트 코드의 리팩터, 관련 테스트 실행과 QA 검증은 범위에 포함된다. 사용자는 spec v1 승인 후 정확히 “예, 관련 테스트 실행과 QA 검증을 요청합니다”라고 추가 요청했다. 이 결정은 검증 방법을 바꾸므로 현재 명세를 v2로 갱신하며, v2 승인을 받은 뒤 plan에 필요한 TDD/QA 순서를 작성한다. 새 test function이나 test case는 추가하지 않는다. 기존 테스트를 조정·통합하고, 관련 기존 테스트를 실행하여 결과를 보고한다. 현재까지 테스트를 실행하지 않았으며 통과를 주장하지 않는다.

가장 강한 통합 후보는 tests/test_arc_policy.py의 WorkspaceBeforeDocumentsTests와 tests/test_claude_payload.py의 대응 workspace suite다. 두 suite의 공통 메서드가 대상 제시, 문서 순서, 준비된 target 없이 정식 초안을 시작하지 않는 규칙, Git/batch 단계, 선택 재사용, 문서 생략을 검증한다. 동일한 입력·assertion·실패 조건을 유지하는 공통 코드를 통합할 수 있다. Codex의 worktree transfer 검증과 Claude의 worktree 미지원 검증은 각각 보존한다.

다음은 관련 주제가 겹쳐도 별도 계약이므로 유지한다.

- ARCPreactionGateTests의 역할 우선순위, 초안·저장 증거와 문서 조건.
- test_harness_contract.py의 DOCUMENT_ORDER checker 통과·변이 검출 경로.
- 정책 생성·managed block·drift·failure atomicity.
- language·layout 검사.
- source/generated/runtime/install 복사본과 parity 연결.
- installer-parity.json이 실제 검증 대상으로 연결되는 migration metadata.

통합·삭제 후보마다 보호하던 계약, 입력, 실패 조건, 남는 검증 위치, 플랫폼 범위를 대조한다. 고유 조건은 남긴다. 현재 정적 분석은 삭제할 수 있는 test case를 입증하지 못했다. 후속 상세 감사에서 플랫폼·입력·조건까지 동일하고 남는 사례가 모든 실패 조건을 보존하는 중복 test case가 확인되면 삭제할 수 있다. 소스 중복만 확인되면 함수·헬퍼 중복만 줄이며 실행되는 플랫폼별 사례 수 감소를 약속하지 않는다. 테스트 이름이나 위치가 바뀌어 parity metadata가 영향을 받으면 기존 이력을 보존하면서 실제 연결도 갱신한다.

## 10. 의존성, 확인과 완료

변경 경계와 task commit 단위는 승인된 plan에서 정한다. 공유 policy 원본·역할 프로필·생성물·관련 검사처럼 서로 계약이 맞아야 하는 부분은 하나의 독립 검토 가능한 작업으로 묶는다. 파일이 나뉘었다는 이유만으로 구현 순서나 병렬성을 가정하지 않는다.

수용 기준:

- D1: 문서 게이트 외에 기존 실행, 승인, 소유권, Git·보존, 실패·복구, QA/Reviewer, 커밋 경계가 유지됨.
- D2: 모든 구현 진입점에서 깊이와 위험의 별도 판정, 필수 문서·승인·커밋, ARC 유효 생략의 근거를 확인할 수 있음.
- D3: 지정한 ARC 소유 guidance prose가 짧고 일관된 영어이며 의무, 예외, 앵커와 플랫폼 차이가 보존됨. 제외 자료는 변경되지 않음.
- D4: 증명된 중복 테스트 코드 또는 동일 조건의 test case를 통합·삭제하고 고유 계약·실패 경로·플랫폼 범위·source/generated/runtime/installer parity가 보존됨.
- D5: 범위·의존성·위험·미실행 검사·검증 한계가 근거와 함께 기록됨.

후속 plan은 기존 role-policy, runtime-assets, manifest, installer-parity 및 관련 Python/Node 확인 경로를 필요한 검증으로 명시한다. Existing tests가 허용된 검증 방법이다. plan은 관련 기존 테스트를 이용해 test-first 변경과 focused RED/GREEN 순서를 정의하고, fresh QA가 관련 테스트와 승인된 다른 확인을 독립적으로 수행하게 한다. 새 test function이나 case를 추가하지 않는다. 최종 독립 Reviewer는 위험과 기존 ARC 순서에 따라 전체 변경 검토 단계에서 한 번 수행하며 task commit마다 반복하지 않는다.

v2를 저장할 때 테스트는 아직 실행하지 않았으므로 결과는 미검증이다. v2와 plan을 각각 승인받은 뒤 승인된 순서로 관련 기존 테스트, 필요한 QA와 Reviewer 검토를 수행한다. 필수 검사가 실행되지 않거나 실패가 해결되지 않으면 관련 수락을 보류하고 통과로 주장하지 않는다. 문서·소스의 구조적 비교는 역할의 실제 준수나 런타임 강제를 증명하지 않는다.

주요 위험은 문장 축약 중 예외·중단 조건이 사라지는 것, 링크 의존으로 역할의 필수 조건이 누락되는 것, 테스트를 문구 변화에 맞추며 고유 계약을 약화하는 것, 플랫폼 차이나 생성 복사본이 어긋나는 것이다. 변경 전후 계약 대조, 통합 assertion 추적, 원본·생성물 보존 확인, 독립 검토로 이 위험을 살핀다.

완료에는 D1–D5의 증거, 필요한 문서 승인과 docs-only 커밋, 기존 테스트의 요구된 실행, QA·Reviewer 검토, 미해결 필수 검사의 해소, Orchestrator 인수와 task 커밋이 필요하다. 권한·검사 미실행 문제를 문서 생략이나 성공으로 처리하지 않는다.

---

자체 검토: 사용자가 승인한 설계와 준비된 target을 기준으로 D1–D5, 범위·제외, 명시적인 depth/omission·approval gate, 고유 테스트 계약, 검증 한계를 포함했다. ARC의 기존 직접 편집 자격 조건을 명시했고, 필요한 spec/plan이 승인·커밋되기 전에는 구현을 시작하지 않는다. 사용자 승인 v1의 content와 hash는 canonical handoff에 보존했으며, 사용자 test/QA 요청을 반영한 v2는 별도 승인 전이다. plan은 아직 작성하지 않았고, 테스트는 실행하지 않았다.
