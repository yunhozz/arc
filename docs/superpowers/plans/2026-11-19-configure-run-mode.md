# Configure Run mode(Supervised / Full Auto) 토글·Settings 하위 메뉴 제거·Status 설정 표시 구현 계획

> **에이전트 작업자용:** ARC Orchestrator가 작업 단위로 조율한다. Implementer는 Codex bridge 자식이며 Git 변경 명령을 실행하지 않는다. 수용과 커밋은 Orchestrator가 한다. 진행은 체크박스(`- [ ]`)로 기록한다.

**Goal:** Configure 한 화면에서 Run mode·Language·subagent 한도 2종을 편집하고, Run mode를 설치 단위로 저장·보존·전달하며, Status에 `Installed on`과 설치 설정 4종을 표시한다.

**Architecture:** 저장 계약(`settings.toml` v1/v2, `lib/installer/language.mjs`)을 먼저 고정한다. 그다음 정책·문서 원본(role-policy 규칙, SKILL.md 정적 문장, planning.md 절, 재생성 managed 섹션), 설치 렌더링(SKILL.md marker 치환·managed block 줄), 보존 경로(operations·upgrade·status), TUI(Configure, Status), 사용자 문서 순으로 쌓는다. 에이전트 전달은 SKILL.md marker `{{ARC_RUN_MODE_POLICY}}`와 정적 규칙 `[approval.run-mode]`로 하며, 프로필은 모드별로 렌더링하지 않는다.

**Tech Stack:** Node.js ESM, `node:test`, 기존 `parseToml`(`lib/models/config.mjs`), `scripts/update-role-policy.mjs`, `scripts/update-runtime-assets.mjs`, `scripts/update-manifest.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-19-configure-run-mode-design.md` (v1, 2026-11-19 08:59 KST 승인, sha256 `b54c2e8fd7a882a8b3a7e83085a92af3c84d180172336369412b469d665acd9c`)

## Global Constraints

- 저장값 `run_mode = "supervised" | "full-auto"`, 화면 라벨 `Run mode`, 표시값 `Supervised` / `Full Auto`.
- supervised 설치의 `settings.toml`은 `version = 1\nlanguage = "<en|ko>"\n`로 현행과 바이트 동일. full-auto는 `version = 2\nlanguage = "<en|ko>"\nrun_mode = "full-auto"\n`. 줄바꿈 `\n`, 끝 개행 1개, BOM 없음.
- 기본값 `supervised`. 명시값 > 기존값 > `supervised`.
- 손으로 쓴 v2 `run_mode = "supervised"`는 받아들인다(spec Q2). serializer는 정규 형태만 출력한다.
- 설치 요약(summary)에 Run mode 줄을 넣지 않는다(spec Q3). CLI 플래그를 추가하지 않는다(D7).
- visual interpretation approval은 Full Auto에서도 user gate(spec Q1).
- 정책·SKILL.md·planning.md·managed block 영문은 spec 6.5·7.2·7.3·7.4·7.5·7.6과 바이트 동일하게 옮긴다.
- managed 섹션은 손으로 고치지 않고 `npm run update:role-policy`로만 재생성한다. `lib/policy/role-policy.json`을 바꾸면 `node scripts/update-runtime-assets.mjs`로 `shared/skill/runtime/role-policy.json` 사본을 동기화한다(현재 두 파일은 바이트 동일, `scripts/update-runtime-assets.mjs:20`).
- `tests/node/fixtures/installed-layout-golden.json`은 수정하지 않는다(v2). 기준선 a652279에서 `current installed layout matches the golden fixture for every combination`이 이미 실패하므로 갱신하면 무관한 기존 실패를 섞어 고치게 된다. 설치 바이트 회귀는 최종 검증 V2로 확인한다.
- `lib/**`, `README.md`, `scripts/**`, `shared/**`, `claude|codex|gemini|grok` payload를 바꾼 작업은 끝에 `node scripts/update-manifest.mjs`를 실행하고 `MANIFEST.sha256`을 같은 커밋에 넣는다(STD-CLOSE). `docs/**`는 manifest 대상이 아니다.
- 언어 기본값 동작(`buildInstallPlan`의 `language='en'`), plan depth, commit·QA·Reviewer·수락 흐름은 바꾸지 않는다.

## Review Focus

1. 손으로 쓴 v2 `run_mode = "supervised"`: 받아들이고 재설치하면 v1로 정규화(T1 parse, T3 재설치 v1 바이트).
2. composite 플랫폼별 run mode 상이: Configure `(mixed)`, 미변경 Apply 시 플랫폼별 기존값 유지(T4 operations, T5 `installPrepareOptions` 미전달).
3. Run mode 토글 후 Hosts 변경으로 plan 재계산 시 토글 값 유지(`setup.mjs:139` 재적용, T5).
4. full-auto 설치 upgrade(`skipGlobal:true` 경로의 managed block 별도 렌더링): `settings.toml`·SKILL.md 문단·managed block 줄 모두 유지(T4).
5. Status에서 installed + incomplete/absent 혼재: 설정 4행은 installed 플랫폼 값만으로 계산, `mixed` 오탐 없음(T6).

## STD-CLOSE (모든 코드 작업 공통 마무리)

1. 작업 focused 테스트 GREEN.
2. `lib/**`·`README.md`·`shared/**`·payload를 바꿨으면 `node scripts/update-manifest.mjs` 후 `npm run check:manifest` → `Protected payload manifest verified (N files)`.
3. Implementer가 변경 파일 목록, 테스트 출력, 수정한 기존 단언의 old→new를 보고.
4. Orchestrator가 호스트에서 `npm test`를 실행해 P0-a 기준선 대비 신규 실패 0 확인(의심 flake는 단독 재실행).
5. 필수 QA 후 Orchestrator 수용·focused 커밋.

## 사전 조건 (Orchestrator)

- P0-a: `feat/configure-run-mode` @ `74df988`에서 `npm test` 기준선 실패 목록과 python payload 테스트(`tests/test_claude_payload.py`) 실행 명령·결과를 기록.
- P0-b: 완료(2026-11-19, Orchestrator 직접 확인).
  - `shared/skill/runtime/role-policy.json`은 `lib/policy/role-policy.json`과 바이트 동일한 생성 사본이며 `scripts/update-runtime-assets.mjs`(`--check` 지원)가 생성한다. `lib/installer/manifest.mjs:49`가 필수 자산으로 요구한다 → T2 Files·Step에 포함.
  - `tests/node/fixtures/installed-layout-golden.json`은 16개 조합(`<platform>/<omit|write>/<en|ko>`)별 설치 파일 sha256을 담고 `tests/node/installed-layout-golden.test.mjs`가 검사한다(갱신 스크립트 없음) → T2·T3 Files에 포함.
  - 테스트에 `Invalid language settings schema or version` 단언 없음(grep 0건) → T1 조건부 항목 제거.

