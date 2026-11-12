# 하네스 지침 문서 의미 보존 리팩토링 설계

- 날짜: 2026-11-13
- 경로: Architectural (spec과 plan 모두 필요). 위험: significant. 작업마다 fresh QA를 두고, 모든 작업을 수락한 뒤 최종 Reviewer가 한 번 검토한다.
- 기준: `/Users/yunho/Desktop/project/arc`, base `master` HEAD `e0bac40357749d246dcfaa579343a041d1c7afd5`
- 실행 대상(사용자 선택): 같은 checkout의 브랜치 `refactor/harness-doc-refactor`, base `e0bac40`
- 이어질 plan: `docs/superpowers/plans/2026-11-13-harness-doc-refactor.md`

## 0. 요구사항과 결정

### 0.1 요구사항 원문

- R0 저장소의 ARC 하네스 지침 문서를 리팩토링한다. `superpowers`에 해당하는 스킬과 그 문서는 수정 대상에서 제외한다.
- R1 수정 대상과 제외 대상 문서를 식별하고, 불분명한 문서는 수정하지 말고 최종 보고에 적는다.
- R2 의무, 권고, 예외, 적용 범위, 우선순위를 바꾸지 않는다. 규칙을 추가하거나 삭제하지 않는다.
- R3 반복 내용은 의미와 적용 범위가 실제로 같을 때만 공통 문서나 참조 링크로 통합한다. 저장소의 문서 형식과 링크 관례를 따르고, 통합하면 찾기 어려워지는 경우는 원래 위치에 남긴다.
- R4 누가, 언제, 무엇을 해야 하는지 명확하게 쓴다. 모호한 표현은 의도를 확인할 수 있을 때만 구체화한다.
- R5 의무나 권고를 나타내는 조동사는 MUST/MUST NOT/SHOULD/SHOULD NOT/MAY로 대문자 표기한다. 인용이나 설명에 쓰인 단어는 바꾸지 않는다.
- R6 명령어, 경로, 식별자, 코드, 예시는 의미를 확인하지 않고 바꾸지 않는다.
- R7 의미를 명확하게 하는 데 필요한 범위만 수정한다.
- R8 수정 전후를 비교해서 의무 강도, 적용 대상, 조건, 예외, 우선순위, 통합한 내용의 참조, 링크 정확성을 검토한다.

### 0.2 사용자 결정(2026-11-13)

| ID | 결정 |
|---|---|
| D1 | 규범 modal은 MUST/SHOULD/MAY(및 NOT 결합형)로 대문자화한다. 기존 `MUST not`은 `MUST NOT`으로 바꾼다. 규범 금지어는 단어를 바꾸지 않고 대소문자만 바꾼다: `Never`→`NEVER`, `Do not`/`Don't`→`DO NOT`. Always, Only 등 다른 명령형과 설명·서술에 쓰인 never는 바꾸지 않는다. |
| D2 | 생성 원천을 범위에 포함하되 문구 필드만 편집한다. 관리 블록, 런타임 복제본, MANIFEST는 재생성으로만 갱신한다. |
| D3 | SHA·바이트·줄 수·bootstrap fixture 갱신을 허용한다. 문자열 기대값은 승인된 변경 문장에 한해 이전→이후를 짝지어 갱신한다. assertion 삭제, 정규식 완화, 대소문자 무시 추가는 금지한다. |
| D4 | Claude/Codex 차이를 보존한다. 공통 문장은 양쪽에 같은 편집을 한 작업 안에서 함께 적용한다. |
| D5 | `docs/harness-operation.md`는 수정하지 않고 불분명 목록으로 보고한다. |
| D6 | R4 구체화는 저장소 내 근거(path:line)를 인용할 수 있을 때만 한다. 나머지는 후보 목록으로 보고한다. |
| D7 | 기준선에서 이미 실패하는 고정 테스트의 기대값이 승인 표기와 어긋나면 승인 표기에 맞게 갱신한다. |
| D8 | 문장 중간 금지어는 §4.1-4 규칙(행위 주체 → 대상, 무생물 주어 + 효과 동사 → 비대상, 판정 불가 → hold)으로 판정한다. |
| D9 | `tests/installer-parity.json`의 기록된 expression도 D3와 같은 규칙으로 짝지어 갱신할 수 있다. |
| D10 | §4.2의 신규 hold 3건을 hold로 확정한다. |

## 1. 의도

