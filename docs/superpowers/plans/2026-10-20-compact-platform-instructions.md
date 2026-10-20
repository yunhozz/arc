# Codex·Claude 지침 배치 정리 구현 계획

> **에이전트 실행 지침:** ARC Orchestrator가 의존성과 증거에 따라 실행한다. 각 최상위 작업에는 fresh Coder를 배정하고, 필요한 검증에는 fresh QA를 배정한다. Planner는 초안만 반환한다. Orchestrator가 작업을 인수한 뒤 작업별 focused commit을 만든다. superpowers:subagent-driven-development 또는 superpowers:executing-plans의 실행 방식은 ARC 계약으로 해석한다. 체크박스는 진행 기록이며 별도의 커밋 단위가 아니다.

**Goal:** Codex와 Claude의 자동 ARC 진입과 정책 의미를 보존하면서 전역 bootstrap과 플랫폼별 skill을 줄이고 상세 절차를 행동 전에 읽는 references로 배치한다.

**Architecture:** canonical 정책을 유지하고 renderer에 명시적인 정책 출력 구분을 추가한다. 이후 양 플랫폼의 전역·skill·참조 구조를 함께 전환하고, 역할 계약·정책 도달성·설치 payload를 검증한다. 역할별 profile의 완전한 계약과 플랫폼 설정은 유지한다.

**Tech Stack:** Node.js ESM, 기존 node:test, Python unittest, TOML·Markdown profiles, 기존 정책·manifest 생성 도구.

**Spec:** /Users/yunho/Desktop/project/arc/docs/superpowers/specs/2026-10-20-compact-platform-instructions-design.md

**Plan target:** /Users/yunho/Desktop/project/arc/docs/superpowers/plans/2026-10-20-compact-platform-instructions.md

- 문서 상태: 사용자 승인 완료

## 준비 증거와 소유권

- 저장소: /Users/yunho/Desktop/project/arc
- 브랜치: chore/compact-instructions
- 기준 HEAD: a86953f5838b9878fce5a8dd2ea6870531762498
- 사용자 승인: 위 spec의 정식 승인 완료
- 마지막 확인 상태: 승인된 spec의 untracked 파일 하나
- plan 경로: Orchestrator가 공식 대상으로 선택했으며 당시 존재하지 않음
- spec·plan 저장과 문서 승인 증거, 필요한 문서 커밋: Orchestrator 책임
- 구현·테스트 코드·지침 원본·생성 산출물 편집: 배정된 Coder 책임
- 독립 검증: 배정된 QA 책임
- 최종 전체 변경의 독립 리뷰: Reviewer 책임
- 작업 인수와 모든 Git 변경: Orchestrator 책임

첫 Coder 배정 전에 Orchestrator가 문서 승인·문서 커밋·target·소유권을 포함한 기존 handoff 요건을 충족한다. 이 계획은 그 증거가 이미 완료됐다고 주장하지 않는다.

## 전역 제약

- 기존 ARC 자동 활성화 조건과 후속 요청의 지속 적용을 보존한다.
- lib/policy/role-policy.json은 변경하지 않는다.
- CLI·설치·갱신·제거·runtime gate의 의미를 변경하지 않는다.
- 역할 권한, 승인, TDD 및 예외 조건, QA·Reviewer·인수·커밋 순서를 변경하지 않는다.
- profile의 모델·effort·도구 권한과 Claude hook 연결을 변경하지 않는다.
- upstream superpowers 참조 원문을 수정하지 않는다.
- 사용자 전역 설치 파일을 직접 수정하지 않는다. 검사는 임시 설치 대상에서 수행한다.
- 신규 의존성을 추가하지 않는다.
- 모든 경로는 위 저장소를 기준으로 한다. 역할 brief에는 절대 경로를 제공한다.
- 구조적 도달성 검사를 실제 모델의 모든 행동이 동일하다는 증거로 제시하지 않는다.

## Review Focus

다음 다섯 조건을 해당 작업의 검사에 포함한다.

