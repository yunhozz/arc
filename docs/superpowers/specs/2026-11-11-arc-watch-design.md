# ARC watch 설계

- 상태: 개정 2 승인됨 (2026-11-12, 사용자 승인). 개정 1은 2026-11-11 승인·구현(W1·W2). 개정 전 판은 HEAD `e33f1e3`까지 구현됐다.
- 날짜: 2026-11-11
- 근거 기준: branch `feat/install-update-integration-screen`, HEAD `a8ffd31` (읽기 전용 조사). 개정 1 근거 기준: 같은 branch, HEAD `e33f1e3`.
- 선행 작업: 같은 branch에서 진행하는 별도 수정 계획(`Avaliable`→`Available`, bridge `observe`가 terminal/unknown까지 대기, runtime `cooperative-8`, Codex 인증 probe). 이 설계는 그 결과물에 의존하지 않는다.

## 1. 목적

Codex CLI나 Claude Code 세션 옆에 터미널 pane을 하나 열어 두고, 두 플랫폼에서 일어나는 활동을 **시간순으로 합친 하나의 스트림**으로 보고 싶다는 요구에서 출발한다. 사용자가 직접 연 세션, 그 세션의 하위 에이전트, ARC composite runtime이 띄운 bridge 자식이 모두 대상이다. 각 줄에는 플랫폼이 붙는다. 에이전트 메시지 줄에는 알 수 있으면 ARC 역할이나 하위 에이전트 이름도 붙는다(개정 1, §13.1). 실행 중인 Codex TUI 안에 표시하는 방법은 현재 없다(panel API 없음, `codex queue`는 사용자 메시지를 주입함, `tui_extensions_statusline`은 개발 중이며 꺼져 있음). 그래서 형태는 새 CLI 하위 명령 `arc watch`로 정했다(사용자 선택).

## 2. 목표 / 비목표 / 반목표

목표
- G1. `arc watch` 하나로 Codex와 Claude의 활동을 시간순으로 합친다(W1, W2).
- G2. 다음 출처를 포함한다(W3, W6, Q4).
  - 사용자가 직접 연 `codex-tui` 세션
  - `codex_exec` 세션(ARC bridge 자식과 사용자가 직접 실행한 `codex exec`)
  - Codex native 하위 에이전트
  - Claude Code 세션(모든 entrypoint)과 그 subagent
  - ARC가 띄운 `claude -p` bridge 자식
- G3. ARC dispatch 데이터로 세션을 역할과 dispatch에 연결해 표시한다. 이 연결은 Orchestrator를 어느 호스트에서 실행했는지와 무관하게 똑같이 동작한다(W5).
- G4. 완전히 읽기 전용으로 동작하며 로컬에서만 실행한다. 새 runtime 의존성은 없다.
- G5. 사람이 읽는 줄 출력과 기계용 `--json`(NDJSON v1) 출력을 함께 제공한다.

비목표
- 실행 중인 Codex TUI, Claude Code 화면, ARC TUI 메뉴 안에 표시하는 것(W4).
- Codex Desktop 세션(최상위 originator `Codex Desktop`)과 그 하위 에이전트.
- 도구 출력, 명령 출력, 파일 내용 표시.
- 과거 세션 검색이나 재생. 시작할 때 보여 주는 최근 이벤트(§10)는 예외다.
- 키 입력으로 조작하는 대화형 기능, 설정 파일, shell completion 등록.
- 원격이나 다중 기기 수집. Windows와 musl도 지원하지 않는다.
- `lib/runtime/`(설치되는 skill runtime) 동작 변경.

반목표 (기능은 돌아가도 실패로 보는 경우)
- watch가 `CODEX_HOME`, Claude 홈, git dir, ARC 아티팩트에 무엇이든 쓰거나 잠금을 잡는 것.
- 도구 출력, 암호화된 reasoning, 시스템과 개발자 지시문이 화면에 노출되는 것.
- lease 하나가 망가졌거나 transcript 형식이 바뀌었다는 이유로 스트림 전체가 멈추는 것.
- 기존 `arc` / `--help` / `--version` 동작이나 root가 TUI를 lazy import하는 방식이 깨지는 것.

## 3. 제약

- Node.js 22 이상, ESM. macOS 13 이상, Linux glibc 2.28 이상.
- 새 dependency를 추가하지 않는다(현재 `package.json`에는 devDependencies `node-gyp`, `smol-toml`만 있다).
- 코드는 **`lib/watch/` 아래에만** 새로 둔다.
  - `lib/runtime/*.mjs`는 `scripts/update-runtime-assets.mjs:14-18`가 skill runtime payload로 복사한다. 그리고 그 목록이 `RUNTIME_MODULE_PATHS`와 정확히 같아야 한다. 따라서 `lib/runtime/`에 파일을 추가하거나 고치지 않는다.
  - `lib/` 아래 파일은 모두 `MANIFEST.sha256` 대상이다(`scripts/update-manifest.mjs:20`). 새 파일을 추가하면 manifest를 다시 생성해야 한다.
- 재사용(import만 하고 수정하지 않음): `createLineParser`(`lib/runtime/role-observe.mjs:19`), `resolveConfigHome`(`lib/runtime/local-cli.mjs:7`).
  - git helper는 `role-observe.mjs`의 안전한 env 방식(`GIT_OPTIONAL_LOCKS=0`, global/system config 무시 등, :241-253)을 `lib/watch` 안에 따로 구현한다. 그쪽 함수는 export되지 않았기 때문이다.
- root 경로 import 규칙(`tests/node/terminal.test.mjs:7`): `lib/cli/root.mjs`는 `watch` 인자가 있을 때만 `lib/watch/index.mjs`를 동적으로 import한다. watch 경로는 `tui`, `safe-fs`, `installer`를 import하지 않는다.
- 출력 라벨은 영어로 한다. 기존 CLI와 TUI가 영어로 고정되어 있는 것(README:39, `docs/harness-operation.md:55`)과 맞춘다.

## 4. 접근안

| 안 | 내용 | 장점 | 단점 | 결정 |
|---|---|---|---|---|
| A | 단일 프로세스. 추적 파일은 500ms마다 `stat`하고 byte offset부터 tail한다. 탐색은 2초 주기. 공용 정규화 모델을 쓴다. | macOS와 Linux에서 같은 동작, 결정적인 테스트, 시제품에서 검증됨, 비용이 작음 | 최대 약 0.5초 지연, 유휴 상태에서도 주기적 `stat` | **채택** |
| B | `fs.watch` 이벤트 기반에 폴링 보조 | 지연이 짧고 유휴 비용이 낮음 | FSEvents의 이벤트 합침, Linux recursive watch 동작 차이 때문에 결국 폴링도 필요. 코드 경로가 둘이 되고 테스트가 비결정적 | 보류. 나중에 A 내부 최적화로만 고려 |
| C | Claude hooks, Codex app-server, `exec --json` 수집 | 구조화된 이벤트 | 사용자가 직접 연 `codex-tui`에는 붙을 수 없음. 사용자 settings를 바꿔야 해서 읽기 전용 원칙 위반 | 기각 |

참고: 시제품(`codex-watch.mjs`, scratchpad)은 동작 참고용일 뿐이며 코드로 재사용하지 않는다. 시제품의 알려진 한계는 다음과 같다.
- `session_meta`의 첫 64KB만 정규식으로 읽는다.
- 오늘과 어제 폴더만 본다.
- 세션 하나만 따라간다.
- Claude를 지원하지 않는다.

## 5. CLI 표면

### 5.1 문법
```
arc watch [--cwd <dir> | --all | --session <id>] [--platform codex|claude]
          [--tail <n>] [--verbose] [--json] [--width <n>]
arc watch --help
```
- 값을 받는 옵션은 `--opt value`와 `--opt=value` 두 형식을 모두 받는다. 짧은 옵션은 없다(root와 같은 방식).
- 같은 옵션을 두 번 주면 사용법 오류다. 위치 인자도 사용법 오류다.
- `--cwd`, `--all`, `--session`은 서로 배타적이다. 둘 이상을 주면 사용법 오류다.
- `--platform`은 한 번만 줄 수 있고 값은 `codex` 또는 `claude`다. 생략하면 둘 다 본다.
- `--tail <n>`: 0~1000 사이 정수. 기본값 20.
- `--width <n>`: 40~2000 사이 정수. 기본값은 TTY면 `output.columns`(최소 60, resize 때 다시 읽음), 아니면 200. `user`와 `agent` 메시지 줄에는 적용하지 않는다(개정 1, §11, §13.1).
- `--cwd <dir>`: 존재하는 디렉터리여야 한다. 상대 경로는 실행 cwd 기준으로 풀고 realpath로 바꾼다.
- `--session <id>`: Codex thread id, Claude session id, ARC dispatch id 가운데 하나다. 형식은 `/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/`.

### 5.2 root 변경 (`lib/cli/root.mjs`)
- `args[0]==='watch'`이면 `runWatch(args.slice(1), io)`의 반환값을 종료 코드로 쓴다.
- 그 밖의 인자 처리는 지금과 같다. 지원하지 않는 인자면 exit 2를 내고 stderr에 새 usage를 쓴다.
- root usage:
```
Usage: arc
       arc watch [options]
       arc --help
       arc --version
```
- root `--help` 본문에 다음 한 줄을 추가한다: `Run arc watch to follow Claude Code and Codex session activity.`

