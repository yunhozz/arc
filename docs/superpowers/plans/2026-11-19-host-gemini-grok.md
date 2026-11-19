# Gemini/Grok composite host 허용 구현 계획 (Architectural, 4 task + 측정 2건)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

- 상태: v1 승인 2026-11-19T12:12:41Z (사용자 "승인")
- 작업 위치: `/Users/yunho/Desktop/project/arc`, 현재 checkout `fix/bridge-ps-stub` @ `2d0056b`(사용자 결정)
- Risk: high. 커밋하는 task마다 fresh QA를 둡니다. 모든 task를 수용한 뒤 최종 Reviewer가 전체 변경을 1회 검토합니다.

**Goal:** runtime이 `grok`/`gemini` host를 승인 모델(`'approval'`)로 처리하게 합니다. host일 때 bridge 앞에 target home 쓰기 probe를 둡니다. 기본 composite platforms는 claude/codex로 고정합니다. live 증거가 있으면 Grok host를 전환하고, Gemini는 증거가 있을 때만 전환합니다.

**Architecture:**
- host 게이트 판정은 `role-dispatch-policy.mjs`의 `hostGateReasons` 하나로 모읍니다. prepare와 `bridgeGateReasons`는 이 함수만 호출합니다.
- probe는 `role-routing.mjs`의 `probeHomeWritable`입니다. prepare, run-dispatch, resume이 host ∈ `HOST_SANDBOX_GATES`일 때만 호출합니다.
- 기본 platforms는 installer descriptor의 `defaultComposite`와 `lib/platforms/index.mjs`의 `defaultCompositePlatformIds`로 정합니다.
- 게이트 값과 registry 전환(T3/T4)은 측정 증거를 기록하는 커밋으로 분리합니다.

**Tech Stack:** Node.js ≥22 ESM, `node:test`, `node:fs`(`O_EXCL|O_NOFOLLOW`), `scripts/update-runtime-assets.mjs`, `scripts/update-manifest.mjs`, `scripts/update-role-policy.mjs`, `tests/node/fixtures/installed-layout.mjs`

**Spec:** `docs/superpowers/specs/2026-11-19-host-gemini-grok-design.md` v1, 2026-11-19T12:02:22Z 승인

## Global Constraints

- **절대 금지(spec §1)**
  - host sandbox 끄기를 의무로 만들지 않습니다. danger-full-access와 승인 우회 플래그도 쓰지 않습니다(Grok `--always-approve`/`--yolo`/`bypassPermissions`/`/auto`, Gemini `--yolo`/`--skip-trust`/`--allowed-tools`).
  - 사용자 설정을 수정하지 않습니다(`~/.grok/*`, `~/.gemini/*`, `~/.claude*`, `~/.codex/*`).
  - 생성물(`shared/skill/runtime/*`, 관리 섹션, `MANIFEST.sha256`, golden)은 손으로 고치지 않습니다.
  - bridge 실행 중에는 커밋하지 않습니다. push와 PR은 하지 않습니다.
- **값 고정**
  - `HOST_SANDBOX_GATES = {grok:'GK2', gemini:'GG2'}`, `HOST_GATE_ALLOWED = ['pass','approval']`(둘 다 frozen)
  - GK1, GG1, G1–G8, `v1Platforms`, `cli.supportedVersions`, `resume`/`watch`/`authProbe`는 바꾸지 않습니다.
  - `lib/policy/role-policy.json`은 바꾸지 않습니다. grok/gemini notice에 composite host 문구가 없음을 확인했습니다(`role-policy.json:451,455`).
  - 새 runtime 모듈과 새 reason code는 만들지 않습니다.
- **생성물 연쇄(D16).** 커밋하는 task마다 해당 항목을 모두 실행합니다.
  1. runtime을 바꾸면 `node scripts/update-runtime-assets.mjs`
  2. runtime을 바꾸면 `tests/node/runtime-versions.test.mjs:11` `baselineHash`를 새 `cooperativeVersions().runtimeHash`로 갱신합니다. 선행 plan에서 이 항목이 빠져 실패가 났습니다.
  3. `node scripts/update-role-policy.mjs --check`(이번 범위에서는 check만 합니다)
  4. `node scripts/update-manifest.mjs`
  5. `node tests/node/fixtures/installed-layout.mjs --diff`로 예상 항목만 바뀌었는지 확인한 뒤 `--write`
- **allowedPaths는 bridge prepare 때 고정되고 resume으로 늘릴 수 없습니다.** 그래서 task마다 수정할 수도 있는 파일을 모두 미리 적습니다. 목록 밖 파일을 고쳐야 하면 hold하고 plan을 개정합니다.
- **실행 규칙**
  - Python은 `PYTHONDONTWRITEBYTECODE=1`로 실행합니다.
  - 커밋 메시지는 `type(scope): 한국어 설명` 형식입니다. top-level task 하나는 focused commit 하나입니다.
  - B0, T2, T4 측정 단계는 커밋하지 않습니다.
- **bridge와 호스트의 실행 분담.** Codex bridge sandbox에서는 127.0.0.1 listen이 안 되고, fs.watch는 EMFILE이 나고, 셸 `rm -f`가 거부되고, `.git/arc`는 EPERM입니다.
  - bridge(Implementer/QA): 단위·통합 `node --test <파일들>`, 생성 스크립트, `--check`
  - 호스트(Orchestrator): 전체 `npm test`, PTY(`tui-app-pty`), upgrade-process, npm fixture, `cmp` 대조, allowedPaths 대조, live 측정
- `<SP>` = `/private/tmp/claude-501/-Users-yunho-Desktop-project-arc/a6c80567-99ca-4339-978e-ccd47802d047/scratchpad`

## Review Focus

| ID | 확인할 상황 | 기대 결과 | 담당 |
|---|---|---|---|
| RF1 | 주입 gates에 GK2 키가 없음(fallback 제거, D3) | `host_sandbox_blocked`. T3 뒤 기본 GK2가 `approval`이 되면 이 단언이 fallback과 실제로 구별됨 | T1a, T3 |
| RF2 | Codex/Claude host bridge에서 target home이 0o500 | probe를 호출하지 않으므로 결과가 기존과 같음 | T1a |
| RF3 | probe 생성 뒤 unlink 실패 | `host_sandbox_blocked` + `residualPaths`, lease와 starter 0 | T1a |
| RF4 | run-dispatch에서 probe 실패 | lease는 `reserved` 유지, starter 0, 이미 쓴 brief.md는 남음(spec 3.2 순서) | T1a |
| RF5 | 테스트 fixture `ZETA_INSTALLER`가 `...CLAUDE_INSTALLER`를 spread해 `defaultComposite:true`를 물려받음 | zeta 기본 포함이라는 기존 동작이 유지됨(의도한 결과). 플래그를 뺀 descriptor는 제외되는지 따로 확인 | T1b |
| RF6 | T3 뒤 운영 registry에서 grok host prepare | `capability_not_verified`/`host_sandbox_blocked`가 아니고, GK1 hold는 유지 | T3 |

---

## B0. Baseline 기록 (Orchestrator, 커밋 없음, 모든 task보다 먼저)

- [ ] HEAD `2d0056b`에서 호스트 전체 테스트를 실행합니다. 미커밋 파일은 spec과 plan뿐이어야 합니다.
  - `PYTHONDONTWRITEBYTECODE=1 npm test > <SP>/b0-host-full.txt 2>&1`
  - 실패한 테스트 이름 집합을 `B0-host`로 기록하고 tests/fail/skip 수도 남깁니다.
  - `<SP>/t0c-fails.txt`(52건)과 비교해 추가·해소된 이름을 기록합니다. 다르면 `B0-host`를 기준으로 삼고 차이를 보고합니다.
