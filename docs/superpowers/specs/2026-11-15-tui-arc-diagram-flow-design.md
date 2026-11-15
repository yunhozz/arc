# TUI ARC 도식 흐름 및 플랫폼 레지스트리 — Phase A 설계 명세

- 작성일: 2026-11-15
- 작업 대상: 브랜치 `feat/tui-arc-diagram-flow`, 기준 `56eb566` (master v0.3.5)
- 상위 결정: 승인된 설계 기록(`.git/arc/workflows/tui-menu-revamp/approved-design.md`)의 D-Arch, D-Anchor, D-Display, D-Host, D1-a..f, D-Auth-Unknown, D-Unauthorized, D-Phase, D-Unverified, D-Watch, D-GeminiEffort, D-Compat. 이 결정들은 모두 구속력이 있습니다.
- 범위: Phase A. 다음 세 가지로 이루어집니다.
  - 플랫폼 레지스트리와 어댑터. 실제 등록은 codex, claude만 합니다.
  - N-플랫폼 composite 일반화
  - TUI 개편 R1–R4, R6, R7, 표시 순서, 호스트 선택
- Phase B(Gemini)와 Phase C(Grok)는 별도 명세로 다룹니다. 이 문서는 두 단계가 꽂힐 확장 지점만 정의합니다.

## 1. 의도

현재 ARC는 "Codex와 Claude 두 설치본"이라는 전제가 설치기, runtime, TUI 전반에 하드코딩되어 있습니다. 예를 들어 `['codex','claude']` 리터럴, `platform==='codex'?'toml':'md'` 분기, 활성 composite 설정을 Codex home에 고정한 것 등이 있습니다. 또한 TUI 설치 흐름은 "플랫폼 선택 → 편집기" 2단계라서 사용자가 혼합 배치를 직관적으로 만들기 어렵습니다.

Phase A의 목표는 두 가지입니다.

1. 플랫폼 식별을 레지스트리 조회로 바꾸고 composite를 임의의 참여 집합 S로 일반화하여, Phase B와 C에서 descriptor만 추가하면 되는 구조를 만듭니다.
2. TUI를 "도식 하나에서 역할·호스트를 고르면 모드가 자동으로 도출되는" 흐름으로 바꿉니다.

기존 Codex+Claude 사용자는 마이그레이션 없이 그대로 동작해야 합니다.

## 2. 목표, 비목표, 반목표

**목표**

- G1 설치기 레지스트리 `lib/platforms/*`와 runtime 레지스트리 `lib/runtime/platform-registry.mjs`를 둡니다. runtime 쪽은 `shared/skill/runtime/`으로 동기화됩니다. 등록 플랫폼은 codex, claude입니다.
- G2 composite의 참여 집합 S, anchor home, 설치 모드 판정, lock, lease store를 N-플랫폼으로 일반화합니다.
- G3 TUI 요구사항을 반영합니다.
  - R1: 홈의 `Change Models`를 삭제합니다.
  - R2: `Install / Update`에서 곧바로 도식으로 진입합니다.
  - R3: 역할 박스 형식을 새로 정합니다.
  - R4: 역할 편집기를 개편하고 Unavailable 표시를 추가합니다.
  - R6: Settings의 Global 행을 삭제합니다.
  - R7: 결과 문구를 짧게 합니다.
  - 이 밖에 Hosts 다중 선택, Mode 미리보기, Claude > Codex 표시 순서를 반영합니다.
- G4 기존 golden, parity, MANIFEST, role-policy 생성물이 회귀하지 않아야 합니다(의도된 추가만 허용).

**비목표 (Phase A 범위 밖)**

- Gemini/Grok descriptor 등록, 설치 자산, 인증 probe, 카탈로그, bridge 실행(Phase B/C)
- `arc watch`의 신규 플랫폼 지원(D-Watch)
- dispatch lease 스키마 v2(`targetPlatform`)와 watch의 anchor 탐색(Phase B 확장 지점, 12장)
- skill 문서(`*/skill/references/coordination.md`)의 composite 용어(`Claude & Codex`) 변경. 그 문구는 instruction 계약 fixture에 고정되어 있으며, Phase A 운영 의미는 바뀌지 않습니다.

**반목표 (하지 말아야 할 것)**

- 기존 composite의 경로, 파일 형식, lock 위치, dispatch store 위치를 바꾸거나 이동시키지 않습니다.
- management API의 `kind:'preset'`, `skipGlobal`, `target: codex|claude|all|composite`를 제거하거나 의미를 바꾸지 않습니다.
- 등록되지 않은 플랫폼을 UI에 자리표시자로 보여주지 않습니다(15장 판단 P-1).

## 3. 제약

- `lib/runtime/*`는 `scripts/update-runtime-assets.mjs`로 `shared/skill/runtime/*`에 미러되고 사용자 home에 설치됩니다. 따라서 runtime 레지스트리는 `lib/models`, `lib/installer`, `lib/platforms`를 import할 수 없습니다. 반대 방향인 설치기 → runtime import는 허용되며 이미 쓰이고 있습니다.
- 새 runtime 모듈을 추가하면 아래 다섯 가지를 함께 갱신해야 합니다.
  - `lib/installer/runtime-assets.mjs`의 `RUNTIME_MODULE_PATHS`
  - `lib/runtime/bootstrap.mjs`의 `COOPERATIVE_RUNTIME_MODULES`. runtime hash 입력이므로 기존 composite는 업그레이드 후 Install / Update를 다시 해야 합니다. 이는 현행 정책 문구와 같습니다.
  - `MANIFEST.sha256`(`npm run check:manifest`)
  - `tests/node/fixtures/installed-layout-golden.json`
  - runtime-assets 동기화(`--check`)
- `lib/policy/role-policy.json`의 내용은 바꾸지 않습니다. `npm run check:role-policy`가 생성물 무변경으로 통과해야 합니다.
- 기존 Codex+Claude composite는 anchor=codex입니다. 아래 경로를 모두 그대로 유지합니다(D-Anchor, AC-M7).
  - 활성 설정 `<CODEX_HOME>/arc-role-platform-routing.json`(v1)
  - marker `arc-role-platform-routing.prepared.json`
  - lock `<CODEX_HOME>/arc-role-platform-routing.lock`
  - store `<CODEX_HOME>/arc-role-dispatch/`

## 4. 접근 방식

설계 단계에서 비교한 방식은 다음 세 가지였습니다.

1. 레지스트리와 어댑터 — 승인됨, D-Arch
2. 플랫폼별 분기를 유지한 채 신규 플랫폼을 분기에 추가
3. 플러그인형 외부 패키지

사용자는 1을 골랐습니다. 하드코딩 식별을 한곳에 모아 Phase B/C의 변경 면적을 descriptor 추가로 줄이고, 이중 레지스트리 불일치는 일관성 테스트로 막는 방식입니다. 2는 분기가 4배로 늘어나고, 3은 설치 runtime의 import 제약과 무결성(MANIFEST) 모델과 충돌합니다.

## 5. 아키텍처

### 5.1 이중 레지스트리 구조

```
lib/runtime/platform-registry.mjs   (runtime 쪽 원천, shared/skill/runtime로 미러)
        ▲ import
lib/platforms/index.mjs             (설치기 쪽: runtime descriptor를 id로 가져와 설치 전용 필드 확장)
lib/platforms/codex.mjs, claude.mjs
```

- 플랫폼 id 집합, 내부 anchor 순서, 표시 순서, home 해석, 프로필 확장자와 이름 규칙, 실행 환경 id는 runtime 레지스트리 하나가 원천입니다. 설치기 레지스트리는 이를 import해 재사용하므로 두 곳에서 중복 정의하지 않습니다.
- 설치기 레지스트리는 runtime에 없는 필드만 추가합니다. 설치 자산, 카탈로그, 모델 설정 필드, runtime config 병합, 제거 요약이 여기에 해당합니다.
- 일관성 테스트(AC-P1)는 두 레지스트리의 id 집합과 순서가 같은지, 그리고 각 설치기 descriptor가 같은 id의 runtime descriptor를 참조하는지 확인합니다.

