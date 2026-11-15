# arc watch 줄 시점 cwd 범위와 SKILL/PLUGIN 표시 구현 계획

> ARC 역할 경계: 이 계획은 Orchestrator가 저장하고 승인을 요청한다. 구현은 Implementer(Codex bridge, task별 `allowedPaths`)가 맡고, 수용과 커밋은 Orchestrator가, 최종 전체 검토는 Reviewer가 1회 맡는다. 단계는 checkbox(`- [ ]`)로 추적한다.

- 상태: 승인됨 (2026-11-15, 사용자 승인). 작성: plan-stage Planner 첫 완전 초안. Orchestrator 검토와 결정 반영.

**Goal:** 저장소·디렉터리 범위에서 이벤트마다 그 줄 시점의 세션 cwd로 범위를 판정한다. skill 사용과 plugin 도구 호출을 `SKILL`/`PLUGIN` 줄로 보여 준다.

**Architecture:**
- 줄 cwd 추출(`claudeLineCwd`, `codexLineCwd`)과 SKILL/PLUGIN 판정은 정규화 모듈의 동기 순수 함수로 둔다.
- `watcher.mjs`는 줄마다 세션 cwd를 갱신한 뒤 정규화하고, 줄 게이트로 범위 밖 이벤트를 버린다.
- 탐색은 최신 cwd probe와 부모 정보 캐시 `known`으로 attach를 판정한다.
- 중첩 worktree는 처음 보는 cwd마다 `git rev-parse --show-toplevel`로 확인한다.
- `render.mjs`는 `tool` 이벤트의 `skill`/`plugin` 필드로 태그를 정한다.

**Tech Stack:** Node.js 22+ ESM, `node:test`, 새 dependency 없음.

**Spec:** `docs/superpowers/specs/2026-11-11-arc-watch-design.md` 개정 3(사용자 승인 2026-11-15, SHA-256 `52534297a66b79e2a629885434ba309bd7a5c7f3d05103479b51d7a2a4e37307`). 관련 절: §2 G6/G7, §5.3, §6.2–§6.6, §7, §8.1–§8.2, §10, §11, §13.1, §14, §16, §17, §18 R11–R18, §19.

**Base:** branch `fix/watch-worktree-scope`, HEAD `31d304b`(기준선).

## Global Constraints
- **코드 위치**
  - 코드는 `lib/watch/` 아래에만 둔다.
  - `lib/runtime/`, runtime payload, `RUNTIME_MODULE_PATHS`는 바꾸지 않는다.
- **git 명령**
  - 새 git 명령은 없다. `GIT_ALLOWED` 네 가지를 그대로 쓴다.
  - 중첩 worktree 확인에는 `GIT_ALLOWED[0]`(`rev-parse --show-toplevel`)을 쓴다.
- **읽기 전용(§16):** `O_RDONLY`만 쓰고, 쓰기·잠금·디렉터리 생성은 하지 않는다.
- **상수(`WATCH_LIMITS`)**
  - 추가: `cwdProbeBytes:65536`, `maxKnown:512`
  - 기존 값 사용: `discoveryMs:2000`, `worktreeRefreshMs:30000`, `idleDetachMs:1800000`, `maxRepos:32`, `toolCacheMax:512`, `holdMs:2000`, `gitTimeoutMs:10000`
- **스키마:** `WATCH_KINDS`는 바뀌지 않는다. 스키마 v1에는 필드 `skill`, `plugin`만 추가한다.
- **줄 게이트:** `repo`/`dir` 범위에만 적용한다. `all`/`session`에서는 항상 참이다.
- **색**
  - `SKILL`은 `38;5;110`, `PLUGIN`은 `38;5;175`다.
  - `NO_COLOR`, 비TTY, `--json`이면 ANSI를 쓰지 않는다.
- **출력 금지:** skill 본문, `SKILL.md` 경로, `Base directory` 경로, MCP 인자와 결과, 명령 출력.
- **manifest:** `lib/`나 `README.md`를 바꾼 task는 `node scripts/update-manifest.mjs`로 `MANIFEST.sha256`을 다시 만들고 `npm run check:manifest`를 통과해야 한다. `tests/node/manifest.test.mjs` 등 16개 테스트가 MANIFEST를 참조하기 때문이다.
- **전체 검증:** `node --test --test-timeout=120000 tests/node/*.test.mjs`를 돌려 기준선 HEAD `31d304b`보다 새 실패가 없어야 한다.
- **커밋 메시지:** `type(scope): 한국어 설명`.

## Orchestrator 결정 (Planner 질문, 2026-11-15)
- **D1 (T4, 처음 붙을 때 SESSION)**
  - 기록을 보여 줄 때 합성하는 SESSION은 처음 표시되는 범위 안 줄의 cwd로 만든다. 그 줄 바로 앞에 둔다.
  - 표시할 범위 안 줄이 없으면 SESSION을 내지 않는다. 이후 범위에 들어올 때 진입 SESSION이 나온다.
  - 기록 없이 붙을 때는 붙는 시점의 현재 cwd가 범위 안일 때만 SESSION을 낸다.
  - 결과: 루트 watch에서 이동한 Claude 세션의 이동 전 기록에도 SESSION 줄이 붙는다.
- **D2 (T7, 본문 색):** SKILL/PLUGIN 본문 색은 현재 코드의 `bodyColor` 규칙(`render.mjs:78-81`)을 따른다. 코드와 spec 색 규칙의 기존 불일치는 개정 3의 후속 정정 목록에 둔다.
- **D3 (T2, slash 보류):** 보류를 버리는 것은 다음 `user`/`assistant` 줄뿐이다. `attachment` 같은 그 밖의 type은 무시한다.
- **D4 (T3/T5)**
  - `host_skills.body` 행 정규식은 가정이다(R17). 알아보지 못한 형식은 무시한다.
  - 테스트용으로 `maxKnown`을 watcher `dependencies`에 주입할 수 있게 한다. 기본값은 `WATCH_LIMITS.maxKnown`이다.

## Review Focus
1. 선택 worktree 하위 디렉터리(예: `repo/src`)를 cwd로 쓰는 줄이 반복될 때, 범위 안으로 캐시되어 같은 cwd의 git 확인은 한 번만 일어나야 한다(T6 `nested check caches an in-scope subdirectory once`).
2. symlink 별칭 cwd가 선택 루트 자체를 가리킬 때, git 확인 없이 범위 안이어야 한다(T6 `the selected root and its alias are never git-checked`).
3. 한 poll 묶음 안에서 범위를 들락거릴 때, 진입마다 SESSION이 정확히 1회, 이탈마다 verbose NOTICE가 1회 나와야 한다(T4 `in-out-in within one poll emits one SESSION per entry`).
4. 이동한 세션의 파일이 잘려 처음부터 다시 읽힐 때(`reset`), cwd를 `headCwd`로 되돌린 뒤 다시 판정해야 한다(T4 `reset restarts cwd inheritance from headCwd`).
5. 새 Claude/`codex_exec` 세션이 2초 보류(`holdUntil`) 중일 때 범위 밖 줄은 보류 목록에 들어가지 않아야 하고, 보류가 풀릴 때도 나오지 않아야 한다(T4 `held new sessions release only gated events`).

## 파일 구조와 책임
| 파일 | 개정 3 책임 | task |
|---|---|---|
| `lib/watch/model.mjs` | `cwdProbeBytes`, `maxKnown`, typedef `skill`/`plugin` | T1 |
| `lib/watch/normalize-claude.mjs` | `claudeLineCwd`, 삭제 경로 cwd 대체, Skill·slash command·`mcp__plugin_` 판정 | T1, T2 |
| `lib/watch/normalize-codex.mjs` | `codexLineCwd`, `createCodexState`, skill root·`parsed_cmd`·`pluginId` 판정 | T1, T3 |
| `lib/watch/tail.mjs` | `readLatestCwd` | T1 |
| `lib/watch/scope.mjs` | `claudeDirPrefixes`에 제외 목록 worktree 포함 | T1 |
| `lib/watch/watcher.mjs` | 줄 게이트, 상속, 진입·이탈, busy, attach·`known`, 중첩 확인, SKILL 연동 | T4–T7 |
| `lib/watch/render.mjs` | `SKILL`/`PLUGIN` 태그·색·본문, JSON 필드 | T7 |
| `lib/watch/index.mjs` | watcher에 `homes.user` 전달(T7), help 두 줄(T8) | T7, T8 |
| `README.md`, `docs/harness-operation.md`, `MANIFEST.sha256` | 문서와 manifest | T8 (manifest는 각 task) |

## 의존 순서
- 의존 관계
  - `T1 → T2 → T3`
  - `T1 → T4 → T5 → T6`
  - `{T2, T3, T6} → T7 → T8`
- 같은 파일을 두 task가 동시에 다루지 않는다.
- T2·T3(normalize 파일)과 T4–T6(watcher)은 소스와 테스트 파일이 겹치지 않는다. 다만 `MANIFEST.sha256`은 양쪽 모두 고친다.
- 실행 순서는 순차 T1→T2→T3→T4→T5→T6→T7→T8이다(task별 fresh Implementer).

---

### Task T1: 줄 cwd 추출, 최신 cwd probe, 상수, Claude 접두어 확장

**목표:** 이후 task가 쓰는 순수 함수와 상수를 만든다. Claude 삭제 경로는 줄에 cwd가 없으면 세션 cwd를 쓰게 한다.

