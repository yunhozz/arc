# 신규 브랜치 checkout 승인과 기획 문서 commit 경로

## 1. 목적

Planner의 필요한 설계·명세·계획 승인이 끝난 뒤 CEO가 자동으로 신규 task branch를 생성하고 checkout하는 현재 흐름을 바꾼다. CEO는 실제 실행 대상을 제시하고 사용자의 명시적 승인을 받은 경우에만 신규 branch를 생성·전환한다.

신규 checkout 승인이 없으면 현재 checkout을 유지하고, 승인된 기획 문서를 현재 branch에서 docs commit한 뒤 Coder handoff를 진행한다. 신규 checkout을 승인받아 성공한 경우에는 task branch에서 기획 문서를 commit한 뒤 handoff한다. 따라서 기획 문서 commit은 checkout 여부와 무관하게 계속 수행한다.

기획 문서의 작성 완료나 내용 승인은 신규 branch 생성·전환 승인으로 간주하지 않는다. 브랜치 생성·전환 오류는 checkout 미승인 경로와 구분해 기존 실패 처리에 따른다.

## 2. 확정된 설계와 작업 경로

이 변경은 CEO의 브랜치 준비, docs commit, Coder handoff 순서를 바꾸는 공용 역할 계약 변경이므로 architectural 경로를 따른다. 작성 명세 승인 후 installed `writing-plans`로 구현 계획을 작성하고, 계획 승인 후 Coder가 구현한다.

선택한 흐름은 다음과 같다.

1. 필요한 설계·명세·계획 승인이 끝난다.
2. CEO가 실제 workspace와 Git 상태를 확인하고 신규 task branch 후보를 정한다.
3. CEO가 후보 branch 생성 및 checkout의 승인 여부를 사용자에게 묻는다. 명시적 승인이 있으면 신규 branch 경로를 진행한다. 승인이 없거나 사용자가 거절하면 신규 branch를 만들지 않고 현재 checkout 경로를 진행한다.
4. 선택한 경로에서 실제 branch/path와 기존 변경 상태를 확인한다.
5. 승인된 기획 문서만 현재 branch 또는 신규 task branch에서 docs commit한다.
6. commit 결과와 실행 경로를 기록하고 Coder에게 handoff한다.

신규 checkout 경로의 사용자 승인은 workspace, 현재 branch 또는 detached HEAD, 기준 HEAD 및 후보 task branch에 한정한다. 승인 대상이 달라지면 새 대상을 제시한다. checkout 승인 없이 현재 checkout을 유지하는 경로는 기존 요청의 대체 진행 경로이며 별도의 branch 생성 권한을 부여하지 않는다.

## 3. 변경 범위

| 파일 | 변경 내용 |
|---|---|
| `tests/test_install.py` | checkout 승인·현재 checkout 경로·경로별 docs commit·실패 fallback 금지의 구조 회귀 검사 추가 또는 갱신 |
| `skill/SKILL.md` | Workspace handoff에 checkout 승인 시점, 승인 대상, 현재 checkout 진행 경로, 경로별 docs commit 및 handoff 조건을 반영 |
| `MANIFEST.sha256` | 최종 `skill/SKILL.md`의 SHA-256 갱신 |

README에는 자동 checkout 절차에 대한 상세 계약이 없으며, 설치기 동작과 필수 스킬 구성도 바뀌지 않으므로 수정하지 않는다. 역사적 specs/plans는 당시 결정을 보존하므로 수정하지 않는다. 사용자는 관련 구조 회귀 검사 추가·수정과 실행을 승인했다. 검사는 실제 에이전트 runtime을 시뮬레이션하지 않고 정책 문구와 경로별 계약만 확인한다.

## 4. 공통 사전 확인과 승인 요청

필요한 설계·명세·계획 승인이 끝난 뒤, Coder handoff 전에 CEO는 다음을 확인한다.

1. 제공된 절대 workspace 경로에 접근할 수 있으며 의도한 Git checkout인지 확인한다.
2. 현재 branch 또는 detached HEAD와 현재 HEAD를 기록한다.
3. staged, unstaged, untracked 변경을 확인하고 보존·편집 소유 범위를 파악한다.
4. 신규 checkout 후보의 이름을 검증하고 충돌 여부를 확인한다.

CEO는 위 실제 상태와 신규 checkout 후보를 포함해 사용자의 명시적 승인을 요청한다. 기획 문서 승인은 branch 생성·전환 승인을 대신하지 않는다. 신규 branch에 대한 명시적 승인이 없으면 checkout을 시도하지 않고 기존 checkout 경로를 사용한다. 승인 요청에 답이 없거나 승인이 불명확한 경우도 새 branch 승인이 없는 것으로 처리한다.