- [ ] 생성물 상태를 확인합니다. 기대는 exit 0이고 출력이 없는 것입니다. 다르면 baseline으로 기록합니다.
  - `node scripts/update-runtime-assets.mjs --check`
  - `node scripts/update-manifest.mjs --check`
  - `node scripts/update-role-policy.mjs --check`
  - `node tests/node/fixtures/installed-layout.mjs --diff`
- [ ] AC12 기준 해시를 읽기 전용으로 기록합니다. 없는 파일은 부재로 적습니다.
  - `shasum -a 256 ~/.grok/config.toml ~/.grok/sandbox.toml ~/.grok/auth.json ~/.gemini/settings.json ~/.claude/settings*.json ~/.codex/config.toml > <SP>/b0-ac12.txt 2>&1`
- [ ] (선택) Codex bridge QA가 같은 전체 실행을 해서 `B0-sandbox`를 기록합니다.

**QA 실패 분류 규칙 (모든 task의 QA에 적용, 선행 plan과 같음)**

- (a) `B0-host`에 있는 이름이면 baseline입니다.
- (b) `B0-sandbox`가 있고 그 안에 있는 이름이면 sandbox baseline입니다.
- (c) `B0-sandbox`가 없으면, 다음 세 조건을 모두 만족할 때만 sandbox baseline입니다.
  - 오류가 알려진 sandbox 제약 범주와 맞습니다. 범주는 `.git/arc` 쓰기 `EPERM`, runtime-claude/codex 관찰 이벤트 부재, `EMFILE`, 127.0.0.1 listen 실패이고, 근거는 `2026-11-19-bridge-ps-stub.md:164`의 14건입니다.
  - Orchestrator가 같은 리비전을 호스트에서 다시 실행하면 통과합니다.
  - 그 테스트 파일이 이번 task의 변경 파일이 아닙니다.
- (d) 그 밖은 현재 실패이고, 해당 task의 수용을 보류합니다.

QA 보고에는 출력 요약, 실패 목록, 분류 근거(메시지 발췌, 호스트 재실행 결과)를 넣습니다.

## D0. spec·plan 문서 커밋 (Orchestrator, plan 승인 직후, T1a보다 먼저)

선행 관례(`df55002`)를 따라 별도 docs 커밋으로 남깁니다.
- [ ] 실행 중인 dispatch가 없음을 확인합니다.
- [ ] `docs/superpowers/specs/2026-11-19-host-gemini-grok-design.md`와 `docs/superpowers/plans/2026-11-19-host-gemini-grok.md`만 stage합니다.
- [ ] 커밋 메시지: `docs(plan): Gemini·Grok composite host 허용 spec과 plan 추가`

---

### Task T1a: host 게이트 helper, target home probe, v1 회귀

**분할 이유:** spec §9의 T1을 T1a(runtime)와 T1b(installer 기본값)로 나눕니다.
- 두 변경은 서로 독립입니다. T1a는 runtime hash 연쇄를 거치고, T1b는 runtime이 아니라 installer 모듈만 고칩니다.
- 나누면 각 bridge의 allowedPaths가 작아지고 실패 원인을 분리할 수 있습니다.
- 생성물(MANIFEST, golden)이 겹치므로 순차로 진행합니다.

**목표:** D3, D4, D6, D7, D10을 구현합니다. compositeHost는 off, GK2/GG2는 `'fail'`로 둡니다.

**배정:** D3, D4, D6, D7, D10, D16, AC1, AC2(T1 값), AC3, AC4, AC5, AC7, AC11, AC13, E2, E4–E7, E11, RF1–RF4

**선행:** B0, D0

**allowedPaths:**
- runtime
  - `lib/runtime/role-dispatch-policy.mjs`, `shared/skill/runtime/role-dispatch-policy.mjs`
  - `lib/runtime/role-routing.mjs`, `shared/skill/runtime/role-routing.mjs`
  - `lib/runtime/role-bridge.mjs`, `shared/skill/runtime/role-bridge.mjs`
- 테스트
  - `tests/node/host-gemini-grok.test.mjs`(신규)
  - `tests/node/runtime-versions.test.mjs`
  - `tests/node/composite-instructions.test.mjs`
  - `tests/node/role-routing-dispatch.test.mjs`, `tests/node/grok-bridge.test.mjs`, `tests/node/gemini-bridge.test.mjs`: R8(fallback 제거)로 조정이 필요할 때만
  - `tests/node/role-fixtures.mjs`: `createRoutingFixture`를 grok/gemini host로 넓혀야 할 때만
- 문서
  - `claude/skill/references/coordination.md`, `codex/skill/references/coordination.md`, `gemini/skill/references/coordination.md`, `grok/skill/references/coordination.md`
  - `docs/harness-operation.md`
- 생성물: `tests/node/fixtures/installed-layout-golden.json`, `MANIFEST.sha256`

**Interfaces:**
- `role-dispatch-policy.mjs`
  - export `HOST_SANDBOX_GATES`, `HOST_GATE_ALLOWED`
  - `hostGateReasons({hostPlatform, policy = DEFAULT_POLICY}) → string[]`
  - `:2` 주석에 spec 3.1의 문장을 추가합니다.
- `role-routing.mjs`: `probeHomeWritable(home, {unlink = fs.unlink} = {}) → Promise<{ok:true} | {ok:false, code, residualPaths?}>`
  - 두 번째 인자는 unlink 실패를 주입하기 위한 테스트용 seam입니다(AC4).
- 호출 지점
  - prepare `:234-235`: `for (const code of hostGateReasons({hostPlatform: host, policy})) codes.add(code)`
  - prepare bridge 분기: limits 검사 다음, `bridgeGateReasons` 직전에 `if (Object.hasOwn(HOST_SANDBOX_GATES, host))`일 때 probe합니다. 대상은 `homes[requested.platform]`입니다. 실패하면 code를 추가하고 `residualPaths`를 result에 붙입니다.
  - `bridgeGateReasons` `:106-107`: `...hostGateReasons({hostPlatform, policy})`
  - `runBridgeDispatch`: brief를 쓴 다음, `starter` 호출 전(`:60` 앞)에 host가 대상일 때만 probe합니다. 실패하면 `result = blank(context, dispatchId, 'hold', code)`에 residual을 붙이고 return합니다. lease는 그대로 둡니다.
  - `resumeRoleDispatch`: `starter` 호출 직전(`:169` 앞)에 같은 방식으로 probe합니다.

