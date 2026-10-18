# 정식 계획 문서 작성 전 실행 작업 공간 선택 구현 계획

> **실행 역할:** ARC 역할 계약에 따라 Orchestrator가 조율·수용하고 Coder가 구현한다. Planner는 초안만 반환한다. 아래 체크박스는 진행 기록이며 별도 과제·커밋 단위가 아니다. 로컬 writing-plans의 실행 역할·저장·승인 예시보다 ARC 역할과 승인 계약을 우선한다.

**목표:** Codex와 Claude에서 실행 대상 선택·실제 준비를 정식 spec·plan 작성 앞으로 이동하고, 문서 승인·일괄 커밋·Coder 인계 조건을 보존한다.

**구조:** 정책, 최상위 요약, Planner profile, 구조 검사를 하나의 공통 계약으로 수정한다. managed worktree는 Codex 전용으로 유지한다. 보호 payload 변경에 필요한 manifest 갱신을 같은 과제에 포함한다.

**기술:** Markdown, TOML, Python unittest, 기존 Node.js parity·manifest 도구. 새 의존성은 추가하지 않는다.

**승인 spec:** /Users/yunho/Desktop/project/arc/docs/superpowers/specs/2026-10-19-planner-workspace-selection-before-documents-design.md

**계획 문서 경로:** /Users/yunho/Desktop/project/arc/docs/superpowers/plans/2026-10-19-planner-workspace-selection-before-documents.md

## 공통 제약

- 초기 brainstorming·설계 제안은 선택 전 가능하다.
- 정식 초안 작성에는 파일 저장 전 Planner의 완전한 초안 작성도 포함한다.
- 정식 작성 전에 명시적 선택과 실제 대상 준비·확인을 완료한다.
- 선택 요청에는 예정 문서 범위와 검증된 대상을 제시한다. 문서 작성·개별 승인 완료를 요구하지 않는다.
- 정식 문서는 확인된 실제 실행 공간에 저장한다.
- Planner는 작성·self-review, Orchestrator는 통합·저장·검토·승인 조율을 담당한다.
- written-spec 승인 후 종속 plan 작성, 전체 개별 승인 후 남은 승인 문서 일괄 커밋 순서를 유지한다.
- Codex만 managed worktree를 지원한다.
- 기존 branch 명명·충돌 처리, 문서 생략 판단, 소유권·보존·복구와 Coder 인계 조건은 유지한다.
- 과거 작업에 대한 소급 승인·준수 주장을 하지 않는다.
- 구조 검사는 작성된 정책 계약을 확인하며 실제 agent 런타임 준수를 입증하지 않는다.

## 작업 공간과 준비 상태

제공된 증거 기준:

- workspace/repository: /Users/yunho/Desktop/project/arc
- branch: chore/planner-workspace-before-documents
- HEAD: ab4c330e662b13a7babdd289167f49e9546b302c
- 사용자가 현재 checkout에서 새 branch 생성을 명시적으로 선택했고 준비가 완료됨.
- spec 저장 전 checkout은 clean이었으며, 현재 spec이 유일한 untracked 파일임.
- 사용자 발화 “승인하고 plan 작성 진행”으로 written-spec 승인 완료.

이 상태는 계획 작성에 제공된 증거이며 Planner가 Git 상태를 재검증하지 않았다. 계획 저장과 승인 문서 커밋 뒤 HEAD·변경 상태는 갱신되어야 하므로 위 HEAD를 구현 중 계속 유지해야 하는 값으로 취급하지 않는다.

## 근거와 추가 필수 표면

| 근거 | 계획에 반영할 내용 |
|---|---|
| 승인 spec §4–9 | 초기 제안과 정식 작성 구분, 선택·준비 선행, 단계별 Git 조건 |
| 승인 spec §10–12 | Codex 문서 전송 예외, 선택 재사용, 기존 인계·생략 경로 |
| 승인 spec §13–14 | 정책·profile·검사 정합성, 수용 기준 AC1–AC13 |
| codex/skill/SKILL.md:157와 claude/skill/SKILL.md:151 부근 | 양쪽 요약에 남은 “Complete all current-scope approved documents before execution-target selection…” 수정 |
| tests/test_arc_policy.py:153, :216, :569 이후 | 기존 순서·저장·선택·Git 조건 단언 수정 |
| tests/test_arc_policy.py:928, :1098, :1154 부근 | checkout 선택 시점, worktree 전송·커밋 순서 회귀 검사 조정 |
| tests/test_claude_payload.py:309–343 | Claude 기존 문구 검사와 저장·재선택의 역순 조건 수정 |
| scripts/update-manifest.mjs | 양쪽 skill·agents가 보호 payload이므로 MANIFEST.sha256 갱신 필요 |
| scripts/check-installer-parity.mjs:9–38 | legacy inventory는 고정이며 coverage destination은 기존 매핑 규칙으로 관리 |

두 SKILL.md와 MANIFEST.sha256는 위 소스 근거 때문에 필요한 범위다. installer 구현·parity 검사기 자체는 수정하지 않는다.

## 주요 실패 조건과 검사 대응

| 조건 | 기대 결과 | 담당 검사 |
|---|---|---|
| 완전한 초안만 먼저 만들고 저장을 나중에 수행 | 선택·실제 준비 전 정식 작성으로 금지 | test_formal_drafting_and_save_require_prepared_target |
| Codex worktree 생성이 진행 중이거나 등록·연결·branch 확인이 미완료 | 정식 작성·저장과 종속 작업 보류 | test_platform_targets_and_legacy_transfer_boundaries |
| plan만 필요한 경로 또는 유효한 문서 생략 경로 | 새 spec 의무 없이 기존 판단 적용 | test_document_omissions_and_coder_gate_remain |
| 동일 범위 문서 수정과 실제 대상·범위 변경 | 전자는 선택 재사용, 후자는 후속 작업 전 재선택 | test_choice_reuse_and_reselection_before_documents |
| 일부 문서만 승인되었거나 기존 source 승인 문서가 존재 | 전체 승인 전 커밋·Coder 금지, 기존 문서는 안전한 재사용·전송 조건 적용 | test_phase_specific_git_and_batch_gates 및 전송 경계 검사 |

