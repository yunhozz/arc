# Gemini 플랫폼 완전 지원 Phase B 구현 계획

> **실행 방식:** ARC Orchestrator가 작업마다 새 Implementer(Codex bridge `arc_routing_implementer`)를 배정합니다. 수용 후 작업 하나당 커밋 하나를 Orchestrator가 만듭니다. Implementer와 QA는 Git 상태를 바꾸지 않습니다.

**Goal:** Phase A 후속 결함 F4–F6을 먼저 고칩니다. 이어서 anchor 순서를 claude > codex > gemini로 바꾸고 기존 composite를 마이그레이션한 뒤, Gemini를 세 번째 플랫폼으로 등록합니다. 설치, 상태, composite, bridge를 capability off 상태로 넣고, live 증거가 생긴 capability만 순차로 verified로 바꿉니다.

**Architecture:** capability의 원천은 runtime descriptor(`lib/runtime/platform-registry.mjs`)이고 설치기 descriptor(`lib/platforms/gemini.mjs`)는 이를 참조만 합니다. 코드는 먼저 일반화합니다. lease v2, watch anchor 탐색, legacy 판정과 마이그레이션, auth none 및 capability off 표면을 주입 레지스트리로 검증합니다. 그다음 anchor 순서 전환과 Gemini 등록을 별도 작업으로 넣습니다. Gemini 외부 계약은 fake `gemini`(stream-json fixture)로 코드 경로만 검증하고, live 검증은 Orchestrator가 맡습니다.

**Tech Stack:** Node.js ESM(`.mjs`), `node:test`, 기존 safe-fs, PTY 헬퍼(`tests/node/helpers/tui-terminal.mjs`), 주입 레지스트리(`tests/node/fixtures/platforms/zeta.mjs`)

**Spec:** `docs/superpowers/specs/2026-11-16-gemini-platform-phase-b-design.md`(2026-11-16 승인, sha256 `7faefbb9d8f4b2d5ed3fb2f4d802590084f164248efcaf601ac95cc57ce60355`). 선행: `docs/superpowers/specs/2026-11-15-tui-arc-diagram-flow-design.md`

## Global Constraints

- `lib/runtime/**`는 `lib/runtime` 내부만 import합니다(`lib/models`, `lib/installer`, `lib/platforms` 금지).
- 새 runtime 모듈을 추가하면 같은 작업에서 다음 다섯 가지를 함께 갱신합니다: `RUNTIME_MODULE_PATHS`(`lib/installer/runtime-assets.mjs`), `COOPERATIVE_RUNTIME_MODULES`(`lib/runtime/bootstrap.mjs`), `MANIFEST.sha256`, `tests/node/fixtures/installed-layout-golden.json`, runtime-assets `--check`. `tests/node/runtime-assets.test.mjs`의 `expectedPaths`도 함께 고칩니다.
- `shared/skill/runtime/**`는 손으로 고치지 않습니다. `node scripts/update-runtime-assets.mjs`로만 동기화합니다.
- `lib/policy/role-policy.json`은 각 role `controls`에 `gemini` 키를 추가하는 것만 허용합니다. codex/claude 생성물은 바이트 단위로 같아야 합니다(Q4, AC-R1).
- 레지스트리 값(최종): claude `displayOrder 0, anchorOrder 0` / codex `displayOrder 1, anchorOrder 1` / gemini `displayOrder 2, anchorOrder 2`. `DEFAULT_INSTALLER_REGISTRY` 순서는 `[CLAUDE, CODEX, GEMINI]`입니다.
- gemini descriptor: `home.env 'GEMINI_CLI_HOME'`(설정되어 있으면 `unresolved`), 기본 `~/.gemini`, `cli.command 'gemini'`, `cli.supportedVersions '>=0.68.0 <0.69.0'`, `auth.kind 'none'`, `models.effortField 'effort'`, `profile.ext 'md'`, `standaloneName 'arc-<suffix>'`, `routingName 'arc-routing-<suffix>'`, `executionEnvironments ['gemini-cli']`.
- Gemini capability의 초기 상태는 전부 `off`이고 reason은 정확히 다음 값입니다.
  - `install`: `install layout not verified`
  - `nativeProfile`: `native profile format not verified`
  - `catalog`: `catalog not verified`
  - `standalone`: `standalone not verified`
  - `bridge`: `bridge contract not verified`
  - `compositeRole`: `composite role not verified`
  - `compositeHost`: `composite host not verified`
  - `authProbe`: `no official auth status command`
  - `watch`: `watch support out of scope`
- 정확한 문구:
  - `Gemini is not available: capability not verified`
  - `Gemini: auth unverified — ARC cannot confirm Gemini CLI login.`
  - `Gemini: auth unverified`(사유 줄)
  - `Gemini - Unavailable  (capability not verified)`
  - `- Unavailable  (capability not verified)`
  - `Gemini: Not verified` / `Gemini: Not Available` / `Gemini: Unsupported version` / `Gemini: Available (auth unverified)`
  - `Gemini  (not installed)`
  - `Gemini settings.json is preserved.`
  - `Mixed routing files will move to the Claude home.`
  - `Mixed routing will move to the Claude home on the next Install / Update.`
  - `Dispatch history stays in <codex home>/arc-role-dispatch.`
  - `dispatch store ambiguous`
  - `Update ARC to a release that verifies this platform capability.`
  - `After upgrading ARC, run Install / Update again.`(유지)
- reason code 신규: `capability_not_verified`, `resume_unverified`. 기존: `permission_scope_unverified`, `host_sandbox_blocked`, `auth_rejected`, `activation_unverified`
- gate 신규: `BRIDGE_GATE_RESULTS.GG1 = 'fail'`, `GG2 = 'fail'`
- management 필드 추가: prepare `warnings: ['gemini:auth_unverified']`, `anchorMove: {from:'codex', to:'claude'}`. 기존 필드의 의미는 바꾸지 않습니다.
- 바꾸지 않는 것: `kind:'preset'`, `skipGlobal`, `switchFromComposite`, `target: codex|claude|all|composite`의 의미(`all`은 Q7 정의). 파일 이름 `arc-role-platform-routing.json`, `.prepared.json`, `.lock`, `arc-role-dispatch/`와 marker 형식도 바꾸지 않습니다.
- 금지: Gemini `--allowed-tools`, `--yolo`, `--approval-mode yolo`, `--skip-trust`, `--raw-output`. live 증거 없이 `verified`로 바꾸는 것. 검증 전 `settings.json` 쓰기(P-B2). old anchor `arc-role-dispatch/`의 이동·삭제.
- 마이그레이션은 Install / Update(TUI Apply, management `target:'composite'` publish) 안에서만 일어납니다. 패키지 설치, `arc upgrade`, runtime 명령, status는 파일을 옮기지 않습니다.
- 테스트 전용 플랫폼과 fixture는 `tests/node/fixtures/**`에만 둡니다. 운영 코드는 이를 import하지 않습니다.
- 커밋 메시지 형식은 `type(scope): 한국어 설명`이며, 수용 후 Orchestrator가 만듭니다.

### 표준 마무리 절차 (STD-CLOSE, 모든 코드 작업의 마지막 검증 단계)

1. `lib/runtime/**`를 바꿨다면 `node scripts/update-runtime-assets.mjs`를 실행한 뒤 `node scripts/update-runtime-assets.mjs --check`가 `Runtime payload verified`를 내는지 확인합니다.
2. runtime 파일 해시가 바뀌었다면 다음을 갱신합니다.
   - `node tests/node/fixtures/installed-layout.mjs --write`로 golden을 갱신합니다.
   - `tests/node/runtime-versions.test.mjs`의 baseline hash를 의도된 값으로 고칩니다.
3. `node scripts/update-manifest.mjs`를 실행하고 `npm run check:manifest`가 통과하는지 확인합니다.
4. `npm run check:role-policy`가 통과해야 합니다. T10 이전에는 생성물 변경 0건이어야 합니다. T10 이후에는 codex/claude 생성물 무변경, gemini는 기대 생성물입니다.
5. `node scripts/check-installer-parity.mjs`가 통과해야 합니다.
6. 작업 단위 테스트(`node --test <파일>`)가 PASS여야 합니다.
7. `npm test`(Orchestrator 실행): 기준 실패 36건 밖의 신규 실패가 0건이어야 합니다(16장 판정 원칙, 아래 "검증 판정" 절).
8. TUI를 바꾼 작업은 PTY 테스트(`tests/node/tui-app-pty.test.mjs`, `tests/node/cli-pty.test.mjs` 중 해당 파일)가 PASS여야 합니다.
9. `git status --short`에는 해당 작업의 Files와 생성물(`MANIFEST.sha256`, `shared/skill/runtime/*`, golden)만 보여야 합니다.

bridge Implementer는 live Gemini, 네트워크, 실제 home 설치를 실행하지 않습니다. 7번과 실제 CLI 검증은 Orchestrator가 합니다.

## Review Focus

1. **`GEMINI_CLI_HOME`이 설정된 사용자.** Gemini home 해석은 실패해야 합니다. 그래도 Gemini가 S 밖이면 Codex/Claude의 Install / Update와 status가 막히지 않아야 합니다(Phase A 6.4.8). 테스트: T10 `gemini home env set does not block codex/claude install`
2. **진행 중 dispatch가 있는 legacy 사용자가 업그레이드 후 Install / Update를 실행하는 경우.** 이동은 held여야 하고, 파일 무변경과 dispatch id 표시가 있어야 합니다. dispatch가 끝난 뒤 재실행하면 성공해야 합니다. 테스트: T7 `legacy migration held then succeeds after lease terminal`
3. **dotfile 관리로 `~/.gemini`나 `~/.claude`가 symlink인 환경.** symlink home은 지원하지 않습니다(spec 결정 11). 설치기와 runtime이 똑같이 거부하고 파일을 바꾸지 않아야 합니다. 테스트: T3(AC-F6). 결정 10 이후 기본 anchor가 Claude home이므로 T8에 `symlinked claude home ancestor is rejected after flip without file changes` 1건을 둡니다.
4. **rollback 잔여물로 marker 후보가 2개 이상 남은 상태에서 watch를 띄우는 경우.** `dispatch store ambiguous`만 표시하고 store는 읽지 않아야 합니다. 테스트: T6
5. **Gemini CLI가 range 밖(예: 0.69.0)이거나 capability off인데 이전 설치 흔적이 있는 경우.** 상태줄은 `Gemini: Not verified`이고(install off가 우선), Uninstall은 허용되어야 합니다(P-B3). 테스트: T9, T11

## Orchestrator 결정 (계획 검토, 2026-11-16)

Planner 질문과 가정에 대한 판단입니다. 모두 승인된 spec 범위 안의 해석이며 새 제품 결정은 없습니다.

