# ARC TUI 설치·버전·제거 흐름 개선 실행 계획

> **For agentic workers:** ARC 절차를 적용한다. Orchestrator가 조정하고 단일 Implementer가 T1의 테스트와 구현을 담당한다. fresh QA의 필수 검증 후 Orchestrator가 수용·커밋하고, 독립 Reviewer가 최종 전체 변경을 검토한다. 별도 superpowers executor나 중첩 agent는 요청하지 않는다. Planner는 초안만 반환하며 문서 저장·승인 요청·Git 변경·구현을 수행하지 않는다.

**Goal:** 대상 선택을 Codex/Claude로 단순화하고, 초기 상태의 버전 조회와 Settings/CLI 제거 범위를 분리하며, 결과에서 rollback 정보를 숨긴다.

**Architecture:** 기존 TUI와 management API를 유지한다. TUI Settings만 CLI·공유 completion 제거를 명시적으로 비활성화하고, 기존 옵션 생략 호출의 제거 동작은 보존한다. 버전 조회는 현재 실행 패키지와 npm latest를 사용하되 업그레이드 자격을 별도로 제한한다.

**Tech Stack:** Node.js `>=22`, ECMAScript modules, `node:test`, 기존 safe-fs transaction, npm subprocess, macOS/`expect` PTY.

**Spec:** 이 대화의 사용자 요청과 두 차례 정정·보충으로 승인된 short design 및 brief의 C1–C5를 따른다. 별도 written spec은 없는 bounded 경로다.

**작업 대상:** `/Users/yunho/Desktop/project/arc`, branch `feat/tui-lifecycle-flow`, 준비 시 HEAD `2d95fc4d75aab92bba5e5bf9029a6829f86fcfc9`. Orchestrator 제공 준비 증거는 staged/unstaged/untracked 모두 clean이다.

**문서 집합:** 이 계획 한 개. Orchestrator 저장 예정 경로는 `/Users/yunho/Desktop/project/arc/docs/superpowers/plans/2026-10-25-tui-lifecycle-flow.md`이다. 계획 승인과 적용 문서 집합 준비·최종 handoff 확인 전 Implementer를 시작하지 않는다.

## 계획 버전 2 (2026-10-25 승인)

- v1의 C1–C5, 제품 변경 범위 및 제안값은 유지한다. v1은 사용자가 승인했고 문서 전용 커밋 `1f0d5e81e7adf0b90e6446ad3cf768f1379ed115`에 포함되어 있다.
- T1 `npm test`에서 `tests/node/upgrade-cli.test.mjs`의 기존 두 assertion이 C2/C4와 충돌하는 것을 확인했다. 사용자는 v2 초안을 승인했고, 이 테스트 파일을 T1 수정·집중 검증 범위에 추가한다. 제품 코드 추가 변경은 없다.
- 첫 assertion은 target 0개일 때 current/latest 조회를 허용하되 package 교체, child 실행, npx upgrade 등 mutation이 없도록 검증한다. 두 번째 assertion은 `report()` 성공 출력을 검증하되 rollback suffix를 기대하지 않는다.
- C1–C5 및 v1에서 승인된 UI 문구·경고 포커스·복귀 동작은 그대로 유지한다. v2 승인은 이 테스트 파일 범위만 추가하며 이전 작업을 소급 승인하지 않는다.

## Global Constraints

