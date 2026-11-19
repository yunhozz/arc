# plan-level 진행 기록 커밋 경로 구현 계획

> **에이전트 작업자용:** ARC Orchestrator가 작업 단위로 조율한다. Implementer는 Codex bridge 자식(sandbox workspace-write, allowedPaths 정확한 파일 목록, 명령당 시간 제한 가능)이며 Git 변경 명령을 실행하지 않는다. 수락과 커밋은 Orchestrator가 한다. 진행은 체크박스(`- [ ]`)로 기록한다.

**상태:** 승인 요청 중 (Planner 첫 초안, Orchestrator 검토 반영)

**Goal:** 최종 검증 결과, 최종 Reviewer verdict·finding disposition, 전체 완료 상태("plan-level progress records")의 커밋 경로를 4개 플랫폼 지침, role-policy 규칙 text, 운영 문서에 정의한다. runtime 동작은 바꾸지 않는다.

**Architecture:** 세 단계로 진행한다.
1. 4개 플랫폼의 수동 지침과 계약 테스트를 바꾼다(T1).
2. 정책 소스 text를 바꾸고 생성기로 managed section, runtime 사본, manifest를 다시 만든다(T2).
3. 운영 문서를 갱신하고 잔여 참조를 확인한다(T3).

T1과 T2는 같은 reference 파일(수동 문단과 생성 섹션), `instruction-contracts.json`, `MANIFEST.sha256`을 함께 건드리므로 엄격히 순차로 진행한다.

**Tech Stack:** Node.js >=22 (`node --test`), Python 3 (`unittest`), 저장소 생성 스크립트.

**Spec:** `docs/superpowers/specs/2026-11-19-plan-level-records-design.md` (2026-11-19 사용자 명시 승인, sha256 `5c46bda3d96c0513f259bc20e035d251aae041486fb0bf07f1245211d182f810`). 승인 범위는 D1–D12, §4 문안, §5 AC-1~11이다.
**기준:** master `ea1a3a2`. 대상은 managed worktree `.claude/worktrees/plan-level-records`, branch `feat/plan-level-records`이다.

## Orchestrator 검토 결정 (승인 범위 내 실행 세부)

- **O1 작업 순서:** 설계의 제안 분할(정책 먼저)과 달리 수동 지침(T1) → 정책(T2) 순서로 한다. `tests/test_harness_contract.py`가 생성 섹션까지 포함한 파일 전체를 검사하므로, 정책을 먼저 반영하면 수동 지침용 새 정규식의 RED가 오염될 수 있다(R6). 범위·기준은 바뀌지 않는다.
- **O2 `skill.bytes/lines`:** `instruction-layout.test.mjs:116-117`은 `<` 상한 단언이다. 상한이 유지되면 값을 바꾸지 않고, 깨지면 멈추고 보고한다(spec §6 "갱신"은 필요 시 갱신으로 해석).
- **O3 새 node 테스트 위치:** `tests/node/plan-level-records-contract.test.mjs`(신규, `package.json` test glob이 자동 포함).
- **O4 T3:** 문서 1행 추가이므로 QA 없이 Orchestrator가 직접 확인한다(low risk, precedent `2026-11-16-plan-revision-in-task-commit.md` T4).

## Global Constraints

- **문안:** 영문 지침과 정책 문장은 spec §4.1–4.8 인용문을 바이트 그대로 옮긴다. 4개 플랫폼(`claude`, `codex`, `gemini`, `grok`)에는 같은 문자열을 쓴다. 위치는 행 번호가 아니라 기존 문장 텍스트로 찾는다. codex는 planning.md가 +2행(120/126/187), verification.md가 -2행(51/61)이다.
- **기존 문자열 보존:** 기존 문자열은 지우거나 바꾸지 않고 spec이 지정한 위치에만 덧붙이거나 끼워 넣는다. 다음 기존 단언이 계속 일치해야 한다.
  - `test_harness_contract.py:35-39,52-54,60-62,66-71`
  - `role-policy.test.mjs:88-91`
