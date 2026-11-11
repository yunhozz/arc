# 복합 역할 라우팅 관측성 수정 구현 계획

> **에이전트 작업자용:** 이 계획은 ARC 역할 흐름으로 실행한다. 각 최상위 작업마다 새 Implementer가 구현하고, 새 QA가 검증하며, Orchestrator가 수용한 뒤 집중 커밋 1개를 만든다. 모든 작업이 수용된 뒤 Reviewer가 최종 전체 변경을 한 번 검토한다. 단계는 체크박스(`- [ ]`)로 추적하며, 체크박스는 커밋 단위가 아니다.

**목표:** Codex 인증 검사가 영구적으로 거부된 토큰을 감지하고, bridge `observe`가 터미널 또는 `unknown`까지 대기하며, 인증 라벨 철자를 교정하고, 런타임 버전을 `cooperative-8`로 올린다.

**구조:** 라벨 교정(T1) → observe 종료 조건(T2) → Codex 인증 probe와 연결(T3) → 런타임 버전 상향(T4). 작업마다 런타임 사본과 매니페스트를 다시 생성한다.

**기술 스택:** Node.js ≥22 ESM, `node:test`, 외부 의존성 없음.

**스펙:** `docs/superpowers/specs/2026-11-11-routing-observability-fixes-design.md`

## 전역 제약

- 라벨 값: `Available`, `Not Available`, `Unauthorized`, `Incomplete`. 사유 코드 키는 `'Not Available'`.
- 판정할 수 없는 Codex probe는 `authStatus:'unknown'`만 반환한다. `authenticated`는 스펙 §6.1 판정표의 명시된 행에서만 반환한다.
- probe 자식 실행: `context.executable`, 인자 `['app-server']`, `shell:false`, `cwd: context.cwd`, `env: localCliEnvironment(context)`, `stdio: ['pipe','pipe','pipe']`.
- probe 시간 상한: `timeoutMs`(`policy.probeTimeoutMs` = 10000) + 정리 최대 2000ms. 출력 버퍼 상한 1048576 바이트.
- access token은 비어 있는지만 판정하고 즉시 버린다. 계정 필드, 토큰, 원시 오류 문구를 결과, 오류, 로그, 파일에 넣지 않는다.
- `observe` 입력 검증, native 경로, `OBSERVE_MAX_WAIT_MS`(540000)는 바꾸지 않는다.
- `docs/superpowers/` 아래 과거 승인 문서는 수정하지 않는다(새 스펙 §7이 대체 관계를 기록).
- 런타임 모듈을 바꾼 작업은 반드시 `node scripts/update-runtime-assets.mjs`와 `node scripts/update-manifest.mjs`를 실행한다. 생성 파일을 손으로 고치지 않는다.
- 런타임 모듈 바이트를 바꾼 작업은 `tests/node/runtime-versions.test.mjs`의 `baselineHash`를 새 `cooperativeVersions().runtimeHash` 값으로 갱신한다. 값은 생성물 갱신 후 `node --input-type=module -e "import {cooperativeVersions} from './lib/runtime/bootstrap.mjs';console.log((await cooperativeVersions()).runtimeHash)"`로 얻는다. 이 테스트가 런타임 바이트를 고정하므로, 갱신하지 않으면 `… freezes the ordered T5 inventory …` 3개와 `install-only inventory additions …`가 실패한다. (2026-11-11 실행 중 계획 수정: T1에서 누락 발견, 사용자 승인.)

## 기준선 비교 규칙 (모든 작업 공통)

- 기준선(B0)에서 HEAD `a8ffd31`의 전체 테스트는 실패 75개이고, `tests/node/tui-setup.test.mjs`는 시간 제한 없이 돌리면 멈춘다(제한을 걸면 16개 실패, 1개 취소). 합친 실패 목록 92개는 Orchestrator가 보관한다(`baseline-failures-a8ffd31.txt`, 테스트 이름 정렬 목록). 사용자 결정(2026-11-11): 기존 실패는 이번 범위에서 고치지 않고 기준선 대비로 판정한다.
- 전체 테스트 명령은 `npm test` 대신 다음을 쓴다(멈춤 방지):
  `node --test --test-timeout=120000 tests/node/*.test.mjs > <log> 2>&1`
- 판정: `grep -E '^not ok' <log> | sed 's/^not ok [0-9]* - //' | sort > <current>` 후 `comm -13 <baseline> <current>`의 출력이 없어야 한다(새 실패 없음). 작업이 기존 실패를 고쳤다면 `comm -23`으로 목록을 보고에 남긴다. 작업이 의도적으로 기대값을 바꾼 테스트는 이름이 바뀔 수 있으므로 보고에 대응 관계를 적는다.
- 시간 초과로 취소된 테스트는 실패로 센다. `tui-setup.test.mjs`의 기존 멈춤은 기준선 항목으로 기록한다(B0 보충 결과 참조).

## 검토 초점

