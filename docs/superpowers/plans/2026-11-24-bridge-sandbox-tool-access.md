# bridge 역할 sandbox 도구 접근 구현 계획 (Architectural, 6+1 task: T1–T5, T7, 조건부 T6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

- 상태: v1 승인 (사용자, 2026-11-24)
- 작업 위치: `/Users/ma-24-007/Desktop/workspace/arc/.claude/worktrees/bridge-sandbox-tool-access`, branch `fix/bridge-sandbox-tool-access`, HEAD `91c70304` (base `6244a8af` + spec 커밋 1개)
- Risk: high. T1–T5는 task마다 fresh Tester(`mode: task`)를 둔다. 전체 task를 수용한 뒤 최종 Tester(`mode: final`)를 두고, 최종 Reviewer는 1회만 둔다.
- Spec: `docs/superpowers/specs/2026-11-24-bridge-sandbox-tool-access-design.md` v1 (사용자 승인 2026-11-24. Q1 (a), Q2–Q6은 제안대로)

**Goal:** bridge 쓰기 역할(Codex·Claude)에 dispatch마다 고른 도구 접근을 연다. 대상은 scratch, env preset, loopback, scratch socket, 도메인 allowlist, host 브라우저 서비스다. 여는 데에는 측정된 gate를 쓴다. 그러면서 `.git`·`.codex` 보호와 읽기 역할 인자 불변(B12 예외만 허용)을 지킨다.

**Architecture:**
- 새 모듈 `lib/runtime/tool-access.mjs`가 데이터와 순수 판정을 맡는다.
  - 데이터: 요청 계약, 역할 표, `TOOL_ACCESS_GATES`, `TOOL_ENV_PRESETS`, `TOOL_PATHS`, `FORBIDDEN`, `TOOL_ACCESS_ADAPTERS`
  - 순수 판정: `toolAccessReasons`, `effectiveGrants`, `buildToolContext`
  - scratch 수명 함수
- 새 모듈 `lib/runtime/host-service.mjs`가 host 브라우저 서비스를 맡는다.
- 플랫폼 인자 렌더링은 기존 `role-bridge-args.mjs`의 `buildCodexArgs`·`buildClaudeArgs`가 `toolContext`를 받아 수행한다.
- `buildBridgeInvocation`은 run-dispatch·resume·supervisor가 함께 쓴다. 여기서 같은 `toolContext`를 결정적으로 계산하므로 기존 `argsDigest` 대조가 그대로 부여 전체를 덮는다.
- supervisor는 scratch와 host 서비스를 만들고, 모든 terminal 기록 직전에 정리한다.

**Tech Stack:** Node.js ≥22 ESM, `node:test`, `node:fs/promises`(lstat/readdir/rm/copyFile), `node:child_process`, `scripts/update-runtime-assets.mjs`, `scripts/update-manifest.mjs`, `tests/node/fixtures/installed-layout.mjs`, macOS `sandbox-exec`, host 전역 Playwright(`npm root -g`).

## Global Constraints

- **reason code:** 새 코드는 만들지 않는다.
  - 형태·역할 표 위반 → `invalid_request`(deny)
  - gate 미통과, native route, 사용자 설정 충돌, 실행 파일 없음 → `permission_scope_unverified`(hold)
  - scratch·서비스 시작 실패 → `execution_failed`
  - run과 supervisor의 args 불일치 → 기존 `activation_unverified`
- **요청 형태(spec 5.1):** `{"network": null|"loopback"|"domains"|"full", "domains": [], "unixSockets": [], "paths": [], "services": [], "envPresets": []}`
  - 6개 키가 모두 있어야 한다.
  - 원소는 문자열이고 중복은 거부한다. 저장할 때 이름순으로 정규화한다.
- **역할 표(spec 5.2):**
  - 읽기 역할은 `toolAccess`가 있으면 `invalid_request`다.
  - Implementer: network는 `null`·`"loopback"`. services는 `[]`.
  - Tester: network는 4종 모두. services는 `browser-cdp`, `browser-playwright-chromium`, `browser-playwright-firefox`, `browser-playwright-webkit`.
  - envPresets는 두 역할 모두 `ci`, `daemon-off`, `polling`이다. `base`·`caches`를 요청하면 `invalid_request`다.
- **domains(spec 5.3):** regex `^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$`
  - 거부: `*`, IPv4·IPv6 literal, `localhost`, `*.localhost`, `*.local`, `*.internal`, `*.home.arpa`, 17개 이상
  - `network==="domains"`이면 1–16개, 아니면 `[]`
- **scratch 경로(spec 4.1):**
  - Codex `<S>` = `/private/tmp/arc-bridge-<id8>`
  - Claude `<S>` = `/private/tmp/claude-<uid>/arc-bridge-<id8>`
  - 비재귀 mkdir, 0700. 하위 `tmp/`, `cache/`, `sock/`, `evidence/`
- **evidence 상한:** 전체 64 MiB, 파일당 16 MiB, 항목 256개, 깊이 8
- **env preset:** spec 4.2 표의 키와 값을 그대로 쓴다. 값의 `<S>`는 scratch realpath로 치환하고, 키 정렬은 JS 기본 `sort()`다.
- **Codex profile 이름:** `arc_bridge`
  - R1 보호 항목은 `"<wt>/.git"="read"`, `"<wt>/.codex"="read"`(절대 경로)이고 항상 `filesystem` 맨 앞에 둔다. 없으면 throw한다.
- **D2′ Claude settings:** `{"permissions":{"deny":["Edit(./.git/**)"]},"sandbox":{"enabled":true,"autoAllowBashIfSandboxed":true,"allowUnsandboxedCommands":false,"failIfUnavailable":true,"filesystem":{"denyWrite":["./.git"]}}}`
  - `Write(./.git/**)` 제거는 MI-4 통과가 전제다.
- **B12:** Claude Scouter에만 `'--allowedTools','WebFetch,WebSearch'`를 넣는다. 위치는 `'--permission-mode','default'` 바로 뒤다.
- **영구 금지:** docker/colima socket은 항상 거부한다(D-g). 의존성 설치는 host 전용이다(D-h). `full`은 모든 플랫폼에서 held다(P1).
- **플랫폼 분기 금지(AC11):** `tool-access.mjs`, `host-service.mjs`, 새 supervisor 코드에는 `'codex'`·`'claude'`·`'grok'`·`'gemini'` 문자열 비교를 두지 않는다. 차이는 `TOOL_ACCESS_ADAPTERS[platform]`에 둔다.
- **편집 위치:**
  - runtime은 `lib/runtime/`만 편집한다.
  - `shared/skill/runtime/`은 `node scripts/update-runtime-assets.mjs`로 생성한다.
  - MANIFEST는 `node scripts/update-manifest.mjs`로 갱신한다.
  - 설치본(`~/.claude`, `~/.codex` 등)은 편집하지 않는다.
- **모듈 해시:** runtime 모듈 바이트가 바뀌는 task는 같은 task 안에서 `tests/node/runtime-versions.test.mjs`의 `baselineHash` 값만 갱신한다. 새 cooperative 모듈은 다음 세 곳에 같은 위치로 추가한다.
  - `COOPERATIVE_RUNTIME_MODULES`(`lib/runtime/bootstrap.mjs`): 끝에 추가
  - `expectedModules`: 끝에 추가
  - `RUNTIME_MODULE_PATHS`(`lib/installer/runtime-assets.mjs`): 정렬 위치에 추가
- **사용자 파일 불변:** 테스트는 `os.tmpdir()` 아래의 임시 HOME, 임시 저장소, 주입한 scratch root만 쓴다.
- **실행 규칙:**
  - bridge가 실행되는 동안에는 커밋과 ref 이동을 하지 않는다. task는 순차로 진행한다.
  - top-level task 1개 = focused commit 1개다. Orchestrator가 수용한 뒤 커밋한다.
  - 커밋 메시지는 `type(scope): 한국어 설명` 형식이다.
  - `node --test` 옵션은 파일 경로 앞에 둔다.
- **실행 환경 분담:**
  - Implementer·Tester는 bridge child로 돌고, focused 테스트만 실행한다.
  - 아래는 Orchestrator가 host에서 실행하고, 출력을 Tester에 전달한다.
    - `role-bridge-run.test.mjs`·`role-bridge-resume.test.mjs`(supervisor spawn, `ps` 필요)
    - 서버 bind와 recursive `fs.watch`가 필요한 테스트
    - 전체 `npm test`
    - 모든 MI
    - live dispatch
  - Implementer는 자기 새 테스트의 fixture를 직접 고칠 수 있다.
- **테스트 판정:** B0 기준선 대비 새 실패 0건. 의심 테스트는 단독으로 다시 돌린다.

## Review Focus

| ID | 입력·상황 | 기대 동작 | 담당 task와 테스트 |
|---|---|---|---|
| RF1 | `/private/tmp/arc-bridge-<id8>`가 미리 있다(디렉터리, symlink, 파일). 또는 Claude 부모 `/private/tmp/claude-<uid>`가 symlink이거나 다른 owner다 | 기존 경로는 `execution_failed`로 spawn하지 않는다. 부모 이상은 `permission_scope_unverified`다. 어떤 경우에도 따라가서 쓰지 않는다 | T2 `createScratch refuses pre-existing path of any type`, `Claude scratch parent must be an owned real directory` |
| RF2 | 역할이 `evidence/`에 `~/.ssh`로 가는 symlink, FIFO, 17 MiB 파일, 깊이 9 디렉터리, 300개 파일을 둔다 | 복사되는 항목은 정규 파일·디렉터리뿐이다. 나머지는 `skipped`, 상한을 넘으면 `truncated:true`다. artifactDir 밖에는 아무것도 생기지 않는다 | T2 `collectEvidence copies only regular entries within limits` |
| RF3 | `~/.codex/config.toml` 또는 `<wt>/.codex/config.toml`에 `[permissions.arc_bridge]`나 `permissions.arc_bridge.x=` 줄이 있다(주석 줄은 제외) | profile mode dispatch는 prepare와 run 모두 `permission_scope_unverified`다. sandbox mode dispatch는 영향을 받지 않는다 | T3 `Codex profile mode holds when user config defines permissions.arc_bridge` |
| RF4 | run-dispatch 뒤, supervisor 전에 env에 `NEW_API_KEY`가 새로 생겨 Claude domains의 비밀 env 이름 집합이 달라진다 | argsDigest가 달라져 `activation_unverified`다. 조용히 비밀을 넘기지 않는다 | T4 `Claude domains secret env names change argsDigest` |
| RF5 | domains 입력 `Example.com`, `example.com.`, `a..b.com`, `[::1]`, `127.0.0.1`, `foo.localhost`, `x.home.arpa`, `https://a.com`, `a.com:443`, `*.a.com`, 17개, `xn--p1ai.xn--p1ai` | 마지막 항목만 허용하고 나머지는 모두 `invalid_request`다 | T1 `domains accept/reject table` |

---

## B0. 기준선 기록 (Orchestrator, 커밋 없음, T1 전)

