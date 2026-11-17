# arc watch / TUI UX 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 승인된 짧은 설계에 따라 `arc watch` 출력 가독성(W1–W7), `arc` TUI 조작성과 화면 정리(T1–T5), 결과 문구(M1), 최소 문서(D1)를 개선한다.

**Architecture:** 작업은 watch 렌더(`lib/watch/render.mjs`) → watch 하단 상태 블록(`lib/watch/index.mjs`, 신규 `lib/watch/status-line.mjs`) → terminal(대체 화면·`motion`) → app/render(메뉴 틱·`arrowValue`·Status 메뉴) → setup/diagram/custom-preset(T3/T4/T5) → 결과 문구(M1) → 문서 순서로 하나씩 진행한다.

**Tech Stack:** Node.js ESM, `node:test`, PTY 테스트(`expect`), ANSI SGR 256색.

**Design:** `.git/arc/handoff/tui-watch-polish-20261117/approved-design.md` (2026-11-17 사용자 승인)

**Base:** `/Users/ma-24-007/Desktop/workspace/arc`, 브랜치 `feat/tui-watch-polish`, base HEAD `87f1b1bfe07c60d8ac9cfe693240368e3db61f98`. 경로는 Bounded, plan 필요. 위험도는 significant로, 작업마다 새 QA를 두고 마지막에 Reviewer가 1회 검토한다.

## Global Constraints

- 다음은 바꾸지 않는다: `renderJson` 출력, operation 결과 객체 구조, `gradientAt`/`shimmerIntensity`/`toAnsi256` 시그니처.
- 애니메이션을 끄는 조건은 TERM=dumb, `frameMs` 0, 색 없음(`colorDepth==='none'`, NO_COLOR)이다. NO_COLOR, non-TTY, `--json`의 기존 동작은 퇴행하면 안 된다.
- PTY 테스트와 단위 테스트는 결정적이어야 한다. 필요한 곳은 TERM=dumb으로 고정하거나 `frameMs`/`motion`을 주입한다. fake session에는 `motion`이 없으므로 frame은 0으로 고정된다.
- 새 세션 안내 문구는 넣지 않는다. 실패 줄(`Error:`/`Residual path:`/`Exit code:`)과 rollback 숨김은 그대로 둔다.
- watch의 Gemini 수집 소스는 범위 밖이다.
- **MANIFEST:** `MANIFEST.sha256`에는 `lib/watch/*`, `lib/tui/*`, `lib/management/*`, `lib/npm/*`, `README.md`의 해시가 들어 있다. `tests/test_arc_policy.py`는 `node scripts/update-manifest.mjs --check`를 실행한다. 각 작업의 Implementer는 마지막 Step에서 `node scripts/update-manifest.mjs`를 실행한 뒤 `node scripts/update-manifest.mjs --check`가 통과하는지 확인하고, `MANIFEST.sha256` 변경을 해당 작업 변경에 포함한다. 같은 파일을 여러 작업이 고치므로 작업은 모두 직렬로 진행한다.
- **판정:** 전체 suite에는 기존 실패 51–55건과 부하 flaky가 있다. 새 실패가 없으면 통과다. 전체 suite(`npm test`)는 Orchestrator가 실행하고, 의심되는 건은 단독으로 다시 실행한다.

## 의존 그래프 (직렬)

```
A → B → C → D → E → F → G
```

- 실제 기능 의존: A→B(`watch-cli.test.mjs` 공유), C→D→E→F(`session.motion`, `arrowValue`, `tui-app*.test.mjs` 공유), {A,B,E,F}→G
- 모든 작업이 `MANIFEST.sha256`를 고치므로 병렬 배치는 없다.

## Review Focus

1. 좁은 폭에서 경로가 줄바꿈될 때 연속 줄 들여쓰기가 맞아야 한다. 하단 블록을 width-1로 자를 때 이전 줄이 남으면 안 된다. (A/B)
2. 하단 블록이 그려진 상태에서 이벤트·Ctrl-L·종료가 일어나면 블록이 잔상 없이 지워져야 한다. (B)
3. TUI가 예외, SIGTERM, `process.exit`으로 끝나도 대체 화면이 해제되고 커서가 복원되어야 한다. (C)
4. motion이 꺼진 환경에서는 `< KR >`가 고정되어야 하고 불필요한 repaint가 없어야 한다. (D/E)
5. Hosts 화면의 locked/unavailable 행에서 Enter를 누르면 반드시 화면에 피드백이 있어야 한다. (E)

---

### Task A: watch 이벤트 렌더 (W1, W2, W3, W4, W7)

**Files:**
- Modify: `lib/watch/render.mjs` (`roleBadgeColors` 11–15, `PLATFORM_COLORS` 64, `tagColor` 81, `renderHuman` 112–147)
- Modify: `MANIFEST.sha256` (재생성)
- Test: `tests/node/watch-render.test.mjs`, `tests/node/watch-cli.test.mjs` (328–329행만)

