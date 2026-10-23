# ARC 하네스 신뢰성 개선 구현 계획

> **For agentic workers:** 사용자 제공 ARC 역할 흐름을 따른다. Orchestrator가 Implementer·QA·Reviewer 배정, 승인 요청, 수용 및 모든 Git 변경·commit을 소유한다. 일반 실행 스킬의 역할·commit 지시보다 ARC 계약을 우선한다. 체크박스는 진행 기록이며 별도 commit 단위가 아니다.

**상태:** 사용자 승인 완료 — 2026-10-24

**Goal:** 제한된 읽기 복구, 적용 지침의 출처, 승인 시각자료에서 실제 산출물 비교까지 이어지는 증거 계약을 Codex와 Claude 양쪽 하네스에 일관되게 반영한다.

**Architecture:** 기존 canonical policy와 생성 경로를 사용해 공통 계약을 수정하고 플랫폼별 프로필·reference·운영 문서에 연결한다. 정책 원본과 실제 주입·배포 내용의 일관성을 하나의 수용 단위로 다루므로 전체를 하나의 cross-platform 구현 task로 묶는다. 새로운 역할·복구 엔진·실행 환경은 추가하지 않는다.

**Tech Stack:** JSON 정책, JavaScript ESM 렌더러·생성기, Codex TOML 프로필, Claude Markdown 프로필, Markdown reference·운영 문서, 기존 Node.js·Python 검사 표면, `MANIFEST.sha256`.

**Spec:** `/Users/yunho/Desktop/project/arc/docs/superpowers/specs/2026-10-24-arc-harness-reliability-design.md`  
**Spec SHA-256:** `0c3d198ca9cc1f48c1bcd4294eab976a1f7c2dc096138fa5070f7e4e49cd5de6`  
**Plan:** `/Users/yunho/Desktop/project/arc/docs/superpowers/plans/2026-10-24-arc-harness-reliability.md`

## Global Constraints

- 승인 spec의 H1–H5와 H1-01…H5-03를 실행 계약으로 사용한다.
- 계획 승인 전 구현을 시작하지 않는다.
- **사용자는 2026-10-24 기존 4개 테스트 파일의 계약 사례 수정과 §4 Step 5에 열거한 로컬 검사, Codex·Claude 행동 관측 및 visual QA를 승인했다.** 새 테스트 파일·새 suite·계획 범위 밖 실행은 별도 승인 없이 추가하지 않는다.
- 필요한 risk-scaled QA·Reviewer를 승인 부족을 이유로 생략하지 않는다.
- Implementer 배정 전 승인된 spec과 plan을 Orchestrator가 하나의 focused documentation batch로 commit하고 상태를 확인한다.
- 모든 Git stage·commit·branch·worktree·복구 변경은 Orchestrator만 수행한다.
- 허용 읽기 대안은 함께 확인된 자료·승인 버전·목적·역할 권한을 유지한다. 다른 접근 locator가 필요하면 brief가 정확히 지정해야 한다.
- 추측 경로, 새 의존성, 환경·권한·대상 변경, mutation 재시도, 불명확한 상태의 자동 복구를 허용하지 않는다.
- 기존 승인·보존·fresh 역할·QA 재검증·최종 Reviewer·수용·commit 계약을 유지한다.
- `/Users/yunho/.codex/skills/arc/`는 참고 지침이며 이번 편집·설치·배포 대상이 아니다.
- `tests/installer-parity.json`의 frozen legacy inventory는 수정하지 않는다.
- 루트 `AGENTS.md` 부재는 사용자 제공 AGENTS coordination 지침의 부재나 그 자체의 blocker가 아니다.
- `visual-companion.md`의 설계 대화 운영과 QA의 실제 구현 비교를 구분한다.
- 정적·문구·parity 통과를 실제 역할 행동이나 시각 적합성 증명으로 보고하지 않는다.

## Review Focus

| ID | 입력·실패 조건 | 기대 행동과 T1 사례 |
|---|---|---|
| RF1 | 선택적 읽기 예외와 권한·부분 mutation 불확실성이 함께 있음 | 복구 예외를 적용하지 않고 반환. `unsafe_recovery_remains_blocked`로 연결 |
| RF2 | 비슷한 자료·다른 버전·지정되지 않은 locator가 사용됨 | 허용된 동등 자료로 추정하지 않음. 지정된 다른 locator라도 자료·승인 버전·목적의 연결을 확인. `bounded_read_recovery_contract`로 연결 |
| RF3 | 사용자 AGENTS 지침은 있으나 루트 파일은 없음 | 지침을 유지하며 파일 부재만으로 중단하지 않음. `instruction_provenance_contract`로 연결 |
| RF4 | 원본 또는 실제 출력 없이 시각 일치를 주장 | 해당 기준을 `unverified`로 보고. `visual_evidence_contract`로 연결 |
| RF5 | 재개한 fresh 역할에 이전 승인·완료·유효 증거가 누락됨 | 사실을 추정하지 않고 영향받는 작업 보류. `resume_and_role_invariants`로 연결 |

