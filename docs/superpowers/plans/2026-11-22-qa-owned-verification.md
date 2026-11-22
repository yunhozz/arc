# QA 소유 기준선 판정·최종 검증 전환과 verify 런타임 삭제 구현 계획 (plan)

> **For agentic workers:** 이 plan은 ARC Orchestrator가 조정합니다. task마다 Implementer → fresh QA → Orchestrator 수락 → focused commit 1개 순서로 진행합니다. Implementer와 QA는 Git 상태를 바꾸지 않습니다. 단계는 checkbox(`- [ ]`)로 추적합니다.

- 날짜: 2026-11-22 · 상태: v4 (v2 승인 2026-11-22, v3·v4 기계적 개정 승인 2026-11-22) · workflow: `2026-11-22-qa-verification-ownership`
- 대상: `/Users/yunho/Desktop/project/arc/.claude/worktrees/qa-owned-verification`, 브랜치 `feat/qa-owned-verification`, base `5f6fa2e95e1415d44467eab235115d11998f4d34`
- 경로·위험: Architectural, significant

**Goal:** 기준선·최종 검증을 QA 소유의 2단계 실패 판정과 fresh QA 1회 최종 검증으로 바꿉니다. 이어서 `verify-*` 런타임 도구와 그 자산을 삭제합니다.

**Architecture:** T1은 4 플랫폼 references(verification·handoff-prep·coordination), 공유 fragment, implementer 템플릿과 이를 고정하는 계약 테스트·생성물을 한 번에 바꿉니다. 그러면 문서에서 런타임 참조가 먼저 사라집니다. T2는 참조가 끊긴 런타임 모듈 4개와 미러·전용 테스트·인벤토리를 삭제하고 생성물을 다시 만듭니다.

**Tech Stack:** Node.js ≥22 ESM, `node:test`, Python `unittest`, git CLI.

**Spec:** `docs/superpowers/specs/2026-11-22-qa-owned-verification-design.md` v3(sha256 `77c14b59…4d67`, 2026-11-22 사용자 승인). 이 plan은 spec의 절 번호(§)를 인용하므로 실행자는 두 문서를 함께 읽습니다.

## Global Constraints

- 정책 문장은 영어이며 spec §5 원문을 바이트 그대로 복사합니다. 네 플랫폼(claude/codex/gemini/grok)에 같은 바이트로 넣습니다. 의역, 따옴표 변환, 줄바꿈 추가는 금지합니다.
- `lib/policy/role-policy.json`과 각 문서의 `[ARC role policy: contract begin]`…`end` 구역은 바꾸지 않습니다. `update-role-policy`로 재생성하지 않습니다(spec §6.3).
- `lib/runtime/verification.mjs`, `lib/runtime/bootstrap.mjs`(`COOPERATIVE_RUNTIME_MODULES`), 설치기(`lib/installer/transaction.mjs` 등), `tests/installer-parity.json`, Python 테스트, 과거 `docs/superpowers` 문서, commit·planning·handoff의 "final verification results" 용어는 바꾸지 않습니다.
- 기존 계약 단언은 spec §6.2가 지정한 상수·테스트만 바꿉니다. 그 밖의 단언을 고쳐야 통과한다면 hold하고 Orchestrator에 보고합니다.
- 생성물은 정해진 순서로 갱신합니다: 문서·fragment → `instruction-contracts.json` → golden(`--diff` 대조 뒤 `--write`) → `node scripts/update-manifest.mjs` → `plan.test.mjs` digest. digest는 MANIFEST가 반영된 뒤의 실제 출력에서 옮깁니다.
- Python은 항상 `PYTHONDONTWRITEBYTECODE=1`로 실행합니다. `__pycache__`가 생기면 manifest·golden 결과가 오염됩니다.
- Implementer는 stage·commit·stash·reset·브랜치·worktree 조작을 하지 않습니다. allowedPaths 밖의 파일은 수정하지 않습니다.

## Review Focus

1. 플랫폼 간 바이트 드리프트: 한 플랫폼에만 공백, 따옴표, 백틱 차이가 생기는 경우입니다. → T1 `${platform} test scope paragraphs match the approved text`(4 단락 완전 일치, 플랫폼별)
2. 절 삭제 뒤 남는 빈 줄·anchor: 빈 줄이 2개 연속되거나 anchor가 남는 경우입니다. → T1 `${platform} verification omits the runtime commands section`(`riskAnchor` 앞 줄이 `''`이고, 그 앞 줄이 Result comparison 단락)
3. Codex 블록은 삭제 뒤 다음 bullet이 `- Target home probe:`가 아니라 `- In a Codex host sandbox writes to \`CODEX_HOME\`…`입니다. 일괄 패턴으로 지우면 이웃 bullet이 손상됩니다. → T1 composite 부재 테스트가 블록별 다음 줄을 정확히 검사합니다.
4. `shared/skill/runtime` 고아 파일: `update-runtime-assets`는 고아 파일을 지우지 않으므로 미러가 남은 채 `--check`가 통과할 수 있습니다. → T2 Glob 부재 확인과 golden `--diff`의 `-` 64줄 대조
5. 은퇴 문장 잔존: 옛 문장이 렌더 프로필이나 다른 role에 남는 경우입니다. → T1 `${platform} rendered profiles omit the retired verification sentences`

## 파일 구조