- **Q-O1 GG1:** spec 9.2에 GG1 live 전환 항목이 없으므로 Phase B 동안 `fail`을 유지합니다. Gemini Implementer/QA bridge는 Phase B 내내 `permission_scope_unverified`로 hold됩니다(spec 10.2, Q8). GG1 전환은 별도 승인 단계입니다.
- **Q-O2 GG2:** spec 9.2 compositeHost 통과 조건이 "11장 GG2 통과"이므로, L7 증거가 GG2 항목을 포함해 `pass`일 때만 `GG2:'pass'`를 같은 커밋에 넣습니다.
- **Q-O3 기준 실패와 겹치는 작업:** T11·T14처럼 영향 범위가 기준 실패 테스트와 겹치는 작업은 대체 증거(fixture 테스트, `npm pack --dry-run`, 해당 테스트 단독 재실행이 기준선과 같은 실패 메시지인지 비교)로 판정합니다. 실패 메시지가 기준선과 달라지면 신규 실패로 봅니다.
- **Q-O4 range 밖 버전:** L 단계에서 로컬 `gemini --version`이 0.68.x가 아니면 중단하고 사용자에게 보고합니다(spec 9.4).
- **Q-O5 T8 범위:** 이관 대상이 40개 파일을 넘으면 Orchestrator가 범위를 사용자에게 보고하고 진행 여부를 묻습니다. 순서 전환만 먼저 커밋하는 분할은 하지 않습니다.
- **가정 A1 확인:** 운영 codex/claude descriptor는 모든 capability가 `verified`입니다(`lib/runtime/platform-registry.mjs:59,75,90`). 6.1 선행 조건을 만족합니다.
- **가정 A2–A4:** 그대로 채택합니다(zeta 3·eta 4 재배치, 부록 A는 계획 문서에 기록, `lib/npm/upgrade.mjs`의 registry 인자 생략 허용).
- **역할 경로:** Implementer와 QA는 Codex bridge, Reviewer는 native Claude입니다(routing revision `c9e69910-0738-4749-be32-9021a2c3c8b2`). bridge 자식은 live Gemini, 네트워크 의존 검사, 실제 home 설치를 하지 않습니다.

---

## 의존성과 실행 순서

**논리 DAG**

| 작업 | 제목 | 선행 |
|---|---|---|
| T1 | F4 S 밖 standalone status/upgrade | — |
| T2 | F5 runtime anchor 신뢰 경계 | — |
| T3 | F6 symlink home 판정 일치 테스트와 문서화 | T2 |
| T4 | F7a + F1 비anchor switch 테스트(테스트 전용) | T1, T2, T3 |
| T5 | lease v2, capability hold, runtime 문구 일반화 | T2, T4 |
| T6 | watch anchor 탐색 | T2 |
| T7 | legacy 판정과 마이그레이션 엔진(주입 레지스트리) | T1, T3 |
| T8 | anchor 순서 전환, v2 항상 기록, 기존 테스트 이관 | T5, T6, T7 |
| T9 | auth none / capability off 일반 표면 | T8 |
| T10 | Gemini descriptor 등록 | T1–T4, T9 |
| T11 | Gemini payload, 설치·제거 | T10 |
| T12 | Gemini bridge(실행·관찰·취소·재개 플래그, GG1/GG2) | T5, T10 |
| T13 | Gemini 참여 composite 통합 | T11, T12 |
| T14 | 문서·skill 문구·README·harness | T8, T13 |
| L1–L7 | capability live 전환(install → catalog → nativeProfile → standalone → bridge → compositeRole → compositeHost) | T14, 앞 L 작업 |
| FR | 최종 독립 Reviewer 1회 | 모든 작업 수용(L 작업은 수용 또는 no-change 종료) |

**공유 계약과 직렬화 근거**

- 모든 코드 작업이 `MANIFEST.sha256`을 바꿉니다.
- `lib/runtime/**`를 바꾸는 작업(T2, T5, T8, T9, T10, T12, L5–L7)은 다음 세 가지도 함께 바꿉니다.
  - `shared/skill/runtime/*`
  - `installed-layout-golden.json`
  - `tests/node/runtime-versions.test.mjs` baseline
- T10, T11은 golden의 gemini 레이아웃을, T10은 role-policy 생성물을 바꿉니다.
- 같은 생성물을 동시에 고칠 수 없으므로 **실제 실행은 전부 직렬**입니다.
- 논리적으로는 다음 쌍이 독립입니다. 실패 시 hold 범위를 정할 때 이 독립성을 씁니다.
  - T1 ↔ T2
  - T6 ↔ T7
  - T11 ↔ T12
- 같은 파일을 고치는 작업 쌍과 직렬 근거:
  - `lib/runtime/role-routing.mjs`: T2 → T5 → T8. F5 검사 함수를 T5, T6이 재사용합니다.
  - `lib/installer/role-routing.mjs`: T7 → T8 → T13
  - `tests/node/install-mode-n-platform.test.mjs`: T1 → T4 → T7 → T8 → T13
  - `tests/node/role-routing-anchor.test.mjs`: T2 → T3 → T4 → T5 → T8
  - `lib/runtime/platform-registry.mjs`: T8 → T9 → T10 → L*
  - TUI 스냅샷 테스트: T7 → T8 → T9 → T10 → T11
- 분리할 수 없는 계약은 한 작업에 묶습니다.
  - runtime + 설치기 descriptor + AC-P1 일관성 테스트 + 금지 패턴 + role-policy `controls.gemini` + zeta `anchorOrder` 재배치: T10
  - anchor 순서 + v2 항상 기록 + 기존 테스트 이관: T8
  - descriptor 상태 + 증거 + 회귀 테스트: 각 L 작업

**실행 순서(직렬):** T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10 → T11 → T12 → T13 → T14 → L1 → L2 → L3 → L4 → L5 → L6 → L7 → FR

**hold 범위:** 실패한 작업은 DAG상 후속만 막습니다.

- T6이 실패하면 T8 이후만 막고 T7은 진행합니다.
- T11이 실패하면 T13, T14, L*을 막고 T12는 진행합니다.
- L 작업이 증거 실패로 no-change 종료되면, 6.1 선행 관계상 그 capability가 필요한 L 작업도 no-change 종료합니다.
  - catalog 실패 → standalone, bridge, compositeRole도 no-change
  - nativeProfile 실패 → standalone, compositeHost도 no-change
  - 선행이 독립인 작업은 계속합니다(예: catalog 실패에도 L3 nativeProfile과 L7 compositeHost는 진행).

**anchor 전환 커밋 안전성 판단(P5)**

- 순서만 바꾸는 중간 커밋은 안전하지 않습니다. Codex home에 v1 설정이 있는 기존 composite가 legacy 판정 없이 `unverified`가 되어 Install / Update로도 복구할 수 없습니다.
- 그래서 다음처럼 나눕니다.
  - **T7(엔진):** 운영 순서에서는 발동하지 않는 legacy 판정과 이동 경로를 먼저 넣습니다. 주입 레지스트리(claude `anchorOrder 0`)로 검증합니다.
  - **T6:** watch 탐색을 전환 전에 넣습니다. 전환 전에는 후보가 Codex home 하나이므로 동작이 같습니다.
  - **T8:** 운영 descriptor 전환과 v2 항상 기록, 기존 테스트 이관을 한 커밋에 넣습니다.
- "v2 항상 기록"은 T8에 둡니다. 전환 전에 이를 켜면 Codex home에 v2가 기록되고, 이것은 전환 후 legacy가 아닌 `unverified`(6.7.1)가 됩니다.
- 테스트 이관을 T8에서 떼어 내면 T8 자체가 `npm test`를 통과하지 못해 독립 수용이 불가능합니다. 그래서 분리하지 않습니다.
- 사전 "anchor 계산 헬퍼로 기대값 파라미터화" 작업도 두지 않습니다. 기대값을 코드와 같은 레지스트리에서 계산하면 테스트가 자기 참조가 되어 검사 강도가 떨어지기 때문입니다.

**필수 QA(수용 전 fresh QA, Codex bridge)**

- 대상(고위험: runtime/bridge/권한/마이그레이션/composite/upgrade): T1, T2, T5, T7, T8, T9, T10, T12, T13, L5, L6, L7
- 나머지 T3(개정 v2), T4, T6, T11, T14, L1–L4는 Orchestrator가 focused check와 STD-CLOSE 증거로 확인합니다.
- Reviewer는 작업마다 두지 않습니다. FR에서 전체 변경을 1회 검토합니다.

---

### Task T1: F4 — composite 중 S 밖 standalone의 status/upgrade 처리

**AC:** AC-F4(부분), AC-P2'

**목표:** composite일 때 S의 home만 composite 경로(profiles `omit`)로 처리합니다. S 밖 home은 standalone 규칙(Phase A 6.4.7)으로 검사하고 갱신합니다. upgrade 경로 전체에 context registry를 넘깁니다.

**Files:**
- Modify:
  - `lib/installer/upgrade.mjs:8-23`(`buildUpgradePlans`: `profiles`를 target별로 정함, `registry` 인자 추가)
  - `lib/installer/upgrade-state.mjs:12`(`collectInstalledState`가 `platforms`/`runtimePlatforms`를 받아 state에 `platforms`(S)와 registry를 실음)
  - `lib/management/update.mjs:30,39,55`(registry 전달)
  - `lib/npm/upgrade.mjs:48,51`(pinned API 호출에 registry 전달. 인자 생략 시 기본 레지스트리로 동작해 하위 호환)
  - `lib/management/status.mjs:12-13`(composite면 S 밖 플랫폼의 standalone 상태 보고)
- Test: `tests/node/install-mode-n-platform.test.mjs`(추가), `tests/node/upgrade-state.test.mjs`(추가)

**Interfaces:**
- Produces:
  - `buildUpgradePlans({payload, state, safeFs, registry?})`. `state.mode==='composite'`이면 `state.platforms`(S)에 든 target만 `profiles:'omit'`, 그 밖은 `'write'`
  - `collectInstalledState({safeFs, userHome, env, cwd, platforms?, runtimePlatforms?}) -> {mode, platforms?, targets, residualPaths, stateToken, ...}`. composite이면 `platforms`가 S

- [x] **Step 1: 실패 테스트 작성**(zeta 주입, S={codex,claude}, zeta standalone 설치됨)
  - `F4 status reports standalone outside S during composite`: `collectStatus(ctx)`의 zeta 항목이 `state:'installed'`이고 standalone 검사 결과를 갖습니다. codex/claude 항목은 현행과 deepEqual입니다.
  - `F4 upgrade rewrites standalone profiles outside S`: `buildUpgradePlans`의 zeta plan writes에 `arc-*` standalone 프로필이 있고, codex/claude plan에는 profile write가 0건입니다.
  - `F4 upgrade uses context registry`: 주입 registry를 넘기지 않으면 zeta target이 생기지 않고, 넘기면 생깁니다.
  - `upgrade-state.test.mjs`의 `composite state carries participating set`: `state.platforms`가 `['codex','claude']`(anchorOrder 순)입니다.
