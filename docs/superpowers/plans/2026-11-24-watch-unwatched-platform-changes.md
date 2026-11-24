# watch 선택 밖 플랫폼 변경 내부 추적 구현 계획

> **For agentic workers:** 이 plan은 ARC Orchestrator가 조정합니다. 순서는 Implementer → fresh Tester → Orchestrator 수락 → focused commit 1개 → 최종 검증 → 최종 Reviewer 1회입니다. Implementer와 Tester는 Git 상태를 바꾸지 않습니다.

- 상태: v1 (2026-11-24 사용자 승인)
- Spec: `docs/superpowers/specs/2026-11-24-watch-unwatched-platform-changes-design.md` v1 (2026-11-24 사용자 "승인")
- workflow: `2026-11-24-watch-unwatched-platform-changes`
- 대상: `/Users/ma-24-007/Desktop/workspace/arc/.claude/worktrees/watch-unwatched-platform-changes`, `fix/watch-unwatched-platform-changes`, approved base `6244a8af07550f394cd1590dbbfb6feb0038c873`
- 깊이·위험: Bounded, significant (spec 11절)
- 커밋
  - 승인된 spec과 plan은 첫 Implementer 전에 문서 전용 커밋 하나로 묶는다.
  - T1을 수락한 뒤 focused 커밋 하나를 만든다. 메시지 형식은 `type(scope): 한국어 설명`이다.
  - 최종 Reviewer 지적은 Implementer → Reviewer로 반복한다. 수정은 recheck가 끝날 때까지 커밋하지 않고, 수락한 뒤 follow-up 커밋 하나로 묶는다.
- 실행 환경 (Codex bridge, workspace-write)
  - allowedPaths에는 정확한 파일 경로만 넣는다.
  - `TMPDIR=/tmp/arc-watch-<role>-tmp`는 미리 만든다.
  - `node --test` 옵션은 파일 경로보다 앞에 둔다.
  - bridge 안에서는 focused 테스트만 돌린다. 전체 suite는 Orchestrator가 host에서 돌리고, 그 출력을 Tester에게 넘긴다.
  - 선택적 읽기 실패는 blocker가 아니다.
- 운영 주의: Implementer나 Tester가 실행 중이면, Orchestrator는 이 worktree에 쓰지 않고 저장소의 어떤 ref도 옮기지 않는다. 다른 worktree(`fix/bridge-sandbox-tool-access`)의 커밋도 여기에 포함된다.

## 실패 판정 방법 (모든 Tester 공통)

1. 정적 분류
   - `git diff --name-only 6244a8af`와 untracked 목록으로 바뀐 파일을 정한다.
   - 실패한 테스트가 바뀐 파일을 읽거나 import하는지 보고, current 후보와 baseline 후보로 나눈다.
2. baseline 대조
   - Orchestrator가 host에서 측정한 6244a8af baseline 실패 목록과 테스트 이름으로 대조한다.
   - 새 실패가 있으면 그 파일만 단독으로 다시 돌린다(`node --test --test-concurrency=1 <file>`).
   - 판단이 서지 않으면 Orchestrator에게 base 재실행을 요청한다. Tester는 checkout이나 worktree를 만들지 않는다.
3. 판정 기준
   - "새 실패 없음"이 통과다.
   - 분류할 수 없는 실패는 그 영향 범위만 hold한다.

## T1. 선택하지 않은 플랫폼 세션을 숨겨 추적하고 그 귀속 이벤트를 억제

- 목표
  - spec 3.1–3.4를 구현한다. 선택 밖 플랫폼 세션은 claim과 scan 후보로만 쓰이고, 아무것도 출력하지 않는다.
  - README 99행에 문장을 하나 붙이고, MANIFEST를 갱신한다.
- Files (Implementer allowedPaths)
  - `lib/watch/watcher.mjs`
  - `tests/node/watch-watcher.test.mjs`
  - `README.md`
  - `MANIFEST.sha256`
