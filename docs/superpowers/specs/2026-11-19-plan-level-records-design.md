# plan-level 진행 기록의 커밋 경로 — 설계 명세

- 날짜: 2026-11-19
- 상태: 승인됨 (2026-11-19 사용자 명시 승인, Q1 = 함께 싣음)
- 승인된 설계: `.git/arc/workflows/closing-commit/design-approved.md` (2026-11-19 사용자 명시 승인)
- 기준: master `ea1a3a2`
- 대상: managed worktree `.claude/worktrees/plan-level-records`, branch `feat/plan-level-records`
- 깊이: Bounded (짧은 spec + Bounded plan)

## 0. 결정 추적

| ID | 결정 | 출처 |
|---|---|---|
| D1 | 새 분류 "plan-level progress records". 승인된 계약을 보존하면 승인 불필요, 계약을 바꾸면 revision | 설계 결정 1 |
| D2 | 그 plan의 다음 커밋(최종 Reviewer finding 처리로 생긴 task 수락 커밋 또는 final Reviewer follow-up 커밋)에 함께 싣는다. "다른 task 기록 제외" 규칙의 유일한 예외 | 설계 2 |
| D3 | 남은 구현 작업이 없으면 커밋하지 않는다. canonical record에만 남기고 plan 문서는 바꾸지 않으며 working tree는 clean. 완료 보고에 명시 | 설계 3 |
| D4 | 기존 standalone `docs(plan)` closing 예외(pending revision용) 유지. plan-level 기록만으로는 발동하지 않음 | 설계 4 |
| D5 | non-blocking finding 사용자 결정 대기 중에는 전체 완료 보류. 수정 결정 → revision + 새 task(그 커밋에 기록 동승), 미수정 결정 → 다음 커밋이 없으면 canonical only | 설계 5 |
| D6 | 기록 처리는 전체 완료 보고와 push/PR/merge 권한 요청보다 먼저. 외부 권한 규칙 불변 | 설계 6 |
| D7 | Full Auto: non-blocking finding disposition은 승인 범위 내면 auto-decide. push/merge는 user | 설계 7 |
| D8 | 형식 `docs(plan): <description>` 유지. 새 trailer·role-policy operation 없음(text만 변경) | 설계 8 |
| D9 | cooperative CLI는 runtime 지원 추가 없이 문서에만 명시 | 설계 9 |
| D10 | configure-run-mode plan 소급 보충 제외 | 설계 10 |
| D11 | 이 작업 자체의 마무리에도 새 규칙 적용 | 설계 11 |
| D12 | pending revision으로 standalone `docs(plan)` closing 커밋이 만들어지면 그 커밋에 plan-level 기록도 함께 싣는다 | spec Q1, 2026-11-19 사용자 결정 |

## 1. 배경과 문제

- 현재 규칙은 task 진행 기록만 정의한다(`claude/skill/references/planning.md:118`, `commit.md:9`). "그 task 자신의 기록"만 "그 task 커밋"에 싣고 다른 task 기록은 제외한다(`commit.md:14`, role-policy `git.orchestrator-accept-commit`의 "Exclude other tasks").
- 최종 검증 결과, 최종 Reviewer verdict, finding disposition, 전체 완료 상태는 어느 task에도 속하지 않아 실을 커밋이 정해져 있지 않다.
- 별도 커밋은 standalone `docs(plan)` closing 예외 하나뿐이며(`commit.md:33`, `planning.md:124`) pending approved revision을 전제로 한다. plan-level 기록만 남으면 커밋하면 docs/fixup 금지 위반, 커밋하지 않으면 working tree가 dirty로 남는 공백이 생긴다.
- 사례: configure-run-mode plan(`docs/superpowers/plans/2026-11-19-configure-run-mode.md:383` "최종 검증" 행 등)은 FR 기록이 다른 task(T9) 커밋에 섞였고, 마지막 FR4 approve 기록은 남을 곳이 없었다. 소급 보충은 범위 밖(D10).

## 2. 범위와 비범위

