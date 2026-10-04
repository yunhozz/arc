# Yunho Harness 설치 및 활성화

## 요구 사항

- Python 3.11 이상
- `install.py`, `install.command`, `README.md`, `MANIFEST.sha256`, `external-skills.toml`, `skill/`, `agents/`가 함께 있는 전체 저장소

이 설치 도구는 저장소 안의 공통 설정 모듈과 프로필 템플릿을 사용하며, 필수 외부 스킬이 미리 설치되어 있어야 합니다. 파일 하나만 따로 복사하는 설치는 지원하지 않습니다.

저장소의 `config.toml`은 동시 agent 수를 직접 설정할 때 참고하는 선택 예시입니다. 설치기는 이 파일을 설치하거나 전역 설정에 병합하지 않습니다.

## 설치

저장소 루트에서 다음 명령을 실행합니다.

```sh
python3 install.py
```

`CODEX_HOME`을 설정하지 않으면 `~/.codex` 아래에 Harness skill과 일곱 에이전트 프로필을 설치합니다. 다른 위치를 사용하려면 `CODEX_HOME`에 Codex home 경로를 지정합니다. `CODEX_HOME`이 빈 문자열이면 설치가 실패합니다. 외부 스킬은 설치 전에 준비해야 합니다.

설치 전에 두 가지 읽기 전용 옵션으로 확인할 수 있습니다.

```sh
python3 install.py --check
python3 install.py --dry-run
```

세 명령 모두 manifest 무결성, 외부 스킬 snapshot, 모델 설정, 일곱 템플릿과 생성 결과, 설치 대상 경로를 확인합니다. 외부 스킬 검사가 끝나기 전에는 설치 파일, 디렉터리, 백업 또는 staging을 만들거나 수정하지 않습니다. `--check`와 `--dry-run`은 성공해도 파일을 만들거나 수정하지 않습니다. `--check`는 설치된 프로필과 설정 사이의 차이를 검사하는 명령이 아닙니다.

## 필수 외부 스킬

일반 설치, `--check`, `--dry-run`은 다음 네 스킬이 호환성 검사에 통과해야 합니다.

```text
brainstorming
writing-plans
test-driven-development
using-git-worktrees
```

각 스킬은 다음 두 위치에서만 찾습니다.

```text
<selected CODEX_HOME>/skills/<skill-name>
<actual user home>/.agents/skills/<skill-name>
```

`CODEX_HOME`을 설정하지 않으면 첫 위치는 실제 사용자 home의 `.codex/skills`입니다. 두 번째 위치는 `CODEX_HOME`과 독립적입니다. 존재하는 후보는 모두 확인하며, 같은 실제 디렉터리를 가리키는 경로만 한 번 검사합니다. 두 후보가 서로 다른 디렉터리라면 각각 승인된 snapshot과 일치해야 합니다. 검색 순서는 우선순위를 뜻하지 않습니다. plugin cache, 프로젝트별 경로, 임의 재귀 검색은 확인하지 않습니다.

`external-skills.toml`은 네 스킬의 필수 파일 총 11개와 검토된 SHA-256 snapshot을 지정합니다. 모든 필수 파일은 동일한 하나의 snapshot과 일치해야 합니다. 필수 목록 밖의 파일은 비교하거나 재귀 검색하지 않습니다. 필수 스킬 누락, 파일 읽기 실패, 잘못된 lock 또는 snapshot 불일치는 종료 코드 2로 실패하며 외부 파일 내용을 출력하지 않습니다. Snapshot 불일치는 호환성이 확인되지 않았다는 뜻이며, 의미상 비호환을 증명하는 것은 아닙니다.

후보 root 또는 상위 경로의 symbolic link는 strict resolution으로 디렉터리에 도달할 때 허용합니다. Lock에 적힌 각 필수 파일은 실제 skill root 내부에 있는 일반 파일이어야 합니다. root 내부 파일을 가리키는 필수 파일 symbolic link는 허용하고 root 밖을 가리키거나, dangling/cycle이거나, 특수 파일인 경로는 거부합니다. Installer는 외부 스킬을 내려받거나 설치·복사·수정·삭제·백업하지 않습니다.

검토한 snapshot을 갱신하려면 외부 파일 변경을 현재 Harness의 adapter 및 관련 정책과 대조하고, 필수 파일의 raw bytes를 검토한 뒤 새 snapshot ID와 해당 스킬의 필수 파일 전체 SHA-256을 명시적으로 추가합니다. 한 snapshot 안의 파일만 조합해 통과할 수 있습니다. Lock 변경 후에는 `MANIFEST.sha256`에 기록된 `external-skills.toml`의 SHA-256도 다시 계산해 갱신합니다. 설치기는 현재 값을 자동 승인하지 않습니다. Hash 일치는 upstream 출처나 runtime 동작을 인증하지 않으며, 특히 선택적인 Node.js·Bash visual companion 실행 환경을 검증하지 않습니다. Snapshot 밖 추가 파일·다른 검색 위치·검사 이후의 파일 변경도 보장하지 않습니다.

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

