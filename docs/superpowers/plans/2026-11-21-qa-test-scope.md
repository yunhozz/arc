# QA·최종 검증 테스트 범위 지침 구현 계획 (F1)

- 상태: plan v2. 사용자 위임에 따라 Orchestrator가 승인했다(2026-11-21).
- 승인 spec: `docs/superpowers/specs/2026-11-21-qa-test-scope-design.md` (sha256 `5480b693af9371aec0846bb9be2d311647523fef96e97e9e499e8bcc6cbf2192`)
- 구현 위치: branch `fix/bridge-fetch-tolerance`, managed worktree `.claude/worktrees/bridge-fetch-tolerance`
- approved base:
  - 코드 기준은 `a4d71c2`다.
  - spec과 plan은 그 위의 문서 커밋 하나에 함께 들어간다. 이 커밋은 문서만 추가하므로 코드는 `a4d71c2`와 같다.
  - 실제 커밋 SHA는 canonical handoff record에 적는다.
- 깊이: Architectural. 공유 역할 계약을 바꾸므로 significant이고, 최종 Reviewer 1회를 둔다.

## 승인 설계 요약
- **D1 task 검증·재검증:** 관련 테스트만 실행한다. 관련 테스트는 세 범주다.
  - (a) 수정한 모듈을 직접 다루는 테스트 파일
  - (b) 수정 때문에 갱신이 필요해진 계약 테스트
  - (c) 해당 check 스크립트

  무엇을 골랐는지와 그 이유를 보고한다.
- **D2 최종 검증:** 모든 task가 끝난 뒤 한 번 한다. 범위는 관련 테스트의 합집합, 모든 계약 테스트, 모든 check 스크립트다.
- **D3 전체 회귀:** 아래 조건 중 하나라도 해당할 때만 최종 검증에서 한 번 실행한다. 해당하는지 판정할 수 없으면 실행한다.
  - (1) 공용 모듈을 바꿨다.
  - (2) base 이후 다른 사람의 변경이 통합됐다.
  - (3) 의존성, lockfile, 런타임, build·test 설정을 바꿨다.
  - (4) 공개 인터페이스를 지웠거나, 이름이나 시그니처를 바꿨다.
- **D4 결과 판정:** 기준선과 테스트 이름 단위로 비교해 새로 생긴 실패만 finding으로 다룬다. 간헐 실패가 의심되면 그 테스트만 단독으로 다시 실행하고, 통과 여부와 재실행 횟수를 적는다.
- **P1–P7:**
  - P1 역할별 책임
  - P2 선택 범위: 세 범주 안에서만 이유를 적어 추가할 수 있다.
  - P3 기준선 기록 조건과 baseline-incomplete 처리
  - P4 단독 재실행: 자동 retry가 아니라 진단이며, 기본 3회다.
  - P5 ARC 규칙이 upstream TDD보다 우선한다.
  - P6 공용 모듈은 사용처 기준으로 판정하고, 애매하면 공용으로 본다.
  - P7 통합 조건은 base 이후만 본다.
- **최종 검증 실행 주체:** Orchestrator가 백그라운드에서 직접 실행한다. QA가 하지 않는다.
- **바꾸지 않는 것:**
  - upstream 문서: `shared/skill/references/test-driven-development.md`, `writing-plans.md`
  - `lib/policy/role-policy.json`
  - `render.mjs`의 `EXPECTED`
  - fragment ID와 개수(26), target별 fragment 개수
  - codex는 의미만 맞춘다(Q8).

### 문구 확정(plan 단계, Orchestrator 확인 완료)
spec 6.1은 ARC 소유 파일에 "project suite"가 없다고 단언한다. 이 단언과 충돌하지 않도록 spec의 제안 문구 두 곳을 같은 의미로 확정한다.
- spec 4.1: "the upstream TDD instruction to run the project suite per task"는 "the upstream TDD per-task project-suite instruction"으로 쓴다.
- spec 4.2 implementer 추가문: "not the project suite per task"는 "never the full test suite per task"로 쓴다.

`handoff-prep.md`에는 brief 필수 항목 목록이 없다. 그래서 Q9 내용은 새 하위 절 `verification-brief-inputs`로 넣는다.

