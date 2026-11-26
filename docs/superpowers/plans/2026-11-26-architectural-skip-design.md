# Architectural design 단계 생략(착수 확인 1회로 대체) 구현 계획

> **실행 방식(ARC 적응):** Orchestrator가 task마다 Implementer(bridge)와 fresh Tester(bridge, `mode: task`)를 순서대로 배정합니다. 이 프로젝트는 significant/high-risk 경로입니다. 각 task는 Implementer → 필수 fresh Tester → Orchestrator 수용 → focused commit 1회로 끝납니다. 모든 task를 수용한 뒤 final Tester(bridge, `mode: final`)가 확인하고, 최종 Reviewer(native)가 전체 변경을 1회 리뷰합니다. Reviewer는 task 단위 게이트가 아닙니다. 단계는 체크박스(`- [ ]`)로 추적하며, 체크박스는 커밋 단위가 아닙니다. Orchestrator는 구현·테스트·config 파일을 직접 고치지 않습니다.

**Goal:** Architectural 경로에서 design 문서와 design 승인을 없애고 착수 확인(start confirmation) 1회로 대체합니다. 대화를 맡은 Planner가 이어서 spec을 쓰도록 하여 Planner 인스턴스를 3개에서 2개로 줄입니다. Bounded, Spike, direct path, 런타임은 바꾸지 않습니다.

**Architecture:** 정책 문구만 바뀝니다. 4개 플랫폼 reference(`planning.md` 편집 구간, `coordination.md`, `handoff.md`, `SKILL.md`)는 손으로 고칩니다. 원본 2개(`lib/policy/role-policy.json`, `lib/prompts/agent-fragments.json`)도 손으로 고친 뒤 생성기로 반영합니다. 반영 대상은 `planning.md` 관리 구간과 `shared/skill/runtime/role-policy.json`입니다. 이어서 해시·렌더 fixture(golden, renderingBaseline, instruction-contracts, MANIFEST)를 갱신합니다. 이 모든 변경은 서로 떼어 낼 수 없으므로 task 1개로 묶습니다(PJ1).

**Tech Stack:** Markdown policy references, JSON registry(`role-policy.json`, `agent-fragments.json`), Python `unittest`, Node.js ESM(`node --test`)

**Spec:** `docs/superpowers/specs/2026-11-26-architectural-skip-design-design.md`, 버전 v1, SHA-256 `b6b6c22d07918af8a33fc85b51071d487445f29cba7474926cbe5ab235dbba9a`(Orchestrator full 리뷰 OR1–OR4 완료, 결합 승인 전). design 문서는 없습니다(spec U6, 새 흐름 선적용).

**대상:** `/Users/ma-24-007/Desktop/workspace/arc`, 현재 checkout 브랜치 `chore/spec-plan-approval-merge`, base `0ecc5bb8f640b190e9f2b1eac0318784bc7db445`. 새 브랜치나 worktree는 만들지 않습니다.

**경로/깊이/위험:** Architectural / plan 필요 / 중상(significant). 이유: 승인 게이트를 없애는 변경입니다. 4개 플랫폼 parity, 생성물, 해시 fixture가 연쇄로 바뀝니다.

## 전역 제약

- 영문 정책 문구는 spec §3.1–§3.6 "변경 후" 칸과 §3.1.1 블록(spec 100–108행)을 그대로 씁니다. 복제 방식은 PJ4를 따릅니다. 4개 플랫폼(`claude`, `codex`, `gemini`, `grok`)의 결과는 플랫폼 관리 문구를 빼고 바이트까지 같아야 합니다(J8). 위치는 행 번호가 아니라 "현재" 문장의 완전 일치로 찾습니다. Codex는 행 오프셋이 다릅니다.
- 생성 구간(`planning.md` 관리 구간, `shared/skill/runtime/role-policy.json`, `MANIFEST.sha256`, `installed-layout-golden.json`)은 손으로 고치지 않고 생성기로만 반영합니다.
- 바꾸지 않는 파일과 이유:
  - `lib/runtime/**`: design stage 개념이 없습니다(spec §4).
  - `lib/policy/render.mjs`, `lib/prompts/render.mjs`: 입력만 바뀝니다(OR1).
  - `*/skill/references/handoff-prep.md`: SJ4.
  - `handoff.md` 25·34행: spec §3.0.
  - `role-policy.json` `[role.planner-draft-only]`: SJ5.
  - `docs/**`, 외부 skill, 사용자 홈 설치 사본.
  - `*/agents/*` 원본 파일: 바이트가 바뀌지 않고, 렌더 결과만 바뀝니다.
  - `tests/node/runtime-versions.test.mjs`: PJ7.
  - §6.2 무변경 assert.
- 판정 기준은 base `0ecc5bb8` 대비 새 실패 없음입니다. 기존 실패와 부하 flake는 단독 재실행으로 판정합니다.
- bridge 실행 중에는 커밋이나 다른 쓰기를 하지 않습니다.
- 실행 중 spec/plan 개정은 따로 커밋하지 않습니다. 다음 task 커밋에 `Plan-Revision`/`Plan-Approved-At`/`Plan-Reason` trailer로 싣습니다.
- 커밋 메시지는 저장소 관례(한국어 제목, Conventional 접두)를 따릅니다.
- 범위 표기는 "바꾼다 / 안 바꾼다(이유)"만 씁니다.

## Review Focus

