# TUI 프리셋 미리보기 구현 계획 v3

> Planner는 초안만 반환한다. 이 문서는 환경 준비나 acceptance 변경을 실행할 권한이 아니다. **새 개별 사용자 승인 전에는 dependency 설치·native build·변경된 acceptance 기준을 적용하지 않는다.** Orchestrator가 문서 저장·승인·배정·acceptance·Git 작업을 담당한다.

## 1. 목표와 개정 이유

기존 preset preview 구현과 여섯 파일의 범위를 유지한다. 승인 worktree에 baseline과 비교 가능한 ignored 테스트 환경을 준비한 뒤 전체 suite를 재검증한다.

기존 v2는 전체 `npm test` exit 0을 요구하면서 dependency/native 환경 변경을 금지했다. 현재 worktree에는 `node_modules`와 `build/native`가 없으며, 같은 toolchain의 clean baseline에도 기존 실패 17개가 있다.

v3는 다음 변경의 개별 승인을 요청한다.

1. 승인 worktree의 ignored 환경을 lockfile과 기존 build script로 준비한다.
2. 모든 준비·검사·QA에 **Node 22.21.0/npm 10.9.4를 명시적으로 고정**한다.
3. A12를 전체 exit 0에서 **같은 toolchain과 dependency 구성의 clean baseline 대비 신규 실패 없음**으로 변경한다.

기존 실패와 전체 exit 1은 계속 공개한다. 기존 17개 non-TUI 실패의 수리는 포함하지 않는다.

**위험도: Significant.** 공용 menu와 환경 준비를 포함한다. 필수 fresh QA→Orchestrator acceptance→독립 최종 전체 Reviewer 순서를 적용한다.

## 2. 대상·승인 자료·현재 상태

- Workspace: `/Users/ma-24-007/.codex/worktrees/tui-preset-preview/arc`
- Branch: `feat/tui-preset-preview`
- 현재 HEAD: `e9d8ae2ecb0294fff72d17030d74b93c96ff099b`
- 현재 상태: 승인된 여섯 TUI 소스·테스트·manifest 파일이 unstaged.
- 문서: `/Users/ma-24-007/.codex/worktrees/tui-preset-preview/arc/docs/superpowers/plans/2026-10-27-tui-preset-preview.md`

Clean baseline:

- Workspace: `/Users/ma-24-007/Desktop/workspace/arc`
- Branch: `master`
- HEAD: `ef5358011108884f7babf284b4d2626508c11370`
- 테스트 후 Git clean.
- Baseline의 tracked 파일·환경은 변경하지 않는다.

승인 설계:

- Handoff: `/Users/ma-24-007/Desktop/workspace/arc/.git/arc/handoff/tui-preset-preview.md`
- 목업: `/Users/ma-24-007/.codex/visualizations/2026/10/27/01a17adb-3fb2-70d3-b980-c649779e5af0/.superpowers/brainstorm/99995-1793064687/content/preset-preview-v7.html`
- 목업 SHA-256: `f9d3fe47fe7e28fd05f5c099babb1713147281a74b282628435f518afcc8ca02`

Orchestrator가 기존 plan 문서와 plan commit amendment 흐름으로 v3를 반영한다. 별도 plan commit은 만들지 않는다. 기존 unstaged 구현은 보존한다.

## 3. 유지할 제품 요구사항

- 제목: `Performance preset`.
- Economy, Balanced, Smart, 공백 한 줄, Back 순서.
- Specialist 박스에는 role·model·`effort: <value>`만 표시.
- 허브는 정확히 `Orchestrator`, preset 모델·effort 없음.
- 상단 Scouter/Planner/Implementer, 중앙 허브, 하단 QA/Reviewer.
- 연결선은 분배·회수 관계이며 직렬 실행을 의미하지 않음.
- 제거된 `Preview only` 등 문구를 복원하지 않음.
- 커서 이동은 preview만 갱신하며 draft·prepare·execute는 불변.
- Enter는 draft 갱신 후 Settings로 복귀.
- 실제 변경 준비는 Settings의 별도 Apply.
- Back Enter는 선택 미확정 복귀, Esc는 Home.
- Install은 package 기본 설정, preset 변경은 installed status 설정.
- Validation/no-fallback/config 불변 유지.
- Terminal 복구·숨겨진 선택의 Enter 보호 유지.

새 runtime 파일·의존성 버전·`package.json`·lockfile·canonical 모델 변경은 없다.

## 4. 현재 검증 증거

### Worktree: 환경 준비 전

