# 전체 회귀 병렬 실행 설계

- 날짜: 2026-11-25
- 상태: 사용자 승인 (2026-11-25T16:43:45+09:00 이전). Q1–Q7 모두 (A) 선택
- 저장 예정 경로: docs/superpowers/specs/2026-11-25-full-regression-parallel-design.md
- 대상: /Users/ma-24-007/Desktop/workspace/arc, 브랜치 `chore/final-tester-before-reviewer`, HEAD `4d80d208`
- 경로: Architectural. 공유 역할 계약 4개 플랫폼과 렌더링 프로필, 고정 fixture가 함께 바뀝니다.

## 1. 배경

- 사용자 요청: "만약 Tester가 전체 회귀를 진행할 때 사이즈가 크면 병렬 실행할 수 있도록 보완해줘."
- 지난 final Tester는 Node 테스트 파일 177개를 brief 지시대로 순차 그룹 15개로 나눠 돌렸습니다. 총 약 1003초, 가장 긴 그룹이 267초였습니다.
- `node --test`는 파일이 여러 개면 원래 파일 단위로 동시에 실행합니다. 기본값은 availableParallelism-1이고, 8코어 호스트에서는 7입니다.
- 호스트에서 여러 실행을 동시에 돌렸을 때 부하로 인한 간헐 실패가 늘어난 적이 있습니다.
- 현재 정책과 충돌하는 문장:
  - verification.md "Approved full regression ... the current final-mode Tester runs it as a follow-up; no new Tester is assigned."
  - tester fragment와 handoff-prep "One assignment performs one mode; the only exception is the approved full regression follow-up in final mode."
  - verification.md "Final mode runs once ... as one fresh Tester assignment"
  - SKILL.md "Each task requiring Tester receives fresh Tester, never reused from another task."

## 2. 사용자 결정 (brief 근거)

- D1 기본값: Tester 한 명이 runner의 내장 병렬 모드로, foreground 명령 하나 안에서 실행합니다.
  - 순차 실행은 테스트끼리 간섭하거나 runner에 병렬 모드가 없을 때만 하고, 이유를 보고합니다.
  - 수치 임계값은 두지 않습니다.
  - E1(Tester step 2, Implementer step 4)과 E2(`**Command execution:**` 문단)의 의미는 바꾸지 않습니다.
- D2 shard: 필요할 때 Orchestrator가 승인된 전체 회귀를 겹치지 않는 shard로 나누고 Tester 여러 명에게 병렬로 맡깁니다.
  - 상한은 `max_concurrent_subagents`(설치값 5)입니다.
  - "필요"란 한 Tester의 실행 시간 제한(bridge `arc_tester` 60분)을 넘을 가능성이 높을 때, 또는 독립 suite를 동시에 돌릴 수 있을 때입니다.
  - Orchestrator가 결과를 병합합니다. 병렬 실행에서 나온 실패는 단독으로 재실행해 부하성 간헐 실패를 가려냅니다.

## 3. 목표와 비목표

목표
- G1: Tester의 여러 파일 suite 명령은 runner 내장 병렬 모드를 기본으로 씁니다. brief가 이유 없이 순차 그룹 분할을 지시하지 못하게 합니다.
- G2: 승인된 전체 회귀를 shard로 나누는 조건, 단위, 커버리지 증명, 실행 주체, 실패 처리, 완료 정의, 기록, ledger 계상을 정합니다.
- G3: 기존 "follow-up, 새 Tester 없음" 규칙과 single-mode 규칙이 shard와 충돌하지 않게 맞춥니다.

비목표
- E1/E2 의미 변경, runtime/CLI/bridge 코드 변경, `limits.toml` 형식이나 역할 timeout 변경.
- task mode 범위 변경. 승인되지 않은 final-mode 검사 (1)~(4)의 shard화도 하지 않습니다(Q1).
- 수치 크기 임계값.
- 측정하지 않은 플랫폼 동작(native 실행 시간 제한, runner 옵션 지원 여부)을 사실로 단정하는 것.
- 텍스트 존재가 실제 준수를 증명한다고 주장하는 것.

## 4. 설계 결정

