# QA 소유 기준선 확인·최종 검증과 verify 런타임 삭제 설계 (spec)

- 날짜: 2026-11-22
- 상태: v4 (v3 승인 2026-11-22, v4 최종 Reviewer finding 반영 개정 승인 2026-11-22)
- 대상: `/Users/yunho/Desktop/project/arc/.claude/worktrees/qa-owned-verification`, 브랜치 `feat/qa-owned-verification` (2026-11-22 생성·검증), base `5f6fa2e95e1415d44467eab235115d11998f4d34`
- 경로·위험: Architectural, significant (검증 정책, 공유 fragment, 공개 CLI 제거)
- 승인 근거: 설계 승인(2026-11-22, 사용자). D1–D5와 규칙 방향을 승인함. 이후 사용자가 D4를 D4′(정적 분류 + 필요할 때만 임시 base worktree)로 바꿈(2026-11-22)
- 저장 예정 경로: `docs/superpowers/specs/2026-11-22-qa-owned-verification-design.md`

## 1. 배경
지금 규칙에서 기준선과 최종 검증은 Orchestrator가 맡습니다. Orchestrator는 승인된 base에서 기준선을 미리 기록하고, 모든 task가 끝나면 clean worktree에서 "task 관련 테스트 합집합 + 계약 테스트 + check"를 직접 백그라운드로 실행합니다. 이를 위해 `verify-cli` 런타임 도구(`verify-start/status/compare/rerun/cleanup`)가 있습니다.

이 방식의 비용은 세 가지입니다.
- 사전 기준선에 드는 실행 비용과 캐시 복잡도
- Orchestrator가 테스트를 직접 실행하는 역할 혼합
- host별 detach·sandbox 승인 규칙

사용자는 이를 QA로 옮기고 런타임 도구를 삭제하기로 결정했습니다(D1–D5).

## 2. 목표 · 비목표
목표
- G1: 사전 기준선 기록을 폐지합니다. QA는 HEAD에서 실패한 테스트만 판정합니다. 먼저 diff로 정적 분류하고, 그것으로 가를 수 없는 실패만 base에서 같은 이름으로 재실행합니다(D1, D4′).
- G2: 최종 검증은 모든 task를 수락·커밋한 뒤 fresh QA 1회로 합니다. 범위는 계약 테스트 전부, check 스크립트 전부, 재변경 파일의 관련 테스트입니다. 전체 회귀는 4 트리거에 해당할 때만 QA가 실행합니다(D2).
- G3: verify 런타임 도구, 전용 테스트, 설치 자산, golden 항목, MANIFEST 항목, 문서 절을 삭제합니다(D3).
- G4: base worktree는 미리 만들지 않습니다. 정적 분류 뒤 base 재실행이 필요한 실패가 남았을 때만 Orchestrator가 `.claude/worktrees/` 밖의 `<git-common-dir>/arc/base/<workflow>`에 임시 worktree를 하나 만듭니다. 그 workflow 안에서 재사용하고, 모든 최종 판정 뒤 지웁니다(D4′). 목적은 작업용 worktree와 섞여 혼동이 생기지 않게 하는 것입니다.

비목표
- 사용자 저장소에 남은 `<git-common-dir>/arc/verify` 기록과 임시 worktree는 안내하거나 정리하지 않습니다(D5).
- 다음은 바꾸지 않습니다.
  - 테스트 3분류 규칙, 간헐 실패 단독 재실행 규칙, 이름 단위 비교, 실패 은폐 금지
  - `review.final-plan-recheck` 루프와 `lib/policy/role-policy.json`
  - `lib/runtime/verification.mjs`(협동 CLI)
  - 과거 `docs/superpowers` 문서
  - commit·planning·handoff의 "final verification results" 같은 plan-level 기록 용어
- 설치기 동작은 바꾸지 않습니다(§7.1에서 확인했고 변경이 필요 없습니다).

## 3. 용어
- **기존 실패 (baseline failure)**: HEAD에서 실패한 테스트가 승인된 base worktree에서도 같은 이름으로 실패한 경우입니다. 정책의 "classify each failure as baseline or current"에서 baseline에 해당합니다.
- **새 실패 (new failure)**: HEAD에서 실패했고, base에서는 통과했거나 그 테스트나 파일이 없는 경우입니다. finding입니다.
- **새 실패 후보 (new-failure candidate)**: HEAD에서 실패했지만 base 결과로 판정할 수 없는 경우입니다(미실행, 환경 차단, 로드 실패, 이름 없음). base에서도 같은 로드 실패가 나면 "새 실패 후보(base 동일)"로 둡니다. 기존 실패로 흡수하지 않으며, Orchestrator가 disposition합니다.
- **변경 무관 실패 (unrelated failure)**: HEAD에서 실패했지만, 그 테스트 파일과 테스트가 직접 import·load하는 모듈, 읽는 fixture·데이터, 해당 테스트 설정이 base..HEAD에서 하나도 바뀌지 않은 경우입니다. 실행이 아니라 diff에 근거한 분류이므로 기존 실패로 확정하지 않습니다. finding도 아니며 따로 보고하고, Orchestrator가 disposition합니다.
- **base worktree**: 승인된 base 리비전의 clean detached worktree입니다. 필요할 때만 Orchestrator가 `<git-common-dir>/arc/base/<workflow>`에 만듭니다. `.claude/worktrees/`나 실행 대상 worktree 안에는 두지 않습니다.
- **재변경 집합 X_i**: task i의 focused commit을 C_i로 둡니다. task i QA가 검증한 파일 집합 V_i는 바꾼 파일과 실행한 관련 테스트 파일입니다. 이때 X_i = V_i ∩ `git diff --name-only C_i HEAD`입니다. 최종 재변경 목록은 ∪X_i에, 어느 task QA도 검증하지 않은 커밋이 base..HEAD에서 바꾼 비문서 파일을 더한 것입니다.

