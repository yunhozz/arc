# Spec·Plan 검토 후 수정 소유권 변경

- 상태: 사용자 승인 v2 (2026-10-28)
- 대상: `/Users/ma-24-007/.codex/worktrees/tui-preset-preview/arc`
- 브랜치: `feat/tui-preset-preview`
- 기준 HEAD: `09886a81198a21056a3ffd2a0c3a40db0101bd78`
- 승인: spec v2 및 구현 plan 작성·구현 진행에 대한 사용자 승인 완료
- 저장 경로: `docs/superpowers/specs/2026-10-28-orchestrator-spec-plan-revision-ownership.md`

## 목적

Planner가 spec과 plan의 최초 초안을 작성하고, Orchestrator가 검토한 뒤 필요한 수정도 직접 문서에 반영하도록 한다. 현재의 “Orchestrator 검토 → 수정 사항을 Planner에 전달 → Planner가 수정 초안을 반환” 절차는 같은 문서의 통상적인 수정 경로에서 없앤다.

변경 범위는 spec·plan의 최초 초안 이후 수정 소유권이다. Design·brainstorming의 작성 경로, 구현·설정·테스트 파일의 Implementer 소유권, Reviewer의 읽기 전용 경계, 사용자 승인 및 Git 경계는 유지한다.

## 역할과 문서 흐름

| 시점 | Planner | Orchestrator |
|---|---|---|
| 최초 작성 | 준비된 입력과 승인된 요구사항에 따라 spec 또는 plan의 완전한 초안 내용과 자체 검토 결과를 응답으로 작성한다. | 대상, 문서 경로, 준비 자료를 제공하고 Planner의 초안 내용을 해당 문서로 저장한다. |
| 검토 | 최초 초안에 대한 자체 검토를 마친다. | 기존 검토 기준으로 문서 전체와 승인 경계를 확인한다. |
| 수정 필요 | 같은 문서의 수정본을 작성하거나 수정 권한을 넘겨받지 않는다. | 저장된 문서를 직접 수정하고, 수정 근거와 영향을 자체 검토한다. 수정 지시를 Planner에게 돌려보내는 단계를 두지 않는다. |
| 승인 준비 | 승인이나 최종 수용을 결정하지 않는다. | 수정된 최종 문서를 사용자에게 제시하고 해당 승인 단계를 진행한다. |

Orchestrator의 직접 수정에는 문장·구조 개선과 현재 사용자 승인 범위 안의 누락 보완이 포함된다. 실질적인 변경이 사용자가 승인한 목표·범위를 넘어 새로운 제품 결정을 요구하면, Orchestrator는 임의로 결정하지 않고 사용자에게 결정 사항을 묻는다. 답변을 받은 뒤에도 문서 수정은 Orchestrator가 직접 수행한다.

사실 확인이나 대안 분석을 위해 Planner 의견을 구할 수 있지만, 이를 동일 문서의 수정 초안 작성이나 검토 수정 루프로 사용하지 않는다. 최초의 완전한 Planner 초안이 없거나 Planner 호출이 실패했다면 초기 작성 책임은 Orchestrator로 이전되지 않는다. 입력·대상·Planner 문맥 문제를 해결해 최초 초안을 확보한다.

Planner의 품질 책임은 최초 초안과 자체 검토에 남는다. Orchestrator 수정본을 Planner가 승인하거나 반복 검토하는 단계를 추가하지 않는다. 별도 brainstorming 및 design 초안의 작성·수정 규칙은 이 변경 범위에 포함하지 않는다.

## 승인과 범위 변경

Spec과 plan은 각각 최초 초안과 Orchestrator 검토 단계를 가진다. 필요한 spec의 최종 승인을 받은 뒤 그 버전을 입력으로 plan을 작성하고, plan의 최종 승인을 받은 뒤 구현을 시작한다.

승인된 문서의 목표·범위·수용 기준·방법·위험·의존성·필수 검증이 바뀌면 기존 재승인 규칙을 적용한다. 문서의 초안 작성은 Planner, 승인 이후를 포함한 수정은 Orchestrator가 담당한다. 새로운 spec·plan 문서가 필요한 작업에서는 새 문서의 최초 초안을 Planner가 작성한다.

