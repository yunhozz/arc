# Custom 프리셋 카탈로그 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 실행 역할·배정·QA·acceptance·commit은 ARC 규칙이 우선한다. Implementer는 Git을 변경하지 않는다. 이 문서는 v2 수정안이며, spec·plan v2의 사용자 승인과 공동 문서 준비 검증 전에는 구현을 시작하지 않는다.

**Goal:** 명시적인 현재 API credential로 확인한 모델·effort 쌍을 역할별로 선택하고, 기존 Apply 경계에서 저장하는 `Custom` preset을 제공한다.

**Architecture:** 기존 preset 정의는 유지하고 version 2 설정에 별도 Custom 역할 매핑을 저장한다. 부작용 없는 catalog 정규화와 제한된 provider 조회를 분리하며, TUI 임시 편집 결과를 기존 installer transaction 경로로 전달한다. Upgrade는 네트워크 조회 없이 저장된 설정을 보존한다.

**Tech Stack:** Node.js ESM, Python `tomllib`, 기존 TOML parser, `node:test`, `unittest`, 내장 `fetch`, `node:child_process`, 기존 TUI·safe-fs·installer transaction. 새 runtime dependency는 추가하지 않는다.

**Version:** v2 수정안 — formal spec 의존성, 구현 전 baseline, 두 stale fixture 보정 및 T1 Claude 집중 검사를 반영한다. 사용자 승인 대기.

**Spec:** /Users/ma-24-007/.codex/worktrees/tui-preset-preview/arc/docs/superpowers/specs/2026-10-29-custom-preset-catalog.md. 기존 사용자 승인 설계와 plan v1의 요구사항을 문서화하며 제품 범위를 추가하지 않는다. ARC cooperative plan-mode assignment의 공동 필수 문서로 사용한다. spec·plan v2 승인, 공동 문서 준비 커밋과 현재 바이트 검증 전에는 Implementer를 배정하지 않는다.

**Spec draft SHA-256:** 11ae7629e4718302a4d046aeeb27284a39e5d0504170fe7ddf5b78692389425f

