# TUI 시각 개선과 선택 항목 간격 통일 Implementation Plan

> ARC Orchestrator가 top-level task 단위로 조정한다. 단계는 체크박스(`- [ ]`)로 추적한다. Implementer/QA는 Codex bridge 자식 프로세스(샌드박스)로 실행되며 Git 상태를 바꾸지 않는다. 각 task는 수락 후 Orchestrator가 focused commit 하나로 남긴다. 전체 스위트·PTY 테스트·수동 PTY 캡처는 Orchestrator가 실행한다.

**Goal:** `arc` TUI에 입체 그림자형 로고와 민트→에메랄드 그라데이션·shimmer, 전반 색 체계, 홈 상태 의미 색, busy 스피너를 넣고, 선택 항목 간격 규칙을 전 화면에 통일한다. `arc watch` 본문 색을 KIND 태그 색과 맞춘다.

**Architecture:** 렌더러(`lib/tui/render.mjs`)는 순수 함수로 화면 텍스트와 줄별 색 run 메타데이터(`styles`)만 반환하고, ANSI는 `lib/tui/terminal.mjs`만 만든다. 애니메이션은 `screen.frame` 정수로 결정되며 `menu()`/`busy()`가 타이머로 frame을 올리고 입력을 버리지 않는 `session.repaint()`로 다시 그린다. watch는 독립 모듈(`lib/watch/render.mjs`)에서 본문 색만 바꾼다.

**Tech Stack:** Node.js ESM, `node:test`, 외부 의존성 없음.

**Spec:** 승인된 short design(채팅, 2026-11-12, §1–§11 + (g) C6, Q1–Q7 결정). 문서로 저장하지 않았으므로 필요한 값은 아래 Global Constraints와 각 task에 옮겨 적었다.

**Approval:** 설계 승인 2026-11-12(사용자 선택 "승인, 계획서 작성 진행"). 계획 승인은 사용자가 Orchestrator에게 위임("나 대신 승인하고 진행해", 2026-11-12)하여 Orchestrator가 검토 후 승인.

**개정 A1 (2026-11-12, T2 실행 중, Orchestrator가 위임 권한으로 승인):** T2 구현 후 전체 스위트에서 PTY 테스트 4건이 시간 초과했다. 원인은 비홈 화면 truecolor 프레임이 약 500B에서 1.1KB로 커진 것이다. 출력 예산 제약과 테스트를 추가하고, 푸터 구분선 12밴드 그라데이션과 선택 행 패딩 칸별 그라데이션을 각각 단일 run으로 바꿨다. 영향 task: T2(T3은 이 예산을 유지해야 한다). 개정 전 내용은 원래 계획 커밋 940e19c에 남아 있다.

## Global Constraints

- 작업 위치: `/Users/ma-24-007/Desktop/workspace/arc/.claude/worktrees/tui-visual-polish`, 브랜치 `feat/tui-visual-polish`, 기준 HEAD `99ba7ce`.
- 보안 규칙 "Only terminal.mjs emits terminal commands" 유지. 화면 데이터는 항상 `escapeTerminalText`를 거친다. 색 값은 고정 상수에서만 나오고 terminal.mjs가 0..255 정수로 정제한다.
- PTY 기대 문자열이 SGR로 쪼개지면 안 된다: `> <label>`(선택 행), 힌트 구간(`Esc Home`, `Esc Exit`, `Type/Paste Input`), 제목(`Working`, `Settings — Codex` 등), 본문 행.
- 비홈 화면의 행 수를 바꾸지 않는다(제목 아래 줄 추가 금지).
- 간격 규칙
  - R1: 선택 가능한 행(Back 포함)은 빈 줄 없이 붙인다.
  - R2: 본문(info, 상세, 다이어그램, `←/→: Details n/m`)과 첫 선택 행 사이에 빈 줄을 정확히 하나 둔다.
  - R3: 본문이 없으면 제목 바로 아래에 선택 행이 온다.
  - R4: 선택 블록과 푸터 사이의 `''`, text 모드 `[value,'','Save','Back','']`는 유지한다.
