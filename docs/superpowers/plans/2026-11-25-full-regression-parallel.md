# 전체 회귀 병렬 실행 규칙 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

- 상태: plan v1 (사용자 승인: 2026-11-25T16:44:53+09:00에 "plan 나오면 승인하고 진행해"로 사전 승인). T1 수락(2026-11-25): 관련 테스트의 Node 1건·Python 493건 실패는 base와 이름이 같아 baseline. AC8은 최종 검증 범위
- Spec: `docs/superpowers/specs/2026-11-25-full-regression-parallel-design.md` (2026-11-25T16:43:45+09:00 이전 사용자 승인, Q1–Q7 모두 (A), sha256 `a928122456dc448e25ea2d3a06fabc09d4f3166d8135b70ca71db0bd12bfb64c`). 사용자 지시(2026-11-25)에 따라 spec과 plan은 T1 구현 전에 별도 docs 커밋으로 먼저 커밋합니다.
- 실행 대상: `/Users/ma-24-007/Desktop/workspace/arc`, 브랜치 `chore/final-tester-before-reviewer`, approved base `4d80d208`
- 경로: Architectural, task 1개. 분리하지 않는 이유: 문서, fragment, 계약 테스트, 해시 fixture는 서로 떼면 테스트가 깨집니다(spec §10).

## 개정 이력

| 버전 | 일자 | 분류 | 사유 | 영향 task | 승인 |
|---|---|---|---|---|---|
| v1 | 2026-11-25 | 최초 | spec §5.1–5.4 구현 계획 | T1 | 사용자 사전 승인 |

**Goal:** Tester는 여러 파일 suite 명령을 runner 내장 병렬 모드로 실행합니다(G1). 승인된 전체 회귀는 겹치지 않는 shard로 나눌 수 있습니다(G2). 기존 follow-up 규칙과 single-mode 규칙은 shard와 충돌하지 않게 맞춥니다(G3).

**Architecture:**
- 4개 플랫폼 `verification.md`의 test-scope 절에 다음을 반영합니다.
  - §5.1 문장 하나를 교체합니다.
  - §5.2와 §5.3 문단 두 개를 삽입합니다.
- `tester.verification-steps` fragment의 step 1 끝에 §5.4를 추가합니다.
- 에이전트 템플릿은 바뀌지 않습니다. 렌더링 결과만 바뀝니다.

**Tech Stack:** Node.js ESM(`node --test`), Python 3 `unittest`, JSON, Markdown

## Global Constraints

- spec §5.1–§5.4 문장은 한 글자도 바꾸지 않고 씁니다. 4개 플랫폼에 같은 바이트를 넣습니다. §5.4는 맨 앞 공백까지 포함합니다.
- spec §5.5에 적은 문장과 파일은 바꾸지 않습니다.
  - 문장: `singleModeRule`, `finalScopeSentence`, `finalReviewerStartSentence`, E1 `commandExecutionRule`, E2 `commandExecutionParagraph`
  - 파일: 4개 `SKILL.md`, `limits.md`, `handoff-prep.md`, `lib/policy/role-policy.json`, `shared/skill/runtime/role-policy.json`, `*/agents/*` 템플릿, managed section
- fixture 값은 생성기나 테스트를 실행해서 측정한 값만 넣습니다. 손으로 계산하지 않습니다.
- `instruction-contracts.json`
  - `agentProfileBaseline.revision`은 기존 관례(T3, R1)대로 그대로 둡니다.
  - `protected`는 바꾸지 않습니다.
- Python은 항상 `PYTHONDONTWRITEBYTECODE=1`을 붙여 실행합니다.
- Implementer 규칙(Codex bridge, sandbox)
  - allowedPaths는 정확한 파일 목록입니다.
  - 실행 중인 명령이 있으면 turn을 끝내지 않습니다.
  - bridge가 실행되는 동안 Orchestrator는 ref를 움직이지 않습니다.
- Implementer와 Tester는 Git 상태를 바꾸지 않습니다. stage와 commit은 Orchestrator만 합니다.
- 커밋 메시지는 type(scope)를 영어로, description과 body를 한국어로 씁니다. task 하나에 focused commit 하나를 만듭니다. plan-level 기록은 handoff 기록에 남기고, 기록만을 위한 closing commit은 만들지 않습니다.

