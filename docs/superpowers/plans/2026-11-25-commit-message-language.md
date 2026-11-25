# 커밋 메시지 언어를 설치 언어 설정에 맞추기 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

- 상태: plan v4 (v1 2026-11-25T14:57:37+09:00 이전 사용자 승인; v2 2026-11-25T15:14:02+09:00 사용자 승인; v3 2026-11-25T15:29:45+09:00 사용자 승인: T3 추가; v4 2026-11-25T16:23:46+09:00 사용자 승인: 최종 Reviewer N3·N6 수정). T1·T2·T3·R1 수락 완료(2026-11-25). final Tester(ce4abc86)에서 새 실패 없음; AC5·AC8·AC9·T3-AC4·T3-AC5의 final 미검증은 사용자가 미검증으로 처분. T3 관련 테스트의 Node 1건·Python 493건 실패는 base와 이름이 같아 baseline으로 처분. T2의 실제 CLI ko 설치 확인(`consumer.test.mjs`)은 base에도 있는 `scripts/deploy.sh` manifest 누락으로 assertion에 도달하지 못해 미확인으로 처분
- Spec: `docs/superpowers/specs/2026-11-25-commit-message-language-design.md` (2026-11-25 사용자 승인, sha256 `0c912577064bbd852c288b1a2e35c0b0c3d74df960c3f7c85aa2005e07702a34`)
- 실행 대상: `/Users/ma-24-007/Desktop/workspace/arc`, 브랜치 `chore/final-tester-before-reviewer`, base `b522c873`
- 경로: Bounded, plan 필요 (task 3개)

## 개정 이력

| 버전 | 일자 | 분류 | 사유 | 영향 task | 승인 |
|---|---|---|---|---|---|
| v1 | 2026-11-25 | 최초 | spec 구현 계획(T1, T2) | T1, T2 | 사용자 승인 |
| v2 | 2026-11-25 | 검증 절차 변경 | 최종 검증의 전체 suite, `consumer.test.mjs`, base 비교를 Orchestrator가 아니라 final Tester가 직접 실행. 실행이 다시 실패하면 원인을 분석해 이 브랜치에서 수정 | 최종 검증 | 사용자 지시 |
| v3 | 2026-11-25 | 범위 추가 | final Tester 실행이 다시 실패함(실행 중인 명령을 남기고 turn 종료, 분리 실행 brief). 재발을 막는 명령 실행 규칙 T3 추가. commit-message-language spec 밖의 범위이며 사용자 지시("또 실패하면 … 이 브랜치에서 수정해")에 따름 | T3, 최종 검증 | 사용자 승인 |
| v4 | 2026-11-25 | 리뷰 수정 | 최종 Reviewer non-blocking N3(E1 안에서 "미완료 명령을 두고 보고 금지"와 "완료할 수 없으면 보고"가 충돌)와 N6(T3 계약 테스트의 줄 검사가 시작·끝만 확인)을 사용자가 이번 브랜치에서 고치기로 선택. N5(T3 체크박스)는 진행 기록으로 함께 반영 | 최종 Reviewer 수정 | 사용자 승인 |

**Goal:** 설치 언어(`en`/`ko`)를 커밋 description과 body의 기본 언어로 씁니다. 사용자가 명시적으로 언어를 요청하거나 프로젝트 지시가 언어를 정하면 그쪽이 우선합니다. 4개 플랫폼의 `references/commit.md`에 marker `{{ARC_COMMIT_LANGUAGE_POLICY}}`를 두고, 설치할 때 이 marker를 치환합니다.

**Architecture:**
- T1은 렌더러만 추가합니다(`language.mjs`, fragment 금지 regex). 이 단계에서는 설치 결과가 바뀌지 않습니다.
- T2는 원본 문서에 marker를 넣고, `renderSkillPayload`에 치환을 연결하고, 테스트·fixture·MANIFEST를 갱신합니다.
- 원본 문서 수정과 치환 연결은 T2 하나로 묶습니다. 나누면 문서만 먼저 바뀐 상태에서 marker가 치환되지 않은 채 그대로 설치됩니다.

**Tech Stack:** Node.js ESM(`node --test`), Python 3 `unittest`, JSON, Markdown

## Global Constraints

- spec §3.1 정책 문장, §3.2 문장, 오류 메시지 `Expected exactly one ARC commit language policy marker`는 한 글자도 바꾸지 않고 씁니다. 4개 플랫폼에 같은 문장을 넣습니다.
- 다음 출력 바이트는 바뀌면 안 됩니다(spec AC9): 기존 `languagePolicy`/`renderLanguagePolicy`/`runModePolicy`/`renderRunModePolicy`, SKILL.md 렌더 결과, profile 렌더 결과.
- 다음은 비목표라 건드리지 않습니다.
  - `settings.toml` 스키마
  - gemini/grok `instructions.md`, `GEMINI.md`, `AGENTS.md`, README, TUI 문구
  - managed section(손으로 편집 금지)
  - `lib/runtime/**`
  - 기존 `docs/superpowers/**`
- Python은 항상 `PYTHONDONTWRITEBYTECODE=1`을 붙여 실행합니다.
- Implementer(Codex bridge, sandbox) 규칙
  - allowedPaths는 정확한 파일 목록입니다.
  - 실행 중인 명령이 있으면 turn을 끝내지 않습니다.
  - 긴 suite(전체 `tests/node`, `consumer.test.mjs`)도 Tester가 직접 실행합니다(v2). 명령이 끝날 때까지 기다리고, sandbox에 실제로 막히면 environment block으로 보고합니다. 실행이 다시 실패하면 Orchestrator가 원인을 분석해 이 브랜치에서 수정합니다.
  - bridge가 실행되는 동안 Orchestrator는 ref를 움직이지 않습니다.
- Implementer와 Tester는 Git 상태를 바꾸지 않습니다. stage와 commit은 Orchestrator만 합니다.
- 커밋 메시지
  - type(scope)는 영어로, description과 body는 한국어로 씁니다. 설치 언어가 ko이고, 이번 변경이 이 규칙을 도입합니다.
  - task 하나에 focused commit 하나를 만듭니다.
  - plan 개정 trailer(`Plan-Revision`, `Plan-Approved-At`, `Plan-Reason`)는 `Co-Authored-By`와 같은 마지막 trailer 단락에 빈 줄 없이 둡니다.
  - `Plan-Approved-At`은 초와 timezone까지 포함한 ISO 8601 시각으로 씁니다.
- plan-level 기록은 handoff 기록에 남깁니다. 기록만을 위한 closing commit은 만들지 않습니다.

## Review Focus (최종 Reviewer)

