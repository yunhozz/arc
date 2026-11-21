# 추천 모델 기본값 교체 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 네 플랫폼 패키지의 기본 역할 모델과 effort를 승인된 추천 값으로 바꾼다. 연결된 산출물(프로필, 테스트, golden, MANIFEST)과 `docs/images/role-models.svg` 그림도 새 값에 맞춘다.

**Architecture:** 기본값의 원본은 `<platform>/skill/models.toml`이다. 최초 설치 Configure 화면은 설치된 `settings.modelConfig`가 있으면 그것을, 없으면 패키지 `models.toml`을 보여 준다(`lib/tui/setup.mjs:18-24`). 업그레이드는 MUTABLE인 `models.toml`을 덮지 않는다(`lib/installer/manifest.mjs:12`, `lib/installer/plan.mjs:36,75-76`, `lib/installer/upgrade-state.mjs:32`). 따라서 데이터와 산출물만 바꾸고 로직은 건드리지 않는다.

**Tech Stack:** Node.js (`node --test`), Python unittest (`PYTHONDONTWRITEBYTECODE=1`), TOML, SVG.

**Spec:** 별도 spec 없음. 승인된 짧은 설계는 `/Users/yunho/Desktop/project/arc/.git/arc/handoff/2026-11-21-final-verify-models-watch.md` "## B." 절과 설계 브리프 B-C1~B-C5다.

## Global Constraints
- 대상 worktree: `/Users/yunho/Desktop/project/arc/.claude/worktrees/recommended-default-models`, 브랜치 `feat/recommended-default-models`, base `68ef36c864f7dfe6fa1bebffc15906f2d95a16a7`.
- 새 기본값(B-C1):
  - Claude: Scouter sonnet/medium, Planner opus/xhigh, Implementer sonnet/high, QA sonnet/medium, Reviewer opus/high
  - Codex(`model_reasoning_effort`): Scouter gpt-6.2-sol/high, Planner gpt-6.2-astra/xhigh, Implementer gpt-6.2-sol/medium, QA gpt-6.2-sol/high, Reviewer gpt-6.2-astra/high
  - Gemini: 전 역할 gemini-3.8-flash/default
  - Grok: 전 역할 grok-4.6/default (변경 없음, `grok/` 파일은 수정하지 않음)
- B-C6: 기존 설치의 사용자 설정은 유지한다. 설치·업그레이드 로직은 바꾸지 않는다.
- B-C7: `gemini/skill/models.toml` 2행 주석을 `# Defaults are recommended pairs from the packaged catalog.`로 바꾼다.
- 모든 값은 `lib/models/*-models.json` 카탈로그의 유효 쌍이어야 한다(B-C4). 카탈로그 JSON은 수정하지 않는다.
- 런타임 모듈(`lib/runtime/*`, `shared/skill/runtime/*`)은 변경하지 않는다. `CATALOG_MODEL_ALIASES`(`lib/runtime/role-dispatch-policy.mjs:33`)는 기본값이 아니므로 그대로 둔다. runtime-versions baselineHash도 갱신하지 않는다.
- `claude/agents/*.md`의 model/effort는 프로필 자체 기본값이며 설치 시 apply-models가 렌더링한다(`tests/test_claude_payload.py:17-23`가 고정). 그대로 둔다(Orchestrator 결정).
- Python 테스트는 `PYTHONDONTWRITEBYTECODE=1`로 실행한다. 테스트 뒤 git-ignored `__pycache__`가 생기면 보고한다.
- 커밋 메시지는 `type(scope): 한국어 설명` 형식이며, Orchestrator가 수락 후 커밋한다.
- 문서는 host 중립, 네 플랫폼 대칭.

---

### Task T1: 패키지 기본값 교체와 연결 산출물 갱신

**목표:** Claude, Codex, Gemini 패키지 기본값을 새 값으로 바꾸고, 이 값에 의존하는 프로필, 테스트, golden, MANIFEST를 한 커밋에서 함께 맞춘다(분리 불가).

