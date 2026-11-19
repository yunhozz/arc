# Gemini/Grok composite host 허용 spec

- 상태: v1 승인 2026-11-19T12:02:22Z (사용자 "승인"). 경로 `docs/superpowers/specs/2026-11-19-host-gemini-grok-design.md`.
- 기준: `fix/bridge-ps-stub` @ 2d0056b, clean. 작업 대상은 현재 checkout입니다(사용자 결정).
- 경로: Architectural입니다. host 권한 경계, runtime 정책, installer 기본값, 문서, live 측정에 걸칩니다. 위험도: high.
- 승인 근거
  - 설계 승인: 2026-11-19T11:53:26Z
  - 사용자 결정(canonical record `.git/arc/handoff/2026-11-19-host-gemini-grok.md`의 "설계 결정")
    - 게이트는 approval 모델
    - spec은 1건, Grok 먼저, Gemini는 증거가 있을 때만 전환
    - live 측정은 Grok native와 runtime 명령까지
    - 현재 브랜치에서 계속
  - Orchestrator 기본값(권장안): Q3 기본 platforms 분리, Q4 probe를 runtime에 구현, Q5 ask 모드만 허용, Q6 Gemini 증거가 없으면 off 유지
- 측정 근거: T2(L-H*) 실측으로 채웁니다. 대상은 Grok 1.0.89이고 측정일을 기록합니다. §10은 측정 뒤 갱신합니다.
- 선행 상태: 선행 workflow(bridge-gate-g1-gk1)는 T1까지 커밋됐습니다. 현재 `GK1:'fail'`이고 `permission-sandbox-effect`는 미검증입니다. 이 spec은 그 보류를 바꾸지 않습니다.

## 1. 목표와 비목표

### 목표
1. runtime이 `hostPlatform` `grok`과 `gemini`를 composite host로 처리할 수 있게 일반화합니다.
   - GK2/GG2에 새 값 `'approval'`을 둡니다.
   - host 게이트 판정을 helper 하나로 합칩니다.
   - bridge 시작 전에 target home 쓰기 probe를 둡니다.
2. 기본 composite platforms를 `compositeHost`와 분리하고, 기본값 claude/codex를 유지합니다.
3. live 증거가 나오면 Grok을 전환합니다. 내용은 `compositeHost` verified, `GK2:'approval'`, 문서와 증거 테스트입니다.
4. Gemini는 live 증거가 있을 때만 같은 방식으로 전환합니다. 증거가 없으면 off와 `GG2:'fail'`을 유지하고 workflow를 끝냅니다.

### 비목표
- GK1, GG1, G1–G8 값 변경. GK1 보류는 유지하므로 Gemini host의 Grok Implementer/QA bridge는 `permission_scope_unverified`입니다.
- `v1Platforms`(`lib/runtime/role-bridge.mjs:14`, `lib/runtime/role-routing-config.mjs:6`) 변경. v1 lease/config는 codex/claude 전용으로 남깁니다.
- anchor home 배치(`config.platforms[0]`) 변경
- `resume`, `watch`, `authProbe` capability 변경
- Grok/Gemini Desktop 환경(등록되어 있지 않음)
- bridge child live 실행(M-H4). 가짜 CLI 통합 테스트로 대신하고 unverified로 기록합니다.
- `cli.supportedVersions` 변경(Grok `>=1.0.0 <1.1.0`, Gemini `>=0.68.0 <0.69.0`)

### 절대 금지
- host sandbox 끄기를 의무로 만드는 것, danger-full-access, 승인 우회
  - Grok `--always-approve`/`--yolo`/`bypassPermissions`/`auto-review`(`/auto`)
  - Gemini `--yolo`/`--skip-trust`/`--allowed-tools`
- 사용자 설정 파일 수정(`~/.grok/*`, `~/.gemini/*`, `~/.claude*`, `~/.codex/*`). 측정은 임시 저장소와 임시 `HOME`에서만 합니다.
- 생성물 수동 편집: `shared/skill/runtime/*`, 관리 섹션 `[ARC role policy: contract …]`, `MANIFEST.sha256`, golden
- bridge 실행 중 커밋, 명시 승인 없는 push/PR

## 2. 결정 기록

