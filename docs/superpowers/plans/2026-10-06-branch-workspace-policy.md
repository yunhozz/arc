# 브랜치 작업 흐름과 필수 설치 스킬 변경 Implementation Plan

> **For agentic workers:** REQUIRED 실행 방식은 Yunho Harness의 CEO 순차 조정이다. CEO가 승인·순서·handoff·수용을 조정하고 Coder가 지정 파일을 수정한다. QA는 독립 검증을 수행하며 Reviewer는 QA 이후 최종 전체 변경을 검토한다. Executor subskill의 위임 방식과 별도 실행 방식 선택은 Harness adapter로 대체한다. 단계는 checkbox로 추적한다.

**Goal:** 현재 checkout에서 구현 전 작업 브랜치를 생성·전환하도록 하네스 계약을 변경하고, 필수 외부 설치 스킬을 세 개로 줄인다.

**Architecture:** skill/SKILL.md는 CEO의 브랜치 준비와 역할별 handoff를 규정한다. install.py는 기존 REQUIRED_EXTERNAL_FILES 기반 흐름으로 세 스킬의 fetch·검증·쓰기 대상을 결정하며 브랜치를 조작하지 않는다. README와 manifest를 최종 계약 및 파일 내용에 맞춘다.

**Tech Stack:** Python 3, unittest, Git, Markdown, SHA-256 manifest.

**Spec:** /Users/yunho/Desktop/project/yunho-harness/docs/superpowers/specs/2026-10-06-branch-workspace-policy-design.md

## Global Constraints

- 구현 workspace는 /Users/yunho/Desktop/project/yunho-harness이다.
- 필요한 설계·명세·계획 승인이 완료된 뒤 Coder 시작 전에 CEO가 새 브랜치를 생성하고 전환한다.
- 브랜치는 확인한 현재 HEAD에서 생성하며 기존 checkout 절대 경로를 유지한다.
- worktree를 생성하지 않는다.
- 브랜치 이름은 작업 유형 prefix, 슬래시, 소문자 kebab-case 주제명 순서를 따른다. 기본 이름은 chore/branch-workspace-policy이다.
- 충돌 시 -2, -3 순서로 새 이름을 선택한다. 기존 브랜치를 재사용·삭제·덮어쓰지 않는다.
- 자동 stash, commit, reset, clean 또는 기존 변경 삭제를 하지 않는다.
- 모든 역할에 동일한 실제 workspace, 작업 브랜치, 준비 증거와 artifact 절대 경로를 전달한다.
- 필수 외부 스킬은 brainstorming, writing-plans, test-driven-development이다.
- 기존 사용자 설치본, 역사적 문서, 기존 역할 책임과 승인 단계를 보존한다.
- 기존 설치기의 파일 검증·환경 격리·rollback 계약을 유지한다.
- 테스트 수정·추가·실행은 사용자가 명시적으로 승인한 뒤 수행한다.
- 이번 작업에서는 commit과 push를 하지 않는다.

## Review Focus

| 조건 | 기대 동작 | 소유 작업·확인 단계 |
|---|---|---|
| 세 필수 스킬 중 하나가 CLI 결과에서 누락 | 누락을 오류로 거부 | Task 2: 기존 partial JSON 및 필수 파일 검증 |
| CLI 결과에 제외된 using-git-worktrees가 포함 | 예상하지 않은 스킬로 거부 | Task 2: acquisition 결과 집합 회귀 테스트 |
| 선택 또는 legacy 설치 경로에 기존 worktree 스킬이 존재 | 새 설치 뒤에도 해당 트리를 보존 | Task 2: 기존 설치본 보존 회귀 테스트 |
| --check 또는 --dry-run 실행 | 세 스킬만 대상으로 하며 fetch와 쓰기 없음 | Task 2: 읽기 전용 및 dry-run 회귀 검증 |
| 세 스킬 동기화 또는 프로필 적용 중 실패 | 기존 대상 복구와 복구 경로 보고 유지 | Task 2: 기존 rollback 회귀 테스트 |

브랜치의 non-Git·이름 충돌·전환 실패·부분 완료·변경 보존은 Task 3의 정책 구조 검토로 확인한다. 이번 브랜치 생성·전환은 Task 1에서 실제 실행 결과를 기록한다. 정책 구조 검토만으로 모든 Git 실패 상황의 실행 검증을 주장하지 않는다.

## 승인 게이트

