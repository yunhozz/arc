# 계획 task 수락 후 CEO 자동 커밋 구현 계획

> **에이전트 작업 지침:** ARC adapter에 따라 CEO가 순차 조율한다. Coder는 승인된 구현·정책·설정·테스트 파일만 편집한다. QA는 독립 검증하고 Reviewer는 QA 이후 최종 전체 변경을 독립 검토한다. CEO가 task를 수락하고 커밋한다. 하위 체크박스는 진행 기록이며 커밋 단위가 아니다. written-plan 승인과 기존 실행 준비·인계 게이트를 완료하기 전에는 Coder를 시작하지 않는다.

**목표:** 승인된 plan의 최상위 task가 수락되면 CEO가 추가 사용자 커밋 승인 없이 focused 로컬 Git 커밋을 진행하도록 ARC 계약을 변경한다.

**구조:** 핵심 정책·계획 참조·검증 참조·인계 참조·Planner 프로필·README·구조 회귀 테스트·manifest를 하나의 최상위 task에서 일관되게 변경한다. 이번 Significant 변경에서는 독립 QA와 최종 전체 Reviewer를 task 수락의 선행 조건으로 지정한다. 해당 확인이 완료되면 CEO가 task를 수락·커밋하고 전체 plan의 최종 수락도 완료한다.

**기술:** Python 3.11 이상, unittest, TOML, Markdown 정책, SHA-256 manifest, Git.

**승인 명세:** /Users/yunho/Desktop/project/arc/docs/superpowers/specs/2026-10-12-plan-task-auto-commit-design.md

**CEO 저장 예정 경로:** /Users/yunho/Desktop/project/arc/docs/superpowers/plans/2026-10-12-plan-task-auto-commit.md

## 공통 제약

- 설계 깊이는 Architectural, 검증 위험은 Significant다.
- 최상위 task 하나가 구현 커밋 하나의 단위다.
- 분리 검증이 불가능한 변경은 처음부터 하나의 최상위 task로 구성한다.
- CEO는 수락 기준·필수 검사·findings를 확인하고 수락한 뒤 추가 사용자 커밋 승인을 요청하지 않는다.
- Coder는 커밋하지 않는다. 구현·설정·테스트 코드 편집은 Coder가 담당한다.
- 하위 체크박스, Coder 완료 보고, 검사 통과만으로 acceptance를 처리하지 않는다.
- task 수락과 전체 plan 최종 QA·Reviewer·통합 수락을 구분한다.
- task 경계만으로 QA·Reviewer 호출을 추가하지 않는다. 기존 위험·의존 검증과 승인된 의무는 유지한다.
- 변경 없는 task는 빈 커밋을 만들지 않는다. 재개 시 확인된 동일 task 커밋을 중복 생성하지 않는다.
- planning-document batch pre-Coder commit과 명시적 실행 대상 선택·인계 게이트를 유지한다.
- 로컬 커밋만 이 자동 진행 계약에 포함한다. push·merge·publish·deploy·install은 기존 별도 지침·승인을 따른다.
- historical spec/plan, 외부 skills, 모델 설정, 설치기 구현은 변경하지 않는다.
- runtime 인프라를 추가하지 않는다. 구조 검사는 실제 agent runtime 준수를 입증하지 않는다.
- 명령은 CEO가 인계하고 Coder가 확인한 실제 절대 실행 workspace에서 수행한다. 아래 상대 경로는 그 workspace 내부 경로다.

## 검토 중점

다음 다섯 조건을 작업 1의 구조 회귀 검사로 고정한다.

1. 구현 보고·하위 체크박스·검사 통과를 task acceptance로 오인하지 않아야 한다.
2. 전체 plan 검증이 뒤에 있다는 이유로 독립 수락 가능한 task 커밋을 자동 보류하지 않아야 한다. plan이 해당 검토를 task 선행 조건으로 지정한 경우에는 기다려야 한다.
3. 다른 task·사용자의 변경이 같은 파일이나 index에 섞이면 범위 확인 없이 커밋하지 않아야 한다.
4. Git 실패 뒤 실제 커밋이 생성되었거나 기록만 누락된 경우에는 재시도로 중복 커밋하지 않아야 한다.
5. task 자동 커밋 권한을 planning-document 조기 커밋이나 push·merge·publish·deploy·install 권한으로 확대하지 않아야 한다.

---

## task 분해와 의존 순서

**최상위 task는 작업 1 하나다.**

