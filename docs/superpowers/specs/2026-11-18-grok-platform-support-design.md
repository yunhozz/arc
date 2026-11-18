# Grok 플랫폼 지원과 홈 메뉴 개편 — 설계 명세

- 작성일: 2026-11-18
- 상태: 승인 대기. 근거는 승인된 설계(사용자 2026-11-18 "승인", 조건: README.md·docs/harness-operation.md는 최소 범위로 수정)입니다.
- 소스: `/Users/ma-24-007/Desktop/workspace/arc`, `master` `564ea20`(v0.4.2). 작업 대상: 브랜치 `feat/grok-support`(564ea20에서 생성).
- 경로: Architectural. spec 승인 후 구현 계획 `docs/superpowers/plans/2026-11-18-grok-platform-support.md`를 작성합니다.
- 선례: `docs/superpowers/specs/2026-11-16-gemini-platform-phase-b-design.md`(이하 "Gemini spec"). Gemini spec의 구속 결정(결정 10 anchor 순서, 결정 11 symlink home 미지원, 결정 16 증거 저장 방식)은 이 명세에서도 유지합니다.
- 외부 근거: 공식 Grok Build 공개 문서(2026-11-18 Scouter 조사)와 `npm view @xai-official/grok`(version 1.0.88, bin `grok`)입니다. CLI 실행으로 확인한 것은 하나도 없습니다. 미확인 계약은 U-K 번호로 적고(21장), 모두 해당 capability off와 연결합니다.

## 0. 승인된 결정과 추적표

| # | 결정(출처) | 다루는 절 |
|---|---|---|
| D1/D8 | Status에 들어갈 때 버전을 자동 조회합니다(`ui.busy`). 조회가 실패해도 플랫폼 상태는 표시하고, Version 행은 `<current> · latest unavailable`, Notes에는 사유 첫 줄을 넣고, Upgrade는 숨깁니다. `Operation unavailable` 페이지로 넘어가지 않습니다(사용자) | 13.2 |
| D2 | 현행 `canUpgrade` 조건을 유지하고 기본 커서는 Back입니다. 설치된 harness가 0개인데 새 버전이 있으면 Note `No installed ARC harness; run Configure first.`를 표시합니다. install mode가 unverified일 때의 허용 여부는 현행대로 둡니다(사용자) | 13.2 |
| D3 | grok의 `displayOrder`와 `anchorOrder`는 3입니다(gemini 뒤)(Orchestrator 기본값) | 4.1, 9 |
| D4 | 이름을 전면 교체하고 이전 이름 안내는 넣지 않습니다. 과거 specs/plans는 수정하지 않고 TUI 별칭도 두지 않습니다. 이미 설치된 payload는 다음 Configure 때 갱신됩니다(사용자) | 13.1, 14 |
| D5 | 접근안 A(Gemini 선례 복제)입니다. 허용 목록 파일 안에 `'grok'` 분기를 넣고, `lib/runtime/grok-stream.mjs`를 새로 만들고, impl Map에 grok을 추가합니다. 일반화 리팩터(B)는 이후 후보로만 기록합니다(사용자) | 3, 4, 8 |
| D6 | 활성화 이후의 auth 정책은 나중에 결정합니다. 지금은 off라 동작 차이가 없습니다(기본값) | 4.1, 20 |
| D7 | effort는 `default`로 고정하고 `--effort`를 전달하지 않습니다(기본값) | 4.1, 8.1 |
| D9 | `supportedVersions`는 `>=1.0.0 <1.1.0`(잠정)이며, 구현 시점의 npm 최신 minor로 다시 확인합니다(기본값) | 4.1, 11.4 |
| D10 | install이 off인 동안에는 `grok` 바이너리를 실행하지 않는 것으로 충분합니다(기본값) | 5.5 |
| D11 | native profile의 모델 적용 증거가 없으면 `nativeProfile`, `standalone`, `compositeHost`는 off를 유지합니다(사용자, O1) | 6, 11.2 |
| D12 | bridge·install을 켜려면 MCP/skills/agents 자동 로드를 차단할 수단이 있거나, 실제 로드 범위가 ARC 정책과 충돌하지 않는다는 live 증거가 있어야 합니다. 충돌이 관찰되면 off를 유지합니다(사용자, O3/O4) | 11.2, 18 |
| D13 | 관찰 형식은 `streaming-json`입니다. `streaming-messages-json`으로의 전환은 live 증거 후 spec 개정 대상입니다(Orchestrator 기본값, O2) | 8.3 |
| D14 | `update.mjs:56,58`의 `check the version again`은 유지합니다(Orchestrator 기본값, O5) | 13.1 |
| D15 | bridge 인자에 `--no-subagents`를 포함합니다(Orchestrator 기본값, O6) | 8.1 |
| D16 | `isolationEnv`는 `() => ({})`이고, 자동 업데이트 끄기는 bridge 인자와 자식 env로 둡니다(Orchestrator 검토 수용, P-K1) | 4.2, 8.1, 8.2 |

이 명세에서 새로 정한 Planner 판단(P-K)은 19장에 모았습니다.

## 1. 의도

ARC의 네 번째 플랫폼으로 공식 xAI Grok Build CLI(`@xai-official/grok`, 바이너리 `grok`)를 추가합니다. 코드·자산·관찰 경로는 전부 넣되, capability 9개는 모두 `off`로 출하합니다. live 검증 수단이 없으므로 이번 범위의 검증은 주입 registry와 fake `grok` fixture만으로 합니다. verified 전환 절차는 정의만 하고 실행하지 않습니다.

같은 변경에서 홈 메뉴의 `Install / Update`를 `Configure`로 바꾸고, `Check Version`을 `Status`에 합칩니다.

## 2. 목표, 비목표, 반목표

**목표**
- G1 runtime·설치기 registry에 `grok` descriptor를 등록합니다. capability 9개는 전부 off이고 키별 reason을 둡니다(4장).
- G2 Grok payload(`grok/**`), 설치·제거·상태·정적 카탈로그, native profile 형식을 구현합니다. 검증은 주입 registry(capability on) 테스트로만 합니다(5, 6장).
- G3 Grok bridge(인자, 프롬프트 파일 전달, stream 관찰, 취소)와 gate를 구현합니다. 쓰기 역할과 host 경로는 기본 hold입니다(8, 10장).
- G4 composite 참여 경로를 구현합니다(anchor/display 3, lock 순서, lease v2 `targetPlatform:'grok'`)(9장).
- G5 증거 기반 capability 전환 절차를 정의하고 `grok-capability-evidence` 고정 테스트를 둡니다(11장).
- G6 `Install / Update`를 `Configure`로 바꾸고 `Check Version`을 `Status`에 합칩니다(13장).

