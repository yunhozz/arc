# 하네스 지침 문서 의미 보존 리팩토링 2차 설계(차이분)

- 날짜: 2026-11-20
- 경로: **Bounded**(OD-9), 위험: **significant**. 작업마다 fresh QA를 두고, 모든 작업이 수락된 뒤 최종 Reviewer가 한 번 검토한다.
- 기준: `/Users/yunho/Desktop/project/arc`, `master` HEAD `12aa9a3bbf9dc30243d69cb85a10b685d1162328`, clean
- 범위: `96858f3..12aa9a3` 변경분(OD-2 (a): 변경 파일 전체를 스캔하고 1차 판정은 상속)
- 실행 대상(사용자 선택, OD-10): 관리 워크트리 `.claude/worktrees/harness-doc-refactor-2`, 브랜치 `refactor/harness-doc-refactor-2`, base `12aa9a3`
- 정본 규칙: 1차 spec `docs/superpowers/specs/2026-11-13-harness-doc-refactor-design.md`(이하 "1차"). 이 문서는 1차와 **달라지는 점만** 정본으로 적는다. 여기에 적지 않은 규칙은 1차를 그대로 따른다.
- 이어질 plan: Bounded 밀도(작업별 ID, 범위, 선행, 기준, 검사)

## 0. 요구사항과 결정 (SP-1)

### 0.1 요구사항(2026-11-20, 사용자 원문 요지)

- R0 superpowers 스킬과 그 문서는 제외한다. 대상 여부가 불분명한 문서는 임의로 수정하지 않고 최종 보고에 적는다.
- R2 지침의 의무·권고·예외·적용 범위·우선순위를 바꾸지 않는다. 새 행동 규칙을 추가하거나 기존 규칙을 삭제하지 않는다.
- R3 의미와 적용 범위가 실제로 같을 때만 공통 문서나 참조 링크로 통합한다. 통합 때문에 규칙을 찾거나 적용하기 어려워지면 원래 위치에 남긴다.
- R4 누가·언제·무엇을 하는지 명확하게 쓴다. 모호한 표현은 원래 의도를 확인할 수 있을 때만 구체화한다.
- R5 규범 조동사는 대문자(MUST, MUST NOT, SHOULD, SHOULD NOT, MAY)로 쓴다. 인용·설명에 쓰인 단어는 기계적으로 바꾸지 않는다.
- R6 명령어·경로·식별자·코드·예시는 의미를 확인하지 않고 바꾸지 않는다. R7 과도한 구조 변경을 피한다.
- R8 수정 후 전후를 비교해 의무 강약, 대상·조건·예외·우선순위, 통합 내용의 참조, 링크 정확성을 점검한다.

R 번호는 1차 §0.1과 같은 의미로 쓴다(R1은 R0의 불분명 보고 부분에 해당).

### 0.2 사용자 결정

| ID | 결정 |
|---|---|
| D1–D10 | 1차 §0.2를 그대로 재사용한다. 바꾸지 않는다. |
| 범위 | `96858f3` 이후 변경분. superpowers는 제외한다. |
| OD-1 | 같은 문장이 2–4개 플랫폼에 있으면 하나의 묶음으로 본다. 같은 작업에서 같은 편집을 적용하고, 한 곳이 hold이면 묶음 전체를 hold한다(D4의 4개 플랫폼 해석). |
| OD-2 | 변경 파일 전체를 스캔하고, 기존 줄은 1차 판정을 상속한다. |
| OD-3 | 1차 hold·비대상 문장의 사본(gemini/grok 복제 포함)은 다시 판정하지 않고 자동 상속한다. |
| OD-4 | `README.md`는 불분명으로 두고 수정하지 않는다. |
| OD-5 | `gemini/GEMINI.md`, `gemini/instructions.md`, `grok/AGENTS.md`, `grok/instructions.md`는 불분명으로 둔다. |
| OD-6 | `shared/skill/references/handoff-worktree.md`는 수정 대상이다. 단일 파일이므로 플랫폼 묶음 판정은 적용하지 않는다. |
| OD-7 | `lib/installer/language.mjs`의 Run mode 문구는 제외(1차 §3.4)하고, 범위 밖 관찰로 보고한다. |
| OD-8 | golden SHA 갱신은 D3의 SHA 갱신 허용에 포함한다. 단, T0에서 golden이 이미 실패하면 O8에 따라 `--write`를 hold하고 보고한다. |
| OD-9 | Bounded + significant |
| OD-10 | 관리 워크트리(위 실행 대상) |

## 1. 의도와 비목표

