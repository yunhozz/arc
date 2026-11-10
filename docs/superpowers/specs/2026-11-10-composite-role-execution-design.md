# ARC `Claude & Codex` 복합 역할 실제 실행 명세

상태: 승인됨(2026-11-10, 사용자). Planner 첫 초안을 Orchestrator가 저장·검토하고 미결 O1–O3 결정을 반영했습니다.

## 0. 기준과 문서 순서

- 소스 저장소 `/Users/yunho/Desktop/project/arc`, 브랜치 `feat/install-update-integration-screen`, 기준 HEAD `5451eaf`. 별도 작업 1(`lib/tui/setup.mjs`, `lib/tui/custom-preset.mjs`, `tests/node/tui-setup.test.mjs`)은 이 명세가 소유하거나 변경하지 않습니다.
- 대상: 현재 브랜치(사용자 명시).
- 승인된 설계: `.git/arc/design/2026-11-10-composite-role-execution-brainstorm.md`
- 스파이크 결과: `.git/arc/design/2026-11-10-composite-role-execution-spike.md` (claude 2.1.322, codex-cli 0.167.0)
- 계획 경로: `docs/superpowers/plans/2026-11-10-composite-role-execution.md` (이 명세 승인 후 작성)
- 선행 명세: `docs/superpowers/specs/2026-11-08-role-platform-routing-design.md`. 이 명세는 선행 명세 §3 L150–154의 "필요 근거 없으면 시작 보류"와 §4의 시작 전 보류 규칙을 대체합니다. 그 밖의 범위, 비밀 정책, 인증 분류, 리비전·마커 계약은 유지합니다(§8).

## 1. 의도와 범위

현재 대화의 Orchestrator가 다섯 역할(`arc_scouter`, `arc_planner`, `arc_implementer`, `arc_qa`, `arc_reviewer`)을 TUI에서 지정한 플랫폼·모델·effort로 **실제로 실행**하게 합니다.

- Orchestrator와 같은 플랫폼의 역할은 네이티브 서브에이전트(native)로 실행합니다.
- 다른 플랫폼의 역할은 ARC 런타임이 상대 CLI를 실행하는 경로(bridge)로 실행합니다.

현재는 모든 역할이 `held / unverified`입니다(`lib/runtime/role-routing.mjs:96-121` hold 고정, `lib/runtime/role-bridge.mjs:3-7` run/observe/resume 보류, `lib/installer/role-routing.mjs:44-49`의 `agents/arc-routing-*` 프로필 사용처 없음).

### 1.1 포함

- 런타임 명령 6개: `routing-status`(신규), `prepare-dispatch`, `run-dispatch`, `observe`, `resume`, `cancel`(신규)
- 전역 dispatch lease 저장소, 비동기 supervisor 프로세스, 출력 수집
- 모델·effort·권한 관측과 사후 변경 검출
- native 프로필 revision 태그(설치기)와 native lease 기록
- 비터미널 bridge lease 존재 시 복합 설정 게시 차단
- 두 하네스의 `coordination.md`, `limits.md`, `handoff.md` 지침 갱신
- `docs/harness-operation.md`, README, `lib/management/operations.mjs` 결과 문구 갱신
- 런타임 해시, 설치 복제본, `MANIFEST.sha256` 갱신
- 테스트 추가와 실행(D10)

### 1.2 제외

서명된 호스트 증명 공급자, 계정 선택, 원격·클라우드 세션, 자동 폴백과 모델 대체, 표준 `arc-*` 프로필 변경, `lib/tui/*` 수정(필요 시 별도 조정), Desktop 두 환경의 자동 검증(수동 체크리스트로 지원 상태 라벨만, D7).

### 1.3 반목표 (기술적으로 동작해도 실패)

1. 모델이나 플랫폼의 조용한 대체
2. 자식 CLI의 Orchestrator화(ARC `SKILL.md` 재로딩, 재위임)
3. 읽기 전용 역할의 작업 트리·Git 변경
4. 비밀이 인자·프롬프트·로그·상태 파일에 남는 것
5. 종료가 확인되지 않은 실행의 슬롯 해제

## 2. 사용자 결정 (2026-11-10 승인)

| ID | 결정 |
|---|---|
| D0 | 접근안 B: supervisor 기반 비동기 디스패처 + 영속 dispatch 저장소 |
| D1 | 근거 수준 라벨(`operator-attested`/`unverified`)을 붙여 실행 허용. 관측값이 요청과 다르면 실패 |
| D2 | 사전 스파이크 완료(§10) |
| D3 | Claude bridge Bash는 Claude 샌드박스 강제 + 샌드박스 내 자동 허용. 런타임 적용은 게이트 G1. G1 실패 시 Bash가 필요한 해당 역할의 Claude bridge는 `permission_scope_unverified` 보류 |
| D4 | Codex QA는 `workspace-write` + 사후 검출 |
| D5 | effort 관측 불가 시 라벨만 붙이고 진행 |
| D6 | 별칭 요청은 관측 정규 ID에 같은 계열 토큰이 있으면 일치. 정확 ID 요청은 정확 일치 |
| D7 | 첫 릴리스는 CLI 두 환경 우선. 호스트 샌드박스 승격은 매번 승인. Desktop은 수동 체크리스트로 지원 상태 라벨 |
| D8 | 비터미널 bridge lease가 있으면 게시 차단 |
| D9 | 타임아웃 Implementer 60분, QA 30분, 그 외 20분 |
| O1 | 첫 릴리스 타임아웃은 고정값만(사용자 설정 없음) |
| O2 | 지원 CLI 버전은 하한과 상한을 모두 둠(§5.14) |
| O3 | 터미널 lease는 기간 경과 후 자동 정리(§5.6) |
| D10 | 이번 작업에서 테스트 추가·실행 허용 |

