# npm 전역 설치·ARC upgrade·completion 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 실행 역할과 승인·검증·commit 절차에는 ARC 계약이 우선한다. Orchestrator가 각 task에 fresh Coder와 필요한 fresh QA를 배정한다. Coder는 다른 역할을 생성하거나 Git 상태를 변경하지 않는다. Reviewer는 모든 task 수용 후 최종 전체 변경을 검토한다.

**Goal:** 추가 flag 없는 전역 npm 설치에서 기존 대화형 harness 설치를 이어 실행하고, 설정을 보존하는 `arc upgrade` 및 Bash/Zsh completion을 제공한다.

**Architecture:** npm 실행 문맥 판별과 기존 harness 상태 보존을 공통 기반으로 만든다. postinstall은 확인된 전역 설치에서만 터미널에 연결해 기존 설치기를 실행한다. upgrade는 전역 CLI 교체와 새 프로세스의 harness 갱신을 분리하고, npx에서는 호출된 payload로 harness만 갱신한다.

**Tech Stack:** 기존 Node.js ESM, npm 10.9.4 검증 환경, `node:child_process`, `node:tty`, 기존 safe-fs·manifest·transaction, `node:test`, Bash, Zsh, macOS `expect` / Linux `script`.

**Spec:** `/Users/ma-24-007/Desktop/workspace/arc/docs/superpowers/specs/2026-10-21-npm-global-install-upgrade-completion-design.md`

**Plan:** `/Users/ma-24-007/Desktop/workspace/arc/docs/superpowers/plans/2026-10-21-npm-global-install-upgrade-completion.md`

## 공통 제약

- Repository: `/Users/ma-24-007/Desktop/workspace/arc`
- Branch: `feat/arc-install-upgrade-completion`
- 승인된 기준 HEAD: `64ad6e730c7944bafb32ad4a712167eca00c33ec`
- 계획 작성 시 상태: Orchestrator 제공 근거상 구현 변경 없이 승인된 spec만 untracked.
- Node.js의 기존 `>=22` 계약을 유지한다.
- package 이름은 `@yunhozz/arc`이다. 기능 구현을 위한 package 버전 증가는 하지 않는다.
- README는 모든 task에서 수정 금지다.
- Windows 자동 lifecycle chooser, publish, push, merge, 배포는 제외한다.
- 기존 chooser의 순서·기본 선택·limits 선택 동작을 유지한다.
- 비대화형 환경에서 설치 설정을 자동 선택하지 않는다.
- `ignore-scripts`와 npm script 허용 정책을 변경하거나 우회하지 않는다.
- upgrade의 공개 option은 `--help`만 제공한다.
- 설치된 target, 언어, preset, 전체 모델·effort 설정, limits, 기존 global 설정 범위를 보존한다.
- semantic harness 버전 저장 형식을 추가하지 않는다. 이전 버전은 근거 없으면 미기록 상태로 표현한다.
- 테스트는 실제 사용자 HOME·npm prefix·cache·registry 설정을 사용하지 않는다.
- 제품 동작을 위한 테스트 전용 환경 변수나 manifest 우회 경로를 추가하지 않는다.
- 필수 QA 실패나 환경 제약을 통과로 바꾸지 않는다.

## 검토 중점

다음 다섯 위험을 각 소유 task의 테스트로 고정한다.

1. **상속된 npm global 설정:** Git/local/npx 준비가 전역 설치로 오인되어 사용자 설정을 변경하지 않아야 한다. T1 문맥 단위 테스트와 T2 실제 consumer 테스트.
2. **상대 경로와 공백:** 상대 `CODEX_HOME`, 공백이 있는 npm prefix 및 호출 위치가 정확히 해석되어야 한다. T1 상태·문맥 테스트, T2/T3 통합 테스트.
3. **터미널 중단:** raw mode에서 Ctrl+C·EOF·PTY 단절이 발생해도 terminal 상태와 listener를 정리해야 한다. T2 terminal·실제 PTY 테스트.
4. **사용자가 수정한 설정:** preset 이름만 보존하고 사용자 모델표나 native concurrency를 덮어쓰지 않아야 한다. T1 harness 갱신 테스트와 T3 통합 테스트.
5. **교체 중 상태 변화:** CLI 교체 이후 설정이 변경되거나 새 CLI 실행이 실패하면 이전 snapshot을 쓰거나 전체 성공으로 보고하지 않아야 한다. T3 handoff·부분 실패 테스트.

## 실행 전 승인·준비 gate

Orchestrator는 다음을 마친 후 첫 Coder를 배정한다.

- [ ] 이 plan을 지정 경로에 저장하고 자체 검토한다.
- [ ] 사용자에게 저장된 plan 승인을 받는다.
- [ ] 승인된 spec과 plan의 버전·범위·경로를 handoff 기록에 남긴다.
- [ ] 두 문서가 이미 commit되어 있는지 확인하고, 남은 승인 문서를 하나의 planning-documents batch로 commit한다.
- [ ] 브랜치·HEAD·변경 파일·소유권·README 제외 상태를 다시 확인한다.
- [ ] 아래 dependency·소유권·필수 checks·보류 조건을 canonical handoff 기록에 등록한다.
- [ ] 각 task 시작 시 fresh Coder에게 spec·plan과 해당 task의 입력·증거를 전달한다.

plan 승인 전에는 Coder를 시작하지 않는다. 이 gate는 구현 승인과 문서 commit의 순서를 바꾸지 않는다.

## task 경계와 파일 소유권

| Task | 산출물 | 선행 task |
|---|---|---|
| T1 | npm 실행 문맥 판별과 설정 보존형 harness 갱신 기반 | 없음 |
| T2 | 전역 npm 설치 postinstall·터미널 연결·실제 npm consumer 검증 | T1 |
| T3 | 전역/npx upgrade·help/completion·전체 통합 검증 | T1, T2 |

일반 source·test 파일의 편집 소유권은 아래 task별로 분리한다. 후속 task는 선행 task 소유 파일을 읽고 API를 소비한다.

`MANIFEST.sha256`는 모든 보호 source 변경을 반영해야 하는 공유 생성 파일이다. **현재 실행 중인 task의 Coder만 독점 갱신**하고, 해당 task 수용·commit 후 다음 Coder에게 소유권을 넘긴다. 각 task를 설치 가능한 상태로 검증해야 하므로 manifest 갱신을 마지막 task로 미루지 않는다.

따라서 T1 → T2 → T3를 순차 실행한다. 이는 manifest, npm fixture 계약, lifecycle 억제 동작에 대한 명시적인 직렬화다. 같은 파일을 여러 Coder가 동시에 편집하지 않는다.