## Global Constraints
- **범위**
  - task별 allowedPaths만 바꾼다.
  - 다음은 바꾸지 않는다: runtime·CLI 코드, `SKILL.md`, `coordination.md`, upstream 사본, `role-policy.json`(lib·shared), `tests/installer-parity.json`.
- **문서 문구**
  - 영어로 쓰고 host 중립을 지키며, 4개 플랫폼에 같은 문구를 넣는다.
  - codex verification.md에는 4행 문단이 없으므로 새 절만 추가한다.
  - `risk-scaled-execution` anchor 위치: codex는 15행, 나머지 플랫폼은 17행이다.
- **fixture 계약 보존**
  - `tests/node/fixtures/instruction-contracts.json`의 `contracts[].text`는 normalize한 뒤 부분 문자열로 비교된다(`instruction-layout.test.mjs:91-92`).
  - 따라서 기존 계약 문단 중간에 문장을 끼우지 않는다. 문단 끝이나 절 사이에만 넣는다.
  - `## Implementer TDD and constraints`의 두 문단은 전체가 계약이다. 마지막 문단 끝에만 덧붙인다.
- **SHA 갱신 규칙**
  - 기준선에서 통과하던 SHA 테스트가 이번 변경 때문에 실패할 때만 기대값을 갱신한다.
  - 기준선에서 이미 실패하던 SHA는 갱신하지 않는다. 예: `plan.test.mjs`의 rendering baseline 8건.
  - `agentProfileBaseline.revision`은 바꾸지 않는다.
- **MANIFEST:** `node scripts/update-manifest.mjs`로 갱신하고 `npm run check:manifest`로 확인한다.
- **커밋:** task마다 Orchestrator가 한 개씩 만든다. 형식은 `type(scope): 한국어 설명`이다.

### Implementer·QA 브리프 환경 규칙
- heredoc, 임시 스크립트 파일, 프로세스 치환은 쓰지 않는다. `node --input-type=module -e "…"` 형태의 한 줄 명령은 쓸 수 있다.
- Git 조회에는 `git --no-optional-locks`를 붙인다. 대상 `.git`을 바꾸는 명령은 쓰지 않는다.
- 실행 형식
  - Python: `PYTHONDONTWRITEBYTECODE=1 python3 -B`
  - node 테스트: 앞에 `PYTHONDONTWRITEBYTECODE=1`을 붙인다.
- `build/native`는 이미 있다. 지우거나 다시 빌드하지 않는다.
- allowedPaths 밖의 파일이 필요해지면 멈추고 보고한다.
- 관련 테스트 선택(P2): 브리프 목록이 최소 범위다. D1의 (a)–(c)에 정확히 해당하는 항목만 이유를 적어 추가할 수 있다.
- 간헐 실패 단독 재실행 상한은 3회다.

## 기준선(P3)
- **revision:** 구현 시작 전, approved base 문서 커밋에서 HEAD 일치와 clean working tree를 확인한 뒤 기록한다.
- **선행 조건:** `build/native`가 있는지 확인한다. node·python3 버전, `PYTHONDONTWRITEBYTECODE=1`, cwd(worktree 루트)를 기록한다.
- **명령:** 각 결과를 테스트 이름 단위로 기록한다.
  1. 전체 node suite: `PYTHONDONTWRITEBYTECODE=1 node --test --test-reporter=spec tests/node/*.test.mjs`
  2. Python 관련 테스트: `PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest -v tests/test_arc_policy.py tests/test_claude_payload.py tests/test_harness_contract.py`
  3. 전체 Python suite: `PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s tests -p 'test_*.py' -v`
  4. check 스크립트: `npm run check:manifest`, `npm run check:role-policy`, `node scripts/check-installer-parity.mjs`, `node scripts/update-runtime-assets.mjs --check`
- **기록 위치:** canonical record `<git-common-dir>/arc/handoff/`. 실패 이름 목록은 `qa-test-scope-baseline-fail.txt`에 둔다.
- **baseline-incomplete:** 테스트 이름 없이 파일 단위로 실패한 파일은 baseline-incomplete로 표시한다.
  - 처리: 선행 조건을 갖춰 다시 기록하거나, 그 파일의 현재 실패를 새 실패 후보로 보고 하나씩 확인한다.
  - 어느 경우든 기준선 실패로 흡수하지 않는다.
  - Python 명령이 실행되지 않으면 그 사실과 실제로 쓴 대체 명령을 기록한다.