## 3. 용어와 공통 데이터

### 3.1 근거 수준

- `runtime-observed`: ARC가 직접 띄운 프로세스, 또는 CLI가 직접 쓴 로컬 파일·스트림에서 ARC가 읽은 값(Claude `system/init`, Claude transcript, Codex `thread.started`, Codex rollout `turn_context`).
- `operator-attested`: Orchestrator가 입력하거나 호스트 화면에서 본 값(native agent ID, 에이전트 목록의 revision 태그). 기존 `cooperativeCoverage()`의 `provenance:'operator-attested'`(`lib/runtime/bootstrap.mjs:12`)와 같은 수준.
- `unverified`: 관측 경로가 없거나 관측 실패.

### 3.2 claims 객체

```
claims: {
  identity:    {level, source},
  model:       {level, source, requested, observed?},
  effort:      {level, source, requested, observed?},
  permissions: {level, source, details},
  terminal:    {level, source}
}
```

- `supportStatus`는 다섯 항목이 모두 `runtime-observed`이고 불일치가 없을 때만 `verified`, 그 밖에는 `unverified`.
- `decision:'allow'`는 `supportStatus`와 독립입니다(D1).
- 관측값이 요청과 다르면 `routeStatus:'failed'`이며 성공으로 바뀌지 않습니다.

### 3.3 routeStatus

`held | reserved | starting | running | completed | failed | cancelled | unknown` (선행 명세 §4 어휘에 `starting` 추가)

## 4. 근거와 현재 상태

- 활성화 검증(`readActivation`, 잠금)은 구현되어 있고 유지합니다(`role-routing.mjs:72-93`, `:39-71`).
- 인증 probe(`lib/runtime/local-cli.mjs:45-71`)는 자식 프로세스를 실행하며 유지합니다.
- `$ARC_RUNTIME_ENTRY` 해석 규칙은 `claude/skill/references/planning.md:159`, codex `planning.md:167`에 있으나 Composite 절(claude `coordination.md:111-115`, codex `:109-113`)이 참조하지 않습니다.
- Composite 절 사실 오류 두 가지: `execution_identity_unverified`를 prepare-dispatch 사유로 서술(실제로는 run/observe/resume), "peer CLI를 시작하지 않는다"(실제로는 인증 probe 자식 프로세스 실행).
- 지침의 native 이름 매핑은 표준 `arc-*`/`arc_*`만 다룹니다(claude `coordination.md:20`, codex `:20`, `:55`).
- workflow 상태 위치 `<gitCommonDir>/arc/workflows/<id>/`(`lib/runtime/scope.mjs:34-35`). 역할별 Claude 도구 목록 `lib/models/profiles.mjs:2-8`.
- `tests/node`에 prepare-dispatch·bridge 테스트 없음.

## 5. 설계

### 5.1 흐름

```
Orchestrator
 ├─ routing-status ───────────▶ revision, 역할별 route/profile/요청 조합, 플랫폼 인증
 ├─ prepare-dispatch ─────────▶ [잠금] 활성화 대조 → 인증 → 중복·동시성 → lease(reserved) → allow | hold
 ├─ native: 호스트 도구로 arc-routing 프로필 스폰 → observe(event) [operator-attested]
 └─ bridge: run-dispatch(brief) → supervisor(detached) → 자식 CLI
            observe(waitMs) → 상태·claims·resultPath
            resume(brief) / cancel
```

### 5.2 명령 계약

형식: `node "$ARC_RUNTIME_ENTRY" <command> --cwd <abs worktree> --workflow <id> --input -`. 출력은 JSON 한 줄, 종료 코드는 `command.mjs:29` 매핑 유지(allow 0, deny 2, hold 3, 오류 1). 모든 입력은 정확한 키 집합으로 검증하고 모르는 키는 deny.

