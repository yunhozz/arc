# ARC `Claude & Codex` 복합 역할 실제 실행 구현 계획

상태: 첫 초안(Planner 작성, Orchestrator 저장·검토, 2026-11-10). 사용자 승인 전입니다.

> ARC의 작업 배정·검증·수용 절차를 적용합니다. 승인된 최상위 작업 하나는 수용 후 focused 커밋 하나에 대응합니다. 체크박스는 진행 추적용이며 커밋 단위가 아닙니다. 커밋은 Orchestrator가 수용한 뒤 만듭니다.

**목표:** 현재 세션의 Orchestrator가 다섯 역할을 설정된 플랫폼·모델·effort로 실제 실행하게 합니다. 같은 플랫폼 역할은 native로, 다른 플랫폼 역할은 bridge로 실행하며, 영속 lease와 detached supervisor로 상태를 관리합니다.

**구조:**
- 런타임의 판정 단계는 지금처럼 활성화를 검증한 뒤, 고정 hold 대신 판정표를 적용해 lease를 예약합니다.
- bridge는 해시가 검증된 대상 플랫폼 `arc-routing-*` 프로필에서 CLI 인자를 만들고, detached supervisor가 자식 CLI를 실행·관측·종료합니다.
- native는 Orchestrator가 호스트 도구로 실행하고, 그 결과를 operator-attested로 기록합니다.

**기술:** Node.js ≥22 ESM, `node:test`, 기존 잠금(`acquireRoleRoutingLock`), 런타임 자산 생성기(`scripts/update-runtime-assets.mjs`), 매니페스트(`scripts/update-manifest.mjs`), 실제 CLI를 대신하는 fake CLI 스크립트.

**승인 명세:** `docs/superpowers/specs/2026-11-10-composite-role-execution-design.md` (2026-11-10 승인, O1–O3 반영). 각 작업은 이 명세의 절(§)과 AC를 근거로 합니다.

**대상:** `/Users/yunho/Desktop/project/arc`, 브랜치 `feat/install-update-integration-screen`. 착수 HEAD는 G0에서 기록합니다. 별도 작업 1의 `lib/tui/*`와 `tests/node/tui-setup.test.mjs`는 어떤 작업에도 포함하지 않습니다.

## 공통 제약

명세 원문의 값을 그대로 씁니다.

- 명령 형식: `node "$ARC_RUNTIME_ENTRY" <command> --cwd <abs worktree> --workflow <id> --input -`
- 종료 코드: allow 0, deny 2, hold 3, 오류 1
- 모든 입력은 정확한 키 집합으로 검증하고, 모르는 키는 deny(`invalid_request`)입니다.
- routeStatus: `held | reserved | starting | running | completed | failed | cancelled | unknown`
- 근거 수준: `runtime-observed | operator-attested | unverified`
- `supportStatus`는 claims 다섯 항목이 모두 `runtime-observed`이고 불일치가 없을 때만 `verified`입니다.
- 비터미널 상태는 `reserved`, `starting`, `running`, `unknown`이고, 터미널 상태는 `completed`, `failed`, `cancelled`입니다.
- 지원 CLI 버전: Claude Code `>=2.1.322 <2.2.0`, codex-cli `>=0.167.0 <0.168.0`. 단일 상수로 두며, 범위 밖이거나 파싱에 실패하면 해당 플랫폼 bridge만 `permission_scope_unverified`입니다.
- 타임아웃(고정): `arc_implementer` 60분, `arc_qa` 30분, 그 외 20분. `limits.toml` 형식은 바꾸지 않습니다.
- 수치: heartbeat 5초, supervisor 소실 판정 30초, `observe` `waitMs` 0–540000, brief 256 KiB(262144 bytes) 이하, `events.jsonl` 4 MiB(4194304 bytes) 상한, cancel 유예 10초, 터미널 lease 정리 30일
- lease 위치: `<CODEX_HOME>/arc-role-dispatch/<dispatchId>.json`. 파일 0600, 디렉터리 0700이며 `arc-role-platform-routing.lock` 아래에서만 생성·갱신합니다.
- 산출물 위치: `<gitCommonDir>/arc/workflows/<workflowId>/dispatches/<dispatchId>/`
- 비밀 정보(환경 변수 값, 토큰)와 원시 CLI 출력을 argv, lease, record, events, 진단에 넣지 않습니다. brief는 stdin으로만 전달합니다.
- 자동 대체·폴백·재시도는 없습니다. 잠금 파일은 자동 삭제하지 않습니다.
- 런타임 모듈을 변경하는 작업은 같은 작업 안에서 다음을 모두 맞춥니다. 이 묶음은 분리할 수 없는 계약입니다.
  - `COOPERATIVE_RUNTIME_MODULES`(`lib/runtime/bootstrap.mjs`)
  - `RUNTIME_MODULE_PATHS`(`lib/installer/runtime-assets.mjs`)
  - 설치 복제본(`codex/skill/runtime/`, `claude/skill/runtime/`)
  - `MANIFEST.sha256`
  - 인벤토리·해시 테스트(`tests/node/runtime-assets.test.mjs`, `tests/node/manifest.test.mjs`, `tests/node/runtime-versions.test.mjs`의 `expectedModules`·`baselineHash`)
- "전체 스위트 통과"의 정의: `npm test`의 실패 테스트 이름 집합이 G0 기준선 실패 집합의 부분집합입니다. 새 실패가 하나라도 있으면 불합격입니다. 기준선에서 실패하던 테스트가 통과하게 되는 것은 허용합니다.

## 공통 등록 절차 (R) — 런타임 바이트를 바꾸는 모든 작업의 마지막 단계

1. 새 모듈은 `COOPERATIVE_RUNTIME_MODULES` 끝(`'role-bridge.mjs'` 뒤)에 명시된 순서로 추가합니다. `RUNTIME_MODULE_PATHS`에는 정렬 순서로 추가합니다.
2. 테스트 목록을 현재 인벤토리와 정확히 일치시킵니다. `runtime-assets.test.mjs`의 `expectedPaths`와 `runtime-versions.test.mjs`의 `expectedModules`가 대상이며, `manifest.test.mjs`의 `requiredRuntimePaths`에는 새 모듈을 추가합니다.
3. `node scripts/update-runtime-assets.mjs`를 실행합니다.
4. `node --input-type=module -e "const m=await import('./lib/runtime/bootstrap.mjs');console.log((await m.cooperativeVersions()).runtimeHash)"`로 해시를 계산하고, `runtime-versions.test.mjs`의 `baselineHash`를 그 값으로 갱신합니다.
5. `node scripts/update-manifest.mjs`를 실행합니다.
6. 확인: `node scripts/update-runtime-assets.mjs --check`가 종료 0, `npm run check:manifest`가 종료 0, `git diff --check`의 출력이 없어야 합니다.

## 작업 순서와 병렬성

| 순서 | 작업 | 선행 | 병렬 가능 여부 |
|---|---|---|---|
| G0–G8 | 기준선과 검증 게이트(커밋 없음) | 계획 승인 | G0을 먼저 하고, G1–G8은 서로 독립이라 병렬 가능 |
| T1 | 정책 상수, lease 저장소, 판정 재작성, `routing-status`, 버전 확인, lease 정리 | G0–G8 | 불가 |
| T2 | bridge 인자와 관측 판정(순수 모듈) | T1 | 불가 |
| T3 | supervisor, `run-dispatch`, `observe`(bridge·native), 사후 검출 연결, Hook 표식 | T2 | 불가 |
| T4 | `resume`, `cancel`, 게시 차단 | T3 | 불가 |
| T5 | native 프로필 revision 태그(설치기) | T1 | 논리적으로는 T2–T4와 독립이지만 `MANIFEST.sha256`·`lib/installer/role-routing.mjs`(T4)와 겹쳐 T4 뒤에 순차 진행 |
| T6 | 지침, 문서, 결과 문구, `cooperative-7`, 옵트인 실제 스모크 | T1–T5 | 불가 |
| F | 최종 Reviewer 1회(전체 변경) | T1–T6 수용 | — |

모든 작업이 `MANIFEST.sha256`(그리고 대부분 런타임 복제본과 `baselineHash`)을 수정하므로 같은 파일 동시 편집 금지 규칙에 따라 순차로 진행합니다. 각 작업은 앞선 작업이 수용·커밋된 뒤 시작합니다.

## Review Focus

명세가 직접 말하지 않지만 사용자가 실제로 겪을 가능성이 높은 다섯 가지입니다. 각 항목에는 담당 작업에 고정 테스트를 넣었습니다.

1. **잠금 경합:** supervisor의 상태 쓰기와 `prepare-dispatch`·게시가 겹칠 때, 잠깐 점유된 잠금 때문에 엉뚱한 `activation_unverified`가 나면 안 됩니다. 2초 재시도 후에도 점유 중이면 잔여 경로를 보고하고 보류합니다. (T1 `lock busy…` 테스트, T3 `supervisor writes during prepare…` 테스트)
2. **같은 dispatch의 중복 실행:** 호스트 타임아웃 뒤 Orchestrator가 같은 dispatchId로 `run-dispatch`를 다시 호출하면, 두 번째 자식 없이 deny해야 합니다. (T3)
3. **기존 미커밋 변경이 있는 작업 트리:** 역할이 건드리지 않은 기존 dirty·untracked 파일 때문에 읽기 전용 역할이 위반으로 판정되면 안 됩니다. (T2 `detectViolations` 테스트, T3 통합 테스트)
4. **CLI 출력 이상:** 비JSON 줄, 청크 경계에서 잘린 줄, 1 MiB를 넘는 줄, 결과 이벤트 누락이 있어도 supervisor는 죽지 않아야 하고, 결과가 없으면 `invalid_output`입니다. (T2 parser, T3)
5. **cwd가 worktree 하위 디렉터리인 경우:** 스냅샷과 Codex `-C`는 `observeCooperativeTarget(cwd).realpath`(worktree 루트)를 기준으로 합니다. (T2 args, T3)

---

## G0–G8: 기준선과 검증 게이트 (커밋 없음, QA 실행)

**목표:** 구현이 의존하는 사실을 실제 CLI로 확정하고, 그 결과를 T1 정책 상수와 T2 테스트 픽스처의 입력으로 만듭니다(명세 §7, AC18).

**결과 기록:** 결과 파일은 `.git/arc/design/2026-11-10-composite-role-execution-gates.md`에 두고, 정제된 샘플은 `.git/arc/design/gate-samples/`에 둡니다. QA가 작성하고 Orchestrator가 보관합니다. 계정 식별자, 토큰, 경로상의 사용자 정보는 샘플에서 제거합니다.

