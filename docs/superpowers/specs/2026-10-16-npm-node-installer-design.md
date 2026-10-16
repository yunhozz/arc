# npm 기반 Node.js ARC 설치기와 성능 프리셋

- 상태: 사용자 설계 승인 완료
- 기준 저장소: `/Users/ma-24-007/Desktop/workspace/arc`
- 기준 브랜치/HEAD: `master` / `2c7891ece294a6cc2cd6b23f496ce2baa95406f0`
- 설계 수준: Architectural
- 사용자 결정: 설치기는 Node.js로 구현하고, CLI 질문과 선택지는 영어로 표시한다.
- 구현 계획은 이 문서 승인 후 별도로 작성한다.

## 목적

npm 명령으로 ARC 설치기를 실행해 설치 대상과 성능 프리셋을 고르게 한다. Node.js 설치 경로는 Python을 요구하거나 호출하지 않는다. 기존 설치기의 대상 분리, 무결성 검사, 경로 안전성, 백업, 트랜잭션, 롤백 및 복구 자료 보존을 Node.js 경로에서도 유지한다.

CLI가 묻는 값은 다음과 같다.

1. 설치 대상: `Claude`, `Codex`, `All`
2. 성능: `Economy`, `Balanced (default)`, `Smart`

질문, 선택지, 사용법, 상태, 오류, 완료 및 복구 안내는 영어로 출력한다. README와 설치되는 역할 지침의 언어는 이 CLI 요구의 범위가 아니다.

## 범위와 제외 사항

포함:

- npm 실행 패키지와 Node.js 설치기
- 영어 대화형 CLI 및 명시적 인수를 이용한 비대화형 실행
- 플랫폼별 다섯 역할, 세 성능 프리셋
- 기존 Python 설치 로직의 Node.js 포팅
- 안전한 descriptor 기반 파일 작업을 제공하는 사전 빌드 Node-API 구성요소
- `All` 대상의 사전 검사, 순차 설치 및 부분 실패 보고
- `install.command`를 통한 Node 진입, README 및 배포 manifest 갱신
- Python 없이 npm 패키지를 설치·실행하는 검증

제외:

- npm registry 게시, 로그인, 전역 설치
- 실제 모델 호출로 비용·품질·가용성을 보증하는 기능
- 기존 선택적 Python 유틸리티 전체의 Node 포팅
- 프리셋 자동 전환
- `All`의 양 플랫폼을 하나로 묶는 원자적 rollback

## npm 명령과 실행 환경

배포 전 저장소에서 실행할 수 있는 진입점은 다음을 제안한다.

```sh
npx --yes github:yunhozz/arc
npx --yes github:yunhozz/arc --target codex --preset balanced
```

패키지에는 `arc-install` bin을 제공한다. `npm pack`으로 만든 tarball도 별도 checkout 밖에서 설치·실행해 검증한다. 공개 패키지 이름이나 npm 게시 권한은 이번 작업의 확정사항이 아니다.

설치기와 프리셋 처리의 직접 런타임은 Node.js다. npm 패키지는 preinstall/install/postinstall에서 설치 파일이나 사용자 설정을 수정하거나 컴파일하지 않는다. 외부 스킬 획득에는 기존에 사용하는 `npx skills@latest add ...` 동작을 유지한다. Node 설치기가 Python을 subprocess로 호출하지 않으며, 실제 npm 패키지 실행 경로도 Python 실행 trap으로 검증한다. `--check`와 `--dry-run`은 외부 명령과 네트워크를 사용하지 않는다.

설치 완료 후 `models.toml`을 사용자가 직접 수정하고 프로필에 반영하려는 경우에만 기존 `apply-models.py` 선택 도구를 실행할 수 있다. 이 선택 도구는 Python을 요구할 수 있지만 npm 설치·프리셋 적용의 의존성은 아니다. Node 포팅이 수락된 뒤 기존 설치기 `install.py`는 제거하고, shell 진입점은 Node만 호출한다. 구현 계획에서 Python 설치 테스트를 Node 동등 테스트로 교체하고, README의 필수 설치 요구에서 Python을 제거한다.

## CLI 계약

### 대화형 실행

stdin과 stdout이 모두 TTY이면 지정하지 않은 선택을 다음 순서로 묻는다.

```text
Select an installation target:
1. Claude
2. Codex
3. All
Enter a choice [1-3]:

Select a performance preset:
1. Economy
2. Balanced (default)
3. Smart
Enter a choice [1-3] (default: 2):
```