- C1: 세 흐름의 `Both targets` 및 setup의 공통값 병합 UI·복제 분기를 제거한다. backend에서 Remove CLI와 기존 소비자가 사용하는 내부 `target:'all'` 지원은 유지한다.
- C2: `Install / Update` 수행 전에도 current/latest를 표시한다. current는 실행 중 package version, latest는 npm 조회다. harness target이 없으면 `Version Upgrade`를 표시하지 않는다. target 0개에서 latest 조회는 읽기 전용이며 package 교체·upgrade child·npx upgrade 등의 mutation은 없다.
- C3: `Settings`는 한 플랫폼만 선택한다. `Remove CLI`는 경고 아래 정확히 빈 표시 행 하나와 선택 가능한 `Continue`, `Back`을 제공한다. `Continue`에서만 prepare/execute한다.
- C4: TUI 화면·종료 후 final report·upgrade child stdout에서 rollback 상태를 노출하지 않는다. child `report()` 대상 행은 `codex: installed`처럼 표시한다. 실패 원인·필요한 residual path·부분 성공·종료 코드는 유지한다. 내부 rollback 동작과 데이터는 유지한다.
- C5: Settings는 CLI·다른 플랫폼·공유 shell completion·native concurrency/wait 값을 보존한다. Remove CLI는 양쪽 설정 제거 실패·중단 시 CLI 제거를 건너뛰고 기존 snapshot/identity 검증을 유지한다.
- **호환성:** 기존 `prepareOperation(context,{kind:'uninstall',target:'codex'|'claude'|'all'})` 호출은 설정 제거 성공 후 CLI 제거를 계속 수행한다. 옵션을 생략한 단일 target 호출도 허용한다.
- README, 공개 CLI 문법, runtime compatibility 계약은 범위 밖이다.
- 최종 소스에 맞춰 `MANIFEST.sha256`를 재생성한다. 대상 소스는 `COOPERATIVE_RUNTIME_MODULES`에 없으므로 runtimeHash를 변경하지 않는다.
- 패키지 consumer의 runtime 하위 테스트는 `ARC_TEST_TUI_WORKSPACE`로 지정한 task 전용 임시 Git fixture에서 실행한다. 사용자의 프로젝트 데이터나 작업 checkout을 이 변수로 전달하지 않는다.

다음은 사용자 literal 요구가 아닌 **계획 제안값**이며, 이 계획을 승인할 때 함께 확정한다.

| 항목 | 제안 |
|---|---|
| Uninstall 메뉴 | `Settings`, `Remove CLI`, `Back` |
| 경고 화면 제목 | `Remove CLI` |
| 경고 문구 | `Removes ARC settings for Codex and Claude, then removes the ARC CLI.` |
| 기본 포커스 | `Back` |
| 경고의 Back | Uninstall 메뉴로 복귀하고 `Remove CLI` 선택 유지 |
| Settings 전역 block | 선택 플랫폼의 managed instruction block 제거, 기존 block 보존 선택 화면 제거 |
| 설치 성공 | `ARC installed for Codex.` / `ARC installed for Claude.` |
| Settings 성공 | `Codex ARC settings removed.` / `Claude ARC settings removed.` |
| 전체 제거 성공 | `ARC settings and CLI removed.` |
| CLI 이미 없음 | `ARC settings removed. CLI is not installed.` |
| 제거로 세션 종료 | `CLI removal ended this session.` |

native concurrency/wait 및 completion 보존은 brief에서 기존 코드와 Settings 의미로 도출된 C5이며, 사용자 문구의 직접 인용으로 취급하지 않는다.

## Review Focus

1. target 0개이고 npm registry 조회까지 실패해도 current를 표시한다. latest 조회는 허용하되 package·child·npx mutation은 없다.
2. TUI Settings는 명시적인 옵션으로 CLI·공유 completion을 보존하며, 기존 옵션 생략 management 호출은 종전 제거 동작을 유지한다.
3. 두 번째 플랫폼 제거 실패·취소·CLI identity 변경 시 CLI 제거를 실행하지 않는다.
4. child 출력·interrupt final report·실제 패키징된 TUI·upgrade consumer에서도 새 결과 문구를 사용하고 rollback 상태를 숨기면서 오류와 residual path를 유지한다.
5. 빈 표시 행은 선택 대상이 아니며 Back·Esc·연속 Enter가 의도하지 않은 제거를 실행하지 않는다.

각 조건은 T1 테스트에 포함한다.

---

## T1 — TUI lifecycle 계약 통합 변경

**목표·범위:** C1–C5를 연결된 하나의 변경으로 구현한다. UI와 management 옵션, 제거 순서, 결과 출력과 패키징된 소비자 검증은 함께 검증해야 하므로 나누어 수용하거나 커밋하지 않는다.

**선행 작업·의존성:** 승인된 short design, 이 계획 승인, 적용 문서 집합 준비, Orchestrator의 handoff gate 통과. 선행 구현 작업은 없다.

**수정 파일**

- `/Users/yunho/Desktop/project/arc/lib/tui/setup.mjs`
- `/Users/yunho/Desktop/project/arc/lib/tui/app.mjs`
- `/Users/yunho/Desktop/project/arc/lib/management/operations.mjs`
- `/Users/yunho/Desktop/project/arc/lib/management/update.mjs`
- `/Users/yunho/Desktop/project/arc/lib/installer/uninstall.mjs`
- `/Users/yunho/Desktop/project/arc/MANIFEST.sha256`

