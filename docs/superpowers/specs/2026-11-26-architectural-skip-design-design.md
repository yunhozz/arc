# Spec: Architectural design 단계 생략(착수 확인 1회로 대체)

- 단계: written spec. Planner가 첫 초안을 쓰고, Orchestrator가 저장·리뷰·수정한다. 승인 요청은 plan과 결합한다.
- 근거: design 대화(U1–U6)와 착수 확인. 새 흐름을 이번 작업에 먼저 적용했으므로(U6) design 문서와 design 승인은 없다. 착수 확인 답은 2026-11-26 "Current branch (Recommended)"(범위 확인 + 현재 checkout 선택)다.
- 버전: v1 (Planner 첫 초안 + Orchestrator 리뷰 수정 OR1–OR4, §14)
- 출처: `/Users/ma-24-007/Desktop/workspace/arc`, 브랜치 `chore/spec-plan-approval-merge`, HEAD `0ecc5bb8f640b190e9f2b1eac0318784bc7db445`, clean, 미push
- 대상: 현재 checkout의 브랜치 `chore/spec-plan-approval-merge`. 새 브랜치나 worktree는 만들지 않는다.
- 경로/깊이/위험: Architectural / plan 필요 / 중상(significant)
- 이번 작업의 진행(U6): 착수 확인 → 같은 Planner가 spec 작성 → Orchestrator 저장·리뷰 → fresh plan Planner → plan 저장·리뷰 → 결합 승인 1회 → planning-document 커밋 1회 → Implementer. 설치된 정책과의 충돌은 Orchestrator handoff record의 해소 기록을 따른다.
- 문서 세트:
  - spec `docs/superpowers/specs/2026-11-26-architectural-skip-design-design.md`
  - plan `docs/superpowers/plans/2026-11-26-architectural-skip-design.md`

## 1. 목표와 비목표

### 1.1 목표
- **G1 (U1, U2):** Architectural 경로의 Planner 인스턴스를 3개(design, spec, plan)에서 2개(대화와 spec을 맡는 Planner, plan Planner)로 줄여 시간과 토큰을 아낀다.
- **G2 (U3):** Architectural에서 design 문서 작성과 design 승인을 없애고, 1회 착수 확인(start confirmation)으로 대체한다.
  - 착수 확인은 요약 제시, 범위 확인, explicit target choice로 이루어진다.
  - 요약은 저장하지 않고 커밋하지 않는다.
- **G3 (J1, J2):** 대화에서 나온 결정과 작성자 판단을 spec에 기록한다. spec·plan 작성 중 나온 새 결정은 design 재승인 없이 사용자 결정 → spec 수정 → spec↔plan 재확인으로 처리한다.

### 1.2 바꾸지 않는 것
- Bounded 흐름 전체: design 대화, design 승인, plan depth 판단, plan 생략 조건, plan 승인 후 plan만 1회 커밋하는 규칙(U4, planning.md:78·138).
- Spike, direct path(F1–F8), non-behavior 경로(planning.md:49).
- R0(fresh plan Planner, 리뷰된 spec 고정 후 배정), 결합 승인 R1–R6의 승인 단위, planning-document 커밋 규칙.
- 런타임(`lib/runtime/**`)과 렌더러(`lib/policy/render.mjs`, `lib/prompts/render.mjs`).
- 과거 spec·plan 문서(`docs/**`), 외부 skill(`brainstorming.md`, `writing-plans.md`), 사용자 홈 설치 사본.

## 2. 용어
- **착수 요약(start summary):** Architectural design 대화를 끝낼 때 Planner가 final design 대신 반환하는 짧은 요약이다. 담는 내용은 다음과 같다.
  - 바꿀 범위, 사용자 결정, 작성자 판단, 이미 답 있음, 미결 확인
  - 경로/깊이/위험 판단, 문서 세트와 계획 경로
  - 파일·계약별 change/no change
- **착수 확인(Architectural start confirmation):** Orchestrator가 착수 요약을 제시하고, 한 번의 확인에서 사용자의 범위 확인과 explicit target choice를 받는 게이트다. design 승인을 대체한다.
- **연속 spec Planner:** 착수 확인 뒤 spec-stage delta brief를 받아 이어서 spec을 쓰는 design 대화 Planner다.

## 3. 정책 규칙 명세

### 3.0 파일별 범위