## 4. 규칙 요구사항
**task QA의 실패 판정 (2단계)**
- R-1: 1단계 정적 분류. QA는 실패한 테스트마다 읽기 전용 diff로 다음 중 바뀐 것이 있는지 확인합니다. task QA는 커밋 전 작업을 검증하므로 `git diff --name-only <approved base>`(작업 트리)에 `git status --porcelain`의 untracked를 더하고, 최종 QA는 `git diff --name-only <approved base> HEAD`를 씁니다(v4, B1): 테스트 파일, 그 파일이 직접 import·load하는 모듈, 읽는 fixture·데이터, 해당 test 설정.
  - 하나도 바뀌지 않았으면 "변경 무관 실패"로 분류하고 base를 실행하지 않습니다.
  - 하나라도 바뀌었거나 판단할 수 없으면(동적 import, 이름 없는 실패, 파일 단위 로드 실패 포함) 2단계 대상으로 보고합니다. 근거 경로를 함께 적습니다.
- R-2: 2단계 base 재실행. 2단계 대상이 있을 때만 Orchestrator가 base worktree를 만듭니다(이미 있으면 재사용). 경로와 prerequisite 상태(준비됨 / 미준비 + 필요한 명령)를 현재 QA에게 후속 지시로 보냅니다. Orchestrator는 그 worktree에서 테스트를 실행하지 않습니다. prerequisite는 생성 때 준비하거나 QA가 환경 차단을 보고한 뒤 준비합니다(v4, N1). 모든 최종 판정 뒤 clean이면 Orchestrator가 지웁니다. 이 ARC 소유 base worktree는 Preservation rule의 worktree 삭제 금지에 대한 유일한 예외이며, clean이 아니면 삭제를 보류하고 사용자에게 넘깁니다(v4, B2). 위치 금지 문구는 host 중립으로 씁니다("a managed worktree directory (such as `.claude/worktrees/`)", v4, N4). QA는 대상 테스트만 같은 이름으로 base worktree에서 단독 실행합니다(Node `--test-name-pattern`, Python node id).
- R-3: 2단계 판정표

| HEAD | base 결과 | 판정 |
|---|---|---|
| 실패 | 같은 이름 실패 | 기존 실패 |
| 실패 | 통과 / 테스트 없음 / 파일 없음 | 새 실패 |
| 실패 | 미실행 / 환경 차단 / 로드 실패 / 이름 없음 | 새 실패 후보 |
| 파일 로드 실패 | 같은 파일 로드 실패 | 새 실패 후보(base 동일), Orchestrator disposition |
| 파일 로드 실패 | 같은 파일 로드 성공 | 새 실패 |

- R-4: (2단계) base에 prerequisite가 필요하거나 sandbox 때문에 실행할 수 없으면, QA는 설치하거나 생성하지 않고 환경 차단으로 보고합니다. 그러면 Orchestrator가 prerequisite를 준비하거나, 그 base worktree를 workspace로 하는 QA를 따로 배정합니다. 둘 다 막히면 그 실패는 새 실패 후보로 남고 Orchestrator가 disposition합니다(v4, N3).
- R-5: 간헐 진단은 HEAD에서만 단독으로, 브리프 한도까지(기본 3회) 합니다. 정적 분류와 base 재실행은 분류이지 간헐 진단이 아닙니다. 간헐 의심 테스트는 분류와 별도로 진단합니다.
- R-6: 보고 행에는 다음을 적습니다.
  - 테스트 이름·파일
  - HEAD 명령·결과
  - 1단계 결과(바뀐 관련 경로 목록 또는 "변경 없음")
  - 2단계를 했다면 base 리비전·명령·결과(`pass`/`fail`/`absent`/`load-fail`/`not-run`)
  - 판정
  - 단독 재실행 횟수와 통과 여부
  - 환경 제약