1차 §1·§2와 같다. 이번 범위에서 달라지는 점은 아래와 같다.
- 생성 원천 편집은 0건이다(P0-7: 원천 후보 13건 모두 비대상). 그래서 1차 T1(원천)과 T4(bootstrap)에 해당하는 작업이 없다.
- 통합 0건, R4 구체화 0건(§5, §6).

## 2. 대상 분류 (SP-2)

설계 초안 P-1.1에 P0 결과를 반영했다.

| 분류 | 파일/파일군 | 근거·비고 |
|---|---|---|
| 수정 대상(직접 편집, 관리 구간 제외) | 4개 플랫폼 `skill/SKILL.md` | 1차 §3.1 |
| 수정 대상 | 4개 플랫폼 `skill/references/{commit,coordination,git-recovery,handoff,handoff-prep,planning,verification,worktree-creation}.md`. gemini/grok은 `limits.md`, `arc-visual-companion.md`도 포함 | 1차 §3.1. claude/codex의 `limits.md`·`arc-visual-companion.md`는 범위 기간에 바뀌지 않아 범위 밖 |
| 수정 대상(새 위치) | `shared/skill/references/handoff-worktree.md` | OD-6. 1차 `codex/skill/references/handoff-worktree.md`가 옮겨진 파일(R058) |
| 수정 대상(marker·관리 블록 밖 산문만) | `claude/agents/*.md`, `codex/agents/*.toml`, `gemini/agents/*.md`, `grok/agents/*.md` | 1차 §3.1 |
| 관리 구간(바이트 직접 편집 금지) | 1차 §3.1의 관리 구간 + 새 marker `{{ARC_RUN_MODE_POLICY}}` | `lib/installer/language.mjs:3`, `tests/node/run-mode-contract.test.mjs` |
| 생성 원천(문구만, D2) | `lib/policy/role-policy.json`(`rules[].text`, `platforms.{claude,codex,gemini,grok}.notice`), `lib/prompts/agent-fragments.json`(`fragments[].text`, 26개), `lib/installer/global-config.mjs`의 `agentsBlockBody()` 리터럴 | **이번 범위의 편집 대상 0건**(P0-7). 원천을 편집하지 않는다 |
| 산출물(재생성만) | 관리 블록 target(Orchestrator 계수 20개), `shared/skill/runtime/role-policy.json`, `MANIFEST.sha256`, `tests/node/fixtures/installed-layout-golden.json` | 원천을 편집하지 않으므로 관리 블록과 runtime은 바뀌지 않는다. `MANIFEST`와 golden만 문서 바이트 변경으로 다시 만든다(§7) |
| 제외(superpowers) | `shared/skill/references/{brainstorming,writing-plans,test-driven-development,writing-good-tests,visual-companion,builder-check-prompt}.md`, `superpowers-LICENSE`, `superpowers-provenance.json`, `references/scripts/*` | R0 |
| 제외(기록 문서) | `docs/superpowers/**` 기존 파일 | 1차 §3.4. 이 spec과 plan 추가는 Orchestrator 문서 작업이다 |
| 제외(코드·설정) | `*/skill/models.toml`, `lib/installer/language.mjs`(OD-7), `lib/policy/render.mjs`, `lib/prompts/render.mjs`, `shared/skill/runtime/*.mjs` | 1차 §3.4 |
| 불분명(수정하지 않고 보고) | `docs/harness-operation.md` | D5 |
| 불분명 | `README.md` | OD-4. 1차 §3에 없었다. `tests/node/readme-gate-consistency.test.mjs`가 고정한다 |
| 불분명 | `gemini/GEMINI.md`, `gemini/instructions.md`, `grok/AGENTS.md`, `grok/instructions.md` | OD-5. P0-3: descriptor의 `instructionTemplates`로 manifest에 수집된다(`lib/platforms/gemini.mjs:7`, `lib/platforms/grok.mjs:7`, `lib/installer/manifest.mjs:12,53`). 파일을 처음 생성하는 코드와 `instructions.md` 본문의 소비 경로는 확인하지 못했다 |
| 불분명(판정 근거) | `shared/skill/references/handoff-worktree.md:25` "Linked `.git` may be a file", `:32` "Approved working revisions may differ from HEAD/index" | 1차 대조표(T3-ledger)에서 개별 판정을 찾지 못했다(P0-2). `:25`는 사실 서술이므로 비대상, `:32`는 허가와 가능성으로 모두 읽히므로 hold로 처리한다(§3.2). 바이트는 바꾸지 않고, 1차 판정 귀속을 확인하지 못했다는 사실을 보고한다 |

## 3. 판정 결과 (SP-3)