1. 전역 축약 중 조사·분석·설계 등의 자동 진입 조건이나 후속 적용이 누락되는 경우.
2. 전체 문장을 이동했지만 담당 역할이 행동 이후에 읽거나, 참조를 읽을지 결정하는 조건 자체가 그 참조 안에만 있는 경우.
3. profile에서 계약을 제거하여 specialist가 Orchestrator용 skill에 의존하게 되는 경우.
4. 설치된 경로·공백 포함 사용자 지정 home에서 참조가 깨지거나 payload에서 빠지는 경우.
5. 기존 검사 위치만 바뀌면서 승인·검증 예외나 Claude hook·runtime 보존 검사가 약해지는 경우.

## 파일 구조와 책임

| 파일 | 책임 |
|---|---|
| lib/policy/placement.mjs — 신규 | 정책 ID의 출력 구분과 출력 구분 검증. runtime 정책을 포함하지 않음 |
| lib/policy/render.mjs | 기존 전체 계약 출력을 유지하면서 명시적 부분 출력 지원 |
| lib/installer/global-config.mjs | 기존 진입 조건을 보존한 짧은 전역 bootstrap |
| codex/skill/SKILL.md, claude/skill/SKILL.md | 공통 경계·라우팅·행동 전 필수 참조 색인 |
| 양 플랫폼 skill/references/의 지정 파일 | 이동한 상세 절차와 단계별 canonical 정책 전문 |
| 양 플랫폼 agents/arc-* | 기존 완전한 역할 계약을 유지하는 보존 대상 |
| tests/node/instruction-layout.test.mjs — 신규 | 양 플랫폼 지침 배치·조건·도달성·크기 검사 |
| tests/node/fixtures/instruction-contracts.json — 신규 | 기준 HEAD의 비생성 계약 문구·목적지·읽기 조건과 크기 기준 |
| 기존 정책·전역·설치 관련 tests | 출력 변화와 보존 계약 검증 |
| MANIFEST.sha256 | 각 작업의 최종 배포 파일과 일치 |

placement.mjs는 지침 출력 구분만 관리한다. runtime schema·gate·설치 설정에 새로운 값을 추가하지 않는다.

## 작업 의존성과 실행 순서

T1 정책 부분 출력 지원 → T2 양 플랫폼 지침 구조 전환 → 최종 전체 리뷰

두 작업은 같은 renderer와 생성 결과를 순차적으로 다루므로 병렬 실행하지 않는다.

T1은 기존 출력이 그대로인 상태에서 부분 출력 인터페이스를 독립적으로 검증할 수 있다. T2의 전역·skill·references·기존 구조 검사·payload 전환은 서로 의존하므로 처음부터 하나의 최상위 작업으로 묶는다. 양 플랫폼 또는 지침·설치를 별도 인수 단위로 쪼개지 않는다.

---

## T1. 기존 출력을 보존하는 정책 부분 출력 추가

**구현 목표:** 현재 호출의 결과를 유지하면서 canonical 규칙을 지정된 지침 위치에 출력할 수 있는 기능을 추가한다.

**선행 작업:** plan 승인과 Orchestrator의 실행 전 handoff 준비.

**Coder 편집 소유권:**

- 생성: lib/policy/placement.mjs
- 수정: lib/policy/render.mjs
- 수정: tests/node/role-policy.test.mjs
- 갱신: MANIFEST.sha256

전역 생성기·skill·references·profiles는 이 작업에서 변경하지 않는다.

### 인터페이스

lib/policy/placement.mjs는 다음을 제공한다.

- POLICY_PROJECTIONS: 출력 구분별 canonical rule ID 배열.
- validatePolicyProjections(policy): 알려지지 않은 ID, 구분 내 중복 ID, canonical 정책의 미배치 규칙을 거부한다. 성공하면 예외 없이 반환한다.

출력 구분은 다음 일곱 개다.

- core
- assignment
- planning
- handoff
- preparation
- verification
- commit

