# 계약 테스트 기존 실패 정비 구현 계획

> **For agentic workers:** 이 plan은 ARC Orchestrator가 조정합니다. task마다 fresh Implementer → fresh QA → Orchestrator 수락 → focused commit 1개 순서로 진행합니다. Implementer와 QA는 Git 상태를 바꾸지 않습니다.

- 상태: v4 (2026-11-23 사용자 위임 승인: T2 표 4 개정, T3 미개시. v3 2026-11-22 사용자 승인. spec 5.1 Q1 갱신·Q3 인정, 5.2 U1 adapter 해시 갱신·U2·U3 opening 반영)
- Spec: `docs/superpowers/specs/2026-11-22-contract-test-baseline-design.md` (written-spec 승인 후 진행)
- workflow: `2026-11-22-contract-baseline-failures`
- 대상: `/Users/yunho/Desktop/project/arc/.claude/worktrees/qa-owned-verification`, `feat/qa-owned-verification`, approved base `2b482ea8`
- 깊이: Bounded (spec 필요). Orchestrator 확정.
- 커밋
  - 승인된 spec·plan은 첫 Implementer 전에 문서 전용 커밋 하나로 먼저 커밋한다: `docs(plan): 계약 테스트 기존 실패 정비 spec·plan 추가`
  - task마다 수락 뒤 focused 커밋 하나. 메시지 형식은 `type(scope): 한국어 설명`.
- 의존: T1과 T2는 파일이 겹치지 않고 서로 의존하지 않는다. 같은 worktree이므로 순서대로 실행한다(T1 → T2). T3는 T2 수락과 사용자 결정 뒤에만 연다.
- 공통 실행
  - Node: `node --test <files>`
  - Python: `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest tests.test_harness_contract -v` (pytest 미설치)
- 실패 판정: QA는 verification 규칙의 2단계(정적 분류 → 필요할 때만 base `2b482ea8` 재실행)를 따른다. 정적 분류는 `git diff --name-only 2b482ea8`와 untracked 파일로 한다.
- 진단 스크립트: 첫 assertion에서 멈추는 테스트의 전체 불일치를 보려고 쓰는 읽기 전용 스크립트다.
  - Orchestrator가 지정한 scratchpad 절대 경로에 둔다. 저장소에는 두지 않고 커밋하지 않는다.
  - QA는 자기 스크립트를 따로 쓰거나 같은 경로의 스크립트를 내용을 확인한 뒤 실행한다.
- 운영 주의: Implementer나 QA가 실행 중일 때 Orchestrator는 그 worktree에 쓰지 않는다.

## T1. instruction-layout fixture를 의도 확인된 변경에 맞춤

- 목표: spec D2·D3·D4. 분류 A 문서 계약 7개 항목과 protected 해시 16개를 갱신한다. Q1·Q2는 spec에 기록된 사용자 결정에 따라 넣거나 보류한다.
- Files (Implementer allowedPaths)
  - `tests/node/fixtures/instruction-contracts.json`
