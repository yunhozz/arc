# bridge 역할 sandbox 도구 접근 spec

- 상태: v1.5 (v1.1 사용자 승인 2026-11-24 + 5.3 정규식 의도 정합 개정 + T3·T4·T5 측정 결과 반영, 개정 이력 참조)
- workflow: `2026-11-24-bridge-sandbox-tool-access`
- 대상: `/Users/ma-24-007/Desktop/workspace/arc/.claude/worktrees/bridge-sandbox-tool-access`, `fix/bridge-sandbox-tool-access`, base `6244a8af`
- 경로·깊이·위험: Architectural, Architectural plan, high
- 측정 환경: macOS 25.5, codex-cli 0.170.0, claude 2.1.327, Playwright 1.55.0

## 1. 배경과 측정 근거

### 1.1 문제
bridge 역할은 플랫폼 OS sandbox(macOS Seatbelt) 안에서 돈다. 이 sandbox는 정상 작업에 필요한 저장소 밖 접근을 막는다. 막히는 접근은 다음과 같다.
- 캐시·도구 상태 쓰기
- 브라우저 실행
- localhost와 unix socket 통신
- 서버 bind
- 파일 감시
- 프로세스 조회

그 결과 Tester와 Implementer의 검증이 "환경 차단, 미검증"으로 끝난다. Claude Scouter bridge는 웹 조회도 하지 못한다(B12).

### 1.2 현재 동작 (코드 근거)
- `lib/runtime/role-bridge-args.mjs:10-30` `ROLE_BRIDGE_PERMISSIONS`
  - Codex 쓰기 역할: `sandbox_mode="workspace-write"`
  - Claude 쓰기 역할: `--settings <D2>`
  - Claude Scouter: `-p ... --tools Read,Grep,Glob,WebFetch,WebSearch --permission-mode default`
- `role-bridge-args.mjs:186-214`: `buildClaudeArgs`와 `buildCodexArgs`에는 네트워크, socket, env 인자가 없다.
- `role-dispatch-policy.mjs:18-27`: D2는 `permissions.deny: ['Edit(./.git/**)','Write(./.git/**)']`과 `sandbox.filesystem.denyWrite: ['./.git']`이다.
- `role-supervisor.mjs:281-318`: `buildBridgeInvocation`이 args와 `expected`를 만든다.
  - Codex의 `expected.sandboxMode`는 `permissions.sandboxMode`다.
  - `role-observe.mjs:183,205`는 rollout `turn_context.sandbox_policy.type`을 이 값과 대조한다.
- `role-supervisor.mjs:529`: child는 `cwd=worktree`, `env={...childEnv, ARC_BRIDGE_CHILD}`, detached로 spawn된다.
- `command.mjs:54`: `prepare-dispatch`의 선택 키는 `allowedPaths` 하나뿐이다.
- `role-dispatch-store.mjs:11,24`: lease 키 집합은 고정이다(v2는 `targetPlatform`을 더한다).
- `role-routing.mjs:169-176,230-281`: 요청 검증과 lease 생성 위치다.
- `role-observe.mjs:460-475,636-678`: 실행 뒤 worktree와 제어 파일(`git:config`, hooks 등 common dir 포함)을 대조한다. 이것은 감지일 뿐 예방이 아니다.

### 1.3 측정 요약 (Orchestrator가 host에서 측정, 커밋 없음)

| ID | Codex | Claude | 판정 |
|---|---|---|---|
| SX1/SC1 loopback | `--enable network_proxy` + `network.domains={"127.0.0.1"="allow"}` + `network.allow_local_binding=true` → loopback 모든 포트 허용, 외부·LAN 차단. 포트는 한정할 수 없다 | `allowedDomains:["localhost","127.0.0.1"]` + `allowLocalBinding:true` → localhost=200, 외부=000 | pass |
| SX1 제약 | `sandbox_mode`와 permission profile은 같이 쓸 수 없다. legacy `sandbox_workspace_write.*`는 profile에서 무시된다 | – | adapter가 둘 중 하나만 쓴다 |
| SX3/SC2 env | `shell_environment_policy.set.<K>="<v>"` 동작 | settings `env` 동작 | pass |
| SX4/SC3 agent-browser CDP | `AGENT_BROWSER_SOCKET_DIR`=scratch + `network.unix_sockets={"<dir>"="allow"}` | + `allowUnixSockets:[<dir>]` | pass. tool-home은 필요 없다 |
| SX6/SX7 host Chrome | – | – | 조건부. `--proxy-server=127.0.0.1:9 --proxy-bypass-list=127.0.0.1;localhost`로 외부 차단. sandbox-exec 격리는 `~/Library` 읽기 허용이 필요하다 |
| B1 보호 동등성 | profile 기본값은 `.git/hooks`, `.git/config`, `.codex` 쓰기를 허용한다(실패). `filesystem={"<wt>/.git"="read","<wt>/.codex"="read"}`(절대 경로)로 보호가 돌아온다. 상대 경로는 스키마 오류이고 `"none"`은 `.codex`를 막지 못한다 | 해당 없음 | 조건부 pass. 보호 항목은 필수다 |
| B2 domains | domains에 추가 → curl 허용·차단 정상. npm은 proxy를 따르지 않아 실패 | `allowedDomains` 추가 정상 | pass. Codex는 proxy 미준수 도구 한계 |
| B3 서버 bind | 네트워크 없음 `listen EPERM`, loopback 200 | D2 `listen EPERM`, `allowLocalBinding` 200 | Implementer loopback 개방(D-b 충족) |
| B4 캐시 | npm test, py compile 동작. `caches`로 uv cache 이동 확인 | 미측정(같은 메커니즘) | pass. gradle·go·maven은 unmeasured |
| B5 unix socket | 허용 경로만 연결. docker.sock 거부 | 같음 | pass |
| B6 비밀 읽기 거부 | `filesystem={"<abs>"="none"}` → cat 거부 | `sandbox.filesystem.denyRead` → 거부 | pass (Bash 경로만 측정) |
| B7 env 정리 | `shell_environment_policy.exclude=[...]` → 제거 | settings `env` `""` → 빈 값 | pass. Claude는 삭제가 아니라 빈 값 |
| B8 프로세스 | 자기 자식 kill OK. `ps`·`pgrep`·`kill -0 1` 거부 | 자기 자식 kill OK, `ps` 거부 | `ps` 계열은 M7 |
| B9 파일 감시 | recursive `fs.watch` EMFILE | 같음 | recursive watch 불가 → `polling` |
| B10 Playwright server | host `launchServer`(127.0.0.1, port 0) + sandbox 안 `connect` → chromium·firefox·webkit 성공 | 같음. 증거는 `$TMPDIR` 아래 scratch여야 한다 | pass. host 격리는 미측정 |
| B11 sandbox 안 launch | 실패 | 실패 | M6가 필요하다 |
| B12 읽기 역할 웹 | `--search` 동작 | `-p --permission-mode default`에서 WebFetch·WebSearch 승인 거부. `--allowedTools WebFetch,WebSearch`로 둘 다 동작 | Claude Scouter만 인자 변경 |
| B13 경로 쓰기 | `filesystem={"<dir>"="write"}` | `sandbox.filesystem.allowWrite`(이미 있는 디렉터리) | pass (M3 메커니즘) |
| 부수 | – | `Write(./.git/**)`는 효과 없음(경고). `Edit(./.git/**)`와 `denyWrite`는 유효 | 제거 |
| B14 / GG1 | Grok 402 | Gemini GG1 fail | unmeasured / held |

중요 한계: Codex 측정은 모두 `codex sandbox -C <dir> -P arcp ...` 서브커맨드로 했다. bridge가 쓰는 `codex exec` 경로에서 같은 플래그가 받아지는지와 rollout 기록은 측정하지 않았다. 이것은 MI-1(8장)에서 측정한다.

## 2. 결정

### 2.1 사용자 결정 (2026-11-24, 설계 v2)
- 범위: 모든 플랫폼, 모든 역할, 모든 도구 범주
- D-a: 도구 접근은 요청한 dispatch에만 연다. Tester도 항상 켜지 않는다.
- D-b: loopback은 Tester에게 연다. B3 결과로 Implementer에게도 loopback만 연다(요청 기반).
- D-c: scratch 우회를 먼저 쓴다. `base`·`caches` env preset은 쓰기 역할에 항상 켠다. 단 gate가 pass인 플랫폼만이다.
- D-d: 외부 네트워크
  - domains를 한정할 수 없는 플랫폼에서만, 요청한 dispatch에 full을 허용한다.
  - 비밀 읽기 거부와 env 정리가 안 되는 플랫폼은 domains와 full을 보류한다.