ARC 하네스 지침 문서의 규범 표현을 대문자 표기(MUST/MUST NOT/SHOULD/SHOULD NOT/MAY)와 승인된 금지어 대문자 표기(NEVER, DO NOT)로 맞춘다. 저장소 근거로 의도를 확인할 수 있는 모호한 표현만 구체화한다. 의무 강도, 주체, 조건, 예외, 적용 범위, 우선순위는 바꾸지 않는다. 규칙은 추가하거나 삭제하지 않는다. 생성 원천은 문구만 고치고, 산출물은 재생성으로만 갱신한다.

## 2. 비목표

- 규칙 추가·삭제·강도 변경, 동작·코드·스키마 변경, 새 테스트 추가
- 반복 문구 통합(통합 0건, §6)
- Superpowers 유래 파일 수정(§3.4)
- 승인 범위 밖의 문체 개선. 간결화나 재배열처럼 R4·R5에 해당하지 않는 수정
- 저장소 근거로 의도를 확인할 수 없는 R4 구체화(후보로 보고만 한다)
- `docs/superpowers/**` 과거 설계·계획 문서와 `docs/harness-operation.md` 수정
- 테스트 매칭 방식 변경: assertion 삭제, 정규식 완화, 대소문자 무시 플래그 추가 또는 제거

## 3. 대상 분류

### 3.1 수정 대상(직접 편집, 관리 구간 제외)

- `claude/skill/SKILL.md`, `codex/skill/SKILL.md`
- 양 플랫폼 `skill/references/{commit,coordination,git-recovery,handoff,handoff-prep,limits,planning,verification,arc-visual-companion}.md`
- Codex 전용 `codex/skill/references/handoff-worktree.md`
- `claude/agents/*.md`, `codex/agents/*.toml` 중 marker와 관리 블록 바깥의 산문 본문(있는 경우). T2에 배정한다.

관리 구간. 아래 구간 안의 바이트는 직접 편집하지 않는다.

- `[ARC role policy: contract begin]` … `[ARC role policy: contract end]` 블록. 그 안의 `Generated from lib/policy/role-policy.json; do not edit this managed section manually.` 헤더 줄도 포함한다.
- `{{ARC_OUTPUT_LANGUAGE_POLICY}}`와 `{{ARC_AGENT_FRAGMENT:*}}` marker 줄(`claude/agents/arc-planner.md:14-40`, `codex/agents/arc-planner.toml:4-36` 형식)
- YAML frontmatter와 TOML의 `developer_instructions` 이외 키 값(name, description, model 등). 여기에 대상 단어가 있으면 hold로 보고한다.
- 제목(`#` 줄)과 `<a id="…">` anchor. 대상 단어가 있으면 hold로 보고한다(링크 anchor 보존, R6).

### 3.2 생성 원천(문구만, D2)

- `lib/policy/role-policy.json`: `rules[].text`, `platforms.*.notice`
- `lib/prompts/agent-fragments.json`: `fragments[].text`. 각 조각의 `id`, 조각 개수 26, 역할별 조각 개수 `[8,14,10,12,11,5,12,8,10,9]`는 유지한다.
- `lib/installer/global-config.mjs`: `agentsBlockBody()`(42–43행)의 문장 리터럴만. 연결 연산자, 조건식, `languagePolicy()` 호출, 변수는 유지한다.

### 3.3 산출물(재생성만, 직접 편집 금지)

- 24개 target 관리 블록(`lib/policy/render.mjs`의 `POLICY_TARGETS`)
- `claude/skill/runtime/role-policy.json`, `codex/skill/runtime/role-policy.json`
- `MANIFEST.sha256`

### 3.4 제외(편집 금지)

- 양 플랫폼 `brainstorming.md`, `writing-plans.md`, `test-driven-development.md`, `writing-good-tests.md`, `visual-companion.md`, `builder-check-prompt.md`, `superpowers-LICENSE`, `superpowers-provenance.json`, `references/scripts/*`
- `docs/superpowers/**` 기존 파일. 이번 spec과 plan 파일 추가는 Orchestrator 문서 작업이며 구현 대상이 아니다.
- `lib/installer/language.mjs`, `lib/policy/render.mjs`(헤더 리터럴 포함), `lib/prompts/render.mjs`, 그 밖의 코드·설정, `vendor/`, `*/skill/runtime/*.mjs` 등 runtime 코드 문자열, `*/skill/scripts/*`

### 3.5 불분명(수정하지 않고 보고)

