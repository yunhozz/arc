# 플랫폼 parity 테스트 확장과 Commit gate 문구 강화 구현 계획

> **For agentic workers:** ARC Orchestrator가 조정한다. task마다 Implementer → fresh QA → Orchestrator 수락 → focused commit 1개 순서로 진행한다. Implementer와 QA는 Git 상태를 바꾸지 않는다. 단계는 checkbox(`- [ ]`)로 추적한다.

- 날짜: 2026-11-23 · 상태: v3 (사용자 승인 2026-11-23, T14 추가) · workflow: `2026-11-23-platform-parity`
- 대상: managed worktree `.claude/worktrees/last-task-final-verification`, 브랜치 `feat/last-task-final-verification`, base: 이 계획 문서 커밋(첫 Implementer 전 `docs(plan)` 커밋)의 HEAD. 줄 번호는 `50d83c6323b3b1cdf0bfdfb1823faf792f8142df` 기준이며 그 뒤 변경은 이 계획 문서 커밋(`c81cc22`)과 T6 커밋(`0f3b9c8`)이다
- 계획 경로: `docs/superpowers/plans/2026-11-23-platform-parity-tests.md`
- 경로·위험: plan 필요, 별도 spec 없음(설계 승인으로 진행). 깊이 라벨은 Orchestrator 기록을 따른다(가정 A1). 위험은 significant로 본다. 공유 계약 테스트, Python 계약, installer-parity 원장 결합이 걸려 있고, T14는 4 플랫폼 지침과 role-policy 생성 산출물을 바꾼다.

**Goal:** 테스트에서 codex·claude만 다루던 플랫폼 루프와 시나리오를 claude·codex·gemini·grok 4개로 넓혀, gemini·grok의 회귀가 테스트에서 드러나게 한다.

(v2) legacy `apply-models.py`·`model_config.py` 제거(U3)는 이 계획에서 뺐다. 이 스크립트에 기대는 Python 테스트 13개가 installer-parity 원장의 parity 근거로 연결되어 있어, 원장 재매핑과 함께 별도 계획에서 다룬다(D4).

(v3) 또한 plan 수준 진행 기록만 담은 단독 `docs(plan)` 커밋(2dfdf9a, b37534d, 1971f59)이 반복되지 않도록, 4 플랫폼 SKILL.md에 Commit gate를 두고 commit.md·verification.md·role-policy 문구를 강화한다(T14). 기계적 검사(runtime 명령, git hook)는 넣지 않는다(사용자 결정 2026-11-23 "기계적 검사 제외. 지침 문서 강화만.").

**Architecture:** T1–T13은 제품 코드(`lib/`, `bin/`, `shared/skill/runtime/`, 정책, 지침 문서)를 바꾸지 않는다. T14만 지침 문서·role-policy·생성 산출물·payload를 바꾼다(v3). task는 파일 단위로 나눠 두 task가 같은 파일을 편집하지 않게 했다. T14 외에 payload를 바꾸는 task는 없다(v3). 확장한 테스트가 gemini·grok의 실제 제품 차이를 드러내면 그 항목은 hold하고 보고한다(Q5). 제품 수정은 이 계획에 넣지 않는다.

**Tech Stack:** Node.js ≥22 ESM, `node:test`, Python `unittest`, git CLI.

**승인 근거:** 설계 승인 2026-11-23(사용자 "승인"), S0 Spike 결과와 사용자 결정 Q1–Q5:
- Q1: U4 분류를 사전 Spike로 수행(완료)
- Q2: Python에서 현재 실패하는 메서드는 바꾸지 않고 hold 목록에 둔다. subTest도 추가하지 않는다.
- Q3: U1은 별도 보안 계획으로 넘긴다.
- Q4: U3 제거를 이 계획에 포함한다 → v2(2026-11-23 사용자 "별도 계획으로 분리")로 이 계획에서 제외.
- Q5: 실제 제품 차이가 나오면 hold하고 보고한다.
- v3(2026-11-23): 사용자 "그냥 c81cc22252984529c446f0f4f94044f22d2b623e 커밋의 plan에 추가해", 결정 "기계적 검사 제외. 지침 문서 강화만.", 기존 closing 문장은 "전제 문장만 추가", role-policy 덧붙임 "예", 범위 감사 "예", v3 개정안 "승인".

근거 문서는 `/private/tmp/claude-501/-Users-ma-24-007-Desktop-workspace-arc/99737933-b2af-4438-a13f-76ed45deb3d3/scratchpad/s0-summary.md`이다.

## Global Constraints

- **범위:** T1–T13은 테스트 파일만 바꾼다. T14는 자기 allowedPaths를 따른다(v3).
  - 바꾸지 않는 것(T14 allowedPaths 제외): `lib/`, `bin/`, `scripts/`, `shared/`, `{platform}/skill/**`, `MANIFEST.sha256`, golden, `{platform}/agents/**`, `lib/policy/**`, 지침 문서.
  - 공유 test fixture 모듈(`tests/node/fixtures/*.mjs`, `tests/node/role-fixtures.mjs`)도 바꾸지 않는다. 이를 바꿔야 확장할 수 있으면 해당 항목만 hold한다.
- **확장 형태:** 기존 배열의 순서를 지키고 뒤에 `'gemini'`, `'grok'`을 붙인다(예: `['codex','claude']` → `['codex','claude','gemini','grok']`).
  - 새 테스트의 4 플랫폼 순서는 registry 순서 `['claude','codex','gemini','grok']`를 쓴다(`tests/node/grok-platform.test.mjs:153`, `tests/node/platform-registry.test.mjs:72`).
  - 플랫폼별 경로·확장자는 하드코딩 대신 기존 식을 일반화해 정한다. 예: codex는 `.toml`, 나머지는 `.md`.
  - 새 공유 helper 모듈은 만들지 않는다.
- **테스트 이름 보존:** 원장에 매핑된 테스트(아래 "원장 결합")의 이름은 바꾸지 않는다. 확장은 `${platform}` 이름이 붙은 새 테스트를 추가하거나, 테스트 본문 안의 루프만 넓히는 방식으로 한다.
- **Q5 hold:** 넓힌 gemini·grok 단언이 실패할 때 그 원인을 구분한다.
  - 테스트 경로·확장자·fixture 사용 오류이면 같은 task 안에서 고친다.
  - 제품 출력이 claude·codex와 다른 것이면 제품도 그 단언도 바꾸지 않는다. 해당 확장만 되돌린 상태로 hold하고, 실패 이름·단언·실제값을 보고한다. Orchestrator가 처분한다(hold 목록 유지 또는 별도 수정 계획).
- **masking:** Step 0에서 base 실패로 확인된 테스트는 넓히지 않고 task hold 목록에 기록한다. 이미 실패하는 테스트는 확장 효과를 관찰할 수 없기 때문이다.
- **RED 규칙:** 제품이 이미 맞으면 루프 확장은 곧바로 통과할 수 있다. 이 경우 RED 대신 아래 두 가지를 증거로 남긴다.
  - (a) 새로 실행된 테스트 이름 목록(`--test-reporter=spec`), 또는 본문 루프 확장이면 반복 횟수 증가 근거
  - (b) 임시 음성 확인: 넓힌 gemini 또는 grok 기대값 하나를 일부러 틀리게 바꿔 실패하는지 보고 되돌린다. 종료 diff에 남기지 않는다.
- **Python:** `PYTHONDONTWRITEBYTECODE=1`로 실행한다.
- **Implementer 금지 사항:** stage·commit·stash·reset·브랜치·worktree 조작을 하지 않는다. allowedPaths(정확한 파일 목록) 밖을 수정하지 않는다.
- **prerequisite:** Orchestrator가 `node_modules/`(`npm ci --ignore-scripts`)와 `build/native/`(`npm run build:native`)를 미리 준비한다. golden `--diff/--write`에 필요하다.
- **bridge 운용**
  - 같은 worktree에서 쓰기 bridge는 동시에 하나만 실행한다.
  - bridge 실행 중에는 commit 등 ref 이동을 하지 않는다(refsChanged 실패).
  - bridge sandbox에서 실행할 수 없는 npm sandbox·PTY 테스트는 Orchestrator가 host에서 실행하고, 그 출력을 Implementer와 QA에 전달한다.

### 공통 Step 0(모든 task)

1. 시작 `git status --porcelain`를 기록한다.
2. 대상 테스트 파일을 base 상태로 실행하고 실패 이름을 기록한다. Python은 메서드별 `ok/FAIL/ERROR`를 기록한다.
3. 원장 매핑을 read-only로 조회한다.
   ```
   node -e "const l=require('./tests/installer-parity.json'),f=new Set(process.argv.slice(1)),s=new Set();for(const e of [...l.entries,...l.legacyHelpers])for(const d of e.destinations||[])if(f.has(d.file))s.add(d.file+' :: '+(d.class?d.class+'.':'')+d.test);console.log([...s].sort().join('\n')||'(none)')" <task의 테스트 파일들>
   ```
4. 매핑된 이름 중 이 task가 바꿀 위험이 있는 것을 표시한다.

### 공통 종료(모든 task)

- 관련 테스트와 check를 실행한다.
- 종료 `git status --porcelain`에는 allowedPaths와 Orchestrator 소유 plan 문서만 있어야 한다.
- 확장한 루프·테스트 목록과 hold 목록(이유 포함)을 보고한다.

## 원장 결합(installer-parity)

- `tests/installer-parity.json`은 legacy inventory(236 ID / 739 단언 / helper 14, `scripts/check-installer-parity.mjs:13` 해시로 고정)와 `entries[].destinations[]{file,test}` 매핑을 담는다.
- `--complete`는 매핑된 Node 테스트를 `--test-name-pattern '^(?:name)$'`로 실행해 이름별 `ok`를 요구한다(`:50-55`). 매핑된 Python 파일은 suite 전체가 exit 0이어야 한다(`:57-58`).
- 확인된 매핑 파일(일부 조회): `consumer`, `plan`, `global-config`, `all-targets`, `manifest`. 나머지는 각 task의 Step 0에서 조회한다.
- **원장 영향 경로**
  - (1) 매핑된 테스트 이름 변경 → `destinations[].test` 불일치
  - (2) 넓힌 본문이 매핑 테스트를 실패시킴 → `--complete` 실패(Q5 hold로 처리)
  - (3) 매핑된 테스트 메서드 삭제(v1의 U3 사례: `tests/test_codex_models.py`의 `ApplyModelsTests` 5개와 `model_config.py`를 import하는 `ModelSettingsTests` 8개. v2에서 U3를 제외해 해당 없음)
- **처리 규칙**
  - 생성기는 없다. 원장 편집은 수동이고 inventory 해시와 개수를 바꿀 수 없다.
  - 이 계획은 원장을 편집하지 않는다. 모든 task는 (1)과 (3)을 피한다.
  - 피할 수 없으면 그 항목을 hold하고 보고한다. Orchestrator는 원장을 편집하는 plan 개정을 거친다. 개정에서 바꿀 수 있는 것은 `destinations[].test`, `destination.test`뿐이며 `legacyInventory`·`legacyHelpers[].assertions`는 건드리지 않는다.
  - `parity-check.test.mjs:37`의 개수 단언(236/235/1, 739/736/3, 14)은 inventory 기준이므로 이 계획에서 바뀌지 않는다.
- **원장 관련 확인 책임:** T2가 이 결합을 문서 근거로 대조하고, 최종 검증에서 `--complete`를 실행한다.

## 파일 구조와 task 소유