- **알려진 기준선 실패:** `tests/node/plan.test.mjs`의 rendering baseline 8건. 이번 기록에서 다시 확인한다.
- 기준선 기록이 끝나기 전에는 dependent task를 시작하지 않는다.

## 전체 회귀 예비 판정(D3, Planner)
- **(1) 공용 모듈 — 해당**
  - `lib/prompts/agent-fragments.json`: 4개 플랫폼 20개 프로필 target의 renderer와 설치 경로가 load하는 생성 원본이다.
  - `*/skill/references/*.md`: 설치 payload에 들어가고, golden·Python·node 계약 테스트가 load한다.
- **(2) 통합 — 해당 예정 없음:** `4a2d95f` merge는 base 이전이라 제외한다(P7). base 이후 merge, rebase, cherry-pick 계획은 없다.
- **(3) 의존성·설정 — 해당 없음:** 새 테스트 파일은 기존 glob에 자동으로 포함되며, 이것은 설정 변경이 아니다.
- **(4) 공개 인터페이스 — 해당 없음:** 새 anchor 추가는 삭제나 이름 변경이 아니다.
- **예비 결론:** (1)에 해당하므로 실행한다. 최종 판정은 Orchestrator가 실제 diff `a4d71c2..HEAD`와 merge 이력을 보고 한다.

## 검토 초점(최종 Reviewer)
- D1–D4, P1–P7이 새 절과 fragment에 의미 손실 없이 들어갔는가. codex만 다른 비대칭이 의도대로인가.
- "diagnosis, not retry", 재실행 상한, "pass in isolation never erases"가 Stop-and-inspect의 "DO NOT automatically retry"와 충돌하지 않는가.
- 최종 검증 실행 주체가 Orchestrator(QA 아님)로 일관되게 적혀 있는가.
- upstream보다 우선한다는 문구가 세 곳에 있고, upstream 사본은 바뀌지 않았는가.
- fixture 계약 문단이 그대로 보존됐는가. SHA 갱신이 규칙을 따랐는가.
- 계약 테스트는 구조만 증명하고 행동 준수는 증명하지 않는다는 한계가 남아 있는가.

---

### T1: verification·참조 문서 ×4와 테스트 범위 계약 테스트

**목표:** 4개 플랫폼 ARC 참조 문서에 test-scope 규칙을 넣고, 충돌하는 문구를 해소하고, 새 계약 테스트로 구조를 고정한다.

**선행:** 기준선 기록 완료.

**allowedPaths**
- `claude|codex|gemini|grok/skill/references/verification.md`
- `claude|codex|gemini|grok/skill/references/handoff.md`
- `claude|codex|gemini|grok/skill/references/planning.md`
- `claude|codex|gemini|grok/skill/references/handoff-prep.md`
- `tests/node/test-scope-contract.test.mjs` (신규)
- `tests/node/fixtures/installed-layout-golden.json`
- `MANIFEST.sha256`
- 조건부: `tests/node/fixtures/instruction-contracts.json`. 관련 테스트가 이 task 때문에 실패할 때만 그 항목을 고치고, 이유를 보고한다.

**단계** (문서 변경 예외 + 구조 계약 RED. 행동 TDD라고 주장하지 않는다.)
- [ ] **T1-0 선행 조사(편집 전):** 아래 파일들이 바뀌는 4개 문서의 절 목록, 문장 수, 부재 문구를 단언하는지 grep으로 확인하고 보고한다. 단언하는 항목이 있으면 관련 테스트 (b)에 이유와 함께 추가한다.
  - `tests/test_harness_contract.py`
  - `tests/test_claude_payload.py`
  - `composite-instructions.test.mjs`