- [ ] **Step 1 (RED): `tests/node/host-gemini-grok.test.mjs` 작성**
  - fixture: `grok-bridge.test.mjs`/`gemini-bridge.test.mjs`의 지역 `fixture`를 바탕으로 파일 안에 지역 `hostFixture(t, {host})`를 만듭니다. 내용은 임시 HOME, grok/gemini/claude/codex home, 주입 registry(grok·gemini `compositeHost` verified), `installFakeCli`로 만든 가짜 claude/codex, grok/gemini는 기존 fake입니다.
    - 공유 fixture를 고쳐야 할 때만 `role-fixtures.mjs`를 수정합니다.
  - 주입 policy: `approval = {...DEFAULT_POLICY, probeTimeoutMs: 1000, lockRetryMs: 300, gates: {...BRIDGE_GATE_RESULTS, GK2: 'approval', GG2: 'approval'}}`
  - AC1
    - `HOST_SANDBOX_GATES and HOST_GATE_ALLOWED are frozen with the spec values`: deepEqual `{grok:'GK2', gemini:'GG2'}`와 `['pass','approval']`, `Object.isFrozen` 둘 다 true
    - `hostGateReasons allows pass and approval for grok and gemini hosts`: 각 host × `['pass','approval']`에서 deepEqual `[]`
    - `hostGateReasons blocks fail, missing, escalation, wide and empty gate values`: 각 host × `['fail', undefined(키 삭제), 'escalation', 'wide', '']`에서 deepEqual `['host_sandbox_blocked']`
    - `hostGateReasons ignores claude and codex hosts for any gate value`: claude/codex × 위 값 전체에서 `[]`
    - `bridgeGateReasons host part matches prepare for every host gate input`
      - 표 = host(grok, gemini) × GK2/GG2 값 5종
      - `bridgeGateReasons({platform:'claude', role:'arc_scouter', hostPlatform, policy}).includes('host_sandbox_blocked')`가 `hostGateReasons(...).length > 0`과 같아야 합니다.
      - 같은 입력의 native prepare에서 `codes(result).includes('host_sandbox_blocked')`도 같은 값이어야 합니다.
    - `missing host gate key is fail-closed in prepare without DEFAULT fallback`: gates에서 GK2 키를 지우고 grok native prepare → `host_sandbox_blocked`. T1에서는 fallback과 구별되지 않고, T3 뒤에 구별됩니다(RF1).
  - AC3
    - `grok host with injected approval completes native and bridge lifecycles`
      - routing-status: `decision 'allow'`
      - native prepare: `allow`
      - observe `started`(nativeAgentId `'agent-1'`) → `routeStatus 'running'`, observe `completed` → `'completed'`
      - bridge prepare(claude `arc_scouter`, codex `arc_reviewer`) → run-dispatch → observe(waitMs) `completed` → resume `allow` → 별도 dispatch에서 cancel `cancelled`
    - `gemini host with injected approval completes native and bridge lifecycles`: 위와 같은 단언
    - `injected fail gates hold every grok and gemini host step without leases or children`
      - `GK2`/`GG2: 'fail'`이면 native/bridge prepare가 `host_sandbox_blocked`이고 `listLeases`는 `[]`, fake CLI record 파일 ENOENT입니다.
      - supervisor `buildBridgeInvocation`(fail policy)은 rejects `{reasonCode:'host_sandbox_blocked'}`
  - AC4
    - `probeHomeWritable creates and removes a probe file in a writable home`: `{ok:true}`, 이후 `readdir`에 `.arc-host-probe-` 접두 항목 0
    - `probeHomeWritable maps a read-only home to host_sandbox_blocked`: `chmod 0o500` → `{ok:false, code:'host_sandbox_blocked'}`, `t.after`에서 0o700으로 복구, `process.getuid?.() === 0`이면 skip하고 사유 출력
    - `probeHomeWritable maps a missing home to activation_unverified`: 존재하지 않는 경로 → `code:'activation_unverified'`
    - `probeHomeWritable reports residualPaths when unlink fails`: `unlink`가 EPERM으로 reject → `code:'host_sandbox_blocked'`, `residualPaths.length === 1`, 그 경로가 존재(테스트가 정리)
    - for host of [grok, gemini]
      - `${host} host bridge prepare holds host_sandbox_blocked on a read-only target home`: claude home 0o500 → decision `hold`, codes에 `host_sandbox_blocked`, lease 수 변화 0, target에 `.arc-host-probe-*` 0, anchor에 `arc-role-platform-routing.lock` 없음
      - `${host} host run-dispatch holds without starting the supervisor on a read-only target home`: reserve 뒤 chmod → `host_sandbox_blocked`, `startSupervisor` 스파이 0회, `readLease(...).state === 'reserved'`, probe 파일과 lock 없음
      - `${host} host resume holds without starting the supervisor on a read-only target home`: completed lease를 만든 뒤 chmod → `host_sandbox_blocked`, 스파이 0회, lease deepEqual 이전 값
    - `codex and claude host bridges do not probe the target home`: Codex host(claude bridge, `G2:'pass'` 주입)와 Claude host(codex bridge)에서 target home을 0o500으로 막아도 prepare/run 결과의 reasons에 `host_sandbox_blocked`가 새로 생기지 않고, probe 파일이 없음
  - AC5: `read-only anchor home blocks grok and gemini host commands without lock or lease`. anchor(claude home) 0o500 → routing-status, prepare, run-dispatch, cancel이 모두 codes `['host_sandbox_blocked']`이고 lock 없음, lease 0
  - AC7
    - `v1 leases reject grok and gemini hosts`: `leaseTargetPlatform({version:1, hostPlatform:h, route:'bridge'})`가 throws `/Invalid composite profile/`
    - `v1 configs reject grok platforms`: `parseRoleRoutingConfig`에 `version:1`, platforms에 grok → throws
    - `v1Platforms stay codex and claude`: `role-bridge.mjs`와 `role-routing-config.mjs` 소스에 `v1Platforms = Object.freeze(['codex', 'claude'])` 문자열이 포함됨
- [ ] **Step 2 (RED): 문서 단언**
  - `composite-instructions.test.mjs`에 새 테스트 `every harness states the same host home probe rule`을 추가합니다. coordination 4종에서 아래 줄이 정확히 같아야 합니다(`:86-94` 방식).
    - `- On a Grok or Gemini host, bridge \`prepare-dispatch\`, \`run-dispatch\` and \`resume\` first check that the target platform home is writable: a denied write is \`host_sandbox_blocked\`, a missing home is \`activation_unverified\`, and a probe file that cannot be removed is reported in \`residualPaths\`.`
- [ ] **Step 3: RED 확인 (bridge)**
  - `node --test tests/node/host-gemini-grok.test.mjs tests/node/composite-instructions.test.mjs`
  - 기대: import 실패나 새 단언 FAIL
- [ ] **Step 4 (GREEN): 구현.** 위 Interfaces 순서대로 합니다.
  - probe 구현
    - `fs.open(path.join(home, '.arc-host-probe-' + crypto.randomUUID()), constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW, 0o600)` → close → unlink
    - open의 `EPERM`/`EACCES`/`EROFS`는 `host_sandbox_blocked`, 그 밖의 오류는 `activation_unverified`
    - unlink 실패는 `host_sandbox_blocked` + `residualPaths:[file]`
  - prepare probe는 capability 단계에서 return한 경우가 아니면 codes가 있어도 실행합니다.
  - prepare의 `DEFAULT_POLICY.gates.GK2` fallback 두 줄은 삭제합니다.
- [ ] **Step 5: 문서**
  - coordination 4종의 Composite 절, `:145` 줄 다음에 Step 2 문장을 넣습니다.
  - claude와 codex 절은 `the two harness sections state the same rules`(`:80`) 때문에 서로 같아야 합니다.
  - `docs/harness-operation.md` Bridge contract 표의 Detection 행 다음에 `| Host home probe | Grok/Gemini host only: bridge prepare/run/resume create and remove one probe file in the target home first; denied → \`host_sandbox_blocked\`, missing → \`activation_unverified\`, unremovable → \`residualPaths\`. Subpath-only denials are not detected |`를 추가합니다.
- [ ] **Step 6: 생성물(D16 1–5)**
  - `update-runtime-assets` → `baselineHash` 갱신(`node -e "import('./lib/runtime/bootstrap.mjs').then(async m=>console.log((await m.cooperativeVersions()).runtimeHash))"`) → `update-role-policy --check` → `update-manifest` → golden `--diff`
  - golden diff에는 runtime 3개와 coordination 4종만 나와야 합니다. 확인한 뒤 `--write`합니다.
