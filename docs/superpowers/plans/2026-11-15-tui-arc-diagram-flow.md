# TUI ARC 도식 흐름 및 플랫폼 레지스트리 Phase A 구현 계획

> **실행 방식:** ARC Orchestrator가 작업마다 새 Implementer(Codex 브리지)를 배정하고, 수용 후 작업당 커밋 1개를 만듭니다.

**Goal:** 플랫폼 식별을 이중 레지스트리로 옮기고, composite를 참여 집합 S로 일반화하며, TUI를 "도식 하나에서 역할과 호스트를 고르면 모드가 도출되는" 흐름으로 바꿉니다. 기존 Codex+Claude 설치는 그대로 동작해야 합니다.

**Architecture:** 원천은 runtime 레지스트리 `lib/runtime/platform-registry.mjs`이며, 순수 데이터와 home 해석을 담습니다. 설치기 레지스트리 `lib/platforms/*`는 이를 import해 설치 전용 필드만 더합니다. composite 코드는 `S`, `anchor = min(S, anchorOrder)` 기준으로 동작하고, 기존 v1 경로와 바이트는 유지합니다. TUI는 순수 함수(`deriveInstallPlan`, `diagramRows`)와 화면 루프로 나눕니다.

**Tech Stack:** Node.js ESM(`.mjs`), `node:test`, 기존 safe-fs native, PTY 테스트 헬퍼(`tests/node/helpers/tui-terminal.mjs`)

**Spec:** `docs/superpowers/specs/2026-11-15-tui-arc-diagram-flow-design.md` (설계 기록: `.git/arc/workflows/tui-menu-revamp/approved-design.md`)

## Global Constraints

- `lib/runtime/**`는 `lib/models`, `lib/installer`, `lib/platforms`를 import하지 않습니다.
- `shared/skill/runtime/**`는 손으로 고치지 않고 `node scripts/update-runtime-assets.mjs`로만 동기화합니다.
- 순환 방지 규칙(계획 결정): 아래 모듈은 `lib/platforms/**`를 import하지 않습니다. 작업 2의 테스트가 이를 강제합니다.
  - `lib/models/profiles.mjs`, `lib/models/codex-catalog.mjs`, `lib/models/catalog-anthropic.mjs`
  - `lib/installer/runtime-config.mjs`
  - `lib/platforms/formats/*.mjs`
  - `renderWaitSettings`를 정의한 모듈
  - `lib/models/config.mjs`(개정 2)
- `lib/policy/role-policy.json`은 바꾸지 않습니다. `npm run check:role-policy`는 생성물 변경 없이 통과해야 합니다.
- 기존 composite 경로는 그대로 둡니다: `<CODEX_HOME>/arc-role-platform-routing.json`(v1), `arc-role-platform-routing.prepared.json`, `<CODEX_HOME>/arc-role-platform-routing.lock`, `<CODEX_HOME>/arc-role-dispatch/`
- 레지스트리 값:
  - codex: `displayOrder 1`, `anchorOrder 0`, `label 'Codex'`
  - claude: `displayOrder 0`, `anchorOrder 1`, `label 'Claude'`
  - capability 키 9개(`install`, `standalone`, `compositeRole`, `compositeHost`, `bridge`, `nativeProfile`, `authProbe`, `catalog`, `watch`)의 기본값은 `{state:'off'}`입니다.
- management 문구(정확히 이 문자열):
  - `Mixed (<표시순 라벨 ' + ' 연결>) activated.`
  - `Mixed routing turned off.`
  - `Mixed routing is active; confirm the switch first`
  - `Mixed routing configuration cannot be verified.`
  - `After upgrading ARC, run Install / Update again.`은 그대로 둡니다.
- TUI 문구:
  - `Mixed routing will be turned off.`
  - `Removed from <Label>.`, `Removed ARC and CLI.`, `Removed ARC.`
  - `Upgraded to <version>.`, `Up to date (<v>)`, `<cur> → <latest>`, `<cur> (latest unavailable)`
  - `Remove ARC from <Label>?`, `Remove ARC from all platforms and the arc CLI?`
  - `Dispatch history stays in <old home>/arc-role-dispatch.`
- 바꾸지 않는 것:
  - `*/skill/references/coordination.md`와 `tests/node/fixtures/instruction-contracts.json`(`Claude & Codex` 유지, Q3)
  - `lib/watch/**`
  - management API의 `kind:'preset'`, `skipGlobal`, `switchFromComposite`, `target: codex|claude|all|composite` 의미
- Gemini와 Grok은 등록하지 않으며 UI에도 표시하지 않습니다(P-1).
- 테스트 전용 가짜 플랫폼은 `tests/node/fixtures/platforms/`에만 둡니다. 운영 코드는 이 경로를 import하지 않습니다.
- Implementer와 QA는 Git 상태를 바꾸지 않습니다(stage/commit 금지). 커밋은 수용 후 Orchestrator가 `type(scope): 한국어 설명` 형식으로 만듭니다.

### 표준 마무리 절차 (모든 작업의 마지막 검증 단계, "STD-CLOSE")

1. `lib/runtime/**`를 바꿨다면 `node scripts/update-runtime-assets.mjs`를 실행하고, 이어서 `node scripts/update-runtime-assets.mjs --check`가 `Runtime payload verified`를 내는지 확인합니다.
2. `node scripts/update-manifest.mjs`를 실행한 뒤 `npm run check:manifest`가 통과해야 합니다.
3. `npm test`가 전부 PASS여야 합니다. `composite-live`는 live 환경이 아니면 skip됩니다.
4. `npm run check:role-policy`에서 생성물 변경이 없어야 합니다.
5. `git status --short`에 해당 작업의 Files와 생성물(`MANIFEST.sha256`, `shared/skill/runtime/*`)만 보여야 합니다.

## Review Focus

1. **비기본 `CLAUDE_CONFIG_DIR`.** Claude home 해석이 실패해도 Codex standalone 사용자는 Install / Update를 할 수 있어야 합니다(6.4.8 완화). 테스트는 작업 7과 작업 9에 있습니다.
2. **혼합 → 단일 전환.** composite에서 Hosts를 모두 해제하고 역할을 한 플랫폼으로 모으면 |S|=1입니다. 이때 D1-b 확인 메뉴가 떠야 하며, 확인 없이 적용되면 안 됩니다. 테스트는 작업 12와 작업 15에 있습니다.
3. **카탈로그 실패 범위.** S 밖 플랫폼의 카탈로그 실패는 Apply를 막지 않습니다. S 안이면 `catalog error`로 막습니다. 테스트는 작업 15에 있습니다.
4. **넓은 문자와 긴 모델명.** CJK나 긴 모델명이 있어도 박스 폭 공식과 compact `…` 자르기가 깨지지 않아야 합니다. 테스트는 작업 13에 있습니다.
5. **anchor 이동 중 lock 해제 실패.** 두 lock 경로가 모두 residual로 보고되고 `activation`이 `unknown` 또는 `held` 규칙을 따라야 합니다. 테스트는 작업 10에 있습니다.

---

## 의존성과 실행 순서

**논리 DAG**

| 작업 | 선행 |
|---|---|
| 1 | — |
| 2 | 1 |
| 3 | 2 |
| 4 | 3 |
| 5 | 1 |
| 6 | 1 |
| 7 | 3, 6 |
| 8 | 4, 7 |
| 9 | 8 |
| 10 | 9 |
| 11 | 5, 6 |
| 12 | 2 |
| 13 | 2 |
| 14 | 2 |
| 15 | 12, 13, 14, 9(prepare 옵션 계약) |
| 16 | 15 |
| 17 | 16 |
| 18 | 3, 4, 5, 9, 10, 11, 16, 17 |
| 19 | 10, 17 |

**병렬 가능 여부.** 모든 작업이 `MANIFEST.sha256`(생성물)을 바꾸고, 1, 5, 6, 11은 `shared/skill/runtime/*`도 바꿉니다. 같은 파일을 동시에 고칠 수 없으므로 동시 실행 가능한 작업은 없습니다.

**실행 순서(직렬):** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18 → 19

**hold 범위.** 실패한 작업은 DAG상 후속만 막습니다.

- 11이 실패하면 18만 막고, 12–17은 진행할 수 있습니다.
- 13이 실패하면 15–19를 막고, 10과 11은 계속할 수 있습니다.

**필수 QA(수용 전 fresh QA)**

- 대상: 1, 3, 7, 8, 9, 10, 11, 16, 17
- 나머지는 focused check와 STD-CLOSE 증거를 Orchestrator가 검증합니다.
- Reviewer는 작업마다 두지 않습니다. 전체 수용 후 최종 1회입니다.

---

### Task 1: runtime 플랫폼 레지스트리

**AC:** AC-P1(레지스트리 값, runtime import 제약), AC-P2(golden에 의도된 모듈 추가)

**Files:**
- Create: `lib/runtime/platform-registry.mjs`, `tests/node/platform-registry.test.mjs`, `tests/node/fixtures/platforms/zeta.mjs`(runtime 부분)
- Modify: `lib/runtime/local-cli.mjs`(8–42행: `resolveConfigHome`, `resolveLocalCli`), `lib/runtime/bootstrap.mjs`(`COOPERATIVE_RUNTIME_MODULES` 끝에 `'platform-registry.mjs'` 추가), `lib/installer/runtime-assets.mjs`(`RUNTIME_MODULE_PATHS`에 정렬 위치로 `'lib/runtime/platform-registry.mjs'` 추가), `tests/node/runtime-assets.test.mjs`(고정 `expectedPaths` 목록에 신규 모듈 추가, 개정 1), `tests/node/fixtures/installed-layout-golden.json`(플랫폼별 `skills/arc/runtime/platform-registry.mjs` 항목 추가와 수정된 runtime 파일 `bootstrap.mjs`, `local-cli.mjs`의 해시 갱신, 개정 1)
- 생성물: `shared/skill/runtime/{platform-registry,local-cli,bootstrap}.mjs`, `MANIFEST.sha256`

**Interfaces:**
- Produces(`lib/runtime/platform-registry.mjs`):
  - `CAPABILITY_KEYS: readonly string[]`
  - `createPlatformRegistry(descriptors: RuntimeDescriptor[]) -> PlatformRegistry`
    - id, `anchorOrder`, `displayOrder`가 중복되면 `Error`를 던집니다.
    - 빠진 capability는 `{state:'off'}`로 채우고 결과를 동결합니다.
  - `PlatformRegistry = {platforms, platformIds(), getPlatform(id) -> descriptor|null, byDisplayOrder(), byAnchorOrder(), isPlatformId(v)}`
    - `platforms`와 `platformIds()`는 anchor 순서입니다.
  - `DEFAULT_PLATFORM_REGISTRY`, `RUNTIME_PLATFORMS`, 그리고 기본 레지스트리에 바인딩된 `platformIds`, `getPlatform`, `byDisplayOrder`, `byAnchorOrder`, `isPlatformId`
  - `runtimeRegistryOf(context) -> context?.runtimePlatforms ?? DEFAULT_PLATFORM_REGISTRY`
  - `standaloneProfileFile(descriptor, role) -> 'arc-<suffix>.<ext>'`, `routingProfileFile(descriptor, role) -> 'arc-routing-<suffix>.<ext>'`. 여기서 `role`은 `arc_<suffix>` 형식입니다.
  - `RuntimeDescriptor` 필드는 명세 5.2 표 그대로입니다. `home.resolve({userHome, env, cwd})`는 현행 `resolveConfigHome` 규칙 본문을 이 모듈로 옮긴 것입니다.