| ID | 결정 | 근거 |
|---|---|---|
| D1 | GK2/GG2에 새 값 `'approval'`을 둡니다. 의미는 다음과 같습니다. (a) host sandbox는 플랫폼 기본값(off)을 유지합니다. (b) host 세션은 ask 모드로 실행하고, runtime 명령(`routing-status`, `prepare-dispatch`, `run-dispatch`, `observe`, `resume`, `cancel`)은 호출마다 사용자 승인을 받습니다. (c) runtime은 승인을 검증하지 않으며, 승인을 받는 것은 Orchestrator 의무입니다. `'pass'`(검증된 통과)와는 다른 값입니다. G2 `'escalation'`과 같은 성격이고, 주석과 문서에 그렇게 씁니다 | 설계 A1, 사용자 결정. `18-sandbox.md`: 기본 off, 적용 뒤 되돌릴 수 없음, 자식이 제한을 물려받음 |
| D2 | 승인 모드는 Grok `--permission-mode default`(문서상 **ask**, `22-permissions-and-safety.md:35`)와 Gemini 기본 approval mode(M-G6에서 확인)만 허용합니다. auto-review는 금지합니다. Grok TUI 기본값이 Auto-review(`:20`)이므로 host 세션을 시작할 때 명시해야 합니다 | Q5 |
| D3 | host 게이트 판정을 `role-dispatch-policy.mjs`의 export helper `hostGateReasons({hostPlatform, policy})` 하나로 합칩니다. 표는 `HOST_SANDBOX_GATES = {grok: 'GK2', gemini: 'GG2'}`이고 허용 값은 `['pass', 'approval']`입니다. 게이트 값이 `'fail'`, 누락, 그 밖의 알 수 없는 값이면 `['host_sandbox_blocked']`를 반환합니다. 게이트 원본은 `policy.gates ?? BRIDGE_GATE_RESULTS`입니다. 현재 prepare(`role-routing.mjs:234`)는 키 단위로 DEFAULT에 fallback하는데, 이 fallback을 없애 누락을 알 수 없는 값으로 처리합니다(fail-closed) | 설계 B3, B4 |
| D4 | 호출 지점은 두 곳입니다. `bridgeGateReasons`(`role-dispatch-policy.mjs:106-107`)는 두 줄을 `...hostGateReasons(...)`로 바꿉니다. prepare(`role-routing.mjs:234-235`)는 두 줄을 `for (const code of hostGateReasons({hostPlatform: host, policy})) codes.add(code)`로 바꿉니다. native route에서도 검사를 유지합니다(native lease도 anchor에 씀). Codex G2 줄(`:109`, `=== 'fail'`, bridge에만 적용)은 바꾸지 않습니다. Codex host 동작을 바꾸지 않기 위해서입니다 | 범위 최소화 |
| D5 | **GK2를 `'approval'`로 바꾸는 시점은 T3입니다.** compositeHost가 off인 동안에는 기본 policy에서 GK2 값에 닿는 경로가 없으므로 T1에서 바꿔도 안전합니다. prepare는 `capabilityReasons`에서 먼저 return하고(`role-routing.mjs:221-222`), run-dispatch(`role-bridge.mjs:53-54`)도 같습니다. supervisor는 run-dispatch 뒤에만 실행됩니다. 그래도 T3을 고른 이유는 세 가지입니다. (1) 게이트 값은 측정 증거의 기록이라는 원칙(선행 spec D13 선례) (2) `compositeHost`와 GK2를 한 커밋에서 원자적으로 전환하면 되돌리기와 감사가 쉬움 (3) T2 측정이 실패하면 GK2 `'fail'`이 그대로 맞는 값으로 남음. T1은 주입 policy(`GK2:'approval'`)와 주입 registry(`compositeHost` verified)로 테스트합니다 | 설계 승인 순서, 선행 D13 |
| D6 | **target home 쓰기 probe**: `role-routing.mjs`에 export `probeHomeWritable(home)`을 둡니다(새 모듈은 만들지 않음). 동작은 다음 순서입니다. (1) `<home>/.arc-host-probe-<crypto.randomUUID()>`를 `open(O_WRONLY\|O_CREAT\|O_EXCL\|O_NOFOLLOW, 0o600)` (2) close (3) unlink. 결과는 `{ok:true}`이거나 `{ok:false, code, residualPaths?}`입니다. code는 EPERM/EACCES/EROFS이면 `host_sandbox_blocked`, 그 밖의 오류(ENOENT 등)이면 `activation_unverified`입니다. 생성 뒤 unlink가 실패하면 `host_sandbox_blocked`이고 `residualPaths`에 그 경로를 넣습니다 | Q4, 설계 B12 |
| D7 | probe 호출 지점은 bridge route 셋이고, 대상은 `homes[targetPlatform]`입니다. **host가 grok/gemini(`HOST_SANDBOX_GATES`의 키)일 때만** 적용합니다. Codex/Claude host의 bridge 경로는 바꾸지 않습니다(사용자 결정 2026-11-19; Codex host는 G2 escalation으로 보호). (a) prepare: bridge 분기에서 lease를 만들기 전. 실패하면 lease를 만들지 않습니다. (b) run-dispatch(`role-bridge.mjs:60` 앞, `starter` 호출 전). 실패하면 `starter`를 호출하지 않고 lease는 `reserved` 그대로 둡니다(기존 starter 실패 경로와 같고 `cancel`로 정리). (c) resume(`role-bridge.mjs:133-`)의 starter 호출 전. supervisor 안에서는 probe하지 않습니다. supervisor는 run-dispatch 프로세스의 자식이라 같은 sandbox 제한을 물려받으므로 (b)와 같은 결과가 나옵니다. native route는 child를 만들지 않으므로 probe하지 않습니다 | 설계 B12, `18-sandbox.md` 자식 상속 |
| D8 | **기본 composite platforms 분리**: installer descriptor에 `defaultComposite: true` 필드를 두고 `CLAUDE_INSTALLER`(`lib/platforms/claude.mjs`)와 `CODEX_INSTALLER`(`lib/platforms/codex.mjs`)에만 넣습니다. `lib/platforms/index.mjs`에 export `defaultCompositePlatformIds(registry)`를 두고, `byAnchorOrder()` 중 `defaultComposite === true`이면서 `runtime.capabilities.compositeHost.state === 'verified'`인 id를 반환합니다. `lib/installer/role-routing.mjs:43`과 `lib/management/operations.mjs:82`가 이 helper를 씁니다. runtime descriptor가 아니라 installer descriptor에 둔 이유는 두 가지입니다. 설치 기본값은 installer의 관심사이고, runtime hash와 cooperative 모듈을 바꾸지 않아도 됩니다. 명시 목록 상수는 기각합니다. registry 주도 설계와 맞지 않고, 주입 registry 테스트에서 의미가 갈라집니다 | Q3, 설계 B8 |
| D9 | Grok/Gemini host는 사용자가 TUI Hosts에서 고릅니다. `lib/platforms/availability.mjs:76`은 바꾸지 않습니다. compositeHost가 verified가 되면 Hosts 항목이 저절로 활성화됩니다 | 설계 B7 |
| D10 | `v1Platforms`는 바꾸지 않습니다. 회귀 테스트로 두 가지를 고정합니다. v1 lease의 `hostPlatform`이 `grok`/`gemini`이면 `leaseTargetPlatform`이 throw합니다. v1 config는 codex/claude 밖의 플랫폼을 거부합니다 | 사용자 결정 |
| D11 | Grok host의 native spawn은 `spawn_subagent`의 `subagent_type: "arc-routing-<suffix>"`입니다(`16-subagents.md:71,148`). model 인자는 넘기지 않습니다. 확인이 필요한 항목은 M-H5 측정 결과로 채웁니다: revision tag가 보이는 위치, `nativeAgentId`의 출처(전체 subagent id인지 화면 접미사인지), model 적용, 재spawn 차단. Gemini는 `~/.gemini/agents/arc-routing-<suffix>.md` subagent를 호출합니다. 호출 이름과 형식은 M-G5로 확정하고, 확정 전에는 문서에 "unverified"로 적습니다 | 설계 B14 |
| D12 | **host 계약 id와 측정 항목 대응**은 아래와 같습니다. 측정 결과에 따라 verified 또는 unverified 목록에 넣습니다. `host-bridge-child`는 이번 범위에서 항상 unverified입니다(가짜 CLI로 대체) | 사용자 결정 |
| | `host-runtime-approval`: M-H1, M-H6 | |
| | `host-sandbox-fail-closed`: M-H2 | |
| | `host-supervisor-survival`: M-H3 | |
| | `host-native-spawn`: M-H5 | |
| | `host-bridge-child`: M-H4, 항상 unverified | |
| D13 | 측정은 임시 `HOME`만 씁니다. **`GROK_HOME`은 설정하지 않습니다.** runtime은 `GROK_HOME`이 있으면 grok home을 풀지 않으므로(`platform-registry.mjs:62`) `activation_unverified`가 됩니다. 인증은 `auth.json`을 복사하지 않습니다. 방법은 둘 중 하나입니다. 사용자가 직접 `HOME=<tmp> grok login`을 실행하거나, `XAI_API_KEY`를 쓰는 것입니다(`02-authentication.md`). Gemini는 `HOME=<tmp>`, `selectedType: gemini-api-key`, `GEMINI_CLI_TRUST_WORKSPACE=true`를 쓰고 매번 `-m`을 지정합니다 | 사용자 제약. 지시문의 `GROK_HOME=<tmp>`를 정정합니다 |
| D14 | live 측정의 bridge target(claude/codex)은 임시 PATH 앞에 둔 가짜 CLI를 씁니다. 가짜 CLI는 auth/version probe에 응답하고, 정해진 시간 동안 sleep한 뒤 result를 쓰는 스크립트입니다. 그래서 M-H1의 bridge 명령과 M-H3 supervisor 생존을 실제 host 셸에서 측정할 수 있습니다. 실제 child 동작은 측정 범위 밖입니다(`host-bridge-child` unverified) | 사용자 결정 "bridge는 가짜 CLI".  |
| D15 | 문서는 원본 유형별로 다르게 반영합니다. (a) `coordination.md`의 "Composite Platform Role Dispatch" 절은 플랫폼별로 손으로 쓴 원본이므로 직접 편집합니다. (b) 관리 섹션은 `lib/policy/role-policy.json`을 바꾸고 `node scripts/update-role-policy.mjs`로 생성합니다(`render.mjs` `buildPolicyOutputs`, 대상은 각 플랫폼 SKILL.md, agents, references 6종). 이번 범위에서 `role-policy.json`은 기본적으로 바꾸지 않습니다. host 의무는 (a)에 둡니다. 플랫폼 notice를 바꿔야 할 때만 (b)를 거칩니다. 어느 쪽이든 `--check`는 통과해야 합니다 | `render.mjs:33-37,80`, `scripts/update-role-policy.mjs`. 지시문의 "render로 coordination 생성"을 정정합니다 |
| D16 | runtime 변경은 `lib/runtime/`에서만 편집합니다. 생성물은 아래 연쇄로 갱신합니다 | 선행 D15 |
| | (1) `node scripts/update-runtime-assets.mjs` | |
| | (2) `tests/node/runtime-versions.test.mjs`의 `baselineHash` | |
| | (3) 필요하면 `node scripts/update-role-policy.mjs` | |
| | (4) `node scripts/update-manifest.mjs` | |
| | (5) `node tests/node/fixtures/installed-layout.mjs --diff`로 차이를 확인하고 `--write`로 golden을 씁니다 | |
| | 새 runtime 모듈은 만들지 않습니다 | |
| D17 | Gemini 전환(T4)은 M-G1–M-G7을 모두 통과해야 합니다. 하나라도 실패하거나 측정할 수 없으면 `compositeHost` off(reason `composite host not verified`)와 `GG2:'fail'`을 유지하고, 측정 기록만 남긴 채 workflow를 끝냅니다 | Q6 |