위 사례의 테스트 추가·실행과 행동 관측은 모두 **not authorized / hold** 상태다.

---

## 1. 대상·승인 이력·현재 상태

| 항목 | 전달된 사실 |
|---|---|
| Workspace/repository | `/Users/yunho/Desktop/project/arc` |
| 사용자 선택 | 현재 checkout 사용 |
| Branch | `feat/arc-tui-ux` |
| 준비 기준 HEAD | `158dc482f0d5b58123d314d71a43acfd37e692ee` |
| 마지막 변경 상태 | 승인 spec만 untracked. Tracked staged/unstaged 수정과 다른 untracked 변경 없음 |
| 문서 소유권 | 승인 spec·plan·canonical record는 Orchestrator 소유 |
| Canonical record | `/Users/yunho/Desktop/project/arc/.git/arc/handoff/arc-harness-reliability.md` |

승인 이력:

1. 사용자가 B안과 현재 checkout 사용을 선택했다.
2. 사용자가 서면 spec을 승인하고 계획 작성을 요청했다.
3. 현재 plan은 승인 대기 상태다.
4. 테스트 추가·수정과 테스트·검증 실행의 명시적 사용자 승인은 없다.

준비 기준 HEAD는 구현 시작 HEAD와 다를 수 있다. Orchestrator가 승인 문서 batch를 commit한 뒤 실제 HEAD·상태·소유권을 canonical record와 Implementer brief에 전달한다.

이번 계획 수정에서 파일 저장·수정, 명령, 테스트, 검증은 수행하지 않았다. Git 상태와 승인 사실은 Orchestrator가 제공한 증거를 사용했다.

## 2. 구현 단위와 source-of-truth

공통 정책만 수정하고 플랫폼 프로필이 포괄적인 no-fallback 문구를 유지하면 계약이 충돌한다. Reference·운영 문서·생성 payload·manifest가 뒤처져도 실제 전달 내용이 달라질 수 있다.

따라서 원본→렌더링→양 플랫폼 프로필/reference→generated payload→운영 문서→검증·manifest를 **T1 하나의 top-level task와 focused implementation commit**으로 묶는다. 하위 단계별 또는 플랫폼별로 나누어 수용하지 않는다.

Source-of-truth와 변경 원칙:

- 공통 계약은 `lib/policy/role-policy.json`에서 관리한다.
- 기존 `planning.planner-brief`를 보완하며 별도 planning framework를 만들지 않는다.
- 생성 영역은 확인된 원본·생성기를 통해 갱신한다.
- 렌더러·생성기·검사 스크립트는 실제 필요성이 있을 때만 수정한다.
- 연결 표면의 수정·제외 근거와 미확인 범위를 기록한다.
- 설치본이나 frozen legacy inventory를 변경하여 검사 결과를 맞추지 않는다.

## 3. 실행 전 gate

이 section은 Orchestrator의 준비 책임이며 별도 구현 task가 아니다.

- [ ] 계획의 정확한 파일 매핑과 보류 사항을 검토한다.
- [ ] 계획 승인을 확보한다.
- [ ] 테스트 추가·수정, 정적 검사, 역할 행동 관측, 시각 검증의 명시적 사용자 승인 범위를 기록한다.
- [ ] T1의 PATH-HOLD·COMMAND-HOLD·EVIDENCE-HOLD를 해소한다.
- [ ] 승인된 spec과 plan을 하나의 focused documentation batch로 commit한다.
- [ ] 실제 branch·HEAD·변경·소유권과 문서 commit을 canonical record에 기록한다.
- [ ] 기존 Common handoff gate와 위 조건을 모두 충족한 뒤 fresh Implementer를 배정한다.

계획 승인에 테스트·검증 승인이 포함됐다고 추정하지 않는다. **현재 T1은 not authorized / hold이며 Implementer handoff는 ready가 아니다.**

## 4. Task T1 — 양 플랫폼 하네스 계약과 전달 표면 일관화

### 목표·범위

H1–H5를 canonical policy부터 양 플랫폼의 실제 전달 프로필·reference·generated payload·운영 문서·검증·manifest까지 하나의 일관된 변경으로 구현한다.

새로운 하네스 시스템, 과거 UI 수정, 설치본 갱신, 일반적인 Planner UX 개편은 포함하지 않는다.

### Files

경로가 확인된 파일은 다음과 같다. “조건부” 파일은 실제 변경 필요성을 확인하고 제외 여부를 기록한다.