## T1 — 두 runtime의 문서 작성 전 실행 대상 계약 통합

**목표·범위**

양쪽 정책과 Planner profile, 기존·신규 구조 검사 및 필요한 보호 manifest를 하나의 일관된 계약으로 수정한다. 이 표면들은 함께 확인되어야 하므로 하나의 최상위 구현 과제로 둔다.

**선행 과제와 의존성**

선행 구현 과제는 없다. 다음 준비가 완료되어야 Coder를 배정한다.

- 이 계획의 사용자 승인.
- 접근 가능한 승인 spec과 승인 증거.
- 실제 workspace·branch/HEAD·변경 상태·소유권 갱신.
- 유효한 실행 대상 선택 증거.
- 승인 spec·plan의 일괄 docs commit과 결과 확인.
- 기존 전체 Coder handoff gate 통과.
- T1의 파일 소유권과 준비 상태가 기록된 brief/canonical record.

**담당 파일**

아래 경로는 모두 /Users/yunho/Desktop/project/arc/ 기준이다.

| 파일 | 책임 |
|---|---|
| codex/skill/references/planning.md | 정상 순서, 작성·저장 증거, 전체 문서 집합, 생략 경로와 갱신 조건 |
| codex/skill/references/handoff-prep.md | 선택 요청, 초기 준비 Git 조건, 승인 문서 staging·commit 조건 |
| codex/skill/references/handoff.md | 선택 시점, 인계 증거, 유효기간·재시작 |
| codex/skill/references/handoff-worktree.md | 작성 전 실제 worktree 준비, 직접 작성, 기존 문서 전송 예외 |
| claude/skill/references/planning.md | 공통 작성·저장·승인 순서 |
| claude/skill/references/handoff-prep.md | 현재 checkout의 초기 준비·문서 커밋 분리 |
| claude/skill/references/handoff.md | 공통 선택·재사용·기록 및 기존 인계 조건 |
| codex/skill/SKILL.md | 공통 계약 요약의 기존 순서 제거 |
| claude/skill/SKILL.md | 공통 계약 요약의 기존 순서 제거 |
| codex/agents/arc-planner.toml | 정식 작성 brief의 선택·실제 준비 증거와 보류 조건 |
| claude/agents/arc-planner.md | 동일 책임과 초기 설계 제안 예외 |
| tests/test_arc_policy.py | Codex 회귀 검사와 공통 순서·예외 검사 |
| tests/test_claude_payload.py | Claude 회귀 검사와 공통 순서·미지원 검사 |
| MANIFEST.sha256 | 변경된 보호 payload의 해시 |

tests/installer-parity.json은 기존 mapped test를 삭제·이동·개명하여 destination 변경이 실제로 필요한 경우에만 수정한다. 기존 class·method 이름을 유지하는 것을 기본으로 한다.

**입력·출력 계약**

- 입력: 승인 spec AC1–AC13, 기존 role/Git/보존 규칙, 기존 구조 검사와 parity mapping.
- 출력: 양쪽 runtime의 일치하는 순서와 작성 조건, Codex 전용 worktree 조건, 통과한 구조 검사, 최신 manifest.
- 새 런타임 API·함수·명령은 만들지 않는다.
- 기존 외부 skills와 installer 동작은 바꾸지 않는다.

### 1. 구조 검사 변경과 RED 확인

- [ ] tests/test_arc_policy.py와 tests/test_claude_payload.py 각각에 WorkspaceBeforeDocumentsTests(unittest.TestCase)를 추가한다.

두 파일에서 동일한 검사 이름을 사용하고 각 runtime의 파일을 직접 읽는다. 두 테스트 파일 사이에 import 의존성이나 새 공용 모듈은 만들지 않는다.

| 신규 method | 단언 |
|---|---|
| test_normal_order_selects_and_prepares_before_formal_drafting | 아래 정상 순서 확인, spec 승인 전 종속 plan 및 전체 승인 전 커밋 금지 |
| test_choice_request_uses_planned_documents_and_verified_target | 예정 문서 범위·경로·의존성, 실제 경로·branch/base·변경·소유권 요구; 완료 문서·개별 승인을 선택 선행 조건으로 요구하지 않음 |
| test_formal_drafting_and_save_require_prepared_target | 파일 저장 전 완전한 초안도 정식 작성에 포함; 초기 제안은 선택 전 허용; profile·save gate에 실제 대상 증거 포함 |
| test_phase_specific_git_and_batch_gates | branch/worktree 준비와 staging·commit의 조건 분리; 후자에는 전체 승인 집합·index 확인 유지 |
| test_platform_targets_and_legacy_transfer_boundaries | 공통 checkout·branch 경로; Codex 등록·연결·identity·branch 확인과 전송 예외; Claude worktree 미지원 |
| test_choice_reuse_and_reselection_before_documents | 같은 범위 정상 변경은 재사용; 실제 범위·대상 변경은 종속 작업 전 재선택; 재선택에 문서 완료를 요구하지 않음 |
| test_document_omissions_and_coder_gate_remain | plan만으로 spec 강제 금지, 기존 생략 경로·Coder 인계 조건 유지 |

정상 순서는 양쪽 planning.md의 Normal order: 문단에서 확인한다. 정책 문구의 순서 표식은 다음으로 통일한다.

```text
initial design approval
execution-target choice
target preparation and verification
formal spec drafting
written-spec approval
formal plan drafting
individual plan approvals
complete applicable set
batch docs commit
final Git verification
Coder handoff
```

