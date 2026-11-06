# ARC Implementer 대화 재사용과 교체 사유 기록 계획

| 항목 | 내용 |
|---|---|
| 버전 / 상태 | v1.0 / 사용자 승인 |
| 승인 일시 | 2026-11-07 |
| 깊이 | Bounded, 계획 1개 필요, 별도 명세 불필요 |
| 저장소 | `/Users/yunho/Desktop/project/arc` |
| 실행 대상 | 현재 checkout 유지 |
| 기준 branch / HEAD | `chore/arc-planner-efficiency` / `1be6965a82948d8e2fa8979d7867ccb97f1c889a` |
| 기준 변경 상태 | 깨끗함 |
| 사용자 승인 범위 | 같은 T2 작업에서 Implementer가 반복 새로 호출된 문제만 해결하고 근본 원인을 조사 |

## 승인 근거

사용자는 이 계획 초안을 확인한 뒤 2026-11-07에 `승인`이라고 명시적으로 응답했다. 승인은 같은 T2 작업의 Implementer 대화 재사용 절차와 교체 사유 기록만 포함하며, 계획의 제외 범위는 그대로 유지한다.

## 목표와 원인

T2 한 작업에서 Implementer 대화가 여섯 개 생겼다. 초반에는 불완전한 구현이나 실제 공개 실행 경로를 검증하지 못한 결과를 고치는 중에 기존 담당자 대화로 후속 작업을 보내지 않고 새 Implementer를 부른 경우가 있었다. 그 결과 작업 맥락을 새로 전달하고, 이미 확인한 조건을 다시 확인하는 일이 반복됐다. 후반의 교체는 승인된 계획 범위 변경과 실행 한도 소진이 근거가 되어 필요했다.

현재 `lib/policy/role-policy.json`에도 같은 작업의 수정은 현재 Implementer에게 맡기라는 규칙이 있다. 빠진 부분은 작업별 현재 담당자를 기록하고, 새 대화를 열기 전에 교체 사유와 근거를 확인하는 구체적인 순서다. 실행 훅이 실제 협업 도구 호출을 항상 관찰하거나 차단하지 않으므로, 이번 변경은 Orchestrator가 따를 절차와 기록을 명확하게 한다. 자동 호출 차단을 구현했다고 주장하지 않는다.

## 범위

- 같은 계획 작업의 수정·재작업·재확인은 기존 Implementer 대화로 이어간다.
- 새 Implementer가 필요한 경우 기존 맥락을 더 쓸 수 없는 상태 또는 승인된 계획·수락 기준 변경만 교체 사유로 인정한다.
- 교체 전에 이전 대화, 상태, 사유와 근거를 기록하고, 새 호출이 성공한 뒤 반환된 식별자로 현재 담당자 기록을 갱신한다.
- 한 작업을 파일 묶음이나 구현 단계로 나눴다는 이유로 새로운 담당자를 만들지 않는다.
- 새 계획 작업에는 새 Implementer를 배정하는 기존 경계를 유지한다.

## 제외

- 첫 번째 문제였던 실패한 target intent 복구.
- 테스트 기준선 문제와 그 밖의 런타임 또는 target transition 동작.
- 테스트 추가 및 테스트 실행.
- 다른 역할 프로필, 설치 manifest, 별도 상태 저장소 또는 협업 도구의 자동 차단 기능.
- push, merge, 배포, 게시.

## TASK-01 — 같은 작업의 Implementer 연속성 절차 보강

**목표:** 기존 재사용 규칙을 실제 배정·후속 요청·교체 판단에 적용할 수 있도록 정책, 운영 절차, 생성물을 함께 정렬한다.

**선행 조건:** 이 계획 승인, 현재 checkout의 branch/HEAD와 변경 상태 재확인, 기존 인계 기록과 파일 소유권 확인. 이 task에는 Implementer를 한 번 새로 배정하고, 같은 task의 수정은 그 대화에서 계속한다.

### 변경 파일

| 구분 | 경로 |
|---|---|
| 정책 원본 | `lib/policy/role-policy.json` |
| 운영 절차 | `codex/skill/references/coordination.md` |
| 운영 절차 | `claude/skill/references/coordination.md` |
| 인계 기록 절차 | `codex/skill/references/handoff.md` |
| 인계 기록 절차 | `claude/skill/references/handoff.md` |
| 정책 관리 출력 | `codex/skill/SKILL.md` |
| 정책 관리 출력 | `claude/skill/SKILL.md` |
| 정책 복사본 | `codex/skill/runtime/role-policy.json` |
| 정책 복사본 | `claude/skill/runtime/role-policy.json` |
| 기존 고정 해시 자료 | `tests/node/fixtures/instruction-contracts.json` |