- [ ] host에서 `npm test > <scratchpad>/b0-host-full.txt 2>&1`를 실행한다. 실패 이름 집합을 `B0-host`로 기록하고, tests/fail/skip 수를 함께 적는다.
- [ ] 생성물 상태를 확인한다. 기대값은 exit 0이고 diff가 없는 것이다. 다르면 그 상태를 기준선으로 기록한다.
  - `node scripts/update-runtime-assets.mjs --check`
  - `node scripts/update-manifest.mjs --check`
  - `node tests/node/fixtures/installed-layout.mjs --diff`
- [ ] MI 실행 환경 버전을 기록한다: `codex --version`, `claude --version`, `npm root -g`, 그 아래 `playwright`·`playwright-core`의 버전과 존재 여부.

---

### Task T1: 요청 계약, gate 표, lease v3

**목표:**
- `toolAccess` 요청의 형태, 역할 표, domains 규칙, gate 판정을 단일 모듈에 둔다.
- prepare가 이를 검증하고 lease v3에 저장한다.
- 읽기 역할 인자 golden을 base 바이트로 고정한다.

**배정:** AC4, AC5(prepare 부분), AC8(데이터 정의), AC11(tool-access 부분), AC2의 golden 준비
**선행:** B0

**allowedPaths:**
- 신규 runtime·테스트 파일
  - `lib/runtime/tool-access.mjs`
  - `tests/node/tool-access.test.mjs`
  - `tests/node/bridge-args-golden.test.mjs`
  - `tests/node/fixtures/bridge-args-golden.mjs`
  - `tests/node/fixtures/bridge-args-golden.json`
- 수정할 runtime 파일
  - `lib/runtime/command.mjs`
  - `lib/runtime/role-routing.mjs`
  - `lib/runtime/role-dispatch-store.mjs`
  - `lib/runtime/role-bridge.mjs`(`:23`)
  - `lib/runtime/role-supervisor.mjs`(`:283` 한 줄)
  - `lib/runtime/bootstrap.mjs`
  - `lib/installer/runtime-assets.mjs`
- 대응 생성본
  - `shared/skill/runtime/` 아래 위 runtime 파일의 대응본
  - `shared/skill/runtime/tool-access.mjs`
- 수정할 테스트 파일
  - `tests/node/role-routing-dispatch.test.mjs`
  - `tests/node/role-dispatch-store.test.mjs`
  - `tests/node/runtime-versions.test.mjs`(`expectedModules`·`baselineHash`만)
  - `tests/node/runtime-assets.test.mjs`(인벤토리 기대값이 있을 때만)
- 생성 fixture: `tests/node/fixtures/installed-layout-golden.json`, `MANIFEST.sha256`

**Interfaces (Produces, `lib/runtime/tool-access.mjs`):**
- 상수 (모두 deep-freeze)
  - `TOOL_ACCESS_KEYS = ['network','domains','unixSockets','paths','services','envPresets']`
  - `TOOL_ACCESS_SERVICES = ['browser-cdp','browser-playwright-chromium','browser-playwright-firefox','browser-playwright-webkit']`
  - `ALWAYS_ENV_PRESETS = ['base','caches']`
  - `REQUESTABLE_ENV_PRESETS = ['ci','daemon-off','polling']`
- `TOOL_ENV_PRESETS: {[id]: {[KEY]: string}}`: spec 4.2 표 그대로. scratch 치환 토큰은 문자열 `'<S>'`다(예: `TMPDIR: '<S>/tmp'`).
- `TOOL_PATHS = {}`, `TOOL_UNIX_SOCKETS = {}`. 초기 id는 0개다.
- `FORBIDDEN`
  - `write: Array<{path: string, kind: 'dir'|'file'}>`
    - 토큰은 `<wt>/`, `~/`
    - 특수 항목 `{path:'<cli-homes>', kind:'dir'}`
  - `sockets: string[]`
    - `/var/run/docker.sock`, `~/.docker`, `~/.colima`, `~/.gnupg`
    - 토큰 `'$SSH_AUTH_SOCK'`
  - `readWhenExternal: Array<{path, kind}>`: 인증 dotdir 10개와 `<cli-homes>`
    - `kind: 'file'`은 `~/.npmrc`, `~/.netrc`, `~/.gitconfig`
  - `envWhenExternal: string[]`: spec 4.5 순서 그대로
- `resolveForbidden({worktree, userHome, homes, env}) -> {write: Array<{path, kind}>, sockets: string[], readWhenExternal: Array<{path, kind}>, envWhenExternal: string[]}`
  - `homes`의 4개 CLI home 값으로 `<cli-homes>`를 펼친다.
  - `$SSH_AUTH_SOCK`이 없으면 그 항목을 뺀다.
  - 경로는 모두 절대 경로다.
- `TOOL_ACCESS_GATES: {[mechanism]: {codex, claude, grok, gemini}}`
  - 값은 `'pass'|'conditional'|'held'|'unmeasured'`. 키가 없으면 `held`로 본다.
  - 메커니즘 키: `scratch`, `env.base`, `env.caches`, `env.ci`, `env.daemon-off`, `env.polling`, `codexProfile`, `network.loopback`, `unixSockets.scratch`, `unixSockets.registered`, `paths`, `network.domains`, `network.full`, `service.browser-cdp`, `service.browser-playwright-chromium`, `service.browser-playwright-firefox`, `service.browser-playwright-webkit`
  - 값은 spec 6장 표 그대로다(`codexProfile`은 codex 값만).
  - 주석 형식: `// Codex 0.170.0 / Claude 2.1.327, 2026-11-24, T0·T0b <측정 ID>`
- `TOOL_ACCESS_CONDITIONS: {[mechanism]: {[platform]: string}}`: `conditional` 항목만 둔다. 문구는 아래와 같다.
  - `codexProfile.codex`: `'profile mode requires worktree .git and .codex read entries (B1); exec acceptance pending MI-1/MI-3'`
  - `network.domains.codex`: `'tools that ignore the network proxy (for example npm) fail (B2)'`
  - `network.domains.claude`: `'Read tool denial unverified until MI-7'`
  - `service.browser-cdp.*`: `'host Chrome reads ~/Library (SX7); narrowing pending MI-A'`
  - `service.browser-playwright-*.*`: `'host Playwright server isolation pending MI-B'`
- `TOOL_ACCESS_ADAPTERS: {[platform]: {scratchRoot: null | (({id8, uid}) => string), scratchParent: null | (({uid}) => string), extraMechanisms: (grants) => string[], preflight: Array<(ctx) => Promise<string|null>>}>`
  - T1의 값
    - codex: `scratchRoot` = `/private/tmp/arc-bridge-${id8}`, `scratchParent` = null, `extraMechanisms` = `g => (g.network !== null || g.paths.length || g.unixSockets.length) ? ['codexProfile'] : []`
    - claude: `scratchRoot` = `/private/tmp/claude-${uid}/arc-bridge-${id8}`, `scratchParent` = `/private/tmp/claude-${uid}`
    - grok·gemini: 모두 null 또는 빈 값
  - `preflight`는 T1에서 모두 `[]`다.
- `isValidDomain(name: string) -> boolean`
- `validateToolAccess(role: string, value: unknown) -> NormalizedToolAccess | null`
  - null은 `invalid_request`다.
  - 정규화는 배열 사본을 정렬하고, 키 순서를 `TOOL_ACCESS_KEYS`로 맞춘다.
- `effectiveGrants(platform, role, toolAccess: NormalizedToolAccess|null) -> Grants | null`
  - `Grants = {network, domains, unixSockets, paths, services, envPresets, mechanisms}`
  - `envPresets` = `['base','caches', ...요청(정렬)]`
  - 유효 network: services가 비어 있지 않고 network가 null이면 `'loopback'`
  - `mechanisms`(중복 없이 이 순서)
    1. `scratch`, `env.base`, `env.caches`
    2. `env.<요청 id>`
    3. `extraMechanisms(grants)`
    4. network 메커니즘: loopback → `network.loopback`, domains → `network.loopback`·`network.domains`, full → `network.full`
    5. 유효 network ≠ null이면 `unixSockets.scratch`
    6. unixSockets가 비어 있지 않으면 `unixSockets.registered`
    7. paths가 비어 있지 않으면 `paths`
    8. `service.<id>`
  - 읽기 역할이면 null이다.
  - `toolAccess`가 null이면 always-on 부여만 계산한다(`envPresets` `['base','caches']`, `mechanisms` `['scratch','env.base','env.caches']`). 플랫폼의 이 세 gate 중 하나라도 `pass`가 아니면 null이다.
- `toolAccessReasons({platform, role, route, toolAccess, policy}) -> {reasons: string[], conditions: Array<{mechanism: string, condition: string}>}`
  - spec 5.4의 1·2·3·5단계를 순수 함수로 수행한다.
  - `policy?.toolAccessGates ?? TOOL_ACCESS_GATES`를 쓴다.
  - 첫 실패에서 멈추고 reason 1개를 반환한다.
  - `toolAccess`가 undefined이면 `{reasons: [], conditions: []}`다.
- `toolAccessPreflight({platform, role, grants, worktree, userHome, homes, env, io}) -> Promise<string[]>`
  - spec 5.4의 4단계다. `TOOL_ACCESS_ADAPTERS[platform].preflight`를 순서대로 실행하고 첫 non-null reason에서 멈춘다.
  - T1에서는 항상 `[]`다.
- lease v3: v2 키 + `toolAccess`(NormalizedToolAccess)

**Interfaces (Consumes):**
- `DEFAULT_POLICY`(`role-dispatch-policy.mjs`)
- `ROUTING_ROLES`
- `createLease`/`validateLease`(`role-dispatch-store.mjs`)

**변경 위치:**
- `command.mjs:54`
  - `'prepare-dispatch'` 선택 키를 `['allowedPaths','toolAccess']`로 바꾼다.
  - `assignment`에 `...(Object.hasOwn(input,'toolAccess')?{toolAccess:input.toolAccess}:{})`를 더한다.
- `role-routing.mjs` `validateAssignment`: `assignment.toolAccess !== undefined && validateToolAccess(role, assignment.toolAccess) === null`이면 false(deny `invalid_request`)다.
- `role-routing.mjs` `prepareRoleDispatch`: `allowedPathsCoverControl` 줄(`:244`) 바로 뒤에 다음을 둔다.
  - `toolAccess`가 있으면 `toolAccessReasons`를 호출한다. reasons가 있으면 `result.reasons`로 두고 return한다(hold).
  - 이어서 `toolAccessPreflight`를 호출한다. 결과가 있으면 hold로 return한다.
  - conditions는 `result.toolAccess = {conditions}`로 둔다. 이 키는 `toolAccess`가 있을 때만 붙는다.
  - native route + `toolAccess`는 `toolAccessReasons` 2단계에서 처리한다.
- `createLease`(`:281`): `toolAccess`가 있으면 `version:3`과 `toolAccess: 정규화 값`, 없으면 `version:2` 그대로다.
- `role-dispatch-store.mjs`
  - version 3이면 키 집합 `[...KEYS,'targetPlatform','toolAccess']`
  - `[1,2,3].includes(value.version)`
  - targetPlatform 검사는 `version !== 1`일 때
  - v3에는 `validateToolAccess(value.role, value.toolAccess)`가 non-null이고 저장 값과 깊게 같아야 한다는 조건을 더한다.