| # | 확인할 것 | 근거 |
|---|---|---|
| 1 | 렌더러가 marker 0개·2개 이상·입력 없음에서 실패한다(fail-closed). 정책 문장이 spec §3.1과 바이트까지 같다 | AC1, AC2 |
| 2 | 치환 지점이 `renderSkillPayload` 하나뿐이다. 설치·재설치·Configure 언어 변경(`operations.mjs:100-102`)·업그레이드(`upgrade.mjs:16`)가 모두 이 지점을 지난다. 4개 플랫폼 설치본에 `{{ARC_`가 남지 않는다 | AC4, AC5 |
| 3 | 4개 플랫폼 commit.md·handoff-prep.md 문장이 spec §3.2와 같다. 원본에는 marker가 정확히 1개 있다. 영어를 강제하는 문구가 남아 있지 않다 | AC3, AC6 |
| 4 | fixture 해시 변경이 의도한 항목에만 있다: golden 32항목, `renderingBaseline` 8개, MANIFEST의 해당 항목 | AC8, AC9 |
| 5 | 합성 payload fixture(`plan.test.mjs`, `upgrade-harness.test.mjs`)를 고친 방식이 렌더러 검사를 느슨하게 만들지 않았다 | spec R2 |
| 6 | E1·E2가 승인 문안과 바이트까지 같고 위치가 맞다. 해시 변경이 T3-AC4 범위뿐이다. 측정하지 않은 플랫폼 동작을 단정하지 않는다 | T3-AC1–AC4 |

## 파일 구조

| 영역 | 파일 | Task |
|---|---|---|
| 렌더러 | `lib/installer/language.mjs` | T1 |
| fragment 검증 | `lib/prompts/render.mjs` | T1 |
| 치환 연결 | `lib/installer/plan.mjs` | T2 |
| 플랫폼 문서 | `{claude,codex,gemini,grok}/skill/references/commit.md`, `…/handoff-prep.md` | T2 |
| 단위·계약 테스트 | `tests/node/language.test.mjs`, `tests/node/agent-fragments.test.mjs` | T1 |
| | `tests/node/plan.test.mjs`, `tests/node/upgrade-harness.test.mjs`, `tests/node/consumer.test.mjs`, `tests/node/gemini-install.test.mjs`, `tests/node/grok-install.test.mjs`, `tests/test_claude_payload.py`, `tests/test_arc_policy.py`, `tests/test_harness_contract.py` | T2 |
| fixture | `tests/node/fixtures/instruction-contracts.json`, `tests/node/fixtures/installed-layout-golden.json` | T2 |
| 생성물 | `MANIFEST.sha256` | T1, T2 |

---

### Task T1: 커밋 언어 정책 렌더러 추가

**목표:** spec §3.1(`COMMIT_LANGUAGE_MARKER`, `commitLanguagePolicy`, `renderCommitLanguagePolicy`)과 §3.4(fragment 금지 regex)를 구현합니다. 설치 결과는 바뀌지 않습니다.

**Files (allowedPaths, 정확히 5개 파일):**

```
lib/installer/language.mjs
lib/prompts/render.mjs
tests/node/language.test.mjs
tests/node/agent-fragments.test.mjs
MANIFEST.sha256
```

**선행:** 없음 (base `b522c873`)

**Interfaces:** 새 export는 `commitLanguagePolicy(language) -> string`과 `renderCommitLanguagePolicy(bytes, language) -> Buffer`입니다. 기존 export의 시그니처와 출력은 그대로입니다.

- [x] **Step 1: 테스트 먼저 작성 (AC1, AC2, AC7)**
  - `tests/node/language.test.mjs`
    - `commitLanguagePolicy('en')`과 `('ko')`가 spec §3.1 문장(`<Lang>`이 각각 `English`/`Korean`)과 정확히 같은지 확인합니다.
    - `commitLanguagePolicy('fr')`은 `/Invalid language: fr/`로 실패해야 합니다.
    - en과 ko 각각에서 `renderCommitLanguagePolicy(Buffer.from('a {{ARC_COMMIT_LANGUAGE_POLICY}} b'), lang)`의 결과가 `'a '+commitLanguagePolicy(lang)+' b'`이고 marker가 남지 않는지 확인합니다.
    - marker가 0개일 때, 2개일 때, 입력이 `undefined`일 때는 `/Expected exactly one ARC commit language policy marker/`로 실패해야 합니다.
    - marker가 1개여도 언어가 `'fr'`이면 `/Invalid language/`로 실패해야 합니다.
  - `tests/node/agent-fragments.test.mjs`: `:39-46` 패턴을 따라 테스트를 추가합니다.
    - registry를 복제하고 fragment 하나의 `text` 뒤에 `' {{ARC_COMMIT_LANGUAGE_POLICY}}'`를 붙이면 `validateAgentRegistry`가 `/Invalid fragment/`로 실패해야 합니다.
    - 원본 registry는 통과해야 합니다.
- [x] **Step 2: RED 확인**
  - `node --test tests/node/language.test.mjs tests/node/agent-fragments.test.mjs`를 실행합니다.
  - 새 테스트만 FAIL해야 합니다. 그 밖의 실패가 있으면 이름과 함께 보고합니다.
- [x] **Step 3: 구현**
  - `lib/installer/language.mjs`
    - 상수 `COMMIT_LANGUAGE_MARKER='{{ARC_COMMIT_LANGUAGE_POLICY}}'`를 추가합니다.
    - `commitLanguagePolicy`를 추가합니다. 먼저 `validateLanguage`를 거칩니다.
    - `renderCommitLanguagePolicy`를 `renderLanguagePolicy`(`:48`)와 같은 형태로 추가합니다. 순서는 UTF-8(fatal) 디코딩, `validateLanguage`, `split(marker).length!==2`이면 오류, 치환입니다.
    - 기존 함수는 바꾸지 않습니다.
  - `lib/prompts/render.mjs:145`: regex를 `/ARC_AGENT_FRAGMENT|ARC_OUTPUT_LANGUAGE_POLICY|ARC_RUN_MODE_POLICY|ARC_COMMIT_LANGUAGE_POLICY|\[ARC role policy: contract (?:begin|end)\]/`로 바꿉니다.
- [x] **Step 4: MANIFEST**
  - `node scripts/update-manifest.mjs`를 실행하고 `npm run check:manifest`로 확인합니다.
  - diff는 `lib/installer/language.mjs`, `lib/prompts/render.mjs` 두 줄에만 있어야 합니다.
- [x] **Step 5: 관련 테스트와 범위 확인**
  - 아래 최소 집합을 실행합니다.
  - `node tests/node/fixtures/installed-layout.mjs --diff`의 출력이 비어 있어야 합니다.
  - 읽기 전용 `git status --porcelain`으로 변경 파일이 allowedPaths 5개와 untracked spec·plan뿐인지 확인합니다.
