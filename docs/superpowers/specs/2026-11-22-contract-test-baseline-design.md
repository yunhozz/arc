# 계약 테스트 기존 실패 정비 설계

- 날짜: 2026-11-22
- 상태: v3 (T1 결과에 따른 사용자 결정 U1·U2·U3 반영, 2026-11-22 사용자 승인)
- workflow: `2026-11-22-contract-baseline-failures`
- 실행 대상: `/Users/yunho/Desktop/project/arc/.claude/worktrees/qa-owned-verification`, 브랜치 `feat/qa-owned-verification`, approved base `2b482ea8`
- 사용자 승인 진행 순서: T1 → T2 → T3(조건부). 사용자 "그 순서로 진행해"
- 범위 밖: 커밋 `c486ce3e`에서 이미 고친 4건(`[Ff]irst edit` 2건, `<a id>` anchor 링크 2건)

## 1. 배경 (정적 조사, 2026-11-22)

- Node `tests/node/instruction-layout.test.mjs`: 30개 중 3개 실패(최근 로그 `/private/tmp/arc-c1-qa-node.log`).
  - `codex contracts have explicit destinations and before-action gates`, `claude contracts have explicit destinations and before-action gates`: 첫 실패는 `coordination`의 `Ownership` fixture 전문 불일치.
  - `profile models, permissions, canonical policy and CLI/runtime bytes are preserved`: 첫 실패는 `shared/skill/runtime/identity.mjs` 해시.
  - 각 테스트는 첫 assertion에서 멈추므로 로그에는 첫 불일치만 보인다. Scouter 정적 대조로 확인한 전체 불일치는 문서 계약 5개 heading(양 플랫폼 합쳐 9개 항목)과 protected 해시 20개다.
- Python `tests/test_harness_contract.py`: 35개 테스트에서 실패 92건, 오류 1건(`/private/tmp/arc-c1-qa-python.log`). 상당수는 같은 패턴을 직접 검사(`assert_contracts`)와 변이 검사(`test_contract_mutations_reject_removed_holds_and_role_guards`)에서 함께 세므로 중복 집계다.
- 이 실패들은 master와의 merge-base `5f6fa2e9`에도 있었다(Scouter A). Python 실패는 `f677c216`과 HEAD에서 이름이 같다(첫 조사). 주요 문구 재작성 후보는 `4eae3d70` `refactor(arc): TUI 생명주기 흐름 단순화`다. 이 테스트를 퇴역시킨다는 결정은 찾지 못했다.

### 1.1 Node 문서 계약 불일치 (Scouter A)

| heading | 플랫폼 | 변경 근거 | 분류 |
|---|---|---|---|
| `Ownership` | codex, claude | `77ad4041` 소유권 전환, `d0b27ce2` composite 실행 도입, `e5f3cf7c` Mixed routing. 실행 모드 설명 중간에 composite native 이름 문단이 들어감 | A |
| `Instruction and execution adapter` | codex, claude | `48aa233d` Implementer 대화 재사용·교체 기준 문단 추가 | A |
| `Design path and plan depth` | codex, claude | `b349c45c` design path·depth·risk 판단을 pre-action 기록에 게시하는 의무 추가 | A |
| `Models` | claude | `5cc1162d` `active ... preset` → `active ... role settings` | A |
| `Complete planning-document set` | codex, claude | `eb240af5` `mechanical records` → `task progress records` | B (Q1) |

### 1.2 Node protected 해시 불일치 (Scouter A)

