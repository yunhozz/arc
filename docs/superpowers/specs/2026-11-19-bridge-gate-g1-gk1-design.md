# G1·GK1 bridge 게이트 pass 전환 spec

- 상태: 승인됨(v4, 2026-11-20).
- 기준: `fix/bridge-ps-stub` @ d5bae6a. 작업 대상은 현재 checkout입니다(사용자 선택).
- 경로: Architectural(보안 경계 변경). 위험도: high.
- 승인 근거: 2026-11-19 설계 승인(G1-B, K-B, Q4, Q5, Q6, GG1 제외), T0 측정 뒤 사용자 결정 1–3, Grok 버전 범위 유지(Q-A).
- 측정 근거: T0 실측(Claude 2.1.328, Grok 1.0.89 grok-4.7, macOS Seatbelt). 요약은 §10에 있습니다.

## 1. 목표와 비목표

### 목표
1. G1을 `pass`로 바꿉니다. 측정한 Claude sandbox settings(D1)를 `RECORDED_CLAUDE_SANDBOX_SETTINGS`에 기록하면 Claude bridge `arc_implementer`/`arc_qa`가 `--settings`와 함께 실행됩니다.
2. GK1을 `pass`로 바꿉니다. Grok bridge 쓰기 역할(`arc_implementer`, `arc_qa`)은 runtime이 dispatch마다 만드는 worktree `.grok/sandbox.toml` 사용자 정의 프로필로 실행합니다. 실행 뒤 `ProfileApplied` 이벤트로 적용을 확인하지 못하면 `completed`가 될 수 없습니다.
3. Grok `permission-sandbox-effect` 계약을 쓰기 역할 한정으로 verified 증거로 옮깁니다(Q5).
4. `docs/harness-operation.md`의 G1 행을 갱신하고 GK1 행을 추가합니다. :230에서 시작하는 번호 목록 앞에 빠진 도입 문장(M2)을 넣습니다(Q6).

### 비목표
- GG1, GG2, GK2, resume, Codex QA sandbox 실패 14건
- `supportStatus`나 claim level 상향(`permissions` claim level은 그대로)
- Grok 읽기 역할 sandbox 변경(`read-only`와 `--deny` 도구 규칙 유지, `read-role-permission-effect`는 미검증 유지)
- Grok `cli.supportedVersions`(`>=1.0.0 <1.1.0`) 변경(Q-A: 범위 유지)
- 사용자 설정 수정(`~/.grok/sandbox.toml`, `~/.grok/config.toml`, `~/.claude*`)

### 절대 금지
- sandbox 끄기, 승인 우회, 사용자 설정 수정
- 프로필 없이 Grok 쓰기 역할 실행, 적용 신호 없이 `completed`
- 사용자 `.grok/sandbox.toml` 덮어쓰기나 삭제, `~/.grok/sessions` 쓰기
- bridge 실행 중 커밋

## 2. 결정 기록

