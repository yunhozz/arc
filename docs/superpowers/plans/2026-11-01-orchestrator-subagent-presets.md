# 설정된 Orchestrator 서브에이전트 통합 구현 계획

> **에이전트 작업자 안내:** 이 계획은 ARC 역할 분리, 승인, QA, acceptance, commit 계약에 따라 수행한다. 체크박스는 진행 추적용이며 별도 commit 경계가 아니다.

**목표:** Codex와 Claude Code에서 사용자가 설정한 **arc_orchestrator**가 실질적인 ARC 작업을 조정하도록 연결하고, 세 preset·Custom·정책·legacy update·TUI·capacity를 일관되게 반영한다.

**구조:** 대화 host/root는 사용자 소통과 질문·승인 relay를 담당한다. 선택된 preset/Custom으로 설정된 native **arc_orchestrator**는 ARC depth 1에서 전문가 생성·조정, 검증, acceptance 및 허용된 local Git 변경을 소유한다. 다섯 specialist는 depth 2에서 배정된 범위만 수행한다.

**계획 기준:** 승인된 설계 문서인 [Orchestrator 서브에이전트 설계](../specs/2026-11-01-orchestrator-subagent-presets-design.md)

**계획 개정:** v3 승인 (2026-11-01, 사용자 승인 `codex-question:call_6b3db69c9b3e4b36a01a2e07300ae4d5:answer`). v2의 TDD/full-suite 범위로 첫 통합 검증을 수행한 결과, full Node suite가 계획에서 제외한 PTY 키 입력 테스트를 실행하고, 저장소 HEAD에도 다수의 Python 문서-contract test가 이미 실패하는 baseline 충돌이 확인되었다. feature 때문에 갱신해야 하는 기존 Node test 두 개와 TUI PTY test도 기존 78-path assignment 밖이다. 승인된 v3는 test scope를 81개 경로로 확장하고 PTY 검증을 명시하며, 증명된 baseline method만 예외로 처리하는 비교 acceptance를 정의한다. v1/v2 계획은 최초 planning-document commit의 reflog 이력에 보존되며, 승인된 v3 내용으로 문서 전용 commit을 갱신했다.

**대상:** /Users/yunho/.codex/worktrees/arc-orchestrator-subagent-presets/arc
**브랜치/코드 기준:** feat/orchestrator-subagent-presets / 8c88952e9c0178fdb07ad521a51b6620e08503ea

## 준비 및 소유권

- 구현 대상은 위 관리 워크트리다. /Users/yunho/Desktop/project/arc 원본 checkout은 수정하지 않는다.
- 계획 승인 전에는 source 구현을 시작하지 않는다.
- 계획 승인을 받은 뒤 Orchestrator가 승인된 spec과 plan을 문서 전용 commit으로 저장하고, ARC 역할 handoff를 확인한 후 Implementer에 구현을 맡긴다. v2 구현의 파일은 아직 unstaged이며 T1 acceptance는 보류 상태다. v3 승인 후 fresh Implementer가 같은 T1의 수정 내용을 이어받는다.
- Implementer는 승인된 T1 파일 범위만 수정하고 stage/commit하지 않는다. Orchestrator가 조정·acceptance를 맡고, fresh QA는 계획에 적힌 테스트와 static QA를 수행한다. 마지막에는 독립 Reviewer가 전체 diff를 검토한다.
- 첫 Implementer는 TDD 조건 충돌을 보고하고 수정 전 종료했다. 이후 승인된 v2에서 T1 구현이 시작됐으며, 현재 구현 변경은 unstaged/uncommitted다. v1 문서 commit **c361e59**는 v2와 승인된 v3에 맞춰 같은 문서 전용 commit에서 갱신됐다. fresh Implementer가 현재 T1 diff를 이어받는다.

## 고정 요구사항 및 제한

