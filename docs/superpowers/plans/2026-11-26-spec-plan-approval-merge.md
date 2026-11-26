# spec·plan 결합 승인, Bounded spec 생략, design 대화 강화 구현 계획

> **실행 방식(ARC 적응):** Orchestrator가 task마다 Implementer와 fresh Tester를 순서대로 배정합니다. 이 프로젝트는 significant/high-risk 경로입니다. 각 task는 Implementer → 필수 fresh Tester → Orchestrator 수용 → focused commit 1회로 끝납니다. 모든 task를 수용한 뒤 final Tester(mode: final)가 full regression shard를 돌리고, 최종 Reviewer가 전체 변경을 1회 리뷰합니다. Reviewer는 task 단위 게이트가 아닙니다. 단계는 체크박스(`- [ ]`)로 추적하며 커밋 단위가 아닙니다. 외부 실행 skill이나 별도 실행 방식 선택은 없습니다.

**Goal:** Bounded의 spec 단계를 없애고, Architectural spec과 plan을 한 번에 승인하게 하고, design 단계에 대화 방식과 결정 inventory를 도입합니다. 런타임 게이트도 같은 규칙에 맞춥니다.

**Architecture:** 정책 문구 변경은 두 task(T1: G1/G2, T3: G4/G5)로 나눕니다. 4개 플랫폼 reference는 손으로 고치고, 관리 구간·런타임 사본·fixture는 생성기로만 반영합니다. 런타임 변경(T2)은 기존 record와 schema를 재사용하고 optional 필드 `planningDepth`만 추가합니다. 유효 문서 세트 판정은 `lib/runtime/schema.mjs`의 공용 helper 하나로 통일합니다.

**Tech Stack:** Node.js ESM(`node --test`), Python `unittest`, Markdown policy references, JSON registry(`role-policy.json`, `agent-fragments.json`)

**Spec:** `docs/superpowers/specs/2026-11-26-spec-plan-approval-merge-design.md`, 버전 v2, Orchestrator 리뷰 수정 포함 최종 SHA-256 `21cfea857635c4ec39d806d78505cae2f9f0a864bbeaf7024f01b615e7a299fd` (리뷰됨, 결합 승인 전). plan 초안은 spec SHA-256 `55c7054a…`을 기준으로 작성됐고, 이후 spec 변경은 RT2 결합 승인 destination 항목 1건입니다. 근거 design v2(승인): `/private/tmp/claude-501/-Users-ma-24-007-Desktop-workspace-arc/881cf134-8e38-4d55-bdab-567b83f71dcf/scratchpad/2026-11-26-spec-plan-approval-merge-design-v2.md`

**대상:** `/Users/ma-24-007/Desktop/workspace/arc`, 브랜치 `chore/spec-plan-approval-merge`, base `313b0d033df744760978335c38e2b7b334760045`

## 전역 제약

- 교체 문구는 spec §3.1–§3.7의 "변경 후" 문구를 그대로 씁니다. 4개 플랫폼(`claude`, `codex`, `gemini`, `grok`)에서 바이트까지 같아야 합니다(§3.6). 기존 플랫폼별 차이(Codex 행 오프셋 등)는 유지합니다.
- 생성 구간(role-policy 관리 구간, `shared/skill/runtime/*`)은 손으로 고치지 않고 생성기로만 반영합니다(§3.6, §4).
- 런타임 새 필드는 optional만 허용합니다. 필드가 없으면 기존 동작을 따릅니다(§4 공통 원칙).
- `evaluatePlannerCall` 본문, `validatePlannerStage`, `schema.mjs:89`에는 diff hunk가 없어야 합니다(AC16).
- `lib/runtime/external.mjs`는 안 바꿉니다. 이유: no-plan/omission 미지원을 유지합니다.
- 다음 파일도 안 바꿉니다: `commit.md`, `verification.md`, `SKILL.md` 본문, `handoff.md:34`. 이유는 spec §3.0에 있습니다.
- 새·변경 테스트 이름과 hold reason은 spec 초안 문구를 씁니다(SJ12).
- 판정 기준은 base 313b0d03 대비 새 실패 없음입니다. 기존 실패(약 51–55건)와 부하 flake는 단독 재실행으로 판정합니다.
- task는 순차로 진행합니다. bridge 실행 중에는 커밋이나 다른 쓰기를 하지 않습니다.
- 커밋 메시지는 저장소 관례(한국어, `chore(policy): …` 등)를 따릅니다.
- 이 plan의 범위 표기는 "바꾼다/안 바꾼다(이유)"만 씁니다.

## Review Focus

1. **리뷰 후 spec 바이트 변경:** 리뷰가 끝난 뒤 spec 파일이 바뀐 상태에서 plan stage를 등록하면 hold(`Reviewed spec bytes changed`)여야 합니다. → T2 테스트 5
2. **결합 승인 뒤 한 문서의 바이트 변경:** 리뷰 이후 plan.md가 바뀐 상태로 결합 승인을 기록하면 hold여야 합니다. → T2 테스트 7
3. **준비 전 결합 승인:** target transition 전에 `data.documents` 형식으로 승인을 기록하면 hold여야 합니다(§4.6 유지 원칙). → T2 테스트 8
4. **잘못된 `planningDepth` 값:** 대소문자가 틀린 `'bounded'` 같은 값은 `validateWorkflowState`가 거부해야 합니다. 조용히 legacy로 처리하면 안 됩니다. → T2 테스트 19
5. **Bounded 깊이에 spec이 섞인 native 세트:** `planningDepth:'Bounded'`이면서 `{spec,plan}`이면 docs-commit과 첫 Implementer에서 hold여야 합니다. → T2 테스트 16, 21

---

## plan 작성자 판단 목록 (결합 승인 요청에 첨부)

