# Harness 작성 책임과 실행 전 증거 게이트 설계 명세

**상태:** 수정본 사용자 승인 완료
**날짜:** 2026-10-07

## 1. 목적

설치된 `brainstorming`의 architectural 경로는 실행 주체가 spec을 작성하고 written-spec 검토 전에 커밋하도록 지시한다. Harness는 Planner가 완전한 spec 초안과 자체 검토를 반환하고 CEO가 통합·저장·자체 검토한 뒤 승인을 받도록 정하며, 모든 spec과 plan의 개별 승인과 실행 대상 선택이 끝난 뒤 문서 커밋을 준비하도록 한다.

참조 task에서는 CEO가 spec을 직접 작성해 현재 `master`에 커밋한 후 사용자가 새 브랜치를 선택했다. 이 명세는 이처럼 외부 지침과 Harness 계약이 충돌할 때 작업 초반부터 Harness 순서와 역할을 적용하고, 문서 저장 및 Git 변경 직전에 필요한 증거를 확인하도록 보완한다.

## 2. 목표와 비목표

목표:

- Architectural spec과 CEO의 깊이 판단으로 필요한 Bounded written spec의 전체 초안·자체 검토 책임을 Planner로 정하고, CEO의 통합·저장 책임과 구분한다.
- spec 및 plan 초안 저장 전에 필수 참조와 역할·승인 증거를 확인한다.
- 대상 선택 요청과 첫 Git 변경 전에 handoff 계약을 적용한다.
- 승인된 문서가 완결되고 실행 대상이 명시적으로 선택되기 전에는 브랜치 변경, staging, commit을 차단한다.
- 기존 변경 보존, 커밋 검증, 실패 시 중단 원칙을 유지한다.

비목표:

- 외부 `brainstorming` 또는 `writing-plans` 파일 수정.
- 새 역할, 별도 기록 서비스, Git hook/wrapper 또는 자동 런타임 차단기 추가.
- 과거 커밋 재작성, push·merge·배포 권한 확대.
- 문서상 계약 테스트를 실제 에이전트 준수 증거로 간주.

## 3. 범위와 용어

대상은 Harness가 조정하는 개발 작업의 spec/plan 작성·승인, 실행 대상 선택, branch 준비, 승인 문서 staging·commit 및 Coder 인계다.

- **적용 문서 집합:** 현재 승인된 실행 범위에 필요한 모든 spec과 plan 및 각 승인 버전.
- **집합 완결:** 필요한 문서가 모두 작성·개별 승인됐고, 추가 문서가 필요한 미해결 범위·의존성 결정이 없는 상태.
- **문서 저장:** 검토할 spec 또는 plan 파일을 만드는 일. 사용자 written approval이나 Git commit과 구분한다.
- **Git 변경:** 실행 준비를 위한 branch 생성·전환, staging, commit. Read-only 상태 확인은 포함하지 않는다.
- **증거 brief:** 기존 canonical handoff 기록과 공유 brief. 별도 저장 서비스나 별도 정본을 만들지 않는다.

Architectural은 전체 spec·자체 검토·written-spec 승인 경로를 유지한다. Bounded는 보통 승인된 짧은 설계로 진행하며, CEO의 깊이 판단이 written spec을 요구할 때만 아래 spec 작성 책임과 저장 전 증거 게이트를 적용한다. Required Bounded written spec은 승인된 짧은 설계와 구별되는 검토·승인 산출물이다. 짧은 설계의 파일 저장이나 승인은 required spec의 작성·자체 검토·개별 승인을 대신하지 않는다.

이 변경은 Spike, Bounded plan-skip, non-behavior 경로에 새 spec 의무를 추가하지 않는다. Spec 필요성은 기존 깊이 판단을 따르며, 이 저장 gate 자체를 이유로 새 문서를 요구하지 않는다.

설계·계획 깊이와 검증 위험은 별도로 판단한다. 이 변경은 공유 역할·실행 순서 계약을 다루므로 검증 위험은 significant/high로 분류한다.

## 4. 지침 우선순위와 역할

플랫폼·사용자·프로젝트 지침을 적용한 뒤 Harness의 소유권·승인·실행 순서를 설치된 skill보다 우선 적용한다. 설치된 skill의 호출은 역할이나 Git 권한을 추가하지 않는다. 충돌하는 외부 지침은 그대로 실행하지 않고 Harness 절차에 맞춰 해석한다. 외부 skill 파일은 수정하지 않는다.

Architectural 개발 작업의 spec 책임:

1. CEO는 설계·범위를 조율하고 설계 승인 뒤 Planner에게 installed `brainstorming` 경로를 배정한다.
2. Planner는 전체 spec 초안과 자체 검토 결과를 반환한다.
3. CEO는 초안을 통합·저장·자체 검토하고 written-spec 승인 요청을 한다.
4. CEO는 Planner의 전체 초안을 대체하는 독립적인 spec 초안을 작성하지 않는다. 초안에 실질적인 누락이 있으면 Planner에게 보완을 요청한다.
5. Written-spec 승인을 받은 뒤에만 Planner가 `writing-plans`로 plan 초안과 자체 검토를 반환한다. CEO는 plan을 통합·저장·자체 검토하고 별도 승인을 받는다.

CEO의 깊이 판단으로 Bounded written spec이 필요한 경우, 승인된 짧은 설계와 spec 필요 판단·범위를 근거로 Planner가 범위에 비례하는 완전한 spec 초안과 자체 검토 결과를 반환한다. CEO는 이를 통합·저장·자체 검토하고 해당 written spec의 개별 승인을 받는다. Required written-spec 승인은 종속 plan 작성과 실행 준비보다 앞선다. 짧은 설계의 승인은 required written spec의 승인을 대신하지 않는다.

사용자가 해당 작업의 작성 책임을 명시적으로 바꾸는 경우에는 변경된 책임과 근거를 brief에 기록한다. 일반적인 설계 승인만으로 역할 변경을 추론하지 않는다.

## 5. 문서 저장 전 게이트

필수 참조는 종속 행동 전에 읽고, brief에 접근 가능한 경로와 적용 상태를 기록한다. `planning.md`는 최초 spec/plan 초안 작성과 저장 전 읽는다.

### Spec 저장

최초 Architectural spec 저장과 CEO의 깊이 판단으로 필요한 최초 Bounded written spec 저장 전에 CEO는 다음을 확인한다.

- 승인된 설계 범위와 실제 승인 근거.
- Bounded인 경우 written spec 필요성에 대한 CEO의 깊이 판단과 적용 범위. 승인된 짧은 설계와 required written spec을 구분한다.
- 해당 범위에 비례하는 Planner의 완전한 spec 초안과 자체 검토 결과의 접근 가능한 위치.
- CEO의 통합·저장·자체 검토 책임과 의도된 절대 저장 경로.

이 게이트는 사용자가 검토할 파일을 저장하도록 허용한다. Spec을 저장하기 위해 그 spec의 written approval이나 실행 대상 선택을 요구하지 않는다. 저장된 spec은 자체 검토 후 개별 승인 요청에 제시하며, 커밋하지 않은 파일을 committed라고 표현하지 않는다.

Architectural spec과 required Bounded written spec은 각각 승인된 버전으로 적용 문서 집합에 포함한다. 해당 written-spec 승인은 종속 plan 작성과 실행 준비 전에 완료한다. Required spec의 저장·승인 절차는 spec이 필요하지 않은 경로에 문서 의무를 추가하지 않는다.

### Plan 저장

최초 plan 저장 전에 CEO는 다음을 확인한다.

- 승인된 설계와 필요한 경우 승인된 written-spec 버전·근거.
- CEO의 plan-depth 판단 및 적용 plan 목록·의존 순서.
- Planner의 전체 plan 초안과 자체 검토 결과의 접근 가능한 위치.
- CEO의 통합·저장·자체 검토 책임과 절대 저장 경로.

필수 증거가 없거나 승인 버전·범위가 다르면 해당 초안을 저장하지 않고 CEO가 해결한다. 승인된 문서를 수정하면 수정된 버전의 승인을 다시 받는다.

## 6. 대상 선택과 Git 변경 전 게이트

`handoff.md`는 다음 행동 전에 읽는다.

- 실행 대상 선택을 사용자에게 요청하기 전.
- 실행 준비용 branch 생성·전환, 승인 문서 staging·commit 전.
- 모든 Coder 최초 시작·재개 준비와 독립 checkout 확인 전.

대상 선택 요청을 하기 전에 CEO는 적용 문서 전체 목록·절대 경로·범위·승인 버전·개별 승인 근거·plan 의존 순서·미완료 문서 부재를 확인한다. 필요한 문서가 작성 또는 승인 대기 중이면 선택 요청과 Git 준비를 보류한다. 이 요청을 보낼 때까지 사용자의 실행 대상 선택은 아직 존재할 수 없으므로, 선택 증거를 선택 요청의 선행 조건으로 요구하지 않는다.

Git 변경 직전에는 다음을 확인하고 brief에 기록한다.

- 완결된 적용 문서 집합과 승인 버전·근거.
- 사용자의 명시적 실행 대상 선택 또는 기존 handoff 규칙에 따른 유효한 선택 재사용.
- 절대 workspace와 repository, 현재 branch 또는 detached HEAD, HEAD.
- staged·unstaged·untracked 변경, 보존 및 편집 소유권.
- 수행할 Git 명령·대상 경로·승인 범위의 일치와 미해결 실패·부분 완료의 부재.

