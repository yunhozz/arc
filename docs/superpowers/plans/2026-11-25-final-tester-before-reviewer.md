# 최종 Tester 완료 후 최종 Reviewer 순차 실행 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

- 상태: plan v3 (v1 2026-11-25 사용자 승인; v2는 final verification 새 실패 수정 T2 추가, 2026-11-25 사용자 승인; v3는 최종 Reviewer non-blocking finding 수정 T3 추가, 2026-11-25 사용자 fix 결정). T1·T2·T3 수락 완료(2026-11-25)
- Spec: `docs/superpowers/specs/2026-11-25-final-tester-before-reviewer-design.md` v2 (2026-11-25 사용자 승인)
- 실행 대상: `/Users/ma-24-007/Desktop/workspace/arc`, 브랜치 `chore/final-tester-before-reviewer`, base `d15e3d2595e666e3a8becf523e7a03f691f3305a`
- 경로: Architectural

## 개정 이력

| 버전 | 일자 | 분류 | 사유 | 영향 task | 승인 |
|---|---|---|---|---|---|
| v1 | 2026-11-25 | 최초 | spec v2 구현 계획(T1) | T1 | 사용자 승인 |
| v2 | 2026-11-25 | 범위 추가 | final verification 새 실패(`plan.test.mjs` 렌더링 baseline 8건) 수정 T2 추가 | T2 | 사용자 승인. `dc8e4192`에 커밋됐으나 당시 이 표의 행과 `Plan-*` trailer가 빠져 있어 v3 커밋에서 보완 기록함 |
| v3 | 2026-11-25 | 범위 추가 | 최종 Reviewer non-blocking finding(만료된 full regression 승인, R13)과 재확인 N1(R14) 수정 T3 추가. R13·R14는 spec v2의 R1–R12 밖 문안이며 사용자 fix 결정으로 생긴 범위임 | T3 | 사용자 fix 결정 2건 |

**Goal:** 최종 Reviewer가 final-mode Tester 작업이 끝난 뒤에만 시작하도록 4개 플랫폼의 정책 문안, 관리 규칙, agent fragment를 순차 규칙으로 바꿉니다. 계약 테스트, fixture, 생성물, MANIFEST도 이 변경에 맞춰 갱신합니다.

**Architecture:** top-level task는 T1 하나입니다. spec R1–R12에 해당하는 원천 파일을 고치고, 생성 스크립트로 관리 섹션과 런타임 사본을 다시 만든 뒤 fixture 해시와 MANIFEST를 다시 계산합니다. 정책·profile·테스트·manifest 계약은 서로 묶여 있어 나눌 수 없습니다(`planning.md` "Inseparable policy/profile/tests/manifest contracts start in one task").

**Tech Stack:** Node.js ESM(`node --test`), Python 3 `unittest`, JSON, Markdown/TOML 문서

## Global Constraints

- R1–R12의 영문 문안은 spec §5를 한 글자도 바꾸지 않고 씁니다. 4개 플랫폼에 같은 문장을 넣습니다. codex `verification.md`는 줄 번호가 2만큼 앞섭니다.
- 다음 비목표 대상은 바꾸지 않습니다(AC9).
  - no-plan 규칙과 task mode 규칙
  - final mode의 범위·trigger·baseline·결과 비교 규칙
  - 최종 Reviewer 수정 루프와 unrelated failure를 처분하는 시점
  - role-policy 구조 필드, `review.significant-plan`, `planner.commit-boundary` fragment
  - `*/skill/references/commit.md`, 런타임 코드(`lib/runtime/**` 등), 기존 `docs/superpowers/**`
- Python은 항상 `PYTHONDONTWRITEBYTECODE=1`을 붙여 실행합니다.
- Implementer와 Tester는 Git 상태를 바꾸지 않습니다. stage와 commit은 Orchestrator만 합니다.
- Implementer는 Codex bridge로 sandbox 안에서 실행합니다. allowedPaths는 아래에 적은 정확한 파일 목록입니다.
- 전체 suite와 실제 CLI 실행은 Orchestrator가 host에서 합니다. bridge가 실행되는 동안에는 ref를 움직이지 않습니다.
- 커밋 메시지는 `type(scope): 한국어 설명` 형식입니다. T1 하나에 focused commit 하나를 만들고, spec과 이 plan 문서를 같은 commit에 넣습니다.
- plan-level 기록은 handoff 기록에 남깁니다. 기록만을 위한 closing commit은 만들지 않습니다.