1. 적용 범위
   - shard는 승인된 전체 회귀에만 적용합니다(권장, Q1).
   - 내장 병렬 기본값(D1)은 Tester가 실행하는 모든 여러 파일 suite 명령에 적용합니다(권장, Q2). 실행 방식만 바뀌고 실행하는 테스트는 그대로입니다.
   - 그래서 "Final mode runs once ... as one fresh Tester assignment"와 SKILL.md의 fresh Tester 문장은 그대로 유지됩니다. shard Tester도 새로 만든 Tester이고 다른 task에서 재사용한 것이 아닙니다.
2. single-mode 규칙
   - 문장은 바꾸지 않습니다. shard Tester는 `mode: final` 하나만 수행합니다.
   - 범위는 새 brief 필드 `shard: <id> of <n>`로 좁힙니다.
   - 근거: tester 프로필 step 1의 final-mode 지시(모든 contract test 실행 등)와 shard brief가 충돌하면 안 됩니다. 그래서 tester fragment에 shard 한정 문장을 추가합니다.
3. 실행 주체
   - 현재 final-mode Tester가 follow-up으로 shard 하나를 맡습니다. "the current final-mode Tester runs it as a follow-up" 문구를 유지합니다.
   - 나머지 shard는 fresh Tester가 맡습니다.
4. shard 조건
   - 기록된 이전 실행 시간으로 보아 경로의 Tester 시간 제한을 넘을 가능성이 높을 때, 또는 독립 suite를 동시에 실행할 수 있을 때입니다.
   - 근거가 없으면 Tester 한 명에 내장 병렬로 실행합니다.
   - Orchestrator가 판단하고 이유를 기록합니다(Q6).
5. shard 단위
   - suite 명령 하나 전체, 또는 테스트 파일 전체의 집합입니다. 테스트 이름 일부로는 나누지 않습니다. 이름 단위로 나누면 누락이 생길 수 있습니다.
6. 커버리지 증명
   - Orchestrator가 dispatch 전에 verified HEAD 기준 inventory(파일과 명령의 명시 목록)와 shard manifest를 만듭니다. 각 항목은 정확히 한 shard에 속하고, shard끼리 겹치지 않으며, 합집합이 inventory와 같아야 합니다.
   - 각 shard Tester는 실제로 실행한 파일을 보고합니다.
   - Orchestrator는 병합할 때 inventory의 모든 항목에 완전한 결과가 정확히 한 번 있는지 확인합니다.
   - 결과가 불완전한 항목은 기존 규칙대로 new-failure candidate로 분류하고, 실행은 미완료로 남습니다.
7. 공유 상태
   - 모든 shard는 같은 HEAD, 같은 workspace에서 실행합니다.
   - Tester마다 시작과 끝에 `git status --porcelain`을 기록합니다.
   - 모든 shard가 끝날 때까지 누구도 workspace에 쓰지 않습니다.
   - 상태를 공유한다고 알려진 테스트는 같은 shard에 넣습니다. 예: 고정 포트, 같은 임시/workspace 경로, 전역 설정.
8. 실패 처리
   - 실행 중에는 각 shard Tester가 정적 검사(Baseline 1단계)로만 분류합니다. 단독 재실행이나 base 재실행은 하지 않습니다.
   - 모든 shard가 보고하면 Orchestrator가 base run이 필요한 실패를 모아 현재 final-mode Tester에게 보냅니다.
   - 그 Tester는 다른 테스트 명령이 돌지 않는 상태에서 각 실패를 HEAD에서 단독으로 재실행합니다. 횟수는 brief의 isolated rerun 한도까지입니다.
   - 단독 실행에서 통과하면 intermittent candidate가 되고 Orchestrator가 처리합니다. 단독 실행에서도 실패하면 기존 base check를 따릅니다.
   - unrelated 실패는 단독 재실행 대상에서 뺍니다(권장, Q4).
9. 막힌 shard
   - 기존 resume 규칙을 따릅니다. bridge는 같은 dispatch를 재개하고 새 lease 구간이 시작됩니다.
   - 같은 assignment를 이어갈 수 없으면 environment block으로 보고하고 보류합니다.
   - 사용자가 새 Tester에게 결과가 불완전한 항목만 맡길지 정합니다.
   - 다른 shard의 결과는 같은 HEAD에서는 그대로 유효합니다.