- [ ] **T1-1 계약 테스트 작성:** `tests/node/test-scope-contract.test.mjs`를 만든다. 단언할 내용은 다음과 같다.
  - 4개 `verification.md` 각각에 `<a id="test-scope-and-result-comparison"></a>`와 `## Test scope and result comparison`이 정확히 한 번 있고, `<a id="risk-scaled-execution"></a>`보다 앞에 있다.
  - 절 본문에 다음 문구가 모두 있다.
    - `related to the change`
    - `union of all tasks' related tests`
    - `**Full regression**`
    - `A shared module is`
    - `by test name`
    - `in isolation`
    - `rerun count`
    - `baseline-incomplete`
    - `Orchestrator runs it directly, not through QA`
    - `diagnosis, not an automatic retry`
  - 4개 플랫폼의 `handoff.md`, `planning.md`, `handoff-prep.md`에 `verification.md#test-scope-and-result-comparison` 링크가 있다.
  - 4개 플랫폼 `skill/references/*.md`에 `/project suite/i`가 없다. upstream 사본은 검사 대상이 아니다.
- [ ] **T1-2 RED 관찰:** 새 계약 테스트가 anchor 부재로 실패하는지 확인하고 기록한다.
- [ ] **T1-3 verification.md ×4 수정**
  - claude·gemini·grok 4행: `→ focused success → project suite.`를 `→ focused success → scoped checks under [Test scope and result comparison](#test-scope-and-result-comparison).`로 바꾼다.
  - 4개 파일 모두 `<a id="risk-scaled-execution"></a>` 바로 앞에 아래 절을 넣는다. 앞 문단과 빈 줄 하나를 둔다.

    ```
    <a id="test-scope-and-result-comparison"></a>
    ## Test scope and result comparison

    **Task checks and rechecks** run only tests related to the change: test files that directly exercise a changed module, contract tests that the change requires updating, and the matching check scripts. The brief lists the minimum set; executors MAY add only items in these three categories, each with a reason. Other additions need Orchestrator authorization. Report every selected item and why. This rule takes precedence over the upstream TDD per-task project-suite instruction; upstream text is unchanged. Report every failure observed in any run by name.

    **Final verification** runs once after all tasks are accepted: the union of all tasks' related tests, plus all contract tests and all check scripts. Orchestrator runs it directly, not through QA, as a background process where the host supports one, and continues independent work such as assigning the final Reviewer meanwhile. Orchestrator then performs the result comparison below and records the verdict.

    **Full regression** runs once within final verification only if at least one trigger applies: (1) the change modifies a shared module; (2) changes made by others were integrated after the approved base, by merge, rebase onto a newer base or cherry-pick; (3) the change modifies dependency manifests or lockfiles, language or runtime versions, or build or test configuration; (4) the change removes, renames or changes the signature of a public interface such as an exported function, CLI option or configuration key. A shared module is code, configuration, schema, data or generator input that more than one task, role, component or execution or delivery path imports, loads or renders at run time, including its mirrors and generated outputs; documentation read only by people and modules used by a single component are not shared. Decide from actual consumers; when they cannot be determined, treat the module as shared. Planner records a provisional judgment in the plan; Orchestrator decides from the actual final diff and history. If no trigger applies, omit it and report the reason; if applicability cannot be determined, run it. Change size, risk level alone and out-of-scope failures seen during task checks are not triggers; report such failures as findings.

    **Baseline:** Before dependent work, Orchestrator records a baseline at the approved base revision after the prerequisites the checks require (for example build outputs and environment settings): commands, environment, revision and failures by test name. A file-level load or collection failure without test names marks that file baseline-incomplete; re-record with prerequisites or treat current failures in that file as new candidates. NEVER absorb them as baseline failures.

    **Result comparison:** Compare failures with the baseline by test name; only new failures are findings. Report baseline failures separately. If a failure looks intermittent, rerun only that test in isolation, up to three times unless the brief sets another limit. This is diagnosis, not an automatic retry. Report "passes in isolation: yes/no" and the rerun count. A pass in isolation never erases the original failure; Orchestrator dispositions it. A failure in isolation is a new-failure finding.
    ```
- [ ] **T1-4 handoff.md ×4:** `<a id="implementer-tdd-and-constraints"></a>` 절의 마지막 문단 끝(`…NEVER generalize to behavior.` 바로 뒤)에 같은 줄로, 공백 하나를 두고 다음 문장을 붙인다. 첫 문단에는 넣지 않는다.

  `Test scope follows [verification](verification.md#test-scope-and-result-comparison) and takes precedence over upstream TDD's per-task project-suite instruction.`