### 5.3 `arc watch --help` (stdout, exit 0, TTY 없어도 동작)
```
Usage: arc watch [options]

Follow Claude Code and Codex session activity in one read-only stream.

Scope (default: every worktree of the current Git repository, or the current directory):
  --cwd <dir>         Watch the repository or directory at <dir>
  --all               Watch sessions from every directory
  --session <id>      Follow one session or ARC dispatch and its subagents
  --platform <name>   codex or claude (default: both)

Output:
  --tail <n>          First show the last <n> events from recently active sessions (default 20, 0 = new only)
  --verbose           Also show reasoning, settings, turn starts and diagnostics
  --json              Write one JSON object per line
  --width <n>         Maximum width of one-line events (default: terminal width, or 200)
  --help              Show this help

User and agent messages are shown in full; other events use one line.
Tool and command outputs are never shown; common secret patterns are masked.
Codex Desktop sessions are not included.
Bridge roles on a Codex host are currently held (host_sandbox_blocked) and appear once they run.
Press Ctrl-C to stop.
```

### 5.4 종료 코드
| 코드 | 경우 |
|---|---|
| 0 | `--help`. SIGINT, SIGTERM, SIGHUP으로 정상 종료. stdout EPIPE(예: `\| head`)는 조용히 종료. 테스트용 abort signal. |
| 1 | 사용할 수 있는 출처가 하나도 없음(선택한 플랫폼의 홈이 모두 `resolveConfigHome`에서 거부됨). 그 밖에 예상하지 못한 내부 오류. stderr에 한 줄 메시지. |
| 2 | 사용법 오류. 알 수 없는 옵션이나 인자, 잘못된 값, 배타적 옵션을 함께 줌, `--cwd`가 디렉터리가 아님. stderr에 오류 메시지와 `arc watch --help`가 안내하는 usage. |

Ctrl-C를 130이 아니라 0으로 처리하는 것은 이 설계의 판단이다(pane에서 쓰는 도구의 정상적인 끝내는 방법이기 때문).

### 5.5 TTY와 색상
- TTY가 없어도 동작한다. root TUI와 다르다.
- ANSI 색상은 stdout이 TTY이고, `NO_COLOR`가 설정되지 않았고, `--json`이 아닐 때만 쓴다.
- 색은 §13.1의 표로 고정한다(개정 1).

## 6. 출처 탐색과 범위

### 6.1 홈 경로
- Codex 홈: `resolveConfigHome('codex', {userHome: os.homedir(), env, cwd})`. 이를 기준으로 `sessions/`와 `arc-role-dispatch/`를 쓴다.
- Claude 홈: `resolveConfigHome('claude', …)`. 이를 기준으로 `projects/`를 쓴다. ARC가 기본 `~/.claude`만 지원하는 정책을 그대로 따른다.
- 한 플랫폼의 홈이 거부되면 그 플랫폼만 끄고 NOTICE를 낸다. 선택한 플랫폼이 모두 꺼지면 exit 1.
- 디렉터리가 없으면 "아직 없음"으로 보고 계속 폴링한다. 디렉터리를 만들지 않는다.

### 6.2 범위
- **기본(저장소 범위)**
  - 실행 cwd(또는 `--cwd`)에서 `git rev-parse --show-toplevel`과 `git rev-parse --path-format=absolute --git-common-dir`을 실행한다.
  - 저장소면 `git worktree list --porcelain -z`로 모든 worktree 루트를 얻는다. 범위는 "어느 worktree 루트의 하위(경계는 path separator)인 cwd"이고, worktree 목록은 30초마다 다시 읽는다.
  - 저장소가 아니면 범위는 그 디렉터리의 하위다.
- **`--all`**: cwd로 거르지 않는다. Codex Desktop 제외 규칙은 그대로 적용한다.
- **`--session <id>`**
  - 다음 순서로 찾는다: Codex rollout 파일명 접미사 `-<id>.jsonl`, Claude `projects/*/<id>.jsonl`, lease `<id>.json`이나 아티팩트에 매핑된 session id.
  - 찾은 세션과 그 하위 에이전트, bridge 자식만 따라간다. cwd 범위는 무시한다.
  - 아직 없으면 NOTICE를 내고, 나타날 때까지 기다린다.
- **상속 규칙**
  - Codex와 Claude 하위 에이전트는 부모가 추적 중이면 포함한다(자기 cwd와 무관).
  - ARC bridge 세션은 해당 dispatch가 범위 안이면 포함한다(§8.3).

### 6.3 Codex 탐색
- 대상 파일: `sessions/YYYY/MM/DD/rollout-*.jsonl`. `.jsonl.zst`는 압축된 세션, 즉 이미 끝난 세션으로 보고 제외한다. `--verbose`일 때만 NOTICE를 낸다.
- 시작할 때: 오늘부터 7일 전까지의 날짜 폴더에서 mtime이 30분 이내인 파일을 고른다.
- 실행 중: 2초마다 오늘과 어제(로컬 날짜와 UTC 날짜의 합집합, 최대 3개 폴더)를 다시 읽어 새 파일을 찾는다.
- 분류: 첫 줄 `session_meta`를 `createLineParser`로 줄 끝까지 읽는다(상한 4 MiB). 읽는 필드는 `payload.id`, `originator`, `cwd`, `cli_version`, `source`, `thread_source`, `agent_role`, `agent_nickname`, `agent_path`, `source.subagent.thread_spawn.{parent_thread_id, depth, agent_role, agent_nickname, agent_path}`. `base_instructions` 같은 다른 필드는 무시하고 출력하지 않는다.
- 포함 규칙
  - (a) originator가 `codex-tui`이고 범위 안
  - (b) originator가 `codex_exec`이고 범위 안이거나 ARC dispatch에 매핑됨
  - (c) `parent_thread_id`가 추적 중인 thread를 가리킴. originator는 보지 않으며 depth 제한도 없다.
  - (d) 그 밖의 originator 값은 Q4에 따라 범위 안이면 포함한다. 단 `Codex Desktop`은 제외한다.
  - 최상위 originator가 `Codex Desktop`이면 모든 모드에서 제외한다. 그 하위 에이전트는 부모가 추적되지 않으므로 (c)에 걸리지 않는다.
- 부모보다 자식 rollout을 먼저 발견하면 최대 2초 보류한다. 그 사이 부모가 추적되면 붙이고, 아니면 버린다(verbose NOTICE).

### 6.4 Claude 탐색
- 대상 파일: `projects/<dir>/<sessionId>.jsonl`, `projects/<dir>/<sessionId>/subagents/agent-<id>.jsonl`, 그리고 같은 위치의 `agent-<id>.meta.json`.
- 탐색 주기는 2초다.
  - project 디렉터리마다 mtime을 확인하고, 처음 볼 때나 mtime이 바뀌었을 때만 readdir한다.
  - 추적 중인 세션은 `<sid>/subagents/` 디렉터리의 mtime도 확인한다.
- 시작할 때는 mtime이 30분 이내인 파일만 고른다.
- 저장소 범위의 사전 필터
  - project 디렉터리 이름과 각 worktree 경로를 모두 `/[^A-Za-z0-9]/g → '-'`로 정규화한다.
  - 디렉터리 이름이 worktree 쪽 값으로 시작하는 것만 후보로 둔다. Claude의 slug 규칙을 그대로 재현하지는 않는다.
- 범위 확정: 파일 앞부분 1 MiB 안에서 `cwd` 필드를 가진 첫 줄을 찾는다(첫 줄에 없을 수 있음: `last-prompt`, `mode` 등). 아직 없으면 10초 동안 다시 확인하고, 그래도 없으면 건너뛴다.
- entrypoint는 `entrypoint` 필드로 판단한다. 모든 값을 포함하며, `cli`가 아니면 라벨(`--json`의 `label`)에 표시한다(Q4, 개정 1).

## 7. 정규화 이벤트 스키마 v1

모든 출처는 다음 형태의 객체로 바뀐다. 값이 없는 필드는 생략한다(null로 쓰지 않음). v1 안에서는 필드 추가만 허용한다. 개정 1은 필드를 바꾸지 않는다. `user`/`agent`의 `text` 값 규칙(줄바꿈 보존, 길이 상한 없음)만 바꾸며, 스키마 버전은 1로 유지한다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `v` | 1 | 스키마 버전 |
| `ts` | ISO 문자열 | 출처의 timestamp. 없으면 관측 시각 |
| `observedAt` | ISO 문자열 | watch가 읽은 시각 |
| `platform` | `codex` \| `claude` | |
| `source` | `session` \| `subagent` \| `bridge` \| `dispatch` \| `watch` | |
| `origin` | 문자열 | Codex originator 원문, Claude entrypoint 원문 |
| `sessionId` | 문자열 | Codex thread id 또는 Claude session id. Claude subagent는 `agent-<id>` |
| `parentId`, `depth` | 문자열, 정수 | 하위 에이전트일 때 |
| `label` | 문자열 | §9. `--json`에만 나오고 사람용 출력에는 표시하지 않는다(개정 1) |
| `role` | `scouter`\|`planner`\|`implementer`\|`qa`\|`reviewer`\|`orchestrator` | 확인된 경우만 |
| `dispatchId`, `workflowId` | 문자열 | ARC dispatch에 매핑된 경우 |
| `kind` | enum (아래) | |
| `text` | 문자열 | §11 정책 적용 후. `user`/`agent`는 줄바꿈(`\n`)을 보존하고 길이 상한이 없다. 그 밖의 kind는 공백을 하나로 합치고, 마스킹하고, 최대 1000 code point |
| `truncated` | boolean | `user`/`agent`가 아닌 kind에서 `text`를 잘랐으면 true. `user`/`agent`에는 나오지 않는다 |
| `exitCode` | 정수 | command |
| `tool` | 문자열 | tool, tool_failed |
| `paths` | 문자열[] | file_change. 최대 20개 |
| `model`, `effort`, `approval` | 문자열 | settings, session |
| `state`, `reasons`, `route`, `hostPlatform` | | dispatch. 원문 그대로 |
| `cwd` | 문자열 | session |

`kind` 값과 기본 표시 여부(V = 기본에서도 표시, v = `--verbose`일 때만):
- `session` V
- `settings` v
- `turn_start` v
- `turn_end` V
- `turn_failed` V
- `user` V
- `agent` V
- `reasoning` v
- `command` V
- `tool` V
- `tool_failed` V
- `file_change` V
- `spawn` V
- `approval` V
- `dispatch` V
- `error` V
- `other` v
- `notice`: 중요한 것(범위 banner, live 구분선, 추적 상한 도달, 홈 거부)은 V, 나머지 진단은 v

