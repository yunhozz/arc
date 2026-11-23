# 플랫폼 parity 테스트 확장과 legacy 모델 스크립트 제거 구현 계획

> **For agentic workers:** ARC Orchestrator가 조정한다. task마다 Implementer → fresh QA → Orchestrator 수락 → focused commit 1개 순서로 진행한다. Implementer와 QA는 Git 상태를 바꾸지 않는다. 단계는 checkbox(`- [ ]`)로 추적한다.

- 날짜: 2026-11-23 · 상태: v1 (사용자 승인 2026-11-23) · workflow: `2026-11-23-platform-parity`
- 대상: managed worktree `.claude/worktrees/last-task-final-verification`, 브랜치 `feat/last-task-final-verification`, base: 이 계획 문서 커밋(첫 Implementer 전 `docs(plan)` 커밋)의 HEAD. 줄 번호는 `50d83c6323b3b1cdf0bfdfb1823faf792f8142df` 기준이며 그 뒤 변경은 현재 계획의 마무리 커밋(문서만)뿐이다
- 계획 경로: `docs/superpowers/plans/2026-11-23-platform-parity-tests.md`
- 경로·위험: plan 필요, 별도 spec 없음(설계 승인으로 진행). 깊이 라벨은 Orchestrator 기록을 따른다(가정 A1). 위험은 significant로 본다. 공유 계약 테스트, payload 삭제, MANIFEST·golden 재생성, Python 계약, installer-parity 원장 결합이 걸려 있다.

**Goal:** 테스트에서 codex·claude만 다루던 플랫폼 루프와 시나리오를 claude·codex·gemini·grok 4개로 넓혀, gemini·grok의 회귀가 테스트에서 드러나게 한다. legacy인 `apply-models.py`·`model_config.py`(claude·codex)와 이를 고정하던 테스트·fixture·MANIFEST·golden 항목을 제거한다(U3).

**Architecture:** 제품 코드(`lib/`, `bin/`, `shared/skill/runtime/`, 정책, 지침 문서)는 바꾸지 않는다. task는 파일 단위로 나눠 두 task가 같은 파일을 편집하지 않게 했다. payload를 바꾸는 task는 T6 하나뿐이며 먼저 실행한다. 확장한 테스트가 gemini·grok의 실제 제품 차이를 드러내면 그 항목은 hold하고 보고한다(Q5). 제품 수정은 이 계획에 넣지 않는다.

**Tech Stack:** Node.js ≥22 ESM, `node:test`, Python `unittest`, git CLI.

**승인 근거:** 설계 승인 2026-11-23(사용자 "승인"), S0 Spike 결과와 사용자 결정 Q1–Q5:
- Q1: U4 분류를 사전 Spike로 수행(완료)
- Q2: Python에서 현재 실패하는 메서드는 바꾸지 않고 hold 목록에 둔다. subTest도 추가하지 않는다.
- Q3: U1은 별도 보안 계획으로 넘긴다.
- Q4: U3 제거를 이 계획에 포함한다.
- Q5: 실제 제품 차이가 나오면 hold하고 보고한다.

근거 문서는 `/private/tmp/claude-501/-Users-ma-24-007-Desktop-workspace-arc/99737933-b2af-4438-a13f-76ed45deb3d3/scratchpad/s0-summary.md`이다.

## Global Constraints

- **범위:** 테스트 파일과 U3 제거 대상만 바꾼다. U3 제거 대상은 스크립트 4개, 관련 테스트·fixture, `MANIFEST.sha256`, golden이다.
  - 바꾸지 않는 것: `lib/`, `bin/`, `scripts/`, `shared/`, `{platform}/skill/**`(U3 스크립트 4개 제외), `{platform}/agents/**`, `lib/policy/**`, 지침 문서.
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
  - (3) U3가 매핑된 Python 메서드를 삭제
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
| T6 | `claude/skill/scripts/apply-models.py`, `claude/skill/scripts/model_config.py`, `codex/skill/scripts/apply-models.py`, `codex/skill/scripts/model_config.py`(삭제), `MANIFEST.sha256`, `tests/node/fixtures/installed-layout-golden.json`(재생성), `tests/test_codex_models.py`, `tests/test_claude_payload.py`, `tests/qa_model_cases.py`, `tests/node/manifest.test.mjs` | 있음 |
| T7 | `tests/node/plan.test.mjs`, `tests/node/global-config.test.mjs` | 없음 |
| T8 | `tests/node/models.test.mjs`, `tests/node/profile-render.test.mjs`, `tests/node/preset.test.mjs`, `tests/node/tui-setup.test.mjs` | 없음 |
| T9 | `tests/node/management-operations.test.mjs`, `tests/node/management-status.test.mjs`, `tests/node/uninstall.test.mjs`, `tests/node/hardcoding-residual.test.mjs` | 없음 |
| T10 | `tests/node/install-mode-review-followup.test.mjs`, `tests/node/upgrade-reapply.test.mjs`, `tests/node/upgrade-state.test.mjs` | 없음 |
| T11 | `tests/node/npm-lifecycle.test.mjs`, `tests/node/npm-lifecycle-pty.test.mjs`, `tests/node/npm-completion-consumer.test.mjs`, `tests/node/runtime-installed-entry.test.mjs` | 없음 |
| T12 | `tests/node/package-references.test.mjs`, `tests/node/superpowers.test.mjs`, `tests/node/status-labels.test.mjs` | 없음 |
| T13 | `tests/node/role-routing-dispatch.test.mjs`, `tests/node/role-supervisor-descendants.test.mjs`(조건부) | 없음 |

