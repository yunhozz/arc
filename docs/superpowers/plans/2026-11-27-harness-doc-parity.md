# 하네스 지침 플랫폼 균등 보완(harness-doc-parity) 실행 계획

> **실행 안내(ARC):** 실행 조정은 Orchestrator가 맡습니다. 편집은 Implementer가 하고, task마다 새로 배정한 Tester(task 모드)가 검증합니다. 마지막에 Tester(final 모드)와 Reviewer 1회가 최종 검증을 합니다. 체크박스(`- [ ]`)는 진행 표시일 뿐 커밋 단위가 아닙니다. 승인된 최상위 task 하나가 집중 커밋 하나입니다.

- **Goal:** 지침 소스에 들어 있는 플랫폼 비대칭 가정을 4플랫폼(claude·codex·gemini·grok)에 고르게 보완합니다. 승인 설계의 B1–B18, C1·C2·C6, 그리고 확인 후 반영할 C5·C7·C8이 대상입니다.
- **설계(승인):** `build/hdq-artifacts/design-approved.md`(HEAD `f74a5ec0` 기준, 사용자 결정 포함). 이 plan의 B·C·R 번호는 모두 이 설계를 가리킵니다. Bounded 경로라서 spec 단계는 없습니다.
- **근거:** `build/hdq-artifacts/findings.md`, `asym-*.md`, `mentions.md`. 공용 문서 추출 규칙은 `docs/superpowers/specs/2026-11-26-harness-doc-refactor-3-design.md` §4.3–4.4(272–296행)을 따릅니다.
- **Tech Stack:** Node `node:test`, Python `unittest`, JSON fixture, Markdown/TOML 지침, 생성 스크립트(`scripts/update-runtime-assets.mjs`, `scripts/update-manifest.mjs`, `tests/node/fixtures/installed-layout.mjs`)
- **실행 대상:** workspace `/Users/ma-24-007/Desktop/workspace/arc`, 브랜치 `refactor/harness-doc-refactor-3`, base `f74a5ec0`. 현재 브랜치에 이어서 진행합니다(사용자 선택 2026-11-27, PH-1 해소).
- **plan 버전:** v2(v2 개정: T1 테스트 정합 3건, T5 C5·C8 문구 확정, T6 추가. v1 사용자 승인 2026-11-27. AJ-1·AJ-2·AJ-3 수용, B14는 설계대로 `toolPath`. 커밋 전 계획 문서 커밋 경계 정정 승인 2026-11-27)

## Global Constraints

- **원칙 문장 추가 금지.** "host 플랫폼과 역할별 플랫폼은 미지수"라는 원칙은 판정 기준으로만 씁니다. 지침·문서·fixture 어디에도 이 원칙을 설명하는 문장을 새로 넣지 않습니다. 추가되는 문장은 모두 아래 task 표의 설계 항목 문구와 1:1로 대응해야 합니다.
- **지시 강도 보존.** 설계가 승인한 의무 확장(B5·B11·B12·B13·B15·B16·B18의 4플랫폼 추가 문장)과 C2의 승인 문구 말고는 MUST/NEVER/DO NOT/MAY와 소문자 never의 강도·범위를 바꾸지 않습니다.
- 줄 번호의 기준은 base `f74a5ec0`입니다. Implementer는 줄 번호가 아니라 literal로 위치를 찾고, 찾지 못하면 hold합니다.
- 고정 문구는 바이트 그대로 씁니다(spec §4.3).
  - 연결 문장: `Shared text for this section: [<name>-common.md#<id>](<name>-common.md#<id>). It applies here exactly as if written in place.`
  - 공용 문서에 run을 추가할 때는 `<a id="<id>"></a>`, heading, 문단 순서를 지킵니다. 같은 섹션의 두 번째 이후 run은 `<id>-2`로 씁니다. 옮긴 문단 안의 `](#id)`는 `](<name>.md#id)`로 바꿉니다(J29).
  - 기존 공용 문서의 첫 줄과 머리말은 바꾸지 않습니다.
- 같은 문장은 4플랫폼 묶음으로 같은 편집을 합니다. 묶음 중 한 곳이 hold이면 묶음 전체를 hold합니다(J41).
- **규칙 fixture(`tests/node/fixtures/rule-pins.json`):** 이전 plan의 규칙을 따릅니다. ID는 재사용하지 않고, 패턴을 완화하지 않으며, 대소문자 무시를 추가하지 않습니다. 기존 문장 치환은 같은 ID의 `text`를 바꾸는 방식으로 합니다. 이번 설계가 승인한 예외는 아래뿐입니다(사용자 결정 "B 18건 모두 승인", `design-approved.md:3`).
  - 삭제: RP-307(B4, `design-approved.md:10`), RP-698(v2, T5 C8 Codex `git-recovery.md:37` 문단 제거, 사용자 결정 2026-11-27)
  - 새 항목: RP-809(B5 비밀·게시 금지, `design-approved.md:11`), RP-810(v2, T6 5단계 문장, 사용자 결정 2026-11-27)
  - `platforms`를 4플랫폼으로 확장(PJ2 예외): RP-057(B7), RP-300(B8), RP-151(B4), RP-079(B15), RP-594·RP-591(B5, 설계의 "8612행 항목"이 RP-591입니다), RP-626(B12), RP-629(v2, T1 C-T1-14 문장의 같은 ID 치환과 함께)
  - 항목 수: 806 → T1 805(−RP-307) → T2 806(+RP-809) → T5 805(−RP-698) → T6 806(+RP-810).
- 4플랫폼 확장 RP는 확장한 플랫폼마다 effective 텍스트에 그 문장이 실제로 있어야 합니다. `node -e`로 확인하고, 없으면 그 RP 묶음을 hold합니다.
- `tests/node/plan.test.mjs`는 `renderingBaseline` 해시 값 줄만 바꿀 수 있습니다. 해시는 MANIFEST·golden을 갱신한 뒤 `node --test --test-name-pattern='preserves public rendering baseline' tests/node/plan.test.mjs`의 실패 메시지(actual)에서 얻습니다. 판정은 `node --test`의 exit code로 합니다.
- 테스트는 관련된 것만 실행합니다. 전체 `npm test`는 금지합니다.
- 문서 본문은 영어만 씁니다(`instruction-language.test.mjs`).
- **커밋:** Orchestrator만 커밋합니다.
  - 형식은 `type(scope): 한국어 설명`이고 본문 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`을 붙입니다.
  - amend는 금지합니다. `f74a5ec0`을 포함한 기존 커밋도 고치지 않습니다.
  - 승인된 이 plan 문서는 실행 전에 계획 문서 커밋 하나로 커밋합니다(`handoff-prep.md` Planning document commit). 실행 중 승인된 plan 개정만 처음 적용되는 task 커밋에 trailer와 함께 넣습니다.
  - 실행 중 개정은 처음 적용되는 task 커밋에 `Plan-Revision:`, `Plan-Approved-At:`, `Plan-Reason:` trailer와 함께 넣습니다.
- **역할 배치(P4):** plan은 플랫폼에 의존하지 않습니다. 실행 시점의 routing을 따릅니다.
  - 작성 시점 routing은 Implementer·Tester·Scouter가 Codex bridge, Planner·Reviewer가 Claude native입니다.
  - Codex 사용량이 회복될 때까지 bridge 역할 task는 시작하지 않습니다(PH-2).
  - routing이 바뀌면 그 시점의 배치로 진행하고, 바뀐 사실만 handoff에 기록합니다.
- **bridge brief 규칙(P5).** bridge 역할 brief에는 다음을 그대로 넣습니다.
  1. 한 번에 한 명령씩 실행합니다. 병렬 출력은 하지 않고, 파일은 한 번에 하나씩 읽습니다.
  2. 자기 스크립트 오류나 출력 잘림은 도구 실패가 아닙니다. 스크립트를 고쳐 다시 실행하고, 그 사실을 보고에 적습니다.
  3. heredoc과 프로세스 치환은 쓰지 않습니다. `node -e '…'` 한 줄이나 산출물 디렉터리(`ARC_SCRATCH_DIR`) 안의 스크립트를 씁니다. 저장소 안에 임시 파일을 만들지 않습니다.
  4. foreground로 실행합니다. `&`나 background는 쓰지 않습니다.
  5. Git 상태를 바꾸지 않습니다(add/commit/stash/reset/fetch/gc, index를 쓰는 status 금지). 조회에는 `git --no-optional-locks`를 붙입니다.
  6. Node v26(bridge)과 v22(host)는 TAP 파싱이 다릅니다. 렌더링과 단일 테스트의 판정은 `node --test`의 exit code로 하고, TAP 집계는 참고로만 씁니다.
  7. 모든 명령 뒤에 `; echo "exit=$?"`를 붙입니다.
  8. Python은 `PYTHONDONTWRITEBYTECODE=1 python3 -B …`로 실행합니다.
  9. 다른 bridge가 돌고 있을 때는 커밋하지 않습니다(ref 변경이 다른 bridge를 실패시킵니다). bridge task는 동시에 하나만 진행합니다.

## Review Focus

1. **B5 effective 결합의 heading 수준 차이.** 같은 "Visual companion" 섹션이 Claude·Gemini·Grok에서는 H1이고 Codex에서는 H2입니다. 공용 섹션 heading은 AJ-1에 따라 `# Visual companion`으로 둡니다. 그러면 codex에서 `## Visual companion`으로 섹션을 자르면 공용 부분이 빠집니다. → T2 D-0이 그렇게 자르는 테스트가 있는지 확인하고, 있으면 hold합니다(H-B5). Tester TD-5가 4플랫폼 `effectiveText`에 공용 문단이 1회씩 들어 있는지 봅니다.
2. **의무 확장(B5·B11·B12·B13·B15·B16·B18)과 C2 문구.** 확장된 문장이 원문과 바이트로 같은지 확인합니다(TD-1). C2는 codex `MAY use available approved browser tools`를 승인 문구로 바꾸면서 `MAY`와 `approved`가 빠집니다. 승인된 결정이지만 Reviewer가 따로 확인합니다.
3. **보호 테스트와 문구 고정.** `tests/test_harness_contract.py:215`가 B2 대상 문구를 정규식으로 고정합니다. 그 밖의 Python 정규식은 소문자로 접어 비교합니다. → T0 R3, H-R3
4. **fragment 이름 변경(B11)과 렌더 순서.** `claude.profile-guidance`를 `common.profile-guidance`로 바꿀 때 텍스트는 그대로 두고 참조 10곳만 바뀌어야 합니다. 새 배열이 실제 렌더 결과와 같아야 합니다. → T3 TD-11
5. **B14 메시지 기준.** 설계대로 `toolPath`를 쓰면 `Agent` 입력도 `spawn_agent tool requires assignment validation`이 됩니다. 설계 의도와 맞는지 Reviewer가 확인합니다. Claude adapter(`claude.mjs:34`)는 바꾸지 않습니다.

