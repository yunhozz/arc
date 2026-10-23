# Implementer 역할 전환 및 계획 운영 정책 보완 구현 계획

> **실행 역할 지침:** ARC 계약에 따라 Orchestrator가 조정·인수·Git 변경을 담당하고 Implementer가 구현한다. 체크박스는 진행 기록이며 커밋 단위가 아니다. TASK-03은 사용자가 승인한 task 한정 characterization 방식으로 진행한다.

**목표:** 계획 운영 정책과 Planner 전달 계약을 보완하고 Implementer 역할 전환과 installer 리팩토링을 완료한다. 후속 사용자 결정에 따라 이전 역할 호환성을 제거하여 Implementer만 지원한다.

**구조:** 정책 보완 → 역할 전환 → installer 리팩토링 순서로 진행한다. 역할 전환은 strict 역할 목록·프로필·모델·runtime·설치의 공유 계약을 하나의 task로 묶는다. 순수 리팩토링의 TDD 제약은 별도 결정 없이 완화하지 않는다.

**기술:** Node.js `>=22`, ECMAScript modules, Node test runner, TOML, 기존 Python 설정 도구와 `unittest`, descriptor 기반 safe-fs 및 transaction.

**승인 spec:** `/Users/ma-24-007/Desktop/workspace/arc/docs/superpowers/specs/2026-10-23-implementer-role-planning-policy-design.md`

**승인 spec SHA-256:** `a81dedf977c57c29e6c44cf44397c762334cc5c3b75b2a06ffb2945dc96ef2fb`

**plan 저장 대상:** `/Users/ma-24-007/Desktop/workspace/arc/docs/superpowers/plans/2026-10-23-implementer-role-planning-policy.md`

## 1. 실행 대상과 준비 상태

| 항목 | 값 |
|---|---|
| 저장소 | `/Users/ma-24-007/Desktop/workspace/arc` |
| branch | `chore/implementer-planning-policy` |
| 준비 시 HEAD | `d9044d52a9de2925c932c6ab6dc1e2de47e02ac4` |
| 계획 문서 작성 준비 시 변경 | tracked/staged 없음. Orchestrator 소유의 승인 spec·plan만 untracked; 구현 변경 없음 |
| canonical handoff 기록 | `/Users/ma-24-007/Desktop/workspace/arc/.git/arc/handoff/2026-10-23-implementer-role-planning-policy.md` |

위 상태와 승인은 Orchestrator가 제공한 준비 근거다. 실행 전 현재 상태를 다시 확인한다. 아직 구현·테스트·커밋을 수행하지 않았다.

## 2. 공통 제약

- 승인 spec을 요구사항 원천으로 사용한다.
- plan 승인, 최초 문서 세트 준비·커밋, 필요한 handoff gate 완료 후 구현한다.
- 구현 변경을 계획 문서 커밋에 넣지 않는다.
- top-level task 하나는 인수 후 focused 구현 커밋 하나다.
- Git 변경과 task 인수는 Orchestrator만 수행한다.
- 구현 역할은 배정된 파일만 수정하고 다른 역할의 변경을 되돌리지 않는다.
- 역할 이름 변경으로 권한·승인·QA·Reviewer·검증 요건을 바꾸지 않는다.
- 후속 작업은 spec §10의 Implementer 단일 역할 계약을 따른다. TASK-02의 legacy 호환 계약과 완료 표시는 이전 승인·구현 당시 기록이다.
- 과거 승인·audit·request·hash 근거의 원문을 보존한다.
- source 변경과 해당 generated policy·runtime 복제본·`MANIFEST.sha256`를 같은 task에서 정합하게 갱신한다.
- 역사적 spec·plan·실행 기록과 외부 플랫폼 고유 API를 일괄 치환하지 않는다.
- local TDD의 필수 RED와 전체 suite 확인을 준수한다. 통과 baseline·테스트 후작성·환경 오류를 RED로 보고하지 않는다.
- TASK-03은 pure behavior-preserving refactor에 한정한 사용자의 TDD 방법 예외 승인을 받았다. 공개 동작 characterization baseline을 source 편집 전에 확보하고 편집 후 같은 확인을 반복한다. 이를 TDD RED/GREEN으로 보고하지 않으며 focused 확인·전체 suite·QA·Reviewer는 유지한다.

## 3. 집중 확인할 실패 조건

| 조건 | 확인할 결과 | 담당 |
|---|---|---|
| 진행 표기와 검증 축소가 함께 변경됨 | 승인 불필요 기록으로 처리하지 않음 | TASK-01 |
| 최신 plan이 최초 커밋에 반영됨 | 실제 수정 승인 시점 이전 작업을 소급 정당화하지 않음 | TASK-01 |
| legacy·정식 모델 키가 함께 존재함 | 의미가 같으면 정규화, 다르면 쓰기 전 거부 | TASK-02 |
| old/new 프로필 충돌 또는 upgrade 중간 실패 | 데이터 보존, drift 감지와 rollback 유지 | TASK-02 |
| legacy 역할과 기존 fingerprint가 함께 존재함 | 역할 의미만 호환하고 원본 증거·replay 검증 보존 | TASK-02 |
| 리팩토링 전 characterization 테스트가 통과함 | 기준 결과로 기록하고 RED/GREEN이라 부르지 않음; 편집 후 동일 동작 확인 | TASK-03 |

## 4. 파일 구조·소유권과 순서

