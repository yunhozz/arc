# 최종 Tester 완료 후 최종 Reviewer 순차 실행 설계

## 1. 배경과 현재 규칙

plan 작업에서는 모든 task를 수락·커밋한 뒤 final mode Tester를 한 번 실행합니다. 현재 지침은 이 Tester와 최종 Reviewer가 동시에 도는 것을 허용합니다. 아래 경로는 claude 기준이며, codex·gemini·grok에도 같은 문장이 있습니다. codex `verification.md`는 줄 번호가 2만큼 앞섭니다.

- `claude/skill/references/verification.md:24` (Final mode): "…the read-only final Reviewer MAY run concurrently. A new failure from final verification follows Implementer → Tester even after the final Reviewer has started; Reviewer evidence for affected files becomes stale and needs a refreshed-diff recheck."
- 같은 파일 `:50` (Undeterminable scope): "Until the user decides, final acceptance is held, while Reviewer and independent work continue."
- 같은 파일 `:72` (risk 표 plan 행): "…final independent whole-change Reviewer once after all accepted tasks/required checks/rechecks"
- 같은 파일 `:76`: "Plans review once at final relevant state after task acceptances/checks;"
- 같은 파일 `:89` (`#final-plan-reviewer-correction-loop`): "Before it, risk checks/Tester failures/unmet criteria still need Implementer → Tester."
- 같은 파일 `:108`: "Final Tester findings still use Implementer → Tester."
- 같은 파일 `:151`: "Initial final review needs all tasks accepted/current required Tester, never task acceptance/commit prerequisite."
- `claude/skill/SKILL.md:20`: "Separate Tester findings remain Implementer → Tester."
- `claude/skill/references/planning.md:69`: "significant work lists one Reviewer after all task acceptances/risk checks."
- `lib/policy/role-policy.json`의 `review.final-plan-recheck`: "Separate Tester findings and new failures from final verification, which may run concurrently with the final Reviewer, follow Implementer → Tester; Reviewer evidence for affected files then needs a refreshed-diff recheck."
  - 이 규칙은 관리 섹션으로 다음 위치에 생성됩니다.
    - 4개 플랫폼의 agent 템플릿 5종
    - `planning.md`, `handoff.md`, `verification.md`
    - 런타임 사본 `shared/skill/runtime/role-policy.json`
- `lib/prompts/agent-fragments.json`의 `planner.final-plan-recheck`: "Preserve required Tester and Tester failure rechecks before the initial final review."
- `lib/prompts/agent-fragments.json`의 `reviewer.final-plan-findings`: "…before this final stage. New failures from final verification follow Implementer → Tester; affected evidence needs a refreshed-diff recheck."

## 2. 목표

최종 Reviewer는 final mode Tester 작업이 완전히 끝난 뒤에만 시작합니다. 사용자가 결정한 사항이고, 전 과정을 순차로 진행합니다. 종결 조건은 다음과 같습니다.

1. final Tester 보고가 전달되었습니다.
2. 새 실패를 모두 Implementer → Tester 재확인으로 해결했습니다.
3. 사용자가 승인한 full regression이 있으면 끝났습니다.
4. 판정할 수 없는 범위(undeterminable-scope) 항목을 모두 처분했습니다. 처분 방법은 승인된 full regression 완료, CI substitution 수락, unverified 처분 중 하나입니다.
5. new-failure candidate와 intermittent candidate에 대한 Orchestrator 처분이 끝났습니다. 이 조건은 사용자가 Q1에서 포함을 선택해 추가했습니다.

## 3. 비목표 (순서 외에는 바꾸지 않음)

- no-plan 흐름과 task mode 규칙
- final mode의 실행 범위, trigger, baseline, 결과 비교 규칙
- 최종 Reviewer 수정 루프: Implementer → Reviewer로 진행하고 Tester를 다시 배정하지 않는 방식
- Tester finding을 Implementer → Tester로 처리하는 경로
- unrelated failure의 처분 시점
- role-policy의 구조 필드: `id`, `roles`, `effect`, `operations`, `evidence`, `controls`
- `review.significant-plan` 문구. 여기서 "required Tester"는 final mode를 포함한다고 해석합니다.
- 협동 CLI 런타임 코드
- `docs/superpowers/` 아래의 과거 기록

## 4. 도달할 수 없게 되는 문구 처리

순서를 바꾸면 Reviewer가 시작된 뒤 final verification에서 새 실패가 나오는 경우가 정상 흐름에서는 생기지 않습니다. 그래서 다음 문구를 삭제하고 "리뷰 시작 전에 종결한다"는 내용으로 다시 씁니다.

- "even after the final Reviewer has started"
- "which may run concurrently with the final Reviewer"
- "affected evidence needs a refreshed-diff recheck"

순서를 어긴 경우는 기존 재사용 규칙("Reuse evidence only for matching … flow position")으로 이미 무효가 됩니다. 여기에 더해 Final mode 문단에 "Reviewer output produced before that point is not the initial final review."라는 문장을 명시합니다.

