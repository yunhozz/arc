# watch 선택 밖 플랫폼 변경 내부 추적 설계

- 날짜: 2026-11-24
- 상태: v1 (2026-11-24 사용자 승인)
- workflow: `2026-11-24-watch-unwatched-platform-changes`
- 실행 대상: `/Users/ma-24-007/Desktop/workspace/arc`, 브랜치 `fix/watch-unwatched-platform-changes`, approved base `6244a8af`
- 사용자 결정 (2026-11-24): "내부 추적 후 필터"
- 관계: `docs/superpowers/specs/2026-11-22-watch-unattributed-changes-design.md` 3.3절 "알려진 한계" 2번을 해소한다. U7은 유지한다. 과거 spec 파일은 고치지 않는다.

## 1. 배경과 원인

- 플랫폼을 일부만 고른 watch(예: Claude만)는 고르지 않은 플랫폼의 transcript를 찾지 않는다(`lib/watch/watcher.mjs:433-436` `discover`, `:288-298` `eligible`). 그래서 그 세션들은 claim을 남기지 못하고(`:238-244`), 셸 scan을 예약하지 못하며, 후보도 되지 못한다(`:225-232`).
- 그동안 Codex bridge Implementer가 A를 고쳐도 scan이 돌지 않아 스냅샷이 낡은 채로 남는다. 나중에 Claude Orchestrator가 움직이면 scan이 돌고(`:518-573`), claim 없는 A가 Orchestrator의 `inferred:true` EDIT로 나온다. 플랫폼별 watch를 여러 개 띄우면 같은 변경이 두 번 보인다.

## 2. 결정

- D1 (사용자 결정): 선택하지 않은 플랫폼의 세션도 watch 안에서 따라간다(이하 "내부 추적 세션"). 화면에는 아무것도 내지 않는다.
  - 내부 추적 세션의 명시 파일 이벤트는 claim으로 쓴다.
  - 그 세션의 live 줄은 scan을 예약하고 후보가 된다.
  - 그 세션이 후보로 뽑혀 귀속된 이벤트는 버리고, 스냅샷만 갱신한다.
- U7 유지: claim 안 된 셸 변경은 가장 최근 후보에 귀속한다.

## 3. 동작 규칙

### 3.1 추적 플랫폼 집합

- `tracked`는 다음 두 조건을 모두 만족하는 플랫폼 `p`의 집합이다.
  - `TRANSCRIPT_HANDLERS.has(p)`이고 `homes[p]`가 truthy다.
  - `p`가 선택된 `platforms`에 있거나, registry의 `capabilities.watch.state==='verified'`다.
- `discover`와 `eligible`의 플랫폼 검사는 `platforms` 대신 `tracked`를 쓴다. 나머지 조건(Codex Desktop 제외, ancestry, scope, mapped)은 그대로 둔다.
- 행을 만들 때 `row.hidden = !platforms.includes(row.platform)`를 정한다. 이 값은 행이 사는 동안 바뀌지 않는다.
- 분기는 `platforms` 배열에 들어 있는지만 본다. 특정 플랫폼 id로 분기하지 않는다.

### 3.2 표시 억제 지점

| 지점 | 변경 |
|---|---|
| `emit` | `row.hidden`이면 events와 `row.held`를 버린다. scanRoot가 hidden 후보에 귀속한 이벤트도 여기서 버려진다. |
| `attach` history와 `skipped`(earlier backlog) | hidden이면 `emit`과 `skipped.push`를 건너뛴다. cwd와 state를 맞추기 위한 normalize는 그대로 한다(live=false이므로 claim은 생기지 않는다). |
| `attach` `holdUntil` | hidden이면 설정하지 않는다. |
| `ensureShellRoot` (normalize, attach) | hidden 행은 새 root를 만들지 않고 기존 root에만 참여한다. |
| debug: `left scope`, `session file unreadable`, `session file removed`, `session restarted`, `line over 4 MiB`, `detached idle session` | hidden이면 내지 않는다. |
| debug: `compressed session skipped`, `parent session not found` | 선택된 플랫폼일 때만 낸다. |
| notice `session X is dispatch Y` | hidden 행에는 내지 않는다(명시 가드). |
| cap(`maxFollowed`)과 `following the newest 64 sessions` | 수와 퇴출 대상은 visible과 hidden을 따로 센다. notice는 visible에서만 낸다. hidden은 소리 없이 가장 오래된 hidden 행을 detach한다. |
| `followedDispatchRow` | visible 행만 본다. |
| `dispatchInScope`의 cwd 없는 ref 분기 | visible 행만 본다. |
| `busy()`, `listActivity()` | hidden 행을 뺀다. |
| 시작 header·brief `platforms`, `markEmitted` | 바꾸지 않는다. |

