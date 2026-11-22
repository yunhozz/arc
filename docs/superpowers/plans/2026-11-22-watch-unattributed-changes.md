# watch 셸 변경 누락 복구 구현 계획

> **For agentic workers:** 이 plan은 ARC Orchestrator가 조정합니다. task마다 Implementer → fresh QA → Orchestrator 수락 → focused commit 1개 순서로 진행합니다. Implementer와 QA는 Git 상태를 바꾸지 않습니다.

- 상태: v2 (v1을 spec v3 결정 U7에 맞게 다시 씀, 2026-11-22 사용자 승인)
- Spec: `docs/superpowers/specs/2026-11-22-watch-unattributed-changes-design.md` v3 (written-spec 승인 후 진행)
- workflow: `2026-11-22-watch-unattributed-changes`
- 대상: `/Users/yunho/Desktop/project/arc/.claude/worktrees/qa-owned-verification`, `feat/qa-owned-verification`, approved base `f677c216`
- 깊이: Bounded
- 커밋: 승인된 spec·plan은 첫 Implementer 전에 문서 전용 커밋 하나로 먼저 커밋한다. T1 수락 뒤 focused 커밋 하나. 메시지 형식은 `type(scope): 한국어 설명`.
- 실패 판정: QA는 verification 규칙의 2단계(정적 분류 → 필요할 때만 base 재실행)를 따른다. task QA의 정적 분류는 `git diff --name-only f677c216` + untracked로 한다.
- 운영 주의: Implementer·QA가 실행 중일 때 Orchestrator는 그 worktree에 쓰지 않는다.

## T1. 활성 dispatch 억제 제거와 v0.5.0 귀속 복구

- 목표: spec 3.1을 구현하고, 억제를 전제한 테스트를 귀속 기대로 바꾸며, README 문장을 고친다.
- Files (Implementer allowedPaths)
  - `lib/watch/watcher.mjs`
  - `lib/watch/model.mjs`
  - `tests/node/watch-watcher.test.mjs`
  - `README.md`
  - `MANIFEST.sha256`
- 선행: 없음
- 단계
  - [ ] RED: 억제를 전제한 테스트(HEAD `f677c216` 기준 `tests/node/watch-watcher.test.mjs` 1244-1634 구간의 억제·notice 테스트, 예: 1313, 1329, 1345, 1354, 1377, 1394, 1408, 1419, 1485, 1494, 1504, 1525, 1537, 1547, 1578, 1592)의 단언을 "가장 최근 후보 세션 identity로 `inferred:true` 귀속"으로 바꾸고, 제목의 suppress/skipped를 새 의미로 바꾼다. notice 1회 규칙만 검사하던 테스트는 "notice가 나오지 않는다"로 바꾸거나 목적이 사라졌으면 삭제하고 이유를 보고한다. 활성 dispatch가 없는 테스트는 건드리지 않는다. `node --test tests/node/watch-watcher.test.mjs`에서 바꾼 테스트만 실패하는 것을 확인하고 실패 이름을 보고한다. 최종 목록은 Implementer가 실제 단언을 보고 확정해 보고한다.
  - [ ] 새 테스트: 위치 불명 dispatch(lease에 cwd 없음, 매핑 없음)가 있어도 이 root의 셸 변경이 최근 후보에 귀속되어 나온다. host/target 조합 `codex/claude`와 `alpha/zeta` 모두.
  - [ ] `scanRoot`의 `:585` 조건에서 억제 호출을 없애 v0.5.0(`5f6fa2e9:lib/watch/watcher.mjs:522-527`)과 같은 귀속 경로로 되돌린다.
  - [ ] spec 3.1의 제거 대상(함수·notice·상태 필드·전용 상수·`prevScanAt`)을 지운다. 각각 다른 사용처가 없는지 grep으로 확인하고 결과를 보고한다. `lib/watch/dispatch.mjs`는 바꾸지 않는다.
  - [ ] `README.md` 99행을 spec 5절대로 고친다.
  - [ ] GREEN: `node --test tests/node/watch-watcher.test.mjs tests/node/watch-render.test.mjs tests/node/watch-dispatch.test.mjs` 통과.
  - [ ] `node scripts/update-manifest.mjs`. 기대: `lib/watch/watcher.mjs`, `lib/watch/model.mjs`(바뀐 경우), `README.md`(manifest 대상이면) 해시만 변경, 추가·삭제 없음. 다르면 hold.
  - [ ] 커밋(Orchestrator, 수락 뒤): `fix(watch): 활성 dispatch 중에도 셸 변경을 최근 세션에 귀속해 표시`
- 관련 테스트와 이유
  - `tests/node/watch-watcher.test.mjs`: 바뀌는 분기와 귀속 회귀. A1–A3, A7.
  - `tests/node/watch-render.test.mjs`: 귀속된 추정 행의 human/JSON 형식 회귀(render는 바꾸지 않음).
  - `tests/node/watch-dispatch.test.mjs`: dispatch index(heartbeat 포함)가 그대로인지 회귀.
  - `tests/node/manifest.test.mjs`: MANIFEST 갱신.
  - README를 읽는 테스트가 있는지 Implementer가 grep으로 확인하고, 있으면 관련 테스트에 이유와 함께 추가한다.
- Check: `npm run check:manifest`
- 수용 기준: A1–A7. QA는 fresh로 관련 테스트와 check를 돌리고, `git grep`으로 A4를 확인한다.

## 최종 검증 (T1 수락·커밋 뒤, fresh QA 1회)

- verified HEAD에서 한다. 시작·종료 `git status --porcelain`이 clean이 아니면 보류한다. 수행 중 Orchestrator와 Implementer는 그 workspace에 쓰지 않는다. task QA가 통과한 관련 테스트는 다시 돌리지 않는다.
1. (a) 계약 테스트 전부: `tests/node/test-scope-contract.test.mjs`, `tests/node/plan-level-records-contract.test.mjs`, `tests/node/run-mode-contract.test.mjs`, `tests/node/composite-instructions.test.mjs`, `tests/node/instruction-layout.test.mjs`, `tests/node/agent-fragments.test.mjs`, `tests/test_harness_contract.py`
2. (b) check 전부: `npm run check:manifest`, `npm run check:role-policy`, `node scripts/update-runtime-assets.mjs --check`, `node scripts/check-installer-parity.mjs`
3. (c) 재변경 파일: task가 하나라 없음.
4. 전체 회귀 잠정 판정: 해당 없음. 트리거 1(공유 생성기·runtime 아님), 2(base 이후 merge 없음 예상), 3(설정 변경 없음), 4(공개 인터페이스 변경 없음, 기존 v0.5.0 동작 복구). QA가 독립 확인하고 판단이 서지 않으면 1회 돌린다.
5. final Reviewer: Bounded 단일 task이고 공개 계약 변경이 없어 생략한다. 단, T1 diff가 `lib/watch` 밖 코드에 닿으면 Orchestrator가 1회 배정한다.

## 개정 이력

| 버전 | 날짜 | 분류 | 내용 | 승인 |
|---|---|---|---|---|
| v1 | 2026-11-22 | — | Planner 첫 초안 + Orchestrator 검토(귀속 없는 `shell` 이벤트, T1·T2) | 미승인, v2로 대체 |
| v2 | 2026-11-22 | substantive | 사용자 결정 U7(v0.5.0 귀속 복구)에 맞춰 단일 task로 다시 씀 | 사용자 "승인" |
