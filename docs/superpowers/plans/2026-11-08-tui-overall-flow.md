# ARC TUI 전체 흐름 개선 구현 계획

> **실행 역할** — Orchestrator가 승인된 작업을 한 명의 Implementer에게 배정하고, QA와 Reviewer는 읽기 전용으로 검토합니다.

**목표** — 설정 제거에 명시적 확인을 추가하고, 작업 중 EOF 취소·작은 화면 Custom 편집·좁은 홈의 버전 표기를 개선합니다.

**구조** — 기존 메뉴, `AbortController`, management transaction 및 renderer를 재사용합니다. 확인은 `runTui`, busy EOF는 `createTuiInterface`, Custom의 압축 본문은 `editCustomPreset`, 버전 fallback은 `renderScreen`에 연결합니다.

**기술** — Node.js ESM, 기존 ARC TUI 세션/메뉴/렌더러와 `AbortSignal`. 신규 의존성 없음.

**승인 설계** — `docs/superpowers/specs/2026-11-08-tui-overall-flow-design.md`의 U1–U6. 사용자 설계 승인 회신 `call_85485f2dd6df49c4ac3d6f49123a8de7`.

## 대상과 제약

- 실행 대상은 `/Users/yunho/.codex/worktrees/tui-preset-version-flow/arc`, branch `feat/tui-preset-version-flow`입니다. 설계 승인 기준 HEAD는 `453596ed203f38242ded68ccce08f2781ad92fd8`이며 시작 시 작업 트리는 clean이었습니다. 설계 문서는 승인 뒤 저장된 미추적 파일입니다. 이 계획을 저장·검토하고 사용자 계획 승인을 받기 전에는 구현을 시작하지 않습니다.
- 계획 승인 후 설계와 계획을 집중된 `docs` 커밋으로 기록하고, target/status와 파일 소유권을 재확인한 뒤 T1에 인계합니다.
- 제품 TUI는 영어로 유지합니다. 홈의 `Avaliable`/`Not Avaliable`, 업그레이드 가능 `Check Version`의 `Upgrade`/`Back`, 하위 화면 `Esc` → Home, 메뉴 `Back` → 이전 단계, 홈 `Esc` → 종료를 유지합니다.
- U3 보완 승인: 사용자는 `call_42789ac91f654cd69e415ac612a440d5`에서 압축 Custom 화면의 상세 페이지 이동을 승인했습니다. 상세는 모든 모델·effort 문자열을 페이지로 나누어 표시하고 `Left`/`Right`로 이동합니다. 첫 페이지에서 Left, 마지막 페이지에서 Right는 현재 페이지를 유지합니다. `Up`/`Down` 후보 이동, `Enter`/`Back` 선택은 유지하고, 후보 변경 시 상세는 첫 페이지로 돌아갑니다.
- Manifest 보완 승인: 사용자는 `call_6417d9010d3f4340a9ef8dc3d840ae51`에서 `MANIFEST.sha256`의 `lib/tui/app.mjs`, `custom-preset.mjs`, `render.mjs`, `setup.mjs` 네 hash를 현재 파일에 맞게 갱신하는 것을 승인했습니다. 기준 커밋에도 이 불일치가 있었으며, 현재 Install 준비는 payload 검증에서 거부됩니다.
- 관리·installer 검증/transaction 계약, global/npx 동작, 설치 대상·사용자 파일 보존, 공개 CLI 문법, 자동 workflow는 변경하지 않습니다.
- 테스트를 추가·수정·실행하지 않고 TUI나 관리 작업도 실행하지 않습니다. QA는 소스 수준 검토와 `git diff --check`만 수행합니다. 기존 테스트 파일은 기대값 차이를 읽기 전용으로 참고하며 결과를 주장하지 않습니다.
- 깊이는 **Bounded, 계획 필요**입니다. busy 취소·EOF·terminal 복구의 순서, 작은 화면의 선택 인덱스와 상세 페이지, 제거 실행 조건을 묶어 독립 QA와 전체 Reviewer를 배정합니다. 계획 작성 당시 `lib/tui`가 `MANIFEST.sha256`에 없다고 판단한 것은 잘못이었습니다. manifest는 `app.mjs`, `custom-preset.mjs`, `render.mjs`, `setup.mjs`를 포함하고 네 등록 hash가 실제와 달랐습니다. 사용자가 네 항목의 현재 hash 갱신을 승인했으므로, manifest와 계획 문서를 범위에 포함합니다. `setup.mjs` 불일치는 작업 기준 커밋부터 있었습니다.