## 의존성과 실행 순서

| 작업 | 제목 | 선행 |
|---|---|---|
| T1 | settings.toml v2와 Run mode 저장·렌더 API | P0-a |
| T2 | `[approval.run-mode]` 규칙, SKILL.md 정적 문장, planning.md Full Auto 절, managed·runtime 사본 재생성 | T1 커밋(manifest 직렬) |
| T3 | SKILL.md marker 치환, 설치 계획 runMode 전파, managed block 줄, fragment 금지 regex | T1, T2 |
| T4 | composite·upgrade·status의 runMode 보존 | T3 |
| T5 | Configure 한 화면 편집(Settings 하위 메뉴 제거) | T4 |
| T6 | Status `Installed on`과 설치 설정 4행 | T5 (같은 테스트 파일 `tui-app.test.mjs`) |
| T7 | README·`docs/harness-operation.md` | T5, T6 |
| FR | 최종 독립 Reviewer 1회 | T1–T7 수용, 필수 QA·재확인 완료 |

공유 자원과 동시 실행 금지:
- `MANIFEST.sha256`을 T1–T7 모두 갱신하므로 전부 직렬. T1과 T2는 논리 독립이지만 manifest 때문에 동시 진행하지 않는다.
- 같은 파일을 여러 작업이 순서대로 고친다: `*/skill/SKILL.md`(T2 정적 문장·managed, T3 marker), `tests/node/fixtures/instruction-contracts.json`(T2 문장, T3 marker), `tests/node/upgrade-harness.test.mjs`(T3 fixture marker, T4 보존 시나리오), `tests/node/tui-app.test.mjs`(T5 Settings, T6 Mode), `tests/node/run-mode-contract.test.mjs`(T2 생성, T3 추가).
- managed 섹션은 T2만 재생성한다. 이후 작업은 role-policy를 바꾸지 않되 각 작업 끝에 `npm run check:role-policy` 통과를 확인한다.

---

### Task T1: settings.toml v2와 Run mode 저장·렌더 API

**목표:** spec 3.1·3.2·7.1·7.2의 저장·렌더 API를 `language.mjs`에 추가한다. 기존 호출부는 바꾸지 않는다.

**Files:**
- Modify: `lib/installer/language.mjs` (기존 export 유지, 신규 export 추가)
- Test: `tests/node/language.test.mjs` (기존 9–15행 유지, 신규 추가)
- Modify: `MANIFEST.sha256`

**Interfaces (Produces):**
- `RUN_MODES = Object.freeze(['supervised','full-auto'])`
- `validateRunMode(value)` → 목록 밖이면 `Error('Invalid run mode: <value>')`
- `parseSettings(bytes) -> {version:1|2, language, runMode}`
- `serializeSettings({language, runMode='supervised'}) -> Buffer`
- `parseLanguage(bytes) -> {version:1|2, language}`(wrapper), `serializeLanguage(language)` = `serializeSettings({language})`
- `runModePolicy(runMode) -> string`(spec 7.2 문단 바이트 그대로), `renderRunModePolicy(bytes, runMode) -> Buffer`(marker `{{ARC_RUN_MODE_POLICY}}`)

- [x] **Step 1: 실패 테스트 작성** (`tests/node/language.test.mjs`)
  - `settings serialize v1 bytes unchanged`: `['en','ko']`마다 `serializeSettings({language})`, `serializeSettings({language,runMode:'supervised'})`, `serializeLanguage(language)`가 모두 `Buffer.from('version = 1\nlanguage = "'+language+'"\n')`와 `equals` (AC-S1).
  - `settings serialize full-auto v2`: `serializeSettings({language:'ko',runMode:'full-auto'})`가 `'version = 2\nlanguage = "ko"\nrun_mode = "full-auto"\n'`와 바이트 동일, `parseSettings`로 `{version:2,language:'ko',runMode:'full-auto'}` 복원 (AC-S2).
  - `settings parse v1`: `{version:1,language:'en',runMode:'supervised'}`.
  - `settings parse v2 supervised accepted`(Q2): `{version:2,language:'en',runMode:'supervised'}`.
  - `settings rejects`(AC-S3): v1+`run_mode = "full-auto"`, v2 run_mode 없음, v1+`extra = 1`, `version = 3`+세 키 → `/Invalid ARC settings schema or version/`; v2 `run_mode = "auto"` → `/Invalid run mode: auto/`; 문자열 입력·`Buffer.from([0xff,0xfe])` → throw(메시지 미검사).
  - `parseLanguage wrapper`(AC-S4): v1 → `{version:1,language:'en'}`, v2(full-auto, ko) → `{version:2,language:'ko'}`.
  - `renderRunModePolicy`: `Buffer.from('a\n{{ARC_RUN_MODE_POLICY}}\nb')`에서 supervised/full-auto 결과가 `'a\n'+<spec 7.2 문장>+'\nb'`, marker 미잔존; marker 0개·2개 → `/Expected exactly one ARC run mode policy marker/`; `runMode:'x'` → `/Invalid run mode/` (AC-P4 단위).
- [x] **Step 2: 실패 확인.** `node --test tests/node/language.test.mjs` FAIL.
- [x] **Step 3: 구현.** 기존 디코딩(`TextDecoder('utf-8',{fatal:true,ignoreBOM:true})`)과 `parseToml` 재사용, 비Buffer 메시지는 기존 `'Language settings must be bytes'` 유지. 키 집합: v1 정확히 `{version,language}`·version `1`/`1n`, v2 정확히 `{version,language,run_mode}`·version `2`/`2n`, 그 외 `Invalid ARC settings schema or version`. `renderRunModePolicy`는 `renderLanguagePolicy`와 같은 형태로 치환 전에 `validateRunMode`. `defaultLanguage`·`languagePolicy`·`renderLanguagePolicy` 불변.
- [x] **Step 4: GREEN.** `node --test tests/node/language.test.mjs tests/node/plan.test.mjs tests/node/management-status.test.mjs tests/node/upgrade-state.test.mjs`
- [x] **Step 5: STD-CLOSE.** 커밋 예: `feat(installer): settings.toml v2 run_mode 저장 API`

**Criteria:** AC-S1–S4, AC-P4(단위). **필수 QA:** fresh QA(spec 3.2 거부 사례·7.2 문장 바이트 독립 대조). **Holds:** 없음.