- [ ] **G0 기준선**
  - 착수 HEAD, 브랜치, `git status --porcelain`(작업 1 미커밋 포함 여부)을 기록합니다.
  - `npm test`를 실행해 실패한 테스트 이름 목록을 기록합니다. 보고상 tui-setup 15건, tui-app 13건이 이미 실패하며, 런타임 인벤토리·해시 테스트의 실패 여부도 함께 기록합니다.
  - 이 목록이 모든 작업의 "새 실패 없음" 기준입니다.
- [ ] **G1 (D3)** `claude -p --safe-mode --tools "Bash" --permission-mode default --settings '<JSON>'`을 임시 git 저장소 루트에서 실행합니다. 후보 JSON은 `{"sandbox":{"enabled":true,"autoAllowBashIfSandboxed":true,"allowUnsandboxedCommands":false}}`입니다.
  - 통과 조건: worktree 안의 `touch`는 승인 없이 성공하고, worktree 밖(상위 디렉터리) 쓰기는 거부되며, 샌드박스 밖 실행으로 넘어가지 않습니다.
  - 산출: `pass|fail`, 실제로 통과한 정확한 JSON
- [ ] **G2 (V9)** Codex CLI 대화형 호스트에서 승격 승인 하에 detached·unref된 node 프로세스를 띄웁니다.
  - 통과 조건: 명령이 반환된 뒤 60초 이상 살아 있고, `<CODEX_HOME>` 아래 임시 파일을 쓸 수 있습니다.
  - 산출: `pass|fail`
- [ ] **G3 (V6)** `-c features.multi_agent=false` 상태와 해제 상태에서 각각 하위 에이전트 생성을 지시하는 `codex exec --json`을 실행하고, rollout을 확인합니다.
  - 산출: 위임 호출 function_call의 `name` 값 목록(예: `spawn_agent`), 검출 가능 여부 `pass|fail`, 정제된 `codex-rollout-spawn.jsonl` 샘플
- [ ] **G4** `printf '<brief>' | codex exec --json -C <repo> ... -`를 위치 인자 프롬프트 없이 실행합니다.
  - 통과 조건: brief 지시가 수행됩니다.
  - 산출: `pass|fail`
- [ ] **G5 (V8)** `-C <worktree root>`, `-c sandbox_mode="workspace-write"`로 상위 디렉터리 쓰기를 시도합니다.
  - 산출: `contained|wide`, 원인 관측 내용
- [ ] **G6 (V4)** 임시 MCP 설정이 있는 상태에서 `claude -p --tools "Read"`를 `--strict-mcp-config` 유무로 각각 실행하고 init의 `tools`를 확인합니다.
  - 산출: `strict`(플래그가 필요하고 효과가 있음) 또는 `none`
- [ ] **G8 (P-5)** `codex exec resume <tid> --json -o <file> -c developer_instructions=... -` 를 stdin brief로 실행해 수용 여부를 확인합니다.
  - 산출: `pass|fail`
- [ ] **G7 (V13)** `claude -p --resume <sid> --model <다른 모델>`을 실행해 init의 `model`을 확인합니다.
  - 산출: `pass|fail`
- [ ] **샘플 수집** 정제된 JSONL 샘플을 저장합니다.
  - Claude: `claude-init.jsonl`, `claude-result.jsonl`, `claude-transcript.jsonl`(effort 필드 포함)
  - Codex: `codex-exec.jsonl`(경고 item 포함), `codex-rollout.jsonl`(`turn_context`의 model·effort·sandbox_policy·approval_policy 실제 모양)

**보류 조건:**
- G0이 없으면 모든 작업을 보류합니다.
- 게이트 결과는 실패여도 T1 착수를 막지 않습니다. 실패는 명세 §7의 정해진 보류로 반영됩니다. 다만 결과 자체가 없거나 결과 기록이 없으면 T1을 보류합니다.
- 실제 CLI 버전이 지원 범위 밖이면 게이트를 중단하고 Orchestrator에 보고합니다.

---

## T1: 정책 상수, dispatch lease 저장소, 판정 재작성, `routing-status`

**목표:** 고정 hold를 명세 §5.3 판정표로 바꿉니다. lease를 예약·정리하고, 버전 범위와 게이트 결과를 적용하며, `routing-status`를 제공합니다.

**AC:** AC1, AC2, AC3, AC19, AC20. AC13·AC14·AC18 중 시작 전 판정 부분.

**파일:**
- 생성: `lib/runtime/role-dispatch-policy.mjs`, `lib/runtime/role-dispatch-store.mjs`
- 수정:
  - `lib/runtime/role-routing.mjs`(`prepareRoleDispatch` 전체, `readActivation` export, 신규 함수)
  - `lib/runtime/local-cli.mjs`(버전 probe 추가)
  - `lib/runtime/command.mjs`(`routing-status` 추가, `prepare-dispatch` 입력 확장)
  - `lib/installer/role-routing.mjs`: 기존 `renameProfile`을 동작 변경 없이 `export function renameCompositeProfile`로 노출합니다. fixture에서 쓰기 위한 것입니다.
- 등록(R): 새 모듈 두 개, 복제본, 매니페스트, 인벤토리·해시 테스트
- 테스트:
  - 생성: `tests/node/role-fixtures.mjs`(헬퍼, `*.test.mjs` 아님), `tests/node/role-dispatch-store.test.mjs`, `tests/node/role-routing-dispatch.test.mjs`
  - 수정: `tests/node/runtime-assets.test.mjs`, `tests/node/manifest.test.mjs`, `tests/node/runtime-versions.test.mjs`(R)

**인터페이스 (Produces):**

`lib/runtime/role-dispatch-policy.mjs`
- `SUPPORTED_CLI_VERSIONS = {claude:{min:'2.1.322', below:'2.2.0'}, codex:{min:'0.167.0', below:'0.168.0'}}`
- `BRIDGE_GATE_RESULTS = {G1,G2,G3,G4,G7: 'pass'|'fail', G5: 'contained'|'wide', G6: 'strict'|'none'}` — G 기록값을 그대로 씁니다.
- `CLAUDE_SANDBOX_SETTINGS`: G1이 pass면 기록된 JSON 객체, fail이면 `null`
- `CODEX_DELEGATION_CALL_NAMES`: G3 산출 이름 배열
- `DESKTOP_CHECKLIST_PASSED = {'claude-desktop':false, 'codex-desktop':false}`
- `ROLE_TIMEOUT_MINUTES = {arc_scouter:20, arc_planner:20, arc_implementer:60, arc_qa:30, arc_reviewer:20}`
- 수치 상수: `HEARTBEAT_MS=5000`, `SUPERVISOR_LOST_MS=30000`, `OBSERVE_MAX_WAIT_MS=540000`, `BRIEF_MAX_BYTES=262144`, `EVENTS_MAX_BYTES=4194304`, `CANCEL_GRACE_MS=10000`, `LOCK_RETRY_MS=2000`, `LEASE_RETENTION_MS=2592000000`
- `DEFAULT_POLICY`: 위 값을 묶은 frozen 객체. 테스트 주입 지점입니다.
- `RELEASE_CONDITIONS`: 명세 §5.10의 모든 사유 코드에 대한 해제 조건 문자열
- `reason(code) -> {code, releaseCondition}`
- `profileName(platform, role) -> string`: claude는 `arc-routing-<suffix>`, codex는 `arc_routing_<suffix>`
- `revisionTag(revision) -> string`: `` `[arc-routing rev ${revision}]` ``
- `bridgeGateReasons({platform, role, hostPlatform, policy}) -> string[]`
  - claude이면서 Implementer/QA이고 G1 fail: `permission_scope_unverified`
  - codex이고 G4 fail: `permission_scope_unverified`
  - 호스트가 codex이고 G2 fail: `host_sandbox_blocked`
  - G3, G5, G6은 보류 사유가 아닙니다.
- `environmentReasons(executionEnvironment, policy) -> string[]`: Desktop이고 체크리스트 미통과면 `['environment_unverified']`
- `initialClaims(route, policy) -> Claims`
  - native: identity, model, effort, terminal은 `operator-attested`(source `orchestrator`), permissions는 `operator-attested`(source `prompt-contract`)
  - bridge: 다섯 항목 모두 `unverified`

`lib/runtime/local-cli.mjs`
- `compareVersions(a, b) -> -1|0|1`
- `probeCliVersion(context, {signal, timeoutMs=10000, policy}) -> Promise<{version:string|null, supported:boolean, reason?:'version_unparsed'|'version_unsupported'|'cli_execution_error'|'timeout'}>`
  - `<cli> --version`을 실행하고 출력의 첫 `\d+\.\d+\.\d+`를 파싱합니다.
  - 출력 64 KiB 상한, 원시 출력 비보존은 `probePlatformAuth`와 같습니다.

`lib/runtime/role-dispatch-store.mjs` (모든 쓰기 함수는 호출자가 잠금을 보유한다고 가정)
- `NON_TERMINAL_STATES`, `TERMINAL_STATES`
- `dispatchDirectory(codexHome) -> string`
- `validateLease(value) -> Lease`: 정확한 키 집합을 검사합니다.
  - 명세 §5.6의 필드
  - 추가 필드 `allowedPaths: string[]`, `resultPath: string|null`, `segment: number`, `nativeAgentId: string|null` (P-3)
- `createLease(codexHome, lease) -> Promise<Lease>`: 디렉터리 0700 생성, `wx` 0600 쓰기
- `readLease(codexHome, dispatchId) -> Promise<Lease|null>`
- `writeLease(codexHome, lease) -> Promise<Lease>`: 같은 디렉터리 임시 파일에 쓰고 rename, `updatedAt` 갱신
- `listLeases(codexHome) -> Promise<Lease[]>`: 해석할 수 없는 lease 파일이 있으면 throw
- `pruneTerminalLeases(codexHome, {now, retentionMs}) -> Promise<{removed:number, errors:number}>`
- `readHostLimits(hostHome) -> {maxTotal:number, maxConcurrent:number}`
  - `<hostHome>/skills/arc/limits.toml`에서 `version = 1`, `max_total_subagents`, `max_concurrent_subagents`의 세 키만 허용합니다. 빈 줄과 `#` 주석은 무시합니다. `serializeLimits` 형식과 호환됩니다.
  - 해석에 실패하면 throw하고, 호출자는 `activation_unverified`로 보류합니다(P-4).

`lib/runtime/role-routing.mjs`
- `readActivation(homes, expectedRevision)`: 기존 함수를 그대로 export합니다.
- `withRoutingLock(codexHome, fn, {retryMs}) -> Promise<T>`
  - `EEXIST`일 때만 50ms 간격으로 재시도하며 최대 `retryMs`까지 기다립니다. 초과하면 `code:'ARC_ROUTING_LOCK_BUSY'`와 `residualPaths`를 담은 오류를 냅니다.
  - `EACCES|EPERM|EROFS`는 `code:'ARC_HOST_SANDBOX'` 오류로 변환합니다.
  - 해제에 실패하면 기존과 같이 잔여 경로를 보고합니다.