- Codex **arc_orchestrator**: 세 preset 모두 **gpt-6-luna**, **model_reasoning_effort = "max"**.
- Claude Code **arc_orchestrator**: 세 preset 모두 **claude-haiku-5-5**, **effort = "max"**.
- 기존 다섯 specialist의 preset과 Custom 값은 보존한다.
- Custom에서 Orchestrator를 기존 역할처럼 선택·편집·저장·복원할 수 있다.
- 중앙 preview에는 선택된 **arc_orchestrator**와 설정된 model/effort를 표시하고, Custom focus와 role key를 일치시킨다.
- 신규 설치와 미설정 TUI 기본값은 total **100**, concurrent **10**. 기존 설치의 유효한 explicit limits 값은 보존하며 자동 상향하지 않는다.
- host는 ARC tree 밖이다. 실행 중인 coordinator는 descendants와 함께 total 및 active ledger에 포함된다. 기본 concurrent **10**에서 specialist에 남는 slot은 최대 9개다.
- host는 사용자 질문과 유효한 승인을 relay한다. coordinator가 전문가 호출·검증·acceptance를 맡는다. specialist는 재위임과 Git mutation을 할 수 없다.
- Claude native profile에는 nested delegation을 위한 **Agent** 도구가 필요하다. Codex **[agents].max_depth**는 V1 전용이며 V2 보장으로 다루지 않고 값을 변경하지 않는다. native nesting 제약으로 진행할 수 없으면 중단·보고한다.
- 각 behavior change는 ARC TDD를 따른다: test를 먼저 작성하고 focused test의 의도한 실패(RED)를 확인한 뒤 구현하고 focused test를 통과(GREEN)시킨다. 모든 변경 후 전체 Node 및 Python suite를 실행한다. 새 test case와 필요한 기존 fixture/expectation 변경이 허용되며, 새 test framework/dependency는 추가하지 않는다.
- provider 호출, 실제 설치/업데이트, native nested delegation은 실행 검증하지 않는다. 승인된 v3 범위에서는 **전체 `npm test`가 포함하는 기존 PTY 자동 키 입력 검사만** 허용한다. 수동 TUI 조작이나 실제 설치·update는 허용하지 않는다.

## 단일 구현 작업 T1: 여섯 역할 설정·정책·migration·UI 연결

### 한 작업으로 묶는 이유

모델 schema, native profiles, policy 생성, 설치·업데이트, legacy 인식, TUI가 동일한 여섯 역할 계약을 공유한다. 일부만 변경하면 기존 설정의 profile 검증, migration, policy 또는 저장 경로가 불일치하므로 하나의 top-level task로 구현하고 한 번에 acceptance한다.

### 파일 소유 범위

모든 경로는 위 workspace 기준이다.

| 책임 | 파일 |
|---|---|
| 역할 집합·schema·정규화·model API | **lib/models/config.mjs**, **lib/models/index.mjs**, **lib/models/profiles.mjs** |
| Python model schema와 적용 | **codex/skill/scripts/model_config.py**, **claude/skill/scripts/model_config.py**, **codex/skill/scripts/apply-models.py**; **claude/skill/scripts/apply-models.py**는 위임/오류 전달 경로를 확인하고 필수 수정일 때만 변경 |
| Canonical 설정 및 native profiles | **codex/skill/models.toml**, **claude/skill/models.toml**, **codex/agents/arc-orchestrator.toml**, **claude/agents/arc-orchestrator.md** |
| Canonical policy·생성 규칙 | **lib/policy/role-policy.json**, **lib/policy/render.mjs** |
| 설치·preset·migration·profile 요구 | **lib/installer/targets.mjs**, **lib/installer/manifest.mjs**, **lib/installer/plan.mjs**, **lib/installer/preset.mjs**, **lib/installer/upgrade-state.mjs**, **lib/installer/upgrade.mjs** |
| Verified defaults 호출 경로 | **lib/management/status.mjs**, **lib/management/operations.mjs**, **lib/management/update.mjs**, **lib/npm/upgrade.mjs** |
| Custom/preview/limits | **lib/tui/custom-preset.mjs**, **lib/tui/setup.mjs**, **lib/limits.mjs** |
| TDD behavior tests와 기존 expectations | **tests/node/models.test.mjs**, **tests/node/management-status.test.mjs**, **tests/node/management-operations.test.mjs**, **tests/node/management-update.test.mjs**, **tests/node/upgrade-state.test.mjs**, **tests/node/upgrade-harness.test.mjs**, **tests/node/preset.test.mjs**, **tests/node/plan.test.mjs**, **tests/node/manifest.test.mjs**, **tests/node/profile-render.test.mjs**, **tests/node/limits.test.mjs**, **tests/node/tui-custom-preset.test.mjs**, **tests/node/tui-setup.test.mjs**, **tests/node/tui-app.test.mjs**, **tests/node/role-policy.test.mjs**, **tests/node/targets.test.mjs** *(v3 추가 제안)*, **tests/node/model-catalog.test.mjs** *(v3 추가 제안)*, **tests/node/tui-app-pty.test.mjs** *(v3 추가 제안)*, **tests/test_codex_models.py**, **tests/test_claude_payload.py**, **tests/test_arc_policy.py**, **tests/test_harness_contract.py**, **tests/node/fixtures/instruction-contracts.json** |
| 사용자 routing·운영 문서 | **README.md**, 두 플랫폼 **skill/SKILL.md**, 각 플랫폼 **references/coordination.md**, **references/limits.md**, **references/handoff.md**, **docs/harness-operation.md**, **docs/images/role-flow.svg** |
| Generated policy/runtime/package integrity | 두 플랫폼의 generated **skill/SKILL.md**, 여섯 native profiles, 양 플랫폼 **references/{coordination,planning,handoff,handoff-prep,commit,verification}.md**, **codex/skill/runtime/role-policy.json**, **claude/skill/runtime/role-policy.json**, **MANIFEST.sha256** |