- **managed section:** `[ARC role policy: contract begin]`~`end`는 손으로 고치지 않는다. 생성 순서: `node scripts/update-role-policy.mjs` → `node scripts/update-runtime-assets.mjs` → `node scripts/update-manifest.mjs`.
- **role-policy 불변 항목:** `operations`, `evidence`, `roles`, `effect`, `authority`, `controls`는 모든 규칙에서 바꾸지 않는다. 바꾸는 것은 규칙 2개의 `text`뿐이다. `external.explicit-user-authority` text도 바꾸지 않는다(D8, AC-6, AC-9).
- **비범위:** runtime/CLI 코드(`lib/runtime/**`, `shared/skill/runtime/*.mjs`), 새 trailer·operation·evidence 키, agent profile(`*/agents/*`), configure-run-mode plan 소급 보충.
- **golden fixture:** `tests/node/fixtures/installed-layout-golden.json`은 수정하지 않는다(spec R2). 기준선부터 실패하므로 같은 테스트 이름으로 계속 실패하면 새 실패 0으로 판정한다.
- **manifest:** `{claude,codex,gemini,grok}/**`·`lib/**`·`shared/**`를 바꾼 작업은 끝에 `node scripts/update-manifest.mjs`를 실행하고 `MANIFEST.sha256`을 같은 커밋에 넣는다. `docs/**`와 `tests/**`는 manifest 대상이 아니다.
- **`docs/superpowers/**`:** 이 spec과 이 plan만 바뀔 수 있다.
- **커밋:** 상위 작업 하나가 focused 커밋 하나다. 그 작업의 진행 기록(이 plan의 checkbox, 결과, 진행 기록 표의 그 작업 행)은 같은 커밋에 넣는다. 메시지는 `type(scope): 한국어 설명`이다(`docs/harness-operation.md:227`).
- **이 plan 실행 중 개정과 기록:** spec/plan 개정은 ea1a3a2 시점 지침(pending revision → 다음 수락 커밋, trailer 포함)을 따른다. plan-level 진행 기록(F 결과, 최종 Reviewer verdict, 완료 상태)은 D11에 따라 이번 작업이 도입하는 새 규칙을 따른다(F 절).
- **planning-document 커밋(handoff-prep `Planning document commit`):** plan 승인 뒤, 첫 작업 전에 Orchestrator가 승인된 spec과 이 plan을 한 번의 focused docs 커밋으로 묶는다. 구현 파일은 넣지 않는다.

## 공통 검사 명령

| 이름 | 명령과 메모 |
|---|---|
| N-ALL | `npm test` (= `node --test tests/node/*.test.mjs`). 호스트에서 Orchestrator만 실행. 실패 집합은 `^not ok` 줄 |
| P-ALL | `python3 -B -m unittest discover -v -s tests -p 'test_*.py'`. 호스트에서 Orchestrator만 실행. 실패 집합은 `... (FAIL\|ERROR)$` 줄 |
| P-HC | `python3 -B -m unittest tests.test_harness_contract -v` |
| P-PLR | `python3 -B -c "import sys; sys.path.insert(0,'tests'); from test_harness_contract import policy_contract_failures, policy_texts; f=[x for x in policy_contract_failures(policy_texts()) if x.startswith('PLAN_LEVEL_')]; print('\n'.join(f)); print('PLAN_LEVEL failures:', len(f))"` (새 계약은 ID 접두어로 따로 판정) |
| G-POL | `node scripts/update-role-policy.mjs --check` |
| G-RT | `node scripts/update-runtime-assets.mjs --check` |
| G-MAN | `node scripts/update-manifest.mjs --check` |
| G-PAR | `node scripts/check-installer-parity.mjs` (F에서는 `--complete`도 실행해 기준선과 비교) |

판정: N-ALL과 P-ALL의 실패 집합이 P0 기준선의 부분집합이어야 한다(새 실패 0). flake가 의심되면 그 파일만 단독으로 다시 실행하고 결과를 함께 기록한다.

## 의존성과 실행 순서

| 작업 | 제목 | 선행 | QA |
|---|---|---|---|
| P0 | planning-document 커밋과 기준선 기록 (Orchestrator) | plan 승인 | — |
| T1 | 4개 플랫폼 수동 지침과 계약 테스트 | P0 | fresh QA |
| T2 | role-policy 규칙 text와 생성물 | T1 커밋 | fresh QA |
| T3 | 운영 문서와 잔여 참조 확인 | T2 커밋 | 없음(Orchestrator 직접 확인) |
| F | 최종 검증과 최종 Reviewer 1회 | T1–T3 수락·커밋, 필수 QA·재검사 완료 | — |