## 작업 T1 — 전체 흐름 보완

**목표·의존성** — 승인 설계 U1–U7을 세 TUI 모듈에서 구현하고 payload manifest의 stale hash를 고칩니다. 선행 코드는 없으며 승인된 설계·계획, 확인된 target, 파일 소유권을 요구합니다. 동일 파일 `app.mjs`의 확인·busy 분기와 manifest 갱신을 한 Implementer가 맡아 계약 충돌을 줄입니다.

| 파일 | 소유 범위 |
|---|---|
| `lib/tui/app.mjs` | U1의 설정 제거 확인/복귀, U2의 busy 입력 종료 구독·중단·정리, U3 압축 선택기에서만 사용하는 선택적 Left/Right callback |
| `lib/tui/custom-preset.mjs` | U3의 Custom 역할 압축 본문, 초점·선택, 전체 model/effort 상세 페이지 및 viewport 연계 |
| `lib/tui/render.mjs` | U4의 로고 옆 버전과 좁은 폭 대체 행 |
| `lib/tui/terminal.mjs` | 수정하지 않습니다. 기존 `onEnd`의 즉시 EOF 전달과 terminal 복구를 유지합니다. |
| `lib/tui/setup.mjs` | 수정하지 않습니다. U5의 기존 프리셋 확인 순서·5행 최소 공간을 유지하고 읽기 전용으로 대조합니다. |
| `MANIFEST.sha256` | U7의 승인된 TUI 네 파일 hash 네 줄만 현재 payload와 일치하도록 갱신합니다. |

### 구현 단계

- [x] **U1 — 설정 제거 확인.** `Uninstall → Settings → Codex/Claude`에서 `Remove ARC settings for <platform>?` 확인을 표시합니다. 액션 순서는 `Continue`, `Back`, 초기 초점은 `Back`입니다. Back은 선택했던 target에 초점을 둔 목록으로 복귀합니다. Continue만 해당 target과 `removeCli:false`로 기존 `prepareOperation` 및 `executeOperation` 경로를 사용합니다. `Remove CLI` 분기는 유지합니다.
- [x] **U2 — busy input 종료 취소.** 작업 시작 전에 input `end`·`close`를 기존 AbortController에 idempotent하게 연결합니다. `terminal.mjs`의 기존 EOF listener보다 앞서 취소를 요청하도록 busy 리스너를 prepend하고, already-ended/destroyed 입력이면 작업을 시작하지 않고 기존 interrupt 결과로 빠집니다. terminal의 onEnd는 즉시 raw mode와 화면을 복구합니다. 관리 작업 Promise가 신호를 처리하고 transaction/child-process의 기존 결과·복구 경로를 마칠 때까지 기다린 뒤 `finally`에서 busy가 소유한 data/end/close 리스너를 해제합니다. 메뉴 대기 중 EOF는 기존 동작을 유지합니다.
- [x] **U3 — Custom 압축 화면 및 전체 상세 페이지.** 다이어그램이 지정된 크기에 맞지 않으면 compact role summary를 사용합니다. 40×16 지원 크기에서 다섯 role과 Apply/Back을 보이며, 선택 marker를 논리 액션 인덱스에 맞춥니다. 모델/effort 후보는 공간에 맞춰 wrap/truncate해도 되지만, 선택 상세는 전체 원문을 wrap한 페이지들로 나누어 모두 접근 가능하게 합니다. 압축 화면에 `←/→: Details p/n`을 표시하고 Left/Right로 상세를 이동합니다. Up/Down은 후보 이동, Enter는 적용, Back은 기존 복귀 동작을 유지합니다. 후보가 바뀌면 상세 첫 페이지를 표시합니다. 큰 화면의 기존 다이어그램, catalog 검증, Back 취소, 미적용 역할 draft 의미를 유지합니다. 지원 크기 아래에서는 필요한 공간 안내와 선택 차단을 유지합니다.
- [x] **U4 — 홈 version fallback.** 버전 텍스트 전체가 로고 마지막 행에 들어가면 기존 `ver <version>` 배치를 사용합니다. 너비가 부족하면 기존 구분선 행을 버전 행으로 대체합니다. 헤더는 양쪽 모두 6행으로 유지해 `app.mjs`의 홈 menu capacity를 변경하지 않습니다.
- [x] **U5 — preset confirmation 유지.** 제목, 후보 프리뷰, `Are you sure?`, 빈 줄 하나, `Apply`, `Back` 순서를 유지합니다. 9행 미만에서 footer hint를 숨기는 현재 선택을 유지하며, 5–8행 경계에서 두 액션 모두 선택 가능함을 소스 계산으로 확인합니다. 1–4행 동시 표시를 새로 지원한다고 약속하지 않습니다.
- [x] **U6 — 보존·범위 대조.** 기존 Esc/Back 의미, 정확한 라벨, 선택/포커스, Apply 검증과 작업 준비/실행 경로, transaction 복구, terminal 즉시 복구를 확인합니다. 변경은 승인된 소스 파일과 manifest 네 hash에 한정하고 기존 관리/installer 계약은 그대로 둡니다.
- [x] **U7 — payload manifest hash 복구.** `MANIFEST.sha256`의 `lib/tui/app.mjs`, `custom-preset.mjs`, `render.mjs`, `setup.mjs` hash를 현재 파일 bytes 기준 SHA-256으로 갱신합니다. 네 항목 외에는 manifest를 변경하지 않습니다. Install/installer를 실행하지 않고 정적 비교로 네 hash와 전체 manifest 일치를 확인합니다.