- `docs/harness-operation.md`(D5. 4행에서 설명 문서로 자기 규정)
- `references/scripts/*`: 현재 바이트가 upstream과 같은지 대조하지 않았다.
- 작업 중 새로 발견한 분류 불명 파일. 편집하지 않고 최종 보고의 불분명 목록에 넣는다.

## 4. 대문자화 판정 규칙(R5, D1, D8)

### 4.1 판정 단위와 순서

판정 단위는 §3.1과 §3.2 범위의 한 단어 발생이다. 아래 순서로 판정하고, 먼저 해당하는 단계에서 결정한다.

1. **위치 제외**: backtick 코드 span, 코드 블록, 경로·식별자·명령 내부, 따옴표나 인용 표시가 붙은 인용문, `Example:`/예시 단락, 관리 구간(§3.1), 코드 파일의 비리터럴 부분에 있으면 비대상이다.
2. **기존 hold 목록**: §4.4에 있으면 hold한다.
3. **modal(must/should/may와 not 결합형)**:
   - 행위 주체나 대상에게 의무·금지·권고·허가를 부과하면 **대상**이다. 수동태 허가와 무생물 주어에 대한 요건도 포함한다. 예: "X may be amended", "choice must be explicit".
   - 가능성·추측·사실 서술이면 **비대상**이다. 예: "may appear", "may need", "may reach", "may change".
   - 같은 문장을 허가로도 가능성으로도 읽을 수 있으면 **hold**한다.
4. **금지어(Never/never, Do not/do not, Don't/don't)**:
   - 명령문(문장·절 첫머리나 세미콜론 뒤 명령형)이면 **대상**이다.
   - 명시적 행위 주체(역할명, `Depth 2`, `ARC subagents`, 2인칭) + never/do not + 행위 동사이면 **대상**이다.
   - 무생물·개념 주어(runs, reports, silence, approvals, readiness, skipping, drafts 등) + never/do not + 효과 동사(turn, count, select, waive, replace, transfer, invalidate, expand 등)이면 **비대상**(사실·효과 서술)이다.
   - 주어가 생략된 분사구("never reused …")처럼 위 규칙으로 정할 수 없으면 **hold**한다.
5. **변환 형태**: `must`→`MUST`, `must not`→`MUST NOT`, `MUST not`→`MUST NOT`, `should`→`SHOULD`, `should not`→`SHOULD NOT`, `may`→`MAY`, `Never`/`never`→`NEVER`, `Do not`/`do not`/`Don't`/`don't`→`DO NOT`. 대소문자 외의 단어는 바꾸지 않는다. 예외로 `Don't`→`DO NOT`은 승인된 철자 변경이다. 금지어를 MUST NOT으로 바꾸지 않는다. `may not`이 나오면 hold한다(허가 부정과 금지의 구별이 필요하다).
6. **대상 아님(명시)**: Always, Only, Ensure 등 다른 명령형, `cannot`, `can`, `need`, `required`, `no`.

### 4.2 판정 예시(저장소 실제 문장, HEAD `e0bac40` 기준 줄 번호)

