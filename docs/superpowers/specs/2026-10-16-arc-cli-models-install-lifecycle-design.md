# ARC 명령·모델 설정·설치 수명주기 통합 설계

상태: 설계 승인 반영, written spec 승인 대기  
작성일: 2026-10-16  
작업 저장소: /Users/yunho/Desktop/project/arc  
기준: master, 460975714ad5f6cb48c17a674a497fdd93917d9c

## 1. 목적

ARC 설치·제거의 공개 명령을 arc로 통합하고 shell 완성으로 다음 명령을 발견할 수 있게 한다. Claude와 Codex의 역할별 모델·preset 설정을 플랫폼별 models.toml 하나로 관리한다.

설치는 영구 backup·recovery 자료를 생성하지 않는다. 실행 중 동일 부모의 .arc-stage-*에 이전 원본을 잠시 보존하여 rollback에 사용하고, 성공 또는 rollback 완료 후 정리한다. 마지막 설치 선택이 끝난 직후 진행 표시를 시작한다.

## 2. 승인된 범위와 제약

구현 범위는 다음과 같다.

- 하나의 arc dispatcher와 install·uninstall 하위 명령
- zsh 완성 및 관리 블록을 통한 ~/.zshrc 자동 등록
- bash 완성 스크립트와 등록 안내
- 플랫폼별 통합 models.toml, version = 1, root preset = "balanced"
- 다섯 역할 각각의 economy·balanced·smart 설정
- presets.toml 제거와 설정 소비자 동시 변경
- 영구 backup·recovery 생성 제거와 임시 stage 정리
- 마지막 설치 선택 직후 TTY spinner 또는 비TTY 진행 문장
- 관련 배포·문서·검증 갱신

현재 PC의 기존 ARC 백업 네 개는 휴지통으로 이동된 상태다. 사용자가 처리하므로 추가 삭제, 휴지통 영구 삭제, 기존 자료 자동 탐색·정리는 구현 범위에 포함하지 않는다.

기존 safe-fs의 descriptor 기반 경로 확인, symlink 제한, drift 감지와 managed block 경계는 유지한다. 설정 변경을 이유로 역할 권한이나 역할 지침을 변경하지 않는다.

## 3. 공개 CLI 계약

npm 공개 bin은 arc 하나다. 기존 arc-install·arc-uninstall bin 등록과 독립 진입점은 제거한다.

| 입력 | 동작 |
|---|---|
| arc | 하위 명령과 사용법 표시, 종료 코드 0 |
| arc --help | root 도움말 표시, 종료 코드 0 |
| arc --version | package 버전 표시, 종료 코드 0 |
| arc install [options] | 설치 실행 |
| arc uninstall [options] | 제거 실행 |
| arc completion zsh | zsh 완성 스크립트만 stdout에 출력 |
| arc completion bash | bash 완성 스크립트만 stdout에 출력 |
| 알 수 없는 명령·옵션 | 오류와 해당 사용법 표시, 종료 코드 2 |

각 하위 명령은 --help를 지원한다. 설치·제거의 기존 옵션, 입력 검증과 비대화형 요구 조건을 보존한다.

- 설치: --target <claude|codex|all>, --preset <economy|balanced|smart>, --check, --dry-run, --skip-global
- 제거: --target <claude|codex|all>, --dry-run, --skip-global
- 설치의 --check와 --dry-run은 함께 사용할 수 없다.
- 비대화형 설치는 target과 preset을 명시해야 한다.
- 비대화형 제거는 target을 명시해야 한다.
- 취소는 종료 코드 130, 실행 실패는 기존 분류에 따라 1 또는 2를 사용한다.

대화형 설치의 기존 기본 선택을 유지한다. preset 기본 선택은 balanced다. install.command는 새 dispatcher의 install을 실행하고 전달된 인수를 보존한다.

구형 명령 alias를 유지하는 호환 계층은 제공하지 않는다. README와 도움말을 함께 갱신하여 명령 이전 방법을 알린다.

## 4. Shell 완성 계약

완성은 하위 명령, 명령별 옵션, 열거형 인수 값을 제공한다.

