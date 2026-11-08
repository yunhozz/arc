# TUI 프리셋 적용과 버전 표시 구현 계획

> **실행 역할** — ARC Orchestrator가 승인된 작업을 Implementer에게 배정합니다. 체크박스는 작업 내 진행 상태를 기록합니다.

**목표** — 프리셋 적용 시점을 명확하게 표시하고, 버전 확인과 홈 화면에 승인된 문구와 버전 정보를 표시합니다.

**구조** — `runSetup`에서 프리셋 선택과 확인 상태를 관리하고 기존 작업 준비·실행 경로에 연결합니다. `runTui`가 홈과 버전 화면의 데이터를 구성하고, `renderScreen`이 로고 옆 버전을 표시합니다.

**기술** — Node.js 22 이상, ESM, 기존 ARC 터미널 메뉴와 렌더러.

**승인 설계** — `docs/superpowers/specs/2026-11-08-tui-preset-version-flow-design.md`의 동작, 범위 및 확인 기준.

## 대상과 제약

- 소스는 `/Users/yunho/Desktop/project/arc`의 `master`입니다. 선택해 준비한 실행 대상은 `/Users/yunho/.codex/worktrees/tui-preset-version-flow/arc`의 `feat/tui-preset-version-flow`입니다. 두 checkout 모두 기준 HEAD `d312b4934f2760085b64ac0d8d71172470d93780`에서 시작했습니다.
- 계획 저장 경로는 `docs/superpowers/plans/2026-11-08-tui-preset-version-flow.md`입니다. Orchestrator가 저장·검토한 뒤 사용자 계획 승인을 받아야 구현을 시작합니다.
- 설계와 계획 문서가 각각 승인되면 두 문서를 하나의 집중된 `docs` 커밋으로 기록한 뒤 Implementer에게 넘깁니다.
- 구현 범위는 아래 네 TUI 파일입니다. 설치와 프리셋 변경은 기존 카탈로그 검증, 작업 준비, 실행 및 결과 경로를 사용합니다.
- 테스트 코드는 수정하거나 실행하지 않습니다. 기존 테스트 소스는 현재 기대 동작을 확인하는 정적 자료로만 사용하며, 실행 증거는 없습니다.
- 깊이는 **Bounded, 계획 필요**입니다. 선택 화면, 플랫폼 설정 초안, 작업 실행 시점이 연결됩니다. 위험은 `Apply`가 실제 작업으로 연결되는 분기의 변경이므로 동작 변경으로 분류하고, 독립 QA와 전체 변경 Reviewer를 배정합니다.

## 검토 중점

1. 확인 상태에서 `Back`을 선택하면 후보에 초점을 둔 목록으로 돌아가며, 적용 전 초안과 실행 상태를 보존합니다.
2. `Install / Update`에서는 일반·Custom 프리셋을 초안에 반영한 뒤 설치 설정을 이어갈 수 있습니다. `Change Preset`에서는 유효한 `Apply` 한 번으로 해당 작업을 준비하고 실행합니다.
3. Custom 편집 취소, 카탈로그 검증 실패, 작업 실패는 각각 미적용 값과 적용된 초안을 구분해 처리합니다.
4. 업그레이드 가능 화면은 `Upgrade`와 `Back`만 표시하고, 불가 분기에서는 실행이 시작되지 않습니다. 성공 결과와 세션 종료 출력은 같은 짧은 문구를 사용합니다.
5. 좁은 터미널에서도 확인 질문과 액션을 우선해 표시하고, 로고 옆 버전은 기존 헤더 너비 안에서 처리합니다.

## 작업 T1 — 프리셋 적용 흐름과 버전 화면 연결

**목표와 의존성** — 설계 기준 D1–D6을 하나의 TUI 변경으로 구현합니다. 선행 구현 작업은 없으며, 승인 설계·승인 계획·확인된 대상과 네 파일의 소유권이 필요합니다.

| 파일 | 책임과 기준 위치 |
| --- | --- |
| `lib/tui/setup.mjs` | `runSetup`의 선택·확인 전환과 작업 종류별 적용. `initialSettings`/`setupOptions`는 42행, 선택 및 준비 분기는 54행과 73행. |
| `lib/tui/custom-preset.mjs` | `editCustomPreset`의 `Apply` 표시와 검증된 역할 값 반환. 56행 및 66행. |
| `lib/tui/app.mjs` | `ui.menu`에서 홈 버전 전달, `runTui`의 홈 상태·버전 메뉴·결과 문구. 12행, 47행, 63행, 68행. |
| `lib/tui/render.mjs` | `renderScreen`에서 홈 로고 마지막 줄의 버전 표시. 20행 및 25행. |

**인터페이스** — `editCustomPreset({ui, config, initialRoles, catalog})`는 검증된 역할 값 또는 취소 시 `null`을 반환합니다. `runSetup({ui, statuses, draft, kind, prepare, loadPreviewConfig, loadCatalog})`는 기존 `prepare`로 만든 작업 또는 취소 값을 `runTui`에 반환합니다. 홈 메뉴는 선택적 버전 문자열을 화면 데이터로 전달하고, `renderScreen`은 워드마크와 버전 값이 함께 있을 때 한 줄에 표시합니다.