## Review Focus (최종 Reviewer)

| # | 확인할 것 | 근거 |
|---|---|---|
| 1 | 4개 플랫폼 문안이 R1–R12와 바이트 단위로 같고, 더 이상 도달할 수 없는 문구가 남아 있지 않다 | AC1–AC6 |
| 2 | R10 구조 필드가 바뀌지 않았고, 관리 섹션 생성 대상 전부에 반영됐다 | AC4 |
| 3 | fixture 해시(`agentProfileBaseline` 20개, `protected` 12개, golden) 변경이 의도한 파일에만 있다 | AC7, AC8 |
| 4 | 비목표 대상, 런타임 코드, 기존 기록이 그대로다 | AC9 |

## 파일 구조

| 영역 | 파일 | 변경 |
|---|---|---|
| 플랫폼 문서 | `{claude,codex,gemini,grok}/skill/references/verification.md` | R1–R7 직접 편집 + 관리 섹션 재생성 |
| | `{…}/skill/SKILL.md` | R8 |
| | `{…}/skill/references/planning.md` | R9 직접 편집 + 관리 섹션 재생성 |
| 관리 섹션(생성) | `{…}/skill/references/handoff.md` | 재생성만 |
| | `{claude,gemini,grok}/agents/arc-*.md`, `codex/agents/arc-*.toml` | 재생성만 |
| policy 원천 | `lib/policy/role-policy.json` | R10 |
| fragment 원천 | `lib/prompts/agent-fragments.json` | R11, R12 |
| 런타임 사본(생성) | `shared/skill/runtime/role-policy.json` | `update-runtime-assets.mjs` 결과 |
| 계약 테스트 | `tests/node/test-scope-contract.test.mjs` | 기대값, 배치, retired 문구 부재 검증 |
| fixture | `tests/node/fixtures/instruction-contracts.json` | R3·R4·R8 원문, `agentProfileBaseline.profiles` 20개, `protected` 12개 |
| | `tests/node/fixtures/installed-layout-golden.json` | 설치 해시 재생성 |
| 생성물 | `MANIFEST.sha256` | 마지막에 재생성 |

---

### Task T1: 최종 Reviewer 순차 규칙 반영 (정책·profile·테스트·manifest)

**목표:** spec R1–R12를 4개 플랫폼에 반영하고, 생성물과 fixture를 원천에서 다시 만듭니다. final Tester 작업의 종결 조건 5가지(spec §2)를 Final mode 문단과 R10에 명시합니다.

**Files (allowedPaths, 정확히 43개 파일):**

```
claude/skill/SKILL.md
claude/skill/references/verification.md
claude/skill/references/planning.md
claude/skill/references/handoff.md
codex/skill/SKILL.md
codex/skill/references/verification.md
codex/skill/references/planning.md
codex/skill/references/handoff.md
gemini/skill/SKILL.md
gemini/skill/references/verification.md
gemini/skill/references/planning.md
gemini/skill/references/handoff.md
grok/skill/SKILL.md
grok/skill/references/verification.md
grok/skill/references/planning.md
grok/skill/references/handoff.md
claude/agents/arc-scouter.md
claude/agents/arc-planner.md
claude/agents/arc-implementer.md
claude/agents/arc-tester.md
claude/agents/arc-reviewer.md
codex/agents/arc-scouter.toml
codex/agents/arc-planner.toml
codex/agents/arc-implementer.toml
codex/agents/arc-tester.toml
codex/agents/arc-reviewer.toml
gemini/agents/arc-scouter.md
gemini/agents/arc-planner.md
gemini/agents/arc-implementer.md
gemini/agents/arc-tester.md
gemini/agents/arc-reviewer.md
grok/agents/arc-scouter.md
grok/agents/arc-planner.md
grok/agents/arc-implementer.md
grok/agents/arc-tester.md
grok/agents/arc-reviewer.md
lib/policy/role-policy.json
lib/prompts/agent-fragments.json
shared/skill/runtime/role-policy.json
tests/node/test-scope-contract.test.mjs
tests/node/fixtures/instruction-contracts.json
tests/node/fixtures/installed-layout-golden.json
MANIFEST.sha256
```

