# 결과 문구·watch 요약 박스·이전 이벤트·worktree 선택·README·기본 모델 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리 작업 성공 문구를 통일하고, watch에 4행 요약 박스, Ctrl-H 이전 이벤트 보기, 시작 worktree 선택을 추가하고, README를 재구성하고, 패키지 기본 모델을 통일한다.

**Architecture:**
- 문구: `lib/management/operations.mjs`(원천), `lib/tui/app.mjs`(`resultRows`, `execute`, Apply 직전 상태 전달)
- 박스: watcher가 header notice에 `brief`를 붙이고, `lib/watch/index.mjs`가 새 `lib/watch/brief.mjs`와 `lib/watch/markdown.mjs` `renderBox`로 그린다.
- Ctrl-H: watcher 시작 backlog와 `earlier()`, `index.mjs`의 0x08 처리
- worktree 선택: `lib/watch/scope.mjs` 추가 함수(porcelain 파싱, 표시 경로, 범위 교체, 귀속, 정렬), probe `listActivity()`, 새 `lib/watch/worktree-menu.mjs`
- 기본값: `*/skill/models.toml`과 해시·golden 산출물

**Tech Stack:** Node.js (`node --test`), Python unittest (`PYTHONDONTWRITEBYTECODE=1`), TOML, SVG, Markdown.

**Spec:** `docs/superpowers/specs/2026-11-22-result-brief-readme-defaults-design.md`

## Global Constraints