- D-e: host 서비스는 supervisor가 띄운다. 정리에 실패하면 경고만 남긴다.
- D-f: Chrome(과 Playwright host 브라우저)은 격리 프로필 안에서 돌린다. 구현 task에서 거부 로그를 보며 `~/Library` 범위를 최소로 좁힌다. 좁히지 못하면 읽기 허용을 유지하고 위험을 문서화한다.
- D-g: docker/colima socket은 영구 금지한다.
- D-h: 의존성 설치(외부망)는 Orchestrator host 전용이다. Implementer에게 외부망을 열지 않는다.
- B12 (2026-11-24): Claude Scouter bridge에 `--allowedTools WebFetch,WebSearch`를 더한다. "읽기 역할 인자 불변" 원칙의 유일한 예외다.
- 유지(finding만 보고)
  - Claude Planner·Reviewer bridge에 Bash가 없다.
  - Grok 읽기 역할의 built-in read-only가 강제되지 않는다.

### 2.2 측정에서 나온 확정 사항
- R1 (B1): Codex가 permission profile을 쓸 때 `permissions.<n>.filesystem`에 `"<wt>/.git"="read"`와 `"<wt>/.codex"="read"`를 절대 경로로 반드시 넣는다. 이 항목이 없는 profile 인자는 만들 수 없게 한다(throw).
- R2 (B3): Implementer에게 `network:"loopback"`을 허용한다.
- R3 (B2·B6·B7): Tester `domains`를 허용한다. Codex의 proxy 미준수 도구 한계는 문서화한다.
- R4 (B9): `polling` preset을 둔다. Node의 recursive `fs.watch` 직접 호출은 env로 고칠 수 없다는 한계를 문서화한다.
- R5 (B8): `ps`·`pgrep`·다른 프로세스 조회가 필요한 검사는 M7이다.
- R6 (B10·B11): `browser-playwright` 서비스를 포함한다. host 격리는 MI-B에서 측정하고 적용한다.
- R7 (부수): D2의 `Write(./.git/**)`를 제거한다.
- R8: Grok은 unmeasured, Gemini는 held를 유지한다. T6은 B14 pass일 때만 진행한다.

### 2.3 이 spec에서 정한 사항 (Planner 판단, 사용자 확인 2026-11-24)
- P1: `full`은 Codex·Claude 모두 `held`다. 두 플랫폼 모두 domains를 한정할 수 있기 때문이다(D-d 문언).
- P2: host 서비스 endpoint는 args에 넣지 않는다. 고정 env `ARC_HOST_SERVICES_FILE`이 가리키는 scratch 파일로 넘긴다. 이유는 port가 spawn 직전에야 정해지는데, argsDigest는 run-dispatch와 supervisor에서 같아야 하기 때문이다.
- P3: Playwright 서비스 id를 브라우저별로 나눈다: `browser-playwright-chromium`, `-firefox`, `-webkit`.
- P4: native route에 `toolAccess`가 있으면 `permission_scope_unverified`다(강제할 수 없다).
- P5: `toolAccess`가 없으면 lease는 지금의 v2 그대로다. 있으면 v3(`toolAccess` 키 추가)다.
- P6: `base`·`caches`가 항상 켜지므로 쓰기 역할 args는 `toolAccess`가 없어도 env 항목만큼 바뀐다. AC7을 "D2′ + `env`"로 고친다.

## 3. 범주표 (21개, T0b 반영)

● 필요, ○ 가끔, – 없음. 메커니즘 정의는 4장에 있다.

| # | 범주 | 읽기/Impl/Tester | 메커니즘 | 측정 근거·상태 |
|---|---|---|---|---|
| C1 | 임시 파일 | –/●/● | M1 scratch (항상) | SX3, SC0·SC2 pass |
| C2 | 패키지·툴체인 캐시 | –/●/● | M2 `caches` (항상). 안 되면 M3 | B4 pass(npm, py, uv). gradle·go·maven unmeasured |
| C3 | 의존성 설치·원격 fetch | –/○/– | M7 (D-h) | – |
| C4 | 브라우저·테스트 러너 | –/○/● | M6 `browser-cdp`, `browser-playwright-*`. Cypress는 M7 | SX4, SC3, B10 pass, B11 fail |
| C5 | 로컬 TCP 서비스 | –/○/● | M4 `loopback` | SX1, SC1 pass |
| C6 | unix socket | –/○/● | M4 scratch socket(자동) + 등록 id(초기 0개) | SX4, SC3, B5 pass |
| C7 | docker/colima, ssh-agent, gpg-agent | –/–/○ | M5 영구 금지 (D-g) | B5 docker 거부 |
| C8 | 자기 서버 bind | –/○/● | M4 `loopback` (Impl 포함) | B3 |
| C9 | CLI 인증·설정 읽기 | ○/●/● | 유지. domains일 때 M5 읽기 거부 | B6 |
| C10 | CLI 인증·설정 쓰기 | –/–/– | M5, M7 | B1 (`~/.codex` 쓰기 차단 유지) |
| C11 | 언어 서버·빌드 데몬 | –/○/○ | M2 `daemon-off` | 효과 미측정 |
| C12 | 프로세스 조회·시그널 | –/○/○ | 자기 자식 시그널은 허용. 조회는 M7 | B8 |
| C13 | 파일 감시·EMFILE | –/○/○ | M2 `polling` | B9 원인 확인 |
| C14 | `.git` 쓰기 | –/–/– | M5 (Codex는 R1) | B1 |
| C15 | 키체인·GUI·OS 서비스 | –/–/– | M5 | – |
| C16 | telemetry·업데이트 확인 | –/●/● | M2 `base` | SC3 (agent-browser 버전 확인 차단) |
| C17 | 대화형 프롬프트 | –/○/○ | M2 `base`(`GIT_TERMINAL_PROMPT=0`), `ci` | – |
| C18 | background 장기 프로세스 | –/○/● | dispatch 동안 허용, terminal에서 process group 종료 | 기존 reapGroup |
| C19 | 증거 산출물 | –/○/● | M1 `evidence/` → artifactDir 복사 | B10 (Claude 증거 경로 규칙) |
| C20 | 읽기 역할 웹 조회 | ●/–/– | Codex는 변경 없음. Claude Scouter는 `--allowedTools WebFetch,WebSearch` | B12 |
| C21 | 읽기 역할 도구 실행 | ●/–/– | 변경 없음 | – |

새 도구 분류 규칙(설계 v2 4장과 같다): 저장소 쓰기 → 금지 목록 → env 우회 → 등록 경로 → 통신 class(좁은 것부터) → host 서비스(저장소 코드 비실행) → host 전용.

## 4. 메커니즘별 플랫폼 인자

공통 표기
- `<wt>`: `target.realpath`
- `<id8>`: dispatchId 앞 8 hex
- `<S>`: scratch 절대 realpath
- `<H>`: userHome
- `<NAME>`: Codex profile 이름 `arc_bridge`
- 모든 경로는 realpath 절대 경로다(`/tmp` → `/private/tmp`). 측정 B5가 `/private/tmp` 경로를 썼다.

### 4.1 M1 scratch
- 대상: Codex·Claude 쓰기 역할. gate pass 플랫폼에서는 `toolAccess` 유무와 상관없이 항상 만든다. Grok·Gemini는 지금 동작을 유지한다(scratch 없음).
- 위치
  - Codex `<S>` = `/private/tmp/arc-bridge-<id8>`
    - `/tmp`가 workspace-write와 `:workspace`의 쓰기 가능 root다.
  - Claude `<S>` = `/private/tmp/claude-<uid>/arc-bridge-<id8>`
    - SC0에서 Claude sandbox `TMPDIR`는 `/tmp/claude-<uid>`였고 여기는 쓸 수 있다.
    - 부모가 없으면 supervisor가 0700으로 만든다.
    - 부모가 있으면 owner가 현재 사용자인 실제 디렉터리여야 한다. 아니면 `permission_scope_unverified`다.
    - MI-C로 확인한다.
- 생성
  - `mkdir` 비재귀, 이미 있으면 실패(`execution_failed`), mode 0700
  - 하위에 `tmp/`, `cache/`, `sock/`, `evidence/`(각 0700)
  - 생성은 `snapshot()` 전에 한다. worktree 밖이므로 `changedPaths`에 영향이 없다.
- 정리: terminal 기록 직전에 한다. 모든 종료 경로가 대상이다(earlyFailure, cancel, timeout 포함).
  1. `evidence/` 복사: `<artifactDir>/evidence/`로 옮긴다.
     - lstat 기준 정규 파일과 디렉터리만 복사한다. symlink, socket, FIFO, device는 건너뛰고 기록한다.
     - 경로 탈출을 거부한다.
     - 상한: 전체 64 MiB, 파일당 16 MiB, 항목 256개, 깊이 8. 넘으면 남은 항목을 건너뛰고 `truncated:true`로 둔다.
  2. 그다음 `<S>`를 no-follow로 재귀 삭제한다.
  3. 실패하면 경고로만 기록한다(`scratch.removed:false`). terminal 상태는 바꾸지 않는다.
- 결과 레코드: `toolAccess.scratch = {path, removed}`, `toolAccess.evidence = {copied, skipped, truncated}`