### viewport 및 선택 계산 확인

- `renderScreen`은 마지막 열을 비웁니다. 40 input columns에서는 39셀을 사용할 수 있으며, 선택 접두 2셀 뒤 role summary 행은 최대 37셀로 맞춥니다.
- 16행에서 title 1행과 기본 footer 3행을 빼면 본문 최대 12행입니다. 압축 Custom 본문은 role 5행 + 구분 행 1행 + Apply/Back 2행 = 8행으로 구성해 heading과 함께 표시합니다. 모델/effort 선택은 전체 상세를 행 용량만큼 나누고 페이지 지시 행과 위치 표시 행이 필요하면 해당 행을 포함해 후보 선택과 Back 공간을 예약합니다. 상세 페이지에는 원문이 모두 나타나야 하며 화면 예산을 넘는 중간 생략으로 식별 정보가 사라져서는 안 됩니다. 기존 required-space guard는 지원 크기 아래에서 선택을 차단하고 필요한 크기를 안내합니다.
- 전체 Custom 도식은 기존 최소 높이 24행 이상에서 유지합니다. 지원된 작은 화면에서는 compact body가 role selection, Apply, Back을 모두 선택 가능하게 하며 resize 후 초점/미적용 편집 값을 보존합니다.
- Performance preset 확인은 충분한 폭(앞선 소스 계산 기준 19열 이상)에서 5행을 사용할 때 title 1 + `Are you sure?` + blank + Apply + Back = 5행입니다. 9행 미만 footer와 viewport position을 숨기며 selection guard가 두 액션을 막지 않는지 확인합니다.

### source QA와 최종 Reviewer