| 파일·계약 | 범위 | 명세 |
|---|---|---|
| `{claude,codex,gemini,grok}/skill/references/planning.md` 편집 구간 | 바꾼다 | P1–P24, §3.1.1 |
| `.../planning.md` 관리 구간(`[planning.planner-brief]` 렌더링 결과, C 197행) | 생성으로 바꾼다 | RP1–RP4를 `npm run update:role-policy`로 반영 |
| `.../coordination.md` 92행 | 바꾼다 | C1 |
| `.../handoff.md` 27행 | 바꾼다 | H1 |
| `.../handoff.md` 25행, 34행 | 안 바꾼다 | 25행 "Initial design MAY precede choice"는 두 경로에 모두 맞다. 34행 "Applicable design/spec/plan approvals"는 적용 가능한 승인만 가리킨다 |
| `.../handoff-prep.md` 12행 | 안 바꾼다 | SJ4. "design/plan depth"는 design 경로 분류를 뜻하며 승인 게이트가 아니다 |
| `.../SKILL.md` 18행 | 바꾼다 | S1 |
| `lib/policy/role-policy.json` 431행 `[planning.planner-brief]` | 바꾼다 | RP1–RP4 |
| `lib/policy/role-policy.json` 233행 `[role.planner-draft-only]` | 안 바꾼다 | SJ5. design 승인을 언급하지 않는다 |
| `lib/prompts/agent-fragments.json` 70행 `planner.workflow-contract` | 바꾼다 | F1–F4 |
| `shared/skill/runtime/role-policy.json` | 생성으로 바꾼다 | `node scripts/update-runtime-assets.mjs` |
| `MANIFEST.sha256` | 바꾼다 | 마지막에 재생성 |
| `tests/node/fixtures/installed-layout-golden.json` | 바꾼다 | `--write` |
| `tests/node/plan.test.mjs` `renderingBaseline`(225–234) | 바꾼다 | 바뀐 digest만 갱신 |
| `tests/node/fixtures/instruction-contracts.json` | 바꾼다 | §6.1 T-N6 |
| 테스트 파일 | 바꾼다 / 안 바꾼다 | §6에 행 단위로 확정 |
| `lib/runtime/**` | 안 바꾼다 | design stage 개념이 없다. 첫 stage는 spec(evaluate.mjs:227), plan은 리뷰된 spec 전제(238), Planner ledger kind는 spec/plan(schema.mjs:105) |
| `lib/policy/render.mjs`, `lib/prompts/render.mjs` | 안 바꾼다 | 렌더링 로직은 그대로이고 입력(role-policy.json, agent-fragments.json)만 바뀐다(OR1) |
| `docs/**` | 안 바꾼다 | 과거 기록이다 |

행 번호는 claude(C) 기준이다. codex·gemini·grok에도 같은 문장이 있다(Grep로 6개 대표 문장의 존재를 확인). 다른 플랫폼에서는 행 번호가 아니라 "현재" 문장의 완전 일치로 위치를 찾는다. 4개 플랫폼 본문은 플랫폼 관리 문구를 빼고 동일해야 한다(J8).

### 3.1 `planning.md` (4개 플랫폼 공통 본문)

원칙(SJ1): 기존 문장은 가능한 한 남기고 Architectural 문장을 덧붙인다. 그래서 문자열 일치 테스트의 변경을 줄인다.