**Predecessors:** 없음

**Interfaces / 고정값:**
- `PLATFORM_COLORS = {codex:'36', claude:'38;5;208', gemini:'38;5;135', other:'2'}`
- 뱃지
  - SCOUTER `1;38;5;16;48;5;117`
  - PLANNER `1;38;5;231;48;5;98`
  - IMPLEMENTER `1;38;5;16;48;5;214`
  - QA `1;38;5;16;48;5;228`
  - REVIEWER `1;38;5;231;48;5;161`
  - ORCHESTRATOR `1;38;5;16;48;5;255`
  - (v3) color가 켜져 있을 때 뱃지 라벨은 배경색 안에서 앞뒤 공백 1칸으로 감싼다: `\x1b[<SGR>m PLANNER \x1b[0m`. color가 꺼져 있으면 공백 없이 `PLANNER`다. 본문 들여쓰기는 바뀌지 않는다.
- `tagColor`
  - `tool` → `'38;5;101'` (W7, v4: 채도가 낮은 올리브 회색. CODEX 플랫폼 색 36(청록)과 기존 태그 색 33/38;5;69/31/38;5;110/38;5;175/38;5;141/38;5;137/32/1;35/38;5;242와 구분되고 눈에 덜 띈다.)
  - `command`는 `'38;5;242'`를 유지한다.
  - `bodyColor`는 기존 규칙을 따르므로 TOOL 본문도 `38;5;101`이 된다.

- [x] **Step 1: 실패 테스트 작성**
  - `watch-render.test.mjs`
    - 기존 뱃지 색 단언을 위 팔레트로 바꾼다.
    - TOOL 색 단언(`tool` → `'2'` 계열)을 `38;5;101`으로 바꾼다. CMD `38;5;242` 단언은 그대로 둔다.
    - 신규 `file paths are listed with "- " and continuation indent`
      - `file_change` 이벤트(paths 2개, `wrap:true`, 좁은 width)의 plain 출력을 검사한다.
      - 각 경로 줄은 `indent + '- ' + displayPath`로 시작한다.
      - 줄바꿈된 연속 줄은 `indent + '  '`로 시작한다.
      - `event.text` 첫 줄에는 `- `가 붙지 않는다.
    - 신규 `single file path has no "- " prefix`: paths가 1개인 이벤트는 경로 줄에 `- `가 붙지 않고 기존 형태(`indent + displayPath`)로 표시된다.
    - 신규 `agent role badge sits alone on the first line`
      - color가 없으면 `/AGENT    PLANNER\n {25}hello/`.
      - color가 있으면 첫 줄이 PLANNER 뱃지 SGR + `PLANNER\x1b[0m`으로 끝나고, 본문은 다음 줄에서 `\x1b[32m`으로 시작한다.
    - 신규 `gemini platform color`
      - `PLATFORM_COLORS.gemini==='38;5;135'`이다.
      - `platform:'gemini'` 이벤트의 color 출력에 `\x1b[38;5;135mGEMINI`가 들어 있다.
    - 회귀: paths가 들어 있는 이벤트 1건의 `renderJson` 결과가 base와 같은 문자열이다.
  - `watch-cli.test.mjs:328–329`
    - `/AGENT    PLANNER bridge answer/` → `/AGENT    PLANNER\n {25}bridge answer/`
    - QA도 같은 형태로 바꾼다.
- [x] **Step 2:** `node --test tests/node/watch-render.test.mjs tests/node/watch-cli.test.mjs`를 실행해 FAIL을 확인한다.
- [x] **Step 3: 구현**
  - 경로가 2개 이상일 때만 경로 줄을 `'- ' + displayPath(...)`로 만든다. 경로가 1개면 `- ` 없이 기존 형태를 유지한다. `- ` 줄은 wrap할 때 `avail-2`로 나눈다. 첫 조각은 `- `를 유지하고 나머지 조각 앞에는 `'  '`를 붙인다.
  - `roleName`이 있으면 `bodyLines=[roleName, ...본문]`으로 만들고, 0번 줄은 뱃지 색만 칠한다. 기존의 `bodyLines[0]` 접두 결합은 없앤다.
  - color가 없는 경로도 같은 줄 구조를 쓴다.
- [x] **Step 4:** Step 2 명령으로 PASS를 확인한다.
- [x] **Step 5:** `node scripts/update-manifest.mjs && node scripts/update-manifest.mjs --check`

**Commit (Orchestrator):** `feat(watch): 경로 목록 표시, 역할 뱃지 분리 줄과 팔레트, Gemini·TOOL 색`
**Criteria:** W1, W2, W3, W4, W7. `renderJson` 불변.
**QA(fresh):**
- 위 두 파일과 `node --test tests/node/watch-*.test.mjs`
- NO_COLOR 경로 출력에 SGR이 없는지 확인한다.
- 뱃지 배경끼리 겹치지 않는지, 초록 계열이 아닌지 표로 검토한다.