target은 기본 선택 없이 사용자가 고른다. 프리셋은 `Balanced (default)`로 표시하며 Enter 입력 시 `Balanced`를 선택한다. 잘못된 입력은 영어 안내 후 다시 묻는다. 값이 모두 명시되면 질문 없이 실행한다. 별도의 설치 확인 질문은 추가하지 않는다.

### 비대화형 실행과 옵션

```text
arc-install --target <claude|codex|all> --preset <economy|balanced|smart>
  [--check | --dry-run] [--skip-global] [--help] [--version]
```

- 비TTY에서는 `--target`과 `--preset`이 모두 명시되어야 하며, 누락 시 입력 대기 없이 사용법 오류로 끝난다.
- 대화형 실행은 인수로 주어진 선택을 유지하고 누락한 값만 묻는다.
- 알 수 없는 인수, 중복 값, 선택지에 없는 값 및 `--check`와 `--dry-run`의 동시 사용을 거부한다.
- `--skip-global`은 플랫폼 전역 지침과 Codex `config.toml` 변경을 생략한다.
- `--help`와 `--version`은 설치 경로나 네이티브 파일 계층을 열 필요 없이 표시한다.
- `--check`와 `--dry-run`은 기존 계약대로 파일 변경, subprocess, 네트워크 접근을 하지 않는다.

제안 종료 코드: 성공 `0`, 입력·환경 오류 `2`, 설치/검증/복구 실패 `1`, 사용자 취소 `130`. 롤백이 실패하면 결과와 recovery 경로를 명시하고 실패로 종료한다. 세부 코드는 구현 계획에서 기존 호출자의 영향과 함께 고정한다.

`install.command`는 동일 Node CLI로 인수를 전달하며 대상·프리셋 질문을 지원한다. 기존 `--target`, `--check`, `--dry-run`, `--skip-global` 사용법을 유지한다. Python 직접 호출 `python3 install.py ...`는 신규 설치 경로에서 지원하지 않는다.

## 성능 프리셋

`Economy`는 현재 `models.toml` 구성을 유지한다. 표의 각 값은 `model / effort`이며, 프리셋은 설정값만 고른다. 모델 접근 권한이나 실제 성능을 보장하지 않는다.

### Codex

Codex의 effort 필드명은 `model_reasoning_effort`이다.

| 역할 | Economy | Balanced | Smart |
|---|---|---|---|
| Scouter | `gpt-6-luna / high` | `gpt-6.1-sol / medium` | `gpt-6.1-sol / high` |
| Planner | `gpt-6.1-sol / medium` | `gpt-6.1-sol / high` | `gpt-6-astra / high` |
| Coder | `gpt-6.1-sol / low` | `gpt-6.1-sol / medium` | `gpt-6-astra / high` |
| QA | `gpt-6-luna / high` | `gpt-6.1-sol / medium` | `gpt-6.1-sol / high` |
| Reviewer | `gpt-6.1-sol / medium` | `gpt-6.1-sol / high` | `gpt-6-astra / high` |

### Claude

Claude의 effort 필드명은 `effort`이다.

| 역할 | Economy | Balanced | Smart |
|---|---|---|---|
| Scouter | `haiku / high` | `sonnet / medium` | `sonnet / high` |
| Planner | `sonnet / medium` | `sonnet / high` | `opus / high` |
| Coder | `sonnet / low` | `sonnet / medium` | `opus / high` |
| QA | `haiku / high` | `sonnet / medium` | `sonnet / high` |
| Reviewer | `sonnet / medium` | `sonnet / high` | `opus / high` |

플랫폼별 스키마와 프로필 형식은 독립적으로 유지한다. 설치기는 선택 프리셋에서 `models.toml`과 다섯 역할 프로필을 함께 생성하고 검증해 두 결과가 일치하도록 한다. 재설치는 이전 설정을 백업한 뒤 선택한 프리셋을 적용한다. 소스 배포본의 Economy 설정이 위 현재 값과 달라지면 배포 검증이 실패한다.

## 구조와 파일 안전성

Node 표준 `fs`의 경로 검사 후 별도 경로 API를 호출하는 방식은 기존 descriptor 기반 race 방어와 동등하다고 확인되지 않았다. 따라서 JavaScript는 CLI, 인수, 프리셋, 설정 렌더링과 설치 단계 조정을 맡고, 민감한 파일 열기·검사·백업·rename·복구는 사전 빌드 Node-API 구성요소가 descriptor 기준으로 수행한다. 구성요소 로딩 실패나 미지원 환경에서는 쓰기 전에 중단하며 안전성이 약한 JS fallback은 두지 않는다. 설치 시 Python, node-gyp, 컴파일러, 네이티브 다운로드는 요구하지 않는다.

