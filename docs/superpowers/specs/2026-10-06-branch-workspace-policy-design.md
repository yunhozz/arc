# 기획 승인 이후 브랜치 작업 흐름과 필수 설치 스킬 변경

## 1. 목적

Planner 기획 이후 구현 준비 과정에서 using-git-worktrees 실행을 요구하는 하네스 계약을 제거한다. CEO는 이 작업에 필요한 설계·명세·계획 승인이 완료된 뒤, 구현 전에 현재 저장소 checkout에서 작업 브랜치를 생성하고 해당 브랜치로 전환한다.

신규 설치의 필수 외부 스킬 집합에서도 using-git-worktrees를 제외한다. 하네스 지침, 설치기, README와 배포 manifest가 같은 계약을 설명하도록 변경한다.

## 2. 확정된 결정과 작업 경로

이 작업은 역할 간 workspace handoff와 설치 의존성 계약을 함께 변경하는 구조적 작업이다. 작성된 명세 승인 이후 설치된 writing-plans 스킬로 구현 계획을 작성하며, 계획 승인 이후 Coder가 구현한다.

사용자가 확정한 동작은 다음과 같다.

- 작업 브랜치를 생성하고 현재 checkout도 새 브랜치로 전환한다.
- 현재 저장소 checkout의 절대 경로를 유지한다.
- 하네스 지침에서 worktree provisioning 요구를 제거한다.
- 기존 역할 책임과 설계·명세·계획 승인 단계를 유지한다.

브랜치 준비는 Coder 시작 전에 수행한다. 기획 승인만으로 아직 필요한 명세·계획 승인 단계를 건너뛰지 않는다.

## 3. 변경 범위

| 파일 | 변경 내용 |
|---|---|
| skill/SKILL.md | Workspace handoff를 브랜치 생성·전환 계약으로 대체 |
| install.py | 필수 외부 스킬 목록에서 using-git-worktrees 제외 |
| README.md | 필수 외부 스킬을 brainstorming, writing-plans, test-driven-development 세 개로 설명 |
| MANIFEST.sha256 | 최종 변경된 manifest 대상 파일의 checksum 갱신 |
| tests/test_install.py | 테스트 수정이 승인된 경우에만 필수 스킬 목록과 관련 기대값 변경 |

역사적 docs/specs/plans는 수정하지 않는다. 기존 사용자의 설치 디렉터리에서 using-git-worktrees를 삭제하지 않는다. 외부 using-git-worktrees 스킬 자체도 수정하지 않는다.

설치기는 사용자 작업 저장소의 브랜치를 생성하거나 전환하지 않는다. 브랜치 준비는 하네스 실행 시 CEO의 책임이다.

## 4. 브랜치 준비 계약

### 4.1 사전 확인과 시점

필요한 설계·명세·계획 승인이 완료되고 Coder에게 구현을 넘기기 전에 CEO가 다음을 확인한다.

1. 제공된 workspace 절대 경로에 접근할 수 있다.
2. 해당 경로가 의도한 Git 저장소 checkout에 속한다.
3. 현재 브랜치 또는 detached HEAD 상태와 현재 HEAD를 확인한다.
4. staged, unstaged, untracked 변경을 포함한 Git 상태를 확인한다.
5. 생성할 작업 브랜치 이름이 유효하며 기존 브랜치와 충돌하지 않는다.

작업 브랜치는 확인한 현재 HEAD에서 생성한다. 이름은 다음 형식을 따른다.

    <type>/<short-kebab-case-topic>

CEO는 작업의 주된 목적에 맞는 소문자 prefix를 고른다. 주제는 짧고 구체적인 소문자 kebab-case로 쓰며, 공백을 넣지 않고 Git의 유효한 branch name 조건을 따른다.

| Prefix | 용도 |
|---|---|
| feat/ | 새 기능 추가 |
| fix/ | 버그 수정 |
| refactor/ | 동작을 유지하는 코드 구조 개선 |
| docs/ | 문서 변경 |
| test/ | 테스트 추가·수정 |
| build/ | 빌드·패키징·의존성 구성 변경 |
| ci/ | CI 구성 변경 |
| perf/ | 성능 개선 |
| style/ | 동작 변경 없는 서식·스타일 변경 |
| chore/ | 운영 정책·도구·유지보수 변경 |
| revert/ | 이전 변경 되돌리기 |

여러 유형이 섞이면 주된 목적을 기준으로 prefix를 고른다. 이 하네스·설치 정책 변경의 예시는 chore/branch-workspace-policy이다.

Detached HEAD에서도 현재 HEAD를 확인할 수 있고 새 브랜치 생성·전환이 성공하면 준비를 완료할 수 있다. HEAD를 해석할 수 없는 저장소 상태에서는 중단한다.

### 4.2 생성과 전환

CEO는 현재 checkout에서 새 작업 브랜치를 생성하고 전환한다. 대표 동작은 git switch -c에 정한 브랜치 이름을 전달하는 것이다.

