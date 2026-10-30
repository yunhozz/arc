# Custom 프리셋 요구사항

**상태:** Orchestrator 검토용 첫 초안
**문서 경로:** /Users/ma-24-007/.codex/worktrees/tui-preset-preview/arc/docs/superpowers/specs/2026-10-29-custom-preset-catalog.md
**작업 경로:** /Users/ma-24-007/.codex/worktrees/tui-preset-preview/arc
**브랜치:** feat/tui-preset-preview
**준비 확인 HEAD:** d9f2490bdf77162d3a8ff5cbf62dc9b84ba0311a

## 문서의 근거와 목적

사용자는 기존 preset에 Custom을 추가하고, 각 역할에서 모델과 추론강도를 하나의 조합으로 선택하기를 요청했다. 선택 목록의 범위로 현재 연결된 계정·제공자를 정했으며, 첫 릴리스에서는 공식 API를 통해 목록과 capability를 조회할 수 있는 연결부터 지원하도록 승인했다.

이 문서는 이미 승인된 대화 설계와 구현 계획의 요구사항을 추출한 기록이다. 새로운 제품 결정을 추가하지 않는다. 작성된 이 문서 자체의 승인 여부는 기존 대화 설계·계획 승인과 구분하여 기록한다.

승인된 구현 계획:

- 경로: /Users/ma-24-007/.codex/worktrees/tui-preset-preview/arc/docs/superpowers/plans/2026-10-29-custom-preset-catalog.md
- 사용자 승인 당시 SHA-256: fc25e78c7d8b3b04cf50248caa2cc0e8249f29b6d406e9c2ef1867891004658d
- Markdown 공백 정리 후 현재 SHA-256: d68f97f8266adaf66c7a4ca3036e0c6465bfdb5fc44e24f24cdd93fd85825dd0

작업은 Bounded로 분류한다. 공유 설정 migration, provider 조회, TUI, 설치와 upgrade를 연결하므로 구현 위험은 Significant이며 승인 계획의 순차 구현·QA·최종 Reviewer 절차를 따른다.

## 사용자에게 제공할 동작

Install / Update와 Change Preset의 Performance preset 목록에 다음 순서로 항목을 표시한다.

Economy → Balanced → Smart → Custom → 기존 Back footer

Custom을 선택하면 다음 다섯 역할의 모델·추론강도 조합을 각각 선택할 수 있다.

- arc_scouter
- arc_planner
- arc_implementer
- arc_qa
- arc_reviewer

역할을 선택하면 같은 플랫폼에서 확인된 model + effort 조합 목록을 제공한다. 모델과 effort를 개별 자유 입력하거나, 확인되지 않은 조합을 만들어 선택하는 기능은 제공하지 않는다.

처음 Custom을 편집할 때에는 현재 선택된 built-in preset의 역할 설정을 초기값으로 복사한다. 저장된 Custom이 있으면 이후 편집에서 해당 설정을 복원한다. 초기값에 사용된 alias 등이 조회된 구체적인 모델 ID와 일치하지 않으면 자동 치환하지 않고 교체가 필요한 상태로 표시한다.

## 편집과 적용의 경계

preset 커서 이동은 미리보기만 변경한다. 역할별 선택은 임시 편집 상태에 저장하며, Done은 결과를 Settings draft에 반영한다. 실제 설정·profile 변경은 기존 Apply 경로에서 수행한다.

현재 catalog에 포함되지 않는 역할 값이 남아 있으면 Custom 편집을 확정하거나 새 Custom 변경을 적용하지 않는다. custom이 이미 활성인 상태에서 다시 편집한 경우에도 역할 매핑이 바뀌면 해당 변경을 저장한다.

다른 built-in preset을 선택해도 저장된 Custom 매핑을 보존한다. 기존 preset 미리보기, terminal escaping, 작은 화면에서의 선택 보호, Esc→Home, interrupt 복구를 유지한다.

## 모델·effort 목록의 범위

목표 목록은 현재 연결된 계정·제공자에서 공식 조회로 확인한 조합이다. 첫 릴리스는 ARC process의 다음 API credential 경로를 지원한다.

| 플랫폼 | 승인된 조회 계약 |
|---|---|
| Codex | 현재 OPENAI_API_KEY로 조회한 OpenAI GET /v1/models의 모델 ID와 Codex app-server model/list의 정확한 ID 교집합에 supportedReasoningEfforts를 결합 |
| Claude | 현재 ANTHROPIC_API_KEY로 조회한 Anthropic GET /v1/models의 모델별 capabilities.effort 중 현재 profile validator가 허용하는 값만 사용 |