---

### Task T2: `[approval.run-mode]` 규칙·SKILL.md 정적 문장·planning.md Full Auto 절·재생성

**목표:** spec 7.3–7.6의 모드 무관 정적 텍스트와 정책 규칙을 원본에 넣고 생성물을 재생성한다. 정책 JSON·projection·필수 목록·생성 산출물·runtime 사본·fixture는 분리 불가 계약이므로 한 작업으로 묶는다.

**Files:**
- Modify: `lib/policy/role-policy.json` — `"id": "external.explicit-user-authority"` 규칙 객체 닫는 `}` 바로 뒤에 spec 7.5 객체 삽입.
- Modify: `lib/policy/placement.mjs:4`(`core`, `'external.explicit-user-authority'` 뒤), `:6`(`planning`, 끝)에 `'approval.run-mode'`.
- Modify: `lib/policy/render.mjs:23` 필수 ID 배열 `'external.explicit-user-authority'` 뒤에 `'approval.run-mode'`. (확인: `render.mjs:11,20` `strings()`는 비어 있지 않고 중복 없는 문자열 배열만 요구 → 신규 `operations`/`evidence` 값 통과. `controls`는 4개 플랫폼 키와 일치.)
- Modify: `lib/prompts/agent-fragments.json:14` — Explicit choice 문장을 spec 7.4 문장으로(JSON escape 유지).
- Modify(정적 문장, 4개): `claude/skill/SKILL.md`, `codex/skill/SKILL.md`, `gemini/skill/SKILL.md`, `grok/skill/SKILL.md`
  - Execution-target gate(claude 10행): `record explicit user target choice` → `record explicit user target choice (or a Full Auto auto-decision under the Run mode policy)`
  - Pre-action gate record(claude 16행): `` `mode` (standalone, or composite with routing revision), `` 바로 뒤에 `` `run` (Run mode in effect: `supervised` or `full-auto`), `` 삽입
  - Explicit choice(claude 30행): spec 7.3 문장으로 교체
  - 다른 플랫폼은 행 번호 대신 문장 텍스트로 위치를 찾는다.
- Modify: 4개 `*/skill/references/planning.md` — 파일 끝(마지막 절 `## Approved cooperative execution path within the repository` 뒤) 빈 줄 1개 후 spec 7.6 블록, 끝 개행 1개.
- 재생성(손 편집 금지): `npm run update:role-policy` → SKILL.md 4 + planning.md 4 + 프로필 20(`claude/agents/arc-*.md`, `codex/agents/arc-*.toml`, `gemini/agents/arc-*.md`, `grok/agents/arc-*.md`). 다른 references는 바뀌지 않아야 한다.
- 재생성: `node scripts/update-runtime-assets.mjs` → `shared/skill/runtime/role-policy.json`(다른 runtime 출력이 바뀌면 hold).
- Modify: `tests/node/fixtures/instruction-contracts.json` — 바뀐 SKILL.md 문장을 담은 항목(최소 14·126행 Execution-target gate, 33·145행 Explicit choice, Pre-action 문장 항목).
- Modify(v2, probe로 확인한 기존 단언): `tests/node/grok-platform.test.mjs`(204행 규칙 수 15→16), `tests/node/composite-instructions.test.mjs`(27행 Pre-action gate record 승인 문장에 `run` 필드 반영), `tests/node/agent-fragments.test.mjs`(19행 fragment 원본 sha256 기대값).
- Create: `tests/node/run-mode-contract.test.mjs`
- Modify: `tests/node/role-policy.test.mjs`
- 조건부(실행 결과 실패 시에만, Orchestrator 승인 후 추가): `tests/node/hardcoding-residual.test.mjs`, `tests/test_claude_payload.py`
- Modify: `MANIFEST.sha256`

**Interfaces (Produces):** 규칙 ID `approval.run-mode`, 앵커 `references/planning.md#full-auto-run-mode`(T3 문단이 링크).

- [x] **Step 1: 실패 테스트 작성**
  - `role-policy.test.mjs`: `approval.run-mode is required`(사본에서 제거 시 `validateRolePolicy`가 `/missing required rule approval\.run-mode/` throw — 실제 메시지 형식은 기존 테스트에 맞춤), `approval.run-mode projections`(`POLICY_PROJECTIONS.core`·`.planning` 포함), `approval.run-mode order`(index = `external.explicit-user-authority` + 1), `renderPolicySection(defaultRolePolicy,{platform:'claude',audience:'qa'})`에 `- [approval.run-mode] ` 줄 (AC-G1).
  - `run-mode-contract.test.mjs`: 4개 SKILL.md가 spec 7.3 세 문자열을 각 정확히 1회 포함; planning.md가 `<a id="full-auto-run-mode"></a>\n## Full Auto run mode\n`을 1회 포함하고 spec 7.6 블록으로 끝남; `agent-fragments.json`의 fragment 하나가 spec 7.4 문장 포함 (AC-G3 정적 부분).
- [x] **Step 2: 실패 확인.** `node --test tests/node/role-policy.test.mjs tests/node/run-mode-contract.test.mjs` FAIL.
- [x] **Step 3: 원본 편집.** role-policy.json → placement.mjs → render.mjs → agent-fragments.json → SKILL.md 4개 → planning.md 4개.
- [x] **Step 4: 재생성.** `npm run update:role-policy` → `Updated role policy (28 targets)`(수가 다르면 보고·hold), `npm run check:role-policy` → verified, `node scripts/update-runtime-assets.mjs` 후 `node scripts/update-runtime-assets.mjs --check` → verified, `grep -c 'id="visual-evidence-and-adjudication"' {claude,codex,gemini,grok}/skill/references/verification.md` 각 1.
- [x] **Step 5: GREEN.** `node --test tests/node/role-policy.test.mjs tests/node/run-mode-contract.test.mjs tests/node/instruction-language.test.mjs tests/node/grok-platform.test.mjs tests/node/composite-instructions.test.mjs tests/node/agent-fragments.test.mjs tests/node/manifest.test.mjs tests/node/hardcoding-residual.test.mjs tests/node/gemini-install.test.mjs tests/node/grok-install.test.mjs` + python payload 테스트(P0-a 명령).
- [x] **Step 6: STD-CLOSE.** 커밋 예: `feat(policy): approval.run-mode 규칙과 Full Auto gate 문서`