| task | 소유 파일(allowedPaths) | payload 영향 |
|---|---|---|
| T1 | `tests/node/role-policy.test.mjs`, `tests/node/agent-fragments.test.mjs` | 없음 |
| T2 | `tests/node/parity-check.test.mjs` | 없음 |
| T3 | `tests/node/package.test.mjs` | 없음 |
| T4 | `tests/node/all-targets.test.mjs`, `tests/node/upgrade-harness.test.mjs`, `tests/node/npm-upgrade-consumer.test.mjs`, `tests/node/consumer.test.mjs` | 없음 |
| T5 | `tests/test_harness_contract.py`, `tests/test_arc_policy.py` | 없음 |
| T6 | `tests/node/manifest.test.mjs` | 없음 |
| T7 | `tests/node/plan.test.mjs`, `tests/node/global-config.test.mjs` | 없음 |
| T8 | `tests/node/models.test.mjs`, `tests/node/profile-render.test.mjs`, `tests/node/preset.test.mjs`, `tests/node/tui-setup.test.mjs` | 없음 |
| T9 | `tests/node/management-operations.test.mjs`, `tests/node/management-status.test.mjs`, `tests/node/uninstall.test.mjs`, `tests/node/hardcoding-residual.test.mjs` | 없음 |
| T10 | `tests/node/install-mode-review-followup.test.mjs`, `tests/node/upgrade-reapply.test.mjs`, `tests/node/upgrade-state.test.mjs` | 없음 |
| T11 | `tests/node/npm-lifecycle.test.mjs`, `tests/node/npm-lifecycle-pty.test.mjs`, `tests/node/npm-completion-consumer.test.mjs`, `tests/node/runtime-installed-entry.test.mjs` | 없음 |
| T12 | `tests/node/package-references.test.mjs`, `tests/node/superpowers.test.mjs`, `tests/node/status-labels.test.mjs` | 없음 |
| T13 | `tests/node/role-routing-dispatch.test.mjs`, `tests/node/role-supervisor-descendants.test.mjs`(조건부) | 없음 |
| T14 | `{claude,codex,gemini,grok}/skill/SKILL.md`, `{…}/skill/references/commit.md`, `{…}/skill/references/verification.md`, `lib/policy/role-policy.json`과 `scripts/update-role-policy.mjs` 생성 산출물(Step 0 목록), `tests/node/plan-level-records-contract.test.mjs`, `tests/node/fixtures/instruction-contracts.json`, `MANIFEST.sha256`, golden | 있음(지침·정책) |

 `tests/installer-parity.json`은 어느 task도 편집하지 않는다.

## Review Focus

1. 확장이 제품 차이를 숨기지 않는지. Q5 hold 처분, 단언 약화·플랫폼별 예외 분기 추가가 없는지 확인한다.
2. 원장 매핑 테스트 이름 보존, `--complete` 통과
3. T1–T13에서 payload·MANIFEST·golden 변경이 없는지 확인한다(v3).
4. Python Q2: base에서 실패하던 메서드가 바뀌지 않았는지 확인한다.
5. 임시 음성 확인을 되돌렸는지, 종료 diff에 남지 않았는지 확인한다.
6. (v3) T14: 기존 고정 문장이 한 글자도 바뀌지 않았는지(추가만), 새 문구가 4 플랫폼에 같은 텍스트로 각각 한 번씩만 있는지 확인한다.

---

### Task 1: role-policy·agent-fragments 계약의 4 플랫폼 확장

**목표·범위:** 정책 projection과 managed 구역 계약을 4 플랫폼 대상에서 검사한다.
- `tests/node/role-policy.test.mjs:65`, `:140`, `:155`, `:226`, `:235`, `:247`, `:258`, `:266` 등 `:140–358` 구간의 `['codex','claude']` 루프
- `tests/node/agent-fragments.test.mjs:13`(Planner full-plan 지시를 2개 프로필에서만 확인)

**선행:** 없음.

**Files (allowedPaths):** Modify `tests/node/role-policy.test.mjs`, `tests/node/agent-fragments.test.mjs`

- [x] **Step 0:** 공통 Step 0.
- [x] **Step 1:** 구간 안의 플랫폼 루프를 확장 형태로 넓힌다.
  - 경로는 `${platform}/agents/arc-${role}.${platform==='codex'?'toml':'md'}`, `${platform}/skill/references/*.md`처럼 일반화한다.
  - `[platform.claude]`처럼 플랫폼 고유 규칙 ID를 단언하는 곳은 `lib/policy/role-policy.json`의 플랫폼별 규칙 데이터로 기대값을 정한다(읽기만). 하드코딩 분기는 추가하지 않는다.
- [x] **Step 2:** `agent-fragments.test.mjs:13`의 대상 프로필을 4 플랫폼 Planner 프로필로 넓힌다.
- [x] **Step 3:** `node --test tests/node/role-policy.test.mjs tests/node/agent-fragments.test.mjs`를 실행한다. 통과하면 RED 규칙의 (a)(b)를 증거로 남긴다. 실패하면 Q5로 분류한다.
- [x] **Step 4:** 공통 종료.
- [x] **Step 5: 커밋(Orchestrator, 수락 뒤):** `test(policy): role-policy·fragment 계약을 네 플랫폼으로 확장`

**수용 기준:**
- 구간 안의 `['codex','claude']` 루프가 남지 않는다. 남기면 이유와 hold 목록이 있어야 한다.
- 32개 managed 대상(4 × 8)이 검사된다.
- 신규 실패와 단언 약화가 없다.

**관련 테스트(이유):**
- `role-policy`, `agent-fragments`(직접 편집)
- `test-scope-contract`, `instruction-layout`(같은 정책 산출물을 읽음)

**check:** `npm run check:role-policy`

**필수 QA·증거:**
- fresh QA
- 확장 루프 목록
- 음성 확인 근거
- 4 플랫폼 대상 수(32) 독립 확인

**Hold:** Q5, masking, 원장 이름 변경 필요

**진행 기록 (T1):** 2026-11-23 수락. Implementer(`7adeecb0`): base role-policy 30/30·agent-fragments 5/5, 원장 매핑 없음. `role-policy.test.mjs` 15개 루프(:65, :140, :155, :226, :235, :247, :258, :266, :275, :292, :303, :311, :321, :339, :358)와 `agent-fragments.test.mjs:13`을 4 플랫폼으로 확장(반복 수 2배). 원장 미매핑 테스트 이름 2개 `both`→`all four`. 음성 확인: gemini notice 기대값을 메모리에서 바꾸면 `:69` strictEqual 실패. Orchestrator 호스트: role-policy·agent-fragments·test-scope-contract·instruction-layout 201/201, `check:role-policy` 48, installer-parity 235/736/14. fresh QA(`12b79803`, 재확인 1회): 수락 권고, finding 없음. POLICY_TARGETS 48개(플랫폼당 12) 중 T1 명시 검사 32개(지침 7 + Planner 프로필 1, × 4), 48개 생성 출력 바이트 일치.

---

### Task 2: paired specialist payload parity의 4 플랫폼 확장과 원장 결합 확인

**목표·범위:** `tests/node/parity-check.test.mjs:42-56`의 `['codex','claude']` 비교를 4 플랫폼으로 넓힌다. `[platform.` 줄을 제외한 contract 본문이 4 플랫폼에서 모두 같은지 확인한다.
- 원장은 편집하지 않는다.
- S0의 HISTORICAL 96줄이 변경 불필요인지 문서 근거로 확인한다.

**선행:** 없음.

**Files (allowedPaths):** Modify `tests/node/parity-check.test.mjs`. `tests/installer-parity.json`은 read-only.

- [x] **Step 0:** 공통 Step 0. `node scripts/check-installer-parity.mjs`와 `--complete`의 base 결과를 기록한다. `--complete`가 base에서 실패하면 실패 메시지를 기준으로 기록한다.
- [x] **Step 1:** `:48`을 `['codex','claude','gemini','grok']`로 바꾼다. 확장자 식을 유지하고, 4개 본문이 모두 같다는 단언(`contracts.every(c => c === contracts[0])`)으로 일반화한다. 실패 메시지에 role과 platform을 남긴다.
- [x] **Step 2:** `node --test tests/node/parity-check.test.mjs`를 실행한다. 통과하면 RED 규칙 (b)를 적용한다. gemini·grok 본문이 `[platform.` 외 줄에서 다르면 Q5 hold로 처리하고 차이 줄을 보고한다.
- [x] **Step 3:** 원장 결합을 대조한다. `:37` 개수 단언이 바뀌지 않았고 이 task가 원장을 편집하지 않았음을 보고한다.
- [x] **Step 4:** 공통 종료.
- [x] **Step 5: 커밋(Orchestrator, 수락 뒤):** `test(parity): paired specialist payload 비교를 네 플랫폼으로 확장`

**수용 기준:**
- 4 플랫폼 × 5 역할 비교
- `check-installer-parity` 일반 모드와 `--complete`의 결과가 base 대비 악화하지 않음
- 원장 diff 없음

**관련 테스트(이유):** `parity-check`(직접 편집), `role-policy`(같은 출력)

**check:** `node scripts/check-installer-parity.mjs`, `node scripts/check-installer-parity.mjs --complete`, `npm run check:role-policy`

**필수 QA·증거:** fresh QA, 비교 대상 20개, 음성 확인, `--complete` 출력

**Hold:** Q5, `--complete`의 신규 실패

**진행 기록 (T2):** 2026-11-23 수락. Implementer(`adb44585`): base parity-check 17/17, 원장 매핑 없음. `:48`을 4 플랫폼으로 넓히고 역할별 codex 본문과 플랫폼별 `assert.equal`(메시지 `${role} on ${platform}`)로 비교(계획의 `every` 단언과 동등, 20회). `optional read method` 단언도 4 플랫폼. 음성 확인: gemini implementer 본문에 줄 삽입 시 `implementer on gemini` 실패. Orchestrator 호스트: parity-check+role-policy 47/47, installer-parity 일반 모드 235/736/14, `--complete`는 base(cc47979)와 변경 후 모두 exit 1로 `consumer.test.mjs`의 같은 기준 실패 3건에서 중단(그 뒤 매핑 실행은 미검증). fresh QA(`b3ec8544`, 재확인 1회): 수락 권고, finding 없음. S0 HISTORICAL 96줄은 원장의 기존 설치 동작 근거(95줄 Claude 스킬 링크 예외, 1줄 Codex 선행 대상 시나리오)로 D5에 따라 변경 불필요.

---

### Task 3: package 테스트의 4 플랫폼 확장

**목표·범위:** `tests/node/package.test.mjs:10`(ordinary 파일 목록), `:14`, `:22`의 codex·claude 한정 경로와 루프에 gemini·grok을 추가한다. `:9`의 cache 경로도 같은 구성이면 함께 넓힌다.

**선행:** 없음(v2: payload 변경 task가 없어짐).

**Files (allowedPaths):** Modify `tests/node/package.test.mjs`

- [x] **Step 0:** 공통 Step 0.
- [x] **Step 1:** 합성 경로 `gemini/skill/scripts/nested/...`, `grok/skill/scripts/nested/...`와 `:14`·`:22`의 플랫폼 목록을 확장한다.
- [x] **Step 2:** `node --test tests/node/package.test.mjs`를 실행한다. 통과하면 RED 규칙 (a)(b)를 적용한다.
- [x] **Step 3:** 공통 종료.
- [x] **Step 4: 커밋:** `test(package): package 포함·제외 검사를 네 플랫폼으로 확장`

