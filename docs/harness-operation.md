# How the ARC harness operates

ARC installs the harness files and the conversation Orchestrator coordinates work. The [Claude](../claude/skill/SKILL.md), [Codex](../codex/skill/SKILL.md), [Gemini](../gemini/skill/SKILL.md) and [Grok](../grok/skill/SKILL.md) skills define the workflow contracts with their references and profiles.

Role instructions govern scheduling and limits through prompt policy. Native settings apply to their own sessions. Verify live behavior and settings in new sessions.

## What ARC installs

| Component | Claude Code | Codex | Gemini CLI | Grok CLI |
|---|---|---|---|---|
| Home | `~/.claude`; conflicting `CLAUDE_CONFIG_DIR` rejected | `~/.codex` or `CODEX_HOME`, resolved relative to the CLI working directory if needed | `~/.gemini`; any `GEMINI_CLI_HOME` rejected | `~/.grok`; any `GROK_HOME` rejected |
| Skill | `skills/arc/` | Same | Same | Same |
| Models | `skills/arc/models.toml` | Same | Same | Same |
| Limits | `skills/arc/limits.toml` | Same | Same | Same |
| Five specialist profiles | `agents/arc-*.md` | `agents/arc-*.toml` | `agents/arc-*.md` | `agents/arc-*.md` |
| Managed instructions | `CLAUDE.md` | `AGENTS.md` | `GEMINI.md` | `AGENTS.md` |
| Native settings | `settings.json` | `config.toml` | Existing settings preserved | `config.toml`, ARC-managed `[compat.claude]` entries only |

- `models.toml` schema v3 has five `[roles.<role>]` tables with `model` and one effort field: `model_reasoning_effort` (Codex) or `effort` (Claude/Gemini/Grok). The Orchestrator uses the conversation model.
- Valid v1/v2 settings convert to v3 on write. Catalog entries are candidates. Saved pairs missing from the catalog remain visible and require reselection before Apply.

## Mixed routing

| Contract | Rule |
|---|---|
| Participants | S = role platforms ∪ hosts; one = standalone, two or more = `Mixed (…)` |
| Anchor | Display and anchor order: Claude > Codex > Gemini > Grok |
| Active file | `<anchor home>/arc-role-platform-routing.json`; new schema v2 explicitly lists anchor-ordered platforms |
| Lock and store | Routing lock and `arc-role-dispatch/` in the anchor home |
| Participants | `arc-role-platform-routing.prepared.json` points to active file; `agents/arc-routing-*` for assigned roles; host-only marker has an empty profile map |
| Activation | Host marker discovers anchor; runtime revalidates active config/all markers under lock and requires matching installed bytes. Historical v1 is migration-only; markers prove no login/permissions/model/effort. Apply publishes; reload in a new session |
| Paths | Symlinked homes/parents refused for install, publication, locks |

- New v2 leases record the assigned role's `targetPlatform` within the participant set. Run, observe, resume and cancel use that target.
- Legacy v1 reads infer native = host and bridge = peer for Claude/Codex. Other v1 hosts hold as `activation_unverified`.

## Status and authentication

| Status or platform | Meaning or method |
|---|---|
| `Available` | CLI available |
| `Not Available` | CLI missing |
| `Unauthorized` | Permanently rejected auth refresh |
| `Incomplete` | Inconclusive check, never `Available` |
| `Not verified`, `Unverified` | Verification/installation consistency unresolved |
| `Unsupported version` | CLI version outside the supported range |
| Claude | `claude auth status` |
| Codex | Home/composite auth uses `codex app-server` `getAuthStatus`; network refresh rotates `CODEX_HOME/auth.json` tokens |
| Gemini | `auth.kind: none`, no probe, status `unknown`; `auth unverified` warning, not proof of login |
| Grok | `auth.kind: none`, no probe, status `unknown`; Status runs only `grok --version`; `auth unverified` warning, not proof of login |

Unknown Claude/Codex auth probe results block participation.

## Execution support

| executionEnvironment | Claude target | Codex target | Gemini target | Grok target |
|---|---|---|---|---|
| `claude-cli` | Native, all roles | Bridge, all roles | Bridge, read roles only (GG1 `fail`; Implementer/QA held as `permission_scope_unverified`) | Bridge, all roles |
| `codex-cli` | Bridge, all roles | Native, all roles | Bridge, read roles only (GG1 `fail`; Implementer/QA held as `permission_scope_unverified`) | Bridge, all roles |
| `gemini-cli` | Held (`capability_not_verified`; GG2 `fail`, `compositeHost` off) | Held (`capability_not_verified`; GG2 `fail`, `compositeHost` off) | Held (`capability_not_verified`; GG2 `fail`, `compositeHost` off) | Held (`capability_not_verified`; GG2 `fail`, `compositeHost` off) |
| `grok-cli` | Bridge, all roles | Bridge, all roles | Bridge, read roles only (GG1 `fail`; Implementer/QA held as `permission_scope_unverified`) | Native, all roles |
| `claude-desktop` | Held (`environment_unverified`) | Held (`environment_unverified`) | Held (`environment_unverified`) | Held (`environment_unverified`) |
| `codex-desktop` | Held (`environment_unverified`) | Held (`environment_unverified`) | Held (`environment_unverified`) | Held (`environment_unverified`) |

