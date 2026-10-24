# ARC TUI 흐름 개선 계획

> ARC 역할 배정·handoff·의존성에 따른 조정·위험에 비례한 검증을 따른다. Implementer는 수정하고, fresh QA는 검증하며, Orchestrator만 수용·Git 작업을 수행한다. 체크박스는 진행 기록이며 별도 커밋 단위가 아니다.

**날짜:** 2026-10-25
**문서 경로:** `/Users/yunho/Desktop/project/arc/docs/superpowers/plans/2026-10-25-tui-install-update-uninstall.md`
**상태:** 사용자 승인 완료 (2026-10-25). 구현은 아래 handoff 절차에 따라 진행한다.

**목표:** 설치와 preset의 명시적 실행 흐름, 조건부 버전 업그레이드, 선택한 harness 제거 후 검증된 전역 CLI 제거를 제공한다.

**구조:** TUI는 탐색·초안 편집·실행 선택을 담당한다. management는 대상·버전·상태를 준비하고 재검증한다. npm helper는 검증된 패키지 작업을, 기존 installer 트랜잭션은 harness 변경을 수행한다. 연결된 변경을 하나의 구현 작업으로 묶는다.

**기술:** Node.js 22+, JavaScript ESM, `node:test`, 기존 PTY 도구, 격리된 npm/registry fixture, safe-fs.

**설계 근거:** 현재 승인된 bounded 설계와 아래 사용자 수정 사항이다. 별도 spec은 생략한다. 과거 `docs/superpowers/specs/2026-10-24-arc-tui-ux-design.md`, `docs/superpowers/plans/2026-10-24-arc-tui-ux.md`는 참고 자료이며, 충돌 시 이번 사용자 요구가 우선한다.

## 대상과 승인 경계

- 저장소: `/Users/yunho/Desktop/project/arc`
- Git common directory: `/Users/yunho/Desktop/project/arc/.git`
- branch: `feat/tui-install-update-uninstall`
- 기준 HEAD: `1189cd2c16f29cdc1c27a9a6ba437042def61b9c`
- 사용자 승인 직전 확인한 작업 트리에는 이 계획 파일만 미추적 상태였고, 구현 변경은 없었다.
- 사용자는 2026-10-25에 이 계획을 승인했다. Orchestrator는 이 계획만 docs commit으로 확정한 뒤 구현 handoff에 실제 HEAD/status를 기록한다.
- 이 task에서는 cooperative workflow를 초기화하거나 기존 runtime state를 조회하지 않았다. spec 생략 경로에는 cooperative spec+plan mode를 사용하지 않으며, 도구 제약으로 새 spec 의무를 만들지 않는다.

## 공통 제약

- 계획 제목·설명과 구현 커밋 설명은 한국어로 작성한다.
- 제품 UI는 영어를 유지한다. **`README.md`와 `docs/harness-operation.md`의 사용자 대상 설명은 간결하고 명확한 영어로 작성한다.**
- 기존 옵션·검증·Both 공통값 명시 선택·다른 설정·사용자 파일·선택하지 않은 harness를 보존한다.
- 설치·preset 적용·버전 업그레이드의 검토/확인 화면을 제거한다. 검증·`Working`·결과·오류는 유지한다.
- Uninstall의 대상·전역 지침 선택과 검토/Edit/Cancel은 유지하고 CLI 제거 설명을 반영한다.
- 검증된 숫자 `major.minor.patch`를 숫자로 비교한다. 표시한 버전에 실행을 고정하고 실행 중 latest를 다시 조회하지 않는다.
- 변경 전 npm context·패키지 identity·설치 상태를 재검증한다. 검증된 npm에 인수 배열을 전달하며 shell을 사용하지 않는다.
- 제거 대상은 검증된 전역 `@yunhozz/arc`뿐이다. 다른 전역 패키지와 공유 npx cache를 보존한다.
- 파괴적 테스트는 격리된 home·npm prefix·registry fixture에서만 수행한다.
- 의존성 추가·공개 CLI 명령 추가·policy 변경·무관한 정리는 제외한다.

## 수용 기준