**Criteria:** AC-G1, AC-G2, AC-G3(정적 부분), AC-R1 "달라지는 파일" 범위. **필수 QA:** fresh QA(spec 7.3–7.6 영문 바이트 대조, 재생성 산출물 28개 + runtime 사본 + 지정 테스트·fixture 외 변경 없음, 다른 references 불변). **Holds:** T1 커밋 전 착수 금지.

---

### Task T3: SKILL.md marker 치환·설치 계획 runMode 전파·managed block 줄·fragment 금지 regex

**목표:** 설치 시 SKILL.md Run mode 문단, `settings.toml` v1/v2, managed block full-auto 줄을 쓰고 기존 runMode를 보존한다. marker 삽입과 렌더 호출을 같은 작업에 넣어 payload가 깨지는 중간 상태를 없앤다.

**Files:**
- Modify: 4개 `*/skill/SKILL.md` — `{{ARC_OUTPUT_LANGUAGE_POLICY}}` 줄(claude 8행) 다음 빈 줄 뒤 `{{ARC_RUN_MODE_POLICY}}` 단독 줄 + 빈 줄 1개.
- Modify: `lib/installer/plan.mjs` — 6행 import(`parseSettings`, `serializeSettings`, `renderRunModePolicy`, `validateRunMode`), 18–23 `previewLanguage`, 33–37 `renderSkillPayload`, 38·48 `renderNativeChanges`, 65–89 `buildInstallPlan`.
- Modify: `lib/installer/global-config.mjs:42-43` `agentsBlockBody`.
- Modify: `lib/prompts/render.mjs:145` 정규식 → `/ARC_AGENT_FRAGMENT|ARC_OUTPUT_LANGUAGE_POLICY|ARC_RUN_MODE_POLICY|\[ARC role policy: contract (?:begin|end)\]/`.
- Modify(fixture marker, 없으면 throw): `tests/node/plan.test.mjs:7`, `tests/node/upgrade-harness.test.mjs:6,17`, `tests/node/fixtures/instruction-contracts.json:14,126`.
- Modify: `tests/node/gemini-install.test.mjs:46`, `tests/node/grok-install.test.mjs:52` — `doesNotMatch` 정규식에 `|ARC_RUN_MODE_POLICY`.
- Modify: `tests/node/plan.test.mjs`(신규 테스트), `tests/node/run-mode-contract.test.mjs`(추가)
- Modify: `MANIFEST.sha256`

**Interfaces:**
- Consumes (T1): `parseSettings`, `serializeSettings`, `renderRunModePolicy`, `validateRunMode`
- Produces:
  - `previewLanguage({target,safeFs}) -> {existing, existingRunMode: 'supervised'|'full-auto'|null, snapshot}`, 오류 접두어 `Invalid ARC language settings:` 유지
  - `buildInstallPlan({..., runMode})`(기본 인자 없음): 실효값 `runMode!==undefined ? validateRunMode(runMode) : languageState.existingRunMode ?? 'supervised'`, plan에 `runMode` 필드, summary 불변
  - `agentsBlockBody(home,userHome,language='en',platform='codex',runMode='supervised')`: `validateRunMode` 후 full-auto일 때만 기존 문자열 끝에 spec 6.5 줄 + `'\n'`
  - `renderSkillPayload({...,runMode})`: `SKILL.md = renderRunModePolicy(renderLanguagePolicy(src,language),runMode)`, `settings.toml = serializeSettings({language,runMode})`
  - `renderNativeChanges({...,runMode})` → `agentsBlockBody(home,target.userHome,language,target.platform,runMode)`

- [x] **Step 1: 실패 테스트 작성**
  - `plan.test.mjs`: `runMode default supervised bytes`(파일 없음·미지정 → `plan.runMode==='supervised'`, `settings.toml` v1 en, SKILL.md에 spec 7.2 Supervised 문장·marker 없음, instruction 파일 globalChange가 `renderManagedBlock(null, agentsBlockBody(home,userHome,'en',platform))`와 바이트 동일 — AC-R1, AC-P5); `runMode preserves existing full-auto`(AC-P1); `runMode v1 existing stays supervised`; `runMode explicit overrides`; `runMode v2 supervised normalizes`(Review Focus 1, 결과 v1 바이트); `runMode invalid rejected`(`/Invalid run mode/`); `summary unchanged`(supervised/full-auto summary deepEqual, Q3).
  - `run-mode-contract.test.mjs`: `agentsBlockBody full-auto line`(full-auto = supervised + spec 6.5 줄 + `\n`, supervised = 4인자 호출 — AC-P5); `fragment marker rejected`(fragment text에 `' {{ARC_RUN_MODE_POLICY}}'`를 붙인 복제본은 `validateAgentRegistry`가 throw, 원본은 통과 — AC-P6); `SKILL.md marker exactly once`(4개, language marker 줄 다음 빈 줄 뒤 — AC-G3).
- [x] **Step 2: 실패 확인.** `node --test tests/node/plan.test.mjs tests/node/run-mode-contract.test.mjs` FAIL.
- [x] **Step 3: 구현.** `languageState`(68행 뒤)에서 실효 runMode를 정하고 `renderSkillPayload`(75행)·`renderNativeChanges`(83행)에 전달, 89행 plan 객체에 `runMode`.
- [x] **Step 4: GREEN.** `node --test tests/node/plan.test.mjs tests/node/run-mode-contract.test.mjs tests/node/language.test.mjs tests/node/upgrade-harness.test.mjs tests/node/gemini-install.test.mjs tests/node/grok-install.test.mjs tests/node/instruction-language.test.mjs tests/node/install.test.mjs tests/node/install-mode-models-upgrade.test.mjs` + `npm run check:role-policy`.
- [x] **Step 5: STD-CLOSE.** 커밋 예: `feat(installer): Run mode 정책 문단 렌더링과 설치 계획 전파`

**Criteria:** AC-P1, AC-P4(통합), AC-P5, AC-P6, AC-G3(marker), AC-R1(단위 고정). **필수 QA:** fresh QA(실제 payload로 4개 플랫폼 supervised·full-auto plan의 SKILL.md·`settings.toml`·managed block 바이트, 프로필에 marker·문단 없음). **Holds:** T1·T2 커밋 전 착수 금지.

---

### Task T4: composite·upgrade·status의 runMode 보존

**목표:** spec 6.3·6.4·5(데이터)에 따라 composite 설치, upgrade, `collectStatus`가 runMode를 읽고 보존·노출한다.

