# ARC TUI 공통 footer·설정 입력 및 lifecycle 메뉴 정리 구현 계획

> **실행 경계:** Implementer가 승인된 소스·테스트·manifest를 수정한다. fresh QA가 필수 검증을 수행하고 Orchestrator가 인수·stage·commit한다. 모든 작업 인수 후 독립 Reviewer가 최종 전체 변경을 검토한다. **terminal gate 및 단일 PTY fixture 소유권 개정은 사용자가 승인했다. plan/T1 amendment와 fresh Implementer handoff를 진행 중이며, 기존 14-path WIP는 그대로 보존한다.**

**목표:** 완료된 footer·설정 입력 개선을 보존하고 lifecycle Back을 통일한다. Review UI/API와 Workflow TUI를 제거하고, Uninstall을 추가 확인 없이 실행하며 내부 agent workflow 기능을 보존한다.

**구조:** 일반 선택 메뉴에는 공통 Back을 제공하고 호출부가 한 단계 복귀를 처리한다. Settings·입력은 기존 Apply/Back 배치를 유지한다. Review 전용 확인 계약은 app·renderer에서 제거하고 일반 선택 가시성 보호를 terminal Enter gate까지 연결한다. dormant Workflow TUI adapter와 package·installer 목록을 정리한다.

**기술:** Node.js ≥22, JavaScript ES modules, `node:test`, 기존 PTY·package·installer 검증 도구. 의존성 추가 없음.

**설계 근거:** 별도 spec이 없는 Bounded 변경이다. 기존 설계 승인 근거는 `call_8caffb7d0a2d491580c8b244109dcf9e`, item 0·1이다. lifecycle·Review·Uninstall 개정 설계는 `call_01e2650be8c84bb1ac00788848cb8607`, item 0으로 승인되었다. 최신 승인 `call_102526261f5041adbe0d834a6c7177d6`, item 0은 이전 Workflow TUI 유지 조항을 제거 승인으로 대체한다.

**계획 경로:** `/Users/yunho/Desktop/project/arc/docs/superpowers/plans/2026-10-25-tui-common-footer-settings.md`

**Canonical handoff:** `/Users/yunho/Desktop/project/arc/.git/arc/handoff/tui-common-footer-settings.md`

**상태:** T1 인수·커밋 완료. terminal gate와 PTY fixture 개정은 2026-10-25 13:31 KST 승인되었다. plan/T1 amendment와 fresh Implementer continuation handoff가 진행 중이다. index clean·14 unstaged paths의 T2 WIP를 보존하며 PTY fixture는 아직 수정되지 않았다.

## 대상·승인·이력

| 항목 | 제공된 검증 근거 |
|---|---|
| workspace·repository | `/Users/yunho/Desktop/project/arc` |
| Git common directory | `/Users/yunho/Desktop/project/arc/.git` |
| branch | `feat/tui-install-update-uninstall` |
| 현재 HEAD | `c19ef3660602ed7f418af4846ad4ecf67906e2f3` |
| 현재 index·worktree | index clean, 알려진 14-path unstaged T2 WIP |
| upstream ahead/behind | 2/0 |
| local history | 두 commit, local/unpushed, 선형, merge 없음 |
| checkout 선택 | `call_62548f664aa24293b705b89960c6b23d`, item 0 |
| 원 계획 commit → 현재 대체본 | `3f7ab1cd56727ea6ce72714280f4e341412fa61b` → `ebe2765face9ba73a0e70ea7cf723a272127f000` |
| 최초 T1 commit | `cd709dee5d64075742b440d556c15ab1ec62b1da` |
| 이전 승인 계획 SHA-256 | `d176ead105f21534d85fa4aa6e1041efe71d2cae8f64a9cb4f2c0245246f02f2` |
| 이번 amendment 직전 승인 계획 SHA-256 | `dc0cd4b8c2436bfb33ca14c6a9bf37156b4a3a2b2621a563eb85c08fb99e4f90` |

의존성은 **T1 → T2**다. T1의 당시 승인·수행·인수와 별도 구현 커밋을 보존한다.

이번 개정은 F5 terminal gate 연결, F6·F7 추가, T2 추가에 해당하는 계약 개정이다. 설계 승인을 개정 계획 승인으로 대신하지 않는다. 문서 amendment의 구·신 SHA 대응과 실제 승인 이력은 canonical handoff에 기록한다.

renderer 소유권 충돌은 Orchestrator가 해소했다. T2에 `lib/tui/render.mjs`와 `tests/node/tui-render.test.mjs`를 포함하여 Review 전용 hint·확인 계약을 제거한다. 이번 개정은 terminal Enter gate 연결에 한해 소유권을 확대하며 관련 없는 terminal·renderer 재설계는 하지 않는다.

**이전 terminal gate amendment 당시 실패 기록:** renderer는 `applyEnabled`를 제거했지만 terminal의 상태·draw·CR/LF gate(`lib/tui/terminal.mjs:18,41,72`)는 여전히 이를 소비했다. `node --test tests/node/tui-terminal.test.mjs`는 30/31 통과, line 20에서 `'blocked' !== 'enter'`로 실패했다. 이 실패는 terminal gate 변경으로 해결됐다. 당시 diff check의 trailing whitespace도 현재는 정리되어 통과한다. 이 기록은 과거 상태이며 baseline으로 분류하지 않는다.

**이전 10-path WIP 보존 기록(덮어쓰지 않음):** `.git/arc/handoff/tui-common-footer-settings-t2-wip.patch`, SHA-256 `5cc5819f736bdbcf91e76f0e97e775083838b1e44ce53e4ce824494ed16f0beb`. 현재 amendment 전 WIP는 아래 절차에 기록한 14-path snapshot이다.

## 공통 제약