- 팔레트 STOPS: `[178,245,214]`, `[110,231,183]`, `[52,211,153]`, `[16,185,129]`. 3구간 선형 보간, 채널마다 `Math.round`.
- `PANEL=38`. `frameMs=80`(TERM=dumb이면 0). shimmer `CYCLE=36`, `SWEEP=18` → 1.44s 띠, 1.44s 휴식을 계속 반복. 모션 끄기 env 없음.
- 색 등급: `none`(NO_COLOR 정의 또는 TERM=dumb), `truecolor`(현행 조건, terminal.mjs:17), `256`(`/256color/i.test(TERM)` 또는 `getColorDepth()>=8`), `16`(그 밖).
- 저장소 코드·문서·라벨·테스트 이름은 영어. lib/tui와 lib/watch는 `baselineHash` 대상이 아니다(runtime-versions.test.mjs:20-36).
- `MANIFEST.sha256`에 lib/tui와 lib/watch가 포함된다. task마다 `node scripts/update-manifest.mjs`로 재생성하고 `node scripts/update-manifest.mjs --check`로 확인한다.
- 출력 예산(개정 A1): 터미널이 출력을 읽지 않는 동안 큰 프레임 쓰기가 막히면 그 사이 도착한 키가 한 덩어리로 읽혀 다음 render의 `discardInput`에 버려진다(PTY 테스트 4건 시간 초과로 확인). 그래서 비홈 화면 truecolor 프레임은 칸별 SGR을 쓰지 않는다: 푸터 구분선과 선택 행 패딩은 각각 run 하나다. 120열 Uninstall 화면(행 4개, 선택 1개) truecolor 출력 합계는 800바이트 미만을 유지한다.
- 테스트 명령: `node --test --test-timeout=120000 <files>`.
- 베이스라인: HEAD `99ba7ce`에서 1833개 중 55개 실패(목록은 Orchestrator 보관). 판정은 "새 실패 없음". 범위 안의 베이스라인 실패 `custom editor keeps long model choices selectable at 40 columns`, `management status and TUI home use refreshed Codex authentication without exposing credentials`는 고치지 않아도 되지만 실패 내용이 달라지면 보고한다.
- 역할 경계: Implementer는 지정된 집중 테스트와 manifest 재생성만 실행. QA는 집중 테스트 재실행과 증거 작성. Orchestrator는 전체 스위트, PTY 테스트(`tests/node/*-pty.test.mjs`), 수동 PTY 캡처, 커밋.
- 실행 순서: T1 → T2 → T5 → T3 → T4. T4는 논리적으로 독립이지만 `MANIFEST.sha256`을 공유하므로 다른 task와 동시에 진행하지 않는다.

## Review Focus

1. 애니메이션 프레임 순간의 ESC·나뉜 화살표 키 유실 없음 — T3 `repaint keeps a pending lone Escape and split arrows`.
2. 좁거나 낮은 터미널에서 축약 머리말과 같은 판정의 capacity로 Exit 선택·실행 가능 — T2 `home capacity follows wordmarkRows in a 17-row terminal`.
3. NO_COLOR·TERM=dumb에서 SGR 없음, dumb에서 타이머 없음 — T2 `color disable emits no SGR on any styled screen`, T5 `status tones vanish without color`, T3 `frameMs is 80 unless TERM is dumb`.
4. truecolor에서도 PTY 기대 문자열 연속 — T2 `selected label, hint segments and titles stay contiguous`.
5. busy 종료·dispose 뒤 스피너 출력 없음 — T3 `busy spinner stops before leaving busy`, `repaint after dispose is a no-op`.

## 파일과 task별 수정

| 파일 | T1 | T2 | T5 | T3 | T4 |
|---|---|---|---|---|---|
| `lib/tui/app.mjs` | `menu()` 간격, `separatorBefore` 제거 | capacity에 `wordmarkRows` | `infoTones`/`rowTones` | 틱, busy 스피너 | — |
| `lib/tui/custom-preset.mjs` | 56-57, 97, 103, 139, 152, 175 | — | — | — | — |
| `lib/tui/setup.mjs` | 52(`separatorBefore` 제거) | 22: `cells` → `cellWidth` | — | — | — |
| `lib/tui/render.mjs` | — | 로고, 팔레트, runs, width, 축약 머리말 | 상태 tone runs | frame, shimmer, 스피너 | — |
| `lib/tui/terminal.mjs` | — | 색 등급, `formatLine`, `toAnsi256` | — | `repaint`, `frameMs`, dedupe, 2026 | — |
| `lib/watch/render.mjs` | — | — | — | — | `bodyColor`, TOOL `2`, 줄별 칠하기 |
| `docs/harness-operation.md` | — | — | — | — | 88, 95행 |
| `MANIFEST.sha256` | 재생성 | 재생성 | 재생성 | 재생성 | 재생성 |

---

### Task T1: 선택 항목 간격 규칙 통일 (C4, AC4)

**Files:**
- Modify: `lib/tui/app.mjs:14-22`, `lib/tui/setup.mjs:52`, `lib/tui/custom-preset.mjs:56-57,95-103,139,152,175`, `MANIFEST.sha256`
- Test: `tests/node/tui-app.test.mjs`, `tests/node/tui-setup.test.mjs`, `tests/node/tui-custom-preset.test.mjs`

**Interfaces:** `menu(title, rows, {selected, info, backRow, backLabel, wordmark, version, renderBody, onHorizontal, refreshMs})` — `separatorBefore` 제거. 선택 인덱스 반환 규칙은 그대로(Back은 `null`).

**Predecessors:** 없음.

