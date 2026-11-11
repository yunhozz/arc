# ARC watch 메시지 전체 출력과 표시 개정 Implementation Plan

> ARC Orchestrator가 top-level task 단위로 조정한다. 단계 진행은 체크박스(`- [ ]`)로 추적한다. Implementer는 Git 상태를 바꾸지 않는다. 각 task는 수락된 뒤 Orchestrator가 focused commit 하나로 남긴다.

**Goal:** `arc watch`의 USER/AGENT 메시지를 생략 없이 원문 줄 구조로 출력하고, 사람용 라벨 칸을 없앤다. KIND별 색과 CLAUDE 주황, `AGENT(<name>)` 태그를 적용한다.

**Architecture:**
- 정규화 직후 `user`/`agent`에는 줄바꿈을 보존하는 `sanitizeMessage`를 적용하고, 다른 kind에는 기존 `sanitizeText`를 적용한다.
- 렌더러는 메시지 kind에 한해 걸이 들여쓰기 방식의 여러 줄 출력을 하고, 나머지는 현행 한 줄 자르기를 유지한다.
- 색과 태그 규칙은 렌더러의 상수 표로 고정한다.

**Tech Stack:** Node.js 22 ESM, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-11-arc-watch-design.md` 개정 1 (승인됨, sha256 `167c7550…a2f995`)

## Global Constraints

- 코드는 `lib/watch/` 안에서만 바꾼다. `lib/runtime/`은 바꾸지 않는다. 새 dependency는 없다.
- watch 경로는 `tui`, `safe-fs`, `installer`를 import하지 않는다.
- 출력 라벨과 help는 영어다.
- JSON 스키마는 `v:1`을 유지한다. `label` 필드도 유지한다.
- `user`/`agent`가 아닌 kind의 JSON `text`는 최대 1000 code point이고, 잘렸으면 `truncated:true`다.
- 마스킹(§12)과 도구·명령 출력 숨김(§11)은 그대로 둔다.
- 색 조건은 TTY이고, `NO_COLOR`가 없고, `--json`이 아닐 때다.
- 색 값(SGR)

| 대상 | 값 |
|---|---|
| platform codex | `36` |
| platform claude | `38;5;208` |
| platform watch/arc | `2` |
| USER | `1;35` |
| AGENT | `32` |
| CMD, CMD(0) | `38;5;242` |
| CMD(n≠0) | `31` |
| EDIT | `33` |
| TOOL | `38;5;250` |
| SPAWN | `38;5;141` |
| DISPATCH | `38;5;137` |
| APPROVE | `1;4` |
| FAIL, ERROR, TOOL! | `31` |
| SESSION, END, NOTICE, SETTINGS, TURN, THINK, ITEM | `2` |

- 문서 수정 순서: `README.md`와 `docs/harness-operation.md`는 Plan I 이후 W1 → W2 순서로 고친다. `MANIFEST.sha256`은 각 task마다 다시 생성한다.
- 테스트 명령: `node --test --test-timeout=120000 <files>`.
- 기준선: Plan I 최종 수락 후 HEAD에서 Orchestrator가 `node --test --test-timeout=120000 tests/node/*.test.mjs`의 실패 목록을 기록한다. 각 task는 이 기준선 대비 새 실패가 없어야 한다.

## Review Focus

1. 공백이나 빈 줄만 있는 메시지는 머리말만 출력되고 예외가 없어야 한다. 테스트는 W1의 `sanitizeMessage of blank-only text is empty`와 `empty message renders the prefix only`다.
2. 커서 이동이나 화면 지우기 escape(`\x1b[2J`, OSC 8 링크, CSI `\x9b`)가 들어간 메시지는 어느 줄에서도 실행 가능한 제어문자를 남기지 않아야 한다. 테스트는 W1의 `sanitizeMessage strips escapes and controls and normalizes newlines and tabs`다.
3. 한 줄이 `--width`와 1000 code point를 모두 넘는 메시지는 두 출력 모드에서 끝까지 나와야 한다. 테스트는 W1의 `message lines keep full text with hanging indent`와 `renderJson keeps full message text with newlines and no truncated`다.
4. 이미 정제된 text를 렌더러가 다시 정제해도 결과가 같아야 한다(멱등). 테스트는 W1의 `sanitizeMessage is idempotent`다.
5. 역할을 모르는 하위 에이전트의 이름이 아주 길면 20 code point로 줄여야 하고, 들여쓰기 폭도 그 태그에 맞아야 한다. 테스트는 W2의 `AGENT tag shows role, subagent label tail or plain AGENT`와 `continuation indent follows a long AGENT tag`다.

## 파일과 task별 수정 순서

| 파일 | W1 | W2 |
|---|---|---|
| `lib/watch/policy.mjs` | `sanitizeMessage` 추가 | — |
| `lib/watch/model.mjs` | `MESSAGE_KINDS` 추가, `labelWidth` 제거 | `agentNameMax: 20` 추가 |
| `lib/watch/watcher.mjs:33-37` | `clean`을 kind별로 분기 | — |
| `lib/watch/render.mjs` | 라벨 칸 제거, 메시지 여러 줄, `renderJson` 메시지 규칙 | `kindTag` AGENT 이름, 색 표 |
| `lib/watch/index.mjs` | `WATCH_HELP` 두 줄 | — |
| `README.md`, `docs/harness-operation.md` | 형식·전체 출력·JSON 규칙 | 색 표·AGENT 태그 |
| `MANIFEST.sha256` | 재생성 | 재생성 |

---

### Task W1: 메시지 전체 출력과 라벨 칸 제거 (Q3)

**목표와 범위:**
- spec 개정 1의 §5.1, §5.3, §7, §9, §11, §12, §13.1(형식과 줄 규칙), §13.2, §17을 구현한다.
- 색과 AGENT 태그는 W2에서 한다. W1에서는 현행 색 로직을 라벨 칸 없이 그대로 둔다.

**선행 작업:** Plan I 최종 Reviewer 완료와 기준선 기록.

**Files:**
- Modify: `lib/watch/policy.mjs`, `lib/watch/model.mjs:5-14`, `lib/watch/watcher.mjs:33-37`, `lib/watch/render.mjs:25-69`, `lib/watch/index.mjs`(WATCH_HELP)
- Modify tests: `tests/node/watch-policy.test.mjs`, `tests/node/watch-render.test.mjs:6-28`, `tests/node/watch-watcher.test.mjs`, `tests/node/watch-cli.test.mjs`
- Modify: `README.md`(Watch sessions 절), `docs/harness-operation.md`(watch 하위 절)
- Regenerate: `MANIFEST.sha256`

**Interfaces:**
- Consumes: 없음
- Produces:
```js
// lib/watch/model.mjs
export const MESSAGE_KINDS = Object.freeze(['user','agent']);
// lib/watch/policy.mjs
export function sanitizeMessage(value /*unknown*/) /*: string*/   // spec §11 A 1~5단계. 문자열이 아니면 ''
// lib/watch/render.mjs
export function renderHuman(event, {width, color, verbose}) /*: string*/   // 메시지 kind는 '\n'을 포함할 수 있음
export function renderJson(event) /*: string*/
```

**결정 사항:**
- **머리말:** `${time} ${platform 6칸} ${tag.padEnd(8)} `. 들여쓰기는 `' '.repeat([...머리말].length)`다.
- **메시지 줄 출력**
  - text를 `\n`으로 나눈다.
  - 빈 줄은 `''`로 쓴다(들여쓰기 없음).
  - 자르지 않고 `…`도 붙이지 않는다.
  - text가 비어 있으면 머리말에서 끝 공백을 뺀 값만 쓴다.
- **메시지 아닌 줄:** 현행처럼 `clipCodePoints(prefix + text, width)`를 쓴다.
- **`renderJson`:** `MESSAGE_KINDS`이면 `text = sanitizeMessage(value)`이고 자르지 않으며 `truncated`를 쓰지 않는다. 그 밖은 현행이다.
- **`watcher.clean`:** `MESSAGE_KINDS`이면 `text`에 `sanitizeMessage`를 적용하고, 그 밖은 `sanitizeText`를 적용한다. `tool`과 `paths`는 현행대로다.
- **help 두 줄**
  - `  --width <n>         Maximum width of one-line events (default: terminal width, or 200)`
  - `User and agent messages are shown in full; other events use one line.`(`Tool and command outputs …` 줄 바로 앞)

**Steps:**

- [ ] **Step 1: 실패 테스트 작성** (`tests/node/watch-policy.test.mjs`)
```js
test('sanitizeMessage keeps line structure and indentation', () => {
  assert.equal(sanitizeMessage('\n\nfirst  \n  - item\n\n  code\n\n'), 'first\n  - item\n\n  code');
});
test('sanitizeMessage strips escapes and controls and normalizes newlines and tabs', () => {
  assert.equal(sanitizeMessage('a\r\nb\rc d e'), 'a\nb\nc\nd\ne');
  assert.equal(sanitizeMessage('\tx'), '    x');
  assert.equal(sanitizeMessage('a\x1b[2Jb\x1b]8;;http://x\x07c\x9b31md\x07\x00e'), 'abcde');
});
test('sanitizeMessage masks secrets on any line including PEM blocks', () => {
  assert.equal(sanitizeMessage('ok\nGITHUB_TOKEN=abc\nauthor: Kim'), 'ok\nGITHUB_TOKEN=***\nauthor: Kim');
  assert.equal(sanitizeMessage('keep\n-----BEGIN RSA PRIVATE KEY-----\nAAA\nBBB'), 'keep\n***');
  assert.match(sanitizeMessage('x\nBearer abcdef0123456789'), /\nBearer \*\*\*$/);
});
test('sanitizeMessage of blank-only text is empty', () => { assert.equal(sanitizeMessage(' \n\t\n '), ''); assert.equal(sanitizeMessage(null), ''); });
test('sanitizeMessage is idempotent', () => { const s = sanitizeMessage('a\r\n\tb\nGITHUB_TOKEN=x'); assert.equal(sanitizeMessage(s), s); });
```

- [ ] **Step 2: 실행해서 실패 확인**
  - Run: `node --test --test-timeout=120000 tests/node/watch-policy.test.mjs`
  - Expected: FAIL(export 없음)

- [ ] **Step 3: `policy.mjs`의 `sanitizeMessage`와 `model.mjs`의 `MESSAGE_KINDS` 구현**

- [ ] **Step 4: 실행해서 통과 확인** (Step 2 명령, PASS)

- [ ] **Step 5: 렌더러 실패 테스트 작성** (`tests/node/watch-render.test.mjs`)
  - 기존 `:6-15`의 고정 칸 테스트와 `:20-28`의 라벨 자르기 테스트를 다음으로 바꾼다.
```js
test('renderHuman has no label column', () => {
  const line = renderHuman(event, options);
  assert.equal(line.slice(9,15), 'codex ');
  assert.equal(line.slice(16,24), 'CMD(0)  ');
  assert.equal(line.slice(25), 'git status');
  assert.ok(!line.includes('tui#e2e8'));
});
test('message lines keep full text with hanging indent', () => {
  const long = 'x'.repeat(300);
  const out = renderHuman({...event, kind:'agent', text:`first\n  second\n\n${long}`}, {...options, width:40}).split('\n');
  const indent = ' '.repeat(25);
  assert.deepEqual(out.slice(1), [indent + '  second', '', indent + long]);
  assert.ok(out[0].endsWith(' AGENT    first'));
  assert.ok(!out.join('\n').includes('…'));
});
test('empty message renders the prefix only', () => { assert.equal(renderHuman({...event, kind:'user', text:''}, options).slice(16), 'USER'); });
test('non-message lines still clip to width', () => {
  const line = renderHuman({...event, text:'y'.repeat(500)}, {...options, width:80});
  assert.ok([...line].length <= 80 && line.endsWith('…'));
});
test('renderJson keeps full message text with newlines and no truncated', () => {
  const text = 'a\n' + '😀'.repeat(1500);
  const parsed = JSON.parse(renderJson({...event, kind:'user', text}));
  assert.equal(parsed.text, text); assert.equal(parsed.truncated, undefined); assert.equal(parsed.label, 'tui#e2e8');
});
test('renderJson still clips other kinds', () => {
  const parsed = JSON.parse(renderJson({...event, text:'😀'.repeat(1500)}));
  assert.equal([...parsed.text].length, 1000); assert.equal(parsed.truncated, true);
});
```
  - `tests/node/watch-watcher.test.mjs`에 `user and agent text keep newlines after normalization`을 추가한다. Claude fixture 메시지 `'a\nb'` → 이벤트 `text === 'a\nb'`, command 이벤트는 공백 병합을 유지한다.
  - `tests/node/watch-cli.test.mjs`에 다음 두 테스트를 추가한다.
    - `human output has no session labels while json keeps label` (AC-W26, W09, W10, W19·W22의 label 부분). 기존 `:197` JSON 라벨 fixture 재사용. 사람용 출력에 `/(tui|exec|main)[^ ]*#[0-9a-z]{4}|\b[a-z]+@[0-9a-z]{4}\b/`가 없고, `--json` 각 줄 `label` 값이 기존 기대값과 같다.
    - `help describes one-line width and full messages` (AC-W02). §5.3 두 줄이 포함된다.