**수용 기준:** 4 플랫폼 경로가 포함·제외 규칙 양쪽에서 검사되고, 신규 실패가 없다.

**관련 테스트(이유):** `package`(직접), `release-artifact`(같은 cache 제외 규칙), `manifest`(payload 목록)

**check:** `npm run check:manifest`

**필수 QA·증거:** fresh QA, 음성 확인

**Hold:** Q5, masking

**진행 기록 (T3):** 2026-11-23 수락. Implementer(`4992042d`): base package 10/10, 원장 매핑 없음. `:9` 캐시 표본 6→10(gemini·grok 중첩 `__pycache__`·`outside.pyc`), `:10` 일반 파일 3→5, `:14` 포함 단언 7→11(`SKILL.md` 2→4), `:22` 플랫폼 루프 2→4(기본 파일 12→24, 공유 참조 사본 제외 26→52, `references/superpowers/` 제외 2→4). 음성 확인: grok `brainstorming.md` 기대를 뒤집으면 `false !== true` 실패. 테스트 이름("for both platforms") 유지(이름 보존 규칙, 원장 미매핑). Orchestrator 호스트: package·release-artifact·manifest 118/118, `check:manifest` 292. fresh QA(`bddcded0`): 수락, finding 없음.

---

### Task 4: 설치 lifecycle의 4 플랫폼 순서·부분 실패와 upgrade·consumer 확장

**목표·범위:**
- (a) `tests/node/all-targets.test.mjs`: `installTargets`를 4 플랫폼 입력으로 실행하는 신규 테스트 2개를 추가한다. 기존 테스트(`:4–16`, 원장 매핑)는 바꾸지 않는다.
  - `All installs four targets in registry order`: preflight·설치 순서 `['claude','codex','gemini','grok']`, 결과 4개 `installed`
  - `All stops at a third-target failure, keeps earlier installs and leaves the fourth not-started`: gemini에서 기존 fault hook 방식으로 실패를 주입한다. claude·codex 설치는 유지되고, gemini는 실패, grok은 `not-started`여야 한다.
- (b) `tests/node/upgrade-harness.test.mjs:33`
- (c) `tests/node/npm-upgrade-consumer.test.mjs:8`, `:16`, `:24`
- (d) `tests/node/consumer.test.mjs:12–18`의 codex·claude 한정 루프

**선행:** 없음(v2).

**Files (allowedPaths):** Modify `tests/node/all-targets.test.mjs`, `tests/node/upgrade-harness.test.mjs`, `tests/node/npm-upgrade-consumer.test.mjs`, `tests/node/consumer.test.mjs`

- [x] **Step 0:** 공통 Step 0. npm sandbox 테스트가 bridge sandbox에서 실행되지 않으면 Orchestrator의 host 출력을 기준으로 쓴다.
- [x] **Step 1: RED 기대 없음** all-targets 신규 테스트를 추가한다. 입력 plan은 같은 파일의 `plans(t)` 방식을 4 플랫폼으로 일반화한 지역 helper로 만든다. 공유 fixture는 바꾸지 않는다. 통과하면 음성 확인을 한다(실패 주입 위치를 grok으로 바꿔 기대 상태가 어긋나는지 보고 되돌림).
- [x] **Step 2:** (b)–(d)를 넓힌다.
  - 각 테스트의 설치 명령이 이미 4 플랫폼을 설치하는 경우(`--target all` 등)에는 단언 루프만 넓힌다.
  - codex·claude만 설치하는 경우, 같은 파일 안에서 CLI가 지원하는 대상 지정만 바꿔 확장한다.
  - 공유 fixture(`tests/node/fixtures/npm-sandbox*` 등) 변경이 필요하면 그 항목만 hold한다.
- [x] **Step 3:** 4개 파일을 실행한다(npm sandbox 테스트는 host 필요 시 Orchestrator 실행).
- [x] **Step 4:** 공통 종료.
- [x] **Step 5: 커밋:** `test(lifecycle): 네 플랫폼 설치 순서·부분 실패와 upgrade·consumer 검사 확장`

**수용 기준:**
- 4 플랫폼 순서와 3번째 실패 시 상태(claude·codex `installed`, gemini 실패, grok `not-started`, 앞선 설치 보존)가 단언된다.
- (b)–(d)가 4 플랫폼을 검사하거나 hold 이유가 기록된다.
- 기존 매핑 테스트 이름이 유지된다.

**관련 테스트(이유):**
- 4개 파일(직접)
- `grok-platform`·`targets`(registry 순서)
- `transaction`(설치 rollback)
- `packed-consumer`(같은 sandbox)

**check:** `node scripts/check-installer-parity.mjs --complete`(`all-targets`·`consumer` 매핑)

**필수 QA·증거:** fresh QA, 신규 테스트 이름, 음성 확인, host 실행 출력(해당 시)

**Hold:** Q5(예: gemini·grok 부분 실패 상태가 다르다), 공유 fixture 변경 필요, masking

**진행 기록 (T4):** 2026-11-23 수락. Implementer(`b296ac05`, 후속 2회: `consumer:18` 패치 재개, QA finding 수정).
- 호스트 base(40a13ed, 4파일): 61 tests, 49 pass, 11 fail, 1 skip. 최종: 71 tests, 59 pass, 11 fail(이름 동일), 1 skip.
- (a) 신규 `All installs four targets in registry order`, `All stops at a third-target failure, keeps earlier installs and leaves the fourth not-started`(지역 helper, 기존 `:4–16` 불변). 음성 확인: 실패 주입을 grok으로 옮기면 gemini `installed`·grok `failed`로 단언 실패.
- (b) `upgrade-harness.test.mjs`: `payload()` 4 플랫폼, `seed()`가 gemini·grok 설치, `collectInstalledState()`·`buildUpgradePlans()` 경유 계획·적용 단언. gemini·grok 형제 테스트 8개(same-version, profile publication failure, offline, expanded shared instructions) 추가, 공유 완료 계획 2→4. v1/v2 legacy 사례는 입력 fixture가 codex·claude뿐이라 유지. 음성 확인: grok `SKILL.md` 기대 `/^new harness /` 실패. 최초 구현은 입력만 넓혀 QA finding(미충족) → 수정.
- (c) hold(masking): `npm-upgrade-consumer:8`, `:16`, `:24`(유일 테스트가 base 실패, 부분 실패 구간 `ARC harness updated to 0.1.6.` 출력).
- (d) `consumer:18` 4 플랫폼 제거 확장(압축 줄을 여러 줄로 풀고 기존 단언 6개 유지). 음성 확인: grok `not-started` 기대가 `grok: uninstalled`에서 실패. hold(masking): `consumer:12`, `:13`, `:14`, `:16`(base 실패: manifest `scripts/deploy.sh` 누락, `preset is not defined`).
- 기준 이슈 기록: 원장 이름 불일치(`all-targets` `All preserves external literal links and installs independent internal snapshots`, `consumer` `packed tarball executes every target and preset without Python or source access`)는 base부터 존재. 관련 `transaction.test.mjs:45`는 50d83c6 base 실패. `--complete`는 base부터 `consumer` 매핑 실패로 조기 종료.
- fresh QA(`1c03ca65`, finding 1건 → 재확인): 수락.

---

### Task 5: Python 계약 테스트 확장(Q2 규칙)

**목표·범위:** `tests/test_harness_contract.py:12`, `:798`과 `tests/test_arc_policy.py`의 루프(`:385`, `:395`, `:420`, `:451`, `:495`, `:563`, `:1396`, `:1475`, `:1502`, `:1504`, `:1599`, `:1612`, `:1623`)에서 base에서 통과하는 메서드만 4 플랫폼으로 넓힌다.

**선행:** 없음.

**Files (allowedPaths):** Modify `tests/test_harness_contract.py`, `tests/test_arc_policy.py`

- [x] **Step 0:** 공통 Step 0. 대상 메서드별 base 상태표를 만든다.
  ```
  PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -v -s tests -p test_harness_contract.py
  PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -v -s tests -p test_arc_policy.py
  ```
  각 대상 줄이 속한 메서드명과 `ok/FAIL/ERROR`를 기록한다. 편집 전에 이 표를 제출한다.
- [x] **Step 1:** `ok` 메서드만 넓힌다.
  - `:12`가 여러 메서드가 쓰는 모듈 상수이고 그중 하나라도 base에서 실패하면 상수는 바꾸지 않는다. 대신 통과 메서드 안에서만 지역 4 플랫폼 튜플을 쓴다.
  - 이미 `subTest(platform=…)`를 쓰는 루프(`:498` 부근)는 그 구조를 유지한다.
- [x] **Step 2:** 실패 메서드는 바꾸지 않고 hold 목록에 둔다. 메서드명, base 실패 요약, 대상 줄을 적는다.
- [x] **Step 3:** 같은 명령을 재실행한다. 넓힌 메서드가 통과하는지, 신규 실패가 없는지 메서드 이름 기준으로 대조한다. 넓힌 메서드가 실패하면 Q5 hold로 처리한다.
- [x] **Step 4:** 공통 종료.
- [x] **Step 5: 커밋:** `test(contract): 통과 중인 Python 계약 루프를 네 플랫폼으로 확장`

**수용 기준:**
- base 상태표가 있다.
- 넓힌 메서드는 모두 base `ok`이고 확장 뒤에도 `ok`다.
- base 실패 메서드의 diff는 없다(QA가 메서드 범위 diff로 확인).
- 신규 실패가 없다.

**관련 테스트(이유):** 두 파일(직접). `test_claude_payload.py`는 같은 문서를 읽으므로 실행만 한다.

**check:** 없음(정책 산출물 불변)

**필수 QA·증거:** fresh QA, 상태표 독립 재현, hold 목록

**Hold:** Q5, 공유 상수 충돌