- 선행: 문서 커밋. Q1·Q2 결정이 spec에 기록돼 있으면 반영하고, 미결정이면 보류 항목으로 진행한다.
- 단계
  - [x] 진단(RED): 진단 스크립트로 두 가지를 출력하고 spec 1.1·1.2와 같은지 보고한다. 다르면 hold.
    - 모든 `fixture.platforms.{codex,claude}.contracts` 항목에 대해 테스트와 같은 `normalize`와 relocation을 적용한 포함 여부
    - 모든 `fixture.protected` 항목의 sha256 일치 여부
    - 함께 `node --test tests/node/instruction-layout.test.mjs` 결과(실패 3개, 이름)를 보고한다.
  - [x] 문서 계약 갱신. heading `Ownership`(codex, claude), `Instruction and execution adapter`(codex, claude), `Design path and plan depth`(codex, claude), `Models`(claude).
    - 항목마다 현재 문서 구절과 변경 근거 커밋(`77ad4041`·`d0b27ce2`·`e5f3cf7c`, `48aa233d`, `b349c45c`, `5cc1162d`)의 diff를 대조해, 바뀐 부분이 그 커밋들로 설명되는지 확인한다. 설명되지 않는 차이가 있으면 그 항목은 hold.
    - 기본은 `relocations`에 쌍을 더한다. 두 플랫폼 문구가 다르거나 부분 문자열이 중복이면 해당 플랫폼 `text`를 바꾼다.
    - 항목마다 방식, 바뀐 구절의 전후, 근거 커밋을 보고한다.
    - 기대 문장에서 바뀐 구절이 아닌 부분을 지우지 않는다.
  - [x] protected 재확인. 16개 파일마다 다음을 표로 보고한다.
    1. `git log --reverse --format=%h -S'<fixture 해시>' -- tests/node/fixtures/instruction-contracts.json`의 첫 커밋이 spec 1.2의 기록 커밋(`0fdf0427`, `1f6b11b0`, `1c3328d7`, `2a55d06e`, `ae08430d`)과 같은지 확인한다.
    2. `git log --format=%h <기록 커밋>..HEAD -- <파일>`이 spec 1.2 및 Scouter A 표와 같은지 확인한다.
    3. profile이면 `git diff <기록 커밋>..HEAD -- <파일>`에서 `model`, `model_reasoning_effort`, `permissionMode`, `tools`, `disallowedTools`, `sandbox_mode` 줄 변경이 없는지 확인한다.
    - 하나라도 다르면 그 파일은 갱신하지 않고 hold로 보고한다.
  - [x] 재확인을 통과한 파일의 해시를 HEAD 바이트 sha256으로 바꾼다.
  - [x] U2(v2): `opening`(양 플랫폼)에 `983c4d68`의 `**Role routing gate:**` 문단 삽입을 D2 방식으로 반영한다. v3: U3의 차이 3개(`31b7d0f7`, `b349c45c`, `e5222b5b`)도 같은 방식으로 반영한다. 그 밖의 opening 차이가 있으면 hold.
  - [x] Q1. 결정이 "갱신"이면 `Complete planning-document set`에 relocation `mechanical records below` → `task progress records below`를 더한다. 미결정이거나 "보류"면 바꾸지 않는다.
  - [x] Q2. 결정이 spec 기본값(출처 확인 후 갱신)이면 다음을 보고한 뒤, 두 조건이 맞을 때만 4개 해시를 갱신한다.
    - `git show --stat 0fdf0427`로 이동 전 경로를 찾는다.
    - `git show 0fdf0427^:<이전 경로>`의 sha256이 fixture 값과 같은지 본다.
    - `git diff 0fdf0427^:<이전 경로> 0fdf0427:<새 경로>`의 내용을 본다.
    - 조건이 맞지 않으면 갱신하지 않고 diff 요약을 보고한다. 결정이 "보류"면 확인 없이 바꾸지 않는다.
  - [x] U1(v2): Q2 확인 결과(R100 이동, 이후 변경 없음, fixture 값이 이동 전 해시와도 불일치)를 근거로 adapter 4개 해시를 현재 바이트 sha256으로 갱신한다.
  - [x] GREEN: `node --test tests/node/instruction-layout.test.mjs tests/node/agent-fragments.test.mjs`를 실행하고 진단 스크립트를 다시 돌린다. v2 기준 남은 불일치는 hold 파일뿐이어야 한다.
  - [x] `npm run check:manifest` 통과. `git diff --name-only`가 `tests/node/fixtures/instruction-contracts.json` 하나뿐인지 확인한다.
  - [x] 커밋(Orchestrator, 수락 뒤): `test(contract): instruction-layout fixture를 의도 확인된 문서·해시 변경에 맞춤`
- 관련 테스트와 이유
  - `tests/node/instruction-layout.test.mjs`: 갱신 대상 fixture를 직접 검사한다. 문서 계약 2개와 protected 1개가 대상이고, 나머지 27개는 회귀 확인이다.
  - `tests/node/agent-fragments.test.mjs`: 같은 fixture의 `agentProfileBaseline`을 읽으므로 그 구역이 그대로인지 확인한다.
- Check: `npm run check:manifest`
- 수용 기준(QA, fresh)
  - spec A1·A2·A5·A6·A7·A8.
  - QA는 진단 스크립트를 독립적으로 실행해 남은 불일치 목록을 확정한다.
  - relocation과 `text` 변경 항목마다 spec D2(기존 기대 부분 유지, 새 문단 포함)를 확인한다.
  - protected 16개 재확인 표를 다시 계산해 Implementer 보고와 대조한다.
  - JSON diff에서 `agentProfileBaseline`, `opening`, `bootstrap`, `skill`, `global` 변경이 없음을 확인한다.