- [x] **Step 1: 실패하는 테스트 작성과 기존 단언 갱신**
  - 신규 `menu keeps actions adjacent and separates info by one blank` (tui-app): `menu('Check',['Upgrade'],{backRow:true,info:['1.9.0 → 1.10.0']})`를 `[down, enter]`로 진행하면 `null`. 첫 화면 rows `['1.9.0 → 1.10.0','','Upgrade','Back']`, `selected===2`; 마지막 화면 `selected===3`. `info:['A','']`이면 rows `['A','','One']`(빈 줄 중복 없음). info가 없으면 `['One','Back']`.
  - 기존 갱신 (tui-app): 14 → `['Details','','One']`; 98 → 위 신규 테스트로 대체(`separatorBefore` 테스트 삭제); 100 → `separatorBefore:1` 인자 제거(rows 2에서 숨김·차단 단언 유지); 101 → `['1.9.0 → 1.10.0','','Upgrade','Back']`; 120 → 이름 `common Back follows the last action without a spacer`, `['One','Two','Back']`; 124 → `['Codex','Claude','Everything (incl. CLI)','Back']`; 125 → `['Remove ARC from Codex and Claude, and the arc CLI?','','Remove','Back']`; 217 → Upgrade 케이스 `['1.9.0 → 1.10.0','','Upgrade','Back']`(나머지 세 케이스 유지).
  - tui-setup.test.mjs:158 → `assert.equal(options.separatorBefore,undefined)`.
  - 신규 (tui-custom-preset):
    - `compact detail menu puts one blank after the pager row and none before Back`: Model 메뉴 `renderBody({selected:0,columns:60,rows:20})`(compactMenu 경로)에서 `rows[rows.indexOf(pagerRow)+1]===''`, `rows.at(-1)==='Back'`, `rows.at(-2)!==''`. `selected:rows.length`면 `body.rows[body.selected]==='Back'`.
    - `full model menu has no blank before Back`: `renderBody({selected:rows.length,columns:120,rows:40})`에서 `body.rows[body.selected]==='Back'`이고 바로 앞 행이 `''`가 아님.
    - `compact editor summary keeps role rows adjacent to controls`: `editPlatformRoles`의 `renderBody({selected:5,blink:true,columns:60,rows:20})` 결과에 `''` 없음, `rows[selected]==='Apply'`, `rows.at(-1)==='Back'`.
- [x] **Step 2: 실패 확인** — `node --test --test-timeout=120000 tests/node/tui-app.test.mjs tests/node/tui-setup.test.mjs tests/node/tui-custom-preset.test.mjs`. 신규·갱신 단언 FAIL, 베이스라인 실패(129행)는 이전과 같음.
- [x] **Step 3: 구현**
  - `app.mjs` `menu()`: `display=actions`, `displayIndex=selected`. Back/`separatorBefore`용 `''` 삽입 제거. info는 끝의 `''`를 모두 제거한 뒤 남은 행이 있으면 `''` 하나를 붙인다(20행 wordmark 전용 조건 대체).
  - `setup.mjs:52` `separatorBefore:4` 삭제; `custom-preset.mjs:152,175` `separatorBefore: labels.length` 삭제.
  - compactMenu: rows `[...information, pager, '', ...visible, 'Back']`; selected는 항목 `information.length + 2 + selected - offset`, Back `information.length + 2 + visible.length`.
  - `custom-preset.mjs:97` `display.push('')` 삭제; 103행 `rows.length + 2` → `rows.length + 1`.
  - `custom-preset.mjs:139` `[...summary, ...controls, 'Back']`, `selected: selected`. 141행 다이어그램 모드 유지.
- [x] **Step 4: 통과 확인** — Step 2 명령. 베이스라인 외 실패 0.
- [x] **Step 5: manifest** — `node scripts/update-manifest.mjs` 후 `--check` → `Protected payload manifest verified`.
- [x] **Step 6: 수락 전 확인 (Orchestrator)** — 별도 QA 없음. 집중 테스트 출력과 diff 범위 확인, 전체 스위트와 `tests/node/tui-app-pty.test.mjs` 실행. 커밋 `fix(tui): unify action spacing`.

**Hold:** PTY 기대 문자열 실패; Step 1 목록 밖 테스트의 새 실패; `separatorBefore`를 다른 호출부가 쓰는 경우.

**Result (2026-11-12, 진행 기록):** 집중 테스트 127 통과 / 1 실패(베이스라인 `custom editor keeps long model choices selectable at 40 columns`, 내용 불변). 전체 스위트 1836개 중 51 실패, 베이스라인 대비 새 실패 0(4건 추가 통과). manifest 재생성 시 기준 커밋에서 이미 어긋나 있던 `scripts/deploy.sh` 해시도 갱신됨(파일 자체 변경 없음). Orchestrator 수락.

---

### Task T2: 시각 체계 — 로고, 팔레트, 색 run, 색 등급 (C1, C3, C5, AC1, AC3, AC5)

**Files:**
- Modify: `lib/tui/render.mjs`, `lib/tui/terminal.mjs:16-17,40-55`, `lib/tui/app.mjs:21`, `lib/tui/setup.mjs:22`, `MANIFEST.sha256`
- Test: `tests/node/tui-render.test.mjs`, `tests/node/tui-terminal.test.mjs`, `tests/node/tui-app.test.mjs`

**Interfaces:**
- render.mjs
  - `cellWidth(character): 0|1|2` — 1칸 정규식 `/[←-↓─-▟✦✧⠀-⣿]/`, 결합 문자 0, `>=0x1100`은 2. setup.mjs `cells`도 이 함수를 쓴다.
  - `wordmarkRows({columns, rows}): 8|2` — `columns-1 >= 24 && rows >= 18`이면 8.
  - `gradientAt(t): [r,g,b]` — t를 0..1로 clamp 후 STOPS 보간.
  - `renderScreen(screen, {columns, rows})` → `{text, selectionEnabled, styles}`. `styles: Array<{line, runs: Array<{from, to, role, fg?, bg?, bold?}>}>`, 한 줄에 entry 하나, `from`/`to`는 보이는 줄의 code point 인덱스(반열림), run은 겹치지 않고 정렬. role: `logo|shadow|sparkle|tagline|version|rule|title|spinner|selected|selectedPad|hint|hintSep|position|ok|muted|error|warn`.