**Files:**
- Modify: `lib/management/operations.mjs` — import `parseLanguage` → `parseSettings`(다른 사용처 있으면 유지); 53행 standalone에 `runMode:options.runMode`; 98–100행 composite `const parsed=languageFile.exists?parseSettings(languageFile.bytes):null`, `language=options.settings?.language??parsed?.language??'en'`, `runMode=options.settings?.runMode??parsed?.runMode??'supervised'`, `buildInstallPlan`에 `runMode`; preset 경로(104–108) 불변.
- Modify: `lib/installer/upgrade-state.mjs` — 7행 import `parseSettings`; 27행 `const parsed=parseSettings(mandatory('settings.toml'));language=parsed.language;runMode=parsed.runMode;`(`let`에 `runMode`); 34행 entry에 `runMode`; 36행 stateToken 불변.
- Modify: `lib/installer/upgrade.mjs` — 15행 구조분해 `runMode`, 16행 `buildInstallPlan`에 `runMode`, 19행 `agentsBlockBody(target.home,target.userHome,language,target.platform,runMode)`.
- Modify: `lib/management/status.mjs` — 5행 import `parseSettings`, 17행 `settings`의 `language`·`runMode`를 한 번의 `parseSettings(mandatory('settings.toml'))`로.
- Test: `tests/node/management-operations.test.mjs`, `tests/node/upgrade-state.test.mjs`, `tests/node/upgrade-harness.test.mjs`, `tests/node/management-status.test.mjs`
- Modify: `MANIFEST.sha256`

**Interfaces:** Consumes (T3) `buildInstallPlan({...,runMode})`, `agentsBlockBody(...,runMode)`, (T1) `parseSettings`. Produces `status.settings.runMode`, `collectInstalledState().targets[i].runMode`, prepare options 계약(standalone `options.runMode`, composite `options.settings.runMode` — T5가 생성).

- [x] **Step 1: 실패 테스트 작성**
  - `management-operations.test.mjs`: `composite preserves per-platform runMode`(두 home에 v2 full-auto·v1, `options.settings`에 runMode 없음 → plan runMode `['full-auto','supervised']`, 각 `settings.toml` 바이트 — AC-P2, Review Focus 2); `composite explicit runMode applies to all`; `standalone passes runMode`(명시 full-auto, 미지정+기존 v2 → full-auto).
  - `upgrade-state.test.mjs`: v2 full-auto → target entry `runMode:'full-auto'`, v1 → `'supervised'`.
  - `upgrade-harness.test.mjs` `upgrade preserves full-auto`(AC-P3, Review Focus 4): `settings.toml` v2, SKILL.md Full Auto 문장, managed block 마지막 bullet이 spec 6.5 줄.
  - `management-status.test.mjs`: status `settings.runMode` full-auto/supervised (AC-T3).
- [x] **Step 2: 실패 확인.** 위 4개 파일 FAIL.
- [x] **Step 3: 구현.**
- [x] **Step 4: GREEN.** 위 4개 + `node --test tests/node/install-mode*.test.mjs`.
- [x] **Step 5: STD-CLOSE.** 커밋 예: `feat(management): composite·upgrade·status Run mode 보존`

**Criteria:** AC-P2, AC-P3, AC-T3. **필수 QA:** fresh QA(composite 혼합 보존, upgrade 3요소 보존 독립 재현). **Holds:** T3 커밋 전 착수 금지.

---

### Task T5: Configure 한 화면 편집 (Settings 하위 메뉴 제거)

**목표:** spec 4.1·4.2의 Configure control 행·순환·한도 입력·rowKinds·prepare 전달을 구현하고 `editInstallSettings`·`languageLabel`을 삭제한다.

**Files:**
- Modify: `lib/tui/setup.mjs` — 15행 `languageLabel` 삭제, 모듈 내부 `runModeName`(`full-auto`→`Full Auto`, 그 외 `Supervised`)·`languageName`(`ko`→`Korean`, 그 외 `English`); 23행 `installSettingKeys`; 27–34 `installSettingsDraft`(`runMode:settings?.runMode??'supervised'`, first 기본값 포함); 36–49 `installPrepareOptions`(키 루프로 자동 반영); 51–69 `editInstallSettings` 삭제(export 포함); 152 `controls` 7개; 153–164 `ui.menu`에 `onHorizontal`; 162 rowKinds를 controls 기반 식으로; 173–188 choice 분기(5 hosts, 6 runMode 순환, 7 language 순환, 8·9 한도, 10 Apply — 기존 7 분기 본문 이전).
- Test: `tests/node/tui-setup.test.mjs`(78–97, 115, 138–168, 200, 261행 재작성 + 신규), `tests/node/tui-terminal.test.mjs`(37–153행 `'Settings'`), `tests/node/tui-app.test.mjs`(377, 386, 390, 521행 `'Settings'`)
- Modify(v3): `tests/node/tui-app-pty.test.mjs`(`'Settings'`·`KR` 참조가 있는 PTY 시나리오)
- 조건부(실패 시에만): `tests/node/tui-render.test.mjs`(30, 41, 261 `KR`), `tests/node/hardcoding-residual.test.mjs`, `tests/node/capability-surfaces.test.mjs`(v3, `runInstallFlow` renderBody 사용)
- Modify: `MANIFEST.sha256`

**Interfaces:** 행 텍스트 라벨 22칸 패딩: `'Run mode              '+v`, `'Language              '+v`, `'Total subagents       '+v`, `'Concurrent subagents  '+v`. v는 mixed·미touched면 `(mixed)`, 그 외 이름/`String(value)`, 6·7행은 `arrowValue(name,state.frame,state.selected===6|7)`. 한도 입력 `ui.text('Total subagents'|'Concurrent subagents', raw)`, 오류 `ui.page('Invalid limit',['Enter a positive whole number.'])`.

- [x] **Step 1: 실패 테스트 작성** (`tui-setup.test.mjs`, 기존 fake `ui` 헬퍼)
  - `configure rows order`(AC-U1, AC-U7): 항목 `[...5 roles,'Hosts: …','Run mode              Supervised','Language              English','Total subagents       100','Concurrent subagents  5','Apply - <modeLabel>']`, `'Settings'` 없음, `editInstallSettings` export 없음.
  - `configure cycles run mode and language`(AC-U2): `onHorizontal({selected:6})` 후 `Full Auto`·`touched.has('runMode')`; choice 6 Enter도 순환하고 다음 menu `selected===6`; 7에서 `Korean`↔`English`; mixed·미touched `(mixed)`.
  - `configure limit input`(AC-U3): choice 8 → `ui.text('Total subagents','100')`, `'0'` → `Invalid limit` 후 재입력, `'7'` → 7 + touched; mixed면 초기 `''`; `null` → 불변; choice 9 → `'Concurrent subagents'` + `concurrentSelected` 전달.
  - `configure rowKinds`(AC-U4): control 구간 `[undefined×5,'confirm','cancel']`.
  - `configure compact/guard boundary`(AC-U5): 기존 경계 단언을 controls 7행 기준으로(기존 경계값 +3), 경계 직전·직후 rows 값을 정확한 숫자로 고정, old→new 보고.
  - `installPrepareOptions runMode`(AC-U6): standalone 비mixed → `runMode:'supervised'`; composite mixed·미touched → `settings`에 `runMode` 키 없음; touched → 존재.
  - `touched runMode survives host change`(Review Focus 3).
  - `installSettingsDraft`: status settings에 runMode 없으면 `'supervised'`, 플랫폼 간 상이 → `mixed.has('runMode')`.