| ID | 결정 | 근거 |
|---|---|---|
| D1 | G1 settings는 `{"sandbox":{"enabled":true,"autoAllowBashIfSandboxed":true,"allowUnsandboxedCommands":false,"failIfUnavailable":true}}`이고 deep-freeze합니다(G1-B) | T0 M-C1, M-C2. 기존 fixture `tests/node/role-bridge-args.test.mjs:15`와 같은 의도 |
| D2 | `RECORDED_CLAUDE_SANDBOX_SETTINGS`와 `G1:'pass'`는 `lib/runtime/role-dispatch-policy.mjs`에 두고, 측정 버전과 예외를 주석으로 남깁니다. 복제본 `shared/skill/runtime/`은 `scripts/update-runtime-assets.mjs`로 생성합니다 | 설계 §3, S2 |
| D3 | M-C4(trust된 workspace에서 `.claude/settings*.json`이 sandbox를 넓히는지)는 T1의 선행 조건입니다. 넓히지 않으면 문서화만 하고, 넓히면 T1을 hold하고 사용자 결정을 받습니다 | 사용자 결정 3 |
| D4 | Grok 쓰기 역할 프로필은 `extends = "workspace"`에 deny 보강 목록을 더한 것입니다. `strict` 기반은 기각합니다(acceptEdits headless에서 첫 shell 명령이 `permission required ... headless run cannot ask for approval`로 취소됨. `restrict_network` true/false 모두 같음) | T0, 사용자 결정 1 |
| D5 | deny 목록은 순서를 고정한 frozen 상수 24개입니다. `".grok/sandbox.toml"`과 `"~/.grok/"` 아래 `skills`, `agents`, `rules`, `workflows`, `plugins`, `installed-plugins`, `plugin-data`, `personas`, `memory`, `memory-v2`, `AGENTS.md`, `statusline.sh`, `lsp.json`, `bin`, `downloads`, `bundled`, `bundles`, `settings.json`, `pager.toml`, `mcp_credentials.json`, `worktrees`, `workspaces`, `daemon`입니다 | T0 deny 보강안, 18-sandbox.md:189-201 |
| D6 | 프로필 이름은 `arc-bridge-<dispatchId 앞 8자>`입니다. `dispatchId`는 `crypto.randomUUID()`라서(`role-routing.mjs:246`) 앞 8자는 소문자 hex입니다. `/^[0-9a-f]{8}$/`에 맞지 않으면 인자를 만들지 않습니다(`permission_scope_unverified`). 이름은 lease `dispatchId`로만 정하므로 prepare와 supervisor의 `argsDigest`가 같습니다 | 사용자 결정 2, 18-sandbox.md:150, S4 |
| D7 | 프로필 파일은 dispatch마다 `O_EXCL`, 0444로 생성하고 해시를 검증한 뒤 정리합니다(K-B). "같은 바이트면 재사용" 분기는 삭제합니다. `<worktree>/.grok/sandbox.toml`이 어떤 형태로든(일반 파일, symlink, 디렉터리) 이미 있으면 hold합니다 | 설계 K-B, 사용자 결정 2 |
| D8 | `allowedPaths`가 `.grok/sandbox.toml`을 덮으면 hold합니다. 판정: `allowedBy(allowedPaths, '.grok/sandbox.toml')`이 참이거나, 항목이 `.grok`과 같거나 `.grok/`로 시작하는 경우 | 설계 K-B 2, `role-observe.mjs:289` |
| D9 | 새 reason code는 만들지 않습니다. 사전 hold는 `permission_scope_unverified`, 사후 적용 확인 실패는 `permission_scope_mismatch`(Q4), 사후 프로필 변조나 소실은 `permission_violation_observed`입니다 | 설계 A4, Q4 |
| D10 | Grok 홈은 registry의 `homes.grok` = `<userHome>/.grok`입니다. `GROK_HOME`이 설정되어 있으면 기존 동작대로 `activation_unverified`가 됩니다(`platform-registry.mjs:61-63`, `role-routing.mjs:66-72`). supervisor는 spawn 전에 세 가지를 확인합니다. runtime은 `localCliEnvironment`로 child env에 `GROK_HOME=homes.grok`을 항상 넣으므로(`local-cli.mjs:31`), child env `GROK_HOME`은 `homes.grok`과 정확히 같아야 하고 `invocation.childEnv`가 `GROK_HOME`을 덮지 않아야 하며, child env `HOME`이 있다면 realpath가 `userHome` realpath와 같아야 하고, `homes.grok`이 symlink가 아니어야 합니다(lstat). 하나라도 어긋나면 spawn하지 않습니다(`permission_scope_unverified`) | 18-sandbox.md:112, :189-191 |
| D11 | 적용 확인은 §3.3을 따릅니다. 이벤트 파일은 전역 append 파일이므로 spawn 직전 offset부터 읽고 spawn 시각 필터를 함께 적용합니다 | 사용자 결정 2, T0 M-K2 |
| D12 | 취소되고 적용 후보가 0건이면 `permission_scope_mismatch`를 붙이지 않고 기록만 합니다. 후보가 1건 이상인데 규칙에 맞지 않으면 붙입니다. 사용자 정의 프로필을 적용할 수 없으면 Grok이 시작을 거부하기 때문입니다 | `role-supervisor.mjs:403` 선례, 18-sandbox.md:303, T0 M-K4 |
| D13 | 게이트 순서: T2는 GK1을 `fail`로 둔 채 구현하고, T3에서 적용 확인과 함께 `pass`로 바꿉니다 | 설계 §4.3 |
| D14 | `permission-sandbox-effect`는 쓰기 역할만 verified로 옮기고, `read-role-permission-effect`는 미검증으로 유지합니다 | Q5 |
| D15 | 바뀌는 runtime 파일은 `lib/runtime/`에서 편집하고, `scripts/update-runtime-assets.mjs`로 `shared/skill/runtime/`에 같은 바이트로 반영합니다. 새 모듈은 `lib/installer/runtime-assets.mjs`의 `RUNTIME_MODULE_PATHS`와 `lib/runtime/bootstrap.mjs`의 `COOPERATIVE_RUNTIME_MODULES`에 등록하고, `tests/node/runtime-assets.test.mjs`·`tests/node/runtime-versions.test.mjs`의 기대 목록과 `tests/node/fixtures/installed-layout-golden.json`(`node tests/node/fixtures/installed-layout.mjs --write`)을 함께 갱신합니다. 설치본(`~/.claude/skills/...`)은 편집하지 않습니다 | S2 |
| D16 | Grok 버전 범위는 바꾸지 않습니다. 버전에 따른 차이는 적용 확인의 fail-closed에 맡기고, 탐지할 수 없는 경우는 §8 한계로 문서화합니다 | Q-A 사용자 결정 |