## 5. 신규 task branch 경로

### 5.1 승인과 실행 직전 재확인

신규 branch 생성과 checkout은 사용자가 승인한 workspace, 현재 branch/base HEAD 및 후보 이름에 대해서만 진행한다. 실제 실행 직전에 해당 상태를 다시 확인한다. 승인 대상이 달라졌으면 새 실행 대상을 사용자에게 제시해 명시적 승인을 받는다. 변경된 대상에 승인이 없으면 신규 checkout을 하지 않고 기존 checkout 경로를 사용한다.

유효한 이름은 `<type>/<short-kebab-case-topic>` 형식을 따른다. 기존 branch와 충돌하면 기존 이름을 재사용·삭제·덮어쓰지 않고 `-2`, `-3`처럼 증가하는 suffix로 첫 미사용 후보를 정한다. 승인 후 후보가 바뀌면 새 후보도 승인받기 전에는 생성·checkout하지 않는다. 조회 오류를 branch 부재로 취급하지 않는다.

### 5.2 생성·전환과 성공 확인

CEO는 승인된 base HEAD에서 현재 checkout 안에 task branch를 생성하고 전환한다. 대표 동작은 `git switch -c <branch>`다. detached HEAD는 HEAD를 확인할 수 있고 그 상태가 승인 대상에 포함된 경우에 진행할 수 있다.

성공 후 실제 branch가 승인된 후보와 일치하는지, HEAD가 확인한 base와 일치하는지, 절대 checkout 경로가 유지되었는지, 기존 변경이 보존되었는지 확인한다.

branch 생성·전환 실패, 조회 오류, 예상과 다른 branch 상태, branch만 생성된 부분 완료가 발생하면 오류와 실제 Git 상태를 기록하고 Coder handoff를 중단한다. 이러한 운영 실패를 checkout 미승인으로 간주하거나 현재 checkout 경로로 자동 전환하지 않는다. worktree 생성도 대체 경로로 사용하지 않는다.

## 6. 승인 없는 현재 checkout 경로

사용자가 신규 checkout을 승인하지 않았거나 승인이 없는 경우 CEO는 신규 branch를 생성·전환하지 않고 현재 checkout에서 진행한다. 실제 workspace, branch 또는 detached HEAD, HEAD와 기존 변경 상태를 확인해 brief에 기록한다. 현재 checkout 상태가 확인되지 않거나 기존 변경의 보존·편집 소유 범위가 불명확하면 이를 해결하기 전까지 handoff를 중단한다.

이 경로는 branch 생성·전환의 운영 실패에 대한 fallback이 아니다. 사용자가 branch checkout을 승인하지 않아 선택된 정상 경로다. checkout 승인을 받지 못했다는 이유만으로 Coder handoff를 중단하지 않는다.

## 7. 기획 문서 commit과 Coder handoff

### 7.1 승인된 기획 문서가 있는 경우

신규 branch 경로에서는 branch/path 전환을 성공적으로 확인한 뒤, 현재 checkout 경로에서는 해당 경로와 기존 변경을 확인한 뒤 CEO가 승인된 기획 문서만 하나의 focused docs commit으로 기록한다. 기획 문서에는 실제 작성·승인된 spec과 plan 또는 실제 승인된 일부 기획 문서만 포함한다.

두 경로 모두 다음을 지킨다.

- staged 경로가 실제 승인 문서 경로와 정확히 일치해야 한다.
- implementation 파일과 관련 없는 변경을 포함하지 않는다.
- docs commit은 구현 수락을 뜻하지 않는다.
- commit SHA, 포함 경로와 post-commit HEAD를 brief에 기록한다.
- 별도의 명시적 사용자 요청 없이 push하지 않는다.
- commit 실패 또는 staged 경로 불일치가 발생하면 실제 branch/index 상태를 기록하고 Coder handoff를 중단한다.

### 7.2 기획 문서가 없는 경우

기존 깊이 규칙상 문서가 필요하지 않았고 실제 작성하지 않은 경로는 docs commit을 생략한다. 생략 사실과 적용한 깊이 판단 근거를 brief에 기록한다. 문서 부재는 신규 checkout 승인 조건을 바꾸지 않는다.

### 7.3 기존 변경 보존