| 영역 | 책임 |
|---|---|
| `lib/policy/role-policy.json`, `render.mjs`, `placement.mjs` | TASK-01 정책 보완 후 TASK-02 역할 전환 |
| 양 플랫폼 현재 운영 skill·reference | TASK-01 운영 계약 후 TASK-02 명칭 정합성 |
| 모델·프로필·runtime·설치·upgrade | TASK-02 정식 역할과 호환 통합 |
| `lib/installer/plan.mjs` | TASK-02 필수 역할 연결 후 TASK-03 내부 정리 |
| 관련 테스트·generated assets·manifest | 각 task의 검증과 배포 정합성 |

실행 순서는 **TASK-01 → TASK-02 → TASK-03**이다. 공유 파일과 manifest가 겹치므로 source 편집을 병렬화하지 않는다.

TASK-01은 기존 역할명을 유지한다. TASK-02가 활성 운영 표면을 정식 이름으로 전환한다. TASK-03은 TASK-02 인수·커밋, task handoff, 승인된 characterization baseline 확보 후 시작한다.

## TASK-01 — plan 갱신과 Planner 전달 계약 보완

**목표·범위**

spec AC-01~AC-06을 구현한다. 문서 정책을 보완하며 새로운 Git 자동화나 runtime 실행 강제 기능을 만들지 않는다.

**소유 대상 파일**

- `lib/policy/role-policy.json`.
- 필요한 projection 변경: `lib/policy/placement.mjs`, `lib/policy/render.mjs`.
- 양 플랫폼:
  - `skill/references/planning.md`
  - `skill/references/coordination.md`
  - `skill/references/handoff-prep.md`
  - `skill/references/commit.md`
  - `skill/references/verification.md`
- 연결된 gate 문구 조정: 양 플랫폼 `skill/SKILL.md`, `skill/references/handoff.md`.
- 관련 정책 생성 블록과 양 플랫폼 `skill/runtime/role-policy.json`.
- `tests/test_arc_policy.py`, `tests/test_harness_contract.py`, 필요한 `tests/node/role-policy.test.mjs`.
- `MANIFEST.sha256`.

**선행 task·의존성**

없음. 공통 실행 gate와 문서 세트 준비가 선행한다.

**입출력 계약**

- 입력: 승인 spec §3·§4.
- 출력: 두 플랫폼에 일치하는 plan 변경 분류·승인·연혁·이력 안전 조건과 완전한 Planner brief 계약.
- TASK-02는 이 계약을 유지하면서 역할명을 전환한다.

**단계**

- [x] 구조 검증에 다음 요구를 추가하고 기존 정책에서 올바른 이유로 실패하는지 확인한다.
  - 체크박스·실제 결과·증거 링크·완료 상태는 신규 사용자 승인 불필요.
  - 목표·task 범위와 경계·기준·방법·위험·의존성·필수 검증 변경은 수정 버전 승인 필요.
  - 두 경우 모두 최초 문서 커밋 수정, 별도 docs/fixup 커밋 금지.
  - 승인·준비 이전 작업의 소급 승인 금지.
  - old/new 내용 hash·버전·승인 참조와 시점·SHA 대응·복원 가능한 내용 근거 보존.
  - 공유·게시·불명 이력, merge, 불명 소유권, 충돌에서 중단.
  - 필수 검증 삭제를 기계적 기록으로 취급하지 않음.
- [x] `planning.md`에 의미 분류와 승인 연혁의 주 계약을 작성한다.
- [x] `handoff-prep.md`·`commit.md`에 안전한 Git 변경 경계와 소유권을 연결한다.
- [x] `verification.md`에 재작성 이후 증거 연결·무효화·재확인을 연결한다.
- [x] 기존 소급 편입 금지 문구를 수정하여 승인된 plan의 최초 커밋 반영과 실제 승인 소급 금지를 함께 표현한다.
- [x] Planner 최초 brief 필수 입력, 통합 검토·보완, 변경 필드 전달, 호출 상한 없음, 단계별 승인 순서를 구체화한다.
- [x] 정책 원본·projection·생성물을 일치시킨다.
- [x] focused 확인과 fresh QA를 완료한다.
- [x] Orchestrator 인수 후 task 변경만 focused commit으로 남긴다.

**생성 명령**

```bash
npm run update:role-policy
node scripts/update-runtime-assets.mjs
node scripts/update-manifest.mjs
```

**필수 focused 확인**

```bash
python3 -m unittest discover -s tests -p 'test_arc_policy.py'
python3 -m unittest discover -s tests -p 'test_harness_contract.py'
node --test tests/node/role-policy.test.mjs tests/node/runtime-assets.test.mjs tests/node/manifest.test.mjs tests/node/package-references.test.mjs
npm run check:role-policy
node scripts/update-runtime-assets.mjs --check
npm run check:manifest
```

production code를 변경하면 local TDD에 따른 `npm test`도 인수 전에 수행한다. 문서 구조 검증은 실제 에이전트의 실행 준수를 입증하지 않는다는 한계를 기록한다.

**인수 기준·증거**

- AC-01~AC-06 충족.
- 문서 이력 예외가 구현 커밋·권한·검증 면제로 확장되지 않음.
- 각 owner 지침과 두 플랫폼의 계약이 일치함.
- RED/GREEN, focused 결과, QA 범위와 해결한 finding을 기록함.

**보류 조건**

승인 소급, 독립 문서 커밋으로 자동 대체, 강제 push, 의미 변경의 기계적 기록 분류가 남으면 인수하지 않는다. 실제 Git 자동화 구현은 추가하지 않는다.

**커밋 제목 제안:** `docs: clarify plan amendment and planner handoff contracts`

## TASK-02 — Implementer 전환과 legacy 호환 통합

