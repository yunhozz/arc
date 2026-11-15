# 계획 개정을 구현 커밋에 포함 (최초 계획 커밋 amend 폐지) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실행 중 spec/plan 개정을 최초 계획 커밋 amend 대신 이후 수락 커밋에 포함하도록 정책·지침·런타임·테스트를 바꾸고, 런타임 plan-amend를 제거한다.

**Architecture:** 진행 순서는 네 단계다.
1. 정책 원본(`lib/policy`, `lib/prompts`)을 바꾸고 생성기로 생성 섹션, runtime 사본, manifest를 다시 만든다.
2. 수동 지침(claude/codex)을 고친다.
3. 런타임 plan-amend를 지우고 예전 state hold(H-1~H-6)를 추가한다.
4. 운영 문서와 잔여 참조를 정리한다.

`MANIFEST.sha256`, `instruction-contracts.json`, 생성 섹션이 있는 references를 여러 작업이 함께 건드리므로 T1 → T2 → T3 → T4를 엄격히 순차로 진행한다.

**Tech Stack:** Node.js >=22 (`node --test`), Python 3 (`unittest`, pytest 미설치), 저장소 생성 스크립트.

**Spec:** `docs/superpowers/specs/2026-11-16-plan-revision-in-task-commit-design.md` (2026-11-16 승인, sha256 `efa71df171d0f0169dd65e1a03e3339441b72afe4cb8d6fa4b04f9de951e949e`)

## Global Constraints

- **이름과 값**
  - rule id는 `planning.plan-revision`이다. 남은 `planning.plan-amend`는 0개여야 한다.
  - trailer는 `Plan-Revision`, `Plan-Approved-At`, `Plan-Reason`이고 화살표는 ASCII `->`를 쓴다.
  - operations: `["non-progress-spec-plan-content-update","pending-plan-revision-commit"]`
  - evidence: `["non-progress-content-change-classification","actual-approval-chronology","approved-revision-content-hash","plan-revision-trailers"]`
  - rule text는 spec 6.1의 인용문을 그대로 쓴다.
- **런타임 hold 값**
  - H-3: ruleId `cooperative.plan-amend-removed`
    - reason `"Legacy plan-amend intent is no longer supported; inspect Git history and any refs/arc/recovery/* refs manually, then start a new workflow"`
    - nextActions `['inspect-legacy-plan-amend','start-new-workflow']`
  - H-5: ruleIds `['cooperative.plan-amend-removed']`, reason `"Plan-amend operation is no longer supported"`, nextActions `[]`
- **사본 경로**: `.git/arc/handoff/<workflow>/plan-revisions/<평탄화한 gitPath>.v<N>.md`
- **파일 규칙**
  - 생성 섹션(`[ARC role policy: contract begin]`~`end`)은 손으로 고치지 않고 생성기로만 갱신한다.
  - claude/와 codex/ 지침은 같은 의미로 바꾼다.
  - `docs/superpowers/**`에서는 이 spec과 이 plan만 바뀔 수 있다.
  - `refs/arc/recovery/*`는 삭제하지 않는다.
- **유지할 문구**: fresh Implementer 관련 "amendment" 문구와 그 테스트는 유지한다. 위치는 `coordination.md:45,47`, `role.orchestrator-boundary`, `tests/test_arc_policy.py:856,1407,1416`, `tests/test_claude_payload.py:352`, `tests/installer-parity.json`의 `test_plan_amendment_restarts_*`다.
- **커밋 규칙**
  - 커밋 메시지 형식은 `type(scope): 한국어 설명`이다.
  - 상위 작업 하나가 커밋 하나다.
  - 그 작업의 진행 기록(이 plan의 checkbox와 결과)은 같은 커밋에 넣는다.
- **이 plan이 실행 중에 개정될 때**: 이번 작업이 도입하는 새 규칙이 아니라 HEAD ec91fc0 시점의 지침을 따른다.

## Review Focus

1. 예전 state에 미해결 plan-amend intent가 있고 runtime 해시도 바뀐 경우, 결과는 `cooperative.versions`가 아니라 `cooperative.plan-amend-removed`여야 한다. 판정 순서는 T3 테스트로 고정한다.
2. 깨끗한 state에 `prepare` + `operation:'plan-amend'`가 들어오면 예외 없이 allow가 아닌 결과와 고정 문구를 돌려줘야 한다(T3).
3. 수동 지침을 고치다 생성 섹션 안쪽까지 건드리면 drift가 생긴다. T2에서 `check:role-policy`로 막는다.
4. claude와 codex의 지침 의미가 어긋날 수 있다. T2 계약 테스트는 두 adapter에서 각각 실패해야 하고, QA가 diff를 대조한다.
5. 넓은 범위의 치환으로 fresh Implementer "amendment" 문구가 지워질 수 있다(AC-G3). T2와 T4에서 테스트와 grep으로 확인한다.