각 top-level task는 하나의 focused implementation commit이다. 하위 checkbox와 RED/GREEN 단계는 별도 commit 단위가 아니다.

---

## T1. npm 문맥 판별과 설정 보존형 harness 갱신 기반

**목표:** 전역/local/npx 실행을 보수적으로 구분하고, 기존 target과 설정을 검증·보존하여 새 payload를 적용하는 내부 API를 제공한다. 공개 root 명령과 npm hook은 아직 추가하지 않는다.

**역할·위험:** fresh Coder 1명 → fresh QA 1명 → Orchestrator 수용. 공유 상태·경로·설정 보존 계약이므로 significant 검증을 적용한다.

### 파일 소유권

신규:

- `lib/npm/process.mjs`
- `lib/npm/context.mjs`
- `lib/installer/upgrade-state.mjs`
- `lib/installer/upgrade.mjs`
- `tests/node/npm-context.test.mjs`
- `tests/node/upgrade-state.test.mjs`
- `tests/node/upgrade-harness.test.mjs`

수정:

- `lib/installer/plan.mjs`
- `tests/node/plan.test.mjs`
- `MANIFEST.sha256` — T1 동안 독점 소유

기존 models·targets·transaction·global renderer는 재사용한다. 해당 source 파일 수정이 필요하면 임의로 범위를 넓히지 않고 Orchestrator에게 반환한다.

### 입력·출력 인터페이스

`lib/npm/process.mjs`:

```text
runNpm(npmCli, args, {cwd, env, signal})
  -> Promise<{code, signal, stdout, stderr}>
```

- npm CLI의 검증된 실제 경로를 Node executable로 실행한다.
- 인자는 배열로 전달한다.
- spawn 오류·실패·취소를 구분한다.
- registry 인증 정보를 출력하지 않는다.

`lib/npm/context.mjs`:

```text
inspectNpmContext({packageRoot, entryPath, env, cwd, execPath, runNpm})
  -> Promise<
       {kind:'global', packageRoot, entryPath, prefix, npmCli}
       | {kind:'npx', packageRoot, entryPath, npmCli}
       | {kind:'unsupported', reason}
     >

resolveInvocationCwd({env, cwd, lifecycle})
  -> absolute path
```

- 전역 위치는 실제 npm prefix/root와 현재 package 위치를 대조한다.
- lifecycle은 현재 package가 최종 설치 위치에 있는지 함께 확인한다.
- npx 판정에는 npm exec 문맥과 실제 cache/package 경로의 일치 근거를 사용한다.
- `_npx` 문자열 또는 `npm_config_global` 하나만으로 판정하지 않는다.
- 상대 `CODEX_HOME`의 lifecycle 기준 위치는 검증된 원래 호출 위치다. 확정 불가 시 오류다.

`lib/installer/upgrade-state.mjs`:

```text
collectInstalledState({safeFs, userHome, env, cwd})
  -> {
       targets:[{target, language, modelConfig, limits, snapshot}],
       stateToken
     }
```

- 정상 설치만 `targets`에 포함한다.
- ARC 디렉터리, 알려진 ARC profile 또는 설정 일부만 남은 상태는 불완전 설치로 진단한다.
- mandatory 설정과 profile을 safe-fs로 검사한다.
- `stateToken`은 target 경로·관련 설정·global 파일 snapshot을 안정적으로 요약한 비교값이다.
- token에는 사용자 설정 본문이나 환경 인증 정보를 넣지 않는다.

`lib/installer/plan.mjs`:

```text
buildInstallPlan(existingArguments + {modelConfig?})
  -> existing InstallPlan
```

- `modelConfig`가 없으면 기존 신규 설치 동작을 유지한다.
- 있으면 platform/schema를 검증하고 전체 모델 설정으로 새 profile을 생성한다.

`lib/installer/upgrade.mjs`:

```text
buildUpgradePlans({payload, state, safeFs})
  -> InstallPlan[]

upgradeInstalledTargets({
  packageRoot, state, safeFs, signal, acquisition
})
  -> Promise<{version, results, interrupted}>
```

- 기존 언어·limits·모델 설정을 사용한다.
- 기존 installer transaction·acquisition·payload 검증을 재사용한다.
- native 설정은 다시 생성하지 않는다.
- 기존 ARC instruction/completion block만 갱신 가능하며 부재한 block은 만들지 않는다.
- 여러 plan이 공유하는 `.zshrc`는 하나의 plan만 관리하도록 한다.
- 사용자가 관리하는 외부 skill 경로로 변경 범위를 넓히지 않는다.

### 구현·TDD 단계

- [ ] **RED: npm 문맥 테스트 작성**

  `npm-context.test.mjs`에 다음을 고정한다.

  - 최종 global 경로와 npm prefix/root가 일치할 때만 global.
  - global 설정을 상속한 임시 Git/local 경로는 global이 아님.
  - 실제 npx 문맥·cache 경로 일치와 `_npx`를 흉내 낸 임의 경로 구분.
  - prefix·실행 경로에 공백이 있어도 동일 결과.
  - relative `CODEX_HOME`용 호출 위치가 없으면 실패.
  - npm 실패·signal·shell metacharacter 포함 인자를 code로 실행하지 않음.

- [ ] **RED: 설치 상태·보존 테스트 작성**

  `upgrade-state.test.mjs`, `upgrade-harness.test.mjs`에 다음을 고정한다.

  - Codex만 설치, Claude만 설치, 서로 다른 설정의 두 target.
  - 언어·preset·모든 role/preset 모델표·effort·limits 보존.
  - native concurrency가 limits와 달라도 그대로 보존.
  - global block 부재 유지, 기존 block 외 사용자 내용 보존.
  - 손상 설정·누락 profile·orphan profile·symlink destination은 쓰기 전에 실패.
  - 상대·절대 `CODEX_HOME` 및 변경된 snapshot 검출.
  - 같은 package 버전이어도 harness 갱신.
  - 두 번째 target 실패 시 첫 번째 target 상태와 rollback 결과를 정직하게 반환.
  - 외부 사용자 skill sentinel 보존.

- [ ] **RED 확인**

  ```sh
  node --test tests/node/npm-context.test.mjs tests/node/upgrade-state.test.mjs tests/node/upgrade-harness.test.mjs
  ```

  신규 API 부재 또는 명시한 동작 부재로 실패하는 근거를 남긴다.