| ID | 동작 |
|---|---|
| C1 | 홈 순서는 정확히 `Install / Update`, `Change Preset`, `Check Version`, `Uninstall`, `Exit`다. Configure를 제거한다. |
| C2 | 플랫폼과 기존 옵션 선택을 유지한다. 설정 마지막에 선택 불가능한 빈 줄 하나와 선택 가능한 `Execute`를 둔다. `Execute`의 Enter로 준비·검증 후 한 번 실행한다. |
| C3 | 대상·preset 선택을 유지한다. preset 선택의 Enter는 초안만 수정한다. 이어 설정 화면에서 맨 아래 `Apply` 바로 위에 선택 불가능한 빈 줄 하나를 표시하고 기본 포커스를 `Apply`에 둔다. `Apply`의 Enter만 준비·실행한다. preset을 다시 편집해도 같은 흐름을 따른다. |
| C4 | `Current version`과 `Latest version`을 표시한다. 최신이 더 높을 때만 포인터로 선택 가능한 `Version Upgrade` 행을 생성한다. 선택 상태의 Enter로 표시한 정확한 버전을 적용한다. 동률·낮은 버전·조회 실패에는 업그레이드하지 않는다. Escape는 홈 복귀다. |
| C5 | 선택한 모든 harness 제거 성공 후 전역 CLI를 제거한다. harness 실패·중단 시 CLI 제거를 건너뛴다. 부분 완료·실패를 구분하고, npx 실행에서도 선택하지 않은 harness와 공유 cache를 보존한다. |

## 중점 검증

T1 테스트와 최종 Reviewer는 다음을 확인한다.

1. 빈 줄·포인터·스크롤·resize가 어긋나 빈 줄을 선택하거나 가려진 행동을 실행하지 않는가.
2. preset 선택은 실행 0회이며, Apply 기본 포커스와 명시적 실행을 구분하고 Both의 다른 설정을 보존하는가.
3. registry/context/state 변경에도 표시 버전 고정과 재검증을 유지하는가.
4. 전역 패키지 부재와 identity 오류·symlink·대체 패키지를 구분하는가.
5. 부분 제거·중단·자기 CLI 제거에서 정확한 결과와 terminal 복원을 유지하는가.

## T1 — TUI 행동과 패키지 수명 통합

**목표·범위:** C1–C5를 하나의 검증 가능한 결과로 구현한다.

**소유:** fresh Implementer가 아래 파일을 수정한다. QA·Reviewer는 수정하지 않는다. Orchestrator가 통합·수용·stage·commit을 담당한다.

**선행 조건:** 이 개정 계획의 승인·문서 커밋, 실제 branch/HEAD/status·소유권·보존 범위·테스트 환경을 확인한 handoff. 선행 구현 작업은 없다.

### 대상 파일

모든 경로는 `/Users/yunho/Desktop/project/arc` 기준이다.

| 파일 | 책임 |
|---|---|
| `lib/tui/app.mjs`, `lib/tui/setup.mjs`, `lib/tui/render.mjs` | 홈·빈 줄·Execute/Apply·포커스·버전 선택·결과·세션 |
| `lib/management/update.mjs`, `lib/management/operations.mjs` | 버전 준비/고정/재검증·제거 순서·결과 결합 |
| `lib/npm/context.mjs`, `lib/npm/upgrade.mjs` | 전역 ARC 검증·정확한 버전의 npx 실행 |
| 신규 `lib/npm/uninstall.mjs` | 검증된 전역 제거·사후 확인 |
| `tests/node/tui-app.test.mjs`, `tests/node/tui-setup.test.mjs`, `tests/node/tui-app-pty.test.mjs` | 화면·초안/적용·포커스·PTY 수명 |
| `tests/node/management-update.test.mjs`, `tests/node/management-operations.test.mjs` | management 계약·실패 |
| `tests/node/npm-upgrade-consumer.test.mjs`, 신규 `tests/node/npm-uninstall-consumer.test.mjs` | 격리된 생성 패키지 업그레이드·제거 |
| `README.md`, `docs/harness-operation.md`, `MANIFEST.sha256` | 영어 사용자 설명·생성 해시 |

`lib/tui/terminal.mjs`, `lib/npm/process.mjs`, `lib/installer/uninstall.mjs`는 수정 없이 재사용한다. 이 파일이나 fixture 수정이 필요하면 정확한 경로·근거·영향을 Orchestrator에 보고하고 소유 범위를 먼저 갱신한다.

### 인터페이스