### Implementer and Tester briefs MUST include the full current E1 text

설치된 profile이 현재 소스와 다를 수 있습니다. 그래서 모든 Implementer와 Tester brief에 아래 E1 전문을 영문 그대로 넣습니다. 출처는 `lib/prompts/agent-fragments.json` `tester.verification-steps` step 2입니다.

> Run each command in the foreground. If the tool returns while the command is still running, keep waiting on that same session with the longest supported wait until it reports an exit code; DO NOT replace that wait with `sleep` loops or short status checks. DO NOT detach commands with `&`, `nohup`, `setsid` or an equivalent. NEVER end the turn or report while a command you started is unfinished. If a command cannot be run to completion, stop it, confirm it has exited, then report an environment block with the command, elapsed time, partial output and what remains unverified. Return a brief that prescribes detached execution to Orchestrator as an instruction conflict.

Tester brief에는 spec §5.2 `**Suite parallelism:**` 문단 전문도 넣습니다. brief는 suite를 순차 그룹으로 나누라고 지시하지 않습니다.

## Review Focus (최종 Reviewer)

| # | 확인할 것 | 근거 |
|---|---|---|
| 1 | 4개 `verification.md`에서 §5.1 문장, §5.2 문단, §5.3 문단이 바이트까지 같고 위치가 맞다. 위치: Command execution → Suite parallelism → Read-only reverse dependency, Approved full regression → Full regression shards → CI substitution. Approved 문단의 나머지는 HEAD와 같다. test-scope 절이 플랫폼끼리 byte-identical이다 | AC1–AC3 |
| 2 | §5.4가 step 1 끝에만 있다. step 2(E1) 줄과 `singleModeRule`이 그대로다 | AC4, AC5 |
| 3 | §5.5 대상 파일이 HEAD와 바이트까지 같다 | AC5 |
| 4 | fixture 변경이 다음 항목뿐이다: profile baseline tester 4, golden 24, `renderingBaseline` 8(측정값), MANIFEST 5. `protected`와 `revision`은 그대로다 | AC7 |
| 5 | 새 테스트가 정확한 동등성과 인접성을 검사한다. 교체한 phrase가 검사를 느슨하게 만들지 않았다 | AC1–AC4 |
| 6 | 새 문장에 퇴역 문구와 `/project suite/i`가 없다. 측정하지 않은 플랫폼 동작(native 시간 제한, runner 병렬도 옵션)을 단정하지 않는다 | AC6, AC9 |

## 파일 구조

| 영역 | 파일 | Task |
|---|---|---|
| 플랫폼 문서 | `{claude,codex,gemini,grok}/skill/references/verification.md` | T1 |
| fragment registry | `lib/prompts/agent-fragments.json` | T1 |
| 계약 테스트 | `tests/node/test-scope-contract.test.mjs` | T1 |
| 해시 fixture | `tests/node/fixtures/instruction-contracts.json`, `tests/node/fixtures/installed-layout-golden.json`, `tests/node/plan.test.mjs`(`renderingBaseline`) | T1 |
| 생성물 | `MANIFEST.sha256` | T1 |

---

### Task T1: 전체 회귀 shard와 suite 내장 병렬 실행 규칙 추가

**목표:** spec §5.1–§5.4를 4개 플랫폼과 tester fragment에 적용합니다. §6의 계약 테스트와 해시 fixture를 측정값으로 갱신합니다.

**Files (allowedPaths, 정확히 10개 파일):**

```
claude/skill/references/verification.md
codex/skill/references/verification.md
gemini/skill/references/verification.md
grok/skill/references/verification.md
lib/prompts/agent-fragments.json
tests/node/test-scope-contract.test.mjs
tests/node/fixtures/instruction-contracts.json
tests/node/fixtures/installed-layout-golden.json
tests/node/plan.test.mjs
MANIFEST.sha256
```

