# 추천 모델 기본값 교체 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 네 플랫폼 패키지의 기본 역할 모델과 effort를 승인된 추천 값으로 바꾼다. 연결된 산출물(프로필, 테스트, golden, MANIFEST)과 `docs/images/role-models.svg` 그림도 새 값에 맞춘다.

**Architecture:** 기본값의 원본은 `<platform>/skill/models.toml`이다. 최초 설치 Configure 화면은 설치된 `settings.modelConfig`가 있으면 그것을, 없으면 패키지 `models.toml`을 보여 준다(`lib/tui/setup.mjs:18-24`). 업그레이드는 MUTABLE인 `models.toml`을 덮지 않는다(`lib/installer/manifest.mjs:12`, `lib/installer/plan.mjs:36,75-76`, `lib/installer/upgrade-state.mjs:32`). 따라서 설치·업그레이드 로직은 건드리지 않는다. v2에서 두 가지가 추가됐다(사용자 결정 2026-11-21). 하나는 Gemini 정적 카탈로그와 선택 규칙에 Gemini 4를 추가하는 것이고, 다른 하나는 Gemini CLI 버전 제한을 해제하는 것이다. 버전 제한은 `platform-registry.mjs`에 있는데, 이 파일은 cooperative runtime 모듈이다.

**Tech Stack:** Node.js (`node --test`), Python unittest (`PYTHONDONTWRITEBYTECODE=1`), TOML, SVG.

**Spec:** 별도 spec 없음. 승인된 짧은 설계는 `/Users/yunho/Desktop/project/arc/.git/arc/handoff/2026-11-21-final-verify-models-watch.md` "## B." 절과 설계 브리프 B-C1~B-C5다.

## Global Constraints
- 대상 worktree: `/Users/yunho/Desktop/project/arc/.claude/worktrees/recommended-default-models`, 브랜치 `feat/recommended-default-models`, base `68ef36c864f7dfe6fa1bebffc15906f2d95a16a7`.
- 새 기본값(B-C1):
  - Claude: Scouter sonnet/medium, Planner opus/xhigh, Implementer sonnet/high, QA sonnet/medium, Reviewer opus/high
  - Codex(`model_reasoning_effort`): Scouter gpt-6.2-sol/high, Planner gpt-6.2-astra/xhigh, Implementer gpt-6.2-sol/medium, QA gpt-6.2-sol/high, Reviewer gpt-6.2-astra/high
  - Gemini(v2, 사용자 결정 2026-11-21, 웹 조사 근거): Scouter·Implementer·QA gemini-4-hydrogen/default, Planner gemini-4-carbon/default, Reviewer gemini-4-neon/default. Gemini 4는 GA지만 실측하지 않았다(이 PC에서 live 불가). 기록은 '실측 미확인'으로 남긴다.
  - Grok: 전 역할 grok-4.6/default (변경 없음, `grok/` 파일은 수정하지 않음)
- B-C6: 기존 설치의 사용자 설정은 유지한다. 설치·업그레이드 로직은 바꾸지 않는다.
- B-C7: `gemini/skill/models.toml` 2행 주석을 `# Defaults are recommended pairs from the packaged catalog.`로 바꾼다.
- 모든 값은 `lib/models/*-models.json` 카탈로그의 유효 쌍이어야 한다(B-C4). v2부터는 `lib/models/gemini-models.json`에 Gemini 4 네 모델(`gemini-4-neon`, `gemini-4-hydrogen`, `gemini-4-carbon`, `gemini-4-argon`, effort `default`)을 맨 앞에 추가한다. 순서는 공개일 역순이다. 다른 카탈로그와 기존 항목은 바꾸지 않는다.
- B-C8(v2): Gemini 선택 규칙 `selectGeminiCatalogModels`(`lib/models/catalog-gemini.mjs:4`)는 기존 정규식을 유지한다. 여기에 Gemini 4 명시 목록 `^gemini-(\d+)-(neon|hydrogen|carbon|argon)$`을 추가로 허용한다. preview·experimental 접미사와 embedding 제외는 그대로 둔다.
- B-C9(v2): Gemini CLI 버전 제한을 해제한다. `lib/runtime/platform-registry.mjs:112`의 `supportedVersions`를 `null`로 바꾼다. 미러는 `node scripts/update-runtime-assets.mjs`로 만든다. 다른 플랫폼의 범위(Grok `>=1.0.0 <1.1.0`)는 그대로 둔다.
- B-C10(v2): Gemini live 계약(`tests/node/gemini-capability-evidence.test.mjs`)을 다음과 같이 바꾼다.
  - 역할 기본값 조건을 'LIVE_ACCEPTED에 속함'에서 '정적 카탈로그에 있고 LIVE_REJECTED가 아님'으로 완화한다.
  - 고정 버전 범위 단언을 `null`(제한 없음)로 바꾼다.
  - 그 밖의 불변식은 유지한다. 선택 규칙 통과 동일성, LIVE_REJECTED 미포함, verified capability 집합이 해당한다.
  - Gemini 4 기본값은 실측 미확인이라는 주석을 근거(웹 조사 2026-11-21)와 함께 남긴다.