- arc + Tab: install, uninstall, completion
- arc install --target + Tab: claude, codex, all
- arc install --preset + Tab: economy, balanced, smart
- arc uninstall --target + Tab: claude, codex, all
- arc completion + Tab: zsh, bash

완성 과정은 설치·제거·네트워크 획득을 실행하지 않는다. arc completion은 native runtime, 플랫폼 설정, 설치된 ARC payload 없이 실행할 수 있어야 한다.

설치 시 사용자 home의 ~/.zshrc에 ARC 소유 시작·종료 marker로 구분된 관리 블록을 등록한다. 이 블록은 arc를 사용할 수 있을 때 zsh 완성 정의를 불러온다. zsh 완성 시스템 초기화 순서 때문에 조용히 등록에 실패하지 않도록 한다.

동일 블록의 재설치는 중복을 만들지 않는다. 블록 밖의 내용과 줄바꿈을 보존한다. 충돌·중복 marker나 안전하지 않은 경로는 명확한 오류로 처리한다. 파일이 없으면 안전하게 생성한다.

bash 완성은 arc completion bash로 제공하고 등록 방법을 문서화한다. bash 초기화 파일 자동 변경은 범위에 포함하지 않는다.

설치 프로세스는 현재 부모 shell의 상태를 바꿀 수 없다. 성공 결과는 새 zsh 세션에서 자동 활성화된다는 점과 현재 세션에 적용할 방법을 안내한다.

### 전역 설정 옵션과 제거

다음은 기존 옵션 의미에 맞춘 설계 가정이다.

- --skip-global은 ~/.zshrc 변경도 건너뛴다. 완성 스크립트 출력 기능은 계속 사용할 수 있다.
- --check와 --dry-run은 shell 파일을 변경하지 않는다.
- --dry-run은 예정된 shell 관리 블록 변경을 보여준다.
- arc uninstall은 target 하나만 제거하더라도 공용 arc 명령이 계속 존재하므로 zsh 완성 블록을 유지한다.

완성 블록을 platform 제거와 함께 삭제하면 남아 있는 다른 platform이나 재설치 명령의 완성도 없어지는 문제가 있다. 따라서 블록은 platform 설치와 구분되는 공용 CLI 설정으로 취급한다. 이 가정은 written spec 검토 시 명시적으로 확인한다.

--target all에서는 공용 shell 파일을 중복 갱신하지 않는다. 설치 orchestration이 공용 변경을 한 번만 소유하고, 기존 target 간 경로 충돌 검증을 약화하지 않는다.

### npm 전역 설치 시 zsh 완성 자동 등록

사용자가 `npm i -g github:yunhozz/arc`로 ARC 명령을 설치하면, 지원되는 zsh 사용자 환경에서 `arc install`을 별도로 실행하지 않아도 `~/.zshrc`에 ARC 완성 관리 블록을 등록한다. 이후 새 interactive zsh 세션에서 `arc <Tab>`은 `install`, `uninstall`, `completion`을 제공한다.

#### 자동 등록 조건

npm `postinstall`에서 다음 조건을 모두 확인한 경우에만 자동 등록한다.

- npm이 전역 설치로 실행되었고, ARC가 최종 전역 패키지 위치에 설치되어 있다.
- macOS 또는 Linux의 일반 사용자 실행이며, 사용자의 shell을 나타내는 `SHELL`의 파일명이 `zsh`이다.
- 현재 실행 사용자의 home을 확인할 수 있다.
- `ZDOTDIR`가 설정되지 않았거나 해당 home을 가리킨다.
- 기존 descriptor 기반 파일 안전성에 필요한 runtime을 사용할 수 있다.

로컬 dependency 설치, 저장소 개발 설치, npx 임시 설치, Git 설치 준비용 임시 checkout에서는 home dotfile을 변경하지 않는다. npm 전역 설정만을 근거로 Git 임시 checkout을 최종 전역 설치로 간주하지 않는다.

비-zsh 또는 shell을 확인할 수 없는 환경, 별도 `ZDOTDIR`, root·상승 권한 등 사용자의 home을 안전하게 특정할 수 없는 환경에서는 자동 등록을 건너뛴다. 다른 사용자의 home을 추측하거나 bash 시작 파일을 자동 변경하지 않는다.