| ID | 위치(C) | 현재 | 변경 후 |
|---|---|---|---|
| P1 | 25 | `Initial design/brainstorming MAY precede target choice. Before the first required spec/plan draft, record` | `Initial design/brainstorming MAY precede target choice. On the Architectural path, [start confirmation](#architectural-start-confirmation) supplies the approved scope/depth/document set and the explicit choice that the next sentence requires. Before the first required spec/plan draft, record` (뒤는 그대로) |
| P2 | 40 (앞 문장) | `3. NEVER reuse a Planner instance across stages.` | `3. NEVER reuse a Planner instance across stages, except the Architectural continuation below.` |
| P3 | 40 (가운데 삽입) | `…; within a spec or plan stage, reuse that stage's Planner only for a budget-hold delta. After design approval, the spec stage and the plan stage each use a fresh Planner; its initial brief contains` | `…; within a spec or plan stage, reuse that stage's Planner only for a budget-hold delta. On the Architectural path, the design Planner returns the start summary instead of a final design and, after [start confirmation](#architectural-start-confirmation), continues as the spec Planner through a spec-stage delta brief while role, context and source remain valid. Every plan stage, and an Architectural spec stage without that continuation, uses a fresh Planner; its initial brief contains` (뒤는 그대로) |
| P4 | 41 | `inventory/scope notation (final design: complete [decision inventory](#decision-inventory); every document:` | `inventory/scope notation (final design, Architectural start summary and Architectural spec: complete [decision inventory](#decision-inventory); every document:` |
| P5 | 44 (앞 문장 뒤) | `For design and brainstorming, converse under [design conversation](#design-conversation) and allow one consolidated correction on the final design.` | 이 문장 뒤에 `On the Architectural path the conversation ends with the start summary instead of a final design; the summary receives no consolidated correction, and Orchestrator's review and direct revision apply to the spec draft.`를 넣는다 |
| P6 | 51 (rule 1) | `…; one design section with a confirmation question; or the final design. Planner splits` | `…; one design section with a confirmation question; or the final design (Architectural: the start summary). Planner splits` |
| P7 | 54 (rule 4) | `the first response may carry a short design and ask for approval. When the user says to just proceed, stop asking, decide the remaining items as author judgments and list them in the final design.` | `the first response may carry a short design and ask for approval (Architectural: a short start summary and ask for start confirmation). When the user says to just proceed, stop asking, decide the remaining items as author judgments and list them in the final design or start summary.` |
| P8 | 57 (rule 7 끝) | `… Orchestrator's fixed-checklist review and one consolidated correction apply to the final design.` | 이 문장 뒤에 ` On the Architectural path they do not apply to the start summary; the spec draft takes Orchestrator's review and direct revision.`를 넣는다 |
| P9 | 58 다음, `<a id="decision-inventory"></a>` 앞 | (없음) | §3.1.1 새 절 |
| P10 | 63 (inventory 1) | `1. Decision inventory: before returning the final design, Planner lists … a user decision (asked in the conversation; the answer is recorded in the design),` | `1. Decision inventory: before returning the final design or Architectural start summary, Planner lists … a user decision (asked in the conversation; the answer is recorded in the design, or for Architectural in the start summary and then the spec),` (나머지 그대로) |
| P11 | 65 (끝) | `3. Final design: the final design and its design approval request attach the author-judgment list.` | 이 문장 뒤에 ` On the Architectural path the start summary and its start-confirmation request attach it, and the spec records the user decisions and author judgments.`를 넣는다 |
| P12 | 66 | `Answered by the design: follow it and cite the basis.` / `Genuinely new decision (changes the deliverable and is absent from the design): return it as an open decision with why the design review missed it;` | `Answered by the design (Architectural: the confirmed start summary): follow it and cite the basis.` / `Genuinely new decision (changes the deliverable and is absent from the design or confirmed start summary): return it as an open decision with why the design review or start confirmation missed it;` |
| P13 | 67 | `5. Approval attachments: the Architectural [combined approval](#architectural-combined-approval) request and the Bounded plan approval request attach the author judgments made since design approval. The approval unit is unchanged.` | `5. Approval attachments: the Architectural [combined approval](#architectural-combined-approval) request attaches the complete author-judgment lists of the spec and every plan, and the Bounded plan approval request attaches the author judgments made since design approval. The approval unit is unchanged.` |
| P14 | 77 | `Architectural approves design, then complete Planner spec/self-review` | `Architectural replaces design approval with one [start confirmation](#architectural-start-confirmation), then complete Planner spec/self-review` (뒤는 그대로) |
| P15 | 78 | `3. Assess plan depth after design approval and before Implementer, separately from files/LOC/Bounded label.` | `3. Assess plan depth after design approval (Architectural: start confirmation) and before Implementer, separately from files/LOC/Bounded label.` |
| P16 | 84 | `Design approval does not transfer initial authorship.` | `Design approval or start confirmation does not transfer initial authorship.` |
| P17 | 90 (R1) | `attaching the author judgments made since design approval ([decision inventory](#decision-inventory));` | `attaching the complete author-judgment lists of the spec and every plan ([decision inventory](#decision-inventory));` |
| P18 | 93 (R4) | `Within approved design scope Orchestrator revises the spec directly; a genuinely new decision outside it needs user input and revised design approval, then the affected documents are redrafted.` | `Within the confirmed start scope Orchestrator revises the spec directly; a genuinely new decision outside it needs user input, which Orchestrator records in the spec; it then rechecks spec↔plan consistency and the affected documents are redrafted.` |
| P19 | 126 (Spec 행) | `\| Spec \| Approved design scope/evidence, complete Planner draft/self-review,` | `\| Spec \| Confirmed start scope/evidence ([start confirmation](#architectural-start-confirmation)), complete Planner draft/self-review,` |
| P20 | 127 (Plan 행) | `\| Plan \| Approved design; for Architectural, the reviewed spec path/version/SHA-256 and review evidence;` | `\| Plan \| Bounded: approved design; Architectural: confirmed start scope and the reviewed spec path/version/SHA-256 and review evidence;` |
| P21 | 138 (Order 문장 뒤) | `Order: initial design approval → … → final Git → Implementer.` | Order 문장은 그대로 둔다(SJ2). 바로 뒤에 `On the Architectural path, [start confirmation](#architectural-start-confirmation) takes the place of initial design approval in this order and carries the explicit target choice.`를 넣는다 |
| P22 | 147 (Architectural 행) | `\| Architectural \| Design → reviewed written spec → all \`writing-plans\` plans → one combined spec+plan approval. First spec draft before target preparation; full set before batch/final checks/handoff \|` | `\| Architectural \| Start confirmation → reviewed written spec → all \`writing-plans\` plans → one combined spec+plan approval. First spec draft before target preparation; full set before batch/final checks/handoff \|` |
| P23 | 157 | `Hold, obtain the applicable design approval and document approvals below` | `Hold, obtain the applicable design approval (Bounded; Architectural records the new decision in the revised spec) and document approvals below` (SJ11) |
| P24 | 220 다음 (Full Auto 표) | (없음) | `\| Design and short-design approval \| auto \| After Orchestrator review \|` 행 바로 뒤에 `\| Architectural start confirmation \| auto \| Scope only within the original request, otherwise user; target follows the Execution-target choice row \|`를 넣는다(J4, SJ6) |

#### 3.1.1 새 절 (P9, J5, J7)

```markdown
<a id="architectural-start-confirmation"></a>
### Architectural start confirmation

1. Scope: on the Architectural path there is no design document and no design approval. Bounded keeps its design approval; Spike, the direct path (F1–F8) and non-behavior paths are unchanged.
2. Start summary: when the [design conversation](#design-conversation) ends, the design Planner returns a short start summary instead of a final design: scope to change, user decisions, author judgments, already-answered items, open checks, path/depth/risk judgment, document set with planned relative paths, and every file or contract marked change or no change (reason). It carries the [decision inventory](#decision-inventory).
3. Confirmation: Orchestrator presents the summary and, in one confirmation, obtains the user's scope confirmation and explicit target choice under [handoff](handoff.md). The summary is neither saved nor committed. The confirmed summary supplies the approved scope/depth/document set and explicit choice required by the [formal drafting boundary](#formal-drafting-boundary).
4. Continuation: Orchestrator sends the same Planner a spec-stage delta brief with verified source/branch/HEAD/ownership, the target choice, confirmed scope, document set, planned paths and exploration budget; that Planner returns the complete first spec draft and self-review. If that Planner is unavailable or its role, context or source is no longer valid, assign a fresh spec Planner with a complete initial brief.
5. Records: the spec records the conversation's user decisions and author judgments; later author judgments join the same list. A genuinely new decision during spec or plan drafting goes to the user; Orchestrator records the answer in the spec, rechecks spec↔plan consistency and redrafts affected documents. No design approval is requested.
6. Full Auto: under [Full Auto](#full-auto-run-mode), scope confirmation within the original request may be auto-decided; target choice follows the Execution-target choice row; [approval.run-mode] limits apply unchanged.
```

