# Gemini 플랫폼 완전 지원 — Phase B 설계 명세

- 작성일: 2026-11-16
- 상태: 승인(2026-11-16, anchor 순서 변경 반영본). 개정 v4 승인 2026-11-16T13:12:29Z(결정 13–15). 개정 v5 승인 2026-11-17(결정 16)
- 작업 대상: 브랜치 `feat/tui-arc-diagram-flow`, 기준 `739da7f`(origin/master 병합 커밋)
- 선행 명세: `docs/superpowers/specs/2026-11-15-tui-arc-diagram-flow-design.md`(이하 "Phase A spec"). Phase A의 구속 결정(D-Arch, D-Anchor, D-Display, D-Host, D1-a..f, D-Auth-Unknown, D-Unauthorized, D-Phase, D-Unverified, D-Watch, D-GeminiEffort, D-Compat)은 Phase B에서도 구속력이 있습니다. 단 **D-Anchor의 anchor 순서(codex > claude)와 Phase A 반목표 "기존 composite 경로 불변"(AC-M7)은 2026-11-16 사용자 결정(결정 10)으로 대체**됩니다(6.7). 원본 설계 기록은 저장소에서 접근할 수 없으므로, 이 명세는 Phase A spec 본문에 서술된 범위만 근거로 씁니다.
- 경로: Architectural. 이 명세가 승인되면 별도 구현 계획을 작성합니다.
- 열린 질문 Q1–Q8은 2026-11-16 사용자 결정으로 확정했습니다(18장). 본문의 `(Qn)` 표시는 18장의 확정 내용을 가리킵니다.

## 0. 승인된 결정과 추적표

사용자가 2026-11-16에 승인한 결정입니다.

| # | 결정 | 다루는 절 |
|---|---|---|
| 1 | Gemini 완전 지원: 설치, 인증 감지, 카탈로그, native profile, bridge 실행/관찰/재개, 제거, 상태 | 4, 5, 6, 7, 8 |
| 2 | 표시 순서 Claude > Codex > Gemini > Grok. ~~anchor 순서와는 별개~~ → 결정 10으로 anchor 순서도 같게 변경 | 4.1(`displayOrder` 2, `anchorOrder` 2), 6.4 |
| 3 | 공식 인증 확인 명령이 없으면 auth=unknown. composite 참여는 허용하고 auth unverified 경고 표시 | 4.1(`auth.kind:'none'`), 5.4, 6.3 |
| 4 | 검증되지 않은 외부 계약은 capability별 기본 off, supportedVersions 고정, live 검증 후 on | 3, 4.1, 9 |
| 5 | Gemini effort는 `default` 하나로 고정 | 4.1(`validatePair`), 5.3, 6.4 |
| 6 | arc watch의 Gemini 지원은 범위 밖 | 2(비목표), 7.3 |
| 7 | 위험: 권한 의미 차이(Gemini `--allowed-tools`가 확인을 우회함), 새 home sandbox 쓰기 미검증 | 10, 11 |
| 8 | 후속 과제 F4–F6을 Phase B 계획의 첫 작업으로 | 2(G1), 12 |
| 9 | 열린 질문 Q1–Q8 확정 | 18 |
| 11 | F6은 현행 정책 유지(symlink home 미지원)와 판정 일치 테스트·문서화로 처리(2026-11-16, 개정 v2) | 12, 13 |
| 10 | anchor 순서를 표시 순서와 맞춤(claude > codex > gemini > grok). 기존 Codex+Claude composite는 anchor를 Claude home으로 옮기는 마이그레이션을 거치고, watch는 anchor를 찾도록 바꿈(Q2 변경) | 4.1, 6.2, 6.7, 7.1, 7.3, 18 |
| 13 | 무료 API 키로 진행. 다섯 역할 기본 모델 `gemini-2.5-flash`, live에서 거부된 `gemini-2.5-pro` 제거(2026-11-16T12:47:50Z) | 5.3, 9.2, 18 |
| 14 | Gemini 카탈로그 노출을 Claude/Codex와 같게: 정적 JSON은 유료 포함 전체 모델, discover 함수 추가. listing + quota 거부(429/503)만 있는 모델은 listed 증거, 명시 거부 모델 제외 | 2, 4.2, 5.3, 6.1, 9.2, 9.3, 17, 18 |
| 16 | 저장소의 증거 파일(`docs/superpowers/evidence/`)을 삭제. live 증거는 구현 계획 진행 기록 행과 전환 커밋 메시지에만 남기고, 증거 테스트는 운영 registry 상태와 카탈로그 불변식 고정 검사로 바꿈(2026-11-17) | 9.1, 9.3, 13, 14, 19 |
| 15 | listing만 있는 후보는 live `-m` 1회 시도 후 분류. preview 모델은 전부 제외. discover deny 목록 없음, catalog off면 discover 미호출, 키 env는 `GEMINI_API_KEY`만, TUI 경고 없음(Claude/Codex와 같음) | 5.3, 9.2, 18 |

## 1. 의도

Phase A는 플랫폼 식별을 레지스트리로 모으고 composite를 임의의 참여 집합 S로 일반화했습니다. 다만 운영 레지스트리에는 codex와 claude만 있었습니다. Phase B는 세 번째 플랫폼 Gemini를 descriptor 추가 방식으로 등록하고, 설치부터 bridge 실행까지 전 경로를 지원합니다.

Gemini CLI의 외부 계약은 대부분 아직 live로 검증되지 않았습니다. 출력 형식, 세션 재개, 권한 모드, native profile 형식, home 쓰기가 여기에 해당합니다. 그래서 Phase B는 다음 순서로 진행합니다.

1. 코드와 자산을 모두 넣되 capability를 기본 `off`로 둡니다.
2. 검증 증거가 생긴 capability만 `verified`로 바꿉니다(Phase B 안에서 순차 진행, Q6).

또한 3번째 플랫폼이 운영 레지스트리에 들어오면 Phase A의 주입 레지스트리 전용 결함(F4–F6)이 운영 경로가 됩니다. 그래서 이 결함부터 고칩니다.

## 2. 목표, 비목표, 반목표

**목표**

- G1 Phase A 후속 결함 F4–F6을 Gemini 등록 전에 수정합니다(12장). F7a와 F1 비anchor 참여 플랫폼 switch 테스트도 테스트 전용 작업으로 포함합니다(Q1).
- G2 runtime·설치기 레지스트리에 `gemini` descriptor를 등록합니다(4장).
- G3 Gemini 설치·제거·상태·카탈로그·인증 감지를 구현합니다(5장).
- G4 Gemini를 composite의 역할 플랫폼과 호스트로 참여시킵니다. dispatch lease v2(`targetPlatform`)와 N-플랫폼 bridge 대상 도출을 함께 구현합니다(6, 7장).
- G5 Gemini bridge 실행/관찰/재개/취소를 구현합니다(8장).
- G6 capability별 live 검증 절차와 증거 형식을 정하고, Phase B 안에서 검증된 capability를 `verified`로 바꿉니다(9장).
- G7 권한 의미 차이와 sandbox 위험에 대한 hold 규칙을 runtime에 넣습니다(10, 11장).
- G8 anchor 순서를 표시 순서(claude > codex > gemini)와 맞추고, 기존 Codex+Claude composite의 anchor를 Codex home에서 Claude home으로 옮기는 마이그레이션과 watch anchor 탐색을 구현합니다(6.7, 7.3).

**비목표**

- `arc watch`의 Gemini 지원(결정 6, D-Watch). Gemini 세션 탐색·정규화와 Gemini dispatch 표시가 여기에 해당합니다. watch의 anchor 탐색은 결정 10에 따라 범위 안입니다(7.3).
- Grok(Phase C)
- Gemini Desktop 등 CLI 외 실행 환경. `executionEnvironments`는 `gemini-cli` 하나입니다.
- TUI·management의 Gemini discover 사용. Claude/Codex와 같이 선택 표면은 정적 카탈로그만 씁니다(5.3, 결정 14).
- 공식 인증 확인 명령이 생겼을 때의 probe 구현. 그때 별도 변경으로 다룹니다.

**반목표**

- Phase A 반목표 중 다음은 유지합니다.
  - management API의 `kind:'preset'`, `skipGlobal`, `target: codex|claude|all|composite`의 의미를 바꾸지 않습니다(`all`의 범위는 6.5).
  - 파일 이름(`arc-role-platform-routing.json`, `.prepared.json`, `.lock`, `arc-role-dispatch/`)과 marker 형식은 바꾸지 않습니다.
- Phase A 반목표 "기존 composite의 경로, lock, store 위치를 바꾸지 않음"(AC-M7)은 결정 10으로 **폐기**합니다. 위치는 6.7 마이그레이션으로만 바뀝니다.
- 마이그레이션은 사용자의 Install / Update 실행 안에서만 일어납니다. 패키지 설치, `arc upgrade`, runtime 명령, status 조회는 파일을 옮기지 않습니다.
- 마이그레이션은 old anchor의 `arc-role-dispatch/`를 옮기거나 지우지 않습니다.
- Gemini `--allowed-tools`를 쓰지 않습니다. 이 옵션은 deprecated이며 의미가 "확인 없이 실행 허용"입니다(10장).
- live 증거 없이 capability를 `verified`로 바꾸지 않습니다.

## 3. 제약

- Phase A 3장 제약을 유지합니다.
  - runtime(`lib/runtime/*`)은 `lib/runtime` 내부만 import합니다.
  - 새 runtime 모듈을 추가하면 `RUNTIME_MODULE_PATHS`, `COOPERATIVE_RUNTIME_MODULES`, `MANIFEST.sha256`, `installed-layout-golden.json`, runtime-assets `--check` 다섯 가지를 함께 갱신합니다.
  - runtime hash가 바뀌므로 기존 composite는 업그레이드 후 Install / Update를 다시 해야 합니다. 이는 현행 정책 문구와 같습니다.
- Gemini bridge·관찰 구현은 우선 기존 모듈(`role-bridge-args.mjs`, `role-supervisor.mjs`, `role-observe.mjs`)의 `Map<id, impl>`에 추가합니다. 모듈 크기 때문에 분리가 필요하면 계획 단계에서 새 모듈과 위 다섯 가지 갱신을 한 작업에 묶습니다.
- `lib/policy/role-policy.json`은 각 role의 `controls`에 `gemini` 키를 추가하고, `platforms`에 `gemini` 항목(level `prompt`와 notice, 결정 12)을 추가하는 변경만 허용합니다(Q4). codex/claude 생성물은 바이트 단위로 같아야 합니다.
- capability 상태의 원천은 runtime descriptor입니다. 설치기는 이를 참조만 하므로 runtime과 설치기가 서로 다른 상태를 볼 수 없습니다.

## 4. 레지스트리 등록

### 4.1 runtime descriptor (`lib/runtime/platform-registry.mjs`)