**비목표:** live 검증과 verified 전환, 커뮤니티 `grok-dev`, `arc watch`의 Grok 지원, xAI `/v1/models` discover, Grok auth probe, Desktop 등 CLI 외 실행 환경, 접근안 B(일반화 리팩터).

**반목표**
- 증거 없이 verified로 바꾸지 않습니다.
- `--always-approve`, `bypassPermissions`, `--sandbox off`, 확인을 우회하는 `--allow` 같은 우회 옵션을 쓰지 않습니다.
- ARC는 `~/.grok/config.toml`을 쓰지 않습니다.
- Claude/Codex/Gemini 생성물은 13.1의 Configure 문구 변경과 8.4의 resume 문구 일반화를 빼면 바이트 단위로 같아야 합니다.
- 과거 `docs/superpowers/{specs,plans}/**`는 수정하지 않습니다.
- management API의 `kind`/`target` 의미, 파일 이름, marker 형식을 바꾸지 않습니다.

## 3. 제약

- `lib/runtime/*`는 `lib/runtime` 안만 import합니다.
- 새 runtime 모듈 `grok-stream.mjs`를 추가할 때 다음을 같은 작업에서 함께 갱신합니다.
  - `RUNTIME_MODULE_PATHS`(`lib/installer/runtime-assets.mjs`)
  - `COOPERATIVE_RUNTIME_MODULES`(`lib/runtime/bootstrap.mjs:11`)
  - `MANIFEST.sha256`
  - `tests/node/fixtures/installed-layout-golden.json`
  - `node scripts/update-runtime-assets.mjs --check`
  - `shared/skill/runtime/` 사본
- runtime hash가 바뀌므로 업그레이드 후 Configure를 다시 실행해야 합니다(현행 정책에서 이름만 바뀜).
- symlink home은 지원하지 않습니다(Gemini spec 결정 11). `~/.grok`와 그 조상에도 적용합니다.
- `lib/policy/role-policy.json`은 각 role의 `controls.grok` 추가와 `platforms.grok` 추가만 허용합니다.
- capability 상태의 원천은 runtime descriptor입니다. 설치기는 이를 참조만 합니다.
- `'grok'` 리터럴 분기는 기존 하드코딩 허용 목록 파일 안에서만 허용합니다(4.3).

## 4. 레지스트리 등록

### 4.1 runtime descriptor (`lib/runtime/platform-registry.mjs`, shared 사본 동일)

| 필드 | grok | 비고 |
|---|---|---|
| `id` / `label` | `grok` / `Grok` | |
| `displayOrder` / `anchorOrder` | 3 / 3 | D3 |
| `home.env` | `GROK_HOME` | |
| `home.resolve` | `resolveHome('grok', ctx)`. `env.GROK_HOME !== undefined`이면 `throw Error('GROK_HOME is not verified')`, 아니면 `path.join(userHome, '.grok')` | Gemini 분기와 같은 형태(`GROK_HOME` 의미 미확인) |
| `cli.command` | `grok` | 커뮤니티 `grok-dev`와 이름이 같음(U-K1) |
| `cli.supportedVersions` | `'>=1.0.0 <1.1.0'` | D9 |
| `auth.kind` | `none` | probe 프로세스를 실행하지 않습니다 |
| `models.effortField` | `effort` | `models.toml` 저장 키. native profile에는 렌더링하지 않습니다 |
| `profile` | `ext:'md'`, `standaloneName: role => 'arc-'+suffix`, `routingName: role => 'arc-routing-'+suffix` | |
| `executionEnvironments` | `['grok-cli']` | |
| `routing.validatePair` | `validText(model) && /^[A-Za-z0-9][A-Za-z0-9._:/@+\-]*$/.test(model) && effort === 'default'` | D7 |
| `capabilities` | 9개 전부 `{state:'off', reason}`(11.2 표의 reason) | |

### 4.2 설치기 descriptor (`lib/platforms/grok.mjs`, 신규)

| 필드 | 값 |
|---|---|
| `runtime` | `getPlatform('grok')` |
| `payloadPrefix` | `'grok'` |
| `instructionTemplates` / `instructionFile` | `['AGENTS.md','instructions.md']` / `'AGENTS.md'`(ARC 소유 managed block) |
| `runtimeConfigFile` | `'config.toml'`(읽기 전용, 쓰지 않음) |
| `globalPaths` | `['AGENTS.md','config.toml']` |
| `models` | `staticCatalog: new URL('../models/grok-models.json', import.meta.url)`, `effortField`. `discover`는 정의하지 않습니다(`discoverModelCatalog`는 `unavailable`을 반환, `lib/models/catalog.mjs:33`) |
| `profiles` | `lib/platforms/formats/grok-markdown.mjs`의 `render/isOwnedStandalone/renameForRouting` |
| `runtimeConfig` | `{}`(동시성 키 없음) |
| `uninstallSummary` | `'Grok config.toml is preserved.'` |
| `isolationEnv` | `() => ({})`(D16) |

`DEFAULT_INSTALLER_REGISTRY`는 `[CLAUDE_INSTALLER, CODEX_INSTALLER, GEMINI_INSTALLER, GROK_INSTALLER]`가 됩니다(`lib/platforms/index.mjs:22`).

### 4.3 하드코딩 잔존 검사

`tests/node/hardcoding-residual.test.mjs:139`의 패턴을 `/===\s*['"](?:gemini|grok)['"]/`로 넓힙니다. 허용 목록은 바꾸지 않습니다. `'grok'` 분기가 들어가는 파일은 모두 기존 허용 목록 안에 있어야 합니다: `platform-registry.mjs`, `role-bridge-args.mjs`, `role-supervisor.mjs`, `role-dispatch-policy.mjs`, `role-routing.mjs`, `role-bridge.mjs`. 허용 목록 밖에 필요하면 계획 단계에서 Orchestrator에게 돌려줍니다.

## 5. 설치·제거·상태

### 5.1 설치 자산 (주입 registry에서 install on일 때)

- `~/.grok/AGENTS.md`: ARC managed block(기존 managed block 형식)
- `~/.grok/skills/arc/`: `SKILL.md`, `models.toml`, `settings.toml`, `limits.toml`, `references/*.md`, `runtime/`(기존 공유 runtime 규칙)
- `~/.grok/agents/arc-{scouter,planner,implementer,qa,reviewer}.md`: standalone profile(6장)
- `config.toml`은 읽지도 쓰지도 않습니다. `globalPaths`에는 넣어 보존 대상임을 표시합니다.

### 5.2 설치·제거 동작