10. 완료 정의
    - 승인된 전체 회귀는 다음이 모두 충족돼야 완료입니다: 모든 shard가 보고함, 커버리지 확인됨, 모든 shard 실패가 분류되거나 처리됨.
    - final Reviewer 시작 조건 "any approved full regression is complete"는 이 정의로 판단합니다. `role-policy.json` 문구는 바꾸지 않아도 됩니다.
11. 실행 횟수
    - shard는 승인된 실행 한 번을 나누는 것이고 실행을 추가하지 않습니다. "runs once per approval"을 유지합니다.
    - HEAD가 바뀌면 기존 만료 규칙에 따라 모든 shard 결과가 무효가 됩니다.
12. ledger와 상한
    - 기존 limits.md 규칙으로 충분하므로 limits.md는 바꾸지 않습니다.
    - shard Tester 한 명은 생성 1, active 1로 계상합니다. follow-up은 0입니다.
    - 배치 전체를 미리 예약하고, 남은 슬롯에 맞지 않는 shard는 직렬화합니다.
    - bridge dispatch는 `prepare-dispatch`의 concurrency 상한에도 걸립니다.
13. CPU
    - runner에 병렬도 옵션이 있으면 Orchestrator가 shard별로 지정해 전체 worker 수가 호스트의 가용 병렬도를 넘지 않게 합니다.
    - 옵션 지원 여부는 단정하지 않습니다(Q7).
14. 기록
    - shard 판단 이유, inventory, manifest, Tester ID, shard별 결과를 approved full regression 기록과 같은 곳에 둡니다. 즉 plan-level progress record와 canonical handoff record입니다.

## 5. 정책 문장 변경안 (byte-exact, English)

### 5.1 `{claude,codex,gemini,grok}/skill/references/verification.md`: Approved full regression 문단 첫 문장 교체

현재:
```
**Approved full regression** requires explicit user approval, and the current final-mode Tester runs it as a follow-up; no new Tester is assigned.
```
변경:
```
**Approved full regression** requires explicit user approval, and the current final-mode Tester runs it as a follow-up; no new Tester is assigned except shard Testers under **Full regression shards** below.
```
문단의 나머지는 그대로 둡니다.

### 5.2 같은 파일: `**Command execution:**` 문단 바로 뒤에 새 문단 삽입

삽입 위치는 "Read-only reverse dependency search is allowed in final mode." 문단 앞입니다. Final mode 바로 다음에 Command execution이 오는 순서는 유지됩니다.
```
**Suite parallelism:** A Tester runs each multi-file suite command with the test runner's built-in parallel mode inside that one foreground command; a parallel mode that needs a package or plugin not already installed counts as no parallel mode. It runs a suite sequentially only when its tests are known to interfere with each other or the runner has no parallel mode, and reports the reason. Briefs MUST NOT split a suite into sequential groups for any other reason; splitting across Testers follows **Full regression shards** below. This changes how a command runs, not which tests run.
```

### 5.3 같은 파일: Approved full regression 문단 바로 뒤, `**CI substitution**` 문단 앞에 새 문단 삽입

```
**Full regression shards:** Orchestrator MAY split an approved full regression into shards only when, from recorded prior run times, it is likely to exceed one Tester's time limit for its route, such as the bridge `arc_tester` 60-minute lease, or when independent suites, such as a sequential Python suite and a Node suite, can run at the same time; it records the reason. A shard is one whole suite command or a set of whole test files, never a subset of test names. Before dispatch Orchestrator lists every test file and suite command of the approved full regression at the verified HEAD as the inventory and writes a shard manifest that assigns each item to exactly one shard, so that the shards do not overlap and their union equals the inventory. Tests known to share state, such as fixed ports, the same temporary or workspace paths or global configuration, go in one shard. The current final-mode Tester runs one shard as its follow-up; each other shard goes to a fresh Tester whose `mode: final` brief adds `shard: <id> of <n>`, the shard's files or command and the manifest. Each shard Tester runs only its shard with no other final-mode checks, reports the files it actually ran and classifies failures only by the static check under **Baseline** below. All shards run at the same verified HEAD in the same workspace; each Tester records `git status --porcelain` at start and end, and no one writes in that workspace until every shard ends. Orchestrator reserves the whole shard batch under [limits](limits.md#counting-and-reservations) and serializes shards that do not fit; each shard Tester is a created and active instance, and the follow-up adds none. When the runner has a parallelism option, Orchestrator sets it per shard so that the combined workers stay within the host's available parallelism. After every shard has reported, Orchestrator sends the shard failures that need a base run to the current final-mode Tester, which reruns each alone at HEAD, with no other test command running in that workspace, up to the brief's isolated rerun limit; a pass alone is an intermittent candidate, and a failure alone follows the base check below. Orchestrator merges the shard results and verifies that every inventory item has complete results exactly once; an item without complete results is a new-failure candidate and leaves the run incomplete. A blocked or timed-out shard follows the resume rule above; its items stay unverified, and the user decides whether a new Tester runs only the items without complete results. Sharding splits the one approved run and adds no run. The approved full regression is complete only when every shard has reported, coverage is verified and every shard failure is classified or dispositioned. Record the reason, inventory, manifest, Tester IDs and per-shard results with the approved full regression record.
```
`limits.md#counting-and-reservations` 앵커는 4개 플랫폼 모두 limits.md:6에 있습니다(확인함).