- A, 16개: `shared/skill/runtime/identity.mjs`, `lib/runtime/identity.mjs`, `shared/skill/runtime/schema.mjs`, `lib/runtime/schema.mjs`(`0dd46276`); `claude/agents/arc-planner.md`, `claude/agents/arc-qa.md`, `claude/agents/arc-reviewer.md`, `claude/agents/arc-scouter.md`, `codex/agents/arc-implementer.toml`, `codex/agents/arc-planner.toml`, `codex/agents/arc-qa.toml`, `codex/agents/arc-reviewer.toml`, `codex/agents/arc-scouter.toml`(생성 정책·지침 조각 변경 `e5222b5b`, `e653dfa4`, `aad09494`, `18022b44`, `214aae2d`, `ec866c65`, `957feace` 중 해당분); `shared/skill/runtime/role-policy.json`, `lib/policy/role-policy.json`(`957feace`); `lib/cli/root.mjs`(`e391a4ea`, `bab8aa14`).
- B, 4개: `shared/skill/runtime/adapters/claude.mjs`, `shared/skill/runtime/adapters/codex.mjs`, `lib/runtime/adapters/claude.mjs`, `lib/runtime/adapters/codex.mjs`. fixture를 기록한 커밋 `0fdf0427`에서 이미 해시가 맞지 않았고 그 뒤 변경 커밋은 없다. 플랫폼별 adapter 해시를 shared 경로로 옮기면서 생긴 것으로 추정한다(Q2).
- profile 필드 `model`, `model_reasoning_effort`, `permissionMode`, `tools`, `disallowedTools`, `sandbox_mode`는 기록 이후 diff에서 바뀌지 않았다(Scouter A, 정적).

## 2. 목표와 비목표

- 목표
  - 의도가 확인된 변경에 맞춰 Node fixture를 갱신한다.
  - Python 실패를 항목별로 대조해서, 의미가 보존된 항목은 테스트 기대를 갱신하고 의미가 빠진 항목은 소실 목록으로 남긴다.
  - 그 결과 남는 실패가 모두 설명된 상태가 되게 한다.
- 비목표
  - T3를 빼면 `*/skill/references/*`, `*/skill/SKILL.md`, agent profile, runtime 코드, `MANIFEST.sha256`를 바꾸지 않는다.
  - gemini·grok 플랫폼으로 테스트 범위를 넓히지 않는다. 현재 두 테스트는 `codex`, `claude`만 검사한다.
  - 테스트 구조 재설계, 새 계약 추가, 플랫폼 id 분기 신설은 하지 않는다.

## 3. 결정

- D1 테스트 쪽만 바꾼다. 문서와 runtime은 지금 상태를 정답 후보로 보고, 테스트 기대를 그 의미에 맞출지 판정한다. 의미가 빠진 경우에도 이번 범위에서는 문서를 고치지 않는다(T3에서 사용자 결정 후).
- D2 Node 문서 계약(분류 A, heading 4개, 항목 7개)
  - 기본은 `fixture.relocations[heading]`에 `이전 부분 문자열 → 현재 문자열` 쌍을 더하는 방식이다. 원래 baseline 문장을 fixture에 그대로 두고, 바뀐 부분만 기록으로 남기기 위해서다.
  - 두 플랫폼에서 바뀐 텍스트가 다르거나, 같은 부분 문자열이 두 번 이상 나와 `replaceAll`이 의도와 다르게 적용되면 그 플랫폼 항목의 `text`를 현재 문장으로 바꾼다.
  - 어느 방식이든 이전 기대 문장 가운데 바뀐 구절이 아닌 부분을 지우지 않는다. 새로 들어간 문단은 기대 문자열에 포함한다. 결과적으로 기대는 같거나 더 길어진다.
  - `fixture.agentProfileBaseline`, `bootstrap`, `skill`, `global`은 건드리지 않는다. `opening`은 U2(5.2절)에 따라 `983c4d68`의 `**Role routing gate:**` 문단 삽입만 같은 방식으로 반영한다.
- D3 Node protected 해시(분류 A, 16개)
  - 갱신 전에 파일마다 확인한다. (a) fixture 해시를 처음 기록한 커밋, (b) 그 커밋부터 HEAD까지 그 파일을 바꾼 커밋 목록, (c) 이 둘이 1.2절 및 Scouter A 표와 같은지.
  - profile이면 (d) 위 필드 diff가 없는지도 확인한다.
  - 하나라도 다르면 그 파일은 갱신하지 않고 보류한다.
  - 통과한 파일은 HEAD 바이트의 sha256으로 바꾼다.