`tests/node/manifest.test.mjs`를 T6에 둔 이유는 결정 D7을 참고한다. `tests/installer-parity.json`은 어느 task도 편집하지 않는다.

## Review Focus

1. 확장이 제품 차이를 숨기지 않는지. Q5 hold 처분, 단언 약화·플랫폼별 예외 분기 추가가 없는지 확인한다.
2. 원장 매핑 테스트 이름 보존, `--complete` 통과
3. T6 삭제 범위. 스크립트를 실행하거나 import하는 테스트만 삭제됐는지, 스크립트와 무관한 계약 단언이 함께 사라지지 않았는지 확인한다.
4. Python Q2: base에서 실패하던 메서드가 바뀌지 않았는지 확인한다.
5. 임시 음성 확인을 되돌렸는지, 종료 diff에 남지 않았는지 확인한다.

---

### Task 1: role-policy·agent-fragments 계약의 4 플랫폼 확장

**목표·범위:** 정책 projection과 managed 구역 계약을 4 플랫폼 대상에서 검사한다.
- `tests/node/role-policy.test.mjs:65`, `:140`, `:155`, `:226`, `:235`, `:247`, `:258`, `:266` 등 `:140–358` 구간의 `['codex','claude']` 루프
- `tests/node/agent-fragments.test.mjs:13`(Planner full-plan 지시를 2개 프로필에서만 확인)

**선행:** 없음.

**Files (allowedPaths):** Modify `tests/node/role-policy.test.mjs`, `tests/node/agent-fragments.test.mjs`

- [ ] **Step 0:** 공통 Step 0.
- [ ] **Step 1:** 구간 안의 플랫폼 루프를 확장 형태로 넓힌다.
  - 경로는 `${platform}/agents/arc-${role}.${platform==='codex'?'toml':'md'}`, `${platform}/skill/references/*.md`처럼 일반화한다.
  - `[platform.claude]`처럼 플랫폼 고유 규칙 ID를 단언하는 곳은 `lib/policy/role-policy.json`의 플랫폼별 규칙 데이터로 기대값을 정한다(읽기만). 하드코딩 분기는 추가하지 않는다.
- [ ] **Step 2:** `agent-fragments.test.mjs:13`의 대상 프로필을 4 플랫폼 Planner 프로필로 넓힌다.
- [ ] **Step 3:** `node --test tests/node/role-policy.test.mjs tests/node/agent-fragments.test.mjs`를 실행한다. 통과하면 RED 규칙의 (a)(b)를 증거로 남긴다. 실패하면 Q5로 분류한다.
- [ ] **Step 4:** 공통 종료.
- [ ] **Step 5: 커밋(Orchestrator, 수락 뒤):** `test(policy): role-policy·fragment 계약을 네 플랫폼으로 확장`

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

**진행 기록 (T1):** 미기록

---

### Task 2: paired specialist payload parity의 4 플랫폼 확장과 원장 결합 확인

**목표·범위:** `tests/node/parity-check.test.mjs:42-56`의 `['codex','claude']` 비교를 4 플랫폼으로 넓힌다. `[platform.` 줄을 제외한 contract 본문이 4 플랫폼에서 모두 같은지 확인한다.
- 원장은 편집하지 않는다.
- S0의 HISTORICAL 96줄이 변경 불필요인지 문서 근거로 확인한다.

**선행:** 없음.

**Files (allowedPaths):** Modify `tests/node/parity-check.test.mjs`. `tests/installer-parity.json`은 read-only.

- [ ] **Step 0:** 공통 Step 0. `node scripts/check-installer-parity.mjs`와 `--complete`의 base 결과를 기록한다. `--complete`가 base에서 실패하면 실패 메시지를 기준으로 기록한다.
- [ ] **Step 1:** `:48`을 `['codex','claude','gemini','grok']`로 바꾼다. 확장자 식을 유지하고, 4개 본문이 모두 같다는 단언(`contracts.every(c => c === contracts[0])`)으로 일반화한다. 실패 메시지에 role과 platform을 남긴다.
- [ ] **Step 2:** `node --test tests/node/parity-check.test.mjs`를 실행한다. 통과하면 RED 규칙 (b)를 적용한다. gemini·grok 본문이 `[platform.` 외 줄에서 다르면 Q5 hold로 처리하고 차이 줄을 보고한다.
- [ ] **Step 3:** 원장 결합을 대조한다. `:37` 개수 단언이 바뀌지 않았고 이 task가 원장을 편집하지 않았음을 보고한다.
- [ ] **Step 4:** 공통 종료.
- [ ] **Step 5: 커밋(Orchestrator, 수락 뒤):** `test(parity): paired specialist payload 비교를 네 플랫폼으로 확장`

**수용 기준:**
- 4 플랫폼 × 5 역할 비교
- `check-installer-parity` 일반 모드와 `--complete`의 결과가 base 대비 악화하지 않음
- 원장 diff 없음

**관련 테스트(이유):** `parity-check`(직접 편집), `role-policy`(같은 출력)

**check:** `node scripts/check-installer-parity.mjs`, `node scripts/check-installer-parity.mjs --complete`, `npm run check:role-policy`

**필수 QA·증거:** fresh QA, 비교 대상 20개, 음성 확인, `--complete` 출력

**Hold:** Q5, `--complete`의 신규 실패

**진행 기록 (T2):** 미기록

---

### Task 3: package 테스트의 4 플랫폼 확장

