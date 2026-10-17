# Orchestrator handoff의 조건부 readiness 연결 후속 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 실행 지시는 ARC adapter에 따른 Orchestrator 배정으로 적용한다. 하나의 후속 task에 fresh Coder를 배정하며, 작업별 Reviewer gate를 추가하지 않는다.

**목표:** 승인 계획의 dependency/readiness record 연결을 해당 계획이 존재할 때만 요구하여, 유효한 계획 생략 경로를 보존한다.

**구조:** Codex·Claude의 같은 handoff 문단을 함께 수정하고 배포 manifest를 갱신한다. 기존 readiness 확인과 승인·실행 대상·소유권 gate를 유지한다.

**기술:** Markdown 정책 지침, SHA-256 배포 manifest.

**설계 근거:** 승인된 Orchestrator 병렬 배정 설계와 최종 Reviewer의 P2 finding. 이번 초안은 해당 finding을 해결하기 위한 별도 후속 변경이며, Orchestrator 통합과 사용자 승인 전에는 실행하지 않는다.

**예정 저장 경로:** `/Users/yunho/Desktop/project/arc/docs/superpowers/plans/2026-10-17-orchestrator-handoff-readiness-guard.md`

## 계획 깊이와 명세 판단

**Bounded 후속 변경으로 새 written plan이 필요하다.** 수정량은 작지만 두 runtime이 공유하는 실행 준비 계약이며, 두 payload와 manifest를 함께 수락해야 한다. 단일 로컬 변경의 계획 생략 조건으로 취급하지 않는다.

**별도 written spec은 제안하지 않는다.** 기존 승인 설계의 “계획 생략 경로에 새 의무를 추가하지 않는다”는 조건을 복원하는 수정이다. 새로운 역할·실행 구조·승인 정책을 설계하지 않는다. Orchestrator가 이 판단과 후속 범위를 기록하고 본 계획 승인을 받아야 한다.

## 원인과 수정 범위

현재 다음 위치는 모든 Coder first start/restart 전에 승인 계획의 dependency/readiness record 연결을 요구한다.

- `/Users/yunho/Desktop/project/arc/codex/skill/references/handoff.md:73`
- `/Users/yunho/Desktop/project/arc/claude/skill/references/handoff.md:15`

그러나 기존 planning 계약은 조건을 충족한 Bounded plan-skip과 적용되지 않는 비행동 문서·설정의 계획 생략을 허용한다. 승인 계획의 존재 여부를 구분하지 않은 연결 의무가 이 경로와 충돌한다.

수정은 **map 연결 의무의 적용 조건**에 한정한다. 계획이 없다는 이유만으로 생략을 허용하지 않고 기존 생략 자격과 기록된 사유를 요구한다.

## 공통 제약

- 작업공간: `/Users/yunho/Desktop/project/arc`.
- 원래 계획과 수락된 작업 커밋은 변경하지 않는다.
  - `f81c630`: 원래 계획 문서.
  - `ac328e8`: 역할 이름 전환.
  - `5bbe1cf`: 병렬 배정 계약 추가.
- 실행 전 Orchestrator가 위 커밋과 실제 branch·HEAD·소유권 상태를 확인한다.
- runtime 코드·테스트·설치기·역사 문서·현재 사용자 설치를 변경하지 않는다.
- 테스트·assertion을 추가하거나 테스트 명령을 실행하지 않는다.
- 필수 artifact인 `MANIFEST.sha256` 재생성은 허용한다.
- 승인·실행 대상 선택·Git 상태·소유권·문서 준비·선행 task 수락·커밋·충돌·capacity gate를 유지한다.
- 이 후속 작업은 하나의 별도 focused commit으로 수락한다. 기존 커밋을 amend/reset하지 않는다.

## 확인 중점

| 조건 | 기대 정책 |
|---|---|
| 승인 계획이 존재함 | 현재 dependency/readiness record 연결 필수 |
| 승인 계획이 있지만 record가 없음 | 연결 의무를 우회하지 않고 보류 |
| 유효한 Bounded plan-skip | 기록된 생략 사유를 사용하며 map 생성을 요구하지 않음 |
| 계획이 적용되지 않는 비행동 문서 흐름 | 기존 생략 사유와 공통 handoff gate 유지 |
| 계획이 필요한데 아직 승인되지 않음 | 계획 생략으로 취급하지 않고 기존 승인 gate에서 보류 |

이 표는 정적 정책 대조에 사용한다. 실제 Coder 실행이나 자동 테스트를 수행하지 않는다.

## TASK-F01: 승인 계획 존재 여부에 따라 map 연결 의무 제한

**구현 목표·범위:** 두 runtime의 `Task readiness at every assignment` 문단에 동일한 조건을 추가하고, 유효한 계획 생략 경로와 모든 기존 gate를 보존한다.

**정확한 대상 파일:**

- `/Users/yunho/Desktop/project/arc/codex/skill/references/handoff.md`
- `/Users/yunho/Desktop/project/arc/claude/skill/references/handoff.md`
- `/Users/yunho/Desktop/project/arc/MANIFEST.sha256`

**선행 작업과 의존성:**

- 원래 작업의 수락·커밋과 P2 finding을 후속 brief에 연결한다.
- Orchestrator가 후속 범위·계획 승인과 적용되는 handoff gate를 완료한다.
- 두 runtime은 같은 계약이므로 하나의 task로 구현·확인·수락한다. 서로 다른 Coder에게 나누지 않는다.

**입력:** 기존 승인 설계, P2 finding, 현재 handoff·planning의 생략 계약.

**산출:** 계획이 존재하면 map 연결을 요구하고, 유효한 계획 생략 시에는 기록된 생략 근거를 사용하면서 공통 gate를 유지하는 양 runtime 지침.

