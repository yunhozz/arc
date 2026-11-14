# `arc watch` 파일 이벤트 줄 배치·소프트 줄바꿈·셸 변경 감지 구현 계획

> **실행 주체 안내:** ARC 역할 경로로 실행한다. Implementer는 작업마다 `/Users/yunho/.claude/skills/arc/references/test-driven-development.md`를 따라 RED → 구현 → GREEN으로 진행하고 Git 상태를 바꾸지 않는다(stage·commit·branch 금지). 각 작업은 fresh QA 후 Orchestrator가 수락하고 집중 커밋 하나를 만든다. 체크박스(`- [ ]`)는 진행 추적용이며 커밋 단위가 아니다.

**목표:** 승인된 설계(2026-11-14, 결정 D1–D6)와 계획 보정(2026-11-15, D8–D11)에 따라 ① 파일 이벤트를 경로당 한 줄로 출력, ② 경로 개수 상한 제거, ③ 메시지·파일 줄에 표시 폭 기준 소프트 줄바꿈, ④ 셸 명령으로 생긴 파일 변경을 `git ls-files` 목록 + lstat 지문으로 추론해 보고, ⑤ AGENT 태그 단순화와 ARC 역할 메시지 접두어 `[Role] `.

**기준:** `/Users/yunho/Desktop/project/arc`, 브랜치 `refactor/shared-platform-assets`, HEAD `f0b40ce8e9e8c63db65d8b5679a225881cb4568a`(사용자가 현재 브랜치 선택).

**위험:** significant(git 실행 표면, watcher 상태·성능, JSON 계약). 작업별 fresh QA, 모든 작업 수락 후 전체 변경 Reviewer 1회(작업별 게이트 아님).

**커밋 메시지 형식:** `type(scope): 한국어 설명`(Orchestrator가 수락 후 작성).

## 승인된 설계 결정

- D1 소프트 줄바꿈과 명시적 개행의 이어지는 줄은 본문 열(`[...prefix].length`)에서 시작한다.
- D2 셸 변경 감지는 `git ls-files -z --cached --others --exclude-standard` 목록과 lstat 지문(`mtimeMs:size:ino:mode`) 비교로 한다(`git status` 아님).
- D3 JSON `paths` 상한을 제거하고 `v:1`을 유지한다.
- D4 셸 감지 이벤트는 사람용 출력에 표식이 없고 JSON에만 `inferred:true`를 붙인다.
- D5 대량 변경도 개수 상한·요약 없이 전부 나열한다.
- D6 비TTY이고 `--width`가 없으면 줄바꿈하지 않는다. 감지 비활성 notice는 verbose가 아니어도 표시한다.
- D7(계획 검토 결정) `--width`가 줄바꿈 폭도 정하므로 도움말 문구를 실제 동작에 맞춘다.

## 파일 구조와 책임

| 파일 | T1 | T2 | 책임 |
|---|---|---|---|
| `lib/watch/render.mjs` | 수정 | 수정 | `displayWidth`/`wrapLine`, 메시지·파일 공통 여러 줄 본문 경로, `renderJson` 경로 slice 제거(T1), `inferred` 필드(T2) |
| `lib/watch/model.mjs` | 수정 | 수정 | `pathsMax` 삭제, `wrapMinBody` 추가, typedef `paths` 수정(T1); 셸 감지 상수·typedef `inferred`(T2) |
| `lib/watch/normalize-codex.mjs` | 수정 | — | `changePaths`(:42), `splitChangePaths`의 `unique`(:61) slice 제거 |
| `lib/watch/normalize-claude.mjs` | 수정 | — | :94, :133, :176 slice 제거 |
| `lib/watch/index.mjs` | 수정 | — | `wrap` 계산·전달(:125), 도움말 문구(D7) |
| `lib/watch/git.mjs` | — | 수정 | `GIT_ALLOWED`에 ls-files 추가, `maxBuffer`, 명령별 타임아웃 |
| `lib/watch/watcher.mjs` | — | 수정 | 루트별 셸 스캔 상태·기준선·트리거·스케줄·비교·claims·귀속·notice |
| `tests/node/watch-render.test.mjs` | 수정 | 수정 | 렌더 테스트 |
| `tests/node/watch-normalize-codex.test.mjs`, `watch-normalize-claude.test.mjs` | 수정 | — | 25개 이상 경로 보존 |
| `tests/node/watch-cli.test.mjs` | 수정 | 수정 | 비TTY 무줄바꿈·`--width 60` 줄바꿈·도움말(T1), 가짜 git ls-files 응답(T2) |
| `tests/node/watch-watcher.test.mjs` | — | 수정 | 가짜 git/lstat 셸 감지 시나리오 |
| `tests/node/watch-scope.test.mjs` | — | 수정 | git 러너 허용·거부·maxBuffer |
| `docs/harness-operation.md` | 수정 | 수정 | T1: :77, :105, :107(paths 상한 제거). T2: :75, :79, :107(`inferred`). 영어만(한글 금지 테스트 `watch-cli.test.mjs:200`) |
| `MANIFEST.sha256` | 갱신 | 갱신 | `node scripts/update-manifest.mjs`로 재생성(`lib/watch/*.mjs`만 등록 대상) |