- [ ] **최소 구현**

  위 인터페이스를 구현하고 `buildInstallPlan`의 기존 기본 동작을 유지한다. snapshot·global marker 검증을 기존 primitive로 수행한다.

- [ ] **GREEN 및 회귀 검증**

  ```sh
  node --test tests/node/npm-context.test.mjs tests/node/upgrade-state.test.mjs tests/node/upgrade-harness.test.mjs tests/node/plan.test.mjs tests/node/models.test.mjs tests/node/language.test.mjs tests/node/limits.test.mjs tests/node/targets.test.mjs tests/node/global-config.test.mjs tests/node/install.test.mjs tests/node/transaction-drift.test.mjs
  ```

- [ ] **보호 manifest 갱신·검증**

  ```sh
  node scripts/update-manifest.mjs
  npm run check:manifest
  node --test tests/node/manifest.test.mjs
  ```

  README의 내용은 바꾸지 않는다.

- [ ] **fresh QA 및 Orchestrator 수용**

  QA는 위 GREEN·manifest 명령을 독립 실행하고, 임시 target의 설정 보존과 실패 시 무변경 근거를 보고한다. Orchestrator가 기준과 findings를 확인해 수용한 뒤 T1 파일과 manifest를 하나의 focused commit으로 기록한다.

### 수용 증거

- context 판별의 긍정·부정 사례가 통과.
- 유효 설정의 semantic 값 및 비 ARC global 내용 보존.
- 잘못된 설치 상태에서 실제 쓰기가 없다는 증거.
- 기존 installer·plan 회귀 및 manifest 검사 통과.
- 관련 AC-09, AC-10, AC-11과 AC-07/08의 공통 기반 충족.

### 보류 조건

문맥 판별이 추측에 의존하거나, 설정 migration·새 기본값·safe-fs 우회가 필요하면 중단한다. T1 수용 및 commit 전 T2를 시작하지 않는다.

---

## T2. 전역 npm lifecycle과 대화형 설치 연결

**목표:** 추가 flag 없는 실제 global install에서 기존 chooser를 열고 설치를 완료한다. no-terminal·CI·준비 단계에서는 CLI만 설치하며, 취소·실패에서 터미널을 복원한다.

**선행:** T1의 QA·수용·focused commit 및 API 계약.

**역할·위험:** fresh Coder → fresh QA → Orchestrator 수용. lifecycle·terminal·사용자 설정 변경이므로 significant.

### 파일 소유권

신규:

- `lib/cli/terminal.mjs`
- `lib/cli/postinstall.mjs`
- `scripts/postinstall.mjs`
- `tests/node/terminal.test.mjs`
- `tests/node/npm-lifecycle.test.mjs`
- `tests/node/npm-lifecycle-pty.test.mjs`
- `tests/node/fixtures/npm-sandbox.mjs`

수정:

- `package.json`
- `package-lock.json`
- `lib/cli/index.mjs`
- `lib/cli/choices.mjs`
- `tests/node/package.test.mjs`
- `tests/node/npm-completion-consumer.test.mjs`
- `tests/node/cli-pty.test.mjs`
- `tests/node/consumer.test.mjs`
- `MANIFEST.sha256` — T1에서 소유권 인수

T1 source는 수정하지 않는다. API 결함은 Orchestrator에게 반환한다.

### 인터페이스

```text
openInstallerTerminal({platform, env, input, output, error, openTty})
  -> {kind:'interactive', io, dispose}
     | {kind:'skip', reason}

runPostinstall({packageRoot, env, cwd, input, output, error, deps})
  -> Promise<number>
```

- CI 및 미지원 환경 판정이 `/dev/tty` 연결보다 앞선다.
- 실제 stream이 TTY이면 재사용하고, 아니면 `/dev/tty` 기반 TTY stream을 연다.
- `dispose`는 한 번 이상 호출되어도 안전하다.
- 오류·EOF·Ctrl+C·signal에서 raw mode와 변경한 terminal 상태를 복원한다.
- 기존 CLI는 원래 호출 위치를 전달받아 상대 target 경로를 해석한다.
- `scripts/postinstall.mjs`는 얇은 진입점이며 반환 코드를 lifecycle 종료 코드로 전달한다.

테스트 fixture:

```text
createNpmSandbox(t)
  -> {
       home, prefix, cache, env, npmCli, registryAudit,
       packFixture(sourceRoot, {version?, extraFiles?}),
       addPackage({tarball, metadata}),
       setLatest(version),
       runNpm(args, options),
       runPty(args, interaction)
     }
```

fixture는 임시 HOME·prefix·cache·user/global npmrc와 loopback registry를 소유한다. npm 설치의 실제 lifecycle을 사용하고, 기존 fake-git fixture로 외부 skill 취득을 통제한다. fixture의 package 복사본을 바꾸면 해당 복사본의 manifest도 정식 generator로 갱신한다.

### 구현·TDD 단계

- [ ] **RED: terminal·hook 분기 테스트 작성**

  - 기본 npm처럼 stdio가 pipe여도 직접 TTY 연결 stream을 기존 chooser에 전달.
  - CI, Windows, no-terminal, local, npx preparation, inherited-global Git preparation에서는 설치기 호출 없음.
  - TTY 연결 자체 실패는 skip, 선택 시작 후 실패는 lifecycle 실패.
  - raw 상태가 원래 true/false인 경우 각각 복원.
  - EOF·Ctrl+C·일반 예외·signal 후 descriptor와 listener 정리.
  - 원래 호출 위치가 없는 relative `CODEX_HOME`으로 쓰지 않음.
  - 성공 문구의 버전은 package에서 읽고 실패·check·dry-run에는 출력하지 않음.

- [ ] **RED 확인**

  ```sh
  node --test tests/node/terminal.test.mjs tests/node/npm-lifecycle.test.mjs
  ```

- [ ] **hook·terminal adapter·기존 CLI 연결**

  `postinstall`을 등록하고 lockfile의 install-script metadata를 동기화한다. 다른 install/prepare/uninstall hook은 추가하지 않는다.

  기존 chooser의 표시·기본값은 유지한다. stream 소유자와 cleanup 책임을 분명히 하고 기존 직접 `arc`/npx 실행에도 버전 포함 성공 문구를 적용한다.

- [ ] **package 계약 테스트 갱신**

  기존 “모든 hook 없음”을 “승인한 postinstall만 존재” 계약으로 바꾼다. lockfile `hasInstallScript`와 배포 파일을 검사한다.

  기존 `0.1.0` 고정 기대는 알려진 baseline drift로 별도 기록하고, 실제 package와 lockfile의 버전 일치를 검사하도록 고친다. package 버전을 기능 구현과 함께 올리지 않는다.

  npm consumer의 completion 확인은 현재 필수 명령의 존재·등록을 검사한다. 전체 후보의 정확한 목록은 T3의 completion 테스트가 담당하도록 하여 T3가 이 파일을 다시 수정할 필요를 없앤다.