**Files (allowedPaths):**
- Modify:
  - `lib/watch/model.mjs`
  - `lib/watch/normalize-claude.mjs`
  - `lib/watch/normalize-codex.mjs`
  - `lib/watch/tail.mjs`
  - `lib/watch/scope.mjs`
  - `MANIFEST.sha256`
- Test:
  - `tests/node/watch-normalize-claude.test.mjs`
  - `tests/node/watch-normalize-codex.test.mjs`
  - `tests/node/watch-tail.test.mjs`
  - `tests/node/watch-scope.test.mjs`
- 참고 위치
  - `model.mjs:6-18`(WATCH_LIMITS), `:20-52`(typedef)
  - `normalize-claude.mjs:7-9`(createClaudeState), `:165`(deletionPaths cwd)
  - `scope.mjs:61-64`

**Interfaces (Produces):**
- `claudeLineCwd(obj: unknown): string | undefined`
  - 객체이고 `obj.cwd`가 비어 있지 않은 문자열일 때만 그 값을 돌려준다.
- `codexLineCwd(obj: unknown): string | undefined`
  - 다음 세 경우에만 값을 돌려준다. 비어 있지 않은 문자열만 쓴다.
    - `type==='session_meta'`: `payload.cwd`
    - `type==='turn_context'`: `payload.cwd`
    - `type==='event_msg' && payload.type==='thread_settings_applied'`: `payload.thread_settings.cwd`
  - 그 밖은 `undefined`다(`item_completed`의 `item.cwd`, `world_state` 포함).
- `readLatestCwd(file: string, extract: (obj)=>string|undefined, {maxBytes = WATCH_LIMITS.cwdProbeBytes} = {}): Promise<string | undefined>` (`tail.mjs`)
  - 파일 끝에서 최대 `maxBytes`를 `O_RDONLY`로 읽는다. 시작 offset이 0보다 크면 첫 줄은 버린다.
  - 줄마다 `JSON.parse`를 시도하고 실패한 줄은 무시한다.
  - 뒤에서부터 `extract`가 값을 돌려주는 첫 줄의 값을 쓴다. 그런 줄이 없으면 `undefined`다. `headCwd`로 대체하는 일은 호출자가 한다.
  - ENOENT/EACCES면 `undefined`.
- `WATCH_LIMITS.cwdProbeBytes = 65536`, `WATCH_LIMITS.maxKnown = 512`
- `createClaudeState()` 반환값에 `cwd: undefined`를 추가한다. T4에서 watcher가 줄마다 설정한다.
- `normalizeClaudeLine`: Bash 삭제 경로를 해석할 cwd를 `string(obj.cwd) ? obj.cwd : state.cwd`로 바꾼다.
- `claudeDirPrefixes(scope)`
  - `repo` 범위: `scope.roots`와 `scope.excludedRoots ?? []` 각각의 path와 realPath slug를 합친다(중복 제거).
  - `dir`: 기존과 같다.
  - `all`/`session`: `null`.

- [x] **Step 1: 실패 테스트 작성**
  - `watch-normalize-codex.test.mjs` `codexLineCwd reads only session_meta, turn_context and thread_settings_applied`
    - 세 소스 각각 `'/r/a'`를 돌려준다.
    - `{type:'event_msg',payload:{type:'item_completed',item:{type:'CommandExecution',cwd:'/x'}}}` → `undefined`
    - `{type:'world_state',payload:{state:{environments:{local:{cwd:'/x'}}}}}` → `undefined`
    - `turn_context`의 `cwd:''` → `undefined`
  - `watch-normalize-claude.test.mjs` `claudeLineCwd returns string cwd only`
    - `{cwd:'/r'}` → `'/r'`
    - `{cwd:1}`, `{}`, `null` → `undefined`
  - `watch-normalize-claude.test.mjs` `Bash deletion paths use state.cwd when the line has no cwd`
    - `state=createClaudeState(); state.cwd='/r/wt'`, Bash `rm a.txt`(id `b1`, 줄에 cwd 없음)
    - 성공 `tool_result`(`b1`)가 오면 `file_delete` `paths`가 `['/r/wt/a.txt']`다.
  - `watch-tail.test.mjs` `readLatestCwd returns the last extractable cwd within 64 KiB`
    - (a) cwd 줄 `/a`, `/b` 뒤에 cwd 없는 줄이 있으면 `'/b'`
    - (b) 맨 앞에 cwd 줄 `/old`, 그 뒤 70000바이트 패딩 줄들, 끝에 cwd 없음 → `undefined`
    - (c) 잘린 첫 줄에 있는 cwd는 무시한다.
    - (d) 없는 파일 → `undefined`
  - `watch-scope.test.mjs` `claudeDirPrefixes normalizes worktree paths`(:64) 확장
    - `add('wt 2')` 뒤 `resolveScope({mode:'default',dir:repo})` 접두어에 `normalizeSlug(wt)`가 있다.
    - `dir:wt` 범위의 접두어에 `normalizeSlug(repo)`가 있다.
    - 기존 단언은 유지한다.
  - `WATCH_LIMITS has probe and known caps`: `cwdProbeBytes===65536`, `maxKnown===512`
- [x] **Step 2: 실패 확인**
  - Run: `node --test --test-timeout=120000 tests/node/watch-normalize-claude.test.mjs tests/node/watch-normalize-codex.test.mjs tests/node/watch-tail.test.mjs tests/node/watch-scope.test.mjs`
  - Expected: FAIL(새 함수 미정의, 접두어 단언 실패)
- [x] **Step 3: 구현**
  - Interfaces대로 구현한다.
  - `readLatestCwd`는 `readTail`과 같은 방식(`fsp.open(file,'r')`, 첫 줄 버림)으로 읽고, 파싱에는 `createLineParser`를 쓴다.
- [x] **Step 4: 통과 확인.** Step 2 명령이 PASS여야 한다.
- [x] **Step 5: manifest.** `node scripts/update-manifest.mjs`를 실행한 뒤 `npm run check:manifest` PASS.
- [x] **Step 6: 회귀.** `node --test --test-timeout=120000 tests/node/watch-*.test.mjs` PASS.
- [x] **Step 7: 커밋(Orchestrator).** `feat(watch): 줄 cwd 추출과 최신 cwd probe 추가`

**수용 기준:**
- 위 테스트가 통과한다.
- 기존 `watch-scope.test.mjs:27,50,57`과 `watch-normalize-codex.test.mjs:57,64`가 통과한다.
- check:manifest가 통과한다.

**QA:** 불필요(순수 함수, Orchestrator 집중 확인).

**위험:** 접두어가 늘어 project 디렉터리 읽기가 늘어난다(R16). 기존 mtime 캐시로 줄인다.

**진행 기록 (2026-11-15):**
- 수용됨. Implementer: bridge dispatch `3e800f5e`.
- RED는 76 pass / 6 fail(새 함수·상수 없음, 삭제 경로, 접두어)였다. GREEN은 집중 테스트 82/82.
- Orchestrator 재확인
  - `watch-*`: 283/284. 남은 실패 `watch help matches the spec text`는 기준선 실패다. docs 커밋의 spec §5.3 개정 때문이며 T8에서 해결한다.
  - check:manifest: 통과.
  - 전체 테스트: 기준선 56건과 같다. 그 밖에 `role-bridge-run` orphan reap 테스트가 1회 실패했으나, 단독으로 3회 재실행해 모두 통과했다. timing flake로 보며 T1과 무관하다.

---

### Task T2: Claude SKILL/PLUGIN 정규화

**목표:** §6.6.2의 세 판정과 실패 시 `skill`/`plugin` 전달을 구현한다.

**Files (allowedPaths):**
- Modify: `lib/watch/normalize-claude.mjs`, `MANIFEST.sha256`
- Create: `tests/node/fixtures/watch/claude-slash-command.jsonl`(spec §6.6.2 관찰 줄 원문)
- Test: `tests/node/watch-normalize-claude.test.mjs`
- 참고 위치: `normalize-claude.mjs:7-9`, `:112-142`(user 분기), `:153-191`(tool_use 분기)

**Interfaces:**
- Consumes: T1의 `createClaudeState`
- Produces
  - `createClaudeState()`에 두 필드를 추가한다.
    - `skills: Map<string,{skill:string,plugin?:string}>`(상한 `toolCacheMax`)
    - `pendingCommand: {name:string,args:string}|null`
  - 이벤트 모양
    - `{kind:'tool', tool, skill, plugin?, text?}`
    - `{kind:'tool', tool, plugin}`
    - `{kind:'tool_failed', tool, skill?, plugin?}`

**판정 규칙:**
- **`Skill` 호출**(`input.skill`이 문자열일 때)
  - `idx = skill.indexOf(':')`가 0보다 크면 `plugin = skill.slice(0,idx)`.
  - `input.args`가 비어 있지 않은 문자열이면 `text`로 넣는다.
  - `block.id`가 문자열이면 `state.skills`에 저장한다.
- **slash command**
  - user 문자열 content(또는 text 블록을 이은 값)에 `/<command-name>([^<]*)<\/command-name>/`가 있으면 `pendingCommand = {name, args}`로 보류한다.
    - `args`는 `/<command-args>([\s\S]*?)<\/command-args>/`의 결과이고, 없으면 `''`.
  - 다음 줄이 `user`이고 `isMeta===true`이며 text가 `Base directory for this skill:`로 시작하면 이벤트를 낸다.
    - `tool:name`, `skill:name.replace(/^\//,'')`
    - `skill`에 `:`가 있으면 앞부분이 `plugin`이다.
    - `args.trim()`이 비어 있지 않으면 `text`로 넣는다.
  - 그 밖의 `user`/`assistant` 줄이 오면 보류를 버린다. 다른 type은 무시한다(D3).
  - `<command-name>` 줄 자체는 기존처럼 USER 이벤트가 되지 않는다(`userText`가 제거한다).