위 test 파일에서 C1–C12의 behavior를 검증할 focused case를 TDD 순서로 추가/수정한다. legacy five-role fixture는 legacy 사례로 유지한다. 별도 근거 없이 **tests/installer-parity.json**은 변경하지 않는다. 계획 범위 밖 파일, 새 framework/dependency, lifecycle 변경이 필요하다고 드러나면 해당 수정 전에 Orchestrator에 경로와 근거를 반환한다.

Implementer는 `/Users/yunho/.codex/skills/arc/references/test-driven-development.md`를 따라 test 작성 → 실패 확인 → 최소 구현 → 통과 확인을 각 behavior change마다 반복한다. 실패가 예상된 기능 부재가 아니라 잘못된 fixture나 test 오류라면 이를 고친 뒤 정확한 RED를 확인한다. 구현 후에는 아래 전체 suite를 모두 실행한다.

~~~sh
PYTHONDONTWRITEBYTECODE=1 npm test
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_*.py'
~~~

각 test 결과와 명령을 보고에 기록한다. 기존 baseline 실패가 있으면 첫 실패의 명령·결과·근거를 보존하고, 영향을 분류해 관련 acceptance를 hold한다.

### 구현 순서

- [ ] **1. 여섯 역할 schema와 canonical model 설정을 연결한다.**

  **arc_orchestrator**를 기존 다섯 역할의 상대 순서를 유지하는 여섯 번째 key로 추가한다. v3 schema의 role/preset/Custom 집합을 검증하고 serializer는 v3를 출력한다. 두 플랫폼의 **models.toml**은 Orchestrator 세 preset에 지정된 정확한 model ID와 **max** effort를 사용하며 기존 역할 값은 유지한다.

  JS loader는 v1/v2 five-role 파일을 먼저 엄격히 검증한 뒤 내부 v3 config로 정규화한다. 기존 다섯 역할의 모든 preset 및 Custom을 보존하고, 새 Orchestrator preset은 해당 실행 버전의 **verified canonical payload**에서 채운다. 신규 Orchestrator Custom은 승인 spec의 canonical balanced 값을 사용한다. 합법적인 완전한 six-role legacy 입력은 Orchestrator 값까지 보존한다. 누락·unknown role·부분 Orchestrator·불일치 Custom은 자동 복구하지 않는다.

  원본 role shape와 legacy provenance를 serializer가 출력하는 config와 분리해 보존한다. canonical 값을 별도 하드코딩 상수로 복제하지 않는다.