각 단계에서 증거가 누락·불일치하면 dependent action을 중단한다. Git의 read-only 상태 확인은 허용한다. 기존 dirty 변경을 자동 stash·reset·clean·삭제하지 않는다.

## 7. 문서 commit 순서

설치된 `brainstorming`의 spec 선행 commit 지시는 다음 순서로 대체한다. Spec 단계는 Architectural과 CEO의 깊이 판단으로 written spec이 필요한 Bounded에 적용한다. Plan 단계는 필요한 plan에 적용하며, 기존 규칙에 따라 spec 또는 plan이 불필요한 경로에는 해당 단계를 추가하지 않는다.

```text
설계 승인
→ required spec이 있는 경우: Planner spec 초안·자체 검토
→ required spec이 있는 경우: CEO 통합·저장·자체 검토 및 written-spec 승인
→ 필요한 plan이 있는 경우: Planner plan 초안·자체 검토와 CEO 통합·승인
→ 모든 적용 문서 개별 승인 및 문서 집합 완결
→ handoff 참조 확인·명시적 실행 대상 선택
→ 기존 유효 문서 commit 검증·재사용
→ 남은 승인 문서를 한 번의 focused docs commit으로 준비
→ 최종 Git 상태 확인
→ Coder 인계
```

문서 작성·검토·승인 중에는 실행 준비용 대상 선택 요청, branch 변경, staging 또는 문서 commit을 하지 않는다.
Bounded에서는 기존 plan-depth 판단이 요구한 경우에만 위 spec 단계를 적용하며, 승인된 짧은 설계만으로도 충분한 경로에 spec 단계를 강제하지 않는다.

- 이미 커밋된 승인 문서는 SHA·실제 message·포함 경로·승인 내용과 선택된 checkout에서의 유효성을 확인해 재사용한다.
- 남은 미커밋 승인 문서만 함께 한 번의 focused docs commit으로 준비한다. 구현 파일이나 무관한 파일은 포함하지 않는다.
- commit 직전 staged 경로와 diff가 승인 문서에 정확히 일치하고 무관한 staged 변경이 없으며 구체적인 한국어 Conventional Commit message가 확정됐는지 확인한다.
- 모든 문서가 유효하게 커밋됐으면 중복·빈 커밋을 만들지 않는다. 문서가 요구되지 않았고 실제 생성 문서도 없을 때만 근거를 기록하고 문서 commit을 생략한다.
- 과거 조기 commit은 이 순서의 승인이었다고 소급 처리하지 않는다. 필요하면 handoff의 기존 commit 재사용·실패 규칙을 적용한다.

Branch 변경이나 commit 이후 실제 path·branch·HEAD·staged/unstaged/untracked 상태를 다시 확인한다. Commit은 SHA·실제 message·포함 경로·승인 내용도 검증한다. 성공 exit code만으로 완료 처리하지 않는다.

## 8. 공유 brief와 중단 조건

하나의 canonical handoff 기록에 다음 증거를 누적한다.

- 적용 문서와 깊이 판단, 생략 사유, 의존 순서.
- Planner 초안·자체 검토 위치, CEO 통합 책임, 승인 버전·근거.
- 실행 대상 선택 요청의 준비 완료 근거와 이후 사용자의 실제 선택.
- 최신 workspace/repository/branch/HEAD/dirty 상태, 변경 보존과 소유권.
- 수행할 Git 변경의 정확한 경로·diff·message와 사후 결과.
- 실패·부분 완료·해결 상태와 남은 증거 공백.

증거 누락·불일치, 미완료 승인 문서, 불명확한 소유권, 무관한 staged 변경 또는 unresolved failure가 있으면 해당 쓰기·Git 변경·Coder 인계를 중단한다. CEO가 문제를 해결하고 영향받은 증거를 다시 확인한다. 새 branch 변경 실패 후 current checkout으로 자동 대체하지 않는다.

## 9. 수용 기준과 검증

