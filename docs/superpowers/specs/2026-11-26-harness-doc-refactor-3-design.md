# 하네스 지침 리팩토링 3차 + 문자열 고정 테스트 정비 설계

- 날짜: 2026-11-26
- 경로: **Architectural**. plan이 필요하고 spec과 plan을 한 번에 승인받는다. 위험: **상**
- 기준: `/Users/yunho/Desktop/project/arc`, `master` HEAD `8ec7d907f77e1fb288f6ce63d8a8973d9aacb7ed`, clean
- 실행 대상(사용자 선택 2026-11-26, 재확인 "그대로 사용"): 현재 checkout의 새 브랜치 `refactor/harness-doc-refactor-3`(base `8ec7d907`)
- 착수 확인: 2026-11-26 사용자 "이 범위로 착수"(통합 v2 요약, U6 수정 포함)
- 연결 plan: `docs/superpowers/plans/2026-11-26-harness-doc-refactor-3.md`(writing-plans 전체 밀도)
- 이 문서의 줄 번호 인용은 모두 base `8ec7d907` 기준이다.

## 0. 요구사항과 결정

### 0.1 요청 요지
1. 지침 문서(4플랫폼 `SKILL.md`, references, agents, 원천 JSON)를 의미를 보존한 채 다시 정리한다. 공통 문단은 shared 공용 문서로 옮기고, 규범어는 대문자로 쓰며, 문장을 정리한다.
2. 그보다 먼저 지침 문장을 글자 그대로 고정한 테스트를 정비한다. 지금은 문장을 다듬을 때마다 테스트를 함께 고쳐야 해서, 테스트가 독립 검증 구실을 하지 못한다.

### 0.2 사용자 결정

| ID | 결정 |
|---|---|
| U1 | 지침 문서 전체를 재검토한다. |
| U2 | 이전 결정 D1–D10은 재사용하지 않는다. |
| U3 | B안. 4플랫폼 공통 문단을 `shared/skill/references/`의 새 공용 문서로 추출한다. |
| U4 | 대문자화 (나). 다섯 조동사와 문장 머리의 `Never`/`Do not`을 대문자로 쓴다(`NEVER`/`DO NOT`). `Always`/`Only`/`required`는 그대로 둔다. |
| U5 | (2). 의미를 보존하는 범위에서 같은 파일 안의 반복 진술과 군더더기를 정리한다. 문장마다 전후를 대조한다. |
| U6(수정) | 원래 결정은 (다)였다. 고정 문장도 같은 기준으로 다루고 테스트 기대 문자열을 함께 고치되, 검사 삭제·패턴 완화·`/i` 변경은 하지 않고, 바꾼 고정 문장은 전후를 기록한다. **2026-11-26 수정**: 이 규칙은 U7 정비 뒤에도 남는 규칙 문장 고정에만 적용한다. 나머지 고정은 U7에 따라 지우거나 완화한다. |
| U7 | 정비 1안. 규칙 문장만 글자 그대로 고정한다(대소문자 구분, 한 곳에서 한 번만 확인). 설명 산문은 섹션 전문 비교와 agent 프로필 SHA 비교를 없애고, heading·anchor·링크·핵심 낱말이 있는지만 확인한다. |
| U8 | 규칙 문장 범주는 승인, 금지, 권한, Git, 외부 작업, 역할 경계다. |
| U9 | (2026-11-26, T0 결과 후) 정비 대상 파일의 기준선 실패 test도 고정마다 분류해 정비한다. base 문서에 맞는 문장이 없는 고정(stale)은 삭제하고 대응표에 남긴다. `tests/test_harness_contract.py`의 의도된 기준선 실패(T3 결정 대기 기록)는 건드리지 않는다. |
| U10 | (2026-11-26) 실행 대상은 현재 checkout을 유지한다. 현재 checkout의 git-ignored 로컬 파일 `scripts/update-superpowers-local.sh` 때문에 생기는 `tests/node/manifest.test.mjs` 16건 실패는 환경 기준선으로 기록하고 test ID로 비교한다. T0 기준선의 일부는 깨끗한 임시 worktree에서 쟀다(§3.8). |
| U11 | (2026-11-26) 고정 inventory는 T0가 아니라 정비 task(W1·W2)에서 Implementer가 대응표와 함께 만들고, 그 task의 Tester가 독립적으로 다시 만들어 대조한다. |

U6의 원래 결정과 재확인 이력: 고정 규모(손작성 산문 고정이 플랫폼당 약 550건, 테스트 파일 약 20개)를 알린 뒤 사용자가 "(다) 그대로 진행"을 골랐다. 그 뒤 사용자가 범위 통합("테스트 정비 작업과 리팩토링을 함께 진행해")을 요청하고 U7을 선택해 위와 같이 수정됐다.

작성자 판단 J1–J45는 §13에 있다.

## 1. 의도, 목표, 비목표

- **의도**
  - 지침 문구를 고칠 때 테스트가 기계적으로 함께 깨지지 않게 한다.
  - 사고로 이어지는 규칙 문장(U8)이 설치본에서 사라지거나 바뀌면 테스트가 반드시 실패하게 한다.
  - 그다음 지침 문서를 짧고 일관되게 다듬는다.
- **목표**
  - 정비 뒤 지침 문장을 정확히 고정하는 곳은 `tests/node/fixtures/rule-pins.json` 한 곳뿐이다.
  - 4플랫폼 공통 문단은 플랫폼 파일마다 사본으로 두지 않고 shared 공용 문서 하나에 둔다.
  - 규범어 표기가 일관된다.
- **비목표**
  - 규칙의 의무·권고·예외·적용 범위·우선순위를 바꾸지 않는다.
  - 새 규칙을 추가하지 않는다.
  - 고정되지 않았던 규칙 문장에 새 고정을 추가하지 않는다(J34).
  - superpowers 계열, 기록 문서, 불분명 문서는 수정하지 않는다.
- **실패로 보는 경우(anti-goal)**
  - 테스트는 통과하지만 정비 중에 규칙 문장 고정이 빠졌다.
  - 공용 문서로 옮긴 문단이 원래 섹션에서 읽히지 않게 됐다(링크나 연결 안내 누락).
  - 의도된 기준선 실패 집합이 설명 없이 달라졌다.

## 2. 대상 분류와 change / no change

