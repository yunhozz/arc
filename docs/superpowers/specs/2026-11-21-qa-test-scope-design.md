# QA·최종 검증 테스트 범위 지침 설계 (F1)

- 상태: 설계 v1. Planner가 초안을 쓰고, Orchestrator가 사용자 결정(2026-11-21)을 반영해 고쳤다. 사용자 승인 전이다.
- 구현 위치: branch `fix/bridge-fetch-tolerance`, managed worktree `.claude/worktrees/bridge-fetch-tolerance`. 사용자 결정 Q1에 따른다.
- 설계 base: `a4d71c2`
- 사용자 결정 근거: 2026-11-21에 사용자가 확정한 지침 4항목(3절 D1–D4)과 질문 Q1–Q10의 답(8절)

## 1. 배경

지금의 ARC 지침에는 task별 검증에서도 프로젝트 전체 suite를 실행하라고 읽히는 문구가 섞여 있다.

- `claude|gemini|grok/skill/references/verification.md` 4행: "… → focused success → project suite."
- `claude|gemini|grok/agents/arc-implementer.md` 템플릿(claude 29행, gemini·grok 21행): "observe failing tests → minimal implementation → focused checks/project suite."
- vendored upstream 문서 `shared/skill/references/test-driven-development.md` 185–193행: "'Other tests' means the project's suite … run the project's test command … even when your task named only one test file."
- QA fragment `qa.verification-steps` 1번은 "smallest relevant existing checks"라고만 한다. 다음 내용이 없다.
  - "관련 테스트"가 무엇인지
  - 선택 이유를 보고하는 것
  - 최종 검증 범위
  - 전체 회귀 조건
  - 결과 판정 방법

그 결과 task마다 전체 회귀를 돌리거나, 반대로 최종 검증 범위가 정해지지 않는 일이 생겼다. 직전 plan(`docs/superpowers/plans/2026-11-20-bridge-fetch-tolerance.md` v3)은 이 지침을 임시로 적용했다. 그 과정에서 `build/native` 없이 기준선을 기록하면 해당 테스트 파일이 파일 단위 실패로만 남아, 테스트 이름 단위 비교가 깨지는 문제를 확인했다.

플랫폼별 현황은 대칭이 아니다.
- codex `verification.md`에는 "Behavior work follows …" 문단이 없다.
- codex `arc-implementer.toml`에는 "project suite" 문구가 없다.

## 2. 목표와 비목표

### 목표
- G1. 사용자 지침 D1–D4를 의미 손실 없이 4개 플랫폼 ARC 지침에 같은 의미로 반영한다. 문구는 host 중립 영어로 쓰며, 특정 저장소에 의존하지 않는 범용 표현으로 쓴다.
- G2. 기존 "task마다 project suite" 문구가 새 규칙과 충돌하지 않게 고친다. upstream TDD 문구보다 ARC 규칙이 우선한다고 명시한다.
- G3. 역할별 책임(Planner/Orchestrator/Implementer/QA)과 기준선 기록 조건을 정한다.
- G4. 생성물, fixture, 검사 경로를 정하고, 이 변경 자체도 새 규칙으로 검증한다.

### 비목표
- vendored upstream 문서(`shared/skill/references/test-driven-development.md`, `writing-plans.md`)는 고치지 않는다. 이 두 문서는 `tests/node/superpowers.test.mjs`가 매핑하는 upstream 사본이다.
- 기존 원칙은 바꾸지 않는다: QA는 편집하지 않는다, 범위를 임의로 넓히지 않는다, 기준선 실패는 따로 보고한다, 최종 Reviewer는 1회이며 task 게이트가 아니다.
- runtime·CLI 동작은 바꾸지 않는다. 지침 문서와 prompt 데이터만 바꾼다.
- 새 fragment ID를 추가하지 않는다. `render.mjs`의 `EXPECTED`와 `role-policy.json`도 바꾸지 않는다(Q2·Q3).

## 3. 결정 사항

### 사용자 확정(D1–D4)
- **D1. task별 검증과 재검증**
  - 관련 테스트만 실행한다. 관련 테스트는 다음 세 가지다.
    - (a) 수정한 모듈을 직접 다루는 테스트 파일
    - (b) 수정 때문에 갱신이 필요해진 계약 테스트
    - (c) 해당 check 스크립트
  - 무엇을 골랐는지와 그 이유를 보고한다.