- [ ] **실제 npm consumer·PTY 테스트 작성**

  fixture registry와 환경 설정으로 prefix·registry를 격리한 뒤 실제 인자는 다음과 같이 유지한다.

  ```text
  npm i -g @yunhozz/arc
  ```

  `--foreground-scripts`를 넣지 않는다. fixture npmrc에서도 `foreground-scripts=false`를 명시해 사용자 전역 설정에 결과가 의존하지 않게 한다.

  검증 항목:

  - 플랫폼·preset·limits·언어 선택 입력과 실제 설치 파일.
  - actual package version 성공 문구.
  - 상대 `CODEX_HOME`과 공백 포함 경로.
  - 같은 package 재설치 후 completion block 중복 없음.
  - no-terminal·CI·ignore-scripts에서 HOME 변경 없음.
  - local/npx 준비·Git global preparation에서 조기 chooser 없음.
  - Ctrl+C·EOF·PTY 단절 및 installer 실패 시 성공 문구 없음.
  - 정상·실패·취소 후 같은 PTY의 terminal 상태 복원.
  - npm 실패 후 CLI 존재 여부를 실제 관측값으로 보고.

- [ ] **manifest 갱신 후 GREEN**

  ```sh
  node scripts/update-manifest.mjs
  node --test tests/node/terminal.test.mjs tests/node/npm-lifecycle.test.mjs tests/node/package.test.mjs tests/node/npm-completion-consumer.test.mjs tests/node/cli-pty.test.mjs tests/node/consumer.test.mjs tests/node/cli-dry-run.test.mjs
  npm run check:manifest
  ```

- [ ] **macOS 실제 PTY 검증**

  npm 버전을 확인하고 10.9.4 실행 근거를 남긴다.

  ```sh
  npm --version
  ARC_TEST_REQUIRE_PTY=1 node --test tests/node/npm-lifecycle-pty.test.mjs
  ```

  `ARC_TEST_REQUIRE_PTY`는 테스트 driver에만 적용한다. 제품에서는 읽지 않는다. required 모드에서 driver가 없으면 skip하지 않고 검사 불가로 실패한다.

- [ ] **Linux 실제 PTY 검증**

  Linux에서 같은 명령을 실행한다. `script`를 사용하는 실제 PTY, 지원 prebuild와 npm 10.9.4를 사용하고 platform·arch·Node/npm 버전·driver를 기록한다.

  기존에 사용 가능한 Linux runner 또는 격리 runtime만 사용한다. macOS에서 Linux 분기를 mock한 결과는 AC-02 증거로 쓰지 않는다.

- [ ] **fresh QA 및 Orchestrator 수용**

  QA는 일반 회귀와 두 플랫폼의 실제 PTY 근거를 독립 확인한다. 실패 시 Coder 수정 후 필요한 QA 재검증을 수행한다. Orchestrator 수용 후 T2 파일과 manifest를 하나의 focused commit으로 기록한다.

### 수용 증거

- AC-01~06, 설치 관련 AC-14~16 충족.
- 기본 npm 설정에서 실제 chooser·입력·설치·성공 문구 확인.
- local/npx/Git 준비 경로의 무변경 확인.
- 직접 CLI·npx 회귀와 package/lockfile/manifest 검사 통과.
- terminal 상태·listener 정리 근거.
- macOS와 Linux 실제 PTY 증거.

### 보류 조건과 Linux 제약

Linux runner·PTY driver·지원 prebuild가 없으면 AC-02는 **미검증**이다. 원인과 실행하지 못한 명령을 보고하고 T2의 전체 수용을 보류한다. macOS 통과나 mock으로 대체하지 않는다.

Orchestrator는 검증 가능한 Linux 환경을 확보하거나, 사용자에게 승인 범위 변경을 받아야 한다. 필요한 QA를 조용히 생략하거나 제한을 승인된 것으로 간주하지 않는다.

동일하게 npm의 진행 출력이 chooser를 사용 불가능하게 만들거나 취소 후 terminal 복원이 불가능하면 해당 계약이 해결되기 전 수용하지 않는다.

---

## T3. 전역/npx upgrade와 completion 통합

**목표:** 정확한 global CLI 자기 갱신, 새 CLI handoff, 설정 보존 harness 갱신, npx 예외와 공개 help/completion을 완성한다.

**선행:** T1, T2의 필요한 QA·수용·focused commit. 실제 배포 hook이 존재하는 상태에서 중복 lifecycle 억제를 검증한다.

**역할·위험:** fresh Coder → fresh QA → Orchestrator 수용. 공개 CLI·package 자기 교체·부분 실패 계약이므로 significant.

### 파일 소유권

신규:

- `lib/cli/upgrade.mjs`
- `lib/npm/upgrade.mjs`
- `bin/arc-upgrade.mjs`
- `tests/node/upgrade-cli.test.mjs`
- `tests/node/upgrade-process.test.mjs`
- `tests/node/npm-upgrade-consumer.test.mjs`

수정:

- `lib/cli/root.mjs`
- `lib/cli/completion.mjs`
- `tests/node/completion.test.mjs`
- `tests/node/shell-completion.test.mjs`
- `MANIFEST.sha256` — T2에서 소유권 인수

T1/T2 source·fixture는 읽기 전용으로 소비한다. `bin/`, `lib/`는 기존 package files 범위이므로 package metadata를 다시 수정하지 않는다.

### 인터페이스

`lib/cli/upgrade.mjs`:

```text
runCli(args, io, deps)
  -> Promise<number>
```

- `--help`만 허용하며 help는 native·network를 로드하지 않는다.
- unknown option·중복/추가 인자를 2로 처리한다.
- T1 context/state API로 쓰기 전 검사한다.
- npx는 T1 harness 갱신 API를 직접 호출한다.

`lib/npm/upgrade.mjs`:

```text
resolveLatest({context, env, cwd, signal, runNpm})
  -> Promise<{name:'@yunhozz/arc', version}>

upgradeGlobal({context, expectedVersion, env, cwd, signal, runNpm})
  -> Promise<{packageStatus, version, error?}>

runUpgradeChild({entryPath, request, env, cwd, signal})
  -> Promise<{code, signal}>
```