- [x] **Step 2: 실행해 실패 확인**: `node --test tests/node/install-mode-n-platform.test.mjs tests/node/upgrade-state.test.mjs`. 기대: 위 4건 FAIL
- [x] **Step 3: 구현.** state에 S를 싣고 per-target `profiles`를 고릅니다. registry가 없으면 기존 기본 레지스트리를 씁니다. 운영 codex+claude 결과는 바이트 단위로 같아야 합니다.
- [x] **Step 4: 통과 확인**: Step 2 명령 PASS. `tests/node/upgrade*.test.mjs`, `tests/node/management-status*.test.mjs` 무변경 PASS
- [x] **Step 5: STD-CLOSE**(runtime 무변경이므로 1–2 생략)

**필수 검사:** 작업 테스트, `npm test`, `check:manifest`, `check:role-policy`, parity
**필수 QA:** 예(upgrade 경로)
**보류 조건:** 운영 codex+claude upgrade 결과가 바뀌면 보류합니다. `lib/npm/upgrade.mjs` pinned API 호환성(이전 버전 management API 호출)이 깨지면 보류하고 Orchestrator에 보고합니다.

---

### Task T2: F5 — runtime `locateAnchorHome` 신뢰 경계

**AC:** AC-F5

**목표:** marker의 `activeConfigPath` 디렉터리가 등록 플랫폼의 해석된 home 중 하나와 정확히 같을 때만 lock을 만듭니다. terminal lease 정리는 lock 안에서 전체 검증(Phase A 6.9.4)을 통과한 뒤에만 합니다.

**Files:**
- Modify: `lib/runtime/role-routing.mjs:73`(`locateAnchorHome`과 호출부의 정리 순서)
- Test: `tests/node/role-routing-anchor.test.mjs`(추가)

**Interfaces:**
- Produces: `export function matchRegisteredHome({dir, homes}) -> string|null`(`lib/runtime/role-routing.mjs`). `homes`는 `{[platformId]: resolvedHome}`이고, 정확히 같은 경로의 platform id를 돌려줍니다. 정규화는 `path.resolve` 뒤 문자열 비교입니다. T6이 재사용합니다.

- [x] **Step 1: 실패 테스트 작성**
  - `F5 marker pointing outside registered homes creates no files`: 임시 디렉터리 X를 가리키는 marker로 routing-status/prepare를 호출하면 결과 `activation_unverified`이고, X 안 파일 수 0, 등록 home의 `.lock` 미생성입니다.
  - `F5 terminal lease cleanup only after full verification`: 등록 home이지만 프로필 해시가 불일치하는 상태에서 terminal lease 파일이 그대로 남습니다(`fs.existsSync(leasePath)===true`).
  - `F5 matchRegisteredHome exact match only`: 하위 디렉터리, 상위 디렉터리, 후행 슬래시 차이는 정규화 후 판정하고, 하위·상위는 `null`입니다.
- [x] **Step 2:** `node --test tests/node/role-routing-anchor.test.mjs`. 기대: 위 3건 FAIL
- [x] **Step 3:** lock 생성 전에 `matchRegisteredHome` 검사를 넣고, 실패하면 파일을 만들지 않고 `activation_unverified`를 냅니다. lease 정리 호출은 전체 검증 성공 분기 뒤로 옮깁니다.
- [x] **Step 4:** Step 2 PASS, `tests/node/role-routing-*.test.mjs` 전체 PASS
- [x] **Step 5:** STD-CLOSE(runtime 변경: 1–9 전부)

**필수 검사:** 작업 테스트, `npm test`, runtime-assets `--check`, golden, runtime-versions baseline, `check:manifest`, `check:role-policy`
**필수 QA:** 예
**보류 조건:** 정상 Codex+Claude composite의 lease 정리 동작이 바뀌면(정리 시점 외의 차이) 보류합니다.

---

### Task T3: F6 — symlink home 판정 일치 테스트와 문서화 (개정 v2)

**AC:** AC-F6

**목표:** ARC의 현행 정책(플랫폼 home과 그 조상에 symlink가 있으면 거부)을 유지합니다. 설치기의 anchor 이동 lock 준비(`prepareLockHome`)와 runtime lock 획득이 같은 경로 조합에서 같은 판정을 내고 파일을 바꾸지 않는다는 것을 테스트로 고정합니다. README와 harness 문서에 이 제한을 적습니다. 운영 코드는 바꾸지 않습니다.

**Files:**
- Modify(테스트): `tests/node/role-routing-anchor.test.mjs`, `tests/node/install-mode-n-platform.test.mjs`
- Modify(문서): `README.md`, `docs/harness-operation.md`(영어 유지. 한 문장 수준)
- 생성물: `MANIFEST.sha256`(문서가 manifest 대상이면)

- [x] **Step 1: 테스트 작성**(임시 디렉터리에서 `linkParent -> realParent` symlink 구성)
  - `F6 symlinked home ancestor rejects anchor-move publish without changes`: 조상이 symlink인 anchor home으로 이동이 일어나는 management composite publish가 거부되고(`Symlink destination is unsafe` 계열), 모든 home 스냅샷이 deepEqual입니다.
  - `F6 symlinked home ancestor rejects runtime lock without changes`: 같은 환경에서 runtime 명령이 lock을 만들지 않고 hold/`activation_unverified`이며 파일이 바뀌지 않습니다.
  - `F6 installer and runtime verdicts agree`: {조상 symlink, home 자체 symlink, `<home>/arc-role-dispatch` symlink, lock 파일 symlink, 정상} 조합 표에서 설치기 `prepareLockHome`(또는 이를 쓰는 publish)와 runtime `acquireRoleRoutingLock`의 성공·거부가 1:1로 일치합니다.
- [x] **Step 2:** 테스트 실행. 현행 코드에서 통과해야 합니다(정책 고정 테스트). 통과하지 않는 조합이 있으면 운영 코드를 바꾸지 말고 멈추고 보고합니다.
- [x] **Step 3:** README와 harness 문서에 "Platform homes and their parent directories must not be symbolic links; ARC refuses to install, publish or take routing locks through them." 수준의 문장을 추가합니다.
- [x] **Step 4:** STD-CLOSE(3, 5–7, 9)

**필수 검사:** 작업 테스트, `npm test`, `check:manifest`, parity
**필수 QA:** 아니요(운영 코드 무변경, 정책 고정 테스트). Orchestrator가 테스트의 실효성을 확인합니다(symlink 검사를 임시로 끈 사본에서 실패하는지).
**보류 조건:** 운영 코드 변경이 필요해 보이면 멈추고 보고합니다.

---

### Task T4: F7a + F1 비anchor 참여 플랫폼 switch 테스트(테스트 전용)

**AC:** AC-F7

**목표:** host marker 재확인 테스트의 lstat 호출 횟수 의존을 없앱니다. 비anchor 참여 플랫폼(zeta)의 switch 경로를 테스트로 고정합니다. 운영 코드는 바꾸지 않습니다.

**Files:**
- Modify: `tests/node/role-routing-anchor.test.mjs`(F7a 해당 테스트. Implementer가 `lstat` 호출 횟수 카운터를 쓰는 테스트를 grep으로 특정), `tests/node/install-mode-n-platform.test.mjs`(F1 추가)

- [ ] **Step 1:** F7a 대상 테스트를 특정하고, 같은 동작(재확인 사이에 marker가 바뀌면 거부)을 호출 횟수가 아니라 관찰 가능한 결과(결과 reason, 파일 무변경)로 단언하도록 바꿉니다. 단언 항목 수는 줄이지 않습니다.
- [ ] **Step 2:** `F1 non-anchor participant switch`: S={codex,claude,zeta}에서 zeta(비anchor)를 standalone으로 전환(D1-b 계열)하면 zeta marker 제거, zeta standalone 프로필 기록, anchor 설정 갱신이 일어나고 codex/claude 상태는 composite 규칙대로입니다.
- [ ] **Step 3:** `node --test tests/node/role-routing-anchor.test.mjs tests/node/install-mode-n-platform.test.mjs` PASS
- [ ] **Step 4:** STD-CLOSE(3, 5–7, 9)

**필수 검사:** 작업 테스트, `npm test`, `check:manifest`(테스트는 manifest 대상이 아니면 무변경 확인)
**필수 QA:** 아니요
**보류 조건:** 운영 코드 변경이 필요해 보이면 멈추고 Orchestrator에 보고합니다(이 작업은 테스트 전용).

---

### Task T5: dispatch lease v2, runtime capability hold, runtime 문구 일반화

**AC:** AC-L1, AC-B5, AC-D1(runtime 문구 부분)

**목표:**
- 새 lease는 항상 v2(`targetPlatform`)로 기록합니다.
- v1은 읽기 호환용 2-플랫폼 규칙으로 대상을 얻습니다.
- prepare와 run에서 capability를 다시 확인하고 `capability_not_verified`로 hold합니다.
- `activation_unverified`·`host_sandbox_blocked` 문구를 anchor 기준으로 일반화합니다.

**Files:**
- Modify:
  - `lib/runtime/role-dispatch-store.mjs:22`(`validateLease` v1|v2)
  - `lib/runtime/role-bridge.mjs:20`(`leaseTargetPlatform`)
  - `lib/runtime/role-routing.mjs`(prepare의 v2 기록, capability 재확인)
  - `lib/runtime/role-dispatch-policy.mjs:42-76`(`RELEASE_CONDITIONS` 추가와 문구 변경)
  - run 진입부(`lib/runtime/role-bridge.mjs` 또는 run 진입 모듈)의 capability 재확인
- Create: `tests/node/dispatch-lease-v2.test.mjs`
- Modify(테스트): `tests/node/role-dispatch-store.test.mjs`, release condition 문구를 단언하는 기존 테스트(Implementer가 `<CODEX_HOME>/arc-role-dispatch`, `both prepared markers`, `write the Codex home`을 grep해 갱신)

**Interfaces:**
- Produces:
  - lease v2 키 = v1 키 ∪ `{targetPlatform}`. `validateLease(value, {config, registry})`는 version별로 키 집합을 정확히 검사합니다.
  - `leaseTargetPlatform(lease, registry) -> string`. v1은 native이면 `hostPlatform`, bridge이면 {codex,claude} 중 host가 아닌 쪽입니다. `hostPlatform`이 {codex,claude} 밖이면 `activation_unverified`입니다.
  - `RELEASE_CONDITIONS.capability_not_verified = 'Update ARC to a release that verifies this platform capability.'`
  - `activation_unverified` 문구는 `<anchor home>/arc-role-dispatch`, `all prepared markers`로, `host_sandbox_blocked`는 `… write the anchor home …`으로 바꿉니다.