---

### Task B: watch 하단 상태 블록 (W5, W6)

**Files:**
- Create: `lib/watch/status-line.mjs`
- Modify: `lib/watch/index.mjs` (66–133행 스피너 영역, 156–168행 타이머, 34행 도움말)
- Modify: `MANIFEST.sha256` (재생성)
- Test: `tests/node/watch-cli.test.mjs` (356–403행), 신규 `tests/node/watch-status-line.test.mjs`

**Predecessors:** A

**Interfaces (Produces):**
- `watchLocationLabel({mode, dir, session, home}) -> string`
  - session이 있으면 `session <id>`
  - `mode==='all'`이면 `all directories`
  - 그 밖에는 `dir`(= `--cwd` 값 또는 process cwd)이다. `home` 하위 경로면 `~` 또는 `~/…`로 줄인다.
- `shimmerText(text, tick) -> string`
  - 글자 i의 기본 색은 `gradientAt(i/max(1,len-1))`이다.
  - 여기에 `shimmerIntensity(i,0,tick)`만큼 `[255,255,255]`를 섞는다.
  - 출력은 `\x1b[38;5;${toAnsi256(rgb)}m<ch>`를 이어 붙이고 끝에 `\x1b[0m`을 둔다.
  - `gradientAt`/`shimmerIntensity`는 `lib/tui/render.mjs`에서, `toAnsi256`는 `lib/tui/terminal.mjs`에서 import만 한다.
- `statusBlockLines({label, busy, glyph, tick, color, fancy, width}) -> string[]`
  - 1행은 label이다. width-1로 자르고, color가 켜져 있으면 `\x1b[2m…\x1b[0m`으로 감싼다.
  - 2행은 busy일 때만 있다.
    - `fancy`면 `\x1b[2m${glyph}\x1b[0m ` 뒤에 `shimmerText('working…',tick)`를 붙인다.
    - `fancy`가 아니면 평문 `${glyph} working…`이다.
    - 이 줄도 width-1로 자른다.
  - `fancy = color && env.TERM !== 'dumb'`

- [x] **Step 1: 실패 테스트 작성**
  - `watch-status-line.test.mjs`
    - `watchLocationLabel`: 세 가지 모드와 `~` 축약(`/home/u/proj` → `~/proj`, home 자체 → `~`)
    - `statusBlockLines`
      - busy=false면 1줄
      - busy=true면 2줄이고 순서는 경로 → working
      - `color:false`면 SGR이 없다.
      - `fancy:false,color:true`면 2행이 정확히 `⠋ working…`
      - `width:10`이면 각 줄의 `displayWidth`가 9 이하
    - `shimmerText`: SGR을 제거하면 원문과 같고, tick 0과 5의 SGR 코드열이 서로 다르다.
  - `watch-cli.test.mjs` 스피너 테스트(356–380) 갱신
    - 첫 출력의 strip 결과가 `<label>\n⠋ working…`로 끝난다.
    - 다음 step 출력이 `'\r\x1b[2K\x1b[1A\x1b[2K'`로 시작하고 `⠙ working…`로 끝난다.
    - busy가 아닐 때 abort하면 `'\r\x1b[2K'`가 나온다.
    - color일 때는 `/\x1b\[38;5;\d+mw/`가 있고, strip 결과는 `⠋ working…`다.
    - NO_COLOR 단언은 그대로 둔다.
  - 신규 `TTY status block shows watch path`: `--cwd`, `--all`, `--session x`마다 label 줄을 단언한다. HOME 주입은 기존 setup 패턴을 따른다.
  - 신규 `TERM=dumb keeps plain working line`: TTY에서 2행에 `\x1b[38;5`가 없다.
  - Ctrl-L 테스트(389–403): 기대값을 `'\x1b[H\x1b[2J\x1b[3J' + <블록 재그리기>`로 바꾼다. busy가 아니면 label 1줄만 다시 그린다.
  - non-TTY/JSON 테스트(381–387)는 그대로 둔다. 여기에 label 문자열이 없어야 한다는 단언을 추가한다.