1. 느리거나 응답 없는 app-server: `routing-status`와 TUI 홈은 상한 안에 반환하고 자식이 남지 않아야 한다 → T3 `hang` 테스트.
2. access token, 계정 이메일, 원시 오류 문구가 출력에 새어 나가는 경우: 어디에도 없어야 한다 → T3 누출 테스트.
3. 인증과 무관한 오류: `Incomplete`이어야 하고 `Available`이나 `Unauthorized`가 되면 안 된다 → T3 `error` 테스트.
4. 대기 중 supervisor 소실: `waitMs` 이전에 `unknown`으로 반환해야 한다 → T2 lost 테스트.
5. 이미 터미널인 lease에 긴 `waitMs`: 즉시 반환해야 한다 → T2 테스트.

## 사전 조건 (완료)

- [x] **B0 — baseline 확인 (Orchestrator, 2026-11-11).** HEAD `a8ffd31`: 전체 테스트 실패 75개(`home status orders Claude then Codex…`, `home status with one collected target…` 포함, 즉 B1 확인), `tui-setup.test.mjs` 멈춤. 보충: `node --test --test-timeout=60000 tests/node/tui-setup.test.mjs`는 33개 중 16개 실패, 1개 시간 초과 취소. 합친 기준선 실패 목록은 92개 이름이다. `npm run check:manifest` 통과(246 files), `npm run check:role-policy` 통과(24 targets), `node scripts/update-runtime-assets.mjs --check` 통과(64 files).
- [x] **P1 — Codex 갱신 실패 형태와 회전 영향 (Scouter, Codex bridge, 2026-11-11).** 근거: `openai/codex` `rust-v0.167.1`(`0a94398`). (a) `account/read`는 갱신 실패를 버린다 → 원래 방식 무효. 사용자가 `getAuthStatus` 방식으로 변경을 승인했다(스펙 §4, §5). (b) 다른 프로세스는 갱신 전과 401 복구 때 `auth.json`을 다시 읽는다 → 회전 위험 낮음, 완화 불필요.

---

### Task T1: 인증 라벨 철자 교정

**목표와 범위:** 라이브 값과 표시 라벨의 `Avaliable`/`Not Avaliable`을 `Available`/`Not Available`로 바꾼다. 동작 변경은 없다.

**파일:**
- 수정: `lib/runtime/role-routing.mjs`(약 135, 137, 194행), `lib/runtime/role-bridge.mjs`(약 138행), `lib/runtime/role-dispatch-policy.mjs`(약 48행), `lib/runtime/role-supervisor.mjs`(약 156행), `lib/management/operations.mjs:46`, `lib/tui/app.mjs:65`, `docs/harness-operation.md:26`(라벨만)
- 테스트: `tests/node/role-routing-dispatch.test.mjs`(약 35, 101, 106, 107행), `tests/node/tui-app.test.mjs`, 신규 `tests/node/status-labels.test.mjs`, `tests/node/runtime-versions.test.mjs`(`baselineHash`만)
- 생성: `claude/skill/runtime/*`, `codex/skill/runtime/*`, `MANIFEST.sha256`

**선행:** B0. **산출 인터페이스:** `RELEASE_CONDITIONS['Not Available']`, `authenticate()`의 `authentication.status` ∈ {`Available`,`Not Available`,`Unauthorized`,`Incomplete`}.

- [x] **1단계: 실패하는 테스트 작성**
  - `role-routing-dispatch.test.mjs`: 기대값 `'Available'`, 테스트 이름 `'prepare-dispatch maps CLI absence, unauthorized and probe failure to Not Available, Unauthorized, Incomplete holds'`, 사유 `'Not Available'`.
  - 신규 `status-labels.test.mjs`:
    - `test('release conditions use the corrected Not Available code')`: `assert.ok(Object.hasOwn(RELEASE_CONDITIONS,'Not Available'))`, `assert.equal(Object.hasOwn(RELEASE_CONDITIONS,'Not Ava'+'liable'),false)`, `assert.throws(()=>reason('Not Ava'+'liable'))`.
    - `test('live sources, runtime copies, node tests and current docs do not contain the misspelled label')`: `lib/`, `claude/skill/`, `codex/skill/`, `tests/node/`의 모든 파일과 `README.md`, `docs/harness-operation.md`를 재귀로 읽어 `'Ava'+'liable'`이 없음을 단언한다. 실패 메시지에 파일 경로를 넣는다.
  - `tui-app.test.mjs` 신규 `test('home status shows Available, Not Available and Unauthorized labels')`: `collectStatus`가 `[{platform:'claude',state:'installed',diagnostics:[],authentication:{platform:'claude',authStatus:'authenticated'}},{platform:'codex',state:'absent',diagnostics:[]}]`을 반환하면 `rows[0] === 'Claude: Available / Codex: Not Available'`. 두 번째 실행에서 `[{platform:'codex',state:'installed',diagnostics:[],authentication:{platform:'codex',authStatus:'unknown',reason:'cli_not_found'}},{platform:'claude',state:'installed',diagnostics:[],authentication:{platform:'claude',authStatus:'unauthorized'}}]`이면 `rows[0] === 'Claude: Unauthorized / Codex: Not Available'`.
  - 기준선에서 실패하던 `tui-app.test.mjs`의 'home status orders Claude then Codex…', 'home status with one collected target…' 두 테스트는 기대값을 현재 라벨 체계(`'Claude: Available / Codex: Incomplete'`, `['Codex: Not Available','','Install / Update']`)로 고친다. 이는 C3 라벨 교정의 일부다.