**최종 QA**
- R-7: 모든 task를 수락·커밋한 뒤, 실행 대상 worktree의 verified HEAD에서 fresh QA 1회로 수행합니다. 시작과 종료 때 `git status --porcelain`을 기록하고, clean이 아니면 환경 차단으로 최종 검증을 보류합니다. 수행 중에는 Orchestrator와 Implementer 누구도 그 workspace에 쓰지 않습니다(v4, N2). 읽기 전용 final Reviewer는 병행할 수 있습니다.
- R-8: 범위는 세 가지입니다. (a) 계약 테스트 전부, (b) check 스크립트 전부, (c) 재변경 파일의 관련 테스트(§3). task QA에서 통과한 합집합은 다시 실행하지 않습니다.
- R-9: Orchestrator가 재변경 목록을 계산해 브리프에 적습니다. QA는 읽기 전용 `git diff`로 대조하고, 3분류 안에서만 이유를 붙여 추가할 수 있습니다. 목록이 비면 그 이유를 보고합니다.
- R-10: 전체 회귀
  - 4 트리거 문안은 그대로 둡니다.
  - Orchestrator는 잠정 판정과 근거(트리거 2의 통합 이력 포함)를 브리프에 적습니다.
  - QA는 base..HEAD diff와 log로 (1)(3)(4)를 독립적으로 확인합니다.
  - 어느 쪽이든 "해당" 또는 "판정 불가"이면, QA가 추가 승인 없이 1회 실행합니다. 그 실패에도 R-1–R-6을 적용합니다.
- R-11: 최종 QA의 새 실패는 Reviewer가 시작한 뒤에도 Implementer → QA로 갑니다. 영향받는 파일의 Reviewer 증거는 refreshed-diff로 다시 확인해야 합니다.

**Orchestrator 잔여 책임**
- R-12: Orchestrator에게 남는 책임은 다음과 같습니다. 기준선·최종 검증 테스트는 직접 실행하지 않습니다. 단, risk-scaled execution의 "Small, low risk" 경로에서 Orchestrator가 하는 focused checks는 이 변경의 범위 밖이며 그대로 둡니다.
  - base 승인
  - 2단계가 필요할 때만 base worktree·prerequisite 준비, 모든 최종 판정 뒤 정리
  - 최종 QA 브리프(재변경 목록, 트리거 잠정 판정)
  - 변경 무관 실패·새 실패 후보·간헐 결과의 disposition
  - 수락과 완료

**브리프 입력**
- R-13: 기준선 기록 참조와 `runId` 문장을 삭제합니다. 그 대신 다음을 넣습니다.
  - 승인 base 리비전
  - (base worktree가 이미 있으면) 그 경로와 prerequisite 상태
  - 관련 테스트 목록과 이유
  - 재실행 한도
  - 최종 QA인 경우 재변경 목록과 트리거 판정

**문서·프로필**
- R-14: verification.md 절 재작성(§5.1), handoff-prep 교체(§5.2), coordination 문장 삭제(§5.3), fragment 4문장과 implementer 1문장 교체(§5.4). 네 플랫폼(claude/codex/gemini/grok)에 같은 바이트로 적용합니다. 플랫폼 고유 문구는 해당 절 밖에만 있습니다.

## 5. 문안 초안

### 5.1 verification.md "Test scope and result comparison"
`**Task checks and rechecks**` 단락은 그대로 둡니다. 나머지 네 단락을 아래로 바꿉니다. 그리고 다음 줄들을 삭제합니다. 그러면 `**Result comparison:**` 바로 뒤에 빈 줄과 `<a id="risk-scaled-execution"></a>`가 옵니다.
- `<a id="final-verification-runtime-commands"></a>`
- `## Final verification runtime commands`
- 그 단락(claude/gemini/grok 30–33행, codex 28–31행)