Python 테스트 3개는 목록에 넣지 않았습니다. 바뀌는 문장을 고정한 곳을 찾지 못했기 때문입니다. 깨지면 hold합니다.

**선행:** 없음 (base `4d80d208`, plan v1 사용자 승인)

**Interfaces:** export, CLI, `settings.toml` 키는 바뀌지 않습니다.

- [x] **Step 1: 테스트 먼저 (`tests/node/test-scope-contract.test.mjs`)**
  - 상수를 추가합니다. 값은 spec 원문 그대로입니다.
    - `approvedFullRegressionSentence`: §5.1 변경 후 문장
    - `suiteParallelismParagraph`: §5.2
    - `fullRegressionShardsParagraph`: §5.3
    - `testerSuiteParallelismRule`: §5.4에서 맨 앞 공백을 뺀 문장
  - 새 테스트 `suite parallelism paragraph immediately follows Command execution in each reference`
    - 플랫폼마다 `**Suite parallelism:**`로 시작하는 문단이 `[suiteParallelismParagraph]`와 같아야 합니다.
    - test-scope 문단 배열에서 `commandExecutionParagraph`의 다음 문단이 이 문단이어야 합니다.
    - 그다음 문단은 `Read-only reverse dependency search`로 시작해야 합니다.
  - 새 테스트 `full regression shards paragraph sits between Approved full regression and CI substitution`
    - `**Full regression shards:**` 문단이 `[fullRegressionShardsParagraph]`와 같아야 합니다.
    - `**Approved full regression**` 문단의 다음 문단이 이 문단이어야 합니다.
    - 그다음 문단은 `**CI substitution**`으로 시작해야 합니다.
  - 기존 테스트 `approved full regression follow-up`(`:320`)
    - phrase `'the current final-mode Tester runs it as a follow-up; no new Tester is assigned'`를 `approvedFullRegressionSentence`로 바꿉니다.
    - 해당 문단이 이 문장으로 시작하는지 확인하는 단언을 추가합니다.
    - 나머지 phrase는 그대로 둡니다.
  - `profileRules.tester`에 세 번째 항목을 추가합니다. `after`가 없으므로 `endsWith`로 검사됩니다.
    - `lineStart`: `'1. Use the shared brief, criteria, Implementer summary and relevant prior findings. '`
    - `before`: `'Use approved structural/consistency checks for policy/configuration. '`
    - `rule`: `testerSuiteParallelismRule`
    - `phrases`: `[testerSuiteParallelismRule]` (렌더 결과에 정확히 한 번)
  - `sectionPhrases`에 `'shard manifest'`를 추가합니다.
  - 기존 상수와 기존 단언은 바꾸지 않습니다. E1 줄 전체 검사(`:212-234`)와 Final mode 바로 다음 Command execution 검사(`:246-256`)도 그대로 둡니다.
- [x] **Step 2: RED 확인**
  - `node --test tests/node/test-scope-contract.test.mjs`
  - 다음 테스트만 FAIL해야 합니다.
    - 새 테스트 2개
    - `approved full regression follow-up`
    - `{platform} tester places each test-scope rule exactly once` 4개
    - `{platform} verification defines test scope before risk-scaled execution` 4개 (`shard manifest`)
  - 그 밖의 실패는 이름과 함께 보고합니다.
- [x] **Step 3: 문안 편집 (AC1–AC4)**
  - 4개 `verification.md`
    - Approved full regression 문단의 첫 문장을 §5.1로 바꿉니다. claude:54, codex:52, gemini:54, grok:54입니다.
    - `**Command execution:**` 문단 다음에 빈 줄을 두고 §5.2를 넣습니다. claude/gemini/grok:26, codex:24 다음입니다.
    - Approved full regression 문단과 `**CI substitution**` 문단 사이에 §5.3을 넣습니다. 앞뒤를 빈 줄 하나로 구분합니다.
  - `agent-fragments.json` `tester.verification-steps`
    - `Use approved structural/consistency checks for policy/configuration.` 바로 뒤, `\n2.` 앞에 §5.4 문장을 넣습니다. 맨 앞 공백을 포함하고, JSON 이스케이프 외에는 바이트를 그대로 둡니다.
    - step 2와 그 밖의 fragment는 바꾸지 않습니다.
