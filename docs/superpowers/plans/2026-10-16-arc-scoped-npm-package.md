# ARC scoped npm 패키지 준비 구현 계획

> **실행 지침:** ARC 역할·승인 흐름을 따른다. CEO가 승인된 작업을 Coder에 배정하고 필수 검사와 QA 결과를 확인하여 수용한다. 구현·QA 수용 후 작업 트리를 사용자에게 돌려준다. **commit·push·publish는 별도 사용자 요청 없이 수행하지 않는다.** 체크박스는 진행 기록이다.

**목표:** `@yunhozz/arc@0.1.0`의 공개 배포 후보를 준비하고, scoped 설치 경로에서도 기존 CLI·자동완성 계약을 유지한다.

**구조:** package와 lockfile의 이름을 맞추고 npm 완성 등록의 최종 전역 경로를 scoped 위치로 변경한다. 기존 bin·postinstall·파일 transaction을 유지하며, 격리된 packed tarball 설치로 배포 후보를 검증한다.

**기술:** Node.js `>=22`, npm, ESM, 기존 native safe-fs, Node test runner, interactive zsh PTY.

**승인 근거:** 현재 대화에서 승인된 `@yunhozz/arc` 패키지 준비 설계. 기존 shell 안전 계약은 `/Users/yunho/Desktop/project/arc/docs/superpowers/specs/2026-10-16-arc-cli-models-install-lifecycle-design.md` §4와 승인된 npm 등록 수정안을 따른다.

**기준:** `/Users/yunho/Desktop/project/arc`, `master`, `da6815fb750f4d645d8570c383ac89b9f742e850`, clean worktree. 이후 구현이 승인되면 현재 `master`에서 작업하며 사용자가 직접 CLI를 확인할 수 있도록 변경 결과를 남긴다.

**계획 저장 예정 경로:** `/Users/yunho/Desktop/project/arc/docs/superpowers/plans/2026-10-16-arc-scoped-npm-package.md`. 이 초안은 Planner가 직접 저장하지 않는다.

## 공통 제약

- 현재 승인은 설계와 구현 계획 작성 범위다. 구현은 계획 검토와 실행 승인 후 시작한다.
- 패키지 이름은 `@yunhozz/arc`, 버전은 `0.1.0`이다.
- `private: true`를 제거한다.
- `publishConfig`는 다음 값으로 지정한다.

  ```json
  {
    "access": "public",
    "registry": "https://registry.npmjs.org/"
  }
  ```

- 공개 bin은 `{ "arc": "bin/arc.mjs" }`를 유지한다.
- 기존 `postinstall`만 유지한다. 새 lifecycle·runtime dependency를 추가하지 않는다.
- 전역 최종 패키지 위치는 `<prefix>/lib/node_modules/@yunhozz/arc`이다.
- 지원 환경, 사용자 판별, 로컬·npx·Git 준비 차단, scripts 비활성화, 등록 실패의 비치명적 처리와 startup 파일 안전 계약을 유지한다.
- 검증은 임시 home·prefix·cache·npm 설정 파일로 격리하며 사용자 npm credentials를 사용하지 않는다.
- README는 영어를 유지한다. registry 설치 명령은 공개 후 유효함을 명시한다.
- `npm view`의 E404를 이름 확보나 publish 권한의 증거로 사용하지 않는다.
- license 등 승인되지 않은 metadata 결정을 추가하지 않는다.
- 구현·QA 수용 후 변경된 작업 트리와 확인 결과를 사용자에게 전달한다. 별도 요청 없이 commit·push·publish하지 않는다.

## 검증 초점

1. 이름 변경과 완성 경로 변경이 함께 적용되어 실제 scoped 설치가 등록되는가.
2. 기존 unscoped 위치·중첩 dependency·Git 임시 경로를 잘못 허용하지 않는가.
3. packed 후보의 bin과 native payload가 유지되는가.
4. 로컬·scripts 비활성화·제거·재설치 계약이 보존되는가.
5. README가 준비 상태와 공개 후 설치를 구분하고 명령을 일관되게 설명하는가.

## S1. scoped 패키지 metadata·완성 경로·배포 검사 정합화

