# Harness 실행 전 증거 게이트 구현 계획

**상태:** 수정본 사용자 plan 승인 대기
**날짜:** 2026-10-07

> 실행은 Harness adapter에 따라 CEO가 순차 조정한다. Coder가 지정 파일을 편집하고, QA와 Reviewer는 위험에 맞는 독립 확인을 맡는다. 외부 executor 지침은 별도 실행 방식이나 추가 역할을 요구하지 않는다.

**Goal:** 문서 저장과 실행 준비 Git 변경 전에 Harness의 작성 책임·승인 순서·증거 확인을 적용하고, 기존 깊이 판단으로 필요한 Bounded written spec에도 같은 저장·승인 게이트를 적용한다.

**Architecture:** 루트 skill은 지침 우선순위와 필수 참조 시점을 연결한다. Planning과 handoff 참조는 문서 저장·대상 선택·Git 변경별 증거와 중단 조건을 정의하고, 기존 정책 텍스트 검사에 회귀 사례를 추가한다. Bounded spec의 필요성은 기존 CEO 깊이 판단을 따르며 README와 manifest를 변경 사항에 맞춘다. Runtime 차단기나 별도 기록 서비스를 추가하지 않는다.

**Tech Stack:** Markdown, Python unittest, 기존 `policy_text()` helper, SHA-256 manifest, Git 상태·diff 확인.

**Spec:** `/Users/yunho/Desktop/project/yunho-harness/docs/superpowers/specs/2026-10-07-harness-preaction-gates-design.md`

## Global Constraints

- Workspace는 `/Users/yunho/Desktop/project/yunho-harness`다. 실행 대상은 문서 승인 완료 후 사용자가 명시 선택한다.
- 이 변경의 설계 깊이는 Architectural, 검증 위험은 significant/high다.
- Architectural은 전체 Planner spec 초안·자체 검토, CEO 통합·저장·자체 검토, written-spec 승인 경로를 유지한다.
- Bounded는 보통 승인된 짧은 설계로 진행한다. 기존 CEO 깊이 판단이 written spec을 요구할 때만 required Bounded spec에 같은 저장 증거·작성 책임·개별 승인 게이트를 적용한다.
- Required Bounded written spec은 승인된 짧은 설계와 구별된다. 짧은 설계의 파일 저장이나 승인은 required spec의 작성·자체 검토·개별 승인을 대신하지 않는다.
- Spike, Bounded plan-skip, non-behavior docs/config 경로에 새 spec 의무를 추가하지 않는다. Plan이 필요하다는 사실만으로 Bounded spec을 요구하지 않는다.
- Coder만 구현·설정·테스트 파일을 수정한다. CEO는 조정·승인·통합·검증·수락을 맡는다.
- 외부 skills, 설치된 사본, 모델, 권한 설정은 수정하지 않는다.
- `agents/yunho-team-planner.toml`의 기존 책임 문구는 만족하므로 수정하지 않는다.
- 적용 문서 전체 승인 전 대상 선택 요청, branch 변경, staging, 문서 commit을 하지 않는다.
- 승인 문서 준비 commit과 수락 후 선택적 구현 commit을 구분한다. Push는 포함하지 않는다.
- 기존 staged/unstaged/untracked 변경과 소유권을 보존한다. 자동 stash/reset/clean을 하지 않는다.
- 루트 skill word budget `2788`을 유지한다.
- 정적 정책 검사 통과를 실제 agent runtime 준수 증거로 보고하지 않는다.

## Review Focus

1. Architectural 및 required Bounded spec 저장 전에 그 spec의 written approval이나 실행 대상 선택을 요구하지 않는다. Required Bounded spec은 짧은 설계와 구분하며 spec이 불필요한 경로에 문서를 강제하지 않는다.
2. 대상 선택 요청 전에 문서 완결을 확인하되, 아직 받지 않은 선택 자체를 선행 증거로 요구하지 않는다.
3. Required written-spec 승인은 종속 plan 작성·실행 준비 전에 완료한다. 일부 plan 승인만으로 실행 준비·Git 변경·Coder 시작을 허용하지 않는다.
4. 유효한 기존 commit은 재사용하고 무관한 staged 변경은 보존하며 중단한다.
5. 과거 조기 commit을 소급 승인하지 않고 runtime 준수는 실행 근거가 없으면 미검증으로 남긴다.