- **D2. 최종 검증**은 모든 task가 끝난 뒤 한 번 한다. 다음을 실행한다.
  - 모든 task 관련 테스트의 합집합
  - 모든 계약 테스트
  - 모든 check 스크립트
- **D3. 전체 회귀**는 다음 중 하나라도 해당할 때만 최종 검증에서 한 번 실행한다(2026-11-21 사용자 승인으로 조건 확장).
  - (1) 공용 모듈을 바꿨다(P6).
  - (2) 이번 변경 범위에 다른 사람의 변경이 통합됐다. merge, rebase, cherry-pick이 해당한다(P7).
  - (3) 의존성 목록, lockfile, 언어·런타임 버전, build·test 설정을 바꿨다.
  - (4) 공개 인터페이스를 삭제하거나, 이름을 바꾸거나, 시그니처를 바꿨다. export된 함수, CLI 옵션, 설정 키 등이 해당한다.
  - 하나도 해당하지 않으면 생략하고, 생략 사유를 보고한다. 해당 여부를 판정할 수 없으면 실행한다.
  - 변경 규모(파일 수), 위험도 자체, task 검증 중 범위 밖 실패를 발견한 것은 조건이 아니다. 범위 밖 실패는 D4에 따라 finding으로 처리한다.
- **D4. 결과 판정**
  - 기준선 실패 목록과 테스트 이름 단위로 비교해, 새로 생긴 실패만 finding으로 다룬다.
  - 간헐 실패가 의심되면 그 테스트만 단독으로 다시 실행한다.
  - 결론에 "단독 실행 시 통과" 여부와 재실행 횟수를 적는다.

### 설계 결정
- **P1. 역할 책임**
  - Planner
    - plan의 각 task에 관련 테스트와 선택 이유를 적는다.
    - 최종 검증 절에 합집합, 전체 계약 테스트, check 스크립트를 적는다.
    - 전체 회귀 조건을 예비 판정한다.
  - Orchestrator
    - task brief의 관련 테스트 목록을 확정한다.
    - 기준선 기록을 지시하고 canonical record에 보관한다.
    - 최종 검증 시점에 실제 diff(base..HEAD)와 merge 이력을 보고 전체 회귀 조건을 최종 판정한다.
    - 최종 검증을 직접 실행한다. QA에게 배정하지 않는다. host가 지원하면 백그라운드 프로세스로 실행하고, 그동안 독립적인 다른 작업(예: 최종 Reviewer 배정)을 진행한다. 결과를 받은 뒤 이름 단위 비교와 간헐 실패 단독 재실행을 직접 하고 판정한다(사용자 결정 2026-11-21).
    - 간헐 실패를 어떻게 처리할지 결정한다.
  - Implementer
    - 배정된 관련 테스트만 실행한다. task마다 전체 suite를 돌리지 않는다.
    - 무엇을 골랐는지와 이유를 보고한다.
  - QA
    - task 검증과 재검증을 실행한다. 최종 검증은 맡지 않는다.
    - 이름 단위로 비교하고, 간헐 실패가 의심되는 테스트는 단독으로 다시 실행한다.
    - 선택한 테스트와 이유, 생략 사유, 판정을 보고한다.
    - 편집하지 않는다.
  - Reviewer: 변경 없다. 최종 1회만 검토하며 테스트는 실행하지 않는다.
- **P2. 관련 테스트 선택 범위(Q4)**
  - brief의 목록이 최소 범위다.
  - Implementer와 QA는 D1 (a)–(c)에 정확히 해당하는 항목만, 이유를 적어 추가할 수 있다.
  - 그 밖의 추가는 Orchestrator 승인이 필요하다.
- **P3. 기준선 기록 조건(Q5)**
  - 기준선은 승인된 base revision에서, 검사가 요구하는 선행 산출물(build 결과물 등)과 환경 조건을 갖춘 뒤 기록한다.
  - 기록 항목: 명령, 환경, revision, 테스트 이름 단위 실패 목록.
  - 파일 단위 load·collect 실패처럼 테스트 이름이 없는 항목은 그 파일을 baseline-incomplete로 표시한다. 처리는 둘 중 하나다.
    - 선행 조건을 갖춰 다시 기록한다.
    - 그 파일의 현재 실패를 새 실패 후보로 보고 하나씩 확인한다.
  - 어느 경우든 baseline-incomplete 파일의 실패를 기준선 실패로 흡수하지 않는다.