renderPolicySection(policy, options)는 기존 인자를 유지하고 선택적 projection을 추가한다.

- 생략 또는 'full': 기존 출력과 동일.
- 지정된 출력 구분: canonical 원문의 순서와 전문을 보존한 부분 출력.
- unknown projection: 오류.
- specialist audience에 'full' 이외의 projection: 오류. specialist 계약 축약에 사용하지 않는다.
- 기존 platform notice와 skillPath 처리: 기존 의미 유지.

정책 ID 배치는 다음으로 고정한다. 한 규칙을 여러 단계에 배치하는 것은 허용한다.

| 구분 | 포함 규칙 |
|---|---|
| core | scope.non-escalation, external.explicit-user-authority, role.orchestrator-boundary |
| assignment | git.specialists-deny, specialist 5개 role.* 규칙 |
| planning | git.orchestrator-accept-commit, review 3개 규칙 |
| handoff | git.specialists-deny, role.coder-implementation, review 3개 규칙 |
| preparation | scope.non-escalation, git.specialists-deny, git.orchestrator-accept-commit, external.explicit-user-authority |
| verification | git.orchestrator-accept-commit, review 3개 규칙 |
| commit | scope.non-escalation, git.orchestrator-accept-commit, external.explicit-user-authority |

review 3개 규칙은 review.significant-no-plan, review.significant-plan, review.final-plan-recheck다.

### 실행 단계

- [ ] **RED:** role-policy.test.mjs에 다음 검사를 추가한다.
  - policy projections reject unknown duplicate and uncovered rules
  - orchestrator projections preserve canonical text and order
  - default policy rendering preserves complete existing contracts
  - specialist rendering rejects partial projections
- [ ] 다음 명령으로 새 검사 실패를 확인하고 실패 원인이 신규 인터페이스 부재임을 기록한다.

```bash
node --test tests/node/role-policy.test.mjs
```

- [ ] 위 인터페이스를 구현한다. 기존 POLICY_TARGETS는 아직 부분 출력을 사용하지 않는다.
- [ ] 기존 malformed marker·UTF-8·입력 buffer 보존·생성 결정성·Claude hook 검사를 유지한 채 GREEN을 확인한다.

```bash
node --test tests/node/role-policy.test.mjs tests/node/global-config.test.mjs
npm run check:role-policy
```

- [ ] Coder가 manifest를 갱신하고 검사한다.

```bash
node scripts/update-manifest.mjs
npm run check:manifest
```

- [ ] Coder는 변경 파일, RED/GREEN, default output 보존과 제한을 보고한다.

### 수용 기준과 QA 증거

- 기존 기본 호출과 모든 기존 생성 대상의 출력이 변하지 않는다.
- 새 부분 출력이 canonical text·순서·대상 플랫폼을 보존한다.
- 누락·unknown·중복 규칙이 검출된다.
- specialist의 전체 계약을 부분 출력으로 바꿀 수 없다.
- 정책 JSON·hook·runtime 파일은 변경되지 않는다.
- 생성 검사와 manifest 검사가 통과한다.

공유 정책 renderer의 변경이므로 **fresh QA가 위 명령과 보존 diff를 독립적으로 확인**한다. 임시 fixture는 각 검사 자체의 임시 디렉터리에서 생성·정리하며 실제 사용자 home을 사용하지 않는다.

QA 실패는 Coder 수정 후 QA 재검사를 거친다. Reviewer는 T1 인수 전 필수 단계가 아니다.

### 중단 조건

- 기존 출력 보존에 실패하는 경우.
- 새 runtime·CLI·설치 동작이 필요해지는 경우.
- canonical 정책 변경이 필요해지는 경우.
- native 또는 환경 선행 요건 실패로 필수 검사를 완료하지 못하는 경우.

환경 실패 시 임의 설치나 설정 변경으로 해결하지 않고 Orchestrator에게 근거를 반환한다.

### 인수와 커밋