## 역할 흐름과 순서

- 진행 순서는 T0(baseline) → T1 → T2 → T3 → T4이고, 병렬로 진행하지 않는다.
  - 이유: 공유 파일이 겹친다. `MANIFEST.sha256`과 `instruction-contracts.json`은 T1/T2/T3이 모두 고친다. 생성 섹션이 있는 `references/{planning,handoff-prep,verification,commit}.md`는 T1(생성)과 T2(수동)가 고친다.
- manifest: 각 작업이 커밋 직전에 `node scripts/update-manifest.mjs`로 자기 변경분을 반영한다.
- 작업마다 fresh Implementer를 둔다.
  - fresh QA는 T1, T2, T3에 둔다. T2를 넣은 이유는 지침 의미, 앵커와 링크, parity를 기계 검사만으로는 증명할 수 없기 때문이다.
  - T4는 위험이 낮아 QA를 두지 않고 Orchestrator가 검사 결과를 직접 확인한다.
- 작업 흐름: Implementer → (QA와 필요한 재검사) → Orchestrator 수락 → 그 작업의 커밋 하나.
- 모든 작업이 수락된 뒤 최종 검증(F)과 최종 Reviewer 1회를 진행한다. Reviewer 지적은 Implementer → Reviewer 재확인 순서로 처리하고 후속 커밋 하나로 마무리한다.

## 공통 검사 명령

| 이름 | 명령과 메모 |
|---|---|
| N-ALL | `node --test --test-reporter=tap tests/node/*.test.mjs > <out>/node.tap; echo $?` |
| P-ALL | `python3 -B -m unittest discover -v -s tests -p 'test_*.py' 2> <out>/py.txt; echo $?` |
| 실패 집합 | node는 `^not ok` 줄(테스트 이름과 파일 단위 실패), python은 `... (FAIL\|ERROR)$` 줄과 import 실패 |
| G-POL | `node scripts/update-role-policy.mjs --check` |
| G-RT | `node scripts/update-runtime-assets.mjs --check` |
| G-MAN | `node scripts/update-manifest.mjs --check` |
| G-PAR | `node scripts/check-installer-parity.mjs`. 최종 검증에서는 `--complete`를 붙인다. |

- 생성 명령의 실행 순서는 `node scripts/update-role-policy.mjs` → `node scripts/update-runtime-assets.mjs` → `node scripts/update-manifest.mjs`다.
- runtime-assets는 `lib/policy/role-policy.json`도 `shared/skill/runtime/`으로 복사한다.
- manifest 범위에 `tests/`와 `docs/`는 들어가지 않는다.

---

### T0: baseline 기록 (커밋 없음)

**목적:** AC-T2의 비교 기준을 만든다. 코드 기준은 HEAD ec91fc0이다(계획 문서 커밋은 코드를 바꾸지 않는다).
**담당:** Orchestrator. 파일은 수정하지 않는다. 출력은 `.git/arc/handoff/wf-plan-revision-commit/baseline/`에 둔다.
**실행 환경:** 2026-11-16 사용자 결정. 워크트리에서 `npm ci`와 `npm run build:native`를 실행한 뒤 baseline과 이후 검증을 모두 같은 환경에서 돌린다.
**선행:** plan 승인, 계획 문서 커밋

- [x] HEAD, 브랜치, `git status`, node/python 버전, `node_modules`와 `build` 유무를 기록한다.
- [x] N-ALL과 P-ALL을 실행하고 실패 집합(테스트 ID 목록과 파일 단위 실패 목록)을 저장한다.
- [x] G-POL, G-RT, G-MAN, G-PAR, `G-PAR --complete`의 종료 코드와 출력을 저장한다.
- [x] 결과: 실패 수, 파일 단위 실패 파일 목록, 그 때문에 검증되지 않는 범위를 적는다.