**목표·범위:** `tests/node/package.test.mjs:10`(ordinary 파일 목록), `:14`, `:22`의 codex·claude 한정 경로와 루프에 gemini·grok을 추가한다. `:9`의 cache 경로도 같은 구성이면 함께 넓힌다.

**선행:** T6 수락·커밋(payload 구성이 확정된 뒤 base를 기록하기 위해서다).

**Files (allowedPaths):** Modify `tests/node/package.test.mjs`

- [ ] **Step 0:** 공통 Step 0. base는 T6 커밋 뒤 HEAD다.
- [ ] **Step 1:** 합성 경로 `gemini/skill/scripts/nested/...`, `grok/skill/scripts/nested/...`와 `:14`·`:22`의 플랫폼 목록을 확장한다.
- [ ] **Step 2:** `node --test tests/node/package.test.mjs`를 실행한다. 통과하면 RED 규칙 (a)(b)를 적용한다.
- [ ] **Step 3:** 공통 종료.
- [ ] **Step 4: 커밋:** `test(package): package 포함·제외 검사를 네 플랫폼으로 확장`

**수용 기준:** 4 플랫폼 경로가 포함·제외 규칙 양쪽에서 검사되고, 신규 실패가 없다.

**관련 테스트(이유):** `package`(직접), `release-artifact`(같은 cache 제외 규칙), `manifest`(payload 목록)

**check:** `npm run check:manifest`

**필수 QA·증거:** fresh QA, 음성 확인

**Hold:** Q5, masking

**진행 기록 (T3):** 미기록

---

### Task 4: 설치 lifecycle의 4 플랫폼 순서·부분 실패와 upgrade·consumer 확장

**목표·범위:**
- (a) `tests/node/all-targets.test.mjs`: `installTargets`를 4 플랫폼 입력으로 실행하는 신규 테스트 2개를 추가한다. 기존 테스트(`:4–16`, 원장 매핑)는 바꾸지 않는다.
  - `All installs four targets in registry order`: preflight·설치 순서 `['claude','codex','gemini','grok']`, 결과 4개 `installed`
  - `All stops at a third-target failure, keeps earlier installs and leaves the fourth not-started`: gemini에서 기존 fault hook 방식으로 실패를 주입한다. claude·codex 설치는 유지되고, gemini는 실패, grok은 `not-started`여야 한다.
- (b) `tests/node/upgrade-harness.test.mjs:33`
- (c) `tests/node/npm-upgrade-consumer.test.mjs:8`, `:16`, `:24`
- (d) `tests/node/consumer.test.mjs:12–18`의 codex·claude 한정 루프

**선행:** T6 수락·커밋(packed payload).

**Files (allowedPaths):** Modify `tests/node/all-targets.test.mjs`, `tests/node/upgrade-harness.test.mjs`, `tests/node/npm-upgrade-consumer.test.mjs`, `tests/node/consumer.test.mjs`

- [ ] **Step 0:** 공통 Step 0. npm sandbox 테스트가 bridge sandbox에서 실행되지 않으면 Orchestrator의 host 출력을 기준으로 쓴다.
- [ ] **Step 1: RED 기대 없음** all-targets 신규 테스트를 추가한다. 입력 plan은 같은 파일의 `plans(t)` 방식을 4 플랫폼으로 일반화한 지역 helper로 만든다. 공유 fixture는 바꾸지 않는다. 통과하면 음성 확인을 한다(실패 주입 위치를 grok으로 바꿔 기대 상태가 어긋나는지 보고 되돌림).
- [ ] **Step 2:** (b)–(d)를 넓힌다.
  - 각 테스트의 설치 명령이 이미 4 플랫폼을 설치하는 경우(`--target all` 등)에는 단언 루프만 넓힌다.
  - codex·claude만 설치하는 경우, 같은 파일 안에서 CLI가 지원하는 대상 지정만 바꿔 확장한다.
  - 공유 fixture(`tests/node/fixtures/npm-sandbox*` 등) 변경이 필요하면 그 항목만 hold한다.
- [ ] **Step 3:** 4개 파일을 실행한다(npm sandbox 테스트는 host 필요 시 Orchestrator 실행).
- [ ] **Step 4:** 공통 종료.
- [ ] **Step 5: 커밋:** `test(lifecycle): 네 플랫폼 설치 순서·부분 실패와 upgrade·consumer 검사 확장`

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

**진행 기록 (T4):** 미기록

---

### Task 5: Python 계약 테스트 확장(Q2 규칙)

**목표·범위:** `tests/test_harness_contract.py:12`, `:798`과 `tests/test_arc_policy.py`의 루프(`:385`, `:395`, `:420`, `:451`, `:495`, `:563`, `:1396`, `:1475`, `:1502`, `:1504`, `:1599`, `:1612`, `:1623`)에서 base에서 통과하는 메서드만 4 플랫폼으로 넓힌다.

**선행:** 없음.

**Files (allowedPaths):** Modify `tests/test_harness_contract.py`, `tests/test_arc_policy.py`

- [ ] **Step 0:** 공통 Step 0. 대상 메서드별 base 상태표를 만든다.
  ```
  PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -v -s tests -p test_harness_contract.py
  PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -v -s tests -p test_arc_policy.py
  ```
  각 대상 줄이 속한 메서드명과 `ok/FAIL/ERROR`를 기록한다. 편집 전에 이 표를 제출한다.