`lib/policy/placement.mjs`의 현재 투영에서 `role.orchestrator-boundary`는 `core`에 포함된다. 따라서 관리 문구는 Codex와 Claude의 `skill/SKILL.md`에 반영한다. `coordination.md`와 `handoff.md`는 사람이 읽는 절차 본문을 수정한다. runtime 복사본은 `scripts/update-runtime-assets.mjs`로 원본과 맞춘다. `instruction-layout.test.mjs`가 정책 원본과 두 runtime 복사본의 고정 해시를 확인하므로 기존 해시 자료를 변경된 바이트에 맞게 갱신한다.

### 작업 순서

1. `role.orchestrator-boundary`에 작업별 현재 Implementer 대화와 상태 기록, 같은 대화에 후속 작업 전달, 교체 전 사유·근거 확인을 명시한다.
2. 양쪽 `coordination.md`에 현재 task와 담당자 확인 → 같은 대화 재사용 판단 → 교체 사유 및 근거 확인 → 기록 후 새 호출 순서를 넣는다. 응답이 끝났거나 대기 중이라는 사실만으로 기존 대화를 버리지 않는다.
3. 부분 구현, 실패 응답, 누락된 인계, 단계 분할, QA 또는 Reviewer 발견만으로 새 Implementer를 만들지 않는다고 명시한다. Orchestrator가 필요한 내용을 모아 기존 담당자에게 전달한다.
4. 양쪽 `handoff.md`의 기존 단일 인계 기록에 task ID, 현재 대화 식별자, 상태, 마지막 결과, 재사용·교체 판단과 교체 근거를 추가한다. 교체할 때는 이전 식별자와 근거를 먼저 기록하고, 새 식별자는 호출 성공 후 기록한다. 호출 결과가 불분명하면 확인 전 새 배정을 보류한다.
5. `node scripts/update-role-policy.mjs` 및 `node scripts/update-runtime-assets.mjs`를 필요한 관리 출력 동기화에 사용한다. 기존 고정 해시 자료에는 변경된 정책 원본 및 runtime 복사본의 새 해시만 반영한다.
6. 실제 변경 파일을 위 목록과 대조하고, 예상 밖 생성물 또는 관련 없는 변경을 확인하면 진행 전에 Orchestrator에게 알린다.

### 완료 기준과 증거

| 기준 | 필요한 증거 |
|---|---|
| 같은 task의 수정이 현재 대화로 이어짐 | 정책과 양쪽 운영 절차의 해당 문구 및 변경 diff |
| 교체 사유와 근거를 먼저 기록함 | 허용 사유, 기록 항목, 근거가 없을 때 보류하는 문구 |
| 부분 결과와 단계 분할이 새 배정 사유가 되지 않음 | 금지 조건과 기존 담당자에게 후속 작업을 보내는 절차 |
| 담당자 기록의 시점이 맞음 | 호출 전 이전 식별자·사유 기록과 성공 후 새 식별자 갱신 절차 |
| Codex와 Claude 절차의 뜻이 일치함 | 양쪽 절차 본문과 생성된 정책 문구의 정적 대조 |
| 정책 원본, 복사본, 기존 고정 해시가 맞음 | 변경 diff와 바이트 또는 SHA256 대조 |
| 자동 차단 한계를 정확히 표현함 | 실제 협업 도구 호출의 자동 차단을 주장하지 않는 문구 |

QA는 위 기준을 대상으로 문서와 정책 생성물의 정적 대조를 수행하고 각 기준을 `proven`, `unmet`, `unverified`로 보고한다. 테스트 코드를 추가하거나 테스트를 실행하지 않는다. Orchestrator는 변경과 QA 근거를 검토해 수락한 뒤 이 task의 변경을 하나의 구현 commit으로 묶고, 최종 Reviewer 검토를 수행한다. 같은 task의 수정은 현재 Implementer와 Reviewer 대화에서 이어간다.

## 보류 조건

선택한 대상이나 파일 소유권이 달라지거나, 필요한 인계 기록에 접근할 수 없거나, 예상하지 않은 파일 변경이 발견되면 영향받는 작업을 보류한다. 승인된 계획 또는 수락 기준을 실제로 바꿔야 한다면 해당 변경 승인을 받고 새 Implementer를 배정한다.

## 완료 보고

완료 보고에는 T2의 여섯 대화를 확인한 근거, 피할 수 있었던 교체와 정당한 교체를 구분한 이유, 바뀐 절차와 정적 대조 결과를 담는다. 테스트는 실행하지 않았으며 실제 협업 도구 호출을 자동으로 막는지는 검증하지 않았다고 밝힌다.

## 자체 검토

이 계획은 사용자 요청대로 두 번째 문제만 다루고, target intent 복구와 테스트 기준선 문제는 제외했다. 현재 정책에 이미 있는 재사용 원칙을 새 제품 결정 없이 구체적인 호출 순서와 기록 요건으로 만든다. 호출 전 교체 사유를 기록하고 호출 후 새 식별자를 갱신하는 시점을 분리했으며, 플랫폼이 자동 차단한다고 주장하지 않는다. 테스트 실행과 변경 파일 구현은 하지 않았다.