검사의 핵심 단언 형태:

```python
text = " ".join(planning_path.read_text().lower().split())
order = text.split("normal order:", 1)[1].split("coder handoff", 1)[0]
markers = (
    "initial design approval",
    "execution-target choice",
    "target preparation and verification",
    "formal spec drafting",
    "written-spec approval",
    "formal plan drafting",
    "individual plan approvals",
    "complete applicable set",
    "batch docs commit",
    "final git verification",
)
cursor = 0
for marker in markers:
    found = order.find(marker, cursor)
    self.assertGreaterEqual(found, cursor, marker)
    cursor = found + len(marker)
```

이 순서는 모든 문서가 필요한 기본 경로를 표현한다. 같은 검사 집합에서 plan-only·문서 생략 경로가 보존됨을 별도로 확인한다.

- [ ] 기존 검사의 역순 단언을 새 계약으로 교체한다.

필수 확인 위치:

- TaskCommitPolicyTests.test_document_batch_and_external_action_boundaries_remain
- ConditionalReferenceTests.test_planning_order_and_recovery_protections_remain
- ARCPreactionGateTests.test_preaction_document_save_evidence
- ARCPreactionGateTests.test_preaction_reference_and_choice_order
- ARCPreactionGateTests.test_preaction_git_evidence_and_batch_order
- RolePolicyTests.test_workspace_handoff_requires_scoped_checkout_approval
- RolePolicyTests.test_workspace_handoff_worktree_scoped_choice_and_base
- RolePolicyTests.test_workspace_handoff_worktree_docs_commit_order
- RolePolicyTests.test_worktree_planning_and_core_preparation_gates
- Claude의 test_claude_planning_reference_ports_paths_and_gates
- Claude의 test_claude_commit_and_recovery_rules

변경 범위는 기존 잘못된 선행 조건과 새 단계 구분이다. branch 충돌, 보존, index 검증, commit 메시지, 실패·재시작과 Coder 인계의 나머지 단언을 제거하지 않는다.

- [ ] 다음 후보 명령으로 신규 구조 검사가 기존 정책에서 실패함을 확인하고 실패 원인을 기록한다.

```sh
cd /Users/yunho/Desktop/project/arc/tests
python3 -B -m unittest -v test_arc_policy.WorkspaceBeforeDocumentsTests test_claude_payload.WorkspaceBeforeDocumentsTests
```

기대 결과: 기존 정책의 순서·작성 조건 불일치로 FAIL. import 오류, 파일 누락 또는 테스트 수집 실패는 유효한 RED로 인정하지 않는다.

### 2. 양쪽 planning 계약과 요약 수정

- [ ] 양쪽 planning.md에 초기 설계 제안과 정식 작성의 정의·경계를 명시한다.
- [ ] Normal order:를 위 표식 순서로 갱신한다.
- [ ] 선택 요청에는 예정 문서 범위·검증 대상, 정식 작성·저장에는 실제 준비 증거, staging·commit에는 전체 승인 집합을 요구하도록 나눈다.
- [ ] spec 저장에 written-spec 승인을 미리 요구하지 않되, 유효한 대상 선택·준비는 요구한다.
- [ ] Bounded plan-only와 모든 기존 생략 근거를 유지한다.
- [ ] 양쪽 SKILL.md 요약의 문서 완료 후 선택 규칙을 같은 새 계약으로 바꾸고 세부 내용은 reference로 연결한다.

while documents… 규칙이 선택·준비를 다시 금지하지 않게 한다. 문서 승인 중 staging·commit 금지와 조기 Coder 금지는 유지한다.

### 3. 선택·Git 준비·기록 계약 수정

- [ ] 양쪽 handoff-prep.md의 선택 요청을 예정 문서 범위·검증 대상 기반으로 바꾼다.
- [ ] branch/worktree 생성·전환에 전체 승인 문서 집합을 요구하는 공통 선행 조건을 제거하고 작업 종류별 조건으로 나눈다.
- [ ] 승인 문서 staging·commit에는 기존 전체 집합·승인 버전·index·메시지·결과 검증을 유지한다.
- [ ] 양쪽 handoff.md에서 선택이 정식 작성 전에 발생하고 구현 재시작까지 재사용될 수 있음을 명시한다.
- [ ] 범위·target 변경의 재선택에 문서 전체 완료를 다시 요구하는 문구를 수정한다.
- [ ] 예정 상태와 실제 완료 상태를 기존 brief/canonical record에 기록하고, 실제 순서·증거 공백을 보존한다.

기존 전체 Coder handoff gate는 유지한다. 초기 대상 준비 완료만으로 구현 권한이 생기지 않음을 명시한다.

### 4. Codex worktree와 Planner profile 수정

- [ ] handoff-worktree.md에서 실제 생성·등록·chat 연결·repository/base·승인 branch 확인이 정식 작성보다 먼저임을 명시한다.
- [ ] 신규 정상 경로는 확인된 target에서 직접 작성·저장하도록 바꾼다.
- [ ] 기존 승인 문서가 있는 재개·대상 변경에만 안전한 전송 계약을 적용한다.
- [ ] source 보존, destination clean-base·내용·경로 이탈 확인과 부분 전송 실패의 보류 조건을 유지한다.
- [ ] 양쪽 Planner profile에 정식 작성 brief의 실제 workspace·선택/준비 증거·문서 경로와 불일치 보고 조건을 추가한다.
- [ ] 초기 brainstorming·설계 제안은 선택 전 가능하며 Planner의 읽기 전용·저장 금지·승인 요청 금지 경계를 유지한다.

### 5. GREEN, mapping 판단과 manifest 갱신