정책 본문, Planner 작성 계약, 검증·재개 계약, 구조 검사, 사용자 안내와 manifest가 동일 행동 계약을 구성한다. 어느 한 부분만 독립 수락하면 구 계약과 새 계약이 공존하거나 배포 무결성이 깨진다. 따라서 독립 커밋 가능한 별도 산출물로 분리하지 않는다.

순서는 다음과 같다.

승인·실행 준비 완료 → Coder RED → 최소 정책 변경 → GREEN → manifest·전체 확인 → 독립 QA → 최종 전체 Reviewer → CEO task 수락 → CEO task 커밋 → 전체 plan 최종 수락·완료 기록

QA와 Reviewer는 이번 작업의 위험도에 따른 필수 조건이며, task 경계 때문에 추가한 게이트가 아니다.

## 실행 준비 게이트 — CEO와 Coder

이 부분은 구현 task에 앞선 기존 준비 절차다.

- [ ] **CEO:** 승인된 spec 버전과 이 plan의 저장·자체 검토 근거를 정본에 연결하고 written-plan 승인을 확보한다.
- [ ] **CEO:** 현재 범위의 적용 문서 집합이 완결되고 개별 승인되었는지 확인한다.
- [ ] **CEO:** 그 뒤 기존 규칙에 따라 명시적 실행 대상 선택을 받고 branch/worktree 준비와 최신 Git·보존·소유권 확인을 수행한다.
- [ ] **CEO:** 선택한 대상에서 기존 유효 문서 커밋을 재사용하고, 남은 승인 spec/plan을 한 번의 문서 커밋으로 준비한다.
- [ ] **CEO:** 문서 커밋 SHA·실제 메시지·경로·승인 bytes와 최종 Git 상태를 기록한 뒤 Coder에게 인계한다.
- [ ] **Coder:** 설치된 references/handoff.md를 읽고 승인·문서·실제 workspace·branch·HEAD·변경 상태·소유권을 독립 확인한다. 불일치하면 편집 전에 CEO에게 보고한다.

현재 실행 대상 선택은 없다. 계획 작성·승인 중 branch/worktree 선택이나 준비 Git 변경을 진행하지 않는다. 별도의 외부 executor 실행 방식 선택은 요구하지 않는다.

## 작업 1: 계획 task 자동 커밋 공유 계약 전환

**task ID:** TASK-01

**독립 산출물:** 승인 spec AC-01~AC-12를 일관되게 표현하는 배포 가능한 ARC 정책 묶음과 구조 회귀 검사.

**파일 — Coder 편집 소유**

- 수정: skill/SKILL.md
- 수정: skill/references/planning.md
- 수정: skill/references/verification.md
- 수정: skill/references/handoff.md
- 수정: agents/arc-planner.toml
- 수정: README.md
- 수정: tests/test_install.py
- 수정: MANIFEST.sha256

**인터페이스**

- 입력: 승인된 spec, 승인된 이 plan, CEO의 실제 workspace·소유권·승인 문서 커밋 근거.
- 유지: policy_text(name: str) -> str, 기존 REFERENCE_NAMES, 기존 다섯 역할·프로필·manifest 대상 집합.
- 추가: tests/test_install.py의 TaskCommitPolicyTests(unittest.TestCase).
- 출력: task 수락·자동 커밋, 계획 작성, 보류·재개와 최종 검증 경계를 규정하는 일관된 정책.
- runtime API나 설치기 함수는 추가하지 않는다.

**task 수락 선행 조건**

AC-01~AC-12의 구조적 계약 근거, focused/full unittest, installer preflight, manifest·diff 검사, 독립 QA와 QA 이후 최종 전체 Reviewer가 완료되어야 한다. findings와 증거 공백은 기존 정책에 따라 해결 또는 명시적으로 처리한다. 미충족 기준과 필수 검사 실패를 커밋을 위해 면제하지 않는다.

### 1.1 Coder: 실패할 구조 회귀 검사 추가

- [ ] TaskCommitPolicyTests를 기존 policy_text()와 TOML 읽기 방식으로 추가한다.

다음 테스트 이름과 assertion 범위를 사용한다. 정책 전체를 한 개의 넓은 regex로 검사하지 말고 관련 절·단락에서 전제·순서·예외를 연결해 확인한다.