- [ ] **T1-5 planning.md ×4:** `<a id="top-level-plan-tasks"></a>` 절의 두 번째 문단 끝(`…omission paths gain no plan obligation.` 바로 뒤)에 같은 줄로 다음 문장을 붙인다. 파일 끝의 Full Auto 절은 건드리지 않는다.

  `Plans list per-task related tests with reasons and a final verification section per [verification](verification.md#test-scope-and-result-comparison).`
- [ ] **T1-6 handoff-prep.md ×4:** `<a id="recovery-prerequisite"></a>` 바로 앞에 다음 하위 절을 넣는다.

  ```
  <a id="verification-brief-inputs"></a>
  ### Verification brief inputs

  Implementer and QA briefs that assign checks MUST include the baseline record reference (revision, commands, environment and failures by test name, with baseline-incomplete files marked), the related-test list with reasons and the intermittent-failure isolated rerun limit under [verification](verification.md#test-scope-and-result-comparison).
  ```
- [ ] **T1-7 GREEN 확인:** 새 계약 테스트가 통과하는지 확인한다.
- [ ] **T1-8 생성물 갱신**
  - `node tests/node/fixtures/installed-layout.mjs --write`를 실행한다. golden diff가 이 task에서 바꾼 참조 문서의 설치 사본 hash로만 한정되는지 확인한다.
  - `node scripts/update-manifest.mjs`를 실행한다.
- [ ] **T1-9 플랫폼 간 대조:** 4개 플랫폼의 문구가 같은지 `git --no-optional-locks diff`로 대조한다.

**AC**
- **T1-AC1:** 4개 verification.md에 새 절이 정확히 한 번, `risk-scaled-execution` 앞에 있다. 절 본문은 4개 파일에서 바이트 단위로 같다.
- **T1-AC2:** claude·gemini·grok의 4행에 "project suite"가 없고, 문장이 새 절로 연결된다. codex에는 4행 계열 문단을 추가하지 않았다.
- **T1-AC3:** 4개 플랫폼의 `handoff.md`, `planning.md`, `handoff-prep.md`에 지정한 문구가 지정한 위치에 있다. fixture 계약 문단은 부분 문자열로 그대로 남아 있다.
- **T1-AC4:** 4개 플랫폼 `skill/references/*.md`에 `/project suite/i`가 없다. upstream 사본 2개는 바뀌지 않았다.
- **T1-AC5:** golden과 MANIFEST가 갱신됐다. 관련 테스트에서 기준선 대비 새 실패가 없다.

**관련 테스트와 선택 이유**
- **(a) 직접 대상**
  - `tests/node/test-scope-contract.test.mjs`: 새 계약 자체다.
  - `tests/node/instruction-language.test.mjs`: 바꾸는 참조 문서를 목록으로 읽는다.
  - `tests/test_arc_policy.py`: codex의 verification·planning·handoff·handoff-prep을 읽고 정규식으로 단언한다.
  - `tests/test_claude_payload.py`: claude verification.md의 절 구성을 단언한다.
- **(b) 갱신이 필요해진 계약**
  - `tests/node/instruction-layout.test.mjs`: fixture 계약 문단과 handoff-prep 절 단언.
  - `tests/node/installed-layout-golden.test.mjs`: 설치 사본 hash.
  - `tests/node/plan-level-records-contract.test.mjs`: 4개 플랫폼 문구가 정확히 한 번 있는지 단언한다.
  - `tests/node/run-mode-contract.test.mjs`: planning.md가 Full Auto 절로 끝나는지 단언한다.
  - `tests/node/composite-instructions.test.mjs`: planning.md와 handoff.md를 읽는다.
  - `tests/node/manifest.test.mjs`
  - 후보: `tests/test_harness_contract.py`. T1-0에서 단언 여부를 확인한다.
- **(c) check 스크립트**
  - `npm run check:manifest`
  - `npm run check:role-policy`: managed 블록이 보존됐는지 확인한다.
  - `node scripts/check-installer-parity.mjs`: Python 테스트가 parity destination이라 포함한다.