| 범주 | 위치 | 원문 발췌 | 판정 |
|---|---|---|---|
| 대상 modal | `claude/skill/SKILL.md:10` | "the user may choose the current checkout" | 허가 → `MAY` |
| 대상 modal | `claude/skill/references/commit.md:22` | "Only Orchestrator may amend the original planning-document commit" | 허가 → `MAY` |
| 대상 modal | `claude/skill/references/commit.md:24` | "only the original planning-document commit may be amended" | 수동 허가 → `MAY` |
| 대상 modal | `claude/skill/references/planning.md:9` / `codex/skill/references/planning.md:11` | "Orchestrator may choose routine execution/check details" | 허가 → `MAY`(쌍) |
| 대상 modal | `lib/policy/role-policy.json:50`, `:82` | "MUST not self-authorize", "Specialists MUST not change Git state" | → `MUST NOT` |
| 대상 modal | `lib/installer/global-config.mjs:43` | "Orchestrator must not edit implementation, …" | → `MUST NOT` |
| 대상 modal | `lib/prompts/agent-fragments.json:34` | "Target choice must be explicit" | 요건 → `MUST` |
| 대상 금지어 | `claude/skill/SKILL.md:14` | "Never substitute a generic or built-in agent" | 명령문 → `NEVER` |
| 대상 금지어 | `claude/skill/SKILL.md:29`, `:31` | "Never automatically stash, …", "Never automatically retry, …" | → `NEVER` |
| 대상 금지어 | `claude/skill/SKILL.md:40` | "Do not load every reference for every task." | → `DO NOT` |
| 대상 금지어 | `claude/skill/references/handoff.md:23` | "…stops work; do not automatically initialize Git" | 세미콜론 뒤 명령 → `DO NOT` |
| 대상 금지어 | `claude/skill/SKILL.md:12` | "Orchestrator never invokes `brainstorming`/`writing-plans`…" | 주체 + 금지 → `NEVER` |
| 대상 금지어 | `claude/skill/references/handoff.md:91` | "Depth 2 never creates/switches workspace/branches" | 주체 + 금지 → `NEVER` |
| 대상 금지어 | `lib/installer/global-config.mjs:42` | "ARC subagents (depth 2) … do not load `SKILL.md`" | 주체 + 금지 → `DO NOT` |
| 비대상 서술 | `claude/skill/SKILL.md:32` | "Passing runs, reports and dispositions never turn unverified into proven" | 무생물 + 효과 |
| 비대상 서술 | `claude/skill/SKILL.md:10` | "edit requests and silence do not select a target" | 무생물 + 효과 |
| 비대상 서술 | `claude/skill/SKILL.md:12` | "Skipping questions never waives design/approval gates" | 무생물 + 효과 |
| 비대상 서술 | `claude/skill/references/handoff.md:65` | "Readiness supplements, never replaces handoff/target gates" | 무생물 + 효과 |
| 비대상 가능성 | `claude/skill/references/planning.md:34`, `coordination.md:110` | "Raw responses may appear in app/tool surfaces" | 가능성 |
| 비대상 가능성 | `claude/skill/references/verification.md:85` | "observable security/interfaces may need both QA/Reviewer" | 가능성 |
| 비대상 가능성 | `claude/skill/references/coordination.md:142` | "Codex `workspace-write` may reach beyond the worktree" | 사실 서술 |
| 비대상 예시 | `claude/skill/references/planning.md:80` / `codex/skill/references/planning.md:82` | "Example: … B may start while D continues" | 예시 단락 |
| 비대상 코드 | `lib/policy/render.mjs:46` | "do not edit this managed section manually" | 코드 리터럴(제외 파일) |
| 비대상 코드 | `claude/skill/runtime/gate.mjs:27` | 'Only the observed active Orchestrator may request commit' | runtime 코드 문자열 |
| hold(기존) | `claude/skill/references/limits.md:31` / `codex/skill/references/limits.md:31` | "must not exceed `max_concurrent_subagents`" | 시스템 제약 서술인지 의무인지 불명 |
| hold(기존) | `claude/skill/references/coordination.md:75` / `codex/skill/references/coordination.md:75` | "No-findings reports may be brief" | 허가인지 서술인지 불명 |
| hold(기존) | `claude/skill/references/planning.md:18` / `codex/skill/references/planning.md:20` | "a specific request may approve them" | 허가인지 가능성인지 불명 |
| hold(D10) | `claude/skill/SKILL.md:18` | "Each task requiring QA receives fresh QA, never reused from another task" | 주어 없는 분사구 |
| hold(D10) | `claude/skill/references/handoff.md:106` | "A specific existing request may authorize under [planning]…" | planning.md:18 hold와 같은 유형 |
| hold(D10) | `claude/skill/references/verification.md:39` / `codex/skill/references/verification.md:37` | "Metadata counts alone prove no significance; one permission/loss rule may." | 생략 구문 |

Implementer는 작업 중 §4.1 기준으로 hold를 추가할 수 있다. 추가한 hold는 모두 최종 보고에 올린다.

### 4.3 hold 처리

hold한 발생은 바이트를 바꾸지 않는다. 대조표에는 "hold"로 기록하고(사유 포함), 최종 보고 hold 목록에 올린다. 플랫폼 쌍의 한쪽이 hold이면 다른 쪽도 hold한다(D4).

### 4.4 hold 목록(승인)

- 기존: `limits.md:31` must not exceed(양 플랫폼), `coordination.md:75` No-findings reports may be brief(양 플랫폼), `planning.md:18`(Codex `:20`) a specific request may approve them.
- D10: `SKILL.md:18` never reused(양 플랫폼 대응 줄), `handoff.md:106` may authorize(양 플랫폼 대응 줄), `verification.md:39`(Codex `:37`) one permission/loss rule may.

## 5. R4 구체화(D6)