| 필드 | gemini | 비고 |
|---|---|---|
| `id` / `label` | `gemini` / `Gemini` | |
| `displayOrder` | 2 | 결정 2. Claude 0, Codex 1, Gemini 2 |
| `anchorOrder` | 2 | 결정 10: claude 0 > codex 1 > gemini 2. codex·claude descriptor의 `anchorOrder`도 각각 1·0으로 바꿉니다. `displayOrder`와 같은 값이 되지만 두 필드는 유지합니다(Grok 등에서 다시 달라질 수 있음) |
| `home.env` | `GEMINI_CLI_HOME` | U-H1, P-B1 |
| `home.resolve(ctx)` | 기본 `~/.gemini`만 허용 | `GEMINI_CLI_HOME`이 설정되어 있으면 해석 실패(`unresolved`). 의미가 검증되기 전에는 보수적으로 막습니다. 해석 실패는 Phase A 6.4.8에 따라 S 밖이면 무시됩니다 |
| `cli.command` | `gemini` | |
| `cli.supportedVersions` | `>=0.68.0 <0.69.0` | 결정 4. 로컬 설치 0.68.0 기준. live 검증 증거가 생긴 minor만 range에 추가합니다(9.4) |
| `auth.kind` | `none` | 결정 3. help에 공식 인증 상태 하위 명령이 없습니다(U-A1) |
| `models.effortField` | `effort` | `models.toml` 저장 키. native profile에는 effort를 렌더링하지 않습니다(5.5) |
| `profile.ext` | `md` | U-N1 |
| `profile.standaloneName(role)` | `arc-<suffix>` | |
| `profile.routingName(role)` | `arc-routing-<suffix>` | |
| `executionEnvironments` | `['gemini-cli']` | Desktop 없음 |
| `routing.validatePair(model, effort)` | `validText(model)` + 모델 문자 규칙(Claude와 같은 정규식) + `effort==='default'` | 결정 5 |
| `capabilities` | 모든 키 `{state:'off', reason:'<9.2의 사유>'}` | 결정 4. 9장 증거로만 바뀝니다 |

`resolveHome`의 플랫폼 분기에 gemini 분기를 추가합니다. 이 파일은 Phase A 하드코딩 허용 목록에 이미 들어 있습니다.

### 4.2 설치기 descriptor (`lib/platforms/gemini.mjs`)

| 필드 | gemini | 비고 |
|---|---|---|
| `runtime` | `getPlatform('gemini')` | |
| `payloadPrefix` | `gemini` | 새 payload 트리 `gemini/…`(5.1) |
| `instructionFile` | `GEMINI.md` | U-I1 |
| `runtimeConfigFile` | `settings.json` | U-I2. ARC는 읽기만 하거나 최소 키만 병합합니다(5.2) |
| `globalPaths` | `GEMINI.md`, `settings.json` | |
| `models.staticCatalog` | `lib/models/gemini-models.json` | 5.3 |
| `models.discover` | `discoverGeminiCatalog`(`lib/models/catalog-gemini.mjs`) | Gemini API `models.list` 기반(5.3, 결정 14). TUI·management는 정적 카탈로그만 씁니다 |
| `profiles.render/isOwnedStandalone/renameForRouting` | Gemini 전용 markdown frontmatter 형식(`lib/platforms/formats/gemini-markdown.mjs` 또는 markdown 형식의 옵션) | 5.5. 형식 분리 여부는 builder가 정합니다 |
| `runtimeConfig.readConcurrency/renderConcurrency` | 없음(동시성 키를 쓰지 않음) | U-I3. Settings의 Concurrent는 ARC `settings.toml`에만 저장합니다 |
| `runtimeConfig.extraRender` | 없음 | |
| `uninstallSummary` | `Gemini settings.json is preserved.` | |
| `isolationEnv` | `() => ({})` | |

`DEFAULT_INSTALLER_REGISTRY`의 descriptors 배열은 anchor 순서에 맞춰 `[CLAUDE, CODEX, GEMINI]`가 됩니다. AC-P1 일관성 테스트는 그대로 통과해야 합니다.

### 4.3 하드코딩 잔존 검사

- Phase A 5.6의 금지 패턴 검사를 유지합니다.
- 기존 허용 목록 파일 안에서 gemini 분기를 추가하는 것은 허용합니다.
- 허용 목록 밖에서 `'gemini'` 리터럴 분기가 새로 생기면 실패하도록 패턴을 하나 추가합니다(`==='gemini'`, 허용 목록 동일).

## 5. 설치·제거·상태·카탈로그·인증

### 5.1 설치 자산

- 새 payload 트리 `gemini/`를 둡니다. 구성은 claude payload를 기준으로 합니다.
  - skill: `gemini/skill/**`. `references/coordination.md`를 포함하며 문구는 6.6을 따릅니다.
  - instruction 템플릿(`GEMINI.md` 블록)
  - agent 템플릿: 역할 5종, `arc-*.md`
- 설치 위치(U-I4):
  - skill → `~/.gemini/skills/arc/`
  - agents → `~/.gemini/agents/`
  - instruction → `~/.gemini/GEMINI.md`의 ARC 소유 블록
- `MANIFEST.sha256`, `installed-layout-golden.json`(gemini 레이아웃 추가), `tests/installer-parity.json`(필요할 때만), `package.json` `files`(`gemini/` 디렉터리 추가 필요 여부 확인)를 갱신합니다.
- 공통 runtime(`shared/skill/runtime/`)은 다른 플랫폼과 같은 규칙으로 설치합니다.

### 5.2 설치·제거 동작

- standalone 설치(D1-a)는 `install`·`standalone` capability가 `verified`일 때만 TUI와 management에서 허용됩니다. Phase A 5.4의 `standalone` 게이트를 그대로 적용합니다.
- 설치 순서는 anchorOrder(claude, codex, gemini), 제거 순서는 displayOrder입니다(Phase A 5.6). 결정 10으로 두 순서가 같아집니다.
- `settings.json`은 ARC 소유 키만 병합합니다. 소유 키 집합은 U-I2 검증 결과로 정하며, 검증 전에는 `settings.json`을 쓰지 않습니다(P-B2).
- 제거는 ARC 소유 파일만 지웁니다. 대상은 skill, agents의 `arc-*`/`arc-routing-*`, instruction 블록, marker입니다. `settings.json`과 사용자 파일은 보존합니다.
- Uninstall 화면에는 Gemini가 표시 순서 3번째로 나옵니다.
  - ARC 미설치면 `Gemini  (not installed)`로 표시하며 선택되지 않습니다.
  - `install` capability가 off여도 이전 설치 흔적이 있으면 제거는 허용합니다. 제거는 capability와 무관하게 안전한 방향이기 때문입니다(P-B3).

### 5.3 카탈로그

- `lib/models/gemini-models.json`: 모든 쌍의 effort가 `default`입니다(D-GeminiEffort, 결정 5).
- **정적 목록 규칙(결정 13, 14, 15):**
  - 후보는 `selectGeminiCatalogModels`를 통과하는 Gemini 텍스트 계열 GA 모델입니다. 정규식은 `^gemini-(\d+(?:\.\d+)?)-(pro|flash|flash-lite)$`입니다. `-preview` 모델은 모두 제외합니다.
  - TTS, image("Nano Banana"), omni, transcribe, live, native-audio, robotics, computer-use, embedding, `-customtools`, `-latest` 별칭, `auto`, 버전 없는 codename(`gemini-4-argon` 등), Gemini 계열이 아닌 모델(gemma 등)은 정규식에서 제외됩니다.
  - 카탈로그에 넣으려면 9.3 catalog 증거의 `accepted (live -m)` 또는 `listed (quota-blocked)`에 있어야 합니다. `excluded (rejected)` 모델은 넣지 않습니다.
  - 다섯 역할 기본 모델(`gemini/skill/models.toml`, `gemini/agents/arc-*.md`의 `model`)은 `gemini-2.5-flash`이고 `accepted`에 있어야 합니다.
  - 순서: tier(pro → flash → flash-lite), 같은 tier 안에서는 버전 내림차순입니다. 선택 기본값은 models.toml이 정하므로 순서는 표시용입니다.
- **discover(`discoverGeminiCatalog`, 결정 14):**
  - 요청: `GET https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000[&pageToken=…]`, 헤더 `x-goog-api-key: <GEMINI_API_KEY>`, `redirect:'manual'`. 키는 URL·argv·결과·오류 문구 어디에도 넣지 않습니다.
  - 응답 검사: `response.ok`가 아니거나 `response.url`의 origin·pathname이 요청과 다르면 `http_error`. `models`는 배열이고, 각 항목 `name`은 `models/` 접두 문자열, id(접두 제거)는 runtime 모델 정규식을 통과하고 키를 포함하지 않아야 합니다. 어기면 `invalid_response`. `supportedGenerationMethods`에 `generateContent`가 없는 항목은 건너뜁니다.
  - 페이지: `nextPageToken`이 비어 있거나 없으면 끝. 문자열이 아니거나 이전 토큰 반복, 1000쪽 초과면 `invalid_response`.
  - 선택: 모은 id에 `selectGeminiCatalogModels`를 적용하고 모든 effort는 `default`. 결과 0개면 `invalid_response`. 증거상 거부된 id를 거르는 deny 목록은 두지 않습니다(Claude/Codex와 같음, 결정 15).
  - 결과: `{status:'ready', catalog:{platform:'gemini', pairs, unavailable:[], source:'gemini_api', cliAccountVerified:false}}`. listing은 계정 자격과 quota를 반영하지 않으므로(U-C2) `cliAccountVerified`는 항상 `false`입니다.
  - 실패: `{status:'unavailable', code, message}`. code는 `missing_api_key`(`Gemini API key is unavailable.`), `http_error`·`invalid_response`·`unavailable`(`Gemini catalog is unavailable.`), `aborted`, `timeout`(`discoverModelCatalog` 공통). 키 env는 `GEMINI_API_KEY`만 씁니다.
  - `discoverModelCatalog`는 descriptor의 `catalog` capability가 verified가 아니면 discover를 호출하지 않고 `capability_not_verified`를 반환합니다.
- runtime은 `lib/models`를 import할 수 없으므로 runtime의 모델 문자 규칙은 정규식으로만 검사합니다. 카탈로그와 runtime 규칙의 정합성은 테스트로 고정합니다(Claude의 `CATALOG_MODEL_ALIASES` 선례).
- 카탈로그 실패는 Phase A와 같이 `catalog_error` 사유로 처리합니다.

### 5.4 인증 감지 (`auth=unknown` 경로)

- `probePlatformAuth`는 `auth.kind==='none'`이면 프로세스를 띄우지 않고 `{authStatus:'unknown', reason:'auth_unverified'}`를 반환합니다.
- CLI 존재와 버전은 `probeCliVersion`(`gemini --version`, U-V1)으로 확인합니다. 미발견이면 `not_installed`, range 밖이면 `unsupported_version`입니다.
- availability 결과는 Phase A 5.4 그대로입니다. `auth.kind==='none'`이고 unknown이면 `selectable:true, warning:'auth_unverified'`입니다.
- runtime `routingStatus`의 플랫폼별 인증 보고:
  - Gemini는 `authentication:{authStatus:'unknown', reason:'auth_unverified'}`입니다.
  - composite gate(Phase A 6.5)는 `auth.kind==='none'`이므로 통과시킵니다.
- bridge 실행이 인증 실패로 끝나면 기존 `auth_rejected` 사유를 씁니다. 실패 판정 기준은 U-B5입니다.

### 5.5 native profile

- 위치는 `~/.gemini/agents/`입니다(U-N1).
  - standalone 프로필: `arc-<suffix>.md`
  - routing 프로필: `arc-routing-<suffix>.md`