- [x] **2단계: 실패 확인.** `node --test --test-timeout=120000 tests/node/role-routing-dispatch.test.mjs tests/node/status-labels.test.mjs tests/node/tui-app.test.mjs`. 기대: 위 테스트들이 철자 불일치로 FAIL.
- [x] **3단계: 구현.** 파일 목록의 문자열만 교정한다. `RELEASE_CONDITIONS` 키를 `'Not Available'`로 바꾸고, 해제 조건 문구는 유지한다. `docs/harness-operation.md:26`은 라벨 두 개만 바꾼다.
- [x] **4단계: 생성물 갱신.** `node scripts/update-runtime-assets.mjs` → `tests/node/runtime-versions.test.mjs`의 `baselineHash` 갱신(전역 제약) → `node scripts/update-manifest.mjs`.
- [x] **5단계: 통과 확인.** 1단계 대상 명령 통과. `node --test --test-timeout=120000 tests/node/runtime-versions.test.mjs` 통과. 기준선 비교 규칙의 전체 테스트(새 실패 없음, 위 두 home status 테스트는 통과로 전환). `npm run check:manifest`, `npm run check:role-policy`, `node scripts/update-runtime-assets.mjs --check`. `grep -rn "Avaliable" lib claude/skill codex/skill tests/node README.md docs/harness-operation.md` 출력 없음.
- [x] **6단계: 커밋(Orchestrator 수용 후)** — `fix(runtime): 인증 상태 라벨 철자 교정`

**수용 기준:** 스펙 AC6. 위 명령 모두 통과. 생성 사본과 매니페스트 일치.
**수용 전 QA:** 새 QA가 5단계를 재실행하고, `docs/superpowers/` 아래 기존 파일이 변경되지 않았음을 `git diff --stat`으로 확인한다.

**진행 기록 (2026-11-11, 진행 기록):** Implementer(Codex bridge) dispatch `c28496d9` 1~5단계(`baselineHash` 제외), 계획 수정(전역 제약 `baselineHash`, 사용자 승인) 뒤 새 Implementer dispatch `4511c58c`가 `baselineHash`를 `sha256:032029ed…`로 갱신. Orchestrator 전체 테스트(`--test-timeout=120000`): 1502개 중 실패 89, 취소 1, 기준선 대비 새 실패 0, 고쳐진 것 2(home status 두 테스트). QA dispatch `81225559` Q1~Q6 proven. 수용: Orchestrator.

---

### Task T2: bridge observe가 터미널 또는 unknown까지 대기

**목표와 범위:** `recordRoleObservation` bridge 루프의 반환 조건만 바꾸고 coordination 지침 4단계를 갱신한다.

**파일:**
- 수정: `lib/runtime/role-bridge.mjs:93-116`(주석 93행 포함), `claude/skill/references/coordination.md`, `codex/skill/references/coordination.md`(같은 4단계 문장)
- 테스트: 신규 `tests/node/role-bridge-observe-wait.test.mjs`, `tests/node/runtime-versions.test.mjs`(`baselineHash`만)
- 생성: 런타임 사본, `MANIFEST.sha256`

**선행:** T1 커밋(같은 파일과 매니페스트 직렬화). **소비:** `createRoutingFixture`, `writeLease`/`readLease`(`role-dispatch-store.mjs`), `withRoutingLock`(`role-routing.mjs`), `TERMINAL_STATES`. **산출:** 계약 "bridge `observe`는 `completed`·`failed`·`cancelled`·`unknown` 또는 `waitMs` 경과에서 반환".

- [x] **1단계: 실패하는 테스트 작성.** 픽스처: `createRoutingFixture(t,{roles:{arc_qa:'codex'}})`와 정상 CLI로 bridge `arc_qa`를 `prepare-dispatch`해 reserved lease를 만든다. 테스트 안에서 `withRoutingLock` 아래 `writeLease`로 상태를 바꾼다. supervisor는 `{pid:process.pid,startTime:'fixture'}`로 두고 `updatedAt`을 최근 값으로 유지해 lost 판정이 일어나지 않게 한다. 모든 호출에 `pollMs:50`.
  - `test('observe keeps waiting through starting to running and returns on a terminal state')`: lease를 `starting`으로 둔 뒤 `waitMs:5000`으로 observe를 시작한다. 300ms 뒤 `running`, 700ms 뒤 `completed`로 쓴다. 단언: `routeStatus==='completed'`, 경과 ≥ 650ms, 경과 < 5000ms.
  - 같은 형태로 `failed`(decision `'hold'`)와 `cancelled`(decision `'allow'`)를 매개변수화한다.
  - `test('observe returns unknown without waiting for waitMs')`: `running`에서 300ms 뒤 `unknown`. 단언: `routeStatus==='unknown'`, `decision==='hold'`, 경과 < 5000ms.
  - `test('observe returns the running state when waitMs elapses')`: `running` 유지, `waitMs:400`. 단언: `routeStatus==='running'`, 350ms ≤ 경과 < 3000ms.
  - `test('a supervisor lost during the wait is marked unknown and returned before waitMs')`: 종료된 자식 pid로 supervisor `{pid:deadPid,startTime:'gone'}`, `running`, `lostMs:200`, `waitMs:5000`. 단언: `routeStatus==='unknown'`, 사유 코드 `['terminal_state_unverified']`, 저장된 lease 상태 `unknown`, 경과 < 5000ms.
  - `test('a terminal lease returns at once even with a long waitMs')`: `completed`, `waitMs:5000`. 단언: 경과 < 1000ms.