| 테스트 이름 | 필수 assertion |
|---|---|
| test_ceo_commits_accepted_top_level_task_without_user_approval | 승인 plan의 최상위 task가 커밋 단위이고, CEO의 기준·필수 checks·findings 확인 → acceptance → 즉시 로컬 커밋 순서가 있으며 추가 사용자 커밋 승인을 요구하지 않는다. 기존 “optionally create”가 해당 활성 계약에 남지 않는다. |
| test_planner_groups_inseparable_changes_and_defines_task_gates | planning 참조와 Planner 프로필에 task ID·범위·의존성·수락 기준·필수 검사·보류 조건이 있다. 분리 검증 불가능한 변경을 하나의 최상위 task로 구성한다. |
| test_substeps_and_reports_do_not_replace_acceptance | 하위 체크박스·Coder 보고·검사 통과가 task acceptance나 개별 커밋 단위가 되지 않는다. |
| test_task_and_final_plan_verification_remain_distinct | task-local acceptance와 최종 plan 수락을 구분한다. task 경계만으로 QA/Reviewer를 추가하지 않는다. 독립 수락 task는 후속 최종 검증 때문에 자동 지연되지 않으며, plan이 검토를 task 선행 조건으로 지정한 경우는 보류한다. QA 이후 필수 final whole-change review를 유지한다. |
| test_commit_blocks_on_scope_checks_findings_and_git_state | 미해결 기준·필수 검사·finding, scope expansion, staged 범위·소유권·workspace/branch/HEAD 불일치, 실패·부분 완료가 보류와 사유 기록으로 이어진다. |
| test_commit_evidence_no_change_and_resume_are_explicit | staged 경로·내용·메시지의 사전 확인과 SHA·실제 메시지·포함 내용·사후 Git 상태 기록을 요구한다. no-change는 빈 커밋을 생략하고 기존 task 커밋을 검증·재사용하여 중복을 막는다. |
| test_final_findings_use_followup_task_without_rewriting_commit | 이미 커밋한 변경의 최종 finding은 CEO가 후속 task·필요 승인·수정·재확인으로 처리한다. 자동 amend/reset이나 원 task 중복 커밋을 하지 않는다. |
| test_document_batch_and_external_action_boundaries_remain | 기존 pre-Coder 문서 일괄 커밋·승인·명시적 대상 선택 순서를 보존한다. 조기 문서 커밋을 허용하지 않는다. 로컬 커밋 권한과 외부 행동 승인, 한국어 Conventional Commits, runtime 입증 한계가 README와 정책에 일치한다. |

첫 테스트의 핵심 assertion은 다음처럼 명시한다.

    core = policy_text("core")
    self.assertRegex(core, r"ceo.*accept.*task.*commit")
    self.assertRegex(core, r"without.*(?:additional|separate).*user.*commit.*approval")
    self.assertRegex(core, r"top.level task.*commit")

이 assertion만으로 전체 계약을 입증하지 않는다. 위 표의 기준·순서·예외 검사를 함께 추가한다. 테스트 문구에 맞추기 위해 의미를 약화하지 않는다.

### 1.2 Coder: RED 확인

- [ ] 정책을 변경하기 전에 다음 명령을 실행한다.

    PYTHONPATH=tests python3 -B -m unittest test_install.TaskCommitPolicyTests -v

**기대 결과:** 비영 종료와 assertion failure. 현재 정책의 선택적 커밋에는 추가 사용자 승인 없는 최상위 task 자동 커밋·Planner task 구성·새 수락 경계가 없으므로 관련 새 검사가 실패해야 한다.

ImportError·문법 오류·잘못된 파일 경로는 RED 근거로 인정하지 않는다. 테스트가 현 정책에서 통과하면 누락된 새 계약을 드러내도록 assertion을 보완하고 다시 실행한다. 실제 실패 테스트·assertion·명령 결과를 CEO에게 전달한다.

### 1.3 Coder: 핵심 CEO 커밋 계약 변경

- [ ] skill/SKILL.md의 Optional commit after acceptance를 Automatic commit after plan-task acceptance 계약으로 바꾼다.

다음을 같은 계약에 포함한다.

- 최상위 task 한 개에 focused 구현 커밋 한 개
- CEO 자체 수락 판단과 추가 사용자 커밋 승인 없는 즉시 실행
- task 수락 전 기준·필수 checks·findings 확인
- 하위 체크박스·보고·검사 통과만으로 acceptance 금지
- staged 내용·Git 상태·소유권 확인과 전후 근거 기록
- 보류, no-change, 기존 커밋 검증·재사용
- task 커밋과 전체 plan 최종 검증의 구분
- 기존 문서 준비·외부 행동 승인·한국어 커밋 형식 보존
- plan 생략 가능 경로에 새 plan 의무를 추가하지 않음