### 5.2 runtime descriptor 스키마

필드 이름은 확정입니다. 구현 세부는 Implementer가 정합니다.

| 필드 | 형식 | codex | claude |
|---|---|---|---|
| `id` | string | `codex` | `claude` |
| `label` | string | `Codex` | `Claude` |
| `displayOrder` | int | 1 | 0 |
| `anchorOrder` | int | 0 | 1 |
| `home.env` | string | `CODEX_HOME` | `CLAUDE_CONFIG_DIR` |
| `home.resolve(ctx)` | fn → abs path, 실패 시 throw | 현행 `resolveConfigHome('codex')` 규칙(상대 경로는 cwd 기준) | 현행 규칙(기본 `~/.claude`만 허용) |
| `cli.command` | string | `codex` | `claude` |
| `cli.supportedVersions` | `null` 또는 semver range | `null`(제한 없음) | `null` |
| `auth.kind` | `'codex-refresh'`/`'cli-status-json'`/`'none'` | `codex-refresh` (`local` probe 지원) | `cli-status-json` |
| `profile.ext` | `'toml'`/`'md'` | `toml` | `md` |
| `profile.standaloneName(role)` | fn | `arc_<suffix>` | `arc-<suffix>` |
| `profile.routingName(role)` | fn | `arc_routing_<suffix>` | `arc-routing-<suffix>` |
| `models.effortField` | string | `model_reasoning_effort` | `effort` |
| `executionEnvironments` | string[] | `codex-cli`, `codex-desktop` | `claude-cli`, `claude-desktop` |
| `routing.validatePair(model, effort)` | fn → bool | 비어 있지 않은 텍스트 | 현행 정규식 + `low/medium/high/xhigh/max` |
| `capabilities` | 5.4 참조 | 모두 `verified` | 모두 `verified` |

export 항목:

- `RUNTIME_PLATFORMS`: anchor 순서로 동결된 배열
- `platformIds()`, `getPlatform(id)`, `byDisplayOrder()`, `byAnchorOrder()`, `isPlatformId(v)`
- `createPlatformRegistry(descriptors)`: 테스트 주입용, 5.5 참조

### 5.3 설치기 descriptor 스키마 (`lib/platforms/<id>.mjs`)

| 필드 | codex | claude |
|---|---|---|
| `runtime` | runtime descriptor 참조 | 〃 |
| `payloadPrefix` | `codex` | `claude` |
| `instructionFile` | `AGENTS.md` | `CLAUDE.md` |
| `runtimeConfigFile` | `config.toml` | `settings.json` |
| `globalPaths` | 위 두 파일 | 위 두 파일 |
| `models.effortField` | runtime `models.effortField`와 같은 값(runtime descriptor에서 가져옴) | 〃 |
| `models.staticCatalog` | `lib/models/codex-models.json` | `lib/models/claude-models.json` |
| `models.discover` | `app-server` 경로 | Anthropic Models API 경로 |
| `profiles.render(text, role, setting)` | TOML 렌더러 | frontmatter 렌더러 |
| `profiles.isOwnedStandalone(bytes, role)` | 현행 TOML 규칙 | 현행 frontmatter 규칙 |
| `profiles.renameForRouting(text, role, revision)` | 현행 | 현행 |
| `runtimeConfig.readConcurrency`/`renderConcurrency` | TOML `agents` 키 | `env` 키 |
| `runtimeConfig.extraRender` | wait 설정(`renderWaitSettings`) | 없음 |
| `uninstallSummary` | 현행 Codex 문구 | 현행 Claude 문구 |
| `isolationEnv(work)` | `{CODEX_HOME: …}` (acquisition) | `{}` |
| `agentTemplates.expectationsFrom` (선택, 개정 3) | 없음(자기 기대값) | 없음(자기 기대값) |

`agentTemplates.expectationsFrom`은 테스트 주입 플랫폼용입니다. 값은 기본 플랫폼 id이며, 그 플랫폼 템플릿의 fragment 마커 기대값을 같은 역할 이름에 적용합니다(zeta fixture는 `'claude'`). 기본 레지스트리에서는 쓰지 않습니다.

### 5.4 Capability 모델과 가용성 판정

- `capabilities` 키는 `install`, `standalone`, `compositeRole`, `compositeHost`, `bridge`, `nativeProfile`, `authProbe`, `catalog`, `watch`입니다.
  - 각 값은 `{state:'verified'|'off', reason?:string}`입니다.
  - 기본값은 `off`입니다(D-Unverified). Phase A의 codex와 claude는 모두 `verified`입니다.
  - `watch`는 descriptor 필드만 둡니다. watch 코드는 Phase A에서 바꾸지 않습니다.
- 가용성 판정 함수 `platformAvailability(id, {status, catalog, usage})`는 순수 함수입니다.
  - 입력: `usage ∈ {'role','host','standalone'}`
  - 반환: `{selectable:boolean, reason:null|ReasonCode, warning:null|'auth_unverified'}`
- ReasonCode와 표시 문구는 아래 표와 같습니다. **우선순위**는 위에서 아래 순서이며 첫 해당 사유 하나만 씁니다.

| ReasonCode | 표시 | 조건 |
|---|---|---|
| `capability_not_verified` | `capability not verified` | usage에 필요한 capability가 `off` |
| `not_installed` | `not installed` | CLI 미발견(`cli_not_found`) |
| `unsupported_version` | `unsupported version` | `supportedVersions` 밖 |
| `unauthorized` | `unauthorized` | 인증 probe가 `unauthorized` |
| `auth_check_failed` [신규, Q1 확정] | `auth check failed` | probe가 가능한 플랫폼(`auth.kind≠'none'`)에서 probe 결과가 `unknown` |
| `catalog_error` | `catalog error` | 카탈로그가 ready가 아니거나 비어 있음 |

- `auth.kind==='none'`인 플랫폼은 Phase B/C에만 있습니다(D-Auth-Unknown). 이 경우 unknown이라도 선택할 수 있으며 `warning:'auth_unverified'`를 붙입니다.
- usage별 게이트:
  - `role`/`host`(composite 참여): 표의 모든 조건을 봅니다. 필요한 capability는 각각 `compositeRole`/`compositeHost`입니다.
  - `standalone`(|S|=1): `capability_not_verified`(`install`, `standalone`)와 `catalog_error`만 봅니다. CLI 존재와 인증은 요구하지 않습니다. 현행 "인증 없이 standalone 설치 허용"과 같습니다(D-Unauthorized).

### 5.5 테스트 레지스트리 주입

- 레지스트리를 쓰는 모든 함수는 `context.platforms`(설치기)나 `context.runtimePlatforms`(runtime)를 받을 수 있고, 없으면 기본 레지스트리를 씁니다.
- 테스트 전용 가짜 플랫폼은 `tests/node/fixtures/platforms/`에 둡니다. 예: id `zeta`, anchorOrder 2, displayOrder 2, claude 형식 프로필, home env `ZETA_HOME`. 운영 코드는 이 디렉터리를 import하지 않으며, 이를 asset check로 확인합니다.
- 이 장치로 Phase A 운영에서 일어나지 않는 D1-c(|S|=3), D1-e, anchor 이동, v2 설정, M8을 검증합니다.

### 5.6 하드코딩 컴포넌트 그룹별 이전

출처는 inventory/{lib,shared,codex,claude,tests,docs}.txt입니다. "→ R"은 레지스트리 조회로 바꾼다는 뜻입니다.