- `routingStatus({context, now, policy}) -> Promise<{decision, revision, hostPlatform, executionEnvironment, roles:{[role]:{route, platform, model, effort, profileName, revisionTag}}, platforms:{codex|claude:{authentication, cliVersion}}, pruned:{removed, errors}, reasons}>`
- `prepareRoleDispatch({context, assignment:{role, requestId, taskId, allowedPaths?}, expectedRevision, now, policy}) -> Promise<DispatchResult>`
- `DispatchResult = {decision, routeStatus, supportStatus, dispatchId|null, route|null, profileName|null, executionEnvironment, hostPlatform, role, requested, authentication, cliVersion, claims|null, reasons:[{code, releaseCondition}], residualPaths?}`

`lib/runtime/command.mjs`
- `isRouting` 목록에 `routing-status`를 추가합니다(`cancel`은 T4).
- 입력 키:
  - `routing-status`: `{hostPlatform, executionEnvironment}`
  - `prepare-dispatch`: `{hostPlatform, executionEnvironment, role, expectedRevision, requestId, taskId, allowedPaths?}`

**판정 순서** (명세 §5.3, 모든 사유를 모읍니다)
1. 입력 검증. 실패하면 deny `invalid_request`.
   - `allowedPaths`: Implementer는 필수, QA는 선택, 읽기 전용 역할은 금지입니다.
   - 각 항목은 worktree 상대 경로여야 하며, 절대 경로·`..`·빈 문자열은 금지입니다. `/`로 끝나면 디렉터리 접두사로 봅니다.
2. `withRoutingLock` 안에서 다음을 수행합니다.
   - lease 정리: 실패해도 판정에 영향을 주지 않습니다.
   - `readActivation`
   - route 결정
   - CLI 해석과 인증 확인
   - bridge이면 `probeCliVersion`
   - `environmentReasons`, 그리고 bridge이면 `bridgeGateReasons`
   - 중복 검사: 같은 `requestId`, 또는 같은 workflow·task·role의 비터미널 lease가 있으면 deny `duplicate_dispatch`
   - bridge이면 한도 검사: 활성 bridge lease 수가 `maxConcurrent` 이상이거나 workflow의 bridge lease 누적 수가 `maxTotal` 이상이면 `capacity_exhausted`
   - 사유가 없으면 `createLease(state:'reserved', timeoutMinutes: ROLE_TIMEOUT_MINUTES[role])`
3. 오류 코드 매핑: `ARC_HOST_SANDBOX`는 `host_sandbox_blocked`, `ARC_ROUTING_LOCK_BUSY`와 활성화 오류는 `activation_unverified`입니다.

- [x] **Step 1: fixture 헬퍼 작성** (`tests/node/role-fixtures.mjs`)
  - `createRoutingFixture(t, {roles, hostPlatform='claude', limits={total:100, concurrent:5}}) -> {userHome, codexHome, claudeHome, cwd, env, revision, context(overrides)}`
    - 임시 git 저장소를 `cwd`로 만듭니다.
    - 두 홈에 `lib/runtime/*`와 `lib/policy/role-policy.json`을 `skills/arc/runtime/`으로 복사합니다.
    - 호스트 홈에 `limits.toml`을 둡니다.
    - 프로필은 `renderProfiles`(`lib/models/index.mjs`) 결과에 `renameCompositeProfile`을 적용해 씁니다.
    - 활성 문서와 마커는 실제 해시로 작성합니다(명세 선행 §2.5 형식).
  - `installFakeCli(t, binDir, platform, scenario) -> {recordPath}`
    - node 스크립트를 실행 권한으로 씁니다. 시나리오는 환경 변수 `ARC_FAKE_CLI_SCENARIO_<PLATFORM>` 파일에서 읽습니다.
    - `auth status --json`·`login status`에 `scenario.auth` ∈ `ok|unauthorized|error|hang`로 응답합니다.
    - `--version`에 `scenario.version`을 출력합니다.
    - 실행 모드에서는 argv와 stdin을 `recordPath`에 JSON으로 기록하고, 시나리오가 정한 이벤트 줄, 파일 쓰기, transcript·rollout 파일 작성, 지연, hang, SIGTERM 무시, 손자 프로세스 생성, 종료 코드를 수행합니다.
- [x] **Step 2: 실패 테스트 작성** (`tests/node/role-dispatch-store.test.mjs`)
  - `lease create/read/write keeps 0600 file and 0700 directory and exact keys`: 키가 하나 많거나 적으면 `validateLease`가 throw합니다.
  - `listLeases throws on an unparsable lease file`
  - `pruneTerminalLeases removes only terminal leases older than 30 days` (AC20)
    - `now=T`에서 `completed`(T−31d), `failed`(T−31d), `cancelled`(T−29d), `unknown`(T−90d), `running`(T−90d)을 두면 `removed===2`이고, 나머지 세 파일은 존재합니다.
  - `pruneTerminalLeases counts unlink errors without throwing`: 디렉터리 0500으로 만들면 `errors>0`입니다.
  - `readHostLimits accepts serializeLimits output and comments, rejects unknown keys or version 2`
- [x] **Step 3: 실패 테스트 작성** (`tests/node/role-routing-dispatch.test.mjs`)
  - `routing-status returns revision, per-role routes, profile names and auth without creating leases` (AC1)
    - host claude, `arc_qa`는 codex에 배정합니다.
    - `roles.arc_qa = {route:'bridge', profileName:'arc_routing_qa', revisionTag:'[arc-routing rev <rev>]'}`
    - `roles.arc_planner.route === 'native'`, `dispatchDirectory`에 lease 파일 0개, 종료 0
  - `routing-status holds activation_unverified on marker hash mismatch` (AC1): 프로필 바이트 1개를 바꾸면 `decision:'hold'`입니다.
  - `prepare-dispatch allows native and bridge with reserved lease and initial claims` (AC2)
    - `decision:'allow'`, `routeStatus:'reserved'`, `reasons:[]`
    - bridge claims는 다섯 항목 모두 `unverified`, native claims는 `operator-attested`
    - lease의 `timeoutMinutes`는 Implementer 60, QA 30, Planner 20
  - `prepare-dispatch never emits native_provider_unavailable, capacity_unverified or model_effort_observer_unavailable` (AC2)
  - `prepare-dispatch maps CLI absence, unauthorized and probe failure to Not Avaliable, Unauthorized, Incomplete holds` (AC2): 각각 hold이고 lease를 만들지 않습니다.
  - `bridge CLI version range is enforced per platform and native is unaffected` (AC19)
    - claude: `2.1.322 (Claude Code)`·`2.1.999`는 allow, `2.2.0`·`2.1.321`·`garbage`는 hold `permission_scope_unverified`
    - codex: `codex-cli 0.167.0`·`0.167.9`는 allow, `0.168.0`은 hold
    - 같은 버전 조건에서 native 역할은 allow
  - `desktop environments hold environment_unverified until checklist passes` (AC13): `policy.desktopChecklist` 주입으로 통과 시 allow를 확인합니다.
  - `gate results hold only the affected role, platform and host` (AC18)
    - G1 fail: claude bridge Implementer·QA는 hold, claude bridge Planner는 allow
    - G2 fail + host codex: bridge는 `host_sandbox_blocked`, native는 allow
    - G4 fail: codex bridge 전 역할 hold
    - G3 fail, G5 wide: allow
  - `duplicate requestId and duplicate non-terminal task-role are denied with exit 2` (AC3)
  - `bridge concurrency and workflow total come from host limits.toml and unknown leases count` (AC3)
    - concurrent=2에서 bridge 2개를 reserve하면 세 번째는 `capacity_exhausted`
    - 하나를 `unknown`으로 바꿔도 여전히 hold
    - native는 allow
    - total=3이고 terminal 3개가 같은 workflow이면 hold
  - `allowedPaths validation`: Implementer 누락, 절대 경로, `..`, 읽기 전용 역할에 지정한 경우는 deny `invalid_request`. QA는 생략 가능합니다.
  - `EACCES on dispatch directory or lock maps to host_sandbox_blocked` (AC13)
  - `lock busy beyond retry window holds activation_unverified with residual lock path and keeps the lock file` (Review Focus 1)
    - 다른 operationId로 잠금 파일을 미리 만들어 둡니다.
    - 결과에 `residualPaths`가 있고 잠금 파일이 그대로 존재합니다.
  - `lock released within retry window allows`: 300ms 뒤 해제되면 allow입니다.
  - `prune failure does not change the decision` (AC20)
  - `installed cli.mjs maps allow/hold/deny to exit 0/3/2`: `HOME`과 `CODEX_HOME` 환경으로 `lib/runtime/cli.mjs`를 spawn합니다.
- [x] **Step 4: RED 확인**
  - 실행: `node --test tests/node/role-dispatch-store.test.mjs tests/node/role-routing-dispatch.test.mjs`
  - 기대: 모듈·export 부재 또는 hold 고정으로 FAIL
- [x] **Step 5: 구현**
  - 위 인터페이스대로 두 신규 모듈을 작성하고 `local-cli.mjs`에 버전 probe를 추가합니다.
  - `role-routing.mjs`는 `RELEASE` 상수를 `RELEASE_CONDITIONS`로 이관하고 판정을 재작성합니다.
  - `command.mjs`의 `routing-status`와 `prepare-dispatch` 입력을 확장합니다.
  - `renameCompositeProfile` export를 추가합니다.
- [x] **Step 6: GREEN 확인**
  - 실행: Step 4 명령
  - 기대: PASS
- [x] **Step 7: 등록(R)**
  - 새 모듈 순서: `'role-dispatch-policy.mjs','role-dispatch-store.mjs'`
  - 인벤토리·해시 테스트를 현재 인벤토리로 맞춥니다. 기준선에서 이미 맞지 않았다면 함께 맞춥니다(P-1).
- [x] **Step 8: 회귀 확인**
  - 실행: `node --test tests/node/runtime-assets.test.mjs tests/node/manifest.test.mjs tests/node/runtime-versions.test.mjs tests/node/runtime-cli.test.mjs`
  - 기대: PASS
  - 실행: `npm test`
  - 기대: G0 대비 새 실패 없음
- [x] **Step 9: 수용 후 커밋** (Orchestrator) `feat(runtime): 복합 역할 dispatch 판정과 lease 저장소`