- [ ] **2. Native profile과 양 플랫폼 Python 적용 경계를 연결한다.**

  신규 Codex/Claude profile은 기존 플랫폼 파일 형식, balanced canonical model/effort, 수동 coordinator 안내, managed block marker를 따른다. policy 본문을 수동 복제하지 않는다.

  두 **model_config.py**의 role/file registry, strict v3 validation, renderer/tool 검증을 여섯 역할로 맞춘다. Claude coordinator 도구는 **Read**, **Grep**, **Glob**, **Bash**, **Write**, **Edit**, **Agent**를 허용한다. Codex **apply-models.py**는 profile 부재를 첫 파일 쓰기 전에 **Install / Update first**로 거부하고, 과거 five-profile 고정 출력을 갱신한다. Claude **apply-models.py**는 thin wrapper이므로 위임 경로가 이 계약을 이미 만족하는지 확인하고 필요할 때만 수정한다. Python apply는 v3 six-role만 적용하고 legacy migration 책임을 맡지 않는다.

- [ ] **3. Canonical policy 및 generated coordinator policy를 연결한다.**

  기존 **role.orchestrator-boundary**를 기반으로 host 사용자 승인 relay와 coordinator의 specialist 생성·검증·acceptance·허용된 local Git 소유권을 명시한다. 기존 Planner 최초 작성, 승인, QA/Reviewer, scope 및 specialist 제한을 보존한다.

  **lib/policy/render.mjs**에서 native profile policy 대상을 Orchestrator를 포함한 여섯 역할로 확장한다. 양 플랫폼 신규 profile에 coordinator policy block을 생성한다. 기존 24개 target에서 총 26개가 되는지 generator 결과로 확인한다. 불필요한 schema·projection 변경은 추가하지 않는다.

- [ ] **4. Verified canonical defaults를 management 호출자에서 전달한다.**

  **collectStatus(context)**는 호출당 **verifyPayload(context)**를 한 번 수행하고 그 결과의 양 플랫폼 **modelInputs**를 공유해 상태 조회 시 legacy defaults를 정규화한다. 반복 status 호출 간 영속 cache는 추가하지 않는다.

  **prepareOperation**은 install처럼 preset 작업에서도 verified payload를 한 번 확보해 **buildPresetPlan**으로 전달한다. uninstall은 기존대로 불필요한 payload 검증 없이 동작한다.

  **update.mjs**와 **npm/upgrade.mjs**의 각 **collectInstalledState** 호출에 실제 실행 package root를 전달한다. 각 state 수집은 **safeFs**와 해당 root를 이용해 verified payload를 확보하고 그 model inputs로 legacy defaults를 정규화한다. package upgrade 전후 재확인도 같은 검증 및 legacy raw-shape 판정을 사용한다. 최종 upgrade plan의 신규 role 값은 선택된 verified payload에서 가져온다. defaults를 확보할 수 없으면 쓰기 전 중단하며, 설치된 legacy 파일·packageRoot의 미검증 파일·하드코딩 값으로 대체하지 않는다.

- [ ] **5. Legacy 설치 인식, update 보존 및 state token 호환을 연결한다.**

  신규 profile은 설치 manifest와 필요한 profile 목록에 포함한다. 유효한 five-role config와 기존 다섯 profile이 있고 Orchestrator profile만 없는 설치는 legacy로 인식한다. 기존 profile 손상 및 six-role config의 신규 profile 누락은 incomplete/error로 유지한다.

  Version Upgrade 및 Install / Update는 기존 다섯 역할의 모든 preset/Custom을 보존하고 신규 profile과 v3 config를 적용한다. legacy provenance에 따라 신규 Orchestrator 값은 선택된 verified payload를 사용한다. preview와 최종 plan은 같은 defaults/선택 규칙을 공유하되, 최종 적용은 실제 transaction snapshot을 다시 사용한다. 사용자의 preset 선택과 명시적 Custom 편집은 반영하고 기존 역할의 비활성 preset/Custom을 초기화하지 않는다.

  **Upgrade state token:** 정상 legacy의 신규 profile 부재 경로를 추가 관측했다는 이유만으로 기존 CLI와 새 upgrade child의 token이 달라지지 않아야 한다. token은 기존 관측 집합과 호환되게 계산하되 신규 profile 부재는 transaction snapshot에 보존한다. profile 생성이나 기존 config 변경은 재확인에 감지되어야 한다. 정규화된 기본값을 token에 포함해 package 버전 차이가 설치 변경처럼 보이게 하지 않는다.