- 저장소 내 근거(path:line)를 인용해 의도를 확정할 수 있을 때만 구체화한다. 근거 문장은 같은 규칙의 다른 위치 정의, 관리 정책 원천 문장, 해당 anchor의 정의 문장이다.
- 구체화는 주체, 시점, 대상을 명시하는 것으로 한정한다. 강도, 조건, 예외, 범위는 바꾸지 않는다. 대조표 분류는 "R4 구체화"로 하고 근거 열은 필수다.
- 근거가 없거나 근거끼리 충돌하면 수정하지 않는다. 최종 보고 R4 후보 목록에 path:line, 모호한 부분, 근거 부재·충돌 사유를 적는다.
- 공통 문장의 R4 구체화는 양 플랫폼에 같이 적용한다(D4). 한쪽에만 근거가 있으면 후보로 보고한다.

## 6. 통합(R3)

통합 0건이다. 후보 6건은 원래 위치에 둔다.

1. SKILL Shared terms와 fragment `common.preservation-choice-inspection`: 내용과 대상이 다르다.
2. 언어·역할 정책: 이미 단일 원천에서 렌더된다.
3. `git-recovery.md:8` 재진술: 복구 사례를 덧붙였고 트리거가 다르다.
4. `claude.incident-prefix`/`codex.incident-prefix`: 플랫폼별 표현이 다르다.
5. "Raw responses may appear" 반복: 서로 다른 before-action gate에서 읽힌다.
6. SKILL Common handoff gate 이중 기재: anchor를 유지한다.

링크 추가·삭제·대상 변경은 0이다. 제목과 `<a id>` anchor 변경도 0이다.

## 7. 생성 원천 → 재생성 절차(D2)

각 작업 안에서 아래 순서를 지킨다.

1. 원천 문구 편집(§3.2). 비문구 필드와 코드 구조는 건드리지 않는다.
2. 관리 블록 재생성: `npm run update:role-policy`(T1). 이후 `npm run check:role-policy`가 통과해야 한다.
3. 런타임 복제본 동기화: `node scripts/update-runtime-assets.mjs`를 실행하고 `node scripts/update-runtime-assets.mjs --check`로 확인한다. 이 스크립트가 runtime `role-policy.json`을 갱신하지 않으면 그 사실과 실제 갱신 경로를 T1 보고에 기록하고, 해당 단계 이후 작업을 hold한다.
4. fixture 갱신(§8).
5. `node scripts/update-manifest.mjs`로 `MANIFEST.sha256`을 재생성하고 `npm run check:manifest`로 확인한다.

**직접 편집 금지 확인**: 관리 블록, runtime `role-policy.json`, `MANIFEST.sha256`의 diff는 재생성 명령의 결과와 같아야 한다. QA는 `--check`류 명령의 종료 코드 0으로 확인한다.

**비문구 diff 0 확인 방법(QA)**:

- JSON 원천: 이전·이후 파일을 파싱하고 대상 문구 필드(`rules[].text`, `platforms.*.notice`, `fragments[].text`)를 같은 placeholder로 바꾼 뒤 깊은 비교로 동일한지 본다. 키 순서는 원문 키 배열을 비교해 확인한다.
- `global-config.mjs`: diff hunk가 42–43행 문자열 리터럴 내부에만 있는지 본다. 따옴표 경계, `+` 연결, 삼항식 개수가 같아야 한다.
- 대소문자 접기 비교: 대문자화만 적용한 줄은 이전·이후를 소문자로 바꿨을 때 같아야 한다(`Don't`→`DO NOT`은 `don't`↔`do not` 치환 하나만 허용). 접기 비교에서 차이가 남는 줄은 대조표의 R4 행과 1:1로 대응해야 한다.
- backtick span, 제목 줄, `<a id` 줄, marker 줄의 diff는 0이다.

## 8. 고정 테스트 영향 처리(D3, D7, D9)

### 8.1 규칙

- 갱신 허용: SHA(`protected`, `agentProfileBaseline`), 바이트·줄 수(`platforms.*.skill`, `platforms.*.global`), `bootstrap` 2개, `contracts[].text` 등 문자열 기대값, `tests/installer-parity.json`의 기록된 expression(D9). 문자열 기대값은 승인된 변경 문장(대조표 행)에 대응할 때만 고친다.
- 금지: assertion 삭제, 정규식 완화(`.*` 확대, 앵커 제거 등), `i`/`re.I` 추가, `.lower()` 추가, 기존 `/i`·`.lower()` 제거, 테스트 이름이나 구조 변경.
- 기존 대소문자 무시 assertion은 바꾸지 않는다. 예: `tests/node/role-policy.test.mjs:272,283`(`/i`), `tests/test_arc_policy.py`의 `.lower()` 비교와 소문자 `SHARED_TERMS`(1309–1321), `tests/test_harness_contract.py`의 `.lower()` 경로(209, 233, 241, 332 등).
- 부재(absence) assertion(`assertNotIn`, `doesNotMatch`, `!includes`)은 고치지 않는다. 승인된 변경 때문에 부재 assertion이 실패하면 그 변경을 hold하고 보고한다.
- D7: 확정 사례는 `tests/test_harness_contract.py:696` `r"Specialists report evidence.*must not self-authorize release"` → `MUST NOT`이다. 원천 `role-policy.json:50`의 `MUST not`→`MUST NOT`과 짝을 이룬다. 다른 D7 후보는 T0 기준선에서 정한다.