- [x] **2단계: 실패 확인.** `node --test --test-timeout=120000 tests/node/role-bridge-observe-wait.test.mjs`. 기대: 첫 테스트가 `running`을 반환해 FAIL.
- [x] **3단계: 구현.** 반환 조건을 `TERMINAL_STATES.includes(lease.state)||lease.state==='unknown'||Date.now()>=end`로 바꾸고 `initial` 변수를 제거한다. 주석을 "bridge: waits up to waitMs for a terminal or unknown state and marks a lost supervisor unknown"으로 고친다.
- [x] **4단계: 지침 갱신.** 두 `coordination.md`의 4단계 문장 "`observe` returns status, claims, `resultPath` and reasons;" 앞에 같은 문구로 넣는다: "With `waitMs`, `observe` returns only when the dispatch reaches `completed`, `failed`, `cancelled` or `unknown`, or when `waitMs` elapses; a transition such as `starting` to `running` does not end the wait."
- [x] **5단계: 생성물 갱신.** `node scripts/update-runtime-assets.mjs` → `baselineHash` 갱신(전역 제약) → `node scripts/update-manifest.mjs`.
- [x] **6단계: 통과 확인.** `node --test --test-timeout=120000 tests/node/role-bridge-observe-wait.test.mjs tests/node/runtime-versions.test.mjs tests/node/role-bridge-run.test.mjs tests/node/role-bridge-resume.test.mjs tests/node/role-bridge-support.test.mjs tests/node/composite-instructions.test.mjs` 통과. 기준선 비교 규칙의 전체 테스트, `check:manifest`, `check:role-policy`, runtime 사본 검사.
- [x] **7단계: 커밋(Orchestrator 수용 후)** — `fix(runtime): observe가 터미널 또는 unknown까지 대기`

**수용 기준:** 스펙 AC5. 두 coordination 섹션의 동일 규칙 테스트 통과. native observe 테스트 변경 없이 통과.
**수용 전 QA:** 새 QA가 6단계를 재실행하고, `git diff`로 `markLostIfDue` 본문과 입력 검증이 바뀌지 않았음을 확인한다.

**진행 기록 (2026-11-11, 진행 기록):** Implementer dispatch `7c420f80`(Codex bridge) 1~6단계, `baselineHash` `sha256:d4ceb4aa…`. Implementer sandbox에서 `role-bridge-resume` 3건 실패 보고 → Orchestrator가 sandbox 밖에서 `role-bridge-resume`·`role-bridge-run`·`role-bridge-observe-wait` 58/58 통과 확인(환경 한계로 분류). 전체 테스트 1509개 중 실패 89, 취소 1, 기준선 대비 새 실패 0. QA dispatch `932a1cbe` Q1~Q5 proven. 수용: Orchestrator.

---

### Task T3: Codex 인증을 `getAuthStatus` 토큰 갱신으로 검사

**목표와 범위:** `probeCodexAuthStatus`를 추가하고 복합 라우팅 `authenticate()`와 TUI 홈·구성 적용 게이트(`lib/management/status.mjs`)의 Codex 경로를 교체한다. 테스트 가짜 CLI가 app-server를 흉내 내도록 확장한다.

**파일:**
- 수정: `lib/runtime/local-cli.mjs`(신규 export), `lib/runtime/role-routing.mjs`(`authenticate`), `lib/management/status.mjs`(Codex 인증 호출 지점), `tests/node/role-fixtures.mjs`(`FAKE_SOURCE`, 신규 export `FAKE_CODEX_APP_SERVER`), `tests/node/role-bridge-run.test.mjs`(사용자 정의 가짜 codex 스크립트들), `docs/harness-operation.md`, 두 `coordination.md` 1단계
- 테스트: 신규 `tests/node/codex-auth-probe.test.mjs`, `tests/node/role-routing-dispatch.test.mjs`(추가), TUI 홈 관련 기존 테스트 파일(추가), `tests/node/runtime-versions.test.mjs`(`baselineHash`만)
- 생성: 런타임 사본, `MANIFEST.sha256`