**진행 기록 (T5):** 2026-11-23 수락. Implementer(`5bf5475d`): base 상태표 harness 35 메서드(ok 17·FAIL 18), policy 119 메서드(ok 11·FAIL 102·ERROR 6). 확장 9개(harness `test_commit_guidance_uses_english_descriptions`, `test_maintained_local_links_resolve`, `test_stale_png_is_unreferenced`, `test_failure_disposition_orders_evidence_classification_holds_and_release`, `test_envelope_fingerprint_distinguishes_source_access_states`; policy `test_pre_final_qa_failures_keep_qa_recheck`, `test_flat_imported_assets_match_original_provenance_and_both_platforms`, `test_visual_roles_preserve_output_identity_and_verdict_limits`, `test_target_change_holds_edits_until_choice_and_state_confirmed`), 모두 base ok → ok. `:12` `PLATFORMS`는 base 실패 메서드도 쓰므로 유지하고 통과 메서드 안에서 지역 4 플랫폼 튜플을 썼다.
- hold(Q2, base FAIL 30): harness `test_planner_progress_and_saved_approval_contract`, `test_explicit_request_authorization_has_scoped_conditions`, `test_authorization_reuse_preserves_target_and_state_gates`, `test_contract_mutations_reject_removed_holds_and_role_guards`, `test_common_contracts_have_platform_owners`, `test_document_order_accepts_choice_before_writing`, `test_document_order_rejects_missing_required_gates`, `test_planner_authorship_contract`, `test_planner_authorship_allows_user_preferences`, `test_handoff_and_role_local_guards_remain_accessible`, `test_readiness_requires_acceptance_and_verified_result`, `test_commit_contract_distinguishes_plan_skip_and_no_change`, `test_commit_authority_is_orchestrator_only`, `test_commit_checker_preserves_hold_and_reuse_contracts`, `test_native_adapters_remain_explicit`, `test_policy_contract_checker_rejects_missing_guards`, `test_handoff_preserves_provenance_visual_and_resume_fields`, `test_verification_and_visual_companion_keep_visual_gaps_visible`; policy `test_final_plan_reviewer_corrections_skip_qa`, `test_final_reviewer_findings_on_committed_work`, `test_final_review_exception_preserves_scope_and_roles`, `test_planner_drafting_preflight_requires_complete_brief`, `test_planner_returns_complete_draft_and_self_review`, `test_planner_followup_batches_substantive_omissions`, `test_planner_turn_minimization_preserves_approval_gates`, `test_models_scouter_lookup_exception`, `test_installed_limits_policy_replaces_manual_config`, `test_qa_freshness_and_no_contradictory_substitution`, `test_internal_superpowers_paths_and_runtime_boundaries`, `test_profiles_bound_recovery_without_relaxing_role_authority`.
- hold(공유 상수 의존, base ok 12): `:12` 공유 상수·owner 표·checker에 의존하는 `PolicyContractTests` 12개(상수 유지 규칙).
- 원장: harness 매핑 0, policy 87. 대상과 겹친 3개(`test_models_scouter_lookup_exception`, `test_final_reviewer_findings_on_committed_work`, `test_installed_limits_policy_replaces_manual_config`)는 base FAIL로 미변경.
- 음성 확인: grok `brainstorming.md` 존재 기대를 임시로 넣으면 `AssertionError`, 원복 후 ok.
- Orchestrator 호스트: harness Ran 35·failures 36, policy Ran 119·failures 331·errors 6(base와 동일 총계). fresh QA(`e3e023d9`, 재확인 1회): 수락. base·현재 154 메서드 상태 변화 0, 실패·오류 헤더(subTest 포함) harness 36·policy 337(고유 336) 일치.

---

### Task 6: manifest 계약의 4 플랫폼 확장 (v2: U3 제외)

**목표·범위:** `tests/node/manifest.test.mjs:77`, `:78`(platform 복사본 C1 거부), `:93`(coordination.md 필수·최신)의 `['codex','claude']`를 4 플랫폼으로 넓힌다. `:48`의 mutation(`codex/skill/scripts/model_config.py` 줄 제거)은 스크립트가 남으므로 그대로 둔다.

**선행:** 없음.

**Files (allowedPaths):** Modify `tests/node/manifest.test.mjs`

- [x] **Step 0:** 공통 Step 0. 원장 조회 대상: `tests/node/manifest.test.mjs`(v1 Step 0 결과: 매핑 4건 `descriptor-verifies bytes and mutable model inputs`, `dynamic payload rejects malformed provenance`, `manifest reference coverage rejects missing entries and changed hashes`, `payload leaf replacement cannot read an outside regular-file sentinel`, 확장 대상과 겹치지 않음; base 82 pass).
- [x] **Step 1:** `:77`, `:78`, `:93`의 루프를 확장 형태로 넓힌다.
- [x] **Step 2:** `node --test tests/node/manifest.test.mjs`를 실행한다. 통과하면 RED 규칙 (a)(b)를 적용한다. gemini·grok에서 실패하면 Q5로 분류한다.
- [x] **Step 3:** 공통 종료.
- [x] **Step 4: 커밋:** `test(manifest): payload 복사본·coordination 검사를 네 플랫폼으로 확장`

**수용 기준:** C1 복사본 거부와 coordination.md 필수·최신 검사가 4 플랫폼에서 이뤄진다. 매핑 테스트 이름이 유지된다. 신규 실패가 없다. 제품·payload diff가 없다.

**관련 테스트(이유):** `manifest`(직접), `installed-layout-golden`(payload 목록), `package-references`(같은 C1 규칙)

**check:** `npm run check:manifest`, `node scripts/check-installer-parity.mjs`

**필수 QA·증거:** fresh QA, 음성 확인, 확장 반복 수

**Hold:** Q5, masking, 원장 이름 변경 필요

**진행 기록 (T6):** v1 Implementer(`e9842af0`, 2026-11-23)가 Step 0에서 hold했다. 원장이 스크립트 의존 Python 메서드 13개를 parity 근거로 매핑하고 있었다. 파일 변경은 없다. 사용자 결정으로 U3를 분리하고 v2로 재정의했다(fresh Implementer). v2 Implementer(`8db11336`): base 82 pass → 88 pass/0 fail(C1 참조 복사본 2→4 테스트, 런타임 복사본 반복 2→4, coordination.md 4→8 테스트). 음성 확인: gemini 런타임 기대값을 메모리에서 바꾸면 `reintroduced platform runtime copy fails C1`이 `ERR_ASSERTION`으로 실패, 되돌림. Orchestrator 호스트: manifest+installed-layout-golden 92/0, `check:manifest` 292, installer-parity 235/736/14 통과. `package-references`의 `publishes both flat platforms and manifest consistently without replacing ARC-owned files` 1건 실패(fixture ENOENT)는 `50d83c6` 전체 회귀 실패 목록에 있는 기준 실패. fresh QA(`ab3388d6`): 수락 권고, finding 없음. 2026-11-23 수락.

---

### Task 7: install plan·global bootstrap의 4 플랫폼 확장

**목표·범위:**
- `tests/node/plan.test.mjs`: `payload()`(`:8`)를 gemini·grok의 `models.toml`·프로필로 넓히고, `:142`, `:149`, `:160`, `:184`, `:228`, `:281`, `:291`, `:297`, `:301`의 루프를 넓힌다.
  - `:93`, `:128`, `:261`은 조사에서 분류되지 않았으므로 바꾸지 않는다(D8).
- `tests/node/global-config.test.mjs:10`(home·SKILL 경로 쌍), `:31`(platform 인자)

**선행:** 없음(v2).

**Files (allowedPaths):** Modify `tests/node/plan.test.mjs`, `tests/node/global-config.test.mjs`

- [x] **Step 0:** 공통 Step 0. 두 파일 모두 원장 매핑이 많으므로 기존 이름을 보존한다.
- [x] **Step 1:** `payload()`를 확장한다. 프로필 파일명과 확장자는 저장소의 `{gemini,grok}/agents/arc-*.md`에서 읽는다.
- [x] **Step 2:** 루프를 넓힌다.
  - `:228`(public rendering baseline)은 gemini·grok의 새 digest 상수를 현재 출력에서 기록한다. 이것은 characterization pin이다. QA가 같은 값을 독립 재계산하고, gemini·grok 렌더가 같은 테스트의 claude 구조 단언을 통과하는지 확인한다.
  - `:281–297`은 gemini·grok catalog pair가 저장소 데이터(`{platform}/skill/models.toml`, 기존 catalog fixture)로 이미 있을 때만 넓힌다. 없으면 hold한다.
- [x] **Step 3:** global-config `:10`에 `['/Users/u/.gemini','~/.gemini/skills/arc/SKILL.md']`, `['/Users/u/.grok','~/.grok/skills/arc/SKILL.md']`를 추가하고, `:31` 루프를 넓힌다. 제품 블록이 플랫폼별로 다르면 Q5로 처리한다.
- [x] **Step 4:** 두 파일을 실행한다. 통과하면 음성 확인을 한다.
- [x] **Step 5:** 공통 종료.
- [x] **Step 6: 커밋:** `test(plan): install plan·global bootstrap 검사를 네 플랫폼으로 확장`

**수용 기준:** 대상 루프 확장 또는 hold 기록, 새 digest의 QA 독립 재계산, 기존 매핑 이름 유지, 신규 실패 없음

**관련 테스트(이유):** 두 파일(직접), `installed-layout-golden`(렌더 결과), `instruction-layout`(global block)

**check:** `node scripts/check-installer-parity.mjs --complete`

**필수 QA·증거:** fresh QA, digest 재계산, 음성 확인

**Hold:** Q5, catalog 부재, masking

**진행 기록 (T7):** 2026-11-23 수락. Implementer(`7eb77c81`, 후속 1회: QA finding 수정).
- 호스트(4파일: plan, global-config, installed-layout-golden, instruction-layout) base 152 pass → 182 pass, 0 fail. `check-installer-parity` 일반 모드 exit 0(236 IDs, 739 assertions).
- plan: `payload()` 2→4, 루프 `:142`, `:149`, `:160`, `:184`, `:228`(4→16 조합), `:281`, `:291`, `:297`, `:301`를 gemini·grok으로 확장(67→93). D8의 `:93`, `:128`, `:261` 불변. catalog는 저장소의 `gemini-4-hydrogen/default`, `grok-4.5/default` 사용.
- `:228` 새 digest 8개(gemini·grok × en·ko × skipGlobal)는 QA가 독립 재계산해 일치. 음성 확인: `gemini:en:false` 값 변경 시 실패.
- `:142`, `:149`, `:160`, `:184` 기대 경로는 리터럴 지침 파일명(codex `AGENTS.md`, claude `CLAUDE.md`, gemini `GEMINI.md`, grok `AGENTS.md`)과 테스트 홈으로 구성. 최초 구현은 `result.target.instructionPath`로 조회해 QA finding(기존 단언 약화) → 수정. 음성 확인: gemini 기대 `WRONG.md`에서 실패.
- global-config: `:10` gemini·grok 홈/SKILL 쌍 추가, `:31` 루프 확장(37→41). Q5·masking·catalog hold 없음.
- 원장 매핑 이름 10개 유지·통과.
- fresh QA(`f6f1806f`, finding 1건 → 재확인): 수락.

---

### Task 8: 모델 설정·프로필 렌더·preset·초기 역할의 4 플랫폼 확장

**목표·범위:**
- `tests/node/models.test.mjs:98`, `:136`
  - `:40`은 v1 legacy fixture가 codex·claude에만 있으므로 바꾸지 않는다.
- `tests/node/profile-render.test.mjs:11`, `:35`, `:49`, `:63`
- `tests/node/preset.test.mjs:12`, `:15`, `:31`, `:41`, `:89`, `:111`
- `tests/node/tui-setup.test.mjs:60`

**선행:** 없음.

**Files (allowedPaths):** Modify 위 4개 파일

- [x] **Step 0:** 공통 Step 0.
- [x] **Step 1:** models `:98`의 mismatch 식을 일반화한다(다른 아무 플랫폼). `:136`의 필드명(`model_reasoning_effort`/`effort`)은 각 플랫폼 `models.toml`에서 읽는다. gemini·grok 필드를 정할 수 없으면 hold한다.
- [x] **Step 2:** profile-render는 gemini·grok 프로필(`.md`)을 claude 방식으로 확장한다. 렌더러가 gemini·grok을 거부하면 Q5로 처리한다.
- [x] **Step 3:** preset은 같은 파일의 `fixture(t)`·`install(home,p)`가 gemini·grok을 지원할 때만 넓힌다. 공유 fixture 변경이 필요하면 hold한다.
- [x] **Step 4:** tui-setup `:60`은 플랫폼별 scouter 모델 값을 `models[target]`에서 고른다(현재 `target==='codex'?'gpt-6-luna':'sonnet'`). 패키지 기본값과 다른 유효 값을 플랫폼 catalog나 `models.toml`에서 고를 수 없으면 hold한다.
- [x] **Step 5:** 4개 파일을 실행한다. 음성 확인을 한다.
- [x] **Step 6:** 공통 종료.
- [x] **Step 7: 커밋:** `test(models): 모델 설정·렌더·preset 검사를 네 플랫폼으로 확장`