## 3. 상세 동작

### 3.1 정책 (`lib/runtime/role-dispatch-policy.mjs`)
- `:2` 주석에 다음 문장을 추가합니다. "GK2/GG2 'approval' means a Grok/Gemini host keeps its platform-default sandbox (off), runs in ask mode, and obtains user approval for each runtime command; it is not a verified pass."
- 새 export는 두 가지입니다.
  - `HOST_SANDBOX_GATES = Object.freeze({grok: 'GK2', gemini: 'GG2'})`
  - `HOST_GATE_ALLOWED = Object.freeze(['pass', 'approval'])`
- 새 함수 `hostGateReasons({hostPlatform, policy = DEFAULT_POLICY})`의 동작은 다음과 같습니다.
  - `hostPlatform`의 키가 없으면 `[]`를 반환합니다. claude/codex도 `[]`입니다.
  - 키가 있으면 `HOST_GATE_ALLOWED.includes((policy.gates ?? BRIDGE_GATE_RESULTS)[key])`가 참일 때 `[]`, 거짓일 때 `['host_sandbox_blocked']`를 반환합니다.
- `bridgeGateReasons`의 `:106-107`은 helper 호출로 바꿉니다. 나머지 줄과 순서는 그대로 둡니다.
- `RELEASE_CONDITIONS.host_sandbox_blocked`(`:65`) 문구는 이미 일반적이므로 바꾸지 않습니다.
- 바꾸는 값은 T3의 `GK2: 'approval'` 하나입니다. T4는 증거가 있을 때만 `GG2: 'approval'`로 바꿉니다.

### 3.2 prepare, run, resume (`role-routing.mjs`, `role-bridge.mjs`)
**prepare** 순서는 기존과 같고, 다른 점은 아래 두 가지입니다.
- `:234-235`를 `hostGateReasons`로 바꿉니다.
- bridge 분기(`:236`)에서는 limits 검사 다음, 지금의 `bridgeGateReasons` 위치 직전에 `probeHomeWritable(homes[requested.platform])`을 호출합니다.
  - 실패하면 해당 code를 `codes`에 넣고, `residualPaths`가 있으면 result에 붙입니다.
  - probe는 codes가 비어 있지 않아도 실행합니다. 그래야 모든 사유를 한 번에 보고할 수 있습니다.
  - 단, capability 단계에서 return한 경우에는 실행하지 않습니다.

