# `arc watch` 플랫폼 다중 선택 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `arc watch` 시작 메뉴를 "All 또는 플랫폼 하나 고르기"에서 "지원 플랫폼을 체크박스로 여러 개 고르고 `Watch`로 확정"으로 바꾼다. 기본값은 지원 플랫폼 전체 체크(기존 All과 같은 결과)다.

**Architecture:** `lib/watch/menu.mjs` 안에서 기존 `ui.menu`를 다시 쓰고 Configure Hosts(`lib/tui/setup.mjs:80-105`)의 체크리스트 관례를 따른다. 체크 상태는 menu 루프가 갖고, 매 반복마다 행 문자열을 다시 만든다. 공용 TUI 변경은 `lib/tui/render.mjs`의 `navigationHint('checklist')`에 `backLabel==='exit'` 변형을 더하는 것 하나뿐이다. 기본 문자열은 바꾸지 않는다.

**Tech Stack:** Node.js ≥22 ESM, `node --test`.

**Spec:** 별도 spec 없음. 승인 설계는 `.git/arc/handoff/2026-11-21-final-verify-models-watch.md`의 "## C." 절이다(설계 브리프 C-C1~C-C8 포함).

## Global Constraints
- 대상: `/Users/yunho/Desktop/project/arc/.claude/worktrees/watch-platform-multiselect`, 브랜치 `feat/watch-platform-multiselect`, base `68ef36c864f7dfe6fa1bebffc15906f2d95a16a7`.
- watch 코드는 `management/`, `installer/`, `safe-fs/`를 import하지 않는다(`tests/node/watch-import-graph.test.mjs:6-23`). 새 import는 `../tui/*`로만 한정한다.
- 플랫폼 대칭: 지원 여부는 `capabilities.watch.state === 'verified'`로만 판단한다. 코드·문서에 특정 플랫폼 이름을 하드코딩하지 않는다.
- 고정 문구(원문 그대로):
  - 체크 행 `[x] <Label>`, 해제 행 `[ ] <Label>`, 미지원 행 `[-] <Label>  (not supported)`(공백 2칸)
  - 확정 행 `Watch`, 돌아가기 행 `Back`(기존 backRow)
  - 미지원 Enter 안내 `<Label> is not supported by arc watch.`(기존 문구)
  - 빈 선택 확정 안내 `Select at least one platform to watch.`
  - 하단 힌트 `↑/↓: Select · Enter Toggle · Esc Exit`
- 메뉴 제목은 `Which platform to watch?`에서 `Which platforms to watch?`로 바꾼다(사용자 결정 2026-11-21). 테스트 헬퍼·화면 필터의 제목 매칭(`tests/node/watch-cli.test.mjs:669,723,739`)도 새 제목으로 바꾼다.
- 종료 계약: `Watch` 확정 시 체크된 id 배열(표시 순서)을 돌려준다. Back, Esc, EOF는 `null`(exit 0)이고 Ctrl-C는 130으로 유지한다.
- Python을 실행할 때는 `PYTHONDONTWRITEBYTECODE=1`을 붙인다.

---

### Task 1: watch 메뉴 체크리스트화와 연결 산출물 (C1)

**목표·범위:** C-C1~C-C8 전부를 하나의 focused commit으로 만든다. 메뉴 동작, 공용 힌트 변형, help, README, 운영 문서, MANIFEST는 서로 떼어 낼 수 없으므로 한 task에 묶는다.

**Files:**
- Modify: `lib/watch/menu.mjs:4-43` (`watchMenuRows`, `chooseWatchPlatforms`)
- Modify: `lib/tui/render.mjs:16` (`navigationHint` checklist 분기)
- Modify: `lib/watch/index.mjs:18` (`WATCH_HELP` Scope 문단)
- Modify: `README.md:43`, `docs/harness-operation.md:136`
- Modify: `MANIFEST.sha256` (`node scripts/update-manifest.mjs`로 생성, 손으로 고치지 않음)
- Test: `tests/node/watch-cli.test.mjs` (:120-129 help, :669·:723·:739 제목 매칭, :701-757 메뉴, :759-762 dispose 케이스), `tests/node/tui-render.test.mjs` (:20 부근)

**선행:** 없음.

**Interfaces (Produces):**
- `watchMenuRows(registry) -> Array<{id:string,label:string,supported:boolean}>`: 순수 함수이며 `registry.byDisplayOrder()` 순서를 따른다. 체크 상태는 담지 않는다.
- `chooseWatchPlatforms({input,output,env,signals,registry,createSession}) -> Promise<string[]|null>`: 시그니처와 반환 계약은 기존 그대로다.
- `navigationHint('checklist',{backLabel:'exit'}) === '↑/↓: Select · Enter Toggle · Esc Exit'`. 인자가 없을 때의 결과는 `'↑/↓: Select · Enter Toggle · Esc Home'`으로 바뀌지 않는다.