- [x] **Step 2:** `node --test tests/node/watch-status-line.test.mjs tests/node/watch-cli.test.mjs`를 실행해 FAIL을 확인한다.
- [x] **Step 3: 구현**
  - `spinnerDrawn`을 숫자 `drawnLines`로 바꾼다.
  - `eraseBlock()`: `'\r\x1b[2K' + '\x1b[1A\x1b[2K'.repeat(drawnLines-1)`를 쓴 뒤 `drawnLines`를 0으로 되돌린다.
  - `drawBlock()`
    - TTY이고 json이 아닐 때만 그린다.
    - 줄 사이를 `'\n'`으로 잇고 마지막 개행은 쓰지 않는다.
    - 그린 줄 수를 `drawnLines`에 기록한다.
  - glyph 인덱스(mod 10)와 shimmer tick(단조 증가)은 따로 관리한다.
  - poll이 아닌 틱에서는 busy일 때만 다시 그린다.
  - Ctrl-L: 화면을 지우고 `drawnLines=0`으로 둔 뒤 `drawBlock()`을 호출한다.
  - stop: `eraseBlock()`을 호출한다.
  - label은 시작할 때 한 번만 계산한다.
  - 도움말 문구를 `A status block on the last lines shows the watched path and, while a turn is in progress, a spinner (TTY only).`로 바꾼다. 도움말 단언이 있으면 같이 갱신한다.
- [x] **Step 4:** Step 2 명령으로 PASS를 확인한다.
- [x] **Step 5:** `node scripts/update-manifest.mjs && node scripts/update-manifest.mjs --check`

**Commit (Orchestrator):** `feat(watch): 하단 경로 줄과 working… shimmer 상태 블록`
**Criteria:** W5, W6. non-TTY/`--json`/NO_COLOR 무퇴행.
**QA(fresh):** 위 테스트들과 `node --test tests/node/watch-*.test.mjs`
**Orchestrator 호스트 수동 확인:**
- 실제 TTY에서 `arc watch`, `arc watch --all`, `NO_COLOR=1 arc watch`, `TERM=dumb arc watch`, `arc watch | cat`을 실행한다.
- 잔상, 리사이즈, Ctrl-L, Ctrl-C 동작을 확인한다.

---

### Task C: 터미널 대체 화면과 motion (T1)

**Files:**
- Modify: `lib/tui/terminal.mjs` (dispose 43–52, 시작 92, 반환 93)
- Modify: `MANIFEST.sha256` (재생성)
- Test: `tests/node/tui-terminal.test.mjs`, `tests/node/tui-terminal-pty.test.mjs` (dispose 시퀀스 단언에 영향이 있을 때)

**Predecessors:** B (직렬화)

**Interfaces (Produces):** 세션 객체에 `motion: boolean`(`frameMs>0 && colorDepth!=='none'`)을 노출한다. `frameMs`는 그대로 유지한다.

- [x] **Step 1: 실패 테스트 작성 (`tui-terminal.test.mjs`)**
  - `alternate screen on start and restored on dispose`
    - 기본 env에서 시작 출력이 `'\x1b[?1049h\x1b[H\x1b[2J'`로 시작하고 그 뒤에 `\x1b[?25l\x1b[?2004h`가 온다.
    - dispose 출력은 정확히 `'\x1b[0m\x1b[?2004l\x1b[?25h\x1b[?1049l'`이고 `\n`이 없다.
    - dispose를 두 번 호출해도 한 번만 출력한다.
  - `TERM=dumb skips alternate screen`: 출력에 `1049`가 없다.
  - `exit listener restores synchronously and is removed`
    - 생성 후 `signals.listenerCount('exit')===1`이다.
    - `emit('exit')`가 복원 시퀀스를 1회 출력한다.
    - dispose 후 listener가 0개이고, 추가 dispose에서 출력이 없다.
  - `motion follows frameMs and color`: `{}`→`true`, `{TERM:'dumb'}`→`false`, `{NO_COLOR:''}`→`false`
  - 기존 `\x1b[?25h` 단언과 `frameMs` 테스트는 그대로 둔다.
- [x] **Step 2:** `node --test tests/node/tui-terminal.test.mjs`를 실행해 FAIL을 확인한다.
- [x] **Step 3: 구현**
  - `useAlt = env.TERM !== 'dumb'`로 둔다. 시작할 때 `useAlt`면 대체 화면 시퀀스를 먼저 쓴다.
  - dispose는 `'\x1b[0m\x1b[?2004l\x1b[?25h' + (useAlt ? '\x1b[?1049l' : '')`를 쓴다.
  - `signals.on('exit', onExit)`를 등록한다. `onExit`는 동기 dispose를 호출한다. dispose 안에서 이 리스너를 해제한다.
- [x] **Step 4:** `node --test tests/node/tui-terminal.test.mjs tests/node/tui-terminal-pty.test.mjs tests/node/tui-app-pty.test.mjs tests/node/tui-app.test.mjs`로 PASS를 확인한다. PTY 쪽 dispose 시퀀스 단언은 필요하면 같은 Step에서 갱신한다.
- [x] **Step 5:** `node scripts/update-manifest.mjs && node scripts/update-manifest.mjs --check`

