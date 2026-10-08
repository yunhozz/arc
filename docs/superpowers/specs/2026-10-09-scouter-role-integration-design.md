# Scouter 역할 통합 및 관리형 worktree 인계 명세

## 1. 목적

기존 Secretary와 Scout의 조사·탐색 업무를 Scouter로 통합하고, 두 역할을 활성 계약에서 제거한다. Scouter는 CEO가 지정한 자료와 저장소의 정적 코드·문서·데이터를 읽기 전용으로 조사하고, 근거와 미해결 사항을 CEO에게 보고한다.

독립 문서 파일 작성은 Scouter의 책임에서 제거한다. 독립 문서 작성 요청을 전문 역할에 자동 배정하지 않는다. 조사 결과를 CEO에게 설명하는 응답은 허용한다. Planner의 개발 명세·계획 작성과 Coder의 구현 종속 문서 변경은 각각 기존 책임으로 유지한다.

활성 전문 역할은 Scouter, Planner, Coder, QA, Reviewer다. 기존 개발 소유권, depth 2 보고 구조, 최대 동시 하위 에이전트 네 명, 에이전트 간 직접 위임 금지를 유지한다. 사용자가 새 worktree를 실행 대상으로 선택하면 Codex 앱의 `create_worktree` 도구로 현재 대화에 연결된 관리형 worktree를 만든다.

## 2. 현재 구조와 목표

현재 Secretary는 자료 기반 조사·분석과 독립 문서 작성을 담당하고, Scout는 제한된 코드·자료 탐색을 담당한다. 둘 다 CEO에게 직접 보고한다.

- 기존 Secretary 정책: agents/harness-secretary.toml
- 기존 Scout 정책: agents/harness-scout.toml
- 공통 라우팅 및 소유권: skill/SKILL.md
- 현재 모델 스키마: version 4, 여섯 역할
- 현재 새 worktree 준비 절차는 `git worktree add`로 Git worktree만 생성하며 Codex 앱 관리형 등록·대화 연결을 보장하지 않는다.

목표 역할 ID는 harness_scouter이며, 프로필 파일은 agents/harness-scouter.toml이다. 사용자 지시에 따라 Scouter는 gpt-6-luna 모델과 max 추론 강도를 사용한다. 기존 Secretary와 Scout의 모델 설정은 계승하지 않는다. 활성 Scout 별칭과 Secretary 역할 ID는 남기지 않는다.

## 3. 역할 및 책임 경계

| 역할 | 소유 책임 | 경계 |
|---|---|---|
| CEO | 요청 분류·배정, 결정·승인 조율, 개발 조율, 통합·수락·완료 | 구현·설정·테스트 코드 편집은 Coder에게 할당 |
| Scouter | 자료 조사·분석, CEO가 지정한 정적 코드·문서·데이터·로그 탐색, 근거·미해결 사항 보고 | 읽기 전용. 파일 편집, 독립 문서 파일 작성, 설계·계획 결정, 검증 판정, 최종 검토, 직접 위임 금지 |
| Planner | 개발 변경의 설계·명세·구현 계획 초안, 의존성 및 수락 기준 제안 | 읽기 전용. 저장·구현·승인 요청·완료 결정 금지 |
| Coder | 승인된 범위의 구현·설정·테스트 코드와 구현 종속 문서 변경 | 배정 파일과 승인 범위만 편집 |
| QA | 수락 기준에 따른 독립 검증 및 근거·미검증 범위 보고 | 편집·설계 결정·완료 결정 금지 |
| Reviewer | 최종 변경의 정확성·사실·보안·인터페이스 계약 독립 검토 | 구현·QA 실행·계획·완료 결정 금지 |

모든 전문 역할은 CEO에게 직접 보고하고 depth 2에서 끝난다. 독립 작업만 병렬화하며 전체 동시 하위 에이전트 수는 네 개를 넘지 않는다.

### 3.1 Scouter 입력 및 보고

CEO는 조사 목표, 질문, 범위·제약, 접근 가능한 작업공간 및 자료 경로, 기대 산출물을 제공한다. Scouter는 필요한 범위만 탐색하고 다음을 CEO에게 돌려준다.

- 발견과 결론, 이를 뒷받침하는 파일·행·페이지·출처 링크
- 미확인 사항과 가정
- 영향과 다음 행동
- 누락·접근 불가·충돌하는 경로 또는 작업공간 문제