- **`mcp__plugin_`**
  - `parts = name.split('__')`.
  - `parts.length>=3`이고, `rest = parts[1].slice('plugin_'.length)`에서 `i = rest.indexOf('_')`가 0보다 크면 `{kind:'tool', tool:name, plugin:rest.slice(0,i)}`.
  - 조건이 맞지 않으면 기존처럼 `{kind:'tool', tool:name}`.

- [x] **Step 1: 실패 테스트 작성** (`watch-normalize-claude.test.mjs`)
  - `Skill call with args is a skill tool event`: `{name:'Skill',id:'s1',input:{skill:'arc',args:'x'}}` → `[{kind:'tool',tool:'Skill',skill:'arc',text:'x',ts}]`
  - `plugin skill keeps the prefix as plugin`: `{skill:'anthropic-skills:docs'}` → `plugin:'anthropic-skills'`, `skill:'anthropic-skills:docs'`
  - `failed Skill carries skill and plugin`: 위 `s1` 뒤 `tool_result` `is_error:true` → `{kind:'tool_failed',tool:'Skill',skill:'arc'}`
  - `Skill without input.skill stays plain`: `{name:'Skill',input:{}}` → `[{kind:'tool',tool:'Skill'}]`(+ts)
  - `observed slash command yields one skill event`: 픽스처 3줄(command 줄, `isMeta` 줄, `attributionSkill` assistant 줄)
    - `kind==='tool'`인 이벤트가 정확히 1개이고 `{tool:'/find-skills',skill:'find-skills',text:<픽스처 args>}`다.
    - 어떤 이벤트의 문자열 값에도 `Base directory`와 `# Find Skills`가 없다.
  - `builtin slash command without injection is not a skill`: `<command-name>/clear</command-name>` 줄 뒤 일반 user 줄 → `kind==='tool'` 0개
  - `slash pending survives attachment lines`: command 줄과 `isMeta` 줄 사이에 `attachment` 줄이 있어도 SKILL 1개
  - `plugin MCP tool name yields plugin`
    - `mcp__plugin_p_srv__t` → `{kind:'tool',tool:'mcp__plugin_p_srv__t',plugin:'p'}`
    - `mcp__plugin_p__t`, `mcp__srv__t` → `plugin` 없음
- [x] **Step 2: 실패 확인.** Run: `node --test --test-timeout=120000 tests/node/watch-normalize-claude.test.mjs` → FAIL
- [x] **Step 3: 구현.** 위 규칙대로 구현한다. 기존 `state.tools`(id→이름 문자열) 형식은 바꾸지 않는다.
- [x] **Step 4: 통과 확인.** Step 2 명령 PASS
- [x] **Step 5: manifest 재생성과 check:manifest PASS**
- [x] **Step 6: 회귀.** `node --test --test-timeout=120000 tests/node/watch-*.test.mjs` PASS
- [x] **Step 7: 커밋.** `feat(watch): Claude skill과 plugin 도구 사용 판정 추가`

**수용 기준:** AC-W41의 정규화 부분과 AC-W43의 Claude 부분을 만족하고, 기존 Claude 정규화 테스트가 통과한다.

**QA:** 불필요(T7 통합에서 확인).

**위험:** R17. `mcp__plugin_` 형식은 관찰된 적이 없고, 대화형 slash 형식은 가정이다. 알아보지 못한 형식은 개정 전 동작으로 처리한다.

**진행 기록 (2026-11-15):**
- 수용됨. Implementer: bridge dispatch `649b766c`.
- RED는 46 pass / 6 fail, GREEN은 52/52.
- Orchestrator 재확인: `watch-*` 291/292(기준선 help 실패 1건만 남음), check:manifest 통과, 전체 테스트 실패 목록이 기준선과 같음.

---

### Task T3: Codex SKILL/PLUGIN 정규화

**목표:** §6.6.3을 구현한다. 인자 하나로 호출하면 개정 전과 같다.

**Files (allowedPaths):**
- Modify: `lib/watch/normalize-codex.mjs`, `MANIFEST.sha256`
- Test: `tests/node/watch-normalize-codex.test.mjs`
- 참고 위치: `normalize-codex.mjs:63-122`

**Interfaces (Produces):**
- `createCodexState(): {announced:Set<string>, hostRoots:string[], cwd?:string}`
- `normalizeCodexLine(obj, state?, {codexHome, userHome} = {}): WatchEvent[]`
  - `state`가 객체가 아니면 skill 판정을 하지 않는다. 결과는 개정 전과 같다.
- 기본 모드에서 버릴 CMD에는 내부 표시 `skillOnly:true`를 단다. T7의 watcher가 이 표시를 쓰고 출력 전에 지운다.

**판정 규칙:**
- **skill root**
  - `codexHome`가 있으면 `path.join(codexHome,'skills')`, `path.join(codexHome,'plugins','cache')`에 `state.hostRoots`를 더한 것이 skill root다.
  - `under(file, root)`는 `file===root || file.startsWith(root+path.sep)`로 판정한다. 문자열 비교만 하고 I/O는 하지 않는다.