#### 관리 블록과 파일 보존

기존 `arc install`과 동일한 marker 및 완성 로딩 내용을 사용한다.

```zsh
# >>> arc completion >>>
if command -v arc >/dev/null 2>&1; then
  eval "$(arc completion zsh)"
fi
# <<< arc completion <<<
```

- 파일이 없으면 안전하게 생성한다.
- 동일한 블록이 이미 있으면 중복을 만들거나 파일을 다시 쓰지 않는다.
- 기존 블록을 갱신할 때 블록 밖 bytes와 기존 파일 mode를 보존한다.
- 최초 추가 시 기존 bytes를 그대로 유지하며 필요한 구분 newline과 관리 블록만 추가한다.
- BOM, 기존 줄바꿈, 마지막 newline이 없는 사용자 내용도 보존한다.
- 잘못된 UTF-8, 중복·역순·불완전 marker, symlink, 비정상 파일, 쓰기 권한 부족, 동시 변경을 발견하면 안전성 검증을 완화하여 쓰지 않는다.
- 기존 snapshot·descriptor transaction·rollback 보호를 사용한다. 충돌 시 사용자 변경을 덮어쓰는 자동 재시도는 하지 않는다.

반복 전역 설치와 이후 `arc install`을 조합해도 ARC 관리 블록은 하나만 존재해야 한다.

영구 backup/recovery 파일은 만들지 않는다. 실행 중 기존 transaction 소유의 private stage는 허용하며 정상 성공 또는 정상 rollback 후 정리한다. 복구 충돌이나 정리 실패에서는 사용자 데이터를 임의 삭제하지 않고 기존 계약에 따라 residual path를 보고한다. 강제 종료까지 포함한 임시 잔여물 부재는 보장하지 않는다.

#### 실패 및 안내

완성 자동 등록은 패키지 설치에 부가되는 동작이다. 등록 조건을 충족하지 못하거나 등록에 실패하더라도 해당 이유로 npm 패키지 설치를 실패시키지 않는다.

hook이 실행된 경우 등록 결과 또는 건너뜀·실패 원인과 수동 활성화 방법을 진단 출력으로 제공한다. 파일 변경 실패에서는 가능한 경우 원본을 복구하며, 복구 충돌·정리 실패의 정보도 숨기지 않는다. 안전한 native runtime을 사용할 수 없으면 파일을 변경하지 않으며, 이를 해결하기 위한 native build나 외부 획득을 hook에서 실행하지 않는다.

npm의 기본 출력 정책에 따라 hook 안내가 화면에 보이지 않을 수 있다. README에 등록 조건·예외·수동 활성화 방법을 명시하고, 진단이 필요할 때 `--foreground-scripts`를 사용할 수 있음을 안내한다.

`--ignore-scripts` 또는 npm의 script 실행 정책으로 hook이 실행되지 않으면 자동 등록도 수행되지 않는다. 이 경우 ARC 자체 안내 출력도 보장할 수 없다.

#### 현재 세션과 수동 활성화

설치 프로세스는 이미 실행 중인 부모 zsh의 상태를 바꿀 수 없다. 자동 등록 성공은 새 zsh 세션에서 활성화됨을 의미한다. 새 세션은 시작 파일을 정상적으로 읽고 PATH에서 `arc`를 찾을 수 있어야 한다.

이미 열린 zsh에서는 다음 명령으로 활성화한다.

```zsh
eval "$(arc completion zsh)"
```

자동 등록을 건너뛴 환경이나 scripts를 비활성화한 환경에서는 실제 사용하는 zsh 시작 파일에 위 명령을 추가하여 영구 활성화할 수 있다. bash는 기존 `arc completion bash`와 수동 등록 경로를 유지한다.

#### 기존 명령 및 제거와의 관계

- 기존 `arc install`의 완성 등록 동작을 유지한다.
- `arc install --skip-global`은 해당 명령에서 `.zshrc`를 접근·변경하지 않는다. 앞선 npm 설치가 등록한 블록을 제거하거나 npm 단계에 소급 적용하지 않는다.
- 기존 `--check`, `--dry-run`의 무변경 계약을 유지한다.
- `arc uninstall`은 기존 계약대로 공용 완성 블록을 유지한다.
- `npm uninstall -g arc-harness`에서도 블록을 자동 제거하지 않는다. 제거 후 새 shell에서 `arc`가 없으면 기존 `command -v arc` guard가 로딩을 건너뛴다.
- npm uninstall lifecycle hook은 추가하지 않는다.