- 메뉴 footer는 `↑/↓: Select · Enter Continue · Esc Home`, 홈은 `↑/↓: Select · Enter Continue · Esc Exit`이다.
- 입력 footer는 `↑/↓: Select · Type/Paste Input · Backspace Delete · Enter Continue · Esc Home`이다.
- 일반 비홈 선택 메뉴는 업무 행 뒤 비선택 빈 줄 하나와 마지막 Back을 표시하고 기존 반응형 separator·footer를 유지한다.
- **Settings는 기존 마지막 `'', 'Apply', 'Back'`과 separator 위치를 그대로 유지한다. 공통 Back이나 두 번째 구분 빈 줄을 추가하지 않는다.**
- 입력은 기존 제목·값·Apply·Back·separator·footer 배치를 유지한다.
- separator는 콘텐츠 여백과 자동 줄바꿈 방지 공간을 반영한 가용 폭을 따른다.
- 현재 lifecycle의 idle Escape는 홈 이동, 홈 Escape는 종료다. Working·세션 종료 표시와 중단·복원을 유지한다.
- Backspace는 입력 끝 문자만 삭제하며 메뉴·페이지를 이동시키지 않는다.
- `ui.text()`는 Apply에 문자열, Back에 `null`을 반환한다. 기본 선택은 Apply다.
- preset 표시값은 Economy·Balanced·Smart, 언어는 EN·KR이다. 내부 lowercase 값은 유지한다.
- positive-limit 검증, Both의 명시적 공통 값 선택, 다른 초안, 결과·오류·종료 계약을 보존한다.
- Version Upgrade 등 업무 선택지를 유지한다. 일반 선택 메뉴에 새 Apply를 추가하지 않는다.
- Review·Confirm·관련 Details UI/API·액션과 전용 확인·읽기 완료 계약을 제거한다. Settings·입력의 Apply/Back은 유지한다.
- 일반 renderer의 `selectionEnabled`와 숨겨진 액션 실행 차단을 유지한다. Review 전용 `requiresConfirmation`·`applyEnabled` 계약은 제거한다.
- Uninstall은 target·ARC 블록 처리 선택 후 추가 확인 없이 준비·실행한다.
- Workflow TUI adapter·전용 테스트·배포 참조만 제거한다. 내부 manager·runtime·command·storage·adapters·CLI·agent 기능은 변경하지 않는다.
- `package.json`의 전체 `lib/` 포함 정책은 유지한다.
- 관련 없는 public CLI·policy·의존성·사용자 설치·구조 변경은 범위 밖이다. push·PR·deploy 권한은 없다.
- 하나의 승인 top-level task는 하나의 인수·구현 커밋 단위다. T1과 T2를 합치지 않는다.

## 수용 기준

F1은 일반 선택 액션 가시성으로 명확히 하고 terminal Enter 연결을 추가한다. F5를 개정하고 F6·F7을 추가한다.

| ID | 수용 기준 | 검증 대응 |
|---|---|---|
| **F1** | 메뉴 본문 뒤 빈 줄 하나·반응형 separator·정확한 메뉴 footer를 표시한다. 입력은 제목·값·`Apply`·`Back`·separator·정확한 입력 footer 순서다. separator는 가용 콘텐츠 너비를 따르고 줄바꿈하지 않는다. 작은 화면·스크롤·resize에서도 선택 가능한 액션의 가시성을 보호하며 숨겨진 액션을 실행하지 않는다. | T1 완료. T2 배치·일반 가시성 회귀. 제거된 Review 확인 절차를 다시 도입하는 근거로 사용하지 않음 |
| **F2** | Escape와 Backspace를 별도 이벤트로 전달한다. 홈 외 모든 idle 화면에서 Escape는 즉시 홈으로 이동하고 홈에서는 종료한다. 입력 Backspace는 끝 문자만 삭제하며 메뉴·페이지를 이동시키지 않는다. 비홈 힌트는 `Esc Home`이고 Working·세션 종료 표시의 기존 동작은 유지한다. | T1 완료. T2 lifecycle Escape·무실행 회귀 |
| **F3** | Install / Update와 Change Preset의 Settings에 `Apply`·`Back`을 둔다. Settings Back은 초안·플랫폼을 보존하여 target-selection으로 돌아간다. 입력은 기본 Apply에서 ↑/↓로 액션을 즉시 선택하면서 편집할 수 있고 Enter는 선택 행을 실행한다. 입력 Back은 미확정 필드만 버리고 Settings로 돌아간다. setup 입력 Apply는 기존 숫자 검증 후 작업을 한 번만 준비·실행한다. | T1 완료. T2 Settings·입력 배치·복귀·단일 실행 회귀 |
| **F4** | 사용자에게 preset은 `Economy`, `Balanced`, `Smart`, 언어는 `EN`, `KR`로 표시한다. `KR`은 내부 `ko`의 표시값이며 저장·비교·prepare·실행의 lowercase 계약은 유지한다. | T1 완료. T2 setup 회귀 |
| **F5** | `operationRows()`, `createTuiInterface.review()`와 반환 `review` API, Uninstall의 `ui.review` 호출을 제거한다. `Review <title>`, `Review all changes`, `Change details`, `Confirm <title>` 화면과 Review의 Cancel·Edit·Apply·Details 및 Confirm의 Cancel·Apply를 제거한다. `menu.requiresConfirmation`, `page.requireRead`, `reviewPage` hint와 Review 전용 acknowledgment·경고·`requiresConfirmation`/`applyEnabled` 계약 및 관련 테스트를 제거한다. Uninstall은 target·ARC 블록 처리 선택 후 prepare·execute를 각각 한 번 수행하며 추가 확인을 요구하지 않는다. Back·Escape는 준비·실행하지 않고 준비 실패 시 실행하지 않는다. 기존 설정·입력·결과·오류 계약과 일반 선택 가시성 보호를 보존한다. terminal은 menu/text의 `selectionEnabled`로 Enter를 판정하고 resize 후 갱신하며 page Enter는 허용한다. 필수 회귀를 통과하고 알려진 baseline 외 신규 실패가 없어야 한다. | T2 소스·API·화면·terminal gate·단위·PTY·전체 suite·fresh QA |
| **F6** | 현재 lifecycle의 비홈 선택 메뉴에 Back이 한 번 존재한다. Settings는 기존 `'', 'Apply', 'Back'`을 유지하며 공통 Back을 추가하지 않는다. 입력도 기존 Apply/Back을 유지한다. 그 외 선택 메뉴에는 업무 행 다음 비선택 빈 줄 하나와 마지막 공통 Back을 둔다. 홈에는 Back이 없다. 아래 표의 한 단계 복귀·초안·선택 보존을 충족한다. 업그레이드 불가 Check Version에도 Back이 있다. 비메뉴 페이지는 유지한다. 보이는 menu/text 선택은 Enter를 허용하고 숨겨진 선택은 차단하며 resize 후 재판정한다. | T2 배치·중복 방지·복귀·viewport 단위 및 PTY |
| **F7** | dormant Workflow TUI adapter·전용 테스트·package/installer 배포 참조를 제거한다. package에 TUI adapter가 없고 내부 management workflow가 포함되어야 한다. 내부 manager·runtime·command·storage·adapters·CLI·agent workflow 기능과 core 테스트를 보존한다. 생성 manifest와 required payload 목록이 실제 배포물과 일치해야 한다. | T2 package·release-artifact·내부 workflow/CLI·manifest·role-policy·전체 suite |