**수용 기준:** 대상 루프 확장 또는 hold 기록, 신규 실패 없음

**관련 테스트(이유):** 4개 파일(직접), `model-catalog`(catalog), `preset-cli`(preset 경로)

**check:** 없음

**필수 QA·증거:** fresh QA, 음성 확인, hold 근거

**Hold:** Q5, 필드·catalog 부재, 공유 fixture 필요, masking

**진행 기록 (T8):** 2026-11-23 수락. Implementer(`cce4a47d`, 후속 1회: QA finding 2건 수정).
- 호스트(6파일: models, profile-render, preset, tui-setup, model-catalog, preset-cli) 177 tests, 176 pass, 1 fail(`Codex existing root field edits preserve indentation, comments and nested fields`, 50d83c6 base 실패·masking). 대상 4파일 base 128/1 → 150/1. 원장 매핑 없음, 기존 이름 129개 유지.
- models `:98` mismatch를 현재와 다른 첫 플랫폼으로 일반화, `:136` effort 필드는 각 `models.toml`에서 읽음(21→23). `:40` v1 불변.
- profile-render: 파일 누락·BOM·미지원 이름 3계열 2→4(16→22). hold(Q5): 기본 렌더러가 정상 gemini·grok `.md` 프로필을 `ARC_MODEL_VALIDATION` `Invalid Claude profile identity or role tools`로 거부(`lib/models/profiles.mjs:95`, `.md`→`renderClaude`). 정상 렌더 비모델 바이트 보존과 잘못된 본문 검사는 미확장.
- preset: Custom 전환, preflight drift, Custom 저장·noop, Apply 4계열 2→4, `:15` preflight·두 번째 대상 실패는 네 대상 설치 + claude·grok 게시 실패 시나리오(26→34). hold: v1 legacy `economy`·`balanced`·`smart` 변형(fixture가 codex·claude뿐).
- tui-setup `:60` 초기 역할 6→12, 리터럴 scouter `gpt-6-luna`, `sonnet`, `gemini-4-hydrogen`, `grok-4.5`(catalog 유효·기본값과 다름), Scouter 행 범위 정규식(기존보다 강함).
- 최초 구현은 `preset:15` 누락과 기존 단언 문구 변경으로 QA finding → 수정(codex·claude 원문 복원).
- 음성 확인: 파일별 gemini 기대값 변경, grok 게시 결과 `failed`→`updated` → 실패.
- fresh QA(`6930d4b3`, finding 2건 → 재확인): 수락.

---

### Task 9: 관리 작업·상태·제거·잔여 기본값의 4 플랫폼 확장

**목표·범위:**
- `tests/node/management-operations.test.mjs:71`, `:73`
- `tests/node/management-status.test.mjs:9`
- `tests/node/uninstall.test.mjs:24`, `:29`
- `tests/node/hardcoding-residual.test.mjs:110`

**선행:** 없음.

**Files (allowedPaths):** Modify 위 4개 파일

- [x] **Step 0:** 공통 Step 0.
- [x] **Step 1:** 각 루프를 확장 형태로 넓힌다.
  - management-status `:9`는 `staticPackageFixture`가 gemini·grok 설치를 이미 지원할 때만 넓힌다. fixture 변경이 필요하면 hold한다.
  - hardcoding-residual `:110`은 zeta 주입 시나리오(`:22-25`)를 바꾸지 않고 기본 경로의 대상 루프만 넓힌다.
- [x] **Step 2:** 실행하고 음성 확인을 한다.
- [x] **Step 3:** 공통 종료.
- [x] **Step 4: 커밋:** `test(management): 관리 작업·상태·제거 검사를 네 플랫폼으로 확장`

**수용 기준:** 플랫폼별 설정 제거가 다른 플랫폼을 보존하는지, 전역 블록·언어 설정 제거, 비관리 프로필 보존, 패키지 기본값 대 설치 기본값이 4 플랫폼에서 단언된다(또는 hold 기록). 신규 실패 없음.

**관련 테스트(이유):** 4개 파일(직접), `uninstall-cli`, `management-update`(같은 operation 경로)

**check:** 없음

**필수 QA·증거:** fresh QA, 음성 확인

**Hold:** Q5, fixture 필요, masking

**진행 기록 (T9):** 2026-11-23 수락. Implementer(`5951d03a`, 후속 1회: QA finding 2건 수정).
- 호스트(6파일: management-operations, management-status, uninstall, hardcoding-residual, uninstall-cli, management-update) 123 tests, 122 pass, 0 fail, 1 skip(`source auto install excludes the current worktree local wrapper`, base와 동일). 대상 4파일 base 95 pass/1 skip → 102/1. 원장 매핑 없음, 기존 이름 유지.
- management-operations `:71` 설정 전용 제거 2→3 대상(다른 3개 플랫폼 설정 바이트 보존), `:73` 제거 옵션 3→5. management-status `:9` 2→4(기존 `staticPackageFixture`). uninstall `:24` 전역 ARC 블록 제거, `:29` 언어 설정 제거·사용자 파일 보존·비관리 프로필 보존 2→4. hardcoding-residual `:110` 패키지 대 설치 기본값 2→4(zeta 시나리오 불변).
- 경로는 기존 식 일반화(`ctx.userHome+'/.'+platform`, `userHome+'/.'+platform`, `platform==='codex'` 분기), 지침 파일명만 리터럴 맵. 비관리 프로필은 테스트 홈 안에 두고 `plan.target.home` 일치 단언 추가.
- hold(Q5): `grok Settings removes only its ARC settings and never inspects CLI` — `removeCli:false` 제거 시 `~/.grok/config.toml`의 ARC 관리 `[compat.claude]` 블록 116바이트가 0바이트가 됨(`lib/installer/uninstall.mjs:23` `removeGrokCompat`→빈 바이트 쓰기). grok 제거 사례만 되돌림.
- 최초 구현은 경로를 플랫폼별 리터럴로 열거(Orchestrator brief의 과도한 "literal" 문구 때문)하고 비관리 프로필을 고정 경로에 두어 QA finding 2건 → 수정.
- 음성 확인: gemini 기대값 4건 변경, gemini 프로필을 `.gemini` 밖에 둠 → 실패.
- fresh QA(`382c31d9`, finding 2건 → 재확인): 수락.

---

### Task 10: 사용자 소유 프로필 보존·upgrade 재적용·upgrade 상태의 4 플랫폼 확장

**목표·범위:**
- `tests/node/install-mode-review-followup.test.mjs:23`, `:37`, `:46`, `:55`
- `tests/node/upgrade-reapply.test.mjs:254`
- `tests/node/upgrade-state.test.mjs:37`, `:44`, `:53`

**선행:** 없음.

**Files (allowedPaths):** Modify 위 3개 파일

- [x] **Step 0:** 공통 Step 0.
- [x] **Step 1:** 넓힌다.
  - review-followup은 `tests/node/fixtures/install-mode.mjs`의 `profileFiles`가 codex·claude 한정(`:38`)이다. 테스트가 그 helper에 의존하면 해당 테스트만 hold한다(fixture는 범위 밖, D6).
  - `:16-18`(composite 쌍)은 바꾸지 않는다.
- [x] **Step 2:** 실행하고 음성 확인을 한다.
- [x] **Step 3:** 공통 종료.
- [x] **Step 4: 커밋:** `test(upgrade): 프로필 보존·upgrade 상태 검사를 네 플랫폼으로 확장`

**수용 기준:** 대상 확장 또는 hold 기록, 신규 실패 없음

**관련 테스트(이유):** 3개 파일(직접), `upgrade-snapshot-scope`, `install-mode-switch`(같은 상태 수집)

**check:** 없음

**필수 QA·증거:** fresh QA, 음성 확인

**Hold:** Q5, fixture 의존, masking

**진행 기록 (T10):** 2026-11-23 수락. Implementer(`32c1d071`).
- 호스트(5파일: install-mode-review-followup, upgrade-reapply, upgrade-state, upgrade-snapshot-scope, install-mode-switch) 95 tests, 95 pass, 0 fail. 대상 3파일 base 62 → 82 pass. 원장 매핑 없음, 기존 이름 유지.
- review-followup `:23`, `:37`, `:46`(`empty`·`symlink`), `:55` 2→4. upgrade-state `:37`, `:44`(`file`·`symlink`), `:53` 2→4. upgrade-reapply `:254`에 `standalone child preserves settings for claude, codex, gemini, grok` 추가(2→3 케이스, 네 홈 설치 후 `models.toml`·`settings.toml`·`limits.toml` 재적용 전후 바이트 비교).
- hold(D6): review-followup `:16-18` composite 쌍(`profileFiles` fixture가 codex·claude 한정). Q5·masking hold 없음.
- 경로는 `userHome+'/.'+platform`과 기존 확장자 분기로 일반화, 수집 대상 `entry.target.home`의 테스트 홈 일치 단언 추가. 부재 대상 순서는 `['claude','codex','gemini','grok'].filter(id=>id!==platform)`로 일반화(기존 두 케이스 순서 유지).
- 음성 확인: gemini 기대값 3건 변경 → 실패.
- fresh QA(`daea80ec`): 수락.

---

### Task 11: npm 설치 부작용 부재와 설치 런타임 엔트리의 4 플랫폼 확장

**목표·범위:**
- `tests/node/npm-lifecycle.test.mjs:27`, `tests/node/npm-lifecycle-pty.test.mjs:10`, `tests/node/npm-completion-consumer.test.mjs:29`: `.codex`·`.claude` 부재 단언 옆에 `.gemini`·`.grok` 부재 단언을 추가한다.
- `tests/node/runtime-installed-entry.test.mjs:9`: 루프를 넓힌다. 본문이 플랫폼을 공유 런타임에 넘기는 인자로만 쓰는 경우에 한한다. 플랫폼별 home 구조를 따로 만들어야 하면 hold한다.

**선행:** 없음.

**Files (allowedPaths):** Modify 위 4개 파일

- [x] **Step 0:** 공통 Step 0. npm sandbox·PTY 테스트는 필요하면 host에서 실행한다.
- [x] **Step 1:** 단언을 추가하고 루프를 넓힌다. 부재 단언의 음성 확인: sandbox home에 `.gemini`를 임시로 만드는 줄을 넣어 실패하는지 보고 되돌린다.
- [x] **Step 2:** 실행.
- [x] **Step 3:** 공통 종료.
- [x] **Step 4: 커밋:** `test(npm): 설치 부작용 부재와 런타임 엔트리 검사를 네 플랫폼으로 확장`

**수용 기준:** 4 플랫폼 home 부재 단언, 런타임 엔트리 확장 또는 hold 기록, 신규 실패 없음

**관련 테스트(이유):** 4개 파일(직접), `npm-sandbox`(fixture 동작)

**check:** 없음

**필수 QA·증거:** fresh QA, host 출력(해당 시), 음성 확인

**Hold:** Q5(예: npm 설치가 `.gemini`를 만든다), masking