이 변경은 과거 완료 문서를 일괄 수정하거나 기존 승인 기록을 소급 변경하는 근거가 되지 않는다.

## 계약 반영 범위

동일한 규칙이 Codex와 Claude의 설치 지침, 역할 프로필, 계획 참조 및 global bootstrap에 도달해야 한다.

- `lib/policy/role-policy.json`에서 Orchestrator 경계, Planner 초안 경계, planning brief의 초안·수정 소유권을 분리해 표현한다.
- 양쪽 `SKILL.md`, `references/planning.md`, `references/coordination.md`, Planner 프로필의 수동 지침에서 spec·plan의 후속 수정 소유권과 상충하는 “Orchestrator never authors”, “수정 사항을 Planner에게 반환”, “한 번의 수정 회차” 규칙을 조정한다. Design·brainstorming 규칙은 보존한다.
- `lib/installer/global-config.mjs` bootstrap 문구도 같은 소유권 경계를 사용한다.
- 관리되는 정책 블록은 `scripts/update-role-policy.mjs`로 갱신하고, 양쪽 runtime 정책 사본은 `scripts/update-runtime-assets.mjs`의 생성 경로로 맞춘다.
- `tests/node/fixtures/instruction-contracts.json`의 관련 계약 문구와 변경된 보호 SHA, `MANIFEST.sha256`을 최종 바이트에 맞춘다.
- `tests/node/global-config.test.mjs`와 `tests/node/role-policy.test.mjs`에 새 수정 소유권 계약 검증을 반영한다.

사용자 홈의 이미 설치된 지침은 이 소스 변경 범위에 포함하지 않는다. 갱신된 bootstrap과 프로필은 기존 Install / Update 경로로 배포한다.

## 수용 기준과 검증

1. Spec과 plan 각각에서 “Planner 최초 초안 → Orchestrator 검토 → 필요 시 Orchestrator 직접 수정 → 사용자 승인” 흐름을 읽을 수 있다.
2. 같은 문서의 수정이 필요할 때 Planner에게 수정 초안을 다시 요구하는 의무가 남아 있지 않는다.
3. 새로운 제품 결정이 승인 범위를 넘어가면 Orchestrator가 사용자 결정을 받고, 문서 수정은 직접 수행한다.
4. 최초 Planner 초안 부재·실패가 Orchestrator의 최초 작성 권한으로 해석되지 않는다.
5. Planner의 응답 전용 경계와 최초 자체 검토, Reviewer의 읽기 전용 경계, 기존 사용자 승인 순서가 유지된다.
6. Codex·Claude bootstrap, 역할 프로필, planning·coordination 참조, canonical 정책이 서로 일치한다.
7. 생성된 정책·runtime 사본·보호 SHA·manifest가 원본과 일치한다.

필수 자동 검증은 `tests/node/role-policy.test.mjs`, `tests/node/instruction-layout.test.mjs`, `tests/node/global-config.test.mjs`, `tests/node/runtime-assets.test.mjs`, `tests/node/runtime-versions.test.mjs`와 정책 생성·manifest 검사다. 전체 테스트로 변경 후 회귀를 확인한다. 기대값 갱신은 이 소유권 변경으로 바뀐 계약과 바이트에 한정한다.

독립 QA는 “실질 누락이 있는 spec”, “수정이 필요한 plan”, “최초 초안이 없는 경우”를 양 플랫폼 지침에 대입해 담당 역할과 승인 경계가 일관되는지 확인한다. 이 검증은 지침 계약을 확인하며 prompt 수준의 역할 정책을 파일시스템 강제 통제로 확대하지 않는다.

## Orchestrator 검토 메모

Planner 초안의 승인 범위 경계를 보완했다. 검토 중 새 제품 결정이 필요한 경우 사용자의 결정을 먼저 받도록 했으며, 그 뒤 문서 수정 책임은 계속 Orchestrator에게 둔다. 또한 정확한 coordination 참조와 global bootstrap을 변경 범위에 포함하고, brainstorming/design 작성 규칙과 Reviewer의 읽기 전용 경계를 명시적으로 보존했다.