- [ ] **Step 1:** `ok` 메서드만 넓힌다.
  - `:12`가 여러 메서드가 쓰는 모듈 상수이고 그중 하나라도 base에서 실패하면 상수는 바꾸지 않는다. 대신 통과 메서드 안에서만 지역 4 플랫폼 튜플을 쓴다.
  - 이미 `subTest(platform=…)`를 쓰는 루프(`:498` 부근)는 그 구조를 유지한다.
- [ ] **Step 2:** 실패 메서드는 바꾸지 않고 hold 목록에 둔다. 메서드명, base 실패 요약, 대상 줄을 적는다.
- [ ] **Step 3:** 같은 명령을 재실행한다. 넓힌 메서드가 통과하는지, 신규 실패가 없는지 메서드 이름 기준으로 대조한다. 넓힌 메서드가 실패하면 Q5 hold로 처리한다.
- [ ] **Step 4:** 공통 종료.
- [ ] **Step 5: 커밋:** `test(contract): 통과 중인 Python 계약 루프를 네 플랫폼으로 확장`

**수용 기준:**
- base 상태표가 있다.
- 넓힌 메서드는 모두 base `ok`이고 확장 뒤에도 `ok`다.
- base 실패 메서드의 diff는 없다(QA가 메서드 범위 diff로 확인).
- 신규 실패가 없다.

**관련 테스트(이유):** 두 파일(직접). `test_claude_payload.py`는 같은 문서를 읽지만 T6 소유이므로 실행만 한다.

**check:** 없음(정책 산출물 불변)

**필수 QA·증거:** fresh QA, 상태표 독립 재현, hold 목록

**Hold:** Q5, 공유 상수 충돌

**진행 기록 (T5):** 미기록

---

### Task 6: legacy 모델 스크립트 제거(U3)와 manifest 계약 4 플랫폼화

**목표·범위:**
- (a) U3: `claude/skill/scripts/{apply-models.py,model_config.py}`와 `codex/skill/scripts/{apply-models.py,model_config.py}`를 삭제한다.
  - 이 스크립트를 실행하거나 import하는 테스트·helper를 정리한다: `tests/test_codex_models.py:264,360,385`, `tests/test_claude_payload.py:24,53,55,216,228,264,383–384,799–800`, `tests/qa_model_cases.py:62`.
  - `MANIFEST.sha256`과 golden을 재생성한다.
  - `tests/node/manifest.test.mjs:48`(MANIFEST에서 `codex/skill/scripts/model_config.py` 줄을 빼는 mutation)을 남아 있는 다른 payload 파일로 바꾼다.
- (b) manifest GAP: `tests/node/manifest.test.mjs:77`, `:78`(platform 복사본 C1 거부), `:93`(coordination.md 필수·최신)의 `['codex','claude']`를 4 플랫폼으로 넓힌다.

**선행:** 없음. 첫 번째로 실행한다(payload를 바꾸는 유일한 task).

**Files (allowedPaths):**
- Delete: 위 스크립트 4개
- Modify: `tests/test_codex_models.py`, `tests/test_claude_payload.py`, `tests/qa_model_cases.py`, `tests/node/manifest.test.mjs`
- Regenerate: `MANIFEST.sha256`(`node scripts/update-manifest.mjs`), `tests/node/fixtures/installed-layout-golden.json`(`node tests/node/fixtures/installed-layout.mjs --diff` 뒤 `--write`)

- [ ] **Step 0:** 공통 Step 0.
  - 원장 조회 대상: `tests/test_codex_models.py`, `tests/test_claude_payload.py`, `tests/node/manifest.test.mjs`
  - 삭제 예정 Python 메서드가 원장에 매핑되어 있으면 그 메서드는 hold한다.
  - `qa_model_cases` import 위치를 read-only로 찾아 기록한다.
  - 정적 참조를 재확인한다. `apply-models|model_config|skill/scripts`가 `lib/`, `bin/`, `scripts/`, `shared/`, `{platform}/skill/**/*.md`에 없어야 한다(S0와 이번 grep 근거). 하나라도 발견되면 hold한다.
- [ ] **Step 1: RED** manifest GAP 확장(`:77`, `:78`, `:93`)을 실행한다. 통과하면 음성 확인을 한다.
- [ ] **Step 2:** 스크립트 4개를 삭제한다.
  - 스크립트를 실행하거나 import하는 테스트 메서드·helper 사례만 삭제한다.
  - 같은 메서드가 스크립트와 무관한 계약(예: `models.toml` 값, 프로필 내용)을 함께 단언하면 그 단언은 스크립트 없이 유지한다. 유지할 수 없으면 hold한다.
  - 삭제·변경한 메서드 목록과 각각에 대응하는 Node 커버리지(예: `models.test.mjs`의 `loadModelConfig`)를 보고한다.
- [ ] **Step 3:** `manifest.test.mjs:48`의 mutation 대상을 남는 codex payload 파일로 바꾸고, 그 mutation이 여전히 실패를 유발하는지 확인한다.
- [ ] **Step 4: MANIFEST** `node scripts/update-manifest.mjs`를 실행한다. 정확히 4항목이 삭제되어야 하고 추가·변경은 없어야 한다. 다르면 hold한다.
- [ ] **Step 5: golden** `--diff` 기대는 정확히 16줄 삭제다(8 레이아웃 × 2, base `:68-69`, `:136-137`, `:209-210`, `:282-283`, `:350-351`, `:418-419`, `:491-492`, `:564-565`). 다르면 `--write` 전에 hold한다.
- [ ] **Step 6:** 관련 테스트를 확인한다.
  - `node --test --test-name-pattern='preserves public rendering baseline' tests/node/plan.test.mjs`가 실패하면 hold한다(T7 소유).
  - `package.test.mjs:9-10`, `release-artifact.test.mjs:40`은 합성 경로이므로 통과를 기대한다. 실패하면 hold한다(비소유 파일).