| 파일 | 책임 | task |
|---|---|---|
| `{claude,codex,gemini,grok}/skill/references/verification.md` | test-scope 절 4 단락 교체, runtime 절 삭제(§5.1) | T1 |
| `{…}/skill/references/handoff-prep.md` | Verification brief inputs 단락 교체(§5.2) | T1 |
| `{…}/skill/references/coordination.md` | host 블록 verify bullet 4개 삭제(§5.3) | T1 |
| `lib/prompts/agent-fragments.json` | qa·reviewer·planner 4문장(§5.4) | T1 |
| `{claude,gemini,grok}/agents/arc-implementer.md` | full regression 문장(§5.4) | T1 |
| `tests/node/test-scope-contract.test.mjs`, `tests/node/composite-instructions.test.mjs` | 계약 | T1 |
| `tests/node/fixtures/instruction-contracts.json` | 렌더 프로필 15개 해시, claude implementer protected 해시 | T1 |
| `lib/runtime/{verify-cli,final-verify,test-results,node-test-reporter}.mjs`, `shared/skill/runtime/` 같은 4개, `tests/node/runtime-final-verify.test.mjs`, `tests/node/runtime-test-results.test.mjs` | 삭제 | T2 |
| `lib/installer/runtime-assets.mjs`, `tests/node/runtime-assets.test.mjs` | 인벤토리 4개 제거 | T2 |
| `tests/node/plan.test.mjs`(digest 8개), `tests/node/fixtures/installed-layout-golden.json`, `MANIFEST.sha256` | 생성물 | T1·T2(재변경) |

**실제 대상 위치(텍스트로 확인함, base `5f6fa2e9`):**
- verification.md
  - claude/gemini/grok: `:20` Task checks(유지), `:22` Final verification, `:24` Full regression, `:26` Baseline, `:28` Result comparison, `:30` `<a id="final-verification-runtime-commands"></a>`, `:31` `## Final verification runtime commands`, `:33` 단락, `:35` `<a id="risk-scaled-execution"></a>`
  - codex: 같은 순서로 `:18/:20/:22/:24/:26`, `:28/:29/:31`, `:33`
- handoff-prep.md: 네 플랫폼 모두 `:95`(`### Verification brief inputs` 아래 단락)
- coordination.md
  - claude/gemini/grok: `:148`(Claude), `:155`(Codex), `:163`(Gemini), `:172`(Grok)
  - codex: `:146/:153/:161/:170`
- agent-fragments.json: `:54` `planner.task-shape`, `:82` `qa.verification-steps`(1단계·5단계), `:90` `reviewer.review-steps`
- implementer 템플릿: claude `:29`, gemini `:21`, grok `:21`(`related checks; … If blocked,` 사이)
- runtime-assets.mjs: `:16` final-verify, `:25` node-test-reporter, `:40` test-results, `:42` verify-cli
- runtime-assets.test.mjs: `:11`, `:12`, `:14` 안의 문자열 4개(행 삭제가 아니라 배열 원소 삭제)

## 가정

- A1 (prerequisite) 대상 worktree에 `node_modules/`와 `build/native/`가 없습니다(Glob으로 확인, 둘 다 `.gitignore` 대상). golden `--diff/--write`와 설치 계열 테스트에는 `build/native`가 필요합니다. 따라서 T1 Implementer를 시작하기 전에 Orchestrator가 `npm ci --ignore-scripts`와 `npm run build:native`를 준비하거나, 브리프에 명시해 승인합니다(Q1). 근거: 2026-11-21 plan A5에서 같은 두 단계를 썼습니다.
- A2 (task QA의 "HEAD") task QA는 커밋 전 작업 트리를 검증합니다. 그래서 R-1 정적 분류는 `git diff --name-only 5f6fa2e9` (base 대 작업 트리, tracked)와 `git status --porcelain`의 untracked를 합쳐서 봅니다. 최종 QA는 spec 원문대로 `git diff --name-only <base> HEAD`를 씁니다(Q2).
- A3 "approved base"는 두 task 모두 `5f6fa2e9`입니다. T2 QA는 C1이 아니라 이 base와 비교합니다.
- A4 golden 키에는 메타데이터나 해시 집계 파일이 없습니다(`skills/arc/SKILL.md`, `limits.toml`, `models.toml`, `settings.toml`, `scripts/*`, `references/*`, `runtime/*`, `agents/*`만 확인함). 그래서 T1의 `~` 목록을 정확히 예측할 수 있습니다.
- A5 `plan.test.mjs` digest의 "writer"는 실패 출력입니다. `assert.equal(digest, renderingBaseline[key])`의 AssertionError가 실제 값(actual)을 키별로 보여 주므로, 그 값을 옮기고 출력 발췌를 근거로 보고합니다.

---

### Task 1: 규칙·프로필 전환 (문서 3종 × 4, fragment, implementer, 계약, 생성물)

**목표·범위:** spec R-1–R-14와 §5 문안을 4 플랫폼 문서와 렌더 프로필에 적용하고 계약 테스트로 고정합니다. 런타임 파일은 건드리지 않습니다.

**선행:** 없음. prerequisite A1은 Orchestrator가 준비합니다.

**Files (Implementer allowedPaths, 22개):**
- Modify:
  - `claude/skill/references/verification.md`, `codex/skill/references/verification.md`, `gemini/skill/references/verification.md`, `grok/skill/references/verification.md`
  - 같은 네 디렉터리의 `handoff-prep.md`와 `coordination.md`
  - `lib/prompts/agent-fragments.json`
  - `claude/agents/arc-implementer.md`, `gemini/agents/arc-implementer.md`, `grok/agents/arc-implementer.md`
  - `tests/node/test-scope-contract.test.mjs`, `tests/node/composite-instructions.test.mjs`
  - `tests/node/fixtures/instruction-contracts.json`, `tests/node/plan.test.mjs`, `tests/node/fixtures/installed-layout-golden.json`, `MANIFEST.sha256`
- spec·plan 문서는 Orchestrator 소유이며 `b3351cf`에 커밋되어 있습니다. Implementer는 편집하지 않습니다.