| 구분 | 정확한 절대 경로 | 책임 |
|---|---|---|
| Modify | `/Users/yunho/Desktop/project/arc/lib/policy/role-policy.json` | 공통 복구·출처·시각 증거·재개 계약 |
| 조건부 Modify | `/Users/yunho/Desktop/project/arc/lib/policy/render.mjs` | 기존 렌더링으로 새 계약을 전달하지 못하는 경우에만 수정 |
| 조건부 Modify | `/Users/yunho/Desktop/project/arc/scripts/update-role-policy.mjs` | 생성·전달 대상에 실제 누락이 있는 경우에만 수정 |
| Modify/generated 확인 | `/Users/yunho/Desktop/project/arc/codex/agents/arc-planner.toml` | Planner의 제한적 읽기 복구와 draft-only 경계 |
| Modify/generated 확인 | `/Users/yunho/Desktop/project/arc/codex/agents/arc-implementer.toml` | 출처·복구·시각 구현 증거 |
| Modify/generated 확인 | `/Users/yunho/Desktop/project/arc/claude/agents/arc-planner.md` | Codex Planner와 의미가 같은 계약 |
| Modify/generated 확인 | `/Users/yunho/Desktop/project/arc/claude/agents/arc-implementer.md` | Codex Implementer와 의미가 같은 계약 |
| Modify | `/Users/yunho/Desktop/project/arc/docs/harness-operation.md` | Routing, preparation, approval continuity, verification, failure/resume 설명 |
| Test, 승인 필요 | `/Users/yunho/Desktop/project/arc/tests/node/role-policy.test.mjs` | 공통·렌더링 계약 회귀 검사 후보 |
| Test, 승인 필요 | `/Users/yunho/Desktop/project/arc/tests/test_arc_policy.py` | 기존 정책 계약 검사 후보 |
| Test, 승인 필요 | `/Users/yunho/Desktop/project/arc/tests/node/parity-check.test.mjs` | Parity 회귀 검사 후보 |
| Test, 승인 필요 | `/Users/yunho/Desktop/project/arc/tests/test_harness_contract.py` | 인계·역할·검증 계약 검사 후보 |
| 조건부 Modify | `/Users/yunho/Desktop/project/arc/scripts/check-installer-parity.mjs` | 실제 배포 표면 검사를 지원할 필요가 있을 때만 수정 |
| Generated | `/Users/yunho/Desktop/project/arc/MANIFEST.sha256` | 최종 배포 대상 변경의 checksum 반영 |

Orchestrator가 승인된 읽기 조사로 아래 경로와 생성 관계를 확인했다. 이것은 범위를 확장하지 않으며 경로 추측을 허용하지 않는다.

| 표면 | 정확한 절대 경로 | 생성·수정 판단 |
|---|---|---|
| Codex Orchestrator skill | `/Users/yunho/Desktop/project/arc/codex/skill/SKILL.md` | 정책 managed block 대상 |
| Codex 공통 references | `/Users/yunho/Desktop/project/arc/codex/skill/references/coordination.md`; `/Users/yunho/Desktop/project/arc/codex/skill/references/planning.md`; `/Users/yunho/Desktop/project/arc/codex/skill/references/handoff.md`; `/Users/yunho/Desktop/project/arc/codex/skill/references/handoff-prep.md`; `/Users/yunho/Desktop/project/arc/codex/skill/references/commit.md`; `/Users/yunho/Desktop/project/arc/codex/skill/references/verification.md` | 정책 managed block 대상. 각 참조의 일반 본문은 정책 원본에서 생성되지 않음 |
| Claude Orchestrator skill | `/Users/yunho/Desktop/project/arc/claude/skill/SKILL.md` | 정책 managed block 대상 |
| Claude 공통 references | `/Users/yunho/Desktop/project/arc/claude/skill/references/coordination.md`; `/Users/yunho/Desktop/project/arc/claude/skill/references/planning.md`; `/Users/yunho/Desktop/project/arc/claude/skill/references/handoff.md`; `/Users/yunho/Desktop/project/arc/claude/skill/references/handoff-prep.md`; `/Users/yunho/Desktop/project/arc/claude/skill/references/commit.md`; `/Users/yunho/Desktop/project/arc/claude/skill/references/verification.md` | 정책 managed block 대상. 각 참조의 일반 본문은 정책 원본에서 생성되지 않음 |
| 시각 동반 reference | `/Users/yunho/Desktop/project/arc/codex/skill/references/visual-companion.md`; `/Users/yunho/Desktop/project/arc/claude/skill/references/visual-companion.md` | generator 대상이 아님. 두 파일을 검토하고 필요한 구분만 수동 반영하거나 제외 근거 기록 |
| Codex specialist profiles | `/Users/yunho/Desktop/project/arc/codex/agents/arc-scouter.toml`; `/Users/yunho/Desktop/project/arc/codex/agents/arc-planner.toml`; `/Users/yunho/Desktop/project/arc/codex/agents/arc-implementer.toml`; `/Users/yunho/Desktop/project/arc/codex/agents/arc-qa.toml`; `/Users/yunho/Desktop/project/arc/codex/agents/arc-reviewer.toml` | 정책 managed block 대상. 관련 중단·보고 문구 충돌 확인 |
| Claude specialist profiles | `/Users/yunho/Desktop/project/arc/claude/agents/arc-scouter.md`; `/Users/yunho/Desktop/project/arc/claude/agents/arc-planner.md`; `/Users/yunho/Desktop/project/arc/claude/agents/arc-implementer.md`; `/Users/yunho/Desktop/project/arc/claude/agents/arc-qa.md`; `/Users/yunho/Desktop/project/arc/claude/agents/arc-reviewer.md` | 정책 managed block 대상. Codex 대응 계약과 의미 비교; Claude hook wiring 보존 |
| Claude Git policy payload | `/Users/yunho/Desktop/project/arc/claude/skill/hooks/git-policy.json` | canonical policy의 Git 부분에서 생성 |
| 설치용 package surface | `/Users/yunho/Desktop/project/arc/MANIFEST.sha256`, `/Users/yunho/Desktop/project/arc/lib/installer/plan.mjs`, payload 등록 자료 | 경로·대응 관계를 읽어 확인; 설치본을 갱신하지 않음 |
| Installed Codex reference | `/Users/yunho/.codex/skills/arc/` 아래 동일 이름의 reference | 읽기 전용 기준 자료; 이번 편집·설치·배포 대상 아님 |