1. **편집 구간과 관리 구간의 모순:** `planning.md` 편집 구간("start confirmation"), 관리 구간 RP1/RP4, 렌더된 Planner 프로필 F3이 같은 흐름을 말해야 합니다. 옛 문구는 남으면 안 됩니다. → N4, N5, T-P5, T-N1(F3 추가 assert, PJ5)
2. **Bounded 무변경:** Bounded design 승인, plan depth, 생략 조건, plan-only 커밋 문장이 그대로여야 합니다. P13·P15·P20·P23의 괄호 분기는 Bounded 의미를 유지해야 합니다. → 기존 APPROVAL_RULES 1634/1637/1638, T-P2, T-P12, Tester diff 확인(PJ12)
3. **fixture 사본 누락:** `instruction-contracts.json`의 정책 사본 중 하나라도 옛 문구로 남으면 `instruction-layout` 실패가 생기거나, 잘못 고치면 거짓 통과가 됩니다. → PJ2 대상 9개 사본
4. **Full Auto 경계:** P24와 §3.1.1-6은 범위 확인만 auto이고, target은 Execution-target 행을 따라야 합니다. → T-N4, N1, N2
5. **4개 플랫폼 parity:** §3.1.1 블록과 삽입 문장이 4개 플랫폼에서 바이트까지 같아야 합니다. → N1, N2, N3, 기존 `test_combined_approval_text_identical_across_platforms`

---

## plan 작성자 판단 목록 (결합 승인 요청에 첨부)

| ID | 판단 | 이유 |
|---|---|---|
| PJ1 | spec §12 후보 중 하나의 inseparable task(T1)를 고릅니다. | 2개로 나누면(편집 구간 / 원본·생성물) 중간 커밋의 설치 정책이 모순됩니다. 편집 구간은 "start confirmation"을 말하는데 관리 구간 RP4는 `Obtain design approval before spec or plan drafting`, Planner 프로필 F3은 `After architectural design approval`을 말하게 됩니다. N5는 두 영역을 함께 검사하므로 앞 task만으로는 녹색이 될 수 없습니다. 두 후보가 건드리는 파일 집합도 거의 같고(`planning.md` 두 구간, `test_arc_policy.py`, `instruction-contracts.json`, MANIFEST, golden, `plan.test.mjs`), 해시 연쇄를 두 번 돌리는 비용만 늘어납니다(planning.md:102 inseparable). |
| PJ2 | `instruction-contracts.json`은 spec T-N6 목록에 더해, "현재" 문장이 들어 있는 모든 정책 사본을 갱신합니다. 사본마다 반영할 행은 다음과 같습니다. 14·126행(`opening`): S1. 89·208행(Design path and plan depth): P14, P15, P16, **P17**, P18. 96·215행(Document-save evidence gates): P19, P20. 103·222행(Complete planning-document set): P21, **P22**. **201행**(claude Formal drafting boundary): **P1**. | spec T-N6에는 P17, P22, 201행이 빠져 있습니다. 각 사본에 해당 "현재" 문장이 실제로 있음을 확인했습니다(Grep). `instruction-layout.test.mjs:91–92`는 사본이 reference에 부분 문자열로 포함되는지 검사하므로 하나라도 빠지면 `missing baseline contract`로 실패합니다. 이 보완은 spec §3.0("instruction-contracts.json 바꾼다")과 §5-6("보호 텍스트 사본")의 범위 안이고 산출물 의미를 바꾸지 않습니다. Orchestrator가 spec T-N6 행을 이에 맞춰 직접 고치기를 권합니다(R4 범위 내 수정). |
| PJ3 | 삽입 문장 P5, P8, P11, P21은 앞 문장과 같은 행에 공백 1개로 잇습니다. P8·P11은 spec 칸에 이미 앞 공백이 있으므로 공백을 하나 더 넣지 않습니다. P24만 새 표 행입니다. P9는 `<a id="decision-inventory"></a>` 바로 앞에 새 절로 넣습니다. 앞뒤에는 빈 줄 1개씩을 둡니다. | spec은 "이 문장 뒤에" 넣으라고 합니다. 같은 문단을 유지하면 SJ13의 부분 문자열 assert가 계속 성립합니다. |
| PJ4 | 영문 문구 복제 방식: Implementer는 먼저 `shasum -a 256 docs/superpowers/specs/2026-11-26-architectural-skip-design-design.md`가 승인된 spec SHA와 같은지 확인합니다. 그다음 spec의 해당 행에서 문구를 기계적으로 추출합니다(예: §3.1.1 블록은 100–108행). 표 칸의 `\|`는 `|`로, `` \` ``는 `` ` ``로 되돌립니다. "현재" 칸의 `…`는 "그대로인 부분"을 뜻합니다. 따라서 `…` 앞뒤에 보이는 조각만 각각 교체합니다. 예를 들어 P10은 `before returning the final design, Planner lists` 조각과 `the answer is recorded in the design),` 조각을 따로 교체합니다. 바뀐 테스트 문자열(T-P8·T-P9·T-P11·T-N1·T-N2)은 기존 테스트 문자열에 spec의 같은 교체 쌍을 적용해서 만듭니다. 손으로 다시 타이핑하지 않습니다. | 복제 오타를 막기 위해서입니다. |
| PJ5 | 테스트를 spec §6.3보다 조금 강화합니다(제거는 없음). N2에 P2와 P23의 변경 후 문장을 추가합니다. `agent-fragments.test.mjs`의 `conversation` 테스트에는 F3의 새 조각(`On the Architectural path there is no design document or design approval: … return a complete spec and self-review;`, spec 140행 원문)이 같은 bullet에 있다는 assert 1개를 추가합니다. | spec §6.1·§6.3에는 P2, P23, F3의 새 문구를 직접 검사하는 assert가 없습니다. 그런데 AC2(P2, F3)와 SJ11(P23)은 이 문구에 기대고 있습니다. 문구와 결과물은 바뀌지 않습니다. |
| PJ6 | `agentProfileBaseline`은 F1–F4로 바뀌는 Planner 프로필 digest 4개만 갱신합니다. `revision` 필드는 유지합니다. `protected`의 `*/agents/arc-planner.*` 원본 해시도 유지합니다. | `agent-fragments.test.mjs:34`는 `profiles`만 검사합니다. 원본 프로필 바이트는 바뀌지 않습니다. 선례 plan T1도 같은 방식이었습니다. |
| PJ7 | `tests/node/runtime-versions.test.mjs`는 바꾸지 않고 회귀로만 실행합니다. | `runtime-versions.test.mjs:32`는 `.mjs` 모듈만 해시합니다. `role-policy.json`은 대상이 아닙니다. |
| PJ8 | `tests/installer-parity.json`은 allowedPaths에 넣되 조건부로만 바꿉니다. `check-installer-parity`가 coverage mapping 문제로 실패할 때만 깨진 항목을 갱신하고, inventory 해시는 바꾸지 않습니다(spec §5-7). | 새 test class를 추가해도 mapping이 깨질지는 실행 전에는 알 수 없습니다. 선례 PI2와 같은 방식입니다. |
| PJ9 | `instruction-contracts.json` `platforms.{codex,claude}.skill.bytes/lines` 예산(`instruction-layout.test.mjs:116–117`)은 올리지 않습니다. S1(약 33바이트 추가) 때문에 예산을 넘으면 hold하고 Orchestrator에게 보고합니다. | 예산 상향은 spec에 없는 계약 변경입니다. 현재 여유 바이트는 확인하지 못했습니다(실행 불가). |
| PJ10 | fixture 갱신 순서는 선례와 같습니다: 생성기 → golden → renderingBaseline → instruction-contracts → parity → manifest. 마지막에 closure 재실행을 합니다(`installed-layout --diff`, `plan.test.mjs`, `instruction-layout`, `agent-fragments`, `check:manifest`). | MANIFEST는 `tests/`를 포함하지 않지만, 렌더나 golden이 payload 상태에 기대는지는 확인하지 못했습니다. 마지막 재실행으로 순서 의존을 닫습니다. |
| PJ11 | 새 class `ArchitecturalStartConfirmationTests`는 `tests/test_arc_policy.py` 끝, `DesignConversationPolicyTests` 뒤에 둡니다. 테스트 이름은 다음과 같습니다. N1 `test_start_confirmation_section_identical_on_every_platform`, N2 `test_architectural_insertions_present`, N3 `test_coordination_handoff_skill_wording`, N4 `test_planner_brief_continuation_in_managed_section`, N5 `test_removed_design_approval_wording_absent`. | 기존 파일을 쓰면 새 파일 등록(MANIFEST, package 목록)이 생기지 않습니다. `__main__` 블록이 없으므로 끝에 추가하면 됩니다. |
| PJ12 | AC6·AC12 확인 방법: 기존 assert(APPROVAL_RULES 1634·1637·1638, DESIGN_RULES 1754의 Spike/direct 문장)가 계속 통과해야 합니다. 추가로 Tester가 `git diff 0ecc5bb8 -- claude/skill/references/planning.md`의 삭제(`-`) 행을 확인합니다. 각 삭제 행은 P1–P24 중 하나의 "현재" 문장을 포함하는 행이어야 합니다. 관리 구간의 삭제 행은 `[planning.planner-brief]` 1행뿐이어야 합니다. | Bounded와 Spike 문장의 무변경을 diff로 증명하기 위해서입니다. |
| PJ13 | N5의 검사 대상은 spec 그대로입니다(4개 플랫폼 `skill/**/*.md`, `lib/policy/role-policy.json`, `lib/prompts/agent-fragments.json`). `shared/skill/runtime/role-policy.json`은 최종 검증 grep에서 함께 확인합니다. | shared 사본은 생성물이고 원본과 바이트가 같습니다. 6개 문구의 현재 위치(planning.md 5행×4, coordination.md 1행×4, 원본 2개)가 모두 P3·P14·P18·P19·RP4·C1·F3으로 교체되는 것을 확인했습니다(Grep). |
| PJ14 | 커밋 메시지 초안: `chore(policy): Architectural design 승인을 착수 확인 1회로 대체` | 저장소 관례 |

