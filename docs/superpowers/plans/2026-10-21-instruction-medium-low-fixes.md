# ARC 지침 중간·낮음 우선순위 항목 정리 구현 계획

> **실행자 안내:** task 단위로 진행하고 단계는 `- [ ]`로 추적합니다. 문서 저장, Git 작업(stage·commit), task 수용은 Orchestrator가 맡습니다. Coder와 QA는 Git 상태를 바꾸지 않습니다. 명령은 단순 명령 또는 `node -e`/`python3 -c`로 씁니다(리다이렉트·heredoc·파이프·루프 금지).

**Goal:** 이전 계획 이후 남은 중간·낮음 항목(fixture 라벨, 포인터, hard-wrap 잔재, 모호한 용어, 문법·표기, 기타)을 규칙 의미를 바꾸지 않고 정리합니다. 의미 변경 가능성이 있는 항목은 개별 표시합니다.

**Architecture:** Bounded 경로. 대상은 양 플랫폼 SKILL.md, references, 에이전트 프로필, 고정 문구 테스트(fixture JSON, Python 3종)입니다. 고정 문구에 걸린 편집은 같은 task 안에서 fixture/Python 기대값을 그 항목만 갱신합니다. 관리 섹션(`[ARC role policy: contract begin]`~`end`)과 `lib/policy/role-policy.json`은 건드리지 않습니다. 모든 task가 MANIFEST.sha256을 공유하므로 T1→T6 순서로 직렬 진행합니다.

**Tech Stack:** Markdown 지침, TOML/Markdown 에이전트 프로필, Node(`node --test`) 계약 테스트, Python `unittest` 계약 테스트.

**Spec:** 없음. 2026-10-21 승인된 짧은 설계(Bounded, plan 필요, spec 없음)와 사용자 결정 D4-1~D4-7을 따릅니다.

## Global Constraints

- 작업 위치 /Users/ma-24-007/Desktop/workspace/arc, 브랜치 master(사용자 선택), 기준 HEAD 650940b01af75f28e258ee7ed1c827147b77c526. 착수 시 미추적 `tests/__pycache__/`만 허용.
- 지침 본문은 영어, 이 계획·보고는 한국어. 제외: `references/superpowers/**`.
- 관리 섹션과 `lib/policy/role-policy.json` 수정 금지.
- 줄 번호는 650940b 기준입니다. **착수 전 Coder가 Grep으로 재확인**하고, 어긋나면 문구로 위치를 찾습니다.
- 각 top-level task는 focused commit 하나. 커밋 제목은 영어 type + 한국어 요지.
- 공통 완료 조건(매 task):
  1. `node scripts/update-manifest.mjs`로 MANIFEST 갱신 후 `npm run check:manifest` OK
  2. `npm run check:role-policy` OK
  3. `python3 -m unittest tests.test_claude_payload tests.test_harness_contract tests.test_arc_policy` 195개 통과
  4. `node --test tests/node/instruction-layout.test.mjs tests/node/role-policy.test.mjs` 20개 통과
  5. `npm test` 전체 실패 집합이 기준선 22개(목록: /private/tmp/claude-501/-Users-ma-24-007-Desktop-workspace-arc/ae8377d4-82d0-479f-bab9-82d03260dab5/scratchpad/node-baseline-failures.txt)의 부분집합
- 사용자 결정: D4-1 혼합 용어 정리, D4-2 항목 6 보류, D4-3 frontmatter 값 유지 + Models 안내 한 줄, D4-4 `.gitignore` `__pycache__/`, D4-5 stop 문구 "tool failure" 통일, D4-6 어색한 끊김만 수정, D4-7 의미 변경 가능 항목 개별 표시.

## 사전 조사 결과 (확정)