- D4 Q1과 Q2(분류 B)는 열린 질문이다(5절). 사용자 결정이 기록되기 전에는 해당 fixture 항목을 갱신하지 않으며, 그로 인한 실패는 남은 실패로 허용한다. 결정이 기록된 뒤 T1 시작 전이면 T1에 포함하고, T1 수락 뒤면 T1 범위의 후속 조건부 task로 처리한다.
- D5 Python 대조 단위와 판정
  - 대조 단위는 고유한 `(계약, owner path, 패턴)`과 패턴이 아닌 개별 단언(예: `test_planner_progress_and_saved_approval_contract`의 마지막 `assertRegex` 2개, 문서 순서 검사)이다.
  - FAIL·ERROR 줄 93개를 각각 하나 이상의 단위에 대응시킨다.
  - 단위마다 기록할 것
    - 마지막으로 일치한 revision과 그때의 문장(이전 문장)
    - 현재 owner 파일의 대응 문장과 `path:line`(현재 문장)
    - 판정
  - 판정 기준
    - P 보존: 주체, 행위 또는 금지, 조건과 범위, 규범 강도(MUST/never/only 등)가 모두 같거나 더 강하다. 문구 축약과 같은 owner 안의 이동은 허용한다.
    - M 이동: 의무는 남아 있지만 테스트가 정한 owner가 아닌 파일에 있다.
    - L 소실: 의무가 없거나 약해졌다(조건 삭제, 범위 축소, 규범 강도 하락).
    - D 삭제 후보: 설계상 의도적으로 한곳으로 모아서 그 단언이 겨냥한 위치에는 더 이상 둘 필요가 없다는 근거(커밋·spec)가 있다.
  - COMMON_CONTRACTS owner에서는 생성된 role-policy 블록(`[ARC role policy: contract begin]`부터 `end`까지) 안의 문장을 보존 근거로 쓰지 않는다(테스트 주석 17-18행). 다른 단언에서 생성 블록을 근거로 인정할지는 Q3로 정한다.
- D6 계약 강도 규칙(P 항목 갱신)
  1. 새 패턴은 두 플랫폼의 현재 owner에 모두 일치한다. 플랫폼별 분기는 새로 만들지 않는다.
  2. 일치 범위가 COMMON_CONTRACTS의 생성 role-policy 블록 안에 있으면 안 된다.
  3. 원 패턴의 범위 연산자를 넓히지 않는다. `[^.]*`를 `.*`로 바꾸지 않고, 의무 키워드를 와일드카드로 대체하지 않는다. 대안(`|`)은 두 대안이 모두 문서에 있는 경우에만 쓴다.
  4. 변이 검사에서, 일치 부분을 제거하면 해당 계약 검사가 실패해야 한다.
  5. 음성 검사(`conflicting` 패턴, `*_rejects_*` 테스트, 주입 문장)는 지우거나 약화하지 않는다.
  6. 오류를 실패로 바꾸는 견고성 수정(`None.group()` 전에 `assertIsNotNone`)은 허용하고 기록한다.
- D7 M과 D 항목은 T2 체크포인트에서 Orchestrator 검토를 거친다. 테스트 삭제와 owner 변경은 사용자 승인 대상이다. 승인 전에는 L처럼 다뤄서 테스트를 그대로 두고 실패로 남긴다. L 항목은 테스트를 바꾸지 않으며 소실 목록에 올린다.
- D8 T2 대조표와 소실 목록은 `docs/superpowers/plans/2026-11-22-contract-test-baseline-t2-comparison.md`에 둔다. T2 Implementer가 쓰고 T2 커밋에 포함한다. 이 spec과 plan 본문은 바꾸지 않는다.
- D9 T3(소실 규칙의 문서 복원)는 T2 소실 목록을 보고 사용자가 항목별로 결정한 뒤에만 구체화한다. 구체화는 이 spec과 plan의 개정(승인 필요)으로 한다. 복원은 host 중립 문장으로 하고, 같은 reference를 가진 모든 플랫폼 문서(codex, claude, gemini, grok)에 대칭으로 반영한다. 이로 인해 fixture 문서 계약이나 manifest에 영향이 생기면 그 개정에서 다룬다.