**필수 QA (fresh):**
- Step 4·8 명령을 재실행하고 `npm test`를 G0과 비교합니다.
- `npm run check:manifest`, `node scripts/update-runtime-assets.mjs --check`, `git diff --check`를 실행합니다.
- 정적 확인
  - lease 생성과 갱신이 모두 `withRoutingLock` 안에서만 일어나는지
  - 잠금 파일을 삭제하는 경로가 소유자 해제 외에 없는지
  - 인증·버전 probe 출력이 결과에 원문으로 남지 않는지

**보류 조건:**
- G 결과 기록이 없으면 착수하지 않습니다.
- 판정표에 없는 사유가 필요해지거나 명세 수치와 충돌하면 Orchestrator에 반환합니다.
- `lib/tui/*` 수정이 필요해지면 중단하고 보고합니다.

**진행 기록 (2026-11-10, 진행 기록·분류: task progress record):** T1 수용. Implementer 구현 → QA 지적 F-1(requestId 전역), F-3(손상 lease 해제 조건), F-4(G1 pass+JSON 부재 시 fail), F-6(실경합 테스트), F-7(Implementer 빈 allowedPaths deny), F-8(테스트 잔여 정리) 수정 → QA 재검증 통과(신규 28/28, 무부하 5회·부하 6회 반복, 영향 파일 35개 신규 실패 0, R 3검사 통과). 처분: QA 역할의 빈 `allowedPaths`는 쓰기 허용 없음으로 해석(T3 사후 검출에 반영). F-2(잠금 해제 실패 후 reserved 고아 lease)는 해제 조건에 cancel 안내만 추가, 정리 경로는 T4 `cancel`에서 `reserved` lease 처리로 구현.

---

## T2: bridge 인자와 관측 판정 (순수 모듈)

**목표:** 프로필을 해석하고, 역할별 CLI 인자를 만들고, 스트림·transcript·rollout을 정규화하고, 모델·권한을 판정하고, 실패를 분류하고, 작업 트리 스냅샷의 위반을 판정합니다. 이 작업은 프로세스를 실행하지 않습니다.

**AC:** AC5, AC6. AC8·AC9·AC14의 판정 부분.

**파일:**
- 생성: `lib/runtime/role-bridge-args.mjs`, `lib/runtime/role-observe.mjs`
- 등록(R)
- 테스트:
  - 생성: `tests/node/role-bridge-args.test.mjs`, `tests/node/role-observe.test.mjs`
  - 픽스처: `tests/node/fixtures/role-bridge/*.jsonl`. G 샘플을 정제해 복사합니다. `tests/node/*.test.mjs` 글롭에는 포함되지 않습니다.

**인터페이스:**
- 사용(Consumes): `DEFAULT_POLICY`, `profileName`, `ROLE_TIMEOUT_MINUTES` (T1)
- 제공(Produces), `role-bridge-args.mjs`
  - `parseCompositeProfile(platform, bytes) -> {name, description, model, effort, tools:string[]|null, instructions:string}`
    - Claude: frontmatter의 `name`, `description`, `model`, `effort`, `tools` 목록과 본문
    - Codex: 루트 한 줄 문자열 `name`, `description`, `model`, `model_reasoning_effort`와 `developer_instructions` 삼중 따옴표 문자열
    - 그 밖의 형식이면 throw합니다. 설치된 런타임은 `lib/models`를 import할 수 없으므로 좁은 추출기로 구현합니다.
  - `ROLE_BRIDGE_PERMISSIONS`
    - claude permissionMode: Scouter·Planner·Reviewer·QA는 `default`, Implementer는 `acceptEdits`. sandbox 사용: QA·Implementer
    - codex sandboxMode: Scouter·Planner·Reviewer는 `read-only`, QA·Implementer는 `workspace-write`. search: Scouter
  - `buildClaudeArgs({role, profile, sessionId=null, policy}) -> string[]`
    - 순서: `-p`, `--safe-mode`, `--output-format`, `stream-json`, `--verbose`, `--model`, m, `--effort`, e, `--append-system-prompt`, instructions, `--tools`, tools.join(','), `--permission-mode`, mode
    - sandbox 역할이면 `--settings`, `JSON.stringify(policy.claudeSandboxSettings)`
    - G6이 `strict`면 `--strict-mcp-config`
    - `sessionId`가 있으면 `--resume`, sid
    - 위치 인자 프롬프트는 넣지 않습니다.
    - sandbox 역할인데 settings가 `null`이면 throw합니다. T1이 이미 보류하지만 방어적으로 둡니다.
  - `buildCodexArgs({role, profile, worktree, resultPath, threadId=null, policy}) -> string[]`
    - 신규: [`--search`(Scouter만)] `exec --json -C <worktree> -m <m> -c model_reasoning_effort=<JSON> -c developer_instructions=<JSON> -c sandbox_mode=<JSON> -c approval_policy="never" -o <resultPath> -`
    - resume: `exec resume <threadId> --json -m <m> -c model_reasoning_effort=<JSON> -c developer_instructions=<JSON> -c sandbox_mode=<JSON> -c approval_policy="never" -o <resultPath> -`
    - resume에는 `-C`·`--sandbox`가 없고 cwd는 supervisor가 지정합니다(P-5).
    - TOML 값은 `JSON.stringify`로 인코딩합니다.
  - `argsDigest(args) -> 'sha256:…'`
- 제공(Produces), `role-observe.mjs`
  - `createLineParser(onLine, {maxLineBytes=1048576}) -> {push(buffer), end()}`: 줄을 넘는 청크를 결합하고, 초과 줄은 버리면서 `overflow` 표시를 남깁니다.
  - `normalizeClaudeStreamEvent(obj) -> {kind:'init'|'result'|'other', sessionId?, model?, tools?, permissionMode?, isError?, resultText?}|null`
  - `normalizeCodexStreamEvent(obj) -> {kind:'thread'|'turn_completed'|'turn_failed'|'warning'|'other', threadId?, message?}|null`: `type=error` item은 `warning`으로 봅니다.
  - `eventRecord(normalized) -> object`: `events.jsonl`용으로 `resultText`·`message`를 제외한 필드만 남깁니다.
  - `matchModel(requested, observed) -> boolean`: `/^[a-z]+$/`인 요청은 별칭으로 보고 `observed.split('-').includes(requested)`, 그 밖은 `===`
  - `evaluateClaudeInit({init, expected:{tools, permissionMode, model}}) -> {reason:null|'permission_scope_mismatch'|'model_effort_mismatch', claims:{identity, model, permissions}}`
    - tools는 집합이 같아야 하고 `mcp__` 접두 도구가 없어야 합니다.
  - `readClaudeTranscriptEffort({claudeHome, sessionId}) -> Promise<string|null>`: `projects/*/<sessionId>.jsonl`에서 `output_config.effort` 또는 `effort` 필드만 읽습니다.
  - `readCodexTurnContext({codexHome, threadId, delegationNames}) -> Promise<{model, effort, sandboxMode, approvalPolicy, delegationObserved}|null>`
    - `sessions/` 아래 깊이 3 이내에서 파일 이름에 threadId가 들어 있는 `rollout-*.jsonl`을 찾습니다.
    - 필드 매핑은 G 샘플 모양을 따릅니다.
  - `evaluateCodexContext({context, expected:{model, effort, sandboxMode, approvalPolicy}, policy}) -> {reason, claims}`
    - G3 fail이면 permissions level 상한은 `operator-attested`
    - G5 wide이면 `permissions.details`에 `'writable-root-wider-than-worktree'`
  - `classifyFailure({exitCode, signal, terminal, messages}) -> 'auth_rejected'|'model_rejected'|'effort_rejected'|'invalid_output'|'execution_failed'`
    - 정규식: auth `/\b(401|unauthori[sz]ed|not logged in|authentication)\b/i`, model `/model\b.*\b(not found|not supported|does not exist|unavailable|invalid)\b/i`, effort `/(effort|reasoning)\b.*\b(invalid|unsupported|not supported)\b/i`
    - 터미널 이벤트가 없으면 `invalid_output`
  - `snapshotWorktree(worktree) -> Promise<{head, branch, entries:Map<path, string>}>`
    - `git status --porcelain=v1 -z --untracked-files=all`을 사용하고 Git 환경 정리는 `scope.mjs:23-25` 방식을 씁니다.
    - entries 값은 `상태코드 + ':' + sha256(내용|'deleted')`입니다.
  - `detectViolations({role, allowedPaths, before, after}) -> {reason:null|'permission_violation_observed', changedPaths:string[], headChanged:boolean}`

- [x] **Step 1: 실패 테스트 작성** (`tests/node/role-bridge-args.test.mjs`)
  - `parseCompositeProfile reads fixture-rendered Claude and Codex profiles for all five roles`: tools가 `lib/models/profiles.mjs:2-8`과 같고, instructions가 비어 있지 않습니다.
  - `parseCompositeProfile rejects missing model or malformed developer_instructions`
  - `Claude argv per role matches spec §5.5` (AC5)
    - Planner: `--permission-mode default`, `--tools Read,Grep,Glob`, `--settings` 없음
    - Implementer: `acceptEdits`와 `--settings` + G1 JSON
    - 공통: `--verbose`가 `stream-json` 뒤에 오고 `--effort`가 있으며, 마지막 인자가 플래그 값입니다(위치 프롬프트 없음).
    - G6 `strict`일 때만 `--strict-mcp-config`
  - `Claude resume argv re-specifies model, effort, tools, permission and settings` (AC11 일부)
  - `Codex argv per role matches spec §5.5` (AC6)
    - Scouter의 첫 인자는 `--search`, 다른 역할에는 없습니다.
    - `-c sandbox_mode="read-only"` 또는 `"workspace-write"`, `-o resultPath`, 마지막은 `-`
    - `--skip-git-repo-check`·`--sandbox` 없음, `developer_instructions`는 `JSON.parse` 가능한 값
  - `Codex resume argv uses exec resume <tid>, -c sandbox_mode and no -C or --sandbox` (AC11 일부)
  - `argv never contains environment secret values`: `ARC_FAKE_SECRET` 값이 어떤 인자에도 없습니다(AC7 일부).