판정 규칙은 1차 §4.1–§4.4를 그대로 쓴다. 판정 단위, 변환 형태(`must`→`MUST`, `may`→`MAY`, `Never`→`NEVER`, `Do not`/`do not`→`DO NOT`), 대소문자 외 단어 불변도 1차와 같다. 원문 줄 번호는 HEAD `12aa9a3` 기준이다.

### 3.1 확정 편집(4개 파일 7곳)

| ID | 위치 | 이전(해당 구) | 이후 | 분류 | 판정 근거(1차 §4.1) | 플랫폼 묶음 |
|---|---|---|---|---|---|---|
| E1 (N15) | `claude/skill/references/worktree-creation.md:10` | `both must resolve to the target realpath` | `both MUST resolve to the target realpath` | 의무 | §4.1-3 무생물 주어에 대한 요건("choice must be explicit" 유형) | 고유(claude) |
| E2 (N17) | `claude/skill/references/worktree-creation.md:13` | `only Orchestrator may delete them after an explicit user instruction authorizes that deletion` | `only Orchestrator MAY delete them after …` | 허가 | §4.1-3 행위 주체에 대한 허가. 조건("after an explicit user instruction …")과 주체 한정("only")은 그대로 | 고유(claude) |
| E3 (N20) | `gemini/skill/references/coordination.md:226` | `Hold unavailable routes; do not invent native tool calls.` | `Hold unavailable routes; DO NOT invent native tool calls.` | 금지어 대문자화 | §4.1-4 세미콜론 뒤 명령형 | 고유(gemini) |
| E4 (N21) | `gemini/skill/references/worktree-creation.md:6` | `Do not substitute Claude EnterWorktree, invent an attachment call or treat Git registration as attachment evidence.` | `DO NOT substitute Claude EnterWorktree, …` | 금지어 대문자화 | §4.1-4 문장 첫머리 명령형 | 묶음 G/R(E5) |
| E5 (N21) | `grok/skill/references/worktree-creation.md:6` | 위와 같은 문장 | 위와 같은 편집 | 금지어 대문자화 | 같음 | 묶음 G/R(E4) |
| E6 (N22) | `gemini/skill/references/worktree-creation.md:8` | `Never retry with a different name, remove a worktree, change permissions or bypass the sandbox.` | `NEVER retry with …` | 금지어 대문자화 | §4.1-4 문장 첫머리 명령형 | 묶음 G/R(E7) |
| E7 (N22) | `grok/skill/references/worktree-creation.md:8` | 위와 같은 문장 | 위와 같은 편집 | 금지어 대문자화 | 같음 | 묶음 G/R(E6) |

E1이 있는 `:10`의 같은 줄에는 hold H3(`never through a compound Git command`)도 있다. 그 단어는 바꾸지 않는다. 같은 줄의 기존 `DO NOT use compound commands`는 이미 대문자다.

모든 확정 편집은 대소문자만 바꾼다. 따라서 바뀐 줄은 소문자로 접어 비교하면 모두 같아야 한다(§9).

### 3.2 hold(바이트 불변, 최종 보고 hold 목록에 기록)

| ID | 위치 | 원문 발췌 | 사유 | 묶음 |
|---|---|---|---|---|
| H1 (N12) | 4개 플랫폼 `skill/references/handoff-prep.md:90` | `Link commit SHA only in the canonical record, never the document.` | §4.1-4 동사 없는 `never` 생략구다. 1차 hold를 상속하는지는 개별 대조가 필요하다 | C/X/G/R 묶음 전체 hold |
| H2 (N14) | `claude/skill/references/worktree-creation.md:6`; `shared/skill/references/handoff-worktree.md:14` | `…, never remote HEAD/default branch or automatic fetch.` | 1차 생략구 hold 상속(T3-ledger:82) | claude·shared 같은 문장, 함께 hold |
| H3 (N16) | `claude/skill/references/worktree-creation.md:10` | `Perform source checks before entry or after exit, never through a compound Git command in the isolated session.` | §4.1-4 동사 없는 `never` 생략구 | 고유 |
| H4 (N23) | `shared/skill/references/handoff-worktree.md:16` | `Collisions require new explicit choice, never automatic suffixes.` | 1차 생략구 hold 상속(T3-ledger:83) | 단일 파일 |
| H5 | `shared/skill/references/handoff-worktree.md:32` | `Approved working revisions may differ from HEAD/index` | §4.1-3 허가와 가능성으로 모두 읽힌다. 1차 개별 판정은 확인하지 못했다 | 단일 파일 |

이와 별도로 1차 §4.4 hold 목록과 D10 hold의 gemini/grok 사본은 OD-3에 따라 hold를 상속한다. 위치는 `coordination.md:75`, `planning.md:18`, `limits.md:31`, `handoff.md:106`, `verification.md:39`, `SKILL.md:18` 대응 줄이다.