Read roles are Scouter, Planner and Reviewer. The table shows which routes the recorded gates permit; apply the host rules and check each dispatch result.

| Host | Runtime approval and target home checks |
|---|---|
| Claude | ARC applies no per-call approval gate or target home probe. |
| Codex | G2 `escalation` requires user approval on every runtime call, including native calls. The Orchestrator obtains approval. Refusal or a denied write holds as `host_sandbox_blocked`. Detached supervisor survival was observed under variant conditions. |
| Gemini | GG2 `fail` holds the CLI host pending live measurement. |
| Grok | GK2 `approval` requires ask mode and per-call user approval. Start with `grok --permission-mode default`, keep the host sandbox off, and select `Allow once`. `Always allow` saves `permission_mode = "always-approve"` to the Grok config. A denied write holds as `host_sandbox_blocked`. ARC cannot detect whether the host sandbox is on. |

The caller declares `executionEnvironment` from the session. Use the host's CLI value for a terminal, TUI or IDE terminal and when unsure. Use a Desktop value only for a confirmed Claude or Codex Desktop session. Both Desktop environments hold as `environment_unverified`. A future release would need to check CLI discovery, shared auth, a shared worktree, supervisor survival, per-call escalation and a matching native revision tag. Recording those checks releases nothing in this version.

| Bridge contract | Result and operational impact |
|---|---|
| G1 `pass` | Claude bridge write roles use the recorded sandbox and deny writes to `.git`. Unsafe or unreadable project settings hold as `permission_scope_unverified`. Live evidence covers Claude 2.1.327 on macOS. |
| G3 `pass` | A Codex rollout with a detected child spawn fails as `delegation_observed`. |
| G4 `pass` | Codex routes pass this gate. A failed G4 holds as `permission_scope_unverified`. |
| G5 `wide` | Codex `workspace-write` may reach beyond the worktree, outside post-run detection. |
| GG1 `fail` | Gemini bridge Implementer/QA hold as `permission_scope_unverified`. Read roles remain supported. |
| GK1 `pass` | Grok bridge write roles require a per-dispatch sandbox profile and a verified `ProfileApplied` event. Live evidence covers Grok 1.0.89 on macOS. Unlisted home paths, session files and temporary directories remain writable. Reads and network access are allowed. |
| Claims | `supportStatus: verified` requires all five claims to be `runtime-observed`. User MCP configuration caps Codex permission evidence at `operator-attested`. |
| Versions | Routing reports CLI versions. Configure and Status use the registry's supported ranges, and Configure blocks composite platform selection outside those ranges. |
| Target home probe | On Grok or Gemini hosts, bridge prepare/run/resume probe the target home. A denial holds as `host_sandbox_blocked`, a missing home as `activation_unverified`, and a failed cleanup reports `residualPaths`. The probe covers the home directory itself. |
| Child guard | `ARC_BRIDGE_CHILD` blocks routing commands. Shell launches of a platform CLI fall outside `delegation_observed` detection. |