---

## 0. 순서와 커밋 경계

| 시점 | 커밋 주체 | 내용 | 메시지 초안 |
|---|---|---|---|
| plan 승인 뒤, T0 전 | Orchestrator | 이 plan 문서만(구현 파일 없음) | `docs(plan): 하네스 지침 플랫폼 균등 보완 실행 계획 추가` |
| T0 수락 | 없음 | 커밋하지 않습니다. 결과는 workflow 산출물(`.git/arc/workflows/harness-doc-parity/t0.md`, Orchestrator 저장)입니다. | — |
| T1 수락 | Orchestrator | T1 변경 | `fix(skill): 지침 문서의 플랫폼 비대칭 가정 보완` |
| T2–T5 각 수락 | Orchestrator | 그 task의 allowedPaths 변경 | task마다 적었습니다. |
| T6 수락 | Orchestrator | T6 allowedPaths 변경 | `fix(skill): plan-mode Implementer 배정 절차의 경로별 기록 보완` |
| 최종 Reviewer 지적 해소 | Orchestrator | 수정분. Reviewer 재확인 뒤 follow-up 커밋 1개 | `fix(skill): 플랫폼 균등 보완 최종 리뷰 지적 반영` |

- 실행 순서: T0 → T1 → T2 → T3 → T4 → T5 → T6 → 최종 Tester → 최종 Reviewer
- v2 개정은 v2로 다시 실행하는 T1의 수락 커밋에 `Plan-Revision`·`Plan-Approved-At`·`Plan-Reason` trailer와 함께 들어갑니다.
- T4는 내용상 독립이지만 MANIFEST·golden을 함께 쓰고 bridge는 동시에 하나만 돌리므로 순서대로 진행합니다(AJ-13).
- 모든 task의 공통 수락 전제: fresh Tester(task 모드) 보고가 있고 남은 실패가 없어야 합니다. Reviewer는 task 단위 검사가 아닙니다.

## 1. 공통 정의

### 1.1 기준선(base `f74a5ec0`)

| 검사 | 기준선 |
|---|---|
| CS-N | 358 통과 |
| CS-P | 실패 35 method(`build/hdp-artifacts/HDP-2/cs-p-comparison.json`) |
| CS-S | 통과 |
| `node scripts/check-installer-parity.mjs --complete` | consumer 3건(기준선 그대로) |
| `composite-instructions` + `rule-pins` | 29 통과 |
| 링크 검사 | 724건, 깨짐 0 |

판정은 test ID 기준으로 새 실패 0입니다. test ID는 `파일::test 이름`, Python은 `파일::Class.method` 형식입니다.

### 1.2 검사 집합

- **CS-N:** `node --test --test-reporter=tap tests/node/rule-pins.test.mjs tests/node/instruction-layout.test.mjs tests/node/agent-fragments.test.mjs tests/node/role-policy.test.mjs tests/node/test-scope-contract.test.mjs tests/node/composite-instructions.test.mjs tests/node/plan-level-records-contract.test.mjs tests/node/run-mode-contract.test.mjs tests/node/instruction-language.test.mjs tests/node/installed-layout-golden.test.mjs tests/node/manifest.test.mjs`
- **CS-P:** `PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest -v tests/test_arc_policy.py tests/test_claude_payload.py tests/test_harness_contract.py`
- **CS-S:**
  - `npm run check:role-policy`
  - `npm run check:manifest`
  - `node scripts/update-runtime-assets.mjs --check`
  - `node scripts/check-installer-parity.mjs`
  - `node tests/node/fixtures/installed-layout.mjs --diff`
- **CS-R(렌더링):** `node --test --test-name-pattern='preserves public rendering baseline' tests/node/plan.test.mjs`. 판정은 exit code로 합니다.
- **CS-X:** 각 task D-0에서 찾은 추가 테스트 파일입니다. 그 task에서만 실행합니다.

### 1.3 공통 절차(편집 task T1–T3·T5)

- **D-0 의존 조사.** 바꾸는 문서마다 다음을 합니다.
  - `tests/` 아래 `*.mjs|*.py|*.json`에서 `rule-pins.json`, `installer-parity.json`, golden을 빼고 검색합니다.
  - 그 문서를 참조하는 파일과, 편집 대상 문장의 20자 이상 조각을 고정하는 assertion을 `path:line | 문서 | 토큰` 형식으로 나열합니다. 소문자 접기 비교도 찾습니다(`-i`).
  - 이 목록이 CS-X입니다. T0 R3 결과와 다르면 편집 전에 멈추고 보고합니다(H-R3).
- **D-1 편집.** task 표의 전후 문구를 바이트 그대로 적용합니다. 변경 대응표 `C-<task>-<nn> | 설계 항목 | path:line | 이전 | 이후`를 씁니다.
- **D-2 RP 갱신.** task의 RP 변경표대로 바꿉니다. 바꾼 RP마다 `node -e`로 대상 플랫폼 effective 텍스트에 그 문장이 있는지 확인합니다.
- **D-3 생성물.**
  - 필요한 경우 `node scripts/update-runtime-assets.mjs`를 실행합니다.
  - `node scripts/update-manifest.mjs`를 실행하고 `npm run check:manifest`가 exit 0인지 봅니다. 바뀐 행이 allowedPaths 안의 설치 파일 행뿐인지 확인합니다.
  - `node tests/node/fixtures/installed-layout.mjs --diff`의 원 출력을 기록합니다. 모든 줄이 기대 범위 안이고 `build/native`가 있을 때만 `--write`를 실행하고, 다시 `--diff`해서 0줄인지 확인합니다. 조건이 맞지 않으면 H-2입니다.
  - CS-R이 실패하면 `renderingBaseline` 값 줄만 바꿉니다.
- **D-4 실행과 보고.** CS-N, CS-P, CS-S, CS-R, CS-X를 실행합니다. 대응표, RP 변경표, golden 원 출력, 명령과 exit code, 변경 파일 목록을 보고합니다.

### 1.4 Tester 확인 항목(TD)