**Commit (Orchestrator):** `feat(tui): 대체 화면 사용과 종료 시 콘솔 복원, session.motion`
**Criteria:** T1. finalReport가 dispose 뒤에 출력되는 순서(`app.mjs`)는 바꾸지 않는다.
**QA(fresh):** 위 4개 파일과 `node --test tests/node/tui-package-consumer.test.mjs`
**Orchestrator 호스트 수동 확인:**
- `arc`에서 다음 종료 경로를 모두 확인한다: Exit, Esc, Ctrl-C, Check Version 업그레이드로 끝난 경우(finalReport가 메인 화면에 남는지).
- `TERM=dumb arc`를 실행한다.

---

### Task D: 메뉴 틱, arrowValue, checklist 힌트, 홈 정리와 Status 메뉴 (T2, T5·T4 기반)

**Files:**
- Modify: `lib/tui/app.mjs` (`home` 11, `menu` 16–35, 홈 루프 78–88)
- Modify: `lib/tui/render.mjs` (`navigationHint`, 신규 export `arrowValue`)
- Modify: `MANIFEST.sha256` (재생성)
- Test: `tests/node/tui-render.test.mjs`, `tests/node/tui-app.test.mjs`, `tests/node/tui-app-pty.test.mjs`

**Predecessors:** C (`session.motion`)

**Interfaces (Produces):**
- `arrowValue(text, frame, active) -> string`
  - `active && frame % 30 >= 27`이면 `' <'+text+'> '`, 그 밖에는 `'< '+text+' >'`
  - 두 형태의 폭은 같다. 주기는 30프레임 × 80ms = 2.4s다.
- `navigationHint('checklist')` → `'↑/↓: Select · Enter Toggle · Esc Home'`
- `ui.menu` 변경
  - `hint` 옵션(`'checklist'`)을 추가한다.
  - `renderBody` state에 `frame`을 추가한다.
  - 틱 조건
    - `animate = wordmark && session.frameMs>0`
    - `pulse = typeof onHorizontal==='function' && session.motion===true`
    - 둘 중 하나라도 참이면 `frameMs`마다 `frame++`한다.
  - `refreshMs` blink는 별도 카운터로 토글한다. motion이 거짓이면 frame은 0으로 고정된다.
- 홈 메뉴 `home=[install 'Install / Update', status 'Status', version 'Check Version', uninstall 'Uninstall', exit 'Exit']`
  - 홈에는 `info`/`infoTones`를 넘기지 않는다.
  - `status`: 기존 info 배열(`homeStatusLine`, `'Mode: '+…`, 진단)과 tones 규칙을 그대로 써서 `ui.menu('Status',[], {backRow:true, info, infoTones})`로 보여 준다.
  - Back이나 Esc를 누르면 홈으로 돌아간다.

- [x] **Step 1: 실패 테스트 작성**
  - `tui-render.test.mjs`
    - `arrowValue('KR',0,true)==='< KR >'`
    - `arrowValue('KR',27,true)===' <KR> '`
    - `arrowValue('KR',27,false)==='< KR >'`
    - `arrowValue('KR',30,true)==='< KR >'`
    - 모든 경우 길이가 같다.
    - `navigationHint('checklist')`가 위 문자열과 정확히 같다.
  - `tui-app.test.mjs`
    - 홈 rows가 위 5개 항목이다. 홈 screen rows에 `Available`/`Mode:`가 없다.
    - Status 화면의 title, rows, rowTones를 단언한다.
    - fake session `{frameMs:80, motion:true}`와 `onHorizontal`이 있으면 틱마다 `frame`이 증가한다.
    - motion이 없으면 `frame===0`이고 추가 render가 없다.
    - 홈에서 `down` 횟수에 의존하는 기존 테스트는 횟수를 1씩 늘린다.
  - `tui-app-pty.test.mjs`
    - 홈 Escape 테스트를 바꾼다: `down` → `enter` 후 `expect -exact {Status}`를 확인하고, Status 화면에서 상태 줄과 `Mode:`를 단언한다.
    - 홈 메뉴 순서를 단언한다.
    - Mode 단언은 `/Mode: +Mixed/`로 완화한다(E에서 다시 갱신).
    - Check Version 경로의 `down` 횟수를 1 늘린다.
- [x] **Step 2:** `node --test tests/node/tui-render.test.mjs tests/node/tui-app.test.mjs tests/node/tui-app-pty.test.mjs`를 실행해 FAIL을 확인한다.
- [x] **Step 3:** 위 Interfaces대로 구현한다.
- [x] **Step 4:** Step 2 명령으로 PASS를 확인한다.
- [x] **Step 5:** `node scripts/update-manifest.mjs && node scripts/update-manifest.mjs --check`

**Commit (Orchestrator):** `feat(tui): 홈 정보 제거와 Status 메뉴, 메뉴 프레임 틱과 arrowValue`
**Criteria:** T2. T5와 T4 힌트의 기반.
**QA(fresh):** 위 3개 파일과 `node --test tests/node/tui-*.test.mjs`
**Orchestrator 호스트 수동 확인:** 홈에 로고와 메뉴만 보이는지, Status 화면 내용, Esc로 홈 복귀

