# 계획 task 수락 후 CEO 자동 커밋 설계 명세

## 1. 목적과 승인된 방향

Planner가 작성하고 사용자가 승인한 구현 plan의 각 최상위 task가 완료되면 CEO가 수락 여부를 판단하고, 수락한 task의 변경을 추가 커밋 승인 요청 없이 로컬 Git에 focused commit으로 기록한다.

사용자의 요청은 “Planner가 짠 plan 문서를 기준으로 각 task 가 완료되었으면 CEO가 커밋을 알아서 진행하도록 했으면 좋겠어.”이며 설계 응답으로 “유저가 커밋을 따로 수락하지 않고 CEO가 자체 판단해서 커밋을 진행하도록 해”라고 승인했다. 이는 CEO가 task 수락과 커밋을 자체 판단하고 사용자에게 매 커밋의 승인을 묻지 않는 방향의 승인이다. 이 written spec 및 후속 plan의 승인은 별도로 받는다.

설계 깊이는 Architectural, 변경 검증 위험은 Significant다. Planner의 계획 작성, CEO의 수락·커밋 판단, 검증 단계 사이의 공유 행동 계약을 바꾸기 때문이다.

## 2. 현재 동작과 설계 이유

skill/SKILL.md의 Optional commit after acceptance는 적용되는 검사·검토와 findings 처리가 끝난 task를 CEO가 수락하고 선택적으로 커밋하도록 허용한다. 커밋은 수락·QA·Reviewer·통합 확인을 대체하지 않는다.

이번 변경은 승인된 plan의 최상위 task별 선택적 커밋을 CEO의 기본 실행 의무로 바꾼다. CEO가 task 수락 후 커밋 조건을 확인하고 진행하므로 사용자는 매 task마다 커밋을 지시하거나 승인할 필요가 없다.

현행 정책은 task 경계만으로 QA·Reviewer 게이트를 추가하지 않는다. 따라서 task 범위의 수락과 전체 plan의 최종 QA·Reviewer·통합 수락을 구분한다. 분리 검증이 불가능한 변경은 계획 단계에서 하나의 최상위 task로 묶어 불완전한 변경을 task 완료로 처리하지 않는다.

관련 근거는 skill/SKILL.md, skill/references/planning.md, skill/references/verification.md, skill/references/handoff.md, agents/harness-planner.toml, tests/test_install.py, README.md, MANIFEST.sha256이다. 특히 현행 커밋은 선택 사항이며, 기존 테스트는 수락 뒤 task 자동 커밋 계약을 직접 확인하지 않는다. Planning-document 사전 커밋은 별도 흐름이다.

## 3. 범위와 적용 경계

적용 대상은 승인된 Planner plan에 따라 진행하는 CEO 개발 워크플로다. 승인된 plan의 최상위 task 하나가 구현 커밋 하나의 단위가 된다.

기존 규칙상 plan을 생략할 수 있는 경로에 새 plan 작성 의무를 추가하지 않는다. 그 경로의 커밋은 기존 적용 지침과 사용자 요청을 따른다.

반영 범위:

- CEO의 task 수락 후 자동 커밋 계약
- Planner의 최상위 task 구성, 수락 기준, 검증 시점과 커밋 단위
- task 수락과 전체 plan 최종 수락의 구분
- 커밋 보류·실패·변경 없음·재개 처리
- README, 구조 회귀 테스트와 manifest 정합성

과거 historical spec/plan의 선택적 커밋 기록은 당시 결정으로 보존하며 이번 변경을 과거 실행에 소급 적용하지 않는다. 설치된 외부 brainstorming, writing-plans 등의 스킬은 수정하지 않는다. runtime 자동화, Git hook, task 실행기 또는 새 상태 저장 시스템도 추가하지 않는다.

## 4. 역할과 책임

| 역할 | 책임 |
|---|---|
| Planner | 독립적으로 구현·검증·수락 가능한 최상위 task를 구성하고 완전한 plan 초안을 반환한다. |
| Coder | 승인된 task 범위와 파일 소유권에 따라 구현하고 변경·검사 근거·미해결 사항을 CEO에게 보고한다. |
| QA | 기존 위험별 흐름과 승인된 검증 의무에 따라 독립 확인하고 기준별 근거와 한계를 보고한다. |
| Reviewer | 기존 필수 시점에 최종 전체 변경을 독립 검토한다. |
| CEO | 계획 통합·승인·인계, task 범위 수락, Git 상태 확인, task 커밋, 전체 plan 최종 수락·완료를 책임진다. |