**Interfaces:**
- Produces: 4 플랫폼 문서에서 `final-verification-runtime-commands`, `verify-cli`, `verify-*`, `verify runner`, `arc/verify`, `runId`가 사라집니다. T2는 이 상태를 전제로 런타임을 삭제합니다.
- Produces: 테스트 상수 `finalVerificationParagraph`, `fullRegressionParagraph`, `baselineParagraph`, `resultComparisonParagraph`, `handoffBriefInputsParagraph`, `finalScopeSentence`, `fullRegressionQaSentence`, `baseVerdictSentence`. T2는 이 상수를 바꾸지 않습니다.

- [x] **Step 0: prerequisite 확인(읽기 전용)**
  - `node_modules/`와 `build/native/`가 있는지 확인합니다.
  - 없으면 설치하지 말고 Orchestrator에 보고합니다(hold).
  - 시작할 때의 `git status --porcelain`을 기록합니다. 기대값은 untracked spec 1개뿐입니다.

- [x] **Step 1: `tests/node/test-scope-contract.test.mjs`를 새 문안 기대로 바꿉니다(RED)**
  - 삭제할 상수: `cleanWorktreeSentence`, `fullRegressionWorktreeSentence`, `backgroundBaselineSentence`, `runtimeCommandsHeading`, `runtimeCommandsParagraph`, `handoffRunIdSentence`, `baselineCoverage`. `runtimeCommandsAnchor`는 부재 검사용으로만 남깁니다.
  - 유지할 상수: `structuredResultsSentence`, `finalFailureRule`, `qaAdditionsRule`, `qaRerunLimit`, `wholePlanReviewerRule`, `oldReviewerVerificationPhrase`
  - 새 상수 (1) 단락 원문
    - `finalVerificationParagraph`, `fullRegressionParagraph`, `baselineParagraph`, `resultComparisonParagraph`: spec 파일 111·113·115·117행 원문을 그대로 복사합니다.
    - `handoffBriefInputsParagraph`: spec 125행에서 선행 `> `만 뺀 원문입니다.
  - 새 상수 (2) 문장·규칙
    - `finalScopeSentence = '**Final verification** runs once after all tasks are accepted and committed, as one fresh QA assignment at the verified HEAD of the execution target worktree: all contract tests, all check scripts and the related tests of re-changed files; it does not rerun the union of tests that task QA already passed.'`
    - `fullRegressionQaSentence = 'If either finds a trigger applies or cannot determine applicability, QA runs it once without further authorization; if no trigger applies, omit it and report the reason.'`
    - `baseVerdictSentence = 'A failure under the same name at base is a baseline failure; a pass at base, or a test or file absent at base, makes it a new failure; a base run that was not performed, was blocked by the environment, failed to load or lacks the name makes it a new-failure candidate.'`
    - `reviewerVerificationSentence = 'QA owns task and final functional/test verification; Orchestrator owns overall completion and acceptance.'`
    - `implementerFinalRegressionRule = 'full regression only in final QA verification when triggered.'`
    - `retiredPhrases = ['Final verification is run by Orchestrator', "Compare failures with the brief's baseline", 'Orchestrator runs final verification', 'In final verification list the union', "full regression only in Orchestrator's final verification"]`
  - `sectionPhrases` 변경
    - 뺄 것: `"union of all tasks' related tests"`, `'baseline-incomplete'`, `'Orchestrator runs it directly, not through QA'`
    - 넣을 것: `'re-changed'`, `'base worktree'`, `'new-failure candidate'`, `'fresh QA assignment'`
  - `profileRules` 변경 (`lineStart`, `before`, `after`는 그대로)
    - `qa[0].rule`: 끝 문장 `Final verification is run by Orchestrator, not QA.`를 spec §5.4-1 새 문장으로 바꿉니다. `phrases`는 `['with related tests only', qaAdditionsRule, "the brief's re-changed-file tests at the verified HEAD"]`입니다.
    - `qa[1].rule`: spec §5.4-2 새 문장 + `' '` + 기존 `Rerun a suspected intermittent test alone, ${qaRerunLimit} as diagnosis rather than retry; report passes-in-isolation and rerun count.`입니다. `phrases`는 `['by test name', qaRerunLimit, 'passes-in-isolation and rerun count', 'read-only diff against the approved base']`입니다.
    - `planner[0].rule`: `"List each task's related tests with reasons. "` + spec §5.4-4 새 문장입니다. `phrases`에 `'expected cross-task file overlap that may need recheck'`를 추가합니다.
  - 플랫폼별 테스트 교체·추가
    - `${platform} final verification runs in a clean worktree` → `${platform} test scope paragraphs match the approved text`
      - `**Final verification**`, `**Full regression**`, `**Baseline:**`, `**Result comparison:**`로 시작하는 단락이 각각 위 4 상수와 `===`이고 1회씩 나옵니다.
      - `structuredResultsSentence`가 1회 나오고 `Report baseline and unrelated failures separately. ${structuredResultsSentence} If a failure looks intermittent` 위치에 있습니다.
    - `${platform} runtime commands section sits between …` → `${platform} verification omits the runtime commands section`
      - `final-verification-runtime-commands`, `## Final verification runtime commands`, `verify-cli`, `arc/verify`가 없습니다.
      - `lines[riskIndex-1] === ''`이고 `lines[riskIndex-2] === resultComparisonParagraph`입니다.
    - `${platform} handoff-prep allows citing an active baseline runId` → `${platform} handoff-prep brief inputs cite the approved base`
      - `### Verification brief inputs\n\n` 다음 단락이 `handoffBriefInputsParagraph`와 `===`입니다.
      - 문서에 `runId`와 `baseline record reference`가 없습니다.
    - `${platform} final verification routes new failures after the Reviewer starts`: 단락이 `the read-only final Reviewer MAY run concurrently. ${finalFailureRule}`로 끝납니다.
    - `${platform} baseline covers the provisional final verification scope` → `${platform} final QA scope, full regression and base verdict sentences sit in place`
      - Final verification 단락이 `finalScopeSentence`로 시작합니다.
      - Full regression 단락에 `from the base..HEAD diff and log. ${fullRegressionQaSentence} Change size`가 있습니다.
      - Baseline 단락은 `**Baseline:** No baseline run is recorded in advance, and no base worktree is prepared in advance.`로 시작하고, `or a Python node id. ${baseVerdictSentence} NEVER absorb a candidate as a baseline failure.`를 포함하며, ``never under `.claude/worktrees/` or inside the execution target worktree``를 포함합니다(AC-10).
    - reviewer render 테스트: 새 `reviewerVerificationSentence`가 `after required QA/focused checks and QA rechecks. ${s}\n` 위치에 1회 나옵니다. `oldReviewerVerificationPhrase`가 없어야 한다는 검사는 유지합니다.
    - `${platform} implementer template assigns full regression to Orchestrator` → `… assigns full regression to final QA verification`: 위치는 `related checks; ${rule} If blocked,`입니다.
    - 신규 `${platform} rendered profiles omit the retired verification sentences`: `profileRoles` 5개의 렌더 결과와 implementer 템플릿에 `retiredPhrases`가 하나도 없습니다.
  - 그대로 둘 테스트: project suite 2개, final-plan-recheck 2개, test-scope link, whole-plan Reviewer, non-reviewer 부재