- [x] **Step 6: Commit (Orchestrator)**
  - 수락한 뒤 5개 파일과 spec·plan 문서를 commit 하나로 만듭니다.
  - 메시지: `feat(installer): 커밋 메시지 언어 정책 렌더러 추가`

**수용 기준:** spec AC1, AC2, AC7. AC9 중 이 task 범위는 golden `--diff` 출력이 비어 있고 `plan.test.mjs`가 통과하는 것으로 확인합니다.

**task 검증 (fresh Tester, `mode: task`) 최소 집합**

| 항목 | 분류·이유 |
|---|---|
| `tests/node/language.test.mjs` | (b) 새 단위 테스트, 기존 language 동작 회귀 |
| `tests/node/agent-fragments.test.mjs` | (b) fragment 금지 marker |
| `tests/node/run-mode-contract.test.mjs` | (a) 같은 `validateAgentRegistry` regex를 쓰는 marker 거부 테스트 |
| `tests/node/profile-render.test.mjs` | (a) `lib/prompts/render.mjs`의 profile 렌더 |
| `tests/node/plan.test.mjs` | (a) `language.mjs`를 import하는 설치 plan의 출력이 그대로인지 |
| `tests/node/manifest.test.mjs`, `npm run check:manifest` | (a)(c) MANIFEST |
| `node tests/node/fixtures/installed-layout.mjs --diff` (출력 없음) | (c) 설치 결과 무변경 |

**hold 조건:**
- 목록 밖 파일을 고쳐야 하는 경우(범위 변경)
- golden `--diff`에 출력이 있는 경우
- MANIFEST diff가 위 두 줄 밖에 있는 경우
- sandbox나 native build 때문에 실행이 막힌 경우(environment block으로 보고)
- 기준선에 없던 새 실패가 생긴 경우

---

### Task T2: commit.md marker 적용, 설치 치환 연결, fixture 갱신

**목표:** spec §3.2·§3.3을 적용하고 §4의 테스트·fixture를 갱신합니다. 함께 할 일은 두 가지입니다.
- 합성 payload fixture 2곳에 `references/commit.md`를 넣습니다(spec R2).
- 4개 플랫폼 설치본에 대한 assertion을 추가합니다(AC4·AC5 증빙).

**Files (allowedPaths, 정확히 20개 파일):**

```
claude/skill/references/commit.md
codex/skill/references/commit.md
gemini/skill/references/commit.md
grok/skill/references/commit.md
claude/skill/references/handoff-prep.md
codex/skill/references/handoff-prep.md
gemini/skill/references/handoff-prep.md
grok/skill/references/handoff-prep.md
lib/installer/plan.mjs
tests/node/plan.test.mjs
tests/node/upgrade-harness.test.mjs
tests/node/consumer.test.mjs
tests/node/gemini-install.test.mjs
tests/node/grok-install.test.mjs
tests/node/fixtures/instruction-contracts.json
tests/node/fixtures/installed-layout-golden.json
tests/test_claude_payload.py
tests/test_arc_policy.py
tests/test_harness_contract.py
MANIFEST.sha256
```

**선행:** T1 수락과 커밋

**Interfaces:** export는 바뀌지 않습니다. 설치되는 `skills/arc/references/commit.md`의 내용만 언어별로 달라집니다.

- [x] **Step 1: 테스트와 기대값 먼저 갱신**
  - `tests/node/plan.test.mjs`
    - `:8` `payload()`에서 플랫폼별로 실제 `references/commit.md` 파일을 `files`에 추가합니다(`${platform}/skill/references/commit.md`).
    - `:144` 언어 테스트에 두 가지를 확인하는 assertion을 추가합니다.
      - 생성된 `references/commit.md`에 `Write the description and any body in ${English|Korean} by default.`가 들어 있습니다.
      - `{{ARC_COMMIT_LANGUAGE_POLICY}}`가 남아 있지 않습니다.
    - codex/claude × en/ko 생성 skill의 모든 파일에 `/\{\{ARC_[A-Z_]+\}\}/`가 없는지 확인하는 테스트를 추가합니다(AC4).
    - `renderingBaseline`은 Step 5에서 바꿉니다.
  - `tests/node/upgrade-harness.test.mjs`
    - `:33` `payload()`의 플랫폼 루프에 실제 `references/commit.md`를 추가합니다(cwd 상대경로).
    - `:68-70` 테스트에서 `plans[0].generated.skill.get('references/commit.md')`가 seed 언어(codex `ko`, claude `en`)의 문장을 담는지 확인합니다. 업그레이드 경로의 AC5 증빙입니다.
  - `tests/node/consumer.test.mjs:65-68`: 실제 CLI로 `language:'ko'` 설치한 codex·claude 각각에 대해 다음을 확인합니다.
    - `references/commit.md`에 `Write the description and any body in Korean by default.`가 있습니다.
    - `{{ARC_`가 없습니다.
  - `tests/node/gemini-install.test.mjs:41` 다음과 `tests/node/grok-install.test.mjs`의 같은 standalone layout 테스트
    - 설치본 `skills/arc/references/commit.md`에 설치 언어의 문장이 있고 `{{ARC_`가 없는지 확인합니다.
    - 설치 언어는 `install(context)`가 넘기는 값입니다. 값이 없으면 `en`입니다.
  - `tests/node/fixtures/instruction-contracts.json:110, :229`
    - "Automatic commit after plan-task acceptance" 계약 `text`의 마지막 단락을 spec §3.2의 commit.md 원본 문장(marker 포함)으로 바꿉니다.
    - `protected`에는 해당 파일이 없으므로 바꾸지 않습니다.
  - `tests/test_claude_payload.py:520`: `'English description'`을 `'{{ARC_COMMIT_LANGUAGE_POLICY}}'`와 `'concise specific description'`으로 바꿉니다. `:522`의 `assertNotIn`은 그대로 둡니다.
  - `tests/test_arc_policy.py:166`
    - regex를 `r"conventional commits.*specific description.*trailing period.*lowercase.*scope.*\{\{arc_commit_language_policy\}\}"`로 바꿉니다.
    - 검사 대상 section이 소문자로 정규화되는지 확인하고, 그에 맞춰 대소문자를 맞춥니다.
    - 같은 테스트의 다른 regex는 건드리지 않습니다.
  - `tests/test_harness_contract.py`
    - `:389-390` COMMIT_BOUNDARY를 owner별로 나눕니다. 정규화는 기존 checker 방식을 따릅니다.
      - commit.md: `\{\{arc_commit_language_policy\}\}`
      - handoff-prep.md: `conventional commit message under \[commit\]\(commit\.md#automatic-commit-after-plan-task-acceptance\)`
    - `:651-657` `test_commit_guidance_uses_english_descriptions`를 `test_commit_guidance_uses_installed_language_marker`로 바꿉니다. 검사 내용은 다음과 같습니다.
      - commit.md에 marker가 정확히 1개 있습니다.
      - 두 파일 모두 `(?:english|korean)\s+(?:description|conventional commit)`에 걸리지 않습니다.
      - handoff-prep.md에 `commit.md#automatic-commit-after-plan-task-acceptance`가 있습니다.