**T0 결과 (2026-11-16)**
- 환경: HEAD fe76d07(코드 기준 ec91fc0과 같음), 브랜치 fix/plan-revision-in-task-commit, clean. node v22.18.0, Python 3.15.2. 워크트리에서 `npm ci`와 `npm run build:native`를 실행했다.
- N-ALL: pass 2027, fail 38. 파일 단위 실패는 없다. 실패 항목은 설치, packed, rendering baseline 계열이다.
- P-ALL: 251 tests, failures=551, errors=7. 실패/오류 줄은 557개로, test_arc_policy 338, test_claude_payload 120, test_harness_contract 98, test_codex_models 2다.
  - `policy_contract_failures`는 baseline에서 이미 133개 패턴을 놓친다. `PLAN_UPDATE_CLASSIFICATION`도 포함된다.
  - 그래서 python 계약 테스트는 개별 ID 기준으로만 비교하고, 새 `PLAN_*` 계약은 따로 확인한다.
- G-POL, G-RT, G-MAN, G-PAR: verified. `G-PAR --complete`: exit 1(packed 3개 fail).
- 원본 출력: `.git/arc/handoff/wf-plan-revision-commit/baseline/`

### T1: 정책 원본 교체

**목표:** `planning.plan-amend`를 `planning.plan-revision`(spec 6.1)으로 바꾼다. projection, profile Preservation 문구, 생성물, fixture, manifest도 함께 맞춘다.
**선행:** T0

**Files (allowedPaths):**
- `lib/policy/role-policy.json`
  - 339-360: id, operations, evidence, text 교체. roles, effect, authority, controls는 유지한다.
  - 107: "Exclude other tasks"를 "Exclude other tasks; pending approved spec/plan revisions follow planning.plan-revision"으로 바꾼다.
- `lib/policy/placement.mjs:6,8,9,10`
- `lib/prompts/agent-fragments.json:14`: `common.preservation-choice-inspection`에서 "This does not prohibit only Orchestrator’s original planning-document commit amendment … rewrite history generally. " 문장 전체를 삭제한다.
- `tests/node/role-policy.test.mjs`
- `tests/node/fixtures/instruction-contracts.json`
  - `agentProfileBaseline.profiles` 해시
  - `protected`의 `lib/policy/role-policy.json`과 `shared/skill/runtime/role-policy.json` 해시. 승인 범위 안의 기계적 갱신이다.
- 생성물
  - `{claude,codex}/skill/references/{planning,handoff-prep,verification,commit}.md`의 생성 섹션
  - `shared/skill/runtime/role-policy.json`
  - `MANIFEST.sha256`
- 변경 예상 없음: `claude/agents/*`, `codex/agents/*`, `*/skill/SKILL.md`. 생성기가 이 파일들을 바꾸면 중지하고 보고한다.
- `tests/node/fixtures/installed-layout-golden.json` (v2 추가): 설치 결과 해시 fixture. `node tests/node/fixtures/installed-layout.mjs --diff`로 차이를 확인한 뒤 `--write`로 다시 만든다. 차이는 이 작업이 바꾼 설치 파일(생성 섹션 문서, runtime role-policy 사본, fragment로 렌더되는 agent profile)에서만 나야 한다.

**Interfaces:** T2와 T3은 rule id `planning.plan-revision`과 projection 4곳(planning, preparation, verification, commit)을 쓴다.

- [x] **Step 1 (실패 테스트):** `role-policy.test.mjs`를 고친다.
  - 35-39행 기대값을 `'planning.plan-revision'`으로 바꾼다.
  - 155행을 `/\[planning\.plan-revision\]/`로 바꾼다.
  - 새 테스트 `plan-revision rule replaces plan-amend with approved operations and evidence`를 추가한다. 단언은 다음과 같다.
    - plan-amend가 없다.
    - operations와 evidence가 Global Constraints와 deepEqual이다.
    - roles, effect, authority가 유지된다.
    - text에 `/Plan-Revision, Plan-Approved-At and Plan-Reason trailers/`와 `/NEVER amend or rewrite planning or implementation commits/`가 있다.
    - `git.orchestrator-accept-commit` text에 새 문구가 있다.
- [x] **Step 2:** `node --test tests/node/role-policy.test.mjs`를 실행한다. 기대 결과: FAIL.
- [x] **Step 3:** `role-policy.json`, `placement.mjs`, `agent-fragments.json`을 고친다.
- [x] **Step 4:** 생성 명령 3개를 순서대로 실행한다. `git diff --stat`으로 바뀐 파일이 목록 안에만 있는지 확인한다.
- [x] **Step 5:** fixture 해시를 갱신한다.
  - profile 해시는 target마다 `renderAgentProfile(target.path, source, registry)` 결과의 sha256이다(`agent-fragments.test.mjs`와 같은 계산).
  - `protected`는 파일 바이트의 sha256이다.
- [x] **Step 6:** 대상 테스트를 실행한다. 기대 결과: PASS(baseline 예외 제외).
  ```
  node --test tests/node/role-policy.test.mjs tests/node/agent-fragments.test.mjs tests/node/instruction-layout.test.mjs tests/node/runtime-assets.test.mjs
  ```
