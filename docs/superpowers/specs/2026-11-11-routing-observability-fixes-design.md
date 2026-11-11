# 복합 역할 라우팅 관측성 수정 설계

- 날짜: 2026-11-11
- 규모: 작은 변경(짧은 설계). 위험도: significant(인증 처리, 공개 런타임 계약, 사용자 표시 라벨)
- 기준: 브랜치 `feat/install-update-integration-screen`, HEAD `a8ffd31810cccd6f9db35076235340eceb9ff90a`

## 1. 의도

복합 역할 실행 중 세 가지 문제가 관측되었다.

1. Codex refresh token이 서버에서 폐기된 상태(rollout `task_complete` 오류 `{"message":"Your access token could not be refreshed because your refresh token was revoked. Please log out and sign in again.","codex_error_info":"unauthorized"}`)에서도 `codex login status`는 `Logged in using ChatGPT`, 종료 코드 0을 출력했다. 그 결과 `routing-status`와 `prepare-dispatch`가 Codex를 사용 가능으로 보고했고, bridge 실행은 시작 후에야 실패했다.
2. `run-dispatch` 직후 `waitMs: 540000`으로 호출한 bridge `observe`가 `starting`→`running` 전이에서 즉시 반환되었다. 지침상 최대 대기 1회를 의도했으나 Orchestrator가 반복 호출해야 했다.
3. 인증 상태 라벨이 `Avaliable` / `Not Avaliable`로 잘못 표기되어 있다.

## 2. 목표

- C1: Codex 인증 검사는 실제 토큰 갱신을 시도한다. 갱신이 영구적으로 거부되면 `Unauthorized`로 보고한다. 판정할 수 없으면 `Incomplete`(내부 `unknown`)로 보고하며 `Available`로 보고하지 않는다. 적용 대상은 복합 라우팅(`routing-status`, `prepare-dispatch`, `resume`)과 TUI 홈 상태, `Claude & Codex` 구성 적용 게이트다(2026-11-11 사용자 결정: 홈도 실제 검사).
- C2: bridge `observe`에 `waitMs`가 있으면 lease가 터미널 상태(`completed`, `failed`, `cancelled`) 또는 `unknown`에 도달하거나 `waitMs`가 지나야 반환한다. 중간 전이(`reserved`/`starting`→`running`)는 대기를 끝내지 않는다. `markLostIfDue`의 lost supervisor 표시는 대기 중에도 그대로 동작한다.
- C3: 라이브 값과 사용자 표시 라벨의 `Avaliable` / `Not Avaliable`을 `Available` / `Not Available`로 바꾼다. 대상은 런타임 출력, 사유 코드, TUI 홈, 구성 적용 오류 메시지, 테스트, 현재 문서다.
- C4: `npm test`, `npm run check:manifest`, `npm run check:role-policy`, 런타임 사본 parity(`node scripts/update-runtime-assets.mjs --check`)가 모두 통과한다. 기준선에서 이미 실패하던 항목은 계획의 B0 기록과 대조한다.
- C5: 런타임 버전을 `cooperative-8`로 올리고 마이그레이션 안내를 갱신한다(2026-11-11 사용자 결정).

## 3. 비목표와 금지 사항

- Claude 인증 probe(`claude auth status --json`)는 바꾸지 않는다.
- native `observe`(이벤트 기록) 계약은 바꾸지 않는다.
- 이미 저장된 lease의 사유 코드(`Not Avaliable`)는 이관하지 않는다. 기존 30일 보존 정리에 맡긴다.
- 금지:
  - 판정하지 못한 probe가 `authenticated`/`Available`을 반환하는 것(§6.1 표의 명시된 예외 제외).
  - access token, 계정 이메일, 원시 오류 문구를 출력, 로그, 파일, 오류 메시지에 남기는 것. 토큰은 비어 있는지 판정한 직후 참조를 버린다.
  - probe 자식 프로세스를 남기는 것.
  - `routing-status`나 TUI 홈이 제한 시간 없이 멈추는 것.

## 4. 제약과 근거