## 3. 상세 동작

### 3.1 G1
- `role-dispatch-policy.mjs:3`의 `G1: 'fail'`을 `'pass'`로, `:5`의 `null`을 deep-freeze한 D1 객체로 바꿉니다. `:4` 주석은 측정 버전(Claude 2.1.328, 2026-11-19)과 예외(`/private/tmp/claude-<uid>` 쓰기 허용, sandbox를 적용할 수 없을 때 Bash가 명령 단위로 exit 71로 실패)를 적습니다.
- `CLAUDE_SANDBOX_SETTINGS`(:7)와 `effectiveClaudeSandboxSettings`(:9)의 로직은 바꾸지 않습니다. 주입 policy가 `G1:'fail'`이거나 settings가 null 또는 빈 객체이면 기존처럼 `bridgeGateReasons`(:88)가 `permission_scope_unverified`를 내고 `buildClaudeArgs`(`role-bridge-args.mjs:191-195`)가 throw합니다.
- `arc_implementer`/`arc_qa`에는 `--settings <JSON.stringify(D1)>`이 붙습니다. scouter, planner, reviewer에는 붙지 않습니다.
- M-C4(D3): T1 착수 전에 사용자가 `m-c4-trusted.sh`를 실행하고 Orchestrator가 결과를 기록합니다.
  - 넓혀지지 않음(`filesystem.allowWrite:["~"]`, `allowUnsandboxedCommands:true`, `excludedCommands` 어느 것으로도 home 쓰기가 되지 않고 OS 수준 거부 유지): T1을 진행하고, 문서에 "trust된 workspace와 trust되지 않은 workspace 모두에서 넓혀지지 않음"을 남깁니다.
  - 넓혀짐: T1을 hold하고 범위 변경으로 사용자 결정을 받습니다.

### 3.2 Grok 프로필 생명주기 (쓰기 역할 한정)
새 모듈 `lib/runtime/grok-sandbox.mjs`(D15에 따라 등록하고 복제)에 다음을 둡니다.
- `GROK_SANDBOX_DENY`: D5 상수, frozen
- `grokSandboxProfileName(dispatchId)`: D6
- `renderGrokSandboxProfile(name)`: 결정적인 UTF-8 바이트를 만듭니다. 형식은 다음과 같고 끝에 `\n`을 붙입니다. `deny`는 D5 순서대로 JSON 문자열 표기를 씁니다.
  ```toml
  [profiles.arc-bridge-xxxxxxxx]
  extends = "workspace"
  deny = [".grok/sandbox.toml", "~/.grok/skills", ...]
  ```
- `grokProfileCovered(allowedPaths)`: D8

인자(`role-bridge-args.mjs`):
- `buildGrokArgs({role, profile, sessionId, promptFile, sandboxProfile})`
  - 쓰기 역할: `sandboxProfile`이 `^arc-bridge-[0-9a-f]{8}$`에 맞아야 합니다(맞지 않으면 throw). `--sandbox <sandboxProfile>`을 씁니다.
  - 읽기 역할: 이 값을 무시하고 `read-only`를 씁니다.
- `ROLE_BRIDGE_PERMISSIONS.grok`의 쓰기 역할 `sandbox` 값은 이름 없이 쓸 수 없는 표지(예: `'custom'`)로 바꿔서, `'workspace'`로 실행되는 경로를 없앱니다.
- `buildBridgeInvocation`(`role-supervisor.mjs:109-135`)은 grok 쓰기 역할일 때 다음을 순서대로 처리합니다.
  1. 이름 계산
  2. D8 충돌이면 실패
  3. `<worktree>/.grok/sandbox.toml`을 lstat해서 ENOENT가 아니면 실패
  4. `<worktree>/.grok`이 있는데 symlink가 아닌 디렉터리가 아니면 실패
  5. `grokSandbox: {name, path, bytes}`를 반환합니다. `argsDigest`에는 이름만 들어갑니다.
- 게이트 확인(:114-117)이 먼저 실행되므로 GK1이 `fail`이면 위 단계까지 가지 않습니다. prepare에서는 hold(`role-bridge.mjs:57`), supervisor에서는 early failure가 됩니다.

supervisor 순서(`role-supervisor.mjs`):
1. :227 invocation(위 검사 포함) → :228 digest → :229 brief → :230-231 cli
2. **[신규] D10 홈·env 검사**: child env는 :246과 같은 방식으로 만든 `{...localCliEnvironment(cli), ...invocation.childEnv}`입니다.
3. **[신규] 프로필 생성**
   - `.grok`이 없으면 `mkdir(0o700, recursive:false)`로 만들고 `dirCreated=true`로 둡니다. EEXIST이면 다시 lstat해서 디렉터리인지 확인합니다.
   - `open(O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW, 0o444)` → write → `fchmod 0o444` → close
   - EEXIST나 그 밖의 오류는 early failure `permission_scope_unverified`이고 파일은 건드리지 않습니다. 쓰기 오류가 나면 정리 규칙을 적용합니다.