- 선행: spec·plan 문서 전용 커밋 (Orchestrator)
- 단계
  - [ ] 0. 사전 확인 (보고만 하고 코드는 바꾸지 않는다). 결과가 다르면 hold한다.
    - `DEFAULT_PLATFORM_REGISTRY`에서 codex와 claude가 `capabilities.watch.state==='verified'`인지 확인한다(`lib/runtime/platform-registry.mjs:76,92,107`).
    - 테스트 `setup`이 registry를 넘기지 않을 때 기본 registry가 쓰이는지 확인한다.
    - `dispatchRegistry`의 alpha, zeta, omega는 transcript handler가 없어서 `tracked`에 들어가지 않는지 확인한다.
  - [ ] 1. RED: `tests/node/watch-watcher.test.mjs`에 spec 8절 R1–R6을 추가한다.
    - 작성 규칙
      - 선택 플랫폼 P와 반대 플랫폼 Q는 배열 데이터(`[['codex','claude'],['claude','codex']]`)로 루프를 돈다.
      - 테스트 이름은 "selected/unselected platform" 같은 일반어로 짓는다. 루프 변수 보간은 허용한다. 본문에서 특정 id로 분기하지 않는다(C6).
    - 테스트별 내용
      - R1 (C1): Q bridge 세션이 명시 Edit/FileChange를 남긴 뒤 P host가 움직인다.
        - `[P]` watch에서 A의 `file_*` 이벤트와 Q 행이 없다.
        - 그 결과가 `[P,Q]` 결과에서 P identity 행만 남긴 것과 deepEqual이다.
      - R2 (C2): Q가 메시지만 남기고 A를 셸로 바꾼 뒤 scan을 돌리고, P가 움직인다.
        - A가 나오지 않는다. scan을 한 번 더 돌려도 나오지 않는다.
        - 대조: `[P,Q]`에서는 A가 Q identity의 `inferred:true`로 나온다.
      - R3 (C4): `[P]` watch에서 DISPATCH 행, 그 `platform`, `transcript not found for dispatch` debug가 변경 전과 같다.
      - R4 (C4, C5)
        - Q만 활동하면 `busy()`가 false이고, `listActivity()`에 Q가 없다.
        - visible 64 cap과 그 notice는 그대로다.
      - R4b (C5, 가능할 때만): Q 세션이 65개 이상이어도 hidden 추적 수가 64를 넘지 않고, cap notice가 나오지 않는다.
        - 관찰 수단: 기존 테스트 방식이나 기존 dependency 주입. 공개 API는 추가하지 않는다.
        - 관찰할 수 없으면 쓰지 않는다. 그 이유를 보고한다(C5 증거는 Tester 코드 검사와 최종 Reviewer로 대체).
      - R5 (C4): verbose에서도 Q 세션 debug(spec 3.2 표의 항목)와 earlier backlog가 나오지 않는다.
      - R6: in-scope 세션이 Q뿐이면 `ls-files` 호출이 0회다(기존 `scans` 헬퍼 활용).
    - RED 확인: `node --test tests/node/watch-watcher.test.mjs`
      - R1과 R2만 실패하고, R3–R6과 기존 테스트는 통과해야 한다.
      - 실패한 테스트 이름을 보고한다.
      - R3–R6 중 하나라도 실패하면 hold한다.
  - [ ] 2. GREEN: `lib/watch/watcher.mjs`에 spec 3.1–3.4를 구현한다.
    - `tracked` 집합을 만들어 `discover`와 `eligible`의 플랫폼 검사에 쓴다. 행을 만들 때 `row.hidden`을 정한다.
    - spec 3.2 표의 억제 지점을 모두 반영한다: `emit`, attach history와 skipped, `holdUntil`, `ensureShellRoot`, debug 8종, dispatch notice, cap 분리, `followedDispatchRow`, `dispatchInScope`, `busy`, `listActivity`.
    - 다음은 바꾸지 않는다: `scanRoot`, 시작 header와 brief, `markEmitted`, `model.mjs`, `index.mjs`, `dispatch.mjs`, `render.mjs`, runtime.
    - 표의 각 지점을 어디서 처리했는지 함수 단위로 보고한다.
  - [ ] 3. 기존 테스트 영향 확인: watch-watcher 전체를 다시 돌린다.
    - 선택 밖 플랫폼 세션이 있는 기존 테스트를 특히 본다. 예: platform filter(:798), 단일 플랫폼 테스트(:807, :838, :859, :881), `['claude','zeta']`(:1542), attribution 구간(:1265 이후), :1575.
    - 이 테스트가 실패해도 기존 단언은 바꾸지 않는다(C3). 원인을 보고하고 hold한다. Orchestrator가 판단한다.
  - [ ] 4. `README.md` 99행
    - "…most recent eligible session in the same worktree." 바로 뒤에 spec 9절 문장을 붙인다.
    - 이어지는 "The attribution is a best guess…" 문장은 그대로 둔다.
  - [ ] 5. README를 읽는 테스트 확정
    - `grep -l README tests/node` 후보 중 README 내용이나 해시에 의존하는 테스트를 고른다. 이유와 함께 보고하고 돌린다.
    - bridge 환경 때문에 실패하면, 환경 실패인지 구분해 보고한다.
  - [ ] 6. GREEN 확인: 다음 명령과 5단계에서 확정한 테스트가 통과해야 한다.
    - `node --test tests/node/watch-watcher.test.mjs tests/node/watch-render.test.mjs tests/node/watch-dispatch.test.mjs tests/node/manifest.test.mjs`
  - [ ] 7. `node scripts/update-manifest.mjs`
    - `README.md`와 `lib/watch/watcher.mjs` 두 해시만 바뀌어야 한다. 항목 추가나 삭제가 있으면 hold한다.
  - [ ] 8. `npm run check:manifest`가 통과해야 한다.
  - [ ] 9. 커밋 (수락 뒤 Orchestrator): `fix(watch): 선택하지 않은 플랫폼 세션을 숨겨 추적해 셸 변경 오귀속을 막음`