**목표·범위**

spec AC-07~AC-10과 관련 AC-12를 구현한다. 모델·프로필·runtime·설치의 정식 역할 전환과 호환을 하나의 task로 완성한다.

strict 역할 목록과 프로필·manifest·runtime 소비자를 따로 전환하면 중간 상태가 독립적으로 유효하지 않으므로 이 경계를 분할하지 않는다.

### 소유 대상과 실제 활성 참조 범위

정책·모델·설치 원본:

- `lib/policy/role-policy.json`, `render.mjs`, `placement.mjs`.
- `lib/models/config.mjs`, `profiles.mjs`; 필요한 기존 export 연결은 `index.mjs`.
- `lib/installer/targets.mjs`, `manifest.mjs`, `upgrade-state.mjs`, `upgrade.mjs`, 필요한 `transaction.mjs`·설치 연결부.
- `lib/installer/plan.mjs`의 역할 전환 필수 변경.

실제 역할 문자열 인벤토리에 포함된 현재 운영 파일:

- `README.md`.
- `codex/skill/SKILL.md`, `claude/skill/SKILL.md`.
- `codex/skill/models.toml`, `claude/skill/models.toml`.
- `codex/skill/scripts/model_config.py`, `claude/skill/scripts/model_config.py`.
- 양 플랫폼 `skill/references/` 아래:
  - `commit.md`
  - `coordination.md`
  - `git-recovery.md`
  - `handoff-prep.md`
  - `handoff.md`
  - `planning.md`
  - `verification.md`
- `codex/skill/references/handoff-worktree.md`.

프로필과 연결된 설정 소비자:

- `codex/agents/arc-coder.toml` → `codex/agents/arc-implementer.toml`.
- `claude/agents/arc-coder.md` → `claude/agents/arc-implementer.md`.
- 양 플랫폼 나머지 프로필의 정책 생성 블록·활성 역할 참조.
- 양 플랫폼 `skill/scripts/apply-models.py`는 연결된 모델·프로필 소비자로 검증한다. 실제 변경은 호환 계약 구현에 필요한 경우로 제한한다.

runtime:

- 정식 역할 소비 원본:
  - `lib/runtime/operations.mjs`
  - `cooperative-schema.mjs`
  - `assignment.mjs`
  - `evaluate.mjs`
  - `verification.mjs`
  - `acceptance.mjs`
- 역할 목록을 소비하는 `lib/runtime/schema.mjs`, `identity.mjs`와 관련 생성 경로.
- 위 원본에 대응하는 `codex/skill/runtime/`, `claude/skill/runtime/`의 생성 복제본과 `role-policy.json`.

`git-evidence.mjs`의 검색 일치는 `TextDecoder` 같은 부분 문자열일 수 있으므로 역할 참조로 오인하여 수정하지 않는다.

범위 규칙:

- 구현 시작 시 위 활성 경로·프로필·원본에서 `Coder`, 역할 의미의 `coder`, `arc_coder`, `arc-coder`를 재확인한다.
- 역할·프로필·설정 계약을 실제로 소비하는 일치만 변경한다.
- `references/superpowers/`의 외부 skill 원문과 역사 문서·실행 기록은 일괄 치환 대상에서 제외한다.
- 미열거 파일이 실제 소비자로 확인되면 파일·필요성을 Orchestrator에게 보고한다. 단순 누락 보완인지 material 범위 변경인지 확인한 뒤 소유권을 갱신한다.

관련 Node·Python 테스트·fixture, 정책 생성 결과·runtime 복제본·`MANIFEST.sha256`도 이 task가 소유한다.

**선행 task·의존성**

TASK-01 인수·커밋 완료.

### 입출력 계약

**모델**

기존 공개 함수 `loadModelConfig`, `applyPreset`, `serializeModelConfig`, `resolveModelSettings`, `renderProfiles`의 호출 계약을 유지한다.

`config.mjs` 내부에 `normalizeModelRoleKeys(roles)`를 두어 원본을 변경하지 않는 정식 키 복사본을 만든다. full preset 설정과 resolved 설정은 각각 기존 값 검증을 적용한다.

- legacy 키만 있으면 값 보존.
- 정식 키만 있으면 그대로 사용.
- 두 키가 의미상 같으면 정식 키로 합침.
- 어느 preset 값이라도 다르면 쓰기 전에 거부.
- property 순서가 아닌 검증된 값으로 동일 여부 판단.
- unknown key·잘못된 구조·platform/version 검증 유지.

**runtime**

`operations.mjs`에 `normalizeRole(role)`을 둔다.

```javascript
normalizeRole('coder') === 'implementer'
normalizeRole('implementer') === 'implementer'
normalizeRole('reviewer') === 'reviewer'
```

정식 `ROLES`·`ROLE_OPERATIONS`는 `implementer`를 사용한다. legacy 입력은 의미 정규화 후 정식 역할로 검증한다. 기존 저장 상태 전체를 정규화하여 다시 쓰지 않는다.

**설치**

- `resolveTarget`의 정식 `profileNames`는 새 이름만 반환.
- `collectInstalledState`는 legacy·정식 실행 역할 프로필을 인식하고 두 경로의 snapshot을 확보.
- `buildUpgradePlans`는 충돌 없는 legacy 설치를 정식 출력으로 전환.
- legacy 정리는 기존 transaction의 backup·drift·rollback 범위 안에서 수행.
- 별도 비원자적 삭제 단계 금지.

### 단계

