# 마지막 task QA의 최종 검증 흡수와 최종 Reviewer 수정 사전 점검 구현 계획

> **For agentic workers:** ARC Orchestrator 조정. task마다 Implementer → fresh QA → Orchestrator 수락 → focused commit 1개. Implementer와 QA는 Git 상태를 바꾸지 않는다. 단계는 checkbox(`- [ ]`)로 추적한다.

- 날짜: 2026-11-23 · 상태: v2 · workflow: `2026-11-23-last-task-final-verification`
- 대상: managed worktree `.claude/worktrees/last-task-final-verification`, 브랜치 `feat/last-task-final-verification`, base `f786e4a1155287eff80d4abe56f7cebaf6598e3b`
- 경로·위험: Bounded(plan 필요, 별도 spec 없음), significant(공유 역할 계약·생성기 입력)

**Goal:** 마지막 task QA가 조건을 갖추면 최종 검증을 흡수하고(A1), 최종 Reviewer 수정 커밋 전에 Orchestrator가 focused check를 실행한다(A2). 두 규칙을 4 플랫폼 문서·정책·프로필에 반영하고 계약 테스트로 고정한다.

**Architecture:** T1은 손 편집 references(verification·handoff-prep·planning × 4)에 개념과 절차를 정의한다. T2는 정책 원본(`lib/policy/role-policy.json`)과 fragment(`lib/prompts/agent-fragments.json`)를 바꾼 뒤 생성기로 managed 구역·런타임 미러·해시·golden·MANIFEST를 다시 만든다. 런타임 코드는 바꾸지 않는다.

**Tech Stack:** Node.js ≥22 ESM, `node:test`, Python `unittest`, git CLI.

**승인 근거:** 설계 승인 2026-11-23(사용자, 이 대화): A1, A2, O1(a), O2(a), O3, 단일 task 계획에도 A1 적용, A2는 full-regression 트리거에 해당해도 세 범주 점검으로 충분, 같은 QA가 수정된 트리에서 최종 범위를 재실행·통과하면 skip 유지. 별도 spec 문서 없음. 아래 "확정 문안" N1–N12가 이 plan이 정한 바이트 원문이다.

## Global Constraints

- 정책·문서 문장은 영어이며 N1–N12를 바이트 그대로 복사한다. 4 플랫폼(claude/codex/gemini/grok)에 같은 바이트로 넣는다. 의역, 따옴표 변환, 줄바꿈 추가 금지.
- 생성물은 손으로 편집하지 않는다.
  - 각 문서의 `[ARC role policy: contract begin]`…`end` 구역: `npm run update:role-policy`
  - `shared/skill/runtime/role-policy.json`: `node scripts/update-runtime-assets.mjs`(인자 없음, 검증은 `--check`)
  - `MANIFEST.sha256`: `node scripts/update-manifest.mjs`
  - golden: `node tests/node/fixtures/installed-layout.mjs --diff`로 확인한 뒤 `--write`
- 바꾸지 않는 것
  - 런타임 코드 `lib/runtime/verification.mjs`와 미러 `shared/skill/runtime/verification.mjs`. CLI의 `final` scope는 review 전용(`verification.mjs:74`)이며 별도 final QA를 모델링하지 않는다(P5).
  - SKILL.md, `role.orchestrator-boundary`, `commit.md`, verification.md 위험표(`:42`/codex `:40`), plan-level 기록 정의
  - 마지막이 아닌 task의 QA fresh 규칙
- Python은 `PYTHONDONTWRITEBYTECODE=1`로 실행한다.
- Implementer는 stage·commit·stash·reset·브랜치·worktree 조작을 하지 않고 allowedPaths 밖을 수정하지 않는다. 지정 밖 계약 단언을 고쳐야 통과하면 hold하고 보고한다.
- prerequisite: 대상 worktree의 `node_modules/`, `build/native/`는 Orchestrator가 `npm ci --ignore-scripts`, `npm run build:native`로 미리 준비한다(golden `--diff/--write`에 필요).

## Review Focus

1. 4 플랫폼 바이트 드리프트(codex는 줄 번호만 2줄 앞섬) → T1 `${platform} test scope paragraphs match the approved text`
2. 옛 "항상 병행" 문장이 문서·managed 구역·렌더 프로필에 남는 경우 → T1·T2 은퇴 문장 부재 테스트
3. skip 조건 (a)–(e)와 O3 예외 문구 누락·변경 → T1 `lastTaskFinalScopeParagraph` 완전 일치
4. managed 구역에 수동 편집이 섞이는 경우 → T2 `npm run check:role-policy`, `update-runtime-assets --check`
5. 렌더 해시를 잘못된 키로 옮기는 경우 → T2 `agent-fragments`·`instruction-layout` 통과와 해시 출력 근거

## 파일 구조