- [ ] **Step 7: GREEN 확인 (bridge, Implementer)**
  - `node --test tests/node/host-gemini-grok.test.mjs tests/node/role-routing-dispatch.test.mjs tests/node/role-bridge-run.test.mjs tests/node/role-bridge-resume.test.mjs tests/node/grok-bridge.test.mjs tests/node/gemini-bridge.test.mjs tests/node/grok-composite.test.mjs tests/node/gemini-composite.test.mjs tests/node/dispatch-lease-v2.test.mjs tests/node/composite-instructions.test.mjs tests/node/runtime-versions.test.mjs tests/node/runtime-assets.test.mjs tests/node/installed-layout-golden.test.mjs`
  - `update-runtime-assets --check`, `update-manifest --check`, `update-role-policy --check`
  - 기대: 모두 PASS, `BRIDGE_GATE_RESULTS` 불변(`role-routing-dispatch.test.mjs:25`)
  - 범위 밖 실패는 고치지 않고 보고합니다.
- [ ] **Step 8: 호스트 검증 (Orchestrator)**
  - `cmp lib/runtime/<3개> shared/skill/runtime/<3개>`
  - 전체 `PYTHONDONTWRITEBYTECODE=1 npm test`를 B0와 비교해 새 실패가 0건인지 확인합니다.
  - `node tests/node/fixtures/installed-layout.mjs --diff` 출력이 없어야 합니다.
  - `git diff --name-only`가 allowedPaths 안에 있어야 합니다.
  - `grep -n "DEFAULT_POLICY.gates.G[KG]2" lib/runtime/role-routing.mjs` 결과가 0건이어야 합니다.
- [ ] **Step 9: fresh QA (Codex bridge)**: Step 7 명령, `--check` 3종, B0 규칙에 따른 분류. AC4 chmod 복구(테스트 뒤 임시 디렉터리가 모두 정리됐는지)를 증거로 남깁니다.
- [ ] **Step 10: 수용과 커밋**
  - 실행 중인 dispatch가 없음을 확인합니다.
  - `feat(runtime): Grok·Gemini host 게이트 helper와 target home probe 추가`

**수용 기준:** AC1, AC2(T1 값), AC3, AC4, AC5, AC7, AC11, AC13, RF1–RF4

**Hold:**
- Codex/Claude host 기존 테스트(`role-bridge-run`, `role-bridge-resume`, `role-routing-dispatch`)를 고쳐야 통과하는 경우. R4 위반이므로 수정하지 않고 보고합니다.
- `role-supervisor.mjs`를 고쳐야 하는 경우
- golden diff에 예상 밖 항목이 있는 경우
- allowedPaths 밖 파일이 필요한 경우

---

### Task T1b: 기본 composite platforms 분리

**목표:** D8. 기본 platforms를 `defaultComposite && compositeHost verified`로 정합니다. 동작은 바뀌지 않습니다(claude/codex).

**배정:** D8, D9(availability 불변 확인), AC6(T1 시점), AC11, AC13, RF5

**선행:** T1a 수용과 커밋(생성물이 겹침)

**allowedPaths:**
- `lib/platforms/claude.mjs`, `lib/platforms/codex.mjs`, `lib/platforms/index.mjs`
- `lib/installer/role-routing.mjs`, `lib/management/operations.mjs`
- `tests/node/host-gemini-grok.test.mjs`
- `tests/node/management-operations.test.mjs`, `tests/node/install-mode-n-platform.test.mjs`: 기존 단언이 깨질 때만
- `MANIFEST.sha256`, `tests/node/fixtures/installed-layout-golden.json`: `--check`/`--diff`가 차이를 보일 때만

**Interfaces:**
- `CLAUDE_INSTALLER`, `CODEX_INSTALLER`에 `defaultComposite: true`를 넣습니다. gemini/grok에는 넣지 않습니다.
- `export function defaultCompositePlatformIds(registry = DEFAULT_INSTALLER_REGISTRY)`: `registry.byAnchorOrder().filter(d => d.defaultComposite === true && d.runtime.capabilities.compositeHost.state === 'verified').map(d => d.runtime.id)`
- `lib/installer/role-routing.mjs:43` `defaultCompositePlatforms = context => defaultCompositePlatformIds(installerRegistryOf(context))`
- `lib/management/operations.mjs:82`: 마지막 fallback 식을 `defaultCompositePlatformIds(registry)`로 바꿉니다. `options.platforms`와 `mode.platforms`의 우선순위는 그대로 둡니다.

- [ ] **Step 1 (RED): `host-gemini-grok.test.mjs`에 추가**
  - `defaultCompositePlatformIds returns claude and codex for the default registry`: deepEqual `['claude','codex']`
  - `defaultCompositePlatformIds requires defaultComposite and a verified compositeHost`: 주입 registry(`createInstallerRegistry`)
    - grok `compositeHost` verified, 플래그 없음 → 제외
    - claude 플래그 있음 + `compositeHost` off → 제외
    - zeta fixture(`createTestRegistries()`)는 상속한 플래그 때문에 포함(RF5). `{...ZETA_INSTALLER, defaultComposite: undefined}`로 바꾸면 제외
  - `prepareCompositeOperation without platforms uses claude and codex plus role platforms`: `compositeContext` + `mixedConfig` → 결과 config platforms가 `['claude','codex']`
  - `explicit grok platforms are rejected before Grok host promotion`: `prepareOperation(ctx, {kind:'install', target:'composite', platforms:['claude','codex','grok'], config})` rejects `/Grok is not available: capability not verified/`
- [ ] **Step 2: RED 확인 (bridge)**: `node --test tests/node/host-gemini-grok.test.mjs`. 기대는 helper가 없어서 FAIL입니다.
- [ ] **Step 3 (GREEN): 구현**
- [ ] **Step 4: 생성물**
  - `update-manifest --check`가 실패할 때만 `update-manifest`
  - golden `--diff`에 출력이 있을 때만 확인 뒤 `--write`(installer 모듈은 설치 산출물이 아니므로 차이가 없을 것으로 봅니다)
  - runtime hash는 바뀌지 않아야 합니다(`runtime-versions.test.mjs` 무수정 통과).
- [ ] **Step 5: GREEN 확인 (bridge)**
  - `node --test tests/node/host-gemini-grok.test.mjs tests/node/management-operations.test.mjs tests/node/install-mode.test.mjs tests/node/install-mode-n-platform.test.mjs tests/node/install-mode-models-upgrade.test.mjs tests/node/capability-surfaces.test.mjs tests/node/platform-availability.test.mjs tests/node/platform-registry.test.mjs tests/node/grok-platform.test.mjs tests/node/gemini-platform.test.mjs tests/node/runtime-versions.test.mjs`
  - `--check` 3종
  - 이 테스트들은 `build/native` safe-fs가 필요합니다. bridge에서 로드에 실패하면 sandbox baseline으로 분류하지 말고 호스트 재실행 결과로 판정합니다.
- [ ] **Step 6: 호스트 검증 (Orchestrator)**
  - 전체 `npm test`를 B0와 비교합니다(PTY와 upgrade-process 포함).
  - allowedPaths를 대조합니다.
  - `grep -n "compositeHost.state==='verified'" lib/installer/role-routing.mjs lib/management/operations.mjs` 결과가 0건이어야 합니다.
- [ ] **Step 7: fresh QA**: B0 규칙으로 분류합니다.
- [ ] **Step 8: 수용과 커밋**: `refactor(installer): 기본 composite platforms를 defaultComposite 필드로 분리`