**run-dispatch**(`role-bridge.mjs:57-62`) 순서: `buildBridgeInvocation` → brief 쓰기 → **probe** → starter.
- probe가 실패하면 `result = blank(context, dispatchId, 'hold', code)`이고, residual이 있으면 붙입니다.
- lease는 `reserved`로 남고 `starter`는 호출하지 않습니다.

**resume**: starter를 호출하기 전에 같은 probe를 실행합니다.

**공통**: probe 파일은 성공과 실패 모두에서 남지 않습니다. 남는 예외는 unlink가 실패한 경우뿐이고, 그 경로는 `residualPaths`로 보고합니다. routing lock은 `withRoutingLock`이 해제합니다.

### 3.3 supervisor (`role-supervisor.mjs`)
- 코드 변경은 없습니다. `:114-117`의 gate 검사는 3.1을 따라 `approval`을 통과시킵니다.
- 주입 policy가 `'fail'`이면 기존처럼 early failure `host_sandbox_blocked`이고 spawn은 0건입니다.

### 3.4 registry
- T3: `platform-registry.mjs:141`에서 grok `compositeHost`를 `{state:'verified'}`로 바꿉니다. 선행 조건 install과 nativeProfile은 이미 verified입니다.
- T4는 조건부입니다. `:123` gemini도 같은 방식으로 바꿉니다.

### 3.5 installer
D8의 내용입니다.
- `lib/platforms/claude.mjs`, `codex.mjs`: `defaultComposite: true`
- `gemini.mjs`, `grok.mjs`: 필드를 두지 않습니다(없으면 false).
- `index.mjs`: `defaultCompositePlatformIds(registry = DEFAULT_INSTALLER_REGISTRY)`
- `lib/installer/role-routing.mjs:43`, `lib/management/operations.mjs:82`: helper를 씁니다. composite 모드의 기존 `mode.platforms` 우선 순위와 `options.platforms` 우선 순위는 그대로 둡니다.

### 3.6 host 세션 실행 의무 (문서로만 강제)
- **Grok host**
  - `grok --permission-mode default`로 시작합니다. 이 모드가 ask입니다.
  - host sandbox는 기본값(off)을 유지하고, sandbox를 켠 세션에서는 composite를 쓰지 않습니다.
  - runtime 명령은 호출마다 사용자가 승인합니다.
  - "항상 허용"(설정에 저장되는 선택지)을 고르지 않습니다. M-H6 결과로 문구를 확정합니다.
  - `GROK_HOME`을 설정하지 않습니다.
- **Gemini host**: 같은 방식입니다. approval mode는 기본값(호출마다 확인)이고, `--yolo`와 auto-edit 계열은 금지합니다. 세부는 M-G6에서 확정합니다.
- **`executionEnvironment`**: `grok-cli`, `gemini-cli`(이미 registry에 있음)

## 4. 오류와 hold 경로

| # | 조건 | 시점 | 결과 | 부수 효과 |
|---|---|---|---|---|
| E1 | host grok/gemini인데 `compositeHost` off(현재 기본) | prepare / run | hold `capability_not_verified` | lease 없음 / `reserved` 유지 |
| E2 | GK2/GG2가 `'fail'`, 누락, 알 수 없는 값(주입) | prepare(native·bridge) / supervisor | hold / failed `host_sandbox_blocked` | lease 없음 / spawn 0 |
| E3 | sandbox가 켜진 host라 anchor lock 쓰기에서 EPERM/EACCES/EROFS | routing-status / prepare / run / observe / cancel | hold `host_sandbox_blocked`(`ARC_HOST_SANDBOX`, 기존) | lock 없음(획득 실패) |
| E4 | target home probe 실패(EPERM/EACCES/EROFS) | prepare | hold `host_sandbox_blocked` | lease 없음, probe 파일 없음 |
| E5 | target home probe 실패 | run / resume | hold `host_sandbox_blocked` | starter 0, `reserved` 또는 이전 상태 유지 |
| E6 | probe 대상 home이 없음(ENOENT 등) | prepare / run / resume | hold `activation_unverified` | 위와 같음 |
| E7 | probe 생성 뒤 unlink 실패 | 위와 같음 | hold `host_sandbox_blocked` + `residualPaths` | probe 파일 잔존을 보고 |
| E8 | `GROK_HOME` / `GEMINI_CLI_HOME` 설정(기존) | 모든 명령 | hold `activation_unverified` | 없음 |
| E9 | Gemini host + Grok Implementer/QA bridge(GK1 `fail`) | prepare | hold `permission_scope_unverified` | lease 없음 |
| E10 | Grok host + Gemini Implementer/QA bridge(GG1 `fail`) | prepare | hold `permission_scope_unverified` | lease 없음 |
| E11 | v1 lease인데 host가 grok/gemini | lease 읽기 | `Invalid composite profile` throw(기존) | 없음 |
| E12 | native revision tag가 보이지 않거나 다름 | Orchestrator | hold `native_profile_reload_unverified`(문서 의무) | lease 없음 |

## 5. 수용 기준

**AC1 hostGateReasons**: 신규 `tests/node/host-gemini-grok.test.mjs`에서 확인합니다.
- grok/gemini 각각에 대해 `pass`와 `approval`이면 `[]`입니다.
- `fail`, `undefined`(키 누락), `'escalation'`, `'wide'`, `''`이면 `['host_sandbox_blocked']`입니다.
- claude/codex는 어떤 값이든 `[]`입니다.
- `bridgeGateReasons`의 host 부분과 prepare 결과가 같은 입력에서 일치합니다. 이것은 표 기반 동치 테스트로 확인합니다.
- Codex `G2:'fail'`에서 `bridgeGateReasons`의 기존 결과를 유지합니다. 기존 `tests/node/role-routing-dispatch.test.mjs`가 통과해야 합니다.