- 형식은 YAML frontmatter와 본문 instructions입니다(U-N2).
  - frontmatter: `name`, `description`, `model`, 그리고 도구 제한 필드(검증된 이름만)
  - effort는 렌더링하지 않습니다. ARC 소유 여부를 판정하는 ARC 표식 필드는 builder가 정합니다.
- 소유 판정(`isOwnedStandalone`)과 routing 이름 변경(`renameForRouting`)은 claude 규칙과 같은 방식입니다. 대상은 frontmatter `name`과 revision tag입니다.
- runtime `parseCompositeProfile('gemini', bytes)`는 위 형식만 받는 좁은 파서입니다. 필수 키는 `name`, `description`, `model`, instructions이고 effort는 `default`로 간주합니다.

### 5.6 상태 (`collectStatus`, 홈 상태줄)

- `collectStatus`는 레지스트리를 순회하므로 Gemini가 자동으로 포함됩니다. 인증은 5.4를 따릅니다.
- 홈 상태줄의 Gemini 표시(P-B4):

| 조건 | 표시 |
|---|---|
| `install` capability off | `Gemini: Not verified` |
| CLI 미발견 | `Gemini: Not Available` |
| range 밖 | `Gemini: Unsupported version` |
| 그 밖(인증 unknown) | `Gemini: Available (auth unverified)` |

- Codex/Claude의 상태 어휘와 표시는 바꾸지 않습니다.
- 진단 줄은 현행 규칙을 따릅니다.

## 6. Composite 참여

### 6.1 capability 의존 관계

usage 게이트(Phase A 5.4)는 바꾸지 않습니다. 대신 capability 사이에 다음 선행 조건을 둡니다. 레지스트리 생성 시 "verified인 키의 선행 키가 모두 verified"인지 검사하고, 어기면 throw합니다.

| capability | 선행 조건 | 의미 |
|---|---|---|
| `install` | — | payload 설치·제거, Gemini가 GEMINI.md와 skill을 읽음 |
| `nativeProfile` | `install` | `~/.gemini/agents` 프로필 로드, model 적용, revision 재로드 |
| `catalog` | `install` | 정적 카탈로그 모델마다 CLI 수락 또는 listing + quota 거부만 있음(9.2), 역할 기본 모델은 수락됨 |
| `standalone` | `install`, `nativeProfile`, `catalog` | Gemini 단독 ARC |
| `bridge` | `install`, `catalog` | 다른 host에서 Gemini 역할 실행/관찰/취소(재개는 8.5) |
| `compositeRole` | `bridge` | Gemini를 역할 플랫폼으로 선택 |
| `compositeHost` | `install`, `nativeProfile` | Gemini에서 Orchestrator 실행, runtime 명령 호출. host sandbox 게이트는 11장 |
| `authProbe` | — | 공식 명령이 없으므로 Phase B 내내 `off`(사유 `no official auth status command`) |
| `watch` | — | 결정 6에 따라 `off` |

- Gemini가 host이면서 Gemini 역할도 있는 경우 그 역할은 native route입니다. 따라서 `compositeHost`가 verified라는 것은 `nativeProfile`이 verified라는 뜻입니다.

### 6.2 활성 설정과 marker

- 기록 규칙을 바꿉니다(결정 10, P-B10): 새로 publish하는 활성 설정은 S와 무관하게 항상 v2입니다. Phase A의 "S={codex,claude}면 v1" 규칙은 v1 설정을 Codex home에 두어 다운그레이드 호환을 지키려는 것이었는데, anchor가 Claude home으로 옮겨지면 그 호환이 어차피 사라지기 때문입니다.
- 파서는 v1을 계속 받습니다. v1은 S={codex,claude}를 함축하며, 6.7의 legacy 판정에만 쓰입니다.
- anchor는 min(S)입니다(claude > codex > gemini).
  - S={codex,claude}, {claude,gemini}, {codex,claude,gemini} → anchor=claude home
  - S={codex,gemini} → anchor=codex home
  - S={gemini} → standalone
  - |S|≥2이면 codex나 claude가 들어 있으므로 gemini가 anchor가 되는 경우는 운영에서 생기지 않습니다.
- lock 순서(Phase A 6.7)는 anchorOrder 오름차순 그대로이므로 claude → codex → gemini가 됩니다.
- marker 형식은 바꾸지 않습니다. Gemini home에도 `arc-role-platform-routing.prepared.json`을 둡니다.

### 6.3 composite 게이트와 경고

- prepare/execute 양쪽에서 S의 각 P에 role/host 게이트를 다시 확인합니다(Phase A 6.5). Gemini는 인증 unknown이어도 통과하고 `auth_unverified` 경고가 붙습니다(결정 3).
- 경고는 다음 위치에 보입니다.
  - TUI Hosts의 `(auth unverified)`(Phase A 7.4)
  - 역할 편집기 플랫폼 행·플랫폼 목록의 info 줄 `Gemini: auth unverified — ARC cannot confirm Gemini CLI login.`
  - 도식 사유 줄: 차단 사유가 없을 때만 `Gemini: auth unverified` 1줄
  - management prepare 결과의 `warnings: ['gemini:auth_unverified']`(필드 추가. 기존 필드 의미는 불변)

### 6.4 TUI

- 등록 플랫폼 표시 순서는 Claude, Codex, Gemini입니다(AC-T9 운영 레지스트리 적용).
- capability가 off인 동안 Gemini는 다음과 같이 보입니다.
  - 플랫폼 목록: `Gemini - Unavailable  (capability not verified)`
  - Hosts: 체크 불가 `- Unavailable  (capability not verified)`
  - 역할 편집기 ←/→: 건너뜀
  - 도식: Gemini를 고를 수 없으므로 나오지 않음
- Effort 행은 `default` 하나뿐이라 ←/→가 값을 바꾸지 않습니다. 박스는 `effort: default`를 표시합니다.
- 혼합 표기 예: `Mixed (Claude + Codex + Gemini)`, `Mixed (Claude + Gemini)`

### 6.5 management API

- `target:'gemini'`를 받습니다. `install`/`standalone`이 off이면 오류 `Gemini is not available: capability not verified`를 내고 파일을 바꾸지 않습니다.
- `target:'composite', platforms:[…,'gemini']`는 게이트를 통과할 때만 진행합니다.
- `target:'all'`은 "등록 플랫폼 중 `install`·`standalone`이 verified인 것"으로 정의합니다(Q7).
  - Gemini가 off인 동안 `all`은 {codex, claude} 그대로이고, 기존 `all-targets` 테스트는 무변경으로 통과합니다.
  - Gemini가 verified가 되면 `all`에 Gemini가 포함됩니다. 스크립트 사용자에게 동작이 바뀌므로 README에 명시합니다.
- `kind:'preset'`, `skipGlobal`, `switchFromComposite`는 그대로 둡니다.

### 6.6 문구 일반화

- runtime `RELEASE_CONDITIONS.activation_unverified`의 `<CODEX_HOME>/arc-role-dispatch`를 `<anchor home>/arc-role-dispatch`로, "both prepared markers"를 "all prepared markers"로 바꿉니다.
- `host_sandbox_blocked` 문구 `Allow the host to write the Codex home …`은 `… write the anchor home …`으로 일반화합니다.
- 두 문구를 단언하는 테스트는 의도된 변경으로 갱신합니다.
- skill 문서 `*/skill/references/coordination.md`의 `Claude & Codex` 표기는 세 플랫폼 모두 `Mixed routing`으로 일반화하고, `instruction-contracts.json` fixture를 의도된 변경으로 갱신합니다. Gemini payload는 처음부터 일반 표기로 씁니다(Q3).
- coordination.md와 harness 문서의 `<CODEX_HOME>/arc-role-dispatch/`(수동 정리 위치) 같은 Codex home 고정 표기도 `<anchor home>/arc-role-dispatch/`로 바꾸고, 이동 전 기록이 old anchor에 남는다는 점을 적습니다(6.7).

### 6.7 anchor 순서 변경과 기존 composite 마이그레이션 (결정 10)

**배경.** Phase A까지 기존 Codex+Claude composite는 anchor=codex였습니다. 그래서 v1 활성 설정, lock, dispatch store가 `<CODEX_HOME>`에 있습니다. anchor 순서가 claude > codex로 바뀌면 같은 S의 anchor는 Claude home이어야 합니다.

#### 6.7.1 legacy 상태 판정 (`readInstallMode`)

- Phase A 6.4.5의 "A가 home(min(S))와 같다" 검사에 예외를 하나 둡니다. 아래 조건을 **모두** 만족하면 `unverified`가 아니라 `{mode:'composite', platforms:['claude','codex'], anchor:'codex', legacyAnchor:true, config}`를 반환합니다.
  - 활성 설정이 정확히 1개이고 Codex home에 있습니다.
  - 그 설정이 v1입니다(v2는 legacy가 될 수 없음. Phase B 이전 운영 레지스트리에서는 v2가 기록되지 않았기 때문입니다).
  - 나머지 6.4.5 검사(모든 P 해석, marker·프로필 일치, S 밖 residual 없음, home 경로 비중첩)를 통과합니다.
- 새 필드 `legacyAnchor`는 legacy일 때만 `true`이고, 그 밖에는 필드를 넣지 않습니다. 기존 deepEqual 반환값과의 차이는 legacy 경우로 한정됩니다.
- legacy가 아닌 상태에서 활성 설정이 home(min(S))에 있지 않으면 Phase A와 같이 `unverified`입니다. 예를 들어 Codex home의 v2 설정이나, Claude home과 Codex home 양쪽의 설정이 여기에 해당합니다.

#### 6.7.2 마이그레이션 실행 (Install / Update)

- legacy 상태에서 TUI Install / Update를 Apply하거나 management `target:'composite'`로 publish하면 D1-d/D1-e 판정과 무관하게 **anchor 이동**이 포함됩니다. old anchor=codex, new anchor=claude입니다.
- 절차는 Phase A 6.6을 그대로 씁니다.
  1. anchorOrder 오름차순(claude → codex)으로 두 lock을 획득합니다.
  2. 두 store에 non-terminal lease가 하나라도 있으면 `activation:'held'`, `activeDispatches`를 채우고 파일을 바꾸지 않습니다. 진행 중인 dispatch를 끝내거나 취소한 뒤 다시 실행해야 합니다.
  3. 하나의 `applyTransaction`으로 처리합니다.
     - Claude home에 v2 활성 설정을 기록합니다.
     - S 모든 home의 marker를 새 `activeConfigPath`로 재기록합니다.
     - Codex home의 v1 활성 설정을 제거합니다.
  4. `<CODEX_HOME>/arc-role-dispatch/`는 그대로 둡니다. 결과에 `Dispatch history stays in <codex home>/arc-role-dispatch.`를 표시합니다.
  5. lock을 역순으로 해제합니다.
- 실패와 잔여물 처리는 Phase A 6.10을 따릅니다. rollback이 `restored`이면 legacy 상태가 그대로 남으므로 다시 시도할 수 있습니다.
- S를 바꾸는 D1-e(예: legacy {codex,claude} → {codex,claude,gemini})는 같은 트랜잭션에서 anchor 이동과 집합 변경을 함께 처리합니다. new anchor는 min(S)입니다.
- legacy 상태에서 D1-b(composite 끄기)와 Uninstall은 old anchor=codex를 기준으로 현행 해제 절차를 수행합니다. 이동 없이 끌 수 있어야 합니다.