`POLICY_TARGETS`와 설치 계획을 읽어 확인한 관계에 따르면 profile 및 여섯 공통 reference의 managed block은 `lib/policy/role-policy.json`에서 생성되고, Claude Git policy payload도 같은 원본에서 생성된다. 일반 reference 본문 전체는 단일 원본에서 동기화되지 않는다. `visual-companion.md`는 정책 생성 대상이 아니다. 설치본은 repository payload와 별도다. 새 계약 결정이 필요하면 영향받는 작업을 보류한다.

**Orchestrator pre-handoff resolution (2026-10-24):** 위 절대 경로는 `lib/policy/render.mjs`의 `POLICY_TARGETS`와 `lib/installer/plan.mjs`의 payload 소비 경로를 읽어 정리했다. 이 범위 확정은 사용자 승인된 H1–H5, 한 개의 cross-platform task, 변경 제외 사항을 바꾸지 않는다. 승인 원본 및 두 comparison attachment의 세 경로는 현재 존재한다. 승인 원본에는 Compact A의 이중 윤곽 ARC mark가 있고, 두 번째 첨부에는 ASCII 대각선 mark가 보인다. 첨부에서 시각 차이는 직접 관측할 수 있지만 구현 source revision 연결은 없다. 해당 QA는 mark 차이를 `mismatch`, revision 연결은 `unverified`로 보고해야 한다. 사용자는 live behavior observation과 visual QA를 승인했다. Codex CLI는 설치되어 있고 `claude` CLI는 없으며 `Claude.app`은 실행 가능하다. Claude 앱 세션을 사용하더라도 이는 Claude Code CLI runtime 검증이 아니다.

### Input / Output Interface

**Consumes:**

- 승인 spec과 위 SHA-256.
- 승인 plan과 확정된 절대 파일 지도.
- 문서 commit 후 실제 branch·HEAD·변경·소유권.
- 사용자 제공 지침·발견 파일·설치 reference·입력의 출처.
- 기존 policy ID·schema·managed block·생성 관계.
- 승인된 검사·행동 관측·시각 검증 범위와 자료.

**Produces:**

- 의미가 일치하는 policy/profile/reference/payload/docs/manifest 변경.
- H1–H5의 기준별 증거 지도.
- 실제 변경·제외 파일 목록과 근거.
- 실패·미검증·잔여 보류 목록.
- Orchestrator가 수용 여부를 판단할 최종 변경 상태.

새 runtime API나 별도 기록 시스템은 만들지 않는다.

### Dependencies

- 제3절의 gate 전체.
- 사용자 승인 범위 안의 테스트 수정·정적 검사 승인 확인. 실제 행동·시각 관측도 승인됐다.
- PATH-HOLD·COMMAND-HOLD·EVIDENCE-HOLD를 해소한다. revision 미연결은 의도된 `unverified` 관측 사례로 보존한다.
- 기존 Common handoff gate 충족.
- 선행 구현 task는 없다.

### Acceptance IDs

H1-01, H1-02, H1-03, H1-04, H2-01, H2-02, H2-03, H3-01, H3-02, H3-03, H3-04, H4-01, H4-02, H5-01, H5-02, H5-03.