### 3.2 `coordination.md` 92행 (C1, 4개 플랫폼)
- `NEVER reuse a Planner across stages.`를 `NEVER reuse a Planner across stages, except that on the Architectural path the design Planner continues as the spec Planner after [start confirmation](planning.md#architectural-start-confirmation) while role, context and source remain valid.`로 바꾼다.
- `After design approval, the spec stage and the plan stage each use a fresh Planner whose brief contains`를 `Every plan stage, and an Architectural spec stage without that continuation, uses a fresh Planner whose brief contains`로 바꾼다. 뒤는 그대로다.
- 같은 행의 `Within the design/brainstorming stage one Planner handles every … any eligible further call;`와 `In the design stage, conversation responses are expected returns …`는 그대로 둔다.

### 3.3 `handoff.md` 27행 (H1, 4개 플랫폼)
- `After initial design approval record explicit selection:`를 `After initial design approval, or within the Architectural [start confirmation](planning.md#architectural-start-confirmation), record explicit selection:`로 바꾼다. 뒤는 그대로다(SJ3).

### 3.4 `SKILL.md` 18행 (S1, 4개 플랫폼)
- `` `design` (Planner design required, approved or omitted, and why)``를 `` `design` (Planner design required, approved, start confirmed (Architectural) or omitted, and why)``로 바꾼다.
- 나머지 문장은 그대로다. "Planner design stage"와 "starts with Planner design"도 유지한다(J6).

### 3.5 `lib/policy/role-policy.json` 431행 `[planning.planner-brief]`

| ID | 현재 | 변경 후 |
|---|---|---|
| RP1 | `Reuse the same Planner instance only within the design/brainstorming stage while its role, context and source remain valid; after design approval, use a fresh Planner instance for each spec and plan stage, whose initial brief contains every required field, saved document paths and approved versions (for the Architectural plan stage, the reviewed spec path, version and SHA-256).` | `Reuse the same Planner instance only within the design/brainstorming stage while its role, context and source remain valid, except that on the Architectural path that Planner continues as the spec Planner after start confirmation through a spec-stage delta brief; use a fresh Planner instance for each plan stage, and for an Architectural spec stage when that Planner is unavailable or its role, context or source is no longer valid, whose initial brief contains every required field, saved document paths and approved versions (for the Architectural plan stage, the reviewed spec path, version and SHA-256).` |
| RP2 | `…, one design section with a confirmation question, or the final design. Ask one question` / `when the user says to proceed, stop asking and list the remaining author judgments in the final design.` | `…, one design section with a confirmation question, or the final design (Architectural: the start summary). Ask one question` / `when the user says to proceed, stop asking and list the remaining author judgments in the final design or start summary.` |
| RP3 | `Orchestrator reviews the final design once with the fixed checklist, including decision-inventory completeness and no ambiguous scope wording, and sends one consolidated correction using changed fields only.` | 그대로 두고 바로 뒤에 `On the Architectural path the start summary receives no consolidated correction; the spec draft takes Orchestrator's review and direct revision.`를 넣는다 |
| RP4 | `Obtain design approval before spec or plan drafting. For Architectural work, draft the spec and then the plan with fresh Planners, assigning the plan Planner only after the spec is saved and reviewed and its path, version and SHA-256 are fixed; NEVER draft them concurrently; then obtain one combined spec+plan approval. Bounded work has no spec stage; required plans keep their own approval.` | `For Bounded work, obtain design approval before plan drafting. For Architectural work, obtain one start confirmation (scope and explicit target; no design document or design approval) before spec drafting, let the design Planner continue as the spec Planner (a fresh spec Planner when it is unavailable or invalid), then draft the plan with a fresh Planner, assigning the plan Planner only after the spec is saved and reviewed and its path, version and SHA-256 are fixed; NEVER draft them concurrently; then obtain one combined spec+plan approval. Bounded work has no spec stage; required plans keep their own approval.` |

반영 방법은 원본을 수정한 뒤 `npm run update:role-policy`를 실행하는 것이다. 4개 플랫폼 SKILL.md, agents, references의 관리 구간이 다시 생성된다.

### 3.6 `lib/prompts/agent-fragments.json` 70행 `planner.workflow-contract`

| ID | 현재 | 변경 후 |
|---|---|---|
| F1 | `…, one design section with a confirmation question, or the final design with context, Spike/Bounded/Architectural path,` | `…, one design section with a confirmation question, or the final design (on the Architectural path, the start summary) with context, Spike/Bounded/Architectural path,` |
| F2 | `Before the final design, build a decision inventory` | `Before the final design or Architectural start summary, build a decision inventory` |
| F3 | `Orchestrator integrates, routes answers/revisions and obtains approval. After architectural design approval, return a complete spec and self-review;` | `Orchestrator integrates, routes answers/revisions and obtains approval. On the Architectural path there is no design document or design approval: after Orchestrator relays the start confirmation in a spec-stage delta brief, continue as the spec Planner and return a complete spec and self-review;` (뒤의 `Orchestrator saves/reviews and directly revises the same spec when needed, without a separate spec approval; a fresh plan Planner drafts next.`는 그대로) |
| F4 | `answered by the design → follow it and cite the basis;` / `genuinely new decision that changes the deliverable and is absent from the design → return it as an open decision with why the design review missed it.` | `answered by the design or confirmed start summary → follow it and cite the basis;` / `genuinely new decision that changes the deliverable and is absent from the design or confirmed start summary → return it as an open decision with why the design review or start confirmation missed it.` |