- **TD-1 문구 대응:** diff hunk가 대응표 행과 1:1입니다. 추가된 문장은 모두 설계 문구나 원문 출처(path:line)와 바이트로 같습니다. 원칙 설명 문장이 새로 생기지 않았습니다.
- **TD-2 강도 보존:** 바뀐 문장마다 MUST/NEVER/DO NOT/MAY/never 토큰 다중집합을 비교합니다. 줄거나 바뀐 곳이 승인 목록(C2 codex `MAY`)뿐이어야 합니다.
- **TD-3 RP:** `rule-pins.json` diff가 RP 변경표와 1:1입니다. 항목 수가 그 task 시점의 값(Global Constraints 항목 수 줄)이어야 합니다.
- **TD-4 구조:** 기존 파일의 `<a id>` 집합과 heading 줄 diff가 0입니다(새 공용 run은 예외). 관리 블록 바이트가 같습니다. 사라진 backtick span은 설계가 지운 것(C1의 `AskUserQuestion`·`run_in_background`·`timeout`·`fork` 등)뿐입니다.
- **TD-5 공용 추출(T1 C6, T2 B5):** 연결 문장이 바이트 그대로 있습니다. 옮긴 문단이 원문(승인 편집 반영)과 같습니다. 4플랫폼 `effectiveText`에 그 문단이 1회씩 들어 있습니다.
- **TD-6 링크:** base와 HEAD를 같은 방법으로 검사합니다. 새로 깨진 링크가 0이어야 합니다(기준 724/0).
- **TD-7 생성물:** golden·MANIFEST diff 줄이 task 범위 안입니다. `plan.test.mjs`에서 바뀐 줄은 `renderingBaseline` 값뿐입니다.
- **TD-8 실행:** CS-N, CS-P, CS-S, CS-R, CS-X에서 기준선 대비 새 실패가 0입니다.

---

## T0 — 선행 조사 (Scouter, 커밋 없음)

- **목표:** 설계 R1–R5를 확인해 T1·T3·T5의 문구와 테스트 조정 범위를 확정합니다.
- **allowedPaths:** 없음(읽기 전용)
- **선행:** plan 승인, 실행 대상 확정(PH-1), 실행 시점 routing의 Scouter 가용(PH-2)
- **조사 항목:**
  - [ ] **R1** `shared/skill/references/handoff-common.md:146–151`: 역할이 bridge일 때 Implementer 절차 4–6단계(150행 "Invoke native assignment …")를 처리하지 못하는 공백이 있는지 봅니다. `coordination-common.md:91`과 대조합니다. 판정은 공백 없음(S) 또는 공백 있음 중 하나이고 근거 줄을 붙입니다.
  - [ ] **R2** C5: `coordination-common.md:190`의 full network·Playwright gate 값이 Gemini·Grok에서 무엇인지 확인합니다(`lib/runtime`의 gate·toolAccess 정의와 `docs/harness-operation.md` gate 표). C7: Codex 설치가 Claude 설정(`settings.json.env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`)도 다루는지 확인합니다(`lib/installer`, `codex/` 설치 대상).
  - [ ] **R3** 테스트 고정 패턴: `instruction-contracts.json`, `tests/installer-parity.json`, Python 3개 파일(소문자 접기 정규식 포함), `tests/node/*.mjs`에서 다음을 찾습니다.
    - 검색어: `Skill tool`, `native roles`, `Exclude Architectural`, `CLI compliance`, `lacks Bash`, `no browser tool`, `user-question`, `foreground Agent`, `run_in_background`, `forks such as`, `pre-spawn`, `Agent tool requires`, `profile-guidance`
    - Planner 사전 확인: `instruction-contracts.json`에는 이 검색어가 하나도 없습니다.
    - 반드시 판정할 것: `tests/test_harness_contract.py:215` EVIDENCE_LIMITS를 쓰는 test method와 적용 플랫폼, 그리고 그 method가 기준선 35 실패에 들어 있는지
    - 추가 확인: `arc-visual-companion`을 `## Visual companion`이나 `# Visual companion`으로 잘라 읽는 테스트가 있는지, 4개 SKILL.md의 크기 여유(`instruction-contracts.json` `skill.bytes`·`skill.lines` 대비)
  - [ ] **R4** verification `:4` TDD 문단(claude/gemini/grok에만 있고 codex에는 없음)과 C8 중복 여부: 같은 의무가 codex의 다른 곳(handoff·profile)에 있는지 봅니다.
  - [ ] **R5** `README*`, `docs/`, `lib/`(runtime·installer)의 출력 문구 가운데 특정 host·역할 배치를 전제하는 문장을 후보로 나열합니다. 판정은 하지 않습니다.
- **보고:** 항목마다 관찰과 추론을 나눠 `path:line` 근거와 함께 씁니다.
- **분기:**
  - **R3에서 바꿀 문구를 고정하는 테스트가 없을 때(기대):** T1·T3를 그대로 진행합니다.
  - **R3에서 일반 계약 테스트(CS-N 파일이나 `runtime-codex.test.mjs`)의 literal이 걸릴 때:** Orchestrator가 그 `path:line`을 해당 task allowedPaths에 추가하는 plan 개정(v2)을 승인받고 나서 그 task를 시작합니다. 허용 변경은 literal 치환뿐입니다.
  - **R3에서 `test_harness_contract.py`(보호)가 걸릴 때:**
    - 그 method가 이미 기준선 실패이면 B2를 그대로 진행하고 기록합니다.
    - 통과 중이면 B2·B3 묶음을 hold하고(H-R3) 사용자 결정으로 넘깁니다(OD-2). T1의 나머지 항목은 진행합니다.
  - **B5 heading 의존 테스트가 있을 때:** T2를 hold합니다(H-B5).
  - **SKILL.md 크기 여유가 B6–B8 증가분(codex 약 +60 bytes)보다 작을 때:** 해당 SKILL.md 묶음을 hold합니다(H-SIZE). 상한값은 바꾸지 않습니다.
  - **R1이 "공백 있음"일 때:** 설계 범위 밖의 새 결정이므로 Orchestrator가 사용자에게 넘깁니다. T1–T4는 handoff-common을 편집하지 않으므로 영향이 없습니다. 반영이 결정되면 plan 개정으로 task를 추가합니다. (v2: 공백 확인, 사용자 결정 "이번 plan에 추가", 설계 (a) 승인 → T6)
  - **R2·R4 결과:** T5에 반영합니다. 애매하면 사용자 재질문 hold입니다(H-C).
  - **R5 후보:** 이번 범위 밖입니다. 후속 과제로 기록하고, 반영하려면 별도 승인이 필요합니다.
- **TD:** 없음(조사 결과는 Orchestrator가 검토합니다)

---

## T1 — skill 문서 보완 (B1–B4, B6–B9, B15, C1, C2, C6)

- **목표:** reference 문서와 SKILL.md의 플랫폼 가정 문구를 중립화하거나 4플랫폼으로 넓힙니다.
- **allowedPaths:**
  - `shared/skill/references/coordination-common.md`, `shared/skill/references/verification-common.md`, `shared/skill/references/arc-visual-companion-common.md`
  - `claude/skill/references/verification.md`, `codex/skill/references/verification.md`, `gemini/skill/references/verification.md`, `grok/skill/references/verification.md`
  - `claude/skill/references/handoff.md`, `gemini/skill/references/handoff.md`, `grok/skill/references/handoff.md`
  - `claude/skill/references/coordination.md`, `codex/skill/references/coordination.md`, `gemini/skill/references/coordination.md`, `grok/skill/references/coordination.md`
  - `claude/skill/references/worktree-creation.md`
  - `claude/skill/SKILL.md`, `codex/skill/SKILL.md`, `gemini/skill/SKILL.md`, `grok/skill/SKILL.md`
  - `tests/node/fixtures/rule-pins.json`, `MANIFEST.sha256`, `tests/node/fixtures/installed-layout-golden.json`, `tests/node/plan.test.mjs`(`renderingBaseline` 값만)
  - (v2) `tests/node/composite-instructions.test.mjs`(161행만), `tests/test_arc_policy.py`(565행만)
- **선행:** T0 수락. R3 분기가 개정을 요구하면 개정 승인까지
- **편집표(이전 → 이후):**

