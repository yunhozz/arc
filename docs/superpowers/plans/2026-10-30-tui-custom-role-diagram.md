# TUI 프리셋·Custom 역할 도식 Implementation Plan

> **For agentic workers:** ARC Implementer가 구현하고 QA/Reviewer는 독립 검토한다. 체크박스는 진행 기록이며 커밋 단위가 아니다.

**Goal:** 프리셋 이동 중 하네스 도식을 갱신하고, Custom에서 점멸하는 역할 박스로 모델과 effort를 단계별 설정한다.

**Architecture:** 도식 렌더링은 setup.mjs에 유지하고 Custom 편집기에 callback으로 전달한다. 공통 메뉴에 선택적 본문 렌더링과 유휴 refresh를 추가하되 기존 메뉴 기본 동작을 보존한다. Custom은 임시 역할 설정을 쓰고 effort 확정 시 model/effort를 함께 반영한다.

**Tech Stack:** Node.js ES modules, 기존 TUI terminal/session, node:test, 기존 PTY 도구. 신규 의존성 없음.

**Spec:** 사용자가 승인한 대화 설계. Bounded 범위라 별도 spec 파일은 생략한다.

## Global Constraints

- 타깃: /Users/yunho/Desktop/project/arc, feat/tui-preset-preview, 기준 HEAD ca0394ce870403c4971f04260cdbbc67bee75e76.
- lib/tui/diagram.mjs 제거는 사용자가 확인한 의도된 상태다.
- 변경 범위: lib/tui/app.mjs, lib/tui/setup.mjs, lib/tui/custom-preset.mjs, 관련 테스트, MANIFEST.sha256.
- 기존 메뉴와 Change Preset/Performance preset 흐름, Done/Back/Esc Home/Ctrl+C/EOF 의미를 유지한다.
- preset hover와 미확정 model 선택은 draft를 변경하지 않는다.
- Codex는 model_reasoning_effort, Claude는 effort를 사용한다. catalog 검증, unavailable 사유 및 customRoles 저장 의미를 유지한다.
- 역할 이름과 설정은 항상 보이고 초점 표식은 유지한다. 점멸은 선택 역할 박스 테두리에만 적용한다.
- 공간 부족 시 평면 목록으로 바꾸지 않고 필요한 viewport 크기를 안내한다.
- 계획의 테스트 추가·실행 범위는 본 계획 승인 뒤에만 수행한다.
- 라이브러리 수정 후 MANIFEST.sha256을 갱신하고 check:manifest를 확인한다.

## Review Focus

1. idle timer와 입력 동시 도착 시 키 유실·중복 처리 및 중복 waiter.
2. Enter, Back, Esc Home, interrupt, EOF, 오류 종료 뒤 timer 잔류나 후속 출력.
3. 긴 모델명과 resize 시 도식/크기 안내, 선택 및 편집 상태 보존.
4. catalog 중복·누락 pair에서 모델별 허용 effort와 기존 unavailable 값 보존.
5. 저장된 Custom, 취소된 편집, 플랫폼별 effort 키 및 draft 상호 격리.

## 파일 책임과 인터페이스

| 파일 | 책임 |
|---|---|
| lib/tui/setup.mjs | 가변 폭 도식과 viewport 안내, preset별 hover 값, 기존 presetPreviewRows 반환형, Custom 렌더 callback |
| lib/tui/app.mjs | 선택적 메뉴 본문 렌더링, idle refresh, pending event 재사용 및 timer cleanup |
| lib/tui/custom-preset.mjs | 역할 임시 상태, 고유 모델 목록, 모델별 effort 선택, Done 검증 |
| tests/node/tui-setup.test.mjs | preset hover, Custom fallback, 양 플랫폼과 draft |
| tests/node/tui-app.test.mjs | 본문 선택 매핑, refresh/input 수명주기, 기존 메뉴 회귀 |
| tests/node/tui-app-pty.test.mjs | 점멸·역할 이동·resize·종료의 실제 TUI 동작 |
| tests/node/tui-custom-preset.test.mjs 신규 | 모델/effort 단계, 취소와 catalog 검증 |
| MANIFEST.sha256 | 보호 대상 소스 checksum |