Scouter는 조사 결과를 대화 응답으로 설명할 수 있지만 문서 파일을 만들거나 저장하지 않는다. 수정이 필요해 보이는 파일을 발견하면 직접 편집하지 않고 CEO에게 전달한다.

### 3.2 탐색 및 운영 상태 경계

지정된 정적 코드·문서·데이터·로그 파일을 찾고 읽는 행위와 공개 자료 조사는 허용한다. 제공된 정적 운영 보고서의 분석과 공개 문서에 기록된 운영 방법 조사도 허용한다.

현재 디스크·캐시·시스템·앱·프로세스의 live 운영 상태를 조사하거나 운영 정리를 수행하는 권한은 추가하지 않는다. 해당 활동은 Scouter 범위 밖이며 다른 전문 역할에 자동 지정되지 않는다.

### 3.3 문서와 혼합 요청

독립 문서 작성은 Scouter의 업무가 아니며, 전문 역할에 대한 자동 작성 배정을 만들지 않는다. 조사와 문서 작성이 함께 요청되면 CEO는 조사 부분만 Scouter에 명시적으로 배정할 수 있다. 개발 명세·계획은 Planner, 구현 종속 문서는 Coder가 기존 경계에 따라 담당한다. 구현·설정·테스트와 조사가 섞인 요청의 조율·통합·수락은 CEO가 담당한다.

## 4. 모델 설정 스키마

skill/models.toml을 version 5로 올리고 정확히 다음 다섯 ID를 허용한다.

| ID | model | model_reasoning_effort |
|---|---|---|
| harness_scouter | gpt-6-luna | max |
| harness_planner | gpt-6.1-sol | medium |
| harness_coder | gpt-6.1-sol | low |
| harness_qa | gpt-6-luna | max |
| harness_reviewer | gpt-6.1-sol | medium |

model_config.py의 역할 매핑·로더·직렬화·오류 안내와 apply-models.py의 검사·적용 출력을 동일한 다섯 역할 계약으로 맞춘다. 버전은 정수 5여야 하며 누락·추가 역할, 잘못된 역할 필드, version 1–4를 거부하고 version 5 형식으로 갱신하라고 안내한다. 자동 변환은 추가하지 않는다. 검증 실패는 설정 파일과 프로필을 변경하지 않는다.

## 5. 설치 및 폐기 프로필 동작

### 5.1 활성 대상

install.py는 다음 프로필만 검증·생성·설치한다.

- harness-scouter.toml
- harness-planner.toml
- harness-coder.toml
- harness-qa.toml
- harness-reviewer.toml

설치기와 모델 적용 도구의 check·dry-run·오류·성공 출력은 다섯 역할과 일치해야 한다. 새 설치와 반복 설치에서 폐기 역할을 생성하지 않는다.

### 5.2 폐기 대상과 비관리 경로

선택한 Codex 홈의 agents/ 바로 아래 정확한 두 경로를 폐기 대상으로 처리한다.

- harness-secretary.toml
- harness-scout.toml

대상이 존재하면 변경 전 안전성 검사와 영구 백업을 하고, 설치 거래 중 복구 가능한 위치로 이동해 제거한다. 기존 harness-scouter.toml은 활성 프로필과 동일한 교체·백업 흐름을 따른다.

설치기는 yunho-team-* 이름의 구형 프로필 경로를 탐색·검사·백업·삭제하지 않는다. 기존 파일은 설치기의 관리 대상이 아닌 사용자 파일로 그대로 둔다. 그 밖의 대상이 아닌 사용자 프로필도 보존한다.

### 5.3 안전성·원자성

- 폐기 경로와 상위 구성요소를 변경 전에 검사한다. symlink·디렉터리·특수 파일 및 안전하지 않은 상위 경로는 설치 변경 전에 거부한다.
- 백업은 원본 파일 내용과 기존 백업 정책의 metadata를 보존한다.
- 외부 자료 취득 이후에도 폐기 후보 집합을 재확인한다. 검사 이후 대상이 추가·삭제·변경되어 상태가 달라졌으면 설치를 중단한다.
- 폐기 파일 이동과 활성 프로필 교체는 기존 거래 및 rollback 흐름에 포함한다. 중간 실패 시 이미 이동한 폐기 파일과 변경된 활성 파일을 복구한다.
- 복구 실패 시 오류, 백업 위치, 복구 자료 위치를 보고하고 자료를 보존한다. 성공으로 보고하지 않는다.
- dry-run은 설치·삭제·백업을 수행하지 않고 다섯 역할의 설치와 발견된 폐기 대상을 표시한다.
- 설치 입력·파일 유형·안전성 검사, 자료 취득 또는 백업 준비 실패 시 대상 파일을 제거하지 않는다.