- [x] **Step 2: `tests/node/composite-instructions.test.mjs:107-128`를 부재 테스트로 바꿉니다(RED)**
  - 이름은 `every coordination reference omits verify-* host rules`입니다.
  - 각 플랫폼 문서에 `verify runner`, `` `verify-* ``, `verify-start`, `arc/verify`가 없습니다.
  - `section(document)` 줄에서 `precedingBullet` 다음 줄이 아래 접두사로 시작합니다.
    - Claude `- Approval: No per-call ARC approval gate.` → `- Target home probe: None.`
    - Codex `- On a Codex host ask the user for escalation approval` → `- In a Codex host sandbox writes to \`CODEX_HOME\` are denied (G2)`
    - Gemini `- Approval: Hold the host` → `- Target home probe: See the shared probe rule below. The capability hold applies before the probe.`
    - Grok `- On a Grok host start the session` → `- Target home probe: See the shared probe rule below.`

- [x] **Step 3: RED 확인**
  - 실행: `node --test tests/node/test-scope-contract.test.mjs tests/node/composite-instructions.test.mjs`
  - 기대 결과: 바꾼·새 테스트만 실패합니다(4 플랫폼 × 문서·프로필 테스트, composite 부재 1개). 그대로 둔 테스트는 통과합니다. 실패 이름 목록을 보고합니다.

- [x] **Step 4: 문서 12개를 수정합니다**
  - `verification.md`
    - 네 단락(claude/gemini/grok `:22/:24/:26/:28`, codex `:20/:22/:24/:26`)을 spec 111/113/115/117행으로 바꿉니다.
    - runtime anchor부터 그 단락 뒤 빈 줄까지 삭제합니다(claude/gemini/grok `:30–:34`, codex `:28–:32`).
    - 결과: Result comparison 줄, 빈 줄, `<a id="risk-scaled-execution"></a>` 순서가 됩니다.
  - `handoff-prep.md:95`: spec 125행 원문으로 교체합니다. test-scope 링크는 1개를 유지합니다.
  - `coordination.md`: spec §5.3의 4줄을 삭제합니다(줄 번호는 위 "실제 대상 위치" 참조). 다른 bullet은 바꾸지 않습니다.

- [x] **Step 5: fragment와 implementer 템플릿을 수정합니다**
  - `agent-fragments.json`의 `:82` 1·5단계, `:90`, `:54` 문장을 spec §5.4 1–4로 교체합니다. JSON 이스케이프를 유지합니다(문장 안에 `"`는 없습니다).
  - 세 템플릿의 `full regression only in Orchestrator's final verification when triggered.`를 `full regression only in final QA verification when triggered.`로 바꿉니다. codex toml은 바꾸지 않습니다.

- [x] **Step 6: 계약 GREEN 확인**
  - 실행: Step 3 명령
  - 기대 결과: 모두 PASS

- [x] **Step 7: `instruction-contracts.json`을 갱신합니다**
  - 렌더 해시를 계산합니다(읽기 전용, 저장소에 쓰지 않음):
    ```
    node -e "const fs=require('node:fs'),c=require('node:crypto');import('./lib/prompts/render.mjs').then(r=>{const reg=JSON.parse(fs.readFileSync('lib/prompts/agent-fragments.json','utf8'));for(const t of reg.targets)console.log(t.path,c.createHash('sha256').update(r.renderAgentProfile(t.path,fs.readFileSync(t.path),reg)).digest('hex'))})"
    ```
  - `agentProfileBaseline.profiles`에서 15개 값만 바꿉니다: 4 플랫폼 planner·qa·reviewer와 claude/gemini/grok implementer. scouter 4개와 `codex/agents/arc-implementer.toml`은 그대로여야 합니다. 다르면 hold합니다.
  - `protected["claude/agents/arc-implementer.md"]`는 `shasum -a 256 claude/agents/arc-implementer.md` 값으로 바꿉니다.
  - `revision` 필드는 `git log -p -- tests/node/fixtures/instruction-contracts.json`로 과거 관행을 확인해 따르고, 근거를 보고합니다. 관행이 불분명하면 유지합니다(spec §8 Q2).
  - 확인: `node --test tests/node/agent-fragments.test.mjs tests/node/instruction-layout.test.mjs` PASS

- [x] **Step 8: golden을 갱신합니다**
  - `node tests/node/fixtures/installed-layout.mjs --diff`
  - 기대 결과는 정확히 78줄, 모두 `~`입니다.
    - 16 레이아웃 × `skills/arc/references/{verification,handoff-prep,coordination}.md` = 48줄
    - `*/write/*` 8 레이아웃의 `agents/` = 30줄: claude·gemini·grok는 `arc-{implementer,planner,qa,reviewer}.md`, codex는 `arc-{planner,qa,reviewer}.toml`
  - `+`나 `-`가 있거나 목록 밖 `~`가 있으면 `--write` 전에 hold하고 보고합니다.
  - 그다음 `--write`를 실행하고, `--diff` 출력이 비었는지 확인합니다.