4. :232-233 before snapshot. 프로필 파일이 before에 포함되므로, 바뀌지 않으면 after와 같아 violation이 생기지 않습니다.
5. :235-243 prompt file → :244 events fd
6. **[신규] 이벤트 기준점**: `<homes.grok>/sessions/sandbox-events.jsonl`을 lstat합니다.
   - ENOENT: `{exists:false, size:0}`
   - 일반 파일: `{exists:true, dev, ino, size}`
   - 그 밖: spawn하지 않고 `permission_scope_unverified`
   - 이어서 `spawnAtMs = Date.now()`를 기록합니다.
7. :246 spawn. cwd는 `target.realpath`입니다.
8. 실행 뒤 :394 after snapshot → **[신규] 적용 확인(§3.3, T3)** → **[신규] 정리**

정리 규칙(`removeGrokSandboxProfile`):
- 파일이 일반 파일이고 sha256이 렌더 바이트와 같으면 unlink합니다(`removed:true`). `dirCreated`이면 `rmdir`(재귀 아님)도 하고, ENOTEMPTY이면 남기고 기록합니다.
- 파일이 없거나, 일반 파일이 아니거나, 해시가 다르면 `permission_violation_observed`를 붙이고 보존합니다(`removed:false`).
- `exit.unobserved`(:382-391): 정리하지 않고 `removed:false, reason:'child_unobserved'`로 기록합니다.
- catch 경로(:439-): `stopped===true`일 때만 정리 규칙을 적용하고, 아니면 보존합니다.
- 생성 뒤 spawn 전 early failure: 정리 규칙을 적용합니다.

record(`writeRecord`, :437)에 다음을 남깁니다.
- `grokSandboxProfile: {name, path, sha256, dirCreated, created, removed, dirRemoved, eventsBaseline, applied}`
- `applied`는 `null`이거나 `{timestamp, enforced, inherited, denyOk}`입니다.

### 3.3 ProfileApplied 확인 (T3)
입력은 `homes.grok`, `eventsBaseline`, `spawnAtMs`, `name`, `worktreeRealpath`(= `target.realpath`), `expectedDeny = path.join(worktreeRealpath, '.grok', 'sandbox.toml')`입니다. 출력은 `{ok, reason, candidates, applied}`입니다. 판정은 순수 함수 `evaluateGrokProfileApplied({text, ...})`가 하고, 파일 읽기 함수는 따로 둡니다.

읽기(읽기 전용):
- lstat 결과가 일반 파일이 아니면 실패합니다. 기준점이 있었는데 `dev`/`ino`가 다르거나 size가 기준보다 작아도 실패합니다(회전이나 잘림).
- `[baseline.size, EOF)`만 읽습니다. 4 MiB(`EVENTS_MAX_BYTES`)를 넘으면 실패합니다.
- 줄 단위로 나눕니다. 개행 없는 마지막 줄은 버리고, 파싱되지 않는 줄은 무시합니다(다른 세션의 동시 append 때문).

후보 선정:
- `event_type === "ProfileApplied"`, `profile === name`, `workspace === worktreeRealpath`인 줄
- 후보의 `timestamp`를 `Date.parse`할 수 없으면 실패합니다. `Date.parse(timestamp) >= spawnAtMs`인 줄만 남깁니다.

통과 조건(셋 모두 만족):
1. 후보가 정확히 1건
2. `enforced === true`이고 `inherited !== true`
3. `deny_paths`가 배열이고 `expectedDeny`를 포함

결과:
- 통과: 코드를 붙이지 않고 record에 `applied`를 남깁니다. claim level은 그대로입니다.
- 실패: `permission_scope_mismatch`를 붙이고 최종 상태는 `failed`입니다(D12 예외 제외).
- 확인 시점은 종료가 관측된 뒤뿐입니다. Grok이 시작을 거부(exit 1)하면 `execution_failed`와 `permission_scope_mismatch`가 함께 남습니다.

### 3.4 읽기 역할
변경하지 않습니다. `--sandbox read-only`와 `--deny` 도구 규칙을 유지하고, 프로필 파일 생성과 적용 확인을 하지 않습니다.

## 4. 오류와 hold 경로