| 명령 | 입력 | 출력과 효과 |
|---|---|---|
| `routing-status` | `hostPlatform`, `executionEnvironment` | 잠금 아래 `readActivation` 결과: `revision`, 역할별 `{route, platform, model, effort, profileName, revisionTag}`, 플랫폼별 인증 분류. 예약 없음. 인증 probe 자식은 실행 |
| `prepare-dispatch` | `hostPlatform`, `executionEnvironment`, `role`, `expectedRevision`, `requestId`, `taskId`, `allowedPaths`(Implementer 필수, worktree 상대 경로 배열) | §5.3 통과 시 lease `reserved` 생성 후 `allow{dispatchId, route, profileName, claims 초기값}`, 아니면 `hold{reasons}` |
| `run-dispatch` | `dispatchId`, `brief`(UTF-8, 256 KiB 이하) | bridge lease만. 시작 직전 잠금 재획득 후 활성화·프로필 해시·revision 재대조 → supervisor detached 기동 → `starting` 기록 → 즉시 `{routeStatus, dispatchId, resultPath}` 반환 |
| `observe` | bridge: `dispatchId`, `waitMs?`(0–540000) / native: `dispatchId`, `event`(`started`·`completed`·`failed`·`cancelled`), `nativeAgentId?` | bridge는 상태 변화 또는 `waitMs` 경과까지 1회 대기 후 상태·claims·`resultPath`·사유 반환. native는 입력을 operator-attested로 기록 |
| `resume` | `dispatchId`, `brief` | §5.7 조건 충족 시에만 같은 세션으로 새 실행 구간 시작 |
| `cancel` | `dispatchId` | 프로세스 그룹 SIGTERM → 10초 유예 → SIGKILL. 반환 `cancelling`. `cancelled`는 종료 관측 후에만 기록 |

### 5.3 prepare-dispatch 판정표

| 검사 | 실패 시 |
|---|---|
| 요청 형식, 호스트·환경 일관성 | deny(`invalid_request`) |
| 잠금 획득, `readActivation`, revision 일치 | `activation_unverified` |
| 대상 플랫폼 CLI 존재·인증 | `Not Avaliable` / `Unauthorized` / `Incomplete` |
| 대상 플랫폼 CLI 버전이 지원 범위(§5.14) 밖 | `permission_scope_unverified` |
| 환경 지원 등급(§5.9) | `environment_unverified` |
| 같은 `requestId` 또는 같은 workflow·task·role의 비터미널 lease | deny(`duplicate_dispatch`) |
| bridge 동시성·누적 한도(§5.6) | `capacity_exhausted` |
| bridge 권한 게이트(G1, G3, G5, G6)가 해당 역할·플랫폼에 미충족 | `permission_scope_unverified` |
| Codex 호스트 supervisor 생존 게이트(G2) 미충족 | `host_sandbox_blocked` |
| native: 없음. revision 확인은 Orchestrator가 스폰 전(§5.4) | — |

- 보류 시 확인된 모든 사유를 해제 조건과 함께 반환(기존 형태 유지).
- `native_provider_unavailable`, `capacity_unverified`, `model_effort_observer_unavailable`은 차단 사유에서 제외하고 claims 라벨로 표시(§8).

### 5.4 native 경로

- 스폰: Claude 호스트는 Agent 도구 `subagent_type: "arc-routing-<suffix>"`, Codex 호스트는 `spawn_agent` `agent_type: "arc_routing_<suffix>"`(기존 `fork_turns="none"`, `task_name` 규칙). 모델 인자로 덮어쓰지 않음.
- revision 태그: 설치기 `renameProfile`(`lib/installer/role-routing.mjs:19-24`)이 description에 `[arc-routing rev <revision>]` 삽입. 마커 해시는 렌더 바이트 기준이라 자동 포함. Orchestrator는 스폰 전에 에이전트 목록의 태그와 `routing-status.revision`을 비교하고, 다르거나 미노출이면 해당 역할을 `native_profile_reload_unverified`로 보류하고 "새 세션 필요"를 보고.
- 수명주기: `observe started`와 `completed`·`failed`·`cancelled` 중 하나를 기록. claims는 identity/model/effort/terminal 모두 `operator-attested`, permissions는 단일 모드와 같은 수준(`operator-attested`, 프롬프트 계약).
- 한도: Orchestrator 원장과 호스트 한도(§5.6).

### 5.5 bridge 경로

명령 인자의 유일한 원천은 시작 직전 잠금 아래 해시를 재대조한 대상 플랫폼 쪽 `arc-routing-<suffix>` 프로필 파일입니다. model, effort, tools, 지침 본문을 여기서 추출합니다. 실행 파일·cwd·설정 홈은 `resolveLocalCli`/`localCliEnvironment`(`local-cli.mjs:26-44`). 자식 환경에 `ARC_BRIDGE_CHILD=<dispatchId>`를 추가하고, 어댑터는 이 표식이 있는 Hook 이벤트를 관측 전용으로 분리합니다. brief는 stdin으로만 전달하고 위치 인자 프롬프트는 주지 않습니다(스파이크: 인자+stdin 혼용 시 Claude 3초 대기 경고, Codex는 stdin을 추가 입력으로 읽음).

**Claude 자식**

```
claude -p --safe-mode --output-format stream-json --verbose
  --model <model> --effort <effort>
  --append-system-prompt <프로필 본문>
  --tools "<프로필 tools>" --permission-mode <역할별>
  [--settings '<샌드박스 JSON>']        # Bash 역할만 (G1)
  [--strict-mcp-config]                  # G6 결과에 따름
  (stdin: brief)
```

**Codex 자식**

```
codex [--search] exec --json -C <worktree> -m <model>
  -c model_reasoning_effort=<effort> -c developer_instructions=<프로필 지침>
  -c sandbox_mode=<역할별> -c approval_policy="never"
  -o <resultPath> -
```

`--search`는 top-level 옵션이며 Scouter에만. `--skip-git-repo-check`는 쓰지 않습니다.