- 사용자가 승인한 절충: Codex 인증을 검사할 때마다 네트워크 호출이 일어나고, `CODEX_HOME/auth.json`의 토큰이 회전한다. TUI 홈을 열 때도 마찬가지다.
- 근거(codex-cli 0.167.1, `openai/codex` tag `rust-v0.167.1`, commit `0a94398`, P1 Scouter 조사와 Orchestrator 확인):
  - `account/read`의 `refreshToken: true`는 갱신 실패를 버리고 정상 계정을 반환한다(`codex-rs/app-server/src/request_processors/account_processor/workspace_routing.rs:258-278`, `account_processor.rs:1082-1094`). 따라서 이 메서드로는 폐기를 감지할 수 없다.
  - `getAuthStatus`에 `includeToken: true, refreshToken: true`를 주면, 갱신이 영구 실패했을 때 `authMethod`는 채워지고 `authToken`은 `null`이다(`account_processor.rs:1097-1158`: `include_token && permanent_refresh_failure`이면 토큰을 내보내지 않음). 영구 실패는 폐기(`refresh_token_invalidated`), 만료, 재사용 등이다(`codex-rs/login/src/auth/manager.rs:1800-1852`). 네트워크 일시 장애는 영구 실패가 아니므로 기존 토큰이 반환된다.
  - 호스트 소유 자격 증명(`headers`, `agentIdentity`, `personalAccessToken`, workload identity)은 갱신 여부와 관계없이 토큰을 내보내지 않는다(같은 위치).
  - `AuthMode` 값: `apikey`, `chatgpt`, `chatgptAuthTokens`, `headers`, `agentIdentity`, `personalAccessToken`, `bedrockApiKey`, `bedrockAccessKeys`.
  - 토큰 회전의 영향(P1b): 다른 Codex 프로세스는 갱신 전(guarded reload, `manager.rs:3325-3388`)과 401 복구 때(`manager.rs:2005-2013, 2132-2171`) `auth.json`을 다시 읽는다. 따라서 열린 Codex 세션이 회전 때문에 계속 실패할 위험은 낮다. 남는 위험은 §8 R1.
- 설치 런타임은 `lib/runtime/*.mjs`만 복사한다(`scripts/update-runtime-assets.mjs`). 그래서 `lib/models/codex-catalog.mjs`의 JSON-RPC 클라이언트를 import할 수 없고, 같은 패턴의 최소 클라이언트를 `lib/runtime/local-cli.mjs`에 둔다. TUI 홈(`lib/management/status.mjs`)은 같은 함수를 import한다.
- 자식 실행 규칙은 기존 probe와 같다: `context.executable`, `shell:false`, `cwd: context.cwd`, `env: localCliEnvironment(context)`.

## 5. 접근 방식

| 항목 | 고려한 방식 | 절충 | 선택 |
|---|---|---|---|
| C1 | A. `account/read {refreshToken:true}` | 갱신 실패를 버리므로 폐기를 감지하지 못함(P1a) | 기각 |
| | B. `getAuthStatus {includeToken:true, refreshToken:true}` | 영구 갱신 실패를 감지한다. 대신 성공 시 access token이 ARC 프로세스 메모리에 잠시 들어오고, 이전 방식 API라 나중에 바뀔 수 있다 | **사용자 선택(2026-11-11)** |
| | C. `auth.json`의 만료 시각을 로컬에서 해석 | 서버 측 폐기를 감지하지 못하고 비공개 저장 형식에 의존 | 기각 |
| | D. `codex login status` 유지 | 관측된 결함이 그대로 남음 | 기각 |
| C2 | A. 터미널 또는 `unknown`에서만 반환 | 지침의 "최대 대기 1회"와 맞는다 | **사용자 선택** |
| | B. 입력 플래그 추가 | 입력 키와 지침이 늘어나고 기본 동작의 결함이 남음 | 기각 |
| C3 | 모든 라이브 위치에서 철자 교정 | 공개 출력 값이 바뀐다 | **사용자 선택(모두 수정)** |

## 6. 설계

### 6.1 C1 Codex 인증 probe