Review 확인·읽기 완료 UX는 복원하지 않는다. 현재 Settings·입력·일반 업무 액션의 선택 가시성 보호와 일반 page Enter는 유지한다.

### F6 화면별 적용·복귀

| 화면 | 배치 | Back 목적지·보존 조건 |
|---|---|---|
| Install / Update target 선택 | 공통 빈 줄·Back | 홈 |
| Change Preset target 선택 | 공통 빈 줄·Back | 홈 |
| Settings | 기존 빈 줄·Apply·Back | target 선택; 플랫폼·초안·선택 위치 보존 |
| Performance preset | 공통 빈 줄·Back | Settings; 값 변경 없음 |
| Harness output language | 공통 빈 줄·Back | Settings; 값 변경 없음 |
| Target settings differ | 공통 빈 줄·Back | target 선택; 설정 덮어쓰기 없음 |
| Check Version | 공통 빈 줄·Back | 홈; upgrade 행 유무와 무관 |
| Uninstall target | 공통 빈 줄·Back | 홈 |
| Global ARC instructions | 공통 빈 줄·Back | Uninstall target; 이전 선택 보존 |
| 값 입력 | 기존 Apply·Back | Settings; 미확정 문자열만 폐기 |
| 홈 | 기존 배치, Back 없음 | 해당 없음 |

Result·오류 등 `page()` 화면에는 Back 행을 추가하지 않는다.

## 검토 초점

1. Back 표시 인덱스와 업무 인덱스의 혼동으로 다른 target·preset·언어·업무가 선택되지 않는지 검증한다.
2. Settings의 기존 빈 줄·Apply/Back이 유지되고 Both Back이 설정을 덮어쓰지 않는지 검증한다.
3. Review 확인 계약 제거 후 terminal이 `selectionEnabled`를 사용해 작은 화면·resize에서 숨겨진 액션을 차단하고, 일반 page Enter를 허용하는지 검증한다.
4. Uninstall이 추가 확인 없이 한 번 실행되며 Back·Escape·준비 실패는 실행하지 않는지 검증한다.
5. Workflow TUI 제거가 package·installer 정합성이나 내부 agent workflow·CLI 기능을 손상하지 않는지 검증한다.

## T1: 공통 탐색·footer·설정 입력 계약 통합 — 완료

**상태:** Orchestrator 인수·커밋 완료. 원 구현 commit은 `cd709dee5d64075742b440d556c15ab1ec62b1da`다. 문서 amendment 후에도 구현 내용과 별도 작업 경계를 보존한다.

**당시 목표·범위:** 이전 승인판 F1–F5에 따라 terminal 이벤트, footer·viewport, 홈 탐색, Settings·범용 입력, 표시값을 통합했다. 당시 Review 보존·Workflow 입력 회귀는 당시 승인 계약에 따른 완료 이력이다. T2가 해당 UI·확인 계약·adapter를 후속 제거한다.

**선행 작업·의존성:** 당시 설계·계획 승인과 실행 대상 준비를 거쳤다. 현재 의존성은 **T1 → T2**다.

**당시 파일 소유권:**

- 소스: `lib/tui/terminal.mjs`, `lib/tui/render.mjs`, `lib/tui/app.mjs`, `lib/tui/setup.mjs`
- 테스트: `tests/node/terminal.test.mjs`, `tests/node/tui-terminal.test.mjs`, `tests/node/tui-terminal-pty.test.mjs`, `tests/node/tui-render.test.mjs`, `tests/node/tui-app.test.mjs`, `tests/node/tui-app-pty.test.mjs`, `tests/node/tui-setup.test.mjs`, `tests/node/tui-workflow.test.mjs`
- 생성 해시: `MANIFEST.sha256`

**완료 기록:**

- [x] 회귀 테스트·기대값 갱신과 focused RED.
- [x] terminal Escape·Backspace 분리.
- [x] 공통 footer·viewport·가시성 보호.
- [x] 홈 탐색·범용 입력 Apply/Back.
- [x] Settings·숫자 입력의 단일 실행·표시값.
- [x] focused GREEN·Workflow 입력 계약 회귀.
- [x] 실제 PTY·resize·터미널 복원 검증.
- [x] manifest·role-policy 검사.
- [x] 전체 suite baseline 분류.
- [x] fresh QA·필요 재검증.
- [x] Orchestrator 인수·별도 구현 커밋.
- [x] 당시 최종 독립 검토 완료; reachable UI의 미해결 발견 없음.

| 당시 검사 | 제공된 결과 |
|---|---|
| focused | 95/95 통과 |
| PTY | 25/25 통과, skip 0 |
| manifest | 보호 파일 186개 검사 통과 |
| role-policy | 25개 검사 통과 |
| 전체 suite | 1024 total, 1004 pass, 11 fail, 9 skip |

11개 실패는 기존 baseline과 이름·진단이 같았다. dormant Workflow P3는 당시 현재 lifecycle UI에서 도달하지 않았으며 T2에서 adapter를 제거한다.

T1 증거는 T2 결과를 증명하지 않는다. 당시 승인판·내용·해시·승인/인수 시점·검사 결과는 canonical handoff에 복구 가능하게 보존한다. 완료 기록을 재실행 지시로 해석하지 않는다.

