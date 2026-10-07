# Harness 실행 전 증거 게이트 구현 계획

**상태:** 사용자 승인 완료
**날짜:** 2026-10-07

> 실행은 기존 Harness 역할에 따라 CEO가 순차 조정한다. Coder가 지정 파일을 편집하고 QA와 Reviewer가 독립 확인한다. 외부 executor 지침은 별도 실행 방식 선택, 작업별 commit, 자동 추가 역할을 만들지 않는다.

**Goal:** 문서 저장과 실행 준비 Git 변경 전에 Harness의 작성 책임·승인 순서·증거 확인을 적용한다.

**Architecture:** 루트 skill은 지침 우선순위와 필수 참조 시점을 연결한다. Planning과 handoff 참조는 문서 저장·대상 선택·Git 변경별 증거와 중단 조건을 정의하고, 기존 정책 텍스트 검사에 회귀 사례를 추가한다. README와 manifest를 변경 사항에 맞추며 runtime 차단기나 별도 기록 서비스를 추가하지 않는다.

**Tech Stack:** Markdown, Python unittest, 기존 policy_text() helper, SHA-256 manifest, Git 상태·diff 확인.

**Spec:** /Users/yunho/Desktop/project/yunho-harness/docs/superpowers/specs/2026-10-07-harness-preaction-gates-design.md

## Global Constraints

- Workspace는 /Users/yunho/Desktop/project/yunho-harness다. 실행 대상은 문서 승인 완료 후 사용자가 명시 선택한다.
- 설계 깊이는 architectural, 검증 위험은 significant/high다.
- Coder만 구현·설정·테스트 파일을 수정한다. CEO는 조정·승인·통합·검증·수락을 맡는다.
- 외부 skills, 설치된 사본, 모델, 권한 설정은 수정하지 않는다.
- agents/yunho-team-planner.toml의 기존 책임 문구는 만족하므로 수정하지 않는다.
- 적용 문서 전체 승인 전 대상 선택 요청, branch 변경, staging, 문서 commit을 하지 않는다.
- 승인 문서 준비 commit과 수락 후 선택적 구현 commit을 구분한다. Push는 포함하지 않는다.
- 기존 staged/unstaged/untracked 변경과 소유권을 보존한다. 자동 stash/reset/clean을 하지 않는다.
- 루트 skill word budget 2788을 유지한다.
- 정적 정책 검사 통과를 실제 agent runtime 준수 증거로 보고하지 않는다.

## Review Focus

1. Spec 저장 전에 written-spec 승인이나 실행 대상 선택을 요구하지 않는다.
2. 대상 선택 요청 전에 문서 완결을 확인하되, 아직 받지 않은 선택 자체를 선행 증거로 요구하지 않는다.
3. 일부 plan 승인만으로 실행 준비·Git 변경·Coder 시작을 허용하지 않는다.
4. 유효한 기존 commit은 재사용하고 무관한 staged 변경은 보존하며 중단한다.
5. 과거 조기 commit을 소급 승인하지 않고 runtime 준수는 실행 근거가 없으면 미검증으로 남긴다.

## CEO 준비와 승인 문서 commit

이 절차는 모든 현재 범위 문서가 개별 승인된 뒤에만 수행한다.

- [ ] 승인된 spec/plan 버전·근거, 전체 문서 목록, 의존 순서와 완결 여부를 기록한다.
- [ ] 실제 workspace/repository/branch 또는 detached HEAD/HEAD/변경 상태와 소유권을 다시 확인한다.
- [ ] 대상 선택 요청 전에 handoff 참조를 읽고 문서 완결 증거를 확인한다.
- [ ] 사용자에게 현재 checkout 또는 검증된 새 task branch를 명시적으로 선택받는다. 새 branch 후보를 제시하면 후보와 기준 HEAD를 알린다.
- [ ] branch 변경이 필요하면 승인 대상과 현재 상태를 재확인하고 결과를 검증한다.
- [ ] 기존 승인 문서 commit을 SHA/message/paths/content로 확인해 재사용한다.
- [ ] 남은 승인 spec/plan만 한 번의 focused docs commit으로 준비한다. Commit 직전에 staged paths/diff와 확정 message를 확인한다.
- [ ] 최종 Git 상태와 canonical handoff 기록을 확인하고 Coder에게 소유 파일·승인 문서를 전달한다.
- [ ] Coder가 brief와 checkout을 독립 검증해 gate를 통과한 뒤 Task 1을 시작한다.