1. **Claude planning.md의 SKILL.md 포인터는 모두 유효합니다.** :85 "(SKILL.md Role gate)"는 SKILL.md 도입부 Role gate, :103 "common handoff gate (SKILL.md, handoff)"는 SKILL.md:79 절을 가리킵니다. Claude에는 결함 있는 "SKILL.md Risk-scaled" 포인터가 없습니다. 결함 후보는 Codex 3곳(planning.md:137-138, commit.md:10, verification.md:105)입니다. Codex SKILL.md:77에도 "Risk-scaled execution" 절이 있으나 verification.md로 보내는 안내 절이어서 포인터가 모호합니다.
2. **Claude handoff.md:107,122,127의 평문 "Risk-scaled execution"은 링크로 바꾸지 않습니다.** fixture 직접경로 계약(claude)과 `tests/test_claude_payload.py:324,578`("Significant risk is defined in Risk-scaled execution and excludes")이 고정합니다.
3. **codex `agents/arc-coder.toml`에는 "command failure"/"tool failure" 문구가 없습니다.** :22 Terms의 "Stop and inspect: on failure or partial completion"만 있고 "missing assigned path ..." 문장 자체가 없습니다. 문구 통일 대상은 6곳: claude `arc-qa.md:49`, `arc-coder.md:48`, codex `arc-scouter/planner/qa/reviewer.toml:22`(모두 "command failure"). Claude scouter:44, planner:53, reviewer:44는 이미 "tool failure". Codex coder에 해당 문장을 새로 넣는 것은 새 규칙이라 이번 범위에서 제외합니다.
4. **SKILL.md 상한 여유:** fixture `skill.bytes`/`lines`는 codex 31216/352, claude 32713/366(미만 조건). 현재 SKILL.md는 codex 91줄, claude 89줄이라 줄 수 여유가 큽니다. 바이트는 `instruction-layout` 테스트가 검증합니다. 이번 편집은 줄을 줄이거나 한 줄 추가에 그칩니다.
5. **node 계약 비교는 공백 정규화(`\s+`→공백, `references/` 제거) 후 `includes`입니다.** Python 3종도 대부분 `' '.join(text.split())` 후 비교하므로 줄바꿈 위치는 무관합니다. 줄 단위로 읽는 곳은 SKILL.md의 `|` 표 행 탐색(`instruction-layout.test.mjs:18,24`, `test_arc_policy.py:198,687,801`)과 `Before classifying` 시작 줄뿐입니다. 이 줄들은 합치거나 나누지 않습니다.
6. **fixture `heading`은 에러 메시지 라벨과 `relocations[heading]` 키로만 쓰입니다.** relocations 키는 4개(Instruction and execution adapter / Common handoff gate / Orchestrator direct path for small tasks / Risk-scaled execution)이므로 이 키와 겹치지 않게 라벨을 바꾸면 됩니다.
7. **`protected` 해시**(fixture 243-301행)가 `claude/agents/arc-*.md` 5개, `codex/agents/arc-*.toml` 5개, `models.toml` 2개를 바이트 단위로 고정합니다. 프로필을 건드린 task는 해당 파일 해시만 갱신합니다(`node -e "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync('<경로>')).digest('hex'))"`).
8. **코드 확인된 고정 위치 요약(편집별 상세는 각 task에 표기):** `a Orchestrator`(fixture 40/89/152/208, Python 5곳), `Reviewer timing: SKILL.md Risk-scaled execution`(fixture 110, arc_policy 93/349/353/354), `choice reuse and restart brief rules are there`(fixture 26/138, arc_policy 813), `approved no-doc scope`(fixture 54/166), `risk-scaled, unchanged`(fixture opening 14/126), `Commit external actions` 본문(fixture 236), `### Coder handoff gate`(arc_policy 132/302/762, fixture 61), 헤딩 리터럴 `### execution-target request gate`(test_claude_payload 662-663), codex git-recovery `###` 4개(arc_policy 614-617), `legacy or restart`(arc_policy 1452), `uncommitted documents are not absent`(test_claude_payload 480), `global fallback`/`No findings may be brief`/`complete keyed url`(fixture, arc_policy 248/498), 링크·앵커 유효성 전수 검사(test_harness_contract 521-531).

## Review Focus