성공 후 실제 현재 브랜치가 생성한 작업 브랜치인지 확인한다. checkout 경로가 유지되었는지도 확인한 뒤 역할별 handoff를 진행한다.

기본 브랜치 이름이 이미 있으면 기존 브랜치를 재사용하거나 덮어쓰지 않는다. 주제 끝에 -2, -3처럼 2부터 증가하는 숫자 suffix를 붙여 충돌하지 않는 첫 이름을 선택한다. 예: chore/branch-workspace-policy, chore/branch-workspace-policy-2, chore/branch-workspace-policy-3. 생성 시점에 추가 충돌이 생기면 다음 suffix로 다시 시도한다. worktree 생성으로 fallback하지 않는다.

### 4.3 기존 미커밋 변경

브랜치는 worktree처럼 미커밋 변경을 별도의 작업 디렉터리로 격리하지 않는다. 전환이 성공해도 기존 staged, unstaged, untracked 변경이 같은 checkout에 남을 수 있다.

CEO는 기존 변경과 이번 작업의 관계를 확인하고, 변경 보존 및 편집 범위를 brief에 기록한다. 브랜치 준비를 위해 변경을 자동으로 stash, commit, reset, clean 또는 삭제하지 않는다.

기존 변경 때문에 Git이 전환을 거부하거나 작업 소유 범위가 불명확하면 준비를 완료한 것으로 처리하지 않는다. CEO가 해당 상태와 다음 조치를 정리한 뒤 준비를 재개한다.

### 4.4 실패 동작

| 상황 | 요구 동작 |
|---|---|
| workspace가 없거나 접근할 수 없음 | 절대 경로와 실패 원인을 보고하고 dependent work 중단 |
| 의도한 Git 저장소가 아님 | 브랜치 준비 중단. 자동 git init 또는 다른 저장소로 전환하지 않음 |
| 브랜치 이름이 유효하지 않음 | 생성하지 않고 이름 수정 필요를 CEO가 처리 |
| 브랜치 이름 충돌 | 기존 브랜치를 삭제·덮어쓰기·재사용하지 않고 -2부터 숫자 suffix를 붙여 새 고유 이름을 선택 |
| 브랜치 생성 또는 전환 실패 | 오류와 실제 Git 상태를 확인·기록하고 Coder handoff 중단 |
| 실패 후 새 브랜치만 생성된 상태 | 부분 완료 상태로 보고. 자동 삭제하거나 준비 완료로 간주하지 않음 |
| 성공 명령 뒤 현재 브랜치가 기대와 다름 | 불일치를 보고하고 handoff 중단 |
| 역할이 전달된 workspace 또는 브랜치의 불일치를 발견 | CEO에게 보고하고 dependent work 중단 |

실패 시 worktree 생성으로 자동 fallback하지 않는다. CEO는 실제 상태를 바탕으로 문제를 해결하고 브랜치 준비 결과를 다시 확인한다.

## 5. 역할별 handoff와 기록

CEO는 모든 역할에 동일한 실제 workspace 절대 경로와 작업 브랜치를 전달한다. brief에는 다음을 기록한다.

- 실제 workspace 절대 경로.
- 준비 전 브랜치 또는 detached HEAD 상태와 기준 HEAD.
- 준비 전 변경 상태와 기존 변경의 보존·편집 범위.
- 생성한 작업 브랜치 이름.
- 생성·전환 결과와 성공 후 현재 브랜치 확인 결과.
- 실패나 부분 완료가 있었다면 해당 상태와 해결 결과.
- 전달하는 artifact의 절대 경로.

Coder와 QA는 전달된 workspace에서 작업한다. Planner, Reviewer, Scout도 동일한 workspace를 사용하며, 모든 역할은 누락·접근 불가·충돌하는 경로나 예상과 다른 브랜치 상태를 CEO에게 보고한다.

이 변경은 역할이 독자적으로 workspace를 만들거나 전환할 권한을 추가하지 않는다.

## 6. 설치기 계약

필수 외부 스킬 집합은 다음 세 개가 된다.

- brainstorming
- writing-plans
- test-driven-development

설치 명령의 외부 스킬 요청 목록, fetch 결과 검증, 쓰기 대상은 이 집합을 따른다. using-git-worktrees는 신규 fetch 요청, 필수 결과 검증, 신규 쓰기 대상에 포함되지 않는다.

나머지 세 스킬의 필수 파일 검증과 실패 동작은 유지한다. 외부 fetch 결과에 필수 스킬이 없거나 기존 검증 기준을 충족하지 못하면 설치 실패로 처리한다.

이미 설치된 using-git-worktrees를 발견해도 이 변경 때문에 삭제하지 않는다. 신규 필수 집합에서 제외하는 동작과 기존 파일 제거는 구분한다.

## 7. 문서와 manifest

README는 필수 외부 스킬 수를 세 개로 설명하고 정확한 이름을 명시한다. 활성 설치 설명이나 workspace handoff 설명에 using-git-worktrees가 계속 필수인 것처럼 남지 않도록 관련 문구를 함께 수정한다.