- 설치는 anchor 순서, 제거는 display 순서입니다(기존 규칙).
- 제거 대상은 ARC 소유 파일뿐입니다: managed block, `skills/arc/`, 소유 판정을 통과한 `agents/arc-*.md`.
- capability가 off여도 설치 흔적이 있으면 제거를 허용합니다(TUI Uninstall과 management `kind:'uninstall', target:'grok'`).
- symlink home과 조상은 거부합니다(결정 11).

### 5.3 정적 카탈로그 (`lib/models/grok-models.json`)

- `{"platform":"grok","pairs":[{"model":"grok-4.6","effort":"default"}]}`
- `grok-4.6`은 공개 문서 설정 예시에서 확인된 유일한 모델 ID입니다. 다른 공개 모델 ID는 계획 단계에서 Scouter가 문서로 확인한 경우에만 추가합니다.
- 카탈로그는 패키지 후보일 뿐 계정 가용성 증거가 아닙니다.
- `grok/skill/models.toml`: version 3, 다섯 역할 모두 `model = "grok-4.6"`, `effort = "default"`
- `scripts/update-manifest.mjs`의 mutable 목록에 `grok/skill/models.toml`을 추가합니다.

### 5.4 auth

`auth.kind:'none'`입니다. install이 verified인 경우의 표시는 Gemini와 같습니다(`Available (auth unverified)`). 현재는 off라 `Not verified`입니다(D6).

### 5.5 상태 수집 (`lib/management/status.mjs`)

- `collectStatus`는 registry를 순회하므로 grok이 자동으로 포함됩니다. 설치 흔적 판정은 파일 읽기만 합니다.
- **일반 규칙(신규, P-K7):** `runtime.capabilities.install.state !== 'verified'`인 플랫폼은 `probeCliVersion`과 `probePlatformAuth`를 호출하지 않고 다음 값을 반환합니다.
  - `cliVersion: {version:null, reason:'capability_not_verified'}`
  - `authentication: {authStatus:'unknown', reason:'capability_not_verified'}`
  - `resolveLocalCli`는 PATH만 조회하므로(spawn 없음) 호출해도 됩니다.
  - 이 규칙은 리터럴 분기가 아니라 descriptor 기반이라 현재 다른 플랫폼에는 영향이 없습니다.
- `GROK_HOME`이 설정되어 있으면 `resolveTarget`이 실패해 상태가 `incomplete`가 되고, Notes에 `GROK_HOME is not verified (Grok)`가 표시됩니다. stateLabel은 install off이므로 `Not verified`가 우선합니다.

### 5.6 off 상태의 표면 동작 요약

| 표면 | 동작(정확 문자열) |
|---|---|
| TUI Status | 플랫폼 행 `Grok   Not verified`(정렬 폭은 13.2). `capability not verified`는 반복 문구라 Notes에서 빠짐 |
| TUI 도식·Hosts·편집기 | `Grok - Unavailable  (capability not verified)`. 선택·체크 불가. 역할 편집기 플랫폼 순환에서 건너뜀 |
| TUI Uninstall | 흔적이 없으면 `Grok  (not installed)`, 있으면 제거 가능 |
| management | `target:'grok'` 설치는 `Grok is not available: capability not verified`로 거부하고 파일은 바뀌지 않음. `target:'all'`은 verified만 대상으로 하므로 grok 제외. composite `platforms`에 grok이 있으면 같은 문구로 거부 |
| runtime | grok host/role이 포함되면 `capability_not_verified` hold, lease 미생성(`capabilityReasons`, `role-dispatch-policy.mjs:78`) |
| 프로세스 | `grok` 바이너리를 실행하지 않음(D10) |
| watch | grok은 `PLATFORM_COLORS.other`. 새 문구 없음 |

## 6. native profile 형식 (`lib/platforms/formats/grok-markdown.mjs`, runtime `parseGrok`)

- **형식:** Gemini와 같은 scalar 전용 YAML frontmatter입니다. 필드는 정확히 `name`, `description`, `model` 세 개이고, `effort`가 있으면 거부합니다. 본문(instructions)은 비어 있으면 안 됩니다.
- **`model` 필드:** Grok 공식 agent 스키마에는 `model`이 없고, 문서상 미지 필드는 무시됩니다. 따라서 이 명세에서 `model`은 **ARC 관리 메타데이터**로 정의합니다(P-K2).
  - bridge는 이 값을 `parseCompositeProfile('grok')`로 읽어 `-m`으로 전달합니다.
  - native 경로(Grok 세션 안에서의 위임)에서 Grok이 이 값을 적용한다는 보장은 없습니다. 그래서 `nativeProfile` 전환 증거에 "model 적용"을 포함하고, 증거가 없으면 `nativeProfile`, `standalone`, `compositeHost`는 off를 유지합니다(D11).
- **권한 관련 frontmatter:** `permissionMode`, `tools`, `disallowedTools` 등은 렌더링하지 않습니다(P-K3). 역할 제한은 prompt 계약입니다(12장).
- **소유 판정, routing 이름 변경, revision tag:** Gemini 형식과 같습니다. `name: arc-routing-<suffix>`, description 끝에 `[arc-routing rev <revision>]`, 본문에 `[ARC role policy: contract begin]`이 있어야 합니다.
- **runtime 파서:** `parseGrok`은 installer를 import하지 않는 독립 구현입니다(`role-bridge-args.mjs`). 반환값은 `{name, description, model, effort:'default', tools:null, instructions}`입니다.

## 7. payload (`grok/**`)

- **파일:** `grok/AGENTS.md`, `grok/instructions.md`, `grok/agents/arc-{scouter,planner,implementer,qa,reviewer}.md`, `grok/skill/SKILL.md`, `grok/skill/models.toml`, `grok/skill/references/{arc-visual-companion,limits,git-recovery,worktree-creation,coordination,planning,handoff,handoff-prep,commit,verification}.md`(gemini 목록과 같음)
- **coordination.md:** 처음부터 `run Configure again`으로 표기합니다(13.1).
- **함께 갱신:**
  - `lib/prompts/render.mjs`(생성 매핑), `lib/prompts/agent-fragments.json`
  - `scripts/update-manifest.mjs`(진입점 `grok`, mutable `grok/skill/models.toml`), `MANIFEST.sha256`
  - `package.json` `files`(`grok/`)
  - `tests/node/fixtures/{installed-layout-golden.json, installed-layout.mjs, instruction-contracts.json, static-references.mjs}`
- **기존 생성물:** Claude/Codex/Gemini 생성물은 13.1 문구 변경 외에 바이트 단위로 같아야 합니다(AC-K7).