- 작업마다 fresh Implementer를 둔다. 흐름: Implementer → (fresh QA와 필요한 재검사) → Orchestrator 수락 → focused 커밋 하나. Reviewer는 작업별 gate가 아니다.
- allowedPaths 밖 파일이 바뀌어야 하는 경우(목록에 없는 테스트의 새 실패 포함) 그 작업을 보류하고 Orchestrator에 보고한다. 파일 목록 추가는 mechanical plan revision으로 처리한다.

---

### P0: planning-document 커밋과 기준선 기록 (Orchestrator, 구현 커밋 없음)

- [x] handoff-prep `Planning document commit` 절차대로 승인된 spec과 이 plan을 한 번의 docs 커밋으로 묶는다. 메시지 예: `docs: plan-level 진행 기록 설계 spec과 구현 plan 추가`(closing 예외와 헷갈리지 않게 `docs(plan)` scope는 쓰지 않음). 커밋 뒤 SHA, 경로 2개, 내용 해시를 확인한다.
- [x] 같은 환경에서 기준선을 기록한다: HEAD, branch, `git status`, node/python 버전, N-ALL·P-ALL 실패 집합, P-PLR 출력(`PLAN_LEVEL failures: 0`), G-POL·G-RT·G-MAN·G-PAR·`G-PAR --complete` 종료 코드, `installed-layout-golden` 실패 여부(spec R2), `instruction-layout.test.mjs` 단독 결과.
- [x] 원본 출력은 `.git/arc/handoff/closing-commit/baseline/`에 둔다.

---

### T1: 4개 플랫폼 수동 지침과 계약 테스트

**목표:** spec §4.1–4.6을 4개 플랫폼의 SKILL.md와 references 5개에 같은 문자열로 반영하고 계약 테스트로 고정한다.
**선행:** P0

**Files (allowedPaths, 29개):**
- `claude/skill/SKILL.md`, `codex/skill/SKILL.md`, `gemini/skill/SKILL.md`, `grok/skill/SKILL.md`: Shared terms Preservation rule에 §4.6 문장 삽입
- `{claude,codex,gemini,grok}/skill/references/commit.md`: §4.1(step 2 삽입, `:31` 뒤 새 문단, `:33` 끝 D12 문장)
- `{claude,codex,gemini,grok}/skill/references/planning.md`: §4.2(`:118` 첫 문장 뒤, `:124` 덧붙임, Full Auto 표 새 행)
- `{claude,codex,gemini,grok}/skill/references/handoff-prep.md`: §4.3(`:89` 끝, `:90` 삽입)
- `{claude,codex,gemini,grok}/skill/references/verification.md`: §4.4(`:53` 삽입, `:63` 끝)
- `{claude,codex,gemini,grok}/skill/references/handoff.md`: §4.5(`:170` 끝)
- `tests/test_harness_contract.py`: `COMMON_CONTRACTS`에 `PLAN_LEVEL_*` 항목 추가
- `tests/node/plan-level-records-contract.test.mjs` (신규)
- `tests/node/run-mode-contract.test.mjs`: `planningSection` 기대값에 새 행
- `tests/node/fixtures/instruction-contracts.json`: codex/claude의 "Shared terms"와 "Automatic commit after plan-task acceptance" contract `text`만
- `MANIFEST.sha256`
- 범위 밖: managed section 내부, `lib/**`, `shared/**`, `*/agents/*`, 위 목록 밖 references