| ID | 판단 | 이유 |
|---|---|---|
| PJ1 | anchor 순서는 T1 → T2 → T3로 풉니다. T1은 §3.1.1의 2항 `([decision inventory](#decision-inventory))`를 `(decision inventory)`로, 5항 `[question classification](#decision-inventory)`를 `question classification`으로 링크 없이 씁니다. T3가 §3.1.4 anchor를 만들면서 두 곳을 spec 원문 링크로 바꿉니다. F3은 T1에서 spec 원문 그대로 씁니다. | spec §12가 허용한 첫 번째 방식입니다. 반대 순서(T3 먼저)는 §3.1.4-5의 `#architectural-combined-approval`(T1이 만듦)이 깨집니다. 어느 커밋에도 깨진 anchor가 남지 않고, 최종 결과는 spec과 같습니다. |
| PJ2 | 유효 문서 세트 helper를 `lib/runtime/schema.mjs`에 둡니다. `validateWorkflowState`와 `validateRequest` 사이에 export 4개를 추가합니다: `planningDocumentKinds(depth)`, `hasExactPlanningKinds(documents,kinds)`, `preparedTargetIntent(state)`, `expectedCooperativePlanningKinds(state)` | spec §4.4는 helper 이름과 위치를 plan에 맡겼습니다. `schema.mjs`는 순수 모듈(`platform-registry`, `operations`만 import)이라 `assignment.mjs`, `gate.mjs`에서 import해도 순환이 생기지 않습니다. 새 모듈을 만들지 않으므로 runtime 모듈 목록도 그대로입니다. |
| PJ3 | RT3의 4번 조건에 쓰는 spec 바이트 관찰값은 `cooperative.mjs`가 `evidence.reviewedSpec = {path, hash}`로 `evaluateCooperative`에 넘깁니다. | spec은 관찰 방식(`readTargetPreparationEvidence`)만 정했습니다. 필드 이름은 결과물에 영향이 없습니다. |
| PJ4 | `requiredEvidence` 식별자(`approved-spec`, `approved-documents` 등)와 `assignment.mjs:26`의 hold reason은 안 바꿉니다. | spec이 지정한 것은 reason 문자열뿐입니다. 식별자를 소비하는 외부 경로는 확인하지 않았습니다. |
| PJ5 | `cooperative.mjs:73`의 "준비 전 기록 금지"를 `data.documents` 형식의 승인에도 적용합니다. 미전환 intent의 문서 경로와 겹치면 기존 reason으로 hold합니다. | spec §4.6이 이 hold를 유지하라고 합니다. 새 승인 형식이 이 hold를 우회하지 못하게 하려는 것입니다. |
| PJ6 | RT4의 문서 경로 대조는 `cooperative.mjs:81`과 같은 방식인 `[doc.path, path.join(state.target.realpath, doc.path)].includes(d.path)`로 합니다. kind별로 정확히 1개씩 대응해야 합니다. | 기존 단일 승인 검증과 같은 방식이고 동작상 차이가 없습니다. |
| PJ7 | `runtime-cooperative.test.mjs:205`는 기존 assert를 유지합니다(prepared intent가 없는 legacy 경로). 여기에 "intent가 없으면 spec 승인 없이 planner-review만으로는 hold" assert를 1개 추가합니다. 리뷰된 spec 전제의 검증은 T2 테스트 4·5가 맡습니다. | spec §4.3은 intent가 없으면 기존 조건을 유지하라고 합니다. §6.1의 "리뷰된 spec 전제로 바꾼다"는 intent가 있는 새 테스트로 충족합니다. |
| PJ8 | `runtime-target-preparation.test.mjs:362`는 이름을 유지하고 본문을 새 흐름으로 바꿉니다: spec destination에 approvalRef 없음 → 리뷰 ref를 prerequisite로 plan stage 등록 → 결합 승인 allow, 부분 세트는 hold. 기존 legacy 흐름은 새 테스트 6이 맡습니다. | spec §6.1 그대로입니다. legacy 검증 범위가 줄지 않습니다. |
| PJ9 | 새 정책 문구 테스트의 위치: 4개 플랫폼 문서 검사는 `tests/test_arc_policy.py`의 새 class(T1 `SpecPlanApprovalMergeTests`, T3 `DesignConversationPolicyTests`)에 둡니다. 렌더된 `arc-planner` 검사는 `tests/node/agent-fragments.test.mjs`에 둡니다. | spec은 "Python 또는 Node"라고만 했습니다. 기존 파일을 쓰면 새 파일 등록(MANIFEST, package 목록)이 생기지 않습니다. |
| PJ10 | `tests/node/runtime-versions.test.mjs`는 `baselineHash`만 실제 값으로 갱신합니다. `previousRuntimeHash`와 `historicalRuntimeHash`는 안 바꿉니다. | spec §5에 없는 항목이고, `notEqual` 조건은 새 값으로도 성립합니다. |
| PJ11 | I5 해결: native에서 리뷰된 spec stage와 바이트의 연결은 기존 필드로 충분합니다. `stage.ready===true`이면 `schema.mjs:95`에 따라 draft artifact hash가 필수이므로 새 필드를 추가하지 않습니다. | spec §4.5 I5 |
| PJ12 | `README.md`, `docs/harness-operation.md`는 안 바꿉니다. | 관련 문구가 0건입니다(grep 확인). |
| PJ13 | `evaluate.mjs:220`의 prepared intent 조회는 helper로 바꾸지 않습니다. | 행동 변화가 없고 diff만 줄어듭니다. |
| PJ14 | RT4·RT5 테스트는 spec이 지정한 파일(`runtime-cooperative.test.mjs`)에 둡니다. 단, prepared intent fixture(`plannerStart`, `plannerPrepare`)가 `runtime-target-preparation.test.mjs`에만 있으면 그 파일에 같은 이름으로 둡니다. | 결과물과 테스트 이름은 같고, 두 파일 모두 allowedPaths에 있습니다. |
| PJ15 | `instruction-contracts.json`의 비보호 항목이 이번에 바뀐 정책 문장을 복사하고 있으면, 새 문장으로 갱신합니다(PI4). | fixture를 정책 원문과 맞추는 것이고, spec §5의 6단계와 같은 성격입니다. |
| PJ16 | 기존 런타임 테스트가 "Bounded intent의 {spec,plan}을 allow"로 직접 기대하고 있으면 hold로 바꿉니다. spec이 들어간 흐름을 검증하는 준비 fixture(`runtime-target-preparation.integration.test.mjs` 포함)는 depth를 Architectural로 바꿔 흐름 검증을 유지하고, spec이 필요 없는 Bounded fixture는 plan-only 세트를 씁니다(실행 중 개정 2026-11-26). | RT1/G1의 직접 결과입니다. AC10e의 "기존 테스트 그대로 통과"는 Architectural/legacy `{spec,plan}` 시나리오를 가리킵니다. |

## 확인 항목 배치

| 항목 | 배치 | 해결 방법 / 현재 상태 |
|---|---|---|
| I1 renderingBaseline | T1·T2·T3 단계 6 | `node --test tests/node/plan.test.mjs`의 `assert.equal(digest, renderingBaseline[key])` 실패 출력에 나온 actual 값 8개로 갱신합니다. 한 번 더 실행해 같은 값인지(결정적인지) 확인합니다. |
| I2 protected 해시 | T1·T2·T3 단계 6 | protected 대상 중 바뀌는 파일: T1·T3은 `lib/policy/role-policy.json`, `shared/skill/runtime/role-policy.json`. T2는 lib와 shared의 `evaluate.mjs`, `schema.mjs`, `gate.mjs`(6개). 값은 `shasum -a 256 <file>`의 hex입니다(접두사 없음, 기존 형식). |
| I3 | 해결됨 | — |
| I4 범위 밖 플랫폼 차이 | T1·T3 단계 3 | 교체 전에 4개 플랫폼의 대상 문장이 바이트까지 같은지 grep으로 확인합니다. 다르면 hold하고 Orchestrator에게 보고합니다. |
| I5 | T2 (PJ11) | 해결됨 |
| I6 reason assert | T2 | 해결됨: `tests/node/runtime-*.test.mjs`에 바뀌는 reason 문자열을 assert하는 곳이 0건입니다(grep). T2 단계 2에서 다시 확인합니다. |
| I7 fragments 생성물 | T1·T3 | 해결됨: 저장소의 `*/agents/arc-planner.*`에는 fragment 확장 문구가 없습니다(grep 0건). 반영되는 곳은 renderingBaseline과 installed-layout golden입니다. |
| I8·I11 현재 문구와 어긋난 Python assert | T1 단계 2, T3 단계 2 | 각 task 시작 전에 base 결과를 기록합니다(`.git/arc/base`). 이번에 바뀌는 문구에 걸리는 assert만 새 문구에 맞춥니다. |
| I9 기존 직접 테스트 | T2 | 해결됨: 91행과 174행을 직접 검사하는 테스트는 없습니다(Scouter). 새 테스트 9·10·17·18이 맡습니다. |
| I10 바이트 일치 | T3 단계 3 | 교체 전 grep으로 확인합니다. 다르면 hold합니다. |
| I12 gemini/grok 관리 구간 | T3 | `DesignConversationPolicyTests`가 4개 플랫폼 `planning.md` 관리 구간에서 RP2/RP3를 검사합니다. |
| PI1 (신규) runtime-versions | T1·T3 단계 6 | T1·T3에서 `tests/node/runtime-versions.test.mjs`를 실행합니다. `baselineHash` 실패가 role-policy 사본 때문이면 PJ10에 따라 갱신합니다. T2는 런타임 바이트가 바뀌므로 반드시 갱신합니다. |
| PI2 (신규) installer-parity | 각 task 단계 6 | `node scripts/check-installer-parity.mjs`. 실패하면 `tests/installer-parity.json`의 coverage mapping 중 깨진 항목만 갱신합니다. inventory 해시는 안 바꿉니다. |
| PI3 (신규) cooperative-schema | 해결됨 | Orchestrator 확인: `lib/runtime/cooperative-schema.mjs:67`은 `validateTargetPreparationRecord('destination',document)`에 위임합니다. 따라서 `cooperative-schema.mjs`는 안 바꿉니다(RT2 변경이 자동 반영됨). |
| PI4 (신규) instruction-contracts 비보호 항목 | T1·T3 단계 6 | `node --test tests/node/instruction-layout.test.mjs` 실패가 바뀐 문장 때문이면 PJ15를 적용합니다. |

