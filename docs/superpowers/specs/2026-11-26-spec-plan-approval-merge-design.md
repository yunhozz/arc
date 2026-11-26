# Spec: Bounded spec 생략, Architectural spec·plan 결합 승인, design 단계 대화 강화

- 단계: written spec (Planner 첫 초안 → Orchestrator 저장·리뷰·수정. 승인 요청은 plan과 결합)
- 근거 design: 개정 design v2, 사용자 승인 2026-11-26. 경로 `/private/tmp/claude-501/-Users-ma-24-007-Desktop-workspace-arc/881cf134-8e38-4d55-bdab-567b83f71dcf/scratchpad/2026-11-26-spec-plan-approval-merge-design-v2.md`, SHA-256 `f7f93a099808717d73190c7cb33b6b6f25545b07a1629946bd9fd330213b6c60`. 이 spec은 design v2의 결정(G1–G5, R0–R8, U1–U7, J1–J10, AC1–AC17)을 모두 담는다.
- 버전: v2 (Planner 초안 + Orchestrator 리뷰 수정: SJ6, RT2 결합 승인 destination 검증). spec v1(SHA-256 `de0cbbe28d84a8d9bbe55d32ddf770e262e7627e0ca2ed79d141b7142db02936`, 리뷰됨, 미승인)을 design v2 §10에 따라 개정했다.
- 출처: `/Users/ma-24-007/Desktop/workspace/arc` master `313b0d033df744760978335c38e2b7b334760045`
- 대상: 현재 checkout의 브랜치 `chore/spec-plan-approval-merge` (base 313b0d03)
- 경로/깊이/위험: Architectural / plan 필요 / 중상
- 이번 작업에 새 규칙을 먼저 적용: spec 저장·리뷰 → fresh plan Planner → plan 저장·리뷰 → 결합 승인 1회 → planning-document 커밋 1회. 작성 중 생긴 질문은 design v2 §3.2의 세 갈래로 분류하고, 작성자 판단은 §13에 기록한다.

## 1. 목표와 비목표

### 1.1 목표
- **G1 (Bounded):** spec 필요성 판단·기록, spec 단계, spec 승인을 정책과 런타임에서 없앤다. design 승인 → plan 깊이 판단(생략 조건 동일) → plan 작성·승인 또는 plan 생략은 유지한다.
- **G2 (Architectural):** spec Planner와 plan Planner를 각각 fresh로, 순서대로 배정한다. spec 개별 승인은 없애고, spec과 범위 내 모든 plan을 한 번에 승인한다.
- **G3 (런타임 정합):** 런타임 게이트가 G1/G2와 일치해야 한다. 기존 결함, 즉 Bounded plan-only가 plan 모드 Implementer/docs-commit/readiness 게이트를 통과하지 못하는 문제도 함께 고친다.
- **G4 (design 대화):** design 단계에서 brainstorming의 원래 의도대로 사용자와 의견을 주고받는다(design v2 §3.1).
- **G5 (질문 앞당기기):** design 단계에서 결정 inventory를 완결해, spec·plan 단계의 추가 질문을 "진짜 새 결정"으로 한정한다(design v2 §3.2).

### 1.2 바꾸지 않는 것
- Planner만 첫 초안을 쓰고, 단계마다 fresh Planner를 쓴다. 저장, 리뷰, 직접 수정은 Orchestrator가 맡는다.
- Planner는 사용자와 직접 대화하지 않는다. 경로는 Planner → Orchestrator → 사용자 → Orchestrator → 같은 Planner다.
- spec·plan 단계의 "예산 hold delta에만 같은 Planner 재사용" 규칙은 그대로다(J4). G4는 design 단계에만 적용한다.
- Spike, direct path(F1–F8), non-behavior 경로에는 대화 방식을 강제하지 않는다(J5).
- Tester, Reviewer, 커밋, 대상 준비, 보존 규칙과 Full Auto 비허용 목록은 그대로다.
- plan 생략 조건(F1–F8 direct path, Bounded omission 조건)은 그대로다.
- cooperative 런타임의 `no-plan`/plan omission 미지원(`external.mjs:51` `omission:'unsupported'`)은 그대로다.
- 런타임 Planner 호출 ledger(`evaluate.mjs` `evaluatePlannerCall`, 기준선 159행부터)와 Planner stage kind(`schema.mjs:89`, `spec`/`plan`)는 바꾸지 않는다(J2, §4.8).
- 범위 밖 결정은 사용자에게 먼저 묻는다.

## 2. 용어
- **리뷰된 spec(reviewed spec):** 준비된 대상에 저장되고, Orchestrator가 전체 리뷰를 마치고 필요한 수정을 반영한 spec. 증거는 경로, 버전, SHA-256(`sha256:<hex>`)과 full/complete 리뷰 기록이다. 승인은 필요 없다.
- **결합 승인(combined approval):** spec 1개와 범위 내 모든 plan의 정확한 버전·SHA-256 세트에 대한 사용자 승인 1건. 각 문서의 `approvalRef`는 같은 승인을 가리킨다.
- **유효 문서 세트:** Architectural은 정확히 `{spec, plan}`, Bounded plan-required는 정확히 `{plan}`. Bounded에 spec이 들어 있으면 유효하지 않다.
- **결정 inventory:** 최종 design이 spec·plan 작성에서 정해야 할 항목을 사용자 결정, 작성자 판단, 이미 답 있음의 셋으로 분류한 목록.
- **작성자 판단(author judgment):** 결과물을 바꾸지 않는 사소한 항목. 작성자가 정하고 ID·판단·이유를 기록한다. open decision이 아니다.
- **진짜 새 결정:** 결과물을 바꾸면서 design에 없는 결정. open decision으로 반환하고 design 점검에서 놓친 이유를 함께 적는다.

## 3. 정책 규칙 명세

공통 사항:
- 아래 영문 문구는 초안이다. 의미가 같으면 Orchestrator가 다듬을 수 있다.
- 4개 플랫폼(`claude`, `codex`, `gemini`, `grok`)의 `skill/references/*.md`는 같은 문구를 쓰며, 행 번호만 다를 수 있다(§3.6).
- 행 번호는 master 313b0d03 기준이다. `planning.md`는 Claude/Gemini/Grok이 같고 Codex는 대체로 +2(Full Auto 표는 +3)이다. `coordination.md` 92행은 Codex에서 90행이다(grep 확인). 그 밖의 파일은 4개 플랫폼 행 번호가 같다.

### 3.0 파일별 범위 (design v2 §4.3 대응)

| 파일 | 범위 | 명세 |
|---|---|---|
| `{claude,codex,gemini,grok}/skill/references/planning.md` | 바꾼다 | P1–P25, §3.1.1–§3.1.4. 관리 구간(C 160행, Cd 163행)은 생성기로만 반영한다 |
| `.../handoff-prep.md` | 바꾼다 | H1–H4 |
| `.../handoff.md` 170/193/195/205행 | 바꾼다 | §3.3 |
| `.../handoff.md` 34행 | 안 바꾼다 | "Applicable design/spec/plan approvals"는 결합 승인과 plan 승인을 모두 포괄한다 |
| `.../coordination.md` 92행(Cd 90) | 바꾼다 | C1 (§3.7) |
| `.../SKILL.md` | 직접은 안 바꾼다 | 해당 문구가 없다. role-policy 관리 구간만 생성기로 갱신한다 |
| `.../commit.md`, `.../verification.md` | 안 바꾼다 | 일반적인 "approved spec/plan" 표현이라 결합 승인과 plan 승인에 모두 맞는다. §7.2 grep에 걸리면 결함으로 처리한다 |
| `lib/policy/role-policy.json` `[planning.planner-brief]` | 바꾼다 | RP1–RP3 (§3.4) |
| `lib/prompts/agent-fragments.json` Planner 조각 | 바꾼다 | F1–F6 (§3.5) |
| `lib/runtime/{target-preparation,evaluate,cooperative,assignment,gate,schema,verification}.mjs` | 바꾼다 | RT1–RT9 (§4) |
| `lib/runtime/evaluate.mjs` `evaluatePlannerCall` | 안 바꾼다 | J2, §4.8 |
| `lib/runtime/schema.mjs:89` Planner stage kind | 안 바꾼다 | J2. design 단계는 런타임 ledger 대상이 아니다 |
| `lib/runtime/external.mjs` | 안 바꾼다 | no-plan/omission 미지원 상태를 유지한다 |
| `shared/skill/runtime/*` | 생성으로 바꾼다 | `scripts/update-runtime-assets.mjs` |
| 테스트·fixture | 바꾼다 | §5, §6 |
| `tests/node/runtime-assignment.test.mjs:129,160`, `runtime-cooperative.test.mjs:180,239` | 안 바꾼다 | ledger 회귀 검사로 그대로 통과해야 한다(AC16) |
| 외부 skill `brainstorming.md`, `writing-plans.md` | 안 바꾼다 | 외부 skill은 수정하지 않는다 |
| 사용자 홈 설치 사본 | 안 바꾼다 | 설치·배포 범위 밖이다 |
| `MANIFEST.sha256` | 바꾼다 | 마지막에 재생성한다 |

### 3.1 `planning.md`