MANIFEST.sha256는 최종 파일 내용에 맞춰 갱신한다. 현재 manifest의 대상과 형식은 유지하며, 대상 파일 내용이 확정된 뒤 checksum을 산출한다.

## 8. 수용 기준

1. 활성 skill/SKILL.md에 installed using-git-worktrees 실행 의무와 worktree provisioning 절차가 남아 있지 않다.
2. 필요한 기획 승인 단계가 완료된 뒤 Coder 시작 전에 CEO가 Git 상태 확인, 새 작업 브랜치 생성, 전환, 성공 확인을 수행하도록 명시되어 있다.
3. 브랜치는 현재 HEAD를 기준으로 하며 현재 checkout 절대 경로를 유지한다.
4. 브랜치 이름이 type/topic 형식이며 작업 목적에 맞는 소문자 prefix와 소문자 kebab-case 주제명을 사용한다.
5. 이름에 공백이 없고 Git에서 유효하며, 충돌 시 기존 브랜치를 재사용·삭제·덮어쓰지 않고 -2부터 숫자 suffix를 붙여 새 이름을 선택한다.
6. non-Git workspace, 생성·전환 실패, 부분 완료와 handoff 불일치의 중단 동작이 명확하다.
7. 브랜치가 미커밋 변경을 worktree처럼 격리하지 않는다는 점과 기존 변경 보존 원칙이 명시되어 있다.
8. 모든 역할에 workspace, 작업 브랜치, 준비 증거와 artifact 절대 경로를 전달하도록 규정되어 있다.
9. 설치기의 필수 외부 스킬 집합과 실제 fetch·validate·write 경로에서 using-git-worktrees가 제외된다.
10. README가 같은 세 스킬 집합을 설명한다.
11. 변경된 manifest 대상 파일의 checksum이 실제 최종 내용과 일치한다.
12. 역사적 문서와 기존 사용자의 외부 스킬 설치 파일은 변경 범위에 포함되지 않는다.
13. 승인된 테스트 수정 범위가 있으면 기대값이 새 계약과 일치하고 관련 installer 검증이 통과한다. 테스트 수정이 승인되지 않으면 기존 네 스킬 기대값과의 불일치를 해결되지 않은 검증 항목으로 명시한다.

## 9. 검증 요구사항

구현 계획에는 다음 검증을 포함한다.

- tests/test_install.py의 외부 스킬 요청 목록, 필수 파일 검증 및 설치 결과 관련 기존 검증을 새 세 스킬 계약에 맞춰 확인한다.
- using-git-worktrees가 필수 집합에 없으며 남은 필수 스킬 누락은 여전히 실패하는지 확인한다.
- 활성 하네스와 README의 브랜치·필수 스킬 설명을 일치 확인한다.
- manifest 대상 파일의 checksum을 재확인한다.
- 브랜치 계약의 성공 경로, 충돌·전환 실패·부분 완료 처리, 기존 변경 보존 및 동일 workspace handoff를 구조적으로 확인한다.

브랜치 계약의 구조 검토만으로 모든 Git 환경에서 실제 전환 동작을 검증했다고 주장하지 않는다. 실행 검증을 추가할 경우 그 범위와 환경은 구현 계획에서 정한다.

공유 역할·설치 계약 변경이므로 독립 QA 이후 최종 전체 변경에 대한 독립 Reviewer 검토를 수행한다.

## 10. 가정과 남은 결정

- 현재 제공된 구현 workspace는 /Users/yunho/Desktop/project/yunho-harness이다.
- CEO가 확인한 현재 상태는 master, clean이다. 실제 구현 직전 상태는 다시 확인한다.
- 브랜치 생성·전환은 하네스 운영 지침 변경이며 새로운 설치기 기능이 아니다.
- 필수 외부 스킬 집합 변경은 기존 mapping 기반 흐름을 사용한다.
- tests/test_install.py 수정 권한은 아직 확정되지 않았다. CEO는 구현 계획 승인 전에 테스트 기대값 수정 범위를 확정해야 한다.
- 이번 명세는 기존 사용자 설치에 대한 uninstall 또는 migration 기능을 요구하지 않는다.

## CEO 자체 검토

- 설계·명세·계획 승인 완료와 브랜치 준비 시점을 분리해 승인 단계를 우회하지 않도록 했다.
- 현재 checkout 유지와 브랜치 생성·전환의 의미를 명확히 했고, 브랜치 기준점을 현재 HEAD로 고정했다.
- 작업 유형 prefix, kebab-case 이름 형식, 충돌 suffix, 실패·부분 완료 및 미커밋 변경의 취급을 정의했다.
- 설치기의 브랜치 조작과 기존 외부 스킬 삭제가 범위에 섞이지 않도록 했다.
- 테스트 수정 권한을 해결되지 않은 항목으로 남기고 승인 없이 검증 완료로 간주하지 않았다.
- 역사적 문서와 기존 사용자의 설치 스킬은 보존한다.