## 4. 런타임
바꾸지 않는다. `lib/runtime`에는 `design` stage가 없다. 첫 stage는 spec(evaluate.mjs:227)이고, plan은 리뷰된 spec을 전제로 한다(238). 따라서 Architectural design 생략은 이미 막히지 않는다.

## 5. 생성·동기화 절차
선례 spec(`docs/superpowers/specs/2026-11-26-spec-plan-approval-merge-design.md` §5)과 같은 순서로 진행한다.
1. `npm run update:role-policy`. 검사는 `npm run check:role-policy`다.
2. `node scripts/update-runtime-assets.mjs`. 검사는 `--check`다.
3. agent-fragments 변경은 설치 렌더링으로 반영된다. 저장소 안의 Planner 프로필 사본은 렌더링 결과 해시(`instruction-contracts.json` `agentProfileBaseline`)로만 검증된다.
4. `node tests/node/fixtures/installed-layout.mjs --write`. 검사는 `--diff`다.
5. `tests/node/plan.test.mjs` `renderingBaseline`에서 바뀐 digest만 다시 계산해 갱신한다.
6. `tests/node/fixtures/instruction-contracts.json`을 갱신한다. 대상은 보호 텍스트 사본, `protected` SHA-256, `agentProfileBaseline`이다(§6.1 T-N6).
7. `node scripts/check-installer-parity.mjs`. inventory 해시는 바꾸지 않는다.
8. `node scripts/update-manifest.mjs`. 검사는 `npm run check:manifest`다.

## 6. 테스트 변경 명세

### 6.1 바꾸는 assert

| ID | 파일:행 | 현재 | 변경 후 |
|---|---|---|---|
| T-P1 | `tests/test_arc_policy.py:1633` (APPROVAL_RULES) | `'Architectural approves design, then complete Planner spec/self-review …'` | P14 변경 후 문장 전체 |
| T-P2 | `tests/test_arc_policy.py:1635` | `'Assess plan depth after design approval and before Implementer, separately from files/LOC/Bounded label.'` | P15 변경 후 문장 |
| T-P3 | `tests/test_arc_policy.py:1639` | `'Design → reviewed written spec → all \`writing-plans\` plans → …'` | `'Start confirmation → reviewed written spec → all \`writing-plans\` plans → one combined spec+plan approval. First spec draft before target preparation; full set before batch/final checks/handoff'` |
| T-P4 | `tests/test_arc_policy.py:1666` (INVENTORY_REFERENCE) | `r"attaching the author judgments made since design approval \(\[decision inventory\]\(#decision-inventory\)\)"` | `r"attaching the complete author-judgment lists of the spec and every plan \(\[decision inventory\]\(#decision-inventory\)\)"` |
| T-P5 | `tests/test_arc_policy.py:1709` (rule) | RP4 현재 문장 | RP4 변경 후 문장 |
| T-P6 | `tests/test_arc_policy.py:1755` (DESIGN_RULES rule 1) | `"… or the final design. Planner splits …"` | P6 변경 후 문장 |
| T-P7 | `tests/test_arc_policy.py:1758` (rule 4) | `"4. Short path and opt-out: … list them in the final design."` | P7 변경 후 문장 |
| T-P8 | `tests/test_arc_policy.py:1769` (MANAGED_RULES) | `"… or the final design. Ask one question … list the remaining author judgments in the final design. … Conversation responses use no correction opportunity."` | RP2를 반영한 같은 범위의 문장 |
| T-P9 | `tests/test_arc_policy.py:1773` (INVENTORY_RULES) | `"; roles/approval/commit boundaries; completeness; inventory/scope notation (final design: complete …"` | P4를 반영한 문장 |
| T-P10 | `tests/test_arc_policy.py:1776` | `"1. Decision inventory: before returning the final design, …"` | P10 변경 후 문장 |
| T-P11 | `tests/test_arc_policy.py:1781` (CLASSIFICATION_RULES 4) | `"… Answered by the design: follow it … absent from the design): … why the design review missed it; …"` | P12를 반영한 문장 |
| T-P12 | `tests/test_arc_policy.py:1782` (5) | `"5. Approval attachments: … attach the author judgments made since design approval. …"` | P13 변경 후 문장 |
| T-P13 | `tests/test_arc_policy.py:1823` | `"attaching the author judgments made since design approval ([decision inventory](#decision-inventory));"` | `"attaching the complete author-judgment lists of the spec and every plan ([decision inventory](#decision-inventory));"` |
| T-N1 | `tests/node/agent-fragments.test.mjs:115` (`conversation`) | `"… or the final design with context, … Before the final design, build a decision inventory …"` | F1·F2를 반영한 같은 범위의 문장 |
| T-N2 | `tests/node/agent-fragments.test.mjs:116` (`classification`) | `"- In spec and plan stages, … answered by the design → … absent from the design → … why the design review missed it. …"` | F4를 반영한 문장 |
| T-N3 | `tests/node/composite-instructions.test.mjs:32` (`gate`) | `` "… `design` (Planner design required, approved or omitted, and why), …" `` | S1을 반영한 SKILL.md:18 전체 문장(O1 → change, SJ9) |
| T-N4 | `tests/node/run-mode-contract.test.mjs:27` 다음 (`planningSection`) | `\| Design and short-design approval \| auto \| After Orchestrator review \|` 다음 행이 `\| Architectural spec+plan combined approval …` | 그 사이에 P24 행을 넣는다 |
| T-N5 | `tests/node/plan.test.mjs:226–233` | 8개 digest | 바뀐 digest만 갱신(§5-5) |
| T-N6 | `tests/node/fixtures/instruction-contracts.json` 14·126(SKILL gate 사본), 89·208(design path 절 사본), 96·215(save gates 사본), 103·222(complete set 사본), 201(claude Formal drafting boundary 사본) | 현재 정책 문구 | S1, P14–P18, P19–P20, P21–P22, P1(201행)의 변경 후 문구(OR4). 보호 해시와 `agentProfileBaseline`(F1–F4로 4개 Planner 프로필 해시가 바뀜)도 함께 갱신한다 |
| T-N7 | `tests/node/fixtures/installed-layout-golden.json` | 현재 golden | `--write` 결과 |