- [ ] **Step 6: 실행해서 실패 확인**
  - Run: `node --test --test-timeout=120000 tests/node/watch-render.test.mjs tests/node/watch-watcher.test.mjs tests/node/watch-cli.test.mjs`
  - Expected: FAIL

- [ ] **Step 7: 구현** — `watcher.mjs`의 `clean`, `render.mjs`(라벨 칸 제거, 메시지 분기, `renderJson`), `model.mjs`의 `labelWidth` 제거, `index.mjs` help.

- [ ] **Step 8: 실행해서 통과 확인** (Step 6 명령 + `tests/node/watch-policy.test.mjs`, PASS)

- [ ] **Step 9: 문서와 MANIFEST**
  - README Watch sessions 절에 `User and agent messages are shown in full; other events use one line.`을 추가한다.
  - `docs/harness-operation.md` watch 하위 절에 라벨 칸 삭제, 메시지 전체 출력, JSON `text`·`label` 규칙을 반영한다.
  - Run: `node scripts/update-manifest.mjs && npm run check:manifest`
  - Run: `node --test --test-timeout=120000 tests/node/*.test.mjs`
  - Expected: 기준선 대비 새 실패 없음

**수용 기준:** AC-W02, AC-W08, AC-W09, AC-W10, AC-W13, AC-W15, AC-W24, AC-W25, AC-W26, AC-W19·AC-W22의 `label` 부분. Review Focus 1~4.