**수정·추가 테스트**

- `tests/node/tui-setup.test.mjs`
- `tests/node/tui-app.test.mjs`
- `tests/node/tui-app-pty.test.mjs`
- `tests/node/tui-package-consumer.test.mjs`
- `tests/node/management-update.test.mjs`
- `tests/node/management-operations.test.mjs`
- `tests/node/uninstall.test.mjs`
- **v2 추가 제안:** `tests/node/upgrade-cli.test.mjs`

**회귀 검증에 사용하는 기존 테스트**

- `tests/node/uninstall-cli.test.mjs`
- `tests/node/uninstall-pty.test.mjs`
- `tests/node/npm-uninstall-consumer.test.mjs`

새 제품 파일·dependency·설치 단계는 계획하지 않는다. consumer 검증용 임시 Git fixture 준비와 정리는 Orchestrator가 소유한다.

### 인터페이스

기존 함수 이름과 호출 구조를 유지하고 다음 옵션·조건을 추가한다.

- `setupOptions(draft,target)`와 `runSetup(...)`: TUI setup 대상은 `'codex'|'claude'`만 허용한다. `'all'`의 공통값 합치기·복제·화면 경로를 제거한다.
- `prepareOperation(context,options,{selections=[]}={})`: uninstall 옵션에 선택적인 `removeCli:boolean`을 추가한다.
  - TUI Settings: `{kind:'uninstall',target:'codex'|'claude',skipGlobal:false,removeCli:false}`.
  - TUI Remove CLI: `{kind:'uninstall',target:'all',skipGlobal:false,removeCli:true}`.
  - **`removeCli` 생략은 `true`로 해석하여 기존 동작을 유지한다.**
  - 기존 단일 target 및 `'all'` 호출을 계속 허용한다. `removeCli:true`라는 이유로 단일 target 호출을 거부하지 않는다.
  - 준비 결과의 options에는 적용할 `removeCli` 값을 정규화해 담고, 실행은 이 값을 사용한다.
- `buildUninstallPlan({target,safeFs,skipGlobal=false,removeCompletion=true})`: 추가 옵션으로 completion 정리 여부를 제어한다. 기존 standalone 호출의 기본 정리를 유지한다. TUI Settings의 `removeCli:false` 준비 경로에서만 `removeCompletion:false`를 명시적으로 전달한다.
- `executeOperation(context,prepared)`: Settings에는 `inspectGlobalArc`·`uninstallGlobal` 호출이 없다. `removeCli`가 true인 경우 기존 준비/실행 identity 검증과 npm 제거를 적용한다. 기존 형식의 prepared options에서 필드가 없더라도 종전 CLI 제거 의미를 유지한다.
- `prepareUpdate(context)`: 기존 반환 필드를 유지한다. target 0개도 조회 결과를 반환하고 `canUpgrade`는 `state.targets.length>0 && 최신 버전이 더 높음`일 때만 true다.
- `executeUpdate(context,prepared)`: target 0개에 대한 명시적 실행 거부를 유지·보강한다. 외부에서 `canUpgrade`만 변조해도 child/npm mutation을 시작하지 않는다.
- `report(result,output,error)`와 `resultRows(result)`: 내부 rollback 필드는 그대로 두되 사용자 출력에 rollback 상태를 포함하지 않는다. `resultRows`의 선택적 두 번째 인자로 작업 문맥을 전달해 성공 문구를 구분한다. 기존 한 인자 호출은 지원한다.
- `ARC_TEST_TUI_WORKSPACE`: package consumer가 사용할 실제 임시 Git fixture의 절대 경로다. Orchestrator가 각 실행 전에 준비하고 전달한다. Implementer와 QA는 Git 준비·변경 명령을 수행하지 않는다.

Remove CLI의 completion 정리는 기존 uninstall transaction에 묶어 유지하는 **최소 변경 제안**이다. 따라서 뒤 플랫폼 실패 시 앞 플랫폼의 완료된 제거와 completion 정리는 유지될 수 있으며, CLI는 제거하지 않는다. completion 정리를 “CLI 제거 성공 후에만” 수행하는 원자적 계약은 이번 승인 기준에 없으며 이 계획에서 추가하지 않는다.

### 실행 단계

- [ ] **1. 아래 테스트를 먼저 작성·수정한다.**