- [x] 모델·프로필 테스트에 legacy/new/동일 이중 키/충돌 이중 키 사례를 추가하고 실제 RED를 확인한다.
- [x] Node와 Python 도구에 같은 정규화·보존·정식 출력 계약을 구현한다.
- [x] 정책 역할 ID·rule ID·routing·renderer·placement를 함께 전환한다. 정식 구현 역할 rule ID는 `role.implementer-implementation`으로 맞춘다.
- [x] runtime 의미 비교·assignment·identity·finding·acceptance 경로에 정규화 계약을 연결한다.
- [x] runtime 테스트에 다음을 추가하고 필요한 구현 전에 실제 RED를 확인한다.
  - legacy·정식 역할의 동일한 허용/거부.
  - Git·외부 작업 권한 불변.
  - 중복 identity·잘못된 assignment 거부 유지.
  - 원본 fingerprint·replay·승인 근거 보존.
  - policy/runtime hash 불일치 hold 유지.
  - QA·최종 Reviewer 재확인 routing 유지.
- [x] target·upgrade·transaction 테스트에 다음을 추가하고 실제 RED를 확인한다.
  - legacy-only·new-only 설치.
  - 의도 불명 old/new 동시 존재의 쓰기 전 거부.
  - 기존 지원 설정 보존과 보존 불명 사용자 변경의 중단.
  - symlink·특수 파일·관찰 후 drift 거부.
  - 프로필 생성·legacy 정리 중간 실패의 rollback.
  - 성공 후 정식 활성 프로필만 존재.
- [x] 현재 운영 파일·프로필 참조를 위 인벤토리에 따라 전환한다.
- [x] 정책 → runtime 복제본 → manifest 순서로 생성한다.
- [x] focused 확인, `npm test`, fresh QA를 완료한다.
- [x] Orchestrator가 인수한 뒤 통합 역할 전환을 한 커밋으로 남긴다.

### 필수 focused 확인

```bash
node --test tests/node/models.test.mjs tests/node/profile-render.test.mjs tests/node/role-policy.test.mjs
node --test tests/node/runtime-*.test.mjs
node --test tests/node/targets.test.mjs tests/node/upgrade-state.test.mjs tests/node/upgrade-process.test.mjs tests/node/upgrade-cli.test.mjs tests/node/upgrade-harness.test.mjs tests/node/npm-upgrade-consumer.test.mjs
node --test tests/node/plan.test.mjs tests/node/install.test.mjs tests/node/transaction.test.mjs tests/node/transaction-drift.test.mjs tests/node/transaction-readonly.test.mjs tests/node/uninstall.test.mjs tests/node/uninstall-cli.test.mjs
node --test tests/node/legacy-parity.test.mjs tests/node/manifest.test.mjs tests/node/package-references.test.mjs
python3 -m unittest discover -s tests -p 'test_codex_models.py'
python3 -m unittest discover -s tests -p 'test_claude_payload.py'
python3 -m unittest discover -s tests -p 'test_arc_policy.py'
python3 -m unittest discover -s tests -p 'test_harness_contract.py'
npm test
npm run check:role-policy
node scripts/update-runtime-assets.mjs --check
npm run check:manifest
```

**인수 기준·증거**

- 정식 이름·키·파일명·권한이 spec §5와 일치한다.
- 구 설정의 수동 수정을 요구하지 않는다.
- 기존 설치 데이터 보존·실패 복구가 확인된다.
- runtime 호환이 원본 증거·버전 검증을 훼손하지 않는다.
- generated·manifest가 일치한다.
- 남은 legacy 문자열을 호환 입력·테스트·역사 기록 등으로 분류한다.
- fresh QA가 target·upgrade·권한·replay·rollback을 독립 확인한다.
- 실제 RED/GREEN·전체 suite·QA 결과와 한계를 기록한다.

**보류 조건**

데이터 보존 불가, hash·replay·버전 검증 완화 필요, 미지원 workflow 자동 migration 필요, 새 권한 부여가 발견되면 보류한다.

**커밋 제목 제안:** `feat: rename coder to implementer with legacy compatibility`

## TASK-03 — installer 내부 책임 분리: 승인된 characterization 방식 적용

**목표·범위**

spec AC-11과 관련 AC-12를 구현한다. TASK-02에서 승인된 동작을 보존하며 `lib/installer/plan.mjs`를 정리한다.

**사용자 결정 기록**

사용자가 2026-10-23에 이 task 한정 TDD 방법 예외를 직접 승인했다. 승인 범위는 외부 관찰 characterization 테스트를 source 편집 전에 확보하고 편집 후 동일하게 재검증하는 것이다. 이 baseline은 기존 동작의 회귀 기준이며 TDD RED/GREEN으로 보고하지 않는다. local TDD 지침의 다른 요구, focused 확인, 전체 suite, QA, 최종 Reviewer는 유지한다.

local [test-driven-development/SKILL.md](/Users/ma-24-007/Desktop/workspace/arc/codex/skill/references/superpowers/test-driven-development/SKILL.md)는 리팩토링을 적용 대상으로 포함하고 다음을 요구한다.

> `NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST`

또한 [handoff.md](/Users/ma-24-007/Desktop/workspace/arc/codex/skill/references/handoff.md:172)는 필수 TDD 단계가 막히면 제약을 기록하고 필요한 사람의 결정을 받도록 한다. 이 plan은 해당 요구를 완화하지 않는다.

**소유 대상 파일**

변경 가능한 범위:

- `lib/installer/plan.mjs`.
- `tests/node/plan.test.mjs`와 필요한 기존 installer 회귀 테스트.
- `MANIFEST.sha256`.