## CEO 준비와 승인 문서 commit

이 절차는 수정된 plan을 포함하여 모든 현재 범위 문서가 개별 승인된 뒤에만 수행한다.

- [ ] 승인된 spec/plan 버전·근거, 전체 문서 목록, 의존 순서와 완결 여부를 기록한다.
- [ ] 실제 workspace/repository/branch 또는 detached HEAD/HEAD/변경 상태와 소유권을 다시 확인한다.
- [ ] 대상 선택 요청 전에 handoff 참조를 읽고 문서 완결 증거를 확인한다.
- [ ] 사용자에게 현재 checkout 또는 검증된 새 task branch를 명시적으로 선택받거나 현행 계약에 따른 유효한 선택 재사용을 확인한다. 새 branch 후보를 제시하면 후보와 기준 HEAD를 알린다.
- [ ] Branch 변경이 필요하면 승인 대상과 현재 상태를 재확인하고 결과를 검증한다.
- [ ] 기존 승인 문서 commit을 SHA/message/paths/content로 확인해 재사용한다. 변경된 문서 버전은 이전 commit·승인과 구분한다.
- [ ] 남은 승인 spec/plan만 한 번의 focused docs commit으로 준비한다. Commit 직전에 staged paths/diff와 확정 message를 확인한다.
- [ ] 최종 Git 상태와 canonical handoff 기록을 확인하고 Coder에게 소유 파일·승인 문서를 전달한다.
- [ ] Coder가 brief와 checkout을 독립 검증해 gate를 통과한 뒤 Task 1을 시작한다.

준비 중 증거 누락·불일치·무관한 staged 변경·실패가 생기면 중단하고 CEO가 해결한다. 계획 작성 중에는 branch 변경이나 Git 쓰기를 하지 않는다. 이미 수행된 준비가 있다면 실제 기록을 확인하고 유효한 증거만 재사용한다.

## Task 1: 정책·README·회귀 계약 보완

**Files:**

- `/Users/yunho/Desktop/project/yunho-harness/tests/test_install.py`
- `/Users/yunho/Desktop/project/yunho-harness/skill/SKILL.md`
- `/Users/yunho/Desktop/project/yunho-harness/skill/references/planning.md`
- `/Users/yunho/Desktop/project/yunho-harness/skill/references/handoff.md`
- `/Users/yunho/Desktop/project/yunho-harness/README.md`
- 읽기 전용: `/Users/yunho/Desktop/project/yunho-harness/agents/yunho-team-planner.toml`

**Interfaces:** 기존 `policy_text(name: str) -> str`, `REPO`, `tomllib`, `unittest`를 사용한다. `HarnessPreactionGateTests`의 기존 다섯 검사 이름을 유지하여 필요한 assertion을 추가·확장한다. 기존 `ConditionalReferenceTests`, `RolePolicyTests`, handoff 계약을 유지한다. 검사는 문서 구조만 확인하며 live Git 또는 agent runtime을 실행하지 않는다.

**AC:** AC-1–AC-10.

### Step 1: 실패하는 회귀 검사

- [ ] 기존 helper와 `subTest` 구조를 쓰고 새 helper/framework는 만들지 않는다.
- [ ] 다음 다섯 검사를 관련 section/reference에 한정해 구현·확장한다. 서로 다른 단계의 조건을 긴 정규식 하나로 합치지 않는다.

