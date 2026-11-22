# watch 셸 변경 누락 복구 설계

- 날짜: 2026-11-22
- 상태: v3 (v2를 사용자 결정 U7로 대체, 2026-11-22 사용자 승인)
- workflow: `2026-11-22-watch-unattributed-changes`
- 실행 대상: `/Users/yunho/Desktop/project/arc/.claude/worktrees/qa-owned-verification`, 브랜치 `feat/qa-owned-verification`, approved base `f677c216`
- 대체 관계: 이 문서는 `docs/superpowers/specs/2026-11-22-result-brief-readme-defaults-design.md`의 D8 중 다음을 철회한다.
  - 263행 "활성 dispatch 억제", 290-304행 활성 dispatch 판정 조건 1·1-2·2·3, 305-309행 귀속 규칙의 "활성 dispatch 1개 이상" 항목과 그 debug notice.
  - D8의 나머지(플랫폼 용어, dispatch 행 표시 플랫폼 헬퍼 `dispatchPlatforms`, 사람용 출력의 `(inferred)` 제거, JSON `inferred` 필드)는 그대로 유효하다.
  - 과거 spec 파일은 수정하지 않는다.

## 1. 배경과 원인 (실측 2026-11-22)

- 셸·스크립트로 바뀐 파일은 transcript에 file 이벤트가 없어 셸 변경 감지(`scanRoot`)로만 잡힌다. Codex `exec_command`로 실행한 스크립트·생성기 쓰기, Claude Bash 쓰기가 여기에 해당한다.
- `dfb9ecff`(D8)가 넣은 `suppressInferredChanges`(`lib/watch/watcher.mjs:521-541`)는 같은 git top에 활성 dispatch가 하나라도 있으면 추정 이벤트를 만들지 않는다(`:585`). 스냅샷은 갱신되므로 나중에 다시 나오지도 않는다.
- 실측: 같은 worktree에서 Codex bridge Implementer가 apply_patch 3건, 셸·python·rm 4건, host Claude가 Bash 2건·Write 1건을 바꾸는 동안 두 watch를 함께 켰다.
  - 전역 설치 v0.5.0(`arc watch`): 10건 모두 표시. 단 host Bash 변경 2건을 Codex Implementer에 귀속(부정확).
  - 이 worktree 코드(`./install.command watch`, `f677c216`): apply_patch 3건과 Write 1건만 표시. 셸 변경 6건 누락, `inferred changes skipped: 1 active dispatches` notice.

## 2. 결정

- U7 (사용자 결정 2026-11-22, "그냥 v0.5.0 이전 방식대로 부정확하더라도 다 보여주는 것이 나은 것 같아"): 활성 dispatch 여부와 상관없이, claim 안 된 셸 변경을 v0.5.0과 같이 같은 root에서 가장 최근 활동한 followed 후보 세션에 `inferred:true`로 귀속해 낸다. 귀속이 틀릴 수 있음을 받아들인다.
- 이 결정은 v2의 U1–U6(귀속 없는 `source:'shell'` 이벤트, `arc` 표시)을 대체한다.

## 3. 동작 규칙

### 3.1 바뀌는 것
- `scanRoot`는 활성 dispatch를 세지 않는다. 변경이 하나 이상이고 후보가 있으면 항상 가장 최근 후보의 identity로 kind별 이벤트를 `emit(row,...)`로 낸다. 이는 v0.5.0(`5f6fa2e9:lib/watch/watcher.mjs:522-527`)과 같은 동작이다.
- `suppressInferredChanges`, 그 debug notice(`inferred changes skipped: …`), 상태 필드 `skippedDispatchCounts`, 그리고 이 함수에서만 쓰는 상수(`ACTIVE_DISPATCH_STATES`, `TERMINAL_DISPATCH_STATES`, `L.dispatchHeartbeatStaleMs`, `L.dispatchIdleMs`)와 `prevScanAt`(이 함수에서만 읽음)를 제거한다. 다른 사용처가 있으면 남긴다.

### 3.2 바뀌지 않는 것
- 스냅샷 비교, claim 제외(`state.claims`, TTL), 후보 수집(`state.candidates`), hold 규칙, scan 트리거·간격, 감지 끄기 조건.
- 사람용 출력과 JSON 형식. 귀속된 추정 행은 지금처럼 세션 플랫폼·라벨로 보이고 `(inferred)` 글자가 없다. JSON은 `inferred:true`를 가진다. 새 `source` 값은 없다.
- dispatch 행 표시(`dispatchPlatforms`)와 dispatch index의 heartbeat 읽기(`lib/watch/dispatch.mjs`의 `heartbeatAt`). heartbeat 값은 watcher에서 더 쓰이지 않게 되지만, dispatch index 계약과 그 테스트는 이번 범위에서 바꾸지 않는다.

### 3.3 알려진 한계 (v0.5.0과 같음)
- 같은 시간대에 여러 세션이 활동하면 가장 최근 줄을 남긴 세션에 귀속되므로, host 세션의 셸 변경이 bridge 세션 것으로(또는 반대로) 보일 수 있다.
- 플랫폼 선택에서 빠진 플랫폼의 세션은 후보가 되지 않으므로, 그 세션이 바꾼 파일이 선택된 플랫폼 세션에 귀속될 수 있다.
- scan은 같은 top의 in-scope followed 세션 줄이 있어야 예약된다. ignore 경로·지문이 같은 변경·Git 밖 root는 감지하지 않는다.

## 4. 범위
- 포함: `lib/watch/watcher.mjs`, `lib/watch/model.mjs`(제거 상수), `MANIFEST.sha256`, `tests/node/watch-watcher.test.mjs`, `README.md` 99행.
- 제외: runtime, dispatch lease 형식, `lib/watch/dispatch.mjs`, `render.mjs`, `docs/harness-operation.md`(억제 문장 없음), 과거 spec.

## 5. 문서 문구
`README.md` 99행에서 다음 두 문장을 지운다.
> It hides those changes while a dispatch is active in that worktree. If an active dispatch's location is unknown, it hides shell file changes across the same repository.

그 자리에 다음 문장을 넣는다.
> The attribution is a best guess and can name the wrong session when several sessions are active at once.

## 6. 수용 기준
- A1: 활성 dispatch가 있는 모든 경우(unfollowed·followed·숨겨진 dispatch 행·native·감시 불가 target·종료 직후·위치 불명·다른 worktree)에서 claim 안 된 셸 변경이 가장 최근 후보 세션 identity의 `inferred:true` 이벤트로 정확한 kind·경로와 함께 나온다.
- A2: 활성 dispatch가 없는 기존 테스트는 단언을 바꾸지 않고 통과한다.
- A3: claim된 파일은 추정 이벤트에 들어가지 않고, bridge의 명시 file 이벤트는 기존 identity 그대로 보인다.
- A4: `inferred changes skipped:` 문구와 `suppressInferredChanges`가 저장소 코드(`lib/`, `tests/`)에 없다.
- A5: README 99행이 5절 문구와 같다.
- A6: `npm run check:manifest`가 통과한다.
- A7: 규칙과 테스트 이름에 플랫폼 id 분기가 새로 생기지 않는다(host 중립).