## 8. Grok bridge (실행·관찰·취소)

이 장의 CLI 계약은 공개 문서에만 근거하며, 모두 `bridge` capability off에 연결됩니다.

### 8.1 실행 인자 (`buildGrokArgs`, `role-bridge-args.mjs`)

```
grok --prompt-file <segmentDir>/prompt.md --output-format streaming-json
     -m <model> --session-id <lease UUID>
     --permission-mode <role mode> --sandbox <role profile>
     [--deny <rule>]...  --no-auto-update --no-subagents
```

**인자 생성 규칙**
- `promptFile`: 절대 경로여야 합니다. `path.join(path.dirname(resultPath), 'prompt.md')`로 정해지는 결정적 경로라서 `argsDigest`가 prepare와 supervisor에서 같습니다.
- `sessionId`: UUID 정규식을 통과하지 않으면 throw합니다.
- `model`: `profile.model`에 4.1 정규식을 적용합니다. effort 인자는 만들지 않습니다(D7).

**`ROLE_BRIDGE_PERMISSIONS.grok`**

| 역할 | `permissionMode` | `sandbox` | `deny` |
|---|---|---|---|
| Scouter / Planner / Reviewer | `plan` | `read-only` | `GROK_CONTRACT.readOnlyDeny`(쓰기·셸 도구 rule) |
| Implementer / QA | `acceptEdits` | `workspace` | 없음. **GK1 hold로 실행되지 않음**(10장) |

- `plan`은 frontmatter 문서 값이고, CLI가 이 값을 받는지는 U-K4입니다.
- `readOnlyDeny`의 rule 문법과 Grok 내장 도구 이름은 U-K5입니다. 계획 단계에서 Scouter가 문서로 후보 값을 정하고, 정하지 못하면 빈 목록이 아니라 계획을 hold합니다.

**`GROK_CONTRACT`(`grok-stream.mjs`)**
- `outputFormat: 'streaming-json'`(D13)
- `isolationArgs: ['--no-auto-update', '--no-subagents']`(D15, D16)
- `childEnv: {GROK_DISABLE_AUTOUPDATER: '1'}`(D16)
- `eventKinds`(8.3)
- `successStopReasons: ['end_turn']`(U-K7)
- `resumeFlag: '--resume'`(예약)
- `delegation: 'undetectable'`

**절대 포함하지 않는 인자(테스트로 고정)**
- `--always-approve`, `--allow`, `-c`/`--continue`, `-r`/`--resume`(resume off), `--prompt-json`, `-p`/`--single`
- `--effort`/`--reasoning-effort`, `--sandbox off`, `bypassPermissions`
- `-m`의 값이 `-`로 시작하는 경우

### 8.2 프롬프트 전달 (`role-supervisor.mjs`)

- `buildBridgeInvocation`은 grok일 때 `promptFile: {path, instructions: profile.instructions}`를 반환합니다. 이 함수는 파일을 쓰지 않습니다. `role-bridge.mjs:57`의 prepare 경로도 digest 계산에만 이 함수를 씁니다.
- supervisor는 spawn 직전(`role-supervisor.mjs:221` 앞)에 프롬프트 파일을 기록합니다.
  - 열기: `fs.openSync(path, O_WRONLY|O_CREAT|O_EXCL, 0o600)`
  - 내용: `instructions + "\n\n" + brief`
  - 기록 후 `chmod 0600`
  - 실패(이미 존재, 쓰기 오류)는 child 없이 `earlyFailure('execution_failed')`로 끝납니다.
- spawn env는 `{...localCliEnvironment(cli), ...GROK_CONTRACT.childEnv, ARC_BRIDGE_CHILD}`입니다.
- spawn 직후 `child.stdin.end()`로 입력을 즉시 닫습니다(빈 입력).
- stdin 대신 `--prompt-file`을 쓰는 근거: headless 가이드는 stdin을 읽지 않는다고 하고 shell README에는 pipe 예시가 있어 두 문서가 어긋납니다. 이 선택을 유지합니다.
- `prompt.md`는 `brief.md`와 같은 artifact 보존 규칙을 따르며 삭제하지 않습니다.

### 8.3 관찰 (`SUPERVISOR_IMPLEMENTATIONS.grok`, `normalizeGrokStreamEvent`)

**이벤트 분류**
- 알려진 kind: `text`, `thought`, `tool_call`, `tool_call_update`, `usage`, `plan`, `available_commands`, `error`, `end`
- 그 밖의 행이나 JSON 파싱에 실패한 행은 `{kind:'unknown', raw}`로 원문을 기록합니다.

**정규화 필드**
- `end`: `sessionId`(문자열), `stopReason`
- 문자열 `model` 필드가 있는 known 이벤트: `model`
- `text`: 텍스트 본문. 필드 이름은 공식 문서 예시를 그대로 따르며, U-K6으로 계획 단계에서 문서 예시를 인용해 고정합니다.
- `thought`는 결과에 넣지 않습니다.

**판정 (`evaluateGrokObservation`)**
- **identity:** `end.sessionId === lease.sessionId`이고 불일치 기록이 없으면 `{level:'runtime-observed', source:'grok-stream-session', observed}`입니다. 그렇지 않으면 `execution_identity_unverified`입니다. Gemini처럼 cancel 시 예외(`cancelledBeforeIdentity`)와 `finalState='unknown'` 규칙을 grok에 확장합니다(`role-supervisor.mjs:360,386`).
- **model:** known 이벤트가 `model`을 보고하면 요청값과 비교합니다. 일치하면 runtime-observed(`grok-stream-model`), 불일치하면 `model_effort_mismatch`입니다. 보고가 없으면 `{level:'unverified', source:'none'}`이며 차단하지 않습니다.
  - `end.modelUsage`는 사용량 집계라 claim에 쓰지 않습니다. 원문은 events에 남습니다(D13).
- **effort:** 항상 `{level:'unverified', source:'none', requested:'default', observed:null}`입니다.
- **permissions(읽기 역할):** `{level:'runtime-observed', source:'worktree-snapshot', details:'git-visible worktree only'}`. 사후 탐지는 기존 `snapshotWorktree`/`detectViolations`를 그대로 씁니다.
- **result:** `text` 본문을 순서대로 이어 붙입니다.
  - `end`를 받았고, `stopReason ∈ successStopReasons`이고, `error` 이벤트가 없고, exit 0이고, 본문이 공백이 아니면 `resultFile`(0600)에 씁니다.
  - `end`가 없거나 `error` 이벤트가 있거나 exit≠0이거나 signal이 있거나 stopReason이 집합 밖이면 `execution_failed`입니다(cancel 제외).
  - 정상 종료인데 본문이 비어 있으면 `invalid_output`입니다.