기존 CEO 편집 소유권·위험별 흐름·역할 보고 구조는 보존한다.

### 1.4 Coder: Planner 계획 작성 계약 반영

- [ ] skill/references/planning.md에 최상위 task 구성·수락·검증·커밋 처리 요구를 추가한다.
- [ ] agents/arc-planner.toml에 그 내용을 완전한 plan 초안에 포함하는 Planner 책임을 반영한다.

각 task의 ID·범위·의존성·수락 기준·필수 검사·보류 조건을 요구한다. 분리 검증 불가능한 변경은 한 task로 작성하고 하위 체크박스는 커밋 단위가 아니라고 명시한다. Planner의 read-only·승인 요청 금지·CEO 보고 계약은 유지한다.

### 1.5 Coder: 검증·재개 계약 연결

- [ ] skill/references/verification.md에 task-local acceptance와 전체 plan 최종 검증·수락의 경계를 반영한다.
- [ ] skill/references/handoff.md에 정상 task 커밋 후 재개의 유효한 최초 선택 재사용과 최신 상태 재확인을 필요한 범위에서 연결한다.

후속 최종 검증만 예정되어 있다는 이유로 독립 task 커밋을 자동 지연하지 않는다. 특정 task의 수락 선행 조건으로 지정한 검사는 기다린다. 필수 QA·final whole-change review·finding 처리·미검증 표시를 보존한다.

문서 준비 순서나 실행 대상 선택 수명을 새롭게 바꾸지 않는다.

### 1.6 Coder: README 안내 연결

- [ ] README.md에 최상위 task → CEO 기준 확인·수락 → 추가 사용자 승인 없는 로컬 커밋 흐름을 설명한다.

하위 체크박스·보고만으로 완료하지 않는 점, 보류·no-change·재개 처리, 최종 QA/Reviewer와의 구분, 문서 준비 순서·외부 행동 승인 경계를 포함한다. 역사적 문서는 편집하지 않는다.

### 1.7 Coder: GREEN과 기존 계약 확인

- [ ] 새 검사와 영향받은 기존 정책 검사를 실행한다.

    PYTHONPATH=tests python3 -B -m unittest test_install.TaskCommitPolicyTests test_install.ConditionalReferenceTests test_install.ARCPreactionGateTests test_install.RolePolicyTests -v

**기대 결과:** 모든 검사 통과. 새 동작과 기존 역할·TDD·승인 문서 준비·실행 대상·재개·finding 계약이 공존한다.

실패하면 승인된 범위 안에서 최소 수정한다. 수락·승인·검증 보호를 삭제하여 통과시키지 않는다.

### 1.8 Coder: manifest 갱신

- [ ] MANIFEST.sha256의 기존 경로 목록·순서를 유지하고 실제 변경된 대상 파일의 SHA-256을 갱신한다.

대상은 변경된 README.md, agents/arc-planner.toml, skill/SKILL.md, skill/references/planning.md, skill/references/verification.md, skill/references/handoff.md다. 수정하지 않은 항목은 보존한다. 기존 manifest 대상 집합에 없는 test/spec/plan을 새로 추가하지 않는다.

### 1.9 Coder: 전체·배포 무결성 확인

- [ ] 전체 unittest를 실행한다.

    python3 -B -m unittest discover -s tests -p 'test_*.py' -v

**기대 결과:** 전부 통과. 새 테스트 때문에 총 개수가 증가할 수 있으므로 역사적 개수를 고정하지 않는다.

- [ ] 설치기 preflight를 실행한다.

    python3 -B install.py --check

**기대 결과:** 종료 코드 0과 Installer payload preflight passed. 실제 사용자 Codex 홈 설치는 수행하지 않는다.

- [ ] manifest를 확인한다.

    shasum -a 256 -c MANIFEST.sha256

**기대 결과:** 기존 대상 전부 OK.

- [ ] diff 형식·범위를 확인한다.

    git diff --check
    git diff --stat
    git diff --name-only

**기대 결과:** whitespace 오류 없음, 변경 파일이 TASK-01 소유 범위와 일치함.

- [ ] Coder가 CEO에게 변경 파일·RED/GREEN·전체 검사·preflight·manifest 결과·미해결 사항·구조 검사 한계를 보고한다. Coder는 stage/commit하지 않는다.