**선행:** 없음 (base `d15e3d25`)

**Interfaces:** 문안만 바뀝니다. 규칙 id `review.final-plan-recheck`, fragment id `planner.final-plan-recheck`·`reviewer.final-plan-findings`, export, CLI 옵션, 설정 키는 그대로입니다.

- [x] **Step 1: 계약 테스트와 fixture 기대값 먼저 갱신 (AC7)**
  - `tests/node/test-scope-contract.test.mjs`
    - `finalVerificationParagraph` 꼬리를 R1으로 바꾸고, 다음 세 상수를 조합해 만듭니다.
      - `finalFailureRule = 'A new failure from final verification follows Implementer → Tester.'`
      - `finalReviewerStartSentence` = R1의 "The final Reviewer starts only after … below." 문장
      - `preReviewOutputSentence = 'Reviewer output produced before that point is not the initial final review.'`
    - 기존 `:410` 테스트를 `${platform} final Reviewer starts only after final-mode Tester work concludes`로 바꿉니다.
      - 세 상수가 각각 정확히 한 번 나와야 합니다.
      - 문단은 `neither Orchestrator nor any Implementer writes in that workspace. ${finalFailureRule} ${finalReviewerStartSentence} ${preReviewOutputSentence}`로 끝나야 합니다.
    - `finalPlanRecheckSentence`를 `'Tester findings and new failures from final verification follow Implementer → Tester before that review begins.'`로 바꿉니다.
      - `:330`, `:367` 배치 템플릿은 그대로 둡니다.
      - R10 전문이 일치하는지 검증하는 테스트를 추가합니다.
    - `reviewerFindingsSentence`를 R12로 바꿉니다. `:345` 배치 템플릿은 그대로 둡니다.
    - planner 렌더에 R11이 정확히 한 번 나오는지 검증하는 테스트를 추가합니다.
    - undeterminable 테스트(`:252-253`)의 기대 문구를 `'final acceptance and the final Reviewer are held, while independent work continues'`로 바꿉니다.
    - 상수 `retiredFinalOrderPhrases`를 추가하고, 그 4종이 다음 파일에 없음을 검증합니다.
      - 4개 플랫폼 `SKILL.md`, `references/{verification,planning,handoff}.md`
      - 렌더된 profile 20개
      - `lib/policy/role-policy.json`, `lib/prompts/agent-fragments.json`, `shared/skill/runtime/role-policy.json`
      - 대상 문구: `MAY run concurrently`, `even after the final Reviewer has started`, `which may run concurrently with the final Reviewer`, `while Reviewer and independent work continue`
  - `tests/node/fixtures/instruction-contracts.json`
    - codex(:14)·claude(:126) 계약을 R8로 바꿉니다.
    - codex(:54)·claude(:166) 계약을 R3·R4로 바꿉니다.
    - 해시 필드는 Step 5에서 바꿉니다.
- [x] **Step 2: RED 확인**
  - `node --test tests/node/test-scope-contract.test.mjs tests/node/instruction-layout.test.mjs`를 실행합니다.
  - 새 기대값과 관련된 테스트만 FAIL해야 합니다. 그 밖의 실패는 테스트 이름과 함께 보고합니다.
- [x] **Step 3: 원천 편집 (AC1–AC5)**
  - 4개 플랫폼 `verification.md`: R1–R7
  - 4개 플랫폼 `SKILL.md:20`: R8. 뒤에 오는 `Tester findings alone create no new task.`는 그대로 둡니다.
  - 4개 플랫폼 `planning.md:69`: R9
  - `lib/policy/role-policy.json`: `review.final-plan-recheck`의 `text`만 R10으로 바꿉니다.
  - `lib/prompts/agent-fragments.json`: R11, R12
  - 관리 섹션(`[ARC role policy: contract begin]`…`end`)은 손으로 고치지 않습니다.
- [x] **Step 4: 생성 (AC4)**
  1. `node scripts/update-role-policy.mjs`를 실행하고 `npm run check:role-policy`로 확인합니다.
  2. `node scripts/update-runtime-assets.mjs`를 실행하고 `node scripts/update-runtime-assets.mjs --check`로 확인합니다.
  - 스크립트가 allowedPaths 밖에 쓰거나 sandbox에 막히면 environment block으로 보고하고 멈춥니다(hold).