- 고정 문구 편집 시 fixture/Python 기대값 갱신 누락 또는 과다 갱신(해당 항목 외 변경 금지).
- hard-wrap 정리가 표 행, 헤딩, 목록, 코드블록, 관리 섹션, `Before classifying` 줄을 건드리는 위험.
- 헤딩 변경에 따른 앵커 링크 파손과 `### ` 리터럴 고정.
- 에이전트 프로필 편집이 관리 섹션을 침범하거나 해시를 잘못 갱신하는 위험.
- 한쪽 플랫폼만 고쳐 대칭이 깨지는 위험(정당한 차이: Claude는 current checkout만, Codex는 managed worktree 포함).
- 용어 대체가 규칙 의미를 바꾸는 위험(의미 변경 표시 항목은 Orchestrator 확인 후 진행).

(문서 변경이므로 failing-test-first 대신 "기준선 → 변경 → 대조 check" 형식을 씁니다.)

---

## 기준선 단계 (커밋 없음, T1 착수 전)

- [ ] **B1:** `git rev-parse HEAD`가 650940b01af75f28e258ee7ed1c827147b77c526이고 `git status --short`가 `?? tests/__pycache__/`만 보이는지 확인(계획 문서 커밋 후에는 그 커밋 기준). 다르면 중단 보고.
- [ ] **B2:** 기준선 재확인: `npm run check:manifest`(138 files), `npm run check:role-policy`(25 targets), Python 195 OK, node 핵심 20/20, 전체 node 실패 22개가 위 목록과 같은지 대조.

---

### Task 1: fixture 라벨과 Codex Risk-scaled 포인터 정정 (항목 1, 2)

**Files:**
- Modify: `tests/node/fixtures/instruction-contracts.json` (227행 heading, 234행 heading, 110행 codex commit 계약 text)
- Modify: `codex/skill/references/planning.md:137-138`, `codex/skill/references/commit.md:10`, `codex/skill/references/verification.md:105`
- Modify: `tests/test_arc_policy.py:93,349,353,354`
- Modify: `MANIFEST.sha256`

**Interfaces:** Consumes 없음. Produces: Codex의 Risk-scaled 참조가 `verification.md#risk-scaled-execution` 링크 또는 "section above"로 통일.

**선행:** 기준선.

- [ ] **Step 1:** fixture 227행 `"heading": "Automatic commit after plan-task acceptance"`(claude)를 `"Focused commits (plan-task acceptance)"`로, 234행 `"Commit external actions"`를 `"Failure and external-action boundaries"`로 바꿉니다. 108행(codex)은 유지(codex commit.md:6에 같은 이름의 절이 있음). 본문 `text`와 `relocations`는 변경 없음.
- [ ] **Step 2:** codex `commit.md:10` "(Reviewer timing: SKILL.md Risk-scaled execution)" → "(Reviewer timing: [Risk-scaled execution](verification.md#risk-scaled-execution))". 같은 문장을 가진 fixture 110행 text를 동일하게 수정.
- [ ] **Step 3:** codex `planning.md:137-138` "(Reviewer timing: SKILL.md Risk-scaled execution)" → "(Reviewer timing: [Risk-scaled execution](verification.md#risk-scaled-execution))".
- [ ] **Step 4:** codex `verification.md:105` "follow SKILL.md Risk-scaled execution." → "follow the Risk-scaled execution section above."(같은 파일 내 자기 링크를 피하고 :67의 기존 표현과 맞춤).
- [ ] **Step 5:** Python 기대값 갱신(소문자 정규화 텍스트 기준):
  - 93, 349: `r"reviewer timing and task-boundary gates follow the risk-scaled execution section above"`
  - 353: `r"never list reviewer as a per-task required check \(reviewer timing: \[risk-scaled execution\]\(verification\.md#risk-scaled-execution\)\)"`
  - 354: `r"reviewer timing: \[risk-scaled execution\]\(verification\.md#risk-scaled-execution\)"`
- [ ] **Step 6:** `Grep`으로 `SKILL.md Risk-scaled`가 양 플랫폼에서 0건인지 확인. 새 링크 앵커가 `## Risk-scaled execution` 헤딩과 일치하는지 확인(`test_harness_contract`의 링크 검사가 검증).
- [ ] **Step 7:** MANIFEST 갱신, 공통 완료 조건 수행.
- [ ] **Step 8:** Orchestrator가 수용 후 커밋. 제안 제목: `fix(instructions): fixture 라벨과 Risk-scaled 포인터 정정`.