**선행:** T1·T2 커밋.
**인터페이스:**
- 산출: `export async function probeCodexAuthStatus(context, {signal, timeoutMs = 10000} = {}) → Promise<{platform:'codex', authStatus:'authenticated'|'unauthorized'|'unknown', reason?:string}>` (`lib/runtime/local-cli.mjs`). 판정표는 스펙 §6.1.
- 테스트 픽스처: `FAKE_CODEX_APP_SERVER`(CommonJS 문자열, `function appServer(scenario)` 정의). 시나리오 키 `authStatus` ∈ {`chatgpt-ok`,`apikey-ok`,`pat-null`,`revoked`,`logged-out`,`no-auth-required`,`other-null`,`error`,`malformed`,`hang`,`exit`,`notify-first`,`oversize`}. 기본값은 기존 `scenario.auth`에서 `{ok:'chatgpt-ok',unauthorized:'logged-out',error:'error',hang:'hang'}[scenario.auth ?? 'ok']`로 유도해 기존 테스트를 수정하지 않게 한다. 요청 기록은 `scenario.appServerRecordPath`가 있을 때만 남긴다(기존 `recordPath`에는 쓰지 않음).
- 응답 예: `chatgpt-ok` → `{authMethod:'chatgpt',authToken:'fixture-token-SECRET',requiresOpenaiAuth:true}`, `revoked` → `{authMethod:'chatgpt',authToken:null,requiresOpenaiAuth:true}`, `pat-null` → `{authMethod:'personalAccessToken',authToken:null,requiresOpenaiAuth:true}`, `logged-out` → `{authMethod:null,authToken:null,requiresOpenaiAuth:true}`, `no-auth-required` → `{authMethod:null,authToken:null,requiresOpenaiAuth:false}`, `other-null` → `{authMethod:'bedrockApiKey',authToken:null,requiresOpenaiAuth:true}`, `error` → JSON-RPC 오류 `{code:-32603,message:'Your access token could not be refreshed because your refresh token was revoked. Please log out and sign in again.'}`.

- [x] **1단계: 픽스처 확장.** `FAKE_SOURCE`의 auth 분기 앞에서 `args[0]==='app-server'`이면 `appServer(scenario)`로 넘긴다. 줄 단위 JSON-RPC로 `initialize`에 `{userAgent:'fake',platformFamily:'unix',platformOs:'macos'}`, `getAuthStatus`에 시나리오별 응답을 보내고, stdin이 끝나면 exit 0. `hang`은 응답하지 않고, `exit`은 즉시 exit 1, `oversize`는 2 MiB 한 줄을 출력한다. `role-bridge-run.test.mjs`의 사용자 정의 가짜 codex 스크립트는 `${FAKE_CODEX_APP_SERVER}`를 포함하고 `if(args[0]==='app-server')return appServer({});`를 추가한다(없으면 probe가 시간 초과로 지연된다).
- [x] **2단계: 실패하는 테스트 작성.** `codex-auth-probe.test.mjs`는 `createRoutingFixture`의 `binDir`·`env`와 `resolveLocalCli('codex',{cwd,userHome,env})`로 context를 만든다.
  - `'reports authenticated for chatgpt and apikey tokens and sends initialize, initialized, getAuthStatus with includeToken and refreshToken true'`: 결과 deepEqual `{platform:'codex',authStatus:'authenticated'}`. 기록된 method 순서 `['initialize','initialized','getAuthStatus']`, params deepEqual `{includeToken:true,refreshToken:true}`. `JSON.stringify(result)`에 `fixture-token-SECRET`이 없다.
  - `'maps a chatgpt account whose token is withheld after refresh to unauthorized token_rejected'` (`revoked`).
  - `'maps a logged-out account to unauthorized not_logged_in'`, `'treats a provider without OpenAI auth as authenticated'`, `'treats host-owned credentials without an exported token as authenticated'` (`pat-null`), `'maps another auth method without a token to unknown auth_unverified'` (`other-null`).
  - `'never reports authenticated when the probe cannot decide'`: `error`→`status_command_failed`, `malformed`→`invalid_response`, `oversize`→`invalid_response`, `exit`→`cli_execution_error`, `notify-first`→`authenticated`(알림 무시 확인).
  - `'times out a hanging app-server within the bound and leaves no child'`: `timeoutMs:300`. 단언: `{authStatus:'unknown',reason:'timeout'}`, 경과 < 2300ms, 가짜가 기록한 pid가 2초 안에 사라진다.
  - `'returns aborted for an aborted signal and invalid_context for an unknown context'`.
  - `role-routing-dispatch.test.mjs` 추가 `'routing-status and prepare-dispatch report Unauthorized for a withheld Codex token without leaking token or error text'`: `f.cli('codex',{authStatus:'revoked',version:'codex-cli 0.167.0'})`. `routingStatus`의 `platforms.codex.authentication` deepEqual `{status:'Unauthorized',reason:'token_rejected'}`. bridge `arc_qa` prepare는 `decision==='hold'`이고 사유에 `'Unauthorized'` 포함, lease 0개. 같은 테스트에서 `authStatus:'chatgpt-ok'`이면 결과 JSON 어디에도 `fixture-token-SECRET`이 없고, `authStatus:'error'`이면 `Incomplete`이며 결과 JSON에 `refresh token` 문구가 없다.
  - TUI 홈: 관리 상태 수집(`lib/management/status.mjs`)이 Codex에 대해 `getAuthStatus`를 호출하고 `revoked`면 홈 행에 `Codex: Unauthorized`가 나오는 테스트를 기존 TUI/관리 테스트 파일에 추가한다(정확한 파일은 Implementer가 기존 구조에 맞춰 고르고 보고한다).