- [x] **Step 1 (RED 테스트 작성)**
  - `test_harness_contract.py`에 owner별 contract 추가(패턴은 소문자 정규화된 spec 문장):
    - `PLAN_LEVEL_COMMIT` (`references/commit.md`): step 2 삽입, 정의 3요소, 승인 경계, "sole exception … next commit …", no-work 경로(final Reviewer approval without findings 예시, canonical only, plan 무변경, clean, 완료 보고), "alone never trigger the standalone `docs\(plan\)` closing commit"(백틱 포함, 생성 섹션 문장과 구분), D12 문장
    - `PLAN_LEVEL_PLANNING` (`references/planning.md`): §4.2 정의 문장, "sole closing exception\. plan-level progress records alone never trigger it\."
    - `PLAN_LEVEL_PREPARATION` (`references/handoff-prep.md`): §4.3 두 문구
    - `PLAN_LEVEL_EVIDENCE` (`references/verification.md`): §4.4 `:53` 삽입, `:63` 두 문장(순서와 보류 규칙)
    - `PLAN_LEVEL_HANDOFF` (`references/handoff.md`): §4.5 문장
    - `PLAN_LEVEL_SKILL` (owner `SKILL.md`): §4.6 문장
  - 패턴 규칙: `[^.]*`가 `commit.md#…` 링크의 `.`를 가로지르지 않게 링크는 `\.`로 정확히 쓴다. 기존 contract 항목과 정규식은 바꾸지 않는다.
  - `tests/node/plan-level-records-contract.test.mjs`: 4개 플랫폼마다
    - spec §4.1–4.6 각 삽입 문자열(정확한 영문)이 해당 파일에 정확히 1회
    - Full Auto 표 행 `| Non-blocking final Reviewer finding disposition | auto | Recommended disposition within approved scope; scope-expanding fixes → user |`가 planning.md에 정확히 1회, 바로 앞 줄이 `| Spec/plan revision within the original scope | auto | Scope-expanding revisions → user |`
    - `| Push, merge, deploy, publish, external messages | user | — |` 1회
    - 기존 closing 문장 보존: commit.md `Only when no implementation work remains before overall completion MAY Orchestrator create one standalone \`docs(plan): <description>\` closing commit.`, planning.md `No separate docs/fixup commit is allowed outside this sole closing exception.` 각 1회
  - `run-mode-contract.test.mjs`: `planningSection`의 `Spec/plan revision within the original scope` 행 바로 뒤에 새 행 1줄. 다른 행은 바이트 그대로.
- [x] **Step 2 (RED 확인):** `node --test tests/node/plan-level-records-contract.test.mjs tests/node/run-mode-contract.test.mjs` → 새 단언과 `planning.md ends with one approved Full Auto section` 4개 FAIL. `P-PLR` → codex/claude 각 owner의 `PLAN_LEVEL_*` 누락 출력(0보다 큼).
- [x] **Step 3 (지침 편집):** claude 4개 references와 SKILL.md를 spec §4대로 고친 뒤 같은 문자열을 codex, gemini, grok에 적용. managed section은 건드리지 않는다.
- [x] **Step 4 (fixture):** `instruction-contracts.json`의 해당 4개 contract `text`에 같은 삽입 반영. 다른 키는 바꾸지 않는다. `skill.bytes/lines`는 O2.
- [x] **Step 5 (GREEN):** `node --test tests/node/plan-level-records-contract.test.mjs tests/node/run-mode-contract.test.mjs tests/node/instruction-layout.test.mjs tests/node/role-policy.test.mjs` → PASS(P0 기준선 실패 제외). `P-PLR` → `PLAN_LEVEL failures: 0`. `P-HC` → 실패 ID 집합이 P0 집합의 부분집합.
- [x] **Step 6 (생성물 불변과 manifest):** G-POL verified(drift 0). `node scripts/update-manifest.mjs` → G-MAN verified. `git diff --stat`이 allowedPaths 안에만.
- [x] **Step 7 (보고):** Implementer가 변경 파일 목록, RED/GREEN 출력, fixture old→new 보고. Orchestrator는 호스트에서 N-ALL·P-ALL로 새 실패 0 확인 후 진행 기록. 커밋 메시지 예: `docs(skill): plan-level 진행 기록 커밋 경로를 4개 플랫폼 지침에 추가`

**수락 기준:** AC-1, AC-2(문서), AC-3, AC-4, AC-5, AC-6(문서 순서), AC-7, AC-8, AC-10(4개 플랫폼 문장 동일, handoff.md, G-POL·G-MAN), AC-11(T1 RED→GREEN, 새 실패 0)
**필수 검사:** Step 2, 5, 6, Orchestrator N-ALL·P-ALL, fresh QA
**QA 확인:** spec §4.1–4.6과 4개 플랫폼 문장 바이트 대조, managed section 불변, 기존 정규식(`test_harness_contract.py:35-39,52-54,60-62,66-71`) 일치, 한 플랫폼에서 새 문장 하나를 지우면 node 또는 python 단언이 실패하는지(표본 실험, 임시 사본에서), Full Auto push/merge 행 불변
**Holds:** 없음