| ID | 설계 | 위치(base) | 변경 |
|---|---|---|---|
| C-T1-01 | B1 | `coordination-common.md:154` 다음 줄(같은 목록, `**Claude**` 앞 빈 줄 유지) | 추가: `- All bridge children: Apply the shared child guard in [Shared dispatch rules](coordination.md#coordination-shared-dispatch-rules). The guard denies routing commands only; native delegation inside a child follows each platform's Delegation item below.` |
| C-T1-02 | B1 | `coordination-common.md:160` | `- Delegation: Role instructions forbid re-delegation. Claude children expose no Task tool. Apply the shared child guard in [Shared dispatch rules](coordination.md#coordination-shared-dispatch-rules).` → `- Delegation: Role instructions forbid re-delegation. Claude children expose no Task tool.` |
| C-T1-03 | B2 | claude/gemini/grok `verification.md:15`, codex `:13` | `Claude Code CLI compliance`, `Gemini CLI compliance`, `Grok CLI compliance` → `platform CLI compliance` |
| C-T1-04 | B3 | `arc-visual-companion-common.md:14` | `Claude Code CLI compliance` → `platform CLI compliance` |
| C-T1-05 | B4 | claude/gemini/grok `handoff.md:80` | `Exclude Architectural,` → `Exclude Spike/Architectural,` |
| C-T1-06 | B6 | `claude/skill/SKILL.md:3`, `gemini/skill/SKILL.md:3` | `using Claude native roles`, `using Gemini native roles` → `using ARC role profiles` (Grok `:3`은 그대로, A) |
| C-T1-07 | B7 | 4 `SKILL.md:14` | `its own Skill tool` → `its own skill invocation` |
| C-T1-08 | B8 | `codex/skill/SKILL.md:22` | `for simple self-contained questions and coordinates` → `for simple self-contained questions answerable from context or one quick read without edits and coordinates` |
| C-T1-09 | B9 | `claude/skill/references/worktree-creation.md:14` | `The native roles (Planner/Reviewer) inherit session cwd.` → `Native roles inherit session cwd.` |
| C-T1-10 | B15 | claude/gemini/grok `coordination.md:21` 문단 다음(빈 줄 하나를 두고, `<a id="instruction-and-execution-adapter">` 앞) | 추가(`codex/skill/references/coordination.md:21` 원문): `After each read-only role return (Scouter/Planner/Reviewer), compare `git status` with the pre-spawn snapshot. Unexpected changes stop under Preservation rule. Concurrent Implementer edits and ignored/out-of-repository paths cannot be attributed/detected. Read-only is prompt policy, not sandbox enforcement.` |
| C-T1-11 | C1 | `gemini/.../coordination.md:48` | 줄 전체 → `- Use only an actually available user-question tool and its verified input schema; Gemini user-question APIs are unverified.` (grok `:48` 형태) |
| C-T1-12 | C1 | `gemini/.../coordination.md:49` | `never inheriting forks such as `fork`;` → `never inheriting the parent conversation history;` (AJ-3, 나머지는 그대로) |
| C-T1-13 | C1 | gemini/grok `coordination.md:55` | 줄 전체 → `- Wait for actual role results or completion notifications from the available tool. Report unavailable execution; invent no API. NEVER poll/sleep-poll for timeout/delay. Batch corrections in one brief. Long shell commands use a sufficient timeout or the available background mode plus completion notification.` |
| C-T1-14 | C2 | claude/gemini/grok `verification.md:65` | `Tester has no browser tool: launch/exercise apps/URLs through Bash only with assigned criteria/cited prerequisites, following installed browser-skill CLI guidance.` → `With assigned criteria/cited prerequisites, Tester uses browser tools its platform actually provides; without one, it launches/exercises apps/URLs through the shell only, following installed browser-skill CLI guidance.` |
| C-T1-15 | C2 | `codex/.../verification.md:63` | `With assigned criteria/cited prerequisites, Tester MAY use available approved browser tools for apps/URLs.` → C-T1-14의 이후 문장 |
| C-T1-16 | C2 | claude/gemini/grok `verification.md:4` | `Reviewer lacks Bash and requests runtime checks.` → `Reviewer does not run commands for verification and requests runtime checks.` |
| C-T1-17 | C6 | claude/gemini/grok `verification.md:60` | 문단을 `verification-common.md`의 새 run `<a id="reviewer-timing-and-task-acceptance-2"></a>` + `## Task acceptance and final plan acceptance` + 원문(문구 그대로)으로 옮깁니다. 위치는 기존 `reviewer-timing-and-task-acceptance` run(86–90행) 바로 뒤입니다. 원래 자리에는 연결 문장 `[verification-common.md#reviewer-timing-and-task-acceptance-2](…)`을 둡니다. |
| C-T1-18 | C6 | `codex/.../verification.md:57–59`(빈 줄 3개) | 빈 줄, 연결 문장(C-T1-17과 같음), 빈 줄로 바꿉니다. |
| C-T1-19 | C6 | `codex/.../coordination.md:49`와 `:50` 사이 | 추가(`claude/.../coordination.md:51` 원문): `- Write final base..HEAD diff/changed-file list to `<git-common-dir>/arc/review/<slug>.diff`, using handoff slug/approved base HEAD. Inline if small or write denied. Reviewer reads and states limits; follow verification.` |

- **RP 변경표:**
  - RP-742: 텍스트는 그대로입니다. 새 bullet에 포함되는지 확인합니다.
  - RP-151: `platforms`를 `["claude","codex","gemini","grok"]`로 바꿉니다.
  - RP-307: 삭제합니다(승인 예외).
  - RP-057: `text`를 `…through its own skill invocation.`으로 바꾸고 `platforms`를 4플랫폼으로 바꿉니다.
  - RP-300: `platforms`를 4플랫폼으로 바꿉니다.
  - RP-079: `platforms`를 4플랫폼으로 바꿉니다.
  - (v2) RP-629: `text` `through Bash only` → `through the shell only`(C-T1-14·15의 새 문장 조각), `platforms`를 4플랫폼으로 바꿉니다.
  - RP-309·RP-310·RP-314·RP-315(claude 전용)는 바꾸지 않습니다.
- **(v2) 테스트 literal 정합**(T1 1차 실행에서 새 실패 3건, T0 R3가 놓친 고정; 허용 변경은 아래 literal뿐):
  - C-T1-20 `tests/node/composite-instructions.test.mjs:161`: `/^### Bridge target rules\n\n- Bridge prepare, run and resume[^\n]+\n\n\*\*Claude\*\*/m` → `/^### Bridge target rules\n\n- Bridge prepare, run and resume[^\n]+\n- All bridge children: Apply the shared child guard in [^\n]+\n\n\*\*Claude\*\*/m` (C-T1-01 bullet을 정확한 위치로 고정합니다. 완화가 아닙니다.)
  - C-T1-21 `tests/test_arc_policy.py:565`: `"Planner/Reviewer"` → `"Native roles inherit session cwd"` (C-T1-09의 새 문장)
  - RP-629는 위 RP 변경표 행으로 처리합니다.
- **생성물:** MANIFEST(설치 파일 행), golden(조합마다 `~` 행이 바뀐 references와 SKILL.md에 대응), CS-R 해시
- **단계:**
  - [x] D-0. CS-X 후보는 `tests/test_harness_contract.py`, `tests/test_claude_payload.py:488–496`, `composite-instructions`, `grok-install.test.mjs`, gemini 관련 테스트(T0 R3로 확정)입니다.
  - [x] D-1부터 D-4까지 진행합니다. 추가로 SKILL.md 크기를 `wc -c -l */skill/SKILL.md`로 재고 상한 미만인지 확인합니다.
  - 결과(T1 수락 2026-11-27): Implementer 7d77e278(1차, 새 실패 3건) → plan v2 → fresh Implementer b95d1054(새 실패 0). Tester 22811746 TD-1–TD-8 proven, CS-N 358 통과, CS-P 기준선 35 method 동일, RP 805, 링크 728/0.
- **AC:**
  - AC-T1-1: C-T1-01–19가 모두 반영되고, allowedPaths 밖 diff가 0입니다.
  - AC-T1-2: RP 변경표가 반영되고, 항목 수 805(RP-809는 T2에서 추가)에서 `rule-pins` test가 통과합니다.
  - AC-T1-5(v2): `composite-instructions.test.mjs`와 `test_arc_policy.py::RolePolicyTests.test_claude_managed_worktree_creation_covers_ac19`가 통과하고, 두 파일의 diff가 C-T1-20·21 한 줄씩뿐입니다.
  - AC-T1-3: SKILL.md가 크기 상한을 통과합니다.
  - AC-T1-4: 새 실패가 0입니다.