- **delegation:** 탐지할 수 없습니다. record에 `unverifiedContracts: {delegation:'undetectable'}`로 기록합니다.

### 8.4 취소·재개·상태

- 취소는 기존 SIGTERM → `CANCEL_GRACE_MS` → SIGKILL(프로세스 그룹)이며 Grok 전용 처리는 없습니다.
- `resume: 'off'`입니다. `segment > 0` 요청은 `resume_unverified`로 hold합니다(`role-supervisor.mjs:102`, `role-bridge.mjs:146`에 grok 추가).
- `RELEASE_CONDITIONS.resume_unverified` 문구를 일반화합니다: `'Update ARC after verifying platform session resume against the recorded session UUID.'` Gemini hold 문구도 함께 바뀌는 의도된 변경이며, 관련 테스트 기대값을 갱신합니다.
- lease v2에는 `targetPlatform:'grok'`, `sessionId:<UUID>`를 기록합니다(9장). artifact와 segment 규칙은 기존과 같습니다.

## 9. composite·management 참여

- anchor는 `min(S)`이고, lock 순서는 anchorOrder를 따라 claude → codex → gemini → grok이 됩니다(기존 정렬 로직, 코드 변경 없음).
- `role-routing.mjs:246`의 UUID `sessionId` 예약 조건을 `route==='bridge' && (requested.platform==='gemini' || requested.platform==='grok')`로 바꿉니다.
- `role-routing.mjs:234`에 `host==='grok' && GK2!=='pass'` → `host_sandbox_blocked`를 추가합니다.
- management의 `target:'grok'`/`'all'`/composite 거부 동작은 5.6과 같습니다. 기존 registry 기반 코드(`operations.mjs:69,88`)로 충족되므로 문구 변경은 없습니다.
- 주입 registry(grok `install`·`catalog`·`bridge`·`compositeRole` verified)에서 S={claude,grok}, {codex,claude,gemini,grok}의 publish는 v2 설정, anchor=claude, 모든 S home marker, lock 순서를 만족해야 합니다(AC-K8).

## 10. gate와 hold 사유

| 조건 | reason code | 위치 |
|---|---|---|
| grok capability off(host 또는 대상) | `capability_not_verified`, lease 미생성 | `capabilityReasons`(변경 없음) |
| `platform==='grok'`이고 Implementer/QA이고 `GK1!=='pass'` | `permission_scope_unverified` | `bridgeGateReasons` |
| `hostPlatform==='grok'`이고 `GK2!=='pass'` | `host_sandbox_blocked` | `bridgeGateReasons`, `role-routing.mjs:234` |
| grok resume(`segment>0`) | `resume_unverified` | 8.4 |
| 읽기 역할의 worktree 쓰기 | `permission_violation_observed` | 기존 사후 탐지 |
| 프롬프트 파일 기록 실패, 비정상 종료 | `execution_failed` | 8.2, 8.3 |
| 세션 불일치·부재 | `execution_identity_unverified` | 8.3 |
| 빈 결과 | `invalid_output` | 8.3 |

- `BRIDGE_GATE_RESULTS`에 `GK1:'fail', GK2:'fail'`을 추가합니다.
- `buildBridgeInvocation`의 gate 검사 조건(`role-supervisor.mjs:98`)을 `platform` 또는 `hostPlatform`이 gemini나 grok인 경우로 넓힙니다.
- **GK1 통과 조건(정의만).** 다음 세 가지가 모두 있어야 합니다.
  - (a) sandbox 적용 실패를 비정상 종료로 만드는 옵션 또는 동작
  - (b) 적용 실패를 식별하는 신호와 감지 규칙
  - (c) CLI `--permission-mode`가 쓰기 역할 값을 받는다는 증거
- 문서상 sandbox는 적용 실패 시 경고만 하고 계속 실행할 수 있고, `read-only`도 `~/.grok` 쓰기를 허용합니다. 그래서 GK1은 `fail`을 유지합니다.
- **GK2 통과 조건:** Grok 세션 안에서 runtime 명령이 anchor home(lock, store)에 쓰고 detached supervisor를 유지할 수 있다는 live 증거입니다.

## 11. capability 전환 절차 (정의만)

### 11.1 원칙

- 전부 off로 시작합니다.
- 전환 커밋 하나에 다음 세 가지를 함께 담습니다(Gemini spec 결정 16).
  1. descriptor 상태 변경과 `grok-capability-evidence` 고정 목록 갱신
  2. 진행 기록 행과 커밋 메시지에 남긴 증거
  3. 해당 capability의 회귀 테스트
- live 검증은 Orchestrator가 사용자 환경에서 합니다. 이번 범위에서는 실행하지 않습니다.
- 자동 테스트 통과가 live 증거를 대신하지 않습니다.

### 11.2 capability별 항목

| capability | 초기 reason | 통과 조건(live) |
|---|---|---|
| `install` | `install layout not verified` | ① `grok --version` 원문으로 공식 CLI 식별(커뮤니티 구별 가능, U-K1) ② 임시 HOME 설치 후 `grok --prompt-file`이 AGENTS.md 블록과 ARC skill의 고정 토큰을 인식 ③ Claude 호환 자동 발견으로 다른 ARC 자산이 함께 로드되는지 관찰·기록하고, 충돌이 있으면 off 유지(D12) ④ 제거 후 ARC 소유 파일 0개 |
| `nativeProfile` | `native profile format not verified` | `~/.grok/agents/arc-routing-scouter.md` 로드 + **frontmatter model이 실제 적용됨** + revision tag 변경 후 새 세션 재로드. model 적용 증거가 없으면 off 유지(D11) |
| `catalog` | `catalog not verified` | 카탈로그 모델마다 `grok -m <model>` 최소 실행이 accepted. 역할 기본 모델은 accepted |
| `standalone` | `standalone not verified` | 선행 3종 + Grok 단독 ARC에서 native 위임 1회 |
| `bridge` | `bridge contract not verified` | claude-cli host와 codex-cli host 각각에서 run → observe → cancel. 다음을 모두 확인: `--prompt-file` 수락, `streaming-json`의 `end.sessionId` 일치, 결과 파일, 읽기 역할 쓰기 0건, `--permission-mode plan`·`--sandbox read-only`·`--deny`·`--no-auto-update`·`--no-subagents` 수락, `GROK_HOME` 주입 env에서 경로 정상(U-K12), MCP/skills/agents 자동 로드 차단 수단 또는 무충돌 증거(D12) |
| `compositeRole` | `composite role not verified` | `bridge` + composite publish/routingStatus/prepare가 v2 lease 기록 |
| `compositeHost` | `composite host not verified` | GK2 증거 + Grok 세션 안에서 runtime 명령, native 위임(D11) |
| `authProbe` | `no official auth status command` | 해당 없음 |
| `watch` | `watch support out of scope` | 해당 없음 |