| 분류 | 파일 | 표기 | 근거 |
|---|---|---|---|
| 지침 문서 | `{claude,codex,gemini,grok}/skill/SKILL.md` | change. U4·J2·U5만 적용하고 추출은 하지 않는다. | U1, J4 |
| 지침 문서 | `{claude,codex,gemini,grok}/skill/references/{arc-visual-companion,commit,coordination,git-recovery,handoff,handoff-prep,limits,planning,verification}.md` | change. U3 추출과 U4·J2·U5를 적용한다. | U1, U3, J6 |
| 지침 문서 | `{claude,codex,gemini,grok}/skill/references/worktree-creation.md` | change. U4·J2·U5만 적용하고 추출은 하지 않는다. | J11, J26 |
| 지침 문서 | `shared/skill/references/handoff-worktree.md` | change. U4·J2·U5를 적용한다. | v1 change 목록 |
| 새 공용 문서 | `shared/skill/references/{arc-visual-companion,commit,coordination,git-recovery,handoff,handoff-prep,limits,planning,verification}-common.md`(9개) | change(신규) | U3, J13, J26 |
| agents | `{claude,gemini,grok}/agents/arc-{implementer,planner,reviewer,scouter,tester}.md`, `codex/agents/arc-{…}.toml` | change. marker와 관리 블록 밖의 template 산문만 고치고, 추출은 하지 않는다. | J5 |
| 원천 | `lib/policy/role-policy.json`(`rules[].text`, `platforms.*.notice`), `lib/prompts/agent-fragments.json`(`fragments[].text`), `lib/installer/global-config.mjs`의 `agentsBlockBody()` 문장 리터럴 | change | J3, U4 |
| 재생성 | 관리 블록(POLICY_TARGETS), `shared/skill/runtime/role-policy.json`, `MANIFEST.sha256`, `tests/node/fixtures/installed-layout-golden.json` | change. 생성기로만 바꾼다. | J9 |
| 테스트(정비) | `tests/node/fixtures/instruction-contracts.json` | change(§3.5) | U7 |
| 테스트(정비) | `tests/node/instruction-layout.test.mjs`, `agent-fragments.test.mjs`, `role-policy.test.mjs`, `test-scope-contract.test.mjs`, `composite-instructions.test.mjs`, `plan-level-records-contract.test.mjs`, `run-mode-contract.test.mjs` | change | U7, §3 |
| 테스트(정비) | `tests/test_arc_policy.py`, `tests/test_claude_payload.py`, `tests/test_harness_contract.py` | change | U7, §3 |
| 테스트(구조) | `tests/node/instruction-language.test.mjs` | change. `instructionFiles`에 새 `*-common.md` 9개를 추가만 하고, 검사 방식은 바꾸지 않는다. | Hangul 금지 검사가 새 지침 파일에도 적용되어야 한다. |
| 새 테스트 | `tests/node/fixtures/rule-pins.json`, `tests/node/rule-pins.test.mjs`, `tests/node/fixtures/effective-doc.mjs` | change(신규) | J18, J30 |
| 계획 문서 | 이 spec과 plan | change(Orchestrator 저장) | — |
| parity | `tests/installer-parity.json` | **no change**. 원 assertion inventory가 SHA로 동결돼 있다(`scripts/check-installer-parity.mjs:13-19`). destination 보존은 J33이 맡는다. | 동결 계약 |
| parity 검사기 | `scripts/check-installer-parity.mjs` | no change. 생성기·검사 코드다. | v1 no change |
| Python | `tests/test_codex_models.py`, `tests/test_token_usage.py`, `tests/qa_model_cases.py` | no change. `model_reasoning_effort` 같은 비산문 토큰과 models 설정만 고정한다(`p0-pinned.md:3237-3244`). `models.toml`은 수정 대상이 아니다. | J20, J23 |
| Node 기타 | `p0-pinned.md:2-81`에서 1–42건으로 잡힌 나머지 Node 테스트(`role-observe`, `role-routing-dispatch`, `grok-bridge`, `role-bridge-run`, `install-mode-*`, `host-gemini-grok`, `manifest`, `plan`, `gemini-platform`, `platform-registry`, `profile-render`, `parity-check`, `legacy-profile-cleanup`, `role-fixtures.mjs`, `readme-gate-consistency` 등) | no change. 고정 대상이 marker(`[ARC role policy: contract begin]`, `{{ARC_OUTPUT_LANGUAGE_POLICY}}`), ID(`common.brief-boundary`, `- [git.specialists-deny]`), 경로, 런타임 출력 토큰(`permission_scope_unverified`)이고(`p0-pinned.md:85-102,114-115,1185-1191`), 리팩토링은 이것들을 바꾸지 않는다(J20, J23). T0 검사에서 이 파일들에 산문 고정이 나오면 §12 H-6을 따른다. | J23, J43 |
| 생성기·설치 코드 | `lib/policy/*.mjs`, `lib/prompts/render.mjs`, `lib/installer/skill-sources.mjs`, `lib/installer/superpowers.mjs`, `scripts/*` | no change | v1 |
| fixture 도구 | `tests/node/fixtures/installed-layout.mjs`, `static-references.mjs` | no change. 새 shared 파일은 golden 재생성이 반영한다. | v1 |
| superpowers | `shared/skill/references/{brainstorming,writing-plans,test-driven-development,writing-good-tests,visual-companion,builder-check-prompt}.md`, `superpowers-*`, `references/scripts/*` | no change | 제외 |
| 불분명(보고만) | `README.md`, `docs/harness-operation.md`, `docs/runtime/planner-hook-context.md`, `gemini/GEMINI.md`, `gemini/instructions.md`, `grok/AGENTS.md`, `grok/instructions.md`, `*/skill/models.toml` | no change | v1 |
| 기록 | `docs/superpowers/**` 기존 파일 | no change | v1 |
| 기타 | `package.json`, `lib/runtime/*`, `shared/skill/runtime/*.mjs` | no change | v1 |

## 3. 테스트 정비(U7)

### 3.1 고정 분류 규칙(P0-7 정의)

정비 대상 테스트 파일(§2의 "테스트(정비)" 행)에서 지침 문서·원천·렌더링 결과를 상대로 문자열이나 정규식을 확인하는 assertion은 하나하나가 고정 1건이다. 대상 assertion은 `includes`, `assert.match`, `assert.equal`, `startsWith`, `assertIn`, `assertRegex`, `split` 기반 섹션 자르기 등이다. 고정마다 아래 순서대로 보고, 처음 해당하는 분류 하나를 붙인다.

1. **기준선 실패**: T0에서 실패한 test ID에 속한 assertion이다.
   - (a) 의도된 기준선 실패(`tests/test_harness_contract.py`, §3.8 (a)): 유지한다. 그 test 본문은 수정하지 않는다(J32).
   - (b) 그 밖의 기준선 실패(U9): 고정이 맞히는 문장·heading이 base의 대상 텍스트에 없으면 stale이다. → 삭제한다(처리 "삭제(stale)", J44). 맞는 문장이 있거나 고정이 문서 문자열 고정이 아니면 이 분류를 건너뛰고 2–6을 적용한다. stale 판정이 애매하면 유지하고 애매 표시를 한다.
2. **동작**: 비교 대상이 지침 파일 읽기나 지침 template 렌더링이 아니라 코드 실행 결과(spawn 출력, 런타임 함수 반환값, 설치 결과 목록)다. → 유지한다(J23).
3. **구조**: heading, `<a id>`, 링크 대상, 파일 존재, 표 행 존재, marker, 규칙 ID, 개수, 순서, 크기 상한, 플랫폼 간 동등성을 고정한다. → 유지한다. 대상 본문이 공용 문서로 옮겨질 수 있으면 effective 문서(§3.4)를 읽게 바꾼다.
4. **규칙**: 고정이 맞히는 문서 문장(정규식이면 T0 base에서 실제로 맞는 문장)이 아래 (a)와 (b)를 모두 만족한다. → `rule-pins.json`으로 이전한다.
   - (a) 규범 형태: 다음 중 하나를 포함한다.
     - `MUST`, `MUST NOT`, `SHOULD`, `SHOULD NOT`, `MAY`, `NEVER`, `DO NOT`(대소문자 무관)
     - `only`, `require(s|d)`, `cannot`, `no … without`
     - 명령형으로 시작하는 문장
     - "Before X, …" 형태의 선행 조건
   - (b) U8 범주 키워드를 포함한다.
     - 승인: approve/approval, explicit choice, confirmation, authoriz-
     - 금지: (a)의 금지어 자체
     - 권한: permission, sandbox, escalation, authority, read-only, allowed tools
     - Git: commit, push, merge, rebase, reset, stash, branch, worktree, amend, stage, HEAD
     - 외부 작업: push, merge, deploy, publish, external
     - 역할 경계: 역할명(Orchestrator, Scouter, Planner, Implementer, Tester, Reviewer)과 own/assign/edit/delegate/create agents
5. **산문**: 1–4 어디에도 해당하지 않는다.
   - 고정 문장에 J20 비산문 토큰(식별자, 경로, 명령, code span, anchor id)이 있으면 구조·낱말 확인으로 바꾼다. 확인 내용은 "해당 heading이나 anchor가 있다"와 "그 섹션의 effective 텍스트에 그 토큰들이 있다"이다.
   - 토큰이 없으면 삭제한다. 사유는 "산문 전용"으로 적는다.