- [x] **3단계: 실패 확인.** `node --test --test-timeout=120000 tests/node/codex-auth-probe.test.mjs tests/node/role-routing-dispatch.test.mjs`(+ TUI 홈 테스트 파일). 기대: `probeCodexAuthStatus` 미정의와 `Available` 판정으로 FAIL.
- [x] **4단계: 구현.** `local-cli.mjs`에 `probeCodexAuthStatus`를 둔다. JSON-RPC 처리는 `lib/models/codex-catalog.mjs`의 패턴(줄 버퍼, `id` 대응, 1 MiB 상한, SIGTERM 후 1초 뒤 SIGKILL)을 따르되 import하지 않는다. `authToken`은 `typeof === 'string' && length > 0`만 판정하고 응답 객체 참조를 버린다. `role-routing.mjs`의 `authenticate()`는 `platform==='codex'`일 때 `probeCodexAuthStatus(cli,{timeoutMs:policy.probeTimeoutMs})`, 그 밖에는 기존 `probePlatformAuth`를 호출한다. `lib/management/status.mjs`의 Codex 인증 호출도 같은 함수로 바꾼다. `probePlatformAuth`의 Codex 분기는 남은 호출자가 없으면 제거한다.
- [x] **5단계: 문서 갱신.** `docs/harness-operation.md:26`의 인증 설명을 다음 취지로 고친다: "Codex authentication is checked by refreshing the login token through `codex app-server` (`getAuthStatus`), both on the home screen and for composite routing; this needs network access and rotates the tokens in `CODEX_HOME/auth.json`. A refresh that is permanently rejected is `Unauthorized`, and a check that cannot decide is `Incomplete`, never `Available`." 두 `coordination.md` 1단계 끝에 같은 문구로 넣는다: "The Codex authentication probe refreshes the login token over the network through `codex app-server`; a permanently rejected refresh is `Unauthorized` and a probe that cannot decide is `Incomplete`."
- [x] **6단계: 생성물 갱신.** `node scripts/update-runtime-assets.mjs` → `baselineHash` 갱신(전역 제약) → `node scripts/update-manifest.mjs`.
- [x] **7단계: 통과 확인.** 3단계 명령, `tests/node/runtime-versions.test.mjs`, `node --test --test-timeout=120000 tests/node/role-bridge-run.test.mjs tests/node/role-bridge-resume.test.mjs tests/node/composite-instructions.test.mjs`, 기준선 비교 규칙의 전체 테스트, `check:manifest`, `check:role-policy`, runtime 사본 검사. `role-bridge-run`의 prepare가 probe 시간 초과로 지연되지 않아야 한다.
- [x] **8단계: 실제 유효 토큰 경로 확인(QA, 사용자 토큰 회전 발생, 승인된 절충).** 저장소 루트에서 `node --input-type=module -e "import os from 'node:os';import {resolveLocalCli,probeCodexAuthStatus} from './lib/runtime/local-cli.mjs';const c=resolveLocalCli('codex',{cwd:process.cwd(),userHome:os.homedir(),env:process.env});console.log(JSON.stringify(await probeCodexAuthStatus(c)))"`. 기대: `{"platform":"codex","authStatus":"authenticated"}`. 이어서 `codex login status`가 exit 0인지 확인한다.
- [x] **9단계: 커밋(Orchestrator 수용 후)** — `fix(runtime): Codex 인증을 app-server 토큰 갱신으로 검사`

**수용 기준:** 스펙 AC1–AC4.
**수용 전 QA와 증거:** 새 QA가 7·8단계를 실행한다. 폐기 토큰을 실제로 재현할 수 없으므로 폐기 경로의 증거는 (1) 가짜 app-server 단위·라우팅·TUI 테스트와 (2) P1 소스 근거(`account_processor.rs:1097-1158`)다.