## 6. 정합성 변경 파일

| 파일 | 책임 |
|---|---|
| skill/SKILL.md | 라우팅, 다섯 역할·별칭, Scouter 범위, 문서 제외, 보고·모델 계약 |
| agents/harness-scouter.toml | 새 읽기 전용 조사·탐색 프로필 |
| agents/harness-secretary.toml, agents/harness-scout.toml | 저장소의 활성 프로필에서 제거 |
| agents/harness-planner.toml | 이전 Secretary 문서 책임을 전제로 한 잔여 문구 정리 |
| skill/models.toml | version 5와 다섯 모델 항목 |
| skill/scripts/model_config.py | ID 매핑, 버전·필드 검증, 직렬화 |
| skill/scripts/apply-models.py | 다섯 프로필 check·dry-run·적용 출력 |
| install.py | 다섯 활성 대상과 두 폐기 대상의 검사·백업·거래·rollback·출력, yunho-team-* 자동 마이그레이션 검사 제거 |
| skill/references/handoff.md | 다섯 역할의 작업공간·인계 표현, Codex 앱 관리형 worktree 생성·검증·전달 |
| skill/references/planning.md | Secretary 문서 책임 잔여 표현과 관리형 worktree 준비 순서 |
| skill/references/git-recovery.md | 관리형 worktree 생성·등록·대화 연결 실패와 부분 완료 복구 경계 |
| skill/references/verification.md | Scout 참조를 Scouter로 교체하고 역할 경계 유지 |
| README.md | 역할 표, 문서 범위, 다섯 프로필, version 5, 설치·백업·관리형 worktree 설명 |
| tests/test_install.py | 역할·라우팅·모델·설치·안전 거부·rollback·관리형 worktree 정책 회귀 검사 |
| MANIFEST.sha256 | 새 배포 파일 집합과 변경 payload의 해시 |

config.toml은 런타임 수용량 예시만 담고 현재 다섯 역할 ID를 열거하지 않으므로 수정하지 않는다. 과거 docs/superpowers/specs/ 및 plans/의 승인 기록은 역사 자료로 유지하고 수정하지 않는다.

## 7. 수락 기준

| ID | 기준 |
|---|---|
| AC-01 | 활성 식별자·프로필·모델 설정이 Scouter, Planner, Coder, QA, Reviewer의 정확히 다섯 개다 |
| AC-02 | Scouter는 harness_scouter, agents/harness-scouter.toml, sandbox_mode = read-only, gpt-6-luna/max 설정을 사용한다 |
| AC-03 | Scouter가 할당된 자료 분석과 정적 코드·문서·데이터 탐색을 읽기 전용으로 수행하고 근거·미해결 사항을 CEO에게 보고한다 |
| AC-04 | Scouter의 파일 편집·독립 문서 파일 작성·직접 위임을 금지하고 운영 상태 조사·정리 제외를 유지한다 |
| AC-05 | 독립 문서 작성 요청을 어떤 전문 역할에도 자동 배정하지 않는다 |
| AC-06 | Planner·Coder·QA·Reviewer의 서로 다른 책임과 CEO 통합·수락 책임이 현행 정책과 일치한다 |
| AC-07 | version 5의 정확한 역할 스키마만 허용하고 잘못된 버전·ID·필드는 변경 없이 거부한다 |
| AC-08 | 새 설치·반복 설치는 다섯 프로필만 배포하고 dry-run은 부작용 없이 이를 표시한다 |
| AC-09 | 설치기가 기존 Secretary·Scout 프로필을 백업 후 제거하며 일반 중간 실패에서 원상 복구한다 |
| AC-10 | 폐기 후보의 부재·일부 존재·전부 존재, 경로 유형 거부, 후보 집합 변경을 처리한다 |
| AC-11 | yunho-team-* 구형 경로는 검사·백업·삭제하지 않고 그대로 보존하며, 무관한 사용자 프로필을 변경하지 않는다 |
| AC-12 | rollback 실패 시 오류 및 백업·복구 자료 경로를 보고하고 복구 자료를 보존한다 |
| AC-13 | 현재 정책·프로필·모델·설치기·참조·README·테스트·manifest가 정합하다 |
| AC-14 | 과거 승인 spec/plan과 그 역사적 내용은 변경하지 않는다 |
| AC-15 | 새 worktree 선택 시 CEO는 `mcp__codex_app__create_worktree`에 `allowAsync: true`, 설명용 `name`, 검증된 원본 HEAD 전체 SHA `ref`를 전달하며 직접 `git worktree add`를 사용하지 않는다. 선택된 branch 후보를 검증된 managed worktree에서 생성하거나, 같은 base를 가리키며 미사용인 기존 승인 branch를 확인해 체크아웃한다 |
| AC-16 | 도구가 비동기로 반환하면 `mcp__codex_app__get_worktree_creation_status`로 완료를 확인한다. 완료 뒤 반환된 실제 경로·앱 관리 및 현재 대화 연결·초기 branch/detached 상태·HEAD/ref·linked 등록·common directory·대상 dirty state와 원본 보존을 검증한다. 최종 checkout은 사용자 승인 branch여야 한다 |
| AC-17 | 도구가 미커밋 변경을 복사하지 않는 전제에서 승인 문서만 전달한다. Tracked 원본 문서는 index blob·mode가 source HEAD와 같아 staged 변경이 없고 working-tree bytes가 최신 승인 버전과 같아야 한다. 대상의 깨끗한 base 문서를 확인한 뒤 승인 bytes로 교체하고 원본은 변경하지 않는다. Untracked 문서는 HEAD/index에 경로가 없고 승인 bytes와 일치해야 한다 |
| AC-18 | 도구 불가·생성/등록/연결 실패·identity/base 검증 불일치·branch 충돌 시 후속 작업과 Coder 인계를 중단하고 상태를 기록한다. raw Git 생성, 다른 name/ref/path/branch 자동 재시도, 자동 삭제·prune·archive로 fallback하지 않는다 |