### 3.3 비대상 요약

- P0-1 NEW 행 중 N01–N11, N13, N18, N19는 비대상이다. 무생물·개념 주어의 효과 서술(§4.1-4), 가능성(§4.1-3), 상태 서술에 해당한다. 위치와 근거는 P0 결과 표를 그대로 인용한다.
- `shared/skill/references/handoff-worktree.md:25`는 사실 서술이므로 비대상이다(§2 불분명 판정 근거 행 참조).
- 원천 후보 13건(`role-policy.json` rules 8건과 Grok notice 1건, `agent-fragments.json` 4건, `global-config.mjs`)은 모두 비대상이다(P0-7).
- 1차 비대상 위치의 gemini/grok 사본(`coordination.md:110`, `planning.md:34`, `:80` 예시, `verification.md:85`)은 OD-3에 따라 상속한다.

## 4. 플랫폼 묶음 처리 (SP-4, OD-1)

- **N21·N22(E4–E7)**: gemini·grok 묶음이다. 4곳을 같은 작업, 같은 커밋에서 함께 편집한다. 한쪽만 바꾸지 않는다.
- **N20(E3)**: gemini 고유 줄이다. 같은 단락의 grok 문장은 `Hold unavailable routes.`로 끝나고 `do not invent` 구가 없다. claude/codex에도 이 문장이 없다.
- **N15·N17(E1·E2)**: claude 고유 `worktree-creation.md`다. codex `worktree-creation.md`는 내용이 다르고 패턴 검색 결과가 0건이다. gemini/grok 파일은 attachment 미검증 hold 절차로, 내용이 다르다.
- **대응 줄 확인 방법(QA, 읽기 전용)**: 편집 전에 E1–E7 각 문장의 고유 구를 4개 플랫폼 `skill/references/`와 `shared/skill/references/`에서 대소문자 무시로 검색한다. 고유 구는 `must resolve to the target realpath`, `Orchestrator may delete`, `invent native tool calls`, `substitute Claude EnterWorktree`, `retry with a different name`이다. 기대 결과는 다음과 같다.
  - E1·E2 구: claude 1곳씩
  - E3 구: gemini 1곳
  - E4–E7 구: gemini·grok 각 1곳
  - 이와 다른 위치가 나오면 그 위치를 묶음에 넣을지 판단해야 하므로 T2를 hold하고 보고한다.
- **parity 검증**: 1차 §9 방식을 4개 플랫폼으로 넓힌다. 같은 이름의 파일 쌍(SKILL.md와 references)마다 플랫폼 간 diff를 변경 전후로 비교한다. 변경 후 diff는 변경 전 diff와 같아야 한다. 단, E1–E7 때문에 생긴 대소문자 차이는 대조표 행 ID로 설명돼야 한다. 고유 줄 편집 E1·E2·E3은 해당 플랫폼이 포함된 쌍에, E4–E7은 claude·codex와 gemini·grok 사이 쌍에 대소문자 차이를 만든다. gemini–grok 사이에서는 6행의 플랫폼 이름이 달라 그 줄이 diff에 남으므로 E4·E5가 대소문자 차이를 만들고, E6·E7은 두 파일의 같은 문장이라 diff를 바꾸지 않는다(plan v2 Q-C와 같다).

## 5. R4 구체화 (SP-5)

- 원칙은 1차 §5(D6)와 같다. 저장소 안의 근거(path:line)로 원래 의도를 확인할 수 있을 때만, 주체·시점·대상을 명시하는 범위에서 구체화한다. 근거가 없거나 근거끼리 충돌하면 수정하지 않고 R4 후보로 보고한다. 묶음 문장은 모든 플랫폼에 근거가 있을 때만 함께 구체화한다.
- 이번 범위의 R4 구체화는 **0건**이다. hold H1–H4는 동사 없는 `never` 생략구(1차 §4.1-4 hold 유형)다. 동사나 규범 강도를 보충하면 무엇을 금지하는지 새로 정하는 것이 된다. 같은 규칙의 다른 위치 정의로 그 내용을 특정할 근거를 이번 판정에서 확인하지 않았다. 그래서 구체화하지 않는다. 최종 보고의 R4 후보 목록에는 H1–H4를 "동사 없는 never 생략구, 근거 미확인"으로 올린다.
- 구현 중 R4 후보를 새로 발견해도 편집하지 않고 보고한다(spec 범위 밖 편집 금지).

## 6. 통합(R3) (SP-6)