| ID | 위치 (C/Gm/Gr; Cd) | 현재 | 변경 후 |
|---|---|---|---|
| P1 | 44; 46 (뒤 문장) | `Design/spec/plan stages remain separately ordered; spec approval precedes dependent planning.` | `Design, spec and plan stages remain separately ordered: Architectural plan drafting starts only after the spec is saved, reviewed and revised and its reviewed path, version and SHA-256 are fixed; NEVER draft spec and plan concurrently.` |
| P2 | 53 (item 2); 55 | `Architectural approves design, then complete Planner spec/self-review, Orchestrator save/review and written-spec approval before planning.` | `Architectural approves design, then complete Planner spec/self-review and Orchestrator save/review/revision without a separate spec approval request; a fresh plan Planner then drafts from the reviewed spec, and the spec and every plan receive one [combined approval](#architectural-combined-approval).` |
| P3 | 54 (item 3); 56 | `Assess plan depth after design/spec approval …`; `Architectural always uses \`writing-plans\` and written-plan approval …`; `… which also records Bounded spec necessity.` | `Assess plan depth after design approval …`; `Architectural always uses \`writing-plans\` and the combined spec+plan approval …`; 마지막 절을 지우고 `Labels/no-plan requests do not bypass judgment.`로 끝낸다. |
| P4 | 58; 60 (문단 전체) | `If Bounded requires written spec, record necessity/scope … Required plans alone imply no written spec.` | `Bounded has no spec stage, spec approval or spec-necessity record. If Bounded work appears to need a spec-level document, do not write one inside Bounded: reassess the design path as Architectural, inform the user and obtain the path-change approval required by existing rules before dependent drafting. Required plans alone imply no written spec.` |
| P5 | 60 다음 새 절 | (없음) | §3.1.1 `Architectural combined approval` 절(anchor `architectural-combined-approval`) |
| P6 | 87; 89 | `Before first Architectural spec, required Bounded spec or plan save, …` | `Before the first Architectural spec save or any plan save, …` |
| P7 | 91; 93 (Spec 행) | `… and absolute path. Required Bounded specs also need depth judgment, short design, necessity/scope` | `… and absolute path. Architectural only` |
| P8 | 92; 94 (Plan 행) | `Approved design and required approved spec/version/evidence, depth judgment, …` | `Approved design; for Architectural, the reviewed spec path/version/SHA-256 and review evidence; depth judgment, …` |
| P9 | 94; 96 | `Saving for review does not require prior written-spec approval, but does require valid target choice/actual preparation. Individually approved specs enter the document set before dependent planning.` | `Saving for review requires no prior document approval, but does require valid target choice/actual preparation. The reviewed Architectural spec enters the document set before dependent planning; approval follows once for the full set.` |
| P10 | 99; 101 | `Complete means every required document written/individually approved and …` | `Complete means every required document written and approved (Architectural: one combined spec+plan approval; Bounded: plan approval) and …` |
| P11 | 101; 103 | `Bounded follows recorded judgment; spec stages cover Architectural/required Bounded only, plan stages required plans only.` | `Spec stages cover Architectural only; plan stages cover required plans only.` |
| P12 | 103; 105 (Order) | `… → save/review/individual approval → dependent plans drafting/save/review/individual approval → full set → …` | `… → save/review/revision → Architectural: dependent plan drafting/save/review/revision → spec↔plan consistency check → one combined approval; Bounded: plan approval → full set → …` |
| P13 | 105; 107 | `save/self-review/approve uncommitted spec, approve all plans, then final batch.` | `save/self-review/review the uncommitted spec, draft/save/review all plans, obtain the combined approval, then final batch.` |
| P14 | 111; 113 (Bounded, plan required 행) | `Approve design/all required plans; approve necessary specs before dependent planning. Draft the first required document …` | `Approve design and all required plans; no spec. Draft the first required plan before target preparation; complete set before batch/handoff` |
| P15 | 112; 114 (Architectural 행) | `Design → written spec → all \`writing-plans\` plans. …` | `Design → reviewed written spec → all \`writing-plans\` plans → one combined spec+plan approval. First spec draft before target preparation; full set before batch/final checks/handoff` |
| P16 | 122; 124 | `Hold, obtain ordered design/spec/plan approvals and …`; `… obtain written-spec approval before a dependent plan revision.` | `Hold, obtain the applicable design approval and document approvals below and …`; 마지막 문장을 §3.1.2 R8 문단으로 바꾼다. |
| P17 | 171; 174 | `Record approved spec/plan SHA-256, shared docs-only commit …` | `Record approved planning-document SHA-256 (Architectural spec and plans; Bounded plans), shared docs-only commit …` |
| P18 | 184; 187 (Full Auto 표) | `\| Written spec approval \| auto \| After Orchestrator review \|` | `\| Architectural spec+plan combined approval \| auto \| Only with zero open decisions; otherwise user \|` (R7) |
| P19 | 185; 188 | `\| Plan approval \| auto \| Only with zero open decisions; otherwise user \|` | 바꾸지 않는다. Bounded plan과 R8 plan-only 개정에 쓴다(SJ2). |
| P20 | 40 (item 3); 42 | `Within the design/brainstorming stage, reuse one Planner instance for the initial draft, its consolidated correction and any eligible further call while role, context and source remain valid;` | `Within the design/brainstorming stage, reuse one Planner instance for every [design conversation](#design-conversation) response, the final design, its consolidated correction and any eligible further call while role, context and source remain valid;` (J3. 같은 item의 나머지 문장은 그대로) |
| P21 | 41 (item 4); 43 | (a) `In the design stage, a resend after a return without a draft uses the consolidated-correction opportunity.` (b) checklist 끝 `…; roles/approval/commit boundaries; completeness.` | (a) `In the design stage, [design conversation](#design-conversation) responses are expected returns and use no correction opportunity.` (b) `…; roles/approval/commit boundaries; completeness; inventory/scope notation (final design: complete [decision inventory](#decision-inventory); every document: every file or contract marked change or no change (reason), no ambiguous scope wording).` (J3, design v2 §3.2 checklist 항목) |
| P22 | 42 (item 5); 44 | `For design and brainstorming, finish the checklist before one consolidated correction covering …` | `For design and brainstorming, finish the checklist on the final design before one consolidated correction covering …` (나머지 그대로) |
| P23 | 44; 46 (앞 문장) | `For design and brainstorming, allow initial draft and one consolidated correction.` | `For design and brainstorming, converse under [design conversation](#design-conversation) and allow one consolidated correction on the final design.` (J3) |
| P24 | 44; 46 다음 새 절 | (없음) | §3.1.3 `Design conversation` (anchor `design-conversation`) |
| P25 | P24 다음 새 절 | (없음) | §3.1.4 `Decision inventory and question classification` (anchor `decision-inventory`) |

이 파일에서 바꾸지 않는 문장과 이유:
- 20행 `required design/spec/plan approvals`: 안 바꾼다. Spike/probe의 일반 문장이고, Architectural 결합 승인과 Bounded plan 승인을 모두 포괄한다.
- 169행 `no-plan/omission stays unsupported`: 안 바꾼다. `external.mjs`를 바꾸지 않으므로 그대로 맞다.
- 52행 item 1(`Planner proposes context/path/options/…/questions`)과 55행 item 4(`plan/assumptions/open decisions/checks/self-review`): 안 바꾼다(SJ7). 요약 문장이라 P24/P25와 충돌하지 않는다.
- 40행 `saved document paths and approved versions`: 안 바꾼다(SJ6).
- 절 제목과 anchor `planner-drafting-preparation-and-consolidated-feedback`: 안 바꾼다(SJ4).

#### 3.1.1 새 절 `Architectural combined approval` (P5)

v1 대비 2항(작성자 판단 첨부)과 5항(R4 세 갈래 분류)을 고쳤다.

```markdown
<a id="architectural-combined-approval"></a>
## Architectural combined approval

1. Sequential drafting (R0): Assign the fresh plan Planner only after the spec Planner returned the complete draft and self-review, Orchestrator saved it in the prepared target, reviewed it and made needed revisions, and the reviewed spec's path, version and SHA-256 are fixed and cited in the plan brief. NEVER draft a plan early or dispatch spec and plan Planners in parallel. Request no approval between the spec and plan stages.
2. Approval unit (R1): Before requesting approval, verify spec↔plan consistency: every spec requirement and acceptance criterion maps to plan tasks or final verification, and the plan cites the current spec version and SHA-256. Request one combined approval for the exact versions and SHA-256 of the spec and every in-scope plan, attaching the author judgments made since design approval ([decision inventory](#decision-inventory)); record it once and make every document's `approvalRef` cite it.
3. Partial answers (R2): A reply approving only part of the set, such as approving the spec while asking for plan changes, is a revision request. Orchestrator revises the documents directly, asking the user first for decisions outside approved scope; after any spec change it rechecks spec↔plan consistency; then it requests combined approval for the whole revised set. Partial approvals never carry over.
4. Invalidation (R3): Any content change to any document after the approval request voids that request; request combined approval again for the current set.
5. Spec ownership in the plan stage (R4): The plan Planner never edits the spec; it returns needed spec changes classified under [question classification](#decision-inventory). Within approved design scope Orchestrator revises the spec directly; a genuinely new decision outside it needs user input and revised design approval, then the affected documents are redrafted.
6. Rework (R5): If spec rejection requires substantive plan rework, use a fresh plan Planner under the normal Planner gate; Orchestrator handles formatting, re-expression, save and patch errors.
7. Commit and Implementer (R6): Before combined approval, commit no planning document and start no Implementer. After it, make one planning-document commit under [handoff-prep](handoff-prep.md#planning-document-commit).
```