## 8. 검증 및 위험

역할 공유 계약, 모델 schema, 프로필 제거·복구, managed worktree 실행 준비가 함께 바뀌므로 significant 변경이다. 테스트를 먼저 작성해 실패를 확인한 다음 구현하고 전체 관련 테스트를 실행한다. Coder 이후 독립 QA가 수락 기준을 검사하고, 그 뒤 Reviewer가 최종 전체 변경을 검토한다. CEO가 근거와 미검증 범위를 검토해 수락한다.

검사 설계는 각 AC의 방법·범위·실행 상태·근거·판정·미검증 사유를 연결한다. 구조 검사는 정적 정책과 설정 정합성만 입증한다. 설치 테스트는 시험 환경에서 다룬 설치 동작만 입증한다. 실행 중인 에이전트의 실제 준수나 모델 서버의 가용성을 입증했다고 말하지 않는다.

최소 검증 대상은 정확한 다섯 ID와 각 모델·effort(Scouter는 gpt-6-luna/max) 및 version 5 입력 검증, 모델 적용의 check/dry-run/실제 적용, 새·반복 설치, 폐기 대상의 백업·삭제·rollback, 안전하지 않은 경로 거부, 후보 집합 변경, yunho-team-* 경로를 읽거나 변경하지 않는 것, 사용자 파일 보존, manifest 및 현재 정책 정합성이다. 관리형 worktree 정책 검사는 입력·비동기 완료·대화 연결·identity 검증·문서 전달·실패 시 no-fallback 지침의 정합성을 확인한다. 실제 앱 도구의 provisioning 및 연결은 도구 호출 결과로 별도 검증하며 구조 검사만으로 입증했다고 말하지 않는다.

### 8.1 확인된 텍스트 길이 제한 제거

`tests/test_install.py`의 `ConditionalReferenceTests.test_core_word_count_meets_budget`는 `wc -w`로
`skill/SKILL.md`를 계산해 2788단어 이하를 강제한다. 글자 수가 아닌 단어 수 제한이지만 사용자 요청의
텍스트 길이 제한으로 처리하여 해당 테스트를 제거한다. 다른 구현·설정은 변경하지 않는다.
`_validated_string`의 비어 있음·주변 공백·제어문자·줄바꿈 검증은 길이 상한이 아니므로 유지한다.
관련 구조 검색으로 제한 테스트 부재를 확인하고 전체 unittest suite를 실행한다. tests 파일은
MANIFEST.sha256 관리 대상이 아니므로 이 제거만으로 manifest를 갱신하지 않는다.

## 9. 제외 범위