| # | 조건 | 시점 | 결과 | 파일 처리 |
|---|---|---|---|---|
| E1 | GK1 `fail`(T2 시점 또는 주입) | prepare / supervisor | hold / failed `permission_scope_unverified` | 생성 안 함 |
| E2 | `allowedPaths`가 `.grok/sandbox.toml`을 덮음 | prepare / supervisor | hold / failed `permission_scope_unverified` | 생성 안 함 |
| E3 | `.grok/sandbox.toml`이 이미 있음(어떤 형태든) | prepare | hold `permission_scope_unverified` | 건드리지 않음 |
| E4 | `.grok`이 디렉터리가 아니거나 symlink | prepare / supervisor | hold / failed `permission_scope_unverified` | 건드리지 않음 |
| E5 | prepare 뒤에 파일이 생김(`O_EXCL` EEXIST) | supervisor | failed `permission_scope_unverified` | 건드리지 않음 |
| E6 | dispatchId 앞 8자가 hex가 아님 | prepare / supervisor | hold / failed `permission_scope_unverified` | 생성 안 함 |
| E7 | child env `GROK_HOME`이 `homes.grok`과 다름, `HOME` 불일치, `homes.grok` symlink | supervisor | failed `permission_scope_unverified` | 생성 안 함 |
| E8 | `GROK_HOME` 설정(기존 동작) | prepare | hold `activation_unverified` | 생성 안 함 |
| E9 | 이벤트 파일이 일반 파일이 아님(spawn 전) | supervisor | failed `permission_scope_unverified` | 정리 규칙 |
| E10 | 생성 뒤 spawn 전 실패 | supervisor | 기존 early failure 코드 | 정리 규칙 |
| E11 | Grok 시작 거부(exit 1) | 사후 | failed `execution_failed` + `permission_scope_mismatch` | 정리 규칙 |
| E12 | 후보 0건 또는 2건 이상, `enforced` 아님, `inherited:true`, `deny_paths` 누락, timestamp 파싱 불가, 회전·잘림·4 MiB 초과 | 사후 | failed `permission_scope_mismatch` | 정리 규칙 |
| E13 | 취소 + 후보 0건 | 사후 | `cancelled`(코드 없음, `applied:null`) | 정리 규칙 |
| E14 | 실행 뒤 파일이 없거나 일반 파일이 아니거나 해시 불일치 | 사후 | failed `permission_violation_observed` | 보존 |
| E15 | 자식 종료 미관측 | 사후 | 기존 `unknown` `terminal_state_unverified` | 보존 |
| E16 | catch 경로에서 group 미정지 | 사후 | 기존 처리 | 보존 |
| E17 | G1 주입 `fail` 또는 settings null | prepare / args | hold `permission_scope_unverified` / throw | 해당 없음 |
| E18 | M-C4에서 넓혀짐 확인 | T1 착수 전 | T1 hold, 사용자 결정 | 해당 없음 |

## 5. 수용 기준

- **AC1 게이트 값**: 최종 `BRIDGE_GATE_RESULTS`는 `{G1:'pass', G2:'escalation', G3:'pass', G4:'pass', G5:'wide', G6:'strict', G7:'pass', G8:'pass', GG1:'fail', GG2:'fail', GK1:'pass', GK2:'fail'}`이고 frozen입니다. T1 뒤에는 GK1이 `fail`이고 T3 뒤에 `pass`가 됩니다. GG1 단언(`gemini-bridge.test.mjs:62-67`)은 유지합니다. 두 복제본은 같은 바이트입니다.
- **AC2 G1 settings**:
  - `CLAUDE_SANDBOX_SETTINGS`가 D1과 deepEqual이고, 객체와 모든 하위 객체가 frozen입니다.
  - 기본 policy에서 claude `arc_implementer`/`arc_qa` 인자에 `--settings` 다음 `JSON.stringify(D1)`이 정확히 한 번 들어갑니다. 읽기 역할에는 없습니다.
  - `role-routing-dispatch.test.mjs:471-485`의 null 분기는 계속 통과합니다.
- **AC3 hold 보존**: 기본 policy에서 claude 쓰기 역할의 `bridgeGateReasons`는 `[]`입니다. 주입 `G1:'fail'`에서는 `['permission_scope_unverified']`이고 `buildClaudeArgs`가 throw합니다. 기존 주입 fail 테스트는 유지합니다.
- **AC4 Grok 인자**:
  - grok 쓰기 역할 인자에 `--sandbox arc-bridge-<8hex>`가 있고 `workspace`는 없습니다.
  - 이름이 잘못되었거나 빠지면 throw합니다.
  - 읽기 역할 인자는 바뀌지 않습니다.
  - 같은 lease로 prepare와 supervisor가 만든 `argsDigest`가 같습니다.
- **AC5 프로필 바이트**: `renderGrokSandboxProfile`의 출력이 고정 fixture와 바이트가 같습니다. `extends = "workspace"`이고 deny는 D5의 24개 항목(순서와 개수 일치)이며 `strict`라는 문자열이 없습니다.
- **AC6 생명주기 분기**: E2–E7, E9, E10, E14–E16을 각각 테스트합니다.
  - 확인 항목: 결과 상태와 코드, 파일 존재와 모드(0444), 사용자 파일 바이트 불변(E3, E5에서 sha256 동일), record 필드, `dirCreated`일 때만 `.grok` 제거
  - 정상 완료 시: 파일과 runtime이 만든 `.grok`이 사라지고 `removed:true`입니다.