### 8.2 영향받는 대소문자 구분 assertion 범주(정적 확인 대표 위치)

| 범주 | 대표 위치 | 영향 |
|---|---|---|
| A. SKILL 게이트 정확 문구 `includes` | `tests/node/composite-instructions.test.mjs:20`(Role routing gate의 "Never substitute"), `:29`(Pre-action gate record) | 문장 안의 금지어·modal을 바꾸면 짝지어 갱신 |
| B. coordination 정확 문구 | `tests/node/composite-instructions.test.mjs:46` "Never invoke `arc-<role>`…" | 같음 |
| C. instruction-contracts fixture 계약 본문 | `tests/node/fixtures/instruction-contracts.json` `contracts[].text`(예: 19, 26, 33행), `opening`(14) | 대상 문장을 바꾸면 fixture 문자열을 짝지어 갱신 |
| D. bootstrap fixture와 테스트 | `instruction-contracts.json:13`, `:125`, `tests/node/global-config.test.mjs:10` | T4에서 짝지어 갱신 |
| E. Python 원문(비소문자) 비교 | `tests/test_harness_contract.py:696`, `tests/test_arc_policy.py:609,652`(`raw_policy_text`), `tests/test_claude_payload.py:443`(`assert_all`은 공백만 정규화), 예: `:480`, `:594` | 원천 문장을 바꾸면 짝지어 갱신 |
| F. SHA·바이트·줄 수 | `instruction-contracts.json` `protected`(243행~), `agentProfileBaseline`(310행~), `tests/node/agent-fragments.test.mjs` 렌더 SHA | 재계산 값으로 갱신 |
| G. installer-parity 기록 | `tests/installer-parity.json`(예: 11482행 "do not load `SKILL.md`") | D9에 따라 짝지어 갱신, `node scripts/check-installer-parity.mjs`로 확인 |
| H. 영향 없음(유지) | `role-policy.test.mjs:272,283`(`/i`), `.lower()` 기반 Python 비교 | 변경 금지 |

### 8.3 전수 조사(P0, plan 작성 전, 읽기 전용)

plan 작성 전에 아래 산출물을 확보한다.

- 범위: `tests/**/*.{mjs,py,json}` 중 §3.1·§3.2 파일 또는 그 렌더 결과를 읽는 assertion과 fixture
- 산출물 표: `테스트 path:line | 매칭 방식(includes/assertIn/assertRegex/equal/fixture) | 대소문자 처리(구분/lower/i) | 포함된 대상 단어 | 원문 출처 path:line | 예상 작업(T1–T4)`
- `scripts/check-installer-parity.mjs`가 `tests/installer-parity.json`의 `expression`을 현재 테스트 소스와 문자열로 대조하는지 확인한다.
- agent 템플릿 marker 바깥 본문에 대상 단어가 있는지 확인한다.
- 보고용: `references/scripts/*`가 provenance SHA와 일치하는지 확인한다.

### 8.4 테스트 갱신 기록 형식

작업마다 다음 표를 남긴다.

`ID | 테스트 path:line | 종류(문자열/SHA/바이트/줄 수/bootstrap/parity/D7) | 이전 기대값 | 이후 기대값 | 대응 대조표 행 ID | 매칭 방식·플래그 불변(예/아니오)`

SHA·바이트·줄 수 행은 재계산 명령과 대상 파일을 함께 적는다.

## 9. 플랫폼 쌍 처리(D4)