- [x] **Step 5: fixture 해시 재계산 (AC7)**
  - `agentProfileBaseline.profiles` 20개: `tests/node/agent-fragments.test.mjs:25-34`와 같은 방식으로 렌더한 결과의 sha256을 넣습니다.
    - 계산은 일회성 `node -e`로만 하고 새 파일은 만들지 않습니다.
    - `revision`·`baseline` 필드는 바꾸지 않습니다.
  - `protected` 12개: 아래 파일의 바이트 sha256을 넣습니다. 나머지 `protected` 항목은 그대로 둡니다.
    - `claude/agents/arc-*.md` 5개, `codex/agents/arc-*.toml` 5개
    - `lib/policy/role-policy.json`, `shared/skill/runtime/role-policy.json` (두 값은 같아야 합니다)
  - golden: 먼저 `node tests/node/fixtures/installed-layout.mjs --diff`를 실행합니다.
    - `~` 항목이 다음 설치 경로에만 있으면 `--write`로 씁니다: role-policy 런타임 사본, `agents/arc-*`, `SKILL.md`, `references/{verification,planning,handoff}.md`
    - 다른 경로가 나오거나 `+`/`-` 항목이 있으면 hold합니다.
    - 실행할 수 없으면 environment block으로 보고합니다.
- [x] **Step 6: MANIFEST (AC8)**
  - 마지막에 `node scripts/update-manifest.mjs`를 실행하고 `npm run check:manifest`로 확인합니다.
- [x] **Step 7: 관련 테스트, check, grep (AC1–AC10)**
  - 아래 task-mode 최소 집합을 실행합니다.
  - 읽기 전용으로 `git diff --name-only`와 `git status --porcelain`을 실행해, 변경 파일이 allowedPaths 43개와 untracked spec·plan 안에만 있는지 확인합니다.
- [x] **Step 8: Commit (Orchestrator)**
  - 수락한 뒤 43개 파일과 spec, plan을 commit 하나로 만듭니다.
  - 메시지: `chore(policy): 최종 Reviewer를 final-mode Tester 종결 후로 순차화`

**수용 기준:**

| AC | 확인 방법 |
|---|---|
| AC1 | test-scope-contract의 문단 일치·배치 테스트와 test-scope 절 플랫폼 간 비교 |
| AC2 | `rg -c -F '<R2…R7 원문>'`을 4개 플랫폼 `verification.md`에 실행해 각 1개. R3는 `final independent whole-change Reviewer once after all accepted tasks/required checks/rechecks and concluded final-mode Tester work \|` 부분 문자열로 셉니다 |
| AC3 | R8은 `*/skill/SKILL.md`에서, R9는 `*/skill/references/planning.md`에서 각 1개. instruction-layout 계약 통과 |
| AC4 | 구조 필드 deepEqual, `check:role-policy`, runtime `--check`, 관리 규칙 배치 테스트 |
| AC5 | planner·reviewer 렌더 테스트, reviewer가 아닌 렌더에는 R12가 없음 |
| AC6 | `rg -n -F -e 'MAY run concurrently' -e 'even after the final Reviewer has started' -e 'which may run concurrently with the final Reviewer' -e 'while Reviewer and independent work continue' --glob '!docs/superpowers/**' .`의 매치가 `retiredFinalOrderPhrases` 상수 안에만 있음. `rg -n -F 'refreshed-diff recheck' --glob '!docs/superpowers/**' .` 0건 |
| AC7 | Step 1 테스트와 fixture 통과 |
| AC8 | `npm run check:manifest` 통과 |
| AC9 | 변경 파일이 allowedPaths 안에만 있음. `git diff --name-only <base> -- lib/runtime docs/superpowers '*/skill/references/commit.md'` 결과 없음(새 spec·plan만 추가) |
| AC10 | 실패를 테스트 이름으로 대조하고 2단계로 분류함. 기존 실패(51–55)와 불안정한 테스트는 단독 재실행으로 구분 |

**task 검증 (fresh Tester, `mode: task`) 최소 집합**