- `npm view`의 package identity·version을 검증한다.
- 조회 버전을 정확한 설치 인자로 사용한다.
- 현재 global prefix를 명시하고 내부 npm install에 `--ignore-scripts`를 적용한다.
- 사용자의 npm 설정 파일은 수정하지 않는다.

`bin/arc-upgrade.mjs` private handoff 요청:

```text
{
  protocol: 1,
  expectedVersion,
  invocationCwd,
  expectedStateToken
}
```

- parent는 표준 입력 등 private channel로 JSON을 전달한다.
- 공개 root subcommand를 추가하지 않는다.
- child는 요청 형식·package identity·버전·호출 위치를 검증한다.
- T1 상태를 다시 수집하고 token 일치를 확인한 뒤 harness를 변경한다.
- 전달된 token이나 경로는 안전성 검증을 생략하는 권한이 아니다.
- secret·전체 환경·사용자 설정 본문은 직렬화하지 않는다.

### 구현·TDD 단계

- [ ] **RED: 공개 CLI·upgrade orchestration 테스트**

  - `upgrade --help`가 native/installer asset 없는 최소 package에서 성공.
  - `--check`, `--target`, `--version`, 추가 positional argument 거부.
  - 미설치·불완전 설치·unsupported local/source 실행은 쓰기 전 중단.
  - registry를 한 번 조회하고 dist-tag 변경과 무관하게 exact version 설치.
  - 잘못된 package identity·version·shell metacharacter 반환값 거부.
  - current global prefix와 일치하는 위치만 교체.
  - package 교체 호출에 `--ignore-scripts` 존재.
  - package 실패 시 child·harness 호출 없음.
  - candidate 버전이 같아도 harness 단계 실행.
  - npx는 registry 재조회·global install 없이 호출 버전 사용.

- [ ] **RED: handoff·실패 테스트**

  - old process의 installer 실행 없이 새 child가 갱신.
  - 새 package identity/version 불일치에서 harness 변경 없음.
  - handoff protocol 오류·child spawn 실패·child 실패 구분.
  - 사전 검사 이후 모델/limits/global snapshot 변경 시 중단.
  - CLI 성공 후 harness 실패·일부 target 실패·cleanup 실패의 결과 분리.
  - 취소 시 child/npm 처리와 종료 코드, 실제 package 상태 보고.
  - executable이 사라진 경우 “이전 CLI 복원”을 주장하지 않음.
  - same-version 재실행으로 실패한 harness 갱신 복구.

- [ ] **RED 확인**

  ```sh
  node --test tests/node/upgrade-cli.test.mjs tests/node/upgrade-process.test.mjs
  ```

- [ ] **upgrade·private child 구현**

  T1의 runner/context/state/installer API를 사용한다. 교체 전에 필요한 old-process module을 로드하고, npm 교체 이후 old package source를 lazy import하지 않는다.

  결과는 package와 target별 상태로 보고한다. `0/1/2/130` 의미를 유지하며 npm 실패를 성공으로 바꾸지 않는다.

- [ ] **completion RED 테스트 작성**

  Bash/Zsh 각각 다음을 literal 기대값으로 검사한다.

  ```text
  arc <TAB>:
    preset uninstall completion upgrade

  arc --<TAB>:
    --target --preset --language
    --max-total-subagents --max-concurrent-subagents
    --check --dry-run --skip-global --help --version

  arc --max-<TAB>:
    --max-total-subagents --max-concurrent-subagents

  arc --v<TAB>:
    --version

  arc upgrade --<TAB>:
    --help
  ```

  기존 target·preset·language 값 완성, 하위 명령에 없는 option 제외, compinit 전후 등록을 유지한다.

- [ ] **help·completion 구현**

  root dispatcher와 usage에 `upgrade`를 추가한다. 기존 option 분기를 재사용하며 Bash 시작 파일 자동 수정은 추가하지 않는다.

- [ ] **실제 npm upgrade consumer 테스트 작성**

  T2 fixture의 임시 registry에 두 package fixture를 등록한다. 버전 증가는 임시 복사본에만 적용한다.

  - 이전 버전 A의 global CLI와 서로 다른 설정의 두 harness 준비.
  - registry `latest`를 B로 설정하고 설치된 `arc upgrade` 실행.
  - B의 실제 CLI와 B payload의 식별용 fixture 파일 적용 확인.
  - 전역 hook의 chooser가 재등장하지 않음 확인.
  - 실제 global prefix 유지, 기존 설정·native 파일·외부 sentinel 보존.
  - old version을 제거해도 새 child가 독립 실행되는지 확인.
  - 동시 설정 변경, package 실패, harness 실패 후 재실행 복구.
  - 실제 `npm exec`/npx 문맥에서 호출 버전 harness 적용 및 global prefix 무변경.
  - 임의 `_npx` 이름 local 경로는 지원되는 npx 실행으로 취급하지 않음.
  - registry audit에 실제 npmjs 요청이나 credential 출력이 없음 확인.

- [ ] **실제 Zsh 등록·Tab 검증**

  T2 lifecycle로 설치된 임시 HOME과 prefix를 사용해 새 Zsh를 연다. 사용자가 직접 completion script를 source하지 않아도 root option과 upgrade 후보가 나타나야 한다.

  현재 부모 shell 자동 활성화를 주장하지 않는 안내와 managed block 단일 개수도 검사한다.

- [ ] **manifest 갱신 및 focused GREEN**

  ```sh
  node scripts/update-manifest.mjs
  node --test tests/node/upgrade-cli.test.mjs tests/node/upgrade-process.test.mjs tests/node/npm-upgrade-consumer.test.mjs tests/node/completion.test.mjs tests/node/shell-completion.test.mjs tests/node/preset-cli.test.mjs tests/node/uninstall-cli.test.mjs
  npm run check:manifest
  ```

- [ ] **fresh QA 및 전체 통합 검증**

  QA가 위 focused checks와 다음 최종 내용 상태 검증을 수행한다.

  ```sh
  npm test
  npm run check:manifest
  npm run check:role-policy
  npm pack --dry-run --json --ignore-scripts
  ARC_TEST_REQUIRE_PTY=1 node --test tests/node/npm-lifecycle-pty.test.mjs
  ```

  package 출력에서 신규 lifecycle·upgrade 진입점, 지원 모듈, 기존 native artifact가 포함되는지 확인한다. README 수정이 없고 package·lockfile이 일치하는지 확인한다.

  macOS/Linux 실제 upgrade·lifecycle 결과는 해당 환경별로 기록한다. 네트워크는 임시 registry와 fake acquisition으로 격리한다.