- [x] **Step 9: MANIFEST를 갱신합니다**
  - `node scripts/update-manifest.mjs`
  - 기대 결과(`git diff --stat MANIFEST.sha256`): 16개 항목만 바뀝니다(references 12, `lib/prompts/agent-fragments.json`, implementer 3). 항목 추가·삭제는 없습니다.

- [x] **Step 10: `plan.test.mjs` digest를 갱신합니다**
  - 실행: `node --test --test-name-pattern='preserves public rendering baseline' tests/node/plan.test.mjs` → 8개 실패를 확인합니다.
  - 키별 actual 값을 `renderingBaseline`(`:219–:226`)에 옮기고, 같은 명령으로 8개 PASS를 확인합니다.
  - 실패 출력 발췌(키 → actual)를 근거로 보고합니다.

- [x] **Step 11: 관련 테스트와 check를 실행합니다(아래 목록)**
  - 종료 시 `git status --porcelain`이 allowedPaths와 spec만 보여야 합니다.

- [x] **Step 12: 커밋(Orchestrator, 수락 뒤)**: `refactor(verify): QA 소유 2단계 실패 판정·최종 검증 규칙으로 전환`. spec·plan 본문은 `b3351cf`에 이미 있으므로 다시 넣지 않고, T1 진행 기록과 대기 개정(v3)만 포함합니다(Q3).

**수용 기준:** AC-1, AC-2, AC-3, AC-4, AC-6(T1분), AC-7, AC-10, 그리고 문서 쪽 AC-8(4 플랫폼 references에 verify 참조 없음).

**관련 테스트(이유):**
- `tests/node/test-scope-contract.test.mjs`, `tests/node/composite-instructions.test.mjs`: 직접 갱신하는 계약입니다.
- `tests/node/agent-fragments.test.mjs`: 렌더 해시(`instruction-contracts.json`)를 검사합니다.
- `tests/node/instruction-layout.test.mjs`: protected 해시와 references 구조를 검사합니다.
- `tests/node/instruction-language.test.mjs`: 바뀐 references·implementer 파일을 직접 나열해 검사합니다.
- `tests/node/plan-level-records-contract.test.mjs`: handoff-prep·verification 문장을 읽습니다.
- `tests/node/run-mode-contract.test.mjs`: `agent-fragments.json`을 읽습니다.
- `tests/node/role-policy.test.mjs`: references의 managed 구역을 검사하며, AC-7과 관련됩니다.
- `tests/node/consumer.test.mjs`: 설치된 `coordination.md`를 읽습니다.
- `tests/node/upgrade-harness.test.mjs`: fragment registry를 읽습니다.
- `tests/node/plan.test.mjs`: digest입니다.
- `tests/node/installed-layout-golden.test.mjs`: golden입니다.
- `tests/node/manifest.test.mjs`: MANIFEST입니다.
- Python `tests/test_arc_policy.py`, `tests/test_claude_payload.py`, `tests/test_harness_contract.py`: 바뀐 references를 읽습니다. 실행 예: `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_arc_policy.py'`
- `tests/test_codex_models.py`는 agents 경로만 참조한다고 보고 제외합니다. QA가 바뀐 파일을 읽는다고 확인하면 이유를 붙여 추가합니다.

**check:** `npm run check:manifest`, `npm run check:role-policy`, `node scripts/check-installer-parity.mjs`. `node scripts/update-runtime-assets.mjs --check`는 런타임을 바꾸지 않으므로 변경 없이 통과해야 합니다(회귀 확인용).

**필수 QA·증거:**
- fresh QA를 배정합니다.
- 4 플랫폼 hunk가 같다는 증거: 파일별 `git diff` 비교. codex는 줄 번호만 다릅니다.
- `git diff --quiet 5f6fa2e9 -- lib/policy/role-policy.json`
- golden `--diff` 78줄 목록, MANIFEST 16항목, digest 근거, 15+1 해시 근거, `revision` 판단 근거

**Hold:** golden이나 MANIFEST가 예상과 다를 때, 지정 밖 계약 단언을 고쳐야 할 때, role-policy나 managed 구역이 바뀔 때, prerequisite가 없을 때

---

**T1 진행 기록 (2026-11-22, Orchestrator 수락):**
- Implementer(Codex bridge, dispatch `b734a3a9`, 세그먼트 2개): RED 44 실패 → GREEN 122 통과. 렌더 해시 15개·protected 해시 갱신, `revision`은 과거 관행대로 유지. golden `--diff` 78줄 일치 후 `--write`. MANIFEST 16 해시 변경. digest 8개 갱신. check 4개 통과.
- fresh QA(Codex bridge, dispatch `fe6a5bca`): AC-1·2·3·4·7·10과 문서 쪽 AC-8 proven. 관련 테스트 실패 566건(테스트 메서드 178개, `instruction-layout` 5, `consumer` 10, Python 3개 파일)은 1단계에서 모두 "base 재실행 필요"로 분류됐다. 2단계(base worktree `<git-common-dir>/arc/base/2026-11-22-qa-verification-ownership`)에서 모두 같은 이름으로 base에서도 실패해 기존 실패로 판정했다. 새 실패·새 실패 후보는 0건이다.
- Orchestrator disposition: 기존 실패는 이번 범위 밖이다. spec Result comparison("only new failures are findings")에 따라 AC-6(T1분)은 "새 실패 없음"으로 충족으로 본다.
- 편차: Implementer 실행 중 Orchestrator가 문서 커밋과 plan v3 개정을 해서 `permission_violation_observed`가 기록됐다. reconcile했고 Implementer 위반은 아니다.