| 그룹 | 대표 위치 | Phase A 처리 |
|---|---|---|
| 설치 대상과 경로 | `installer/targets.mjs:7-8`, `npm/context.mjs:14`, `installer/upgrade-state.mjs:13-15`, `installer/acquisition.mjs:15` | home, 프로필 확장자, instruction/runtime config 경로, 상대 home 규칙 → R |
| 설치 자산과 매니페스트 | `installer/manifest.mjs:42-59`, `installer/skill-sources.mjs:6`, `installer/superpowers.mjs:11` | 플랫폼 반복 → R(`payloadPrefix`), `DYNAMIC_ROOTS` = R ids + `shared` |
| 설치·계획·순서 | `installer/install.mjs:5`, `installer/plan.mjs:49-50`, `installer/runtime-config.mjs:22-23`, `installer/uninstall.mjs:23` | 설치 순서 = anchorOrder, 제거 순서 = displayOrder(현행과 동일), 병합과 요약 → descriptor |
| 모델 | `models/config.mjs:9-14`, `models/static-catalog.mjs:5-35`, `models/catalog.mjs:22-41`, `models/profiles.mjs:30-107`, `models/codex-catalog.mjs` | 플랫폼 검증과 effortField → runtime 레지스트리(`lib/models/config.mjs`는 `lib/platforms/**`를 import하지 않음), 카탈로그 URL과 discover → descriptor, 렌더러 선택 → descriptor |
| 프롬프트·모델 검증(개정 3) | `prompts/render.mjs:198-201`(`validateAgentTemplates`), `models/config.mjs`(`platformOf`, `effortField`, `validateRoles`, `loadModelConfig`), `models/profiles.mjs`(`renderProfiles`) | 주입 레지스트리를 선택 인자로 받습니다. 템플릿 집합은 설치기 레지스트리의 `payloadPrefix`와 profile 이름으로 구성합니다. 기본 레지스트리에서는 동작과 오류 문구가 그대로입니다. standalone 설치 경로가 context의 레지스트리를 전달합니다. |
| 관리와 상태 | `management/operations.mjs:35-117`, `management/status.mjs:12-22` | 6장에 따라 S 기반으로 일반화. `collectStatus`는 R 순회, 인증은 `auth.kind`로 결정(`codexCheck` 옵션 이름 유지) |
| composite 설치기 | `installer/install-mode.mjs`, `installer/role-routing.mjs` | 6장 전체 |
| runtime 라우팅 | `runtime/role-routing.mjs:65-200`, `runtime/role-routing-config.mjs:4-5`, `runtime/role-dispatch-store.mjs:16-25`, `runtime/role-bridge.mjs:16-27`, `runtime/role-dispatch-policy.mjs:12,74-82` | host/env 허용값 → R, anchor 탐색은 6.9, 설정 v1/v2 파싱, `profileName` → R. bridge 대상 도출은 2-플랫폼 규칙을 함수로 캡슐화(12장) |
| runtime bridge 실행 | `runtime/role-bridge-args.mjs`, `runtime/role-supervisor.mjs` | 플랫폼별 인자·stream·관찰 함수는 해당 모듈에 남깁니다. `Map<id, impl>` 조회로 바꾸고, `bridge` capability가 verified인 id마다 impl이 있는지 coverage 테스트로 확인합니다. 미등록 플랫폼은 `unknown platform`으로 hold |
| cooperative runtime(hook) | `runtime/schema.mjs:14-75`, `runtime/identity.mjs:34`, `runtime/capabilities.mjs:3-4`, `runtime/adapters/*.mjs` | 플랫폼 열거 검증 → `isPlatformId`. 플랫폼별 adapter와 capability 맵은 그대로 두고 coverage 테스트만 추가 |
| 정책 생성 | `policy/render.mjs:18-37` | `controls` 키 검증과 `POLICY_TARGETS` → R. `role-policy.json` 내용과 생성물은 무변경 |
| TUI | `tui/app.mjs`, `tui/setup.mjs`, `tui/custom-preset.mjs`, `tui/render.mjs` | 7장에 따라 재작성. 라벨과 순서 → R |
| watch | `watch/*` | Phase A는 변경하지 않습니다(D-Watch). 허용 목록에 명시 |
| 미러 | `shared/skill/runtime/*` | 손으로 고치지 않고 `update-runtime-assets.mjs`로 동기화 |
| 플랫폼 skill 자산 | `codex/skill/*`, `claude/skill/*` | 변경하지 않습니다 |

**하드코딩 잔존 검사 (AC-P1).** `lib/**/*.mjs`와 `shared/skill/runtime/**/*.mjs`에서 다음 패턴을 금지하는 asset check 테스트를 추가합니다.

- 플랫폼 집합 열거 리터럴: `['codex','claude']`, `['claude','codex']`, `{codex:…,claude:…}` 형태의 라벨·순서 맵
- 확장자 삼항: `==='codex'?'toml':'md'`

허용 목록은 `lib/runtime/platform-registry.mjs`, `lib/platforms/**`, `lib/watch/**`, `lib/runtime/adapters/**`, `lib/runtime/capabilities.mjs`, `lib/runtime/role-bridge-args.mjs`, `lib/runtime/role-supervisor.mjs`, `lib/runtime/local-cli.mjs`(플랫폼별 probe 구현), `lib/models/*-models.json`입니다.

## 6. Composite 일반화

### 6.1 용어

- **S(참여 집합)** = 역할 플랫폼 ∪ 호스트 플랫폼(D-Host). S의 모든 플랫폼에는 ARC가 설치되고 marker가 기록됩니다.
- **anchor** = S 중 `anchorOrder`가 가장 작은 플랫폼입니다(codex > claude > gemini > grok). **anchor home**에는 활성 설정, lock, dispatch store를 둡니다.

### 6.2 활성 설정 스키마

- **v1**(현행): `{version:1, revision, roles}`이며 S={codex, claude}를 함축합니다.
- **v2**[신규]: `{version:2, revision, platforms:[...], roles}`
  - `platforms`는 중복 없이 길이 2 이상이고, 모두 등록된 id이며, anchorOrder로 정렬되어 있습니다.
  - 모든 `roles[*].platform`이 `platforms`에 속해야 합니다.
- **기록 규칙:** S가 정확히 {codex, claude}이면 v1, 아니면 v2로 기록합니다. 따라서 Phase A 운영에서는 항상 v1이며, 기존 바이트 형식과 다운그레이드 호환이 유지됩니다.
- **파서:** `parseRoleRoutingConfig`는 v1과 v2를 모두 받습니다. 반환값에 `platforms`를 포함하며, v1이면 `['codex','claude']`를 채웁니다.
- **경로:** `<anchor home>/arc-role-platform-routing.json`(파일 이름 불변)

### 6.3 marker

형식은 바꾸지 않습니다(`version:1`, 키 8개). 각 P∈S의 home에 `arc-role-platform-routing.prepared.json`을 둡니다.

- `activeConfigPath`는 anchor home의 활성 설정 경로입니다.
- `profiles`는 `roles[*].platform===P`인 역할만 담습니다. 호스트 전용이면 `{}`입니다.

### 6.4 설치 모드 판정 (`readInstallMode`, 순수 판정 + 스냅샷)

1. 등록된 각 플랫폼 P의 home을 해석합니다. 해석에 실패한 P는 후보에서 빼고 `unresolved`로 기록합니다.
2. 해석된 각 home에서 활성 설정 후보, marker, `agents/arc-routing-*` 프로필을 스냅샷으로 읽습니다.
3. 활성 설정이 0개인 경우:
   - routing 파일(marker나 routing 프로필)이 하나라도 있으면 `unverified`이며 해당 파일들을 residual로 보고합니다.
   - 하나도 없으면 `standalone`입니다. 각 home의 standalone/미설치 여부는 status가 보고합니다.