6. **중복**: 같은 문서 문장을 다른 행이 이미 규칙(이전)이나 구조로 맡고 있다. → 삭제하고, 사유에 맡은 행 ID를 적는다.

**애매한 경우(J21, J31)**: 아래 셋 중 하나이면 기본 처리는 **규칙으로 이전**이다. 이 경우를 애매 목록에 올려 보고하고, 보호를 줄이는 쪽으로 혼자 정하지 않는다.
- (i) (a)만 만족한다.
- (ii) (b)만 만족하는 서술문이다.
- (iii) 정규식이 여러 문장에 걸친다.

**예시**
- 규칙: `handoff-prep.md#planning-document-commit` "Architectural paths permit no document commit before the one combined spec+plan approval; …"(`instruction-layout.test.mjs:126`). 규범 형태(no … before)이고 승인·Git 범주다.
- 규칙: Codex `git-recovery.md` "request through the permission system only the supported minimum escalation for that exact single Git command and workspace, never broad Git access"(`instruction-layout.test.mjs:139`). 권한·Git 범주다.
- 규칙(J38): SKILL.md 읽기 gate 표의 trigger 셀(`instruction-layout.test.mjs:13`의 `gates`). "X 전에는 Y를 읽어야 한다"는 선행 조건이므로 금지 범주로 본다.
- 구조: `instruction-layout.test.mjs:64`가 확인하는 `` `task` `` … `` `refresh` `` 필드명. 비산문 토큰이다.
- 구조: `test-scope-contract.test.mjs:90-97`의 anchor 1회 출현과 heading 순서.
- 산문→낱말: Codex coordination의 Tester 예시 문장(`instruction-layout.test.mjs:154`). `` `tester_installer_checks` `` 토큰 확인만 남긴다.
- 산문→삭제: `instruction-contracts.json`의 `contracts[].text`에 든 섹션 전문 가운데 규칙 문장을 뺀 나머지 산문. 섹션 존재는 heading 확인이 맡는다.

### 3.2 처리 규칙

- 4플랫폼 루프로 반복하는 고정은 `rule-pins.json` 항목 1개로 이전하고, `platforms`에 해당 플랫폼을 모두 적는다.
- 플랫폼마다 문구가 다른 고정(플랫폼명만 다른 N 포함)은 플랫폼별 항목으로 나눈다. template 치환은 하지 않는다(J30).
- 정규식 고정을 규칙으로 이전할 때는 base 문서에서 그 정규식이 맞히는 문장 전체를 정확 텍스트로 옮긴다. 이는 고정을 강화하는 방향이므로 허용된다. 정규식 하나가 두 문장 이상에 걸치면 문장마다 항목을 만들고, 대응표 행에 항목 ID를 모두 적는다.
- `assert.throws(() => check(text.replace(…)))`처럼 규칙 문장을 일부러 바꿔 실패를 확인하는 자기 검사(`instruction-layout.test.mjs:26-31,42-43,55-56`)는 삭제한다. 정확 일치 고정이 같은 것을 보장하기 때문이다(J42).
- `checkLayout`의 문서 누락·gate 누락 음성 검사(`:119-122`)는 구조이므로 유지한다.
- 고정이 모두 빠진 test는 삭제할 수 있다. 단, J33(parity destination)과 J32(기준선 실패)는 예외다. test 이름은 바꾸지 않는다.
- 새 고정은 추가하지 않는다(J34). 구조 확인이 읽는 대상을 effective 문서로 바꾸는 것만 허용한다.

### 3.3 공용 규칙 fixture(J18, J30)

- 위치: `tests/node/fixtures/rule-pins.json`. 기존 fixture `tests/node/fixtures/instruction-contracts.json`의 관례를 따른다.
- 형식:

```json
{
  "version": 1,
  "rules": [
    {
      "id": "RP-001",
      "category": "git",
      "doc": "handoff-prep",
      "platforms": ["claude", "codex", "gemini", "grok"],
      "text": "Architectural paths permit no document commit before the one combined spec+plan approval; …",
      "origin": ["tests/node/instruction-layout.test.mjs:126"]
    }
  ]
}
```

  - `category`: `approval` | `prohibition` | `permission` | `git` | `external` | `role-boundary` 중 대표 범주 1개
  - `doc`: 확인 대상 텍스트를 가리킨다.

    | 값 | 대상 텍스트 |
    |---|---|
    | `core` | `<platform>/skill/SKILL.md` |
    | reference 이름(`handoff` 등) | effective 문서(§3.4) |
    | `shared:handoff-worktree` | `shared/skill/references/handoff-worktree.md` |
    | `agent:<role>` | `renderAgentProfile`로 렌더링한 플랫폼 profile |
    | `bootstrap` | `agentsBlockBody('/Users/u/.<platform>', '/Users/u', 'en', platform)` |

  - `text`: base 문서에 있는 그대로 적는다. 대소문자를 구분한다.
  - `origin`: 이전하기 전 assertion 위치. 대응표와 연결된다.
- 검사기 `tests/node/rule-pins.test.mjs`는 아래 세 가지를 확인한다.
  1. 스키마: `id`가 유일하고, (`doc`, `text`) 쌍이 유일하고, `platforms`가 비어 있지 않고, `category`가 허용 값이다.
  2. 포함: 항목마다, 플랫폼마다 대상 텍스트에 `text`가 들어 있다. 비교 전에 양쪽의 연속 공백을 공백 하나로 바꾸는 것만 한다. 대소문자 접기, `references/` 제거, 정규식은 쓰지 않는다.
  3. 배타성(한 곳에서 한 번만): `tests/` 아래 `*.mjs`, `*.py`, `*.json` 가운데 아래 세 파일을 뺀 파일에 어떤 항목의 `text`가 그대로(공백 정규화 후) 들어 있으면 실패한다.
     - `rule-pins.json` 자신
     - `tests/installer-parity.json`(동결 inventory)
     - `tests/node/fixtures/installed-layout-golden.json`
- Python의 사용: Python은 문장을 확인하지 않는다. J33에 따라 고정을 모두 이전한 parity destination test만 `json.loads((REPO / "tests/node/fixtures/rule-pins.json").read_text())`로 fixture를 읽고, 대체 항목 ID가 있는지만 확인한다(`self.assertTrue({…} <= ids)`). 같은 문장을 두 언어에서 두 번 확인하지 않기 위해서다.

### 3.4 effective 문서

- `tests/node/fixtures/effective-doc.mjs`는 `effectiveText(platform, name)`을 내보낸다.
  - 반환값: `<platform>/skill/references/<name>.md`와 `shared/skill/references/<name>-common.md`(있을 때만)를 줄바꿈 하나로 이은 문자열
  - `name === 'core'`이면 `SKILL.md`만 돌려준다.
- Python 3개 파일에는 같은 동작을 하는 내부 함수 `_effective(platform, name)`을 파일마다 둔다(J30). 새 Python 모듈은 만들지 않는다.
- 정비 task 시점에는 공용 문서가 아직 없으므로 effective 문서가 플랫폼 파일과 같다. 그래서 정비 직후 결과는 base 문서로 검증된다.

### 3.5 `instruction-contracts.json`