- [ ] **Orchestrator 수용·focused commit**

  findings와 미검증 항목을 확인해 수용한 뒤 T3 파일과 manifest를 하나의 focused commit으로 기록한다.

### 수용 증거

- AC-07~13, 최종 AC-14~16 충족.
- registry 확정·exact version·동일 prefix·새 CLI 실행 순서의 audit.
- 실제 두 버전 package 간 global upgrade와 npx harness-only 결과.
- 설정 변경 race·partial failure·재실행 복구 근거.
- actual Bash/Zsh 후보와 새 세션 활성화 근거.
- 전체 suite·manifest·policy·package 검사 통과.
- T1/T2 기준에 대한 회귀 없음.

### 보류 조건

전역 위치·npx provenance 판별 불가, 새로운 public option 필요, handoff가 안전 검증을 우회해야 하는 경우, 설정 migration이나 global 설정 추가가 필요한 경우 중단한다.

전체 suite에 실패가 있으면 baseline/new regression/환경 실패를 구분한다. 이미 기록한 `0.1.0` baseline drift 외 새로운 실패를 이유 없이 기존 문제로 처리하지 않는다.

---

## 최종 전체 검증과 수용

이 절은 task별 수용·commit을 대체하지 않는다.

1. Orchestrator가 T1~T3의 수용·QA·focused commit과 AC-01~16 대응 증거를 확인한다.
2. 마지막 QA가 검사한 내용과 최종 commit 내용이 동일하면 그 증거를 재사용한다. 검사 후 변경이 있으면 영향받는 checks를 다시 수행한다.
3. 필요한 QA와 실패 재검증이 완료된 뒤 **독립 Reviewer 한 명이 최종 전체 diff를 검토**한다. 개별 task별 Reviewer는 배정하지 않는다.
4. Reviewer에는 승인 spec·plan, 기준 HEAD, 최종 HEAD, 전체 changed-file 목록, QA 결과, baseline drift 처리, 플랫폼 제약을 제공한다.
5. 최종 Reviewer finding은 Coder가 수정하고 Reviewer가 재검토한다. 이 최종 단계에서는 ARC 예외에 따라 QA를 재배정하지 않는다. 해결될 때까지 반복한다.
6. Orchestrator는 필요한 finding recheck 이후 수정 수용·focused follow-up commit을 처리한다.
7. Linux 등 필수 기준이 미검증이면 검증 완료로 선언하지 않는다. 범위 축소가 필요하면 사용자 결정과 관련 문서 수정을 거친다.
8. 최종 보고에는 구현 결과, 실제 실행한 checks, macOS/Linux 증거, 부분 실패·복구 한계, README 무변경, 미검증 범위를 포함한다.

## 증거 기록 형식

각 task 보고에는 다음을 포함한다.

- 소유 파일과 실제 changed-file 목록.
- RED 명령·실패 원인 및 GREEN 명령·결과.
- 실행 platform·arch·Node/npm 버전·PTY driver.
- 임시 HOME/prefix/cache/registry와 cleanup 결과.
- 대상별 설치·upgrade·rollback·잔여 경로 결과.
- AC별 `proven / unmet / unverified`.
- QA finding과 수정·재검증 결과.
- 보류 조건 발생 여부.
## 구현 계획 개정 1 — 배포 artifact 전용 설치 hook

이 절은 기존 **T2·T3와 최종 검증 절을 대체**한다. 승인 spec의 `Amendment 1 — 2026-10-22`가 우선하며, T1은 `70865bbf0854cde38e9c7532b2045af7ce438188`에서 수용·commit된 상태로 유지한다.

대상은 `/Users/ma-24-007/Desktop/workspace/arc`, 브랜치는 `feat/arc-install-upgrade-completion`이다. 현재 T2 변경은 모두 미수용이다. 새 Coder는 기준 HEAD와 대조해 조정하며, 기존 변경이나 과거 PTY 통과를 승인·회귀 해소 근거로 간주하지 않는다.

### 공통 gate와 제약

- 개정 plan의 저장·검토·사용자 승인, 승인 문서 batch commit과 공통 handoff gate 완료 전 구현을 재개하지 않는다.
- source는 lifecycle-free이며 새 `build`·`workspaces`도 추가하지 않는다. source lock root의 `hasInstallScript`는 부재한다.
- artifact에만 `postinstall: "node scripts/postinstall.mjs"`와 일치하는 metadata·manifest를 포함한다.
- README, package version, T1의 수용된 구현을 임의로 변경하지 않는다.
- 실제 publish와 publish dry-run, workflow dispatch, 외부 network·registry 접속, push·merge·release 생성을 실행하지 않는다. consumer registry는 loopback fixture만 사용한다.
- macOS/Linux 실제 PTY가 필요하다. mock·skip·과거 결과로 대체하지 않는다.
- task별 fresh Coder → fresh QA → Orchestrator 수용·focused commit을 적용한다. Reviewer는 최종 전체 변경에 한 번만 배정한다.
- `MANIFEST.sha256`는 T2에서 T3로 순차 독점 인수한다. T2와 T3는 병렬 실행하지 않는다.

## T2. source 보존형 artifact와 대화형 npm 설치

**목표:** Git source 설치를 유지하고, 생성 artifact의 대화형 lifecycle·metadata·manifest·배포 workflow를 하나의 검증 가능한 계약으로 완성한다.

**선행:** T1 수용·commit. **위험:** significant. **commit 단위:** 아래 전체를 한 task로 수용한다.

### 파일 소유권

현재 미수용 변경을 인수·조정한다.

```text
MANIFEST.sha256
package.json
package-lock.json
lib/cli/choices.mjs
lib/cli/index.mjs
lib/cli/postinstall.mjs
lib/cli/terminal.mjs
scripts/postinstall.mjs
tests/node/cli-pty.test.mjs
tests/node/consumer.test.mjs
tests/node/fixtures/instruction-contracts.json
tests/node/fixtures/npm-sandbox.mjs
tests/node/npm-completion-consumer.test.mjs
tests/node/package.test.mjs
tests/node/npm-lifecycle-pty.test.mjs
tests/node/npm-lifecycle.test.mjs
tests/node/terminal.test.mjs
```

추가 소유 파일:

```text
lib/release/artifact.mjs
scripts/pack-release.mjs
scripts/verify-release.mjs
tests/node/release-artifact.test.mjs
tests/node/release-artifact-process.test.mjs
tests/node/npm-publish-workflow.test.mjs
.github/workflows/npm-publish.yml
```