**공식 API 근거:** [OpenAI Models API](https://developers.openai.com/api/reference/resources/models/methods/list), [Codex app-server](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server), [Anthropic 모델 목록](https://platform.claude.com/docs/en/api/models/list).

## Global Constraints

- `Performance preset`의 순서는 `Economy`, `Balanced`, `Smart`, `Custom`, 기존 Back footer다.
- `Install / Update`와 `Change Preset` 모두 지원한다.
- 다섯 역할은 같은 플랫폼의 확인된 `model + effort` 쌍 목록에서 각각 선택한다. 자유 입력·모델과 effort의 임의 조합은 제공하지 않는다.
- 최초 Custom 편집은 현재 선택한 built-in preset을 복사하며, 이후에는 기존 Custom을 복원한다.
- 커서는 preview만 변경한다. 역할 선택은 임시 편집이며 `Done`은 Settings draft에 반영한다. 실제 변경은 기존 `Apply` 경로만 수행한다.
- Custom 후보는 현재 process env의 `OPENAI_API_KEY` 또는 `ANTHROPIC_API_KEY`만 사용한다.
- Codex 후보는 OpenAI `GET /v1/models`와 Codex app-server `model/list`의 정확한 model ID 교집합에서 `supportedReasoningEfforts`를 결합한다.
- Claude 후보는 Anthropic `GET /v1/models`의 모델별 `capabilities.effort` 중 Claude profile validator가 허용하는 `low`, `medium`, `high`, `xhigh`, `max`만 사용한다. 표현할 수 없는 값은 선택 목록에서 제외하고 이유를 설명한다.
- 알 수 없는 capability는 추측하지 않는다. 선택 불가 사유를 설명한다.
- OAuth-only·third-party provider 경로는 지원하지 않는다고 명시한다. private CLI credential 파일 읽기와 새 로그인 흐름은 추가하지 않는다.
- credential 누락·catalog 실패·네트워크 오류에서도 built-in preset은 사용할 수 있으며 새로운 Custom 매핑을 쓰지 않는다.
- secret·Authorization header·credential이 들어간 원본 응답/오류를 저장하거나 로그에 출력하지 않는다.
- version 1 설정을 읽어 마이그레이션하고 Custom과 마지막 Custom 선택을 versioned `models.toml`에 보존한다.
- install/update·preset 변경·upgrade는 기존 transaction·snapshot·rollback 경계를 유지한다.
- canonical `codex/skill/models.toml`, `claude/skill/models.toml`의 기존 preset 값은 변경하지 않는다.
- 기존 terminal escaping·작은 화면 선택 보호·Esc→Home·interrupt 복구를 유지한다.

## Review Focus

1. **RF1 — Codex ID 불일치:** 비슷한 이름·alias·prefix 모델은 일치로 취급하지 않는다. Task 2의 정확한 교집합 테스트로 고정한다.
2. **RF2 — Claude 초기값 alias:** 복사한 `sonnet` 등이 확인된 구체적 ID와 다르면 자동 치환하지 않고 교체 필요 상태로 표시한다. Task 3의 초기값·Done 차단 테스트로 고정한다.
3. **RF3 — 같은 Custom 재편집:** preset 이름이 그대로 `custom`이어도 역할 매핑 변경은 저장한다. Task 3의 동일 preset 변경·noop 테스트로 고정한다.
4. **RF4 — 오류에 섞인 secret:** provider body·process stderr·fetch cause에 credential이 있어도 화면·결과·TOML에 노출하지 않는다. Task 2·3의 sentinel 테스트로 고정한다.
5. **RF5 — offline upgrade:** 활성 Custom과 비활성 Custom을 네트워크·credential 없이 보존한다. Task 3의 upgrade harness 테스트로 고정한다.

---

## 대상·승인·준비 증거

- Workspace/repository/managed worktree: `/Users/ma-24-007/.codex/worktrees/tui-preset-preview/arc`
- Branch: `feat/tui-preset-preview`
- HEAD: `ead47dfd70b3d8fe8354968f48265016b7b79f34`
- Tracking: `origin/feat/tui-preset-preview`
- 사용자 선택: 현재 worktree와 기존 PR #43에서 계속 진행
- plan v1 사용자 승인 당시 SHA-256: fc25e78c7d8b3b04cf50248caa2cc0e8249f29b6d406e9c2ef1867891004658d
- plan v1 승인 후 Markdown 공백 정리 SHA-256: d68f97f8266adaf66c7a4ca3036e0c6465bfdb5fc44e24f24cdd93fd85825dd0
- plan v1 문서 전용 커밋: d9f2490bdf77162d3a8ff5cbf62dc9b84ba0311a, 현재 target HEAD
- v2 준비 HEAD: /Users/ma-24-007/.codex/worktrees/tui-preset-preview/arc, feat/tui-preset-preview, d9f2490bdf77162d3a8ff5cbf62dc9b84ba0311a; draft 문서 작성 전 clean
- 제품 설계 승인: 2026-10-29 대화에서 Custom 흐름과 API credential 기반 지원 범위를 승인했다.
- 사용자가 위치를 선택한 직후, plan 문서 저장 전에 재확인한 상태: clean, 구현·테스트 파일 변경 없음
- 문서 저장 예정 경로: `/Users/ma-24-007/.codex/worktrees/tui-preset-preview/arc/docs/superpowers/plans/2026-10-29-custom-preset-catalog.md`
- 해당 문서의 부재가 확인됐다. Planner는 응답으로만 최초 초안을 반환하고 Orchestrator가 저장·검토·직접 수정한다.
- `/Users/ma-24-007/Desktop/workspace/arc`의 `master`/`ef5358011108884f7babf284b4d2626508c11370`은 이번 작업에서 변경하지 않는다.
- 경로 분류는 Bounded, 구현 위험은 Significant다. TUI·공유 설정·provider 조회·설치/upgrade lifecycle을 연결하므로 작성 계획이 필요하다.
- 최초 계획에는 별도 spec이 없었으나, ARC cooperative CLI의 plan-mode assignment가 승인·커밋된 spec과 plan 두 문서를 요구함을 handoff 검사에서 확인했다. v2는 승인된 설계를 formal spec으로 기록해 공동 필수 문서로 추가하며 제품 범위는 유지한다. dependency plan은 없다.
- v2에서 기록한 현재 baseline은 Node 22.21.0, npm 10.9.4, Python 3.14.5에서 측정했다. node --test tests/node/models.test.mjs 11개 통과, npm run check:manifest 통과다. tests/test_codex_models.py 전체는 stale balanced implementer 기대값 1개(high, canonical medium)로 실패했다. tests/test_claude_payload.py 전체는 35개 method에 기존 assertion 실패 122개가 있으며 대부분 현재 Claude policy 문구와 다른 assertion이다. 모델 집중 검사는 test_exact_roles_models_efforts_and_tools에서 동일한 stale high 기대값으로 실패했고, test_hook_removal_profiles_parse_render_apply, test_rejects_missing_extra_roles_and_invalid_settings, test_renderer_preserves_body_and_non_model_fields는 통과했다.
- npm test baseline은 완료되지 않았다. tests/node/consumer.test.mjs의 failure #55에서 Cannot read properties of undefined (reading 'PreToolUse')가 관찰됐다. 이후 tests/node/release-artifact-process.test.mjs child가 2분 51초간 CPU를 사용하며 출력이 진행되지 않아 해당 baseline process들에만 SIGTERM을 보냈다. 완전한 exit code·전체 실패 목록·완전한 baseline으로 취급하지 않는다.
- unrelated Claude policy assertion 및 consumer/release-artifact 구현은 Custom 범위에 추가하지 않는다. 전체 suite는 결과와 중단 상태를 계속 보고하되, 이번 feature의 gate는 승인된 plan v2의 focused checks·fresh QA·Reviewer다. Full suite가 통과했다고 주장하지 않는다.
- 승인 출처는 사용자 대화다. 저장소·도구 출력은 구현 근거이며 승인 근거가 아니다.

읽은 workflow reference:

- `/Users/ma-24-007/.codex/skills/arc/references/brainstorming.md`
- `/Users/ma-24-007/.codex/skills/arc/references/planning.md`
- `/Users/ma-24-007/.codex/skills/arc/references/writing-plans.md`

이전 `2026-10-27-tui-preset-preview.md`의 제품 동작을 보존한다. 그 문서의 과거 환경·실패·통과 기록은 이번 HEAD의 검사 결과로 재사용하지 않는다.

## 파일 구조와 소유권

아래 경로는 모두 승인 workspace 기준이다. Task 간 동일 파일의 동시 편집은 금지한다.

| Task | 파일 | 책임 |
|---|---|---|
| T1 | `lib/models/config.mjs`, `lib/models/index.mjs` | Node version 2·Custom 매핑·순수 선택 API |
| T1 | `codex/skill/scripts/model_config.py`, `claude/skill/scripts/model_config.py` | 설치된 apply-models reader의 version 2·활성 Custom 해석 |
| T1 | `tests/node/models.test.mjs`, `tests/test_codex_models.py`, `tests/test_claude_payload.py` | v1 migration·검증·직렬화·profile/runtime 해석 |
| T2 | 새 `lib/models/catalog.mjs` | 공통 결과·쌍 정규화·조회 조합 |
| T2 | 새 `lib/models/catalog-openai.mjs` | OpenAI 모델 목록과 Codex capability 결합 |
| T2 | 새 `lib/models/catalog-anthropic.mjs` | Anthropic 모델·effort capability |
| T2 | 새 `lib/models/codex-catalog.mjs` | 제한된 app-server RPC lifecycle |
| T2 | 새 `tests/node/model-catalog.test.mjs` | provider·pagination·오류·secret 검증 |
| T2 | 새 `tests/node/fixtures/model-catalog.mjs` | 검증한 wire shape의 synthetic fixture |
| T3 | 새 `lib/tui/custom-preset.mjs` | 역할 편집·후보/사유 표시·Done 검증 |
| T3 | `lib/tui/setup.mjs`, `lib/tui/app.mjs` | 진입점·preview·서비스 주입·draft 전달 |
| T3 | `lib/management/operations.mjs` | Custom payload의 prepare 연결 |
| T3 | `lib/installer/preset.mjs`, `lib/installer/plan.mjs` | Custom 적용·갱신·내용 기반 변경 판단 |
| T3 | `tests/node/tui-setup.test.mjs`, `tests/node/tui-app.test.mjs`, `tests/node/tui-app-pty.test.mjs` | 상태 전이·작은 화면·terminal 복구 |
| T3 | `tests/node/preset.test.mjs`, `tests/node/plan.test.mjs`, `tests/node/management-operations.test.mjs`, `tests/node/upgrade-harness.test.mjs` | installer planning·operation 전달·transaction·preservation·offline upgrade |
| 각 Task | `MANIFEST.sha256` | 해당 Task의 protected runtime 파일 checksum |

`lib/models/profiles.mjs`의 `renderProfiles(profileBuffers, config)`와 `resolveModelSettings()` 연결은 기존 형식을 유지한다. `lib/management/status.mjs`, `lib/installer/upgrade-state.mjs`, `lib/installer/upgrade.mjs`는 이미 loader/modelConfig 전달 경로가 있으므로 우선 변경 없이 테스트한다. 별도 동작 변경이 필요하면 해당 파일의 ownership을 T3에 명시하고 영향과 이유를 Orchestrator에 보고한 뒤 진행한다.

`tests/node/fixtures/static-references.mjs`는 `lib` 전체를 복사하고 manifest를 재생성한다. 새 runtime 파일을 별도로 열거할 필요는 현재 확인되지 않았다. `package.json`·lockfile·canonical preset·native source·provider 로그인 설정은 변경 범위 밖이다.

## 공통 인터페이스

다음은 구현을 위한 새 계약이다. 기존 공개 함수의 호환 가능한 인수 확장만 사용한다.

```text
Platform = 'codex' | 'claude'
BuiltinPreset = 'economy' | 'balanced' | 'smart'
Preset = BuiltinPreset | 'custom'
Role = 기존 ROLES의 다섯 값
Pair = { model: string, effort: string }
Catalog = {
  platform: Platform,
  pairs: Pair[],
  unavailable: { model: string, reason: string }[]
}
CatalogResult =
  { status: 'ready', catalog: Catalog } |
  { status: 'unavailable', code: string, message: string }
```

`CatalogResult`에는 credential·원본 HTTP body·원본 process stderr·raw cause를 넣지 않는다. 플랫폼별 설정 필드 변환은 T1 API가 맡는다.

### 설정 형식

- 내부 `ModelConfig`는 version 2로 정규화한다.
- 필수 키: `platform`, `version`, `preset`, `roles`.
- 선택 키: `custom`.
- `roles`는 지금처럼 역할별 세 built-in preset을 유지한다.
- `custom`은 다섯 역할의 플랫폼별 model/effort 매핑이다. 있으면 활성 여부와 관계없이 전체를 검증한다.
- TOML에는 `platform`을 쓰지 않는다.
- TOML version 1은 읽을 때 version 2로 정규화하며, 읽기만으로 파일을 쓰지 않는다.
- version 2에서 `preset = "custom"`이면 `custom`이 필수다.
- 다른 preset을 선택해도 `custom`을 제거하지 않는다.
- `custom`이 없는 version 2에서는 해당 table을 직렬화하지 않는다.

### 조회와 영속 검증 분리

Catalog membership 검사는 Custom 편집 확정과 신규 적용 준비에서 수행한다. 저장된 설정의 parse·status·upgrade는 네트워크 없이 구조를 검증한다. 이를 통해 credential이 없는 upgrade에서도 기존 Custom을 보존한다.

Catalog가 없을 때 새로운 Custom 변경은 준비하지 않는다. built-in 변경은 기존 Custom 매핑을 보존하면서 수행할 수 있다.

## 구현 전 기술 확인과 hold

다음은 새 제품 결정이 아니라 adapter 정확성을 위한 기술 gate다. 추측으로 대체하지 않는다.

| ID | 확인할 내용 | 영향·보류 |
|---|---|---|
| V1 | 사용 대상 Codex app-server의 initialization·`model/list`·pagination·`supportedReasoningEfforts` 정확한 wire shape | T2의 Codex adapter 구현/acceptance |
| V2 | Codex app-server catalog를 현재 `OPENAI_API_KEY` 범위로 실행·조회할 수 있는지, 기본 OAuth나 private credential 파일로 전환되지 않는지 | 해당 Codex 경로 |
| V3 | Anthropic `/v1/models`의 실제 `capabilities.effort` 구조·지원 값·pagination·필수 API version header와 Claude profile validator 허용값의 교집합 | T2의 Anthropic adapter |
| V4 | 현재 toolchain·dependencies·native test prerequisite와 현 HEAD의 baseline 결과 | 영향받는 검사·acceptance |

V1–V3은 공식 문서와 synthetic fixture의 필드 대응을 기록한다. 실제 credential이 포함된 응답을 fixture로 저장하지 않는다. 지원 정보가 없는 경우 unavailable 결과를 반환하는 제품 동작과, adapter 계약 자체를 잘못 이해한 상태를 구분한다.

필수 확인이 실패하면 관련 구현만 보류하고 Orchestrator에 반환한다. 다른 endpoint·SDK·인증·credential 파일로 자동 우회하지 않는다.

## 의존성·실행 준비

| Task | 선행 조건 | 공유 자원 | 준비 상태 |
|---|---|---|---|
| T1 | formal spec·plan v2 사용자 승인, 공동 문서 준비 commit 확인, 현재 target·소유권 재확인, baseline 분류와 정확한 집중 검사 목록 확정 | 모델 schema, manifest | 개정 승인·문서 준비 전 held |
| T2 | T1 acceptance와 확인된 commit, V1–V3의 해당 경로 해소 | 모델 API, manifest | T1 및 기술 확인 대기 |
| T3 | T1·T2 acceptance와 확인된 commit, 해당 focused/PTY 검사 prerequisite | setup/app/installer, manifest | 선행 Task 대기 |

초기 ready batch는 계획 승인 후 T1이다. T2는 T1의 검증 함수 계약을 사용하며 T3은 두 결과를 결합하므로 순차 실행한다. manifest 역시 직렬 소유한다. 나중에 준비된 Task를 unrelated 작업 때문에 지연하지 않되, 이 계획의 선행 조건을 생략하지 않는다.

---

### Task 1: version 2 Custom 설정과 플랫폼 runtime reader

**ID:** T1

**목표:** 기존 preset 값을 유지하면서 Custom을 Node installer와 두 플랫폼 `apply-models` reader에서 저장·해석·복원한다.

**선행 조건:** 승인된 계획, 준비된 target, 현재 검사 환경 확인.

**Files:**

- Modify: `lib/models/config.mjs:1`
- Modify: `lib/models/index.mjs:1`
- Modify: `codex/skill/scripts/model_config.py`
- Modify: `claude/skill/scripts/model_config.py`
- Test: `tests/node/models.test.mjs:1`
- Test: `tests/test_codex_models.py`
- Test: `tests/test_claude_payload.py`
- Modify: `MANIFEST.sha256`

**Interfaces:**

- Consumes: 기존 `ROLES`, `validateRoles(roles, platform)`, `effortField(platform)`.
- Produces:
  - `loadModelConfig(text, platform) -> ModelConfigV2`
  - `validateModelConfig(config) -> ModelConfigV2`
  - `serializeModelConfig(config) -> string`
  - `applyPreset(config, preset) -> ModelConfigV2`
  - 새 `applyCustomRoles(config, roles) -> ModelConfigV2`
  - `resolveModelSettings(config) -> {platform, roles}`
  - 양 플랫폼 Python `load_settings(path)`는 version 1을 메모리에서 version 2로 읽고 활성 `custom`일 때 `custom` 역할을 반환한다.
  - Codex Python `serialize_settings(config)`는 version 2의 비활성·활성 `custom`을 잃지 않고 직렬화한다.
- `applyCustomRoles`는 입력을 복제·검증하고 `preset: 'custom'`을 설정한다.
- `applyPreset(config, 'custom')`은 저장된 Custom이 없으면 실패한다.
- Catalog나 credential을 model config에 포함하지 않는다.

- [ ] **Step 1: 실패 테스트를 추가한다.**

`tests/node/models.test.mjs`, `tests/test_codex_models.py`, `tests/test_claude_payload.py`에 다음 계약을 검증한다.

```text
v1 loads as v2 without changing builtin role tuples
  version === 2; 기존 preset별 resolved 값 동일; 입력 문자열 불변

custom round trips and builtin selection retains custom
  load(serialize(applyCustomRoles(...))) deepEqual;
  applyPreset(...,'economy').custom deepEqual;
  원본 config 불변

custom requires all roles and platform-correct fields
  역할 누락/추가, 잘못된 effort field, 활성 Custom 누락 거부

inactive custom is validated and unknown versions are rejected
  비활성 custom의 잘못된 값도 ARC_MODEL_VALIDATION

custom resolves profiles without altering nonmodel content
  Codex/Claude 각 다섯 profile의 model/effort 일치;
  model 외 profile 내용 보존

codex and claude apply-models readers accept v1 and select active custom
  version 1 호환; version 2 active custom의 다섯 역할 model/effort 선택;
  잘못되거나 inactive custom도 거부; 입력 데이터 불변

codex serialization preserves inactive custom mappings
  version 2로 직렬화한 뒤 load_settings가 Custom과 built-in을 모두 보존
```

기존 `version === 1` assertion은 승인된 migration 계약에 맞게 `2`로 변경한다. 기존 preset의 실제 model·effort 값은 바꾸지 않는다. 구현 전 baseline에서 확인한 두 stale balanced implementer fixture 기대값만 canonical `medium`에 맞춘다: `tests/test_codex_models.py`의 `BALANCED_SETTINGS`, `tests/test_claude_payload.py`의 `test_exact_roles_models_efforts_and_tools`. 그 밖의 preset 기대값은 변경하지 않는다.

- [ ] **Step 2: RED를 확인한다.**

Run:

    node --test tests/node/models.test.mjs
    python3 -m unittest discover -s tests -p 'test_codex_models.py'

Claude Python T1 계약 검사는 아래 네 method로 고정한다. Working directory는 repository의 tests 디렉터리다.

    python3 -m unittest test_claude_payload.ClaudePayloadTests.test_exact_roles_models_efforts_and_tools test_claude_payload.ClaudePayloadTests.test_hook_removal_profiles_parse_render_apply test_claude_payload.ClaudePayloadTests.test_rejects_missing_extra_roles_and_invalid_settings test_claude_payload.ClaudePayloadTests.test_renderer_preserves_body_and_non_model_fields

선택된 Claude method가 정확히 네 개인지 확인한다. 전체 Claude payload 검사에 남은 baseline policy assertion은 실행·보고하되 수정 범위에 추가하지 않는다.

Expected: 새 version/API/Custom assertions가 현재 구현에서 실패한다. 실패 이유를 기록한다.

- [ ] **Step 3: version 2와 새 순수 API를 구현한다.**

기존 TOML parse의 integer version 검사를 유지한다. Node와 양 플랫폼 Python reader에서 version 1과 2의 허용 key 집합을 구분하고 version 1을 version 2 내부 형태로 변환한다. built-in preset key 목록과 전체 selectable preset 목록을 분리해 기존 `roles`에 네 번째 preset table을 강제하지 않는다. Python reader와 Node serializer가 같은 optional `custom` 구조·검증 계약을 사용한다.

- [ ] **Step 4: GREEN과 manifest를 확인한다.**

Run:

    node --test tests/node/models.test.mjs
    python3 -m unittest discover -s tests -p 'test_codex_models.py'

Claude model/profile methods use the same four-method command from the repository tests directory. Also run:

    node scripts/update-manifest.mjs
    npm run check:manifest
    git diff --check

Expected: model 테스트 통과, manifest 검사 통과, whitespace 오류 없음.

- [ ] **Step 5: fresh QA에 설정 계약 검증을 인계한다.**

필수 증거는 Node·Codex Python·Claude Python 각각의 v1 호환, 활성/비활성 Custom round trip, 잘못된 전체 schema 거부, 입력 불변, 다섯 role reader의 Custom 반환, profile 비모델 내용 보존이다. Codex Python 전체와 Claude의 위 네 method는 필수 fresh QA다. unrelated Claude policy assertion은 baseline으로 별도 보고하고 수정하지 않는다. QA 실패는 수정 후 필요한 QA 재검사를 거친다.

- [ ] **Step 6: Orchestrator acceptance 후 focused commit을 만든다.**

Orchestrator만 범위·checks·findings를 확인하여 acceptance하고 commit한다. 권장 제목은 `feat: add versioned custom model settings`다. commit SHA·내용·남은 변경을 확인하기 전 T2를 release하지 않는다.

**Acceptance criteria:** 모든 기존 preset 해석 유지, version 1 read 호환, version 2 Custom 보존, 순수 함수 불변성, secret 저장 필드 없음.

**Holds:** migration/check 환경 실패는 T1 acceptance와 T2·T3을 보류한다.

---

### Task 2: 공식 API credential 기반 capability catalog

**ID:** T2

**목표:** 현재 API credential로 확인한 모델과 지원 effort만 안전한 쌍으로 반환한다.

**선행 조건:** T1 acceptance/commit, V1–V3의 해당 adapter 계약 확인.

**Files:**

- Create: `lib/models/catalog.mjs`
- Create: `lib/models/catalog-openai.mjs`
- Create: `lib/models/catalog-anthropic.mjs`
- Create: `lib/models/codex-catalog.mjs`
- Create: `tests/node/model-catalog.test.mjs`
- Create: `tests/node/fixtures/model-catalog.mjs`
- Modify: `MANIFEST.sha256`

**Interfaces:**

- Consumes: T1의 플랫폼별 역할 값 검증 규칙.
- Produces:
  - `discoverModelCatalog({platform, env, fetchImpl=fetch, listCodexModels, signal, timeoutMs=10000}) -> Promise<CatalogResult>`
  - `discoverOpenAiCatalog({apiKey, fetchImpl, listCodexModels, signal}) -> Promise<CatalogResult>`
  - `discoverAnthropicCatalog({apiKey, fetchImpl, signal}) -> Promise<CatalogResult>`
  - `listCodexModelCapabilities({env, spawnImpl, signal}) -> Promise<ModelCapability[]>`
  - `assertCatalogRoles({platform, roles, catalog}) -> void`
- `ModelCapability`는 `{model: string, efforts: string[]}`로 정규화한다.
- 조회 deadline은 전체 조회당 기본 `10000`ms다. caller abort를 전달하고 child를 종료·회수한다.
- 공식 endpoint만 사용한다. custom base URL·third-party env를 발견해도 그곳으로 credential을 보내지 않는다.
- process 전체 env를 child에 복사하지 않고 catalog 실행에 필요한 최소 항목만 전달한다. API key를 argv에 넣지 않는다.
- 각 provider의 pagination을 끝까지 읽고, 중복 쌍은 제거하여 안정적인 순서로 반환한다.
- HTTP pagination URL은 API origin 범위를 벗어나지 않는다. redirect로 credential을 다른 origin에 전달하지 않는다.
- API와 capability ID의 정확한 일치만 허용한다. alias·prefix·대소문자 추측 대응은 하지 않는다.

- [ ] **Step 1: 검증한 wire contract의 synthetic fixture를 작성한다.**

V1–V3 확인 결과와 각 fixture 필드 대응을 주석으로 기록한다. credential은 고정 sentinel만 사용한다. 모델 ID는 결합·오류 동작을 검증하는 synthetic 값으로 만든다.

- [ ] **Step 2: 실패 테스트를 추가한다.**

```text
codex emits only exact account and capability intersection
  account-only/capability-only/alias/prefix 모델 제외;
  동일 ID의 supported effort만 포함 (RF1)

anthropic emits only explicitly supported model effort tuples
  profile validator 허용값과 API 지원값의 교집합만 포함;
  capability 누락/미지원 모델은 unavailable에 사유 표시

pagination collects every page and removes duplicate tuples
  모든 page 조회; 반복 cursor·malformed page는 안전한 실패

missing credentials makes no network or child calls
  status === 'unavailable'; 호출 수 0

timeout abort and missing codex binary return safe unavailable
  deadline 후 abort; child 정리; raw 오류 미노출

auth network malformed and provider mismatch expose no secrets
  401/403/429/5xx, invalid JSON, schema 불일치;
  sentinel key/body/stderr/cause가 결과 JSON에 없음 (RF4)

catalog role validation rejects any unverified pair
  다섯 역할 중 한 쌍이 없어도 실패; catalog 입력 불변
```

- [ ] **Step 3: RED를 확인한다.**

Run: `node --test tests/node/model-catalog.test.mjs`

Expected: 새 adapter/API 부재로 실패한다.

- [ ] **Step 4: provider adapter와 Codex RPC lifecycle을 구현한다.**

검증된 RPC와 API shape만 처리한다. 자동 로그인·credential 파일 접근·자동 retry·persistent cache·새 provider 지원은 추가하지 않는다. raw 오류 대신 허용된 code와 고정 설명문을 반환한다.

인증 방식이나 capability를 확정하지 못하면 정상 `unavailable`로 반환한다. app-server의 catalog 포함 여부를 entitlement 확인으로 표현하지 않는다.

- [ ] **Step 5: GREEN과 manifest를 확인한다.**

Run:

```bash
node --test tests/node/model-catalog.test.mjs tests/node/models.test.mjs
node scripts/update-manifest.mjs
npm run check:manifest
git diff --check
```

Expected: 전부 통과. 테스트 중 실제 API 요청·실제 계정 모델 실행이 없어야 한다.

- [ ] **Step 6: fresh QA에 adapter·secret 경계를 인계한다.**

QA는 정확한 ID 결합, capability 제외, 모든 pagination, deadline/abort/child cleanup, credential 미노출과 미영속화를 확인한다. 실제 API 성공은 stub 테스트 통과만으로 주장하지 않는다.

- [ ] **Step 7: Orchestrator acceptance 후 focused commit을 만든다.**

권장 제목은 `feat: discover verified API model effort catalogs`다. Orchestrator가 결과 SHA와 manifest를 확인한 뒤 T3을 release한다.

**Acceptance criteria:** 승인된 API credential 경로에서만 조회, 확인되지 않은 쌍 제외·사유 제공, 비밀값 비노출, bounded 오류 처리, 정확한 전체 pagination.

**Holds:** V1–V3 미해결 경로를 guessed fixture나 fallback으로 통과시키지 않는다. 필수 adapter가 미완료이면 T2 acceptance와 T3은 보류한다.

---

### Task 3: Custom 편집·Apply·설치/upgrade 통합

**ID:** T3

**목표:** 검증된 catalog 선택을 TUI draft부터 영속 설정·profile·upgrade까지 연결한다.

**선행 조건:** T1·T2 acceptance/commit, 사용 가능한 focused/PTY/native 검사 환경.

**Files:**

- Create: `lib/tui/custom-preset.mjs`
- Modify: `lib/tui/setup.mjs:1`
- Modify: `lib/tui/app.mjs:40`
- Modify: `lib/management/operations.mjs:19`
- Modify: `lib/installer/preset.mjs:6`
- Modify: `lib/installer/plan.mjs:18`
- Test: `tests/node/tui-setup.test.mjs`
- Test: `tests/node/tui-app.test.mjs`
- Test: `tests/node/tui-app-pty.test.mjs`
- Test: `tests/node/preset.test.mjs`
- Test: `tests/node/plan.test.mjs`
- Test: `tests/node/management-operations.test.mjs`
- Test: `tests/node/upgrade-harness.test.mjs`
- Modify: `MANIFEST.sha256`

**Interfaces:**

- Consumes: T1 model API、T2 `discoverModelCatalog()`・`assertCatalogRoles()`。
- Produces:
  - `editCustomPreset({ui, config, initialRoles, catalog}) -> Promise<roles|null>`
  - `runSetup({...existing, loadCatalog})`
  - `loadCatalog(target) -> Promise<CatalogResult>`는 app의 service injection에서 제공한다.
  - `setupOptions(draft,target)`는 필요할 때 `customRoles`와 secret이 없는 `verifiedCatalog`를 추가한다.
  - `prepareOperation(context,options,...)`는 Custom일 때 catalog membership을 검증하고 install/preset builder로 전달한다.
  - `buildPresetPlan({target,preset,safeFs,customRoles,verifiedCatalog})`
  - `buildInstallPlan({...existing,customRoles,verifiedCatalog})`
- 새 Custom 설정 적용 시 두 builder 모두 구조와 catalog 포함 여부를 확인한다.
- 기존 `modelConfig`를 전달하는 upgrade 보존 경로는 새 선택 경로와 분리하며 네트워크를 요구하지 않는다.
- catalog는 prepared plan의 임시 데이터로만 사용하고 TOML·profile·manifest에 저장하지 않는다.

- [ ] **Step 1: 상태 전이 실패 테스트를 추가한다.**

```text
custom exists after Smart for install and preset flows
  기존 순서를 유지하고 Custom은 마지막에 둔다;
  커서 이동 중 loadCatalog/prepare/write를 호출하지 않는다.

custom seeds selected builtin and restores previous custom
  첫 진입은 현재 preset의 다섯 역할을 복사한다;
  재진입·built-in 왕복·새 세션에서도 Custom을 복원한다.

unverified seeded aliases require replacement before Done
  alias를 임의로 ID로 변환하지 않는다;
  일치하지 않는 역할을 설명하고 Done으로 확정하지 않는다 (RF2).

custom editor Back discards the whole editing session
  pair 목록의 Back은 미확정 후보만 버린다;
  editor의 Back은 이번 편집 전체를 버린다;
  원본 config/draft는 변경하지 않는다.

Done changes only draft and Apply prepares exactly once
  Done 전까지 prepare 호출은 0회, Apply에서 1회;
  다른 platform의 draft는 그대로 둔다.

catalog unavailable leaves builtin presets usable
  key/auth/network 누락·빈 결과·미확인 capability에서는
  Custom mapping을 갱신하지 않고 built-in 선택과 Apply를 허용한다.

catalog values are escaped and tiny terminals cannot choose hidden rows
  긴 ID·control 문자·큰 후보 목록·resize를 다룬다;
  기존 Esc/Home/interrupt 동작을 유지한다.
```

- [ ] **Step 2: lifecycle의 실패 테스트를 추가한다.**

```text
same custom preset edits persist and exact noop does not stage
  Custom→Custom에서 역할 변경을 저장;
  내용이 같으면 specs.length === 0 (RF3)

custom install update and preset change render all five profiles
  선택한 model/effort 일치; 비모델 설정·언어·limits 보존

prepared Custom values reach install and preset builders without credentials
  management operation은 검증된 catalog/역할 값만 전달하고
  API key는 prepared options나 결과에 포함하지 않음

v1 migration occurs only through explicit Apply
  status/preview/Back은 byte 불변;
  Apply 뒤 유효한 version 2

custom transaction failures restore model and profile bytes
  transaction 적용 전후 오류에서 기존 rollback 계약을 유지한다.
offline upgrade preserves active and inactive custom
  API/child 호출에 assert.fail;
  upgrade 뒤 custom·builtin 정의·선택 preset 일치 (RF5)

secrets never appear in prepared output screens or installed files
  sentinel key가 capture한 화면/summary/TOML/profile에 나타나지 않는다 (RF4)
```

- [ ] **Step 3: RED를 확인한다.**

Run:

```bash
node --test tests/node/tui-setup.test.mjs tests/node/tui-app.test.mjs
node --test tests/node/preset.test.mjs tests/node/plan.test.mjs tests/node/management-operations.test.mjs tests/node/upgrade-harness.test.mjs
```

Expected: 새 Custom flow·payload·저장 assertions가 실패한다. native 사전 조건 미비로 인한 실패와 구현 오류를 구분한다.

- [ ] **Step 4: Custom editor와 draft를 구현한다.**

Custom을 선택했을 때만 catalog를 조회하고, 기존 interface의 busy 화면을 표시한다. 성공 결과는 해당 setup 세션 안에서만 재사용한다. 오류·빈 결과·미지원 상태를 설명하고 preset 선택으로 돌아갈 수 있게 한다.

역할 목록은 다섯 역할의 선택값·미확인 상태와 `Done`을 표시한다. 모든 역할이 catalog와 일치할 때만 Done을 수락한다. 유효하지 않은 Done에는 설명을 보여 주고 편집을 계속한다. 조합 선택과 editor 양쪽에서 복사본을 사용해 Back 시 부분 변경이 남지 않게 한다.

- [ ] **Step 5: prepare·installer·upgrade를 연결한다.**

`prepareOperation`으로 Custom 인수를 전달한다. 기존 설치의 Custom은 status에서 draft로 복원하고, package preset을 사용하는 install/update에서도 덮어쓰지 않는다.

`buildPresetPlan`은 preset 이름뿐 아니라 다음 model 설정의 serialized bytes와 기존 bytes를 비교한다. 이 비교로 Custom 재편집과 migration을 저장하고 완전한 noop을 유지한다.

Upgrade는 기존 `modelConfig` 경로를 사용해 credential이나 catalog 재조회 없이 저장된 설정을 보존한다. 필요한 변경은 기존 snapshot/transaction 안에서 수행한다.

- [ ] **Step 6: focused·PTY·manifest를 확인한다.**

Run:

```bash
node --test tests/node/models.test.mjs tests/node/model-catalog.test.mjs tests/node/tui-setup.test.mjs tests/node/tui-app.test.mjs tests/node/preset.test.mjs tests/node/plan.test.mjs tests/node/management-operations.test.mjs tests/node/upgrade-harness.test.mjs
node --test tests/node/tui-app-pty.test.mjs
python3 -m unittest discover -s tests -p 'test_codex_models.py'
node scripts/update-manifest.mjs
npm run check:manifest
git diff --check
```

Expected: focused·PTY 통과, manifest 일치, whitespace 오류 없음.

Claude 모델/profile 검사는 Step 4의 네 method만 필수로 실행하며, working directory는 repository의 tests 디렉터리다.

- [ ] **Step 7: fresh QA에서 통합 동작을 확인한다.**

QA는 Codex/Claude와 install/preset 흐름을 함께 확인해 초기값·복원·preview·Back·Done·Apply, catalog 실패 후 built-in 사용, 작은 터미널·interrupt, migration·transaction·offline upgrade를 검증한다.

전체 검사는 실행을 시도하고 결과·실제 종료 상태·중단 여부를 보고한다.

    npm test
    python3 -m unittest discover -s tests

현재 확인된 baseline에서 npm test는 consumer.test.mjs 실패와 release-artifact-process.test.mjs의 정체가 있어 완료되지 않았고, 전체 Claude payload 검사에는 122개 기존 assertion 실패가 있다. 따라서 전체 명령은 반드시 다시 시도하되, Custom 변경의 gating 검사는 Task별 focused checks와 fresh QA다. 전체 명령이 중단되거나 실패하면 전체 suite 통과로 표시하지 않는다. Custom 관련 신규 실패, focused 검사 실패 또는 관련 baseline의 확대가 확인되면 acceptance를 보류한다. unrelated Claude policy·consumer·release-artifact 코드는 이번 범위에서 수정하지 않는다.

- [ ] **Step 8: Orchestrator acceptance 후 focused commit을 만든다.**

권장 제목은 `feat: integrate custom preset editing and persistence`다. Orchestrator만 acceptance·commit·SHA·남은 변경 확인을 수행한다.

**Acceptance criteria:** Global Constraints의 모든 항목, RF2–RF5, 기존 세 preset 회귀 없음, Custom 성공·실패 양쪽에서 일관된 Apply 경계. 모든 T1–T3 필수 focused checks, fresh QA, 최종 Reviewer 조건을 충족하고 필수 범위에서 새 실패가 없어야 한다. 전체 npm test와 전체 Claude payload 결과는 시도·보고하되, 사전 확인된 범위 밖 실패·중단 자체는 이번 feature acceptance의 차단 조건이 아니다. 전체 suite 통과는 주장하지 않고 실패와 증거 공백을 계속 명시한다.

**Holds:** schema/catalog/transaction/secret/terminal 복구의 미해결 실패, 필수 focused check 실패, Custom 관련 신규 전체-suite 실패, 미실행 필수 QA 또는 unresolved Reviewer finding이 있으면 acceptance를 보류한다. 전체 suite의 기존 unrelated 실패·중단은 그대로 보고하고 수정하지 않는다. 환경 변경·dependency 도입·skip 추가로 자동 회피하지 않는다.

---

## 최종 전체 검증 및 독립 Reviewer

모든 Task의 필수 QA·acceptance·focused commit 확인 뒤 독립 Reviewer가 전체 변경을 한 번 검토한다. Reviewer는 Task별 commit 전 gate가 아니다.

검토 대상:

- 기준 HEAD `ead47dfd70b3d8fe8354968f48265016b7b79f34`부터 최종 HEAD까지의 전체 변경
- version 1→2, 비활성 Custom, 같은 preset 저장, upgrade 계약
- exact-ID/capability 근거, pagination·child lifecycle·timeout
- API credential 전송 대상·redaction·비영속성
- preview/draft/Done/Apply/Back 경계
- manifest·fixture·packaged runtime의 새 module 참조
- 필수 QA 대상 revision과 최종 변경의 일치

Reviewer finding은 Implementer가 수정하고 최종 계획 단계에서는 Reviewer가 필요한 재확인을 한다. 이 단계에서 QA로 자동 재배정하지 않는다. 첫 최종 Review 전에 필요한 QA와 QA 실패 재검사를 생략하지 않는다.

Orchestrator는 미해결 finding과 필수 focused check가 없는지 확인해 Custom 변경을 수용한다. 전체 npm/Python suite의 실패·중단 결과와 관련 증거 공백은 미해결 baseline으로 보고하며 전체 suite가 통과했다고 표현하지 않는다. push·PR 갱신·merge는 이 계획만으로 실행하지 않는다.

## 계획 문서 세트·실행 보류

공동 필수 문서는 formal spec과 plan v2다. spec은 기존 승인 설계와 plan v1의 제품 요구사항을 기록하며 새 결정을 추가하지 않는다. dependency plan은 없다.

plan v1은 사용자 승인을 받은 뒤 Markdown 공백만 정리해 SHA-256 d68f97f8266adaf66c7a4ca3036e0c6465bfdb5fc44e24f24cdd93fd85825dd0으로 남았고, 문서 전용 commit은 d9f2490bdf77162d3a8ff5cbf62dc9b84ba0311a다. v1 승인 당시 hash fc25e78c7d8b3b04cf50248caa2cc0e8249f29b6d406e9c2ef1867891004658d와 실제 chronology를 보존한다.

v2는 공동 문서 및 필수 Python 검사 방법을 변경하는 수정안이다. 문서 초안은 workspace에 저장돼 있으며 사용자 승인을 기다린다. 승인 전에는 구현을 시작하지 않는다.

1. 승인 뒤 Orchestrator가 현재 spec·plan byte hashes를 확인하고, 기존 plan v1 문서 commit d9f2490bdf77162d3a8ff5cbf62dc9b84ba0311a를 safe boundary에서 amend하여 두 문서를 포함한 focused docs-only commit으로 갱신한다. 별도 docs/fixup commit은 만들지 않는다.
2. commit·현재 byte·target·ownership·CLI state를 다시 검증한다.
3. cooperative plan-mode workflow에 동일한 spec·plan versions와 user approval을 기록한다.
4. 완전한 handoff를 마친 뒤 T1 Implementer를 배정한다.

V1–V4 중 미해결 항목은 영향 범위와 acceptance를 계속 보류한다.

## Planner 자체 검토

- **Coverage:** Custom 추가·두 진입점·초기화/저장 복원·cursor/Done/Apply·provider catalog·migration·profile·installer·upgrade·오류·secret·manifest를 T1–T3에 대응했다.
- **Step scan:** 각 Task에 RED·구현·GREEN·필수 fresh QA·Orchestrator acceptance/commit을 배치했다. 새 API의 서명·인수·결과·의존성을 정의했다.
- **Type consistency:** `customRoles`는 platform 형식의 역할 mapping, catalog는 공통 `Pair` 형식으로 나누어 변환 책임을 구분했다. upgrade의 기존 `modelConfig` 경로와 새 선택 검증도 분리했다.
- **Review Focus:** 다섯 항목 모두 담당 Task의 테스트에 연결했다.
- **Scope:** OAuth/private credential/새 로그인/third-party provider/새 dependency/영속 cache/자동 retry/모델 실행을 통한 권한 검사를 추가하지 않았다.
- **Evidence:** 현재 target 근거는 Orchestrator가 다시 확인했다. 과거 테스트 결과를 이번 acceptance 근거로 재사용하지 않는다.
- **Remaining holds:** provider의 정확한 wire contract·Codex catalog 실행 조건·현재 검사 환경은 구현 전 확인 사항으로 남겼다. 미확인 응답 형태를 추측하거나 새 제품 결정을 추가하지 않았다.
- **Actions:** Planner는 읽기만 수행했다. 파일 저장은 Orchestrator가 했으며, 구현·테스트 실행·Git/PR 작업은 아직 없다.