- 관련 테스트와 이유

  | 테스트 | 이유 |
  |---|---|
  | `tests/node/watch-watcher.test.mjs` | 바뀌는 분기 전부(R1–R6), 기존 platform filter, cap, attribution 회귀. C1–C6 |
  | `tests/node/watch-render.test.mjs` | 출력 형식과 `source` 값이 그대로인지 (spec 4절) |
  | `tests/node/watch-dispatch.test.mjs` | dispatch index와 lease가 그대로인지 (C4) |
  | `tests/node/manifest.test.mjs` | MANIFEST 갱신 (C7) |
  | 5단계에서 확정한 README 의존 테스트 | README 문구와 패키징 회귀 (C7) |

- Check: `npm run check:manifest`
- 수용 기준: spec 7절 C1–C7.
- Tester 검사 (fresh, 수락 전)
  - 관련 테스트와 check를 직접 다시 돌린다.
  - 기준별 확인
    - C3: `git diff 6244a8af -- tests/node/watch-watcher.test.mjs`에서 기존 줄이 바뀌거나 삭제되지 않았는지 본다.
    - C6: 추가 줄에서 `'codex'`, `'claude'` 리터럴 분기를 찾는다. 테스트 데이터 배열은 예외다.
    - C4: spec 3.2 표의 각 지점이 diff에 반영되었는지 코드로 대조하고, R3–R5 결과를 함께 본다.
    - C5: R4b 결과를 본다. R4b가 없으면 cap 분리 코드를 검사한다.
    - C7: README 99행 문자열과 MANIFEST diff(해시 두 개)를 본다.
  - diff가 allowedPaths 4개 밖에 닿지 않았는지 확인한다.
  - 실패는 위 실패 판정 방법으로 분류한다.
  - C1–C7마다 proven, unmet, unverified 중 하나와 근거를 적는다.

## 최종 검증 (T1 수락·커밋 뒤, fresh Tester 1회)

- verified HEAD에서 한다. 시작과 끝의 `git status --porcelain`이 clean이 아니면 보류한다.
- task Tester가 통과시킨 관련 테스트는 다시 돌리지 않는다.

1. (a) 계약 테스트
   - `tests/node/test-scope-contract.test.mjs`
   - `tests/node/plan-level-records-contract.test.mjs`
   - `tests/node/run-mode-contract.test.mjs`
   - `tests/node/composite-instructions.test.mjs`
   - `tests/node/instruction-layout.test.mjs`
   - `tests/node/agent-fragments.test.mjs`
   - `tests/test_harness_contract.py` (baseline 실패가 있으므로 실패 판정 방법으로 분류한다)
2. (b) check
   - `npm run check:manifest`
   - `npm run check:role-policy`
   - `node scripts/update-runtime-assets.mjs --check`
   - `node scripts/check-installer-parity.mjs`
3. (c) 다시 바뀐 파일: task가 하나라 없다. 최종 Reviewer 수정이 `lib/watch/watcher.mjs`나 `MANIFEST.sha256`를 다시 바꾸면, 관련 테스트 묶음과 `check:manifest`를 다시 확인한다.
4. 전체 회귀
   - 트리거 판정
     - 트리거 1 (MANIFEST는 installer와 release가 읽음): 해시 두 개만 바뀐다.
     - 트리거 2 (base 이후 merge): 예상하지 않는다.
     - 트리거 3 (설정 변경): 없다.
     - 트리거 4 (공개 인터페이스): 변경이 없다.
   - 그래도 Orchestrator 결정으로, host 전체 suite(`npm test`)를 6244a8af baseline과 비교해 1회 돌린다. 출력은 최종 Tester에게 넘긴다.
   - 대체 검사로도 위 (a), (b)와 README 의존 테스트를 유지한다.
5. 최종 Reviewer 1회 (spec 11절 significant). 범위는 `6244a8af..HEAD`다.
   - 중점 확인
     - spec 3.2 억제 지점이 빠짐없이 반영되었는지. 특히 `followed`를 읽는 소비자 중 hidden 행이 새는 곳이 없는지
     - visible과 hidden cap이 따로 동작하고, 퇴출 대상이 맞는지
     - 모든 플랫폼 watch의 코드 경로가 그대로인지(C3)
     - spec 6절 비용 상한과 root 생성 금지
     - 플랫폼 id 분기가 없는지(C6)
     - R4b가 없으면 C5
   - 지적은 Implementer → Reviewer로 반복한다.

## 개정 이력

| 버전 | 날짜 | 분류 | 내용 | 승인 |
|---|---|---|---|---|
| v1 | 2026-11-24 | — | Planner 첫 초안. Orchestrator 결정: R4b는 관찰 가능할 때만(아니면 코드 검사와 Reviewer로 대체), host 전체 suite 1회 | 사용자 "승인" |