- `role-bridge.mjs:23`과 `role-supervisor.mjs:283`: `version===2`를 `version>=2`로 바꾼다.

- [ ] **Step 1 (golden, 코드 불변 상태에서):** `tests/node/fixtures/bridge-args-golden.mjs --write|--diff`를 작성한다. 형식은 `installed-layout.mjs`와 같다.
  - 입력은 합성 profile이다.
    - claude: `{model:'m', effort:'low', tools:['Read','Grep','Glob','WebFetch','WebSearch'], instructions:'I'}`
    - codex: `{model:'m', effort:'low', instructions:'I'}`
    - gemini·grok: `{model:'m', instructions:'I'}`
  - 고정 값
    - `worktree:'/w'`, `resultPath:'/r/result.md'`, `policyFile:'/p/policy.toml'`, `promptFile:'/r/prompt.md'`
    - `sessionId:'00000000-0000-4000-8000-000000000000'`, `threadId:'thread-1'`(resume)
    - `sandboxProfile:'arc-bridge-0123abcd'`
  - 대상
    - 4플랫폼의 `arc_scouter`·`arc_planner`·`arc_reviewer`, 신규와 resume
    - grok·gemini의 `arc_implementer`·`arc_tester`
  - `node tests/node/fixtures/bridge-args-golden.mjs --write`로 `bridge-args-golden.json`을 만든다. 파일 머리에 `"base":"6244a8af"`를 둔다.
- [ ] **Step 2 (RED):** `tests/node/bridge-args-golden.test.mjs`를 작성한다.
  - `read-role and non-adapter argv equal base 6244a8af golden`
    - 위 각 항목에서 `buildBridgeArgs(platform, inputs)`의 결과가 golden과 같아야 한다.
    - 예외 하나를 테스트에 직접 적는다. claude `arc_scouter`는 golden 배열의 `'--permission-mode','default'` 바로 뒤에 `'--allowedTools','WebFetch,WebSearch'`를 끼운 것과 같아야 한다. 이 예외 단언은 T4 전까지 실패하므로 `t.todo`로 둔다.
    - 이 테스트는 T1에서는 PASS다(가드).
  - golden JSON은 이후 task에서 다시 쓰지 않는다.
- [ ] **Step 3 (RED):** `tests/node/tool-access.test.mjs`
  1. `toolAccess requires exactly the six keys`
     - 키 5개, 7개, 순서만 다른 6개를 넣는다.
     - 앞의 둘은 `validateToolAccess('arc_tester', v) === null`, 마지막은 non-null이고 키 순서가 `TOOL_ACCESS_KEYS`다.
  2. `array elements must be unique strings and are normalized by name`
     - `envPresets:['polling','ci']` → `['ci','polling']`
     - `['ci','ci']` → null, `[1]` → null
  3. `role table`(각 행이 1단언)
     - `arc_scouter`·`arc_planner`·`arc_reviewer` + 빈 요청 → null
     - `arc_implementer` + `network:'domains'` → null, `network:'loopback'` → ok, `services:['browser-cdp']` → null
     - `arc_tester` + `services:['browser-cdp']` → ok
     - `envPresets:['base']` → null
     - `paths:['x']`, `unixSockets:['x']` → null(id 0개)
  4. `domains accept/reject table`: RF5의 각 입력에 대해 `isValidDomain`과 `validateToolAccess`를 단언한다.
     - `network:'loopback'`인데 domains가 비어 있지 않으면 null
     - `network:'domains'`인데 domains가 비어 있으면 null
     - 16개는 ok, 17개는 null
  5. `effective network rises to loopback when services are requested`
     - `effectiveGrants('codex','arc_tester',{...network:null, services:['browser-cdp']}).network === 'loopback'`
     - mechanisms에 `codexProfile`, `network.loopback`, `unixSockets.scratch`, `service.browser-cdp`가 있어야 한다.
  6. `gate states map to reasons`(policy 주입)
     - 모든 gate가 pass이면 `[]`
     - `network.full`이 held이면 `['permission_scope_unverified']`
     - 키가 없으면 held로 본다.
     - conditional이면 reasons는 `[]`이고 conditions에 `{mechanism, condition}`이 1개 있다.
  7. `initial gates hold full on every platform and any toolAccess on grok and gemini`
     - 실제 `TOOL_ACCESS_GATES`를 쓴다.
     - codex·claude `network:'full'` → hold
     - grok·gemini의 빈 `toolAccess` → hold
  8. `native route with toolAccess is permission_scope_unverified`
  9. `always-on grants apply only where scratch and env.base/env.caches pass`
     - grok·gemini의 `effectiveGrants(..., null) === null`
     - codex·claude는 `envPresets` `['base','caches']`
  10. `env preset data has no shared keys and valid names`: 모든 preset의 키가 서로 겹치지 않고 `^[A-Za-z_][A-Za-z0-9_]*$`에 맞는다. 값은 고정 문자열이거나 `'<S>'`로 시작한다.
  11. `FORBIDDEN is the single source`
      - `resolveForbidden` 결과에 `<wt>/.git`, `<wt>/.codex`, 4개 home, `/var/run/docker.sock`이 들어 있어야 한다.
      - `TOOL_PATHS`·`TOOL_UNIX_SOCKETS`의 모든 값이 `write`·`sockets`와 겹치지 않아야 한다(현재는 빈 표로 통과).
  12. `new modules contain no platform name branches`
      - `lib/runtime/tool-access.mjs` 소스에 `/(===|!==)\s*['"](codex|claude|grok|gemini)['"]/`와 `case ['"](codex|claude|grok|gemini)['"]`가 없어야 한다.
      - T5에서 `host-service.mjs`를 대상에 더한다.
- [ ] **Step 4 (RED):** `tests/node/role-routing-dispatch.test.mjs`(기존 CLI·prepare harness 재사용)
  - `prepare-dispatch accepts toolAccess and stores lease version 3 normalized`
    - Codex bridge Tester, `{network:'loopback',...envPresets:['polling','ci']}`
    - allow, lease `version===3`, `toolAccess.envPresets` `['ci','polling']`
  - `prepare-dispatch without toolAccess still writes lease version 2`: 키 집합이 지금과 같다.
  - `read role toolAccess is denied invalid_request`
  - `native route toolAccess is held permission_scope_unverified`
  - `full network is held`
  - `conditional grant is reported in result.toolAccess.conditions`: Codex Tester domains → `mechanism:'network.domains'`
- [ ] **Step 5 (RED):** `tests/node/role-dispatch-store.test.mjs`
  - `lease v1 v2 v3 round-trip`
  - `v3 requires toolAccess key and valid normalized value`: 빠진 키, 정렬 안 된 배열, 읽기 역할 v3 → throw
  - `v2 with toolAccess key is rejected`
- [ ] **Step 6:** `node --test tests/node/tool-access.test.mjs tests/node/role-dispatch-store.test.mjs tests/node/role-routing-dispatch.test.mjs`를 실행해 새 테스트가 FAIL하는지 확인한다.
- [ ] **Step 7 (GREEN):** Interfaces와 변경 위치대로 구현한다. 이어서 다음을 반영한다.
  - `bootstrap.mjs` `COOPERATIVE_RUNTIME_MODULES` 끝에 `'tool-access.mjs'`
  - `runtime-assets.mjs` 정렬 위치에 `'lib/runtime/tool-access.mjs'`
  - `runtime-versions.test.mjs`의 `expectedModules` 끝에 같은 이름을 추가하고 `baselineHash`를 갱신한다.
- [ ] **Step 8 (생성):**
  - `node scripts/update-runtime-assets.mjs`를 실행하고 `--check`가 exit 0인지 본다.
  - `node tests/node/fixtures/installed-layout.mjs --diff`를 실행한다. 차이가 새 모듈과 해시뿐이면 `--write`한다.
  - `node scripts/update-manifest.mjs`를 실행하고 `--check`가 exit 0인지 본다.
- [ ] **Step 9 (focused, sandbox):** 아래 명령이 모두 PASS여야 한다.
  ```
  node --test tests/node/tool-access.test.mjs tests/node/bridge-args-golden.test.mjs tests/node/role-dispatch-store.test.mjs tests/node/role-routing-dispatch.test.mjs tests/node/runtime-versions.test.mjs tests/node/runtime-assets.test.mjs tests/node/manifest.test.mjs
  ```
- [ ] **Step 10 (Orchestrator host):** 다음을 확인한다.
  - 변경 파일이 allowedPaths 안에 있다.
  - `npm test`가 `B0-host` 대비 새 실패 0건이다.
  - `role-bridge-run.test.mjs`·`role-bridge-resume.test.mjs`가 기준선과 같다(`version>=2` 변경 회귀 확인).
- [ ] **Step 11:** 수용·커밋 `feat(runtime): bridge toolAccess 요청 계약과 gate 표, lease v3 추가`

**관련 테스트와 이유:**
- `role-routing-dispatch`: prepare 경로를 바꾼다.
- `role-dispatch-store`: lease 키가 바뀐다.
- `runtime-versions`·`runtime-assets`·`manifest`: 인벤토리와 해시가 바뀐다.
- `role-bridge-run`·`role-bridge-resume`: lease version 분기가 바뀐다.
- `bridge-args-golden`: AC2의 기준선이다.

**Tester:** 필요. `mode: task`. 확인 범위는 다음과 같다.
- AC4·AC5 표의 각 행
- lease v2 무변경
- read role deny
- RF5
- Step 10의 host 출력(Orchestrator가 전달)

**MI:** 없음.
**Hold 조건:**
- 기존 prepare 결과 키가 `toolAccess` 없이도 바뀐다.
- lease v2 바이트가 바뀐다.
- golden이 base가 아닌 코드에서 생성됐다(Step 1 전에 runtime diff가 있었다).

---

### Task T2: scratch 수명, env 값 계산, `toolContext` 전달

**목표:**
- Codex·Claude 쓰기 역할 dispatch마다 scratch를 만든다.
- terminal 기록 직전에 evidence를 복사하고 scratch를 삭제한다.
- run·resume·supervisor가 같은 `toolContext`를 계산해 `buildBridgeArgs`로 넘긴다.
- 이 task에서는 args 바이트가 바뀌지 않는다. adapter가 아직 `toolContext`를 무시하기 때문이다.

**배정:** AC3, MI-C
**선행:** T1 수용·커밋

**allowedPaths:**
- `lib/runtime/tool-access.mjs`
- `lib/runtime/role-supervisor.mjs`
- `lib/runtime/role-bridge.mjs`
- 각 파일의 `shared/skill/runtime/` 대응본
- `tests/node/tool-access-scratch.test.mjs`(신규)
- `tests/node/role-bridge-run.test.mjs`(host 실행)
- `tests/node/role-bridge-resume.test.mjs`(host 실행, 필요할 때만)
- `tests/node/runtime-versions.test.mjs`(`baselineHash`만)
- `tests/node/fixtures/installed-layout-golden.json`
- `MANIFEST.sha256`