- **P4. 간헐 실패 재실행(Q6)**
  - 단독 재실행은 자동 retry가 아니라 진단 단계다.
  - 기본 상한은 3회이며, brief에서 바꿀 수 있다.
  - 단독 실행에서 통과해도 원래 실패를 지우지 않는다. "passes in isolation: yes, N/M"으로 보고하고 Orchestrator가 처리를 결정한다.
  - 단독 실행에서도 실패하면 새 실패 finding이다.
- **P5. upstream TDD와의 우선순위**
  - ARC의 test-scope 규칙이 upstream TDD의 "task마다 project suite" 지시보다 우선한다.
  - 어느 run에서든 관찰한 실패는 원인과 무관하게 테스트 이름으로 보고한다.
  - 선례: `planner.exploration-density` fragment의 "This ARC adaptation takes precedence over … upstream text is unchanged."
- **P6. 공용 모듈의 정의(Q7, 사용자 지시에 따라 범용으로 정의)**
  - ARC는 임의의 저장소에서 쓰인다. 그래서 공용 여부는 파일 종류가 아니라 소비 범위로 판정한다.
  - 공용 모듈: 실행 중에 둘 이상의 task, 역할, 구성 요소, 또는 실행·배포 경로가 import, load, render하는 코드, 설정, schema, 데이터, 생성 원본.
    - 예: 공용 라이브러리·runtime, build·test 설정, 공유 test fixture·helper, 생성기(renderer, codegen)에 들어가는 원본 데이터, 그리고 그 mirror나 생성물.
  - 공용 모듈이 아닌 것:
    - 사람만 읽고, 코드나 테스트가 load하지 않는 문서
    - 한 구성 요소만 쓰는 모듈
  - 판정 방법: 사용처(import, load 경로, 생성 파이프라인)를 확인해 판정한다. 확인할 수 없거나 판정이 애매하면 공용으로 보고 전체 회귀를 실행한다.
- **P7. 통합 조건의 범위**
  - 이번 변경의 approved base 이후 작업 중에 들어온 다른 사람의 변경만 해당한다. 다음 세 가지다.
    - base..HEAD 범위의 다른 branch merge
    - 작업 중 새 base 위로 rebase
    - 다른 branch 커밋의 cherry-pick
  - base 이전에 이미 있던 이력은 해당하지 않는다.

## 4. 파일·문구 매핑표

"제안 문구"는 영어 초안이다. 구현 plan에서 최종 확정한다.

### 4.1 `verification.md` (claude, codex, gemini, grok 4개)

| 위치 | 변경 | 반영 항목 |
|---|---|---|
| claude/gemini/grok 4행 | "→ focused success → project suite."를 "→ focused success → scoped checks under [Test scope and result comparison](#test-scope-and-result-comparison)."로 바꾼다 | D1·D3 충돌 해소 |
| codex | 해당 문단이 없다. 새 절만 추가한다(Q8) | 대칭 |
| 4개 파일, `## Risk-scaled execution` 절 앞 | 새 절 `<a id="test-scope-and-result-comparison"></a>` `## Test scope and result comparison`을 추가한다 | D1–D4, P1–P7 |

새 절 제안 문구:

> **Task checks and rechecks** run only tests related to the change: test files that directly exercise a changed module, contract tests that the change requires updating, and the matching check scripts. The brief lists the minimum set; executors MAY add only items in these three categories, each with a reason. Other additions need Orchestrator authorization. Report every selected item and why. This rule takes precedence over the upstream TDD instruction to run the project suite per task; upstream text is unchanged. Report every failure observed in any run by name.
>
> **Final verification** runs once after all tasks are accepted: the union of all tasks' related tests, plus all contract tests and all check scripts. Orchestrator runs it directly, not through QA, as a background process where the host supports one, and continues independent work such as assigning the final Reviewer meanwhile. Orchestrator then performs the result comparison below and records the verdict.
>
> **Full regression** runs once within final verification only if at least one trigger applies: (1) the change modifies a shared module; (2) changes made by others were integrated after the approved base, by merge, rebase onto a newer base or cherry-pick; (3) the change modifies dependency manifests or lockfiles, language or runtime versions, or build or test configuration; (4) the change removes, renames or changes the signature of a public interface such as an exported function, CLI option or configuration key. A shared module is code, configuration, schema, data or generator input that more than one task, role, component or execution or delivery path imports, loads or renders at run time, including its mirrors and generated outputs; documentation read only by people and modules used by a single component are not shared. Decide from actual consumers; when they cannot be determined, treat the module as shared. Planner records a provisional judgment in the plan; Orchestrator decides from the actual final diff and history. If no trigger applies, omit it and report the reason; if applicability cannot be determined, run it. Change size, risk level alone and out-of-scope failures seen during task checks are not triggers; report such failures as findings.
>
> **Baseline:** Before dependent work, Orchestrator records a baseline at the approved base revision after the prerequisites the checks require (for example build outputs and environment settings): commands, environment, revision and failures by test name. A file-level load or collection failure without test names marks that file baseline-incomplete; re-record with prerequisites or treat current failures in that file as new candidates. NEVER absorb them as baseline failures.
>
> **Result comparison:** Compare failures with the baseline by test name; only new failures are findings. Report baseline failures separately. If a failure looks intermittent, rerun only that test in isolation, up to three times unless the brief sets another limit. This is diagnosis, not an automatic retry. Report "passes in isolation: yes/no" and the rerun count. A pass in isolation never erases the original failure; Orchestrator dispositions it. A failure in isolation is a new-failure finding.

### 4.2 `lib/prompts/agent-fragments.json`
기존 fragment 3개의 문구만 고친다(Q2). render 결과는 4개 플랫폼에 같은 의미로 반영된다.

| fragment | 변경 | render 대상 |
|---|---|---|
| `qa.verification-steps` 1번 | "with the smallest relevant existing checks"를 "with related tests only: test files directly exercising changed modules, contract tests the change requires updating and matching check scripts; report each selection and reason. Final verification is run by Orchestrator, not QA."로 바꾼다 | arc-qa ×4 |
| `qa.verification-steps` 5번 끝 | "Compare failures with the brief's baseline by test name; only new failures are findings. Rerun a suspected intermittent test alone, up to the brief's limit, as diagnosis rather than retry; report passes-in-isolation and rerun count."를 추가한다 | arc-qa ×4 |
| `qa.verification-steps` 2번 | 유지한다. P2 정의 안의 추가는 범위 확대가 아니라는 점을 1번 문구로 분명히 한다 | — |
| `implementer.execution-steps` 7번 | "Run approved checks or report the precise blocker." 뒤에 "Run only related tests per installed ARC `references/verification.md` test scope, not the project suite per task, and report each selection and reason."를 추가한다 | arc-implementer ×4 |
| `planner.task-shape` | "required QA/focused checks/evidence" 뒤에 "List each task's related tests with reasons. In final verification list the union, all contract tests and check scripts, and a provisional full-regression trigger judgment with reason."를 추가한다 | arc-planner ×4 |
| `qa.contract-intro`, `common.verification-reference` | 바꾸지 않는다. QA는 brief가 인용한 절만 읽으므로 Orchestrator brief가 새 절을 인용한다 | — |

### 4.3 에이전트 템플릿(fragment 밖의 문구)

| 파일 | 변경 |
|---|---|
| `claude/agents/arc-implementer.md` 29행, `gemini/agents/arc-implementer.md` 21행, `grok/agents/arc-implementer.md` 21행 | "focused checks/project suite"를 "related checks; full regression only in final verification when triggered"로 바꾼다 |
| `codex/agents/arc-implementer.toml` | 해당 문구가 없다. fragment 변경만으로 같은 의미가 반영된다(Q8) |

### 4.4 그 밖의 ARC 참조 문서(4개 플랫폼 각각)

| 파일 | 변경 |
|---|---|
| `*/skill/references/handoff.md`의 `#implementer-tdd-and-constraints` 문단 끝 | "Test scope follows [verification](verification.md#test-scope-and-result-comparison) and takes precedence over upstream TDD's per-task project-suite instruction."를 추가한다 |
| `*/skill/references/planning.md`의 verification 설계 문단 | "Plans list per-task related tests with reasons and a final verification section per [verification](verification.md#test-scope-and-result-comparison)."를 추가한다. 위치는 구현 plan에서 정한다 |
| `*/skill/references/handoff-prep.md` | brief 필수 항목에 baseline record reference, related-test list, intermittent rerun limit를 추가한다(Q9) |
| upstream `test-driven-development.md`, `writing-plans.md` | 바꾸지 않는다 |
| `lib/policy/role-policy.json` | 바꾸지 않는다(Q3). 현재 문구와 충돌하지 않는다 |

