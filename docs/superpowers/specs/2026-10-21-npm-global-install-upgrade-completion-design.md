# npm 전역 설치·ARC upgrade·completion 설계

## 1. 목적과 승인 범위

사용자는 다음 명령 한 번으로 전역 CLI 설치와 대화형 harness 설치를 이어서 완료한다.

```sh
npm i -g @yunhozz/arc
```

npm이 ARC의 postinstall을 실행하고 대화 가능한 터미널이 있으면 기존 target·preset·language 선택 화면을 표시한다. 사용자가 선택을 마치면 harness를 설치하고 실제 패키지 버전을 포함한 성공 문구를 표시한다. 추가 npm flag나 사용자 npm 설정 변경은 요구하지 않는다.

`arc upgrade`는 전역 CLI와 이미 설치된 harness를 함께 갱신한다. npx로 실행한 upgrade는 호출된 패키지를 사용해 harness를 갱신하며 전역 CLI를 설치하지 않는다.

Bash/Zsh completion에서 기존 root option 완성을 확인하고, 새 `upgrade` 명령과 지원 option을 help 및 completion에 반영한다.

README 수정, Windows의 자동 lifecycle 선택 화면, 패키지 배포·게시, 원격 push·merge는 범위에서 제외한다.

## 2. 실행 대상과 근거

| 항목 | 값 |
|---|---|
| Workspace / repository | `/Users/ma-24-007/Desktop/workspace/arc` |
| 브랜치 | `feat/arc-install-upgrade-completion` |
| 기준 HEAD | `64ad6e730c7944bafb32ad4a712167eca00c33ec` |
| 준비 근거 | 사용자의 대상 변경 지시에 따라 Orchestrator가 같은 checkout에 새 브랜치를 생성하고 clean 상태 확인 |
| 변경 소유권 | spec 작성 시 구현 변경 없음. 이후 파일 편집은 Coder, 수용 및 Git 변경은 Orchestrator 담당 |
| spec 경로 | `/Users/ma-24-007/Desktop/workspace/arc/docs/superpowers/specs/2026-10-21-npm-global-install-upgrade-completion-design.md` |
| 후속 plan 경로 | `/Users/ma-24-007/Desktop/workspace/arc/docs/superpowers/plans/2026-10-21-npm-global-install-upgrade-completion.md` |

이 작업은 Architectural 변경이다. 이 spec의 사용자 승인 후 별도 implementation plan을 작성하고 승인받는다. 이 문서는 task 분해나 구현 순서를 확정하는 plan이 아니다.

현재 구현과 준비 실험에서 확인한 사실은 다음과 같다.