#### 3.1.2 R8 문단 (P16, `Plan updates during execution` 절)

```markdown
Execution-time document revisions take this approval: a spec change with affected plans needs one combined revision approval for the spec and those plans; a plan-only change needs plan approval; a spec-only change needs spec approval after Orchestrator records why no plan is affected. Partial approvals never carry over.
```

#### 3.1.3 새 절 `Design conversation` (P24, design v2 §3.1, J1, J3, J5)

`## Planner drafting preparation and consolidated feedback` 절 끝, 44행(Cd 46) 문단 바로 뒤에 `###` 하위 절로 넣는다.

```markdown
<a id="design-conversation"></a>
### Design conversation

These rules apply to feature/design/behavior design and brainstorming. Spike, the direct path (F1–F8) and non-behavior paths keep their existing rules and need no conversation. Planner never talks to the user directly: Planner → Orchestrator → user → Orchestrator → the same design Planner.

1. Response shape: each design Planner response is exactly one of: one question; 2–3 approaches with a recommendation and a selection question; one design section with a confirmation question; or the final design. Planner splits each response into a user message and Orchestrator notes; Orchestrator relays the user message unchanged.
2. When to ask: ask one question at a time, only when the answer changes the outcome and neither the sources nor the conversation already answer it. Otherwise state "my judgment" with its reason so the user can correct it.
3. Reason first: when the user's reason is unknown, first ask one open question without options; offer options only after hearing the reason.
4. Short path and opt-out: when the request is clear enough, the first response may carry a short design and ask for approval. When the user says to just proceed, stop asking, decide the remaining items as author judgments and list them in the final design.
5. Relay: Orchestrator relays each user answer verbatim to the same design Planner and marks any interpretation it adds separately.
6. No spinning: every call carries a new user answer or new evidence. DO NOT repeat a question without progress; without progress, report the blocked criterion, observed facts and the decision needed to unblock, and hold.
7. Reuse and correction: reuse the same design Planner while role, context and source remain valid. Conversation responses are expected returns, not missing or failed drafts, and use no correction opportunity. Orchestrator's fixed-checklist review and one consolidated correction apply to the final design.
8. Full Auto: under [Full Auto](#full-auto-run-mode), Orchestrator records answers decidable within the original request as auto-decisions and sends only questions that need a new decision to the user; [approval.run-mode] limits apply unchanged.
```

#### 3.1.4 새 절 `Decision inventory and question classification` (P25, design v2 §3.2, J6)

§3.1.3 바로 뒤에 둔다.

```markdown
<a id="decision-inventory"></a>
### Decision inventory and question classification

1. Decision inventory: before returning the final design, Planner lists what spec and plan drafting must decide, such as changed files, data formats, table notation, tests and generated artifacts, and classifies each item as a user decision (asked in the conversation; the answer is recorded in the design), an author judgment (a minor item that does not change the deliverable; record "my judgment" and the reason) or already answered (cite the existing source or conversation). Bounded short designs carry a proportional inventory of a few lines; the per-file scope notation stays mandatory.
2. Scope notation: designs, specs and plans mark every file or contract "change" or "no change (reason)". DO NOT use ambiguous scope wording such as "review only" or "if needed".
3. Final design: the final design and its design approval request attach the author-judgment list.
4. Spec and plan questions: spec and plan Planners classify each question raised while drafting. Answered by the design: follow it and cite the basis. Minor: decide it as an author judgment and record it in the document's author-judgment list with ID, judgment and reason; it is not an open decision. Genuinely new decision (changes the deliverable and is absent from the design): return it as an open decision with why the design review missed it; Orchestrator routes it to the user.
5. Approval attachments: the Architectural [combined approval](#architectural-combined-approval) request and the Bounded plan approval request attach the author judgments made since design approval. The approval unit is unchanged.
6. Full Auto: author judgments are not open decisions when [Full Auto](#full-auto-run-mode) counts zero open decisions.
```

### 3.2 `handoff-prep.md` (4개 플랫폼, 행 번호 같음)

| ID | 행 | 현재 | 변경 후 |
|---|---|---|---|
| H1 | 12 | `Completed documents/individual approvals are not yet required;` | `Completed documents/approvals are not yet required;` |
| H2 | 33 | `Document staging/commit also verifies the full set, individual approvals/versions/dependencies and actual index.` | `Document staging/commit also verifies the full set, applicable approvals (Architectural combined spec+plan approval; Bounded plan approval)/versions/dependencies and actual index.` |
| H3 | 69 (첫 두 문장) | `Begin after target preparation and all applicable documents are written/individually approved. Paths requiring both spec and plan (Architectural or spec-required Bounded) permit no document commit on spec approval alone; after every planned spec/plan is individually approved, record the remaining ones in one planning-document commit. Plan-less paths commit their own approved document set.` | `Begin after target preparation and all applicable documents are written and approved. Architectural paths permit no document commit before the one combined spec+plan approval; after it, record the spec and every plan in one planning-document commit. Bounded plan-required paths commit their approved plans in one planning-document commit. Plan-less paths commit their own approved document set.` (R6) |
| H4 | 86 | `Verify applicable approvals, actual approval time, ordered written-spec/dependent-plan approval, preparation and holds;` | `Verify applicable approvals under [planning](planning.md#plan-updates-during-execution) (combined spec+plan revision approval, plan approval, or spec approval with recorded no-plan-impact), actual approval time, preparation and holds;` |

handoff-prep.md는 G4/G5와 관련이 없어 이 밖의 문장은 바꾸지 않는다.

### 3.3 `handoff.md` (cooperative 설명)
- 34행 `Applicable design/spec/plan approvals/artifacts or valid omissions`: 안 바꾼다(이유: §3.0).
- Claude 기준 170, 193, 195, 205행의 cooperative 지원 설명을 런타임 변경(§4)에 맞춘다. 4개 플랫폼 모두 같은 행에 같은 문구가 있으며(Orchestrator 확인), 같게 적용한다.
  - 170: `Supported spec+plan handoffs` → `Supported plan-mode handoffs`
  - 193: `Verify approved spec/plan docs-only commit` → `Verify the approved planning-document docs-only commit (Architectural spec/plan; Bounded plan)`
  - 195: `` `documents` is exactly spec/plan with `` → `` `documents` is exactly the prepared document set (spec/plan for Architectural, plan for Bounded) with ``
  - 205: `Support is spec+plan \`plan\`, not no-plan/omission.` → `Support is \`plan\` mode with the Architectural spec+plan or Bounded plan-only set, not no-plan/omission.`

### 3.4 `lib/policy/role-policy.json` `[planning.planner-brief]` (431행)
- **RP1 (G1/G2):**
  - 지울 문장: `Preserve separate sequential design/spec/plan approvals.`
  - 넣을 문장: `Obtain design approval before spec or plan drafting. For Architectural work, draft the spec and then the plan with fresh Planners, assigning the plan Planner only after the spec is saved and reviewed and its path, version and SHA-256 are fixed; NEVER draft them concurrently; then obtain one combined spec+plan approval. Bounded work has no spec stage; required plans keep their own approval.`
- **RP2 (G4, J3):** `For design and brainstorming, allow the initial draft and one consolidated correction.`를 다음으로 바꾼다.
  `For design and brainstorming, follow planning.md's design conversation: each Planner response is exactly one of one question, 2–3 approaches with a recommendation and a selection question, one design section with a confirmation question, or the final design. Ask one question at a time only when the answer changes the outcome and is not already answered; otherwise state the judgment and its reason. Ask an open question about the user's reason before offering options. A clear request may receive a short design for approval at once; when the user says to proceed, stop asking and list the remaining author judgments in the final design. Relay user answers verbatim and mark added interpretation separately. Every call needs a new user answer or new evidence; without progress, report the blocked criterion, observed facts and needed decision, and hold. Conversation responses use no correction opportunity.`
- **RP3 (G4/G5, J3):** `Orchestrator reviews once with the fixed checklist and sends one consolidated correction using changed fields only.`를 다음으로 바꾼다.
  `Orchestrator reviews the final design once with the fixed checklist, including decision-inventory completeness and no ambiguous scope wording, and sends one consolidated correction using changed fields only.`
- 같은 항목의 다음 문장은 바꾸지 않는다.
  - `Reuse the same Planner instance only within the design/brainstorming stage …`: 이 문장이 같은 design Planner 재사용을 담당한다.
  - `Further calls require …`와 `Repeated unmet criteria …`: 최종 design 보정 뒤의 호출 규칙으로 그대로 맞다. `role-policy.test.mjs:306,310`의 회귀 대상이다.
- inventory와 세 갈래 분류는 role-policy에 넣지 않는다(SJ8). `planning.md` P25와 Planner 조각 F4–F6이 담당한다.
- 위 문장들은 4개 플랫폼 관리 구간(`POLICY_PROJECTIONS` 대상)에 생성으로만 반영한다.

### 3.5 `lib/prompts/agent-fragments.json` (Planner 조각)