| ID | 수용 기준 |
|---|---|
| AC-1 | Harness 역할·순서가 충돌하는 installed skill 지침보다 우선하며 외부 skill 파일은 수정하지 않는다. |
| AC-2 | Architectural spec과 깊이 판단으로 필요한 Bounded written spec의 전체 초안·자체 검토는 Planner가 반환하고 CEO가 통합·저장·검토·개별 승인을 조율한다. |
| AC-3 | Architectural spec, 깊이 판단으로 필요한 Bounded written spec, 적용 plan의 최초 저장 전 역할·범위·초안·자체 검토·승인·경로 증거를 확인한다. Required Bounded spec은 승인된 짧은 설계와 구별하고 종속 plan 작성·실행 준비 전에 개별 승인한다. Spec 저장에는 그 spec의 written approval이나 실행 대상 선택을 요구하지 않으며, spec이 불필요한 경로에 새 문서 의무를 추가하지 않는다. |
| AC-4 | 대상 선택을 요청하기 전에 적용 문서 집합 완결과 승인 근거를 확인하며, 문서 미완료 시 요청·준비를 중단한다. |
| AC-5 | Handoff 참조를 대상 선택 요청 및 모든 준비 Git 변경 전에 적용한다. |
| AC-6 | 모든 적용 문서 승인과 명시적 실행 대상 선택 전에 branch 변경·staging·commit을 수행하지 않는다. |
| AC-7 | 기존 유효 commit을 검증·재사용하고 남은 승인 문서만 한 번에 commit하며, staged 대상·내용·message와 사후 상태를 확인한다. |
| AC-8 | 누락·불일치·미완료 문서·실패는 해당 작업을 차단하고 기존 변경 보존 규칙을 유지한다. |
| AC-9 | 회귀 검사는 역할·우선순위, 조기 commit 유예, 승인·선택·commit 순서, 증거 누락 차단을 구조적으로 확인한다. Architectural 및 required Bounded written spec의 저장 gate, 짧은 설계와 required spec 구분, 종속 plan·준비 전 승인, 불필요한 경로의 문서 비강제도 확인한다. |
| AC-10 | 구조 검사 결과를 실제 에이전트 런타임 준수 증거로 표현하지 않으며, 실행 기록이 없으면 런타임 준수는 미검증으로 남긴다. |

검증은 최종 정책 문서와 README의 대조, 기존 정책 계약 테스트의 범위 확인, 승인된 구조 회귀 테스트, manifest 무결성, diff 검토를 포함한다. Required Bounded spec의 회귀 기준은 깊이 판단 근거, 비례하는 완전한 Planner 초안·자체 검토, CEO 저장 책임, 개별 written-spec 승인 및 종속 plan·준비 순서를 확인한다. Spec 저장에 아직 없는 written approval을 요구하는 순환 조건이 없고, Spike·Bounded plan-skip·non-behavior 경로에 일률적인 spec 의무가 생기지 않았는지도 확인한다. Significant/high-risk 변경이므로 QA 후 독립 Reviewer가 최종 전체 변경을 검토한다.

구조 검사는 저장소 안의 텍스트·정책 계약만 입증한다. 실제 Planner 반환, 사용자 승인, 저장·Git 작업의 순서가 지켜졌다는 주장은 해당 실행 증거가 있을 때만 한다. 별도 runtime 강제기나 runtime 평가 인프라는 이번 변경 범위에 포함하지 않는다.

## 10. 예상 변경 파일과 작업 순서

- `skill/SKILL.md`: adapter 우선순위와 planning/handoff 참조의 조기 적용 시점을 명확히 한다.
- `skill/references/planning.md`: Architectural 및 깊이 판단으로 필요한 Bounded written spec의 작성 책임과 최초 저장 전 증거를 정의하고, 짧은 설계·required written spec·plan·commit을 구분한다.
- `skill/references/handoff.md`: 대상 선택 요청과 각 Git 변경 전 증거 게이트 및 trigger를 정의한다.
- `README.md`: 간략한 순서와 조기 쓰기 차단을 반영한다.
- `tests/test_install.py`: 정책 구조에 대한 최소 회귀 계약을 추가한다.
- `MANIFEST.sha256`: 변경된 관리 대상 경로의 해시만 갱신한다.

작업은 현재 테스트 구조를 확인한 뒤 test-first로 진행한다. 외부 skill, 설치된 사본, 모델, 별도 프로젝트와 권한 설정은 변경하지 않는다. 문서 집합 승인 후 명시적으로 선택한 checkout에서만 계획 문서 commit 및 Coder 구현을 준비한다.

## 자체 검토

- CEO의 통합·저장 책임과 Planner의 초안 작성 책임을 분리했다.
- Required Bounded written spec에만 같은 저장 증거 gate를 적용하고 기존 깊이 판단과 문서 비강제 경로를 보존한다.
- spec 저장을 허용하면서 written-spec 승인 이전 commit을 금지해 순환 게이트를 피했다.
- 대상 선택 요청 전에는 문서 완결 증거를 요구하고, 선택 자체는 요청 이후 받아야 한다고 구분했다.
- Git read-only 확인과 branch/staging/commit 같은 변경을 구분했다.
- 기존 변경 보존, commit 재사용, 실패 시 중단 및 런타임 검증 한계를 유지했다.
- 이전 Architectural 중심 버전은 2026-10-07에 사용자가 승인했다. 이 수정본은 AC-3에 이미 적힌 최초 spec 저장 증거를 required Bounded written spec까지 명시하고, spec이 불필요한 경로는 그대로 보존한다. 사용자는 수정본을 2026-10-07에 승인했다.