- [x] **Step 2: RED 확인**
  - `node --test tests/node/plan.test.mjs tests/node/upgrade-harness.test.mjs tests/node/gemini-install.test.mjs tests/node/grok-install.test.mjs tests/node/instruction-layout.test.mjs`
  - `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest tests.test_harness_contract tests.test_claude_payload tests.test_arc_policy`
  - 새 기대값과 관련된 테스트만 FAIL해야 합니다. 그 밖의 실패는 이름과 함께 보고합니다.
  - `consumer.test.mjs`는 실행하지 않습니다(Orchestrator가 host에서 실행).
- [x] **Step 3: 원본 문서 편집 (AC3, AC6)**
  - 4개 플랫폼 `commit.md:26`과 `handoff-prep.md:73`을 spec §3.2 문장으로 바꿉니다.
  - managed section은 건드리지 않습니다.
- [x] **Step 4: 치환 연결 (AC4, AC5)**
  - `lib/installer/plan.mjs:7` import에 `renderCommitLanguagePolicy`를 추가합니다.
  - `:36` 다음에 spec §3.3의 한 줄을 넣습니다.
- [x] **Step 5: fixture 해시 재계산 (AC8, AC9)**
  - `renderingBaseline` 8개
    - 테스트의 계산 방식(`plan.test.mjs:228-239`)을 그대로 따릅니다.
    - 일회성 계산만 하고 새 파일은 만들지 않습니다.
  - golden
    - `node tests/node/fixtures/installed-layout.mjs --diff`를 실행합니다.
    - `~` 항목이 16개 조합 × `skills/arc/references/{commit,handoff-prep}.md`(32항목)에만 있으면 `--write`로 씁니다.
    - 그 밖의 항목이나 `+`/`-` 항목이 있으면 hold합니다.
    - 쓴 뒤에는 en과 ko의 commit.md 해시가 서로 달라야 합니다.
- [x] **Step 6: MANIFEST**
  - 마지막에 `node scripts/update-manifest.mjs`를 실행하고 `npm run check:manifest`로 확인합니다.
  - diff는 commit.md 4줄, handoff-prep.md 4줄, `lib/installer/plan.mjs` 1줄에만 있어야 합니다.
- [x] **Step 7: 관련 테스트, check, 범위 확인**
  - 아래 최소 집합을 실행합니다.
  - grep으로 확인합니다.
    - `rg -c -F '{{ARC_COMMIT_LANGUAGE_POLICY}}' {claude,codex,gemini,grok}/skill/references/commit.md`: 파일마다 1
    - `rg -n -i -e 'English description' -e 'English Conventional Commit' {claude,codex,gemini,grok}/skill`: 0건
  - `git status --porcelain`으로 변경 파일이 allowedPaths 20개뿐인지 확인합니다.
- [x] **Step 8: Commit (Orchestrator)**
  - 수락한 뒤 20개 파일을 commit 하나로 만듭니다.
  - 메시지: `feat(installer): 커밋 메시지 언어를 설치 언어 설정에 맞춤`

**수용 기준:**

| AC | 확인 방법 |
|---|---|
| AC3 | Step 7 grep, `test_harness_contract`의 새 테스트, `instruction-language.test.mjs` |
| AC4 | `plan.test.mjs`(codex·claude × en·ko, `{{ARC_` 없음), `gemini-install`·`grok-install`, golden에서 en/ko 해시가 다름 |
| AC5 | 업그레이드 경로는 `upgrade-harness.test.mjs`로 확인합니다. Configure 언어 변경과 재설치는 같은 `buildInstallPlan`을 거치므로 `plan.test.mjs`의 language 인자 테스트와 Reviewer의 경로 확인으로 증빙합니다. 실제 CLI ko 설치는 `consumer.test.mjs`로 확인합니다 |
| AC6 | `test_claude_payload` prep 단언, `test_harness_contract` COMMIT_BOUNDARY |
| AC8 | 관련 테스트 통과. 전체 suite는 최종 검증에서 확인합니다 |
| AC9 | golden diff가 32항목에만 있고, SKILL.md·profile 해시는 그대로입니다 |
| AC10 | `npm run check:role-policy` 통과 |

**task 검증 (fresh Tester, `mode: task`) 최소 집합**

| 항목 | 분류·이유 |
|---|---|
| `tests/node/plan.test.mjs` | (b) 합성 payload, AC4, `renderingBaseline` |
| `tests/node/upgrade-harness.test.mjs` | (b) 합성 payload, 업그레이드 경로 |
| `tests/node/gemini-install.test.mjs`, `tests/node/grok-install.test.mjs` | (b) 4개 플랫폼 설치본 |
| `tests/node/installed-layout-golden.test.mjs` | (b) golden |
| `tests/node/instruction-layout.test.mjs` | (b) 계약 텍스트 fixture |
| `tests/node/instruction-language.test.mjs` | (a) 변경 문서의 한글 금지 |
| `tests/node/{plan-level-records-contract,test-scope-contract,role-policy}.test.mjs` | (a) commit.md·handoff-prep.md를 직접 읽음 |
| `tests/node/language.test.mjs` | (a) 연결된 렌더러 |
| `tests/node/{manifest,upgrade-snapshot-scope,legacy-parity}.test.mjs` | (a) 실제 payload로 설치·업그레이드 plan을 만듦 |
| Python `tests.test_harness_contract`, `tests.test_claude_payload`, `tests.test_arc_policy` | (b) 갱신한 계약 |
| `npm run check:role-policy`, `npm run check:manifest`, `node scripts/check-installer-parity.mjs`, `node tests/node/fixtures/installed-layout.mjs --diff`(출력 없음) | (c) check 스크립트 |
| `tests/node/consumer.test.mjs` | (b) 실제 CLI. Orchestrator가 host에서 실행하고, Tester는 그 출력을 받아 판정합니다 |
| Step 7 grep | AC3 |

**hold 조건:**
- 목록 밖 테스트나 fixture를 고쳐야 하는 경우. 예를 들어 다른 합성 payload가 `references/commit.md` 없이 `buildInstallPlan`에 도달하는 경우입니다. 이때 렌더러를 느슨하게 만들어 해결해서는 안 됩니다. Orchestrator에게 보고하고 plan 개정과 승인을 거칩니다.
- golden `--diff`에 32항목 밖의 항목이 있는 경우
- MANIFEST diff가 위 9줄 밖에 있는 경우
- 생성 스크립트가 allowedPaths 밖에 쓰거나 sandbox에 막힌 경우
- 기준선에 없던 새 실패나 new-failure candidate가 생긴 경우

