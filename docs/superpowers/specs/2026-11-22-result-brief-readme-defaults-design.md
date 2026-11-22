# 결과 문구·watch 요약 박스·이전 이벤트·worktree 선택·README 재구성·기본 모델 통일 설계

## 의도

ARC를 설치하거나 관리하는 사용자가 결과를 한눈에 이해하게 한다. `arc watch`에서는 저장소의 worktree 가운데 볼 곳을 먼저 고르고, 무엇을 감시하는지 바로 보고, 놓친 앞쪽 이벤트를 키 하나로 다시 볼 수 있게 한다. README만 읽어도 동작과 화면을 그릴 수 있게 한다. 최초 설치 기본 모델은 플랫폼마다 한 값으로 단순화한다.

## 목표

- G1(C1) Configure Apply 결과에서 `Mixed routing on: …`와 `After upgrading ARC, run Configure again.`을 없앤다.
- G2(C2) 최초 설치, 재설정, Upgrade, 플랫폼 Uninstall, Everything (incl. CLI)의 성공 결과를 작업별 이모지가 붙은 짧은 영어 문구로 통일한다.
- G3(C3) `arc watch` 시작 notice 두 줄을 TTY에서 4행 요약 박스로 바꾼다.
- G6(C6) TTY에서 Ctrl-H를 누르면 시작 때 읽은 이력 중 아직 보이지 않은 앞쪽 이벤트를 20개씩 출력한다.
- G7(C7) Git 저장소에서는 플랫폼 메뉴 전에 같은 git-common-dir의 모든 worktree를 활동 정보와 함께 보여 주고, 하나를 골라 watch 범위로 삼는다.
- G4(C4) README를 재구성하고 모드별 도식과 watch 예시 로그(worktree 선택, 박스, Ctrl-H)를 넣는다.
- G5(C5) 패키지 `models.toml` 기본값을 플랫폼별 단일 값으로 통일한다.

## 비목표