- [ ] CEO가 이 계획을 통합·저장하고 자체 검토한다.
- [ ] CEO가 사용자에게 계획 승인을 받는다.
- [ ] CEO가 tests/test_install.py fixture·기대값 수정, 필요한 회귀 테스트 추가, TDD RED/GREEN 및 최종 QA 테스트 실행에 대한 명시적 사용자 승인을 받는다.
- [ ] CEO가 승인 범위와 증거를 Coder brief에 기록한다.

상위 지침은 사용자가 테스트나 구현 검증을 요청하지 않은 경우 테스트를 추가하거나 실행하지 못하도록 규정한다. 명세·계획 작성 승인을 테스트 작업 승인으로 간주하지 않는다. 테스트 승인이 오기 전에는 Task 1–4를 실행하지 않는다. 승인 없이 installer 구현을 하거나 검증을 생략한 일부 변경을 완료 경로로 사용하지 않는다.

## Files and Ownership

| 파일 | 담당·책임 |
|---|---|
| /Users/yunho/Desktop/project/yunho-harness/skill/SKILL.md | Coder: workspace handoff 계약 |
| /Users/yunho/Desktop/project/yunho-harness/install.py | Coder: 필수 집합과 설치 완료 문구 |
| /Users/yunho/Desktop/project/yunho-harness/tests/test_install.py | 승인 후 Coder: fixture·기대값·회귀 검증 |
| /Users/yunho/Desktop/project/yunho-harness/README.md | Coder: 설치 집합과 브랜치 운영 설명 |
| /Users/yunho/Desktop/project/yunho-harness/MANIFEST.sha256 | Coder: 최종 파일 checksum |

CEO는 위 구현·설정·테스트 파일을 직접 수정하지 않는다. Coder는 다른 작업자의 변경을 되돌리지 않고 지정한 범위에서 기존 구조를 유지한다.

## Task 1: CEO 작업 브랜치 준비

**Files**

- Read: /Users/yunho/Desktop/project/yunho-harness/docs/superpowers/specs/2026-10-06-branch-workspace-policy-design.md
- Read: /Users/yunho/Desktop/project/yunho-harness/docs/superpowers/plans/2026-10-06-branch-workspace-policy.md
- Modify: 없음. 현재 checkout의 Git 브랜치 상태만 변경한다.

**Interfaces**

- Consumes: 승인된 명세·계획, 테스트 작업 승인, 제공된 workspace.
- Produces: 실제 workspace, 기준 HEAD, 작업 브랜치, 변경 상태·소유 범위, 승인 artifact 경로를 담은 Coder brief.
- 이후 작업은 이 brief에 기록한 동일 workspace와 브랜치를 사용한다.

- [ ] **Step 1: 실제 workspace와 Git 상태를 확인한다.**

실제 제공된 workspace에서 다음을 실행한다.

    pwd -P
    git rev-parse --show-toplevel
    git branch --show-current
    git rev-parse HEAD
    git status --short --branch --untracked-files=all

checkout 경로, 현재 branch 또는 detached HEAD, 기준 HEAD, staged·unstaged·untracked 변경을 기록한다. 의도한 저장소가 아니거나 HEAD를 확인할 수 없으면 중단한다.

이전 master·clean 상태는 오래된 증거다. 승인된 명세와 저장된 계획은 untracked 문서일 수 있으므로 이를 승인 artifact로 식별하고 보존 범위를 기록한다. 그 밖의 변경도 별도로 확인한다.

- [ ] **Step 2: 유효하고 고유한 브랜치 이름을 선택한다.**

    git check-ref-format --branch chore/branch-workspace-policy
    git show-ref --verify --quiet refs/heads/chore/branch-workspace-policy

기본 이름이 이미 있으면 chore/branch-workspace-policy-2, chore/branch-workspace-policy-3 순서로 확인해 첫 사용 가능한 이름을 선택한다. 이름 부재를 나타내는 종료 상태와 조회 명령 자체의 오류를 구분한다.

- [ ] **Step 3: 선택한 브랜치를 현재 HEAD에서 생성하고 전환한다.**

기본 이름이 사용 가능하면 다음을 실행한다.

    git switch -c chore/branch-workspace-policy

충돌이 있으면 Step 2에서 선택한 suffix 이름을 사용한다. 생성 시점에 추가 충돌이 발생한 경우 다음 숫자를 시도한다. 다른 오류는 실제 Git 상태를 확인·기록하고 중단한다.

- [ ] **Step 4: 준비 전후 상태를 대조한다.**

    pwd -P
    git rev-parse --show-toplevel
    git branch --show-current
    git rev-parse HEAD
    git status --short --branch --untracked-files=all