---

### Task T3: 명령 실행 규칙 — 분리 실행과 미완료 종료 금지 (plan v3 추가)

**배경 (측정값):** Codex CLI 0.172, macOS, workspace-write에서 측정했습니다.
- 이전 final Tester는 foreground 명령이 실행 중일 때 turn을 끝냈고 결과를 잃었습니다(dispatch exit 0, terminatedBy null).
- 이번 final Tester는 brief의 `( cmd > log; echo exit > done ) &`를 따랐습니다. `( sleep 20; echo x > bg.done ) &` 다음 호출에서 `sleep 30`을 해도 `bg.done`이 생기지 않았습니다. stderr에 `nice(5) failed: operation not permitted`도 나왔습니다. 작업이 사라지는 원인은 분리해 확인하지 않았습니다.
- 260초 foreground 명령은 실행 1회와 같은 exec session polling 8회로 exit 0까지 끝났습니다(gpt-6.1-terra/medium, 1회 측정).
- 측정하지 않은 것: 10분이 넘는 전체 suite, sandbox 안의 `consumer.test.mjs`, 다른 플랫폼, gpt-6.2-sol.

**목표:** Implementer와 Tester의 명령 실행 규칙(E1)과 Orchestrator 쪽 규칙(E2)을 4개 플랫폼에 같은 문장으로 넣습니다. 문안에는 측정하지 않은 플랫폼별 동작을 쓰지 않습니다.

**E1** (영문 그대로. `implementer.execution-steps` 4번과 `tester.verification-steps` 2번에 같은 바이트로 넣습니다). v4에서 다섯 번째 문장을 E1v4로 개정했습니다("최종 Reviewer 수정 R1" 절):

> Run each command in the foreground. If the tool returns while the command is still running, keep waiting on that same session with the longest supported wait until it reports an exit code; DO NOT replace that wait with `sleep` loops or short status checks. DO NOT detach commands with `&`, `nohup`, `setsid` or an equivalent. NEVER end the turn or report while a command you started is unfinished. If a command cannot be run to completion, report an environment block with the command, elapsed time, partial output and what remains unverified. Return a brief that prescribes detached execution to Orchestrator as an instruction conflict.

적용 뒤 줄은 다음과 같습니다.
- Implementer 4번: `4. DO NOT recreate, clean up or archive worktrees. <E1>`. 기존 두 문장 `Wait once for long commands with the longest yield or report them to Orchestrator. DO NOT repeat `sleep` or short status checks.`는 지웁니다.
- Tester 2번: 기존 줄 끝(`…broaden verification without authorization.`)에 ` <E1>`을 붙입니다.

**E2** (영문 그대로. 4개 플랫폼 `verification.md`의 `**Final mode**` 문단 바로 다음 문단):

> **Command execution:** Implementer and Tester briefs MUST NOT prescribe detached execution such as `&`, `nohup` or `setsid`; they require long commands to run in the foreground and be waited on in the same session until an exit code. Orchestrator does not run a Tester's assigned suites in its place unless Tester reports an environment block with evidence and the user chooses that run.

**배치 이유:**
- 새 fragment를 만들면 `render.mjs`의 `EXPECTED`, registry target 8개, 템플릿 8개, `protected` 4개, 개수 단언까지 바뀝니다. 기존 fragment 두 개의 문구만 고치는 쪽이 가장 작습니다.
- E2를 `verification.md` test-scope 절에 두면 native와 bridge에 모두 적용됩니다. Tester 배정 전에 읽는 문서이고, 검사를 배정하는 Implementer brief도 이 절을 근거로 씁니다.
- `resultComparisonParagraph`는 절의 마지막 문단이어야 하므로(`test-scope-contract.test.mjs:436`) 그 뒤에는 넣지 않습니다.
- `coordination.md`의 "Long commands use one wait at maximum yield" 등은 Orchestrator 자신의 대기 규칙이고 계약 fixture에 고정돼 있어 바꾸지 않습니다.

**Files (allowedPaths, 정확히 10개 파일):**

```
lib/prompts/agent-fragments.json
claude/skill/references/verification.md
codex/skill/references/verification.md
gemini/skill/references/verification.md
grok/skill/references/verification.md
tests/node/test-scope-contract.test.mjs
tests/node/fixtures/instruction-contracts.json
tests/node/fixtures/installed-layout-golden.json
tests/node/plan.test.mjs
MANIFEST.sha256
```

바꾸지 않는 것: profile 템플릿 20개, `protected` 전체, `lib/prompts/render.mjs`, `lib/policy/role-policy.json`과 런타임 사본, `coordination.md`, SKILL.md, managed section, `agent-fragments.test.mjs`(fragment 26개와 target별 개수가 그대로).

**선행:** T1·T2 커밋, plan v3 사용자 승인. 새 Implementer를 배정합니다.

- [x] **Step 1: 테스트 먼저 (`tests/node/test-scope-contract.test.mjs`)**
  - 상수 `commandExecutionRule`(E1)과 `commandExecutionParagraph`(E2)를 추가합니다.
  - 4개 플랫폼에서 Implementer와 Tester 렌더에 E1이 정확히 한 번 있습니다. 나머지 세 role에는 없습니다.
  - Implementer에서 `4. DO NOT recreate, clean up or archive worktrees. `로 시작하는 줄이 정확히 하나이고 E1로 끝납니다.
  - Tester에서 `2. Run authorized tests and inspect output, `으로 시작하는 줄이 정확히 하나이고 E1로 끝납니다.
  - `Wait once for long commands`가 registry 원본과 렌더 20개에 없습니다.
  - 4개 플랫폼에서 `**Command execution:**`로 시작하는 문단이 정확히 하나이고 E2와 같으며, `**Final mode**` 문단 바로 다음에 있습니다.
- [x] **Step 2: RED 확인**
  - `node --test tests/node/test-scope-contract.test.mjs`에서 새 테스트만 실패해야 합니다. 다른 실패는 이름과 함께 보고합니다.
- [x] **Step 3: 문안 편집**
  - `agent-fragments.json` 두 fragment의 `text`, 4개 플랫폼 `verification.md`를 고칩니다.