| 필드 | 처리 |
|---|---|
| `platforms.*.contracts[].text` | 제거한다. 그 안의 규칙 문장은 §3.1에 따라 `rule-pins.json`으로 이전한다. |
| `contracts[].heading`, `destination`, `reader` | 유지한다(구조). `checkLayout`은 heading이 destination effective 문서에 있는지 확인한다. |
| `contracts[].requiredBefore` | 제거한다. gate 표 trigger는 J38에 따라 fixture가 맡는다. 도달성은 "SKILL.md 표에 `references/<destination>.md` 링크 행이 있다"로 확인한다. |
| `relocations` | 제거한다(`text`에만 쓰였다). |
| `platforms.*.opening`, `platforms.*.bootstrap` | 제거한다. 그 안의 규칙 문장은 `core`·`bootstrap` 항목으로 이전한다. |
| `platforms.*.skill.{bytes,lines}`, `global.{bytes,lines}` | 유지한다(J10). |
| `worktreeHandoffRecordGuidance`, `worktreeHandoffRecordAuthorization` | 제거한다. §3.1에 따라 규칙 항목(doc `handoff`·`git-recovery`·`worktree-creation`)으로 이전하거나 구조 확인으로 바꾼다. 문단 위치는 J8에 따라 그대로 둔다. |
| `protected`의 agent 항목(`claude/agents/*.md`, `codex/agents/*.toml`) | 제거한다(U7). |
| `protected`의 `lib/policy/role-policy.json`, `shared/skill/runtime/role-policy.json` | 유지하고, 원천 task에서 갱신한다(J35). |
| `protected`의 기타 코드·models 항목 | 유지한다. no change. |
| `agentProfileBaseline` | 제거한다. `agent-fragments.test.mjs:19-36`의 SHA 비교는 렌더러 구조 검사로 바꾼다. 확인 내용: 렌더 결과에 `{{ARC_AGENT_FRAGMENT:`가 없고, target이 참조하는 fragment `text`가 marker 순서대로 각 1회 나온다. fragment·target 개수 검사(`:26-28`)는 유지한다. |

### 3.6 관리 블록(J19)

- `instruction-layout.test.mjs:96-102`의 동적 비교(`- [${rule.id}] ${rule.text}`)는 유지한다.
- 다른 테스트에 하드코딩된 관리 블록 규칙 문구 사본은 §3.1-6(중복)에 따라 삭제한다. 관리 블록 문구는 동적 비교와 `role-policy.json` 해시(J35)가 지킨다.
- P0-9 집계(2차 delta 기준 건수): `test_arc_policy.py` 56, `role-policy.test.mjs` 40, `test_claude_payload.py` 38, `test_harness_contract.py` 36, `test-scope-contract` 20.
- `manifest.test.mjs` 20건과 `gemini-platform` 등에서 나온 12건은 marker·경로 고정이므로 구조로 분류하고 no change로 둔다.
- `role-policy.test.mjs`의 구조 검사(규칙 ID, 투영 순서, 생성 결정성, 경계 marker)는 유지한다.

### 3.7 parity destination(J33)

`check-installer-parity.mjs`는 destination test 파일이 있는지 확인하고(`:24`), `--complete`에서는 destination test 이름이 실제로 실행되어 통과하는지 확인한다(`:47-58`).
- `tests/installer-parity.json`이 destination으로 가리키는 test는 삭제하지 않고 이름도 바꾸지 않는다.
- 그런 test의 고정을 모두 이전하거나 삭제하게 되면, 구조 assertion 하나나 fixture ID 존재 assertion(§3.3)을 남긴다.
- 대상 목록은 T0가 만든다.

### 3.8 기준선 실패(J25, J32)

- T0는 정비 대상 파일과 계약 검사 집합에서 실패하는 test ID를 적는다. T0 결과(`.git/arc/workflows/harness-doc-refactor-3/t0-baseline.md`):
  - (a) 의도된 기준선 실패: `tests/test_harness_contract.py` failures=33(고유 method 16개, 2026-11-22 대조표 표 3의 기록)
  - (b) 그 밖의 Python 기준선 실패: `tests/test_arc_policy.py` failures=331·errors=6–7(고유 method 108개), `tests/test_claude_payload.py` failures=117(고유 method 32개). 깨끗한 worktree에서도 같다.
  - (c) 환경 기준선: 현재 checkout의 `tests/node/manifest.test.mjs` 16건(U10). 깨끗한 worktree에서는 82/82 통과한다.
  - (d) `node scripts/check-installer-parity.mjs --complete`: `tests/node/consumer.test.mjs` 3건 실패.
- (a)의 test 본문은 이 작업에서 바꾸지 않는다. 대응표에는 "유지(기준선 실패)"로 적는다.
- (b)의 test는 §3.1-1(b)로 정비한다. 정비 뒤 통과로 바뀌면 보고한다(새 실패가 아니다). 여전히 실패하면 남은 실패 assertion을 대응표에 적는다.
- 리팩토링 task 때문에 그 test의 실패 메시지가 달라져도, 같은 test ID의 실패라면 새 실패가 아니다.
- (a)의 test가 통과로 바뀌면 보고한다.

### 3.9 대응표(J24, SC-8)

- workflow 산출물이며 커밋하지 않는다. 저장 위치는 `.git/arc/workflows/harness-doc-refactor-3/` 아래다.
- 형식: `행 ID | 테스트 path:line | 이전 방식(literal/regex/섹션 전문/SHA/1회·위치) | 분류(§3.1 1–6) | 처리(유지/규칙 fixture 이전/구조·낱말 전환/삭제) | 대체 수단(RP-ID, 구조 assertion 위치, 맡은 행 ID) | 사유 | 애매 표시`
- 행 범위: 정비 task(W1·W2)의 Implementer가 만든 대상 파일 inventory(U11, J45)에 있는 모든 고정이 정확히 한 행씩 가진다. inventory 행 형식은 `path:line | 방식(literal/regex/섹션 전문/SHA/1회·위치/부재) | 대상 doc | 플랫폼 루프 | test ID | 기준선 실패 여부`다.

### 3.10 규칙 보호가 빠지지 않았다는 증명

정비 task마다 Tester가 다음을 확인한다.
- P1 완전성: 정비 task inventory의 모든 고정이 대응표에 한 행씩 있다. Tester가 inventory를 독립적으로 다시 만들어 행 수와 위치를 대조한다.
- P2 규칙 처리: 분류가 규칙인 행은 처리가 모두 "규칙 fixture 이전(RP-ID)"이거나 "유지(기준선 실패)"다. 삭제나 낱말 전환은 0건이다. "삭제(stale)" 행은 분류가 기준선 실패(b)이고, 맞는 문장이 base 대상 텍스트에 없다는 기계적 근거(검색 방법과 결과)를 가진다.
- P3 포함 관계: 이전한 행마다 원래 assertion이 대체 항목 `text`에 대해서도 통과한다. literal이면 `text`가 그 literal을 포함하고, regex이면 `text`(항목이 여럿이면 이어 붙인 텍스트)에 match된다. `node -e` 한 줄로 기계적으로 확인한다.
- P4 base 통과: 정비 task HEAD에서 `rule-pins.test.mjs`가 통과한다. 이 시점의 문서는 base와 같다.
- P5 배타성: `rule-pins.test.mjs`의 배타성 검사가 통과한다.

애매 목록과 삭제 행은 최종 Reviewer가 따로 표본 검토한다.

## 4. 공용 문서 추출(U3)

### 4.1 이름과 링크 형식(J13, J26)

- 이름은 `shared/skill/references/<name>-common.md`다. `<name>`은 원본 reference 이름이다. 플랫폼 skill 디렉터리에 같은 이름의 파일이 없으므로 C1(같은 경로) 충돌(`lib/installer/skill-sources.mjs:13`)이 생기지 않는다.
- 대상은 9개다(§2). `worktree-creation`은 S 블록이 1개(8%)뿐이고 N이 있어서 추출하지 않는다(J11, J26).
- 링크 형식(J13): references 안에서는 `<name>-common.md#<id>`로 쓴다. `SKILL.md`는 추출 대상이 아니므로(J4) 기존 링크(`references/<name>.md#<id>`)를 바꾸지 않는다.

### 4.2 이동 단위(J27)