준비 중 증거 누락·불일치·무관한 staged 변경·실패가 생기면 중단하고 CEO가 해결한다. 계획 작성 중에는 branch 변경이나 Git 쓰기를 하지 않는다.

## Task 1: 정책·README·회귀 계약 보완

**Files:** tests/test_install.py, skill/SKILL.md, skill/references/planning.md, skill/references/handoff.md, README.md 수정. agents/yunho-team-planner.toml은 읽기 전용.

**Interfaces:** 기존 policy_text(name: str) -> str, REPO, tomllib, unittest를 사용한다. HarnessPreactionGateTests에 다섯 검사를 추가한다. 기존 ConditionalReferenceTests, RolePolicyTests, handoff 계약을 유지한다. 검사는 문서 구조만 확인하며 live Git 또는 agent runtime을 실행하지 않는다.

**AC:** AC-1–AC-10.

### Step 1: 실패하는 회귀 검사

- [ ] 기존 helper와 subTest 구조를 쓰고 새 helper/framework는 만들지 않는다.
- [ ] 다음 검사를 관련 section/reference에 한정해 구현한다. 서로 다른 단계의 조건을 긴 정규식 하나로 합치지 않는다.
  - test_preaction_role_precedence: Harness 우선순위, Planner 전체 spec 초안/self-review, CEO 통합·저장·검토, CEO 독립 초안 대체 금지, Planner profile 일치.
  - test_preaction_document_save_evidence: spec/plan 저장 전 역할·승인·초안·self-review·절대 경로, spec 저장과 written approval/대상 선택 구분, 증거 누락 시 중단.
  - test_preaction_reference_and_choice_order: planning/handoff 참조 trigger, 문서 완결 전 선택 요청 금지, 요청 전에 선택 증거를 요구하지 않음.
  - test_preaction_git_evidence_and_batch_order: Git 변경 전 승인·선택·repo/branch/HEAD/dirty 상태·보존·소유권, 조기 commit 유예, 일괄 commit, staged 대상과 사후 확인.
  - test_preaction_stop_and_runtime_limits: 누락·불일치·미완료 승인·실패 시 중단, 변경 시 증거 재확인, 소급 승인 금지, 외부 skill 비수정, 구조 검증의 한계.

### Step 2: RED

- [ ] 저장소 루트에서 `python3 -B -m unittest discover -s tests -p test_install.py -k preaction -v` 실행.
- [ ] 기대 결과는 새 계약의 assertion failure다. Import/syntax error는 유효한 RED가 아니므로 먼저 해결한다.

### Step 3: 최소 정책 변경

- [ ] 루트 adapter에 설치된 brainstorming의 역할·저장·조기 commit 지시를 Harness에 맞춰 적용한다고 명시한다.
- [ ] Mandatory reference 표에서 planning의 최초 spec/plan 저장 trigger와 handoff의 대상 선택 요청·첫 Git 변경 trigger를 보완한다.
- [ ] planning 참조에 spec/plan 저장 전 각각의 증거와 중단 조건을 추가하고 기존 승인 순서·조기 commit 유예와 연결한다.
- [ ] CEO는 Planner 전체 초안을 대체해 직접 spec 초안을 쓰지 않고, 실질적인 누락은 Planner에게 보완 요청한다고 명시한다.
- [ ] handoff 참조에서 선택 요청 전 문서 완결 gate와 Git 변경 직전 상태·선택 gate를 나눈다.
- [ ] 기존 commit 재사용·dirty 변경 보존·실패 중단·재개 규칙 및 canonical handoff 기록을 유지한다.
- [ ] README의 참조 표와 짧은 순서를 수정하고 상세 조건은 참조 문서로 연결한다.
- [ ] Planner profile을 수정하지 않고 루트 skill word budget 2788 이내를 유지한다.

### Step 4: GREEN과 기존 계약