- Node `22.21.0`, npm `10.9.4`.
- `node_modules`, `build/native` 없음.
- 전체 suite: exit 1, **877 total / 844 pass / 23 fail / 10 skipped**.
- 로그: `/tmp/arc-tui-preset-preview-v2-qa-npm-test.log`
- SHA-256: `7b27f8afc0053d758bd07a208a8e642611155034070817e09604c92938f8963a`
- 실패: native index/binary 부재 20개, `smol-toml` 부재 1개, consumer 실패 2개.

### Clean baseline

- 같은 Node `22.21.0`, npm `10.9.4`.
- `node_modules`, `build/native` 존재.
- 전체 suite: exit 1, **1141 total / 1112 pass / 17 fail / 12 skipped**.
- 로그: `/tmp/arc-tui-preset-preview-v2-baseline-node22-npm-test.log`
- SHA-256: `8e92d9d520981a50b7e584041806b6ed851ae91df9499ff26423a9d8b51a7642`
- 같은 consumer 실패 두 개와 다른 실패 15개.

**Dependency parity 증거:** Orchestrator가 clean baseline에서 Node `v22.21.0`/npm `10.9.4`로 `npm ls --depth=0`을 실행했고 성공했다. 직접 dependency는 정확히 `node-gyp@11.5.0`, `smol-toml@1.9.1`이며 package-lock과 일치한다. 승인 worktree도 같은 lockfile 기반으로 이 구성을 준비하고 설치 후 확인한다.

이 증거는 직접 dependency 버전의 일치를 뒷받침한다. 환경 준비 후 native build 결과와 전체 test별 비교를 대신하지 않는다.

### 기능 검증

- Focused tests 69/69.
- PTY 25/25.
- Manifest·diff-check 통과.
- QA가 visual output 확인.

이전 증거는 해당 실행 상태의 증거로 보존한다. 실패 수만 비교하지 않고 환경 준비 후 test별 진단을 비교한다.

## 5. 파일·환경 범위

### 승인된 tracked 파일

| 파일 | 책임 |
|---|---|
| `lib/tui/setup.mjs` | 설정 공급·정규화·도식·chooser |
| `lib/tui/app.mjs` | 동적 info·설정 callback |
| `tests/node/tui-setup.test.mjs` | Source·값·draft/Apply |
| `tests/node/tui-app.test.mjs` | Menu·viewport·회귀 |
| `tests/node/tui-app-pty.test.mjs` | 정상 context/status fixture |
| `MANIFEST.sha256` | Protected source checksum |

### 새 승인 요청 환경

승인 worktree 내부만 허용한다.

- `node_modules/`
- `build/npm-cache/`
- `build/node-headers/`
- `build/native/`
- `native/build/`

환경 산출물은 ignored 상태로 유지하며 commit하지 않는다.

범위 밖:

- 기존 17개 non-TUI 실패 수리.
- Production fallback·timeout 증가·skip 추가.
- Node/npm·dependency·lockfile·build script·native source 변경.
- Baseline 환경 변경.
- 설치 lifecycle scripts 또는 임의 환경 복구.
- Push·merge·publish.

## 6. Toolchain 고정과 환경 사전 조건

기본 shell은 Node `26.0.0`/npm `12.0.2`를 가리킨다. 이 기본값을 사용하면 비교 증거가 무효다.

모든 dependency 설치·native build·focused/PTY/full tests·QA 실행과 baseline 재검증은 다음 경로를 PATH 맨 앞에 둔다.

```text
/Users/ma-24-007/.nvm/versions/node/v22.21.0/bin
```

사용할 executables:

```text
/Users/ma-24-007/.nvm/versions/node/v22.21.0/bin/node
/Users/ma-24-007/.nvm/versions/node/v22.21.0/bin/npm
```

절대 executable만 지정하고 child script PATH를 기본값에 맡기는 방식은 허용하지 않는다. 아래 명령은 각각 PATH를 고정한다. 새로운 shell·QA 세션에서는 사전 확인을 다시 한다.

```bash
export PATH="/Users/ma-24-007/.nvm/versions/node/v22.21.0/bin:$PATH"
command -v node
command -v npm
node --version
npm --version
```

기대 경로는 위 두 절대 경로이며 버전은 `v22.21.0`, `10.9.4`다. 일치하지 않으면 설치·build·검사를 시작하지 않는다.

### `npm ci` 보존 gate

`npm ci`는 기존 `node_modules`를 제거한다. 따라서 **실행 직전 해당 worktree의 `node_modules/`가 완전히 부재함을 확인해야 한다.**

다음을 각각 검사하고 결과를 기록한다.

```bash
test ! -e node_modules
```

```bash
test ! -L node_modules
```