- 대상: managed worktree `/Users/yunho/Desktop/project/arc/.claude/worktrees/result-brief-readme-defaults`, 브랜치 `feat/result-brief-readme-defaults`, base `5f6fa2e95e1415d44467eab235115d11998f4d34`.
- 문구는 spec D2·D3·D6·D7의 리터럴을 그대로 쓴다(영어).
- D5 값을 따른다(Grok 무변경).
- watch `--json`과 비TTY 형식은 바꾸지 않는다. `followWatch`를 `io.scope` 없이 부르면 기존과 같다.
- watch 범위는 worktree 하나다(PR #64).
- worktree 열거는 `git worktree list --porcelain -z`만 쓴다. 디렉터리 스캔과 플랫폼별 경로 규칙은 쓰지 않는다. Git이면 worktree 화면은 항상 띄운다.
- Ctrl-H는 0x08만 받고, 페이지는 `L.earlierPage = 20`이다.
- 실패 결과 행은 바꾸지 않는다.
- `lib/runtime/`, `shared/`, `lib/models/*.json`, `lib/watch/anchor-store.mjs`, `lib/watch/git.mjs`, `grok/`, `claude/agents/*.md`는 바꾸지 않는다.
- 문서는 host 중립으로 쓰고, watch 지원은 Claude·Codex로 적는다.
- Python 실행 뒤 생긴 `__pycache__`는 보고한다.
- 각 task 전에 Orchestrator가 관련 테스트 기준선을 테스트 이름별로 기록한다. 커밋은 수락 후 Orchestrator가 한다. Reviewer는 task별 게이트가 아니다.

## Review Focus

1. 좁은 폭, CJK, 긴 바깥 경로: 박스, 구분선, worktree 행이 폭을 넘지 않고 마지막 두 경로 구간이 남는다. → T3 `brief box never exceeds width and falls back when narrow`, T4 `earlier separators are clipped to width`, T5 `worktree rows fit the width and keep the last path segments`
2. TTY `--json`: `brief`·`startup`, 박스, Ctrl-H가 없다. → T3 `json output on a tty is unchanged and has no box`, T4 `ctrl-h is inert without keys`
3. 위치별 worktree: 프로젝트 안(Claude·Gemini·Grok), 바깥(Codex), sibling, locked는 나열되고 선택된다. bare·prunable·없는 디렉터리는 빠진다. → T5 `worktrees are listed wherever they were created`, `locked worktree is listed and selectable`, `bare, prunable and missing worktrees are skipped`
4. main/nested/바깥 범위: main 선택 시 nested 제외, nested·바깥 선택 시 해당 worktree만 포함, 활동은 가장 깊은 root에 귀속된다. → T5 `scopeForWorktree selects one worktree and excludes the others`, `probe activity belongs to the deepest worktree`
5. 비활성 표시와 `NO_COLOR`, 항상 표시: color면 dim, 색이 없으면 `(no recent activity)`이고 ANSI 없음. worktree 1개여도 화면이 나온다. → T5 `inactive worktrees are listed dimmed`, `single worktree still shows the worktree menu`

---

### Task T1: 패키지 기본 모델 통일 (C5)

**목표:** D5를 구현한다. 다음은 서로 분리할 수 없어 한 커밋으로 묶는다: TOML 3개, Gemini 프로필 5개, 의존 테스트, `instruction-contracts.json` 지정 해시, golden, MANIFEST.

**선행:** 없음.

**Files:**
- Modify
  - `claude/skill/models.toml:5-23`
  - `codex/skill/models.toml:5-23`
  - `gemini/skill/models.toml:2,5-23`
  - `gemini/agents/arc-{scouter,planner,implementer,qa,reviewer}.md:4`
- Test 수정
  - `tests/node/models.test.mjs:13-14` `defaults`
  - `tests/node/preset.test.mjs` 설치 결과 기대값
  - `tests/node/tui-setup.test.mjs:61`: installed 덮어쓰기 값 `'opus'`가 새 기본값과 같아지므로 구별되는 값(예: `'sonnet'`)으로 바꾼다.
  - `tests/node/tui-setup.test.mjs:368`: 키 입력과 기대값을 새 시작값 기준으로 다시 계산한다.
  - `tests/node/tui-app.test.mjs:423`: Claude Scouter 시작 model과 effort
  - `tests/node/gemini-platform.test.mjs:184-198`: 역할 기본값(카탈로그 목록은 그대로)
  - `tests/node/gemini-capability-evidence.test.mjs`: `roleDefaults`
  - `tests/test_claude_payload.py:24-31`: `BALANCED_PRESET`
  - `tests/test_codex_models.py`: 패키지 기본값 상수
  - `tests/node/fixtures/instruction-contracts.json`: `protected`의 `models.toml` 해시와 `agentProfileBaseline.profiles`의 Gemini 프로필 5개 해시만. 계산 방식은 `tests/node/instruction-layout.test.mjs:143`, `tests/node/agent-fragments.test.mjs:34`를 따른다.
- 재생성
  - `node tests/node/fixtures/installed-layout.mjs --write`
  - `node scripts/update-manifest.mjs`
- 수정 금지
  - `tests/fixtures/models-{claude,codex}-v1.toml`과 이를 읽는 단언(`tests/test_claude_payload.py:243`, `tests/test_codex_models.py:339`, `tests/node/models.test.mjs:72`)
  - watch·role-bridge jsonl fixture

**단계:**
- [ ] 1. A1을 확인한다: 카탈로그에 `opus/medium`, `gpt-6.2-sol/medium`, `gemini-4-neon/default`, `grok-4.6/default`가 있는지, `grok/skill/models.toml`이 이미 전 역할 `grok-4.6`/`default`인지 본다. 아니면 hold한다.
- [ ] 2. RED: `models.test.mjs`의 `defaults`를 D5로 바꾸고 실행해 FAIL을 확인한다.
- [ ] 3. TOML과 프로필을 바꾼다. 키 이름과 `version = 3`은 유지한다.
- [ ] 4. 나머지 기대값을 갱신하고 해시·golden·MANIFEST를 재생성한다. diff가 값과 해시에만 한정되는지 확인한다.
- [ ] 5. 관련 테스트로 GREEN을 확인한다.

**관련 테스트(이유):**
- `tests/node/models.test.mjs`: 기본값과 카탈로그 유효성
- `tests/node/{preset,tui-setup,tui-app,profile-render,plan,management-operations,platform-registry}.test.mjs`: 패키지 TOML 소비
- `tests/node/{gemini-platform,gemini-capability-evidence}.test.mjs`: Gemini 기본값과 프로필
- `tests/node/{instruction-layout,agent-fragments,manifest,installed-layout-golden}.test.mjs`: 해시·golden·MANIFEST
- `tests/node/install-mode-n-platform.test.mjs`: 설치 레이아웃 소비(3~7분, 백그라운드)
- `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest tests.test_claude_payload tests.test_codex_models tests.test_arc_policy`
- 기본값을 단언하는지 확인할 파일: `tests/node/{upgrade-harness,host-gemini-grok,gemini-composite,install-mode-review-followup}.test.mjs`, `tests/qa_model_cases.py`. 단언하면 갱신하고 관련 테스트에 넣는다.
- check: `node scripts/update-manifest.mjs --check`, `node scripts/check-installer-parity.mjs`

**기준:** D5와 정확히 일치, 모든 쌍 유효, installed 설정이 패키지 기본값보다 우선(`tui-setup` 계열), 로직 diff 0.

**필수 QA와 증거(fresh QA):** 기준선과 테스트 이름별 대조(해소된 기준선 실패는 따로 표시), 파일별 값 대조, `grok/`·`lib/`·`shared/` 무변경 확인.

**Hold:** 지정 키 밖의 계약 변경, 로직 변경이 필요할 때.

**커밋:** `feat(models): 최초 설치 기본 모델을 플랫폼별 단일 값으로 통일`

---

### Task T2: 관리 작업 결과 문구 (C1+C2)

**목표:** D1과 D2를 구현한다. 같은 Result 행과 같은 테스트 줄을 공유하므로 한 task로 묶는다.

**선행:** 없음(순서상 T1 뒤).

**Files:**
- Modify: `lib/management/operations.mjs:149`, `lib/tui/app.mjs:14-22`(`resultRows`), `lib/tui/app.mjs:61-81`(`execute`, `:78` update 리터럴 삭제), `lib/tui/app.mjs:106`(`execute(prepared,{request:lastRequest,statuses})`)
- Test
  - `tests/node/tui-app.test.mjs:263-270,495-496`, 그리고 `:248,255,310,327,405` 중 성공 문구를 단언하는 줄
  - `tests/node/tui-package-consumer.test.mjs:52`
  - `tests/node/composite-instructions.test.mjs:242`
  - `tests/node/install-mode-n-platform.test.mjs:383,423,441`
  - `tests/node/tui-app-pty.test.mjs:81-82,92`(성공 문구 단언이 있으면)

**Interfaces:**
- `resultRows(result, registry, {version, kind, latestVersion, previousStates})`
  - `kind`: `'install'|'composite'|'uninstall'|'switch'|'update'`. 생략하면 성공 상태로 추론한다.
  - `previousStates`: `Record<string,'absent'|'installed'|'incomplete'>`. 생략하면 모든 플랫폼을 신규로 본다.
- `execute(prepared, {retried, request, statuses})`
  - `previousStates = Object.fromEntries(statuses.map(s => [s.platform, s.state]))`
  - 재시도(`:74`)에도 같은 `statuses`를 넘긴다.
  - update는 `{kind:'update', latestVersion: prepared.latestVersion}`로 호출한다.

**단계:**
- [ ] 1. RED: `tui-app.test.mjs`에 다음 하위 테스트를 추가·수정하고 FAIL을 확인한다.
  - `first install headline`: codex·claude `installed`, `previousStates {claude:'absent'}` → `['✨ ARC installed for Claude, Codex.','Restart ARC to check.']`
  - `reconfigure headline`: `{claude:'installed',codex:'incomplete'}` → `['🔧 Settings applied to Claude, Codex.','Restart ARC to check.']`
  - `mixed new and existing platforms`: `{claude:'installed',codex:'absent'}` → `['✨ ARC installed for Codex.','🔧 Settings applied to Claude.','Restart ARC to check.']`
  - `missing previous states count as new`: 첫 행이 `✨ ARC installed for`로 시작
  - `single removal` → `['🧹 Removed ARC from Codex.']`
  - `injected removal label` → `['🧹 Removed ARC from Zeta.']`
  - `switch removal`: `{code:0,messages:['Mixed routing turned off.'],results:[{platform:'claude',status:'uninstalled'}]}` → `['🧹 Removed ARC from Claude.','Mixed routing turned off.']`
  - `Everything CLI removed` → `['👋 ARC and the arc CLI removed.','Mixed routing turned off.','Dispatch history stays in /old/arc-role-dispatch.']`. `exitSession:true`이면 둘째 행 `CLI removal ended this session.` 뒤에 messages
  - `Everything CLI absent` → `['👋 ARC removed.','Mixed routing turned off.','Dispatch history stays in /old/arc-role-dispatch.']`
  - `upgrade success keeps residual paths`: `{code:0,exitSession:true,results:[],messages:[],stdout:'Codex: harness updated\nResidual path: /r/x\nARC harness updated to 0.5.1.\n'}`, 옵션 `{kind:'update',latestVersion:'0.5.1'}` → `['🚀 Upgraded to ARC 0.5.1.','Restart ARC to check.','Residual path: /r/x']`
  - `composite cleanup failure keeps diagnostics without headline`: `{code:1,messages:['Residual path: /p'],results:[{platform:'claude',status:'installed'}],error:Error('cleanup')}` → 이모지 헤드라인이 없고 `Residual path: /p`, `Error: cleanup`, `Exit code: 1` 포함
  - `:269`, `:271-275`, `:382`의 기대값은 바꾸지 않는다(실패 경로 고정). `:496`은 `result.messages`가 `[]`이도록 바꾼다.
- [ ] 2. `operations.mjs:149`에서 두 리터럴을 지운다.
- [ ] 3. `resultRows` 성공 분기와 `execute`의 `statuses` 전달을 구현한다. 실패 분기는 기존 표현식을 그대로 둔다.
- [ ] 4. 다른 테스트를 갱신한다.
  - `install-mode-n-platform:383`: `resultRows(result, registry)[0] === '✨ ARC installed for Claude, Codex, Zeta.'`로 표시 순서 검증 유지
  - `:423`, `:441`, `composite-instructions:242`: `messages`가 `[]`
  - `tui-package-consumer:52`: 기존 설치 재적용 시나리오면 `previousStates`를 넘기고 `🔧 Settings applied to Claude, Codex.`, 아니면 `✨ …`를 기대한다. 어느 쪽인지와 이유를 보고한다.
- [ ] 5. GREEN을 확인한다.

**관련 테스트(이유):**
- `tests/node/{tui-app,tui-app-pty,tui-package-consumer}.test.mjs`: 결과 행과 실제 TTY 출력
- `tests/node/{composite-instructions,install-mode-n-platform,install-mode-review-followup}.test.mjs`: composite `messages`와 Residual 중복 제거(n-platform은 백그라운드)
- `tests/node/{anchor-migration,gemini-composite,install-mode-switch}.test.mjs`: `Mixed routing turned off.` 유지
- `tests/node/{upgrade-reapply,upgrade-cli,management-update}.test.mjs`: reapply·update CLI 출력 불변
- `tests/node/tui-render.test.mjs`(있으면): `✨ 🔧 🚀 🧹 👋`의 `cellWidth`가 2인지

**기준:** D2 리터럴과 판정 규칙 준수, 실패 행 불변, `grep -rn "Mixed routing on\|After upgrading ARC" lib tests` 0건.

**필수 QA와 증거:** 기준선 대조, kind·판정 경우별 `resultRows` 출력 예, 이모지 폭 확인.

**Hold:** reapply·update CLI 출력이나 실패 행을 바꿔야 할 때, 이모지 폭 문제로 정렬이 깨질 때(문구를 Orchestrator에 반환).

**커밋:** `fix(tui): 관리 작업 결과를 작업별 간결한 성공 문구로 통일`

---

### Task T3: watch 시작 요약 박스 (C3)

**목표:** D3을 구현한다. 이 task에서는 Keys를 `Ctrl-C stop · Ctrl-L clear`로 두고 `Ctrl-H earlier`는 T4에서 추가한다. `brief.scope`·`brief.branch` 렌더는 지원하되, `scope.display`·`scope.branch` 값은 T5가 채운다. 그 전에는 `watchLocationLabel`만 쓰고 branch는 없다.

**선행:** 없음(순서상 T2 뒤).

**Files:**
- Create: `lib/watch/brief.mjs`, `tests/node/watch-brief.test.mjs`
- Modify: `lib/watch/markdown.mjs`(`renderBox` export), `lib/watch/watcher.mjs:558-564`(`brief`, `startup:'live'`), `lib/watch/index.mjs:13-34`(박스 안내 help 줄), `lib/watch/index.mjs:143-171`(TTY 렌더와 순서)
- Test 수정
  - `tests/node/watch-cli.test.mjs:791`: `'arc watch: scope'` 대신 박스 제목 `arc watch `를 찾는다.
  - `tests/node/watch-watcher.test.mjs:689-690,883-884`: notice text 유지, `brief` 단언 추가
  - help 문자열 단언 테스트(`grep -n "Ctrl-L" tests/node`)
- Modify(조건부): `docs/harness-operation.md`(watch 절이 시작 notice를 설명할 때만)

**Interfaces:**
- `renderBox(lines: string[], {width: number, baseCode?: string}) => string[]`: inline Markdown 줄, `baseCode`가 없으면 ANSI 없음, 각 줄 표시 폭 ≤ `width`
- `briefLines(brief, {version: string, keys: string[]}) => string[]`: 예 `**Scope** ~/work/app (feat/x)`, `keys`는 표시 순서대로
- `renderBrief(brief, {version, keys, width, color}) => string[]`: `width < 24`면 평문 줄
- header notice `brief: {scope: string, branch?: string, platforms: string[]}`, 마지막 시작 notice `startup: 'live'`
- Consumes: `watchLocationLabel`(`lib/watch/status-line.mjs:16`), `displayWidth`, `package.json` version(`lib/tui/app.mjs:12` 방식)

**단계:**
- [ ] 1. RED: `tests/node/watch-brief.test.mjs`를 작성하고 FAIL(모듈 없음)을 확인한다.
  - `brief lines follow the approved order and wording`: 4행 `arc watch 0.5.0`, Scope, Platforms `CLAUDE · CODEX`, Keys. branch가 있으면 `~/work/app (feat/x)`, 없으면 `~/work/app`. `worktrees`, `Routing`, `Sessions`, `History` 문자열 없음
  - `brief box never exceeds width and falls back when narrow`: 폭 80, 40, 30, 23과 CJK 긴 경로에서 모든 줄 `displayWidth(strip(line)) <= width`, 23에서는 `┌` 없음
  - `brief box without color has no ANSI`: `\x1b` 없음, `┌`로 시작
  - `json output on a tty is unchanged and has no box`: JSON 줄에 `brief`·`startup` 키 없음, 시작 notice 첫 줄 `arc watch: scope … · Ctrl-C to stop`, 마지막 `live`
  - `tty human output starts with the box and drops live`: 첫 출력 `┌`, `NOTICE … arc watch:`·`NOTICE … live` 없음, disabled notice는 박스 뒤
  - `non-tty human output keeps the two notices`: `tests/node/watch-cli.test.mjs:329-338` 경로 고정
- [ ] 2. 구현한다. `blockEnabled`이면 `[박스, ...disabled, ...(brief와 live를 뺀 시작 이벤트)]` 순서, 그 밖은 기존 순서.
- [ ] 3. 기존 테스트 기대값과 help를 갱신하고 GREEN을 확인한다.

**관련 테스트(이유):**
- `tests/node/{watch-brief,watch-cli,watch-watcher,watch-render}.test.mjs`
- `tests/node/watch-markdown.test.mjs`, `tests/node/watch-status-line.test.mjs`(있으면): 기존 표 렌더·블록 지우기 회귀

**기준:** D3 문구·순서·폭 준수, JSON·비TTY 불변, AGENT Markdown 렌더 테스트 불변.

**필수 QA와 증거:** 기준선 대조, 실제 TTY 렌더 예시(폭 80·40, color와 `NO_COLOR`), JSON 시작 이벤트가 기준선과 같다는 증거.

**Hold:** JSON 계약이나 `lib/runtime`을 바꿔야 할 때.

**커밋:** `feat(watch): 시작 알림을 상태 요약 박스로 교체`

---

### Task T4: watch Ctrl-H 이전 이벤트 보기 (C6)

**목표:** D6을 구현하고 Keys에 `Ctrl-H earlier`를 추가한다.

**선행:** T3 수락(`index.mjs` 키 처리, `briefLines` `keys`, help 공유).

**Files:**
- Modify
  - `lib/watch/model.mjs:12-17`(`earlierPage: 20`, `earlierMax: 2000`)
  - `lib/watch/watcher.mjs`: 옵션 `earlier`, `:207`(startup에서 건너뛴 dispatch → backlog), `:243-251`(`showHistory` 거짓 startup 이벤트 → backlog), `:562-564`(슬라이스 밖 → backlog), 반환 객체 `earlier()`
  - `lib/watch/index.mjs`: `:132-142` 0x08 처리, `:166` `earlier: keysEnabled`, `:13-34` help, Keys 목록에 `'Ctrl-H earlier'`
  - `lib/watch/brief.mjs`(`earlierPageLines`)
- Test: Create `tests/node/watch-earlier.test.mjs`. Modify `tests/node/watch-cli.test.mjs`, `tests/node/watch-brief.test.mjs`(Keys, help)

**Interfaces:**
- `watcher.earlier(count: number) => {events: WatchEvent[], remaining: number}`: backlog 끝에서 최대 `count`개를 꺼내 시간순으로 돌려주고 제거. `earlier` 옵션이 거짓이면 항상 `{events:[], remaining:0}`. 호출 쪽은 `L.earlierPage`를 넘긴다.
- `earlierPageLines({shown: number, remaining: number}) => {start: string, end?: string}`
  - `shown` 0: start `── no earlier events in loaded history ──`, end 없음
  - `remaining` 0: start `── earlier <n> events · start of loaded history ──`
  - 그 밖: start `── earlier <n> events · <m> more ──`
  - end: `── back to live ──`
- Consumes: T3 `briefLines` `keys`, `index.mjs` `eraseBlock`·`drawBlock`, `renderHuman`

**단계:**
- [ ] 1. A3을 확인한다(`lib/watch/watcher.mjs:150-188`). 아니면 hold하고 보고한다.
- [ ] 2. RED: `tests/node/watch-earlier.test.mjs`를 작성하고 FAIL을 확인한다.
  - `earlier pages come from events hidden by the tail slice`: 이벤트 50개, `--tail 10`. 첫 `earlier(20)` 21~40번째(시간순) `remaining 20`, 둘째 1~20번째 `remaining 0`, 셋째 `events []`
  - `page size is always 20`: `--tail 5`, `--tail 50`, `--tail 0`(이벤트 100개) 각각에서 Ctrl-H 한 번에 이벤트 줄 20개, `L.earlierPage === 20`
  - `tail 0 keeps all startup events in the backlog`: 시작 출력에 이벤트 없음, 첫 페이지가 최신 20개
  - `sessions outside the history window are included`
  - `backlog keeps the newest earlierMax events`
  - `earlier is empty when disabled`
  - `ctrl-h prints one page between separators without interleaving`: 0x08 → eraseBlock, `── earlier 20 events · <m> more ──`, 이벤트 20줄, `── back to live ──`, status block 순. 같은 tick의 live 이벤트는 `back to live` 뒤
  - `backspace 0x7f does not page`
  - `ctrl-h is inert without keys`: `--json` TTY와 비TTY
  - `earlier separators are clipped to width`: 폭 30에서 29 이하
  - `ctrl-l keeps the earlier position`
- [ ] 3. 구현한다. backlog는 시작 때 한 번 만들고 `sort`로 정렬, `source==='watch'` 제외, `markEmitted` 미사용. `onKey`에서 동기 처리: `eraseBlock` → 구분선 → `renderHuman` 출력 → 구분선 → `drawBlock`.
- [ ] 4. Keys 행과 help를 D6 리터럴로 갱신하고 GREEN을 확인한다.

**관련 테스트(이유):**
- `tests/node/watch-earlier.test.mjs`: 새 동작
- `tests/node/watch-watcher.test.mjs`: start·tick, 시작 이벤트 불변
- `tests/node/watch-cli.test.mjs`: 키, help, json, 비TTY
- `tests/node/watch-brief.test.mjs`: Keys 행
- `tests/node/watch-render.test.mjs`: 렌더 불변
- `tests/node/watch-status-line.test.mjs`(있으면)

**기준:** D6 리터럴, 고정 페이지 20, 키 구분, 비활성 조건. 시작 출력과 JSON은 T3 결과와 같다.

**필수 QA와 증거:** 기준선 대조, 실제 TTY에서 Ctrl-H 두 번과 소진 뒤 한 번의 출력 예, 0x7f 무반응 증거, backlog 상한 확인.

**Hold:** A3 불일치, 시작 출력을 바꿔야 할 때.

**커밋:** `feat(watch): Ctrl-H로 시작 이력의 이전 이벤트 보기 추가`

---

### Task T5: watch 시작 worktree 선택 (C7)

**목표:** D7을 구현한다: porcelain 파싱과 항목 처리, 표시 경로 규칙, probe 활동 집계, 화면(항상 표시, 흐림, `NO_COLOR` 대체, 상한, 정렬), 범위 교체, `runWatch` 흐름(플랫폼 메뉴는 그대로), 박스의 `scope.display`·`scope.branch` 값, help.

**선행:** T3, T4 수락.

**Files:**
- Create: `lib/watch/worktree-menu.mjs`, `tests/node/watch-worktree-menu.test.mjs`, `tests/node/watch-worktree-scope.test.mjs`
- Modify
  - `lib/watch/scope.mjs`: 기존 `worktreeRoots`, `resolveScope`, `refreshScope`, `inScope`는 바꾸지 않는다. 추가: `parseWorktreeList`, `selectableWorktrees`, `worktreeDisplayPath`, `scopeForWorktree`, `groupActivity`, `orderWorktrees`
  - `lib/watch/model.mjs`(`worktreePickerMax: 20`)
  - `lib/watch/watcher.mjs`: 옵션 `probe`, `attach`(`:230-252`)에서 probe면 `readTail`·`emit`·shell root 생략, 반환 객체 `listActivity()`, `brief.scope = scope.display ?? watchLocationLabel(…)`, `brief.branch = scope.branch`
  - `lib/watch/index.mjs`: `:13-34` help Scope 절, `:36-58` `runWatch` 흐름, `:61-75,164-166` `followWatch`가 `io.scope`·`io.homes`를 받으면 다시 해석하지 않음
- Modify(조건부, A7): `lib/tui/interface.mjs`에 `ui.menu` 옵션 `rowTones`(하위 호환) 추가. 테스트는 `tests/node/tui-interface.test.mjs`(없으면 해당 메뉴 테스트 파일)
- Test 수정(영향 범위)
  - `tests/node/watch-cli.test.mjs`에서 `runWatch`를 부르는 테스트(`grep -n "runWatch(" tests/node/watch-cli.test.mjs`)를 모두 확인한다. fixture cwd가 Git이면 worktree 화면이 먼저 나오므로 키 입력 앞에 `'\r'`(현재 worktree 선택)을 넣는다.
  - `menu dispose precedes watch raw mode and first output`(`:773-797`)은 alt-screen 종료가 두 번 생긴다. `leftMenu`는 마지막 종료(`lastIndexOf('\x1b[?1049l')`) 기준, `restored`도 마지막 raw 해제 기준으로 바꾼다.
  - 비Git fixture는 바꾸지 않는다. 바꾼 테스트 목록과 이유를 보고한다.
  - `tests/node/watch-menu.test.mjs`(있으면)는 플랫폼 메뉴만 다루므로 바꾸지 않는다.

**Interfaces:**
- `parseWorktreeList(output: string) => Array<{root, head?, branch?, detached, locked, prunable, bare}>`: NUL porcelain, `root`는 `realPath`, porcelain 순서 유지
- `selectableWorktrees(list, {isDirectory = p => fs.statSync(p).isDirectory()}) => {worktrees, mainRoot: string|null}`: bare·prunable·없는 디렉터리 제외, 첫 항목이 bare가 아니면 그 root가 `mainRoot`
- `worktreeDisplayPath(root, {mainRoot, home, width?}) => string`: D7 (a)~(c)와 가운데 생략
- `scopeForWorktree(scope, worktrees, root, {home}) => scope`: `roots:[root]`, `excludedRoots`: 나머지, `branch`, `display`(`~` 축약 절대 경로), `description`
- `watcher.listActivity() => Array<{platform, mtimeMs, cwd, main}>`(probe에서 `start()` 다음)
- `groupActivity(worktrees, activity, {now}) => Map<root, {sessions, platforms, lastActivity}>`: 가장 깊은 root 귀속, 30분 창
- `orderWorktrees(worktrees, groups, {currentRoot, mainRoot, home}) => {shown: Worktree[], hidden: number}`: 현재 → 활동(최근순) → 비활성(표시 경로 오름차순), 20 상한
- `worktreeMenuRows(shown, groups, {mainRoot, currentRoot, home, now, width, color}) => {rows: string[], tones: Array<'dim'|undefined>}`
- `chooseWatchWorktree({input, output, env, signals, worktrees, groups, mainRoot, currentRoot, home, now, color, createSession}) => Promise<string|null>`
- Consumes: T3 `briefLines`, `watchLocationLabel`, `realPath`, `fitChoiceRow`(`lib/tui/render.mjs`), `ui.menu`(`info`, `rowTones`), `GIT_ALLOWED[2]`

**단계:**
- [ ] 1. A5, A6, A7을 확인한다. A5·A6이 성립하지 않으면 hold하고 보고한다. A7이 아니면 `rowTones`를 추가하고 기존 호출자 테스트가 그대로 통과하는지 확인한다.
- [ ] 2. RED: 아래 테스트를 작성하고 FAIL을 확인한다.
  - `tests/node/watch-worktree-scope.test.mjs`
    - `parseWorktreeList reads branch, detached, locked, prunable and bare`
    - `bare, prunable and missing worktrees are skipped`(`isDirectory` 주입)
    - `bare main leaves no main root`
    - `worktrees are listed wherever they were created`: `main/.claude/worktrees/a`, `main/.gemini/worktrees/b`, `main/.grok/worktrees/c`, `~/.codex/worktrees/7f3a/app`, `~/work/app-hotfix` 모두 포함, fs 접근은 `isDirectory`만
    - `display paths are project-relative inside main and home-abbreviated outside`: `app/.gemini/worktrees/b`, `~/.codex/worktrees/7f3a/app`, main은 `~/work/app`, `mainRoot` null이면 모두 `~` 축약
    - `long paths keep the last segments`: 폭 20에서 `~/…/7f3a/app`, 폭 이하
    - `scopeForWorktree selects one worktree and excludes the others`: main 선택 시 `inScope(…, main+'/.claude/worktrees/a/src')` false, `main+'/lib'` true. 바깥 선택 시 그 하위 true, main false. `display`는 `~` 축약 절대 경로
    - `refresh keeps the chosen worktree`
    - `probe activity belongs to the deepest worktree`(30분 초과 제외)
    - `probe reports activity without reading history`: `readTail` 0회
    - `order is current, active by recency, then inactive by display path`
    - `more than 20 worktrees keeps the current one and reports hidden count`: 22개 → `shown.length === 20`, `hidden === 2`, `shown[0]`이 현재
  - `tests/node/watch-worktree-menu.test.mjs`
    - `worktree rows show path, branch, activity and markers`: `here · ● 2m ago · 1 session · CODEX`, `2 sessions · CLAUDE, CODEX`, `detached 1a2b3c4`, `locked · `
    - `inactive worktrees are listed dimmed`: `color:true`면 비활성 행 tone `'dim'`, 활동 열 `no recent activity`. `color:false`면 `(no recent activity)`, `\x1b` 없음. 활동 있는 행 tone `undefined`
    - `worktree rows fit the width and keep the last path segments`: 폭 40
    - `locked worktree is listed and selectable`
    - `default selection is the current worktree and enter returns it`
    - `hidden worktrees show a more line`: `2 more worktrees not shown. Run arc watch inside a worktree to watch it.`
    - `back exits`: `null`
  - `tests/node/watch-cli.test.mjs`
    - `non-git directory skips the worktree menu`: 첫 메뉴 제목 `Which platforms to watch?`
    - `single worktree still shows the worktree menu`: 첫 메뉴 제목 `Which worktree to watch?`, Enter 뒤 플랫폼 메뉴
    - `chosen worktree becomes the watch scope`: 바깥 worktree 선택 시 그 세션 메시지만 출력, 박스 Scope는 `~` 축약 절대 경로 ` (<branch>)`, Ctrl-H도 같은 범위
    - `platform menu follows the worktree menu`
    - `worktree listing failure falls back to the current worktree`
- [ ] 3. 구현한다. `runWatch` 순서: 홈 해석 → `resolveScope` → Git이면 `git worktree list`·`parseWorktreeList`·`selectableWorktrees` → probe(모든 root, watch 지원 전체, `tail:0`, `probe:true`)·`listActivity()`·`close()` → `groupActivity`·`orderWorktrees` → `chooseWatchWorktree`(항상 표시) → `scopeForWorktree` → `chooseWatchPlatforms` → `followWatch(options, {...io, scope, homes})`. porcelain 파싱이나 probe가 실패하면 화면 없이 현재 worktree로 간다(porcelain이 있으면 `scopeForWorktree` 적용, 없으면 기존 scope).
- [ ] 4. help Scope 절과 기존 `watch-cli` 테스트의 키 입력·alt-screen 기준을 갱신하고 GREEN을 확인한다.

**관련 테스트(이유):**
- `tests/node/{watch-worktree-scope,watch-worktree-menu}.test.mjs`: 새 동작
- `tests/node/watch-cli.test.mjs`: 흐름, 메뉴 순서, raw mode·alt-screen 순서, Git fixture 키 입력
- `tests/node/watch-watcher.test.mjs`: probe 아닌 경로 불변, scope 회귀(`:883-884`)
- `tests/node/watch-scope.test.mjs`(있으면): 기존 scope 함수 불변
- `tests/node/{watch-earlier,watch-brief}.test.mjs`: 상호작용
- `tests/node/watch-menu.test.mjs`(있으면): 플랫폼 메뉴 불변
- `tests/node/{tui-interface,tui-app,tui-setup}.test.mjs`(A7로 `rowTones`를 추가했을 때): `ui.menu` 회귀

**기준:** D7 열거·항목 처리·표시 경로·정렬·흐림과 `NO_COLOR` 대체·상한·항상 표시(Git)·범위 교체 준수, `io.scope` 없이 부르면 기존과 같음, probe는 이력을 읽지 않음, worktree 하나 범위 유지.

**필수 QA와 증거:** 기준선 대조, TTY 화면 예시(폭 80·40, color와 `NO_COLOR`, 프로젝트 안·바깥·locked·비활성 행 포함), 세 경로(비Git, worktree 1개, 여럿) 화면 순서, main·nested·바깥 선택별 범위, `readTail` 0회, 시작 지연 대략값, 바꾼 기존 테스트 목록과 이유.

**Hold:** A5·A6 불일치, `git.mjs` 허용 명령이나 `lib/runtime`을 바꿔야 할 때, `rowTones` 추가가 기존 `ui.menu` 동작을 바꿀 때.

**커밋:** `feat(watch): 시작 시 git worktree 목록에서 감시할 worktree 선택`

---

### Task T6: README 재구성과 모드 도식 (C4)

**목표:** D4를 구현한다. SVG 교체·삭제는 승인되어 있다.

**선행:** T1, T3, T4, T5 수락.

**Files:**
- Modify: `README.md`
- Create: `docs/images/mode-standalone.svg`, `docs/images/mode-mixed.svg`
- Delete: `docs/images/role-flow.svg`, `docs/images/role-models.svg`
- Modify(조건부): `docs/harness-operation.md`(README에서 빼는 내용이 그 문서에 없을 때만)
- 재생성: `node scripts/update-manifest.mjs`(README는 MANIFEST 대상)

**단계:**
- [ ] 1. `docs/superpowers` 밖에서 두 SVG 참조를 grep한다(현재 README:5, :52). 다른 곳이 나오면 함께 갱신한다.
- [ ] 2. README를 D4 순서로 다시 쓴다. 빼는 문장마다 `docs/harness-operation.md`에 있는지 대조표를 만든다.
- [ ] 3. watch 예시를 넣는다(모두 실제 함수 출력): T5 `worktreeMenuRows`(색 없음, 가상 worktree 5개: main, `.claude` 안, Codex 바깥, `.gemini` 안 비활성, locked sibling), T3 `renderBrief`(색 없음, 폭 64, branch 포함), 이벤트 3~5줄, T4 `earlierPageLines`와 이벤트 2줄, status block 1줄.
- [ ] 4. SVG 두 개를 작성하고 기존 SVG를 삭제하고 MANIFEST를 재생성한다.
- [ ] 5. 검증한다.

**관련 테스트(이유):**
- `tests/node/manifest.test.mjs`: README 해시
- `tests/node/{package,package-references,release-artifact}.test.mjs`: 패키징과 참조
- `node scripts/update-manifest.mjs --check`
- README 상대 링크 존재 확인(일회성 `node -e`)
- README 내용 테스트가 없으므로 사실 정확성은 QA가 수동으로 대조한다.

**기준:** D4 순서, Mixed 도식에 네 플랫폼, 사실 일치(watch는 Claude·Codex, worktree 하나 범위, `git worktree list`로 위치와 무관하게 나열, 비활성은 흐리게), host 중립, 정보 손실 없음, 링크 유효, MANIFEST 일관.

**필수 QA:** 지원 표 셀 단위 대조, 제거 문장 대조표, SVG well-formed 확인. 시각 확인은 Orchestrator가 한다.

**Hold:** 사실 불일치(보고).

**커밋:** `docs(readme): 읽기 흐름 재구성과 모드별 하네스 도식·watch 예시 추가`

---

## 최종 검증 (모든 task 수락 후, Orchestrator 백그라운드)

- 관련 테스트 합집합: T1~T6(A7로 `rowTones`를 추가했으면 `tui-interface`, `tui-app`, `tui-setup` 포함)
- 계약 테스트: `tests/node/{instruction-layout,agent-fragments,installed-layout-golden,manifest,gemini-capability-evidence}.test.mjs`
- check 4종: `node scripts/update-manifest.mjs --check`, `node scripts/update-role-policy.mjs --check`, `node scripts/check-installer-parity.mjs`, `node scripts/update-runtime-assets.mjs --check`
- 전체 회귀 잠정 판단: **미발동**
  - 근거: runtime, shared, 카탈로그, 설치 로직, git 허용 명령을 바꾸지 않는다. watch 변경은 `lib/watch` 안에 머물고 기존 scope 함수는 그대로 둔 채 함수만 추가한다. `lib/tui/interface.mjs`를 바꾸더라도 하위 호환 옵션 추가뿐이며 그 소비자는 합집합에 들어 있다.
  - 발동 조건: 지정 키 밖의 계약 변경, check 실패, runtime assets 변경, T5가 probe 아닌 경로의 watch 테스트나 `ui.menu` 기존 동작을 깰 때.
- 최종 Reviewer 1회(전체 변경). 중점: 성공 판정과 신규/기존 판정, watch JSON 계약, Ctrl-H interleave와 상한, worktree 열거의 위치 무관성과 범위 교체 정확성(main·nested·바깥)·흐림과 `NO_COLOR` 대체·probe 비용, README 사실 정확성과 대칭.

## 진행 기록

| Task | 상태 | Implementer | 커밋 |
|---|---|---|---|
| T1 | 완료(QA proven, 새 실패 0) | codex bridge b54b7031 | 이 커밋 |
| T2 | 대기 | - | - |
| T3 | 대기 | - | - |
| T4 | 대기 | - | - |
| T5 | 대기 | - | - |
| T6 | 대기 | - | - |