| 항목 | 분류·이유 |
|---|---|
| `tests/node/test-scope-contract.test.mjs` | (b) 갱신한 계약 테스트 |
| `tests/node/instruction-layout.test.mjs` | (b) fixture 계약, `protected` 해시, SKILL.md 크기 예산 |
| `tests/node/agent-fragments.test.mjs` | (b) 렌더 profile 해시 |
| `tests/node/installed-layout-golden.test.mjs` | (b) golden 재생성 |
| `tests/node/role-policy.test.mjs` | (a) `role-policy.json` 렌더·배치 |
| `tests/node/runtime-assets.test.mjs` | (a) 런타임 사본 mirror |
| `tests/node/manifest.test.mjs` | (a) MANIFEST |
| `tests/node/{run-mode-contract,plan-level-records-contract,instruction-language,composite-instructions}.test.mjs` | (a) 변경된 정책 원천이나 문서를 직접 읽음 |
| Python `tests.test_arc_policy`, `tests.test_harness_contract`, `tests.test_claude_payload` | (a) 변경된 문서·profile·정책을 직접 읽음 |
| `npm run check:role-policy`, `node scripts/update-runtime-assets.mjs --check`, `npm run check:manifest`, `node scripts/check-installer-parity.mjs`, `node tests/node/fixtures/installed-layout.mjs --diff`(출력 없어야 함) | (c) check 스크립트 |
| AC2·AC3·AC6 grep | 문안 개수와 부재 확인 |

task mode에서는 full regression, substitute check, 역의존성 탐색을 하지 않습니다.

**hold 조건:**

- SKILL.md가 `skill.bytes`/`lines` 예산을 넘습니다. 예산 값은 바꾸지 않고 Orchestrator에게 보고합니다.
- golden diff나 `protected` 갱신에 의도하지 않은 항목이 섞입니다.
- 생성 스크립트가 allowedPaths 밖에 쓰거나, sandbox 또는 native build에 막힙니다.
- 목록에 없는 테스트 파일까지 고쳐야 합니다(범위 변경).
- 기준선 밖에서 새 실패나 new-failure candidate가 나옵니다.

---

### Task T2: final verification 새 실패 수정 — `plan.test.mjs` 렌더링 baseline 해시 (plan v2 추가, 2026-11-25 사용자 승인)

**배경:** final verification에서 `tests/node/plan.test.mjs`의 `{codex,claude} {en,ko} skipGlobal={false,true} preserves public rendering baseline` 8건이 HEAD `75887e65`에서만 실패하고 base `d15e3d25`에서는 통과했습니다. 이 테스트는 설치 plan의 공개 출력 해시(`renderingBaseline`)를 고정하는데, T1에서 profile·skill 문서 내용이 바뀌어 해시가 달라졌습니다. T1 파일 목록에서 빠졌던 fixture입니다.

**Files (allowedPaths):** `tests/node/plan.test.mjs`

- [x] **Step 1:** `renderingBaseline`의 8개 값만 현재 HEAD 렌더 결과의 sha256으로 바꿉니다. 테스트가 쓰는 계산 방식을 그대로 따르고, 다른 줄이나 테스트 로직은 바꾸지 않습니다. 일회성 계산만 하고 새 파일은 만들지 않습니다.
- [x] **Step 2:** `node --test tests/node/plan.test.mjs`가 통과합니다(8건 해소, 다른 실패 없음).
- [x] **Step 3:** diff가 `renderingBaseline` 8줄에만 있는지 확인합니다.
- [x] **Step 4: Commit (Orchestrator)** `test(plan): 정책 문안 변경에 맞춰 렌더링 baseline 해시 갱신`. plan v2 개정을 같은 commit에 넣습니다.

**수용 기준:** T2-AC1 8건 통과, T2-AC2 diff 범위가 해시 8줄, T2-AC3 `plan.test.mjs`의 다른 테스트 결과가 base와 같음.

**task 검증:** fresh Tester(`mode: task`)가 `tests/node/plan.test.mjs`를 실행하고 diff 범위를 확인합니다. 이후 현재 final Tester가 재변경 파일 관련 테스트로 다시 확인합니다.

---

### Task T3: 최종 Reviewer finding 수정 — 만료된 full regression 승인 처리 (plan v3 추가, 2026-11-25 사용자 fix 결정)

**배경:** 최종 Reviewer의 non-blocking 관찰입니다. `verification.md`의 **Approved full regression** 문단은 "Approval is valid only for that workflow and HEAD and expires when HEAD changes."라고 합니다. 그런데 R1은 Reviewer 시작 전에 새 실패를 수정(HEAD 변경 가능)하고 "any approved full regression is complete"도 요구합니다. 만료된 승인을 어떻게 다루는지가 문안에 없습니다.