### 6.2 바꾸지 않는 assert (현재 정규식·문자열이 새 문구에서도 성립)

| 파일:행 | 현재 | 이유 |
|---|---|---|
| `tests/test_arc_policy.py:161`, `:223` | `r"order: initial design approval.*explicit target and source snapshot.*…final git.*implementer"` | P21이 Order 문장을 유지한다(SJ2) |
| `tests/test_arc_policy.py:1046` | `r"after initial design approval.*explicit user choice.*current checkout.*new task branch.*new managed worktree and task branch"` | H1이 앞부분을 유지하고 사이에만 삽입한다(SJ3) |
| `tests/test_arc_policy.py:1518`, `tests/test_claude_payload.py:717` | marker 순서 `("initial design approval", "explicit target and source snapshot", …)` | Order 문장을 유지한다(SJ2) |
| `tests/test_harness_contract.py:362–369` | `r"\border:(?= initial design approval →)(.*?)(?:\.(?: \|$)\|$)"`와 sequence | Order 문장을 유지하고, 첫 마침표에서 캡처가 끝나므로 덧붙인 문장은 캡처되지 않는다 |
| `tests/test_harness_contract.py:530–549` | `Order: initial design approval.*?→ Implementer\.` 치환과 gate 목록 | 같은 이유 |
| `tests/test_arc_policy.py:1748`, `1751`, `1761`, `1765`, `1766`, `1770`, `1778`, `REVIEWED_SPEC`(1788) | 각 문자열 | 기존 문장을 남기고 뒤에 덧붙이므로 부분 문자열로 계속 포함된다(SJ13) |
| `tests/test_arc_policy.py:1736` | `'Applicable design/spec/plan approvals/artifacts or valid omissions'` | handoff.md 34행을 바꾸지 않는다 |
| `tests/node/role-policy.test.mjs:305–306` | `/design and brainstorming.*design conversation.*final design/i`, `/reviews the final design once with the fixed checklist.*one consolidated correction/i` | RP2·RP3가 해당 문구를 유지한다(SJ12) |
| `tests/node/agent-fragments.test.mjs:118` | `'without a separate spec approval; a fresh plan Planner drafts next.'` | F3이 이 꼬리 문구를 유지한다 |
| `tests/node/composite-instructions.test.mjs:38` | `'4. Record dependencies/depth reasons; also post the design path, …'` | planning.md 79행을 바꾸지 않는다 |

### 6.3 새 테스트 (`tests/test_arc_policy.py`, 새 클래스 `ArchitecturalStartConfirmationTests`, 4개 플랫폼)
- **N1:** §3.1.1 절(anchor, 제목, 1–6항)이 각 `planning.md` 편집 구간에 있고, 4개 플랫폼에서 바이트가 같다.
- **N2:** P1, P3, P5, P8, P11, P21, P24 변경 후 문장이 있다. 이 가운데 P24는 Full Auto 절 표 안에 있어야 한다.
- **N3:** C1(coordination.md), H1(handoff.md), S1(SKILL.md) 변경 후 문장이 있다.
- **N4:** 관리 구간에 RP1과 RP3 덧붙임 문장이 정확히 1회씩 있다.
- **N5:** 옛 문구 재유입을 막는다(SJ10). 대상은 4개 플랫폼 `skill/**/*.md`, `lib/policy/role-policy.json`, `lib/prompts/agent-fragments.json`이고, 다음 문구가 없어야 한다.
  - `Architectural approves design`
  - `revised design approval`
  - `After architectural design approval`
  - `Obtain design approval before spec or plan drafting`
  - `After design approval, the spec stage`
  - `Approved design scope/evidence`