- [x] **Step 2: 실패 테스트 작성** (`tests/node/role-observe.test.mjs`)
  - `line parser joins split chunks, ignores non-JSON and flags lines over 1 MiB` (Review Focus 4)
  - `Claude init/result normalize from fixtures; eventRecord drops result text`
  - `Codex thread/turn events normalize and type=error warning items are warnings` (픽스처 `codex-exec.jsonl`)
  - `matchModel follows D6`: `haiku`/`claude-haiku-5-5`는 true, `opus`/`claude-sonnet-5`는 false, `claude-haiku-5-5`/`claude-haiku-5-5`는 true, `gpt-5.5`/`gpt-5.5-mini`는 false
  - `evaluateClaudeInit detects extra tool, mcp__ tool, wrong permissionMode and model mismatch` (AC9, AC8)
  - `transcript effort read returns value or null when absent` (AC8, D5)
  - `rollout turn_context yields model, effort, sandbox and approval; spawn function_call sets delegationObserved` (AC8, AC9)
  - `evaluateCodexContext caps permissions at operator-attested when G3 failed and records wide writable root when G5 is wide`
  - `classifyFailure distinguishes auth, model, effort, missing terminal and unclassified` (AC14)
  - `detectViolations` (AC9, Review Focus 3), 임시 git 저장소에서:
    - 기존 dirty 파일을 건드리지 않은 읽기 전용 역할: `reason:null`
    - 읽기 전용 역할이 tracked 파일 수정: 위반
    - Implementer가 `allowedPaths` 안에서만 수정: `null`
    - Implementer가 밖을 수정하거나 untracked 생성: 위반
    - QA가 `allowedPaths:[]`에서 변경: 위반
    - `git commit`으로 HEAD 변경: `headChanged`이고 위반
    - cwd가 하위 디렉터리여도 루트 기준(Review Focus 5)
- [x] **Step 3: RED 확인**
  - 실행: `node --test tests/node/role-bridge-args.test.mjs tests/node/role-observe.test.mjs`
  - 기대: 모듈 부재로 FAIL
- [x] **Step 4: 구현** 위 인터페이스대로 작성합니다.
- [x] **Step 5: GREEN 확인** Step 3 명령이 PASS여야 합니다.
- [x] **Step 6: 등록(R)** 새 모듈 순서: `'role-bridge-args.mjs','role-observe.mjs'`
- [x] **Step 7: 회귀 확인** `npm test`가 G0 대비 새 실패 없음
- [x] **Step 8: 수용 후 커밋** (Orchestrator) `feat(runtime): bridge 인자와 실행 관측 판정`

**필수 QA (fresh):**
- 테스트와 등록 검사를 재실행합니다.
- 인자 표를 명세 §5.5·§5.7과 한 줄씩 대조합니다.
- 픽스처에 비밀이나 계정 정보가 없는지 확인합니다.

**보류 조건:**
- G 샘플의 필드 모양이 명세 §5.11과 다르면 Orchestrator에 반환합니다. 예를 들어 rollout에 effort가 없는 경우입니다.


**진행 기록 (2026-11-10, 분류: task progress record):** T2 수용. QA 지적 F-1(관측 불가 → `unverified` 라벨), F-2(Codex 권한 상한은 G3가 `pass`일 때만 해제), F-3(모든 `turn_context` 대조), F-4(성공 종료는 실패 분류하지 않음, `terminalError`는 호출자가 전달), F-5(rollout 파일명 `-<UUID>.jsonl` 접미 일치, 중복 시 관측 불가), F-7(압축 `.jsonl.zst` rollout을 `zlib.zstdDecompressSync`로 읽음, 불가 시 관측 불가)을 수정한 뒤 QA 재검증 통과(신규 27/27, 영향 파일 신규 실패 0). G3 기본값 `pass` 유지(검출 입증). T3는 `classifyFailure`에 `terminalError`를 반드시 전달해야 합니다.

---

## T3: supervisor, `run-dispatch`, `observe`, 사후 검출 연결

**목표:** detached supervisor로 bridge 자식을 실행합니다. 상태 전이, 즉시 대조, 타임아웃, 소실 판정, 산출물 수집을 처리합니다. `observe`는 bridge와 native를 모두 처리합니다. 자식 Hook 표식도 분리합니다.

**AC:** AC7, AC8, AC9, AC10. AC14(실행 중 분류), AC4(native observe 부분).

**파일:**
- 생성: `lib/runtime/role-supervisor.mjs`
- 수정:
  - `lib/runtime/role-dispatch-store.mjs`(heartbeat, cancel 표식)
  - `lib/runtime/role-bridge.mjs`(`runBridgeDispatch`, `recordRoleObservation`)
  - `lib/runtime/command.mjs`(`run-dispatch`, `observe` 입력)
  - `lib/runtime/adapters/claude.mjs`, `lib/runtime/adapters/codex.mjs`(`ARC_BRIDGE_CHILD`)
- 등록(R)
- 테스트:
  - 생성: `tests/node/role-bridge-run.test.mjs`
  - 수정: `tests/node/runtime-claude.test.mjs`, `tests/node/runtime-codex.test.mjs`(표식 케이스 추가)

**인터페이스:**
- 사용(Consumes): T1 `withRoutingLock`, `readActivation`, store, policy. T2의 모든 export.
- 제공(Produces)
  - store 추가 함수
    - `writeHeartbeat(codexHome, dispatchId, {at, pid})`, `readHeartbeat(codexHome, dispatchId) -> {at, pid}|null`
      - 파일 `<dispatchId>.heartbeat.json`을 supervisor 단독으로 씁니다. 잠금이 필요 없습니다.
    - `requestCancel(codexHome, dispatchId)`, `cancelRequested(codexHome, dispatchId) -> boolean`
      - 파일 `<dispatchId>.cancel`입니다. T4가 사용합니다.
  - `role-supervisor.mjs`
    - `processStartTime(pid) -> string|null`: `ps -o lstart= -p <pid>`, `LC_ALL=C`
    - `processAlive({pid, startTime}) -> boolean`
    - `startSupervisor({codexHome, dispatchId}) -> Promise<{pid, startTime}>`: `process.execPath`로 이 파일을 `detached:true`, `stdio:'ignore'`로 띄우고 unref합니다. 환경은 상속합니다.
    - `runSupervisor({codexHome, dispatchId, env, timeoutMs?, graceMs?, heartbeatMs?}) -> Promise<void>`: 테스트 주입 지점입니다.
    - 모듈이 직접 실행되면 `argv[2]`, `argv[3]`로 `runSupervisor`를 호출합니다.
  - `role-bridge.mjs`
    - `runBridgeDispatch({context, dispatchId, brief}) -> Promise<DispatchResult & {resultPath}>`
    - `recordRoleObservation({context, dispatchId, waitMs?, event?, nativeAgentId?, now?, lostMs?}) -> Promise<DispatchResult>`
- **supervisor 절차**
  1. lease와 brief 파일을 읽습니다.
  2. `resolveLocalCli`를 상속 환경으로 다시 해석합니다. 환경 값은 저장하지 않습니다.
  3. 프로필을 다시 읽고 해시를 대조합니다.
  4. 사전 스냅샷을 찍습니다.
  5. 자식을 `detached:true`로 spawn하고, `ARC_BRIDGE_CHILD=<dispatchId>`를 추가하고, stdin에 brief를 쓴 뒤 닫습니다.
  6. 잠금 아래에서 `running`, child pid와 시작 시각을 기록합니다.
  7. 줄 단위로 파싱합니다.
     - Claude init → `evaluateClaudeInit`
     - Codex thread → 최대 10초 동안 rollout을 폴링해 `evaluateCodexContext`
     - mismatch면 그룹 SIGTERM, 유예 후 SIGKILL, 그다음 `failed`
  8. heartbeat는 5초 간격, cancel 표식과 타임아웃을 확인합니다.
  9. 종료 후 처리
     - Claude는 transcript effort를 읽습니다.
     - 사후 스냅샷과 `detectViolations`를 실행합니다.
     - 결과를 씁니다. Claude는 `result.md`에 `resultText`, Codex는 `-o` 파일이 `resultPath`입니다.
     - `record.json`을 씁니다.
     - 잠금 아래 terminal 상태와 claims를 기록합니다.
  10. 유예 후에도 종료를 관측하지 못하면 `unknown`입니다.
- **`run-dispatch`**
  - 입력 검증: `brief`는 문자열이고 UTF-8 바이트가 1 이상 262144 이하여야 합니다. 아니면 deny `invalid_request`입니다.
  - 잠금 아래에서 lease가 `reserved`인 bridge인지 확인합니다. 아니면 deny `invalid_request`이며 자식을 만들지 않습니다(Review Focus 2).
  - 같은 잠금 아래에서 `readActivation(lease.revision)`, 프로필 해시와 `lease.profileHash`를 대조합니다. 불일치면 hold `activation_unverified`입니다.
  - 산출물 디렉터리(0700)와 `brief.md`(0600)를 씁니다.
  - `startSupervisor` 후 `starting`, supervisor identity, `argsDigest`, `resultPath`를 기록합니다.
  - 출력은 `routeStatus:'starting'`, 종료 0입니다.
- **`observe`**
  - bridge이고 `waitMs`가 있으면 500ms 간격으로 상태 변화 또는 마감까지 기다립니다. `waitMs`는 540000을 넘으면 deny입니다.
  - 비터미널이면서 heartbeat가 `lostMs`(기본 30000)보다 오래됐고, supervisor `processAlive`가 false이고, terminal 기록이 없으면 잠금 아래 `unknown` + `terminal_state_unverified`로 바꿉니다.
  - native이면 `event`가 필수입니다. 허용 전이는 `reserved→running`(`started`, `nativeAgentId` 필수)과 `running→completed|failed|cancelled`이고, 그 밖은 deny입니다. claims는 operator-attested입니다.
- **adapters:** `runClaudeGate`·`runCodexGate`는 `(context.env ?? process.env).ARC_BRIDGE_CHILD`가 있으면 SubagentStart·PostToolUse 기록을 하지 않고 `{}`를 반환합니다. PreToolUse 판정은 바꾸지 않습니다.