### Ownership

- **Implementer:** 확정 파일 편집, 승인된 생성 작업·focused check.
- **Fresh QA:** 승인된 정적·행동·시각 검증, 결과·한계 보고.
- **Orchestrator:** Gate·범위·결과 검토, 수용, 모든 Git 변경.
- **Final Reviewer:** T1 수용·commit 및 필요한 QA 완료 후 최종 전체 변경 검토. T1별 수용 prerequisite가 아니다.

### Checkable Steps

#### Step 1 — 회귀 사례를 기존 검사에 연결

**승인 상태:** 사용자가 2026-10-24 기존 네 테스트 파일의 수정과 계획에 열거한 검사를 승인했다. 아직 수정·실행 전이다.

- [ ] 기존 schema·policy ID·렌더링·검사 패턴에 맞춰 수정 위치를 정한다.
- [ ] 다음 논리적 사례를 적절한 기존 검사에 추가하거나 보강한다. 함수명은 기존 framework 규칙에 맞춘다.

| 사례 | Assertion |
|---|---|
| `bounded_read_recovery_contract` | 사전 허용·선택적·부작용 없음·함께 확인된 자료·승인 버전·목적·역할 권한·동등 관측 조건이 유지됨. 다른 locator는 brief가 정확히 지정해야 함 |
| `unsafe_recovery_remains_blocked` | 필수 입력·권한·대상·소유권·부분 mutation·상태 불확실성 및 대안 실패는 반환 조건임 |
| `instruction_provenance_contract` | 사용자 메시지·발견 파일·설치 reference·작업 입력을 출처와 상태로 구분함 |
| `visual_evidence_contract` | 승인 원본·기준·실제 출력·fresh QA와 `pass`·`mismatch`·`unverified`가 연결됨 |
| `resume_and_role_invariants` | 완료 작업·승인·유효 증거 전달과 역할·Git·QA·Reviewer·수용 경계를 유지함 |

- [ ] 승인된 실행 방법으로 변경 전 결과를 기록한다. 기존 계약이 이미 충족하는 사례를 억지로 실패시키지 않는다.

**완료 증거:** 사례→파일→spec ID 연결과 변경 전 결과. 정적 assertion은 실제 역할 행동의 증명이 아님을 표시한다.

#### Step 2 — Canonical contract 수정

- [ ] 선택적 읽기 방법 실패와 필수 입력·권한·상태 실패를 분리한다.
- [ ] 허용 대안을 brief의 자료·승인 버전·목적·방법·locator·전제조건·필요 증거·반환 조건으로 제한한다.
- [ ] 다른 locator를 사용하는 경우에도 함께 확인된 동일 자료·승인 버전·목적을 유지하도록 한다.
- [ ] 대안 미허용·모호함·실패 시 연쇄 탐색·재시도 없이 반환하도록 한다.
- [ ] 지침의 네 출처와 입력 상태를 기존 brief 구조에 연결한다.
- [ ] 시각자료의 정확한 source·승인·접근 상태·기준 ID·실제 출력·결과 증거를 연결한다.
- [ ] 재개 brief에 실패·해소·완료 작업·유효/무효 증거·다음 목표를 연결한다.
- [ ] 기존 권한·보존·승인·Git 규칙과 충돌하는 완화 문구를 제거한다.

**완료 증거:** Canonical diff와 H1–H4 연결. 새 framework 또는 범위 밖 정책 변경이 없어야 한다.

#### Step 3 — 양 플랫폼·reference·운영 문서 정합화

- [ ] 확정된 경로에 따라 Codex·Claude Planner·Implementer와 관련 프로필을 반영한다.
- [ ] Orchestrator `SKILL.md`와 coordination/planning/handoff/verification reference에 각 책임을 반영한다.
- [ ] 포괄적인 no-fallback 문구와 새 예외가 충돌하지 않도록 조건을 함께 전달한다.
- [ ] `visual-companion.md`는 필요한 구분만 수정하거나 제외 근거를 기록한다.
- [ ] `docs/harness-operation.md`의 기존 section에 허용/금지 사례·출처·시각 증거·재개를 반영한다.

**완료 증거:** Paired mapping, 변경·제외 목록, 플랫폼별 의미 차이 검토 결과.

#### Step 4 — Generated payload와 manifest 반영

- [ ] 승인된 생성 범위에서 `npm run update:role-policy`를 사용한다.
- [ ] 생성 오류·부분 완료가 있으면 자동 재실행하지 않고 반환한다.
- [ ] 승인된 생성 범위에서 `node scripts/update-manifest.mjs`로 manifest를 갱신한다.
- [ ] 생성 결과가 실제 전달 payload에 반영되는지 승인된 방법으로 확인한다.
- [ ] 설치본과 frozen inventory가 변경되지 않았음을 변경 목록으로 보고한다.