## 7. 수용 기준
- **AC1:** Architectural에는 design 문서와 design 승인이 없다. 첫 spec 초안 전에 착수 확인이 1회 있다. 착수 확인은 요약 제시, 범위 확인, explicit target choice로 이루어지고 저장·커밋하지 않는다. 이 확인이 formal drafting boundary의 입력을 충족한다고 명시한다(P1, §3.1.1-2·3).
- **AC2:** Planner stage 재사용 금지의 예외는 Architectural 대화 → spec 하나뿐이다. delta brief 필수 필드와 fresh spec Planner fallback(전체 initial brief)이 명시된다(P2–P3, §3.1.1-4, C1, RP1, F3).
- **AC3:** R0, fresh plan Planner, 결합 승인 R1–R6의 승인 단위가 바뀌지 않는다. §6.1에서 R0·R2·R3·R5·R6 APPROVAL_RULES 문자열이 그대로 통과한다.
- **AC4:** Architectural의 사용자 결정과 작성자 판단은 spec에 기록된다. 결합 승인 요청에는 spec과 모든 plan의 작성자 판단 목록 전체가 첨부된다. Bounded는 "since design approval" 첨부를 유지한다(P11, P13, P17).
- **AC5:** Architectural spec·plan 단계의 새 결정은 사용자 결정 → Orchestrator의 spec 기록·수정 → spec↔plan 재확인으로 처리된다. "revised design approval"이 남지 않는다(P18, §3.1.1-5, N5).
- **AC6:** Bounded의 design 승인, plan depth 판단, plan 생략 조건, plan 승인 후 커밋의 의미가 같다. 관련 문장(planning.md 78 Bounded 부분, 82, 145–146, 138 Bounded 분기)이 바뀌지 않는다.
- **AC7:** 작업 순서에서 Architectural은 start confirmation이 initial design approval을 대체하고 explicit target choice를 담는다(P21). handoff.md:27의 target 선택 시점도 두 경로로 나뉜다(H1).
- **AC8:** 원본(role-policy.json, agent-fragments.json)이 바뀐다. §5 절차 뒤 `check:role-policy`, `update-runtime-assets --check`, `installed-layout --diff`, `check-installer-parity`, `check:manifest`가 통과한다. 4개 플랫폼 본문은 플랫폼 관리 문구를 빼면 동일하다.
- **AC9:** Full Auto에서는 착수 확인의 범위 확인만 auto-decision 대상이다. target 선택은 Execution-target choice 행을 따르고, [approval.run-mode] 한계는 현행이다. run-mode 표에 P24 행이 반영된다(T-N4).
- **AC10:** SKILL.md Pre-action gate `design` 필드가 Architectural "start confirmed" 값을 기록할 수 있다(S1, T-N3).
- **AC11:** `lib/runtime/**`의 diff가 0이다. 전체 테스트(Python·Node)는 baseline 대비 새 실패가 없다. 기존 실패와 부하 flake는 baseline으로 판정한다.
- **AC12:** Spike와 direct path(F1–F8)의 규칙 문장이 바뀌지 않는다(planning.md:49 "Spike, the direct path (F1–F8) and non-behavior paths keep their existing rules" 유지).
- **AC13:** §6.1의 갱신 assert, §6.2의 무변경 assert, §6.3 N1–N5가 모두 통과한다.

## 8. 사용자 결정

| ID | 결정 | 출처 |
|---|---|---|
| U1 | 이유: Planner를 3번 호출해 시간과 토큰이 낭비됨 | 대화 답 1 |
| U2 | 접근 A: 대화 Planner가 이어서 spec을 쓰고, plan은 fresh Planner가 씀 | 대화 답 2 |
| U3 | Architectural 흐름 1–5와 착수 확인(요약, 범위 확인, explicit target choice, 저장·커밋 없음). 새 결정은 그때 묻고 반영 | 대화 답 3 |
| U4 | Bounded 커밋 시점은 현행(plan 승인 후 plan만 1회 커밋, design 커밋 없음, plan 생략 시 계획 문서 커밋 없음) | 대화 답 3, planning.md:138 |
| U5 | 변경 범위 승인 | 대화 답 4 |
| U6 | 이번 작업에도 새 흐름을 먼저 적용 | 사용자 지시, 착수 확인 답 |

## 9. 작성자 판단

| ID | 판단 | 이유 |
|---|---|---|
| J1 | 결정과 decision inventory는 spec이 흡수한다. 결합 승인에는 spec·plan의 작성자 판단 목록 전체를 첨부한다 | design 문서가 없다 |
| J2 | 새 결정은 사용자 결정 → spec 수정 → spec↔plan 재확인으로 처리한다. design 재승인은 없다 | 결합 승인 전이다 |
| J3 | plan depth 판단 시점은 바뀌지 않는다. Architectural은 항상 plan이 필요하다 | 결과가 같다 |
| J4 | Full Auto에서는 범위 확인만 auto 대상이다. target은 기존 행을 따른다 | 경계를 넓히지 않는다 |
| J5 | stage 재사용 예외는 대화 → spec 하나이고, fallback은 fresh spec Planner다 | U2를 구현하면서 brief 요구를 보존한다 |
| J6 | `design` 필드와 "Planner design stage" 이름은 유지하고 값만 추가한다 | 연쇄 최소화 |
| J7 | 용어 "Architectural start confirmation", anchor `architectural-start-confirmation` | 참조 일관성 |
| J8 | 4개 플랫폼 본문 parity를 유지한다 | 현행 계약 |
| SJ1 | 기존 문장은 남기고 Architectural 문장을 덧붙인다 | 테스트·fixture 연쇄 최소화. 의미는 같다 |
| SJ2 | Order 문장은 그대로 두고 대체 문장을 덧붙인다. 그래서 `test_arc_policy.py:161·223·1518`, `test_harness_contract.py:362–549`, `test_claude_payload.py:717`은 no change로 재분류한다 | design 5절에서는 change였지만 산출물 의미(AC7)는 같고 변경이 줄어든다 |
| SJ3 | handoff.md:27은 삽입형으로 바꾼다. 그래서 `test_arc_policy.py:1046`은 no change다 | 같은 이유 |
| SJ4 | handoff-prep.md:12는 no change다 | "design/plan depth"는 경로 분류이고, 착수 확인은 planning.md가 정의한다 |
| SJ5 | role-policy.json 233행 `[role.planner-draft-only]`는 no change다 | design 승인을 언급하지 않는다 |
| SJ6 | Full Auto 표는 기존 행을 유지하고 새 행을 추가한다 | Bounded 행이 그대로 필요하다 |
| SJ7 | 개정 이력 표는 선례와 같은 영어 열 이름(`Version \| Approval time \| …`)을 쓴다 | planning.md Full Auto Records가 `Approval time`을 참조한다 |
| SJ8 | 착수 요약의 필드 목록은 §3.1.1-2와 같다 | 이번 작업의 착수 요약과 같은 구성이다 |
| SJ9 | O1은 change로 확정한다 | composite-instructions.test.mjs:32가 SKILL.md:18 전체 문장을 `includes`로 비교한다 |
| SJ10 | 옛 문구 재유입 방지 테스트(N5)를 추가한다 | 선례 REMOVED_WORDING 방식 |
| SJ11 | planning.md:157 실행 중 개정 문구에 Architectural 처리를 명시한다 | design 승인이 없는 경로의 공백을 메운다 |
| SJ12 | role-policy.test.mjs:305–306은 no change다 | RP2·RP3가 문구를 유지한다 |
| SJ13 | 덧붙이기만 한 문장의 기존 문자열 assert는 no change다 | 부분 문자열 일치가 유지된다 |