Orchestrator가 기준과 QA 증거·finding을 확인하여 T1을 인수한 뒤 하나의 focused commit을 만든다.

권장 제목: refactor(policy): 지침 위치별 정책 출력 지원

Orchestrator는 포함 파일·생성 결과·최종 SHA·HEAD·남은 변경을 확인한다. T2는 T1의 인수와 커밋 후 시작한다.

---

## T2. 양 플랫폼 bootstrap·skill·조건부 참조 전환

**구현 목표:** T1의 출력 구분을 실제 지침에 적용하고 두 플랫폼의 전역·skill·참조·payload를 함께 완성한다.

**선행 작업:** T1 인수·커밋 완료. T1 정책 출력 계약의 QA 검증 완료.

### Coder 편집 소유권

수정:

- lib/installer/global-config.mjs
- lib/policy/render.mjs의 POLICY_TARGETS와 출력 구분 연결
- codex/skill/SKILL.md
- claude/skill/SKILL.md
- 양 플랫폼의 다음 references:
  - planning.md
  - handoff.md
  - handoff-prep.md
  - verification.md
  - commit.md
  - limits.md
- tests/node/global-config.test.mjs
- tests/node/role-policy.test.mjs
- tests/node/plan.test.mjs
- tests/node/manifest.test.mjs
- tests/node/consumer.test.mjs
- tests/test_arc_policy.py
- MANIFEST.sha256

생성:

- codex/skill/references/coordination.md
- claude/skill/references/coordination.md
- tests/node/instruction-layout.test.mjs
- tests/node/fixtures/instruction-contracts.json

profiles·role-policy.json·runtime·hook 구현·모델 설정은 보존 대상으로 읽고 비교한다. profile 변경이 필요하다고 판단되면 편집 전에 Orchestrator에게 반환한다.

lib/installer/manifest.mjs는 기존 POLICY_TARGETS 처리만으로 새 coordination 문서를 검증할 수 있는지 먼저 확인한다. 가능하면 변경하지 않는다. 불가능하면 구체적인 누락과 필요한 최소 산출물 검증 보완을 Orchestrator에게 보고한다.

### 실제 배치 결정

| 기존 내용 | 목적지와 진입 조건 |
|---|---|
| 기존 전역의 언어·자동 진입·후속 적용·specialist 로딩·최소 역할 배정 지시 | 전역 bootstrap 유지 |
| 공통 핵심 경계·라우팅·필수 참조 색인·공유 용어 | 짧은 SKILL.md |
| 역할 배정 전 상세 계약, briefing·token discipline·모델 설정 해석·플랫폼 실행 어댑터 | coordination.md, 첫 specialist 생성·배정 및 관련 coordination 결정 전 |
| 의존성 분석·병렬 준비 상태 | planning.md의 기존 dependency/readiness 영역, 배정 결정 전 |
| specialist 용량·예약·ledger | limits.md, 첫 생성 전 |
| common handoff·Coder TDD와 예외·직접 편집 경로 전체 조건 | handoff.md의 명시적 섹션, Coder 배정·예외 판단·Orchestrator 직접 편집 전 |
| spec·plan·문서 저장·승인 순서 | planning.md의 기존 영역, 해당 판단·작성·저장 전 |
| target 선택·준비 Git 변경·문서 커밋 준비 | handoff-prep.md의 기존 영역, 해당 행동 전 |
| risk-scaled execution·QA·Reviewer·finding 재검토·completion | verification.md의 기존 영역, 검증 설계·배정·인수 판단 전 |
| task 인수 후 focused commit | commit.md의 기존 영역, 해당 인수·Git 변경 전 |

기존 handoff-worktree.md, git-recovery.md, visual-companion.md로 향하는 필수 조건부 링크는 skill 색인에서 유지한다. 내용을 옮기지 않는 한 이 파일들은 변경하지 않는다.

SKILL.md에는 예외의 존재와 **예외 판단 전에 handoff.md의 전체 조건을 읽어야 한다는 지시**를 둔다. 작은 작업 예외를 skill에 축약한 문구만으로 적용할 수 없게 한다.