- `lib/runtime/local-cli.mjs`에 `probeCodexAuthStatus(context, {signal, timeoutMs = 10000})`를 추가한다. 반환 형식은 `probePlatformAuth`와 같은 `{platform:'codex', authStatus, reason?}`다.
- 절차: `app-server` 자식을 실행한다 → `initialize`(`clientInfo:{name:'arc',title:'ARC',version:'1.0.0'}`) 응답 확인 → `initialized` 알림 → `getAuthStatus` `{includeToken:true, refreshToken:true}` → stdin 종료 → SIGTERM, 1초 뒤에도 남아 있으면 SIGKILL.
- 시간 상한: 요청 교환 전체에 `timeoutMs`(`policy.probeTimeoutMs`, 10000)를 적용하고, 정리에 최대 2초를 더 쓴다.
- `id`가 없는 메시지(알림)와 `method`가 있는 서버 요청은 무시한다. 출력 버퍼 상한은 1 MiB다.
- 응답의 `authToken`은 "비어 있지 않은 문자열인가"만 판정하고 즉시 버린다. 응답 객체 전체를 결과, 오류, 로그에 넣지 않는다.
- 판정표:

| app-server 결과 | `authStatus` | `reason` |
|---|---|---|
| `requiresOpenaiAuth === false` | `authenticated` | — (OpenAI 인증이 필요 없는 provider) |
| `authMethod`가 문자열이고 `authToken`이 비어 있지 않은 문자열 | `authenticated` | — |
| `authMethod === 'chatgpt'`이고 `authToken`이 `null` | `unauthorized` | `token_rejected` |
| `authMethod`가 `headers`·`agentIdentity`·`personalAccessToken`이고 `authToken`이 `null` | `authenticated` | — (호스트 소유 자격 증명은 토큰을 내보내지 않으며 갱신 대상도 아니다. 기존 `login status`와 같은 수준) |
| 그 밖의 `authMethod`이고 `authToken`이 `null` | `unknown` | `auth_unverified` |
| `authMethod === null`이고 `requiresOpenaiAuth !== false` | `unauthorized` | `not_logged_in` |
| 응답 형식 위반, JSON 아님, 모르는 `id`, 1 MiB 초과 | `unknown` | `invalid_response` |
| `getAuthStatus` 또는 `initialize` 오류 | `unknown` | `status_command_failed` |
| 실행 실패, 응답 전 종료, 신호 종료 | `unknown` | `cli_execution_error` |
| 시간 초과 / 중단 | `unknown` | `timeout` / `aborted` |
| 유효하지 않은 context | `unknown` | `context.reason ?? 'invalid_context'` |

- 적용 위치:
  - `lib/runtime/role-routing.mjs`의 `authenticate()`는 platform이 `codex`일 때 `probeCodexAuthStatus`를 쓴다. `routingStatus`, `prepareRoleDispatch`, `resumeRoleDispatch`가 이 함수를 공유한다.
  - `lib/management/status.mjs`(TUI 홈과 구성 적용 게이트의 `probePlatformAuth` 호출 지점)도 Codex에 대해 같은 함수를 쓴다.
  - `probePlatformAuth`의 Codex `login status` 분기는 다른 호출자가 없으면 제거하고, 남는 호출자가 있으면 유지한다(구현 중 grep으로 확인).
  - **갱신 시점 제한(2026-11-11 실행 중 수정, 사용자 승인 2회):** 설치 트랜잭션은 준비 때 찍은 `CODEX_HOME` 디렉터리 메타데이터(mtime, size)를 실행 때 다시 비교한다(`lib/installer/transaction.mjs:12,24`). 토큰 갱신은 `auth.json`을 교체하고, 갱신이 없더라도 `codex app-server` 실행은 `CODEX_HOME`의 SQLite 보조 파일(`*-wal`, `*-shm`)을 만들거나 지울 수 있어 디렉터리 메타데이터를 바꾼다(실측). 따라서 스냅샷 이후에는 app-server를 띄우지 않는다. `Claude & Codex` 실행 단계의 재확인(`executeCompositeOperation`의 설치 전·게시 전 `collectStatus`)은 Codex에 대해 로컬 상태 명령 `codex login status`(DB를 열지 않으며 `CODEX_HOME`을 바꾸지 않음, 실측)로 로그아웃만 확인한다. 폐기 감지는 같은 작업의 준비 단계(스냅샷 전) app-server 검사가 맡는다. TUI 홈과 준비 단계, 복합 라우팅은 계속 app-server로 갱신해 검사한다.