#### 수용 기준

| ID | 기준 |
|---|---|
| NPM-C1 | 지원되는 일반 zsh 사용자 환경에서 실제 전역 npm 설치 후 관리 블록 하나가 등록되고, 새 interactive zsh의 Tab 완성이 세 하위 명령을 제공한다. |
| NPM-C2 | 로컬 dependency·개발 설치·npx 임시 설치·Git 준비 checkout에서는 home dotfile이 생성되거나 변경되지 않는다. |
| NPM-C3 | 반복 전역 설치 및 기존 `arc install`과의 조합이 멱등적이며, 블록 밖 bytes와 기존 mode를 보존한다. marker 오류·symlink·권한·drift에서는 안전하게 중단한다. |
| NPM-C4 | 기존 explicit install·skip/check/dry-run·제거 계약을 유지하고 영구 backup/recovery 파일을 추가하지 않는다. 정상 성공·rollback 후 transaction stage를 정리한다. |
| NPM-C5 | 비-zsh·미확인 환경·별도 `ZDOTDIR`·scripts 차단·runtime 또는 등록 실패가 명세대로 처리된다. 등록 실패만으로 npm 설치를 실패시키지 않으며, 현재 세션 제한과 수동 활성화 방법을 문서화한다. |

검증은 실제 사용자 home 대신 격리된 home·npm prefix·cache를 사용한다. 실제 npm 설치 경로와 새 interactive zsh의 Tab 동작을 확인해야 하며, 완성 스크립트 문자열 검사만으로 NPM-C1을 충족했다고 판단하지 않는다.

## 5. 통합 모델 설정 스키마

Claude와 Codex 각각의 배포 원본과 설치본에 models.toml 하나를 둔다. presets.toml은 배포·설치·필수 asset 목록에서 제거한다.

Codex 예시는 다음과 같다.

    version = 1
    preset = "balanced"

    [roles.arc_coder.economy]
    model = "gpt-6.1-sol"
    model_reasoning_effort = "low"

    [roles.arc_coder.balanced]
    model = "gpt-6.1-sol"
    model_reasoning_effort = "medium"

    [roles.arc_coder.smart]
    model = "gpt-6-astra"
    model_reasoning_effort = "high"

Claude는 같은 계층을 사용하며 각 preset 항목의 필드는 model, effort다.

필수 역할은 정확히 다음 다섯 개다.

- arc_scouter
- arc_planner
- arc_coder
- arc_qa
- arc_reviewer

각 역할은 economy·balanced·smart를 모두 가진다. 기존 economy 원본과 balanced·smart overlay의 값을 그대로 이행한다. 새로운 모델 ID나 effort 값을 임의로 선택하지 않는다.

### 검증 규칙

root는 version, preset, roles를 가진다.

- version은 정수 1이어야 한다.
- preset은 economy·balanced·smart 중 하나다.
- 역할·preset은 필수 항목을 정확히 가져야 한다.
- 각 설정은 플랫폼별 model·effort 필드만 가진다.
- 현재 모델 ID·effort 유효성 검사 수준을 유지한다.
- 실제 provider에 모델 사용 가능 여부를 조회하지 않는다.
- preset을 사용하지 않더라도 파일 내 세 preset 전체를 검증한다.

내부 renderer에는 선택된 preset의 다섯 역할 설정을 전달한다. 전체 preset을 가진 파일 표현과 renderer용 effective settings를 구분하여, renderer가 계층을 잘못 해석하지 않도록 한다.

### 설치와 수동 재적용

배포 원본의 root preset은 balanced다. 설치 시 선택한 preset으로 설치본의 root preset을 설정하고, 세 preset 전체는 보존한다.

설치되는 다섯 profile의 모델·effort는 설치본의 활성 preset과 일치해야 한다. profile의 나머지 내용과 역할별 권한은 보존한다.

