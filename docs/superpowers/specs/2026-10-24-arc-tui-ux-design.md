# ARC TUI 탐색·검토 UX 개선 설계

## 목적과 범위

ARC 홈의 식별성을 높이고 설정·관리 흐름을 단순화한다. 표시되는 모든 조작은 실제로 동작해야 하며, 적용 전 검토와 기존 설치 안전성을 보존한다.

사용자는 **Configure로 설정 작업 통합**, **채움형 픽셀 ARC 워드마크와 초록 그라데이션**, **수동 Workflow 메뉴 제거와 기존 자동 runtime 유지**를 선택했다.

| 기준 | 내용 |
|---|---|
| 저장소 | `/Users/yunho/Desktop/project/arc` |
| 준비된 대상 | `feat/arc-tui-ux`, HEAD `10cfcbe97cd321ead4bd9a25f5863177b03e104b` |
| 현재 변경 | 이전 설계 초안이 `docs/superpowers/specs/2026-10-24-arc-tui-ux-design.md`에 untracked 상태로 존재하며, 이번 수정 후 사용자 재승인이 필요하다 |
| 인계 기록 | `/Users/yunho/Desktop/project/arc/.git/arc/handoff/arc-tui-ux.md` |
| 문서 경로 | `/Users/yunho/Desktop/project/arc/docs/superpowers/specs/2026-10-24-arc-tui-ux-design.md` |
| 범위 | TUI 표시·탐색, 관련 집중 테스트, 실제 메뉴·Workflow 접근 설명에 맞춘 `README.md` 수정. 정확한 파일 소유권은 후속 계획에서 지정 |
| 제외 | 관리 서비스 계약, runtime 정책, 공개 CLI 문법, 네트워크 동작, 설치 payload, 의존성 추가, terminal 키 의미 변경 |

TUI 언어는 영어로 유지한다. 기존 자동 Workflow runtime과 설치된 연동은 변경하지 않는다. 수동 Workflow 관리 화면은 모든 표시 메뉴에서 제외하며, 새 공개 명령이나 숨겨진 단축키를 추가하지 않는다. 기존 수동 화면의 소스 삭제는 필수 작업이 아니다.

README는 변경된 홈 메뉴를 설명하고, Workflow에 대해서는 기존 자동 runtime·연동이 유지되며 수동 메뉴·명령·단축키를 제공하지 않는다고 명확히 안내한다.

검토한 대안은 기존 메뉴 정돈, Configure 통합, 대상 우선 탐색이다. 사용자는 홈을 단순하게 만드는 Configure 통합을 선택했다. Preset 진입에 한 단계가 추가되지만 설정 진입점이 명확해진다.

## 홈과 작업 흐름

홈은 31열 × 5행 채움형 ARC 워드마크, Codex·Claude의 설치 상태·진단과 다음 메뉴를 표시한다.

```text
Configure
Update
Uninstall
Exit
```

워드마크는 사용자 참고 이미지처럼 내부가 채워진 픽셀 형태의 ARC다. 글자당 9열, 글자 사이 2열로 구성해 기존보다 가로폭을 넓히고 세로 높이를 줄여 터미널 셀 비율에 맞춘다. 모든 `█` 셀에 왼쪽에서 오른쪽으로 `#B7E4C7` → `#74C69D` → `#40916C` 초록 RGB 그라데이션을 적용하고 공백은 색칠하지 않는다. truecolor 미지원 시 단색 초록, 색상 비활성화 시 기본 전경색으로 읽을 수 있어야 한다. 하위 화면에서는 큰 로고를 반복하지 않는다. 메뉴·검토 제목은 `Update`, `Uninstall`로 통일하며 설명에서는 harness와 CLI 패키지를 정확히 구분한다.

| 진입점 | 진행 순서 | 복귀 |
|---|---|---|
| Configure | `Install / Reconfigure` 또는 `Change Preset` 선택 | Escape는 홈 |
| 설치·재설정 | 대상 → 설정 → 검토 → 적용 → 결과 | 검토 Escape/Edit는 설정. Cancel·결과 종료는 Configure |
| Preset | 대상 → Preset 설정 → 검토 → 적용 → 결과 | 설치와 같은 복귀 규칙 |
| Update | 준비 → 검토 → 적용 → 결과 | Escape/Cancel·일반 결과 종료는 홈. CLI 교체 시 보고 후 세션 종료 |
| Uninstall | 대상 → 전역 ARC 지침 처리 → 검토 → 적용 → 결과 | 검토 Escape/Edit는 전역 지침 선택, 이어서 대상까지 복귀 가능. Cancel·결과 종료는 홈 |