**진행 기록 (2026-11-11, 진행 기록):** Implementer dispatch `10111c7e`(Codex bridge, 세그먼트 0~3: 구현, abort 테스트 경합 수정, 문서 영어 원문 복원, 백틱 확인). `probePlatformAuth`의 Codex `login status` 분기 제거(호출자 두 곳 모두 신규 probe로 교체). `baselineHash` `sha256:3bdb4014…`. 8단계는 QA sandbox가 `CODEX_HOME`에 쓸 수 없어 Orchestrator가 sandbox 밖에서 실행: `{"platform":"codex","authStatus":"authenticated"}` 1177ms, `auth.json` 갱신 확인, 이후 `codex login status` exit 0. 전체 테스트 1524개 중 실패 89, 취소 1, 기준선 대비 새 실패 0. QA dispatch `812d11f2` Q1~Q7 proven(Q6은 첫 판정 unmet → 검색 인용 오류로 확인되어 재확인 proven). 리뷰 메모: `requiresOpenaiAuth: null`은 `invalid_response`(보수적), `probePlatformAuth`에 codex를 넘기면 잘못된 명령이 실행되나 현재 호출자 없음. 수용: Orchestrator.

---

### Task T4: 런타임 버전 `cooperative-8` 상향

**목표와 범위:** 버전 문자열과 마이그레이션 안내를 바꾼다. 동작 변경은 없다(사용자 결정 2026-11-11).

**파일:** `lib/runtime/bootstrap.mjs`(약 21행), `tests/node/runtime-versions.test.mjs`, `tests/node/composite-live.test.mjs`, `tests/node/composite-instructions.test.mjs`, `docs/harness-operation.md`(마이그레이션 문단), `README.md:45`, 생성 사본, `MANIFEST.sha256`.
**선행:** T1–T3 커밋.

- [ ] **1단계: 실패하는 테스트 작성.** `runtime-versions.test.mjs`의 기대값을 `'cooperative-8'`로, `composite-instructions.test.mjs`의 버전 정규식과 부정 단언을 `cooperative-8` 기준으로, `composite-live.test.mjs`의 `RUNTIME_VERSION`과 주석을 `cooperative-8`로 바꾼다.
- [ ] **2단계: 실패 확인.** `node --test --test-timeout=120000 tests/node/runtime-versions.test.mjs tests/node/composite-instructions.test.mjs` → FAIL.
- [ ] **3단계: 구현.** `bootstrap.mjs`의 `runtime:'cooperative-8'`. `docs/harness-operation.md`의 마이그레이션 문단 머리를 "`cooperative-8` migration"으로 바꾸고 다음 문장을 추가한다: "This version renames the authentication label to `Available` / `Not Available`, makes a bridge `observe` with `waitMs` wait for a terminal or `unknown` state, and checks Codex authentication by refreshing the token." `README.md:45`의 `cooperative-7`을 같은 의미로 교체한다.
- [ ] **4단계: 생성물 갱신과 통과 확인.** `node scripts/update-runtime-assets.mjs` → `baselineHash` 갱신(전역 제약; `bootstrap.mjs` 바이트가 바뀌므로 필요) → `node scripts/update-manifest.mjs`. 기준선 비교 규칙의 전체 테스트, `check:manifest`, `check:role-policy`, runtime 사본 검사, `grep -rn "cooperative-7" lib claude/skill codex/skill tests/node README.md docs/harness-operation.md` 출력 없음.
- [ ] **5단계: 커밋(Orchestrator 수용 후)** — `docs(arc): 런타임 버전 cooperative-8 상향과 마이그레이션 안내`

**수용 기준:** 스펙 AC7.
**수용 전 QA:** 새 QA가 4단계를 재실행한다.

---

## 의존성과 준비 상태

| 작업 | 선행 | 공유 자원(직렬화 사유) | 초기 상태 |
|---|---|---|---|
| B0, P1 | — | — | 완료 |
| T1 | B0 | `role-routing.mjs`, `role-bridge.mjs`, `harness-operation.md`, 생성 사본, `MANIFEST.sha256` | 준비 |
| T2 | T1 커밋 | `role-bridge.mjs`, `coordination.md` ×2, 생성 사본, 매니페스트 | 보류(T1) |
| T3 | T1·T2 커밋 | `role-routing.mjs`, `status.mjs`, `coordination.md` ×2, `harness-operation.md`, `role-bridge-run.test.mjs`, 매니페스트 | 보류 |
| T4 | T1–T3 커밋 | `bootstrap.mjs`, 문서, 매니페스트 | 보류 |
| T5 | T1–T4·최종 리뷰 후속 커밋 | `local-cli.mjs`, `status.mjs`, `operations.mjs`, 생성 사본, 매니페스트 | 보류(2026-11-11 실행 중 추가) |

### Task T5: 설치 실행 단계의 Codex 재확인은 토큰 갱신 없이 (2026-11-11 실행 중 추가, 사용자 승인)

**목표와 범위:** 실제 Install / Update에서 `Install target changed: <CODEX_HOME>` 실패가 관측되었다. 원인은 `executeCompositeOperation`의 재확인이 토큰을 갱신해 `auth.json`을 교체하고 `CODEX_HOME` mtime을 바꾸는 것이다(스펙 §6.1 "갱신 시점 제한"). 실행 단계 재확인만 갱신 없이 수행한다.

