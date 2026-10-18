# 최종 Reviewer 수정 루프와 Planner 재작업 최소화 구현 계획

> **에이전트 실행 지침:** ARC의 역할 배정·승인·수락 규칙을 적용한다. Orchestrator가 Coder와 QA를 배정하고 작업을 수락한다. 아래 체크박스는 진행 기록이며 개별 커밋 단위가 아니다. 최종 전체 Reviewer 검토는 작업 수락 이후의 별도 최종 검증이다.

**목표:** 계획이 있는 작업의 최종 전체 Reviewer 지적은 QA 재배정 없이 Coder 수정 → Reviewer 재검토로 해결하고, 완전한 사전 brief와 통합 피드백으로 불필요한 Planner 재호출을 줄인다.

**구조:** 최종 Reviewer 이전의 작업별 검증과 필요한 QA 재검증은 유지한다. 최종 Reviewer 지적의 수정에는 별도 경로를 적용하고, 계획 작성 전 Orchestrator가 필요한 근거를 사전 수집해 완전한 brief를 제공하며 실질적 누락은 통합 요청으로 보완한다. 최종 Reviewer 수정은 커밋하지 않은 상태로 재검토하고, 지적 해결 후 Orchestrator 수락을 거쳐 하나의 집중 후속 커밋으로 확정한다. 양 플랫폼 정책 참조·프로필·회귀 검사·배포 manifest를 하나의 계약 변경으로 반영한다.

**기술:** Markdown 정책, Codex TOML 프로필, Claude Markdown 프로필, Python `unittest`, 기존 Node 설치 parity 및 manifest 도구.

**설계 근거:** 사용자가 승인한 대화 내 bounded 설계. Orchestrator의 깊이 판단은 **bounded + 서면 계획 필요, 별도 서면 spec 불필요**이다.

**저장 경로:** `/Users/ma-24-007/Desktop/workspace/arc/docs/superpowers/plans/2026-10-19-final-review-finding-loop.md`

## 대상 및 준비 증거

Orchestrator가 설계 승인 및 현재 checkout 선택 이후 확인하여 제공한 상태:

| 항목 | 값 |
|---|---|
| 실제 workspace/repository | `/Users/ma-24-007/Desktop/workspace/arc` |
| 사용자 선택 | 현재 `master` checkout |
| 실제 branch | `master` |
| 실제 HEAD | `7e80f015baf7fd999743b0f876fa6c426239add5` |
| staged/unstaged 변경 | 없음 |
| untracked 변경 | 이 계획 문서만 존재하며 현재 계획 작업 소유 |
| 다른 변경·소유권 충돌 | 없음 |
| canonical handoff record | 아직 없음. 계획 승인 후 Coder 배정 전에 작성 필요 |

위 증거는 계획 작성 기준이다. 계획 저장·승인과 문서 커밋으로 HEAD가 변경되면 Orchestrator가 최신 상태를 기록하고 Coder handoff에서 재확인한다.

## 공통 제약

