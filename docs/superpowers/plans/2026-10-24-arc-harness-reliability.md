# npm 테스트 실패 및 installer-parity mapping 수정 계획

> **실행 역할:** ARC 역할 흐름을 따른다. Implementer가 배정된 파일을 수정하고, QA가 결과를 확인하며, Orchestrator가 범위와 수용을 결정한다.

**상태:** 수정 계획 초안

**Goal:** 현재 `npm test` 실패를 모두 수정하고, 검증된 stale mapping을 정정하여 `node scripts/check-installer-parity.mjs --complete`를 통과시킨다.

**Architecture:** 실패별 원인을 확인하여 필요한 구현·테스트 기대값을 수정한다. Parity mapping은 실제 존재하는 test와 coverage를 대조하여 정정한다.

**Tech Stack:** JavaScript ESM, Node.js test runner, JSON installer-parity mapping.

**대상 저장소:** `/Users/yunho/Desktop/project/arc`

## Global Constraints

- Baseline에서 발생한 실패도 이번 수정·수용 범위에 포함한다.
- 기존 변경과 파일 소유권을 보존한다.
- 실패를 숨기기 위해 test·assertion·coverage를 제거하거나 건너뛰지 않는다.
- 기대값은 실제 diff와 요구 동작을 확인한 뒤 수정한다.
- HEAD `f140b5`의 TUI-only 공개 계약을 parity 처분의 기준으로 사용한다.
- `legacyInventory`와 assertion lines는 변경하지 않는다.
- Parity checker의 retirement allowlist를 확대하지 않는다.
- 제거된 성공 CLI·npx 출력, 기존 `--target` help, target argument forwarding이 현재도 제공된다고 주장하지 않는다.
- Stale mapping 수정 범위를 최초 19개 destination으로 제한하지 않는다.
- 필수 최종 명령은 `npm test`와 `node scripts/check-installer-parity.mjs --complete` 두 개다.
- 최종 결과를 실제 검사한 변경 상태에 연결한다.

## Review Focus

| ID | 확인할 조건 | 요구 결과 |
|---|---|---|
| RF1 | 첫 assertion 해소 후 다른 실패가 나타남 | 추가 실패도 수정하고 전체 suite 재확인 |
| RF2 | Profile·rendering hash가 변경됨 | 실제 변경의 적합성을 확인한 후 기대값 갱신 |
| RF3 | Baseline에도 같은 실패가 있음 | 면제하지 않고 원인을 수정 |
| RF4 | Complete 검사에서 stale 참조가 추가로 드러남 | 모든 해당 destination·owner를 확인하여 정정 |
| RF5 | 기존 성공 계약이 제거되거나 현재 coverage가 불명확함 | TUI-only 재분류와 현재 assertion을 구분하고 gap은 수용 보류 |

---

## Task R1 — npm 실패 전체 및 stale parity mapping 수정

### 목표

다음 두 명령이 최종 변경 상태에서 모두 통과하도록 수정한다.

- `npm test`
- `node scripts/check-installer-parity.mjs --complete`

### Files

확인된 실패·mapping 근거 파일:

| 절대 경로 | 조사·수정 목적 |
|---|---|
| `/Users/yunho/Desktop/project/arc/tests/node/instruction-layout.test.mjs` | Protected-output assertion |
| `/Users/yunho/Desktop/project/arc/tests/node/npm-lifecycle.test.mjs` | 종료 경로별 raw mode·listener 복원 |
| `/Users/yunho/Desktop/project/arc/tests/node/package.test.mjs` | Package metadata |
| `/Users/yunho/Desktop/project/arc/tests/node/plan.test.mjs` | Installed hook 및 rendering 기대값 |
| `/Users/yunho/Desktop/project/arc/tests/node/preset.test.mjs` | Preset 보존·drift repair·noop |
| `/Users/yunho/Desktop/project/arc/tests/node/tui-package-consumer.test.mjs` | Package consumer 동작 |
| `/Users/yunho/Desktop/project/arc/tests/node/upgrade-harness.test.mjs` | Upgrade payload·version 동작 |
| `/Users/yunho/Desktop/project/arc/tests/installer-parity.json` | Complete 검사에서 확인되는 stale mapping 전체 |
| `/Users/yunho/Desktop/project/arc/tests/node/consumer.test.mjs` | 현재 test 이름과 실제 coverage 확인 |
| `/Users/yunho/Desktop/project/arc/tests/node/cli.test.mjs` | 기존 CLI 참조와 현재 검사 범위 확인 |
| `/Users/yunho/Desktop/project/arc/tests/node/cli-dry-run.test.mjs` | 제거된 문법 거부·harness 상태 보존 검사 |
| `/Users/yunho/Desktop/project/arc/tests/test_codex_models.py` | Complete 검사에서 발견된 `ModelSettingsTests::test_model_standard_five_roles`의 balanced preset 기대값만 정정 |