**수용 기준:** AC6(T1 시점), AC11, AC13, RF5

**Hold:** 기존 installer 테스트의 기본값 기대가 바뀌는 경우. 동작 변화이므로 보고합니다.

---

## T2. Grok live 측정 (Orchestrator 준비, 사용자 TUI 조작, 커밋 없음)

**선행:** T1b 수용과 커밋. `<T1b>`는 그 커밋 해시입니다.
**배정:** spec §6.1–6.3, AC12, D13, D14, M-H1/H2/H3/H5/H6
**원칙:** 저장소 checkout과 실제 HOME에는 쓰지 않습니다. `GROK_HOME`은 설정하지 않습니다. `git worktree`는 쓰지 않습니다.

- [ ] **S1 AC12 기준**
  - `shasum -a 256 ~/.grok/config.toml ~/.grok/sandbox.toml ~/.grok/auth.json ~/.gemini/settings.json ~/.claude/settings*.json ~/.codex/config.toml > <SP>/t2/ac12-before.txt 2>&1`
  - B0 값과 같아야 합니다.
- [ ] **S2 측정 사본(파일 복사)**
  - `mkdir -p <SP>/t2/copy && git -C /Users/yunho/Desktop/project/arc archive <T1b> | tar -x -C <SP>/t2/copy`
  - `prebuilds/`는 추적 파일이라 archive에 들어 있습니다. `build/` 복사는 필요 없습니다.
- [ ] **S3 사본 로컬 수정(사본에서만)**
  - `<SP>/t2/copy/lib/runtime/platform-registry.mjs:141`: grok `compositeHost`를 `{state:'verified'}`로 바꿉니다.
  - `<SP>/t2/copy/lib/runtime/role-dispatch-policy.mjs:3`: `GK2: 'approval'`로 바꿉니다. 이 수정이 없으면 모든 grok host prepare가 `host_sandbox_blocked`가 되어 M-H1을 측정할 수 없습니다. (Orchestrator 결정 1)
  - 사본에서 `node scripts/update-runtime-assets.mjs --root <SP>/t2/copy`(또는 cwd=사본)와 `node scripts/update-manifest.mjs`를 실행합니다. installer `verifyPayload`가 MANIFEST를 검사하기 때문입니다.
  - **T3 영향 dry-run:** 사본에서 `PYTHONDONTWRITEBYTECODE=1 npm test > <SP>/t2/copy-full.txt 2>&1`을 실행합니다. B0보다 늘어난 실패 이름이 T3에서 고쳐야 할 테스트 후보입니다. T3 allowedPaths를 확정하는 데 씁니다.
- [ ] **S4 임시 HOME, 저장소, 가짜 CLI**
  - `TMPH=<SP>/t2/home`, `REPO=<SP>/t2/repo`, `FAKE=<SP>/t2/fakebin`
  - `mkdir -p $TMPH $REPO && git -C $REPO init -q && git -C $REPO -c user.email=t@example.com -c user.name=t commit -q --allow-empty -m init`
  - 가짜 claude/codex는 기존 헬퍼 `installFakeCli`(`tests/node/role-fixtures.mjs:163`)를 재사용합니다. 이 fake는 `auth status`/`login status`, codex `app-server` auth probe, `--version`, `delayMs` sleep, `-o` result 쓰기에 응답합니다.
    - `<SP>/t2/make-fakebin.mjs`:
      `import {installFakeCli} from '<SP>/t2/copy/tests/node/role-fixtures.mjs'; for (const p of ['claude','codex']) await installFakeCli(null, '<SP>/t2/fakebin/.impl', p, {delayMs: 2000, outputFile: 'fake result\n'});`
      (`t`는 사용하지 않는 인자입니다)
    - scenario는 env(`ARC_FAKE_CLI_SCENARIO_<P>`)로만 찾습니다. supervisor child env를 거쳐도 전달되도록 wrapper가 env를 고정합니다.
      - `$FAKE/claude`: `#!/bin/sh\nARC_FAKE_CLI_SCENARIO_CLAUDE=<SP>/t2/fakebin/.impl/.scenario-claude.json exec <SP>/t2/fakebin/.impl/claude "$@"`
      - `$FAKE/codex`도 같은 방식으로 만들고 `chmod 0755`합니다.
    - M-H3 전에 `.scenario-*.json`의 `delayMs`를 `120000`으로 바꿉니다(매 호출마다 다시 읽습니다).
    - `host-bridge-child`는 unverified이므로 fake child 결과가 `completed`가 아니어도(예: `invalid_output`) M-H1 판정에는 영향이 없습니다. 기록만 합니다.
- [ ] **S5 설치(installer CLI는 대화형 TUI만 있으므로 API 스크립트로 설치)**
  - `<SP>/t2/install.mjs`
    - import: `<SP>/t2/copy/lib/safe-fs/index.mjs`(`openRoot`), `native.mjs`(`loadNative`), `lib/management/operations.mjs`, `lib/models/static-catalog.mjs`
    - `safeFs = {openRoot: p => openRoot(p, {native: loadNative({root: COPY})})}`
    - `ctx = {packageRoot: COPY, userHome: TMPH, cwd: REPO, env: {PATH: \`${FAKE}:${dirname(realGrok)}:/usr/bin:/bin\`}, safeFs}`
    - config `{version:2, revision:'t2-grok-1', platforms:['claude','codex','grok'], roles:{arc_planner:grok, arc_reviewer:grok, arc_scouter:claude, arc_qa:codex, arc_implementer:codex}}`
      - grok pair는 `{model:'grok-4.6', effort:'default'}`
      - claude/codex pair는 `loadStaticModelCatalog(p).catalog.pairs[0]`
    - `const plan = await api.prepareOperation(ctx, {kind:'install', target:'composite', platforms:['claude','codex','grok'], config}); console.log(JSON.stringify(await api.executeOperation(ctx, plan)))`
  - 실행: `env -u GROK_HOME -u CODEX_HOME -u CLAUDE_CONFIG_DIR HOME=$TMPH node <SP>/t2/install.mjs`
  - code 0이 아니면 중단하고 보고합니다(대체 경로 없음).
  - 설치 뒤 `$TMPH/.claude/arc-role-platform-routing.json`(anchor)과 `$TMPH/.grok/agents/arc-routing-*.md`를 확인합니다.
- [ ] **S6 사용자 인증(사용자 실행)**
  - `cd $REPO && env -u GROK_HOME HOME=$TMPH grok login`
  - 또는 `XAI_API_KEY`를 쓰는 세션입니다. `auth.json`은 복사하지 않습니다.