source-root hook을 제거하고 관련 없는 fixture/hash 변경은 남기지 않는다. `instruction-contracts.json` 변경은 직접 필요성을 입증해야 한다. 다른 소유자의 변경은 임의로 되돌리지 않는다.

### 인터페이스와 생성 계약

일반 script만 추가한다.

```sh
npm run pack:release -- --out-dir <absolute-output-directory>
node scripts/verify-release.mjs --out-dir <absolute-output-directory> --name @yunhozz/arc --version <expected-version>
```

산출물은 `arc-release.tgz`, `arc-release.json`이다.

```text
buildReleaseArtifact({sourceRoot,outDir,npmCli,signal,deps})
 -> {tarballPath,receiptPath,name,version,sha512,sourceSnapshot}

verifyReleaseArtifact({outDir,expectedName,expectedVersion})
 -> verified receipt
```

receipt는 `schema:1`, name·version·tarballPath·소문자 hex sha512·sourceSnapshot·`verified:true`를 기록한다. verifier는 receipt flag를 신뢰하지 않고 tarball을 다시 검사한다.

- source manifest·package·lock을 먼저 검증한다.
- repository 밖 private staging에 실제 복사한다. hardlink·symlink 공유와 source 임시 변경을 금지한다.
- staging package에만 정확한 postinstall을 등록하고 staging lock root는 `hasInstallScript=true`로 맞춘다. dependency 설치·network 재해결은 하지 않는다.
- staging manifest를 재생성하고 lifecycle·network를 억제해 pack한다.
- 별도 extraction에서 archive 경로·package bytes·payload manifest·필수 파일을 검증한다. tarball에서 제외되는 lock과 staging lock 검사는 구분한다.
- 관련 source bytes의 정렬된 snapshot을 전후 대조한다. HEAD만으로 불변을 판단하지 않는다.
- 검증 후 tarball을 확정하고 receipt를 마지막에 기록한다.
- source 내부·상대·symlink output, 기존 최종 파일, 소유권 충돌을 거부한다.
- 실패·취소는 소유 staging만 정리한다. SIGKILL 잔여물과 receipt 없는 결과는 미완성으로 남기며 자동 재사용·임의 삭제하지 않는다.

### TDD와 구현 순서

- [ ] **RED:** source hook/flag 부재, artifact의 정확한 hook, staging lock·실제 tarball manifest 일치, 변조·pack 정규화 검출을 작성한다.
- [ ] **RED:** source 변경 race, pack/검증 실패, SIGINT·SIGKILL, 동시 실행·output 충돌, 재실행·source 불변을 작성한다.
- [ ] 신규 동작 부재 실패를 기록한다.

```sh
node --test tests/node/release-artifact.test.mjs tests/node/release-artifact-process.test.mjs
```

- [ ] generator·verifier를 구현하고 source/package 테스트를 source와 artifact로 분리한다.
- [ ] `0.1.0` 고정 기대 drift는 별도 기록 후 package/lock 일치 계약으로 조정한다. package version을 올리지 않는다.
- [ ] 기존 terminal·postinstall은 artifact에서만 연결한다. chooser 순서·defaults·limits, 상대 `CODEX_HOME`, CI/no-terminal/Windows/local/npx 준비 분기, 실제 버전 성공 문구를 유지한다.
- [ ] EOF·Ctrl+C·단절·오류에서 raw mode·descriptor·listener를 복원하고 부분 실패를 성공으로 숨기지 않는다.

fixture는 다음 두 경로를 구분한다.

```text
packSourceFixture(sourceRoot,options) -> lifecycle-free source tarball
packReleaseFixture(sourceRoot,options) -> generated tarball/metadata/receipt
```

테스트용 version·extra file 변경은 임시 source 복사본에서 package/lock·source manifest를 함께 맞춘 뒤 generator에 전달한다. registry fixture metadata는 실제 tarball에서 읽는다.

### workflow 계약

기존 `master`/package 경로 trigger, enable 변수, concurrency, previous-version·stable·lock·latest·이미 게시됨 guard, checkout credential 비저장, Node/npm setup과 `contents:read`·`id-token:write`를 유지한다.

source manifest 검사 → `$RUNNER_TEMP/arc-release` 생성 → expected name/version/digest 검증 → tarball publish 순서로 변경한다. 향후 workflow에만 다음 명령을 기록한다.

```sh
npm publish "$RUNNER_TEMP/arc-release/arc-release.tgz" --access public --provenance --registry https://registry.npmjs.org/
```

root publish fallback은 없다. 로컬 테스트는 YAML guard·권한·순서와 검증 실패 시 게시 단계 미진입을 검사하며 publish는 호출하지 않는다.

workflow의 npm 11 실행은 npm 10.9.4 증거로 입증하지 않는다. 기존 로컬 npm 11이 있으면 offline pack/consumer를 확인하고, 없으면 실제 npm 11 실행은 미검증으로 보고한다. 외부 설치는 하지 않는다.

### 실제 consumer·PTY

**Git 회귀:** 실제 source `git+file:` global install을 상속된 `npm_config_global=true`에서 두 번 실행한다. 각 설치·clone 정리 후 executable 실경로·`--version`·completion을 확인한다. dangling symlink와 재설치 `ENOTDIR`가 없어야 하며 chooser·HOME 변경도 없어야 한다. global 경로나 GitFetcher 환경 조작으로 우회하지 않는다.

테스트용 Git 생성·commit이 specialist Git 금지와 충돌하면 Orchestrator가 fixture를 준비해 전달한다. handoff 전에 방법을 확정한다.

**Artifact:** 생성 tarball을 loopback registry에 제공하고 기본 `npm i -g @yunhozz/arc`를 실행한다. foreground flag 없이 설치·재설치, 실제 선택·버전·파일·중복 없는 completion, local consumer lock flag, CI/no-terminal/script 차단·npx 준비를 확인한다.

**PTY:** macOS/expect와 Linux/script에서 전체 선택, 공백·상대 경로, Ctrl+C·EOF·단절·설치 실패와 terminal 복원을 검증한다. artifact digest·OS/arch·Node/npm·driver를 보고한다.

### T2 checks·수용

Coder만 source manifest를 갱신하고 QA는 검사만 실행한다.

```sh
node scripts/update-manifest.mjs
node --test tests/node/release-artifact.test.mjs tests/node/release-artifact-process.test.mjs tests/node/npm-publish-workflow.test.mjs tests/node/package.test.mjs
node --test tests/node/terminal.test.mjs tests/node/npm-lifecycle.test.mjs tests/node/npm-completion-consumer.test.mjs tests/node/cli-pty.test.mjs tests/node/consumer.test.mjs tests/node/cli-dry-run.test.mjs
npm run check:manifest
node --test tests/node/manifest.test.mjs
ARC_TEST_REQUIRE_PTY=1 node --test tests/node/npm-lifecycle-pty.test.mjs
```