- 실패, 부분 성공, 130, hold, unknown 결과 행은 바꾸지 않는다.
- watch `--json`과 비TTY 출력 형식은 바꾸지 않는다. Ctrl-H는 이 모드에서 동작하지 않는다.
- 시작 때 읽은 범위(세션 파일 끝 256 KiB, 시작 시 attach된 세션)보다 앞쪽은 Ctrl-H로 읽지 않는다.
- watch 범위는 계속 worktree 하나다(PR #64 결정 유지).
- worktree를 디렉터리 스캔이나 플랫폼별 경로 규칙으로 찾지 않는다. worktree를 만든 플랫폼도 추정하지 않는다.
- 새 CLI 플래그는 추가하지 않는다. `followWatch`를 기존 방식으로 호출하면 지금처럼 동작한다.
- 세션이 실행 중인지 프로세스로 판정하지 않는다. Gemini·Grok watch 지원은 추가하지 않는다.
- `lib/runtime`, `shared/`, `lib/models/*.json`, `lib/watch/anchor-store.mjs`, `lib/watch/git.mjs`, `claude/agents/*.md`, 설치·업그레이드 로직은 바꾸지 않는다.

## 반목표

- README가 특정 플랫폼 중심으로 쓰이거나, 지원 상태가 코드와 어긋남(Gemini host held `GG2`, write roles held `GG1`, watch는 Claude·Codex만).
- 특정 플랫폼이 만든 worktree나 프로젝트 밖 worktree가 목록에서 빠지거나 선택되지 않음.
- 박스, 구분선, worktree 행이 폭을 넘어 `eraseBlock`이 깨짐.
- 성공 문구가 Residual path 같은 진단 정보를 가림.
- 0x7f Backspace로 페이지가 넘어감.
- Ctrl-H 페이지 중간에 live 이벤트가 끼어듦.
- main을 골랐는데 nested worktree 세션이 섞이거나, nested·바깥 worktree를 골랐는데 그 세션이 빠짐.
- 목록을 만드느라 시작이 눈에 띄게 느려짐(이력 읽기 비용이 목록 단계에 들어감).

## 제약

- 문서는 host 중립이고 네 플랫폼을 대칭으로 다룬다. watch 지원은 사실대로 Claude·Codex로 적는다.
- worktree 생성 위치는 플랫폼마다 다르다. 설계는 이 차이에 의존하지 않는다.
  - Claude `.claude/worktrees/<name>`, Gemini `.gemini/worktrees/<name>`, Grok `.grok/worktrees/<name>`: 프로젝트 안, `.git/info/exclude`로 무시됨
  - Codex: 앱(`mcp__codex_app__create_worktree`)이 정하며 대개 프로젝트 밖(`codex/skill/references/worktree-creation.md:4`)
  - 수동 sibling worktree도 있을 수 있음
- TUI 문구는 영어로 쓴다. 커밋은 `type(scope): 한국어 설명` 형식이다. Python은 `PYTHONDONTWRITEBYTECODE=1`로 실행한다. 모델 쌍은 `lib/models/*-models.json`에 있는 유효 쌍이어야 한다.

## 접근 방식

### C1

- (채택) 원천에서 삭제한다. 이 두 문구를 사용자에게 보여 주는 곳은 TUI뿐이다. `lib/management/reapply.mjs:63-64`는 성공 시 `Dispatch history stays in `만 통과시키고, `lib/management/update.mjs:56`은 그렇게 걸러진 값만 출력한다. `After upgrading ARC, run Configure again.`은 Upgrade가 자동으로 재적용하므로 이미 낡은 안내다.
- (기각) 화면에서 거르는 방식. 문자열을 두 곳에서 관리하게 된다.

### C2

- (채택) 성공 분기 하나와 Apply 직전 상태 스냅샷(`lib/tui/app.mjs:91`)으로 플랫폼별 신규/기존을 판정한다.
- (기각) 관리 계층 결과에 신규 여부를 새로 싣는 방식. 관리 계층을 바꿔야 하고, TUI에는 이미 스냅샷이 있다.

### C3 (사용자 결정)

단일 칸 박스 `renderBox`, 4행. `lib/watch/markdown.mjs`에 새로 export하며 기존 표 테두리 문자와 inline Markdown 해석을 재사용한다. AGENT 메시지의 Markdown 해석은 바뀌지 않는다.

### C6 (사용자 결정)

- (채택) A. 시작 backlog. 시작 때 normalize했지만 보여 주지 않은 이벤트를 정렬된 backlog로 보관하고 Ctrl-H마다 한 페이지씩 꺼낸다. 파일을 다시 읽지 않는다.
- (기각) B. 파일 역방향 읽기. Claude·Codex normalizer가 상태를 가지므로(`lib/watch/watcher.mjs:237`) 중간 청크의 판정이 틀릴 수 있다. 후속 과제.
- (기각) C. 대체 화면 pager. append-only 로그 모델과 status block 설계가 깨진다.

### C7

- (채택) A. porcelain 목록과 probe 활동 집계로 범위를 교체한다. `git worktree list --porcelain -z`로 같은 common dir의 worktree를 위치와 무관하게 얻고, probe watcher(이력 미독)로 30분 안의 세션 cwd를 worktree별로 집계한다. 고른 worktree를 `roots`로, 나머지를 `excludedRoots`로 두고 이후는 기존 scope 규칙을 그대로 쓴다.
- (기각) B. 활동 정보 없이 목록만 보여 주는 방식. 어느 worktree가 활성인지 판단할 근거가 없다.
- (기각) C. 플랫폼별 디렉터리 스캔. Codex 앱 경로와 sibling을 놓치고, git이 모르는 디렉터리를 포함할 위험이 있다.

### C4 (사용자 승인)

`docs/images/role-flow.svg`를 `mode-standalone.svg`와 `mode-mixed.svg`로 대체하고, `docs/images/role-models.svg`는 삭제한 뒤 README 기본값 표로 대체한다.

## 결정된 동작

### D1 (C1)

`lib/management/operations.mjs:149` 성공 반환의 `messages`를 `[...history, ...(publication.residualPaths??[]).map(v=>'Residual path: '+v)]`로 바꾼다. 실패 반환(`:150`)과 switch의 `Mixed routing turned off.`(`:168`)는 그대로 둔다.

### D2 (C2) 성공 결과 행

- 성공 조건: `code===0`이고, 모든 결과가 성공 상태(`installed` 또는 `uninstalled`)이며, `error`가 없다. update는 `code===0`이면 성공이다.
- 플랫폼 목록은 `sortByDisplay` 순서로 나열하고, 라벨은 `platformLabel`을 쓴다.
- 신규/기존 판정
  - TUI 홈 루프가 동작 직전에 모은 `statuses`(`lib/tui/app.mjs:91`)로 `previousStates`를 만든다.
  - `'absent'`이거나 값이 없으면 신규, `'installed'`이거나 `'incomplete'`이면 기존이다(`lib/management/status.mjs:11-21`).
  - `previousStates`를 넘기지 않는 호출자는 모든 플랫폼을 신규로 본다.
  - force finish 뒤 재시도(`lib/tui/app.mjs:74`)는 처음 받은 값을 유지한다.

| 작업 | 행 |
|---|---|
| 모두 신규 | `✨ ARC installed for <P…>.` / `Restart ARC to check.` |
| 모두 기존 | `🔧 Settings applied to <P…>.` / `Restart ARC to check.` |
| 신규와 기존 혼합 | `✨ ARC installed for <신규…>.` / `🔧 Settings applied to <기존…>.` / `Restart ARC to check.` |
| Upgrade | `🚀 Upgraded to ARC <latestVersion>.` / `Restart ARC to check.` |
| 플랫폼 Uninstall | `🧹 Removed ARC from <P>.` |
| Everything, CLI removed | `👋 ARC and the arc CLI removed.` / `exitSession`이면 `CLI removal ended this session.` |
| Everything, CLI absent | `👋 ARC removed.` |

- 헤드라인 행 뒤에 `messages`를 원래 순서대로 붙인다(`Mixed routing turned off.`, `Dispatch history stays in …`, `Residual path: …`). 그 뒤에 결과별 Residual path를 붙이고 중복은 제거한다.
- Upgrade 성공 시 `result.stdout`에서 `Residual path: `로 시작하는 줄을 헤드라인 뒤에 붙인다. `lib/tui/app.mjs:78`의 update 전용 리터럴은 삭제한다.
- 바뀌는 기존 문구: `🎉 Setup ran successfully! Please restart ARC to check.`, `Apply to: …`, `Removed from <P>.`, `Removed ARC and CLI.`, `Removed ARC.`, `🎉 Update ran successfully! Please restart ARC to check.`
- 실패 경로 행은 그대로 둔다: `ARC <v> installed for <P>.`, `<platform>: <status>`, `Error:`, `CLI: …`, `CLI error:`, `Exit code: N`, Active dispatches, publication unknown 안내.

### D3 (C3) watch 요약 박스

- 표시 조건: `output.isTTY && !options.json`(`lib/watch/index.mjs:80` `blockEnabled`).
  - 이 경우 header notice 대신 박스를 그리고 `live` notice는 출력하지 않는다.
  - 그 밖의 모드는 기존과 바이트 단위로 같다.
- 데이터
  - watcher가 header notice에 `brief: {scope, branch?, platforms}`를 붙인다.
  - `scope`는 `scope.display`(D7, `~` 축약 절대 경로)다. 없으면 `watchLocationLabel({dir:scope.roots[0], home:homes.user})`를 쓴다.
  - `branch`는 `scope.branch`다.
  - 마지막 `live` notice에 `startup:'live'`를 붙인다.
  - JSON은 허용 목록(`lib/watch/render.mjs:115-118`)으로 걸러지므로 바뀌지 않는다. 기존 notice 문구도 그대로다.
- 내용(라벨은 굵게):

  ```
  ┌──────────────────────────────────────────────────────────┐
  │ arc watch 0.5.0                                          │
  │ Scope      ~/work/app/.claude/worktrees/feature (feat/x)  │
  │ Platforms  CLAUDE · CODEX                                │
  │ Keys       Ctrl-C stop · Ctrl-H earlier · Ctrl-L clear   │
  └──────────────────────────────────────────────────────────┘
  ```

  - 제목: `arc watch <package.json version>`
  - Scope: `<scope>`에 branch가 있으면 ` (<branch>)`를 붙인다.
  - Keys: `keysEnabled`이면 `Ctrl-C stop · Ctrl-H earlier · Ctrl-L clear`, 아니면 `Ctrl-C stop`. `Ctrl-H earlier`는 C6와 함께 넣는다.
- 순서(TTY): 박스, disabled notice(`lib/watch/index.mjs:167-170`), 진단, tail history, live. 비TTY와 JSON 순서는 기존과 같다.
- 색: color가 켜지면 테두리와 라벨에 ANSI를 쓰고, `NO_COLOR`면 ANSI 없이 같은 박스를 그린다.
- 폭: 박스 폭은 `min(자연폭+4, blockWidth-1)`이다. 넘치는 값은 칸 안에서 줄바꿈하고 값 열 위치로 들여쓴다. `blockWidth < 24`면 테두리 없이 `Label value` 평문 줄로 출력한다. 어떤 줄도 `blockWidth-1`열을 넘지 않는다.

### D6 (C6) Ctrl-H 이전 이벤트

- 활성 조건은 `keysEnabled`(`lib/watch/index.mjs:83`)다. 비TTY와 `--json`에서는 backlog를 만들지 않는다.
- 키: 0x08(Ctrl-H)만 처리하고 0x7f(Backspace)는 무시한다. Backspace가 ^H를 보내는 터미널에서는 Backspace로도 동작하며 help에 적는다.
- backlog: 시작 때 normalize했지만 보여 주지 않은 이벤트로 만든다. `source==='watch'`는 제외한다.
  - (a) `sort` 결과 중 `tailCount` 슬라이스 밖(`lib/watch/watcher.mjs:562`)
  - (b) startup attach에서 `showHistory`가 거짓인 세션의 normalize 결과(`:243-251`, 이력 창 밖 세션과 `--tail 0`)
  - (c) startup에서 건너뛴 dispatch 이벤트(`:207`)
  - `sort` 순서로 최신 `L.earlierMax = 2000`개까지 보관한다. 범위는 선택한 worktree다.
- 페이지 크기: 항상 `L.earlierPage = 20`이다. `--tail` 값과 무관하다.
- 출력(append-only)

  ```
  ── earlier 20 events · 123 more ──
  <이벤트, renderHuman 형식, 시간순>
  ── back to live ──
  ```

  - 남은 이벤트가 없으면 시작 구분선은 `── earlier <n> events · start of loaded history ──`다.
  - backlog가 비어 있으면 `── no earlier events in loaded history ──` 한 줄만 출력한다.
  - 구분선은 color일 때만 dim(`\x1b[2m`)으로 칠하고 `blockWidth-1`에서 자른다.
  - Ctrl-L로 화면을 지워도 다음 Ctrl-H는 이어서 더 오래된 페이지를 보여 준다.
- 한 페이지는 `eraseBlock` → 출력 → `drawBlock`을 하나의 동기 처리로 끝낸다. 이전 이벤트에는 `markEmitted`를 적용하지 않고 `clean`만 적용한다.
- `WATCH_HELP`
  - 마지막 줄: `Press Ctrl-H to show earlier events from the history loaded at start, 20 at a time, Ctrl-L to clear the screen and Ctrl-C to stop. Ctrl-H and Ctrl-L work in a TTY only.`
  - 그 아래: `Terminals that send ^H for Backspace also show earlier events on Backspace.`
  - 박스 안내 줄 추가: `A summary box at the start shows the scope, platforms and keys (TTY only).`

### D7 (C7) worktree 선택 화면

- 용어는 "worktree"다. 화면 제목은 `Which worktree to watch?`다.
- 열거
  - 현재 worktree에서 `git worktree list --porcelain -z`(`GIT_ALLOWED[2]`, `lib/watch/git.mjs:9`)를 실행한 결과만 쓴다.
  - 디렉터리 스캔이나 플랫폼별 경로 규칙은 쓰지 않는다. 프로젝트 안(`.claude/worktrees`, `.gemini/worktrees`, `.grok/worktrees`), 프로젝트 밖(Codex 앱 경로), 수동 sibling을 모두 같은 방식으로 다룬다.
- 항목 처리

| porcelain 상태 | 처리 |
|---|---|
| `bare` | 제외 |
| `prunable` 또는 디렉터리 없음(`fs.statSync` 실패나 디렉터리 아님) | 제외 |
| `locked` | 포함, 선택 가능, 활동 열 앞에 `locked · ` |
| `detached` | 포함, 브랜치 열 `detached <HEAD 앞 7자>` |
| 그 밖 | 포함, 브랜치 열은 `refs/heads/`를 뗀 이름 |

- main worktree는 porcelain 첫 항목이다. 첫 항목이 bare면 main은 없다.
- 표시 경로(목록 화면)
  - (a) main 자신: `watchLocationLabel(mainRoot)`(`~` 축약 절대 경로)
  - (b) main 안의 worktree: `<basename(mainRoot)>/<mainRoot 기준 상대 경로>`. 예: `app/.claude/worktrees/x`, `app/.gemini/worktrees/y`
  - (c) main 밖의 worktree(Codex 앱 경로, sibling)나 main이 없을 때: `~` 축약 절대 경로
  - 경로 열이 할당 폭을 넘으면 첫 구간과 마지막 두 구간만 남기고 가운데를 `…`로 줄인다. 예: `~/…/7f3a/app`
  - 경로 비교는 `realPath` 결과로 한다.
- 박스 Scope는 위치와 무관하게 항상 `~` 축약 절대 경로(`scope.display`)를 쓴다.
- 흐름(`runWatch`, TTY)
  1. 홈을 해석하고 `resolveScope`를 호출한다. 결과는 `followWatch`의 `io.scope`, `io.homes`로 넘긴다.
  2. `scope.kind==='dir'`(비Git)이면 화면을 생략한다. 이때만 생략한다.
  3. Git이면 porcelain을 파싱하고 항목 처리를 적용한다.
  4. probe로 활동을 집계한다.
  5. 화면을 띄운다. 선택 가능한 worktree가 1개여도 띄운다. 기본 선택은 현재 worktree이고, Enter로 고른다(단일 선택).
  6. 기존 플랫폼 메뉴를 그대로 띄운다.
  7. `followWatch`를 호출한다.
- probe
  - `createWatcher({…, scope:{kind:'repo', roots:<선택 가능한 모든 root>, excludedRoots:[], gitCommonDir}, options:{probe:true, platforms:<watch 지원 전체>, tail:0}})`
  - attach에서 `readTail`, `emit`, shell root 스캔, tick을 모두 생략한다.
  - `listActivity() => [{platform, mtimeMs, cwd, main}]`. cwd는 `latestCwd ?? cwd`다.
  - 활동은 cwd를 포함하는 가장 깊은 worktree root에 귀속한다. 30분(`attachWindowMs`) 안의 활동만 센다.
  - 집계 대상은 Claude·Codex 세션뿐이다. Gemini·Grok 세션만 있는 worktree는 `no recent activity`로 표시된다.
- 행 구성
  - 열: 경로, 브랜치, 활동.
  - 활동 열
    - 현재 worktree면 앞에 `here · `, locked면 `locked · `를 붙인다.
    - 활동이 있으면: 5분(`L.spinnerIdleMs`) 안이면 `● `를 붙이고, `<상대 시각> ago · N session(s) · <플랫폼 목록>`을 쓴다.
    - 활동이 없으면: `no recent activity`
  - 흐림
    - color가 켜지면 비활성 행 전체를 `\x1b[2m`으로 칠한다.
    - color가 꺼지면(`NO_COLOR` 등) 활동 열을 `(no recent activity)`로 쓴다.
  - 열 너비를 맞추고 `fitChoiceRow`로 폭에 맞춘다.
- 순서
  1. 현재 worktree(활동 여부와 무관)
  2. 활동이 있는 나머지 worktree, `lastActivity` 내림차순
  3. 비활성 worktree, 표시 경로 오름차순(`localeCompare(…, 'en')`)
- 상한: `L.worktreePickerMax = 20`행. 넘치면 위 순서로 앞의 20행만 보여 주고(현재 worktree 포함), 선택할 수 없는 info 줄을 붙인다: `<N> more worktrees not shown. Run arc watch inside a worktree to watch it.`
- 화면 예시(색 없음):

  ```
  Which worktree to watch?
  ▸ ~/work/app                          master             here · ● 2m ago · 1 session · CODEX
    app/.claude/worktrees/result-brief  feat/result-brief  ● 4m ago · 2 sessions · CLAUDE, CODEX
    ~/.codex/worktrees/7f3a/app         detached 1a2b3c4   18m ago · 1 session · CODEX
    app/.gemini/worktrees/docs          docs/refresh       (no recent activity)
    ~/work/app-hotfix                   hotfix/login       locked · (no recent activity)
    ← exit
  ```

  위 Codex 경로는 예시이며, 실제 경로는 Codex 앱이 정한다.
- 선택 결과
  - `scopeForWorktree(scope, worktrees, root, {home})`는 `{...scope, roots:[root], excludedRoots:<다른 모든 선택 가능 root>, branch, display, description:`Worktree ${root}`}`를 돌려준다.
  - 이후 `inScope`, `refreshScope`, `claudeDirPrefixes`는 기존 규칙 그대로 동작한다.
  - main을 고르면 main 안 nested worktree 세션은 범위 밖이 된다. nested나 바깥 worktree를 고르면 그 worktree 세션만 범위에 든다.
- 키: back과 EOF는 종료(0), Ctrl-C는 130. 기존 플랫폼 메뉴와 같다.
- 실패: 목록 파싱이나 probe가 실패하면 화면 없이 현재 worktree로 계속한다. porcelain을 얻었으면 `branch`와 `display`를 채운다.
- 비TTY, `--json`, CLI
  - 기존 정책을 유지한다. `runWatch`는 TTY가 필요하고, `--json`이어도 TTY면 두 화면을 거친다.
  - `followWatch`를 `io.scope` 없이 호출하면 기존과 같다.
  - 플래그는 없다.
- `WATCH_HELP` Scope 절(`lib/watch/index.mjs:17-18`) 대체 문구: `In a Git repository, first choose the worktree to watch from git worktree list, wherever it was created; the current worktree is selected, recent session activity is shown, and worktrees without recent activity are dimmed. Outside Git the current directory is watched. Then check the platforms to watch; all supported platforms are checked by default. Requires an interactive terminal.`

### D4 (C4) README 구성

1. 제목과 소개(네 플랫폼, host 중립)
2. Install
3. How ARC works: Roles 표, Standalone 도식(`mode-standalone.svg`), Mixed 도식(`mode-mixed.svg`), Mode 표
4. Manage ARC: 메뉴 표와 결과 예시(`✨ …`, `🔧 …`)
5. Models and language: D5 표
6. Watch sessions(`arc watch` 전용 절)
   - 흐름: worktree 선택(Git) → 플랫폼 선택 → watch
   - worktree는 `git worktree list`로 위치와 무관하게 나열된다
   - visibility 표
   - 지원 플랫폼은 Claude·Codex. Gemini·Grok은 메뉴에 보이지만 선택할 수 없고, 그 세션 활동은 worktree 목록에 반영되지 않는다
   - 예시 로그창(실제 함수 출력, 가상 값 `~/work/app`): worktree 화면(색 없음, 위 5행), 박스, 이벤트 3~5줄, Ctrl-H 한 페이지, status block 1줄
7. Platform support: `docs/harness-operation.md:60,71`과 현재 README 지원 표에 맞춘다
8. Upgrade: 핵심 2~3줄
9. Guides

- README에서 뺀 내용은 `docs/harness-operation.md`에 있어야 한다. 없으면 README에 남긴다(정보 손실 금지).
- Standalone 도식: 한 platform 안에서 Orchestrator가 5개 역할로 배정하는 모습. 플랫폼은 "any supported platform"으로 쓴다.
- Mixed 도식: supported host의 Orchestrator가 역할을 Claude, Codex, Gemini, Grok으로 라우팅한다. Gemini는 `read roles (write held)`로 표기하고 예시 배정에서 read role에만 쓴다. anchor 규칙(Claude → Codex → Gemini → Grok 순서의 첫 참여자)은 주석으로 단다.

### D5 (C5) 패키지 기본값

| 플랫폼 | 전 역할 model | effort |
|---|---|---|
| Claude | `opus` | `effort = "medium"` |
| Codex | `gpt-6.2-sol` | `model_reasoning_effort = "medium"` |
| Gemini | `gemini-4-neon` | `effort = "default"` |
| Grok | `grok-4.6` (무변경) | `effort = "default"` |

- `gemini/agents/arc-*.md:4`의 model도 `gemini-4-neon`으로 바꾼다.
- `gemini/skill/models.toml:2` 주석은 `# Defaults use one packaged model for every role.`으로 바꾼다.
- Gemini 최신 판단 근거: `lib/models/gemini-models.json`의 첫 항목이며, Gemini 4 항목은 공개일 역순으로 정렬되어 있다(`docs/superpowers/plans/2026-11-21-recommended-default-models.md`). 사용자 확인 완료.
- Gemini·Grok 카탈로그에는 `default` effort만 있어 `medium` 대신 `default`를 쓴다(사용자 결정).

## 빌더에게 맡기는 것

SVG 디자인(기존 `role-flow.svg` 톤), `renderBox` 줄바꿈(`renderLine` 재사용), backlog 자료구조, worktree 행의 열 폭 배분.

## 가정

- A1: D5 쌍이 카탈로그에 있고, Grok 파일은 이미 D5 값이다.
- A3: startup에서 `showHistory`가 거짓이어도 `normalize`는 범위 판정을 마친 이벤트를 반환한다.
- A5: probe가 `readTail` 없이 `headCwd`·`latestCwd`만으로 적격 판정과 귀속을 할 수 있다(`lib/watch/watcher.mjs:409-416`).
- A6: 모든 root를 넣은 probe scope로 프로젝트 안과 밖의 worktree 세션을 찾는다(Claude startup 전체 scan `lib/watch/watcher.mjs:376`, Codex는 rollout 전체를 cwd로 판정).
- A7: `ui.menu`(`lib/tui/interface.mjs`)가 행별 흐림을 지원한다. 지원하지 않으면 하위 호환 옵션 `rowTones`(행 index별 `'dim'|undefined`)를 추가한다. 기존 호출자는 영향을 받지 않는다.

## 사용자 결정 기록 (2026-11-22)

- 실행 대상: 새 managed worktree `.claude/worktrees/result-brief-readme-defaults`, 브랜치 `feat/result-brief-readme-defaults`, base `5f6fa2e9`.
- 기본 모델: Claude `opus`, Codex `gpt-6.2-sol`, Gemini `gemini-4-neon`, Grok `grok-4.6`. effort는 medium(Gemini·Grok은 default).
- 성공 문구: 작업별 이모지(✨ 🔧 🚀 🧹 👋), 신규·기존 혼합은 3줄, CLI absent는 `👋 ARC removed.`, Upgrade 성공에도 Residual path 유지.
- watch 박스: 단일 칸 4행(제목, Scope, Platforms, Keys).
- Ctrl-H: 이전 이벤트 보기, 항상 20개, 시작 시 읽은 이력만, 0x7f 무시.
- worktree 선택: "session"이 아니라 worktree 선택. 비활성은 흐리게 표시, Git이면 항상 화면 표시, CLI 플래그 없음.
- README 도식: `role-flow.svg` 교체, `role-models.svg` 삭제.

## 미결 사항

없음.