source를 고의로 깨뜨려 RED를 만들거나 내부 helper 검증용 공개 API를 추가하지 않는다.

**선행 task·의존성**

TASK-02 인수·커밋 완료, TASK-03별 fresh handoff와 승인된 characterization baseline 확보.

### source 편집 전 시험 범위와 판정

공개 API `buildInstallPlan`과 기존 preview·검증 API를 통해 다음 외부 관찰 동작을 시험할 수 있다.

- 두 플랫폼의 생성 모델·프로필·skill bytes와 Map 순서.
- `summary`·`globalChanges` 내용과 순서.
- snapshot 관찰 범위·drift 거부.
- 복수 오류 입력에서 최초 오류의 종류·메시지.
- `skipGlobal`, native concurrency drift, preview 재사용.
- preview의 쓰기·프로세스·네트워크 부작용 없음.
- 경로 충돌·symlink·특수 파일 거부.

이 범위의 characterization 테스트가 기존 코드를 통과하면 승인된 방법의 회귀 기준이다. **TDD RED가 아니다.** 일부러 틀린 기대값, 누락된 import, 존재하지 않는 helper, 환경 실패를 RED로 사용하지 않는다.

외부 관찰 동작의 실제 실패가 발견되면 기대값의 승인 근거와 실패 이유를 보고한다. 결함 수정은 동작을 바꾸므로 순수 리팩토링 범위에 자동 포함하지 않는다. 필요한 범위·문서 승인과 task 경계 결정을 Orchestrator에게 반환한다.

현재 승인 범위 안에서는 TDD RED를 만들 수 없어 사용자가 task 한정 방법 예외를 선택했다. 이 예외를 다른 behavior task, 파일, 테스트 생략에 확대하지 않는다. characterization baseline 자체가 실패하면 해당 실패를 RED로 재명명하지 않고 hold 후 Orchestrator에게 보고한다.

### 구현 계약

허용된 경우에도 기존 export·인수·반환 구조를 유지하고 새 파일·공개 API·의존성을 추가하지 않는다.

같은 파일 안에 다음 비공개 단위를 추출한다.

- `renderModelAssets({payload, target, preset, modelConfig, language})`
  - 반환: `{profiles, modelBytes}`.
- `renderSkillPayload({payload, target, language, modelBytes, limits})`
  - 반환: 기존 bytes·순서의 skill `Map`.
- `renderNativeChanges({target, safeFs, snapshot, skipGlobal, preview, concurrentExplicit, limits, summary})`
  - 반환: 기존 형태의 `globalChanges`.
  - 기존 관찰 순서대로 `snapshot`·`summary`를 갱신한다.

언어·preview 검증, 경로 관찰, snapshot 병합, 최종 조립·검증은 기존 순서를 보존한다. helper를 export하거나 white-box 검증 대상으로 공개하지 않는다.

### 단계

- [x] TASK-02 선행 task 인수·커밋 및 TASK-03 handoff gate를 통과한다.
- [x] 공개 동작 characterization 테스트를 추가하거나 기존 테스트의 충분한 범위를 확인하고 source 편집 전에 baseline으로 실행한다.
- [x] baseline 실패, 검증 범위의 불충분, 승인 범위 밖의 동작 차이가 발견되면 source-edit hold 후 Orchestrator에게 근거를 보고한다.
- [x] 승인된 focused test 명령으로 characterization baseline을 실행하고 정확한 명령·결과를 기록한다. 통과를 TDD RED/GREEN으로 보고하지 않는다.
- [x] 모델·프로필 생성, skill payload, native 병합을 순서 보존하며 추출한다.
- [x] 주 함수를 호출·최종 조립 중심으로 정리한다.
- [x] source 편집 후 baseline과 같은 focused characterization 확인, `npm test`, manifest check, fresh QA를 완료한다.
- [x] Orchestrator 인수 후 한 focused commit으로 남긴다.

### 필수 focused 확인

```bash
node --test tests/node/plan.test.mjs tests/node/legacy-parity.test.mjs tests/node/language.test.mjs tests/node/limits.test.mjs tests/node/runtime-config.test.mjs
node --test tests/node/transaction.test.mjs tests/node/transaction-drift.test.mjs tests/node/transaction-readonly.test.mjs tests/node/install.test.mjs tests/node/upgrade-process.test.mjs
node --test tests/node/manifest.test.mjs
npm test
npm run check:manifest
```

**인수 기준·증거**

- 승인된 task 한정 방법 예외와 실제 characterization baseline 근거가 있다. TDD를 따랐다고 주장하지 않는다.
- export·인수·반환·기본값·Buffer·Map·summary·오류 순서가 같다.
- snapshot·preview·경로·native merge 안전 검사가 같다.
- TASK-02 대비 추가 동작 차이가 없다.
- 실제 사용한 검증 방법을 정확하게 보고한다.
- fresh QA가 공개 성공·실패 동작을 확인한다.

**보류 조건**

baseline 실패·불충분, 테스트 후작성, TDD RED/GREEN으로 잘못 보고, white-box API 추가, 동작 변경·새 의존성·다른 모듈 재설계 필요 시 보류한다.

**커밋 제목 제안:** `refactor: separate installer plan rendering responsibilities`

이 제목과 커밋은 task가 승인된 방법으로 실제 완료·인수된 경우에만 사용한다.

## TASK-04 — 이전 역할 호환 제거와 Implementer 단일화

**목표·범위**

spec §10과 AC-13~AC-16을 구현한다. 모델·프로필·설치·runtime의 이전 역할 호환 경로와 관련 테스트를 하나의 공유 계약으로 제거한다. 새로운 migration·정리 기능이나 installer 재설계는 추가하지 않는다.