- **관련 테스트와 이유:**
  - `rule-pins`: RP 확장·삭제·치환
  - `composite-instructions`: coordination-common Bridge target rules와 child guard bullet
  - `instruction-layout`: heading·크기·관리 블록
  - `test-scope-contract`·`plan-level-records-contract`: verification effective section
  - Python 3개: `_effective`와 보호 정규식
  - `manifest`·golden·CS-R: 설치 산출물
- **Tester:** TD-1–TD-8. TD-5는 C6에 적용합니다. TD-2 예외는 C-T1-15뿐입니다.
- **hold:** H-R3(B2·B3 묶음), H-SIZE, H-RP, H-2, J41 묶음
- **커밋:** `fix(skill): 지침 문서의 플랫폼 비대칭 가정 보완`

---

## T2 — visual companion 공용 섹션 (B5)

- **목표:** visual companion 도입부, 지침 bullet, 제안 흐름, 공통 절차를 공용 섹션 하나로 모아 4플랫폼에 같게 적용합니다.
- **allowedPaths:** `claude/skill/references/arc-visual-companion.md`, `codex/skill/references/arc-visual-companion.md`, `gemini/skill/references/arc-visual-companion.md`, `grok/skill/references/arc-visual-companion.md`, `shared/skill/references/arc-visual-companion-common.md`, `tests/node/fixtures/rule-pins.json`, `MANIFEST.sha256`, `tests/node/fixtures/installed-layout-golden.json`, `tests/node/plan.test.mjs`(값만)
- **선행:** T1 수락·커밋. H-B5가 해당하지 않아야 합니다.
- **공용 run:** `arc-visual-companion-common.md`의 머리말 뒤, 기존 `follow-up-…` run 앞에 넣습니다.
  1. `<a id="visual-companion"></a>`
  2. `# Visual companion` (AJ-1)
  3. 중립 도입 문단(AJ-2, claude `:4`에서 플랫폼 표현만 바꿈): `Use visuals when they materially help design discussion or verification. Orchestrator determines actual capability/consent. Planner returns visualization needs only; DO NOT invent browser/shell access. Other depth-2 roles stay within their profile tool limits and cannot delegate visualization.`
  4. claude `:6–9` bullet 4개(바이트 그대로)
  5. codex `:11–14` 단계 1–4(바이트 그대로)
  6. 공통 문단: claude `:11–17`(= codex `:16–22`, 두 쪽이 바이트로 같은지 먼저 확인)
- **플랫폼 파일:**
  - claude·gemini·grok: `:4–17`을 연결 문장 `[arc-visual-companion-common.md#visual-companion](…)` 한 줄로 바꿉니다. 먼저 gemini·grok의 해당 범위가 claude와 바이트로 같은지 확인하고, 다르면 hold합니다.
  - codex: `:11–14`와 `:16–22`를 연결 문장 한 줄로 바꿉니다. `:4`와 `:9`는 그대로 둡니다(AJ-4b).
- **RP 변경표:**
  - RP-594(`waits for acceptance`): `platforms`를 4플랫폼으로 바꿉니다.
  - RP-591(`complete keyed URL`): `platforms`를 4플랫폼으로 바꿉니다.
  - RP-809를 새로 넣습니다(승인 예외). `{ "id": "RP-809", "category": "prohibition", "doc": "arc-visual-companion", "platforms": ["claude","codex","gemini","grok"], "text": "NEVER expose secrets or publish previews without authorization.", "origin": ["docs/superpowers/plans/2026-11-27-harness-doc-parity.md (B5, user-approved 2026-11-27)"] }`
- **생성물:** MANIFEST, golden(4개 `arc-visual-companion.md`와 공용 문서 `~`), CS-R
- **단계:** [ ] D-0(heading으로 자르는 테스트 재확인) [ ] D-1–D-4. 옮긴 텍스트가 원문과 같은지 `node -e`로 확인합니다(중립 도입 문단만 예외).
- **AC:**
  - AC-T2-1: 4플랫폼 `effectiveText('<p>','arc-visual-companion')`에 공용 run이 1회씩 있습니다.
  - AC-T2-2: 플랫폼 파일의 `<a id>`·heading diff가 0입니다.
  - AC-T2-3: RP 806건이고 `rule-pins` 3개 test가 통과합니다.
  - AC-T2-4: 새 실패가 0입니다.
- **관련 테스트:** `rule-pins`(effective 포함 검사와 배타성), Python(`test_arc_policy.py:249` 계열의 codex visual 검사), `instruction-layout`, `manifest`·golden·CS-R
- **Tester:** TD-1–TD-8(TD-5 포함). 두 번 나오는 공통 절차 목록이 공용 문서에 1회만 있는지 확인합니다.
- **hold:** H-B5, H-RP, H-2, 플랫폼 원문 불일치
- **커밋:** `fix(skill): visual companion 지침을 공용 섹션으로 4플랫폼 통일`

---

## T3 — agent 프로필 보완 (B10–B13, B16–B18)

- **목표:** Codex 프로필에 빠진 fragment와 안내를 채우고, Claude·Gemini·Grok Implementer 읽기 목록에 `handoff-worktree.md`를 넣습니다.
- **allowedPaths:** `lib/prompts/agent-fragments.json`, `codex/agents/`, `claude/agents/`, `gemini/agents/arc-implementer.md`, `grok/agents/arc-implementer.md`, `tests/node/agent-fragments.test.mjs`(17행만), `tests/node/fixtures/rule-pins.json`, `MANIFEST.sha256`, `tests/node/fixtures/installed-layout-golden.json`, `tests/node/plan.test.mjs`(값만). `update-runtime-assets --check`가 실패할 때만 `shared/skill/runtime/`를 추가합니다.
- **선행:** T2 수락·커밋
- **편집표:**

| ID | 설계 | 위치 | 변경 |
|---|---|---|---|
| C-T3-01 | B11 | `agent-fragments.json:33` | `"id": "claude.profile-guidance"` → `"common.profile-guidance"`. `text`는 바이트 그대로입니다. |
| C-T3-02 | B11 | `claude/agents/arc-*.md` 5개(`:24–27` 부근) | marker `claude.profile-guidance` → `common.profile-guidance` |
| C-T3-03 | B10·B11 | `codex/agents/arc-{planner,reviewer,scouter,tester}.toml` `:21`과 `:23` 사이, `:23` 뒤 | claude 순서에 맞춥니다. `:21` 다음에 빈 줄과 `{{ARC_AGENT_FRAGMENT:common.preservation-choice-inspection}}`, `:23` 다음에 빈 줄과 `{{ARC_AGENT_FRAGMENT:common.profile-guidance}}` |
| C-T3-04 | B10 | `agent-fragments.json` targets | codex planner·reviewer·scouter·tester의 `fragments` 배열에 `common.preservation-choice-inspection`을 렌더 순서대로 넣습니다. |
| C-T3-05 | B11·B17 | `agent-fragments.json` targets | codex 5개 target에 `common.profile-guidance`를, codex implementer에 `codex.incident-prefix`·`common.resume-gates`를 렌더 순서대로 넣습니다. |
| C-T3-06 | B17 | `codex/agents/arc-implementer.toml:26–28` | `:28` → `{{ARC_AGENT_FRAGMENT:codex.incident-prefix}} {{ARC_AGENT_FRAGMENT:common.optional-read-exception}} {{ARC_AGENT_FRAGMENT:common.resume-gates}}`, 그 뒤에 빈 줄과 `{{ARC_AGENT_FRAGMENT:common.profile-guidance}}`. `:26–27`에 fragment와 같은 인라인 문장이 있으면 marker로 대체합니다(중복 금지). |
| C-T3-07 | B12 | `codex/agents/arc-reviewer.toml`, profile-guidance 다음·`reviewer.contract-intro` 앞 | 추가(claude `:26`·gemini `:21` 원문): `Read the brief-cited diff artifact or inline final base..HEAD diff/changed-file list and state limits. Include severity, locations and reasoning in findings. Request runtime checks from Orchestrator.` |
| C-T3-08 | B13 | `codex/agents/arc-scouter.toml`, profile-guidance 다음·`scouter.research-brief` 앞 | 추가: `Read the brief/named research skills; report unavailable capabilities. Distinguish observation from inference.` (`DO NOT execute commands`는 넣지 않습니다. 설계상 A) |
| C-T3-09 | B18 | `codex/agents/arc-tester.toml`, profile-guidance 다음·`tester.contract-intro` 앞 | 추가(`gemini/agents/arc-tester.md:21` 원문): `Treat generated cache/reports as approved verification side effects; preserve user files. Shell app/URL use requires assigned UI acceptance and cited prerequisites. Shell is policy-governed capability, not a filesystem sandbox.` |
| C-T3-10 | B16 | `claude/agents/arc-implementer.md:31`, `gemini/agents/arc-implementer.md:23`, grok 대응 줄 | ``Read `references/handoff.md`, `handoff-prep.md` only`` → ``Read `references/handoff.md`, `handoff-prep.md`, `handoff-worktree.md` only`` (`codex/agents/arc-implementer.toml:23` 형태) |
| C-T3-11 | B10·B11·B17 | `tests/node/agent-fragments.test.mjs:17` | `[8, 14, 10, 12, 11, 5, 12, 8, 10, 9, 6, 12, 8, 10, 9, 6, 12, 8, 10, 9]` → `[8, 14, 10, 12, 11, 8, 14, 10, 12, 11, 6, 12, 8, 10, 9, 6, 12, 8, 10, 9]`. `:15`(26)와 `:16`(20)은 그대로입니다. |