## 확인 항목 배치

| 항목 | 배치 | 해결 방법 / 현재 상태 |
|---|---|---|
| I1 renderingBaseline | T1 Step 6 | `plan.test.mjs:235–248`은 8개 key마다 별도 test를 만들고 `assert.equal(digest, renderingBaseline[key])`로 비교합니다. 그래서 한 번 실행하면 실패한 key마다 실패 출력에 actual 값이 나옵니다. 실패한 key만 그 actual 값으로 바꿉니다. 갱신 전에 실행을 2회 반복해 actual 값이 같은지 확인합니다(결정성). 갱신 뒤 다시 실행해 8개 모두 PASS인지 봅니다. |
| I2 protected 해시 | T1 Step 6 | 바뀌는 protected 대상은 `lib/policy/role-policy.json`과 `shared/skill/runtime/role-policy.json` 2개입니다. 둘의 바이트가 같으므로 해시도 같습니다. 값은 `shasum -a 256 <file>`의 hex입니다(접두사 없음, 기존 형식). |
| I3 agentProfileBaseline | T1 Step 6 | `agent-fragments.test.mjs:29–35`는 반복문 안의 assert라 첫 불일치에서 멈춥니다. 그래서 실패 출력에 의존하지 않고, 렌더 결과 해시를 직접 계산합니다. 명령: `node --input-type=module -e "import fs from 'node:fs';import {createHash} from 'node:crypto';import {renderAgentProfile} from './lib/prompts/render.mjs';const r=JSON.parse(fs.readFileSync('lib/prompts/agent-fragments.json','utf8'));for(const t of r.targets)if(/\/agents\/arc-planner\./.test(t.path))console.log(t.path,createHash('sha256').update(renderAgentProfile(t.path,fs.readFileSync(t.path),r)).digest('hex'))"`(저장소 루트에서 실행). 2회 실행해 결과가 같은지 확인하고 4개 값을 반영합니다. PJ6 |
| I4 정책 사본 | T1 Step 6 | PJ2의 9개 사본에 spec 교체 쌍을 적용합니다. JSON 문자열 안에서는 `"`가 `\"`, 줄바꿈이 `\n`입니다. 갱신 뒤 `git diff -U0 -- tests/node/fixtures/instruction-contracts.json`을 확인합니다. 바뀐 행은 14·89·96·103·126·201·208·215·222, protected 2행(role-policy 2개), `agentProfileBaseline` Planner 4행뿐이어야 합니다. |
| I5 플랫폼 문장 일치 | T1 Step 4 | 교체 전에 4개 플랫폼에서 대상 "현재" 문장이 각각 1회 완전 일치하는지 grep으로 확인합니다. OR3에서 Orchestrator가 이미 확인했지만 Implementer가 다시 확인합니다. 다르면 hold합니다. |
| I6 SKILL 예산 | T1 Step 7 | `instruction-layout` `contracts have explicit destinations` 테스트의 byte/line 예산을 봅니다. 넘으면 PJ9에 따라 hold합니다. |
| I7 parity mapping | T1 Step 6 | `node scripts/check-installer-parity.mjs`가 실패하면 PJ8을 적용합니다. |