### Task 2: verify 런타임 삭제

**목표·범위:** spec §6.1의 삭제와 인벤토리 정리, 생성물 재생성(G3)입니다.

**선행:** T1 수락·커밋(C1). 문서의 runtime 참조가 먼저 사라져야 하기 때문입니다(spec §6.5).

**Files (Implementer allowedPaths, 15개):**
- Delete:
  - `lib/runtime/verify-cli.mjs`, `lib/runtime/final-verify.mjs`, `lib/runtime/test-results.mjs`, `lib/runtime/node-test-reporter.mjs`
  - `shared/skill/runtime/verify-cli.mjs`, `shared/skill/runtime/final-verify.mjs`, `shared/skill/runtime/test-results.mjs`, `shared/skill/runtime/node-test-reporter.mjs`
  - `tests/node/runtime-final-verify.test.mjs`, `tests/node/runtime-test-results.test.mjs`
- Modify: `lib/installer/runtime-assets.mjs`, `tests/node/runtime-assets.test.mjs`, `tests/node/plan.test.mjs`, `tests/node/fixtures/installed-layout-golden.json`, `MANIFEST.sha256`

**Interfaces:**
- Consumes: T1 이후 문서에 verify 참조가 없습니다.
- Produces: `RUNTIME_MODULE_PATHS`가 35개 원소(base 39개 − 삭제 4개)가 되고, `verification.mjs`가 마지막 원소가 됩니다.

- [x] **Step 1: RED**
  - `tests/node/runtime-assets.test.mjs` `expectedPaths`에서 4개 문자열을 뺍니다.
  - 실행: `node --test tests/node/runtime-assets.test.mjs`
  - 기대 결과: `installer inventory covers every canonical module…`가 실패하고, fixture를 쓰는 generator 테스트도 canonical-only 불일치로 실패할 수 있습니다. 실패 이름을 보고합니다.
- [x] **Step 2: 삭제와 인벤토리 수정**
  - 위 10개 파일을 삭제합니다.
  - `runtime-assets.mjs`에서 `:16`, `:25`, `:40`, `:42`를 삭제합니다. 남는 마지막 원소 `'lib/runtime/verification.mjs'`의 쉼표는 기존 스타일에 맞춰 제거합니다.
- [x] **Step 3: GREEN**
  - `node --test tests/node/runtime-assets.test.mjs tests/node/runtime-versions.test.mjs` PASS
  - `node scripts/update-runtime-assets.mjs --check` PASS
  - Glob `{lib/runtime,shared/skill/runtime}/{verify-cli,final-verify,test-results,node-test-reporter}.mjs`가 0건이어야 합니다.
- [x] **Step 4: golden**
  - `--diff` 기대 결과는 정확히 64줄 `-`입니다: 16 레이아웃 × `skills/arc/runtime/{final-verify,node-test-reporter,test-results,verify-cli}.mjs`
  - 다르면 hold합니다. 같으면 `--write`를 실행하고 `--diff`가 비었는지 확인합니다.
- [x] **Step 5: MANIFEST**
  - `node scripts/update-manifest.mjs`
  - 기대 결과: 8항목 삭제(lib 4, shared 4)와 `lib/installer/runtime-assets.mjs` 1항목 변경입니다.
- [x] **Step 6: digest**: T1 Step 10과 같은 절차로 8개를 갱신하고 근거를 보고합니다.
- [x] **Step 7: AC-8 Grep(읽기 전용)**
  - 실행: `git grep -nE 'verify-start|verify-status|verify-compare|verify-rerun|verify-cleanup|verify-cli|final-verify\.mjs|test-results\.mjs|node-test-reporter\.mjs' -- ':!docs/superpowers'`
  - 기대 결과: 0건. untracked가 없으므로 `git grep`으로 충분합니다.
- [x] **Step 8: 관련 테스트와 check 실행**
- [x] **Step 9: 커밋(Orchestrator, 수락 뒤)**: `refactor(runtime): verify 런타임 도구·전용 테스트·설치 자산 삭제`

**수용 기준:** AC-5, AC-6(T2분), AC-8, AC-9. AC-9는 spec §7.1 정적 근거(`lib/installer/transaction.mjs:62`, `:76`, `stage-cleanup.mjs` `cleanupStage`)를 QA 보고에 인용하고, 실제 업그레이드 동작은 unverified로 표시합니다.

**관련 테스트(이유):**
- `tests/node/runtime-assets.test.mjs`: 직접 갱신하는 인벤토리 계약입니다.
- `tests/node/runtime-versions.test.mjs`: `RUNTIME_MODULE_PATHS`를 import해 생성기와 runtimeHash를 검사합니다.
- `tests/node/manifest.test.mjs`: required 목록이 `RUNTIME_MODULE_PATHS`에서 파생됩니다(`lib/installer/manifest.mjs:48-49`).
- `tests/node/plan.test.mjs`: digest입니다.
- `tests/node/installed-layout-golden.test.mjs`: golden입니다.
- `tests/node/test-scope-contract.test.mjs`: T1 부재 계약(문서 쪽 verify 참조 없음)이 런타임 삭제 뒤에도 유지되는지 봅니다(spec §10).

**check:** `node scripts/update-runtime-assets.mjs --check`, `npm run check:manifest`, `node scripts/check-installer-parity.mjs`, `npm run check:role-policy`

**필수 QA·증거:** fresh QA, Glob 부재, golden 64줄 목록, MANIFEST 변화, digest 근거, AC-8 Grep 0건, AC-9 정적 근거

**Hold:** 삭제 뒤 다른 모듈이 import 실패할 때(spec은 서로만 import한다고 확인함), golden이나 MANIFEST가 예상과 다를 때

---