#### 6.7.3 TUI와 management 표면

- 홈 모드 줄과 도식은 legacy 상태도 `Mixed (Claude + Codex)`로 표시합니다.
- legacy 상태의 Apply 미리보기에 `Mixed routing files will move to the Claude home.` 1줄을 추가합니다. 별도 확인 단계는 두지 않습니다(Phase A P-5와 같음).
- 이동이 lease 때문에 막히면 결과에 현행 held 문구와 진행 중 dispatch id를 표시합니다.
- management prepare 결과에 `anchorMove:{from:'codex', to:'claude'}`를 추가합니다(필드 추가. 기존 필드 의미는 불변).
- status는 legacy 상태를 `composite`로 보고하며, 진단 줄 `Mixed routing will move to the Claude home on the next Install / Update.`를 추가합니다.

#### 6.7.4 runtime

- runtime은 legacy 상태를 지원하지 않습니다. host marker가 Codex home의 v1 설정을 가리키면 6.9.4의 anchor 검사(home(min(S)))에서 `activation_unverified`가 됩니다. release condition은 `After upgrading ARC, run Install / Update again.`(현행 문구)입니다.
- 이것은 기존 동작과 같은 수준입니다. 패키지 업그레이드로 runtime hash가 바뀌면 Install / Update 전까지 runtime이 어차피 `activation_unverified`를 내기 때문입니다. 따라서 마이그레이션은 이미 필요한 재설치 시점에 함께 일어납니다.
- runtime은 old store(`<CODEX_HOME>/arc-role-dispatch/`)의 lease를 읽지 않습니다. 이동 전에 non-terminal lease가 0이어야 하므로(6.7.2), 이동 후 resume 대상이 되는 lease는 남지 않습니다.

#### 6.7.5 다운그레이드

- 마이그레이션 이후 이전 ARC 버전은 Codex home에서 활성 설정을 찾지 못하므로, composite를 `unverified` 또는 standalone으로 봅니다. 다운그레이드 후 composite가 필요하면 이전 버전에서 Install / Update를 다시 해야 합니다. 이 한계를 README에 적습니다(17장).

## 7. dispatch lease v2와 bridge 대상 도출

### 7.1 lease 스키마

- **v1**(현행): `targetPlatform`이 없습니다.
  - 대상 도출: `route==='native'` → `hostPlatform`, `route==='bridge'` → {codex, claude} 중 host가 아닌 쪽.
  - **변경:** Phase A `leaseTargetPlatform()`의 "등록 3개 이상 + v1이면 hold" 규칙을 없애고 위 2-플랫폼 규칙으로 고정합니다.
  - 근거: v1 lease는 S={codex,claude} 시절에만 만들어졌습니다. 6.7에 따라 runtime이 old store를 읽지는 않지만, v1 lease가 입력으로 들어왔을 때 근거 없이 hold하지 않고 정확히 해석하도록 남깁니다(읽기 호환).
  - v1인데 `hostPlatform`이 {codex,claude} 밖이면 `activation_unverified`입니다.
- **v2**[신규]: v1 키 + `targetPlatform`.
  - `targetPlatform`은 등록 id이며, lease의 revision에 해당하는 활성 설정 S에 속해야 합니다.
  - `route==='native'`이면 `targetPlatform===hostPlatform`, `route==='bridge'`이면 `targetPlatform!==hostPlatform`입니다.
  - `validateLease`는 `version===1|2`를 받고, 키 집합은 version별로 정확히 검사합니다.
- **기록 규칙:** 새 lease는 항상 v2입니다(P-B6). 6.7에 따라 runtime은 v2 활성 설정에서만 동작하므로 v1 lease를 새로 만들 경로가 없습니다. v1 lease 파싱과 2-플랫폼 대상 도출은 읽기 호환용으로만 남깁니다.
- bridge 대상은 항상 `config.roles[role].platform`입니다. `prepareRoleDispatch`가 lease에 기록하고, run/observe/resume/cancel은 lease에서 읽습니다.

### 7.2 runtime capability 방어

- runtime은 prepare와 run에서 runtime descriptor의 capability를 다시 확인합니다. 설치기 게이트를 우회한 설정 파일(수동 편집, 이전 버전 잔여물)이 실행되는 것을 막기 위해서입니다.
  - host의 `compositeHost`
  - 대상 플랫폼의 `compositeRole`, 그리고 bridge route면 `bridge`
- off이면 hold이며, 새 reason code `capability_not_verified`를 씁니다(release condition: `Update ARC to a release that verifies this platform capability.`, P-B7).
- Phase A의 `bridge` coverage 테스트는 "verified ⇒ impl 존재"입니다. Gemini impl은 off일 때도 존재하므로, off capability의 플랫폼으로는 prepare가 lease를 만들지 않는다는 테스트를 하나 더 둡니다.

### 7.3 watch anchor 탐색 (결정 6, 결정 10, Q2 변경)

- 결정 10 이후 기존 Codex+Claude composite의 store도 Claude home으로 옮겨집니다. 그래서 watch가 `<CODEX_HOME>/arc-role-dispatch`만 읽으면 기존 사용자의 dispatch가 보이지 않게 됩니다. Q2의 "watch 코드 무변경"은 이 결정으로 **철회**하고, watch에 anchor 탐색을 넣습니다.
- **탐색 규칙**(읽기 전용, lock 없음):
  1. 등록 플랫폼을 anchorOrder 순으로 돌며 home을 해석하고, 각 home의 marker를 읽습니다.
  2. 형식이 맞는 marker의 `activeConfigPath` 디렉터리를 후보로 모읍니다. 후보는 등록 플랫폼의 해석된 home 중 하나와 정확히 같아야 합니다(F5와 같은 신뢰 경계).
  3. 후보가 정확히 1개이면 `<그 home>/arc-role-dispatch`를 읽습니다.
  4. 후보가 0개이면 legacy 호환으로 `<CODEX_HOME>/arc-role-dispatch`가 있을 때 그것을 읽습니다. 이렇게 하면 마이그레이션 전 사용자와 composite를 끈 뒤의 기록이 보입니다.
  5. 후보가 2개 이상이면 store를 읽지 않고 watch 상태 줄에 `dispatch store ambiguous`를 표시합니다.
- watch는 이미 `lib/runtime/local-cli.mjs`(`resolveConfigHome`)를 import합니다(`lib/watch/index.mjs:4`). 탐색 코드는 `lib/watch/` 안에 두고, home 해석은 runtime 레지스트리(`lib/runtime/platform-registry.mjs`)를 씁니다. 현재 `dispatch.mjs`는 `codexHome` 인자 하나로 store를 정하므로(`lib/watch/dispatch.mjs:30`), 이 인자를 탐색 결과의 store 디렉터리로 바꿉니다.
- `parseLeaseLenient`는 v2 lease를 v1과 같은 필드로 읽습니다(현행이 이미 그렇습니다). 회귀 테스트를 추가합니다.
- Gemini dispatch가 store에 있으면 watch의 현행 "알 수 없는 dispatch 플랫폼" 규칙(`lib/watch/model.mjs:23`, platform 생략)대로 다룹니다. Gemini 세션 탐색·대화 표시는 하지 않습니다(결정 6). 새 문구는 추가하지 않습니다.
- old anchor에 남은 이동 전 기록은 watch 대상이 아닙니다(같은 화면에서 두 store를 합치지 않음).

## 8. Gemini bridge 실행·관찰·재개

이 장의 CLI 계약은 `gemini --help`(0.68.0) 출력에만 근거합니다. 동작은 검증되지 않았으며 모두 `bridge` capability off에 연결됩니다.

### 8.1 실행 인자 (`buildGeminiArgs`, U-B1..B4)

```
gemini -p <prompt> -m <model> -o stream-json --session-id <uuid>
       --approval-mode <role mode> [--policy <ARC role policy file>]
       [--sandbox] [--allowed-mcp-server-names <none-equivalent>] [-e <none-equivalent>]
```

- **prompt:** 역할 instructions와 brief를 하나의 프롬프트로 합쳐 stdin으로 넘기고, `-p`에는 짧은 지시만 둡니다(help: "Appended to input on stdin"). Gemini에는 Claude의 `--append-system-prompt`와 같은 옵션이 help에 없습니다(U-B2).
- **세션 식별:** ARC가 UUID를 미리 만들어 `--session-id`로 넘기고 lease `sessionId`에 기록합니다. 그래서 프로세스 시작 전에 식별자가 정해집니다.
- **역할별 approval mode와 policy:** 10.2에 정리합니다.
- **MCP와 확장 차단(G6 strict 대응):** 허용 MCP 서버 없음과 확장 미사용을 표현하는 인자는 U-B4입니다. 검증 전에는 bridge capability가 off입니다.
- `--allowed-tools`, `--yolo`, `--approval-mode yolo`, `--skip-trust`는 사용하지 않습니다. `--skip-trust` 필요 여부는 U-B6입니다.
- `--raw-output`은 사용하지 않습니다.

### 8.2 관찰 (`SUPERVISOR_IMPLEMENTATIONS.gemini`)

- `normalize: normalizeGeminiStreamEvent`가 stream-json 행을 ARC event record로 바꿉니다. 이벤트 형태(init/message/tool_use/tool_result/result 계열)는 U-B3입니다. 모르는 이벤트는 무시하지 않고 원문 그대로 기록하되 분류는 `unknown`으로 합니다(P-B9).
- **identity:** stream의 세션 id가 lease의 UUID와 같으면 `{level:'runtime-observed', source:'gemini-stream-session'}`입니다. 다르거나 없으면 `execution_identity_unverified`(Phase A 기존 의미)입니다.
- **model:** stream이 보고하는 모델이 요청값과 같으면 runtime-observed, 다르면 `model_effort_mismatch`, 없으면 unverified입니다.
- **effort:** 항상 `{level:'unverified', source:'none', requested:'default', observed:null}`입니다. Claude transcript를 찾지 못했을 때와 같이 처리하여 이것만으로 hold되지 않게 합니다. 이 비차단 처리가 Claude 경로의 현행 동작과 같은지는 계획 단계에서 확인합니다.
- **result:** 종료 이벤트의 최종 응답 텍스트를 `resultFile`에 씁니다(claude 방식). 비정상 종료와 빈 결과는 `invalid_output`/`execution_failed`입니다.
- **권한 사후 탐지:** 기존 `snapshotWorktree`/`detectViolations`를 그대로 씁니다(10.3).
- **delegation 탐지:** Gemini가 하위 agent를 띄웠는지 stream에서 식별할 수 있는 이벤트 이름이 검증되면 `delegation_observed`를 연결합니다. 검증 전에는 탐지 불가로 기록합니다(U-B7).

### 8.3 취소

- 기존 supervisor 취소 경로를 씁니다(SIGTERM → `CANCEL_GRACE_MS` → SIGKILL). Gemini 전용 처리는 없습니다. 자식 프로세스 트리 정리는 U-B8입니다.

### 8.4 상태 저장

- lease v2에 `targetPlatform:'gemini'`, `sessionId:<uuid>`를 기록합니다.
- artifact 디렉터리는 기존 `<gitCommonDir>/arc/workflows/<wf>/dispatches/<id>/`이고 segment 규칙도 같습니다.

