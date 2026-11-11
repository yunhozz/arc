# ARC 설치 모드와 역할 설정 개편 Implementation Plan

> ARC Orchestrator가 top-level task 단위로 조정한다. 단계 진행은 체크박스(`- [ ]`)로 추적한다. Implementer는 Git 상태를 바꾸지 않는다. 각 task는 수락된 뒤 Orchestrator가 focused commit 하나로 남긴다.

**Goal:** 통합 모드에서 단독 profile이 남지 않게 하고, 단독과 통합을 양방향으로 안전하게 전환한다. 프리셋을 없애고 역할 편집기로 곧바로 들어가게 하며, 역할마다 플랫폼을 자유롭게 고르게 한다. TUI 문구는 간결하게 정리한다.

**Architecture:**
- 설치 모드 판정 모듈(`lib/installer/install-mode.mjs`)을 새로 만든다. 상태, 업그레이드, 게시, 해제, 운영 경로가 모두 이 판정을 쓴다.
- 단독 profile 제거와 복원은 기존 통합 게시 트랜잭션(`applyTransaction`의 `remove:true`)에 넣는다.
- 모델 설정은 v3 한 벌 형식으로 바꾸고, 읽을 때 v1/v2를 변환한다.
- TUI는 플랫폼을 고르면 곧바로 역할 편집기로 들어가는 구조로 다시 짠다.

**Tech Stack:** Node.js 22 ESM, `node:test`, Python 3 `unittest`, 기존 safe-fs native, vendored TOML.

**Spec:** `docs/superpowers/specs/2026-11-11-install-mode-role-settings-design.md` (승인됨, sha256 `956aef1b…139935`)

## Global Constraints

- Node.js 22 이상, ESM. 새 dependency는 추가하지 않는다.
- `lib/runtime/`과 runtime payload(`RUNTIME_MODULE_PATHS`)는 바꾸지 않는다. 바꿔야 할 필요가 확인되면 해당 task를 hold하고 Orchestrator에 반환한다.
- 패키지 파일(`claude/`, `codex/`, `lib/`)을 바꾼 task는 `node scripts/update-manifest.mjs`로 `MANIFEST.sha256`을 다시 생성한다. `npm run check:manifest`와 `npm run check:role-policy`가 통과해야 한다.
- `[ARC role policy: contract begin]` … `[ARC role policy: contract end]` 생성 구간은 손으로 고치지 않는다.
- Claude와 Codex 지시문은 같은 내용을 유지한다.
- TUI 문자열은 영어이고 spec §10 원문 그대로 쓴다.
- 소유권 원칙
  - 단독 profile은 spec §6.3(일반 파일, 이름 줄 정확히 하나, `[ARC role policy: contract begin]` 포함)을 통과할 때만 지우거나 덮어쓴다.
  - 통합 파일은 marker 검증을 통과할 때만 지운다.
  - 통과하지 못한 파일은 남기고 `Residual path: <path>`로 보고한다.
- 오류 문구
  - `Claude & Codex configuration cannot be verified.`
  - `Claude & Codex is active; confirm the switch first`
- `README.md`, `docs/harness-operation.md`, `MANIFEST.sha256`은 여러 task가 고친다. 고치는 순서는 I2 → I1 → I4이고, I3는 MANIFEST만 고친다. 같은 파일을 동시에 작업하지 않는다.
- 테스트 명령 형식
  - Node: `node --test --test-timeout=120000 <files>`
  - Python: `python3 -m unittest <files>`
- 전체 판정은 기준선 비교로 한다. I2를 시작하기 전에 Orchestrator가 현재 HEAD(문서 커밋 포함)에서 다음 두 명령을 실행해 실패 목록을 기록한다. 각 task는 이 기준선 대비 새 실패가 없어야 한다.
  - `node --test --test-timeout=120000 tests/node/*.test.mjs`
  - `python3 -m unittest tests/test_codex_models.py tests/test_claude_payload.py tests/test_arc_policy.py`

## Review Focus

1. 통합 모드인데 전환 플래그 없이 단일 플랫폼 install/preset/uninstall 요청이 운영 계층에 도달하는 경우(TUI 밖 호출 포함)는 거부되어야 하고, 단독 profile이 다시 생기면 안 된다. 테스트는 I2의 `single-platform operation is refused while Claude & Codex is active without the switch flag`이다.
2. 사용자가 만든 같은 이름 파일(`arc-qa.md` symlink, contract 줄 없는 파일)은 게시나 해제를 거쳐도 그대로 남아야 한다. 테스트는 I2의 `unowned standalone profile is kept and reported as residual`이다.
3. 통합 해제 시점에 한쪽 홈의 `skills/arc`가 지워져 있으면, 그 홈에는 profile을 쓰지 않고 나머지 작업은 끝나야 한다. 테스트는 I2의 `deactivation writes standalone profiles only where skills/arc exists`이다.
4. 통합 Change Models에서 Claude 언어가 KR이면 payload로 다시 렌더링한 profile에도 KR 언어 정책이 남아야 한다. 테스트는 I2의 `composite Change Models renders from the payload and keeps each platform language`이다.
5. 예전 설치의 활성 값이 현재 카탈로그에 없는 경우를 다룬다.
   - 업그레이드는 값을 그대로 보존해야 한다. 테스트는 I1의 `upgrade keeps legacy active values that are missing from the catalog`이다.
   - 편집기는 그 역할을 ` !`로 표시하고 `Apply`를 막아야 한다. 테스트는 I1의 `missing pair blocks Apply with Unavailable selection`이다.

## 파일 지도와 task별 수정 순서

| 파일 | 책임 | 수정 task(순서) |
|---|---|---|
| `lib/installer/install-mode.mjs` (신규) | 모드 판정, 단독 profile 식별 | I2 |
| `lib/installer/role-routing.mjs` | 게시 시 단독 profile 제거, 해제 트랜잭션 | I2 |
| `lib/installer/plan.mjs` | `profiles` 옵션, `renderStandaloneProfiles`, roles 기반 모델 | I2 → I1 |
| `lib/installer/upgrade-state.mjs`, `lib/installer/upgrade.mjs` | 모드를 아는 업그레이드 | I2 → I1(upgrade.mjs만) |
| `lib/installer/preset.mjs` | v3 모델 변경 | I1 |
| `lib/management/status.mjs` | 모드를 아는 설치됨 판정 | I2 |
| `lib/management/operations.mjs` | 전환, 통합 preset 재료, roles·settings 인자, 결과 문구 | I2 → I1 → I4 |
| `lib/models/config.mjs`, `lib/models/index.mjs` | v3 모델 설정 | I1 |
| `claude/skill/models.toml`, `codex/skill/models.toml` | 패키지 기본값 v3 | I1 |
| `claude|codex/skill/scripts/model_config.py`, `apply-models.py` | Python v3 | I1 |
| `lib/tui/setup.mjs` | U-03(I2), 편집기 직행(I1) | I2 → I1 |
| `lib/tui/custom-preset.mjs` | 역할 편집기 | I1 |
| `lib/tui/app.mjs` | Uninstall 해제 줄과 loader(I2), loader 교체(I1), 홈·Working·Result·Check Version·Uninstall·키 규칙(I4) | I2 → I1 → I4 |
| `claude|codex/skill/SKILL.md`, `claude|codex/skill/references/coordination.md` | 지시문 | I3 |
| `tests/node/composite-instructions.test.mjs` | 지시문 테스트 | I3 → I4 |
| `README.md`, `docs/harness-operation.md` | 운영 문서 | I2 → I1 → I4 |
| `MANIFEST.sha256` | 재생성 | I2 → I3 → I1 → I4 |