- 양 플랫폼에서 같은 문장(공통 문장)은 같은 편집을 같은 작업 안에서 함께 적용한다. 한쪽만 바꾸지 않는다.
- 플랫폼 고유 문장(예: Codex `handoff-worktree.md`, `git-recovery.md` worktree 내용, `limits.md` Codex 설정 항목, `platform.claude`/`platform.codex` notice)은 그 파일에서만 판정한다. 대조표 "플랫폼 쌍" 열은 "고유"로 적는다.
- Claude/Codex의 차이는 보존한다. 표현을 맞추기 위한 편집은 하지 않는다.
- **parity 검증(QA)**: 각 쌍 파일(SKILL.md, references 9종)에서 플랫폼 간 diff를 변경 전과 후로 비교한다. 변경 후 플랫폼 간 diff는 변경 전 diff와 같아야 한다. 단, 플랫폼 고유 줄에 적용한 대조표 행 때문에 생긴 차이는 행 ID로 설명돼야 한다. `tests/node/composite-instructions.test.mjs`의 플랫폼 정규화 section parity도 통과해야 한다.

## 10. 작업 분할

공유 fixture(`instruction-contracts.json`)와 `MANIFEST.sha256` 때문에 작업을 순차로 진행한다. 순서는 T1 → T2 → T3 → T4이다. 각 작업은 집중 커밋 1개다(T0 제외). 작업마다 Implementer 보고, fresh QA, Orchestrator 수락, 커밋 순서로 진행한다.

- **P0(plan 이전, Scouter 읽기 전용)**: §8.3 전수 조사
- **T0(QA, 커밋 없음)**: 기준선. `npm test`(`node --test tests/node/*.test.mjs`), Python 테스트 3종(`tests/test_arc_policy.py`, `tests/test_harness_contract.py`, `tests/test_claude_payload.py`, 정확한 실행 형태는 plan에서 정함), `npm run check:role-policy`, `npm run check:manifest`, `node scripts/update-runtime-assets.mjs --check`, `node scripts/check-installer-parity.mjs`를 실행한다. 산출물은 `검사 | 종료 코드 | 실패 테스트 ID | 실패 메시지 요지 | 분류(baseline/D7 후보/불명)` 표다. 사용자가 제공한 "node 테스트 실패 69개"의 재현 여부를 기록한다.
- **T1**: role-policy 원천 문구 → `npm run update:role-policy` → runtime 동기화 → fixture(`protected`, `agentProfileBaseline` SHA, 문자열 기대값, D7 `test_harness_contract.py:696`) → MANIFEST. 선행: T0.
- **T2**: agent-fragments 문구(ID, 개수 26, 역할별 개수 유지)와 agent 템플릿 marker 바깥 본문(있는 경우) → `agentProfileBaseline`·렌더 SHA → MANIFEST. 선행: T1.
- **T3**: 양 플랫폼 SKILL.md와 references 비관리 구간(공통 문장 동시 편집, 근거 있는 R4) → 문자열 기대값·바이트·줄 수 → MANIFEST. 선행: T2.
- **T4**: `global-config.mjs` bootstrap 문구 → fixture `bootstrap` 2개, `global` 바이트·줄 수, `global-config.test.mjs` 문자열 기대값 → MANIFEST. 선행: T3.
- **최종**: 모든 작업 수락 후 Reviewer 1회. 대상은 `e0bac40..HEAD` 전체 diff이며 R8 관점(§12 AC-15)으로 본다. 지적은 Implementer 수정 후 Reviewer 재확인으로 처리한다.

작업별 필수 검사(QA): T0의 전체 검사를 다시 실행해 기준선 대비 새 실패가 0이어야 한다. 여기에 §7의 비문구 diff 0과 대소문자 접기 비교, §9 parity, §8.1 테스트 변경 규칙 준수(테스트 diff가 기대값·SHA·숫자 리터럴에만 있는지)를 확인한다.

## 11. 기록과 보고 형식

### 11.1 변경 대조표(작업마다)

`ID | 파일:줄 | 이전 | 이후 | 분류(허가/의무/금지/권고/금지어 대문자화/R4 구체화/hold) | 주체·조건·예외·우선순위 불변(확인 문장) | 근거(§4.1 단계 또는 R4 근거 path:line) | 플랫폼 쌍(일치: 상대 파일:줄 / 고유 / hold 동반)`

원천 문구 행은 산출물 반영 위치(관리 블록 target 수)를 비고에 적는다.

### 11.2 최종 보고(Orchestrator 취합)