---

### Task E: Install/Update, Hosts, 좌우 컨트롤 적용 (T3, T4, T5)

**Files:**
- Modify: `lib/tui/setup.mjs` (`editInstallSettings` 49–67, `editHosts` 69–86, `runInstallFlow` 138–150)
- Modify: `lib/tui/diagram.mjs` (`diagramRows` 27–51)
- Modify: `lib/tui/custom-preset.mjs` (`editorRows` 201–207과 해당 `renderBody`)
- Modify: `MANIFEST.sha256` (재생성)
- Test: `tests/node/tui-setup.test.mjs`, `tests/node/tui-custom-preset.test.mjs`, `tests/node/tui-render.test.mjs`(`diagramRows` 단언이 있으면), `tests/node/capability-surfaces.test.mjs`(118·233·243), `tests/node/tui-app-pty.test.mjs`, `tests/node/tui-app.test.mjs`(설치 흐름 단언이 있으면)

**Predecessors:** D

**고정값:**
- **T3 Install 화면**
  - info에서 `Hosts:`/`Mode:` 행을 없앤다. 이동 줄과 reason/auth 줄은 남긴다.
  - controls 표시 행은 `Hosts: <Label, Label>` / `Settings` / `Apply  (<plan.modeLabel>)` / `Back`이다.
  - footer/reasonIndex는 줄어든 info 길이를 따라간다.
- **T3 diagram**
  - 선택된 역할 라벨 앞에 `> `를 붙인다. 박스가 보일 때는 `┌─ > Planner ─…┐`, 깜빡여 숨겨졌을 때는 `   > Planner`다.
  - 박스 폭은 선택 여부와 상관없이 `cells(label)+2+4`로 계산해서 커서가 움직여도 바뀌지 않게 한다.
  - compact/guard 모드는 그대로 둔다.
- **T4 Hosts 화면**
  - 제목: `Hosts — CLIs where you start ARC sessions`
  - 기본 info: `Roles' platforms are always included.`
  - locked 행에는 `(used by <Role, Role>)`를 붙인다. 역할 순서는 `installRoleNames`를 따르고, 역할별 플랫폼은 호출부에서 넘긴다.
  - locked 행에서 Enter: info에 `Change those roles' platform to remove <Label>.`를 tone `'diagnostic'`으로 보여 준다.
  - unavailable 행에서 Enter: 사유를 tone `'diagnostic'`으로 강조한다.
  - `ui.menu`에 `{hint:'checklist'}`를 넘긴다.
  - 어떤 Enter도 화면 변화 없이 끝나면 안 된다.
- **T5 좌우 컨트롤**
  - Settings의 Language 행: `arrowValue(languageLabel, state.frame, state.selected===0)`
  - 역할 편집기의 Platform/Model/Effort 행은 40칸 이상일 때 `` `${field} ${arrowValue(text, frame, selected===rowIndex)}` ``로 표시해 기존 `‹ X ›`를 대체한다.
  - 40칸 미만의 `field: text` 표시와 상세 페이저는 바꾸지 않는다.

- [ ] **Step 1: 실패 테스트 작성**
  - `tui-setup.test.mjs`
    - Install 화면 info에 `Hosts:` 행이 없다.
    - controls 행이 `Hosts: Claude, Codex` / `Settings` / `Apply  (Mixed (Claude + Codex))`다.
    - reason이 있으면 Apply에서 Enter 후 selected가 reason 행을 가리킨다.
    - Hosts 화면의 제목, 기본 info, `(used by Planner, QA)`, locked Enter 피드백과 tone, unavailable Enter 사유 강조, 힌트를 단언한다.
    - Settings 행이 frame 0에서는 `< English >`, frame 27이고 선택된 상태에서는 ` <English> `다.
  - `diagramRows` 테스트
    - `selectedRole=1`, `blink=true`면 박스 위 줄에 `┌─ > Planner `가 들어 있다.
    - `blink=false`면 `   > Planner`다.
    - 선택 여부와 상관없이 각 줄 폭이 같다.
  - `tui-custom-preset.test.mjs`: `‹ X ›` 단언을 `Platform < Codex >` 형태로 바꾼다. 40칸 미만에서는 `Platform: Codex`를 유지한다.
  - `capability-surfaces.test.mjs`: 118·243행의 `‹ ›`를 `< >`로 바꾼다. 233행 `! Hosts:` 단언은 새 rows 구조에 맞춘다.
  - `tui-app-pty.test.mjs`
    - `expect -exact {Mode:}`를 `{Apply  (}`로 바꾼다.
    - Mixed 단언을 Install 화면의 `Apply  (Mixed (Claude + Codex))`로 바꾼다.
    - `‹`가 들어간 expect를 `< … >`로 바꾼다.
    - Hosts 제목을 새 제목으로 바꾼다.
    - 펄스 때문에 결과가 흔들리지 않도록 기본형이나 필드명으로 매칭한다. 필요하면 `TERM=dumb`으로 고정한다.