**선행:** 없음. Orchestrator 기준선 기록이 먼저 있어야 한다.

**Files:**
- Modify: `claude/skill/models.toml:5-23`, `codex/skill/models.toml:5-23`
- Modify: `gemini/skill/models.toml:2` (주석), `:5-23` (모델)
- Modify: `gemini/agents/arc-{scouter,planner,implementer,qa,reviewer}.md:4` → `model: gemini-3.8-flash`
- Test 수정(기본값 의존):
  - `tests/node/models.test.mjs:13-14`: `defaults`를 새 Codex·Claude 값으로.
  - `tests/node/manifest.test.mjs:54`: `replace('gpt-6-luna',…)` → `replace('gpt-6.2-sol',…)`(그대로 두면 치환이 일어나지 않음).
  - `tests/node/tui-setup.test.mjs:61`: Claude installed 덮어쓰기 값 `'sonnet'` → `'opus'`(새 기본값과 같아져 구별 불가). Codex `'gpt-6-luna'`는 유지.
  - `tests/node/gemini-platform.test.mjs:198`: `'gemini-2.5-flash'` → `'gemini-3.8-flash'`.
  - `tests/node/tui-app.test.mjs:423`: Claude Scouter 기대값 갱신. model `'sonnet'`, effort는 새 기본값 `medium`에서 `left` 한 번 이동한 값(`lib/models/claude-models.json`의 sonnet effort 순서로 결정), `prepared[1]`은 `firstCode ? <그 값> : 'medium'`.
  - `tests/test_claude_payload.py:24-31`: `BALANCED_PRESET`을 새 Claude 기본값으로, 24행 주석을 "패키지 models.toml 기본값" 의미로 정정. `:243`의 `'model = "haiku"'` → `'model = "sonnet"'`.
  - `tests/test_codex_models.py:40-46`: `BALANCED_SETTINGS`를 새 Codex 기본값으로. `:339`의 `'model = "gpt-6-luna"'` → `'model = "gpt-6.2-sol"'`.
- 재생성:
  - installed-layout golden: `node tests/node/fixtures/installed-layout.mjs --write`
  - `MANIFEST.sha256`: `node scripts/update-manifest.mjs`(Gemini 프로필 포함, `models.toml`은 MUTABLE이라 목록 밖이 정상)
- 수정 금지(독립 fixture): `tests/node/models.test.mjs:72`, `tests/fixtures/models-{claude,codex}-v1.toml`, `tests/fixtures/qa-legacy-model-values.json`, `tests/node/fixtures/{role-bridge,watch}/*.jsonl`, `tests/node/tui-app.test.mjs:35,44,566`, `tests/node/gemini-platform.test.mjs:188,207-208,278`, `tests/test_claude_payload.py:17-23,204,213,260`, `tests/test_codex_models.py:32-38`, `role-observe`·`role-bridge-*`·`gemini-catalog-discover` 등의 모델 문자열, `claude/agents/*.md`.

**단계:**
- [ ] 1. 수정 전 `tests/test_claude_payload.py`·`tests/test_codex_models.py` 결과를 테스트 이름별로 기록한다. Orchestrator 확인: `test_claude_payload.ClaudePayloadTests.test_exact_roles_models_efforts_and_tools`는 기존 기준선 실패다. 이번 기대값 갱신으로 통과하게 되면 "기준선 실패 해소"로 따로 보고한다(범위 안, Orchestrator 결정).
- [ ] 2. 세 `models.toml`을 바꾼다. 키 이름(`effort`, `model_reasoning_effort`)과 `version = 3` 유지, Gemini 주석은 B-C7 문구.
- [ ] 3. Gemini 프로필 5개의 4행을 바꾼다.
- [ ] 4. 위 테스트 기대값을 갱신한다.
- [ ] 5. golden과 MANIFEST를 재생성하고 diff가 모델 값·해시 변경에만 한정되는지 확인한다.
- [ ] 6. Implementer 확인 항목:
  - (a) `tests/installer-parity.json`, `tests/node/fixtures/instruction-contracts.json`이 변경 파일의 해시나 내용을 담는지 확인. 담으면 해당 생성기로 갱신, 생성기가 없으면 hold로 보고.
  - (b) `tests/node/{upgrade-harness,host-gemini-grok,gemini-composite,gemini-capability-evidence,install-mode-review-followup}.test.mjs`와 `tests/{test_arc_policy.py,qa_model_cases.py}`가 패키지 기본값을 assert하는지 확인. assert하면 갱신하고 관련 테스트에 추가하며 이유를 보고.
  - (c) `tests/test_claude_payload.py:243`, `tests/test_codex_models.py:339`의 `source`가 패키지 `models.toml`에서 나오는지 확인.
  - (d) `grok/`·런타임 모듈 무변경 확인.
