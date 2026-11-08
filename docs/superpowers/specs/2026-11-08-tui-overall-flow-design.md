# ARC TUI 전체 흐름 개선 설계

## 목적

ARC 관리 TUI의 확인·취소·오류·작은 화면 흐름을 일관되게 다듬는다. 소스 감사에서 확인된 실행 전 확인, 실행 중 입력 종료, Custom 편집기 크기 제한, 홈 버전 표시의 잘림을 개선한다.

**상태:** 사용자가 2026-11-08에 기본 설계, 긴 모델 상세 페이지 이동, TUI payload manifest hash 보완을 승인했다. 상세 페이지와 manifest는 각각 별도 승인된 범위 보완이다.

**대상:** `/Users/yunho/.codex/worktrees/tui-preset-version-flow/arc`, branch `feat/tui-preset-version-flow`, 설계 승인 시 HEAD `453596ed203f38242ded68ccce08f2781ad92fd8`.

## 현재 흐름과 관찰

| 영역 | 현재 동작 | 개선 이유 |
|---|---|---|
| 설정 제거 | Uninstall → Settings → Codex/Claude 선택 후 즉시 제거 작업을 준비·실행한다. Remove CLI는 Continue/Back 확인을 거친다. | 두 파괴적 작업의 실행 전 확인 수준이 다르다. |
| 작업 중 입력 종료 | busy 화면은 Ctrl+C와 Ctrl+D 입력 바이트를 중단으로 처리하지만 input stream `end`/`close` 이벤트를 AbortController에 전달하지 않는다. 관리 작업은 기존 AbortSignal과 transaction 복구 경로를 지원한다. | 물리적인 입력 종료와 명시적 Ctrl+D의 결과가 달라진다. |
| Custom 편집 | 역할 다이어그램과 모델·effort 목록이 최소 크기에 미달하면 크기 안내를 표시하고 선택을 막는다. Custom 다이어그램은 높이 24행을 요구한다. | 작은 창에서는 크기를 늘리지 않으면 역할 편집과 Apply에 접근할 수 없다. |
| 홈 버전 | `ver <version>`을 로고 마지막 행에 붙인 뒤 렌더 너비만큼 자른다. | 좁은 터미널에서 버전이 사라질 수 있다. |
| preset 확인 | 높이 9행 미만에서 키 힌트 footer를 숨기고 질문과 Apply/Back을 우선한다. | 작은 화면에서 힌트는 보이지 않지만, 요청된 질문·빈 줄·액션 순서를 유지하려면 공간을 우선 배정해야 한다. |

소스 흐름은 `lib/tui/app.mjs`, `lib/tui/terminal.mjs`, `lib/tui/custom-preset.mjs`, `lib/tui/render.mjs`, `lib/tui/setup.mjs` 및 기존 관리 작업의 AbortSignal/transaction 경로에서 확인했다. TUI, 관리 작업, 테스트는 실행하지 않았다.

## 제안 동작

### U1 — 설정 제거 확인

Uninstall → Settings에서 Codex 또는 Claude를 선택하면 대상 이름을 넣은 확인 화면을 표시한다. 문구 기본안은 `Remove ARC settings for Codex?` 또는 `Remove ARC settings for Claude?`다. 액션은 `Continue`, `Back`이고 기본 선택은 안전한 `Back`이다. `Back`은 선택한 대상에 초점을 둔 target 목록으로 돌아가며 제거하지 않는다. `Continue`에서만 기존 prepare/execute 경로로 진행한다. CLI 제거 확인은 현재 동작을 유지한다.

### U2 — 작업 중 입력 스트림 종료

관리 작업을 기다리는 busy 화면에서 input `end` 또는 `close`를 기존 중단 신호와 동일하게 기존 AbortController에 전달한다. 입력 스트림 종료 시 terminal session은 기존처럼 즉시 raw mode와 화면을 복구한다. busy는 관리 작업이 신호에 반응하고 transaction 복구를 마칠 때까지 기다린 뒤, 현재 interrupt code와 결과 보고 경로를 따른다. busy가 등록한 종료 리스너는 작업 완료 뒤 정리하며 중복 종료 이벤트는 한 번의 취소로 처리한다. 메뉴/입력 대기 중의 EOF 동작은 유지한다. 이미 시작된 외부 CLI 작업은 기존 프로세스 종료와 복구 계약을 따른다.

### U3 — Custom 편집의 작은 화면 지원

공간이 충분하면 기존 역할 다이어그램과 상세 표시를 유지한다. 공간이 부족하면 역할별 요약 행과 현재 초점, 모델·effort 선택 목록을 압축해 보여준다. 제안하는 최소 조작 크기는 **40열 × 16행**이다. 화면 크기 변경 시 역할·모델·effort 초점과 아직 적용하지 않은 편집 값을 보존한다. 긴 모델·effort 상세는 줄임표로 숨기지 않고 여러 페이지로 모두 확인할 수 있게 한다. 압축 화면에서 `Left`/`Right`는 `Details p/n`으로 표시된 상세 페이지를 이동하고, 첫 페이지에서 Left, 마지막 페이지에서 Right는 현재 페이지를 유지한다. `Up`/`Down`은 후보를 선택하며, `Enter`와 `Back`은 기존 선택·복귀 동작을 유지한다. 후보를 바꾸면 상세를 첫 페이지로 돌린다. 큰 화면의 기존 다이어그램, catalog 검증·취소·역할 값 적용 경로는 유지한다. 필요한 공간보다 작을 때는 현재처럼 이유와 필요한 크기를 안내하고 선택을 막는다.