모든 파일을 수정할 필요는 없다. 구현 수정이 필요한 경우 Orchestrator가 실패 원인에 연결된 정확한 파일과 소유권을 확인하여 배정한다.

### Input / Output Interface

**Input:**

- 현재 npm 실패 결과와 baseline 비교 근거.
- 기존 변경의 실제 diff.
- Installer-parity destination과 test coverage.

**Output:**

- 실패 원인과 수정 근거.
- 수정·확인한 파일 목록.
- Destination별 mapping 정정 근거.
- 두 필수 명령의 최종 통과 결과.

### Dependencies

Orchestrator가 현재 checkout·변경 상태·소유권과 편집 대상 파일을 확인하여 Implementer에게 전달한다.

### Ownership

- **Implementer:** 원인 조사, 배정 파일 수정, focused check.
- **QA:** 최종 변경 상태의 필수 검사와 필요한 재확인.
- **Orchestrator:** 파일 소유 범위, 결과 검토 및 수용.
- **Reviewer:** 기존 ARC 절차에 따른 최종 변경 검토.

### Step 1 — 실패 재현과 원인 연결

- [ ] `npm test`를 실행하고 현재 실패별 test·assertion·원인 후보를 기록한다.
- [ ] 전달된 21건 분류를 실제 결과와 대조한다.
- [ ] 각 실패를 기대값 오류 또는 구현 동작 오류로 근거 있게 분류한다.
- [ ] 필요한 수정 파일을 확정한다.

전달된 분류는 baseline-identical 12건, 기존 protected-output 실패의 관측 내용 변경 1건, rendering 기대값 불일치 8건이다. 실제 실행 결과가 다르면 새 결과를 기준으로 기록한다.

**완료 증거:** 실패별 결과와 수정 대상의 연결.

### Step 2 — npm 실패 수정

- [ ] Baseline-identical 실패를 포함한 모든 실패의 원인을 수정한다.
- [ ] Protected-output hash는 보호 대상의 실제 diff를 확인한 뒤 필요한 기대값만 갱신한다.
- [ ] Rendering 8개 조합은 Codex/Claude × en/ko × `skipGlobal` false/true 각각을 대조한다.
- [ ] 첫 assertion 수정 후 드러나는 추가 실패도 처리한다.
- [ ] 필요한 focused check로 수정 동작을 확인한다.

**완료 증거:** 실패별 변경과 기대 동작의 연결. 단순히 관측값을 복사하여 기대값을 바꾸지 않는다.

### Step 3 — Stale parity mapping 정정

- [ ] `node scripts/check-installer-parity.mjs --complete`를 실행하여 stale 참조와 모든 관련 destination·owner를 기록한다.
- [ ] 최초 19개 destination뿐 아니라 수정 후 추가로 드러나는 stale 참조도 같은 절차로 처리한다.
- [ ] 동일 이름을 여러 owner가 참조하면 owner별로 확인한다. 하나를 정정했다고 다른 owner도 해결됐다고 추정하지 않는다.

#### 확인된 참조 A — Consumer

기존 이름:

`packed help/check/dry-run and failed preflight leave real homes untouched`

현재 연결 대상:

`packed help, metadata and service preparation leave real homes untouched`

파일:

`/Users/yunho/Desktop/project/arc/tests/node/consumer.test.mjs`