## T2: lifecycle Back 통일·Review와 Workflow TUI 제거

**목표·범위:** F5–F7과 terminal Enter 연결을 구현하고 F1–F4의 현재 적용 계약을 보존한다. 메뉴·실행 경로·renderer/terminal 계약·adapter 제거·배포 목록을 함께 검증하는 하나의 연결된 인수·구현 커밋 단위다.

**선행 작업·의존성:** **T1 → T2**. 기존 승인·완료 이력과 이번 PTY fixture 소유권 개정 승인은 완료되었다. Plan/T1 amendment와 14-path WIP 재검증 후 fresh continuation handoff로 남은 작업을 재개한다. 유효한 증거·완료 작업은 반복하지 않으며 WIP를 폐기·중간 커밋하지 않는다.

### 파일 소유권

Implementer 한 명이 다음 파일만 수정·삭제한다. 기준 경로는 `/Users/yunho/Desktop/project/arc`다.

| 파일 | 작업·책임 |
|---|---|
| `lib/tui/app.mjs` | 수정: 공통 Back·복귀, `operationRows()`·`review()`·반환 API·Uninstall review 호출 제거, 전용 menu/page 확인 분기 제거, Uninstall 직접 연결 |
| `lib/tui/setup.mjs` | 수정: 일반 메뉴 Back·Both 업무 인덱스·복귀; Settings 배치 보존 |
| `lib/tui/render.mjs` | 수정: `reviewPage` hint·Review 전용 `requiresConfirmation`/`applyEnabled`·전용 경고와 보조 계산 제거; 일반 footer·`selectionEnabled` 보존 |
| `lib/tui/terminal.mjs` | 수정: menu/text의 `selectionEnabled`·page 예외로 Enter gate 연결, resize 재계산만 허용 |
| `lib/tui/workflow.mjs` | 삭제: dormant 대화형 Workflow adapter |
| `lib/installer/manifest.mjs` | 수정: required payload에서 TUI adapter 항목만 제거 |
| `tests/node/tui-app.test.mjs` | 수정: 명시된 Review 화면/API·전용 테스트 제거, Back·직접 실행·입력·일반 page·viewport 회귀 |
| `tests/node/tui-setup.test.mjs` | 수정: Settings 배치·복귀·초안·선택·Both |
| `tests/node/tui-render.test.mjs` | 수정: Review hint·확인 전용 assertion 제거; 일반 footer·선택 가시성·escaping·logo 검증 보존 |
| `tests/node/tui-app-pty.test.mjs` | 수정: Review/Confirm/Details 전용 경로 제거·Back·직접 Uninstall·일반 resize 회귀 |
| `tests/node/tui-terminal.test.mjs` | 수정: Review resize fixture를 일반 선택·resize·page Enter 회귀로 대체; lifecycle 검증 보존 |
| `tests/node/tui-terminal-pty.test.mjs` | 수정: resize fixture 하나의 `requiresConfirmation` 제거·실제 메뉴 행 `selected` 지정만 허용; lifecycle/restoration 유지 |
| `tests/node/tui-workflow.test.mjs` | 삭제: adapter 전용 테스트 |
| `tests/node/package.test.mjs` | 수정: TUI adapter 미포함·management workflow 포함 assertion |
| `MANIFEST.sha256` | 재생성: 삭제 항목 및 app·setup·renderer·terminal·installer 담당 소스 해시 반영 |

다음은 **보존·회귀 검증 대상이며 수정하지 않는다.**

- `lib/management/workflow.mjs`
- `lib/runtime/**`와 내부 command·storage·adapters
- `package.json`
- `tests/node/management-workflow.test.mjs`
- `tests/node/runtime-workflow.integration.test.mjs`
- `tests/node/runtime-cli.test.mjs`
- `tests/node/release-artifact.test.mjs`
- 기존 terminal 테스트 중 위 T2 소유권에 명시하지 않은 파일. `tests/node/tui-terminal-pty.test.mjs`는 위 resize fixture 하나만 예외

추가 파일·helper 수정이 필요하면 해당 부분을 보류하고 Orchestrator에게 반환한다.

### Interfaces·제거 경계

- `menu(title, rows, options)`에 `backRow=false`를 추가한다. `requiresConfirmation` 옵션과 관련 화면 속성·Enter 확인 분기를 제거한다.
- `backRow:true`는 target·Both 불일치·preset/language·Check Version·Uninstall 선택 메뉴에만 사용한다.
- 홈·Settings는 공통 Back을 활성화하지 않는다. `text()`는 변경하지 않는다.
- 업무 선택은 전달된 `rows`의 업무 인덱스, 공통 Back은 `null`을 반환한다. 빈 줄은 선택하지 않는다.
- 공통 Back은 내부 표시 모델에만 추가한다. 호출부 배열을 변경하거나 문자열 이름으로 임의 중복 제거하지 않는다.
- Settings의 명시적 Apply/Back, `separatorBefore:labels.length-2`, 기존 Back 인덱스 처리·`null` 방어 분기를 유지한다.
- Both 불일치의 기존 선행 Back만 제거하고 두 업무의 source 인덱스를 갱신한다.
- `createTuiInterface()` 반환은 `menu`, `text`, `page`, `busy`이며 `review`가 없다.
- `operationRows()`와 그 전용 의존성, Review·Confirm 구현·관련 액션·UI 문구를 제거한다.
- `page()`의 `requireRead`, 연속 읽기 acknowledgment·confirmed 상태·전용 resize reset·Review hint 분기를 제거한다. 일반 페이지의 스크롤·Enter 복귀·Escape를 유지한다.
- `navigationHint()`에서 `reviewPage` 처리와 이를 위한 전용 인자를 제거한다. 일반 page는 `↑/↓: Scroll · Enter Back · Esc Home`을 유지한다.
- renderer는 `requiresConfirmation`, 반환 `applyEnabled`, 전용 required-row 계산·경고·스타일 분기를 제거한다. 정적 호출부 확인으로 제거된 확인 계약 전용임을 확인한 보조 계산만 정리한다.
- renderer의 `text`, `styles`, `selectionEnabled`, escaping·wrapping·logo·반응형 footer는 보존한다.
- terminal은 menu/text에서 `selectionEnabled`가 true일 때만 CR/LF를 `enter`로, 숨겨진 선택은 `blocked`로 전달한다. resize redraw마다 gate를 재계산한다. `mode:'page'`는 선택 행 없이도 Enter를 허용한다. 첫 render 전 동작·이벤트 파싱·CR/LF 중복 처리·Escape/Backspace·signals·busy/queue·disposal·복원은 변경하지 않는다.
- `Resize terminal to review before applying.` 등 Review 전용 경고를 제거한다.
- Uninstall은 global 업무 선택 직후 prepared 결과를 반환하고 기존 execute 경로를 한 번 사용한다.
- Workflow TUI adapter·전용 테스트·배포 항목만 제거하고 내부 manager·runtime·CLI의 인터페이스·기능을 유지한다.
- installer required 목록에서 `lib/tui/workflow.mjs`만 제거한다. management workflow 등 나머지 필수 payload를 보존한다.
- package 검증은 `lib/tui/workflow.mjs` 부재와 `lib/management/workflow.mjs` 존재를 함께 확인한다.