- 정책의 적용 조건은 **계획이 있는 작업의 최종 전체 Reviewer에서 발생한 지적**이다.
- 최초 Reviewer 이전의 필수 QA·집중 검사·QA 실패 재검증을 생략하지 않는다.
- 여기서 “최초 QA”는 작업당 QA 1회라는 뜻이 아니다. 위험별로 필요한 작업 QA와 그 실패에 대한 QA 재검증을 모두 최종 전체 Reviewer 진입 전에 수행한다.
- 최종 Reviewer 지적의 수정 루프는 동작 지적을 포함하여 QA를 다시 배정하지 않는다.
- 최초 최종 전체 검토는 한 차례 수행하고, 지적이 있으면 해결될 때까지 필요한 재검토를 수행한다. `single` 또는 `once`가 재검토 금지로 해석되어서는 안 된다.
- 모든 수정·재검토 배정과 수락은 Orchestrator가 담당한다.
- Reviewer는 읽기 전용으로 검토하며 QA 검사를 실행하거나 수락을 결정하지 않는다.
- 계획 없는 작업, 위험 분류, 역할 독립성, 수정 범위를 벗어난 별도 의무를 변경하지 않는다.
- 기존 QA 결과를 수정 이후 상태에서 다시 실행한 결과로 표시하지 않는다. 실제 수행한 검사만 주체·대상 상태·결과와 함께 기록한다.
- 이미 커밋된 변경의 최종 Reviewer 수정은 필요한 후속 작업·승인을 거친다. 수정은 재검토 동안 커밋하지 않고, 지적 해결 후 Orchestrator가 수락하여 하나의 집중 후속 커밋을 생성한다.
- 기존 커밋을 자동 amend/reset하거나 원래 작업 커밋을 중복 생성하지 않는다.
- 범위 확대 시 `commit.md`의 새 계획·승인 의무를 유지한다.
- 필수 초기 설계, 필요한 spec 승인, 정식 계획 작성·승인은 서로 필요한 별도 단계다. 호출 감소를 위해 이를 합치거나 순서를 생략하지 않는다.
- 정식 작성 전에 Orchestrator가 관련 정책·참조·프로필·검사·parity·manifest, 대상·소유권 증거, 범위·의존성·수용 기준·필수 검사·보류 조건을 확인해 하나의 완전한 brief를 제공한다.
- Planner는 완전한 비례 초안과 자체 검토를 반환하고, Orchestrator는 고정 체크리스트로 한 번 점검해 모든 실질적 누락을 하나의 통합 후속 요청으로 전달한다. 누락을 발견할 때마다 요청을 쪼개지 않는다.
- 실질적 누락이나 사용자 승인 범위·근거 변경에 필요한 추가 Planner 호출은 허용한다. 불완전한 초안을 수락하거나 안전하지 않은 고정 호출 상한을 두지 않는다.
- 파일별 변경과 생성 manifest는 한 계약으로 검증한다.
- `tests/installer-parity.json`의 frozen `legacyInventory`는 수정하지 않는다.

## 수용 기준

| ID | 기준 |
|---|---|
| AC-01 | 모든 계획 작업이 수락되고 필요한 검사 및 이전 QA 실패의 재검증을 마친 뒤 최초 최종 전체 Reviewer를 시작한다. |
| AC-02 | 최종 전체 Reviewer 지적은 Orchestrator가 Coder 수정 → Reviewer 재검토로 전달하며, 반복 지적에도 QA를 배정하지 않는다. 동작 지적도 동일하다. |
| AC-03 | 최초 최종 Reviewer 이전 QA 실행 실패·미충족 기준은 계속 Coder 수정 → QA 재검증으로 처리한다. |
| AC-04 | Reviewer의 읽기 전용·QA 실행 금지·수락 결정 금지와 Orchestrator의 배정·수락 권한을 유지한다. |
| AC-05 | 이미 커밋된 계획 작업의 최종 Reviewer 수정은 커밋하지 않은 상태로 최신 diff를 재검토한다. 지적 해결 후 Orchestrator 수락을 거쳐 하나의 집중 후속 커밋을 생성하며, 수정 루프에 QA를 배정하지 않는다. |
| AC-06 | 계획 없는 작업의 검증 경로 및 별도 승인 의무를 유지한다. 범위 확대·상충하는 필수 의무·해결되지 않은 증거 공백은 Orchestrator에게 보류 사유로 전달한다. |
| AC-07 | Codex·Claude core, verification·commit·planning 참조, Reviewer 및 Planner 프로필 사이에 적용 조건과 역할 순서의 충돌이 없다. Planner의 최종 검증 지침은 최초 전체 검토 한 차례와 필요한 지적 재검토를 구분한다. |
| AC-08 | 정책 회귀 검사와 기존 설치 parity·프로필·manifest 검사가 통과하며, 실제 수행한 검사와 구조 검사로 입증할 수 있는 범위를 구분하여 보고한다. |
| AC-09 | 양 플랫폼 planning 참조가 정식 작성 전 Orchestrator의 사전 점검과 완전한 brief, Planner의 완전한 초안·자체 검토, 고정 체크리스트 및 통합 후속 요청을 요구한다. 필수 승인 단계를 유지하고, 실질적 누락이나 사용자 승인 범위·근거 변경에 필요한 추가 호출을 허용하며, 고정 호출 상한과 불완전한 초안 수락을 금지한다. |

## 집중 확인 사항