- [ ] **Step 7:** 공통 종료.
- [ ] **Step 8: 커밋:** `chore(payload): legacy 모델 스크립트를 제거하고 manifest 계약을 네 플랫폼으로 확장`

**수용 기준:**
- 스크립트 4개가 없다.
- MANIFEST에서 4항목, golden에서 16줄이 삭제되고 그 밖의 변경이 없다.
- 제품 코드 diff가 없다(`git diff 50d83c63 -- lib bin scripts shared` 비어 있음).
- 삭제 메서드 목록과 근거가 있다.
- manifest C1·coordination 검사가 4 플랫폼에서 이뤄진다.
- 신규 실패가 없다.

**관련 테스트(이유):**
- `manifest`, `installed-layout-golden`(생성물)
- `package`, `release-artifact`(payload 목록·cache)
- `plan`(digest)
- `packed-consumer`, `skill-sources`, `runtime-assets`(설치 payload)
- Python `test_codex_models.py`, `test_claude_payload.py`, `qa_model_cases` importer, `test_arc_policy.py`(`:505`는 `assertNotIn`이므로 편집 불필요)

**check:** `npm run check:manifest`, `node scripts/check-installer-parity.mjs`

**필수 QA·증거:** fresh QA, MANIFEST·golden 목록, 삭제 메서드 대조, 정적 참조 재확인, 음성 확인

**Hold:** 동적·문서 참조 발견, 원장 매핑 메서드 삭제 필요, 생성물 개수 불일치, plan digest 실패, 비소유 파일 실패

**진행 기록 (T6):** 미기록

---

### Task 7: install plan·global bootstrap의 4 플랫폼 확장

**목표·범위:**
- `tests/node/plan.test.mjs`: `payload()`(`:8`)를 gemini·grok의 `models.toml`·프로필로 넓히고, `:142`, `:149`, `:160`, `:184`, `:228`, `:281`, `:291`, `:297`, `:301`의 루프를 넓힌다.
  - `:93`, `:128`, `:261`은 조사에서 분류되지 않았으므로 바꾸지 않는다(D8).
- `tests/node/global-config.test.mjs:10`(home·SKILL 경로 쌍), `:31`(platform 인자)

**선행:** T6 수락·커밋.

**Files (allowedPaths):** Modify `tests/node/plan.test.mjs`, `tests/node/global-config.test.mjs`

- [ ] **Step 0:** 공통 Step 0. 두 파일 모두 원장 매핑이 많으므로 기존 이름을 보존한다.
- [ ] **Step 1:** `payload()`를 확장한다. 프로필 파일명과 확장자는 저장소의 `{gemini,grok}/agents/arc-*.md`에서 읽는다.
- [ ] **Step 2:** 루프를 넓힌다.
  - `:228`(public rendering baseline)은 gemini·grok의 새 digest 상수를 현재 출력에서 기록한다. 이것은 characterization pin이다. QA가 같은 값을 독립 재계산하고, gemini·grok 렌더가 같은 테스트의 claude 구조 단언을 통과하는지 확인한다.
  - `:281–297`은 gemini·grok catalog pair가 저장소 데이터(`{platform}/skill/models.toml`, 기존 catalog fixture)로 이미 있을 때만 넓힌다. 없으면 hold한다.
- [ ] **Step 3:** global-config `:10`에 `['/Users/u/.gemini','~/.gemini/skills/arc/SKILL.md']`, `['/Users/u/.grok','~/.grok/skills/arc/SKILL.md']`를 추가하고, `:31` 루프를 넓힌다. 제품 블록이 플랫폼별로 다르면 Q5로 처리한다.
- [ ] **Step 4:** 두 파일을 실행한다. 통과하면 음성 확인을 한다.
- [ ] **Step 5:** 공통 종료.
- [ ] **Step 6: 커밋:** `test(plan): install plan·global bootstrap 검사를 네 플랫폼으로 확장`

**수용 기준:** 대상 루프 확장 또는 hold 기록, 새 digest의 QA 독립 재계산, 기존 매핑 이름 유지, 신규 실패 없음

**관련 테스트(이유):** 두 파일(직접), `installed-layout-golden`(렌더 결과), `instruction-layout`(global block)

**check:** `node scripts/check-installer-parity.mjs --complete`

**필수 QA·증거:** fresh QA, digest 재계산, 음성 확인

**Hold:** Q5, catalog 부재, masking

**진행 기록 (T7):** 미기록

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

- [ ] **Step 0:** 공통 Step 0.
- [ ] **Step 1:** models `:98`의 mismatch 식을 일반화한다(다른 아무 플랫폼). `:136`의 필드명(`model_reasoning_effort`/`effort`)은 각 플랫폼 `models.toml`에서 읽는다. gemini·grok 필드를 정할 수 없으면 hold한다.
- [ ] **Step 2:** profile-render는 gemini·grok 프로필(`.md`)을 claude 방식으로 확장한다. 렌더러가 gemini·grok을 거부하면 Q5로 처리한다.
- [ ] **Step 3:** preset은 같은 파일의 `fixture(t)`·`install(home,p)`가 gemini·grok을 지원할 때만 넓힌다. 공유 fixture 변경이 필요하면 hold한다.
- [ ] **Step 4:** tui-setup `:60`은 플랫폼별 scouter 모델 값을 `models[target]`에서 고른다(현재 `target==='codex'?'gpt-6-luna':'sonnet'`). 패키지 기본값과 다른 유효 값을 플랫폼 catalog나 `models.toml`에서 고를 수 없으면 hold한다.
- [ ] **Step 5:** 4개 파일을 실행한다. 음성 확인을 한다.
- [ ] **Step 6:** 공통 종료.
- [ ] **Step 7: 커밋:** `test(models): 모델 설정·렌더·preset 검사를 네 플랫폼으로 확장`