두 플랫폼의 apply-models.py도 새 통합 설정을 읽는다. 사용자가 설치본의 preset 또는 해당 preset 값을 수정한 뒤 실행하면 다섯 profile에 적용한다. 기존 check·dry-run 동작과 변경 대상 제한을 보존한다.

## 6. 설정 호환성과 배포

이 변경은 Codex version 5 role-only 파일과 Claude의 이전 version 1 role-only 파일을 대체한다. Claude는 version 값만으로 구분할 수 없으므로 구조를 함께 검사한다.

설치기는 새 payload의 통합 설정을 사용하여 기존 설치본을 교체한다. 재설치 시 기존 설치본에 가한 모델 수정이 유지된다고 보장하지 않는다. 영구 백업도 생성하지 않으므로 이를 문서에 명시한다.

수동 적용 도구가 구형 형식을 읽으면 새 형식이 필요한 이유와 재설치·수정 방법을 설명하는 오류를 내고 profile을 변경하지 않는다. 자동 구형 스키마 변환은 범위에 포함하지 않는다.

두 models.toml의 기존 mutable manifest 예외는 유지한다. 변경된 코드·profile·문서·필수 asset 목록과 삭제된 presets.toml은 manifest 생성·검증 계약에 반영한다. packed consumer에서도 새 dispatcher와 필수 runtime asset을 사용할 수 있어야 한다.

## 7. 설치·제거 트랜잭션 계약

설치와 제거는 공유 transaction 정책을 따른다.

- <target>/backups/arc-*를 생성하지 않는다.
- .arc-recovery-*를 생성하지 않는다.
- 성공·rollback 후 stage를 recovery 경로로 이동하지 않는다.
- 실행 중에는 관리 대상과 동일한 부모의 private .arc-stage-*를 허용한다.
- 이전 원본은 교체 중 stage에 이동하여 rollback에 사용한다.
- 성공 또는 rollback 완료 후 transaction 소유 stage를 정리한다.
- 기존 stage를 자동 탐색하여 새 backup·recovery로 옮기는 기능을 제거한다.

새 파일·디렉터리 준비, 이전 원본 보존, publish, rollback에는 기존 경로 정체성·snapshot·drift 검사를 적용한다. 기존 외부 skill symlink 지원과 target 간 의존성 처리도 유지한다.

### 성공

전체 변경을 publish하고 경로 정체성을 확인한 뒤 이전 원본과 준비 잔여물을 정리한다. stage 디렉터리까지 제거하고 관련 parent를 sync한다.

성공 결과에 Backup:·Recovery: 경로를 표시하지 않는다. 해당 자료를 생성하지 않는 정책과 충돌하는 결과 필드는 제거하거나 그에 맞는 계약으로 정리한다.

### 처리 가능한 실패와 취소

commit 이전 오류 또는 취소에서는 완료한 변경을 역순으로 되돌린다. rollback이 완료되면 임시 stage를 정리한다.

부분 설치·제거를 성공으로 표시하지 않는다. 여러 target을 처리할 때 이미 성공한 target까지 전체 원자성을 새로 보장하지 않는다. 기존 순차 처리 의미를 유지하며, 성공한 target·실패한 target·시작하지 않은 target을 구분한다.

### Rollback 충돌과 정리 실패

외부 변경이나 namespace 교체 때문에 원본 복원이 안전하지 않으면 외부 데이터를 덮어쓰거나 삭제하지 않는다. 실패를 보고하고 남은 stage의 마지막 확인 경로를 제공한다.

stage에 모르는 항목이 생기거나 정체성이 달라지면 무조건 재귀 삭제하지 않는다. 안전한 삭제를 수행할 수 없는 경우 정리 실패로 보고한다.

파일 적용은 완료됐지만 stage 정리가 실패한 경우 설치 상태와 정리 오류를 함께 보고하고 종료 코드는 비정상으로 반환한다. 정리 실패를 숨기거나 성공 메시지만 출력하지 않는다.

정리되지 않은 stage를 backup·recovery로 이름 변경하지 않는다. 프로세스 강제 종료, 전원 손실, 파일시스템 오류 뒤의 잔여 stage는 예외 상황으로 문서화한다. 무영구보존 정책은 모든 장애 상황에서 잔여 파일이 절대로 없다는 보장이 아니다.