- [ ] **Step 1: 실패 테스트 작성**(`dispatch-lease-v2.test.mjs`)
  - `new lease is v2 with targetPlatform`: prepare 후 lease에서 `version===2`, bridge이면 `targetPlatform===config.roles[role].platform`, native이면 `===hostPlatform`
  - `v1 lease resolves target with 2-platform rule under 3 registered`: zeta 주입 레지스트리에서 v1 bridge lease(host codex)의 대상은 `'claude'`이고 hold하지 않습니다.
  - `v1 lease with host outside codex/claude is activation_unverified`
  - `invalid v2 rejected`: (a) `targetPlatform`∉S, (b) native인데 target≠host, (c) bridge인데 target===host, (d) 키 초과·누락. 각각 거부
  - `capability off blocks prepare without lease`: zeta `compositeRole` off 주입 레지스트리에서 prepare 결과 reason `capability_not_verified`, store 파일 수 0
  - `capability off host blocks prepare`(`compositeHost` off), `bridge off target blocks bridge route`
  - `run rechecks capability`: lease 생성 후 레지스트리를 off로 바꿔 run하면 `capability_not_verified`
  - 문구 테스트: 바뀐 `RELEASE_CONDITIONS` 값을 정확한 문자열로 단언
- [ ] **Step 2:** `node --test tests/node/dispatch-lease-v2.test.mjs tests/node/role-dispatch-store.test.mjs`. 기대: FAIL
- [ ] **Step 3:** 구현. 기존 Phase A의 "등록 3개 이상 + v1이면 hold" 규칙은 지웁니다.
- [ ] **Step 4:** Step 2 PASS, `tests/node/role-bridge-*.test.mjs`, `tests/node/role-routing-*.test.mjs` PASS
- [ ] **Step 5:** STD-CLOSE(전부)

**필수 검사:** 작업 테스트, `npm test`, runtime-assets `--check`, golden, runtime-versions, `check:manifest`, `check:role-policy`
**필수 QA:** 예
**보류 조건:**
- 운영 codex/claude descriptor의 `compositeRole`/`compositeHost`/`bridge`가 verified가 아니어서 기존 composite가 hold되면 멈추고 보고합니다(가정 A1).
- 문구 변경이 coordination.md 계약 테스트에 영향을 주면 T14로 넘기고 보고합니다.

---

### Task T6: watch anchor 탐색

**AC:** AC-W1, AC-L3

**목표:** watch가 marker 기반으로 anchor store를 찾게 합니다. 후보 0개이면 `<CODEX_HOME>/arc-role-dispatch`로 대체하고, 2개 이상이면 `dispatch store ambiguous`를 표시합니다.

**Files:**
- Create: `lib/watch/anchor-store.mjs`
- Modify:
  - `lib/watch/dispatch.mjs:26-30,83`(`createDispatchIndex({storeDir})`)
  - `lib/watch/watcher.mjs:32`(탐색 결과 전달, ambiguous 상태 줄)
  - `lib/watch/index.mjs:55`(home 해석을 레지스트리 순회로)
- Test: `tests/node/watch-dispatch.test.mjs`, `tests/node/watch-watcher.test.mjs`, `tests/node/fixtures/watch/homes.mjs`(추가)

**Interfaces:**
- Consumes: T2 `matchRegisteredHome`(runtime import 허용, `lib/watch/index.mjs:4` 선례)
- Produces:
  - `export function resolveDispatchStore({homes, registry, readMarker}) -> {kind:'anchor', dir} | {kind:'legacy', dir} | {kind:'none'} | {kind:'ambiguous'}`
  - `createDispatchIndex({storeDir})`(인자 `codexHome` 대체. `storeDir`가 없으면 빈 색인)

- [ ] **Step 1: 실패 테스트 작성**
  - `watch reads claude anchor store`: claude·codex marker가 모두 Claude home을 가리키면 `{kind:'anchor', dir:<claude>/arc-role-dispatch}`이고 색인에 Claude store lease가 보입니다.
  - `watch reads codex anchor store for S={codex,zeta}`(주입)
  - `watch falls back to CODEX_HOME store with zero candidates`: marker 없음 + Codex store 존재 → `legacy`
  - `watch ambiguous with two candidates`: 서로 다른 home을 가리키는 marker 2개 → `ambiguous`, store 읽기 0회, 상태 줄에 `dispatch store ambiguous`
  - `unregistered activeConfigPath is not a candidate`: marker가 임시 디렉터리를 가리키면 후보 0
  - `parseLeaseLenient reads v2 like v1`(AC-L3): v2 lease 필드 결과가 같은 v1 lease와 deepEqual(`targetPlatform` 무시)
  - 기존 `watch-*` 세션 정규화 테스트 무변경
- [ ] **Step 2:** `node --test tests/node/watch-*.test.mjs`. 기대: 신규 FAIL
- [ ] **Step 3:** 구현. 읽기 전용이며 lock은 쓰지 않습니다. 새 문구는 `dispatch store ambiguous` 하나뿐입니다.
- [ ] **Step 4:** Step 2 PASS
- [ ] **Step 5:** STD-CLOSE(3–7, 9)

**필수 검사:** 작업 테스트, `npm test`, `check:manifest`
**필수 QA:** 아니요
**보류 조건:** 운영 순서(전환 전)에서 기존 Codex+Claude composite 사용자의 watch 결과가 바뀌면 보류합니다.

---

### Task T7: legacy 판정과 마이그레이션 엔진(주입 레지스트리로 검증)

**AC:** AC-A1, AC-A2(주입), AC-A3, AC-A4

**목표:**
- `readInstallMode`에 legacy 예외(Codex home의 v1 설정, 활성 설정 1개, 나머지 6.4.5 검사 통과)를 넣습니다.
- legacy 상태에서 Install / Update 시 anchor 이동, D1-b/Uninstall의 old anchor 해제, TUI/management/status 표면을 구현합니다.
- 운영 순서(codex anchor 0)에서는 이 조건이 성립하지 않아 동작이 바뀌지 않습니다.

**Files:**
- Modify:
  - `lib/installer/install-mode.mjs:15`(`readInstallMode`의 legacy 반환)
  - `lib/installer/role-routing.mjs:33-34,78,129`(legacy면 anchor 이동 포함, D1-b/Uninstall은 old anchor 기준)
  - `lib/management/operations.mjs:65`(prepare 결과 `anchorMove`)
  - `lib/management/status.mjs`(legacy 진단 줄)
  - `lib/tui/*`(Apply 미리보기 1줄. 대상 파일은 Implementer가 `Dispatch history stays in` 렌더 위치를 grep해 특정)
  - `deriveInstallPlan` 소재 모듈(legacy면 `anchorMove:true`)
- Create: `tests/node/anchor-migration.test.mjs`, `tests/node/fixtures/legacy-composite.mjs`(Phase A 형식: Codex home v1 + 두 marker + routing 프로필, 주입 레지스트리 claude `anchorOrder 0`, codex `1`)
- Test 추가: `tests/node/derive-install-plan.test.mjs`, `tests/node/tui-setup.test.mjs`, PTY `tests/node/tui-app-pty.test.mjs`

**Interfaces:**
- Produces:
  - `readInstallMode(...)`는 legacy일 때만 `{mode:'composite', platforms:['claude','codex'], anchor:'codex', legacyAnchor:true, config}`를 반환합니다. 그 밖에는 `legacyAnchor` 키가 없습니다.
  - management prepare 결과: `anchorMove:{from:'codex', to:'claude'}`(legacy일 때만)
  - `deriveInstallPlan`: legacy `installState`이면 `anchorMove:true`, 새 anchor는 `min(S)`

- [ ] **Step 1: 실패 테스트 작성**(`anchor-migration.test.mjs`, legacy fixture)
  - A1:
    - `legacy v1 at codex home is composite with legacyAnchor`: 반환값 deepEqual(위 형태)
    - `v2 at codex home is unverified`
    - `configs at both homes are unverified`
    - `marker mismatch is unverified`
    - `non-legacy result has no legacyAnchor key`: `'legacyAnchor' in result === false`
  - A2:
    - `legacy Install/Update moves anchor to claude`: Claude home에 v2 설정, 두 marker의 `activeConfigPath`가 Claude 설정, Codex home 설정 없음
    - `<codex>/arc-role-dispatch` 바이트가 이동 전과 deepEqual
    - 결과 messages에 `Dispatch history stays in <codex home>/arc-role-dispatch.`, management prepare `anchorMove` deepEqual
  - A2(D1-e): `legacy {codex,claude} → {codex,claude,zeta} moves and changes set in one transaction`
  - A3:
    - `legacy migration held with non-terminal lease in either store`(codex store, claude store 각각): `activation:'held'`, `activeDispatches`에 id, 모든 home 바이트 무변경
    - `legacy migration held then succeeds after lease terminal`(Review Focus 2)
    - `rollback restored keeps legacy state`: 트랜잭션 쓰기 실패 주입 후 `readInstallMode`가 다시 legacy
  - A4:
    - `legacy D1-b turns off without move`
    - `legacy Uninstall without move`
    - `runtime under legacy is activation_unverified and creates no files`
    - `package install / arc upgrade / status move no files`: 세 경로 실행 후 home 스냅샷 deepEqual
  - 표면:
    - `legacy status adds move diagnostic`: 진단 줄 정확 문자열
    - `legacy preview line`: Apply 미리보기에 `Mixed routing files will move to the Claude home.`
    - 홈 모드 줄이 `Mixed (Claude + Codex)`
    - PTY: legacy 상태 Apply 미리보기 줄 표시
  - 운영 회귀: `operational order: codex v1 at codex home stays normal composite without legacyAnchor`
- [ ] **Step 2:** `node --test tests/node/anchor-migration.test.mjs tests/node/derive-install-plan.test.mjs tests/node/tui-setup.test.mjs`. 기대: 신규 FAIL
- [ ] **Step 3:** 구현. 이동 절차는 Phase A 6.6을 재사용합니다(anchorOrder 오름차순 lock, 두 store의 non-terminal 검사, 단일 `applyTransaction`, 역순 해제).
- [ ] **Step 4:** Step 2 PASS, PTY PASS
- [ ] **Step 5:** STD-CLOSE(runtime 무변경이면 1–2 생략)