**수용 기준:** 대상 루프 확장 또는 hold 기록, 신규 실패 없음

**관련 테스트(이유):** 4개 파일(직접), `model-catalog`(catalog), `preset-cli`(preset 경로)

**check:** 없음

**필수 QA·증거:** fresh QA, 음성 확인, hold 근거

**Hold:** Q5, 필드·catalog 부재, 공유 fixture 필요, masking

**진행 기록 (T8):** 미기록

---

### Task 9: 관리 작업·상태·제거·잔여 기본값의 4 플랫폼 확장

**목표·범위:**
- `tests/node/management-operations.test.mjs:71`, `:73`
- `tests/node/management-status.test.mjs:9`
- `tests/node/uninstall.test.mjs:24`, `:29`
- `tests/node/hardcoding-residual.test.mjs:110`

**선행:** 없음.

**Files (allowedPaths):** Modify 위 4개 파일

- [ ] **Step 0:** 공통 Step 0.
- [ ] **Step 1:** 각 루프를 확장 형태로 넓힌다.
  - management-status `:9`는 `staticPackageFixture`가 gemini·grok 설치를 이미 지원할 때만 넓힌다. fixture 변경이 필요하면 hold한다.
  - hardcoding-residual `:110`은 zeta 주입 시나리오(`:22-25`)를 바꾸지 않고 기본 경로의 대상 루프만 넓힌다.
- [ ] **Step 2:** 실행하고 음성 확인을 한다.
- [ ] **Step 3:** 공통 종료.
- [ ] **Step 4: 커밋:** `test(management): 관리 작업·상태·제거 검사를 네 플랫폼으로 확장`

**수용 기준:** 플랫폼별 설정 제거가 다른 플랫폼을 보존하는지, 전역 블록·언어 설정 제거, 비관리 프로필 보존, 패키지 기본값 대 설치 기본값이 4 플랫폼에서 단언된다(또는 hold 기록). 신규 실패 없음.

**관련 테스트(이유):** 4개 파일(직접), `uninstall-cli`, `management-update`(같은 operation 경로)

**check:** 없음

**필수 QA·증거:** fresh QA, 음성 확인

**Hold:** Q5, fixture 필요, masking

**진행 기록 (T9):** 미기록

---

### Task 10: 사용자 소유 프로필 보존·upgrade 재적용·upgrade 상태의 4 플랫폼 확장

**목표·범위:**
- `tests/node/install-mode-review-followup.test.mjs:23`, `:37`, `:46`, `:55`
- `tests/node/upgrade-reapply.test.mjs:254`
- `tests/node/upgrade-state.test.mjs:37`, `:44`, `:53`

**선행:** 없음.

**Files (allowedPaths):** Modify 위 3개 파일

- [ ] **Step 0:** 공통 Step 0.
- [ ] **Step 1:** 넓힌다.
  - review-followup은 `tests/node/fixtures/install-mode.mjs`의 `profileFiles`가 codex·claude 한정(`:38`)이다. 테스트가 그 helper에 의존하면 해당 테스트만 hold한다(fixture는 범위 밖, D6).
  - `:16-18`(composite 쌍)은 바꾸지 않는다.
- [ ] **Step 2:** 실행하고 음성 확인을 한다.
- [ ] **Step 3:** 공통 종료.
- [ ] **Step 4: 커밋:** `test(upgrade): 프로필 보존·upgrade 상태 검사를 네 플랫폼으로 확장`

**수용 기준:** 대상 확장 또는 hold 기록, 신규 실패 없음

**관련 테스트(이유):** 3개 파일(직접), `upgrade-snapshot-scope`, `install-mode-switch`(같은 상태 수집)

**check:** 없음

**필수 QA·증거:** fresh QA, 음성 확인

**Hold:** Q5, fixture 의존, masking

**진행 기록 (T10):** 미기록

---

### Task 11: npm 설치 부작용 부재와 설치 런타임 엔트리의 4 플랫폼 확장

**목표·범위:**
- `tests/node/npm-lifecycle.test.mjs:27`, `tests/node/npm-lifecycle-pty.test.mjs:10`, `tests/node/npm-completion-consumer.test.mjs:29`: `.codex`·`.claude` 부재 단언 옆에 `.gemini`·`.grok` 부재 단언을 추가한다.
- `tests/node/runtime-installed-entry.test.mjs:9`: 루프를 넓힌다. 본문이 플랫폼을 공유 런타임에 넘기는 인자로만 쓰는 경우에 한한다. 플랫폼별 home 구조를 따로 만들어야 하면 hold한다.

**선행:** 없음.

**Files (allowedPaths):** Modify 위 4개 파일

- [ ] **Step 0:** 공통 Step 0. npm sandbox·PTY 테스트는 필요하면 host에서 실행한다.
- [ ] **Step 1:** 단언을 추가하고 루프를 넓힌다. 부재 단언의 음성 확인: sandbox home에 `.gemini`를 임시로 만드는 줄을 넣어 실패하는지 보고 되돌린다.
- [ ] **Step 2:** 실행.
- [ ] **Step 3:** 공통 종료.
- [ ] **Step 4: 커밋:** `test(npm): 설치 부작용 부재와 런타임 엔트리 검사를 네 플랫폼으로 확장`