### 11.3 증거 형식

진행 기록 행과 전환 커밋 메시지에 다음을 적습니다: capability, `grok --version` 원문, OS/host, ARC commit, 실행 명령 요지(비밀값 제거), stream 발췌(세션 id, model 필드 유무, `end` 이벤트), 결과 해시, 쓰기 탐지, 판정과 실행자·일시. 개인 정보와 토큰은 적지 않습니다.

### 11.4 고정 테스트 (`tests/node/grok-capability-evidence.test.mjs`, 신규)

- 운영 registry의 verified 집합이 `[]`와 같습니다.
- 선행 조건(`CAPABILITY_PREREQUISITES`)이 지켜집니다.
- `supportedVersions === '>=1.0.0 <1.1.0'`입니다.
- `BRIDGE_GATE_RESULTS.GK1/GK2 === 'fail'`입니다.
- `SUPERVISOR_IMPLEMENTATIONS.get('grok').resume === 'off'`입니다.
- 새 minor를 추가하려면 verified capability 전부의 회귀 증거가 필요합니다.

## 12. 정책 (`lib/policy/role-policy.json`)

- 각 role의 `controls`에 `"grok": "prompt"`를 추가합니다.
- `platforms.grok`을 추가합니다.
  - `level`: `prompt`
  - `notice`: `"Role restrictions are prompt-level contracts, not a filesystem sandbox. Grok sandboxing, native tool restriction fields, observer hooks and Git guards are unverified, and Grok may continue without its sandbox. Use only available authorized tools; ARC does not write Grok config.toml."`
- `npm run check:role-policy`로 확인합니다. 기존 생성물은 바이트 단위로 같아야 합니다.

## 13. 메뉴 변경

### 13.1 Configure 이름 변경(정확 문자열)

| 위치 | 변경 후 |
|---|---|
| `lib/tui/app.mjs:11` | `[{id:'install',label:'Configure'},{id:'status',label:'Status'},{id:'uninstall',label:'Uninstall'},{id:'exit',label:'Exit'}]`(내부 id `install` 유지, `version` 항목 제거) |
| `lib/tui/setup.mjs:153` | 화면 제목 `'Configure'` |
| `lib/tui/app.mjs:99` | `'Configure was not retried.'` |
| `lib/management/update.mjs:21` | `'Harness update did not complete. Run arc again and choose Configure to retry the harness update.\n'` |
| `lib/management/operations.mjs:146` | `'After upgrading ARC, run Configure again.'` |
| `lib/management/status.mjs:25` | `'Mixed routing will move to the Claude home the next time you apply Configure.'` |
| `{claude,codex,gemini}/skill/references/coordination.md:147/145/147` | `…run Configure again; until then routing holds as \`activation_unverified\`.` |

- 관련 테스트의 리터럴도 교체합니다. 범위 안에서 `Install / Update`와 `Check Version` 잔존 0건이 목표입니다(`docs/superpowers/**` 제외).
- `update.mjs:56,58`의 `check the version again`은 유지합니다(D14).

### 13.2 Status 병합

**진입 흐름(`app.mjs`)**
1. `action==='status'`이면 `ui.busy(() => prepareRequest({kind:'update'}))`를 실행합니다.
   - 예외가 `ARC_CANCELLED`, `ARC_TUI_EOF`, `ARC_TUI_HOME`이면 그대로 전파합니다.
   - 그 밖의 예외는 잡아서 `{failed: error}`로 보관합니다. `Operation unavailable` 페이지는 띄우지 않습니다.
2. `statusInfo(installState, statuses, registry, {version})`로 화면 정보를 만듭니다.
3. `ui.menu('Status', showUpgrade ? ['Upgrade'] : [], {backRow:true, selected: showUpgrade ? 1 : 0, ...})`를 띄웁니다. 기본 커서는 Back입니다(D2).
4. Upgrade를 고르면 그 prepared snapshot으로 `execute(prepared,{request:lastRequest})`를 실행합니다. global은 세션 종료, npx는 결과 페이지로 가며 현행과 같습니다. 그 밖의 선택이면 `prepared=null`입니다.
5. 홈에서 `version` 분기(`app.mjs:131`)를 제거합니다.

**Version 행 값 (`showUpgrade = prepared.canUpgrade`)**

| 조건 | Version 행 | Notes 추가 |
|---|---|---|
| `canUpgrade` | `0.4.2 → 0.4.3` | 없음 |
| harness 0개이고 latest가 현재보다 새로움 | `0.4.2 → 0.4.3` | `No installed ARC harness; run Configure first.` |
| `latestVersion !== null`이고 새 버전 아님 | `0.4.2 · up to date` | 없음 |
| `latestError` | `0.4.2 · latest unavailable` | 오류 메시지 첫 줄 |
| prepare 예외(npm 문맥 등) | `<packageVersion> · latest unavailable` | 오류 메시지 첫 줄(npm 문맥 오류는 `Run arc from a verified global ARC installation or npx`) |

- harness 0개 + 새 버전일 때 `Up to date`로 잘못 표시하던 현행 결함(`app.mjs:131`)은 두 번째 행으로 고칩니다.

**레이아웃(P-K6)**

```
Mode      <mode>

Claude    …
Codex     …
Gemini    …
Grok      Not verified

Version   0.4.2 · up to date

Notes
• <platform note> (Claude)
• <version note>
```

- `labelWidth`에 `Version`을 포함합니다. 이 때문에 기존 Status 행의 열 정렬이 한 칸 바뀌고, 관련 스냅샷 기대값도 갱신해야 합니다.
- version note는 플랫폼 note 뒤에 `• <message>` 형식으로 붙이며 플랫폼 접미사가 없습니다. 같은 문구는 하나로 합칩니다.
- `infoTones`: Version 행은 `undefined`, version note는 `'note'`입니다.

**알려진 영향:** Status 진입이 네트워크 조회를 기다립니다. busy 중 Ctrl-C는 기존 busy 규칙대로 세션을 130으로 종료합니다(현행 Check Version과 같음).

## 14. 문서 (최소 범위)