### 목표와 의존성

승인된 설계 전체를 하나의 검증 가능한 배포 후보로 제공한다. package 이름과 전역 경로 판별은 함께 바뀌어야 하므로 하나의 최상위 작업으로 묶는다.

**선행:** 이 계획의 CEO 통합·검토, 사용자 계획 승인 및 구현 진행 승인, 기준 worktree 확인.

**환경 의존성:** 기존 native test fixture, npm, zsh 및 기존 consumer PTY 검사에 필요한 Python 환경.

### 파일 소유권

Coder는 다음 8개 파일만 수정한다.

| 절대 경로 | 책임 |
|---|---|
| `/Users/yunho/Desktop/project/arc/package.json` | scoped 이름, `private` 제거, `publishConfig` |
| `/Users/yunho/Desktop/project/arc/package-lock.json` | 최상위·root package metadata 일치 |
| `/Users/yunho/Desktop/project/arc/lib/installer/npm-completion.mjs` | scoped 최종 전역 경로 판별 |
| `/Users/yunho/Desktop/project/arc/tests/node/npm-completion.test.mjs` | 정상 경로·거부 경계 검사 |
| `/Users/yunho/Desktop/project/arc/tests/node/npm-completion-consumer.test.mjs` | 격리 설치·완성·재설치·제거 |
| `/Users/yunho/Desktop/project/arc/tests/node/package.test.mjs` | metadata·archive·README 계약 검사 |
| `/Users/yunho/Desktop/project/arc/README.md` | 설치·진단·제거와 공개 상태 안내 |
| `/Users/yunho/Desktop/project/arc/MANIFEST.sha256` | 보호 payload 갱신 |

계획 문서의 저장·통합은 CEO가 맡는다. 추가 파일 수정이 필요하면 실행 전에 CEO에게 보고한다.

### 인터페이스

기존 함수와 인수·반환 형식은 유지한다.

```text
getNpmCompletionContext({env, platform, packageRoot, uid, home})
runNpmCompletionPostinstall({env, platform, packageRoot, uid, home, register, stderr})
```

변경은 `getNpmCompletionContext()`의 최종 전역 패키지 위치에 한정한다.

```text
기존: <prefix>/lib/node_modules/arc-harness
변경: <prefix>/lib/node_modules/@yunhozz/arc
```

scope 디렉터리 존재를 이유로 조건을 느슨하게 만들지 않는다. `scripts/npm-postinstall.mjs`, bin, transaction API는 변경하지 않는다.

### 구현 순서

- [ ] **1. package·문서 계약 테스트를 먼저 추가한다.**

  다음 값을 검사한다.

  ```text
  package.name === '@yunhozz/arc'
  package.version === '0.1.0'
  Object.hasOwn(package, 'private') === false
  package.publishConfig.access === 'public'
  package.publishConfig.registry === 'https://registry.npmjs.org/'
  package.bin === {arc: 'bin/arc.mjs'}
  package.scripts.postinstall === 'node scripts/npm-postinstall.mjs'
  ```

  lockfile의 최상위와 root package 이름·버전·bin이 일치하고 기존 lifecycle metadata가 유지되는지 확인한다. 기존 archive 검사를 유지하여 CLI·native 파일·manifest가 포함되는지 검사한다.

  README에는 scoped 설치·진단·제거 명령과 기존 GitHub npx 명령이 있어야 한다. 문서의 준비 상태·공개 이후 조건은 사람이 읽어 추가 확인한다.

- [ ] **2. scoped 경로 단위 테스트를 먼저 추가한다.**

  정상 fixture의 `packageRoot`를 다음으로 바꾼다.

  ```text
  /opt/npm/lib/node_modules/@yunhozz/arc
  ```

  이 위치는 기존 정상 환경에서 eligible이어야 한다. 기존 unscoped 위치, 다른 scope·package, 중첩 dependency, Git 임시 경로는 eligible이 아니어야 한다.

  기존 플랫폼·uid·home·SHELL·ZDOTDIR·lifecycle·global 조건 및 실패 처리 검사를 유지한다. 제외된 환경에서 등록 함수를 호출하지 않는지도 유지한다.