- [x] **Step 2: 실패 확인.** `node --test tests/node/tui-setup.test.mjs` FAIL.
- [x] **Step 3: 구현.** controls 행은 깜빡임 때문에 `state`를 받는 함수로 렌더 시점에 생성. menu 항목 `[...installRoleNames,...controls.slice(0,-1)]`. rowKinds `[...diagramBody.map(()=>undefined),...controls.map((_,i)=>i===controls.length-2?'confirm':i===controls.length-1?'cancel':undefined)]`. `footerRows` 식·160행 선택 매핑·161행 offset 식·`refreshMs:600` 유지. 한도 입력 루프는 삭제된 62–66행 동작 그대로.
- [x] **Step 4: GREEN.** `node --test tests/node/tui-setup.test.mjs tests/node/tui-terminal.test.mjs tests/node/tui-app.test.mjs tests/node/tui-render.test.mjs tests/node/tui-custom-preset.test.mjs tests/node/hardcoding-residual.test.mjs`
- [x] **Step 5: STD-CLOSE.** 커밋 예: `feat(tui): Configure 한 화면에서 Run mode·Language·한도 편집`

**Criteria:** AC-U1–U7. **필수 QA:** fresh QA(행·인덱스·rowKinds·경계값 독립 대조, 기존 단언 old→new 분류, Orchestrator 제공 호스트 PTY 출력 확인). **Holds:** T4 커밋 전 착수 금지.

---

### Task T6: Status `Installed on`과 설치 설정 4행

**목표:** spec 5에 따라 `statusInfo` 첫 행 라벨·설정 4행·`mixed`·라벨 폭·infoTones를 구현한다. `lib/tui/app.mjs`는 바꾸지 않는다(`app.mjs:136`이 statuses를 그대로 넘김).

**Files:**
- Modify: `lib/tui/mode.mjs:47-56`(`statusInfo` 앞부분). 62행 이후 플랫폼 행·Version·Notes 로직 불변.
- Test: `tests/node/tui-app.test.mjs`(`'Mode` 단언 206, 219, 367–378, 468–521, 562, 687–691행), `tests/node/tui-custom-preset.test.mjs`(`'Mode`)
- 조건부(실패 시에만): `tests/node/tui-app-pty.test.mjs`
- Modify: `MANIFEST.sha256`

**Interfaces:** Consumes (T4) `status.settings.{runMode,language,limits.max_total_subagents,limits.max_concurrent_subagents}`. `statusInfo(...) -> {info, infoTones}` 형태 유지: `info[0] = row('Installed on', homeModeLine(...))`, installed settings가 있으면 `Run mode`·`Language`·`Total subagents`·`Concurrent subagents` 4행, 이어 `''`; 해당 infoTones `undefined`; `labelWidth = max(width('Installed on'), 설정 라벨(행이 있을 때), Version, 플랫폼 라벨)`(설정 행이 있으면 20).

- [x] **Step 1: 실패 테스트 작성**
  - `status installed on label`(AC-T1): installed 없음 → `info[0]`이 `'Installed on'`+공백+`'Not installed'`, `info[1]===''`, 설정 행 없음; installed 1개 → 값이 `homeModeLine(...)`과 같다.
  - `status settings rows`(AC-T2): claude installed(`{runMode:'full-auto',language:'ko',limits:{max_total_subagents:100,max_concurrent_subagents:5}}`) → `info.slice(1,6)`이 `['Run mode              Full Auto','Language              Korean','Total subagents       100','Concurrent subagents  5','']`(라벨 폭 20 + 3칸, `row()`의 실제 간격 규칙에 맞춰 확정), `infoTones` 대응 `undefined`, 길이 일치.
  - `status settings mixed`(AC-T2): runMode 상이 → `mixed`, 같은 language는 실제 값.
  - `status ignores non-installed`(Review Focus 5).
  - 기존 `'Mode'` 단언 → `'Installed on'`, 플랫폼·Version 행 정렬 변화 반영, old→new 보고.
- [x] **Step 2: 실패 확인.** `node --test tests/node/tui-app.test.mjs` FAIL.
- [x] **Step 3: 구현.** 대상 `statuses.filter(status=>status.state==='installed'&&status.settings)`, 행별 값이 모두 같으면 표시값 아니면 `'mixed'`. 매핑: runMode `Supervised`/`Full Auto`, language `English`/`Korean`, 한도 `String`.
- [x] **Step 4: GREEN.** `node --test tests/node/tui-app.test.mjs tests/node/tui-custom-preset.test.mjs tests/node/tui-setup.test.mjs`. PTY 테스트 `node --test tests/node/tui-app-pty.test.mjs`는 Orchestrator가 호스트에서 실행.
- [x] **Step 5: STD-CLOSE.** 커밋 예: `feat(tui): Status에 Installed on과 설치 설정 표시`

**Criteria:** AC-T1, AC-T2. **필수 QA:** fresh QA(정렬·mixed·비설치 제외 독립 대조, 호스트 PTY 출력). **Holds:** T5 커밋 전 착수 금지.

---

### Task T7: README·`docs/harness-operation.md`

**목표:** spec 3.3·10의 사용자 문서 반영. 비동작 문서 → TDD 예외.

**Files:**
- Modify: `README.md` — Configure 행 구성 `Hosts → Run mode → Language → Total subagents → Concurrent subagents → Apply → Back`(Settings 하위 메뉴 언급 제거), Run mode(Supervised 기본 / Full Auto) 단락, Status 행(`Installed on`, 설정 4행, `mixed`), `settings.toml` v2 문법·다운그레이드 제약("구버전 CLI는 v2를 `incomplete`로 본다. 다운그레이드 전 Supervised로 재설치").
- Modify: `docs/harness-operation.md` — Full Auto gate 요약(상세는 설치 skill `references/planning.md#full-auto-run-mode`), 설정 파일 문법, 보존 규칙(명시값 > 기존값 > supervised, upgrade 보존), 중단 방법(채팅에서 Supervised 요청 시 다음 gate부터).
- Modify: `MANIFEST.sha256`(README)