커밋 판단과 실행은 CEO가 담당한다. 역할들의 보고는 CEO 판단의 근거이며 task 수락을 대신하지 않는다. CEO가 구현·설정·테스트 코드 파일을 직접 편집하지 않는 기존 소유권 계약을 유지한다.

## 5. Planner의 task 작성 계약

각 최상위 task는 식별 가능한 ID·제목, 구현 목표와 범위·대상 파일, 선행 task와 의존 조건, task 수락 기준, 수락 전에 필요한 검사·검토·근거, 보류 조건을 명시한다. 전체 plan의 최종 단계에서 수행할 QA·Reviewer·통합 확인도 task 범위 검사와 구별해 표시한다.

하위 체크박스는 구현·검사 절차와 진행 상태를 표현한다. RED/GREEN 단계, 개별 명령 실행 또는 체크박스 완료는 별도 구현 커밋 단위가 아니다.

분리 검증이 불가능하거나 함께 변경해야 수락 기준을 충족하는 요소는 처음부터 하나의 최상위 task에 포함한다. 예를 들어 동일 정책 계약의 본문·프로필·회귀 테스트·manifest가 함께 있어야 일관성을 입증할 수 있다면 하나의 task로 구성한다. 승인된 서로 다른 최상위 task를 실행 중 임의로 합쳐 하나의 커밋으로 만들지 않는다. 분리 불가능성이 뒤늦게 발견되면 관련 실행을 멈추고 CEO가 계획 범위와 필요한 승인을 다시 처리한다.

## 6. task 수락과 전체 plan 수락

task 처리는 다음 순서로 진행한다.

1. Coder가 승인된 task를 구현하고 변경·검사·미해결 사항을 보고한다.
2. CEO가 task 수락 기준과 해당 범위에서 현재 필수인 검사·검토·findings 상태를 근거로 확인한다.
3. 충족된 task를 CEO가 자체 판단으로 수락한다.
4. CEO가 최신 Git 상태와 staged 범위를 확인한다.
5. 조건이 충족되면 사용자에게 별도 커밋 승인을 묻지 않고 즉시 focused 로컬 Git 커밋을 실행한다.
6. CEO가 실제 커밋 결과와 남은 상태를 확인하고 task 기록에 연결한다.

“즉시”는 수락 후 필수 Git 확인·스테이징·커밋을 다음 처리로 진행한다는 뜻이다. Git 확인을 생략하거나 계획된 전체 작업 종료까지 이유 없이 미룬다는 뜻은 아니다.

체크박스 완료, Coder 완료 보고 또는 검사 명령의 통과만으로 task를 수락하지 않는다. 수락 기준의 조건과 기대 결과를 실제 근거에 연결해야 한다.

task 수락은 해당 범위에 대한 판단이다. 전체 plan의 최종 QA·Reviewer·통합 수락·완료 판단은 이후에도 수행한다. Significant 변경의 필수 최종 whole-change review는 QA 뒤 최종 관련 상태에서 유지한다. task 경계만으로 QA·Reviewer 호출을 추가하지 않으며, 기존 위험별 정책, 승인된 검증 의무와 위험한 의존 경계가 요구하는 확인을 유지한다. 현재 task 수락에 필수인 검사를 최종 단계로 미루어 task를 조기 수락해서는 안 된다.

최종 검증으로만 확인할 전체 통합 기준은 plan에서 범위와 시점을 명시한다. 전체 plan 최종 수락에만 적용되는 QA·Reviewer·통합 확인은 task 수락 조건과 구별하며, 그것들이 뒤에 예정되어 있다는 이유만으로 이미 독립 수락 가능한 task 커밋을 미루지 않는다. 반대로 plan이 전체 검토를 특정 task 수락의 선행 조건으로 명시했다면 그 검토가 끝날 때까지 해당 task 커밋을 보류한다. task 커밋 기록은 아직 수행하지 않은 전체 검증을 완료한 것으로 표시하지 않는다.