### canonical 정책 출력 연결

- 두 SKILL.md: core
- 두 coordination.md: assignment
- 두 planning.md: planning
- 두 handoff.md: handoff
- 두 handoff-prep.md: preparation
- 두 verification.md: verification
- 두 commit.md: commit
- specialist profiles: 기존 전체 역할 필터 유지
- Claude Git policy JSON과 hook: 기존 출력 유지
- 전역 bootstrap: 전체 계약 renderer 호출 제거. 기존 진입 지시는 유지

모든 이동은 원문 의미를 보존한다. 불필요한 동의어 치환이나 정책 요약을 함께 수행하지 않는다.

### 실행 단계

- [ ] **기준 증거 준비:** Coder가 기준 HEAD의 문구와 크기를 읽어 fixture를 만든다. fixture는 해당 baseline에서 가져온 비생성 계약 문구와 목적지·대상 역할·필수 읽기 조건, 전역·skill 크기를 가진다. 변경 후 파일에서 기대 문구를 자동 추출하지 않는다.
- [ ] **RED:** instruction-layout.test.mjs와 기존 관련 tests에 다음 검사를 추가한다.
  - 양 플랫폼 bootstrap의 기존 trigger·후속 적용·언어·사용자 지정 경로 보존.
  - 전역 전체 정책 제거와 skill 크기 감소.
  - canonical rule별 담당 역할·출력 위치·행동 전 읽기 경로.
  - coordination·limits를 첫 specialist 생성 전에 읽는 조건.
  - 작은 작업·계획 생략·TDD 예외를 판단하기 전 전체 조건 로딩.
  - worktree·recovery·visual 조건부 경로 유지.
  - specialist profiles와 모델·도구·hook·runtime 보존.
  - 문서 또는 로딩 조건을 fixture에서 하나 제거했을 때 도달성 검사 실패.
- [ ] 새 구조 부재에 의한 RED를 확인한다.

```bash
node --test tests/node/instruction-layout.test.mjs tests/node/global-config.test.mjs
```

- [ ] 양 플랫폼의 skill·references를 위 표에 따라 재배치한다.
- [ ] 전역 bootstrap을 축약한다. 기존 trigger 구절과 후속 적용 문구는 보존하여 적용 범위의 해석 변경을 피한다.
- [ ] POLICY_TARGETS와 projection 연결을 적용하고 새 coordination 문서에 관리 마커를 둔다.
- [ ] 정책 산출물을 생성한다.

```bash
node scripts/update-role-policy.mjs
```

- [ ] tests/test_arc_policy.py의 기존 “반드시 core에 있어야 한다”는 검사를 해당 contract 목적지에 연결한다. 검사 문구·역할·순서 assertion을 유지하고, 광범위하게 모든 문서를 합친 문자열만 검색하여 잘못된 위치를 통과시키지 않는다.
- [ ] focused policy·layout GREEN을 확인한다.

```bash
node --test tests/node/role-policy.test.mjs tests/node/global-config.test.mjs tests/node/instruction-layout.test.mjs
python3 -m unittest discover -s tests -p test_arc_policy.py
npm run check:role-policy
```

- [ ] 설치 fixture에 두 플랫폼의 새 참조 존재·설치 링크·stale output 검출을 추가한다. 공백 포함 사용자 지정 home, 언어 치환, 기존 사용자 내용 보존, 반복 설치·--skip-global을 검사한다.
- [ ] manifest를 갱신하고 설치 관련 GREEN을 확인한다.

```bash
node scripts/update-manifest.mjs
node --test tests/node/plan.test.mjs tests/node/manifest.test.mjs tests/node/consumer.test.mjs
npm run check:manifest
```

- [ ] 기존 CLI·runtime 보존 관련 검사를 실행한다.