| 조건 | 기대 동작 | 담당 검사 |
|---|---|---|
| 최초 최종 검토 전 QA 실패 | QA 재검증을 계속 요구 | T1의 `test_pre_final_qa_failures_keep_qa_recheck` |
| 최종 Reviewer의 동작 지적 | QA 없이 Coder → Reviewer | T1의 `test_final_plan_reviewer_corrections_skip_qa` |
| 같은 지적이 반복됨 | 최초 전체 검토의 `single`/`once` 표현이 필요한 재검토를 막지 않음 | 기존 최초 검토 검사 및 새 수정 루프 검사 |
| 이미 커밋된 계획 변경 | 미커밋 수정 포함 재검토 → 해결 → Orchestrator 수락 → 후속 커밋 | 기존 committed-work 검사 수정 |
| 계획 없는 작업 또는 범위 확대 | 기존 흐름 유지 또는 Orchestrator 보류 및 필요한 새 승인 | T1의 `test_final_review_exception_preserves_scope_and_roles` |
| 정식 작성 근거가 여러 표면에 분산 | Orchestrator가 필요한 근거를 미리 모아 완전한 brief 제공 | `test_planner_drafting_preflight_requires_complete_brief` |
| 초안에 실질적 누락이 여러 개 있음 | 고정 체크리스트로 점검하고 보완점을 통합 요청 | `test_planner_followup_batches_substantive_omissions` |
| 호출 감소가 필수 승인 단계와 충돌 | 필수 순서를 유지하고 필요한 추가 호출 허용 | `test_planner_turn_minimization_preserves_approval_gates` |

## T1 — 최종 Reviewer 수정 및 Planner 사전 준비의 공통 정책 계약 변경

**구현 목표와 범위:** AC-01∼AC-09를 하나의 일관된 정책 계약으로 구현한다. 정책·프로필·검사·manifest는 서로 독립적으로 수락할 수 없으므로 하나의 최상위 작업과 하나의 집중 구현 커밋으로 처리한다.

**선행 작업과 의존성:**

- 사용자 승인 설계와 Planner 재작업 최소화 추가 요청: 확보.
- 본 계획의 서면 승인: 필요.
- Orchestrator의 계획 통합·저장·검토 및 적용 문서 승인·커밋 절차: Coder 배정 전에 완료해야 한다.
- canonical handoff record에 T1의 승인 계획 버전, 입력·출력 계약, 소유 파일, 필수 검사, 준비/보류 상태를 기록해야 한다.
- 선행 구현 작업은 없다. 하나의 공유 계약이므로 내부 단계는 순차 수행한다.

**소유권:**

- Coder: 아래 정책·프로필·회귀 검사 편집 및 manifest 생성.
- QA: 승인된 구조·일관성·배포 검사 독립 실행 및 증거 보고.
- Orchestrator: handoff, Git 상태·소유권 확인, 검사 및 지적 평가, T1 수락과 집중 커밋.
- Reviewer: T1 수락 전 필수 검사에 포함하지 않는다.

**대상 파일:**

| 절대 경로 | 책임 |
|---|---|
| `/Users/ma-24-007/Desktop/workspace/arc/codex/skill/SKILL.md` | 위험별 흐름과 최종 Reviewer 수정 예외의 기준 |
| `/Users/ma-24-007/Desktop/workspace/arc/claude/skill/SKILL.md` | Claude의 동일한 기준 |
| `/Users/ma-24-007/Desktop/workspace/arc/codex/skill/references/verification.md` | QA 실패와 최종 Reviewer 지적의 서로 다른 수정 경로 |
| `/Users/ma-24-007/Desktop/workspace/arc/claude/skill/references/verification.md` | Claude의 동일한 검증 경계 |
| `/Users/ma-24-007/Desktop/workspace/arc/codex/skill/references/commit.md` | 커밋된 작업의 후속 수정·재검토·수락·커밋 순서 |
| `/Users/ma-24-007/Desktop/workspace/arc/claude/skill/references/commit.md` | Claude의 동일한 커밋 경계 |
| `/Users/ma-24-007/Desktop/workspace/arc/codex/skill/references/planning.md` | 정식 작성 전 Orchestrator 사전 점검·완전한 brief·통합 후속 요청·승인 단계 보존 |
| `/Users/ma-24-007/Desktop/workspace/arc/claude/skill/references/planning.md` | Claude의 동일한 계획 작성 운영 규칙 |
| `/Users/ma-24-007/Desktop/workspace/arc/codex/agents/arc-reviewer.toml` | Reviewer 지적 보고 및 재검토 계약 |
| `/Users/ma-24-007/Desktop/workspace/arc/claude/agents/arc-reviewer.md` | Claude Reviewer의 동일한 계약 |
| `/Users/ma-24-007/Desktop/workspace/arc/codex/agents/arc-planner.toml` | 최초 최종 전체 검토와 필요한 재검토를 구분하는 계획 지침 |
| `/Users/ma-24-007/Desktop/workspace/arc/claude/agents/arc-planner.md` | Claude Planner의 동일한 계획 지침 |
| `/Users/ma-24-007/Desktop/workspace/arc/tests/test_arc_policy.py` | 적용 조건·보존 경계·양 플랫폼 회귀 검사 |
| `/Users/ma-24-007/Desktop/workspace/arc/MANIFEST.sha256` | 변경 payload의 생성 해시 |