| 검사 | 확인할 계약 |
|---|---|
| `test_preaction_role_precedence` | Harness 우선순위, Architectural과 required Bounded spec의 완전한 Planner 초안/self-review, CEO 통합·저장·검토·개별 승인 조율, CEO 독립 초안 대체 금지, 기존 Planner profile 일치 |
| `test_preaction_document_save_evidence` | 아래 경로별 subcase와 spec/plan 저장 증거, 승인 순서, 누락 시 중단 |
| `test_preaction_reference_and_choice_order` | Planning/handoff 참조 trigger, 적용 문서 완결 전 선택 요청 금지, 요청 전에 선택 증거를 요구하지 않음 |
| `test_preaction_git_evidence_and_batch_order` | Git 변경 전 승인·선택·repo/branch/HEAD/dirty 상태·보존·소유권, required spec에 대한 조기 commit 유예, 적용 문서 일괄 commit, staged 대상과 사후 확인 |
| `test_preaction_stop_and_runtime_limits` | 누락·불일치·미완료 승인·실패 시 중단, 변경 시 증거 재확인, 소급 승인 금지, 외부 skill 비수정, 구조 검증의 한계 |

- [ ] `test_preaction_document_save_evidence` 안에 다음 `subTest` 경로를 둔다.

| Subcase | Assertion 범위 |
|---|---|
| `architectural` | 전체 spec 경로와 승인된 설계·Planner 완전 초안/self-review·CEO 책임·절대 저장 경로를 유지한다. |
| `bounded_required_spec` | Spec 저장 게이트의 적용 조건이 기존 CEO 깊이 판단에 따른 written spec 필요성임을 확인한다. 승인된 짧은 설계, 판단 근거·범위, 비례하는 완전한 Planner 초안/self-review, CEO 통합·저장·검토, 개별 written-spec 승인을 확인한다. |
| `short_design_distinction` | 짧은 설계의 저장·승인이 required written spec의 작성·자체 검토·개별 승인을 대신하지 않음을 확인한다. |
| `spec_approval_order` | Architectural과 required Bounded spec의 승인 버전이 적용 문서 집합에 포함되고, 종속 plan 작성·실행 준비 전에 written-spec 승인을 완료함을 확인한다. |
| `save_without_circular_approval` | Spec 저장에 그 spec의 written approval이나 실행 대상 선택을 요구하지 않는다는 명시를 확인한다. |
| `bounded_plan_required_without_spec` | Bounded에서 plan 필요성과 spec 필요성을 동일시하지 않고, 기존 깊이 판단이 spec을 요구할 때만 spec 단계를 적용함을 확인한다. |
| `spike` | 기존 Spike probe 행과 문서 비강제 설명에서 새 spec 의무가 없음을 확인한다. |
| `bounded_plan_skip` | 기존 짧은 설계·plan-skip 판단을 유지하고 새 spec 의무를 부과하지 않음을 확인한다. |
| `nonbehavior` | 기존 inapplicable stage 판단과 생략 근거를 유지하고 새 spec 의무를 부과하지 않음을 확인한다. |
| `plan_save` | 승인된 설계, 필요한 written-spec 승인 버전·근거, plan-depth/list/dependencies, Planner 전체 plan 초안/self-review, CEO 책임·절대 경로, 증거 누락·불일치 시 저장 중단을 확인한다. |

각 subcase는 해당 문서의 적용 조건·저장 section·경로별 표를 검사한다. 단순히 `bounded` 단어가 존재하거나 `spec required` 문구가 없다는 사실만으로 비강제를 판정하지 않는다. 실제 경로의 조건과 명시적인 비강제 설명을 함께 확인한다.

### Step 2: RED

저장소 루트에서 실행한다.

```sh
python3 -B -m unittest discover -s tests -p test_install.py -k preaction -v
```

- [ ] 새 계약의 assertion failure를 확인한다. 이전 구현이 이미 존재하면 required Bounded 조건·증거·짧은 설계 구분·문서 비강제에 대한 새 assertion의 실패를 RED 증거로 기록한다.
- [ ] Import/syntax error는 유효한 RED가 아니므로 먼저 해결한다. 이미 충족된 기존 계약이 실패해야 한다고 요구하지 않는다.

### Step 3: 최소 정책 변경