**필수 검사:** 작업 테스트, PTY, `npm test`, `check:manifest`, `check:role-policy`, parity
**필수 QA:** 예(마이그레이션)
**보류 조건:** 운영 레지스트리에서 기존 composite 판정이나 반환값이 바뀌면 보류합니다. old store에 쓰기가 1건이라도 생기면 보류합니다.

---

### Task T8: anchor 순서 전환, 새 활성 설정 v2 항상 기록, 기존 테스트 이관

**AC:** AC-A5, AC-L2, AC-A2(운영 레지스트리), AC-G1(codex/claude 부분), AC-P2'

**목표:**
- 운영 descriptor를 claude `anchorOrder 0`, codex `1`로 바꿉니다.
- 설치기 descriptors 순서를 `[CLAUDE, CODEX]`로 바꿉니다.
- publish는 S와 무관하게 v2를 기록합니다.
- `<CODEX_HOME>`/anchor=codex를 단언하는 기존 테스트를 Claude home 기대값으로 이관하고 old → new 대응표를 냅니다.

**Files:**
- Modify:
  - `lib/runtime/platform-registry.mjs`(codex/claude `anchorOrder`)
  - `lib/platforms/index.mjs`(`DEFAULT_INSTALLER_REGISTRY` 순서)
  - v1/v2 선택 위치(Implementer가 "S={codex,claude}면 v1" 분기를 grep해 특정. 예상 `lib/runtime/role-routing-config.mjs` 또는 `lib/installer/role-routing.mjs`)
- Modify(테스트, 예비 목록. Step 1에서 확정):
  - 공용 fixture `tests/node/role-fixtures.mjs:51`(`activePath`를 Claude home v2로). importer 14개(`role-routing-anchor`, `install-mode`, `install-mode-switch`, `role-routing-dispatch`, `role-bridge-support`, `role-bridge-run`, `role-bridge-resume`, `role-routing-install`, `install-mode-uninstall`, `install-mode-publication`, `install-mode-models-upgrade`, `codex-auth-probe`, `role-bridge-observe-wait`, `role-bridge-args`)
  - `tests/node/install-mode-n-platform.test.mjs:318,340,476,502,513-514,570,704`
  - `tests/node/derive-install-plan.test.mjs:35-91`
  - `tests/node/tui-setup.test.mjs:42,109,115`
  - `tests/node/tui-app.test.mjs:30`, `tests/node/tui-app-pty.test.mjs:60,116`
  - `tests/node/platform-registry.test.mjs:71-77`, `tests/node/targets.test.mjs:62`, `tests/node/role-routing-config.test.mjs:79`
  - `tests/node/management-operations.test.mjs`, `tests/node/hardcoding-residual.test.mjs`, `tests/node/composite-live.test.mjs`
  - `tests/node/install-mode-review-followup.test.mjs`, `tests/node/role-routing-publish.test.mjs`, `tests/node/role-dispatch-store.test.mjs`
  - `tests/node/fixtures/watch/homes.mjs`, `tests/node/watch-dispatch.test.mjs`, `tests/node/watch-cli.test.mjs`, `tests/node/watch-watcher.test.mjs`

**Interfaces:**
- Consumes: T5 lease v2, T6 `resolveDispatchStore`, T7 legacy 판정과 이동
- Produces: 운영 `byAnchorOrder()` = `[claude, codex]`. publish는 항상 v2이고, 파서는 v1을 계속 받습니다.

- [ ] **Step 1: 이관 대상 확정(grep).** 아래 패턴을 `tests/node` 전체에 실행하고, 결과의 단언마다 old → new 대응표를 만듭니다.
  - 패턴: `anchor:\s*'codex'`, `anchorOrder`, `CODEX_HOME`, `codexHome`, `codex\.home`, `arc-role-dispatch`, `arc-role-platform-routing\.(json|lock)`, `version:\s*1`, `\bv1\b`
  - 대응표 열: `파일:행 | old 단언 | new 단언 | 분류(경로만 변경 / 의미 변경 / 무변경 / legacy로 보존)`
  - 대응표는 Implementer 보고에 포함합니다. Orchestrator가 이 계획의 부록 A에 기록합니다.
- [ ] **Step 2: 이관 원칙 적용**
  - 경로나 anchor 기대값만 바꿉니다. 검사 항목 수와 실패 조건은 줄이지 않습니다.
  - 순서 변경으로 단언의 의미가 사라지는 경우에는, 같은 성질을 지키는 대체 케이스를 추가합니다.
    - 예: `derive-install-plan.test.mjs:60`(previous `[claude,zeta]` + codex 추가 → 기존 `anchorMove:true`)은 새 순서에서 `anchorMove:false`가 됩니다. 그래서 `previous [codex,zeta] + claude 추가 → anchorMove:true, anchor 'claude'` 케이스를 추가합니다.
    - `{codex}` 단독(D1-b)과 `{codex,eta}`는 anchor codex 그대로입니다(무변경).
  - 기존 `<CODEX_HOME>` 경로 동작은 T7 legacy 테스트가 보존합니다. 대응표에서 "legacy로 보존" 행이 T7 테스트 이름을 가리켜야 합니다.
  - `composite-live`는 live 환경이 아니면 skip이지만, 경로 기대값은 함께 이관합니다.
- [ ] **Step 3: 운영 변경 구현.** descriptor `anchorOrder`, 설치기 순서, v2 항상 기록
- [ ] **Step 4: 신규 테스트**
  - `AC-A5 publish after migration is v2 and lock order claude then codex`: lock 획득 순서를 기록하는 safeFs 주입으로 `['claude','codex']`
  - `AC-L2 claude-anchored composite prepare/run/observe/resume/cancel match Phase A`: role-fixtures 기반으로 store 위치만 Claude home이고 결과 deepEqual
  - `AC-A2 operational legacy migration`: 운영 레지스트리 + Phase A 형식 fixture에 T7 A2 단언 재사용
  - `symlinked claude home ancestor is rejected after flip without file changes`(Review Focus 3)
- [ ] **Step 5:** `npm test`(Orchestrator)와 작업 테스트 PASS. 대응표의 모든 행이 PASS 테스트에 대응
- [ ] **Step 6:** STD-CLOSE(전부, PTY 포함)

**필수 검사:** 작업 테스트, PTY, `npm test`, runtime-assets `--check`, golden, runtime-versions, `check:manifest`, `check:role-policy`, parity, `hardcoding-residual`
**필수 QA:** 예(마이그레이션, composite)
**보류 조건:**
- 대응표에 "의미 변경"인데 대체 케이스가 없는 행이 있으면 보류합니다.
- 기준 실패 36건 밖의 신규 실패가 있으면 보류합니다.
- 이관 대상이 예비 목록보다 크게 늘어 한 커밋으로 검토하기 어려우면(예: 40개 파일 초과) Orchestrator에 범위를 보고합니다. 단, 순서 전환만 먼저 커밋하는 분할은 하지 않습니다.

---

### Task T9: auth none / capability off 일반 표면(주입 레지스트리)

**AC:** AC-G2(선행 조건 throw), AC-G3(표면 로직), AC-G4, AC-G6(TUI Effort 고정), AC-G9(주입)

**목표:** Gemini 등록 전에 `auth.kind:'none'`과 capability off 플랫폼의 표면 동작을 일반 코드로 구현합니다. 검증은 zeta 변형(주입)으로 합니다.

**Files:**
- Modify:
  - `lib/runtime/platform-registry.mjs`(`CAPABILITY_PREREQUISITES`와 생성 시 검사)
  - `lib/runtime/local-cli.mjs:177`(`probePlatformAuth`의 `auth.kind==='none'` 분기)
  - runtime `routingStatus` 인증 보고와 composite gate(`lib/runtime/role-routing.mjs`)
  - 플랫폼 availability 모듈(Phase A 5.4 소재)
  - `lib/management/operations.mjs`(`target:<id>` off 오류, prepare `warnings`, `all` 정의)
  - `lib/management/status.mjs`
  - `lib/tui/*`(홈 상태줄, 플랫폼 목록, Hosts, 편집기 info 줄, 사유 줄, Uninstall `(not installed)`, Effort 행 단일 값 고정)
- Create: `tests/node/fixtures/platforms/zeta.mjs`에 `ZETA_AUTH_NONE` 변형 추가
- Test: `tests/node/platform-registry.test.mjs`, `tests/node/platform-availability*.test.mjs`, `tests/node/management-status*.test.mjs`, `tests/node/tui-setup.test.mjs`, `tests/node/tui-custom-preset*.test.mjs`, PTY

**Interfaces:**
- Produces:
  - `export const CAPABILITY_PREREQUISITES = {install:[], nativeProfile:['install'], catalog:['install'], standalone:['install','nativeProfile','catalog'], bridge:['install','catalog'], compositeRole:['bridge'], compositeHost:['install','nativeProfile'], authProbe:[], watch:[]}`. `createPlatformRegistry`는 위반 시 `Error('<id> capability <key> requires <pre>')`를 throw합니다.
  - `probePlatformAuth` → `{authStatus:'unknown', reason:'auth_unverified'}`(프로세스 미실행)
  - availability: `{selectable:true, warning:'auth_unverified'}`
  - management: 오류 `` `${label} is not available: capability not verified` ``. `all` = 등록 플랫폼 중 `install`·`standalone`이 verified인 것. prepare `warnings: [`${id}:auth_unverified`]`
  - 표시 문구는 Global Constraints 값을 `${label}`로 일반화합니다(예: `${label}: Not verified`).

- [ ] **Step 1: 실패 테스트 작성**
  - `prerequisite violation throws`: `standalone` verified인데 `catalog` off인 descriptor는 throw. 운영 codex/claude는 throw하지 않음
  - `auth none probe spawns no process`: spawn 스파이 호출 0, 반환값 deepEqual
  - `auth none passes role/host gate with warning`: management prepare `warnings` deepEqual `['zeta:auth_unverified']`. routingStatus `authentication` deepEqual
  - `auth none cli missing blocks` / `out of range blocks`
  - `capability off surfaces`(9.5 표):
    - 홈 상태줄 `Zeta: Not verified`(install off가 CLI 상태보다 우선)
    - 플랫폼 목록 `Zeta - Unavailable  (capability not verified)`
    - Hosts 체크 불가
    - 편집기 ←/→ 건너뜀
    - 도식 미표시
    - Uninstall 흔적 없음 `Zeta  (not installed)` 비선택, 흔적 있음 선택 가능
    - management `target:'zeta'` 오류 정확 문자열 + 파일 무변경
    - composite `platforms`에 zeta → 게이트 거부
  - `status line wording`: 4행 표(5.6)의 조건별 문자열
  - `all includes verified install+standalone only`(AC-G9 주입): zeta install·standalone verified → `all`에 zeta 포함, off → 제외
  - `all-targets`, `preset-cli`, `uninstall-cli` 기존 테스트 무변경 PASS
  - `effort row fixed for single-effort platform`: ←/→ 후 값 `default`, 박스 `effort: default`
  - `auth unverified info line`과 `reason line only when no block`
  - PTY: Hosts에 `(auth unverified)` 표시, capability off 행 표시