## Task 순서와 의존성

```
[결합 승인] → [planning-document 커밋(Orchestrator)] → T1 → T2 → T3 → final Tester(mode: final) → 최종 Reviewer
```

- T1은 결합 승인과 planning-document 커밋을 선행으로 요구합니다(§3.1.1-7, R6).
- T2의 선행은 T1 커밋입니다. 내용상 의존은 없지만 `MANIFEST.sha256`, golden, renderingBaseline, instruction-contracts를 함께 건드리므로 순차로 진행합니다.
- T3의 선행은 T2 커밋입니다. `#architectural-combined-approval` anchor(T1)와 같은 공유 fixture를 쓰기 때문입니다.

---

### Task T1: G1/G2 정책 — Bounded spec 제거, Architectural 결합 승인

**목표:** spec §3.1 P1–P19, §3.1.1(PJ1의 링크 처리 포함), §3.1.2, §3.2 H1–H4, §3.3, §3.4 RP1, §3.5 F1–F3을 4개 플랫폼과 생성 구간에 반영합니다. 관련 테스트와 fixture도 갱신합니다.

**Files (allowedPaths, 정확히 이 목록):**
- 수정(손):
  - `claude/skill/references/planning.md`
  - `codex/skill/references/planning.md`
  - `gemini/skill/references/planning.md`
  - `grok/skill/references/planning.md`
  - `claude/skill/references/handoff-prep.md`
  - `codex/skill/references/handoff-prep.md`
  - `gemini/skill/references/handoff-prep.md`
  - `grok/skill/references/handoff-prep.md`
  - `claude/skill/references/handoff.md`
  - `codex/skill/references/handoff.md`
  - `gemini/skill/references/handoff.md`
  - `grok/skill/references/handoff.md`
  - `lib/policy/role-policy.json` (431행 `planning.planner-brief` text, RP1)
  - `lib/prompts/agent-fragments.json` (50행 F1, 70행 F2·F3)
- 재생성:
  - 위 4개 `planning.md`의 관리 구간(`npm run update:role-policy`)
  - `shared/skill/runtime/role-policy.json`(`node scripts/update-runtime-assets.mjs`)
- 테스트 수정:
  - `tests/node/instruction-layout.test.mjs` (126)
  - `tests/node/run-mode-contract.test.mjs` (28, 68)
  - `tests/test_harness_contract.py` (40, 167, 169, 367, 532, 549)
  - `tests/test_arc_policy.py` (161, 223, 245, 467, 664, 680–690, 696, 707, 724, 739, 740, 1522, 1551, 1590, 새 class)
  - `tests/test_claude_payload.py` (530, 718, 745, 784)
  - `tests/node/agent-fragments.test.mjs` (새 test)
- fixture 갱신:
  - `tests/node/fixtures/installed-layout-golden.json`
  - `tests/node/plan.test.mjs` (renderingBaseline)
  - `tests/node/fixtures/instruction-contracts.json`
  - `tests/installer-parity.json` (PI2)
  - `tests/node/runtime-versions.test.mjs` (PI1)
  - `MANIFEST.sha256`

**Interfaces:**
- Consumes: 없음(base 313b0d03)
- Produces:
  - anchor `architectural-combined-approval`(`planning.md`, T3의 §3.1.4-5가 참조)
  - §3.1.1 2항과 5항의 링크 없는 표기(T3가 링크로 바꿈)
  - F3 문장(T3의 F6이 "above"의 대상이 됨)
  - `SpecPlanApprovalMergeTests` class(T3가 2·5항 검사를 strict link로 확장)

**spec 매핑:** G1, G2, P1–P19, §3.1.1(R0–R6), §3.1.2(R8), H1–H4, §3.3, RP1, F1–F3, §5 1–8단계, §6.1의 해당 행, §6.2의 G1/G2 테스트

- [x] **Step 1: 기준선 기록.** base worktree `.git/arc/base`(313b0d03, `build/native` symlink)에서 아래 Step 5의 검증 명령을 실행하고 기존 실패 목록을 기록합니다(I8·I11).

- [x] **Step 2: 실패 테스트 작성.**
  - (a) 기존 assert를 spec 문구로 바꿉니다.
    - `instruction-layout.test.mjs:126`: H3의 새 69행 문장으로 바꿉니다.
    - `run-mode-contract.test.mjs:28`: `planningSection`의 해당 행을 P18 `| Architectural spec+plan combined approval | auto | Only with zero open decisions; otherwise user |`로 바꿉니다. P19 행과 Full Auto 절의 나머지는 그대로 둡니다(SJ3).
    - `test_harness_contract.py`, `test_arc_policy.py`, `test_claude_payload.py`의 해당 행: spec §6.1 표대로 바꿉니다. order는 P12, R8 문단, P4 재평가, P11 기준입니다. `a required plan does not itself require a written spec` 계열은 그대로 둡니다.
  - (b) `tests/test_arc_policy.py`에 새 class `SpecPlanApprovalMergeTests`를 만듭니다. `PLATFORMS = ("claude","codex","gemini","grok")`를 반복합니다.
    - `test_combined_approval_rules_present_on_every_platform`: `planning.md`에 다음이 모두 있어야 합니다.
      - P1, P2, P4, P3의 새 문장 3개, P14, P15, P19 원문(AC1b)
      - `<a id="architectural-combined-approval"></a>`와 `## Architectural combined approval`
      - §3.1.1 1·3·4·6·7항의 spec 원문
      - 2항: 정규식 `attaching the author judgments made since design approval \((?:\[decision inventory\]\(#decision-inventory\)|decision inventory)\)`
      - 5항: 정규식 `classified under (?:\[question classification\]\(#decision-inventory\)|question classification)`
      - §3.1.2 R8 문단 원문, P18 행 원문
    - `test_combined_approval_text_identical_across_platforms`: 4개 플랫폼에서 위 문자열의 추출 결과가 서로 같아야 합니다(AC2, §3.6).
    - `test_removed_spec_approval_wording_absent`: §7.2 G1/G2 13개 문자열이 4개 플랫폼 `skill/**/*.md`, `lib/policy/role-policy.json`, `lib/prompts/agent-fragments.json`에서 0건이어야 합니다(AC1a).
    - `test_planner_brief_rp1_in_managed_section`: RP1 "넣을 문장"이 4개 `planning.md`에 정확히 1회 있어야 합니다.
    - `test_handoff_prep_applicable_approvals`: H1–H4 원문이 4개 `handoff-prep.md`에 있어야 합니다.
    - `test_handoff_cooperative_plan_mode_wording`: §3.3의 새 문구 4개가 4개 `handoff.md`에 있고, `Applicable design/spec/plan approvals/artifacts or valid omissions`(34행)가 남아 있어야 합니다.
  - (c) `tests/node/agent-fragments.test.mjs`에 `rendered planner profiles require a reviewed spec and one combined approval`를 추가합니다.
    - `registry.targets`에서 `{claude,gemini,grok}/agents/arc-planner.md`와 `codex/agents/arc-planner.toml`을 `renderAgentProfile(target.path, source, registry)`로 렌더합니다.
    - F1, F2(변경 부분), F3 원문이 `includes`되어야 합니다.
    - `Required written-spec approval precedes`, `obtains written-spec approval`, `After written-spec approval`은 없어야 합니다.

- [x] **Step 3: 실패 확인.**
  - 명령: `python3 -m unittest discover -s tests -p 'test_arc_policy.py'`, `node --test tests/node/agent-fragments.test.mjs tests/node/instruction-layout.test.mjs tests/node/run-mode-contract.test.mjs`
  - 기대: 새 test와 변경 assert가 FAIL하고, 그 밖에는 기준선과 같습니다.