- 이동 단위는 한 섹션 안에서 이어진 S 문단들(run)이다.
- S 판정은 task를 시작할 때 4플랫폼 바이트 비교로 다시 확인한다. `p0-classify.md`의 범위는 출발점으로만 쓴다.
- 플랫폼 파일에 남기는 것:
  - heading 줄과 `<a id>` 줄(anchor는 옮기지 않는다)
  - M(관리 블록, J7)
  - D 문단
  - N 문단(J11)
  - 일부만 공통인 표의 표 전체
- 한 섹션의 run이 D 문단으로 나뉘어 있으면 run마다 따로 옮긴다.

### 4.3 연결 문장과 공용 문서 구조(J28)

- 플랫폼 파일에서 run을 옮긴 자리에는 아래 한 줄을 둔다. 문구는 고정이다.

  `Shared text for this section: [<name>-common.md#<id>](<name>-common.md#<id>). It applies here exactly as if written in place.`

- 공용 문서의 구조:
  1. 첫 줄: `# <원본 첫 heading> — shared text`
  2. 머리말 한 문단(고정 문구): `This file holds text shared by every platform's <name>.md. Each part belongs to the section that links to it and has the same force there.`
  3. run마다 다음 세 줄을 차례로 둔다.
     - `<a id="<id>"></a>`
     - 원래 heading과 수준·문구가 같은 heading
     - 옮긴 문단(바이트 그대로)
- `<id>` 정하는 법:
  - 원래 섹션에 `<a id>`가 있으면 그 id를 쓴다. 같은 섹션의 두 번째 이후 run은 `<id>-2`, `<id>-3`으로 쓴다.
  - anchor가 없는 섹션이면 `<name>-<heading을 소문자·하이픈으로 바꾼 slug>`를 쓴다.

### 4.4 anchor와 링크 처리

- 플랫폼 파일의 `<a id>` 집합과 heading 줄은 바뀌지 않는다. 그래서 기존 `#anchor` 링크는 모두 그대로 유효하다. 여기에는 다음이 포함된다.
  - 4플랫폼 문서 사이의 링크
  - `docs/harness-operation.md`의 `coordination.md#bridge-target-rules`, `planning.md#full-auto-run-mode`
  - `lib/installer`, `lib/policy`, `lib/prompts`의 링크
- 옮긴 문단 안에서 같은 파일을 가리키던 fragment 링크 `(#id)`는 `(<name>.md#id)`로 바꾼다(J29).
- 다른 파일을 가리키는 링크(`handoff.md#…`)는 그대로 둔다. 설치 뒤 같은 `references/` 디렉터리에서 풀리기 때문이다(`handoff-worktree.md:4,16` 선례).
- 링크 무결성(J39)은 Tester 절차로 확인한다.
  - 대상: 모든 지침 문서와 공용 문서
  - 확인 내용: 상대 링크 파일이 플랫폼 또는 shared에 있는가, `#id`가 대상 파일의 `<a id>`나 heading slug에 있는가
  - 기준: T0 결과와 대조해 새로 깨진 링크가 0건이어야 한다.

### 4.5 테스트의 섹션 자르기

| 위치 | 처리 |
|---|---|
| `instruction-layout.test.mjs:14`(handoff 직접 경로 섹션) | 정비 task에서 규칙 문장을 `rule-pins.json`(doc `handoff`, effective)으로 이전하고 `fastSections`를 삭제한다. 섹션 존재는 heading·anchor 구조 확인으로 남긴다. |
| `instruction-layout.test.mjs:128`(planning-document-commit) | 위와 같이 규칙으로 이전한다. |
| `instruction-layout.test.mjs:133`(shared handoff-worktree) | 규칙이면 doc `shared:handoff-worktree` 항목으로 이전한다. |
| `instruction-layout.test.mjs:137`(Codex git-recovery) | codex 전용 항목으로 규칙 이전한다. |
| 그 밖에 heading·anchor로 본문을 자르는 정비 대상 테스트(예: `test-scope-contract.test.mjs:88-101`) | 구조 검사(anchor 1회, heading 순서)는 플랫폼 파일 기준으로 유지하고, 본문 확인은 effective 문서 기준으로 바꾼다. |

## 5. 문장 판정 규칙

### 5.1 대문자화(U4, J3, J36, J37)

- 변환은 대소문자만 바꾼다.
  - `must`→`MUST`, `must not`→`MUST NOT`
  - `should`→`SHOULD`, `should not`→`SHOULD NOT`
  - `may`(허가)→`MAY`
  - 문장 머리의 `Never`→`NEVER`, `Do not`/`do not`→`DO NOT`
- 문장 머리에는 `;`나 `:` 뒤에 오는 독립절 명령형도 포함한다(J36). 예: `Hold unavailable routes; do not invent …`
- 문장 중간의 부사 `never`(예: `…, never remote HEAD`)는 바꾸지 않는다.
- `may`의 판정(J3):
  - 허가이면 바꾼다. 행위 주체가 무엇을 하도록 허락받는 경우다. 예: `Implementer may request loopback`(`coordination.md:214`)
  - 가능성이면 그대로 둔다. 예: `Raw responses may appear`, `may need recheck`, `Linked .git may be a file`
  - 양쪽으로 다 읽히면 hold하고 보고한다. 예: `Approved working revisions may differ from HEAD/index`
- `must`는 무생물 주어의 요건(`choice must be explicit`)도 `MUST`로 바꾼다.
- 제외:
  - 인용, 단어 자체를 설명하는 곳, 예시, code span, 제목, anchor, marker
  - frontmatter(`name`, `description`). 보고만 한다(J37).
  - 관리 블록. 원천을 고치고 재생성한다(J3).
- 축약형(`Don't`)은 바꾸지 않고 보고한다(J36).

### 5.2 명확화(J2)

- 실제로 모호하고, 저장소 안의 근거(path:line)로 원래 의도를 확인할 수 있는 문장만 고친다.
- 고치는 범위는 주체·시점·대상을 밝히는 데 한정한다.
- 근거가 없거나 근거끼리 충돌하면 고치지 않고 후보로 보고한다.

### 5.3 문장 정리(U5)

- **허용**
  1. 같은 파일 안에서 주체·조건·강도·범위가 같은 진술이 반복되면 하나를 지운다. 더 구체적인 쪽을 남긴다.
  2. 군더더기를 지운다. 예: `in order to`→`to`, 의미 없는 `that is`, `basically`, 중복 수식어
  3. 주체·조건이 같은 이웃 문장 둘을 합친다. 열거 항목은 그대로 둔다.
  4. 한 문장 안에서 절 순서를 바꾼다. 조건이 같은 대상에 걸릴 때만 허용한다.
- **금지**
  - 강도 변경(`MUST`↔`SHOULD`, `NEVER`↔`MAY` 등)
  - 열거 항목·조건·예외·주체·범위 한정어(`only`, `every`, `each`, `all`, `before`/`after`)의 추가나 삭제
  - code·경로·식별자·명령·링크·anchor·heading·예시 변경
  - 파일 사이 중복 제거(이는 U3가 맡는다)
  - 섹션 사이 이동
- **예시**
  - 허용: 같은 파일 두 곳에 같은 범위의 금지 문장(예: amend 금지)이 반복되면 뒤쪽 반복을 지운다. 단, 남는 문장의 범위가 지운 문장과 같거나 더 넓어야 한다. 실제 대상 위치는 구현 때 ledger 근거로 확인한다(Orchestrator 주: 첫 초안의 위치 인용은 fixture 기준이라 문서 위치를 대조하지 않았다).
  - 금지: `Push/merge/publish/deploy/install retain separate approvals.`에서 `install`을 지우는 것. 열거 항목이 바뀐다.

### 5.4 플랫폼 묶음(J41)