**T2 진행 기록 (2026-11-22, Orchestrator 수락):**
- Implementer(Codex bridge, dispatch `877d23cc`, 세그먼트 3개): Step 1 RED(5 실패)에서 plan의 "34개" 계산 착오를 발견해 hold했다. 사용자 승인 v4(35개)로 재개했다. 모듈 8개·전용 테스트 2개를 삭제했고 `RUNTIME_MODULE_PATHS`는 35개가 됐다. golden `--diff` 64줄 `-` 일치 후 `--write`. MANIFEST는 8 삭제 + `runtime-assets.mjs` 1 변경. digest는 변화가 없어 편집하지 않았다(plan 예상과 다름, 렌더링 digest에 runtime 미포함). 관련 테스트 267개 통과, check 4개 통과.
- AC-8 Orchestrator 판정: grep 2건(`composite-instructions.test.mjs:120`, `test-scope-contract.test.mjs:214`)은 T1 부재 단언 리터럴이라 참조가 아니다.
- fresh QA(Codex bridge, dispatch `a2e99971`): AC-5·AC-6(T2분)·AC-8 proven. AC-9는 정적 근거만 proven이고 실제 업그레이드는 unverified다. 실패가 없어 base 재실행은 불필요했다.

## 이 작업 QA의 실패 판정 절차 (spec R-1–R-6, §8에 따라 이번부터 적용)

1. QA는 관련 테스트를 HEAD에서 실행합니다. task QA에서 HEAD는 커밋 전 작업 트리입니다(A2). 실패마다 R-1 정적 분류를 합니다.
   - 사용 명령(읽기 전용): `git diff --name-only 5f6fa2e95e1415d44467eab235115d11998f4d34`. task QA는 여기에 `git status --porcelain`의 untracked를 더합니다. 최종 QA는 `… 5f6fa2e9 HEAD`를 씁니다.
   - 대조 대상: 테스트 파일, 직접 import·load 모듈, 읽는 fixture·데이터(예: references, `agent-fragments.json`, golden, `instruction-contracts.json`), 테스트 설정
   - 하나도 바뀌지 않았으면 "변경 무관 실패"로 따로 보고합니다. finding은 아니며 Orchestrator가 disposition합니다.
   - 바뀌었거나 판단할 수 없으면 "base 재실행 필요"로 근거 경로와 함께 보고합니다.
   - 예상: Python 3개 파일과 references를 읽는 node 테스트의 실패는 대부분 2단계 대상입니다.
2. 2단계 대상이 있을 때만 Orchestrator가 base worktree를 만듭니다.
   - 명령: `git worktree add --detach "$(git rev-parse --git-common-dir)/arc/base/2026-11-22-qa-verification-ownership" 5f6fa2e95e1415d44467eab235115d11998f4d34`. 예상 경로는 `/Users/yunho/Desktop/project/arc/.git/arc/base/2026-11-22-qa-verification-ownership`이며 Orchestrator가 `--git-common-dir` 값을 실제로 확인합니다.
   - 이미 있으면 재사용합니다.
   - Orchestrator는 그 안에서 테스트나 prerequisite를 실행하지 않습니다. 경로와 prerequisite 상태를 현재 QA에게 후속 지시로 보냅니다.
   - prerequisite: node 테스트에는 `npm ci --ignore-scripts`, `npm run build:native`가 필요합니다. Python은 없음으로 예상합니다.
3. QA는 대상만 같은 이름으로 단독 실행합니다.
   - Node: `node --test --test-name-pattern='<정확한 이름>' tests/node/<file>`
   - Python: `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p '<file>' -k '<method>'`
   - cwd는 base worktree입니다.
   - R-3 판정표를 적용합니다. 파일 로드 실패는 같은 파일 로드로 비교합니다.
4. prerequisite가 없거나 sandbox 쓰기 거부가 나면 R-4 환경 차단으로 보고합니다. 설치·생성하지 않습니다. bridge QA는 `.git` 안 쓰기가 거부될 수 있습니다(spec §7.2). 그러면 Orchestrator가 prerequisite를 준비하거나, base worktree를 workspace로 하는 QA를 따로 배정합니다.
5. 간헐 의심은 HEAD에서만 단독으로 최대 3회 실행합니다(R-5).
6. 보고 행에는 R-6 필드를 모두 적습니다.
7. base worktree는 모든 최종 disposition 뒤 Orchestrator가 `git worktree remove <경로>`로 정리합니다.

## 최종 검증 (T1·T2 수락·커밋 뒤, fresh QA 1회)

**범위·시점:** task 선행 조건이 아니라 C2 뒤에 한 번 하는 단계입니다. 개별 task 수락을 늦추지 않습니다. 실행 대상 worktree의 verified HEAD(C2 또는 plan-level 기록 커밋 뒤의 HEAD)에서 합니다. 시작과 종료 때 `git status --porcelain`이 clean인지 기록합니다. 수행 중에는 같은 workspace에 Implementer 편집을 배정하지 않습니다(R-7).

1. **(a) 계약 테스트 전부**
   - `tests/node/test-scope-contract.test.mjs`, `tests/node/plan-level-records-contract.test.mjs`, `tests/node/run-mode-contract.test.mjs`, `tests/node/composite-instructions.test.mjs`, `tests/node/instruction-layout.test.mjs`, `tests/node/agent-fragments.test.mjs`, `tests/test_harness_contract.py`
   - 앞의 셋과 Python 하나는 이름에 contract가 들어 있습니다. 나머지는 문안·해시 계약입니다.