| 테스트 이름 | 핵심 assertions |
|---|---|
| `setup exposes only Codex and Claude for install and preset` | 두 kind의 대상 rows가 Codex/Claude이며 `Both targets` 없음 |
| `setup never reconciles or copies settings across targets` | target별 서로 다른 draft 유지, reconciliation 제목·버튼 없음, `'all'` setup 입력 거부 |
| `version check works before any harness install` | `state.targets=[]`, current는 package version, latest 표시, `canUpgrade===false`, mutation 0회 |
| `empty harness and registry failure still return current version` | latest null, 오류 보존, current 유지, mutation 0회 |
| `empty harness cannot execute upgrade even with forged eligibility` | 실행 실패, global/npx/child 호출 0회 |
| `legacy uninstall without removeCli preserves CLI removal behavior` | `'codex'`, `'claude'`, `'all'` 각각 옵션 생략 호출 허용, 선택 설정 제거 성공 후 npm 제거 1회, 기존 completion 정리 유지 |
| `standalone uninstall plan keeps completion cleanup by default` | `removeCompletion` 생략 시 기존 completion 정리 계획 유지 |
| `uninstall Settings explicitly preserves CLI and completion` | TUI options에 `removeCli:false`, Codex/Claude 각각 반대 플랫폼·CLI·native 값·completion bytes 보존 |
| `Settings never inspects or removes the global CLI` | npm 관련 서비스를 `assert.fail`로 주입해도 성공 |
| `Remove CLI warning has one spacer and real Continue and Back actions` | 경고 다음 빈 행 정확히 1개, 빈 행 선택 불가, 두 action 선택 가능 |
| `Remove CLI Back returns without preparing or executing` | prepare/execute 0회, Uninstall 메뉴 복귀 |
| `Remove CLI Continue executes the prepared snapshot once` | `target:'all'`, `removeCli:true`, prepare/execute 각각 1회·동일 prepared 객체 |
| `Remove CLI removes settings before the verified CLI` | npm 제거 진입 시 양쪽 ARC 설정 없음, completion 정리, 비관리 파일·native 값 보존 |
| `Remove CLI skips npm on target failure interruption or identity drift` | 각 조건에서 npm 제거 0회, 부분 성공·오류·중단 코드 보존 |
| `results hide rollback while retaining errors and residual paths` | 구조화 결과·child stdout/stderr·final report에 rollback 상태 없음, 성공/실패 대상·오류·residual 보존 |
| `install and uninstall success messages match their operation` | 위 문구와 일치, 제거 성공에 설치용 새 세션 안내가 붙지 않음 |
| 기존 `release consumer opens TUI only on explicit launch and installs independent platform endpoints` | 패키징된 `resultRows`에서도 플랫폼별 새 설치 성공 문구를 검증하고 기존 generic 문구 assertion 교체, rollback 미노출 |
| 기존 `installed workflow status in Orchestrator-prepared isolated Git workspace` | 환경변수로 전달한 임시 Git fixture에서 Codex/Claude runtime 상태 확인·tamper hold 검증, skip 없음 |
| `PTY lifecycle navigation preserves terminal state and direct execution` | 새 메뉴·경고·Back·Continue·연속 입력·interrupt, terminal 복원 검증 |

호환성 기준은 기존 `tests/node/management-operations.test.mjs:14–19` 및 `tests/node/npm-uninstall-consumer.test.mjs:18–19`의 옵션 생략 호출이다. 이를 `removeCli:true`를 필수로 전달하도록 변경하여 회귀를 숨기지 않는다. 기존 assertions를 유지하면서 명시적 Settings 보존 테스트를 추가한다.

`tests/node/tui-package-consumer.test.mjs`는 설치된 패키지에서 `resultRows`를 import한다. 기존 `Open a new agent session` assertion을 새 계약으로 바꾼다. 동일한 packaged helper로 각 플랫폼의 설치 결과와 대응하는 작업 문맥을 전달하여 `ARC installed for Codex.` 및 `ARC installed for Claude.`를 확인한다. 기존 `target:'all'` backend 설치와 양쪽 endpoint·payload 무결성 검증은 유지한다.

기존 rollback 내부 동작 테스트는 삭제하지 않는다. Both 전용 테스트는 대상 분리·보존 assertions로 대체하고, 과거 UI 출력의 rollback assertions만 새 출력 계약에 맞춘다.