- [ ] 루트 adapter에 설치된 brainstorming의 역할·저장·조기 commit 지시를 Harness에 맞춰 적용한다고 명시한다.
- [ ] Mandatory reference 표에서 planning의 최초 적용 spec/plan 저장 trigger와 handoff의 대상 선택 요청·준비 Git 변경 trigger를 보완한다.
- [ ] Planning의 저장 게이트 적용 문구를 Architectural spec과 **기존 CEO 깊이 판단으로 필요한 Bounded written spec**으로 확장한다.
- [ ] Bounded spec 필요 판단·범위와 승인된 짧은 설계를 저장 전 증거에 포함한다. Spec 필요성을 판정하는 새 기준은 만들지 않는다.
- [ ] Required Bounded spec의 비례하는 완전한 Planner 초안/self-review → CEO 통합·저장·자체 검토 → 개별 written-spec 승인 순서를 명시한다.
- [ ] Required written-spec 승인을 종속 plan 작성·실행 준비의 선행 조건으로 연결하고 승인 버전을 적용 문서 집합에 포함한다.
- [ ] Spec 저장 자체에는 그 spec의 written approval이나 실행 대상 선택이 필요하지 않음을 유지한다.
- [ ] 짧은 설계의 파일 저장·승인은 required spec의 작성·자체 검토·개별 승인을 대신하지 않는다고 명시한다.
- [ ] Spike, Bounded plan-skip, non-behavior 경로에 새 spec 의무를 추가하지 않는다고 명시한다. Bounded의 plan-required 경로에서도 기존 깊이 판단이 spec을 요구할 때만 spec 단계를 적용한다.
- [ ] 기존 승인 순서·조기 commit 유예·plan 저장 증거·누락 시 중단 조건을 유지한다.
- [ ] CEO는 Planner 전체 초안을 대체해 직접 spec 초안을 쓰지 않고 실질적인 누락은 Planner에게 보완 요청한다고 명시한다.
- [ ] Handoff 참조에서 선택 요청 전 문서 완결 gate와 Git 변경 직전 상태·선택 gate를 나눈다. 문서 집합은 required artifacts를 뜻하며 모든 경로에 spec이 존재한다고 가정하지 않는다.
- [ ] 기존 commit 재사용·dirty 변경 보존·실패 중단·재개 규칙 및 canonical handoff 기록을 유지한다.
- [ ] README의 참조 표와 짧은 순서를 수정한다. Required Bounded spec의 조건부 적용을 요약하고 상세 조건은 planning 참조로 연결한다.
- [ ] Planner profile을 수정하지 않고 루트 skill word budget `2788` 이내를 유지한다.

### Step 4: GREEN과 기존 계약

신규·확장 회귀를 실행한다.

```sh
python3 -B -m unittest discover -s tests -p test_install.py -k preaction -v
```

기대 결과: 기존 다섯 `test_preaction` 검사와 추가 subcase가 모두 통과한다.

기존 계약을 파일 전체 검사로 확인한다.

```sh
python3 -B -m unittest discover -s tests -p test_install.py -v
```

기대 결과: `test_install.py` 전체 통과. 참조 trigger, 역할, word budget, 기존 handoff 계약과 문서 비강제 경로가 유지된다.

- [ ] 표현 변경으로 assertion이 깨지면 기존 의미와 수정 spec의 조건을 모두 보존하여 assertion을 조정한다. Word budget을 올리거나 조건부 적용 검사를 약화하여 통과시키지 않는다.
- [ ] AC별 정책 section·test method/subcase와 RED/GREEN 결과를 CEO에게 보고한다. 이 task 끝에서 manifest 수정이나 Git staging/commit을 하지 않는다.

## Task 2: Manifest 갱신과 전체 검증

**Files:** `/Users/yunho/Desktop/project/yunho-harness/MANIFEST.sha256` 수정. Task 1 최종 변경 전체 확인.

**AC:** AC-1, AC-7–AC-10. 수정 AC-2·AC-3의 구조 검사는 전체 suite에서 재확인한다.

- [ ] Task 1 이후 다음을 실행한다.

```sh
shasum -a 256 -c MANIFEST.sha256
```

기대 결과: 변경한 관리 문서 중 아직 hash가 갱신되지 않은 항목의 mismatch. 다른 불일치는 조사하고 임의 수정하지 않는다.