홈 Escape와 `Exit`는 정상 종료한다. 하위 단계에서는 Escape로 이전 단계에 돌아가고 같은 작업의 입력을 유지한다. 개별 값 입력 취소는 그 값의 변경을 확정하지 않는다. Details와 마지막 Apply 확인의 Escape는 검토로 돌아간다.

설치 옵션과 대상별 기존 설정, 두 대상 사이의 명시적 공통값 선택을 유지한다. Preset 변경은 다른 설정을 재설정하지 않는다. 한 대상의 오류 때문에 다른 대상이나 홈을 숨기지 않는다.

## 공통 footer

선택 가능한 모든 메뉴는 **하나의 공통 footer/component**를 사용한다.

```text
Up/Down: select | Enter: continue | Esc: back
```

홈에서는 `Esc: exit`로 바꾼다. 비메뉴 화면도 같은 footer 배치·구분 형식을 사용하며 실제 행동에 맞는 조작만 표시한다.

| 화면 | 안내 |
|---|---|
| 상세·결과 | `Up/Down: scroll | Enter: back | Esc: back` |
| 필수 상세 검토 | 중간 페이지는 `Enter: next`, 마지막은 `Enter: continue`; Escape는 검토 복귀 |
| 텍스트 입력 | `Type/paste: input | Left: delete | Enter: continue | Esc/Backspace: back` |
| 실행 중 | `Ctrl+C: interrupt` |

텍스트 입력의 Left·Backspace는 현행 의미를 유지한다. 페이지 위치는 footer 인접 정보로 표시하고 화면별로 키 안내를 따로 정의하지 않는다.

## 검토와 Details

검토는 작업·대상·주요 변경·보존 내용을 요약한다. 기본 선택은 `Cancel`이다.

| 행동 | 동작 |
|---|---|
| `Cancel` | 실행하지 않고 작업 진입 메뉴로 복귀 |
| `Edit` | 설치·Preset·Uninstall에만 표시. 현재 입력을 유지해 설정으로 복귀. Update에는 표시하지 않음 |
| `Apply` | 필수 상세 확인과 명시적 선택 후 검토한 snapshot 실행 |
| `Details` | 아래 구성의 전체 상세를 읽기 전용으로 표시한 뒤 같은 검토로 복귀 |
| `Validate (read only)` | 제거. 정적 설명을 검증 실행처럼 제공하지 않음 |

Edit 후 설정을 확정하면 다시 준비하고 새 snapshot을 검토한다. Details 이동은 snapshot을 다시 만들지 않는다.

**Details는 요약을 먼저 보여주고 전체 목록을 뒤에 배치한다.**

| 순서 | 내용과 사용자 표시 예 |
|---|---|
| 1. 작업·대상 | `Operation`, `Targets` |
| 2. 변경 규모 | 대상별 `Changes`, `Deletions`, `Preserved` 건수 |
| 3. 중요한 영향 | CLI 교체·세션 종료, 전역 지침 변경, 제거 범위, 설정 보존 등 해당 작업의 핵심 |
| 4. 전체 목록 | 대상·설치 경로별로 묶고 `Changes`, `Deletions`, `Preserved`, 필요한 `Notes`로 구분한 모든 항목 |

건수는 준비된 목록의 항목 수이며 영향받는 실제 파일 전체를 탐색한 수로 표현하지 않는다. 같은 항목이 내부 표현상 중복되면 중복 집계하지 않는다. 해당 정보가 없으면 임의의 0건이나 추정값을 표시하지 않고 알려진 범위를 명시한다. `managedPaths`, `globalChanges`, `skipGlobal` 같은 내부 필드 이름은 사용자 표시 제목으로 노출하지 않는다.

긴 경로와 설명은 줄바꿈·연속 행·페이지로 끝까지 읽을 수 있게 한다. 요약이나 중요 항목만으로 전체 상세를 대체하지 않는다. 필수 전체 상세를 읽는 절차와 마지막 명시적 Apply 확인을 유지한다.

기존 준비 단계의 검증과 실행 시 snapshot 재검증은 그대로 둔다. 새로운 validation API는 만들지 않는다. 준비 실패 시 Apply로 진행하지 않으며, 수행하지 않은 검증이나 외부 다운로드 성공을 보장하지 않는다.

## 안전성 불변 조건