- 같은 문장이 둘 이상의 플랫폼 파일에 있으면 같은 task에서 같은 편집을 적용한다.
- 묶음 중 한 곳이라도 hold이면 묶음 전체를 hold한다.
- 공용 문서로 옮긴 S 문단은 공용 문서에서 한 번만 편집한다.

## 6. 원천과 재생성(J3, J9, J35)

순서:
1. 원천 문구를 편집한다(`role-policy.json`, `agent-fragments.json`, `agentsBlockBody()` 리터럴).
2. `npm run update:role-policy`를 실행한다. 관리 블록이 재생성된다.
3. `node scripts/update-runtime-assets.mjs`를 실행한다. `shared/skill/runtime/role-policy.json`이 갱신된다.
4. `instruction-contracts.json`의 `protected` 가운데 `lib/policy/role-policy.json`과 `shared/skill/runtime/role-policy.json` 해시를 새 값으로 바꾼다. 전후 해시를 기록한다.
5. `rule-pins.json`의 `bootstrap`·`agent:*`·`core` 항목 중 문장이 바뀐 것을 ledger 치환표(§7)로 갱신한다.
6. `node scripts/update-manifest.mjs`를 실행한다.
7. golden `--write`를 실행한다(§11 조건을 충족할 때만).

- 2단계가 쓰는 POLICY_TARGETS 중 §2 change 밖의 파일이 있으면 원천 task를 hold한다(H-3).
- `check:role-policy`, `update-runtime-assets --check`, `check:manifest`는 모두 종료 코드 0이어야 한다.

## 7. 남은 규칙 고정의 갱신(U6 수정, J22)

- 적용 대상은 `rule-pins.json` 항목과 J35 해시뿐이다.
- 문서 task가 규칙 문장을 바꾸면, 같은 task 안에서 ledger의 이전→이후 쌍을 치환표로 써서 해당 항목의 `text`를 갱신한다. 항목 `text`가 "이전" 문장을 포함하면 그 부분을 "이후"로 바꾼다.
- 금지: 항목 삭제, 패턴 완화, 대소문자 무시 추가, 공백 정규화 외의 정규화 추가.
- 항목 수는 줄지 않는다. U5로 두 규칙 문장이 합쳐져도 항목은 각각 남는다.
  - 두 항목의 `text`가 같아지면 `id`는 그대로 두고 `text`만 같게 한다.
  - 이 경우 (`doc`, `text`) 유일성 검사의 예외로, `mergedFrom`에 상대 항목 ID를 적는다.
- 전후 기록은 plan task 기록에 RP-ID, 이전, 이후, ledger 행 ID로 남긴다.
- Tester는 fixture diff가 치환표의 규칙 행과 1:1로 대응하는지 확인한다.

## 8. 의미 보존 검토와 ledger(J14, SC-5)

- ledger는 workflow 산출물이며 커밋하지 않는다. 형식:

`행 ID | 파일:줄(base) | 플랫폼 묶음 | 종류(U4/J2/U5/U3 이동/링크 재작성/hold) | 이전 | 이후 | ①강약 | ②대상·조건·예외·우선순위 | ③이동·통합 참조 | ④링크 | 근거 path:line | 영향 RP-ID`

- ①–④는 사용자 점검 4항목이다. 각 칸에 `같음`, `해당 없음`, `hold` 중 하나를 적는다.
  - 하나라도 `같음`이나 `해당 없음`으로 판정할 수 없으면 그 문장은 바꾸지 않는다. 종류를 `hold`로 적고 최종 보고에 올린다.
- U3 이동 행은 run 단위로 쓴다. 다음 두 가지를 적는다.
  - 이동 전 4플랫폼 바이트가 같다는 확인
  - 공용 문서 텍스트가 원문과 바이트로 같다는 확인(J29 링크 재작성만 예외로 적는다)
- U4 단독 행은 소문자로 접어 비교하면 전후가 같아야 한다.
- J12 차이(verification 최종 diff artifact, arc-visual-companion 제안 흐름, Codex git-recovery sandbox 조건)는 그대로 두고 보고한다.

## 9. 작업 단위와 의존(SC-7)

순서와 의존(J15, J16):
- T0 → W1 → W2 → W3 → W4(agents) → W5(SKILL.md) → W6–W15(reference 문서별) → 최종 Tester(final 모드) → 최종 Reviewer
- 문서 task들은 내용상 서로 독립이다. 그러나 `MANIFEST.sha256`, golden, `rule-pins.json`, `instruction-language.test.mjs`를 함께 고치므로 차례로 진행한다.
- plan은 문서 task의 순서를 정할 수 있다. 단, 아래 경계는 합치거나 나누지 않는다.
  - 문서 하나 × 4플랫폼 = task 하나
  - 정비(W1·W2)는 모든 문서 task보다 먼저
  - 원천(W3)은 문서 task보다 먼저

| 단위 | 내용 | 선행 |
|---|---|---|
| T0 기준선·전수(Tester, 커밋 없음) | (1) 계약 검사 집합(§11.1)의 기준선 실행: test ID별 결과, 종료 코드, build/native 여부, golden `--diff` 결과 (2) P0-8: Python 의도된 실패 36건 중 정비 대상 파일에 속한 test ID (3) (U11로 W1·W2로 옮김) (4) 그 밖의 Node 테스트에서 공백을 포함한 20자 이상 literal 가운데 지침 문서에 나오는 것(H-6) (5) parity destination 중 정비 대상 파일에 있는 test 목록 (6) 링크 무결성 기준선(§4.4) (7) POLICY_TARGETS 목록 (8) shared reference 디렉터리를 정확히 열거하는 테스트가 있는지 | 대상 준비 |
| W1 정비 A | `rule-pins.json`, `rule-pins.test.mjs`, `effective-doc.mjs`를 새로 만든다. `instruction-contracts.json`(§3.5), `instruction-layout.test.mjs`, `agent-fragments.test.mjs`, `role-policy.test.mjs`를 정비한다. 대응표의 해당 행을 쓴다. | T0 |
| W2 정비 B | `test-scope-contract`, `composite-instructions`, `plan-level-records-contract`, `run-mode-contract`, Python 3개를 정비한다. 대응표의 나머지 행을 쓴다. | W1 |
| W3 원천 | §6 전체 | W2 |
| W4 agents | 4플랫폼 agent template 산문(U4·J2·U5), 영향받는 RP 갱신, MANIFEST, golden | W3 |
| W5 SKILL.md | 4플랫폼 SKILL.md(U4·J2·U5). 크기 상한을 유지한다. | W4 |
| W6–W14 | `arc-visual-companion`, `commit`, `coordination`, `git-recovery`, `handoff`, `handoff-prep`, `limits`, `planning`, `verification` 문서별로 진행한다. 순서: §4.2–4.4 추출 → §5 편집 → §7 RP 갱신 → `instruction-language.test.mjs` 목록 추가 → MANIFEST → golden | W5와 앞선 문서 task |
| W15 | `worktree-creation`(4플랫폼)과 `shared/skill/references/handoff-worktree.md`(U4·J2·U5만) | 앞선 문서 task |

- 문서 task 안의 순서: 먼저 바이트 그대로 이동하고 이동을 검증한 뒤, 공용 문서와 플랫폼 파일을 편집한다. S 문장은 공용 문서에서 한 번만 편집된다.
- 각 단위가 수락되면 Orchestrator가 집중 커밋 1개를 만든다. 커밋 메시지는 `type(scope): 한국어 설명` 형식이다.

## 10. 인수 기준