- terminal.mjs
  - `toAnsi256([r,g,b])` = `16+36*round(r/51)+6*round(g/51)+round(b/51)`.
  - `formatLine(line, style, depth)` — run마다 `\x1b[0;<params>m`을 앞에 붙이고, 칠하지 않는 문자가 오거나 줄이 끝나면 `\x1b[0m`. params 순서: `1`(bold), 전경 `38;2;r;g;b`/`38;5;N`, 배경 `48;2;…`/`48;5;N`. `16`은 `BASIC[role]`: logo `92`, shadow `32`, sparkle `92`, tagline `32`, version `32`, rule `32`, title `1;92`, spinner `32`, selected `42;30`, selectedPad `42`, hint `2`, hintSep `2`, position `2`, ok `32`, muted `2`, error `31`, warn `33`. `none`은 원문 반환. rgb는 채널마다 `Math.max(0,Math.min(255,Math.round(Number(v)||0)))`. 모르는 role run은 무시.
- Consumes: T1의 `menu()`.

**Predecessors:** T1.

- [x] **Step 1: 실패하는 테스트 작성과 기존 단언 갱신**
  - tui-render
    - `home heading renders the six-row shadow logo, tagline and 38-column rule`: `renderScreen({title:'ARC',wordmark:true,version:'0.3.0',rows:['Install / Update'],selected:0})` 줄 0-5가 아래 배열(각 폭 24), 줄 6 `' ✦ agent role coordination   ver 0.3.0'`, 줄 7 `'─'.repeat(38)`, 출력에 `\x1b` 없음.
      `[' █████╗ ██████╗  ██████╗','██╔══██╗██╔══██╗██╔════╝','███████║██████╔╝██║     ','██╔══██║██╔══██╗██║     ','██║  ██║██║  ██║╚██████╗','╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝']`
    - `tagline falls back to version only, then clips`: columns 31 → 줄 6 `' ✦ ver 0.3.0'`; version 없음·columns 27 → `' ✦ agent role coordination'`을 26칸으로 `fit`.
    - `narrow or short viewport uses the two-row compact heading`: `wordmarkRows({columns:80,rows:24})===8`, `({columns:24,rows:24})===2`, `({columns:80,rows:17})===2`; columns 24에서 줄 0 `'ARC ✦ ver 0.3.0'`, 줄 1은 `─`만.
    - `cellWidth counts box drawing, sparkle and braille as one column`: `'═','✦','⠋','─','█'` → 1, `'Ａ'` → 2.
    - `gradient stops are pinned`: `gradientAt(0)`, `(1/3)`, `(2/3)`, `(1)`이 STOPS 네 값.
    - `logo runs color filled and shadow cells only`: 줄 0-5 run은 공백이 아닌 문자만 덮음. `█`는 role `logo`, fg `gradientAt((col+0.75*row)/26.75)`; 나머지는 role `shadow`, fg는 그 값×0.55 반올림.
    - `selected row is one contiguous run with a padded tail`: 첫 run `{from:0,to:[...'> Configure'].length,role:'selected',fg:[236,253,245],bg:[6,95,70],bold:true}`; 뒤 `selectedPad` run 하나가 `PANEL`까지, bg `[9,70,53]`(개정 A1).
    - `hint segments and separators are separate runs`: `' · '`는 `hintSep` fg `[70,95,85]`, 구간은 `hint` fg `[150,170,160]`.
    - `title uses a bold mint run on inner screens`: `{role:'title',fg:[110,231,183],bold:true}`가 제목 전체.
    - `rules use the pinned gradients`: 홈 구분선 n=38, i<0.75n이면 `gradientAt(i/(n-1))`, 이후 `[24,52,42]` 쪽으로 `(i-0.75n)/(0.25n)` 비율 혼합. 푸터: run 하나, role `rule`, fg `[36,140,106]`(개정 A1).
    - `inner truecolor frames stay within the PTY output budget`(개정 A1): `renderScreen({title:'Uninstall',rows:['Codex','Claude','Everything (incl. CLI)','Back'],selected:2},{columns:120,rows:40})`의 각 줄을 `formatLine(…,'truecolor')`로 만든 바이트 합계가 800 미만.
    - position 줄: role `position`, fg `[110,130,120]`.
    - 기존: 18-23 새 로고·`lines.length<=16`; 29-33 구분선 인덱스 7·길이 38; 35-38 줄 수 17; 40-54 logo run·축약 머리말 테스트로 대체; 56-61 유지.
  - tui-terminal
    - `truecolor emits run colors and resets after each run`: `\x1b[0;1;38;2;236;253;245;48;2;6;95;70m> Configure` 포함, `\x1b[2K  Update\n` 포함.
    - `selected label, hint segments and titles stay contiguous`: `{title:'Check Version',rows:['Upgrade','Back'],selected:0}` truecolor 출력에 `> Upgrade`, `Esc Home`, `Check Version`이 원문 그대로.
    - `256-color terminals use 38;5 indexes`(73, 96-98 대체): `{TERM:'xterm-256color'}` → `/\x1b\[0;[0-9;]*38;5;\d+m█/` 매치, `38;2` 없음.
    - `basic terminals keep bright green logo`(85-88 basic 대체): `{TERM:'xterm'}` → `\x1b[0;92m█` 포함, `38;2`/`38;5` 없음.
    - `color disable emits no SGR on any styled screen`(85-88 plain, 99-101 확장): NO_COLOR·dumb에서 홈/내부/busy 모두 dispose 리셋 외 `/\x1b\[[0-9;]*m/` 없음.
    - `toAnsi256 maps the cube`: `[0,0,0]`→16, `[255,255,255]`→231, `[16,185,129]`→43.
    - `formatLine clamps colors and ignores unknown roles`: `formatLine('ab',{line:0,runs:[{from:0,to:1,role:'logo',fg:[300,-5,12.6]},{from:1,to:2,role:'bogus',fg:[1,2,3]}]},'truecolor')` === `'\x1b[0;38;2;255;0;13ma\x1b[0mb'`.
    - 78-83, 90-95: 새 팔레트로 재작성(Ghostty/cmux에서 모든 `█`가 `38;2`, 공백에는 SGR 없음).
  - tui-app `home capacity follows wordmarkRows in a 17-row terminal`: session.render가 `renderScreen(s,{columns:80,rows:17})`를 반환, `down`×4와 `enter` → 반환 4, 마지막 render `selectionEnabled===true`.