통합은 0건이다(설계 P-3). 후보 3건은 원래 위치에 둔다.
1. 4개 플랫폼 `coordination.md`의 Codex host 승인 문단: 각 파일이 host 절을 나란히 두는 구조라 한 문단만 빼면 찾기 어려워진다. shared로 옮기면 새 파일과 링크가 필요하고, 같은 경로는 C1 충돌로 막힌다(`lib/installer/skill-sources.mjs:13`).
2. gemini/grok `worktree-creation.md`: 6행은 플랫폼 이름이 다르다. claude/codex 같은 경로에 다른 내용이 있어 shared로 옮길 수 없다.
3. gemini/grok `planning.md`: 각 파일이 POLICY_TARGET이라 플랫폼마다 있어야 한다(`lib/policy/render.mjs:36`).

링크 추가·삭제·대상 변경은 0이다. 제목과 `<a id>` anchor 변경도 0이다. E1–E7에는 링크, 제목, anchor가 없다.

## 7. 재생성과 고정 테스트 처리 (SP-7)

### 7.1 재생성 절차(T2 안에서, 1차 §7 갱신)

1. 문서 7곳 편집(§3.1)
2. 원천을 편집하지 않으므로 `npm run update:role-policy`는 실행하지 않는다. `npm run check:role-policy`만 실행해 종료 코드 0을 확인한다.
3. `node scripts/update-runtime-assets.mjs --check`만 실행한다(갱신 실행 없음).
4. 테스트 문자열 기대값 갱신(§7.2 표의 TU-1)
5. `node scripts/update-manifest.mjs` → `npm run check:manifest`. 기대 변경은 `MANIFEST.sha256`의 4행이다: `claude/skill/references/worktree-creation.md`(:19), `gemini/skill/references/coordination.md`(:50), `gemini/skill/references/worktree-creation.md`(:57), `grok/skill/references/worktree-creation.md`(:75)
6. golden: 모든 소스 편집이 끝난 뒤 `node tests/node/fixtures/installed-layout.mjs --diff`로 차이를 기록한다. 차이가 아래 기대 범위로만 한정되고 T0에서 golden이 통과했으면 `--write`를 실행한다.
   - 기대 범위: 위 4개 원본 파일이 설치된 `skills/arc/references/worktree-creation.md`(claude·gemini·grok 조합)와 `skills/arc/references/coordination.md`(gemini 조합)의 SHA 항목
   - 현재 golden의 같은 SHA 예: claude `8826abe4…`, gemini coordination `751eb3c7…`, gemini worktree `401fdde0…`, grok worktree `c8951454…`
   - OD-8: T0에서 golden 테스트나 `--diff`가 이미 실패했다면 `--write`를 hold하고, 차이와 상태를 보고한다. 기대 범위 밖 차이가 나와도 hold하고 보고한다.
   - `--diff`에는 `build/native` 산출물이 필요하다(`tests/node/fixtures/installed-layout.mjs:66`). 산출물이 없으면 빌드하지 않고 보고한다(환경 변경 금지, 열린 질문 Q1).

비문구 diff 0, backtick·제목·anchor·marker diff 0 확인은 1차 §7과 같다. 확인할 marker에 `{{ARC_RUN_MODE_POLICY}}`를 추가한다. 원천 JSON의 placeholder 비교는 원천 diff가 0이므로 "원천 3개 파일 diff 0"으로 대신한다.

### 7.2 고정 테스트 영향(D3 규칙 그대로)

| ID | 위치 | 종류 | 영향과 처리 |
|---|---|---|---|
| TU-1 | `tests/node/composite-instructions.test.mjs:91` | 문자열 기대값 | `readinessByPlatform.gemini`가 E3 문장을 포함한 단락을 정확히 고정하고, `:99`에서 `body.startsWith(readiness, lastParagraph)`로 비교한다(대소문자 구분). E3만 바꾸면 gemini 준비 단락이 제거되지 않는다. 그러면 `:104`의 4개 플랫폼 바이트 동등성 `assert.equal`이 실패한다. 따라서 `do not invent native tool calls`를 `DO NOT invent native tool calls`로 E3와 짝지어 갱신한다. 이 문자열 외의 매칭 방식, 정규화, 구조는 바꾸지 않는다. 다른 플랫폼의 정규화 결과는 영향이 없다 |
| — | `tests/node/composite-instructions.test.mjs:73,77` 등 `/i` assertion | H(유지) | 변경 금지 |
| — | `tests/node/fixtures/instruction-contracts.json`(claude/codex) | C/F | 영향 없음. E1·E2 문장은 `contracts[].text`/`opening`에 없다(`tests/` 전체 검색에서 해당 구는 `composite-instructions.test.mjs:91`만 나옴). `protected` SHA는 runtime·profile 파일 대상이고, `platforms.*.skill.bytes`는 core SKILL.md의 상한 비교(`tests/node/instruction-layout.test.mjs:116`)라 references 편집과 무관하다. `agentProfileBaseline`도 agents를 편집하지 않으므로 변경이 없다 |
| — | `tests/node/fixtures/installed-layout-golden.json` | F | §7.1-6 |
| — | `MANIFEST.sha256` | F | §7.1-5 |
| — | `run-mode-contract`, `plan-level-records-contract`, `readme-gate-consistency`, Python 3종, `tests/installer-parity.json` | A/B/E/G | E1–E7 문장을 고정하지 않으므로 영향이 없다(검색 근거는 위와 같다). P0-4 표는 부분 조사이므로, 영향 확인의 정본은 T2 QA의 전체 테스트 재실행(기준선 대비 새 실패 0)이다 |