**AC2 게이트 값**: `BRIDGE_GATE_RESULTS`는 frozen이고, 시점별 값은 다음과 같습니다.
- T1 뒤: 현재 값 그대로(`GK2:'fail'`, `GG2:'fail'`, `GK1:'fail'`, `GG1:'fail'`)
- T3 뒤: `GK2:'approval'`, 나머지 불변
- T4 뒤: 증거가 있으면 `GG2:'approval'`, 없으면 `'fail'`
- `lib/runtime`과 `shared/skill/runtime`은 같은 바이트입니다(`node scripts/update-runtime-assets.mjs --check`).

**AC3 주입 통합(fake CLI)**: `tests/node/host-gemini-grok.test.mjs`에서 확인합니다. 조건은 주입 registry(grok/gemini `compositeHost` verified), 주입 policy(`GK2`/`GG2` `'approval'`), 임시 HOME과 가짜 CLI입니다.
- `hostPlatform:'grok'`, `executionEnvironment:'grok-cli'`에서 다음 흐름이 성공합니다.
  - routing-status `allow` → prepare(native) `allow` → observe `started`(nativeAgentId) → `completed`
  - prepare(bridge→claude 읽기 역할, →codex) → run-dispatch → observe `completed` → resume → cancel(별도 dispatch)
- Gemini host도 같은 시나리오를 실행합니다.
- 같은 시나리오에서 policy를 `'fail'`로 주입하면 각 단계가 E2가 되고, lease와 child 생성은 0건입니다.

**AC4 probe**: `tests/node/host-gemini-grok.test.mjs`에서 확인합니다. target home을 `chmod 0o500`으로 막고, 테스트 뒤 복구합니다. root로 실행하면 skip하고 사유를 출력합니다.
- prepare(bridge)는 hold `host_sandbox_blocked`이고 lease 파일이 0개 늘어납니다.
- run-dispatch는 hold `host_sandbox_blocked`이고, `startSupervisor` 주입 스파이 호출 0회, lease `reserved`입니다.
- resume도 같습니다.
- 세 경우 모두 target home에 `.arc-host-probe-*`가 없고, anchor의 `arc-role-platform-routing.lock`이 없습니다.
- ENOENT이면 `activation_unverified`입니다. unlink 실패를 주입하면 `residualPaths`가 나옵니다.
- 정상 home에서는 probe 파일이 남지 않습니다.
- Codex/Claude host bridge에서는 probe가 호출되지 않습니다(target home을 막아도 prepare/run 결과가 기존과 같음). **기존 Codex/Claude host bridge 테스트 전체가 통과해야 합니다.**

**AC5 anchor fail-closed**: 기존 `ARC_HOST_SANDBOX` 경로를 grok/gemini host로 확인합니다. anchor home을 0o500으로 막으면 routing-status, prepare, run, cancel이 모두 `host_sandbox_blocked`이고 lock과 lease가 남지 않습니다. 테스트 파일은 AC4와 같습니다.

**AC6 installer 기본값**: installer 테스트로 확인합니다. 기존 `tests/node/` installer composite 테스트에 추가하거나, 없으면 `host-gemini-grok.test.mjs`에 둡니다.
- `defaultCompositePlatformIds()`는 T1 뒤와 T3 뒤 모두 `['claude','codex']`입니다. T3 뒤 grok이 verified여도 같습니다.
- `prepareCompositeOperation`에 `options.platforms`가 없고 비-composite 모드일 때 platforms가 `[claude, codex]` + 역할 플랫폼입니다.
- `options.platforms: ['claude','codex','grok']`이면 grok이 host로 들어갑니다(T3 뒤). T3 전에는 `capability not verified` 오류입니다.

**AC7 v1 회귀**: `host-gemini-grok.test.mjs`에서 확인합니다.
- `leaseTargetPlatform({version:1, hostPlatform:'grok', …})`와 gemini가 throw합니다.
- v1 config에 grok이 있으면 거부됩니다.
- `role-bridge.mjs`와 `role-routing-config.mjs`의 `v1Platforms`가 `['codex','claude']`입니다. 소스 문자열 단언으로 확인합니다.

**AC8 GK1/GG1 보류**: 기본 policy(T3 뒤)에서 다음을 확인합니다.
- Gemini host(주입 compositeHost) + Grok `arc_implementer` bridge prepare는 hold `permission_scope_unverified`입니다.
- Grok host + Gemini `arc_qa` bridge도 같습니다.
- `gemini-bridge.test.mjs`의 GG1 단언과 `grok-composite.test.mjs`의 GK1 hold 테스트가 통과합니다.

**AC9 증거**: `tests/node/grok-capability-evidence.test.mjs`(T3)에서 확인합니다.
- verified 목록은 7개입니다: `['install','nativeProfile','catalog','standalone','bridge','compositeRole','compositeHost']`
- off 집합은 `authProbe`, `watch`입니다.
- "injected verified" 테스트의 키 목록은 `['authProbe','watch']`입니다.
- `:59-64` 단언은 `GK1 'fail'`, `GK2 'approval'`, `resume 'off'`입니다.
- 새 상수 `HOST_CONTRACTS`를 둡니다. 측정 결과대로 `{id, state:'verified'|'unverified', evidence}`이고, id 5개(D12)를 고정 순서로 둡니다. `host-bridge-child`는 `unverified`입니다.
- `UNVERIFIED_CONTRACTS`는 기존 6개에 측정 결과로 unverified가 된 host id를 더한 목록입니다. 길이 단언도 맞춥니다.
- `native-model-application`은 M-H5 model 적용이 확인될 때만 목록에서 빠집니다.
- Gemini 대응 evidence 테스트는 T4 결과에 따라 갱신하거나 그대로 둡니다.

**AC10 문서**는 T3에서 반영하고, Gemini 부분은 T4 결과에 따릅니다.
- grok `coordination.md`의 Composite 절
  - `:119` host 목록에 `grok`을 넣습니다(Gemini는 T4 결과에 따름). env 목록에는 `grok-cli`를 넣습니다.
  - `:121` Desktop 규칙은 codex/claude 한정이라고 명시합니다.
  - `:127` Grok host native spawn(D11)과 revision tag, `nativeAgentId` 확인 방법을 M-H5 결과로 씁니다.
  - `:145` 다음에 Grok/Gemini host 승인 의무 문장을 추가합니다(3.6).
  - `:61`, `:77`, `:149`의 "native invocation remains unverified"류 문구는 M-H5 결과에 맞게 바꿉니다.