## Task 순서와 의존성

```
[spec+plan 결합 승인] → [planning-document 커밋 1회(Orchestrator, spec+plan)] → T1 → final Tester(mode: final) → 최종 Reviewer(1회)
```

- T1은 결합 승인과 planning-document 커밋을 선행으로 요구합니다(R6).
- task가 하나라서 task 사이의 파일 겹침은 없습니다. final Tester는 T1 커밋 이후 다시 바뀐 파일을 확인합니다.

---

### Task T1: Architectural 착수 확인 도입과 design 승인 제거(4개 플랫폼, 원본, 생성물, fixture)

**목표:** 다음을 반영합니다. 관련 테스트와 fixture도 갱신합니다.
- spec §3.1 P1–P24와 §3.1.1 새 절
- §3.2 C1, §3.3 H1, §3.4 S1
- §3.5 RP1–RP4, §3.6 F1–F4

**선행:**
- 결합 승인과 planning-document 커밋
- base `0ecc5bb8`의 기준선 위치를 Orchestrator가 준비하고 확인한 상태. 기준선 worktree를 새로 만들거나 옮겨야 하면 그 Git 조작은 Orchestrator가 합니다.

**Files (allowedPaths, 정확히 이 목록):**
- 수정(손):
  - `claude/skill/references/planning.md` (편집 구간; 관리 구간은 생성)
  - `codex/skill/references/planning.md`
  - `gemini/skill/references/planning.md`
  - `grok/skill/references/planning.md`
  - `claude/skill/references/coordination.md`
  - `codex/skill/references/coordination.md`
  - `gemini/skill/references/coordination.md`
  - `grok/skill/references/coordination.md`
  - `claude/skill/references/handoff.md`
  - `codex/skill/references/handoff.md`
  - `gemini/skill/references/handoff.md`
  - `grok/skill/references/handoff.md`
  - `claude/skill/SKILL.md`
  - `codex/skill/SKILL.md`
  - `gemini/skill/SKILL.md`
  - `grok/skill/SKILL.md`
  - `lib/policy/role-policy.json` (431행 `planning.planner-brief` `text`, RP1–RP4)
  - `lib/prompts/agent-fragments.json` (70행 `planner.workflow-contract`, F1–F4)
- 재생성(생성기로만):
  - 위 4개 `planning.md`의 관리 구간(`npm run update:role-policy`). 확인 결과 `planning.planner-brief`는 orchestrator 전용 rule이고 `planning` projection에만 속합니다(`lib/policy/placement.mjs:6`). 따라서 이 생성기가 바꾸는 대상은 4개 `planning.md`뿐입니다. SKILL.md와 agents의 관리 구간은 바뀌지 않아야 합니다.
  - `shared/skill/runtime/role-policy.json` (`node scripts/update-runtime-assets.mjs`. `lib/runtime/*.mjs` 사본은 원본이 그대로라 바뀌지 않음)
  - `MANIFEST.sha256` (`node scripts/update-manifest.mjs`)
  - `tests/node/fixtures/installed-layout-golden.json` (`node tests/node/fixtures/installed-layout.mjs --write`)
- 테스트:
  - `tests/test_arc_policy.py` (T-P1–T-P13, 새 class N1–N5)
  - `tests/node/agent-fragments.test.mjs` (T-N1, T-N2, PJ5 F3 assert)
  - `tests/node/composite-instructions.test.mjs` (T-N3, 32행)
  - `tests/node/run-mode-contract.test.mjs` (T-N4, 27행 다음)
- fixture:
  - `tests/node/plan.test.mjs` (`renderingBaseline` 226–233, I1)
  - `tests/node/fixtures/instruction-contracts.json` (I2, I3, I4)
  - `tests/installer-parity.json` (조건부, PJ8)

**Interfaces:**
- Consumes: 없음(base `0ecc5bb8`)
- Produces:
  - anchor `architectural-start-confirmation`(`planning.md`). C1, H1, P1, P14, P19, P21이 이 anchor를 참조합니다. C1과 H1은 `planning.md#architectural-start-confirmation`으로 참조합니다.
  - 용어 "start summary", "Architectural start confirmation", "spec-stage delta brief"
  - test class `ArchitecturalStartConfirmationTests`

