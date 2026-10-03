# Yunho Harness 설치 및 활성화

## 요구 사항

- Python 3.11 이상
- `install.py`, `install.command`, `README.md`, `MANIFEST.sha256`, `skill/`, `agents/`, `dependencies/`가 함께 있는 전체 저장소

이 설치 도구는 저장소 안의 공통 설정 모듈과 의존 skill 파일을 사용합니다. 파일 하나만 따로 복사하는 설치는 지원하지 않습니다.

저장소의 `config.toml`은 동시 agent 수를 직접 설정할 때 참고하는 선택 예시입니다. 설치기는 이 파일을 설치하거나 전역 설정에 병합하지 않습니다.

## 설치

저장소 루트에서 다음 명령을 실행합니다.

```sh
python3 install.py
```

`CODEX_HOME`을 설정하지 않으면 `~/.codex` 아래에 Harness skill, 일곱 에이전트 프로필, 필요한 의존 skill을 설치합니다. 다른 위치를 사용하려면 `CODEX_HOME`에 Codex home 경로를 지정합니다. `CODEX_HOME`이 빈 문자열이면 설치가 실패합니다.

설치 전에 두 가지 읽기 전용 옵션으로 확인할 수 있습니다.

```sh
python3 install.py --check
python3 install.py --dry-run
```

`--check`는 선택된 변경 불가 파일의 무결성 목록, 모델 설정, 일곱 템플릿과 생성 결과, 설치 대상 경로를 확인합니다. `--dry-run`은 같은 입력과 대상을 확인하고 설치 위치 및 보존할 의존 skill을 표시합니다. 두 명령 모두 디렉터리, 백업, 임시 파일 또는 프로필을 만들거나 수정하지 않습니다. `--check`는 설치된 프로필과 설정 사이의 차이를 검사하는 명령이 아닙니다.

## 모델 설정

모델 설정 파일은 `skill/models.toml`입니다. version 2에서 `[models."<exact-model-id>"]` 표는 모델별 reasoning effort 허용 목록을 정의하고, `[roles.<role>]` 표는 각 역할의 모델과 reasoning effort를 선택합니다. 새 모델 ID를 사용할 때는 해당 ID와 `allowed_reasoning_efforts` 목록을 추가하고 역할 값도 그 모델을 가리키도록 편집합니다. 각 역할의 effort는 선택한 모델의 목록에 있어야 합니다.

다음은 작성 형식의 일부 예시이며, 실제 설정 파일에는 일곱 Harness 역할이 모두 있어야 합니다.

```toml
version = 2

[models."example-model-id"]
allowed_reasoning_efforts = ["low", "medium"]

[roles.yunho_team_coder]
model = "example-model-id"
model_reasoning_effort = "medium"
```

이 목록은 로컬 설정 검증 정책입니다. 원격 서비스가 모델을 지원하는지, 계정이 해당 모델에 접근할 수 있는지, 지금 사용할 수 있는지는 확인하지 않습니다. 이전 version 1 파일은 자동 변환되지 않습니다. version 2의 `[models]` 표와 역할 설정으로 직접 갱신해야 합니다.

새 환경에 설치하면 `install.py`가 설정을 읽고 일곱 프로필을 생성합니다. 유효한 `models.toml` 정책만 편집할 때 manifest를 다시 생성할 필요는 없습니다. 기존 설치에서 모델 설정만 바꾼 경우, 설치된 `models.toml`을 편집한 뒤 다음 스크립트를 실행해 프로필에 반영합니다.

```sh
python3 ~/.codex/skills/yunho-harness/scripts/apply-models.py
```

`CODEX_HOME`을 사용한다면 그 경로 아래의 `skills/yunho-harness/scripts/apply-models.py`를 실행합니다. `apply-models.py --check`는 모든 프로필이 설정과 일치하면 종료 코드 0, 차이가 있으면 1을 반환하며 파일을 수정하지 않습니다. `--dry-run`은 필요한 변경을 표시하고 파일을 수정하지 않습니다. 잘못된 설정, 프로필, 경로는 종료 코드 2입니다. 일반 실행은 일곱 프로필을 모두 읽고 생성 결과를 준비한 뒤 변경 파일을 반영합니다.

## 백업 및 dependency 보존

설치 전 기존 Harness skill과 일곱 agent 프로필을 `$CODEX_HOME/backups/` 아래의 시간표시 디렉터리에 백업합니다. 설치 단계가 실패하면 완료된 교체 작업을 역순으로 복원합니다. 파일 시스템 전체의 원자성을 보장하지 않으므로 실패 뒤 백업 또는 임시 디렉터리가 남을 수 있습니다.

선택한 `$CODEX_HOME/skills/` 또는 `~/.agents/skills/`에 같은 이름의 의존 skill이 있으면 기존 파일을 보존하고 새로 설치하지 않습니다. 보존된 의존 skill의 버전과 Harness의 호환성은 검사하거나 보장하지 않습니다.

`skill/`, `agents/`, `dependencies/` 아래에서 일반 파일인 `.DS_Store`는 설치 파일, 무결성 목록의 포함 범위, 설치 복사에서 제외됩니다. 같은 이름의 symbolic link, directory 또는 특수 파일은 오류입니다.

## 수동 활성화

설치기는 전역 설정이나 `AGENTS.md`를 변경하지 않습니다. 적용할 `AGENTS.md`에 다음 안내를 직접 추가한 뒤 Codex를 다시 시작하거나 새 세션을 시작합니다.

```markdown
여러 단계의 조사, 분석, 문서 작성 또는 구현이 필요한 요청에는
`~/.codex/skills/yunho-harness/SKILL.md`를 읽고 따른다.
같은 대화의 관련 후속 요청에도 적용한다.
`~`는 현재 사용자의 홈 디렉터리로 해석한다.
```

`CODEX_HOME`이 기본 경로가 아니라면 loader의 skill 경로를 실제 설치 위치로 바꿉니다. 새 세션은 설치된 에이전트 프로필을 읽으며, 이미 실행 중인 에이전트 설정은 자동으로 바뀌지 않습니다.

## 무결성 범위

`MANIFEST.sha256`은 `install.py`, `install.command`, README, 선택된 skill·template·의존 파일의 변경 불가 내용을 검사합니다. 편집 가능한 `skill/models.toml`은 무결성 목록에서 제외되며, 대신 version 2 구조와 역할·모델 effort 연결을 검증합니다. 유효한 설정을 편집해도 manifest를 다시 만들 필요는 없습니다. 이 검사는 설정 작성자를 인증하지 않으며, 무결성 목록 자체의 진위나 원격 모델 지원을 증명하지 않습니다.