사용자가 정식 배포 전이라는 이유로 이 범위를 명시적으로 승인했다. TASK-03의 characterization 방법 예외는 이 behavior 변경에 적용하지 않는다.

**소유 대상 파일**

- `lib/models/config.mjs`, `lib/models/profiles.mjs`.
- `lib/installer/upgrade-state.mjs`, `lib/installer/uninstall.mjs`, `lib/installer/transaction.mjs`.
- 실제 legacy 전환 소비자가 있는 기존 `lib/installer/` 연결부.
- `lib/runtime/operations.mjs`와 이전 역할 정규화를 호출하는 기존 runtime 소비자.
- `codex/skill/scripts/model_config.py`, `claude/skill/scripts/model_config.py`.
- `tests/node/models.test.mjs`, `profile-render.test.mjs`, `upgrade-state.test.mjs`, `plan.test.mjs`, `uninstall.test.mjs`, `runtime-assignment.test.mjs`, `runtime-evaluate.test.mjs`, `runtime-verification.test.mjs`, `runtime-workflow.integration.test.mjs`, `upgrade-harness.test.mjs`.
- `tests/test_codex_models.py`, `tests/test_claude_payload.py`와 위 검증의 기존 fixture.
- `tests/node/instruction-layout.test.mjs`와 이 테스트가 소비하는 `tests/node/fixtures/instruction-contracts.json`.
- `tests/test_arc_policy.py`, `tests/test_harness_contract.py`의 활성 역할 관련 class·test·변수·assertion.
- `tests/installer-parity.json`의 현행 `destination(s)`와 helper `destinations`; 연결된 Python class·test 이름 변경을 같은 task에서 반영한다.
- 해당 source의 runtime 생성 복제본과 `MANIFEST.sha256`.

활성 테스트 코드와 실행 fixture는 위 목록에 한정하지 않고 전역 인벤토리로 확인한다. 추가 일치가 있으면 파일·소비 목적·필요한 변경을 Orchestrator에게 보고하여 소유권을 명확히 한다.

fixture 갱신 대상은 현행 실행 입력·기대값·현행 테스트를 가리키는 연결 정보다. 제외 대상은 고정된 역사 문서·handoff와 SHA256으로 검증되는 parity 역사 증거의 원문 필드다. `legacyInventory`·`legacyHelpers`의 과거 ID·assertion을 변경하거나 digest·검증기를 완화하지 않는다. 외부 skill 원문과 역할과 무관한 부분 문자열도 일치별 근거를 남겨 제외한다.

`tests/test_install.py`는 현재 파일이 아니며 parity fixture에 남은 과거 식별자의 일부다. 이 경로를 실제 수정·실행 대상으로 추가하지 않는다.

**선행 task·의존성**

TASK-01~TASK-03과 최종 발견 사항의 기존 인수·커밋 완료. 후속 spec 계약과 현재 branch/HEAD·소유권·문서 이력 처리 경계를 handoff에 연결한다.

**입출력 계약**

- 기존 공개 API의 인수·반환 구조는 유지한다.
- 모델 설정은 `arc_implementer`를 사용하고 다른 역할 키는 기존 strict 검증으로 거부한다.
- 프로필 관리 목록은 `arc-implementer.*`를 사용한다. 이전 역할 프로필의 탐색·변환·삭제 경로는 제거한다.
- runtime은 `implementer`를 직접 검증한다. 이전 역할 alias나 이름을 분할·조합하여 유지하는 우회 처리를 두지 않는다.
- 역사적 저장 상태를 이름 치환으로 다시 쓰지 않는다.

**단계**

- [x] 현재 source·테스트·fixture·생성물의 역할 문자열과 정규화 호출자를 확인하여 수정 인벤토리를 기록한다.
- [x] unknown key·role에 대한 기존 strict 거부 시험을 재사용하고 필요한 경우 의미 있는 실패 시험을 먼저 확보한다. 현재 호환 경로 때문에 허용되는 입력의 거부를 RED 근거로 확인하고 정확한 원인을 기록한다.
- [x] Node·Python 모델 정규화와 프로필 migration을 제거한다.
- [x] upgrade·uninstall의 이전 프로필 전용 탐색·snapshot·정리와 transaction의 `legacyRemovals` 소비 경로를 제거한다. 정식 경로의 backup·drift·transaction·rollback 안전 검사는 유지한다.
- [x] runtime 역할 alias와 불필요해진 정규화 연결을 제거한다.
- [x] 활성 테스트 코드·실행 fixture 전역의 역할 이름·class·test·변수·assertion·기대값을 정식 이름으로 정리한다. 호환 성공 사례를 제거하고 일반 unknown 입력 거부 검증을 보존한다. instruction layout의 이전 이름 치환 보정을 제거한다.
- [x] Python 테스트 이름과 parity fixture의 현행 `destination(s)`·helper `destinations`를 함께 갱신한다. `legacyInventory`·`legacyHelpers`의 과거 ID·assertion·SHA256은 보존하고 parity 검증으로 양쪽 경계를 확인한다.
- [x] runtime 복제본과 manifest를 갱신한다.
- [x] focused 확인과 전체 suite 결과를 확보하고 새 실패를 해결한다. 알려진 baseline 실패는 동일성 근거와 한계를 분리해 기록한다.
- [x] fresh QA가 모델·설치·runtime의 새 계약과 안전 회귀를 확인한다.
- [x] Orchestrator가 AC-13~AC-16과 필수 증거를 인수한 후 하나의 focused 구현 커밋으로 남긴다.