### 1.10 QA: 독립 수락 기준 검증

- [ ] CEO가 QA에 승인 spec AC-01~AC-12, 최종 Coder diff, RED/GREEN 근거와 실제 workspace를 전달한다.
- [ ] QA가 focused 정책 검사와 installer preflight·manifest·diff 확인을 독립 실행한다. 전체 unittest의 근거는 최신 상태·범위·흐름 요건을 확인하고 필요하면 독립 재실행한다.
- [ ] QA가 AC별 방법·범위·실행 결과·근거·기준 판단과 미검증 범위를 보고한다.

검사 통과와 기준 입증을 구분한다. 실제 agent runtime 준수는 실행 기록 없이는 미검증으로 남긴다.

실행 실패·기준 불충족은 CEO → Coder 수정 → QA 재확인 순서로 처리한다. 해결되지 않은 실패를 Reviewer로 넘겨 대체 검증하지 않는다.

### 1.11 Reviewer: 최종 전체 변경 검토

- [ ] QA 결과가 정리된 뒤 CEO가 독립 Reviewer에게 전체 TASK-01 diff와 승인 spec·plan·QA 근거를 전달한다.
- [ ] Reviewer가 AC-01~AC-12, 커밋 권한 경계, task/최종 수락 구분, 분리 불가능 task 구성, 실패·재개·후속 task 처리, 기존 문서 준비 순서, 역사적 문서 보존과 manifest 정합성을 검토한다.

Reviewer는 테스트를 실행하거나 파일을 편집하지 않는다. finding 수정 시 CEO가 Coder와 QA 재확인을 조율하고 최종 관련 상태에 필요한 전체 검토를 확보한다.

### 1.12 CEO: TASK-01 수락과 자동 커밋

- [ ] CEO가 TASK-01의 AC 근거, 필수 검사, QA·최종 Reviewer와 findings 처리를 확인하고 자체 판단으로 수락한다.
- [ ] CEO가 추가 사용자 커밋 승인 요청 없이 최신 실제 workspace·branch·HEAD·상태·소유권·커밋 범위를 확인한다.
- [ ] CEO가 다음 TASK-01 파일만 stage하고 staged 경로·내용을 확인한다.

    git add skill/SKILL.md skill/references/planning.md skill/references/verification.md skill/references/handoff.md agents/arc-planner.toml README.md tests/test_install.py MANIFEST.sha256
    git diff --cached --name-only
    git diff --cached
    git diff --cached --check

예상 밖 staged 변경이나 상태 불일치가 있으면 커밋을 보류한다. 자동 unstage/stash/reset/clean으로 해결하지 않는다.

- [ ] CEO가 확정한 한국어 Conventional Commit 메시지로 커밋한다.

**제안 메시지:**

    feat(workflow): 계획 task 수락 후 CEO 자동 커밋 적용

- [ ] CEO가 SHA·실제 메시지·포함 경로·내용·post-commit HEAD·branch·남은 상태를 확인한다.

    git log -1 --format=fuller
    git show --stat --oneline HEAD
    git status --short --branch

변경 없음이면 빈 커밋을 생략한다. 재개라면 실제 동일 task 커밋을 검증·재사용하고 중복 생성하지 않는다. 실패·부분 완료 시 실제 결과부터 조사하고 이유를 기록한다.

### 1.13 CEO: 전체 plan 최종 수락 기록

- [ ] CEO가 이미 완료한 QA·final Reviewer·통합 근거를 전체 plan 기준에 연결한다.
- [ ] TASK-01 수락과 커밋 결과, planning-document 준비 커밋과의 구분, 남은 미검증 runtime 범위를 정본에 기록한다.
- [ ] 전체 plan 최종 수락·완료를 보고한다.

하나의 task와 전체 plan의 검증 범위가 같으므로 유효한 같은 근거를 연결해 사용할 수 있다. 커밋 후 새로운 변경·실패가 없다면 검사나 Reviewer를 형식적으로 반복하지 않는다.

## 명세 수용 기준 연결