**역할별 권한**

| 역할 | Claude bridge | Codex bridge |
|---|---|---|
| Scouter | `Read,Grep,Glob,WebFetch,WebSearch`, mode `default` | `read-only` + `--search` |
| Planner | `Read,Grep,Glob`, mode `default` | `read-only` |
| Reviewer | `Read,Grep,Glob`, mode `default` | `read-only` |
| QA | `Read,Grep,Glob,Bash` + 샌드박스 강제·자동 허용(G1) | `workspace-write` + 사후 검출(D4) |
| Implementer | `Read,Grep,Glob,Bash,Write,Edit`, `acceptEdits` + 샌드박스(G1) | `workspace-write` + 사후 검출 |

- Claude 시작 직후 권한 관측(runtime-observed): supervisor가 `system/init`의 `tools`가 프로필 tools와 정확히 같은지, `permissionMode`, MCP 도구 노출 여부를 확인. 다르면 즉시 그룹 종료 후 `failed(permission_scope_mismatch)`. `--tools` 화이트리스트는 Task를 노출하지 않아 재위임도 차단(V4).
- Codex 시작 직후 권한 관측(runtime-observed): `thread_id`로 rollout(`<CODEX_HOME>/sessions/**/rollout-*<thread_id>*.jsonl`)을 찾아 첫 `turn_context`의 `sandbox_policy`·`approval_policy`를 요청값과 대조. 다르면 같은 처리.
- 사후 검출: supervisor가 실행 전후 HEAD, 브랜치, `git status --porcelain`, 변경 파일 해시를 스냅샷(`scope.mjs:23-25` 방식 재사용). 다음은 `failed(permission_violation_observed)`이고 의존 작업 보류: 읽기 전용 역할의 변경, Implementer의 `allowedPaths` 밖 변경, QA의 brief 미허용 경로 변경, 어느 역할이든 HEAD·브랜치 변경. 한계: worktree 밖 쓰기는 검출 범위 밖(V8, G5).
- Codex 재위임: 차단 수단 미확정(V6). 지침으로 금지하고 rollout의 `spawn_agent` 계열 function_call 검출 시 `failed(delegation_observed)`(G3). G3 입증 전까지 Codex bridge `claims.permissions`는 최대 `operator-attested`.
- 스트림 해석: 성공·실패는 종료 코드와 터미널 이벤트(Claude `result.is_error`, Codex `turn.completed`/`turn.failed`)로 판정. Codex `type=error` 경고 item(예: "Under-development features enabled")은 경고로만 기록.

### 5.6 저장소, 잠금, 한도

- 전역 lease: `<CODEX_HOME>/arc-role-dispatch/<dispatchId>.json`(0600, 디렉터리 0700). 기존 `arc-role-platform-routing.lock`(`acquireRoleRoutingLock`) 아래에서만 생성·갱신. 필드: `version`, `dispatchId`, `workflowId`, `taskId`, `requestId`, `role`, `route`, `hostPlatform`, `executionEnvironment`, `revision`, `profileHash`, `argsDigest`, `state`, `supervisor{pid, startTime}`, `child{pid, startTime}`, `sessionId`, `timeoutMinutes`, `claims`, `reasons`, `allowedPaths`, `resultPath`, `segment`, `nativeAgentId`, `createdAt`, `updatedAt`. 비밀·원시 출력 없음.
- workflow 산출물: `<gitCommonDir>/arc/workflows/<workflowId>/dispatches/<dispatchId>/` — `brief.md`, `events.jsonl`(정규화 필드만, 4 MiB 초과 시 절단 표시), `result.md`, `record.json`, `segments/`(resume 구간별).
- bridge 한도(ARC 강제): 활성 bridge lease(`reserved`, `starting`, `running`, `unknown`) 수 ≤ 호스트 `skills/arc/limits.toml`의 `max_concurrent_subagents`, workflow별 bridge 누적 ≤ `max_total_subagents`. native+bridge 합산은 Orchestrator 원장(프롬프트 수준)이며 bridge dispatch도 원장에 생성 인스턴스로 계수.
- 게시 차단(D8): `publishCompositeFiles`(`lib/installer/role-routing.mjs:78-118`)가 잠금 아래 비터미널 bridge lease가 있으면 거부하고 `activation:'held'`와 dispatchId 목록을 반환. native lease는 차단하지 않음(실행 중 native 에이전트는 이미 프로필 로드).
- terminal lease 정리(O3): `prepare-dispatch`와 `routing-status`가 잠금 아래에서 `completed`·`failed`·`cancelled` 상태이고 `updatedAt`이 30일을 지난 lease 파일만 삭제합니다. `reserved`·`starting`·`running`·`unknown`은 기간과 무관하게 삭제하지 않습니다. 삭제 실패는 보고만 하고 판정에 영향을 주지 않습니다. workflow 산출물(`<gitCommonDir>/arc/workflows/...`)은 이 정리 대상이 아닙니다.

### 5.7 수명주기, 타임아웃, 재개