**입출력 계약:**

- 입력: 승인된 설계·계획, handoff 기준 Git 상태, 기존 QA/Reviewer/Planner 역할 계약.
- 출력: 최종 Reviewer 수정 예외와 Planner 사전 준비·통합 피드백 규칙이 반영된 정책·프로필·검사·manifest 및 AC별 검증 증거.
- 새 API, 설치 옵션, 역할 또는 실행 도구를 추가하지 않는다.

### 구현 단계

- [ ] **1. Handoff 기준 확인**

  Coder는 brief의 실제 workspace, branch, HEAD, 변경 상태, 소유권, 승인 계획 버전과 문서 커밋 증거를 확인한다. 계획 작성 기준 HEAD와 다르더라도 Orchestrator가 기록한 승인 문서 커밋 이후 상태와 일치해야 한다. 불일치하면 편집 전에 보고한다.

- [ ] **2. 회귀 검사로 변경 계약을 고정**

  `tests/test_arc_policy.py`의 `ReviewerOncePerPlanTests`에 다음 검사를 추가하거나 기존 검사를 조정한다.

  - `test_final_single_reviewer_is_explicit`: 최초 최종 전체 검토 시점을 보존한다. Codex·Claude Planner 프로필에서 최초 전체 검토 한 차례와 필요한 지적 재검토를 구분하는지 검사한다.
  - `test_final_plan_reviewer_corrections_skip_qa`: Codex·Claude core/verification/Reviewer 프로필이 계획의 최종 Reviewer 지적에 대해 동작 지적 포함 Coder → Reviewer 및 QA 재배정 금지를 명시하는지 검사한다. 반복 지적의 재검토 허용도 검사한다.
  - `test_pre_final_qa_failures_keep_qa_recheck`: 최초 최종 Reviewer 이전 QA 실패는 Coder 수정·QA 재검증을 요구하는지 검사한다.
  - 기존 `test_final_reviewer_findings_on_committed_work`: 최종 Reviewer 지적과 최종 QA 지적을 구분한다. Reviewer 지적은 미커밋 수정 → 최신 diff 재검토 → 지적 해결 → Orchestrator 수락 → 하나의 후속 커밋 순서를 검사하고, QA 지적은 기존 QA 재검증을 보존하는지 검사한다.
  - `test_final_review_exception_preserves_scope_and_roles`: 계획 없는 작업의 기존 흐름, Orchestrator 배정·수락, Reviewer 읽기 전용·QA 실행 금지, 범위 확대와 별도 필수 의무의 보류·승인 경계를 검사한다.

  같은 파일에 PlannerDraftingDisciplineTests를 추가한다. Codex와 Claude의 planning.md를 각각 읽어 검사한다.

  - `test_planner_drafting_preflight_requires_complete_brief`: 정식 작성 전 Orchestrator의 사전 점검과 완전한 brief 항목을 검사한다.
  - `test_planner_returns_complete_draft_and_self_review`: Planner의 완전한 비례 초안·자체 검토와 Orchestrator의 통합·저장·검토·승인 책임을 검사한다.
  - `test_planner_followup_batches_substantive_omissions`: 고정 체크리스트와 실질적 누락의 통합 요청을 요구하고, 항목별로 쪼갠 후속 요청을 막는지 검사한다.
  - `test_planner_turn_minimization_preserves_approval_gates`: 필수 설계·정식 계획 호출의 구분, spec·계획 승인 순서, 필요한 추가 호출 허용, 고정 상한 금지와 불완전한 초안 수락 금지를 검사한다.

  기존 역할 독립성·작업별 Reviewer 금지 검사를 유지한다. 새 계약과 충돌하는 기존 일반 QA 재검증 assertion은 예외 적용 범위를 명확히 하도록 수정한다.