### 구현·검증 단계

- [ ] **1. lifecycle·renderer·package 회귀를 먼저 작성한다.**

| 검증 | 필수 assertion |
|---|---|
| 공통 Back | 업무 행 다음 빈 줄·Back, 한 번 표시, 선택 결과 `null` |
| 업무 인덱스 | target·preset·language·Version Upgrade 선택 유지 |
| 빈 줄 | 양방향 순환에서 선택 불가 |
| 홈 | 기존 항목·Esc Exit 유지, Back 없음 |
| Settings | 기존 `'', 'Apply', 'Back'`, Back 1개, Apply/Back 사이 빈 줄 없음 |
| 복귀·초안 | 복귀 표 충족, 플랫폼·다른 초안·선택 위치 보존 |
| Both | Back은 덮어쓰기 없음; 업무 source 선택 정확 |
| Check Version | upgrade 불가여도 Back 선택 가능, 실행 없음 |
| Uninstall | target·블록 옵션 일치; prepare·execute 각 1회; 같은 prepared 객체 실행 |
| 무실행 | Back·Escape에서 준비·실행 0회; 준비 실패 시 실행 0회 |
| Review 제거 | 반환 API에 review 없음; 명시된 Review/Confirm/Details 화면이 실행 이력에 없음 |
| renderer 정리 | 반환에 applyEnabled 없음; Review 경고 없음; 일반 page hint 유지 |
| 일반 가시성 | footer 예약, 작은 화면·긴 행에서 selectionEnabled false, resize 후 정상 선택 가능 |
| 입력·페이지 | 기존 입력·숫자 검증·단일 실행, 일반 page 스크롤·Enter·Escape 보존 |
| package | TUI adapter 부재, management workflow 존재 |

핵심 assertion 예:

```js
assert.deepEqual(targetScreen.rows,
  ['Codex', 'Claude', 'Both targets', '', 'Back']);
assert.deepEqual(settingsScreen.rows.slice(-3), ['', 'Apply', 'Back']);
assert.equal(settingsScreen.rows.filter(row => row === 'Back').length, 1);
assert.equal(backChoice, null);
assert.equal('review' in ui, false);
assert.equal('applyEnabled' in rendered, false);
assert.equal(preparations, 1);
assert.equal(executions, 1);
assert.equal(executed, prepared);
assert.ok(screens.every(({title}) =>
  !/^(Review(?: |$)|Confirm(?: |$)|Change details$)/.test(title)));
```

화면 순서 assertion은 정보 행·viewport 잘림이 없는 fixture에서 사용한다.

Review 전용 renderer 테스트는 제거한다. logo·escaping·폭·footer·일반 선택 가시성 assertion과 섞여 있는 테스트는 전체 삭제하지 않고 전용 확인 속성·assertion만 걷어낸다. 일반 페이지·결과·오류·긴 텍스트 검증도 보존한다.

- [ ] **2. terminal 코드를 바꾸기 전에 generic gate 회귀를 추가하고 RED를 기록한다.**

`tests/node/tui-terminal.test.mjs`의 Review resize fixture를 menu/text의 숨겨진 선택 차단 → 확대 후 Enter 허용 → 재축소 후 차단 검증으로 대체한다. 보이는 text Apply/Back, 선택 행 없는 page Enter 허용, 화면 전환 시 gate 갱신을 추가한다. busy/queued-input fixture는 일반 선택 화면으로 바꾸고 lifecycle assertion은 보존한다.

```bash
node --test tests/node/tui-terminal.test.mjs
```

작업 디렉터리: `/Users/yunho/Desktop/project/arc`

```bash
node --test tests/node/tui-app.test.mjs tests/node/tui-setup.test.mjs tests/node/tui-render.test.mjs tests/node/package.test.mjs
```

terminal 수정 전 새 gate 회귀는 현재 `applyEnabled` 연결 오류로 실패해야 한다. 제공된 30/31 실패와 기존 유효한 lifecycle RED는 보존하며 완료된 RED를 불필요하게 반복하지 않는다. syntax·import·fixture 오류나 이벤트 고갈만으로는 유효한 RED가 아니다.

- [ ] **3. 공통 Back·호출부 복귀를 구현한다.**

`backRow:true`에서만 Back을 표시한다. 빈 줄은 선택 순환에서 제외하고 표시 인덱스·capacity·offset과 업무 반환 인덱스를 구분한다.

일반 메뉴에만 옵션을 적용한다. Settings 배열·구분·Back 처리를 유지한다. Both 선행 Back을 제거하고 source 인덱스를 갱신한다. 선택·초안을 보존하고 Back에서 prepare하지 않는다.

- [ ] **4. app·renderer의 Review UI/API·확인 계약을 제거한다.**

다음을 명시적으로 제거한다.