둘 다 exit 0이어야 한다. 디렉터리·파일·symlink가 있으면 보존하고 중단한다. 삭제·이동·덮어쓰기하거나 `npm ci`를 실행하지 않는다.

추가 사전 확인:

```bash
git status --short --branch
git check-ignore node_modules/ build/ native/build/
```

승인된 여섯 파일 외 tracked 변경이 없어야 하며 환경 경로가 ignored여야 한다.

## 7. 승인 요청 환경 준비 명령

Orchestrator의 exact-path inspection 근거:

- `package-lock.json`: 존재, lockfileVersion 3.
- `node-gyp 11.5.0`, `smol-toml 1.9.1` 고정.
- 기존 native script는 로컬 node-gyp와 `--devdir build/node-headers`를 사용한다.
- `build/native/<tuple>/arc_safe_fs.node`, `provenance.json`, `build/native/index.json`, `native/build`를 생성한다.
- Header cache가 없으면 Node header 다운로드가 필요할 수 있다.
- Baseline의 직접 dependency도 같은 두 버전임을 Node22/npm10의 성공한 `npm ls --depth=0`으로 확인함.

모든 변경 명령의 cwd는 승인 worktree다. V3 개별 승인과 Section 6 gate 통과 후에만 실행한다.

### Dependency 설치

```bash
env PATH="/Users/ma-24-007/.nvm/versions/node/v22.21.0/bin:$PATH" /Users/ma-24-007/.nvm/versions/node/v22.21.0/bin/npm ci --ignore-scripts --no-audit --no-fund --cache ./build/npm-cache
```

- Lockfile 기반 설치만 허용.
- 설치 lifecycle scripts 금지.
- Cache는 worktree의 ignored build 아래.
- `package.json`·lockfile 변경 시 중단.
- 실행 실패 후 `npm ci`를 자동 반복하지 않는다.

설치 후 직접 dependency parity 확인:

```bash
env PATH="/Users/ma-24-007/.nvm/versions/node/v22.21.0/bin:$PATH" /Users/ma-24-007/.nvm/versions/node/v22.21.0/bin/npm ls --depth=0
```

Exit 0이며 `node-gyp@11.5.0`, `smol-toml@1.9.1`이어야 한다. 예상 밖 dependency 상태는 비교 불가로 보고한다.

### Native build

```bash
env PATH="/Users/ma-24-007/.nvm/versions/node/v22.21.0/bin:$PATH" /Users/ma-24-007/.nvm/versions/node/v22.21.0/bin/npm run build:native
```

기존 script와 필요한 Node header 다운로드만 허용한다. Compiler·header·network 실패는 기록하고 중단하며 다른 복구 방법으로 전환하지 않는다.

준비 후:

```bash
git status --short --branch
git diff --check
```

예상 밖 tracked 변경이 없어야 한다.

## 8. T1: 기존 구현과 비교 검증 완료

**목표:** 기존 기능을 보존하고 비교 가능한 환경에서 신규 실패가 없는지 판정한다.

**선행 조건:** V3 개별 승인, 현재 HEAD·여섯 파일·소유권·toolchain·환경 보존 gate 확인.

**의존성:** 환경 준비는 전체 suite 비교의 선행 조건이다. 기존 완료 증거는 보존하며 하나의 top-level task와 하나의 focused implementation commit을 유지한다.

### 8.1 기존 구현·TDD 보존

- [ ] 69/69·25/25·manifest·visual QA 결과를 revision에 연결한다.
- [ ] 정상 production 코드와 fixture를 되돌리지 않는다.
- [ ] 완료된 RED를 재현하기 위해 코드를 훼손하지 않는다.
- [ ] 기존 source validation·플랫폼별 값·Back·Apply·viewport 검증 기준을 유지한다.

기존 인터페이스:

- `loadPresetPreviewConfig({context,statuses,kind,target,readText?})`
- `presetRoleRows(config,preset)`
- `presetPreviewRows(roleRows,{columns,rows})`
- 동적 `info({selected,columns,rows})`

기존 레이아웃:

- 80×24 정상 도식.
- 작은 화면은 목록, 공간 부족 시 preview 생략.
- Menu·선택 행·Enter 보호 우선.
- 긴 값·escaping 유지.

### 8.2 환경 준비

- [ ] Section 6 사전 조건을 기록한다.
- [ ] Section 7 설치·build를 순서대로 실행한다.
- [ ] Toolchain·명령·exit·산출물·tracked 상태를 기록한다.
- [ ] 실패나 예상 밖 변경은 자동 재시도 없이 Orchestrator에 반환한다.