- `runSetup({ui,statuses,draft,kind,prepare}) -> Promise<prepared|null>` 유지. 설치는 Execute 이후, preset은 Apply 이후에만 준비한다. 두 경로 모두 review를 호출하지 않는다.
- `ui.menu(title,rows,options) -> Promise<number|null>` 유지. `rows`는 선택 항목만 포함한다. `options.separatorBefore`로 표시 전용 빈 줄을 삽입하며 탐색·반환 인덱스에서 제외한다. `options.selected`로 Apply를 기본 선택한다. 빈 행동 목록은 포인터 없이 Enter를 무시하고 Escape/interrupt/EOF는 유지한다.
- `prepareUpdate(context)`는 `currentVersion`, `latestVersion`, `canUpgrade`, 검증된 `npmContext`를 추가한다. `executeUpdate(context,prepared)`는 준비 버전을 사용하며 실행 불가·검증 불일치 시 변경하지 않는다.
- `inspectGlobalArc({context,env,cwd,runNpm})`는 검증된 `{kind:'global',npmCli,prefix,packageRoot}` 또는 실제 `{kind:'absent'}`를 반환한다. 검증 실패를 부재로 바꾸지 않는다.
- `uninstallGlobal({context,env,cwd,signal,runNpm})`는 `packageStatus: removed|absent|failed`와 npm 출력·오류를 반환한다.
- `runNpxUpgrade({context,expectedVersion,expectedStateToken,env,cwd,signal,runNpm})`는 자식의 `code`, `signal`, `stdout`, `stderr`를 반환한다.
- Uninstall은 harness `results`와 함께 `cli.status: removed|absent|skipped|failed`, 정확한 종료 코드·중단·오류·`exitSession`을 반환한다.

### 실행 순서

- [ ] **1. UI 실패 테스트 → 최소 구현 → 통과를 확인한다.**

  C1 라벨·순서, 설치 마지막 `Execute`, Execute/Apply 바로 위 빈 줄 하나의 비선택성, Execute 이전 실행 0회, preset 선택 직후 실행 0회, 선택값 표시·Apply 기본 포커스, Apply 이후 실행 1회, 검토 호출 0회를 검증한다. chooser 취소·Both 보존·Escape·EOF·중단·연속 Enter도 포함한다.

  ```bash
  node --test tests/node/tui-setup.test.mjs tests/node/tui-app.test.mjs
  ```

  기존 동작 때문에 실패함을 기록한 뒤 구현한다. 표시 행과 행동 인덱스를 분리하고 viewport에도 빈 줄을 반영한다. 가려진 실행 항목은 실행하지 않는다. 같은 명령으로 통과를 확인한다. import·환경 오류는 TDD 증거로 사용하지 않는다.

- [ ] **2. 버전 실패 테스트 → 준비·고정 실행 구현 → 통과를 확인한다.**

  `1.10.0 > 1.9.0`, 실제 선택 가능한 Version Upgrade, 동률/낮은 버전의 행·포인터 부재, 행동 없는 Enter 무시, 조회 실패, 표시 버전 고정, context/state 변경 시 mutation 0회를 검증한다. 기존 prepare 테스트는 “조회 가능·mutation 없음”으로 바꾼다.

  ```bash
  node --test tests/node/management-update.test.mjs tests/node/tui-app.test.mjs
  ```

  prepare에서 latest를 조회하고 execute 전에 재검증한다. global은 고정 버전 교체·자식 실행을 재사용한다.

  npx는 검증된 npm으로 정확한 `@yunhozz/arc@<expectedVersion>`를 실행한다. 고정 bootstrap은 실행 파일의 실제 package root·identity·버전·npx context를 검증하고 해당 패키지의 기존 management runtime을 사용한다. 상태 토큰 재검증 후 해당 payload를 적용한다. global 전용 private child의 npx 지원을 가정하지 않으며, 필요한 API가 없으면 harness 변경 전에 실패한다.

- [ ] **3. 생성 패키지 업그레이드 검증을 갱신한다.**

  구 npx payload로 되돌리는 assertion을 표시 버전 적용으로 바꾼다. 준비 후 registry 변경·잘못된 npx identity/API·설정 보존·global 교체 후 harness 실패·복구를 검증한다. 동률에서 업그레이드 행은 없으며 재구성은 Install / Update로 가능해야 한다.

  ```bash
  node --test tests/node/management-update.test.mjs tests/node/npm-upgrade-consumer.test.mjs tests/node/tui-app.test.mjs
  ```

- [ ] **4. 제거 실패 테스트 → 순차 제거 구현 → 통과를 확인한다.**

  모든 harness 성공 후 CLI 제거 1회, 실패/cleanup 오류/중단 시 제거 0회, global/npx 진입, 실제 부재와 identity 오류 구별, 준비 후 대상 변경, 부분 결과를 검증한다. 미선택 harness·사용자 파일·다른 전역 패키지·npx cache sentinel 보존을 확인한다.

  ```bash
  node --test tests/node/management-operations.test.mjs tests/node/npm-uninstall-consumer.test.mjs
  ```

  prepare에서 전역 identity를 검증·보존하고 검증 실패는 harness 변경 전에 차단한다. harness 성공 후 다시 검증하여 다음 인수로 npm을 실행한다.

  ```js
  ['uninstall', '--global', '@yunhozz/arc',
   '--prefix', verifiedPrefix, '--ignore-scripts']
  ```

  사후 부재를 확인하며 직접 파일/cache를 삭제하지 않는다. CLI 제거 시작 후 성공·실패·중단 모두 결과를 남기고 세션을 종료한다. Uninstall 검토 설명을 갱신하되 Edit/Cancel은 유지한다. 같은 테스트로 통과를 확인한다.