## 8. 플랫폼별 매핑

### 8.1 Codex rollout
`event_msg`의 `item_completed`를 기준으로 삼고, `response_item`은 spawn 판정에만 쓴다. 같은 내용이 두 번 출력되는 것을 막기 위해서다.

| 원본 줄 | 조건 | kind | 사용하는 필드 (나머지는 버림) |
|---|---|---|---|
| `session_meta` (첫 줄) | | `session` | originator, cwd, cli_version, parent/depth/agent_role/nickname |
| `event_msg` `thread_settings_applied` | | `settings` | `thread_settings.model`, `reasoning_effort`, `approval_policy` |
| `event_msg` `task_started` | | `turn_start` | |
| `event_msg` `task_complete` | `error` 없음 | `turn_end` | |
| `event_msg` `task_complete` | `error` 있음 | `turn_failed` | `error.message` |
| `event_msg` `turn_aborted` | | `turn_end` | `reason` → text `aborted: <reason>` |
| `item_completed` `UserMessage` | | `user` | `content[].text` 연결 |
| `item_completed` `AgentMessage` | | `agent` | `content[].text` 연결 (`phase` 무관) |
| `item_completed` `Reasoning` | summary가 비어 있지 않음 | `reasoning` | `summary_text[]`만 씀. `encrypted_content`는 쓰지 않음 |
| `item_completed` `CommandExecution` | | `command` | `command`(배열이 `[shell,'-lc',script]` 형태면 script, 아니면 공백으로 join), `exit_code`. **`aggregated_output`은 쓰지 않음** |
| `item_completed` `FileChange`/`PatchApply` | | `file_change` | 경로만. `changes`가 객체면 키(절대 경로)와 문자열 `move_path`, 배열이면 `path`/`file`. 중복 제거, 최대 20개. `unified_diff`, `stdout`, `stderr`는 쓰지 않음 (§21 C1) |
| `item_completed` `McpToolCall` | | `tool` | server, tool 이름만. 결과는 쓰지 않음 |
| `item_completed` `Extension` | `kind:'web.search'` | `tool` | `tool:'web.search'`, `query`. `results`, `action`은 쓰지 않음 (§22 C9) |
| `item_completed` 그 밖의 type | `Extension`의 다른 kind, `SubAgentActivity`, `CollabAgentToolCall`, `ContextCompaction` 포함 | `other` | type 이름만(Extension은 `Extension:<kind>`) |
| `event_msg` `exec_approval_request`/`apply_patch_approval_request` | | `approval` | command 또는 경로 |
| `event_msg` `error` | | `error` | `message` |
| `response_item` `function_call`/`custom_tool_call` | name에 `spawn_agent` 포함 | `spawn` | arguments를 JSON으로 파싱할 수 있으면 `<agent_type>: <task_name>`. `message`는 암호문이므로 쓰지 않음 (§22 C8). 아니면 이름만 |
| 그 밖의 줄 | | 버림 | `response_item` message·`agent_message`·`reasoning`(지시문, AGENTS.md), `*_output`, `token_count`, `additional_tools`, `turn_context`, `world_state`, `token_usage_record`, `inter_agent_communication_metadata` 등 |

관측 근거: `UserMessage`, `AgentMessage(content[].type:"Text", phase)`, `Reasoning(summary_text)`, `CommandExecution(command[], cwd, status, aggregated_output, exit_code, duration)`, 그리고 `spawn_agent`가 포함된 `additional_tools`는 `~/.codex/sessions/2026/11/11/rollout-2026-11-11T09-01-10-01a1c7e8-….jsonl`(codex-tui)에서 확인했다. `FileChange`의 `changes`가 절대 경로를 키로 하는 객체(`{"/abs/path":{"type","unified_diff","move_path"}}`)이고 `status`, `stdout`, `stderr`를 가진다는 점은 `~/.codex/sessions/2026/11/11/rollout-2026-11-11T10-22-58-01a1c833-*.jsonl`에서 확인했다(§21 C1). `PatchApply`, `McpToolCall`, `WebSearch`, 승인 요청의 필드 이름은 시제품에서 추정한 것이며 아직 검증하지 않았다(§15 V3).

### 8.2 Claude transcript

| 원본 | 조건 | kind | 사용하는 필드 |
|---|---|---|---|
| (붙을 때 합성) | `cwd`를 가진 첫 줄 | `session` | `sessionId`, `cwd`, `entrypoint`, `version`. subagent는 meta.json의 `agentType`, `description` |
| `assistant` | 처음 나온 `message.model` | `settings` | model |
| `user` | `isMeta` 아님, `isCompactSummary` 아님(개정 2), `toolUseResult` 없음, text를 정제한 뒤 비어 있지 않음 | `user` | 문자열 content나 `text` 항목. `<system-reminder>…</system-reminder>`, `<command-*>`, `<local-command-*>`, `<task-notification>` 블록은 제거 |
| `user` `tool_result` | `is_error: true` | `tool_failed` | 같은 `tool_use_id`의 도구 이름만(세션별 캐시, 최대 512개). **content는 쓰지 않음** |
| `user` `tool_result` | 성공 | 버림 | |
| `assistant` `text` | | `agent` | text |
| `assistant` `thinking` | `thinking`이 비어 있지 않음 | `reasoning` | thinking text. `signature`와 `redacted_thinking`은 쓰지 않음 |
| `assistant` `tool_use` `Bash` | | `command` | `input.command`. exitCode 없음. 실패는 `tool_failed`로 나옴 |
| `tool_use` `Edit`/`MultiEdit`/`Write`/`NotebookEdit` | | `file_change` | `file_path`/`notebook_path` |
| `tool_use` `Agent`/`Task` | | `spawn` | `subagent_type`, `description` |
| `tool_use` `Read`/`Grep`/`Glob`/`WebFetch`/`WebSearch` | | `tool` | 이름과 `file_path`/`pattern`/`path`/`url`/`query` 가운데 하나 |
| `tool_use` `mcp__<server>__<tool>` 및 그 밖 | | `tool` | 이름만 |
| `assistant` | `message.stop_reason === 'end_turn'` | `turn_end` | (최선 노력. 없으면 출력하지 않음) |
| `system` | | 버림 | S0 V4에서 `error` subtype이 관찰되지 않음 (§22 C9) |
| 그 밖의 type | | 버림 | `last-prompt`, `mode`, `permission-mode`, `session-owner`, `attachment`, `file-history-snapshot`, `cost-state`, `summary`, `queue-operation`, `atis-latch`, `custom-title`, `agent-name`, `relocated`, `environment`, `api-request-shape`, `api-request-blob`, `api-request` 등. 분기는 최상위 `type`으로만 한다(`api-request-blob`은 `message.role`과 시스템 prompt를 담음) |

Claude에는 turn 시작을 나타내는 줄이 따로 없다. 그래서 `turn_start`를 내지 않고, `user` 이벤트를 turn 시작으로 본다.

### 8.3 ARC dispatch 매핑 (W5)

데이터 출처 (모두 읽기만 한다)
- lease: `<CODEX_HOME>/arc-role-dispatch/*.json`.
  - 이름이 `.`으로 시작하는 파일, `*.heartbeat.json`, `*.cancel`은 제외한다.
  - Orchestrator가 어느 호스트에 있든 경로는 같다.
- 아티팩트: `<gitCommonDir>/arc/workflows/<workflowId>/dispatches/<dispatchId>/`(`role-supervisor.mjs:40`)의 `events.jsonl`과 `record.json`, resume 구간의 `segments/<n>/events.jsonl`.

lease 읽기
- 2초마다 디렉터리를 읽고, 파일마다 mtime을 확인한다. mtime이 바뀌었을 때만 읽는다.
- `JSON.parse`가 실패하면 이전 값을 유지하고 다음 주기에 다시 읽는다. `createLease`는 원자적이지 않기 때문이다(`role-dispatch-store.mjs:43-48`).
- `validateLease`와 `listLeases`는 쓰지 않는다. 키를 엄격하게 검사하므로, 선행 수정 계획이 스키마를 바꾸면 watch가 깨질 수 있다.
- 다음 필드만 관대하게 읽는다: `dispatchId`, `workflowId`, `role`, `route`, `hostPlatform`, `state`, `sessionId`, `reasons`, `nativeAgentId`, `createdAt`, `updatedAt`.

session id와 dispatch 연결
- Codex bridge: `events.jsonl`의 `{"kind":"thread","threadId":…}`(실행 중, `role-supervisor.mjs:216,223-224`).
- Claude bridge: `events.jsonl`의 `{"kind":"init","sessionId":…}`.
- 종료 후: `lease.sessionId`(commit 시점에 기록, :124, :287, :294).
- 한 dispatch에 session id가 여러 개 생길 수 있다(resume 때 id가 바뀐 경우, :322-325). 모두 같은 dispatch로 연결한다.
- 역할은 `lease.role`에서 얻는다. lease가 정리되어 없으면 `record.json`의 `role`에서 얻는다. `arc_<role>` 형식을 `<role>`로 줄인다.

아티팩트 위치 찾기
- 저장소 범위: 범위의 `gitCommonDir`에서 `arc/workflows/*/dispatches/*/`를 2초마다 훑는다. 이 아래에 아티팩트가 있는 dispatch만 범위 안으로 본다.
- `--all`: 관측한 세션 cwd마다 `git rev-parse --git-common-dir`을 실행해 캐시한다(최대 32개 저장소). 모든 lease를 포함한다.
- `events.jsonl`은 작으므로(supervisor 상한이 있음) 증분 tail로 읽는다.