## 7. 커밋 전후 확인과 기록

CEO는 커밋 직전에 승인된 plan 버전과 task ID·수락 범위, 실제 절대 workspace·저장소·branch 또는 detached HEAD·HEAD, staged/unstaged/untracked 상태와 변경 소유권, staged 경로와 diff의 task 범위 일치, 무관한 변경 부재, 확정된 커밋 메시지를 확인한다.

파일 이름만 확인하지 않고 staged 내용을 확인한다. 다른 범위의 변경이 같은 파일에 섞여 있으면 안전한 분리를 입증하기 전까지 커밋하지 않는다. 무관한 staged 변경을 자동 unstage하거나 사용자 변경을 stash/reset/clean하여 진행하지 않는다.

커밋 후에는 SHA, 실제 메시지, 포함 경로·내용, post-commit HEAD, 실제 branch와 남은 staged/unstaged/untracked 상태를 확인한다. 명령 성공 종료만으로 완료를 선언하지 않는다.

CEO는 기존 접근 가능한 정본에 다음을 연결한다.

- 승인된 plan 경로·버전과 task ID
- 수락 기준별 근거와 CEO 수락 판단
- 해당 시점에 필수인 검사·검토와 finding 처리
- 커밋 SHA·실제 메시지·포함 범위와 사후 Git 상태
- 보류 사유, 변경 없음 또는 기존 커밋 재사용 사유
- 남은 전체 plan 최종 검증

별도 기록 파일 형식을 강제하지 않는다.

## 8. 보류·실패·재개

다음 조건이면 해당 task 커밋을 보류하고 이유와 필요한 다음 행동을 기록한다.

- task 수락 기준 미충족·미해결
- 해당 범위에서 필수인 검사·검토의 실패·미실행
- 미해결 finding 또는 처리되지 않은 증거 공백
- 범위·소유권·staged 내용 불일치
- 예상 밖 workspace·branch·HEAD·Git 상태
- 새 범위 또는 승인 계획의 변경 필요
- Git 실패·부분 완료로 결과가 불명확함

증거 공백과 finding의 명시적 처분은 기존 정책을 따른다. 처분된 미검증 기준을 입증된 것으로 바꾸지 않는다. 필수 검사나 미충족 기준을 커밋을 위해 임의로 면제하지 않는다.

Git 실패 뒤에는 실제 branch·HEAD·index·작업 트리와 부분 완료 여부를 확인한다. 커밋 생성 여부가 불명확하면 바로 재시도하지 않는다. 기존 복구 지침에 따라 CEO가 문제를 해결하고 영향받은 근거를 재확인한다.

변경 없는 task는 빈 커밋을 만들지 않고 수락 근거와 “변경 없음”을 기록한다. 재개 시 동일 task에 대응하는 커밋의 SHA·내용·유효성을 확인해 재사용한다. 이미 성공한 task 커밋을 중복 생성하지 않는다. 기록 누락만으로 새 커밋을 만들지 않고 실제 결과를 먼저 확인한다.

최종 QA·Reviewer에서 이미 커밋한 변경의 수정이 필요하면 CEO가 수정 범위와 검증을 별도 후속 task로 관리한다. 필요한 계획·승인 절차를 적용하고 수정·재확인 후 새 focused 커밋을 만든다. 기존 커밋을 자동 amend/reset하거나 원래 task를 재실행해 중복 커밋하지 않는다.

## 9. 기존 준비·승인 계약과 커밋 메시지

planning documents의 pre-Coder 일괄 커밋은 기존 계약을 유지한다.

설계 승인 → written spec 작성·저장·자체 검토·개별 승인 → 필수 plan 작성·저장·자체 검토·개별 승인 → 문서 집합 완결 → 명시적 실행 대상 선택 → 기존 유효 문서 커밋 확인 및 남은 승인 문서 일괄 커밋 → 최종 Git 확인 → Coder 인계 순서를 따른다.

task 자동 커밋은 문서 작성·승인 중 조기 커밋 권한을 부여하지 않는다. planning-document 일괄 커밋과 task 구현 커밋은 별도 처리다.