### 8.5 재개 (Q5)

- help상 `--resume`은 `latest` 또는 index만 받습니다. index와 latest는 동시 실행 중에 다른 세션을 가리킬 수 있어 쓰지 않습니다.
- 재개는 다음 두 방법 중 하나가 live로 검증되어야 합니다(U-B9).
  - (a) `--resume <uuid>` 수락
  - (b) `--session-file <ARC가 보존한 세션 파일>`
- 재개 후 관찰된 세션 id가 lease의 id와 다르면 `execution_identity_unverified`입니다(Phase A 기존 규칙).
- 확정(Q5): `bridge` verified의 조건은 run/observe/cancel입니다. 재개는 impl 내부 플래그 `resume:'verified'|'off'`로 분리하고, off이면 resume 요청을 새 reason `resume_unverified`로 hold합니다. `CAPABILITY_KEYS`는 바꾸지 않습니다.

## 9. capability 검증 절차와 증거

### 9.1 원칙

- 모든 Gemini capability는 `off`로 시작합니다(결정 4).
- `verified`로 바꾸는 변경은 다음 세 가지를 한 커밋에 담습니다(결정 16).
  1. descriptor 상태 변경과, 테스트에 고정된 verified 집합 갱신
  2. 구현 계획 진행 기록 행과 커밋 메시지에 9.3 항목 기록
  3. 해당 capability의 회귀 테스트
- live 검증은 실제 인증된 Gemini CLI와 네트워크가 필요하므로 Orchestrator가 사용자 환경에서 실행합니다. specialist sandbox에서는 실행하지 않습니다.
- 전환은 Phase B 안에서 코드 작업이 끝난 뒤 순차로 진행합니다(Q6). 순서는 install → catalog → nativeProfile → standalone → bridge → compositeRole → compositeHost이며, 증거를 얻지 못한 capability는 off인 채 Phase B를 끝냅니다.
- 자동 테스트는 주입 레지스트리(capability on)와 fake `gemini` 실행 파일(stream-json fixture 재생)로 코드 경로를 검증합니다. live 검증은 외부 계약만 확인합니다.

### 9.2 capability별 검증 항목

| capability | 초기 `reason` | live 검증 항목 | 통과 조건 |
|---|---|---|---|
| `install` | `install layout not verified` | 임시 HOME에 설치하고 `gemini -p`가 GEMINI.md 블록과 ARC skill을 인식하는지 확인(skill 목록 또는 응답 내 고정 토큰). 제거 후 잔여물 확인 | 토큰 확인, 제거 후 ARC 소유 파일 0개 |
| `nativeProfile` | `native profile format not verified` | `~/.gemini/agents/arc-routing-scouter.md`가 로드되어 지정 model로 실행됨. revision tag 변경 후 새 세션에서 새 revision이 보임 | 로드 + model 일치 + 재로드 |
| `catalog` | `catalog not verified` | `gemini --list-models` 출력과 Gemini API `models.list`(헤더 키) 수집. 5.3 후보 모델마다 `-m <model> -p` 최소 실행 1회 이상 | 카탈로그 모델마다 `accepted` 또는 `listed (quota-blocked)`(listing 출처 1개 이상, 실패가 429/503뿐). 명시 거부 모델 0. 역할 기본 모델은 `accepted` |
| `standalone` | `standalone not verified` | 선행 3종 + Gemini 단독 ARC에서 역할 1개 native 위임 | 위임 성공 |
| `bridge` | `bridge contract not verified` | claude-cli host와 codex-cli host 각각에서 Gemini 역할 run → observe → cancel. 세션 id 일치, model 관찰, 결과 파일, read-only 역할의 쓰기 0건 | 두 host 모두 통과(P-B5) |
| `compositeRole` | `composite role not verified` | `bridge` + composite(Claude+Gemini, Codex+Claude+Gemini) publish/routingStatus/prepare | prepare가 v2 lease 기록 |
| `compositeHost` | `composite host not verified` | Gemini 세션 안에서 runtime 명령(`routing-status`, `prepare-dispatch`) 호출, native 위임, 다른 플랫폼 bridge. 11장 host sandbox 쓰기 확인 | 11장 GG2 통과 |
| `authProbe` | `no official auth status command` | 해당 없음 | Phase B 내 off 유지 |
| `watch` | `watch support out of scope` | 해당 없음 | off 유지 |

### 9.3 증거 형식

증거는 저장소 파일로 두지 않습니다(결정 16, P-B8). capability를 전환하는 작업의 구현 계획 진행 기록 행과 전환 커밋 메시지에 다음 항목을 적습니다.

- capability, `gemini --version` 원문, OS와 host, ARC commit
- 실행 명령 요지(비밀값 제거)
- 관찰 결과: stream-json 발췌(세션 id, model 필드, 종료 이벤트), 결과 파일 해시, 쓰기 탐지 결과
- 판정 `pass` 또는 `fail`과 실패 사유, 실행자와 일시
- catalog 전환은 `accepted (live -m)`, `listed (quota-blocked)`(출처 cli/api, 코드 429/503), `excluded (rejected)` 세 목록과 API 응답 원문 필드 이름(`models`, `name`, `supportedGenerationMethods`, `nextPageToken`)을 함께 적습니다(결정 14, U-C2).

규칙:
- 개인 정보·토큰·계정 이메일은 기록하지 않습니다.
- 2026-11-16 Phase B의 증거 파일 원문은 커밋 `084d80f`까지의 Git 이력에서만 볼 수 있습니다.
- 테스트 `gemini-capability-evidence.test.mjs`는 다음을 검사합니다.
  - 운영 registry의 verified capability 집합이 테스트에 고정한 목록과 같습니다. 전환은 이 목록을 함께 바꿔야 합니다.
  - 6.1 선행 조건이 지켜집니다.
  - `supportedVersions`가 테스트에 고정한 range와 같습니다.
  - catalog가 verified이면 정적 카탈로그 모델이 모두 `selectGeminiCatalogModels`를 통과합니다. 테스트에 고정한 live 거부 모델(`gemini-2.5-pro`, `gemini-2.5-flash-lite`)은 카탈로그에 없습니다. 역할 기본 모델은 테스트에 고정한 live accepted 목록 안에 있습니다.

### 9.4 버전 고정

- `supportedVersions`는 증거가 있는 minor만 포함합니다. 초기값은 `>=0.68.0 <0.69.0`입니다.
- 새 minor를 추가하려면 verified capability 전부의 회귀 live 검증 증거가 필요합니다.
- range 밖 버전은 TUI/management에서 `unsupported version`이고, runtime routingStatus 보고에 `cliVersion`이 range 밖으로 표시됩니다. Phase A 동작과 같습니다.

### 9.5 검증 전 상태의 표면 동작 요약

| 표면 | 동작 |
|---|---|
| TUI 홈 | `Gemini: Not verified`(5.6) |
| TUI 도식·편집기·Hosts | `Unavailable (capability not verified)`. 선택·체크 불가 |
| TUI Uninstall | 설치 흔적이 없으면 `(not installed)`. 흔적이 있으면 제거 가능(P-B3) |
| management | `target:'gemini'` 설치 거부. `all`에서 제외. composite `platforms`에 gemini가 있으면 게이트 거부. 파일 무변경 |
| runtime | gemini host/role이 포함된 활성 설정이 있어도 `capability_not_verified` hold(7.2). v1 Codex+Claude 경로 무영향 |
| status | 레지스트리 순회에 포함. 인증 `unknown`, 버전 보고 |

## 10. 위험 (a) 권한 의미 차이

### 10.1 차이

- Claude bridge는 `--tools` 화이트리스트와 `--permission-mode`를 씁니다. Codex bridge는 `sandbox_mode`(read-only / workspace-write)와 `approval_policy="never"`를 씁니다.
- Gemini의 해당 옵션은 의미가 다릅니다(help 근거).
  - `--allowed-tools`는 "확인 없이 실행할 도구" 목록입니다. 제한이 아니라 auto-approve를 넓히는 옵션이며 deprecated(Policy Engine 권장)입니다. ARC는 쓰지 않습니다.
  - `--approval-mode`: `default`(확인 요청), `auto_edit`(편집 도구 자동 승인), `yolo`(전체 자동 승인), `plan`(read-only)
  - `--policy`: Policy Engine 정책 파일. 규칙 형식은 미검증입니다(U-P1).
  - `-s/--sandbox`: OS sandbox. 범위는 미검증입니다(U-P2).
- headless(`-p`)에서 확인이 필요한 도구 호출이 거부되는지, 멈추는지, 실패하는지는 미검증입니다(U-P3).

### 10.2 역할별 매핑

| 역할 | 의도 | Gemini 매핑 | Phase B 초기 상태 |
|---|---|---|---|
| Scouter / Planner / Reviewer | read-only | `--approval-mode plan` + ARC read-only policy 파일(쓰기·셸 deny) | `bridge` verified 시 실행 허용. 사후 탐지로 쓰기 0건 확인 |
| Implementer | worktree 쓰기 | `--approval-mode auto_edit` + ARC policy(허용 경로 밖 쓰기 deny, 셸은 필요한 범위만 allow) + `--sandbox` | **hold**: `permission_scope_unverified` |
| QA | worktree 쓰기 + 셸(테스트 실행) | `auto_edit` + 셸 allow policy + `--sandbox` | **hold**: `permission_scope_unverified` |

- Implementer/QA hold는 현행 Claude 쓰기 역할의 hold와 같은 구조입니다(현행은 G1 sandbox 설정이 기록되기 전까지 `permission_scope_unverified`).
  - 새 gate `GG1`(Gemini 쓰기 역할 정책·sandbox 시행 검증)을 `BRIDGE_GATE_RESULTS`에 추가하고 초기값을 `fail`로 둡니다.
  - `bridgeGateReasons`에 `platform==='gemini' && 쓰기 역할 && GG1!=='pass'` → `permission_scope_unverified` 규칙을 추가합니다.
- `yolo`로 쓰기 역할을 풀어 주는 방식은 쓰지 않습니다(Q8 확정).
- native route(host=gemini)의 권한은 Phase A와 같이 prompt 계약(`operator-attested`, `prompt-contract`)입니다.

### 10.3 ARC 사후 탐지로 증명할 수 있는 범위

| 증명 가능(`detectViolations`) | 증명 불가 |
|---|---|
| worktree의 tracked·untracked 파일 변경(gitignored 제외), 허용 경로 밖 변경 | worktree 밖 쓰기(`~`, `/tmp`, 다른 저장소, `~/.gemini`) |
| HEAD/branch 변경, ref 변경 | gitignored 파일 변경, `.git` 내부의 refs 외 변경(config, hooks) |
| read-only 역할의 worktree 변경 1건 이상 → `permission_violation_observed` | 실행 중 바꿨다가 종료 전에 되돌린 변경 |
| | 네트워크·외부 부작용(push, API 호출, MCP 도구 효과), 비밀 읽기 |
| | Gemini가 실제로 plan/policy를 시행했는지 여부(사전 차단의 증명) |

- claims는 다음과 같이 기록합니다.
  - read-only 역할의 `permissions`: `{level:'runtime-observed', source:'worktree-snapshot', details:'git-visible worktree only'}`
  - 쓰기 역할: GG1 통과 전까지 실행 자체가 hold