**완료 증거:** 원본→generated→payload→manifest 연결과 최종 변경 목록. 직접 수정한 generated drift가 없어야 한다.

#### Step 5 — 정적 검사

**승인 상태:** 사용자가 2026-10-24 표에 열거한 로컬 검사를 승인했다. 실행은 Implementer handoff 이후다.

| 확인된 명령 | 목적 | Passing evidence |
|---|---|---|
| `npm run check:role-policy` | 정책 생성물 일치 | 정상 종료와 검사 결과 |
| `npm run check:manifest` | 최종 checksum 일치 | 정상 종료와 검사 결과 |
| `npm test` (`node --test tests/node/*.test.mjs`) | 저장소의 전체 Node test suite | 정상 종료와 전체 결과 |
| `python3 -B -m unittest discover -s tests -p test_arc_policy.py -v` | 정책·프로필 구조 계약 | 정상 종료와 전체 결과 |
| `python3 -B -m unittest discover -s tests -p test_harness_contract.py -v` | harness 문서·도식 계약 | 정상 종료와 전체 결과 |
| `node scripts/check-installer-parity.mjs --complete` | frozen parity ledger와 active Node/Python coverage의 대응 확인 | 정상 종료와 선택된 실행 항목·결과 |

- [ ] 승인 범위를 확인한 뒤 위 검사를 실행한다.
- [ ] parity `--complete`의 명령 범위를 확인했다. 이는 대응된 Node test와 보존된 Python suite를 실행하므로 TEST-HOLD 승인에 포함한다.
- [ ] 실패는 수정 후 필요한 QA 재확인으로 연결한다.

생성 단계에서 사용하도록 확인한 명령은 `npm run update:role-policy`와 manifest 갱신용 `node scripts/update-manifest.mjs`다. 두 명령은 파일을 변경하므로 구현 승인·handoff 이후에만 사용한다. `--check`가 붙은 `npm run check:manifest`는 비교만 수행한다.

**완료 증거:** 실행 명령·환경·대상 revision/변경 상태·결과·한계. 미실행은 통과가 아니다.

#### Step 6 — Fresh QA 행동·시각 확인

**승인 상태:** 사용자가 2026-10-24 Codex·Claude 행동 관측과 승인 목업·기존 비교 자료·확인 가능한 실제 산출물의 시각 QA를 승인했다. Codex는 fresh ARC-role agent로, Claude는 repository 소스 코드 없이 synthetic profile prompt를 입력한 Claude.app 세션으로 관측한다. Claude Code CLI는 없으므로 결과 범위를 해당 앱 세션으로 제한한다.

- [ ] Fresh QA에 승인 문서·최신 상태·자료·권한·임시 산출물 위치와 정리 책임을 전달한다.
- [ ] Codex fresh ARC-role agent와 Claude.app의 별도 synthetic profile-prompt session에서 제5절 양성·음성 사례를 관측한다. Claude.app에 전달하는 입력은 역할 안내와 synthetic brief뿐이며 저장소 구현 코드는 포함하지 않는다.
- [ ] 실제 권한 우회·Git 손상·제품 mutation으로 금지 조건을 만들지 않는다.
- [ ] `/tmp/arc-harness-reliability-qa/`를 QA의 임시 증거 위치로 사용하고 보고 완료 후 QA가 만든 임시 파일을 정리한다.
- [ ] 승인 원본과 기존 comparison attachment를 기준별로 비교한다. Compact ARC mark와 ASCII mark의 차이는 `mismatch`; 증거가 구현 revision에 연결되지 않은 사실은 별도 `unverified`로 보고한다.
- [ ] 실패·미검증·환경 제한은 Orchestrator에게 반환한다.
- [ ] 필요한 Implementer 수정→QA 재확인을 완료한다.

**완료 증거:** 기준별 관측·결과·한계와 재확인 기록.

#### Step 7 — Orchestrator 수용·commit

- [ ] Orchestrator가 모든 acceptance ID, 필수 검사, finding·재확인, 보존 상태를 검토한다.
- [ ] 필수 증거가 충족된 경우 T1을 수용한다.
- [ ] **Orchestrator만** T1 전체 변경을 하나의 focused implementation commit으로 기록한다.
- [ ] 실제 commit·상태·증거 연결을 canonical record에 남긴다.

하위 단계나 플랫폼별 분리 commit을 만들지 않는다. 보고·검사 통과만으로 수용된 것으로 간주하지 않는다.

### Required Evidence Before Acceptance

- H1-01…H5-03별 결과와 증거 위치.
- 실제 변경·제외 파일과 source→generated→배포 연결.
- 승인된 필수 정적 검사 결과.
- Codex·Claude의 필요한 행동 관측 결과.
- 승인 원본과 실제 출력의 기준별 비교.
- 필요한 수정·QA 재확인 완료.
- 역할·승인·Git·보존 불변조건 충족.