- 공개 분류(`Available` / `Unauthorized` / `Incomplete` / `Not Available`)는 그대로다.

### 6.2 C2 observe 대기

- `lib/runtime/role-bridge.mjs`의 `recordRoleObservation` bridge 루프 종료 조건을 `TERMINAL_STATES.includes(state) || state === 'unknown' || Date.now() >= end`로 바꾼다. "처음 상태와 다르면 반환" 조건은 없앤다.
- 반복마다 `markLostIfDue`를 먼저 호출하는 순서는 유지한다. 대기 중 supervisor가 사라지면 `unknown`으로 기록되고 즉시 반환된다.
- `waitMs`가 없거나 0이면 기존처럼 1회 확인 후 반환한다. 이미 터미널이면 즉시 반환한다.
- 입력 검증, 반환 형식(`fromLease`), native 경로는 바꾸지 않는다.

### 6.3 C3 라벨

- 교정 위치: `role-routing.mjs`의 `authenticate`와 `prepareRoleDispatch`, `role-bridge.mjs`의 `resumeRoleDispatch`, `role-dispatch-policy.mjs`의 `RELEASE_CONDITIONS` 키(`'Not Available'`), `role-supervisor.mjs`의 `earlyFailure` 사유, `lib/management/operations.mjs:46`, `lib/tui/app.mjs:65`.
- 함께 바꿀 테스트와 현재 문서: `docs/harness-operation.md:26`. `README.md`에는 해당 철자가 없다.
- 설치 사본(`claude/skill/runtime`, `codex/skill/runtime`)은 `scripts/update-runtime-assets.mjs`로 다시 생성한다.

### 6.4 런타임 버전 (C5)

- `lib/runtime/bootstrap.mjs`의 `runtime`을 `cooperative-8`로 올린다.
- 런타임 모듈 바이트가 바뀌면 `runtimeHash`가 바뀐다. 설치 후 기존 prepared marker는 `activation_unverified`가 되어 Install / Update를 다시 해야 한다. 진행 중인 cooperative workflow는 `cooperative.versions`로 보류된다(`lib/runtime/evaluate.mjs:193`).
- `docs/harness-operation.md`의 마이그레이션 문단과 `README.md:45`를 `cooperative-8` 기준으로 갱신한다.

## 7. 기존 문서와의 관계

- 승인된 과거 스펙과 계획(`docs/superpowers/specs/*`, `docs/superpowers/plans/*`)은 수정하지 않는다. 이 문서들은 승인 당시의 기록이며, cooperative workflow가 승인 문서의 SHA-256과 Git 경로를 기록하므로 수정하면 승인 증거와 실제 내용이 어긋난다.
- 이 스펙이 다음 조항을 대체한다.
  - `2026-11-10-composite-role-execution-design.md` §5.2 `observe` 행(127행, "상태 변화 또는 `waitMs` 경과까지") → §6.2. §5.3 137행과 235행의 `Not Avaliable` → `Not Available`.
  - `2026-11-08-role-platform-routing-design.md`의 라벨 표기. "`Unauthorized`는 명시적 로그아웃에만"과 "로그인 상태는 토큰 실시간 유효성을 증명하지 않는다"는 한계는 Codex에 한해 §6.1로 대체한다.
  - `2026-11-08-tui-overall-flow-design.md` 47행("사용자 요구 그대로 `Avaliable`… 유지")과 `2026-11-08-tui-preset-version-flow-design.md` 28행 → 2026-11-11 사용자 결정(C3 "모두 수정")으로 대체.

## 8. 위험과 가정