---

### T2: role-policy 규칙 text와 생성물

**목표:** spec §4.7대로 `git.orchestrator-accept-commit`과 `planning.plan-revision`의 `text`만 바꾸고, 생성 섹션 16개, runtime 사본, protected 해시, manifest를 맞춘다.
**선행:** T1 커밋

**Files (allowedPaths, 21개):**
- `lib/policy/role-policy.json`: 규칙 2개의 `text`만
- 생성물(손 편집 금지): `{claude,codex,gemini,grok}/skill/references/{planning,handoff-prep,verification,commit}.md`의 managed section(16개)
- 생성물: `shared/skill/runtime/role-policy.json`
- `tests/node/role-policy.test.mjs`
- `tests/node/fixtures/instruction-contracts.json`: `protected`의 `lib/policy/role-policy.json`과 `shared/skill/runtime/role-policy.json` 해시 2개만
- `MANIFEST.sha256`
- 변경 예상 없음: `*/skill/SKILL.md`, `*/agents/*`, 다른 references, `shared/skill/runtime/*.mjs`. 생성기가 이들을 바꾸면 중지하고 보고(생성기 영향 확인: 두 규칙 모두 `roles: ["orchestrator"]`, projection은 planning/preparation/verification/commit 4곳 — `lib/policy/placement.mjs:6-10`, `lib/policy/render.mjs:48`).

- [ ] **Step 1 (RED 테스트):** `role-policy.test.mjs`에 `plan-level progress records extend accept-commit and plan-revision text only` 추가:
  - `git.orchestrator-accept-commit` text: 기존 `/Exclude other tasks; pending approved spec\/plan revisions follow planning\.plan-revision/` 유지, spec §4.7 첫 인용문 포함(`includes`)
  - `planning.plan-revision` text: `Plan-level progress records preserving the approved contract also need no new user approval and alone never trigger the standalone docs(plan) closing commit.` 포함, `committed for other tasks after approval, or plan-level progress records carried by that commit` 포함, 기존 88–90행 패턴 유지
  - 두 규칙의 `operations`, `evidence`, `roles`, `effect`, `authority`가 ea1a3a2 값과 deepEqual(현재 파일에서 literal로 옮김)
  - `external.explicit-user-authority` text가 literal과 같음(AC-6): `Push, merge, deploy, publish and external messages require explicit user authorization for the action, scope and target. Local commit authority grants no external authority. Orchestrator performs authorized external actions; specialists return them without execution.`
  - 규칙 ID 목록(수와 순서) 불변
- [ ] **Step 2 (RED 확인):** `node --test tests/node/role-policy.test.mjs` → 새 테스트 FAIL.
- [ ] **Step 3 (소스 편집):** 두 text에 spec §4.7 문장을 지정 위치에 넣는다. JSON escape 유지.
- [ ] **Step 4 (재생성):** `node scripts/update-role-policy.mjs` → `Updated role policy (16 targets)`(수가 다르면 중지·보고). G-POL verified. `node scripts/update-runtime-assets.mjs` 후 G-RT verified(`shared/skill/runtime/role-policy.json` 외 runtime 출력이 바뀌면 hold).
- [ ] **Step 5 (fixture):** `protected`의 두 role-policy 경로 해시를 파일 바이트 sha256 실측값으로(두 파일은 바이트가 같으므로 같은 값).
- [ ] **Step 6 (GREEN):** `node --test tests/node/role-policy.test.mjs tests/node/instruction-layout.test.mjs tests/node/runtime-assets.test.mjs tests/node/agent-fragments.test.mjs tests/node/plan-level-records-contract.test.mjs tests/node/run-mode-contract.test.mjs` → PASS(P0 기준선 실패 제외). `P-PLR` 0.
- [ ] **Step 7 (manifest와 범위):** `node scripts/update-manifest.mjs` → G-MAN verified. G-PAR verified. `git diff --stat`이 allowedPaths 안에만. `git diff -- '*/agents/*' '*/skill/SKILL.md' lib/runtime ':(glob)shared/skill/runtime/*.mjs'` → 빈 출력.
- [ ] **Step 8:** Orchestrator가 호스트에서 N-ALL·P-ALL로 새 실패 0 확인 후 진행 기록. 커밋 메시지 예: `docs(policy): plan-level 진행 기록 예외를 role-policy 규칙 text에 반영`