- 같은 host 목록, env 목록, 의무 문장을 `claude`, `codex`, `gemini`의 `skill/references/coordination.md`에도 반영합니다.
- `tests/node/composite-instructions.test.mjs`에 새 단언을 추가합니다. 새 의무 문장 한 줄이 4개 파일에서 정확히 같아야 합니다(`:87-91` 방식). 기존 Codex escalation 단언은 유지합니다.
- `docs/harness-operation.md`
  - `:79-83` env 표에 `grok-cli` 행(native roles와 Claude/Codex bridge, 호출마다 승인, sandbox가 켜진 host는 `host_sandbox_blocked`)을 추가합니다. `gemini-cli` 행은 T4 결과(전환되었거나 held)를 씁니다.
  - `:87-97` 계약 표에 `GK2 approval` 행과 `GG2 approval|fail` 행을 추가합니다. probe 동작은 Detection 또는 새 행에 적습니다.
- `node scripts/update-role-policy.mjs --check`가 통과합니다. 관리 섹션은 손으로 고치지 않습니다.

**AC11 생성물**: 각 커밋 task에서 D16 연쇄가 완료되어 있어야 합니다.
- `node scripts/update-runtime-assets.mjs --check`, `tests/node/runtime-versions.test.mjs`, `tests/node/runtime-assets.test.mjs`, manifest 테스트, `node tests/node/fixtures/installed-layout.mjs --diff`(차이 없음)가 모두 통과합니다.
- TUI Hosts 표시에 대응하는 golden/snapshot 테스트가 있으면 재생성하고 통과합니다.

**AC12 사용자 설정 불변**: 실측 전후로 다음 파일의 sha256(없으면 부재로 기록)이 같습니다: `~/.grok/{config.toml,sandbox.toml,auth.json}`, `~/.gemini/settings.json`, `~/.claude/settings*.json`, `~/.codex/config.toml`. 자동 테스트는 실제 HOME에 쓰지 않습니다.

**AC13 회귀**: 전체 테스트는 baseline 52건(`…/scratchpad/t0c-fails.txt`)과 같은 명령으로 실행하고, Python은 `PYTHONDONTWRITEBYTECODE=1`을 씁니다. 실패는 baseline과 현재로 분류하고, **새 실패는 0건**이어야 합니다.

**AC14 측정 기록**: T3 커밋 메시지와 이 spec §10에 다음을 적습니다.
- 측정 버전 `grok 1.0.89`
- 측정일
- L-H 결과 파일 경로
- 계약 id별 판정

## 6. 측정 계획 (T2 Grok, T4 Gemini; 커밋 없음, Orchestrator 준비, TUI 조작은 사용자가 실행)

### 6.1 공통 준비 (Orchestrator)
1. `TMPH=<scratchpad>/host-home`, `REPO=<scratchpad>/host-repo`(임시 git 저장소)를 만듭니다. AC12 해시를 기록합니다.
2. 가짜 `claude`/`codex` CLI를 `<scratchpad>/fakebin`에 둡니다(D14). auth/version 응답과 sleep 후 result 쓰기를 합니다.
3. `HOME=$TMPH PATH=<fakebin>:$PATH`에서 ARC composite를 설치합니다. platforms는 `[claude, codex, grok]`이고, 역할은 예를 들어 Planner와 Reviewer는 grok native, Scouter는 claude bridge, QA는 codex bridge로 둡니다.
   - T2 시점 저장소에서 grok은 아직 `compositeHost` off이므로, 설치에는 **T1 커밋 + 주입하지 않은 별도 측정 빌드**가 필요합니다. 측정 전용 작업 사본에서 registry를 로컬 수정해 설치합니다. 저장소 checkout은 수정하지 않습니다.
4. 인증은 사용자가 `HOME=$TMPH grok login`을 실행하거나 `XAI_API_KEY`를 씁니다. `GROK_HOME`은 설정하지 않습니다(D13).

### 6.2 Grok 측정 항목 (`HOME=$TMPH grok --permission-mode default`, cwd `$REPO`, **사용자 TUI 조작**)
- **M-H1** `host-runtime-approval`
  - 실행: shell 도구로 다음 명령을 차례로 실행합니다. `routing-status`, `prepare-dispatch` 2건(native 1, bridge 1), `run-dispatch`, `observe`(`waitMs` 540000), `cancel`
  - 기록
    - 명령마다 승인 프롬프트가 나왔는지
    - exit code와 JSON
    - `<anchor>/arc-role-dispatch/*` 파일
    - lock 잔존 여부
    - shell 도구 env에 `GROK_HOME`과 `ARC_RUNTIME_ENTRY`가 있는지, `HOME` 값
- **M-H2** `host-sandbox-fail-closed`
  - 실행: `grok --sandbox workspace --permission-mode default`로 M-H1 명령을 다시 실행합니다.
  - 기대: 모든 명령이 `host_sandbox_blocked`(E3)이고 lease, lock, probe 파일이 남지 않습니다.
  - 추가: anchor는 쓸 수 있고 target만 막힌 구성(사용자 정의 프로필은 임시 저장소 `.grok/sandbox.toml`에만 둠)에서 E4/E5를 확인합니다.
- **M-H3** `host-supervisor-survival`
  - 실행: `run-dispatch`(가짜 CLI가 120초 sleep) 뒤 네 시점에서 supervisor PID 생존과 heartbeat 갱신을 확인합니다. 확인은 별도 터미널에서 `ps`와 heartbeat 파일 mtime으로 합니다.
  - 네 시점: (a) shell 도구 반환 뒤 (b) host 턴 종료 뒤 (c) shell 도구 timeout 뒤 (d) host 세션 종료 뒤
  - 함께 기록할 것: 부모 프로세스, cwd, 환경
  - bridge child 실제 동작은 범위 밖입니다.
- **M-H5** `host-native-spawn`
  - 확인할 것
    - `spawn_subagent`의 `subagent_type` enum에 `arc-routing-*`가 있는지
    - `[arc-routing rev …]` tag가 enum이나 agent 설명 중 어디에 보이는지
    - 반환된 subagent id 형식(`nativeAgentId`로 쓸 수 있는 TEXT ≤256인지)
    - profile model 적용 여부(transcript의 model 표시)
    - child가 `spawn_subagent`를 받는지(shell route `max_depth` 1, daemon route 5, `16-subagents.md:434`)