**필수 focused 확인**

```bash
node --test tests/node/models.test.mjs tests/node/profile-render.test.mjs tests/node/upgrade-state.test.mjs tests/node/plan.test.mjs tests/node/uninstall.test.mjs tests/node/upgrade-harness.test.mjs
node --test tests/node/runtime-assignment.test.mjs tests/node/runtime-evaluate.test.mjs tests/node/runtime-verification.test.mjs tests/node/runtime-workflow.integration.test.mjs
node --test tests/node/instruction-layout.test.mjs
python3 -m unittest discover -s tests -p 'test_codex_models.py'
python3 -m unittest discover -s tests -p 'test_claude_payload.py'
python3 -m unittest discover -s tests -p 'test_arc_policy.py'
python3 -m unittest discover -s tests -p 'test_harness_contract.py'
node scripts/check-installer-parity.mjs
npm test
npm run check:role-policy
node scripts/update-runtime-assets.mjs --check
npm run check:manifest
```

`lib/installer/transaction.mjs`를 변경하므로 기존 transaction·transaction-drift·transaction-readonly 시험과 정식 upgrade·uninstall 시험을 함께 확인한다. 알려진 Python baseline 실패는 현재 실패와 동일한지 근거를 연결하며 통과로 처리하지 않는다.

**인수 기준·증거**

- AC-13~AC-16 충족.
- 정식 설정의 model·effort 값과 공개 API 구조 보존.
- unknown key·role 거부와 runtime 권한·증거 검증 유지.
- 정식 설치의 drift·transaction·rollback·uninstall 동작 보존.
- 운영 source·활성 테스트 코드·실행 fixture·생성물의 이전 역할 참조가 없음. 전역 인벤토리의 모든 일치를 변경 대상·고정된 역사 증거·외부 원문·역할과 무관한 부분 문자열로 분류하고 제외 근거를 기록함.
- parity fixture의 현행 destination이 실제 변경된 테스트를 가리킴. `legacyInventory`·`legacyHelpers`의 과거 ID·assertion 원문과 SHA256이 보존되며 parity 검증을 완화하지 않음.
- 이름 치환 보정 없이 instruction layout과 활성 정책 테스트가 정식 역할을 확인함.
- 실제 RED·수정 후 결과, focused·전체 suite 결과, fresh QA 및 한계를 기록함.

**보류 조건**

현재 작업 소유권 불일치, 필수 strict 검증 완화, 새 migration·자동 삭제 필요, 역사 기록 변경 필요, 생성물 불일치 또는 미해결 새 회귀가 발견되면 영향 작업을 보류한다.

**커밋 제목 제안:** `refactor(roles): 이전 역할 호환 제거`

### TASK-04 실행 결과

- 역할 토큰 경계 검색은 `bin/`, `lib/`, `scripts/`, 활성 `tests/`, 양 플랫폼 `skill/`, `README.md`에서 이전 역할 참조 0건을 확인했다. 넓은 부분 문자열 검색의 `TextDecoder`는 역할명이 아닌 오탐이다. 활성 코드·설정·현재 테스트·실행 fixture는 `implementer`만 지원하며 자동 호환·migration 경로가 없다.
- `tests/installer-parity.json`의 고정 `legacyInventory`·`legacyHelpers`와 historical assertion 원문에는 과거 이름이 남는다. 이는 실행 설정이 아닌 SHA256으로 보존되는 역사 감사 자료다. 역사 spec·plan·handoff와 외부 skill 원문도 그대로 두었다.
- 구현 전 RED는 `/tmp/arc-task04-red-node.log`, `/tmp/arc-task04-red-boundaries.log`, `/tmp/arc-task04-red-codex.log`, `/tmp/arc-task04-red-claude.log`에서 확인했다. 이전 이름의 성공·migration 입력이 거부되지 않던 strict 테스트가 실패했으며, 수정 후 일반 unknown key·role 거부 테스트가 통과했다.
- 새 런타임 원본·복제본은 서로 일치한다. parity 확인은 역사 ID 236개·assertion 739개·helper assertion 14개를 보존한 채 통과했다. 역할 정책 25개 대상, runtime asset 40개, manifest 176개 검증도 통과했다. `git diff --check` 통과.
- fresh QA의 최종 focused Node 확인은 231개 중 225 통과, 기존 기준 실패 3개, skip 3개였다. 실패는 Claude runtime gate의 오래된 hash 기대값, Claude hook에서 ARC Git guard load 실패, upgrade wrapper의 package version 기대값(`0.1.5` 대 실제 `0.1.9`)이다. full `npm test`는 913개 중 896 통과, 같은 기존 실패 9개, skip 8개였고 `/tmp/arc-final-uninstall-npm.log` 기준과 일치했다. 신규 회귀는 확인되지 않았다.
- Codex·Claude의 strict 역할 Python 테스트는 각각 1/1 통과했다. 전체 Python 파일에는 기존 기준 실패가 남아 clean 통과로 보고하지 않는다. QA 확인 시 Python bytecode 산출물은 만들어지지 않았다.
- 독립 Reviewer는 최종 수정본에서 actionable finding을 보고하지 않았다. QA는 AC-13·AC-15·AC-16을 확인했고 AC-14의 end-to-end 증거는 기존 Claude hook·upgrade wrapper 실패 때문에 제한됨을 기록했다.

## 5. 실행 기록과 커밋 운영