- [ ] Destination별 현재 assertion과 필요한 보장을 대조하여 연결한다.
- [ ] 이전 이름에 포함된 모든 성공 동작이 현재 test에도 존재한다고 가정하지 않는다.

#### 확인된 참조 B — 제거된 check·dry-run 성공 경로

기존 이름:

`check and dry-run inspect both targets without writes or external commands`

기존 참조 파일:

`/Users/yunho/Desktop/project/arc/tests/node/cli.test.mjs`

현재 관련 파일:

`/Users/yunho/Desktop/project/arc/tests/node/cli-dry-run.test.mjs`

현재 dynamic case의 입력:

- `--target all --preset balanced --language en --check`
- `--target all --preset balanced --language en --dry-run`

- [ ] 위 입력으로 생성되는 정확한 전체 test 이름을 확인하여 사용한다.
- [ ] 제거된 문법 거부와 harness 상태 보존 assertion에 연결한다.
- [ ] 기존 성공 inspection과 현재 거부 동작을 동등한 동작으로 설명하지 않는다.

#### 확인된 참조 C — 제거된 generated/global 변경 목록 출력

기존 이름:

`dry-run lists generated files and Codex/Claude global changes while check remains read-only`

- [ ] 이 이름을 사용하는 모든 destination·owner를 확인한다.
- [ ] 성공적인 목록 출력 계약은 TUI-only 공개 계약으로 대체됐음을 기록한다.
- [ ] 현재 적용되는 문법 거부·상태 보존 보장은 실제 assertion에 연결한다.
- [ ] Generated file·global 변경 목록이 현재 공개 CLI 출력으로 제공된다고 주장하지 않는다.

#### 확인된 참조 D — 이전 help·version 계약

기존 이름:

`help and version run from a copy with no native loader or binaries`

확인된 관련 owner는 두 개다.

- [ ] 두 owner 각각의 destination과 현재 coverage를 확인한다.
- [ ] 현재도 유지되는 help·version·의존성 관련 보장만 실제 assertion에 연결한다.
- [ ] 이전 `--target` help가 현재도 제공된다고 주장하지 않는다.
- [ ] 대체된 부분은 TUI-only 계약에 따른 재분류로 기록한다.

#### 확인된 참조 E — 이전 shell wrapper 계약

기존 이름:

`shell wrapper forwards arguments and status`

확인된 관련 owner는 두 개다.

- [ ] 두 owner 각각의 destination과 현재 wrapper assertion을 확인한다.
- [ ] 현재 유지되는 인자·상태 처리만 실제 coverage에 연결한다.
- [ ] 기존 target argument forwarding이 현재도 유효하다고 주장하지 않는다.
- [ ] 대체된 부분은 TUI-only 계약에 따른 재분류로 기록한다.

#### Destination별 정정 원칙

- [ ] 발견된 모든 stale 참조에 destination·owner·기존 이름·현재 test/case·관련 assertion·처분을 기록한다.
- [ ] 현재 적용되는 보장은 정확한 현재 test에 연결한다.
- [ ] 제거된 성공 CLI·npx 출력은 destination별로 TUI-only 재분류 근거를 기록한다.
- [ ] 현재 안전·상태 보존 assertion의 coverage 누락이 없는지 확인한다.
- [ ] `legacyInventory`와 assertion lines를 보존한다.
- [ ] Retirement allowlist를 확대하지 않는다.
- [ ] 기존 checker로 처분을 표현할 수 없거나 현재 coverage에 gap이 있으면 Orchestrator에게 반환한다.
- [ ] 정정 후 complete 검사를 다시 실행하여 추가 stale 참조가 없는지 확인한다.

**완료 증거:** Complete 검사에서 발견된 전체 stale destination·owner의 정확한 현재 연결 또는 재분류 기록. 최초 19개만 처리한 상태로 완료하지 않는다.

### Step 4 — Complete 검사 blocker 수정과 최종 수용

- [ ] Complete 검사에서 발견된 `tests/test_codex_models.py::ModelSettingsTests::test_model_standard_five_roles`의 기대값을 현재 model config·canonical profile과 대조한다.
- [ ] 해당 test의 balanced preset 기대값만 다음 값으로 정정한다.