- [x] **Step 4: 구현.**
  - I4 확인: 4개 플랫폼의 대상 문장이 바이트까지 같은지 확인합니다. 다르면 hold합니다.
  - `planning.md` 4개(관리 구간 밖):
    - P1–P17을 spec 표의 위치에 적용합니다(C/Gm/Gr 행 기준, Codex는 표의 Cd 행).
    - P5는 기존 C/Gm/Gr 60행 뒤(Codex는 같은 문맥 위치)에 §3.1.1 절로 넣습니다. 2·5항은 PJ1의 링크 없는 형태로 씁니다.
    - P16 마지막 문장은 §3.1.2 문단으로 바꿉니다.
    - P18은 Full Auto 표에서 바꿉니다.
  - `handoff-prep.md` 4개: H1–H4. `handoff.md` 4개: §3.3의 170/193/195/205행.
  - `role-policy.json`: RP1(지울 문장 → 넣을 문장).
  - `agent-fragments.json`: F1, F2, F3. "바꾸지 않는 문장"(spec §3.5 끝)은 그대로 둡니다.

- [x] **Step 5: 생성·동기화(§5).**
  - `npm run update:role-policy`, 이어서 `npm run check:role-policy` (PASS)
  - `node scripts/update-runtime-assets.mjs`, 이어서 `node scripts/update-runtime-assets.mjs --check` (PASS)

- [x] **Step 6: fixture 갱신.**
  - `node tests/node/fixtures/installed-layout.mjs --write`, 이어서 `--diff` (차이 없음)
  - renderingBaseline 8개를 I1 방법으로 갱신합니다.
  - instruction-contracts protected 2개(`lib/policy/role-policy.json`, `shared/skill/runtime/role-policy.json`)를 I2 방법으로 갱신하고, PI4를 적용합니다.
  - PI1: `node --test tests/node/runtime-versions.test.mjs`
  - PI2: `node scripts/check-installer-parity.mjs` (PASS)
  - `node scripts/update-manifest.mjs`, 이어서 `npm run check:manifest` (PASS)

- [x] **Step 7: task-level 검증(fresh Tester).**
  - `python3 -m unittest discover -s tests -p 'test_arc_policy.py'`
  - `python3 -m unittest discover -s tests -p 'test_harness_contract.py'`
  - `python3 -m unittest discover -s tests -p 'test_claude_payload.py'`
  - `node --test tests/node/agent-fragments.test.mjs tests/node/instruction-layout.test.mjs tests/node/run-mode-contract.test.mjs tests/node/role-policy.test.mjs tests/node/plan.test.mjs tests/node/runtime-versions.test.mjs tests/node/manifest.test.mjs tests/node/package.test.mjs`
  - check 스크립트 5개: `check:role-policy`, `update-runtime-assets --check`, `installed-layout --diff`, `check-installer-parity`, `check:manifest`
  - 기대: 새·변경 테스트가 PASS하고 기준선 대비 새 실패가 없습니다. 의심 건은 단독 재실행합니다.

- [x] **Step 8: Orchestrator 수용 후 커밋.** 메시지 예: `chore(policy): Bounded spec 단계를 없애고 Architectural spec·plan 결합 승인을 도입`

**관련 테스트와 이유:**
- `test_arc_policy.py`, `test_harness_contract.py`, `test_claude_payload.py`: 바뀐 정책 문구를 직접 검사합니다.
- `instruction-layout`: H3, 그리고 protected·비보호 fixture를 검사합니다.
- `run-mode-contract`: P18과 Full Auto 절을 정확히 비교합니다.
- `agent-fragments`: F1–F3을 검사합니다.
- `role-policy.test.mjs`: 306·310 회귀를 확인합니다.
- `plan.test.mjs`, `manifest.test.mjs`, `package.test.mjs`, `runtime-versions`: 생성물과 해시에 영향을 받습니다.

**진행 기록 (2026-11-26):** Implementer(bridge 543263c8) 완료, fresh Tester(2d97ac3a, mode: task) 새 실패 0·check 5개 통과·AC 판정 proven(AC9는 check:role-policy·update-runtime-assets --check 통과로 Orchestrator가 proven 처리). 범위 내 추가: `tests/node/fixtures/instruction-contracts.json` `agentProfileBaseline`의 Planner 프로필 4개 digest 갱신(F1–F3 직접 결과).

**수용 기준:** AC1a, AC1b, AC2, AC3a, AC3b, AC3c, AC4, AC5(T1 부분, 링크 연결은 T3), AC6, AC7, AC8, AC9(T1 부분), AC11a(T1 갱신분)

**Hold:**
- 결합 승인 또는 planning-document 커밋이 없을 때
- I4 차이가 있을 때
- 생성기 check가 실패할 때
- 기준선에 없는 새 실패가 있을 때
- 바뀐 문구가 §6.1 목록 밖의 assert를 깨뜨릴 때(Orchestrator에게 보고합니다)

---

### Task T2: 런타임 RT1–RT9

**목표:** spec §4의 RT1–RT9를 구현합니다. §4.6의 hold와 §4.8의 ledger는 유지합니다.

**배정 전 hold:** 없음. OD1은 spec RT2의 결합 승인 destination 항목으로 해결했고, PI3은 "안 바꾼다"로 확인했습니다(Orchestrator 리뷰).

**Files (allowedPaths, 정확히 이 목록):**
- 수정:
  - `lib/runtime/schema.mjs`
  - `lib/runtime/target-preparation.mjs`
  - `lib/runtime/evaluate.mjs`
  - `lib/runtime/cooperative.mjs`
  - `lib/runtime/assignment.mjs`
  - `lib/runtime/gate.mjs`
  - `lib/runtime/verification.mjs`
- 재생성:
  - `shared/skill/runtime/schema.mjs`
  - `shared/skill/runtime/target-preparation.mjs`
  - `shared/skill/runtime/evaluate.mjs`
  - `shared/skill/runtime/cooperative.mjs`
  - `shared/skill/runtime/assignment.mjs`
  - `shared/skill/runtime/gate.mjs`
  - `shared/skill/runtime/verification.mjs`
- 테스트:
  - `tests/node/runtime-target-preparation.test.mjs`
  - `tests/node/runtime-target-preparation.integration.test.mjs` (PJ16, 실행 중 개정 2026-11-26)
  - `tests/node/runtime-cooperative.test.mjs`
  - `tests/node/runtime-assignment.test.mjs`
  - `tests/node/runtime-evaluate.test.mjs`
  - `tests/node/runtime-gate.test.mjs`
- fixture:
  - `tests/node/runtime-versions.test.mjs`
  - `tests/node/fixtures/instruction-contracts.json`
  - `tests/node/fixtures/installed-layout-golden.json`
  - `tests/node/plan.test.mjs`
  - `tests/installer-parity.json`
  - `MANIFEST.sha256`

**Interfaces:**
- Consumes: 없음(정책 문구에는 의존하지 않음)
- Produces (`lib/runtime/schema.mjs` export, PJ2):
  - `planningDocumentKinds(depth: 'Architectural'|'Bounded'|undefined) -> string[]`: `'Bounded'`이면 `['plan']`, 그 밖에는 `['plan','spec']`(정렬됨)
  - `hasExactPlanningKinds(documents: unknown, kinds: string[]) -> boolean`: 배열이고, 길이가 `kinds.length`와 같고, kind 정렬 결과가 `kinds`와 같아야 true
  - `preparedTargetIntent(state) -> object|undefined`: `state.targetIntents?.find(i=>state.targetTransitions?.some(t=>t.intentId===i.id&&t.targetVersion===state.targetVersion))`
  - `expectedCooperativePlanningKinds(state) -> string[]`: prepared intent가 있으면 그 `documents` kind의 정렬된 고유 목록, 없으면 `['plan','spec']`
  - native state의 optional 필드 `planningDepth: 'Architectural'|'Bounded'`
  - cooperative evidence `reviewedSpec: {path: string, hash: string|undefined}` (PJ3)