dispatch 이벤트
- lease의 `(state, reasons)`가 바뀔 때마다 `dispatch` 이벤트 하나를 낸다. 처음 관측한 lease는 §10의 최근 이벤트 규칙을 따른다.
- `reasons`, `state`, `route`는 **원문 그대로** 출력한다. 철자 수정 전에는 `Not Avaliable`, 수정 후에는 `Not Available`이 그대로 보인다. reason 코드를 매핑하는 표를 만들지 않는다.

라벨 결정 보류
- 새로 나타난 `codex_exec` rollout과 ARC가 띄웠을 수 있는 Claude 세션(생성 후 10초 이내)은 첫 이벤트를 최대 2초 보류한다. 그동안 매핑을 시도한다.
- 매핑이 늦게 이루어지면 NOTICE `session <id8> is dispatch <id> (<role>)`를 낸다. 그 뒤로는 새 라벨(`--json`)과 새 역할(AGENT 태그, §13.1)을 쓴다. 이미 출력한 줄은 고치지 않는다.

호스트 독립 (W5)
- 매핑 결과는 `lease.hostPlatform`, watch를 실행한 터미널의 환경 변수, 어느 CLI가 Orchestrator인지와 무관하다. `hostPlatform`은 `--verbose`와 `--json`에서만 표시한다.

현재 릴리스의 한계 (README:45, `docs/harness-operation.md`)
- Codex 호스트에서는 모든 bridge가 `host_sandbox_blocked`(G2)로 보류되고, Claude bridge `arc_implementer`/`arc_qa`는 추가로 `permission_scope_unverified`(G1)로 보류된다.
- 이 hold는 lease가 만들어지기 전에 결과로 반환되는 경우가 있다(`role-bridge.mjs:51,155`). 그럴 때 watch에는 해당 dispatch 줄이 나오지 않고, Codex Orchestrator 세션의 `CMD` 줄만 보인다.
- 경로 자체는 구현해 두므로, hold가 풀리면 코드 변경 없이 표시된다.

## 9. 라벨

개정 1부터 라벨은 사람용 출력에 칸으로 표시하지 않는다. 라벨은 `--json`의 `label` 필드와, 역할을 모르는 하위 에이전트의 AGENT 태그 이름(§13.1)에만 쓴다. 생성 규칙은 그대로다.

라벨은 ASCII로만 만든다. 각 부분은 다음과 같다.
- 최상위 세션: `<kind>#<id 끝 4자>`
  - `kind`는 다음 가운데 하나다.
    - Codex: `tui`(codex-tui), `exec`(매핑되지 않은 codex_exec), originator 원문(그 밖, Q4)
    - Claude: `main`(entrypoint `cli`), `main:<entrypoint>`(그 밖, Q4)
  - 예: `tui#e2e8`, `exec#9a01`, `main#7f77`, `main:sdk-cli#1c2d`
- 하위 에이전트: `<부모 라벨>/<역할 | agentType | nickname>`
  - 역할 판정
    - Codex: `payload.agent_role ?? source.subagent.thread_spawn.agent_role`이 `/^arc_(?:routing_)?(scouter|planner|implementer|qa|reviewer)$/`에 맞으면 짧은 역할명을 쓴다. 맞지 않으면 nickname이나 원문을 쓴다.
    - Claude: meta `agentType`이 `/^arc-(?:routing-)?(scouter|planner|implementer|qa|reviewer)$/`에 맞으면 짧은 역할명을 쓴다. 맞지 않으면 `agentType`(예: `general-purpose`)을 쓴다.
  - 예: `tui#e2e8/qa`, `main#7f77/planner`, `tui#e2e8/qa/Aristotle`
- ARC bridge 세션: `<role>@<dispatch 앞 4자(영숫자만)>`. 예: `planner@b9a1`. 전체 id는 SESSION 줄과 `--json`에 나온다.
- dispatch 이벤트: bridge 세션과 같은 `<role>@<id4>`.
- watch 자체 알림: `watch`.
- (개정 1에서 삭제) 사람용 출력의 22자 라벨 칸과 앞을 잘라 `~`를 붙이던 규칙.

## 10. 시작 시 최근 이벤트 (Q2)

- 대상 세션: 범위 안에 있고 mtime이 **10분 이내**인 세션 파일과, `updatedAt`이 10분 이내인 lease.
- 각 세션에서 head(meta와 cwd 확인용)와 끝의 최대 256 KiB를 읽어 정규화한다. 첫 줄이 잘렸으면 버린다.
- 현재 표시 필터(`--verbose`, `--platform`)를 통과한 이벤트를 `ts` 순서로 합친 뒤, 전체에서 **마지막 `--tail` 개**(기본 20)만 출력한다.
- lease 하나는 현재 상태를 나타내는 `dispatch` 이벤트 하나로 계산한다(`ts`는 `updatedAt`).
- 그다음 NOTICE `live`를 내고, 각 파일의 끝(EOF)부터 따라간다.
- `--tail 0`이면 최근 이벤트 없이 banner와 `live`만 낸다.
- mtime이 10~30분인 세션은 최근 이벤트 없이 추적만 한다. `--session`이면 그 세션 한 개에서만 최근 이벤트를 고른다.

## 11. 내용 정책 (Q3)

- 기본으로 보여 주는 것: 사용자와 에이전트 메시지 본문, 명령 문자열, 도구 이름과 대상, 파일 경로, dispatch 상태.
- 절대 보여 주지 않는 것(`--verbose`에서도 마찬가지):
  - 도구 출력(Claude `tool_result` content, `toolUseResult`)
  - 명령 출력(Codex `aggregated_output`)
  - MCP와 웹 결과
  - `encrypted_content`, `signature`, `redacted_thinking`
  - `base_instructions`, 개발자 지시문, AGENTS.md, `response_item` message
  - `isMeta`와 system-reminder 블록
  - 파일 내용과 diff
- `--verbose`일 때만 보여 주는 것: reasoning summary와 thinking, settings, turn 시작, `other` type 이름, 진단 NOTICE.
- 텍스트 처리는 정규화 직후 한 번 하며, 두 출력 모드에 공통이다. kind에 따라 두 가지 규칙을 쓴다(개정 1).
  - **A. `user`, `agent`의 `text` (전체 출력)**
    1. CSI·OSC escape sequence를 제거한다(§21 C6).
    2. `\r\n`, `\r`, U+2028, U+2029를 `\n`으로 바꾼다. 탭은 공백 4칸으로 바꾼다.
    3. `\n`을 뺀 나머지 C0/C1 제어문자를 제거한다.
    4. 각 줄 끝의 공백을 지우고, 텍스트 앞뒤의 빈 줄을 지운다. 줄 앞 공백(들여쓰기)과 중간의 빈 줄은 그대로 둔다.
    5. 텍스트 전체에 §12 마스킹을 한 번 적용한다.
    6. 자르지 않는다. 사람용 표시는 §13.1, JSON은 §13.2를 따른다.
  - **B. 그 밖의 kind (한 줄)**
    1. CSI·OSC escape sequence와 그 밖의 C0/C1 제어문자를 제거한다(§21 C6).
    2. 줄바꿈과 공백을 하나의 공백으로 합친다.
    3. §12 마스킹을 적용한다.
    4. 자른다. 사람용 출력은 줄 전체가 `--width`를 넘지 않게 하고, 넘으면 `…`로 끝낸다. JSON은 최대 1000 code point로 자르고 `truncated`를 표시한다.

## 12. 비밀 패턴 마스킹

두 출력 모드 모두에서 `text`, `paths`, `tool`의 대상 문자열에 적용한다. 완전한 보장이 아니라 추가 방어 수단이며, 문서와 help에 그렇게 명시한다.
- `Bearer <token>` / `Authorization: <value>` → `Bearer ***`
- `sk-[A-Za-z0-9_-]{16,}`(`sk-ant-` 포함), `gh[pousr]_[A-Za-z0-9]{20,}`, `github_pat_[A-Za-z0-9_]{20,}`, `xox[abpr]-[A-Za-z0-9-]{10,}`, `AKIA[0-9A-Z]{16}`, `AIza[0-9A-Za-z_-]{35}` → `***`
- `-----BEGIN [A-Z ]*PRIVATE KEY-----` 이후 전체 → `***`
- 이름이 `/(pass(word)?|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|auth)/i`인 `key=value`, `key: value`, `--key value`, `KEY="…"` 형태의 값 → `***`
  - (개정 2) `--key value` 형태는 `--` 바로 앞에 단어 문자나 `-`가 없을 때만 적용하고, 키는 64자 이하만 인식한다. 따라서 `foo--token v`, `a--password=x`, `---token v`처럼 경계가 없는 경우와 65자 이상 키는 대상에서 빠진다(AC-W30).
- URL 안의 자격 증명 `://user:pass@` → `://***@`
- (개정 1) `user`/`agent` text는 줄바꿈을 보존한 전체에 마스킹을 적용한다. 그래서 여러 줄에 걸친 형식도 대상이다. 예를 들어 PEM 블록은 `BEGIN` 줄부터 메시지 끝까지 `***`가 된다. 이름 기반 패턴의 값은 줄바꿈에서 끝난다.

## 13. 출력 형식