## 5. 교체 문안 (4개 플랫폼 동일, 영문은 정확히 이대로)

**R1** `verification.md` Final mode 문단 꼬리. "While it runs, … needs a refreshed-diff recheck."를 다음으로 바꿉니다.

> While it runs, neither Orchestrator nor any Implementer writes in that workspace. A new failure from final verification follows Implementer → Tester. The final Reviewer starts only after final-mode Tester work concludes: the final Tester report is delivered, every new failure is resolved through Implementer → Tester recheck, every new-failure candidate and intermittent candidate is dispositioned, any approved full regression is complete and every undeterminable-scope item is dispositioned under **Undeterminable scope** below. Reviewer output produced before that point is not the initial final review.

**R2** `verification.md` Undeterminable scope 문단:

> Until the user decides, final acceptance and the final Reviewer are held, while independent work continues.

**R3** risk 표 plan 행 끝:

> …final independent whole-change Reviewer once after all accepted tasks/required checks/rechecks and concluded final-mode Tester work |

**R4** `:76`:

> Plans review once at final relevant state after task acceptances/checks and concluded final-mode Tester work;

**R5** `:89`:

> Before it, risk checks/final-mode Tester work/Tester failures/unmet criteria still need Implementer → Tester and conclude.

**R6** `:108`:

> Final-mode Tester findings use Implementer → Tester and conclude before the initial final review.

**R7** `:151`:

> Initial final review needs all tasks accepted/current required Tester/concluded final-mode Tester work, never task acceptance/commit prerequisite.

**R8** `SKILL.md:20`:

> Tester findings remain Implementer → Tester; final-mode Tester work concludes before that review begins.

**R9** `planning.md:69`:

> significant work lists one Reviewer after all task acceptances/risk checks and concluded final-mode Tester work.

**R10** `lib/policy/role-policy.json`의 `review.final-plan-recheck.text` 전문:

> Complete required Tester, Tester failure rechecks and final-mode Tester work before the initial final overall Reviewer review; final-mode Tester work concludes when its report is delivered, its new failures are resolved through Implementer → Tester recheck, its new-failure and intermittent candidates are dispositioned, any approved full regression is complete and every undeterminable-scope item is dispositioned. Once that review begins on plan work, every final Reviewer finding, including behavior, follows Implementer → Reviewer without Tester reassignment until resolved. Keep corrections uncommitted through Reviewer rechecks, then accept and create one focused follow-up commit. Tester findings and new failures from final verification follow Implementer → Tester before that review begins. Preserve required Tester outside this final Reviewer exception.

**R11** `planner.final-plan-recheck` fragment의 마지막 문장:

> Preserve required Tester, Tester failure rechecks and concluded final-mode Tester work before the initial final review.

**R12** `reviewer.final-plan-findings` fragment의 마지막 문장. "New failures from final verification … refreshed-diff recheck."를 다음으로 바꿉니다.

> Final-mode Tester work, including Implementer → Tester rechecks of its new failures, concludes before this final stage begins.

`planner.commit-boundary` fragment는 그대로 둡니다. R11이 같은 내용을 담고 있고, `tests/test_arc_policy.py`의 정규식을 보존하기 위해서입니다.

## 6. 생성, 테스트, manifest

1. R1–R9, R11, R12는 직접 수정하고, R10은 `lib/policy/role-policy.json`에서 수정합니다.
2. `node scripts/update-role-policy.mjs`로 관리 섹션을 다시 생성하고 `npm run check:role-policy`로 확인합니다.
3. `node scripts/update-runtime-assets.mjs`로 `shared/skill/runtime/role-policy.json`을 갱신하고 `--check`로 확인합니다.
4. `tests/node/test-scope-contract.test.mjs`를 갱신합니다.
   - `finalVerificationParagraph`, `finalFailureRule`, `finalPlanRecheckSentence`, `reviewerFindingsSentence`, undeterminable 문구 기대값을 새 문안으로 바꿉니다.
   - "Reviewer starts only after final-mode Tester work concludes"의 배치를 검증합니다.
   - retired 문구 4종이 없는지 검증합니다: "MAY run concurrently", "even after the final Reviewer has started", "which may run concurrently with the final Reviewer", "while Reviewer and independent work continue".
5. `tests/node/fixtures/instruction-contracts.json`을 갱신합니다.
   - R3, R4, R8에 맞춰 원문을 바꿉니다.
   - `agentProfileBaseline.profiles`의 렌더 해시 20개를 다시 계산합니다.
   - `protected` 맵에서 이번에 바뀌는 12개 파일의 바이트 해시를 다시 계산합니다: `claude/agents/arc-*.md` 5개, `codex/agents/arc-*.toml` 5개, `lib/policy/role-policy.json`, `shared/skill/runtime/role-policy.json`. `instruction-layout.test.mjs`가 이 맵을 검사합니다.
   - `tests/node/fixtures/installed-layout-golden.json`은 `node tests/node/fixtures/installed-layout.mjs --diff`로 바뀐 항목이 의도한 설치 경로에만 있는지 확인한 뒤 `--write`로 다시 생성합니다. `installed-layout-golden.test.mjs`가 이 파일을 검사합니다.