- D3 금지 사항(assertion 삭제, 정규식 완화, 대소문자 무시 추가·제거, 테스트 이름·구조 변경)은 그대로 적용한다. 부재 assertion이 실패하면 해당 편집을 hold한다.
- D7: 1차 확정 사례(`test_harness_contract.py`, 현재 `:743`)는 이미 `MUST NOT`이다. 다른 D7 후보는 T0 기준선에서 정한다.
- 테스트 갱신 기록 형식은 1차 §8.4와 같다.

## 8. 작업 분할 (SP-8)

순서는 T0 → T2 → 최종 Reviewer다. 1차와 ID를 맞추려고 T1(원천)은 비워 둔다. 원천 대상이 0건이므로 만들지 않는다.

- **T0 — 기준선(QA fresh, 커밋 없음)**
  - 대상: 실행 대상 워크트리, base `12aa9a3`(준비 완료가 확인된 뒤)
  - 검사: `npm test`; Python 3종(`tests/test_arc_policy.py`, `tests/test_harness_contract.py`, `tests/test_claude_payload.py`)을 `PYTHONDONTWRITEBYTECODE=1`로 실행; `npm run check:role-policy`; `npm run check:manifest`; `node scripts/update-runtime-assets.mjs --check`; `node scripts/check-installer-parity.mjs`; `node tests/node/fixtures/installed-layout.mjs --diff`(`build/native`가 없으면 실행 불가로 기록)
  - 산출물: 1차 §10 형식의 표(`검사 | 종료 코드 | 실패 테스트 ID | 실패 메시지 요지 | 분류(baseline/D7 후보/불명)`)와 다음 사항의 기록
    - `composite-instructions.test.mjs`의 4개 플랫폼 동등성 테스트(`:89`)와 golden 테스트의 기준선 통과 여부
    - §4의 대응 줄 검색 결과
  - 완료 기준: 모든 검사 결과가 기록되고, 실패는 분류됐다. 산출물 외 파일 변경은 0이다.
  - 선행: 실행 대상 준비 확인

- **T2 — 문서 7곳 + 짝지은 테스트 문자열 + MANIFEST + golden(Implementer, 집중 커밋 1개)**
  - 범위(허용 파일): `claude/skill/references/worktree-creation.md`, `gemini/skill/references/coordination.md`, `gemini/skill/references/worktree-creation.md`, `grok/skill/references/worktree-creation.md`, `tests/node/composite-instructions.test.mjs`(`:91` 문자열만), `MANIFEST.sha256`, `tests/node/fixtures/installed-layout-golden.json`(OD-8 조건 충족 시)
  - 절차: §7.1의 1–6. 대조표(1차 §11.1 형식, E1–E7과 hold H1–H5 행), 테스트 갱신 기록(TU-1, MANIFEST, golden)을 함께 작성한다.
  - 완료 기준:
    - diff는 허용 파일로만 한정된다. 문서 diff는 E1–E7의 대소문자 변경만 포함한다.
    - hold H1–H5 위치의 바이트는 바뀌지 않는다.
    - check 3종(`check:role-policy`, `update-runtime-assets --check`, `check:manifest`)의 종료 코드가 0이다.
    - 기준선 대비 새 실패가 0이다(`composite-instructions` `:89` 테스트 포함).
    - golden은 갱신됐거나, OD-8에 따라 hold 사유가 보고됐다.
  - 필수 QA(fresh): T0 전체 검사 재실행과 기준선 비교, §9의 의미 보존 검토, §4 parity, D3 준수 확인(테스트 diff가 `:91` 문자열과 SHA 값에만 있는지)
  - 선행: T0
  - 커밋: Orchestrator가 수락한 뒤 집중 커밋 1개(형식 `type(scope): 한국어 설명`)