- [ ] 신규 회귀를 `python3 -B -m unittest discover -s tests -p test_install.py -k preaction -v`로 재실행한다. 기대 결과는 다섯 test_preaction 검사의 통과다.
- [ ] 기존 계약은 `python3 -B -m unittest discover -s tests -p test_install.py -v`로 확인한다. 특정 test class 필터 대신 파일의 전체 검사를 실행해 참조 trigger, 역할, word budget과 기존 handoff 검사를 함께 확인한다.
- [ ] 기대 결과는 `test_install.py` 전체 통과다. 표현 변경으로 assertion이 깨지면 기존 의미를 보존해 assertion을 조정한다.
- [ ] AC별 정책 section·test method와 RED/GREEN 결과를 CEO에게 보고한다. 이 task 끝에서 manifest 수정이나 Git staging/commit을 하지 않는다.

## Task 2: Manifest 갱신과 전체 검증

**Files:** MANIFEST.sha256 수정. Task 1 최종 변경 전체 확인.

**AC:** AC-1, AC-7–AC-10.

- [ ] Task 1 이후 `shasum -a 256 -c MANIFEST.sha256` 실행. 기대 결과는 변경한 관리 문서의 hash mismatch뿐이다. 다른 불일치는 조사하고 임의 수정하지 않는다.
- [ ] README.md, skill/SKILL.md, skill/references/planning.md, skill/references/handoff.md의 해시만 갱신한다. 경로 목록·순서와 다른 해시를 보존한다. 테스트·spec·plan은 manifest 대상이 아니다.
- [ ] 저장소 루트에서 `python3 -B -m unittest discover -s tests -v`, `shasum -a 256 -c MANIFEST.sha256`, `git diff --check`, `git diff --stat`, `git diff --name-only` 실행.
- [ ] 기대 결과는 전체 unittest 통과, 모든 manifest 항목 OK, 공백 오류 없음, 지정된 구현 파일만 변경됨이다.
- [ ] 사용자 설치, 외부 skill 획득, installed profile 갱신은 실행하지 않는다. 최종 결과와 미검증 경계를 CEO에게 보고한다.

## Task 3: QA → 독립 Reviewer → CEO 수락

**Files:** 승인 spec/plan과 최종 변경 전체.

**AC:** AC-1–AC-10.

- [ ] QA가 승인 문서와 실제 checkout을 대조하고 전체 unittest, manifest, diff 확인을 독립 수행한다.
- [ ] QA는 각 AC에 정책 위치·test method·실행 결과·증거를 연결해 proven/unmet/unverified로 판정한다. 구조 검사만으로 runtime 준수를 proven이라 하지 않는다.
- [ ] QA failure 또는 unmet은 CEO가 Coder에 수정을 배정하고 영향받는 QA 재확인을 받는다.
- [ ] QA 이후 독립 Reviewer가 최종 전체 변경을 검토한다. 역할 예외, 승인 순서, 참조 trigger, staged 보존, commit 재사용, 구조 검사 과장을 확인한다.
- [ ] 수정으로 상태가 달라지면 관련 QA 및 필요한 Reviewer 검토를 갱신한다.
- [ ] CEO가 finding과 증거 공백을 해결 또는 명시 처분하고 AC별 근거와 미검증을 기록해 수락한다.
- [ ] 구현 commit은 수락 후 선택적으로 진행한다. staged diff가 수락 범위만 포함하는지 확인하며 push는 별도 명시 요청을 요구한다.

## 자체 검토와 한계

- AC-1–AC-10을 구현 task와 최종 QA/Reviewer에 연결했다.
- spec 저장·선택 요청 시점의 순환 조건을 피하고 승인 단계를 구분했다.
- 현재 Planner profile은 기존 책임 계약을 만족한다. manifest 관리 대상은 네 문서이며 tests/spec/plan은 제외된다.
- 정적 검사는 문서 계약만 입증한다. runtime 순서 준수는 실행 기록이 없으면 미검증이다.
- 실행 준비 시 branch·HEAD·dirty 상태를 최신 기준으로 다시 확인한다.
- push, 설치, 외부 skill 변경은 계획에 포함하지 않는다.