- supervisor는 5초 간격 heartbeat를 lease에 기록.
- `unknown` 판정: heartbeat 30초 이상 끊김 + pid·시작 시각 대조 결과 프로세스 없음 + 터미널 기록 없음 → `unknown`, `terminal_state_unverified`. 슬롯 유지, 자동 재실행 없음.
- 타임아웃: 역할별 기본값(D9) 경과 시 `cancel`과 같은 절차. 종료 관측 시 `failed(timeout)`, 아니면 `unknown`.
- Implementer 중단 시 사후 스냅샷을 기록하고 Orchestrator가 변경을 대조할 때까지 의존 작업 보류.
- resume 허용 조건: 같은 dispatchId, 상태 `completed`/`failed`(`unknown`·`cancelled` 제외), 세션 ID 기록됨, 활성 revision이 lease revision과 같음(다르면 `revision_changed` 보류). 새 QA·Reviewer 배정은 기존 세션 재사용 금지.
- resume 명령은 플래그를 매번 전부 재지정(V13): Claude `claude -p --resume <sid>`에 model·effort·tools·permission·settings(effort 생략 시 기본값으로 돌아감), Codex `codex exec resume <tid>`에 `-m`, `-c model_reasoning_effort`, `-c sandbox_mode`(`--sandbox`, `-C` 불가). resume 구간에도 같은 관측·사후 검출 적용.

### 5.8 타임아웃 (O1)

런타임 고정값: `arc_implementer` 60분, `arc_qa` 30분, 그 외 20분. 첫 릴리스에서 사용자 설정과 요청별 조정은 지원하지 않습니다. `limits.toml` 형식은 바꾸지 않습니다.

### 5.9 환경 지원 등급 (D7)

| 환경 | 첫 릴리스 |
|---|---|
| `claude-cli` 호스트 | 지원(V9 supervisor 생존 확인) |
| `codex-cli` 호스트 | G2 통과 시 지원. 미통과 시 bridge는 `host_sandbox_blocked`, native는 지원 |
| `claude-desktop`, `codex-desktop` | 수동 체크리스트 통과 기록 전까지 `environment_unverified` 보류. 통과 후에도 `supportStatus` 최대 `unverified` |

Codex 호스트에서 `run-dispatch`, `resume`, `cancel`, lease를 쓰는 `prepare-dispatch`·`observe`는 매번 사용자 승격 승인을 요청. 미승격·실패 시 `host_sandbox_blocked`. 접두 규칙 상시 허용 없음.

### 5.10 실패 분류 (자동 대체·재시도 없음)

| 사유 | 시점 | 처리 |
|---|---|---|
| `activation_unverified` | 시작 전 | 보류 |
| `Not Avaliable` / `Unauthorized` / `Incomplete` | 시작 전 | 보류 |
| `environment_unverified` | 시작 전 | 보류 |
| `host_sandbox_blocked` | 시작 전 | 보류 |
| `capacity_exhausted` | 시작 전 | 보류 |
| `permission_scope_unverified` | 시작 전 | 보류 |
| `native_profile_reload_unverified` | 시작 전 | 보류 |
| `revision_changed` | resume 전 | 보류 |
| `duplicate_dispatch`, `invalid_request` | 시작 전 | deny |
| `permission_scope_mismatch` | 시작 직후 | 종료 후 `failed` |
| `model_effort_mismatch` | 시작 직후·실행 중 | 종료 후 `failed` |
| `auth_rejected`, `model_rejected`, `effort_rejected` | 실행 중 | `failed` |
| `permission_violation_observed`, `delegation_observed` | 실행 중·종료 후 | `failed`, 의존 작업 보류 |
| `invalid_output` | 종료 후 | `failed` |
| `execution_failed` | 종료 후(위 분류에 해당하지 않는 비정상 종료) | `failed` |
| `timeout` | 실행 중 | 종료 관측 시 `failed`, 아니면 `unknown` |
| `execution_identity_unverified` | 시작 후 세션 ID 미확보 | `unknown` |
| `terminal_state_unverified` | supervisor 소실 등 | `unknown`, 슬롯 유지 |
| `model_effort_unverified` | 관측 불가 | 라벨만(D5) |

### 5.11 모델과 effort 관측

- Claude model: `system/init.model`(V11). 별칭은 정규 ID로 관측(`haiku` → `claude-haiku-5-5`). Claude effort: transcript(`~/.claude/projects/**/<session_id>.jsonl`)의 `output_config.effort` 또는 `assistant.effort`(V2). 읽을 수 없으면 `unverified`(D5).
- Codex model·effort: rollout `turn_context`(V12). JSON 스트림에는 없음.
- 판정(D6): 요청값이 카탈로그 별칭(`opus`, `sonnet`, `haiku` 등)이면 관측 ID를 `-`로 나눈 토큰에 별칭이 있을 때 일치. 그 밖은 정확 일치. 불일치는 `model_effort_mismatch`.
- transcript·rollout은 읽기만 하고 판정 필드만 추출.

### 5.12 지침 변경