**spec 매핑:** G1–G3, P1–P24, §3.1.1(1–6), C1, H1, S1, RP1–RP4, F1–F4, §5 1–8단계, §6.1 T-P1–T-P13·T-N1–T-N7, §6.2 전체(무변경), §6.3 N1–N5, AC1–AC13

- [ ] **Step 1: 기준선 기록(fresh Tester 또는 Implementer가 base에서 실행).**
  - base `0ecc5bb8` 위치에서 Step 7의 Python 3개와 Node 목록, check 스크립트 5개를 실행합니다. 기존 실패 목록을 기록합니다.
  - spec §6.2 무변경 assert(`test_arc_policy.py:161,223,1046,1518,1736,1748,1751,1761,1765,1766,1770,1778,1788`, `test_claude_payload.py:717`, `test_harness_contract.py:362–369,530–549`, `role-policy.test.mjs:305–306`, `agent-fragments.test.mjs:118`, `composite-instructions.test.mjs:38`)가 base에서 통과하는지 기록합니다.

- [ ] **Step 2: 실패 테스트 작성(TDD, 문서 변경 전).**
  - (a) 기존 assert 갱신. 문자열은 PJ4 방식으로 만듭니다.
    - `tests/test_arc_policy.py` `SpecPlanApprovalMergeTests`:
      - 1633(T-P1, P14 변경 후 문장 전체)
      - 1635(T-P2, P15)
      - 1639(T-P3, spec 165행 문자열)
      - 1666 `INVENTORY_REFERENCE`(T-P4)
      - 1709 `test_planner_brief_rp1_in_managed_section`의 `rule`(T-P5, RP4 변경 후 문장). count==1과 관리 구간 포함 assert는 유지합니다.
      - 1642–1646(R0·R2·R3·R5·R6)과 1632·1634·1636–1638·1640–1641·1647–1649는 그대로 둡니다(AC3, AC6).
    - `tests/test_arc_policy.py` `DesignConversationPolicyTests`:
      - 1755(T-P6), 1758(T-P7), 1769(T-P8, RP2의 두 조각 적용), 1773(T-P9, P4)
      - 1776(T-P10, P10의 두 조각), 1781(T-P11, P12의 두 조각), 1782(T-P12, P13), 1823(T-P13)
      - §6.2 행(1748, 1751, 1754, 1761, 1765, 1766, 1770, 1778, 1788)은 그대로 둡니다.
    - `tests/node/agent-fragments.test.mjs`:
      - 115 `conversation`(T-N1, F1·F2 적용)
      - 116 `classification`(T-N2, F4의 두 조각 적용)
      - PJ5: 같은 test 안에서 `lines[conversationIndex]`가 F3 새 조각을 `includes`하는지 assert를 추가합니다.
      - 118 `specHandoff`와 122행 `endsWith` 조건은 그대로 둡니다.
    - `tests/node/composite-instructions.test.mjs:32`(T-N3): `gate`의 `` `design` (Planner design required, approved or omitted, and why)`` 조각을 S1 변경 후 조각으로 바꿉니다.
    - `tests/node/run-mode-contract.test.mjs`(T-N4): `planningSection`에서 27행 `| Design and short-design approval | auto | After Orchestrator review |` 바로 다음 줄에 P24 행을 넣습니다. 나머지 행은 그대로 둡니다.
  - (b) `tests/test_arc_policy.py` 끝에 새 class `ArchitecturalStartConfirmationTests`를 추가합니다(PJ11). `PLATFORMS = ("claude","codex","gemini","grok")`, `reference()`, `planning_parts()`는 기존 class와 같은 방식으로 씁니다.
    - N1 `test_start_confirmation_section_identical_on_every_platform`:
      - 각 `planning.md` 편집 구간에서 `<a id="architectural-start-confirmation"></a>`부터 `<a id="decision-inventory"></a>` 직전까지를 bytes로 잘라냅니다.
      - `strip()` 결과가 spec §3.1.1 블록(100–108행)과 같아야 합니다.
      - 4개 플랫폼의 추출 bytes가 서로 같아야 합니다.
      - anchor는 파일 전체에서 1회만 나와야 합니다.
    - N2 `test_architectural_insertions_present`:
      - 편집 구간에 다음 변경 후 문장(또는 삽입 문장)이 있어야 합니다: P1 삽입 문장, P3 삽입 조각, P5, P8, P11, P21 삽입 문장, P2·P23 변경 후 문장(PJ5).
      - P24 행은 `<a id="full-auto-run-mode"></a>` 이후 구간에 `행 + "\n"`으로 있어야 합니다.
    - N3 `test_coordination_handoff_skill_wording`: 다음이 각 파일에 있어야 합니다.
      - C1 두 변경 후 문장(`coordination.md`)
      - H1 변경 후 조각(`handoff.md`)
      - S1 변경 후 조각(`SKILL.md`)
    - N4 `test_planner_brief_continuation_in_managed_section`: RP1 변경 후 문장과 RP3 삽입 문장이 각 `planning.md` 관리 구간(`[ARC role policy: contract begin]`~`end`)에 정확히 1회 있어야 하고, 파일 전체에서도 1회여야 합니다.
    - N5 `test_removed_design_approval_wording_absent`: spec §6.3 N5의 6개 문구가 다음 파일에서 0건이어야 합니다.
      - 4개 플랫폼 `(REPO/platform/"skill").rglob("*.md")`
      - `lib/policy/role-policy.json`
      - `lib/prompts/agent-fragments.json`
      - 구현은 기존 `test_removed_spec_approval_wording_absent`와 같은 방식으로 합니다.

- [ ] **Step 3: 실패 확인.**
  - 명령:
    - `python3 -m unittest discover -s tests -p 'test_arc_policy.py'`
    - `node --test tests/node/agent-fragments.test.mjs tests/node/composite-instructions.test.mjs tests/node/run-mode-contract.test.mjs`
  - 기대: 갱신 assert(T-P1–T-P13, T-N1–T-N4)와 N1–N5가 FAIL합니다. 나머지는 Step 1 기준선과 같습니다.