- [x] **Step 4: fixture 측정과 반영 (AC7)**
  - `agentProfileBaseline.profiles`: 다음 4개만 바꿉니다. `revision`과 `protected`는 그대로입니다.
    - `claude/agents/arc-tester.md`
    - `codex/agents/arc-tester.toml`
    - `gemini/agents/arc-tester.md`
    - `grok/agents/arc-tester.md`
    - 값은 `node --test tests/node/agent-fragments.test.mjs`가 보고하는 실제값을 씁니다. 출력에 경로별 값이 없으면 `agent-fragments.test.mjs:29-34` 방식으로 일회성 계산을 합니다(새 파일 없음). 두 방법의 값이 같아야 합니다.
    - 그 밖의 profile 해시가 바뀌면 hold합니다.
  - golden: `node tests/node/fixtures/installed-layout.mjs --diff`의 출력이 아래 24줄과 정확히 같을 때만 `--write`합니다. 다르면 hold합니다.
    ```
    ~ claude/omit/en skills/arc/references/verification.md
    ~ claude/omit/ko skills/arc/references/verification.md
    ~ claude/write/en agents/arc-tester.md
    ~ claude/write/en skills/arc/references/verification.md
    ~ claude/write/ko agents/arc-tester.md
    ~ claude/write/ko skills/arc/references/verification.md
    ~ codex/omit/en skills/arc/references/verification.md
    ~ codex/omit/ko skills/arc/references/verification.md
    ~ codex/write/en agents/arc-tester.toml
    ~ codex/write/en skills/arc/references/verification.md
    ~ codex/write/ko agents/arc-tester.toml
    ~ codex/write/ko skills/arc/references/verification.md
    ~ gemini/omit/en skills/arc/references/verification.md
    ~ gemini/omit/ko skills/arc/references/verification.md
    ~ gemini/write/en agents/arc-tester.md
    ~ gemini/write/en skills/arc/references/verification.md
    ~ gemini/write/ko agents/arc-tester.md
    ~ gemini/write/ko skills/arc/references/verification.md
    ~ grok/omit/en skills/arc/references/verification.md
    ~ grok/omit/ko skills/arc/references/verification.md
    ~ grok/write/en agents/arc-tester.md
    ~ grok/write/en skills/arc/references/verification.md
    ~ grok/write/ko agents/arc-tester.md
    ~ grok/write/ko skills/arc/references/verification.md
    ```
    - 쓴 뒤 `--diff`의 출력이 비어 있어야 합니다.
    - 플랫폼마다 4개 조합의 `verification.md` 해시가 서로 같아야 합니다(현재 관례).
    - `skills/arc/runtime/verification.mjs`와 다른 agents 항목은 바뀌지 않아야 합니다.
  - `renderingBaseline`(`plan.test.mjs:225-234`)
    - `node --test --test-name-pattern 'preserves public rendering baseline' tests/node/plan.test.mjs`를 실행합니다.
    - 실패한 키의 실제 digest로 해당 값만 바꿉니다. 예상은 8개 키 모두입니다. 합성 payload가 tester profile을 렌더하기 때문입니다.
    - 다른 줄은 바꾸지 않습니다. 다시 실행해서 통과해야 합니다.
- [x] **Step 5: MANIFEST**
  - 마지막에 `node scripts/update-manifest.mjs`를 실행하고 `npm run check:manifest`로 확인합니다.
  - diff는 다음 5줄에만 있어야 합니다.
    - `claude/skill/references/verification.md`
    - `codex/skill/references/verification.md`
    - `gemini/skill/references/verification.md`
    - `grok/skill/references/verification.md`
    - `lib/prompts/agent-fragments.json`