- [x] **Step 7:** G-POL, G-RT, G-MAN이 verified인지 확인한다. N-ALL과 P-ALL 실패 집합이 baseline의 부분집합이어야 한다. python 계약 테스트가 새로 실패하면 중지하고 보고한다.
- [x] **Step 8:** 진행 기록을 적는다. 커밋 메시지는 `refactor(policy): planning.plan-amend를 planning.plan-revision으로 교체`.

**수락 기준:** AC-P1, AC-P2, AC-P3(T1 시점), AC-P4, AC-T1(role-policy 부분), AC-T2(T1 시점)
**필요 검사:** Step 6과 Step 7, fresh QA
- QA 확인 항목: rule text가 spec 6.1과 같은지, 생성 diff가 생성 섹션 안에만 있는지, fragment에서 삭제한 범위가 정확한지.

**T1 결과 (2026-11-16, 수락)**
- Implementer 1차: Step 1-6을 수행했다. RED는 role-policy 테스트 3개 FAIL, GREEN은 25/25 PASS. sandbox 안의 N-ALL은 끝나지 않아 판정에서 뺐다.
- 같은 환경 재실행에서 새 실패 `installed-layout-golden`이 확인되었다. 원인은 파일 목록에서 빠진 fixture였다. plan v2 개정으로 파일을 추가했고(사용자 승인, 분류 mechanical), Implementer 2차(새 인스턴스)가 `--diff` 확인 뒤 `--write`로 갱신했다. golden 4/4 PASS.
- Orchestrator 전체 실행: N-ALL pass 2029, fail 37. 새 실패 0, 사라진 baseline 실패 1(`expands all approved profile templates…`). P-ALL은 baseline과 같다(새 0, 사라짐 0). G-POL, G-RT, G-MAN verified.
- QA(새 인스턴스)
  - 1·5번 외 항목은 proven.
  - 지적 1(낮음): `role-policy.test.mjs:57`의 `planning.plan-amend`는 Step 1이 지정한 부재 단언이므로 의도된 참조다. 처리: 변경 없음. T4 잔여 grep 때 함께 다룬다.
  - 지적 5: `instruction-contracts.json` 전체 검사 실패는 baseline부터 있던 `operations.mjs` 해시 불일치다. T3에서 갱신한다.
- 판정: AC-P1 proven, AC-P2 proven, AC-P3(T1) proven, AC-P4 proven, AC-T1(role-policy) proven, AC-T2(T1) proven(새 실패 0).

### T2: 지침 변경 (claude/codex)

**목표:** spec 5절에서 생성 섹션과 harness-operation을 뺀 항목을 양쪽 adapter에 같은 의미로 반영한다. R-1~R-12를 지침에 넣고 python 계약 테스트와 fixture contract 문구를 맞춘다.
**선행:** T1

**Files (allowedPaths):**
- `{claude,codex}/skill/SKILL.md`: 29행 Preservation rule과 바뀐 앵커로 가는 링크
- `{claude,codex}/skill/references/planning.md` (113, 116-126)
- `{claude,codex}/skill/references/handoff-prep.md`
  - 75행
  - 81-90행: 앵커 `execution-time-plan-revision`, 제목 `### Execution-time plan revision`, 5단계 절차
- `{claude,codex}/skill/references/commit.md` (9, 22, 24, 28-35)
- `{claude,codex}/skill/references/verification.md` (50-55: 앵커 `evidence-after-plan-revision-commit`)
- `{claude,codex}/skill/references/handoff.md`: cooperative 섹션에 task.paths 요건과 R-7(3) 미지원을 적은 문장 하나를 추가한다(D2, D3).
- `tests/test_harness_contract.py:17-41`, `tests/test_arc_policy.py:307`
- `tests/node/fixtures/instruction-contracts.json`
  - "Shared terms" Preservation 문구
  - "Automatic commit after plan-task acceptance" 문구
  - 그 밖에 바뀐 contract text. coordination의 fresh Implementer 문구는 유지한다.
- `MANIFEST.sha256`
- `tests/node/fixtures/installed-layout-golden.json` (v2 추가): T1과 같은 방법(`--diff` 확인 뒤 `--write`)으로 이 작업이 바꾼 설치 파일만 반영한다.
- 범위 밖: 생성 섹션 내부, `git-recovery.md`, `coordination.md`

**Interfaces:** T4가 쓰는 앵커는 `execution-time-plan-revision`, `evidence-after-plan-revision-commit`, `plan-updates-during-execution`(유지), `execution-time-plan-document-updates`(유지)다.