4. 활성 설정이 2개 이상이면 `unverified`입니다(모두 residual).
5. 활성 설정이 정확히 1개(home A)인 경우:
   - 파싱 → S를 얻습니다.
   - 다음 조건을 모두 검증합니다.
     - A가 home(min(S))와 같다.
     - S의 모든 P가 해석된다(`unresolved`이면 `unverified`).
     - 각 P의 marker와 프로필이 현행 `inspectCompositeRemoval` 규칙과 일치한다(activeConfigPath, revision, configHash, profiles, 해시).
     - S 밖 home에는 marker나 routing 프로필이 없다(있으면 residual).
     - S 내 home끼리 경로가 겹치지 않는다.
   - 모두 통과하면 `{mode:'composite', platforms:S, anchor, config}`, 하나라도 실패하면 `unverified`입니다.
6. 반환: `{mode, platforms, anchor, homes, config, residualPaths}`. `homes`는 플랫폼별 상태입니다.
7. S 밖 home의 standalone/미설치 상태는 composite 판정에 영향을 주지 않습니다(D1 install mode 규칙).
8. **행동 변화:** 현재는 Claude home 해석이 실패하면(예: 비기본 `CLAUDE_CONFIG_DIR`) 전체 모드가 실패합니다. 일반화 후에는 S 밖 플랫폼의 해석 실패는 무시됩니다. 이는 완화 방향의 변화이며 테스트로 고정합니다.

### 6.5 도출 규칙 실행 (D1-a..f)

TUI의 순수 함수 `deriveInstallPlan({roles, hosts, current})`가 아래 결과 중 하나와 미리보기 문구를 돌려줍니다. 실제 실행은 management API가 맡습니다.