## 4. 수용 기준

- A1 Node: `tests/node/instruction-layout.test.mjs`에서 남은 실패는 Q1·Q2 결정 상태로 설명되는 것뿐이다. v2(U1·U2 반영) 기준으로는 D3 hold 파일이 없으면 3개 테스트가 모두 통과한다. 진단으로 전체 불일치 목록을 뽑았을 때 Q1 미결정이면 `Complete planning-document set` 2개, Q2 미결정 또는 보류면 adapter 해시 4개, D3에서 보류된 파일만 남는다.
- A2 `tests/node/agent-fragments.test.mjs`는 base `2b482ea8`와 결과가 같다(fixture 공유).
- A3 Python: T2 뒤 `tests/test_harness_contract.py`의 FAIL·ERROR 줄이 모두 소실 목록(L, 승인 전 D·M) 단위 하나 이상에 대응한다. 소실 목록의 각 단위는 FAIL 줄을 하나 이상 만든다. 변이 검사 subTest는 단위와 1:1이다.
- A4 T2에서 바꾼 패턴과 단언은 모두 D6의 1–5를 만족하고, 대조표에 이전 문장, 현재 문장, 판정 근거, 전후 패턴이 있다.
- A5 새 실패가 없다. base `2b482ea8`에서 통과하던 테스트는 계속 통과한다.
- A6 `npm run check:manifest` 통과, `MANIFEST.sha256` 불변(테스트 파일은 manifest 대상이 아니다).
- A7 문서, profile, runtime 파일 diff가 없다(T3 전).
- A8 플랫폼 id 분기를 새로 만들지 않는다.

## 5. 열린 질문 (사용자 결정 필요)

- Q1 `Complete planning-document set`의 `mechanical records` → `task progress records`(`eb240af5`) 범위 동등성
  - 관찰
    - 현재 `planning.md`는 task progress records를 "checkboxes, notes, results, evidence and completion status"로 정의한다(codex `planning.md:120`).
    - "Every non-progress content change, including a mechanical correction, is a plan revision requiring applicable approval"(`:122`)이라고 명시한다.
    - Python 테스트도 이미 `task progress records[^.]*need no new approval`, `mechanical[^.]*(?:correction|fix)[^.]*plan revision`을 요구한다(`tests/test_harness_contract.py:21,25,29`).
  - 판단: 새 표현은 승인 없이 고칠 수 있는 범위를 좁힌 쪽이다. 예외가 넓어진 것이 아니다.
  - 기본값 제안: 의도된 강화로 보고 fixture를 갱신한다(relocation `mechanical records below` → `task progress records below`, 양 플랫폼).
  - 대안: 갱신을 보류하고 남은 실패로 둔다.
- Q2 adapter 해시 4개가 `0fdf0427` 기록 시점부터 불일치
  - 기본값 제안: T1에서 읽기 전용 출처 확인을 먼저 한다.
    1. `0fdf0427`이 옮긴 원래 플랫폼별 adapter 경로를 찾는다.
    2. 그 경로의 `0fdf0427^` 바이트 해시가 fixture 값과 같은지 본다.
    3. 원래 파일과 `0fdf0427`의 shared 파일 diff가 이동에 따른 수정(import 경로, registry 조회)뿐인지 본다.
    - 둘 다 맞으면 현재 바이트로 갱신한다. `0fdf0427` 이후 변경이 없으므로 현재 바이트는 기록 시점 바이트와 같다.
    - 하나라도 아니면 갱신하지 않고 diff를 보고한 뒤 다시 결정한다.
  - 대안: 확인 없이 보류하고 남은 실패로 둔다.