- **AC7 적용 확인 분기**:
  - `evaluateGrokProfileApplied` fixture 테스트: 통과 1건, 그리고 실패 분기(0건, 2건, 다른 profile, 다른 workspace, spawn 이전 timestamp, timestamp 파싱 불가, `enforced:false`, `enforced` 누락, `inherited:true`, `deny_paths` 누락 또는 비배열, ino 변경, 잘림, 4 MiB 초과)
  - 통과가 유지되어야 하는 경우: 파싱 불가 줄이 섞임, 개행 없는 마지막 줄(무시)
  - supervisor 통합(fake grok): 통과하면 `completed`, 실패하면 `failed`+`permission_scope_mismatch`, 취소+0건이면 `cancelled`
  - fixture는 T0 M-K2 실측 줄 형식을 씁니다.
- **AC8 게이트 순서**: T2 커밋 시점에 기본 policy의 grok 쓰기 역할은 hold(`permission_scope_unverified`)입니다. T3 커밋에서만 `pass`가 됩니다.
- **AC9 문서**:
  - `docs/harness-operation.md` G1 행: `pass`, settings 요약, 예외(`/private/tmp/claude-<uid>`, 명령 단위 exit 71, M-C4 결과)
  - GK1 행 신규: 프로필, 적용 확인, §8 예외 요약
  - :230 번호 목록 앞(:229)에 도입 문장 추가(M2). 예: "On failure or partial completion, apply these steps in order:"
  - coordination 4종(`claude|gemini|grok/skill/references/coordination.md:144`, `codex/...:142`)의 G1 문장을 pass 의미로 바꾸고 GK1 설명을 추가합니다. `tests/node/composite-instructions.test.mjs:186` 정규식을 새 문장에 맞춥니다.
  - 설치본은 편집하지 않습니다.
- **AC10 증거 목록**: `grok-capability-evidence.test.mjs`에서 `permission-sandbox-effect`가 미검증 목록에서 빠지고 쓰기 역할 범위로 verified에 들어갑니다. 미검증 목록은 5개이고 `read-role-permission-effect`를 포함합니다. `:59-64`의 단언은 `GK1 'pass'`, `GK2 'fail'`, `resume 'off'`로 바꿉니다. `grok-composite.test.mjs:137` 계열 GK1 hold 테스트는 주입 `GK1:'fail'` 기준으로 옮겨 유지합니다.
- **AC11 MANIFEST**: 각 task에서 바뀐 관리 파일이 `MANIFEST.sha256`에 반영되고 manifest 테스트가 통과합니다.
- **AC12 사용자 설정 불변**: 자동 테스트와 실측 전후에 `~/.grok/sandbox.toml`, `~/.grok/config.toml`, `~/.claude/settings*.json`의 sha256(없으면 부재)이 같습니다. runtime 코드에 `~/.grok/sessions`로 쓰는 경로가 없음을 grep과 코드 리뷰로 확인합니다.
- **AC13 복제본**: 바뀐 `lib/runtime/*.mjs`와 `shared/skill/runtime/*.mjs`가 같은 바이트입니다. `node scripts/update-runtime-assets.mjs --check`와 기존 동기화 테스트가 통과합니다.
- **AC14 회귀**: 전체 `node --test` 결과에서 baseline 실패와 현재 실패를 구분해 기록하고, 새 실패는 0건입니다. Python은 `PYTHONDONTWRITEBYTECODE=1`로 실행합니다.

## 6. 검증 방법

### 6.1 자동 테스트
- **T1**: `role-routing-dispatch`, `role-bridge-args`, `composite-instructions`, `gemini-bridge`, manifest, runtime-assets 테스트, 그리고 전체 실행
- **T2**: 신규 `tests/node/grok-sandbox.test.mjs`(렌더, 이름, D8, 생명주기), `role-bridge-args`(AC4), `grok-composite`(prepare hold E2–E6, 주입 `GK1:'pass'` + fake grok supervisor 통합), 복제본과 manifest 테스트, 그리고 전체 실행
- **T3**: `grok-sandbox`(AC7 순수 분기), `grok-composite`(AC7 통합, AC8 뒤 기본 policy), `grok-capability-evidence`(AC10), `role-routing-dispatch:25`, 문서 테스트, manifest, 그리고 전체 실행
- fake grok은 테스트용 임시 HOME 아래 `.grok/sessions/sandbox-events.jsonl`에 fixture 줄을 append합니다. 실제 `~/.grok`은 쓰지 않습니다.