### 5.4 `lib/prompts/agent-fragments.json`: `tester.verification-steps` step 1 끝에 추가

추가 위치는 "Use approved structural/consistency checks for policy/configuration." 바로 뒤, `\n2.` 앞입니다. 맨 앞 공백을 포함합니다. JSON 문자열 안에서 백틱은 그대로입니다.
```
 Run each multi-file suite command with the test runner's built-in parallel mode inside that one foreground command; run it sequentially only when its tests are known to interfere with each other or the runner has no installed parallel mode, and report the reason. A brief with `shard: <id> of <n>` limits final mode to that approved full regression shard: run only its listed files or command, report the files actually run and classify failures only by the static base check; run isolated or base reruns only when Orchestrator sends them after every shard has reported.
```
step 2(E1)는 한 글자도 바꾸지 않습니다. test-scope-contract가 step 2 줄 전체를 같은지 비교하기 때문에 step 1 끝에 넣습니다.

### 5.5 변경하지 않는 문장 (의도적)

- `singleModeRule`, `finalScopeSentence`, `finalReviewerStartSentence`, E2 `commandExecutionParagraph`, E1 `commandExecutionRule`.
- `role-policy.json`의 `review.final-plan-recheck`, SKILL.md:20, handoff-prep.md:95, limits.md 전체.
- handoff-prep를 바꾸지 않는 근거: shard brief도 `mode: final` brief이므로 기존 필수 입력을 모두 인용하면 충돌이 없습니다. shard 고유 입력은 5.3이 정합니다. handoff-prep에 test-scope 링크를 하나 더 넣으면 "exactly one complete test-scope link" 테스트와도 충돌합니다.

## 6. 영향 파일

소스 (4개 플랫폼과 공유 registry)
- /Users/ma-24-007/Desktop/workspace/arc/claude/skill/references/verification.md
- /Users/ma-24-007/Desktop/workspace/arc/codex/skill/references/verification.md (줄 번호가 2줄 앞섬, 문장은 같음)
- /Users/ma-24-007/Desktop/workspace/arc/gemini/skill/references/verification.md
- /Users/ma-24-007/Desktop/workspace/arc/grok/skill/references/verification.md
- /Users/ma-24-007/Desktop/workspace/arc/lib/prompts/agent-fragments.json
- 에이전트 템플릿(`*/agents/arc-tester.*`)은 fragment placeholder로 렌더링되므로 파일은 바뀌지 않습니다. 렌더링 결과만 바뀝니다.

fixture와 테스트 (값은 실제 실행으로 측정한 값만 반영, 손으로 계산하지 않음)
- MANIFEST.sha256: 4개 verification.md와 agent-fragments.json, 5개 항목.
- tests/node/fixtures/installed-layout-golden.json: 플랫폼과 언어별 `skills/arc/references/verification.md`, `agents/arc-tester.*` 해시. 설치 결과에 렌더링된 routing 프로필 해시가 있다면 그것도 포함합니다.
- tests/node/fixtures/instruction-contracts.json:
  - `agentProfileBaseline.profiles`의 tester 프로필 4개만 바뀝니다.
  - `revision` 필드 처리는 기존 관례를 따르고 Tester가 확인합니다.
  - `protected`는 바뀌지 않아야 합니다(role-policy와 템플릿 미변경).