- [x] **Step 1:** README·docs의 `Settings`·`Mode` 문구 위치를 grep으로 찾아 보고.
- [x] **Step 2:** 편집. 영문 정책 문장 인용은 spec 원문과 바이트 동일.
- [x] **Step 3: 확인.** `node --test tests/node/manifest.test.mjs` + README 문구 검사 테스트가 있으면 함께 실행, `grep -n "Settings" README.md`로 Configure 하위 메뉴 잔존 0건.
- [x] **Step 4: STD-CLOSE.** 커밋 예: `docs: Run mode·Configure·Status·settings v2 안내`

**Criteria:** AC-G5. **필수 QA:** 없음(Orchestrator가 spec 10절과 직접 대조). **Holds:** T5·T6 커밋 전 착수 금지.

---

### Task FR: 최종 독립 Reviewer 1회

- 시점: T1–T7 수용·커밋, 필수 QA·재확인 완료 후.
- 범위: `74df988..HEAD` 전체 변경과 spec v1 전체.
- 중점: Full Auto 정책 문구가 user gate(외부 작업, 실패·hold, 보존 규칙, 권한, 신규 제품 결정, visual interpretation)를 실제로 남기는지; supervised 바이트 회귀; 프로필에 모드별 렌더링이 없는지; 4개 플랫폼 패리티.
- 지적 처리: Implementer → Reviewer 반복, QA 재배정 없음. 수정은 재확인까지 미커밋, 수용 후 focused follow-up 커밋 1개.

### Task T8: planning.md Full Auto 적용 조건·질문 행 우선순위 (spec v2 7.6, D10)

- 파일: `claude|codex|gemini|grok/skill/references/planning.md`, `tests/node/run-mode-contract.test.mjs`, `MANIFEST.sha256` (probe로 확인한 추가 단언 파일은 진행 기록에 적는다).
- 4개 사본 Full Auto 절 첫 문단을 spec v2 7.6 문구로 정확히 교체. 나머지 표·Records는 바이트 불변.
- 테스트 먼저: run-mode-contract의 기대 문단을 v2 문구로 바꿔 실패 확인 후 교체(AC-G6).
- STD-CLOSE.

### Task T9: Configure Full Auto info 문구와 Host 추가 시 설정 상속 (spec v2 4.1·4.3, D10)

- 파일: `lib/tui/setup.mjs`, `tests/node/tui-setup.test.mjs`, `MANIFEST.sha256`.
- `installSettingsDraft`: 값·`mixed`를 설치된 플랫폼만으로 계산, 미설치 플랫폼은 상속, 설치 없음은 기본값(AC-U9).
- Configure renderBody·notice: Run mode가 표시상 `Full Auto`면 4.3 문구를 info 끝에 붙이고, notices·footerRows·capacity가 같은 목록을 쓴다. 메뉴 안 순환으로 즉시 반영(AC-U8). Supervised·mixed 화면은 현행과 같다.
- 테스트 먼저: draft 상속·설치 간 mixed 유지·prepare options 전달, Full Auto 문구 표시·순환 후 소거.
- STD-CLOSE.

### Task FR2: 후속 변경 Reviewer

- 시점: T8·T9 수용·커밋 후. 범위: `2f8e1dd..HEAD`와 spec v2 변경분, FR 지적 1·2 해소 여부.

### Task T10: 안내 문구 1줄 축약과 incomplete 비교 유지 (spec v3 4.1·4.3, D11)

- 파일: `lib/tui/setup.mjs`, `tests/node/tui-setup.test.mjs`, `MANIFEST.sha256`.
- 문구를 spec v3 4.3으로 교체하고 80열에서 1행인지 테스트. 행 미리 확보 없음.
- `installSettingsDraft`: `absent`/status 없음만 상속, `incomplete`는 비교 참여(AC-U9 v3).
- STD-CLOSE.

### Task T11: 우선순위 문장에 auto 행 Rule의 user 조건 포함 (spec v3 7.6, D11)

- 파일: 4개 `planning.md`, `tests/node/run-mode-contract.test.mjs`, `MANIFEST.sha256`. 첫 문단 1줄만 교체(AC-G6).
- STD-CLOSE.

### Task FR3: T10·T11 Reviewer

- 범위 `060e4cd..HEAD`, FR2 지적 2건 해소 여부.

## AC 추적표

| AC | 작업 |
|---|---|
| AC-S1–S4 | T1 |
| AC-P1 | T3 |
| AC-P2, AC-P3 | T4 |
| AC-P4 | T1(단위), T3(통합) |
| AC-P5, AC-P6 | T3 |
| AC-U1–U7 | T5 |
| AC-T1, AC-T2 | T6 |
| AC-T3 | T4 |
| AC-G1 | T2 |
| AC-G2 | T2(재생성), 모든 작업 `check:role-policy` |
| AC-G3 | T2(정적 문장·절), T3(marker) |
| AC-G4 | 모든 작업 STD-CLOSE |
| AC-G5 | T7 |
| AC-R1 | T3(단위), 최종 검증 V2 |
| AC-R2 | 모든 작업 STD-CLOSE, 최종 검증 V1 |
| AC-G6 | T8 |
| AC-U8, AC-U9 | T9 |

## 최종 검증 (Orchestrator, T7 수용 후·FR 전)

- V1 전체 스위트: 호스트에서 `npm test`와 P0-a python 테스트. P0-a 기준선 대비 신규 실패 0, 의심 flake는 단독 재실행 결과 함께 기록(AC-R2).
- V2 supervised 설치 바이트 회귀(AC-R1): `git archive 74df988 | tar -x -C <scratchpad>/base`로 기준 트리를 만들고, 기준·현재 트리에서 `tests/node/fixtures/installed-layout.mjs` 헬퍼 경로로 같은 fixture home에 4개 플랫폼 standalone supervised 설치(`en`/`ko`)를 실행해 `diff -r`. 허용 차이: 설치 `SKILL.md`, `references/planning.md`, agent 프로필, `runtime/role-policy.json`(정책 사본, 규칙 추가 사유). `settings.toml`·`limits.toml`·`models.toml`·native config·managed instruction block·나머지 references는 바이트 동일.
- V3 PTY·수동 TUI: 실제 TTY에서 `node bin/arc.mjs`(임시 home만 사용, 사용자 home 불변). Configure 행 순서·Run mode/Language 깜빡임과 ←/→·한도 입력과 오류·Apply 위치·작은 터미널 compact/guard; Status `Installed on`·설정 4행·`mixed`·정렬.
- V4 `npm run check:manifest`, `npm run check:role-policy`, `node scripts/update-runtime-assets.mjs --check` 통과.
- 이어서 FR.