- [ ] 1단계의 신규 검사 명령을 다시 실행하여 모두 PASS임을 확인한다.
- [ ] 기존 mapped test class·method를 유지했는지 확인한다. destination이 그대로면 tests/installer-parity.json을 변경하지 않는다.
- [ ] mapping 변경이 실제 필요하면 해당 destination만 갱신한다. frozen legacy inventory, assertion 원본·개수, retirement 규칙은 변경하지 않는다.
- [ ] payload 수정이 끝나면 다음 후보 명령으로 manifest를 갱신한다.

```sh
cd /Users/yunho/Desktop/project/arc
node scripts/update-manifest.mjs
```

manifest diff는 변경된 보호 payload 해시와 일치해야 한다. 예기치 않은 추가 경로·파일 삭제는 먼저 조사한다.

### 기존 Claude 실패의 제한적 disposition

QA가 확인한 다음 두 실패만 T1 범위 밖의 기존 expectation 불일치로 분류한다.

| ID | 검사 | 불일치 |
|---|---|---|
| BL1 | ClaudePayloadTests.test_claude_agent_profiles_hold_acceptance_contracts | tests/test_claude_payload.py:299는 literal Korean을 기대하지만 claude/agents/arc-planner.md:14는 {{ARC_OUTPUT_LANGUAGE_POLICY}}를 사용 |
| BL2 | ClaudePayloadTests.test_claude_native_adapter_matches_shipped_profiles_and_scripts | tests/test_claude_payload.py:244는 arc_scouter를 기대하지만 claude/skill/SKILL.md:51는 arc-scouter를 사용 |

현재 전체 Claude 모듈의 두 실패는 QA가 실행으로 관찰했다. baseline에 같은 expectation/source 불일치가 있었다는 결론은 base HEAD의 assertion·source와 현재 diff를 비교한 source-inferred 판단이다. QA가 clean baseline checkout에서 전체 Claude 모듈을 실행했다고 표현하지 않는다. 이 disposition에 새 worktree나 baseline 테스트 실행을 요구하지 않는다.

이 disposition은 다음 조건을 모두 충족할 때만 유효하다.

1. 비교에 사용한 base의 full SHA가 접근 가능한 QA 증거에 기록되어 있다.
2. base와 현재 상태에서 문제 assertion과 대응 source literal이 동일함을 확인할 수 있다.
3. 현재 검사 대상 branch·HEAD와 미커밋 diff를 식별할 수 있다.
4. 현재 전체 Claude 모듈의 실행 출력에서 실패가 정확히 BL1·BL2임을 확인할 수 있다.
5. T1 전용 검사와 나머지 필수 검사는 모두 통과한다.
6. QA가 disposition과 AC1–AC13을 재확인한다.

제공된 QA 증거가 참조하는 HEAD는 f3514128836e684ca20ac33706026c02ee4bfe14다. 실제 base와 현재 검사 대상은 QA 기록에서 각각 명시한다. HEAD만으로 미커밋 구현 변경까지 식별했다고 간주하지 않는다.

관련 파일 전체의 비변경을 주장하지 않는다. T1이 수정한 파일 안에서도 해당 assertion과 대응 source literal이 변경되지 않았음을 확인한다. 검사 skip, expectedFailure, assertion 완화, source literal 교정 또는 parity retirement는 이 disposition에 포함되지 않는다.

### 6. 필수 QA·focused checks와 수용 증거

Coder의 RED/GREEN 기록에 더해 QA가 다음 검사를 독립적으로 수행하고 증거를 반환한다. 과제 경계 때문에 QA를 추가하는 것이 아니라 양쪽 runtime의 역할·Git·승인 계약 변경을 확인하는 범위다.

```sh
cd /Users/yunho/Desktop/project/arc
python3 -B -m unittest discover -v -s tests -p test_arc_policy.py
python3 -B -m unittest discover -v -s tests -p test_claude_payload.py
node scripts/check-installer-parity.mjs
node scripts/update-manifest.mjs --check
git diff --check
```

기대 결과:

- T1 전용 구조 검사 14개가 모두 수집·실행되고 PASS한다. QA는 다음 명령을 실행한다: cd /Users/yunho/Desktop/project/arc/tests && python3 -B -m unittest -v test_arc_policy.WorkspaceBeforeDocumentsTests test_claude_payload.WorkspaceBeforeDocumentsTests
- 전체 Codex 모듈 105개 검사가 실패·오류 없이 통과한다.
- 전체 Claude 모듈 43개 검사를 실행한다. BL1·BL2와 같은 두 expectation 실패만 보고하는 결과는 disposition 조건 충족 시 허용한다.
- Claude 모듈의 실패 exit code와 실행 결과는 그대로 기록한다. 전체 모듈이 통과했다고 보고하지 않는다.
- 추가 실패·오류·예상하지 않은 skip 또는 미실행은 T1을 보류한다.
- parity 명령은 정상 종료하고 Parity verified를 출력한다.
- manifest 검사는 정상 종료하고 90개 보호 파일의 검증 결과를 출력한다.
- git diff --check는 정상 종료하고 whitespace 오류가 없다.

BL1·BL2의 실패 형태나 실행 여부가 예상과 달라지면 자동 통과로 처리하지 않는다. 검사 대상·수집·source/assertion 변경을 확인하여 disposition의 유효성을 다시 판단한다.

추가 mapping 변경이 발생했다면 해당 mapped destination 실행 증거를 함께 제출한다. 위 두 모듈 밖 destination이 추가되는 경우 그 정확한 검사도 수용 전 실행한다.

QA 증거에는 다음을 포함한다.