- 보류 조건: 진단 결과가 spec과 다르거나, 재확인이 맞지 않거나, 근거 커밋으로 설명되지 않는 문서 차이가 있으면 해당 항목만 hold하고 Orchestrator에 보고한다. 나머지 항목은 계속한다.
- 진행 기록 (2026-11-22)
  - Implementer `42fef95f`: 문서 계약 9개 relocation 반영, protected 16개 재확인 표 작성 후 원표 위치 미제공으로 갱신 보류(Orchestrator 브리프 누락), Q2 출처 확인 결과 fixture 값이 이동 전 해시와도 불일치해 보류, `opening` 불일치 발견.
  - 사용자 결정 U1·U2 → plan v2. Implementer `9d2916c7`(fresh): 16개를 Scouter A 원표로 독립 대조 후 갱신, adapter 4개 갱신, `opening`은 추가 차이 3개로 hold.
  - QA `1766c086`: 문서 계약 9개·해시 20개 proven, `opening` 2건 hold 확인.
  - 사용자 결정 U3("모두 반영") → plan v3. Implementer `477bedfb`(fresh): `run` 필드(`ec866c65`)로 한 번 더 hold. Orchestrator 판정: U3-2는 `Pre-action gate record` 문단의 현재 문장 전체이며 같은 문단의 `ec866c65` `run` 필드를 포함한다. 재개 후 `opening` 반영.
  - QA `1766c086` 재개 2회(1회차는 zsh `status` 읽기 전용 변수 명령 오류): U2·U3, A1, A2, A6–A8 proven. `instruction-layout` 30/30, `agent-fragments` 5/5. A5는 최종 검증에서 확인. Orchestrator 수락.

## T2. harness 계약 테스트 항목별 대조와 기대 갱신

- 목표: spec D5–D8. 93개 FAIL·ERROR 줄을 대조 단위로 묶어 이전 문장과 현재 문장을 비교한다. P 항목만 테스트 기대를 갱신하고, L·D·M 항목은 소실 목록으로 남긴다.
- Files (Implementer allowedPaths)
  - `tests/test_harness_contract.py`
  - `docs/superpowers/plans/2026-11-22-contract-test-baseline-t2-comparison.md` (새 파일)
- 선행: 문서 커밋. T1과 독립이다(순서상 T1 수락 뒤 시작).
- 1단계: 대조표 작성 (테스트 수정 없음)
  - [ ] base 실행: Python 명령으로 35 tests, failures=92, errors=1을 확인한다. FAIL·ERROR 줄 목록이 `/private/tmp/arc-c1-qa-python.log`와 이름이 같은지 보고한다. 다르면 hold.
  - [ ] 단위 목록. FAIL·ERROR 줄마다 대조 단위 ID를 붙인다.
    - 같은 `(계약, path, 패턴)`을 검사하는 `assert_contracts` 계열 테스트와 변이 subTest는 한 단위로 묶는다.
    - 패턴이 아닌 단언에는 각각 따로 ID를 붙인다. 예: `test_planner_progress_and_saved_approval_contract` 370·371행, `test_document_order_*`의 `normal order:` 검사와 sequence, `test_common_contracts_have_platform_owners`, `test_policy_contract_checker_rejects_missing_guards`, `test_handoff_preserves_provenance_visual_and_resume_fields`, `test_verification_and_visual_companion_keep_visual_gaps_visible`의 각 단언.
  - [ ] 단위마다 대조
    - 이전 문장: 그 owner 파일의 `git log --format=%h -- <path>`를 따라가며 패턴이 마지막으로 일치한 revision R을 찾는다. 읽기 전용 스크립트로 `git show <rev>:<path>`에 같은 정규화와 패턴을 적용한다. R에서 일치한 문장을 인용한다.
    - 현재 문장: 현재 owner 파일의 대응 문장을 `path:line`과 함께 인용한다. 없으면 같은 플랫폼의 다른 reference와 SKILL.md를 검색해 M 후보를 찾는다.
    - spec D5 기준으로 P, M, L, D를 판정하고 근거를 쓴다. 주체, 행위, 조건, 범위, 규범 강도를 대조한다. D는 근거 커밋이나 spec을 인용한다.
    - 생성 role-policy 블록을 근거로 쓸 때는 Q3 결정에 따르고 표에 표시한다.
    - P이면 새 패턴 초안과 D6 자가 점검 결과를 함께 적는다.
  - [ ] 대조표 파일. `docs/superpowers/plans/2026-11-22-contract-test-baseline-t2-comparison.md`에 아래 형식으로 쓴다.
    - 머리말: base revision `2b482ea8`, 실행 명령, 실행 결과 수치
    - 표 1 FAIL·ERROR 줄 → 단위 ID 대응
    - 표 2 단위별 대조: `ID | 테스트·subTest | 계약 | owner path | 원 패턴·단언 | 마지막 일치 revision | 이전 문장 | 현재 문장(path:line) | 판정 | 근거 | 새 패턴(P만) | D6 점검`
    - 표 3 소실 목록(L, 승인 전 D·M): `ID | 빠진 의무 | 이전 문장 | 제거 추정 커밋 | 남는 FAIL 줄 | T3 후보 여부`
    - 표 4 사용자 승인 필요 항목(D 삭제 사유, M owner 변경안)
  - [ ] 체크포인트: Implementer는 1단계 결과를 보고하고 멈춘다.
    - Orchestrator가 대조표를 검토한다. D·M 항목과 Q3·Q4 관련 항목은 사용자 결정으로 보낸다.
    - 2단계는 같은 T2 Implementer를 재개해 진행한다(같은 task 안의 후속 작업). P 항목은 사용자 결정을 기다리지 않고 진행하며, 결정 대기 항목만 2단계에서 빠진다.