- [ ] **6. Preset/Custom 저장 경계를 안전하게 유지한다.**

  신규 profile이 없는 정상 legacy 설치에서 Change Preset 및 Custom 저장은 쓰기 전에 **Install / Update first**로 거부한다. preset 경로에서 설치 lifecycle을 수행하지 않는다. 여섯 profile이 모두 있는 legacy config는 기존 transaction에서 v3로 저장할 수 있다. 이미 선택한 preset과 같더라도 migration 필요 여부를 확인해 write를 잘못 생략하지 않는다.

  기존 snapshot, identity, symlink, managed path, rollback 보호를 유지한다.

- [ ] **7. Custom editor와 중앙 preset preview를 여섯 역할에 맞춘다.**

  Custom 목록·편집·Done/Back·persist/reload 경로에 **arc_orchestrator**를 포함한다. 기존 model catalog와 unavailable 처리 방식을 유지한다.

  **setup.mjs** 중앙 항목을 host의 대화 모델 대신 선택된 coordinator 역할·model·effort로 표시한다. 전문가 배치는 유지한다. role key 기반으로 중앙·전문가·Done/Back focus를 매핑해 고정 five-role index를 제거한다. 긴 ID와 좁은 화면은 기존 compact/폭/크기 안내 경로로 처리한다.

- [ ] **8. Routing, capacity defaults 및 사용자 문서를 일치시킨다.**

  양 플랫폼 SKILL은 실질 ARC 작업을 설정된 coordinator에 자동 전달하게 한다. host는 specialist를 직접 호출하지 않고 질문·승인을 relay한다. 필수 native 호출을 사용할 수 없으면 fallback 없이 중단·보고한다.

  **lib/limits.mjs**의 concurrent fallback과 **setup.mjs**의 미설정 fallback을 **10**으로 변경하고 total **100**을 유지한다. **overrides → existing → fallback** 우선순위 및 유효한 기존 explicit 값을 보존한다. coordinator는 total/active ledger에 포함되고, 필수 coordinator와 specialist 동시 생성에는 최소 두 active slot이 필요하다. 부족하면 자동으로 한도를 올리거나 host가 역할을 대신하지 말고 생성 전에 보류한다.

  README, 양 플랫폼 SKILL/reference, operation guide와 **role-flow.svg**를 host → configured coordinator → specialists 흐름에 맞춘다. 기존 “current conversation model”과 “five roles” 문구는 새로운 경계와 전체 여섯 역할에 맞게 수정한다. Codex **max_depth** V1/V2 한계와 native nesting 제약을 정확히 설명한다.

- [ ] **9. 기존 기대 데이터와 generated assets를 동기화한다.**

  위 파일 범위에서 역할 schema, verified defaults migration, preset write 경계, Custom/preview focus, policy target 및 limits behavior를 검증하는 focused test를 먼저 추가/수정하고 RED/GREEN TDD cycle을 완료한다. 기존 expectation/fixture도 변경 계약에 맞게 수정하되 legacy five-role fixture는 보존한다. 새 framework/dependency는 추가하지 않는다.

  canonical source와 수동 profile/docs marker 변경이 끝난 뒤 다음 기존 generator를 순서대로 실행한다.

  ~~~sh
  node scripts/update-role-policy.mjs
  node scripts/update-runtime-assets.mjs
  node scripts/update-manifest.mjs
  ~~~

  policy blocks와 26개 target, 양 runtime policy mirror, 최종 manifest를 갱신한다. 예상 밖 runtime module 변경 또는 승인 범위 밖 generated 결과가 나오면 중단해 Orchestrator에 반환한다.

### 승인된 v3: 전체-suite 범위와 baseline 비교