**진행 기록 (T11):** 2026-11-23 수락. Implementer(`c7e3f32b`).
- 호스트(4파일) 13 tests, 10 pass, 2 fail, 1 skip. 실패 `codex installed endpoint preserves workflow guards without package dependencies`, `claude installed endpoint preserves workflow guards without package dependencies`(50d83c6 base 실패). skip `Git global install and reinstall preserve an executable CLI with inherited global configuration`(`ARC_TEST_GIT_FIXTURE_REPO` 미제공, base와 동일). 원장 매핑 없음.
- `.gemini`·`.grok` 부재 단언을 기존 `.codex`·`.claude` 단언 옆에 추가: npm-lifecycle `:27`(`box.home+'/.'+platform`, 전역·로컬·npx), npm-lifecycle-pty `:10`, npm-completion-consumer `:29`(`home+'/.'+platform`, 두 번 설치 후).
- npm-completion-consumer Git 설치 검사는 Orchestrator가 fixture `ARC_TEST_GIT_FIXTURE_REPO`=이 worktree(커밋 HEAD `4cd1b1a`), `ARC_TEST_REQUIRE_GIT_FIXTURE=1`로 호스트 실행: 1 pass(두 설치 exit 0, 새 단언 통과).
- hold(masking): runtime-installed-entry `:9` 루프(두 테스트 base 실패).
- 음성 확인: sandbox home에 `.gemini` 생성 → 새 부재 단언 실패.
- fresh QA(`e194c625`, Git 설치 미검증 → 호스트 증거 재확인): 수락.

---

### Task 12: payload 정적 검사의 4 플랫폼 확장

**목표·범위:**
- `tests/node/package-references.test.mjs:8`: 플랫폼 로컬 references 복사본 부재
- `tests/node/superpowers.test.mjs:21`: nested reference payload 거부. prefix 목록에 `'gemini'`, `'grok'`을 추가한다.
- `tests/node/status-labels.test.mjs:26`: status label 오타 검사 대상에 gemini·grok skill 디렉터리를 추가한다.

**선행:** 없음(v2).

**Files (allowedPaths):** Modify 위 3개 파일

- [x] **Step 0:** 공통 Step 0.
- [x] **Step 1:** 넓힌다. superpowers에서 `validateFlatReferenceFiles`가 gemini·grok prefix를 거부하지 않으면 Q5로 처리한다(제품 차이).
- [x] **Step 2:** 실행하고 음성 확인을 한다.
- [x] **Step 3:** 공통 종료.
- [x] **Step 4: 커밋:** `test(payload): reference·label 정적 검사를 네 플랫폼으로 확장`

**수용 기준:** 3개 검사가 4 플랫폼에 적용되거나 hold가 기록된다. 신규 실패 없음.

**관련 테스트(이유):** 3개 파일(직접), `manifest`(C1 규칙), `skill-sources`

**check:** `npm run check:manifest`

**필수 QA·증거:** fresh QA, 음성 확인

**Hold:** Q5, masking

**진행 기록 (T12):** 2026-11-23 수락. Implementer(`1a34afd0`).
- 호스트(5파일: package-references, superpowers, status-labels, manifest, skill-sources) base 117 tests/116 pass/1 fail → 123/122/1(실패 이름 동일). `npm run check:manifest`: 292 files verified. 원장 매핑 없음.
- hold(masking): `package-references:8` `publishes both flat platforms and manifest consistently without replacing ARC-owned files`(base·after 모두 `codex/skill/references/scripts/arc-owned.js` 쓰기 `ENOENT`). 대신 신규 `static package has no ${platform} imported reference copies` 4건(리터럴 `referencePaths` 13개, 저장소 파일·`MANIFEST.sha256`·nested `superpowers` 부재). 게시 직후 복사본 부재는 미검증으로 hold에 남음.
- `superpowers:21` prefix 3→5(gemini·grok 거부 확인, Q5 없음). `status-labels:26` 스캔에 `gemini/skill`, `grok/skill` 추가.
- 음성 확인: gemini 부재 기대를 실재 파일로 변경, gemini nested 입력에서 `superpowers/` 제거, grok `SKILL.md` 오타 주입 → 각각 실패.
- fresh QA(`e9ba3f09`): 수락.

---

### Task 13: 잔여 UNSURE 2건의 조건부 판정·확장

**목표·범위:** 아래 규칙을 적용한다. 결과는 "확장" 또는 "변경 없음 수락"이다. 변경이 없으면 no-change 경로로 처리하고 빈 커밋은 만들지 않는다.
- **U-a `tests/node/role-routing-dispatch.test.mjs:219`**(bridge CLI 버전은 보고되지만 dispatch를 막지 않음)
  - 먼저 `tests/node/gemini-bridge.test.mjs`, `tests/node/grok-bridge.test.mjs`에서 같은 계약을 read-only로 찾는다(`cliVersion`, `version_unparsed`, 결정 `allow`).
  - 있으면 NO-GAP으로 기록한다.
  - 없고 `createRoutingFixture`가 gemini·grok 역할과 `cli('gemini'|'grok',{version})`을 이미 지원하면, 같은 파일에 신규 테스트를 추가한다.
  - 그 밖의 경우는 hold하고 후속 후보로 보고한다.
- **U-b `tests/node/role-supervisor-descendants.test.mjs:261`**
  - `setup(t, platform)` 호출부를 찾는다.
  - 호출부가 claude·codex만 쓰고 같은 descendant 계약을 `:454`의 4 플랫폼 루프가 이미 검사하면 NO-GAP이다.
  - `:261` 호출부에만 있는 별개 계약이 있고 fixture가 gemini·grok 역할을 지원하면 넓힌다. 아니면 hold한다.

**선행:** 없음.

**Files (allowedPaths):** Modify(조건부) `tests/node/role-routing-dispatch.test.mjs`, `tests/node/role-supervisor-descendants.test.mjs`. 판정용 read-only: `tests/node/gemini-bridge.test.mjs`, `tests/node/grok-bridge.test.mjs`, `tests/node/role-fixtures.mjs`

- [x] **Step 0:** 공통 Step 0.
- [x] **Step 1:** U-a와 U-b에 규칙을 적용하고 판정 근거(파일:줄)를 기록한다.
- [x] **Step 2:** 확장한 경우에는 실행하고 음성 확인을 한다.
- [x] **Step 3:** 공통 종료.
- [x] **Step 4: 커밋(변경 시):** `test(bridge): 잔여 플랫폼 판정 항목 확장`

**수용 기준:** 두 항목 모두 판정과 근거가 있다. 확장 시 신규 실패 없음.

**관련 테스트(이유):** 2개 파일(직접), `gemini-bridge`·`grok-bridge`(대조)

**필수 QA·증거:** fresh QA, 판정 근거 독립 확인

**Hold:** 규칙상 hold, Q5

**진행 기록 (T13):** 2026-11-23 수락. Implementer(`52a6d69c`).
- 호스트(4파일: role-routing-dispatch, role-supervisor-descendants, gemini-bridge, grok-bridge) 160 tests, 160 pass, 0 fail, 0 skip(sandbox `ps` 의존 6건 포함). 원장 매핑 없음.
- U-a `hold`: `role-routing-dispatch:217` `bridge CLI versions are reported but never gate dispatch`(파싱 가능·`garbage` 버전, `allow`, `cliVersion`/`version_unparsed`)와 같은 계약이 `gemini-bridge`·`grok-bridge`에 없음(NO-GAP 아님). `createRoutingFixture`(`tests/node/role-fixtures.mjs:129`)는 역할 설정·홈이 claude·codex 한정 → 후속 후보(gemini·grok 역할과 버전 입력 fixture).
- U-b `widened`: `role-supervisor-descendants`의 F3 종료 후 신호 억제, F4 정리 중 기한 만료, 생존 descendant lease 상태·사유 보존 3계약이 `:458` 4 플랫폼 회수 루프와 별개라 4 플랫폼으로 확장(3→12, 기존 `setup`·`installReplay`·replay fixture 사용). 대상 3개 이름에 플랫폼 접두어(원장 미매핑), 생존 사례에 기준 빈 사유 단언 2개 추가, 기존 단언 삭제·변경 0.
- 음성 확인: gemini F4 기대 `failed` → 실패.
- fresh QA(`c59935f1`): 수락.

---

### Task 14: plan 기록 단독 커밋 금지 규칙의 Commit gate 문구 강화 (v3)

**목표·범위:** 4 플랫폼에 같은 영어 문구를 추가한다. 기존 고정 문장은 한 글자도 바꾸지 않는다(추가만). 기계적 검사는 넣지 않는다.

1. `{platform}/skill/SKILL.md`: `**Pre-action gate record:**` 문단 바로 뒤에 새 문단:
   > **Commit gate:** Before every `git commit`, Orchestrator inspects the staged paths and the exact message. A docs-only commit that modifies an existing spec or plan is made only to carry pending user-approved revisions with `Plan-Revision`/`Plan-Approved-At`/`Plan-Reason` trailers. Plan-level progress records (final verification results, final Reviewer verdicts and dispositions, completion status) NEVER justify a commit alone: when no implementation work remains they stay only in the canonical handoff record and the plan document stays unchanged. A final Reviewer finding on the plan or spec document itself is a plan revision that needs user approval before any edit. If the gate fails, do not commit; report to the user.
2. `{platform}/skill/references/commit.md`:
   - 체크리스트 2번 끝: "Then apply the SKILL.md Commit gate to `git diff --cached --name-status` and the exact message file; hold the commit if it is docs-only, modifies an existing spec or plan and lacks a `Plan-Revision` trailer for each modified document."
   - 체크리스트 3번 끝: "Recheck the new commit against the Commit gate with `git show --name-status --format=%B <sha>`."
   - closing 커밋 문단(`Only when no implementation work remains before overall completion MAY …`) 맨 앞: "The closing commit exists only to carry pending user-approved spec/plan revisions: with no pending revision there is no closing commit, whatever plan-level progress records remain."
   - plan-level 진행 기록 문단 뒤: "Changing plan or spec content other than progress records, including fixing its final verification section or wording after a final Reviewer finding, is a plan revision: obtain applicable user approval under [planning](planning.md#plan-updates-during-execution) before editing; until then record the finding and its disposition only in the canonical handoff record."
3. `{platform}/skill/references/verification.md` 완료 절의 plan-level 기록 확인 문장 뒤: "Before the overall completion report and any push, PR or merge authorization request, Orchestrator lists every commit in the plan's base..HEAD range with `git log --name-status --format='%h %s%n%(trailers:key=Plan-Revision)'` and confirms none is a docs-only commit modifying an existing spec or plan without `Plan-Revision` trailers; any such commit holds completion and is reported to the user."
4. `lib/policy/role-policy.json`의 `git.orchestrator-accept-commit` rule text 끝: "Before every commit Orchestrator applies the Commit gate; a docs-only commit modifying an existing spec or plan without Plan-Revision trailers for approved pending revisions is never made." rule ID·`operations`·`evidence`는 바꾸지 않는다. 산출물은 `node scripts/update-role-policy.mjs`로만 만든다.

정확한 삽입 위치(줄·anchor)는 Step 0에서 4 플랫폼 각각 확정한다. 플랫폼별 기존 문장 차이(예: codex 줄 번호)가 있어도 새 문구 텍스트는 같다.

**선행:** 없음(권장 순서상 마지막). T1(role-policy 테스트)·T5(Python 계약)·T12(package-references)가 먼저 4 플랫폼으로 넓어져야 이 task의 관련 테스트로 작동한다.

**Files (allowedPaths):**
- Modify `{claude,codex,gemini,grok}/skill/SKILL.md`, `{claude,codex,gemini,grok}/skill/references/commit.md`, `{claude,codex,gemini,grok}/skill/references/verification.md`
- Modify `lib/policy/role-policy.json`, `update-role-policy.mjs`가 다시 만드는 산출물(Orchestrator가 Step 0 결과로 정확한 목록을 확정해 brief에 적는다)
- Modify `tests/node/plan-level-records-contract.test.mjs`, `tests/node/fixtures/instruction-contracts.json`(protected hash·필요 시 크기 상한)
- Regenerate only via tools: `MANIFEST.sha256`(`node scripts/update-manifest.mjs`), golden(`node tests/node/fixtures/installed-layout.mjs --diff`, 예상 diff 확인 뒤 `--write`)
- 수정 금지: `tests/test_harness_contract.py`(T5), `tests/node/role-policy.test.mjs`(T1), 설치본(`~/.claude` 등)