- [x] **Step 2: 실패 확인** — `node --test --test-timeout=120000 tests/node/tui-render.test.mjs tests/node/tui-terminal.test.mjs tests/node/tui-app.test.mjs`.
- [x] **Step 3: 구현**
  - render.mjs: wordmark 상수, 태그라인·fallback, `PANEL`, 축약 머리말, run 생성. `width` → `cellWidth`. 선택 행 패딩 34 → `PANEL`. 축약 머리말 `ARC` fg는 `gradientAt(0)`, `(0.5)`, `(1)`. `✦` 정적 fg `mix([110,231,183],[240,255,248],0.25)`, 태그라인 문구 `[134,176,158]`, `ver X` `[52,211,153]`.
  - terminal.mjs: `colorDepth` 판정, `draw()`는 줄마다 `formatLine(line, styles.find(s=>s.line===index), depth)`.
  - app.mjs:21 `(wordmark?6:1)` → `(wordmark?wordmarkRows(viewport):1)`.
- [x] **Step 4: 통과 확인** — Step 2 명령과 `node --test --test-timeout=120000 tests/node/tui-setup.test.mjs tests/node/tui-custom-preset.test.mjs`. 베이스라인 외 실패 0.
- [x] **Step 5: manifest** — T1과 같음.
- [x] **Step 6: 수락 전 확인** — **fresh QA 필수**: Step 2·4 재실행, PTY 문자열 연속성 점검, `formatLine` 출력 샘플(truecolor/256/16/none). Orchestrator: 전체 스위트, PTY 테스트, 수동 PTY 캡처(120x40 truecolor 홈·Check Version, 80x24 `xterm-256color`, NO_COLOR, 30x12). 커밋 `feat(tui): shadow logo and gradient styling`.

**Hold:** PTY 기대 문자열 실패; 비홈 화면 행 수 변화; `formatLine` 밖에서 ANSI 생성.

**Result (2026-11-12, 진행 기록):** 첫 구현 후 전체 스위트에서 PTY 4건 시간 초과 → 개정 A1(출력 예산) 승인, 같은 Implementer가 수정(내부 화면 truecolor 1,121B → 681B). fresh QA: AC1·AC3-T2 입증, 깊이별 프로브·비홈 행 수 비교(20회) 입증(재확인 세그먼트). 집중 테스트 118/119 + 64/64(베이스라인 1건 불변). 전체 스위트 1847개 중 51 실패, 베이스라인 대비 새 실패 0(PTY 포함). 계획 커밋 재작성 매핑: 940e19c→b383454, 593a190→a9f419b. Orchestrator 수락.

---

### Task T5: 홈 상태 의미 색 (Q4, AC3)

**Files:**
- Modify: `lib/tui/app.mjs:14-22,73`, `lib/tui/render.mjs`, `MANIFEST.sha256`
- Test: `tests/node/tui-render.test.mjs`, `tests/node/tui-app.test.mjs`, `tests/node/tui-terminal.test.mjs`

**Interfaces:**
- Consumes: T2 run 스키마, `formatLine` BASIC(`ok`, `muted`, `error`, `warn`).
- render.mjs `STATUS_TONES = Object.freeze({'Available':'ok','Not Available':'muted','Unauthorized':'error','Incomplete':'warn'})`, 표에 없는 상태는 `warn`. tone fg: ok `[52,211,153]`, muted `[128,128,128]`, error `[248,113,113]`, warn `[251,191,36]`.
- `screen.rowTones?: Array<'status'|'diagnostic'|'diagnostic-cont'|undefined>` — `screen.rows`와 인덱스 정렬.
- `menu()` 옵션 `infoTones?: Array<'status'|'diagnostic'|undefined>` — 배열 info와 짝.

**Predecessors:** T2.

**결정 근거:** Incomplete·unverified·알 수 없는 상태는 warn(조치 필요, 실패 아님). 진단 줄(`<Label>: <message>`)과 인증 reason 줄은 메시지 부분만 warn. 합성 줄 `Claude & Codex: Available`은 일반 `Label: State` 문법으로 ok.