- [x] **Step 1 (실패 테스트):** `test_harness_contract.py`를 고친다.
  - `PLAN_UPDATE_CLASSIFICATION` 22-26행을 다음 정규식으로 바꾼다. 18-21행은 유지한다.
    - `mechanical.*(?:correction|fix).*plan revision`
    - `first top-level task.*executed or reconfirmed.*revised version`
    - `no.*implementation work remains.*standalone .?docs\(plan\).? closing commit`
    - `no separate.*docs.*fixup commit`
    - `actual approval.*(?:time|chronology).*not.*retroactive`
    - `never amend.*(?:planning|plan).*implementation commits`
  - `PLAN_AMEND_SAFETY`를 `PLAN_REVISION_COMMIT`(handoff-prep)으로 바꾼다.
    - `pending revision.*content hash.*approval`
    - `plan-revisions/.*\.v<?n>?\.md`
    - `brief.*orchestrator-owned.*pending revision`
    - `exclude.*revision hunks.*hold.*unsafe`
    - `plan-revision: .* -> `
  - `PLAN_AMEND_EVIDENCE`를 `PLAN_REVISION_EVIDENCE`(verification)로 바꾼다.
    - `committed.*blob.*latest approved.*content hash`
    - `only.*progress records`
    - `no pending revision`
    - `contract revision.*affected.*checks.*rerun|rerun.*affected.*checks`
  - `test_arc_policy.py:307`을 `"execution-time plan revision"`으로 바꾼다.
  - 정규식 문구는 실제 영문 지침에 맞춰 조정할 수 있다. 다만 R 항목마다 정규식을 하나 이상 두고 의미를 줄이지 않는다.
- [x] **Step 2:** `python3 -B -m unittest tests.test_harness_contract tests.test_arc_policy -v`를 실행한다. 기대 결과: 바뀐 항목이 FAIL.
- [x] **Step 3:** spec 5절대로 claude 지침을 고치고 codex에 같은 의미로 반영한다. commit.md에는 "NEVER amend planning or implementation commits"를 넣는다.
- [x] **Step 4:** 앵커와 링크를 확인한다.
  - claude/skill과 codex/skill에서 `execution-time-plan-amendment|evidence-after-plan-history-rewrite|planning-document commit amendment|old→new`를 grep한 결과가 0건이어야 한다.
  - 새 앵커는 각각 하나씩 있어야 하고, 들어오는 링크가 유효해야 한다.
- [x] **Step 5:** fixture contract 문구를 맞추고 `node --test tests/node/instruction-layout.test.mjs`를 실행한다.
- [x] **Step 6:** G-POL을 실행한다(drift 0). 이어서 `node scripts/update-manifest.mjs`와 G-MAN을 실행한다.
- [x] **Step 7:** 다음이 PASS여야 한다(baseline 예외 제외): Step 2의 python 명령, `instruction-layout.test.mjs`, `agent-fragments.test.mjs`. P-ALL과 N-ALL은 baseline의 부분집합이어야 한다. `test_plan_amendment_restarts_implementer`와 `test_claude_payload.py`가 계속 통과해야 한다(AC-G3).
- [x] **Step 8:** 진행 기록을 적는다. 커밋 메시지는 `docs(skill): 실행 중 계획 개정을 이후 수락 커밋에 포함하도록 지침 변경`.

**수락 기준:** AC-G1, AC-G2, AC-G3, AC-P3, AC-T1(python 부분), AC-T2(T2 시점)
**필요 검사:** Step 4, 6, 7과 fresh QA
- QA 확인 항목: R-1~R-12 대응표, claude와 codex의 의미가 같은지, 링크와 앵커, 생성 섹션을 건드리지 않았는지, 한쪽 adapter에서 계약을 빼면 테스트가 실패하는지.

**T2 결과 (2026-11-16, 수락)**
- Implementer: Step 1-7을 수행했다.
  - 대상 계약 누락: RED claude/codex 6/6, 9/9, 6/6 → GREEN 0/0.
  - 대상 mutation 하위 검사 70개 통과.
  - golden fixture는 plan v2 방법으로 갱신했다.