- Q3 Python의 profile·coordination 단언(예: `test_planner_progress_and_saved_approval_contract`의 `profile`, `coordination` artifact)에서 생성된 role-policy 블록 문장(`[role.planner-draft-only]`)을 보존 근거로 인정할지
  - 기본값 제안: COMMON_CONTRACTS owner를 빼고는 인정한다. 생성 블록은 canonical 정책이고 Node가 byte 단위로 강제하기 때문이다.
  - 다만 인정하면 패턴이 생성 블록 문구에 맞춰 바뀌므로, 대조표에 "생성 블록 근거"라고 표시한다.
- Q4 T2 결과 D(삭제 후보)와 M(owner 변경) 항목의 처리
  - T2 체크포인트에서 항목별로 사용자 승인을 받는다.
  - 기본값 제안: 승인 전에는 테스트를 유지하고 소실 목록에 둔다.

### 5.1 사용자 결정 (2026-11-22)

- Q1: 갱신. 의도된 강화로 보고 양 플랫폼 fixture에 반영한다.
- Q2: 출처 확인 후 갱신(기본값). 조건이 맞지 않으면 갱신하지 않고 보고한다.
- Q3: 인정(기본값). COMMON_CONTRACTS owner는 제외하고, 대조표에 "생성 블록 근거"로 표시한다.
- Q4: 기본값. D·M 항목은 T2 체크포인트에서 항목별 승인, 승인 전에는 실패로 남긴다.

### 5.2 T1 결과에 따른 사용자 결정 (2026-11-22, v2)

- U1 (Q2 대체): adapter 해시 4개는 `0fdf0427`의 이동이 R100(바이트 동일)이고 이후 변경이 없으나 fixture 값이 이동 전 바이트 해시와도 다르다. fixture 값이 잘못 기록된 것으로 보고 현재 바이트 sha256으로 갱신한다.
- U2: 문서 계약 대조에서 새로 드러난 `opening`(양 플랫폼 `SKILL.md`)의 불일치는 `983c4d68` `fix(skill): 통합모드 역할 경로 게이트를 SKILL.md 상단에 추가`가 넣은 `**Role routing gate:**` 문단 때문이다. D2와 같은 방식(기존 기대 유지, 새 문단 포함)으로 반영한다.

- U3 (v3): `opening`에는 U2 문단 외에 의도된 커밋의 차이 3개가 더 있다. (1) 삽입 문단의 `Never substitute` → `NEVER substitute`(`31b7d0f7`), (2) `**Pre-action gate record:**` 문단 추가(`b349c45c`), (3) `Same-task corrections/rechecks default to current Implementer/QA…` → `Same-task corrections and rechecks use the current Implementer…`와 최종 Reviewer 재확인 규칙 추가(`e5222b5b`). 넷 모두 D2 방식으로 반영한다(사용자 "모두 반영").

## 6. 위험과 한계

- 의미 동등성은 사람의 판정이다. QA가 P 판정 전부를 독립적으로 다시 확인하고, 최종 Reviewer가 전체 diff에서 계약 약화를 본다.
- 문서 계약 비교는 정규화된 부분 문자열 포함 검사라서, 문단이 하나만 끼어도 실패한다. relocation은 이 특성을 유지한 채 바뀐 부분만 기록한다.
- T3가 열리면 문서 변경 때문에 fixture 문서 계약과 protected 해시가 다시 바뀔 수 있다. 그 영향은 T3 개정에서 정한다.
- gemini·grok은 이 두 테스트에서 검사하지 않는다. 후속 과제 후보로만 기록하고 이번에는 넓히지 않는다.

## 7. 개정 이력

| 버전 | 날짜 | 분류 | 내용 | 승인 |
|---|---|---|---|---|
| v1 | 2026-11-22 | — | Planner 첫 초안 + Orchestrator 검토(변경 없음) | 사용자 "승인", Q1–Q3 결정(Q4 기본값) |
| v2 | 2026-11-22 | substantive | T1 결과: U1(adapter 해시 현재 바이트로 갱신, Q2 대체), U2(`opening`의 Role routing gate 문단 반영) | 사용자 결정(선택지 응답) |
| v3 | 2026-11-22 | substantive | U3: `opening`의 의도된 차이 3개 추가 반영 | 사용자 결정(선택지 응답) |