**수용 기준(AC-1):** fixture 두 라벨이 실제 구조를 설명. Codex 3곳의 포인터가 존재하는 절을 가리킴. Claude handoff.md 평문 참조는 변경 없음. 의미 변경 없음.

**필수 QA/focused check:** fresh QA가 (a) Grep 0건, (b) fixture diff가 라벨 2개와 110행 text 외에 없음, (c) Python 4곳 외 변경 없음, (d) 공통 완료 조건 출력을 확인. 증거: diff와 명령 출력.

**Hold 조건:** 갱신 범위 밖의 fixture/Python 실패가 생기거나 Claude 쪽 결함이 새로 발견되면 보류·보고.

---

### Task 2: 문법·표기·구조 정리 (항목 5 일부)

**Files:**
- Modify (문법 "a Orchestrator"→"an Orchestrator"): `claude/skill/references/handoff.md:97`, `claude/skill/references/planning.md:88`, `codex/skill/references/handoff.md:54,178`, `codex/skill/references/planning.md:94,116`
- Modify (고정 기대값): fixture 40, 89(두 곳), 152, 208행의 해당 문구; `tests/test_claude_payload.py:485`, `tests/test_harness_contract.py:232`, `tests/test_arc_policy.py:774,795,798`(소문자 정규식 `a orchestrator`→`an orchestrator`)
- Modify (이중 공백): `claude/skill/SKILL.md:65`, `codex/skill/SKILL.md:67`("completion;  QA" → "completion; QA")
- Modify (H1): `claude/skill/references/coordination.md:1`, `codex/skill/references/coordination.md:1` "# 역할 배정과 조정" → "# Role assignment and coordination"
- Modify (H2 래퍼): `claude/skill/references/handoff-prep.md` 6행 앞에 `## Execution-target and Git evidence gates` 삽입, `codex/skill/references/git-recovery.md` 7행 앞에 `## Recovery cases` 삽입. 기존 `###` 헤딩 텍스트·레벨은 변경 금지.
- Modify (중복 문구/긴 줄): `claude/skill/references/commit.md:17`을 문장 단위 여러 줄로 나누고 "; push, publication and merge require user authorization" 절을 삭제(관리 규칙 `external.explicit-user-authority`가 동일 내용을 규정). fixture 236행 text에서 같은 절 삭제. 줄 나누기만으로는 정규화되어 고정에 걸리지 않음.
- Modify: `MANIFEST.sha256`

**Interfaces:** Produces: 이후 task가 기준으로 삼는 정리된 문구. 프로필 파일은 이 task에서 건드리지 않음(T6에서 일괄).

**선행:** T1.

- [ ] **Step 1:** 위 편집을 수행. "an Orchestrator" 변경은 문서 6곳, fixture 5개 위치(40, 89×2, 152, 208), Python 5곳을 같은 커밋에서 함께 바꿉니다.
- [ ] **Step 2:** H2 래퍼 삽입 후 `test_claude_payload.py:662-663`(`### execution-target request gate`)과 `test_arc_policy.py:614-617`이 통과하는지 확인. 실패하면 래퍼 삽입만 되돌리고 보고(Hold).
- [ ] **Step 3:** coordination.md 새 H1을 가리키는 링크·앵커가 없는지 Grep으로 확인.
- [ ] **Step 4:** MANIFEST 갱신, 공통 완료 조건 수행. 커밋 제목: `fix(instructions): 문법과 제목 표기 정리`.

**수용 기준(AC-2):** `\b[Aa] Orchestrator` Grep 0건. 이중 공백 0건(SKILL.md). 두 coordination.md H1이 영어. H1 직후 H3 구조가 H2로 정리됨. commit.md:17 문장이 분리되고 push 승인 문구 중복이 제거됨.

**필수 QA/focused check:** fresh QA가 Grep 3종, 변경된 fixture/Python 항목이 위 목록과 정확히 일치하는지 diff 대조, 공통 완료 조건.