- [ ] **3. 변경 전 실패 확인**

  작업 디렉터리에서 실행한다.

  ~~~bash
  python3 -B -m unittest discover -v -s tests -p test_arc_policy.py -k ReviewerOncePerPlanTests
  python3 -B -m unittest discover -v -s tests -p test_arc_policy.py -k PlannerDraftingDisciplineTests
  ~~~

  기대 결과: 새 최종 Reviewer 수정 경로·최초 검토와 재검토의 구분, Planner 사전 점검과 통합 후속 요청 규칙이 아직 없어 관련 assertion이 실패한다. import·환경 실패를 계약의 RED 증거로 사용하지 않는다.

- [ ] **4. 정책·참조·프로필을 함께 수정**

  core에 최종 Reviewer 수정 예외를 정의하고 verification·commit 참조와 양 플랫폼 Reviewer·Planner 프로필에 동일한 적용 조건을 반영한다.

  반드시 구분할 경로:

  1. 최초 최종 Reviewer 전 QA 실패: Coder → QA 재검증.
  2. 계획의 최종 Reviewer 지적: Coder → Reviewer 재검토 반복, QA 재배정 없음.
  3. 계획 없는 작업: 기존 흐름.
  4. 승인 범위 확대 또는 별도 필수 의무 충돌: Orchestrator 판단과 필요한 승인 전 보류.

  Planner 프로필의 `single`/`once`는 모든 계획 작업 수락 후 수행하는 **최초 최종 전체 검토 한 차례**를 가리키도록 한다. 이후 지적 해결을 위한 재검토를 최종 검증에 포함하도록 명시한다.

  이미 커밋된 작업의 최종 Reviewer 수정에는 다음 순서를 명시한다.

  - Orchestrator가 필요한 후속 작업·승인을 정리한다.
  - Coder가 수정하며 재검토 동안 해당 수정은 커밋하지 않는다.
  - Orchestrator가 최신 커밋 상태와 미커밋 수정까지 포함한 Reviewer artifact/brief를 갱신한다.
  - 독립성을 유지하는 기존 Reviewer를 재사용하거나 필요한 경우 독립 Reviewer를 배정한다.
  - 지적이 해결될 때까지 Coder → Reviewer를 반복하며 QA를 배정하지 않는다.
  - 지적 해결 후 Orchestrator가 수락하고 하나의 집중 후속 커밋을 생성한다.

  수정 후 증거의 유효 범위와 한계를 기록한다. 이전 QA 결과가 수정 후 상태를 재검증했다는 표현은 금지한다.

- [ ] **5. 양 플랫폼 planning 참조에 Planner 재작업 최소화 규칙 추가**

  Codex·Claude planning.md에 아래 규칙을 같은 의미로 추가한다.

  **정식 작성 전 사전 점검:** Orchestrator는 관련 policy·reference·profile·test·parity·manifest 표면과 충돌, 실제 절대 workspace/repository·branch·HEAD·변경 상태·소유권, 사용자 대상 선택과 준비 증거, 승인된 선행 설계/spec/plan, 범위·제외 범위, 깊이 판단, 의존성과 공유 계약, 수용 기준, 필수 QA·집중 검사와 증거, 보류 조건 및 열린 결정을 확인한다. 이 정보를 하나의 완전한 brief에 담는다. 필수 근거가 없거나 상충하면 먼저 해결하거나 해당 단계를 보류한다.

  **초안 점검과 보완 요청:** Planner는 승인 단계에 맞는 완전한 비례 초안과 자체 검토를 반환한다. Orchestrator는 범위·근거, 대상·소유권·경로, 관련 정책 표면과 충돌, 작업 경계·의존성·수용 기준, 검사·증거·보류 조건, 역할·승인·커밋 경계, 초안 완전성을 고정 체크리스트로 한 번 점검한다. 실질적 누락을 발견하면 모두 한 번에 모아 통합 후속 요청을 보낸다. Orchestrator가 계획을 대신 쓰거나 누락별로 요청을 쪼개지 않는다.

  필수 초기 설계, 필요한 spec 승인, 정식 계획 작성 및 승인은 각각의 순서와 경계를 유지한다. 실질적 누락이나 사용자 승인 범위·근거 변경 시 추가 Planner 호출을 허용한다. 고정 호출 상한을 두거나 불완전한 초안을 수락하지 않는다. 이 운영 규칙을 이유로 Planner 프로필에 별도 호출 횟수 조건을 추가하지 않는다.