- [x] **Step 6: 관련 테스트, check, 범위 확인**
  - 아래 최소 집합을 실행합니다. Node 파일은 `node --test <파일들>` 한 명령의 내장 병렬로 실행합니다. Python `unittest`는 설치된 병렬 모드가 없으므로 순차로 실행하고 그 이유를 보고합니다.
  - AC2: `git diff --word-diff 4d80d208 -- '*/skill/references/verification.md'`에서 다음 세 가지만 보여야 합니다.
    - Approved 문단의 삽입 `except shard Testers under **Full regression shards** below`
    - 새 문단 2개
  - AC5: `git diff --name-only 4d80d208 -- '*/skill/SKILL.md' '*/skill/references/limits.md' '*/skill/references/handoff-prep.md' lib/policy/role-policy.json shared/skill/runtime/role-policy.json '*/agents/*'`의 출력이 비어 있어야 합니다.
  - `git status --porcelain`으로 변경 파일이 allowedPaths 10개와 untracked spec·plan뿐인지 확인합니다.
- [x] **Step 7: Commit (Orchestrator)**
  - 수락한 뒤 10개 파일을 commit 하나로 만듭니다. spec과 plan은 앞선 docs 커밋에 있습니다.
  - 메시지: `chore(policy): 전체 회귀 shard와 suite 내장 병렬 실행 규칙 추가`

**수용 기준:**

| AC | 확인 방법 |
|---|---|
| AC1 | Step 1 새 테스트(Suite parallelism)와 기존 Command execution 인접 테스트 |
| AC2 | 교체한 `approved full regression follow-up` 테스트와 Step 6 word-diff |
| AC3 | Step 1 새 테스트(shards)와 test-scope byte-identical 테스트 |
| AC4 | `profileRules.tester` 세 번째 항목(정확히 한 번, step 1 줄 끝)과 기존 E1 줄 전체 검사 |
| AC5 | Step 6 `git diff --name-only` 출력 없음, `npm run check:role-policy` |
| AC6 | 기존 retired phrase 테스트와 `project suite` 테스트 |
| AC7 | Step 4·5의 정확한 목록과 `instruction-layout`(`protected`) |
| AC8 | 관련 테스트에서 새 실패가 없는지 확인합니다. 전체는 최종 검증에서 확인합니다 |
| AC9 | 보고서에 적습니다. 실제 shard 운영, native 시간 제한, runner 병렬도 옵션은 미검증입니다 |

**task 검증 (fresh Tester, `mode: task`) 최소 집합**

| 항목 | 분류·이유 |
|---|---|
| `tests/node/test-scope-contract.test.mjs` | (b) 갱신한 계약 |
| `tests/node/agent-fragments.test.mjs` | (b) profile baseline tester 4, fragment 개수 유지 |
| `tests/node/instruction-layout.test.mjs` | (b) fixture 계약과 `protected` |
| `tests/node/installed-layout-golden.test.mjs` | (b) golden 24 |
| `tests/node/plan.test.mjs` | (b) `renderingBaseline` |
| `tests/node/{run-mode-contract,instruction-language,plan-level-records-contract,role-policy,composite-instructions,package}.test.mjs` | (a) `verification.md`나 fragment를 직접 읽음(grep 확인) |
| `tests/node/{manifest,profile-render,upgrade-harness}.test.mjs` | (a) `agent-fragments.json`을 payload나 렌더 입력으로 읽음 |
| Python `tests.test_harness_contract`, `tests.test_arc_policy`, `tests.test_claude_payload` | (a) `verification.md`와 profile을 읽음. 고정 문구가 없는지 실행으로 확인 |
| `npm run check:manifest`, `npm run check:role-policy`, `node scripts/check-installer-parity.mjs`, `node tests/node/fixtures/installed-layout.mjs --diff`(출력 없음) | (c) check |
| Step 6 word-diff와 name-only 확인 | AC2, AC5 |

알려진 baseline은 다음과 같습니다. 이 목록과 실패 이름이 같으면 baseline 후보로 보고, 이름이 다르면 static check와 base 재실행으로 판정합니다.
- `profile-render` "Codex existing root field edits preserve indentation, comments and nested fields"
- Python 487 FAIL / 6 ERROR