**동작 결정:**
- 행 구성은 `[...플랫폼 행, 'Watch']`이고, `ui.menu` 옵션은 `{backRow:true, backLabel:'exit', hint:'checklist', actionKinds:[...플랫폼 행 수만큼 undefined, 'confirm'], selected, notice}`다. Back은 backRow가 마지막에 붙인다.
- 초기 체크는 `supported`인 id 전체다. 첫 반복의 커서는 `Watch` 행(index = 플랫폼 수)이다.
- 플랫폼 행에서 Enter를 누르면 지원 행은 체크를 토글하고 안내를 지운다. 미지원 행은 체크하지 않고 미지원 안내를 띄운다. 두 경우 모두 다음 반복의 커서는 그 행에 둔다.
- `Watch` 행에서 Enter를 누르면, 체크가 1개 이상이면 `rows.filter(r=>checked.has(r.id)).map(r=>r.id)`를 반환한다(표시 순서). 체크가 0개이면 반환하지 않고 `Select at least one platform to watch.` 안내를 띄우며 커서는 `Watch`에 둔다.
- 안내 해제 규칙은 기존 `previous` 패턴과 같다. 커서가 안내를 띄운 행에서 벗어나면 지우고, 토글 때도 지운다.
- 지원 플랫폼이 0개인 registry: 모든 행이 `[-]`이므로 `Watch`는 빈 선택 거부가 되고, Back/Esc로만 나간다.

**Steps**

- [ ] **Step 1: 실패 테스트 작성·수정 (RED)**
  - `tui-render.test.mjs`에 `assert.equal(api.navigationHint('checklist',{backLabel:'exit'}),'↑/↓: Select · Enter Toggle · Esc Exit')`를 추가한다. :20 기존 assert는 그대로 둔다.
  - `watch-cli.test.mjs`:
    - 제목 매칭(:669, :723, :739)을 `Which platforms to watch?`로 바꾼다. 첫 화면에 새 제목이 보이는지 확인한다.
    - help 테스트(:124): 기존 regex를 `/Check the platforms to watch in the menu; all supported platforms are checked by default/`로 바꾼다. :125-129는 유지한다.
    - `menu rows come from registry watch capability`(:708-713): 기대값을 `[{id:'zeta',label:'Zeta',supported:false},{id:'eta',label:'Eta',supported:true},{id:'beta',label:'Beta',supported:true}]`로 바꾼다.
    - `unsupported row is not selectable`(:716-731): 키를 `[...Array(descriptors.length-descriptors.indexOf(unsupported)).fill('\x1b[A'),'\r','\x1b']`로 바꾼다(커서가 `Watch`에서 출발). 첫 화면 labels 기대값은 `[...descriptors.map(d=>(d.capabilities.watch.state==='verified'?'[x] '+d.label:'[-] '+d.label+'  (not supported)')),'Watch','Back']`다. 첫 화면에 `All` 행이 없음(`assert.doesNotMatch(first,/\bAll\b/)`)과 힌트 `Esc Exit` 포함을 확인한다. 마지막 화면은 미지원 안내를 포함하고 그 행은 여전히 `[-]`다. `s.calls`는 `[]`다.
    - `unsupported row notice clears when the cursor moves away`(:733-745): 같은 위 방향 이동으로 바꾼 뒤 `'\r','\x1b[A','\x1b[B','\x1b'`를 보낸다. 나머지 assert는 유지한다.
    - `menu cancel restores terminal and never starts watcher`(:748): 첫 케이스 `['\x1b[A','\r']`를 `['\x1b[B','\r']`(Watch→Back→Enter)로 바꾼다. 나머지 3케이스와 assert는 유지한다.
    - `menu dispose precedes watch raw mode and first output`(:760-762): 케이스 1 `['\r']`(초기 커서 Watch, 전체 확정)은 그대로 둔다. 케이스 2는 codex 해제로 바꾼다: `k=descriptors.length-descriptors.findIndex(d=>d.id==='codex')`, 키 `[...Array(k).fill('\x1b[A'),'\r',...Array(k).fill('\x1b[B'),'\r']`, 기대값 `['local claude']`.
    - 신규 `empty selection is rejected with a notice`: 실제 `descriptors`의 지원 행을 모두 해제하고 `Watch`에서 Enter. 그 화면에 `Select at least one platform to watch.`가 보이고, 이어 `'\x1b[A'` 후 다음 화면에서 안내가 사라진다. 마지막 `'\x1b'` 후 반환값 0, `s.calls`는 `[]`.
    - 신규 `no supported platform leaves only Back`: `io.registry={byDisplayOrder:()=>[{id:'zeta',label:'Zeta',capabilities:{watch:{state:'off'}}}]}`, 키 `['\r','\x1b']`. 첫 화면에 `[-] Zeta  (not supported)`, 둘째 화면에 빈 선택 안내, 반환값 0, `s.calls`는 `[]`.
    - 신규 `confirm returns checked ids in display order`: `chooseWatchPlatforms`를 `runWatch`(`lib/watch/index.mjs:52`)와 같은 인자 `{input:s.io.input,output:s.output,env:s.io.env,signals:s.io.process,registry}`로 `menuTerminal`에서 직접 부른다. registry `[eta,beta]`(둘 다 verified).
      - 키 `['\x1b[A','\x1b[A','\r','\r','\x1b[B','\x1b[B','\r']`(eta 해제 후 재체크) → `['eta','beta']`
      - 키 `['\x1b[A','\x1b[A','\r','\x1b[B','\x1b[B','\r']` → `['beta']`
      - 직접 호출이 `menuTerminal`에서 동작하지 않으면 `runWatch` 경유로 관찰하는 대안을 쓰고 보고한다(같은 기준).