초기 네이티브 산출물 지원 행렬은 다음을 제안한다. 이는 기존 README에 명문화된 운영체제 약속이 아니라 새 패키지를 위한 설계 제안이며, 승인 후 수용 기준이 된다.

| 운영체제 | CPU | 제안 최소 기준 |
|---|---|---|
| macOS | arm64, x64 | macOS 13 |
| Linux (glibc) | arm64, x64 | glibc 2.28 |

Windows, musl Linux 및 나머지 CPU는 초기 지원에서 제외한다. 지원 환경에서도 필요한 descriptor 작업을 사용할 수 없으면 쓰기를 시작하지 않는다. Node 최소 버전은 22를 제안하며 Node-API 안정 ABI의 prebuild를 포함한다. 이 지원 범위 축소와 네이티브 구성요소 사용은 written-spec 승인 시 확정이 필요한 가정이다.

보안 계층은 다음 기존 정책을 보존한다.

- 부모·중간 symlink, 경로 탈출, 특수 파일과 지원하지 않는 링크를 거부한다.
- 기존 허용 정책에 해당하는 Claude 외부 스킬 leaf symlink만 검증 후 독립 디렉터리로 교체하고, 원래 링크 자체를 백업·복구한다.
- 열린 디렉터리 기준으로 관리 대상 snapshot, 읽기, 검사 및 rename을 수행한다.
- 설치 전후 metadata와 identity를 비교해 경합 중 외부 파일을 읽거나 바꾸지 않는다.
- 검사 후 대상 drift 또는 복구 실패 시 확인 없이 삭제하지 않고 recovery 자료를 보존한다.
- staging은 대상과 같은 파일시스템에 두고 action 기록을 통해 역순 복구한다.
- 외부 스킬 획득은 기존 `npx skills@latest` 명령, 격리 환경, 정확한 결과 검증과 timeout 계약을 유지한다.

Codex와 Claude 단독 설치는 각자의 기존 home·전역 설정·외부 스킬 경계만 변경한다. 사용자 소유 내용 및 `arc:begin`/`arc:end` 관리 블록 밖의 내용은 보존한다. Codex의 기존 `~/.agents/skills` 갱신 범위와 Claude의 허용된 link 처리도 유지한다.

## `All` 대상 동작

`All`은 양쪽 사전 검사 후 대상별 순차 transaction이다. 설치 순서는 고정된 `Codex` 다음 `Claude`로 제안한다.

- 둘 중 하나라도 preflight에 실패하면 외부 획득과 파일 변경을 시작하지 않는다.
- 사전 검증 뒤 외부 스킬을 획득하고, 각 플랫폼을 설치 직전에 다시 검사한다.
- 첫 대상이 실패하면 해당 대상을 복구하고 두 번째는 시작하지 않는다.
- 첫 대상 성공 후 두 번째가 실패하면 첫 성공은 유지하고 두 번째만 복구한다. 부분 성공, 재실행 명령, backup/recovery 경로를 표시한다.
- 모든 대상은 독립된 backup과 복구 상태를 갖는다. 양 플랫폼을 동시에 되돌린다고 약속하지 않는다.
- `--check`와 `--dry-run`은 양쪽을 검사하되 어느 쪽도 변경하지 않는다.

## 패키지 및 manifest

패키지 tarball은 실행 코드, 플랫폼별 payload, 프리셋, 필요한 라이선스와 native prebuild를 명시적 파일 목록으로 포함한다. 개발 checkout 구조, Git metadata, Python 설치기에 의존하지 않는다. Node 런타임 의존성은 패키지 실행에 사용할 수 있도록 고정·포함하고, npm lifecycle에서 사용자 설정을 바꾸지 않는다.

`MANIFEST.sha256`은 Node CLI와 보안 코드, 프리셋, native prebuild 등 보호할 배포물을 포함하도록 확장한다. 기존 `models.toml`의 mutable 예외와 schema 검증은 유지한다. manifest 경로 탈출, 중복, 누락, 변조 및 허용하지 않은 추가 파일을 거부한다. native binary는 로딩하기 전에 해시와 OS/CPU를 확인한다.

## 수락 기준과 검증 증거