### 4.5 충돌 문구와 처리

| 문구(위치) | 충돌 | 처리 |
|---|---|---|
| "focused success → project suite"(verification.md ×3) | task마다 suite를 돌리라고 읽힌다 | 4.1처럼 바꾼다 |
| "focused checks/project suite"(implementer 템플릿 ×3) | 같은 문제 | 4.3처럼 바꾼다 |
| upstream TDD 185–193행 | D1과 정면으로 충돌한다 | 고치지 않는다. 4.1·4.4의 우선순위 문구로 해소한다 |
| upstream `writing-plans.md`의 task별 실행 관행 | 범위가 정해져 있지 않다 | 고치지 않는다. `planner.task-shape`와 `planning.md`로 범위를 정한다 |
| `qa.verification-steps`의 "smallest relevant existing checks" | 정의와 보고 의무가 없다 | 4.2처럼 바꾼다 |
| Stop-and-inspect의 "DO NOT automatically retry" | 단독 재실행과 혼동될 수 있다 | "diagnosis, not retry"와 상한을 명시한다 |
| verification.md 63행, `scope.non-escalation`의 기준선 분류 | 충돌하지 않는다 | 유지한다. 새 절이 구체화한다 |

## 5. 생성물·검사 경로

| 원본 변경 | 영향받는 생성물·fixture | 갱신 방법 | 검사 |
|---|---|---|---|
| `lib/prompts/agent-fragments.json` | `tests/node/fixtures/instruction-contracts.json`의 `agentProfileBaseline.profiles` 중 qa·implementer·planner ×4. 템플릿 파일은 marker를 유지한다 | render 출력의 sha256으로 갱신한다. 갱신 스크립트가 있는지와 `revision` 규칙은 구현 plan 조사 단계에서 확인한다 | `tests/node/agent-fragments.test.mjs` |
| implementer 템플릿 ×3 | `instruction-contracts.json`의 `protected` hash, `agentProfileBaseline` | 위와 같다 | `instruction-layout.test.mjs`, `agent-fragments.test.mjs` |
| `*/skill/references/*.md` | `tests/node/fixtures/installed-layout-golden.json` | `node tests/node/fixtures/installed-layout.mjs --write`(`build/native` 필요) | `installed-layout-golden.test.mjs` |
| 위 전부 | MANIFEST | `node scripts/update-manifest.mjs` | `npm run check:manifest`, `manifest.test.mjs` |
| 플랫폼 간 참조 | `tests/installer-parity.json` | 필요한지 확인한다 | `node scripts/check-installer-parity.mjs` |

## 6. 검증 방법

### 6.1 계약 테스트 추가(Q10)
새 파일 `tests/node/test-scope-contract.test.mjs`에서 다음을 단언한다.
- 4개 플랫폼의 `verification.md`에 anchor `test-scope-and-result-comparison`과 핵심 문구가 있다. 핵심 문구: related, union, Full regression, shared module 정의, by test name, in isolation, rerun count, baseline-incomplete.
- ARC 소유 파일(4개 플랫폼의 `agents/*`, `skill/references/*`, fragment 원본)에 "project suite"가 남아 있지 않다. upstream 사본은 제외한다.
- render된 QA·Implementer·Planner 프로필 ×4에 새 fragment 문구가 있다.

이 단언은 구조와 문구가 있다는 것만 증명한다. 실제 역할의 행동 준수는 증명하지 않는다.

### 6.2 이 변경 자체의 테스트 범위(새 지침 적용)
- **task별 관련 테스트(D1).** 최종 목록은 구현 plan에서 이유와 함께 확정한다.
  - 직접 대상·계약: `agent-fragments.test.mjs`, `instruction-layout.test.mjs`, `installed-layout-golden.test.mjs`, `manifest.test.mjs`, 새 `test-scope-contract.test.mjs`
  - 바뀐 문구를 참조할 가능성이 있는 후보(실제로 단언하는지 확인 필요): `instruction-language.test.mjs`, `run-mode-contract.test.mjs`, `plan-level-records-contract.test.mjs`, Python `tests/test_arc_policy.py`, `tests/test_claude_payload.py`, `tests/test_harness_contract.py`
  - check 스크립트: `check:manifest`, installer parity