AC-01~06、AC-16~23의 T2 범위, 실제 Git 재설치·양 플랫폼 artifact PTY, source 불변·crash/output safety, workflow guard와 README 무변경 근거를 fresh QA가 보고한다. required driver 부재는 skip 통과가 아니다.

Git 회귀, Linux 미검증, metadata/manifest 불일치, source 임시변경 필요, guard 약화, 외부 접속 필요는 보류 조건이다. Orchestrator 수용 전 T3를 시작하지 않는다.

## T3. generated artifact 기반 upgrade와 completion

**선행:** T2 QA·수용·commit. **위험:** significant. fresh Coder·fresh QA를 배정한다.

### 파일 소유권

신규:

```text
lib/cli/upgrade.mjs
lib/npm/upgrade.mjs
bin/arc-upgrade.mjs
tests/node/upgrade-cli.test.mjs
tests/node/upgrade-process.test.mjs
tests/node/npm-upgrade-consumer.test.mjs
```

수정:

```text
lib/cli/root.mjs
lib/cli/completion.mjs
tests/node/completion.test.mjs
tests/node/shell-completion.test.mjs
MANIFEST.sha256
```

T1/T2 API·generator·fixture·workflow는 읽기 전용이다. 수정 필요 시 Orchestrator에 반환한다.

### TDD·구현·증거

- [ ] **RED:** `--help`만 허용하며 native/network 없는 help, unsupported·미설치·손상 상태는 쓰기 전 실패.
- [ ] **RED:** latest 한 번 조회 → exact version·같은 prefix 교체·내부 `--ignore-scripts` → 새 CLI 실행 순서.
- [ ] **RED:** identity/version 오류·snapshot 변경·package/child/target 실패·취소·부분 성공·재실행 복구.
- [ ] **RED:** npx는 호출 package로 harness만 갱신하고 global install/latest 재조회 없음.

```sh
node --test tests/node/upgrade-cli.test.mjs tests/node/upgrade-process.test.mjs
```

- [ ] T1 context/state/upgrade API를 사용해 구현한다. old/new module 혼합을 피하고 private child는 `{protocol:1,expectedVersion,invocationCwd,expectedStateToken}`를 검증·재수집한다.
- [ ] 같은 CLI version에서도 harness를 갱신하고 target·언어·전체 모델/effort·limits·native/global 범위를 보존한다.
- [ ] `packReleaseFixture`의 A/B로 actual global upgrade를 검증한다. artifact hook의 chooser가 재등장하지 않아야 한다.
- [ ] 설정 변경 race·부분 실패 후 재시도, 실제 npx 호출·global prefix 불변, 가짜 `_npx` local 경로 거부를 검사한다.
- [ ] Bash/Zsh completion RED/GREEN: root 명령은 `preset uninstall completion upgrade`, root option 전체·`--max-`·`--v`, `upgrade --`는 `--help`, completion shell은 `zsh bash`.
- [ ] 기존 option 값·preset/uninstall·compinit 전후 및 generated artifact로 설치한 새 Zsh의 실제 Tab을 확인한다.

```sh
node scripts/update-manifest.mjs
node --test tests/node/upgrade-cli.test.mjs tests/node/upgrade-process.test.mjs tests/node/npm-upgrade-consumer.test.mjs
node --test tests/node/completion.test.mjs tests/node/shell-completion.test.mjs tests/node/preset-cli.test.mjs tests/node/uninstall-cli.test.mjs
npm run check:manifest
```

QA는 manifest 갱신을 제외한 checks를 독립 수행한다. AC-07~15와 영향받는 AC-16~23, actual global/npx consumer·부분 복구·새 세션 증거를 확인한 후 Orchestrator가 수용·focused commit한다. 설정 migration·새 option·경로 추정·안전성 완화가 필요하면 보류한다.

## 최종 검증·Reviewer·완료

task 수용과 별도로 최종 내용에서 실행한다.

```sh
npm test
npm run check:manifest
npm run check:role-policy
node --test tests/node/release-artifact.test.mjs tests/node/release-artifact-process.test.mjs tests/node/npm-publish-workflow.test.mjs
node --test tests/node/npm-completion-consumer.test.mjs tests/node/npm-upgrade-consumer.test.mjs
npm pack --dry-run --json --ignore-scripts --offline
ARC_TEST_REQUIRE_PTY=1 node --test tests/node/npm-lifecycle-pty.test.mjs
```

양 플랫폼 PTY와 generator/verifier smoke는 별도 증거로 보존한다. source 일반 pack이 generated artifact 검증을 대신하지 않는다.

이전 실패 구현의 `712 total / 705 pass / 5 fail / 2 skip`, 양 플랫폼 PTY `7/7`은 과거 기록이다. 새 Git 회귀는 반드시 해결한다. 나머지 baseline 네 건—Claude installed hook, preset 기대 두 건, uninstall PTY timeout—은 정확한 test name·재현·영향 관계와 disposition을 기록한다. 통과로 숨기거나 무단 수정하지 않는다.

모든 task의 QA·필요한 재검증·수용·commit 후 **독립 Reviewer가 최종 전체 diff를 한 번 검토**한다. 원본·개정 spec/plan, 기준/최종 HEAD, 파일 목록, baseline 판정, actual Git/artifact/PTY 결과와 workflow 한계를 전달한다. 최종 finding은 Coder → Reviewer로 해결하며 이 단계에는 QA를 재배정하지 않는다. 최종 수용은 Orchestrator가 결정한다.

실제 registry 게시·workflow 실행·provenance 생성 성공은 미검증 외부 동작이다. 필수 Linux PTY나 Git 회귀가 남으면 완료로 선언하지 않는다.

### 자체 검토

- T1 완료 상태와 미수용 T2 reconciliation을 구분했다.
- indivisible package·manifest·workflow 계약을 T2 하나로 유지했다.
- 일반 파일 소유권은 분리하고 manifest는 순차 인수한다.
- Git 재설치·artifact 실제 PTY·crash/source 불변·npm 11 한계를 보존했다.
- 새 사용자 제품 결정은 없다. Git fixture 준비 방식은 handoff 전 Orchestrator가 확정한다.
- 개정 plan 승인·문서 gate 전 구현 재개는 금지한다.