### 8.3 기능·PTY·manifest 재검증

```bash
env PATH="/Users/ma-24-007/.nvm/versions/node/v22.21.0/bin:$PATH" /Users/ma-24-007/.nvm/versions/node/v22.21.0/bin/node --test tests/node/tui-setup.test.mjs tests/node/tui-app.test.mjs
```

```bash
env PATH="/Users/ma-24-007/.nvm/versions/node/v22.21.0/bin:$PATH" /Users/ma-24-007/.nvm/versions/node/v22.21.0/bin/node --test tests/node/tui-app-pty.test.mjs
```

```bash
env PATH="/Users/ma-24-007/.nvm/versions/node/v22.21.0/bin:$PATH" /Users/ma-24-007/.nvm/versions/node/v22.21.0/bin/npm run check:manifest
```

```bash
git diff --check
```

- [ ] 기존 69/69·25/25 범위에 회귀가 없어야 한다.
- [ ] 새로운 skip·미실행으로 통과 수가 대체되지 않아야 한다.
- [ ] Source가 바뀌지 않았다면 manifest를 불필요하게 재생성하지 않는다.
- [ ] 승인 범위 내 기능 수정이 필요하면 관련 검사·manifest를 재검증한다.

### 8.4 전체 suite와 완전한 로그

로그 경로가 이미 존재하면 덮어쓰지 않고 Orchestrator가 정확한 새 경로를 지정한다.

```bash
env PATH="/Users/ma-24-007/.nvm/versions/node/v22.21.0/bin:$PATH" /Users/ma-24-007/.nvm/versions/node/v22.21.0/bin/npm test > /tmp/arc-tui-preset-preview-v3-npm-test.log 2>&1
```

- [ ] 실제 exit·summary·로그 SHA-256·HEAD·변경 상태 기록.
- [ ] 모든 실패 이름·파일·위치·오류·stack·skip 사유 확보.
- [ ] Baseline 원본 로그 hash·toolchain·dependency parity 증거 확인.
- [ ] 원본 전체 로그 보존. 출력 truncation을 누락·성공 처리하지 않음.

기존 baseline 로그는 Node22/npm10·dependency 증거가 확인되면 비교에 사용한다. 재실행이 필요하면 baseline에서도 동일 PATH·절대 executable·사전 확인을 적용한다. 기본 Node26/npm12 실행 결과와 비교하지 않는다. Baseline에 설치·build를 수행하지 않는다.

### 8.5 상대 비교 판정

비교 단위는 test 이름·파일·실패 진단이다.

| 분류 | 조건 | 처리 |
|---|---|---|
| 기존 실패 재현 | Baseline과 같은 검사·같은 실패 성격 | 기록, 수리 제외 |
| 신규 실패·악화 | 새 실패 또는 기존과 다른 오류 | Acceptance 보류 |
| 신규 skip·미실행 | Baseline에서 실행된 검사가 누락 | 검증 부족으로 보류 |
| 비교 불가 | 환경·식별·로그 근거 부족 | 미확정 보류 |
| 기존 실패 해소 | 해당 검사가 통과 | 기록하되 다른 실패 상쇄 불가 |

- [ ] 각 실패의 양쪽 로그 위치·toolchain·dependency 상태·판정 근거·기능 의존성을 기록한다.
- [ ] 테스트 수 차이를 추가 테스트·환경 조건에 연결하여 설명한다.
- [ ] 실패 수가 적다는 이유만으로 통과시키지 않는다.
- [ ] 기존 17개 non-TUI 실패를 수정하지 않는다.
- [ ] 범위 밖 원인이나 추가 환경 변경 필요 시 Orchestrator에 반환한다.

## 9. Fresh QA와 수용 기준

새 QA는 자체 세션에서 Section 6의 PATH·executable·버전을 확인한다. 같은 Node22/npm10에서 직접 dependency parity를 확인하고 focused·PTY·manifest·전체 suite를 실행한다. 준비된 환경을 사용하며 `npm ci`를 다시 실행하지 않는다.