checkout 경로, 현재 브랜치, 기준 HEAD 및 기존 변경 보존을 확인한다. 실패 후 브랜치만 만들어진 상태는 부분 완료로 보고하며 자동 삭제하지 않는다.

- [ ] **Step 5: Coder brief를 확정한다.**

실제 workspace와 작업 브랜치, 준비 전후 증거, 승인 문서 절대 경로, 기존 변경의 소유·편집 범위, 테스트 승인 범위와 Coder 파일 소유권을 기록한다.

**완료 기준:** 새 작업 브랜치로 전환되었고 checkout과 기존 변경이 보존되었으며 경로·상태·소유 범위 문제가 해결되어 있다.

## Task 2: 외부 스킬 설치 계약을 TDD로 변경

**Files**

- Modify: /Users/yunho/Desktop/project/yunho-harness/install.py
- Test: /Users/yunho/Desktop/project/yunho-harness/tests/test_install.py

**Interfaces**

- Consumes: Task 1의 workspace·브랜치·테스트 승인, 승인 명세의 세 스킬 집합.
- Produces: 세 스킬만 요청·검증·동기화하는 기존 installer API와 RED/GREEN 증거.
- 유지할 기존 인터페이스:
  - REQUIRED_EXTERNAL_FILES: 스킬 이름에서 필수 파일 tuple로의 mapping.
  - external_acquisition_command() -> list[str]
  - _validate_acquisition_records(stdout: str, work: Path) -> None
  - validate_external_skills(home: Path, user_home: Path) -> None
  - external_candidate_paths(home: Path, user_home: Path) -> dict[str, tuple[Path, ...]]
  - external_write_targets(home: Path, user_home: Path) -> dict[str, tuple[Path, ...]]
  - acquire_external_skills(work: Path) -> dict[str, Path]
  - main(argv: list[str] | None = None) -> int
- 새 public API나 브랜치 조작 코드를 추가하지 않는다.

- [ ] **Step 1: 테스트 fixture와 기존 기대값을 세 스킬로 변경한다.**

테스트의 FILES에서 using-git-worktrees를 제거하고 남은 각 필수 파일 tuple은 유지한다.

기존 테스트 이름과 기대값을 다음처럼 바꾼다.

- test_acquisition_uses_exact_four_skill_command → test_acquisition_uses_exact_three_skill_command
- test_install_writes_harness_profiles_and_four_external_skills → test_install_writes_harness_profiles_and_three_external_skills
- test_install_syncs_all_four_on_every_run → test_install_syncs_all_three_on_every_run
- test_dry_run_validates_structure_and_does_not_write의 CLI 문자열에서 using-git-worktrees를 제외한다.

정확한 acquisition command 기대값은 다음과 같다.

    [
        "npx", "--yes", "skills@latest", "add",
        "https://github.com/obra/superpowers",
        "--skill", "brainstorming", "writing-plans", "test-driven-development",
        "--agent", "codex", "--yes", "--copy", "--json",
    ]

성공 설치 테스트에는 Installed three external skills 완료 출력도 포함되는지 확인한다. 역할 동시 실행 계약인 at most four subagents는 유지한다.

- [ ] **Step 2: 제거된 스킬 관련 회귀 테스트 두 개를 작성한다.**

1. ExternalSkillAcquisitionTests.test_acquisition_rejects_unrequested_using_git_worktrees_result: 기존 records() helper로 세 필수 스킬과 제외된 using-git-worktrees 결과를 만들고, _validate_acquisition_records()가 예상 밖 결과라는 InstallerError를 내는지 확인한다. 파일 누락으로 우연히 실패하지 않도록 결과 집합 검증을 대상으로 한다.
2. ExternalSkillPreflightTests.test_install_preserves_existing_using_git_worktrees: 선택 설치 경로와 legacy 경로 양쪽에 using-git-worktrees/SKILL.md 및 sentinel 파일을 만든다. 해당 스킬은 FILES에 다시 넣지 않는다. 설치 전후 tree_state()가 같고 설치 상태 코드가 0이며 external_write_targets() 키에 제외된 스킬이 없는지 확인한다.

기존 test_acquisition_rejects_partial_json과 test_acquired_tree_rejects_missing_required_file 검증은 남은 세 스킬의 누락을 대상으로 유지한다.