```
**Final verification** runs once after all tasks are accepted and committed, as one fresh QA assignment at the verified HEAD of the execution target worktree: all contract tests, all check scripts and the related tests of re-changed files; it does not rerun the union of tests that task QA already passed. A re-changed file is a file that a task's QA verified, as a changed file or a related test file it ran, and that a later commit changed after that task's focused commit (`git diff --name-only <task commit> HEAD`), plus every non-documentation file changed in base..HEAD by a commit that no task QA verified. Orchestrator computes the list and cites it in the brief; QA cross-checks it with read-only `git diff`, MAY add items only within the three categories above with reasons, and reports the reason when the list is empty. QA records `git status --porcelain` at start and end; a state that is not clean is an environment block that holds final verification. While it runs, neither Orchestrator nor any Implementer writes in that workspace; the read-only final Reviewer MAY run concurrently. A new failure from final verification follows Implementer → QA even after the final Reviewer has started; Reviewer evidence for affected files becomes stale and needs a refreshed-diff recheck.

**Full regression** runs once within final verification only if at least one trigger applies: (1) the change modifies a shared module; (2) changes made by others were integrated after the approved base, by merge, rebase onto a newer base or cherry-pick; (3) the change modifies dependency manifests or lockfiles, language or runtime versions, or build or test configuration; (4) the change removes, renames or changes the signature of a public interface such as an exported function, CLI option or configuration key. A shared module is code, configuration, schema, data or generator input that more than one task, role, component or execution or delivery path imports, loads or renders at run time, including its mirrors and generated outputs; documentation read only by people and modules used by a single component are not shared. Decide from actual consumers; when they cannot be determined, treat the module as shared. Planner records a provisional judgment in the plan. Orchestrator cites its provisional judgment and reasons, including the integration history for trigger (2), in the final QA brief, and QA independently checks triggers (1), (3) and (4) from the base..HEAD diff and log. If either finds a trigger applies or cannot determine applicability, QA runs it once without further authorization; if no trigger applies, omit it and report the reason. Change size, risk level alone and out-of-scope failures seen during task checks are not triggers; report such failures as findings. Full regression failures follow the base check below.

**Baseline:** No baseline run is recorded in advance, and no base worktree is prepared in advance. QA classifies each failure in two steps. First, a static check against the approved base: task QA, which verifies uncommitted work, uses read-only `git diff --name-only <approved base>` plus the untracked files from `git status --porcelain`; final verification QA uses `git diff --name-only <approved base> HEAD`. QA checks whether the test file, the modules it directly imports or loads, the fixtures or data it reads, or its test configuration changed. If none changed, it is an unrelated failure: report it separately with that evidence; it is not a finding, and Orchestrator dispositions it. Because it rests on the diff, not a run, NEVER report it as a baseline failure. If any changed, or the check cannot decide (for example a dynamic import, a failure without a test name, or a file-level load failure), report the failure as needing a base run, with the changed paths. Second, only for those failures, Orchestrator prepares a clean detached worktree of the approved base revision at `<git-common-dir>/arc/base/<workflow>`, never under a managed worktree directory (such as `.claude/worktrees/`) or inside the execution target worktree, reuses it for that workflow, runs no tests there, and sends its path and prerequisite state (prepared, or not prepared with the needed commands) to the current QA. After all final dispositions Orchestrator removes it only if it is still clean; this ARC-owned base worktree is the only exception to the Preservation rule's worktree-deletion ban, and any other state holds removal for the user. QA runs only those test names alone in the base worktree, for example with Node `--test-name-pattern` or a Python node id. A failure under the same name at base is a baseline failure; a pass at base, or a test or file absent at base, makes it a new failure; a base run that was not performed, was blocked by the environment, failed to load or lacks the name makes it a new-failure candidate. NEVER absorb a candidate as a baseline failure. Check a file-level load or collection failure by loading the same file at base; an identical load failure at base stays a new-failure candidate (same at base) for Orchestrator disposition. If base needs prerequisites or the sandbox prevents running there, QA installs or generates nothing and reports an environment block; Orchestrator then prepares the prerequisites or assigns a separate QA whose workspace is the base worktree. If both are blocked, those failures stay new-failure candidates for Orchestrator disposition. Static checks and base reruns classify failures; they are not intermittency diagnosis.

**Result comparison:** Compare failures by test name; only new failures are findings, and unrelated failures and new-failure candidates need Orchestrator disposition. Report baseline and unrelated failures separately. Identify tests by name from structured results such as JUnit XML, TAP or a declared line pattern; a failure without a test name, or in a command or file whose results are incomplete, is a new-failure candidate, never a baseline failure. Report intermittent candidates, tests whose outcomes differ across runs with the same inputs, separately from baseline and new failures. Report the slowest files and tests (default ten) for information only. If a failure looks intermittent, rerun only that test in isolation at HEAD, up to three times unless the brief sets another limit. This is diagnosis, not an automatic retry. Report "passes in isolation: yes/no" and the rerun count. A pass in isolation never erases the original failure; Orchestrator dispositions it. A failure in isolation is a new-failure finding. For each failure report the test name and file, HEAD command and result, static-check result (changed related paths, or none), base revision, command and result (pass, fail, absent, load-fail or not-run) when a base run was needed, verdict, isolated rerun count and outcome, and environment limits.
```