| 규칙 | 조건 | management 호출 | 동작 |
|---|---|---|---|
| D1-a | S={P}, 현재 standalone/미설치 | `{kind:'install', target:P, roles, …settings}` | P만 설치/갱신. 다른 home은 건드리지 않음 |
| D1-b | S={P}, 현재 composite(S') | `{kind:'install', target:P, switchFromComposite:true, …}` | 확인 `Mixed routing will be turned off.` → 현행 switch(S' 각각 standalone 복원) → P 설치 |
| D1-c | \|S\|≥2, 현재 standalone/미설치 | `{kind:'install', target:'composite', platforms:S, config, settings}` | S 각각 설치(anchorOrder 순) → anchor=min(S)에 publish |
| D1-d | \|S\|≥2, composite(S'), S=S' | 위와 동일 | 같은 anchor에 재publish(현행) |
| D1-e | \|S\|≥2, composite(S'), S≠S' | 위와 동일 | 한 트랜잭션에서 S'\S의 routing 파일 제거와 standalone 프로필 복원, S\S' 설치, anchor 변경 시 6.6 절차 |
| D1-f | 현재 unverified | 호출하지 않음 | Apply 차단, residual 경로 표시(현행 `Operation unavailable` 페이지) |

- **D1-e의 S'\S 처리:** routing 파일만 제거하고 standalone 프로필을 복원합니다. 그 home의 ARC 설치 자체는 유지합니다(D1-a의 "건드리지 않음"과 같은 취지).
- **composite 게이트:** prepare와 execute 양쪽에서 S 각 P에 5.4의 role/host 게이트를 다시 확인합니다. 이는 현행 `assertCompositeAvailability`를 일반화한 것이며, 인증 unknown은 `auth.kind==='none'`인 경우에만 통과합니다.

### 6.6 anchor 이동 (D1-e, min(S)≠min(S'))

1. 6.7 순서로 old anchor와 new anchor의 lock을 모두 획득합니다.
2. **두 store 모두에 non-terminal lease가 없어야 합니다.** 범위는 Q2 확정에 따라 route와 무관하게 non-terminal lease 전부입니다. 하나라도 있으면 `activation:'held'`, `activeDispatches`를 채우고 파일을 바꾸지 않습니다(AC-M8).
3. 하나의 `applyTransaction`으로 다음을 수행합니다.
   - new anchor에 활성 설정을 기록합니다.
   - S 모든 home의 marker를 재기록합니다(새 `activeConfigPath`).
   - S'\S의 routing 파일을 제거합니다.
   - old anchor의 활성 설정을 제거합니다(old anchor가 S에 남는 경우 포함).
4. old anchor의 `arc-role-dispatch/`는 이동하거나 삭제하지 않습니다. 남아 있는 terminal lease는 기존 보존 기간 규칙을 따릅니다. 이동 후 resume 대상이 아님을 결과 문구 `Dispatch history stays in <old home>/arc-role-dispatch.`로 알립니다.
5. lock은 역순으로 해제합니다. 해제 검증에 실패하면 해당 lock 경로를 residual로 보고합니다(현행 규칙의 일반화).

### 6.7 lock 순서

- 단일 anchor 작업(publish, deactivation, 제거, runtime 명령)은 anchor home의 `arc-role-platform-routing.lock` 하나만 획득합니다.
- 여러 home의 lock이 필요한 작업(anchor 이동)은 대상 home들을 **anchorOrder 오름차순**으로 획득하고 역순으로 해제합니다.
- runtime은 현재 anchor의 lock 하나만 잡으므로 교착이 생기지 않습니다. 6.9의 재검증으로 경합을 처리합니다.

### 6.8 lease store

- 위치는 `<anchor home>/arc-role-dispatch/`이며 `dispatchDirectory(anchorHome)`으로 얻습니다.
- 기존 composite는 anchor=codex이므로 경로가 변하지 않습니다.
- lease 스키마(v1, `hostPlatform`)는 Phase A에서 바꾸지 않습니다. `hostPlatform` 허용값만 `isPlatformId`로 바꿉니다.

### 6.9 runtime 쪽 anchor 탐색

대상: `routingStatus`, `prepareRoleDispatch`, bridge run/observe/resume/cancel

1. host descriptor로 host home을 해석합니다.
2. host marker를 읽어 `activeConfigPath`를 얻습니다. marker가 없거나 형식이 맞지 않으면 `activation_unverified`입니다.
3. 그 경로의 디렉터리를 anchor home으로 보고 lock을 획득합니다(`withRoutingLock(anchorHome)`).
4. lock 안에서 다음 순서로 진행합니다.
   - 활성 설정을 읽어 S를 얻습니다.
   - anchor home이 home(min(S))인지, host가 S에 속하는지 확인합니다.
   - S 전체 marker를 검증합니다(`readActivation` 일반화).
   - host marker가 여전히 같은 anchor를 가리키는지 다시 확인합니다.
   - 하나라도 어긋나면 `activation_unverified`입니다.
5. 플랫폼별 인증과 버전 보고는 `S ∩ (host ∪ 역할 플랫폼)`만 순회합니다(현행 필터의 일반화).
6. host가 S 밖이면 2단계에서 marker가 없으므로 `activation_unverified`입니다.

### 6.10 실패와 잔여물

- 현행 의미를 유지합니다.
  - rollback이 `restored`이면 `activation:'held'`, 그렇지 않으면 `unknown`입니다.
  - residual 경로를 보고합니다.
  - lock 해제 실패 시 lock 경로를 residual에 추가합니다.
- N-플랫폼 확장분:
  - residual 수집은 S ∪ S'의 모든 home을 대상으로 합니다.
  - 여러 home에 걸친 트랜잭션이 부분 실패하면 각 home의 경로를 플랫폼 라벨 없이 절대 경로로 보고합니다.
- D1-c에서 설치 단계가 일부 실패하면 publish하지 않고 `activation:'held'`로 끝냅니다(현행). 이미 설치된 standalone은 남습니다. 이후 Install / Update를 다시 하면 D1-c로 재진입합니다.

### 6.11 management API

- `prepareOperation`의 `target:'composite'` 옵션에 `platforms?: string[]`를 추가합니다.
  - 생략 시: 현재 composite면 그 S, 아니면 `['codex','claude']`입니다(AC-C1).
  - 역할 플랫폼은 `platforms`에 자동으로 합쳐집니다.
- `target:'all'`은 등록된 전체 플랫폼으로 확장됩니다. Phase A에서는 현행 집합과 같습니다.
- `kind:'preset'`(standalone과 composite 모두), `skipGlobal`, `switchFromComposite`는 그대로 유지합니다(D-Compat). TUI는 더 이상 `preset`과 `skipGlobal:true`를 보내지 않습니다.
- 메시지 문구:

| 현행 | 신규 |
|---|---|
| `Claude & Codex activated.` | `Mixed (<표시순 라벨 + 연결>) activated.` |
| `Claude & Codex turned off.` | `Mixed routing turned off.` |
| `Claude & Codex is active; confirm the switch first` | `Mixed routing is active; confirm the switch first` |
| `Claude & Codex configuration cannot be verified.` | `Mixed routing configuration cannot be verified.` |

`After upgrading ARC, run Install / Update again.`는 유지합니다.

## 7. TUI 명세

### 7.1 공통

- **키:** ↑/↓ 이동, Enter 선택, Esc 홈(홈에서는 종료), ←/→ 값 순환(해당 화면에만), Ctrl+C 중단. 현행 `navigationHint`를 확장합니다.
- **표시 라벨과 순서:** `Claude`, `Codex` 순서이며, 이후 단계에서 `Gemini`, `Grok`이 이어집니다(D-Display). 화면에는 등록된 플랫폼만 나옵니다.
- **혼합 표기:** `Mixed (Claude + Codex)`처럼 표시 순서로 `+`로 연결합니다.
- **메뉴 분기:** 행 인덱스가 아니라 action id(`install`, `version`, `uninstall`, `exit`)로 합니다.

### 7.2 홈

```
  ARC  v0.3.5
  Claude: Available / Codex: Unauthorized
  Mode: Mixed (Claude + Codex)
  Codex: <diagnostic …>

> Install / Update
  Check Version
  Uninstall
  Exit
```

- **상태줄:** `<라벨>: <상태>`를 ` / `로 연결합니다. 상태 어휘는 현행 `Available / Not Available / Unauthorized / Incomplete`를 유지합니다(`status-labels`).
  - 현행의 "composite면 `Claude & Codex: Available` 한 줄로 축약" 규칙은 없앱니다. 모드는 `Mode:` 줄이 맡습니다.
- **`Mode:` 값:**

| 상태 | 표시 |
|---|---|
| composite | `Mixed (Claude + Codex)` |
| standalone 설치가 1개 이상 | 표시 순서로 `Claude` 또는 `Claude, Codex` |
| 설치 없음 | `Not installed` |
| unverified | `Unverified` |

- 진단 줄은 현행을 유지합니다.

### 7.3 도식 (Install / Update 진입 즉시)

```
┌─ Scouter ──────────┐  ┌─ Planner ──────────┐  ┌─ Implementer ──────┐
│ Codex              │  │ Claude             │  │ Codex              │
│ gpt-5.5            │  │ opus               │  │ gpt-5.5            │
│ effort: low        │  │ effort: medium     │  │ effort: high       │
└─────────┬──────────┘  └─────────┬──────────┘  └─────────┬──────────┘
          └───────────────────────┼───────────────────────┘
                             Orchestrator
                      ┌───────────┼───────────┐
           ┌─ QA ───────────────┐  ┌─ Reviewer ! ───────┐
           │ Codex              │  │ Codex              │
           │ gpt-5.5            │  │ gpt-5.5            │
           │ effort: medium     │  │ effort: high       │
           └────────────────────┘  └────────────────────┘

  Hosts: Claude, Codex
  Mode:  Mixed (Claude + Codex)
  ! Reviewer: Codex - Unavailable (unauthorized)
> Settings
  Apply
  Back
```

- **역할 박스:**
  - 역할명은 상단 테두리 라벨 `┌─ <Role> ─…┐`입니다.
  - 내부 3줄은 플랫폼 라벨, 모델, `effort: <effort>`입니다(R3).
  - 선택된 박스는 600ms 주기로 테두리만 깜빡이며 라벨은 항상 보입니다.
  - 해당 박스가 현재 도출 모드의 게이트를 통과하지 못하면 라벨 뒤에 ` !`를 붙입니다(5.4).
- **박스 폭:** `max(20, 라벨폭+4, 플랫폼폭, 모델폭, 'effort: '+effort 폭) + 4`입니다. 배치는 현행 3-위/2-아래와 Orchestrator 버스입니다.
- **선택 행 순서:** 역할 5개(Scouter, Planner, Implementer, QA, Reviewer), `Hosts`, `Settings`, `Apply`, `Back`. ↑/↓로 순환합니다.
  - `Mode:` 줄과 `!` 사유 줄은 선택할 수 없는 정보 줄입니다.
  - 사유 줄은 첫 차단 사유 1줄만 보여주며, 없으면 줄을 생략합니다.
- **Enter 동작:** 역할 → 7.5 편집기, Hosts → 7.4, Settings → 7.7, Apply → 7.8, Back → 홈.
- **초기 값** (판단 P-2):
  1. 세션 draft가 있으면 그것을 씁니다.
  2. 현재 composite면 그 설정의 역할과 hosts=S를 씁니다.
  3. standalone 설치가 있으면 표시 순서 첫 설치 플랫폼 P를 고르고, 역할은 P의 설치된 `models.toml`, hosts는 {P}입니다.
  4. 설치가 없으면 표시 순서상 role 게이트를 통과하는 첫 플랫폼을 고르고, 없으면 첫 등록 플랫폼(Claude)을 씁니다. 역할은 패키지 기본값, hosts는 {P}입니다.
  5. unverified면 도식을 열되 `Mode:  Unverified`를 표시하고 Apply를 D1-f로 차단합니다.
- **카탈로그:** 도식 진입 시 S에 쓰이는 플랫폼의 카탈로그만 미리 불러옵니다. 그 밖의 플랫폼은 편집기에서 선택할 때 불러옵니다. 실패는 `catalog error` 사유로 처리합니다. 현행처럼 `Catalog unavailable` 페이지로 막지 않습니다.

### 7.4 Hosts (다중 선택)

```
  Hosts — CLIs you will work in

  [x] Claude
  [x] Codex          (used by roles)
  [ ] …              - Unavailable  (not installed)
> Done
  Back
```

- 등록 플랫폼을 표시 순서로 나열합니다. Enter는 체크 상태를 토글하고, `Done`은 반영 후 돌아가며, `Back`은 취소합니다.
- 역할이 쓰는 플랫폼은 반드시 S에 들어가므로 체크된 채 잠기고 `(used by roles)`를 표시합니다(판단 P-3).
- Unavailable 플랫폼은 새로 체크할 수 없습니다. 이미 체크된 것을 해제하는 것은 허용합니다. 커서가 놓이면 info에 사유 전문을 보여줍니다.
- `auth_unverified` 경고가 있는 플랫폼은 `(auth unverified)`를 덧붙입니다. Phase A에는 해당이 없습니다.
- 체크된 호스트가 0개가 되는 것은 허용합니다. 이 경우 S는 역할 플랫폼과 같습니다.
- 도식의 `Hosts:` 줄은 S 중 호스트로 체크된 것을 표시 순서로 보여줍니다.

### 7.5 역할 편집기 (한 화면)

```
  Planner

> Platform   ‹ Claude ›
  Model      ‹ opus ›           (reset)
  Effort     ‹ medium ›         (reset)

  Done
  Back
```

- 행은 Platform, Model, Effort, Done, Back입니다.
- **←/→:** 해당 필드 값을 순환합니다.
  - Platform은 선택 가능한 플랫폼만 순환합니다(Unavailable 건너뜀).
  - Model은 그 플랫폼 카탈로그의 모델을 순환합니다.
  - Effort는 선택된 모델에서 쓸 수 있는 effort를 순환합니다.
- **Enter:** Platform/Model/Effort 행에서는 전체 목록을 엽니다. Platform 목록은 7.6, Model과 Effort 목록은 현행 `selectCatalogPair`의 목록 화면과 상세 pager를 재사용합니다. Done은 draft에 반영하고 도식으로 돌아가며, Back은 이 역할의 변경을 버립니다.
- **플랫폼을 바꿀 때:** model/effort를 새 플랫폼의 그 역할 기본값으로 재설정합니다. 기본값은 설치된 `models.toml`, 없으면 패키지 `models.toml`입니다. 두 줄에 `(reset)`을 표시하며, 사용자가 해당 필드를 바꾸면 표시를 지웁니다.
  - 기본 쌍이 카탈로그에 없으면 카탈로그 첫 쌍을 쓰고 `(reset)`을 표시합니다.
- **모델을 바꿀 때:** 현재 effort가 새 모델에 없으면 그 모델의 첫 effort로 바꾸고 `(reset)`을 표시합니다.
- **현재 플랫폼이 Unavailable인 경우:** 플랫폼 행에 `Codex - Unavailable (unauthorized)`를 표시합니다.
  - 사유가 `catalog_error`가 아니면 모델과 effort 편집은 허용합니다(standalone 유지 시나리오).
  - Apply 가능 여부는 7.8의 도출 게이트가 결정합니다.

### 7.6 플랫폼 목록 (Enter on Platform)

```
  Platform — Planner

> Claude
  Codex - Unavailable  (unauthorized)
  Back

  Codex: Codex CLI is not authenticated. Run `codex login`.
```

- 고정 표시 순서를 따르며, 사용 가능한 플랫폼을 앞으로 당기지 않습니다(D-Display).
- Unavailable 행은 `<Label> - Unavailable  (<사유>)` 형식이며 Enter를 눌러도 선택되지 않습니다.
- 커서가 놓이면 info에 사유 전문을 표시합니다. 전문은 ReasonCode별 고정 문구 + 진단 메시지(있으면)입니다.
- 사유 5종과 [신규] 1종은 5.4 표를 따릅니다.

### 7.7 Settings

```
  Settings

> Language              ‹EN›
  Total subagents       100
  Concurrent subagents  (mixed)
  Back
```

- Global 행은 없습니다(R6). TUI가 만드는 모든 prepare 옵션에서 `skipGlobal`은 `false`입니다.
- Language는 ←/→로 EN↔KR을 순환하며, Enter도 순환합니다.
- Total/Concurrent는 Enter로 기존 텍스트 입력과 검증(`parsePositiveLimit`)을 거칩니다.
- **값 표시:** S의 설치된 값이 플랫폼마다 다르면 `(mixed)`로 표시합니다.
  - `(mixed)` 필드를 사용자가 바꾸지 않으면 그 필드는 prepare에 보내지 않으며, 각 플랫폼이 자기 값을 유지합니다(판단 P-4).
  - 사용자가 바꾸면 S 전체에 적용합니다.
  - 미설치 플랫폼은 현행 기본값(`en`, 100, 5)으로 계산합니다.

### 7.8 Apply 흐름

1. 게이트를 검사합니다. 실패가 있으면 Apply는 아무것도 하지 않고, 사유 줄을 강조하여 다시 그립니다. 별도 페이지는 띄우지 않습니다.
2. D1-f면 `Operation unavailable` 페이지에 사유, `Residual path: …`, `No changes were applied.`를 보여줍니다(현행).
3. D1-b면 확인 메뉴를 띄웁니다.
   - 제목 `Switch to <Label>`, info `Mixed routing will be turned off.`, 행 `Continue` / `Back`
4. 그 밖의 경우는 확인 없이 prepare → execute를 진행합니다. D1-e도 확인을 띄우지 않으며, `Mode:` 줄이 새 S를 미리 보여줍니다(판단 P-5).

### 7.9 Check Version

- 최신이면 info `Up to date (0.3.5)`이고 행은 `Back`만 있습니다.
- 업그레이드할 수 있으면 info `0.3.5 → 0.3.6`이고 행은 `Upgrade`, `Back`입니다.
- 업그레이드 성공 시 결과는 `Upgraded to 0.3.6.`입니다. 현행 `Upgrade completed!`를 대체합니다.
- 최신 버전 조회에 실패하면 info는 `0.3.5 (latest unavailable)`과 오류 1줄입니다(판단 P-7).

### 7.10 Uninstall

```
  Uninstall

> Claude
  Codex
  Everything (incl. CLI)
  Back
```

- 행은 등록 플랫폼을 표시 순서로 나열한 뒤 `Everything (incl. CLI)`, `Back`입니다.
- ARC가 설치되지 않은 플랫폼은 `<Label>  (not installed)`로 표시하며 선택되지 않습니다.
- **확인 메뉴:** 행 `Remove` / `Back`. info는 다음과 같습니다.
  - 단일 플랫폼: `Remove ARC from <Label>?`
  - Everything: `Remove ARC from all platforms and the arc CLI?`
  - composite 참여 플랫폼을 선택한 경우 `Mixed routing will be turned off.`를 추가합니다.
- **Everything + composite:** 현행처럼 switch 없이 제거 계획에 anchor의 활성 경로를 넘깁니다(`compositeActivePath` = anchor home). lock은 anchor home에서 잡습니다.

### 7.11 결과 문구

| 상황 | 문구 |
|---|---|
| 단일 제거 성공 | `Removed from Codex.` |
| Everything, CLI 제거 | `Removed ARC and CLI.` |
| Everything, CLI가 원래 없음 | `Removed ARC.` |
| composite 해제 동반 | `Mixed routing turned off.` (위 문구 앞) |
| 업그레이드 성공 | `Upgraded to <version>.` |
| 설치 | 현행 `ARC installed for <Label>.`, composite면 `Mixed (…) activated.` 추가 |
| 실패 공통 | `Error: <메시지 1줄>`, `Residual path: …`(중복 제거), `Exit code: N` 유지 |

### 7.12 좁은 화면

- **전체 도식 조건:** `columns ≥ 박스폭*3+4+3`이고 `rows ≥ 24`(현행 임계값)이면서, 도식 + 하단 행(Hosts, Mode, 사유, Settings, Apply, Back) + 여백이 rows 안에 들어가야 합니다.
- **compact 표시:** 위 조건을 만족하지 못하면 역할마다 한 줄 `Planner: Claude / opus / medium`으로 표시합니다. 차단된 역할은 `Planner !: …`로 씁니다.
  - 그 아래에 `Hosts: …`, `Mode: …`, 사유 줄, 컨트롤을 둡니다.
  - 긴 값은 현행 `shorten` 규칙(`…`)으로 자릅니다.
- **더 좁을 때:** `columns < 40` 또는 `rows < 16`이면 현행 `viewportGuard`를 씁니다.
- **역할 편집기:** `columns < 40`이면 `‹ ›`를 생략하고 `Platform: Claude` 형태로 표시합니다.
- **플랫폼 목록:** 사유는 줄바꿈 없이 자르고, 전문은 info에 둡니다.

## 8. 데이터와 설정 호환

- **기존 standalone:** home 경로, `skills/arc/models.toml`, `settings.toml`, `agents/arc-*` 프로필, global 블록을 그대로 둡니다. Install / Update는 제자리 갱신입니다.
- **기존 Codex+Claude composite:** v1 설정, marker, lock, store 경로와 형식을 바꾸지 않습니다(AC-M7).
  - 패키지 업그레이드로 runtime hash가 바뀌면 현행처럼 Install / Update를 다시 할 때까지 runtime이 `activation_unverified`를 냅니다.
  - 재publish는 D1-d이며 v1을 그대로 기록합니다.
- **CLI 표면과 management API:** 인자와 옵션을 바꾸지 않습니다(AC-C1). `preset-cli`, `uninstall-cli`, `all-targets` 테스트가 계속 통과해야 합니다.
- **`skipGlobal`:** 비TUI 호출 경로의 의미는 바꾸지 않습니다. TUI에서는 항상 `false`입니다(D-Compat).

## 9. 수용 기준

ID는 설계 기록의 것을 유지합니다. [신규]는 이 명세에서 추가한 ID입니다.

| ID | 기준 | 검증 |
|---|---|---|
| AC-T1 | 홈 메뉴가 정확히 `Install / Update`, `Check Version`, `Uninstall`, `Exit`이고 `Change Models`가 없다. 분기는 action id 기반이며 `Mode:` 줄이 7.2 규칙을 따른다 | unit `tui-app`, PTY `tui-app-pty` |
| AC-T2 | `Install / Update` 진입 시 플랫폼/모드 선택 화면 없이 도식이 첫 화면이다 | unit `tui-app`/`tui-setup`, PTY |
| AC-T3 | 역할 박스가 상단 테두리에 역할명, 내부에 플랫폼/모델/`effort: X` 3줄을 보인다. 깜빡일 때 라벨이 유지되고 `!`가 라벨에 붙는다 | unit `tui-render`/`tui-setup` 스냅샷 |
| AC-T4 | 좁은 화면에서 compact `Planner: Claude / opus / medium`과 하단 행을 보이고, 40x16 미만이면 guard를 보인다 | unit `tui-setup`, `tui-terminal` |
| AC-T5 | 역할 편집기가 한 화면에서 ←/→로 바꾸고 Enter로 전체 목록을 연다. 플랫폼을 바꾸면 기본값으로 재설정되고 `(reset)`이 보인다. ←/→는 Unavailable을 건너뛴다 | unit `tui-custom-preset` |
| AC-T6 | 플랫폼 목록이 고정 순서이고 Unavailable 행이 `- Unavailable  (사유)` 형식이며 선택되지 않는다. 커서를 두면 사유 전문이 보인다. ReasonCode → 문구 매핑과 우선순위가 5.4와 같다 | unit `tui-custom-preset`, unit `platform-availability` |
| AC-T7 | Settings 행이 Language, Total, Concurrent, Back이고 Global이 없다. TUI가 만드는 prepare 옵션의 `skipGlobal`은 항상 false이고 `(mixed)` 규칙을 따른다 | unit `tui-setup` |
| AC-T8 | Check Version과 Uninstall 결과 문구가 7.9와 7.11과 같다. 실패 시 오류, Residual, Exit code가 유지된다 | unit `tui-app` `resultRows` |
| AC-T9 | 플랫폼을 나열하는 모든 UI(상태줄, Mode, 플랫폼 목록, Hosts, Uninstall, 혼합 라벨)가 Claude > Codex 순서이며 이후 Gemini > Grok으로 이어진다 | unit(테스트 레지스트리로 4개 가짜 id 순서 검증), PTY |
| AC-T10 | Hosts 선택이 S와 `Mode:` 미리보기, prepare 옵션(`platforms`)에 반영된다. 역할이 모두 Codex이고 호스트가 Claude면 composite(Claude, Codex)이다 | unit `tui-setup`, `derive-install-plan` |
| AC-M1 | `deriveInstallPlan`이 S=역할∪호스트로 계산하여 \|S\|=1이면 standalone, \|S\|≥2면 composite를 내고 D1-a..f를 판별한다 | unit(순수 함수 표 테스트) |
| AC-M2 | D1-a: P를 설치/갱신할 때 다른 home의 파일 스냅샷이 바이트 단위로 같다 | integration(임시 home) |
| AC-M3 | D1-b: 확인 후 S' 전체 standalone 복원 → P 설치. 확인 없이는 `Mixed routing is active` 오류 | integration `install-mode-switch`, unit `tui-setup` |
| AC-M4 | D1-c: S 각각 설치 후 anchor=min(S)에만 활성 설정이 생기고 S 모든 home에 marker가 생긴다. 호스트 전용 플랫폼은 `profiles:{}`. 설치가 일부 실패하면 publish하지 않는다 | integration(codex+claude 실제, 테스트 레지스트리로 \|S\|=3) |
| AC-M5 | D1-d는 같은 anchor에 재publish한다. D1-e는 S'\S의 routing 파일을 제거하고 standalone을 복원하며 S\S'를 설치한다. anchor가 바뀌면 6.6 절차를 따르고, 결과 경로가 6.2와 6.3을 만족한다 | integration(테스트 레지스트리) |
| AC-M6 | 6.4 판정: anchor 활성 설정 + S marker 전부 유효 → composite. S 밖 home이 standalone/미설치/해석 불가여도 정상. 활성 설정이 2개 이상이거나, 고아 marker·프로필이 있거나, anchor 불일치면 unverified + residual. D1-f에서 Apply 차단 | unit `install-mode`, unit `tui-setup` |
| AC-M7 | 기존 Codex+Claude composite fixture가 무변경으로 composite 판정된다. 재publish는 v1 바이트 형식, 같은 경로, codex home lock과 store를 쓴다. 기존 `install-mode-*`, `role-routing-*` 테스트가 기대값 변경 없이 통과한다(문구 변경 테스트 제외) | integration, golden |
| AC-M8 | anchor를 옮길 때 non-terminal lease(route 무관)가 있으면 `activation:'held'`, `activeDispatches`가 채워지고 모든 home의 파일이 바이트 단위로 같다 | integration(테스트 레지스트리) |
| AC-M9 [신규] | runtime이 host marker로 anchor를 찾고 그 home에서 lock을 잡는다. anchor/host 불일치, host∉S, marker 재확인 불일치는 `activation_unverified`. 여러 home lock은 anchorOrder 순으로 획득한다 | unit `role-routing-*`, `role-dispatch-store` |
| AC-M10 [신규] | 활성 설정 v1/v2 파서와 기록 규칙(6.2): {codex,claude}면 v1, 그 밖은 v2. 잘못된 v2(정렬, 중복, 미등록, 역할 플랫폼 누락)는 거부한다 | unit `role-routing-config` |
| AC-P1 | 두 레지스트리의 id와 순서가 일치하고, 5.6 금지 패턴이 허용 목록 밖에 없다. bridge, adapter coverage가 맞고, 테스트 레지스트리를 운영 코드가 import하지 않는다 | asset check(신규 `platform-registry` 테스트) |
| AC-P2 | 아래 검사가 모두 통과한다. 골든은 의도된 runtime 모듈 추가만 반영한다 | asset/전체 테스트 |
| AC-C1 | management API에서 `kind:'preset'`(standalone/composite), `skipGlobal`, `target: codex|claude|all|composite`가 유지되고, composite에서 `platforms`를 생략하면 6.11 기본값을 쓴다 | unit `management-operations`, `preset-cli`, `uninstall-cli`, `all-targets` |
| AC-C2 | 기존 standalone과 composite home의 사용자 설정(models, settings, limits, global 블록)이 Install / Update 후 보존되고 CLI 인자가 바뀌지 않는다 | integration `install`, `upgrade-state`, `global-config` |

AC-P2에서 통과해야 하는 항목:

- `npm test`
- `npm run check:manifest`
- `npm run check:role-policy`(생성물 무변경)
- `node scripts/update-runtime-assets.mjs --check`
- `installed-layout-golden.json`
- `instruction-contracts.json`
- `scripts/check-installer-parity.mjs`

## 10. 테스트 전략과 영향 파일

- **신규 테스트**
  - `platform-registry.test.mjs`(AC-P1: 일관성, 금지 패턴, coverage)
  - `platform-availability.test.mjs`(5.4)
  - `derive-install-plan.test.mjs`(AC-M1, T10)
  - `install-mode-n-platform.test.mjs`(M4, M5, M6, M8, 테스트 레지스트리)
  - `role-routing-anchor.test.mjs`(M9)
- **테스트 레지스트리 fixture:** `tests/node/fixtures/platforms/zeta.mjs`와, 가짜 플랫폼의 payload를 담은 임시 package root를 만드는 helper. helper 범위는 plan에서 정합니다.
- **기대값을 바꾸는 기존 테스트**(현행 동작을 고정한 곳)
  - `tui-app.test.mjs`: 72, 97, 101–104, 124–127, 190, 217행 부근. 홈 행, 인덱스 분기, Uninstall 행, 결과 문구, 상태줄
  - `tui-app-pty.test.mjs`: 33, 49, 166, 242행
  - `tui-setup.test.mjs`: 24, 100, 107행. 플랫폼 picker, Global, 테두리 라벨
  - `tui-custom-preset.test.mjs`: 18, 51행
  - `tui-render.test.mjs`
  - `Claude & Codex` 문구를 단언하는 `install-mode*.test.mjs`(test, switch, review-followup, models-upgrade), `preset.test.mjs`, `npm-lifecycle.test.mjs`
- **무변경으로 통과해야 하는 테스트군:** `install`, `uninstall`, `targets`, `global-config`, `management-status`, `management-operations`, `models`, `model-catalog`, `profile-render`, `role-routing-publish/install`, `role-bridge-*`, `role-dispatch-store`, `runtime-*`, `watch-*`, `parity-check`, `legacy-parity`, `runtime-assets`, `role-policy`, `agent-fragments`, `composite-instructions`, `composite-live`(live 환경 전용)
  - 단, `role-fixtures.mjs` 등 fixture의 플랫폼 열거를 레지스트리로 바꾸는 것은 허용합니다.
- **최소 검증 경로:** 작업 단위 테스트 + `npm test` + 9장 AC-P2의 check 명령. PTY 테스트는 TUI 변경 작업에 필수입니다.

## 11. 문서, README, MANIFEST, parity

- `README.md`: Change Models 설명을 삭제하고 도식, Hosts, Mode 도출, Settings(Global 삭제), Uninstall 목록과 결과 문구, 혼합 라벨을 반영합니다.
- `docs/harness-operation.md`: composite 저장 위치를 "anchor home(Codex가 참여하면 Codex home)"으로 일반화하고 S와 anchor를 정의합니다.
- `*/skill/references/coordination.md`: Phase A에서는 바꾸지 않습니다(2장 비목표, Q3).
- `MANIFEST.sha256`: `scripts/update-manifest.mjs`로 재생성합니다(신규 `lib/platforms/*`, runtime 모듈 포함).
- `shared/skill/runtime/`: `scripts/update-runtime-assets.mjs`로 동기화합니다.
- `tests/node/fixtures/installed-layout-golden.json`: 신규 runtime 모듈 경로만 추가합니다.
- `tests/installer-parity.json`: parity check가 신규 모듈로 실패할 때만 원장을 갱신합니다. 의미는 바꾸지 않습니다.
- `role-policy`: 생성물 무변경을 확인합니다.
- `package.json` `files`: 새 디렉터리가 `lib/` 아래이므로 변경이 필요 없습니다. 확인만 합니다.

## 12. Phase B/C 확장 지점

- **descriptor 추가:** `lib/platforms/<id>.mjs`와 runtime descriptor를 추가하고 capability를 기본 `off`로 둡니다. 그러면 UI에 `Unavailable (capability not verified)`로 자동으로 나타납니다.
- **새 auth kind:** `auth.kind:'none'`이면 `auth_unverified` 경고 경로가 이미 존재합니다(D-Auth-Unknown).
- **버전 고정:** `cli.supportedVersions`를 지정하면 `unsupported version` 사유가 자동으로 붙습니다(D-Unverified).
- **Gemini effort:** `default` 하나만 쓰는 고정은 카탈로그 JSON으로 표현합니다(D-GeminiEffort).
- **lease v2:** `targetPlatform`을 추가하고, 2-플랫폼 `bridgeTarget` 규칙을 v1 호환으로 유지합니다. watch의 lease 파서도 함께 바꿉니다. **Phase B 필수**입니다. Phase A의 `leaseTargetPlatform()`은 등록 플랫폼이 3개 이상이고 lease가 v1이면 hold합니다.
- **watch anchor 탐색:** Codex가 S에 없을 때 dispatch store를 찾도록 합니다. Phase B에서 S={claude, gemini}가 가능해지기 때문입니다.
- **정책·문서 문구:** `activation_unverified` 이유의 `<CODEX_HOME>`과 coordination 문서를 일반화합니다.
- **정책 생성:** `role-policy.json`의 플랫폼 `controls`를 추가합니다(render는 레지스트리 기반이므로 키만 추가).

## 13. 위험

| 위험 | 완화 |
|---|---|
| N-플랫폼 composite 회귀(최대 위험) | AC-M7 무변경 fixture, 기존 install-mode/role-routing 테스트를 기대값 그대로 유지, 테스트 레지스트리 integration |
| runtime과 설치기 레지스트리 불일치 | runtime을 원천으로 두고 설치기가 import, AC-P1 일관성 테스트 |
| 설치 runtime의 import 제약 위반 | runtime 레지스트리는 `lib/runtime` 내부 의존만, `runtime-assets` 테스트 |
| anchor 이동 중 실패 잔여물 | 단일 트랜잭션 + 고정 lock 순서 + residual 보고. Phase A 운영에서는 일어나지 않음 |
| runtime hash 변경으로 기존 composite가 일시 hold | 현행 정책과 같음. 결과 문구로 안내 |
| 테스트 레지스트리 helper 비용 | plan 단계에서 helper 범위를 확정하고, 과도하면 Orchestrator에 보고 |
| TUI 문구와 순서 변경으로 PTY 테스트가 대량 수정 | TUI 작업 단위에 PTY 재확인 포함 |
| 외부 계약 변동, Gemini 권한 의미, 새 home sandbox | Phase B/C 범위(D-Unverified) |

## 14. 확정된 질문 (2026-11-15 사용자 결정)

1. **Q1 probe 가능한 플랫폼의 인증 확인 실패:** 차단을 유지하고 사유 `auth check failed`를 표시합니다.
2. **Q2 anchor 이동 차단 범위:** route와 무관하게 non-terminal lease가 하나라도 있으면 이동을 차단합니다(P-6 확정).
3. **Q3 skill 문서의 `Claude & Codex` 표기:** Phase A에서는 바꾸지 않습니다. TUI와 management 문구만 `Mixed (…)`로 바꿉니다.
4. **Q4 도식 초기 플랫폼:** standalone이 둘 다 설치되어 있으면 표시 순서 첫 번째(Claude)로 정합니다.
5. **P-1:** 등록되지 않은 Gemini/Grok은 Phase A UI에 표시하지 않습니다.

## 15. Planner 판단 목록 (검토 요청)

- P-1 등록되지 않은 Gemini/Grok은 Phase A UI에 표시하지 않습니다.
- P-2 도식 초기 값 규칙(7.3)
- P-3 역할이 쓰는 플랫폼은 Hosts에서 체크된 채 잠깁니다.
- P-4 Settings `(mixed)` 필드는 바꾸지 않으면 전송하지 않습니다.
- P-5 D1-e에는 별도 확인을 두지 않습니다.
- P-6 anchor 이동 차단 범위를 non-terminal lease 전부로 확대합니다(Q2).
- P-7 Check Version 조회 실패 문구
- P-8 활성 설정 v2와 "{codex,claude}면 v1" 기록 규칙
- P-9 runtime anchor 탐색을 host marker 경유로 합니다.
- P-10 composite 관련 management 문구를 `Mixed …`로 바꿉니다.
- P-11 lease v2와 watch anchor 탐색은 Phase B로 미룹니다.
- P-12 Unavailable 사유 우선순위

## 16. 빌더에게 남긴 것

- 함수 시그니처 세부와 모듈 분할(단, 5.1의 의존 방향은 고정)
- 테스트 레지스트리 helper 구현
- 렌더 코드 구조
- 7장 목업의 정확한 열 정렬(폭 규칙은 고정)
- 진단 전문 문구