**spec 매핑:** G3, RT1–RT9, §4.6, §4.7(새 게이트 없음), §4.8, §5 2·4–8단계, §6.1 런타임 행, §6.2 런타임 테스트, §9

- [x] **Step 1: 기준선 기록.** base worktree에서 `node --test tests/node/runtime-*.test.mjs`를 실행하고 결과를 기록합니다. I6를 다시 확인합니다: `rg -n "Only the complete spec and plan|approved complete spec and plan required|Approved spec prerequisite|Complete exact approved spec and plan set" tests` 결과가 0건이어야 합니다.

- [x] **Step 2: 실패 테스트 작성.** 모든 assert는 `decision`과, 해당하면 `reason`의 정확한 문자열을 검사합니다. 파일 위치는 PJ14를 따릅니다.

  `runtime-target-preparation.test.mjs`:
  1. `bounded intent with a spec document is held`
     - `depth:'Bounded'`, documents `[{kind:'spec',path:'spec.md'},{kind:'plan',path:'plan.md'}]` → `hold`, reason `'Bounded depth has no spec stage'`
     - `[{kind:'spec',path:'spec.md'}]`만 있어도 같은 결과
     - Bounded `[{kind:'plan'}]` → `allow`(164행 회귀)
  2. `architectural spec destination may omit approvalRef with a full review`
     - 362 흐름에서 리뷰까지 진행한 뒤, `approvalRef` 없는 destination → `allow`
     - `after.targetDocuments[0].reviewRef==='review:destination'`, `'approvalRef' in after.targetDocuments[0] === false`
     - `validateTargetPreparationRecord('destination',{...request,approvalRef:''})`는 throw
  3. `bounded plan destination without approvalRef is held` → `hold`, reason `'Document approval required for this destination'`. Architectural plan destination에 approvalRef가 없어도 같은 hold입니다. 추가 assert(RT2 결합 승인 항목, 실행 중 개정 2026-11-26): approvalRef가 결합 승인 record(`data.documents`)를 가리키고 spec 항목의 kind·path·contentHash가 일치하면 Architectural spec destination은 `allow`, contentHash가 다르면 `hold`. Architectural plan destination은 approvalRef가 결합 승인을 가리켜도 첫 stage가 아니므로 `hold`(reason `'Current transition, source attestation and observed destination bytes required'`).
  4. `architectural plan stage registers with a saved reviewed spec and no spec approval`
     - spec destination(approvalRef 없음) 뒤에 `approval {plannerStage:plan, prerequisiteRefs:['review:destination']}` → `planner-stage` `allow`
     - state에 `kind:'approval'`이면서 `data.kind==='spec'`인 record가 0개
  5. `architectural plan stage holds when reviewed spec bytes changed or review is incomplete`
     - (a) destination 뒤 `spec.md`에 `'changed'`를 쓰면 → `hold`, `'Reviewed spec bytes changed'`
     - (b) `prerequisiteRefs:['unrelated:review']` → `hold`, `'Reviewed spec prerequisite is required for plan drafting'`
     - (c) scope 변경 뒤 → `hold`(기존 405–406 assert 유지)
  6. `legacy approved spec still satisfies the plan prerequisite`: 기존 362 흐름(spec 승인 → destination에 approvalRef 있음 → `prerequisiteRefs:['approval:destination']`) → `allow`
  - 기존 362: PJ8대로 바꿉니다. 결합 승인 `{documents:[{kind:'spec',path:<abs spec>,contentHash:hash},{kind:'plan',path:<abs plan>,contentHash:planHash}]}` → `allow`

  `runtime-cooperative.test.mjs`:
  7. `combined approval verifies reviewed current bytes for every document`
     - 전체 세트 → `allow`
     - plan.md를 리뷰 뒤 변경하고 다시 승인하면 → `hold`, `'Current reviewed bytes required for every approved document'`
     - `actor.role!=='orchestrator'` → `hold`
  8. `combined approval with a partial document set is held`
     - Architectural intent에 `{documents:[plan]}` → `hold`, 같은 reason
     - transition 전 `{documents:[spec,plan]}` → `hold`, `'Prepared target transition required before document records'`(PJ5)
  9. `readiness resolves for a bounded plan-only approval`: Bounded prepared intent, approval `data.documents=[plan]`, docs commit 관찰 일치 → scope-changed marker `resolvedBy` 설정, proof의 `documents.length===1`
  10. `readiness holds an architectural plan-only approval` → marker 미해결
  - 205: PJ7대로 assert 1개를 추가합니다.

  `runtime-assignment.test.mjs`:
  11. `bounded plan-only committed set is assignable` → `allow`, `ruleIds` `['cooperative.assignment-prepared']`
  12. `architectural intent with plan-only set is held` → `hold`, `ruleIds` `['cooperative.documents']`
  13. `bounded intent with spec and plan set is held` → `hold`, `['cooperative.documents']`

  `runtime-evaluate.test.mjs`:
  14. `first Implementer accepts bounded plan-only set when planningDepth is Bounded`: 82행 fixture에 `planningDepth:'Bounded'`, documents `[plan]` → 다음 게이트까지 통과하고, 완전한 증거로 `allow`
  15. `missing planningDepth keeps requiring spec and plan`: 필드 없이 plan-only이거나 `'Architectural'` plan-only → `hold`, `'approved complete planning-document set required'`
  16. `documents commit accepts bounded plan-only set`: Bounded `[plan]` → `allow`. Bounded `{spec,plan}` → `hold`, `'exact approved documents required'`
  17. `plan Planner assignment accepts a ready reviewed spec stage without spec approval`
     - 같은 workflow의 spec stage(`ready:true`, `review.full/complete:true`, 같은 `scopeVersion`) → 91행 통과
     - `scopeVersion`이 다르거나 `ready:false`이면 → `hold`, `'Reviewed spec prerequisite required'`
  18. `bounded spec Planner stage is held`: `planningDepth:'Bounded'`, spec stage → `hold`, `'Bounded depth has no spec stage'`
  19. `invalid planningDepth value is rejected`: `validateWorkflowState({...valid, planningDepth:'bounded'})` throw. 필드가 없으면 통과(Review Focus 4)

  `runtime-gate.test.mjs`:
  20. `docs-only preflight allows the bounded plan-only set` → `allow`
  21. `docs-only preflight holds architectural plan-only set`: `'Architectural'`이거나 필드 없음 + `[plan]` → `hold`, `'Complete exact approved planning-document set required'`. Bounded `{spec,plan}`도 hold
  - 기존 82/153/171행, gate 22/31행, assignment 16–18/24/129/160행, cooperative 180/239행은 그대로 둡니다. PJ16에 해당하는 assert만 hold로 바꿉니다.

- [x] **Step 3: 실패 확인.** `node --test tests/node/runtime-target-preparation.test.mjs tests/node/runtime-cooperative.test.mjs tests/node/runtime-assignment.test.mjs tests/node/runtime-evaluate.test.mjs tests/node/runtime-gate.test.mjs` → 새 테스트 FAIL, 기존 테스트는 기준선과 같음