- [x] **Step 4: fixture 해시**
  - `instruction-contracts.json`의 `agentProfileBaseline.profiles`에서 `arc-implementer` 4개와 `arc-tester` 4개, 모두 8개만 바꿉니다. 계산은 `agent-fragments.test.mjs:29-34` 방식이며 일회성으로 하고 새 파일은 만들지 않습니다. `revision`과 `protected`는 그대로 둡니다.
  - `node tests/node/fixtures/installed-layout.mjs --diff`의 `~`가 다음 32항목에만 있으면 `--write`로 씁니다. 그 밖의 항목이나 `+`/`-`가 있으면 hold합니다.
    - `skills/arc/references/verification.md` 16개
    - write 조합 8개 × `agents/arc-implementer.*`, `agents/arc-tester.*` 16개
  - `plan.test.mjs`의 `renderingBaseline` 8개 값만 바꿉니다. 다른 줄은 바꾸지 않습니다.
- [x] **Step 5: MANIFEST**
  - 마지막에 `node scripts/update-manifest.mjs`, `npm run check:manifest`를 실행합니다. diff는 `agent-fragments.json` 1줄과 `verification.md` 4줄, 모두 5줄이어야 합니다.
- [x] **Step 6: 관련 테스트와 범위 확인**
  - 아래 최소 집합을 실행하고, `git status --porcelain`으로 변경 파일이 allowedPaths 10개와 plan 문서뿐인지 확인합니다.
- [x] **Step 7: Commit (Orchestrator)**
  - 10개 파일과 plan v3 개정을 commit 하나로 만듭니다.
  - 메시지: `chore(policy): 명령 분리 실행과 미완료 종료 금지 명시`
  - 마지막 trailer 단락에 `Plan-Revision: <gitPath> v2 -> v3`, `Plan-Approved-At`(실제 승인 시각, 초와 timezone 포함), `Plan-Reason`, `Co-Authored-By`를 빈 줄 없이 둡니다.

**수용 기준:**

| AC | 내용 | 확인 |
|---|---|---|
| T3-AC1 | E1이 4개 플랫폼 Implementer·Tester 렌더에 같은 바이트로 정확히 한 번, 지정한 줄 끝에 있고 다른 role에는 없다 | Step 1 테스트 |
| T3-AC2 | `Wait once for long commands`가 원본과 렌더에 없다 | Step 1 테스트 |
| T3-AC3 | E2가 4개 플랫폼에 정확히 한 번, Final mode 문단 바로 다음에 있고 test-scope 절이 플랫폼끼리 byte-identical이다 | Step 1 테스트와 기존 절 비교 |
| T3-AC4 | 바뀐 해시가 profile baseline 8, golden 32, `renderingBaseline` 8, MANIFEST 5뿐이고 `protected`는 그대로다 | diff와 관련 테스트 |
| T3-AC5 | 관련 테스트와 check 통과, 기준선에 없던 새 실패 없음 | task Tester |
| T3-AC6 | 변경 파일이 allowedPaths와 plan 문서 안에 있다 | `git status --porcelain` |

이 AC는 문안과 구조만 증명합니다. role이 실제로 지키는지는 증명하지 않으며, 다음 final Tester 실행에서 관찰한 범위만 기록합니다.

**task 검증 (fresh Tester, `mode: task`) 최소 집합**

| 항목 | 분류·이유 |
|---|---|
| `tests/node/test-scope-contract.test.mjs` | (b) 갱신한 계약 |
| `tests/node/agent-fragments.test.mjs` | (b) profile 해시 8개, fragment 개수 유지 |
| `tests/node/instruction-layout.test.mjs` | (b) fixture 계약과 `protected` |
| `tests/node/installed-layout-golden.test.mjs` | (b) golden |
| `tests/node/plan.test.mjs` | (b) `renderingBaseline` |
| `tests/node/{run-mode-contract,instruction-language,plan-level-records-contract,role-policy}.test.mjs` | (a) fragment나 변경 문서를 직접 읽음 |
| `tests/node/{manifest,profile-render,upgrade-harness}.test.mjs` | (a) `agent-fragments.json`을 payload나 렌더 입력으로 읽음 |
| Python `tests.test_harness_contract`, `tests.test_arc_policy`, `tests.test_claude_payload` | (a) 렌더 profile·verification.md를 읽음. 기존 실패는 이름으로 구분 |
| `npm run check:manifest`, `npm run check:role-policy`, `node scripts/check-installer-parity.mjs`, `node tests/node/fixtures/installed-layout.mjs --diff`(출력 없음) | (c) check |

`test_arc_policy.py:859-863`은 현재 없는 문구를 기대하므로 이미 실패하는 테스트로 보입니다(읽기로만 판단). base에서도 실패하면 baseline이고 이번에 고치지 않습니다.

T3의 Implementer와 Tester brief에도 E1 전문을 넣습니다.

**hold 조건:**
- 목록 밖 파일을 고쳐야 하는 경우
- `protected`나 지정하지 않은 golden 항목이 바뀌는 경우
- 생성 스크립트가 sandbox에 막힌 경우(environment block)
- 기준선에 없던 새 실패가 생긴 경우
- role 명령이 다시 미완료로 끝난 경우. 성공으로 기록하거나 자동으로 재시도하지 않고 Orchestrator가 원인을 확인합니다.

---

### 최종 Reviewer 수정 R1: E1 중단 절차와 줄 전체 검사 (plan v4 추가)

**배경:** 최종 Reviewer(b522c873..ce4abc86)는 blocking finding 없이 non-blocking 6건을 보고했습니다. 사용자는 N3, N6, N5를 이번 브랜치에서 처리하고 N1·N2·N4는 후속 과제로 남기기로 했습니다.
- N3: E1의 "NEVER end the turn or report while a command you started is unfinished"와 "If a command cannot be run to completion, report an environment block …"이 함께 있으면, 멈춘 명령 앞에서 보고할 방법이 없습니다.
- N6: `test-scope-contract.test.mjs`의 E1 줄 검사가 시작 문자열과 끝 문자열만 확인해서, 중간에 다른 문장이 끼어도 통과합니다.

**E1 개정 (E1v4).** 바뀌는 곳은 다섯 번째 문장뿐입니다. 이전 `If a command cannot be run to completion, report an environment block` 부분이 `If a command cannot be run to completion, stop it, confirm it has exited, then report an environment block`이 됩니다. 전문(영문 그대로, `implementer.execution-steps` 4번과 `tester.verification-steps` 2번에 같은 바이트로):

> Run each command in the foreground. If the tool returns while the command is still running, keep waiting on that same session with the longest supported wait until it reports an exit code; DO NOT replace that wait with `sleep` loops or short status checks. DO NOT detach commands with `&`, `nohup`, `setsid` or an equivalent. NEVER end the turn or report while a command you started is unfinished. If a command cannot be run to completion, stop it, confirm it has exited, then report an environment block with the command, elapsed time, partial output and what remains unverified. Return a brief that prescribes detached execution to Orchestrator as an instruction conflict.

E2와 `verification.md`는 바꾸지 않습니다.

**Files (allowedPaths, 정확히 6개 파일):**