**범위**
- 4개 플랫폼(`codex`, `claude`, `gemini`, `grok`)의 `skill/SKILL.md`, `skill/references/{commit,planning,handoff-prep,verification,handoff}.md` 문장
- `lib/policy/role-policy.json` 규칙 2개의 text
- 생성물: managed section, `shared/skill/runtime/` 사본, `MANIFEST.sha256`
- 계약 테스트와 fixture
- `docs/harness-operation.md:226`

**비범위**
- runtime/CLI 동작 변경, 새 trailer·operation·evidence 키(D8, D9)
- 외부 권한 규칙 변경
- configure-run-mode plan 소급 보충
- `tests/node/fixtures/installed-layout-golden.json` 갱신(§7 R2)

## 3. 정의

**plan-level progress records**는 다음 세 가지다.

1. 최종 verification 결과
2. 각 최종 Reviewer 라운드의 verdict와 finding disposition(사용자 결정 참조 포함)
3. 전체 완료 상태

승인된 계약을 보존하는 기록은 새 승인이 필요 없다. 목표·범위·기준·방법·위험·의존성·필수 검증을 바꾸면 기존 규칙의 plan revision이다. task 진행 기록(그 task의 checkbox, notes, results, evidence, status)과는 다른 분류다.

## 4. 규칙 변경(파일별)

위치는 claude 기준이다. 같은 문안을 4개 플랫폼에 적용한다. gemini·grok은 claude와 라인이 같고, codex는 planning.md +2행(120/126/187), verification.md -2행(51)이다. 새 문장은 기존 문장 뒤에 덧붙여 기존 계약 테스트 정규식이 계속 일치하게 한다.

### 4.1 `references/commit.md` (수동 섹션)

- **:14 step 2**: "its own progress records, eligible pending approved spec/plan revisions" → "its own progress records, eligible plan-level progress records, eligible pending approved spec/plan revisions".
- **:31 뒤 새 문단**:
  > Plan-level progress records are final verification results, each final Reviewer round's verdict and finding dispositions (including references to user decisions) and overall completion status. Preserving the approved contract, they need no new approval; changing it makes them a plan revision. They are the sole exception to excluding other tasks' records: Orchestrator includes them in that plan's next commit, either a task acceptance commit created by final Reviewer finding work or the final Reviewer follow-up commit. When no implementation work remains, such as a final Reviewer approval without findings or a user decision not to fix a non-blocking finding, Orchestrator creates no commit for them, keeps them only in the canonical handoff record, leaves the plan document unchanged and the working tree clean, and states this in the completion report. Plan-level progress records alone never trigger the standalone `docs(plan)` closing commit.
- **:33**: closing 예외 문장 유지. 끝에 추가(D12): "When this closing commit is made for pending revisions, it also carries the plan-level progress records."

### 4.2 `references/planning.md`