- [ ] **Step 0:** 공통 Step 0. 추가로 4 플랫폼 삽입 위치, `update-role-policy.mjs`의 예상 대상 파일 목록(managed 구역·agent 프로필 투영 여부), fixture 크기 상한과 protected 항목, 기존 고정 문장 계약(`plan-level-records-contract`, `test_harness_contract.py:48`, `:90–117`)을 확인해 기록한다.
- [ ] **Step 1 (RED):** `plan-level-records-contract.test.mjs`에 새 문장(SKILL.md gate, commit.md 4문장, verification.md 1문장, role-policy 1문장)을 추가하고 4 플랫폼에서 각각 정확히 한 번 나오는지 단언한다. 실행해 실패를 기록한다.
- [ ] **Step 2:** SKILL.md 4개에 Commit gate를 넣는다.
- [ ] **Step 3:** commit.md 4개에 4문장을 넣는다.
- [ ] **Step 4:** verification.md 4개에 범위 감사 문장을 넣는다.
- [ ] **Step 5:** role-policy rule text에 문장을 덧붙이고 `node scripts/update-role-policy.mjs`, `npm run check:role-policy`를 실행한다.
- [ ] **Step 6:** fixture(protected hash, 필요 시 크기 상한)와 MANIFEST·golden을 도구로 다시 만든다. 상한을 올려야 하면 값과 이유를 보고한다. `node scripts/update-runtime-assets.mjs --check`를 확인한다.
- [ ] **Step 7:** 관련 테스트와 check를 실행한다.
- [ ] **Step 8:** 공통 종료.
- [ ] **Step 9: 커밋(Orchestrator, 수락 뒤, 새 Commit gate 적용):** `docs(skill): plan 기록 단독 커밋을 막는 Commit gate와 commit·verification 문구 추가`

**수용 기준:** 새 문구가 4 플랫폼에 같은 텍스트로 각각 한 번씩만 있다. 기존 고정 문장 계약(`plan-level-records-contract` 기존 항목, `test_harness_contract.py`)이 수정 없이 통과한다. `check:role-policy`·`check:manifest`·`update-runtime-assets --check`가 통과한다. 링크·anchor가 유효하다. 제품 텍스트는 영어다. 설치본은 바뀌지 않았다. 신규 실패와 단언 약화가 없다.

**관련 테스트(이유):** `plan-level-records-contract`(직접), `test_harness_contract.py`·`test_arc_policy.py`(commit.md 고정 문장), `role-policy`·`agent-fragments`(정책 산출물), `instruction-layout`·`composite-instructions`·`test-scope-contract`·`run-mode-contract`(지침 구조·fixture), `package-references`(링크), `manifest`·`installed-layout-golden`(MANIFEST·golden)

**check:** `npm run check:role-policy`, `npm run check:manifest`, `node scripts/update-runtime-assets.mjs --check`, `node scripts/check-installer-parity.mjs`

**필수 QA·증거:** fresh QA, 4 플랫폼 문구 동일성 diff, 기존 고정 문장 무변경 증명(삭제 줄이 기존 문장을 포함하지 않음), 임시 음성 확인(한 플랫폼 문구를 바꾸면 계약 테스트 실패), role-policy 투영 대상 수 독립 확인

**Hold:** 기존 고정 문장을 바꿔야 하는 경우, fixture 크기 상한 초과, T1·T5 소유 파일 수정 필요, 생성기가 예상 밖 파일을 바꾸는 경우

**진행 기록 (T14):** 미기록

---

## UNSURE 판정 표(Planner, 인용 줄 읽기 기준)

| 위치 | 판정 | 근거·배정 |
|---|---|---|
| `completion.test.mjs:7` | NO-GAP | `HOME=home`과 재귀 전후 snapshot이 모든 기본 플랫폼 home을 덮는다. `CODEX_HOME`·`CLAUDE_CONFIG_DIR`은 override일 뿐이다 |
| `install-mode-models-upgrade.test.mjs:32` | NO-GAP(HISTORICAL) | v1 fixture `models-{codex,claude}-v1.toml`만 존재. `:25`는 이미 4 플랫폼 plan을 단언 |
| `install-mode-n-platform.test.mjs:36` | NO-GAP | composite·zeta 쌍 시나리오(S0 composite 분류) |
| `install-mode-publication.test.mjs:24` | NO-GAP | composite publish 쌍(`:42-46`) |
| `install-mode-review-followup.test.mjs:23` | GAP | T10(`:37`도 같은 구조) |
| `management-status.test.mjs:9` | GAP(조건부) | T9 |
| `npm-completion-consumer.test.mjs:29` | GAP | T11(`.gemini`·`.grok` 부재) |
| `npm-lifecycle.test.mjs:27`, `npm-lifecycle-pty.test.mjs:10` | GAP | T11 |
| `preset.test.mjs:5`(`:12–111`) | GAP(조건부) | T8 |
| `role-bridge-args:21`, `role-bridge-resume:43`, `role-bridge-run:42` | NO-GAP | claude·codex bridge 메커니즘. gemini·grok은 전용 `gemini-bridge`·`grok-bridge` 테스트가 담당(내용 미대조, 자체 검토 참고) |
| `role-fixtures-cleanup.test.mjs:120` | NO-GAP | supervisor 시작 fixture 배선(`codexHome: f.claudeHome`), 플랫폼 무관 |
| `role-routing-dispatch.test.mjs:219` | 잔여 UNSURE | T13 U-a |
| `role-supervisor-descendants.test.mjs:261` | 잔여 UNSURE | T13 U-b |
| `runtime-installed-entry.test.mjs:9` | GAP(조건부) | T11 |
| `global-config.test.mjs:10`, `:31` | GAP | T7 |
| `package-references.test.mjs:8` | GAP | T12 |
| `platform-availability.test.mjs:60` | NO-GAP | 합성 registry(codex·claude·zeta·eta)로 capability gating 메커니즘을 검사 |
| `platform-registry.test.mjs:70` | NO-GAP | 제목만 2 플랫폼이고 본문은 4 플랫폼 ID를 단언(`:72-73`) |
| `role-observe.test.mjs:1204` | NO-GAP(이 계획) | control snapshot 범위 문제이므로 U1 보안 계획으로 이관 |
| `superpowers.test.mjs:21` | GAP | T12 |
| `tui-app.test.mjs:417` | NO-GAP | index 기반 메뉴 메커니즘. Uninstall 행에 Gemini·Grok 표시를 이미 단언 |
| `tui-app.test.mjs:733`, `tui-app-pty.test.mjs:137` | NO-GAP | composite 쌍 상태 fixture를 쓰는 TUI 렌더 |
| `tui-package-consumer.test.mjs:43` | NO-GAP(후속 후보) | `ARC_TEST_TUI_WORKSPACE` 없으면 skip, 공유 런타임 |
| `tui-setup.test.mjs:60` | GAP(조건부) | T8 |
| `upgrade-cli.test.mjs:26` | NO-GAP | stub child 출력 전달. 플랫폼 문자열은 불투명 텍스트 |
| `plan.test.mjs:160`, `:184`, `:228`, `:281–297` | GAP(`:281–297`은 조건부) | T7 |
| `fixtures/static-references.mjs:8` | NO-GAP | 원본 어떤 플랫폼에도 `skill/references/superpowers*`가 없다(glob). fixture 내부 동작 |
| `live-upstream.mjs:13` | NO-GAP(후속 후보) | maintainer 전용 live probe, `npm test` 밖 |
| `models.test.mjs:98`, `:136` | GAP | T8 |
| `profile-render.test.mjs:11`, `:35`, `:49`, `:63` | GAP | T8 |

## 의존성·준비·순서

| task | 선행 | 공유 자원·충돌 | 준비 조건 |
|---|---|---|---|
| T1, T2, T5, T8, T9, T10, T11, T13 | 없음 | 파일 중복 없음 | 즉시 가능 |
| T3, T4, T6, T7, T12 | 없음(v2) | 파일 중복 없음 | 즉시 가능 |
| T14 | 없음(v3) | MANIFEST·golden·`instruction-contracts.json` 재생성. role-policy 산출물은 T1 테스트가, commit.md 고정 문장은 T5 Python 계약이 읽는다 | 권장: T1·T5·T12 수락 뒤 |

- **권장 순서(같은 worktree, 직렬):** T6 → T1 → T2 → T5 → T3 → T4 → T7 → T12 → T8 → T9 → T10 → T11 → T13 → T14 (v2: 의존성은 없고 번호 순서만 권장. v3: T14는 마지막)
- **병렬 조건**
  - 파일은 서로 겹치지 않지만, 현재 routing에서 Implementer·QA는 codex bridge이므로 같은 worktree에서는 한 번에 bridge 하나만 실행한다(쓰기 bridge와 읽기 bridge도 동시에 두지 않는다: 2026-11-23 Scouter가 동시 Implementer 쓰기로 `permission_violation_observed`). 병렬이 필요하면 task별 별도 worktree를 사용자 선택으로 준비한다. 순서 제약은 없다(v2).
  - bridge Implementer는 같은 worktree에서 쓰기 bridge 1개만 허용한다. 실행 중에는 commit하지 않는다.
  - 병렬 실행 시 각 QA의 status 판정은 자기 allowedPaths 기준으로 한다.
- **hold 전파:** 한 task의 Q5 hold는 그 task만 막는다.

## 최종 검증(모든 task 수락·커밋 뒤)

**범위·시점:** 마지막 task 커밋 뒤 한 번 실행한다. 개별 task 수락을 늦추지 않는다. 설치된 규칙에 따라 마지막 task QA가 최종 범위를 흡수하거나, verified HEAD에서 fresh QA를 1회 실행한다.

1. **계약 테스트 전부**
   - `tests/node/test-scope-contract.test.mjs`, `tests/node/plan-level-records-contract.test.mjs`, `tests/node/run-mode-contract.test.mjs`, `tests/node/composite-instructions.test.mjs`, `tests/node/instruction-layout.test.mjs`, `tests/node/agent-fragments.test.mjs`, `tests/node/role-policy.test.mjs`, `tests/node/parity-check.test.mjs`
   - `tests/test_harness_contract.py`, `tests/test_arc_policy.py`
2. **check 전부**
   - `npm run check:manifest`, `npm run check:role-policy`, `node scripts/update-runtime-assets.mjs --check`
   - `node scripts/check-installer-parity.mjs`, `node scripts/check-installer-parity.mjs --complete`
   - `--complete`는 base(`50d83c63`) 결과와 비교한다.
   - (v3) 범위 감사: `git log --name-status --format='%h %s%n%(trailers:key=Plan-Revision)' 50d83c63..HEAD`에 trailer 없이 기존 plan/spec만 바꾼 커밋이 없어야 한다.
3. **재변경 파일 관련 테스트**
   - 설계상 task 간 파일 중첩은 없다. 예상 재변경 파일은 T14가 다시 만드는 MANIFEST·golden·`instruction-contracts.json`이며(F2 이후 재변경), 관련 테스트는 `manifest`, `installed-layout-golden`, `instruction-layout`, `composite-instructions`다(v3).
   - Orchestrator가 목록을 계산하고 QA가 `git diff`로 대조한다.