Codex의 비슷한 이름, alias, prefix를 같은 모델로 간주하지 않는다. Claude effort는 승인 계획에 명시된 low, medium, high, xhigh, max와 확인된 capability의 교집합을 사용한다.

확인할 수 없는 capability나 표현할 수 없는 값은 후보에서 제외하고 선택할 수 없는 이유를 설명한다. 조회 가능한 범위를 넘어 목록의 완전성을 주장하지 않는다.

OAuth-only 연결과 third-party provider는 첫 릴리스의 지원 범위에서 제외한다. private CLI credential 파일 접근이나 새 로그인 흐름을 추가하지 않는다.

## 오류와 비밀값 처리

credential 누락, 지원하지 않는 연결, catalog 조회 실패, 네트워크 오류에서도 built-in preset을 사용할 수 있어야 한다. 확인된 catalog가 없으면 새로운 Custom 매핑을 준비하거나 적용하지 않는다.

credential, Authorization header, 비밀값이 포함될 수 있는 원본 HTTP body·process stderr·fetch cause를 화면, 결과 객체, 설정 파일이나 로그에 노출하지 않는다. 오류는 허용된 code와 고정된 설명으로 전달한다.

## 저장·호환성과 upgrade

설정은 version 2 내부 형식과 선택적인 Custom 역할 매핑을 지원한다. version 1 설정은 읽을 때 version 2로 정규화하며 읽기만으로 파일을 쓰지 않는다.

활성 여부와 관계없이 저장된 Custom 전체의 구조를 검증한다. preset = custom이면 다섯 역할의 유효한 Custom 매핑이 필요하다. catalog membership 검증은 Custom 편집 확정과 새 적용 준비에서 수행한다.

parse·status·upgrade는 저장된 설정의 구조를 네트워크 없이 검증한다. 따라서 credential과 네트워크가 없는 upgrade에서도 활성·비활성 Custom을 보존한다.

기존 built-in preset의 실제 모델·effort 설정, profile의 비모델 내용, installer transaction·snapshot·rollback 경계를 보존한다.

## 수용 기준과 검증 보류 조건

| ID | 수용 기준 |
|---|---|
| C1 | 두 진입점에서 Custom이 지정된 순서로 표시되고 기존 세 preset 동작이 유지된다. |
| C2 | 각 역할에서 같은 플랫폼의 확인된 모델·effort 쌍만 선택할 수 있다. 확인되지 않은 ID·capability를 추측하지 않는다. |
| C3 | 최초 초기화와 저장된 Custom 복원이 동작하고, built-in 선택 후에도 Custom이 보존된다. |
| C4 | 커서·역할 편집·Done·Apply의 경계가 유지되며, 같은 Custom의 역할 변경도 저장된다. |
| C5 | catalog 실패 시 built-in을 사용할 수 있고, 오류·화면·설정에 비밀값이 노출되지 않는다. |
| C6 | version 1 호환, version 2 Custom 검증·직렬화, 두 플랫폼 runtime reader와 offline upgrade 보존이 동작한다. |
| C7 | 기존 terminal 보호와 설치 transaction·rollback 동작이 유지된다. |

검증은 승인 계획 T1–T3의 Node·Python·TUI·PTY·installer·upgrade·manifest 검사와 연결한다. 각 task는 필요한 fresh QA 후 Orchestrator가 수용하며, 모든 task 수용과 필수 검증 뒤 독립 Reviewer가 전체 변경을 검토한다.

다음 기술 확인은 승인 계획의 보류 조건을 그대로 따른다.

- Codex app-server initialization, model/list, pagination과 effort metadata의 정확한 wire shape
- app-server 조회가 현재 API credential 범위를 사용하며 OAuth나 private credential 파일로 전환되지 않는지 여부
- Anthropic 모델별 effort capability, pagination과 필수 API header의 정확한 계약
- 현재 toolchain·dependencies·검사 prerequisite와 baseline 결과

해결되지 않은 adapter 계약을 추측한 fixture나 다른 인증 경로로 대체하지 않는다. 해당 경로의 구현·수용과 의존 task를 보류하고 Orchestrator가 해결한다.

---

**첫 초안에 대한 자체 검토:** 위 요구사항은 사용자 승인 대화와 승인 plan의 Global Constraints·Review Focus·기술 gate·수용 기준에 대응한다. 새 모델 목록, 인증 방법, 화면 배치나 제품 결정을 추가하지 않았다. 실제 API wire 계약과 baseline 실패는 미해결 기술 증거로 남겼으며, 이 문서 작성으로 해소됐다고 주장하지 않는다. 이 문서 자체는 사용자 승인 대기 중이다.