- [x] **Step 1: 실패 테스트 작성** (`tests/node/role-bridge-run.test.mjs`, T1 fixture와 fake CLI 사용)
  - `run-dispatch starts a detached supervisor and reaches completed with result.md` (AC10)
    - 반환 `starting`, 이후 `observe waitMs` 결과는 `completed`
    - fake 기록상 stdin이 brief와 같고, `resultPath` 파일이 있고, 산출물 디렉터리는 0700, 파일은 0600
  - `run-dispatch denies non-reserved, native, empty, non-string and 262145-byte briefs; accepts exactly 262144 bytes`
  - `second run-dispatch for the same dispatch is denied and no second child is spawned` (Review Focus 2): fake 기록 실행 횟수 1
  - `profile changed after prepare holds activation_unverified without spawning`
  - `Claude init with extra tool kills the child group and records failed permission_scope_mismatch` (AC9)
  - `Claude init model mismatch fails model_effort_mismatch; alias haiku with claude-haiku-5-5 completes with model runtime-observed` (AC8)
  - `missing transcript effort completes with effort unverified and supportStatus unverified` (AC8, D5)
  - `Codex rollout sandbox mismatch fails permission_scope_mismatch; spawn_agent call fails delegation_observed` (AC9)
  - `read-only role writing a tracked file fails permission_violation_observed; untouched pre-existing dirty file passes` (AC9, Review Focus 3)
  - `timeout kills the process group including a grandchild and records failed timeout` (AC10): `runSupervisor({timeoutMs:300, graceMs:200})`를 프로세스 안에서 호출하고, 손자 pid가 사라졌는지 확인합니다.
  - `child ignoring SIGTERM is SIGKILLed after grace` (AC10)
  - `killed supervisor leads observe to unknown terminal_state_unverified and the lease still counts toward capacity` (AC10)
    - supervisor에 SIGKILL을 보낸 뒤 `observe({now:+31s})`
    - 이어서 `prepare-dispatch`가 concurrency=1에서 `capacity_exhausted`
  - `PID reuse: alive pid with different start time is treated as dead` (AC10)
  - `secret environment values never appear in argv record, lease, heartbeat, dispatch directory files or command stdout` (AC7)
  - `events.jsonl holds only normalized fields and truncates at the configured cap with record flag` (AC7): 상한 주입 1 KiB
  - `non-JSON lines and missing result event produce failed invalid_output without crashing` (Review Focus 4, AC14)
  - `auth, model and effort error streams classify to distinct failed reasons; no retry or substitution` (AC14): fake 실행 횟수 1
  - `supervisor lease writes during concurrent prepare-dispatch never surface activation_unverified` (Review Focus 1): 병렬 prepare 20회와 실행 중 supervisor
  - `native observe started→completed records operator-attested claims; invalid transitions are denied` (AC4)
  - `cwd in a subdirectory uses the worktree root for -C and snapshots` (Review Focus 5)
- [x] **Step 2: 실패 테스트 작성** (`tests/node/runtime-claude.test.mjs`, `tests/node/runtime-codex.test.mjs`)
  - `SubagentStart with ARC_BRIDGE_CHILD is not recorded`: `recordPlannerAgentObservation` 호출 0회, 반환 `{}`
- [x] **Step 3: RED 확인**
  - 실행: `node --test tests/node/role-bridge-run.test.mjs tests/node/runtime-claude.test.mjs tests/node/runtime-codex.test.mjs`
  - 기대: FAIL
- [x] **Step 4: 구현** 위 인터페이스와 절차대로 작성합니다.
- [x] **Step 5: GREEN 확인** Step 3 명령이 PASS여야 합니다.
- [x] **Step 6: 등록(R)** 새 모듈 순서: `'role-supervisor.mjs'`
- [x] **Step 7: 회귀 확인** `npm test`가 G0 대비 새 실패 없음이고 남은 자식 프로세스가 없어야 합니다(`ps`로 fake 이름 확인).
- [x] **Step 8: 수용 후 커밋** (Orchestrator) `feat(runtime): bridge supervisor 실행과 관측`

**필수 QA (fresh):**
- 테스트와 등록 검사를 재실행합니다. 같은 테스트를 3회 반복해 시간 의존 불안정성이 없는지 확인합니다.
- 정적 확인
  - supervisor 이외의 경로가 자식을 spawn하지 않는지
  - terminal 상태가 종료 관측 뒤에만 기록되는지
  - `unknown`이 슬롯을 해제하지 않는지
  - Hook 표식이 기록만 끄는지

**보류 조건:**
- macOS나 Linux에서 `ps -o lstart=`를 쓸 수 없으면 반환합니다.
- detached supervisor가 테스트 환경에서 살아남지 못하면 G2와 별개 문제로 보고 반환합니다.


**진행 기록 (2026-11-11, 분류: task progress record):** T3 수용. QA 지적 F1(timeout·cancel 시 리더가 먼저 죽어도 유예 뒤 그룹 SIGKILL, 그룹 소멸 확인 후에만 종료 상태 기록), F2(supervisor 직접 실행 가드가 import 시 예외 → `runtime-cli` 신규 실패), F3(세션 ID 미확보 → 명세 §5.10대로 `unknown`+`execution_identity_unverified`), F5(c)(예외 경로에서 실제 pid·`spawned` 기록, 생존 시 `unknown` 기록), AC9 테스트 공백(permissionMode·MCP 노출·approval_policy)을 수정한 뒤 재검증 통과(`role-bridge-run` 30/30, 무부하·부하 반복, 신규 실패 0). 처분: `observe`의 failed·unknown은 hold(종료 코드 3), supervisor 단계 activation·argsDigest 불일치는 `failed`, 테스트 전용 주입 옵션(`afterSpawn`, `signalGroup`)은 외부 경로 없음을 확인하고 수용. 이전 QA 인스턴스는 세션 중단으로 사용할 수 없어 교체했습니다. Implementer는 F1~F3에서 TDD 순서를 지키지 못했다고 자진 보고했습니다(이전 버전으로 RED 재현).

---

## T4: `resume`, `cancel`, 게시 차단

**목표:** 같은 세션으로만 재개합니다. 종료를 관측해야 cancel이 확정됩니다. 비터미널 bridge lease가 있으면 복합 설정 게시를 차단합니다.

**AC:** AC11, AC12. AC10의 cancel 부분.

**파일:**
- 수정:
  - `lib/runtime/role-bridge.mjs`(`resumeRoleDispatch`, `cancelRoleDispatch`)
  - `lib/runtime/role-supervisor.mjs`(segment 실행)
  - `lib/runtime/command.mjs`(`resume`, `cancel`)
  - `lib/installer/role-routing.mjs`(`publishCompositeFiles`)
  - `lib/management/operations.mjs`(게시 차단 메시지)
- 등록(R)
- 테스트:
  - 생성: `tests/node/role-bridge-resume.test.mjs`, `tests/node/role-routing-publish.test.mjs`
  - 수정: `tests/node/management-operations.test.mjs`(메시지 1건)

**인터페이스:**
- 사용(Consumes): T3 전체, T2 `buildClaudeArgs`/`buildCodexArgs`의 `sessionId`·`threadId`
- 제공(Produces)
  - `resumeRoleDispatch({context, dispatchId, brief}) -> Promise<DispatchResult & {resultPath, segment}>`
    - 상태가 `completed|failed`가 아니면 deny `invalid_request`
    - `sessionId`가 없으면 hold `execution_identity_unverified`
    - 활성 revision이 `lease.revision`과 다르면 hold `revision_changed`
    - T1의 버전, 인증, 게이트, 환경 검사를 다시 적용합니다.
    - `segment+1`, `segments/<n>/{brief.md, events.jsonl, result.md}`, `resultPath` 갱신, supervisor 시작
    - 입력에 세션 ID 필드는 없습니다. 기록된 값만 씁니다.
  - `cancelRoleDispatch({context, dispatchId}) -> Promise<DispatchResult>`
    - native이면 deny
    - terminal이면 현재 상태로 allow하고 신호를 보내지 않습니다.
    - 비터미널이면 잠금 아래 `requestCancel`을 하고, child identity가 확인되면 그룹 SIGTERM을 보낸 뒤 `routeStatus:'cancelling'`을 반환합니다.
    - supervisor는 표식을 보고 10초 유예 후 SIGKILL을 보내고, 종료를 관측하면 `cancelled`를 기록합니다.
  - `publishCompositeFiles`: 잠금 획득 직후 `listLeases(targets.codex.home)`를 확인합니다. bridge이면서 `NON_TERMINAL_STATES`인 lease가 있으면 `TargetConfigurationError`를 던지며 `activation='held'`, `activeDispatches=[ids]`를 붙입니다. lease 목록을 읽지 못해도 같은 오류(`activeDispatches:null`)입니다.
  - `executeCompositeOperation` catch에서 `error.activeDispatches`가 있으면 `messages`에 `` `Active bridge dispatches: ${ids.join(', ')}` ``를 추가합니다.

- [x] **Step 1: 실패 테스트 작성** (`tests/node/role-bridge-resume.test.mjs`)
  - `resume of completed Claude dispatch runs claude -p --resume <sid> with all flags re-specified and writes segments/1` (AC11)
  - `resume of failed Codex dispatch runs exec resume <tid> with -m, model_reasoning_effort and sandbox_mode, without -C or --sandbox` (AC11)
  - `resume is denied for reserved, running, unknown and cancelled; held revision_changed after a new revision is active; held execution_identity_unverified without sessionId` (AC11)
  - `resume input cannot carry a session id` (AC11): 키 `sessionId`가 있으면 deny
  - `cancel running dispatch sends SIGTERM to the group and records cancelled only after exit` (AC10): 반환은 `cancelling`, 이후 `observe`가 `cancelled`
  - `cancel of TERM-ignoring child escalates to SIGKILL after grace` (주입 `graceMs:200`)
  - `cancel is a no-op on terminal and denied on native`
- [x] **Step 2: 실패 테스트 작성** (`tests/node/role-routing-publish.test.mjs`)
  - 픽스처 패턴은 `tests/node/transaction.test.mjs`의 safeFs 구성을 따릅니다.
  - `publish is refused with activation held and dispatch ids while a bridge lease is reserved, starting, running or unknown` (AC12)
  - `native non-terminal lease and terminal bridge leases do not block publication` (AC12)
  - `unreadable lease directory refuses publication`
  - `management-operations.test.mjs`: `active dispatch message is surfaced`
- [x] **Step 3: RED 확인**
  - 실행: `node --test tests/node/role-bridge-resume.test.mjs tests/node/role-routing-publish.test.mjs tests/node/management-operations.test.mjs`
  - 기대: FAIL
- [x] **Step 4: 구현** 위 인터페이스대로 작성합니다.
- [x] **Step 5: GREEN 확인** Step 3 명령이 PASS여야 합니다.
- [x] **Step 6: 등록(R)**과 매니페스트(`lib/installer`, `lib/management` 변경 포함)
- [x] **Step 7: 회귀 확인** `npm test`가 G0 대비 새 실패 없음
- [x] **Step 8: 수용 후 커밋** (Orchestrator) `feat(runtime): bridge 재개·취소와 게시 차단`

**필수 QA (fresh):**
- 테스트와 등록 검사를 재실행합니다.
- 정적 확인
  - 게시 차단이 잠금 획득 뒤, 쓰기 전에 실행되는지
  - resume이 새 QA·Reviewer 배정에 세션을 재사용할 경로가 구조상 없는지(새 배정은 새 dispatchId)

**보류 조건:**
- T5 이후 마이그레이션에서 기존 활성 리비전 게시 흐름과 충돌하면 반환합니다.