필수 `unverified`나 미해결 실패가 있으면 수용을 보류한다.

### Hold Conditions

테스트·검증 승인 부재, 경로·생성 관계 불명, 예상 밖 Git 상태, 필수 입력 부재, 범위·방법·위험 변경, 미해결 실패, 필수 QA 불통과·미검증.

### Orchestrator-only Commit Boundary

T1의 모든 변경을 Orchestrator 수용 후 하나의 focused implementation commit으로 기록한다. 승인 문서 batch commit은 이 구현 commit의 선행 준비이며 T1과 구분한다.

## 5. QA·수용 기준 추적

| 기준 | 필요한 사례·관측 |
|---|---|
| H1-01 | 선택적 읽기 실패와 필수 입력·권한·상태 실패의 서로 다른 처리 |
| H1-02 | 함께 확인된 자료·승인 버전·목적·역할 권한을 유지하는 대안 성공. 다른 locator는 brief에 정확히 지정됨 |
| H1-03 | 대안 미허용·실패·모호함, 추측 locator, RF1·RF2의 반환 |
| H1-04 | 최초 실패·대안·증거·제한·의존 작업 구분 보고 |
| H2-01 | Brief의 네 출처 유형과 입력 상태 |
| H2-02 | RF3: 사용자 지침 적용과 루트 파일 부재의 양립 |
| H2-03 | 실제 필수 입력 부재·지침 충돌의 보류 |
| H3-01 | 승인 원본·버전·승인·접근 상태 연결 |
| H3-02 | 기준 ID·속성·판단 방법 및 승인되지 않은 해석 반환 |
| H3-03 | Implementer 자체 보고와 fresh QA의 실제 비교 구분 |
| H3-04 | RF4·실제 불일치의 `unverified`·`mismatch` 처리 |
| H4-01 | 역할·승인·Git·보존·QA·Reviewer·수용 계약 유지 |
| H4-02 | RF5: 재개 brief가 기존 승인·완료 작업·실패·해소 근거·유효 증거를 전달하고, 해소 후 영향받은 gate를 다시 확인하는지 관측 |
| H5-01 | 실제 변경·제외 근거·미확인 범위 |
| H5-02 | 정적·행동·시각 결과와 증거 한계 구분 |
| H5-03 | 양 플랫폼 의미 일관성과 플랫폼별 실행 한계 |

### 시각 비교 자료와 범위

승인 원본:

`/Users/yunho/.codex/visualizations/2026/10/23/01a1699c-8c88-76c2-8855-c86c4c89a914/arc-tui-ux-mockup-v3.png`

비교 첨부:

- `/var/folders/2x/zy_vqh9s35qczpl53nxq1sx40000gn/T/codex-clipboard-5b3759b5-3bf3-443a-80aa-5143bc4f4710.png`
- `/var/folders/2x/zy_vqh9s35qczpl53nxq1sx40000gn/T/codex-clipboard-cbb0d90d-2e5e-424a-b814-8b3b663ae06c.png`

이 자료는 하네스가 원본·산출물 차이를 사실대로 기록하는지 확인하는 회고 사례다. 과거 UI 수정은 포함하지 않는다.

- QA는 직접 관측한 압축된 이중 윤곽형 mark와 실제 형태의 차이를 기준별로 기록한다.
- 첨부와 구현 출력의 연결 근거가 부족하면 해당 연결은 `unverified`다.
- 새 render가 필수라면 실행 방법·환경·capture 위치·정리 책임을 먼저 확정한다.
- 접근 실패 시 임의 locator로 바꾸지 않는다. Brief에 정확히 허용된 대안만 제약을 충족할 때 사용한다.
- 회고 자료의 `mismatch`는 하네스가 불일치를 포착했는지 평가하는 증거다. 과거 제품 수정 의무로 확대하지 않는다.
- 일치·불일치·접근 불가 사례의 자료와 관측 방법을 QA brief에 확정한다. 자료 없는 성공 사례를 만들지 않는다.

## 6. 최종 전체 Reviewer와 correction 흐름

1. Fresh Implementer가 T1을 수행한다.
2. Fresh QA와 필요한 수정·QA 재확인을 완료한다.
3. Orchestrator가 T1을 수용하고 focused implementation commit을 기록한다.
4. 독립 Reviewer가 승인 문서와 최종 전체 변경을 검토한다.
5. 이미 수용·commit된 작업의 final overall Reviewer finding이 있으면 Orchestrator가 기존 절차에 따라 **후속 correction task와 필요한 승인 여부**를 정한다.
6. Implementer가 correction을 수행하며, 수정은 Reviewer 재검토 중 미커밋으로 유지한다.
7. Reviewer가 latest state/diff를 확인하고 필요한 finding 재확인을 수행한다.
8. 해결 후 Orchestrator가 correction을 수용하고 focused follow-up commit을 기록한다.
9. Orchestrator가 최종 finding·증거·Git 상태·한계를 확인하여 완료를 결정한다.