- [ ] 7. 아래 focused check 실행.

**기준:**
- 세 `models.toml`과 Gemini 프로필이 B-C1과 정확히 일치(B-C1, B-C7).
- 모든 쌍이 카탈로그에서 유효(B-C4): `models.test`, `gemini-platform.test:197`, `tui-setup` catalog 검사.
- 설치 설정이 패키지 기본값보다 우선(B-C3, B-C6): `tui-setup.test.mjs:60` 계열 통과, 로직 diff 0.
- golden과 MANIFEST 일관(B-C5).

**관련 테스트(이유):**
- `tests/node/models.test.mjs`: 기본값 표와 카탈로그 유효성 직접 검사.
- `tests/node/manifest.test.mjs`: MUTABLE 치환 대상 값과 MANIFEST.
- `tests/node/tui-setup.test.mjs`: Configure 초기값과 installed 우선 순서(B-C3).
- `tests/node/tui-app.test.mjs`: 패키지 `models.toml` 미리보기·Scouter 기대값.
- `tests/node/gemini-platform.test.mjs`: Gemini 기본값과 프로필 model.
- `tests/node/{preset,profile-render,platform-registry,plan,management-operations,gemini-capability-evidence}.test.mjs`: 패키지 `models.toml`을 직접 읽는 소비자.
- `tests/node/install-mode-n-platform.test.mjs`: 패키지 `models.toml`과 installed layout 소비(약 3~7분, 백그라운드 권장).
- `tests/node/installed-layout-golden.test.mjs`: 재생성한 golden 계약.
- `tests/test_claude_payload.py`, `tests/test_codex_models.py`, `tests/test_arc_policy.py`: apply-models 스크립트가 패키지 기본값을 읽음.
- 6(b)에서 기본값 의존으로 판정된 파일.
- check 4종: `node scripts/update-manifest.mjs --check`, `node scripts/update-role-policy.mjs --check`, `node scripts/check-installer-parity.mjs`, `node scripts/update-runtime-assets.mjs --check`.

**필수 QA와 증거(fresh QA):**
- 위 관련 테스트 실행, 실패를 테스트 이름별로 기준선과 대조(기준선 실패 해소 항목은 따로 표시).
- 세 `models.toml`과 Gemini 프로필 값을 B-C1 표와 하나씩 대조.
- 각 쌍이 `lib/models/*-models.json`에 존재하는지 확인.
- golden·MANIFEST diff 범위와 `lib/`·`shared/`·`grok/` 무변경 확인.

**Hold:** 6(a) 생성기 부재, 런타임 모듈 변경 필요, 기본값 외 로직 변경 필요.

**커밋(수락 후):** `feat(models): 추천 모델을 패키지 기본값으로 교체`

---

### Task T2: 역할 모델 그림 갱신

**목표:** `docs/images/role-models.svg`의 플랫폼별 "Default models and efforts" 카드 값과 title/desc 문구를 새 기본값에 맞춘다(B-C2).

**선행:** T1 수락.

**Files:**
- Modify: `docs/images/role-models.svg`(플랫폼 카드 값, 필요 시 title/desc)
- 확인만: `README.md` `Models and language` 절의 그림 링크(구 모델 문자열 없음, 수정 없을 예정)
- 조건부: `MANIFEST.sha256`(`docs/images`가 목록에 있을 때만 `node scripts/update-manifest.mjs`)