- `operationRows()`와 전용 의존성·불필요 import.
- `createTuiInterface.review()`와 반환 `review` API.
- `ui.review('Uninstall', prepared)` 호출.
- `Review <title>`, `Review all changes`, `Change details`, `Confirm <title>` 화면.
- Review의 Cancel·Edit·Apply·Details 및 Confirm의 Cancel·Apply.
- `menu.requiresConfirmation`, `page.requireRead`와 전용 acknowledgment·읽기 상태·resize reset.
- `reviewPage` hint와 전용 helper 분기.
- renderer의 `requiresConfirmation`/`applyEnabled`, 전용 required-row 계산·경고·스타일 분기.
- Review 전용 테스트·PTY 단계.

일반 `selectionEnabled`·footer·clipping 보호, logo·escaping·wrapping과 page 스크롤·Enter·Escape는 보존한다. Settings·입력 Apply/Back, Version Upgrade를 제거하지 않는다.

정적 호출부 조사에서 승인 범위 밖의 실제 소비자가 확인되면 해당 제거를 보류한다.

- [ ] **4a. terminal Enter gate를 좁게 연결한다.**

기존 `applyEnabled` 상태·draw 대입·CR/LF 판정을 generic gate로 바꾼다. menu/text는 `selectionEnabled`, page는 Enter 허용으로 계산하고 resize 후 갱신한다. renderer에 `applyEnabled`를 복구하지 않으며 다른 terminal 동작은 바꾸지 않는다.

- [ ] **5. Uninstall을 직접 준비·실행 경로에 연결한다.**

global 업무 선택 직후 준비 결과를 반환하고 기존 execute를 한 번 사용한다. 별도 실행 경로·추가 Apply·확인 화면을 만들지 않는다.

Back·Escape는 준비 전에 복귀한다. 준비 실패는 기존 오류 경로를 사용하며 실행하지 않는다. 실행 결과·오류·종료 계약을 유지한다.

- [ ] **6. Workflow TUI와 배포 참조를 제거한다.**

`lib/tui/workflow.mjs`, `tests/node/tui-workflow.test.mjs`를 삭제한다. installer required 목록에서 TUI adapter만 제거한다.

package 테스트의 기존 TUI 존재 기대를 부재 assertion으로 바꾸고 management workflow 존재 assertion은 유지한다. `package.json`, manager·runtime·CLI·core 테스트는 수정하지 않는다.

실제 production 소비자가 발견되면 삭제를 진행하지 말고 영향 근거를 반환한다.

- [ ] **7. lifecycle·renderer·내부 workflow focused GREEN을 확인한다.**

```bash
node --test tests/node/terminal.test.mjs tests/node/tui-terminal.test.mjs tests/node/tui-render.test.mjs tests/node/tui-app.test.mjs tests/node/tui-setup.test.mjs
```

```bash
node --test tests/node/management-workflow.test.mjs tests/node/runtime-workflow.integration.test.mjs tests/node/runtime-cli.test.mjs
```

기대 결과: 각 exit 0. 현재 terminal 실패와 새 visibility·resize·page Enter 회귀가 통과해야 한다. 삭제한 adapter 테스트로 내부 기능 보존을 대신 증명하지 않는다.

- [ ] **8. 실제 PTY 경로를 개정·검증한다.**

```bash
node --test tests/node/tui-terminal-pty.test.mjs tests/node/tui-app-pty.test.mjs
```

필수 경로:

- 실제 menu/text Enter 허용, 숨겨진 선택 차단, 확대 후 허용·재축소 후 재차단.
- 선택 행 없는 일반 page·Result·오류의 Enter 복귀와 화면 전환 gate 갱신.
- target Back→홈.
- Settings 기존 Apply/Back·Back→이전 target.
- preset/language Back→기존 값의 Settings.
- Uninstall global Back→target, Escape→홈; 준비·실행 0회.
- ARC 블록 업무 선택→추가 Enter 없이 실행·Result; prepare·execute 각 1회.
- 기존 입력 편집·Apply·Back·검증 실패·lowercase 옵션.
- 작은 화면·resize에서 숨겨진 Settings Apply·업무 실행 차단.
- 일반 page·오류 Escape, Working 중단, EOF·signal·raw-mode 복원.

**현재 RED:** terminal PTY 4/5. 기존 resize fixture는 `requiresConfirmation:true`와 selected 없는 menu에서 `THIRD=enter`를 기대한다. generic `selectionEnabled`에서는 선택이 없으므로 `THIRD=blocked`가 되며, 이 차이는 baseline이 아니다.

fresh continuation 후 해당 fixture에서만 `requiresConfirmation:true`를 제거하고 실제 메뉴 행에 `selected`를 지정한다. 축소 시 숨겨진 선택의 Enter는 blocked, resize 후 해당 행이 보이면 `THIRD=enter`를 유지한다. 다른 lifecycle/restoration 검증과 제품 코드는 변경하지 않는다. 기존 4/5를 RED 증거로 보존한다.

Review/Confirm/Details 전용 PTY 경로는 제거하고 resize 보호를 현재 Settings·일반 메뉴에서 검증한다. terminal PTY는 5/5·skip 0, app PTY도 통과해야 한다. Review UX를 복구하거나 기대값만 `THIRD=blocked`로 완화하지 않는다. 필수 PTY skip은 통과가 아니다.

- [ ] **9. whitespace·manifest·package·required payload를 검증한다.**

`tests/node/tui-render.test.mjs:22,31,51`의 빈 줄 trailing whitespace를 정리하고 `git diff --check HEAD`가 exit 0이어야 한다.

실제 검사 scripts는 `check:manifest` → `node scripts/update-manifest.mjs --check`, `check:role-policy` → `node scripts/update-role-policy.mjs --check`다. `npm run update:role-policy`는 생성 명령이며 검사 대체가 아니고 이번 fixture 수정 때문에 실행하지 않는다. `manifest`·`policy` aliases는 없다. 보호된 `package.json`은 수정하지 않는다. 환경은 Node v22.18.0/npm 11.20.0이다.

```bash
node scripts/update-manifest.mjs
npm run check:manifest
npm run check:role-policy
```

```bash
node --test tests/node/package.test.mjs tests/node/release-artifact.test.mjs
```

기대 결과: 각 exit 0. TUI adapter manifest 항목 제거와 app·setup·renderer·terminal·installer 변경 해시를 확인한다. package·required payload에서 삭제 경로가 사라지고 내부 manager·기존 payload가 보존되어야 한다.