| ID | 기준 | 증거 |
|---|---|---|
| A1 | 두 플랫폼·세 preset 모델/effort 정확 | Resolver·고정값 |
| A2 | Install/package와 preset/installed 구분 | Source fixture |
| A3 | Validation/no-fallback/config 불변 | 오류·불변 검사 |
| A4 | 이동 preview와 draft·prepare·execute 분리 | Menu·setup |
| A5 | Settings 별도 Apply, Back/Esc 유지 | 통합·PTY |
| A6 | V7 도식·허브·박스·공백·문구 정확 | 실제 출력 |
| A7 | 작은 화면·resize·Enter 보호 | Viewport matrix |
| A8 | 긴 값·제어 문자 안전 | 축약·escaping |
| A9 | 기존 TUI·PTY 회귀 없음 | 69/69·25/25 범위 재검증 |
| A10 | PTY 정상 context/status | Fixture·실행 |
| A11 | Manifest·diff-check 통과 | 명령 결과 |
| A12 | **같은 고정 toolchain·dependency 구성의 clean baseline 대비 신규 실패·악화·검증 누락 없음** | 완전한 비교표 |
| A13 | 전체 실패·skip·exit 사실 보존 | 원본 로그·분류 |
| A14 | 여섯 tracked 파일·ignored 환경 경계 준수 | 상태·diff |
| A15 | V3 승인 후 환경 준비·새 A12 적용 | 개별 승인 기록 |
| A16 | 모든 준비·검사·QA가 Node22/npm10 사용 | 경로·버전·명령 기록 |
| A17 | `npm ci` 전 기존 node_modules 부재 | 실행 직전 부재 확인 |
| A18 | Baseline과 직접 dependency 버전 일치 | 양쪽 `npm ls --depth=0` 증거 |

A12는 **exit 0 주장으로 바뀌지 않는다.** Exit 1이 남으면 재현된 기존 실패와 함께 최종 보고한다. 새 상대 기준은 개별 승인 이후에만 적용한다.

QA failure는 수정 후 필요한 fresh QA 재검사를 완료한다. 신규 실패·비교 불가·신규 skip·범위 위반은 acceptance를 보류한다.

## 10. Acceptance·commit·최종 Reviewer

- [ ] Orchestrator가 A1–A18·QA·실패 비교·finding 해결을 확인해 T1을 수락한다.
- [ ] 여섯 tracked 변경을 하나의 focused implementation commit으로 남긴다.
- [ ] Ignored dependency·build·cache·로그는 commit하지 않는다.

```text
feat(tui): 프리셋 역할 모델·추론강도 미리보기
```

이후 독립 Reviewer가 최종 전체 변경을 한 번 검토한다.

- 공용 menu·resize·선택 보호.
- 승인 목업·source·no-fallback·별도 Apply.
- PTY assertion과 terminal 복구.
- Manifest·tracked/ignored 경계.
- 고정 toolchain·dependency parity·baseline 비교·기존 실패 공개.
- 변경된 acceptance의 개별 승인 범위.

초기 최종 Reviewer finding은 Implementer 수정→Reviewer 재검토로 해결한다. 이 단계에서는 QA를 재배정하지 않는다. 초기 최종 검토 전 필요한 QA·QA 실패 재검사는 유지한다.

최종 finding 해결 후 Orchestrator가 완료를 판정한다. Push·merge·publish는 하지 않는다.

## 11. 보류·실패 처리

다음은 affected 작업과 acceptance를 보류한다.

- V3 개별 승인 부재.
- Toolchain 또는 dependency parity 불일치.
- 기존 `node_modules` 발견.
- Ignored 경계 불성립.
- 설치·build 실패나 예상 밖 tracked 변경.
- 신규 실패·악화·비교 불가·검증 누락.
- 미해결 feature·PTY·manifest·QA finding.

최초 실패 명령·결과·로그·HEAD·변경 상태를 기록한다. Baseline/current/environment/unknown 분류에는 근거를 붙인다.

자동 재시도·환경 확대·기존 dependency 삭제·non-TUI 수리를 하지 않는다. Orchestrator가 독립 작업의 권한·대상·입력·소유권을 확인하여 진행할 수 있지만 acceptance를 묵시적으로 면제하지 않는다.

## Self-review

- Clean baseline의 성공한 Node22/npm10 `npm ls --depth=0` 결과와 정확한 두 dependency 버전을 추가했다.
- Worktree 설치 후와 fresh QA에서 parity 확인을 요구했다.
- 기본 Node26/npm12와 비교 toolchain의 불일치를 명시했다.
- 모든 설치·build·tests·QA·baseline 재검증에 Node22 PATH와 절대 executable을 고정했다.
- 새 shell마다 경로·버전 사전 확인을 요구했다.
- `npm ci`의 기존 dependency 제거 위험을 반영하여 node_modules 부재를 필수 gate로 추가했다.
- 기존 제품·여섯 파일·no-fallback·17개 실패 수리 제외 범위를 유지했다.
- 상대 A12와 실제 exit 결과를 구분했다.
- 새 개별 승인 전 환경 준비·acceptance 변경을 금지했다.
- 파일 수정·명령·테스트·Git 작업은 수행하지 않았다.