| ID | 기준 | 검증 |
|---|---|---|
| AC-1 | `8ec7d907..HEAD`에서 바뀐 파일이 §2의 change 행(과 spec·plan)뿐이다. no change 파일의 diff는 0이다. | `git diff --name-only` 대조 |
| AC-2 | 각 task와 최종 시점에 T0 대비 계약 검사 집합의 새 실패가 0건이다(test ID 기준). 삭제된 test는 대응표에 있다. 의도된 기준선 실패(§3.8 (a)) test 본문의 diff는 0이다. 기준선 실패(b) test의 "삭제(stale)" 행은 대응표에 근거가 있다. | Tester 비교 |
| AC-3 | `npm run check:role-policy`, `npm run check:manifest`, `node scripts/update-runtime-assets.mjs --check`, `node scripts/check-installer-parity.mjs`의 종료 코드가 0이다. T0에서 이미 실패였다면 같은 실패가 유지된다. | 명령 실행 |
| AC-4 | golden은 task마다 갱신된다. diff는 바뀐 설치 파일의 SHA와 새 `*-common.md` 항목 추가로만 한정된다. 조건을 충족하지 못하면 H-2를 따른다. | `installed-layout.mjs --diff` 기록 |
| AC-5 | §3.10의 P1–P5를 충족한다. | Tester, Reviewer |
| AC-6 | 정비 뒤 지침 문장을 정확히 고정하는 곳은 `rule-pins.json`뿐이다(배타성 검사 통과). 섹션 전문 비교와 agent 프로필 SHA는 0건이다. | 테스트, grep |
| AC-7 | 바뀐 문장이 모두 ledger에 있고 ①–④ 판정이 붙어 있다. ledger에 없는 문구 변경은 0건이다. U4 단독 행은 소문자로 접어 비교한 차이가 0이다. | diff와 ledger 1:1 대조 |
| AC-8 | 플랫폼 파일의 `<a id>` 집합과 heading 줄 diff가 0이다. backtick span·코드·경로·식별자·marker diff가 0이다. 관리 블록은 재생성으로만 바뀌었다. | diff 검사 |
| AC-9 | 이동한 run마다 이동 전 4플랫폼 바이트가 같다. 공용 문서 텍스트가 원문과 같다(J29 링크 재작성만 예외). 원래 위치에 연결 문장이 있다. 링크 무결성 검사에서 새로 깨진 링크가 0건이다. | Tester 절차 |
| AC-10 | 대상 범위에 남은 소문자 규범어가 모두 ledger의 비대상 행이나 hold 행과 대응한다. | 잔존 스캔 |
| AC-11 | 불분명 문서와 J12 차이가 보존되고 보고된다. hold·애매·R4 후보 목록이 최종 보고에 있다. | Orchestrator |
| AC-12 | 크기 상한 값이 바뀌지 않았고 상한 검사가 통과한다. | 테스트 |
| AC-13 | `rule-pins.json` 항목 수가 W2 수락 시점보다 줄지 않았다. fixture diff가 치환표와 1:1로 대응한다(§7). | Tester |
| AC-14 | 최종 Reviewer가 전체 diff를 검토했고, 지적이 모두 해소됐다. | Reviewer |

## 11. 검증 방식

### 11.1 계약 검사 집합(J40, task 모드 범위)

- Node: `tests/node/{rule-pins,instruction-layout,agent-fragments,role-policy,test-scope-contract,composite-instructions,plan-level-records-contract,run-mode-contract,instruction-language,installed-layout-golden,manifest}.test.mjs`
- Python: `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest tests/test_arc_policy.py tests/test_claude_payload.py tests/test_harness_contract.py`
- 스크립트: AC-3의 4개, `node tests/node/fixtures/installed-layout.mjs --diff`
- 전체 `npm test`는 자동으로 실행하지 않는다(사용자 환경 기록).
- T0에서는 실행 시점에 존재하는 파일만 실행한다.

### 11.2 task와 최종 검증

- **task별 fresh Tester(task 모드)**: 계약 검사 집합을 실행하고 T0와 비교한다.
  - 정비 task(W1·W2): P1–P5와 J33을 확인한다.
  - 원천·문서 task: AC-7–AC-10과 AC-13을 확인한다.
- **최종 Tester(final 모드)**: 모든 task가 수락된 뒤 실행한다.
  - 최종 HEAD에서 계약 검사 집합을 실행한다.
  - `node scripts/check-installer-parity.mjs --complete`를 실행한다. T0에서 실패였다면 같은 실패인지 비교한다.
  - 링크 무결성 전체를 확인한다.
  - 전체 회귀는 실행하지 않는다. 필요하면 Orchestrator가 사용자 승인을 받는다.
- **최종 Reviewer**: 1회. `8ec7d907..HEAD` 전체 diff를 검토한다.
  - 중점: 의미 보존(①–④), 애매 목록, 삭제 행 표본, 연결 문장의 효력
  - 지적은 Implementer → Reviewer 순서로 반복한다. 수정은 Reviewer가 재확인할 때까지 커밋하지 않고, 수락 뒤 follow-up 커밋 1개로 만든다.
- **golden 조건**: 아래 셋을 모두 충족할 때만 `--write`를 실행한다.
  - T0에서 golden 테스트와 `--diff`가 통과했다.
  - target에 `build/native`가 있다.
  - diff가 AC-4 범위 안에 있다.

## 12. 위험과 hold

| ID | 조건 | 처리 |
|---|---|---|
| H-1 | 정비 task inventory와 대응표가 맞지 않는다(P1 실패). | 해당 정비 task의 수락을 hold한다. |
| H-2 | golden: T0 실패, `build/native` 없음, 범위 밖 diff 중 하나에 해당한다. | `--write`를 hold하고 보고한다. 빌드·환경 변경은 Orchestrator가 사용자 결정을 받는다. |
| H-3 | POLICY_TARGETS에 §2 change 밖의 파일이 있다. | W3를 hold하고 보고한다. |
| H-4 | 이동 대상 run이 task 시작 시점의 4플랫폼 바이트 비교에서 같지 않다. | 그 run은 옮기지 않고 D로 기록한다. |
| H-5 | ①–④ 판정을 내릴 수 없다. | 그 문장은 바꾸지 않는다(hold). 보고한다. |
| H-6 | T0 (4)에서 no change Node 테스트에 지침 산문 고정이 나왔다. | 그 고정이 걸린 문서 task를 hold한다. Orchestrator가 plan 개정(그 파일을 change로 추가)을 판단한다. |
| H-7 | parity destination test가 고정을 모두 잃는데, 남길 구조 assertion이나 RP-ID가 없다. | 그 test의 정비를 hold하고 보고한다. |
| H-8 | shared reference를 정확히 열거하는 테스트가 있다(T0 (8)). | 새 `*-common.md`를 기대 목록에 넣으면 그 파일이 change가 되므로 plan 개정 대상이다. W6 전에 Orchestrator에게 보고한다. |

남는 위험:
- 연결 문장 방식에서는 독자가 링크를 따라가 읽어야 한다. 연결 문구에 "같은 효력"을 명시하고, Reviewer가 효력을 검토한다.
- 규칙 판정이 넓으면 보호가 과해지고, 좁으면 보호가 빠진다. 애매한 경우 기본값을 규칙으로 두고 보고한다.

## 13. 작성자 판단