- R1 토큰 회전: probe의 갱신으로 refresh token이 회전한다. 다른 Codex 프로세스는 갱신 전과 401 복구 때 `auth.json`을 다시 읽으므로 대체로 따라온다(§4). 다만 다른 프로세스가 자기 guarded reload 이후, 갱신 요청 직전에 회전이 일어나면 그 갱신 하나가 실패할 수 있다. 영구 실패 기록 뒤 자동 재읽기는 확인되지 않았다. 사용자는 이 절충을 승인했다.
- R2 잠금 보유 시간: 라우팅 인증 probe는 라우팅 잠금 안에서 실행된다. 네트워크 지연만큼 잠금 보유가 늘어나 다른 명령이 잠금 busy로 보류될 가능성이 커진다.
- R3 오프라인: 네트워크 일시 장애는 영구 실패가 아니므로 기존 토큰으로 `authenticated`가 된다. bridge 실행은 그 뒤 네트워크 오류로 실패할 수 있다.
- R4 TUI 홈 지연: 홈을 열 때마다 app-server를 띄우고 네트워크 갱신을 하므로 최대 `timeoutMs + 2초` 늦어질 수 있다. 시간 초과 시 `Incomplete`.
- R5 Codex 호스트 샌드박스: Codex 호스트에서는 `CODEX_HOME` 쓰기에 승격 승인이 필요하다. 승인 없이는 갱신 쓰기가 실패해 `Incomplete`가 될 수 있다.
- R6 workload identity가 `chatgpt` 방식으로 보고되면서 토큰을 내보내지 않는 경우 `Unauthorized`로 잘못 판정될 수 있다. 이 조합은 로컬에서 재현할 수 없으며, 발생하면 후속 수정 대상이다.
- R7 `getAuthStatus`는 이전 방식 API다. Codex 버전 상향 때 바뀔 수 있으므로 지원 CLI 범위(`>=0.167.0 <0.168.0`)를 벗어나면 다시 검증한다.
- A1 `getAuthStatus`가 0.167.x에 존재하고 위 동작을 한다는 점은 소스로 확인했다. 유효 토큰 경로는 실제 실행으로 확인한다. 폐기 토큰 경로는 소스 근거와 가짜 app-server 테스트로만 확인한다.

## 9. 수용 기준

- AC1: 가짜 app-server가 `authMethod:'chatgpt', authToken:null`을 반환하면 `routing-status`의 `platforms.codex.authentication`은 `{status:'Unauthorized', reason:'token_rejected'}`이고, `prepare-dispatch`는 `Unauthorized` 사유로 hold하며 lease를 만들지 않는다. TUI 홈은 `Codex: Unauthorized`를 표시한다.
- AC2: 판정 불가 경우(오류, 잘못된 응답, 종료, 중단, 시간 초과)는 모두 `Incomplete`이고, 시간 초과 시에도 `timeoutMs + 2000ms` 안에 반환하며 자식이 남지 않는다.
- AC3: 유효 토큰의 실제 `codex`로 `probeCodexAuthStatus`가 `authenticated`를 반환한다.
- AC4: access token 문자열, 계정 이메일, 원시 오류 문구가 probe 결과, 라우팅 결과 JSON, TUI 출력 어디에도 나타나지 않는다.
- AC5: `waitMs` 대기 중 `starting`→`running` 전이로는 반환하지 않고, 터미널, `unknown`, `waitMs` 경과에서만 반환한다. 대기 중 lost supervisor는 `unknown`(`terminal_state_unverified`)으로 기록되고 반환된다.
- AC6: 라이브 소스, 설치 사본, `tests/node`, `README.md`, `docs/harness-operation.md`에 `Avaliable`이 없다.
- AC7: 런타임 버전이 `cooperative-8`이고 관련 문서와 테스트가 일치한다.
- AC8: C4의 모든 검사가 통과한다(기준선 실패는 B0 기록과 대조).
- AC9: `Claude & Codex` 실행 단계의 재확인은 Codex에 대해 app-server를 띄우지 않고 `codex login status`만 실행하며, 준비 단계와 TUI 홈, 복합 라우팅은 app-server로 갱신해 검사한다. 실제 환경에서 기존 설정으로 `Claude & Codex` Install / Update가 `Install target changed` 없이 끝나고 구성이 게시된다.

## 10. 빌더에게 맡기는 것

- probe 내부 구조(메시지 버퍼링, 정리 순서)는 판정표와 상한을 지키는 범위에서 자유롭게 정한다.
- 테스트 대기 시간 값은 CI 부하를 고려해 정한다.