- 실행 기록 정리: dispatch에 `permission_violation_observed`(refsChanged)가 기록되었다. 실행 중 다른 세션이 `feat/tui-arc-diagram-flow` ref를 커밋하고 push한 것이 원인이다. 변경 경로는 모두 허용 범위 안이고 작업 브랜치 HEAD도 그대로였다. 외부 동시 작업으로 보고 문제로 삼지 않았다.
- QA(새 인스턴스) 지적(중간): 새 PLAN_* 정규식이 R-7(3), R-11, R-10 진행 기록 판정 문장의 단독 삭제를 탐지하지 못했다.
  - 같은 Implementer가 정규식의 문장 경계를 좁혔다. 문장 단위 삭제 실험 58건의 미탐지가 18건에서 0건이 되었고, 지침 문장은 바꾸지 않았다.
  - 같은 QA가 독립 실험으로 재검사했고 proven.
- 같은 QA가 AC-G3을 확인했다: `test_plan_amendment_restarts_implementer`는 baseline과 같은 실패이고, 새 실패는 없다.
- 검사 결과
  - Orchestrator N-ALL: pass 2029, fail 37, 새 실패 0. 이후 수정은 python 테스트 파일뿐이었다.
  - P-ALL: baseline과 같다(새 0, 사라짐 0).
  - G-POL, G-MAN verified. golden 4/4.
- 판정: AC-G1, AC-G2, AC-G3, AC-P3, AC-T1(python), AC-T2(T2) 모두 proven. python 계약 전체 통과가 아니라 대상 계약 기준이다.

### T3: 런타임 plan-amend 제거와 예전 state 처리

**목표:** spec 6.2의 삭제 항목을 반영하고 H-1~H-6을 구현하고 테스트로 증명한다. runtime 사본, manifest, fixture 해시를 갱신한다.
**선행:** T1, T2 (파일 겹침으로 순차 진행)

**Files (allowedPaths):**
- `lib/runtime/operations.mjs`, `cooperative-schema.mjs`, `evaluate.mjs`, `cooperative.mjs`, `git-evidence.mjs`
- 생성물: `shared/skill/runtime/{operations,cooperative-schema,evaluate,cooperative,git-evidence}.mjs`, `MANIFEST.sha256`
- 삭제: `tests/node/runtime-plan-amend.test.mjs` (다른 등록처는 없다)
- 생성: `tests/node/runtime-legacy-plan-amend.test.mjs`
- `tests/node/fixtures/instruction-contracts.json`의 `protected`: `lib/runtime/{evaluate,operations,git-evidence}.mjs`와 shared 사본, 해시 6개. 승인 범위 안의 기계적 갱신이다.
- `tests/node/fixtures/installed-layout-golden.json` (v2 추가): T1과 같은 방법으로 이 작업이 바꾼 runtime 설치 파일만 반영한다.
- `tests/node/runtime-versions.test.mjs` (v3 추가): 런타임 모듈 바이트 합산 해시 `baselineHash`를 새 값으로 갱신한다. `e472406`의 선례를 따라 버전 라벨 `cooperative-9`, `historicalRuntimeHash`, `previousRuntimeHash`는 바꾸지 않는다.
- 범위 밖: `lib/runtime/acceptance.mjs`, `bootstrap.mjs`, `store.mjs`

**Interfaces:**
- 유지: `evaluateCooperative`, `runCooperativeCommand`
- 제거: `readPlanAmendGit` 매개변수, `readPlanAmendGitEvidence`, `validatePlanAmendArguments`
- 판정 위치: `evaluateCooperative`에서 state/command 검증이 성공한 직후, policy 검사보다 앞
  1. H-3: `state.intents.some(i=>i.operation==='plan-amend'&&['prepared','unknown','mismatch','failed'].includes(i.status))`이면 hold
  2. H-5: `request.command==='prepare'&&request.input?.operation==='plan-amend'`이면 hold

- [x] **Step 1 (실패 테스트):** `runtime-legacy-plan-amend.test.mjs`를 작성한다.
  - state 준비: `initializeCooperativeWorkflow`로 만든 state에 legacy 필드와 intent를 직접 써 넣는다. intent는 공통 필드만 갖는다: `requestId`, `status`, `fingerprint`, `operation:'plan-amend'`, `arguments:{}`.
  - H-1: 형식이 틀린 `planAmendments`와 `planAmendObservations`가 있어도 `cooperative.schema` hold가 나지 않는다. 상태를 바꾸는 명령 뒤에도 두 키가 보존된다.
  - H-2: `succeeded`이고 `arguments:{}`인 intent는 통과한다. fingerprint가 없는 intent는 `cooperative.schema` hold다.
  - H-3
    - status 4종 × 명령 `status`, `record`, `prepare`(operation `accept`), `result`
    - 모두 hold이고 ruleIds, reason, nextActions가 Global Constraints와 같다.
    - versions, target, policy를 다르게 줘도 같은 결과여야 한다.
  - H-4: `succeeded`와 `cancelled` intent는 결과에 영향이 없다.
  - H-5
    - `assert.doesNotReject`로 호출한다.
    - allow가 아니고 ruleIds와 reason이 고정 값과 같다.
    - arguments가 `undefined`일 때와 `{}`일 때 모두 같다.
  - H-6
    - 임시 git repo에 `refs/arc/recovery/legacy`를 만든다. 명령을 실행한 뒤 ref와 legacy intent가 그대로 남아 있다.
    - 정적 검사: `lib/runtime`과 `shared/skill/runtime` 원문에 `update-ref`, `planAmend`가 없다. `refs/arc/recovery`는 H-3 문구에만 있다.