---

### Task I2: 설치 모드 배타와 양방향 전환 (Q1 코드)

**목표와 범위:**
- 통합 게시 때 단독 profile을 정리한다. 상태 판정과 업그레이드가 모드를 따르게 한다.
- 통합 Change Models가 payload로 렌더링하게 한다.
- 통합 → 단독 자동 전환(U-03)과 통합 중 단일 Uninstall을 구현한다.
- 문서에 모드 전환 설명을 추가한다.
- 대상 spec 절: §6 전체, U-03, U-14의 해제 줄, §15의 모드 전환 문서.

**선행 작업:** 없음(첫 task). 시작 전 기준선 기록.

**Files:**
- Create: `lib/installer/install-mode.mjs`, `tests/node/install-mode.test.mjs`
- Modify: `lib/installer/plan.mjs:21-25,51-72`
- Modify: `lib/installer/role-routing.mjs:41-69,100-142` (해제 함수 추가)
- Modify: `lib/management/status.mjs:11-18`, `lib/installer/upgrade-state.mjs:11-29`, `lib/installer/upgrade.mjs:8-19`
- Modify: `lib/management/operations.mjs:30-43,54-90,99-118`
- Modify: `lib/tui/setup.mjs:47,136`, `lib/tui/app.mjs:56-63,69`
- Modify tests: `tests/node/role-routing-install.test.mjs:97-106`, `tests/node/tui-setup.test.mjs`, `tests/node/tui-app.test.mjs`(필요한 곳)
- Modify: `README.md`, `docs/harness-operation.md`
- Regenerate: `MANIFEST.sha256`

**Interfaces:**
- Consumes: 없음
- Produces:
```js
// lib/installer/install-mode.mjs
export function isOwnedStandaloneProfile(bytes /*Buffer*/, platform /*'codex'|'claude'*/, role /*'arc_qa' 등*/) /*: boolean*/
export function inspectStandaloneProfile({safeFs, target, role, snapshot}) /*: {path:string, exists:boolean, owned:boolean}*/  // symlink는 owned:false
export function readInstallMode({safeFs, targets /*{codex,claude}*/, snapshot = new Map()})
  /*: {mode:'standalone'|'composite'|'unverified', homes:{codex:Mode, claude:Mode}, config:object|null, residualPaths:string[]}*/
// lib/installer/plan.mjs
export function renderStandaloneProfiles({payload, target, modelConfig, language}) /*: Map<string,Buffer>*/
buildInstallPlan({...기존, profiles = 'write' /* 'omit'이면 단독 profile 경로를 쓰지도 managedPaths에 넣지도 않음 */})
// lib/installer/role-routing.mjs
prepareCompositeFiles(...)  // 반환에 standaloneRemovals:string[], residualPaths:string[] 추가
publishCompositeFiles(...)  // 반환 residualPaths에 미소유 단독 profile 경로 포함
export function prepareCompositeDeactivation({context, targets, payload})
  /*: {targets, snapshot, managedPaths, externalPaths, removals:string[], writes:{path,bytes}[], residualPaths:string[]}*/
export async function publishCompositeDeactivation({context, prepared}) /*: {residualPaths:string[], cleanupError:Error|null}*/
// lib/installer/upgrade-state.mjs
collectInstalledState(...) /*: {targets, stateToken, mode}*/
// lib/management/operations.mjs
export function currentInstallMode(context) /*: 'standalone'|'composite'|'unverified'*/
prepareOperation(context, {...기존, switchFromComposite /*boolean*/})
  // 통합 + 플래그 → {kind:'switch', operation, deactivation, options}
executeOperation(context, prepared)  // kind 'switch': messages[0] === 'Claude & Codex turned off.'
// lib/tui/setup.mjs
runSetup({...기존, loadInstallMode /* () => Mode */})
```

**결정 사항 (spec 원문 기준):**
- **통합 install의 단독 profile 처리:** 현재 모드가 `standalone`이면 `profiles:'write'`, `composite`이면 `'omit'`이다(spec §6.4 1단계).
- **`prepareCompositeFiles`:** 역할마다 `inspectStandaloneProfile`을 실행한다.
  - `owned`이면 `{path, remove:true}` 스펙을 만들고 snapshot과 `managedPaths`에 넣는다.
  - `exists && !owned`이면 `residualPaths`에 넣는다.
- **게시와 해제의 모드 검사:** `readInstallMode`가 `unverified`면 `TargetConfigurationError('Claude & Codex configuration cannot be verified.')`를 던지고, 의심 경로를 `residualPaths`로 붙인다.
- **해제 트랜잭션:**
  - `acquireRoleRoutingLock`과 기존 활성 bridge 검사(`assertNoActiveBridgeDispatch`, 같은 모듈 내부 함수)를 재사용한다.
  - 검증된 통합 파일을 제거한다(`inspectCompositeRemoval` 결과).
  - `skills/arc`가 있는 플랫폼마다 `renderStandaloneProfiles`로 만든 profile을 쓴다. 입력은 설치된 `models.toml`과 `settings.toml`이다.
  - 쓰려는 경로에 기존 파일이 있으면 `owned`일 때만 덮어쓴다. 아니면 건너뛰고 residual로 남긴다.
- **단일 플랫폼 운영:** `prepareOperation`에서 `kind`가 `install`, `preset`, `uninstall`이고 `target`이 `codex` 또는 `claude`인데 모드가 `composite`이면 다음과 같다.
  - 플래그가 없으면 `TargetConfigurationError('Claude & Codex is active; confirm the switch first')`를 던진다.
  - 플래그가 있으면 `{kind:'switch', operation, deactivation, options}`를 반환한다.
  - `uninstall` `target:'all'`은 이 검사를 받지 않는다.
- **switch 실행 순서:**
  1. `publishCompositeDeactivation`
  2. `prepareOperation(context, {...options, switchFromComposite:false})`로 새로 준비
  3. 실행
  4. 결과 `messages` 맨 앞에 `Claude & Codex turned off.`를 붙인다.
  - 2·3단계에서 오류가 나면 `code:1`, 첫 줄은 유지하고 `error`를 붙인다.
- **통합 preset 재료:** `operations.mjs:70-71`의 설치 profile 읽기를 제거한다. 대신 `renderStandaloneProfiles({payload: verifyPayload(context), target, modelConfig: status.settings.modelConfig, language: status.settings.language})`를 쓴다.
- **업그레이드:** `buildUpgradePlans`는 `state.mode === 'composite'`이면 `profiles:'omit'`를 쓴다.
- **상태 판정:** `collectStatus`와 `collectInstalledState`는 `composite`이면 단독 profile을 요구하지 않는다(spec §6.2).
- **U-03 (TUI):**
  - 호출: `ui.menu(\`Switch to ${'Codex'|'Claude'}\`, ['Continue'], {backRow:true, selected:1, info:['Claude & Codex will be turned off.']})`.
  - `Continue`이면 기존 흐름으로 들어가고, prepare 옵션에 `switchFromComposite:true`를 넣는다.
  - `Back`이면 플랫폼 목록으로 돌아간다.