### U4 — 좁은 홈의 버전 표기

넓은 화면에서는 로고 마지막 줄 오른쪽에 기존처럼 `ver <version>`을 표시한다. 전체 버전 문자열이 같은 행에 들어가지 않으면 로고 아래 기존 구분선 행을 `ver <version>`으로 대체한다. 두 배치의 헤더 행 수를 동일하게 유지해 메뉴 스크롤 예산을 바꾸지 않는다. 버전 문자열이 행 너비 자체보다 길면 기존 terminal fit 동작을 따른다.

### U5 — 작은 Performance preset 확인

기존 요구를 유지한다. 제목은 `Performance preset`, 확인 내용은 후보 프리뷰, `Are you sure?`, 빈 줄 하나, `Apply`, `Back` 순서다. 9행 미만에서는 footer 힌트를 숨겨 필수 확인 행을 보존한다. 그 이상에서는 기존 키보드 힌트를 보인다.

## 보존 규칙 및 제외

- 홈 상태 문자열은 사용자 요구 그대로 `Avaliable`과 `Not Avaliable`을 유지한다.
- 업그레이드 가능한 `Check Version`은 `Upgrade`와 `Back`만 표시한다. 확인·결과 흐름은 직전 승인 설계를 유지한다.
- 일반 하위 화면의 `Esc`는 표시된 대로 Home으로 이동하고, 메뉴의 `Back`은 한 단계만 복귀한다. 홈의 `Esc`는 종료한다.
- TUI 언어, 공개 CLI 문법, 관리·installer 계약, 자동 workflow 동작, 설치 대상 보존 규칙은 변경하지 않는다.
- 기존 테스트 기대값이 현재 화면과 다르다는 점은 기록하지만, 테스트 파일 편집이나 테스트 실행은 이 작업에서 수행하지 않는다. 실제 terminal/operation 결과도 실행하지 않는다.

### 구현 범위 보완 — payload manifest

읽기 전용 검토에서 `MANIFEST.sha256`이 TUI 네 파일을 추적하지만 네 hash가 실제 파일과 다름을 확인했다. 사용자는 `call_6417d9010d3f4340a9ef8dc3d840ae51`에서 `lib/tui/app.mjs`, `custom-preset.mjs`, `render.mjs`, `setup.mjs`의 manifest 항목만 현재 파일 hash로 갱신하는 것을 승인했다. installer 구현/계약은 변경하지 않는다.

## 수용 기준

| ID | 기준 |
|---|---|
| U1 | 플랫폼 설정 제거는 Continue에서만 실행되며 기본 포커스 Back과 대상 복귀가 확인된다. |
| U2 | busy 중 end/close는 한 번의 취소 신호를 보낸다. terminal session은 즉시 복구되고 busy는 결과·복구 경로가 끝난 뒤 자체 리스너를 정리한다. 대기 중 EOF는 기존 동작을 유지한다. |
| U3 | 40×16부터 Custom 역할, 모델, effort, Apply/Back을 조작할 수 있다. 압축 화면에서 Left/Right로 전체 선택 상세를 페이지 이동하며, Up/Down 후보 이동과 Enter/Back 동작은 유지된다. 긴 값 가운데의 차이도 페이지를 넘겨 확인할 수 있다. 대형 다이어그램은 큰 화면에 유지되고 resize 중 초점과 편집 값이 보존된다. |
| U4 | 같은 행 배치가 가능하면 로고 옆 버전을 표시하고, 공간이 부족하면 같은 헤더 행 수의 대체 버전 행에 전체 `ver <version>`을 보인다. |
| U5 | 9행 미만에서도 확인 문구·빈 줄·Apply/Back 순서를 지키며 선택 가능하다. |
| U6 | 정확한 기존 라벨·Esc 규칙과 관리 작업 검증/transaction 경로를 보존하고, 변경은 계획에 승인된 파일만 포함한다. |
| U7 | `MANIFEST.sha256`의 승인된 네 TUI 항목이 현재 소스 hash와 일치하고, 나머지 항목에는 변경이 없다. |

## 위험과 증거 한계

U1은 제거 동작에 확인 단계를 추가한다. U2는 busy 작업 취소에 입력 종료 이벤트를 연결하므로 외부 CLI가 이미 시작된 경우까지 신호 처리 결과를 보수적으로 보존해야 한다. U3은 선택 인덱스와 렌더 행을 압축 화면 사이에 연결하므로 작은 화면의 모든 선택/resize 경로가 핵심 검토 대상이다. U4는 헤더 행 수 불변을 유지해야 한다.

현재 지침상 테스트를 추가·실행하지 않으며 대화형 TUI와 관리 작업도 실행하지 않는다. 구현 QA는 읽기 전용 구조 검토와 `git diff --check`로 한정한다. 키 입력, 실제 터미널 표시, EOF 중단·복구 완료는 미검증으로 기록한다. 이러한 실행 증거가 필수 수용 조건으로 남으면 해당 수용은 보류한다.