```bash
node --test tests/node/cli-dry-run.test.mjs tests/node/uninstall-cli.test.mjs tests/node/runtime-assets.test.mjs tests/node/runtime-config.test.mjs tests/node/runtime-gate.test.mjs tests/node/runtime-evaluate.test.mjs tests/node/runtime-schema.test.mjs tests/node/runtime-codex.test.mjs tests/node/runtime-claude.test.mjs
```

- [ ] 기준 HEAD와의 보존 diff, 양 플랫폼 전역·skill의 줄 수·바이트 수 전후 값을 기록한다. 링크와 정책 coverage 결과를 spec 수용 기준에 연결한다.
- [ ] Coder가 변경 파일·RED/GREEN·검사 결과·실제 검사 상태·한계를 보고한다.

### TDD와 예외 처리

전역 생성과 정책 renderer 연결의 동작 변경은 위 RED/GREEN을 따른다. 구조 검사에 관찰 가능한 출력·누락 검출을 포함하므로 실패 우선 검증이 가능하다.

원문 이동·Markdown 편집·생성 산출물 갱신은 비행동 문서·생성 작업이다. Orchestrator가 brief에 **문서 이동과 생성 결과에 한정한 구조 검사 예외**를 기록한다. 이 예외는 renderer·bootstrap의 동작 변경이나 필수 focused checks를 면제하지 않는다.

원문 의미에 대한 인간 검토가 필요한 부분은 정적 검사로 완전히 증명됐다고 주장하지 않는다.

### 수용 기준과 필수 증거

- spec의 수용 기준 1–10이 모두 증거 또는 명시된 한계와 연결된다.
- 양 플랫폼 전역과 skill이 baseline보다 각각 줄어든다.
- canonical 규칙 누락과 비생성 계약 누락이 없다.
- 로딩 판단의 순환이나 행동 이후 로딩이 없다.
- profiles·canonical 정책·runtime·모델·도구·hook이 보존된다.
- 새 coordination과 모든 기존 필수 참조가 payload·manifest에 포함된다.
- 생성 검사·구조 검사·설치 검사·관련 CLI/runtime 검사가 통과한다.
- 검사 위치 변경이 기존 계약 assertion의 삭제나 약화로 이어지지 않는다.

공통 역할·승인 계약과 설치 payload에 걸친 작업이므로 **fresh QA가 필수**다. QA는 위 focused checks를 독립적으로 실행하고, 양 플랫폼에서 도달 경로와 설치 결과를 확인한다. QA 임시 데이터는 기존 검사 fixture의 임시 디렉터리에 한정하고 검사 종료 시 정리한다.

QA 실패·미충족 기준은 Coder 수정 후 QA 재검사를 거친다. 원인이 해결됐다는 Coder 보고만으로 이전 실패를 종료하지 않는다.

### 중단 조건

- baseline 계약을 목적지와 로딩 조건으로 빠짐없이 연결할 수 없는 경우.
- 승인·권한·trigger·검증 의미 변경이 필요한 경우.
- actual model 로딩을 가정해야만 도달성을 설명할 수 있는 경우.
- profile·CLI·installer 메커니즘·runtime·hook 변경이 필요한 경우.
- baseline 또는 설치 payload에서 누락·충돌을 발견한 경우.
- 필수 native 검사 환경이나 기존 fixture 때문에 검증을 완료할 수 없는 경우.

필요한 범위 변경은 Orchestrator에게 반환한다. 검사 삭제·임의 의존성 설치·실제 사용자 전역 설정 변경으로 우회하지 않는다.

### 인수와 커밋

Orchestrator가 spec 기준, 모든 필수 QA·재검사, finding과 한계를 확인하여 T2를 인수한다. 인수 후 하나의 focused commit을 만든다.

권장 제목: refactor(instructions): 양 플랫폼 지침을 단계별 참조로 정리

Orchestrator는 commit에 양 플랫폼 지침·tests·생성 산출물·manifest가 함께 포함됐는지 확인하고 최종 SHA·HEAD·남은 변경을 기록한다.

---