자동 진행 권한은 로컬 커밋에만 적용한다. push, merge, publish, deploy, install은 기존 별도 지침과 승인 절차를 따른다. 설계·written spec·plan 승인을 유지하고, 초기 실행 대상 명시 선택도 기존 규칙을 따른다.

커밋 메시지는 다음 Conventional Commits 형식을 따른다.

    <type>(<scope>): <description>

    [optional body]

    [optional footer(s)]

필요한 scope는 소문자로 작성한다. description은 간결하고 구체적인 한국어 구절이며 끝에 마침표를 붙이지 않는다. body/footer는 필요한 경우만 작성하고 Git trailer 키워드와 문법을 보존한다. 한 커밋은 한 최상위 task의 논리적 변경을 담는다.

## 10. 구현 영향 범위

모든 경로는 /Users/yunho/Desktop/project/yunho-harness를 기준으로 한다.

| 경로 | 반영 내용 |
|---|---|
| skill/SKILL.md | 기존 선택적 커밋 조항을 plan task 수락 후 CEO 자동 커밋 계약으로 변경한다. |
| skill/references/planning.md | 최상위 task 구성·수락 기준·검증 시점·커밋 단위를 명시한다. |
| skill/references/verification.md | task 범위 수락과 전체 plan 최종 수락을 구분하고 필수 검증 흐름을 보존한다. |
| skill/references/handoff.md | 기존 문서 준비 순서와 task 커밋 후 재개 상태의 정합성을 필요한 범위에서 명확히 한다. |
| agents/harness-planner.toml | plan 초안에 task 단위와 수락·검증·커밋 처리를 포함하도록 작성 책임을 반영한다. |
| README.md | 별도 커밋 승인 없이 CEO 판단에 따른 커밋 흐름을 안내한다. |
| tests/test_install.py | 새 계약과 기존 승인·검증·문서 준비 계약의 공존을 확인한다. |
| MANIFEST.sha256 | 실제 변경된 manifest 대상 파일의 해시를 갱신한다. |

handoff.md는 task 커밋 때문에 최초 실행 대상 선택이나 문서 준비를 반복 요구하지 않도록 기존 재개 계약을 보존한다. 불필요한 구조 개편은 하지 않는다.

## 11. 수용 기준

| ID | 기준 |
|---|---|
| AC-01 | 승인된 plan의 최상위 task 하나가 구현 커밋 하나의 단위로 명시된다. |
| AC-02 | CEO가 task 수락 기준·해당 범위의 필수 검사·findings를 확인하고 수락한 뒤, 추가 사용자 커밋 승인 요청 없이 즉시 커밋한다. |
| AC-03 | 하위 체크박스·완료 보고·검사 통과만으로 task 수락을 처리하지 않는다. |
| AC-04 | 분리 검증이 불가능한 변경은 계획 단계에서 하나의 최상위 task로 구성한다. |
| AC-05 | task 수락·커밋과 전체 plan 최종 QA·Reviewer·통합 수락을 구분하고 필수 최종 whole-change review를 유지한다. |
| AC-06 | task 경계만으로 QA·Reviewer 호출을 추가하지 않으며 기존 위험·의존 검증을 유지한다. |
| AC-07 | 범위·staging·Git 상태 오류, 미해결 기준·검사·finding, 범위 확대와 실패·부분 완료 시 커밋을 보류하고 이유를 기록한다. |
| AC-08 | 변경 없는 task는 커밋을 생략하고, 재개 시 확인된 동일 task 커밋을 중복 생성하지 않는다. |
| AC-09 | 커밋 전 staged 범위·메시지, 커밋 후 SHA·실제 내용·Git 상태를 확인하고 task 수락 근거와 연결한다. |
| AC-10 | planning documents의 기존 pre-Coder 일괄 커밋·승인·명시적 실행 대상 선택 순서를 보존한다. |
| AC-11 | 로컬 커밋 권한과 push·merge·publish·deploy·install의 별도 지침·승인을 구분하고 한국어 Conventional Commits 규칙을 유지한다. |
| AC-12 | historical spec/plan을 소급 수정하지 않고 구조 검사와 실제 agent runtime 준수의 입증 범위를 구분한다. |