- [ ] **Step 2: RED 확인**
  - Run: `node --test tests/node/watch-cli.test.mjs tests/node/tui-render.test.mjs`
  - Expected: 바꾸거나 추가한 테스트가 FAIL한다(All 행 존재, 힌트 `Esc Home`, 새 안내 없음 등). 무관한 기존 실패는 이름으로 기록한다.
- [ ] **Step 3: 구현 (GREEN)**
  - `render.mjs:16`: checklist 분기를 `'↑/↓: Select · Enter Toggle · Esc '+(backLabel==='exit'?'Exit':'Home')`로 바꾼다.
  - `menu.mjs`: 위 "동작 결정"대로 `watchMenuRows`와 `chooseWatchPlatforms`를 고치고, `ui.menu` 제목을 `Which platforms to watch?`로 바꾼다. 새 import는 없다.
  - `index.mjs:18` Scope 문단: `Check the platforms to watch in the menu; all supported platforms are checked by default. Every selection watches the current Git worktree, or the current directory outside Git. Requires an interactive terminal.`
  - `README.md:43`: `Run \`arc watch\` in an interactive terminal and check the platforms to watch (all supported platforms are checked by default) to follow activity in the current worktree (or directory outside Git). Platforms that arc watch does not support are shown in the menu but cannot be checked. Run \`arc watch --help\` for options.`
  - `docs/harness-operation.md:136` Selection 셀: `Check the platforms to watch; all supported platforms are checked by default. Unsupported platforms are marked and cannot be checked. Confirming with no platform checked is refused. Back, Escape and EOF exit 0. Ctrl-C in the menu exits 130`
  - `node scripts/update-manifest.mjs`로 `MANIFEST.sha256`을 갱신한다(`menu.mjs`와 `render.mjs` 해시 행만 바뀌어야 한다).
- [ ] **Step 4: GREEN 확인과 task 필수 check** (아래 "필수 QA" 참조)
- [ ] **Step 5: Orchestrator 수용 후 커밋**(Orchestrator 수행). 메시지: `feat(watch): 플랫폼 다중 선택 체크리스트 메뉴`

**기준 (C-C1~C-C8 대응):**
- C-C1: 첫 화면 제목이 `Which platforms to watch?`이고, `All` 행이 없으며 지원 플랫폼마다 `[x]/[ ]` 토글이 있다.
- C-C2: 초기에 지원 플랫폼 전체가 체크되어 있고, 바로 `Watch`로 확정한 결과가 기존 All과 같다(dispose 케이스 1).
- C-C3: 미지원 플랫폼은 `[-] <Label>  (not supported)`로 표시되고 체크할 수 없으며 기존 안내가 나온다.
- C-C4: 표시 순서대로 id 배열을 반환하고, exit/EOF는 `null`, Ctrl-C는 130이다.
- C-C5: 빈 선택 확정은 거부되고 `Select at least one platform to watch.`가 나오며, 커서 이동이나 토글 시 지워진다.
- C-C6: 초기 커서는 `Watch` 행, Enter는 토글, Esc/Back은 Exit, 힌트는 `↑/↓: Select · Enter Toggle · Esc Exit`. 다른 checklist 사용처의 기본 힌트는 불변.
- C-C7: help, `README.md:43`, `docs/harness-operation.md:136` 문구 변경. README는 host 중립(특정 플랫폼 이름 없음).
- C-C8: watch-cli/tui-render/tui-app/import-graph/manifest 테스트와 `check:manifest` 통과.