- 런타임 모듈은 T2의 `platform-registry.mjs`(원본과 미러)만 바꾼다. `CATALOG_MODEL_ALIASES`(`lib/runtime/role-dispatch-policy.mjs:33`)는 기본값이 아니므로 그대로 둔다. runtime-versions의 `baselineHash`는 T2에서만 새 값으로 바꾼다. 선례 `ff53e784`처럼 `baselineHash`만 바꾸고 `previousRuntimeHash`·`historicalRuntimeHash`는 그대로 둔다.
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
- Modify: `gemini/agents/arc-{scouter,planner,implementer,qa,reviewer}.md:4` → 역할별 Gemini 4 값(Global Constraints)
- Modify(v2): `lib/models/gemini-models.json`(Gemini 4 네 항목을 맨 앞에), `lib/models/catalog-gemini.mjs:4`(B-C8)
- Test 수정(기본값 의존):
  - `tests/node/models.test.mjs:13-14`: `defaults`를 새 Codex·Claude 값으로.
  - `tests/node/manifest.test.mjs:54`: `replace('gpt-6-luna',…)` → `replace('gpt-6.2-sol',…)`(그대로 두면 치환이 일어나지 않음).
  - (v3) `tests/node/preset.test.mjs`: `install()`(:5)이 패키지 `models.toml`로 설치하므로, 설치 결과가 v1 `balanced`와 같다고 가정하는 기대값(:13,:15,:16,:21의 5건)을 새 패키지 기본값에 맞춘다. `selection()`이 v1 fixture를 읽는 부분은 독립 입력이므로 바꾸지 않는다.
  - (v3) `tests/node/tui-setup.test.mjs:368` `role editor Done updates the diagram draft and standalone prepare roles`: Scouter 시작 모델이 바뀌어도 원래 의도한 모델(`claude-fable-5-1`)을 고르도록 키 입력이나 기대값을 새 시작값 기준으로 다시 계산한다.
  - `tests/node/tui-setup.test.mjs:61`: Claude installed 덮어쓰기 값 `'sonnet'` → `'opus'`(새 기본값과 같아져 구별 불가). Codex `'gpt-6-luna'`는 유지.
  - `tests/node/gemini-platform.test.mjs` `L2 Gemini catalog order and role defaults match the live evidence selection`(:184-198): 카탈로그 11개 목록과 순서, 정규식 단언(B-C8), 역할별 기본값을 갱신한다. `static gemini catalog passes selectGeminiCatalogModels unchanged`(:177)는 그대로 통과해야 한다.
  - (v2) `tests/node/gemini-catalog-discover.test.mjs` `gemini discover selects text family GA models only`(:39-47): 입력의 `gemini-4-argon`이 결과에 포함되도록 바꾼다. `selectGeminiCatalogModels drops previews and dedupes`(:53)에 Gemini 4 네 ID 선택과 `gemini-4-neon-preview` 제외 단언을 추가한다.
  - (v2) `tests/node/gemini-capability-evidence.test.mjs`: B-C10의 역할 기본값과 카탈로그 부분을 반영한다. 버전 범위 부분은 T2에서 바꾼다. 바꿀 테스트는 다음과 같다.
    - `catalogModels`·`roleDefaults` 상수
    - `catalog rejects a role default outside live accepted, including a listed-only model`: '카탈로그 밖 또는 LIVE_REJECTED 기본값 거부'로 바꾼다.
    - `catalog rejects models changed or removed by model selection`: `gemini-3.8-flash` 사례를 검토한다.
    - `fixed contract accepts listed catalog models and all live-accepted role defaults`
  - `tests/node/tui-app.test.mjs:423`: Claude Scouter 기대값 갱신. model `'sonnet'`, effort는 새 기본값 `medium`에서 `left` 한 번 이동한 값(`lib/models/claude-models.json`의 sonnet effort 순서로 결정), `prepared[1]`은 `firstCode ? <그 값> : 'medium'`.
  - `tests/test_claude_payload.py:24-31`: `BALANCED_PRESET`을 새 Claude 기본값으로, 24행 주석을 "패키지 models.toml 기본값" 의미로 정정. `:243`은 v1 fixture(`tests/fixtures/models-claude-v1.toml`)를 읽으므로 고치지 않는다(v2 정정 (b)).
  - `tests/test_codex_models.py:40-46`: (v2 정정 (c)) 상수를 둘로 나눈다. 패키지 기본값용 새 상수(예: `PACKAGE_DEFAULT_SETTINGS`, 새 Codex 기본값)는 `:98`에서 쓴다. 기존 `BALANCED_SETTINGS`는 v1 fixture 값을 유지하고 `:136`(`test_custom_roundtrip_and_validation`, 기준선 실패)에서 그대로 쓴다. `:339`는 v1 fixture를 읽으므로 고치지 않는다(v2 정정 (b)).
  - (v2 정정 (a)) `tests/node/fixtures/instruction-contracts.json`: `protected`의 `claude/skill/models.toml`·`codex/skill/models.toml` 해시(:257, :271)와 `agentProfileBaseline.profiles`의 Gemini 프로필 5개 렌더링 해시(:311-315)만 새 값으로 바꾼다. 생성기가 없으므로 선례 `957feace`처럼 같은 커밋에서 실제 계산값을 넣는다. 계산은 `instruction-layout.test.mjs:143`과 `agent-fragments.test.mjs:34`의 방식(원본 sha256, `renderAgentProfile` 결과 sha256)을 따른다. 다른 키는 바꾸지 않는다.