- 2단계: 테스트 기대 갱신
  - [ ] P 항목만 `tests/test_harness_contract.py`의 패턴과 단언을 대조표 2의 새 패턴으로 바꾼다.
    - 같은 패턴을 쓰는 직접 검사와 변이 검사는 정의 한곳(`COMMON_CONTRACTS`, `ROLE_LOCAL`, `NATIVE_ADAPTERS`, 개별 테스트의 리터럴)에서만 바꾼다.
    - 승인된 D는 삭제하고 주석이나 대조표에 사유를 남긴다. 승인된 M은 owner 항목을 더해 처리한다. 다른 패턴은 바꾸지 않는다.
  - [ ] 문서 순서 오류(`test_document_order_rejects_missing_required_gates`)
    - 판정이 P이면 `policy_contract_failures`의 `normal order:` 정규식과 `sequence`를 현재 `Order:` 문장에 맞추되, 모든 gate와 순서를 유지한다.
    - 테스트 451행 부근의 `.group()` 호출 전에 `assertIsNotNone`을 넣어 오류를 실패로 바꾸는 견고성 수정은 판정과 상관없이 허용한다.
    - gate가 하나라도 빠졌으면 L이다.
  - [ ] 음성 검사(282–320행 conflicting 패턴, `*_rejects_*` 테스트, 주입 문장)는 지우거나 약화하지 않는다. 변경이 있으면 이유를 대조표에 적는다.
  - [ ] GREEN 대상: Python 명령을 다시 실행한다. 남은 FAIL·ERROR 줄이 대조표 3의 "남는 FAIL 줄"과 정확히 같아야 하며(spec A3), 다르면 보고한다. base에서 통과하던 테스트가 모두 통과하는지도 확인한다.
  - [ ] D6 자동 점검을 읽기 전용 스크립트로 하고 결과를 대조표에 붙인다.
    - (1) 바뀐 패턴이 양 플랫폼 owner에 일치하는지
    - (2) 일치 범위가 생성 블록 밖인지(COMMON_CONTRACTS)
    - (3) 일치 부분을 지운 텍스트에서 `policy_contract_failures`가 해당 계약 실패를 내는지
    - (4) 패턴이 음성 주입 문장에는 일치하지 않는지
  - [ ] `git diff --name-only`가 allowedPaths 두 개뿐인지, `npm run check:manifest`가 통과하는지 확인한다.
  - [ ] 커밋(Orchestrator, 수락 뒤): `test(contract): harness 계약 테스트 기대를 의미 보존 문구에 맞추고 소실 목록 기록`
- 관련 테스트와 이유
  - `tests/test_harness_contract.py` 전체(35개): 수정 대상이고, 통과하던 음성·변이 검사의 회귀도 함께 본다.
  - Node 테스트는 관련이 없다. Python 파일을 읽는 Node 테스트가 없음을 grep으로 확인했다.