### 4.2 M2 env preset (`TOOL_ENV_PRESETS`, `lib/runtime/tool-access.mjs`)
값은 모두 `<S>` 기준이다. HOME은 바꾸지 않는다. 역할은 preset id만 고를 수 있다.

| preset | 켜는 조건 | 내용 |
|---|---|---|
| `base` | 쓰기 역할 항상 | `TMPDIR=<S>/tmp`, `XDG_CACHE_HOME=<S>/cache/xdg`, `GIT_TERMINAL_PROMPT=0`, `DO_NOT_TRACK=1`, `NEXT_TELEMETRY_DISABLED=1`, `NPM_CONFIG_UPDATE_NOTIFIER=false`, `HOMEBREW_NO_AUTO_UPDATE=1`, `HOMEBREW_NO_ANALYTICS=1`, `AGENT_BROWSER_NO_VERSION_CHECK=1`, `AGENT_BROWSER_SOCKET_DIR=<S>/sock`, `ARC_SCRATCH_DIR=<S>`, `ARC_EVIDENCE_DIR=<S>/evidence`, `ARC_HOST_SERVICES_FILE=<S>/services.json` |
| `caches` | 쓰기 역할 항상 (D-c) | `npm_config_cache=<S>/cache/npm`, `PYTHONPYCACHEPREFIX=<S>/cache/pyc`, `UV_CACHE_DIR=<S>/cache/uv`(이 셋은 B4에서 측정한 이름), `YARN_CACHE_FOLDER=<S>/cache/yarn`, `PIP_CACHE_DIR=<S>/cache/pip`, `POETRY_CACHE_DIR=<S>/cache/poetry`, `GOCACHE=<S>/cache/go-build`, `HOMEBREW_CACHE=<S>/cache/brew`. GOMODCACHE, CARGO_HOME, GRADLE_USER_HOME, `~/.m2`는 옮기지 않는다 |
| `ci` | 요청 | `CI=1`, `NO_COLOR=1`, `PIP_NO_INPUT=1` |
| `daemon-off` | 요청 | `NX_DAEMON=false`, `GRADLE_OPTS=-Dorg.gradle.daemon=false` |
| `polling` | 요청 | `CHOKIDAR_USEPOLLING=1`, `WATCHPACK_POLLING=true`, `TSC_WATCHFILE=DynamicPriorityPolling`, `TSC_WATCHDIRECTORY=DynamicPriorityPolling` |

- env 이름 규칙: `^[A-Za-z_][A-Za-z0-9_]*$`. 값은 고정 문자열 또는 `<S>` 치환뿐이다.
- 여러 preset이 같은 키를 쓰면 데이터 정의 오류다(테스트로 막는다).
- `base`·`caches`는 요청에 넣을 수 없다(`invalid_request`).
- B4에서 측정하지 않은 변수 이름(yarn, pip, poetry, go, brew, ci, daemon-off, polling)의 효과는 unmeasured로 문서화한다. 무해한 env 설정이므로 gate는 메커니즘(SX3/SC2) 기준 pass다.

플랫폼 형식
- Codex: 키 이름순으로 항목마다 `-c`, `shell_environment_policy.set.<K>=<JSON.stringify(V)>`를 넣는다(SX3·B4 형식).
- Claude: settings 최상위 `"env": {<K>: <V>}`, 키 이름순(SC2).

### 4.3 M3 경로별 허용 (`TOOL_PATHS`)
- 초기 활성 id는 0개다. 따라서 `paths`에는 어떤 값을 넣어도 `invalid_request`다.
- 데이터 검증 규칙(id 추가 시 테스트로 강제)
  - 절대 realpath여야 한다. symlink는 거부한다.
  - `$HOME` 자체, CLI home, M5 목록과 겹치는 경로는 거부한다.
- 플랫폼 형식(B13)
  - Codex: profile `filesystem`에 `"<abs>"="write"`. profile mode가 필요하다.
  - Claude: `sandbox.filesystem.allowWrite:[<abs>]`. 디렉터리가 이미 있어야 한다. 없으면 `permission_scope_unverified`다.

### 4.4 M4 네트워크 class
유효 network는 요청한 `network` 값으로 정한다. 단 `services`가 비어 있지 않고 `network`가 null이면 `"loopback"`으로 올린다. scratch socket 허용(`<S>/sock`)은 유효 network가 null이 아니면 자동으로 붙는다.

**Codex: mode 선택**
- profile mode를 쓰는 조건: 유효 network ≠ null, 또는 `paths`·`unixSockets`가 비어 있지 않을 때
- 그 외에는 sandbox mode다(지금 인자 + env 항목).
- 두 mode의 인자는 서로 배타다. profile mode에서는 `sandbox_mode`를 넣지 않는다.

**Codex sandbox mode (부여 없음, 쓰기 역할)**
```
exec --json -C <wt> -m <model> -c model_reasoning_effort="<e>" -c developer_instructions="<...>"
  -c sandbox_mode="workspace-write" -c approval_policy="never" [M2 env 항목...] -o <result> -
```

**Codex profile mode (후보 A. 플래그 이름과 값은 `t0/t0b-codex.sh`·`b1f.sh`·`sx4.sh`에서 실제로 쓴 것이다. MI-1 결과 `exec`는 A를 거부해 후보 B를 채택했다. 확정 형식은 8.2)**
```
exec --json -C <wt> -P arc_bridge [--enable network_proxy] -m <model> -c model_reasoning_effort="<e>"
  -c developer_instructions="<...>"
  -c permissions.arc_bridge.extends=":workspace"
  -c permissions.arc_bridge.filesystem={"<wt>/.git"="read","<wt>/.codex"="read"[,추가 항목...]}
  [loopback 이상일 때]
  -c permissions.arc_bridge.network.enabled=true
  -c permissions.arc_bridge.network.domains={"127.0.0.1"="allow"[,"<domain>"="allow"...]}
  -c permissions.arc_bridge.network.allow_local_binding=true
  -c permissions.arc_bridge.network.unix_sockets={"<S>/sock"="allow"[,등록 socket...]}
  -c approval_policy="never" [M2 env 항목...] [domains일 때 -c shell_environment_policy.exclude=[...]]
  -o <result> -
```
- `--enable network_proxy`는 유효 network ≠ null일 때만 넣는다. B13(paths만)은 network 키 없이 측정되었다.
- `filesystem` 항목 순서
  1. 보호 항목 2개(고정 순서, R1)
  2. MI-3 결과에 따른 `<gitDir>`·`<gitCommonDir>` `"read"`
  3. host 서비스 디렉터리 `"read"`
  4. `paths` `"write"`
  5. 비밀 경로 `"none"`(domains일 때만, B6 형식)
  - 3–5는 각각 경로 이름순이다.
- 후보 B(MI-1에서 A가 거부될 때만): `-P arc_bridge` 대신 `-c default_permissions="arc_bridge"`, `--enable network_proxy` 대신 `-c features.network_proxy=true`
  - **채택(MI-1, codex-cli 0.170.0)**: `codex exec`가 `-P`를 거부했다(`unexpected argument '-P'`). 구현은 B를 쓴다(`CODEX_PROFILE_ARGS_FORM='B'`).
- A·B 모두 실패하면 Codex의 loopback, unixSockets, domains, paths, services gate를 `held`로 바꾼다.
- resume(`exec resume <tid>`)에도 같은 profile 인자를 다시 넣는다. MI-1에서 확인한다.
- Codex 검증 기대값: profile mode의 `expected.sandboxMode`는 MI-1에서 관측한 `turn_context.sandbox_policy.type` 값을 상수로 기록한 것이다(`CODEX_PROFILE_SANDBOX_TYPE`). 안정적인 값이 없으면 permissions claim은 `unverified`가 되고, 그 사실을 문서와 결과에 남긴다(새 reason code 없음).
- 사용자 설정 충돌 방지: profile mode에서 `~/.codex/config.toml` 또는 `<wt>/.codex/config.toml`에 `permissions.arc_bridge` 테이블이 있으면 `permission_scope_unverified`다. 이유는 `-c`가 사용자 profile 정의와 병합될 수 있기 때문이다. prepare와 `buildBridgeInvocation`에서 모두 검사한다. MI-2로 병합 방식을 측정한다.

**Claude (단일 `--settings` JSON, `t0/sc.sh`·`t0b-claude.sh`의 병합 결과와 같은 모양)**

기본 D2′(Write 규칙 제거)
```json
{"permissions":{"deny":["Edit(./.git/**)"]},
 "sandbox":{"enabled":true,"autoAllowBashIfSandboxed":true,"allowUnsandboxedCommands":false,"failIfUnavailable":true,
   "filesystem":{"denyWrite":["./.git"]}}}
```