기존 presetPreviewRows는 string[] 반환 계약을 유지한다. 내부 helper는 역할 행, viewport, selectedRole, blink를 받아 도식 또는 크기 안내를 반환한다. 선택적 renderBody callback은 논리적 role index와 화면 선택 행을 연결한다. 새 메뉴 옵션은 기존 info API 및 옵션 없는 메뉴 동작에 영향을 주지 않는다.

## T1 — 프리셋·Custom 역할 도식 편집

한 Implementer가 표의 소스·테스트·manifest를 함께 변경한다. 공통 메뉴의 선택행, pending input/timer 수명주기와 Custom 상태가 연결돼 단일 수용 단위로 둔다.

### 수용 기준

- **C1:** Economy/Balanced/Smart/Custom hover가 역할 도식을 즉시 바꾸며 draft, prepare, execute를 변경하지 않는다. Custom은 저장된 Custom을 우선하고 없으면 현재 확정 preset을 보여준다.
- **C2:** ↑/↓로 다섯 역할을 고르고 Enter로 편집한다. 초점 박스는 고정 > 표식과 약 600ms 테두리 점멸을 사용하고 복귀 후 같은 역할에 초점을 둔다.
- **C3:** 모델은 catalog 순서대로 중복 제거한다. 전체 모델 ID와 지원 effort를 별도 상세에 보여주고, 선택 후 해당 모델의 effort만 별도 화면에 표시한다. effort 확정 전 pair는 그대로다.
- **C4:** Codex/Claude effort 필드, catalog 검증, unavailable 안내, 취소/Done 및 customRoles 동작을 유지한다.
- **C5:** 충분한 viewport에서는 도식을 보이고, 공간 부족 시 크기 안내를 표시한다. resize 뒤 초점과 편집 상태가 유지된다.
- **C6:** idle refresh는 pending input 하나를 재사용하고 모든 종료/오류 경로에서 timer를 정리한다. 기존 메뉴 기본 동작은 보존한다.
- **C7:** 변경된 보호 대상과 manifest가 일치하고 check:manifest가 통과한다.

### 단계와 검증

- [ ] 승인 후 기준 HEAD/Git 상태 기록, 기존 집중 테스트 실행 및 baseline 결과 기록.
- [ ] 실패 테스트를 먼저 작성하거나 기존 기대를 조정한다.
  - tests/node/tui-setup.test.mjs — preset hover updates diagrams without mutating drafts: install/preset × Codex/Claude의 네 선택, 도식 갱신, draft 불변 및 prepare/execute 미호출을 확인한다.
  - tests/node/tui-setup.test.mjs — Custom preview uses saved roles or committed preset: 저장 Custom 우선, 없으면 hover와 무관하게 현재 확정 preset을 사용한다.
  - tests/node/tui-app.test.mjs — Custom body maps every role and action to its logical index: 다섯 역할, Done, Back의 매핑과 선택 불가 Orchestrator를 확인한다.
  - tests/node/tui-app.test.mjs — idle blink preserves marker and consumes one pending event: 600ms redraw, 고정 초점 표식, 단일 pending 입력과 key/tick 경합을 확인한다.
  - tests/node/tui-app.test.mjs — refresh stops on every menu exit path: Enter, Back, Esc, interrupt, EOF, 오류 후 timer와 출력이 남지 않는지 확인한다.
  - tests/node/tui-app.test.mjs — 긴 값/작은 viewport 안내, resize 상태 보존, refresh 옵션 없는 메뉴 회귀를 확인한다.
  - tests/node/tui-custom-preset.test.mjs — models are unique and effort choices follow the selected model: catalog 순서, 모델 중복 제거, 전체 ID 및 모델별 effort만 노출을 확인한다.
  - tests/node/tui-custom-preset.test.mjs — role changes only after effort confirmation: effort Enter 전 pair 불변, 확정 시 선택 역할만 변경, Back 취소를 확인한다.
  - tests/node/tui-custom-preset.test.mjs — Done validates missing pairs and cancel preserves source roles: unavailable 안내, Done 검증 및 원본 역할 보존을 확인한다.
  - tests/node/tui-app-pty.test.mjs — resize preserves focused role and pending choices: 크기 안내 후 복귀, 초점과 pending 값 보존을 확인한다.
  - tests/node/tui-app-pty.test.mjs — Custom role navigation blinks while idle and exits cleanly: 실제 idle 점멸, 역할 이동, 정상 종료와 Ctrl+C 후 터미널 복원을 확인한다.