- [ ] **Step 4: 구현(손 편집).**
  - PJ4의 spec SHA를 확인하고, I5에 따라 4개 플랫폼의 "현재" 문장이 일치하는지 확인합니다.
  - 4개 `planning.md` 편집 구간(관리 구간 밖):
    - P1–P8, P10–P23을 spec 표 위치에 적용합니다. 행 번호가 아니라 완전 일치로 찾습니다. 삽입 형식은 PJ3을 따릅니다.
    - P9: §3.1.1 블록을 `<a id="decision-inventory"></a>` 앞에 넣습니다.
    - P24: Full Auto 표에 새 행을 넣습니다.
  - 4개 `coordination.md` 92행(Codex는 같은 문맥 위치): C1 두 교체. "그대로 두는 문장"(spec §3.2 셋째 항목)은 건드리지 않습니다.
  - 4개 `handoff.md` 27행: H1. 25행과 34행은 그대로 둡니다.
  - 4개 `SKILL.md` 18행: S1. "Planner design stage"와 "starts with Planner design"은 그대로 둡니다(J6). 관리 구간은 건드리지 않습니다.
  - `lib/policy/role-policy.json` 431행 `text`: RP1, RP2(두 조각), RP3(삽입), RP4. 233행 `[role.planner-draft-only]`는 그대로 둡니다(SJ5).
  - `lib/prompts/agent-fragments.json` 70행: F1, F2, F3(뒤 꼬리 `Orchestrator saves/reviews … a fresh plan Planner drafts next.` 유지), F4(두 조각).

- [ ] **Step 5: 생성·동기화(spec §5 1–2단계).**
  - `npm run update:role-policy`, 이어서 `npm run check:role-policy` (PASS)
  - `node scripts/update-runtime-assets.mjs`, 이어서 `node scripts/update-runtime-assets.mjs --check` (PASS)
  - `git status --porcelain`으로 바뀐 파일이 allowedPaths 안인지 확인합니다. 4개 `planning.md` 외의 POLICY_TARGETS(SKILL.md·agents·다른 references의 관리 구간)와 `shared/skill/runtime/*.mjs`에는 생성 변경이 없어야 합니다.

- [ ] **Step 6: fixture 갱신(spec §5 3–8단계, PJ10 순서).**
  1. `node tests/node/fixtures/installed-layout.mjs --write`, 이어서 `--diff` (차이 없음)
  2. renderingBaseline: I1 방법으로 실패한 key만 갱신합니다(2회 결정성 확인).
  3. `instruction-contracts.json`: I4(PJ2의 9개 사본), I2(protected 2개), I3(Planner 프로필 4개). 갱신 뒤 I4의 `git diff -U0` 범위를 확인합니다.
  4. `node scripts/check-installer-parity.mjs` (PASS. 실패하면 PJ8을 적용하고, inventory 해시는 바꾸지 않습니다)
  5. `node scripts/update-manifest.mjs`, 이어서 `npm run check:manifest` (PASS)
  6. closure 재실행: `node tests/node/fixtures/installed-layout.mjs --diff`, `node --test tests/node/plan.test.mjs tests/node/instruction-layout.test.mjs tests/node/agent-fragments.test.mjs`, `npm run check:manifest`. 모두 PASS여야 합니다. 실패하면 해당 단계부터 다시 하고, 다시 한 사실을 보고합니다.

- [ ] **Step 7: task-level 검증(fresh Tester, `mode: task`).**
  - Python:
    - `python3 -m unittest discover -s tests -p 'test_arc_policy.py'`
    - `python3 -m unittest discover -s tests -p 'test_harness_contract.py'`
    - `python3 -m unittest discover -s tests -p 'test_claude_payload.py'`
  - Node: `node --test tests/node/agent-fragments.test.mjs tests/node/composite-instructions.test.mjs tests/node/run-mode-contract.test.mjs tests/node/role-policy.test.mjs tests/node/instruction-layout.test.mjs tests/node/installed-layout-golden.test.mjs tests/node/plan.test.mjs tests/node/manifest.test.mjs tests/node/package.test.mjs tests/node/runtime-versions.test.mjs`
  - check 스크립트 5개: `npm run check:role-policy`, `node scripts/update-runtime-assets.mjs --check`, `node tests/node/fixtures/installed-layout.mjs --diff`, `node scripts/check-installer-parity.mjs`, `npm run check:manifest`
  - 범위 확인:
    - `git diff --stat 0ecc5bb8 -- lib/runtime lib/policy/render.mjs lib/prompts/render.mjs` 출력 없음(AC11)
    - `git diff --name-only 0ecc5bb8`이 allowedPaths와 planning-document 2개 안에 있어야 함
    - PJ12 diff 삭제 행 확인(AC6, AC12)
    - I6 예산 확인
  - 기대: 갱신 assert, N1–N5, PJ5 assert가 PASS합니다. §6.2 무변경 assert는 Step 1과 같이 PASS합니다. 기준선 대비 새 실패가 없습니다. 의심 건은 단독 재실행합니다.

- [ ] **Step 8: Orchestrator 수용 후 커밋.** 메시지 예: `chore(policy): Architectural design 승인을 착수 확인 1회로 대체`. 실행 중 개정이 있으면 이 커밋에 `Plan-Revision`/`Plan-Approved-At`/`Plan-Reason` trailer를 답니다.