---

## T1 — 파일 이벤트 줄 배치(C1), 경로 상한 제거(C2), 소프트 줄바꿈(C4)

**선행:** 없음.

**목표와 범위**
- C1: `renderHuman`에서 메시지(user/agent)와 파일 이벤트(file_change/file_create/file_delete)가 하나의 여러 줄 본문 경로(bodyLines → 선택적 wrap → 들여쓰기 → 조각별 paint)를 쓴다.
  - 파일 bodyLines = `[event.text, ...(event.paths ?? []).map(p => displayPath(p, event.root))]`, 항목마다 `sanitizeText`, 빈 항목 제외, 항목당 한 줄, 입력 순서 유지.
  - 메시지 bodyLines = `sanitizeMessage(text).split('\n')`, 빈 줄은 `''`로 유지(현행).
  - 첫 줄 `prefix + line`, 이후 줄 `' '.repeat([...prefix].length) + line`(D1), 빈 줄 `''`.
  - 색은 비어 있지 않은 조각마다 `\x1b[<bodyColor>m…\x1b[0m`, 들여쓰기는 무색.
  - bodyLines가 없을 때(빈 메시지, 경로·텍스트 없는 파일 이벤트)는 현행 출력과 바이트 동일.
  - CMD/TOOL/DISPATCH 등 한 줄 이벤트는 기존 `clipCodePoints(prefix+text,width)`와 무색 조건(`[...prefix].length > width`)을 유지.
- C2: `normalize-codex.mjs:42`, `:61`, `normalize-claude.mjs:94`, `:133`, `:176`, `render.mjs:101`의 `.slice(0,…pathsMax)`를 제거하고 중복 제거만 남긴다. `WATCH_LIMITS.pathsMax` 삭제, `model.mjs:39` typedef를 `All reported paths, deduplicated; no fixed cap.`로 변경. JSON `v:1` 유지(D3, D5).
- C4: `render.mjs`에 `export function displayWidth(text)`, `export function wrapLine(text, avail)`(`string[]` 반환) 추가.
  - 단위 `Intl.Segmenter` grapheme. 폭 0: U+0300–036F, U+200B–200F, U+FE00–FE0F, ZWJ(U+200D)만으로 된 grapheme. 폭 2: U+1100–115F, 2E80–303E, 3041–33FF, 3400–4DBF, 4E00–9FFF, A000–A4CF, AC00–D7A3, F900–FAFF, FE30–FE4F, FF00–FF60, FFE0–FFE6, 1F300–1F64F, 1F900–1F9FF, 20000–3FFFD 및 ZWJ 시퀀스나 VS16(U+FE0F)을 포함한 이모지 grapheme. 그 외 1. 외부 의존성 없음.
  - `avail = width - prefixCols`, `prefixCols = Math.max([...prefix].length, displayWidth(prefix))`.
  - 줄 폭 > avail이면 avail 안의 마지막 공백에서 분할(앞부분이 비지 않을 때, 그 공백은 버림), 없으면 grapheme 경계 강제 분할. 이어지는 줄은 본문 열에서 시작하고 원래 들여쓰기는 보존하지 않는다.
  - `renderHuman(event,{width,color,verbose,wrap})`, `wrap` 기본 false. `wrap && avail >= WATCH_LIMITS.wrapMinBody(20)`일 때만 분할. color 여부와 무관하게 같은 규칙.
  - `index.mjs`: `const wrap = Boolean(!options.json && (output.isTTY || options.width != null))`(D6) 계산 후 `renderHuman(event,{width,color,verbose:options.verbose,wrap})`. resize는 이후 출력에만 반영.
  - 도움말(D7): `--width` 줄을 `  --width <n>         Maximum line width; one-line events are clipped, messages and file lists wrap (default: terminal width, or 200)`로, 안내 문장을 `User and agent messages and file paths are shown in full; other events use one line.`로 바꾸고 `watch-cli.test.mjs:258-262` 기대값을 맞춘다.