- **최종 Reviewer(1회)**: T2가 수락·커밋된 뒤 `12aa9a3..HEAD` 전체 diff를 R8 관점(§9 AC2-11)으로 검토한다. 지적이 있으면 Implementer가 수정하고 Reviewer가 재확인한다. QA는 다시 배정하지 않는다. 수정은 Reviewer 재확인이 끝날 때까지 커밋하지 않고, 수락 뒤 follow-up 커밋 1개로 만든다.

- **검토 항목(브리프·QA 배정 시)**: bridge 역할(Scouter 등)은 읽기 전용 sandbox에서 heredoc을 쓸 수 없었다. bridge QA·Implementer 브리프에서는 임시 스크립트 작성이나 heredoc에 기대는 비교 절차(접기 비교, parity diff)를 피하는 방법을 명시할지 Orchestrator가 정한다.

## 9. 수용 기준과 의미 보존 검토 (SP-9)

| ID | 요구 | 기준 | 검증 |
|---|---|---|---|
| AC2-1 | R0 | `12aa9a3..HEAD` 변경 파일이 T2 허용 파일과 이 spec·plan 문서로만 한정된다. 불분명·제외 파일의 diff는 0이다 | `git diff --name-only 12aa9a3..HEAD`를 허용 목록과 대조 |
| AC2-2 | R1 | 최종 보고에 수정·제외·불분명 목록(§2, 1차 §11.2 형식)이 있다. `handoff-worktree.md:25/:32`의 1차 판정 미확인 사실도 포함한다 | Orchestrator 확인 |
| AC2-3 | R2 | 대조표 E1–E7 각 행에 강도·주체·조건·예외·우선순위 불변 확인 문장이 있다. 규칙 수가 같다 | 대소문자 접기 비교 차이 0(§9 아래), Reviewer 검토 |
| AC2-4 | R5 대상 | E1–E7이 승인 표기로 바뀌었다. 범위 안에 남은 소문자 규범어는 모두 비대상·hold·상속 기록과 대응한다 | 잔존 스캔을 P0 표·§3과 대조 |
| AC2-5 | R5 비대상·hold | §3.2 hold와 §3.3 비대상 위치의 diff가 0이다. `:10`의 `never through`는 소문자로 남는다 | 위치별 diff 확인 |
| AC2-6 | R6 | backtick span, 코드, 경로, 식별자(`EnterWorktree` 등), 명령, 제목, anchor, marker(`{{ARC_RUN_MODE_POLICY}}` 포함)의 diff가 0이다 | 1차 §7 방법 |
| AC2-7 | R3 | 통합 0건. 링크 추가·삭제·대상 변경 0. 제목·anchor 변경 0 | 링크(`](`) 줄 diff 0 |
| AC2-8 | R4·D6 | R4 구체화 0건. H1–H4는 R4 후보로 보고된다 | 대조표·보고 대조 |
| AC2-9 | R7 | 대조표에 없는 문구 변경이 0이다 | diff 줄과 E 행 1:1 |
| AC2-10 | D2 | 원천 3개 파일 diff 0. 관리 블록·runtime 산출물 diff 0. `check:role-policy`, `update-runtime-assets --check`, `check:manifest` 종료 코드 0 | 명령 실행 |
| AC2-11 | R8 | 강도·대상·조건·예외·우선순위·참조·링크 검토가 대조표와 최종 Reviewer 보고에 기록된다 | 대조표, Reviewer 보고 |
| AC2-12 | D3·OD-8 | 테스트 diff는 TU-1 문자열과 golden SHA 값에만 있다. 매칭 방식·플래그는 바뀌지 않는다. golden 갱신은 OD-8 조건을 지킨다 | 테스트 diff 검토, 기록 대조 |
| AC2-13 | D7 | 기준선 대비 새 실패가 0이다 | T0 표와 T2 QA 결과 비교 |
| AC2-14 | OD-1·D4 | E4·E5, E6·E7이 같은 커밋에서 함께 적용됐다. 고유 줄(E1–E3) 외 플랫폼 간 차이가 보존된다. `composite-instructions.test.mjs:89` 테스트가 통과한다 | §4 parity 비교, 테스트 |