각 task는 필수 확인·필요 QA·finding 재검증 후 Orchestrator가 인수하고 커밋한다. 나중의 전체 검토만을 이유로 독립적으로 인수 가능한 task의 커밋을 미루지 않는다.

실행 중 plan 갱신은 승인 spec §3을 따른다.

- 기계적 실행 기록은 신규 사용자 승인 없이 내용·근거·시점을 기록한다.
- 계약 변경은 영향 작업을 보류하고 수정 버전 승인·준비 후 재개한다.
- 두 경우 모두 안전한 시점에 최초 문서 커밋을 수정한다.
- old/new 내용 hash·버전·승인 참조·시점·SHA 대응을 보존한다.
- 공유·게시·불명 이력, merge, 불명 소유권, 충돌에서는 중단한다.
- 별도 docs/fixup 커밋·강제 push로 자동 대체하지 않는다.
- 재작성된 내용으로 실제 승인 시점 이전 작업을 소급 승인하지 않는다.

사용자가 승인한 TASK-03 예외는 이 task의 characterization 방식에 한정한다. 다른 method/scope 변경은 영향 작업을 보류하고 수정 plan 승인과 연혁 기록을 완료한다.

## 6. 전체 검증·최종 QA 근거·독립 Reviewer

이 절은 승인된 모든 task의 인수·커밋·필수 QA 이후 수행한다. TASK-03의 승인된 baseline·재검증이 완료되지 않으면 원래 전체 범위를 완료한 것으로 선언하지 않는다.

- [x] branch·HEAD·승인 문서 버전·task 커밋·미완료 범위를 확인한다.
- [x] task별 fresh QA와 필요한 실패 재검증이 완료되었는지 확인한다.
- [x] 최종 상태에서 다음 결과를 확보한다.

```bash
npm test
python3 -m unittest discover -s tests -p 'test_arc_policy.py'
python3 -m unittest discover -s tests -p 'test_harness_contract.py'
python3 -m unittest discover -s tests -p 'test_codex_models.py'
python3 -m unittest discover -s tests -p 'test_claude_payload.py'
npm run check:role-policy
node scripts/update-runtime-assets.mjs --check
npm run check:manifest
```

최종 상태가 마지막으로 확인한 내용과 같으면 해당 결과를 연결하고, 변경·실패·증거 불일치가 있는 확인만 반복한다. 환경 미충족·미실행을 통과로 처리하지 않는다.

- [x] QA 결과·findings와 최종 source/generated 상태의 일치를 확인한다.
- [x] 독립 Reviewer가 **최종 전체 변경을 한 번** 검토한다. task별 Reviewer 관문은 추가하지 않는다.
- [x] 최종 finding은 Implementer 수정 → Reviewer 재확인으로 해결한다. 이 단계에는 QA를 다시 배정하지 않는다. 필요한 focused 회귀 확인은 수행한다.
- [x] Orchestrator가 AC-01~AC-12, 승인·검증·QA·최종 finding·남은 상태를 확인하고 전체 인수한다.

### 후속 변경의 전체 검증과 인수

기존 전체 검증 체크박스는 TASK-01~TASK-03 당시 결과로 보존한다. TASK-04는 다음 근거를 별도로 확보한다.

- [x] TASK-04 인수·커밋과 fresh QA·필요한 실패 재검증을 완료한다.
- [x] source·generated·manifest와 실제 QA 대상이 일치하는지 확인한다.
- [x] 독립 Reviewer가 후속 변경을 포함한 최종 전체 변경을 검토한다.
- [x] 최종 finding은 Implementer 수정 → Reviewer 재확인으로 해결한다. 이 최종 단계에는 QA를 다시 배정하지 않는다.
- [x] Orchestrator가 유지되는 기존 기준과 AC-13~AC-16, 실제 증거·한계·남은 상태를 확인하여 후속 변경을 전체 인수한다.

push·merge·배포·게시와 외부 메시지는 실행 범위가 아니다.

## 7. 공통 보류와 재개

대상·HEAD·소유권 불일치, 누락된 승인, 예상하지 않은 변경, 설정·프로필 충돌, 사용자 데이터 보존 불가, 검증 실패·환경 문제에서는 영향 작업을 중단한다.

실제 workspace·branch/HEAD·관련 파일·완료 부분·실패 근거·필요한 해결을 보고한다. Orchestrator 해결 후 관련 gate·증거를 갱신한다. 구현 역할이 독자적으로 fallback·재시도·범위 확대를 결정하지 않는다.

---

자가 검토:

- TASK-03 pure refactor에서 통과 baseline을 RED로 취급하지 않는다. 사용자가 승인한 task 한정 characterization 예외로 source 전후의 같은 공개 동작을 확인한다.
- 예외는 TASK-03만 대상으로 하며 다른 TDD 단계·전체 suite·QA·Reviewer 요건을 면제하지 않는다.
- TASK-02에 실제 `rg` 인벤토리의 운영 파일을 명시하고 `TextDecoder` 같은 부분 문자열 오탐·역사 기록·외부 skill 원문을 구분했다.
- 실제 존재하는 `tests/node/targets.test.mjs`를 target·upgrade focused 확인에 포함했다.
- `npm test`, task별 필요한 fresh QA, 전체 최종 검증과 단일 독립 Reviewer 검토를 유지했다.
- spec 요구는 TASK-01: AC-01~AC-06, TASK-02: AC-07~AC-10, TASK-03: AC-11, 공통 생성물·최종 확인: AC-12로 대응한다.
- TASK-03 방법 결정은 사용자의 “예외 승인”으로 해소되었다. 승인 선택과 시점은 canonical handoff에 기록한다.