## 10. Decision inventory

| 항목 | 분류 | 근거 |
|---|---|---|
| 이유·접근·흐름·Bounded·범위·선적용 | 사용자 결정 | U1–U6 |
| 결정 기록 위치, 새 결정 경로, depth 시점, Full Auto, 재사용 예외, 명칭, parity | 작성자 판단 | J1–J8 |
| 문구 작성 방식, 테스트 재분류, 개정 이력 형식, 새 테스트 | 작성자 판단 | SJ1–SJ13 |
| 런타임 변경 여부 | 이미 답 있음 | evaluate.mjs:227·238, schema.mjs:105 |
| R0 유지 | 이미 답 있음 | U2, planning.md:89 |
| Spike·direct path 제외 | 이미 답 있음 | planning.md:49 |
| 생성 절차 | 이미 답 있음 | 선례 spec §5 |
| O1 | 해소 | SJ9 |

## 11. 경로·위험·검증
- 경로는 Architectural이다. 정책 원본, 4개 플랫폼 문서, 생성물, 계약 테스트에 걸친 cross-component 변경이고, Planner stage 수명과 승인 순서를 바꾼다.
- 위험은 중상이다. 승인 게이트를 없애고, 생성물·MANIFEST·해시 fixture 연쇄와 parity 계약이 있다.
  - task마다 fresh Tester를 둔다.
  - 모든 task 승인 뒤 전체 변경에 대해 final Reviewer를 1회 둔다.
- 최소 검증은 다음과 같다.
  - `npm run check:role-policy`, `node scripts/update-runtime-assets.mjs --check`, `node tests/node/fixtures/installed-layout.mjs --diff`, `node scripts/check-installer-parity.mjs`, `npm run check:manifest`
  - Python 정책 테스트(`tests/test_arc_policy.py`, `tests/test_harness_contract.py`, `tests/test_claude_payload.py`)
  - Node 테스트(`tests/node/{agent-fragments,composite-instructions,run-mode-contract,role-policy,instruction-layout,installed-layout-golden,plan}.test.mjs`)
  - 마지막에 전체 회귀를 실행해 baseline과 비교한다.

## 12. plan 작성 참고 (task 경계는 plan Planner가 정함)
- 모든 변경이 `planning.md`(편집 구간과 관리 구간), `tests/test_arc_policy.py`, `instruction-contracts.json`, `MANIFEST.sha256`을 함께 건드린다. 그래서 task를 나누면 순차로 진행해야 한다.
- 후보는 둘이다.
  - 편집 구간(P·C1·H1·S1과 해당 테스트)과 원본(RP·F와 생성물·해시)을 나누는 2개 task
  - 하나의 inseparable task(planning.md:102)
- 어느 쪽이든 task마다 §5를 실행해 검사를 녹색으로 유지해야 한다.

## 13. 미결 확인
- 없음. O1은 SJ9로 해소했다.

## 14. Orchestrator 리뷰 수정
| ID | 수정 | 이유 |
|---|---|---|
| OR1 | 렌더러 no change 행에 role-policy 렌더러 `lib/policy/render.mjs`를 추가 | Scouter 근거(render.mjs:33)가 가리키는 파일이 `lib/policy/render.mjs`다 |
| OR2 | SJ2–SJ5 재분류(사용자가 승인한 변경 범위 U5에서 change였던 테스트 5개 파일 행, handoff-prep.md:12, role-policy.json:233을 no change로)는 결합 승인 요청에 범위 축소로 명시해 사용자 확인을 받는다 | 범위를 줄이고 결과 의미는 같지만 U5와 다르다 |
| OR3 | §3.1–§3.6 "현재" 문장 8개를 4개 플랫폼에서 Orchestrator가 완전 일치로 확인(각 플랫폼 1건), role-policy.json·agent-fragments.json 대상 문장 각 1건 확인 | Planner self-review의 미확인 항목 3 보완 |
| OR4 | T-N6에 P17(89·208), P22(103·222), P1(201행 claude Formal drafting boundary 사본)을 추가 | plan Planner PJ2 지적을 Orchestrator가 fixture grep으로 확인(각 문장이 해당 행에 존재) |

## 개정 이력

| Version | Approval time | Classification | Affected tasks | Reason |
|---|---|---|---|---|
| v1 | 결합 승인 대기 | initial | (plan에서 확정) | Planner 첫 초안 + Orchestrator 리뷰 수정 OR1–OR4 |