**진행 기록 (2026-11-11, 분류: task progress record):** T4 수용. `resume`·`cancel`·게시 차단을 구현했고, T1에서 이관한 `reserved` 고아 lease 정리도 `cancel`로 동작합니다. Orchestrator 결정에 따라 resume에 동시 실행 한도 검사(누적 수는 늘리지 않음)와 세션 ID 불일치 시 `unknown` 처리를 추가했습니다. QA 지적 F1(Codex Scouter resume에 top-level `--search`)과 F2(cancel 테스트 전제)를 수정하고 `starting` 상태 cancel 테스트를 추가한 뒤 재검증을 통과했습니다(격리 20회·부하 3회, 신규 실패 0). 처분: supervisor가 소실됐고 자식 기록이 없는 `starting` lease는 종료를 관측할 수 없으므로 보류를 유지하며, 수동 정리 안내를 T6 지침에 포함합니다. 테스트 안정화를 위해 `role-routing-dispatch` 테스트의 probe 타임아웃 주입값만 올렸고 제품 기본값은 그대로입니다.

---

## T5: native 프로필 revision 태그

**목표:** 설치기가 `arc-routing-*` 프로필의 description에 `[arc-routing rev <revision>]`를 넣고, 그 바이트로 마커 해시를 계산합니다(명세 §5.4).

**AC:** AC4의 설치기 부분.

**파일:**
- 수정: `lib/installer/role-routing.mjs`(`renameCompositeProfile(bytes, platform, role, revision)`), 같은 파일의 `prepareCompositeFiles` 호출부
- 매니페스트
- 테스트: 생성 `tests/node/role-routing-install.test.mjs`. T1 fixture가 태그된 바이트를 쓰도록 `tests/node/role-fixtures.mjs`도 수정합니다.

**인터페이스:**
- 사용(Consumes): T1 `revisionTag`
- 제공(Produces): `renameCompositeProfile(bytes, platform, role, revision) -> Buffer`
  - Codex: 루트 `description = "<기존>"` 한 줄의 닫는 따옴표 앞에 `` ` ${revisionTag(revision)}` ``를 추가합니다.
  - Claude: frontmatter `description: <기존>` 줄 끝에 추가합니다.
  - description 줄이 정확히 하나가 아니거나 revision이 `/^[A-Za-z0-9._-]{1,128}$/`를 만족하지 않으면 `TargetConfigurationError('Composite revision cannot be tagged')`를 던집니다(P-6). TUI는 `randomUUID()`를 씁니다.

- [ ] **Step 1: 실패 테스트 작성**
  - `composite profiles carry the revision tag on both platforms and markers hash the tagged bytes`
    - Codex description을 TOML로 파싱한 값이 `` `… [arc-routing rev ${rev}]` ``로 끝납니다.
    - Claude frontmatter description도 같은 태그로 끝납니다.
    - 마커 `profiles.*.hash`가 파일 sha256과 같습니다.
  - `routing-status revisionTag equals the tag inside the installed profile`
  - `untaggable revision is rejected before publication`
  - `standard arc-* profiles are unchanged`
- [ ] **Step 2: RED 확인**
  - 실행: `node --test tests/node/role-routing-install.test.mjs`
  - 기대: FAIL
- [ ] **Step 3: 구현** 위 인터페이스대로 작성합니다.
- [ ] **Step 4: GREEN 확인**
  - 실행: Step 2 명령과 `node --test tests/node/role-routing-dispatch.test.mjs tests/node/role-bridge-run.test.mjs`
  - 기대: PASS
- [ ] **Step 5: 매니페스트와 회귀 확인** `node scripts/update-manifest.mjs`, `npm run check:manifest`를 실행하고, `npm test`가 G0 대비 새 실패 없음
- [ ] **Step 6: 수용 후 커밋** (Orchestrator) `feat(installer): native 프로필 revision 태그`

**필수 QA (fresh):** 테스트를 재실행하고, 태그된 Claude 프로필이 `lib/models/profiles.mjs`의 프로필 검증 규칙과 충돌하지 않는지 정적으로 확인합니다.

**보류 조건:** 태그 삽입이 기존 설치의 프로필 소유권 대조(`inspectCompositeRemoval`)를 깨면 반환합니다.

---

## T6: 지침, 문서, 결과 문구, `cooperative-7`, 옵트인 실제 스모크

**목표:** 두 하네스 지침을 실제 실행 절차로 교체하고 사실 오류를 정정합니다. 문서와 결과 문구를 바꾸고, 런타임 버전을 올리고 마이그레이션을 안내합니다. 실제 CLI 스모크도 추가합니다.

**AC:** AC15, AC16, AC17. AC4·AC13의 지침 부분.

**파일:**
- 수정: 두 하네스의 `skill/references/coordination.md`, `limits.md`, `handoff.md`(claude와 codex 각각), `docs/harness-operation.md`, `README.md`, `lib/management/operations.mjs`(`:76`, `:87` 문구), `lib/runtime/bootstrap.mjs`(`runtime:'cooperative-7'`)
- 등록(R)
- 테스트:
  - 수정: `tests/node/runtime-versions.test.mjs`(`'cooperative-7'`, `baselineHash`). `rg -n "cooperative-6" tests lib` 결과 중 현재 버전을 단언하는 곳도 수정합니다.
  - 생성: `tests/node/composite-instructions.test.mjs`, `tests/node/composite-live.test.mjs`(`ARC_LIVE_CLI_TESTS=1`이 아니면 `test.skip`)

**지침 내용** (명세 §5.12, 기존 파일과 같은 영어 작성, 관리 정책 섹션은 수정 금지)
- 두 `coordination.md`
  - `## Composite Platform Role Preflight`를 `## Composite Platform Role Dispatch`로 교체합니다.
  - `$ARC_RUNTIME_ENTRY`는 `planning.md` 해당 앵커(claude :159, codex :167)를 링크합니다.
  - 절차 순서와 각 명령의 입력 키를 적습니다.
  - native 이름 매핑을 적습니다: Claude `arc-routing-<suffix>`, Codex `arc_routing_<suffix>`. `:20` 옆에 둡니다.
  - native 스폰 전에 revision 태그를 비교하고, 불일치면 "새 세션 필요"로 보류하며, 모델 인자를 금지합니다.
  - `observe`는 한 번에 최대 대기를 쓰고 짧은 폴링 루프를 금지합니다.
  - Codex 호스트에서는 매번 승격 승인을 받습니다.
  - 실패 시 폴백하지 않고 사유를 보고합니다.
  - 정정: `execution_identity_unverified`는 run·observe·resume 단계의 사유입니다. 인증·버전 probe는 자식 프로세스를 실행합니다.
- 두 `limits.md:31`: bridge dispatch의 원장 계수, ARC의 bridge 상한 강제, native+bridge 합산은 원장, `unknown`은 슬롯 유지, 역할별 고정 타임아웃, 터미널 lease 30일 자동 정리
- 두 `handoff.md`: bridge 결과는 `resultPath`의 최종 메시지, brief는 고정 순서이며 stdin 전용
- `docs/harness-operation.md`
  - §5.9 지원 등급표
  - Desktop 수동 체크리스트: 호스트 CLI 탐색, 인증 공유, 같은 worktree, supervisor 생존, 승격, native 태그 확인
  - `cooperative-7` 마이그레이션: Install/Update를 다시 실행해야 함
  - README의 해당 문단도 같은 등급으로 고칩니다.
- `operations.mjs`: `'Role execution: held / unverified.'`를 `'Role execution: per-role status via routing-status.'`로 바꾸고, `:76`의 `support` 사유 문구도 같은 의미로 바꿉니다.

- [ ] **Step 1: 실패 테스트 작성** (`tests/node/composite-instructions.test.mjs`)
  - `both coordination references define Composite Platform Role Dispatch with the six commands, native names and planning link`: 각 파일에 `routing-status`, `prepare-dispatch`, `run-dispatch`, `observe`, `resume`, `cancel`, `arc-routing-`(claude)·`arc_routing_`(codex), `planning.md#`가 있고, `Composite Platform Role Preflight`는 없어야 합니다.
  - `the two harness sections state the same rules`: 정규화한 규칙 문장 목록(플랫폼 이름 치환 후)이 같습니다.
  - `incorrect statements are removed`: "does not … start the peer CLI", "this command holds before launch with reason `execution_identity_unverified`"가 없어야 합니다.
  - `limits and handoff references mention bridge counting, unknown slot retention, fixed timeouts, 30-day pruning, resultPath and stdin-only brief`
  - `operations result no longer reports held / unverified`(`management-operations.test.mjs` 단언 추가)
  - `runtime-versions.test.mjs`: `'cooperative-7'`
- [ ] **Step 2: RED 확인**
  - 실행: `node --test tests/node/composite-instructions.test.mjs tests/node/runtime-versions.test.mjs tests/node/management-operations.test.mjs`
  - 기대: FAIL
- [ ] **Step 3: 지침, 문서, 문구, 버전 수정**
- [ ] **Step 4: 옵트인 스모크 작성** (`tests/node/composite-live.test.mjs`)
  - 실제 PATH의 CLI를 쓰고, 임시 git 저장소와 실제 사용자 홈을 사용합니다. 기존 활성 설정이 필요하며, 없으면 skip 사유를 출력합니다.
  - 케이스: 호스트 claude → codex bridge, 호스트 codex → claude bridge 각각에 대해
    - Planner(읽기 전용) 완료, claims model `runtime-observed`
    - Implementer 쓰기 1건이 `allowedPaths` 안에서 완료
    - resume 1회
    - 자식 transcript·rollout에 ARC `SKILL.md` 로드 흔적이 없음(재귀 없음)
- [ ] **Step 5: GREEN 확인** Step 2 명령이 PASS, `npm run check:role-policy`가 종료 0
- [ ] **Step 6: 등록(R)과 회귀 확인**
  - `npm test`가 G0 대비 새 실패 없음이고, 스모크는 skip으로 표시되어야 합니다.
- [ ] **Step 7: 실제 스모크 실행** (QA, 모델 호출 비용 발생)
  - 실행: `ARC_LIVE_CLI_TESTS=1 node --test tests/node/composite-live.test.mjs`
  - 기대: PASS. 실패하면 수용을 보류하고 결과를 기록합니다.
- [ ] **Step 8: 수용 후 커밋** (Orchestrator) `docs(arc): 복합 역할 실행 지침과 런타임 버전 상향`

**필수 QA (fresh):**
- Step 2·5·6·7을 재실행합니다.
- 두 하네스 지침이 의미상 같은지, 관리 정책 섹션이 바뀌지 않았는지(`npm run check:role-policy`) 확인합니다.
- `cooperative-7` 상향 때문에 진행 중인 workflow 상태(`state.versions`)가 어떻게 처리되는지 확인해 기록합니다(P-7).

**보류 조건:**
- 실제 스모크에서 G 결과와 다른 동작이 관측되면 정책 상수를 고치지 말고 Orchestrator에 반환합니다.
- CLI가 미인증이면 스모크를 보류하고 그 사실을 기록합니다.

---

## F: 최종 Reviewer (1회)