- **Uninstall 확인:** 통합 모드에서 단일 플랫폼을 고르면 `info`에 `Claude & Codex will be turned off.`를 추가하고 `switchFromComposite:true`를 넘긴다(U-14 일부. 나머지 문구는 I4).

**Steps:**

- [ ] **Step 1: 판정·식별 실패 테스트 작성** (`tests/node/install-mode.test.mjs`)
```js
test('isOwnedStandaloneProfile accepts shipped profiles and rejects renamed or contract-less bytes', async () => {
  for (const [platform, ext] of [['claude','md'],['codex','toml']]) for (const role of ['scouter','planner','implementer','qa','reviewer']) {
    const bytes = await fs.readFile(path.join(root, platform, 'agents', `arc-${role}.${ext}`));
    assert.equal(isOwnedStandaloneProfile(bytes, platform, `arc_${role}`), true);
    assert.equal(isOwnedStandaloneProfile(Buffer.from(bytes.toString().replace('[ARC role policy: contract begin]','')), platform, `arc_${role}`), false);
    assert.equal(isOwnedStandaloneProfile(bytes, platform, 'arc_qa') , role === 'qa');
  }
});
test('readInstallMode reports standalone, composite and unverified', ...)
// 단독 설치 → 'standalone'. 통합 게시 후 → 'composite'(homes 둘 다).
// marker의 configHash를 변조 → 'unverified'이고 residualPaths에 marker 경로가 들어감.
```

- [ ] **Step 2: 실행해서 실패 확인**
  - Run: `node --test --test-timeout=120000 tests/node/install-mode.test.mjs`
  - Expected: FAIL(모듈 없음)

- [ ] **Step 3: `lib/installer/install-mode.mjs` 구현**
  - 이름 줄 판정
    - Claude: frontmatter(첫 `---`와 다음 `---` 사이)에서 `^name: arc-<suffix>\r?$`가 정확히 1개
    - Codex: `^name[ \t]*=[ \t]*"arc_<suffix>"[ \t]*(#.*)?\r?$`가 정확히 1개
  - symlink 판정은 `inspectPath`의 snapshot 항목 `type`을 쓴다(`uninstall.mjs:12`와 같은 필드).

- [ ] **Step 4: 실행해서 통과 확인** (Step 2 명령, PASS)

- [ ] **Step 5: 게시 시나리오 실패 테스트 작성** (같은 파일)
  - helper `compositeContext(t)`: `management-operations.test.mjs:5,65-67`과 같은 방식으로 임시 홈, `staticPackageFixture`, 두 플랫폼 fake CLI, `PATH`를 준비한다.
  - helper `mixedConfig(rev)`: Planner와 Reviewer는 claude, 나머지는 codex다. 각 값은 `loadStaticModelCatalog(platform)` 첫 pair다.
```js
test('composite install leaves no standalone profiles on either home', ...)  // AC-M01
  // 단독 codex, claude 설치 → 통합 install 실행 → code 0
  // assert.deepEqual(agents('claude'), ['arc-routing-planner.md','arc-routing-reviewer.md'])
  // assert.deepEqual(agents('codex'), ['arc-routing-implementer.toml','arc-routing-qa.toml','arc-routing-scouter.toml'])
test('failed composite publication restores standalone profiles byte for byte', ...)  // AC-M02
  // ctx.hooks = {fault: e => { if (e.phase === 'before-publish' && e.path.endsWith('arc-role-platform-routing.json')) throw Error('fault'); }}
  // 실행 전후로 두 홈 agents/의 파일명→sha256 맵이 같고, 활성 설정이 없음
test('unowned standalone profile is kept and reported as residual', ...)  // AC-M03, RF2
  // claude agents/arc-qa.md를 contract 없는 사용자 파일로, codex agents/arc-qa.toml을 외부 파일의 symlink로 바꿈
  // 게시 code 0, 두 파일 바이트와 링크 유지, result.messages에 각 'Residual path: <path>'
test('active bridge lease blocks publication and deactivation without changes', ...)  // AC-M11
  // management-operations.test.mjs:56-57 lease 사용. 게시와 switch 모두 messages에 'Active bridge dispatches: active-1', 파일 맵 불변
test('mixed legacy state is cleaned by one composite publication', ...)  // AC-M12
  // 통합 게시 후 단독 profile 5+5를 패키지 렌더 결과로 다시 써서 관측 상태 재현 → 다시 게시 → 단독 profile 없음
```

- [ ] **Step 6: 실행해서 실패 확인** (Step 2 명령, FAIL: 단독 profile이 남음)

- [ ] **Step 7: 게시 경로 구현**
  - `buildInstallPlan`의 `profiles` 옵션과 `renderStandaloneProfiles`를 추가한다. `renderModelAssets`를 감싸서 이미 확장된 profile Map을 돌려준다.
  - `prepareCompositeFiles`와 `publishCompositeFiles`에 단독 profile 제거 스펙을 넣는다.
  - `prepareCompositeOperation`(install)에서 현재 모드에 따라 `profiles` 값을 고른다.
  - 결과 `messages`에 residual 줄을 넣는다(기존 `'Residual path: '` 형식).

- [ ] **Step 8: 실행해서 통과 확인** (Step 2 명령, PASS)

- [ ] **Step 9: 상태·업그레이드·preset·unverified 실패 테스트 작성**
```js
test('status and installed state accept composite homes without standalone profiles', ...)  // AC-M04
  // 통합 게시 후 collectStatus → 두 플랫폼 state 'installed'. collectInstalledState → targets 2, mode 'composite'
  // 혼재 상태(단독 profile 재기록)에서도 'installed'
test('unverified composite state refuses publish, deactivation and switch', ...)  // AC-M05
  // marker configHash 변조 → 통합 install, switch 모두 error.message === 'Claude & Codex configuration cannot be verified.'. 파일 맵 불변
test('composite upgrade does not recreate standalone profiles', ...)  // AC-M06
  // buildUpgradePlans({payload, state: collectInstalledState(...), safeFs}) → 어느 plan의 managedPaths에도 agents/arc-<role> 없음
  // installTargets 실행 후 agents/에 단독 profile 없음. 혼재 fixture에서는 기존 단독 파일 바이트 불변
test('composite Change Models renders from the payload and keeps each platform language', ...)  // AC-M07, RF4
  // 통합 게시(Claude settings.toml language ko) → prepareCompositeOperation({kind:'preset', config: 새 revision}) 성공
  // claude arc-routing-planner.md에 KR 언어 정책 문자열(renderLanguagePolicy 결과) 포함
```

- [ ] **Step 10: 실행해서 실패 확인**

- [ ] **Step 11: 구현** — `status.mjs`, `upgrade-state.mjs`(`mode` 반환), `upgrade.mjs`, `operations.mjs` 통합 preset 재료 교체, 모드 검사.

- [ ] **Step 12: 실행해서 통과 확인**