- Produces(`tests/node/fixtures/platforms/zeta.mjs`):
  - `ZETA_RUNTIME`: id `zeta`, label `Zeta`, anchorOrder 2, displayOrder 2, home.env `ZETA_HOME`(절대 경로 또는 `<userHome>/.zeta`), cli.command `zeta`, auth.kind `none`, profile ext `md`이며 이름 규칙은 claude와 같습니다. executionEnvironments `['zeta-cli']`, validatePair는 claude 규칙이고 capability는 `watch`를 뺀 전부가 verified입니다.
  - `ETA_RUNTIME`: id `eta`, label `Eta`, anchorOrder 3, displayOrder 3, capability는 전부 off입니다.
  - `createTestRuntimeRegistry(ids=['codex','claude','zeta']) -> PlatformRegistry`
- `local-cli.mjs`의 변경:
  - `resolveConfigHome(platform, ctx)`는 `runtimeRegistryOf(ctx).getPlatform(platform)?.home.resolve(ctx)`에 위임합니다. 미등록 id는 기존 문구 `Target must be codex or claude`를 그대로 던집니다.
  - `resolveLocalCli`는 허용 id, `cli.command`, `home.env`를 레지스트리에서 가져옵니다(42행 삼항 제거).

- [x] **Step 1: 실패하는 테스트 작성** (`tests/node/platform-registry.test.mjs`)

```js
test('runtime registry exposes codex and claude with spec values', () => {
  assert.deepEqual(platformIds(), ['codex','claude']);
  assert.deepEqual(byDisplayOrder().map(p=>p.id), ['claude','codex']);
  const codex=getPlatform('codex'), claude=getPlatform('claude');
  assert.equal(codex.profile.ext,'toml'); assert.equal(claude.profile.ext,'md');
  assert.equal(codex.profile.standaloneName('arc_planner'),'arc_planner');
  assert.equal(claude.profile.routingName('arc_planner'),'arc-routing-planner');
  assert.equal(codex.home.env,'CODEX_HOME'); assert.equal(claude.auth.kind,'cli-status-json');
  assert.deepEqual(codex.executionEnvironments,['codex-cli','codex-desktop']);
  for (const p of [codex,claude]) { assert.equal(p.cli.supportedVersions,null); for (const k of CAPABILITY_KEYS) assert.equal(p.capabilities[k].state,'verified'); }
});
test('createPlatformRegistry defaults capabilities to off and rejects duplicates', ...); // 중복 id, 중복 anchorOrder → throws
test('validatePair keeps current rules', () => { assert.equal(getPlatform('claude').routing.validatePair('opus','max'),true); assert.equal(getPlatform('claude').routing.validatePair('opus','minimal'),false); assert.equal(getPlatform('codex').routing.validatePair('gpt-5.5','anything'),true); assert.equal(getPlatform('codex').routing.validatePair('','x'),false); });
test('test registry orders zeta after claude', ...); // createTestRuntimeRegistry(): platformIds ['codex','claude','zeta'], byDisplayOrder ['claude','codex','zeta']
test('resolveConfigHome delegates without behavior change', ...); // 상대 CODEX_HOME은 cwd 기준, 비기본 CLAUDE_CONFIG_DIR는 기존 메시지로 throw, 'zeta'는 기본 레지스트리에서 'Target must be codex or claude'
test('resolveLocalCli uses registry for ids', ...); // runtimePlatforms=createTestRuntimeRegistry()이면 zeta에 unsupported_platform 사유가 없음. 미등록 'eta'는 reason 'unsupported_platform'
test('runtime registry imports only runtime-local modules', ...); // platform-registry.mjs의 import specifier가 모두 './' 또는 'node:'로 시작
```

- [x] **Step 2: 실패 확인.** `node --test tests/node/platform-registry.test.mjs` 실행. 기대: FAIL(모듈 없음)
- [x] **Step 3: 구현.** 위 Interfaces대로 구현하고 bootstrap, runtime-assets, golden을 갱신합니다.
- [x] **Step 4: 통과 확인.** `node --test tests/node/platform-registry.test.mjs tests/node/runtime-assets.test.mjs tests/node/runtime-versions.test.mjs tests/node/installed-layout-golden.test.mjs tests/node/targets.test.mjs` → PASS
- [x] **Step 5: STD-CLOSE** 실행
- [x] **Step 6: Orchestrator 커밋(수용 후).** `feat(runtime): 플랫폼 레지스트리 추가와 home 해석 위임`

**수용 전 QA:** fresh QA가 STD-CLOSE와 `installed-layout-golden` 차이를 확인합니다. 차이는 신규 경로 추가와, 이 작업이 수정한 runtime 파일(`bootstrap.mjs`, `local-cli.mjs`)의 해시 갱신뿐이어야 합니다(개정 1).
**Hold:** golden이나 parity에서 위 허용 차이 외의 차이가 생기면 hold하고 보고합니다.

---

### Task 2: 설치기 레지스트리, 포맷 모듈, 가용성 판정

**AC:** AC-P1(두 레지스트리 일관성), AC-T6(ReasonCode → 문구 매핑과 우선순위)

**Files:**
- Create: `lib/platforms/index.mjs`, `lib/platforms/codex.mjs`, `lib/platforms/claude.mjs`, `lib/platforms/availability.mjs`, `lib/platforms/formats/toml.mjs`, `lib/platforms/formats/markdown.mjs`, `tests/node/platform-availability.test.mjs`, `tests/node/fixtures/platforms/zeta-models.json`
- Modify:
  - `lib/installer/install-mode.mjs`: `isOwnedStandaloneProfile` 본문을 formats로 옮기고 래퍼만 남깁니다.
  - `lib/installer/role-routing.mjs`: `renameCompositeProfile`과 `tagDescription`을 formats로 옮기고 래퍼만 남깁니다.
  - `lib/models/profiles.mjs`, `lib/installer/runtime-config.mjs`: 포맷별 함수를 export만 추가합니다. 동작은 바꾸지 않습니다.
  - `tests/node/fixtures/platforms/zeta.mjs`(installer 부분 추가), `tests/node/platform-registry.test.mjs`

**Interfaces:**
- Produces(`lib/platforms/index.mjs`):
  - `createInstallerRegistry({runtime: PlatformRegistry, descriptors: InstallerDescriptor[]}) -> InstallerRegistry`
    - 메서드는 `PlatformRegistry`와 같고, 반환값은 installer descriptor입니다.
    - id 집합이나 순서가 runtime과 다르거나 `descriptor.runtime !== runtime.getPlatform(id)`이면 throw합니다.
  - `DEFAULT_INSTALLER_REGISTRY`
  - `installerRegistryOf(context) -> context?.platforms ?? DEFAULT_INSTALLER_REGISTRY`
  - `platformLabel(id, registry?) -> string`
  - `sortByDisplay(ids, registry?)`, `sortByAnchor(ids, registry?) -> string[]`
  - `mixedLabel(ids, registry?) -> 'Mixed (Claude + Codex)'`
- `InstallerDescriptor` 필드는 명세 5.3 그대로입니다. 함수 필드는 formats 모듈과 leaf 모듈의 함수를 참조합니다.
  - `profiles.render`, `profiles.isOwnedStandalone(bytes, role)`, `profiles.renameForRouting(bytes, role, revision) -> Buffer`
  - `runtimeConfig.readConcurrency(bytes) -> number|null`, `runtimeConfig.renderConcurrency(text, n)`, `runtimeConfig.extraRender: fn|null`
  - `models.staticCatalog: URL`, `models.effortField`, `models.discover`
  - `uninstallSummary: string`, `isolationEnv(work) -> object`
- Produces(`lib/platforms/availability.mjs`):
  - `REASON_TEXT = {capability_not_verified:'capability not verified', not_installed:'not installed', unsupported_version:'unsupported version', unauthorized:'unauthorized', auth_check_failed:'auth check failed', catalog_error:'catalog error'}`
  - `platformAvailability(id, {status, catalog, usage, registry}) -> {selectable, reason, warning}`
    - `catalog === undefined`이면 카탈로그 검사를 건너뜁니다(아직 미평가).
    - `status.cliVersion?.version`을 `supportedVersions`와 비교합니다(null이면 항상 통과).
  - `reasonDetail(id, availability, status) -> string`: 사유 전문입니다. 고정 문구에 진단 메시지를 붙이며, 문구는 Implementer가 정합니다.
- `zeta.mjs` 추가분:
  - `ZETA_INSTALLER`: payloadPrefix `zeta`, instructionFile `ZETA.md`, runtimeConfigFile `settings.json`, markdown 포맷, staticCatalog는 `zeta-models.json`, discover `null`
  - `ETA_INSTALLER`
  - `createTestRegistries(ids) -> {runtimePlatforms, platforms}`

- [x] **Step 1: 실패하는 테스트 작성**

```js
// platform-availability.test.mjs
const ok={state:'installed',authentication:{authStatus:'authenticated'}}, ready={status:'ready',catalog:{pairs:[{}]}};
test('priority follows spec table', () => {
  assert.equal(platformAvailability('codex',{status:{...ok,authentication:{reason:'cli_not_found',authStatus:'unknown'}},catalog:{status:'unavailable'},usage:'role'}).reason,'not_installed');
  assert.equal(platformAvailability('codex',{status:{...ok,authentication:{authStatus:'unauthorized'}},catalog:{status:'unavailable'},usage:'role'}).reason,'unauthorized');
  assert.equal(platformAvailability('codex',{status:{...ok,authentication:{authStatus:'unknown'}},catalog:ready,usage:'host'}).reason,'auth_check_failed');
  assert.equal(platformAvailability('claude',{status:ok,catalog:{status:'ready',catalog:{pairs:[]}},usage:'role'}).reason,'catalog_error');
});
test('standalone ignores CLI and auth', ...); // unauthorized + ready → {selectable:true, reason:null}
test('auth kind none passes unknown with warning', ...); // createTestRegistries() zeta: unknown → {selectable:true, warning:'auth_unverified'}
test('capability off wins first', ...); // eta → reason 'capability_not_verified' for role/host/standalone
test('REASON_TEXT maps every code', ...); // 6개 키와 값이 정확히 일치
// platform-registry.test.mjs 추가
test('installer and runtime registries agree', ...); // ids와 순서가 같고 descriptor.runtime === getPlatform(id). 순서가 다른 descriptor 주입 시 throw
test('format modules do not import lib/platforms', ...); // Global Constraints 목록의 파일 내용에 'platforms/' import가 없음
test('mixedLabel uses display order', () => assert.equal(mixedLabel(['codex','claude']),'Mixed (Claude + Codex)'));
```

- [x] **Step 2: 실패 확인.** `node --test tests/node/platform-availability.test.mjs tests/node/platform-registry.test.mjs` → FAIL
- [x] **Step 3: 구현.** 옮긴 함수의 동작은 바이트 단위로 같아야 합니다. 래퍼 `isOwnedStandaloneProfile(bytes,platform,role)`는 미등록 id에 `false`를 돌려줍니다.
- [x] **Step 4: 통과 확인.** 위 테스트와 `install-mode.test.mjs`, `role-routing-publish.test.mjs`, `profile-render.test.mjs`, `runtime-config.test.mjs` → PASS
- [x] **Step 5: STD-CLOSE**
- [x] **Step 6: 커밋.** `feat(platforms): 설치기 레지스트리와 가용성 판정 추가`

**Hold:** 옮긴 함수 때문에 기존 테스트 기대값이 바뀌면 hold합니다.

---

### Task 3: 설치기 경로, 자산, 계획을 레지스트리로 이전

**AC:** AC-C2(사용자 설정 보존, 기존 `install`/`upgrade-state`/`global-config` 무변경 통과), AC-P1(해당 금지 패턴 제거)

**Files (Modify):**
- `lib/installer/targets.mjs:5-9`
- `lib/installer/manifest.mjs:42-59`
- `lib/installer/skill-sources.mjs:6`
- `lib/installer/superpowers.mjs:11`(`DYNAMIC_ROOTS` = registry ids + `shared`)
- `lib/installer/install.mjs:5`(anchorOrder 정렬)
- `lib/installer/plan.mjs:49-50`(`extraRender`/`renderConcurrency` 경유)
- `lib/installer/uninstall.mjs:23`(`uninstallSummary`)
- `lib/installer/upgrade-state.mjs:14-15`(13행은 유지, 질문 Q-A 참조)
- `lib/installer/acquisition.mjs:15`(`isolationEnv`)
- Test: `tests/node/targets.test.mjs`(추가만)