### 13.1 사람용 줄 (개정 1)
```
HH:MM:SS <platform 6칸> <KIND 최소 8칸> <text>
```
- 시각은 로컬 시간이다. 날짜가 바뀌면 NOTICE에 날짜를 한 번 표시할지는 builder 재량이다.
- 라벨 칸은 없다. 라벨은 `--json`에만 있다(§9).
- KIND 칸은 태그를 8칸에 맞춰 공백으로 채운다. 태그가 8자 이상이면(`DISPATCH`, `AGENT(implementer)`) 태그 뒤에 공백 하나만 둔다.
- 머리말은 시각부터 KIND 칸 뒤 공백까지다. 머리말의 문자는 모두 표시 폭 1칸이므로 머리말 폭은 code point 수와 같다.
- KIND 태그: `SESSION`, `SETTINGS`, `TURN`, `END`, `FAIL`, `USER`, `AGENT`, `AGENT(<name>)`, `THINK`, `CMD`, `CMD(n)`, `TOOL`, `TOOL!`, `EDIT`, `SPAWN`, `APPROVE`, `DISPATCH`, `ERROR`, `ITEM`, `NOTICE`.
- AGENT 태그
  - `role`이 있으면 `AGENT(<role>)`이다. 하위 세션 meta(§9 역할 판정)와 bridge dispatch에서 정해진다. 예: `AGENT(implementer)`.
  - `role`이 없고 `source`가 `subagent`면 `label`의 마지막 `/` 뒤 구간을 이름으로 쓴다. 예: `AGENT(general-purpose)`, `AGENT(Aristotle)`. 이름이 20 code point를 넘으면 앞 19자와 `…`로 줄인다.
  - 그 밖(최상위 세션, 역할을 모르는 bridge)은 `AGENT`다. `orchestrator`를 추정하지 않는다.
  - 다른 KIND에는 역할이나 이름을 붙이지 않는다.
- 줄 규칙
  - `user`, `agent`: `text`를 `\n`으로 나눈다.
    - 첫 줄은 머리말 뒤에 쓴다.
    - 둘째 줄부터는 머리말 폭만큼 공백을 넣고 쓴다. 빈 줄은 공백 없이 빈 줄로 쓴다.
    - `--width`로 자르지 않고 직접 접지도 않는다. 터미널 폭보다 긴 줄은 터미널의 자동 줄바꿈에 맡긴다.
    - `text`가 비어 있으면 머리말만 쓴다.
  - 그 밖의 kind: 한 줄로 쓴다. 줄 전체가 `--width`를 넘으면 `…`로 끝낸다(현행).
- 시작 banner(NOTICE): `arc watch: scope <경로> (<n> worktrees) · <platforms> · Ctrl-C to stop`. `--all`이면 `scope all`, `--session`이면 `session <id>`.
- SESSION 줄의 text 예: `019a3c4e… codex-tui 0.x cwd=…/arc gpt-5.5 high`, `dispatch b9a1… wf-3 bridge`.

예시:
```
09:01:10 watch  NOTICE   arc watch: scope /Users/me/workspace/arc (2 worktrees) · codex+claude · Ctrl-C to stop
09:01:12 codex  USER     README의 CLI 절을 고쳐줘.
                         예시도 하나 넣어줘.
09:01:15 codex  CMD(0)   git status --short --branch && git log -5 --oneline
09:01:16 codex  SPAWN    arc_routing_scouter: 관련 파일 찾기
09:01:18 codex  CMD(0)   rg -n "arc --help" README.md
09:01:20 claude TOOL     Read lib/cli/root.mjs
09:01:31 claude DISPATCH running bridge wf-3
09:01:35 claude AGENT(planner) 초안을 정리했습니다.
                               1. CLI 절 순서를 바꿉니다.
09:01:40 codex  CMD(1)   node --test tests/node/watch.test.mjs
09:01:58 codex  AGENT    README 수정을 마쳤습니다.
09:01:58 codex  END
```

- 색상(TTY일 때만, 조건은 §5.5). 값은 ANSI SGR 파라미터다.
  - platform 칸: `codex` `36`(청록), `claude` `38;5;208`(주황), `watch`와 `arc` `2`(흐림).
  - KIND 태그: 괄호 부분까지 포함한 태그 문자열 전체를 한 색으로 칠한다.

    | KIND | 색 |
    |---|---|
    | `USER` | `1;35` (굵은 자홍) |
    | `AGENT`, `AGENT(<name>)` | `32` (초록) |
    | `CMD`, `CMD(0)` | `38;5;242` (진회색) |
    | `CMD(n)` (n≠0) | `31` (빨강) |
    | `EDIT` | `33` (노랑) |
    | `TOOL` | `38;5;250` (연회색) |
    | `SPAWN` | `38;5;141` (보라) |
    | `DISPATCH` | `38;5;137` (황갈) |
    | `APPROVE` | `1;4` (굵게와 밑줄, 기본색) |
    | `FAIL`, `ERROR`, `TOOL!` | `31` (빨강) |
    | `SESSION`, `END`, `NOTICE`, `SETTINGS`, `TURN`, `THINK`, `ITEM` | `2` (흐림) |

  - 본문: `FAIL`, `ERROR`, `TOOL!`, `CMD(n≠0)` 줄의 본문은 빨강(`31`)이다(현행). 그 밖의 본문과 메시지의 이어지는 줄은 색을 칠하지 않는다.
  - 어떤 KIND도 플랫폼 색 `36`과 `38;5;208`을 쓰지 않는다. 256색을 지원하지 않는 터미널을 위한 대체 색은 두지 않는다.
  - 머리말이 `--width`보다 긴 한 줄 이벤트는 색 없이 출력한다(현행).

### 13.2 `--json`
- 한 줄에 §7의 객체 하나를 쓴다(UTF-8, 끝은 `\n`). ANSI는 쓰지 않는다. banner와 NOTICE도 `kind:"notice"`로 쓴다.
- 표시 필터와 내용 정책은 사람용 출력과 똑같이 적용한다.
- (개정 1) `text`는 §11의 결과다.
  - `user`/`agent`는 줄바꿈을 JSON 문자열의 `\n`으로 보존하고 길이 상한이 없으며 `truncated`를 쓰지 않는다.
  - 그 밖의 kind는 최대 1000 code point로 자르고, 잘렸으면 `truncated:true`를 쓴다.
- (개정 1) `label`은 사람용 출력에서 빠진 뒤에도 §9 규칙대로 계속 쓴다.

## 14. 병합 순서, tail, 자원 상한

- 병합 순서: tick마다 모든 출처에서 새 이벤트를 모은 뒤 `(ts, 발견 순서)`로 안정 정렬해서 출력한다. 늦게 도착한 이벤트도 버리지 않는다. 완전한 전역 순서는 보장하지 않으며, 문서에 그렇게 적는다.
- tail 처리:
  - byte offset을 따라간다.
  - 끝이 줄바꿈으로 끝나지 않은 마지막 줄은 버퍼에 둔다(`createLineParser`).
  - 파일 크기가 offset보다 작아지면 처음부터 다시 읽는다(NOTICE).
  - 파일이 사라지면 추적을 끊는다(verbose NOTICE).
  - 4 MiB를 넘는 줄은 건너뛰고 개수만 센다(verbose NOTICE).
- 상한:
  - 추적 파일 폴링 500ms, 탐색과 lease 확인 2초, worktree 목록 30초
  - 추적 파일 최대 64개. 넘으면 mtime이 최신인 파일을 우선하고 NOTICE를 한 번 낸다.
  - 한 tick에 파일 하나에서 읽는 양은 최대 1 MiB. 나머지는 다음 tick에 읽는다.
  - 30분 동안 변화가 없는 파일은 추적을 끊는다. 다시 커지면 탐색 단계에서 다시 붙는다.
  - 최근 이벤트를 고를 때 세션당 최대 256 KiB를 읽는다.
  - `--all` 모드의 저장소 캐시는 최대 32개.
- 종료:
  - signal이나 EPIPE를 받으면 모든 timer와 file handle을 정리하고 exit 0.
  - `runWatch`는 `signal`(AbortSignal), clock, timer, git runner, fs 루트를 주입받을 수 있게 만든다(테스트용).

## 15. 가정과 사전 검증 spike

| ID | 가정 | 현재 근거 | 틀렸을 때의 안전한 동작 | 검증 방법 |
|---|---|---|---|---|
| V1 | ARC가 띄운 `claude -p`는 `<claude home>/projects/<slug(worktree)>/<sessionId>.jsonl`에 transcript를 남기고, 일반 세션과 형식이 같다. entrypoint 값은 알 수 없다 | `role-bridge-args.mjs:121-129`에 `--no-session-persistence`가 없음. 자식 cwd = `target.realpath`(`role-supervisor.mjs:162`). 로컬에서 `-p` transcript를 찾지 못함 | 경로는 추측하지 않고 `projects/*/<sessionId>.jsonl`을 찾는다. 없으면 DISPATCH 이벤트만 나오고 verbose NOTICE `transcript not found`를 낸다. entrypoint는 라벨에만 영향을 준다 | (a) 읽기 전용: 기존 transcript에서 `sdk-*` entrypoint나 `-p` 흔적을 찾는다. (b) 확정하려면 임시 디렉터리에서 `claude -p` 1회 실행. Claude 홈에 쓰고 계정 요청이 발생하므로 사용자 결정이 필요 |
| V2 | codex-tui의 `spawn_agent` 자식 rollout은 `session_meta`에 `source.subagent.thread_spawn.parent_thread_id`와 `agent_role`(`arc_<role>` 또는 `arc_routing_<role>`)을 가지며, originator는 부모와 같다 | Codex Desktop 하위 에이전트 rollout 실물(`…/2026/11/10/rollout-2026-11-10T16-33-14-01a1c460-….jsonl`)에서 필드 구조 확인. profile 이름 규칙(`role-dispatch-policy.mjs:79`). codex-tui 표본은 없음 | parent 필드가 없으면 originator가 `codex-tui`라서 `tui#xxxx` 최상위 세션으로 보인다(누락되지 않음, 묶임만 빠짐). 역할을 인식하지 못하면 nickname이나 원문을 표시한다 | (a) 읽기 전용: 기존 `~/.codex/sessions`에서 `codex-tui`와 `thread_spawn`이 함께 나오는 파일을 찾는다. (b) 확정하려면 codex-tui에서 하위 에이전트 1회 실행 |
| V3 | Codex `FileChange`/`PatchApply`/`McpToolCall`/`WebSearch`/승인 요청 item의 필드 이름 | 시제품 추정 | 필드를 찾지 못하면 type 이름만 `tool`/`other`로 출력한다. 내용 노출은 없다 | 읽기 전용: 기존 rollout에서 type별 키 목록을 뽑는다 |
| V4 | Claude `assistant` 줄의 `stop_reason:'end_turn'`과 `system` 오류 subtype | 확인하지 않음 | `turn_end`가 나오지 않을 뿐이다 | 읽기 전용: 기존 transcript 확인 |