| 기준 | 구현·확인 단계 |
|---|---|
| AC-01, AC-04 | 1.1 task 구성 검사, 1.3~1.4 정책·Planner 계약 |
| AC-02, AC-03 | 1.1 수락·승인·하위 단계 검사, 1.3 핵심 계약, 1.12 CEO 실행 |
| AC-05, AC-06 | 1.1 검증 경계 검사, 1.5 검증 계약, 1.10~1.13 실제 단계 |
| AC-07 | 1.1 보류 검사, 1.3·1.5 정책, 1.12 상태 확인 |
| AC-08, AC-09 | 1.1 근거·재개 검사, 1.3·1.5 기록 계약, 1.12 사후 확인 |
| AC-10 | 기존 준비 게이트, 1.1 기존 경계 검사, 1.5 인계 정합성 |
| AC-11 | 1.1 권한·메시지 검사, 1.3·1.6 안내, 1.12 커밋 |
| AC-12 | 1.6 역사적 문서 보존, 1.9 범위 확인, 1.10~1.13 입증 한계 |

## 가정·열린 결정·workspace 상태

- 승인 spec 버전은 위 절대 경로의 CEO 통합본이다. 초안의 최종 검증 구분 문장을 포함한 실제 승인 파일을 읽었다.
- 이 변경에는 별도 독립 수락 가능한 구현 산출물이 없어 최상위 task 하나를 사용한다.
- 해결되지 않은 중대한 설계 결정은 없다.
- CEO 제공 최신 관측은 master, HEAD 1611ea90d623821d7a635a65d6da12953d9280c5, 승인되었지만 uncommitted인 새 spec 외 clean 상태다. 이 계획 작성에서 Git 상태를 재확인하지 않았으며 실행 준비 때 확인해야 한다.
- 승인 spec·필수 skills·참조·저장소 파일은 접근 가능했다. 현재 추가 workspace/path 문제는 없다.
- 계획 저장·승인 전이며 실행 대상 선택도 없다. 필요한 문서 집합 완결 뒤 기존 준비 절차를 진행한다.

## Planner 자체 검토

- **명세 coverage:** AC-01~AC-12와 spec의 실패·후속 task·권한·문서 준비 경계를 작업 1에 연결했다.
- **task 크기:** 일관된 공유 정책 묶음 하나를 독립 산출물로 구성했다. 테스트·README·manifest를 별도 task로 나눠 불완전한 중간 커밋을 만들지 않았다.
- **단계 명확성:** RED 명령·기대 assertion failure, GREEN·전체·preflight·manifest 검사와 담당 역할을 명시했다.
- **검증 경계:** 이번 QA·final Reviewer는 TASK-01 수락 선행 조건이다. 일반적으로 모든 task에 검토 게이트를 추가하는 규칙으로 확대하지 않았다.
- **커밋 소유권:** 구현 커밋은 CEO가 수락 뒤 실행한다. Coder 커밋 지시와 외부 executor 선택 프롬프트를 포함하지 않았다.
- **준비 순서:** written-plan 승인, 문서 집합 완결, 명시적 실행 대상 선택, 문서 일괄 커밋과 Coder 인계를 별도로 유지했다.
- **한계:** 작성 단계에서 테스트를 실행하지 않았다. RED·GREEN·runtime 준수를 확인했다고 주장하지 않는다.
- **다음 행동:** CEO가 이 초안을 통합·저장·자체 검토하고 written-plan 승인을 확보해야 한다.

## CEO 통합·자체 검토

- 승인 spec의 AC-01~AC-12가 모두 작업 1, 회귀 검사, QA/Reviewer 흐름 및 최종 기록 단계에 연결되어 있다.
- 이 변경의 산출물은 shared policy contract를 함께 정의하므로 단일 최상위 task가 적절하다. 그 안의 하위 단계는 별도 커밋 단위가 아니다.
- Coder 편집과 CEO acceptance/commit 소유권이 구분되어 있고, 필요한 RED/GREEN·전체 unittest·installer preflight·manifest·diff 검사 명령과 기대 결과가 있다.
- Significant 작업의 QA 이후 최종 전체 Reviewer를 task acceptance 전에 배치했다. 이 선택은 작업 경계만으로 게이트를 늘린 것이 아니라 이번 계약 변경의 위험도에 따른다.
- 계획 문서 일괄 준비·실행 대상 명시 선택·Coder handoff 순서와 외부 push/merge 등의 기존 경계를 보존했다.
- 승인되지 않은 범위, historical 문서 수정, 외부 skill 변경, installer/runtime 기능 추가를 계획에서 제외했다.
- 다음 게이트는 사용자의 written-plan 승인이다. 아직 실행 대상 선택·branch 변경·staging·commit·Coder 편집·검사는 진행하지 않았다.