- 재생성:
  - installed-layout golden: `node tests/node/fixtures/installed-layout.mjs --write`
  - `MANIFEST.sha256`: `node scripts/update-manifest.mjs`(Gemini 프로필 포함, `models.toml`은 MUTABLE이라 목록 밖이 정상)
- 수정 금지(독립 fixture): `tests/test_claude_payload.py:243`, `tests/test_codex_models.py:339`, `tests/node/models.test.mjs:72`, `tests/fixtures/models-{claude,codex}-v1.toml`, `tests/fixtures/qa-legacy-model-values.json`, `tests/node/fixtures/{role-bridge,watch}/*.jsonl`, `tests/node/tui-app.test.mjs:35,44,566`, `tests/node/gemini-platform.test.mjs:188,207-208,278`, `tests/test_claude_payload.py:17-23,204,213,260`, `tests/test_codex_models.py:32-38`, `role-observe`·`role-bridge-*`·`gemini-catalog-discover` 등의 모델 문자열, `claude/agents/*.md`.

**단계:**
- [x] 1. 수정 전 `tests/test_claude_payload.py`·`tests/test_codex_models.py` 결과를 테스트 이름별로 기록한다. Orchestrator 확인: `test_claude_payload.ClaudePayloadTests.test_exact_roles_models_efforts_and_tools`는 기존 기준선 실패다. 이번 기대값 갱신으로 통과하게 되면 "기준선 실패 해소"로 따로 보고한다(범위 안, Orchestrator 결정).
- [x] 2. 세 `models.toml`을 바꾼다. 키 이름(`effort`, `model_reasoning_effort`)과 `version = 3` 유지, Gemini 주석은 B-C7 문구.
- [x] 3. Gemini 프로필 5개의 4행을 바꾼다.
- [x] 4. 위 테스트 기대값을 갱신한다.
- [x] 5. golden과 MANIFEST를 재생성하고 diff가 모델 값·해시 변경에만 한정되는지 확인한다.
- [x] 6. Implementer 확인 항목:
  - (a) (v1에서 확인 완료) `instruction-contracts.json`은 위 정정 (a)로 갱신한다. `installer-parity.json`은 Gemini·기본값에 직접 고정된 값이 없다(Scouter 2026-11-21). 테스트로 다시 확인한다.
  - (b) `tests/node/{upgrade-harness,host-gemini-grok,gemini-composite,gemini-capability-evidence,install-mode-review-followup}.test.mjs`와 `tests/{test_arc_policy.py,qa_model_cases.py}`가 패키지 기본값을 assert하는지 확인. assert하면 갱신하고 관련 테스트에 추가하며 이유를 보고.
  - (c) `tests/test_claude_payload.py:243`, `tests/test_codex_models.py:339`의 `source`가 패키지 `models.toml`에서 나오는지 확인.
  - (d) `grok/`·런타임 모듈 무변경 확인(T1 범위에서는 `lib/runtime`·`shared/` 무변경).