```
lib/prompts/agent-fragments.json
tests/node/test-scope-contract.test.mjs
tests/node/fixtures/instruction-contracts.json
tests/node/fixtures/installed-layout-golden.json
tests/node/plan.test.mjs
MANIFEST.sha256
```

이 plan 문서는 Orchestrator가 고칩니다(N5 체크박스와 v4 기록).

- [x] **Step 1: 테스트 먼저.** `commandExecutionRule`을 E1v4로 바꿉니다. E1을 넣는 줄 검사를 줄 전체 동등성으로 바꿉니다. Implementer는 `4. DO NOT recreate, clean up or archive worktrees. ` + E1, Tester는 `2. Run authorized tests and inspect output, but DO NOT edit source, documents, tests or configuration. DO NOT repair failures or broaden verification without authorization. ` + E1과 정확히 같은 줄이 하나씩 있어야 합니다. 나머지 단언은 그대로 둡니다.
- [x] **Step 2: RED 확인.** `node --test tests/node/test-scope-contract.test.mjs`에서 E1 관련 테스트만 실패해야 합니다.
- [x] **Step 3: 문안 편집.** `agent-fragments.json`의 두 fragment에서 위 한 부분만 바꿉니다.
- [x] **Step 4: fixture 해시.**
  - `agentProfileBaseline.profiles`: `arc-implementer` 4개와 `arc-tester` 4개, 모두 8개만 바꿉니다. `revision`과 `protected`는 그대로 둡니다.
  - golden: `--diff`의 `~`가 write 조합 8개 × `agents/arc-implementer.*`·`agents/arc-tester.*`, 모두 16항목에만 있을 때 `--write`로 씁니다.
  - `renderingBaseline`: 바뀌는 값만 바꿉니다(최대 8개).
- [x] **Step 5: MANIFEST.** `node scripts/update-manifest.mjs`, `npm run check:manifest`를 실행합니다. diff는 `agent-fragments.json` 1줄이어야 합니다.
- [x] **Step 6: 관련 테스트.** T3 task 검증 최소 집합을 Implementer가 실행하고 base와 실패 이름을 대조합니다.
- [x] **Step 7: 재확인과 커밋.** 최종 Reviewer가 diff를 다시 확인합니다(Tester는 다시 배정하지 않음). 그 뒤 Orchestrator가 follow-up commit 하나를 만듭니다. 메시지는 `chore(policy): 실행 불가 명령의 중단 절차와 줄 전체 검사 추가`이고, trailer는 `Plan-Revision v3 -> v4`, `Plan-Approved-At`, `Plan-Reason`, `Co-Authored-By`입니다.

**수용 기준:**
- R1-AC1: E1v4가 4개 플랫폼 Implementer·Tester 렌더에 같은 바이트로 정확히 한 번 있고, 지정한 줄과 줄 전체가 같으며, 다른 role에는 없습니다.
- R1-AC2: 바뀐 해시는 profile baseline 8, golden 16, `renderingBaseline` ≤8, MANIFEST 1뿐이고 `protected`는 그대로입니다.
- R1-AC3: 관련 테스트와 check를 실행했을 때 기준선에 없던 새 실패가 없습니다.
- R1-AC4: 변경 파일은 allowedPaths 6개와 plan 문서뿐입니다.

**hold 조건:** T3와 같습니다.

**후속 과제(이번에 고치지 않음):**
- N1: UI 서버 검사와 E1의 관계 명시
- N2: Claude·Gemini·Grok의 `run_in_background`가 분리 실행에 해당하는지
- N4: E2 예외를 HEAD suite로 한정할지

---

## R2/R3 해소 (plan 작성 시 읽기 결과)

- **R2 (합성 payload):** `buildInstallPlan`에 도달하는 합성 payload는 두 곳입니다. 둘 다 T2에 넣었습니다.
  - `tests/node/plan.test.mjs:8` `payload()`
  - `tests/node/upgrade-harness.test.mjs:33` `payload()`
  - 다른 테스트의 `files:new Map`은 plan 객체를 직접 만들 뿐 `renderSkillPayload`를 지나지 않습니다.
  - 그 밖의 호출은 모두 실제 payload를 씁니다.
- **R3 (설치본과 원본의 바이트 비교):** 설치본 reference를 바이트로 비교하는 곳은 `brainstorming.md`, `superpowers-provenance.json`, `coordination.md`뿐입니다. commit.md와 handoff-prep.md를 비교하는 곳은 없습니다.
- **남은 위험:** 정적 grep으로 못 찾은 간접 경로가 있을 수 있습니다. 최종 검증의 대체 검사로 확인하고, 발견되면 위 hold 절차를 따릅니다.

## 최종 검증 (`mode: final`)

T2를 수락·커밋한 뒤, verified HEAD에서 fresh Tester를 한 번 배정합니다. 최종 Reviewer는 final-mode Tester 작업이 다음을 모두 마친 뒤에 시작합니다.

1. 보고 전달
2. 새 실패를 Implementer → Tester로 해결
3. new-failure candidate와 intermittent candidate 처분
4. 승인된 full regression이 있으면 완료
5. undeterminable 항목 처분

**base 비교**
- base `b522c873`의 깨끗한 worktree에서 같은 테스트 이름끼리 대조합니다.
- 이 worktree에는 native addon을 쓰기 위해 ignore된 `build` symlink가 있어야 합니다.
- 기존 실패와 불안정한 테스트는 단독으로 다시 실행해 구분합니다.
- 전체 suite, `consumer.test.mjs`, base 이름별 재실행은 final Tester가 직접 실행합니다(v2). Orchestrator는 base worktree만 준비하고 그곳에서 테스트를 돌리지 않습니다.

**실행 범위**
1. **모든 계약 테스트**
   - Node: `tests/node/{language,plan,test-scope-contract,run-mode-contract,plan-level-records-contract,watch-import-graph,manifest,installed-layout-golden,parity-check,instruction-layout,instruction-language,agent-fragments,role-policy,composite-instructions,profile-render,hardcoding-residual,menu-label-residual}.test.mjs`
   - Python: `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest tests.test_harness_contract tests.test_arc_policy tests.test_claude_payload -v`
2. **모든 check 스크립트**
   - `npm run check:role-policy`
   - `npm run check:manifest`
   - `node scripts/update-runtime-assets.mjs --check`
   - `node scripts/check-installer-parity.mjs`
   - `node tests/node/fixtures/installed-layout.mjs --diff`
3. **재변경 파일의 관련 테스트**
   - 예상되는 겹침은 `MANIFEST.sha256`(T1·T2)이므로 `manifest.test.mjs`와 `check:manifest`를 다시 확인합니다.
   - Tester가 `git diff --name-only <T1 commit> HEAD`로 교차 확인합니다.