- [ ] **6. GREEN 확인 및 manifest 갱신**

  Step 3의 두 명령을 다시 실행하여 전체 선택 검사가 통과하는지 확인한다. 이후 기존 생성 도구로 manifest를 갱신한다.

  ~~~bash
  node scripts/update-manifest.mjs
  ~~~

  생성 diff가 승인된 payload 변경에 대응하는 해시 갱신인지 확인한다. 생성기는 편집하지 않는다.

- [ ] **7. 독립 QA 증거 확보**

  Orchestrator가 T1에 새로운 QA를 배정한다. 아래 검사는 공유 역할 계약과 배포 payload의 실제 일관성 때문에 필요하다.

  ~~~bash
  node scripts/check-installer-parity.mjs --complete
  node --test tests/node/profile-render.test.mjs tests/node/manifest.test.mjs
  npm run check:manifest
  git diff --check
  ~~~

  통과 기준:

  - complete parity의 모든 활성 매핑 검사와 보존된 Python 정책 suite가 성공한다.
  - PlannerDraftingDisciplineTests가 양 플랫폼 planning 참조를 검사하고 통과한다.
  - 프로필 및 manifest 검사가 종료 코드 `0`으로 성공한다.
  - manifest가 최신 상태이며 diff 공백 오류가 없다.
  - QA가 AC-01∼AC-09의 충족·미충족·미검증 상태를 각각 보고한다.
  - QA가 core·참조·Reviewer·Planner 프로필을 대조해 최초 검토·재검토·수락·커밋 순서가 일치함을 보고한다.
  - QA가 최초 최종 검토 전 QA 실패 경계와 최종 Reviewer 수정 예외 사이에 충돌이 없음을 보고한다.
  - QA가 양 플랫폼 planning 참조의 사전 점검·완전한 brief·통합 후속 요청이 필수 작성·승인 순서를 유지함을 확인한다.

  실패하면 Orchestrator가 Coder 수정 → QA 재검증을 수행한다. 이는 **최초 최종 Reviewer 이전 QA 단계**이므로 이번 예외에 해당하지 않는다.

- [ ] **8. Orchestrator 수락 및 집중 커밋**

  Orchestrator가 승인 범위, AC별 증거, 필수 검사, 남은 지적과 Git 소유권을 확인하여 T1을 수락한다. 이후 별도 사용자 커밋 승인 없이 하나의 집중 구현 커밋을 생성한다.

  제안 커밋 메시지:

  ~~~text
  fix(workflow): 최종 검토와 Planner 재요청 절차 정비
  ~~~

  커밋에는 T1 소유의 승인된 변경만 포함한다. 커밋 SHA와 이후 branch/HEAD/변경 상태를 검증해 handoff 기록에 남긴다.

### T1 수락 전 필수 증거

- AC-01∼AC-09의 개별 판정과 근거.
- 두 선택 회귀 검사 명령의 의도한 RED 및 GREEN 출력.
- 독립 QA의 complete parity·프로필·manifest·diff 검사 결과.
- 양 플랫폼 core·참조·Reviewer·Planner 프로필의 정책 대조 결과.
- 양 플랫폼 planning 참조의 사전 점검·완전한 brief·통합 후속 요청·승인 보존 검사 결과.
- 미해결 지적의 처리 상태.
- 승인된 파일 범위와 실제 diff의 일치.