- README와 harness 문서에 "Gemini 역할 권한은 사후 탐지로 git-visible worktree 범위만 확인된다"를 적습니다.

## 11. 위험 (b) 새 home sandbox 쓰기 미검증

| 경로 | 쓰기 주체·대상 | 위험 | Phase B 처리 |
|---|---|---|---|
| 설치기(TUI/management) | 사용자 터미널의 `arc`가 `~/.gemini`에 씀 | 낮음. 사용자 권한 | `install` 검증에 포함 |
| Gemini host → runtime 명령 | Gemini 셸 도구 안의 runtime이 anchor home(lock, store)에 쓰고 detached supervisor 유지 | Gemini approval/sandbox가 home 밖 쓰기나 장기 프로세스를 막을 수 있음 | 새 gate `GG2` 초기값 `fail`. `bridgeGateReasons`에 `hostPlatform==='gemini' && GG2!=='pass'` → `host_sandbox_blocked`. native 위임만 쓰는 경우도 lease 기록이 anchor home 쓰기이므로 `compositeHost` 검증에 GG2 포함 |
| Codex host → Gemini 자식 | 기존 G2 escalation 경로 + 자식 Gemini가 `~/.gemini`(세션·로그)에 씀 | Codex sandbox가 `~/.gemini` 쓰기를 막을 수 있음 | 기존 G2 규칙 유지. `bridge` 검증 증거에 codex-cli host 결과 필수(9.2) |
| Claude host → Gemini 자식 | 자식이 `~/.gemini`에 씀 | Claude 세션 권한에 따라 다름 | `bridge` 검증 증거에 claude-cli host 결과 필수 |
| 자식 Gemini `--sandbox` | Seatbelt 등이 `~/.gemini`·결과 경로 쓰기를 막을 수 있음 | 결과 파일·세션 저장 실패 | GG1 검증 항목에 포함. 결과 파일은 supervisor가 쓰므로 자식 sandbox와 분리 |

- 어느 경로든 실패는 hold로 끝납니다(`host_sandbox_blocked`, `execution_failed`). 우회 옵션(`--yolo`, sandbox 끄기)으로 자동 전환하지 않습니다.

## 12. Phase A 후속 결함 F4–F6 (첫 작업)

운영 레지스트리가 2개일 때는 발생하지 않지만, Gemini 등록과 함께 운영 경로가 되는 결함입니다.

| ID | 현상 | 3번째 플랫폼에서 드러나는 이유 | 수정 요구 |
|---|---|---|---|
| F4 | `status`/`upgrade`가 composite면 S 참여 여부와 무관하게 모든 home의 standalone 검사·갱신을 건너뜀. `lib/installer/upgrade.mjs`가 registry를 전달하지 않음 | S={codex,claude}이고 Gemini standalone이 있거나, S={claude,gemini}이고 Codex standalone이 있으면 S 밖 standalone이 갱신·보고되지 않음 | composite에서는 S의 home만 composite 경로로 처리하고, S 밖 home은 standalone 규칙(Phase A 6.4.7)으로 검사·갱신. upgrade 경로 전체에 context registry 전달 |
| F5 | runtime `locateAnchorHome`(`lib/runtime/role-routing.mjs`)이 marker의 `activeConfigPath` 디렉터리를 검증 전에 lock 생성과 terminal lease 정리에 씀 | 새 home(`~/.gemini`)의 marker 하나가 임의 디렉터리에 lock 파일 생성과 lease 삭제를 유발할 수 있어 신뢰 경계가 넓어짐 | lock 생성 전에 후보 디렉터리가 등록 플랫폼의 해석된 home 중 하나와 정확히 같은지 확인. terminal lease 정리는 lock 안의 전체 검증(Phase A 6.9.4) 통과 뒤에만 수행. 실패는 파일 생성 없이 `activation_unverified` |
| F6 | `prepareLockHome`(`lib/installer/role-routing.mjs`)이 경로의 symlink 구성요소를 모두 거부 | dotfile 관리로 `~/.gemini`나 `~/.claude`를 symlink로 두면 설치와 composite publish가 거부됨. 조사 결과 설치기(`lib/installer/targets.mjs` `inspectPath`)와 runtime(`lib/runtime/scope.mjs` `inspectPath`, lock 획득, 파일 검증)도 모두 symlink 조상을 거부하므로 두 판정은 이미 같음(개정 v2) | **현행 정책 유지**(결정 11): symlink home은 지원하지 않습니다. 설치기 `prepareLockHome`과 runtime lock이 같은 판정(symlink 조상 거부, 파일 무변경)을 낸다는 테스트로 고정하고, README와 harness 문서에 '플랫폼 home과 그 조상은 symlink일 수 없다'를 적습니다 |

- **의존 관계:** F4–F6 수정은 Gemini descriptor 등록 작업의 선행 작업입니다. 주입 레지스트리(zeta)로 RED → GREEN을 확인합니다.
- **테스트 전용 후속 과제(Q1 확정):** F7a(host marker 재확인 테스트의 lstat 호출 횟수 의존 제거)와 F1 비anchor 참여 플랫폼(zeta) switch 테스트를 테스트 전용 작업 하나로 포함합니다. Gemini가 비anchor 참여 플랫폼이 되므로 F1 경로가 운영 경로가 됩니다.

## 13. 수용 기준

| ID | 기준 | 검증 |
|---|---|---|
| AC-F4 | composite 중 S 밖 home의 standalone이 status에 보고되고 upgrade에서 갱신된다. S home은 composite 규칙대로 처리된다. upgrade가 context registry를 쓴다 | integration(zeta 주입, 운영 codex+claude 무변경) |
| AC-F5 | 등록 home이 아닌 `activeConfigPath`를 가리키는 marker로 runtime 명령을 실행하면 lock·파일 생성과 lease 삭제가 0건이고 결과는 `activation_unverified`다 | unit/integration `role-routing-anchor` |
| AC-F6 | home(또는 조상)이 symlink인 환경에서 설치기 anchor 이동 publish(`prepareLockHome` 경로)와 runtime lock 획득이 모두 거부되고 파일이 바뀌지 않는다. 같은 경로 조합에서 두 판정이 일치한다. README와 harness 문서에 제한이 적혀 있다 | integration(임시 symlink home), 문서 grep |
| AC-F7 | F7a 테스트가 lstat 호출 횟수에 의존하지 않고 같은 동작을 검증한다. 비anchor 참여 플랫폼 switch가 테스트로 고정된다 | 테스트 전용 |
| AC-G1 | 운영 레지스트리 id·순서가 anchor와 display 모두 `claude, codex, gemini`이고 두 레지스트리가 일치한다(AC-P1 확장). 금지 패턴 검사가 통과한다 | `platform-registry` |
| AC-A1 | Codex home의 v1 설정 + 정상 marker·프로필은 `legacyAnchor:true`인 composite로 판정된다. Codex home의 v2 설정, 양쪽 home의 설정, marker 불일치는 `unverified`다. legacy가 아닌 반환값에는 `legacyAnchor` 필드가 없다 | unit `install-mode-*` |
| AC-A2 | legacy 상태에서 Install / Update(TUI와 management)가 Claude home에 v2 설정을 기록하고, 모든 S marker를 재기록하고, Codex home 설정을 제거한다. `<CODEX_HOME>/arc-role-dispatch/`는 바이트 그대로 남는다. 결과에 `Dispatch history stays in …`와 management `anchorMove`가 보인다 | integration(fixture: Phase A 형식 legacy composite) |
| AC-A3 | 두 store 중 하나라도 non-terminal lease가 있으면 마이그레이션이 held이고 파일이 바뀌지 않는다. 트랜잭션 실패 시 rollback 후 legacy 상태가 그대로 남는다 | integration |
| AC-A4 | legacy 상태에서 D1-b와 Uninstall이 이동 없이 성공한다. legacy 상태에서 runtime 명령은 `activation_unverified`이고 파일을 만들지 않는다. 패키지 설치·`arc upgrade`·status는 파일을 옮기지 않는다 | integration, runtime unit |
| AC-A5 | 마이그레이션 후 새 publish와 새 lease는 v2다. lock 획득 순서는 claude → codex → gemini다 | unit/integration |
| AC-W1 | watch가 marker의 anchor store를 읽는다: Claude anchor, Codex anchor(S={codex,gemini}), legacy(마커 후보 0 → `<CODEX_HOME>` 대체), 후보 2개 이상 → `dispatch store ambiguous`. 등록 home이 아닌 `activeConfigPath`는 후보가 되지 않는다 | unit/integration `watch-*` |
| AC-G2 | Gemini capability 전부 초기 `off`이고 `reason`이 9.2와 같다. 6.1 선행 조건을 어긴 descriptor는 생성 시 throw | unit |
| AC-G3 | capability가 off일 때 9.5 표의 모든 표면 동작이 성립한다. 특히 `target:'all'`과 기존 `all-targets`, `preset-cli`, `uninstall-cli` 테스트가 무변경 통과 | unit/integration, PTY |
| AC-G4 | `auth.kind:'none'`: probe 프로세스 미실행, `unknown`. role/host 게이트 통과 + `auth_unverified` 경고가 TUI(Hosts, 편집기 info, 사유 줄)와 management `warnings`에 보인다. CLI 미발견·range 밖은 차단된다 | `platform-availability`, `management-status`, `tui-setup` |
| AC-G5 | 주입 레지스트리(capability on)에서 Gemini standalone 설치·재설치·제거가 5.1/5.2를 만족하고 `settings.json`·사용자 파일을 보존한다. 소유 파일만 제거된다 | integration(임시 HOME) |
| AC-G6 | Gemini 카탈로그의 모든 effort가 `default`이고 `validatePair`가 다른 effort를 거부한다. TUI Effort 행이 `default` 고정이다 | unit `models`, `tui-custom-preset` |
| AC-G7 | native profile 렌더·소유 판정·routing 이름 변경·runtime 파서가 5.5 형식에서 왕복 일치하고 잘못된 형식을 거부한다 | unit `profile-render`, `role-bridge-args` |
| AC-G8 | 주입 레지스트리로 S={claude,gemini}, {codex,claude,gemini}의 publish가 v2 설정, anchor=min(S), 모든 S home marker를 만든다. Gemini 참여 D1-b/D1-e/anchor 이동이 Phase A AC-M3·M5·M8을 만족한다 | integration |
| AC-G9 | Gemini가 `install`·`standalone` verified인 주입 레지스트리에서 `target:'all'`이 Gemini를 포함하고, off인 운영 레지스트리에서는 {codex, claude}다 | unit/integration |
| AC-L1 | 새 lease는 항상 v2이고 `targetPlatform`을 갖는다. v1 lease는 3개 등록 레지스트리에서도 2-플랫폼 규칙으로 대상을 얻는다(읽기 호환). 잘못된 v2(대상∉S, native/bridge 규칙 위반, 키 불일치)는 거부된다 | unit `role-dispatch-store`, `role-bridge-*` |
| AC-L2 | 마이그레이션 후 Codex+Claude composite(Claude anchor)에서 prepare/run/observe/resume/cancel이 Phase A와 같은 결과를 낸다(store 위치만 다름) | integration |
| AC-L3 | watch `parseLeaseLenient`가 v2 lease를 v1과 같은 필드로 읽는다 | unit `watch-*` |
| AC-B1 | `buildGeminiArgs`가 역할별 10.2 매핑대로 인자를 만들고 `--allowed-tools`/`yolo`를 절대 포함하지 않는다. `--session-id`가 lease UUID와 같다 | unit `role-bridge-args` |
| AC-B2 | fake gemini(stream-json fixture)로 run → observe가 identity·model·effort claim(8.2), 결과 파일, `invalid_output`/`execution_failed`/`model_effort_mismatch`/`execution_identity_unverified`를 판정한다 | integration `role-bridge-run`, `role-supervisor` |
| AC-B3 | 재개: impl `resume` 플래그가 off이면 `resume_unverified` hold. on(주입)이면 검증된 재개 인자와 세션 id 일치 규칙을 따른다 | unit/integration |
| AC-B4 | Gemini Implementer/QA bridge는 GG1 `fail`에서 `permission_scope_unverified`, Gemini host bridge는 GG2 `fail`에서 `host_sandbox_blocked`로 hold된다. read-only 역할의 worktree 쓰기는 `permission_violation_observed`다 | unit `role-dispatch-policy`, integration |
| AC-B5 | runtime이 off capability의 host/대상에 대해 `capability_not_verified`로 hold하고 lease를 만들지 않는다 | unit `role-routing-*` |
| AC-V1 | 운영 registry의 verified 집합이 테스트 고정 목록과 같고, 선행 조건과 `supportedVersions` range가 지켜진다(결정 16) | `gemini-capability-evidence` |
| AC-G10 | `discoverGeminiCatalog`가 키를 `x-goog-api-key` 헤더로만 보내고(URL·결과·오류에 키 없음), 5.3 선택 규칙·페이지·redirect·키 포함 id 거부·`unavailable` 코드를 지킨다. `discoverModelCatalog`는 `GEMINI_API_KEY`만 쓰고 `source:'gemini_api'`, `cliAccountVerified:false`를 붙이며, catalog off면 fetch 없이 `capability_not_verified`다. Anthropic·Codex discover 결과는 무변경이다 | unit `gemini-catalog-discover`, `model-catalog` |
| AC-V2 | 정적 카탈로그가 `selectGeminiCatalogModels`를 그대로 통과하고, 고정한 live 거부 모델이 없으며, 역할 기본 모델 ∈ 고정한 live accepted 목록이다(결정 16) | `gemini-capability-evidence`, `gemini-platform` |
| AC-D1 | 6.6 문구 일반화가 반영되고, coordination.md·instruction-contract fixture가 `Mixed routing` 일반화(Q3)라는 의도된 변경만 갖는다 | asset/fixture 테스트 |
| AC-R1 | `role-policy.json` 변경은 각 role `controls`의 `gemini` 키 추가와 `platforms.gemini` 항목 추가(결정 12)뿐이고, codex/claude 생성물이 바이트 단위로 같다(Q4) | `check:role-policy`, role-policy 테스트 |
| AC-P2' | Phase A AC-P2 검사 목록이 모두 통과한다(16장) | 전체 |