1. 세 대상 선택과 세 프리셋의 TTY 질문/오류/취소가 모두 영어이며, 입력 재시도가 맞다.
2. non-TTY 누락 인수가 기다리지 않고 실패하며, 명시적 인수 조합과 기존 옵션 호환이 맞다.
3. 승인된 30개 역할별 모델·effort 조합이 정확하고, Economy가 현재 `models.toml`과 일치한다.
4. 설치 후 각 `models.toml`과 프로필이 선택 프리셋에 대해 일치한다.
5. Python 실행 파일이 없는 별도 환경에서 npm tarball `--help`, `--check`, `--dry-run`, 실제 설치가 동작하고 Python 실행 trap에 걸리지 않는다.
6. tarball이 checkout 외부의 공백 포함 경로에서 실행되며, lifecycle script가 사용자 파일을 변경하지 않는다.
7. Node 경로가 기존 manifest, profile parser/renderer, 전역 관리 블록, 대상 경계 및 backup/rollback 동작을 보존한다.
8. race·fault injection으로 파일/부모 swap, 허용 Claude link 교체, 모든 transaction 단계 실패, rollback 실패 때 외부 내용 보호와 recovery 보존을 확인한다.
9. `All`의 양쪽 preflight 실패, 첫 대상 실패, 두 번째 대상 실패의 변경 범위와 종료 상태가 각각 맞다.
10. `--check`와 `--dry-run` 실행 전후 상태가 같고 네트워크/subprocess 기록이 없다.
11. 지원 행렬의 네 플랫폼 조합에서 prebuild가 실제 동작하고, 미지원 OS/CPU/libc와 손상·누락 addon은 쓰기 전에 실패한다.
12. 기존 Python installer 테스트 결과가 Node 동작의 대체 증거로 사용되지 않고, 중요한 assertion과 공격 사례가 새 경로를 통과한다.

## 구현 계획 작성 전 결정할 가정

아래 항목은 사용자 요구가 아니라 설계 제안이다.

- 네이티브 descriptor 안전 계층 사용 및 초기 지원을 macOS arm64/x64와 glibc Linux arm64/x64로 한정
- Node.js 최소 버전 22
- target은 기본 선택 없이 질문하고, 프리셋은 `Balanced (default)`로 표시하며 기본값으로 사용
- 비대화형 실행은 target과 preset을 모두 요구
- `All` 설치 순서는 Codex 다음 Claude
- 배포 전 실행 방식은 `npx --yes github:yunhozz/arc`

이 문서가 승인되면 위 제안을 승인된 설계 기준으로 삼아 `writing-plans`로 전체 포팅 계획을 작성한다. 계획 승인과 실행 대상 선택 전에는 설치 코드, 테스트, 브랜치 또는 worktree 변경을 시작하지 않는다.

## 자체 검토

- Node.js 포팅과 영어 CLI는 사용자가 직접 지시한 사항으로 기록했다.
- 각 역할별 프리셋은 승인된 30개 값으로 반영했다. Codex Smart Reviewer는 `gpt-6-astra / high`다.
- Python은 npm 설치 경로에서 배제하고, 포팅 수락 후 기존 `install.py`를 제거하며, 별도의 수동 `apply-models.py` 사용과 구분했다.
- Node 경로 문자열만으로 기존 no-follow race 방어를 대체하지 않고 네이티브 안전 계층을 제안했다.
- npm publish를 범위에 넣지 않았다. tarball로 검증하고 GitHub 패키지 명령은 제안으로 표시했다.
- 기존 외부 스킬 취득 흐름을 임의 Git acquisition으로 변경하지 않았다.
- 초기 OS 지원 행렬, 네이티브 prebuild, 입력 기본값 등 미확정 사항은 설계 가정이라고 표시했다.

## 저장소 근거

- `install.command`: 현재 `python3 install.py` forwarding.
- `README.md`: Python 3.11을 필수 설치 요구로 표시하며, `apply-models.py`는 설치 후 수동 실행 도구다.
- `install.py`: manifest, 환경 해석, 외부 스킬 취득, profile render, backup/transaction, CLI를 구현한다.
- `codex/skill/models.toml`, `claude/skill/models.toml`: 승인된 Economy 구성과 서로 다른 플랫폼 스키마.
- `tests/test_target_install.py`: 대상 격리 및 race-swap 보호 검증.
- `tests/test_install.py`: manifest, 취득, 전역 파일, transaction에 대한 기존 설치기 검증.