- `package.json`에는 lifecycle hook이 없으며 package/consumer 테스트가 이를 기존 계약으로 검사한다.
- 설치 CLI는 입력·출력이 TTY이면 기존 선택 화면을 사용하고, 비대화형 실행에서는 target·preset·language를 요구한다. [index.mjs](/Users/ma-24-007/Desktop/workspace/arc/lib/cli/index.mjs:20)
- npm 10.9.4 기본 lifecycle은 터미널 stdio를 공유하지 않는다. Orchestrator의 macOS 임시 패키지 실험에서는 `/dev/tty`를 직접 열어 질문과 응답을 처리할 수 있었다.
- `foreground-scripts`의 기본값은 false이며 `ignore-scripts`는 lifecycle 실행을 차단한다. 패키지 hook이 실행되지 않는 상황은 패키지 코드로 해결하지 않는다. [npm v10 설정](https://docs.npmjs.com/cli/v10/using-npm/config/#foreground-scripts)
- 기존 completion은 `arc --…`의 root option 후보를 이미 제공한다. [completion.mjs](/Users/ma-24-007/Desktop/workspace/arc/lib/cli/completion.mjs:1)
- harness의 언어·모델 설정·limits는 저장되어 있지만 semantic harness 버전 기록은 없다.

## 3. 전역 설치 동작

### 3.1 lifecycle 진입 조건

postinstall은 다음 조건을 충족할 때만 대화형 harness 설치를 시작한다.

1. macOS 또는 Linux이다.
2. 현재 실행이 ARC 패키지의 최종 전역 설치 lifecycle임을 확인할 수 있다.
3. CI 등 명시적인 비대화형 실행 환경이 아니다.
4. 현재 프로세스가 사용자의 대화 가능한 터미널에 연결할 수 있다.

`npm_config_global` 같은 단일 환경 변수만으로 최종 전역 설치라고 판단하지 않는다. 전역 설정이 상속된 local/Git preparation 경로가 사용자 홈을 변경하지 않도록, 패키지의 실제 설치 위치와 실행 문맥을 함께 확인한다.

판별이 불확실한 경우에는 harness 설치를 시작하지 않는다. 최종 판별 구현은 지원 npm 환경의 consumer 검증으로 입증해야 한다.

### 3.2 터미널 연결과 기존 선택 화면

- postinstall의 표준 입력·출력이 TTY이면 해당 stream을 사용할 수 있다.
- 기본 npm 실행처럼 stdio가 TTY가 아니면 `/dev/tty`에 직접 연결한다.
- 연결한 터미널을 기존 CLI의 입력·출력·오류 stream으로 전달한다.
- target·preset·language 및 기존 설치 흐름에서 요구하는 limits 선택을 재사용한다.
- 기존 선택 순서, 표시 방식 및 기본 선택을 바꾸지 않는다. 현재 target 기본 선택은 Claude, preset은 Balanced이며 언어는 기존 추론·기본값을 따른다.
- 선택 화면을 띄웠다는 이유만으로 기본 선택을 확정하지 않는다. 사용자의 입력을 기다린다.
- 기존 `npx` 또는 직접 `arc` 실행 경로의 선택 동작을 유지한다.

별도 terminal 창, detached background 설치 프로세스, npm 설정 변경은 만들지 않는다. npm은 postinstall이 완료될 때까지 기다린다.

### 3.3 설치와 성공 문구

선택 이후 기존 installer의 payload 검증, safe-fs, 설치 계획 검증, 외부 skill 취득, transaction 및 rollback을 재사용한다.

모든 선택 대상의 harness 설치가 성공한 경우 다음 형식으로 알린다.

```text
ARC version x.x.x installed!
```

`x.x.x`는 실제 설치에 사용한 패키지의 `package.json.version`이다. 대상별 요약은 유지할 수 있다.

성공 문구는 npm이 lifecycle 출력을 수집하는 기본 설정에서도 사용자 터미널에 표시되어야 한다. npm 자체의 최종 설치 요약이 그 뒤에 출력되는 것은 허용한다. ARC 성공 문구가 npm 출력의 마지막 줄이라고 보장하지 않는다.

직접 `arc`/npx로 실행한 정상 설치에도 동일한 버전 표기를 사용한다. `--check`와 `--dry-run`에는 설치 성공 문구를 출력하지 않는다.

### 3.4 비대화형·미지원·차단 환경

| 상황 | 동작 |
|---|---|
| 터미널 없음 또는 연결 불가 | 선택·harness 설치를 건너뛰고 CLI 설치만 완료 |
| CI 등 명시적 비대화형 환경 | `/dev/tty`가 우연히 열려도 자동 질문하지 않음 |
| local dependency 설치 | 자동 harness 설치 없음 |
| npx 패키지 준비 | 자동 harness 설치 없음. 이후 CLI 실행에서 기존 흐름 사용 |
| Git preparation 또는 중첩 npm 준비 | 자동 harness 설치 없음 |
| Windows | 자동 lifecycle 선택 화면 없음 |
| npm이 hook 실행 차단 | hook 미실행. package 코드가 정책 변경·재실행을 시도하지 않음 |

실행된 hook이 설치를 건너뛰면 `arc`로 설치를 마무리할 수 있다는 안내를 가능한 출력 경로에 기록한다. 기본 npm 설정이 이 출력을 숨기거나 hook 자체를 차단할 수 있으므로 안내 표시를 보장하지 않는다.

이 경우 harness 설치 성공을 출력하지 않는다. 설치 완료에 필요한 값이 없다는 이유로 Claude·Codex 또는 다른 설정을 자동 확정하지 않는다.

### 3.5 취소와 실패

- 선택 중 취소하면 harness 설치를 시작하지 않는다.
- 설치 중 취소하면 기존 installer의 중단·rollback 경로를 따른다.
- ARC 프로세스는 취소를 130으로 보고한다. 최종 npm 종료 코드·오류 형식은 npm이 변환할 수 있으므로 사용자에게 npm도 정확히 130을 반환한다고 약속하지 않는다.
- 대화형 설치가 시작된 뒤 설치에 실패하면 lifecycle은 실패로 종료한다.
- 일부 대상만 성공하면 전체 설치 성공 문구를 출력하지 않는다.
- 결과에는 대상별 설치 상태, rollback 결과, 남은 복구 경로를 포함한다.
- npm이 실패한 CLI 패키지를 유지하는지는 npm의 처리에 달려 있다. 대화형 실패 후에도 `arc`가 반드시 남는다고 주장하지 않는다.
- 정상 종료·실패·취소에서 열었던 터미널 stream과 descriptor를 정리하고 raw mode, cursor 등 변경한 터미널 상태를 복원한다.

터미널 연결 전 실패와 연결 이후 실제 설치 실패를 구분한다. 전자는 자동 설치를 건너뛰는 조건이고, 후자는 성공으로 숨기지 않는다.

## 4. 설치 상태 탐지와 설정 보존

### 4.1 대상 탐지

upgrade는 기존 target resolver를 사용한다.

- Codex: 기존 `CODEX_HOME` 해석 규칙을 따른다.
- Claude: 기존 `~/.claude` 및 `CLAUDE_CONFIG_DIR` 검증 규칙을 따른다.
- npm lifecycle의 패키지 디렉터리로 작업 디렉터리가 바뀌더라도, 상대 `CODEX_HOME`은 사용자가 호출한 원래 위치를 기준으로 해석해야 한다. 원래 위치를 확정할 수 없으면 해당 설정으로 쓰기를 진행하지 않는다.

플랫폼 홈 디렉터리가 존재한다는 사실만으로 ARC 설치라고 판정하지 않는다. `<target.home>/skills/arc`와 ARC 설치 파일을 검사한다.

- ARC 설치 흔적이 전혀 없으면 미설치 대상이다.
- 정상 ARC 설치와 설정이 있으면 갱신 대상이다.
- ARC 설치 흔적은 있지만 필수 파일이 없거나 설정이 손상되었으면 불완전 설치다.
- 불완전 설치를 미설치로 숨기거나 기본 설정으로 복구하지 않는다. 진단 후 쓰기 전에 중단한다.
- 미설치 플랫폼을 upgrade 과정에서 새로 추가하지 않는다.
- 설치된 대상이 하나도 없으면 초기 설치 방법을 안내하고 upgrade는 실패로 종료한다.

### 4.2 보존할 설정

대상마다 다음 정보를 독립적으로 읽고 보존한다.

| 저장 정보 | 보존 계약 |
|---|---|
| `skills/arc/settings.toml` | 선택한 언어 보존 |
| `skills/arc/models.toml` | 선택 preset과 유효한 role별 모델·effort 설정 전체 보존 |
| `skills/arc/limits.toml` | total·concurrent limits 보존 |
| 기존 global 설정 | ARC가 관리하지 않는 내용과 사용자의 현재 native 설정 보존 |
| 기존 completion 등록 | 중복 생성 없이 유지·필요한 관리 block 갱신 |

Codex와 Claude가 서로 다른 설정을 가지면 각각 보존한다. 두 플랫폼을 하나의 target/preset/language 값으로 재설치하지 않는다.

현재 installer는 패키지 기본 모델 설정에 preset을 적용하므로, 단순히 기존 preset 이름만 전달하는 방식으로는 전체 설정 보존 계약을 충족하지 못한다. 새 payload로 profile을 생성하되 저장된 유효 모델 설정을 사용해야 한다.

설정 parser·schema가 기존 설정을 수용하지 못하면 이유를 알리고 중단한다. 이 작업에서는 누락값을 현재 기본값으로 대체하는 암묵적 migration을 제공하지 않는다.

### 4.3 global 설정 범위

현재 설치에는 과거 `--skip-global` 선택을 직접 복원할 명시적 기록이 확인되지 않았다. 따라서 그 값을 임의로 추정해 global 설정을 새로 적용하지 않는다.

upgrade는 다음을 보장한다.

- 기존에 없는 global instruction block이나 completion block을 새로 추가하지 않는다.
- 기존에 있는 ARC 소유 block을 갱신할 때는 다른 내용을 보존한다.
- native concurrency 값을 현재 ARC limits로 재설정하지 않는다.
- 기존 외부 skill이 사용자가 관리하는 내용인지 판별되지 않으면 새 변경 범위로 확장하지 않는다.

새 payload가 지금까지 없던 global 설정을 반드시 요구하면 기존 설치 범위를 확대하는 결정이므로 해당 동작은 중단하고 Orchestrator에 반환한다.

### 4.4 버전 기록

이번 기능을 위해 새 semantic harness 버전 저장 형식은 필수로 도입하지 않는다.

기존 harness 버전을 확인할 근거가 없으면 `unknown` 또는 버전 미기록 상태로 표현한다. 파일 수정 시각이나 현재 CLI 버전으로 이전 harness 버전을 추정하지 않는다.

같은 버전의 CLI가 이미 설치되어 있어도 harness 갱신을 수행할 수 있어야 한다. CLI 버전 일치만으로 `Already up to date`라고 종료하지 않는다. 완료 후에는 이번 갱신에 실제 사용한 패키지 버전을 보고한다.

## 5. `arc upgrade`

### 5.1 공개 인터페이스

기본 명령은 다음과 같다.

```sh
arc upgrade
arc upgrade --help
```

초기 공개 option은 `--help`로 제한한다. 새 `--target`, `--check`, `--dry-run`, 버전 지정 option은 이번 필수 범위에 추가하지 않는다. root의 기존 `--version`은 CLI 패키지 버전을 출력하는 동작을 유지한다.

지원하지 않는 option이나 추가 positional argument는 입력 오류로 처리하고 usage와 종료 코드 2를 제공한다. `upgrade --help`는 network·native installer·설치 상태 없이 동작해야 한다.

### 5.2 전역 CLI 실행

전역 설치에서 실행한 upgrade는 다음 결과를 제공한다.

1. 현재 실행이 전역 ARC인지 확인한다.
2. 설치 대상과 보존할 설정, destination 안전성을 사전 검사한다.
3. 사용 중인 npm registry 설정으로 `@yunhozz/arc`의 `latest` dist-tag 버전을 확인한다.
4. 확인한 정확한 버전으로 동일한 전역 설치 위치의 ARC CLI를 갱신한다.
5. 갱신된 CLI가 보존 설정을 다시 검증하고 harness를 갱신한다.
6. CLI 단계와 각 harness 단계의 실제 결과를 출력한다.

`latest`는 npm의 `latest` dist-tag이다. Git branch 최신 상태, 전체 버전 중 최댓값 또는 임의 prerelease를 의미하지 않는다.

조회한 버전을 정확한 설치 인자로 고정한다. 실행 도중 dist-tag가 바뀌어도 다른 버전을 설치하지 않는다. 조회 결과는 패키지 identity와 지원하는 버전 형식으로 검증한다.

사용 중인 ARC와 다른 npm prefix의 패키지를 실수로 갱신하지 않는다. 전역 소유 위치를 신뢰할 수 없으면 쓰기 전에 중단한다.

### 5.3 자기 교체와 handoff

- package 교체 단계에서는 postinstall chooser를 실행하지 않는다. 내부 npm 호출에서 lifecycle을 억제해 중복 설치와 재귀 실행을 방지한다.
- 사용자의 npm 전역 설정 파일은 바꾸지 않는다.
- lifecycle 억제는 upgrade가 자기 패키지를 교체하는 내부 호출에만 적용한다.
- 교체 후 harness 설치는 갱신된 CLI 프로세스가 수행한다.
- 기존 프로세스가 교체 중인 모듈을 뒤늦게 import하여 이전·새 버전 코드를 혼합하지 않게 한다.
- 새 CLI의 package identity와 버전이 확정한 후보와 일치하는지 확인한 뒤 harness 변경을 시작한다.
- private handoff가 필요하면 일반 사용자의 공개 명령으로 노출하지 않는다. 전달 데이터는 검증하고, 민감한 환경·registry 인증 정보를 저장하거나 출력하지 않는다.
- 설정은 새 프로세스에서도 다시 읽고 검증한다. 사전 검사 후 파일이 바뀌었다면 기존 snapshot으로 덮어쓰지 않는다.

이미 후보 버전인 경우 불필요한 package 교체는 생략할 수 있지만, 새 버전 코드로 harness 갱신을 수행한다는 계약은 유지한다.

### 5.4 npx 실행

```sh
npx --yes @yunhozz/arc@latest upgrade
```

위 실행은 npx가 선택한 패키지의 payload로 기존 harness를 갱신한다.

- 전역 CLI를 설치·교체하지 않는다.
- 다시 `latest` 패키지를 내려받는 중첩 upgrade를 하지 않는다.
- 사용자가 특정 버전으로 npx를 호출했다면 그 버전을 사용한다.
- 결과에 실제 사용한 패키지 버전을 표시한다.
- 설치 대상 탐지·설정 보존·실패 처리는 전역 upgrade의 harness 단계와 동일하다.
- npx 패키지를 준비하는 postinstall에서는 chooser를 열지 않는다. 공개 `upgrade` 실행에서만 갱신한다.

전역 설치와 npx 실행은 실행 경로·npm 문맥 등의 근거로 판별한다. 판별할 수 없는 local dependency 또는 직접 source 실행은 자동 전역 교체를 하지 않고 지원되는 실행 경로를 안내한다. 임의 디렉터리를 npx cache로 오인하지 않도록 근거 없는 path 부분 문자열 판별은 사용하지 않는다.

### 5.5 오류와 부분 성공

| 실패 지점 | 요구 동작 |
|---|---|
| 입력·실행 형태·설정·대상 검증 | 쓰기 전에 중단, 문제 경로와 원인 표시 |
| registry 조회 | package/harness 변경 없이 실패 |
| npm package 교체 | harness 갱신 시작하지 않음. CLI 상태가 확실하지 않으면 미확인으로 보고 |
| 교체된 CLI 검증·실행 | harness 변경하지 않음. package 단계 결과 별도 표시 |
| 하나 이상의 harness 갱신 | 대상별 결과와 rollback·잔여 경로 출력, 전체 실패 |
| 취소 | 진행 단계와 대상별 완료 여부 표시, 가능한 기존 rollback 수행 |

CLI package와 여러 harness를 하나의 원자적 transaction으로 취급하지 않는다. package 갱신 후 harness가 실패하면 “CLI 갱신 성공, harness 갱신 실패”를 명시한다.

실패했다고 이전 CLI까지 되돌렸다고 보고하지 않는다. 다음 `arc upgrade` 또는 적절한 npx 실행으로 harness 갱신을 재시도할 수 있어야 한다. 실제 executable이 사라졌다면 npx 등 현재 상태에 맞는 복구 경로를 안내한다.

ARC command의 정상 성공은 0, 입력·지원 환경·설정 오류는 2, 실행 실패는 1, 취소는 130으로 구분한다. child npm 오류를 전달하면서 전체 성공으로 바꾸지 않는다.

## 6. completion과 help

### 6.1 후보 계약

Bash와 Zsh가 동일한 공개 CLI 문법을 반영한다.

- `arc <TAB>`: `preset`, `uninstall`, `completion`, `upgrade`.
- `arc --<TAB>`: 현재 root installation option 전체.
- `arc --max-<TAB>`: 두 subagent limit option.
- `arc --v<TAB>`: `--version`.
- `arc upgrade --<TAB>`: `--help`.
- `arc completion <TAB>`: `zsh`, `bash`.
- 기존 target·preset·language 값 완성을 유지한다.
- 각 하위 명령에 지원하지 않는 root option을 제안하지 않는다.

root option 전체는 현재 parser가 지원하는 다음 목록이다.

```text
--target
--preset
--language
--max-total-subagents
--max-concurrent-subagents
--check
--dry-run
--skip-global
--help
--version
```

`upgrade` help와 root usage에도 새 명령을 추가한다. parser가 지원하지 않는 문법을 completion이나 help에서 약속하지 않는다.

### 6.2 등록과 현재 세션

기존 Zsh managed block 등록 방식을 재사용한다.

- lifecycle을 통해 정상 harness 설치한 경우에도 등록한다.
- 재설치·upgrade 시 block을 중복 생성하지 않는다.
- 손상된 marker, symlink 또는 쓰기 불가 destination은 기존 안전성 규칙으로 처리한다.
- 새 Zsh 세션에서 `arc` completion을 자동 등록한다.
- 현재 shell은 npm의 부모 프로세스이므로 자동 변경했다고 주장하지 않는다.
- 현재 세션용으로 다음 명령을 안내한다.

```sh
eval "$(arc completion zsh)"
```

Bash는 생성되는 completion script와 동작을 검증한다. Bash 시작 파일을 자동 수정하는 기능은 추가하지 않는다.

## 7. 안전성과 기존 동작 보존

- 기존 safe-fs 및 manifest 검증을 우회하지 않는다.
- destination symlink, 잘못된 설정, snapshot 변경을 일반 `fs.writeFile` 대체 경로로 처리하지 않는다.
- npm 실행은 명령 문자열 조합 대신 고정 executable과 argument 배열 등 안전한 프로세스 호출을 사용한다.
- registry 반환값이나 설치 경로를 shell code로 평가하지 않는다.
- 임의 `sudo`, 권한 상승, 다른 사용자의 HOME 추정은 하지 않는다.
- npm의 `ignore-scripts`나 script 허용 정책을 수정하거나 우회하지 않는다.
- 네트워크·권한 실패를 감추지 않는다.
- 사용자 관리 파일의 비 ARC 내용과 native 설정을 보존한다.
- help/version/completion은 installer asset이나 native 모듈 없이도 동작한다.
- 전역 package uninstall과 harness uninstall의 기존 분리 의미를 바꾸지 않는다.
- README는 어떤 단계에서도 수정 대상에 넣지 않는다.

## 8. 예상 영향 범위

아래는 책임 표면이며 정확한 파일 생성·수정 목록과 task 경계는 후속 plan에서 확정한다. 모든 경로는 `/Users/ma-24-007/Desktop/workspace/arc` 아래이다.

| 표면 | 예상 파일·디렉터리 |
|---|---|
| 배포 lifecycle | `package.json`, `package-lock.json`, `scripts/` 또는 `lib/`의 신규 lifecycle 진입점 |
| 터미널 연결·설치 결과 | `lib/cli/index.mjs`, `lib/cli/choices.mjs`, 신규 터미널 adapter |
| upgrade dispatch·실행 | `lib/cli/root.mjs`, 신규 upgrade CLI 및 지원 모듈 |
| 상태 보존·설치 재사용 | `lib/installer/`, 필요 시 `lib/models/` |
| completion | `lib/cli/completion.mjs`, `lib/installer/shell-completion.mjs` |
| 회귀 검증 | `tests/node/package.test.mjs`, `tests/node/npm-completion-consumer.test.mjs`, `tests/node/completion.test.mjs`, 관련 신규·기존 installer/upgrade 테스트 |
| 배포 일관성 | 실제 배포·manifest 관리 대상에 필요한 기존 기록 |

현재 `package.test.mjs`는 package 버전 `0.1.0`을 기대하지만 실제 package는 `0.1.5`이다. 이를 baseline drift로 별도 기록한다. 신규 lifecycle 계약 때문에 필요한 테스트 변경과 구분해 처리하며, feature 실패나 통과를 설명하는 근거에서 숨기지 않는다.

## 9. 수용 기준

| ID | 기준 |
|---|---|
| AC-01 | npm 10.9.4/macOS의 격리된 실제 전역 설치에서 추가 flag 없이 기존 선택 화면이 표시되고 입력에 따라 harness 설치 완료 |
| AC-02 | Linux에서도 동일한 대화형 lifecycle 계약을 실제 PTY 기반 검증으로 확인 |
| AC-03 | 성공 시 실제 package 버전을 포함한 문구가 터미널에 표시되고 모든 선택 대상 설치 결과와 일치 |
| AC-04 | no-terminal·CI·Windows·local·npx preparation·Git preparation에서는 자동 질문·harness 변경 없음 |
| AC-05 | script 차단 상태에서 hook 우회 없음. CLI 설치와 harness 설치를 혼동하는 성공 표시 없음 |
| AC-06 | 취소·오류 이후 터미널 상태 복원, 성공 오표시 없음, installer rollback·잔여 경로 보고 |
| AC-07 | 전역 upgrade가 npm `latest`를 한 번 확정하고 같은 전역 위치의 정확한 버전으로 CLI 교체 후 새 CLI로 harness 갱신 |
| AC-08 | npx upgrade는 호출된 package 버전만 사용하고 전역 CLI 변경 없음 |
| AC-09 | 기존 대상만 갱신하고 플랫폼별 언어·preset·전체 모델 설정·limits 및 기존 global 설정 범위 보존 |
| AC-10 | 손상·누락 설정과 불완전 설치는 기본값 덮어쓰기 없이 변경 전에 진단 |
| AC-11 | CLI 버전 일치 시에도 harness 갱신 가능. 이전 harness 버전 미기록을 추측하지 않음 |
| AC-12 | package/harness 단계 실패·부분 성공·취소를 실제 상태와 종료 코드로 구분하고 복구 안내 제공 |
| AC-13 | Bash/Zsh에서 root 전체 option·prefix·값 후보·upgrade 후보가 실제 parser와 일치 |
| AC-14 | 새 Zsh 세션에서 자동 활성화, 현재 세션 안내, 재설치 시 등록 중복 없음 |
| AC-15 | help/version/completion의 경량 실행 계약 및 기존 preset/uninstall 동작 유지 |
| AC-16 | package/lockfile·배포 파일·필요한 manifest 일관성 유지. README 변경 없음 |

## 10. 검증 요구와 완료 판단

사용자는 필요한 테스트 추가·실행을 허용했다. 실제 package와 사용자 환경을 보호하기 위해 npm prefix·HOME·cache·설정 파일·설치 대상은 격리한다.

필수 검증은 다음 범위를 포함한다.

- npm 10.9.4의 실제 global package 설치와 postinstall PTY 입력.
- macOS 및 Linux의 질문 표시, 선택 적용, 성공 출력.
- Ctrl+C·EOF·터미널 단절·installer 실패에서 terminal cleanup과 결과 보고.
- no-terminal·CI·script 차단·local/npx/Git preparation 및 상속된 global 설정.
- 대상별로 서로 다른 설정, 사용자 수정 모델 값, 상대·절대 `CODEX_HOME`, 불완전 설치·손상 설정.
- 중첩 postinstall 없이 수행되는 package 교체와 새 CLI handoff.
- registry 실패·권한 실패·교체 후 검증 실패·부분 harness 실패·재실행 복구.
- package 버전이 이미 같은 경우의 harness 갱신.
- Bash candidate 검증과 실제 interactive Zsh Tab 및 새 세션 등록.
- 기존 installer/preset/uninstall, 배포 package·lockfile·manifest 관련 회귀.

현재 macOS `/dev/tty` 실험은 단순 질문·입력의 가능성 근거이다. 실제 ARC chooser, raw mode 복원, Linux, upgrade 전체 성공의 증거를 대신하지 않는다.

공개 lifecycle과 사용자 설정·갱신 순서가 바뀌므로 검증 위험은 significant이다. 후속 plan의 각 구현 task에는 해당 위험과 의존성에 맞는 QA·수용 기준을 둔다. 필요한 QA와 재검증을 완료하고 모든 task를 수용한 후, 최종 전체 변경을 독립 Reviewer가 한 번 검토한다. 개별 task마다 Reviewer를 요구하지 않는다.

테스트 통과·역할 보고는 Orchestrator의 수용을 대신하지 않는다. 최종 상태에서 미검증 플랫폼이나 실패 시나리오가 남으면 해당 수용 기준을 미검증으로 표시하고 완료 여부를 Orchestrator가 판단한다.

## 11. 보류 조건과 구현 재량

다음은 Coder가 임의로 바꾸면 안 되는 보류 조건이다.

- Linux에서 `/dev/tty` chooser나 취소 복구가 승인한 UX를 충족하지 못함.
- 최종 global install과 Git/local/npx preparation을 안전하게 구분할 수 없음.
- global 실행과 npx 실행을 신뢰할 수 있게 판별할 수 없음.
- 기존 설정을 보존하려면 schema migration이나 새 사용자 기본값 결정이 필요함.
- 기존 global 설정의 부재를 유지할 수 없고 새 설정을 강제로 추가해야 함.
- 정확한 전역 package 위치나 새 CLI identity를 확인할 수 없음.
- 기존 safe-fs·manifest·transaction 계약을 약화해야만 구현 가능함.
- README 또는 Windows 자동 lifecycle 지원이 필요해짐.

이 경우 영향받는 구현을 중단하고 Orchestrator에 근거와 선택지를 반환한다.

다음은 승인한 계약을 만족하는 범위에서 구현자가 정할 수 있다.

- 신규 모듈명과 내부 함수 경계.
- 터미널 fd를 기존 CLI에 전달하는 구체적 방식.
- 안전한 private handoff의 전송 형태.
- 설정 snapshot과 결과를 내부에서 표현하는 자료형.
- 성공 문구 외의 세부 진단 문장과 테스트 fixture 구성.