조립 결과의 키 순서는 고정한다.
- `permissions.deny`: `["Edit(./.git/**)", ...domains일 때 Read 거부 규칙(MI-7)]`
- `sandbox.filesystem`: `{denyWrite, [denyRead](domains), [allowWrite](paths)}`
- `sandbox.network`(유효 network ≠ null)
  - `{"allowedDomains":["localhost","127.0.0.1",...domains 이름순],"allowLocalBinding":true,"allowUnixSockets":["<S>/sock",...]}`
- `env`: M2 항목 + domains일 때 비밀 env 이름 → `""`

### 4.5 M5 영구 금지 목록 (`FORBIDDEN`, 단일 데이터, AC8)
- `write`
  - `<wt>/.git`, `<wt>/.codex`, CLI home 전체(resolved homes)
  - `~/.ssh`, `~/.aws`, `~/.config/gh`, `~/.config/gcloud`, `~/.npmrc`, `~/.netrc`, `~/.docker`, `~/.kube`, `~/.gnupg`, `~/.gitconfig`
  - shell 시작 파일: `~/.zshrc`, `~/.zprofile`, `~/.zshenv`, `~/.bashrc`, `~/.bash_profile`, `~/.profile`
  - `~/Library/LaunchAgents`, `~/Library/Keychains`
- `sockets`: `/var/run/docker.sock`, `~/.docker`, `~/.colima`, `$SSH_AUTH_SOCK` 값, `~/.gnupg`
- `readWhenExternal`: `write`의 인증 dotdir 10개 + CLI home 4개(`.codex`, `.claude`, `.grok`, `.gemini` 해석 경로)
- `envWhenExternal`: `["*TOKEN*","*SECRET*","*PASSWORD*","*PASSWD*","*API_KEY*","*ACCESS_KEY*","*PRIVATE_KEY*","*CREDENTIAL*","AWS_*","GH_*","GITHUB_*","SSH_AUTH_SOCK","GPG_AGENT_INFO"]`

용도
- 모든 grant(paths, unixSockets 등록, scratch, host 서비스 디렉터리)가 `write`·`sockets`와 겹치는지 검사한다. 겹치면 데이터 오류 또는 `permission_scope_unverified`다.
- domains일 때 렌더링 규칙
  - Codex: `readWhenExternal` → `filesystem` `"none"`, `envWhenExternal` → `shell_environment_policy.exclude`
  - Claude: `readWhenExternal` → `sandbox.filesystem.denyRead` + `permissions.deny` `Read(<path>/**)`(디렉터리)·`Read(<path>)`(파일). `envWhenExternal` 패턴에 맞는 child env 이름 → `env: {name: ""}`
- Claude의 이름 집합은 supervisor child env에서 계산한다. run-dispatch와 supervisor가 같은 env를 쓰지 않으면 기존 `argsDigest` 대조가 `activation_unverified`로 막는다.

### 4.6 M6 host 서비스 (`lib/runtime/host-service.mjs`)
- 공통
  - Tester만 쓸 수 있다.
  - 저장소 코드를 실행하지 않는다. worktree의 `node_modules`는 import하지 않는다.
  - 수명은 dispatch와 같다. 시작은 scratch 생성 뒤, CLI spawn 전이다.
  - 종료는 모든 terminal 경로에서 한다: SIGTERM group → `CANCEL_GRACE_MS` → SIGKILL → 디렉터리 삭제. 실패하면 경고만 남긴다(D-e).
  - host 디렉터리: `/private/tmp/arc-host-<id8>/<service>/`, 0700
    - Codex profile에 `"read"`로 넣어 역할이 쓰지 못하게 한다.
    - Claude는 원래 그 경로에 쓸 수 없다.
  - endpoint: supervisor가 `<S>/services.json`(0600)에 `{"<id>":{...}}`를 쓴 뒤 spawn한다(P2).
  - 시작 실패는 `execution_failed`다.
  - 실행 파일이나 패키지가 없으면 prepare 단계에서 `permission_scope_unverified`다.
  - 결과 레코드: `toolAccess.hostServices[] = {id, started, endpoint, cleanup: "ok"|"warning"}`