- [ ] 다음 파일 중 실제 변경된 항목의 hash만 갱신한다.

```text
README.md
skill/SKILL.md
skill/references/planning.md
skill/references/handoff.md
```

경로 목록·순서와 다른 hash를 보존한다. Tests·spec·plan은 manifest 대상이 아니다.

- [ ] 저장소 루트에서 실행한다.

```sh
python3 -B -m unittest discover -s tests -v
shasum -a 256 -c MANIFEST.sha256
git diff --check
git diff --stat
git diff --name-only
```

기대 결과: 전체 unittest 통과, 모든 manifest 항목 `OK`, 공백 오류 없음, 구현 변경은 지정된 파일 범위에 해당함. 기존 변경과 수정 spec/plan은 canonical 기록 기준으로 구분한다.

- [ ] 사용자 설치, 외부 skill 획득, installed profile 갱신은 실행하지 않는다.
- [ ] 최종 결과와 미검증 경계를 CEO에게 보고한다.

## Task 3: QA → 독립 Reviewer → CEO 수락

**Files:** 승인된 수정 spec/plan과 최종 변경 전체.

**AC:** AC-1–AC-10.

- [ ] QA가 승인 문서와 실제 checkout을 대조하고 전체 unittest, manifest, diff 확인을 독립 수행한다.
- [ ] QA는 각 AC에 정책 위치·test method/subcase·실행 결과·증거를 연결해 `proven/unmet/unverified`로 판정한다.
- [ ] 수정 AC-2·AC-3·AC-9에 대해 required Bounded spec 조건·증거·개별 승인·종속 순서와 spec 비강제 경로를 각각 확인한다.
- [ ] 구조 검사만으로 runtime 준수를 `proven`이라 하지 않는다.
- [ ] QA failure 또는 unmet은 CEO가 Coder에 수정을 배정하고 영향받는 QA 재확인을 받는다.
- [ ] QA 이후 독립 Reviewer가 최종 전체 변경을 검토한다. 역할 예외, 승인 순서, reference trigger, staged 보존, commit 재사용, 구조 검사 과장을 확인한다.
- [ ] Reviewer는 짧은 설계와 required written spec의 혼동, plan required를 spec required로 확대하는 해석, spec 저장 전 written approval을 요구하는 순환 조건, 불필요 경로에 문서를 강제하는 표현을 확인한다.
- [ ] 수정으로 상태가 달라지면 관련 QA 및 필요한 Reviewer 검토를 갱신한다.
- [ ] CEO가 finding과 증거 공백을 해결 또는 명시 처분하고 AC별 근거와 미검증을 기록해 수락한다.
- [ ] 구현 commit은 수락 후 선택적으로 진행한다. Staged diff가 수락 범위만 포함하는지 확인하며 push는 별도 명시 요청을 요구한다.

## 자체 검토와 한계

- AC-1–AC-10을 구현 task와 최종 QA/Reviewer에 연결했다.
- 수정 AC-2·AC-3·AC-9를 기존 다섯 test method 안에서 확장했다. 새 test method는 필요하지 않다.
- Required Bounded spec 적용 조건은 기존 CEO 깊이 판단이다. 새 spec 필요성 기준을 만들지 않았다.
- Architectural 전체 경로, Bounded 짧은 설계 경로, plan-skip 기준과 기타 문서 비강제 경로를 유지했다.
- Required spec 저장과 그 spec의 written approval을 구분하여 순환 조건을 피했다.
- 대상 선택 요청 준비와 이후 선택 증거를 구분했다.
- 기존 역할·파일 범위·명령·QA→Reviewer→CEO 순서를 유지했다.
- Planner profile은 변경하지 않는다. Manifest 관리 범위도 확대하지 않는다.
- 정적 검사는 문서 계약만 입증한다. Runtime 순서 준수는 실행 기록이 없으면 미검증이다.
- 실행 준비 시 branch·HEAD·dirty 상태를 최신 기준으로 다시 확인한다.
- Push, 설치, 외부 skill 변경은 계획에 포함하지 않는다.