- [x] **Step 1: 실패하는 테스트**
  - tui-render `status tones color only state words`: `renderScreen({title:'ARC',wordmark:true,version:'0.3.0',rows:['Claude: Available / Codex: Not Available','Codex: boom','','Install / Update'],rowTones:['status','diagnostic',undefined,undefined],selected:3})` → `Available`/`Not Available`/`boom` 위치에 `ok`/`muted`/`warn` run(행 앞 `'  '`로 오프셋 +2), 라벨에는 run 없음. `Claude & Codex: Available` ok, `Unauthorized` error, `Incomplete`·`weird` warn.
  - tui-render `wrapped diagnostic continuation is fully warned`: `'diagnostic-cont'` 행은 `from:2`부터 줄 끝까지 run 하나.
  - tui-app `home passes status and diagnostic tones without changing row text`: 211-213행 composite/authenticated 케이스 재사용, `screens[0].rows[0]==='Claude & Codex: Available'`, `rowTones[0]==='status'`, `'Claude: diagnostic'` 행 tone `'diagnostic'`, 빈 줄·메뉴 항목 tone `undefined`.
  - tui-app `wrapped info keeps tones per display line`: columns 30에서 긴 진단은 첫 줄 `'diagnostic'`, 나머지 `'diagnostic-cont'`.
  - tui-terminal `status tones vanish without color`: NO_COLOR 출력에 SGR 없음; 16색에서 `\x1b[0;32mAvailable`, `\x1b[0;2mNot Available`.
- [x] **Step 2: 실패 확인** — `node --test --test-timeout=120000 tests/node/tui-render.test.mjs tests/node/tui-app.test.mjs tests/node/tui-terminal.test.mjs`.
- [x] **Step 3: 구현**
  - app.mjs:73: info와 함께 `infoTones`(상태 줄 `'status'`, 진단·인증 reason 줄 `'diagnostic'`).
  - `menu()`: info 행을 하나씩 `wrapDetailRows([row], columns)`로 감싸 행별 tone 생성(첫 줄 원래 tone, `diagnostic` 이어지는 줄 `diagnostic-cont`, `status` 이어지는 줄 `status`). `rowTones`는 `screen.rows` 인덱스와 맞춘다. `renderBody`가 본문을 대체하면 넘기지 않는다.
  - render.mjs: `status`는 보이는 줄을 `' / '`로 나눠 `^(.+?): (.+)$` 구간의 상태 부분에 run; `diagnostic`은 첫 `': '` 다음부터 줄 끝까지 warn; `diagnostic-cont`는 앞 `'  '` 제외 줄 전체 warn.
- [x] **Step 4: 통과 확인** — Step 2 명령. 베이스라인 외 실패 0, `management-status` 베이스라인 실패 내용 불변.
- [x] **Step 5: manifest** — T1과 같음.
- [x] **Step 6: 수락 전 확인** — QA 없음. Orchestrator가 집중 테스트, 전체 스위트, 120x40 truecolor 홈 캡처(상태 색) 확인. 커밋 `feat(tui): semantic home status colors`.

**Hold:** 홈 rows 텍스트 변경(기존 181-188, 211-213 실패); tone 메타데이터가 비홈 화면에 샘.

**Result (2026-11-12, 진행 기록):** 집중 테스트 123/124(베이스라인 1건 불변), 신규 5건과 A1 출력 예산 통과. 줄바꿈 테스트 기대값을 27칸 규칙에 맞게 정정(Implementer 보고). 전체 스위트 1852개 중 51 실패, 베이스라인 대비 새 실패 0(`management status ...`는 통과). Orchestrator 수락.

---

### Task T3: 애니메이션 — shimmer, busy 스피너, 입력 보존 repaint (C2, C5, AC2, AC5)

**Files:**
- Modify: `lib/tui/terminal.mjs:40-57,80`, `lib/tui/render.mjs`, `lib/tui/app.mjs:14-27,38`, `MANIFEST.sha256`
- Test: `tests/node/tui-terminal.test.mjs`, `tests/node/tui-render.test.mjs`, `tests/node/tui-app.test.mjs`

**Interfaces:**
- Consumes: T2 run 스키마, `gradientAt`, `formatLine`.
- session `repaint(screen): {selectionEnabled, text}` — 입력을 버리지 않음, disposed면 `{selectionEnabled:false,text:''}`.
- session `frameMs: number`(80 또는 0).
- render.mjs `shimmerIntensity(column, row, frame)`: `f=frame%36`, `f>=18`이면 0; 아니면 `c=-4+f*33.5/17`, `p=column+0.5*row`, `max(0,1-|p-c|/3)**2`.
- `screen.frame?: number`(미지정은 0). 스피너 프레임 `'⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'`.

**Predecessors:** T2, T5(app.mjs `menu()` 충돌 최소화).