**수락 전 검증:**
- Implementer: RED/GREEN 증거.
- Fresh QA(권장, 노출 범위 확대):
  - watch 테스트 4개 파일을 재실행한다.
  - 임시 홈 fixture에서 다음 세 경우를 확인한다.
    - 여러 줄 Claude 메시지(CRLF, 탭, PEM, ANSI 포함)를 사람용과 `--json`으로 출력해 원문 대비 마스킹·정제 결과를 남긴다.
    - 도구 출력 표지 문자열이 나오지 않는다(AC-W13 회귀).
    - `script` 등 PTY 캡처로 걸이 들여쓰기 화면 1회를 남긴다.

**Hold 조건:**
- `index.mjs`가 렌더 결과를 줄 단위로 처리하는 다른 경로(예: tail 개수 계산)를 갖고 있어 여러 줄 문자열이 이벤트 수 계산을 바꾼다면 반환한다. tail은 이벤트 수 기준이어야 한다.
- `lib/runtime` 변경이 필요해지면 반환한다.

**Commit (수락 후 Orchestrator):** `feat(watch): 메시지 전체 출력과 라벨 칸 제거`

---

### Task W2: KIND 색, CLAUDE 주황, AGENT(name) (Q5, Q6)

**목표와 범위:** spec 개정 1의 §13.1 AGENT 태그 규칙과 색 표, §17 문서(색과 태그).