**Interfaces (Produces):**
- `tool-access.mjs`
  - `EVIDENCE_LIMITS = {totalBytes: 67108864, fileBytes: 16777216, entries: 256, depth: 8}`
  - `renderEnv(presetIds: string[], scratch: string) -> Array<[string, string]>`
    - `'<S>'`를 치환하고 키를 정렬한다.
    - 키가 겹치면 throw한다.
  - `buildToolContext({platform, role, dispatchId, toolAccess, uid, userHome, homes, envNames, worktree, gitDir, gitCommonDir, policy}) -> ToolContext | null`
    - `ToolContext = {scratch: string, parent: string|null, env: Array<[string,string]>, grants: Grants, forbidden: ResolvedForbidden, secretEnvNames: string[], hostDir: string|null, worktree, gitDir, gitCommonDir, conditions}`
    - `effectiveGrants`가 null이면 null이다.
    - `scratch`는 `TOOL_ACCESS_ADAPTERS[platform].scratchRoot({id8: dispatchId.replaceAll('-','').slice(0,8), uid})`다.
    - `secretEnvNames`는 `grants.network==='domains'`일 때만 계산한다. `envNames` 중 `forbidden.envWhenExternal` glob(`*`만 와일드카드)에 맞는 이름을 정렬한 것이다. 그 외에는 `[]`다.
    - `hostDir`은 T2에서 항상 null이다(T5에서 채운다).
  - `createScratch({scratch, parent, uid}) -> Promise<void>`
    - `parent`가 있을 때
      - 없으면 `mkdir(parent, {mode:0o700})`
      - 있으면 lstat 결과가 실제 디렉터리이고 `uid`가 일치해야 한다. 아니면 `{reasonCode:'permission_scope_unverified'}`를 throw한다.
    - `scratch`는 비재귀 `mkdir`(mode 0o700)이고, 이미 있으면 `{reasonCode:'execution_failed'}`를 throw한다.
    - 하위 `tmp`, `cache`, `sock`, `evidence`를 각각 0o700으로 만든다.
    - 만든 뒤 `chmod`로 umask 영향을 없앤다.
  - `collectEvidence({scratch, artifactDir, limits = EVIDENCE_LIMITS}) -> Promise<{copied: number, skipped: string[], truncated: boolean}>`
    - `<scratch>/evidence`를 lstat 기준으로 사전순 DFS한다.
    - 정규 파일과 디렉터리만 `<artifactDir>/evidence/`로 복사한다. 목적지는 `wx`로 만들고 0o600을 준다.
    - symlink, socket, FIFO, device는 상대 경로를 `skipped`에 넣는다.
    - 상한을 넘으면 나머지를 건너뛰고 `truncated:true`로 둔다.
    - 목적지 `path.relative`가 `..`로 시작하면 거부한다.
    - `skipped`는 최대 256개다.
  - `removeScratch(scratch) -> Promise<boolean>`
    - lstat 결과가 실제 디렉터리일 때만 `fsp.rm(scratch, {recursive:true, force:false})`를 실행한다(symlink를 따라가지 않는다).
    - 실패하면 false다.
- `role-supervisor.mjs`
  - `buildBridgeInvocation`에 인자 `userHome`, `env`, `target`(`{gitDir, gitCommonDir}`)를 더한다.
  - 호출 순서
    1. `toolAccessReasons({platform, role: lease.role, route: lease.route, toolAccess: lease.toolAccess, policy})`
    2. 결과가 있으면 `fail(reasons[0])`
    3. `buildToolContext({... uid: process.getuid(), envNames: Object.keys(localCliEnvironment(resolveLocalCli(platform, {cwd: worktree, userHome, env})))})`
    4. `toolAccessPreflight`
    5. `buildBridgeArgs(platform, {..., toolContext})`
  - 반환 값에 `toolContext`를 더한다.
- 호출부
  - `role-bridge.mjs:63,177`: `userHome: context.userHome, env: context.env ?? process.env, target`
  - `role-supervisor.mjs:478`: `userHome, env, target`
- `runSupervisor`
  - 새 option `options.scratchIo = {create, collect, remove}`. 기본값은 위 세 함수다.
  - `invocation.toolContext`가 있으면 Grok 블록 뒤, `before = await snapshot()` 전에 `create`를 호출한다.
    - throw하면 `earlyFailure(error.reasonCode ?? 'execution_failed')`. 이 경우 spawn하지 않는다.
  - `writeRecord`는 본문을 쓰기 직전에 `await finishToolAccess()`를 호출한다.
    - `finishToolAccess`는 한 번만 실행되고 결과를 기억한다. 내용은 `collect` 다음 `remove`다.
    - 결과를 `toolAccess: {conditions, scratch: {path, removed}, evidence: {copied, skipped, truncated}}`로 병합한다.
    - 이 키는 scratch를 만든 경우에만 붙는다.
  - `collect`나 `remove`가 실패해도 terminal state와 reasons는 바꾸지 않는다(`removed:false`).

- [ ] **Step 0 (Orchestrator host, MI-C, Implementer 배정 전):**
  - 절차: `/private/tmp/claude-<uid>`를 미리 만든 상태에서 Claude Bash(D2 settings)로 `<S>/tmp`·`<S>/evidence` 쓰기를 측정한다. `<S>`는 supervisor 역할을 하는 host 셸에서 만든다.
  - 통과: 두 쓰기가 성공한다. 결과는 handoff record에 남긴다.
  - 실패: Implementer brief에 `TOOL_ACCESS_GATES.scratch.claude`, `env.base.claude`, `env.caches.claude`를 `'held'`로 바꾸고 측정 근거 주석을 다는 지시를 넣는다. 그러면 Claude 쓰기 역할은 scratch 없이 지금 동작을 유지한다. Orchestrator에 보고한다. task는 계속할 수 있다.
- [ ] **Step 1 (RED, sandbox):** `tests/node/tool-access-scratch.test.mjs`. root는 `fs.mkdtemp(os.tmpdir())` 아래다.
  1. `createScratch makes 0700 root and four 0700 subdirectories`
  2. `createScratch refuses pre-existing path of any type`: 디렉터리, 파일, symlink 각각에서 `reasonCode==='execution_failed'`이고, symlink 대상에는 아무것도 생기지 않는다.
  3. `Claude scratch parent must be an owned real directory`: 부모가 symlink이거나 `uid+1`이면 `permission_scope_unverified`, 없으면 만들어지고 0o700이다.
  4. `collectEvidence copies only regular entries within limits`
     - symlink(→ 임시 secret)와 FIFO는 `skipped`
     - `fileBytes` 상한을 넘는 파일은 건너뛰고 `truncated:true`
     - 깊이 9는 건너뛴다.
     - 257번째 항목에서 `truncated:true`
     - 복사본은 모두 artifactDir 아래에 있다.
     - limits를 주입해 작은 값으로 테스트한다.
  5. `removeScratch removes the tree without following symlinks and reports false on failure`: 안에 있는 외부 symlink의 대상은 남고, 부모 디렉터리를 0o500으로 두면 false다.
  6. `renderEnv substitutes scratch and sorts keys`: `renderEnv(['base','caches'], '/x')`의 첫 항목 키가 JS 정렬 최솟값이고, 모든 값에 `'<S>'`가 남지 않는다.
  7. `buildToolContext is deterministic for the same inputs and null for read roles and grok/gemini without toolAccess`
- [ ] **Step 2 (RED, host 전용):** `tests/node/role-bridge-run.test.mjs`(fake CLI)
  - `scratch exists during the child and is removed after completion`
    - fake child가 `ARC_SCRATCH_DIR` 대신 고정 경로(`buildToolContext` 결과)에 파일을 쓴다. T2에는 env 렌더링이 없다.
    - 완료된 뒤 경로가 없고 record에 `toolAccess.scratch.removed===true`가 있다.
  - `scratch is cleaned on earlyFailure, cancel and timeout`: 세 경로 각각에서 record에 `toolAccess`가 있고 경로가 없다. earlyFailure는 scratch 생성 뒤 snapshot 실패를 주입한다.
  - `scratch removal failure is a warning only`: `scratchIo.remove`가 false를 반환하게 주입하면 state는 completed이고 `removed:false`다.
  - `pre-existing scratch fails execution_failed without spawn`
  - `scratch outside the worktree leaves changedPaths and controlChanged empty`
  - `read roles and grok create no scratch`
  - scratch root는 테스트가 `TOOL_ACCESS_ADAPTERS` 대신 `options.scratchIo.create`에 넘길 경로를 임시 경로로 바꿔 주입한다. 실제 `/private/tmp/arc-bridge-*`는 만들지 않는다.
- [ ] **Step 3:** Step 1 명령 `node --test tests/node/tool-access-scratch.test.mjs`가 FAIL하는지 확인한다. Step 2는 Orchestrator가 host에서 FAIL을 확인한다.
- [ ] **Step 4 (GREEN):** Interfaces대로 구현한다.
- [ ] **Step 5 (생성):** T1 Step 8과 같다. `baselineHash`도 갱신한다.
- [ ] **Step 6 (focused, sandbox):** 아래가 PASS이고, golden이 불변이어야 한다(adapter 미사용).
  ```
  node --test tests/node/tool-access-scratch.test.mjs tests/node/tool-access.test.mjs tests/node/bridge-args-golden.test.mjs tests/node/role-bridge-args.test.mjs tests/node/runtime-versions.test.mjs
  ```
- [ ] **Step 7 (Orchestrator host):** 다음이 모두 PASS이고 새 실패가 0건이어야 한다.
  - `node --test tests/node/role-bridge-run.test.mjs tests/node/role-bridge-resume.test.mjs tests/node/role-observe.test.mjs`
  - `npm test`
- [ ] **Step 8:** 수용·커밋 `feat(runtime): bridge 쓰기 역할 scratch 수명과 evidence 복사 추가`

**관련 테스트와 이유:**
- `role-bridge-run`·`role-bridge-resume`: supervisor 종료 경로를 바꾼다.
- `role-observe`: `detectViolations`가 불변인지 확인한다.
- `role-bridge-args`·`bridge-args-golden`: `toolContext`를 전달해도 args가 불변인지 확인한다.

**Tester:** 필요. `mode: task`. 확인 범위는 다음과 같다.
- RF1, RF2
- Step 2의 종료 경로별 host 출력
- `argsDigest`가 run·supervisor에서 같은지(resume 포함)

**Hold 조건:**
- 이 task에서 args 바이트가 바뀐다.
- scratch 경로가 worktree 안에 생긴다.
- 실제 `/private/tmp/arc-bridge-*`가 테스트 뒤에 남는다.

---

### Task T3: Codex adapter (sandbox/profile mode, R1, env, domains, 관측)

**목표:**
- Codex 쓰기 역할 인자는 부여가 없으면 sandbox mode(기존 인자 + env 항목)를 쓴다.
- network·paths·unixSockets 부여가 있으면 profile mode를 쓴다. 두 mode는 배타다.
- R1 보호 항목을 강제하고, 사용자 설정 충돌을 보류하고, 관측 기대값을 맞춘다.