**hold 조건:**
- 목록 밖 파일(Python 테스트 포함)을 고쳐야 하는 경우. 범위 변경이므로 Orchestrator에게 보고하고 plan 개정을 거칩니다.
- golden `--diff`가 위 24줄과 다른 경우
- profile baseline에서 tester 4개 밖이 바뀌거나 `protected`·`revision`이 바뀌는 경우
- MANIFEST diff가 위 5줄 밖에 있는 경우
- `validateAgentRegistry`나 fragment 길이 제한에 걸리는 경우. 문안은 바꾸지 않고 보고합니다.
- 생성 스크립트가 allowedPaths 밖에 쓰거나 sandbox에 막힌 경우(environment block)
- 기준선에 없던 새 실패나 new-failure candidate가 생긴 경우
- role 명령이 미완료로 끝난 경우. 성공으로 기록하거나 자동으로 재시도하지 않습니다.

---

## 최종 검증 (`mode: final`)

T1을 수락·커밋한 뒤, verified HEAD에서 clean 상태를 확인하고 fresh Tester를 한 번 배정합니다.
- brief에는 E1 전문, E2 전문, §5.2 문단을 넣습니다. 함께 잠정 trigger 판단, 통합 이력(없음), 재변경 파일 목록(빈 목록과 이유), isolated rerun 한도(3), approved base `4d80d208`을 적습니다.
- 최종 Reviewer는 다음이 모두 끝난 뒤에 시작합니다: 보고 전달, 새 실패의 Implementer → Tester 해결, candidate 처분, 승인된 full regression이 있으면 그 완료, undeterminable 처분.

**실행 방식 (새 규칙 적용)**
- Node 대상 파일은 모두 `node --test <파일들>` foreground 명령 하나의 내장 병렬로 실행합니다. 테스트끼리 간섭한다고 알려진 경우가 아니면 순차 그룹으로 나누지 않습니다.
- Python `unittest`는 설치된 병렬 모드가 없으므로 순차로 실행하고 이유를 보고합니다.
- 병렬 실행에서 간헐 실패로 보이는 테스트는 HEAD에서 단독으로 재실행합니다(최대 3회).
- full regression은 계획하지 않습니다. 사용자가 나중에 승인하면 그때 설치된 규칙에 따라 Orchestrator가 shard 여부를 판단하고 기록합니다.

**base 비교**
- base run이 필요한 실패가 있을 때만 Orchestrator가 `4d80d208`의 깨끗한 detached worktree를 `<git-common-dir>/arc/base/<workflow>`에 준비합니다. native addon을 쓰려면 ignore된 `build` symlink가 있어야 합니다.
- Tester는 그곳에서 해당 테스트 이름만 단독으로 실행합니다. Orchestrator는 그곳에서 테스트를 돌리지 않습니다.
- 알려진 baseline:
  - `profile-render`의 위 1건
  - Python 487 FAIL / 6 ERROR
  - `consumer.test.mjs` 14건 중 10건 실패(`scripts/deploy.sh` manifest 누락)

**실행 범위**
1. **모든 계약 테스트**
   - Node: `tests/node/{language,plan,test-scope-contract,run-mode-contract,plan-level-records-contract,watch-import-graph,manifest,installed-layout-golden,parity-check,instruction-layout,instruction-language,agent-fragments,role-policy,composite-instructions,profile-render,hardcoding-residual,menu-label-residual}.test.mjs`
   - Python: `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest tests.test_harness_contract tests.test_arc_policy tests.test_claude_payload -v`
2. **모든 check 스크립트**
   - `npm run check:role-policy`
   - `npm run check:manifest`
   - `node scripts/update-runtime-assets.mjs --check`
   - `node scripts/check-installer-parity.mjs`
   - `node tests/node/fixtures/installed-layout.mjs --diff` (출력 없음)
3. **재변경 파일의 관련 테스트**
   - 예상 목록은 비어 있습니다. task가 하나뿐이라 T1 커밋 뒤에 같은 파일을 다시 바꾼 커밋이 없고, task 사이 파일 겹침도 없습니다.
   - Orchestrator가 `git diff --name-only <T1 commit> HEAD`로 확정하고, Tester가 교차 확인합니다.
4. **트리거 대체 검사**