**편집 파일:** `lib/watch/render.mjs`, `lib/watch/model.mjs`, `lib/watch/normalize-codex.mjs`, `lib/watch/normalize-claude.mjs`, `lib/watch/index.mjs`, `tests/node/watch-render.test.mjs`, `tests/node/watch-normalize-codex.test.mjs`, `tests/node/watch-normalize-claude.test.mjs`, `tests/node/watch-cli.test.mjs`, `docs/harness-operation.md`, `MANIFEST.sha256`(재생성). README에 같은 문장(경로 공백 연결, 줄바꿈 안 함, 20개 상한)이 있으면 `README.md`도 포함(먼저 grep).

**단계**
- [ ] 1. RED `watch-render.test.mjs`:
  - 경로 3개 EDIT → 3줄, 2·3줄 선행 공백 = `[...prefix].length`, 입력 순서 유지.
  - color on: 각 경로 `\x1b[33m…\x1b[0m`, 들여쓰기 무색. color off: ANSI만 빠진 같은 출력.
  - `text`가 있으면 첫 줄 text, 이후 경로. 기존 `:19-31`, `:93-101` 기대값을 경로별 줄 형태로 변경.
  - `displayWidth`: ASCII 1, 한글 2, `😀` 2, `👨‍👩‍👧` 2, 결합 `é` 1.
  - `wrapLine`/`renderHuman(wrap:true,width:60)`: ASCII·한글·이모지 모든 줄 표시 폭 ≤ 60, 이어지는 줄 본문 열 시작, 공백 우선 분할 시 공백 제거, 공백 없는 긴 토큰 강제 분할.
  - `wrap:false` 무분할, `avail < 20`(예: width 40) 무분할, 명시적 개행+소프트 줄바꿈 혼합.
  - CMD 회귀: 같은 CMD 이벤트의 `wrap:true`/`false` 출력이 바이트 동일하고 기존 기대 문자열과 같음.
  - JSON: 경로 21개 이상 유지.
- [ ] 2. RED normalize: `watch-normalize-codex.test.mjs:33`, `:109`, `watch-normalize-claude.test.mjs:223` 기대값을 25로 변경, Claude Edit/Write/rm 경로 25개 이상 보존 항목 추가.
- [ ] 3. RED `watch-cli.test.mjs`: 비TTY·`--width` 없음 → 긴 한글 user 메시지 한 줄. 비TTY·`--width 60` → 모든 줄 `displayWidth(strip(line)) ≤ 60`, 이어지는 줄 본문 열 들여쓰기. 도움말 기대값 D7로 변경. 한글은 테스트 파일 안에만.
- [ ] 4. `node --test tests/node/watch-render.test.mjs tests/node/watch-normalize-codex.test.mjs tests/node/watch-normalize-claude.test.mjs tests/node/watch-cli.test.mjs`로 새·수정 항목 실패 확인(RED 증거).
- [ ] 5. 구현: C2 slice 제거·`pathsMax` 삭제·`wrapMinBody:20`·typedef, C1·C4 렌더 경로, `index.mjs` wrap 전달·도움말.
- [ ] 6. docs(영어): `docs/harness-operation.md` :77(TTY 또는 `--width`일 때 표시 폭 기준 소프트 줄바꿈, 마지막 공백 우선·강제 분할, 본문 폭 20 미만 무분할, 이어지는 줄 본문 열, 비TTY 기본 무분할; `EDIT`/`CREATE`/`DELETE`는 optional text와 경로를 각각 한 줄; "joined with spaces"·"neither … wrapped by the watcher" 문장 수정), :105(조각별 색, 들여쓰기 무색), :107(JSON `paths` 상한 없음, 중복만 제거).
- [ ] 7. GREEN: 4단계 명령과 `node --test tests/node/watch-*.test.mjs` 통과.
- [ ] 8. `node scripts/update-manifest.mjs` → `npm run check:manifest` 통과.
- [ ] 9. `npm test` 통과. `rg pathsMax lib tests docs/harness-operation.md` 0건(과거 기록 `docs/superpowers/plans/2026-11-11-arc-watch.md`는 대상 외).