- `mapped`, `label`, `identity`는 hidden 행에도 계산한다(후보 identity에 쓴다). 결과는 출력되지 않는다.

### 3.3 claim과 후보

- normalize의 기존 claim·후보 규칙을 hidden 행에도 똑같이 적용한다.
- `scanRoot`는 바꾸지 않는다. 가장 최근 후보가 hidden이면 `emit`이 그 이벤트를 버린다. 스냅샷은 이미 갱신되었으므로, 같은 변경이 나중에 visible 세션에 귀속되지 않는다.

### 3.4 수명

- hidden 행도 idle detach, 재부착, reset, gone, unreadable 처리를 visible 행과 똑같이 받는다. debug 출력만 억제한다.

## 4. 바뀌지 않는 것

- 모든 플랫폼을 고른 watch는 hidden 행이 없으므로 코드 경로도 출력도 지금과 같다(U7 유지).
- 다음도 바뀌지 않는다.
  - 스냅샷 비교, claim TTL, scan 간격과 끄기 조건, hold 규칙
  - JSON·사람용 출력 형식, `source` 값
  - dispatch index와 lease 형식, `render.mjs`, `dispatch.mjs`, runtime
- DISPATCH 행 표시와 `transcript not found for dispatch` debug도 지금과 같다(Orchestrator 결정). hidden bridge 행 때문에 표시 규칙이 바뀌지 않게 한다.

## 5. 남는 한계

1. visible 세션과 hidden 세션이 같은 시간대에 움직이면, visible 세션의 셸 변경이 hidden 세션에 귀속되어 이 watch에서 보이지 않을 수 있다. U7의 오귀속과 같은 성질이다.
2. 다음 변경은 claim되지 않으므로, 지금처럼 visible 세션의 inferred로 나올 수 있다.
   - 아직 attach되지 않은 hidden 세션이 만든 변경(첫 discovery 전, 또는 cap을 넘겨 detach된 뒤)
   - attach history에만 있는 변경
3. 홈 오류가 있거나 transcript handler가 없는 플랫폼의 세션은 추적할 수 없다.
4. 셸 변경 감지의 기존 한계(ignore 경로, 지문이 같은 변경, Git 밖 root)는 그대로다.

## 6. 비용 한계

- 세션 수: visible과 hidden이 각각 `L.maxFollowed`(64)를 쓴다(Orchestrator 결정: 새 상수 없음). 최악의 경우 tail 128개다. hidden 행도 `eligible`의 scope·mapped 조건을 거치므로, 실제로는 같은 repo의 in-scope 세션 몇 개다.
- 읽기량: tail마다 tick당 `maxReadBytesPerTick`, attach마다 history는 `historyBytes`까지 읽는다. discovery는 `discoveryMs` 간격으로 돈다.
- git·lstat: hidden 행은 root를 만들지 않으므로 scan 상한은 그대로다.

## 7. 수용 기준

- C1: 플랫폼 X만 고른 watch의 파일 이벤트(`file_*`, inferred 포함)는, 모든 플랫폼을 고른 watch의 같은 시나리오 출력에서 X 세션 identity 행만 남긴 것과 같다.
  - 전제: cap 미도달, 관련 세션이 변경 전에 attach되어 있음.
  - 특히 선택 밖 세션이 명시 Edit/apply_patch로 바꾼 파일은 선택된 세션의 inferred 행으로 나오지 않는다.