| ID | 행 (조각 id) | 현재 | 변경 후 |
|---|---|---|---|
| F1 | 50 (`planner.target-evidence`) | `Required written-spec approval precedes dependent plans.` | `Architectural plan drafting requires the saved, Orchestrator-reviewed spec's path, version and SHA-256; NEVER draft a plan before or in parallel with the spec. The spec and plans receive one combined approval; Bounded work has no spec stage.` |
| F2 | 70 (`planner.workflow-contract` 3번째 bullet 끝) | `… Orchestrator saves/reviews and directly revises the same spec when needed, then obtains written-spec approval.` | `… Orchestrator saves/reviews and directly revises the same spec when needed, without a separate spec approval; a fresh plan Planner drafts next.` |
| F3 | 70 (4번째 bullet 첫 문장) | `After written-spec approval, Architectural work always reads brief-cited \`references/writing-plans.md\`, regardless of size, locality or risk.` | `In the Architectural plan stage, whose brief cites the reviewed spec's path, version and SHA-256, always read brief-cited \`references/writing-plans.md\`, regardless of size, locality or risk. NEVER edit the spec; return needed spec changes under the question classification above.` (v1의 "as open decisions"를 R4 개정에 맞춰 고쳤다) |
| F4 | 70 (3번째 bullet) | `Return context, Spike/Bounded/Architectural path, designs/options, tradeoffs, criteria, assumptions and focused questions.` | 아래 F4 문구 |
| F5 | 70 (5번째 bullet) | `When needed, return the complete proportional plan, dependencies, assumptions/open decisions, verification needs and self-review.` | `When needed, return the complete proportional plan, dependencies, assumptions, author judgments, open decisions, verification needs and self-review.` |
| F6 | 70 (3번째 bullet 다음 새 bullet) | (없음) | 아래 F6 문구 |

F4 문구:
```text
Converse through Orchestrator under planning.md's design conversation: each response is exactly one of one question, 2–3 approaches with a recommendation and a selection question, one design section with a confirmation question, or the final design with context, Spike/Bounded/Architectural path, options, tradeoffs, criteria and assumptions. Split each response into a user message, which Orchestrator relays unchanged, and Orchestrator notes. Ask one question at a time only when the answer changes the outcome and is not already answered; otherwise state your judgment and reason. Ask an open question about the user's reason before offering options. For a clear request, the first response may be a short design for approval; when the user says to proceed, stop asking and list the remaining author judgments. Each call carries a new user answer, relayed verbatim with any Orchestrator interpretation marked, or new evidence; without progress, return the blocked criterion, observed facts and needed decision as a hold. The same design Planner continues while role, context and source remain valid; conversation responses use no correction opportunity, and only the final design receives Orchestrator's one consolidated correction. Before the final design, build a decision inventory classifying each item as user decision, author judgment or already answered, mark every file or contract change or no change (reason) without ambiguous scope wording, and attach the author-judgment list.
```
F4 뒤의 `Orchestrator integrates, routes answers/revisions and obtains approval.`와 F2 문장은 이 bullet에 남는다.

F6 문구(새 bullet):
```text
- In spec and plan stages, classify each drafting question: answered by the design → follow it and cite the basis; minor, with no deliverable change → decide it as an author judgment and list it with ID, judgment and reason (not an open decision); genuinely new decision that changes the deliverable and is absent from the design → return it as an open decision with why the design review missed it. Mark every file or contract change or no change (reason).
```

다음 문장은 바꾸지 않는다.
- `Bounded work follows Orchestrator's separate depth assessment.` 이후 문장
- `planner.target-evidence`의 `Initial design proposals and brainstorming MAY precede selection.`

렌더링 대상은 4개 플랫폼 × `arc-planner` 프로필이다.

### 3.6 4개 플랫폼 parity 규칙
- §3.1–§3.3과 §3.7의 교체 문구는 4개 플랫폼에서 바이트까지 같아야 한다. 이미 있는 플랫폼별 차이(Codex 행 오프셋, 플랫폼명 등)는 유지한다.
- 생성 구간(role-policy, fragments)은 손으로 고치지 않고 생성기로만 반영한다.
- 이번 변경 범위 밖의 플랫폼 간 차이는 보존한다. 파일 전체 diff 비교는 하지 않았다(I4).
- 4개 플랫폼 `planning.md` 40/41/42/44행(Cd 42/43/44/46)과 `coordination.md` 92행(Cd 90)의 대상 문장은 grep 결과 같은 위치에 있다. 바이트 일치는 I10에서 확인한다.

### 3.7 `coordination.md` (C1, 4개 플랫폼, C/Gm/Gr 92; Cd 90, J3)

| ID | 현재 | 변경 후 |
|---|---|---|
| C1a | `Within the design/brainstorming stage one Planner handles the initial draft, its consolidated correction and any eligible further call;` | `Within the design/brainstorming stage one Planner handles every [design conversation](planning.md#design-conversation) response, the final design, its consolidated correction and any eligible further call;` |
| C1b | `In the design stage, a resend after a return without a draft uses the consolidated-correction opportunity; later further calls still need new input.` | `In the design stage, conversation responses are expected returns and use no correction opportunity; calls after the final-design correction still need new input.` |

같은 문단의 나머지 문장(fresh spec/plan Planner, 예산 hold delta, handback 크기 제한)은 바꾸지 않는다. 이 파일은 §3.1의 8개 요소를 복제하지 않고, `planning.md#design-conversation` 링크로 전달한다(SJ5).

## 4. 런타임 동작 명세

공통 원칙:
- 기존 record와 schema를 재사용한다. 새 필드는 optional로만 추가하고 하위 호환을 지킨다(필드가 없으면 기존 동작).
- 기존 hold는 §4.6의 목록대로 유지한다.
- canonical은 `lib/runtime/*.mjs`이고, `shared/skill/runtime/` 사본은 생성으로만 갱신한다.
- G4/G5는 런타임을 바꾸지 않는다(§4.8).

### 4.1 cooperative: 대상 준비 intent (`target-preparation.mjs:52`)
- **RT1:** `depth==='Bounded'`이면서 `documents`에 `kind:'spec'`이 있는 경우도 hold하도록 조건을 넓힌다. reason은 `Bounded depth has no spec stage`다. Architectural의 `{spec, plan}` 필수 조건은 그대로다. 37행의 비어 있지 않음·kind 중복 금지 조건과 합치면 Bounded intent의 유효 세트는 `[plan]` 하나뿐이다.

### 4.2 cooperative: Architectural spec destination 기록 (`target-preparation.mjs:41,74`)
- **RT2:** `validateTargetPreparationRecord('destination')`에서 `approvalRef`를 optional로 바꾼다. 값이 있으면 비어 있지 않은 문자열이어야 한다.
- `evaluateTargetPreparation` destination 분기 규칙:
  - `approvalRef`가 없으면 `intent.depth==='Architectural' && document.kind==='spec'`일 때만 허용한다. 그 밖의 경우(Bounded plan, Architectural plan)는 hold한다. reason은 `Document approval required for this destination`이다.
  - `approvalRef`가 있으면 지금의 approval 검증(kind, contentHash, path 일치)을 그대로 한다(하위 호환).
  - `approvalRef`가 결합 승인 record(`data.documents` 배열)를 가리키면, 그 배열에서 `kind`·경로(`[doc.path, path.join(state.target.realpath, doc.path)]` 방식)·`contentHash`가 request와 모두 일치하는 항목이 정확히 1개 있어야 한다. 없으면 hold하고 reason은 기존 approval 불일치 reason을 쓴다. 이렇게 하면 결합 승인 1건으로 Architectural spec·plan destination을 모두 기록할 수 있다(R1, plan 리뷰 Orchestrator 결정).
  - full/complete 리뷰, `review.data.hash===request.hash`, criteria resolved, 관찰 바이트 일치 검증은 두 경우 모두 그대로다.

### 4.3 cooperative: plan 단계 전제 (`evaluate.mjs:221–226`)
- 221행(plan 경로와 prepared intent 일치), 222행(intent에 spec이 있으면 첫 stage는 spec), 224행(Bounded plan-only 첫 stage omission)은 그대로 둔다.
- **RT3:** 225행의 `approvedSpec`을 `reviewedSpec`으로 바꾼다.
  - prepared intent가 있으면 다음을 모두 만족해야 한다.
    1. `state.targetDocuments`에 `intentId===preparedIntent.id`이고 경로가 intent의 spec 경로와 같은 항목 `e`가 있다. `e.scopeVersion===state.scopeVersion`, `e.targetVersion===state.targetVersion`이다.
    2. `e.reviewRef`가 가리키는 `planner-review` record가 `source==='operator-attested'`이고, 현재 scope/target version이며, `data.full===true`, `data.complete===true`, `data.hash===e.hash`다.
    3. plan stage의 Orchestrator stage 승인 record(`approval.data.prerequisiteRefs`)가 `e.reviewRef` 또는 그 spec의 기존 승인 record messageRef(하위 호환)를 포함한다.
    4. plan stage를 등록할 때 관찰한 spec 파일의 현재 SHA-256이 `e.hash`와 같다. 관찰은 `cooperative.mjs`가 64–71행처럼 `readTargetPreparationEvidence`로 한다. 다르면 hold하고 reason은 `Reviewed spec bytes changed`다.
  - prepared intent가 없는 기존 workflow는 지금 조건(spec approval record)을 그대로 쓴다.
  - 226행 hold의 reason은 `Reviewed spec prerequisite is required for plan drafting`으로 바꾼다.