- [ ] **S7 측정(사용자 TUI 조작, Orchestrator가 지시와 기록)**
  - 공통 시작: `cd $REPO && env -u GROK_HOME HOME=$TMPH PATH=$FAKE:$PATH grok --permission-mode default`
  - M-H1: host 세션에서 runtime 명령을 차례로 실행합니다. `routing-status`, `prepare-dispatch`(native `arc_planner`), `prepare-dispatch`(bridge `arc_scouter`), `run-dispatch`, `observe`(`waitMs` 540000), `cancel`(별도 reserve)
    - 기록: 명령마다 승인 프롬프트가 나왔는지, exit/JSON, `ls -la $TMPH/.claude/arc-role-dispatch`, lock 잔존, shell 도구 안의 `env | grep -E '^(HOME|GROK_HOME|ARC_RUNTIME_ENTRY)='`
  - M-H2: `$TMPH`가 `/private/tmp` 아래에 있으므로 built-in `workspace` 프로필로 실행하면 쓰기가 허용됩니다. 그래서 차단 상황은 사용자 정의 프로필로 만듭니다. 프로필은 `$REPO/.grok/sandbox.toml`에만 두고 `~/.grok/sandbox.toml`은 건드리지 않습니다. 문법은 `18-sandbox.md:132-199`를 따릅니다.
    - anchor 차단: `[profiles.arc-t2-anchor]`에 `extends = "workspace"`, `deny = ["<TMPH 절대경로>/.claude"]`를 둡니다. `grok --sandbox arc-t2-anchor --permission-mode default`로 M-H1을 다시 실행합니다.
      - 기대: 모든 명령이 `host_sandbox_blocked`이고, lease, lock, `.arc-host-probe-*` 가운데 남는 것이 없습니다.
      - `$TMPH/.grok/sessions/sandbox-events.jsonl`에 `ProfileApplied`(`enforced:true`)가 기록됐는지 확인합니다.
    - target만 차단: `[profiles.arc-t2-target]`에 `deny = ["<TMPH 절대경로>/.codex"]`를 둡니다. anchor인 `$TMPH/.claude`는 쓸 수 있습니다. codex `arc_qa` bridge에서 E4/E5를 확인합니다.
    - 참고 측정: built-in `workspace`만 썼을 때의 결과도 기록합니다. 차단되지 않을 것으로 예상하며, R3 한계로 기록합니다.
  - M-H3: delay 120000으로 `run-dispatch`를 실행합니다. 별도 터미널에서 `ps -o pid,ppid,command -p <supervisor pid>`와 `stat -f %m <anchor>/arc-role-dispatch/<id>.heartbeat`(실제 파일명은 측정 시 확인)를 (a) 도구 반환 뒤 (b) 턴 종료 뒤 (c) 도구 timeout 뒤 (d) 세션 종료 뒤에 기록합니다.
  - M-H5: 에이전트 목록이나 `spawn_subagent` enum에 `arc-routing-planner`가 있는지, `[arc-routing rev t2-grok-1]`이 보이는 위치, 반환된 id 형식(≤256 TEXT), transcript model 표시, child에서 `spawn_subagent`를 쓸 수 있는지 확인합니다.
  - M-H6
    - default 모드에서 `node "$ARC_RUNTIME_ENTRY"`가 자동 실행되지 않는지 확인합니다.
    - "항상 허용"류를 **임시 HOME에서만** 한 번 선택하고, `find $TMPH/.grok -newer <S6 시점 marker>`와 파일 diff로 저장되는지 확인합니다.
  - 측정이 끝나면 남은 dispatch를 모두 `cancel`하고, supervisor PID가 없는지 확인합니다.
- [ ] **S8 결과 파일** `<SP>/t2/l-h-results.md`
  - 머리말
    - `grok --version`(1.0.89)
    - 측정일(UTC)
    - `<T1b>`와 사본 수정 diff(`diff -ru` 두 파일)
    - TMPH/REPO 경로
    - AC12 before/after 결과
  - 표: `| 항목 | 계약 id | 조작/명령 | 관측(exit·JSON 발췌·파일·프로세스) | 판정(pass/fail/unmeasurable) | §6.3 분기 |`
  - 끝에 계약 id 5개의 판정(verified/unverified)과 근거, `native-model-application` 판정, 문서에 들어갈 문구(M-H5 확인 방법, M-H6 "항상 허용" 문구, M-H3 조건부 문구)
- [ ] **S9 AC12 사후**
  - S1 명령 → `<SP>/t2/ac12-after.txt`
  - `diff <SP>/t2/ac12-before.txt <SP>/t2/ac12-after.txt` 출력이 없어야 합니다.
- [ ] **S10 판정 (Orchestrator → 사용자)**: §6.3 표에 따라 분기합니다.
  - "T3 진행"이면 결과 경로와 확정 문구를 T3 brief에 넣습니다.
  - hold 분기이면 T3을 시작하지 않고 사용자 결정을 받습니다.

**Hold:** §6.3의 hold 행, AC12 불일치, 설치 실패, 실제 HOME에 쓴 흔적

---

### Task T3: Grok composite host 전환

**목표:** grok `compositeHost` verified와 `GK2:'approval'`을 한 커밋에 원자적으로 기록합니다(D5). 문서와 증거 테스트도 함께 바꿉니다.

**배정:** D1, D2, D5, D9, D11, D12, spec 3.4, AC2(T3), AC6(T3), AC8, AC9, AC10, AC11, AC13, AC14, RF1(판별), RF6

**선행:** T2 S10이 "T3 진행"일 것. T2 S3 dry-run으로 영향 목록을 확정할 것.

**allowedPaths:** dry-run 결과로 늘어날 때만 plan을 개정합니다.
- runtime
  - `lib/runtime/platform-registry.mjs`, `shared/skill/runtime/platform-registry.mjs`
  - `lib/runtime/role-dispatch-policy.mjs`, `shared/skill/runtime/role-dispatch-policy.mjs`
- 테스트
  - `tests/node/host-gemini-grok.test.mjs`
  - `tests/node/grok-capability-evidence.test.mjs`
  - `tests/node/grok-platform.test.mjs`(`:69-76` AC-K2)
  - `tests/node/grok-bridge.test.mjs`(`:220-228`, `:274`, `:295-307`)
  - `tests/node/grok-composite.test.mjs`(AC8 추가가 필요할 때)
  - `tests/node/role-routing-dispatch.test.mjs`(`:25`)
  - `tests/node/composite-instructions.test.mjs`
  - `tests/node/runtime-versions.test.mjs`
  - 후보(dry-run에서 깨지면 추가): `tests/node/tui-app-pty.test.mjs`, `tests/node/tui-app.test.mjs`, `tests/node/capability-surfaces.test.mjs`
- 문서: coordination 4종, `docs/harness-operation.md`
- 생성물: golden, `MANIFEST.sha256`
- Orchestrator 소유(Implementer allowedPaths 아님): spec §10 갱신. T3 커밋에 함께 넣습니다.