계획에서는 이 spike를 **의존 작업보다 앞에 두는 읽기 전용 작업 하나**로 둔다. V1(b)와 V2(b)의 실제 실행은 별도로 승인을 받아야 하며, 승인하지 않으면 위의 안전한 동작으로 구현을 계속한다. 수집한 실물 줄은 개인 내용을 지우고 테스트 fixture로 쓴다.

## 16. 읽기 전용 보장

- 쓰기, 생성, 권한 변경, 잠금, 삭제를 하지 않는다. 대상: `CODEX_HOME`(`sessions/`, `arc-role-dispatch/` 포함), Claude 홈, git dir, 아티팩트 디렉터리, worktree.
- 다음 store 함수를 호출하지 않는다: `ensureDispatchDirectory`, `writeLease`, `writeHeartbeat`, `requestCancel`, `pruneTerminalLeases`. routing lock을 잡지 않는다.
- 파일은 모두 `O_RDONLY`로 연다. fs를 수정하는 API는 쓰지 않는다.
- 외부 프로세스는 `git`만 실행한다. 명령은 `rev-parse`와 `worktree list` 두 가지이고, 안전한 env와 timeout을 적용한다. `codex`나 `claude` CLI는 실행하지 않는다. 네트워크도 쓰지 않는다.
- stdout과 stderr 말고는 아무것도 기록하지 않는다.

## 17. 공개 인터페이스와 문서 영향

- `lib/cli/root.mjs`: watch로 넘기는 분기, usage, `--help` 문구(§5.2).
- 새 파일 `lib/watch/*.mjs`. 권장 분리: `index`, `args`, `scope`, `discover-codex`, `discover-claude`, `tail`, `normalize-codex`, `normalize-claude`, `dispatch`, `labels`, `policy`, `render`. 합치거나 나누는 것은 builder 재량.
- `MANIFEST.sha256`: 다시 생성(`node scripts/update-manifest.mjs`). `npm run check:manifest`가 통과해야 한다. runtime payload와 `RUNTIME_MODULE_PATHS`는 바뀌지 않아야 한다.
- README.md:35 교체: "The TUI requires terminal input and output. Public commands: `arc`, `arc watch`, `arc --help`, `arc --version`; help, version and `arc watch` also work without a TTY."
- README에 "Watch sessions" 짧은 절 추가(3~5줄): 용도, 기본 범위, 읽기 전용, 도구 출력 비노출과 마스킹이 완전하지 않다는 점, Codex Desktop 제외, Codex 호스트 bridge hold.
- `docs/harness-operation.md:49`의 public syntax 문장을 고치고, watch 하위 절을 추가한다: 출처, 범위, 매핑, 내용 정책, 한계.
- 과거 spec과 plan 문서(`2026-10-23-arc-tui-design.md` 등)는 이력이므로 고치지 않는다.
- 기존 테스트의 거부 목록(`consumer.test.mjs:19` 등)에는 `watch`가 없으므로 영향이 없다. 바뀐 root usage 문자열에 맞춰 테스트를 고쳐야 하는지는 확인한다.
- 패키지 버전 상향은 이 스펙의 범위가 아니다. 릴리스 때 결정한다.
- (개정 1) `lib/watch/index.mjs`의 help를 §5.3 개정 문구로 바꾼다.
- (개정 1) README "Watch sessions" 절에 "User and agent messages are shown in full; other events use one line." 취지의 한 문장을 넣는다.
- (개정 1) `docs/harness-operation.md` watch 하위 절의 출력 형식 설명을 §11, §13에 맞춘다. 라벨 칸 삭제, 메시지 전체 출력, 색 표, AGENT 태그, JSON `text` 규칙을 반영한다.
- (개정 1) 새 파일은 없다. 바뀐 `lib/watch/*` 파일에 맞춰 `MANIFEST.sha256`을 다시 생성한다.

## 18. 위험

- R1. Codex rollout과 Claude transcript 형식은 문서화되어 있지 않고 버전마다 바뀔 수 있다. 대응: 관대한 파싱, 모르는 type은 `other`나 버림, 실물 fixture 고정, §15 spike.
- R2. 개인정보: 메시지 본문과 명령 문자열이 터미널 scrollback이나 녹화에 남을 수 있다. 마스킹은 완전하지 않다. 대응: 문서와 help에 명시. 도구 출력은 어떤 경우에도 보여 주지 않음. 개정 1 이후 USER/AGENT 메시지는 사람용 출력과 JSON 모두에서 전체가 나오므로 노출 범위가 넓어졌다. 예를 들어 하위 에이전트의 첫 USER 메시지는 Orchestrator brief 전문이다. 사용자가 결정한 의도된 동작이다.
- R3. 지금까지 의도적으로 최소화한 CLI 계약을 바꾼다. 대응: 하위 명령은 `watch` 하나만 추가하고, root의 나머지 거부 동작은 유지한다.
- R4. bridge 매핑에 경쟁 조건이 있다(`events.jsonl` 기록보다 rollout이 먼저 생김). 대응: 2초 보류와 늦은 매핑 NOTICE.
- R5. `--all` 모드에서 세션이 많으면 비용이 커진다. 대응: §14의 상한.
- R6. 선행 수정 계획과의 접점: lease 스키마나 reason 문자열이 바뀔 수 있다. 대응: 관대하게 읽고 원문을 출력한다. `lib/runtime` 변경 없음. import하는 `createLineParser`/`resolveConfigHome`의 시그니처는 선행 작업이 머지된 뒤 다시 확인한다.
- R7. Codex 호스트 bridge 경로는 hold가 풀리기 전까지 실환경에서 검증할 수 없다. 대응: fixture 기반으로 수용한다.
- R8. (개정 1) 긴 메시지가 터미널 scrollback을 빠르게 채운다. 터미널 자동 줄바꿈 때문에 아주 긴 줄의 이어지는 부분은 들여쓰기 없이 0열부터 보인다. 사용자 결정(직접 접지 않음)에 따른 동작이다.
- R9. (개정 1) 라벨 칸이 없어서 하위 에이전트와 bridge의 CMD, EDIT, TOOL 줄은 사람용 출력에서 어느 세션의 것인지 구분되지 않는다. 역할은 AGENT 줄에만 붙는다(사용자 결정). 기계적 구분은 `--json`의 `label`, `sessionId`, `parentId`로 할 수 있다.
- R10. (개정 1) 256색을 지원하지 않는 터미널에서는 주황, 진회색, 보라, 황갈 등이 다른 색으로 보일 수 있다.

## 19. 수용 기준

- **AC-W01 CLI 진입과 패키징**
  - `arc watch …`는 `lib/watch/index.mjs`의 `runWatch`로 넘어간다.
  - `arc`, `arc --help`, `arc --version`과 그 밖의 인자 거부(exit 2)는 기존대로 동작한다.
  - root에 인자가 없을 때와 watch 경로 모두 `tui|safe-fs|installer`를 import하지 않는다.
  - 새 코드는 `lib/watch/`에만 있다. `lib/runtime/`은 바뀌지 않는다. `MANIFEST.sha256`을 다시 생성했고 `check:manifest`와 runtime asset 검사가 통과한다. 새 dependency는 없다.
- **AC-W02 help와 문서**
  - `arc watch --help`는 §5.3 내용을 stdout에 쓰고 exit 0이다. TTY가 없어도 된다.
  - root usage와 `--help`에 `arc watch [options]`가 있다.
  - README.md와 `docs/harness-operation.md`가 §17대로 바뀌었고, help와 서로 어긋나지 않는다.
- **AC-W03 종료**: §5.4를 따른다. SIGINT/SIGTERM/SIGHUP과 abort는 timer와 handle을 정리하고 0, EPIPE는 출력 없이 0, 사용법 오류는 2, 사용할 출처가 없으면 1이다.
- **AC-W04 TTY와 색상**: 비TTY에서도 동작한다. 비TTY, `NO_COLOR`, `--json`이면 ANSI를 쓰지 않는다. TTY의 기본 폭은 `columns`를 따르고 resize도 반영한다. 색 값은 AC-W27을 따른다.
- **AC-W05 범위**
  - 기본 범위는 같은 저장소의 모든 worktree 하위 cwd이고, 저장소가 아니면 그 디렉터리 하위다. 30초 안에 생긴 worktree도 반영된다.
  - `--cwd`와 `--all`이 동작하고, 배타 옵션 조합은 2다.
  - 최상위 `Codex Desktop` rollout과 그 하위 에이전트는 모든 모드에서 제외된다.
- **AC-W06 필터**
  - `--platform`은 다른 플랫폼 이벤트를 모두 막는다.
  - `--session`은 thread id, Claude session id, dispatch id로 대상을 찾고, 그 세션과 하위 에이전트, bridge 자식만 출력한다. 대상이 아직 없으면 기다린다.
- **AC-W07 출처와 탐색**: `codex-tui`, `codex_exec`, 기타 originator(Q4), Claude 세션(모든 entrypoint)과 subagent를 포함한다. 시작 후 새로 생긴 세션은 3초 안에 붙는다. `.zst`는 제외한다. 7일 이내 날짜 폴더에 있는 장기 세션도 시작할 때 찾는다.
- **AC-W08 병합과 줄 형식** (개정 1)
  - 사람용 줄마다 시각, 플랫폼, KIND가 있고 라벨 칸은 없다.
  - 한 tick 안의 이벤트는 `ts` 순서로 나온다. 어떤 이벤트도 버리지 않는다.
  - `user`/`agent`가 아닌 이벤트의 줄은 `--width`를 넘지 않는다. `user`/`agent` 줄은 AC-W24를 따른다.