**README.md**
- 40행: `Install / Update`를 `Configure`로 바꿉니다.
- 41–42행을 다음 한 행으로 합칩니다: `| Status | Platform status, Mode, diagnostics, and ARC version (current/latest or lookup failure); \`Upgrade\` appears only when a newer version exists and an ARC harness is installed, and preserves settings. Global upgrade exits ARC; npx leaves the global CLI unchanged |`
- 48행: anchor order에 `> Grok`을 추가합니다.
- 81행 아래에 `| Grok | No | Not verified | Not verified (capability off) | No probe |`를 추가합니다.
- 93·95행: `Install / Update`를 `Configure`로 바꿉니다.
- 그 밖(3행 소개 문장, 71행 모델 링크 등)은 바꾸지 않습니다. `formerly` 같은 이전 이름 안내는 넣지 않습니다.

**docs/harness-operation.md**
- 114행: `| Home | Configure, Status, Uninstall, Exit |`
- 123행: 맨 앞에 `Status shows the version; `를 붙이고 `Same-version refresh: Configure`로 바꿉니다.
- 129·132·134행: `Install / Update`를 `Configure`로 바꿉니다.
- 42행: anchor order에 `> Grok`을 추가합니다.
- 72행 아래에 `| Grok | All capabilities off; the CLI is not run; \`auth.kind: none\`, no probe |`를 추가합니다.
- 설치 구성 표(24–32행)에는 열을 추가하지 않습니다.

## 15. 의존 순서 (작업 분할은 plan 단계)

T1 Configure 이름 변경 → T2 Status 병합 → T3 Grok registry 등록(descriptor, installer, 정책, 카탈로그, 잔존 검사, 5.5 일반 규칙) → T4 payload·설치(형식, manifest, golden) → T5 bridge(`grok-stream.mjs`와 runtime 모듈 갱신 세트 포함) → T6 composite·management 참여 → T7 문서(최소) → 최종 Reviewer 1회(significant).

- T1과 T2는 Grok과 독립입니다.
- T5는 T3·T4에 의존합니다(설치된 routing profile 파싱).
- T6은 T5에 의존합니다(`sessionId` 예약, gate).

## 16. 수용 기준

| ID | 기준 | 검증 |
|---|---|---|
| AC-K1 | 운영 runtime/installer registry의 id·anchor·display 순서가 `claude, codex, gemini, grok`이고 두 registry가 일치한다. 4.3 금지 패턴 검사가 통과한다 | `platform-registry`, `hardcoding-residual` |
| AC-K2 | grok capability 9개가 off이고 reason이 11.2와 같다. verified 집합이 `[]`다 | unit, `grok-capability-evidence` |
| AC-K3 | 5.6 표면 동작이 모두 성립한다. PATH에 둔 marker 기록 fake `grok`이 collectStatus·TUI(Status/Configure/Uninstall)·management 흐름에서 한 번도 실행되지 않는다. 기존 `all-targets`, `preset-cli`, `uninstall-cli` 테스트는 기대값 변경 없이 통과한다 | integration, PTY |
| AC-K4 | 주입 registry(install on)의 임시 HOME에서 설치·재설치·제거가 5.1/5.2를 만족한다. ARC 소유 파일만 제거되고 `config.toml`·사용자 파일은 바이트 그대로다. off 상태에서도 흔적이 있으면 제거된다 | integration |
| AC-K5 | `buildGrokArgs`가 8.1 표대로 인자를 만들고 금지 인자를 절대 포함하지 않는다. `--session-id`가 lease UUID와 같다. 프롬프트 파일이 0600·O_EXCL로 `instructions\n\nbrief` 내용으로 기록된다. stdin이 즉시 닫힌다. 기록 실패는 child 없이 `execution_failed`다. fake grok fixture(정상, 세션 불일치, `end` 없음, `error` 이벤트, 빈 text, 비성공 stopReason, model 불일치, unknown 이벤트)로 8.3 판정이 성립한다 | unit `role-bridge-args`, integration `grok-bridge` |
| AC-K6 | GK1 `fail`에서 Grok Implementer/QA는 `permission_scope_unverified`, host=grok은 `host_sandbox_blocked`, resume은 `resume_unverified`로 hold된다. 읽기 역할의 worktree 쓰기는 `permission_violation_observed`다 | unit `role-dispatch-policy`, integration |
| AC-K7 | role-policy 변경은 12장 범위뿐이다. Claude/Codex/Gemini 생성물은 13.1 문구 외에 바이트 단위로 같다 | `check:role-policy`, asset/fixture |
| AC-K8 | 주입 registry composite publish가 v2 설정, anchor=min(S), marker, lock 순서(claude→codex→gemini→grok)를 만족하고 lease v2 `targetPlatform:'grok'`과 UUID `sessionId`를 기록한다 | integration |
| AC-K9 | native profile의 렌더·소유 판정·routing 이름 변경·runtime 파서가 6장 형식에서 왕복 일치한다. `effort` 필드, 누락 필드, 잘못된 scalar를 거부한다 | unit |
| AC-K10 | 카탈로그 effort가 모두 `default`이고 카탈로그 모델이 모두 4.1 정규식과 `validatePair`를 통과한다. 다른 effort는 거부된다 | unit `models` |
| AC-M1 | 홈이 `Configure / Status / Uninstall / Exit`다. 13.1 문자열이 반영되고 범위 안 잔존 리터럴이 0건이다(역사 문서 제외). MANIFEST·fixture가 일치한다 | grep 테스트, `check:manifest` |
| AC-M2 | Status가 13.2 표대로 Version 행, Notes, 조건부 Upgrade(기본 커서 Back)를 표시한다. 조회 실패나 prepare 예외에서도 플랫폼 상태가 표시되고 `Operation unavailable`이 뜨지 않는다. harness 0개 + 새 버전에서 오표시가 없다. global/npx Upgrade 결과는 현행과 같다 | `tui-app`, `tui-app-pty` |
| AC-D1 | README·harness-operation 변경이 14장 행에 한정된다 | diff 검토 |

## 17. 검증 매트릭스

| 대상 | 자동(이번 범위) | unverified(live, 11장) |
|---|---|---|
| registry·capability·정책 | AC-K1, K2, K7, `check:role-policy` | — |
| 설치·제거·상태 | AC-K3, K4(주입 registry, 임시 HOME) | install ①–④, U-K1, U-K2, U-K9 |
| native profile | AC-K9 | nativeProfile(model 적용, D11) |
| 카탈로그 | AC-K10 | catalog `-m` accepted |
| bridge | AC-K5, K6(fake grok) | bridge 항목 전부, U-K3–U-K8, U-K12, D12, D13 |
| composite | AC-K8 | compositeRole, compositeHost(GK2) |
| 메뉴 | AC-M1, M2(PTY 포함) | — |