## 백업 및 transaction

설치 전 기존 Harness skill과 일곱 agent 프로필을 `$CODEX_HOME/backups/` 아래의 시간표시 디렉터리에 백업합니다. 설치 단계가 실패하면 완료된 교체 작업을 역순으로 복원합니다. 파일 시스템 전체의 원자성을 보장하지 않으므로 실패 뒤 백업 또는 임시 디렉터리가 남을 수 있습니다.

`skill/`, `agents/` 아래에서 일반 파일인 `.DS_Store`는 설치 파일, 무결성 목록의 포함 범위, 설치 복사에서 제외됩니다. 같은 이름의 symbolic link, directory 또는 특수 파일은 오류입니다.

## 수동 활성화

설치기는 전역 설정이나 `AGENTS.md`를 변경하지 않습니다. 적용할 `AGENTS.md`에 다음 안내를 직접 추가한 뒤 Codex를 다시 시작하거나 새 세션을 시작합니다.

```markdown
여러 단계의 조사, 분석, 문서 작성 또는 구현이 필요한 요청에는
`~/.codex/skills/yunho-harness/SKILL.md`를 읽고 따른다.
같은 대화의 관련 후속 요청에도 적용한다.
`~`는 현재 사용자의 홈 디렉터리로 해석한다.
```

`CODEX_HOME`이 기본 경로가 아니라면 loader의 skill 경로를 실제 설치 위치로 바꿉니다. 새 세션은 설치된 에이전트 프로필을 읽으며, 이미 실행 중인 에이전트 설정은 자동으로 바뀌지 않습니다.

## 실행 흐름

Lead는 종속 구현 task를 순차 조율하고, 승인된 범위·workspace·관련 맥락이 유효하면 Coder를 재사용할 수 있습니다. 설계·계획 깊이와 검증 위험도는 별도로 판단하며, architectural 작업은 written spec과 written plan 승인을 거칩니다. Bounded 작업의 계획 생략은 단일 국소 변경, 종속 단계·공유 상태·lifecycle·통합 순서 없음, 하나의 집중 검증 경로를 모두 만족할 때만 가능합니다.

| 변경 위험 | 최소 흐름 |
|---|---|
| 작은 저위험 | Coder → Lead 집중 확인 → 수락. 확인된 범위와 근거가 명확하면 QA·Reviewer를 자동 호출하지 않습니다. |
| 일반 행동 변경 | Coder → 독립 QA → 수락 |
| Significant/high-risk | Coder → QA → 최종 관련 상태의 전체 변경 독립 검토 → 수락 |

적용 지침이나 승인된 약속이 더 많은 확인을 요구하면 이를 유지합니다. 증거는 범위·실제 결과·관련 상태·독립성·필요한 freshness·흐름상 위치가 유효할 때만 재사용합니다. 관련 변경이나 실패는 영향받은 근거를 무효화합니다. 행동 변경에는 TDD를 적용합니다. 문서·설정의 예외는 brief에 구체적으로 승인된 범위만 따르며 구조 확인을 실제 runtime 동작의 증거로 표현하지 않습니다.

필요한 확인과 발견 사항 처리를 마치고 Lead가 task를 수락한 뒤, Lead는 그 task에 한정된 focused commit을 선택적으로 만들 수 있습니다. stage된 내용과 수락 범위를 대조하고, 미해결 기준이나 필수 확인이 있으면 커밋하지 않습니다. 커밋은 남은 전체 integration 확인을 대체하지 않습니다. Conventional Commits 형식과 간결한 한국어 description을 사용합니다. Push, merge, 배포, 설치는 별도 권한을 따릅니다.

활성 Harness adapter는 기존 설치 문서의 executor 요청과 별도 실행 방법 선택 질문을 현재 순차 흐름에 대응시킵니다. 실행 agent도 자동 reload되지 않습니다. 과거 brief·spec·plan은 당시 승인과 실행의 기록이고, 현재 실행은 활성 Harness 정책을 따릅니다.

## 무결성 범위

`MANIFEST.sha256`은 `install.py`, `install.command`, README, `external-skills.toml`, 선택된 `skill/` 및 `agents/` 파일의 변경 불가 내용을 검사합니다. 편집 가능한 `skill/models.toml`은 무결성 목록에서 제외되며, 대신 version 2 구조와 역할·모델 effort 연결을 검증합니다. 유효한 설정을 편집해도 manifest를 다시 만들 필요는 없습니다. 이 검사는 설정 작성자를 인증하지 않으며, 무결성 목록 자체의 진위나 원격 모델 지원을 증명하지 않습니다.