- [ ] **Step 13: 전환·제거·가드 실패 테스트 작성**
```js
test('switch to Codex restores both standalone installs then applies the Codex operation', ...)  // AC-M08
  // 통합 게시 → prepareOperation({kind:'install', target:'codex', preset:'balanced', language:'en', switchFromComposite:true})
  // (I1 이후에는 roles 인자로 바뀜) → kind 'switch' → execute → messages[0] 'Claude & Codex turned off.'
  // 활성 설정·marker·arc-routing-* 없음. 두 홈에 단독 profile 5개, collectStatus 모두 'installed'
test('failure after deactivation leaves both platforms standalone', ...)  // AC-M09
  // ctx.hooks.fault로 2단계(codex skills/arc 게시)에서 throw → code 1, messages[0] 'Claude & Codex turned off.'
  // 두 플랫폼 'installed'(단독), 통합 파일 없음
test('uninstall one platform during composite leaves the other standalone', ...)  // AC-M10
  // switch + uninstall codex → codex 홈 skills/arc·단독 profile 없음, claude 단독 profile 5개 'installed'
  // 별도 케이스: target 'all'은 switch 없이 현행대로 모두 제거
test('single-platform operation is refused while Claude & Codex is active without the switch flag', ...)  // RF1
  // install/preset/uninstall × codex/claude → error.message === 'Claude & Codex is active; confirm the switch first'
test('deactivation writes standalone profiles only where skills/arc exists', ...)  // RF3
  // 통합 후 claude skills/arc 삭제 → switch codex → codex 단독 5개, claude agents/에 단독 profile 없음, code 0
```
`tests/node/tui-setup.test.mjs`에도 다음을 추가한다.
```js
test('composite mode shows Switch to Codex before the Codex flow and Back prepares nothing', ...)
  // loadInstallMode: () => 'composite'. 'Install / Update' → 0(Codex). 'Switch to Codex' 메뉴 info[0] === 'Claude & Codex will be turned off.'
  // 선택지 Back → 플랫폼 목록 재표시, prepare 호출 0회
test('Continue on Switch to Codex prepares with switchFromComposite', ...)
  // Continue → 이후 Apply → prepare 인자 switchFromComposite === true
```
`tests/node/tui-app.test.mjs`에도 추가한다.
```js
test('uninstall confirmation during composite adds the turn-off line and switch flag', ...)
```

- [ ] **Step 14: 실행해서 실패 확인**
  - Run: `node --test --test-timeout=120000 tests/node/install-mode.test.mjs tests/node/tui-setup.test.mjs tests/node/tui-app.test.mjs`
  - Expected: FAIL

- [ ] **Step 15: 구현** — `prepareCompositeDeactivation`, `publishCompositeDeactivation`, `currentInstallMode`, switch 준비·실행, `setup.mjs` U-03, `app.mjs` Uninstall 확인 줄과 `loadInstallMode` 전달.

- [ ] **Step 16: 실행해서 통과 확인** (Step 14 명령, PASS)

- [ ] **Step 17: 기존 테스트 조정과 회귀 확인**
  - `role-routing-install.test.mjs:97-106`의 "standard arc-* profiles are unchanged"는 렌더 결과의 revision tag 부재만 검사하도록 의미를 유지한다.
  - Run: `node --test --test-timeout=120000 tests/node/role-routing-install.test.mjs tests/node/management-operations.test.mjs tests/node/management-status.test.mjs tests/node/upgrade-harness.test.mjs tests/node/transaction.test.mjs tests/node/transaction-drift.test.mjs tests/node/transaction-readonly.test.mjs tests/node/install.test.mjs`
  - Expected: PASS(기준선 실패는 제외)

- [ ] **Step 18: 문서 갱신과 MANIFEST 재생성**
  - `README.md`: 통합 모드에서는 단독 profile이 없다는 점, 단독 선택 시 자동 전환(U-03)을 한두 문장으로 적는다.
  - `docs/harness-operation.md`: spec §6.4~§6.7 요약을 모드 전환 하위 절로 추가한다.
  - Run: `node scripts/update-manifest.mjs && npm run check:manifest && npm run check:role-policy`
  - Expected: 모두 통과

- [ ] **Step 19: 기준선 비교**
  - Run: `node --test --test-timeout=120000 tests/node/*.test.mjs`
  - Expected: 기준선 대비 새 실패 없음

**수용 기준:** AC-M01~AC-M12, U-03, U-14(해제 줄과 플래그). Review Focus 1~4 테스트 통과.

**수락 전 검증:**
- Implementer: RED/GREEN 증거, 변경 파일 목록, Step 17~19 결과.
- Fresh QA(필수, 고위험):
  - `tests/node/install-mode.test.mjs` 전체와 Step 17 파일을 재실행한다.
  - 임시 HOME에서 TUI 없이 운영 API로 다음 순서를 수동 재현한다. 단독 codex+claude → 통합 → Codex 전환 → 다시 통합 → Uninstall Claude.
  - 각 단계 뒤 두 홈 `agents/` 목록과 sha256을 증거로 남긴다.
  - fault 롤백 1회 재현.
- `npm run check:manifest`, `npm run check:role-policy`.

**Hold 조건:**
- `inspectPath` snapshot으로 symlink를 판별할 수 없으면 Orchestrator에 반환한다(native API 변경이 필요할 수 있음).
- `lib/runtime/` 변경이 필요해지면 반환한다.
- 기준선 대비 새 실패가 있고 원인을 분류할 수 없으면 해당 부분만 hold한다.

**Commit (수락 후 Orchestrator):** `fix(install): 통합 모드에서 단독 profile 제거와 양방향 전환`

---

### Task I3: 지시문 보강 (Q1 지시문)

**목표와 범위:** spec §7. 두 `coordination.md`에 `### Execution mode` 절을 넣고, 단독 이름 표기를 단독 모드로 한정한다. `SKILL.md` Role gate에서 단독 이름을 제거한다.

**선행 작업:** I2 수락. 문구가 I2의 marker 판정과 일치해야 한다. MANIFEST는 I2 다음 순서로 수정한다.

**Files:**
- Modify: `claude/skill/SKILL.md:12`, `codex/skill/SKILL.md:12`
- Modify: `claude/skill/references/coordination.md:18-22`, `codex/skill/references/coordination.md:18-22`
- 조건부 Modify: `claude|codex/skill/references/handoff.md`, `planning.md` — 단독 native profile을 호출 대상으로 조건 없이 지칭하는 곳만
- Modify tests:
  - `tests/node/composite-instructions.test.mjs` (테스트 추가)
  - `tests/node/fixtures/instruction-contracts.json` (두 플랫폼의 Role gate와 Ownership contract text. `protected`에 수정 파일이 있으면 해당 해시)
  - `tests/test_claude_payload.py:533`, `tests/test_arc_policy.py:1336` (편집한 문장을 검사하는 경우만)
- Regenerate: `MANIFEST.sha256`

**Interfaces:** Consumes는 I2의 marker 파일명 `arc-role-platform-routing.prepared.json`이다(변경 없음). Produces 없음.

**결정 사항:**
- 넣는 문구는 spec §7 원문 그대로다. 위치는 "Orchestrator is depth 1 …" 단락 바로 뒤, 단독 이름 줄 앞이다.
```
### Execution mode

Before the first specialist creation or assignment, check whether `arc-role-platform-routing.prepared.json` exists in the platform home that contains this skill (`../../arc-role-platform-routing.prepared.json` relative to this skill directory). If it exists, ARC runs in `Claude & Codex` mode: follow [Composite Platform Role Dispatch](#composite-platform-role-dispatch) for every role, starting with `routing-status`, and use only the profile or bridge it returns. Never invoke `arc-<role>` or `arc_<role>` names in this mode, even if they are listed. Otherwise use the standalone names below.
```
- 이름 줄 교체
  - Claude: `Claude native names:` → `Standalone native names:`
  - Codex: `Aliases:` → `Standalone aliases:`