- 배열 값은 설계에 적힌 값입니다. Implementer는 수정한 registry를 렌더한 결과에서 target별 fragment 수를 `node -e`로 뽑아 이 배열과 같은지 확인합니다. 다르면 편집하지 않고 hold합니다(H-ARR).
- TOML `"""` 경계, frontmatter, 관리 블록은 바이트 그대로 둡니다. Gemini·Grok 프로필의 인라인 profile-guidance(`:19`)는 그대로 둡니다.
- **RP 변경표:** RP-626(`agent:reviewer`, `diff artifact`)의 `platforms`를 4플랫폼으로 바꿉니다. 먼저 gemini·grok 렌더 결과에 이 문구가 있는지 확인합니다.
- **생성물:** MANIFEST, golden(설치 agent profile `~`), CS-R. `node scripts/update-runtime-assets.mjs --check`가 실패하면 재생성합니다.
- **단계:** [ ] D-0(CS-X 후보: `run-mode-contract.test.mjs:53`, codex profile 관련 테스트) [ ] D-1–D-4. 이때 `node --test tests/node/agent-fragments.test.mjs` exit 0이어야 합니다.
- **AC:**
  - AC-T3-1: 편집표가 모두 반영됩니다.
  - AC-T3-2: fragment 26개, target 20개이고, 배열이 실제 렌더 결과와 같으며 중복이나 순서 오류가 없습니다.
  - AC-T3-3: `rule-pins`가 통과합니다.
  - AC-T3-4: 새 실패가 0입니다.
- **관련 테스트:** `agent-fragments`(marker·순서·중복·TOML), `rule-pins`(`agent:*`), `run-mode-contract`(fragment 참조), `role-policy`(관리 블록), `instruction-language`, `manifest`·golden·CS-R
- **Tester:** TD-1–TD-4, TD-6–TD-8. 추가로 다음을 확인합니다.
  - TD-11: registry diff는 id 이름 변경 1건과 targets 배열 추가뿐입니다. fragment `text`의 diff는 0입니다.
  - 렌더한 codex 프로필 5개가 TOML로 파싱됩니다.
- **hold:** H-ARR, H-RP, H-2
- **커밋:** `fix(agents): Codex 프로필 누락 안내와 공용 fragment 보완`

---

## T4 — Codex runtime 오류 메시지 (B14, TDD)

- **목표:** `lib/runtime/adapters/codex.mjs:25`의 오류 메시지를 고정된 `Agent`가 아니라 실제 도구 경로 기준으로 바꿉니다.
- **allowedPaths:** `lib/runtime/adapters/codex.mjs`, `tests/node/runtime-codex.test.mjs`, `shared/skill/runtime/adapters/codex.mjs`(생성물), `MANIFEST.sha256`, `tests/node/fixtures/installed-layout-golden.json`, `tests/node/plan.test.mjs`(값만)
- **선행:** T3 수락·커밋(AJ-13)
- **단계:**
  - [ ] 1. **RED.** `tests/node/runtime-codex.test.mjs`에 새 test를 하나 추가합니다. `tool_name`이 `spawn_agent`이고 `describeTool`이 `operation: 'read'`처럼 `assign-agent`가 아닌 값을 반환하면, `normalizeCodexEvent`가 메시지 `spawn_agent tool requires assignment validation`으로 throw해야 합니다. `Agent` 입력도 toolPath 기준으로 같은 메시지를 기대합니다(AJ-10).
  - [ ] 2. `node --test --test-name-pattern='<새 test 이름>' tests/node/runtime-codex.test.mjs`를 실행합니다. 메시지 불일치로 실패(exit ≠ 0)하는 것을 확인하고 원 출력을 보고합니다.
  - [ ] 3. **GREEN.** `throw Error('Agent tool requires assignment validation')` → `throw Error(toolPath+' tool requires assignment validation')`. 그 밖의 줄은 바꾸지 않습니다. `claude.mjs:34`는 바꾸지 않습니다.
  - [ ] 4. 같은 test를 다시 실행해 exit 0인지 보고, `node --test tests/node/runtime-codex.test.mjs` 전체도 exit 0인지 봅니다.
  - [ ] 5. `node scripts/update-runtime-assets.mjs`를 실행하고, `--check`가 exit 0인지 봅니다. 그다음 MANIFEST, golden(`--diff` 기대: runtime `adapters/codex.mjs`의 `~`), CS-R을 처리합니다.
  - [ ] 6. CS-N, CS-S, CS-R, CS-X(`runtime-codex.test.mjs`)를 실행합니다. CS-P는 지침을 바꾸지 않으므로 뺍니다.
- **AC:**
  - AC-T4-1: RED 실패를 관찰한 뒤 GREEN 통과가 보고됩니다.
  - AC-T4-2: 원천과 생성물이 같습니다(`--check` 0).
  - AC-T4-3: 새 실패가 0입니다.
- **Tester:** TD-1, TD-7, TD-8. 추가로 다음을 확인합니다.
  - TD-12: `codex.mjs` diff가 25행 1줄뿐이고, 생성물 diff가 같습니다.
  - 새 test가 GREEN 코드에서 통과하고, 원래 메시지로 되돌리면 실패합니다. 되돌린 결과는 메모리에서 재현하고 파일은 바꾸지 않습니다.
- **hold:** H-2. RED가 관찰되지 않으면(이미 통과) 멈추고 보고합니다.
- **커밋:** `fix(runtime): Codex adapter 할당 검증 오류 메시지를 도구 경로 기준으로 변경`

---

## T5 — 확인 후 반영 (C5, C7, C8)

- **목표:** T0 R2·R4로 확인한 사실에 맞게 C5·C7·C8을 반영합니다.
- **allowedPaths:** `shared/skill/references/coordination-common.md`, `codex/skill/references/limits.md`, `shared/skill/references/git-recovery-common.md`, `claude/skill/references/git-recovery.md`, `codex/skill/references/git-recovery.md`, `gemini/skill/references/git-recovery.md`, `grok/skill/references/git-recovery.md`, `tests/node/fixtures/rule-pins.json`, `MANIFEST.sha256`, `tests/node/fixtures/installed-layout-golden.json`, `tests/node/plan.test.mjs`(값만)
- **선행:** T4 수락·커밋, T0 R2·R4 결론
- **C5 분기:**
  - (v2 확정, T0 R2: Codex·Claude·Gemini `held`, Grok `unmeasured`, `lib/runtime/tool-access.mjs:100,108`, `docs/harness-operation.md:192–196`; 사용자 결정 2026-11-27) `coordination-common.md` `On Codex and Claude, the gates for full network access and all three Playwright services have the value `held`.` → `On Codex, Claude and Gemini, the gates for full network access and all three Playwright services have the value `held`; on Grok they are `unmeasured`.` RP-760 `text`를 같은 ID로 새 문장 전체로 치환합니다.
- **C7 분기**(설계 결정 C7 선택지 1: Scouter 확인 뒤 사실에 맞게):
  - 대상: `codex/skill/references/limits.md:17` `Codex `[agents].max_concurrent_threads_per_session` and Claude `settings.json.env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` constrain their respective sessions.`
  - R2에서 Codex 설치가 Claude 설정을 다루지 않는다고 확인될 때: → `Codex `[agents].max_concurrent_threads_per_session` constrains its native session.`
  - Codex 설치가 Claude 설정도 다룰 때: 변경하지 않습니다.
  - 근거가 애매할 때: H-C