## 14. 테스트 전략과 영향 파일

- **신규 테스트**
  - `gemini-platform.test.mjs`(G1, G2, G6, G7, G9)
  - `gemini-install.test.mjs`(G5)
  - `gemini-bridge.test.mjs`(B1–B4)
  - `dispatch-lease-v2.test.mjs`(L1, L2)
  - `anchor-migration.test.mjs`(A1–A5)
  - watch anchor 탐색 테스트(W1, 기존 `watch-*`에 추가 가능)
  - `gemini-capability-evidence.test.mjs`(V1, V2)
  - `gemini-catalog-discover.test.mjs`(G10)
  - F4–F7 회귀 테스트(기존 `install-mode-n-platform`, `role-routing-anchor`에 추가 가능)
- **fixture**
  - `tests/node/fixtures/gemini/stream-*.jsonl`(fake 출력)
  - fake `gemini` 실행 파일 helper(Node 스크립트, PATH 주입)
  - 운영 코드는 fixture를 import하지 않습니다(asset check).
- **주로 바뀌는 코드**
  - runtime: `lib/runtime/platform-registry.mjs`, `role-bridge-args.mjs`, `role-supervisor.mjs`, `role-observe.mjs`, `role-bridge.mjs`(`leaseTargetPlatform`), `role-dispatch-store.mjs`(v2), `role-routing.mjs`(F5, capability hold, lease 기록), `role-dispatch-policy.mjs`(GG1/GG2, reason code, 문구), `local-cli.mjs`
  - 설치기: `lib/platforms/{gemini,index}.mjs`, `lib/platforms/formats/*`, `lib/installer/upgrade.mjs`(F4), `lib/management/{status,operations}.mjs`
  - 마이그레이션·watch: `lib/installer/install-mode.mjs`(또는 `readInstallMode` 소재 모듈, legacy 판정), `lib/installer/role-routing.mjs`(anchor 이동 트리거), `lib/management/operations.mjs`(`anchorMove`), `lib/watch/index.mjs`, `lib/watch/dispatch.mjs`
  - 기타: `lib/models/gemini-models.json`, `lib/models/catalog-gemini.mjs`(신규, 결정 14), `lib/models/catalog.mjs`(키·source 표, capability 게이트), `lib/platforms/gemini.mjs`(`discover`), `gemini/skill/models.toml`·`gemini/agents/arc-*.md`(기본 모델, 결정 13), `lib/tui/*`(상태줄·경고 표시, legacy 미리보기 줄), `lib/policy/role-policy.json`(Q4)
  - payload와 문서: `gemini/**`, `codex|claude/skill/references/coordination.md`(Q3)
- **기대값이 바뀌는 기존 테스트:** release condition 문구 단언, 운영 레지스트리 순서·개수를 단언하는 registry 테스트, TUI 플랫폼 목록·Hosts·Uninstall 스냅샷(Gemini 행 추가), instruction-contract fixture(Q3). 결정 10으로 **Codex+Claude composite의 anchor·경로를 `<CODEX_HOME>`으로 단언하는 테스트 전부**(AC-M7 fixture, `install-mode-*`, `role-routing-*`, `role-bridge-*`, `composite-*`, management composite 테스트, 운영 레지스트리 바이트·경로 동일성 `hardcoding-residual`)가 Claude home 기대값으로 바뀝니다. 계획 단계에서 이 목록을 grep으로 확정하고, 바뀌는 단언마다 old → new 대응표를 남깁니다(Phase A Task 16 방식).
- **이관 원칙:** 기존 테스트의 기대 경로만 바꾸고 검사 강도(검사 항목 수, 실패 조건)는 줄이지 않습니다. 기존 `<CODEX_HOME>` 경로 동작은 legacy fixture 테스트(AC-A1–A4)로 따로 보존합니다.
- **무변경으로 통과해야 하는 테스트군:** Phase A 10장 목록 중 anchor 위치를 단언하지 않는 것 전부. 특히 standalone 경로, `all-targets`, `preset-cli`, `uninstall-cli`, `watch-*`의 세션 정규화
- **live(수동, Orchestrator):** 9.2 항목. `composite-live`처럼 환경변수로 켜는 live 전용 테스트를 둘지는 builder가 정합니다.

## 15. 문서, README, MANIFEST, parity, role-policy, runtime-assets

- `README.md`
  - Gemini 지원 범위와 capability 상태(검증 전 `Not verified`)
  - 인증 unknown과 경고
  - 권한 사후 탐지 범위(10.3)
  - anchor 순서 변경과 기존 composite 마이그레이션(6.7): 업그레이드 후 Install / Update 때 Claude home으로 이동, 진행 중 dispatch가 있으면 보류, 이전 기록은 Codex home에 남음, 다운그레이드 한계
  - watch의 anchor 탐색과 Gemini 세션 미지원(7.3)
  - effort `default` 고정
  - `target:'all'`에 verified Gemini가 포함됨(6.5)
- `docs/harness-operation.md`
  - lease v2와 `targetPlatform`
  - anchor 순서(claude > codex > gemini), legacy 판정, 마이그레이션 절차와 held 해제 방법
  - anchor home 문구 일반화
  - GG1/GG2 hold와 해제 조건, `resume_unverified`, `capability_not_verified`
  - 증거 기반 capability 전환 절차
- `*/skill/references/coordination.md`, `instruction-contracts.json`: `Mixed routing` 일반화(Q3).
- 갱신 의무: `MANIFEST.sha256`(`scripts/update-manifest.mjs`), `shared/skill/runtime/`(`scripts/update-runtime-assets.mjs`), `installed-layout-golden.json`(gemini 레이아웃, 신규 runtime 모듈이 있으면 추가), `tests/installer-parity.json`(필요할 때만), `role-policy.json`과 생성물(Q4. codex/claude 생성물 무변경), `package.json` `files`(`gemini/` 포함 확인)
- runtime 모듈이 바뀌면 runtime hash가 바뀌므로 기존 composite는 업그레이드 후 Install / Update가 필요합니다. 결과 문구는 현행 그대로입니다.

## 16. 검증

- **기준선:** 시작 시점 `npm test` 기준 실패는 36건입니다. Phase A 종료 시 37건이었고 origin/master 병합(`739da7f`) 후 36건이 되었습니다. 이름 목록은 Orchestrator가 보관하고 구현 계획의 진행 기록에 남깁니다.
- **판정 원칙:** 신규 실패 0건이어야 합니다. 기준 목록 밖의 실패는 파일 단위로 단독 재실행합니다. 단독으로 통과하면 부하 의존 실패로 기록하고, 단독으로도 실패하면 신규 실패로 취급하여 수용을 보류합니다.
- **작업별 최소 검증:** 작업 단위 테스트 + `npm test` + 아래 검사. TUI를 바꾸는 작업은 PTY 테스트가 필수입니다.
  - `npm run check:manifest`
  - `npm run check:role-policy`(Q4에 따른 기대 생성물)
  - `node scripts/update-runtime-assets.mjs --check`
  - `installed-layout-golden.json`, `instruction-contracts.json`
  - `scripts/check-installer-parity.mjs`
- **live 검증:** 9장 절차. 자동 테스트 통과가 live 증거를 대신하지 않습니다.
- **최종:** 모든 작업이 수용된 뒤 전체 변경에 대해 독립 Reviewer 1회를 둡니다(고위험 계획 작업).
- **추가 최종 검토(결정 14):** 첫 최종 Reviewer 이후 추가된 변경(discover 구현, catalog 전환, 이어진 capability 전환)은 모두 수용된 뒤 그 범위에 대해 독립 Reviewer를 1회 더 둡니다.

## 17. 범위 밖

- `arc watch`의 Gemini 세션 탐색·표시(7.3)
- Grok
- Gemini Desktop, TUI·management의 discover 사용(Claude/Codex와 같음), 계정 자격을 반영하는 모델 목록(listing은 자격 비반영, U-C2), 공식 인증 probe
- 마이그레이션 이후 이전 ARC 버전으로의 composite 다운그레이드 보장(6.7.5). old anchor의 이동 전 dispatch 기록 조회(watch·runtime 모두)

## 18. 확정된 질문 (2026-11-16 사용자 결정)