### 5.2 handoff-prep.md "Verification brief inputs" (95행, 4 플랫폼)
현재 원문:
> Implementer and QA briefs that assign checks MUST include the baseline record reference (revision, commands, environment and failures by test name, with baseline-incomplete files marked), the related-test list with reasons and the intermittent-failure isolated rerun limit under [verification](verification.md#test-scope-and-result-comparison). While a background baseline run is still active, the brief MAY cite its `runId` and recording conditions instead of the completed record; the executor's comparison waits for its completion.

새 원문(test-scope 링크는 정확히 1개를 유지합니다):
> Implementer and QA briefs that assign checks MUST include the approved base revision, the base worktree path and its prerequisite state when one already exists (prepared, or not prepared with the needed commands), the related-test list with reasons and the intermittent-failure isolated rerun limit under [verification](verification.md#test-scope-and-result-comparison). Final verification QA briefs also include the re-changed-file list and the provisional full-regression trigger judgment with reasons, including integration history.

### 5.3 coordination.md host rules에서 삭제할 문장 (4 플랫폼 × 4줄)
1. Claude 블록(148행): `- Detached survival of the verify runner is unverified on a Claude host; use \`detach: false\` until it is verified.`
2. Codex 블록(155행): `- On a Codex host ask for the same escalation approval each time a \`verify-*\` command (\`verify-start\`, \`verify-status\`, \`verify-compare\`, \`verify-rerun\`, \`verify-cleanup\`) runs, because it writes \`<git-common-dir>/arc/verify\` and the system temporary directory; record an approved call as \`sandboxMode: "escalated"\`. Detached survival of the verify runner is unverified; use \`detach: false\` until it is verified.`
3. Gemini 블록(163행): `- Detached survival of the verify runner is unverified on a Gemini host; use \`detach: false\`.`
4. Grok 블록(172행): `- On a Grok host ask the user for approval the same way each time a \`verify-*\` command runs. Detached survival of the verify runner is unverified; use \`detach: false\`.`

행 번호는 claude 기준입니다. 다른 플랫폼에서는 문장 텍스트로 찾습니다. 삭제한 뒤에도 각 블록의 다음 bullet(`- Target home probe:` 등)은 그대로 둡니다.

### 5.4 `lib/prompts/agent-fragments.json` 변경
1. `qa.verification-steps` 1단계
   - 현재: `Final verification is run by Orchestrator, not QA.`
   - 새(v4, N5): `When assigned final verification, run all contract tests, all check scripts and the brief's re-changed-file tests at the verified HEAD, plus full regression once when the brief's provisional judgment or your own check of triggers (1), (3) and (4) finds one applies or cannot decide.`
2. `qa.verification-steps` 5단계
   - 현재: `Compare failures with the brief's baseline by test name; only new failures are findings.`
   - 새: `Classify each HEAD failure first by read-only diff against the approved base (unrelated when its test, direct imports, fixtures and test configuration are unchanged), and report the rest as needing a base run; when Orchestrator supplies a base worktree, rerun only those by test name and classify them as baseline, new or new-failure candidate. Only new failures are findings; unrelated failures and candidates need Orchestrator disposition.`
   - 뒤 문장 `Rerun a suspected intermittent test alone, up to the brief's limit (default three), as diagnosis rather than retry; report passes-in-isolation and rerun count.`는 그대로 둡니다.
3. `reviewer.review-steps`
   - 현재: `QA owns task functional/test verification; Orchestrator runs final verification and owns overall completion and acceptance.`
   - 새: `QA owns task and final functional/test verification; Orchestrator owns overall completion and acceptance.`
   - `reviewer.final-plan-findings`의 `New failures from final verification follow Implementer → QA; affected evidence needs a refreshed-diff recheck.`는 그대로 둡니다.
4. `planner.task-shape`
   - 현재: `In final verification list the union, all contract tests and check scripts, and a provisional full-regression trigger judgment with reason.`
   - 새: `In final verification list all contract tests and check scripts, expected cross-task file overlap that may need recheck, and a provisional full-regression trigger judgment with reason.`

implementer 템플릿 변경(claude 29행, gemini 21행, grok 21행. codex toml에는 이 문장이 없습니다):
- 현재: `full regression only in Orchestrator's final verification when triggered.`
- 새: `full regression only in final QA verification when triggered.`

### 5.5 SKILL.md Preservation rule 예외 (v4, B2, 4 플랫폼)
`{claude,codex,gemini,grok}/skill/SKILL.md`의 Preservation rule bullet에서 `NEVER automatically stash, reset, clean, unstage, discard, amend or delete branches/worktrees.` 바로 뒤에 아래 문장을 같은 바이트로 넣습니다. 기존 문장은 바꾸지 않습니다. 역할 프로필용 `common.preservation-choice-inspection` fragment는 바꾸지 않습니다(역할은 worktree를 지우지 않음).

```
The only exception is the ARC-owned base worktree under [verification](references/verification.md#test-scope-and-result-comparison), which Orchestrator removes after all final dispositions only if it is still clean.
```

## 6. 파일 목록
### 6.1 삭제
1. `lib/runtime/{verify-cli,final-verify,test-results,node-test-reporter}.mjs`
2. `shared/skill/runtime/` 아래 같은 4개. `update-runtime-assets`는 고아 파일을 지우지 않으므로 직접 삭제합니다.
3. `tests/node/runtime-final-verify.test.mjs`, `tests/node/runtime-test-results.test.mjs`

Grep으로 확인한 결과, 이 4개 모듈은 서로만 import합니다. `tests/installer-parity.json`, `tests/node/manifest.test.mjs` 필수 목록, Python 테스트, README·비 superpowers docs에는 참조가 없습니다.

### 6.2 수정
- 4 플랫폼 문서: `{claude,codex,gemini,grok}/skill/references/verification.md`(§5.1), `handoff-prep.md`(§5.2), `coordination.md`(§5.3)
- `lib/prompts/agent-fragments.json`(§5.4)
- `{claude,gemini,grok}/agents/arc-implementer.md`
- 계약 테스트 `tests/node/test-scope-contract.test.mjs`:
  - 상수를 삭제하거나 교체합니다: `cleanWorktreeSentence`, `fullRegressionWorktreeSentence`, `backgroundBaselineSentence`, `runtimeCommands*`, `handoffRunIdSentence`, `baselineCoverage`, `reviewerVerificationSentence`, `implementerFinalRegressionRule`, QA·planner `profileRules`
  - `sectionPhrases`에서 `union of all tasks' related tests`, `baseline-incomplete`, `Orchestrator runs it directly, not through QA`를 빼고, `re-changed`, `base worktree`, `new-failure candidate`, `fresh QA assignment`를 넣습니다.
  - `finalFailureRule` 단락 끝 검사의 앞 문맥을 새 문장으로 바꿉니다.
  - runtime 절과 runId 테스트는 부재 테스트로 바꿉니다(anchor, `verify-cli`, `runId`가 없어야 함).
  - base 판정 문장, 최종 QA 범위 문장, 전체 회귀 QA 실행 문장의 위치를 고정하는 테스트를 추가합니다.
- `tests/node/composite-instructions.test.mjs` 107–128행: "states verify-* host rules"를 "omit verify-* host rules"(부재) 테스트로 바꿉니다.
- **누락 보완 1**: `tests/node/fixtures/instruction-contracts.json` `agentProfileBaseline.profiles`. `agent-fragments.test.mjs:34`가 렌더된 프로필 해시를 검사합니다. 바뀌는 15개는 4 플랫폼의 planner·qa·reviewer와 claude/gemini/grok implementer이고, scouter는 바뀌지 않습니다. `revision` 필드(`e112462…`)를 어떻게 다룰지는 Implementer가 `git log -p`로 과거 관행을 확인해 보고합니다.
- **누락 보완 2**: 같은 파일 `protected["claude/agents/arc-implementer.md"]`. `instruction-layout.test.mjs:143`이 템플릿 바이트 해시를 검사합니다.
- **누락 보완 3**: `tests/node/plan.test.mjs` 218–227행 `renderingBaseline` 8개 digest(codex/claude × en/ko × skipGlobal). 이 digest에는 generated skill과 profiles가 들어가므로 T1과 T2에서 모두 바뀝니다. writer가 없어서 실제 digest를 손으로 옮겨야 하고, 그 근거를 보고합니다.
- `tests/node/fixtures/installed-layout-golden.json`: `node tests/node/fixtures/installed-layout.mjs --diff`로 변경을 확인한 뒤 `--write`로 재생성합니다(수동 편집 불필요). prerequisite는 `build/native`(`npm run build:native`)입니다. `--diff` 결과는 기대 목록과 대조합니다.
  - T1: 16 레이아웃의 `verification.md`·`handoff-prep.md`·`coordination.md` `~`, write 레이아웃의 해당 `agents/*` `~`
  - T2: 16 레이아웃 × 4 runtime 항목 `-`
- `lib/installer/runtime-assets.mjs` 16·25·40·42행 삭제, `tests/node/runtime-assets.test.mjs` 11–14행 `expectedPaths`에서 4개 삭제
- `MANIFEST.sha256`: `node scripts/update-manifest.mjs`로 재생성합니다(`grok/MANIFEST.sha256` 없음).

### 6.3 변경 없음 확인
`lib/policy/role-policy.json`(따라서 `update-role-policy` 재생성 불필요), role-flow.svg, commit·planning·handoff 용어, `test_harness_contract.py`, `test_claude_payload.py`, `tests/installer-parity.json`, `lib/runtime/bootstrap.mjs` `COOPERATIVE_RUNTIME_MODULES`(runtimeHash 영향 없음).

### 6.4 생성 경로와 check
- agent 프로필은 저장소에 생성 스크립트가 없습니다. 템플릿의 `{{ARC_AGENT_FRAGMENT:…}}`는 설치 때 `lib/prompts/render.mjs` `renderAgentProfile`이 렌더합니다.
- check는 다음 네 가지입니다.
  - `npm run check:manifest`
  - `npm run check:role-policy`
  - `node scripts/update-runtime-assets.mjs --check`
  - `node scripts/check-installer-parity.mjs`

### 6.5 task 분할 제안 (plan 단계 확정)
- T1 규칙·프로필 전환: §6.2의 문서 3종 × 4, fragment, implementer, 계약 테스트 2개, instruction-contracts, plan.test digest, golden(T1분), MANIFEST
- T2 런타임 삭제: §6.1, runtime-assets와 그 테스트, plan.test digest, golden(T2분), MANIFEST. 선행 task는 T1입니다(문서의 runtime 절이 먼저 사라져야 참조가 끊기지 않습니다).

## 7. 미확인 사항 조사 결과
### 7.1 (a) 업그레이드·재설치 때 stale runtime 파일이 정리되는지 → 정리됨
- `lib/installer/transaction.mjs:62`는 `skills/arc`를 `composeStaticArcSkillTree(plan.generated.skill)` 하나의 tree spec으로 stage합니다.
- 76행은 기존 entry를 stage의 `previous-N`으로 옮기고 prepared tree를 게시합니다.
- 그 다음 `lib/installer/stage-cleanup.mjs` `cleanupStage`가 transaction이 소유한 stage를 제거합니다.
- `upgrade.mjs`도 `buildInstallPlan`과 transaction을 거칩니다.

따라서 새 설치본에 없는 `skills/arc/runtime/verify-cli.mjs` 등은 다음 설치나 업그레이드 때 디렉터리째 교체되면서 사라집니다. 설치기 변경은 필요 없고, 범위 밖 결정도 필요 없습니다. 이를 직접 증명하는 테스트는 찾지 않았습니다(예산 절약). §9 수용 기준 AC-9에 정적 근거로만 둡니다.

### 7.2 (b) Codex bridge QA가 workspace 밖에서 실행하거나 쓸 수 있는지 → 쓰기 불가로 판단
- `lib/runtime/role-bridge-args.mjs`: `arc_qa`는 `sandboxMode: 'workspace-write'`입니다(28행). `buildCodexArgs`는 `exec --json -C <worktree> -c sandbox_mode="workspace-write" -c approval_policy="never"`만 넘기고(201–213행), `--add-dir`이나 writable roots를 추가하지 않습니다.
- Claude bridge QA도 sandbox가 켜져 있고(`filesystem.denyWrite: ['./.git']`, `role-dispatch-policy.mjs:18–27`), Grok bridge QA는 worktree에 묶인 `custom` profile을 씁니다.
- 판단: 읽기와 프로세스 실행은 가능할 수 있지만, base worktree 안에 쓰는 테스트(pycache, 빌드 산출물, repo 내부 임시 파일)는 거부될 가능성이 높습니다. tmpdir 쓰기 허용 여부는 Codex 쪽 동작이라 로컬에서 확인하지 못했습니다.
- 대응: R-4(환경 차단 보고 → base worktree를 workspace로 하는 QA를 따로 배정)가 이 경우를 이미 덮습니다.
- 위치 대안 비교
  - (A) 실행 대상 worktree **밖**. D4′에 따라 `<git-common-dir>/arc/base/<workflow>`로 정했습니다. 이 위치는 `.git` 안이라 Claude·Codex bridge sandbox에서 쓰기가 거부될 수 있습니다. 그런 경우도 R-4가 덮습니다.
  - (B) 실행 대상 worktree 안의 무시 경로. 같은 sandbox에서 쓸 수 있다는 장점이 있습니다. 하지만 R-7의 `git status --porcelain` clean 조건을 지키려면 `info/exclude` 같은 Git 상태를 바꿔야 하고, `.git/info/exclude`는 worktree 간에 공유됩니다. 또 저장소 전체를 훑는 check(manifest 등)가 base 사본을 읽어 결과가 오염될 위험이 있어 권장하지 않습니다.

## 8. 결정 사항 (Orchestrator 검토 결과)
- Q1 → 사용자 결정 D4′(2026-11-22)로 대체합니다. base worktree는 미리 만들지 않고, 2단계가 필요할 때만 `<git-common-dir>/arc/base/<workflow>`에 만듭니다. 이번 작업에서는 `<git-common-dir>/arc/base/2026-11-22-qa-verification-ownership`를 씁니다.
- Q2 → `agentProfileBaseline.revision`은 Implementer가 `git log -p`로 과거 갱신 관행을 확인해 같은 관행을 따르고, 근거를 보고합니다. 관행이 불분명하면 유지하고 보고합니다.
- 이번 작업 자체의 검증 → 사용자 결정(D1·D2)에 따라 새 절차를 이번 작업부터 적용합니다. Orchestrator는 사전 기준선과 최종 검증을 직접 실행하지 않습니다. task QA는 실패만 2단계(정적 분류 → 필요 시 base 재실행)로 판정하고, 최종 검증은 fresh QA 1회가 합니다.

## 9. 수용 기준
- AC-1: 4 플랫폼 `verification.md`의 test-scope 절이 §5.1 네 단락과 바이트 단위로 같습니다. `final-verification-runtime-commands` anchor와 절, `verify-cli` 문자열이 없습니다.
- AC-2: 4 플랫폼 `handoff-prep.md`의 Verification brief inputs 단락이 §5.2와 같고, `runId`와 "baseline record reference"가 없으며, test-scope 링크가 정확히 1개입니다.
- AC-3: 4 플랫폼 `coordination.md`에 `verify runner`, `verify-*`, `arc/verify`가 없고, 나머지 host bullet은 그대로입니다.
- AC-4: 렌더된 qa·reviewer·planner 프로필(4 플랫폼)과 implementer 템플릿(claude/gemini/grok)에 §5.4 새 문장이 정확히 1번 들어 있고, 옛 문장은 없습니다.
- AC-5: `lib/runtime`·`shared/skill/runtime`에 4개 모듈이 없고, `RUNTIME_MODULE_PATHS`와 테스트 기대 목록이 일치합니다.
- AC-6: golden, `instruction-contracts.json`, `plan.test.mjs` digest, MANIFEST가 새 산출물과 일치합니다(관련 테스트와 check 통과).
- AC-7: `role-policy.json`과 managed contract 구역이 바뀌지 않았습니다(`check:role-policy` 통과).
- AC-8: 저장소의 비 `docs/superpowers` 파일에 `verify-start|verify-status|verify-compare|verify-rerun|verify-cleanup|verify-cli|final-verify.mjs|test-results.mjs|node-test-reporter.mjs` 참조가 없습니다(Grep).
- AC-10: 4 플랫폼 문서와 QA fragment에 2단계 판정(정적 분류 → 필요 시 base 재실행)이 들어 있고, base worktree를 미리 만들라는 문장과 `.claude/worktrees/`에 두라는 문장이 없습니다.
- AC-11 (v4): 4 플랫폼 verification.md Baseline 단락이 task QA 작업 트리 diff(+untracked)와 최종 QA `<approved base> HEAD`를 구분하고, base worktree 삭제 예외·host 중립 경로 문구·두 경로 차단 시 후보 처리를 담으며, Final verification 단락이 비 clean 보류와 Orchestrator 쓰기 금지를 담습니다(§5.1 v4 문안과 바이트 일치).
- AC-12 (v4): 4 플랫폼 SKILL.md Preservation rule에 §5.5 문장이 정확히 1번, 기존 금지 문장 바로 뒤에 있습니다. QA fragment 1단계가 §5.4 v4 문장과 같습니다.
- AC-9 (정적 근거): 설치 transaction이 `skills/arc`를 tree 단위로 교체한다는 근거(§7.1)를 기록합니다. 실제 업그레이드 동작은 unverified로 표시합니다.

## 10. 검증 방법
- T1 관련 테스트
  - `tests/node/test-scope-contract.test.mjs`, `composite-instructions.test.mjs`(문안 계약)
  - `agent-fragments.test.mjs`, `instruction-layout.test.mjs`(렌더·protected 해시)
  - `plan.test.mjs`(렌더링 digest), `installed-layout-golden.test.mjs`(설치 레이아웃)
  - `manifest.test.mjs`(MANIFEST 재생성)
- T2 관련 테스트: `runtime-assets.test.mjs`, `manifest.test.mjs`, `plan.test.mjs`, `installed-layout-golden.test.mjs`, `test-scope-contract.test.mjs`(부재 테스트)
- check: §6.4의 네 가지
- 최종 검증: 계약 테스트 전부, check 전부, 재변경 파일 관련 테스트(T1과 T2가 함께 바꾸는 파일 `plan.test.mjs`, golden, MANIFEST, `test-scope-contract.test.mjs`는 재변경 후보)
- 전체 회귀 잠정 판정: **해당**. 트리거 1은 공유 fragment와 4 플랫폼에 렌더되는 references, 트리거 4는 `verify-*` CLI 명령 제거입니다. 실행 명령은 `npm test`와 `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests`입니다.
- 이 변경은 새 규칙을 처음 적용하는 실행입니다. §8에 따라 이번 작업의 QA부터 2단계 판정 절차를 씁니다.

## 11. 위험·한계
- X_i는 간접 import 파일의 재변경을 놓칠 수 있습니다. 이번 작업은 트리거 1 회귀가 보완하고, 일반 사례는 Planner의 "expected cross-task file overlap" 항목이 보완합니다.
- 정적 분류는 직접 import만 봅니다. 간접 의존이나 환경(전역 설치, 홈 디렉터리)이 바뀌어 생긴 실패를 "변경 무관"으로 분류할 수 있습니다. 그래서 변경 무관 실패는 기존 실패로 확정하지 않고 Orchestrator disposition에 맡깁니다. Orchestrator는 의심되면 2단계를 지시할 수 있습니다.
- base 단독 재실행은 테스트 이름이 바뀐 경우 "absent → 새 실패"로 판정합니다. 이름 변경과 실제 실패를 구분하는 일은 Orchestrator disposition이 맡습니다.
- 문서 존재는 역할 행동을 증명하지 않습니다. 실제 QA·Orchestrator 준수 여부는 이후 실행에서 관찰해야 합니다.
- 사용자 저장소에 남은 verify 기록은 방치합니다(D5).
- `plan.test.mjs` digest는 손으로 옮기므로, 잘못된 값을 넣으면 의미 없는 통과나 실패가 생길 수 있습니다. 실제 출력과 대조한 근거가 필요합니다.

## 개정 이력

| 버전 | 날짜 | 내용 | 승인 |
|---|---|---|---|
| v3 | 2026-11-22 | 최초 승인본 | 사용자 "승인" |
| v4 | 2026-11-22 | 최종 Reviewer finding 반영: B1(task QA diff 범위), B2(ARC 소유 base worktree 삭제 예외), N1(prerequisite 시점), N2(최종 QA 중 쓰기 금지·비 clean 보류), N3(두 경로 차단 시 후보), N4(host 중립 경로 문구), N5(QA 트리거 독립 확인), n1(상태 표기). 사용자 결정 2026-11-22 | 사용자 "승인" |