## 진행 기록

| 일시 | 작업 | 상태 | 커밋 | 메모 |
|---|---|---|---|---|
| 2026-11-19 | P0-b | 완료 | — | runtime 사본·golden fixture 확인, 언어 오류 단언 없음 |
| 2026-11-19 | P0-a | 완료 | — | npm test 2825/fail 36(기준선 목록은 canonical record), python payload 52 run/120 failures |
| 2026-11-19 | T1 | 수용 | (이 커밋) | language 13/13, host suite 신규 실패 0, check:manifest 283 OK, fresh QA AC-S1–S4·AC-P4 proven |
| 2026-11-19 | T2 | 수용 | (이 커밋) | 39 files, update:role-policy 28/check 48, runtime 35, manifest 283, host suite = 기준선 + role-bridge-run flake(단독 35/35), fresh QA AC-G1·G2·G3(정적) proven |
| 2026-11-19 | T3 | 수용 | (이 커밋) | 14 files, host suite = 기준선 36(신규 0), check:role-policy 48·manifest 283, fresh QA AC-P1·P4·P5·P6·G3·R1(지정 범위) proven, 전체 AC-R1은 V2 |
| 2026-11-19 | T4 | 수용 | (이 커밋) | 9 files, host suite = 기준선 + codex-auth-probe flake(단독 23/23), manifest 283, fresh QA AC-P2·AC-T3 충족, AC-P3 정규 바이트 보존 충족(TOML 주석 소실은 기존 정규화 동작·spec Q2, 결함 아님) |
| 2026-11-19 | T5 | 수용 | (이 커밋) | 6 files, host suite = 기준선 36(신규 0), PTY 37/37, manifest 283, fresh QA AC-U1–U7 proven; 경계 full 22→25행·전환 24/25행; 역할 편집 후 PTY 시나리오 범위 축소는 앱 테스트·QA 재현으로 보완(수용) |
| 2026-11-19 | T6 | 수용 | (이 커밋) | 4 files, host suite = 기준선 + role-bridge-run flake(단독 35/35), PTY 37/37, manifest 283, fresh QA AC-T1·T2 proven(값 시작 열 23) |
| 2026-11-19 | T7 | 수용 | (이 커밋) | README·harness-operation 영어 문서, manifest 283, Orchestrator가 spec 10절 대조(Configure 행·Run mode·Status·settings v2·다운그레이드·Full Auto gate 요약) |
| 2026-11-19 | 최종 검증 | 완료 | — | V1 npm test 2877/fail 36=기준선(신규 0), python 119≤120; V2 74df988 대비 supervised 설치 차이는 SKILL.md·planning.md·프로필·runtime/role-policy.json만, managed block 동일; V3 PTY 실제 TUI(Configure 행·토글·Full Auto Apply·Status) 확인; V4 manifest 283·role-policy 48·runtime 35 verified |
| 2026-11-19 | FR | 완료 | — | native arc-routing-reviewer(rev baa6f627) 승인, 차단 0. 비차단: planning.md 질문 행 우선순위 모호·`Run mode: Full Auto` 문자열 불일치·Configure 80ms 재그리기. 앞선 보류 원인은 CLI `--cwd` 상대경로(activation_unverified) |
| 2026-11-19 | FR 처리 | 사용자 결정 | — | 1·2 조치(T8), 3은 Full Auto info 문구로 대체(T9), Host 추가 시 `(mixed)` 수정(T9) → spec v2·plan v4 |
| 2026-11-19 | T9 | 수용 | (이 커밋) | 3 files, TUI 4 files 307/307, host suite 2881/fail 36 = 기준선(신규 0), manifest 283, fresh QA AC-U1–U9 proven; Full Auto 80열 full 레이아웃은 27행부터(안내 2행, spec 4.3 footerRows 규칙) |
| 2026-11-19 | T8 | 수용 | (이 커밋) | 6 files, 4개 planning.md 각 1줄 동일 교체, run-mode-contract RED 4→GREEN, host suite 2881/fail 36 = 기준선(신규 0), manifest 283; 정확 문구 교체라 별도 QA 대신 계약 테스트·Orchestrator diff 대조, FR2에서 재확인 |
| 2026-11-19 | FR2 | 완료 | — | native reviewer 승인, 차단 0. 비차단: incomplete 플랫폼 설정 덮어쓰기 가능성, 우선순위 문장이 auto 행 Rule의 user 조건 미포함 |
| 2026-11-19 | FR2 처리 | 사용자 결정 | — | 둘 다 수정(T10·T11), 사용자 화면 확인 결과 25행에서 토글 시 도식 전환 → 문구 1줄 축약·행 확보 없음(T10) → spec v3·plan v5 |
| 2026-11-19 | T10 | 수용 | (이 커밋) | 3 files, TUI 311/311, host suite 2885/fail 36 = 기준선(신규 0), manifest 283, fresh QA AC-U8·U9 v3 proven; 80열 도식 최소 높이 Supervised 25·Full Auto 26 |

## 개정 이력

| Version | Approval time | Classification | Affected tasks | Reason |
|---|---|---|---|---|
| v1 | 2026-11-19 09:40 KST (사용자 명시 승인) | 초기 | — | spec v1(2026-11-19 08:59 KST 승인)의 최초 구현 계획 |
| v2 | 2026-11-19T10:30:00+0900 (사용자 명시 승인) | 실행 중 개정(검증 방법·파일 목록) | T2, T3, T4 | golden fixture 갱신 제외(기준선에서 이미 실패), T2에 probe로 확인한 기존 단언 3개 파일 추가 |
| v3 | 2026-11-19T12:12:54+0900 (사용자 명시 승인) | 실행 중 개정(파일 목록) | T5 | T5에 `tui-app-pty.test.mjs` 추가(Settings·KR 참조), `capability-surfaces.test.mjs` 조건부 추가 |
| v4 | 2026-11-19 (사용자 지시로 범위 확정, FR 후속) | 실행 중 개정(작업 추가) | T8, T9, FR2 | spec v2(D10) 반영 |
| v5 | 2026-11-19 (사용자 지시, FR2 후속) | 실행 중 개정(작업 추가) | T10, T11, FR3 | spec v3(D11) 반영 |