**선행 작업:** W1 수락. `render.mjs`, `model.mjs`, 문서, MANIFEST를 W1 다음 순서로 수정한다.

**Files:**
- Modify: `lib/watch/render.mjs:4-10,25-44`, `lib/watch/model.mjs:5-14`
- Modify tests: `tests/node/watch-render.test.mjs:16-19,38-41`, `tests/node/watch-cli.test.mjs`
- Modify: `docs/harness-operation.md`(watch 하위 절), README(색·태그 언급이 있으면)
- Regenerate: `MANIFEST.sha256`

**Interfaces:**
- Consumes (W1): `MESSAGE_KINDS`, 머리말 폭 계산(`[...prefix].length`)
- Produces:
```js
// lib/watch/render.mjs
export const PLATFORM_COLORS = Object.freeze({codex:'36', claude:'38;5;208', other:'2'});
export function tagColor(event) /*: string*/   // Global Constraints 색 표
export function kindTag(event) /*: string*/    // AGENT(<name>) 규칙 포함
// lib/watch/model.mjs
WATCH_LIMITS.agentNameMax = 20
```

**결정 사항:**
- **AGENT 이름**
  - `event.role`이 있으면 그 값이다.
  - 그렇지 않고 `event.source === 'subagent'`이고 `label`에 `/`가 있으면 마지막 구간이다.
  - 그 밖에는 이름 없이 `AGENT`다.
  - 이름은 `clipCodePoints(name, 20)`으로 줄인다(초과 시 19자와 `…`).