- **M-H6** `host-runtime-approval` 보조
  - default(ask) 모드에서 `node "$ARC_RUNTIME_ENTRY"`가 자동 실행되지 않는지 확인합니다.
  - 승인 프롬프트의 "항상 허용"류 선택지가 설정 파일에 저장되는지 확인합니다. 임시 HOME 파일의 diff로 봅니다. 측정에서도 이 선택지를 고르는 것은 임시 HOME 안에서만 합니다.

### 6.3 분기 (측정 결과에 따른 처리)

| 결과 | 처리 |
|---|---|
| 모든 항목 기대대로 | T3 진행 |
| M-H1: ask 모드에서 runtime 명령이 승인 없이 실행됨 | D1 전제가 깨집니다. T3 hold, 사용자 결정 |
| M-H1: shell 도구 env에 `GROK_HOME`이 주입됨 | 기본 상태에서 `activation_unverified`가 됩니다. T3 hold. `GROK_HOME === <HOME>/.grok` 허용 여부는 범위 변경이므로 사용자 결정 |
| M-H2: sandbox가 켜진 host에서 일부 쓰기 뒤 잔존 발생, 또는 `host_sandbox_blocked`가 아닌 결과 | T3 hold. runtime 수정은 범위 변경 보고 |
| M-H3: (a) 또는 (b)에서 supervisor 소멸 | bridge가 `terminal_state_unverified`가 됩니다. T3 hold, 사용자 결정(native 전용 host는 설계 A3에서 기각됨) |
| M-H3: (c) 또는 (d)에서만 소멸 | `host-supervisor-survival`은 조건부 verified입니다. 문서에 "host 세션 종료나 tool timeout 시 bridge는 `unknown`이 될 수 있음"을 적고 T3 진행 |
| M-H5: enum에 `arc-routing-*`가 없음 | `host-native-spawn` unverified, T3 hold |
| M-H5: revision tag가 보이지 않음 | `native_profile_reload_unverified`를 유지하고 compositeHost 전환 보류(T3 hold). 대체 확인 방법은 사용자 결정 |
| M-H5: subagent id를 얻을 수 없음 | T3 hold(`observe started`에 필수) |
| M-H5: model 미적용 | `native-model-application`을 unverified로 유지하고 claim은 operator-attested. T3 진행 |
| M-H5: child가 재spawn할 수 있음 | native 권한은 prompt-level 계약이라는 기존 한계(G4 성격)로 문서화하고 T3 진행(사용자 결정 2026-11-19) |
| M-H6: "항상 허용"이 설정에 저장됨 | 문서 의무에 선택 금지를 명시하고 T3 진행 |
| M-H6: default 모드를 강제할 수 없음(관리자 잠금 등) | T3 hold |

### 6.4 Gemini (T4)
- 준비: `HOME=$TMPH-g`, `selectedType: gemini-api-key`, `GEMINI_CLI_TRUST_WORKSPACE=true`, 매번 `-m`을 지정합니다. 금지 플래그는 §1을 따릅니다.
- M-G1–M-G6은 M-H1–M-H6에 대응합니다. sandbox가 켜진 측정은 `-s`(Seatbelt 기본)를 쓰고, native는 `~/.gemini/agents/arc-routing-*` 호출입니다.
- M-G7: 임시 HOME에서 API 키로 host 세션을 시작할 수 있는지 봅니다.
- 하나라도 실패하거나 측정할 수 없으면 D17에 따라 종료합니다.

## 7. 영향 파일
- **runtime(T1)**: `lib/runtime/role-dispatch-policy.mjs`, `lib/runtime/role-routing.mjs`, `lib/runtime/role-bridge.mjs`
- **runtime(T3/T4)**: `lib/runtime/platform-registry.mjs`, `lib/runtime/role-dispatch-policy.mjs`
- 위 파일의 `shared/skill/runtime/` 복제본(생성)
- **installer(T1)**: `lib/platforms/{claude,codex,index}.mjs`, `lib/installer/role-routing.mjs`, `lib/management/operations.mjs`
- **테스트**
  - 신규 `tests/node/host-gemini-grok.test.mjs`
  - `tests/node/grok-capability-evidence.test.mjs`, `composite-instructions.test.mjs`, `runtime-versions.test.mjs`, `grok-composite.test.mjs`, `gemini-bridge.test.mjs`
  - Gemini evidence 테스트(T4)
  - `tests/node/fixtures/installed-layout-golden.json`(생성)
  - TUI golden(있으면)
- **문서**: `{claude,codex,gemini,grok}/skill/references/coordination.md`, `docs/harness-operation.md`. `lib/policy/role-policy.json`은 notice를 바꿀 때만 수정합니다.
- `MANIFEST.sha256`

## 8. 위험과 한계
- **R1**: 승인은 runtime이 검증하지 못합니다. 사용자가 auto-review나 always-approve로 host를 실행하면 OS sandbox도 승인 경계도 없습니다. 문서 의무(D2)로만 완화합니다. G2와 같은 성격입니다.
- **R2**: host 세션 자체에 OS sandbox가 없습니다. Claude host(OS sandbox 없음 + 권한 프롬프트)와 같은 수준입니다.
- **R3**: probe는 디렉터리 루트에 쓸 수 있는지만 봅니다. 하위 경로만 막는 사용자 정의 프로필은 탐지하지 못하고, child 실패로 드러납니다.
- **R4**: probe는 grok/gemini host의 bridge 경로에만 새 hold 경로를 더합니다. Codex/Claude host가 바뀌지 않는다는 것은 AC4로 확인합니다. Codex/Claude host의 target home 쓰기 실패는 기존처럼 child 실패로 드러납니다.
- **R5**: revision tag 가시성(M-H5)이 실패하면 Grok host 전환이 보류됩니다.
- **R6**: Grok shell 도구가 leader나 daemon을 거쳐 실행되어 supervisor가 정리될 수 있습니다(M-H3).
- **R7**: bridge child는 live로 확인하지 않습니다(`host-bridge-child` unverified). 실제 Claude/Codex child와 host env(`GROK_*`, `GEMINI_*`)가 서로 영향을 주는지는 확인하지 않은 채 남습니다.
- **R8**: D3 fallback 제거 때문에, gates를 일부만 주입하는 기존 테스트가 prepare에서 새로 hold될 수 있습니다. T1에서 테스트를 조정합니다.
- **R9**: 측정 버전은 Grok 1.0.89뿐입니다. 범위 `>=1.0.0 <1.1.0`은 유지합니다.