- [ ] **D1 — 일반 프리셋 확인을 연결한다.** `Economy`, `Balanced`, `Smart` 선택 후 같은 `Performance preset` 제목 아래 후보 프리뷰와 `Are you sure?`, 빈 줄 하나, `Apply`, `Back`을 표시합니다. 확인 액션으로 포커스가 이동해도 프리뷰는 후보에 고정합니다. 작은 화면에서는 질문과 두 액션이 보이도록 공간을 먼저 확보하고 프리뷰를 줄입니다. `Back`은 후보에 포커스를 둔 목록으로 돌아갑니다. `Apply`에서 설치 초안을 갱신하고 `Install / Update`는 `Settings`로 돌아가며, `Change Preset`은 기존 준비·실행 경로를 통해 적용합니다.
- [ ] **D2 — Custom 편집기의 적용을 연결한다.** 편집기 메뉴와 화면 본문에서 `Done`을 `Apply`로 바꿉니다. `Back`은 미적용 편집을 버리고 목록으로 돌아갑니다. 카탈로그 검증 뒤 반환된 값으로 `customRoles`, `customEdited`, `preset`을 갱신합니다. 설치는 초안을 갱신하고 기존 설정 흐름을 이어가며, 프리셋 변경은 기존 준비·실행 경로를 즉시 사용합니다. 기존 역할 보존과 실패 후 초안 처리 규칙을 유지합니다.
- [ ] **D3 — 버전 화면 액션을 분리한다.** `prepared.canUpgrade`가 참이면 `Check Version` 본문에는 `Upgrade`, `Back` 두 액션만 표시합니다. `Upgrade`는 화면 진입 시 준비한 작업을 실행으로 넘기고, `Back`은 홈으로 돌아갑니다. 업그레이드가 불가능한 분기는 현재·최신 버전, 해당하는 조회 오류와 `Back`을 유지합니다.
- [ ] **D4 — 성공 결과를 연결한다.** 업데이트 성공 결과를 `Upgrade completed!` 한 줄로 구성합니다. 기존 결과 화면과 글로벌 교체 후 세션 종료 출력에 같은 문구를 사용합니다.
- [ ] **D5 — 홈 상태와 로고 버전을 연결한다.** `installed`는 `Avaliable`, `absent`는 `Not Avaliable`로 표시하고 `incomplete`는 유지합니다. 실행 모듈 기준으로 패키지의 `package.json`에서 버전을 읽습니다. `ver <version>`을 로고 마지막 줄 오른쪽에 붙이고 기존 헤더 너비 및 렌더 규칙을 따릅니다.
- [ ] **D6 — 구현 범위와 증거를 대조한다.** 기준 리비전과 구현 diff를 비교하고, 승인된 문서와 네 구현 파일의 소유권을 구분합니다. 허용된 읽기 전용 QA는 D1–D5의 입력 분기, 준비·실행 호출 위치, 정확한 문구와 렌더 전달 경로만 확인합니다. 기준 리비전, 검사한 파일·줄, 결과와 미확인 동작을 기록합니다.

### 수용 증거와 보류

Orchestrator는 Implementer의 변경 보고와 최신 변경을 대상으로 한 독립 QA의 소스 수준 결과를 기준별로 검토합니다. 키 입력, 실제 터미널 배치, 설치 파일 쓰기 및 업그레이드 실행의 동작 증거는 **미확인**으로 기록합니다. 테스트 추가·수정·실행은 이 요청에서 수행하지 않으며, 기존 테스트 기대값이 새 화면 동작과 다른 상태입니다. 필수 확인 증거가 없는 기준은 미확인으로 남고, 그 기준에 대한 수용은 보류합니다.

정적으로 확인한 기존 기대는 `tests/node/tui-app.test.mjs:16`의 프리셋 선택 직후 `Settings` 진입과 `tests/node/tui-app.test.mjs:112`의 `Version Upgrade` 및 버전 정보 표시입니다. `tests/node/tui-app-pty.test.mjs`, `tests/node/tui-custom-preset.test.mjs`, `tests/node/tui-render.test.mjs`, `tests/node/management-update.test.mjs`는 영향 범위 참고이며 변경하거나 실행하지 않습니다.

### 전체 변경 검토

필수 QA와 T1 수용이 완료된 경우에만 계획 작업을 집중 커밋하고, 이후 독립 Reviewer가 네 구현 파일의 전체 diff를 검토합니다. Reviewer 범위는 Apply와 실제 실행의 연결, 취소·오류 경로, 화면 공간과 문구입니다. 발견 사항은 Implementer가 수정하고 Reviewer가 재검토합니다. Orchestrator가 미확인 증거와 해결된 발견 사항을 바탕으로 최종 완료를 판정합니다.

---

### Planner 자가 검토

- 승인 설계 15–18행을 D1–D2, 22–24행을 D3–D4, 28–29행을 D5, 33–42행을 범위와 수용 기준에 연결했습니다.
- 상호 의존하는 프리셋 선택, 설정 초안, 실행 시점과 홈 렌더링을 하나의 작업에 묶었습니다. 소스 수준 QA와 동작 증거의 한계, QA 및 Reviewer의 시점을 구분했습니다.
- 좁은 화면에서 프리뷰를 줄이고 확인 질문과 액션을 유지하는 기준과 `wordmarkVersion` 전달을 계획에 명시했습니다.
- 테스트 관련 정적 기대와 미실행 상태를 분리했습니다. 이 계획 초안은 채팅에서 작성했으며, 파일 저장·구현·검증 실행은 계획 승인 전입니다.