- [ ] **Step 2:** `node --test tests/node/tui-setup.test.mjs tests/node/tui-custom-preset.test.mjs tests/node/tui-render.test.mjs tests/node/capability-surfaces.test.mjs tests/node/tui-app.test.mjs tests/node/tui-app-pty.test.mjs`를 실행해 FAIL을 확인한다.
- [ ] **Step 3:** 위 고정값대로 구현한다.
- [ ] **Step 4:** Step 2 명령으로 PASS를 확인한다.
- [ ] **Step 5:** `node scripts/update-manifest.mjs && node scripts/update-manifest.mjs --check`

**Commit (Orchestrator):** `feat(tui): Install 화면 정리, 도식 '>' 커서, Hosts 피드백, < > 좌우 컨트롤`
**Criteria:** T3, T4, T5.
**QA(fresh):** 위 6개 파일과 `node --test tests/node/tui-*.test.mjs tests/node/capability-surfaces.test.mjs`
**Orchestrator 호스트 수동 확인:**
- 80×24와 120×40에서 Install 화면의 `>` 커서와 박스 폭 불변을 확인한다.
- Hosts 화면에서 Enter 피드백을 확인한다.
- 펄스가 2.4s 주기로 선택된 행에만 나타나는지 확인한다.
- `NO_COLOR=1 arc`와 `TERM=dumb arc`에서 펄스가 없는지 확인한다.

---

### Task F: 결과 문구 직관화 (M1)

**Files:**
- Modify: `lib/tui/app.mjs` (`resultRows` 48–53, `execute` 65)
- Modify: `lib/management/update.mjs` (`report` 16·19, CLI 메시지 65)
- Modify: `lib/management/operations.mjs:142`
- Modify: `MANIFEST.sha256` (재생성)
- Test: 다음 파일 중 영향받는 것
  - `tests/node/tui-app.test.mjs`, `tests/node/tui-app-pty.test.mjs`, `tests/node/tui-package-consumer.test.mjs`
  - `tests/node/management-update.test.mjs`, `tests/node/management-operations.test.mjs`
  - `tests/node/upgrade-cli.test.mjs`, `tests/node/upgrade-harness.test.mjs`, `tests/node/npm-upgrade-consumer.test.mjs`
  - `tests/node/install-mode-n-platform.test.mjs`, `tests/node/composite-instructions.test.mjs`
  - `tests/node/consumer.test.mjs`는 실행해서 영향 여부만 확인한다.

**Predecessors:** E

**고정 문구:**
- **설치(TUI):** `ARC <ver> installed for <Label>.`
  - `resultRows(result, registry, {version}={})`에 선택적 세 번째 인자를 추가한다.
  - `execute`는 `packageVersion`을 넘긴다. 버전이 없으면 `ARC installed for <Label>.`로 출력한다.
- **Mixed:** `Mixed routing on: Claude + Codex.`
  - 플랫폼 정렬과 라벨은 `mixedLabel`과 같은 규칙을 쓴다.
  - 뒤따르는 `After upgrading ARC, run Install / Update again.` 줄은 그대로 둔다.
- **TUI 업데이트 성공:** `ARC updated: ${prepared.currentVersion} → ${prepared.latestVersion}.` finalReport에도 같은 줄을 쓴다.
- **CLI `report()`**
  - `status==='installed'`인 항목: `<Label>: harness updated`
  - 그 밖의 항목: 기존 `platform: status`
  - 성공 시 마지막 줄: `ARC harness updated to ${version}.`
  - `Previous harness version: …` 문장은 없앤다.
- **CLI 교체:** `arc CLI: <prev> → <new>.`
- **유지:** `Harness update did not complete…`, `Error:`, `Residual path:`, `Exit code:`, rollback 제거

- [ ] **Step 1: 실패 테스트 작성**
  - 위 테스트 파일들에서 `ARC installed for X.`, `… activated.`, `Upgraded to …`, `codex: installed`, `harness upgraded!`, `CLI: updated to X (previous Y).` 단언을 새 문구로 바꾼다.
  - 성공 출력에 `Previous harness version`이 없어야 한다는 단언을 추가한다.