**Interfaces:**
- Produces:
  - `resolveTarget(platform, ctx)`: 반환 형태는 그대로이고 값은 descriptor에서 얻습니다. `ctx.platforms`가 있으면 그 레지스트리를 씁니다.
  - `resolveTargets(context) -> {targets: {[id]: Target}, unresolved: Array<{platform, error}>}`: anchor 순서로 해석하며, 해석에 실패한 항목은 `unresolved`에 넣습니다.
  - `installTargets(plans, {…, platforms})`: 레지스트리 anchorOrder로 정렬합니다.
- Consumes: Task 2의 `installerRegistryOf`, descriptor 필드

- [x] **Step 1: 테스트 작성**

```js
test('resolveTargets separates unresolved homes', ...); // env.CLAUDE_CONFIG_DIR='/x' → targets.codex 존재, unresolved[0].platform==='claude'
test('resolveTarget uses injected registry', ...); // ctx.platforms=createTestRegistries().platforms, ZETA_HOME 지정 → instructionPath endsWith 'ZETA.md', profileNames[0]==='arc-scouter.md'
test('install order follows anchorOrder', ...); // plans [claude,zeta,codex] → 실행 순서 codex, claude, zeta
```

- [x] **Step 2:** `node --test tests/node/targets.test.mjs` → FAIL
- [x] **Step 3:** 구현
- [x] **Step 4:** `node --test tests/node/targets.test.mjs tests/node/install.test.mjs tests/node/uninstall.test.mjs tests/node/upgrade-state.test.mjs tests/node/global-config.test.mjs tests/node/manifest.test.mjs tests/node/plan.test.mjs tests/node/acquisition.test.mjs tests/node/all-targets.test.mjs` → PASS(기존 기대값 무변경)
- [x] **Step 5: STD-CLOSE**와 `node scripts/check-installer-parity.mjs` → PASS
- [x] **Step 6:** `refactor(installer): 설치 대상과 자산 경로를 플랫폼 레지스트리로 이전`

**수용 전 QA:** fresh QA가 무변경 테스트군과 parity를 확인합니다.
**Hold:** 기존 테스트 기대값을 바꿔야 한다면 hold합니다.

---

### Task 4: 모델, 정책, 상태를 레지스트리로 이전

**AC:** AC-P1(모델, 정책, 상태의 금지 패턴 제거), AC-P2(role-policy 생성물 무변경)

**Files (Modify):**
- `lib/models/config.mjs:9-14`(플랫폼 검증 → runtime `isPlatformId`, `effortField` → runtime descriptor `models.effortField`. lib/platforms import는 금지, 개정 2)
- `lib/runtime/platform-registry.mjs`(codex/claude runtime descriptor에 `models.effortField` 추가, 개정 2)
- `lib/platforms/codex.mjs`, `lib/platforms/claude.mjs`(`models.effortField`를 runtime descriptor 값에서 가져옴, 개정 2)
- `tests/node/fixtures/platforms/zeta.mjs`(`ZETA_RUNTIME`·`ETA_RUNTIME`에 `models.effortField: 'effort'` 추가, 설치기 쪽은 runtime 값 사용, 개정 2)
- 생성물: `shared/skill/runtime/*`(`node scripts/update-runtime-assets.mjs`), runtime 해시 고정 테스트(`tests/node/runtime-assets.test.mjs`, `tests/node/runtime-versions.test.mjs`)의 해시 갱신만(개정 2)
- `lib/models/static-catalog.mjs:4-7,35`(URL → `models.staticCatalog`, 집합 → S 인자)
- `lib/models/catalog.mjs:22-41`(`models.discover`)
- `lib/models/profiles.mjs:101,107`(확장자와 렌더러 선택 → runtime registry `profile.ext`로 포맷 분기. lib/platforms import는 금지)
- `lib/policy/render.mjs:18-37`(`controls` 키와 `POLICY_TARGETS` → 기본 runtime registry)
- `lib/management/status.mjs`
- Test: `tests/node/management-status.test.mjs`(추가만), `tests/node/platform-registry.test.mjs`(추가만, 개정 2)

**Interfaces:**
- Produces:
  - `loadStaticModelCatalog(platform, {signal, platforms})`: 레지스트리에 없으면 기존과 같은 `unsupported_platform` 결과를 냅니다.
  - `assertCompositeCatalogRoles({roles, catalogs})`: `catalogs`의 키 집합을 순회합니다.
  - `collectStatus(context, {codexCheck='refresh'})`:
    - 순회 순서는 `byAnchorOrder()`이며 현행 `['codex','claude']`와 같습니다.
    - mode는 `resolveTargets`와 `readInstallMode`로 구합니다.
    - 인증 처리는 `auth.kind`로 정합니다. `codex-refresh`는 현행 codex probe(`codexCheck`)를, `cli-status-json`은 `probePlatformAuth`를 씁니다. `none`이면 CLI가 있을 때 `{platform, authStatus:'unknown', reason:'auth_probe_unavailable'}`을 돌려줍니다.

- [x] **Step 1: 테스트 작성**

```js
test('collectStatus iterates registry in anchor order', ...); // 기본 → map(s=>s.platform) deepEqual ['codex','claude']
test('auth kind none reports unknown without probe', ...); // createTestRegistries + fake bin/zeta → zeta.authentication.reason==='auth_probe_unavailable'
test('static catalog resolves via descriptor', ...); // zeta 주입 시 status 'ready', catalog.platform 'zeta'
// platform-registry.test.mjs 추가(개정 2)
test('effortField comes from runtime registry', ...); // getPlatform('codex').models.effortField==='model_reasoning_effort', claude 'effort', 설치기 descriptor 값과 같음, config.mjs가 lib/platforms를 직접·간접 import하지 않음
```

- [x] **Step 2:** `node --test tests/node/management-status.test.mjs` → FAIL
- [x] **Step 3:** 구현
- [x] **Step 4:** `node --test tests/node/platform-registry.test.mjs tests/node/management-status.test.mjs tests/node/models.test.mjs tests/node/model-catalog.test.mjs tests/node/profile-render.test.mjs tests/node/role-policy.test.mjs tests/node/status-labels.test.mjs tests/node/codex-auth-probe.test.mjs` → PASS
- [x] **Step 5: STD-CLOSE**(`check:role-policy` 생성물 무변경을 반드시 확인)
- [x] **Step 6:** `refactor(models): 모델 카탈로그와 정책 대상, 상태 수집을 레지스트리로 이전`

---

### Task 5: runtime 비-composite 식별을 이전하고 bridge 구현을 Map으로 전환

**AC:** AC-P1(bridge coverage), AC-M7(기존 `role-bridge-*`, `runtime-*` 무변경 통과)

**Files (Modify):**
- `lib/runtime/schema.mjs:14,50,66,75`, `lib/runtime/identity.mjs:34`
- `lib/runtime/role-dispatch-store.mjs:25`(`hostPlatform` → `isPlatformId`)
- `lib/runtime/role-dispatch-policy.mjs:74`(`profileName` → descriptor. 12행 env 맵은 유지)
- `lib/runtime/role-routing.mjs:118-119,133-138`(`hostOf`/`environmentOf` → registry `executionEnvironments`, `authenticate` → `auth.kind`)
- `lib/runtime/role-bridge.mjs:16-17`(`hostOf`/`environmentOf`)
- `lib/runtime/role-bridge-args.mjs:9-13,104-109`, `lib/runtime/role-supervisor.mjs:55,214,280-309`
- Test: `tests/node/platform-registry.test.mjs`(coverage 추가)
- 생성물: shared runtime 미러

**Interfaces:**
- Produces:
  - `role-bridge-args.mjs`: `BRIDGE_PLATFORM_IDS: readonly string[]`(파서와 인자 빌더 Map의 키). 미등록 id는 기존 `unknown platform` 오류를 냅니다.
  - `role-supervisor.mjs`: `SUPERVISOR_PLATFORM_IDS: readonly string[]`(stream 정규화와 관찰 Map의 키)
  - `hostOf(context)`: `runtimeRegistryOf(context).isPlatformId(context.hostPlatform)`
  - `environmentOf`: `getPlatform(host).executionEnvironments.includes(env)`

- [x] **Step 1: 테스트 작성**

```js
test('bridge implementations cover every bridge-verified platform', () => { for (const p of RUNTIME_PLATFORMS.filter(p=>p.capabilities.bridge.state==='verified')) { assert.ok(BRIDGE_PLATFORM_IDS.includes(p.id)); assert.ok(SUPERVISOR_PLATFORM_IDS.includes(p.id)); } });
test('lease hostPlatform accepts only registered ids', ...); // validateLease({…hostPlatform:'eta'}) throws
test('environmentOf uses registry environments', ...); // routingStatus({context:{hostPlatform:'codex',executionEnvironment:'claude-cli'}}).decision==='deny'
```

- [x] **Step 2:** FAIL 확인
- [x] **Step 3:** 구현
- [x] **Step 4:** `node --test tests/node/platform-registry.test.mjs tests/node/role-bridge-*.test.mjs tests/node/role-dispatch-store.test.mjs tests/node/role-routing-dispatch.test.mjs tests/node/runtime-schema.test.mjs tests/node/runtime-capabilities.test.mjs tests/node/runtime-claude.test.mjs tests/node/runtime-codex.test.mjs` → PASS
- [x] **Step 5: STD-CLOSE**(runtime 재생성 포함)
- [x] **Step 6:** `refactor(runtime): 호스트와 실행 환경, bridge 구현 조회를 레지스트리로 이전`

---

### Task 6: 활성 설정 v1/v2 파서와 기록 규칙

**AC:** AC-M10, AC-M7(v1 바이트 무변경)

**Files:**
- Modify: `lib/runtime/role-routing-config.mjs`
- Create: `tests/node/role-routing-config.test.mjs`
- 생성물: 미러

**Interfaces (Produces):**
- `validRoleValues(platform, model, effort, {runtimePlatforms}={}) -> boolean`: 레지스트리 `isPlatformId`와 `routing.validatePair`로 판정합니다.
- `parseRoleRoutingConfig(text, opts) -> {version, revision, platforms, roles}`: v1이면 `platforms`에 `['codex','claude']`를 채웁니다.
- `validateRoleRoutingConfig(config, opts)`: 같은 형태를 반환합니다. 입력 v1에는 `platforms`가 없어도 됩니다.
- `serializeRoleRoutingConfig(config) -> string`
  - S가 {codex, claude}이면 현행 v1 바이트와 같게 씁니다.
  - 그 밖에는 `{version:2,revision,platforms,roles}`로 씁니다. 키 순서는 이대로이며, 서식은 v1과 같습니다.
- `buildRoleRoutingConfig({revision, platforms, roles}, opts) -> config`: platforms ∪ 역할 플랫폼을 anchorOrder로 정렬하고 version을 정합니다.

- [ ] **Step 1: 테스트 작성**

```js
test('v1 round-trips byte-identically', ...); // 현행 fixture JSON → parse → serialize === 원문, platforms ['codex','claude']
test('build writes v1 only for codex+claude', ...); // platforms ['claude','codex'] → version 1; ['claude','zeta'](test registry) → version 2, platforms ['claude','zeta']
test('v2 rejects unsorted, duplicate, unregistered, missing role platform, length<2', ...); // 각각 throws
test('v2 parses with injected registry', ...);
```

- [ ] **Step 2:** FAIL → **Step 3:** 구현 → **Step 4:** 위 테스트와 `role-routing-publish`, `role-routing-install`, `install-mode` → PASS
- [ ] **Step 5: STD-CLOSE** → **Step 6:** `feat(runtime): 활성 라우팅 설정 v2 파서와 기록 규칙 추가`