- 명령·작업 경로·실행 결과.
- 비교 base의 full SHA와 확인 가능한 base source 근거.
- 현재 검사 대상 branch·HEAD와 미커밋 diff 식별 정보.
- 현재 Claude 모듈 출력과 BL1·BL2의 test ID·assertion·실패 이유.
- base와 현재의 문제 assertion 및 대응 source literal 비교.
- baseline 결론은 source-inferred, 현재 실패는 execution-observed라는 구분.
- AC1–AC13별 검사 또는 소스 근거와 판정.
- 신규 검사 수집·실행 사실.
- BL1·BL2 disposition 적용 여부와 근거.
- 미실행·환경 차단·미검증 사항.
- manifest 변경 범위와 mapping 변경 여부·사유.
- 구조 검사만으로 런타임 준수를 확인하지 않았다는 한계.

실제 worktree 생성, branch 전환 또는 문서 커밋을 테스트용으로 실행할 필요는 없다. 이번 검증 범위는 승인된 구조 정책 계약이다.

### T1 수용 기준

다음이 모두 충족되어야 한다.

1. 승인 spec AC1–AC13이 정책·profile·검사에 반영됨.
2. 두 SKILL.md와 세부 reference 사이에 순서 충돌이 없음.
3. formal drafting 전 선택·실제 준비를 요구하고 초기 제안은 허용함.
4. Codex 전용 worktree와 Claude 미지원이 유지됨.
5. 승인·커밋·인계·문서 생략·보존 규칙이 유지됨.
6. T1 전용 14개 검사, 전체 Codex 모듈, parity, manifest --check, git diff --check가 통과하고, 전체 Claude 모듈 실행 결과가 BL1·BL2의 제한적 disposition 조건을 충족한다. QA가 이를 AC1–AC13과 함께 재확인한다.
7. mapping 변경이 필요할 때만 이루어지고 최신 manifest가 검증됨.
8. BL1·BL2만 source 비교로 추적된 기존 범위 밖 실패로 기록되어 있다. 그 밖의 소유권 충돌, 실패, 부분 완료, 미검증 기준 또는 수용을 막는 finding이 없다.
9. Orchestrator가 기준·QA 결과·disposition 근거와 finding을 확인하여 T1을 명시적으로 수용한다. 검사 보고나 disposition 자체는 Orchestrator 수용을 대신하지 않는다.

### T1 보류 조건

- 승인 계획이나 Coder handoff 증거 누락.
- 실제 workspace·repository·branch·변경 상태와 brief 불일치.
- 소유권이 불명확한 변경이나 무관한 staged 파일.
- 신규 검사가 실행되지 않거나 RED 원인이 정책 차이가 아닌 환경·수집 문제.
- 승인 범위를 넘는 runtime·installer·branch 정책 변경 필요.
- frozen parity inventory 수정이 필요하다고 판단되는 경우.
- BL1·BL2를 제외한 필수 검사 실패·오류, 수집·실행 차단 또는 기준의 미검증.
- 비교 base의 full SHA, 현재 검사 상태/diff, 현재 실패 출력 또는 source 비교 증거에 접근할 수 없음.
- base와 현재 사이에서 문제 assertion 또는 대응 source literal의 변경이 확인됨.
- 현재 전체 Claude 모듈에서 두 건을 넘는 실패나 다른 실패 원인이 발생함.
- 검사 skip·assertion 완화 등 disposition 범위를 넘는 변경이 발견됨.
- QA가 disposition 또는 AC1–AC13을 확인하지 못함.
- 별도 과제가 필요할 정도의 범위 변경.

보류는 Orchestrator에게 보고하고 영향을 받는 작업을 멈춘다. unrelated 변경을 자동 정리하지 않는다.

### 7. Orchestrator 수용 후 한 번의 구현 커밋

- [ ] Orchestrator는 T1 수용 후 승인된 T1 변경만 한 focused implementation commit으로 커밋한다.
- [ ] staged 경로·내용, 메시지와 실제 결과를 확인한다.
- [ ] task ID, SHA, 검사·수용 증거와 실제 Git 상태를 canonical record에 연결한다.

커밋 메시지 후보:

```text
chore(arc): select execution workspace before formal planning
```

승인 spec·plan의 사전 docs commit과 T1 구현 커밋은 별개다. 이미 준비한 계획 문서를 T1에 중복 포함하지 않는다.

## Coder 배정 전 문서 준비

이 부분은 T1 구현 단계가 아니라 Orchestrator의 기존 인계 준비다.

1. 이 계획을 선택된 workspace에 저장·검토하고 사용자 승인을 받는다.
2. 승인 spec·plan의 실제 버전·경로·승인 증거를 확인한다.
3. 현재 선택의 유효성과 실제 Git 상태를 갱신한다.
4. 유효한 기존 문서 커밋이 없으면 두 승인 문서를 한 docs commit으로 묶는다.
5. 결과와 전체 Coder handoff gate를 확인한다.

현재 예상 문서 두 개만 승인 범위와 일치할 때의 후보 명령:

```sh
git -C /Users/yunho/Desktop/project/arc add -- docs/superpowers/specs/2026-10-19-planner-workspace-selection-before-documents-design.md docs/superpowers/plans/2026-10-19-planner-workspace-selection-before-documents.md
```

메시지 후보:

```text
docs(arc): define workspace selection before formal planning
```

staging·commit 직전에 기존 “Git mutation evidence gate”와 “Planning document commit”을 적용한다. 실제 staged diff 확인 없이 커밋하지 않는다. 이 계획 작성에서는 명령을 실행하지 않았다.

## 최종 전체 검증

T1의 필수 검사·QA·Orchestrator 수용과 구현 커밋 후 수행한다.