- 과거 spec/plan 수정, 외부 skill 변경, 전역 사용자 설정 자동 수정
- 다른 활성 역할의 모델·effort 변경
- 문서 작성 전문 역할 신설 또는 다른 역할로의 자동 재배정
- Scouter의 live 운영 상태 조사·운영 정리 권한
- 모델 설정 자동 마이그레이션
- 실행 중인 구 역할 agent의 자동 종료·이름 변경·부모 관계 변경
- 실제 사용자 Codex 홈 설치, push, merge 또는 배포

새 프로필은 새 세션에서 사용된다. 이미 실행 중인 에이전트의 지침이나 관계가 자동 전환된다고 보장하지 않는다.

## 10. Codex 앱 관리형 worktree 실행 대상

사용자가 세 번째 실행 대상인 새 worktree를 선택하면 CEO는 Codex 앱 도구 `mcp__codex_app__create_worktree`를 사용한다. 직접 `git worktree add`로 생성하지 않는다. Branch 이름 선택·충돌 규칙은 유지하되, 도구 완료 후 반환된 managed worktree 안에서 승인 branch를 생성하거나 확인해 체크아웃한다.

선택 전에 다음 입력과 앱 동작을 제시한다.

- 원본 절대 경로, 저장소·Git common directory, 원본 branch 또는 detached HEAD, 검증된 전체 HEAD SHA
- 사용자 선택 branch 후보와 충돌 상태, 도구에 전달할 짧은 설명용 `name`, `ref`에 사용할 전체 HEAD SHA
- 승인 spec/plan의 전달·대상 커밋 범위
- 앱이 목적지 경로를 결정하고 완료된 worktree를 현재 대화에 연결한다는 점, tool이 branch 이름 인자를 받지 않으므로 완료 뒤 CEO가 승인 branch를 체크아웃한다는 사실

도구 인자에는 목적지 경로와 branch 이름이 없다. 설명용 `name`은 경로를 보장하지 않는다. branch 후보는 도구 호출 전 일반 branch collision rule로 검사하고 사용자 승인을 받는다. 후보가 이미 존재하면, 그 branch가 승인된 후보이며 선택한 base SHA를 가리키고 어떤 worktree에도 checkout되어 있지 않을 때만 재사용한다. 그 밖의 충돌은 사용자가 새 후보를 선택할 때까지 중단한다.

호출 예시는 다음과 같다.

```text
mcp__codex_app__create_worktree({
  allowAsync: true,
  name: "scouter-role-integration",
  ref: "<verified-source-head-sha>"
})
```

`ref`를 생략하면 도구의 remote default branch가 사용될 수 있으므로 생략하지 않는다. 자동 fetch나 다른 base 대체를 하지 않는다. 호출 직전에 원본 경로·저장소·HEAD·index·파일 상태, SHA, 승인 branch 후보와 충돌 상태, `name`, 승인 문서 범위를 다시 확인한다. 이 값이 달라졌으면 갱신된 입력으로 새 명시 선택을 받는다.

도구가 `operationId`를 반환하면 `mcp__codex_app__get_worktree_creation_status`로 완료를 확인한다. 준비·생성·등록 진행 상태는 성공으로 취급하지 않는다. 등록 실패 시에만 도구가 반환한 workspace 경로로 `mcp__codex_app__attach_worktree`를 재시도할 수 있다. 관리형 등록·대화 연결이 완료되기 전에는 문서 전달, staging, commit, Coder 시작을 하지 않는다.

완료 후 CEO는 반환된 실제 절대 경로와 앱 artifact/대화 연결 상태를 확인하고 다음을 기록한다.

- 반환된 worktree 경로와 현재 대화의 관리형 연결
- linked-worktree 등록, 원본과 대상의 Git common directory 일치
- 도구의 초기 branch 또는 detached HEAD, 승인 branch 후보, 최종 branch, 대상 HEAD와 승인 `ref` SHA 일치
- 대상의 staged·unstaged·untracked 상태
- 원본 branch·HEAD·index·파일 보존

경로와 초기 branch 상태는 도구 결과 및 Git 상태에서 확인하고 불일치를 추정으로 해결하지 않는다. 목적지는 앱이 정한 실제 경로를 사용한다. 대상 HEAD가 승인 `ref`와 같고 등록·연결이 확인된 뒤, 초기 상태가 detached이면 승인 후보를 `git switch -c <approved-branch> <ref>`로 만든다. 같은 base를 가리키는 미사용 승인 branch가 이미 있으면 `git switch <approved-branch>`로 체크아웃한다. 승인 후보가 아닌 branch를 체크아웃하거나 branch pointer를 이동하거나 충돌 후보를 자동 변경하지 않는다. 최종 branch와 HEAD를 재검증한다.