**수용 기준:** AC1, AC2, AC5, AC6(T1 범위), AC7(렌더·JSON paths 단락).

**필수 검사(수락 전, fresh QA):** RED 실패 요약·GREEN 통과 출력, `node --test tests/node/watch-*.test.mjs`, `npm test`, `npm run check:manifest`, `pathsMax` grep 0건. QA 중점: CMD/TOOL/DISPATCH 줄 바이트 동일(기존 render 테스트 무수정 통과), 한글·이모지 줄바꿈 폭 ≤ width, `--json` 무영향.

**커밋(Orchestrator):** `feat(watch): 파일 이벤트 경로별 줄 배치와 소프트 줄바꿈, 경로 상한 제거`

---

## T2 — 셸 명령 파일 변경 감지(C3)

**선행:** T1 수락·커밋.

**목표와 범위**
- `model.mjs` `WATCH_LIMITS`에 `shellScanDelayMs:1000, shellScanMinIntervalMs:3000, shellScansPerTick:2, shellScanMaxFiles:20000, shellScanTimeoutMs:5000, shellScanFailureMax:3, shellLstatBatch:256, gitMaxBufferBytes:16777216` 추가. typedef `@property {boolean} [inferred] True for file events inferred from a Git file-list and lstat comparison.` 추가.
- `git.mjs`: `GIT_ALLOWED`에 `Object.freeze(['ls-files','-z','--cached','--others','--exclude-standard'])` 추가(인덱스 3, 기존 0–2 유지). 정확 일치 검사 유지로 변형 거부. `createGitRunner({env, timeoutMs, maxBuffer = WATCH_LIMITS.gitMaxBufferBytes})`, execFile에 `maxBuffer`, ls-files는 `shellScanTimeoutMs`, 그 외 `timeoutMs`. GIT_* 제거·`-c core.fsmonitor=false`·`GIT_OPTIONAL_LOCKS=0`·`shell:false`·실패 시 `null` 유지.
- `watcher.mjs`:
  - `dependencies.lstat`(기본 `fsp.lstat`) 주입. `row.gitTop = git(cwd, GIT_ALLOWED[0])?.trim()`, 캐시 `gitTopByCwd`(≤ `maxRepos`), 표시용 `row.root`와 분리. null/예외면 비저장소로 감지 안 함. 루트 상태 수 ≤ `L.maxRepos`, 초과 루트는 감지 안 함.
  - 루트 상태 `shellRoots: Map<gitTop,{snapshot:Map<abs,fp>|null, pending, pendingSince, lastTriggerAt, lastScanAt, prevScanAt, claims:Map<abs,ts>, candidates:Map<rowId,ts>, failures, off}>`.
  - 기준선: `attach`에서 `row.gitTop`이 있고 상태가 없으면 생성 후 즉시 스캔해 snapshot만 기록(이벤트 없음). 실패면 `failures++`, snapshot null; snapshot null 상태의 다음 성공 스캔은 기준선으로만 취급.
  - claims: `normalize`에서 원본 file_change/create/delete 경로를 해당 루트 claims에 `now()`로 기록(상대 경로는 `path.resolve(row.cwd, p)`).
  - 트리거: `poll()`에서 `result.lines.length > 0`이고 루트 상태가 있고 off가 아니면 `pending=true`, `pendingSince ??= now()`, `lastTriggerAt=now()`, `candidates.set(row.id, now())`. held 행 포함. `attach` history는 트리거 아님.
  - 스케줄: `tick()`에서 `await poll(out)` 후 `await scanShell(out)`. 대상 조건 `pending && !off && now()-lastScanAt >= shellScanMinIntervalMs && (now()-lastTriggerAt >= shellScanDelayMs || now()-pendingSince >= shellScanMinIntervalMs)`(연속 활동에도 최소 간격마다 스캔). 라운드로빈, tick당 최대 `shellScansPerTick`.
  - 스캔: `git(top, GIT_ALLOWED[3])`; null이면 `failures++`, `>= shellScanFailureMax`면 off+notice; 성공 시 `failures=0`. `'\0'` 분할·빈 항목 제외·`path.join(top, rel)`. 개수 > `shellScanMaxFiles`면 off+notice. 이전 snapshot 키와 합집합을 `shellLstatBatch` 단위 `Promise.all` lstat. 디렉터리(gitlink) 제외, 심볼릭 링크는 링크 자체, ENOENT/ENOTDIR = 없음, 그 밖의 오류(EACCES 등)는 이번 라운드 이전 지문 유지(이벤트·실패 카운트 없음). 신규 → create, 지문 변경 → change, 소멸 → delete. claims 경로는 이벤트에서 제외하고 snapshot만 갱신. 스캔 후 `ts < prevScanAt` claims 삭제, `prevScanAt=lastScanAt`, `lastScanAt=now()`, `pending=false`, `pendingSince=undefined`, 귀속 계산 후 candidates 비움.
  - 귀속: candidates 중 ts 최대이면서 아직 `followed`에 있는 행. 없으면 버림. kind별 1개 `clean({...identity(row), ts:stamp(), kind, paths:sorted, inferred:true})`를 `emit(row, events, out)`으로 넘겨 hold 규칙 적용. `row.active`·`lastActivity`·스피너 불변. 개수 상한 없음(D5).
  - notice: 루트당 1회, verbose 무관 `shell change detection off for ${top}: ${reason}`, reason은 `more than 20000 files` 또는 `git ls-files failed 3 times`(D6).
  - 읽기 전용: 새 실행은 ls-files 하나와 lstat뿐, 파일 내용 읽지 않음.