**의미 변경 표시:** commit.md 중복 절 삭제는 관리 규칙이 동일 내용을 보유하므로 의미 변경 없음으로 판단했으나 Orchestrator가 확인.

**Hold 조건:** H2 래퍼가 헤딩 고정 테스트를 깨면 해당 편집만 제외. fixture 236 갱신 외 계약 실패가 생기면 보류.

---

### Task 3: 문장 중간 줄바꿈(hard-wrap 잔재) 정리 (항목 3, 5 일부)

**Files:** 아래 후보 목록의 양 플랫폼 SKILL.md와 references. fixture/Python 변경 없음(공백 정규화). `MANIFEST.sha256`.

**선행:** T2(줄 번호가 이동하므로 **착수 시 탐지를 다시 실행**).

**탐지 기준(전체 재정렬 금지):** `Grep` multiline로 `^[A-Za-z(`\[][^\n|]{0,50}[A-Za-z,)`]\n[a-z(`][^\n]*`를 `claude/skill`과 `codex/skill`의 `SKILL.md`, `references/*.md`에 실행. 이전 줄이 52자 이하이고 문장부호(. : ;)로 끝나지 않으며 다음 줄이 소문자로 시작하면 문장 중간 끊김. 다음은 제외: 표 행(`|`), 헤딩, 목록 항목, 코드블록, 프론트매터(SKILL.md:2-3), 관리 섹션, `Before classifying` 줄.

**확정 수정 지점(650940b 기준, 조각 줄 번호; 해당 줄을 다음 줄과 합치고 인접 두 줄만 다시 감쌉니다):**
- claude: `SKILL.md` 23, 50; `handoff.md` 150; `verification.md` 114, 125, 129, 133, 136; `coordination.md` 44, 56
- codex: `SKILL.md` 22, 29, 51; `git-recovery.md` 11, 17, 20, 24, 53; `verification.md` 13, 24, 69, 73, 82, 87, 111, 130, 132, 153, 154, 156, 161; `visual-companion.md` 11, 15; `handoff-prep.md` 25, 31, 93, 108, 123; `handoff.md` 4, 14, 31, 55, 59, 82, 84, 110, 122, 128, 138, 203, 206, 216, 218, 225, 231; `commit.md` 9, 22, 30, 43; `coordination.md` 42, 62; `handoff-worktree.md` 4, 51, 57, 88; `planning.md` 119, 122, 138, 142, 200, 206, 240, 254
- 긴 줄 분리: `codex/skill/references/handoff-prep.md:73-76`(74행 긴 줄), `codex/skill/references/verification.md:162`
- 연속 빈 줄 2개 이상(`codex verification.md` 약 56-66, `coordination.md` 48-49, 69-70 등)은 한 줄로 축소(선택).

- [ ] **Step 1:** 탐지를 재실행해 위 목록과 대조하고 목록에 없는 신규 후보는 Orchestrator에 보고 후 처리.
- [ ] **Step 2:** 각 지점에서 문구는 그대로 두고 줄바꿈만 수정. 단어·구두점 변경 금지.
- [ ] **Step 3:** 편집 후 같은 탐지를 다시 실행해 52자 이하 조각 후보가 0건(혹은 의도적 예외 목록만)인지 확인. `git diff --word-diff`로 단어 단위 변경이 없는지 확인.
- [ ] **Step 4:** MANIFEST 갱신, 공통 완료 조건. 커밋 제목: `style(instructions): 문장 중간 줄바꿈 정리`.

**수용 기준(AC-3):** 확정 지점의 끊김이 해소. 단어/구두점 변경 없음(`--word-diff` 증거). 표·헤딩·관리 섹션 diff 0.

**필수 QA/focused check:** fresh QA가 탐지 재실행 결과와 word-diff를 확인하고 공통 완료 조건 수행.

**Hold 조건:** 합치면 SKILL.md 표 행이나 `Before classifying` 줄이 변하는 경우 해당 지점 제외. 계약 테스트 새 실패 시 보류.

---

### Task 4: 모호한 용어·게이트 명칭 정리 — 고정 문구 비해당분 (항목 4, D4-1)

**Files:**
- Modify: `claude/skill/references/planning.md:31`, `codex/skill/references/planning.md:33` "meets Bounded conditions" → "meets the Bounded path criteria in Design path and plan depth"
- Modify: `claude/skill/references/planning.md:127` "No-change, hold, and resume follow commit." → "No-change, hold, and resume follow [commit](commit.md)."
- Modify: `codex/skill/references/planning.md:265` "the third-path managed worktree contract" → "the managed worktree contract"; `codex/skill/references/git-recovery.md:61` "after explicit third-path selection" → "after explicit managed-worktree selection"
- Modify: `codex/skill/references/handoff-worktree.md:82` "in legacy or restart/target-change cases" → "in pre-existing-document or restart/target-change cases" (**:70의 "legacy or restart"는 `test_arc_policy.py:1452`가 고정하므로 변경 금지**); `codex/skill/references/handoff-prep.md:104` "protected legacy/restart document transfer" → "protected pre-existing/restart document transfer"
- Modify: `claude/skill/references/visual-companion.md:8` "do not assume managed preview tools exist" → "do not assume the platform provides a preview tool"
- Modify: `claude/skill/references/limits.md:33`, `codex/skill/references/limits.md:33` "use a conservative bound only with sufficient evidence" → "use a conservative upper bound only when the reconstructed records support it"
- Modify (게이트 명칭): `codex/skill/references/handoff-prep.md:5` "The Coder start gate" → "The [Coder handoff gate](handoff.md#coder-handoff-gate)"; planning.md 표의 "common gate" → "Common handoff gate"(claude :208 부근, codex :232-235)
- Modify (용어 정의, 의미 추가 표시): 양 플랫폼 `SKILL.md`의 `## Shared terms` **마지막 bullet 뒤에** bullet 추가: "- **Common handoff gate**: the full verification Orchestrator passes before every Coder first start/restart and Orchestrator direct edit; see [handoff](references/handoff.md#common-handoff-gate)." (fixture Shared terms 계약은 말미 추가에 영향 없음)
- Modify: `MANIFEST.sha256`

**유지(변경하지 않음, 근거):** "Coder handoff gate"는 codex handoff.md:35 상세 조건 목록(### 헤딩, arc_policy 132/302/762와 fixture 61이 고정)이고 "Common handoff gate"는 SKILL.md/handoff.md 요약 절이어서 별개 절입니다. 통일하지 않고 hold로 표시하며, handoff-prep의 존재하지 않는 명칭 "Coder start gate"만 실제 명칭으로 바로잡습니다. "Agent Teams", "installed browser skill"은 고유 명칭으로 유지. "uncommitted documents are not absent"는 `test_claude_payload.py:480`이 고정하므로 유지.

**선행:** T3.

- [ ] **Step 1:** 각 편집 직전 Grep으로 위치와 주변 문장을 확인해 문법이 맞게 다듬습니다.
- [ ] **Step 2:** `test_harness_contract`의 링크/앵커 검사가 새 링크(`commit.md`, `handoff.md#coder-handoff-gate`, `handoff.md#common-handoff-gate`)를 통과하는지 확인.
- [ ] **Step 3:** MANIFEST 갱신, 공통 완료 조건. 커밋 제목: `fix(instructions): 모호한 용어와 게이트 명칭 정리`.

**수용 기준(AC-4):** 위 용어가 Grep 0건(유지 목록 제외). "Coder start gate", 소문자 "common gate" 0건. Shared terms에 Common handoff gate 정의 한 줄. 링크 유효.

**의미 변경 표시:** (a) limits.md "conservative bound" 재서술은 조건을 구체화하므로 의미 확인 필요. (b) Shared terms 정의 bullet 추가는 신규 정의이며 규칙 추가는 아님. Orchestrator가 승인 확인.

**필수 QA/focused check:** fresh QA가 Grep, 링크 대상 확인, 대칭 대조, 공통 완료 조건.

**Hold 조건:** 정의 bullet 추가가 Shared terms 계약이나 `test_claude_payload.py:344-359` 용어 검사를 깨면 보류하고 정의를 다른 위치로 옮기는 안을 Orchestrator에 질문.

---

### Task 5: 고정 문구에 걸린 모호한 표현 명확화 (항목 4 잔여)

**Files:**
- Modify: 양 플랫폼 `SKILL.md:15` "each task that needs QA (risk-scaled, unchanged) gets a FRESH QA" → "each task that needs QA under Risk-scaled execution gets a FRESH QA"; fixture `opening` 14행(codex), 126행(claude) 동일 갱신
- Modify: `codex/skill/references/coordination.md:65`, `claude/skill/references/coordination.md:58-59` "(choice reuse and restart brief rules are there)" → "(choice reuse and restart brief rules are in handoff)"; fixture 26행, 138행; `tests/test_arc_policy.py:813` 정규식을 `(choice reuse and restart brief rules are in handoff)`로 갱신
- Modify: `codex/skill/references/verification.md:62`, `claude/skill/references/verification.md:149` "approved no-doc scope" → "approved scope without saved documents"; fixture 54, 166행
- Modify: `MANIFEST.sha256`

**선행:** T4.

- [ ] **Step 1:** 편집 전 Grep으로 위 문구가 fixture/Python의 위 위치 외에 고정되어 있지 않은지 재확인.
- [ ] **Step 2:** 문서와 기대값을 같은 커밋에서 수정(해당 3개 문구만).
- [ ] **Step 3:** 공통 완료 조건. 커밋 제목: `fix(instructions): 고정 문구의 모호한 표현 명확화`.

**수용 기준(AC-5):** 세 문구가 새 표현으로 바뀌고 fixture/Python diff가 위 항목에 한정. 나머지 계약은 무변경.

**의미 변경 표시:** "(risk-scaled, unchanged)" 괄호의 "unchanged" 제거는 의미 해석 여지가 있어 Orchestrator 확인 필요(QA 필요 여부는 Risk-scaled execution이 결정한다는 읽기로 정렬).

**필수 QA/focused check:** fresh QA가 fixture/Python diff 범위 대조와 공통 완료 조건.

**Hold 조건:** 갱신 범위 밖 계약이 실패하거나 Orchestrator가 의미 변경을 거부하면 해당 문구만 되돌리고 보고.

---

### Task 6: 프로필 stop 문구, 제목, Models 안내, `.gitignore` (항목 5·7)

**Files:**
- Modify: `claude/agents/arc-qa.md:20` "# Qa" → "# QA"; `:49` "command failure" → "tool failure"
- Modify: `claude/agents/arc-coder.md:48` "command failure" → "tool failure"
- Modify: `codex/agents/arc-scouter.toml:22`, `arc-planner.toml:22`, `arc-qa.toml:22`, `arc-reviewer.toml:22` "command failure" → "tool failure" (관리 섹션 밖 확인)
- Modify: `tests/node/fixtures/instruction-contracts.json` `protected`의 위 6개 파일 해시(새 sha256으로 교체)
- Modify: `claude/skill/references/coordination.md` Models 절 끝(현 :137 문단 뒤, 관리 섹션 앞)에 문단 추가: "Claude profile `model` and `effort` frontmatter values are shipped defaults; installation overwrites them with the active `models.toml` preset values." (fixture Models 계약 본문이 :137까지이므로 그 뒤 추가는 고정에 걸리지 않음). Codex 프로필에는 model 필드가 없어 안내 불필요.
- Modify: `.gitignore`에 `__pycache__/` 한 줄 추가
- Modify: `MANIFEST.sha256`

**선행:** T5.

- [ ] **Step 1:** 각 프로필에서 편집 줄이 `[ARC role policy: contract begin]`~`end` 바깥인지 확인(안이면 Hold).
- [ ] **Step 2:** 편집 후 `node -e`로 6개 파일의 sha256을 계산해 fixture `protected` 해당 항목만 갱신.
- [ ] **Step 3:** `claude/skill/models.toml`, `lib/models/profiles.mjs`, frontmatter 값은 변경하지 않음을 `git diff --stat`로 확인(D4-3).
- [ ] **Step 4:** `Grep`으로 `command failure`가 프로필에서 0건인지 확인(codex coder는 해당 문구 없음, 변경 대상 아님).
- [ ] **Step 5:** 공통 완료 조건. 커밋 제목: `chore(instructions): 프로필 stop 문구와 기타 정리`.

**수용 기준(AC-6):** 해당 stop 문장이 있는 프로필 전부(Claude 5, Codex 4)에서 "tool failure"로 통일. `# QA`. Models 안내 한 줄. `.gitignore`에 `__pycache__/`. 관리 섹션 바이트 무변경, frontmatter·models.toml 무변경.

**의미 변경 표시:** "command failure"→"tool failure"는 stop 조건 범위를 미세하게 바꿀 수 있어 표시. 해시 갱신은 변경한 6개 파일만.

**필수 QA/focused check:** fresh QA가 diff가 관리 섹션 밖임을, 해시 갱신이 6개뿐임을, 공통 완료 조건을 확인. 증거: diff, 해시 대조.

**Hold 조건:** 관리 섹션 침범 또는 Python 프로필 테스트 새 실패 시 보류. `tests/__pycache__/` 추적 상태가 이미 있으면 보고.

---

## 최종 검증 (F1, 모든 task 수용 후)

1. T1~T6이 각각 Orchestrator 수용과 focused commit을 마쳤는지 확인(Reviewer는 task 수용 조건이 아님).
2. 전체 변경(계획 문서 커밋..HEAD) 최종 점검: `npm run check:manifest`, `npm run check:role-policy`, Python 3종 195개, `node --test tests/node/instruction-layout.test.mjs tests/node/role-policy.test.mjs` 20개, `npm test` 실패 집합이 기준선 22개의 부분집합.
3. 관리 섹션과 `lib/policy/role-policy.json`이 650940b 대비 무변경인지 `git diff --stat`로 확인.
4. 공유 역할 계약 변경이므로 Significant로 분류합니다. 단일 독립 Reviewer가 전체 변경을 한 번 검토합니다. Reviewer finding은 Coder → Reviewer로 재검토(QA 재배정 없음).

## 후속 항목(이번 범위 제외, 기록만)

- 항목 6 반복 문장 축소(D4-2 보류).
- "No findings may be brief"(coordination.md, fixture 68/180, arc_policy 498 고정): 의미가 모호하나 재서술이 의미를 바꿀 수 있어 사용자 의미 확인 후 별도 처리.
- "global fallback", "complete keyed URL": 고정 문구이고 문맥상 이해 가능해 유지.
- QA·Reviewer 프로필 긴 문장 분할(해시·needle 비용 대비 효과 낮음).
- Codex coder 프로필에 "missing assigned path ... stop" 문장 추가 여부(새 규칙).
- Claude handoff.md의 평문 "Risk-scaled execution" 링크화(fixture·Python 고정).

---

## Self-review

- **Spec coverage:** 항목 1~5, 7은 T1~T6에 대응. 항목 6은 D4-2에 따라 후속으로 기록. 설계 D1~D3 결정은 모두 task에 반영.
- **범위 점검:** 설계 단계에서 "링크로 통일"이라던 Claude handoff.md 평문 참조는 조사 결과 고정 문구(fixture, Python)에 걸려 제외했고, 설계 대비 의도적 축소입니다. 헤딩 승격 대신 H2 래퍼 삽입으로 바꿨습니다(`###` 리터럴 고정 때문). 프로필 긴 문장 분할도 제외.
- **일관성:** 프로필 해시를 한 번만 갱신하려고 `# QA`를 T2가 아닌 T6에 모았습니다. T3 줄 번호는 T2 이후 이동하므로 탐지 재실행을 의무화했습니다.
- **미검증 가정:** 코드 읽기만 했고 어떤 테스트도 실행하지 않았습니다. 따라서 각 task의 고정 판정은 Grep 근거이며, 숨은 의존이 있으면 공통 완료 조건에서 드러납니다.