- 양쪽 `skill/references/coordination.md`: "Composite Platform Role Preflight"를 "Composite Platform Role Dispatch"로 교체. `$ARC_RUNTIME_ENTRY`는 `planning.md`(claude :159, codex :167) 링크. 절차 `routing-status` → `prepare-dispatch` → native 스폰 또는 `run-dispatch` → `observe`(1회 최대 대기, 짧은 폴링 루프 금지) → `resume`/`cancel`. native revision 태그 확인·모델 인자 금지. Codex 호스트 매번 승격 승인. 실패 시 폴백 없이 사유 보고. `:20` 옆에 복합 모드 이름 매핑 추가. §4의 사실 오류 두 가지 정정.
- 양쪽 `limits.md:31` 교체: bridge dispatch 원장 계수, ARC의 bridge 상한 강제, native+bridge 합산은 원장, `unknown`은 슬롯 유지, 역할별 고정 타임아웃, 터미널 lease 30일 자동 정리.
- 양쪽 `handoff.md`: bridge 결과는 `resultPath`의 최종 메시지, brief는 고정 순서·stdin 전용.
- `docs/harness-operation.md:24`와 README의 지원 상태를 §5.9 등급으로 수정. `lib/management/operations.mjs:76`, `:87`의 "Role execution: held / unverified."를 "Role execution: per-role status via routing-status"로 변경(TUI 표시는 범위 밖).

### 5.13 런타임 해시와 마이그레이션

- 새 모듈(예상: `role-dispatch-store.mjs`, `role-supervisor.mjs`, `role-bridge-args.mjs`, `role-observe.mjs`)을 `COOPERATIVE_RUNTIME_MODULES`(`bootstrap.mjs:7-11`), `lib/installer/runtime-assets.mjs`, 두 설치 복제본, `MANIFEST.sha256`에 등록.
- `cooperativeVersions().runtime`을 `cooperative-7`로 상향 → 기존 마커 무효화(`activation_unverified`) → Install/Update 재실행 필요를 문서·결과 문구로 안내.

### 5.14 지원 CLI 버전 범위 (O2)

- bridge 대상 CLI는 `--version` 출력에서 버전을 파싱해 검증한 범위만 허용합니다: Claude Code `>=2.1.322 <2.2.0`, codex-cli `>=0.167.0 <0.168.0`.
- 범위는 런타임 모듈 안의 단일 상수로 두고, 새 CLI 버전은 게이트 재검증 후 상수를 갱신하는 릴리스로만 넓힙니다.
- 범위 밖이거나 버전 파싱에 실패하면 해당 플랫폼 bridge를 `permission_scope_unverified`(해제 조건: 지원 범위 CLI 사용 또는 ARC 갱신)로 보류합니다. native 경로는 이 검사를 받지 않습니다.
- 버전 확인은 `routing-status`·`prepare-dispatch`에서 인증 probe와 함께 수행하고 결과를 `routing-status` 출력에 포함합니다.

## 6. 인수 기준