- Role gate 교체: `Only Planner (`arc-planner`) authors` → `Only Planner authors`. Codex 판의 `(`arc_planner`)`도 같은 방식으로 제거한다.
- 고치지 않는 것: 라우팅 명령의 역할 식별자(`role` (`arc_scouter` …)), `models.toml` 키 설명(`coordination.md:95`), 생성 구간. 이것들은 profile 호출 이름이 아니다.

**Steps:**

- [ ] **Step 1: 실패 테스트 작성** (`tests/node/composite-instructions.test.mjs`)
```js
test('execution mode precedes standalone names and forbids standalone names in composite mode', async () => {
  const paragraphs = {};
  for (const harness of Object.keys(harnesses)) {
    const text = await read(harness, 'coordination.md');
    const mode = text.indexOf('### Execution mode'), standalone = text.indexOf(harness === 'claude' ? 'Standalone native names:' : 'Standalone aliases:');
    const composite = text.indexOf('Composite native names'), adapter = text.indexOf('<a id="instruction-and-execution-adapter"');
    assert.ok(mode > 0 && mode < standalone && standalone < composite && composite < adapter, harness);
    assert.ok(text.includes('Never invoke `arc-<role>` or `arc_<role>` names in this mode, even if they are listed.'), harness);
    assert.ok(text.includes('`../../arc-role-platform-routing.prepared.json`'), harness);
    assert.doesNotMatch(text, /Claude native names:|\nAliases:/);
    paragraphs[harness] = text.slice(mode, standalone);
    const skill = await readFile(new URL(`../../${harness}/skill/SKILL.md`, import.meta.url), 'utf8');
    assert.doesNotMatch(skill.split('\n').find(l => l.startsWith('**Role gate:**')), /`arc[-_]planner`/);
  }
  assert.equal(paragraphs.claude, paragraphs.codex);
});
```

- [ ] **Step 2: 실행해서 실패 확인**
  - Run: `node --test --test-timeout=120000 tests/node/composite-instructions.test.mjs`
  - Expected: FAIL

- [ ] **Step 3: 네 문서 수정.** 조건부 대상은 다음 명령 결과를 보고 판단해 고친다. 고친 곳과 고치지 않은 이유를 보고에 적는다.
  - Run: `rg -n "arc-(scouter|planner|implementer|qa|reviewer)\b|arc_(scouter|planner|implementer|qa|reviewer)\b" claude/skill codex/skill --glob '*.md'`

- [ ] **Step 4: 실행해서 통과 확인** (Step 2 명령, PASS)

- [ ] **Step 5: 계약 fixture와 Python needle 갱신 후 확인**
  - Run: `node --test --test-timeout=120000 tests/node/instruction-layout.test.mjs tests/node/agent-fragments.test.mjs tests/node/legacy-parity.test.mjs tests/node/parity-check.test.mjs tests/node/package-references.test.mjs tests/node/instruction-language.test.mjs`
  - Run: `python3 -m unittest tests/test_claude_payload.py tests/test_arc_policy.py`
  - Expected: 기준선 대비 새 실패 없음

- [ ] **Step 6: MANIFEST 재생성과 검사**
  - Run: `node scripts/update-manifest.mjs && npm run check:manifest && npm run check:role-policy`
  - Expected: 통과

**수용 기준:** AC-I01, AC-I02, AC-I03.

**수락 전 검증:** Step 2·5·6 명령의 출력이 증거다. 별도 QA는 필요 없다(문서 변경이며 집중 검사로 충분).

**Hold 조건:** `test_claude_payload.py:533`의 needle(`ONLY by Planner (`arc-planner`)`)이 기준선에서 이미 실패하면 기준선 실패로 분류해 보고한다. 이번 task에서 고치지 않는다.

**Commit (수락 후 Orchestrator):** `docs(skill): 통합 모드 판별을 역할 호출 전 첫 단계로 명시`

---

### Task I1: 프리셋 제거와 역할 편집기 직행 (Q2, Q4, U-04~U-09, U-16)

**목표와 범위:**
- spec §8, §9, 그리고 §10의 U-04~U-09, U-15(편집기 내부 Back), U-16을 구현한다.
- `models.toml`을 v3로 바꾸고 v1/v2를 변환한다(JS·Python). 설치, 모델 변경, 업그레이드가 `roles`를 쓰게 한다.
- TUI는 플랫폼을 고르면 곧바로 편집기로 간다. 통합 편집기에서 역할별 플랫폼을 선택하고, 통합 Install에 Settings를 둔다.

**선행 작업:** I2, I3 수락. `setup.mjs`, `app.mjs`, `operations.mjs`, `plan.mjs`, `upgrade.mjs`를 I2 다음 순서로 수정한다. I2의 TUI 테스트 3개는 이름 그대로 유지하고 통과시킨다.

**Files:**
- Modify: `lib/models/config.mjs:31-67`, `lib/models/index.mjs`
- Modify: `claude/skill/models.toml`, `codex/skill/models.toml`
- Modify: `claude/skill/scripts/model_config.py`, `codex/skill/scripts/model_config.py`, 두 `apply-models.py`(필요한 곳)
- Modify: `lib/installer/plan.mjs:21-25,51-72`, `lib/installer/preset.mjs:7-17`, `lib/installer/upgrade.mjs:12`
- Modify: `lib/management/operations.mjs:30-43,54-75`
- Modify: `lib/tui/setup.mjs`(전면 재구성), `lib/tui/custom-preset.mjs:133-195`, `lib/tui/app.mjs:6,69`
- Modify tests: Scouter R2 목록
  - 직접: `models`, `preset`, `preset-cli`, `tui-setup`, `tui-app`, `tui-app-pty`, `profile-render`, `role-routing-install`, `install-mode`
  - Python: `tests/test_codex_models.py`, `tests/test_claude_payload.py`
  - 간접: `all-targets`, `cli-dry-run`, `cli`, `consumer`, `install`, `legacy-parity`, `live-upstream.mjs`, `management-operations`, `management-status`, `npm-uninstall-consumer`, `npm-upgrade-consumer`, `plan`, `role-fixtures.mjs`, `superpowers-lifecycle`, `transaction-drift`, `transaction-readonly`, `transaction`, `tui-package-consumer`, `upgrade-harness`, `tests/installer-parity.json`
- Modify: `README.md:31,46`, `docs/harness-operation.md:22,50,190`
- Regenerate: `MANIFEST.sha256`