- [ ] **3. consumer 기대값을 scoped 경로로 변경한다.**

  기존 packed tarball fixture를 사용한다. 실제 설치 후 다음 경로로 bin이 해석되어야 한다.

  ```text
  <prefix>/lib/node_modules/@yunhozz/arc/bin/arc.mjs
  ```

  제거 대상은 `@yunhozz/arc`로 바꾼다. tarball 파일명은 `npm pack --json` 결과에서 읽으며 이름을 추측하지 않는다.

  기존 임시 사용자 identity fixture를 유지한다. npm은 임시 user/global config와 cache를 사용하고, subprocess 환경에 사용자 npm token·인증 설정을 전달하지 않는다. 실제 사용자 npm 설정을 읽거나 수정하지 않는다.

- [ ] **4. 신규 계약의 RED를 확인한다.**

  ```sh
  node --test tests/node/npm-completion.test.mjs tests/node/package.test.mjs tests/node/npm-completion-consumer.test.mjs
  ```

  scoped metadata·경로·문서 차이 때문에 실패하는지 확인한다. 환경 오류나 기존 실패를 신규 계약의 RED로 간주하지 않는다.

- [ ] **5. package·lockfile·완성 경로를 구현한다.**

  승인된 정확한 metadata와 scoped 경로를 적용한다. dependency 버전이나 무관한 lockfile 항목을 변경하지 않는다. 기존 runtime 지연 로딩과 startup 파일 보호 로직은 유지한다.

- [ ] **6. README 명령과 설명을 맞춘다.**

  공개 후 기본 설치:

  ```sh
  npm i -g @yunhozz/arc
  arc install
  ```

  진단:

  ```sh
  npm i -g --foreground-scripts @yunhozz/arc
  ```

  npm 패키지 제거:

  ```sh
  npm uninstall -g @yunhozz/arc
  ```

  전역 설치 없는 대안:

  ```sh
  npx --yes github:yunhozz/arc install
  ```

  registry 명령은 아직 공개 전임을 표시하고 공개 후 유효함을 설명한다. CLI 설치와 ARC 설정 적용을 구분한다.

  기존 완성 조건·예외, 현재 세션의 `eval "$(arc completion zsh)"`, 실패·출력 동작, `--skip-global` 적용 범위, 제거 후 완성 블록 유지 설명을 보존한다. 전역 `github:` shorthand를 권장 설치·진단 예시로 남기지 않는다.

- [ ] **7. focused 검사와 실제 consumer 결과를 확인한다.**

  격리된 packed tarball 설치에서 다음을 확인한다.

  - scoped 경로와 `arc` bin이 존재하며 dangling symlink가 없다.
  - `arc --version`이 `0.1.0`을 출력한다.
  - 관리 블록은 하나이며 재설치 후 bytes가 동일하다.
  - 새 interactive zsh의 실제 Tab이 `install`, `uninstall`, `completion`을 제공한다.
  - scoped npm 제거 후 관리 블록 bytes를 유지한다.
  - 로컬·scripts 비활성화·npx 임시 실행·Git 준비 fixture의 dotfile 무변경 검사가 유지된다.

- [ ] **8. manifest를 갱신하고 필수 검사 결과를 제출한다.**

  ```sh
  node scripts/update-manifest.mjs
  node --test tests/node/npm-completion.test.mjs tests/node/package.test.mjs tests/node/npm-completion-consumer.test.mjs
  node --test tests/node/completion.test.mjs tests/node/shell-completion.test.mjs
  npm run check:manifest
  ```

### 수용 기준

| ID | 기준 |
|---|---|
| S1-C1 | package와 lockfile이 `@yunhozz/arc@0.1.0`으로 일치하고 `private` 제거·public publish 설정·기존 bin과 postinstall이 정확하다. |
| S1-C2 | strict scoped 전역 경로에서만 기존 조건에 따라 완성을 등록한다. 기존 unscoped·잘못된 scope·중첩·임시 경로를 허용하지 않는다. |
| S1-C3 | 실제 packed 설치의 CLI·native payload와 새 zsh Tab이 동작한다. 재설치·제거·로컬·scripts 비활성화·Git 준비 계약을 보존한다. |
| S1-C4 | README의 설치·진단·제거 명령이 일치하고 공개 전 상태를 명시한다. 기존 GitHub npx와 완성 안전 계약을 유지한다. |
| S1-C5 | archive·manifest가 일치하고 구현 변경이 지정된 8개 파일에 한정된다. 사용자 npm 인증을 사용하지 않고 commit·push·publish를 수행하지 않는다. |