- [x] 7. 아래 focused check 실행.

**기준:**
- 세 `models.toml`과 Gemini 프로필이 B-C1과 정확히 일치(B-C1, B-C7).
- 모든 쌍이 카탈로그에서 유효(B-C4): `models.test`, `gemini-platform.test:197`, `tui-setup` catalog 검사.
- 설치 설정이 패키지 기본값보다 우선(B-C3, B-C6): `tui-setup.test.mjs:60` 계열 통과, 로직 diff 0.
- golden과 MANIFEST 일관(B-C5).

**관련 테스트(이유):**
- `tests/node/models.test.mjs`: 기본값 표와 카탈로그 유효성 직접 검사.
- (v2) `tests/node/gemini-catalog-discover.test.mjs`, `tests/node/gemini-capability-evidence.test.mjs`: 선택 규칙·카탈로그·live 계약.
- (v2) `tests/node/instruction-layout.test.mjs`, `tests/node/agent-fragments.test.mjs`: `instruction-contracts.json` 해시 계약.
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

**Hold:** 런타임 모듈 변경 필요, 기본값·카탈로그·선택 규칙(B-C8) 외 로직 변경 필요, `instruction-contracts.json`에서 지정한 키 밖의 변경 필요.

**커밋(수락 후):** `feat(models): 추천 모델을 패키지 기본값으로 교체`

---

### Task T2 (v2 신규): Gemini CLI 버전 제한 해제

**목표:** B-C9와 B-C10의 버전 범위 부분을 구현한다. Gemini descriptor `cli.supportedVersions`를 `null`로 바꾸고, runtimeHash 고정값과 버전 범위를 단언하는 테스트를 새 계약에 맞춘다(분리할 수 없음).

**선행:** T1 수락.

**Files:**
- Modify: `lib/runtime/platform-registry.mjs:112`. 생성물 `shared/skill/runtime/platform-registry.mjs`는 `node scripts/update-runtime-assets.mjs`로 만든다.
- Test 수정:
  - `tests/node/gemini-platform.test.mjs` `Gemini registries agree …`(:23, :35): 기대값을 `supportedVersions: null`로 바꾼다.
  - `:328-344`의 `0.69.0` → `Gemini: Unsupported version` 기대: null에서는 CLI가 발견되면 `Gemini: Available (auth unverified)`가 되도록 바꾼다. 근거는 `lib/tui/mode.mjs:7-11`과 `lib/platforms/availability.mjs:57`이다.
  - `tests/node/gemini-capability-evidence.test.mjs`: `SUPPORTED`를 `null`로 바꾼다. `fixed contract rejects changed or missing supported-version ranges`(:77-80)는 '범위가 설정되면 거부(null만 허용)'로 바꾼다.
  - `tests/node/runtime-versions.test.mjs:11`: `baselineHash`만 새 runtimeHash로 바꾼다(선례 `ff53e784`). `:59`의 다른 상수와 다름 조건은 유지한다.
  - (v4) `tests/node/tui-app.test.mjs`, `tests/node/tui-setup.test.mjs`: Gemini `0.68.0`을 installed로 두던 fixture는 범위 밖 버전이라는 이유로 Gemini를 선택 대상에서 빼고 있었다. 이 fixture를 의존하던 새 실패 4건을 맞춘다.
    - 대상 테스트: `role draft is cleared after successful execution`, `role draft survives failed execution`, `catalog failure outside S does not block Apply; inside S blocks with catalog error`, `uninstalled initial platform uses role availability then display order fallback`
    - 각 테스트의 원래 의도는 그대로 둔다.
      - codex·claude만 대상으로 하던 테스트: 그 fixture에서 Gemini를 명시적으로 absent 또는 선택 불가로 둔다.
      - Gemini가 선택 대상이어야 하는 테스트: helper에 gemini 기본값과 카탈로그를 추가한다.
    - 단언을 삭제하거나 약화하지 않는다.
    - 제품 코드(`lib/tui/`, `lib/platforms/`)는 바꾸지 않는다.