| ID | 판단 | 이유 |
|---|---|---|
| J1 | "최대한"은 제약 안에서의 최대를 뜻한다. | v1 |
| J2 | 명확화는 실제로 모호하고 의도를 확인할 수 있는 문장에만 한다. | v1 |
| J3 | `may`는 허가일 때만 대문자로 바꾼다. 인용·설명·예시·code는 제외한다. 관리 블록은 원천을 고친 뒤 재생성한다. | v1 |
| J4 | `SKILL.md`에서는 공통 문단을 추출하지 않는다. | v1 |
| J5 | agents는 추출하지 않고 fragments와 template 산문만 다룬다. | v1 |
| J6 | gate references 7개는 플랫폼 파일로 남기고, 공통 문단만 옮겨 링크로 잇는다. | v1 |
| J7 | 관리 블록은 플랫폼 파일에 둔다. | v1 |
| J8 | `instruction-layout:142-151` 문단의 위치는 유지하고, 검사는 U7로 바꾼다. | v2 |
| J9 | 재생성 대상은 MANIFEST, golden, 관리 블록, runtime `role-policy.json`이다. agent SHA는 대상에서 빠진다. | v2 |
| J10 | 크기 상한 값을 바꾸지 않는다. | v1 |
| J11 | 플랫폼명이나 도구명만 다른 문단은 플랫폼 파일에 남긴다. | v1 |
| J12 | U 차이 2건과 Codex git-recovery sandbox 조건은 그대로 두고 보고한다. | v1 |
| J13 | 공용 문서는 원본 reference마다 1개씩 둔다. 이름·링크는 §4.1을 따른다. | v1+spec |
| J14 | 문장 ledger는 workflow 산출물이며 커밋하지 않는다. | v1 |
| J15 | 문서 하나 × 4플랫폼 = task 하나 | v1 |
| J16 | 정비를 먼저 하고 리팩토링을 뒤에 한다. | v2 |
| J17 | spec·plan 경로를 하나로 합친다. | v2 |
| J18 | 규칙 문장은 공용 JSON fixture 1개에 둔다. Node가 문장을 확인하고, Python은 ID 존재만 확인한다(§3.3). | v2. 같은 문장을 두 번 확인하지 않는다(U7 "한 번만"). |
| J19 | 관리 블록의 동적 비교는 유지하고, 하드코딩 사본은 제거한다. | v2 |
| J20 | 핵심 낱말은 비산문 토큰으로 한정한다. | v2 |
| J21 | 규칙 판정은 §3.1-4를 따른다. 애매하면 보고한다. | v2 |
| J22 | 남은 규칙 문장이 바뀌면 같은 task에서 fixture를 고치고 전후를 기록한다. | v2 |
| J23 | 동작 테스트의 리터럴은 no change다. | v2 |
| J24 | 대응표(§3.9)를 만든다. workflow 산출물이며 커밋하지 않는다. | v2 |
| J25 | 정비 뒤 Tester가 기준선을 대조한다. 새 실패는 0건이어야 하고, 36건과 겹치는 것은 보고한다. | v2 |
| J26 | 공용 문서 이름은 `<name>-common.md`, 9개다. `worktree-creation`은 추출하지 않는다. | C1을 피한다. S가 1블록뿐이고 N이 있어서 연결 문장 비용이 이득보다 크다. |
| J27 | 이동 단위는 섹션 안의 연속 S run이다. heading·anchor·M·D·N은 남긴다. | 기존 링크와 섹션 구조를 보존한다. |
| J28 | 연결 문장과 공용 문서 머리말의 문구를 고정하고 "같은 효력"을 명시한다. | 옮긴 규칙의 효력이 약해지지 않게 한다. |
| J29 | 옮긴 문단 안의 같은 파일 fragment 링크를 `<name>.md#id`로 바꾼다. | 공용 문서에서 `#id`는 다른 파일을 가리키게 되기 때문이다. |
| J30 | fixture는 `rule-pins.json`, 검사기는 `rule-pins.test.mjs`, helper는 `effective-doc.mjs`다. Python helper는 파일별 내부 함수로 둔다. 플랫폼별 문구는 항목을 나누고 template은 쓰지 않는다. | 기존 fixture 관례를 따른다. 새 Python 모듈을 만들지 않는다. |
| J31 | 애매한 판정의 기본값은 규칙 이전이다. | 보호를 줄이는 쪽으로 혼자 정하지 않는다. |
| J32 | 의도된 기준선 실패(`test_harness_contract.py`) test의 본문은 이 작업에서 바꾸지 않는다(v2: U9로 범위를 좁힘). | 의도된 기준선 기록(T3 결정 대기)을 보존한다. |
| J44 | stale 판정은 기계적으로 한다. literal은 플랫폼별 base 대상 텍스트에 대한 포함 검색, regex는 match, 섹션 자르기는 heading 존재로 본다. 공백 정규화 외의 변형은 하지 않는다. | U9 적용을 재현 가능하게 한다. 사라진 규칙의 기록은 대응표 삭제 행이 맡는다. |
| J45 | 정비 대상 파일 inventory는 W1·W2 Implementer가 만든다. T0의 H-6·CS-X·링크 기준선 조사는 각 문서 task와 최종 Tester가 해당 범위만 base 대비로 수행한다(plan v2). | bridge Tester가 저장소 전체 전수 목록을 한 보고로 반환하지 못했다(T0 시도 결과). 범위를 task 단위로 나누면 같은 검증을 유지한다. |
| J33 | parity destination test는 삭제하지 않고 이름도 바꾸지 않는다. 고정이 다 빠지면 구조 assertion이나 ID assertion을 남긴다. | 동결된 parity 계약(`check-installer-parity.mjs:13-58`) |
| J34 | 새 문장 고정을 추가하지 않는다. | 범위를 넓히지 않는다. |
| J35 | `role-policy.json` 두 곳의 protected 해시는 유지하고 원천 task에서 갱신한다. | 관리 블록 규칙 문구를 지키는 유일한 바이트 고정이다. U7은 agent 프로필 SHA만 지목한다. |
| J36 | 문장 머리 판정에 `;`·`:` 뒤 독립절 명령형을 포함한다. 축약형은 보고한다. | 문법상 문장 머리다. 축약형을 바꾸면 단어가 바뀌므로 대문자화가 아니다. |
| J37 | frontmatter는 대문자화·정리에서 빼고 보고한다. | 라우팅 메타데이터다. |
| J38 | SKILL.md gate 표의 trigger 셀은 규칙(금지)으로 보고 fixture로 이전한다. | 선행 조건 gate이고, 테스트를 남기는 근거로 원래 든 "핵심 gate 문장"이다. |
| J39 | 링크 무결성은 커밋되는 테스트가 아니라 Tester 절차로 확인한다. | base에 이미 깨진 링크가 새 실패로 섞이는 것을 막는다. |
| J40 | task 모드 범위는 계약 검사 집합(§11.1)이다. 전체 `npm test`는 자동 실행하지 않는다. | 사용자 환경 기록 |
| J41 | 같은 문장은 플랫폼 묶음으로 같은 편집을 한다. 한 곳이 hold이면 묶음 전체를 hold한다. | 4플랫폼 일관성 |
| J42 | 규칙 문장을 일부러 바꿔 보는 자기 검사(`assert.throws`)는 삭제한다. | 정확 일치 고정이 같은 것을 보장한다. |
| J43 | 1–42건짜리 나머지 Node 테스트는 no change다. T0에서 산문 고정이 나오면 H-6을 따른다. | marker·ID·경로·동작 토큰만 고정한다는 것을 표본으로 확인했다(`p0-pinned.md:85-102,114-115,1185-1191,3237-3244`). |

## 14. 개정 이력

| 버전 | 내용 | 승인 | 사유 |
|---|---|---|---|
| v0 | 첫 초안(Planner) | 미승인(spec과 plan을 한 번에 승인받을 때까지 대기) | — |
| v1 | Orchestrator 검토 수정: §5.3 허용 예시의 근거 인용을 확인된 위치 없이 일반화하고 구현 때 확인하도록 표시 | 2026-11-26 사용자 "승인"(plan v1과 함께), 커밋 bea8cc3e | 첫 초안 self-review의 미확인 항목 |
| v2 | Orchestrator 개정: U9–U11 추가, §3.1-1·§3.8·§3.9·§3.10(P1·P2)·§9 T0·AC-2·H-1·J32 수정, J44·J45 추가 | 승인 대기 | T0 결과: Python 기준선 실패가 기록보다 크고(실제 stale 고정), bridge Tester가 전수 inventory를 반환하지 못함. 사용자 결정 U9–U11 |