- tests/node/plan.test.mjs `renderingBaseline`: 측정해서 바뀐 키만 갱신합니다.
- tests/node/test-scope-contract.test.mjs 갱신과 추가:
  - 5.2 문단 상수. 4개 플랫폼에서 정확히 일치하고 Command execution 바로 뒤에 오는지 검사합니다.
  - 5.3 문단 상수. 정확히 일치하고 Approved full regression 바로 뒤, CI substitution 앞에 오는지 검사합니다.
  - 'approved full regression follow-up' 테스트의 phrase를 5.1 전체 문장으로 바꿉니다.
  - `profileRules.tester`에 step 1 끝 배치 규칙을 추가합니다. `before: 'Use approved structural/consistency checks for policy/configuration. '`, `after` 없이 `endsWith`로 검사합니다.
  - 선택 사항: `sectionPhrases`에 `shard manifest`를 추가합니다.
- Python 테스트(tests/test_arc_policy.py, tests/test_claude_payload.py, tests/test_harness_contract.py)는 verification.md를 읽습니다. 바뀐 문장을 고정한 곳은 찾지 못했지만 전수 확인하지는 않았으므로 실행해서 확인해야 합니다.

## 7. 수용 기준

- AC1: 4개 verification.md에 5.2 문단이 byte-exact로 정확히 한 번 있고, `**Command execution:**` 문단 바로 뒤에 있습니다. Command execution은 여전히 Final mode 문단 바로 뒤에 있습니다.
- AC2: 4개 verification.md의 Approved full regression 문단 첫 문장이 5.1과 byte-exact로 같고, 문단의 나머지는 HEAD 4d80d208과 같습니다.
- AC3: 4개 verification.md에 5.3 문단이 byte-exact로 정확히 한 번 있고, Approved full regression 바로 뒤, CI substitution 앞에 있습니다.
- AC4: tester fragment step 1이 5.4 문장으로 끝납니다. 4개 플랫폼의 렌더링된 Tester 프로필에 그 문장이 정확히 한 번, step 1 줄 끝에 있습니다. step 2 줄은 기존 기대값과 같습니다.
- AC5: 4개 SKILL.md, limits.md, handoff-prep.md와 lib/policy/role-policy.json, shared/skill/runtime/role-policy.json이 HEAD와 byte 단위로 같습니다. E1/E2 문장이 바뀌지 않았습니다.
- AC6: 퇴역 문구(`retiredPhrases`, `retiredFinalOrderPhrases`)와 `/project suite/i`가 새로 들어가지 않았습니다.
- AC7: fixture 변경은 6절에 적은 항목의 측정값뿐이고, `protected` 해시는 바뀌지 않았습니다.
- AC8: 모든 contract test와 check script를 실행했고, approved base 대비 새 실패가 없습니다. 기존 baseline 실패와 부하성 간헐 실패는 기존 비교 절차로 분류합니다.
- AC9 (한계 명시): 이 기준들은 구조만 증명합니다. 실제 shard 운영, 플랫폼 실행 시간 제한, runner 병렬 옵션 동작은 검증되지 않은 상태로 보고합니다.

## 8. 위험

- R1 workspace 공유 간섭: worktree에 쓰는 테스트나 임시 경로 충돌이 거짓 실패를 낼 수 있습니다.
  - 완화: 같은 shard로 묶기, 시작과 끝의 `git status` 검사, 단독 재실행.
  - 메모리 교훈상 bridge 실행 중에 쓰기가 일어나면 다른 bridge가 refsChanged/changedPaths로 실패할 수 있습니다. 그런 경우는 environment block으로 보고하고 resume 규칙을 따릅니다. 이 상호작용은 측정하지 않았습니다.
- R2 CPU 과다 사용: 여러 shard가 각자 내장 병렬로 돌면 부하성 실패가 늘 수 있습니다.
  - 완화: shard별 병렬도 상한, 실패의 단독 재실행.
- R3 커버리지 누락: runner의 실제 탐색과 inventory가 다를 수 있습니다.
  - 완화: 명시 목록, 파일별 결과 대조, 불완전하면 candidate로 분류.