- **AC-W09 최상위 라벨** (개정 1): `--json`의 `label`에 `tui#xxxx`, `exec#xxxx`, `main#xxxx`, `main:<entrypoint>#xxxx`, 기타 originator 원문 라벨이 §9대로 나온다.
- **AC-W10 Claude subagent 라벨** (개정 1): `--json`의 `label`은 meta `agentType`이 `arc-*`/`arc-routing-*`이면 `<부모>/<role>`이고, 그 밖에는 `<부모>/<agentType>`이다. meta가 없어도 중단되지 않는다.
- **AC-W11 dispatch 이벤트**
  - `(state, reasons)`가 바뀔 때마다 role, route, state, reasons를 원문 그대로 담은 DISPATCH 줄이 나온다.
  - 쓰는 중인 lease, 잘못된 JSON, 키가 추가되거나 빠진 lease, heartbeat/cancel/임시 파일이 섞여 있어도 중단되지 않는다.
  - 저장소 범위에서는 아티팩트가 범위 안에 있는 dispatch만 나온다.
- **AC-W12 tail 정확성**
  - 줄이 중간에 끊겨도 다음에 이어 붙여 한 이벤트로 처리한다.
  - 파일 크기가 줄면 처음부터 다시 읽는다. 파일이 사라지면 추적을 끊는다.
  - 4 MiB를 넘는 줄은 건너뛰고 계속 동작한다. tick당 1 MiB 상한을 지킨다.
- **AC-W13 내용 정책**
  - fixture에 넣어 둔 표지 문자열이 어떤 모드(`--verbose`, `--json` 포함)에서도 출력되지 않는다. 대상: 도구 출력, `aggregated_output`, `toolUseResult`, `encrypted_content`, `signature`, `base_instructions`, 개발자와 AGENTS 지시문, system-reminder, `isMeta`.
  - reasoning과 thinking은 `--verbose`에서만 나온다.
  - (개정 1) `user`/`agent`가 아닌 kind의 텍스트는 한 줄로 합쳐져서 잘린다. `user`/`agent`는 §11 A 규칙을 따른다.
- **AC-W14 마스킹**: §12의 패턴별 fixture가 두 출력 모드 모두에서 `***`로 바뀌고, 평범한 텍스트는 바뀌지 않는다.
- **AC-W15 `--json`** (개정 1)
  - 모든 줄이 §7 스키마 v1(`v:1`, 필수 필드, enum 값, 값 없는 필드 생략)을 따른다. 필터와 내용 정책은 사람용 출력과 같다.
  - `user`/`agent`가 아닌 kind의 `text`는 1000 code point 이하이며, 잘렸으면 `truncated`가 있다.
  - `user`/`agent`의 `text`는 1000 code point를 넘어도 자르지 않고 `\n`을 보존하며, `truncated`가 없다.
  - `label` 필드가 있다.
- **AC-W16 시작 시 최근 이벤트**: 기본값으로 10분 이내 활성 세션과 lease에서 합쳐 마지막 20개 이벤트를 출력하고, `live` NOTICE 뒤에 새 이벤트만 출력한다. `--tail n`과 `--tail 0`이 동작한다. 10~30분 세션은 최근 이벤트 없이 추적만 한다.
- **AC-W17 자원 상한**: §14의 주기와 상한(추적 64개 NOTICE, 30분 유휴 시 추적 해제와 재부착, 세션당 256 KiB)을 지킨다. 주입한 clock으로 결정적으로 테스트할 수 있다.
- **AC-W18 호스트 독립 (W5)**: 같은 fixture에서 lease의 `hostPlatform`을 `codex`와 `claude`로 바꿔도 사람용 출력이 같다(`--verbose`의 host 표시만 예외). watch 실행 env의 `CODEX_*`/`CLAUDE_*` 이외 값이 매핑에 영향을 주지 않는다.
- **AC-W19 Claude bridge 매핑 (W5)** (개정 1)
  - `events.jsonl`의 init `sessionId`(실행 중)나 `lease.sessionId`(종료 후)와 일치하는 `projects/*/<sessionId>.jsonl` 이벤트가 다음과 같이 나온다.
    - 사람용 출력: 플랫폼 `claude`. 그 세션의 AGENT 줄은 `AGENT(<role>)`.
    - `--json`: `label`이 `<role>@<id4>`.
  - resume 때문에 id가 바뀌어도 같은 dispatch로 표시된다.
  - transcript가 없으면 DISPATCH 줄만 나오고 중단되지 않는다.
  - Codex bridge(`thread` 이벤트)도 같은 방식으로 플랫폼 `codex`, `AGENT(<role>)`, `label` `<role>@<id4>`가 된다.
- **AC-W20 보류된 bridge (W5 한계)**: reasons가 `host_sandbox_blocked`, `permission_scope_unverified`인 lease fixture는 원문 그대로 DISPATCH 줄에 나온다. lease가 없는 hold는 아무것도 출력하지 않고 오류도 없다. help와 문서에 이 한계가 적혀 있다.
- **AC-W21 Codex 하위 에이전트 포함 (W6)**
  - 추적 중인 thread를 `parent_thread_id`로 가리키는 rollout은 originator와 무관하게 3초 안에 붙고, depth 2 이상도 포함된다.
  - 부모가 Desktop이거나 범위 밖이면 제외된다.
  - 부모보다 먼저 발견된 자식은 2초 보류한 뒤 올바르게 처리된다.
  - parent 필드가 없는 codex-tui rollout은 최상위 세션으로 나온다.
- **AC-W22 Codex 하위 에이전트 라벨 (W6)** (개정 1)
  - 최상위 필드나 `thread_spawn` 안의 `agent_role`이 `arc_qa`/`arc_routing_qa`이면 `--json`의 `label`이 `<부모>/qa`이고 사람용 AGENT 줄이 `AGENT(qa)`다.
  - 역할을 인식하지 못하면 `label` 끝 구간과 AGENT 이름이 nickname이나 원문이 된다.
  - `--json`에 `parentId`와 `depth`가 있다.
  - fixture는 실물 Desktop 표본의 필드 구조를 따르되, originator만 `codex-tui`로 바꾼다.
- **AC-W23 읽기 전용**
  - 임시 홈 fixture에서 실행 전후로 `CODEX_HOME`, Claude 홈, git dir, 아티팩트의 파일 목록, 크기, mtime, 권한이 같다.
  - `arc-role-dispatch/`가 없을 때 실행해도 그 디렉터리가 생기지 않는다.
  - 외부 프로세스는 허용된 `git` 명령만 실행된다(주입한 runner로 확인).
- **AC-W24 메시지 전체 출력 (개정 1)**
  - 사람용 출력에서 여러 줄인 `user`/`agent` 이벤트는 원문 줄 수만큼 출력된다.
  - 둘째 줄부터는 그 줄 머리말 폭과 같은 수의 공백으로 시작한다. 빈 줄은 빈 줄로 나온다.
  - `--width`보다 긴 메시지 줄도 자르거나 접지 않고 `…`도 붙지 않는다.
  - 두 출력 모드 모두에서 1000 code point를 넘는 메시지가 끝까지 나온다.
  - 머리말이 긴 `AGENT(implementer)` 줄에서도 들여쓰기 폭이 그 줄의 머리말 폭과 같다.
- **AC-W25 여러 줄 정제와 마스킹 (개정 1)**
  - `user`/`agent` text에서 CSI/OSC와 제어문자가 제거되고, CRLF·CR·U+2028·U+2029는 줄바꿈으로, 탭은 공백 4칸으로 바뀐다.
  - 줄 끝 공백과 앞뒤 빈 줄이 제거되고 들여쓰기는 남는다.
  - 여러 줄 PEM 블록은 `BEGIN` 줄부터 끝까지 `***`가 된다.
  - 둘째 줄 이후에 있는 토큰과 `key=value` 비밀도 두 출력 모드 모두에서 마스킹된다.
- **AC-W26 라벨 칸 제거 (개정 1, 개정 2)**: 사람용 출력 어디에도 `tui#`, `exec#`, `main#`, `<role>@<id4>` 형태의 라벨 문자열이 나오지 않는다. `--verbose` 진단 NOTICE 본문도 포함한다(개정 2). 메시지 본문에 원래 포함된 경우는 예외다. `--json`의 `label` 값은 개정 전과 같다.
- **AC-W29 compact summary 제외 (개정 2)**: Claude transcript의 `isCompactSummary:true` user 줄은 USER 이벤트로 출력되지 않는다. 기본 출력에는 나오지 않고, `--verbose`에서만 한 줄 `NOTICE` `compact summary (<n> chars)`로 나온다. `--json`도 같은 정책을 따른다.
- **AC-W30 마스킹 성능 (개정 2)**: `--key value` 이름 기반 패턴은 `--` 앞에 단어 문자나 `-`가 없을 때만 시작하고 키 길이는 64자 이하로 제한한다. 4 MiB `--a--a…` 입력이 선형 시간 안에 처리된다.
- **AC-W27 색 (개정 1)**
  - TTY 색 출력에서 platform 칸과 KIND 태그의 SGR 값이 §13.1 표와 같다.
  - `CMD(1)`과 `AGENT(implementer)`의 괄호 부분이 태그와 같은 SGR 구간 안에 있다.
  - 어떤 KIND 태그도 `36`이나 `38;5;208`로 칠해지지 않는다.
  - 실패 줄(`FAIL`, `ERROR`, `TOOL!`, `CMD(n≠0)`)의 본문은 `31`이다.
- **AC-W28 AGENT 태그 (개정 1)**: §13.1 규칙을 따른다.
  - `role`이 있으면 `AGENT(<role>)`이다.
  - `role`이 없는 subagent는 `AGENT(<label 끝 구간>)`이고, 20 code point를 넘는 이름은 19자와 `…`로 줄인다.
  - 최상위 세션은 `AGENT`이다.
  - 다른 KIND 태그는 개정 전과 같다.