| 파일 | 책임 | 편집 | task |
|---|---|---|---|
| `{claude,codex,gemini,grok}/skill/references/verification.md` | N1–N6 손 편집 영역. managed 구역은 생성 | 손 편집(T1) / 생성(T2) | T1, T2 |
| `{…}/skill/references/handoff-prep.md` | `:95` 두 번째 문장(N8) | 손 편집 | T1 |
| `{…}/skill/references/planning.md` | `:69`(codex `:71`) 문구(N9). managed 구역은 생성 | 손 편집(T1) / 생성(T2) | T1, T2 |
| `{…}/skill/references/handoff.md` | managed 구역만 | 생성 | T2 |
| `lib/policy/role-policy.json` | `review.significant-plan`(N10), `review.final-plan-recheck`(N11) | 손 편집 | T2 |
| `lib/prompts/agent-fragments.json` | `planner.task-shape`·`qa.verification-steps`·`reviewer.final-plan-findings`(N12) | 손 편집 | T2 |
| `{claude,gemini,grok}/agents/arc-{scouter,planner,implementer,qa,reviewer}.md`, `codex/agents/arc-*.toml` | managed 구역 | 생성 | T2 |
| `shared/skill/runtime/role-policy.json` | 미러 | 생성 | T2 |
| `tests/node/test-scope-contract.test.mjs` | 계약 | 손 편집 | T1, T2 |
| `tests/node/fixtures/instruction-contracts.json` | 렌더 해시 20개, protected 해시 12개 | 생성 값 옮김 | T2 |
| `tests/node/fixtures/installed-layout-golden.json`, `MANIFEST.sha256`, `tests/node/plan.test.mjs`(digest) | 생성물 | 생성 | T1, T2 |

**실제 대상 위치(base `f786e4a1`에서 확인):**
- verification.md: claude/gemini/grok `:22` Final verification, `:24` Full regression, `:26` Baseline, `:59` "Only final overall Reviewer findings…", `:78` "Committed-plan final Reviewer findings…", `:119` CLI Final review. codex는 `:20/:22/:24/:57/:76/:117`.
- handoff-prep.md: 4 플랫폼 모두 `:95`
- planning.md: claude/gemini/grok `:69`, codex `:71`
- agent-fragments.json: `:54` `planner.task-shape`, `:82` `qa.verification-steps`, `:94` `reviewer.final-plan-findings`
- role-policy.json: `:356` significant-plan text, `:382` final-plan-recheck text
- 생성 대상(`lib/policy/render.mjs:33-37`, `lib/policy/placement.mjs:2-10`): review 규칙은 `planning`·`handoff`·`verification` projection과 specialist 5개 프로필(scouter 포함)에 렌더된다. T2 managed 변경은 플랫폼당 8파일, 총 32파일. SKILL.md(core), coordination·handoff-prep·commit은 바뀌지 않는다.

## 확정 문안 (영어 원문, 4 플랫폼 공통)

- **N1** verification.md `**Final verification**` 단락 전체 교체:
  > **Final verification** runs once per plan, either carried by the last task's QA under the last-task final scope below or, otherwise, after all tasks are accepted and committed as one fresh QA assignment at the verified HEAD of the execution target worktree: all contract tests, all check scripts and the related tests of re-changed files; it does not rerun the union of tests that task QA already passed. A re-changed file is a file that a task's QA verified, as a changed file or a related test file it ran, and that a later commit changed after that task's focused commit (`git diff --name-only <task commit> HEAD`), plus every non-documentation file changed in base..HEAD by a commit that no task QA verified; under last-task final scope it also includes every file that an earlier task's QA verified and that the last task's uncommitted diff, including untracked files, changes. Orchestrator computes the list, under last-task final scope at QA start, and cites it in the brief; QA cross-checks it with read-only `git diff`, MAY add items only within the three categories above with reasons, and reports the reason when the list is empty. A fresh QA final verification records `git status --porcelain` at start and end; a state that is not clean is an environment block that holds final verification. While it runs, neither Orchestrator nor any Implementer writes in that workspace; the read-only final Reviewer MAY run concurrently. A new failure from that fresh QA final verification follows Implementer → QA even after the final Reviewer has started; Reviewer evidence for affected files becomes stale and needs a refreshed-diff recheck.

- **N2** 새 단락. N1 바로 뒤, `**Full regression**` 앞에 빈 줄로 구분:
  > **Last-task final scope:** Orchestrator designates in the brief, as last-task QA with final scope, the task QA that starts after every other plan task is accepted and committed, and records the HEAD at its start; this applies to single-task plans too. If parallel execution leaves no such QA, a fresh QA final verification runs. That QA runs the task's related tests, the final verification scope above and full regression once when triggered. It records `git status --porcelain` at start and end; at end it may show only the last task's uncommitted diff, and any other state is an environment block. It reports a task verdict, the basis for task acceptance, and a final-scope verdict; final-only checks never delay an independently acceptable task. Orchestrator skips the separate fresh QA final verification only if all hold: (a) the final-scope verdict passed and every failure is dispositioned as baseline or unrelated; (b) the parent of the task's focused commit is the HEAD recorded at QA start; (c) the committed content equals the tree that QA last verified, except classified plan-document progress records and pending revision rows; (d) `git status --porcelain` is clean after the commit; (e) no later commit or integration by merge, rebase or cherry-pick follows, except a standalone `docs(plan)` closing commit that touches only plan documents no check reads. If the last task is corrected after a final-scope failure and the same QA reruns the final scope on the corrected tree and it passes, the skip stays valid. Otherwise one fresh QA final verification runs at the verified HEAD.

- **N3** `**Full regression**` 단락 두 군데 변경. 나머지 문장은 그대로:
  - `Orchestrator cites its provisional judgment and reasons, including the integration history for trigger (2), in the final QA brief, and QA independently checks triggers (1), (3) and (4) from the base..HEAD diff and log.`를 다음으로 교체:
    > Orchestrator cites its provisional judgment and reasons, including the integration history up to QA start for trigger (2), in the brief that carries the final scope, and QA independently checks triggers (1), (3) and (4) from the base..HEAD diff and log, plus the uncommitted diff under last-task final scope.
  - `…omit it and report the reason.` 바로 뒤에 ` An integration after that QA starts breaks skip condition (e).` 추가.