- `render.mjs` `renderJson`: fields에서 `'paths'` 뒤에 `'inferred'` 추가. 사람용 출력 표식 없음(D4).

**편집 파일:** `lib/watch/git.mjs`, `lib/watch/watcher.mjs`, `lib/watch/model.mjs`, `lib/watch/render.mjs`, `tests/node/watch-watcher.test.mjs`, `tests/node/watch-scope.test.mjs`, `tests/node/watch-render.test.mjs`, `tests/node/watch-cli.test.mjs`, `docs/harness-operation.md`, `MANIFEST.sha256`(재생성).

**단계**
- [ ] 1. 픽스처 정리: `watch-watcher.test.mjs` `setup` 가짜 git이 `args[0]==='ls-files'`면 설정 가능한 목록(기본 `''`, `\0` 연결) 또는 null 반환, 호출 기록, `dependencies.lstat`로 Map 기반 가짜 lstat(없으면 `ENOENT`) 주입. `watch-cli.test.mjs:167` 가짜 git은 ls-files에 `''`. 기존 테스트 전부 통과 확인.
- [ ] 2. RED `watch-scope.test.mjs`: 실제 저장소(`repository(t)`, GIT_DIR 주입 env)에서 정확한 ls-files 배열 허용, 추적·미추적 비무시 파일 포함, 무시 파일 제외. 변형 거부(`-z` 누락, 인자 추가, 순서 변경, `--ignored`). `createGitRunner({maxBuffer:1})` ls-files → `null`. 새 명령도 GIT_* 제거 확인(AC4).
- [ ] 3. RED `watch-watcher.test.mjs`(가짜 git/lstat, 시계 조작):
  - 기준선: attach 직후 tick 무이벤트.
  - 활동 append → 1000ms 미만 tick 무스캔 → 지연 뒤 CREATE/EDIT/DELETE 각 1개, 정렬 절대 경로, `inferred:true`, 사람용 출력 무표식.
  - AC3 재현: Codex FileChange 3경로 append와 동시에 가짜 lstat이 그 3파일+새 golden 파일 변경 → 지연 후 claim 3경로 억제, golden만 `inferred:true`로 그 세션 귀속 → 3000ms 이상 뒤 같은 파일 재수정+활동 → EDIT.
  - 두 세션 중 가장 최근 활동 세션 귀속.
  - history 재생 비트리거(시작 직후 ls-files 호출은 기준선 1회).
  - 비저장소(`--show-toplevel` null)는 ls-files 미호출.
  - `shellScanMaxFiles` 초과, ls-files 연속 3회 실패 → notice가 verbose 없이 정확히 1회, 이후 무스캔.
  - 연속 활동에도 3000ms마다 스캔, 루트 3개 구성에서 tick당 스캔 ≤ 2.
  - 대량 변경(500 파일) 전부 paths에 포함.
  - `watch-render.test.mjs`: `renderJson`에 `inferred:true` 포함.