**최종 전체 Reviewer 결과는 T1 수락·커밋의 선행 조건이 아니다.**

### 보류 조건

- 승인 계획·문서 커밋 증거·canonical handoff record 또는 현재 Git 상태가 불일치한다.
- 소유 파일에 다른 작업의 변경이 있거나 필수 검사를 실행할 환경이 없다.
- 최초 최종 Reviewer 전 QA 실패 또는 필수 검증 공백이 해결되지 않았다.
- 추가 파일·새 역할·계획 없는 작업의 변경 등 승인 범위 확대가 필요하다.
- frozen parity inventory 또는 설치 도구 자체 변경이 필요해 보인다.
- 별도 승인된 필수 의무와 최종 Reviewer 수정 예외가 충돌한다.
- Reviewer에게 제공할 최신 artifact에 미커밋 수정 또는 관련 신규 파일을 포함할 수 없다.
- 필수 작성 근거가 빠졌거나 상충하는데 호출 절감을 이유로 정식 작성을 진행해야 하는 상황.
- 통합 피드백 후에도 실질적 누락이 남거나 승인 범위·근거가 바뀌어 추가 Planner 작성이 필요한 상황.

보류 사유는 Orchestrator에 전달한다. Coder·QA가 승인 범위를 확대하거나 검사를 임의로 면제하지 않는다. 필요한 Planner 추가 요청은 사유·변경 근거·남은 누락을 통합한다. 범위 확대에는 `commit.md`에 따른 필요한 새 계획·승인을 적용한다.

## 최종 전체 계획 검증

**시점:** T1을 수락하고 집중 커밋을 검증한 이후.

**최초 검토 범위:** 승인된 계획의 전체 구현 변경. Orchestrator가 구현 기준 base, 최신 HEAD, 전체 diff와 변경 파일 목록, 승인 설계·계획, QA 증거 및 한계를 독립 Reviewer에게 제공한다. 계획 문서 커밋과 구현 커밋을 구분하여 실제 전체 구현 변경이 누락되지 않게 한다.

**필수 검증:** 독립 Reviewer가 최초 최종 전체 변경을 한 차례 검토한다. 특히 다음을 확인한다.

- 최종 Reviewer 지적과 최초 Reviewer 전 QA 실패의 경계.
- 동작 지적 및 커밋된 작업에도 직접 재검토 경로가 적용되는지.
- Codex·Claude core·참조·Reviewer·Planner 프로필의 충돌 여부.
- 최초 전체 검토 한 차례와 필요한 지적 재검토의 구분.
- Reviewer 권한 확대 또는 QA의 독립 검증 역할 훼손 여부.
- 미커밋 수정의 재검토 이후 수락·후속 커밋 순서.
- 수정 이후 증거의 유효 범위와 미검증 부분의 표현.
- Planner의 사전 점검·통합 피드백이 필수 설계/spec/plan 작성과 승인 순서를 보존하는지.
- 추가 Planner 호출 조건이 필요한 재작업을 허용하고 고정 상한이나 불완전한 초안 수락을 유도하지 않는지.

### 지적 발생 시 수정·재검토·커밋 순서

1. Orchestrator가 관련 지적과 필요한 후속 작업·승인을 정리한다. 범위가 확대되면 필요한 새 계획·승인을 먼저 받는다.
2. Coder가 수정한다. 최종 Reviewer 수정은 해결 확인 전까지 커밋하지 않는다.
3. Orchestrator가 재검토 artifact/brief를 갱신한다. 커밋된 전체 구현 변경과 현재 staged/unstaged 수정 및 관련 신규 파일을 포함하여 **Reviewer가 실제 최신 수정 상태를 읽을 수 있게 한다**. `base..HEAD`만 제공하여 미커밋 수정을 누락해서는 안 된다.
4. 독립성·범위·맥락의 유효성이 유지되면 같은 Reviewer가 재검토한다. 그렇지 않으면 필요한 맥락과 지적 기록을 갖춘 독립 Reviewer를 배정한다.
5. 지적이 남으면 Coder → Reviewer를 반복한다. 이 수정 루프에는 QA를 배정하지 않으며 Reviewer도 QA 검사를 실행하지 않는다.
6. 지적이 해결되면 Orchestrator가 최신 수정 내용, 재검토 근거, 실제 검사 증거와 한계를 확인하여 후속 작업을 수락한다.
7. Orchestrator가 해결된 수정에 대해 **하나의 집중 후속 커밋**을 생성하고 SHA·branch·HEAD·변경 상태를 검증한다. 재검토된 내용과 커밋할 내용이 달라지면 커밋 전에 필요한 재검토를 수행한다.