**관련 테스트와 이유:**
- `test_arc_policy.py`: P·RP 문구, 새 class N1–N5, 무변경 회귀를 직접 검사합니다.
- `test_harness_contract.py`, `test_claude_payload.py`: Order 문장 캡처와 marker 순서 회귀를 봅니다(§6.2, SJ2).
- `agent-fragments`: F1–F4 렌더와 `agentProfileBaseline`을 봅니다.
- `composite-instructions`: S1을 봅니다(SKILL.md:18 전체 문장 비교).
- `run-mode-contract`: P24와 Full Auto 절 전체를 정확히 비교합니다.
- `role-policy.test.mjs`: 관리 구간 렌더와 305–306 회귀(RP2·RP3 유지, SJ12)를 봅니다.
- `instruction-layout`: 정책 사본, protected 해시, SKILL 예산을 봅니다.
- `installed-layout-golden`, `plan`, `manifest`, `package`: 생성물과 해시 연쇄를 봅니다.
- `runtime-versions`: 런타임 무변경 회귀입니다(PJ7).

**Tester 확인 항목:**
- 새 실패 0건(base 대비)
- check 스크립트 5개 PASS
- `lib/runtime/**`와 렌더러의 diff 0
- 생성 구간을 손으로 고치지 않았음(check:role-policy와 runtime-assets `--check` PASS, Step 5 범위 확인)
- PJ12 삭제 행 대응
- I4 diff 범위
- AC1–AC13 판정(proven / unverified와 근거)

**수용 기준:** AC1–AC13 전부(task가 1개이므로).

**Hold:**
- 결합 승인 또는 planning-document 커밋이 없을 때
- spec SHA가 승인된 버전과 다를 때(PJ4)
- I5에서 플랫폼 문장이 다를 때
- 생성기나 check가 실패할 때
- 생성기가 allowedPaths 밖이나 예상 밖 파일을 바꿀 때
- SKILL 예산을 넘을 때(PJ9)
- 기준선에 없는 새 실패가 있을 때
- 바뀐 문구가 §6.1 목록과 PJ2·PJ5 밖의 assert를 깨뜨릴 때(Orchestrator에게 보고)
- `lib/runtime/**` diff가 생길 때

---

## 최종 검증 (T1 수용 후)

1. **N5와 확장 grep(AC5, AC1).** 대상: `claude/skill codex/skill gemini/skill grok/skill lib/policy/role-policy.json lib/prompts/agent-fragments.json shared/skill/runtime/role-policy.json`
   - `rg -n -F -e 'Architectural approves design' -e 'revised design approval' -e 'After architectural design approval' -e 'Obtain design approval before spec or plan drafting' -e 'After design approval, the spec stage' -e 'Approved design scope/evidence' <대상>` → 출력 없음
2. **AC11:** 최종 tip에서 `git diff --stat 0ecc5bb8 -- lib/runtime lib/policy/render.mjs lib/prompts/render.mjs`가 비어 있어야 합니다.
3. **check 스크립트 5개:** `npm run check:role-policy`, `node scripts/update-runtime-assets.mjs --check`, `node tests/node/fixtures/installed-layout.mjs --diff`, `node scripts/check-installer-parity.mjs`, `npm run check:manifest` → 모두 PASS
4. **final Tester(bridge, `mode: final`):**
   - 재변경 파일 확인: T1 커밋 이후 tip과 작업 트리에서 다시 바뀐 파일을 나열합니다. task가 하나라 task 간 겹침은 없습니다. 다시 바뀐 파일이 있으면 해당 관련 테스트와 위 1–3을 다시 실행합니다.
   - full regression(사용자 승인 후), shard manifest:
     - shard 1(Python): `python3 -m unittest discover -s tests -p 'test_*.py'`
     - shard 2(Node): `node --test tests/node/*.test.mjs`
   - 기준선은 base `0ecc5bb8`입니다. 새 실패만 판정하고, 의심 건과 부하 flake 후보는 단독 재실행합니다(AC11).
   - 새 실패는 Implementer → Tester recheck로 처리합니다. 새 실패와 intermittent 후보의 처분, 판정 범위를 알 수 없는 항목의 처분이 모두 끝난 뒤에 최종 Reviewer로 넘어갑니다.
5. **최종 Reviewer(native, 1회, 전체 변경 `0ecc5bb8..tip`).**
   - 위험별 확인:
     - Review Focus 1–5
     - 착수 확인이 formal drafting boundary의 필수 입력(approved scope/depth/document set, explicit choice)을 실제로 충족하는 문장 구조인지(AC1)
     - delta brief 필드와 fallback(AC2)
     - Bounded "since design approval" 유지(AC4)
     - Full Auto 한계(AC9)
     - fixture 사본을 정책 원문과 같게 맞췄는지(PJ2)
     - 생성 구간을 손으로 고치지 않았는지
   - Reviewer finding은 Implementer → Reviewer recheck로 처리합니다(Tester 재배정 없음). 수정은 recheck 동안 미커밋으로 두고, 해소 후 수용과 follow-up 커밋 1회로 합칩니다.

**task 간 파일 겹침(재확인 대상):** 없습니다(task 1개). final Tester가 T1 커밋 이후 재변경만 확인합니다.

**잠정 trigger 판단:**
- significant/high-risk입니다(승인 게이트 제거, 4개 플랫폼 parity, 생성물·해시 연쇄). 그래서 T1의 필수 fresh Tester, final Tester(mode: final), 최종 Reviewer 1회를 둡니다.
- 대체 검사 목록(모든 contract test와 check 스크립트):
  - Python: `test_arc_policy.py`, `test_harness_contract.py`, `test_claude_payload.py`
  - Node 계약: `agent-fragments`, `composite-instructions`, `run-mode-contract`, `role-policy`, `instruction-layout`
  - fixture: `installed-layout-golden`, `plan`, `manifest`, `package`, `runtime-versions`
  - check 스크립트 5개, 최종 1·2의 grep과 diff