- v2 범위에서 첫 full run은 구현·기대값 통합이 끝나기 전에 시작되어 최종 acceptance 근거가 아니다. 결과는 Node 1,221 tests (1,110 pass, 99 fail, 12 skipped), Python 245 tests (567 failures, 9 errors)였다. 정확한 로그와 분류 상태는 ARC handoff record를 따른다.
- `npm test`에는 기존 PTY 키 입력이 포함되어 v2의 “TUI 키 입력 미실행”과 동시 만족할 수 없다. 승인된 v3는 full suite와 그 PTY 자동 검사 실행을 명시적으로 허용한다.
- 새 6-profile target, provenance 없는 다섯-role Custom test, 새 TUI coordinator focus 검증에 필요한 **tests/node/targets.test.mjs**, **tests/node/model-catalog.test.mjs**, **tests/node/tui-app-pty.test.mjs**를 승인된 T1 test scope에 추가한다. 수정 전 각 test에 focused RED를 관찰하고 GREEN 후 full suite를 실행한다.
- HEAD의 문서 내용을 in-memory로 읽어 method 단위 비교한 결과 `tests/test_arc_policy.py` 73개와 `tests/test_harness_contract.py` 30개의 pure policy/document method가 baseline에서도 실패했다. 이 목록은 전체 baseline checkout 실행 또는 subtest별 일치 증거가 아니며, exact method IDs와 한계는 ARC handoff record에 기록한다. `tests/test_claude_payload.py` policy 관련 31개 method는 HEAD에 새 coordinator fixture가 없을 수 있어 아직 baseline 예외로 확정하지 않는다.
- Node full-run의 비-T1 candidate baseline은 **tests/node/consumer.test.mjs:20,29**, **tests/node/npm-upgrade-consumer.test.mjs:7,14**, **tests/node/transaction-readonly.test.mjs:8,9**, **tests/node/transaction.test.mjs:45**다. 일부는 HEAD source trace만 있고 완전한 baseline 실행은 없으므로 QA가 각 실패를 독립적으로 확인한다. 미확인 실패는 baseline 예외가 아니다. T1 source 변경만으로 해결할 수 있으면 승인 범위에서 수정하고, feature test update가 추가로 필요하면 수정하지 말고 Orchestrator에 반환한다.
- 승인된 v3에 따라 full Node 및 Python suites를 `PYTHONDONTWRITEBYTECODE=1`로 실행한다. Acceptance는 모든 T1 focused test가 통과하고, 두 full suites에서 **등록된 baseline method 외 실패가 없으며**, baseline method의 추가/다른 실패가 새로 생기지 않는 것이다. QA는 full suite를 독립 실행하고 method-level baseline 예외와 T1 test 결과를 분리 보고한다. static consistency 검사 네 개는 모두 exit 0이어야 한다. 분류하지 못한 실패는 acceptance를 hold한다.
- 사용자는 v3 scope, full-suite PTY 입력, baseline-comparison criterion을 승인했다. fresh Implementer가 현재 T1 구현을 이어가며, 이전 승인 전의 검증 결과를 완료 근거로 재사용하지 않는다.

### 수용 기준과 static evidence

| 기준 | 구현 결과 | Acceptance에 필요한 근거 |
|---|---|---|
| C1 | 여섯 역할의 discovery·validator·renderer·설치·Python apply | 양 플랫폼 role/file/tool 목록 및 관련 focused tests 대조 |
| C2 | 정확한 Orchestrator preset과 기존 역할 값 보존 | canonical config·native 기본값·model tests 대조 |
| C3 | Custom 편집·저장·재로드 | role key·serialization 흐름 및 Custom tests 검토 |
| C4 | 중앙 coordinator·올바른 focus | preview item·role key·TUI tests 대조 |
| C5 | 자동 coordinator routing·host 승인 relay | 양 SKILL·native prompt·policy tests 대조 |
| C6 | canonical/generated coordinator policy와 specialist 제한 | rule·26 targets·tool list·policy tests 대조 |
| C7 | legacy 보존·update·preset 사전 거부 | raw shape·defaults provenance·profile 요구·migration tests 추적 |
| C8 | coordinator 포함 capacity ledger·native 제약 대응 | counting·필요 slot·limits tests 대조 |
| C9 | 신규 **100/10** 및 기존 limits 보존 | resolver priority·TUI fallback·limits tests 대조 |
| C10 | docs·diagram·expectation·manifest 정합성 | documentation/policy tests·전체 diff·generated output 대조 |
| C11 | legacy upgrade token 호환 및 부재 snapshot 보존 | 구/신 수집 경로·token input·upgrade-state tests 대조 |
| C12 | Install / Update preview와 적용의 defaults 일치 | verified payload·선택 규칙·management/update tests 대조 |