**파일:**
- 수정: `lib/runtime/local-cli.mjs`(`probeCodexAuthStatus`에 `refreshToken` 옵션, 기본 `true`), `lib/management/status.mjs`(`collectStatus(context, {refreshToken})` 옵션을 Codex probe에 전달, 기본 `true`), `lib/management/operations.mjs`(`executeCompositeOperation`의 두 `collectStatus` 호출에 `{refreshToken:false}`)
- 테스트: `tests/node/codex-auth-probe.test.mjs`, `tests/node/management-status.test.mjs`, 관리 operation 테스트(기존 `tests/node/management-operations.test.mjs` 또는 composite 실행을 다루는 파일), `tests/node/runtime-versions.test.mjs`(`baselineHash`만)
- 생성: 런타임 사본, `MANIFEST.sha256`

- [ ] **1단계: 실패하는 테스트 작성.** (a) `probeCodexAuthStatus(context,{refreshToken:false})`는 `getAuthStatus` params로 `{includeToken:true,refreshToken:false}`를 보낸다(기록 확인). 기본값은 `refreshToken:true`. (b) `collectStatus(context,{refreshToken:false})`가 Codex probe에 `refreshToken:false`를 전달하고 기본은 `true`. (c) composite 실행 경로: 준비(`prepareCompositeOperation`)는 `refreshToken:true`, 실행(`executeCompositeOperation`)의 두 재확인은 `refreshToken:false`로 호출됨을 주입 가능한 probe 또는 가짜 app-server 기록으로 확인한다. (d) 회귀 재현: 가짜 app-server가 `refreshToken:true` 요청을 받을 때 `CODEX_HOME/auth.json`을 교체(임시 파일 후 rename)하도록 하는 시나리오에서 composite install 실행이 `Install target changed` 없이 진행되는지 확인한다(가능한 범위의 fixture로).
- [ ] **2단계: 실패 확인.**
- [ ] **3단계: 구현.** 위 파일 목록대로. Claude 경로와 라우팅 경로(`authenticate()`)는 바꾸지 않는다(계속 갱신).
- [ ] **4단계: 생성물 갱신.** `node scripts/update-runtime-assets.mjs` → `baselineHash` 갱신(전역 제약) → `node scripts/update-manifest.mjs`.
- [ ] **5단계: 통과 확인.** 대상 테스트, 기준선 비교 규칙의 전체 테스트(Orchestrator, sandbox 밖), `check:manifest`, `check:role-policy`, runtime 사본 검사.
- [ ] **6단계: 실제 설치 확인(Orchestrator, 사용자 요청).** 기존 설정으로 `Claude & Codex` Install / Update를 실행해 `code 0`, `activation:'published'`를 확인하고, 새 세션 전 `routing-status`가 새 revision과 `cooperative-8` 마커로 `allow`인지 확인한다.
- [ ] **7단계: 커밋(Orchestrator 수용 후)** — `fix(management): 설치 실행 단계의 Codex 재확인에서 토큰 갱신 제외`


**실행 중 수정(2026-11-11, 사용자 승인):** 1차 구현(`refreshToken:false`)으로 실제 설치를 다시 시도했으나 같은 오류로 실패했다. 측정 결과 갱신 없이도 app-server 실행이 `CODEX_HOME`의 SQLite 보조 파일을 만들어 디렉터리 메타데이터를 바꿨다. 실행 단계 재확인은 `codex login status`(로컬, `CODEX_HOME` 불변 실측)로 바꾼다. 테스트 (c)는 "실행 단계에서 app-server 요청이 없고 login status만 실행됨"으로, (d) 회귀 시나리오는 "app-server 실행 시 `CODEX_HOME`에 보조 파일을 만드는 가짜"까지 포함한다. 사용하지 않게 되는 `refreshToken` 옵션 경로는 제거하거나 사용처가 없으면 남기지 않는다.

**수용 기준:** 스펙 AC9. **수용 전 QA:** 새 QA가 5단계 대상 테스트를 재실행하고 diff 범위를 확인한다. 최종 리뷰가 이미 시작된 뒤 추가된 작업이므로 수용 후 같은 Reviewer가 이 변경을 재검토한다.


## 최종 검증(모든 작업 수용 후, 작업 선행 조건 아님)

- 전체 변경 기준: 기준선 비교 규칙의 전체 테스트, `npm run check:manifest`, `npm run check:role-policy`, `node scripts/update-runtime-assets.mjs --check`, `grep -rn "Avaliable" lib claude/skill codex/skill tests/node README.md docs/harness-operation.md`(출력 없음), `git diff --stat a8ffd31 -- docs/superpowers/specs docs/superpowers/plans`(신규 문서 외 변경 없음).
- 선택 증거: 사용자 승인 후 Install / Update 재실행 → `claude-cli` 호스트에서 실제 Codex bridge `observe`(`waitMs:540000`)가 터미널 상태로 한 번에 반환되는지, `routing-status`가 Codex `Available`인지 확인한다.
- 최종 Reviewer 1회(전체 변경). 초점: 판정표의 보수성, 토큰 비노출, 자식 정리와 시간 상한, observe 종료 조건과 `markLostIfDue` 순서, 생성물 일치, 과거 문서 불변.