**Interfaces:**
- Consumes (I2): `renderStandaloneProfiles`, `buildInstallPlan({profiles})`, `currentInstallMode`, `runSetup({loadInstallMode})`, `prepareOperation({switchFromComposite})`
- Produces:
```js
// lib/models/config.mjs   (제거: PRESETS, applyPreset, applyCustomRoles)
export const ROLES
export function validateModelConfig(config) /*: {platform, version:3, roles}*/
export function loadModelConfig(text, platform) /*: {platform, version:3, roles}*/   // v1/v2/v3 수용
export function readModelFileVersion(text) /*: 1|2|3*/
export function serializeModelConfig(config) /*: string*/   // `version = 3` + [roles.<role>]
export function withRoles(config, roles) /*: {platform, version:3, roles}*/
export function resolveModelSettings(config) /*: {platform, roles}*/
// lib/models/index.mjs: loadModelConfig, withRoles, serializeModelConfig, resolveModelSettings, ModelValidationError, renderProfiles
// lib/installer
buildInstallPlan({payload, target, roles, verifiedCatalog, modelConfig, language, limits, skipGlobal, safeFs, concurrentExplicit, limitsPreview, languagePreview, profiles})
  // 우선순위: roles(카탈로그 검증) > modelConfig > 패키지 기본값
buildPresetPlan({target, roles, safeFs, verifiedCatalog})
  // roles가 다르거나 설치 파일 version < 3이면 models.toml을 v3로 다시 쓴다
// lib/management/operations.mjs
prepareOperation(context, {kind, target, roles, verifiedCatalog, language, maxTotalSubagents, maxConcurrentSubagents, skipGlobal, concurrentSelected, switchFromComposite})
prepareCompositeOperation(context, {kind, config, settings /* install만: {language, maxTotalSubagents, maxConcurrentSubagents, skipGlobal, concurrentSelected} */})
// Python (두 플랫폼)
load_settings(config_path) -> dict[str, RoleSettings]        # v1/v2/v3
validate_config(config, path) -> {"version": 3, "roles": {...}}
serialize_settings(config) -> bytes                            # v3
// lib/tui/custom-preset.mjs   (제거: editCustomPreset, editCompositeCustomPreset)
export async function selectCatalogPair({ui, catalog, current, roleName}) /*: {model,effort}|null*/  // 제목 `Model — X`, `Effort — X`
export async function editPlatformRoles({ui, title, platform, initialRoles, catalog, settingsRow}) /*: {action:'apply'|'settings', roles}|null*/
export async function editCompositeRoles({ui, initialRoles, catalogs, settingsRow}) /*: {action:'apply'|'settings', roles}|null*/
// lib/tui/setup.mjs   (제거: loadPresetPreviewConfig, presetRoleRows, presets/presetLabel)
export function initialSettings(statuses) /*: {codex:{language,maxTotalSubagents,maxConcurrentSubagents,skipGlobal}, claude:{…}}*/
export function loadRoleDefaults({context, statuses, target}) /*: roles*/   // 설치된 활성 값, 없으면 패키지 기본값
export function setupOptions(draft, target, verifiedCatalog, kind) /*: {target, roles, verifiedCatalog, language, …}*/
runSetup({ui, statuses, draft, kind, prepare, loadRoleDefaults, loadCatalog, loadCompositeConfig, loadInstallMode})
```

**결정 사항:**
- **v1/v2 변환:** 기존 검증을 모두 통과한 뒤 활성 값을 뽑는다. `custom`이면 `custom` 값, 그 밖에는 `roles.<role>.<preset>` 값이다.
- **v3 검증:** 최상위는 정확히 `version`과 `roles`다. 역할은 다섯 개이고, 각 역할은 정확히 `model`과 effort 필드를 가진다.
- **패키지 Codex 기본값** (현행 balanced 값)

| 역할 | model | effort |
|---|---|---|
| scouter | `gpt-6-luna` | `high` |
| planner | `gpt-6.1-sol` | `xhigh` |
| implementer | `gpt-6.1-sol` | `medium` |
| qa | `gpt-6.1-terra` | `high` |
| reviewer | `gpt-6.1-sol` | `high` |

- **패키지 Claude 기본값:** Step 1 전에 현행 `claude/skill/models.toml`의 `[roles.<role>.balanced]` 값을 테스트 literal로 옮겨 적는다.
- **편집기 초깃값:** spec §9.2 표를 따른다. 세션 draft(`draft.codex.roles`, `draft.claude.roles`, `draft.composite`)가 먼저다.
- **편집기 행**
  - 단독: 역할 다섯 개, `Settings`(Install에서만), `Apply`, `Back`.
  - 통합: 역할 다섯 개, `Settings`(Install에서만), `Apply`, `Back`.
  - 다이어그램은 현행 `presetPreviewRows`를 쓴다.
- **역할 선택 흐름**
  - 단독: `Model — <Role>` → `Effort — <Role>`.
  - 통합: `Platform — <Role>`(`Codex`, `Claude`) → Model → Effort.
- **Back 목적지 (U-15 편집기 내부)**
  - Model의 `Back`: 통합이면 Platform, 단독이면 편집기.
  - Effort의 `Back`: Model.
- **Settings 행과 하위 화면 (U-05, U-06, U-16)**
  - 메뉴 제목: `Settings — Codex`, `Settings — Claude`, `Settings — Claude & Codex`.
  - 행: `Language: EN|KR`, `Total subagents: <n>`, `Concurrent subagents: <n>`, `Global config: On|Off`(Enter로 전환), `Back`.
  - 하위 제목: `Language`(행 `EN`, `KR`), `Total subagents`, `Concurrent subagents`.
  - 잘못된 입력: 페이지 `Invalid limit`, 본문 `Enter a positive whole number.`
- **통합 Settings 초깃값:** Codex 설치 값 → Claude 설치 값 → `EN`, `100`, `5`, `On` 순이다. 값은 두 install plan에 같이 적용한다(`operations.mjs:65`의 `skipGlobal:status.state!=='absent'`를 대체).
- **오류 페이지 (U-09)**
  - `Catalog unavailable` / `Codex model catalog is missing or invalid.`(Claude도 같은 형식). 이후 플랫폼 목록으로 돌아간다.
  - `Unavailable selection` / `Choose an available model for roles marked !.` 이후 편집기에 머문다.
  - `Claude & Codex unavailable` / 오류 메시지.
- **`Apply`:** 카탈로그 검증 후 곧바로 `prepare`한다. 확인 화면은 없다.

**Steps:**

- [ ] **Step 1: 모델 계층 실패 테스트 작성** (`tests/node/models.test.mjs`)
```js
test('loadModelConfig converts v1 and v2 active presets and custom to v3 roles', ...)   // AC-P02
  // codex v1 원본 문자열(현행 파일 내용) × preset economy/balanced/smart, v2 custom
  // → loadModelConfig(...).roles.arc_planner 가 해당 표 값과 같음. version === 3
test('serializeModelConfig writes version 3 without preset', ...)   // AC-P01
  // 출력에 /^version = 3$/m 있음, /preset/ 없음, [roles.arc_qa] 테이블 다섯 개, 왕복 load 결과 동일
test('package defaults equal the former balanced values and exist in the static catalog', ...)   // AC-P03
  // 두 플랫폼 패키지 models.toml의 roles가 literal 표와 같음
  // 모든 (model, effort)가 loadStaticModelCatalog(platform).catalog.pairs에 있음
test('PRESETS and preset helpers are gone', ...)   // AC-P05 일부
  // import * as m from config.mjs → m.PRESETS, m.applyPreset, m.applyCustomRoles 모두 undefined
```

- [ ] **Step 2: 실행해서 실패 확인**
  - Run: `node --test --test-timeout=120000 tests/node/models.test.mjs`
  - Expected: FAIL

- [ ] **Step 3: `config.mjs`, `index.mjs`, 두 패키지 `models.toml`을 v3로 구현**