## QA, acceptance 및 commit

Implementer 보고 후 fresh QA가 C1–C12의 관련 source/config/docs/test/fixture/generated diff를 검토한다. QA는 전체 Node 및 Python suite를 독립적으로 실행하고 아래 static consistency 검사도 수행한다. legacy raw shape, 정규화 config, defaults provenance, profile 목록, state token, transaction snapshot을 분리해 추적하고 기존 다섯 역할·limits를 덮어쓰는 경로가 없는지 확인한다.

QA의 전체 suite 명령은 v3 승인 시 다음과 같다. 기존 TUI PTY 검사는 전체 Node suite 일부로 실행된다.

~~~sh
PYTHONDONTWRITEBYTECODE=1 npm test
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_*.py'
~~~

QA가 실행하는 non-test static consistency 검사:

~~~sh
node scripts/update-role-policy.mjs --check
node scripts/update-runtime-assets.mjs --check
node scripts/update-manifest.mjs --check
git diff --check
~~~

승인된 v3의 baseline-comparison acceptance를 적용한다. policy/runtime/manifest drift와 whitespace 오류는 없어야 하고 static 명령 네 개는 exit 0이어야 한다. Full-suite의 실패는 정확히 승인·등록된 baseline method에 한해서만 예외다. T1 focused test는 모두 통과해야 하고, 그 외 full-suite failure, 추가되거나 달라진 baseline failure, 분류되지 않은 failure는 acceptance를 hold한다. QA finding은 현재 Implementer가 수정한다. 수정 후 Implementer는 해당 RED/GREEN test와 영향받은 전체 suite를 다시 실행하고, QA는 영향받은 독립 확인을 재수행한다. Orchestrator가 기준별 근거와 검증 한계를 검토해 T1을 수락한 뒤 하나의 focused implementation commit을 만든다. Implementer와 QA는 stage/commit하지 않는다.

T1 acceptance 이후 fresh independent Reviewer가 source·schema·migration·state token·권한·limits·문서·generated output 전체를 한 번 검토한다. Reviewer finding은 Implementer가 수정하고 Reviewer가 재검토한다. 이 최종 단계에서 QA를 다시 배정하지 않는다. 해소되지 않은 finding이 있으면 완료로 선언하지 않는다.

## 중단 조건 및 검증 한계

다음 중 하나면 영향받는 구현·검증·acceptance를 보류하고 Orchestrator에 반환한다.

- 대상 worktree/branch/HEAD 또는 승인 범위 불일치
- verified canonical defaults를 확보하지 못함
- legacy/config/profile 조합이나 provenance를 안전하게 판별할 수 없음
- 변경 없는 legacy 설치 token 호환 또는 부재 snapshot 보존을 입증하지 못함
- 기존 설정 보존 또는 preview와 적용의 defaults 동일성을 입증하지 못함
- generated policy/runtime/manifest drift
- 새 dependency, lifecycle 변경, 범위 밖 파일 변경이 필요함
- policy·권한·native 제약 설명 간 충돌
- 필수 test, full-suite, static QA 또는 Reviewer finding 미해결

테스트 실패를 감추거나 실행하지 않은 명령을 통과로 보고하지 않는다. 실사용 TUI 조작, 설치·업데이트, provider 모델 적용, native nested delegation 실행은 검증하지 않는다. v3 자동 PTY 검사 통과를 수동/실사용 UI 검증으로 주장하지 않는다. baseline 예외는 확인된 method ID와 HEAD 비교 근거로 한정한다. 테스트와 정적 검사 통과를 이 실행 동작의 성공으로 보고하지 않는다. 최종 보고는 변경 내용, TDD RED/GREEN·전체 suite·QA·Reviewer 근거, baseline 예외와 실행 검증 한계를 기록한다.