- **:118 첫 문장 뒤**:
  > Plan-level progress records (final verification results, final Reviewer round verdicts and finding dispositions with user-decision references, and overall completion status) follow [commit](commit.md#execution-time-plan-document-updates): they ride the plan's next task acceptance or final Reviewer follow-up commit, otherwise they stay only in the canonical record.
- **:124** "No separate docs/fixup commit is allowed outside this sole closing exception." 뒤에 "Plan-level progress records alone never trigger it." 추가.
- **Full Auto 표(:184)**: `Spec/plan revision within the original scope` 행 바로 뒤에 행 추가(D7):
  `| Non-blocking final Reviewer finding disposition | auto | Recommended disposition within approved scope; scope-expanding fixes → user |`
  push/merge 행은 변경하지 않는다.

### 4.3 `references/handoff-prep.md`

- **:89 끝**: "Plan-level progress records follow [commit](commit.md#execution-time-plan-document-updates) and alone never justify the closing commit." 추가.
- **:90**: "(including R-8 separation)" 뒤에 " and plan-level progress records carried by this commit" 추가.

### 4.4 `references/verification.md`

- **:53**: "(including R-8 separation)" 뒤에 ", or classified plan-level progress records carried by that commit" 추가.
- **:63 끝**:
  > Before the overall completion report and any push, PR or merge authorization request, Orchestrator verifies that plan-level progress records are carried by the verified next commit of the plan or, when none follows, recorded only in the canonical handoff record with the plan document unchanged and a clean working tree. While a user decision on a non-blocking final Reviewer finding is pending, hold overall completion; a fix decision follows plan revision and a new task whose accepted commit carries the records, and a no-fix disposition stays canonical only when no later commit follows.

### 4.5 `references/handoff.md:170`

끝에 추가:
> Plan-level progress records follow the same `task.paths` rule; when no task or follow-up commit follows, they stay only in the canonical record, and the cooperative CLI adds no support for them.

### 4.6 `SKILL.md:31` (Shared terms, Preservation rule)

"No separate docs/fixup commit except the standalone `docs(plan)` closing exception." 앞에 "Plan-level progress records ride the plan's next commit or stay only in the canonical record." 삽입.

### 4.7 `lib/policy/role-policy.json` (소스)과 생성 경로

- **`git.orchestrator-accept-commit` text**: 테스트가 단언하는 기존 "Exclude other tasks; pending approved spec/plan revisions follow planning.plan-revision"는 유지하고 뒤에 추가:
  > Plan-level progress records (final verification results, final Reviewer verdicts and finding dispositions, overall completion status) are the sole exception: include them in the plan's next task acceptance or final Reviewer follow-up commit; when no implementation work remains, keep them only in the canonical handoff record without changing the plan document or creating a commit.
- **`planning.plan-revision` text**:
  - 첫 문장 뒤: "Plan-level progress records preserving the approved contract also need no new user approval and alone never trigger the standalone docs(plan) closing commit."
  - 사후 검증 문장의 "or committed for other tasks after approval" 뒤: ", or plan-level progress records carried by that commit".
- `operations`, `evidence`, `roles`는 변경하지 않는다(D8).
- **생성 순서**: `node scripts/update-role-policy.mjs` → `node scripts/update-runtime-assets.mjs` → `node scripts/update-manifest.mjs` → `node scripts/check-installer-parity.mjs`. managed section(`[ARC role policy: contract begin]`…`end`)은 생성기로만 변경하고 직접 편집하지 않는다. §4.1–4.6의 수동 문장과 생성 섹션은 별개로 다룬다.

### 4.8 `docs/harness-operation.md:226`

끝에 추가:
> Plan-level progress records (final verification/Reviewer verdicts/dispositions/completion) ride the plan's next task or follow-up commit; with none, they stay canonical only, plan doc unchanged, never alone a closing commit.

## 5. 수용 기준

| AC | 기준 | 증거 |
|---|---|---|
| AC-1 | 4개 플랫폼 commit.md·planning.md에 plan-level progress records의 세 구성요소와 승인 경계(계약 보존 시 승인 불필요, 변경 시 revision)가 정의됨 | 계약 테스트 |
| AC-2 | "다른 task 제외"의 유일한 예외로서 다음 커밋(finding 처리 task 수락 커밋 또는 final Reviewer follow-up 커밋)에 동승하는 규칙이 commit.md(step 2 포함), planning.md, role-policy `git.orchestrator-accept-commit`에 있음 | 계약 테스트, role-policy 테스트 |
| AC-3 | 남은 구현 작업이 없으면 커밋 없음, canonical record에만, plan 문서 무변경, working tree clean, 완료 보고 명시. 기존 pending-revision closing 예외 문장(`commit.md:33`, `planning.md:124`, `handoff-prep.md:89`) 보존, plan-level 기록만으로는 발동하지 않음 명시 | 계약 테스트(기존 :36 정규식 유지 포함) |
| AC-4 | 최종 Reviewer finding 없는 approve가 AC-3 경로의 예로 명시 | 계약 테스트 |
| AC-5 | non-blocking finding 결정 대기 중 전체 완료 보류, 수정 → revision + 새 task 커밋 동승, 미수정 → canonical only 규칙이 verification.md에 있음 | 계약 테스트 |
| AC-6 | 기록 처리가 전체 완료 보고와 push/PR/merge 권한 요청보다 먼저라는 순서가 verification.md에 있음. `external.explicit-user-authority` text 불변 | 계약 테스트, diff 0 |
| AC-7 | 4개 planning.md Full Auto 표에 새 행이 정확히 1개, push/merge 행 불변 | `run-mode-contract.test.mjs` 갱신 후 GREEN |
| AC-8 | verification.md·handoff-prep.md 사후 검증이 커밋된 plan-level 기록을 허용 diff로 인정, 기존 R-10 정규식 계속 일치 | `tests/test_harness_contract.py` |
| AC-9 | 기존 금지 유지: amend, rewrite, 그 밖의 docs/fixup 커밋, 빈 커밋, 새 trailer·operation·evidence 없음. role-policy `operations`/`evidence` 배열 불변 | role-policy 테스트, diff |
| AC-10 | 4개 플랫폼 문장 동일, 생성물 `--check`·`check-installer-parity.mjs`·manifest 통과, handoff.md:170 갱신, runtime 코드 diff 0 | 생성 check, parity, diff |
| AC-11 | 새 계약 단언이 변경 전 RED, 변경 후 GREEN. 전체 스위트는 P0 기준선 대비 새 실패 0 | RED/GREEN 기록, 호스트 `npm test`와 python 계약 테스트 |

## 6. 검증 방법

- **P0 (Orchestrator, 호스트)**: `ea1a3a2` 기준선에서 `npm test`와 python 계약 테스트 실패 목록을 기록하고 installed-layout-golden 실패 여부를 직접 확인한다.
- **계약 테스트 RED→GREEN**: `tests/test_harness_contract.py`에 plan-level 항목 추가(codex·claude), 4개 플랫폼 node 계약 단언 추가(위치는 plan에서 정함), `tests/node/role-policy.test.mjs:78-91`에 새 text 단언, `run-mode-contract.test.mjs` 기대 섹션에 새 행, `instruction-contracts.json`의 codex/claude Shared terms·Automatic commit 섹션 text와 skill bytes/lines 갱신.
- **생성물 확인**: `update-role-policy.mjs --check`, `update-runtime-assets.mjs --check`, manifest 확인, `check-installer-parity.mjs`.
- **fresh QA**: task별 AC 범위.
- **최종 Reviewer**: 모든 task 수락 후 전체 변경 1회(finding이 있으면 Implementer → Reviewer 재확인).

## 7. 위험

- **R1** 덧붙인 문장이 기존 정규식(`test_harness_contract.py:36,61,68`, `role-policy.test.mjs:88-91`)을 깨뜨릴 수 있음 → 기존 문자열은 유지하고 뒤에만 덧붙임.
- **R2** installed-layout-golden은 기준선부터 실패(문서 증거) → 수정하지 않음. 같은 테스트 이름으로 계속 실패하면 새 실패 0으로 판정. P0에서 직접 확인.
- **R3** 4개 플랫폼 문구 drift → parity와 4개 플랫폼 단언.
- **R4** plan 문서에 미리 기록했는데 이후 커밋이 없어 dirty → plan 문서에는 다음 커밋을 staging할 때만 쓰고 그 전에는 canonical record에만 둔다.
- **R5** instruction-contracts fixture bytes/lines 수동 갱신 오류 → 실측값 사용, QA 대조.

## 8. 이 작업 자체의 마무리 (D11)

최종 Reviewer가 finding 없이 approve하면 별도 커밋을 만들지 않는다. 최종 검증 결과, Reviewer verdict, 완료 상태는 canonical handoff record(`.git/arc/handoff/`)에만 기록하고 plan 문서는 바꾸지 않으며 working tree를 clean으로 둔다. 완료 보고에 이를 명시한 뒤 push/PR 권한을 요청한다. finding이 있으면 그 follow-up 커밋에 기록을 함께 싣는다.

## 9. 해결된 질문

- **Q1 (해결, D12)**: pending revision 때문에 standalone `docs(plan)` closing 커밋이 만들어지면 그 커밋에 plan-level 기록도 함께 싣는다. AC-3의 "plan-level 기록만으로는 발동하지 않음"은 그대로 유지된다.

## 개정 이력

| Version | Approval time | Classification | Affected tasks | Reason |
|---|---|---|---|---|