**수용 기준:** 4 플랫폼 home 부재 단언, 런타임 엔트리 확장 또는 hold 기록, 신규 실패 없음

**관련 테스트(이유):** 4개 파일(직접), `npm-sandbox`(fixture 동작)

**check:** 없음

**필수 QA·증거:** fresh QA, host 출력(해당 시), 음성 확인

**Hold:** Q5(예: npm 설치가 `.gemini`를 만든다), masking

**진행 기록 (T11):** 미기록

---

### Task 12: payload 정적 검사의 4 플랫폼 확장

**목표·범위:**
- `tests/node/package-references.test.mjs:8`: 플랫폼 로컬 references 복사본 부재
- `tests/node/superpowers.test.mjs:21`: nested reference payload 거부. prefix 목록에 `'gemini'`, `'grok'`을 추가한다.
- `tests/node/status-labels.test.mjs:26`: status label 오타 검사 대상에 gemini·grok skill 디렉터리를 추가한다.

**선행:** T6 수락·커밋(MANIFEST 내용).

**Files (allowedPaths):** Modify 위 3개 파일

- [ ] **Step 0:** 공통 Step 0.
- [ ] **Step 1:** 넓힌다. superpowers에서 `validateFlatReferenceFiles`가 gemini·grok prefix를 거부하지 않으면 Q5로 처리한다(제품 차이).
- [ ] **Step 2:** 실행하고 음성 확인을 한다.
- [ ] **Step 3:** 공통 종료.
- [ ] **Step 4: 커밋:** `test(payload): reference·label 정적 검사를 네 플랫폼으로 확장`

**수용 기준:** 3개 검사가 4 플랫폼에 적용되거나 hold가 기록된다. 신규 실패 없음.

**관련 테스트(이유):** 3개 파일(직접), `manifest`(C1 규칙), `skill-sources`

**check:** `npm run check:manifest`

**필수 QA·증거:** fresh QA, 음성 확인

**Hold:** Q5, masking

**진행 기록 (T12):** 미기록

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

- [ ] **Step 0:** 공통 Step 0.
- [ ] **Step 1:** U-a와 U-b에 규칙을 적용하고 판정 근거(파일:줄)를 기록한다.
- [ ] **Step 2:** 확장한 경우에는 실행하고 음성 확인을 한다.
- [ ] **Step 3:** 공통 종료.
- [ ] **Step 4: 커밋(변경 시):** `test(bridge): 잔여 플랫폼 판정 항목 확장`

**수용 기준:** 두 항목 모두 판정과 근거가 있다. 확장 시 신규 실패 없음.

**관련 테스트(이유):** 2개 파일(직접), `gemini-bridge`·`grok-bridge`(대조)

**필수 QA·증거:** fresh QA, 판정 근거 독립 확인

**Hold:** 규칙상 hold, Q5

**진행 기록 (T13):** 미기록

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
| T6 | 없음 | payload, MANIFEST, golden | prerequisite |
| T1, T2, T5, T8, T9, T10, T11, T13 | 없음 | 파일 중복 없음 | 즉시 가능 |
| T3, T4, T7, T12 | T6 커밋 | T6 결과 payload 위에서 base 기록 | T6 수락·커밋 |

- **권장 순서(같은 worktree, 직렬 기본):** T6 → T1 → T2 → T5 → T3 → T4 → T7 → T12 → T8 → T9 → T10 → T11 → T13
- **병렬 조건**
  - 파일은 서로 겹치지 않지만, 현재 routing에서 Implementer·QA는 codex bridge이므로 같은 worktree에서는 한 번에 bridge 하나만 실행한다(쓰기 bridge와 읽기 bridge도 동시에 두지 않는다: 2026-11-23 Scouter가 동시 Implementer 쓰기로 `permission_violation_observed`). 병렬이 필요하면 task별 별도 worktree를 사용자 선택으로 준비한다. 순서 제약은 T6 이전 T1·T2·T5·T8–T11·T13, T6 이후 T3·T4·T7·T12다.
  - bridge Implementer는 같은 worktree에서 쓰기 bridge 1개만 허용한다. 실행 중에는 commit하지 않는다.
  - 병렬 실행 시 각 QA의 status 판정은 자기 allowedPaths 기준으로 한다.
- **hold 전파:** 한 task의 Q5 hold는 그 task만 막는다. T6이 hold되면 T3·T4·T7·T12만 막힌다.

## 최종 검증(모든 task 수락·커밋 뒤)

**범위·시점:** 마지막 task 커밋 뒤 한 번 실행한다. 개별 task 수락을 늦추지 않는다. 설치된 규칙에 따라 마지막 task QA가 최종 범위를 흡수하거나, verified HEAD에서 fresh QA를 1회 실행한다.

1. **계약 테스트 전부**
   - `tests/node/test-scope-contract.test.mjs`, `tests/node/plan-level-records-contract.test.mjs`, `tests/node/run-mode-contract.test.mjs`, `tests/node/composite-instructions.test.mjs`, `tests/node/instruction-layout.test.mjs`, `tests/node/agent-fragments.test.mjs`, `tests/node/role-policy.test.mjs`, `tests/node/parity-check.test.mjs`
   - `tests/test_harness_contract.py`, `tests/test_arc_policy.py`