- **`world_state` 줄**(`obj.type==='world_state'`)
  - `payload.state.host_skills.body`가 문자열이면 각 줄에서 `/^\s*`?r\d+`?\s*=\s*`?([^`]+?)`?\s*$/`로 경로를 뽑는다.
  - `~`/`~/` 접두어는 `userHome`이 있을 때만 펼친다.
  - 절대 경로만 받아들이고, 최대 `toolCacheMax`개까지다.
  - 결과로 `state.hostRoots`를 교체하고 `[]`를 반환한다(출력 없음 유지).
- **`task_started`:** `state.announced.clear()`를 한 뒤 기존 `turn_start`를 낸다.
- **`CommandExecution`**
  - `item.parsed_cmd` 배열에서 다음 조건을 모두 만족하는 항목을 고른다.
    - `type==='read'`이고 `path`가 문자열이다.
    - `path.resolve(item.cwd ?? state.cwd, p)`의 basename이 `SKILL.md`다.
    - 그 경로가 skill root 아래다.
  - 상대 경로인데 기준 cwd가 없으면 그 항목은 뺀다.
  - 각 항목의 `name = basename(dirname(file))`.
  - `<codexHome>/plugins/cache/` 아래이고 그 뒤 구간이 `[marketplace, plugin, ...rest]`(rest 1개 이상)이면 `plugin=\`${plugin}@${marketplace}\``, `skill=\`${plugin}:${name}\``. 아니면 `skill=name`.
  - `exit_code`가 유한수이고 0이 아니면 기존 command 하나만 낸다.
  - 그렇지 않으면 아래 순서로 낸다.
    1. 이번 turn에 아직 알리지 않은 skill마다 `{kind:'tool',tool:'read',skill,plugin?}`를 내고 `announced`에 넣는다. 512개를 넘으면 가장 오래된 것을 지운다.
    2. 그 뒤 command를 낸다. `parsed_cmd`가 비어 있지 않고 전부 skill read면 `skillOnly:true`를 단다.
- **`McpToolCall`:** `item.pluginId`가 문자열이면 `plugin:item.pluginId`를 더한다. `state`와 무관하게 적용한다.

- [x] **Step 1: 실패 테스트 작성** (`watch-normalize-codex.test.mjs`. `H='/h/.codex'`, `st=createCodexState()`, `cfg={codexHome:H,userHome:'/h'}`)
  - `skill-only read emits SKILL then a skillOnly command`: `parsed_cmd:[{type:'read',path:H+'/skills/arc/SKILL.md'}]`, `exit_code:0` → `[{kind:'tool',tool:'read',skill:'arc'}, {kind:'command',…,skillOnly:true}]`
  - `.system skill name`: `H+'/skills/.system/openai-docs/SKILL.md'` → `skill:'openai-docs'`
  - `plugin cache skill`: `H+'/plugins/cache/m/p/v1/s/SKILL.md'` → `skill:'p:s'`, `plugin:'p@m'`
  - `repository SKILL.md and search are not skills`: `/repo/claude/skill/SKILL.md` read와 `type:'search'` → command만 나오고 `skillOnly` 없음
  - `failed read emits only the command`: `exit_code:1` → command 하나
  - `mixed read keeps the command`: skill read와 `{type:'unknown'}` → SKILL 뒤 command, `skillOnly` 없음
  - `same skill in one turn is announced once`
    - 같은 줄을 두 번 넣으면 두 번째는 `[{kind:'command',…,skillOnly:true}]`만 나온다.
    - `task_started` 뒤에는 다시 SKILL이 나온다.
  - `relative path resolves against item.cwd`: `path:'SKILL.md'`, `item.cwd:H+'/skills/arc'` → `skill:'arc'`
  - `host_skills roots extend skill roots`
    - `world_state` body `r1 = ~/x/skills` 뒤 `/h/x/skills/foo/SKILL.md` → `skill:'foo'`
    - 알아보지 못한 body는 무시한다.
  - `McpToolCall pluginId becomes plugin`: `{type:'McpToolCall',server:'cua',tool:'repl',pluginId:'unified-computer-use@openai-bundled'}` → `{kind:'tool',tool:'cua.repl',plugin:'unified-computer-use@openai-bundled'}`
  - `single-argument call is unchanged`: 위 skill read 줄을 `normalizeCodexLine(obj)`로 부르면 `[{kind:'command',…}]`만 나오고 `skillOnly`가 없다.
- [x] **Step 2: 실패 확인.** Run: `node --test --test-timeout=120000 tests/node/watch-normalize-codex.test.mjs` → FAIL
- [x] **Step 3: 구현.** 위 규칙대로 구현한다.
- [x] **Step 4: 통과 확인.** 기존 `:57`, `:64`를 포함해 PASS
- [x] **Step 5: manifest 재생성과 check:manifest PASS**
- [x] **Step 6: 회귀.** `node --test --test-timeout=120000 tests/node/watch-*.test.mjs` PASS
- [x] **Step 7: 커밋.** `feat(watch): Codex skill read와 plugin 도구 판정 추가`

**수용 기준:** AC-W42의 정규화 부분과 AC-W43의 Codex 부분을 만족한다.

**QA:** 불필요(T7에서 통합 확인).

**위험:**
- R17: plugin cache 하위 구조와 `host_skills.body` 형식이 확인되지 않았다. 형식이 다르면 plugin 없는 SKILL이나 CMD로 표시된다.
- R18: skill root 안에서 개발하며 읽은 것도 사용으로 보인다.

**진행 기록 (2026-11-15):**
- 수용됨. Implementer: bridge dispatch `ead7f715`.
- RED는 18 pass / 10 fail, GREEN은 28/28.
- Orchestrator 재확인: `watch-*` 302/303(기준선 help 실패 1건), check:manifest 통과, 전체 테스트 실패 목록이 기준선과 같음.

---

### Task T4: watcher 줄 게이트, cwd 상속, 진입·이탈, root/shell, spinner

**목표:** 추적 중인 세션의 줄마다 현재 cwd를 갱신하고, 범위 밖 줄의 이벤트를 버린다. 상태 갱신은 계속한다.

**Files (allowedPaths):**
- Modify: `lib/watch/watcher.mjs`, `MANIFEST.sha256`
- Test: `tests/node/watch-watcher.test.mjs`
- 참고 위치(`watcher.mjs`)
  - `:43-50` dispatchInScope/mapped
  - `:76-95` normalize
  - `:136-159` attach
  - `:341-365` poll
  - `:454` busy

**Interfaces:**
- Consumes: T1의 `claudeLineCwd`, `codexLineCwd`, `createClaudeState().cwd`
- Produces(watcher 내부, T5–T7이 사용)
  - row 필드
    - `row.headCwd`: meta 또는 head의 cwd
    - `row.cwd`: 현재 cwd
    - `row.inScopeNow: boolean|undefined`
  - `cwdInScope(cwd)`
    - `all`/`session`이면 true
    - 그 밖에는 `Boolean(cwd) && inScope(scope,cwd)`
    - T6이 중첩 확인 결과를 덧붙인다.
  - `lineGate(row)`: `all`/`session`이거나 `mapped(row)`면 true, 아니면 `cwdInScope(row.cwd)`
  - `async setCwd(row, cwd, out)`: 값이 바뀌면 `row.cwd`, `row.state.cwd`, `row.gitTop = await gitTop(cwd)`, `row.root = await sessionRoot(cwd)`를 갱신한다.
  - `async ensureShellRoot(row, out)`: 기존 attach `:143-148` 블록을 옮긴 것이다. 범위 안 줄에서만 부른다.
  - `async normalize(row, lines, live=false): Promise<{events, sawInScope:boolean}>`
  - detached/seenAtStart 항목에 `cwd` 필드를 추가한다.

**알고리즘:**
- **`normalize` 줄 루프.** T6은 1단계 바로 뒤에 확인을 끼워 넣는다.
  1. `c = extract(line)`. 값이 있으면 `await setCwd(row,c,out)`.
  2. `inside = lineGate(row)`.
  3. `row.inScopeNow === false && inside`이면 진입이다. 진입 SESSION을 push한다: `clean({...identity(row),ts:<줄 ts> ?? stamp(),kind:'session',text:sessionText(row)})`.
  4. `row.inScopeNow === true && !inside`이면 이탈이다. 호출자의 `out`에 `debug(out, \`session ${row.id.slice(0,8)} left scope: cwd=${row.cwd}\`)`를 남긴다.
  5. `row.inScopeNow = inside`.
  6. 이벤트를 정규화하고 `row.active`는 항상 갱신한다.
  7. `inside`일 때만 다음을 한다.
     - 표시 필터를 적용하고 push한다.
     - `shell.claims`를 기록한다(`path.resolve(row.cwd,file)`).
     - `await ensureShellRoot`.
     - `sawInScope=true`.
- **`attach`**
  - `row.headCwd = row.cwd`로 둔다.
  - 시작 cwd는 `previous?.cwd ?? row.cwd`이고 `setCwd`로 반영한다. 기존 `gitTop`/`sessionRoot` 계산은 `setCwd`가 대신한다.
  - `row.state.cwd = row.cwd`.
  - **D1**: 기록을 보여 줄 때(`showHistory`) 합성 SESSION을 다음 규칙으로 만든다.
    - 첫 번째로 표시되는 범위 안 이벤트의 시점 cwd로 만들고 그 이벤트 바로 앞에 둔다.
    - 기록 안에 session 이벤트가 이미 있거나 표시할 범위 안 이벤트가 없으면 만들지 않는다.
  - 기록 없이 붙을 때는 `row.inScopeNow = lineGate(row)`가 true일 때만 붙는 시점의 cwd로 SESSION을 만든다.
- **`poll`**
  - `lastActivity`는 `sawInScope`일 때만 `now()`로 갱신한다.
  - shell `pending`/`candidates`는 `sawInScope`이고 현재 `row.gitTop`의 상태가 있을 때만 갱신한다.
  - `result.reset`이면 `row.state`를 다시 만들고 `await setCwd(row,row.headCwd)`, `row.inScopeNow = lineGate(row)`.
  - idle 해제나 maxFollowed 축출로 detached 항목을 만들 때 `cwd: row.cwd`를 넣는다.
- **`dispatchInScope` 대체 판정:** `[...followed.values()].some(row=>ref.sessionIds.includes(row.id) && cwdInScope(row.cwd))`.
- **`busy()`:** `row.active && (row.inScopeNow || mapped(row)) && now()-row.lastActivity<=spinnerIdleMs`.

- [x] **Step 1: 실패 테스트 작성** (`watch-watcher.test.mjs`)
  - 준비: `wt = path.join(s.cwd,'wt')`를 만들고, repo 범위의 `excludedRoots`에 `wt`를 넣는 setup 옵션 `excluded`를 추가한다.
  - `AC-W31 moved Claude session lines stay out of the root watch`
    - `cl` 줄은 `[cm(id,s.cwd,'before'), cm(id,wt,'after-history')]`다.
    - start 결과 text에 `'before'`(앞에 SESSION 1개)는 있고 `'after-history'`는 없다.
    - `cm(id,wt,'after-live')`와 cwd 없는 assistant text `'inherit'`를 append하면 tick 결과 content가 0개다.
  - `AC-W32 returning to the root shows one SESSION with the new cwd`
    - 이어서 `cm(id,s.cwd,'back')`을 append하면 tick에 `kind==='session'`이 1개 나오고, `text`에 `cwd=${s.cwd}`가 있으며, `'back'`도 나온다.
    - 그다음 append에는 session이 없다.
  - `AC-W32 worktree watch hides lines after the session returns to root`: 범위 `{kind:'repo',roots:[wt]}`에서 headCwd가 `wt`인 세션에 `cm(id,s.cwd,'root')`를 append하면 0개다.
  - `AC-W33 a session moved before start shows only pre-move history`
    - W31의 history 부분과 같고, live append(`wt`)는 0개다(`tail:20`).
    - 이동 전 5줄, 이동 후 30줄, `tail:20`이면 이동 전 5줄만 나온다(게이트를 tail보다 먼저 적용).
  - `AC-W34 Codex turn_context and thread_settings_applied move the session`
    - `c(id,[msg('a')])` 뒤 `{type:'turn_context',payload:{cwd:wt}}`와 `msg('b')`를 append하면 0개다.
    - `{type:'event_msg',payload:{type:'thread_settings_applied',thread_settings:{cwd:s.cwd}}}`와 `msg('c')`를 append하면 `'c'`와 SESSION 1개가 나온다.
    - `CommandExecution`의 `cwd:'/elsewhere'`와 `world_state` cwd는 판정을 바꾸지 않는다.
  - `AC-W38 out-of-scope roots get no shell state and paths follow the line cwd`
    - `s.top(dir=>dir.startsWith(wt)?wt:s.cwd)`, `s.files([...])`로 준비한다.
    - Codex 세션이 `wt`로 이동한 뒤 줄이 와도 `s.calls`에 `{dir:wt,args:GIT_ALLOWED[3]}`가 없다.
    - 루트로 돌아온 뒤 FileChange 이벤트의 `root`는 `s.cwd`다.
    - cwd 없는 줄의 Claude Bash `rm x`에서 나온 `file_delete` 경로는 현재 cwd를 기준으로 한다.
  - `AC-W40 leaving scope emits a verbose NOTICE only`
    - `verbose:true`면 `session <id8> left scope: cwd=${wt}`가 나온다.
    - 기본 모드에서는 0개다.
    - `renderJson` 결과도 같은 이벤트 집합이다.
  - `AC-W40 busy ignores turns of out-of-scope sessions`
    - 이동 뒤 `msg('x')`로 active가 되어도 `w.busy()===false`다.
    - 루트로 돌아온 뒤 user 줄이 오면 true다.
  - `AC-W17 out-of-scope lines do not refresh idle time`: 이동 뒤 30분 동안 tick마다 범위 밖 줄을 append해도 `detached idle session <id8>` verbose NOTICE가 나온다(`advance(1800000)`).
  - Review Focus
    - `in-out-in within one poll emits one SESSION per entry`: 한 번의 append에 root→wt→root 줄이 있으면 SESSION 1개, verbose NOTICE 1개다.
    - `reset restarts cwd inheritance from headCwd`: 이동한 파일을 잘라 root 줄로 다시 쓰면 다시 나온다.
    - `held new sessions release only gated events`: 새 Claude 세션(hold 대상)의 범위 밖 줄은 hold가 풀린 뒤에도 없다.
  - 회귀(그대로 통과): `:127,128,129,137,156,168,218,362`, bridge·dispatch 테스트 전부, `:173,:256-260,:478-483,:540`.
- [x] **Step 2: 실패 확인.** Run: `node --test --test-timeout=120000 --test-name-pattern="AC-W3[1-4]|AC-W38|AC-W40|AC-W17 out-of-scope|in-out-in|reset restarts|held new" tests/node/watch-watcher.test.mjs` → FAIL
- [x] **Step 3: 구현.** 위 알고리즘대로 구현한다. `normalize`가 async가 되므로 호출부(`attach`, `poll`)에 `await`를 붙인다.
- [x] **Step 4: 통과 확인.** Step 2 명령이 PASS이고, `node --test --test-timeout=120000 tests/node/watch-watcher.test.mjs` 전체도 PASS여야 한다.
- [x] **Step 5: manifest 재생성과 check:manifest PASS**
- [x] **Step 6: 회귀.** `node --test --test-timeout=120000 tests/node/watch-*.test.mjs` PASS
- [x] **Step 7: 커밋.** `feat(watch): 줄 시점 cwd로 이벤트 범위 판정`

**수용 기준:**
- AC-W31(루트 쪽), W32, W33, W34, W38, W40을 만족한다.
- AC-W17의 유휴 판정 부분을 만족한다.
- 기존 watcher 테스트가 모두 통과한다.

**QA:** 필요(fresh QA). 범위 판정의 핵심 경로이고 누출은 반목표다. 이동 세션 fixture로 기본, verbose, json 세 모드에서 누출이 0건인지 확인한다.

**위험:**
- `normalize`가 async로 바뀌면서 이벤트 순서가 달라질 수 있다. 같은 tick 안의 정렬은 `sort`가 보장한다.
- R12: history에 포함된 Codex 줄의 cwd 상속에는 한계가 있다.

**진행 기록 (2026-11-15):**
- 수용됨. Implementer: bridge dispatch `d93d37d3`(segment 0–4). QA: bridge dispatch `a5ad360a`(segment 0–3).
- Orchestrator 실행 결정(승인 범위 안)
  - `watch-watcher.test.mjs:167`, `:170`의 child cwd를 범위 안으로 바꾸는 기대값 변경을 T5에서 T4로 앞당겼다. T4 줄 게이트가 child 줄에도 적용되기 때문이다.
  - git fallback 테스트는 scope를 `session`으로 바꾸고, Git stub이 `GIT_ALLOWED[0]`에만 실패하도록 정정했다.
  - D1의 "기록 없이 붙을 때 SESSION"은 개정 전에도 SESSION을 합성하던 경로에만 적용한다. 그래서 10–30분 된 세션의 시작 출력은 0개로 유지된다(spec §10).
- QA finding(모두 해결, 각각 회귀 테스트 추가)
  - F-T4-1: 이탈 뒤 실행된 지연 shell 스캔의 inferred 이벤트에 범위 밖 cwd가 붙었다. 후보 등록 시점의 identity를 저장해 해결했다.
  - F-T4-2: 같은 poll 안에서 이탈하면 루트 shell 스캔이 예약되지 않았다. 범위 안 줄 처리 시점에 후보를 등록하도록 바꿔 해결했다.
- 결과
  - watcher 102/102, `watch-*` 316/317(기준선 help 실패 1건만 남음), check:manifest 통과.
  - QA: AC-W31·W32·W34(루트 범위 쪽), W33, W38, W40, W17(유휴 부분), Review Focus 모두 proven.
- 한계
  - dispatch 매핑 row의 줄 게이트 면제는 독립 재현으로 비교하지 않았다. 기존 bridge·dispatch 테스트 통과로 판단했으며, 최종 Reviewer 검토 대상이다.
  - AC-W31·W32·W34의 worktree 쪽 동시 비교는 T5에 의존하므로 T5 QA에서 확인한다.
- 런타임이 segment 2에서 `refsChanged`를 보고했다. 같은 시각 다른 worktree가 `feat/tui-arc-diagram-flow`에 커밋한 것으로, 외부 변경이다.

---

### Task T5: 탐색: 최신 cwd probe, attach 조건, `known`, 하위 에이전트 자기 cwd

**목표:** §6.5.3–§6.5.5, §6.5.7 재부착, §6.3·§6.4 포함 규칙을 구현한다.

**Files (allowedPaths):**
- Modify: `lib/watch/watcher.mjs`, `MANIFEST.sha256`
- Test: `tests/node/watch-watcher.test.mjs`
- 참고 위치(`watcher.mjs`): `:51-70` label/identity, `:129-135` eligible, `:185-187` rememberStart, `:252-325` discover

**Interfaces:**
- Consumes
  - T1: `readLatestCwd`, `codexLineCwd`, `claudeLineCwd`, `WATCH_LIMITS.maxKnown`, `cwdProbeBytes`
  - T4: `cwdInScope`, detached/seenAtStart의 `cwd`
- Produces
  - `known: Map<string,{id,platform,origin,parentId,agent,depth}>`
    - 삽입 순서를 유지하고 상한은 `maxKnown`이다. `dependencies.maxKnown`으로 주입할 수 있다(D4).
    - 넘치면 가장 오래된 것부터 지운다. 다시 보면 값을 갱신하고 맨 뒤로 다시 넣는다.
  - `parentOf(row) = followed.get(row.parentId) ?? known.get(row.parentId)`
  - `desktopAncestor(row): boolean`: `parentOf` 사슬을 따라가며 `origin==='Codex Desktop'`이 있는지 본다. 방문 집합으로 순환을 막고 최대 `maxKnown`단계까지만 본다.
  - `row.latestCwd`: `cachedHead(latestCwds,row,file=>readLatestCwd(file,extract))`. 크기와 mtime이 같으면 다시 읽지 않는다.
  - `anyCwdInScope(row) = cwdInScope(row.cwd) || cwdInScope(row.latestCwd)`

**규칙:**
- **`known`에 기록하는 대상**
  - Codex: meta를 읽은 rollout마다
  - Claude: head를 읽은 main마다, 그리고 child 행마다(`id:'agent-'+agentId`, `parentId:main.id`)
- **probe 대상**
  - startup: attach window(30분) 안의 후보마다 probe하고 결과를 `seenAtStart` 항목의 `cwd`로 저장한다. `rememberStart`를 확장하며, probe 값이 없으면 head cwd를 쓴다.
  - startup 이후: `remaining` 필터를 통과한 행 가운데 `previous`가 없거나 `row.size>previous.size`인 행만 probe한다.
  - 추출 함수는 platform별로 고른다.
- **`eligible(row)`**
  - 공통 제외(플랫폼, 최상위 Desktop)는 기존과 같다.
  - `row.parentId`가 있을 때
    - `all`/`session`: 기존처럼 `followed.has(row.parentId)`
    - 그 밖
      - `desktopAncestor(row)`면 false이고 `ignored`에 기록한다.
      - `!parentOf(row)`면 false다(기존 보류 흐름).
      - 그 외에는 `anyCwdInScope(row)`.
  - 최상위 세션은 기존 규칙과 같되 cwd 판정을 `anyCwdInScope(row)`로 바꾼다.
- **보류 루프(`:319-325`)**
  - `parentOf(row)`가 있거나 Desktop 조상이면 보류 목록에 넣지 않는다.
  - 부모를 알지만 cwd가 범위 밖이면 다음 탐색에서 다시 판정한다.
- **`label`/`identity`**
  - `followed.get(row.parentId)`를 `parentOf(row)`로 바꾼다.
  - `source:'subagent'`, `depth = row.depth ?? (parent.depth ?? 0)+1`.
- **재부착:** `attach`의 `previous`(detached/seenAtStart)가 `cwd`를 담고 있으므로 T4 로직이 그 cwd에서 상속을 시작한다.
- **Claude child 행:** `cwd: childHead?.cwd ?? head.cwd`(`:290`)를 그대로 둔다. cwd 줄이 없는 child는 부모 cwd를 물려받는다(`:173` 유지).

- [x] **Step 1: 실패 테스트 작성과 기대값 조정**
  - 기대값 변경
    - `:167` child `cwd:'/elsewhere'`를 `cwd:s.cwd`로 바꾼다. grand의 known 라벨 단언은 유지한다.
    - `:170` `cm('child-qa','/outside')` 등을 `s.cwd`로 바꾼다.
    - `/outside` child가 출력되지 않는다는 별도 테스트를 추가한다.
  - `AC-W35 subagents are scoped by their own cwd and keep parent labels`
    - Codex 준비
      - 부모 `parent1234`: cwd가 범위 밖이고 추적되지 않지만 known에 있다.
      - child: `agent_role:'arc_qa'`, cwd가 범위 안이다.
      - grand: `agent_nickname:'Aristotle'`.
    - Codex 단언
      - child: `label==='tui#1234/qa'`, `parentId`, `depth===1`, `source==='subagent'`, 사람용 `AGENT(qa)`
      - grand: `label==='tui#1234/qa/Aristotle'`, `depth===2`
    - Claude: 범위 밖 main의 subagent(cwd가 범위 안, meta `arc-qa`)는 `label==='main#1234/qa'`다.
    - 범위 안 부모의 child라도 cwd가 `/outside`이면 출력이 0개다.
  - `AC-W21 known-parent children attach within 3 seconds regardless of originator`: 시작 뒤 child(originator `codex_exec`, depth 2)를 만들면 `advance(2000)` 뒤 tick 안에 SESSION이 나온다.
  - `AC-W36 Desktop descendants stay excluded by ancestry`: Desktop 부모 아래 child(originator를 `codex-tui`로 바꾸고 cwd는 범위 안)는 0개다. 기존 `:127`도 통과한다.
  - `AC-W36 all and session still require a followed parent`
    - `all`에서 부모가 추적되지 않는 child는 범위 안 cwd여도 0개다.
    - `session` 모드에서는 대상의 자식만 나온다.
  - `AC-W37 worktree watch discovers moved sessions within one discovery`
    - 범위는 `{kind:'repo',roots:[wt],excludedRoots:[s.cwd]}`다.
    - Claude 세션 파일은 메인 slug 폴더에 있고 head cwd는 `s.cwd`다. 시작 뒤 `cm(id,wt,'moved')`를 append하면 `advance(2000)` 뒤 tick에 SESSION(`cwd=${wt}`)과 `'moved'`가 나온다.
    - Codex: 시작 뒤 `turn_context`(`cwd:wt`)와 `msg`를 append하면 같은 결과다.
    - 끝 64 KiB 안에 turn cwd가 없는 Codex 세션(70 KB 패딩 뒤 msg만)은 붙지 않는다.
  - `AC-W17 dormant sessions reattach from the saved offset with the gate`: T4의 W17 시나리오 뒤 범위 안 줄을 append하면, 해제된 세션이 다음 탐색에서 다시 붙고 저장 offset 이후의 범위 안 줄만 나온다.
  - `AC-W17 known is capped`: `dependencies.maxKnown:2`로 Codex 부모 3개를 만든다. 첫 부모의 child는 `parent session not found` NOTICE와 함께 제외된다.
- [x] **Step 2: 실패 확인.** Run: `node --test --test-timeout=120000 --test-name-pattern="AC-W(17|21|35|36|37)|subagent rollouts attach|Claude subagent labels" tests/node/watch-watcher.test.mjs` → FAIL
- [x] **Step 3: 구현.** 위 규칙대로 구현한다.
- [x] **Step 4: 통과 확인.** Step 2 명령이 PASS이고 `tests/node/watch-watcher.test.mjs` 전체도 PASS여야 한다.
- [x] **Step 5: manifest 재생성과 check:manifest PASS**
- [x] **Step 6: 회귀.** `node --test --test-timeout=120000 tests/node/watch-*.test.mjs` PASS
- [x] **Step 7: 커밋.** `feat(watch): 하위 에이전트 자기 cwd 판정과 최신 cwd attach`

**수용 기준:**
- AC-W21, W35, W36, W37을 만족한다.
- AC-W31(worktree 쪽)과 AC-W17(재부착·상한)을 만족한다.
- `:168` 보류 테스트를 유지한다.

**QA:** 필요(fresh QA). attach 조건이 바뀌므로 Desktop 자손이 새로 보이지 않는지(반목표) 확인하고, 탐색 비용 변화도 본다.

**위험:**
- R11: 끝 64 KiB만 본다.
- R13: dormant 세션이 추적 슬롯을 차지한다.
- R15: `known` 축출.
- startup probe 때문에 시작 비용이 늘어난다.

**진행 기록 (2026-11-15):**
- 수용됨. Implementer: bridge dispatch `e718388d`(segment 0–2). QA: bridge dispatch `150595a2`(segment 0–1).
- Orchestrator 실행 결정(승인 범위 안)
  - `:167`/`:170` 기대값 변경은 T4에서 이미 했다. Step 1에서는 `/outside` child 미출력 테스트만 추가했다.
  - 테스트 `move` 헬퍼에 timestamp를 넣었다. 실제 `turn_context` 줄은 timestamp를 가진다. 없으면 진입 SESSION이 현재 시각을 받아 과거 메시지 뒤로 정렬된다. watcher의 SESSION 시각 규칙은 바꾸지 않았다.
  - 부모가 확인된 자식은 codex_exec·Claude 신규 세션의 2초 라벨 보류에서 제외했다(AC-W21의 3초 조건). 최종 Reviewer 검토 대상이다.
  - 보류 루프 규칙을 범위 종류로 나눴다. `all`/`session`은 `!followed.has(row.parentId)`면 기존처럼 보류 후 진단하고, repo/dir는 `parentOf` 규칙을 따른다. 사용자 결정(`--all`/`--session`은 부모 추적 유지)과 AC-W36 기존 동작을 지키기 위해서다.
- QA finding(해결, 회귀 테스트 2건 추가)
  - F-T5-1: `--session`/`--all`에서 known이지만 추적되지 않는 부모의 자식이 보류·`parent session not found` 진단 없이 빠졌다. 위 보류 루프 분리로 해결했다.
- 결과
  - watcher 112/112, `watch-*` 326/327(기준선 help 실패 1건만 남음), check:manifest 통과. 전체 테스트 실패 목록은 기준선과 같다.
  - QA: AC-W35, W21, W36, W37, W17(재부착·상한), AC-W31·W32·W34의 worktree 쪽(루트·worktree watcher 동시 비교) 모두 proven.
- 한계
  - 탐색 비용은 실제 읽기 횟수를 계측하지 않았다. probe가 끝 64 KiB만 읽는 것은 T1 테스트와 AC-W37 패딩 테스트로, 크기·mtime이 같으면 다시 읽지 않는 것은 `cachedHead` 코드로 확인했다.
  - Desktop 조상 순환과 known 축출 시 라벨 변화는 실행 재현하지 않았다.
- 런타임이 segment 0에서 `refsChanged`를 보고했다. 다른 worktree의 `feat/tui-arc-diagram-flow` 커밋(`091d191`)으로, 외부 변경이다.

---

### Task T6: 새 중첩 worktree 즉시 제외

**목표:** §6.5.8을 구현한다. 줄 cwd로 처음 보는 중첩 worktree를 30초 갱신을 기다리지 않고 범위 밖으로 처리한다. 실패 결과는 캐시하지 않는다.

**Files (allowedPaths):**
- Modify: `lib/watch/watcher.mjs`, `MANIFEST.sha256`
- Test: `tests/node/watch-watcher.test.mjs`
- 손댈 위치(`watcher.mjs`): 새 helper, T4 `cwdInScope`, normalize 루프, discover의 probe 뒤, tick refresh `:448`

**Interfaces:**
- Consumes
  - T4: `cwdInScope`, `normalize` 루프
  - T5: probe 결과(`row.cwd`, `row.latestCwd`)
- Produces
  - `nestedChecks: Map<string,{inside:boolean}>`: 성공 결과만 넣는다. 상한은 `maxRepos`이고, 넘치면 가장 오래된 것부터 지운다.
  - `nestedFailures: Map<string,number>`: cwd별 마지막 실패 시각
  - `async verifyCwd(cwd, out): Promise<void>`
  - `cwdInScope`: `repo` 범위에서 경로상 범위 안이고 선택 루트가 아닌 cwd는 `nestedChecks.get(cwd)?.inside === true`일 때만 true다.

**규칙:**
- **확인 대상**
  - `scope.kind==='repo'`이고 `inScope(scope,cwd)`인 cwd
  - `path.resolve(cwd)`와 `realPath(cwd)`가 모두 `scope.roots[0]`과 다른 cwd
  - 캐시에 아직 없는 cwd
- **실패 직후:** 같은 cwd가 마지막 실패 후 `discoveryMs` 안이면 git을 부르지 않고 범위 밖으로 둔다.
- **확인 방법:** `git(cwd, GIT_ALLOWED[0])`를 try/catch로 부른다.
  - 실패: `null`, 빈 문자열, 예외. `nestedFailures.set(cwd,now())`를 기록한다.
  - 성공: `realPath(result.trim())`를 `scope.roots[0]`과 비교한다.
    - 같으면 `{inside:true}`를 캐시한다.
    - 다르면 `{inside:false}`를 캐시한다. 마지막 즉시 갱신에서 `discoveryMs`가 지났으면 `scope = await refreshScope(scope,git)`, `lastRefresh = now()`를 실행한다. 새 scope 객체에서는 `inScope` 캐시가 새로 시작된다.
- **호출 지점**
  1. `normalize` 루프에서 `setCwd` 직후, `lineGate` 전
  2. `discover`에서 `eligible` 판정 전, 각 행의 `row.cwd`와 `row.latestCwd`
  3. `attach`의 초기 cwd
- 기존 `gitTop`(`:160-172`, 실패도 캐시함)은 이 경로에 쓰지 않는다.

- [x] **Step 1: 실패 테스트 작성**
  - `AC-W39 a nested worktree seen in a line is excluded before the 30-second refresh`
    - 준비: 범위는 `repo`, `nested = path.join(s.cwd,'nested')`, `s.top(dir=>dir.startsWith(nested)?nested:s.cwd)`.
    - Claude 세션에 `cm(id,nested,'x')`를 append하면 `advance(500)` 뒤 tick이 0개다.
    - `s.calls`에 `{dir:nested,args:GIT_ALLOWED[0]}`가 있고, 그 뒤 `GIT_ALLOWED[2]` 호출도 있다. 30초를 기다리지 않는다.
  - `AC-W39 failed checks are not cached and retried after 2 seconds`
    - `sub = path.join(s.cwd,'src')`, `s.top(dir=>dir===sub?null:s.cwd)`로 준비한다. 첫 줄은 0개다.
    - 1초 뒤 같은 cwd의 줄이 와도 git 호출 수는 그대로이고 0개다.
    - `s.top(()=>s.cwd)`로 바꾼 뒤 `advance(2000)`하면 재확인이 1회 일어나고 이후 줄이 나온다.
    - 예외를 던지는 runner로도 결과가 같다.
  - Review Focus
    - `nested check caches an in-scope subdirectory once`: `src` 줄 3회 → `dir:sub`인 `GIT_ALLOWED[0]` 호출은 1회
    - `the selected root and its alias are never git-checked`: 루트와 symlink 별칭 cwd의 줄은 이 경로의 `GIT_ALLOWED[0]` 호출이 0회다. attach의 기존 `gitTop` 호출과 구분하려고 줄 처리 전후 호출 수 차이로 단언한다.
  - `AC-W05 dir scope never runs the nested check`: `dir` 범위에서 하위 cwd 줄이 와도 git 호출이 늘지 않는다.
  - `AC-W40 GIT_ALLOWED stays four commands`: `GIT_ALLOWED.length===4`이고 값도 기존과 같다.
- [x] **Step 2: 실패 확인.** Run: `node --test --test-timeout=120000 --test-name-pattern="AC-W39|AC-W05 dir|nested check|never git-checked|GIT_ALLOWED stays" tests/node/watch-watcher.test.mjs` → FAIL
- [x] **Step 3: 구현.** 위 규칙대로 구현한다.
- [x] **Step 4: 통과 확인.** Step 2 명령이 PASS이고, `tests/node/watch-watcher.test.mjs` 전체와 `tests/node/watch-scope.test.mjs`도 PASS여야 한다.
- [x] **Step 5: manifest 재생성과 check:manifest PASS**
- [x] **Step 6: 회귀.** `node --test --test-timeout=120000 tests/node/watch-*.test.mjs` PASS
- [x] **Step 7: 커밋.** `feat(watch): 줄 cwd로 관측한 중첩 worktree 즉시 제외`

**수용 기준:** AC-W39, AC-W05(즉시 제외, 30초 갱신 유지), AC-W40의 `GIT_ALLOWED` 항목을 만족한다.

**QA:** 필요(fresh QA). git 실패와 timeout 분기를 확인하고, 누출이 0건인지 본다.

**위험:**
- R14: 처음 보는 cwd마다 git을 기다리므로 출력이 늦어지고, 확인이 실패하면 그 줄은 빠진다.
- 하위 디렉터리가 많은 세션에서는 캐시 상한(32) 때문에 축출과 재확인이 생긴다.

**진행 기록 (2026-11-15):**
- 수용됨. Implementer: bridge dispatch `34afcec8`(segment 0–1). QA: bridge dispatch `7aa38c88`(segment 0).
- Orchestrator 실행 결정(승인 범위 안)
  - 새 테스트의 assistant fixture `content`를 문자열에서 text block 배열로 고쳤다. 실제 Claude 형식이며, 정규화기는 배열에서만 agent 이벤트를 만든다.
  - 성공한 중첩 확인 결과만 기존 `gitTopByCwd`에 넣어 다시 쓴다. 실패는 넣지 않는다.
  - 즉시 갱신 간격용 `lastNestedRefresh`를 두고, 즉시 갱신할 때 `lastRefresh`도 함께 갱신한다(30초 주기 갱신과 겹치지 않게).
- 결과
  - watcher 119/119, watch-scope 9/9, `watch-*` 333/334(기준선 help 실패 1건만 남음), check:manifest 통과. 전체 테스트 실패 목록은 기준선과 같다.
  - QA: AC-W39, W05, W40(`GIT_ALLOWED`), 선택 루트·별칭 미확인, 회귀, R14 모두 proven. 실제 git 임시 저장소의 중첩 worktree와 실제 runner timeout(100ms 주입)으로 확인했다. 캐시 축출 뒤 재확인도 확인했다.
- 한계: 출력 형식은 watcher 이벤트를 renderer에 넘겨 확인했고, CLI 프로세스로는 따로 재현하지 않았다.

---

### Task T7: watcher SKILL/PLUGIN 연동과 render 태그·색·본문

**목표:** 정규화 결과를 watcher가 정제하고 거른 뒤, render가 `SKILL`/`PLUGIN`으로 표시한다.

**Files (allowedPaths):**
- Modify: `lib/watch/watcher.mjs`, `lib/watch/render.mjs`, `lib/watch/index.mjs`, `MANIFEST.sha256`
- Test: `tests/node/watch-watcher.test.mjs`, `tests/node/watch-render.test.mjs`, `tests/node/watch-cli.test.mjs`
- 참고 위치
  - `watcher.mjs`: `:35-41` clean, `:79` normalize 호출, `:150` attach state 초기화, `:350` poll reset
  - `render.mjs`: `:73-76` tagColor, `:83-88` kindTag, `:90-98` eventText, `:136-138` renderJson fields
  - `index.mjs:144`: `createWatcher({options,homes:{...homes,user:userHome},scope,git,now})`

**Interfaces:**
- Consumes
  - T2: 이벤트 모양
  - T3: `createCodexState`, `normalizeCodexLine(obj,state,cfg)`, `skillOnly`
  - T4: 줄 게이트, `row.cwd`
- Produces
  - `kindTag(event)`
    - `tool`에 `skill`이 있으면 `'SKILL'`
    - `skill` 없이 `plugin`만 있으면 `'PLUGIN'`
    - `tool_failed`는 `'TOOL!'` 유지
  - `tagColor(event)`: SKILL `'38;5;110'`, PLUGIN `'38;5;175'`. 본문 색은 기존 `bodyColor` 규칙을 따른다(D2).
  - `eventText`
    - SKILL → `[skill, text]`
    - PLUGIN → `[plugin, tool]`
    - `tool_failed`에 `skill`이 있으면 `[tool, skill]`
    - `tool_failed`에 `plugin`만 있으면 `[tool, plugin]`
    - 그 밖은 기존과 같다.
  - `renderJson` fields: `'tool'` 뒤에 `'skill','plugin'`을 추가한다.

**watcher 규칙:**
- `row.codexState = createCodexState()`를 attach와 reset에서 만든다. 줄마다 `row.codexState.cwd = row.cwd`로 맞춘다.
- Codex 줄은 `normalizeCodexLine(line,row.codexState,{codexHome:homes.codex,userHome:homes.user})`로 정규화한다.
- `clean`은 `skill`과 `plugin`에 `sanitizeText`를 적용하고 `skillOnly`는 지운다.
- normalize 루프에서 `e.kind==='command' && e.skillOnly && !verbose`인 이벤트는 push하지 않는다. `row.active` 갱신은 그대로 한다.

- [x] **Step 1: 실패 테스트 작성**
  - `watch-render.test.mjs` `SKILL and PLUGIN tags, bodies and colors`
    - `{kind:'tool',tool:'Skill',skill:'arc',text:'x'}` → `SKILL    arc x`
    - `{kind:'tool',tool:'cua_repl.js',plugin:'unified-computer-use@openai-bundled'}` → `PLUGIN   unified-computer-use@openai-bundled cua_repl.js`
    - `{kind:'tool_failed',tool:'Skill',skill:'arc'}` → `TOOL!    Skill arc`
    - plugin skill `{tool:'Skill',skill:'a:b',plugin:'a'}` → `SKILL`
    - `color:true`면 `\x1b[38;5;110mSKILL`, `\x1b[38;5;175mPLUGIN`이 나오고, `color:false`면 ANSI가 없다.
  - `watch-render.test.mjs` `renderJson includes skill and plugin`
  - `watch-watcher.test.mjs` `AC-W41 Claude Skill and slash command render as SKILL`
    - 범위 안 세션에 Skill 호출과 픽스처 `claude-slash-command.jsonl` 줄을 넣는다.
    - `SKILL    arc x`와 `SKILL    find-skills <args>`가 각각 1개 나온다.
    - 기본, verbose, json 세 모드 모두 `Base directory`와 `# Find Skills`가 없다.
  - `watch-watcher.test.mjs` `AC-W42 Codex skill-only read replaces CMD by default`
    - `codexHome` 아래 `skills/arc/SKILL.md` read(exit 0)는 기본 모드에서 `SKILL    arc` 하나만 나오고 CMD는 없다.
    - `verbose`면 CMD도 나온다.
    - 같은 turn에 다시 read하면 추가 출력이 없고, `task_started` 뒤에는 다시 SKILL이 나온다.
  - `watch-watcher.test.mjs` `AC-W43 Codex pluginId and Claude plugin MCP render as PLUGIN`
    - `pluginId`가 있으면 `PLUGIN   unified-computer-use@openai-bundled cua.repl`
    - Claude `mcp__plugin_p_srv__t` → `plugin:'p'`
    - `pluginId`가 없으면 `TOOL     srv.call`
  - `watch-watcher.test.mjs` `AC-W44 SKILL and PLUGIN follow the gate and masking`
    - `args:'key sk-abcdefghijklmnopqrstu'`는 사람용과 json 모두에서 `***`로 가려진다.
    - `skill`의 제어문자가 제거된다.
    - 세션이 `wt`로 이동한 뒤의 Skill 호출은 0건이다.
    - `WATCH_KINDS` 배열이 기준선 값과 같다.
  - `watch-cli.test.mjs` `runWatch passes the user home for host skill roots`: 주입한 `userHome`과 `world_state`의 `~` 경로로 SKILL이 나오는 end-to-end 1건
- [x] **Step 2: 실패 확인.** Run: `node --test --test-timeout=120000 --test-name-pattern="SKILL|PLUGIN|AC-W4[1-4]|user home" tests/node/watch-render.test.mjs tests/node/watch-watcher.test.mjs tests/node/watch-cli.test.mjs` → FAIL
- [x] **Step 3: 구현.** 위 Interfaces와 규칙대로 구현한다.
- [x] **Step 4: 통과 확인.** Step 2 명령 PASS
- [x] **Step 5: manifest 재생성과 check:manifest PASS**
- [x] **Step 6: 회귀.** `node --test --test-timeout=120000 tests/node/watch-*.test.mjs` PASS
- [x] **Step 7: 커밋.** `feat(watch): SKILL과 PLUGIN 줄 표시`

**수용 기준:** AC-W41–W44를 종단으로 만족한다. 기존 render 색 테스트는 바뀌지 않는다.

**QA:** 필요(fresh QA). 내용 노출 관련 반목표(skill 본문, 비밀, CMD 이중 출력)를 세 출력 모드에서 확인한다.

**위험:** R18. args가 노출되고 마스킹은 완전하지 않다.

**진행 기록 (2026-11-15):**
- 수용됨. Implementer: bridge dispatch `f87125d6`(segment 0). QA: bridge dispatch `77c5bd1d`(segment 0).
- Step 2 패턴이 `renderJson includes skill and plugin` 테스트를 고르지 않아, 그 테스트는 따로 RED→GREEN을 확인했다.
- 결과
  - Step 2 6/6, `watch-*` 340/341(기준선 help 실패 1건만 남음), check:manifest 통과. 전체 테스트 실패 목록은 기준선과 같다.
  - QA: AC-W41–W44, render 태그·색·JSON 필드, user home 전달 모두 proven. 임시 home의 `runWatch` 종단으로 기본·verbose·JSON 세 모드에서 skill 본문 0건, 비밀값 마스킹, CMD 이중 출력 없음을 확인했다.
- 한계
  - 마스킹은 알려진 패턴에만 적용된다(R18).
  - skillOnly CMD가 history·hold·reset과 겹치는 경로는 기존 테스트와 코드 검토로 확인했고, 조합 전체를 따로 실행하지는 않았다.
- 런타임이 segment 0에서 `refsChanged`를 보고했다. 다른 worktree의 `feat/tui-arc-diagram-flow` 커밋(`9d2605d`)으로, 외부 변경이다.

---

### Task T8: help, 문서, manifest 최종화

**목표:** §5.3과 §17의 개정 3 문서 영향을 반영한다.

**Files (allowedPaths):** `lib/watch/index.mjs`, `README.md`, `docs/harness-operation.md`, `MANIFEST.sha256`, `tests/node/watch-cli.test.mjs`

- [ ] **Step 1: 실패 테스트 작성.** `watch-cli.test.mjs` `help lists line-time scope and SKILL/PLUGIN lines`
  - `--help` stdout이 spec §5.3 블록과 정확히 같다(전문 비교).
  - 새 두 줄은 `--help` 줄 뒤 빈 줄 다음, `User and agent messages…` 앞에 온다.
- [ ] **Step 2: 실패 확인.** Run: `node --test --test-timeout=120000 --test-name-pattern="help lists" tests/node/watch-cli.test.mjs` → FAIL
- [ ] **Step 3: 구현**
  - `WATCH_HELP`에 두 줄을 넣는다.
  - `README.md:41`을 spec §17 문구로 바꾸고 `Skills and plugin tools in use are shown as SKILL and PLUGIN lines.`를 덧붙인다.
  - `docs/harness-operation.md`
    - `:75` 문장을 spec §17 문구로 바꾼다.
    - `:116`에 중첩 worktree 즉시 제외와 64 KiB probe 문구를 추가한다.
    - 출력 형식 절에 `SKILL`(`38;5;110`)·`PLUGIN`(`38;5;175`) 태그, 본문 규칙, Codex skill-only CMD 대체(기본 모드)를 추가한다.
- [ ] **Step 4: 통과 확인.** Step 2 명령 PASS
- [ ] **Step 5: manifest와 runtime 확인**
  - `node scripts/update-manifest.mjs`를 실행한 뒤 `npm run check:manifest` PASS
  - `git diff --stat 31d304b -- lib/runtime` 결과가 비어 있다(runtime payload 무변경).
- [ ] **Step 6: 전체 기준선 비교.** `node --test --test-timeout=120000 tests/node/*.test.mjs`에서 기준선 `31d304b`보다 새 실패가 없다.
- [ ] **Step 7: 커밋.** `docs(watch): 줄 시점 범위와 SKILL/PLUGIN 안내 반영`

**수용 기준:**
- `--help`가 §5.3 전문과 일치한다.
- README와 harness 문구가 반영되었다.
- check:manifest가 통과한다.
- 전체 테스트에 새 실패가 없다.

**QA:** 불필요(문서, Orchestrator 확인).

**위험:** 낮음. README가 바뀌므로 manifest도 바뀐다.

---

## AC 대응표
| AC | 주 task | 보조 | 대표 테스트 |
|---|---|---|---|
| AC-W05 | T6 | T4, T1 | `AC-W05 dir scope…`, 기존 `watch-scope :27,:50,:57`, `watch-watcher :129` |
| AC-W17 (조정) | T4, T5 | T1 | `AC-W17 out-of-scope lines…`, `AC-W17 dormant…`, `AC-W17 known is capped`, `readLatestCwd…` |
| AC-W21 (조정) | T5 | — | `AC-W21 known-parent…`, `:167`, `:168` |
| AC-W31 | T4(루트), T5(worktree) | T1 | `AC-W31…`, `AC-W37…` |
| AC-W32 | T4 | — | `AC-W32…` 2건 |
| AC-W33 | T4 | — | `AC-W33…` |
| AC-W34 | T4 | T1 | `AC-W34…`, `codexLineCwd…` |
| AC-W35 | T5 | — | `AC-W35…` |
| AC-W36 | T5 | — | `AC-W36…` 2건, `:127`, `:168` |
| AC-W37 | T5 | T1 | `AC-W37…`, `claudeDirPrefixes…` |
| AC-W38 | T4 | T1 | `AC-W38…`, `Bash deletion paths use state.cwd…` |
| AC-W39 | T6 | — | `AC-W39…` 2건 |
| AC-W40 | T4 | T6 | `AC-W40…` 3건, bridge·dispatch 기존 테스트 |
| AC-W41 | T2 | T7 | normalize 8건, `AC-W41…` |
| AC-W42 | T3 | T7 | normalize 11건, `AC-W42…` |
| AC-W43 | T2, T3 | T7 | `plugin MCP…`, `McpToolCall pluginId…`, `AC-W43…` |
| AC-W44 | T7 | T2, T3 | `AC-W44…`, render 색 테스트 |
| §5.3, §17 문서 | T8 | — | `help lists…`, check:manifest |

## 검증 계획
- **task별:** 각 task의 Step 2/4 집중 명령, `tests/node/watch-*.test.mjs` 회귀, `npm run check:manifest`.
- **기준선:** Orchestrator가 T1 배정 전에 HEAD `31d304b`에서 전체 명령을 실행해 실패 목록을 기록한다.
- **최종:** T8 Step 6에서 전체 테스트를 기준선과 비교한다.
- **QA:** T4, T5, T6, T7은 수용 전에 fresh QA를 받는다. T1, T2, T3, T8은 Orchestrator가 집중 확인한다.
- **Reviewer:** 모든 task 수용과 필수 QA가 끝난 뒤 base `31d304b`..HEAD 전체 변경을 1회 검토한다(위험 significant).
  - 최종 Reviewer 지적은 Implementer → Reviewer 재확인으로 처리한다.
  - 수정은 커밋하지 않은 채로 해결한 뒤 집중 후속 커밋 하나로 만든다.

## 커밋 계획
1. 계획 승인 후 spec 개정 3과 이 계획 문서를 docs 커밋 하나로 만든다(Orchestrator): `docs(watch): 개정 3 spec과 구현 계획 추가`
2. T1–T8은 각각 수용 후 집중 커밋 하나로 만든다(Orchestrator). 메시지는 각 task의 Step 7을 쓴다.
3. 최종 Reviewer 후속이 있으면 집중 후속 커밋 하나를 만든다.

## 위험·보류
- spec R11–R18은 각 task의 위험란에 대응시켰다.
- 계획 고유 위험
  - (a) `normalize`가 async로 바뀌면서 이벤트 순서가 달라질 수 있다. tick 정렬로 완화한다.
  - (b) startup probe 때문에 시작 비용이 늘어난다.
  - (c) 테스트 harness의 `top` 주입은 모든 dir에 같은 값을 돌려준다. 그래서 중첩 테스트에서는 함수형 주입이 필요하다.
- 보류: 실행 중 spec이나 계획을 바꿔야 하면, 해당 task를 시작하기 전에 승인을 받아 원래 planning 문서 커밋을 갱신한다.