**Hold:** 기존 테스트가 parse 결과를 deepEqual로 단언해 `platforms` 추가로 실패하면 hold하고 보고합니다(조사 범위에서는 해당 없음).

---

### Task 7: 설치 모드 판정 N-플랫폼화와 테스트 패키지 helper

**AC:** AC-M6, AC-M7(기존 fixture가 composite로 판정)

**Files:**
- Modify: `lib/installer/install-mode.mjs`(`readInstallMode`. 문구는 Task 9에서 바꿈)
- Modify(개정 3, 주입 레지스트리 지원. 기본 레지스트리에서 동작·문구 무변경):
  - `lib/prompts/render.mjs`(`validateAgentTemplates`와 템플릿 기대값을 설치기 레지스트리 기준으로 구성, `agentTemplates.expectationsFrom` 지원)
  - `lib/models/config.mjs`, `lib/models/profiles.mjs`(`platformOf`, `effortField`, `validateRoles`, `loadModelConfig`, `resolveModelSettings`, `renderProfiles`가 선택 인자 `{runtimePlatforms}`를 받음. lib/platforms import 금지 유지)
  - standalone 설치 경로의 전달부: `lib/installer/manifest.mjs`(`verifyPayload`), `lib/installer/plan.mjs`, `lib/installer/install.mjs`, `lib/installer/role-routing.mjs`(standalone 렌더 경로만, composite는 작업 8), `lib/installer/upgrade-state.mjs`
  - `tests/node/fixtures/platforms/zeta.mjs`(`ZETA_INSTALLER.agentTemplates = {expectationsFrom:'claude'}`)
  - management·TUI 호출부는 이 작업에서 바꾸지 않습니다(작업 9 이후).
- Create:
  - `tests/node/fixtures/platforms/package-root.mjs`(helper)
  - `tests/node/install-mode-n-platform.test.mjs`
- helper 범위(명세 10장의 결정 사항):
  - `zetaPackageFixture(t) -> packageRoot`: `staticPackageFixture(t)`를 복사하고 `claude/`를 `zeta/`로 복제합니다(`models.toml`에는 platform 필드가 없으므로 그대로 둡니다, 개정 3). `node scripts/update-manifest.mjs --root <tmp>`를 실행한 뒤, 이 스크립트가 codex/claude만 읽으므로 helper가 zeta를 포함한 파일 맵으로 `renderManifest(files,{platforms})`를 호출해 임시 MANIFEST를 다시 씁니다.
  - `zetaContext(t) -> context`: 임시 `userHome`, `env.ZETA_HOME`, fake CLI 3개(codex/claude는 `installFakeCli`, zeta는 `exit 0` 스크립트), `platforms`/`runtimePlatforms` 주입
  - `installAll(ctx, ids)`: 각 id를 standalone으로 설치합니다.

**Interfaces (Produces):**
- `readInstallMode({safeFs, targets, unresolved=[], snapshot, platforms}) -> {mode, platforms, anchor, homes, config, residualPaths}`
  - `homes[id]`는 `'composite'|'standalone'|'unverified'` 중 하나입니다. 해석에 실패한 id는 `'unresolved'`입니다.
  - 판정 알고리즘은 명세 6.4의 1–7을 그대로 따릅니다.
  - 활성 설정 후보는 해석된 각 home의 `arc-role-platform-routing.json`입니다.
  - `inspectCompositeRemoval`의 anchor 판정은 `target.home === path.dirname(activeConfigPath)`입니다(Task 8에서 적용하며, 여기서는 호출만 바꿉니다).

- [ ] **Step 1: 테스트 작성**

```js
test('existing codex+claude composite fixture stays composite', ...); // publish() 후 mode 'composite', platforms ['codex','claude'], anchor 'codex'
test('unresolved platform outside S is ignored', ...); // codex standalone + CLAUDE_CONFIG_DIR 비기본 → mode 'standalone' (6.4.8 행동 변화)
test('two active configs → unverified with both residual', ...);
test('orphan marker or routing profile → unverified', ...);
test('active config not at anchor home → unverified', ...); // claude home에 v1 config를 복사하고 codex 것은 삭제
test('S member unresolved → unverified', ...);
// 개정 3
test('zeta package passes verifyPayload with injected registry', ...); // zetaPackageFixture + createTestRegistries → verifyPayload 통과, 기본 레지스트리로는 기존과 같은 결과
test('installAll installs zeta standalone', ...); // installAll(ctx,['codex','claude','zeta']) → readInstallMode mode 'standalone', homes 3개 'standalone'
```

- [ ] **Step 2:** FAIL → **Step 3:** 구현 → **Step 4:** `node --test tests/node/install-mode*.test.mjs tests/node/management-status.test.mjs tests/node/upgrade-state.test.mjs tests/node/agent-fragments.test.mjs tests/node/models.test.mjs tests/node/profile-render.test.mjs tests/node/install.test.mjs tests/node/plan.test.mjs tests/node/manifest.test.mjs tests/node/role-routing-install.test.mjs` → PASS(기존 기대값 무변경, 개정 3에서 테스트군 추가)
- [ ] **Step 5: STD-CLOSE** → **Step 6:** `feat(installer): 설치 모드 판정을 참여 집합 기준으로 일반화`

**수용 전 QA:** fresh QA가 기존 `install-mode-*` 무변경 통과와 helper의 격리를 확인합니다. 격리 조건은 실제 `~` 미사용이며, 생성되는 임시 MANIFEST는 원본을 바꾸지 않아야 합니다.
**Hold:** zeta payload가 `verifyPayload`를 통과하려면 `role-policy.json`이나 정책 렌더 변경이 필요하다면 hold하고 Orchestrator에 보고합니다(명세 13장 helper 비용 위험).

---

### Task 8: composite 파일 계층 일반화(S, anchor, marker)

**AC:** AC-M4(파일 계층, 호스트 전용 `profiles:{}`), AC-M7(publish 경로, lock, v1)

**Files:**
- Modify: `lib/installer/role-routing.mjs`
- Test: `tests/node/install-mode-n-platform.test.mjs`(추가)

**Interfaces (Produces):**
- `prepareCompositeFiles({context, targets, platforms, anchor, config, profileInputs, modelConfigs})`
  - `platforms`는 S입니다. 활성 경로는 `targets[anchor].home/arc-role-platform-routing.json`입니다.
  - marker는 P∈S마다 둡니다. `desired`는 역할 플랫폼에만 둡니다.
  - effort 필드는 `models.effortField`, 파일 이름은 `routingProfileFile`로 정합니다.
- `publishCompositeFiles({context, prepared})`
  - lock과 `assertNoActiveBridgeDispatch`(bridge만 검사하는 현행 규칙 유지)는 anchor home에서 처리합니다.
  - runtime hash 검사와 marker 기록은 S 전체에 적용합니다. 반환값은 현행 형태 그대로입니다.
- `inspectCompositeRemoval({target, safeFs, activeConfigPath, snapshot})`: 87행 `platform==='codex'` 조건을 anchor 판정으로 바꿉니다.
- `prepareCompositeDeactivation({context, targets, payload, platforms, anchor})`와 `publishCompositeDeactivation`: S 순회, anchor lock
- `readCompositeRoutingConfig(context, targets)`: `readInstallMode`의 anchor를 통해 읽습니다.
- 인자를 생략하면 `platforms`는 `['codex','claude']`, `anchor`는 `'codex'`입니다(기존 테스트 호환).

- [ ] **Step 1: 테스트 작성**

```js
test('|S|=3 publish writes active only at anchor and markers in all homes', ...); // installAll(ctx,['codex','claude','zeta']), roles 전부 codex/claude, platforms [codex,claude,zeta] → codex home에만 active(v2), 3개 marker, zeta marker.profiles deepEqual {}
test('publish lock lives at anchor home', ...); // anchor home에 미리 만든 lock → lock busy 오류, 다른 home은 무관
test('deactivation restores standalone across S', ...);
```

- [ ] **Step 2:** FAIL → **Step 3:** 구현 → **Step 4:** `node --test tests/node/install-mode*.test.mjs tests/node/role-routing-*.test.mjs tests/node/composite-instructions.test.mjs` → PASS
- [ ] **Step 5: STD-CLOSE** → **Step 6:** `feat(installer): composite 파일 게시를 참여 집합과 anchor 기준으로 일반화`

**수용 전 QA:** fresh QA가 기존 `role-routing-*`와 `install-mode-*` 무변경 통과, v1 바이트 동일성을 확인합니다.

---

### Task 9: management composite API, 게이트, 문구, D1-a..d

**AC:** AC-C1, AC-M2, AC-M3(integration), AC-M4(integration, 부분 실패 시 미게시), AC-M5(D1-d), AC-M7

**Files:**
- Modify: `lib/management/operations.mjs`, `lib/installer/install-mode.mjs:33`(문구)
- Test: `tests/node/install-mode-n-platform.test.mjs`(추가), `tests/node/management-operations.test.mjs`(추가)
- 문구 기대값만 바꾸는 테스트: `install-mode.test.mjs:39-40`, `install-mode-switch.test.mjs:23,26`, `install-mode-review-followup.test.mjs:17`, 그리고 `preset.test.mjs`, `npm-lifecycle.test.mjs`의 해당 문구

**Interfaces (Produces):**
- `prepareOperation(context, options)`
  - 단일 target은 `installerRegistryOf(context).isPlatformId(options.target)`로 판정합니다.
  - `target:'all'`은 install에서 `byAnchorOrder`, uninstall에서 `byDisplayOrder`를 씁니다.
  - composite 활성 오류 문구는 `Mixed routing is active; confirm the switch first`입니다.
  - uninstall의 `compositeActivePath`는 composite면 anchor home의 활성 경로, 아니면 해석 가능한 첫 플랫폼(anchor 순서) home 경로입니다(현행 동작 보존).