- **칠하는 범위:** 태그 문자열만 칠하고, 8칸 채움 공백은 칠하지 않는다. 예: `\x1b[32mAGENT(implementer)\x1b[0m` 뒤에 공백 1개.
- **실패 줄:** `turn_failed`, `error`, `tool_failed`, `CMD(n≠0)`은 본문을 `31`로 칠한다(현행 유지).
- **메시지 이어지는 줄:** 색 코드를 넣지 않는다.
- **메타 kind:** `session`, `turn_end`, `notice`, `settings`, `turn_start`, `reasoning`, `other`.

**Steps:**

- [ ] **Step 1: 실패 테스트 작성** (`tests/node/watch-render.test.mjs`)
```js
test('AGENT tag shows role, subagent label tail or plain AGENT', () => {
  assert.equal(kindTag({kind:'agent', role:'implementer'}), 'AGENT(implementer)');
  assert.equal(kindTag({kind:'agent', source:'subagent', label:'main#7f77/general-purpose'}), 'AGENT(general-purpose)');
  assert.equal(kindTag({kind:'agent', source:'subagent', label:'tui#e2e8/qa/' + 'N'.repeat(25)}), 'AGENT(' + 'N'.repeat(19) + '…)');
  assert.equal(kindTag({kind:'agent', source:'session', label:'tui#e2e8'}), 'AGENT');
  assert.equal(kindTag({kind:'agent', source:'bridge', role:'planner', label:'planner@b9a1'}), 'AGENT(planner)');
  assert.equal(kindTag({kind:'command', role:'qa', exitCode:0}), 'CMD(0)');
});
test('continuation indent follows a long AGENT tag', () => {
  const out = renderHuman({...event, kind:'agent', role:'planner', text:'a\nb'}, options).split('\n');
  assert.equal(out[1], ' '.repeat(31) + 'b');
});
test('tag colors follow the table and include the parenthesized part', () => {
  const table = [[{kind:'user'},'1;35','USER'],[{kind:'agent',role:'qa'},'32','AGENT(qa)'],[{kind:'command'},'38;5;242','CMD'],
    [{kind:'command',exitCode:0},'38;5;242','CMD(0)'],[{kind:'command',exitCode:1},'31','CMD(1)'],[{kind:'file_change'},'33','EDIT'],
    [{kind:'tool'},'38;5;250','TOOL'],[{kind:'spawn'},'38;5;141','SPAWN'],[{kind:'dispatch'},'38;5;137','DISPATCH'],[{kind:'approval'},'1;4','APPROVE'],
    [{kind:'turn_failed'},'31','FAIL'],[{kind:'error'},'31','ERROR'],[{kind:'tool_failed'},'31','TOOL!'],
    ...['session','turn_end','notice','settings','turn_start','reasoning','other'].map(kind => [{kind}, '2', kindTag({kind})])];
  for (const [input, code, tag] of table) {
    const line = renderHuman({...event, ...input, text:'t'}, {...options, color:true, verbose:true});
    assert.ok(line.includes(`\x1b[${code}m${tag}\x1b[0m`), tag);
    assert.notEqual(code, '36'); assert.notEqual(code, '38;5;208');
  }
});
test('platform colors: codex 36, claude 38;5;208, watch and arc 2', ...)   // 세 경우 \x1b[<code>m<platform padded> 포함
test('failure bodies are red and message continuation lines carry no color', ...)
  // CMD(1) 줄 본문 '\x1b[31mnode --test\x1b[0m'
  // agent 'a\nb' 색 출력의 둘째 줄에 '\x1b[' 없음
```
  - `tests/node/watch-cli.test.mjs`의 기존 `NO_COLOR`·`--json`·비TTY 무색 테스트를 W2 출력으로 재확인한다(AC-W04).
  - 같은 파일에 다음을 추가한다. `bridge and subagent AGENT lines show the role` (AC-W19, AC-W22 사람용 부분). 기존 bridge·Codex 하위 에이전트 fixture에서 AGENT 줄이 `AGENT(planner)`, `AGENT(qa)`이다.

- [ ] **Step 2: 실행해서 실패 확인**
  - Run: `node --test --test-timeout=120000 tests/node/watch-render.test.mjs tests/node/watch-cli.test.mjs`
  - Expected: FAIL

- [ ] **Step 3: `render.mjs`(`kindTag`, `PLATFORM_COLORS`, `tagColor`, 칠하기)와 `model.mjs`(`agentNameMax`) 구현**

- [ ] **Step 4: 실행해서 통과 확인** (Step 2 명령, PASS)

- [ ] **Step 5: 문서와 MANIFEST**
  - `docs/harness-operation.md` watch 하위 절에 색 표와 AGENT 태그 규칙을 추가한다.
  - Run: `node scripts/update-manifest.mjs && npm run check:manifest`
  - Run: `node --test --test-timeout=120000 tests/node/*.test.mjs`
  - Expected: 기준선 대비 새 실패 없음

**수용 기준:** AC-W04, AC-W27, AC-W28, AC-W19·AC-W22의 사람용 AGENT 부분. Review Focus 5.

**수락 전 검증:** Step 2·4·5 출력이 증거다. 집중 검사로 충분하다(표시 전용 변경). TTY 색 출력 샘플 1회(PTY 캡처의 SGR 문자열)를 증거로 남긴다.

**Hold 조건:** 기존 fixture에서 bridge 이벤트의 `role`이 비어 있어 AC-W19 사람용 기대를 만족할 수 없다면 반환한다. 매핑 데이터 문제이며 W2 범위 밖이다.

**Commit (수락 후 Orchestrator):** `feat(watch): KIND별 색과 AGENT 역할 태그`

---

### Task W3: 최종 리뷰 후속 (개정 2, L2·L4·L5·L6)

**목표와 범위:** spec 개정 2(§23)를 구현한다. compact summary를 USER 전체 출력에서 빼고, verbose 진단 NOTICE의 라벨을 세션 id 앞 8자로 바꾸고, `--key value` 마스킹 regex에 앞 경계와 키 길이 상한을 두고, README watch 절을 3~5줄로 줄인다.

**선행 작업:** W1, W2 수락과 최종 Reviewer 1차 리뷰. 최종 Reviewer 후속이므로 수정은 Reviewer 재확인까지 미커밋으로 두고 Implementer → Reviewer로 진행한다(QA 재배정 없음).

**Files:**
- Modify: `lib/watch/normalize-claude.mjs`, `lib/watch/watcher.mjs`(진단 NOTICE), `lib/watch/policy.mjs:15`
- Modify tests: `tests/node/watch-normalize-claude.test.mjs`, `tests/node/watch-watcher.test.mjs`, `tests/node/watch-policy.test.mjs`, `tests/node/watch-cli.test.mjs`(필요 시), fixture `tests/node/fixtures/watch/claude-main.jsonl`(compact summary 줄 추가 시)
- Modify: `README.md`(Watch sessions 절), `docs/harness-operation.md`(필요 시)
- Regenerate: `MANIFEST.sha256`

- [ ] **Step 1: 실패 테스트 작성** — AC-W29(기본 숨김, verbose 한 줄 NOTICE, JSON 동일 정책), AC-W26 verbose NOTICE 라벨 부재(`<id8>` 사용), AC-W30(경계 없는 `a--key v` 미적용·65자 키 미적용·4 MiB 입력 처리 시간 상한).
- [ ] **Step 2: 실행해서 실패 확인** — `node --test --test-timeout=120000 tests/node/watch-*.test.mjs`
- [ ] **Step 3: 구현**
- [ ] **Step 4: 실행해서 통과 확인** (Step 2 명령)
- [ ] **Step 5: README 축소, MANIFEST 재생성, `npm run check:manifest`, `npm run check:role-policy`**

**수용 기준:** AC-W26(개정 2), AC-W29, AC-W30, L6 README 분량. 기존 watch 테스트 회귀 없음.

**수락 전 검증:** 최종 Reviewer 재확인, Orchestrator 호스트 전체 회귀.

**Commit (수락 후 Orchestrator):** `fix(watch): 최종 리뷰 지적 반영`

---

## 최종 검증 (W1, W2 수락 후)

- **선행 조건:** W1, W2가 수락·커밋되었고 W1 QA가 끝났다.
- **Orchestrator 기준선 비교:** 다음 두 명령을 실행해 기준선 대비 새 실패가 없음을 확인한다.
  - `node --test --test-timeout=120000 tests/node/*.test.mjs`
  - `npm run check:manifest`
- **최종 Reviewer 1회:**
  - 대상: Plan I 최종 HEAD부터 W2 커밋까지의 전체 diff.
  - 중점: 마스킹·숨김 정책 회귀(여러 줄 경로), JSON 계약(`v:1`, `label`, `truncated`), 색 표와 태그 규칙의 spec 일치, Review Focus 5개.
  - Reviewer 지적은 Implementer → Reviewer로 해결한다. 수정은 재확인까지 미커밋으로 두고, 수락 후 focused follow-up commit 하나로 남긴다.