새 버전 테스트는 기존 `context()` fixture를 사용하여 다음 수준의 직접 assertions를 둔다.

```js
ctx.collectInstalledState=()=>({targets:[],stateToken:'a'.repeat(64)});
const prepared=await api.prepareUpdate(ctx);
assert.equal(prepared.currentVersion,currentPackageVersion);
assert.equal(prepared.latestVersion,'1.10.0');
assert.equal(prepared.canUpgrade,false);
assert.ok(!ctx.events.some(event=>Array.isArray(event)));
```

경고 spacing은 mock menu 인자만 보지 않고 `createTuiInterface`를 거친 실제 rendered rows에서 확인한다. 기존 separator 지원을 사용하여 빈 행을 action 목록에 넣지 않는다.

**v2 추가 제안 — `tests/node/upgrade-cli.test.mjs` 기존 consumer assertions**

- `unsupported missing and damaged installations stop before package writes`: missing target에서는 `latest` 조회만 허용한다. unsupported/damaged는 기존처럼 조회하지 않는다. 모든 경우 package·child·npx mutation이 없어야 한다.
- `successful harness update reports the version and target without completion setup guidance`: 버전과 `codex: installed`를 유지하고 rollback suffix가 없음을 직접 확인한다. completion 안내 부재 assertion은 유지한다.

T1 실행 중 전체 `npm test`가 이 두 낡은 기대와 C2/C4의 충돌을 드러냈다. v1의 `management-update.test.mjs` RED/GREEN은 해당 제품 동작을 이미 직접 검증한다. v2는 consumer regression assertion만 정정하며 제품 코드를 추가 변경하지 않는다. 다음 focused 명령은 v2 승인 후 실행한다.

```sh
node --test tests/node/upgrade-cli.test.mjs
```

- [ ] **2. 새 테스트를 실행해 RED 증거를 기록한다.**

```sh
node --test tests/node/tui-setup.test.mjs tests/node/tui-app.test.mjs tests/node/management-update.test.mjs tests/node/management-operations.test.mjs tests/node/uninstall.test.mjs
```

기대: 새 계약과 충돌하는 기존 동작 때문에 실패한다. 예를 들어 target 0개의 준비 오류, 명시적 Settings의 CLI 접근, Both 노출, rollback 출력이다. 환경·fixture·기존 실패는 새 계약의 RED 증거로 대체하지 않는다.

옵션 생략 호환성 테스트는 변경 전부터 통과하는 회귀 기준으로 기록한다. 기존 동작을 의도적으로 깨뜨려 RED를 만들지 않는다.

package consumer의 새 문구 assertion도 변경 전 소스에서 실행해 RED를 기록한다. 이 실행에는 아래 임시 fixture 준비 조건을 적용한다.

**package consumer 실행 준비 조건**

Orchestrator는 실행마다 사용자 checkout 밖의 새 task 전용 임시 디렉터리에 독립 Git repository와 초기 commit을 준비한다. 기존 사용자 파일·설정·repository를 복사하거나 연결하지 않는다. 준비한 절대 경로·HEAD·clean 상태·소유권·정리 책임을 handoff에 기록하고 `ARC_TUI_PACKAGE_FIXTURE`에 실제 경로를 전달한다.

Implementer 검증과 fresh QA 검증은 각각 새 fixture를 사용한다. runtime 하위 테스트가 생성하는 workflow 상태는 해당 임시 fixture 안에서만 허용한다. 생성·Git 준비·실행 후 정리는 Orchestrator가 소유하며, 실행 증거를 보존한 뒤 task 전용 경로만 정리한다. fixture 미준비 시 해당 검증을 보류하고 사용자 checkout으로 대체하지 않는다.

```sh
ARC_TEST_TUI_WORKSPACE="$ARC_TUI_PACKAGE_FIXTURE" node --test tests/node/tui-package-consumer.test.mjs
```

기대: 새 설치 성공 문구 assertion에서 의도한 RED. runtime 하위 테스트를 skip하여 RED/GREEN 실행을 대체하지 않는다.

- [ ] **3. management와 uninstall의 제거 범위를 분리한다.**

`removeCli`는 생략 시 true로 정규화해 준비 결과에 고정한다. 기존 단일 target/default 호출은 기존처럼 CLI 제거까지 진행한다.