- [ ] **10. 전체 suite와 baseline을 비교한다.**

```bash
npm test
```

아래 11개 실패를 이름·진단·영향 관계로 비교한다. 테스트 삭제·추가로 총수가 달라지므로 개수만으로 판정하지 않는다.

- [ ] **11. fresh QA·필요 재검증을 완료한다.**

fresh QA는 fixture 수정이 하나로 제한되고 실제 선택·축소 차단·확대 후 `THIRD=enter`·lifecycle/restoration이 유지되며 terminal PTY 5/5·skip 0인지 확인한다. 그와 함께 terminal generic gate·resize·page Enter·lifecycle 보존·whitespace와 F5–F7·F1–F4 회귀, Review 제거, 일반 `selectionEnabled` 보호, Settings 예외, 내부 workflow/CLI·package·required payload·manifest·role-policy·전체 결과를 확인한다.

Implementer 수정 후 영향받는 검사와 QA 재검증을 완료한다. T1 증거는 T2 검증을 대신하지 않는다.

- [ ] **12. Orchestrator가 T2를 인수·별도 커밋한다.**

인수 조건:

- F5–F7·복귀 표 전체 충족.
- Settings·입력 배치 보존, 중복 Back·추가 구분 빈 줄 없음.
- `review` API 부재와 명시된 Review/Confirm/Review all changes/Change details 화면 미표시.
- 지정 Review helper·옵션·hint·확인 반환 계약·액션·전용 테스트 제거.
- 일반 result/error/page·viewport·selectionEnabled 검증 보존.
- 실제 menu/text Enter 허용·숨겨진 선택 차단·resize 후 재판정·page Enter 허용 증명.
- terminal 파싱·Escape/Backspace·signals·busy/queue·disposal·복원 보존.
- `git diff --check HEAD` 통과, 기존 WIP·T1 내용·작업 경계 보존.
- Uninstall 즉시 단일 실행과 Back·Escape 무실행 증명.
- Workflow TUI·전용 테스트·배포 참조 제거, 내부 agent workflow 보존.
- focused·내부 workflow/CLI·필수 PTY·package·release-artifact·manifest·role-policy 통과. terminal PTY 5/5·skip 0, 축소 시 blocked·실제 선택이 보이는 resize 후 `THIRD=enter`, 기존 lifecycle/restoration 유지.
- 전체 suite 신규·미분류 실패 없음.
- fresh QA·재검증 완료, 미해결 발견·필수 skip 없음.
- 변경 파일이 승인 범위와 일치.

Orchestrator가 인수한 뒤 T2 파일만 stage하여 한 번 커밋한다. T1과 합치지 않는다. 추가 사용자 커밋 승인은 필요하지 않다.

```text
feat(tui): Back 탐색 통일 및 Review·Workflow 메뉴 제거
```

### T2 보류 조건

- 대상·HEAD·변경 상태·소유권이 handoff와 다름.
- 개정 계획 승인·문서 amendment·준비 근거가 없음.
- 삭제되는 UI/API·hint·확인 계약의 실제 지원 소비자가 승인 범위 밖에 존재함.
- 내부 manager·runtime·CLI·추가 파일 또는 terminal Enter gate 외 파싱·signals·busy·disposal 변경이 필요함.
- current terminal 실패·page Enter 차단·resize stale gate·whitespace가 미해결임.
- 현재 14-path patch SHA·경로·index 불일치, 예상 밖 상태·임시 tree 충돌·CAS 실패.
- PTY fixture 새 승인 부재·current 실패·필수 skip 미해결, fixture 외 변경 또는 제품 gate/Review UX 변경 필요.
- 일반 가시성 보호 손실, Settings 배치 변경, 중복 Back, 초안 손실, 인덱스 오류, 중복 실행.
- 내부 workflow 기능 실패, package 누락, installer·manifest 불일치.
- 필수 PTY skip, 도구·파일 실패, 신규·미분류 실패.
- 관련 없는 policy·의존성·생성물 변경 필요.
- 부분 변경·실패 후 상태가 불명확함.

실패 검사·결과·기준/현재 revision·파일·완료 단계를 기록하고 baseline/current·의존성을 분류한다. 영향받은 작업·인수를 보류하며 임의 재시도·우회·범위 확대하지 않는다. 독립 승인 작업은 Orchestrator가 권한·입력·의존성을 확인한 뒤 해제한다.

## 전체 suite baseline과 T1 증거 구분

| 시점 | 결과 |
|---|---|
| 원 계획 이전 baseline | 1006 total, 986 pass, 11 fail, 9 skip |
| T1 완료 검증 | 1024 total, 1004 pass, 11 fail, 9 skip |
| T2 | 아직 실행하지 않음. 실제 결과를 별도 기록 |

두 과거 결과의 11개 실패는 이름·진단이 같은 baseline으로 검증되었다.

| 파일 | 알려진 실패 이름 |
|---|---|
| `tests/node/instruction-layout.test.mjs` | `codex contracts have explicit destinations and before-action gates` |
| `tests/node/instruction-layout.test.mjs` | `claude contracts have explicit destinations and before-action gates` |
| `tests/node/instruction-layout.test.mjs` | `profile models, permissions, hooks, canonical policy and CLI/runtime bytes are preserved` |
| `tests/node/plan.test.mjs` | `codex en skipGlobal=false preserves public rendering baseline` |
| `tests/node/plan.test.mjs` | `codex en skipGlobal=true preserves public rendering baseline` |
| `tests/node/plan.test.mjs` | `codex ko skipGlobal=false preserves public rendering baseline` |
| `tests/node/plan.test.mjs` | `codex ko skipGlobal=true preserves public rendering baseline` |
| `tests/node/plan.test.mjs` | `claude en skipGlobal=false preserves public rendering baseline` |
| `tests/node/plan.test.mjs` | `claude en skipGlobal=true preserves public rendering baseline` |
| `tests/node/plan.test.mjs` | `claude ko skipGlobal=false preserves public rendering baseline` |
| `tests/node/plan.test.mjs` | `claude ko skipGlobal=true preserves public rendering baseline` |