**배정:** AC6, AC2(Codex 부분), AC10(Codex 쓰기 역할 env 기대값), MI-1, MI-2, MI-3, MI-9(Codex)
**선행:** T2 수용·커밋

**allowedPaths:**
- `lib/runtime/role-bridge-args.mjs`
- `lib/runtime/role-supervisor.mjs`
- `lib/runtime/role-observe.mjs`
- `lib/runtime/role-dispatch-policy.mjs`
- `lib/runtime/tool-access.mjs`
- 각 파일의 `shared/skill/runtime/` 대응본
- `tests/node/role-bridge-args.test.mjs`
- `tests/node/role-observe.test.mjs`
- `tests/node/role-dispatch-policy.test.mjs`
- `tests/node/tool-access.test.mjs`
- `tests/node/role-routing-dispatch.test.mjs`
- `tests/node/role-bridge-run.test.mjs`(host)
- `tests/node/runtime-versions.test.mjs`(`baselineHash`만)
- `tests/node/fixtures/installed-layout-golden.json`
- `MANIFEST.sha256`

- [ ] **Step 0 (Orchestrator host, Implementer 배정 전, bridge 미실행 상태):** 결과를 handoff record에 남기고, 그대로 Implementer brief에 넣는다.
  - **MI-1:** `codex exec --json`에 spec 4.4 후보 A 인자를 넣어 신규와 `exec resume <tid>`를 측정한다.
    - B1·B3·SX4 probe를 재실행한다.
    - rollout의 `turn_context.sandbox_policy.type`를 기록한다.
    - 기록할 것: 실제로 받아들여진 argv 전문(신규·resume), `-P` 위치, `--enable network_proxy` 위치, type 값.
    - A가 거부되면 후보 B(`-c default_permissions="arc_bridge"`, `-c features.network_proxy=true`)를 측정한다.
    - **실패 처리:** A·B 모두 실패하면 Codex의 `codexProfile`, `network.loopback`, `unixSockets.scratch`, `unixSockets.registered`, `paths`, `network.domains`, `service.*` gate를 `'held'`로 둔다. 그래도 sandbox mode와 env 렌더링은 구현한다. Orchestrator에 보고한다.
  - **MI-2:** 사용자 profile 정의와 `-c` 병합 여부를 측정한다. 측정 방법은 O2 결정에 따른다. 결과와 상관없이 충돌 검사는 유지한다.
  - **MI-3:** spec 8.1 절차(배치 1·2, 조건 a/b/c)를 따른다. 대상별 a/b/c 표를 남긴다.
    - (b)가 통과하면 gitDir 항목을 넣지 않는다.
    - (c)만 통과하면 `<gitDir>`·`<gitCommonDir>` `"read"`를 항상 넣는다.
    - 둘 다 실패하면 `codexProfile`을 `'held'`로 둔다.
  - **MI-9(Codex):** `~/.arc-mi9-dir/`의 `"none"` 읽기 거부를 측정한다. 실패하면 Codex `network.domains`를 `'held'`로 둔다.
  - spec 11장 측정 결과 절 갱신 문구를 Orchestrator가 준비한다. spec 개정은 Orchestrator 소관이다.

**Interfaces (Produces):**
- `role-dispatch-policy.mjs`
  - `CODEX_PROFILE_ARGS_FORM: 'A'|'B'`
  - `CODEX_PROFILE_SANDBOX_TYPE: string|null`: MI-1 관측값. 안정적인 값이 없으면 null이다.
  - `CODEX_PROFILE_GIT_ENTRIES: boolean`: MI-3이 (c)일 때 true다.
  - 각 상수에 `// Codex 0.170.0, 2026-11-24, MI-1|MI-3` 주석을 단다.
- `role-bridge-args.mjs`
  - `buildCodexArgs({..., toolContext = null})`
    - `toolContext`가 null이면 지금 바이트 그대로다.
    - 있고 `grants.mechanisms`에 `codexProfile`이 없으면, 지금 settings의 `-c approval_policy="never"` 바로 뒤에 env 항목(`-c`, `shell_environment_policy.set.<K>=<JSON.stringify(V)>`, `toolContext.env` 순서)을 넣는다. 그 뒤가 `-o`다.
    - `codexProfile`이 있으면 profile mode다.
      - 신규: `exec --json -C <wt> -P arc_bridge [--enable network_proxy] -m ... -c model_reasoning_effort=... -c developer_instructions=... -c permissions.arc_bridge.extends=":workspace" -c permissions.arc_bridge.filesystem=<table> [network 4항목] -c approval_policy="never" [env] [exclude] -o <result> -`
      - resume: MI-1에서 기록한 위치를 쓴다.
      - B form은 MI-1 기록대로 치환한다.
      - `sandbox_mode`는 넣지 않는다.
  - `codexFilesystemEntries(toolContext) -> Array<[string, 'read'|'write'|'none']>`
    1. `[wt/.git,'read']`, `[wt/.codex,'read']`
    2. `CODEX_PROFILE_GIT_ENTRIES`일 때 `gitDir`·`gitCommonDir`(서로 같거나 1과 같으면 생략)
    3. `hostDir` `'read'`(T5)
    4. paths `'write'`
    5. domains일 때 `readWhenExternal` `'none'`
    - 3–5는 각각 경로 이름순이다.
  - `renderCodexTable(entries) -> string`
    - 형식: `{` + `entries.map(([k,v]) => JSON.stringify(k)+'='+JSON.stringify(v)).join(',')` + `}`
  - `assertCodexProtection(entries, worktree)`: 앞의 두 항목이 정확히 R1 보호 항목이 아니면 `Error('Codex profile protection entries missing')`를 throw한다.
  - network 항목(유효 network ≠ null일 때)
    - `permissions.arc_bridge.network.enabled=true`
    - `permissions.arc_bridge.network.domains={"127.0.0.1"="allow",<domains 정렬>="allow"}`
    - `permissions.arc_bridge.network.allow_local_binding=true`
    - `permissions.arc_bridge.network.unix_sockets={"<S>/sock"="allow"}`
  - exclude(domains): `-c shell_environment_policy.exclude=<JSON.stringify(forbidden.envWhenExternal)>`
- `tool-access.mjs` `TOOL_ACCESS_ADAPTERS.codex.preflight`에 `codexUserProfileConflict`를 추가한다.
  - 조건: profile mode(`grants.mechanisms` 포함)일 때만 검사한다.
  - 대상 파일: `path.join(homes.codex,'config.toml')`, `path.join(worktree,'.codex','config.toml')`
  - 판정: 파일이 있고, 주석이 아닌 줄 중 `/^\s*\[\s*permissions\s*\.\s*"?arc_bridge"?\s*[\].]/m` 또는 `/^\s*permissions\s*\.\s*"?arc_bridge"?\s*[.=]/m` 또는 (`/^\s*\[\s*permissions\s*\]/m` 그리고 `/^\s*"?arc_bridge"?\s*[.=]/m`)에 맞으면 `'permission_scope_unverified'`다.
  - 읽기 오류가 ENOENT가 아니면 `'permission_scope_unverified'`다.
- `role-supervisor.mjs` `buildBridgeInvocation` Codex `expected.sandboxMode`: profile mode이면 `CODEX_PROFILE_SANDBOX_TYPE`, 아니면 지금 값이다.
- `role-observe.mjs` `evaluateCodexContext`: `expected.sandboxMode === null`이면 sandbox 판정을 `'missing'`으로 두고, `notes`에 `'codex-profile-sandbox-type-unrecorded'`를 더한다.

- [ ] **Step 1 (RED):** `tests/node/role-bridge-args.test.mjs`. 기존 `Codex argv per role matches spec 5.5`의 쓰기 역할 기대값은 AC10에 따라 env 항목만 추가한다.
  1. `Codex writer sandbox mode argv equals base plus sorted env items`: `toolContext`(always-on)의 argv에서 env `-c` 쌍을 빼면 기존 기대 배열과 같아야 한다. env 쌍은 `-o` 바로 앞에 연속으로 있어야 한다.
  2. `Codex profile mode omits sandbox_mode and starts filesystem with R1 entries`(Tester loopback)
     - `sandbox_mode=` 문자열이 없다.
     - `-P`와 `arc_bridge`가 MI-1 위치에 있다. (MI-1 결과 B 형식: `-c default_permissions="arc_bridge"`. spec 8.2)
     - filesystem 값이 `{"/w/.git"="read","/w/.codex"="read"`로 시작한다.
     - `--enable network_proxy`가 있다. (B 형식: `-c features.network_proxy=true`)
     - unix_sockets가 `<S>/sock`이다.
  3. `Codex profile argv matches MI-1 recorded form`: 신규와 resume argv가 MI-1 기록 배열과 같아야 한다. 기록 값을 테스트 상수로 두고, 측정 ID와 날짜를 주석으로 단다.
  4. `missing protection entries throw`: `assertCodexProtection([['/w/.codex','read']], '/w')`가 throw한다. `buildBridgeInvocation`에서는 `permission_scope_unverified`로 이어진다(Step 2).
  5. `paths-only grant uses profile mode without network keys`: `TOOL_PATHS`를 테스트에서 주입한다. `--enable network_proxy`가 없고 `network.` 키도 없다.
  6. `domains renders none entries for readWhenExternal and env exclude`: 이름순 `"none"` 항목과 exclude 값이 `FORBIDDEN.envWhenExternal` 순서인지 확인한다.
  7. `git entries follow CODEX_PROFILE_GIT_ENTRIES`: MI-3 결과 값으로 단언한다.
  8. `Codex read roles ignore toolContext`: `buildCodexArgs`에 `toolContext`를 줘도 golden과 같다. 읽기 역할에는 `buildBridgeInvocation`이 null을 넘기지만 방어적으로 확인한다.
- [ ] **Step 2 (RED):**
  - `tests/node/role-routing-dispatch.test.mjs` `Codex profile mode holds when user config defines permissions.arc_bridge`: 임시 CODEX_HOME의 `config.toml`과 worktree `.codex/config.toml` 각각에서 hold가 나야 한다. `# [permissions.arc_bridge]` 주석은 통과다. sandbox mode(toolAccess 없음)는 통과다.
  - `tests/node/role-observe.test.mjs`
    - `profile mode expectation uses CODEX_PROFILE_SANDBOX_TYPE`: 관측값이 일치하면 ok, 다르면 mismatch다.
    - `null expected sandboxMode yields unverified permissions with note`
- [ ] **Step 3 (RED, host 전용):** `tests/node/role-bridge-run.test.mjs`
  - `Codex fake child receives env set items and argsDigest matches across run and supervisor`
  - `Codex resume re-applies profile args`
- [ ] **Step 4:** FAIL을 확인한다.
  ```
  node --test tests/node/role-bridge-args.test.mjs tests/node/role-routing-dispatch.test.mjs tests/node/role-observe.test.mjs
  ```