- **최종 검증(D2).** Orchestrator가 백그라운드로 직접 실행한다. 위 합집합, `tests/node/`의 모든 계약 테스트, 모든 check 스크립트를 실행한다. check 스크립트는 `check:manifest`, `check:role-policy`, installer parity, runtime-assets `--check`다.
- **전체 회귀(D3).** 실행한다.
  - 판정 근거: P6 정의상 `agent-fragments.json`은 4개 플랫폼의 renderer와 설치 경로가 load하는 생성 원본이므로 공용 모듈이다.
  - 조건 (2)–(4)는 해당하지 않을 예정이다. base `a4d71c2` 이후 통합 예정이 없고, 의존성·설정·공개 인터페이스를 바꾸지 않는다.
  - 조건 (1)만으로도 실행 대상이다.
  - 최종 판정은 최종 검증 시점에 Orchestrator가 한다.
- **기준선(P3).** 구현 시작 전에 base `a4d71c2`에서 `build/native`를 갖춘 뒤 기록한다. 대상은 관련 테스트, check 스크립트, 전체 suite의 이름 단위 결과다.

### 6.3 Reviewer
공유 역할 계약을 바꾸는 작업이므로 significant다. 모든 task를 수락한 뒤 최종 whole-change Reviewer를 1회 둔다.

## 7. 위험
- **R1. upstream TDD 문구가 남는다.** 우선순위 문구를 못 본 역할이 계속 suite를 실행할 수 있다.
  - 완화: 우선순위를 fragment, 템플릿, `handoff.md` 세 곳에 명시한다. 6.1에서 단언한다.
- **R2. hash fixture 갱신이 빠질 수 있다.**
  - 완화: 5절 표를 따르고, 관련 테스트로 검출한다.
- **R3. 공용 모듈 판정이 모호할 수 있다.**
  - 완화: P6처럼 사용처로 판정하고, 애매하면 공용으로 본다. 최종 판정은 Orchestrator가 한다.
- **R4. 단독 재실행이 "통과하면 무시"로 오용될 수 있다.**
  - 완화: 원래 실패를 유지하고 Orchestrator가 처리를 결정한다.
- **R5. 기준선이 파일 단위 실패로만 남는다.**
  - 완화: P3의 baseline-incomplete 처리.
- **R6. codex가 기존부터 비대칭이다.**
  - 완화: 새 절과 fragment로 의미를 맞춘다.
- **R7. 프로필 크기가 커진다.** 영향은 작다.
- **R8. 실제 준수는 강제되지 않는다.** 이 변경은 prompt 수준의 계약이라 실제 역할 행동을 강제하지 않는다.

## 8. 열린 질문의 결정(2026-11-21 사용자)

| # | 결정 |
|---|---|
| Q1 | 현재 branch `fix/bridge-fetch-tolerance`에서 이어서 구현 |
| Q2 | 기존 fragment 3개의 문구만 수정 |
| Q3 | `role-policy.json`에는 반영하지 않음 |
| Q4 | D1의 세 범주 안에서만, 이유를 적어 추가 가능 |
| Q5 | 기준선 불완전 시 다시 기록하거나, 해당 파일의 현재 실패를 새 실패 후보로 하나씩 확인 |
| Q6 | 단독 재실행 상한은 기본 3회, brief에서 변경 가능 |
| Q7 | 저장소에 한정하지 말고 범용으로 정의(사용자 지시). P6처럼 사용처 기준으로 판정하며, 판정할 수 없으면 공용으로 봄 |
| Q8 | codex는 새 절과 fragment로 의미만 맞춤 |
| Q9 | `handoff-prep.md`에 필수 항목 추가 |
| Q10 | 새 `tests/node/test-scope-contract.test.mjs` |
| 추가 | 최종 검증은 QA가 아니라 Orchestrator가 백그라운드로 직접 실행(사용자 지시 2026-11-21) |
| 추가 | 전체 회귀 조건을 4가지로 확장(통합 일반화, 의존성·환경, 공개 인터페이스), 판정 불가 시 실행(사용자 승인 2026-11-21) |