### 수정할 정책의 의미

두 문단의 도입부를 다음 계약으로 맞춘다.

> 각 first start/restart 전에, 승인된 계획이 존재하면 그 계획의 현재 dependency/readiness record를 canonical record와 brief에 연결한다. 기존 규칙상 계획 생략이 유효한 경로에서는 map 연결 의무 때문에 계획이나 map을 새로 만들지 않는다. 대신 적용되는 생략 판단과 사유를 canonical record와 brief에 기록한다. 문서 생략은 아래 readiness 확인이나 다른 승인·실행 대상·소유권·handoff gate를 면제하지 않는다.

이후 기존 `Verify all applicable document approvals...`부터 이어지는 확인 의무는 조건부 절 안에 넣지 않는다. 승인 계획이 없더라도 적용되는 확인은 계속 요구되도록 문단 경계를 명확히 한다.

### 단계

- [ ] Codex handoff의 map 연결 문장을 승인 계획이 존재하는 경우로 한정한다.
- [ ] 유효한 계획 생략 경로와 기록된 생략 사유를 보존하는 문장을 추가한다. “계획 부재” 자체를 생략 자격으로 정의하지 않는다.
- [ ] Claude handoff의 대응 문단에 같은 계약을 적용한다.
- [ ] 나머지 readiness·승인·실행 대상·소유권·선행 작업·capacity 조건이 조건부 절 밖에 남아 있는지 diff로 확인한다.
- [ ] 작업공간에서 `node scripts/update-manifest.mjs`를 실행해 필수 manifest를 갱신한다.
- [ ] 아래 정적 증거를 fresh QA에 전달한다. QA는 수정이나 테스트 실행 없이 확인한다.
- [ ] Orchestrator가 증거·finding·수락 기준을 연결하여 TASK-F01을 수락한다.
- [ ] 해당 task만 새 focused commit으로 만들고 SHA·경로·결과 상태를 기록한다.

### 수락 기준

1. 두 runtime 모두 승인 계획이 존재할 때 map 연결을 요구한다.
2. 유효한 Bounded plan-skip과 비행동 문서 흐름에 새 계획·map 생성 의무가 생기지 않는다.
3. 생략 판단과 사유는 canonical record와 brief에 남아야 한다.
4. 승인 계획의 누락된 map이나 미승인 계획을 생략 경로로 우회할 수 없다.
5. 기존 readiness·승인·실행 대상·소유권·공통 handoff gate를 보존한다.
6. 두 runtime의 정책 의미가 일치한다.
7. 구현 변경은 지정한 세 파일에 한정되고 manifest가 해당 payload를 반영한다.
8. 테스트 추가·실행, 원래 계획 수정, 기존 커밋 재작성, 외부 설치 변경이 없다.

### 수락 전 필요한 QA와 증거

fresh QA의 범위는 다음 정적 확인이다.

- 두 handoff 문단의 전후 diff와 대응 위치.
- 위 다섯 조건에 대한 문구 대조 결과와 근거 문단.
- 조건부 적용 범위가 map 연결 의무에 한정된다는 확인.
- 나머지 기존 gate 문구가 삭제·완화되지 않았다는 diff 증거.
- manifest 생성 결과와 diff. digest 변경 경로가 두 handoff 파일에 대응하고 무관한 경로 변경이 없는지 확인.
- `git diff --check` 결과.
- 지정 세 파일의 구현 범위와 원래 계획·역사 기록·테스트 파일의 변경 부재.

테스트 통과나 실제 실행 성공을 수락 근거로 기재하지 않는다.

### 보류 조건

다음 중 하나라도 발생하면 영향 작업을 중단하고 Orchestrator에 보고한다.

- 계획 부재만으로 생략을 허용하는 문구.
- 기존 gate까지 조건부로 바뀌거나 면제되는 문구.
- 양 runtime의 의미 불일치.
- 세 파일 밖 구현 변경 또는 추가 범위 필요.
- 설명되지 않는 manifest 변경.
- 정적 QA finding·증거 부족 미해결.
- Git 상태·편집 소유권·선행 커밋 유효성 불명확.

## 최종 finding 재확인

**시점:** TASK-F01이 정적 QA와 Orchestrator 수락을 마치고 별도 focused commit으로 기록된 뒤.

Orchestrator는 최종 Reviewer에게 원래 P2 finding, 수정 커밋 SHA, 두 문단의 변경과 정적 QA 증거를 전달한다. **재확인 범위는 영향받은 finding과 그 수정이 기존 gate를 약화하지 않았는지로 제한한다.** 테스트 실행이나 무관한 전체 재검토를 추가하지 않는다.

Reviewer 결과가 해결이면 Orchestrator가 원래 finding의 종료와 최종 완료를 판단한다. 미해결이면 해당 내용을 기록하고 승인된 범위 안의 수정 또는 필요한 후속 승인을 처리한다. task 수락과 최종 finding 종료는 별도 상태로 기록한다.

## 자체 점검

- 원인을 양 runtime의 무조건적인 map 연결 의무로 한정했다.
- 승인 계획 있음·유효한 생략·부당한 생략을 구분했다.
- 한 공유 계약의 두 payload와 manifest를 하나의 top-level task에 묶었다.
- task의 ID·목표·파일·선행 조건·수락 기준·정적 QA·증거·보류 조건을 포함했다.
- 새 written plan의 필요성과 별도 spec을 제안하지 않는 이유를 구분했다.
- 작업 수락 전 QA와 수락·커밋 뒤 영향 finding Reviewer 재확인을 분리했다.
- 원래 승인 계획·커밋을 보존하고 새 테스트·실행 지시를 포함하지 않았다.
- 파일 편집·저장·구현·테스트 실행은 수행하지 않았다.