- [ ] **Step 3: installer 변경 전에 RED를 확인한다.**

    python3 -B -m unittest discover -s tests -p test_install.py -k test_acquisition_uses_exact_three_skill_command -v
    python3 -B -m unittest discover -s tests -p test_install.py -k test_acquisition_rejects_unrequested_using_git_worktrees_result -v
    python3 -B -m unittest discover -s tests -p test_install.py -k test_install_preserves_existing_using_git_worktrees -v

기존 네 스킬 계약과 새 기대값의 차이 때문에 실패해야 한다. 실제 실패 원인을 기록한다. import·환경 오류는 RED 증거로 인정하지 않는다. 예상과 달리 통과하면 assertion과 테스트 대상을 검토한다.

- [ ] **Step 4: 최소 installer 변경을 수행한다.**

REQUIRED_EXTERNAL_FILES에서 using-git-worktrees 항목을 제거하고 설치 완료 문구의 four를 three로 바꾼다.

fetch 요청, record 검증, candidate·write target 및 sync 경로는 기존 mapping을 계속 사용한다. 별도 목록, 기존 설치본을 지우는 migration, installer의 Git 조작을 추가하지 않는다.

- [ ] **Step 5: focused RED 항목을 다시 실행해 GREEN을 확인한다.**

Step 3의 동일한 세 명령을 다시 실행한다. 각 명령의 정상 종료와 테스트 통과를 기록한다.

- [ ] **Step 6: 전체 기존 unittest suite를 실행한다.**

    python3 -B -m unittest discover -s tests -v

실제 사용자 설치나 네트워크 fetch 대신 기존 fake runner와 mock을 사용한다. 특히 다음 기존 검증이 유지되는지 확인한다.

- test_acquisition_rejects_partial_json
- test_acquisition_rejects_missing_required_file
- test_read_only_options_never_acquire_or_write
- test_check_and_dry_run_reject_missing_candidates_without_writes
- test_external_replace_failure_restores_all_targets
- test_profile_failure_restores_external_targets_too
- test_failed_install_removes_new_external_targets

**완료 기준:** 새 세 스킬 계약, 제외된 기존 설치본 보존, 남은 필수 스킬 검증, 설치 안전성과 rollback이 통과하고 실제 RED/GREEN 증거가 기록되어 있다.

## Task 3: 활성 하네스와 README 변경

**Files**

- Modify: /Users/yunho/Desktop/project/yunho-harness/skill/SKILL.md
- Modify: /Users/yunho/Desktop/project/yunho-harness/README.md

**Interfaces**

- Consumes: 승인 명세 §4–7과 Task 2의 세 스킬 계약.
- Produces: CEO 브랜치 준비·handoff 계약 및 installer와 일치하는 사용자 안내.
- 정책 문서 변경이며 새 실행 API는 없다.

- [ ] **Step 1: Workspace handoff를 브랜치 준비 계약으로 교체한다.**

필요한 승인 완료 시점, workspace·Git 상태 확인, 현재 HEAD에서 브랜치를 생성·전환하는 순서와 성공 확인을 명시한다.

다음 브랜치 prefix와 용도 표를 포함한다.

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

소문자 kebab-case, 공백 금지, Git 이름 유효성, 주된 목적에 따른 prefix 선택과 -2부터 증가하는 충돌 suffix를 명시한다.

Non-Git workspace, 생성·전환 실패·부분 완료·기대 브랜치 불일치의 중단, 기존 변경 보존과 브랜치의 미커밋 변경 격리 한계, 모든 역할에 동일 workspace·브랜치·증거 handoff를 포함한다.

- [ ] **Step 2: README의 외부 스킬 설명을 변경한다.**

외부 스킬 수를 세 개로 바꾸고 목록을 다음과 일치시킨다.

    brainstorming · writing-plans · test-driven-development

설치 경로 표의 외부 스킬 네 개 문구도 세 개로 바꾼다. 나머지 네 개 표현이 agent 동시 실행 수 등 다른 계약에 쓰이면 유지한다.

- [ ] **Step 3: 승인 명세와 활성 문서를 구조적으로 대조한다.**

명세의 성공·충돌·실패·부분 완료·미커밋 변경·handoff 요구사항마다 최종 문구가 있는지 확인한다. README 집합은 Task 2의 mapping과 대조한다. 활성 정책의 worktree 의무가 제거되었는지 확인하며 역사적 문서는 수정하지 않는다.

**완료 기준:** 활성 정책이 승인된 브랜치 계약을 빠짐없이 설명하고 README가 세 스킬 계약과 일치한다.