- [ ] **Step 5 (GREEN):** 구현한다. MI 결과에 따라 `TOOL_ACCESS_GATES`·`TOOL_ACCESS_CONDITIONS`의 Codex 값과 근거 주석을 바꾼다. 예: MI-1 통과 시 `codexProfile` 조건 문구에서 `exec acceptance pending` 부분을 지운다.
- [ ] **Step 6 (생성):** T1 Step 8과 같다.
- [ ] **Step 7 (focused, sandbox):** 아래가 PASS여야 한다.
  ```
  node --test tests/node/role-bridge-args.test.mjs tests/node/bridge-args-golden.test.mjs tests/node/tool-access.test.mjs tests/node/role-routing-dispatch.test.mjs tests/node/role-observe.test.mjs tests/node/role-dispatch-policy.test.mjs tests/node/runtime-versions.test.mjs
  ```
- [ ] **Step 8 (Orchestrator host):** Step 3 테스트와 `npm test`를 실행해 새 실패가 0건인지 확인한다.
- [ ] **Step 9:** 수용·커밋 `feat(runtime): Codex bridge permission profile 모드와 보호 항목 강제`

**관련 테스트와 이유:**
- `role-bridge-args`: argv 계약이다.
- `bridge-args-golden`: AC2다.
- `role-observe`: 기대값이 바뀐다.
- `role-routing-dispatch`: preflight hold다.
- `role-bridge-run`: digest와 resume이다.
- `role-dispatch-policy`: 새 상수다.

**Tester:** 필요. `mode: task`. 확인 범위는 다음과 같다.
- AC6
- RF3
- profile/sandbox 배타
- 보호 항목 누락 시 throw
- 읽기 역할 golden
- Step 8 host 출력

**Hold 조건:**
- MI-1의 결과가 기록되지 않은 채 profile argv를 구현한다.
- 보호 항목이 순서 1·2가 아닌 경우가 생긴다.
- 기존 Codex 읽기 역할 기대값이 바뀐다.

---

### Task T4: Claude adapter (D2′, settings 조립, Scouter `--allowedTools`)

**목표:**
- Claude 쓰기 역할의 settings를 D2′ + env + 부여 항목으로 고정된 키 순서로 조립한다.
- domains일 때 비밀 읽기를 거부하고 env를 빈 값으로 만든다.
- B12에 따라 Scouter에 `--allowedTools`를 더한다.

**배정:** AC7, AC2(Claude·Scouter 2토큰), AC10(`Write(./.git/**)` 기대값 제거, Scouter 2토큰), MI-4, MI-5, MI-6, MI-7, MI-8, MI-9(Claude)
**선행:** T3 수용·커밋. 파일이 겹치므로 순차로 진행한다.

**allowedPaths:**
- `lib/runtime/role-bridge-args.mjs`
- `lib/runtime/role-dispatch-policy.mjs`
- `lib/runtime/tool-access.mjs`
- 각 파일의 `shared/skill/runtime/` 대응본
- `tests/node/role-bridge-args.test.mjs`
- `tests/node/role-routing-dispatch.test.mjs`(`:84` 기대값)
- `tests/node/bridge-args-golden.test.mjs`(`t.todo` 해제만)
- `tests/node/tool-access.test.mjs`
- `tests/node/role-dispatch-policy.test.mjs`
- `tests/node/role-bridge-run.test.mjs`(host)
- `tests/node/runtime-versions.test.mjs`(`baselineHash`만)
- `tests/node/fixtures/installed-layout-golden.json`
- `MANIFEST.sha256`

- [ ] **Step 0 (Orchestrator host, Implementer 배정 전):** 결과를 handoff record와 brief에 넣는다.
  - **MI-4:** D2′로 Claude Implementer를 live로 돌린다.
    - Edit·Write 도구와 Bash로 `.git/config`·`.git/hooks/x` 쓰기를 시도한다. 모두 거부되고 해시가 불변이어야 한다.
    - **실패 처리:** `Write(./.git/**)` 제거를 보류하고 D2를 유지한다. AC7·AC10의 제거 부분은 수행하지 않는다. Orchestrator에 보고한다.
  - **MI-5:** `acceptEdits` + loopback settings로 서버 bind·connect 200을 확인한다. 실패하면 Claude `network.loopback`을 `'held'`로 둔다.
  - **MI-6:** domains settings + 비밀 env 빈 값 상태에서 Claude CLI 인증과 실행이 유지되는지 본다. 실패하면 Claude `network.domains`를 `'held'`로 둔다.
  - **MI-7:** domains settings에서 Read 도구로 `~/.ssh`류 probe 파일을 읽는다.
    - **규칙 경로 형식(`Read(//<abs>/**)` 또는 `Read(~/.ssh/**)`)을 함께 확정한다(O4).**
    - 거부되면 Claude `network.domains`를 `'pass'`로 바꾸는 것도 검토한다. 조건 문구를 지울지는 Orchestrator가 판단한다.
    - 실패하면 `'held'`로 둔다.
  - **MI-9(Claude):** 디렉터리 형태 비밀의 `denyRead`를 확인한다. 실패하면 Claude domains를 `'held'`로 둔다.

**Interfaces (Produces):**
- `role-dispatch-policy.mjs` `RECORDED_CLAUDE_SANDBOX_SETTINGS.permissions.deny = ['Edit(./.git/**)']`(MI-4 통과 시)
  - 주석: `// Claude 2.1.327, 2026-11-24, T0 부수 발견(Write 규칙 무효 경고) + MI-4`
- `ROLE_BRIDGE_PERMISSIONS.claude.arc_scouter = {permissionMode: 'default', sandbox: false, allowedTools: ['WebFetch','WebSearch']}`. 다른 역할에는 키를 두지 않는다.
- `buildClaudeArgs({..., toolContext = null})`
  - `'--permission-mode', mode` 바로 뒤에 `allowedTools`가 있으면 `'--allowedTools', allowedTools.join(',')`를 넣는다.
  - 각 항목이 `profile.tools`에 없으면 `Error('Claude allowedTools must be listed in profile tools')`를 throw한다. 이는 `buildBridgeInvocation`에서 `permission_scope_unverified`로 이어진다.
  - settings는 `claudeSettingsFor(base, toolContext)`의 결과다.
- `claudeSettingsFor(base, toolContext) -> object`
  - `toolContext`가 null이면 base 사본이다.
  - 최상위 키 순서는 `permissions`, `sandbox`, `env`다.
    - `permissions.deny`: `[...base.permissions.deny, ...(domains ? readRules : [])]`
    - `sandbox`: base 키 순서 + `filesystem: {denyWrite, [denyRead](domains), [allowWrite](paths)}` + `[network](유효 network ≠ null)`
      - `network` = `{allowedDomains: ['localhost','127.0.0.1', ...domains 정렬], allowLocalBinding: true, allowUnixSockets: [`${scratch}/sock`, ...등록 정렬]}`
    - `env`: `Object.fromEntries([...toolContext.env, ...secretEnvNames.map(n => [n, ''])])`. 키는 정렬된 상태로 만든다.
  - `denyRead`와 `readRules`의 순서는 `readWhenExternal` 경로 이름순이다.
    - `readRules`는 kind가 `dir`이면 `Read(<form>/**)`, `file`이면 `Read(<form>)`이다.
    - `<form>`은 MI-7에서 확정한 형식이다.
- `TOOL_ACCESS_ADAPTERS.claude.preflight`에 `claudeAllowWriteDirsExist`를 추가한다. `grants.paths`의 각 실제 경로가 실제 디렉터리가 아니면 `'permission_scope_unverified'`다. 현재는 id가 0개다.

- [ ] **Step 1 (RED):** `tests/node/role-bridge-args.test.mjs`
  1. `Claude writing roles get D2′ plus base/caches env settings bytes`
     - `JSON.stringify(settings)`가 D2′ JSON에서 마지막 `}`를 `,"env":{...}}`로 바꾼 것과 같다.
     - 기존 `:97-99` 테스트는 `Write(./.git/**)`만 지운다(AC10).
  2. `Claude scouter argv differs from base golden by exactly two tokens`: `bridge-args-golden.test.mjs`의 `t.todo`를 해제한다.
  3. `allowedTools absent from profile tools throws`
  4. `Claude network settings for loopback, domains and sockets`
     - loopback: `allowedDomains` `['localhost','127.0.0.1']`, `allowLocalBinding:true`, `allowUnixSockets` `[<S>/sock]`
     - domains: 도메인 정렬 + `denyRead` + `Read(...)` 규칙 + 비밀 env `""`
     - 키 순서 고정을 `JSON.stringify` 비교로 확인한다.
  5. `Claude domains secret env names change argsDigest`(RF4): 같은 입력에 `envNames`만 다르면 `argsDigest`가 다르다.
  6. `other Claude roles have no allowedTools`: planner·reviewer argv가 golden과 같다.
- [ ] **Step 2 (RED):** `tests/node/role-routing-dispatch.test.mjs:84` 기대값에서 `Write(./.git/**)`를 제거한다(AC10).
- [ ] **Step 3 (RED, host 전용):** `role-bridge-run.test.mjs` `Claude fake child receives settings env and supervisor argsDigest matches run-dispatch`
- [ ] **Step 4:** FAIL을 확인한다.
  ```
  node --test tests/node/role-bridge-args.test.mjs tests/node/bridge-args-golden.test.mjs tests/node/role-routing-dispatch.test.mjs
  ```
- [ ] **Step 5 (GREEN):** 구현한다. MI-4–7·9 결과에 따라 Claude gate·조건 값과 근거 주석을 갱신한다.
- [ ] **Step 6 (생성):** T1 Step 8과 같다.
- [ ] **Step 7 (focused, sandbox):** T3 Step 7과 같은 명령을 실행한다.
- [ ] **Step 8 (Orchestrator host, MI-8, 수용 전):**
  - `node -e`로 실제 `buildClaudeArgs` Scouter argv를 출력한다.
  - 그 argv로 WebFetch·WebSearch가 둘 다 성공하는지 확인한다.
  - **실패 처리:** B12 변경을 되돌리도록 Implementer에 재지시하고 Orchestrator에 보고한다. 되돌리면 golden `t.todo`도 유지한다.
- [ ] **Step 9 (Orchestrator host):** `role-bridge-run.test.mjs`를 실행하고, `npm test`에서 새 실패가 0건인지 확인한다.
- [ ] **Step 10:** 수용·커밋 `feat(runtime): Claude bridge settings 조립과 Scouter 웹 도구 허용`

**관련 테스트와 이유:**
- `role-bridge-args`: settings·argv 계약이다.
- `bridge-args-golden`: 2토큰 예외다.
- `role-routing-dispatch`: D2 기대값이 바뀐다.
- `role-dispatch-policy`: 기록 settings가 바뀐다.
- `role-bridge-run`: digest다.

**Tester:** 필요. `mode: task`. 확인 범위는 다음과 같다.
- AC7
- AC2 2토큰
- RF4
- 키 순서
- AC10 diff 범위(기대값 변경이 허용 목록뿐인지)

**Hold 조건:**
- MI-4 결과 없이 Write 규칙을 제거한다.
- 다른 읽기 역할 argv가 바뀐다.
- `Read` 규칙 형식이 MI-7로 확정되지 않았다.

---

### Task T5: host 서비스 (`browser-cdp`, `browser-playwright-*`)