TUI Settings는 명시적으로 `removeCli:false`를 전달한다. 이 경우 전역 CLI 탐색을 건너뛰고 선택 플랫폼 plan에 `removeCompletion:false`를 전달한다. Remove CLI는 명시적으로 `target:'all',removeCli:true`를 전달해 두 플랫폼 plan과 CLI identity를 준비한다. 기존 preflight·snapshot·부분 성공·중단 처리를 거쳐 설정 제거가 모두 성공한 경우에만 npm 제거를 호출한다.

근거: `lib/management/operations.mjs:19–46`; `lib/installer/uninstall.mjs:7–35`; `lib/installer/shell-completion.mjs:15–23`.

- [ ] **4. 버전 조회와 업그레이드 자격을 분리한다.**

`prepareUpdate()`의 target 0개 조회 차단을 제거한다. current/latest 및 npm context 검증을 유지하고 target 존재 여부를 `canUpgrade`에 반영한다. 실행 단계와 기존 child의 설치 target 요구는 유지한다. 같은/낮은/latest 조회 실패 때의 기존 비활성 동작도 유지한다.

근거: `lib/management/update.mjs:35–66`; `lib/npm/upgrade.mjs:7–11`, `48–53`.

- [ ] **5. TUI 대상·제거 흐름과 결과 출력을 변경한다.**

세 대상 흐름의 Both와 setup 전용 all 분기를 제거한다. Uninstall 메뉴에서 Settings와 Remove CLI를 분리하고, 경고 화면은 위 문구·빈 행·action 계약을 구현한다. Back/Esc에는 prepare가 없고 Continue에서 준비한 객체를 한 번 실행한다.

설치·제거 성공 문구를 작업 문맥으로 구분한다. 구조화 결과에서 rollback 상태를 출력하지 않고 upgrade child의 `report()`도 동일하게 변경한다. 기존 child 출력의 `; rollback: ...` legacy suffix가 TUI로 전달되는 경우에는 suffix만 제거하고 같은 줄의 대상 상태와 별도 오류·residual 행을 보존한다. 관련 없는 diagnostic 행 전체를 삭제하는 방식은 사용하지 않는다.

근거: `lib/tui/setup.mjs:5–19`; `lib/tui/app.mjs:35–61`; `lib/management/update.mjs:14–18`.

- [ ] **6. 최종 소스에 맞춰 manifest를 갱신하고 focused GREEN을 확인한다.**

설치 fixture와 package consumer가 payload 무결성을 검사하므로 구현 수정 후 설치 관련 GREEN 실행 전에 갱신한다.

```sh
node scripts/update-manifest.mjs
npm run check:manifest
```

기대: exit 0, 최종 소스 bytes와 manifest 일치. runtimeHash·`COOPERATIVE_RUNTIME_MODULES` 변경 없음.

이후 단계 2의 단위·management 명령을 다시 실행한다. v2 승인 후에는 `tests/node/upgrade-cli.test.mjs`도 포함한다. 기대: fail 0, skip 0. 옵션 생략/default 호환성과 명시적 Settings 보존이 모두 통과해야 한다.

```sh
node --test tests/node/tui-setup.test.mjs tests/node/tui-app.test.mjs tests/node/management-update.test.mjs tests/node/management-operations.test.mjs tests/node/uninstall.test.mjs tests/node/upgrade-cli.test.mjs
```

- [ ] **7. 패키지 consumer·CLI consumer·실제 PTY 회귀를 확인한다.**

Orchestrator가 준비한 새 fixture 경로를 사용한다.

```sh
ARC_TEST_TUI_WORKSPACE="$ARC_TUI_PACKAGE_FIXTURE" node --test tests/node/tui-package-consumer.test.mjs
node --test tests/node/uninstall-cli.test.mjs tests/node/npm-uninstall-consumer.test.mjs
node --test tests/node/tui-app-pty.test.mjs tests/node/uninstall-pty.test.mjs
npm run check:manifest
```

기대: 모두 exit 0, fail 0, skip 0. package consumer의 nested runtime subtest도 실제 실행·통과해야 한다. 생성 tarball·설치된 격리 패키지의 새 결과 문구·양쪽 endpoint·payload tamper 검증을 유지한다.

공개 `uninstall` 문법은 계속 거부되고 기존 management consumer의 옵션 생략 제거 동작은 유지된다. fixture 밖의 실제 사용자 설정은 변경하지 않는다.