### 6.2 실측(임시 저장소, 사용자 설정 수정 없음, bridge 실행 중 커밋 없음)
- **L0**(T1 선행): M-C4 trusted 측정(`m-c4-trusted.sh`, 사용자 실행)
- **L1**(T1 acceptance 전): `buildClaudeArgs`가 만든 인자 그대로 `claude -p`를 실행해 M-C1 판정을 재현합니다. worktree 쓰기는 허용, home과 `/private/tmp` 직하 쓰기는 거부되어야 합니다.
- **L2**(T3 acceptance 전): runtime 헬퍼로 만든 프로필과 `buildGrokArgs` 인자로 실제 grok 1.0.89를 실행합니다.
  - `evaluateGrokProfileApplied`가 실제 이벤트 파일(읽기 전용)에서 통과해야 합니다.
  - `cat .grok/sandbox.toml`과 `mkdir ~/.grok/skills`는 거부되어야 합니다.
  - worktree 쓰기는 허용, home 쓰기는 거부되어야 합니다.
  - 프로필 해시가 같고 정리되어야 합니다.
  - 가능하면 bridge 경로(prepare → supervisor)로 1회 dispatch해 `completed`와 record 필드를 확인합니다. 커밋은 dispatch가 끝난 뒤에만 합니다.
- 실측 전후로 AC12 해시를 기록합니다.

## 7. 영향 파일
- `lib/runtime/role-dispatch-policy.mjs`(T1 G1, T3 GK1)
- `lib/runtime/role-bridge-args.mjs`(T2)
- `lib/runtime/role-supervisor.mjs`(T2 생명주기, T3 적용 확인)
- 신규 `lib/runtime/grok-sandbox.mjs`(T2, T3), `lib/installer/runtime-assets.mjs`(`RUNTIME_MODULE_PATHS` 등록), `lib/runtime/bootstrap.mjs`(`COOPERATIVE_RUNTIME_MODULES` 등록)
- 위 파일의 `shared/skill/runtime/` 복제본(`scripts/update-runtime-assets.mjs`로 생성)
- `lib/runtime/role-bridge.mjs`: 변경이 필요 없을 것으로 봅니다. 필요하면 T2에 포함합니다.
- 테스트: `tests/node/role-routing-dispatch.test.mjs`, `role-bridge-args.test.mjs`, `composite-instructions.test.mjs`, `grok-capability-evidence.test.mjs`, `grok-composite.test.mjs`, `grok-bridge.test.mjs`, `runtime-assets.test.mjs`, `runtime-versions.test.mjs`, 신규 `grok-sandbox.test.mjs`, 생성물 `tests/node/fixtures/installed-layout-golden.json`
- 문서: `docs/harness-operation.md`, `{claude,codex,gemini,grok}/skill/references/coordination.md`
- `MANIFEST.sha256`

## 8. 위험과 한계 (예외 목록)

### G1 예외
- `/private/tmp/claude-<uid>/` 쓰기 허용
- sandbox를 적용할 수 없으면 Bash가 명령마다 `sandbox_apply: Operation not permitted`(exit 71)로 실패하지만 Claude는 exit 0으로 끝납니다. sandbox 없이 실행되지는 않지만, 결과가 "명령 실패를 포함한 completed"일 수 있습니다.
- Codex host에서 escalation 없이 중첩되면 Bash가 모두 실패합니다(G2).
- `--settings`는 project/local settings와 병합됩니다. trust되지 않은 workspace에서는 넓혀지지 않음을 측정했고, trust된 workspace는 M-C4 결과로 판단합니다.
- 네트워크 제한은 측정 범위 밖입니다.

### GK1 예외
- 쓰기 허용: `~/.grok/<D5 목록에 없는 이름>`, `~/.grok/sessions`, `/tmp`, `/private/tmp`, `/var/tmp`, `/private/var/folders`(`$TMPDIR`)
- 읽기 제한 없음: `workspace` 기반이라 시스템 전체(예: `~/.ssh`)를 읽을 수 있습니다. GK1은 쓰기 경계만 보장합니다.
- 네트워크 허용(macOS에서 `restrict_network`는 효과 없음)
- worktree 밖 쓰기와 Git-ignored 경로 쓰기는 사후 탐지 대상이 아닙니다(G5와 같은 성격).
- D5 deny 목록은 이 버전 문서 기준입니다. 이후 버전에서 새로 생긴 실행·주입 경로는 막지 못합니다.
- 사용자 `~/.grok/sandbox.toml`이 같은 이름을 정의하면 user 정의가 우선합니다. 고유 이름과 `deny_paths` 확인으로 대부분 걸러지지만, 이름 충돌(약 2^-32)과 동일한 deny 조합은 구분할 수 없습니다.
- 측정 버전은 1.0.89뿐입니다. 범위(`>=1.0.0 <1.1.0`)는 유지합니다(D16). 이벤트 형식이 다르면 fail-closed로 실패하지만, 형식은 같고 deny 의미만 다른 버전은 탐지할 수 없습니다.
- 전역 이벤트 파일 확인은 시계와 offset에 의존합니다. 회전과 잘림은 fail-closed로 처리합니다.
- 부모 `.grok`의 identity를 `lstat`로 확인한 뒤 `open`하기 전에 부모가 symlink로 바뀔 수 있습니다.
- `ProfileApplied`는 Grok이 child가 쓸 수 있는 파일에 직접 기록합니다. 프로필을 적용하지 않고 이벤트도 기록하지 않는 Grok 버전에서는 위조 후보 1건을 실제 이벤트와 구분할 수 없습니다. 정상 적용 이벤트와 위조가 함께 있으면 후보 2건으로 실패합니다.
- 취소 시 이벤트 확인 결과가 `no_candidate`이면 `permission_scope_mismatch`를 추가하지 않고, 다른 reason이 없을 때 `cancelled`로 기록합니다(D12/E13).
- Linux는 미측정입니다(deny가 bubblewrap에 의존하고 glob은 launch 시점 기준).