- 이유: 문구 하나가 여러 사본과 해시에 연쇄로 걸려 있어서, 국소 검사만으로는 누락과 거짓 통과를 잡기 어렵습니다.

## spec ↔ plan 정합성 표

| spec 요구·AC | task / 검증 |
|---|---|
| AC1 (P1, §3.1.1-2·3, design 승인 없음) | T1: N1, N2(P1), T-P1(P14), T-P3(P22), fixture 89·201·208·103·222(instruction-layout), 최종 1 |
| AC2 (P2–P3, §3.1.1-4, C1, RP1, F3) | T1: N2(P2·P3), N1, N3(C1), N4(RP1), PJ5 F3 assert, 최종 5 |
| AC3 (R0, fresh plan Planner, R1–R6 단위) | T1: APPROVAL_RULES 1642–1646 무변경 통과, T-P5(RP4가 R0 문구 유지) |
| AC4 (P11, P13, P17) | T1: N2(P11), T-P12, T-P4, T-P13, fixture 89·208 |
| AC5 (P18, §3.1.1-5, N5) | T1: fixture 89·208(R4 새 문장), N1, N5; 최종 1 |
| AC6 (Bounded 무변경) | T1: APPROVAL_RULES 1634·1637·1638, T-P2·T-P12 Bounded 분기, PJ12 diff 확인 |
| AC7 (P21, H1) | T1: N2(P21), N3(H1), §6.2 `test_arc_policy.py:161,223,1046,1518`, `test_harness_contract.py:362–549`, `test_claude_payload.py:717` 무변경 통과 |
| AC8 (원본 변경, §5, parity) | T1 Step 5–6·7 check 5개, N1·N2·N3 4개 플랫폼, `test_combined_approval_text_identical_across_platforms`, 최종 3 |
| AC9 (Full Auto) | T1: T-N4, N2(P24), N1(§3.1.1-6) |
| AC10 (S1) | T1: N3, T-N3, fixture 14·126 |
| AC11 (런타임 diff 0, 새 실패 없음) | T1 Step 7, 최종 2·4 |
| AC12 (Spike·direct 무변경) | T1: DESIGN_RULES 1754 무변경 통과, PJ12 |
| AC13 (§6.1·§6.2·§6.3 전부) | T1 Step 2·7, 최종 4 |
| P1–P24 | T1 Step 4 (테스트: P1·P2·P3·P5·P8·P11·P21·P23·P24 → N2; P4·P6·P7·P10·P12·P13·P14·P15·P17·P22 → T-P*; P9 → N1; P16·P18·P19·P20 → fixture 사본) |
| C1, H1, S1 | T1 Step 4, N3, T-N3 |
| RP1–RP4 | T1 Step 4–5, N4(RP1·RP3), T-P8(RP2), T-P5(RP4) |
| F1–F4 | T1 Step 4, T-N1(F1·F2), PJ5(F3), T-N2(F4), I3 |
| §5 1–8단계 | T1 Step 5–6 (PJ10 순서) |
| §6.1 T-N5·T-N6·T-N7 | T1 Step 6 (I1, I2–I4·PJ2, golden) |
| §6.2 무변경 | T1 Step 1·7 |
| §1.2 비범위, §4 런타임 | 전역 제약, AC11 확인 |
| §11 최소 검증 | T1 Step 7, 최종 3·4 |
| §12 task 경계 | PJ1 |
| OR2 범위 축소 확인 | 이 plan에는 해당 변경이 없습니다. 결합 승인 요청에서 Orchestrator가 처리합니다. |

## Self-review

- [x] spec coverage: P1–P24, §3.1.1, C1, H1, S1, RP1–RP4, F1–F4, §5, §6.1–§6.3, AC1–AC13이 모두 T1 단계나 최종 검증에 대응합니다(정합성 표).
- [x] step scan: 각 단계에 파일, 문구 출처(spec 행), 명령, 기대 결과가 있습니다. 영문 문구는 spec을 참조하고 다시 쓰지 않았습니다(PJ4).
- [x] 생성기 영향 파일을 소스로 확정했습니다. `update-role-policy`는 POLICY_TARGETS 중 바뀐 것만 쓰고, planner-brief는 `planning` projection 전용입니다. 따라서 4개 `planning.md`만 바뀝니다. `update-runtime-assets`는 `lib/runtime/*.mjs`와 `role-policy.json`을 복사하므로 role-policy 사본만 바뀝니다. `update-manifest`는 `tests/`를 제외합니다. `installed-layout --write`는 golden만 씁니다.
- [x] 해시 갱신 방법: renderingBaseline은 key별 별도 test라 실패 출력의 actual을 쓸 수 있습니다(2회 결정성 확인). agentProfileBaseline은 반복문 첫 실패에서 멈추므로 직접 계산 명령을 씁니다(I3). protected는 `shasum`을 씁니다.
- [x] TDD 순서: assert 갱신·추가 → 실패 확인 → 문서·원본 변경 → 생성 → 통과.
- [x] task 분할 이유(PJ1)와 순차 의존을 적었고, 파일 겹침이 없음을 명시했습니다.
- [x] 범위 표기: 모든 파일을 "바꾼다 / 안 바꾼다(이유)"로 표기했습니다. 조건부 파일(`installer-parity.json`)은 변경 조건을 PJ8로 확정했습니다.
- [x] Review Focus 5개 항목마다 소유 검증이 있습니다.

## 개정 이력

| Version | Approval time | Classification | Affected tasks | Reason |
|---|---|---|---|---|
| v1 | 결합 승인 대기 | initial | T1 | spec v1(`b6b6c22d…dbba9a`) 기준 첫 초안. Orchestrator 리뷰: spec OR4(PJ2 반영)에 맞춰 spec 해시 동기화, 다른 수정 없음 |