**R13** (4개 플랫폼 `verification.md`, 위 문장 바로 뒤에 추가, 영문 그대로):

> If HEAD changes before the final Reviewer starts, an expired approval needs re-approval and a rerun at the new HEAD, or a fresh disposition under **Undeterminable scope**, before the Reviewer starts.

**R14** (최종 Reviewer 재확인 N1, 사용자 fix 결정): 같은 문단의 "The approved full regression runs once."를 다음 문장으로 바꿉니다.

> The approved full regression runs once per approval.

**Files (allowedPaths):** `{claude,codex,gemini,grok}/skill/references/verification.md`, `tests/node/test-scope-contract.test.mjs`, `tests/node/fixtures/instruction-contracts.json`, `tests/node/fixtures/installed-layout-golden.json`, `tests/node/plan.test.mjs`, `MANIFEST.sha256`

- [x] **Step 1:** `test-scope-contract.test.mjs`의 test-scope 절 기대 문안에 R13·R14를 넣고, R13이 플랫폼별로 정확히 한 번 위 문장 바로 뒤에 오는지, R14가 플랫폼별로 정확히 한 번 있는지 검증합니다. RED를 확인합니다.
- [x] **Step 2:** 4개 플랫폼 `verification.md`에 R13을 추가하고 R14로 문장을 바꿉니다. 관리 섹션은 건드리지 않습니다.
- [x] **Step 3:** 내용 변경으로 달라지는 fixture만 갱신합니다. 대상은 installed-layout golden(`--diff`로 `references/verification.md` 항목만 `~`인지 확인한 뒤 `--write`), `plan.test.mjs`의 `renderingBaseline` 해시, `instruction-contracts.json`(해당하는 경우만)입니다. 마지막에 `node scripts/update-manifest.mjs`를 실행합니다.
- [x] **Step 4:** `node --test`로 `test-scope-contract`, `instruction-layout`, `installed-layout-golden`, `plan`, `manifest` 테스트를 실행하고 check 스크립트도 통과시킵니다. 실제로 필요하지 않은 fixture 파일은 바꾸지 않습니다.
- [x] **Step 5:** 최종 Reviewer가 재확인합니다(Implementer → Reviewer, Tester 재배정 없음). 그동안 수정분은 커밋하지 않습니다.
- [x] **Step 6: Commit (Orchestrator)** `chore(policy): 만료된 full regression 승인 처리와 승인당 1회 실행 명시`. plan v3 개정과 plan-level 기록을 함께 넣습니다.

**수용 기준:** T3-AC1 R13·R14가 4개 플랫폼에 각각 정확히 한 번, test-scope 절이 byte-identical. T3-AC2 관련 테스트와 check 스크립트 통과. T3-AC3 변경 파일이 allowedPaths 안에 있음. T3-AC4 최종 Reviewer 재확인에서 finding 해소.

---

## 최종 검증 (`mode: final`)

T1을 수락·커밋한 뒤 verified HEAD에서 fresh Tester를 한 번 배정합니다. 최종 Reviewer는 final-mode Tester 작업이 다음을 모두 마친 뒤에 시작합니다.

- 보고 전달
- 새 실패를 Implementer → Tester로 해결
- new-failure candidate와 intermittent candidate 처분
- 승인된 full regression이 있으면 완료
- undeterminable 항목 처분

이 순서는 이번 변경이 도입하는 규칙입니다. 현행 규칙의 "MAY run concurrently"는 병렬을 허용할 뿐 강제하지 않으므로, 이 workflow에 바로 적용해도 현행 규칙과 충돌하지 않습니다.

1. **모든 계약 테스트**
   - Node: `tests/node/{test-scope-contract,run-mode-contract,plan-level-records-contract,watch-import-graph,manifest,installed-layout-golden,parity-check,instruction-layout,instruction-language,agent-fragments,role-policy,composite-instructions,profile-render,hardcoding-residual,menu-label-residual}.test.mjs`
   - Python: `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest tests.test_harness_contract tests.test_arc_policy -v`