### 수용 전 QA와 증거

fresh QA는 다음을 확인하고 CEO에게 보고한다.

- Node/npm/zsh 버전과 focused 검사 종료 코드.
- 후보 archive의 이름·버전·포함 파일 및 package/lock 일치.
- 실제 설치 경로와 bin 해석 결과.
- 새 zsh PTY의 세 하위 명령 완성 출력.
- 재설치·제거 전후 관리 블록 개수와 bytes.
- 로컬·scripts 비활성화·잘못된 경로의 무변경 결과.
- README의 명령과 구현·검사 대응 위치, 공개 상태 표현 확인.
- 임시 npm 설정·환경 격리 방식과 사용자 인증 미사용 근거.

검사 통과와 보고서 제출은 CEO 수용을 대신하지 않는다.

### 보류 조건

다음 상황은 CEO에게 보고한 뒤 해당 의존 작업을 보류한다.

- 기준 HEAD·worktree가 다르거나 예상하지 못한 사용자 변경이 있다.
- metadata 변경만으로 처리할 수 없어 추가 runtime·native·transaction 수정이 필요하다.
- scoped 설치 경로가 예상과 달라 strict 판별을 완화해야 한다.
- 기존 GitHub npx·Git 준비 차단 또는 startup 안전 계약과 충돌한다.
- 인증 없이 격리 검사를 수행할 수 없거나 zsh PTY 증거를 확보할 수 없다.
- license·공개 권한·registry 상태에 관한 추가 결정을 metadata에 넣어야 한다.

E404나 로그인 상태를 이유로 실제 공개를 진행하지 않는다.

### 수용과 사용자 인계

CEO가 S1-C1–S1-C5와 필수 검사·QA 발견 사항을 확인하여 수용한다.

수용 후 현재 `master`의 작업 트리를 그대로 사용자에게 돌려주고 다음을 보고한다.

- 변경된 8개 파일과 핵심 동작.
- 검사·QA 결과와 남은 제한.
- 사용자가 직접 확인할 수 있는 CLI 경로와 명령.
- 아직 npm registry에 공개되지 않았다는 상태.
- commit·push·publish를 수행하지 않았다는 상태.

별도 사용자 요청 없이 commit·push·publish하지 않는다. 검증용 임시 전역 설치를 사용자의 실제 전역 설치로 바꾸거나 실제 home에 등록하지 않는다.

## 최종 전체 계획 확인

S1 수용 후 최종 통합 확인으로 다음을 수행한다.

```sh
npm test
npm run check:manifest
```

이는 S1 수용 전 focused 검사와 구분한다. 이후 실패나 변경이 발생하면 영향 범위에 필요한 검사를 다시 수행하고 CEO가 결과를 판정한다. 최종 확인 결과까지 포함하여 작업 트리를 사용자에게 인계한다.

실제 registry 공개와 공개 패키지 설치 검증은 향후 별도의 명시적 승인 뒤에 다룬다. 이번 계획에는 공개 실행 단계나 credentials 사용 단계를 넣지 않는다.

## 자체 점검

- 승인된 설계와 8개 파일 범위, test-first·검증 순서를 유지했다.
- 구현 수용 후 자동 commit 문장과 commit 메시지 블록을 제거했다.
- 현재 `master`에서 사용자가 직접 CLI를 확인하도록 작업 트리 인계를 명시했다.
- 계획 작성 승인과 구현 진행 승인을 구분했다.
- commit·push·publish는 별도 사용자 요청 전까지 수행하지 않는다.
- 파일은 저장하지 않았고 코드·구성·테스트 변경도 수행하지 않았다.