이 final overall finding 예외는 행동 finding을 포함하여 Implementer→Reviewer로 처리하며 **QA를 재배정하지 않는다.** 최초 최종 전체 review 전의 QA와 이전 QA 실패·필수 재확인 의무는 없애지 않는다.

후속 correction task는 기존 finding 해소 절차다. 승인되지 않은 새 기능을 포함하지 않는다. Finding 해소가 범위·방법·위험을 실질적으로 바꾸면 Orchestrator가 필요한 승인을 판단하고 영향받는 작업을 보류한다.

## 7. 실행 전 보류 목록

| ID | 해소 주체 | 필요한 해소 |
|---|---|---|
| APPROVAL-HOLD | Orchestrator | 해결 — 사용자가 2026-10-24 계획을 승인함 |
| TEST-HOLD | Orchestrator | 해결 — 2026-10-24 사용자 승인: 기존 네 테스트 파일과 Step 5 검사, Codex·Claude 행동 관측, 승인 목업 비교 QA. 새 suite·범위 밖 검사는 제외 |
| PATH-HOLD | Orchestrator | 해결 — §4 Files에 Codex·Claude skill/reference/profile/payload의 절대 경로와 생성·수동 수정 관계를 기록함 |
| COMMAND-HOLD | Orchestrator | 해결 — Step 4·5에 생성, read-only check, Node/Python/parity 명령과 범위를 기록함 |
| EVIDENCE-HOLD | Orchestrator | 해결 — Codex fresh ARC-role agent와 Claude.app synthetic profile-prompt 세션을 관측한다. Claude Code CLI runtime은 검증하지 않았다고 제한을 기록한다. QA는 원본·첨부를 비교하고 mark 차이는 `mismatch`, source-to-revision link는 `unverified`로 분리한다. QA 임시 자료는 `/tmp/arc-harness-reliability-qa/`에서 QA가 보고 후 정리한다. |
| HANDOFF-HOLD | Orchestrator | 문서 batch commit, 승인, 테스트 범위, 정확한 파일·명령 지도, 검증 방법은 준비 완료. Implementer 배정 직전에 branch·HEAD·status·소유권을 재확인하고 Common handoff gate를 충족한다. |

필수 검사를 생략하거나 Implementer에게 경로·권한을 추측하도록 넘겨 보류를 해소하지 않는다. 현재 T1은 ready가 아니다.

## 8. Planner 자체 검토

- 필수 header, Global Constraints, Review Focus, task의 Files·interface·의존성·수용 기준·소유권·단계·증거·보류·commit 경계를 반영했다.
- H1-02를 자료·승인 버전·목적·권한 유지로 정합화했다. 다른 locator는 brief의 정확한 사전 지정이 필요하며 같은 path를 강제하지 않는다.
- H1–H5와 모든 acceptance ID를 T1·QA에 연결했다.
- 공통 계약과 양 플랫폼·생성·배포 일관성을 하나의 top-level task로 유지했다.
- Orchestrator 조사 결과를 반영해 paired file mapping과 명령의 위치·생성 관계를 구체화했다. Installed Codex reference와 repository payload를 분리했다.
- 테스트·검증의 명시적 승인 부족을 구현 전 hold로 유지했다. 필요한 QA·Reviewer를 생략하지 않았다.
- 최종 Reviewer finding은 후속 correction task, 미커밋 수정, latest state/diff 재검토, Orchestrator 수용·follow-up commit으로 정합화했다.
- 최초·이전 QA 의무와 최종 finding 단계의 QA 재배정 금지를 구분했다.
- 설치본 변경·frozen inventory 수정·과거 UI 수정·새 실행 시스템을 포함하지 않았다.
- 일반 스킬의 실행·commit 지시에는 ARC 역할·승인·Orchestrator-only Git 규칙을 우선 적용했다.
- 이번 단계에서는 파일 저장·수정, 명령, 테스트, 검증을 수행하지 않았다.

**Orchestrator note:** 계획 승인 이후 PATH-HOLD·COMMAND-HOLD를 해소하고, 사용자가 테스트·검사·행동·시각 QA 범위를 별도로 승인했다. EVIDENCE-HOLD의 관측 방법과 artifact scope도 위와 같이 확정했다. QA가 source-to-revision 연결을 `unverified`로 보고할 수 있으며, Claude Code CLI runtime 준수는 관측하지 않는다는 한계를 acceptance report에 유지한다. Implementer handoff는 직전 상태 재확인과 Common handoff gate 후 가능하다.