4. **전체 회귀 잠정 판정: 실행**
   - 트리거 1: 공유 계약 테스트(role-policy, parity-check, manifest)와 Python 계약 2파일이 바뀌고, 여러 테스트 파일에 걸친 변경이다(v3: T14가 4 플랫폼 지침·role-policy 산출물·payload·MANIFEST·golden을 바꾼다).
   - 트리거 2: 없음 예상(base 뒤 병합 없음).
   - 트리거 3: 없음 예상(`package.json`·lockfile·테스트 설정 불변).
   - 트리거 4: 없음 예상(rule ID·CLI·export 불변. v3: role-policy rule text만 바뀐다).
   - QA가 트리거 1·3·4를 독립 확인한다.
   - 명령: `npm test`, `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests`
   - 판정 기준: 기존 실패가 있다(Node 22건 이름 기준, Python 약 486 failures·6 errors). 이름 기준 "신규 실패 없음"으로 판정하고 verification.md의 Baseline·Result comparison을 적용한다.
   - 각 task의 hold 목록 항목은 base 실패 그대로여야 한다.
5. **최종 Reviewer 1회(significant):** 모든 task 수락과 필수 QA 뒤, 독립 Reviewer가 `50d83c63..HEAD` 전체를 검토한다.
   - 확인 항목: Review Focus 1–6, T1–T13 제품 코드 diff 없음, Q5·Q2 hold 목록 일관성, T14 외 payload 무변경, 원장 무변경, (v3) 새 Commit gate 문구가 기존 규칙(commit.md·planning.md·handoff-prep.md·role-policy)과 모순되지 않는지
   - finding은 Implementer → Reviewer 경로를 따른다.

## 위험

- npm sandbox·PTY·consumer 테스트(T4, T11)는 느리고 bridge sandbox에서 실행할 수 없을 수 있다. host 실행에 의존한다.
- Q5 hold가 여러 task에서 나오면 범위가 줄어든다. 차이는 보고되지만 이 계획에서 고치지 않는다.
- T7 `:228`의 새 digest는 현재 출력을 고정하는 characterization pin이므로 정답성을 보증하지 않는다. QA 재계산과 구조 단언으로 보완한다.
- `--complete`가 base에서 이미 실패할 수 있다. 매핑된 Python 파일은 suite 전체가 exit 0이어야 하기 때문이다. 이 경우 base 결과를 기준선으로 삼는다.
- 원장 이름 결합: 이름 보존 규칙을 어기면 `--complete`가 실패한다.

## 결정 사항

- **D1 (Q3)** U1(worktree `.grok/config.toml`, `.gemini/settings.json`이 control snapshot과 allowedPaths deny에 빠짐)은 별도 고우선 보안 계획으로 넘긴다. `role-observe.test.mjs:1204`도 그 계획의 범위다.
- **D2 (Q2)** Python에서 base 실패 메서드는 바꾸지 않는다(subTest 추가 없음). hold 목록으로 보고한다.
- **D3 (Q5)** 실제 gemini·grok 제품 차이는 hold하고 보고한다. 제품 수정은 넣지 않는다.
- **D4 (Q4, v2 개정)** U3 스크립트 4개 제거는 이 계획에서 뺀다(사용자 2026-11-23 "별도 계획으로 분리"). 근거: `tests/installer-parity.json`이 `tests/test_codex_models.py`의 `ApplyModelsTests` 5개(`apply-models.py` 실행)와 `ModelSettingsTests` 8개(`setUp`에서 `model_config.py` import)를 legacy installer 동작의 parity 근거로 매핑한다. 이 계획은 원장을 편집하지 않는다(D5). 별도 계획에서는 13개 항목을 같은 동작을 검증하는 Node 테스트로 재매핑한 뒤 스크립트를 제거한다. 정적 코드 참조는 없다(lib/bin/scripts/shared/skill 문서 grep 0건).
- **D5** 이 계획은 `tests/installer-parity.json`을 편집하지 않는다. 원장 변경이 필요하면 plan 개정으로 처리한다.
- **D6** 공유 test fixture 모듈은 바꾸지 않는다. 필요한 확장은 해당 항목만 hold한다.
- **D7** (v2) `tests/node/manifest.test.mjs`는 T6만 편집한다. `:48` mutation은 스크립트가 남으므로 유지한다.
- **D8** `plan.test.mjs:93`, `:128`, `:261`과 `models.test.mjs:40`은 조사에서 분류되지 않았거나 HISTORICAL이므로 바꾸지 않는다. 후속 후보로 남긴다.
- **D9** 후속 후보: `tui-package-consumer.test.mjs:43`(env-gated), `live-upstream.mjs:13`(live probe), T13의 hold 결과, 각 task의 Q5 hold 결과. 직전 계획 최종 Reviewer nit(2026-11-23)에서 넘어온 2건도 있다. (1) `tests/node/fixtures/instruction-contracts.json`의 4 플랫폼 `skill`·`global` 크기 상한이 현재 크기의 약 1.8배라 느슨하다. 함께 조일지 검토한다. (2) `gemini/skill/references/coordination.md:76`(`AskUserQuestion`), `:83`(Long Bash)에 Claude 전용으로 보이는 문구가 있고, fixture가 이 문구를 고정한다(`instruction-contracts.json:306`). 지침 문서 수정은 이 계획의 범위 밖이므로 별도 문서 계획으로 다루고, 그때 fixture도 함께 바꾼다.
- **D10** (v3) 반복된 plan 기록 단독 커밋(2dfdf9a, b37534d, 1971f59) 재발 방지는 문구 강화(T14)로만 한다. 사용자 결정: 기계적 검사 제외, 기존 closing 문장은 재작성 없이 전제 문장만 추가(T5 Python 계약 충돌 회피), role-policy 덧붙임, 완료·push 전 범위 감사. 이 계획의 마무리부터 새 규칙을 적용한다: 마지막 task 뒤 구현 작업이 없으면 plan-level 기록은 handoff 기록에만 두고 마감 커밋을 만들지 않는다.

## 가정

- **A1** 깊이는 "plan 필요, 별도 spec 없음"이다. 승인된 설계가 spec 역할을 하며, Orchestrator 기록과 다르면 Orchestrator가 바로잡는다.
- **A2** MANIFEST는 `tests/` 파일을 포함하지 않는다. 2026-11-23 F2 기록에서 fixture를 바꿨을 때 MANIFEST에 변경이 없었다. 따라서 T1–T13은 MANIFEST·golden을 바꾸지 않는다. T14는 도구로 다시 만든다(v3).
- **A3** golden의 scripts 항목은 claude·codex 8 레이아웃 × 2이다(base `:68–565`의 16줄).
- **A4** S0이 인용한 줄 번호는 base `50d83c63` 기준이며, Implementer가 Step 0에서 재확인한다.

## 개정 이력

| Version | Approval time | Classification | Affected tasks | Reason |
|---|---|---|---|---|
| v1 | 2026-11-23 (사용자 "승인") | initial | 전체 | 최초 계획 |
| v2 | 2026-11-23 (사용자 "별도 계획으로 분리") | scope | T6, 전체 순서·최종 검증 | T6 Step 0에서 U3 스크립트 의존 Python 메서드 13개가 installer-parity 원장에 매핑되어 있음이 드러났다. U3를 별도 계획으로 분리하고, T6을 manifest 4 플랫폼 확장만으로 줄였다. T6 선행 의존을 없앴고 최종 검증 트리거 1을 고쳤다. |
| v3 | 2026-11-23 (사용자 "그냥 c81cc22252984529c446f0f4f94044f22d2b623e 커밋의 plan에 추가해", v3 개정안 "승인") | scope | T14 추가, Goal·Architecture·범위·Review Focus·파일 표·의존성·최종 검증 1–5·A2·D10, 머리말 base 문장 정정 | plan 수준 진행 기록만 담은 단독 docs(plan) 커밋(2dfdf9a, b37534d, 1971f59)이 반복되어, 4 플랫폼 Commit gate·commit.md·verification.md·role-policy 문구 강화(T14)를 추가했다. 기계적 검사는 사용자 결정으로 제외. |

## 자체 검토 체크리스트

- [x] T1–T5, manifest(T6, v2에서 U3 제외), U4 GAP(T7–T12), 잔여 UNSURE(T13)를 배정했다. 두 task가 같은 파일을 편집하지 않는다(파일 표).
- [x] UNSURE 38개 위치에 판정을 내렸다. 잔여 2건에는 구체 규칙을 정했다.
- [x] 원장 결합(이름, `--complete`, Python 삭제)과 처리 규칙(편집 없음, 개정 경로)을 정했다.
- [x] RED가 나오지 않는 경우의 음성 확인, masking, Q2, Q5 규칙을 정했다.
- [x] 최종 검증: 계약 테스트, check 5종, 전체 회귀 판정과 이유, 최종 Reviewer 1회.
- [ ] 미검증 사항은 아래 자체 검토에 적었다.

---

**자체 검토(Planner, 미검증·미독해 항목):**

1. **전체를 읽지 않은 파일:** `all-targets.test.mjs`, `upgrade-harness.test.mjs`, `npm-upgrade-consumer.test.mjs`(`:8`, `:16`, `:24`만), `consumer.test.mjs`, `role-policy.test.mjs`(루프 시작 줄만), `package.test.mjs:14`·`:22`, `test_harness_contract.py:12`·`:798`, `test_arc_policy.py`의 대상 루프 대부분(`:498-506`만 읽음), `test_codex_models.py`, `test_claude_payload.py`, `qa_model_cases.py`, `uninstall`·`management-operations`·`hardcoding-residual`·`upgrade-*`·`status-labels`·`agent-fragments`의 인용 줄. 이 파일들은 S0 인용과 공통 Step 0에 의존한다.
2. **NO-GAP 판정의 대조 미완:** role-bridge-args·resume·run은 `gemini-bridge`·`grok-bridge` 내용과 대조하지 않았다. `tui-app:417`은 fixture 상태 변경 비용을 근거로 NO-GAP으로 판정했다.
3. **원장 매핑 조회 범위:** `installer-parity.json` 6052행까지만 대상 파일 매핑을 확인했다. 나머지는 각 task의 Step 0에서 조회한다. 매핑된 Python 목적지가 있는지, `--complete`의 base 결과가 무엇인지는 확인하지 않았다.
4. **base 실패 소속:** Node 22건·Python 실패의 이름을 몰라, 대상 테스트가 기존 실패 집합에 속하는지 판단하지 못했다. 모든 task의 Step 0으로 넘겼다.
5. **U3 영향 추정:** `plan.test.mjs` digest가 영향받지 않는다는 판단은 `payload()`가 합성이라는 추정에 근거한다(T6 Step 6에서 확인). golden 16줄·MANIFEST 4항목 기대치는 grep 줄 번호에서 추정했다.
6. **gemini·grok 데이터 존재 미확인:** gemini·grok의 `models.toml` 필드명·catalog pair, `staticPackageFixture`·preset fixture의 gemini·grok 지원 여부를 확인하지 않았다. 해당 항목은 조건부 hold 규칙으로 다룬다.
7. **탐색 예산 초과:** 약 40회(목표 약 30회)를 썼다. UNSURE 판정을 위한 인용 줄 읽기 때문이다.
8. **설계 승인 문서:** 승인된 설계 원문(native ad6f8306a2a3792fc)은 다시 읽지 않고 S0 요약에 의존했다.