- 명시적 Apply 전에는 변경 실행을 시작하지 않는다. 기본 확인은 Cancel이다.
- 검토한 snapshot을 실행하며, 대상 변경은 기존대로 거부·재검토한다. 조용히 다시 준비해 실행하지 않는다.
- 전체 변경 경로·전역 변경·삭제·보존 항목을 확인할 수 있어야 한다. 요약이 전체 상세 확인을 대체하지 않는다.
- 필수 정보·확인 선택지가 잘리면 적용을 차단하고 resize를 안내한다. 안전 정보 표시를 로고 장식보다 우선한다.
- Uninstall의 사용자 파일·다른 skill·workflow 감사 상태·native 설정·CLI npm 패키지 보존을 유지한다.
- Update의 설정 보존, global/npx 구분, CLI 교체 후 종료·복구 안내를 유지한다.
- 외부 문자열 escape, 색상에 의존하지 않는 상태 표시, 실행 중 입력 차단과 terminal 복원을 유지한다. 색상은 화면 폭 계산·확인 가능 여부를 왜곡하지 않는다.
- 자동 Workflow runtime·설치 연동·증거·revision·판정 동작은 변경하지 않는다.

## 수용 기준과 검증

| ID | 수용 기준 | 필요한 증거 |
|---|---|---|
| C1 | 채워진 31열 × 5행 픽셀 ARC 워드마크가 기존보다 넓고 낮으며 초록 좌→우 그라데이션이 적용되고 색상 비활성화 시에도 읽을 수 있다 | 대표 터미널 시각 확인과 렌더링 확인 |
| C2 | 메뉴·검토 제목이 `Update`, `Uninstall`이며 제거 범위 설명이 정확하다 | 화면 문자열과 작업 진입 확인 |
| C3 | Configure에서 설치·재설정과 Preset에 접근한다. 수동 Workflow가 표시 메뉴에서 제외되고 대체 명령·단축키가 추가되지 않는다. 자동 runtime·연동과 Update·Uninstall·Exit가 유지된다. README의 홈 메뉴·Workflow 설명도 이 동작과 일치한다 | 메뉴·진입 테스트, 공개 CLI와 자동 runtime·연동의 변경 여부 및 관련 회귀 확인, README 설명 대조 |
| C4 | 선택 메뉴가 공통 footer를 사용하고 문맥별 안내가 실제 행동과 일치한다. 홈 Escape는 종료한다 | 메뉴·입력·상세·결과의 키 입력·복귀 확인 |
| C5 | 표시된 Cancel/Edit/Apply/Details가 작동한다. Update에는 Edit가 없고 Uninstall Edit는 선택값을 유지한다. 정적 Validate가 없다 | 작업별 행동·입력 유지·실행 호출 횟수 테스트 |
| C6 | snapshot·명시적 적용·전체 상세·작은 화면 차단·terminal 복원이 유지된다. Details가 작업·대상·건수·주요 영향을 먼저 보여주고, 사용자용 제목으로 묶인 전체 목록을 누락·잘림 없이 제공한다 | 중복 표현·긴 경로·다중 대상 상세 테스트, 안전성 회귀·PTY 확인 |
| C7 | 변경 흐름과 유지한 각 검토 행동에 집중 테스트가 있다 | 관련 테스트 결과와 실제 PTY 탐색 증거 |

검증 기반은 `tests/node/tui-app.test.mjs`, `tui-render.test.mjs`, `tui-terminal.test.mjs`, `tui-app-pty.test.mjs`다. 후속 계획에서 정확한 범위를 지정한다. 독립 QA는 실제 키 입력으로 변경 흐름과 안전 조건을 확인한다. 모든 계획 작업의 수용과 필요한 QA 완료 후 독립 Reviewer가 최종 전체 변경을 검토하며 Orchestrator가 수용한다.

주요 위험은 장식·요약 증가로 인한 화면 잘림, 잘못된 복귀, 내부 목록 중복으로 인한 오해다. 관리 서비스 변경·새 validation API·키 의미 변경·자동 Workflow 변경이 필요하면 영향받는 작업을 보류하고 Orchestrator에 범위 변경을 보고한다.

근거: `lib/tui/app.mjs:7,19–24,32–38`, `setup.mjs:6–16`, `render.mjs:9–20`, `terminal.mjs:1–71`. 기존 수동 Workflow 경로는 `workflow.mjs:4–8`이며, Orchestrator 확인에 따르면 `lib/cli/root.mjs`에는 공개 `arc workflow` 명령이 없다. README의 기존 홈 메뉴 설명은 `README.md:43–47`이다.