- C2: 선택 밖 세션이 가장 최근 후보일 때 scan된 claim 없는 변경은 이 watch에 나오지 않는다. 나중에 scan이 다시 돌아도 나오지 않는다.
- C3: 모든 플랫폼을 고른 watch의 동작은 바뀌지 않는다. 기존 테스트 단언도 고치지 않는다.
- C4: 선택 밖 세션은 출력 행(session, 메시지, 명령, 파일, notice, debug, earlier backlog)을 내지 않는다. 다음 효과도 같은 입력에서 변경 전과 같다.
  - `busy()`, `listActivity()`
  - DISPATCH 행과 그 `platform`
  - `transcript not found for dispatch` debug
  - visible 64 cap과 그 notice
- C5: hidden 행 수는 64를 넘지 않고, visible cap 동작은 바뀌지 않는다.
- C6: 규칙과 새 테스트 이름에 특정 플랫폼 id 분기가 없다.
- C7: README 99행이 9절 문구와 같고, `npm run check:manifest`가 통과한다.

## 8. 테스트 계획 (`tests/node/watch-watcher.test.mjs`)

- 선택 플랫폼 P와 반대 플랫폼 Q를 배열 루프로 돌려 host 중립을 지킨다.

RED (지금은 실패해야 함):
- R1 (C1): `platforms:[P]`에서 Q bridge 세션이 A를 Edit/FileChange로 바꾼 뒤 P host가 움직인다.
  - 기대: A의 `file_*` 이벤트가 없고, Q 행도 없다.
  - `[P,Q]` 결과에서 P 행만 남긴 것과 deepEqual이다.
- R2 (C2): Q가 메시지만 남기고 A를 셸로 바꾼다. scan을 돌린 뒤 P가 움직인다.
  - 기대: A가 나오지 않는다.
  - 대조: `[P,Q]`에서는 A가 Q identity의 `inferred:true`로 나온다.

회귀 가드 (지금도 통과, 변경 뒤에도 통과해야 함):
- R3: DISPATCH 행, 그 `platform`, `transcript not found` debug가 그대로다.
- R4: Q만 활동하면 `busy()`가 false다. visible 64 cap과 notice가 그대로다.
- R5: verbose에서도 Q 세션 debug가 나오지 않는다.
- R6: in-scope 세션이 Q뿐이면 ls-files 호출이 0회다.
- 기존 798행 platform filter 테스트, 1575행 테스트가 그대로 통과한다.
- 선택하지 않은 플랫폼의 discovery가 늘어 기존 테스트가 영향을 받으면, 단언을 바꾸지 말고 원인을 보고한다.

## 9. README 문구 (99행)

> Watch also shows shell file changes under the name of the most recent eligible session in the same worktree.

위 문장 뒤에 다음 문장을 붙인다.

> It also reads sessions from platforms you did not select, without showing them, so their file changes are not shown under a selected session.

## 10. 범위

- 포함: `lib/watch/watcher.mjs`, `tests/node/watch-watcher.test.mjs`, `README.md`(99행), `MANIFEST.sha256`
- 제외: `lib/watch/model.mjs`, `lib/watch/index.mjs`, `dispatch.mjs`, `render.mjs`, runtime, lease 형식, 과거 spec

## 11. 경로·깊이·위험

- 경로: Bounded.
- plan: 단일 task T1의 짧은 plan. 억제 지점들이 `followed` 상태와 dispatch·cap·spinner를 공유하므로 plan 생략 조건을 충족하지 않는다.
- 위험: significant.
  - 사용자에게 보이는 억제 지점이 여러 개이고 추적량이 늘어난다.
  - 절차: Implementer → fresh Tester → 수락·커밋 → 최종 Reviewer 1회.

## 12. 검토한 대안

- hidden 행을 별도 Map에 둔다.
  - 장점: 지금 `followed`를 읽는 소비자를 고치지 않아도 hidden 행이 새어 나가지 않는다.
  - 단점: attach, poll, 중복 검사, 후보 확인이 모두 두 Map을 봐야 한다. 하나라도 빠뜨리면 중복 attach가 생긴다.
  - 채택하지 않음. 본안은 억제 지점을 3.2절 표에 모두 열거하고 테스트로 고정한다.

## 개정 이력

| 버전 | 날짜 | 분류 | 내용 | 승인 |
|---|---|---|---|---|
| v1 | 2026-11-24 | — | Planner 첫 초안. Orchestrator 검토 결정: DISPATCH 표시 불변, hidden cap 64 | 사용자 "승인" |