- [x] **Step 4: 구현.**
  - `schema.mjs`: 45행(mode 검사) 뒤에 `if(s.planningDepth!==undefined&&!['Architectural','Bounded'].includes(s.planningDepth))fail('planning depth');`를 넣습니다(RT7). Interfaces의 helper 4개는 `validateWorkflowState` 닫는 괄호와 `validateRequest` 사이에 둡니다. 87행 이후는 수정하지 않습니다.
  - `target-preparation.mjs`:
    - 52행(RT1): Bounded + spec이면 `hold('Bounded depth has no spec stage')`를 기존 조건 앞에 둡니다.
    - 41행(RT2): `approvalRef`는 `data.approvalRef!==undefined&&!text(data.approvalRef)`일 때만 오류로 처리합니다.
    - 74행(RT2): approvalRef가 없고 `!(intent.depth==='Architectural'&&document.kind==='spec')`이면 `hold('Document approval required for this destination')`. approvalRef가 단일 kind 승인을 가리키면 기존 approval 검증을 유지하고, 결합 승인(`data.documents`)을 가리키면 spec §4.2의 항목 일치 검증을 합니다. 리뷰·criteria·바이트 검증은 모든 경우에 유지합니다.
  - `evaluate.mjs`:
    - 71행(RT8): `!hasExactPlanningKinds(state.documents,planningDocumentKinds(state.planningDepth))` → reason `'approved complete planning-document set required'`
    - 90행 뒤(RT9): Bounded spec stage hold. 91행은 `stage.document.kind==='plan'&&state.planningDepth!=='Bounded'&&!reviewedSpecStage&&!approvedSpec`이면 `'Reviewed spec prerequisite required'`. `reviewedSpecStage`는 PJ11 조건으로 판단합니다.
    - 111행(RT8): length·kind 조건을 helper로 바꿉니다.
    - 225–226행(RT3): `approvedSpec`을 `reviewedSpec`으로 바꿉니다. prepared intent가 있으면 spec §4.3의 1–3번 조건을 만족해야 하고, 실패하면 `'Reviewed spec prerequisite is required for plan drafting'`입니다. 4번 조건은 `evidence.reviewedSpec?.hash!==e.hash`이면 `'Reviewed spec bytes changed'`입니다. intent가 없으면 기존 식을 유지합니다.
    - `evaluatePlannerCall`(157–190행)은 건드리지 않습니다.
  - `cooperative.mjs`:
    - 63행 앞(RT3-4): `record`, `planner-stage`, `data.document.kind==='plan'`, prepared intent에 spec이 있을 때 `readTargetPreparationEvidence`로 spec을 관찰하고, 결과를 `reviewedSpec`으로 evidence에 넣습니다. 읽기에 실패하면 hash는 `undefined`입니다.
    - 73행: PJ5를 적용합니다.
    - 83행 뒤(RT4): `Array.isArray(data.documents)`이고 `preparedTargetIntent(state)`가 있으면 kind·경로 세트(PJ6), 문서별 리뷰(77–79행 방식), 문서별 현재 바이트, actor, target, versions를 확인합니다. 실패하면 `'Current reviewed bytes required for every approved document'`로 hold합니다.
    - 174행(RT5): `!hasExactPlanningKinds(documents,expectedCooperativePlanningKinds(state))`
  - `assignment.mjs`: `./schema.mjs`에서 helper를 import합니다. 26행(RT6)의 `documents.length!==2||!setEqual(…['spec','plan'])`과 `git.documents.length!==2`를 `kinds=expectedCooperativePlanningKinds(state)` 기준으로 바꿉니다. 28행은 그대로 둡니다.
  - `gate.mjs`: `./schema.mjs`에서 import합니다. 36행(RT8) 조건과 reason을 `'Complete exact approved planning-document set required'`로 바꿉니다. 37–40행은 그대로 둡니다.
  - `verification.mjs`: 70행 reason만 `'Only the plan path is supported'`로 바꿉니다.

- [x] **Step 5: 생성.** `node scripts/update-runtime-assets.mjs`, 이어서 `--check` (PASS)

- [x] **Step 6: fixture 갱신.**
  - `runtime-versions.test.mjs`: `baselineHash`를 실패 출력의 실제 값으로 갱신합니다(PJ10).
  - instruction-contracts protected 6개: lib와 shared의 `evaluate.mjs`, `schema.mjs`, `gate.mjs`(I2)
  - golden `--write`/`--diff`, renderingBaseline(I1), PI2
  - `node scripts/update-manifest.mjs`, 이어서 `npm run check:manifest`

- [x] **Step 7: task-level 검증(fresh Tester).**
  - `node --test tests/node/runtime-target-preparation.test.mjs tests/node/runtime-cooperative.test.mjs tests/node/runtime-assignment.test.mjs tests/node/runtime-evaluate.test.mjs tests/node/runtime-gate.test.mjs tests/node/runtime-target-preparation.integration.test.mjs tests/node/runtime-git.integration.test.mjs tests/node/runtime-versions.test.mjs tests/node/instruction-layout.test.mjs tests/node/plan.test.mjs tests/node/manifest.test.mjs`
  - check 스크립트: `update-runtime-assets --check`, `installed-layout --diff`, `check-installer-parity`, `check:manifest`
  - AC16 중간 확인: `git diff -U0 313b0d033df744760978335c38e2b7b334760045 -- lib/runtime/evaluate.mjs lib/runtime/schema.mjs`의 hunk 구간(old range)이 `evaluate.mjs` 157–190행과 `schema.mjs`의 `validatePlannerStage` 구간(87행부터 함수 끝까지)과 겹치지 않아야 합니다.
  - 기대: 21개 새 테스트 PASS, 기준선 대비 새 실패 없음

- [x] **Step 8: Orchestrator 수용 후 커밋.** 메시지 예: `feat(runtime): 리뷰된 spec 전제·결합 승인·Bounded plan-only 게이트 지원`

**관련 테스트와 이유:**
- `runtime-*` 5개 파일: RT1–RT9의 직접 검사입니다.
- `integration` 2개: 실제 Git과 prepared intent 흐름의 회귀입니다(`prerequisiteRefs:['spec-approval']` 하위 호환 경로).
- `runtime-versions`, `instruction-layout`, `plan`, `manifest`: 런타임 바이트 해시에 영향을 받습니다.

**수용 기준:** AC10a, AC10b, AC10c, AC10d, AC10e, AC16, AC9(runtime-assets 부분), AC11a(T2 갱신분)

**Hold:**
- §4.6 유지 원칙을 깨는 변경이 필요할 때
- §4.6의 hold 회귀가 있을 때
- AC16 hunk가 겹칠 때
- integration 테스트에서 새 실패가 나올 때
- 기존 `{spec,plan}` 테스트가 PJ16 외의 이유로 깨질 때

**진행 기록 (2026-11-26):** Implementer(bridge 6d3ecabc, segment 2개) 완료. 1차 segment의 RT2 plan destination hold는 spec v3·plan v2 개정(R8 결합 수정 승인 2026-11-26T02:12:42Z)으로 해결했다. PJ16 integration fixture는 별도 Implementer(bridge 658108f9)가 고쳤다(3/3, base 3/3). fresh Tester(8ef2aa3e, mode: task): 새 실패 0, check 4개 통과, AC10a–d·AC11a·AC9·AC16 proven. AC10e는 diff상 §4.6 유지 확인. `runtime-git.integration.test.mjs:97` 1건이 base와 작업 트리에서 같은 assert로 실패해 기준선 실패로 분류했고, final Tester가 다시 판정한다.

---

### Task T3: G4/G5 정책 — design 대화, 결정 inventory, 질문 분류

**목표:** 다음을 반영합니다.
- spec §3.1 P20–P25(§3.1.3, §3.1.4), §3.7 C1, §3.4 RP2–RP3, §3.5 F4–F6, SJ6
- PJ1에 따른 §3.1.1 2·5항 링크 연결
- 관련 테스트와 fixture

**Files (allowedPaths):**
- 수정(손):
  - `claude/skill/references/planning.md`
  - `codex/skill/references/planning.md`
  - `gemini/skill/references/planning.md`
  - `grok/skill/references/planning.md`
  - `claude/skill/references/coordination.md`
  - `codex/skill/references/coordination.md`
  - `gemini/skill/references/coordination.md`
  - `grok/skill/references/coordination.md`
  - `lib/policy/role-policy.json` (RP2, RP3, SJ6)
  - `lib/prompts/agent-fragments.json` (70행 F4, F5, F6)
- 재생성:
  - 4개 `planning.md` 관리 구간
  - `shared/skill/runtime/role-policy.json`
- 테스트:
  - `tests/node/role-policy.test.mjs` (302, 305)
  - `tests/node/agent-fragments.test.mjs`
  - `tests/test_arc_policy.py` (438, 새 class, T1 class의 2·5항 strict 검사)
  - `tests/test_harness_contract.py` (451)
  - `tests/test_claude_payload.py` (435)