PTY는 현재 테스트가 macOS와 `expect`를 조건으로 사용한다. 지원 환경에서 실행해 결과를 확보해야 하며 조건부 skip은 통과 증거가 아니다. 미지원·`expect` 부재는 해당 검증 및 작업 수용을 보류하고 Orchestrator에 반환한다. 자동 설치나 환경 변경은 하지 않는다.

- [ ] **8. Implementer 결과와 fresh QA 증거를 반환한다.**

Implementer는 변경 파일, RED/GREEN 명령·결과, manifest 결과, C1–C5 대응, 기존 API 호환성 및 남은 제한을 보고한다. package consumer 증거에는 실제 fixture 절대 경로·준비 identity·nested subtest 실행 결과를 포함한다.

fresh QA는 최종 diff와 연결된 revision/change 상태에서 위 focused 명령 및 실제 PTY assertions를 독립 확인한다. package consumer는 QA용 새 fixture로 실행한다. QA 실패는 같은 작업의 Implementer 수정과 필요한 QA 재검증을 거친다.

### T1 수용 기준과 보류 조건

Orchestrator는 다음 증거가 모두 있을 때만 T1을 수용한다.

- C1–C5 및 승인된 제안값을 테스트가 직접 검증한다.
- v2 승인 후 `upgrade-cli.test.mjs`가 target 0개의 읽기 전용 latest 조회와 mutation 부재, rollback 없는 child report를 확인한다.
- 기존 `removeCli` 생략 호출의 단일/양쪽 target 제거와 CLI·completion 정리가 유지된다.
- TUI Settings가 `removeCli:false`를 명시하고 CLI·공유 completion을 보존한다.
- 패키징된 TUI가 새 설치 성공 문구를 사용한다.
- package consumer의 nested runtime subtest가 task 전용 Git fixture에서 skip 없이 통과한다.
- 필수 focused checks는 fail 0, skip 0이다.
- 내부 rollback·snapshot·identity·중단·부분 성공 계약이 유지된다.
- final report·child 출력까지 rollback 상태 노출이 없다.
- Settings의 보존 대상과 Remove CLI의 순서가 fixture bytes 및 서비스 호출 순서로 증명된다.
- manifest가 최종 소스와 일치하고 범위 밖 파일 변경이 없다.
- fresh QA의 미해결 finding이 없다.

다음은 관련 작업과 수용을 보류한다.

- 작업 branch/HEAD·소유권·변경 상태가 handoff와 다름.
- v2 plan 정정이 승인되지 않았거나 재개 handoff gate를 통과하지 못함.
- 기존 management 소비자에게 새 옵션을 필수로 요구하거나 단일 target 호출을 거부해야 함.
- 승인된 제거 범위를 넘어 native 설정이나 다른 플랫폼을 변경해야 함.
- completion을 CLI 성공 이후로 원자적으로 옮겨야 한다는 새 요구가 생김.
- package consumer fixture가 미준비·비격리 상태이거나 사용자 프로젝트를 가리킴.
- 필수 검증 실패·skip·실행 불가 또는 source-to-evidence 연결 부재.
- manifest 갱신에 예상 밖 자산이나 runtimeHash 변경이 포함됨.

실패는 baseline/current를 구분하고 영향 범위·근거를 보고한다. 임의로 테스트를 삭제·skip하거나 승인 기준을 낮추지 않는다.

## 최종 전체 검증과 완료 경계

T1 수용 후 Orchestrator가 해당 작업을 하나의 focused 구현 커밋으로 기록한다. 그 다음 독립 Reviewer가 최종 전체 변경과 QA 증거를 한 번 검토한다. Reviewer는 T1의 커밋 전 필수 게이트가 아니다.

검토 범위는 C1–C5, 옵션 생략 호환성, 명시적 Settings 옵션, 제거 순서, Settings 보존, target 0개 업그레이드 차단, child/final 출력의 정보 보존, packaged consumer 결과와 fixture 격리, manifest 범위다. 최종 Reviewer finding은 Implementer → Reviewer 재검토로 해결하며 이 단계에서 QA를 재배정하지 않는다. 초기 final review 이전에 필요한 QA와 실패 재검증은 반드시 완료한다.

Orchestrator는 최종 finding 해소 및 변경·검증 증거의 일치를 확인한 뒤 전체 완료를 선언한다. 이 계획에는 push·publish·deploy가 없다.