- `browser-cdp` (SX4·SX6·SX7 형식)
  ```
  sandbox-exec -f <hostdir>/chrome.sb "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    --headless=new --remote-debugging-address=127.0.0.1 --remote-debugging-port=0 --user-data-dir=<hostdir>/udd
    --no-first-run --no-default-browser-check --disable-extensions --use-mock-keychain --no-sandbox --disable-gpu
    --proxy-server=127.0.0.1:9 --proxy-bypass-list=127.0.0.1;localhost about:blank
  ```
  `chrome.sb`(MI-A 확정 형식, `<H>`·`<udd>`는 realpath. `"`·`\`·개행이 든 경로는 거부한다)
  ```
  (version 1)
  (allow default)
  (deny file-read* file-write* (subpath "<H>"))
  (deny process-exec (regex #"GoogleUpdater"))
  (allow file-read* file-write* (subpath "<realpath udd>"))
  ```
  - `~/Library` 읽기 허용은 필요 없었다(MI-A). 홈 아래 읽기는 모두 거부된다.
  - `--use-mock-keychain`이 없으면 Chrome이 Keychain 접근에서 멈췄다(MI-A).
  - port는 `<udd>/DevToolsActivePort`에서 읽는다. 대기 상한은 `PROBE_TIMEOUT_MS`다.
  - endpoint: `{"port":<n>,"url":"http://127.0.0.1:<n>"}`
  - `<-loopback>` bypass 문법은 쓰지 않는다(SX6).
- `browser-playwright-{chromium,firefox,webkit}` (B10)
  - host `process.execPath`로 ARC 소유 launcher를 실행한다. 이 launcher는 host에 설치된 Playwright를 import한다. 해석 위치는 host 전역 설치본(`npm root -g`의 `playwright`, 없으면 `playwright-core`)이다(Q1 결정). 둘 다 없으면 prepare 단계에서 `permission_scope_unverified`다.
  - 호출: `<type>.launchServer({host:"127.0.0.1", port:0})`
  - endpoint: `{"wsEndpoint":"ws://127.0.0.1:<n>/<guid>","version":"<playwright version>"}`
    - client와 server의 Playwright 버전이 다르면 connect가 실패할 수 있다. 문서화한다.
  - 격리와 외부 차단(`proxy` 옵션)은 MI-B에서 브라우저별로 측정한 형식으로 적용한다.
  - MI-B는 측정하지 못했다(host 전역 Playwright 없음, Q1에 따라 설치하지 않음). launcher와 sandbox profile은 확정되지 않았고, 구현은 방어용 throw로 둔다.
- 서비스를 요청하면 유효 network가 loopback 이상으로 올라가고 scratch socket 허용이 붙는다.

### 4.7 M7 host 전용
- 대상
  - `ps`·`pgrep`·다른 프로세스 조회
  - docker, 실제 CLI 인증·설정 쓰기, 의존성 설치(D-h)
  - git 쓰기, Cypress, 키체인
- 보고: bridge 역할은 이 실패를 "환경 제한(host 전용)"으로 적는다. 역할 문서(4종)에 이 문구 규칙을 넣는다.

### 4.8 Claude Scouter 웹 조회 (B12)
- `ROLE_BRIDGE_PERMISSIONS.claude.arc_scouter`에 `allowedTools: ['WebFetch','WebSearch']`를 추가한다.
- `buildClaudeArgs`는 `'--permission-mode', <mode>` 바로 뒤에 `'--allowedTools', 'WebFetch,WebSearch'`를 넣는다.
- `allowedTools`의 각 항목은 `profile.tools`에 있어야 한다. 없으면 throw → `permission_scope_unverified`다.
- 다른 역할에는 `allowedTools`를 두지 않는다.
- observer 기대값(`tools`, `permissionMode:'default'`)은 바꾸지 않는다.

## 5. 요청 계약과 검증 규칙

### 5.1 형태
`prepare-dispatch` 입력에 선택 키 `toolAccess`를 둔다. `command.mjs:54` 선택 키 목록에 추가한다.
```json
{"network": null|"loopback"|"domains"|"full", "domains": [], "unixSockets": [], "paths": [], "services": [], "envPresets": []}
```
- 6개 키가 모두 있어야 한다. 더 많거나 적으면 `invalid_request`(deny)다.
- 배열 원소는 문자열이다. 중복이 있으면 `invalid_request`다. 저장할 때는 이름순으로 정규화한다.
- lease: `toolAccess`가 있으면 version 3이다(v2 키 + `toolAccess`). 없으면 v2를 그대로 쓴다.
  - `validateLease`는 1·2·3을 받는다.
  - `buildBridgeInvocation`의 targetPlatform 분기는 `version >= 2`로 바꾼다.
- argsDigest: 부여가 args에 렌더링되므로 기존 digest가 그대로 덮는다. 렌더링되지 않는 값(services id)도 `ARC_HOST_SERVICES_FILE`과 network로 args에 반영된다.

### 5.2 역할 표

| 키 | 읽기 역할 | Implementer | Tester |
|---|---|---|---|
| `toolAccess` 자체 | 있으면 `invalid_request` | 선택 | 선택 |
| `network` | – | `null`, `"loopback"` | `null`, `"loopback"`, `"domains"`, `"full"` |
| `domains` | – | `[]` | `network==="domains"`이면 1–16개, 아니면 `[]` |
| `unixSockets` | – | 등록 id (초기 0개) | 등록 id (초기 0개) |
| `paths` | – | `TOOL_PATHS` id (초기 0개) | 같음 |
| `services` | – | `[]` | `browser-cdp`, `browser-playwright-chromium`, `browser-playwright-firefox`, `browser-playwright-webkit` |
| `envPresets` | – | `ci`, `daemon-off`, `polling` | 같음 |

표 밖의 값은 `invalid_request`다.

### 5.3 domains 값 검증
- 모두 만족해야 한다
  - 소문자 ASCII
  - `^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$`
  - 점이 1개 이상, TLD는 영문자. punycode `xn--`는 regex가 허용한다.
- 거부(`invalid_request`)
  - 와일드카드(`*`)
  - IPv4·IPv6 literal(127.0.0.1 포함. loopback은 class로 연다)
  - `localhost`, `*.localhost`, `*.local`, `*.internal`, `*.home.arpa`
  - scheme, port, path, 끝 점, 대문자, 공백, 중복
  - 17개 이상
- DNS rebinding처럼 이름이 사설 IP로 풀리는 경우는 검증할 수 없다. 위험으로 문서화한다.

### 5.4 gate 판정 순서
prepare(`role-routing.mjs`)와 `buildBridgeInvocation` 모두 같은 함수 `toolAccessReasons({platform, role, route, toolAccess, policy})`를 쓴다.
1. 형태와 역할 표 검증 실패 → `invalid_request`(deny)
2. route가 native이고 `toolAccess`가 있음 → `permission_scope_unverified`(P4)
3. 유효 부여의 각 메커니즘을 `TOOL_ACCESS_GATES[mechanism][platform]`에서 찾는다. `pass`·`conditional`이 아니면 `permission_scope_unverified`(hold)
4. Codex profile mode의 사용자 설정 충돌, Claude `allowWrite` 디렉터리 없음, host 서비스 실행 파일 없음 → `permission_scope_unverified`
5. `conditional` 부여는 결과 `toolAccess.conditions[]`(메커니즘, 조건 문구)에 드러낸다.

새 reason code는 만들지 않는다. 플랫폼 이름 분기를 쓰지 않는다. 플랫폼별 차이는 adapter 표(`TOOL_ACCESS_ADAPTERS[platform]`)에 둔다.

## 6. gate 초기값 (`TOOL_ACCESS_GATES`)

| 메커니즘 | codex | claude | grok | gemini | 근거 |
|---|---|---|---|---|---|
| `scratch` | pass | pass | unmeasured | held | SX3, SC0·SC2 |
| `env.base`·`env.caches` | pass | pass | unmeasured | held | SX3, SC2, B4 |
| `env.ci`·`env.daemon-off`·`env.polling` | pass (효과 미측정) | pass (효과 미측정) | unmeasured | held | 메커니즘 SX3·SC2. polling은 B9 |
| `codexProfile` (profile mode 전제) | conditional (R1 보호 항목 필수, MI-1·MI-3 측정 완료) | – | – | – | B1, MI-1, MI-3 |
| `network.loopback` | pass | pass | unmeasured | held | SX1·B3 / SC1·B3 |
| `unixSockets.scratch` | pass | pass | unmeasured | held | SX4·B5 / SC3·B5 |
| `unixSockets.registered` | pass (id 0개) | pass (id 0개) | unmeasured | held | B5 |
| `paths` | pass (id 0개) | pass (id 0개) | unmeasured | held | B13 |
| `network.domains` | conditional (proxy 미준수 도구 실패) | conditional (proxy 미준수 도구 실패. Read 도구 거부 MI-7, 디렉터리 denyRead MI-9 확인) | unmeasured | held | B2·B6·B7, MI-6·MI-7·MI-9 |
| `network.full` | held (domains 가능, D-d) | held (domains 가능, D-d) | unmeasured | held | SX1(Codex는 `network.enabled`로 전부 열림) |
| `service.browser-cdp` | conditional (홈·`~/Library` 읽기 거부. 홈 밖 파일(`/etc` 등)은 file://로 읽힘, MI-A) | conditional (같음) | unmeasured | held | SX4·SC3·SX7, MI-A |
| `service.browser-playwright-*` | held (host 전역 Playwright 없음, 격리 미측정 MI-B) | held (같음) | unmeasured | held | B10·B11, MI-B |

- 프로세스 조회(B8)와 recursive `fs.watch`(B9)는 gate가 아니다. 범주 처리(M7, polling)로 다룬다.
- MI 결과로 값이 바뀌면 해당 구현 task 안에서 값과 근거 주석(버전, 날짜, 측정 ID)을 함께 바꾼다. 기존 `BRIDGE_GATE_RESULTS` 주석 형식을 따른다.

## 7. 위험과 보완

| 대상 | 위험 | 보완 |
|---|---|---|
| Codex profile 전환 | `.git`·`.codex` 보호가 사라진다(B1 실측) | R1 보호 항목 강제(없으면 throw), 테스트 고정, MI-3 common dir 측정, 실행 뒤 제어 파일 대조 유지 |
| Codex `exec` 경로 | 측정은 `codex sandbox`였다. exec에서 플래그 거부나 다른 동작이 있을 수 있다 | MI-1을 T3 첫 단계로 둔다. 실패하면 Codex 부여 gate를 held로 둔다 |
| Codex `-c` 병합 | 사용자 `permissions.arc_bridge` 정의가 섞일 수 있다 | 충돌 시 `permission_scope_unverified`, MI-2 |
| Codex 관측 | profile mode의 `sandbox_policy.type`이 다르면 permission claim이 약해진다 | MI-1에서 상수 기록. 실패하면 claim `unverified`를 결과에 드러낸다 |
| loopback | Codex는 포트를 한정할 수 없어 localhost의 모든 서비스(host DB 등)에 닿는다 | 요청 dispatch만, 역할 표 제한, docker 등 socket은 M5, 문서 명시 |
| Implementer loopback | Implementer가 로컬 서비스에 쓰기 요청을 보낼 수 있다 | 요청 기반, 외부망 없음(D-h), 문서 명시 |
| domains | 유출 위험, DNS rebinding | 비밀 읽기 거부·env 정리 전제, 도메인 검증, Tester만, `conditional`을 결과에 드러냄 |
| Claude Read 도구 | sandbox `denyRead`는 Bash에만 적용된다. Read 도구로 비밀을 읽어 Bash로 내보낼 수 있다 | `permissions.deny` Read 규칙 추가, MI-7 통과 전까지 Claude domains는 conditional. 실패하면 held |
| Claude env | `""`는 삭제가 아니라 빈 값이다. CLI 자신의 인증 env가 비면 실패할 수 있다 | MI-6, 문서 명시 |
| Codex domains | npm처럼 proxy를 따르지 않는 도구가 실패한다 | 한계로 문서화. 설치는 M7 |
| browser-cdp | host 권한 일부를 위임한다. `~/Library` 읽기, `file:///etc/hosts` 읽기, `(allow default)` 아래 proxy 밖 통신(WebRTC 등) 가능성 | sandbox-exec 격리, 임시 프로필, proxy 외부 차단, 수명 제한, MI-A 축소, 결과 기록 |
| browser-playwright | 격리 미측정, 버전 불일치 | MI-B 통과 전 conditional. host 설치본만 사용(저장소 코드 비실행) |
| host 디렉터리 | 역할이 Chrome 프로필을 조작할 수 있다 | Codex `"read"` 항목, Claude는 원래 쓰기 불가 |
| scratch | `/tmp` 아래 예측 가능한 이름 | 비재귀 mkdir + 0700. 기존 경로가 있으면 실패 |
| 저장소 밖 쓰기 | post-run 검사로 감지할 수 없다 | 문서에 감지 한계로 명시 |
| always-on env | 모든 쓰기 dispatch의 args가 바뀐다 | 키·값 고정 데이터, 바이트 테스트 |
| `Write(./.git/**)` 제거 | 보호가 약해진 것으로 보일 수 있다 | 측정 근거 주석, MI-4 live 확인 |

## 8. 구현 단계 측정 항목 (Orchestrator가 host에서 실행, 커밋 없음)

| ID | 소속 task | 내용 | 통과 기준 | 실패 시 |
|---|---|---|---|---|
| MI-1 | T3 (첫 단계) | `codex exec --json`에 4.4 후보 A 인자 → 안 되면 후보 B. 신규와 `exec resume` 둘 다 확인. B1·B3·SX4 probe 재실행. rollout `turn_context.sandbox_policy.type` 기록 | 플래그 수용, 보호·loopback·socket 결과가 `codex sandbox`와 같음, type 값 안정 | 후보 B. 둘 다 실패하면 Codex 부여 gate held |
| MI-2 | T3 | `CODEX_HOME=<scratch 복사본>`의 `config.toml`에 `[permissions.arc_bridge]` 추가 항목을 둔 뒤 `-c` 인자와 병합되는지 확인(실제 `~/.codex`는 건드리지 않는다) | 병합 여부 기록 | 병합 여부와 상관없이 충돌 검사를 유지한다 |
| MI-3 | T3 | worktree common dir 보호 (8.1) | 8.1 기준 | 8.1 |
| MI-4 | T4 | D2′(Write 규칙 없음)로 Claude Implementer live. Edit·Write 도구와 Bash로 `.git/config`, `.git/hooks/x` 쓰기 시도 | 모두 거부, 해시 불변 | Write 규칙 제거를 보류하고 Orchestrator에 보고 |
| MI-5 | T4 | Claude `acceptEdits` + loopback 설정으로 서버 bind·connect | 200 | Claude Implementer loopback gate held |
| MI-6 | T4 | domains 설정 + 비밀 env 빈 값에서 Claude CLI 인증과 실행 유지 | 정상 완료, Bash에서 해당 env가 빈 값 | Claude domains held |
| MI-7 | T4 | domains 설정에서 Read 도구로 `~/.ssh`류 probe 파일 읽기 | 거부 | Claude domains held |
| MI-8 | T4 | 실제 `buildClaudeArgs` Scouter 인자로 WebFetch·WebSearch | 둘 다 성공 | B12 변경 보류, 보고 |
| MI-9 | T3·T4 | 디렉터리 형태 비밀 경로(`~/.arc-mi9-dir/`)의 읽기 거부(B6은 파일만 측정) | 거부 | 해당 플랫폼 domains held |
| MI-C | T2 | Claude scratch 부모 `/private/tmp/claude-<uid>`를 미리 만든 상태에서 Claude Bash가 `<S>/tmp`, `<S>/evidence`에 쓰기 | 성공 | Claude scratch gate held |
| MI-A | T5 | SX7 `~/Library` 축소. `log stream`/sandbox 거부 로그를 보며 허용 subpath를 최소화 | localhost 페이지·스크린샷 성공, 홈 비밀 차단 | D-f: `~/Library` 읽기를 유지하고 문서화 |
| MI-B | T5 | Playwright host server 격리. 브라우저별로 sandbox-exec(SX7 형태 + 브라우저 번들 경로 읽기 + 임시 디렉터리 쓰기)와 외부 차단(`proxy` 옵션 또는 브라우저 인자) | 세 브라우저 각각 connect·페이지·외부 차단·홈 비밀 차단 | 실패한 브라우저 id는 held. `~/Library`는 D-f |

### 8.1 MI-3 worktree common dir 보호 검증 방법
1. 준비: scratch에 저장소 `R`을 만들고 커밋 1개를 둔다. 두 배치로 각각 `git worktree add`한다(`.git`이 파일이다).
   - 배치 1: `R` 밖의 worktree `W1`
   - 배치 2: `R/.claude/worktrees/w2`. ARC의 실제 배치다.
2. probe 대상 (각각 쓰기 시도 전후 sha256 또는 존재를 기록한다)
   - `W/.git` 파일 덮어쓰기
   - `R/.git/config`
   - `R/.git/hooks/pre-commit` 생성
   - `R/.git/refs/heads/probe` 생성
   - `R/.git/packed-refs`
   - `R/.git/objects/probe` 생성
   - `R/.git/worktrees/<name>/HEAD`
   - `R/.git/worktrees/<name>/config.worktree`
   - `R/.git/info/exclude`
   - 배치 2에서는 `R/` 작업 트리의 파일도 포함한다(worktree의 조상 경로)
3. 조건
   - (a) 기준선: 지금의 bridge 인자 `-c sandbox_mode="workspace-write"`
   - (b) 4.4 profile mode(보호 항목 2개) + loopback
   - (c) (b) + `"<gitDir>"="read"`, `"<gitCommonDir>"="read"`
4. 판정
   - (b)에서 새로 쓸 수 있게 된 대상이 (a)보다 하나도 없으면 (b)를 채택한다. git 제어 대상은 모두 쓰기 불가여야 한다.
   - 아니면 (c)로 같은 판정을 한다. 통과하면 adapter가 `<gitDir>`·`<gitCommonDir>` 항목을 항상 넣는다. 이를 위해 `buildBridgeInvocation`에 `target.gitDir`·`target.gitCommonDir`를 넘긴다.
   - (c)도 실패하면 `codexProfile` gate는 held다.
5. 결과(대상별 a/b/c 표)를 8.2 측정 결과 절과 테스트 주석에 기록한다.

### 8.2 구현 단계 측정 결과

Orchestrator가 host에서 측정했다(2026-11-24, macOS 25.5, codex-cli 0.170.0, claude 2.1.327). 원본 기록은 커밋하지 않는다.

| ID | 결과 | 구현 반영 |
|---|---|---|
| MI-C | pass. `/private/tmp/claude-501`가 이미 있었고(owner 현재 사용자, 0700), Claude D2 Bash에서 `<S>/tmp`·`<S>/evidence` 쓰기와 `TMPDIR=<S>/tmp`의 `mkdtemp`가 성공했다 | Claude scratch gate pass 유지(T2) |
| MI-1 | 후보 A 거부(`unexpected argument '-P'`). 후보 B pass. 신규와 resume 모두: `.git/config`·`.git/hooks`·`.codex` 쓰기 거부(해시 불변), workspace·scratch 쓰기 OK, loopback bind+connect 200, scratch unix socket OK, 외부(example.com) 차단. rollout `turn_context.sandbox_policy.type`은 신규·resume 모두 `workspace-write`로 안정 | `CODEX_PROFILE_ARGS_FORM='B'`, `CODEX_PROFILE_SANDBOX_TYPE='workspace-write'`, `codexProfile` 조건 문구에서 `exec acceptance pending` 제거(T3) |
| MI-2 | 병합된다. scratch `CODEX_HOME/config.toml`의 `[permissions.arc_bridge.filesystem]` 항목이 `-c permissions.arc_bridge.filesystem={...}`와 함께 적용됐다. 빈 `CODEX_HOME` 대조군에서는 적용되지 않았다. 실제 `~/.codex`는 건드리지 않았다 | 사용자 설정 충돌 검사(`permission_scope_unverified`) 유지. prepare 호출 위치가 worktree 하위여도 worktree 루트 기준으로 검사(T3) |
| MI-3 | (b) 채택. 아래 표 | `CODEX_PROFILE_GIT_ENTRIES=false`(T3) |
| MI-9 (Codex) | pass. 디렉터리 `"none"` 항목에서 하위 파일 읽기와 `ls`가 모두 거부됐다. 절대 경로와 `~/` 형식 모두 동작 | domains 비밀 경로 렌더링 유지(T3) |

확정된 Codex profile mode 신규 argv(MI-1, loopback + scratch socket 예):
```
exec --json -C <wt> [-m … -c model_reasoning_effort=… -c developer_instructions=…]
  -c default_permissions="arc_bridge" -c features.network_proxy=true
  -c permissions.arc_bridge.extends=":workspace"
  -c permissions.arc_bridge.filesystem={"<wt>/.git"="read","<wt>/.codex"="read",…}
  -c permissions.arc_bridge.network.enabled=true
  -c permissions.arc_bridge.network.domains={"127.0.0.1"="allow"}
  -c permissions.arc_bridge.network.allow_local_binding=true
  -c permissions.arc_bridge.network.unix_sockets={"<S>/sock"="allow"}
  -c approval_policy="never" [M2 env 항목…] -o <result> -
```
- resume: `exec resume --json <같은 -c 목록> -o <result> <thread_id> -`
- `features.network_proxy`와 `network.*` 키는 유효 network ≠ null일 때만 넣는다(paths만이면 없음).

MI-3 대상별 결과 (배치 1: 저장소 밖 worktree, 배치 2: `R/.claude/worktrees/w2`)

| 대상 | (a) | (b) | (c) |
|---|---|---|---|
| `W/.git` 파일 | denied | denied | denied |
| `R/.git/config` | denied | denied | denied |
| `R/.git/hooks/pre-commit` | denied | denied | denied |
| `R/.git/refs/heads/probe` | denied | denied | denied |
| `R/.git/packed-refs` | denied | denied | denied |
| `R/.git/objects/probe` | denied | denied | denied |
| `R/.git/worktrees/<n>/HEAD` | denied | denied | denied |
| `R/.git/worktrees/<n>/config.worktree` | denied | denied | denied |
| `R/.git/info/exclude` | denied | denied | denied |
| `R/` 작업 트리 파일(배치 2) | denied | denied | denied |

- 두 배치 모두 같은 결과다. 자기 worktree만 쓰기 가능했다. (b)가 (a)보다 새로 연 대상이 없으므로 (b)를 채택했다.
- 저장소는 실제 배치와 같게 home 아래 임시 경로에 두었고, 측정 뒤 지웠다.

T4 측정 (Claude 2.1.327, scratch 저장소, 홈 probe 파일은 측정 뒤 삭제)

| ID | 결과 | 구현 반영 |
|---|---|---|
| MI-4 | pass. D2′(`Write` 규칙 없음) + `acceptEdits`에서 Write 도구 `.git/hooks/x`, Edit 도구 `.git/config`, Bash `echo >> .git/config`, Bash `touch .git/hooks/y`가 모두 거부됐다. `.git/config` 해시 불변, 작업 트리 쓰기는 허용 | `RECORDED_CLAUDE_SANDBOX_SETTINGS.permissions.deny = ['Edit(./.git/**)']` |
| MI-5 | pass. `acceptEdits` + loopback settings에서 bind+connect 200, 외부 차단. `-p`에서는 복합 Bash 명령이 승인 요청으로 멈추므로 단일 명령으로 측정했다 | Claude `network.loopback` pass 유지 |
| MI-6 | pass. domains settings + 비밀 env 빈 값에서 CLI 인증·실행 유지, Bash에서 빈 값. 허용 목록 밖 도메인 차단 | 비밀 env 이름 → `""` |
| MI-7 | pass. `Read(~/…)`, `Read(//<abs>…)` 모두 Read 도구 명시적 거부. 규칙이 없으면 cwd 밖 Read는 승인 요청(ask)으로 멈춘다(대조군) | `<form>` = 절대 경로(`Read(//<abs>/**)`, `Read(//<abs>)`). `<cli-homes>`가 홈 밖일 수 있어서다 |
| MI-8 | pass. 실제 `buildClaudeArgs` Scouter argv(`--permission-mode default --allowedTools WebFetch,WebSearch`)로 WebFetch·WebSearch 성공, `permission_denials` 없음 | B12 유지 |
| MI-9 (Claude) | pass. 디렉터리 `denyRead`에서 하위 파일 읽기와 `ls` 거부, 파일 경로도 거부 | Claude domains `conditional` 유지, 조건 문구를 proxy 한계로 교체 |

T5 측정 (Chrome 158.0.8127.37, scratch 저장소, 홈 probe 파일은 측정 뒤 삭제)

| ID | 결과 | 구현 반영 |
|---|---|---|
| MI-A | pass. 4.6 확정 형식으로 3회 반복: localhost 페이지·스크린샷 성공, example.com 차단(proxy), 홈 파일·`~/Library` 파일 `ERR_FILE_NOT_FOUND`, `/etc/hosts`는 읽힘. `~/Library` 읽기 허용 없이 동작했다. `--use-mock-keychain`이 없을 때의 멈춤과, 측정을 오염시킨 GoogleUpdater 실행을 profile과 인자로 막았다. 측정본은 deny와 allow 사이에 빈 줄이 있고 구현 렌더링에는 없다(규칙 같음) | `chrome.sb` 확정, Chrome 인자에 `--use-mock-keychain`, `service.browser-cdp` conditional 조건 문구 교체 |
| MI-B | 측정 불가. host 전역 `playwright`·`playwright-core`가 없다(Q1에 따라 설치하지 않음) | Playwright 세 gate `held`, launcher·profile 방어용 throw |
| AC9 live (구성 요소) | pass. 실제 worktree 모듈과 Chrome·CLI로 Codex Tester(profile mode B argv)와 Claude Tester(`buildClaudeArgs` settings)가 `services.json` endpoint, `/json/version`, localhost 페이지, 스크린샷, 외부 차단, `~/.gitconfig` 차단을 모두 확인했다. 한계: scratch·hostDir 삭제는 harness가 직접 호출했다. Claude는 `ARC_*` env를 프로세스 env에도 넣어 settings만의 전달은 입증하지 않았다. supervisor 전체 dispatch live는 머지·설치 뒤 확인한다(사용자 결정, O3 경로는 설치 marker runtime 해시 불일치로 `activation_unverified`) | 정리 순서는 supervisor 연결 테스트로 고정 |
- 발견(후속): Claude Bash의 `TMPDIR`는 settings env와 달리 `/tmp/claude-<uid>`로 강제된다. Claude Tester는 Write 도구가 없어 Bash heredoc 스크립트가 CLI 명령 검증기에 막힌다.

## 9. 수용 기준

| ID | 기준 | 검증 |
|---|---|---|
| AC1 | spec 3장 범주표와 플랫폼×역할 기준선이 `docs/harness-operation.md`에 들어 있고 T0b·MI 결과를 반영한다 | 문서 검토 |
| AC2 | 읽기 역할 인자의 바이트가 base `6244a8af`와 같다. 예외는 Claude Scouter에 `'--allowedTools','WebFetch,WebSearch'` 두 토큰이 `--permission-mode default` 바로 뒤에 들어가는 것 하나다. 읽기 역할의 `toolAccess` 요청은 `invalid_request`다 | 역할×플랫폼 인자 바이트 테스트, Scouter diff가 정확히 2개 토큰 |
| AC3 | scratch 생성(0700, 하위 4개), env, evidence 복사(symlink·비정규 파일 거부, 상한, truncated), 모든 종료 경로의 삭제, 삭제 실패 경고가 테스트된다. `changedPaths`·`controlChanged`에 영향이 없다 | supervisor 단위·통합 테스트 |
| AC4 | `toolAccess` 6개 키 고정, 중복 거부, 정규화, 역할 표, id만 허용, 5.3 domains 규칙의 허용·거부 표가 테스트된다 | 계약 테스트 |
| AC5 | gate가 pass·conditional이 아니면 prepare와 supervisor 모두 `permission_scope_unverified`다. `full`은 초기에 모든 플랫폼에서 held다. conditional 부여는 결과 `toolAccess.conditions`에 드러난다 | 계약 테스트 |
| AC6 | Codex는 profile mode와 `sandbox_mode`를 배타적으로 쓴다. profile 인자에는 항상 `"<wt>/.git"="read"`, `"<wt>/.codex"="read"`(절대 경로)가 앞에 있다. 없으면 throw한다. MI-1·MI-3 결과가 상수와 테스트 주석에 고정된다 | 인자 테스트, 보호 항목 제거 시 throw 테스트 |
| AC7 | Claude는 `toolAccess`가 없으면 settings가 D2′ + `env`(`base`·`caches`)와 바이트가 같다. `Write(./.git/**)`는 제거된다(MI-4 통과 전제) | settings 바이트 테스트 |
| AC8 | 금지 목록·비밀 env 패턴은 `FORBIDDEN` 하나에서 나온다. 모든 adapter 렌더링과 grant 겹침 검사가 그것을 참조한다 | 데이터 단일 출처 테스트 |
| AC9 | host 서비스를 fake 실행 파일로 테스트한다(시작, endpoint 파일, 종료, 정리 경고). live dispatch를 Codex·Claude에서 `browser-cdp` 1회, `browser-playwright-*` 각 1회 실행한다. MI-A의 `~/Library` 축소 결과를 기록한다 | 단위 테스트 + Orchestrator host live 기록 |
| AC10 | 기존 보안 계약 테스트의 단언을 약화하지 않는다. 바꾸는 것은 다음으로 한정한다: `tests/node/role-bridge-args.test.mjs:99`, `tests/node/role-routing-dispatch.test.mjs:84`의 `Write(./.git/**)` 기대값 제거, Claude Scouter 인자 기대값에 2개 토큰 추가, 쓰기 역할 인자 기대값에 env 항목 추가 | diff 검토 |
| AC11 | `tool-access.mjs`, `host-service.mjs`, 새 supervisor 코드에 플랫폼 이름 분기가 없다. 플랫폼 차이는 adapter 표에 있다 | 소스 검사 테스트 |
| AC12 | README, `docs/harness-operation.md`, coordination 4종, `shared/skill/runtime/` 생성본, MANIFEST가 갱신된다. 전체 suite에서 기준선 대비 새 실패가 0건이다 | 전체 suite, `scripts/update-runtime-assets.mjs` 동기화 테스트 |

## 10. 범위

### 10.1 포함
- runtime 기존 파일
  - `lib/runtime/role-bridge-args.mjs`
  - `role-dispatch-policy.mjs`
  - `role-supervisor.mjs`
  - `role-routing.mjs`
  - `command.mjs`
  - `role-dispatch-store.mjs`
  - `role-observe.mjs`(Codex 기대값)
  - `role-bridge.mjs`(argsDigest 계산 경로가 새 입력을 받도록)
- runtime 새 파일: `lib/runtime/tool-access.mjs`, `lib/runtime/host-service.mjs`
- 생성본: `shared/skill/runtime/` 대응본, MANIFEST
- 관련 테스트: `tests/node/`
- 문서: README, `docs/harness-operation.md`, coordination 4종(`{claude,codex,grok,gemini}/skill/references/coordination.md`)

### 10.2 조건부
- `lib/runtime/grok-sandbox.mjs`와 Grok adapter: B14 pass일 때만(T6)

### 10.3 비목표
- Gemini 도구 접근(GG1 held)
- Claude Planner·Reviewer Bash 추가(finding만)
- Grok 읽기 역할 강제(finding만)
- 의존성 설치·docker 지원
- EMFILE의 OS 원인 해결
- Codex proxy 미준수 도구 우회

### 10.4 금지
- 읽기 역할 인자 변경(B12 예외 외)
- 새 reason code
- 사용자 설정 파일 수정
- 저장소 코드의 host 실행

## 11. task 분할 제안과 의존성

| task | 내용 | 주요 파일 | 선행 | MI |
|---|---|---|---|---|
| T1 계약 | `tool-access.mjs`: 형태 검증, 역할 표, domains 규칙, `TOOL_ACCESS_GATES`, `TOOL_ENV_PRESETS`, `TOOL_PATHS`, `FORBIDDEN`, `toolAccessReasons`. `command.mjs` 키 추가, `role-routing.mjs` 검증·gate, lease v3 | tool-access, command, role-routing, role-dispatch-store, tests | – | – |
| T2 scratch·env·evidence | supervisor의 scratch 생성·복사·삭제, preset 값 계산, `buildBridgeInvocation`에 tool context 전달 | role-supervisor, tool-access, role-bridge, tests | T1 | MI-C |
| T3 Codex adapter | sandbox/profile mode, R1 보호 항목, env set/exclude, 비밀 none, 사용자 설정 충돌 검사, 관측 기대값 | role-bridge-args, role-supervisor, role-observe, role-dispatch-policy, tests | T2 | MI-1(첫 단계), MI-2, MI-3, MI-9 |
| T4 Claude adapter | settings 조립, `Write(./.git/**)` 제거, Scouter `--allowedTools`, Read 거부 규칙, env 빈 값 | role-bridge-args, role-dispatch-policy, tests | T2 (T3과 파일이 겹쳐 T3 뒤에 순차 진행 권장) | MI-4, MI-5, MI-6, MI-7, MI-8, MI-9 |
| T5 host 서비스 | `host-service.mjs`, supervisor 수명 통합, services.json, Codex host 디렉터리 `"read"`, Chrome·Playwright 격리 | host-service, role-supervisor, tool-access, tests | T3, T4 | MI-A, MI-B, AC9 live |
| T6 Grok (조건부) | B14 pass일 때 Grok custom 프로필에 같은 메커니즘 | grok-sandbox, role-bridge-args | T2, B14 | B14 |
| T7 문서 | README, harness-operation, coordination 4종, finding 2건, 한계 문서화 | docs | T1–T5 (T6 있으면 포함) | – |
| 최종 | 전체 변경 Reviewer 1회 (모든 task 수용과 필수 Tester가 끝난 뒤) | – | 전부 | – |

- 각 task는 자기가 바꾼 runtime 파일의 `shared/skill/runtime/` 생성본과 MANIFEST를 같이 갱신한다. 그래야 task마다 suite가 녹색을 유지한다.
- 파일이 겹치는 곳: `role-supervisor.mjs`(T2·T3·T5), `role-bridge-args.mjs`(T3·T4), `tool-access.mjs`(T1·T2·T5), `role-dispatch-policy.mjs`(T3·T4). 따라서 T3과 T4는 병렬보다 순차를 권장한다.
- T3과 T4의 MI가 실패하면 해당 gate만 held로 두고 task는 수용할 수 있다. 단 Orchestrator 보고가 필요하다.

## 12. 테스트 전략
- 계약(T1)
  - 6키 고정, 역할 표, 중복, 정규화
  - domains 허용·거부 표(5.3의 각 항목 1개 이상)
  - 읽기 역할 거부, native route
  - gate → reason
  - lease v1·v2·v3 round-trip, v3 키 집합
- 인자 바이트(T3·T4)
  - 5역할 × 4플랫폼 읽기 역할 인자가 base와 같은지(AC2)
  - Claude Scouter diff 2 토큰
  - Codex 쓰기 역할 sandbox mode = 기존 + env 항목
  - profile mode에 `sandbox_mode`가 없고 보호 항목이 앞에 있는지
  - 보호 항목 누락 시 throw
  - domains 렌더링(`none`, exclude)
  - Claude D2′ + env 바이트, network·denyRead·Read 규칙
- supervisor(T2·T5)
  - fake CLI로 scratch 생성과 권한
  - env가 child args에 반영되는지
  - evidence 복사 규칙(symlink, FIFO, 상한, 깊이)
  - 종료 경로별 삭제(earlyFailure·cancel·timeout)
  - 삭제 실패 경고
  - `detectViolations` 결과 불변
  - host 서비스 fake(시작 실패 → `execution_failed`, endpoint 파일 0600, 종료와 정리 경고)
- 단일 출처·분기 금지
  - `FORBIDDEN` 참조 검사
  - 새 모듈 소스에 플랫폼 문자열 분기가 없는지 검사(AC8·AC11)
- live(Orchestrator host, AC9): MI 항목 결과와 live dispatch 기록을 spec 측정 결과 절과 handoff record에 남긴다.
- 전체 suite: 기준선의 기존 실패와 부하 flake를 구분한다. 새 실패 0건으로 판정하고, 의심 테스트는 단독으로 재실행한다.

## 13. 문서 변경
- `docs/harness-operation.md`
  - 범주표, 기준선, 메커니즘, 요청 계약, gate 표
  - 한계: loopback 포트 비한정, Codex proxy 미준수, 저장소 밖 쓰기 감지 불가, recursive `fs.watch`, `ps` host 전용, Chrome·Playwright `~/Library`·`file://`, Claude env 빈 값
  - finding 2건
- README: 사용자용 요약(toolAccess 개요, 영구 금지, host 전용 목록)
- coordination 4종
  - Orchestrator가 `toolAccess`를 요청하는 기준
  - 역할이 "환경 제한(host 전용)"으로 보고하는 규칙
  - `ARC_SCRATCH_DIR`·`ARC_EVIDENCE_DIR`·`ARC_HOST_SERVICES_FILE` 사용법
- MANIFEST, `shared/skill/runtime/`

## 14. 미해결 질문
- Q1 (결정 2026-11-24): (a) 전역 `npm root -g`의 `playwright`/`playwright-core`. 새 설정 표면은 만들지 않는다.
- Q2 (확인됨 2026-11-24, 제안대로): `full`을 Codex·Claude 모두 held로 둔다(P1). Codex proxy 미준수 도구 때문에 full을 열지 않는다는 해석이 맞는지.
- Q3 (확인됨 2026-11-24, 제안대로): AC7을 "D2′ + env"로 고친다(P6).
- Q4 (확인됨 2026-11-24, 제안대로): Playwright 서비스 id를 브라우저별로 나눈다(P3).
- Q5 (확인됨 2026-11-24, 제안대로): endpoint를 env가 아닌 env가 가리키는 파일로 넘긴다(P2).
- Q6 (확인됨 2026-11-24, 제안대로): MI-6·MI-7이 실패하면 Claude domains를 held로 둔다.
- Q7 (해소): coordination 4종은 `claude/skill/references/coordination.md`, `codex/…`, `grok/…`, `gemini/…`다(Orchestrator 확인).

## 개정 이력
- 초안 (2026-11-24): 설계 v2, T0·T0b·추가 측정, B12 결정 반영
- v1 승인 (2026-11-24): Q1 (a) 전역 설치본, Q2–Q6 제안대로, Q7 경로 확인
- v1.2 (2026-11-24, T1 중): 5.3 정규식 TLD 자리에 punycode `xn--…`를 허용해 본문("punycode `xn--`는 regex가 허용한다")·RF5와 맞춤
- v1.1 (2026-11-24, plan 검토): MI-2를 `CODEX_HOME` scratch 복사본 측정으로 바꿔 10.4(사용자 설정 수정 금지)와의 충돌을 없앰
- v1.3 (2026-11-24, T3 수용): 8.2 구현 단계 측정 결과(MI-C, MI-1, MI-2, MI-3, MI-9 Codex) 추가. 4.4에 후보 B 채택 표기, 6장 `codexProfile` 근거 갱신, 8.1 결과 기록 위치를 8.2로 정정(plan O6)
- v1.4 (2026-11-24, T4 수용): 8.2에 T4 측정(MI-4–9 Claude) 추가, 6장 Claude `network.domains` 근거 갱신(plan O6)
- v1.5 (2026-11-24, T5 수용): 4.6 `chrome.sb`를 MI-A 확정 형식으로 바꾸고 `--use-mock-keychain` 추가, MI-B 측정 불가 기록, 6장 `service.*` 행 갱신, 8.2에 T5 측정(MI-A, MI-B, AC9 구성 요소 live) 추가(plan O6)