- 기존 흐름의 승인된 spec은 리뷰 기록도 갖고 있으므로 새 조건을 만족한다. approval 기록 자체가 리뷰를 요구하기 때문이다(`cooperative.mjs:79–81`). 따라서 진행 중 workflow가 회귀하지 않는다.

### 4.4 cooperative: 결합 승인 기록과 Implementer readiness/assignment
- **RT4 (approval 기록 검증, `cooperative.mjs:74–83`):** `approval`의 `data.documents`가 배열이고 현재 targetVersion에 transition된 prepared intent가 있으면 다음을 검증한다. 하나라도 어긋나면 hold한다(`Current reviewed bytes required for every approved document`).
  - 문서 kind·경로 세트가 `intent.documents`와 정확히 같다.
  - 각 문서마다 해당 stage의 full/complete `planner-review`가 있고 `hash===contentHash`다.
  - 관찰한 현재 바이트의 hash가 같다.
  - 행위자가 Orchestrator이고 target/version이 현재와 같다.
  - 기존 `data.kind` 단일 문서 승인 경로(Bounded plan, R8 개정)는 그대로다.
- **RT5 (readiness, `cooperative.mjs:174`):** `documents.length!==2 || spec/plan 둘 다` 조건을 "유효 문서 세트" 판정으로 바꾼다.
  - 현재 targetVersion에 transition된 prepared intent가 있으면 kind 세트가 `intent.documents`의 kind 세트와 정확히 같아야 한다. Architectural은 `{spec,plan}`, Bounded는 `{plan}`이다.
  - prepared intent가 없으면 기존처럼 `{spec,plan}`이다.
  - 175행의 Git/바이트/`approvalRef===approval.messageRef` 검증은 그대로다.
- **RT6 (assignment, `assignment.mjs:26`):** RT5와 같은 규칙으로 `documents`와 `git.documents`의 길이·kind를 검사한다. 나머지(docsCommit 경로 세트, commit 일치, observedHash·currentHash)는 그대로다.
  - 28행(같은 `approvalRef`, approvalVersion/documentVersion, `same(approval.data.documents, documents)`)은 바꾸지 않는다. 이 조건이 R1(하나의 승인이 세트 전체를 가리킴)을 강제한다.
- prepared intent를 찾는 기준은 `evaluate.mjs:220`과 같은 `targetTransitions.some(t=>t.intentId===i.id&&t.targetVersion===state.targetVersion)`이다. RT5와 RT6은 같은 helper를 쓴다. helper의 이름과 위치는 plan에서 정한다.

### 4.5 native(provider) 평가기와 Git gate
- **RT7 (깊이 신호):** native workflow state에는 깊이 정보가 없다(`schema.mjs:45–60`). 그래서 optional 필드 `planningDepth: 'Architectural'|'Bounded'`를 추가한다(SJ1). `validateWorkflowState`는 이 필드가 있을 때 값만 검증한다.
- **RT8 (유효 문서 세트):** 아래 세 지점이 같은 판정을 쓴다.
  - 판정:
    - `planningDepth==='Bounded'`: 정확히 `{plan}`. spec이 있으면 hold한다.
    - `'Architectural'` 또는 필드 없음(legacy): 정확히 `{spec,plan}`.
  - 적용 지점:
    - `evaluate.mjs:71`(첫 Implementer). reason은 `approved complete planning-document set required`다.
    - `evaluate.mjs:111`(Git `documents` 커밋). length·kind 조건을 이 판정으로 바꾸고, 경로·approval provenance 검증은 그대로 둔다.
    - `gate.mjs:36`(docs-commit preflight). reason은 `Complete exact approved planning-document set required`이고, 37–40행의 문서별 approval 검증은 그대로다.
  - 73–74행(승인 provenance와 docs commit Git 증거)은 문서 수와 관계없이 그대로 동작한다.
- **RT9 (plan Planner 전제, `evaluate.mjs:91`):**
  - `planningDepth==='Bounded'`이면 spec 전제가 없다. 대신 Bounded에서 `stage.document.kind==='spec'`인 Planner stage 배정은 hold한다(`Bounded depth has no spec stage`).
  - Architectural이나 legacy이면 다음 중 하나를 요구한다.
    - (a) 같은 `workflowId`의 `plannerLedger` stage 가운데 `document.kind==='spec'`, `ready===true`, `review.full===true`, `review.complete===true`이고 `scopeVersion`이 plan stage와 같은 것이 있다(리뷰된 spec).
    - (b) 기존 승인된 spec 조건(하위 호환).
  - reason은 `Reviewed spec prerequisite required`다.
  - 리뷰된 spec stage와 실제 저장 바이트를 이어 주는 필드(예: stage artifact hash 또는 approval scope 확장)를 기존 필드로 표현할 수 있는지는 구현할 때 확인한다(I5). 새 필드를 추가할 경우 optional로 둔다. `same(approval.scope.plannerStage, contract)` 비교를 깨는 키는 추가하지 않는다.

### 4.6 그대로 유지할 hold와 코드
- Architectural intent의 spec 누락(`target-preparation.mjs:52`), intent의 비어 있음·kind 중복(37), 활성 intent 우회 금지(`evaluate.mjs:219,222`), plan 경로 불일치(221).
- 결합 승인 전의 Implementer와 docs commit. 승인 provenance가 없으면 71–74, 111, `gate.mjs:37–40`이 hold한다.
- 동일 승인 참조·버전(`assignment.mjs:28`), 커밋 바이트와 현재 바이트의 일치(26, `cooperative.mjs:175`).
- 준비 전 document/approval 기록 금지(`cooperative.mjs:73`), 기존 단일 kind 승인의 리뷰 바이트 검증(74–83).
- `state.mode!=='plan'` hold(`verification.mjs:70`, `evaluate.mjs:76`), cooperative `no-plan`·`omission` 미지원(`external.mjs:51`).
- `verification.mjs:70`은 reason 문자열만 `Only the plan path is supported`로 바꾸고 조건은 그대로 둔다. 이 문자열을 assert하는 테스트가 있는지는 구현할 때 확인한다(I6).
- Planner 호출 ledger `evaluatePlannerCall`(`evaluate.mjs` 기준선 159행부터, initial/correction/further)과 `validatePlannerStage`, `schema.mjs:89` Planner stage kind(§4.8).

### 4.7 R8(실행 중 개정)과 런타임
- R8 개정 승인은 정책과 handoff 기록(`.git/arc/handoff/<workflow>/`)의 대상이며, 새 런타임 게이트는 추가하지 않는다. 개정 후 Implementer 재배정은 기존 assignment·readiness 게이트(approval/document version)를 따른다.

### 4.8 Planner 호출 ledger (안 바꾼다, J2)
- `evaluatePlannerCall`의 initial/correction/further 제한(`evaluate.mjs:164-173`)은 바꾸지 않는다.
- 이유: 런타임 Planner stage는 `spec`/`plan`만 표현한다(`schema.mjs:89`). design 단계는 런타임 ledger 대상이 아니므로 §3.1.3의 대화 방식과 충돌하지 않는다. spec·plan 단계의 보정 1회와 further 규칙은 그대로 유효하다.
- T2가 같은 파일의 71/91/111/221–226행을 바꾸므로, 확인 기준은 파일 전체 diff가 0인 것이 아니다. `evaluatePlannerCall` 함수 본문에 diff hunk가 없어야 한다(AC16).

## 5. 생성·동기화 절차

T1, T2, T3 모두 자기 변경 뒤에 해당하는 단계를 실행한다. 세 task는 `MANIFEST.sha256`과 생성물을 함께 건드리므로 순차로 진행한다(§12).
1. `lib/policy/role-policy.json`을 수정한 뒤 `npm run update:role-policy`(=`node scripts/update-role-policy.mjs`)를 실행한다. 4개 플랫폼 SKILL.md, agents, references의 관리 구간이 다시 생성된다. 검사는 `npm run check:role-policy`다.
2. `node scripts/update-runtime-assets.mjs`를 실행한다. `lib/runtime/*.mjs`와 `role-policy.json`이 `shared/skill/runtime/`으로 바이트 복사된다. role-policy만 바꾼 T1·T3에서도 실행한다. 검사는 `--check`다.
3. `lib/prompts/agent-fragments.json` 변경은 설치 계획 렌더링(`lib/installer/plan.mjs:30`)으로 반영된다. 저장소 안에 별도 생성물이 있는지는 구현할 때 확인한다(I7).
4. `node tests/node/fixtures/installed-layout.mjs --write`로 `installed-layout-golden.json`을 갱신한다. 검사는 `--diff`다.
5. `tests/node/plan.test.mjs`의 `renderingBaseline` 8개 digest(Codex·Claude × en·ko × skipGlobal)를 다시 계산해 갱신한다. 전용 스크립트를 확인하지 못했으므로 정확한 계산 방법은 구현할 때 정한다(I1). 바뀐 digest만 갱신하고 나머지는 그대로 둔다.
6. `tests/node/fixtures/instruction-contracts.json`의 `protected` SHA-256은 바뀐 보호 파일에 대해 수동으로 갱신한다(I2).
7. `node scripts/check-installer-parity.mjs`를 실행한다. inventory 해시는 바꾸지 않는다(`Coverage mappings may change; this inventory may not`). coverage mapping은 테스트 이름이나 위치가 바뀌어 대응이 깨진 항목만 갱신한다.
8. `node scripts/update-manifest.mjs`로 `MANIFEST.sha256`을 갱신한다. 검사는 `npm run check:manifest`다.