- fixture:
  - `tests/node/fixtures/installed-layout-golden.json`
  - `tests/node/plan.test.mjs`
  - `tests/node/fixtures/instruction-contracts.json`
  - `tests/installer-parity.json`
  - `tests/node/runtime-versions.test.mjs`
  - `MANIFEST.sha256`

**Interfaces:**
- Consumes (T1):
  - anchor `architectural-combined-approval`
  - §3.1.1 2·5항의 링크 없는 표기
  - F3 문장
  - `SpecPlanApprovalMergeTests`
- Produces:
  - anchor `design-conversation`, `decision-inventory`
  - `DesignConversationPolicyTests`

**spec 매핑:** G4, G5, P20–P25, §3.1.3, §3.1.4, C1a/C1b, RP2, RP3, F4–F6, SJ3–SJ11, SJ13, §6.1 G4/G5 행, §6.2 G4/G5 테스트

- [x] **Step 1: 기준선 기록.** I11: base에서 `test_arc_policy.py:439–442,464`, `test_claude_payload.py:436`, `test_harness_contract.py:123` 결과를 기록합니다.

- [x] **Step 2: 실패 테스트 작성.**
  - (a) 기존 assert 갱신:
    - `test_harness_contract.py:451`, `test_arc_policy.py:438`, `test_claude_payload.py:435`: 정규식을 `reviews the final design once with the fixed checklist.*one consolidated correction`으로 바꿉니다.
    - `role-policy.test.mjs:302`: 이름을 `design and brainstorming converse and keep one final-design correction`으로 바꿉니다.
    - `role-policy.test.mjs:305`: `/design and brainstorming.*design conversation.*final design/i`와 `/reviews the final design once with the fixed checklist.*one consolidated correction/i` 두 개로 바꿉니다.
    - 306·310행은 그대로 둡니다.
  - (b) `tests/test_arc_policy.py`에 새 class `DesignConversationPolicyTests`(4개 플랫폼)를 만듭니다.
    - `test_design_conversation_rules_present_on_every_platform` (AC12): 다음이 있어야 합니다.
      - `planning.md`에 P20, P21(a), P22, P23 원문, `<a id="design-conversation"></a>`, §3.1.3 1–8항 원문
      - `coordination.md`에 C1a, C1b 원문과 `planning.md#design-conversation`
      - `planning.md` 관리 구간에 RP2, RP3 원문(I12)
    - `test_decision_inventory_and_scope_notation_rules_present` (AC13): `<a id="decision-inventory"></a>`, §3.1.4 1–3항, P21(b) checklist 문구
    - `test_spec_plan_question_classification_and_attachments_present` (AC14):
      - §3.1.4 4·5항
      - §3.1.1 2항 strict `([decision inventory](#decision-inventory))`
      - 5항 strict `[question classification](#decision-inventory)`
    - `test_author_judgments_not_open_decisions_under_full_auto` (AC15): §3.1.4 6항과 §3.1.3 8항이 4개 플랫폼에서 바이트까지 같아야 합니다.
    - `test_design_stage_correction_wording_removed` (AC17): G4/G5 목록이 0건이어야 합니다. `review only`/`if needed`는 4개 `planning.md`의 §3.1.4 2항과 `agent-fragments.json`의 `Independently review only that scope`만 허용합니다.
    - `test_sj6_reviewed_spec_suffix`: SJ6 덧붙임 문구가 4개 `planning.md`(40행 문맥), 4개 `coordination.md`, 관리 구간에 있어야 합니다.
  - (c) `tests/node/agent-fragments.test.mjs`에 `rendered planner profiles carry design conversation inventory and question classification`를 추가합니다.
    - 4개 플랫폼 `arc-planner`에 F4 원문, F5, F6 bullet이 있어야 합니다.
    - `and focused questions`는 없어야 합니다.
    - F2 문장(`without a separate spec approval; a fresh plan Planner drafts next.`)이 F4 뒤 같은 bullet에 남아 있어야 합니다.

- [x] **Step 3: 실패 확인.** `python3 -m unittest discover -s tests -p 'test_arc_policy.py'`, `node --test tests/node/role-policy.test.mjs tests/node/agent-fragments.test.mjs` → 새·변경 테스트 FAIL

- [x] **Step 4: 구현.**
  - I10: 대상 문장이 4개 플랫폼에서 바이트까지 같은지 확인합니다. 다르면 hold합니다.
  - `planning.md`:
    - P20–P23 적용, 40행 SJ6 덧붙임
    - 44행(Cd 46) 문단 뒤에 §3.1.3, 그 뒤에 §3.1.4를 `###` 하위 절로 넣습니다(SJ4).
    - §3.1.1 2·5항을 spec 원문 링크로 바꿉니다(PJ1).
  - `coordination.md`: C1a, C1b, 92행(Cd 90) SJ6 덧붙임
  - `role-policy.json`: RP2, RP3, SJ6. inventory와 세 갈래 분류는 넣지 않습니다(SJ8).
  - `agent-fragments.json`: F4(3번째 bullet), F6(3번째 bullet 뒤 새 bullet, SJ11), F5(5번째 bullet)

- [x] **Step 5: 생성.** `npm run update:role-policy`, `npm run check:role-policy`, `node scripts/update-runtime-assets.mjs`, `--check` (모두 PASS)

- [x] **Step 6: fixture 갱신.** golden `--write`/`--diff`, renderingBaseline(I1), protected 2개(I2)와 PI4, PI1, PI2, `update-manifest`, `check:manifest`

- [x] **Step 7: task-level 검증(fresh Tester).**
  - T1 Step 7의 Python 3개와 Node 목록을 그대로 실행합니다(`role-policy.test.mjs`, `agent-fragments.test.mjs` 포함).
  - 회귀 확인: `role-policy.test.mjs:306,310`, `test_arc_policy.py:464`, `test_harness_contract.py:123`, `instruction-contracts.json:68,180` anchor
  - check 스크립트 5개
  - 기대: 기준선 대비 새 실패 없음

- [x] **Step 8: Orchestrator 수용 후 커밋.** 메시지 예: `chore(policy): design 단계 대화 방식과 결정 inventory·질문 분류 규칙 추가`

**관련 테스트와 이유:** T1과 같은 정책 문구 테스트입니다. 추가로 `role-policy.test.mjs`(RP2·RP3 원문 검사, 306·310 회귀)와 `agent-fragments`(F4–F6)를 봅니다.

**수용 기준:** AC5(링크 연결 완료), AC9, AC11a(T3 갱신분), AC12, AC13, AC14, AC15, AC17

**Hold:**
- T2가 커밋되지 않았을 때
- I10에 차이가 있을 때
- 생성기 check가 실패할 때
- 회귀 assert에서 새 실패가 나올 때
- AC17 grep에 허용 예외 외의 결과가 나올 때

**진행 기록 (2026-11-26):** Implementer(bridge 5b339076, segment 2개; 1차는 자기 편집 스크립트 IndexError로 중단, 같은 세션 resume으로 완료). fresh Tester(ff391f68, mode: task): 새 실패 0, check 5개 통과, §7.2 grep은 허용 예외만, AC5·AC11a·AC12–AC15·AC17 proven. AC9는 생성 실행 이력 미확인으로 unverified였으나 check:role-policy·update-runtime-assets --check 통과로 Orchestrator가 proven 처리(T1과 같은 근거).

---

## 최종 검증 (T1–T3 수용 후)