4. **트리거 대체 검사**

| 트리거 | 잠정 판단 | 대체 검사 | 이유 |
|---|---|---|---|
| (1) 공유 모듈 | 해당 | 아래 "트리거 (1) 대체 검사 범위" 참고 | 모든 설치·업그레이드·Configure 경로와 profile 렌더가 쓰는 모듈, 4개 플랫폼 reference가 바뀜 |
| (2) 외부 변경 통합 | 해당 없을 예정 | 없음. Orchestrator가 통합 이력을 brief에 적음 | 통합 계획 없음 |
| (3) 의존성·설정 | 해당 없을 예정 | `git diff --name-only b522c873 HEAD -- package.json package-lock.json` 결과 없음 | 변경 없음 |
| (4) 공개 인터페이스 | 해당 없을 예정 | diff로 기존 export 시그니처, CLI 옵션, `settings.toml` 키가 그대로인지 확인 | export만 추가 |

**트리거 (1) 대체 검사 범위**
- 출발점: `lib/installer/language.mjs`, `lib/installer/plan.mjs`, `lib/prompts/render.mjs`, 4개 플랫폼 `references/{commit,handoff-prep}.md`
- 정적 import와 경로 문자열로 역의존성을 추적합니다.
- grep으로 찾은 후보: `plan`, `language`, `install-mode*`, `upgrade-harness`, `upgrade-snapshot-scope`, `legacy-parity`, `manifest`, `consumer`, `installed-layout-golden`, `hardcoding-residual`, `management-operations`, `preset`, `agent-fragments`, `run-mode-contract`, `profile-render`, `gemini-install`, `grok-install`, `tui-setup`, `instruction-{layout,language}`, `plan-level-records-contract`, `test-scope-contract`, `role-policy`, `package`
- 다음 fixture를 import하는 파일도 포함합니다: `tests/node/fixtures/{install-mode,installed-layout}.mjs`, `tests/node/fixtures/platforms/package-root.mjs`
- 범위를 확정할 수 없으면 한 단계 넓힙니다.

**판정할 수 없는 항목이 생기면**
- item, cause, substitute checks run, remaining unverified scope를 보고합니다.
- 사용자가 다음 중 하나를 고를 때까지 최종 수용과 최종 Reviewer를 보류합니다: (i) full regression 승인, (ii) CI 대체, (iii) unverified 처분.

**T3 이후 다시 시작 (v3)**

1. 앞선 final Tester 시도의 결과는 쓰지 않습니다. 완료된 명령 결과가 없고, HEAD도 바뀝니다.
2. T3를 수락·커밋한 뒤 새 HEAD에서 clean 상태를 확인하고, fresh Tester(`mode: final`)에게 새로 배정합니다.
3. brief에 E1 전문을 넣습니다. 설치된 profile에는 아직 이 규칙이 없을 수 있기 때문입니다. 명령은 파일 묶음 단위로 나누고, 명령마다 exit code와 테스트 이름별 결과를 요구합니다. 분리 실행이나 done 파일 방식은 쓰지 않습니다.
4. 실행 범위 1–4는 새 HEAD에서 모두 다시 실행합니다. `consumer.test.mjs`와 필요한 base 재실행도 Tester가 직접 합니다.
5. 재변경 파일 후보는 `MANIFEST.sha256`, `instruction-contracts.json`, `installed-layout-golden.json`, `plan.test.mjs`(T2 → T3)와 `test-scope-contract.test.mjs`(T2 Tester가 실행 → T3 변경)입니다. Orchestrator가 T1·T2 각 커밋 기준 `git diff --name-only`로 확정하고 Tester가 교차 확인합니다.
6. 트리거 (1) 출발점에 `lib/prompts/agent-fragments.json`과 4개 플랫폼 `verification.md`를 추가합니다. 추가 후보: `test-scope-contract`, `agent-fragments`, `run-mode-contract`, `manifest`, `package`, `plan`, `upgrade-harness`, `installed-layout-golden`, `instruction-layout`, 설치 profile을 검사하는 `gemini-install`·`grok-install`·`consumer`, Python 3개. (2)–(4)의 잠정 판단은 그대로입니다.
7. Tester dispatch의 60분 제한 안에 끝나지 않으면 environment block으로 보고하고 hold합니다. Orchestrator가 대신 실행하려면 사용자 선택이 있어야 합니다.
8. 보고, 새 실패의 Implementer → Tester 처리, candidate 처분, 승인된 full regression, undeterminable 처분이 모두 끝난 뒤 최종 Reviewer가 `b522c873..HEAD` 전체를 한 번 검토합니다.

final-mode Tester가 찾은 새 실패를 고치면 Implementer → Tester로 처리합니다. 최종 Reviewer finding은 Implementer → Reviewer로 처리합니다.

**최종 Reviewer**
- final Tester 작업이 끝난 뒤 base..HEAD 전체를 한 번 검토합니다. 초점은 Review Focus 1–5입니다.
- finding은 Implementer → Reviewer로 처리하고 Tester는 다시 배정하지 않습니다.
- 수정분은 재확인이 끝날 때까지 커밋하지 않고, 끝나면 follow-up commit 하나로 만듭니다.

## 요구 추적

| 요구 | Task/Step | 확인 |
|---|---|---|
| G1 (en/ko 기본, description+body) | T1 Step 3, T2 Step 3–4 | AC1, AC4 |
| G2 (우선순위) | T1 Step 3 | AC1 |
| G3 (모든 경로·4개 플랫폼) | T2 Step 4 | AC4, AC5 |
| G4 (fail-closed, `{{ARC_` 없음) | T1 Step 3, T2 Step 1 | AC2, AC4 |
| spec §3.4 marker 위생 | T1 Step 3 | AC7 |
| spec §4 fixture | T2 Step 1, 5, 6 | AC8, AC9 |
| spec R2 | T2 Step 1 | Review Focus 5 |
| managed section 무변경 | T2 Step 3 | AC10 |
| 사용자 지시(Tester 실행 실패 수정) | T3 | T3-AC1–AC6, 다음 final Tester 실행 관찰 |

## 참고

- spec §4 표에 없던 테스트 파일 4개를 T2에 넣었습니다. `upgrade-harness.test.mjs`는 spec R2 처리 방침에 따른 것이고, `consumer`·`gemini-install`·`grok-install`은 AC4·AC5 증빙용입니다. spec은 바꾸지 않았습니다.
- `MANIFEST.sha256`에는 `docs/`와 `tests/`가 들어가지 않습니다.
- T2 Step 2와 T2 task 검증 표의 "`consumer.test.mjs`는 Orchestrator가 host에서 실행"은 v1 시점의 기록입니다. 최종 검증에는 v2·v3를 적용합니다.