- R4 슬롯 점유: 대기 중인 현재 Tester도 concurrency를 차지하므로 실제로 쓸 수 있는 shard 수가 5보다 적습니다.
- R5 fixture 연쇄 변경: 해시 fixture를 놓치면 전체 회귀에서 실패합니다. 지난 작업의 교훈입니다.
- R6 비용: 이 저장소에는 기존 실패가 51~55개 있습니다. 모든 실패를 단독 재실행하면 비용이 큽니다. Q4로 줄입니다.
- R7 텍스트만으로는 실제 준수를 증명하지 못합니다.

## 9. 결정된 질문 (사용자 선택: 모두 A)

- Q1 shard 적용 범위:
  - (A, 권장) 승인된 전체 회귀만.
  - (B) final-mode 검사 (1)~(4) 실행에도 적용. B를 고르면 "Final mode runs once ... as one fresh Tester assignment"와 `finalScopeSentence`, 관련 테스트를 바꿔야 합니다.
- Q2 내장 병렬 기본값 범위:
  - (A, 권장) Tester의 모든 여러 파일 suite 명령(task/final).
  - (B) 승인된 전체 회귀만.
- Q3 단독 재실행과 base 재실행 주체:
  - (A, 권장) 모든 shard가 끝난 뒤 현재 final-mode Tester가 한꺼번에 수행.
  - (B) 각 shard Tester가 수행. 다른 shard가 끝날 때까지 대기해야 해서 슬롯과 lease를 차지합니다.
- Q4 unrelated 실패(정적 검사상 관련 경로 변경 없음)의 단독 재실행:
  - (A, 권장) 하지 않음. finding이 아니고 Orchestrator가 처리합니다.
  - (B) 병렬 실행에서 나온 모든 실패를 재실행.
- Q5 shard 없이 Tester 한 명이 내장 병렬로 돌렸을 때의 실패:
  - (A, 권장) 기존 "looks intermittent" 규칙 유지.
  - (B) 모든 실패를 단독 재실행하도록 의무화.
- Q6 shard 결정 권한:
  - (A, 권장) Orchestrator가 판단하고 이유를 기록하며, 알 수 있으면 전체 회귀 승인 요청에 shard 계획을 함께 적음.
  - (B) shard마다 별도 사용자 승인.
- Q7 shard별 runner 병렬도 상한:
  - (A, 권장) 옵션이 있을 때 Orchestrator가 지정해야 함(5.3 문안).
  - (B) 권고로만 둠.

## 10. 후속 계획 메모 (참고, plan 아님)

- 하나로 묶어야 하는 변경: verification.md 4개, fragment, test-scope-contract 갱신, 해시 fixture 측정 반영. 이 변경들은 서로 떼면 테스트가 깨지므로 1개 task로 묶는 것을 권장합니다.
- 공유 모듈(fragment, 4개 플랫폼 reference)을 바꾸므로 trigger (1)이 적용될 가능성이 높습니다.
- final 검증은 모든 contract test와 check script, 그리고 Python 정책 테스트를 포함하는 것을 권장합니다.

## 11. 자체 검토

- 요구 범위: 목표/비목표, byte-exact 문장, 4개 플랫폼과 미러, fixture, 수용 기준, 위험, 미결 질문을 모두 다뤘습니다. brief가 요구한 결정 항목도 4절과 9절에 반영했습니다(shard 범위, 단계별 base/재실행 주체, Reviewer 대기, ledger, 커버리지, 막힌 shard).
- 일관성:
  - 5.1의 기존 고정 부분 문자열 'the current final-mode Tester runs it as a follow-up; no new Tester is assigned'를 유지합니다.
  - 5.2를 Command execution 뒤에 두므로 E2 순서 테스트가 유지됩니다.
  - 5.4는 step 1 끝에 두므로 기존 `profileRules`의 `includes(before+rule+after)`와 step 2 줄 전체 비교가 유지됩니다.
  - 새 문장에는 퇴역 문구와 'project suite'가 없습니다. "MAY split"과 "can run at the same time"은 `MAY run concurrently`와 다릅니다.
- 확인하지 않은 가정:
  - Python 테스트가 바뀐 문장을 고정하지 않는다는 점(일부만 확인).
  - plan.test renderingBaseline이 어떤 키에서 바뀌는지.
  - `agentProfileBaseline.revision` 관례.
  - native 경로의 Tester 시간 제한(측정하지 않아 문안은 bridge 예시만 듦).
  - runner 병렬도 옵션 지원 여부.
- Q1~Q7: 사용자가 모두 (A)를 선택했습니다.