- [ ] **Step 1: 실패하는 테스트**
  - tui-terminal
    - `repaint keeps a pending lone Escape and split arrows`: `io.send('\x1b')` 직후 `io.session.repaint(screen)` → 다음 `nextEvent`는 `escape`. `io.send('\x1b[')`, repaint, `io.send('B')` → `down`.
    - `repaint skips identical frames and resize forces a redraw`: render 후 같은 screen repaint는 출력 길이 불변; truecolor `{...home,frame:9}` repaint는 출력 증가; `io.resize(100,30)` 뒤 같은 screen repaint는 출력 증가.
    - `frames are wrapped in synchronized output`: render 출력에 `\x1b[?2026h`·`\x1b[?2026l`, `\x1b[2K` 줄 쓰기가 그 사이.
    - `frameMs is 80 unless TERM is dumb`: 기본 80, `{TERM:'dumb'}` 0, `{NO_COLOR:''}` 80.
    - `repaint after dispose is a no-op`: dispose 뒤 repaint해도 출력 불변.
  - tui-render
    - `frame 0 equals no frame and rest frames equal frame 0`: 홈 결과가 frame 미지정/0/18/35/36에서 deepEqual.
    - `shimmer changes colors but never text`: frame 9는 text가 frame 0과 같고 styles는 다름. `shimmerIntensity(13,1,9)>0.8`, `shimmerIntensity(0,0,9)===0`, `shimmerIntensity(13,1,0)===0`. `█` fg `mix(base,[240,255,248],0.7*i)`, shadow fg `mix(shadowBase,[150,230,200],0.5*i)`, `✦` fg `mix([110,231,183],[240,255,248],0.25*(1+Math.sin(2*Math.PI*f/36)))`.
    - `busy heading shows the braille spinner frame`: `renderScreen({title:'Working',mode:'busy',rows:[],frame:3})` 줄 0 `'⠸ Working'`, `⠸`는 role `spinner` fg `[52,211,153]`, `Working`은 title run.
  - tui-app
    - `home ticks repaint with increasing frames and one pending read`: fake session `frameMs:15`, `repaint` 기록, `nextEvent`는 미해결 Promise 하나. 60ms 뒤 repaint ≥3, frame 1,2,3… 증가, render 1회, `reads===1`. enter resolve 후 반환, 35ms 동안 추가 repaint 없음.
    - `menu without frameMs never ticks on home`: frameMs 없는 세션의 wordmark 메뉴는 40ms 동안 render 1회.
    - `busy spinner stops before leaving busy`: fake session `frameMs:10`, `setBusy`·`repaint` 순서 기록, action 40ms 대기. repaint ≥2, 모든 repaint가 `setBusy(false)`보다 앞, 반환 뒤 30ms 동안 repaint 0.
    - 149, 155, 214 기존 테스트 통과 유지.
- [ ] **Step 2: 실패 확인** — `node --test --test-timeout=120000 tests/node/tui-terminal.test.mjs tests/node/tui-render.test.mjs tests/node/tui-app.test.mjs`.
- [ ] **Step 3: 구현**
  - terminal.mjs: `draw()`는 프레임 문자열 전체(커서 이동 포함)를 `\x1b[?2026h…\x1b[?2026l`로 감싸 `output.write` 한 번. `repaint`는 `discardInput` 없이 draw하되 직전 프레임 문자열과 `lastLines`가 같으면 쓰지 않음. `render()`는 현행대로 입력을 버리고 항상 씀. `onResize`는 프레임 캐시를 비움.
  - app.mjs `menu()`: `animate = wordmark && session.frameMs > 0`; 틱 주기 `animate ? session.frameMs : refreshMs`; 틱마다 animate면 `frame++`, 아니면 `blink=!blink`; 틱 재렌더 `(session.repaint ?? session.render).call(session, screen)`, 입력 이벤트 뒤 재렌더는 `session.render`; `screen.frame=frame`.
  - app.mjs `busy()`: 첫 render 뒤 `frameMs>0`이면 `setInterval`로 `frame++`·repaint. `finally` 첫 문장은 `clearInterval`.
  - render.mjs: logo/shadow/sparkle fg에 shimmer, busy 머리말에 스피너.
- [ ] **Step 4: 통과 확인** — Step 2 명령과 `tests/node/tui-setup.test.mjs`, `tests/node/tui-custom-preset.test.mjs`. 베이스라인 외 실패 0.
- [ ] **Step 5: manifest** — T1과 같음.
- [ ] **Step 6: 수락 전 확인** — **fresh QA 필수**: Step 2·4 재실행, 입력 보존 시나리오(ESC, 나뉜 화살표, busy 중 Ctrl+C) 증거, 타이머 누수 없음(테스트 종료 시 활성 handle 없음, `--test-timeout` 내 종료). Orchestrator: 전체 스위트와 PTY 테스트(cli-pty 베이스라인 실패 3건 불변), 수동 PTY 캡처(120x40 truecolor 홈 shimmer 2사이클 약 6s·휴식 구간 출력 없음, Working 스피너, 홈 ESC 연속 입력, 30x12, TERM=dumb). 커밋 `feat(tui): logo shimmer and busy spinner`.

**Hold:** ESC·키 유실 재현; busy 종료 뒤 출력 잔존; PTY 테스트 시간 초과(출력량 조사).

---

### Task T4: `arc watch` 본문 색을 KIND 태그와 맞추기 (C6, AC7)

**Files:**
- Modify: `lib/watch/render.mjs:6-10,49-57`, `docs/harness-operation.md:88,95`, `MANIFEST.sha256`
- Test: `tests/node/watch-render.test.mjs`, `tests/node/watch-cli.test.mjs`(변경 없음 확인)

**Interfaces:**
- `tagColor(event)`: `tool`만 `'38;5;250'` → `'2'`.
- `bodyColor(event): string` — `tagColor`가 `38;5;`로 시작하면 그대로, 아니면 `;`로 나눠 `'1'`, `'4'`를 빼고 다시 잇는다. USER `35`, APPROVE `''`, 나머지는 태그와 같음.

**Predecessors:** 없음(논리적 독립). 다른 task와 동시에 진행하지 않는다.