- 재생성: installed-layout golden(16조합의 `platform-registry.mjs` 해시), `MANIFEST.sha256`.

**단계:**
- [x] 1. 테스트 기대값을 먼저 바꾸고 RED를 확인한다.
- [x] 2. registry를 바꾸고 미러를 생성한다. 그다음 golden과 MANIFEST를 생성한다.
- [x] 3. 새 runtimeHash를 `cooperativeVersions()`로 계산해 `baselineHash`에 반영하고 GREEN을 확인한다.
- [x] 4. `supportedVersions`를 직접 단언하는 다른 테스트(`grok-platform`, `grok-capability-evidence`, `platform-registry`, `platform-availability`)가 바뀌지 않고 통과하는지 확인한다.

**기준:** B-C9. Gemini는 버전과 무관하게 version 단계를 통과한다. CLI 미발견, capability, 인증, catalog 판단은 유지된다. Grok 범위는 그대로다. runtimeHash 계약은 새 baseline으로 통과한다.

**관련 테스트(이유):**
- `tests/node/gemini-platform.test.mjs`, `tests/node/gemini-capability-evidence.test.mjs`: 직접 단언.
- `tests/node/platform-availability.test.mjs`, `tests/node/platform-registry.test.mjs`: null 범용 동작과 registry.
- `tests/node/runtime-versions.test.mjs`: runtimeHash.
- `tests/node/runtime-assets.test.mjs`: 미러.
- `tests/node/role-routing-anchor.test.mjs`, `tests/node/host-gemini-grok.test.mjs`, `tests/node/gemini-composite.test.mjs`, `tests/node/tui-app.test.mjs`, `tests/node/tui-setup.test.mjs`: 계산된 runtimeHash, Gemini 버전 0.68.0 픽스처 소비자.
- `tests/node/installed-layout-golden.test.mjs`, `tests/node/manifest.test.mjs`.
- check 4종.

**필수 QA와 증거:** fresh QA가 위 테스트와 check 4종을 실행한다. `git diff`의 `lib/`·`shared/` 변경이 registry 한 줄과 미러뿐이고 Grok 범위가 바뀌지 않았음을 확인한다.

**Hold:** null 처리에 로직 변경이 필요한 경우, Gemini 외 플랫폼 범위 변경이 필요한 경우, runtime-versions의 다른 상수 이동이 필요한 경우, (v4) TUI fixture 조정만으로 원래 의도를 유지할 수 없는 경우.

**커밋(수락 후):** `feat(gemini): Gemini CLI 버전 제한 해제`

---

### Task T3: 역할 모델 그림 갱신

**목표:** `docs/images/role-models.svg`의 플랫폼별 "Default models and efforts" 카드 값과 title/desc 문구를 새 기본값에 맞춘다(B-C2).

**선행:** T1 수락(T2와 독립).

**Files:**
- Modify: `docs/images/role-models.svg`(플랫폼 카드 값, 필요 시 title/desc)
- 확인만: `README.md` `Models and language` 절의 그림 링크(구 모델 문자열 없음, 수정 없을 예정)
- 조건부: `MANIFEST.sha256`(`docs/images`가 목록에 있을 때만 `node scripts/update-manifest.mjs`)