**목표:**
- Tester가 요청하면 supervisor가 host에서 격리된 브라우저 서비스를 dispatch 수명 동안 띄운다.
- endpoint를 `<S>/services.json`으로 전달한다.
- Codex profile에 host 디렉터리 `"read"`를 넣는다.

**배정:** AC9, AC11(host-service), AC3 일부(정리 순서), MI-A, MI-B
**선행:** T3, T4 수용·커밋

**allowedPaths:**
- `lib/runtime/host-service.mjs`(신규)
- `lib/runtime/tool-access.mjs`
- `lib/runtime/role-supervisor.mjs`
- `lib/runtime/role-bridge-args.mjs`(hostDir 항목만)
- `lib/runtime/bootstrap.mjs`
- `lib/installer/runtime-assets.mjs`
- 각 파일의 `shared/skill/runtime/` 대응본
- `tests/node/host-service.test.mjs`(신규)
- `tests/node/tool-access.test.mjs`
- `tests/node/role-bridge-args.test.mjs`
- `tests/node/role-routing-dispatch.test.mjs`
- `tests/node/role-bridge-run.test.mjs`(host)
- `tests/node/runtime-versions.test.mjs`
- `tests/node/runtime-assets.test.mjs`(필요할 때만)
- `tests/node/fixtures/installed-layout-golden.json`
- `MANIFEST.sha256`

- [ ] **Step 0 (Orchestrator host, Implementer 배정 전):**
  - **MI-A:** SX7 `chrome.sb`를 `log stream`/sandbox 거부 로그를 보며 축소한다.
    - 통과: localhost 페이지·스크린샷이 성공하고 홈 비밀이 차단된다. 결과 profile 전문을 brief에 넣는다.
    - **실패 처리:** D-f에 따라 `(allow file-read* (subpath "<H>/Library") (literal "<H>"))`를 유지하고 문서화한다. `browser-cdp` gate는 `conditional`로 둔다.
  - **MI-B:** 브라우저별로 sandbox-exec 격리 형식과 외부 차단 방법을 측정한다. 외부 차단은 `launchServer`의 `proxy` 옵션 또는 브라우저 인자다.
    - 통과 기준: connect, 페이지, 외부 차단, 홈 비밀 차단
    - 브라우저별 profile 전문과 launch 옵션을 brief에 넣는다.
    - **실패 처리:** 실패한 브라우저의 `service.browser-playwright-<b>` gate를 `'held'`로 둔다. `~/Library`는 D-f를 따른다.

**Interfaces (Produces, `lib/runtime/host-service.mjs`):**
- `HOST_SERVICES`
  ```
  {'browser-cdp': {kind: 'cdp'}, 'browser-playwright-chromium': {kind: 'playwright', browser: 'chromium'}, 'browser-playwright-firefox': {kind: 'playwright', browser: 'firefox'}, 'browser-playwright-webkit': {kind: 'playwright', browser: 'webkit'}}
  ```
  - 키 집합은 `TOOL_ACCESS_SERVICES`와 같아야 한다(테스트로 확인).
- `CHROME_EXECUTABLE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'`, `SANDBOX_EXEC = '/usr/bin/sandbox-exec'`
- `hostDirFor(dispatchId) -> string` = `/private/tmp/arc-host-<id8>`
- `resolveGlobalPlaywright({run = spawnSync}) -> {root: string, name: 'playwright'|'playwright-core', version: string} | null`
  - `npm root -g`를 실행한다. timeout은 `PROBE_TIMEOUT_MS`다.
  - `<root>/playwright/package.json`을 먼저 보고, 없으면 `playwright-core`를 본다.
- `hostServicePreflight({services, io}) -> Promise<string|null>`
  - cdp이면 `CHROME_EXECUTABLE`과 `SANDBOX_EXEC`가 실행 가능해야 한다.
  - playwright이면 `resolveGlobalPlaywright`가 non-null이어야 한다.
  - 아니면 `'permission_scope_unverified'`다.
  - `TOOL_ACCESS_ADAPTERS.codex/claude.preflight`에 등록한다. 플랫폼과 무관하게 같은 함수를 쓴다.
- `renderSandboxProfile({kind, browser, userHome, dataDir, bundleDirs}) -> string`
  - MI-A·MI-B에서 확정한 형식을 쓴다.
  - 모든 경로는 realpath다.
  - 경로에 `"`·`\`·개행이 있으면 throw한다.
- `startHostService({id, dispatchId, scratch, userHome, timeoutMs, io}) -> Promise<{id, started: true, endpoint, stop: () => Promise<'ok'|'warning'>}>`
  - 디렉터리 `<hostDir>/<id>/`(0700)를 만든다.
  - cdp: spec 4.6 Chrome 인자 그대로 실행한다. `--remote-debugging-port=0`을 주고, `<udd>/DevToolsActivePort`를 `timeoutMs` 동안 폴링한다. endpoint는 `{port, url: 'http://127.0.0.1:<n>'}`다.
  - playwright: `sandbox-exec -f <dir>/<browser>.sb <process.execPath> <host-service.mjs 경로> --playwright-launch <root> <name> <browser> <dir>`를 실행한다.
    - 이 모듈을 main으로 실행하면 `createRequire(path.join(root, name, 'package.json'))(name)[browser].launchServer({host: '127.0.0.1', port: 0, ...MI-B 옵션})`를 호출한다.
    - stdout 첫 줄 JSON `{"wsEndpoint","version"}`을 읽는다.
  - 자식은 `detached:true`로 만든다. 저장소 코드·worktree `node_modules`는 import하지 않는다(cwd는 hostDir).
  - 시작 실패나 timeout이면 group을 종료하고 `{reasonCode: 'execution_failed'}`를 throw한다.
  - `stop`: SIGTERM group → `CANCEL_GRACE_MS` → SIGKILL → `fsp.rm(dir, {recursive:true})`. 하나라도 실패하면 `'warning'`이다.
- `writeServicesFile(scratch, records) -> Promise<void>`: `<S>/services.json`을 `wx`, 0o600으로 쓴다. 내용은 `{"<id>": endpoint}`다.
- `tool-access.mjs` `buildToolContext`: `grants.services`가 비어 있지 않으면 `hostDir = hostDirFor(dispatchId)`다. `FORBIDDEN.write`와 겹치는지 검사한다.
- `role-bridge-args.mjs` `codexFilesystemEntries` 3번 항목: `[hostDir, 'read']`
- `runSupervisor`
  - scratch 생성 뒤, spawn 전에 `services`를 순서대로 `startHostService`로 시작한다. 그다음 `writeServicesFile`을 쓴다.
  - 시작에 실패하면 이미 시작한 서비스를 stop하고 `earlyFailure('execution_failed')`다.
  - `finishToolAccess` 순서: 서비스 stop(역순) → `collectEvidence` → `removeScratch` → `fsp.rm(hostDir, {recursive:true})`(실패 시 경고).
  - 기록: `toolAccess.hostServices[] = {id, started, endpoint, cleanup}`
  - 테스트 주입을 위해 `options.hostServiceIo`를 둔다.

- [ ] **Step 1 (RED, sandbox):** `tests/node/host-service.test.mjs`. fake 실행 파일은 node 스크립트이고 `io.spawn`으로 주입한다.
  1. `HOST_SERVICES keys equal TOOL_ACCESS_SERVICES`
  2. `preflight holds when Chrome, sandbox-exec or global playwright is missing`: playwright와 playwright-core가 둘 다 없을 때 `permission_scope_unverified`다. playwright-core만 있으면 통과다.
  3. `cdp start reads DevToolsActivePort and returns endpoint`(fake가 파일을 쓴다)
  4. `start failure and timeout are execution_failed and kill the group`
  5. `stop returns warning when removal fails`
  6. `services file is written 0600 and refuses an existing file`
  7. `renderSandboxProfile rejects quotes and newlines in paths`
  8. `host-service.mjs has no platform name branches`(T1 테스트 12에 파일을 추가하는 방식)
- [ ] **Step 2 (RED):**
  - `role-bridge-args.test.mjs` `Codex services grant adds host dir read entry after protection entries`
  - `role-routing-dispatch.test.mjs` `services preflight hold`: 주입한 resolver가 null을 반환하는 경우다.
- [ ] **Step 3 (RED, host 전용):** `role-bridge-run.test.mjs`
  - `services start before spawn and stop before scratch removal`: fake 서비스를 쓴다. 순서는 이벤트 로그로 확인한다.
  - `service start failure is execution_failed without spawn`
  - `service cleanup warning keeps completed state`
- [ ] **Step 4:** FAIL을 확인한다.
  ```
  node --test tests/node/host-service.test.mjs tests/node/role-bridge-args.test.mjs tests/node/role-routing-dispatch.test.mjs
  ```
- [ ] **Step 5 (GREEN):** 구현한다.
  - MI-A·MI-B 결과로 gate·조건 값을 갱신한다.
  - 인벤토리 세 곳에 `host-service.mjs`를 추가한다(`COOPERATIVE_RUNTIME_MODULES` 끝, `expectedModules` 끝, `RUNTIME_MODULE_PATHS` 정렬 위치).
  - `baselineHash`를 갱신한다.
- [ ] **Step 6 (생성):** T1 Step 8과 같다.
- [ ] **Step 7 (focused, sandbox):** 아래가 PASS여야 한다.
  ```
  node --test tests/node/host-service.test.mjs tests/node/tool-access.test.mjs tests/node/tool-access-scratch.test.mjs tests/node/role-bridge-args.test.mjs tests/node/bridge-args-golden.test.mjs tests/node/role-routing-dispatch.test.mjs tests/node/runtime-versions.test.mjs tests/node/runtime-assets.test.mjs tests/node/manifest.test.mjs
  ```
- [ ] **Step 8 (Orchestrator host):** `role-bridge-run.test.mjs`를 실행하고 `npm test`에서 새 실패가 0건인지 확인한다.
- [ ] **Step 9 (Orchestrator host, AC9 live, 수용 전, 커밋·ref 이동 없음):**
  - 실행할 dispatch(이 task의 코드를 실행하는 경로는 O3)
    - Codex Tester: `browser-cdp` 1회, `browser-playwright-chromium`·`-firefox`·`-webkit` 각 1회
    - Claude Tester: 같은 4종
  - 각 dispatch에서 확인할 것
    - `services.json` endpoint 접속
    - localhost 페이지
    - `ARC_EVIDENCE_DIR` 스크린샷이 artifactDir로 복사됐는지
    - 종료 뒤 hostDir·scratch가 없는지
  - 결과는 handoff record에 남긴다.
  - **실패 처리:** 실패한 서비스와 플랫폼 조합의 gate를 `'held'`로 되돌리는 재지시를 Implementer에 내리고 Orchestrator에 보고한다.
- [ ] **Step 10:** 수용·커밋 `feat(runtime): bridge Tester host 브라우저 서비스 추가`

**관련 테스트와 이유:**
- `host-service`: 신규 모듈이다.
- `role-bridge-args`: hostDir 항목이다.
- `role-routing-dispatch`: preflight다.
- `role-bridge-run`: 수명이다.
- `runtime-versions`·`runtime-assets`·`manifest`: 인벤토리다.

**Tester:** 필요. `mode: task`. 확인 범위는 다음과 같다.
- AC9 단위 부분
- AC11
- 시작 실패 시 spawn 없음
- 정리 순서
- Step 8–9 host 출력

**Hold 조건:**
- 서비스가 worktree 코드나 `node_modules`를 import한다.
- 정리가 terminal 상태를 바꾼다.
- live에서 외부 도메인이 열린다.

---

### Task T6 (조건부): Grok 도구 접근

**진입 조건:** Orchestrator가 host에서 B14를 측정해 통과해야 한다. B14는 Grok custom 프로필에서 scratch·env·loopback·unix socket이 동등한지 보는 측정이고, 현재 Grok 402로 unmeasured다.

**진입 조건을 충족하지 못할 때:** T7을 시작할 때까지 B14가 pass가 아니면 T6을 건너뛴다. Grok gate는 `unmeasured`로 두고 handoff record에 기록한다. 이 경우 plan 개정은 필요 없다.

**B14가 통과할 때:** 측정된 Grok 프로필 형식으로 다음 범위를 담은 plan 개정안(T6 상세)을 Planner가 다시 작성하고, Orchestrator 승인을 받은 뒤 진행한다. 범위는 다음과 같다.
- `TOOL_ACCESS_ADAPTERS.grok`
- `grok-sandbox.mjs` 렌더링
- Grok gate 값
- 관련 테스트

이유: 메커니즘 형식이 측정 전이라, 지금 Step을 확정하면 근거 없는 결정이 된다.

**Tester:** 진행하게 되면 `mode: task`로 필요하다.

---

### Task T7: 문서와 역할 지침

**목표:** 사용자와 역할이 toolAccess의 범위, 한계, 보고 규칙을 알 수 있게 한다.

**배정:** AC1, AC12(문서·생성본·MANIFEST), spec 13장
**선행:** T1–T5 수용. T6을 진행했다면 T6도 수용.

**allowedPaths:**
- `README.md`
- `docs/harness-operation.md`
- 역할 지침 4종
  - `claude/skill/references/coordination.md`
  - `codex/skill/references/coordination.md`
  - `grok/skill/references/coordination.md`
  - `gemini/skill/references/coordination.md`
- `tests/node/fixtures/installed-layout-golden.json`
- `tests/node/fixtures/instruction-contracts.json`(계약 문구를 고정할 때만)
- `MANIFEST.sha256`

**내용:**
- `docs/harness-operation.md`
  - 범주표 C1–C21과 플랫폼×역할 기준선(spec 3장, T0b·MI 결과 반영)
  - 메커니즘 M1–M7
  - 요청 계약(5.1–5.3)
  - gate 표(최종 값과 측정 ID)
  - 한계: loopback 포트 비한정, Codex proxy 미준수, 저장소 밖 쓰기 감지 불가, recursive `fs.watch`(polling), `ps` host 전용, Chrome·Playwright의 `~/Library`·`file://`, Claude env 빈 값, DNS rebinding, Playwright 버전 불일치
  - finding 2건: Claude Planner·Reviewer에 Bash가 없다는 것, Grok 읽기 역할의 built-in read-only가 강제되지 않는다는 것