## 12. 검증 요구와 한계

승인 뒤 구현에는 행동 계약 변경에 대한 기존 TDD 지침을 적용한다. Coder가 새 계약의 실패를 드러내는 구조 회귀 검사를 먼저 추가하고 필요한 정책을 변경한다.

검사는 AC-01~AC-12의 계약을 핵심 정책·참조·Planner 프로필·README에서 연결해 확인한다. 단순히 “자동 커밋” 문구가 있는지만 보지 않고 수락 전제, 보류 조건, task와 최종 검증의 구분, 재개·중복 방지 및 문서 준비 순서를 함께 검사한다.

기존 tests/test_install.py의 역할·위험·TDD 계약, planning-document commit 계약, 수락 근거·finding 처리 계약을 보존하고 manifest의 기존 대상 집합과 파일 무결성을 확인한다. 구현 뒤 독립 QA, 그 뒤 최종 전체 변경의 독립 Reviewer를 수행한다. 추가 변경·실패가 발생하면 영향받은 검증을 다시 수행한다.

구조 검사는 저장소에 기록된 정책 계약의 존재·정합성만 입증한다. 실제 대화에서 CEO가 적절히 task를 수락하고 자동 커밋했는지는 별도 실행 기록 없이는 미검증으로 남긴다. runtime 인프라는 추가하지 않는다.

## 13. 결정·가정과 다음 단계

승인된 주요 결정은 다음과 같다.

- 사용자에게 task별 또는 commit별 추가 승인을 요청하지 않는다.
- CEO가 task 수락과 커밋 여부를 자체 판단한다.
- 최상위 task 하나를 구현 커밋 단위로 사용한다.
- 분리 검증이 불가능한 변경은 하나의 최상위 task로 계획한다.
- task 커밋 뒤에도 전체 plan 최종 검증·수락을 수행한다.
- 기존 planning-document 준비·승인 순서를 유지한다.

해결되지 않은 중대한 설계 결정은 없다. 실제 구현 task의 분해·의존 순서·검사 명령은 spec 승인 뒤 writing-plans 단계에서 정한다.

초기 master 작업 트리 clean과 시작 HEAD 1611ea9는 CEO가 확인한 시작 상태다. 실행 준비 전에 최신 실제 상태를 다시 확인해야 하며, 이 spec은 상태 확인을 대신하지 않는다.

CEO는 이 통합본을 저장해 자체 검토했다. 다음 단계는 사용자의 written-spec 검토와 개별 승인이다. 승인 뒤 Planner에게 writing-plans를 배정한다. 필요한 문서 집합이 작성·승인되어 완결되기 전에는 실행 대상·브랜치 선택, 준비 Git 변경 또는 Coder 인계를 시작하지 않는다.

## CEO 자체 검토

- **완결성:** 목적, 승인 근거, 역할, task 구성, 수락·커밋 절차, 실패·재개, 범위, 수용 기준과 검증 요구를 포함했다. 미완성 placeholder가 없다.
- **일관성:** 최상위 task별 커밋을 지정했다. 분리 불가능한 변경은 서로 다른 승인 task를 사후 병합하지 않고 계획 단계에서 한 task로 구성한다.
- **모호성 해소:** “즉시”, “task 완료”, “변경 없음”, 동일 task 중복 커밋과 최종 검증 뒤 수정의 처리를 명시했다.
- **검증 경계:** task 수락 전 필수 검사와 전체 plan 최종 확인을 구분했다. 뒤에 예정된 전체 plan 검증은 task 커밋을 자동 보류하지 않되, 승인 plan이 이를 해당 task 수락의 선행 조건으로 정한 경우는 예외다. task 경계만으로 QA·Reviewer 의무를 추가하지 않고 기존 위험별 의무를 유지한다.
- **범위:** historical 문서, 외부 skill, runtime 인프라를 변경 범위에 넣지 않았다.
- **남은 게이트:** written spec의 사용자 승인이 필요하다. 이 파일은 아직 uncommitted다. 구현·테스트 실행·writing-plans는 시작하지 않았다.