### 기존 잔여 자료

과거 backup·recovery·stage의 삭제는 이번 구현의 자동 동작에 포함하지 않는다. 과거 stage가 안전한 진행을 막는다면 새 recovery를 만들거나 임의 삭제하지 않고, 경로와 조치가 필요한 이유를 보고한다.

## 8. 진행 표시

대화형 설치는 마지막 target·preset 선택이 끝난 직후 진행 표시를 시작한다. 옵션으로 선택을 모두 제공한 경우에는 인수 검증이 끝난 직후 시작한다.

- TTY: Installing ARC…와 한 줄 spinner
- 비TTY: ANSI 제어 문자 없는 진행 문장 한 번
- check·dry-run: 설치 실행으로 오해되지 않는 검증 진행 문구

외부 획득을 포함한 비동기 대기 중 spinner가 갱신된다. 현재 동기 transaction 구간에서 frame이 잠시 멈출 수 있으며, 끊김 없는 애니메이션을 위해 worker로 이전하는 변경은 범위에 포함하지 않는다. 동기 적용 전에도 진행 중임을 나타내는 줄이 이미 보여야 한다.

성공·오류·취소 모두 timer를 정리하고 진행 줄을 닫은 뒤 최종 결과를 출력한다. 최종 오류와 target별 결과를 spinner가 덮어쓰지 않는다. SIGINT listener와 timer가 남아 프로세스 종료를 지연시키지 않는다.

## 9. 주요 대상 파일

구현 시 아래 책임 범위를 함께 고려한다. 신규 모듈의 정확한 이름은 구현 계획에서 확정한다.

| 영역 | 대상 |
|---|---|
| CLI·배포 진입점 | package.json, bin/, install.command, lib/cli/ |
| 완성·진행 표시 | lib/cli/의 신규 또는 기존 모듈, shell 관리 블록 처리 |
| 모델 schema·render 입력 | lib/models/config.mjs, lib/models/index.mjs, lib/models/profiles.mjs |
| 모델 원본·수동 적용 | codex/skill/models.toml, claude/skill/models.toml, 두 skill/scripts/의 모델 도구 |
| overlay 제거 | 두 skill/presets.toml, 모든 참조 |
| 계획·payload | lib/installer/plan.mjs, lib/installer/manifest.mjs |
| transaction·결과 | lib/installer/transaction.mjs, recovery.mjs, install.mjs, uninstall.mjs |
| 배포 무결성 | scripts/update-manifest.mjs, MANIFEST.sha256 |
| 문서·검증 | README.md, 관련 Node·Python 테스트와 parity fixture |

모델 schema·수동 도구·profile·manifest는 하나의 소비 계약이다. 서로 맞지 않는 중간 상태를 독립 완료로 수용하지 않는다.

## 10. 수용 기준과 필요한 증거

### C1. 명령과 shell 완성

- 설치된 package의 공개 bin은 arc 하나다.
- arc install·arc uninstall에서 기존 옵션·대화형 선택·종료 코드가 동작한다.
- install.command가 새 경로를 실행한다.
- zsh 관리 블록 등록은 멱등적이며 사용자 내용은 보존된다.
- 새 zsh에서 실제 arc + Tab과 열거형 값 완성을 확인한다.
- bash 완성 스크립트도 실제 shell에서 후보를 제공한다.
- help·version·completion은 설치 변경과 외부 획득을 일으키지 않는다.
- check·dry-run·skip-global의 shell 파일 변경 제한을 확인한다.

### C2. 통합 모델 설정

- 두 플랫폼의 원본·설치본은 version 1 통합 스키마다.
- 다섯 역할 각각 세 preset이 존재하며 기존 값이 보존된다.
- 여섯 플랫폼/preset 조합에서 활성 preset과 다섯 profile이 일치한다.
- 수동 적용 도구의 apply·check·dry-run이 새 스키마를 따른다.
- 구형·누락·추가 key·잘못된 preset·잘못된 version은 변경 전에 거부된다.
- 배포 package에 presets.toml 의존성이 없고 manifest 검증·packed consumer가 통과한다.