## 9. task 분할
- **T0**(완료, 커밋 없음): 측정
- **T0b**(커밋 없음, T1 선행): M-C4 trusted 측정과 판정 기록(D3). 넓혀지면 T1 hold
- **T1 G1 pass**: D1–D3, AC1(G1), AC2, AC3, AC9(G1, M2, coordination, composite 테스트), AC11, AC13, L1. 선행: T0b
- **T2 Grok 프로필 생명주기**(GK1 `fail` 유지): D4–D10, D15, AC4–AC6, AC8, AC11, AC13. 선행: 없음. manifest와 복제본 생성 파일이 겹치므로 T1 다음에 순차로 진행합니다.
- **T3 적용 확인과 GK1 pass**: D11–D14, D16, AC1(GK1), AC7, AC9(GK1), AC10, AC11, AC12, L2. 선행: T2
- 최종: 모든 task의 acceptance와 QA를 마친 뒤 독립 Reviewer가 전체 변경을 1회 검토합니다.

## 10. T0 실측 요약 (2026-11-19, 임시 저장소)
- **Claude 2.1.328** (bridge와 같은 인자, D1 settings)
  - acceptEdits와 default 모두 worktree와 `/private/tmp/claude-501/...` 쓰기만 허용
  - home과 `/private/tmp` 직하는 `operation not permitted`
  - `dangerouslyDisableSandbox`는 비활성화됨
  - Bash 자동 허용
  - `sandbox-exec` 중첩에서는 D1과 D1에서 `failIfUnavailable`을 뺀 경우 모두 Bash가 exit 71로 실행되지 않음
  - trust되지 않은 workspace의 `.claude/settings{,.local}.json` 확장 시도는 모두 실패
- **Grok 1.0.89**
  - 프로젝트 `.grok/sandbox.toml`은 folder trust 없이 인식됨
  - 프로필이 없거나 toml이 잘못되면 exit 1 + `Refusing to start with its protections missing`
  - `workspace` 기반: worktree, `/private/tmp`, `$TMPDIR`, `~/.grok/<임의>` 쓰기 허용, home 거부
  - D5 deny 추가 시 `mkdir ~/.grok/skills`와 `cat .grok/sandbox.toml`이 `Operation not permitted`이고 나머지 동작은 정상
  - `strict` 기반은 acceptEdits headless에서 shell이 취소됨
- **ProfileApplied 형식**: `~/.grok/sessions/sandbox-events.jsonl` 한 줄에 `{"timestamp","event_type":"ProfileApplied","profile","workspace","platform":"macos/seatbelt","enforced","restrict_network","read_write_paths","deny_paths"}`이 기록되고 `session_id`는 없습니다.

## 개정 이력

| Version | Approval time | Classification | Affected tasks | Reason |
|---|---|---|---|---|
| v1 | 2026-11-19T10:49:50Z | 최초 승인 | 전체 | 작성 spec 승인 |
| v2 | 2026-11-19T10:59:30Z | 기계적 정정 | T1, T2 | plan 근거 확인: M2 목록 위치 :226→:230, 새 모듈 등록 위치(`COOPERATIVE_RUNTIME_MODULES`, 등록 테스트, installed-layout golden) 누락 보완 |
| v3 | 2026-11-20 | contract | T2 | D10·E7: runtime이 child env에 `GROK_HOME=homes.grok`을 항상 주입하므로 "`GROK_HOME` 없음" 조건을 "`homes.grok`과 정확히 같고 `invocation.childEnv`가 덮지 않음"으로 정정(T2 Implementer hold 보고, 사용자 결정). 사용자가 설정한 `GROK_HOME`은 E8대로 prepare hold |
| v4 | 2026-11-20 | 기계적 보완 | 최종 리뷰 follow-up | §8 잔여 한계 보완(M2, M3) |