- **C8 분기**(설계 결정 C8 선택지 1):
  - (v2 확정, 사용자 결정 2026-11-27)
  - C-T5-C8a: claude/gemini/grok `git-recovery.md` `## Handoff record write denial` 섹션의 문단 `Orchestrator inspects related processes/ACLs read-only itself or assigns Tester; Scouter/Planner/Reviewer cannot execute commands. Failed profile reapplication MUST restore replaced bytes/modes. If rollback fails, preserve recovery files/paths; NEVER claim clean state or remove recovery material.`에서 뒤 두 문장(`Failed profile reapplication … recovery material.`)을 지우고 첫 문장만 남깁니다. 지운 두 문장은 바이트 그대로 `shared/skill/references/git-recovery-common.md`의 기존 run `handoff-record-write-denial` 끝에 새 문단으로 붙입니다. 4플랫폼(codex 포함)이 이미 이 run에 연결 문장을 두고 있으므로 새 연결 문장은 없습니다.
  - C-T5-C8b: `codex/skill/references/git-recovery.md`의 `<a id="existing-changes-and-failures"></a>`, `### Existing changes and failures`, 그 아래 문단(`A branch does not isolate uncommitted changes … missing target choice block handoff.`)과 뒤따르는 빈 줄을 지웁니다. 이 anchor를 참조하는 곳은 없습니다(Orchestrator grep). RP-698(이 문단의 문장)을 삭제합니다(승인 예외). TD-4의 `<a id>`·heading 집합 diff는 이 1건만 예외입니다.
  - 강도: 옮긴 문장의 MUST·NEVER는 그대로 4플랫폼에 적용됩니다(codex는 확장). 지운 codex 문단의 NEVER 1개는 사용자 결정에 따른 승인 예외입니다(TD-2).
- 반영할 것이 하나도 없으면 이 task는 변경 없음으로 끝나고 커밋하지 않습니다.
- **AC:** 반영 문구가 T0 근거 `path:line`과 대응하고 새 실패가 0입니다.
- **Tester:** TD-1–TD-8
- **hold:** H-C, H-RP, H-2
- **커밋:** `fix(skill): bridge gate 값 등 확인 결과 반영`(변경이 있을 때만)

---

## T6 — plan-mode Implementer 배정의 경로별 절차 (R1, v2 추가)

- **목표:** `shared/skill/references/handoff-common.md` Initial Implementer assignment 절차의 5단계와 6단계 일부를 경로별 문장으로 바꿉니다. runtime은 바꾸지 않습니다(설계 (a), `build/hdq-artifacts/t6-design.md`). 근거: `lib/runtime/assignment.mjs:15–21,38–41`(agentId는 비어 있지 않은 문자열만 검사), `lib/runtime/role-routing.mjs:232–271`(prepare-dispatch는 cooperative state를 참조하지 않음), `lib/runtime/verification.mjs:63`.
- **allowedPaths:** `shared/skill/references/handoff-common.md`, `tests/node/fixtures/rule-pins.json`(RP-810 추가만), `MANIFEST.sha256`, `tests/node/fixtures/installed-layout-golden.json`, `tests/node/plan.test.mjs`(값만)
- **선행:** T5 수락·커밋(변경 없음 포함)
- **편집표:**
  - C-T6-01 5단계 줄 `5. Invoke native assignment with saved task/scope/correlation.` → `5. Assign the Implementer with saved task/scope/correlation. Without `Mixed routing`, invoke native assignment. With `Mixed routing`, after step 4 run `prepare-dispatch` with `role: "arc_implementer"`, the same `taskId` and `allowedPaths` set to the worktree-relative form of saved `paths`, then follow the native or bridge route in [coordination](coordination-common.md#coordination-composite-platform-role-dispatch); the brief carries saved task/scope/correlation.`
  - C-T6-02 6단계의 `Success needs returned agent ID;` → `Success needs the returned agent ID; on a bridge route it is the `dispatchId`, recorded after `run-dispatch` returns `allow`. A `prepare-dispatch` or `run-dispatch` hold/deny is `failed` after `cancel` of any still-reserved lease; a dispatch that becomes `unknown` is `unknown`.` 뒤의 `unknown/mismatch holds duplicate assignment for investigation.`와 6단계의 나머지는 그대로 둡니다.
  - 링크 대상 anchor는 `shared/skill/references/coordination-common.md`에만 있으므로 `coordination-common.md#…`로 씁니다. Implementer는 링크 검사로 대상이 실제로 있는지 확인합니다.