- [ ] **Step 2:** `node --test tests/node/tui-app.test.mjs tests/node/management-update.test.mjs tests/node/upgrade-cli.test.mjs tests/node/upgrade-harness.test.mjs tests/node/install-mode-n-platform.test.mjs tests/node/composite-instructions.test.mjs tests/node/management-operations.test.mjs`를 실행해 FAIL을 확인한다.
- [ ] **Step 3:** 위 고정 문구대로 구현한다.
- [ ] **Step 4:** Step 2 명령에 `tests/node/tui-app-pty.test.mjs tests/node/tui-package-consumer.test.mjs tests/node/npm-upgrade-consumer.test.mjs tests/node/consumer.test.mjs`를 더해 PASS를 확인한다. npm/consumer 계열이 샌드박스에서 실행되지 않으면 그 사실을 보고한다. 이 경우 Orchestrator 호스트에서 실행한다.
- [ ] **Step 5:** `node scripts/update-manifest.mjs && node scripts/update-manifest.mjs --check`

**Commit (Orchestrator):** `feat(management): 설치·업데이트 결과 문구에 버전과 대상 명시`
**Criteria:** M1. 결과 객체 구조는 그대로 둔다. 새 세션 안내는 넣지 않는다.
**QA(fresh):**
- 위 전체 파일을 실행한다.
- `rg -n "harness upgraded|Previous harness|Upgraded to| activated\." lib tests` 결과가 0건인지 확인한다.

---

### Task G: 최소 문서 (D1)

**Files:**
- Modify: `docs/harness-operation.md` (Result 표 약 143–150행, Watch 행 약 160·163행, 메뉴 설명 위치가 있으면 Status 한 줄)
- Modify(필요할 때만): `README.md`. 수정했다면 `MANIFEST.sha256`도 재생성한다.

**Predecessors:** F

- [ ] **Step 1:** `rg -n "harness-operation|README" tests`로 문서 문자열을 단언하는 테스트를 찾고, 단언 대상 구절은 바꾸지 않는다.
- [ ] **Step 2: 최소 수정**
  - Result 표에 M1 문구를 반영한다.
  - Watch 행에 `- ` 경로 목록과 하단 경로 줄 / `working…` 구절을 추가한다.
  - Status 메뉴 설명은 한 줄만 쓴다.
- [ ] **Step 3:** `python3 -m pytest tests/test_harness_contract.py -q`와 Step 1에서 찾은 node 테스트로 PASS를 확인한다. README를 바꿨다면 `node scripts/update-manifest.mjs --check`도 실행한다.

**Commit (Orchestrator):** `docs: watch·TUI 개선과 결과 문구 반영`
**Criteria:** D1.
**QA(fresh):** Step 3 테스트를 실행하고, 문서 문구가 구현 문구와 문자열로 일치하는지 대조한다.

---

### 최종 검증 (모든 작업 수락 후)

- Orchestrator가 실행한다.
  - `npm test` 전체: 새 실패가 0건이어야 한다.
  - `node scripts/update-manifest.mjs --check`
  - `python3 -m pytest tests/test_arc_policy.py tests/test_harness_contract.py -q`
- 최종 Reviewer가 base `87f1b1b`..HEAD 전체 변경을 1회 검토한다. 이후 Reviewer 지적은 Implementer → Reviewer로 다시 확인한다.

## Self-review 체크리스트

- [x] 요구사항과 작업 매핑: W1·W2·W3·W4·W7→A, W5·W6→B, T1→C, T2→D, T3·T4·T5→E, M1→F, D1→G. 사용자 결정 반영.
- [x] 기존 동작을 단언하는 테스트를 그 동작을 바꾸는 작업에 배정했다.
- [x] MANIFEST 공유 때문에 전 작업을 직렬로 진행하며, 같은 파일을 동시에 편집하지 않는다.
- [x] 작업 간 인터페이스 이름이 일치한다: `session.motion`, `arrowValue`, `navigationHint('checklist')`, `ui.menu` `hint`/`frame`, `resultRows(..., {version})`.
- [x] 금지된 변경과 애니메이션 비활성 조건, PTY 결정성을 명시했다.
- [ ] 미검증 가정(Implementer 확인 필요): `tui-terminal-pty.test.mjs`의 dispose 단언 형태, `consumer.test.mjs`가 `report()` 경로를 지나는지, `platformLabel` 기본 registry, harness-operation.md에 메뉴 설명 위치가 있는지.

## Revision history

| Version | Approval time | Classification | Affected tasks | Reason |
|---|---|---|---|---|
| v1 | 2026-11-17 (사용자 승인, 계획 승인 질문) | initial | A–G | 최초 승인 |
| v2 | 2026-11-17T00:58:53Z | contract | A | 사용자 정정: 파일 경로가 1개면 '- ' 미부착 (W1) |
| v3 | 2026-11-17T01:11:22Z | contract | A | 사용자 보완: 역할 뱃지 라벨 앞뒤 공백(배경 안), 이후 Task A 커밋 amend 지시 |
| v4 | 2026-11-17T01:28:02Z | contract | A (follow-up) | 사용자 보완: TOOL 색이 너무 밝고 CODEX와 비슷함 → 저채도 38;5;101 |