**단계:**
- [ ] 1. 카드 값을 B-C1 그대로(Claude, Codex, Gemini, Grok 순) 바꾸고 title/desc 정합 확인.
- [ ] 2. 텍스트 폭 확인(최장 `gpt-6.2-astra / xhigh`). 넘치면 기존 font-size·좌표 규칙 안에서만 조정.
- [ ] 3. 그림 내 구 기본값 문자열 잔존 0 확인(`haiku`, `gpt-6-luna`, `gpt-6.1-sol`, `gpt-6.1-terra`, `gemini-2.5-flash`), XML well-formed 확인(Node 파싱 또는 `xmllint --noout`).
- [ ] 4. `role-models.svg` 참조 테스트를 grep으로 찾고 있으면 실행.

**기준:** 카드 제목과 플랫폼별 값 20개가 B-C1과 일치, 텍스트 겹침·넘침 없음.

**관련 테스트(이유):** `role-models.svg` 참조 테스트(있다면), MANIFEST를 재생성했다면 `tests/node/manifest.test.mjs`와 `node scripts/update-manifest.mjs --check`.

**필수 QA와 증거:** QA가 값 20개를 B-C1과 대조, grep 잔존 0, XML 파싱 통과. 렌더링 이미지로 넘침 시각 확인(도구가 없으면 Orchestrator에게 시각 확인 요청).

**Hold:** 카드 레이아웃 재설계가 필요한 폭 초과.

**커밋(수락 후):** `docs(images): 역할 모델 그림을 새 기본값으로 갱신`

---

## 최종 검증 (두 task 수락 후 1회, Orchestrator 직접·백그라운드)
- **합집합:** T1·T2 관련 테스트 전체와 6(b)에서 추가된 파일.
- **계약 테스트 전체:** `tests/node/plan-level-records-contract.test.mjs`, `tests/node/run-mode-contract.test.mjs`, `tests/node/test-scope-contract.test.mjs`, `tests/node/manifest.test.mjs`, `tests/node/installed-layout-golden.test.mjs`, `tests/node/parity-check.test.mjs`, Python `tests/test_harness_contract.py`, `tests/test_arc_policy.py`.
- **check 4종:** `node scripts/update-manifest.mjs --check`, `node scripts/update-role-policy.mjs --check`, `node scripts/check-installer-parity.mjs`, `node scripts/update-runtime-assets.mjs --check`.
- **전체 회귀 판단(잠정): 실행.** 패키지 `<platform>/skill/models.toml`은 installer, upgrade, TUI Configure, Python apply-models, golden 생성기가 읽는 데이터이므로 trigger(1) 공용 모듈에 해당한다. trigger 2~4는 없다. 기준선은 base `68ef36c8` clean worktree에서 node 전체·Python 전체·check 4종으로 기록한다. 최종 결정은 Orchestrator가 실제 diff로 내린다.
- **최종 Reviewer:** 위험 ordinary. 필요 여부는 Orchestrator가 판단한다.

## 자체 점검
- [x] B-C1~B-C7이 task에 대응(C2는 T2, 나머지는 T1).
- [x] 설계의 "확인 필요" 항목 중 미확정 2개(Python `source` 출처, SVG 폭)는 확인 항목으로 명시.
- [x] 독립 fixture와 기본값 의존 항목 구분.
- [x] task별 ID·목표·파일·선행·기준·관련 테스트와 이유·QA 증거·hold, 최종 검증 합집합·계약·check·회귀 판단 기재.
- [x] Orchestrator 결정 반영: 기준선 실패 해소 별도 보고, Claude 프로필 유지, check 4종 명시.

## Revision history
| Version | Date | Change | Approval |
|---|---|---|---|
| v1 | 2026-11-21 | Planner 첫 완성본, Orchestrator가 결정 3건·최종 검증 목록 반영 | 사용자 승인 2026-11-21 |