- [ ] **Step 2:** 해당 테스트 실행. 기대: FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** PASS, PTY PASS
- [ ] **Step 5:** STD-CLOSE(전부)

**필수 검사:** 작업 테스트, PTY, `npm test`, runtime-assets `--check`, golden, runtime-versions, `check:manifest`, `check:role-policy`
**필수 QA:** 예(게이트, 권한 표면)
**보류 조건:** 운영 codex/claude의 상태 어휘나 표시가 바뀌면 보류합니다. 운영 descriptor가 선행 조건을 어겨 throw하면 멈추고 보고합니다(가정 A1).

---

### Task T10: Gemini descriptor 등록(runtime + 설치기 + 카탈로그 + 형식 + role-policy)

**AC:** AC-G1, AC-G2(초기 상태), AC-G3(운영), AC-G4(운영), AC-G6, AC-G7(설치기 형식 부분), AC-G9(운영), AC-R1, AC-V1(테스트 골격)

**목표:** 운영 레지스트리에 gemini를 capability 전부 off로 등록합니다. 두 레지스트리 일관성, 금지 패턴, role-policy, TUI 스냅샷을 한 커밋에 맞춥니다.

**Files:**
- Modify:
  - `lib/runtime/platform-registry.mjs`(gemini descriptor, `resolveHome` gemini 분기, `validatePair`)
  - `lib/platforms/index.mjs`(`[CLAUDE, CODEX, GEMINI]`)
  - `lib/policy/role-policy.json`(각 role `controls.gemini`)
  - `tests/node/hardcoding-residual.test.mjs`(`==='gemini'` 패턴 추가)
  - `tests/node/fixtures/platforms/zeta.mjs`(zeta `anchorOrder/displayOrder` 2 → 3, eta 3 → 4. gemini와 충돌 방지)
  - TUI 스냅샷과 플랫폼 목록·Hosts·Uninstall 단언 테스트(Gemini 행 추가)
  - `package.json` `files`(필요 시 `lib/models/gemini-models.json`)
- Create:
  - `lib/platforms/gemini.mjs`
  - `lib/platforms/formats/gemini-markdown.mjs`(또는 기존 markdown 형식 옵션. builder 선택)
  - `lib/models/gemini-models.json`(fixture 수준 목록, 모든 effort `default`)
  - `tests/node/gemini-platform.test.mjs`
  - `tests/node/gemini-capability-evidence.test.mjs`

**Interfaces:**
- Produces:
  - `getPlatform('gemini')`(Global Constraints 값)
  - 설치기 descriptor 필드는 spec 4.2 표 그대로입니다: `payloadPrefix:'gemini'`, `instructionFile:'GEMINI.md'`, `runtimeConfigFile:'settings.json'`, `globalPaths`, `models.staticCatalog`, `discover:null`, `profiles.{render,isOwnedStandalone,renameForRouting}`, `uninstallSummary`, `isolationEnv:()=>({})`. 동시성 키는 없습니다.
  - 증거 테스트: `docs/superpowers/evidence/gemini/<capability>-<YYYY-MM-DD>.md`의 필드 `capability`, `gemini version`, `판정`을 파싱합니다. verified마다 `pass` 파일이 필요하고, version은 `supportedVersions` 안이어야 하며, 선행 조건을 검사합니다.

- [ ] **Step 1: 실패 테스트 작성**(`gemini-platform.test.mjs`)
  - AC-G1: `byAnchorOrder` id `['claude','codex','gemini']`, `byDisplayOrder` 같음, 두 레지스트리 id 일치(AC-P1 확장)
  - AC-G2: 9개 capability가 `off`이고 reason이 Global Constraints 값과 같음
  - `gemini home env set is unresolved`: `GEMINI_CLI_HOME` 설정 → `unresolved`
  - `gemini home env set does not block codex/claude install`(Review Focus 1)
  - AC-G6: 카탈로그 모든 effort `default`. `validatePair('gemini-x','high')` 거부, `('gemini-x','default')` 허용. 카탈로그 모델이 모두 runtime 모델 정규식을 통과(정합성 테스트)
  - AC-G7(형식): render → `isOwnedStandalone` true → `renameForRouting` 왕복 일치. frontmatter에 effort 없음. `name`/`model` 누락 거부
  - AC-G3 운영: `target:'gemini'` 거부 문자열, `all` = `['claude','codex']`(기존 표현 순서 유지), 상태줄 `Gemini: Not verified`
  - AC-G4 운영: Gemini auth probe 미실행, `unknown`
  - AC-R1: `check:role-policy` 생성물에서 codex/claude 바이트 동일(기존 생성물 해시 비교)
  - `range out version unsupported`: `0.69.0` → `Gemini: Unsupported version` 조건(install off면 Not verified가 우선이므로 주입 레지스트리로 검증)
  - `gemini-capability-evidence.test.mjs`: 운영 상태(전부 off)에서 통과. 주입으로 verified인데 증거가 없으면 실패하는 음성 케이스
- [ ] **Step 2:** `node --test tests/node/gemini-platform.test.mjs tests/node/gemini-capability-evidence.test.mjs tests/node/platform-registry.test.mjs tests/node/hardcoding-residual.test.mjs`. 기대: FAIL
- [ ] **Step 3:** 구현과 스냅샷 갱신(Gemini 행 추가 외의 차이 0)
- [ ] **Step 4:** PASS, PTY PASS
- [ ] **Step 5:** STD-CLOSE(전부. role-policy는 gemini 기대 생성물)

**필수 검사:** 작업 테스트, PTY, `npm test`, runtime-assets `--check`, golden, runtime-versions, `check:manifest`, `check:role-policy`, parity
**필수 QA:** 예
**보류 조건:**
- codex/claude role-policy 생성물이 1바이트라도 바뀌면 보류합니다.
- `all-targets`, `preset-cli`, `uninstall-cli`가 수정 없이 통과하지 않으면 보류합니다.
- zeta 순서 재배치로 T1–T9 테스트 의미가 바뀌면 대응을 보고합니다.

---

### Task T11: Gemini payload와 설치·제거

**AC:** AC-G5, AC-G3(Uninstall 흔적 제거, P-B3)

**목표:** `gemini/` payload를 추가하고(skill, `GEMINI.md` 블록, agent 5종), 주입 레지스트리(capability on)에서 standalone 설치, 재설치, 제거가 5.1/5.2를 만족하게 합니다. `settings.json`은 쓰지 않습니다.

**Files:**
- Create:
  - `gemini/skill/**`(claude payload 기준. `references/coordination.md`는 `Mixed routing` 일반 표기)
  - `gemini/` instruction 템플릿, agent 템플릿 `arc-*.md` 5종
  - `tests/node/gemini-install.test.mjs`
- Modify:
  - `package.json` `files`(`gemini/`)
  - `tests/node/fixtures/installed-layout-golden.json`(gemini 레이아웃)
  - `tests/installer-parity.json`(필요할 때만)
  - `lib/installer/*`(payload 트리 매핑에 gemini prefix가 하드코딩되어 있으면 해당 위치만)

- [ ] **Step 1: 실패 테스트 작성**(임시 HOME, 주입 레지스트리에서 gemini `install`·`standalone`·`nativeProfile`·`catalog` verified)
  - `gemini standalone install layout`: `~/.gemini/skills/arc/**`, `~/.gemini/agents/arc-*.md` 5종, `GEMINI.md` ARC 블록, 공통 runtime 설치
  - `settings.json untouched`: 설치 전후 바이트 동일, 파일이 없으면 생성되지 않음
  - `reinstall idempotent`: 두 번째 설치 후 바이트 동일
  - `uninstall removes owned only`: 사용자 `agents/my.md`, `settings.json`, `GEMINI.md`의 블록 밖 내용 보존. ARC 소유 파일 0개. 요약에 `Gemini settings.json is preserved.`
  - `uninstall allowed with install capability off when traces exist`(운영 레지스트리, P-B3)
  - `uninstall order follows displayOrder`
- [ ] **Step 2:** `node --test tests/node/gemini-install.test.mjs`. 기대: FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** PASS
- [ ] **Step 5:** STD-CLOSE(3–9). golden은 `installed-layout.mjs --write`로 갱신
- [ ] **Step 6:** Orchestrator 확인: `npm pack --dry-run` 목록에 `gemini/`가 포함됨(packed 계열 테스트는 기준 실패라 대체 증거로 씀)

**필수 검사:** 작업 테스트, `npm test`, `check:manifest`, golden, parity, `npm pack --dry-run`(Orchestrator)
**필수 QA:** 아니요
**보류 조건:** `settings.json`에 쓰기가 생기거나 사용자 파일이 하나라도 바뀌면 보류합니다.

---

### Task T12: Gemini bridge(실행·관찰·취소·재개 플래그, GG1/GG2, runtime 프로필 파서)

**AC:** AC-B1, AC-B2, AC-B3, AC-B4, AC-G7(runtime 파서 부분)

**목표:** 기존 `Map<id, impl>`에 Gemini 구현을 추가합니다. 쓰기 역할과 Gemini host는 gate로 hold합니다.

**Files:**
- Modify:
  - `lib/runtime/role-bridge-args.mjs`(`buildGeminiArgs`, `parseCompositeProfile('gemini')` at `:109`)
  - `lib/runtime/role-supervisor.mjs`(`SUPERVISOR_IMPLEMENTATIONS.gemini`, `normalizeGeminiStreamEvent`)
  - `lib/runtime/role-observe.mjs`(claim 판정)
  - `lib/runtime/role-dispatch-policy.mjs:3,76`(`GG1`, `GG2`, `bridgeGateReasons` 규칙, `resume_unverified`)
- Create:
  - `tests/node/gemini-bridge.test.mjs`
  - `tests/node/fixtures/gemini/stream-{ok,model-mismatch,session-mismatch,error,empty,unknown-event}.jsonl`
  - `tests/node/fixtures/gemini/fake-gemini.mjs`(PATH 주입 helper, fixture 재생)
- 모듈 분리 시: Global Constraints의 다섯 가지 갱신을 이 작업에 포함합니다.