1. 수정 목록: 파일, 대조표 행 수, 작업 ID, 커밋 SHA
2. 제외 목록: 파일 또는 패턴과 사유(§3.4)
3. 불분명 목록: §3.5와 작업 중 추가분, 각 항목의 미확인 사실
4. hold 목록: path:line, 원문 발췌, 사유, 플랫폼 쌍
5. R4 후보 목록: path:line, 모호한 부분, 근거 부재 또는 충돌 사유
6. baseline 실패: T0 표와 최종 상태(해소: D7 / 유지: baseline / 신규: 없음이어야 함)
7. 범위 밖 관찰: 코드 리터럴 안의 소문자 규범 표현(예: `lib/policy/render.mjs:46`)
8. 테스트 갱신 기록 요약(§8.4)

## 12. 수용 기준

| ID | 요구 | 기준 | 검증 |
|---|---|---|---|
| AC-1 | R0 | §3.4·§3.5 파일의 diff가 0이다 | `git diff --name-only e0bac40..HEAD`를 §3.1–§3.3, 테스트, fixture 허용 목록과 대조 |
| AC-2 | R1 | 수정·제외·불분명 목록이 최종 보고에 있다 | §11.2 1–3 확인 |
| AC-3 | R2 | 모든 대조표 행에 강도·주체·조건·예외·우선순위 불변 확인이 있고, 규칙 수가 같다 | 대소문자 접기 비교 차이가 R4 행과만 대응(§7). Reviewer 표본 검토 |
| AC-4 | R5 대상 | 변경 후 범위 내 소문자 must/should/may, Never/never, Do not/do not/Don't/don't, `MUST not`이 남아 있으면 모두 비대상 또는 hold 기록과 대응한다 | 잔존 스캔 결과를 대조표 비대상·hold 기록과 대조 |
| AC-5 | R5 비대상 | 비대상(서술·가능성·인용·예시·코드) 발생은 바뀌지 않는다 | §4.2 비대상 예시 위치 diff 0 + 대조표에 비대상 행 변경 없음 |
| AC-6 | R6 | backtick span, 코드, 경로, 식별자, 명령, 제목, anchor, marker diff가 0이다 | §7 확인 방법 |
| AC-7 | R3 | 통합 0건. 링크 추가·삭제·대상 변경 0 | 링크(`](`) 줄의 링크 대상 부분 diff 0 |
| AC-8 | R4·D6 | R4 행마다 근거 path:line이 있다. 근거 없는 건은 후보 목록에만 있다 | 대조표·보고 대조 |
| AC-9 | R7 | 대조표에 없는 문구 변경이 0이다 | diff 줄과 대조표 행 1:1 |
| AC-10 | D2 | 원천 비문구 필드 diff 0, fragments ID·26개·역할별 개수 불변, `global-config.mjs` 리터럴 외 diff 0 | §7 JSON placeholder 비교, `agent-fragments.test.mjs` |
| AC-11 | D2 | 산출물은 재생성 결과와 같다 | `npm run check:role-policy`, `node scripts/update-runtime-assets.mjs --check`, `npm run check:manifest` 종료 코드 0 |
| AC-12 | D3·D9 | 테스트 갱신이 모두 §8.4 기록과 짝지어지고, 금지 변경이 0이다 | 테스트 diff 검토, `node scripts/check-installer-parity.mjs` |
| AC-13 | D7 | 기준선 대비 새 실패 0. D7 대상(`test_harness_contract.py:696` 포함)은 통과한다 | T0 표와 최종 실행 비교 |
| AC-14 | D4 | 공통 문장 편집이 쌍으로 적용되고 플랫폼 간 차이가 보존된다 | §9 parity 비교, composite parity 테스트 |
| AC-15 | R8 | 강도·대상·조건·예외·우선순위·참조·링크 정확성 검토가 기록된다 | 작업별 대조표 + 최종 Reviewer 보고 |
| AC-16 | R1·D5·D6 | 최종 보고가 §11.2 형식을 충족한다 | Orchestrator 확인 |

요구-기준 대응: R0→AC-1, R1→AC-2·16, R2→AC-3, R3→AC-7, R4→AC-8, R5→AC-4·5, R6→AC-6, R7→AC-9, R8→AC-15(보조 AC-14·11).

## 13. 위험과 보류 조건

- 원천 한 문장이 최대 24개 target에 퍼지므로 오판의 영향이 크다. T1 대조표에 반영 target 수를 기록한다.
- 금지어 대문자화는 많은 고정 문자열에 영향을 준다(§8.2). P0 목록이 없으면 plan을 작성하지 않는다.
- 보류 조건: 생성 명령 실패나 `--check` 불일치, 비문구 diff 발생, 부재 assertion 실패, 기준선에 없던 실패, 플랫폼 쌍 불일치. 해당하는 작업만 멈추고 Orchestrator에 보고한다.