### C3. 무영구보존과 rollback

- 정상 설치·재설치·제거에서 새 backup·recovery 자료가 생성되지 않는다.
- 정상 성공·처리 가능한 실패·취소 후 소유 stage가 남지 않는다.
- fault injection으로 preserve·publish·rollback·cleanup 각 실패를 확인한다.
- 복원 후 bytes·파일 종류·symlink·필요 metadata가 기대 상태와 일치한다.
- drift·parent 교체·stage 내 외부 항목을 안전하게 처리한다.
- rollback 충돌·정리 실패는 비정상 결과와 확인 가능한 경로를 보고한다.
- target all의 부분 성공과 중단 상태가 정확하다.
- acquisition 임시 자료의 정상·취소·실패 정리도 확인한다.
- 현재 PC 백업이나 휴지통을 삭제하는 코드·운영 작업이 추가되지 않는다.

### C4. 진행 표시

- 마지막 선택 직후부터 진행 문장이 보인다.
- TTY의 비동기 대기 중 spinner가 갱신된다.
- 비TTY 출력에 ANSI 제어 문자가 없다.
- 성공·실패·취소 후 spinner·timer·SIGINT listener가 정리된다.
- 최종 결과·오류가 읽을 수 있는 상태로 남는다.

검증은 임시 home과 통제된 fixture를 우선 사용한다. 실제 사용자 home을 사용하는 확인은 별도 실행 범위로 통제한다.

개별 구현 작업의 수용 전에는 해당 기준과 집중 QA 증거가 필요하다. 모든 작업이 수용된 후 최종 전체 변경에 대해 독립 Reviewer 검토 한 번을 수행한다. 최종 검토는 개별 작업의 수용 전제조건을 대신하지 않는다.

## 11. 위험과 한계

영구 백업을 없애면 성공한 재설치 이전 상태로 돌아갈 자료가 남지 않는다. 실패 중 rollback을 위한 stage는 허용하지만, 강제 종료 뒤의 crash recovery는 자동 보장하지 않는다.

동기 파일 작업 중 spinner가 잠시 멈출 수 있다. 전체 애니메이션 연속성을 보장하는 구조 변경은 별도 범위다.

~/.zshrc는 사용자 파일이므로 관리 블록 경계·중복·symlink·권한·동시 변경 검증이 필요하다. 자동 등록은 현재 부모 shell에 즉시 적용되지 않는다.

Claude의 구형·신형 설정이 같은 version 1을 사용하므로 정확한 구조 검증과 명확한 오류가 필수다.

과거 backup·recovery 정리는 완료 여부를 이 구현으로 보증하지 않는다. 휴지통 처리 책임은 사용자에게 있다.

## 12. 계획 전 확인할 설계 가정

다음 세 가지는 승인된 설계를 구체화하면서 둔 가정이다.

1. --skip-global은 zsh 초기화 파일 등록도 건너뛴다.
2. platform 제거 후에도 공용 zsh 완성 블록은 유지한다.
3. 구형 모델 설정의 자동 변환은 제공하지 않고, 재설치 또는 명시적 파일 수정으로 이행한다.

이 가정 중 변경이 필요한 항목은 written spec에 반영한 뒤 계획해야 한다.

## 자체 점검

- 승인된 CLI·zsh 자동 등록·bash 완성·통합 스키마·임시 stage·spinner 요구를 모두 포함했다.
- 임시 원본 허용과 영구 보존 제거를 구분했고, rollback 충돌에서 외부 데이터를 삭제하지 않는 한계를 명시했다.
- 기존 백업 네 개와 휴지통 영구 삭제를 구현 범위에서 제외했다.
- 동기 transaction의 spinner 한계, Claude version 충돌, 공용 shell 변경의 중복 처리를 명시했다.
- 남은 확인점은 위 세 설계 가정이다. 특히 uninstall 시 공용 완성 블록 유지는 다중 target과 공용 CLI 수명에 대한 제안이다.
- 파일 저장·테스트·계획 작성은 수행하지 않았다. CEO의 written-spec 승인 후 writing-plans 단계로 진행한다.