## 6. 테스트 변경 명세

### 6.1 수정할 기존 assert

| 파일:행 | 변경 |
|---|---|
| `tests/node/instruction-layout.test.mjs:126` | 기대 문자열을 H3의 새 69행 문장으로 바꾼다. |
| `tests/node/run-mode-contract.test.mjs:28` (+68 플랫폼별) | `planningSection`의 해당 행을 P18로 바꾸고 P19는 유지한다. 나머지 Full Auto 절 본문은 바꾸지 않는다(SJ3). 4개 플랫폼에서 일치해야 한다. |
| `tests/test_harness_contract.py:40,167,169,367,532,549` | `written-spec approval … dependent plan revision` → R8 문단. `if bounded requires written spec …` → P4의 Bounded 재평가 문구. order/gate 기대값 → P12 순서(결합 승인). |
| `tests/test_harness_contract.py:451` | `r"allow the initial draft and one consolidated correction"` → `r"reviews the final design once with the fixed checklist.*one consolidated correction"` (Claude `planning.md` 관리 구간, RP3) |
| `tests/test_arc_policy.py:161,223,245,467,664,680–690,696,707,724,739,740,1522,1551,1590` | order 정규식 → P12. `written-spec approval`/`individually approved` → 결합 승인·리뷰된 spec. Bounded written spec 검사 → P4의 부재 검사와 재평가 검사. `spec steps apply only to architectural and required bounded specs` → P11. `a required plan does not itself require a written spec` 계열은 그대로 둔다. |
| `tests/test_arc_policy.py:438` | `r"allow the initial draft and one consolidated correction"` → `r"reviews the final design once with the fixed checklist.*one consolidated correction"` (role-policy rule 원문, RP3) |
| `tests/test_claude_payload.py:530,718,745,784` | 위와 같은 원칙으로 갱신한다. |
| `tests/test_claude_payload.py:435` | `r'allow the initial draft and one consolidated correction'` → `r'reviews the final design once with the fixed checklist.*one consolidated correction'` |
| `tests/node/role-policy.test.mjs:302,305` | 테스트 이름을 `design and brainstorming converse and keep one final-design correction`으로 바꾼다. 305행 정규식을 `/design and brainstorming.*design conversation.*final design/i`와 `/reviews the final design once with the fixed checklist.*one consolidated correction/i` 두 개로 바꾼다. 306행은 그대로 둔다. |
| `tests/node/runtime-target-preparation.test.mjs:362` | 저장 후 review·승인 흐름을 리뷰된 spec 기반 plan 단계로 바꾼다. 결합 승인 기록 검증을 포함한다. |
| `tests/node/runtime-cooperative.test.mjs:205` | `planner plan drafting checks its spec prerequisite …`를 리뷰된 spec 전제로 바꾼다. |
| `tests/node/runtime-evaluate.test.mjs:82,153` / `runtime-gate.test.mjs:22,31` / `runtime-assignment.test.mjs:16–18,24` | 기존 `{spec,plan}` 시나리오는 그대로 통과해야 한다(회귀). reason 문자열 assert가 있으면 §4의 새 reason으로 바꾼다. |

바꾸지 않고 그대로 통과해야 하는 회귀 assert:
- `tests/node/role-policy.test.mjs:306,310`: role-policy의 `Further calls …`와 `Repeated unmet criteria …` 문장을 유지한다.
- `tests/test_arc_policy.py:464`: checklist 순서 `scope … completeness`. P21은 inventory 항목을 `completeness` 뒤에 붙인다.
- `tests/test_harness_contract.py:123`: `consolidated.*changed fields.*unchanged`. P20이 `its consolidated correction`을 `Follow-up briefs send changed fields …` 앞에 유지한다.
- `tests/node/runtime-assignment.test.mjs:129,160`, `tests/node/runtime-cooperative.test.mjs:180,239`: Planner ledger(AC16).
- `tests/node/runtime-evaluate.test.mjs:171`: omission 지원을 넓히지 않는다.
- `instruction-contracts.json:68,180`의 anchor 참조: SJ4.

일부 assert는 현재 `planning.md`나 role-policy 문구와 직접 맞지 않는다. 예는 다음과 같다.
- `test_arc_policy.py:161`의 `execution-target choice` 순서
- `test_claude_payload.py:530`의 `does not require written-spec approval; it requires …`
- `test_arc_policy.py:439–442`와 `test_claude_payload.py:436`의 `do not invoke planner only to reformat …`

이 assert들의 대상 파일과 기준선 실패 여부는 구현할 때 확인한다(I8, I11). 기준선에서 실패하는 assert도 이번에 바뀌는 문구에 걸리면 새 문구에 맞춘다. 판정 기준은 기준선 대비 새 실패가 없는 것이다.

### 6.2 새 테스트

Node 런타임 테스트(이름은 초안, J9):
- `runtime-target-preparation`
  - `bounded intent with a spec document is held` (RT1)
  - `architectural spec destination may omit approvalRef with a full review` (RT2)
  - `bounded plan destination without approvalRef is held` (RT2)
  - `architectural plan stage registers with a saved reviewed spec and no spec approval` (RT3)
  - `architectural plan stage holds when reviewed spec bytes changed or review is incomplete` (RT3)
  - `legacy approved spec still satisfies the plan prerequisite` (RT3 호환)
- `runtime-cooperative`
  - `combined approval verifies reviewed current bytes for every document` (RT4)
  - `combined approval with a partial document set is held` (RT4)
  - `readiness resolves for a bounded plan-only approval` (RT5, 174행 분기 직접 검사)
  - `readiness holds an architectural plan-only approval` (RT5)
- `runtime-assignment`
  - `bounded plan-only committed set is assignable` (RT6)
  - `architectural intent with plan-only set is held` (RT6)
  - `bounded intent with spec and plan set is held` (RT6)
- `runtime-evaluate`
  - `first Implementer accepts bounded plan-only set when planningDepth is Bounded` (RT8)
  - `missing planningDepth keeps requiring spec and plan` (RT7/RT8)
  - `documents commit accepts bounded plan-only set` (RT8)
  - `plan Planner assignment accepts a ready reviewed spec stage without spec approval` (RT9)
  - `bounded spec Planner stage is held` (RT9)
- `runtime-gate`
  - `docs-only preflight allows the bounded plan-only set` (RT8)
  - `docs-only preflight holds architectural plan-only set` (RT8)

G1/G2 정책 문구 테스트(Python 또는 Node, 4개 플랫폼 반복):
- `planning.md`에 P1, P2, P4, §3.1.1의 1–7항, §3.1.2 R8 문단, P18 행이 있는지 검사한다.
- §7.2의 삭제 문구가 없는지 검사한다.
- role-policy `[planning.planner-brief]`의 RP1 문장이 4개 플랫폼 관리 구간에 같게 들어갔는지 검사한다.
- 렌더된 4개 플랫폼 `arc-planner` 프로필에 F1–F3이 있고 `Required written-spec approval precedes dependent plans`가 없는지 검사한다.
- `handoff-prep.md`의 H2–H4를 검사한다.

G4/G5 정책 문구 테스트(Python 또는 Node, 4개 플랫폼 반복, 이름은 초안):
- `design conversation rules are present on every platform` (AC12)
  - `planning.md`: P20, P21(a), P22, P23, §3.1.3 1–8항
  - `coordination.md`: C1a, C1b와 `planning.md#design-conversation` 링크
  - 관리 구간(`planning.md` 160행 근처, Cd 163행): RP2, RP3
  - 렌더된 `arc-planner` 프로필: F4의 요소(응답 네 유형, 질문 1개, 이유 먼저, 바로 가는 길·중단, 원문 전달·해석 표시, 진전 없을 때 hold, 같은 design Planner, 최종 design 보정 1회)
- `decision inventory and scope notation rules are present` (AC13): §3.1.4 1–3항, P21(b) checklist 항목, F4의 inventory 문장
- `spec and plan question classification and approval attachments are present` (AC14): §3.1.4 4–5항, §3.1.1 2항·5항, F3, F5, F6
- `author judgments are not open decisions under Full Auto` (AC15): §3.1.4 6항과 §3.1.3 8항이 4개 플랫폼에서 바이트까지 같은지 검사한다. Full Auto 표가 R7 외에 바뀌지 않았다는 것은 `run-mode-contract.test.mjs`의 `planningSection` 정확 비교가 보장한다.
- `design-stage correction wording is removed` (AC17): §7.2의 G4/G5 추가 목록

## 7. 수용 기준 (design AC1–AC17 대응)

### 7.1 기준
- **AC1 Bounded spec 문구 제거**
  - AC1a: 4개 플랫폼 `planning.md`, `handoff-prep.md`, `agent-fragments.json`, `role-policy.json`에서 §7.2 G1/G2 삭제 문구를 검색한 결과가 0건이다.
  - AC1b: Bounded plan 깊이 판단(생략 조건 포함)과 plan 승인 문구(P3, P14, P19)가 남아 있다.
- **AC2:** P4의 Bounded → Architectural 재평가 규칙이 4개 플랫폼에 같은 문구로 있다.
- **AC3 순차 작성**
  - AC3a: P1, P2, §3.1.1-1(R0), F1–F3이 있다.
  - AC3b: plan brief에 리뷰된 spec의 경로·버전·SHA-256이 필수다(R0, P8, F3).
  - AC3c: spec과 plan 단계 사이에 승인 요청이 없다는 문구가 있다.