- Check: `npm run check:manifest`
- 수용 기준(QA, fresh)
  - spec A3·A4·A5·A6·A7·A8.
  - QA는 Python을 독립 실행한다.
  - 대조표 2의 P 판정 전부에 대해 이전 문장(R revision)과 현재 문장(path:line)을 직접 열어 판정을 다시 확인한다.
  - D6 점검 (1)–(4)를 독립적으로 다시 한다.
  - 남은 FAIL 줄과 대조표 3이 같은지 대조한다.
  - 승인되지 않은 삭제나 owner 변경이 diff에 없는지 확인한다.
  - 판정에 동의하지 않는 항목은 unmet으로 보고한다.
- 보류 조건: base 실행 결과가 로그와 다르거나, 판정 근거 커밋을 찾을 수 없거나, 패턴 하나가 여러 의무를 섞어 P와 L이 함께 나오면 해당 단위만 hold하고 보고한다. 기본은 L로 남긴다. 단위를 둘로 나누려면 D7에 따른 사용자 승인이 필요하다.
- 진행 기록 (2026-11-23)
  - Implementer `e2742fb2`: 1단계 대조표 작성, 사용자 M 16단위 승인 후 2단계 적용, 재개 8회. 재개는 QA 비동의와 A3 미충족 반영에 썼다.
    - L 재판정: U018 U021 U046 U107 U110 U137 U140 U019 U022 U051 U056 U061 U064 U157 U147 U067 U070 U091 U096 U097 U159 U161 U088 U093 U094.
    - 최종 집계: P 89, L 67(hold 42 포함), M 16, D 0.
  - QA `31042252`: U147 비동의, U019·U022 A3 문제 제기. U019·U022는 `lower()` 적용 착오로 판명됐고, 대소문자를 구분하면 False여서 L을 유지했다.
  - QA `9c81a864`: P 재확인을 3묶음으로 나눠 진행했다. 묶음 단위로 재개했다.
    - P 판정 확인: 동의 92, 비동의 6(U067·U091·U096·U097·U159·U161). 비동의 6건은 모두 L로 이동했다.
    - 나머지 검사
      - proven: Python 35 tests, failures=36, errors=0. 표 3 양방향 일치, A5 13개 유지, 커밋 권한 2단위, A8, `check:manifest`, `git diff --check`.
      - unmet(profile 기존 패턴 3개 변경): 표 4 개정으로 승인했다(사용자 위임). 개정 3패턴의 합성 결과 일치와 변이 실패는 proven.
  - Orchestrator 직접 확인: QA 스크립트 오류로 남은 항목을 직접 확인했다. 읽기 전용 스크립트를 썼다.
    - L 67단위: 원 패턴 문자열이 base와 현재 테스트 양쪽에 있고, 현재 owner에서 직접 평가하면 False다(63단위).
    - 예외 4단위
      - U003·U011: 순서 구간 추출(F001) 실패에 가려진 hold 단위다.
      - U132·U134: 합성 순서 패턴이다. 단계 목록이 base와 같고, 추출식 변경은 P인 U131·U133이다.
    - 바뀐 음성 검사 2개는 더 엄격해졌다.
    - 자동 연결되지 않은 삭제 12행은 M(합성 profile·커밋 규칙 owner)을 위한 checker 구조 변경이다. 정규화는 같다.
  - Orchestrator 수락. T3는 사용자 지시("T2까지만 진행")에 따라 이 작업에서 열지 않는다.

## T3. 소실 판정 규칙의 문서 복원 (조건부, 보류)

- 상태: 이 작업에서 열지 않음(2026-11-23 사용자 지시 "T2까지만 진행"). 소실 67단위는 T2 대조표 표 2·3에 남기고 후속 과제로 넘긴다. 원래 조건은 T2 수락과 소실 목록에 대한 항목별 사용자 결정 뒤에 spec·plan 개정(승인 필요)으로 구체화한다. 결정 전에는 Implementer를 배정하지 않는다.
- 예정 범위(개정에서 확정)
  - 복원하기로 결정된 항목만, host 중립 문장으로 같은 reference를 가진 모든 플랫폼 문서(`codex`, `claude`, `gemini`, `grok`의 `skill/references/*`, 필요하면 `SKILL.md`와 agent profile)에 대칭으로 반영한다.
  - 문서가 생성물이면 생성 경로(`scripts/update-runtime-assets.mjs` 등)를 따른다. 생성 여부는 개정 전에 Scouter로 확인한다.
  - 복원 문장이 fixture 문서 계약 baseline이나 protected 해시, `MANIFEST.sha256`에 영향을 주면 같은 task 안에서 갱신한다.
  - 대응하는 Python 소실 단위가 통과해야 한다.
