# 하네스 지침 리팩토링 3차 + 문자열 고정 테스트 정비 실행 계획

> **실행 안내(ARC):** 실행 조정은 Orchestrator가 맡습니다. 편집은 Implementer, task 검증은 매번 새로 배정하는 Tester(task 모드), 최종 검증은 Tester(final 모드)와 Reviewer 1회가 맡습니다. 진행 상황은 체크박스(`- [ ]`)로 표시합니다. 체크박스는 커밋 단위가 아닙니다. 승인된 최상위 task 하나가 집중 커밋 하나에 대응합니다.

- **Goal:** 지침 문장을 글자 그대로 고정하는 곳을 `tests/node/fixtures/rule-pins.json` 하나로 모읍니다(U7). 그다음 4플랫폼 지침 문서를 의미를 보존하며 정리합니다(U3·U4·U5).
- **Architecture:** 테스트를 먼저 정비합니다(W1·W2). 그다음 원천을 고치고 재생성합니다(W3). 이어서 agents(W4), SKILL.md(W5), reference 문서(W6–W15)를 하나씩 처리합니다. reference 문서는 공통 S run을 `shared/skill/references/<name>-common.md`로 바이트 그대로 옮긴 뒤 편집합니다. 남은 규칙 고정은 같은 task 안에서 ledger 치환표로 갱신합니다(§7).
- **Tech Stack:** Node `node:test`, Python `unittest`, JSON fixture, Markdown/TOML 지침 문서, 생성 스크립트(`scripts/update-role-policy.mjs`, `update-runtime-assets.mjs`, `update-manifest.mjs`, `tests/node/fixtures/installed-layout.mjs`)
- **Spec:** `docs/superpowers/specs/2026-11-26-harness-doc-refactor-3-design.md`, 버전 v5(v4 SHA-256 `0e552d572a34ac1bbfc0d2763d0a00ab82050bbb58336696dc7f3ac107c0efd3`에 J48 추가). 이 plan의 §·J·U·AC·H 인용은 모두 이 spec을 가리킵니다.
- **실행 대상:** `/Users/yunho/Desktop/project/arc`, 브랜치 `refactor/harness-doc-refactor-3`, base `8ec7d907f77e1fb288f6ce63d8a8973d9aacb7ed`
- **역할:** Implementer와 Tester는 Codex bridge이고, Reviewer는 native Claude입니다. bridge 역할은 Git 상태를 바꾸지 않으며, 커밋은 Orchestrator만 합니다.
- **plan 버전:** v8(v7 뒤 PJ21 추가, 사용자 선택 2026-11-27)

## Global Constraints

- 줄 번호 인용의 기준은 base `8ec7d907`입니다(spec 머리말).
- 기준선은 `.git/arc/workflows/harness-doc-refactor-3/t0-baseline.md`입니다(v2). 현재 checkout의 `tests/node/manifest.test.mjs` 16건 실패는 환경 기준선이고(U10), Python 기준선 실패는 §3.8 (a)·(b)로 나뉩니다. 모든 비교는 test ID 기준입니다.
- Python은 항상 `PYTHONDONTWRITEBYTECODE=1 python3 -B …`로 실행합니다.
- Git 조회에는 항상 `git --no-optional-locks`를 붙입니다. `.git` 메타데이터를 바꾸는 명령은 bridge에서 금지합니다. 예: `add`, `commit`, `stash`, `reset`, `fetch`, `gc`, index를 쓰는 `status`.
- heredoc과 프로세스 치환은 쓰지 않습니다. 일회성 검사는 `node -e '…'` 한 줄로 합니다. 저장소 안에 임시 파일을 만들지 않습니다.
- 전체 `npm test`는 자동으로 실행하지 않습니다(J40). task 모드 범위는 §11.1 계약 검사 집합과 PJ9 추가 파일입니다.
- §2의 no change 파일은 diff가 0이어야 합니다(AC-1). task별 `allowedPaths` 밖의 파일은 고치지 않습니다.
- 문서는 영어만 씁니다. `instruction-language.test.mjs`가 Hangul을 금지합니다.
- 고정 문구(§4.3)는 바이트 그대로 씁니다.
  - 연결 문장: `Shared text for this section: [<name>-common.md#<id>](<name>-common.md#<id>). It applies here exactly as if written in place.`
  - 공용 문서 첫 줄: `# <원본 첫 heading> — shared text`
  - 공용 문서 머리말: `This file holds text shared by every platform's <name>.md. Each part belongs to the section that links to it and has the same force there.`
- 규칙 fixture 항목의 ID는 `RP-001`부터 차례로 붙이고 다시 쓰지 않습니다. 항목은 삭제하지 않고, 패턴을 완화하지 않으며, 대소문자 무시를 추가하지 않습니다(§7). 새 문장 고정은 추가하지 않습니다(J34).
- 같은 문장은 4플랫폼 묶음으로 같은 편집을 합니다. 한 곳이 hold이면 묶음 전체를 hold합니다(J41).
- 행 ID 형식:
  - 대응표(§3.9): `M-<task>-<nnn>`. 여러 문장으로 나뉜 고정은 `M-W1-012.1`처럼 하위 번호를 붙입니다.
  - ledger(§8): `L-<task>-<nnn>`