| ID | 기준 | 검증 방법 |
|---|---|---|
| AC1 | `routing-status`가 잠금 아래 활성 revision, 역할별 route·profile·요청 조합, 플랫폼 인증 분류를 반환하고 예약하지 않음 | 단위 테스트(임시 홈 + fake CLI): 정상·마커 불일치·미인증 |
| AC2 | `prepare-dispatch`가 §5.3 판정표대로 allow/hold/deny. 제외된 세 사유는 차단하지 않음. hold는 모든 사유와 해제 조건 포함 | 단위 테스트: 판정표 각 행, 사유 조합 |
| AC3 | lease 생성·갱신은 잠금 아래에서만. 중복 요청 deny, bridge 한도 초과 `capacity_exhausted`. 잠금 실패·잔여 잠금은 보류, 자동 삭제 없음 | 단위 테스트(동시 요청, 한도 경계, 잔여 잠금) |
| AC4 | 설치기가 `arc-routing-*` description에 revision 태그를 넣고 마커 해시와 일치. 지침이 native 스폰 이름·태그 확인·모델 인자 금지를 안내. native observe는 operator-attested 기록 | 단위 테스트(렌더 바이트, 마커), 지침 텍스트 테스트, native observe 단위 테스트 |
| AC5 | Claude bridge 인자가 §5.5와 같음(`--verbose`, `--effort`, `--tools`, `--append-system-prompt`, 역할별 mode·settings, 위치 인자 프롬프트 없음, stdin brief) | 역할별 argv 스냅샷(fake `claude`가 argv·stdin 기록) |
| AC6 | Codex bridge 인자가 §5.5와 같음(top-level `--search`는 Scouter만, `-c sandbox_mode`, `developer_instructions`, `-o`, `-`, `--skip-git-repo-check` 미사용) | argv 스냅샷 |
| AC7 | 출력 수집 경로·권한·크기 상한, 비밀 비노출(argv, brief 파일, lease, record, events, 진단에 키·토큰 없음) | 가짜 비밀 환경 변수 주입 후 산출물 전체 검색, 파일 모드 검사 |
| AC8 | identity는 Claude `system/init.session_id`, Codex `thread.started.thread_id`. model·effort 관측은 §5.11, 별칭 판정 D6. 불일치 `failed`, 관측 불가 `unverified` | fake 스트림·transcript·rollout 픽스처(일치·불일치·별칭·누락), 옵트인 실제 스모크 |
| AC9 | Claude init tools·permissionMode, Codex rollout sandbox·approval 즉시 대조, 다르면 종료 후 `permission_scope_mismatch`. 사후 검출이 §5.5 네 위반을 `failed`. Codex `spawn_agent` 검출은 `delegation_observed`(G3 반영) | 픽스처, 임시 git 저장소 변경 시나리오 |
| AC10 | `starting`·`running`·terminal 전이, 타임아웃(그룹 종료·유예), `cancel`, supervisor 소실 시 `unknown`·슬롯 유지, PID 재사용 판별. 종료 관측 전 슬롯 해제 없음 | fake CLI hang·kill 무시·손자 프로세스, supervisor 강제 종료 |
| AC11 | resume은 §5.7 조건에서만. 플래그 매번 재지정, Codex는 `-c sandbox_mode`만. QA·Reviewer 새 배정은 재사용 없음 | 조건별 허용·보류, argv 스냅샷, 옵트인 스모크 |
| AC12 | 비터미널 bridge lease가 있으면 게시 거부, native lease는 게시를 막지 않음 | `publishCompositeFiles` + lease 픽스처 |
| AC13 | 환경 등급(§5.9): Desktop은 체크리스트 라벨 없으면 보류, Codex 호스트 승격 실패 시 `host_sandbox_blocked`, 자동 대체·재시도 없음 | 환경 입력별 판정 단위 테스트, Desktop 수동 체크리스트 기록 |
| AC14 | §5.10 실패 분류가 구분되어 반환, 자동 대체·재시도 없음 | fake CLI 오류 출력별 분류 |
| AC15 | §5.12 지침·문서 반영, 사실 오류 정정, `$ARC_RUNTIME_ENTRY` 링크, 두 하네스 지침 의미 동일 | 지침 텍스트 테스트 + Reviewer 검토 |
| AC16 | 런타임 모듈 등록, 복제본 바이트 일치, `MANIFEST.sha256`, `cooperative-7`, 마이그레이션 안내 | 기존 manifest·runtime-assets 테스트 확장, `sha256sum -c` |
| AC17 | fake CLI 단위 테스트 묶음과 `ARC_LIVE_CLI_TESTS=1` 옵트인 실제 스모크(호스트 2종 × Planner 읽기·Implementer 쓰기, 자식이 ARC `SKILL.md` 미로딩 확인). CI 기본 실행에서 스모크 제외 | 테스트 실행 결과, 스모크 기록 |
| AC19 | 지원 CLI 버전 범위(§5.14) 밖 또는 파싱 실패 시 해당 플랫폼 bridge가 `permission_scope_unverified`로 보류되고 native는 영향 없음 | fake CLI `--version` 출력별 판정 단위 테스트 |
| AC20 | 30일 지난 터미널 lease만 잠금 아래 자동 정리되고 비터미널·`unknown` lease는 보존됨. 정리 실패는 판정에 영향 없음 | lease 픽스처(시각 주입) 단위 테스트 |
| AC18 | 게이트 G1–G7 결과 기록. 실패 게이트는 해당 역할·플랫폼·환경만 지정 사유로 보류, 독립 경로는 계속 동작 | 게이트 QA 기록 + 게이트 상태 입력 판정표 단위 테스트 |

선행 명세 AC6–AC9의 실행 부분은 AC2–AC14로 대체·구체화되며, 선행 AC10(비밀)은 AC7로 유지합니다.

## 7. 검증 게이트 (구현 첫 단계, QA 실행)

| 게이트 | 확인 내용 | 실패 시 |
|---|---|---|
| G1 (D3, V4) | `--settings` 주입 Claude 샌드박스가 `-p` Bash에 실제 적용되는지(worktree 밖 쓰기 거부, 탈출 옵션 비활성, 자동 허용) | Claude bridge Implementer·QA를 `permission_scope_unverified` 보류 |
| G2 (V9) | Codex CLI 호스트에서 detached supervisor가 명령 종료 후 생존(승격 조건 포함) | Codex 호스트 bridge `host_sandbox_blocked` |
| G3 (V6) | rollout에서 `spawn_agent` 계열 호출 검출 가능 여부, `features.multi_agent=false` 실효성 | 검출 불가 시 Codex bridge `claims.permissions`를 `operator-attested`로 제한·문서화 |
| G4 | `codex exec ... -`가 stdin brief만으로 동작 | Codex bridge 전체 `permission_scope_unverified`(brief 전달 경로 부재) |
| G5 (V8) | `-C <worktree root>`에서 `workspace-write` 쓰기 허용 범위 | 상위 쓰기 허용 시 문서와 `claims.permissions.details`에 기록, 사후 검출 한계 명시 후 진행 |
| G6 (V4) | `--tools` 아래 MCP 도구 노출, `--strict-mcp-config` 효과 | init 대조(AC9)가 fail-closed이므로 플래그 포함 여부만 결정 |
| G7 (V13) | Claude resume에서 model 재지정 적용 | Claude resume을 `model_effort_unverified` 라벨로 진행(관측 대조 유지) |

## 8. 기존 held 계약과의 관계