- **N4** `**Baseline:**` 단락에서 `final verification QA uses `git diff --name-only <approved base> HEAD`.`를 다음으로 교체:
  > a fresh QA final verification uses `git diff --name-only <approved base> HEAD`, and last-task QA with final scope uses the task QA form.

- **N5** "Final plan Reviewer correction loop" 절에서 `Only final overall Reviewer findings…` 단락 바로 뒤에 빈 줄로 구분한 새 단락:
  > Before the one follow-up commit, Orchestrator runs focused checks, checks only and without edits or the direct path, on the Reviewer-resolved uncommitted correction diff at a fixed fingerprint, limited to the three task-check categories in [test scope](#test-scope-and-result-comparison). It records commands, results, failure names, `git status --porcelain` and actor `orchestrator` in the canonical record and with the plan-level progress records, and reruns them if the diff changes. It dispositions a failure that the static check shows unrelated; any other failure is a correction finding that follows Implementer → Reviewer on the refreshed diff and then a focused-check rerun, with no baseline absorption and no base run. These checks suffice even when the correction meets a full-regression trigger.

- **N6** `Committed-plan final Reviewer findings…` 단락의 한 문장 교체. `Final QA findings still use Implementer → QA.`는 유지:
  - 기존: `Reuse/assign independent Reviewer and repeat Implementer → Reviewer until resolved, then accept/commit one focused follow-up.`
  - 새 문장:
    > Reuse/assign independent Reviewer and repeat Implementer → Reviewer until resolved, run the Orchestrator focused checks in the [final plan Reviewer correction loop](#final-plan-reviewer-correction-loop), then accept/commit one focused follow-up.

- **N7** CLI 절(`:119`/codex `:117`)은 바꾸지 않는다. 모순이 없음을 Reviewer가 확인한다(P5).

- **N8** handoff-prep.md `:95`에서 `Final verification QA briefs also include the re-changed-file list and the provisional full-regression trigger judgment with reasons, including integration history.`를 다음으로 교체:
  > Briefs that carry the final scope, for last-task QA with final scope or a fresh QA final verification, also include the re-changed-file list and the provisional full-regression trigger judgment with reasons, including integration history up to QA start; a last-task QA brief also records the designation and the HEAD at QA start.

- **N9** planning.md에서 `Final whole verification has separate scope/timing;`를 다음으로 교체(test-scope 링크 1개 유지):
  > Final whole verification has separate scope, and separate timing unless the last task's QA carries it;

- **N10** `review.significant-plan` text 전체:
  > Significant/high-risk plan work follows Implementer → required fresh QA → Orchestrator acceptance and focused commit for each task; the last task's QA may carry the final verification scope, otherwise one fresh QA runs final verification. After all tasks are accepted and required QA is complete, Reviewer reviews the final full change once. Reviewer is not a per-task or per-commit gate. Preserve required checks and necessary finding rechecks.

- **N11** `review.final-plan-recheck` text 전체:
  > Complete required QA and QA failure rechecks before the initial final overall Reviewer review. Once that review begins on plan work, every final Reviewer finding, including behavior, follows Implementer → Reviewer without QA reassignment until resolved. Keep corrections uncommitted through Reviewer rechecks. Before the commit, Orchestrator runs focused related checks only, without edits, on the Reviewer-resolved correction diff; a failure not shown unrelated returns as a correction finding to Implementer → Reviewer. Then accept and create one focused follow-up commit. Separate QA findings and new failures from a fresh QA final verification, which may run concurrently with the final Reviewer, follow Implementer → QA; Reviewer evidence for affected files then needs a refreshed-diff recheck. Preserve required QA outside this final Reviewer exception.

- **N12** agent-fragments.json
  - (a) `planner.task-shape`: `…a provisional full-regression trigger judgment with reason.` 뒤, ` Put inseparable changes` 앞에 삽입:
    > ` That section defines the final scope whether the last task's QA carries it or a fresh QA runs it.`
  - (b) `qa.verification-steps` 1단계: `…finds one applies or cannot decide.` 뒤, ` Use approved structural/consistency checks` 앞에 삽입:
    > ` When assigned last-task final scope, run the same scope with the task's related tests on the uncommitted tree, record `git status --porcelain` at start and end, and report a task verdict and a final-scope verdict separately.`
  - (c) `reviewer.final-plan-findings` 마지막 문장 `New failures from final verification follow Implementer → QA; affected evidence needs a refreshed-diff recheck.`를 다음으로 교체:
    > New failures from a fresh QA final verification follow Implementer → QA; affected evidence needs a refreshed-diff recheck. A failed Orchestrator focused check on a resolved correction diff returns as a correction finding for your recheck.

- **N2a (v2, 최종 Reviewer finding 1)** N2의 skip 조건 (a)에서 `(a) the final-scope verdict passed and every failure is dispositioned as baseline or unrelated;`를 다음으로 교체한다. 수정 전 트리의 최종 범위 판정으로 skip하는 경로를 막는다.
  > (a) the final-scope verdict on the tree that is committed passed and every failure is dispositioned as baseline or unrelated;

- **N13 (v2, 최종 Reviewer finding 2)** 4 플랫폼 commit.md `:22`에서 `repeat Implementer → Reviewer without QA reassignment until resolved, then accept and create one focused follow-up commit.`를 다음으로 교체한다.
  > repeat Implementer → Reviewer without QA reassignment until resolved, run the Orchestrator focused checks in the [final plan Reviewer correction loop](verification.md#final-plan-reviewer-correction-loop), then accept and create one focused follow-up commit.

## 가정

- A1 "손 편집 원본과 생성물 분리"는 task 안에서 Modify(손 편집)와 Regenerate(생성기만)로 구분한다는 뜻이다. 생성물을 별도 task로 떼면 `check:role-policy`가 실패하는 커밋이 생겨 독립 수락이 불가능하다.
- A2 task QA는 커밋 전 작업 트리를 검증한다. 정적 분류는 `git diff --name-only f786e4a1`와 untracked를 합쳐 본다.
- A3 agents는 `*/write/*` 8 레이아웃에만 설치되고, `skills/arc/runtime/role-policy.json`은 16 레이아웃 모두에 있다(2026-11-22 plan golden 근거).
- A4 `instruction-contracts.json`의 `contracts[].text`는 이번 변경 문장을 담지 않는다(`Final verification QA briefs`, `Committed-plan final Reviewer findings`, `Final whole verification` 부재 확인). 위험표 행과 commit.md 문장은 담겨 있으나 둘 다 바꾸지 않는다.
- A5 Python 테스트(`test_harness_contract.py:91,100`, `test_claude_payload.py:508`, `test_arc_policy.py:152,409`)와 `plan-level-records-contract`·`role-policy`·`agent-fragments` 테스트 파일은 바꾸는 문장을 담지 않으므로 수정하지 않고 관련 테스트로만 실행한다.

---

### Task 1: references 규칙 전환 (verification·handoff-prep·planning × 4)

**목표·범위:** N1–N6, N8, N9를 4 플랫폼 references의 손 편집 영역에 넣고 계약 테스트로 고정한다. managed 구역·정책·fragment는 건드리지 않는다.

**선행:** 없음(prerequisite는 Orchestrator 준비).

**Files (allowedPaths, 16개):**
- Modify: `{claude,codex,gemini,grok}/skill/references/verification.md`, `{claude,codex,gemini,grok}/skill/references/handoff-prep.md`, `{claude,codex,gemini,grok}/skill/references/planning.md`, `tests/node/test-scope-contract.test.mjs`
- Regenerate: `tests/node/fixtures/installed-layout-golden.json`, `MANIFEST.sha256`, `tests/node/plan.test.mjs`(digest 값만)

**Produces (T2가 사용, T2는 변경하지 않음):** 용어 `last-task final scope`, `fresh QA final verification`, `[final plan Reviewer correction loop]`의 Orchestrator focused check 절차. 테스트 상수 `finalVerificationParagraph`, `lastTaskFinalScopeParagraph`, `correctionChecksParagraph`.

- [x] **Step 0:** 시작 `git status --porcelain` 기록, prerequisite 존재 확인(없으면 hold).
- [x] **Step 1: RED** `tests/node/test-scope-contract.test.mjs`
  - 바꿀 상수: `finalVerificationParagraph`=N1, `finalScopeSentence`=N1 첫 문장(`…task QA already passed.`까지), `finalFailureRule`=N1 마지막 문장, `fullRegressionParagraph`=N3 적용 전문, `baselineParagraph`=N4 적용 전문, `handoffBriefInputsParagraph`=N8 적용 전문
  - 새 상수: `lastTaskFinalScopeParagraph`=N2, `correctionChecksParagraph`=N5, `committedPlanCorrectionSentence`=N6 새 문장, `planningFinalTimingPhrase`=N9, `retiredReferencePhrases`=[`'A new failure from final verification follows'`, `'Final verification QA briefs also include'`, `'in the final QA brief'`, ``'final verification QA uses `git diff'``, `'Final whole verification has separate scope/timing'`]
  - `sectionPhrases`에 `'Last-task final scope'` 추가
  - `test scope paragraphs match the approved text`: `['**Last-task final scope:**', lastTaskFinalScopeParagraph]` 추가, Final verification 다음 단락이 N2이고 그다음이 Full regression인 순서 단언
  - `final verification routes new failures after the Reviewer starts` → `fresh final QA routes new failures after the Reviewer starts`로 이름 변경, 끝 단언 `the read-only final Reviewer MAY run concurrently. ${finalFailureRule}` 유지
  - `final QA scope, full regression and base verdict sentences sit in place`: Full regression 단언을 `` `from the base..HEAD diff and log, plus the uncommitted diff under last-task final scope. ${fullRegressionQaSentence} An integration after that QA starts breaks skip condition (e). Change size` ``로 변경, Baseline에 N4 문장 포함 단언 추가
  - 신규 `${platform} final plan Reviewer correction loop requires Orchestrator focused checks`: `### Final plan Reviewer correction loop` 아래 두 번째 단락 `=== correctionChecksParagraph`, `committedPlanCorrectionSentence` 1회, `Final QA findings still use Implementer → QA.` 1회
  - 신규 `${platform} planning separates final timing unless the last task carries it`: planning.md에 N9 1회, test-scope 링크 1회
  - 신규 `${platform} references omit retired final verification sentences`: verification·handoff-prep·planning에 `retiredReferencePhrases` 없음
  - 실행: `node --test tests/node/test-scope-contract.test.mjs` → 바꾼·새 플랫폼별 테스트만 실패. 실패 이름 보고.
- [x] **Step 2:** 12개 문서를 "실제 대상 위치"대로 수정. 그 밖의 줄과 managed 구역은 바꾸지 않는다.
- [x] **Step 3: GREEN** 같은 명령 전부 PASS.
- [x] **Step 4: golden** `--diff` 기대: 정확히 48줄 `~`(16 레이아웃 × `skills/arc/references/{verification,handoff-prep,planning}.md`). 다르면 `--write` 전 hold. 같으면 `--write` 후 `--diff` 비었는지 확인.
- [x] **Step 5: MANIFEST** `node scripts/update-manifest.mjs` → 12항목 변경, 추가·삭제 없음.
- [x] **Step 6: digest** `node --test --test-name-pattern='preserves public rendering baseline' tests/node/plan.test.mjs`. 실패하면 키별 actual 값을 옮겨 재통과, 실패 없으면 편집하지 않음. 출력 발췌를 근거로 제출.
- [x] **Step 7:** 관련 테스트·check 실행. 종료 `git status --porcelain`에는 allowedPaths와 Orchestrator 소유 plan 문서만.
- [x] **Step 8: 커밋(Orchestrator, 수락 뒤):** `docs(verify): 마지막 task QA 최종 범위 흡수와 최종 수정 사전 점검 규칙 정의`

**수용 기준:**
- A1 문서 쪽: 지정, 범위, 두 판정, skip (a)–(e), 동일 QA 재실행 예외, fallback, 재변경 정의 확장, 정적 분류 형식, 트리거 문구
- A2 문서 쪽: focused check, 기록 항목, 실패 경로, base 실행 없음, 수정 금지
- O1(a) 병행은 fallback 한정, O3 (e) 예외
- 4 플랫폼 바이트 일치, managed 구역 불변(`git diff f786e4a1 -- lib/policy/role-policy.json` 비어 있음, `npm run check:role-policy` 통과)

**관련 테스트(이유):** `test-scope-contract`(직접 갱신 계약), `composite-instructions`(references 구조), `instruction-layout`(references canonical 규칙·계약 텍스트), `instruction-language`(references 언어), `plan-level-records-contract`(verification·handoff-prep 문장), `role-policy`(managed 구역 불변), `plan`(digest), `installed-layout-golden`·`manifest`(생성물), Python `test_arc_policy.py`·`test_claude_payload.py`·`test_harness_contract.py`(references 읽음)

**check:** `npm run check:manifest`, `npm run check:role-policy`, `node scripts/update-runtime-assets.mjs --check`, `node scripts/check-installer-parity.mjs`

**필수 QA·증거:** fresh QA, 4 플랫폼 hunk 동일성(파일별 `git diff` 비교), golden 48줄 목록, MANIFEST 12항목, digest 근거, verification.md Baseline 절차에 따른 실패 판정

**Hold:** golden·MANIFEST가 예상과 다를 때, 지정 밖 단언을 고쳐야 할 때, managed 구역이 바뀔 때, 문서 크기 한도 초과

**진행 기록 (T1):** 2026-11-23 수락. Implementer(codex bridge) 15파일 변경, RED 32건(8 이름 × 4 플랫폼) → GREEN 117/117. fresh QA: C1–C7 proven, Node 관련 테스트 410/410, check 4종 통과, golden 48항목·MANIFEST 12항목, digest 8/8. Python 3파일 실패 493건(failures 487, errors 6)은 `eba2521` 아카이브와 이름별 대조로 baseline 356·unrelated 137, 신규 0.

---

### Task 2: 정책·fragment 전환과 생성물 재생성

**목표·범위:** N10–N12를 손 편집 원본 2개에 넣고, 생성기로 managed 구역 32파일과 런타임 미러를 갱신하고, 해시·golden·MANIFEST·digest를 옮긴 뒤 계약 테스트로 고정한다.

**선행:** T1 수락·커밋(N10–N12가 T1 용어를 사용).

**Files (allowedPaths, 40개):**
- Modify: `lib/policy/role-policy.json`, `lib/prompts/agent-fragments.json`, `tests/node/test-scope-contract.test.mjs`
- Regenerate(`npm run update:role-policy`, 손 편집 금지): `{claude,gemini,grok}/agents/arc-{scouter,planner,implementer,qa,reviewer}.md`, `codex/agents/arc-{scouter,planner,implementer,qa,reviewer}.toml`, `{claude,codex,gemini,grok}/skill/references/{planning,handoff,verification}.md`
- Regenerate(`node scripts/update-runtime-assets.mjs`): `shared/skill/runtime/role-policy.json`
- 생성 값 옮김: `tests/node/fixtures/instruction-contracts.json`, `tests/node/fixtures/installed-layout-golden.json`, `MANIFEST.sha256`, `tests/node/plan.test.mjs`

**Consumes:** T1의 용어와 상수(변경하지 않음)

- [x] **Step 0:** 시작 `git status --porcelain` 기록.
- [x] **Step 1: RED** `tests/node/test-scope-contract.test.mjs`
  - 상수: `finalPlanRecheckSentence`=N11의 `Separate QA findings and new failures from a fresh QA final verification, …refreshed-diff recheck.`, `retiredFinalPlanRecheckSentence`=옛 문장(`…from final verification, which may run concurrently with the final Reviewer, …`), `correctionChecksPolicySentence`=N11의 `Before the commit, … to Implementer → Reviewer.`, `significantPlanClause`=N10의 `; the last task's QA may carry the final verification scope, otherwise one fresh QA runs final verification.`, `reviewerFindingsSentence`=N12(c) 전문(두 문장)
  - `retiredPhrases`에 `'Separate QA findings and new failures from final verification, which'`, `'New failures from final verification follow Implementer → QA'` 추가
  - canonical 테스트: 위치 단언 `create one focused follow-up commit. ${finalPlanRecheckSentence} Preserve required QA` 유지, `uncommitted through Reviewer rechecks. ${correctionChecksPolicySentence} Then accept` 단언, 옛 문장 부재 단언
  - 신규 `canonical significant-plan policy lets the last task QA carry final scope`: `for each task${significantPlanClause} After all tasks`
  - policyPaths 테스트(32개): 옛 문장 부재 추가
  - `profileRules`: `qa[0].rule` 끝에 N12(b), phrases에 `'a task verdict and a final-scope verdict'` 추가. `planner[0].rule` 끝에 N12(a)(`after`는 그대로)
  - reviewer render 위치 단언 `before this final stage. ${reviewerFindingsSentence}\n` 유지
  - 실행: `node --test tests/node/test-scope-contract.test.mjs` → 위 테스트만 실패, 실패 이름 보고.
- [x] **Step 2:** `role-policy.json` 두 text를 N10·N11로, fragment 3개를 N12로 수정. JSON 이스케이프·단일 행 유지(`validateRolePolicy`는 개행 거부).
- [x] **Step 3: 재생성** `npm run update:role-policy` → `Updated role policy (32 targets)` 기대. `node scripts/update-runtime-assets.mjs` → 미러 1개. 32 이외 대상이 바뀌면 hold.
- [x] **Step 4: GREEN** `node --test tests/node/test-scope-contract.test.mjs tests/node/role-policy.test.mjs` PASS, `npm run check:role-policy`, `node scripts/update-runtime-assets.mjs --check` PASS.
- [x] **Step 5: `instruction-contracts.json`**
  - 렌더 해시: 2026-11-22 plan T1 Step 7의 `node -e` 명령으로 계산(저장소에 쓰지 않음). `agentProfileBaseline.profiles` 20개 모두 변경.
  - `protected`: `shasum -a 256`으로 12개 변경(claude 5 `.md`, codex 5 `.toml`, `lib/policy/role-policy.json`, `shared/skill/runtime/role-policy.json`; 두 role-policy 값은 같아야 함).
  - `contracts[]`와 `revision` 유지.
  - 확인: `node --test tests/node/agent-fragments.test.mjs tests/node/instruction-layout.test.mjs`. base에서도 같은 이름으로 재현되는 실패는 기존 실패로 보고.
- [x] **Step 6: golden** `--diff` 예상 104줄 `~`(16 × references 3 = 48, `*/write/*` 8 × agents 5 = 40, 16 × `skills/arc/runtime/role-policy.json` = 16). 다르면 `--write` 전 hold하고 실제 목록 보고.
- [x] **Step 7: MANIFEST** 35항목 변경, 추가·삭제 없음(references 12, agents 20, role-policy 2, `agent-fragments.json` 1).
- [x] **Step 8: digest** T1 Step 6과 같은 절차.
- [x] **Step 9:** 관련 테스트·check 실행. 종료 `git status --porcelain` 기준은 T1과 같다.
- [x] **Step 10: 커밋(Orchestrator, 수락 뒤):** `refactor(policy): 최종 검증 흡수·최종 수정 사전 점검을 정책과 프로필에 반영`

**수용 기준:**
- A1·A2의 정책·프로필 반영(N10–N12), 4 플랫폼 managed 구역 일치
- P3 은퇴 문장 부재(정책, 32 대상, 렌더 프로필)
- 생성물 `--check` 통과, 런타임 코드 불변(`git diff f786e4a1 -- lib/runtime shared/skill/runtime ':!shared/skill/runtime/role-policy.json'` 비어 있음)

**관련 테스트(이유):** `test-scope-contract`(직접 갱신 계약), `role-policy`(정책 검증·projection), `agent-fragments`(렌더 해시), `instruction-layout`(protected 해시·canonical 규칙), `run-mode-contract`·`upgrade-harness`(fragment 읽음), `instruction-language`(생성 agents·references 언어), `plan-level-records-contract`(정책·references 문장), `composite-instructions`(references), `runtime-versions`·`runtime-assets`(런타임 페이로드의 `role-policy.json`), `plan`·`installed-layout-golden`·`manifest`(생성물), Python 3파일(references·agents 읽음)

**check:** `npm run check:role-policy`, `npm run check:manifest`, `node scripts/update-runtime-assets.mjs --check`, `node scripts/check-installer-parity.mjs`

**필수 QA·증거:** fresh QA, 생성기 출력(32 targets), 렌더 해시 20개·protected 12개 계산 근거, golden 목록, MANIFEST 35항목, digest 근거, 실패 판정

**Hold:** 생성 대상 수·golden·MANIFEST가 예상과 다를 때, SKILL.md나 지정 밖 대상이 바뀔 때, 지정 밖 단언을 고쳐야 할 때

**진행 기록 (T2):** 2026-11-23 수락. Implementer(codex bridge) 40파일 변경, RED 50건 → GREEN. 생성기 32 targets, 미러 1, golden 104항목, MANIFEST 35항목, 렌더 해시 20·protected 12, digest 8. fresh QA: C1–C7 proven, Node 관련 14파일 480 pass/0 fail/1 skip, check 4종 통과. Python 3파일 failures 485·errors 6: `eba2521` 대비 신규 0, 기준 실패 2건 해소(`test_final_reviewer_findings_on_committed_work` claude·codex), 기준선 재현 451·무관 40(Orchestrator 처분: 테스트·직접 입력·설정이 기준과 동일).

---

### Follow-up F1: 최종 Reviewer finding 수정 (v2)

**목표·범위:** N2a, N13을 적용하고 계약 테스트로 고정한다. 최종 Reviewer finding 수정이므로 설치된 v0.5.1 규칙에 따라 Implementer → Reviewer로 반복하고, 수정은 Reviewer 재확인이 끝날 때까지 커밋하지 않으며, 해결 후 후속 커밋 1개로 수락한다.

**선행:** T1·T2 수락·커밋, 최종 Reviewer 1회 완료.

**Files (allowedPaths, 15개):**
- Modify: `{claude,codex,gemini,grok}/skill/references/verification.md`(N2a, 손 편집 영역만), `{claude,codex,gemini,grok}/skill/references/commit.md`(N13, 손 편집 영역만), `tests/node/test-scope-contract.test.mjs`
- 생성 값 옮김: `tests/node/fixtures/instruction-contracts.json`(commit 절 `contracts[].text`의 해당 문장만 N13으로; 해시·`revision` 유지), `tests/node/fixtures/installed-layout-golden.json`, `MANIFEST.sha256`, `tests/node/plan.test.mjs`(digest가 실패할 때만)

- [x] **Step 1: RED** `lastTaskFinalScopeParagraph`를 N2a 적용 전문으로 갱신하고, 신규 `${platform} commit follow-up runs Orchestrator focused checks`(commit.md에 N13 문장 1회, 옛 `until resolved, then accept and create one focused follow-up commit.` 부재)를 추가한다. 실행 후 실패 이름 보고.
- [x] **Step 2:** 8개 문서 수정, fixture `contracts[].text` 해당 문장 교체.
- [x] **Step 3: GREEN** `test-scope-contract`, `instruction-layout` PASS.
- [x] **Step 4:** golden `--diff` 예상 32줄 `~`(16 레이아웃 × `skills/arc/references/{verification,commit}.md`), MANIFEST 8항목, digest 확인. 다르면 hold.
- [x] **Step 5:** 관련 테스트(`test-scope-contract`, `instruction-layout`, `composite-instructions`, `instruction-language`, `plan-level-records-contract`, `role-policy`, `plan`, `installed-layout-golden`, `manifest`, Python 3파일)와 check 4종 실행.
- [x] **Step 6: 커밋(Orchestrator, Reviewer 재확인·수락 뒤):** `docs(verify): skip 조건을 커밋 트리 판정으로 좁히고 commit 절에 사전 점검 추가`

**수용 기준:** N2a·N13 4 플랫폼 바이트 일치, 옛 문구 부재, managed 구역 불변, 생성물 `--check` 통과, 관련 테스트 신규 실패 없음, 최종 Reviewer 재확인 해결.

**진행 기록 (F1·최종 Reviewer):** 2026-11-23. 최종 Reviewer 1회차: blocking 0, should-fix 2(N2 (a) 오래된 판정, commit.md:22 사전 점검 누락), nit 3(변경 없음으로 처분: 운영 메모 / D4 / `check:role-policy` 간접 고정). 사용자 결정 "둘 다 수정" → v2. Implementer(codex bridge) 12파일, RED 8 → GREEN, golden 32·MANIFEST 8, 관련 Node 415/415, check 4종 통과, Python 이름 기준 신규 0. Reviewer 재확인(새 인스턴스, 4 플랫폼 원문 직접 대조): 두 finding 해결, N1–N13 4 플랫폼 바이트 일치, 신규 finding 없음. Orchestrator 사전 점검: `test-scope-contract`·`instruction-layout`·`installed-layout-golden`·`manifest` 238/238, `check:manifest`·`check:role-policy` 통과, golden `--diff` 0.

## 최종 검증 (T1·T2 수락·커밋 뒤)

**범위·시점:** T2 커밋 뒤 한 번. 개별 task 수락을 늦추지 않는다. 이번 실행은 설치된 v0.5.1 규칙을 따르므로(결정 D1) verified HEAD에서 fresh QA 1회, 시작·종료 `git status --porcelain` clean.

1. **계약 테스트 전부:** `tests/node/test-scope-contract.test.mjs`, `tests/node/plan-level-records-contract.test.mjs`, `tests/node/run-mode-contract.test.mjs`, `tests/node/composite-instructions.test.mjs`, `tests/node/instruction-layout.test.mjs`, `tests/node/agent-fragments.test.mjs`, `tests/test_harness_contract.py`
2. **check 전부:** `npm run check:role-policy`, `npm run check:manifest`, `node scripts/update-runtime-assets.mjs --check`, `node scripts/check-installer-parity.mjs`
3. **재변경 파일 관련 테스트:** 예상 중첩(T1 검증, T2 재변경): `{4 플랫폼}/skill/references/{verification,planning}.md`(managed 구역), `tests/node/test-scope-contract.test.mjs`, golden, `MANIFEST.sha256`, `tests/node/plan.test.mjs`. 관련 테스트: 위 계약 테스트, `installed-layout-golden`, `manifest`, `plan`, `instruction-language`, `role-policy`, Python 3파일. Orchestrator가 목록을 계산해 브리프에 적고 QA가 read-only `git diff`로 대조한다.
4. **전체 회귀 잠정 판정: 실행**
   - 트리거 1: `lib/policy/role-policy.json`·`lib/prompts/agent-fragments.json`은 32개 managed 대상·런타임 미러·20개 프로필 렌더에 쓰이는 공유 생성기 입력이고, references는 16 설치 레이아웃이 소비한다.
   - 트리거 2: 없음 예상(`f786e4a1`에서 바로 분기). 트리거 3: 없음 예상(manifest·lockfile·test 설정 불변). 트리거 4: 없음 예상(rule ID·CLI·export 불변). QA가 1·3·4를 독립 확인한다.
   - 명령: `npm test`, `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests`
   - 기존 실패가 있다(2026-11-22 최종 QA 기록: Node 실패 50, Python 실패 545·오류 7). "새 실패 없음"으로 판정하고 verification.md의 Baseline·Result comparison 절차를 적용한다.
5. **최종 Reviewer 1회(significant):** 모든 task 수락과 필수 QA 뒤 독립 Reviewer가 `f786e4a1..HEAD` 전체를 검토한다. 확인 항목: N1–N12 원문 일치, 4 플랫폼 바이트 일치, 은퇴 문장 잔존, 생성물이 생성기 출력과 같은지, 해시 근거, CLI 절(`:119`/codex `:117`)과의 일관성(P5), skip 조건 (a)–(e)의 논리적 완결성. finding은 설치된 v0.5.1 규칙(Implementer → Reviewer)을 따른다.

## 위험

- 생성 대상이 32개로 많다. 손 편집 혼입은 `check:role-policy`가 잡는다.
- golden·MANIFEST 예상 개수는 A3에 기대므로 틀리면 hold가 생긴다.
- 정책 문장이 길어져 references·agents 크기 한도(`instruction-layout`)에 걸릴 수 있다.
- 해시 수동 이동 시 키 오매칭 위험. 테스트 통과가 1차, 출력 근거가 2차 방어다.

## 결정 사항

- **D1** 이번 plan 실행은 설치된 v0.5.1 규칙(fresh final QA, Reviewer 병행 가능)을 따른다. 새 규칙은 T2 커밋 전에는 정의되지 않고, 실행을 지배하는 설치본은 v0.5.1이다.
- **D2** `role.orchestrator-boundary`는 바꾸지 않는다. N5·N11에 "without edits"가 있고, core는 SKILL.md에 렌더되므로 크기 한도·fixture 위험이 있다.
- **D3** CLI 절에 문장을 추가하지 않는다. 현행 문장과 모순이 없으며 Reviewer 확인 항목으로 둔다.
- **D4** commit.md의 plan-level 기록 열거(`:33`)는 바꾸지 않는다. N2 (c)가 분류된 진행 기록을 허용하고, 실제 기재 여부는 Orchestrator가 기존 규칙으로 판단한다. v2에서 `:22`의 최종 Reviewer 후속 커밋 문장에만 Orchestrator focused check 단계를 추가한다(N13).

## 개정 이력

| 버전 | 날짜 | 분류 | 내용 | 승인 |
|---|---|---|---|---|
| v1 | 2026-11-23 | — | 최초 계획 | 사용자 승인 2026-11-23 |
| v2 | 2026-11-23 | 최종 Reviewer finding | N2a(skip 조건 (a)를 커밋 트리 판정으로 좁힘), N13(commit.md 후속 커밋 전 Orchestrator focused check), Follow-up F1, D4 보정 | 사용자 승인 2026-11-23 ("둘 다 수정") |

## 자체 검토 체크리스트

- [x] A1 → N1·N2·N3·N4·N8(문서), N10·N12(b)(정책·프로필). 동일 QA 재실행 예외와 O3는 N2.
- [x] A2 → N5·N6(문서), N11·N12(c)(정책·프로필). 수정 금지, base 실행 없음, 트리거 충분성 포함.
- [x] O1(a): 병행 문장은 N1·N11에서 "fresh QA final verification"으로 한정.
- [x] P1: 손 편집·생성을 Files에서 구분, 선행 T1 → T2. 생성 집계 파일 중첩은 최종 검증 3에 나열.
- [x] P2: 정확한 경로, RED → 편집 → GREEN, 세 범주 관련 테스트.
- [x] P3: `retiredReferencePhrases`(T1), `retiredPhrases` 추가·옛 정책 문장 부재(T2).
- [x] P4: 전체 회귀 실행 판정, 계약 테스트·check 목록, 기존 실패 기준.
- [x] P5: 런타임 불변 단언(T2 수용 기준), CLI 절 일관성은 Reviewer 확인 항목(D3).
- [ ] 미검증: golden·MANIFEST 예상 개수(A3), Python 정규식이 N11 문장 분할에 영향받지 않는지. 둘 다 Step 9 실행으로 확인.