**Interfaces:**
- Consumes: T5 lease v2(`targetPlatform`, `sessionId`), T10 descriptor
- Produces:
  - `buildGeminiArgs({role, model, sessionId, policyFile, promptFlag}) -> string[]`. 형태는 `['-p', <짧은 지시>, '-m', model, '-o', 'stream-json', '--session-id', sessionId, '--approval-mode', <plan|auto_edit>, ...]`이며, instructions와 brief는 stdin으로 넘깁니다.
  - `normalizeGeminiStreamEvent(line) -> {kind:'init'|'message'|'tool_use'|'tool_result'|'result'|'unknown', raw, sessionId?, model?, text?}`
  - impl 플래그 `resume:'off'`
  - `BRIDGE_GATE_RESULTS.GG1='fail'`, `GG2='fail'`

- [ ] **Step 1: 실패 테스트 작성**
  - AC-B1:
    - Scouter/Planner/Reviewer → `--approval-mode plan` + `--policy`
    - Implementer/QA → `auto_edit` + `--sandbox`
    - 모든 역할에서 `--allowed-tools`, `--yolo`, `yolo`, `--skip-trust`, `--raw-output`이 인자에 없음
    - `--session-id`가 lease UUID와 같음
  - AC-B2(fake gemini, 주입 레지스트리 bridge on):
    - ok → identity `{level:'runtime-observed', source:'gemini-stream-session'}`, model runtime-observed, effort `{level:'unverified', source:'none', requested:'default', observed:null}`이며 hold 아님, `resultFile` 내용 일치
    - model 불일치 → `model_effort_mismatch`
    - 세션 불일치·없음 → `execution_identity_unverified`
    - 비정상 종료 → `execution_failed`, 빈 결과 → `invalid_output`
    - unknown 이벤트 → 원문 기록, `kind:'unknown'`
  - `effort unverified non-blocking matches claude path`: Claude transcript 미발견 경로와 같은 hold 판정(8.2 확인 항목)
  - `cancel uses SIGTERM then SIGKILL`(기존 경로)
  - AC-B3: `resume:'off'` → resume 요청 `resume_unverified` hold. 주입 `'on'` → 재개 인자 사용, 세션 불일치 시 `execution_identity_unverified`
  - AC-B4:
    - GG1 fail → Gemini Implementer/QA bridge `permission_scope_unverified`
    - hostPlatform gemini + GG2 fail → `host_sandbox_blocked`
    - read-only 역할 worktree 쓰기 → `permission_violation_observed`
    - read-only `permissions` claim `{level:'runtime-observed', source:'worktree-snapshot', details:'git-visible worktree only'}`
  - AC-G7(runtime): `parseCompositeProfile('gemini', render(...))` 왕복. 필수 키 누락 거부. effort는 `default`로 간주
  - `bridge coverage: verified ⇒ impl exists` 유지
- [ ] **Step 2:** `node --test tests/node/gemini-bridge.test.mjs tests/node/role-bridge-args.test.mjs tests/node/role-dispatch-policy*.test.mjs`. 기대: FAIL
- [ ] **Step 3:** 구현. `-p`와 stdin 결합, 이벤트 형태는 미검증이므로(U-B1, U-B3) fixture 형태를 단일 상수 모듈 안에 모읍니다.
- [ ] **Step 4:** PASS
- [ ] **Step 5:** STD-CLOSE(전부)

**필수 검사:** 작업 테스트, `npm test`, runtime-assets `--check`, golden, runtime-versions, `check:manifest`, `check:role-policy`
**필수 QA:** 예(bridge, 권한)
**보류 조건:** 금지 인자가 어느 경로에서든 생성되면 보류합니다. effort 비차단 처리가 Claude 경로와 다르면 보고합니다(spec 8.2 확인 항목).

---

### Task T13: Gemini 참여 composite 통합

**AC:** AC-G8, AC-A5(gemini 포함 lock 순서)

**목표:** 주입 레지스트리(gemini capability on)에서 S={claude,gemini}, {codex,claude,gemini}, {codex,gemini}의 publish, 전환, 이동이 Phase A AC-M3·M5·M8을 만족하는지 확인하고, 필요한 수정을 넣습니다.

**Files:**
- Modify(필요 시): `lib/installer/role-routing.mjs`, `lib/management/operations.mjs`
- Test: `tests/node/install-mode-n-platform.test.mjs` 또는 신규 `tests/node/gemini-composite.test.mjs`

- [ ] **Step 1: 실패/회귀 테스트 작성**
  - `publish S={claude,gemini}`: v2 설정이 Claude home에 있고 claude·gemini marker가 생기며 Gemini home에 `arc-role-platform-routing.prepared.json`이 있음
  - `publish S={codex,claude,gemini}`: anchor claude, 3개 marker, lock 순서 `['claude','codex','gemini']`
  - `publish S={codex,gemini}`: anchor codex
  - `D1-b from gemini-participating composite`, `D1-e add/remove gemini`, `anchor move {codex,gemini} → {claude,gemini}`: Phase A AC-M3·M5·M8 단언 재사용
  - `legacy {codex,claude} → {codex,claude,gemini}`: 이동과 집합 변경이 한 트랜잭션(spec 6.7.2)
  - `prepare warnings include gemini:auth_unverified`
  - 운영 레지스트리(off): composite `platforms`에 gemini → 게이트 거부, 파일 무변경
- [ ] **Step 2–4:** 실행 → 수정 → PASS
- [ ] **Step 5:** STD-CLOSE(runtime 변경 여부에 따라)

**필수 검사:** 작업 테스트, `npm test`, `check:manifest`, parity(runtime을 바꿨다면 runtime 3종)
**필수 QA:** 예(composite)
**보류 조건:** 운영 Codex+Claude 경로의 결과가 바뀌면 보류합니다.

---

### Task T14: 문서, skill 문구, README, harness

**AC:** AC-D1(문서·fixture 부분)

**목표:** 15장 문서 의무를 반영하고, coordination.md를 `Mixed routing`으로 일반화합니다.

**Files:**
- Modify:
  - `README.md`(15장 7개 항목)
  - `docs/harness-operation.md`(15장 5개 항목)
  - `codex/skill/references/coordination.md`, `claude/skill/references/coordination.md`(`Claude & Codex` → `Mixed routing`, `<CODEX_HOME>/arc-role-dispatch/` → `<anchor home>/arc-role-dispatch/`와 이동 전 기록 안내)
  - `tests/node/fixtures/instruction-contracts.json`
  - golden(해당 payload 해시)

- [ ] **Step 1:** `instruction-contracts.json`을 의도된 변경(Q3, 6.6)만 반영하도록 갱신합니다. 차이가 `Mixed routing`과 `<anchor home>` 관련 행에만 있어야 합니다.
- [ ] **Step 2:** 문서 갱신. Gemini 권한 문구 "Gemini 역할 권한은 사후 탐지로 git-visible worktree 범위만 확인된다"를 README와 harness 양쪽에 넣습니다.
- [ ] **Step 3:** asset/fixture 테스트 PASS. `rg 'Claude & Codex|<CODEX_HOME>/arc-role-dispatch' codex claude gemini docs/harness-operation.md README.md` 결과가 0건이어야 합니다(legacy 안내 문맥은 예외로 대응표에 기록).
- [ ] **Step 4:** STD-CLOSE(3–9)

**필수 검사:** asset/fixture 테스트, `npm test`, `check:manifest`, golden, parity
**필수 QA:** 아니요
**보류 조건:** 기준 실패 목록 중 contract 계열("claude/codex contracts have explicit destinations…", "… preserves public rendering baseline")이 이 작업 영향 범위와 겹칩니다. 그래서 그 테스트 결과로 수용을 판정하지 않습니다. 단독 재실행 결과가 기준선과 같은지만 확인합니다(질문 Q-O3).

---

### Task L1–L7: capability live 전환(Q6 순서)

공통 구조(각 L 작업 = 커밋 1개 또는 no-change 종료):

**Step A — Orchestrator live 실행(사용자 환경, specialist 금지)**
1. `gemini --version` 원문을 기록합니다. range `>=0.68.0 <0.69.0` 밖이면 중단하고 사용자에게 보고합니다(range 확장은 9.4 규칙에 따른 별도 결정).
2. 9.2 표의 해당 행 검증 항목을 실행합니다.
3. 9.3 형식의 증거 초안을 작성합니다. 개인 정보, 토큰, 이메일은 제외합니다.

**Step B — 판정**
- `pass`: Step C로 갑니다.
- `fail` 또는 증거 불충분: descriptor를 off로 둡니다. 저장소 변경 없이 작업을 **no-change 종료**하고, 진행 기록에 사유와 실행 일시를 남깁니다. 6.1 선행 관계상 영향받는 후속 L 작업도 no-change 종료합니다.

**Step C — Implementer(descriptor, 증거, 회귀 테스트, 한 커밋)**
1. `docs/superpowers/evidence/gemini/<capability>-<YYYY-MM-DD>.md`를 추가합니다(Orchestrator 초안 그대로).
2. `lib/runtime/platform-registry.mjs`에서 해당 capability를 `{state:'verified'}`로 바꿉니다.
3. 해당 capability의 회귀 테스트를 추가합니다(아래 표).
4. STD-CLOSE를 실행하고, `gemini-capability-evidence.test.mjs`가 PASS여야 합니다.

| 작업 | capability | live 항목(9.2) | Step C 추가 변경과 회귀 테스트 | 필수 QA |
|---|---|---|---|---|
| L1 | install | 임시 HOME 설치 → `gemini -p`가 GEMINI.md 블록과 skill 고정 토큰 인식 → 제거 후 소유 파일 0 | 운영 레지스트리 `install` verified 상태 표면 테스트(상태줄이 CLI 상태 규칙으로 넘어감). 설치는 standalone off로 여전히 거부 | 아니요 |
| L2 | catalog | `gemini --list-models` 수집, 카탈로그 각 모델로 `-m <model> -p` 최소 실행 | `lib/models/gemini-models.json`을 증거 목록으로 확정. 카탈로그–runtime 정규식 정합성 테스트 | 아니요 |
| L3 | nativeProfile | `~/.gemini/agents/arc-routing-scouter.md` 로드 + model 일치 + revision 재로드 | frontmatter 필드 이름이 증거와 다르면 형식 모듈 수정 포함. AC-G7 테스트 갱신 | 아니요 |
| L4 | standalone | 선행 3종 + 단독 ARC 역할 1개 native 위임 | `target:'gemini'` 허용, `all`에 gemini 포함(AC-G9 운영). README `all` 변경 문구 확인 | 아니요 |
| L5 | bridge | claude-cli host와 codex-cli host 각각 run → observe → cancel. 세션 id, model, 결과 파일, read-only 쓰기 0 | fixture를 실제 stream 형태로 갱신(U-B3). `buildGeminiArgs` MCP/확장 차단 인자 확정(U-B4). resume 플래그는 U-B9 증거가 따로 있을 때만 on | 예 |
| L6 | compositeRole | Claude+Gemini, Codex+Claude+Gemini publish/routingStatus/prepare → v2 lease | 운영 레지스트리 prepare가 v2 lease 기록 테스트 | 예 |
| L7 | compositeHost | Gemini 세션 안 runtime 명령, native 위임, 다른 플랫폼 bridge, 11장 host sandbox 쓰기(GG2) | `GG2:'pass'` 전환 포함(증거에 GG2 항목 필수) | 예 |