2. **모든 check 스크립트**
   - `npm run check:role-policy`
   - `npm run check:manifest`
   - `node scripts/update-runtime-assets.mjs --check`
   - `node scripts/check-installer-parity.mjs`
   - `node tests/node/fixtures/installed-layout.mjs --diff`
3. **재변경 파일의 관련 테스트**
   - task가 하나뿐이고 T1 뒤에 다른 commit이 없으므로 목록이 비어 있을 것으로 예상합니다.
   - Orchestrator가 빈 목록과 그 이유를 brief에 적고, Tester가 `git diff --name-only <T1 commit> HEAD`로 교차 확인합니다.
4. **트리거 대체 검사**

| 트리거 | 잠정 판단 | 대체 검사 | 이유 |
|---|---|---|---|
| (1) 공유 모듈 | 해당 | `lib/policy/role-policy.json`, `lib/prompts/agent-fragments.json`, `shared/skill/runtime/role-policy.json`, 생성된 profile·skill 문서에서 출발해 정적 import와 경로 문자열 참조로 역의존성을 추적합니다. grep으로 찾은 후보: `runtime-assets`, `host-gemini-grok`, `grok-{bridge,platform,install,capability-evidence}`, `gemini-{platform,bridge}`, `upgrade-harness`, `runtime-{workflow.integration,evaluate,codex,claude,git-evidence}`, `run-mode-contract`, `role-policy`, `plan`, `parity-check`, `instruction-{layout,language}`, `dispatch-lease-v2`, `tui-package-consumer`, `manifest`, `agent-fragments`, `role-routing-anchor`, `package`, `git-query`, `installed-layout-golden`, `composite-instructions`, `profile-render`, Python `test_harness_contract`·`test_claude_payload`·`test_arc_policy`. `tests/node/role-fixtures.mjs`를 import하는 파일도 추적합니다. 범위를 확정하지 못하면 한 단계 넓힙니다 | 여러 role과 플랫폼이 런타임에 로드하거나 렌더하는 원천과 그 mirror·생성물이 바뀝니다 |
| (2) 외부 변경 통합 | 해당 없을 예정 | 없음. merge·rebase·cherry-pick이 없었다는 통합 이력을 Orchestrator가 brief에 적습니다 | 통합 계획 없음 |
| (3) 의존성·설정 | 해당 없을 예정 | `git diff --name-only <base> HEAD -- package.json package-lock.json` 결과 없음 | manifest·lockfile·설정 변경 없음 |
| (4) 공개 인터페이스 | 해당 없을 예정 | diff로 규칙 id·fragment id가 그대로인지 확인 | 문안만 바뀜 |

범위를 판정할 수 없는 항목은 item, cause, substitute checks run, remaining unverified scope 네 가지를 보고합니다. 사용자가 (i) full regression 승인, (ii) CI 대체, (iii) unverified 처분 중 하나를 고를 때까지 최종 수용과 최종 Reviewer를 보류합니다. 저장소 CI가 전체 테스트를 돌리지 않으므로 (ii) CI 대체는 사실상 쓸 수 없습니다.

최종 Reviewer는 final Tester 작업이 끝난 뒤 base..HEAD 전체를 한 번 검토하며, 초점은 Review Focus 1–4입니다. finding은 Implementer → Reviewer로 처리합니다. 수정은 재확인이 끝날 때까지 커밋하지 않고 두었다가 follow-up commit 하나로 만듭니다.

## 요구 추적

| 요구 | Step | 확인 |
|---|---|---|
| R1–R7 | T1 Step 3 | AC1, AC2 |
| R8, R9 | T1 Step 3 | AC3 |
| R10 | T1 Step 3, 4 | AC4 |
| R11, R12 | T1 Step 3 | AC5 |
| spec §4 삭제 문구 | T1 Step 1, 3 | AC6 |
| spec §6 생성 순서 | T1 Step 4–6 | AC4, AC7, AC8 |

## 참고

- `test_arc_policy.py:350,551`의 "at the final relevant state" 정규식은 현재 어떤 문서와도 맞지 않습니다. 이번 변경과 무관한 기존 실패 후보입니다.
- 4개 플랫폼 `commit.md:22`의 "Final Tester findings retain Implementer → Tester before a new commit."은 새 규칙과 어긋나지 않으므로 그대로 둡니다.
- `MANIFEST.sha256`에는 `docs/`와 `tests/`가 포함되지 않습니다.