- 대응표, ledger, T0 결과는 커밋하지 않는 workflow 산출물입니다. Implementer와 Tester는 이것을 보고 본문으로 반환하고, Orchestrator가 `.git/arc/workflows/harness-doc-refactor-3/` 아래에 저장합니다(PJ12).
- (v8, PJ21, spec J48) W3–W15의 allowedPaths에는 `tests/node/plan.test.mjs`가 들어갑니다. 바꿀 수 있는 것은 `renderingBaseline` 객체의 해시 값 8개뿐입니다. 키, test 로직, 다른 줄은 바이트 그대로 둡니다. 해시는 MANIFEST·golden 갱신 뒤 `node --test --test-name-pattern='preserves public rendering baseline' tests/node/plan.test.mjs`의 실패 메시지(actual)로 얻습니다. 전후 값을 보고합니다. 이 test는 그 task의 CS-X에 늘 들어갑니다. Tester는 TD-10으로 다음을 확인합니다. `git --no-optional-locks diff -U0 -- tests/node/plan.test.mjs`의 바뀐 줄이 `renderingBaseline` 값 줄뿐이어야 하고, 그 8개 test가 통과해야 합니다.
- 커밋 메시지 형식은 `type(scope): 한국어 설명`이고, 본문 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`을 붙입니다. amend는 금지합니다.

## Review Focus

1. **J29 링크 재작성과 run 경계에 걸친 규칙 문장.** RP `text`에 `(#id)` 링크가 있거나 문장이 D 문단과 S run에 걸쳐 있으면 이동 뒤 포함 검사가 깨지거나 엉뚱한 문서를 가리킬 수 있습니다. 이런 경우는 ledger의 링크 재작성 행과 RP 갱신 행이 1:1로 대응해야 합니다. → W6–W14의 D-4·D-7 단계와 Tester 항목 TD-3·TD-6이 확인합니다.
2. **heading이 두 번 나오는 effective 텍스트에서 섹션 자르기.** 플랫폼 파일과 공용 문서에 같은 heading이 있고, 같은 섹션의 run이 둘 이상이거나 하위 heading이 섞일 수 있습니다. → W1의 `effectiveSection` 자체 검사가 임시 root fixture로 확인합니다(W1 Step 3).
3. **배타성 검사의 거짓 음성.** JSON 문자열의 `\"` 같은 이스케이프 때문에 사본이 남아도 놓칠 수 있습니다. → W1 배타성 검사가 원문 형태와 `JSON.stringify` 이스케이프 형태를 모두 찾습니다(PJ7).
4. **code span, 링크, 인용, 예시 안의 대문자화.** → backtick span 다중집합 비교와 heading·anchor diff를 문서 task마다 확인합니다(TD-4).
5. **새 shared 파일이 설치 조합별 golden과 MANIFEST에 빠지거나 범위 밖 diff가 섞이는 경우.** → D-9·D-10과 TD-7에서 `~`·`+` 줄을 분류합니다.

---

## 0. 커밋 경계와 순서

| 시점 | 커밋 주체 | 내용 | 메시지 초안 |
|---|---|---|---|
| spec+plan 한 번에 승인된 직후, T0 전 | Orchestrator | spec과 plan만 담은 planning-document 커밋 1개 | `docs(spec): 하네스 지침 리팩토링 3차 설계와 실행 계획 추가` |
| T0 수락 | 없음 | 커밋하지 않습니다. 결과는 workflow 산출물로만 남깁니다. | — |
| W1–W15 각 수락 직후 | Orchestrator | 그 task의 allowedPaths 변경 파일. plan 진행 기록과 승인된 plan 개정(trailer 포함)이 있으면 함께 넣습니다. | task마다 따로 적었습니다. |
| 최종 Reviewer 지적 해소 후 | Orchestrator | 수정분. Reviewer가 재확인할 때까지 커밋하지 않고, 수락한 뒤 follow-up 커밋 1개로 만듭니다. | `fix(skill): 하네스 지침 리팩토링 3차 최종 리뷰 지적 반영` |

- 실행 순서: docs 커밋 → T0 → W1 → W2 → W3 → W4 → W5 → W6 → … → W14 → W15 → 최종 Tester → 최종 Reviewer
- 문서 task는 알파벳순으로 진행합니다(PJ1). W6 `arc-visual-companion`, W7 `commit`, W8 `coordination`, W9 `git-recovery`, W10 `handoff`, W11 `handoff-prep`, W12 `limits`, W13 `planning`, W14 `verification`, W15 `worktree-creation`+`handoff-worktree` 순입니다.
- 실행 중에 plan이나 spec을 개정해야 하면 Orchestrator가 승인을 받습니다. 개정은 그 개정으로 처음 실행한 task의 수락 커밋에 넣고 `Plan-Revision:`, `Plan-Approved-At:`, `Plan-Reason:` trailer를 붙입니다.
- task마다 공통 수락 전제가 있습니다. fresh Tester(task 모드) 보고가 있어야 하고, 실패가 남아 있으면 안 됩니다. Reviewer는 task 단위 검사가 아닙니다.

## 1. 공통 정의

### 1.1 계약 검사 집합(§11.1, CS)

- **CS-N:** `node --test --test-reporter=tap tests/node/rule-pins.test.mjs tests/node/instruction-layout.test.mjs tests/node/agent-fragments.test.mjs tests/node/role-policy.test.mjs tests/node/test-scope-contract.test.mjs tests/node/composite-instructions.test.mjs tests/node/plan-level-records-contract.test.mjs tests/node/run-mode-contract.test.mjs tests/node/instruction-language.test.mjs tests/node/installed-layout-golden.test.mjs tests/node/manifest.test.mjs`
  - 실행 시점에 없는 파일은 뺍니다. 예: T0에는 `rule-pins.test.mjs`가 없습니다.
- **CS-P:** `PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest -v tests/test_arc_policy.py tests/test_claude_payload.py tests/test_harness_contract.py`
- **CS-S:**
  - `npm run check:role-policy`
  - `npm run check:manifest`
  - `node scripts/update-runtime-assets.mjs --check`
  - `node scripts/check-installer-parity.mjs`
  - `node tests/node/fixtures/installed-layout.mjs --diff`
- **CS-X(PJ9):** 각 편집 task의 D-0(v2, 구 T0 (9))에서 찾은 no change 테스트 파일. 대상은 지침 문서·원천을 읽고 토큰을 확인하는 파일이며, 해당 문서 task에서만 추가로 실행합니다.
- 모든 명령 뒤에 `; echo "exit=$?"`를 붙입니다. test ID는 `파일::test 이름`(Python은 `파일::Class.method`)으로 비교합니다.

### 1.2 새 인터페이스(W1에서 정의하고 이후 task가 사용)

- `tests/node/fixtures/effective-doc.mjs`
  - `export function effectiveText(platform: string, name: string, root?: string): string`
    - `name === 'core'`이면 `<root>/<platform>/skill/SKILL.md` 텍스트를 반환합니다.
    - 그 밖에는 `<platform>/skill/references/<name>.md` 텍스트를 반환합니다. `shared/skill/references/<name>-common.md`가 있으면 그 내용을 `'\n'` 하나로 이어 붙여 반환합니다.
    - `root`의 기본값은 저장소 루트입니다.
  - `export function effectiveSection(platform: string, name: string, heading: string, root?: string): string` (PJ3)
    - `heading`은 `## X` 같은 heading 줄 전체입니다.
    - 플랫폼 파일에서 그 줄부터, 같거나 더 높은 수준의 다음 heading 직전까지를 자릅니다. 공용 문서에서 같은 줄이 나오는 모든 곳도 같은 규칙으로 자릅니다. 결과는 플랫폼 부분, 공용 부분 순서로 `'\n'`으로 이어 반환합니다.
    - 플랫폼 파일에 heading이 없으면 `Error`를 던집니다.
- `tests/node/rule-pins.test.mjs` 내부 함수
  - `targetText(platform: string, doc: string): string`. 매핑은 §3.3 표를 따릅니다.
    - `core` → `effectiveText(p,'core')`
    - reference 이름 → `effectiveText(p,name)`
    - `shared:handoff-worktree` → `shared/skill/references/handoff-worktree.md`
    - `agent:<role>` → `renderAgentProfile(<p>/agents/arc-<role>.<ext>, bytes, registry).toString()`. `ext`는 codex가 `toml`, 나머지는 `md`입니다.
    - `bootstrap` → `agentsBlockBody('/Users/u/.<p>','/Users/u','en',p)`
  - `ws(s) = s.replace(/\s+/g,' ')`
- Python 3개 파일에는 각각 내부 함수 `_effective(platform: str, name: str) -> str`을 둡니다. 동작은 `effectiveText`와 같습니다. 섹션 자르기가 필요한 파일에만 `_effective_section(platform, name, heading) -> str`을 둡니다(PJ3).
- `rule-pins.json` 스키마는 §3.3과 같습니다. 선택 필드 `mergedFrom: string[]`은 §7 합침 예외에만 씁니다.

### 1.3 대응표 분류 절차(§3.1–3.2와 PJ)

- 고정 1건마다 §3.1의 1→6 순서로 분류합니다. 애매한 경우(i)–(iii)는 규칙으로 이전하고 애매 표시를 합니다(J31).
- **literal 고정**(PJ4): 항목 `text`는 literal 그대로입니다. 여러 문장으로 된 literal도 항목 1개로 둡니다. spec 예시 RP-001이 이 방식입니다. 규칙 문장과 아닌 문장이 섞여 있으면 통째로 이전하고 애매 표시를 합니다.
- **regex 고정**: base 문서에서 맞는 문장 전체를 문장마다 항목으로 만듭니다(§3.2). 맞는 문장이 base에 없으면 그 test는 기준선 실패여야 합니다. 기준선 실패가 아니면 그 행을 hold하고 보고합니다.
- **섹션 전문**(`contracts[].text`, `opening`, `bootstrap`): 문장 단위로 하위 행 `M-…​.k`를 만들고, 문장마다 §3.1을 적용합니다.
- **stale 고정**(v2, U9·J44): T0 (b) 기준선 실패 test의 고정은 먼저 stale을 판정합니다. 맞히는 문장·heading이 플랫폼별 base 대상 텍스트에 없으면 "삭제(stale)"이고, 대응표 사유에 판정 명령(`node -e` 포함 검색·match)과 결과를 적습니다. 애매하면 유지하고 애매 표시를 합니다. 의도된 기준선 실패(§3.8 (a), `test_harness_contract.py`)는 판정 없이 "유지(기준선 실패)"입니다.
- **no change 테스트에 이미 있는 규칙**(v3, PJ15): 규칙 문장이 §2의 no change 테스트(예: `tests/node/global-config.test.mjs:10`)에 이미 고정돼 있으면 RP를 만들지 않습니다. 정비 대상 쪽 사본은 분류 6(중복)으로 삭제하고, 대체 수단에 그 no change 테스트의 `path:line`을 적고 애매 목록에 올립니다. no change 테스트는 고치지 않습니다.
- **대소문자를 접어 비교하던 고정**(v5, PJ17): 원래 test가 문서를 소문자로 바꾼 뒤 소문자 literal을 확인했다면, RP `text`는 base 문서에 실제로 있는 대소문자 그대로의 문장으로 적고(spec §3.3 `text` 정의) 애매 표시를 합니다. P3는 같은 접기 방식으로 원래 literal이 RP `text`에 들어 있는지로 확인합니다.
- **W2 hold 처리 규칙**(v6, PJ18):
  - (가) 섹션 경계를 넘어서만 맞는 regex: 7천 자 범위를 통째로 고정하지 않습니다. regex의 literal 조각마다 그 조각을 품은 base 문장을 RP로 옮기고(이미 있으면 PJ6 재사용) 애매 표시를 합니다. P3는 조각마다 같은 doc·플랫폼의 RP `text`에 들어 있는지로 확인합니다.
  - (나) stale selector(heading·구분자)가 다른 assertion의 범위를 정하는 경우: 의존 assertion까지 한 묶음으로 처리합니다. 내용이 base의 다른 실제 heading 아래에 하나로 있으면 그 heading의 effective 섹션으로 다시 묶고(구조), 아니면 묶음 전체를 stale 판정해 삭제(stale)합니다.
  - (다) 같은 literal이 W2 파일의 다른 assertion(부재 검사의 예외 포함)에도 있는 경우: RP 하나로 모으고 나머지는 분류 6(중복) 삭제나 fixture에서 읽은 RP text 참조로 바꿉니다.
  - (라) 낱말 하나뿐인 literal: 규칙 문장이 아니므로 분류 3(구조·낱말) 유지입니다.
  - (마) `test_harness_contract.py` 모듈 수준 계약 상수에 있는 사본(spec J47): 상수는 그대로 두고 `j32Protected`에 RP-ID → 상수 이름으로 넣습니다.
- **1회·위치 고정**(v7, PJ20): 원래 assertion이 문장의 출현 횟수나 위치·인접 순서를 확인했다면, 문장 자체는 RP로 옮기더라도 횟수·순서 확인은 RP 존재 검사로 대신할 수 없습니다. 그 확인은 RP text를 fixture에서 읽어 쓰는 구조 assertion(횟수·순서)으로 남기고, 분류 6(중복) 삭제로 처리하지 않습니다.
- **J32 보호 test 본문에 있는 규칙**(v4, PJ16): RP text 사본이 의도된 기준선 실패 test(§3.8 (a)) 본문에 있으면 RP를 유지하고, `rule-pins.test.mjs`의 RP-ID별 예외 목록(`j32Protected`: RP-ID → `tests/test_harness_contract.py` test 이름)에 넣습니다. 보호 test 본문은 고치지 않습니다. 예외는 그 파일·그 RP-ID에만 적용합니다.
- **부재 검사**(`doesNotMatch`, `!includes`, `assert.ok(!…)`): 분류 3(구조)로 유지하고 애매 표시를 합니다(PJ5). 대상은 effective 텍스트로 바꿉니다.
- **이미 같은 (`doc`, `text`) 항목이 있는 규칙**: 새 항목을 만들지 않습니다. 기존 항목 `origin`에 위치를 추가하고, 대응표에는 그 RP-ID를 적습니다(PJ6). 분류는 4로 둡니다.
- `platforms`에는 원래 테스트가 돌던 플랫폼만 적습니다. 예: claude/codex 루프이면 `["claude","codex"]`입니다. 새 플랫폼을 추가하면 새 고정이 되므로 J34에 따라 하지 않습니다(PJ2).
- `category`는 §3.3 허용 값에서 하나를 고릅니다. gate trigger 셀은 `prohibition`입니다(J38).

---

## T0 — 기준선과 전수 조사 (fresh Tester, 커밋 없음)

> **v2 상태(2026-11-26):** 결과는 `.git/arc/workflows/harness-doc-refactor-3/t0-baseline.md`입니다. 단계 1–4, 9, 10, 12를 완료했습니다. bridge Tester가 전수 목록을 한 보고로 반환하지 못해(U11, J45) 나머지는 옮겼습니다: 단계 5(inventory) → W1 Step 4·W2 Step 1, 단계 7(parity destination) → W2 Step 1, 단계 6·11(H-6·CS-X) → 편집 task의 D-0, 단계 8(링크 기준선) → TD-6과 최종 Tester 3단계의 base 대비 비교. 아래 원래 단계는 기록으로 남깁니다.

- **목표:** 모든 비교의 기준이 되는 실행 결과, 고정 inventory, 링크 기준선, 사전 위험(H-3·H-6·H-8·PJ9)을 확정합니다.
- **파일:** change 0. 읽기와 실행만 합니다. **allowedPaths:** 없음(쓰기 금지)
- **선행:** spec+plan 승인, docs 커밋 완료, 대상 확인(브랜치, HEAD가 docs 커밋, 추적 파일 변경 0)
- **단계:**
  - [ ] 1. `git --no-optional-locks rev-parse --abbrev-ref HEAD; git --no-optional-locks rev-parse HEAD; git --no-optional-locks status --porcelain`을 실행합니다. 기대: 브랜치명이 맞고, porcelain 출력이 비어 있습니다.
  - [ ] 2. CS-N(있는 파일만), CS-P, CS-S를 실행합니다. 추가로 `node scripts/check-installer-parity.mjs --complete`도 실행합니다(최종 비교용). test ID별 통과·실패, 종료 코드, 실패 메시지 요지를 기록합니다.
  - [ ] 3. `ls -d build/native`와 `node --version`을 실행하고, golden 테스트와 `--diff` 출력 줄 수를 기록합니다. §11.2 golden 조건을 판정합니다.
  - [ ] 4. P0-8: CS-P의 실패 test ID 가운데 Python 의도된 실패 36건과 겹치는 것을 표시합니다. 그 밖의 실패는 "새 기준선 실패"로 분류해 보고합니다.
  - [ ] 5. 고정 inventory(§9 T0 (3)): §2 "테스트(정비)" 10개 파일과 `instruction-contracts.json`에서 지침 문서·원천·렌더링 결과를 대상으로 하는 모든 고정을 행으로 만듭니다. 각 행에는 `path:line | 방식(literal/regex/섹션 전문/SHA/1회·위치/부재) | 대상 doc | 플랫폼 루프 | 소속 test ID`를 적습니다. 20자 미만 literal과 regex, `split` 섹션 자르기, fixture 필드 참조도 포함합니다.
  - [ ] 6. T0 (4): 그 밖의 `tests/**/*.{mjs,py,json}`에서 공백을 포함한 20자 이상 literal을 찾습니다. 그중 지침 문서, 원천(`role-policy.json` text, `agent-fragments.json` text, `agentsBlockBody` 출력), 렌더링된 agent profile에 나오는 것을 `path:line`으로 나열합니다(PJ8). `installer-parity.json`과 golden은 뺍니다.
  - [ ] 7. T0 (5): `tests/installer-parity.json` destination 가운데 정비 대상 파일의 test 목록을 만듭니다. `node -e`로 `entries[].destinations[]`와 `legacyHelpers[].destinations[]`를 모아 `file::test`(Python은 `class.test`)를 출력합니다.
  - [ ] 8. T0 (6) 링크 기준선: 모든 지침 문서(§2의 지침·agents)의 상대 링크 `](x.md#id)`, `](references/x.md#id)`, `](#id)`를 확인합니다. 대상 파일이 플랫폼 디렉터리나 `shared/skill/references/`에 있는지, `#id`가 대상의 `<a id="…">`나 heading slug에 있는지 봅니다. 깨진 링크를 `file:line | link`로 기록합니다.
  - [ ] 9. T0 (7): `node -e 'import("./lib/policy/render.mjs").then(m=>console.log(m.POLICY_TARGETS.map(t=>t.path).join("\n")))'`의 출력이 48줄이고 모두 §2 change 안에 있는지 확인합니다.
  - [ ] 10. T0 (8): `tests/` 안에서 `shared/skill/references`의 파일 목록이나 개수를 정확히 기대하는 assertion을 찾습니다. 예: `readdirSync` 결과의 길이나 deepEqual, 나열 배열. `static-references.mjs`의 superpowers 목록은 해당하지 않음을 적습니다.
  - [ ] 11. T0 (9)(PJ9): no change 테스트 가운데 플랫폼 `skill/references/*.md`나 `SKILL.md`의 본문 토큰을 길이와 관계없이 읽어 확인하는 assertion을 `path:line | 문서 | 토큰`으로 나열합니다. 이 목록이 CS-X가 됩니다.
  - [ ] 12. 1단계를 다시 실행해 전후 출력이 같은지 확인합니다.
- **AC:** AC-2와 AC-3의 기준선을 정합니다. AC-5 P1의 기준이 됩니다.
- **산출물(보고 본문):** 2–11단계 결과 표, 환경 정보, golden 조건 판정
- **hold:**
  - H-2: golden 조건을 충족하지 못하면 이후 task의 `--write`만 hold합니다.
  - H-3: 9단계에서 change 밖 파일이 나오면 W3를 hold합니다.
  - H-6: 6단계에 산문 고정이 있으면, 그 고정이 걸린 문서 task를 hold합니다.
  - H-8: 10단계에서 하나라도 나오면 W6 전에 보고합니다.
  - PH-3: 11단계에 토큰이 있으면, 그 토큰이 이동 대상 run에 속하는 문서 task를 hold합니다. Orchestrator가 plan 개정 여부를 판단합니다.

---

## W1 — 정비 A: 규칙 fixture 신설과 핵심 고정 정비

- **목표:** `rule-pins.json`, `rule-pins.test.mjs`, `effective-doc.mjs`를 만듭니다. 이어서 `instruction-contracts.json`(§3.5), `instruction-layout.test.mjs`, `agent-fragments.test.mjs`, `role-policy.test.mjs`를 §3.1에 따라 정비합니다. 문서는 base 그대로입니다.
- **Files:**
  - Create: `tests/node/fixtures/rule-pins.json`, `tests/node/rule-pins.test.mjs`, `tests/node/fixtures/effective-doc.mjs`
  - Modify: `tests/node/fixtures/instruction-contracts.json`, `tests/node/instruction-layout.test.mjs`, `tests/node/agent-fragments.test.mjs`, `tests/node/role-policy.test.mjs`
  - 손대지 않는 파일: 지침 문서 전부, 원천, `MANIFEST.sha256`, golden, W2 대상 7개 파일, `tests/installer-parity.json`
- **allowedPaths:** `tests/node/fixtures/rule-pins.json`, `tests/node/rule-pins.test.mjs`, `tests/node/fixtures/effective-doc.mjs`, `tests/node/fixtures/instruction-contracts.json`, `tests/node/instruction-layout.test.mjs`, `tests/node/agent-fragments.test.mjs`, `tests/node/role-policy.test.mjs`
- **선행:** T0 수락(v2 범위).
- **Interfaces:** §1.2를 만듭니다(Produces). W2–W15가 사용합니다.

- [ ] **Step 1: `effective-doc.mjs` 작성.** `effectiveText`와 `effectiveSection`을 §1.2 시그니처대로 만듭니다. 파일 읽기는 `fs.readFileSync(…,'utf8')`로 합니다.
- [ ] **Step 2: `rule-pins.test.mjs` 작성.** test 이름과 assertion은 다음과 같습니다.
  - `rule pins follow the schema`
    - `version === 1`
    - `id`가 `/^RP-\d{3}$/`이고 유일합니다.
    - (`doc`, `ws(text)`) 쌍이 유일합니다. 단 `mergedFrom`에 서로를 적은 항목은 예외입니다.
    - `platforms`가 비어 있지 않고 `claude|codex|gemini|grok`의 부분집합입니다.
    - `category`가 `approval|prohibition|permission|git|external|role-boundary` 가운데 하나입니다.
    - `origin`이 비어 있지 않은 배열입니다.
    - `doc`이 `core`, reference 이름 10개(`arc-visual-companion`, `commit`, `coordination`, `git-recovery`, `handoff`, `handoff-prep`, `limits`, `planning`, `verification`, `worktree-creation`), `shared:handoff-worktree`, `agent:{implementer,planner,reviewer,scouter,tester}`, `bootstrap` 가운데 하나입니다.
  - `every rule pin appears in its target text on each platform`
    - 항목마다, 플랫폼마다 `ws(targetText(p,doc)).includes(ws(text))`이어야 합니다. 실패 메시지에 `id/platform`을 넣습니다.
  - `rule pin texts appear in no other test file`
    - `tests/` 아래 `*.mjs|*.py|*.json`을 재귀로 훑습니다. 제외 3개(§3.3)와 아래 W2 대기 목록은 뺍니다.
    - 파일 내용을 `ws`로 정규화한 뒤 `ws(text)`나 `ws(JSON.stringify(text).slice(1,-1))`가 들어 있으면 실패합니다(PJ7).
  - `effective sections join platform and shared parts`
    - `fs.mkdtempSync`로 만든 임시 root에 플랫폼 파일과 `-common.md`를 씁니다. 공용 문서에는 같은 heading의 run 2개와 하위 heading 1개를 둡니다.
    - `effectiveText`가 두 파일을 `'\n'`으로 이은 문자열과 같은지 확인합니다.
    - `effectiveSection`이 플랫폼 부분 뒤에 공용 부분 둘과 하위 heading을 차례로 담는지 확인합니다.
    - heading이 없으면 throw하는지 확인합니다.
  - W2 대기 목록(PJ10): `const pendingW2 = ['tests/node/test-scope-contract.test.mjs','tests/node/composite-instructions.test.mjs','tests/node/plan-level-records-contract.test.mjs','tests/node/run-mode-contract.test.mjs','tests/test_arc_policy.py','tests/test_claude_payload.py','tests/test_harness_contract.py']`. W2가 이 상수를 지웁니다.
- [ ] **Step 3: 빈 fixture로 실패 확인.** `{"version":1,"rules":[]}` 상태에서 `node --test tests/node/rule-pins.test.mjs`를 실행합니다. 기대: 스키마·포함·배타성은 통과하고(항목 0), effective 자체 검사도 통과합니다. 이어서 임시로 존재하지 않는 `text` 항목 하나를 넣어 포함 test가 FAIL하는지 확인한 뒤 그 항목을 지웁니다.
- [ ] **Step 4: inventory와 대응표 작성(W1 범위).** 먼저 W1 대상 4개 파일의 inventory를 spec §3.9 형식으로 만듭니다(U11). 부분 참고 자료(`t0-baseline.md` 끝)는 그대로 믿지 않습니다. 그 inventory 행(`instruction-layout`, `agent-fragments`, `role-policy`, `instruction-contracts.json`)마다 §1.3에 따라 분류와 처리를 정합니다. 예상되는 처리는 다음과 같습니다. 최종 판정은 행마다 §3.1로 내립니다.
  - `instruction-layout.test.mjs:13` `gates` trigger 셀 → core RP(J38). `checkLayout`은 "core 표에 `references/<name>.md` 링크 행이 있다"만 확인합니다.
  - `:14-33` fast path → regex마다 문장 RP(doc `handoff`, `["claude","codex"]`). `**F1**`–`**F8**` 같은 토큰은 `effectiveSection(p,'handoff','## Orchestrator direct path for small tasks')`의 토큰 확인으로 바꿉니다. `assert.throws` 자기 검사(`:26-31,42-43,55-56`)는 삭제합니다(J42). `fastSections`는 삭제합니다(§4.5).
  - `:58-67` `node --input-type=module`, `realpathSync`, `createHash("sha256")`, 필드명 → 구조(effective section 토큰)
  - `:68-76` heading·필드 순서 → 구조(effective 텍스트)
  - `checkLayout` `contract.text`·`relocations`·`requiredBefore` → §3.5. heading 존재는 effective 문서에서 확인합니다. `:94-95` exceptions 줄 → core RP. `:96-102` 동적 비교는 유지합니다(J19). `:119-122` 음성 검사는 유지합니다.
  - `:105-111` bootstrap `equal` → 문장 RP(doc `bootstrap`). bytes·lines는 유지합니다(J10). custom 경로 확인과 `'Use Korean by default'`는 §3.1로 판정합니다.
  - `:115` opening → core RP. `:125-131` → RP(doc `handoff-prep`). `:132-135` → RP(doc `shared:handoff-worktree`). `:136-141` → codex 전용 RP(doc `git-recovery`). `:140` `doesNotMatch`는 유지합니다(PJ5).
  - `:142-152` → RP(guidance: doc `handoff`·`git-recovery`·`worktree-creation` 4플랫폼, authorization: doc `handoff`). fixture 필드는 삭제합니다.
  - `:156-158` protected는 유지합니다. 대상에서 agent 항목만 빠집니다.
  - `agent-fragments.test.mjs:15` → 문장 RP(doc `agent:planner`, `["claude","codex"]`)
  - `agent-fragments.test.mjs:19-36` → §3.5 렌더러 구조 검사로 바꿉니다. test 이름은 유지합니다. 개수 검사 `:26-28`도 유지합니다.
  - `agent-fragments.test.mjs:97-127` 문장 → RP(doc `agent:planner`, 4플랫폼). `removed`와 `'and focused questions'` 부재 검사는 유지합니다(PJ5).
  - `role-policy.test.mjs`의 관리 블록 문구 하드코딩 사본 → 중복으로 삭제합니다(§3.6). ID·투영 순서·결정성·marker 검사는 유지합니다.
- [ ] **Step 5: `rule-pins.json` 채우기.** 대응표의 규칙 행을 `RP-001`부터 차례로 넣습니다. 항목마다 `origin`에 `path:line`을 적습니다.
- [ ] **Step 6: `instruction-contracts.json` 정비(§3.5).**
  - 남는 키: `platforms.<p>.contracts[]{heading,destination,reader}`, `platforms.<p>.skill{bytes,lines}`, `platforms.<p>.global{bytes,lines}`, `protected`(agent 항목 제외)
  - 삭제하는 키: `text`, `requiredBefore`, `relocations`, `opening`, `bootstrap`, `worktreeHandoffRecordGuidance`, `worktreeHandoffRecordAuthorization`, `agentProfileBaseline`
- [ ] **Step 7: 테스트 3개 파일을 대응표대로 수정합니다.** 고정이 모두 빠진 test는 삭제할 수 있습니다. 단 parity destination(W2 Step 1 목록)과 의도된 기준선 실패 test(§3.8 (a))는 예외입니다(J32·J33). 남는 test의 이름은 바꾸지 않습니다.
- [ ] **Step 8: 실행.** `node --test --test-reporter=tap tests/node/rule-pins.test.mjs tests/node/instruction-layout.test.mjs tests/node/agent-fragments.test.mjs tests/node/role-policy.test.mjs`를 실행합니다. 기대: T0 대비 새 실패 0, rule-pins 4개 test 통과
- [ ] **Step 9: P3 자체 확인.** `node -e`로 대응표의 이전 행마다 확인합니다. literal이면 `rp.text.includes(literal)`, regex이면 `new RegExp(src,flags).test(이어 붙인 rp.text)`가 참이어야 합니다.
- [ ] **Step 10: CS 전체(CS-N, CS-P, CS-S)를 실행합니다.** MANIFEST·golden diff가 0인지 확인합니다(W1은 설치 파일을 바꾸지 않습니다).
- [ ] **Step 11: 보고.** 대응표 W1 행(§3.9 형식), 애매 목록, 삭제 행 목록, RP 항목 수, 실행 명령과 종료 코드, `git --no-optional-locks diff --name-only` 출력을 보고 본문으로 반환합니다.

- **AC:** AC-1(allowedPaths 대조), AC-2, AC-3, AC-5(P1–P5, W1 범위), AC-6(W1 파일 범위: 섹션 전문·agent SHA 0건)
- **관련 테스트와 이유:**
  - `rule-pins.test.mjs`: 새 고정의 정본입니다.
  - `instruction-layout`, `agent-fragments`, `role-policy`: 정비 대상입니다.
  - 나머지 CS: fixture 키 삭제가 다른 소비자를 깨지 않는지 확인합니다. grep 결과 소비자는 2개 파일뿐입니다.
- **Tester(task 모드) 확인:**
  - TW-1 P1: 대상 파일에서 inventory를 독립적으로 다시 만들어 Implementer inventory·대응표의 행 수·위치와 대조합니다.
  - TW-2 P2: 규칙 행의 삭제·낱말 전환이 0건입니다.
  - TW-3 P3: Step 9를 독립적으로 다시 실행합니다.
  - TW-4 P4·P5: `rule-pins.test.mjs`가 통과합니다. `pendingW2` 외의 예외가 없습니다.
  - TW-5 J33: W1 파일 안 parity destination test가 남아 있고 이름이 같습니다. `node scripts/check-installer-parity.mjs` 종료 코드가 T0와 같습니다.
  - TW-6: CS 전체 새 실패 0(test ID 기준). 삭제된 test는 대응표에 있습니다. 의도된 기준선 실패(§3.8 (a)) test 본문 diff는 0입니다. "삭제(stale)" 행마다 판정 근거를 독립적으로 재실행해 확인합니다.
  - TW-7: `grep -n "agentProfileBaseline\|requiredBefore\|relocations" tests/node`의 결과가 0건입니다.
- **커밋 메시지 초안:**
  ```
  test(instructions): 규칙 문장 고정을 rule-pins fixture로 모으고 핵심 계약 테스트 정비

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
- **hold:**
  - H-1: P1이 맞지 않으면 수락을 hold합니다.
  - H-7: parity destination에 남길 assertion이 없으면 그 test 정비를 hold합니다.
  - PH-1: 배타성 검사가 `pendingW2`도 아니고 change 파일도 아닌 파일에서 걸리면 W1을 hold하고, 파일과 RP-ID를 보고합니다.
  - PH-2: 대응표를 보고 본문에 다 담을 수 없으면 Orchestrator가 보관 방법을 정할 때까지 수락을 hold합니다.

---

## W2 — 정비 B: 나머지 계약 테스트와 Python

- **목표:** `test-scope-contract`, `composite-instructions`, `plan-level-records-contract`, `run-mode-contract`와 Python 3개를 정비합니다. W1의 `pendingW2`를 없앱니다.
- **Files:**
  - Modify: `tests/node/test-scope-contract.test.mjs`, `tests/node/composite-instructions.test.mjs`, `tests/node/plan-level-records-contract.test.mjs`, `tests/node/run-mode-contract.test.mjs`, `tests/test_arc_policy.py`, `tests/test_claude_payload.py`, `tests/test_harness_contract.py`, `tests/node/rule-pins.test.mjs`(`pendingW2` 삭제만), `tests/node/fixtures/rule-pins.json`
  - 손대지 않는 파일: W1의 다른 파일, `effective-doc.mjs`, 지침·원천·MANIFEST·golden, `tests/installer-parity.json`, no change Python 3개
- **allowedPaths:** 위 Modify 9개
- **선행:** W1 수락·커밋
- **Interfaces:** `effectiveText`/`effectiveSection`(W1)을 사용합니다. Python은 `_effective`/`_effective_section`을 파일마다 정의합니다(§1.2).

- [ ] **Step 1: inventory와 대응표 W2 행 작성.** §1.3 절차를 따릅니다.
  - 먼저 W2 대상 7개 파일의 inventory를 spec §3.9 형식으로 만듭니다(U11). 기준선 실패 여부 열은 `t0-baseline.md`의 method 목록으로 채웁니다.
  - parity destination 목록(구 T0 단계 7): `node -e`로 `tests/installer-parity.json`의 `entries[].destinations[]`와 `legacyHelpers[].destinations[]` 가운데 정비 대상 파일의 test를 모아 보고합니다.
  - (b) 기준선 실패 test의 고정은 stale 판정(§1.3)을 먼저 합니다.
  - 관리 블록 사본(P0-9: `test_arc_policy.py` 56건, `test_claude_payload.py` 38건, `test_harness_contract.py` 36건, `test-scope-contract` 20건)은 중복으로 삭제합니다. 맡은 행은 `instruction-layout.test.mjs:96-102` 동적 비교와 J35 해시입니다.
  - `test-scope-contract.test.mjs:88-101`: anchor 1회·heading 순서는 플랫폼 파일 기준으로 유지합니다. 본문 확인은 `effectiveSection`으로 바꿉니다(§4.5).
  - W1 항목과 (`doc`,`text`)가 같은 규칙은 PJ6에 따라 기존 RP의 `origin`에 추가합니다.
- [ ] **Step 2: `rule-pins.json`에 W2 신규 항목을 W1 마지막 번호 다음부터 추가합니다.**
- [ ] **Step 3: Node 4개 파일 수정.** 섹션 자르기와 본문 읽기는 `effective-doc.mjs`를 import해서 씁니다.
- [ ] **Step 4: Python 3개 파일 수정.**
  - 파일마다 `_effective(platform, name)`을 두고, 문서 본문 읽기를 그것으로 바꿉니다.
  - 문장 확인 assertion은 Python에서 없앱니다. 규칙이면 RP로 이전하고, 아니면 §3.1에 따라 처리합니다.
  - 고정을 모두 잃는 parity destination test(Step 1 목록)에는 `pins = json.loads((<파일의 기존 루트 상수> / "tests/node/fixtures/rule-pins.json").read_text())`, `ids = {r["id"] for r in pins["rules"]}`, `self.assertTrue({"RP-xxx", …} <= ids)`를 남깁니다(§3.3).
  - 의도된 기준선 실패(§3.8 (a), `test_harness_contract.py`) test 본문은 바꾸지 않습니다(J32). (b) test는 대응표대로 정비합니다.
- [ ] **Step 5: `rule-pins.test.mjs`에서 `pendingW2` 상수와 그 사용을 지웁니다.** (v4, PJ16) 대신 `j32Protected` 예외 목록을 둡니다. 목록의 각 항목은 해당 RP text가 그 test 본문 안에 실제로 있어야 하고(목록이 낡으면 실패), 그 밖의 사본은 그대로 실패합니다.
- [ ] **Step 6: 실행.** CS-N, CS-P, CS-S, `node scripts/check-installer-parity.mjs --complete`. 기대: T0 대비 새 실패 0. `--complete`는 T0와 같은 결과여야 합니다.
- [ ] **Step 7: P3 자체 확인(W1 Step 9와 같은 방법, W2 행)**
- [ ] **Step 8: AC-6 확인.**
  - `node --test tests/node/rule-pins.test.mjs` 배타성 test가 통과합니다.
  - `grep -rn "createHash" tests/node/agent-fragments.test.mjs`와 `instruction-contracts.json`의 `contracts[].text` 키가 0건입니다.
  - 섹션 전문 비교가 남았는지 grep으로 보고합니다.
- [ ] **Step 9: 보고.** W1 Step 11과 같은 항목에 Python parity destination 처리표를 더합니다.

- **AC:** AC-1, AC-2, AC-3, AC-5(P1–P5, 전체), AC-6(전체). AC-13의 기준 시점(W2 수락 시점 RP 항목 수)도 정합니다.
- **관련 테스트와 이유:** 정비 대상 7개입니다. `rule-pins.test.mjs`는 배타성이 이제 전체 범위로 적용되기 때문입니다. `check-installer-parity --complete`는 Python destination 보존 때문입니다.
- **Tester(task 모드) 확인:** TW-1–TW-7을 W2 범위에 적용합니다. 추가로 다음을 확인합니다.
  - TW-8: `pendingW2`가 0건입니다. `j32Protected` 항목마다 RP text가 지정 test 본문(`test_harness_contract.py`, §3.8 (a) method)에 있고, 그 test 본문 diff는 0입니다.
  - TW-9: W2 수락 시점 RP 항목 수를 기록합니다(AC-13 기준).
  - TW-10: Python에 rule text 문장 비교가 0건입니다. 배타성 test가 같은 것을 보장합니다.
- **커밋 메시지 초안:**
  ```
  test(instructions): 나머지 계약 테스트와 Python 고정을 rule-pins 기준으로 정비

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
- **hold:** H-1, H-7, PH-1, PH-2. (a) 기준선 실패 test가 통과로 바뀌면 보고하고 수락 전에 Orchestrator가 판단합니다. (b) test가 통과로 바뀌는 것은 보고만 합니다(§3.8).

---

## W3 — 원천 편집과 재생성(§6)

- **목표:** `role-policy.json`(`rules[].text`, `platforms.*.notice`), `agent-fragments.json`(`fragments[].text`), `agentsBlockBody()` 문장 리터럴에 U4·J2·U5를 적용합니다. 그다음 관리 블록, runtime, 해시, RP, MANIFEST, golden을 갱신합니다.
- **Files:**
  - Modify(편집): `lib/policy/role-policy.json`, `lib/prompts/agent-fragments.json`, `lib/installer/global-config.mjs`(`agentsBlockBody` 문장 리터럴만)
  - Modify(생성기 출력): `{claude,codex,gemini,grok}/skill/SKILL.md`, `{claude,codex,gemini,grok}/agents/*`, `{claude,codex,gemini,grok}/skill/references/{coordination,planning,handoff,handoff-prep,commit,verification}.md`의 관리 블록, `shared/skill/runtime/role-policy.json`
  - Modify(고정값): `tests/node/fixtures/instruction-contracts.json`(protected 해시 2개만), `tests/node/fixtures/rule-pins.json`, `MANIFEST.sha256`, `tests/node/fixtures/installed-layout-golden.json`, `tests/node/plan.test.mjs`(v8, `renderingBaseline` 값만)
  - 손대지 않는 파일: `lib/policy/*.mjs`, `lib/prompts/render.mjs`, 그 밖의 `lib/installer/*`, `scripts/*`, 관리 블록 밖의 문서 산문, agent template 산문
- **allowedPaths:**
  - `lib/policy/role-policy.json`, `lib/prompts/agent-fragments.json`, `lib/installer/global-config.mjs`
  - `claude/skill/SKILL.md`, `codex/skill/SKILL.md`, `gemini/skill/SKILL.md`, `grok/skill/SKILL.md`
  - `claude/agents/`, `codex/agents/`, `gemini/agents/`, `grok/agents/`
  - `{claude,codex,gemini,grok}/skill/references/{coordination,planning,handoff,handoff-prep,commit,verification}.md` (24개 파일로 펼쳐 넣습니다)
  - `shared/skill/runtime/role-policy.json`
  - `tests/node/fixtures/instruction-contracts.json`, `tests/node/fixtures/rule-pins.json`, `MANIFEST.sha256`, `tests/node/fixtures/installed-layout-golden.json`, `tests/node/plan.test.mjs`(v8)
- **선행:** W2 수락·커밋, H-3 해당 없음

- [ ] **Step 0: D-0을 원천 3개와 생성 대상 문서에 적용합니다.**
- [ ] **Step 1: ledger 작성과 원천 편집.**
  - 문자열마다 §5.1–5.3을 적용하고, ledger 행(§8 형식)을 씁니다. `may`가 양쪽으로 읽히면 hold합니다(H-5).
  - JSON 문자열의 이스케이프와 JS 리터럴의 따옴표 구조는 바꾸지 않습니다.
  - `agentsBlockBody`에서는 문장 리터럴만 고치고, 경로·조건 코드는 건드리지 않습니다.
- [ ] **Step 2: 재생성.** `npm run update:role-policy`, `node scripts/update-runtime-assets.mjs`
- [ ] **Step 3: 관리 블록 diff 확인.** `git --no-optional-locks diff --stat`에서 생성기 출력 파일의 변경이 관리 블록 안(`[ARC role policy: contract begin]`…`end`)에만 있는지 확인합니다. `git --no-optional-locks diff -U0 -- '*/skill/SKILL.md' '*/skill/references/*.md' '*/agents/*'`의 모든 hunk가 marker 사이에 있어야 합니다.
- [ ] **Step 4: 해시 갱신(J35).** `shasum -a 256 lib/policy/role-policy.json shared/skill/runtime/role-policy.json`의 값으로 `instruction-contracts.json` `protected`의 두 값을 바꿉니다. 이전·이후 해시를 보고합니다.
- [ ] **Step 5: RP 갱신(§6-5, §7).** `core`·`agent:*`·`bootstrap` 항목 가운데 ledger의 "이전" 문장을 포함하는 `text`를 "이후"로 치환합니다. RP-ID, 이전, 이후, ledger 행 ID를 치환표로 남깁니다. 항목 수는 W2 기준 이상이어야 합니다.
- [ ] **Step 6: 확인.** `npm run check:role-policy`, `node scripts/update-runtime-assets.mjs --check`. 둘 다 exit 0이어야 합니다.
- [ ] **Step 7: MANIFEST.** `node scripts/update-manifest.mjs` → `npm run check:manifest` exit 0. 바뀐 행이 allowedPaths 안의 설치 파일 행뿐인지 `git --no-optional-locks diff -U0 -- MANIFEST.sha256`로 확인합니다.
- [ ] **Step 8: golden.** `node tests/node/fixtures/installed-layout.mjs --diff` 출력을 기록합니다. 기대 줄은 모두 `~`이고 SKILL.md, 6개 references, 설치 agent profile, runtime `role-policy.json`에 대응해야 합니다. §11.2 조건(T0 통과, `build/native` 있음, 범위 안)을 충족할 때만 `--write`를 실행하고, 다시 `--diff`를 실행해 0줄을 확인합니다.
- [ ] **Step 9: CS 전체를 실행합니다.**
- [ ] **Step 10: 보고.** ledger, RP 치환표, 해시 전후, golden `--diff` 원 출력, 명령과 종료 코드, 변경 파일 목록

- **AC:** AC-1, AC-2, AC-3, AC-4, AC-7, AC-8(관리 블록은 재생성으로만 바뀜), AC-10(원천 범위), AC-13
- **관련 테스트와 이유:**
  - `role-policy`, `instruction-layout`: 동적 관리 블록 비교와 protected 해시를 봅니다.
  - `agent-fragments`: 렌더러 구조와 fragment 1회 출현을 봅니다.
  - `rule-pins`: core·agent·bootstrap 항목을 봅니다.
  - `manifest`, `installed-layout-golden`: 재생성 결과를 봅니다.
  - Python 3개: 원천 읽기를 봅니다.
- **Tester(task 모드) 확인:**
  - TD-1 AC-7: 원천 diff의 문구 변경이 ledger 행과 1:1로 대응합니다. U4 단독 행은 `toLowerCase()` 비교 차이가 0입니다.
  - TD-2 AC-8: 생성기 출력 파일의 hunk가 모두 관리 블록 안에 있습니다. JSON 키·구조 diff가 0입니다(`node -e`로 키 경로 집합을 비교합니다).
  - TD-3 AC-13: `rule-pins.json` diff가 치환표 행과 1:1로 대응하고 항목 수가 줄지 않았습니다.
  - TD-5 AC-10: 원천 문자열의 소문자 규범어 잔존 스캔. 모든 hit이 ledger 비대상·hold 행과 대응해야 합니다.
  - TD-7 AC-4: golden diff 줄이 범위 안에 있습니다.
  - CS 전체 새 실패 0. AC-3 스크립트 exit 0이거나 T0와 같은 실패입니다.
- **커밋 메시지 초안:**
  ```
  refactor(policy): 원천 지침 문구 규범어 대문자화·정리와 관리 블록 재생성

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
- **hold:** H-2(golden `--write`만), H-3, H-5. PH-1(RP 갱신 뒤 배타성 위반). 관리 블록 밖 hunk가 생기면 W3를 hold하고 보고합니다.

---

## W4 — agents template 산문

- **목표:** 20개 agent 파일에서 marker(`{{ARC_AGENT_FRAGMENT:…}}`)와 관리 블록 밖의 template 산문에 U4·J2·U5를 적용합니다. frontmatter는 제외하고 보고합니다(J37).
- **Files:**
  - Modify: `{claude,gemini,grok}/agents/arc-{implementer,planner,reviewer,scouter,tester}.md`, `codex/agents/arc-{…}.toml`, `tests/node/fixtures/rule-pins.json`, `MANIFEST.sha256`, golden
  - 손대지 않는 파일: `lib/prompts/agent-fragments.json`, 관리 블록, frontmatter, TOML 키·구조
- **allowedPaths:** `claude/agents/`, `codex/agents/`, `gemini/agents/`, `grok/agents/`, `tests/node/fixtures/rule-pins.json`, `MANIFEST.sha256`, `tests/node/fixtures/installed-layout-golden.json`, `tests/node/plan.test.mjs`(v8)
- **선행:** W3 수락·커밋
- [ ] 0. D-0을 agent 파일에 적용합니다.
- [ ] 1. 플랫폼 묶음(J41)을 확인합니다. 같은 문장이 여러 플랫폼 파일에 있으면 묶음 단위로 ledger 행을 씁니다.
- [ ] 2. §5를 적용해 편집합니다. marker 줄, 관리 블록, frontmatter, TOML `"""` 경계는 바이트 그대로 둡니다.
- [ ] 3. §7 RP 갱신(`agent:*`)과 치환표를 작성합니다.
- [ ] 4. `npm run check:role-policy`를 실행해 관리 블록이 안 바뀌었는지 확인합니다. `node --test tests/node/agent-fragments.test.mjs tests/node/rule-pins.test.mjs`를 실행합니다.
- [ ] 5. MANIFEST(W3 Step 7과 같은 방법). golden(W3 Step 8과 같은 방법). 기대 golden 줄은 설치 agent profile의 `~`뿐입니다.
- [ ] 6. CS 전체를 실행하고 보고합니다(ledger, 치환표, golden 출력, frontmatter·축약형 보고 목록).
- **AC:** AC-1, AC-2, AC-3, AC-4, AC-7, AC-8, AC-10, AC-13
- **관련 테스트와 이유:** `agent-fragments`(marker 무결성과 TOML 파싱 오류 검출), `rule-pins`(`agent:*`), `instruction-language`(Hangul), `manifest`·golden
- **Tester 확인:**
  - TD-1, TD-3, TD-5, TD-7을 적용합니다.
  - TD-2'로 marker 집합과 순서, 관리 블록 바이트, frontmatter 바이트가 base와 같은지 확인합니다.
  - TD-4로 backtick span 다중집합이 같은지 확인합니다.
- **커밋 메시지 초안:**
  ```
  refactor(agents): agent 프로필 template 산문 규범어 대문자화·정리

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
- **hold:** H-2, H-5, PH-1

---

## W5 — SKILL.md

- **목표:** 4플랫폼 `SKILL.md`에 U4·J2·U5를 적용합니다. 추출은 하지 않습니다(J4). 크기 상한 값은 바꾸지 않습니다(J10).
- **Files:**
  - Modify: `{claude,codex,gemini,grok}/skill/SKILL.md`, `tests/node/fixtures/rule-pins.json`, `MANIFEST.sha256`, golden
  - 손대지 않는 파일: 관리 블록, gate 표의 링크 셀, `references/<name>.md#<id>` 링크, `instruction-contracts.json`(bytes·lines)
- **allowedPaths:** `claude/skill/SKILL.md`, `codex/skill/SKILL.md`, `gemini/skill/SKILL.md`, `grok/skill/SKILL.md`, `tests/node/fixtures/rule-pins.json`, `MANIFEST.sha256`, `tests/node/fixtures/installed-layout-golden.json`, `tests/node/plan.test.mjs`(v8)
- **선행:** W4 수락·커밋
- [ ] 0. D-0을 SKILL.md에 적용합니다.
- [ ] 1. 편집과 ledger 작성. gate trigger 셀(J38)이 바뀌면 core RP를 갱신합니다(§7).
- [ ] 2. 크기 확인: `wc -c -l */skill/SKILL.md` 값이 `instruction-contracts.json`의 `skill.bytes`·`skill.lines`보다 작아야 합니다(AC-12).
- [ ] 3. RP 치환표, MANIFEST, golden(기대: SKILL.md `~`), CS 전체, 보고
- **AC:** AC-1, AC-2, AC-3, AC-4, AC-7, AC-8, AC-10, AC-12, AC-13
- **관련 테스트와 이유:** `instruction-layout`(크기 상한, gate 행 링크, core 링크 존재, 동적 관리 블록), `rule-pins`(core), golden·manifest
- **Tester 확인:** TD-1, TD-3, TD-4, TD-5, TD-7과 다음을 확인합니다.
  - TD-8: `<a id>` 집합과 heading 줄 diff가 0입니다. `git --no-optional-locks diff -U0 8ec7d907 -- '*/skill/SKILL.md' | grep -E '^[-+](#{1,6} |<a id=)'`의 출력이 없어야 합니다.
  - TD-9: 크기 상한을 통과합니다.
- **커밋 메시지 초안:**
  ```
  refactor(skill): SKILL.md 규범어 대문자화와 문장 정리

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
- **hold:** H-2, H-5, PH-1

---

## W6–W14 — reference 문서별 추출과 정리 (문서 하나 × 4플랫폼 = task 하나)

### 공통 Files 패턴(`<name>` = 해당 문서)

- Create: `shared/skill/references/<name>-common.md`
- Modify: `{claude,codex,gemini,grok}/skill/references/<name>.md`, `tests/node/fixtures/rule-pins.json`, `tests/node/instruction-language.test.mjs`(목록에 `'shared/skill/references/<name>-common.md'` 한 줄만 추가), `MANIFEST.sha256`, golden
- 손대지 않는 파일: 다른 reference 문서, `SKILL.md`, 관리 블록(M), 원천, effective-doc·테스트 로직
- **allowedPaths:**
  - `claude/skill/references/<name>.md`, `codex/skill/references/<name>.md`, `gemini/skill/references/<name>.md`, `grok/skill/references/<name>.md`
  - `shared/skill/references/<name>-common.md`
  - `tests/node/fixtures/rule-pins.json`, `tests/node/instruction-language.test.mjs`, `MANIFEST.sha256`, `tests/node/fixtures/installed-layout-golden.json`, `tests/node/plan.test.mjs`(v8)
- **선행:** 직전 문서 task 수락·커밋. W6은 W5 수락과 H-8 보고 완료가 선행입니다.

### 공통 절차(D-1–D-11)

- [ ] **D-0: no change 테스트 의존 조사(v2, 구 T0 단계 6·11, H-6·PH-3).** 이 task가 바꾸는 문서(원천 포함)마다 다음을 합니다.
    - `tests/` 아래 `*.mjs|*.py|*.json` 가운데 정비 대상 10개 파일, `rule-pins.json`, `tests/installer-parity.json`, golden을 뺀 파일에서 그 문서의 경로·파일명을 참조하는 파일을 `rg -l`로 찾습니다. 문서 이름을 쓰지 않고 읽는 경우를 위해, 편집 대상 문장의 20자 이상 조각도 같은 파일 집합에서 검색합니다.
    - 찾은 파일의 assertion 가운데 문서 본문 토큰(길이 무관)이나 20자 이상 산문 literal을 확인하는 것을 `path:line | 문서 | 토큰`으로 나열합니다. 이 목록이 이 task의 CS-X입니다.
    - 산문 literal이 편집·이동 대상이면 편집 전에 멈추고 보고합니다(H-6). 토큰이 이동 대상 run에 속하면 편집 전에 멈추고 보고합니다(PH-3).
    - 알려진 후보: `tests/node/grok-install.test.mjs:236`(Grok sandbox 산문, H-6 후보). W6에서는 shared reference 간접 열거(H-8)도 다시 확인합니다.
- [ ] **D-1: S 재판정(J27).** 4플랫폼 파일을 heading 줄로 섹션을 나누고, 빈 줄로 블록을 나눕니다.
  - 같은 heading 아래에서 4플랫폼 바이트가 모두 같은 블록을 S로 봅니다. `<a id>` 줄과 heading 줄은 run 경계이며 옮기지 않습니다(PJ11).
  - S run은 4플랫폼 모두에서 같은 순서로 이어지는 S 블록의 최대 연속입니다.
  - `p0-classify.md` 범위와 차이가 나면 보고합니다. 4플랫폼이 다른 run은 D로 기록합니다(H-4).
  - 결과는 `run ID | 섹션 heading | claude 줄 범위 | 4플랫폼 바이트 동일 확인` 표로 남깁니다.
- [ ] **D-2: 이동(바이트 그대로).**
  - `<name>-common.md`를 §4.3 구조로 만듭니다. run은 원래 문서 순서대로 둡니다(PJ11). `<id>`는 §4.3 규칙으로 정합니다. 섹션 중간의 `<a id>` 뒤에 오는 run은 그 id를 씁니다(PJ11).
  - 플랫폼 파일에서는 run 자리에 고정 연결 문장 한 줄을 둡니다. 앞뒤 빈 줄 구조는 유지합니다.
- [ ] **D-3: J29 링크 재작성.** 옮긴 문단 안의 `](#id)`를 `](<name>.md#id)`로 바꿉니다. 다른 파일 링크는 그대로 둡니다. 재작성마다 ledger 행(종류 `링크 재작성`)을 씁니다.
- [ ] **D-4: 이동 검증.**
  - `node --test tests/node/rule-pins.test.mjs`가 통과해야 합니다. 재작성된 링크를 포함한 RP는 D-7에서 갱신합니다.
  - run마다 공용 문서 텍스트가 원문과 바이트로 같은지 `node -e`로 확인합니다. J29 재작성만 예외입니다.
  - 플랫폼 파일의 `<a id>`·heading 줄 diff가 0인지 확인합니다.
- [ ] **D-5: 편집(§5).** S 문장은 공용 문서에서 한 번만 편집합니다. D 문장은 플랫폼 묶음으로 편집합니다(J41). 이동한 run의 ledger 행은 run 단위로 씁니다(§8).
- [ ] **D-6: 잔존 스캔(AC-10).** 4플랫폼 파일과 공용 문서를 대상으로 `grep -nE '\b(must|should|may)\b|(^|[.;:]\s+|^\s*[-*|]\s*)(Never|never|Do not|do not|Don.t)\b'`를 실행합니다. hit마다 ledger의 비대상·hold 행 ID를 붙입니다.
- [ ] **D-7: RP 갱신(§7).** ledger의 문구 변경과 링크 재작성 쌍으로 해당 `doc` 항목의 `text`를 치환합니다. 치환표를 씁니다. 합쳐진 경우에는 `mergedFrom`을 적습니다.
- [ ] **D-8: `instruction-language.test.mjs`에 `'shared/skill/references/<name>-common.md',` 한 줄을 추가합니다.** 위치는 `'shared/skill/references/handoff-worktree.md',` 바로 다음입니다.
- [ ] **D-9: MANIFEST.** `node scripts/update-manifest.mjs` → `npm run check:manifest` exit 0. 바뀐 행은 플랫폼 파일 4개의 SHA와 새 공용 문서 1개의 추가여야 합니다.
- [ ] **D-10: golden.** `--diff`를 기록합니다. 기대 줄은 조합마다 `~ … skills/arc/references/<name>.md`와 `+ … skills/arc/references/<name>-common.md`입니다. §11.2 조건을 충족할 때만 `--write`를 실행하고 재`--diff` 0줄을 확인합니다.
- [ ] **D-11: CS 전체와 CS-X 가운데 이 문서를 읽는 파일을 실행합니다. 보고합니다.** 보고 내용: D-1 표, ledger, RP 치환표, 잔존 스캔 대응, golden 원 출력, J12 보존 확인, 명령·종료 코드, 변경 파일 목록

### 공통 AC와 Tester 확인

- **AC:** AC-1, AC-2, AC-3, AC-4, AC-7, AC-8, AC-9, AC-10, AC-13
- **Tester(task 모드):**
  - TD-1 AC-7: diff와 ledger가 1:1로 대응합니다. effective 텍스트 기준으로 비교합니다(base 플랫폼 파일 대 HEAD `effectiveText`). U4 단독 행은 접기 비교 차이가 0입니다.
  - TD-3 AC-13: fixture diff와 치환표가 1:1로 대응하고 항목 수가 줄지 않았습니다.
  - TD-4 AC-8: 플랫폼마다 base 파일과 HEAD effective 텍스트의 backtick span 다중집합이 같습니다. 플랫폼 파일의 `<a id>` 집합과 heading 줄 diff가 0입니다. 관리 블록 바이트가 같습니다.
  - TD-5 AC-10: 잔존 스캔을 독립적으로 다시 실행해 대응을 확인합니다.
  - TD-6 AC-9:
    - run마다 이동 전 4플랫폼 바이트가 같습니다(D-1을 독립적으로 재실행).
    - 공용 문서 텍스트가 원문과 같습니다(J29 예외).
    - 원래 위치에 연결 문장이 바이트 그대로 있습니다.
    - 링크 무결성(v2): base `8ec7d907`(`git --no-optional-locks show`)과 HEAD에서 같은 방법으로 검사합니다. 상대 링크의 대상 파일이 플랫폼 디렉터리나 `shared/skill/references/`에 있는지, `#id`가 `<a id>`나 heading slug에 있는지 봅니다. base 대비 새로 깨진 링크가 0이어야 합니다.
  - TD-7 AC-4: golden 줄이 기대 범위 안에 있습니다.
  - CS 전체와 해당 CS-X에서 새 실패 0입니다.
- **hold(공통):** H-2, H-4(run 단위), H-5(문장, 묶음), H-6, PH-1, PH-3. W6 전에 H-8을 보고합니다.

### 문서별 표

| ID | `<name>` | 특이사항(근거) | 커밋 메시지 초안(본문 끝에 Co-Authored-By trailer) |
|---|---|---|---|
| W6 | `arc-visual-companion` | M 없음. J12 제안 흐름 차이는 보존하고 보고합니다. codex diff 줄이 S 범위와 겹치므로(`p0-classify.md:16,20`) D-1에서 다시 판정합니다. | `refactor(skill): arc-visual-companion 공통 문단 shared 추출과 문장 정리` |
| W7 | `commit` | M 50-57은 플랫폼에 남깁니다. | `refactor(skill): commit 공통 문단 shared 추출과 문장 정리` |
| W8 | `coordination` | D 문단이 여럿(codex·gemini·grok)이어서 run이 나뉩니다. `bridge-target-rules` anchor는 `docs/harness-operation.md`가 링크합니다. codex `tester_installer_checks` 토큰과 brief 필드 순서 구조 검사는 effective 텍스트로 봅니다. `MAY` 예시는 §5.1(`coordination.md:214`)입니다. | `refactor(skill): coordination 공통 문단 shared 추출과 문장 정리` |
| W9 | `git-recovery` | M 없음. J12 Codex sandbox 조건은 보존합니다. codex 전용 RP와 PJ5 부재 검사가 있습니다. 4플랫폼 guidance RP가 있습니다. | `refactor(skill): git-recovery 공통 문단 shared 추출과 문장 정리` |
| W10 | `handoff` | 가장 큰 S(82%)입니다. fast path 섹션 RP·토큰은 claude/codex만 해당합니다. guidance+authorization RP, M이 있습니다. | `refactor(skill): handoff 공통 문단 shared 추출과 문장 정리` |
| W11 | `handoff-prep` | `planning-document-commit` anchor RP와 M이 있습니다. D 69-70은 플랫폼별입니다. | `refactor(skill): handoff-prep 공통 문단 shared 추출과 문장 정리` |
| W12 | `limits` | M 없음. D 27-29가 있습니다. | `refactor(skill): limits 공통 문단 shared 추출과 문장 정리` |
| W13 | `planning` | `full-auto-run-mode` anchor는 `docs/harness-operation.md`가 링크합니다. M이 있습니다. | `refactor(skill): planning 공통 문단 shared 추출과 문장 정리` |
| W14 | `verification` | J12 최종 diff artifact 차이는 보존합니다. D 15(gemini·grok), M이 있습니다. | `refactor(skill): verification 공통 문단 shared 추출과 문장 정리` |

- **관련 테스트와 이유(모든 문서 task):**
  - `rule-pins`: effective 포함 검사
  - `instruction-layout`: heading 존재, gate 행, 동적 관리 블록
  - `test-scope-contract`·`composite-instructions`·`plan-level-records-contract`·`run-mode-contract`: effective section 토큰
  - `instruction-language`: 새 공용 문서
  - `manifest`·golden: 새 shared 파일
  - Python 3개: `_effective`
  - CS-X: no change 토큰 확인

---

## W15 — worktree-creation(4플랫폼)과 handoff-worktree

- **목표:** U4·J2·U5만 적용합니다. 추출하지 않습니다(J11·J26). 공용 문서는 만들지 않습니다.
- **Files:**
  - Modify: `{claude,codex,gemini,grok}/skill/references/worktree-creation.md`, `shared/skill/references/handoff-worktree.md`, `tests/node/fixtures/rule-pins.json`, `MANIFEST.sha256`, golden
  - 손대지 않는 파일: `instruction-language.test.mjs`(이미 두 파일이 목록에 있습니다), N 문단의 플랫폼별 고유명
- **allowedPaths:** `claude/skill/references/worktree-creation.md`, `codex/skill/references/worktree-creation.md`, `gemini/skill/references/worktree-creation.md`, `grok/skill/references/worktree-creation.md`, `shared/skill/references/handoff-worktree.md`, `tests/node/fixtures/rule-pins.json`, `MANIFEST.sha256`, `tests/node/fixtures/installed-layout-golden.json`, `tests/node/plan.test.mjs`(v8)
- **선행:** W14 수락·커밋
- [ ] 1. D-0, D-5–D-7, D-9–D-11을 적용합니다(이동 단계 D-1–D-4, D-8 없음). guidance 문단 RP(doc `worktree-creation`)와 `shared:handoff-worktree` RP를 갱신합니다.
- **AC:** AC-1, AC-2, AC-3, AC-4, AC-7, AC-8, AC-10, AC-13
- **Tester 확인:** TD-1, TD-3, TD-4, TD-5, TD-7과 TD-6의 링크 무결성 부분
- **커밋 메시지 초안:**
  ```
  refactor(skill): worktree-creation과 handoff-worktree 규범어 대문자화·정리

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
- **hold:** H-2, H-5, H-6, PH-1, PH-3

---

## 최종 Tester (final 모드)

- **선행:** W1–W15 모두 수락·커밋, task Tester 실패 재확인 완료
- **실행:**
  - [ ] 1. 최종 HEAD에서 CS-N, CS-P, CS-S, CS-X 전체를 실행하고 T0와 비교합니다(AC-2, AC-3).
  - [ ] 2. `node scripts/check-installer-parity.mjs --complete`를 실행합니다. T0에서 실패였다면 같은 실패인지 비교합니다.
  - [ ] 3. 링크 무결성 전체(TD-6과 같은 base 대비 방법, 공용 문서 9개 포함): 새로 깨진 링크 0(AC-9)
  - [ ] 4. AC-1: `git --no-optional-locks diff --name-only 8ec7d907..HEAD`가 §2 change 행과 spec·plan만 포함합니다.
  - [ ] 5. AC-6: 배타성 test 통과. `grep -n "agentProfileBaseline\|createHash" tests/node/agent-fragments.test.mjs tests/node/fixtures/instruction-contracts.json` 결과 0. `node -e` 로 `instruction-contracts.json`의 모든 `platforms.*.contracts[]`에 `text` 키가 0건인지 확인. 섹션 전문 비교 0. `pendingW2` 0
  - [ ] 6. AC-10: 대상 범위 전체 잔존 스캔과 누적 ledger의 대응
  - [ ] 7. AC-12: 크기 상한. AC-13: RP 항목 수가 W2 기준 이상
  - [ ] 8. AC-4: `installed-layout.mjs --diff` 0줄(또는 H-2 hold 기록)
- **겹치는 파일(재확인 대상):**
  - `rule-pins.json`(W1–W15)
  - `MANIFEST.sha256`·golden(W3–W15)
  - `instruction-language.test.mjs`(W6–W14)
  - `instruction-contracts.json`(W1·W3)
  - `rule-pins.test.mjs`(W1·W2)
  - 관리 블록이 있는 문서(W3과 W5·W7·W8·W10·W11·W13·W14)
  - agents(W3·W4)
- **전체 회귀 trigger 잠정 판단:** 실행하지 않습니다. 대체 검사는 위 1–8과 CS-X입니다. 사유: 사용자 환경 기록(J40)과, 변경이 지침 텍스트·고정 fixture·생성 산출물에 한정된다는 점입니다. CS-X가 no change 테스트의 문서 토큰 의존을 대신 확인합니다. 필요하다고 판단되면 Orchestrator가 사용자 승인을 받습니다.
- **새 실패:** Implementer → Tester 재확인을 거친 뒤 최종 Reviewer를 시작합니다.

## 최종 Reviewer (native, 1회)

- **선행:** 최종 Tester 결론 완료(새 실패 해소, 간헐 후보 처리 완료)
- **범위:** `git --no-optional-locks diff 8ec7d907..HEAD` 전체와 workflow 산출물(대응표, ledger, 치환표, T0)
- **중점:**
  - 의미 보존 ①–④
  - 애매 목록과 PJ5 부재 검사 유지 목록
  - 삭제 행 표본
  - 연결 문장의 효력과 공용 문서 머리말
  - RP `platforms`가 원래 루프와 일치하는지(PJ2)
  - J12 차이 보존
- **AC:** AC-5(표본), AC-11(Orchestrator와 함께), AC-14
- **지적 처리:** Implementer → Reviewer를 반복합니다. Tester는 다시 배정하지 않습니다. 수정은 Reviewer 재확인까지 커밋하지 않고, 수락한 뒤 follow-up 커밋 1개로 만듭니다.

---

## 2. spec 요구사항과 AC 매핑

| spec | 내용 | task |
|---|---|---|
| §2 | change / no change | 모든 task의 allowedPaths, 최종 Tester 4단계 |
| §3.1–3.2 | 분류·처리 | W1, W2(§1.3) |
| §3.3 | rule-pins 형식·검사기 | W1 Step 2·5, W2 Step 5 |
| §3.4 | effective 문서 | W1 Step 1, W2 Step 4 |
| §3.5 | instruction-contracts | W1 Step 6, W3 Step 4 |
| §3.6 | 관리 블록 사본 | W1 Step 4, W2 Step 1 |
| §3.7 | parity destination | W2 Step 1(v2), W1·W2(TW-5) |
| §3.8 | 기준선 실패 | T0 4단계, 모든 task |
| §3.9–3.10 | 대응표·P1–P5 | W1, W2 |
| §4 | 추출·링크 | W6–W14 D-1–D-4, 최종 Tester 3단계 |
| §5 | 문장 판정 | W3–W15 |
| §6 | 원천·재생성 | W3 |
| §7 | RP 갱신 | W3–W15 |
| §8 | ledger | W3–W15 |
| §9 | 단위·순서 | 이 plan의 구조 |
| §11 | 검증 | §1.1, 최종 Tester·Reviewer |
| §12 | H-1–H-8 | task별 hold |

| AC | task / 최종 |
|---|---|
| AC-1 | 모든 task(allowedPaths 대조), 최종 Tester 4 |
| AC-2 | 모든 task Tester, 최종 Tester 1 |
| AC-3 | 모든 task, 최종 Tester 1·2 |
| AC-4 | W3–W15(D-10), W1·W2는 diff 0, 최종 Tester 8 |
| AC-5 | W1, W2, 최종 Reviewer 표본 |
| AC-6 | W1(부분), W2(전체), 최종 Tester 5 |
| AC-7 | W3–W15(TD-1) |
| AC-8 | W3–W15(TD-2·TD-4·TD-8) |
| AC-9 | W6–W14(TD-6), W15 링크, 최종 Tester 3 |
| AC-10 | W3–W15(TD-5), 최종 Tester 6 |
| AC-11 | 최종(Orchestrator가 hold·애매·R4 후보·J12·불분명 문서 목록을 모아 보고) |
| AC-12 | W5(TD-9), 모든 task CS, 최종 Tester 7 |
| AC-13 | W2(기준 시점), W3–W15(TD-3), 최종 Tester 7 |
| AC-14 | 최종 Reviewer |

## 3. 작성자 판단(plan 단계)

| ID | 판단 | 이유 |
|---|---|---|
| PJ1 | 문서 task는 W6–W14를 알파벳순으로 진행합니다. | §9가 순서를 plan에 맡겼습니다. 가장 작은 `arc-visual-companion`(3KB)이 먼저 와서 추출 절차를 작게 시험할 수 있습니다. |
| PJ2 | RP `platforms`는 원래 테스트 루프의 플랫폼만 적습니다. | J34(새 고정 금지). spec §3.3 예시의 4플랫폼은 형식 예시일 뿐입니다. 원래 `:126`은 claude/codex 루프입니다. |
| PJ3 | `effectiveSection`(Node)과 필요할 때만 `_effective_section`(Python)을 추가합니다. | §3.1-5와 §4.5가 "그 섹션의 effective 텍스트"를 요구합니다. 공용 문서에 같은 heading이 반복되므로 `split` 한 번으로는 자를 수 없습니다. 산출물 범위는 바뀌지 않습니다. |
| PJ4 | literal 고정은 literal 그대로 항목 1개로 옮깁니다. regex만 문장 단위로 펼칩니다. 섹션 전문은 문장 단위로 판정합니다. | spec 예시 RP-001과 §3.2, §3.5를 따릅니다. |
| PJ5 | 부재 검사(`doesNotMatch`, `!includes`)는 구조로 유지하고 애매 목록에 올립니다. | §3.1의 1–6 정의는 맞히는 문장이 있는 고정을 전제합니다. 부재 검사를 삭제하면 보호가 줄어듭니다(J31 취지). 이 검사는 문구를 고정하지 않으므로 U7과 충돌하지 않습니다. |
| PJ6 | 이미 같은 (`doc`,`text`) 항목이 있는 규칙은 기존 항목의 `origin`에 추가합니다. | §3.3 유일성 검사와 §3.1-6 중복 규칙을 함께 만족시킵니다. |
| PJ7 | 배타성 검사는 원문 형태와 `JSON.stringify` 이스케이프 형태를 모두 찾습니다. (v7, PJ19) `.py` 파일은 인접 문자열 literal 이어 붙이기(`"a " "b"`, 줄바꿈 포함)를 합친 형태도 찾습니다. | JSON 안의 따옴표 이스케이프 때문에 생기는 거짓 음성을 막습니다. 검사를 강화하는 방향이고 완화가 아닙니다. |
| PJ8 | T0 (4)의 "지침 문서"에 원천과 렌더링 결과(`role-policy` text, fragments, `agentsBlockBody`, agent profile)를 포함합니다. | §2가 원천을 지침 대상으로 분류합니다. W3가 이 문구를 바꿉니다. |
| PJ9 | T0 (9)를 추가합니다. no change 테스트가 지침 문서 토큰을 길이와 관계없이 확인하면 목록(CS-X)을 만들고, 해당 문서 task와 최종 Tester에서 실행합니다. 이동 run에 걸리면 PH-3으로 hold합니다. | H-6은 20자 이상 literal만 다룹니다. 짧은 토큰도 run 이동으로 플랫폼 파일에서 빠지면 깨질 수 있는데, 계약 검사 집합 밖이라 그대로 지나칠 수 있습니다. 검증을 더하는 쪽이고 범위를 바꾸지 않습니다. |
| PJ10 | W1의 배타성 검사는 W2 대상 7개 파일을 임시로 빼고(`pendingW2`), W2에서 지웁니다. | W2 파일에 같은 문장 사본이 남아 있으면 W1 수락 시점에 배타성이 새 실패가 됩니다. 최종 상태는 spec §3.3과 같습니다. |
| PJ11 | `<a id>` 줄은 run 경계로 보고, 그 뒤 run의 `<id>`로 씁니다. 공용 문서의 run은 원래 문서 순서를 지킵니다. | §4.2의 "anchor는 옮기지 않는다"를 지키면서 `effectiveSection`이 하위 heading을 올바로 모으게 합니다. |
| PJ12 | 대응표·ledger·T0 결과는 bridge 역할이 보고 본문으로 반환하고, Orchestrator가 workflow 디렉터리에 저장합니다. | bridge는 `.git` 아래에 쓸 수 없습니다. J14·J24에 따라 커밋하지 않습니다. |
| PJ13 | `agent-fragments.test.mjs:19`의 test 이름은 내용이 구조 검사로 바뀌어도 유지합니다. | §3.2 "test 이름은 바꾸지 않는다"를 따릅니다. |
| PJ15 | (v3, 사용자 선택 2026-11-26) no change 테스트가 이미 고정한 규칙 문장은 RP로 만들지 않고, 정비 대상 쪽 사본을 중복으로 삭제합니다(§1.3). | W1에서 PH-1 발생(`global-config.test.mjs:10`). 보호는 그대로 남고, 배타성 검사와 §2 no change를 함께 지킵니다. |
| PJ16 | (v4, 사용자 선택 2026-11-26 "보호 test만 검사 예외") J32 보호 test 본문의 RP text 사본은 RP-ID별 예외로 배타성 검사에서 뺍니다(§1.3, spec J46). | W2 PH-1: RP-284와 `test_harness_contract.py:643` 충돌. 그 test는 :634에서 먼저 실패해 사본은 실제 확인을 하지 않으므로 RP 유지가 보호를 지킵니다. |
| PJ17 | (v5) 대소문자를 접어 비교하던 literal은 base 원문 대소문자로 RP를 만듭니다(§1.3). | spec §3.3이 `text`를 "base 문서에 있는 그대로, 대소문자 구분"으로 정합니다. PJ4의 "literal 그대로"보다 spec이 우선합니다. 보호 범위는 같습니다. |
| PJ18 | (v6) W2 hold 34행의 처리 규칙 (가)–(마)(§1.3). | 범위를 넓게 고정하지 않으면서 각 규칙 조각의 보호를 유지합니다(J31). 대리 승인은 사용자 위임(2026-11-27)에 따릅니다. |
| PJ19 | (v7) 배타성 검사에 Python 인접 문자열 literal 합치기 형태를 추가합니다(PJ7). | W2 Tester가 `test_harness_contract.py:666`에서 RP-283 사본을 찾았는데 현재 검사는 놓쳤습니다. 검사를 강화하는 방향입니다. |
| PJ20 | (v7) 1회·위치 고정은 구조 assertion으로 남깁니다(§1.3). | W2 Tester가 1회·인접 검사를 중복 삭제한 행(M-W2-1373 등)을 찾았습니다. RP 존재 검사로는 그 보호가 남지 않습니다(J31). |
| PJ21 | (v8, 사용자 선택 2026-11-27 "해시 값만 change로 추가") W3–W15는 `tests/node/plan.test.mjs`의 `renderingBaseline` 값 8개를 갱신합니다(Global Constraints, spec J48). | W3 CS-X에서 렌더링 해시 8건 불일치. 렌더링 출력이 바뀌는 모든 task에서 같은 일이 생깁니다. |
| PJ14 | 재작성된 링크를 포함한 RP는 D-7에서 링크 재작성 ledger 행으로 갱신합니다. | §7은 "규칙 문장 변경"을 치환 대상으로 봅니다. 링크 재작성도 ledger 종류에 들어 있습니다(§8). |

## 4. Plan-level hold(PH)

| ID | 조건 | 처리 |
|---|---|---|
| PH-1 | 배타성 검사가 change 범위 밖 파일(no change 테스트나 fixture, 예: `bridge-args-golden.json`)에서 RP text를 찾았다. (v4) J32 보호 test 본문 사본은 PJ16으로 처리하고 hold하지 않습니다. | 해당 task를 hold하고 파일·RP-ID를 보고합니다. Orchestrator가 plan/spec 개정을 판단합니다. |
| PH-2 | 대응표나 ledger를 보고 본문에 다 담을 수 없다. | 수락을 hold합니다. Orchestrator가 보관 방법을 정합니다. |
| PH-3 | D-0(v2) 토큰이 이동 대상 run에 속한다. | 그 문서 task를 hold합니다. Orchestrator가 plan 개정을 판단합니다. |

## 5. 개정 이력

| 버전 | 내용 | 승인 |
|---|---|---|
| v0 | 첫 초안(Planner) | spec v1과 함께 한 번에 승인받을 때까지 대기(대체됨) |
| v1 | Orchestrator 검토: 최종 Tester 5단계의 무효 grep 패턴(`contracts\[\]\.text`)을 `node -e` 키 검사로 교체. 머리말 plan 버전 표기를 v1로 갱신 | 2026-11-26 사용자 "승인"(spec v1과 함께), 커밋 bea8cc3e |
| v2 | Orchestrator 개정(T0 결과): T0 결과 위치와 재배치(단계 5·6·7·8·11), stale 판정(§1.3), W1 Step 4·W2 Step 1 inventory, D-0 신설(W3–W15), TD-6·최종 Tester 링크 base 비교, 기준선 실패 (a)/(b) 구분, spec v2 인용 | 2026-11-26 사용자 "승인"(spec v2와 함께) |
| v3 | PJ15 추가와 §1.3 규칙 1줄(W1 PH-1, `global-config.test.mjs:10`) | 2026-11-26 사용자 선택 "기존 고정에 맡기고 중복 삭제" |
| v4 | PJ16 추가, §1.3 규칙 1줄, W2 Step 5·TW-8·PH-1 보완, spec v3 인용(W2 PH-1, RP-284) | 2026-11-26 사용자 선택 "보호 test만 검사 예외" |
| v5 | PJ17 추가와 §1.3 규칙 1줄(W2 M-W2-1224·1527, 소문자 접기 literal) | 2026-11-27 Orchestrator 대리 승인(사용자 위임 2026-11-27) |
| v6 | PJ18 추가와 §1.3 규칙, spec v4 인용(W2 hold 34행) | 2026-11-27 Orchestrator 대리 승인(사용자 위임 2026-11-27) |
| v7 | PJ19·PJ20 추가와 §1.3 규칙(W2 Tester 결과) | 2026-11-27 Orchestrator 대리 승인(사용자 위임 2026-11-27) |
| v8 | PJ21 추가, Global Constraints에 `plan.test.mjs` 해시 갱신 규칙과 TD-10, W3–W15 allowedPaths에 `tests/node/plan.test.mjs` 추가, spec v5 인용 | 2026-11-27 사용자 선택 "해시 값만 change로 추가" |