- [x] **Step 2:** `node --test tests/node/runtime-legacy-plan-amend.test.mjs`를 실행한다. 기대 결과: H-3, H-5, H-6이 FAIL.
- [x] **Step 3:** `tests/node/runtime-plan-amend.test.mjs`를 삭제한다.
- [x] **Step 4:** 6.2 삭제 항목과 판정 2개를 구현하고, 쓰이지 않는 helper와 import를 정리한다.
- [x] **Step 5:** `node scripts/update-runtime-assets.mjs`를 실행하고 fixture `protected` 해시 6개를 갱신한다. 이어서 `node scripts/update-manifest.mjs`를 실행한다.
- [x] **Step 6:** 대상 테스트를 실행한다. 기대 결과: PASS(baseline 예외 제외, AC-R4 포함).
  ```
  node --test tests/node/runtime-legacy-plan-amend.test.mjs tests/node/runtime-cooperative.test.mjs tests/node/runtime-acceptance.test.mjs tests/node/runtime-evaluate.test.mjs tests/node/runtime-schema.test.mjs tests/node/runtime-git-evidence.test.mjs tests/node/runtime-workflow.integration.test.mjs tests/node/runtime-assets.test.mjs tests/node/instruction-layout.test.mjs
  ```
- [x] **Step 7:** G-RT, G-MAN, G-POL, G-PAR을 확인한다.
  - runtime 경로에서 `plan-amend|planAmend|PlanAmend|readPlanAmendGit|refs/arc/recovery`를 grep한 결과는 의도된 예외 줄만 남아야 한다. 예외 줄 목록을 기록한다.
  - N-ALL과 P-ALL은 baseline의 부분집합이어야 한다.
- [x] **Step 8:** 진행 기록을 적는다. 커밋 메시지는 `refactor(runtime): plan-amend 런타임 제거와 예전 state 보류 처리`.

**수락 기준:** AC-R1, AC-R2, AC-R3, AC-R4, AC-T1(node 부분), AC-T2(T3 시점)
**필요 검사:** Step 6, 7과 fresh QA
- QA 확인 항목: H-3 판정 위치, 예외 경로에서 죽지 않는지, 남은 dead code, shared 사본과의 일치.

**T3 결과 (2026-11-16, 수락)**
- Implementer: Step 1-7을 수행했다.
  - RED는 28개 모두 FAIL, GREEN은 H-1~H-6 28개 PASS.
  - 판정 순서(`evaluate.mjs`): schema 125 → H-3 126 → H-5 127 → policy 128.
  - 잔여 grep은 의도된 예외 6줄(evaluate.mjs H-3/H-5, cooperative.mjs 조기 반환, lib와 shared 각각)이다.
  - G-RT, G-MAN, G-POL, G-PAR verified. golden은 runtime 5개 × 8조합만 갱신했다.
- Orchestrator N-ALL에서 새 실패 3개(`runtime-versions.test.mjs`의 런타임 해시 고정)가 나왔다.
  - plan v3 개정(mechanical, 사용자 위임에 따른 Orchestrator 승인)으로 파일을 추가했다.
  - 새 Implementer가 `baselineHash`만 갱신했다(선례 e472406, 버전 라벨 유지). 6/6 PASS.
- Git 통합(`ARC_RUN_GIT_INTEGRATION=1`): 77개 중 76개 통과. 남은 실패 `cooperative CLI verifies exact approved document commit…`은 원본 master ec91fc0에서도 같은 실패다(baseline).
- 최종 N-ALL: pass 2003, fail 37. 새 실패 0, 사라진 baseline 실패 1. 통과 수 감소는 `runtime-plan-amend.test.mjs` 삭제 때문이다. P-ALL은 baseline과 같다.
- QA(새 인스턴스)
  - 항목 1·2·3·4·6 proven.
  - 항목 5(정상 흐름)·7(지정 묶음)은 baseline 실패 때문에 unverified/unmet으로 남겼다.
  - 같은 QA 재검사에서 해시와 G-POL proven. 통합 테스트 실패는 기존 실패로 분류했다.