같은 이름이어도 진단·관련성이 달라지면 자동으로 baseline 처리하지 않는다. 과거 skip은 필수 PTY 실행 증거를 대체하지 않는다.

## 실행 중 계획 amendment·handoff

현재 index clean·14-path WIP를 작업 트리에 그대로 보존한다. 백업은 `/Users/yunho/Desktop/project/arc/.git/arc/handoff/tui-common-footer-settings-t2-wip-terminal-gate.patch`, SHA-256 `a7e0492e3413194ca6da08813ccdaa6348153a9e0de1e34fe3ec41b4301c3f56`다. 이전 10-path snapshots·patch·승인 이력은 덮어쓰지 않는다. Orchestrator만 아래 임시 index·CAS·작업 트리 갱신 없는 read-tree 절차를 수행하며 WIP를 unstaging·reset·역적용·재적용하지 않는다.

1. 이번 PTY fixture 소유권·검사 명령 교정 버전의 사용자 승인은 2026-10-25 13:31 KST에 받았다. 이 승인은 아래의 한 fixture·명령 교정 범위에만 적용된다.
2. 직전 승인 계획 SHA-256 `dc0cd4b8c2436bfb33ca14c6a9bf37156b4a3a2b2621a563eb85c08fb99e4f90`·plan commit `ebe2765face9ba73a0e70ea7cf723a272127f000`·HEAD `c19ef3660602ed7f418af4846ad4ecf67906e2f3`·upstream `371e550cd8d5ee76696d7b4e166f4469646f7b7c`, 구·신 계획 내용·해시·승인 시각·SHA 대응·PTY current 실패를 canonical handoff에 보존한다. 이전 SHA는 과거 이력으로 유지한다.
3. writer 없음·index clean·현재 14개 WIP 경로/바이트/삭제 상태와 백업 patch SHA를 확인한다. PTY 파일은 아직 미수정임을 확인한다. 승인 계획 변경과 WIP를 구분하며 원 commit ancestry·unpublished·unshared 선형 이력·소유권을 재확인한다.
4. 작업 트리와 실제 index는 그대로 두고 대체 임시 Git index로 amended plan 및 별도 replayed T1 commit을 구성한다. committed tree만 기반으로 사용하고 WIP를 commit tree에 넣지 않는다. T1 구현 내용·순서·작업 경계와 복구 가능한 이전 commit/tree를 보존한다. 별도 문서·fixup commit을 만들지 않는다.
5. 새 tree·commit을 확인한 뒤 예상 이전 HEAD를 조건으로 local branch ref를 CAS 갱신한다. 값이 달라지면 중단하고 자동 재시도하지 않는다.
6. `git read-tree`로 replayed T1을 실제 index에 반영하되 작업 트리 갱신 옵션은 사용하지 않는다. WIP를 checkout·reset·역적용·재적용하지 않는다.
7. 새 HEAD/계획 해시·구신 SHA 대응·T1 내용·index clean·기존 14개 WIP 경로와 작업 트리 바이트/삭제 상태를 검증한다. 같은 방식으로 만든 T2 WIP patch SHA는 백업과 정확히 같아야 한다. 새 상태·유효한 기존 증거·실패·남은 검사·소유권을 fresh Implementer에게 전달한다.

공유 여부 불명, merge, 예상 밖 추가 상태, patch/경로/index 불일치, 임시 tree 충돌·CAS/index 반영 실패는 중단 조건이다. 부분 완료의 ref·HEAD·index·작업 트리와 완료 단계를 보고한다. 자동 복구·force push·fallback 문서 commit·WIP 폐기로 우회하지 않으며 Orchestrator 해결 후 영향받은 게이트를 재검증.

## 최종 전체 검증

T2의 필수 QA·인수·구현 커밋 후 **독립 Reviewer 한 명이 최종 전체 변경을 한 번 검토**한다. T1 과거 검토는 이를 대체하지 않는다. Reviewer는 T2 인수의 선행 조건이 아니다.

범위는 보존된 T1과 T2 전체 변경, F1–F7, Review UI·버튼·API·hint·확인 계약 제거 완결성, 일반 선택 가시성·terminal gate/resize/page Enter·PTY fixture 수정·Settings·입력 보존, Back·Escape·단일 실행, Workflow TUI 제거·내부 기능 보존, package·installer·manifest·테스트·baseline 분류·WIP/T1 보존이다.

최종 발견은 **Implementer 수정 → Reviewer 재검토**로 해결한다. 이 단계에서는 QA를 재배정하지 않으며 영향받은 필수 검증은 유지한다. 미해결 검증·발견이 없을 때 Orchestrator가 전체 완료를 판단한다.

## 자체 검토

- **요구사항:** F1–F4를 보존하고 F5–F7을 T2 구현·검증에 연결했다.
- **제거 완결성:** 구체적인 Review 함수·반환 API·호출·화면·액션·hint·확인 옵션·반환 계약·경고와 전용 테스트를 명시했다.
- **소유권:** terminal 두 파일의 generic Enter gate·관련 회귀만 추가했다. 파싱·signals·busy·disposal·내부 workflow는 변경하지 않는다.
- **보존:** Settings의 기존 `'', 'Apply', 'Back'`, 입력, Version Upgrade, 일반 page·결과·오류·가시성 검증을 보호한다.
- **의존성·이력:** `T1 → T2`, T1 별도 커밋·과거 증거를 유지한다.
- **검증:** RED/GREEN·PTY·내부 기능·package·required payload·manifest·전체 suite·fresh QA를 인수 조건에 연결했다.
- **baseline:** 이전 1006과 T1 1024 total을 구분하고 이름·진단 비교를 요구한다.
- **실행 경계:** fixture ownership 승인 완료·plan/T1 amendment 진행 중·T2 미완료를 명시했다. 임시 index·CAS·작업 트리 갱신 없는 read-tree로 WIP를 그대로 보존하고 전후 patch SHA·경로·index를 확인한다. T2 인수·커밋과 최종 독립 Review를 유지한다.
- **미해결 제품 결정:** 없음. 공유 여부와 amendment 이후 상태 확인은 Orchestrator의 실행 준비 게이트다.

---