- 단일 독립 Reviewer가 최종 전체 변경을 읽고 두 runtime의 순서, 역할 경계, 단계별 Git 조건, 재사용·변경·전송 예외, BL1·BL2 disposition 근거와 검사 누락을 검토한다.
- baseline 결론을 실행 관찰로 과장하지 않았는지, 예외가 T1 회귀를 가리지 않는지 확인한다.
- Reviewer는 과제별 수용 선행 조건으로 두지 않는다.
- 최종 branch·HEAD·커밋 경로·남은 변경 상태와 manifest 증거를 확인한다.
- 새 수정·실패·무효화된 증거가 없으면 이미 통과한 전체 검사를 반복하거나 unrelated 설치 검사로 확대하지 않는다.
- finding 수정이 필요하면 Orchestrator가 범위와 교정 절차를 정하고 영향받은 경로를 재검증한다. 수용된 T1 커밋을 자동 amend하지 않는다.
- 구조 계약 검증과 실제 소비 agent 준수의 한계를 최종 보고에 구분한다.

## 가정과 열린 결정

- 승인된 spec은 Codex·Claude 공통 계약 변경을 포함한다.
- 두 최상위 SKILL.md와 manifest는 확인된 소스 근거에 따른 필수 동기화 범위다.
- 기존 test 식별자를 유지하므로 parity metadata 수정은 기본적으로 불필요하다.
- 새 검사 이름은 두 파일에 동일하게 추가하며 별도 helper 모듈은 만들지 않는다.
- 구현 단계의 실제 Git 상태와 문서 커밋 SHA는 Orchestrator가 갱신한다.
- T1의 BL1·BL2 disposition plan은 별도 승인되었고 T1은 수용·커밋되었다. 이 T2 follow-up plan은 별도 사용자 승인을 기다리며, 승인 전 T2 Coder 배정과 구현 커밋은 보류한다.
- 소스·테스트 assertion 수정 권한은 추가되지 않았다. 새로운 범위 요구가 발견되면 Orchestrator로 되돌린다.

## Planner self-review

- Spec coverage: AC1–AC13을 T1의 정책·profile·검사와 수용 기준에 연결했습니다. 두 runtime 요약의 역순 조건도 포함했습니다.
- 과제 경계: 공통 계약인 정책·profile·검사·manifest를 한 과제로 묶었습니다. 하위 체크박스는 별도 커밋 단위가 아닙니다.
- 구체성: 담당 파일, 기존 수정 검사, 신규 class·method, 정상 순서 표식, 명령과 성공 기준을 지정했습니다.
- 검증 구분: Coder RED/GREEN, 수용 전 QA, Orchestrator 수용·구현 커밋, 이후 단일 전체 Reviewer 검토를 구분했습니다.
- Parity: frozen inventory와 coverage mapping을 구분하고 무조건적인 metadata 변경을 피했습니다.
- 실행 제한: 계획 초안만 반환했습니다. 파일 저장·수정, 검사·manifest 갱신·Git 명령 실행, Coder 시작은 하지 않았습니다.
- 남은 차단 결정: 없습니다. 계획 승인과 실행 준비는 Orchestrator가 조율해야 합니다.

## T1 disposition record — baseline disposition approved

T1의 baseline disposition 승인 기록은 통합 문서 커밋 `1a1867a7cbdf54302163095ac0b4d4415a07e9cc`에 포함되어 있다. QA 증거의 HEAD `f3514128836e684ca20ac33706026c02ee4bfe14`는 실제 QA 수행 당시의 참조이므로 유지한다. 현재 수용된 T1 구현 커밋이자 T2의 선행 커밋은 `43277ce6bbf15899ae1934163df9ca622f20b956`이다.

T1은 AC1–AC13의 정책 구조 기준, QA 및 Orchestrator 수용을 완료했고 commit 43277ce6bbf15899ae1934163df9ca622f20b956로 구현 변경을 기록했다. BL1/BL2는 승인된 조건 아래 범위 밖 source-inferred baseline expectation mismatch로 disposition됐다. 전체 Claude module은 두 실패로 종료된 상태를 정확히 보고한다.

## Planner self-review of amendment

- 두 failure를 정확한 expectation/source literal 쌍으로 한정했다.
- baseline source 비교를 source-inferred로, 현재 suite 결과를 execution-observed로 구분했다.
- 전체 Claude run 실패 결과를 보존하고 추가 실패를 T1 hold로 남겼다.
- AC1–AC13, 구현 범위, commit 단위를 유지했다.
- Reviewer timing을 기존 Coder → QA → Orchestrator 수용·commit → Reviewer 흐름으로 유지했다.
- 수정 plan approval 전에는 disposition·수용·구현 commit이 진행되지 않는다고 명시했다.
- 두 test assertion이나 source literal 수정은 추가하지 않았다.

## T2 — 실행 대상 선택 전 예정 문서 정보 제시 보완 (계획 승인 대기)

기존 계획에 추가하는 AC3 후속 과제 초안이다. T1은 이미 수용·커밋되었고, 그 commit을 수정하지 않는다. 이 T2 계획은 별도로 사용자 승인을 받아야 한다.

### 목표와 Reviewer finding

승인 spec §6 및 AC3에 따라 모든 지원 실행 대상 선택 전에 예정 문서 정보를 사용자에게 제시하도록 명시한다.

Reviewer가 확인한 P2는 source-inferred이며 실제 agent 실행에서 관찰된 finding은 아니다. Codex와 Claude의 handoff-prep은 예정 문서 범위를 내부에 기록하도록 하지만 current checkout/new branch 선택에서는 사용자에게 보여주도록 요구하지 않는다. Codex managed worktree 선택지만 별도 planned-scope 문구가 있다.

- Codex handoff-prep: selection gate lines 11–17.
- Claude handoff-prep: selection gate lines 8–14.
- 기존 구조 검사는 tests/test_arc_policy.py:1335 및 tests/test_claude_payload.py:507 부근에서 문자열 존재만 확인해 일반 선택지 제시를 보장하지 않는다.

이 finding은 기존 AC3을 빠짐없이 구현하는 수정이므로 새 spec이 필요하지 않다.