- 판정: AC-R1 proven, AC-R2 proven, AC-R3 proven, AC-R4 proven(통합 실패는 baseline과 같음), AC-T1(node) proven(남은 실패는 모두 baseline), AC-T2(T3) proven.

### T4: 운영 문서와 잔여 참조 정리

**목표:** `docs/harness-operation.md:220`을 R-1, R-7, R-9, R-11 요약으로 바꾸고, spec 7절의 잔여 grep을 기준에 맞춘다.
**선행:** T2, T3

**Files (allowedPaths):** `docs/harness-operation.md`. 다른 파일에서 잔여 참조가 나오면 고치지 않고 Orchestrator에게 보고한다.

- [ ] **Step 1:** 220행을 교체하고, 바뀐 앵커를 가리키는 링크를 고친다.
- [ ] **Step 2:** `docs/superpowers/**`를 뺀 저장소 전체에서 잔여 grep을 실행한다. 허용되는 예외는 `tests/node/runtime-legacy-plan-amend.test.mjs`와 evaluate.mjs의 H-3 문구 및 ruleId(lib, shared)다. 예외 목록과 그 밖의 결과 0건을 기록한다.
- [ ] **Step 3:** `git diff --stat ec91fc08ded203d3d95df2faff78eabb73c7335a -- docs/superpowers`를 실행한다. 이 spec과 이 plan만 나와야 한다(AC-D2).
- [ ] **Step 4:** `python3 -B -m unittest tests.test_harness_contract tests.test_arc_policy -v`를 실행한다. 진행 기록을 적는다. 커밋 메시지는 `docs(harness): 계획 개정 규칙 요약으로 운영 문서 갱신`.

**수락 기준:** AC-D1, AC-D2, AC-T1(잔여 grep)
**필요 검사:** Step 2, 3, 4. QA 없이 Orchestrator가 직접 확인한다.

---

## F. 최종 검증 (모든 작업 수락 뒤, 커밋 없음)

- [ ] T0과 같은 환경에서 N-ALL과 P-ALL을 실행한다. 실패 집합이 baseline의 부분집합이고 새 실패가 0개여야 한다(AC-T2).
- [ ] G-POL, G-RT, G-MAN, `G-PAR --complete`를 실행하고 baseline과 비교한다.
- [ ] 잔여 grep과 AC-D2 diff를 다시 확인한다.
- [ ] 최종 Reviewer가 ec91fc0..HEAD 전체 변경을 1회 검토한다. 중점은 AC 전체, Review Focus, R-1~R-12 대응, parity다.
- [ ] Reviewer 지적은 Implementer → Reviewer 재확인 순서로 처리하고, 해소된 뒤 후속 커밋 하나를 만든다.

## 완료 체크리스트

- [ ] T0 baseline 기록 (환경 조건 포함)
- [ ] T1 수락과 커밋 (QA 통과)
- [ ] T2 수락과 커밋 (QA 통과)
- [ ] T3 수락과 커밋 (QA 통과)
- [ ] T4 수락과 커밋
- [ ] F 최종 검증 통과, 최종 Reviewer 지적 해소
- [ ] 대기 중인 plan 개정 없음, 모든 진행 기록이 각 작업 커밋에 포함됨
- [ ] AC-P1~P4, AC-G1~G3, AC-R1~R4, AC-T1~T2, AC-D1~D2 전부 증거 연결

## 개정 이력

| 버전 | 승인 시각 | 분류 | 영향 작업 | 사유 |
|---|---|---|---|---|
| v1 | 2026-11-16 (plan 승인, 커밋 fe76d07) | 최초 승인 | 전체 | - |
| v2 | 2026-11-16 (T1 실행 중 사용자 승인) | mechanical | T1, T2, T3 | 설치 결과 해시 fixture `installed-layout-golden.json`이 파일 목록에서 빠져 T1에서 golden 테스트가 새로 실패함. 갱신 방법과 함께 추가. 사용자 결정에 따라 이 개정은 T1 커밋에 넣는다. |
| v3 | 2026-11-16 (T3 실행 중, 사용자가 위임한 Orchestrator 승인) | mechanical | T3 | 런타임 해시 고정 테스트 `runtime-versions.test.mjs`가 파일 목록에서 빠져 N-ALL에서 새 실패 3개가 생김. `baselineHash`만 갱신하는 항목을 추가. T3 커밋에 넣는다. |