- [ ] 4. `node --test tests/node/watch-watcher.test.mjs tests/node/watch-scope.test.mjs tests/node/watch-render.test.mjs`로 RED 확인.
- [ ] 5. 구현: model 상수·typedef, git.mjs, watcher.mjs, renderJson.
- [ ] 6. docs(영어): :75(restricted Git `git ls-files`와 lstat 메타데이터만, 파일 내용 미열람), :79("Other shell commands remain command events." 교체: 저장소 안 세션의 transcript 활동 후 약 1초 지연·루트별 최소 3초 간격으로 Git 목록+lstat 비교로 `CREATE`/`EDIT`/`DELETE` 추론, 도구 이벤트 경로 중복 억제, 최근 활동 세션 귀속, 사람용 무표식·JSON `inferred:true`, 비활성 notice(20000 파일 초과, 실패 3회), 한계: 동시 다중 세션 오귀속, 외부 편집기 혼입, .gitignore 무시 파일 미감지, 지연 후 도구 이벤트 중복 가능, mtime/size/ino 동일 수정 누락 가능, 저장소 밖 미감지, 감사 아닌 관측, checkout 등 대량 변경도 보고), :107(JSON `inferred`).
- [ ] 7. GREEN: 4단계 명령, `node --test tests/node/watch-*.test.mjs`.
- [ ] 8. `node scripts/update-manifest.mjs` → `npm run check:manifest` 통과.
- [ ] 9. `npm test` 통과.

**수용 기준:** AC3, AC4, AC6, AC7(셸 감지 단락·inferred).

**필수 검사(수락 전, fresh QA):** RED/GREEN 출력, `node --test tests/node/watch-*.test.mjs`, `npm test`, `npm run check:manifest`. QA 중점: `watch-cli.test.mjs`의 "a run leaves every watched tree unchanged and runs only allowed git commands" 통과와 모든 git 호출의 `GIT_ALLOWED` 정확 일치, 실제 git worktree 테스트(`watch-cli.test.mjs:141`)에서 예기치 않은 이벤트·notice 없음, 비저장소·비활성 루트 추가 git 호출 없음, `row.active`·스피너 무영향, 새 실행이 ls-files+lstat뿐인지 코드 확인.

**커밋(Orchestrator):** `feat(watch): 셸 명령 파일 변경 추론 감지 추가`

---

## T3 — AGENT 태그 단순화와 역할 접두어(계획 보정, 사용자 요청 2026-11-15, 표기 정정 반영)

**선행:** T2 수락·커밋.

**승인된 결정**
- D8 agent 이벤트의 KIND 태그는 항상 `AGENT`다(`AGENT(<name>)` 폐지).
- D9 ARC 역할(`event.role` ∈ scouter, planner, implementer, qa, reviewer, orchestrator)이 있으면 메시지 본문 첫 줄을 `[Scouter] `/`[Planner] `/`[Implementer] `/`[QA] `/`[Reviewer] `/`[Orchestrator] `로 시작한다. 이어지는 줄(명시적 개행·소프트 줄바꿈)은 기존대로 본문 열에서 시작하고 접두어를 반복하지 않는다.
- D11 색상 출력에서는 대괄호 안 역할 이름만 굵게(`\x1b[1m`) 표시하고 대괄호·본문은 기존 본문 색을 쓴다. 색이 꺼지면 평문 `[Implementer] `.
- D10 ARC 역할이 없는 에이전트(라벨에서 이름을 얻던 비ARC 서브에이전트, 최상위 세션, 역할 없는 bridge)는 접두어 없이 표시한다.

**목표와 범위**
- `render.mjs` `kindTag`: agent는 항상 `'AGENT'`. 이름 파생·`clipCodePoints(…agentNameMax)` 제거.
- `renderHuman`: agent 메시지이고 역할 표시명이 있으면 bodyLines 첫 항목 앞에 `[<Role>] `를 붙인 뒤 wrap(소프트 줄바꿈 폭 계산에 접두어 포함). 접두어는 본문과 같은 색이며 역할 이름만 굵게(D11). 빈 메시지(text 없음)는 현행처럼 태그만 출력하고 접두어를 붙이지 않는다.
- 역할 표시명 매핑은 render.mjs 안의 고정 표(`qa`→`QA`, 그 외 첫 글자 대문자). `ROLE_NAMES` 밖 값은 접두어 없음.
- `WATCH_LIMITS.agentNameMax`가 더 이상 쓰이지 않으면 삭제.
- JSON 출력은 변경 없음(`role` 필드 유지).
- docs `docs/harness-operation.md` :81(AGENT 태그·역할 접두어 규칙으로 교체), :92(색 표 `AGENT`만) 영어로 수정.