**필수 QA·focused check·증거 (수용 전, fresh QA):**
- `node --test tests/node/watch-cli.test.mjs tests/node/tui-render.test.mjs tests/node/tui-app.test.mjs tests/node/watch-import-graph.test.mjs tests/node/manifest.test.mjs`: 전부 PASS. 실패가 있으면 이름과 기준선 여부를 기록한다.
- `node scripts/update-manifest.mjs --check`: 종료 0.
- 증거: 명령, 종료 코드, 테스트 합계, 변경 파일 목록(위 Files 외 변경 없음), MANIFEST diff가 두 파일 해시 행뿐이라는 점, `lib/watch/menu.mjs`에 새 import가 없다는 점.

**관련 테스트와 이유:**
- `tests/node/watch-cli.test.mjs`: 변경 모듈 `lib/watch/menu.mjs`와 `index.mjs`(help)를 직접 실행한다.
- `tests/node/tui-render.test.mjs`: 변경 함수 `navigationHint`를 직접 검사한다.
- `tests/node/tui-app.test.mjs`: `interface.mjs`가 `render.mjs` 힌트를 쓴다. :574 기본 checklist 힌트 불변 확인.
- `tests/node/watch-import-graph.test.mjs`: watch import 제약 계약(파일 수정 없음).
- `tests/node/manifest.test.mjs`와 `check:manifest`: MANIFEST 해시 추적 파일이 바뀌므로 필요한 계약 테스트와 check.

**Hold:**
- RED 단계에서 기준선 아닌 이유로 기존 테스트가 실패하면 GREEN 전에 Orchestrator에 보고한다.
- MANIFEST diff에 두 파일 밖의 행이 생기면 중단하고 보고한다(ignored 파일 유입 가능성).
- `ui.menu` 시그니처 변경이나 `interface.mjs` 수정이 필요해지면 범위 변경이므로 중단하고 보고한다.

---

## 최종 검증 (모든 task 수용 뒤, Orchestrator 직접·백그라운드)
- 관련 테스트 합집합: `tests/node/watch-cli.test.mjs`, `tests/node/tui-render.test.mjs`, `tests/node/tui-app.test.mjs`, `tests/node/watch-import-graph.test.mjs`, `tests/node/manifest.test.mjs`
- 전체 계약 테스트: `tests/node/plan-level-records-contract.test.mjs`, `tests/node/run-mode-contract.test.mjs`, `tests/node/test-scope-contract.test.mjs`, `tests/node/watch-import-graph.test.mjs`, `tests/node/manifest.test.mjs`, `tests/node/installed-layout-golden.test.mjs`, `tests/node/parity-check.test.mjs`, Python `tests/test_harness_contract.py`, `tests/test_arc_policy.py` (`PYTHONDONTWRITEBYTECODE=1`)
- 전체 check 스크립트 4종: `node scripts/update-manifest.mjs --check`, `node scripts/update-role-policy.mjs --check`, `node scripts/check-installer-parity.mjs`, `node scripts/update-runtime-assets.mjs --check`
- 전체 회귀 판단(잠정): **실행.** trigger (1): `lib/tui/render.mjs`는 management TUI(Configure, Hosts 등, `interface.mjs` 경유)와 watch가 함께 쓰는 공용 모듈이다. trigger (4)는 `watchMenuRows` 반환 형태 변경이 export 사용처(menu 자신과 테스트) 밖에 없는지 Orchestrator가 실제 diff로 확정한다. 기준선은 base `68ef36c8`에서 전체 `node --test tests/node/*.test.mjs`와 Python 전체 `python3 -m unittest discover -s tests -p 'test_*.py' -v`를 포함해 clean worktree에서 기록한다.
- Reviewer: 위험 ordinary·단일 task이므로 per-task Reviewer는 없다. 최종 전체 Reviewer는 Orchestrator 위험 판단에 따른다.

## 자체 점검 (Bounded)
- [x] C-C1~C-C8이 모두 Task 1 기준과 테스트에 대응한다.
- [x] 확정 결정 반영: 빈 선택 거부 문구, 초기 커서 `Watch`, `harness-operation.md:136` 포함, README host 중립.
- [x] 설계 선행 발견 반영: cancel 키 시퀀스 수정(`\x1b[B`), 지원 0개 registry는 확정 거부.
- [x] 공용 render 기본 문자열 불변을 tui-render :20과 tui-app :574가 고정한다.
- [x] 키 시퀀스는 초기 커서 `Watch` 기준으로 다시 계산했다.
- [x] import graph 제약과 MANIFEST 갱신 절차 포함.
- [x] 최종 검증의 계약 테스트·check 4종 목록을 저장소 기준으로 확정했다(Orchestrator 수정).

## Revision history
| Version | Date | Change | Approval |
|---|---|---|---|
| v1 | 2026-11-21 | Planner 첫 완성본, Orchestrator가 최종 검증 목록 확정, 사용자 결정에 따라 메뉴 제목 복수형 반영 | 사용자 승인 2026-11-21 (제목 복수형 결정과 같은 답변) |