### 선행 과제와 실행 대상

- 선행 과제 T1: accepted commit 43277ce6bbf15899ae1934163df9ca622f20b956.
- workspace/repository: /Users/yunho/Desktop/project/arc.
- selected branch: chore/planner-workspace-before-documents.
- 기준 시점의 HEAD: 43277ce6bbf15899ae1934163df9ca622f20b956; 작업 트리는 clean.
- 범위·workspace·repository·target이 바뀌지 않으면 사용자의 기존 명시적 선택을 재사용한다. 실제 Git 상태와 ownership은 handoff 전에 다시 확인한다.
- 새 workspace나 branch를 만들거나 전환하지 않는다.

이 T2 계획의 개별 승인은 Coder 배정 전 필요하다. 승인 뒤 fresh Coder와 fresh QA를 사용한다. T2 plan/version, ownership과 dependency readiness를 canonical record에 추가한다.

### 담당 파일

아래 경로는 모두 /Users/yunho/Desktop/project/arc/ 기준이다.

| 파일 | 변경 |
|---|---|
| codex/skill/references/handoff-prep.md | 모든 지원 선택지에 대한 공통 user-facing planned-doc block |
| claude/skill/references/handoff-prep.md | current checkout/new branch 선택 전에 예정 문서를 사용자에게 제시 |
| tests/test_arc_policy.py | Codex common block 구조 검사 보강 |
| tests/test_claude_payload.py | Claude request gate 구조 검사 보강 |
| MANIFEST.sha256 | 두 보호 payload 변경의 hash 갱신 |

다른 policy/profile/runtime 파일, 범위 밖 검사, tests/installer-parity.json 및 BL1/BL2 assertion/source literal은 수정하지 않는다. 새로운 API나 helper module을 만들지 않는다.

### T2 구현 단계

#### 1. 선택 요청 구조 검사의 RED

두 기존 WorkspaceBeforeDocumentsTests.test_choice_request_uses_planned_documents_and_verified_target 검사를 강화한다.

- 양쪽 테스트는 Execution-target request gate부터 다음 Git mutation evidence gate 바로 전까지 텍스트를 분리한다.
- Codex는 이 request gate에서 when offering the new managed worktree option 앞의 공통 제시 블록만 검사한다.
- Claude는 request gate 전체를 common block으로 검사한다. Claude test는 managed-worktree marker를 요구하거나 분할자로 사용하지 않는다.
- 두 테스트는 common block 안의 present to the user subsection에 planned-document 목록과 verified target 정보를 요구한다.
- subsection은 explicit choice instruction보다 앞에 있어야 한다.
- 내부 기록 문구나 Codex의 worktree 전용 문구만 있어서는 통과하지 않는다.

공통 정책 문구:

```text
For every supported execution-target option, before obtaining the user's
choice, present to the user:
```

그 아래 사용자에게 보여줄 목록:

- planned document list.
- 문서별 scope와 coverage.
- repository-relative expected paths.
- dependencies와 order.
- 아직 writing/approval을 기다리는 pending 상태.
- verified absolute workspace, repository, current branch/detached HEAD와 base HEAD.
- 새 branch candidate와 충돌 상태(선택지로 제시할 때).
- staged/unstaged/untracked changes, preservation, edit ownership.

이 블록 뒤에 Obtain explicit choice 지시가 있어야 한다. Existing managed-worktree paragraph continues to provide Codex-specific source/repository/common-directory/base/branch/name information; app-determined actual destination path stays unchanged.

테스트 helper 요점:

```python
text = self.text("handoff-prep")
request_heading = "### execution-target request gate"
mutation_heading = "### git mutation evidence gate"
self.assertIn(request_heading, text)
self.assertIn(mutation_heading, text)
gate = text.split(request_heading, 1)[1].split(mutation_heading, 1)[0]
# In the Codex test, exclude only the worktree-specific subsection:
marker = "when offering the new managed worktree option"
self.assertIn(marker, gate)
common = gate.split(marker, 1)[0]

# In the Claude test, the whole request gate is the common block:
common = gate

self.assertIn(
    "for every supported execution-target option, before obtaining the user's choice, "
    "present to the user:",
    common,
)
presentation = common.split("present to the user:", 1)[1].split(
    "obtain explicit choice", 1
)[0]
for phrase in (
    "planned document list",
    "scope and coverage",
    "repository-relative expected paths",
    "dependencies and order",
    "pending writing and approval status",
    "verified absolute workspace",
    "current branch or detached head",
    "base head",
    "staged/unstaged/untracked changes",
    "preservation and edit ownership",
):
    self.assertIn(phrase, presentation)
self.assertIn("does not require completed documents or individual approvals", gate)
```

- [ ] 실행 전에 current tests가 이 프롬프트 제시 조건을 보장하지 않는지를 확인한다.

Focused command:

```sh
cd /Users/yunho/Desktop/project/arc/tests
python3 -B -m unittest -v test_arc_policy.WorkspaceBeforeDocumentsTests.test_choice_request_uses_planned_documents_and_verified_target test_claude_payload.WorkspaceBeforeDocumentsTests.test_choice_request_uses_planned_documents_and_verified_target
```

유효한 RED는 두 선택 gate의 user-facing planned-doc block 누락 assertion이다. 수집/import 오류는 유효한 RED가 아니다.

#### 2. 양쪽 handoff-prep gate 수정과 GREEN