- 예정 관련 테스트: `tests/test_harness_contract.py`, `tests/node/instruction-layout.test.mjs`, `tests/node/agent-fragments.test.mjs`, `tests/node/composite-instructions.test.mjs`, `tests/node/manifest.test.mjs`
- 예정 커밋: `docs(arc): 계약 테스트 소실 판정 규칙 문서 복원`(개정에서 확정)

## 최종 검증 (모든 task 수락·커밋 뒤, fresh QA 1회)

- verified HEAD에서 한다. 시작과 끝의 `git status --porcelain`이 clean이 아니면 보류한다. 수행 중 Orchestrator와 Implementer는 그 workspace에 쓰지 않는다. task QA에서 통과한 관련 테스트는 다시 돌리지 않는다. 다만 아래 (a)에 포함되어 있으면 그 결과의 기대 실패 목록과 대조한다.
1. (a) 계약 테스트 전부
   - `tests/node/test-scope-contract.test.mjs`
   - `tests/node/plan-level-records-contract.test.mjs`
   - `tests/node/run-mode-contract.test.mjs`
   - `tests/node/composite-instructions.test.mjs`
   - `tests/node/instruction-layout.test.mjs`
   - `tests/node/agent-fragments.test.mjs`
   - `tests/test_harness_contract.py`
   - 기대: `instruction-layout`은 T1 남은 불일치 목록과 같고, Python은 T2 대조표 3과 같으며, 나머지는 base와 같다.
2. (b) check 전부: `npm run check:manifest`, `npm run check:role-policy`, `node scripts/update-runtime-assets.mjs --check`, `node scripts/check-installer-parity.mjs`
3. (c) 재변경 파일: T1과 T2는 파일이 겹치지 않아 없음. T3가 열리면 개정에서 다시 정한다.
4. 관련 테스트 합집합: `tests/node/instruction-layout.test.mjs`, `tests/node/agent-fragments.test.mjs`, `tests/test_harness_contract.py`. 모두 (a)에 들어 있다.
5. 전체 회귀 잠정 판정: 해당 없음.
   - 트리거 1(공유 생성기·runtime 변경): 아님. 테스트와 fixture만 바꾼다.
   - 트리거 2(base 이후 merge): 없을 것으로 예상한다.
   - 트리거 3(설정 변경): 없음.
   - 트리거 4(공개 인터페이스 변경): 없음.
   - QA가 독립 확인하고, 판단이 서지 않으면 1회 돌린다. T3가 열려 문서와 생성물이 바뀌면 다시 판정한다.
6. final Reviewer: 1회 배정한다. 이유는 계약 테스트 기대를 바꾸는 작업이라 계약 약화 위험이 핵심이기 때문이다. 확인할 것은 다음과 같다.
   - 전체 diff(`2b482ea8..HEAD`, 문서 커밋 제외)에서 D2·D6 위반 여부
   - 승인되지 않은 삭제가 없는지
   - 대조표 판정의 타당성(표본이 아니라 P 전체)

## 개정 이력

| 버전 | 날짜 | 분류 | 내용 | 승인 |
|---|---|---|---|---|
| v1 | 2026-11-22 | — | Planner 첫 초안 + Orchestrator 검토(깊이 확정, T2 2단계 같은 Implementer 재개) | 사용자 "승인" |
| v2 | 2026-11-22 | substantive | T1 결과에 따른 U1(adapter 해시 갱신)·U2(opening 반영) 단계 추가 | 사용자 결정(선택지 응답) |
| v3 | 2026-11-22 | substantive | U3: opening의 의도된 차이 3개 반영 단계 추가 | 사용자 결정(선택지 응답) |
| v4 | 2026-11-23 | substantive | T2 표 4 개정(profile ROLE_LOCAL 기존 패턴 3개를 현재 합성 문구로 대체, 의미 동등 이상). T3는 열지 않음 | 사용자 위임("plan 개정 승인이 필요하면 나 대신 진행해")에 따른 Orchestrator 승인 |