- [ ] **Step 1 (RED): 테스트**
  - `role-routing-dispatch.test.mjs:25`: `GK2: 'approval'`로 바꾸고 나머지는 그대로 둡니다.
  - `grok-capability-evidence.test.mjs`
    - `verifyEvidence`: verified를 `['install','nativeProfile','catalog','standalone','bridge','compositeRole','compositeHost']`로, off를 `{authProbe, watch}`로 바꿉니다.
    - `:30` 제목과 키를 `injected verified authProbe or watch fails evidence` / `['authProbe','watch']`로 바꿉니다.
    - 새 `HOST_CONTRACTS`(id 순서 `host-runtime-approval`, `host-sandbox-fail-closed`, `host-supervisor-survival`, `host-native-spawn`, `host-bridge-child`, 각 `{id, state, evidence}`, `host-bridge-child`는 `unverified`)와 테스트 `Grok host contracts record five ids in fixed order`를 추가합니다.
    - `UNVERIFIED_CONTRACTS`에 T2에서 unverified로 판정된 host id를 더하고, `:39-42` 길이와 목록 단언을 맞춥니다. M-H5에서 model 적용이 확인되면 `native-model-application`을 뺍니다.
    - `:59-64`는 제목 `Grok GK1 fail, GK2 approval and resume off`, 단언 `GK1 'fail'`, `GK2 'approval'`, `resume 'off'`입니다.
  - `grok-platform.test.mjs:69-76`: `compositeHost`를 verified 목록으로 옮깁니다.
  - `grok-bridge.test.mjs`
    - `:220-228`: `policy`를 `{...policy, gates: {...policy.gates, GK2: 'fail'}}`로 주입해 hold 의도를 유지합니다. `:227`은 fail 주입 단언과 기본 policy에서 `[]`라는 단언 두 개로 나눕니다.
    - `:274`: fail policy를 주입합니다.
    - `:295-307`: `grokOffRegistries().runtimePlatforms`로 바꿔 기존 `capability_not_verified` 의도를 유지합니다. 새 테스트 `operational Grok hosts pass capability and GK2 gates`를 추가합니다. 운영 registry에서 codes에 `capability_not_verified`와 `host_sandbox_blocked`가 없어야 하고, allow이면 cancel로 정리합니다.
  - `host-gemini-grok.test.mjs`
    - `BRIDGE_GATE_RESULTS records GK2 approval after Grok promotion`: GK2 `approval`, GK1/GG1/GG2 `fail`
    - `missing host gate key is fail-closed …`: 이제 fallback과 구별됩니다(RF1).
    - AC6: `explicit grok platforms include Grok as host after promotion`(T1b의 거부 테스트를 바꿈. plan 결과 platforms에 grok, anchor는 claude), `defaultCompositePlatformIds still returns claude and codex after Grok promotion`
    - AC8: `default policy keeps cross GK1 and GG1 holds for grok and gemini hosts`
      - Grok host + Gemini `arc_qa` bridge → `permission_scope_unverified`
      - 주입 compositeHost의 Gemini host + Grok `arc_implementer`(allowedPaths `['src/']`) → `permission_scope_unverified`
      - 두 경우 모두 lease 0
  - `composite-instructions.test.mjs`
    - 새 테스트 `every harness states the same Grok host approval obligation`: 아래 문장(초안, M-H6 결과로 확정)이 4개 파일에서 정확히 같아야 합니다.
      - `- On a Grok host start the session with \`grok --permission-mode default\` (ask), keep the platform-default sandbox off, and ask the user for approval each time any runtime command (\`routing-status\`, \`prepare-dispatch\`, \`run-dispatch\`, \`observe\`, \`resume\`, \`cancel\`) runs; NEVER use auto-review, \`--always-approve\` or \`--yolo\`, and DO NOT choose an approval option that is saved to settings. The runtime does not check this approval; asking for it is an Orchestrator obligation. A host whose sandbox is on, or a denied write, is \`host_sandbox_blocked\`.`
    - host 목록 단언: Composite 절에 `` `grok-cli` ``가 포함됨
- [ ] **Step 2: RED 확인 (bridge)**
  - `node --test tests/node/grok-capability-evidence.test.mjs tests/node/grok-platform.test.mjs tests/node/grok-bridge.test.mjs tests/node/role-routing-dispatch.test.mjs tests/node/host-gemini-grok.test.mjs tests/node/composite-instructions.test.mjs`
- [ ] **Step 3 (GREEN)**
  - `platform-registry.mjs:141` grok `compositeHost: {state:'verified'}`
  - `role-dispatch-policy.mjs:3` `GK2: 'approval'`
  - `:2` 주석에 측정 근거를 한 줄로 적습니다(Grok 1.0.89, 측정일, ask 모드, sandbox off).
- [ ] **Step 4: 문서**(T2 확정 문구 사용)
  - coordination 4종
    - `:119` host 목록 `` `codex`, `claude` or `grok` ``, env 목록에 `` `grok-cli` ``
    - `:121` Desktop 규칙은 codex/claude 한정이라고 명시
    - `:127` Grok host native spawn(`spawn_subagent` `subagent_type: "arc-routing-<suffix>"`, revision tag 확인 위치, `nativeAgentId` 출처)
    - `:145` 다음에 Step 1 의무 문장
    - `:61`, `:77`, `:149`의 unverified 문구를 M-H5 결과에 맞게 수정
    - M-H5에서 재spawn이 가능하면 "native role restrictions remain prompt-level contracts" 한계 문장을 넣고, M-H3이 조건부이면 그 문구도 넣습니다.
    - claude와 codex 절은 서로 같아야 합니다.
  - `docs/harness-operation.md`
    - `:81-83` 표에 `grok-cli` 행(native roles와 Claude/Codex bridges, 호출마다 승인, sandbox가 켜진 host는 `host_sandbox_blocked`)과 `gemini-cli` 행(`held: GG2 fail, compositeHost off`)
    - 계약 표에 `GK2 approval` 행과 `GG2 fail` 행
- [ ] **Step 5: 생성물(D16 1–5)**: `update-runtime-assets` → `baselineHash` → `update-role-policy --check` → `update-manifest` → golden `--diff`(runtime 2개와 coordination 4종만) → `--write`
- [ ] **Step 6: GREEN 확인 (bridge)**: Step 2 명령에 `grok-composite`, `gemini-bridge`, `gemini-composite`, `runtime-versions`, `runtime-assets`, `installed-layout-golden`, `platform-availability`, `capability-surfaces`, `management-operations`를 더하고 `--check` 3종을 실행합니다.
- [ ] **Step 7: 호스트 검증 (Orchestrator)**
  - `cmp` 2쌍
  - 전체 `npm test`(PTY 포함)를 B0와 비교해 새 실패 0건
  - golden `--diff` 출력 없음
  - allowedPaths 대조
  - TUI Hosts에서 Grok이 선택 가능한지 PTY 출력으로 확인(D9)
- [ ] **Step 8: spec §10 갱신 (Orchestrator)**: 측정 버전, 날짜, `<SP>/t2/l-h-results.md`, 계약 id 판정
- [ ] **Step 9: fresh QA**: B0 규칙으로 분류하고 AC8 hold 증거를 남깁니다.
- [ ] **Step 10: 수용과 커밋**
  - 실행 중인 dispatch가 없음을 확인합니다.
  - 제목: `feat(runtime): Grok composite host 전환과 GK2 approval 기록`
  - 본문(AC14): `측정: grok 1.0.89, <YYYY-MM-DD>, <SP>/t2/l-h-results.md` 한 줄과 계약 id별 판정 5줄
  - spec 문서 변경도 이 커밋에 넣습니다.

**수용 기준:** AC2(T3), AC6(T3), AC8, AC9, AC10(Grok), AC11, AC13, AC14, RF6

**Hold:** dry-run 밖의 새 실패, golden 예상 밖 항목, 문서 문구가 T2 확정 문구와 다른 경우

---

### Task T4: Gemini 조건부 (측정 → 통과 시에만 전환)

**선행:** T3 수용과 커밋

- [ ] **T4-M 측정 (커밋 없음)**: T2와 같은 절차를 `<SP>/t4/`에서 진행합니다. 사본은 `<T3>`에서 만듭니다. 차이점은 다음과 같습니다.
  - 사본 수정: `platform-registry.mjs:123` gemini `compositeHost` verified, `GG2: 'approval'`
  - 설치 platforms `['claude','codex','gemini']`. planner와 reviewer는 gemini, gemini pair는 `loadStaticModelCatalog('gemini')`에서 가져옵니다.
  - 임시 HOME 설정: `$TMPH-g/.gemini/settings.json`에 `selectedType: gemini-api-key`를 둡니다.
  - 사용자 실행: `cd $REPO && env -u GEMINI_CLI_HOME HOME=$TMPH-g PATH=$FAKE:$PATH GEMINI_API_KEY=<사용자 입력> GEMINI_CLI_TRUST_WORKSPACE=true gemini -m <model>`. sandbox 측정에는 `-s`를 더합니다.
  - 측정 항목은 M-G1–M-G7입니다. 결과 파일은 `<SP>/t4/l-g-results.md`이고, AC12 before/after를 확인합니다.
  - 사본 dry-run 전체 테스트로 T4 영향 목록을 확정합니다.