**수락 기준:** AC-2(role-policy), AC-6(external text 불변), AC-9(operations/evidence 불변, 새 trailer·operation 없음), AC-10(G-POL, G-RT, G-MAN, G-PAR, runtime 코드 diff 0), AC-11(T2 RED→GREEN, 새 실패 0)
**필수 검사:** Step 2, 4, 6, 7, Orchestrator N-ALL·P-ALL, fresh QA
**QA 확인:** 규칙 2개 text와 spec §4.7 바이트 일치, `git diff ea1a3a2 -- lib/policy/role-policy.json`의 바뀐 줄이 두 `"text"` 줄뿐, 생성 diff가 16개 파일 managed section 안에만, SKILL.md·profile 불변, runtime 사본과 소스 바이트 동일, protected 해시 실측 일치
**Holds:** T1 커밋 전 착수 금지

---

### T3: 운영 문서와 잔여 참조 확인

**목표:** spec §4.8 문장을 `docs/harness-operation.md:226` 끝에 덧붙이고 잔여 grep과 범위 diff를 확인한다.
**선행:** T2 커밋

**Files (allowedPaths, 1개):** `docs/harness-operation.md`. 다른 파일에서 문제가 나오면 고치지 않고 보고.

- [ ] **Step 1:** 226행(계획 개정 요약 bullet) 끝에 §4.8 문장을 바이트 그대로 덧붙인다. 227행은 바꾸지 않는다.
- [ ] **Step 2 (잔여 grep, 읽기 전용):** `grep -rliE "plan-level progress records" --exclude-dir=.git --exclude-dir=node_modules . | grep -v '^./docs/superpowers/'` → 기대: 4개 플랫폼 SKILL.md와 references 5개(24개), `lib/policy/role-policy.json`, `shared/skill/runtime/role-policy.json`, `tests/test_harness_contract.py`, `tests/node/plan-level-records-contract.test.mjs`, `tests/node/role-policy.test.mjs`, `tests/node/fixtures/instruction-contracts.json`, `docs/harness-operation.md`(`run-mode-contract.test.mjs`는 행 문구에 따라 제외될 수 있음). 목록 밖 결과는 보고.
- [ ] **Step 3:** `git diff --stat <P0 docs 커밋 SHA>..HEAD -- docs/superpowers` → 이 plan 파일(진행 기록)만 나와야 한다.
- [ ] **Step 4:** `P-HC`와 `python3 -B -m unittest tests.test_harness_contract.DocumentationContractTests -v` → 실패 집합이 기준선의 부분집합, 링크 검사(`test_maintained_local_links_resolve`) 새 실패 없음. 진행 기록. 커밋 메시지 예: `docs(harness): plan-level 진행 기록 경로 요약 추가`

**수락 기준:** spec §4.8 반영, AC-10(잔여 참조), AC-11(문서 테스트 새 실패 0)
**필수 검사:** Step 2–4. QA 없이 Orchestrator 직접 확인(O4).
**Holds:** T2 커밋 전 착수 금지

---

## F. 최종 검증과 최종 Reviewer (모든 작업 수락 뒤)