**편집 파일:** `lib/watch/render.mjs`, `lib/watch/model.mjs`, `tests/node/watch-render.test.mjs`(필요 시 `tests/node/watch-cli.test.mjs`), `docs/harness-operation.md`, `MANIFEST.sha256`(재생성).

**단계**
- [ ] 1. RED `watch-render.test.mjs`: `kindTag` agent 기대값을 모든 입력에서 `AGENT`로 변경(:133–:149, :156, :192 부근). 역할별 본문 접두어(`[Implementer] `, `[QA] `, `[Planner] ` 등), 비ARC 서브에이전트·최상위 세션·역할 없는 bridge는 접두어 없음, 여러 줄 메시지에서 접두어는 첫 줄만, color on(역할 이름 굵게, 대괄호·본문 본문 색)/off(평문), `wrap:true`·width 60에서 접두어 포함 첫 줄 폭 ≤ 60, 빈 메시지는 태그만.
- [ ] 2. RED 확인: `node --test tests/node/watch-render.test.mjs`.
- [ ] 3. 구현.
- [ ] 4. docs(영어) 수정.
- [ ] 5. GREEN `node --test tests/node/watch-*.test.mjs`, `node scripts/update-manifest.mjs` → `npm run check:manifest`, `npm test`(기준선 대비 신규 실패 없음).

**수용 기준:** AC8 agent 태그는 항상 `AGENT`이고 ARC 역할 메시지는 첫 줄이 `[<Role>] `로 시작, 비ARC·무역할은 접두어 없음, JSON 불변. AC9 docs :81·:92가 동작과 일치. AC6 적용.

**필수 검사(수락 전, fresh QA):** 위 GREEN 명령, render 스크립트로 역할 6종·비ARC·무역할·여러 줄·줄바꿈 확인.

**커밋(Orchestrator):** `feat(watch): AGENT 태그 단순화와 ARC 역할 메시지 접두어`

---

## 수용 기준

- AC1 경로 3개 EDIT → 3줄, 2·3줄 선행 공백 = `[...prefix].length`, color 시 각 경로 `\x1b[33m…\x1b[0m`, 들여쓰기 무색.
- AC2 25개 경로 Codex FileChange·Claude 이벤트가 사람용·JSON 모두 25개 유지, `pathsMax` grep 0건(lib, tests, docs/harness-operation.md).
- AC3 가짜 git/lstat watcher 테스트로 실제 누락 시나리오 재현(T2 단계 3).
- AC4 `GIT_ALLOWED` 밖 조합 거부, 새 명령 env GIT_* 제거, `-c core.fsmonitor=false`.
- AC5 width=60 TTY(또는 `--width 60`) 한글 메시지 모든 줄 표시 폭 ≤ 60, 이어지는 줄 본문 열; 비TTY·`--width` 없음 → 한 줄; CMD 줄 기존과 바이트 동일.
- AC6 `node --test tests/node/watch-*.test.mjs`, `npm test`, `npm run check:manifest` 통과.
- AC7 docs 단락이 실제 동작과 일치.

## 최종 검증(모든 작업 수락 후)

- `node --test tests/node/watch-*.test.mjs`, `npm test`, `npm run check:manifest` 재확인.
- 독립 Reviewer 1회 전체 변경(T1+T2+T3) 검토. 중점: git 실행 표면, watcher 상태·성능(라운드로빈, 상한, 실패 off), JSON 계약(`v:1`, 상한 제거, `inferred`), 렌더 폭 보장, docs 일치.
- Reviewer 지적은 Implementer → Reviewer 재검토(QA 재배정 없음), 해결 전까지 미커밋, 해결 후 집중 커밋 하나.

## 가정(채택)

- A1 avail 계산의 prefix 폭은 `Math.max([...prefix].length, displayWidth(prefix))`, 들여쓰기는 D1대로 `[...prefix].length`.
- A2 굶주림 방지는 `pendingSince` 기준 최소 간격(3000ms) 스캔.
- A3 ENOENT/ENOTDIR 외 lstat 오류 경로는 이번 라운드 이전 지문 유지(이벤트·실패 카운트 없음).
- A4 notice reason 문구 `more than 20000 files` / `git ls-files failed 3 times`.
- A5 경로·텍스트 없는 파일 이벤트의 사람용 출력은 현행 바이트 유지.