staged, unstaged, untracked 변경을 보존한다. 자동 stash, reset, clean, 삭제 또는 무관한 변경 commit은 금지한다. 승인된 기획 문서만 commit하는 것은 기존 docs commit 예외로 유지한다. 새 branch 전환이 기존 변경 때문에 불가능하거나 편집 소유 범위가 불명확하면 CEO가 이를 해결하기 전까지 handoff를 중단한다.

## 8. Brief와 역할 전달

CEO는 brief에 실제 workspace 절대 경로, 이전 branch 또는 detached HEAD와 기준 HEAD, 기존 변경의 보존·편집 소유 범위, checkout 승인 결과와 근거, 실행 경로, 최종 branch 및 생성·전환 결과, 선택 이후 path/HEAD/변경 상태 확인, docs commit SHA와 경로 또는 생략 근거, 실패·부분 완료 및 해결 결과, 절대 artifact 경로를 기록한다.

모든 역할에 동일한 실제 workspace, 선택된 실행 checkout, 준비 증거와 artifact 절대 경로를 전달한다. 역할은 독립적으로 workspace나 branch를 생성·전환하지 않는다. 경로 누락·접근 불가·충돌 또는 예상과 다른 branch 상태를 발견하면 CEO에게 보고하고 dependent work를 중단한다.

## 9. 수용 기준과 검증

| ID | 수용 기준 |
|---|---|
| AC-1 | CEO는 신규 branch 생성·전환 전에 실제 workspace, 현재 branch/base HEAD와 후보 branch를 제시해 명시적 사용자 승인을 받는다. |
| AC-2 | 문서 작성 완료와 spec/plan 승인만으로 신규 branch checkout을 허용하지 않는다. |
| AC-3 | 명시적 checkout 승인이 있을 때만 신규 task branch를 만들고 승인된 후보로 전환한다. |
| AC-4 | 신규 checkout 승인이 없으면 현재 checkout에서 진행하며, branch 생성·전환을 시도하지 않는다. |
| AC-5 | 기획 문서가 있으면 승인된 문서만 경로별 실행 checkout에서 docs commit하고 commit SHA와 경로를 기록한다. |
| AC-6 | 기획 문서가 없는 허용 경로는 기존 규칙에 따라 commit을 생략하고 근거를 남긴다. |
| AC-7 | branch 생성·전환 오류와 부분 완료는 기록 후 handoff를 중단하며 현재 checkout 경로로 자동 전환하지 않는다. |
| AC-8 | 이름 충돌, 기존 변경 보존, docs-only staging 및 commit 실패 처리 계약을 유지한다. |
| AC-9 | 실제 선택 경로와 준비 결과를 brief 및 역할 handoff에 기록한다. |
| AC-10 | `MANIFEST.sha256`이 최종 `skill/SKILL.md`와 일치한다. |
| AC-11 | 구조 회귀 검사가 명시 승인, 승인 부재 시 현재 checkout, 두 경로의 docs commit, 대상 재승인 및 운영 실패 시 중단을 확인한다. |

Coder는 구조 회귀 검사를 먼저 추가·수정해 관련 unittest를 실행하여 의도한 RED를 확인한 뒤 계약을 수정하고 GREEN을 확인한다. 이후 전체 `python3 -B -m unittest discover -s tests -v`와 최종 manifest digest 일치를 검증한다. 구조 검토와 검사는 정책 문구 계약만 입증하며 실제 실행 중 에이전트가 매번 이를 준수함을 증명하지 않는다. 공용 역할 계약 변경이므로 독립 QA의 수용 기준 확인과 독립 Reviewer의 전체 변경 검토를 수행한다.

## 10. 가정 및 자체 검토

- 승인 주체는 사용자이며, CEO가 실행 전 상태 확인과 승인 확인을 담당한다.
- checkout 승인이 없으면 현재 checkout 경로에서 문서 commit과 작업을 계속하는 것은 사용자가 직접 정한 대체 경로다.
- 실제 작업 workspace는 `/Users/yunho/Desktop/project/arc`이며 branch/HEAD/dirty state는 handoff 직전에 다시 확인한다.
- 테스트 변경은 `tests/test_install.py`의 관련 구조 회귀 검사에 한정한다. 설치기, README, 역사적 spec/plan은 현재 변경 범위에 포함하지 않는다.

자체 검토에서 checkout 승인 여부와 문서 승인을 분리했고, 승인 없는 경로에서도 docs commit과 Coder handoff가 가능하도록 명시했다. branch 생성·전환 오류는 승인 부재와 분리해 자동 fallback하지 않는다. 두 경로의 docs-only staging, 기존 변경 보존, 문서 없는 경로 및 handoff 기록을 동일하게 유지한다.