- **시점:** T1–T6이 수용·커밋되고 필수 QA와 QA 재확인이 끝난 뒤
- **범위:** G0 착수 HEAD부터 T6 커밋까지 전체 변경
- **위험 기준 초점:**
  - 권한 경계: 읽기 전용 역할, Implementer 경로, 재위임, Git
  - 비밀 비노출
  - 잠금과 lease 일관성: 슬롯 유지, 잔여 잠금, 게시 차단
  - 프로세스 수명주기: 고아·손자 프로세스, PID 재사용, unknown 처리
  - 명세 §8 완화 범위를 넘지 않는지
  - 두 하네스 지침의 의미 동일성
- **finding 처리:** Implementer → Reviewer 재확인 순으로 진행하고 QA를 재배정하지 않습니다. 수정은 Reviewer 재확인까지 미커밋으로 유지하고, 수용 후 focused 후속 커밋 1개를 만듭니다.

## AC 추적

| AC | 작업 | 근거 |
|---|---|---|
| AC1 | T1 | `routing-status` 테스트 |
| AC2 | T1 | 판정표 테스트 |
| AC3 | T1 | 중복, 한도, 잠금 테스트 |
| AC4 | T5(태그), T3(native observe), T6(지침) | 설치·observe·지침 테스트 |
| AC5, AC6 | T2 | argv 테스트 |
| AC7 | T2(argv), T3(산출물·비밀) | 비밀 검색 테스트 |
| AC8 | T2(판정), T3(통합), T6(스모크) | 픽스처·통합·스모크 |
| AC9 | T2, T3 | 권한 대조와 위반 테스트 |
| AC10 | T3, T4(cancel) | 수명주기 테스트 |
| AC11 | T2(argv), T4, T6(스모크) | resume 테스트 |
| AC12 | T4 | 게시 차단 테스트 |
| AC13 | T1(판정), T6(문서·체크리스트) | 환경 판정 테스트, 문서 |
| AC14 | T1(시작 전), T2(분류), T3(통합) | 분류 테스트 |
| AC15 | T6 | 지침 텍스트 테스트 + Reviewer |
| AC16 | T1–T6(R), T6(버전) | 인벤토리·해시·매니페스트 검사 |
| AC17 | T1–T4(fake CLI), T6(옵트인 스모크) | 테스트 실행 기록 |
| AC18 | G1–G7, T1(판정), T2(라벨) | 게이트 기록과 판정 테스트 |
| AC19 | T1 | 버전 범위 테스트 |
| AC20 | T1 | 정리 테스트 |

---

## 자기 검토

1. **명세 대응**
   - §5.1–§5.14와 AC1–AC20이 모두 작업에 대응합니다(AC 추적 표).
   - §7 게이트는 커밋 없는 G 단계로 두었고, 그 결과는 `role-dispatch-policy.mjs` 상수와 T2 픽스처로만 흐릅니다.
   - O1(고정 타임아웃)과 O2(하한+상한 단일 상수)는 T1, O3(30일 정리)은 T1에 반영했습니다.
2. **단계 점검**
   - 각 단계에 시그니처, 파일, 명세 값, 테스트 이름과 단언을 적었습니다.
   - 함수 본문은 알고리즘이 정해지지 않은 곳(D6 판정, 분류 정규식, 판정 순서, supervisor 절차)에만 요약했습니다.
3. **이름과 타입 일관성**
   - `withRoutingLock`, `readActivation`, `DispatchResult`, `renameCompositeProfile`, `profileName`, `revisionTag`, `NON_TERMINAL_STATES`, `requestCancel`/`cancelRequested`, `buildClaudeArgs`/`buildCodexArgs`(`sessionId`/`threadId`)를 정의한 작업과 사용하는 작업에서 같은 이름으로 썼습니다.
   - 어댑터의 기존 `normalizeClaudeEvent`와 겹치지 않도록 `normalizeClaudeStreamEvent`로 이름을 정했습니다.
4. **Review Focus** 다섯 항목 모두 담당 작업에 테스트를 배치했습니다.
5. **분량** 코드 블록 없이 인터페이스와 테스트 단언 중심으로 썼습니다. 명세보다 길지만 작업 6개, 게이트 8개, 테스트 이름 나열이 대부분입니다.
6. **ARC 규칙**
   - 최상위 작업 하나는 커밋 하나이고, 작업마다 fresh QA를 두고, 최종 Reviewer는 한 번만 둡니다. Reviewer를 작업별 검사로 넣지 않았습니다.
   - 같은 파일 동시 편집을 막기 위해 전부 순차로 진행합니다(사유: 공유 매니페스트).
   - `lib/tui/*`는 제외했습니다.
   - 매니페스트, 복제본, 해시 묶음은 각 작업 안의 등록 절차(R)로 묶었습니다.
7. **형식 편차**
   - writing-plans의 기본 헤더 문구(agentic workers 안내, superpowers 하위 스킬 지정)는 ARC 배정 절차 안내로 대체했습니다.
   - 실행 방식 선택 질문은 Orchestrator 단계로 넘깁니다.

## 확인 필요 사항 (Orchestrator 판단 또는 사용자 확인)

- **P-1. 기존 인벤토리·해시 테스트 정비:** `tests/node/runtime-assets.test.mjs:7-14`, `tests/node/runtime-versions.test.mjs:20-24`의 목록은 `local-cli.mjs`, `role-*.mjs`가 빠져 현재 인벤토리와 다릅니다. 고정된 `baselineHash`도 기준선에서 실패할 가능성이 큽니다(G0에서 확인). 계획은 이 목록들을 T1에서 현재 인벤토리로 맞추고 이후 작업마다 `baselineHash`를 갱신합니다. 새 모듈 등록과 분리할 수 없다는 판단이지만, 기준선 실패 테스트를 고치는 범위 확장이기도 합니다.
- **P-2. 새 사유 코드 `execution_failed`:** 명세 §5.10에 없는 코드입니다. 비정상 종료가 인증·모델·effort 어느 쪽으로도 분류되지 않을 때 씁니다. 대안은 `invalid_output`으로 합치는 것인데, 의미가 부정확해집니다.
- **P-3. lease 필드 추가:** `allowedPaths`, `resultPath`, `segment`, `nativeAgentId`. 명세 §5.6 필드 목록을 확장하는 것입니다. 사후 검출, 재개, native 기록에 필요합니다.
- **P-4. `limits.toml` 해석 실패 시 사유:** 계획은 `activation_unverified`로 처리합니다. `capacity_exhausted`는 의미가 맞지 않다고 봤습니다.
- **P-5. Codex resume 인자:** `exec resume`이 `--json`, `-o`, `-`, `developer_instructions`를 받는지는 스파이크에서 일부만 확인됐습니다. 계획은 이를 가정하고 T6 실제 스모크로 확인하는데, G 단계에 추가 확인을 넣을지 판단이 필요합니다.
- **P-6. 태그 가능한 revision 문자 제한:** `/^[A-Za-z0-9._-]{1,128}$/`. TUI는 UUID를 씁니다. 수동으로 쓴 활성 문서가 이 형식이 아니면 게시를 거부합니다.
- **P-7. `cooperative-7` 상향의 영향:** 진행 중인 ARC workflow 상태(`state.versions.runtime`)에 영향을 줄 수 있습니다(`tests/node/runtime-target-preparation.test.mjs:278` 픽스처 참조). T6 QA에서 확인하고 기록하도록 했습니다.
- **P-8. Review Focus 1의 잔여 위험:** supervisor가 잠금을 잡은 순간 SIGKILL을 받으면 잠금 파일이 남고, 수동 확인 전까지 모든 판정과 게시가 보류됩니다. 기존 계약(자동 삭제 금지)을 그대로 따릅니다.

## 가정

1. G 단계 QA는 실제 계정으로 모델을 호출합니다. 명세 D10과 D2가 이를 허용합니다.
2. 테스트 실행 환경은 macOS 또는 Linux이며 `ps -o lstart=`를 쓸 수 있습니다.
3. 착수 시점에 작업 1이 커밋됐는지와 무관하게 `lib/tui/*`와 겹치지 않습니다. G0에서 착수 HEAD와 작업 트리 상태를 다시 기록합니다.
4. `tests/node/fixtures/` 하위 디렉터리는 `npm test` 글롭과 `MANIFEST.sha256`(tests 미포함)에 영향을 주지 않습니다.
5. CLI 동작 근거는 claude 2.1.322, codex-cli 0.167.0입니다.


## Orchestrator 검토와 확인 사항 처리 (2026-11-10)

검토 체크리스트(범위·근거, 대상·소유·경로, 정책 충돌, 작업 경계·의존·기준, 검증·증거·보류, 역할·승인·커밋 경계, 완결성)를 통과했습니다. P-1~P-8은 승인된 명세 범위 안의 구현 세부로 다음과 같이 처리합니다(계획 승인 시 함께 승인 대상).

- P-1 채택: 인벤토리·해시 테스트 정비는 새 모듈 등록과 분리할 수 없으므로 T1에 포함합니다. G0에서 해당 테스트의 기준선 실패 여부를 기록하고, 고친 범위를 T1 보고에 명시합니다.
- P-2 채택: 분류되지 않는 비정상 종료에 `execution_failed`(`failed`)를 추가합니다. 명세 §5.10 표에 행을 추가하는 문구 수정으로 반영합니다.
- P-3 채택: lease 필드 `allowedPaths`, `resultPath`, `segment`, `nativeAgentId`를 추가합니다. 명세 §5.6 필드 목록에 반영합니다.
- P-4 채택: `limits.toml` 해석 실패는 `activation_unverified`입니다.
- P-5 보강: Codex `exec resume`의 `--json`, `-o`, `-`, `developer_instructions` 수용 여부를 게이트 G8로 추가해 G 단계에서 확인합니다. 실패 시 Codex bridge resume은 `permission_scope_unverified`로 보류하고 새 dispatch만 지원합니다.
- P-6 채택: 태그 가능한 revision 형식 `/^[A-Za-z0-9._-]{1,128}$/`.
- P-7 채택: `cooperative-7` 상향이 진행 중 workflow 상태에 주는 영향을 T6 QA에서 확인·기록하고, 영향이 있으면 마이그레이션 안내에 포함합니다.
- P-8 수용: 잔여 잠금은 기존 계약대로 자동 삭제하지 않고 보고합니다.
- G2 실행 방법: QA는 대화형 Codex 호스트를 직접 구동할 수 없으므로, `codex exec`(workspace-write, 호스트 샌드박스 조건 재현) 안에서 detached·unref node 프로세스를 띄우고 반환 후 생존·`<CODEX_HOME>` 쓰기를 관측합니다. 대화형 호스트와의 차이는 한계로 기록합니다.