- [ ] Codex와 Claude의 execution-target request gate에 모든 지원 선택지 전에 예정 문서 정보를 사용자에게 제시하도록 명시한다.
- [ ] 문서 목록·scope/coverage·repository-relative 예상 경로·dependency/order·pending status를 common presentation block에 넣는다.
- [ ] verified target inputs를 같은 block에서 계속 제시한다.
- [ ] 내부 확인·기록 의무와 문서 미완성/미승인만으로 choice를 막지 않는 규칙을 보존한다.
- [ ] 현재 checkout·new branch 양쪽에 공통 block을 적용한다. Codex worktree는 그 아래에서 기존 source/base/branch/name details를 유지한다.
- [ ] Claude의 managed-worktree 미지원과 app-determined path rules를 유지한다.
- [ ] 두 focused tests를 다시 실행해 PASS를 확인한다.

#### 3. Manifest 갱신

- [ ] 두 T2 policy 파일의 보호 payload hash가 바뀐 뒤 manifest를 갱신한다.

후보 명령:

```sh
cd /Users/yunho/Desktop/project/arc
node scripts/update-manifest.mjs
```

예상 변경은 두 handoff-prep policy hashes다. 추가 경로나 삭제가 보이면 멈추고 조사한다.

### 필수 QA와 BL1/BL2 disposition

Fresh QA는 T2 focused tests와 다음 명령을 실행한다.

```sh
cd /Users/yunho/Desktop/project/arc
python3 -B -m unittest discover -v -s tests -p test_arc_policy.py
python3 -B -m unittest discover -v -s tests -p test_claude_payload.py
node scripts/check-installer-parity.mjs
node scripts/update-manifest.mjs --check
git diff --check
```

기대 결과:

- T2 focused tests PASS; existing 14 T1 structural tests PASS.
- 전체 Codex module PASS.
- 전체 Claude module 실행. 기존 BL1/BL2만 approved disposition에 따라 남을 수 있고 추가 실패/오류는 보류.
- parity, manifest --check, diff check PASS.
- test method names와 mapping은 유지한다. tests/installer-parity.json을 수정하지 않는다.

기존 BL1/BL2 disposition은 별도 승인된 plan section에 따른다. QA는 canonical record의 baseline source comparison 증거를 연결하고 T2가 그 test assertions/source literals를 변경하지 않았음을 확인한다. Baseline 결론은 source-inferred, 현재 full-suite failures는 execution-observed로 보고하며, Claude module을 PASS라고 하지 않는다.

QA evidence에는 다음을 남긴다.

- branch/HEAD/current diff와 T1 predecessor commit.
- 두 focused checks와 두 full module results.
- prompt block의 정확한 common-request-gate 범위와 assertion.
- Codex에서 worktree-only 문구가 common assertion 범위에서 제외된 근거.
- user-facing planned-doc list와 verified-target list를 같은 pre-choice block에서 검사한 증거.
- BL1/BL2 disposition과 추가 failure 부재.
- manifest, parity, whitespace checks.
- AC3에 대한 판정 및 기존 T1 AC1–AC13 regression 결과.

### T2 수용 기준

1. 양쪽 common request gate가 모든 지원 선택지에 대해 선택 전에 사용자 제시를 요구한다.
2. 사용자 제시 블록에 문서 list, scope/coverage, repository-relative path, dependency/order, pending status가 있다.
3. 같은 블록에 verified target inputs가 계속 제시된다.
4. 검사는 internal recording이나 Codex worktree-only paragraph만으로 통과하지 않는다.
5. 두 T2 focused tests, full Codex module, parity, manifest check와 diff check가 통과한다.
6. Full Claude module 결과는 approved BL1/BL2 disposition만 포함한다. 추가 failure는 보류다.
7. T1의 나머지 AC1–AC13, role/approval/handoff contracts, target/worktree rules가 유지된다.
8. QA evidence와 finding을 확인한 Orchestrator가 T2를 수용한다.

### T2 보류 조건

- T2 plan approval, accepted T1 predecessor commit, current branch/target evidence, handoff record 누락.
- 실제 작업 공간·branch·ownership·Git 상태 불일치.
- 사용자 제시 정보가 내부 기록 또는 worktree 전용 문단에만 존재.
- 필요한 검사 실패·미실행·environment block.
- BL1·BL2 외 추가 실패 또는 해당 assertion/source 변경.
- 예상하지 않은 manifest diff, parity inventory 변경, five-file scope expansion.
- unclear ownership, unrelated staged files, unexpected branch/HEAD, partial failure.

문제 해결을 위해 T1을 amend하거나 BL1/BL2를 임의 수정하지 않는다.

### T2 수용·커밋과 Reviewer 재확인

Fresh QA 통과 후 Orchestrator가 T2를 수용하고 T2 담당 다섯 파일만 별도 focused commit으로 만든다.

Korean commit message candidate:

```text
fix(arc): 사용자 선택 전에 예정 문서 제시
```

T2 stage paths/content, commit SHA/message, final branch/HEAD/status를 검증해 canonical record에 기록한다. T1 commit 43277ce6bbf15899ae1934163df9ca622f20b956는 변경하지 않는다.

T2 commit 뒤 기존 independent Reviewer에게 P2와 AC3 user-facing selection path만 재확인 요청한다. 전체 review를 반복하지 않는다. P2 resolution, QA, targeted Reviewer, final clean Git verification 전에는 overall completion을 선언하지 않는다.

### T2 self-review

- T2는 승인 spec AC3와 Reviewer finding만 해결한다; T1은 수용·커밋 상태로 보존한다.
- 두 runtime의 common request gate를 검사하고 Claude에서 worktree 분기자를 요구하지 않는다.
- 문서 정보가 사용자에게 실제로 제시되어야 검사 통과하도록 했다.
- repository-relative planned paths와 verified absolute target, app-determined worktree path 규칙을 구분했다.
- 기존 baseline failures, target choice reuse, branch/worktree safety와 T1 contracts는 그대로 유지한다.
- New spec, runtime API, unrelated test cleanup, parity inventory change는 필요 없다.
- No file was saved or edited. A separate user plan approval is required before T2 Coder assignment.