- **선행:** L1 ← T14. 각 L은 직전 L이 끝난(수용 또는 no-change) 뒤 실행합니다. 6.1 선행 capability가 verified가 아니면 실행하지 않습니다.
- **보류 조건:**
  - 증거 version이 range 밖이면 보류합니다.
  - 증거 파일과 descriptor 상태가 따로 커밋되려 하면 보류합니다.
  - GG1은 Phase B 계획에 live 전환 단계가 없으므로 `fail`을 유지합니다(질문 Q-O1).

---

### Task FR: 최종 독립 Reviewer 1회

- **선행:** T1–T14 수용, L1–L7 각각 수용 또는 no-change 종료, 필수 QA와 QA 재확인 완료
- **대상:** `739da7f..HEAD` 전체 변경과 이 계획의 진행 기록·부록 A
- **위험 기반 점검:**
  - F5/F6 신뢰 경계
  - 마이그레이션 원자성과 old store 불변
  - lease v2 검증
  - capability hold와 증거 일치
  - 금지 인자 부재
  - role-policy codex/claude 바이트 동일
  - 이관 대응표의 검사 강도 유지
- **Reviewer 지적:** Implementer → Reviewer 재확인으로 처리합니다(QA 재배정 없음). 해결 후 수용하고 follow-up 커밋 1개를 만듭니다.

---

## AC 추적표

| AC | 작업 |
|---|---|
| AC-F4 | T1 |
| AC-F5 | T2 |
| AC-F6 | T3 |
| AC-F7 | T4 |
| AC-G1 | T8(codex/claude 순서), T10 |
| AC-G2 | T9(선행 조건 throw), T10(초기 off·reason) |
| AC-G3 | T9(표면 로직), T10(운영), T11(Uninstall 흔적) |
| AC-G4 | T9, T10 |
| AC-G5 | T11 |
| AC-G6 | T9(TUI Effort), T10(카탈로그·validatePair) |
| AC-G7 | T10(설치기 형식), T12(runtime 파서), L3(검증 시 형식 확정) |
| AC-G8 | T13 |
| AC-G9 | T9(주입), T10(운영 off), L4(운영 verified) |
| AC-A1 | T7 |
| AC-A2 | T7(주입), T8(운영) |
| AC-A3 | T7 |
| AC-A4 | T7 |
| AC-A5 | T8, T13 |
| AC-W1 | T6 |
| AC-L1 | T5 |
| AC-L2 | T8 |
| AC-L3 | T6 |
| AC-B1 | T12 |
| AC-B2 | T12 |
| AC-B3 | T12 |
| AC-B4 | T12 |
| AC-B5 | T5 |
| AC-V1 | T10(테스트), L1–L7(증거) |
| AC-D1 | T5(runtime 문구), T14(skill·fixture) |
| AC-R1 | T10 |
| AC-P2' | 모든 작업 STD-CLOSE, FR |

---

## 검증 판정 (spec 16장)

- **기준선:** 시작 시점(`739da7f`) `npm test` 기준 실패는 36건입니다. 이름 목록은 진행 기록 부록 B에 둡니다.
- **판정:**
  - 신규 실패는 0건이어야 합니다.
  - 기준 목록 밖의 실패는 파일 단위로 단독 재실행합니다.
    - 단독으로 통과하면 부하 의존 실패로 기록합니다.
    - 단독으로도 실패하면 신규 실패로 보고 수용을 보류합니다.
  - 기준 목록 안의 실패가 통과로 바뀐 경우에는 기록만 하고 판정에 쓰지 않습니다.
- 실패 분류(기준/현재)와 hold 범위는 [scope.non-escalation] 절차를 따릅니다. 영향받지 않는 독립 작업은 Orchestrator가 해제합니다.
- 자동 테스트 통과는 live 증거를 대신하지 않습니다.

---

## 진행 기록

| 일시 | 작업 | 상태 | 커밋 | 메모 |
|---|---|---|---|---|
| 2026-11-16 | 기준선 | 기록 | `739da7f` | `npm test` 기준 실패 36건(부록 B) |
| 2026-11-16 | T1 | 수용 | (이 커밋) | Implementer bridge `77805bd2`(2 segment: RED 62/4 → GREEN 66/0, manifest 232·role-policy 24·parity 통과; sandbox `EMFILE` 1건은 호스트 미재현 → 환경). fresh QA bridge `d93b70d0`(3 segment; sandbox 제한으로 Orchestrator가 호스트에서 Q4 176건 175 pass/0 fail/1 skip, Q5 `7947cf8` 사본에서 신규 4건만 FAIL 실행 후 전달). QA: Q1·Q2·Q5 proven, Q3(pinned API 실행)·Q4(바이트 비교) unverified → Orchestrator 처분: Q3은 undefined 인자 무시와 `installerRegistryOf` 기본값으로 정적 수용, Q4는 status deepEqual·S target 쓰기 0건 단언과 기존 테스트로 수용. 전체 `npm test` 2224 tests / 36 fail = 기준과 동일 |
| 2026-11-16 | T2 | 수용 | (이 커밋) | Implementer bridge `1b549570`(RED anchor 5/3 → GREEN 8/0, role-routing-* 64/0, runtime-versions 6/0). dispatch는 `permission_violation_observed`(`shared/skill/runtime/role-routing.mjs`)로 기록됨 — Orchestrator가 allowedPaths에 디렉터리를 넣은 지정 오류이며 파일은 생성 명령 산출물(원본과 `cmp` 동일, runtime-assets `--check` 33)로 정리. 호스트 실행: `b0daa39` 사본에서 F5 신규 3건만 FAIL, role-routing-*·role-bridge-* 141/0, `npm test` 2227 tests / 36 fail = 기준과 동일, check:role-policy 24, parity, golden `--diff` 무차이. fresh QA bridge `a64cacfe`: Q1–Q6 proven |
| 2026-11-16 | T3 | 수용(개정 v2) | (이 커밋) | 첫 Implementer `9ee0127d`가 v1 전제 오류(설치기·runtime 모두 symlink 조상 거부)를 보고 → 사용자 결정 11로 spec/plan v2. fresh Implementer `c312e61e`(2 segment: 단언 단계 수정, 대조 케이스 추가): anchor 9/0, n-platform 53/0, manifest 232, parity. 조합 판정: 조상·home 자체·lock symlink 양쪽 거부, `arc-role-dispatch` symlink 양쪽 허용(일치, 후속 과제로 기록). Orchestrator 실효성 확인: `scope.mjs` symlink 검사 제거 사본에서 runtime F6 테스트 FAIL, `targets.mjs` symlink 검사 제거 사본에서 publish F6 테스트 FAIL. `npm test` 2235 tests / 36 fail = 기준과 동일. 사용자 커밋 `c4aecb3`(watch 스타일) 이후 watch-*·T3 테스트 419/0 재확인. 필수 QA 대상 아님(v2) |

### 부록 A — T8 anchor 이관 old → new 대응표
(T8 Step 1 산출물을 Orchestrator가 기록)

### 부록 B — 기준 실패 36건
`739da7f`에서 Orchestrator가 실행한 `npm test`(2220 tests, 2169 pass, 36 fail, 15 skipped)의 실패 이름입니다. `bare arc opens English TUI …`는 인자만 다른 3건입니다.

1. `bare arc opens English TUI and restores PTY after "\\u0003"`
2. `bare arc opens English TUI and restores PTY after "\\u0004"`
3. `bare arc opens English TUI and restores PTY after "\\u001b"`
4. `Claude allowed external skill link becomes independent and rollback restores original literal link`
5. `claude applies existing gates only when triggered without adding new obligations`
6. `claude contracts have explicit destinations and before-action gates`
7. `claude en skipGlobal=false preserves public rendering baseline`
8. `claude en skipGlobal=true preserves public rendering baseline`
9. `claude installed endpoint preserves workflow guards without package dependencies`
10. `claude ko skipGlobal=false preserves public rendering baseline`
11. `claude ko skipGlobal=true preserves public rendering baseline`
12. `codex applies existing gates only when triggered without adding new obligations`
13. `codex contracts have explicit destinations and before-action gates`
14. `codex en skipGlobal=false preserves public rendering baseline`
15. `codex en skipGlobal=true preserves public rendering baseline`
16. `Codex existing root field edits preserve indentation, comments and nested fields`
17. `codex installed endpoint preserves workflow guards without package dependencies`
18. `codex ko skipGlobal=false preserves public rendering baseline`
19. `codex ko skipGlobal=true preserves public rendering baseline`
20. `failed acquired directory metadata verification retains originals before publication`
21. `generated global upgrade preserves settings, reports partial failure, retries newer version and npx applies displayed latest version`
22. `packed all-target install preserves distinct omitted platform limits independently`
23. `packed help, metadata and service preparation leave real homes untouched`
24. `packed instruction references install with valid links for both platforms in custom spaced homes`
25. `packed management installs, changes models and removes without a global arc`
26. `packed reinstalls synchronize managed trees, preserve unrelated content without backups`
27. `packed tarball executes every target with active roles without Python or source access`
28. `packed temporary-HOME limit install, reinstall, drift selection and uninstall preserve native keys`
29. `packed transaction rolls back real published targets and cleans owned rollback stages`
30. `profile models, permissions, canonical policy and CLI/runtime bytes are preserved`
31. `publishes both flat platforms and manifest consistently without replacing ARC-owned files`
32. `read-only packed modes never invoke Git and package metadata stays protected`
33. `release consumer opens TUI only on explicit launch and installs independent platform endpoints`
34. `scripts-disabled packed install uses static references in custom CODEX_HOME without rewriting readonly package`
35. `staging populates acquired nested 0555/0500 directories before restoring metadata`
36. `uninstall failure, cleanup error or interruption skips CLI removal and retains partial harness results`

## 개정 이력

| Version | Approval time | Classification | Affected tasks | Reason |
|---|---|---|---|---|
| v1 | 2026-11-16 (계획 승인) | 초기 승인 | — | — |
| v2 | 2026-11-16T00:42:34Z | 범위·수용 기준·검증 변경 | T3, T8, QA 대상 목록 | spec v2(결정 11): F6을 현행 정책 유지 + 판정 일치 테스트·문서화로 변경. T3는 테스트·문서만, 필수 QA 해제 |