1. **§7.2 grep (AC1a, AC17).** 대상: `claude/skill codex/skill gemini/skill grok/skill lib/policy/role-policy.json lib/prompts/agent-fragments.json shared/skill/runtime/role-policy.json`
   - G1/G2: `rg -n -F -e 'spec-required Bounded' -e 'required Bounded spec' -e 'Required Bounded specs' -e 'records Bounded spec necessity' -e 'If Bounded requires written spec' -e 'written-spec approval before' -e 'sequential design/spec/plan approvals' -e 'Required written-spec approval precedes' -e 'obtains written-spec approval' -e 'After written-spec approval' -e 'ordered written-spec/dependent-plan' -e '| Written spec approval |' -e 'spec approval precedes dependent planning' <대상>` → 출력 없음
   - G4/G5: `rg -n -F -e 'a resend after a return without a draft uses the consolidated-correction opportunity' -e 'allow initial draft and one consolidated correction' -e 'allow the initial draft and one consolidated correction' <대상>`, `rg -n -F 'and focused questions' lib/prompts/agent-fragments.json` → 출력 없음
   - `rg -n -i -e 'review only' -e 'if needed' <대상>` → 4개 `planning.md`의 §3.1.4 2항 행과 `agent-fragments.json`의 Reviewer 행만 나와야 합니다.
2. **AC16:** T2 Step 7의 `git diff -U0` 확인을 최종 tip에서 다시 합니다.
3. **check 스크립트:** `npm run check:role-policy`, `node scripts/update-runtime-assets.mjs --check`, `node tests/node/fixtures/installed-layout.mjs --diff`, `node scripts/check-installer-parity.mjs`, `npm run check:manifest` → 모두 PASS
4. **final Tester (mode: final), full regression shard 2개:**
   - Node: `node --test tests/node`
   - Python: `python3 -m unittest discover -s tests -p 'test_*.py'`
   - 기준선은 `.git/arc/base`(313b0d03, `build/native` symlink)입니다. 새 실패만 판정하고, 의심 건은 단독 재실행합니다(AC11b).
   - 새 실패는 Implementer → Tester recheck로 처리하고, 끝난 뒤 최종 Reviewer로 넘어갑니다.
5. **최종 Reviewer (1회, 전체 변경 313b0d03..tip).**
   - 위험별 확인:
     - RT2/RT3/RT4 증거 사슬(리뷰·바이트·같은 승인)
     - legacy 호환(intent 없음, `planningDepth` 없음)
     - 4개 플랫폼 parity
     - 생성 구간을 손으로 고치지 않았는지
     - PJ1 링크 연결
   - Reviewer finding은 Implementer → Reviewer recheck로 처리합니다(Tester 재배정 없음). 수정은 하나의 follow-up commit으로 합칩니다.

**task 간 파일 겹침(재확인 대상):**
- T1·T3 모두: 4개 `planning.md`, `lib/policy/role-policy.json`, `lib/prompts/agent-fragments.json`, `shared/skill/runtime/role-policy.json`, `test_arc_policy.py`, `test_harness_contract.py`, `test_claude_payload.py`, `agent-fragments.test.mjs`
- T1·T2·T3 모두: `MANIFEST.sha256`, `installed-layout-golden.json`, `plan.test.mjs`, `instruction-contracts.json`, `installer-parity.json`, `runtime-versions.test.mjs`
- T3 수용 시에는 T1의 `SpecPlanApprovalMergeTests`가 계속 통과하는지 함께 확인합니다.

**잠정 trigger 판단:**
- significant/high-risk입니다(런타임 게이트 변경, 4개 플랫폼 정책, 해시 fixture 연쇄). 그래서 task마다 필수 fresh Tester, 최종 Tester(mode: final), 최종 Reviewer 1회를 둡니다.
- 대체 검사(모든 contract test와 check 스크립트):
  - 런타임 테스트 5개 파일과 integration 2개
  - 정책 테스트: `test_arc_policy.py`, `test_harness_contract.py`, `test_claude_payload.py`, `role-policy`, `agent-fragments`, `instruction-layout`, `run-mode-contract`
  - fixture 테스트: `plan`, `manifest`, `package`, `runtime-versions`
  - check 스크립트 5개
- 이유: 문구와 해시가 연쇄로 바뀌어 국소 검사만으로는 누락을 잡기 어렵기 때문입니다.

## spec ↔ plan 정합성 표

| spec 요구·AC | task / 검증 |
|---|---|
| G1, P3, P4, P7, P11, P14, AC1a/b, AC2 | T1 Step 2(b)·4, 최종 1 |
| G2, P1, P2, P5(§3.1.1 R0–R6), P6, P8–P10, P12, P13, P15, AC3a/b/c, AC4, AC5 | T1(AC5 링크는 T3) |
| P16, §3.1.2 R8, H4, AC8 | T1 |
| P17, H1–H3, AC6 | T1 |
| P18, P19, AC7, SJ2, SJ3 | T1(`run-mode-contract`) |
| §3.3 `handoff.md` | T1 |
| RP1, F1–F3 | T1 |
| G3, RT1–RT9, §4.6, AC10a–e | T2 |
| §4.7 | 안 바꿉니다(새 게이트 없음). T2의 기존 assignment/readiness 회귀로 확인 |
| §4.8, AC16 | T2 Step 7, 최종 2 |
| G4, P20, P21(a), P22–P24, C1, RP2, AC12, SJ5 | T3 |
| G5, P21(b), P25, §3.1.4, F4–F6, AC13–AC15, SJ8–SJ11 | T3 |
| SJ6 | T3 |
| SJ4, SJ7, SJ13 | T3(위치), T1·T3(안 바꾸는 문장은 그대로 둠) |
| §5 1–8단계, AC9, AC11a | T1·T2·T3 Step 5–6, 최종 3 |
| §6.1 각 행 | T1(G1/G2 행), T2(런타임 행), T3(305/438/435/451) |
| §6.1 회귀 목록 | T2(ledger 129/160/180/239, 171), T3(306/310/464/123, anchor 68/180) |
| §6.2 런타임 20개 | T2 테스트 1–18, 20–21(19는 Review Focus 추가분) |
| §6.2 G1/G2, G4/G5 정책 테스트 | T1 `SpecPlanApprovalMergeTests` + fragments, T3 `DesignConversationPolicyTests` + fragments |
| §7.2 | 최종 1 |
| AC11b | 최종 4 |
| §8 비범위 | 전역 제약(안 바꾸는 파일), 이 plan에는 해당 변경 없음 |
| §9 마이그레이션 | T2 테스트 6, 15, 205 회귀(legacy 호환) |
| §10 위험 | Review Focus, 최종 5 |
| I1–I12 | "확인 항목 배치" 표 |
| §12 anchor 순서 | PJ1 |

## Self-review

- [x] spec coverage: P1–P25, H1–H4, §3.3, RP1–RP3, F1–F6, C1, SJ6, RT1–RT9, AC1–AC17이 모두 task나 최종 검증에 대응합니다(정합성 표).
- [x] step scan: 각 단계는 정확한 파일, 문구 출처(spec 절), 명령, 기대 결과를 갖습니다. 문구 본문은 spec을 참조하고 복제하지 않았습니다.
- [x] 타입 일관성: helper 이름 4개와 `reviewedSpec`, `planningDepth`를 T2 Interfaces에서 정의했고, Step 4와 테스트에서 같은 이름을 씁니다.
- [x] Review Focus: 5개 항목마다 T2에 소유 테스트가 있습니다(5, 7, 8, 16/21, 19).
- [x] 비례: 문구는 spec을 참조하고, 테스트는 이름과 assert 값만 적었습니다.
- [x] 범위 표기: 모호한 범위 표현을 쓰지 않았습니다. PI3은 "안 바꾼다"로 확정했습니다.
- [x] anchor 순서 문제는 PJ1로 해결했고, 어느 중간 커밋에도 깨진 링크가 없습니다.
- [x] OD1은 spec RT2 결합 승인 항목으로, PI3은 위임 확인으로 해결했습니다(Orchestrator 리뷰).

## 개정 이력

| Version | Approval time | Classification | Affected tasks | Reason |
|---|---|---|---|---|
| v1 | 2026-11-26T01:38:25Z | initial | T1, T2, T3 | spec·plan 결합 승인 |
| v2 | 2026-11-26T02:12:42Z | contract | T2 | T2 테스트 3 assert를 spec v3 RT2에 맞춤; PJ16에 흐름 fixture의 Architectural 전환 추가와 `runtime-target-preparation.integration.test.mjs` 파일 추가 |