- **AC4:** R1–R3(§3.1.1-2~4)과 spec↔plan 정합성 확인이 있다.
- **AC5:** R4–R5(§3.1.1-5~6)가 있다. R4는 세 갈래 분류를 참조한다.
- **AC6:** H3(R6)이 4개 플랫폼 `handoff-prep.md`에 있고 `instruction-layout.test.mjs:126` 기대값과 일치한다.
- **AC7:** P18이 4개 플랫폼 표와 `run-mode-contract.test.mjs`에서 일치하고, P19는 바뀌지 않는다.
- **AC8:** §3.1.2 R8 문단과 H4가 있다.
- **AC9:** `role-policy.json`과 `agent-fragments.json`을 수정하고 §5의 1–3단계를 실행한 뒤 `check:role-policy`와 `update-runtime-assets --check`가 통과한다. 4개 플랫폼 parity 테스트에 새 실패가 없다.
- **AC10 런타임**
  - AC10a: Bounded intent에 spec이 있으면 hold한다(RT1). native Bounded spec stage도 hold한다(RT9).
  - AC10b: Architectural plan 단계는 리뷰된 spec(저장, full/complete 리뷰, hash, 현재 바이트)으로 허용되고 spec 승인을 요구하지 않는다(RT2, RT3, RT9).
  - AC10c: 결합 승인 1건으로 docs-commit(`evaluate.mjs:111`, `gate.mjs:36`), 첫 Implementer(`evaluate.mjs:71`, `assignment.mjs:26–28`), readiness(`cooperative.mjs:174`)를 통과한다. 부분 세트는 hold한다(RT4–RT6, RT8).
  - AC10d: Bounded plan-only는 위 게이트를 통과한다(RT5, RT6, RT8). Architectural plan-only는 hold한다.
  - AC10e: §4.6의 hold와 기존 `{spec,plan}` 테스트가 모두 그대로 통과한다.
- **AC11**
  - AC11a: installed-layout golden, renderingBaseline, instruction-contracts protected 해시, installer-parity, `MANIFEST.sha256`을 갱신하고 각 검사가 통과한다.
  - AC11b: 마지막 full-regression shard 결과가 기준선(master 313b0d03) 대비 새 실패가 없다. 기존 실패와 부하 flake는 단독 재실행으로 판정한다. §6.1의 G4/G5 테스트 갱신 뒤에도 같다.
- **AC12 (대화 방식):** 4개 플랫폼 `planning.md`(P20–P23, §3.1.3), `coordination.md`(C1), role-policy 관리 구간(RP2, RP3), 렌더된 `arc-planner` 프로필(F4)에 design v2 §3.1이 같은 의미로 들어 있다.
  - 포함할 요소: 응답 네 유형 중 하나, 질문 1개씩, 이유 먼저, 바로 가는 길과 중단(opt-out), 원문 전달과 해석 표시, 진전 없을 때 hold, 같은 design Planner 재사용, 최종 design에 대한 보정 1회.
  - `coordination.md`는 C1 문장과 `planning.md#design-conversation` 링크로 이 요소들을 전달한다(SJ5).
- **AC13 (inventory):** 4개 플랫폼 `planning.md`에 다음이 있다.
  - 최종 design의 세 분류 inventory와 파일별 바꾼다/안 바꾼다 필수 규칙(§3.1.4 1–3항)
  - 모호한 범위 표현 금지(§3.1.4 2항)
  - 고정 checklist 항목(P21(b))
  - F4에도 inventory 문장이 있다.
- **AC14 (세 갈래 분류):** spec·plan Planner 규칙(§3.1.4 4항, F6)에 다음이 있다.
  - 세 갈래 분류
  - 진짜 새 결정만 open decision으로 반환하고 놓친 이유를 기록한다는 것
  - 작성자 판단 표시
  - 결합 승인과 plan 승인 요청에 작성자 판단 목록을 붙인다는 규칙(§3.1.4 5항, §3.1.1 2항)
- **AC15 (Full Auto):** 작성자 판단을 open decision으로 세지 않는다는 문장(§3.1.4 6항)이 4개 플랫폼에 같게 있다. Full Auto 표는 R7(P18) 외에 바뀌지 않는다.
- **AC16 (런타임 비변경):** 기준선 313b0d03 대비 `lib/runtime/evaluate.mjs`의 `evaluatePlannerCall` 함수 본문과 `schema.mjs`의 `validatePlannerStage`·89행 Planner stage kind에 diff hunk가 없다. `runtime-assignment.test.mjs:129,160`과 `runtime-cooperative.test.mjs:180,239`가 그대로 통과한다.
- **AC17 (삭제 확인):** §7.2 G4/G5 목록을 grep한 결과가 design 단계 문맥에서 0건이다.

### 7.2 삭제 확인 grep 목록

G1/G2 (대상: 4개 플랫폼 `skill/`, `lib/policy/role-policy.json`, `lib/prompts/agent-fragments.json`):
`spec-required Bounded`, `required Bounded spec`, `Required Bounded specs`, `records Bounded spec necessity`, `If Bounded requires written spec`, `written-spec approval before`, `sequential design/spec/plan approvals`, `Required written-spec approval precedes`, `obtains written-spec approval`, `After written-spec approval`, `ordered written-spec/dependent-plan`, `| Written spec approval |`, `spec approval precedes dependent planning`.

G4/G5 (대상은 같다):
- `a resend after a return without a draft uses the consolidated-correction opportunity`
- `allow initial draft and one consolidated correction`
- `allow the initial draft and one consolidated correction`
- Planner 조각의 `and focused questions`
- 범위 표현 `review only`와 `if needed`
  - 허용하는 예외는 두 가지다. `planning.md` §3.1.4 2항(금지 규칙 설명 자체)과 Reviewer 조각의 `Independently review only that scope`다. 후자는 범위 표기가 아니라 Reviewer 검토 대상 한정이며 기준선에 이미 있다.
  - 이 spec과 이번 plan 문서에서 "검토만" 같은 범위 표현은 금지 규칙을 설명하는 문장에만 나와야 한다.

## 8. 비범위
- 외부 skill(`brainstorming`, `writing-plans`) 본문 수정
- Spike, direct path(F1–F8), plan 생략 조건의 변경
- cooperative `no-plan`/omission 지원
- Tester, Reviewer, 커밋, push 규칙의 변경
- 설치된 사용자 홈 사본의 갱신과 배포·릴리스
- 런타임 Planner 호출 ledger의 변경(J2)
- 별도 builder check(design v2 대화 3안, 채택하지 않음)
- `commit.md`·`verification.md`의 일반 `approved spec/plan` 문구: 안 바꾼다(이유: §3.0. 결합 승인과 plan 승인에 모두 맞고, §7.2 grep에 걸리면 결함으로 처리한다).

## 8.1 결정 분류 (design v2 §3.2 소급 적용, J10)

| 항목 | v1 분류 | v2 분류 | 내용 (변경 없음) |
|---|---|---|---|
| D1 native 깊이 신호 | Orchestrator 결정 | 작성자 판단 SJ1 | native workflow state에 optional `planningDepth`를 추가한다. 필드가 없으면 legacy `{spec,plan}`을 요구하고, `Bounded`이면 `{plan}`만 허용한다. 깊이 없이 둘 다 허용하는 안은 native에서 Architectural plan-only를 막지 못한다. |
| D2 Full Auto `Plan approval` 행 | Orchestrator 결정 | 작성자 판단 SJ2 | design R7대로 문구를 바꾸지 않는다. 의미상 Bounded plan과 plan-only 개정에 적용된다. |
| D3 `handoff.md` cooperative 설명 | Orchestrator 결정 | design 누락 → design v2 §4.3에서 "바꾼다"로 확정 | 놓친 이유: 통합본 design §4의 모호한 표현("34행은 검토만"). 170/193/195/205행을 갱신하고 34행은 바꾸지 않는다. |

## 9. 마이그레이션
- 소급 적용하지 않는다. 이미 개별 승인된 spec이나 진행 중 workflow는 기존 증거로 계속 유효하다(RT3 호환, RT7 필드 없음 = legacy).
- 승인된 spec은 리뷰 기록을 포함하므로 새 plan 전제를 만족한다. 새 규칙은 과거 승인을 무효로 만들지 않고, 과거 작업을 승인된 것으로 바꾸지도 않는다.
- G4/G5는 정책 문구만 바꾼다. 이미 승인된 design에 inventory가 없어도 무효가 아니다. 새 규칙은 이 변경 이후 시작하는 design 단계에 적용한다.
- 이번 작업은 정책 수준에서 새 규칙을 먼저 적용한다. 런타임 변경은 이번 작업의 산출물이며, 이번 workflow의 cooperative 기록에는 쓰지 않는다.