- README: toolAccess 개요, 영구 금지 목록, host 전용 목록
- coordination 4종에 같은 의미의 문단을 넣는다.
  - Orchestrator가 `toolAccess`를 요청하는 기준(D-a, 역할 표)
  - "환경 제한(host 전용)" 보고 규칙
  - `ARC_SCRATCH_DIR`·`ARC_EVIDENCE_DIR`·`ARC_HOST_SERVICES_FILE` 사용법
  - 문서마다 기존 언어를 따른다. `instruction-language.test.mjs`가 이를 판정한다.

- [ ] **Step 1:** 문서를 작성한다.
- [ ] **Step 2:** `node tests/node/fixtures/installed-layout.mjs --diff`를 실행한다. 차이가 coordination 4종뿐이면 `--write`한다. 이어서 `node scripts/update-manifest.mjs`를 실행하고 `--check`가 exit 0인지 본다.
- [ ] **Step 3 (focused, sandbox):**
  ```
  node --test tests/node/instruction-language.test.mjs tests/node/composite-instructions.test.mjs tests/node/consumer.test.mjs tests/node/manifest.test.mjs tests/node/grok-install.test.mjs tests/node/gemini-install.test.mjs tests/node/plan.test.mjs tests/node/readme-gate-consistency.test.mjs
  ```
- [ ] **Step 4 (Orchestrator host):** `npm test`에서 새 실패가 0건인지 확인한다.
- [ ] **Step 5:** 수용·커밋 `docs(harness): bridge 도구 접근 범주·한계·보고 규칙 문서화`

**Tester:** 필요 없음. 문서와 생성물만 바뀐다. Step 3–4 host 확인으로 대신하고, 최종 Tester와 최종 Reviewer 범위에 포함한다.
**Hold 조건:**
- 4종 문단의 의미가 서로 다르다.
- gate 표가 코드 값과 다르다.

---

## 최종 검증 (모든 task 수용 뒤)

**1. 최종 Tester (`mode: final`, fresh)**
- 확인 범위: base `6244a8af`..HEAD
- 계약 테스트 전체(sandbox에서 실행할 수 있는 것)
  ```
  node --test tests/node/tool-access.test.mjs tests/node/tool-access-scratch.test.mjs tests/node/host-service.test.mjs tests/node/bridge-args-golden.test.mjs tests/node/role-bridge-args.test.mjs tests/node/role-routing-dispatch.test.mjs tests/node/role-dispatch-store.test.mjs tests/node/role-dispatch-policy.test.mjs tests/node/role-observe.test.mjs tests/node/runtime-versions.test.mjs tests/node/runtime-assets.test.mjs tests/node/manifest.test.mjs tests/node/readme-gate-consistency.test.mjs tests/node/instruction-language.test.mjs tests/node/composite-instructions.test.mjs tests/node/consumer.test.mjs
  ```
- host 전용(Orchestrator가 실행하고 출력을 전달)
  - `node --test tests/node/role-bridge-run.test.mjs tests/node/role-bridge-resume.test.mjs`
  - `npm test`(AC12, B0 대비 새 실패 0건)
- check scripts: 모두 exit 0이어야 한다.
  - `node scripts/update-runtime-assets.mjs --check`
  - `node scripts/update-manifest.mjs --check`
  - `node tests/node/fixtures/installed-layout.mjs --diff`
- AC10 diff 검토: 기존 테스트 단언 변경이 아래 목록뿐인지 본다.
  - `role-bridge-args.test.mjs:99`
  - `role-routing-dispatch.test.mjs:84`의 Write 규칙
  - Scouter 2토큰
  - 쓰기 역할 env 항목
  - `baselineHash`·`expectedModules`

**2. 잠정 트리거 판정**

| 트리거 | 판정 | 근거 |
|---|---|---|
| (1) 공유 모듈 | 해당 | `role-bridge-args`, `role-supervisor`, `role-routing`, `role-dispatch-store`, `role-observe`, `command`, `bootstrap`와 그 `shared/skill/runtime/` 생성본 |
| (2) 외부 변경 통합 | 해당 없음 | — |
| (3) 의존성·런타임·빌드 설정 | 해당 없음 | 새 package 의존성이 없다. Playwright는 host 전역 설치본을 실행할 때 해석할 뿐이다 |
| (4) 공개 인터페이스 | 해당 | `prepare-dispatch` 입력 키 `toolAccess`, lease v3, record `toolAccess`, child env `ARC_*`, Codex·Claude argv |

- 대체 검사(SUB-1): 위 모듈을 import하는 테스트를 역의존성으로 찾는다. 위 계약 목록에 더해 `runtime-cli`, `runtime-installed-entry`, `role-bridge-support`, `role-bridge-observe-wait`, `role-supervisor-descendants`, `composite-live`(있으면 host)를 포함한다.
- 대체 검사(SUB-4): `toolAccess`, `validateLease`, `buildBridgeInvocation`, `buildClaudeArgs`, `buildCodexArgs`의 저장소 안 호출부에 닿는 테스트를 찾는다.
- 다만 AC12가 전체 suite를 요구하므로 Orchestrator host의 `npm test`가 이를 포함한다. 대체 검사는 보완 근거로 기록한다.

**3. 재확인이 필요한 파일 겹침**

| 파일 | 겹치는 task |
|---|---|
| `role-supervisor.mjs` | T1(`:283`), T2, T3, T5 |
| `role-bridge-args.mjs` | T3, T4, T5 |
| `tool-access.mjs` | T1, T2, T3, T4, T5 |
| `role-dispatch-policy.mjs` | T3, T4 |
| `role-routing-dispatch.test.mjs` | T1, T3, T4, T5 |
| `role-bridge-run.test.mjs` | T2–T5 |
| `runtime-versions.test.mjs`, `installed-layout-golden.json`, `MANIFEST.sha256` | 모든 runtime task |

**4. 최종 Reviewer (1회)**
- 시점: 위 1–3을 마치고 필수 Tester 재확인을 모두 마친 뒤
- 범위: 전체 변경
- 중점: R1 보호, 읽기 역할 불변, 비밀 렌더링, scratch·hostDir 경로 안전, 플랫폼 분기 금지, gate 값과 측정 근거의 일치
- finding 처리: Implementer → Reviewer 재확인. 수정은 미커밋 상태로 두었다가 해소 뒤 follow-up 커밋 1개로 만든다.

## Orchestrator 결정 (2026-11-24, plan 검토)

- O1 수용: `toolAccessReasons`(순수, spec 5.4의 1·2·3·5단계)와 `toolAccessPreflight`(IO, 4단계)로 나눈다. prepare와 `buildBridgeInvocation`은 두 함수를 같은 순서로 호출한다. 판정 의미는 spec과 같다.
- O2 수용: MI-2는 `CODEX_HOME=<scratch 복사본>`에서 측정한다. 실제 `~/.codex/config.toml`은 건드리지 않는다. spec 10.4와 MI-2 행의 충돌을 이 방법으로 해소하고, spec 8장 MI-2 행도 같이 고친다.
- O3 (사용자 결정 2026-11-24): AC9 live와 MI-8은 worktree의 `lib/runtime/cli.mjs`를 실제 home에서 직접 실행한다. 설치본은 갱신하지 않는다.
- O4 수용: MI-7에서 Claude Read 거부 규칙의 경로 형식(`//abs` 또는 `~/`)도 함께 확정한다. 확정 전에는 Claude domains를 conditional로 둔다.
- O5 수용(가정 유지): 라벨 `cooperative-9`는 유지하고 `baselineHash`만 갱신한다. 기존 버전 테스트가 다른 규칙을 요구하면 Implementer가 멈추고 보고한다.
- O6 수용: MI 결과로 gate 값이 바뀌면 Orchestrator가 spec 측정 결과 절을 개정한다. 개정본은 해당 task 커밋에 함께 넣는다.
- A3 확인: `git diff 6244a8af -- lib/runtime shared`가 비어 있다(2026-11-24).