- [ ] **Step 4: 실행해서 통과 확인** (Step 2 명령, PASS)

- [ ] **Step 5: Python 실패 테스트 작성** (`tests/test_codex_models.py`, 해당 시 `tests/test_claude_payload.py`)
```python
def test_v3_round_trip(self): ...                      # serialize_settings → 'version = 3', preset 없음, load_settings 결과 동일
def test_legacy_v1_v2_convert_to_active_roles(self): ...  # economy/balanced/smart/custom 각각 활성 값
```

- [ ] **Step 6: 실행해서 실패 확인**
  - Run: `python3 -m unittest tests/test_codex_models.py tests/test_claude_payload.py`
  - Expected: FAIL

- [ ] **Step 7: 두 `model_config.py`와 `apply-models.py` 구현.** v3 기준으로 오류 문구를 갱신한다.

- [ ] **Step 8: 실행해서 통과 확인** (Step 6 명령, PASS)

- [ ] **Step 9: 설치기와 운영 계층 실패 테스트 작성**
```js
// tests/node/preset.test.mjs
test('Change Models rewrites a v2 file as v3 even when roles are unchanged', ...)
// tests/node/upgrade-harness.test.mjs
test('upgrade keeps legacy active values that are missing from the catalog', ...)   // RF5
  // 설치된 v1 파일의 balanced 값을 카탈로그에 없는 model로 바꿈 → 업그레이드 → models.toml v3 값과 profile model이 그 값 그대로
test('upgrade keeps the installed v1 balanced values', ...)   // AC-P02 후반
// tests/node/install-mode.test.mjs
test('all roles on one platform publish', ...)   // AC-R03: 다섯 역할 모두 claude → code 0, codex agents/에 ARC profile 없음
```

- [ ] **Step 10: 실행해서 실패 확인**
  - Run: `node --test --test-timeout=120000 tests/node/preset.test.mjs tests/node/upgrade-harness.test.mjs tests/node/install-mode.test.mjs`
  - Expected: FAIL

- [ ] **Step 11: 구현** — `plan.mjs`, `preset.mjs`, `upgrade.mjs`, `operations.mjs`의 `roles`·`settings` 인자. I2 테스트 helper의 `preset:'balanced'` 호출은 `roles`로 바꾼다.

- [ ] **Step 12: 실행해서 통과 확인** (Step 10 명령, PASS)

- [ ] **Step 13: TUI 실패 테스트 작성** (`tests/node/tui-setup.test.mjs`)
  - 현행 테스트는 `title`로 메뉴를 고르는 스크립트형 `ui`를 쓴다. 새 테스트도 같은 방식이다.
  - 프리셋 관련 기존 테스트(`:15-110`, `:161-243`, `:323-378` 등)는 삭제하거나 아래 테스트로 대체한다.
```js
test('Install Codex opens the role editor right after the platform and Apply prepares once', ...)  // AC-R01, U-04
  // 'Install / Update'→0, 다음 메뉴 제목 'Codex', 행에 'Settings','Apply' → Apply → prepare 1회, roles 포함, 확인 메뉴 없음
test('Change Models editor has no Settings row', ...)
test('Settings row opens Settings — Codex with Language, limits and Global config', ...)  // U-05, U-06
  // 행 ['Language: EN','Total subagents: 100','Concurrent subagents: 5','Global config: On'] + Back
  // 하위 제목 'Language','Total subagents','Concurrent subagents', 잘못된 입력 페이지 본문 'Enter a positive whole number.'
test('composite editor lets every role pick Codex or Claude and lists only that catalog', ...)  // AC-R02, U-07, U-08
  // 각 역할 → 'Platform — <Role>' → 'Model — <Role>' 행이 선택 플랫폼 카탈로그 모델과 같음 → 'Effort — <Role>'
test('Back from Model returns to Platform in composite and to the editor in single mode', ...)  // U-15
test('editor initial values follow the precedence table', ...)  // AC-R04: draft > 설치 활성 값 > 패키지 기본값, 통합 기존 설정 > 기본 매핑
test('missing pair blocks Apply with Unavailable selection', ...)  // AC-R05, RF5, U-09
test('catalog failure returns to the platform list after Catalog unavailable', ...)  // AC-R05, U-09
  // 페이지 rows 정확히 ['Codex model catalog is missing or invalid.']
test('composite Install Settings apply to both plans', ...)  // AC-R06, U-16
  // 'Settings — Claude & Codex'에서 KR, 7, 3, Off → prepare 인자 settings 값 일치
  // management 쪽: 두 plan.language==='ko', skipGlobal===true
test('no preset strings remain in the TUI', ...)  // AC-P05
  // lib/tui/*.mjs 원문에 /Economy|Balanced|Smart|Custom preset|Performance preset|Preset:/ 없음
```

- [ ] **Step 14: 실행해서 실패 확인**
  - Run: `node --test --test-timeout=120000 tests/node/tui-setup.test.mjs tests/node/tui-app.test.mjs`
  - Expected: FAIL

- [ ] **Step 15: 구현** — `custom-preset.mjs` 편집기 두 개와 `selectCatalogPair` 제목, `setup.mjs` 재구성(I2의 U-03 유지), `app.mjs` loader 교체(`loadRoleDefaults`).

- [ ] **Step 16: 실행해서 통과 확인** (Step 14 명령 + `tests/node/tui-app-pty.test.mjs`, PASS)

- [ ] **Step 17: 간접 테스트·fixture 정리**
  - Files 목록의 간접 테스트에서 preset 인자와 문자열을 `roles` 기준으로 바꾼다.
  - `tests/installer-parity.json`은 생성 스크립트가 있으면 스크립트로 다시 만든다.
  - Run: `node --test --test-timeout=120000 tests/node/*.test.mjs`
  - Expected: 기준선 대비 새 실패 없음

- [ ] **Step 18: 문서 갱신과 MANIFEST 재생성**
  - `README.md:31,46`: `Change Models`, 역할별 설정.
  - `docs/harness-operation.md:22`: v3 형식.
  - `docs/harness-operation.md:50`: 편집기 직행 흐름. 홈 메뉴 이름은 I4에서 고친다.
  - `docs/harness-operation.md:190`: v3 수동 편집.
  - Run: `node scripts/update-manifest.mjs && npm run check:manifest && npm run check:role-policy`
  - Run: `python3 -m unittest tests/test_codex_models.py tests/test_claude_payload.py tests/test_arc_policy.py`
  - Expected: 통과(기준선 실패 제외)

**수용 기준:** AC-P01~AC-P05, AC-R01~AC-R06, U-04~U-09, U-15(편집기 내부 Back), U-16. I2 테스트 회귀 없음.

**수락 전 검증:**
- Implementer: 단계별 RED/GREEN 증거, 삭제·대체한 기존 테스트 목록과 사유.
- Fresh QA(필수):
  - Step 17 전체 실행과 Python 테스트 재실행.
  - 임시 HOME에서 v1 `preset="smart"` 설치본을 만든다. 업그레이드 → Change Models(값 변경 없이 Apply) 뒤 v3 파일과 profile model/effort가 smart 값과 같은지 확인한다.
  - PTY 테스트 결과로 U-04~U-08 화면 문구를 대조한다.