## 10. 위험
- spec 미승인 상태에서 plan을 쓰므로 spec이 거절되면 재작업이 생긴다. R2와 R5로 줄인다.
- RT2/RT3의 증거 사슬이 약해질 수 있다. spec 승인 대신 리뷰와 바이트 관찰에 의존하기 때문이다. RT4로 결합 승인 시점에 모든 문서의 리뷰 바이트를 다시 확인하고, `assignment.mjs:28`로 같은 승인임을 강제한다.
- native의 `planningDepth`는 operator 기록(operator-attested)에 의존한다. 필드가 없으면 legacy 엄격 규칙을 쓴다.
- design 단계의 왕복 횟수가 늘어 시간이 더 든다. 바로 가는 길과 중단(opt-out)으로 줄인다.
- Full Auto에서 사소하지 않은 판단이 "작성자 판단"으로 잘못 분류될 수 있다. 결과물이 달라지면 사용자 결정이라는 기준과 P21(b) checklist로 막는다.
- 4개 플랫폼 문구, 생성 구간, 해시 fixture, MANIFEST가 연쇄로 바뀐다. T1·T3는 `planning.md`, `role-policy.json`, `agent-fragments.json`, 정책 테스트를 함께 건드린다. T1·T2·T3는 `MANIFEST.sha256`과 `shared/skill/runtime/`을 함께 건드린다. 그래서 순차로 진행하고 다시 검사한다.
- RP2·F4가 길어져 렌더된 프로필과 관리 구간의 크기가 늘어난다. 기능 위험은 아니지만 renderingBaseline과 golden이 바뀐다(§5).
- 기준선에 실패(51–55건)와 부하 flake가 있다. 새 실패 판정은 기준선 대비로 하고, 의심 건은 단독 재실행한다.

## 11. 구현 시 확인 항목

질문이 아니라 결과물을 바꾸지 않는 확인이다.
- I1: `renderingBaseline` 8개 digest 재계산 방법(테스트 실패 출력의 actual 값을 쓸 수 있는지 포함)
- I2: `instruction-contracts.json` `protected` 대상 파일 목록과 해시 갱신 방법
- I3: (해결됨) 4개 플랫폼 `handoff.md` 170/193/195/205행 동일
- I4: 4개 플랫폼 `planning.md`/`handoff-prep.md`의 범위 밖 차이가 교체 문구와 충돌하는지
- I5: native 리뷰된 spec stage와 저장 바이트를 기존 필드로 연결할 수 있는지(RT9)
- I6: `verification.mjs:70` reason 문자열과 §4의 바뀐 reason을 assert하는 테스트
- I7: `agent-fragments.json`을 반영하는 저장소 내 생성물이나 golden이 따로 있는지
- I8: 현재 문구와 맞지 않는 Python assert(§6.1 주석)의 대상 파일과 기준선 실패 여부
- I9: `evaluate.mjs:91`(native plan 전제)과 `cooperative.mjs:174`에 대한 기존 직접 테스트가 있는지
- I10: 4개 플랫폼 `planning.md` 40/41/42/44행(Cd 42/43/44/46)과 `coordination.md` 92행(Cd 90)의 대상 문장이 바이트까지 같은지. grep 결과 위치는 같다.
- I11: `test_arc_policy.py:439–442,464`, `test_claude_payload.py:436`의 기준선 통과 여부. 새 문구가 이 assert들에 새 실패를 만들지 않는지
- I12: `renderPolicySection(…, projection:'planning')`이 gemini/grok에서도 RP2/RP3을 포함하는지. 기존 `role-policy.test.mjs:303`은 codex/claude만 반복한다.

## 12. 예상 task (J8, 잠정. 최종 분할은 plan에서 정한다)
- **T1: G1/G2 정책.** P1–P19, §3.1.1–§3.1.2(R4 세 갈래 참조 포함), H1–H4, §3.3, RP1, F1–F3, Full Auto 표(P18), 관련 테스트·fixture, MANIFEST.
- **T2: 런타임 RT1–RT9.** 런타임 테스트, `shared/skill/runtime/` 사본, MANIFEST. `evaluatePlannerCall`은 건드리지 않는다.
- **T3: G4/G5 정책.** P20–P25(§3.1.3–§3.1.4), C1, RP2–RP3, F4–F6, §6.1의 305/438/435/451 갱신, §6.2 G4/G5 테스트, fixture, MANIFEST. T1 뒤에 진행한다.
- F3의 "question classification above"와 §3.1.1-5의 `#decision-inventory` 링크는 T3가 만드는 절을 가리킨다. 다음 두 방식 중 하나를 plan에서 정한다.
  - T1에서는 링크 없이 쓰고 T3에서 링크를 연결한다.
  - T1 커밋 시점에 깨진 anchor가 없도록 T3를 먼저 한다.

## 13. spec 작성자 판단 목록 (결합 승인 요청에 첨부)

| ID | 판단 | 이유 |
|---|---|---|
| SJ1 | native workflow state에 optional `planningDepth`를 추가한다(v1 D1) | J10의 소급 분류. 결정 내용은 v1과 같다 |
| SJ2 | Full Auto `Plan approval` 행은 바꾸지 않는다(v1 D2) | J10의 소급 분류. R7이 이 행을 Bounded용으로 둔다 |
| SJ3 | design 대화와 작성자 판단의 Full Auto 문장은 §3.1.3 8항과 §3.1.4 6항에 두고, Full Auto 절은 P18 외에 바꾸지 않는다 | J7. `run-mode-contract.test.mjs`가 Full Auto 절 전체를 정확히 비교한다 |
| SJ4 | 새 규칙은 `## Planner drafting preparation and consolidated feedback` 아래 `###` 하위 절(`design-conversation`, `decision-inventory`)로 44행 뒤에 넣는다. 기존 절 제목과 anchor는 유지한다 | SKILL.md 링크와 `instruction-contracts.json:68,180`이 이 anchor를 참조한다. 새 anchor는 저장소에서 충돌이 없다(grep 0건) |
| SJ5 | `coordination.md`는 §3.1의 8개 요소를 복제하지 않고 C1 문장과 `planning.md#design-conversation` 링크로 전달한다. AC12 테스트도 이 기준으로 검사한다 | coordination 문단의 역할은 dispatch 효율이다. 복제하면 4개 플랫폼에서 문구가 어긋날 위험이 커진다 |
| SJ6 | `saved document paths and approved versions`(`planning.md:40`, `coordination.md:92`, role-policy) 문구는 지우지 않고, 바로 뒤에 ` (for the Architectural plan stage, the reviewed spec path, version and SHA-256)`를 덧붙인다(Orchestrator 리뷰 수정) | 원문만 두면 Architectural plan 단계에서 spec이 아직 승인 전이라 문구와 모순된다. 기존 부분 문자열을 보존해 이를 검사하는 테스트·fixture는 그대로 통과한다. 덧붙인 문구가 role-policy 생성 구간과 protected 해시에 주는 영향은 T3에서 갱신한다 |
| SJ7 | `planning.md` 52행 item 1과 55행 item 4는 바꾸지 않는다 | 요약 문장이라 P24·P25와 충돌하지 않는다. design v2 §4.3의 대상 행이 아니다 |
| SJ8 | role-policy RP2에는 §3.1의 8개 요소를 모두 넣고, inventory·세 갈래 분류는 넣지 않는다 | AC12가 관리 구간에 §3.1을 요구한다. design v2 §4.3은 role-policy 변경을 design 단계 문구로 한정한다 |
| SJ9 | P21(b) checklist에서 inventory 완결은 최종 design에만, 모호한 범위 표현 금지는 모든 문서에 적용한다 | design v2 §3.2의 범위 표기 규칙은 문서를 가리지 않는 일반 규칙이다 |
| SJ10 | AC17 grep에 `allow initial draft …`와 `allow the initial draft …` 두 문자열을 추가하고, Reviewer 조각의 `review only that scope`는 예외로 둔다 | J3의 삭제 결과를 확인하기 위해서다. Reviewer 문구는 범위 표기가 아니며 기준선에 있다 |
| SJ11 | F6은 3번째 bullet(spec) 바로 뒤의 새 bullet으로 두고, F3은 "above"로 참조한다 | spec과 plan 두 단계에 모두 적용되기 때문이다 |
| SJ12 | 새·변경 테스트 이름과 hold reason 문자열은 이 spec의 초안 문구를 쓴다 | J9 |
| SJ13 | `planner.target-evidence`의 `Initial design proposals and brainstorming MAY precede selection.`은 바꾸지 않는다 | 대화 방식과 충돌하지 않는다 |

## 14. v1 → v2 변경 요약
- 머리말: 근거를 design v2(경로·SHA-256)로 바꾸고 버전을 v2로 올렸다.
- §1: G4·G5, Planner 직접 대화 금지, J4·J5, ledger 비변경을 추가했다.
- §2: inventory, 작성자 판단, 진짜 새 결정 용어를 추가했다.
- §3: §3.0 파일별 범위, P20–P25, §3.1.3–§3.1.4, §3.1.1 2·5항 개정, RP2–RP3, F4–F6과 F3 개정, §3.7 C1을 추가했다. v1의 모호한 범위 표현은 "안 바꾼다(이유)"로 확정했다.
- §4: §4.8과 §4.6의 ledger 유지 항목을 추가했다.
- §5: T3를 반영했다.
- §6: 305/438/435/451 갱신, 회귀 목록, G4/G5 테스트를 추가했다.
- §7: AC12–AC17과 §7.2 G4/G5 목록을 추가했다.
- §8: commit.md·verification.md 표현을 확정했다.
- §8.1: D1–D3을 재분류했다.
- §11: I10–I12를 추가했다.
- §12: T1–T3를 반영했다.
- §13: 작성자 판단 목록을 신설했다.