## 9. task 분할
- **T1 runtime 일반화**(compositeHost off 유지, GK2/GG2 `'fail'` 유지)
  - 포함: D3, D4, D6–D8, D10, D16, AC1, AC3–AC8(주입), AC11, AC13
  - 문서: probe hold를 coordination 4종과 harness-operation에 한 줄씩 반영하고, `composite-instructions.test.mjs`도 맞춥니다.
  - 선행: 없음
  - 확인: `node --test tests/node/host-gemini-grok.test.mjs tests/node/role-routing-dispatch.test.mjs tests/node/grok-composite.test.mjs tests/node/gemini-bridge.test.mjs tests/node/composite-instructions.test.mjs`, 생성물 검사, 전체 실행
- **T2 Grok live 측정**(커밋 없음): §6.1–6.3, AC12. 선행은 T1 accepted입니다. 결과 파일은 scratchpad에 둡니다.
- **T3 Grok 전환**
  - 포함: D1, D2, D5, D9, D11, D12, 3.4, AC2(T3), AC6(T3), AC9, AC10, AC11, AC13, AC14
  - 선행: T2 결과가 §6.3의 "T3 진행" 분기일 것
- **T4 Gemini 조건부**: §6.4를 측정합니다. 통과하면 T3과 같은 형태로 gemini를 전환합니다. 실패하면 커밋 없이 기록하고 종료합니다(D17). 선행: T3
- **최종**: 모든 task를 accept하고 QA를 마친 뒤, 독립 Reviewer가 전체 변경을 1회 검토합니다.

## 10. 측정 결과 (T2/T4 뒤 기록)
- Grok 1.0.89, 측정일 2026-11-19. 결과 파일은 scratchpad `t2/RESULTS.md`이고, canonical record `.git/arc/handoff/2026-11-19-host-gemini-grok.md`에 요약했습니다. 측정 사본은 1393aa6에 grok `compositeHost` verified와 `GK2:'approval'`을 더한 것이고, 임시 HOME, 가짜 claude/codex CLI, revision `t2-grok-1`로 실행했습니다.

| 항목 | 계약 id | 판정 | 근거 |
|---|---|---|---|
| M-H1 | `host-runtime-approval` | verified | ask 모드에서 runtime 명령 9회 모두 승인 프롬프트가 떴습니다(Allow once / Always allow, 매번 Allow once). 결과는 8회가 allow였고, 1회(bridge observe)는 가짜 CLI 출력 때문에 `hold failed invalid_output`였습니다. 이 1회는 M-H4 범위라서 판정에 영향이 없습니다. shell 환경에 `GROK_HOME`은 주입되지 않았습니다 |
| M-H2 | `host-sandbox-fail-closed` | verified | anchor deny 프로필(`ProfileApplied` enforced)에서 routing-status와 prepare(native·bridge)가 `host_sandbox_blocked`를 반환했고 lease·lock·probe 잔존은 0이었습니다. target만 막은 경우는 Grok 사용 한도 때문에 사용자 셸에서 같은 Seatbelt 규칙(`sandbox-exec`)으로 대신 측정했고 prepare가 `host_sandbox_blocked`, lease 0이었습니다 |
| M-H3 | `host-supervisor-survival` | verified | 턴이 끝난 뒤와 Grok 세션을 종료한 뒤에도 supervisor가 살아 있었습니다(PPID 1, heartbeat 갱신). shell 도구 timeout은 run-dispatch가 즉시 반환되므로 해당하지 않습니다 |
| M-H5 | `host-native-spawn` | verified | `spawn_subagent`의 `subagent_type` 설명에 revision tag가 보였고, `subagent_id`(UUID형)를 `nativeAgentId`로 쓸 수 있었으며, child는 재spawn할 수 없었습니다 |
| M-H4 | `host-bridge-child` | unverified | 가짜 CLI만 사용했습니다(범위 밖) |
| M-H5 | `native-model-application` | unverified 유지 | 프로필은 `grok-4.6`이었지만 실제로는 `grok-4.7`로 실행됐습니다(세션 model). 따라서 model claim은 operator-attested입니다 |

- 발견 F-H1: Grok의 `spawn_subagent` 목록에 `~/.claude/agents`의 Claude `arc-routing-*` 프로필도 노출됩니다. `[compat.claude] agents = false`로도 막히지 않았습니다. 대응: Grok host 의무 문장에 "route가 native인 역할만 spawn"을 명시했습니다. runtime은 bridge lease에 native event가 오면 거부합니다(`role-bridge.mjs:124`).
- 발견 F-H2: 승인 화면에서 `Always allow`를 고르면 Grok config에 `permission_mode = "always-approve"`가 저장되어 이후 전역 자동 승인으로 바뀝니다. 대응: 의무 문장에서 이 선택을 금지했습니다.
- 사용자 판정(2026-11-19): T3 진행. 사용자 설정 해시(AC12)는 측정 전후 같았습니다.
- Gemini: M-G1–M-G7 판정 또는 "미전환(D17)": T4 뒤 기록

## 개정 이력

| Version | Approval time | Classification | Affected tasks | Reason |
|---|---|---|---|---|
| v1 | 2026-11-19T12:02:22Z | 최초 작성 | 전체 | 설계 승인(2026-11-19T11:53:26Z)에 따른 spec. 승인 시 결정: probe는 grok/gemini host만, M-H5 재spawn 가능 시 문서화 후 진행, 측정은 임시 HOME만(GROK_HOME 미설정), T2는 scratchpad 측정 사본 설치와 가짜 claude/codex CLI, role-policy.json 불변, run probe 실패 시 lease reserved 유지 |