검증 방법: 각 AC는 `tests/node/watch-*.test.mjs`(fixture는 `tests/node/fixtures/watch/`)에서 임시 홈과 주입한 clock, signal, git runner로 확인한다. 전체 테스트는 계획의 기준선 비교 규칙(`node --test --test-timeout=120000 tests/node/*.test.mjs`, 기준선 대비 새 실패 없음)으로 판정한다(§21 C2). 개정 1의 기준선은 HEAD `e33f1e3`이다. 개정 1 AC는 주로 `watch-render`, `watch-policy`, `watch-cli`, `watch-watcher` 테스트에서 확인한다. 색은 `color:true`인 렌더러 출력의 SGR 문자열을 비교한다.

## 20. builder 재량

- 모듈을 합치거나 나누는 방식, 날짜 변경 NOTICE 여부. 색상표와 라벨 칸 표시는 개정 1에서 확정되어 재량에서 제외된다(§13.1, §9).
- 마스킹 정규식의 세부 구현. §12 패턴 수준 이상이면 된다.
- 폴링 주기 상수는 §14 값을 기본값으로 하는 내부 상수로 둔다(공개 옵션 아님).

## 21. 승인된 보완 (2026-11-11, 계획 작성 중 Planner 제안, 사용자 승인)

- **C1 (정정):** §8.1 `FileChange` 행과 관측 근거를 위와 같이 고쳤다. `unified_diff`, `stdout`, `stderr`는 어떤 모드에서도 출력하지 않으며 §11 "절대 보여 주지 않는 것"과 AC-W13 표지 목록에 포함한다.
- **C2 (정정):** §19 검증 방법의 "전체 `npm test` 통과"를 기준선 비교 규칙으로 바꿨다. 기준선(HEAD `a8ffd31`)에서 이미 실패하는 테스트가 있고 `tests/node/tui-setup.test.mjs`는 시간 제한 없이 멈추기 때문이다.
- **C3 (보완, §8.3·§9·§13):** dispatch 이벤트의 플랫폼은 아티팩트로 정한다. `events.jsonl`에 `thread`가 있으면 codex, `init`이 있으면 claude, 매핑된 세션이 있으면 그 세션의 플랫폼이다. 모르면 사람용 platform 칸에 `arc`를 표시하고 JSON에서는 `platform`을 생략한다. `hostPlatform`으로 추론하지 않는다(AC-W18). NOTICE의 JSON에도 `platform`이 없고 `source:"watch"`다.
- **C4 (보완, §6.2):** `--session <dispatchId>`는 그 dispatch의 세션들을 따라간다. `--session <sessionId>`는 그 세션과 하위 에이전트를 따라가고, 그 세션 자체가 bridge 세션이면 해당 dispatch 이벤트도 포함한다. Orchestrator 세션과 그 세션이 띄운 dispatch를 잇는 데이터는 없으므로 연결하지 않는다.
- **C5 (보완, §5.1):** `--platform`을 지정하면 플랫폼을 모르는 dispatch 이벤트(C3)는 출력하지 않는다.
- **C6 (보완, §11):** 텍스트 처리 첫 단계로 CSI·OSC escape sequence와 그 밖의 C0/C1 제어문자를 제거한다(공백 합치기보다 앞).
- **C7 (재량 고정, §12):** 이름 기반 마스킹은 키 이름이 다음 단어 가운데 하나로 끝날 때만 적용한다(대소문자 무시): `password`, `passwd`, `pass`, `secret`, `token`, `api_key`/`apikey`/`api-key`, `access_key`, `private_key`, `auth`. 예: `GITHUB_TOKEN=x`는 마스킹하고 `author: Kim`은 그대로 둔다.

## 22. S0 spike 이후 보완 (2026-11-11)

- **S0 판정:** V1 확인(`claude -p` transcript는 `projects/<cwd realpath slug>/<sessionId>.jsonl`, `entrypoint:'sdk-cli'`, 형식은 일반 세션과 같음). V2 부분(Desktop 하위 에이전트로 필드 구조 확인, codex-tui 실행은 사용자 결정으로 생략). V3 부분(`PatchApply`, `WebSearch` item, 승인 요청은 관찰되지 않음). V4 부분(`end_turn` 확인, system `error` subtype 없음).
- **C8 (정정, 사용자 승인):** Codex `spawn_agent` 호출(`namespace:'collaboration'`)의 `arguments.message`는 암호문으로 저장된다. SPAWN text는 `<agent_type>: <task_name>`이고 `message`는 어떤 모드에서도 출력하지 않는다. §8.1 spawn 행에 반영했다.
- **C9 (보완, 계획의 V3·V4 처리 규칙 적용):** 웹 검색은 `Extension` `kind:'web.search'` item이다(§8.1). 새로 관찰된 Codex·Claude 줄 type은 버림 목록에 넣었다. Claude는 최상위 `type`으로만 분기한다. Claude `system` 줄은 출력하지 않는다(§8.2). 승인 요청 매핑은 추정 키 그대로 두고 합성 fixture로만 검증한다.

## 23. 개정 이력

### 개정 1 (2026-11-11, 근거 HEAD `e33f1e3`)

사용자 확정 결정
- Q3. USER와 AGENT 메시지는 생략 없이 출력한다.
  - 원문 줄바꿈을 유지하고, 둘째 줄부터 머리말 폭만큼 들여쓴다.
  - 긴 줄은 직접 접지 않고 터미널 자동 줄바꿈에 맡긴다.
  - 전체 출력은 USER와 AGENT에만 적용한다. reasoning, CMD, EDIT 등은 지금처럼 한 줄로 자른다.
  - 비밀 마스킹과 도구 출력 숨김은 유지한다.
  - 사람용 출력의 세션 라벨 칸(`exec#c41c` 등)을 없앤다.
- D3. `--json`의 `user`/`agent` `text`도 1000 code point 상한 없이 `\n`을 보존한다. 이 kind에서는 `truncated`가 나오지 않는다.
- Q5/D4. KIND별 색을 §13.1 표로 정한다.
  - CLAUDE 플랫폼은 주황 `38;5;208`이다.
  - 괄호 부분은 태그와 같은 색이다.
  - 실패한 `CMD(n≠0)`은 태그 전체가 빨강이다.
  - 그 밖의 `CMD`는 진회색 `38;5;242`이다.
- Q6/D5. 역할명은 AGENT 태그에만 붙인다. 예: `AGENT(implementer)`.

바뀐 곳
- §1: 역할 표시 문장.
- §5.1, §5.3: `--width` 적용 범위와 help 문구. help에 메시지 전체 출력 안내 줄 추가.
- §5.5: 색 표 참조.
- §6.4: entrypoint는 `--json` 라벨에만 표시.
- §7: `label`, `text`, `truncated` 설명. 스키마 버전 1 유지.
- §8.3: 늦은 매핑 후 라벨과 역할 반영.
- §9: 라벨 칸 삭제와 라벨의 용도.
- §11: 텍스트 처리를 A(메시지)와 B(그 밖)로 나눔.
- §12: 여러 줄 마스킹.
- §13.1: 형식, AGENT 태그, 줄 규칙, 예시, 색 표.
- §13.2: JSON `text` 규칙과 `label` 유지.
- §17: 문서 영향.
- §18: R2 갱신, R8~R10 추가.
- §19: AC-W04, W08, W09, W10, W13, W15, W19, W22 조정. AC-W24~W28 추가. 기준선 HEAD 추가.
- §20: 색상표와 라벨 칸 표시를 재량에서 제외.

Planner 판단으로 정한 세부 사항
- 탭은 공백 4칸으로 바꾼다.
- KIND 칸은 최소 8칸이고, 길면 늘어난다.
- `--json`의 `label` 필드는 유지한다.
- 256색 대체 색은 두지 않는다.
- 역할이 없는 subagent의 AGENT 이름은 `label` 끝 구간을 쓰고 20 code point로 제한한다.
- 최상위 세션은 `AGENT`로 표시한다.
- 스키마 버전은 1로 유지한다.
- CMD 진회색은 `38;5;242`로 정한다. TOOL `38;5;250`, 메타 `2`와 구분되고, 테마마다 값이 달라지는 `90`을 피하려는 것이다.

### 개정 2 (2026-11-12, 근거 HEAD `1256ac7`, Plan W 최종 리뷰 후속)

사용자 확정 결정(리뷰 low 지적 중 L2, L4, L5, L6 반영. L1, L3은 후속 제안으로 기록)
- L4: Claude `isCompactSummary:true` user 줄은 USER 전체 출력에서 제외한다. 기본 출력에서는 숨기고 `--verbose`에서 한 줄 NOTICE `compact summary (<n> chars)`로 표시한다(§8.2 user 행, AC-W29).
- L2: `--verbose` 진단 NOTICE 본문의 세션 라벨(`tui#…`, `main#…`, `<role>@<id4>`)을 세션 id 앞 8자(`<id8>`)로 바꾼다. 사람용 출력의 라벨 제거 범위를 진단 문구까지 넓힌다(AC-W26).
- L5: `--key value` 마스킹 패턴에 앞 경계와 키 길이 상한(64)을 둔다(§12, AC-W30). 그 결과 경계가 없는 `x--key value`와 65자 이상 키는 마스킹 대상에서 빠진다(성능을 위한 의도된 축소, 최종 리뷰 N1에서 문구 정정).
- L6: README "Watch sessions" 절을 §17의 3~5줄 분량으로 줄이고, 색과 AGENT 태그 설명은 `docs/harness-operation.md`에만 둔다.

후속 제안(이번 범위 아님): L1 다음 줄 값 마스킹 보조 규칙, L3 보이지 않는 서식 문자(`\p{Cf}`) 제거, Plan I L-a 홈 화면 residual 표시.