**단계:**
- [x] 1. 카드 값을 B-C1 그대로(Claude, Codex, Gemini, Grok 순) 바꾸고 title/desc 정합 확인.
- [x] 2. 텍스트 폭 확인(최장 `gpt-6.2-astra / xhigh`). 넘치면 기존 font-size·좌표 규칙 안에서만 조정.
- [x] 3. 그림 내 구 기본값 문자열 잔존 0 확인(`haiku`, `gpt-6-luna`, `gpt-6.1-sol`, `gpt-6.1-terra`, `gemini-2.5-flash`), XML well-formed 확인(Node 파싱 또는 `xmllint --noout`).
- [x] 4. `role-models.svg` 참조 테스트를 grep으로 찾고 있으면 실행.

**기준:** 카드 제목과 플랫폼별 값 20개가 B-C1과 일치, 텍스트 겹침·넘침 없음.

**관련 테스트(이유):** `role-models.svg` 참조 테스트(있다면), MANIFEST를 재생성했다면 `tests/node/manifest.test.mjs`와 `node scripts/update-manifest.mjs --check`.

**필수 QA와 증거:** QA가 값 20개를 B-C1과 대조, grep 잔존 0, XML 파싱 통과. 렌더링 이미지로 넘침 시각 확인(도구가 없으면 Orchestrator에게 시각 확인 요청).

**Hold:** 카드 레이아웃 재설계가 필요한 폭 초과.

**커밋(수락 후):** `docs(images): 역할 모델 그림을 새 기본값으로 갱신`

---

## 최종 검증 (두 task 수락 후 1회, Orchestrator 직접·백그라운드)
- **합집합:** T1·T2·T3 관련 테스트 전체와 6(b)에서 추가된 파일.
- **계약 테스트 전체:** `tests/node/plan-level-records-contract.test.mjs`, `tests/node/run-mode-contract.test.mjs`, `tests/node/test-scope-contract.test.mjs`, `tests/node/manifest.test.mjs`, `tests/node/installed-layout-golden.test.mjs`, `tests/node/parity-check.test.mjs`, Python `tests/test_harness_contract.py`, `tests/test_arc_policy.py`.
- **check 4종:** `node scripts/update-manifest.mjs --check`, `node scripts/update-role-policy.mjs --check`, `node scripts/check-installer-parity.mjs`, `node scripts/update-runtime-assets.mjs --check`.
- **전체 회귀 판단(잠정): 실행.** T2는 cooperative runtime 모듈 `platform-registry.mjs`를 바꾸므로 trigger(1)에 해당한다. 또한 패키지 `<platform>/skill/models.toml`은 installer, upgrade, TUI Configure, Python apply-models, golden 생성기가 읽는 데이터이므로 trigger(1) 공용 모듈에 해당한다. trigger 2~4는 없다. 기준선은 base `68ef36c8` clean worktree에서 node 전체·Python 전체·check 4종으로 기록한다. 최종 결정은 Orchestrator가 실제 diff로 내린다.
- **최종 Reviewer:** v2부터 위험은 significant다. 근거는 cooperative runtime 변경, live 계약 완화, 실측되지 않은 기본값이다. 모든 task를 수락한 뒤 최종 Reviewer가 1회 검토한다.

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
| v2 | 2026-11-21 | T1 Implementer hold 후 정정 (a) instruction-contracts 수동 해시, (b) fixture 기반 치환 유지, (c) Codex 상수 분리. 사용자 결정에 따라 Gemini 기본값을 Gemini 4 역할별로 바꾸고 카탈로그·선택 규칙(B-C8)·live 계약(B-C10)을 반영. T2 신규 Gemini CLI 버전 제한 해제(B-C9), 기존 T2 → T3, 위험 significant와 최종 Reviewer | 사용자 승인 2026-11-21 |
| v3 | 2026-11-21 | T1 GREEN의 새 실패 6건 대응: `preset.test.mjs` 기본값 의존 기대값 갱신을 T1에 추가, `tui-setup.test.mjs:368` 키 입력 재계산 명시. 기준 불변 | 사용자 승인 2026-11-21 |
| v4 | 2026-11-21 | T2 Implementer hold 후: 버전 제한 해제로 Gemini `0.68.0` fixture가 선택 가능해져 생긴 TUI 새 실패 4건 대응으로 `tui-app`·`tui-setup` fixture 조정을 T2 범위에 추가. 제품 로직·기준 불변 | 사용자 승인 2026-11-21 |