- [ ] setup.mjs에서 선택 역할·blink·가변 폭·크기 안내를 구현하고 기존 preview export를 보존한다.
- [ ] app.mjs에 선택적 renderBody/refresh 옵션을 추가한다. tick 사이 같은 event promise를 유지하고 finally에서 timeout을 정리한다.
- [ ] custom-preset.mjs에서 callback 기반 역할 도식과 모델 → effort 흐름을 연결한다. effort Enter에서만 pair를 반영한다.
- [ ] 집중 테스트 실행: node --test tests/node/tui-setup.test.mjs tests/node/tui-custom-preset.test.mjs tests/node/tui-app.test.mjs tests/node/tui-app-pty.test.mjs. 신규 및 영향받은 기존 테스트 통과가 필요하다. PTY skip은 실터미널 미검증으로 보고한다.
- [ ] manifest 갱신 후 node scripts/update-manifest.mjs 및 npm run check:manifest 실행. diff는 변경된 보호 대상 파일에 한정한다.
- [ ] 전체 회귀 npm test 실행. 새 실패를 해결하고 기존 실패는 기준 상태 증거 없이 baseline으로 단정하지 않는다.
- [ ] Fresh QA가 C1–C7을 독립 검증하고 실패 수정 후 영향받은 QA를 재실행한다.
- [ ] Orchestrator가 기준·QA·manifest·Git 상태 확인 후 T1 구현만 집중 커밋한다. 계획 문서 커밋과 분리한다.
- [ ] 커밋 후 독립 Reviewer가 최종 전체 변경을 검토한다. 최종 지적은 Implementer → Reviewer 재검토로 해결한다.

## 준비 상태와 의존성

| 단계 | 상태 |
|---|---|
| 설계 | 사용자 승인 완료 |
| 타깃 | 현재 checkout 명시 선택, 실행 직전 재확인 |
| 계획 | 2026-10-30 사용자 승인 완료; 구현 handoff 전 계획 문서 커밋 필요 |
| T1 | 계획 승인 후 fresh Implementer에 전달 |
| 수용 | 구현, 집중 테스트, manifest, Fresh QA 완료 후 |
| 최종 검토 | T1 수용·커밋 후 Reviewer |

초기 실행 가능 작업은 T1 하나다. 파일별 병렬 구현은 공유 UI 계약 때문에 수행하지 않는다. Review focus는 pending event 소유권, timer cleanup, viewport/선택 매핑, catalog 제한, 취소 시 원본 보존, 양 플랫폼 호환 및 manifest 경계다.

## 자체 검토

- 승인 설계의 preset hover, Custom 역할 도식/점멸, 모델→effort 단계와 resize 제약을 C1–C6 및 T1 단계에 연결했다.
- Custom 편집과 공통 메뉴 timer/input 수명주기는 분리 수용할 수 없는 하나의 사용자 흐름이므로 T1 한 작업으로 유지했다.
- 기존 presetPreviewRows 반환형, ui.menu 기본 경로, catalog pair 및 Codex/Claude effort 키 보존을 인터페이스 제약으로 기록했다.
- Review Focus 다섯 항목마다 명명된 단위 또는 PTY 시나리오를 두고, manifest 검사·전체 회귀와 Fresh QA 및 최종 Reviewer 순서를 기록했다.
- 사용자 계획 승인이 완료됐다. 계획 문서 커밋과 Implementer handoff gate 이후 구현 및 테스트를 시작한다.