- **RP:** RP-810 `{ "id": "RP-810", "category": "<RP-809와 같은 스키마의 알맞은 값>", "doc": "handoff", "platforms": ["claude","codex","gemini","grok"], "text": "With `Mixed routing`, after step 4 run `prepare-dispatch` with `role: \"arc_implementer\"`", "origin": ["docs/superpowers/plans/2026-11-27-harness-doc-parity.md (T6, user-approved 2026-11-27)"] }`. category 값과 `doc` 이름은 기존 handoff 항목을 본떠 맞추고 보고합니다.
- **AC:** AC-T6-1 두 문장이 승인 문구와 바이트로 같음, AC-T6-2 섹션의 다른 줄과 파일의 다른 부분 diff 0, AC-T6-3 강도 토큰 다중집합 불변, AC-T6-4 4플랫폼 `effectiveText`에 새 문장 1회씩, AC-T6-5 새로 깨진 링크 0, AC-T6-6 RP-810 포함 검사 통과·항목 수 806, AC-T6-7 MANIFEST·golden diff가 handoff-common 행뿐(rendering 값 예외), AC-T6-8 새 실패 0, AC-T6-9 원칙 설명 문장 없음
- **관련 테스트:** `rule-pins`(RP-810), `instruction-language`(handoff-common 영어), `composite-instructions`·`test-scope-contract`(effective handoff), `installed-layout-golden`·`manifest`·CS-R, CS-P(`test_claude_payload.py`가 effective handoff를 읽음)
- **TDD:** 해당 없음(문서·fixture만, runtime 동작 불변). RP-810을 먼저 넣어 red를 확인하는 것은 선택입니다.
- **Tester:** TD-1–TD-4, TD-6–TD-8
- **hold:** H-RP, H-2
- **커밋:** `fix(skill): plan-mode Implementer 배정 절차의 경로별 기록 보완`
- **후속(범위 밖, handoff 기록):** AJ-T6-4 Tester/Reviewer bridge actor id 규칙(`verification-common.md:124`), AJ-T6-5 교정 시 새 Implementer와 task당 assignment 1개 제약(`assignment.mjs:21`, `verification.mjs:63`)

---

## 최종 Tester (final 모드)

- **선행:** T1–T6 수락(T5는 변경 없음일 수 있음), task Tester 재확인 완료
- [ ] 1. 최종 HEAD에서 CS-N, CS-P, CS-S, CS-R, 모든 task의 CS-X 합집합을 실행하고 §1.1 기준선과 test ID로 비교합니다.
- [ ] 2. `node scripts/check-installer-parity.mjs --complete`를 실행합니다. consumer 3건이 기준선과 같은지 봅니다.
- [ ] 3. 링크 무결성 전체: base `f74a5ec0` 대비 새로 깨진 링크가 0이어야 합니다(기준 724/0).
- [ ] 4. `git --no-optional-locks diff --name-only f74a5ec0..HEAD`가 계획 문서 커밋의 plan 문서와 T1–T6 allowedPaths만 포함하는지 봅니다.
- [ ] 5. RP 항목이 806건이고(RP-307·RP-698 삭제, RP-809·RP-810 추가), 4플랫폼 RP 10개(RP-057·079·151·300·591·594·626·629·809·810)가 포함 검사를 통과하는지 봅니다.
- [ ] 6. 원칙 문장 추가 금지: 누적 diff의 추가 문장 전체가 대응표와 1:1인지 다시 확인합니다.
- [ ] 7. `installed-layout.mjs --diff`가 0줄이어야 합니다(H-2이면 그 hold 기록).
- **겹치는 파일(재확인 대상):** `rule-pins.json`(T1·T2·T3·T5·T6), `MANIFEST.sha256`·golden·`plan.test.mjs`(T1–T6), `coordination-common.md`(T1·T5), `arc-visual-companion-common.md`(T1·T2), `claude/agents/`(T3)
- **전체 회귀 trigger 잠정 판단:** 실행하지 않습니다.
  - 대체 검사: 위 1–7과 CS-X 합집합
  - 사유: 변경이 지침 텍스트, fixture, 생성물, 메시지 리터럴 한 줄에 한정됩니다. 사용자 환경 기록에 따라 전체 `npm test`는 금지입니다. 필요하다고 판단되면 Orchestrator가 사용자 승인을 받습니다.
- **새 실패:** Implementer → Tester 재확인을 거친 뒤 최종 Reviewer를 시작합니다.

## 최종 Reviewer (1회, 실행 시점 routing을 따름)

- **선행:** 최종 Tester 결론 완료
- **범위:** `f74a5ec0..HEAD` 전체 diff(artifact)와 T0 결과, 대응표, RP 변경표
- **중점:** Review Focus 1–5, 지시 강도 보존, 원칙 문장 부재, A·S 판정 항목(그대로 둔 줄)이 실제로 그대로인지
- **지적 처리:** Implementer → Reviewer를 반복하고 Tester는 다시 배정하지 않습니다. 수정은 Reviewer 재확인까지 커밋하지 않고, 수락 뒤 follow-up 커밋 1개로 만듭니다.

---

## 2. 변경하지 않는 항목(no change)과 사유

- **C3** `shared/skill/references/visual-companion.md:60`: 사용자 결정으로 유지합니다.
- **C4** `coordination-common.md:154` 보호 경로 목록: 문서를 유지합니다. Gemini 설정 경로 보완은 후속 과제로 handoff에 기록합니다.
- `handoff-common.md:150` "Invoke native assignment": (v2) T6에서 바꿉니다.
- `grok/skill/SKILL.md:3`: A
- `lib/runtime/adapters/claude.mjs:34`: Claude Agent 도구는 고유 기능(A)
- claude·codex `coordination.md`의 `:48`·`:49`·`:55`(codex `:48`·`:49`·`:53`): 각 플랫폼 고유 도구(A)
- Gemini·Grok 프로필의 인라인 profile-guidance: fragment 수 26 유지
- RP-314(claude 전용) `platforms`: 설계에 확장 항목이 없습니다.
- RP-742 원문
- codex scouter의 `DO NOT execute commands`: B13 제외(A)

## 3. 작성자 판단(AJ)

| ID | 판단 | 이유 |
|---|---|---|
| AJ-1 | B5 공용 heading은 `# Visual companion`(H1), id는 `visual-companion` | 4플랫폼 중 3곳이 H1이고, `coordination-common.md:6`에도 공용 H1 선례가 있습니다. codex H2와의 차이는 §4.3 예외로 기록하고 D-0에서 의존 테스트를 확인합니다. |
| AJ-2 | B5 중립 도입은 claude `:4`에서 "has read-only file tools and"와 "exact allowlists"만 바꿉니다. | 설계 요소(capability/consent, Planner는 필요만 반환, 프로필 도구 한계)를 최소 변경으로 담고 `DO NOT`을 보존합니다. |
| AJ-3 | gemini `:49`는 `forks such as `fork`` → `the parent conversation history` | Claude 전용 fork 개념을 지우면서 소문자 `never`의 강도는 유지합니다. |
| AJ-4 | C6의 공용 id는 `reviewer-timing-and-task-acceptance-2`, codex 연결 문장 자리는 `:58` | §4.3의 `<id>-2` 규칙을 따르고, codex에 남아 있던 빈 줄 자리를 씁니다. |
| AJ-4b | codex visual companion `:4`·`:9`는 남깁니다. | 설계가 지정한 이동 범위(`:11–14`와 공통 문단)만 옮깁니다. |
| AJ-5 | C6의 codex coordination bullet은 `:49`와 `:50` 사이 | claude에서 "Implementer briefs" 바로 앞이라는 상대 위치와 맞춥니다. |
| AJ-6 | B15 문단은 각 파일 `:21` 문단 바로 뒤(빈 줄 사이) | 설계 "`:21` 다음" |
| AJ-7 | B1 bullet은 `:154`와 같은 목록에, 빈 줄 없이 이어 붙입니다. | 플랫폼 라벨 앞에 오는 공통 규칙 목록이기 때문입니다. |
| AJ-8 | RP-809의 `origin`은 plan 경로와 승인 표기 | 스키마는 비어 있지 않은 배열만 요구합니다(`rule-pins.test.mjs:55`). 원래 고정하던 테스트는 없습니다. |
| AJ-9 | RP-057은 같은 ID로 치환과 확장을 함께 합니다. | 재사용 금지 규칙과 충돌하지 않습니다. |
| AJ-10 | B14 RED 기대 메시지는 `Agent`·`spawn_agent` 입력 모두 `spawn_agent tool …` | 설계가 `toolPath`를 지정했습니다(`codex.mjs:19`). |
| AJ-11 | C2 "Reviewer lacks Bash"는 3사본만 바꿉니다. | codex에는 그 문장이 없습니다. |
| AJ-12 | B2 위치는 claude/gemini/grok `:15`, codex `:13` | 실제 줄 번호입니다. |
| AJ-13 | T4는 T3 뒤에 순서대로 진행합니다. | 공유 생성물과 bridge 동시 실행 금지 교훈 때문입니다. |
| AJ-14 | T1 수락 시점의 RP 수는 805입니다. | RP-809는 B5 문장이 생기는 T2에서 추가해야 포함 검사가 통과하기 때문입니다. |

## 4. 열린 결정(OD)

- **OD-1 C7·C8 정의(해소, Orchestrator 개정):** 설계 대화의 C7·C8 원문과 사용자 결정(선택지 1)을 T5 분기에 넣었습니다.
- **OD-2 B2와 보호 테스트(해소, Orchestrator 확인):** `tests/test_harness_contract.py:215` 패턴은 `PLATFORMS = ("codex", "claude")`(12행)에만 적용되고, 실패 0을 요구하는 method는 `PolicyContractTests.test_common_contracts_have_platform_owners`(544–545행)뿐입니다. 이 method는 기준선 실패 35개에 들어 있습니다(`build/hdp-artifacts/HDP-2/cs-p.txt:190`). 713행 mutation 검사는 `EVIDENCE_VERDICTS`만 봅니다. 따라서 B2는 새 실패 test ID를 만들지 않으므로 그대로 진행합니다. 보호 테스트 패턴이 옛 문구를 계속 고정한다는 사실은 handoff 후속 과제로 기록합니다. T0 R3는 이 판정을 다시 확인합니다.

## 5. Plan-level hold(PH)와 hold 정의

- **PH-1** 실행 대상: 현재 브랜치에 이어서(사용자 선택 2026-11-27, 해소).
- **PH-2** 실행 시점 routing의 bridge 역할을 쓸 수 있어야 합니다(작성 시점에는 Codex 사용량 회복 대기).
- **H-R3** 바꿀 문구를 테스트가 고정함(T0 분기)
- **H-B5** heading으로 섹션을 자르는 의존 테스트가 있음
- **H-SIZE** SKILL.md 크기 상한 초과
- **H-RP** 확장 RP가 대상 플랫폼 텍스트에 없음
- **H-ARR** fragment 배열이 렌더 결과와 다름
- **H-C** C5·C7·C8 사실이 애매함(사용자 재질문)
- **H-2** golden `--write` 조건 미충족
- allowedPaths 밖 변경이 필요하면 즉시 hold하고 보고합니다.

## 6. 설계 항목과 task 대응

B1–B4·B6–B9·B15·C1·C2·C6 → T1 / B5 → T2 / B10–B13·B16–B18 → T3 / B14 → T4 / C5·C7·C8 → T5 / C3·C4 → 변경 없음(C4는 후속 기록) / R1–R5 → T0

## 7. 개정 이력

| 버전 | 내용 |
|---|---|
| v2 | Orchestrator 개정(2026-11-27): T1 1차 실행의 새 실패 3건 정합(C-T1-20·21, RP-629), T5 C5·C8 문구 확정(사용자 결정, RP-698 삭제), T6 추가(R1 설계 (a)·AJ-T6-1–5 사용자 승인, RP-810), 항목 수 흐름·최종 검사 갱신 |
| v1 | 초안(Planner, 2026-11-27). Orchestrator 검토 개정: OD-1(C7·C8 분기, T5 allowedPaths)·OD-2 해소 반영. 커밋 전 정정(사용자 승인): plan 문서를 T1 커밋이 아닌 실행 전 계획 문서 커밋으로 |