For bridge target rules and the control files they cover, see [Claude](../claude/skill/references/coordination.md#bridge-target-rules) · [Codex](../codex/skill/references/coordination.md#bridge-target-rules) · [Gemini](../gemini/skill/references/coordination.md#bridge-target-rules) · [Grok](../grok/skill/references/coordination.md#bridge-target-rules).

### Post-run detection limits

The supervisor compares Git-visible paths, HEAD, branch, refs and the control files listed in the bridge target rules before and after the run. Detected violations leave files in place and report affected control-file labels in `controlFiles.changed`. Outside the selected control files, Git-ignored paths and external `core.hooksPath` directories are missed. Changes within a hooks or info tree that exceeds 1,000 entries may go undetected while both snapshots report `overflow`. A failed before snapshot stops execution as `execution_failed`. A failed after snapshot leaves permissions unverified and yields no comparison verdict. Check `tolerated.refs` with `git log` and `git reflog` before rebasing, merging or accepting because the comparison cannot identify who made those changes.

### Working alongside a running bridge

In the dispatch worktree, make only fast-forward commits on its current branch, within `allowedPaths` for Implementer and for QA with non-empty `allowedPaths`. Avoid amending, rebasing, resetting, switching branches or writing `.git/config` (including via `git push -u`).

Avoid saving host permission rules in the dispatch checkout. Claude Code's “don't ask again” can change `.claude/settings.local.json` and fail the dispatch as `permission_violation_observed`. Use a linked worktree to isolate bridge work.

## Bridge 도구 접근

Orchestrator는 검증에 필요한 최소 접근만 해당 bridge dispatch에 요청한다(D-a). 읽기 역할은 Scouter, Planner, Reviewer이며 쓰기 역할은 Implementer와 Tester다. 아래 기준선은 대상 플랫폼의 기존 bridge 동작과 `toolAccess` 적용 범위를 함께 보여 준다.

| 대상 | 읽기 역할 | Implementer | Tester |
|---|---|---|---|
| Codex | 기존 인자 유지. 웹 조회는 `--search` 측정에서 동작(B12) | `workspace-write`와 scratch·기본 preset. 유효 네트워크 또는 등록 경로·소켓 부여에는 permission profile 적용(MI-1·MI-3) | 같은 기준선에 역할 표와 gate가 허용하는 도메인·서비스 요청 추가 |
| Claude | Scouter는 `--allowedTools WebFetch,WebSearch` 사용(B12·MI-8). Planner·Reviewer에는 Bash 없음 | D2′ sandbox, scratch·기본 preset. `Edit(./.git/**)`와 sandbox `denyWrite`로 Git 보호(MI-4). Loopback bind 확인(MI-5) | 같은 기준선에 역할 표와 gate가 허용하는 도메인·서비스 요청 추가 |
| Grok | 기존 인자 유지. 내장 읽기 전용 모드의 강제 보장 없음 | 기존 GK1 per-dispatch sandbox. `toolAccess`는 미측정(B14) | 기존 GK1 per-dispatch sandbox. `toolAccess`는 미측정(B14) |
| Gemini | 기존 읽기 역할 bridge 유지 | GG1 실패로 bridge 보류 | GG1 실패로 bridge 보류 |

### 도구 범주

● 필요, ○ 가끔 필요, – 해당 없음. 필요도는 접근 허용 여부와 별도로 기록한다.

| ID | 범주 | 읽기 / Implementer / Tester | 처리와 측정 근거 |
|---|---|---|---|
| C1 | 임시 파일 | – / ● / ● | M1 scratch. SX3·SC0·SC2·MI-C |
| C2 | 패키지·툴체인 캐시 | – / ● / ● | M2 `caches`, 필요하면 등록된 M3 경로. B4에서 npm·Python·uv 확인. Gradle·Go·Maven 미측정 |
| C3 | 의존성 설치·원격 fetch | – / ○ / – | M7 호스트 전용(D-h) |
| C4 | 브라우저·테스트 러너 | – / ○ / ● | M6 CDP(SX4·SC3·MI-A). Playwright 호스트 연결 성공(B10), sandbox 내 실행 실패(B11), 호스트 격리 미측정(MI-B). Cypress는 M7 |
| C5 | 로컬 TCP 서비스 | – / ○ / ● | M4 `loopback`. SX1·SC1 |
| C6 | Unix 소켓 | – / ○ / ● | M4 네트워크 활성 시 scratch 소켓 자동 허용. 등록 ID는 0개. SX4·SC3·B5 |
| C7 | Docker·Colima·SSH agent·GPG agent | – / – / ○ | M5 영구 금지. B5에서 Docker 소켓 거부 확인 |
| C8 | 자체 서버 bind | – / ○ / ● | M4 요청 기반 `loopback`. B3·MI-1·MI-5 |
| C9 | CLI 인증·설정 읽기 | ○ / ● / ● | 기존 동작 유지. `domains` 사용 시 M5 읽기 제한. B6·MI-7·MI-9 |
| C10 | CLI 인증·설정 쓰기 | – / – / – | M5·M7. B1에서 `~/.codex` 쓰기 차단 확인 |
| C11 | 언어 서버·빌드 데몬 | – / ○ / ○ | M2 `daemon-off`. 효과 미측정 |
| C12 | 프로세스 조회·시그널 | – / ○ / ○ | 자기 자식 프로세스에 시그널 허용, 다른 프로세스 조회는 M7. B8 |
| C13 | 파일 감시·EMFILE | – / ○ / ○ | M2 `polling`. B9에서 recursive `fs.watch` 실패 확인 |
| C14 | `.git` 쓰기 | – / – / – | M5, Codex profile 보호(R1), Git 쓰기는 M7. B1·MI-1·MI-3·MI-4 |
| C15 | 키체인·GUI·OS 서비스 | – / – / – | M5, 키체인 작업은 M7 |
| C16 | 텔레메트리·업데이트 확인 | – / ● / ● | M2 `base`에서 비활성화. SC3에서 agent-browser 버전 확인 차단 |
| C17 | 대화형 프롬프트 | – / ○ / ○ | M2 `base`의 `GIT_TERMINAL_PROMPT=0`과 요청형 `ci` |
| C18 | 장기 백그라운드 프로세스 | – / ○ / ● | dispatch 동안 허용하고 terminal 상태에서 process group 종료 |
| C19 | 증거 산출물 | – / ○ / ● | M1 `evidence/`에서 artifact 디렉터리로 복사. B10 |
| C20 | 읽기 역할 웹 조회 | ● / – / – | Codex 기존 동작 유지. Claude Scouter 웹 도구 허용. B12·MI-8 |
| C21 | 읽기 역할 도구 실행 | ● / – / – | 기존 역할 도구 범위 적용 |

새 도구는 저장소 쓰기, 영구 금지 목록, env 우회, 등록 경로, 가장 좁은 통신 범위, 저장소 코드를 실행하지 않는 호스트 서비스, 호스트 전용 순으로 검토한다.

### 접근 메커니즘

- **M1 scratch** — Codex·Claude bridge 쓰기 역할마다 supervisor가 0700 디렉터리와 `tmp/`, `cache/`, `sock/`, `evidence/`를 만든다. Codex는 `/private/tmp/arc-bridge-<id8>`, Claude는 현재 사용자 소유의 `/private/tmp/claude-<uid>/arc-bridge-<id8>`를 쓴다. 역할은 `ARC_SCRATCH_DIR`에 임시 파일을 두고, 보존할 파일은 `ARC_EVIDENCE_DIR`에 둔다. 종료 시 정규 파일과 디렉터리만 dispatch artifact의 `evidence/`에 복사한다. 상한은 전체 64 MiB, 파일당 16 MiB, 항목 256개, 깊이 8이다. 초과는 `truncated`로 기록한다. supervisor는 모든 종료 경로에서 scratch를 삭제하며, 삭제 실패는 경고로 남긴다.
- **M2 env preset** — `base`는 임시·캐시·소켓 경로와 세 가지 `ARC_*` 변수, 프롬프트·텔레메트리·업데이트 설정을 전달한다. `caches`는 npm·Python·uv·Yarn·pip·Poetry·Go 빌드·Homebrew 캐시를 scratch 아래로 지정한다. `base`와 `caches`는 지원되는 쓰기 역할에 자동 적용된다. `ci`는 비대화형 실행, `daemon-off`는 Nx·Gradle 데몬 중지, `polling`은 지원 도구의 폴링 감시를 요청한다. Codex는 `shell_environment_policy.set`, Claude는 settings의 `env`를 쓴다. B4에서 npm·Python·uv 동작을 확인했고, 다른 캐시 변수와 요청형 preset의 도구별 효과는 미측정이다.
- **M3 등록 경로** — `paths`는 ARC에 등록된 ID만 받는다. 현재 등록은 0개다. 절대 realpath가 필요하며 symlink, 홈 자체, CLI 홈과 영구 금지 경로에 겹치는 경로는 거부한다. Codex는 profile에 `"write"`를 넣고 Claude는 이미 존재하는 디렉터리를 `sandbox.filesystem.allowWrite`에 넣는다(B13).
- **M4 네트워크와 Unix 소켓** — 서비스 요청에서 `network`가 `null`이면 유효 값은 `loopback`이다. 유효 값이 `null`이 아니면 scratch의 `sock/`가 자동 허용된다. 추가 소켓은 등록 ID로만 지정하며 현재 등록은 0개다. Codex는 네트워크나 등록 경로·소켓 부여에 `arc_bridge` profile을 사용하고, 새 실행과 resume 모두 `default_permissions` 및 네트워크 사용 시 `features.network_proxy`를 전달한다(MI-1). Profile은 작업 트리의 `.git`·`.codex` 절대 경로를 읽기 전용으로 지정한다(MI-1·MI-3). 사용자나 작업 트리의 Codex 설정에 `permissions.arc_bridge`가 이미 있으면 병합 위험으로 보류한다(MI-2). Claude는 `allowedDomains`, `allowLocalBinding`, `allowUnixSockets`를 sandbox settings에 담는다.
- **M5 영구 금지** — `FORBIDDEN`은 작업 트리의 `.git`·`.codex`, 플랫폼별 CLI 홈, `~/.ssh`, `~/.aws`, `~/.config/gh`, `~/.config/gcloud`, `~/.npmrc`, `~/.netrc`, `~/.docker`, `~/.kube`, `~/.gnupg`, `~/.gitconfig`, 셸 시작 파일(`~/.zshrc`, `~/.zprofile`, `~/.zshenv`, `~/.bashrc`, `~/.bash_profile`, `~/.profile`), `~/Library/LaunchAgents`, `~/Library/Keychains`에 대한 쓰기 부여를 금지한다. 금지 소켓은 `/var/run/docker.sock`, `~/.docker`, `~/.colima`, `$SSH_AUTH_SOCK`이 가리키는 경로, `~/.gnupg`다. Scratch, 등록 경로·소켓, 호스트 서비스 디렉터리가 이 목록에 겹치는지도 검사한다. `domains`에서는 인증·설정 경로 10개와 CLI 홈의 읽기를 차단하고, 자격 증명 패턴에 맞는 env를 정리한다. Codex는 filesystem `"none"`과 env `exclude`를 쓰고, Claude는 sandbox `denyRead`와 `Read` 거부 규칙을 함께 적용하며 해당 env를 빈 문자열로 설정한다.
- **M6 호스트 서비스** — Tester 요청에 따라 supervisor가 scratch 생성 뒤와 CLI 실행 전에 서비스를 시작하고, 모든 terminal 경로에서 종료 및 정리한다. 호스트 서비스는 저장소 코드나 작업 트리의 `node_modules`를 실행하지 않는다. 역할은 `ARC_HOST_SERVICES_FILE`이 가리키는 `services.json`에서 서비스 ID별 endpoint를 읽는다. CDP는 격리 프로필과 임시 사용자 데이터 디렉터리로 Chrome을 실행한다. Playwright 3종은 현재 보류다. 호스트 전역 `playwright` 또는 `playwright-core`가 필요한 설계이며 launcher와 격리 프로필은 MI-B에서 측정하지 못했다. 서비스 시작 실패는 `execution_failed`, 정리 실패는 경고로 기록한다.
- **M7 호스트 전용** — `ps`·`pgrep` 등 다른 프로세스 조회, Docker, 실제 CLI 인증·설정 쓰기, 의존성 설치와 그에 필요한 원격 fetch, Git 쓰기, Cypress, 키체인 작업을 포함한다. Bridge 역할은 해당 제약으로 검사를 끝낼 수 없으면 “환경 제한(host 전용)”이라고 보고하고, 막힌 검사와 미검증 범위를 적는다. Orchestrator는 기존 권한 범위에서 호스트 확인을 맡는다.

### 요청 계약

`prepare-dispatch`의 선택 키 `toolAccess`를 쓰면 아래 여섯 키를 모두 전달한다. 배열은 중복 없는 문자열만 받으며 저장 시 이름순으로 정규화된다. 형태 또는 역할 표 위반은 `invalid_request`다. 요청이 있으면 lease v3, 생략하면 v2를 쓴다. Native 경로에서 유효한 요청을 전달하면 `permission_scope_unverified`로 보류한다.

```json
{"network": "loopback", "domains": [], "unixSockets": [], "paths": [], "services": [], "envPresets": []}
```

| 키 | 읽기 역할 | Implementer | Tester |
|---|---|---|---|
| `toolAccess` | `invalid_request` | 선택 | 선택 |
| `network` | — | `null`, `"loopback"` | `null`, `"loopback"`, `"domains"`, `"full"` |
| `domains` | — | `[]` | `"domains"`이면 1–16개, 그 외 `[]` |
| `unixSockets` | — | 등록 ID(현재 0개) | 등록 ID(현재 0개) |
| `paths` | — | 등록 ID(현재 0개) | 등록 ID(현재 0개) |
| `services` | — | `[]` | `browser-cdp`, `browser-playwright-chromium`, `browser-playwright-firefox`, `browser-playwright-webkit` |
| `envPresets` | — | `ci`, `daemon-off`, `polling` | `ci`, `daemon-off`, `polling` |

도메인은 점을 하나 이상 포함하는 소문자 ASCII 이름이어야 한다. 전체 길이는 최대 253자, 각 레이블은 최대 63자이며 최상위 레이블은 영문자 2–63자 또는 규칙에 맞는 `xn--` 이름이다. 와일드카드, IP 리터럴, `localhost`와 그 하위 도메인, `.local`·`.internal`·`.home.arpa`로 끝나는 이름, scheme, 포트, 경로, 끝 점, 대문자와 공백을 거부한다.

요청 형태가 유효해도 모든 적용 gate가 `pass` 또는 `conditional`이어야 부여할 수 있다. `held`·`unmeasured` 또는 필수 사전 검사 실패는 `permission_scope_unverified`다. 조건부 부여의 범위는 결과의 `toolAccess.conditions`에 기록된다. `network.full`과 Playwright 서비스 ID는 계약에 있지만 현재 gate가 보류한다.

### Gate와 측정 근거

값은 `TOOL_ACCESS_GATES` 기준이다. Grok 공통 근거는 B14(2026-11-24에도 402가 지속되어 T6 생략), Gemini 공통 근거는 GG1이다. `—`는 해당 플랫폼의 gate가 정의되지 않았음을 뜻한다.

| 메커니즘 | Codex | Claude | Grok | Gemini | 측정 ID와 적용 조건 |
|---|---|---|---|---|---|
| `scratch` | pass | pass | unmeasured | held | SX3·SC0·SC2·MI-C |
| `env.base` | pass | pass | unmeasured | held | SX3·SC2 |
| `env.caches` | pass | pass | unmeasured | held | SX3·SC2·B4 |
| `env.ci` | pass | pass | unmeasured | held | SX3·SC2. env 전달 확인 |
| `env.daemon-off` | pass | pass | unmeasured | held | SX3·SC2. env 전달 확인 |
| `env.polling` | pass | pass | unmeasured | held | SX3·SC2. B9에서 감시 제약 확인 |
| `codexProfile` | conditional | — | — | — | B1·MI-1·MI-3. 작업 트리 `.git`·`.codex`의 읽기 전용 항목 필수 |
| `network.loopback` | pass | pass | unmeasured | held | SX1·SC1·B3·MI-1·MI-5 |
| `unixSockets.scratch` | pass | pass | unmeasured | held | SX4·SC3·B5·MI-1 |
| `unixSockets.registered` | pass | pass | unmeasured | held | B5. 등록 ID 0개 |
| `paths` | pass | pass | unmeasured | held | B13. 등록 ID 0개 |
| `network.domains` | conditional | conditional | unmeasured | held | B2·B6·B7·MI-6·MI-7·MI-9. Proxy 미준수 도구는 실패하며, Codex 외부 읽기 제한과 Claude Read 도구·디렉터리 읽기 제한 확인 |
| `network.full` | held | held | unmeasured | held | SX1·D-d. 도메인을 좁힐 수 있는 Codex·Claude에서 보류 |
| `service.browser-cdp` | conditional | conditional | unmeasured | held | SX4·SC3·SX7·MI-A. 홈과 `~/Library` 읽기 거부. 홈 밖 `/etc` 등의 파일은 `file://`로 접근 가능 |
| `service.browser-playwright-chromium` | held | held | unmeasured | held | B10·B11·MI-B. 호스트 전역 Playwright 부재로 격리 미측정 |
| `service.browser-playwright-firefox` | held | held | unmeasured | held | B10·B11·MI-B. 호스트 전역 Playwright 부재로 격리 미측정 |
| `service.browser-playwright-webkit` | held | held | unmeasured | held | B10·B11·MI-B. 호스트 전역 Playwright 부재로 격리 미측정 |

### 운영 한계와 확인 결과

- **Loopback**은 포트를 한정할 수 없다. 같은 호스트의 DB 등 다른 로컬 서비스에도 닿을 수 있고 Implementer가 로컬 서비스에 쓰기 요청을 보낼 수 있다. Codex의 proxy를 따르지 않는 도구는 `domains` 허용 목록에 대상이 있어도 실패한다(B2의 npm). 도메인 형식 검사는 DNS rebinding으로 이름이 사설 IP로 해석되는 경우를 검증하지 못한다.
- **실행 뒤 변경 감지**는 작업 트리와 지정된 제어 파일을 비교한다. 이 범위 밖의 저장소 외부 쓰기는 감지할 수 없다. Codex `workspace-write`의 범위 한계는 G5에 기록되어 있다.
- **파일 감시·프로세스 조회** — B9의 Node recursive `fs.watch`는 `EMFILE`로 실패했다. `polling` preset은 이를 지원하는 도구에만 적용되며 Node의 직접 호출은 바꾸지 않는다. `ps`·`pgrep` 등 다른 프로세스 조회는 호스트 전용이다(B8).
- **Chrome CDP** — MI-A에서 로컬 페이지와 스크린샷, proxy를 통한 외부 접속 차단, 홈과 `~/Library`의 파일 읽기 거부를 확인했다. `file:///etc/hosts`는 읽혔고 WebRTC 등 proxy 이외 경로는 별도 측정이 필요하다. `--use-mock-keychain`을 적용해 키체인 접근에서 멈추는 문제를 피했다.
- **Playwright** — 호스트 전역 패키지가 없어 MI-B에서 브라우저별 격리, `~/Library` 읽기 및 `file://` 접근을 검증하지 못했다. Chromium·Firefox·WebKit 서비스 모두 `held`다. Playwright 클라이언트와 서버 버전이 다르면 연결에 실패할 수 있다.
- **Claude env** — `domains`에서 정리하는 변수는 삭제 대신 값이 `""`로 설정된다. MI-6에서는 CLI 인증이 유지됐지만, 자격 증명을 해당 env에 의존하는 환경에서는 인증에 실패할 수 있다. Claude Bash는 `TMPDIR`를 자체 경로로 설정할 수 있으므로 증거 저장에는 `ARC_EVIDENCE_DIR`를 사용한다.
- **AC9 구성 요소 live** — Codex·Claude Tester에서 `services.json` endpoint, CDP `/json/version`, localhost 페이지·스크린샷, 외부 접속 차단과 `~/.gitconfig` 읽기 차단을 확인했다. Scratch·호스트 디렉터리 정리는 harness가 직접 호출했고 Claude에 `ARC_*`를 프로세스 env로도 전달했다. Supervisor 전체 dispatch live는 사용자 결정에 따라 머지·설치 뒤 확인한다.

기존 역할의 관찰 사항 두 건을 기록한다.

- Claude Planner와 Reviewer bridge에는 Bash가 없다. 쉘 실행이 필요한 확인은 해당 역할의 결과에서 미검증으로 보고한다.
- Grok bridge 읽기 역할은 CLI 내장 read-only 모드가 강제되지 않는다. 역할 지침의 읽기 전용 범위와 실행 뒤 변경 검사를 적용한다.

## Install, update, remove

Management and watch require an interactive terminal for input and output, including when watch uses `--json`. `arc --help`, `arc --version` and `arc watch --help` work without a terminal.

| Operation or mode | Action and confirmation |
|---|---|
| Settings | Configure defaults to Supervised, English, 100 total and 5 concurrent subagents. Edited mixed fields apply across participants. For the gates Full Auto can decide, see [Claude](../claude/skill/references/planning.md#full-auto-run-mode) · [Codex](../codex/skill/references/planning.md#full-auto-run-mode) · [Gemini](../gemini/skill/references/planning.md#full-auto-run-mode) · [Grok](../grok/skill/references/planning.md#full-auto-run-mode). |
| Standalone | Apply updates the selected home. Switching out of Mixed requires confirmation and restores standalone profiles before the selected operation. |
| New or same-participant Mixed | Install in anchor order, then publish at the anchor. Publication replaces owned standalone profiles with routing profiles. |
| Changed Mixed participants | Preview the mode, install additions and restore departing homes to standalone. An anchor move locks both stores and holds on non-terminal leases. |
| Update | Status revalidates the offered version. Global CLI replacement ends the session. An npx update leaves the global CLI in place. If the global CLI is broken, run `npx --yes @yunhozz/arc@latest`. Use Configure for a same-version refresh. |
| Preservation and holds | Preserve unrelated settings, shared skills and content outside managed blocks. Invalid policy or config, unresolved routing and active bridges can block applicable operations. |
| Global settings | Skipping global changes preserves existing instructions and settings. Codex config supports wait and concurrency settings. Claude Code writes the concurrency limit in `settings.json.env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`. |
| Recovery | Check reported residual paths. A rollback label alone provides no evidence of cleanup or backup. |

Automatic re-application uses the same path as manual Configure → Apply. It runs once for Mixed routing or once per installed standalone platform. On success, it applies the current ARC configuration to ARC-managed global instructions and native concurrency settings, overwriting edits within the managed scope. The native concurrency drift check holds automatic re-application only when the request omits a concurrency limit and an existing native value differs from that platform's saved ARC limit. For example, automatic re-application omits the limit when Mixed participants have different saved limits. If this check holds re-application, explicitly select the concurrency limit in Configure before choosing Apply. See [Upgrade](../README.md#upgrade) for the first npx upgrade from 0.4.6 or earlier and re-application recovery.

### Legacy migration

Configure → Apply moves a consistent legacy Codex-home v1 Mixed installation to the Claude anchor. The transaction repoints markers and leaves dispatch history in the old store.
Finish or cancel non-terminal leases before migration. Inspect lost supervisors, corrupt leases and uncertain exits manually. Legacy removal uses the old anchor. After downgrade, run Configure in the older version.
`cooperative.versions` holds in-flight plans when runtime or policy versions change. Finish or hand off before upgrade, or start a new workflow with fresh evidence and approvals.

| Uninstall | Scope and boundaries |
|---|---|
| Platform row | Confirm Remove (default Back); absent rows disabled. Mixed participant first restores others to standalone. Remove selected skill/profiles/managed blocks including edited ARC files; preserve other skills/profiles, native concurrency/wait/workflow records, unselected homes/user files; unclear ownership preserved/reported |
| Everything (incl. CLI) | Verified install/standalone platforms only; refused when a platform home cannot be resolved. Harness success required before verified global CLI removal, including npx; identity/context failure blocks harness writes; CLI failure preserves harness success; CLI removal ends session; preserve other packages/npx cache |
| CLI only | `npm uninstall -g @yunhozz/arc`; harness remains |

## Watch

Run `arc watch --help` for history and output options.

| Concern | Behavior and limits |
|---|---|
| Selection | Check the platforms to watch; all supported platforms are checked by default. Unsupported platforms are marked and cannot be checked. Confirming with no platform checked is refused. Back, Escape and EOF exit 0. Ctrl-C in the menu exits 130 |
| Sources | Supported platform transcripts and dispatch leases/artifacts. Codex Desktop sessions are excluded. |
| Scope | Watch follows one selected Git worktree or the current directory outside Git. The picker lists linked worktrees regardless of location and selects the current worktree by default. Other worktrees are outside the selected scope. Events use the session working directory at the time of the event. Dispatches are matched by their workflow target or an in-scope session linked to the dispatch artifact |
| Anchor | Marker active directory must match resolved registered home; one candidate selects store, none → legacy Codex, multiple → `dispatch store ambiguous` (other sources continue). No old-history merge |
| Shown | Full USER, AGENT and PROMPT messages; role badge on its own line above the message when known; EDIT/CREATE/DELETE list all paths (two or more as `- ` items; a single path has no `- `); other events one line |
| Hidden | Tool/command outputs, skill definitions/args, MCP args/results; reasoning only verbose; incomplete secret masking applies to JSON too |
| Read-only | No network or CLI except restricted Git discovery/listing; no writes |
| Display | TTY/width wraps messages/file lists; in a TTY, a bottom status block shows the watched path, with `working…` below it while a turn is in progress; JSON v1 preserves message lines/absolute paths; other text capped at 1000 code points. During watch, Ctrl-L clears the screen and Ctrl-C or a stop signal exits 0. `working…` ends after interrupt or 5 minutes idle |
| Shell detection | Git file lists and metadata infer edits, including possible external edits or duplicates. Ignored paths, unchanged fingerprints and non-Git roots are missed. Watch disables shell detection above 20,000 files or after three consecutive listing failures. Inferred JSON events carry `inferred:true`. |

| KIND | Meaning |
|---|---|
| USER | User message |
| AGENT | Agent message (ARC role prefix when known) |
| PROMPT | Agent-generated prompt sent to a child session (`kind: "prompt"` in `--json` output) |
| CMD | Command; literal successful Claude rm targets are not a filesystem audit |
| EDIT | File edit |
| CREATE | File creation |
| DELETE | File deletion |
| TOOL | Tool call |
| SKILL | Skill call; Codex skill-only reads deduplicated per turn; verbose also shows CMD |
| PLUGIN | Plugin call |
| TOOL! | Tool failure |
| SPAWN | Agent creation |
| DISPATCH | Routing dispatch |
| APPROVE | Approval |
| FAIL | Turn failure |
| ERROR | Error |
| SESSION | Session |
| END | Turn end |
| NOTICE | Notice |
| SETTINGS | Settings |
| TURN | Turn start |
| THINK | Reasoning |
| ITEM | Other item |

With color enabled in a TTY, watch renders Markdown in AGENT and PROMPT messages. `NO_COLOR`, piped output and `--json` preserve the Markdown source text.

## Workflow contracts

Use the installed skill and its references for role ownership, approvals, limits, verification, recovery and commits. The repository also provides the [shared role policy](../lib/policy/role-policy.json).

The Orchestrator owns routing, approvals, integration, acceptance, and commits. It answers simple questions directly and can ask a Scouter to research sources or explore the repository. Design depth and verification risk are separate decisions.

| Design depth | Approval and preparation |
|---|---|
| Spike | Approve the question and method, explore, report findings, and reassess the implementation and documents. |
| Bounded | Approve a short design. Add a spec if required and a plan if needed. Omission requires narrow eligibility. |
| Architectural | Approve the design direction, written spec, and implementation plan in order. |

The Planner drafts each applicable stage for user approval. Approved documents precede platform preparation and handoff. Verify the complete document set, the explicit execution target choice, the document commit, and actual workspace state. Execution targets include the current checkout, a new task branch, and a managed worktree on each platform.

Assign a fresh Implementer to each ready top-level task after verifying ownership, inputs, accepted predecessors, and capacity. Reserve slots within the total, concurrent, and runtime limits, and avoid concurrent edits to the same file. All specialists report back to the Orchestrator. The Orchestrator releases dependent work after acceptance and reassesses readiness as work proceeds.

Low-risk work uses focused checks. Ordinary and significant work require fresh QA and evidence for each criterion. Accept each planned task and create a focused commit or record a no-change result. Significant planned work gets a whole-change Reviewer review after task acceptance. Significant unplanned work gets Reviewer review before acceptance. If verification fails, hold the affected work, inspect and resolve the failure, and revalidate before proceeding.

Repository commit descriptions are concise Korean.

## Maintenance and source map

| Maintenance | Effect and boundaries |
|---|---|
| Reinstall | Refreshes packaged files and replaces managed profiles. Valid model settings and omitted limits survive. Open new sessions to load the changes. |
| Packaged references and runtime | Shared and platform sources compose into packaged references and a generated runtime. Published postinstall is informational. |
| Explicit upstream refresh | Run the Updater in the checkout to refresh mapped references and the manifest together. Publication errors trigger rollback and may leave reported residual paths. If cleanup fails after publication, the published files remain in place. Install and upgrade use packaged references. |
| Manifest | Update and check `MANIFEST.sha256`. Model settings are excluded. |
| Cleanup | Install removes valid legacy completion blocks. Status leaves shell files alone. Inspect residuals separately from agent Git recovery. |

| Concern | Source |
|---|---|
| References | [Claude](../claude/skill/references), [Codex](../codex/skill/references), [Gemini](../gemini/skill/references), [Grok](../grok/skill/references), [shared](../shared/skill/references) |
| Profiles and models | [Claude](../claude/agents), [Codex](../codex/agents), [Gemini](../gemini/agents), [Grok](../grok/agents), [model settings](../README.md#models-and-language) |
| CLI and management | [Root](../lib/cli/root.mjs), [TUI](../lib/tui/app.mjs), [operations](../lib/management/operations.mjs), [watch](../lib/watch/index.mjs) |
| Installation and routing | [Targets](../lib/installer/targets.mjs), [plans](../lib/installer/plan.mjs), [settings](../lib/installer/runtime-config.mjs), [install](../lib/installer/install.mjs), [remove](../lib/installer/uninstall.mjs), [transactions](../lib/installer/transaction.mjs), [bridge gates](../lib/runtime/role-dispatch-policy.mjs) |
| Maintenance checks | [Updater](../scripts/update-superpowers.mjs), [manifest](../scripts/update-manifest.mjs), [runtime copies](../scripts/update-runtime-assets.mjs), [harness tests](../tests/test_harness_contract.py), [Node tests](../tests/node) |