| 역할 | 모델 | Reasoning effort |
|---|---|---|
| scouter | `gpt-6-luna` | `high` |
| planner | `gpt-6.1-sol` | `high` |
| implementer | `gpt-6.1-sol` | `high` |
| qa | `gpt-6-luna` | `max` |
| reviewer | `gpt-6.1-sol` | `high` |

- [ ] 이 correction에서는 `codex/skill/models.toml`, canonical profiles 및 production 파일을 변경하지 않는다. 다른 test나 assertion을 약화하지 않는다.
- [ ] 최종 변경 상태에서 `npm test`를 실행한다.
- [ ] 같은 변경 상태에서 `node scripts/check-installer-parity.mjs --complete`를 실행한다.
- [ ] 실패가 남으면 원인을 분류하고 승인된 범위에서 처리한다. 추가 수정이 범위를 넘으면 Orchestrator에게 반환한다.
- [ ] 필요한 QA·Reviewer가 같은 변경과 결과를 확인한다.
- [ ] Orchestrator가 수용 기준을 확인한다.

| 명령 | Passing evidence |
|---|---|
| `npm test` | Exit 0, 실패 0건 |
| `node scripts/check-installer-parity.mjs --complete` | Exit 0, 해당 Python suite를 포함한 complete 검사 통과 |

**완료 증거:** 해당 test의 기대값만 변경한 diff, 두 명령, 검사한 최종 변경 상태, 결과와 로그 위치.

### Step 5 — 검토와 수용

- [ ] 변경 목록과 실패별 수정 근거를 검토한다.
- [ ] 필요한 QA 재확인과 기존 ARC 최종 검토를 완료한다.
- [ ] Orchestrator가 아래 수용 기준을 확인한다.

### Acceptance Criteria

| ID | 수용 기준 |
|---|---|
| R1-01 | `npm test`가 Exit 0, 실패 0건으로 통과한다. |
| R1-02 | Complete 검사에서 드러난 모든 stale destination·owner가 확인·정정된다. |
| R1-03 | 현재 보장은 정확한 test/case·assertion에 연결되고, 제거된 성공 계약은 TUI-only 재분류로 기록된다. |
| R1-04 | 제거된 CLI·npx 출력, 이전 `--target` help·target argument forwarding이 현재도 존재한다고 주장하지 않는다. |
| R1-05 | 현재 안전·상태 보존 assertion의 coverage 누락이 없다. |
| R1-06 | `legacyInventory`·assertion lines를 보존하고 retirement allowlist를 확대하지 않는다. |
| R1-07 | `node scripts/check-installer-parity.mjs --complete`가 통과한다. |
| R1-08 | 두 통과 결과가 최종 변경 상태에 연결되고 기존 변경을 보존한다. |
| R1-09 | `ModelSettingsTests::test_model_standard_five_roles`의 balanced 기대값만 현재 config·canonical profile에 맞춰 정정하며, 해당 correction으로 production 파일은 변경하지 않는다. |

### Hold Conditions

- 필수 명령이 실패하거나 실행되지 않음.
- 실패 원인이나 mapping coverage가 확인되지 않음.
- 편집 대상의 소유권 또는 현재 변경 상태가 불명확함.
- 수정·검사 중 부분 완료나 상태 불확실성이 발생함.

영향받는 작업은 기존 ARC 실패 처리 절차에 따라 보류한다.

## 완료 보고

두 필수 명령의 결과, 실제 변경 파일, 실패별 수정 근거, mapping coverage 및 검토 결과를 보고한다.

## Planner 자체 검토

- 남은 목표와 수용을 npm 전체 실패 수정 및 stale parity mapping 정정으로 한정했다.
- Baseline 실패를 수정 범위에 포함했다.
- 정확히 전달된 파일·test 이름·명령을 유지했다.
- 구현 파일 경로를 추측하지 않았다.
- 기대값·mapping 갱신으로 보호를 약화하지 않도록 기준을 명시했다.
- Complete 검사에서 발견된 Python model 기대값 blocker를 포함하고, correction을 해당 test의 현재 balanced config 기대값으로 한정했다.
- Commit 단계를 추가하지 않았다.
- 파일 편집·명령·검증은 수행하지 않았다.