| 항목 | 이 명세 | 근거 |
|---|---|---|
| 잠금, `readActivation`, 해시·revision 대조 | 유지, bridge 시작 직전 재대조 | 실행 인자 원천이 해시된 프로필 |
| 인증 분류, 폴백 금지, 보류 결과 형태 | 유지 | 선행 명세 AC2, §4 |
| `native_provider_unavailable` | 차단 제외, operator-attested 라벨 | 단일 모드와 같은 근거 수준(`bootstrap.mjs:12`), D1 |
| `native_profile_reload_unverified` | revision 태그로 해제 가능 | §5.4 |
| `capacity_unverified` | bridge는 ARC 계수, native는 원장 | §5.6 |
| `permission_scope_unverified` | 플래그·시작 직후 관측·사후 검출·게이트로 판정 | §5.5, §7 |
| `model_effort_observer_unavailable` | 시작 후 관측으로 이동 | §5.11, D5 |
| `execution_identity_unverified`, `terminal_state_unverified`, `model_effort_mismatch` | 유지, runtime-observed로 판정 | §5.7, §5.11 |
| 선행 명세 §3 L150–154 | 대체. 단일 모드 동등 권한과 라벨 정직성 기준 | D1 |

## 9. 계획 단계 작업 경계 (힌트)

- QA 게이트 G1–G7: 구현 전 실행, 커밋 없음, 결과 기록. T2·T3은 게이트 결과에 의존.
- T1: dispatch 저장소, 판정 재작성, `routing-status`, 명령 스키마, CLI 버전 범위, 터미널 lease 정리(AC1–AC3, AC14 일부, AC19, AC20), fake CLI 테스트 보조물.
- T2: supervisor, bridge 인자, 출력 수집, 관측, 사후 검출(AC5–AC10). 선행 T1·게이트.
- T3: resume, cancel, 게시 차단(AC11, AC12). 선행 T2.
- T4: native revision 태그(설치기), native observe(AC4). 선행 T1, T2·T3과 독립.
- T5: 지침, 문서, `operations.mjs` 문구, 런타임 등록, 매니페스트, 버전 상향, 옵트인 스모크(AC13, AC15–AC17). 선행 T1–T4.
- 각 작업 뒤 fresh QA, 전체 수용 후 최종 Reviewer 1회. `lib/tui/*`는 어떤 작업에도 포함하지 않음.

## 10. 스파이크 반영 요약

- 확정: V1(`--verbose` 필수, safe-mode가 사용자 agents·skills·CLAUDE.md·plugin 제외), V2(`--effort`, transcript 관측), V3(append), V4(`--tools` 화이트리스트, init 반영), V5(`developer_instructions`), V7(top-level `--search`), V8(`.git` 쓰기 거부), V9(Claude 호스트 생존), V10(식별자 필드), V11(별칭 → 정규 ID), V12(rollout `turn_context`), V13(resume 재지정, Codex는 `-c sandbox_mode`만). Codex 경고 item 무시, `-o` 파일 생성 확인.
- 미검증(게이트·라벨): `--settings` sandbox 런타임(G1), Codex 호스트 생존(G2), V6 재위임 차단(G3), Codex stdin `-`(G4), `-C` 상위 쓰기 원인(G5), strict-mcp·allowedTools(G6), Claude resume model 재지정(G7), 사용자 `settings.json` Hook 차단(`ARC_BRIDGE_CHILD` 표식으로 완화). `--restricted`, `--system-prompt`, append 크기, `effortLevel` 환경 변수는 사용하지 않음.

## 11. 미결과 가정

미결: 없음. O1(고정값만), O2(하한+상한), O3(30일 경과 터미널 lease 자동 정리)는 2026-11-10 사용자 결정으로 확정했습니다.

가정:
1. bridge 자식은 Orchestrator와 같은 worktree에서 실행.
2. 역할 지침 원천은 대상 플랫폼 `arc-routing-*` 프로필.
3. `CODEX_HOME`은 두 호스트에서 같은 경로로 해석(`resolveConfigHome`).
4. 작업 1(`lib/tui`)과 파일이 겹치지 않음.
5. CLI 동작 근거는 스파이크 버전에 한정.

## Orchestrator 검토 기록

- 2026-11-10 사용자 승인. 승인 응답과 함께 O1–O3 결정을 받아 Orchestrator가 §2, §5.2, §5.3, §5.6, §5.8, §5.12, §5.14, §6(AC19, AC20), §9, §11을 직접 수정했습니다. 계획 검토(P-2, P-3)에 따라 §5.10에 `execution_failed`, §5.6 lease 필드 4개를 추가했습니다(계획 승인 시 함께 승인).
- 검토 체크리스트(범위·근거, 대상·소유·경로, 정책 충돌, 작업 경계·의존·기준, 검증·증거·보류, 역할·승인·커밋 경계, 완결성)를 통과. 실질 누락 없음.
- Planner 판단으로 정한 세부값(heartbeat 5초, 소실 30초, observe 최대 540초, brief 256 KiB, events 4 MiB, `revision_changed` 보류, Desktop 체크리스트 전 `environment_unverified`, G5 실패 시 기록 후 진행)은 승인 대상에 포함.
- 위험도: 보안·권한·프로세스 수명주기·공개 런타임 인터페이스 변경이므로 significant. 작업별 fresh QA와 최종 Reviewer 필수.