**공통 검사:** `npm test`(기준선 대비 신규 실패 0건. 기준선 밖 실패는 단독 재실행으로 판정하고, 기준선 목록은 Orchestrator가 보관), `npm run check:manifest`, `npm run check:role-policy`, `node scripts/update-runtime-assets.mjs --check`, `scripts/check-installer-parity.mjs`, golden/instruction-contracts fixture. TUI를 바꾸는 작업은 PTY 테스트가 필수입니다.

**최종:** 모든 작업이 수용된 뒤 전체 변경에 대해 독립 Reviewer를 1회 둡니다.

## 18. 위험

- **R1 권한 경계:** sandbox가 fail-open이고 `read-only`도 `~/.grok` 쓰기를 허용합니다. 사후 탐지는 git-visible worktree만 봅니다. → 쓰기 역할은 GK1 hold, 읽기 역할 claim은 범위를 한정합니다.
- **R2 격리:** MCP/skills/agents 자동 로드를 전부 끄는 플래그가 없고, Claude 호환 경로(skills/agents/plugins/MCP)를 자동 발견합니다. Claude ARC가 설치된 환경에서 Grok 자식이 Claude의 ARC skill과 agents를 함께 로드해 지침이 충돌하거나 정책 밖 도구가 노출될 수 있습니다. → bridge·install 전환 조건에 차단 수단 또는 무충돌 증거를 요구합니다(D12).
- **R3 식별:** `grok` 이름이 커뮤니티 CLI와 충돌합니다. 버전 출력 형식이 미확인입니다(U-K1). install off인 동안에는 실행하지 않으므로 영향이 없습니다.
- **R4 모델:** native 경로의 모델 적용이 보장되지 않고(D11), `streaming-json`의 모델 식별도 보장되지 않습니다(D13). model claim은 unverified로 둡니다.
- **R5 지침 파일 대소문자:** 전역 지침 후보에 `Agents.md`/`AGENT.md`/`AGENTS.md`/`Claude.md`가 있습니다. 대소문자 구분 파일 시스템에서는 사용자의 `Agents.md`와 ARC의 `AGENTS.md`가 둘 다 로드될 수 있습니다(U-K9).
- **R6 Status 지연:** 진입 시 네트워크를 조회하므로 오프라인이면 대기 후 `latest unavailable`이 됩니다. `resolveLatest`의 타임아웃은 현행대로 둡니다.
- **R7 테스트 파급:** 플랫폼 수(3→4)·홈 메뉴·Status 정렬을 고정한 기존 단언이 많습니다. 여러 행에 분산된 단언 목록은 완전하지 않으므로 계획 단계에서 grep으로 확정하고 old→new 대응표를 남깁니다. 검사 강도는 줄이지 않습니다.

## 19. Planner 판단 (Orchestrator 검토 완료)

- **P-K1** `isolationEnv`는 `() => ({})`입니다. `acquisition.mjs:44`가 반환값을 디렉터리로 mkdir하므로 자동 업데이트 끄기 env를 여기에 둘 수 없습니다. 자동 업데이트 끄기는 bridge 인자와 자식 env로 옮겼습니다(D16).
- **P-K2** frontmatter `model`을 ARC 관리 메타데이터로 유지합니다. bridge의 `-m` 원천이고, native 적용은 증거가 있어야 인정합니다.
- **P-K3** 권한 관련 frontmatter 필드를 렌더링하지 않습니다. Gemini 선례와 같고 미검증 의미를 피하기 위함입니다.
- **P-K4** `--no-subagents`를 포함합니다(위임 방지, 우회 옵션 아님)(D15).
- **P-K5** 알려진 이벤트 kind에 `error`와 `available_commands`를 추가합니다(문서 목록 반영). 터미널 성공은 `end` + `stopReason ∈ ['end_turn']`으로 판정합니다.
- **P-K6** Status 레이아웃: Version 행은 플랫폼 행 뒤에 빈 줄을 두고 놓고, version note는 접미사 없이 Notes에 넣습니다.
- **P-K7** 5.5의 "install off면 probe 생략"은 리터럴이 아니라 descriptor 기반 일반 규칙으로 구현합니다.

## 20. 결정 기록과 이후 후보

- O1–O6은 D11–D16으로 결정되었습니다(0장).
- 이후 후보(이번 범위 밖): D6 활성화 이후 auth 정책, 접근안 B 일반화 리팩터, `streaming-messages-json` 전환(live 증거 후).

## 21. 미검증 가정 (모두 off capability에 연결)

| ID | 내용 | 연결 |
|---|---|---|
| U-K1 | `grok --version` 출력 형식과 공식·커뮤니티 CLI 구별 가능성 | install |
| U-K2 | `--prompt-file` 경로·크기·인코딩 규칙, sandbox 아래에서 `.git/arc/...` 경로 읽기 | bridge |
| U-K3 | `--session-id` UUID 수락과 `end.sessionId` 반영 | bridge |
| U-K4 | CLI `--permission-mode` 허용 값(`plan`, `acceptEdits`) | bridge, GK1 |
| U-K5 | `--deny` rule 문법과 내장 도구 이름 | bridge |
| U-K6 | `streaming-json` `text` 이벤트 필드 이름과 이벤트 순서 | bridge |
| U-K7 | `end.stopReason` 값 집합(`end_turn` 후보) | bridge |
| U-K8 | `--no-auto-update`·`GROK_DISABLE_AUTOUPDATER`·`--no-subagents`의 headless 동작 | bridge |
| U-K9 | 전역 지침 파일 선택 규칙과 대소문자 처리 | install |
| U-K10 | frontmatter `model` 적용 여부 | nativeProfile |
| U-K11 | sandbox fail-closed 옵션 존재 여부 | GK1 |
| U-K12 | `localCliEnvironment`가 넣는 `GROK_HOME=~/.grok`이 기본 경로와 같은 의미인지 | install, bridge |
| U-K13 | 자식 프로세스 트리 정리(SIGTERM 그룹 전파) | bridge |
| U-K14 | npm 최신 minor(구현 시점 재확인, 2026-11-18 = 1.0.88) | D9 |

## 22. 계획 단계에 남긴 확인 사항

- Scouter 조회 필요: U-K5(도구 이름·deny 문법), U-K6(`text` 필드), 추가 공개 모델 ID.
- 기존 단언과 fixture의 3→4 플랫폼 변경 목록을 grep으로 확정하고 old→new 대응표를 남깁니다.
- `harness-operation.md`에서 GG1/GG2가 적힌 위치는 확인되지 않았습니다. GK1/GK2를 문서에 병기할지는 최소 범위 조건(14장)에 따라 계획 단계에서 정하며, 기본은 추가하지 않는 것입니다.