2. **check 전부**
   - `npm run check:manifest`, `npm run check:role-policy`, `node scripts/update-runtime-assets.mjs --check`
   - `node scripts/check-installer-parity.mjs`, `node scripts/check-installer-parity.mjs --complete`
   - `--complete`는 base(`50d83c63`) 결과와 비교한다.
3. **재변경 파일 관련 테스트**
   - 설계상 task 간 파일 중첩은 없다. 예상 재변경 파일도 없다.
   - 예외: T6 hold 처분으로 `plan.test.mjs` digest가 바뀌면 T7과 겹친다. 이 경우 `plan`, `installed-layout-golden`을 실행한다.
   - Orchestrator가 목록을 계산하고 QA가 `git diff`로 대조한다.
4. **전체 회귀 잠정 판정: 실행**
   - 트리거 1: T6이 payload 파일을 삭제하고 공유 생성물(MANIFEST, golden)과 공유 Python helper(`tests/qa_model_cases.py`)를 바꾼다. Python 계약 2파일도 변경된다.
   - 트리거 2: 없음 예상(base 뒤 병합 없음).
   - 트리거 3: 없음 예상(`package.json`·lockfile·테스트 설정 불변).
   - 트리거 4: 없음 예상(rule ID·CLI·export 불변).
   - QA가 트리거 1·3·4를 독립 확인한다.
   - 명령: `npm test`, `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests`
   - 판정 기준: 기존 실패가 있다(Node 22건 이름 기준, Python 약 486 failures·6 errors). 이름 기준 "신규 실패 없음"으로 판정하고 verification.md의 Baseline·Result comparison을 적용한다.
   - T6에서 삭제된 Python 메서드의 소멸은 신규 실패가 아니다. 삭제 목록으로 처분한다.
   - 각 task의 hold 목록 항목은 base 실패 그대로여야 한다.
5. **최종 Reviewer 1회(significant):** 모든 task 수락과 필수 QA 뒤, 독립 Reviewer가 `50d83c63..HEAD` 전체를 검토한다.
   - 확인 항목: Review Focus 1–5, 제품 코드 diff 없음, Q5·Q2 hold 목록 일관성, U3 삭제 완결성, 원장 무변경
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
- **D4 (Q4)** U3 스크립트 4개를 제거한다. 정적 참조가 없음을 S0과 이번 grep으로 확인했다. MANIFEST와 golden 외에는 tests에서만 참조된다. 남은 참조: `package.test.mjs:9-10`, `release-artifact.test.mjs:40`은 합성 경로, `test_arc_policy.py:505`는 `assertNotIn`.
- **D5** 이 계획은 `tests/installer-parity.json`을 편집하지 않는다. 원장 변경이 필요하면 plan 개정으로 처리한다.
- **D6** 공유 test fixture 모듈은 바꾸지 않는다. 필요한 확장은 해당 항목만 hold한다.
- **D7** `tests/node/manifest.test.mjs`는 U3(`:48`)와 manifest GAP(`:77`, `:78`, `:93`)이 모두 편집해야 한다. 같은 파일을 두 task가 편집하지 않도록 T6에 묶었다. 둘 다 payload 구성 계약이다.
- **D8** `plan.test.mjs:93`, `:128`, `:261`과 `models.test.mjs:40`은 조사에서 분류되지 않았거나 HISTORICAL이므로 바꾸지 않는다. 후속 후보로 남긴다.
- **D9** 후속 후보: `tui-package-consumer.test.mjs:43`(env-gated), `live-upstream.mjs:13`(live probe), T13의 hold 결과, 각 task의 Q5 hold 결과. 직전 계획 최종 Reviewer nit(2026-11-23)에서 넘어온 2건도 있다. (1) `tests/node/fixtures/instruction-contracts.json`의 4 플랫폼 `skill`·`global` 크기 상한이 현재 크기의 약 1.8배라 느슨하다. 함께 조일지 검토한다. (2) `gemini/skill/references/coordination.md:76`(`AskUserQuestion`), `:83`(Long Bash)에 Claude 전용으로 보이는 문구가 있고, fixture가 이 문구를 고정한다(`instruction-contracts.json:306`). 지침 문서 수정은 이 계획의 범위 밖이므로 별도 문서 계획으로 다루고, 그때 fixture도 함께 바꾼다.

## 가정

- **A1** 깊이는 "plan 필요, 별도 spec 없음"이다. 승인된 설계가 spec 역할을 하며, Orchestrator 기록과 다르면 Orchestrator가 바로잡는다.
- **A2** MANIFEST는 `tests/` 파일을 포함하지 않는다. 2026-11-23 F2 기록에서 fixture를 바꿨을 때 MANIFEST에 변경이 없었다. 따라서 T6 외 task는 MANIFEST·golden을 바꾸지 않는다.
- **A3** golden의 scripts 항목은 claude·codex 8 레이아웃 × 2이다(base `:68–565`의 16줄).
- **A4** S0이 인용한 줄 번호는 base `50d83c63` 기준이며, Implementer가 Step 0에서 재확인한다.

## 개정 이력

| Version | Approval time | Classification | Affected tasks | Reason |
|---|---|---|---|---|
| v1 | 2026-11-23 (사용자 "승인") | initial | 전체 | 최초 계획 |

## 자체 검토 체크리스트

- [x] T1–T5, U3(T6), U4 GAP(T7–T12), 잔여 UNSURE(T13)를 배정했다. 두 task가 같은 파일을 편집하지 않는다(파일 표).
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