- **제외**
  - `agent-fragments.test.mjs`: T2 범위다.
  - 전체 suite: 최종 검증에서만 실행한다.

**QA(fresh):** 위 관련 테스트와 check 스크립트를 실행하고 결과를 기준선과 이름 단위로 비교한다. 4개 플랫폼 문구가 같은지, 위치 규칙을 지켰는지 확인한다.

**보류 조건**
- 기준선 기록이 끝나지 않았다.
- 관련 테스트가 baseline-incomplete다. P3 처리 방법이 정해질 때까지 그 파일에 대한 판정을 보류한다.
- fixture의 `contracts[].text`나 `installer-parity.json`의 expression을 바꿔야만 통과한다. 이때는 멈추고 보고한다.
- golden diff에 이 task 밖 파일의 hash가 섞였다.

---

### T2: fragment·에이전트 템플릿과 hash fixture

**목표:** QA·Implementer·Planner 프로필에 test-scope 규칙을 반영한다. 방법은 기존 fragment 3개의 문구 수정과 implementer 템플릿 3개의 충돌 문구 수정이다. 영향받는 hash fixture도 갱신한다.

**선행:** T1이 수락·커밋돼 있어야 한다.

**allowedPaths**
- `lib/prompts/agent-fragments.json`
- `claude/agents/arc-implementer.md`, `gemini/agents/arc-implementer.md`, `grok/agents/arc-implementer.md`
- `tests/node/fixtures/instruction-contracts.json`: `agentProfileBaseline.profiles` 중 영향받는 항목만 바꾼다.
- `tests/node/test-scope-contract.test.mjs`
- `tests/node/fixtures/installed-layout-golden.json`
- `MANIFEST.sha256`

**단계** (prompt 데이터 변경 예외 + 구조 계약 RED)
- [ ] **T2-0 선행 조사(편집 전):** `tests/` 전체에서 바뀌는 문장 조각을 단언하는 곳이 있는지 grep으로 확인하고 보고한다. 찾을 조각은 다음 넷이다.
  - `smallest relevant`
  - `Run approved checks`
  - `before acceptance and holds`
  - `focused checks/project suite`
- [ ] **T2-1 계약 테스트 단언 추가:** `test-scope-contract.test.mjs`에 다음을 추가한다.
  - `renderAgentProfile`로 렌더한 4개 플랫폼의 `arc-qa`, `arc-implementer`, `arc-planner`(12개)에 다음 문구가 있다.
    - QA: `with related tests only`, `Final verification is run by Orchestrator, not QA`, `by test name`, `passes-in-isolation and rerun count`
    - Implementer: `Run only related tests per installed ARC`, `never the full test suite per task`
    - Planner: `List each task's related tests with reasons`, `provisional full-regression trigger judgment`
  - `lib/prompts/agent-fragments.json`과 4개 플랫폼 `agents/*`(원본 템플릿과 렌더 결과)에 `/project suite/i`가 없다.
- [ ] **T2-2 RED 관찰:** 추가한 단언이 실패하는지 확인하고 기록한다.
- [ ] **T2-3 agent-fragments.json 수정:** fragment의 ID, 개수, 순서는 유지한다.
  - **`qa.verification-steps` 1번**
    - 바꿀 문장: `Independently verify assigned behavior with the smallest relevant existing checks.`
    - 새 문장: `Independently verify assigned behavior with related tests only: test files directly exercising changed modules, contract tests the change requires updating and matching check scripts; report each selection and reason. Final verification is run by Orchestrator, not QA.`
    - 뒤 문장은 그대로 둔다.
  - **`qa.verification-steps` 5번:** 끝(`…unresolved or unverified with evidence.` 뒤)에 다음을 붙인다.

    ` Compare failures with the brief's baseline by test name; only new failures are findings. Rerun a suspected intermittent test alone, up to the brief's limit, as diagnosis rather than retry; report passes-in-isolation and rerun count.`
  - **`implementer.execution-steps` 7번:** `Run approved checks or report the precise blocker.` 뒤에 다음을 붙인다.

    ` Run only related tests per installed ARC \`references/verification.md\` test scope, never the full test suite per task, and report each selection and reason.`
  - **`planner.task-shape`:** `…required QA/focused checks/evidence before acceptance and holds.` 뒤에 다음을 붙인다.

    ` List each task's related tests with reasons. In final verification list the union, all contract tests and check scripts, and a provisional full-regression trigger judgment with reason.`
  - **바꾸지 않는 fragment:** `qa.verification-steps` 2번, `qa.contract-intro`, `common.verification-reference`.