1. **Q1** F7a와 F1 비anchor 참여 플랫폼 switch 테스트를 테스트 전용 작업 하나로 포함합니다(12장, AC-F7).
2. **Q2** ~~watch 코드는 무변경으로 두고 v2 lease 관용 파싱 회귀 테스트만 추가~~ → 결정 10(Q9)으로 변경: watch에 anchor 탐색을 넣고 v2 관용 파싱 회귀 테스트를 추가합니다. Gemini 세션 표시는 여전히 범위 밖입니다(7.3, AC-W1, AC-L3).
3. **Q3** coordination.md의 `Claude & Codex` 표기를 세 플랫폼 모두 `Mixed routing`으로 일반화하고 instruction-contract fixture를 갱신합니다(6.6, AC-D1).
4. **Q4** `role-policy.json`은 각 role `controls`에 `gemini` 키 추가만 허용합니다. codex/claude 생성물은 바이트 동일입니다(3장, AC-R1).
   - **결정 12(2026-11-16, Q4 보완):** Gemini payload의 정책 문구를 같은 생성기로 만들기 위해 `platforms.gemini = {level:'prompt', notice:'Role restrictions are prompt-level contracts, not a filesystem sandbox. Native tool restriction fields, observer hooks and Git guards are unverified. Use only available authorized tools; ARC does not write Gemini settings.json.'}` 추가를 허용합니다. 공통 runtime 정책 사본(`shared/skill/runtime/role-policy.json`)은 생성 스크립트로 동기화하며, 그 결과 설치된 runtime 정책 사본 바이트가 바뀌는 것은 runtime hash 변경과 같은 재설치 대상입니다. codex/claude의 렌더 생성물은 계속 바이트 동일입니다.
5. **Q5** `bridge`는 run/observe/cancel만으로 verified가 됩니다. 재개는 내부 플래그로 분리하고 검증 전에는 `resume_unverified`로 hold합니다(8.5, AC-B3).
6. **Q6** capability 전환은 Phase B 안에서 live 증거가 확보된 것부터 순차로 진행합니다. 증거가 없는 capability는 off인 채 Phase B를 끝냅니다(9.1).
7. **Q7** Gemini가 `install`·`standalone` verified가 되면 `target:'all'`에 포함합니다(6.5, AC-G9).
8. **Q8** Gemini Implementer/QA bridge는 GG1(정책·sandbox 시행) 검증 전까지 `permission_scope_unverified`로 hold하며 `yolo`는 쓰지 않습니다(10.2, AC-B4).
9. **Q9 (결정 10)** anchor 순서를 표시 순서와 맞춥니다(claude > codex > gemini). 기존 Codex+Claude composite는 Install / Update 때 Claude home으로 옮기는 전면 마이그레이션을 거치고, watch는 anchor를 탐색합니다. Phase A의 D-Anchor 순서와 AC-M7 반목표를 대체합니다(6.7, 7.3, AC-A1–A5, AC-W1).
10. **결정 13(2026-11-16T12:47:50Z)** 무료 API 키로 진행합니다. 다섯 역할 기본 모델은 `gemini-2.5-flash`이고, 신규 사용자에게 거부된 `gemini-2.5-pro`는 제거합니다(5.3).
11. **결정 14(2026-11-16)** Gemini 카탈로그 노출을 Claude/Codex와 같게 합니다. (a) 정적 JSON은 유료 모델을 포함한 전체 모델을 나열하고 (b) discover 함수를 추가합니다. 유료 모델은 CLI `--list-models` 또는 API `models.list` listing이 있고 live 거부가 quota(429/503)뿐이면 listed로 인정합니다. 명시 거부 모델은 제외합니다(5.3, 9.2, 9.3, AC-G10, AC-V2).
12. **결정 15(2026-11-16)** listing만 있는 후보는 live `-m` 1회 시도 후 분류합니다. preview 모델은 전부 제외합니다. discover는 deny 목록을 두지 않고, catalog off면 호출하지 않으며, 키 env는 `GEMINI_API_KEY`만 씁니다. TUI에 quota 경고를 붙이지 않습니다(Claude/Codex와 같음).

D-* 해석(원본 설계 기록 부재로 Phase A spec 본문 기준):

- D-GeminiEffort: 카탈로그 JSON의 effort가 모두 `default`이고 native profile에는 effort를 쓰지 않습니다.
- D-Auth-Unknown: `auth.kind:'none'`이면 경고와 함께 통과하고, CLI 미발견·버전 range 밖은 차단합니다.

## 19. Planner 판단 (검토 요청)

- P-B1 `GEMINI_CLI_HOME`이 설정되어 있으면 home 해석 실패(보수적)
- P-B2 `settings.json` 쓰기는 U-I2 검증 전 금지
- P-B3 capability off라도 기존 설치 흔적의 제거는 허용
- P-B4 홈 상태줄 Gemini 표시 어휘(5.6)
- P-B5 `bridge` verified는 claude-cli·codex-cli 두 host 증거가 모두 필요
- P-B6 새 lease는 항상 v2, v1은 읽기 호환만(7.1). Orchestrator 개정(결정 10 반영)
- P-B10 새 활성 설정은 S와 무관하게 항상 v2(6.2). Orchestrator 개정(결정 10 반영)
- P-B11 legacy 판정은 "Codex home의 v1 설정"으로만 한정(6.7.1). Orchestrator 개정
- P-B12 마이그레이션은 Install / Update 안에서만, 별도 확인 없이 미리보기 1줄만(6.7.2, 6.7.3). Orchestrator 개정
- P-B13 runtime은 legacy 상태를 지원하지 않고 `activation_unverified`(6.7.4). Orchestrator 개정
- P-B14 watch 후보 0개면 `<CODEX_HOME>` store 대체, 2개 이상이면 ambiguous(7.3). Orchestrator 개정
- P-B7 runtime capability 방어 hold `capability_not_verified`(7.2)
- P-B8 증거 기록 위치와 형식(9.3). 결정 16으로 파일 대신 계획 진행 기록과 커밋 메시지
- P-B9 모르는 stream 이벤트는 원문 기록, 분류 `unknown`
- P-B15 discover 출처는 Gemini API `models.list`(헤더 키). CLI `--list-models` 파싱은 쓰지 않음(5.3)
- P-B16 listed 증거는 listing + live `-m` 시도 1회 이상 + 실패 코드 429/503뿐(5.3, 9.3)
- P-B17 `discoverModelCatalog`는 catalog capability가 verified가 아니면 `capability_not_verified`(5.3)

## 20. 미검증 가정 (모두 해당 capability off에 연결)

- U-H1 `GEMINI_CLI_HOME`의 의미(home 자체인지 상위 디렉터리인지). `install`
- U-A1 공식 인증 상태 확인 명령 없음(help 기준). `authProbe` off 유지
- U-V1 `gemini --version` 출력이 순수 semver. 버전 판정 전체
- U-I1 `~/.gemini/GEMINI.md`가 전역 instruction으로 로드됨. `install`
- U-I2 `~/.gemini/settings.json`의 키 구조와 ARC 병합 안전성. `install`(P-B2)
- U-I3 Gemini에 subagent 동시성 설정 키 없음. `install`
- U-I4 skill 위치 `~/.gemini/skills/<name>/`, agents 위치 `~/.gemini/agents/`. `install`, `nativeProfile`
- U-N1/N2 native subagent의 파일 형식(md + YAML frontmatter, 필드 이름, 도구 제한 필드)과 재로드 동작. `nativeProfile`, `standalone`, `compositeHost`
- U-B1 `-p`와 stdin 결합 동작. `bridge`
- U-B2 system prompt 추가 옵션이 없어 instructions를 프롬프트에 합쳐야 함. `bridge`
- U-B3 `stream-json` 이벤트 스키마(세션 id, model, 종료·오류 이벤트). `bridge`
- U-B4 MCP 서버·확장 차단 인자의 실제 효과. `bridge`
- U-B5 인증·모델 거부 시 종료 코드와 메시지. `bridge`(`auth_rejected`, `model_rejected` 판정)
- U-B6 headless에서 workspace trust 확인이 실행을 막는지(`--skip-trust` 필요 여부). `bridge`
- U-B7 하위 agent 위임 이벤트 식별 가능 여부. `delegation_observed`
- U-B8 취소 시 자식 프로세스 트리 정리. `bridge`
- U-B9 `--resume <uuid>` 또는 `--session-file` 재개. 재개 플래그(Q5)
- U-P1 Policy Engine 정책 파일 형식과 deny 시행. GG1
- U-P2 `--sandbox`의 macOS 범위(`~/.gemini`, 결과 경로 쓰기). GG1, 11장
- U-P3 headless에서 확인이 필요한 도구 호출의 동작(거부/중단/실패). GG1, `bridge`
- U-P4 `--approval-mode plan`이 셸·쓰기를 실제로 막음. read-only 역할 `bridge`
- U-S1 Gemini 셸 도구 안에서 anchor home 쓰기와 detached supervisor 유지 가능. GG2, `compositeHost`
- U-C1 `gemini --list-models` 출력 형식과 카탈로그 모델 수락. `catalog`
- U-C2 Gemini API `models.list` 응답 형식(`models[].name`, `supportedGenerationMethods`, `nextPageToken`). listing은 계정 자격·quota를 반영하지 않음(`gemini-2.5-pro` 사례). `catalog`, discover

## 21. builder에게 남긴 것

- Gemini 형식 모듈 분리 여부, 함수 시그니처
- fake gemini helper 구현
- 진단·info 전문 문구(6.3 예시 수준 유지)
- live 전용 테스트를 환경변수로 켤지 여부

## 개정 이력

| Version | Approval time | Classification | Affected tasks | Reason |
|---|---|---|---|---|
| v1 | 2026-11-16 (anchor 순서 변경 반영본 승인) | 초기 승인 | — | — |
| v2 | 2026-11-16T00:42:34Z | 범위·수용 기준 변경 | T3, T8, T14 | F6 전제(설치기만 symlink 거부) 오류. 사용자 결정 11: 현행 정책 유지 + 판정 일치 테스트·문서화 |
| v3 | 2026-11-16 (사용자 결정 12) | 수용 기준 변경 | T11 | Gemini payload 정책 문구 생성을 위해 `role-policy.json` `platforms.gemini` 항목 추가 허용(Q4 보완, AC-R1 개정) |
| v4 | 2026-11-16T13:12:29Z (사용자 결정 13, 14, 15) | 범위·수용 기준 변경 | T15(신규), L2, L4–L6, FR2(신규) | 카탈로그 노출을 Claude/Codex와 같게: 정적 JSON 전체 GA 모델 + `discoverGeminiCatalog`. 비목표·범위 밖에서 discover 제거, 4.2·5.3·6.1·9.2·9.3·14·16·18·19·20 개정, AC-G10·AC-V2 추가. 기본 모델 `gemini-2.5-flash`, `gemini-2.5-pro` 제거 |
| v5 | 2026-11-17 (사용자 결정 16) | 검증 변경 | EV(신규) | 저장소 증거 파일 삭제. 증거 기록 위치를 계획 진행 기록·커밋 메시지로 바꾸고, 증거 테스트를 운영 registry·카탈로그 고정 검사로 교체(9.1, 9.3, AC-V1, AC-V2, P-B8) |