- [ ] **분기**
  - 하나라도 실패하거나 측정할 수 없으면(D17) 커밋하지 않고 종료합니다. spec §10에 "미전환(D17)"과 결과 경로를 기록합니다. 기록 방법은 Orchestrator 결정 5를 따릅니다.
  - 모두 통과하면 T4-C로 갑니다.

### Task T4-C: Gemini composite host 전환 (조건부)

**allowedPaths:**
- `lib/runtime/platform-registry.mjs`, `lib/runtime/role-dispatch-policy.mjs`와 각 `shared/skill/runtime/` 복제본
- 테스트
  - `tests/node/gemini-capability-evidence.test.mjs`(`:64` 키 목록)
  - `tests/node/gemini-platform.test.mjs`(`:31` off map, `:220` composite 거부)
  - `tests/node/gemini-composite.test.mjs`(`:233` operational compositeHost-off 테스트를 주입 off registry로 전환)
  - `tests/node/gemini-bridge.test.mjs`(`:62-65`, `:215` GG2 단언을 fail 주입으로 전환)
  - `tests/node/role-routing-dispatch.test.mjs`(`:25`)
  - `tests/node/host-gemini-grok.test.mjs`
  - `tests/node/composite-instructions.test.mjs`
  - `tests/node/runtime-versions.test.mjs`
  - dry-run 후보
- 문서: coordination 4종, `docs/harness-operation.md`
- 생성물: golden, `MANIFEST.sha256`

**Steps:** T3 Step 1–10과 같은 형태입니다.
- RED: `GG2 'approval'` 기대, gemini verified 7개, 주입 fail 전환, Gemini host 의무 문장(M-G6 확정 문구), host 목록에 `gemini`/`gemini-cli`
- RED 확인: `node --test tests/node/gemini-capability-evidence.test.mjs tests/node/gemini-platform.test.mjs tests/node/gemini-composite.test.mjs tests/node/gemini-bridge.test.mjs tests/node/role-routing-dispatch.test.mjs tests/node/host-gemini-grok.test.mjs tests/node/composite-instructions.test.mjs`
- GREEN: `:123` gemini verified, `GG2:'approval'`, 주석
- 생성물 연쇄(`baselineHash` 포함), bridge GREEN, 호스트 전체 검증, spec §10, fresh QA
- 커밋: `feat(runtime): Gemini composite host 전환과 GG2 approval 기록`. 본문에 측정 버전, 날짜, 결과 경로, M-G 판정을 적습니다.

**수용 기준:** AC2(T4), AC10(Gemini), AC11, AC13, AC12

---

## 최종 검증 (모든 task 수용 뒤)

- [ ] Orchestrator
  - 호스트 전체 테스트를 B0와 비교해 새 실패 0건
  - `--check` 3종 통과
  - golden `--diff` 출력 없음
  - `git diff --stat 2d0056b..HEAD -- lib/runtime shared/skill/runtime lib/platforms lib/installer lib/management`의 범위가 spec §7과 같음
  - AC12 해시가 B0와 같음
- [ ] 독립 최종 Reviewer가 `2d0056b..HEAD`를 1회 검토합니다. 중점은 다음과 같습니다.
  - prepare fallback 제거 뒤 fail-closed가 지켜지는지
  - probe 호출 조건이 grok/gemini host에 한정되는지(Codex/Claude host 불변)
  - probe의 `O_EXCL|O_NOFOLLOW`, 잔존 보고, 오류 분류
  - run/resume에서 probe 실패 시 상태 불변(lease, starter, cancel 마커)
  - `'approval'`이 `'pass'`와 같게 취급되는 다른 경로가 없는지(supervisor `:114-117` 포함)
  - `defaultComposite` 상속(RF5)
  - 문서 의무 문장의 4종 일치, 금지 플래그 누락 여부
  - 측정 증거와 `HOST_CONTRACTS`의 일치
  - `baselineHash` 갱신
- [ ] Reviewer 지적은 Implementer → Reviewer로 다시 확인합니다. QA는 다시 배정하지 않습니다. 확인을 마치기 전에는 커밋하지 않고, 수용한 뒤 follow-up commit 1개로 남깁니다.

## AC와 E 배정표

| 항목 | task |
|---|---|
| AC1, AC3, AC4, AC5, AC7 | T1a |
| AC2 | T1a(T1 값), T3, T4-C |
| AC6 | T1b(T1 시점), T3 |
| AC8, AC9, AC14 | T3(Gemini 증거는 T4-C) |
| AC10 | T1a(probe 문장), T3(Grok), T4-C(Gemini) |
| AC11, AC13 | 커밋하는 task 전부 |
| AC12 | B0, T2, T4-M, 최종 |
| E1, E8 | 기존 동작(T1a 회귀 실행) |
| E2, E4–E7, E11 | T1a |
| E3 | T1a(AC5), T2 M-H2 |
| E9, E10 | T3(AC8) |
| E12 | T3 문서 |

## 개정 이력

| Version | Approval time | Classification | Affected tasks | Reason |
|---|---|---|---|---|
| v1 | 2026-11-19T12:12:41Z | 최초 작성 | 전체 | spec v1(2026-11-19T12:02:22Z) 구현 plan. spec T1을 T1a/T1b로 분할, D0 docs 커밋 분리, T2 사본 dry-run으로 T3 allowedPaths 확정 |

## Orchestrator 결정 (초안 확인 사항 정리)

1. T2/T4 측정 사본에서는 registry와 함께 GK2도 `'approval'`로 바꿉니다(T4는 GG2). 바꾸는 것은 사본뿐이고 저장소는 그대로 둡니다. spec §6.1의 "측정 빌드" 범위에 들어갑니다.
2. 설치는 scratchpad 스크립트에서 `prepareOperation`/`executeOperation`을 호출해서 합니다. `prebuilds/`는 추적 파일이라 `git archive`에 들어 있으므로 `build/` 복사는 필요 없습니다. 새 HOME에 composite를 바로 설치하지 못하면 S5에서 멈추고 보고합니다.
3. `ARC_RUNTIME_ENTRY`는 M-H1에서 관측한 값을 기록합니다.
4. M-H2는 `deny`를 쓰는 사용자 정의 프로필로 차단 상황을 재현합니다(S7 참고).
5. T4가 실패하면 spec §10에 결과를 적고 `docs(spec): Gemini host 측정 결과 기록` 커밋 하나로 남깁니다.
6. bridge 안에서 golden 생성 스크립트가 실패하면 Orchestrator가 호스트에서 같은 생성 명령만 실행합니다. 손으로 편집하지 않으며, 실행했다는 사실을 record에 남깁니다.
7. 테스트 seam `probeHomeWritable(home, {unlink})`을 허용합니다. 기본값은 `fs.unlink`이고, runtime 호출부는 이 인자를 넘기지 않습니다.
8. resume에서는 `starter` 바로 앞에서 probe합니다(spec 문구).
9. AC3 fixture는 새 테스트 파일 안의 지역 fixture로 만듭니다. `role-fixtures.mjs`는 꼭 필요할 때만 고칩니다.
10. T3 영향 범위는 T2 S3 dry-run으로 확정합니다. allowedPaths가 늘어나면 plan을 개정합니다.
11. RF5: zeta fixture가 `defaultComposite` 플래그를 상속하는 것은 의도한 동작으로 둡니다.
12. B0에서 `2d0056b` 기준선을 다시 기록하고, 이후 비교는 그 기준선으로 합니다.