## 최종 전체 검증과 완료

T1과 T2가 각각 필요한 검사·QA를 거쳐 인수·커밋된 뒤 수행한다. 이 절차는 이미 독립적으로 수용 가능한 T1의 인수를 지연시키지 않는다.

- [ ] Orchestrator가 최종 상태의 정책·manifest 검사와 필수 QA 증거의 유효성을 확인한다. 관련 변경으로 무효화된 검사만 다시 수행한다.
- [ ] 독립 Reviewer가 기준 HEAD부터 최종 HEAD까지 **최종 전체 변경을 한 번 리뷰**한다. canonical·비생성 계약 보존, trigger 의미, 로딩 순서, profile·hook·runtime 보존, 검사 약화 여부를 집중 검토한다.
- [ ] Reviewer는 QA 실행·파일 수정·Git 변경·인수를 수행하지 않는다.
- [ ] 최종 Reviewer finding은 Coder 수정 → Reviewer 재검사로 해결한다. 이 최종 plan 리뷰 correction 경로에는 QA를 재배정하지 않는다.
- [ ] 수정 이후 실제로 수행한 검사와 기존 QA 증거를 구분한다. 별도의 필수 의무·범위 확대·미해결 증거가 발견되면 해당 작업을 보류하고 Orchestrator가 처리한다.
- [ ] Orchestrator가 최종 리뷰 결과와 모든 필수 증거를 판단하여 전체 작업을 인수한다.
- [ ] 최종 보고에는 전역·skill의 감소량, 지침 배치, 검증 결과, 최종 SHA와 미검증 한계를 포함한다.
- [ ] push·merge·publish·실제 사용자 환경 설치는 별도 명시적 권한 없이 수행하지 않는다.

## 가정과 남은 결정

- 기존 검사에 필요한 native 환경과 Python 실행 환경이 준비돼 있다고 가정하지 않는다. Orchestrator가 handoff 전에 가용성을 확인하고 부재 시 범위와 해결 방법을 결정한다.
- 새 coordination 참조는 기존 skill payload 구조로 전달할 수 있다. 새 설치 메커니즘은 추가하지 않는다.
- spec·plan 문서 커밋은 Orchestrator의 준비 책임이며 T1·T2 구현 커밋과 구분한다.
- 지침 길이 목표는 임의의 토큰 수 대신 기준 HEAD 대비 실제 감소로 판단한다.
- 구현을 시작할 정책 의미상의 열린 결정은 없다. 예상하지 못한 의미 충돌은 중단 조건으로 처리한다.

---

자체 검토 결과:

- **spec coverage:** 전역·skill 축약, 조건부 references, 역할 계약, canonical 정책, 양 플랫폼 설치, 검증 한계를 T1·T2와 최종 리뷰에 연결했습니다.
- **작업 경계:** 독립 검증 가능한 renderer 기능을 T1로 분리하고, 서로 의존하는 양 플랫폼 지침·검사·payload 전환을 T2 하나로 묶었습니다.
- **인터페이스 일치:** T1의 출력 구분 이름과 T2의 대상 연결을 일치시켰습니다. 기존 기본 출력과 specialist 필터를 보존합니다.
- **Review Focus:** 다섯 위험 조건을 T2의 구체적인 검사와 인수 기준에 연결했습니다.
- **보존 위험:** 비생성 계약을 canonical rule coverage만으로 대신하지 않도록 baseline fixture와 문구별 목적지 검사를 포함했습니다.
- **실행 역할:** Coder 편집, fresh QA, Orchestrator 인수·커밋, 최종 단일 전체 Reviewer와 필요한 재검사 흐름을 구분했습니다.
- **검사 한계:** 실제 에이전트의 모든 판단·로딩 행동이 동일하다고 주장하지 않도록 했습니다.
- **현재 수행 범위:** 승인 spec과 필요한 소스·skill을 읽고 초안만 반환했습니다. 저장·구현·검사·Git 변경은 수행하지 않았습니다.