- `prepareCompositeOperation(context, {kind, config, platforms?, settings})`
  - S = sortByAnchor(unique(`platforms` ?? (현재 composite면 그 S, 아니면 `['codex','claude']`)) ∪ 역할 플랫폼)
  - 미등록이면 `Unknown platform: <id>`, |S|<2이면 `Mixed routing requires at least two platforms`를 던집니다.
  - 게이트는 P∈S마다 `platformAvailability(P,{status, catalog, usage: 역할이면 'role' 아니면 'host'})`입니다. 실패 메시지는 현행 형식 `<id>: Unauthorized|Not Available|Incomplete`를 유지합니다(`not_installed`→Not Available, `unauthorized`→Unauthorized, 그 외→Incomplete).
  - home 겹침 검사는 S의 모든 쌍에 적용합니다. 카탈로그 검사는 S 전체입니다.
  - 설치 plan은 S anchor 순서이며, `profiles`는 (현재 composite이고 P∈S')이면 `'omit'`, 아니면 `'write'`입니다.
  - 설정은 `buildRoleRoutingConfig`로 만듭니다.
- `executeCompositeOperation`
  - 성공 문구: `[`${mixedLabel(S)} activated.`, 'After upgrading ARC, run Install / Update again.', …residual]`
  - switch 문구: `Mixed routing turned off.`
- `currentInstallState(context) -> {mode, platforms, anchor}`(신규 export). `currentInstallMode`와 `readCompositeConfig`는 유지합니다.
- `uninstallPrepared`: lock은 anchor home에서 잡습니다.

- [ ] **Step 1: 테스트 작성**

```js
test('D1-a leaves other homes byte-identical', ...); // codex+claude standalone, claude만 install → codex home 스냅샷(재귀 바이트) 동일
test('D1-a works when claude home is unresolved', ...); // Review Focus 1
test('composite platforms default to current S or codex+claude', ...); // AC-C1
test('|S|=3 install-composite publishes at codex anchor', ...); // zetaContext: platforms ['claude','zeta'], roles는 codex 포함 → S [codex,claude,zeta]
test('partial install failure does not publish', ...); // hooks.fault로 zeta 설치 실패 → activation 'held', active 파일 없음
test('D1-d republish keeps v1 bytes and codex lock/store', ...);
test('kind preset, skipGlobal and target all remain accepted', ...);
test('activation message uses display-ordered mixed label', ...); // messages[0]==='Mixed (Claude + Codex) activated.'
```

- [ ] **Step 2:** FAIL → **Step 3:** 구현 → **Step 4:** `node --test tests/node/install-mode*.test.mjs tests/node/management-operations.test.mjs tests/node/preset*.test.mjs tests/node/uninstall*.test.mjs tests/node/all-targets.test.mjs tests/node/npm-lifecycle.test.mjs` → PASS
- [ ] **Step 5: STD-CLOSE** → **Step 6:** `feat(management): composite 참여 집합 옵션과 Mixed 문구 적용`

**수용 전 QA:** fresh QA가 바뀐 테스트 diff를 확인합니다. 문구 줄만 바뀌어야 하며, 기대값의 다른 변경이 있으면 거부합니다. AC-C1 CLI 테스트도 확인합니다.

---

### Task 10: D1-e 집합 변경과 anchor 이동

**AC:** AC-M5(D1-e), AC-M8

**Files:**
- Modify: `lib/installer/role-routing.mjs`, `lib/management/operations.mjs`
- Test: `tests/node/install-mode-n-platform.test.mjs`(추가)

**Interfaces (Produces):**
- `prepareCompositeFiles(…, previous?: {platforms, anchor})`
  - S'\S의 routing 파일 제거와 standalone 복원 spec을 포함합니다. 복원 로직은 `prepareCompositeDeactivation`의 home별 처리를 `restoreStandaloneSpecs({context,target,payload,snapshot})`로 분리해 재사용합니다.
  - anchor가 바뀌면 이전 활성 파일 제거를 포함합니다.
- `publishCompositeFiles`
  - anchor가 바뀌는 경우:
    - old와 new anchor lock을 anchorOrder 오름차순으로 획득합니다.
    - 두 store의 `listLeases`에 `NON_TERMINAL_STATES` lease가 하나라도 있으면 오류 `Active dispatches block moving mixed routing; finish or cancel them first`를 던집니다(`activation:'held'`, `activeDispatches`). 파일은 무변경입니다.
    - 단일 `applyTransaction`으로 처리합니다.
    - lock은 역순으로 해제하며, 실패한 lock 경로는 각각 residual에 넣습니다.
  - anchor가 같은 경우는 Task 8 규칙을 따릅니다.
- management는 anchor 이동 시 메시지에 `Dispatch history stays in <old home>/arc-role-dispatch.`를 추가합니다.

- [ ] **Step 1: 테스트 작성**

```js
test('D1-e same anchor adds zeta and removes nothing', ...); // S' [codex,claude] → S [codex,claude,zeta]
test('D1-e removes S\'\\S routing files and restores standalone', ...); // S' [codex,claude,zeta] → [codex,claude]: zeta home에 routing 파일/marker 없음, arc-*.md 복원, skills/arc 유지
test('anchor move codex→claude rewrites active, markers, old active removed', ...); // S' [codex,claude] → S [claude,zeta]: claude home에 v2 active, marker.activeConfigPath 갱신, codex active/marker/routing 없음, codex arc-role-dispatch 유지, 메시지 포함
test('anchor move blocked by any non-terminal lease', ...); // codex store에 native reserved lease → activation 'held', activeDispatches [id], 모든 home 바이트 동일 (AC-M8)
test('anchor move lock release failure reports both lock paths', ...); // Review Focus 5
```

- [ ] **Step 2:** FAIL → **Step 3:** 구현 → **Step 4:** `node --test tests/node/install-mode*.test.mjs tests/node/role-routing-*.test.mjs` → PASS
- [ ] **Step 5: STD-CLOSE** → **Step 6:** `feat(installer): 참여 집합 변경과 anchor 이동 트랜잭션 추가`

**수용 전 QA:** fresh QA가 AC-M8 바이트 동일성과 실패 경로의 residual 보고를 확인합니다.

---

### Task 11: runtime anchor 탐색

**AC:** AC-M9, AC-M7(기존 runtime 경로)

**Files:**
- Modify: `lib/runtime/role-routing.mjs`(65–86, 140–143, 151–226), `lib/runtime/role-bridge.mjs:20,27,38-215`, `lib/runtime/role-supervisor.mjs:85-104`
- Create: `tests/node/role-routing-anchor.test.mjs`
- 생성물: 미러

**Interfaces (Produces):**
- `resolveRuntimeHomes(context) -> {[id]: string}`: 해석에 실패한 id는 빠집니다.
- `locateAnchorHome({host, homes}) -> string`: host marker의 `path.dirname(activeConfigPath)`입니다. marker가 없거나 형식이 맞지 않으면 throw합니다.
- `readActivation(homes, expectedRevision, {anchorHome = homes.codex, host, runtimePlatforms} = {}) -> config`
  - 설정은 anchorHome에서 읽습니다.
  - 다음을 확인합니다: `anchorHome === homes[min(S)]`, host가 있으면 host∈S, S 전체 marker 검증, host marker 재확인.
- `readRevision(homes, {anchorHome})`
- `routingStatus`와 `prepareRoleDispatch`: `withRoutingLock(anchorHome)`, store는 anchorHome, 인증 순회는 `S ∩ (host ∪ 역할 플랫폼)`
- `role-bridge.mjs`:
  - `leaseTargetPlatform(lease, registry)`: native면 host입니다. bridge면 등록 플랫폼이 정확히 2개일 때 다른 하나이고, 그 밖에는 hold(`unknown platform`)입니다.
  - 모든 store와 lock은 `locateAnchorHome` 결과를 씁니다.
- supervisor는 전달받은 `codexHome`을 anchor home으로 취급합니다(매개변수 이름은 유지). 93행 homes 맵 → `resolveRuntimeHomes`

- [ ] **Step 1: 테스트 작성**

```js
test('routingStatus finds anchor via host marker and locks there', ...); // test registry S [claude,zeta], host zeta → claude home에 lock 생성 관찰(fs.open 감시 또는 미리 둔 lock으로 busy 확인)
test('anchor/host mismatch, host∉S, marker re-check mismatch → activation_unverified', ...);
test('host outside S without marker → activation_unverified', ...);
test('default codex+claude layout unchanged', ...); // 기존 fixture: lock/store = codex home
test('leaseTargetPlatform holds with three registered platforms', ...);
```

- [ ] **Step 2:** FAIL → **Step 3:** 구현 → **Step 4:** `node --test tests/node/role-routing-*.test.mjs tests/node/role-bridge-*.test.mjs tests/node/role-dispatch-store.test.mjs tests/node/role-observe.test.mjs tests/node/watch-dispatch.test.mjs` → PASS
- [ ] **Step 5: STD-CLOSE** → **Step 6:** `feat(runtime): host marker 기반 anchor 탐색과 lock 적용`

**수용 전 QA:** fresh QA가 기존 `role-bridge-*` 무변경 통과와 watch 테스트 무영향을 확인합니다.

---

### Task 12: `deriveInstallPlan`과 홈 상태 helper

**AC:** AC-M1, AC-T10(순수 도출), AC-T9(4개 가짜 id 순서)

**Files:**
- Create: `lib/tui/derive-install-plan.mjs`, `lib/tui/mode.mjs`, `tests/node/derive-install-plan.test.mjs`

**Interfaces (Produces):**
- `deriveInstallPlan({roles, hosts, current, registry}) -> {rule, platforms, anchor, previous, removed, added, anchorMove, modeLabel}`
  - `roles`의 키는 `ROLES`이고 값은 `{platform,model,effort}`입니다.
  - `current`는 `{mode:'standalone'|'composite'|'unverified', platforms|null}`입니다.
  - `rule`은 `'D1-a'..'D1-f'`, `platforms`는 anchorOrder 순서의 S입니다.
  - `modeLabel`: composite 도출이면 `Mixed (…)`, |S|=1이면 그 라벨, unverified면 `Unverified`
- `homeStatusLine(statuses, registry) -> string`: 표시 순서로 `Label: State`를 ` / `로 연결합니다. State 어휘는 현행 매핑을 유지하고 composite 축약은 없앱니다.
- `homeModeLine(installState, statuses, registry) -> string`: `Mixed (…)`, `Claude, Codex`(standalone 설치만, 표시 순서), `Not installed`, `Unverified`

- [ ] **Step 1: 테스트 작성(표 테스트)**

```js
const all=p=>Object.fromEntries(ROLES.map(r=>[r,{platform:p,model:'m',effort:'e'}]));
test('all codex roles + claude host → composite codex+claude', () => { const r=deriveInstallPlan({roles:all('codex'),hosts:['claude'],current:{mode:'standalone',platforms:null}}); assert.equal(r.rule,'D1-c'); assert.deepEqual(r.platforms,['codex','claude']); assert.equal(r.modeLabel,'Mixed (Claude + Codex)'); });
// 행: D1-a(S={claude}, standalone), D1-b(S={codex}, composite), D1-d(S=S'), D1-e(S≠S', anchorMove true/false: test registry), D1-f(unverified), hosts [] → S=역할 플랫폼, Review Focus 2(composite에서 hosts 해제 → D1-b)
test('labels follow display order with four fake ids', ...); // registry ids codex,claude,zeta,eta → homeStatusLine 순서 Claude, Codex, Zeta, Eta; mixedLabel 동일
test('mode line values', ...); // 4가지 상태
```

- [ ] **Step 2:** FAIL → **Step 3:** 구현 → **Step 4:** `node --test tests/node/derive-install-plan.test.mjs` → PASS
- [ ] **Step 5: STD-CLOSE** → **Step 6:** `feat(tui): 역할과 호스트에서 설치 모드를 도출하는 순수 함수 추가`

---

### Task 13: 도식 렌더러(역할 박스와 compact)

**AC:** AC-T3, AC-T4(렌더 단위)

**Files:**
- Create: `lib/tui/diagram.mjs`
- Test: `tests/node/tui-render.test.mjs`(추가)

**Interfaces (Produces):**
- `diagramRows(roleRows, {columns, rows, selectedRole, blink, blocked, footerRows, registry}) -> {mode:'full'|'compact'|'guard', rows}`
  - `roleRows`의 각 항목은 `{role:'Planner', platform, model, effort}`이고, `blocked`는 `Set<roleIndex>`입니다.
- 폭 공식은 `max(20, cells(label)+4, cells(platformLabel), cells(model), cells('effort: '+effort)) + 4`입니다. `label`은 역할명이며 차단 시 `' !'`를 붙입니다.
- 상단 테두리는 `┌─ <label> ─…┐`입니다. 내부 3줄은 플랫폼 라벨, 모델, `effort: X`입니다.
- blink가 꺼지면 테두리 문자만 공백으로 바꾸고 라벨은 유지합니다. 배치는 현행 3-위/2-아래와 Orchestrator 버스입니다.
- full 조건은 `columns ≥ boxWidth*3+7`, `rows ≥ 24`, `13 + footerRows + 5 ≤ rows`입니다.
- guard 조건은 `columns < 40 || rows < 16`입니다.
- compact 행은 `Planner: Claude / opus / medium`이며 차단 시 `Planner !: …`입니다. 자르기는 현행 `shorten` 규칙입니다.

- [ ] **Step 1: 테스트 작성**

```js
test('box shows role on top border and three inner lines', ...); // rows[0] includes '┌─ Scouter ─', rows[1..3] '│ Codex', '│ gpt-5.5', '│ effort: low'
test('blink keeps label visible', ...); // blink:false, selectedRole 1 → 'Planner' 문자열 유지, '┌' 없음
test('blocked role gets " !" after label', ...);
test('thresholds', ...); // boxWidth 24일 때 columns 79/rows 24/footerRows 6 → full; 78 → compact; rows 23 → compact; columns 39 또는 rows 15 → guard
test('wide characters and long models', ...); // model '모델-아주-긴-이름' → 각 행 cellWidth 합이 동일; compact에서 '…'
```

- [ ] **Step 2:** FAIL → **Step 3:** 구현 → **Step 4:** `node --test tests/node/tui-render.test.mjs` → PASS
- [ ] **Step 5: STD-CLOSE** → **Step 6:** `feat(tui): 역할명 테두리 라벨 도식 렌더러 추가`

---

### Task 14: 역할 편집기와 플랫폼 목록

**AC:** AC-T5, AC-T6(UI), AC-T9(플랫폼 목록 순서)

**Files:**
- Modify: `lib/tui/custom-preset.mjs`(신규 함수 추가. 기존 `editPlatformRoles`/`editCompositeRoles`는 Task 16에서 삭제)
- Test: `tests/node/tui-custom-preset.test.mjs`(추가)

**Interfaces (Produces):**
- `editRole({ui, roleName, current, availabilityOf, loadCatalog, defaultsFor, registry}) -> {platform, model, effort}|null`
  - `availabilityOf(id)`는 `platformAvailability` 결과를 돌려줍니다.
  - `defaultsFor(id, role)`는 `{model, effort}`를 돌려줍니다. 기본값 출처는 설치된 `models.toml`, 없으면 패키지 기본값입니다.
  - 행은 `Platform ‹ X ›`, `Model ‹ m ›`, `Effort ‹ e ›`, `Done`, `Back`입니다. `columns<40`이면 `Platform: X` 형태로 표시합니다.
  - ←/→: Platform은 선택 가능한 플랫폼만 순환하고, Model은 카탈로그 모델, Effort는 해당 모델의 effort를 순환합니다.
  - 플랫폼을 바꾸면 기본 쌍으로 재설정하고(카탈로그에 없으면 첫 쌍) 두 행에 `(reset)`을 표시합니다. 사용자가 그 필드를 바꾸면 표시를 지웁니다.
  - 모델을 바꿀 때 effort가 새 모델에 없으면 첫 effort로 바꾸고 `(reset)`을 표시합니다.
  - 현재 플랫폼이 Unavailable이면 `Codex - Unavailable (unauthorized)`로 표시합니다. 사유가 `catalog_error`가 아니면 Model/Effort 편집을 허용합니다.
  - Enter: Platform은 `selectPlatform`을, Model/Effort는 `selectCatalogPair`를 엽니다.
- `selectPlatform({ui, roleName, current, availabilityOf, registry}) -> id|null`
  - 제목은 `Platform — <Role>`이고, 순서는 고정된 표시 순서입니다.
  - Unavailable 행은 `<Label> - Unavailable  (<REASON_TEXT>)`이며 Enter로 선택되지 않습니다.
  - info에는 커서 행의 `reasonDetail`을 보여줍니다. 사유는 줄바꿈 없이 자릅니다.

- [ ] **Step 1: 테스트 작성(가짜 ui의 이벤트 스크립트)**

```js
test('left/right skips unavailable platforms', ...); // codex unauthorized(role) → ←/→가 Claude에서 멈춤
test('platform change resets to defaults and marks (reset)', ...);
test('model change resets missing effort', ...);
test('enter opens full lists', ...);
test('platform list order, unavailable format and info detail', ...); // rows ['Claude','Codex - Unavailable  (unauthorized)']; Enter on row 1 → 선택 안 됨; info에 reasonDetail
test('narrow editor omits arrows', ...);
```

- [ ] **Step 2:** FAIL → **Step 3:** 구현 → **Step 4:** `node --test tests/node/tui-custom-preset.test.mjs` → PASS
- [ ] **Step 5: STD-CLOSE** → **Step 6:** `feat(tui): 한 화면 역할 편집기와 플랫폼 가용성 목록 추가`

---

### Task 15: 설치 흐름 화면(도식, Hosts, Settings, Apply)

**AC:** AC-T2(unit), AC-T4(흐름 내 하단 행), AC-T7, AC-T10, AC-M3(TUI 확인), AC-M6(D1-f 차단)

**Files:**
- Modify: `lib/tui/setup.mjs`(신규 export 추가. 기존 `runSetup`은 Task 16에서 삭제)
- Test: `tests/node/tui-setup.test.mjs`(신규 케이스 추가)

**Interfaces (Produces):**
- `runInstallFlow({ui, statuses, draft, installState, currentConfig, prepare, loadRoleDefaults, loadCatalog, registry}) -> prepared|null`
  - 메뉴 행은 역할 5개, `Hosts`, `Settings`, `Apply`이고 `backRow`로 `Back`을 둡니다. 정보 줄은 `Hosts: …`, `Mode:  …`, `! <Role>: <Label> - Unavailable (<reason>)`(첫 사유 1줄, 없으면 생략)입니다.
  - 본문은 `diagramRows`를 쓰며 `refreshMs` 600입니다.
  - 초기값은 명세 7.3의 1–5입니다. standalone이 둘 다면 표시 순서 첫 플랫폼(Q4)입니다.
  - 카탈로그는 S 플랫폼만 미리 불러오고, 실패는 `catalog_error`로 처리합니다.
- `editHosts({ui, hosts, rolePlatforms, availabilityOf, registry}) -> string[]|null`
  - 제목은 `Hosts — CLIs you will work in`입니다. 행은 `[x] Claude`, `[x] Codex          (used by roles)`, Unavailable 행이며, 그다음 `Done`, `Back`입니다.
  - 역할이 쓰는 플랫폼은 체크된 채 잠깁니다. Unavailable 플랫폼은 새로 체크할 수 없고 해제는 허용합니다. 0개도 허용합니다.
- `editInstallSettings({ui, settings}) -> void`
  - 행은 `Language              ‹EN›`, `Total subagents       100`, `Concurrent subagents  (mixed)`, `Back`입니다. Global 행은 없습니다.
- `installSettingsDraft(statuses, platforms) -> {language, maxTotalSubagents, maxConcurrentSubagents, mixed:Set<key>, touched:Set<key>}`
- `installPrepareOptions(plan, draft, catalog) -> object`
  - D1-a: `{kind:'install', target:P, roles, verifiedCatalog, skipGlobal:false, …바뀌었거나 mixed가 아닌 설정}`
  - D1-b: D1-a에 `switchFromComposite:true`를 더합니다.
  - D1-c/d/e: `{kind:'install', target:'composite', platforms:S, config: buildRoleRoutingConfig(...), settings:{skipGlobal:false, …}}`
  - `(mixed)`인 필드는 사용자가 바꾸지 않았으면 전송하지 않습니다.
- Apply 동작:
  - 게이트에 실패하면 별도 페이지 없이 사유 줄을 강조해 다시 그립니다.
  - D1-f면 `Operation unavailable` 페이지(사유, `Residual path: …`, `No changes were applied.`)를 띄웁니다.
  - D1-b면 확인 메뉴를 띄웁니다. 제목 `Switch to <Label>`, info `Mixed routing will be turned off.`, 행 `Continue`/`Back`입니다.
  - 그 밖에는 바로 `prepare`합니다.

- [ ] **Step 1: 테스트 작성**

```js
test('diagram is the first screen', ...); // 첫 ui.menu 호출의 rows[0..4]가 역할, 플랫폼 picker 호출 없음
test('settings rows have no Global and skipGlobal is false', ...);
test('(mixed) field untouched is omitted, touched applies to S', ...);
test('hosts lock role platforms and preview Mode', ...); // 역할 전부 codex + host claude → Mode 'Mixed (Claude + Codex)', prepare options.platforms ['codex','claude']
test('D1-b asks confirmation; Back sends nothing', ...);
test('D1-f shows Operation unavailable', ...);
test('catalog failure outside S does not block Apply; inside S blocks with catalog error', ...); // Review Focus 3
test('initial platform is Claude when both standalone', ...); // Q4
test('compact layout keeps Hosts/Mode/controls', ...);
```

- [ ] **Step 2:** FAIL → **Step 3:** 구현 → **Step 4:** `node --test tests/node/tui-setup.test.mjs` → PASS(기존 케이스 포함)
- [ ] **Step 5: STD-CLOSE** → **Step 6:** `feat(tui): 도식 기반 설치 흐름과 Hosts, Settings 화면 추가`

---

### Task 16: app 연결, 홈 메뉴, 이전 흐름 삭제, PTY

**AC:** AC-T1, AC-T2(app, PTY), AC-T9(상태줄, PTY)

**Files:**
- Modify:
  - `lib/tui/app.mjs`(9, 55–59, 75–83행: action id 메뉴, `homeStatusLine`/`homeModeLine`, `runInstallFlow` 연결, `currentInstallState`)
  - `lib/tui/setup.mjs`(`runSetup`, `presetPreviewRows`, `setupOptions`, `editSettings`, 옛 `initialSettings`, `label` 삭제)
  - `lib/tui/custom-preset.mjs`(`editPlatformRoles`, `editCompositeRoles` 삭제)
  - `lib/tui/render.mjs`(`navigationHint` ←/→ 확장)
- Test: `tests/node/tui-app.test.mjs`, `tests/node/tui-app-pty.test.mjs`(33, 49, 166, 242행 부근), `tests/node/tui-setup.test.mjs`, `tests/node/tui-custom-preset.test.mjs`, `tests/node/tui-render.test.mjs`(98행). 옛 흐름 단언을 새 흐름으로 바꿉니다.

**Interfaces:**
- Consumes: Task 12의 helper, Task 15의 `runInstallFlow`, Task 9의 `currentInstallState`
- 홈 행은 `[{id:'install',label:'Install / Update'},{id:'version',label:'Check Version'},{id:'uninstall',label:'Uninstall'},{id:'exit',label:'Exit'}]`이고, 분기는 id로 합니다.
- info 순서는 상태줄, `Mode: …`, 진단 줄입니다.

- [ ] **Step 1: 테스트를 새 기대값으로 수정**

```js
test('home menu is exactly four actions', ...); // rows deepEqual ['Install / Update','Check Version','Uninstall','Exit']
test('status line lists each platform and Mode line', ...); // composite일 때도 'Claude: Available / Codex: Unauthorized', 'Mode: Mixed (Claude + Codex)'
test('install goes straight to diagram', ...);
// PTY: Install / Update Enter 직후 화면에 '┌─ Scouter' 와 'Mode:' 표시, 'Change Models' 부재
```

- [ ] **Step 2:** FAIL 확인 → **Step 3:** 구현과 삭제 → **Step 4:** `node --test tests/node/tui-*.test.mjs tests/node/cli-pty.test.mjs` → PASS
- [ ] **Step 5: STD-CLOSE** → **Step 6:** `feat(tui): 홈 메뉴를 action id 기반으로 바꾸고 도식 흐름 연결`

**수용 전 QA:** fresh QA가 PTY(`tui-app-pty`, `tui-terminal-pty`, `cli-pty`)를 실제 실행하고 화면 캡처 증거를 냅니다.

---

### Task 17: Check Version, Uninstall, 결과 문구

**AC:** AC-T8, AC-T9(Uninstall 순서)

**Files:**
- Modify: `lib/tui/app.mjs`(`resultRows`, `execute`, `uninstall`, Check Version 분기)
- Test: `tests/node/tui-app.test.mjs`(72, 97, 101–104, 124–127, 190, 217행 부근), `tests/node/tui-app-pty.test.mjs`, `tests/node/uninstall-pty.test.mjs`(필요 시)

**Interfaces:**
- Check Version:
  - 최신: info `Up to date (<v>)`, 행 `Back`
  - 업그레이드 가능: info `<cur> → <latest>`, 행 `Upgrade`, `Back`
  - 조회 실패: info `<cur> (latest unavailable)`과 오류 1줄
  - 성공 결과: `Upgraded to <latest>.`
- Uninstall:
  - 행은 표시 순서 라벨, `Everything (incl. CLI)`, `Back`입니다.
  - 미설치 플랫폼은 `<Label>  (not installed)`이며 선택되지 않습니다.
  - 확인 메뉴는 `Remove`/`Back`이고 info 문구는 Global Constraints 그대로입니다. composite 참여 플랫폼이면 `Mixed routing will be turned off.`를 더합니다.
- `resultRows`:
  - 단일 제거 성공 `Removed from <Label>.`
  - Everything에서 CLI 제거 `Removed ARC and CLI.`, CLI가 원래 없었으면 `Removed ARC.`
  - composite 해제 문구는 앞에 오며 management 메시지 순서를 그대로 씁니다.
  - 실패 시 `Error:`, 중복 제거한 `Residual path:`, `Exit code: N`을 유지합니다.

- [ ] **Step 1: 테스트 작성과 수정**

```js
test('uninstall rows follow display order and mark not installed', ...);
test('result wording', () => { assert.deepEqual(resultRows({code:0,results:[{platform:'codex',status:'uninstalled'}]}),['Removed from Codex.']); /* Everything removed/absent, composite turned off 앞 배치, 실패 유지 */ });
test('check version states', ...); // 3가지와 'Upgraded to 0.3.6.'
```

- [ ] **Step 2:** FAIL → **Step 3:** 구현 → **Step 4:** `node --test tests/node/tui-app.test.mjs tests/node/tui-app-pty.test.mjs tests/node/uninstall-pty.test.mjs tests/node/uninstall-cli.test.mjs` → PASS
- [ ] **Step 5: STD-CLOSE** → **Step 6:** `feat(tui): 버전 확인과 제거 화면, 결과 문구 단축`

**수용 전 QA:** fresh QA가 PTY 실행과 실패 결과 화면(Residual, Exit code)을 확인합니다.

---

### Task 18: 하드코딩 잔존 검사와 coverage 마무리

**AC:** AC-P1(금지 패턴, adapter coverage, fixture import 금지)

**Files:**
- Modify: `tests/node/platform-registry.test.mjs`
- 이 검사로 드러난 잔존 위치의 최소 수정(허용 목록 밖에 한함)

**검사 정의:**
- 대상은 `lib/**/*.mjs`와 `shared/skill/runtime/**/*.mjs`이며 줄 단위로 검사합니다.
  - P1 `/\[\s*(['"])(codex|claude)\1\s*,\s*(['"])(codex|claude)\3\s*\]/`
  - P2 `/\{\s*['"]?(codex|claude)['"]?\s*:[^{}\n]*,\s*['"]?(codex|claude)['"]?\s*:/`
  - P3 `/===\s*['"]codex['"]\s*\?\s*['"]toml['"]\s*:\s*['"]md['"]/`
- 허용 목록:
  - `lib/runtime/platform-registry.mjs`, `lib/platforms/**`, `lib/watch/**`, `lib/runtime/adapters/**`, `lib/runtime/capabilities.mjs`, `lib/runtime/role-bridge-args.mjs`, `lib/runtime/role-supervisor.mjs`, `lib/runtime/local-cli.mjs`
  - 위 runtime 파일들의 `shared/skill/runtime/` 미러(가정 A-3)
- adapter coverage: `capabilities.install`이 verified인 id마다 `lib/runtime/adapters/<id>.mjs`가 있고 capabilities 맵에 키가 있어야 합니다.
- fixture import 금지: `lib/**`, `shared/**`, `bin/**`, `scripts/**`에 `fixtures/platforms` 문자열이 없어야 합니다.

- [ ] **Step 1:** 테스트를 추가하고 실행 → 잔존이 있으면 FAIL 목록을 기록합니다.
- [ ] **Step 2:** 남은 줄을 레지스트리 조회로 바꿉니다. 대상이 허용 목록 밖의 뜻밖의 파일이고 의미가 바뀌는 수정이 필요하면 hold합니다.
- [ ] **Step 3:** `node --test tests/node/platform-registry.test.mjs` → PASS
- [ ] **Step 4: STD-CLOSE** → **Step 5:** `test(platforms): 플랫폼 하드코딩 잔존 검사와 coverage 추가`

---

### Task 19: 문서

**AC:** AC-P2(문서, MANIFEST 일관성). 명세 11장을 반영합니다.

**Files (Modify):** `README.md`(Change Models 삭제, 도식, Hosts, Mode 도출, Settings(Global 삭제), Uninstall 목록과 결과 문구, 혼합 라벨), `docs/harness-operation.md`(S와 anchor 정의, 저장 위치를 "anchor home(Codex가 참여하면 Codex home)"으로 일반화)

**금지:** `*/skill/references/coordination.md`와 `instruction-contracts.json`은 바꾸지 않습니다.

- [ ] **Step 1:** 문서 수정
- [ ] **Step 2:** `rg -n "Change Models|Global config" README.md docs/harness-operation.md` 결과가 없어야 합니다. `node --test tests/node/package*.test.mjs tests/node/composite-instructions.test.mjs` → PASS
- [ ] **Step 3: STD-CLOSE** → **Step 4:** `docs(readme): 도식 기반 설치 흐름과 참여 집합 anchor 설명 반영`

---

## AC 커버리지

| AC | 작업 |
|---|---|
| T1 | 16 |
| T2 | 15, 16 |
| T3 | 13 |
| T4 | 13, 15 |
| T5 | 14 |
| T6 | 2, 14 |
| T7 | 15 |
| T8 | 17 |
| T9 | 12, 14, 16, 17 |
| T10 | 12, 15 |
| M1 | 12 |
| M2 | 9 |
| M3 | 9, 15 |
| M4 | 8, 9 |
| M5 | 9, 10 |
| M6 | 7, 15 |
| M7 | 6, 7, 8, 9, 11 + 최종 |
| M8 | 10 |
| M9 | 11 |
| M10 | 6 |
| P1 | 1, 2, 5, 18 |
| P2 | 1, 19, 모든 작업의 STD-CLOSE, 최종 |
| C1 | 9 |
| C2 | 3, 9 |

## 최종 전체 검증(모든 작업 수용 후, 작업 선행 조건 아님)

1. `npm test` 전부 PASS
2. `npm run check:manifest`
3. `npm run check:role-policy`(생성물 무변경, `git diff --exit-code lib/policy codex/agents claude/agents`)
4. `node scripts/update-runtime-assets.mjs --check`
5. `node scripts/check-installer-parity.mjs`
6. `tests/node/fixtures/installed-layout-golden.json` diff가 `platform-registry.mjs` 경로 추가뿐인지 확인. `instruction-contracts.json`은 무변경
7. `git diff 56eb566 -- '*/skill/references/coordination.md' lib/watch lib/policy/role-policy.json` 결과가 비어 있어야 함
8. fresh QA: PTY 3종을 실제 실행하고, 기존 Codex+Claude composite fixture로 Install / Update(D1-d)를 실행해 v1 바이트와 codex lock/store를 확인
9. 그 뒤 독립 **최종 Reviewer 1회**가 전체 변경(`56eb566..HEAD`)을 검토합니다. 중점은 composite 회귀, anchor 이동 트랜잭션, runtime import 제약, 레지스트리 일관성, TUI 문구입니다. Reviewer 지적은 Implementer → Reviewer 재확인으로 처리하고, 해결 후 후속 커밋 하나로 묶습니다.

## 위험

| 위험 | 완화 |
|---|---|
| composite 회귀 | Task 7–11 수용 전 QA, 기존 테스트 기대값 변경은 문구 줄만 허용 |
| zeta payload helper 비용(정책 렌더 의존) | Task 7 hold 조건, Orchestrator 보고 |
| ESM 순환 import | leaf 모듈 규칙과 Task 2 정적 테스트 |
| TUI 대규모 테스트 수정이 60분을 넘김 | 15(추가만)와 16(연결과 삭제)을 분리, 17 별도 |
| 직렬화로 인한 총 소요 | 작업당 범위를 좁게 유지. 실패는 DAG 후속만 hold |

---

## 근거 위치

- 명세: `/Users/yunho/Desktop/project/arc/.claude/worktrees/tui-arc-diagram-flow/docs/superpowers/specs/2026-11-15-tui-arc-diagram-flow-design.md`
- 직렬화 근거:
  - `MANIFEST.sha256` 62–128행에 `lib/installer/targets.mjs`, `lib/management/operations.mjs`, `lib/runtime/role-routing.mjs`, `lib/tui/*.mjs`가 포함됨
  - `tests/node/management-operations.test.mjs:28`, `upgrade-harness.test.mjs:77`이 `verifyPayload(sourceRoot)`를 사용
- runtime 미러 규칙: `scripts/update-runtime-assets.mjs:16-18`. canonical 모듈 목록과 `RUNTIME_MODULE_PATHS`가 정확히 일치해야 함
- composite 현행 구조:
  - `lib/installer/install-mode.mjs:21-34`
  - `lib/installer/role-routing.mjs:20-22,87,99-105`(bridge만 막는 publish 규칙)
  - `lib/management/operations.mjs:35-117`
  - `lib/runtime/role-routing.mjs:65-226`, `lib/runtime/role-bridge.mjs:16-27`
- TUI 현행: `lib/tui/setup.mjs`(전체), `lib/tui/app.mjs:9-85`. `menu`의 `onHorizontal`과 `refreshMs`가 이미 있음(app.mjs:14,31)
- 문구 테스트 위치: `tests/node/install-mode.test.mjs:39-40`, `install-mode-switch.test.mjs:23,26`, `install-mode-review-followup.test.mjs:17`
- inventory: `.git/arc/workflows/tui-menu-revamp/inventory/lib.txt`

## 열린 질문(Orchestrator 판단 필요, 제품 결정 아님)

- **Q-A:** `lib/npm/context.mjs:14`와 `lib/installer/upgrade-state.mjs:13`의 상대 `CODEX_HOME` 사전 검사는 그대로 둡니다. 명세 5.2/5.3에 해당 descriptor 필드가 없고, 일반화하면 오류 문구가 바뀝니다. 금지 패턴에도 걸리지 않습니다. 명세 5.6의 "상대 home 규칙 → R"과 어긋나는데, 수용 가능한지 판단이 필요합니다.
- **Q-B:** 직렬 실행(19단계)을 그대로 둘지 결정이 필요합니다. 병렬로 가려면 "MANIFEST 재생성 전담" 같은 계획 변경이 필요합니다.
- **Q-C:** 새 진단 문구 세 개를 계획에서 고정했습니다(명세 16장이 빌더에게 맡긴 범위로 봤습니다). 그대로 둘지 판단이 필요합니다.
  - `Mixed routing requires at least two platforms`
  - `Unknown platform: <id>`
  - `Active dispatches block moving mixed routing; finish or cancel them first`
- **Q-D:** composite `kind:'preset'`의 기존 오류 `Both ARC installations are required to change composite settings`는 기존 테스트 호환을 위해 문구를 유지했습니다.

## 가정

- **A-1:** 테스트 레지스트리 주입은 `context.platforms`/`context.runtimePlatforms`로 합니다. context가 없는 순수 함수는 마지막 인자 `{runtimePlatforms}`로 받습니다.
- **A-2:** zeta의 `auth.kind`는 `'none'`입니다. 그래야 Phase A 운영에서 일어나지 않는 `auth_unverified` 경로도 함께 검증할 수 있습니다.
- **A-3:** 금지 패턴 허용 목록에 해당 lib 파일의 `shared/skill/runtime` 미러를 포함합니다. 미러는 lib 파일과 같은 내용이므로 논리적으로 따라오는 결과입니다.
- **A-4:** 새 runtime 모듈은 `platform-registry.mjs` 하나입니다. anchor 로직은 기존 `role-routing.mjs`에 둡니다.


## Orchestrator 판단 (2026-11-15)

- **Q-A 수용:** `lib/npm/context.mjs:14`와 `lib/installer/upgrade-state.mjs:13`의 상대 `CODEX_HOME` 사전 검사는 기존 오류 문구를 유지하기 위해 그대로 둡니다. 명세 5.6 "상대 home 규칙 → R"에서 이 두 사전 검사만 예외로 기록합니다. 금지 패턴에는 걸리지 않습니다.
- **Q-B 수용:** 19개 작업을 직렬로 실행합니다. 실패 시에는 논리 DAG의 후속 작업만 hold합니다.
- **Q-C 수용:** 진단 문구 세 개를 계획대로 고정합니다(명세 16장의 빌더 재량 범위).
- **Q-D 수용:** composite `kind:'preset'`의 기존 오류 문구를 유지합니다.
- **최종 Reviewer 지적 처리:** ARC 규칙에 따라 수정은 재확인이 끝날 때까지 커밋하지 않고, 해결된 뒤 커밋 하나로 묶습니다.

## 계획 개정 기록

- **개정 1 (2026-11-15, 사용자 승인):** 작업 1 Implementer가 범위 충돌 두 건을 보고했습니다(dispatch `c18ccc25`, 변경 없음).
  - `tests/node/runtime-assets.test.mjs`를 작업 1의 수정 파일에 추가합니다. 고정 `expectedPaths` 목록이 신규 runtime 모듈을 포함해야 하기 때문입니다.
  - 작업 1의 golden 허용 차이를 "신규 경로 추가 + 수정된 runtime 파일(`bootstrap.mjs`, `local-cli.mjs`)의 해시 갱신"으로 명확히 합니다.
- **사전 위임 규칙 (2026-11-15, 사용자 승인):** 작업의 필수 검사(focused check, STD-CLOSE)를 통과시키기 위해 함께 바뀌어야 하는 테스트, fixture, 생성물을 그 작업의 수정 범위에 추가하는 개정은 Orchestrator가 이 절에 기록하고 바로 진행합니다. 동작, 수용 기준, 제품 범위가 바뀌는 개정은 매번 사용자 승인을 받습니다.
- **개정 2 (2026-11-15, 사용자 승인, 작업 4 착수 후):** 작업 4 Implementer(dispatch `17dfbae7`)가 순환 import를 보고했습니다.
  - 순환: `config → platforms → formats/toml → profiles → config`. `lib/models/config.mjs`가 설치기 descriptor의 `effortField`를 읽으면 생깁니다. `config.mjs`는 순환 금지 모듈(`profiles.mjs`, `runtime-config.mjs`, `global-config.mjs`)이 모두 쓰는 최하층 모듈입니다.
  - 결정: `models.effortField`를 runtime descriptor(명세 5.2)에 추가합니다. 설치기 descriptor는 그 값을 따릅니다. `config.mjs`는 runtime 레지스트리만 씁니다. `config.mjs`를 순환 금지 목록에 넣습니다.
  - 작업 4의 Files, Step 1, Step 4를 이에 맞춥니다. runtime 변경이 생기므로 STD-CLOSE 1단계를 적용합니다.
  - 작업 4 착수 시점의 RED 테스트 3개는 미커밋 상태로 유지합니다.
- **개정 3 (2026-11-15, 사용자 승인, 작업 7 착수 후):** 작업 7 Implementer(dispatch `47d81b73`, 변경 없음)가 zeta 패키지의 `verifyPayload` 실패를 보고했습니다(`Invalid template set`).
  - 원인: `lib/prompts/render.mjs`는 템플릿을 codex/claude 10개로 고정합니다. `lib/models/config.mjs`의 모델 설정 검증은 기본 레지스트리만 씁니다. 두 곳 모두 명세 5.6 목록에 없었지만, 작업 7–10의 |S|=3 테스트에 필요합니다(명세 13장 helper 비용 위험이 실제로 나타남).
  - 결정: 두 곳과 standalone 설치 경로가 주입 레지스트리를 받도록 작업 7 범위를 넓힙니다. 기본 레지스트리에서는 동작과 문구가 그대로입니다. 설치기 descriptor에 선택 필드 `agentTemplates.expectationsFrom`을 추가합니다(명세 5.3).
  - 정정: `models.toml`에는 platform 필드가 없습니다. helper는 이 파일을 그대로 복사하고, 임시 MANIFEST는 `renderManifest(files,{platforms})`로 다시 씁니다.
  - 작업 7의 Files, helper 범위, Step 1, Step 4를 이에 맞춥니다.

## 작업 진행 기록

- **작업 1 (2026-11-15 수용):**
  - 사전 위임 규칙에 따라 `tests/node/runtime-versions.test.mjs`를 수정 범위에 추가했습니다. 이 작업의 focused check가 `expectedModules`와 `baselineHash`에 신규 runtime 모듈을 포함하도록 요구하기 때문입니다.
  - 환경 준비: 워크트리에 ignore된 `build/native`와 `node_modules`를 원래 체크아웃에서 복사했습니다(native 소스는 56eb566 이후 변경 없음).
  - 검증: focused check 32 pass / 0 fail. golden 차이는 신규 항목 8개와 해시 갱신 16개뿐입니다. runtime-assets `--check`, `check:manifest`, `check:role-policy` 통과. fresh QA(dispatch `e692d820`) Q1–Q6 모두 proven, finding 없음.
  - 전체 `npm test`: 현재 1955 pass / 38 fail / 18 skip, 기준 HEAD 스냅샷 1941 pass / 45 fail / 18 skip. 현재 실패는 모두 기준에도 있는 기존 실패입니다(신규 0건). 기존 실패는 Phase A 범위 밖이며 최종 보고에서 따로 다룹니다.
- **작업 2 (2026-11-15 수용):**
  - Implementer dispatch `0e33a808`(재개 1회). 범위 추가 없음.
  - 검증: RED 7 pass / 11 fail → focused check 45 pass / 1 fail. 실패 1건(`Codex existing root field edits preserve indentation, comments and nested fields`)은 같은 단언으로 실패하는 기존 실패입니다. runtime-assets `--check`, `check:manifest`(228), `check:role-policy` 통과.
  - 전체 `npm test`(Orchestrator 환경): 1966 pass / 38 fail / 18 skip. 실패 목록이 작업 1 직후와 같습니다(신규 0건). Implementer 샌드박스의 추가 실패 69건은 loopback `listen`과 `.git` 쓰기 금지 등 샌드박스 제약 때문입니다.
  - 계획상 필수 QA 대상이 아니라 Orchestrator가 위 증거로 수용했습니다.
- **작업 3 (2026-11-15 수용):**
  - 범위 추가(사용자 승인, 2026-11-15): `lib/installer/target-errors.mjs`(신규 leaf 모듈)와 `lib/platforms/formats/{toml,markdown}.mjs`(import 한 줄씩).
    - 이유: `targets.mjs → lib/platforms → formats → targets.mjs` 순환 import를 없애기 위해서입니다.
    - 조치: `TargetConfigurationError`를 leaf로 옮기고 `targets.mjs`가 re-export합니다.
  - Implementer:
    - dispatch `081ea5e2`: 구현 후 순환을 보고했습니다.
    - dispatch `75c4371e`: 허용 경로가 바뀌어 교체했습니다. 순환을 없앴습니다.
    - 두 dispatch 모두 `refsChanged`로 기록됐지만, 같은 시각 다른 세션의 ref 변경(`911f115`, `master` → `d2a09f2`) 때문입니다. changedPaths는 0건입니다.
  - 검증:
    - targets: RED → 13 pass / 0 fail.
    - Step 4 테스트군: 282 pass / 8 fail. 실패 8건은 모두 기존 실패인 `… preserves public rendering baseline`입니다.
    - parity: 236 IDs / 739 assertions.
    - runtime-assets `--check`, `check:manifest`, `check:role-policy` 통과.
  - 전체 `npm test`(Orchestrator 환경): 2027 tests, 1970 pass / 39 fail / 18 skip.
    - 38건은 기존 실패 목록과 같습니다.
    - 1건(`runtime-cli.test.mjs` "workflow CLI initializes records…")은 환경 원인입니다. 공통 `index`를 비교하는데 다른 세션이 동시에 Git 작업을 했습니다. 단독 재실행은 12/0입니다.
  - fresh QA(dispatch `f1d83bf7`, 재확인 1회) Q1–Q7 모두 proven, finding 없음.
    - 정적 import 그래프에 순환이 0개입니다.
    - 렌더링 실패 8건은 기준 커밋 `57675db`에서도 같은 assertion 출력으로 실패합니다.
- **작업 4 (2026-11-15 수용):**
  - 개정 2(사용자 승인)에 따라 진행했습니다.
    - `models.effortField`를 runtime descriptor로 옮겼습니다. 설치기 descriptor와 zeta fixture는 runtime 값을 따릅니다.
    - `config.mjs`는 runtime 레지스트리만 씁니다.
  - Implementer:
    - dispatch `17dfbae7`: RED 테스트 3개만 추가하고 순환을 보고했습니다.
    - dispatch `2a040c81`: 개정 2 이후 새로 배정했습니다. 사전 위임 규칙의 해시 갱신(golden의 `platform-registry.mjs` 8곳, `runtime-versions` baselineHash)만 범위에 추가했습니다.
    - 두 dispatch 모두 `refsChanged`로 기록됐지만 다른 세션의 ref 변경·fetch 때문입니다. changedPaths는 0건입니다.
  - 검증:
    - focused(runtime 해시 테스트 포함): 145 pass / 1 fail. 실패 1건은 기존 실패 `Codex existing root field edits…`입니다.
    - runtime-assets `--check` 33 files, `check:manifest` 229, `check:role-policy` 24 targets(생성물 무변경), parity 236 IDs 통과.
    - 정적 import 그래프에서 신규 순환은 0개입니다. 순환 금지 모듈은 `lib/platforms/**`에 직접·간접 모두 도달하지 않습니다.
  - 전체 `npm test`(Orchestrator 환경): 2031 tests, 1975 pass / 38 fail / 18 skip. 실패 목록이 기존 목록과 정확히 같습니다(신규 0건).
  - 의도된 동작 차이(계획 Interfaces), 최종 Reviewer 확인 대상:
    - `assertCompositeCatalogRoles`는 역할 플랫폼의 카탈로그가 없을 때 "unavailable for role" 오류를 냅니다.
    - `collectStatus`의 mode는 `resolveTargets`의 해석된 대상만으로 판정합니다.
  - 계획상 필수 QA 대상이 아니라 Orchestrator가 위 증거로 수용했습니다.
- **작업 5 (2026-11-15 수용):**
  - Implementer dispatch `705231cf`. 사전 위임 규칙에 따라 해시 갱신만 범위에 추가했습니다.
    - golden: 변경된 runtime 파일 8개 × 8곳
    - `runtime-versions` baselineHash
  - dispatch의 `refsChanged`는 다른 세션의 워크트리 브랜치 생성(`fix/watch-worktree-scope`) 때문입니다. changedPaths는 0건입니다.
  - 검증(Orchestrator 환경):
    - focused(runtime 해시 테스트 포함): 192 pass / 0 fail.
    - runtime-assets `--check` 33 files, `check:manifest` 229, `check:role-policy` 24 targets(생성물 무변경), parity 236 IDs 통과.
    - Implementer 보고: 신규 import 순환 0개, `lib/runtime/**`의 금지 경로 도달 0건.
  - 전체 `npm test`: 2034 tests, 1978 pass / 38 fail / 18 skip. 실패 목록이 기존 목록과 같습니다(신규 0건).
    - Implementer 샌드박스의 추가 실패(`ps`/`listen` EPERM 등)는 환경 제약입니다.
  - 최종 Reviewer 확인 대상: `role-routing.mjs`의 `authenticate`는 `auth.kind:'none'`을 `authenticated`로 처리합니다. 현재 등록된 플랫폼에는 해당하지 않고 테스트 fixture zeta에만 적용됩니다.
  - 계획상 필수 QA 대상이 아니라 Orchestrator가 위 증거로 수용했습니다.