**결정:** 사용자 지시 "TOOL도 마찬가지로 흐린 회색"은 END 등과 같은 `2`(dim)로 해석(Orchestrator 해석) — TOOL 태그·본문 모두 `2`. 본문에는 색 코드만(Q6). 흐린 `2`와 CMD `38;5;242`도 태그와 똑같이(Q7). 이 변경은 기존 계약 "message continuation lines carry no color"(watch-render.test.mjs:152-157)와 harness-operation.md:95 "Other bodies … have no color"를 대체한다. 과거 spec `docs/superpowers/specs/2026-11-11-arc-watch-design.md`의 색 표는 승인 이력이므로 고치지 않는다.

- [ ] **Step 1: 실패하는 테스트**
  - 134행 표의 TOOL을 `'2'`로.
  - 신규 `body color matches tag color without attributes`: 130-137행 표의 각 입력에서 `renderHuman({...,text:'t'},{color:true,width:120,verbose:true})`가 `\x1b[${body}mt\x1b[0m`으로 끝남(USER `35`, TOOL `2`, AGENT `32`, CMD `38;5;242`, 나머지는 태그와 같음). APPROVE는 SGR 없이 `t`로 끝남. `bodyColor` 반환값도 단언.
  - 152-157 대체 `message lines are colored per line with uncolored indentation`: 실패 4종 `endsWith('\x1b[31mnode --test\x1b[0m')` 유지. `{kind:'agent',role:'implementer',text:'a\n\nb'}` 결과에서 `lines[1]===''`, `lines[2]===' '.repeat(prefixLen)+'\x1b[32mb\x1b[0m'`(`prefixLen`은 ANSI 제거한 첫 줄의 prefix 폭). 158행(width 10에서 색 없음) 유지.
  - 신규 `color off output is byte-identical for every kind`: 표의 모든 입력에서 `color:false` 출력에 `\x1b` 없음, 기대 문자열은 현재 코드 기준 고정.
- [ ] **Step 2: 실패 확인** — `node --test --test-timeout=120000 tests/node/watch-render.test.mjs`.
- [ ] **Step 3: 구현**
  - `renderHuman`: 50행 `failure` 분기를 `bodyColor`로 대체. 메시지 종류는 비어 있지 않은 각 줄의 내용만 `paint(line, code)`(들여쓰기 제외). 한 줄 종류는 `clippedText`를 감쌈. code가 `''`이거나 본문이 비면 감싸지 않음. 49·56행 조기 반환 유지.
  - `docs/harness-operation.md` 88행 `| \`TOOL\` | \`2\` |`; 95행 첫 두 문장을 "Bodies use their KIND color without bold or underline attributes: `USER` bodies use `35`, `APPROVE` bodies have no color, and failure bodies stay red (`31`). Each message line, including continuation lines, is colored separately; indentation is not colored, and parts wrapped by the terminal keep the line's color."로 교체. 나머지 유지, 한글 금지.
- [ ] **Step 4: 통과 확인** — `node --test --test-timeout=120000 tests/node/watch-render.test.mjs tests/node/watch-cli.test.mjs tests/node/watch-watcher.test.mjs`. 실패 0.
- [ ] **Step 5: manifest** — T1과 같음.
- [ ] **Step 6: 수락 전 확인** — QA 없음. Orchestrator가 집중 테스트·전체 스위트 확인, 실제 TTY에서 `arc watch` 긴 AGENT 메시지 줄바꿈 색 유지 수동 확인. 커밋 `feat(watch): match body colors to KIND tags`.

**Hold:** `--json`·NO_COLOR 출력 변경; 정제 테스트(49-54, 75-76행) 실패.

---

## 최종 검증 (모든 task 수락 후)

- Orchestrator: `node --test --test-timeout=120000 tests/node/*.test.mjs`(베이스라인 55개 외 실패 0), `node scripts/update-manifest.mjs --check`, T2·T3 수동 PTY 캡처를 최종 HEAD에서 재실행.
- **최종 Reviewer 1회**가 T1–T5 전체 변경을 검토. 중점: 입력 수명주기(`repaint`, 타이머, dispose), "Only terminal.mjs emits" 규칙, PTY 문자열 연속성, 색 등급 폴백, watch 색 계약 변경.
- Reviewer 지적은 Implementer → Reviewer 재확인 루프로 처리하고, 해결 후 후속 커밋 하나로 남긴다.

## 수용 기준 매핑

| AC | 내용 | Task |
|---|---|---|
| AC1 | 6줄 로고, 태그라인과 버전, 38폭 구분선, 축약 머리말 | T2 |
| AC2 | truecolor/256 gradient + shimmer(2.88s), frame 0 결정성, 16색/무색에서 애니메이션 출력 없음 | T2, T3 |
| AC3 | 선택 행, 구분선, 제목, 힌트, position 색, busy 스피너, 홈 상태 의미 색 | T2, T3, T5 |
| AC4 | R1–R4 전 화면 적용 | T1 |
| AC5 | 키, 인덱스, Enter 차단, pending 1개, ESC 보존, 타이머 정리, 폴백, 이스케이프 규칙, PTY 문자열 | T1–T3, T5 |
| AC6 | 전체 스위트 새 실패 0 | 최종 검증 |
| AC7 | watch 본문 색 일치, 줄별, 색 꺼지면 변화 없음, TOOL `2` | T4 |