6. 마지막으로 `node scripts/update-manifest.mjs`를 실행하고 `npm run check:manifest`로 확인합니다.

## 7. 위험

- 관리 규칙을 바꾸면 profile 해시, fixture, MANIFEST가 연쇄로 바뀝니다. 하나라도 빠뜨리면 contract test가 실패하므로 6절의 순서를 지킵니다.
- 4개 플랫폼의 문구가 서로 어긋날 수 있습니다. test-scope 절은 byte-identical 검사로 막고, R2–R9는 개수 grep으로 보완합니다.
- 기존 실패(51–55)와 불안정한 테스트가 있습니다. 결과는 새 실패가 생겼는지만으로 판단합니다.
- 순차로 바꾸면 최종 단계의 대기 시간이 늘어납니다. 사용자가 감수하기로 한 tradeoff입니다.
- 문서 크기 예산 테스트가 있는지는 확인하지 못했습니다. Tester가 전체 contract test를 돌려 확인합니다.

## 8. 수락 기준

- **AC1** 4개 플랫폼 `verification.md`의 Final mode 문단 꼬리가 R1과 정확히 같고, test-scope 절이 플랫폼 간 byte-identical입니다.
- **AC2** R2–R7이 4개 플랫폼에 각각 정확히 한 번씩 있습니다.
- **AC3** R8(`SKILL.md`)과 R9(`planning.md`)가 4개 플랫폼에 반영되어 있습니다.
- **AC4** 다음을 모두 만족합니다.
  - `review.final-plan-recheck.text`가 R10과 같고, 구조 필드는 바뀌지 않았습니다.
  - `check:role-policy`와 runtime asset `--check`가 통과합니다.
  - 관리 섹션 생성 대상 전부에 반영되어 있습니다.
- **AC5** R11과 R12가 fragment에 반영되어 있고, 렌더된 planner/reviewer profile에 각각 정확히 한 번 나옵니다.
- **AC6** `docs/superpowers/`를 제외한 파일에서 retired 문구 4종을 grep하면, 매치는 부재 검증용 상수 `retiredFinalOrderPhrases`(`tests/node/test-scope-contract.test.mjs`) 안에만 있습니다. 같은 범위에서 `refreshed-diff recheck`는 0건입니다.
- **AC7** test-scope-contract, agent-fragments, instruction-layout, role-policy 테스트가 새 문장의 존재와 배치를 검증합니다.
- **AC8** MANIFEST를 다시 생성했고 `check:manifest`가 통과합니다.
- **AC9** 3절의 비목표 대상, 런타임 코드, `docs/superpowers/` 기존 기록은 바뀌지 않았습니다.
- **AC10** 기준선과 비교해 새 테스트 실패가 없습니다.

## 9. 결정 기록

- Reviewer 시작 시점: final-mode Tester 작업이 완전히 끝난 뒤로 정했습니다. 사용자 선택, 2026-11-25.
- 실행 대상: 현재 체크아웃의 새 브랜치 `chore/final-tester-before-reviewer`로 정했습니다. 사용자 선택, 2026-11-25.
- Q1: new-failure candidate와 intermittent candidate의 처분을 종결 조건에 포함합니다. 사용자 선택, 2026-11-25.
- 개정 v2 (2026-11-25, Orchestrator, plan 작성 중 발견): §6에 `protected` 해시 12개와 installed-layout golden 재생성을 추가하고, AC6이 부재 검증 상수 안의 매치를 허용하도록 고쳤습니다. 동작 규칙(R1–R12)은 바뀌지 않았습니다.

## 10. 계획 깊이와 최종 검증 잠정 판단

- 경로는 Architectural이고 plan이 필요합니다. 공유 역할 계약과 검증 lifecycle 순서를 바꾸고, 4개 플랫폼의 생성물에 영향이 있기 때문입니다.
- top-level task는 T1 하나입니다. 정책·profile·테스트·manifest 계약은 서로 떼어낼 수 없습니다(`planning.md` "Inseparable policy/profile/tests/manifest contracts start in one task").
- 최종 검증 trigger 잠정 판단:
  - (1) 공유 모듈: 해당합니다. `role-policy.json`, `agent-fragments.json`, runtime 사본이 이 경우입니다. 이 파일들을 참조하는 테스트를 역추적해 실행합니다.
  - (2) 통합 변경: 해당하지 않을 것으로 예상합니다.
  - (3) 의존성/설정: 해당하지 않습니다.
  - (4) 공개 인터페이스: 해당하지 않습니다.