2. **(b) check 전부:** `npm run check:manifest`, `npm run check:role-policy`, `node scripts/update-runtime-assets.mjs --check`, `node scripts/check-installer-parity.mjs`
3. **(c) 재변경 파일 관련 테스트**
   - 예상 cross-task 중첩: T1과 T2가 모두 바꾸는 `tests/node/plan.test.mjs`, `tests/node/fixtures/installed-layout-golden.json`, `MANIFEST.sha256`
   - 관련 테스트: `plan.test.mjs`, `installed-layout-golden.test.mjs`, `manifest.test.mjs`(+ `check:manifest`)
   - `test-scope-contract.test.mjs`는 T2가 실제로 수정할 때만 재변경입니다. 이 plan의 T2는 수정하지 않습니다.
   - task QA가 검증하지 않은 비문서 커밋은 없을 것으로 예상합니다. plan-level 기록 커밋은 문서뿐입니다.
   - Orchestrator가 X_i를 계산해 브리프에 적고, QA가 `git diff --name-only C1 HEAD`로 대조합니다.
4. **전체 회귀 잠정 판정: 해당**
   - 트리거 1: `lib/prompts/agent-fragments.json`은 4 플랫폼 15개 프로필이 렌더하는 공유 생성기 입력입니다. references는 16 설치 레이아웃이 소비하고, golden·MANIFEST는 그 생성 출력입니다.
   - 트리거 4: 문서화된 공개 CLI `node <skill>/runtime/verify-cli.mjs`와 `verify-*` 명령 5개를 제거합니다.
   - 트리거 2: 현재 통합 이력이 없습니다(base `5f6fa2e9`에서 바로 분기). Orchestrator가 최종 브리프에 이력을 적습니다.
   - 트리거 3: 해당 없음으로 예상합니다. `package.json`·lockfile·test 설정은 바꾸지 않고, 테스트 파일 삭제는 설정 변경이 아닙니다. QA가 독립적으로 확인합니다.
   - 실행 명령(실재 확인함): `npm test`(= `node --test tests/node/*.test.mjs`)와 `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests`
   - 실패에는 R-1–R-6을 적용합니다.
5. **최종 Reviewer 1회(significant):** 모든 task 수락과 필수 QA가 끝난 뒤, 독립 Reviewer가 base `5f6fa2e9`..HEAD 전체를 검토합니다. 최종 QA와 병행할 수 있습니다.
   - 확인 항목: 4 플랫폼 바이트 일치, spec §5 원문 일치, 은퇴 문장 잔존, digest·해시를 옮긴 근거, 고아 런타임 파일, role-policy 불변, AC-10 문안
   - Reviewer finding은 Implementer → Reviewer로 처리하고 QA를 재배정하지 않습니다. 최종 QA의 새 실패는 Implementer → QA로 처리한 뒤 refreshed-diff로 Reviewer가 다시 확인합니다(R-11).

## 위험

- 사전 기준선이 없으므로 전체 회귀에서 기존 실패가 많이 나올 수 있습니다. 이 PC의 과거 기록에는 node 35건, Python 다수가 있었습니다. Python 3개 파일은 바뀐 references를 읽으므로 실패가 대부분 2단계로 가고, base worktree와 prerequisite 준비가 필요해질 가능성이 높습니다.
- bridge QA는 sandbox 때문에 `.git/arc/base` 안에서 쓰기 실행이 거부될 수 있습니다(R-4). 이 경우 base worktree를 workspace로 하는 별도 QA가 필요합니다.
- digest와 해시를 손으로 옮기므로 키를 잘못 짝지을 위험이 있습니다. 테스트 통과가 1차 방어이고, 실패 출력 근거가 2차 방어입니다.
- T1과 T2 사이에는 런타임 파일은 설치되지만 문서에는 없는 중간 상태가 있습니다. 의도된 순서입니다.
- 정적 분류는 직접 의존만 봅니다(spec §11).

## 미확인

- 대상 worktree와 base에서 prerequisite(`npm ci`, `build:native`)가 성공하는지
- `instruction-contracts.json` `revision`의 과거 관행
- `tests/test_codex_models.py`가 바뀐 파일을 읽는지
- `check-installer-parity.mjs`가 무엇을 검사하는지(이름 목록 기준이며 바뀐 테스트 이름은 parity json에 없음을 확인함)
- 실제 업그레이드 때 runtime이 정리되는지(AC-9, 정적 근거만 있음)

## 결정 사항 (Orchestrator 검토, 운영 세부)

- Q1 → T1 Implementer 시작 전에 Orchestrator가 대상 worktree에서 `npm ci --ignore-scripts`와 `npm run build:native`를 준비합니다(spec R-12의 prerequisite 준비 책임). 둘 다 `.gitignore` 대상이라 추적 파일은 바뀌지 않습니다. Implementer Step 0은 존재만 확인합니다.
- Q2 → A2를 확정합니다. task QA의 정적 분류는 base 대 작업 트리 diff(`git diff --name-only 5f6fa2e9`)와 `git status --porcelain`의 untracked를 합쳐 봅니다. 최종 QA는 `git diff --name-only 5f6fa2e9 HEAD`를 씁니다.
- Q3 → 최초 승인된 spec·plan은 ARC Planning document commit 규칙에 따라 문서 전용 커밋 `b3351cf`(`docs(plan): QA 소유 검증 전환 spec·plan 추가`)로 먼저 커밋했습니다. T1 커밋에는 T1 진행 기록과 이 v3 개정만, T2 커밋에는 T2 진행 기록만 넣습니다. plan-level 기록(최종 검증·Reviewer 결과)은 그 뒤 커밋이 없으면 canonical 인계 기록에만 둡니다.

## 개정 이력

| 버전 | 날짜 | 분류 | 내용 | 승인 |
|---|---|---|---|---|
| v2 | 2026-11-22 | — | 최초 승인본 | 사용자 "승인" |
| v3 | 2026-11-22 | mechanical | Q3·T1 Files·Step 12를 실제 문서 커밋(`b3351cf`) 처리에 맞게 정정. 계약 변경 없음 | 사용자 "승인" |
| v4 | 2026-11-22 | mechanical | T2 Interfaces의 `RUNTIME_MODULE_PATHS` 개수 계산 착오 정정(34 → 35). 삭제 범위 변경 없음 | 사용자 "승인" |