- [ ] **5. PTY 회귀를 검증한다.**

  홈 탐색·Execute·빈 줄 건너뛰기·preset 선택 시 무실행·Apply 기본 포커스와 명시 실행·Version Upgrade·빈 행동 목록·Uninstall Edit/Cancel을 검사한다. 작은 viewport/resize·연속 Enter·Ctrl+C·EOF/signal·terminal 복원도 포함한다.

  ```bash
  node --test tests/node/tui-app-pty.test.mjs
  ```

  필수 PTY skip은 미해결 증거다. 도구가 없으면 환경을 임의 변경하지 않고 보고한다.

- [ ] **6. 영어 문서·manifest를 갱신하고 필수 검사를 수행한다.**

  README/harness-operation은 간결하고 명확한 영어로 Execute, 초안 편집과 Apply, 조건부 업그레이드, global/npx, 제거 순서·부분 결과를 설명한다. 현재 사용자 문서의 낡은 설명을 제거하고 과거 설계 문서는 보존한다.

  ```bash
  node scripts/update-manifest.mjs
  npm test
  npm run check:manifest
  npm run check:role-policy
  ```

  명령·종료 코드·실패/skip·영향 범위를 반환한다. 검사를 완화하거나 실제 사용자 설치를 시험 대상으로 삼지 않는다.

- [ ] **7. Fresh QA 검증 후 Orchestrator가 수용·커밋한다.**

  QA는 집중 테스트·PTY·npm 소비자 테스트·전체 필수 검사로 C1–C5와 중점 검증을 독립 확인한다. 화면/포커스·실행 횟수·고정 버전 인수·제거 순서·보존 sentinel 증거를 포함한다.

  QA 실패는 Implementer 수정 → 영향받는 QA 재검증으로 해결한다. Orchestrator는 필수 증거·범위/보존·문서/manifest 일치를 확인하고 T1을 수용한 뒤 하나의 구현 커밋을 만든다.

  ```text
  feat(tui): 설치·버전 확인·제거 흐름 개선
  ```

  Implementer/QA는 stage·commit하지 않는다. 최종 Reviewer는 T1 수용의 선행 조건이 아니다.

### 보류 조건

대상/status/소유권 불일치, 미소유 파일 변경 필요, 버전/context/state 검증 불가, 전역 identity 모호성, 잘못된 부분 제거 처리, 필수 검사 실패/skip이면 영향받는 작업을 보류하고 Orchestrator에 보고한다. 검증 실패를 부재로 처리하지 않는다.

Orchestrator는 의존성이 영향을 받지 않는 승인된 독립 작업만 진행하도록 해제할 수 있다. 필수 증거가 미해결이면 T1 수용은 보류한다.

## 최종 전체 검증

T1의 QA·수용·커밋 후 진행한다.

- [ ] 독립 Reviewer가 최종 전체 diff를 C1–C5, 초안/적용 구분, 자기 CLI 제거, npx 버전/identity, 부분 결과·보존·문서·manifest와 대조한다.
- [ ] 최종 finding은 Implementer → Reviewer 재확인으로 해결한다. 이 단계에서는 QA를 재배정하지 않는다. 수정에 필요한 집중 검사는 수행한다.
- [ ] Orchestrator가 finding 해소·최종 범위/Git 상태·필요 검사·manifest를 확인해 전체 완료를 판단한다.

새 변경·실패·미해결 우려 없이 전체 테스트를 반복하지 않는다. push·배포·공개는 포함하지 않는다.

## 가정과 자체 검토

- `Latest < Current`도 Version Upgrade를 생략한다는 다운그레이드 방지 가정을 유지했다.
- 설치 마지막 행동은 `Execute`, preset 선택은 초안 수정, 기본 포커스 `Apply`의 Enter만 실행임을 반영했다.
- 사용자 대상 README/harness-operation 설명은 영어, 이 계획과 커밋 설명은 한국어로 구분했다.
- C1–C5·소유권·의존성·TDD·QA·보류·커밋·최종 Reviewer를 하나의 T1에 연결했다.
- 추가 제품 결정은 없다. 새 범위·호환성 문제는 보류 조건으로 처리한다.
- **증거 한계:** 사용자는 2026-10-25에 계획을 승인했다. 승인 전 구현·테스트·검사는 실행하지 않았다.