도구는 미커밋 변경을 복사하지 않는다. Untracked 승인 문서는 source HEAD·index에 경로가 없고 source working-tree bytes가 최신 승인 내용과 같아야 한다. Tracked 승인 문서는 source index의 blob·mode가 source HEAD와 같아 staged 변경이 없어야 하고, source working-tree bytes는 최신 승인 내용과 같아야 한다. 승인된 working-tree 개정은 source HEAD/index와 다를 수 있으며, 확인을 위해 원본 문서를 staging하지 않는다.

전달 대상의 HEAD는 선택된 source base SHA여야 한다. 승인된 tracked 문서를 교체하기 전 대상 경로의 staged·unstaged 변경이 없고 index·working-tree bytes가 base 문서와 같은지 확인한다. Base에 없는 문서는 대상에서도 없어야 복사할 수 있다. 목적지가 worktree 밖으로 나가는 symlink, 예상 밖 내용, 상태 불일치는 중단 사유다. 승인된 spec/plan만 같은 상대 경로로 전달하고 bytes를 승인 버전과 대조한다. 원본은 수정·삭제·이동하지 않는다. 기존 승인 커밋을 검증해 재사용하고 남은 승인 문서만 대상에서 기존 일괄 준비 절차로 커밋한다.

생성·등록·연결·base/identity·branch·문서 전달 검증 실패는 후속 작업과 Coder 인계를 막는다. 도구 입력·operationId·결과·오류 및 확인한 원본/대상 상태를 기록한다. 도구가 불가하거나 실패해도 raw Git worktree 생성, 다른 name/ref/path/branch 자동 재시도, 자동 cleanup/prune/archive로 전환하지 않는다. `attach_worktree` 재시도 후에도 연결되지 않거나 상태를 검증할 수 없으면 중단하고 사용자에게 실제 상태를 보고한다.

## 11. 후속 절차

CEO는 이 초안을 통합하고 자체 검토한 뒤 사용자의 서면 명세 승인을 받는다. 승인 후 Planner가 writing-plans를 사용해 구현 계획 전체 초안과 자체 검토를 반환한다. 계획 승인, 실행 대상 선택 및 Coder 인계 게이트 완료 전에는 Coder를 시작하지 않는다.

---

### 자체 검토

- 승인된 다섯 역할 집합과 Scouter ID 및 사용자 지정 gpt-6-luna/max 모델 설정을 고정했다.
- Scouter의 읽기 전용 조사와 독립 문서 파일 작성의 차이를 명시했다.
- Planner 초안, Coder 구현 종속 문서, QA 검증, Reviewer 독립성, CEO 수락을 분리했다.
- 관리 대상인 구 Secretary·Scout와 설치기가 건드리지 않는 yunho-team-* 파일을 구분했다.
- version 5 스키마·설치·백업·삭제·rollback을 모두 수락 기준과 연결했다.
- 관리형 worktree 경로는 앱 도구로 실제 경로를 만들고, 승인 branch를 생성·체크아웃한 뒤 identity·base와 실제 branch 상태를 검증하도록 정했다. raw Git 생성 fallback은 금지했다.
- tracked 승인 문서 개정은 원본 staged 변경 없이 working-tree 승인 bytes를 전달하고, 대상의 깨끗한 base를 확인한 뒤 교체한다.
- config.toml이 역할 ID를 열거하지 않아 제외했고, 역사적 승인 자료를 변경 대상에서 뺐다.
- 확인된 텍스트 길이 제한은 tests/test_install.py의 test_core_word_count_meets_budget이며, skill/SKILL.md에 2788단어 상한을 강제한다. 사용자 요청 범위에 포함해 이 테스트를 제거한다.
- placeholder와 구현 인터페이스 불일치는 없다.

### 가정과 남은 제한

독립 문서 작성 제외는 전문 역할에 자동 배정하지 않는다는 의미로 해석했다. Scouter가 조사 결과를 대화 응답으로 설명하는 것은 허용한다. 운영 상태 조사·정리 제외는 기존 Secretary 정책을 유지한다. 설치 대상은 정확한 파일명으로 제한하며, 교체되는 파일의 기존 내용은 영구 백업으로 보존한다. 관리형 worktree의 목적지는 도구가 정하고 branch 이름은 사용자가 승인하므로 둘을 분리해 확인한다.