| 트리거 | 잠정 판단 | 대체 검사 | 이유 |
|---|---|---|---|
| (1) 공유 모듈 | 해당 | 아래 범위 | `agent-fragments.json`은 4개 플랫폼 profile 렌더, 설치, 업그레이드 경로가 읽습니다. 4개 `verification.md`는 설치 payload와 여러 계약 테스트가 읽습니다 |
| (2) 외부 변경 통합 | 해당 없을 예정 | 없음. Orchestrator가 통합 이력을 brief에 적습니다 | 통합 계획 없음 |
| (3) 의존성·설정 | 해당 없을 예정 | `git diff --name-only 4d80d208 HEAD -- package.json package-lock.json`의 결과가 없어야 함 | 변경 없음 |
| (4) 공개 인터페이스 | 해당 없을 예정 | diff가 Markdown, JSON 문자열, 테스트, fixture에만 있고 export, CLI 옵션, `settings.toml` 키가 그대로인지 확인 | 문안만 변경 |

**트리거 (1) 대체 검사 범위**
- 출발점: `lib/prompts/agent-fragments.json`, `{claude,codex,gemini,grok}/skill/references/verification.md`
- 정적 import와 경로 문자열로 역의존성을 추적합니다.
- grep으로 찾은 후보 가운데 계약 테스트 밖의 것: `upgrade-harness`, `upgrade-snapshot-scope`, `legacy-parity`, `package`, `gemini-install`, `grok-install`, `consumer`
- `tests/node/fixtures/{install-mode,installed-layout}.mjs`와 `tests/node/fixtures/platforms/package-root.mjs`를 import하는 파일도 포함합니다.
- 범위를 확정할 수 없으면 한 단계 넓힙니다. 이 파일들도 위 Node 명령 하나에 함께 넣을 수 있습니다.

**판정할 수 없는 항목이 생기면**
- item, cause, substitute checks run, remaining unverified scope를 보고합니다.
- 사용자가 다음 중 하나를 고를 때까지 최종 수용과 최종 Reviewer를 보류합니다: (i) full regression 승인, (ii) CI 대체, (iii) unverified 처분.
- Tester dispatch의 60분 제한 안에 끝나지 않으면 environment block으로 보고하고 hold합니다. Orchestrator가 대신 실행하려면 사용자 선택이 있어야 합니다.

**최종 Reviewer**
- 이 작업은 significant/high-risk입니다. final Tester 작업이 끝난 뒤 독립 Reviewer가 `4d80d208..HEAD` 전체를 한 번 검토합니다. 초점은 Review Focus 1–6입니다.
- finding은 Implementer → Reviewer로 처리하고 Tester는 다시 배정하지 않습니다.
- 수정분은 재확인이 끝날 때까지 커밋하지 않고, 끝나면 follow-up commit 하나로 만듭니다.
- final Tester가 찾은 새 실패는 Implementer → Tester로 처리합니다.

## 요구 추적

| 요구 | Task/Step | 확인 |
|---|---|---|
| G1 (내장 병렬 기본값, Q2) | T1 Step 3 §5.2, §5.4 | AC1, AC4 |
| G2 (shard 조건·단위·커버리지·실패·완료·기록, Q1/Q3/Q4/Q6/Q7) | T1 Step 3 §5.3 | AC3 |
| G3 (follow-up과 single-mode 정합) | T1 Step 3 §5.1, §5.4 shard 문장 | AC2, AC4, AC5 |
| spec §5.5 무변경 | T1 Step 6 | AC5 |
| spec §6 fixture | T1 Step 4–5 | AC7 |
| 비목표(E1/E2, runtime, limits) | Global Constraints | AC5, Review Focus 3 |
| 측정하지 않은 동작 비단정 | 보고서 | AC9 |

## 참고

- `MANIFEST.sha256`에는 `docs/`와 `tests/`가 들어가지 않습니다.
- `tests/installer-parity.json`에 나오는 "full regression"은 legacy inventory 텍스트입니다. `test-scope-contract` 매핑이 없어 이번 변경과 관계없습니다.
- 런타임 자산 생성기(`scripts/update-runtime-assets.mjs`)는 fragment와 reference를 복사하지 않습니다. 그래서 `shared/skill/runtime`은 바뀌지 않습니다.