**의미 보존 검토 방법(QA와 Reviewer)**
- **대소문자 접기 비교**(1차 §7): 바뀐 문서 줄과 `composite-instructions.test.mjs:91`을 소문자로 바꿨을 때 이전과 이후가 같아야 한다. 이번 범위에는 `Don't` 변환과 R4 행이 없으므로 접기 비교 차이는 0이어야 한다.
- **의무 강약**: E1 `must`→`MUST`(의무 유지), E2 `may`→`MAY`(허가 유지, "only Orchestrator"와 "after an explicit user instruction" 조건 유지), E3–E7 `do not`/`Never`→`DO NOT`/`NEVER`(금지 유지, MUST NOT으로 바꾸지 않음)
- **적용 대상·조건·예외·우선순위**: 주어(both, Orchestrator, 명령문의 암묵 주체), 열거 항목(substitute / invent / treat, retry / remove / change / bypass), 조건절은 단어 단위로 같아야 한다.
- **링크·참조**: E1–E7이 있는 파일의 링크 줄(`handoff-worktree.md`, `#worktree-failures-and-partial-completion` 등) diff가 0이다.

## 10. 위험과 보류 조건

- 1차 §13을 그대로 따른다. 여기에 다음을 더한다.
  - golden은 native 빌드에 의존한다. T0에서 golden이 실패하거나 기대 범위 밖 차이가 있으면 `--write`를 hold한다.
  - 4개 플랫폼 동등성 테스트는 E3과 TU-1을 짝지어 갱신해야 한다. 한쪽만 바뀌면 실패한다.
  - §4 대응 줄 검색에서 예상하지 못한 위치가 나오면 T2를 hold한다.
- 보류할 때는 해당 작업만 멈추고 Orchestrator에 보고한다.

## 11. Orchestrator 검토 반영(2026-11-20)

- 파일 수: 확정 편집은 4개 문서 파일 7곳이다(§3.1). 브리프의 "5개 파일"은 계수 오류다.
- TU-1(`tests/node/composite-instructions.test.mjs:91` 문자열 갱신)은 D3의 "승인된 변경 문장에 짝지은 문자열 기대값 갱신"에 해당한다. 새 결정이 아니므로 T2 허용 파일에 포함한다.
- H1(`handoff-prep.md:90`)은 1차 대조표에서 대응 행을 확인하지 못했다. 그래서 대조표에 "새 hold(1차 대응 미확인)"로 적는다. 바이트는 바뀌지 않는다.
- golden `--diff`의 `build/native` 의존(Q1): `build/native`는 source checkout(`/Users/yunho/Desktop/project/arc/build/native`)에만 있고 gitignore 대상이라 target 워크트리에는 없다. 처리 방법은 사용자 결정 OD-11로 정하고, 그 결과를 이 절에 기록한다.
  - OD-11(2026-11-20 사용자 결정): T0 전에 Orchestrator가 target 워크트리에서 `npm run build:native`를 실행해 base `12aa9a3` 소스로 산출물을 만든다. 생성물은 ignored 파일(`/build/`)뿐이어야 하며 추적 파일 변경은 0이어야 한다. 빌드가 실패하면 golden 검사·갱신을 hold하고 보고한다.
  - 실행 기록: target에 `node_modules`가 없어 첫 빌드가 `node-gyp` 미존재로 실패했다. 사용자 결정에 따라 target에서 `npm ci`(lockfile 기준 devDependencies `node-gyp@13.1.0`, `smol-toml@1.9.1`, 21개 패키지)를 실행한 뒤 다시 빌드해 성공했다(`Built darwin-arm64: 6f8a67d3…c4c3cd`). 이후 `git status --porcelain`은 spec 파일 1개만 표시했다(추적 파일 변경 0). `npm ci`는 EBADENGINE 경고(node v22.18.0)를 냈다. T0는 이 경고를 환경 정보로 기록한다.
- bridge 역할 제약: bridge QA·Implementer 브리프에 heredoc·임시 파일 없이 실행할 수 있는 비교 방법(`git diff --word-diff`, `node -e` 한 줄 등)을 명시한다. `.git` 메타데이터를 바꾸는 명령(`git fetch`, `git gc` 등)은 금지한다.
- P0-1의 독립 누락 검색은 T0 QA에서 잔존 스캔으로 대신한다(AC2-4).

## 개정 이력

| 버전 | 내용 | 승인 | 사유 |
|---|---|---|---|
| v1 | 최초 승인본(sha256 `40424434…806a1`). 승인된 §11 지시에 따라 OD-11 결정과 실행 기록을 덧붙였다(`5eb62a91…b736`, 커밋 `0e3f237`) | 사용자 2026-11-20 | — |
| v2 | §3.2 H1·H3 사유와 §5 R4 후보 사유를 "주어 생략"에서 "동사 없는 `never` 생략구"로 정정. §4 parity 문장의 E4–E7 기대를 plan v2 Q-C와 일치시킴 | 사용자 2026-11-20T22:42:23+0900 | 최종 Reviewer minor R-1·R-2. 판정·범위·AC 불변, 영향 작업 없음 |