- [x] **Fresh QA**가 최신 diff를 기준으로 U1–U7을 source-only로 확인하고 파일/줄, status, pass/fail 및 한계를 기록합니다. U3에서는 40×16에서 중앙만 다른 긴 ID를 포함해 전체 model/effort 상세를 Left/Right 페이지로 모두 볼 수 있는지, Up/Down 후보 이동 및 Back/Enter 인덱스가 그대로인지, 새 callback이 다른 메뉴에 영향을 주지 않는지 확인합니다. U7에서는 전체 manifest의 항목 누락·추가·불일치 여부를 읽기 전용 hash 비교로 확인합니다. `git diff --check`를 실행합니다. 테스트 코드/실행, PTY, 실제 화면 및 관리 작업 실행은 금지합니다.
- [x] U1은 `Back`, `Continue`, target 고정, `removeCli:false`·prepare/execute 연결을 확인합니다. U2는 input이 이미 종료된 경우, end/close 순서·중복, 취소 전달, terminal 즉시 복구, transaction Promise 완료, 리스너 정리와 대기 중 EOF를 추적합니다.
- [x] U3는 40×16 role/model/effort/Apply/Back 표시 및 선택 인덱스, 전체 상세의 페이지 수·경계·후보 전환 초기화, 중앙만 다른 긴 값 전체 접근, catalog 검증/취소, resize 초점·초안 보존을 정적으로 대조합니다. U4는 inline-fit 경계, fallback 행, 헤더 6행 불변 및 메뉴 용량을 계산합니다. U5는 5–8행의 action 선택 guard를 계산합니다. U7은 SHA-256 전체 비교에서 mismatch와 누락이 0개인지 확인합니다.
- [x] 구현은 `28ecb54`, U2/U3 보완은 `b085454`, manifest 복구는 `873f6bf`로 각각 집중 커밋했습니다. Fresh QA와 독립 Reviewer는 수정사항을 읽기 전용 검토했으며 추가 findings가 없습니다.

## 수용 한계와 위험

EOF/close는 관리 작업을 취소하지만 이미 시작된 외부 npm/CLI 작업의 실제 종료 시점과 파일 복구 완료는 실행하지 않고 증명할 수 없습니다. 실제 40×16 키 조작, 상세 paging, resize 후 값 유지, 버전 fallback 출력, Uninstall confirmation 역시 실제 TUI 실행 없이 검증되지 않습니다. 이 실행 증거가 필수 수용 기준으로 남으면 해당 기준의 수용을 보류합니다.

기존 테스트에는 현재 source와 다른 라벨·전환 기대가 있습니다. 이번 plan에서는 테스트를 편집하거나 실행하지 않으며, 결과를 추정하지 않습니다. 따라서 관련 test 기대 불일치는 완료 보고에 미해결 제한으로 포함합니다.

---

### Orchestrator 검토 기록

- Planner 초안의 T2가 terminal restoration을 관리 작업 종료까지 미루도록 기술되어 승인 U2와 어긋나, 계획에서 바로잡았습니다. busy의 prepend listener가 종료를 먼저 abort하고 기존 terminal listener는 즉시 dispose하며, 관리 작업 Promise가 끝난 뒤 busy listener만 정리합니다.
- Planner의 40×16 제안을 화면 행/열 예산에 연결하고, U5의 5행 한계와 footer 숨김 선택을 명시했습니다.
- Reviewer가 40×16에서 임의 길이 모델 ID의 중간 차이가 압축 상세에서 숨을 수 있음을 지적했습니다. 사용자가 `call_42789ac91f654cd69e415ac612a440d5`로 상세 페이지 이동을 승인하여 U3를 갱신했습니다. 상세 원문은 페이지로 나누어 모두 확인하고 Left/Right 이동, Up/Down 후보 이동을 분리합니다.
- Reviewer가 `MANIFEST.sha256`에 `lib/tui/app.mjs`, `custom-preset.mjs`, `render.mjs`, `setup.mjs`가 등록되어 있고 네 등록 hash가 실제와 다름을 발견했습니다. 이 불일치는 계획 작성 가정과 달랐고 기준 커밋에도 존재했습니다.
- 사용자가 `call_6417d9010d3f4340a9ef8dc3d840ae51`로 정확히 네 hash의 갱신을 승인했습니다. U7을 추가해 manifest만 수정하고, 전체 정적 hash 일치 여부를 QA/Reviewer가 확인합니다.
- 전체 manifest 215개 항목을 파일 bytes와 비교한 결과 누락 및 hash 불일치가 0개입니다. manifest 변경 diff는 승인된 네 줄뿐이며, manifest 커밋은 `873f6bf`입니다. 실제 테스트, TUI, install/update/uninstall execution은 수행하지 않았습니다.
- 사용자 승인 전에 구현하지 않았으며, 기본 계획과 각 승인된 범위 보완은 문서/커밋으로 기록했습니다.