- [ ] **T2-4 템플릿 ×3 수정:** 다음 세 파일의 `focused checks/project suite.`를 `related checks; full regression only in final verification when triggered.`로 바꾼다. marker는 유지한다. codex toml은 바꾸지 않는다.
  - `claude/agents/arc-implementer.md` 29행
  - `gemini/agents/arc-implementer.md` 21행
  - `grok/agents/arc-implementer.md` 21행
- [ ] **T2-5 GREEN 확인**
- [ ] **T2-6 hash fixture 갱신:** 기준선에서 통과하던 항목만 갱신한다.
  - **`agentProfileBaseline.profiles`:** 영향받는 12개 항목을 아래 명령의 출력으로 교체한다. reviewer·scouter 8개는 값이 그대로인지 확인한다. `revision`은 바꾸지 않는다.

    `node --input-type=module -e "import fs from 'node:fs';import {createHash} from 'node:crypto';import {renderAgentProfile} from './lib/prompts/render.mjs';const r=JSON.parse(fs.readFileSync('lib/prompts/agent-fragments.json'));for(const t of r.targets)console.log(t.path,createHash('sha256').update(renderAgentProfile(t.path,fs.readFileSync(t.path),r)).digest('hex'))"`
  - **`protected`:** 바꾸지 않는다. 기준선 `90c3f259`에서 38개 중 21개(`claude/agents/arc-implementer.md` 포함)가 이미 불일치하고, 이를 단언하는 `profile models, permissions, canonical policy and CLI/runtime bytes are preserved`가 기준선 실패 목록에 있다. SHA 갱신 규칙에 따라 기준선 실패로 이름 단위 비교만 한다.
- [ ] **T2-7 생성물 갱신**
  - `installed-layout.mjs --write`를 실행한다. golden diff는 영향받는 설치 프로필로만 한정돼야 한다.
  - `node scripts/update-manifest.mjs`를 실행한다.

**AC**
- **T2-AC1:** fragment 개수 26, target 20, target별 fragment 개수 배열이 그대로다. ID를 추가하거나 바꾸지 않았다.
- **T2-AC2:** 렌더된 QA·Implementer·Planner ×4에 새 문구가 있다. fragment, 템플릿, 렌더 결과 어디에도 `/project suite/i`가 없다.
- **T2-AC3:** `agentProfileBaseline.profiles`는 영향받는 12개만, `protected`는 바뀌지 않았다. `revision`은 그대로다.
- **T2-AC4:** 다음 파일은 바뀌지 않았다: `role-policy.json`(lib·shared), `render.mjs`, `codex/agents/arc-implementer.toml`, upstream 사본.
- **T2-AC5:** 관련 테스트에서 기준선 대비 새 실패가 없다.

**관련 테스트와 선택 이유**
- **(a) 직접 대상**
  - `tests/node/agent-fragments.test.mjs`: fragment 개수와 render hash.
  - `tests/node/test-scope-contract.test.mjs`
  - `tests/node/instruction-language.test.mjs`: 프로필을 읽는다.
  - `tests/test_arc_policy.py`: codex toml 원본과 implementer의 "independently verify" 부재를 단언한다.
- **(b) 갱신이 필요해진 계약**
  - `tests/node/instruction-layout.test.mjs`: protected hash.
  - `tests/node/installed-layout-golden.test.mjs`
  - `tests/node/run-mode-contract.test.mjs`: fragment clause와 marker.
  - `tests/node/profile-render.test.mjs`
  - `tests/node/plan.test.mjs`: 기준선에서 8건이 실패한다. 갱신하지 않고 이름 단위로 비교한다.
  - `tests/node/manifest.test.mjs`
  - 후보: `tests/test_claude_payload.py`. T2-0에서 단언 여부를 확인한다.
- **(c) check 스크립트:** `npm run check:manifest`, `npm run check:role-policy`, `node scripts/check-installer-parity.mjs`