이 경로는 기존 QA 검사를 다시 실행했다는 의미가 아니다. 수정 중 실제 수행한 검사만 실행 주체·대상 상태·결과와 함께 기록한다.

### 범위 또는 의무 충돌

Orchestrator가 보류 사유와 필요한 결정을 처리한다. 충돌을 이유로 QA를 자동 추가하거나 필수 의무를 임의 면제하지 않는다. Planner의 추가 작성이 필요하면 지적·근거·변경 범위를 통합해 요청하며 승인 순서를 유지한다.

### 전체 완료 조건

Orchestrator가 최종 지적, 수정 증거, 최신 diff의 재검토 결과, 잔여 한계와 후속 커밋 상태를 확인하여 전체 계획을 수락한다.

## 가정과 열린 사항

- 별도 서면 spec이 필요 없다는 Orchestrator 판단을 적용한다.
- 현재 `master` 선택과 준비 증거는 Orchestrator 제공 사실에 근거한다.
- 새 정책은 본 작업의 최종 Reviewer 수정 루프에도 승인된 설계대로 적용한다.
- 두 Planner 프로필의 기존 최종 단일 검토 문구도 이번 공유 계약에 포함한다.
- Planner 호출 최소화의 사전 점검·통합 피드백 규칙은 양 플랫폼 planning 참조에 둔다. 이를 이유로 Planner 프로필 편집 범위를 늘리지 않는다.
- canonical handoff record의 경로·작성과 승인 문서 커밋은 Orchestrator 책임이며 Coder 배정 전 해결해야 한다.
- 사용자에게 추가 결정을 요청해야 할 설계상 열린 사항은 없다.

## 자체 검토

- 승인 설계와 AC-01∼AC-09는 모두 T1 및 별도 최종 검증에 대응한다.
- 정책·Reviewer·Planner 프로필·검사·manifest를 처음부터 하나의 작업으로 묶었다.
- Reviewer를 작업별 수락 선행 검사로 추가하지 않았다.
- 최초 QA 및 실패 재검증과 최종 Reviewer 수정 예외를 구분했다.
- 두 Planner 프로필과 관련 회귀 검사에 최초 전체 검토와 필요한 재검토의 차이를 반영했다.
- 커밋된 작업의 최종 Reviewer 수정은 미커밋 상태로 재검토하고, 지적 해결 → Orchestrator 수락 → 하나의 후속 커밋 순서로 명시했다.
- 최신 Reviewer artifact에 커밋 후 working changes와 관련 신규 파일을 포함하도록 했다.
- 같은 Reviewer 재사용 조건과 독립 Reviewer 재배정 가능성을 유지한다.
- 범위 확대 시 새 계획·승인 의무를 유지한다.
- 필수 초기 설계·정식 계획 단계와 그 승인을 불필요한 재작업 호출과 구분한다.
- 정식 작성 전 완전한 brief, 고정 체크리스트, 실질적 누락의 통합 후속 요청을 양 플랫폼 참조와 회귀 검사에 반영한다.
- 필요한 추가 Planner 호출을 허용하고, 안전하지 않은 고정 상한이나 불완전한 초안 수락을 금지한다.
- QA를 우회적으로 재삽입하거나 QA 검사를 재실행했다고 암시하지 않는다.
- 구조 검사가 실제 소비 에이전트의 실행 준수까지 증명한다고 주장하지 않는다.
- frozen inventory·설치 구현·역할 구조로 범위를 확대하지 않았다.
- 파일 저장·구현·검사 실행은 하지 않았다.

---

Orchestrator 다음 조치: 통합 수정 초안을 지정 경로에 저장하고 검토한 뒤 서면 계획 승인을 받습니다. 승인 후 handoff 기록과 승인 문서 커밋·최신 대상 증거를 완성하고 Coder를 배정합니다.