**Hold 조건:**
- 이전 balanced 값 중 정적 카탈로그에 없는 값이 있으면 AC-P03과 충돌한다. 즉시 Orchestrator에 반환한다.
- `tests/installer-parity.json`이 생성물인데 생성 방법을 찾지 못하면 그 fixture 부분만 hold한다.

**Commit (수락 후 Orchestrator):** `feat(models): 프리셋 제거와 역할 편집기 직행`

---

### Task I4: 나머지 TUI 문구와 흐름 정리 (Q7)

**목표와 범위:** spec §10의 U-01, U-02, U-10, U-11, U-12, U-13, U-14(나머지 문구), U-15(Esc 규칙과 `escapeBack` 제거).

**선행 작업:** I1 수락. `app.mjs`, `operations.mjs`, `README.md`, `docs/harness-operation.md`, `MANIFEST.sha256`을 I1 다음 순서로 수정한다. `composite-instructions.test.mjs`는 I3 다음이다.

**Files:**
- Modify: `lib/tui/app.mjs:9,14,26,38,41-44,56-63,66,70`
- Modify: `lib/management/operations.mjs:88`
- Modify tests: `tests/node/tui-app.test.mjs`, `tests/node/tui-app-pty.test.mjs`, `tests/node/composite-instructions.test.mjs:74`
- Modify: `README.md:31`, `docs/harness-operation.md:50`
- Regenerate: `MANIFEST.sha256`

**Interfaces:** Consumes는 I2의 `currentInstallMode(context)`다. Produces 없음.

**결정 사항 (원문):**
- **홈 (U-01):** `['Install / Update','Change Models','Check Version','Uninstall','Exit']`
- **상태 줄 (U-02):** `currentInstallMode === 'composite'`이고 두 상태가 `Available`이면 `Claude & Codex: Available`이다. 그 밖에는 현행과 같다.
- **Working (U-10):** busy 화면 `rows: []`
- **Result (U-11)**
  - `Exit code: <n>`은 `n !== 0`일 때만 넣는다.
  - 통합 성공 messages는 `['Claude & Codex activated.', 'After upgrading ARC, run Install / Update again.', ...residual]`이다.
  - `prepared.summary`와 `support.reason`은 바꾸지 않는다.
- **Check Version (U-12)**
  - `canUpgrade`: info `[\`${currentVersion} → ${latestVersion}\`]`, 행 `Upgrade`, `Back`.
  - `latestVersion === currentVersion`: info `[\`Up to date (${currentVersion})\`]`, 행 `Back`.
  - 그 밖: 현행 줄(`Current version: …`, `Latest version: …`, 오류).
- **Uninstall (U-13)**
  - 메뉴: `ui.menu('Uninstall', ['Codex','Claude','Everything (incl. CLI)'], {backRow:true})`
  - 확인: `ui.menu('Uninstall', ['Remove'], {backRow:true, selected:1, info:[...]})`
- **확인 안내 (U-14):** `Remove ARC from Codex?` / `Remove ARC from Claude?` / `Remove ARC from Codex and Claude, and the arc CLI?`. 통합 모드에서 단일 플랫폼이면 I2에서 넣은 둘째 줄을 유지한다. `Back`은 Uninstall 메뉴로 돌아간다.
- **키 규칙 (U-15):** `menu()`의 `escapeBack` 옵션과 그 사용처를 제거한다. Esc는 홈, 홈에서는 종료다.

**Steps:**

- [ ] **Step 1: 실패 테스트 작성** (`tests/node/tui-app.test.mjs`)
```js
test('home lists Change Models', ...)  // U-01
test('home status collapses to Claude & Codex: Available in composite mode', ...)  // U-02 (그 밖 모드에서는 현행 문자열)
test('Working screen has no body text', ...)  // U-10
test('result rows hide a zero exit code and show nonzero ones', ...)  // U-11: resultRows({code:0,...})에 'Exit code' 없음, code 1이면 'Exit code: 1'
test('composite result messages use the new copy', ...)  // U-11 (executeCompositeOperation 성공 결과)
test('Check Version shows current → latest, Up to date, or the unavailable lines', ...)  // U-12, 세 경우
test('Uninstall is one menu with Codex, Claude and Everything (incl. CLI)', ...)  // U-13
test('Uninstall confirmation uses Remove and the new questions, Back returns to Uninstall', ...)  // U-14
test('Esc on any confirmation returns home', ...)  // U-15: Everything 확인에서 escape → 홈 메뉴 재표시
```
`tests/node/composite-instructions.test.mjs:74`은 `assert.ok(!operations.includes('Role execution: per-role status via routing-status.'))`와 `assert.ok(operations.includes('Claude & Codex activated.'))`로 바꾼다.

- [ ] **Step 2: 실행해서 실패 확인**
  - Run: `node --test --test-timeout=120000 tests/node/tui-app.test.mjs tests/node/composite-instructions.test.mjs`
  - Expected: FAIL

- [ ] **Step 3: `app.mjs`와 `operations.mjs:88` 구현**

- [ ] **Step 4: 실행해서 통과 확인** (Step 2 명령 + `tests/node/tui-app-pty.test.mjs`. PTY 기대 문자열은 Check Version·Uninstall 경로에 맞춰 갱신. PASS)

- [ ] **Step 5: 문서와 MANIFEST**
  - `README.md:31`, `docs/harness-operation.md:50`의 홈 메뉴, Uninstall, Check Version 설명을 갱신한다.
  - Run: `node scripts/update-manifest.mjs && npm run check:manifest`
  - Run: `node --test --test-timeout=120000 tests/node/*.test.mjs`
  - Expected: 기준선 대비 새 실패 없음

**수용 기준:** AC-U01, U02, U10~U15(U-03~U-09와 U-16은 I1·I2에서 수용).

**수락 전 검증:** Step 2·4·5 출력과 PTY 테스트 결과가 증거다. 별도 QA는 집중 검사로 충분하다(저위험 문구·흐름 변경).

**Hold 조건:** `prepareUpdate` 결과에 `currentVersion`, `latestVersion`, `canUpgrade`, `latestError` 중 하나라도 없으면 U-12 부분만 hold하고 반환한다.

**Commit (수락 후 Orchestrator):** `feat(tui): 홈·Check Version·Uninstall 흐름과 문구 정리`

---

## 최종 검증 (모든 task 수락 후)

- **선행 조건:** I2, I3, I1, I4가 모두 수락·커밋되었고 각 task의 필수 QA와 QA 재검사가 끝났다.
- **Orchestrator 기준선 비교:** 다음 세 명령을 실행해 기준선 대비 새 실패가 없음을 확인한다.
  - `node --test --test-timeout=120000 tests/node/*.test.mjs`
  - `python3 -m unittest tests/test_codex_models.py tests/test_claude_payload.py tests/test_arc_policy.py`
  - `npm run check:manifest && npm run check:role-policy`
- **최종 Reviewer 1회:**
  - 대상: 기준 HEAD(문서 커밋)부터 I4 커밋까지의 전체 diff.
  - 중점: spec §6 소유권과 트랜잭션 경계, 모드 판정의 일관성(status·upgrade·preset·uninstall·운영), v1/v2 변환의 값 보존, 지시문 두 플랫폼 동기화, Review Focus 5개 항목.
  - Reviewer 지적은 Implementer → Reviewer로 해결한다. 수정은 Reviewer 재확인까지 미커밋으로 두고, 수락 후 focused follow-up commit 하나로 남긴다.