**QA(fresh):** 위 관련 테스트와 check 스크립트를 실행하고 결과를 기준선과 이름 단위로 비교한다. fixture diff가 지정한 hash 항목으로만 한정됐는지, 3개 템플릿의 문구가 같은지 확인한다.

**보류 조건**
- T1이 수락되지 않았다.
- 기준선에서 이미 실패하던 SHA를 통과시키려면 기대값을 바꿔야 한다. 이때는 갱신하지 않고 보고한다.
- fragment 개수나 순서, `render.mjs`, `role-policy.json`을 바꿔야 한다. 이때는 멈춘다.
- golden diff에 영향 범위 밖의 프로필이나 문서가 섞였다.

---

## 최종 검증
모든 task를 수락한 뒤 한 번 한다. task의 선행 조건이 아니다.

- **실행 주체:** Orchestrator가 직접 실행한다. QA에게 배정하지 않는다. 백그라운드 프로세스로 실행하고, 그동안 최종 Reviewer 배정 같은 독립 작업을 진행한다.
- **범위(D2)**
  1. 관련 테스트 합집합
     - node: `test-scope-contract`, `agent-fragments`, `instruction-language`, `instruction-layout`, `installed-layout-golden`, `plan-level-records-contract`, `run-mode-contract`, `composite-instructions`, `profile-render`, `plan`, `manifest`
     - Python: `tests/test_arc_policy.py`, `tests/test_claude_payload.py`, 그리고 T1-0·T2-0에서 추가된 항목
  2. 모든 계약 테스트: `tests/node/`의 계약 테스트 전부
  3. 모든 check 스크립트: `npm run check:manifest`, `npm run check:role-policy`, `node scripts/check-installer-parity.mjs`, `node scripts/update-runtime-assets.mjs --check`
- **전체 회귀(D3)**
  - 예비 판정은 (1)에 해당해 실행이다. Orchestrator가 `a4d71c2..HEAD` diff와 merge 이력을 보고 4개 조건을 최종 판정하고, 그 이유를 기록한다.
  - 실행할 때는 기준선과 같은 명령을 쓴다.
  - 전체 회귀는 node 범위를 포함하므로, 같은 run의 결과를 합집합 판정에 재사용할 수 있다.
- **결과 판정(D4)**
  - 기준선과 테스트 이름 단위로 비교한다. 새로 생긴 실패만 finding이고, 기준선 실패는 따로 보고한다.
  - baseline-incomplete 파일에서 나온 실패는 새 실패 후보로 보고 하나씩 확인한다.
  - 간헐 실패가 의심되면 그 테스트만 단독으로 최대 3회 다시 실행한다.
  - "passes in isolation: yes/no, N/M"을 기록한다. 단독 실행에서 통과해도 원래 실패를 지우지 않는다. 처리는 Orchestrator가 정한다.
  - 새 실패 finding은 해당 task의 Implementer → QA로 처리한다. 이 처리는 최종 Reviewer가 시작하기 전에 끝낸다.
- **최종 Reviewer 1회**
  - 독립 Reviewer가 전체 변경 `a4d71c2..HEAD`를 한 번 검토한다. Reviewer는 테스트를 실행하지 않는다.
  - 위 "검토 초점"과 spec R1–R8에 대조한다.
  - Reviewer finding은 Implementer가 고치고 Reviewer가 재확인한다. 재확인이 끝날 때까지 수정을 커밋하지 않고, 끝나면 follow-up 커밋 하나로 만든다.
- 최종 검증 결과와 Reviewer 판정은 plan-level progress record 규칙을 따른다.

## Revision history
| Version | Approval time | Classification | Affected tasks | Reason |
|---|---|---|---|---|
| v1 | 2026-11-21T10:04:29+0900 | 최초 승인(사용자 위임: "plan 작성하면 나 대신 승인하고 진행해") | T1, T2 | 최초 plan |
| v2 | 2026-11-21T10:46:00+0900 | 사소한 개정(사용자 위임 승인) | T2 | T2-6 `protected` 갱신 삭제: 기준선에서 이미 실패하던 SHA라 v1의 SHA 갱신 규칙과 충돌 |