## Task 4: manifest 갱신과 최종 독립 검증

**Files**

- Modify: /Users/yunho/Desktop/project/yunho-harness/MANIFEST.sha256
- Read/Verify: Task 2–3의 최종 파일 및 승인 명세·계획

**Interfaces**

- Consumes: Task 2–3의 최종 파일 내용 및 기존 manifest 대상 집합·형식.
- Produces: 정확한 checksum과 QA·Reviewer·CEO 수용 증거.
- 기존 manifest 형식인 64자리 SHA-256, 공백 2개, 상대 경로를 유지한다.

- [ ] **Step 1: 최종 파일 내용으로 checksum을 갱신한다.**

현재 manifest의 항목과 형식을 유지하며 파일 raw bytes의 SHA-256을 계산해 install.py, README.md, skill/SKILL.md 변경을 반영한다. skill/models.toml, 역사적 문서 또는 새 대상을 추가하지 않는다. 새 도구·의존성을 도입하지 않는다.

- [ ] **Step 2: manifest 값을 검증한다.**

    shasum -a 256 -c MANIFEST.sha256

모든 대상이 검증되고 명령이 정상 종료해야 한다. diff에서 대상 집합과 형식도 확인한다.

- [ ] **Step 3: 독립 QA가 최종 상태를 검증한다.**

QA에게 workspace·브랜치·승인 artifact·테스트 승인 범위를 전달한다.

    python3 -B -m unittest discover -s tests -v
    shasum -a 256 -c MANIFEST.sha256
    git diff --check

QA는 Review Focus의 다섯 조건과 명세의 정책 구조 기준을 확인한다. 승인 문서·계획을 포함한 변경 목록을 대조하고 범위 밖 변경, 기존 사용자 설치본 변경, commit·push가 없는지 보고한다.

- [ ] **Step 4: QA 이후 독립 Reviewer가 전체 변경을 검토한다.**

Reviewer는 최종 diff와 승인 명세를 비교해 브랜치 계약, 이름 충돌·실패 처리, 세 스킬 집합 일관성, 기존 설치본 보존, 설치 안전성·rollback, manifest와 범위를 검토한다.

- [ ] **Step 5: 발견 사항을 해결하고 CEO가 수용한다.**

수정은 CEO가 Coder에게 전달한다. 관련 변경 후 필요한 QA·Reviewer 증거를 갱신한다. 미충족 기준이나 검증 공백을 완료로 처리하지 않는다.

**완료 기준:** 최종 변경이 명세와 계획에 일치하고 필수 검증 및 독립 검토가 끝나며 발견 사항이 해결되거나 명시적으로 disposition되어 있다.

## 의존성과 가정

    계획 승인 및 테스트 작업 승인
    → Task 1: CEO 브랜치 준비
    → Task 2: installer TDD
    → Task 3: 정책·README
    → Task 4: manifest·QA·Reviewer·수용

- 기본 브랜치 이름은 chore/branch-workspace-policy이며 실제 이름은 충돌 확인 후 정한다.
- 승인 명세와 저장된 계획은 현재 checkout에서 untracked 문서로 보일 수 있다. Task 1에서 실제 상태를 확인·기록하고 보존한다.
- 이전의 clean 상태를 재사용하지 않는다.
- 테스트 작업의 명시적 사용자 승인이 남아 있다. 확보 전 Task 2는 시작하지 않는다.
- 기존 테스트 helper와 installer 인터페이스를 활용하며 무관한 구조 개선은 하지 않는다.

## CEO 자체 검토

- 필수 header, Goal·Architecture·Tech Stack·Spec·Global Constraints·Review Focus와 separator를 포함했다.
- 각 Task에 Files·Interfaces를 두고 단계별로 확인 가능한 결과를 명시했다.
- Review Focus의 다섯 조건을 해당 작업의 검증 단계에 연결했다.
- 기존 테스트 이름, dry-run 기대값, fixture, 완료 출력 변경을 명시했다.
- 회귀 테스트를 implementation 전에 작성하고 실제 RED 후 GREEN으로 진행하도록 순서를 정했다.
- 승인 명세와 이후 저장할 계획이 untracked일 수 있음을 기록하고 과거 clean 증거를 재사용하지 않는다.
- 브랜치 prefix, 숫자 suffix, 기본 이름과 no commit/push 제약을 포함했다.
- 테스트 작업 승인이 해결되지 않은 결정이며 경로·검증 실행 상태에 관한 주장은 하지 않는다.