- [ ] **V1:** 호스트 N-ALL·P-ALL. P0 기준선 대비 새 실패 0, golden은 같은 이름으로 계속 실패(AC-11, R2).
- [ ] **V2:** G-POL, G-RT, G-MAN, G-PAR, `G-PAR --complete`를 기준선과 비교.
- [ ] **V3:** `git diff ea1a3a2..HEAD --stat -- lib/runtime ':(glob)shared/skill/runtime/*.mjs' '*/agents/*'` → 빈 출력(AC-10). `external.explicit-user-authority` text 동일 재확인(AC-6).
- [ ] **V4:** 잔여 grep(T3 Step 2) 재실행.
- [ ] **FR:** 최종 Reviewer 1회. 범위 `ea1a3a2..HEAD` 전체 변경과 spec 전체. 중점: D1–D12와 AC-1~11 대응, 4개 플랫폼 parity, 기존 금지(amend, rewrite, 그 밖의 docs/fixup, 빈 커밋) 보존, pending-revision closing 예외 보존과 plan-level 단독 비발동, 외부 권한 규칙 불변. 지적은 Implementer → Reviewer 재확인을 반복하고 QA는 다시 배정하지 않는다. 수정은 재확인이 끝날 때까지 커밋하지 않고, 수락 뒤 focused follow-up 커밋 하나.
- [ ] **D11 마무리**
  - finding 없이 approve: 커밋 없음. V1–V4 결과, FR verdict, 완료 상태는 canonical record(`.git/arc/handoff/`)에만 남기고 이 plan 문서는 바꾸지 않는다. working tree clean 확인, 완료 보고에 명시한 뒤 push/PR 권한 요청.
  - finding 있음: plan-level 기록(F 결과, 각 FR 라운드 verdict와 disposition)을 그 follow-up 커밋에 함께 싣는다. non-blocking finding 결정을 기다리는 동안 전체 완료 보류.
- **R4 준수:** F와 FR 행은 진행 기록 표에 미리 쓰지 않는다. 다음 커밋을 staging할 때만 쓴다.

## AC 추적표

| AC | 작업 |
|---|---|
| AC-1 | T1 |
| AC-2 | T1(문서), T2(role-policy) |
| AC-3, AC-4, AC-5 | T1 |
| AC-6 | T1(순서 문장), T2(external text 단언), F V3 |
| AC-7, AC-8 | T1 |
| AC-9 | T2(operations/evidence), F FR |
| AC-10 | T1(4개 플랫폼 문장, handoff.md), T2(생성물·parity·runtime diff), T3(잔여), F V2–V4 |
| AC-11 | T1·T2 RED/GREEN, 각 작업 N-ALL·P-ALL, F V1 |

## 위험

- **R1 기존 정규식 깨짐:** 삽입 위치를 spec대로 지키고 T1 Step 5와 QA에서 기존 ID 대조.
- **R2 golden 기준선 실패:** 수정하지 않음. P0에서 직접 확인, 같은 이름의 실패면 새 실패 0.
- **R3 4개 플랫폼 문구 drift:** 새 node 테스트가 4개 플랫폼 정확 문자열을 1회씩 단언, QA 대조.
- **R4 plan 문서 선기록으로 dirty:** F 절 규칙대로 staging 때만 쓴다.
- **R5 fixture 수동 갱신 오류:** 문장은 지침에서 그대로 복사, 해시는 실측, QA 대조.
- **R6 생성 섹션이 새 python 정규식을 만족시켜 RED 오염:** T1(수동) → T2(정책) 순서, 수동 전용 표현(백틱 `docs(plan)` 등) 사용(O1).
- **R7 목록 밖 테스트가 문장이나 해시를 고정:** grep으로 fixture와 golden 외에 없음을 확인. 새 실패가 나면 hold, mechanical revision.
- **R8 bridge 시간 제한:** Implementer는 focused 테스트만, 전체 스위트는 Orchestrator가 호스트에서.

## 진행 기록

| 일시 | 작업 | 상태 | 커밋 | 메모 |
|---|---|---|---|---|
| 2026-11-19 | P0 | 완료 | 0e00371 | spec·plan docs 커밋. 기준선(호스트, worktree @0e00371): node 2097 tests 70 fail·13 skip, python 547 fail+7 error(기존 stale 계약), P-PLR 0, G-POL/G-RT/G-MAN/G-PAR exit 0, `G-PAR --complete` exit 1, `instruction-layout.test.mjs` 단독 exit 1(5 fail). 원본 출력은 canonical record 참조 |
| 2026-11-19 | T1 | 완료 | 이 커밋 | RED: node 28 예상 실패, P-PLR 32 → GREEN: 신규 계약·Run mode 39개 pass, P-PLR 0, G-POL 48 targets·G-MAN 283 files ok. 호스트 N-ALL 2121 tests 70 fail·P-ALL 547 fail+7 error, 실패 이름 집합 P0와 동일(새 실패 0). fresh QA: AC-1~AC-10 입증, 표본 삭제 2건 검출, instruction-layout 5 fail P0 일치 |

## 개정 이력

| Version | Approval time | Classification | Affected tasks | Reason |
|---|---|---|---|---|
