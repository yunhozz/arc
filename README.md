# Yunho Harness 설치 및 활성화

## 요구 사항

- Python 3.11 이상
- Node.js와 npm이 제공하는 `npx`
- `git`
- 일반 설치에서 `skills@latest`와 upstream 저장소에 접근할 네트워크
- `install.py`, `install.command`, `README.md`, `MANIFEST.sha256`, `skill/`, `agents/`가 함께 있는 전체 저장소

이 설치 도구는 저장소 안의 공통 설정 모듈과 프로필 템플릿을 사용합니다. 일반 설치는 `obra/superpowers`에서 필수 외부 스킬 네 개를 매번 취득해 갱신합니다. 별도 수동 설치는 필요하지 않습니다. 지원되는 최소 Node.js 버전은 이 저장소가 고정하지 않습니다. 실행 환경에 맞는 Node.js/npm과 `npx`가 필요합니다.

저장소의 `config.toml`은 동시 agent 수를 직접 설정할 때 참고하는 선택 예시입니다. 설치기는 이 파일을 설치하거나 전역 설정에 병합하지 않습니다.

일반 설치의 외부 스킬 취득에는 GitHub와 npm에 익명으로 직접 접근할 수 있어야 합니다. 취득은 임시 HOME·npm 설정·캐시와 제한된 환경에서 실행하며, 현재 사용자 환경의 npm/Git 설정·자격 증명·proxy 관련 환경 변수는 이어받지 않습니다. 기존 인증이나 proxy 설정에 의존하는 회사·개인 네트워크에서는 취득이 실패할 수 있습니다.

## 설치

저장소 루트에서 다음 명령을 실행합니다.

```sh
python3 install.py
```

일반 설치는 내부 payload manifest, 모델 설정, 여섯 프로필 템플릿과 경로를 먼저 검사합니다. 이어 별도 임시 프로젝트에서 아래 명령으로 스킬 네 개를 함께 취득하고 결과를 검증합니다.

```sh
npx --yes skills@latest add https://github.com/obra/superpowers \
  --skill brainstorming writing-plans test-driven-development using-git-worktrees \
  --agent codex --yes --copy --json
```

모든 결과가 검증된 뒤 선택된 Codex home과 이미 존재하는 사용자 `.agents` 후보를 백업하고 갱신합니다. Harness skill과 여섯 프로필도 같은 설치 transaction에서 반영합니다. 설치가 끝나도 전역 설정이나 `AGENTS.md`는 변경하지 않으므로 아래 수동 활성화 안내를 따르세요.

`CODEX_HOME`을 설정하지 않으면 기본 Codex home은 `~/.codex`입니다. 다른 위치를 사용하려면 `CODEX_HOME`에 Codex home 경로를 지정합니다. `CODEX_HOME`이 빈 문자열이면 설치가 실패합니다. 외부 스킬은 선택된 Codex home을 기준으로 설치합니다.

설치 전에 두 가지 읽기 전용 옵션으로 확인할 수 있습니다.

```sh
python3 install.py --check
python3 install.py --dry-run
```

`--check`는 내부 payload, 모델 설정, 여섯 템플릿, 설치 경로와 현재 필수 외부 파일 구조를 검사합니다. `--dry-run`은 같은 로컬 검사를 하고 갱신 대상 경로를 표시합니다. 둘 다 `npx`, subprocess, 네트워크를 실행하지 않으며 파일, 디렉터리, cache, 백업, staging을 만들거나 수정하지 않습니다. 따라서 이 옵션들은 최신 upstream을 확인하지 않습니다. `--check`는 설치된 프로필과 설정 사이의 차이를 검사하는 명령도 아닙니다.

## 필수 외부 스킬

일반 설치는 아래 네 스킬을 매번 `skills@latest`로 다시 취득합니다.

```text
brainstorming
writing-plans
test-driven-development
using-git-worktrees
```

취득한 원본은 `https://github.com/obra/superpowers`입니다. `skills` CLI의 JSON 결과에서 이름, `installed` 상태, `obra/superpowers` source, 명시적인 null ref, project scope, `Codex` agent, copy mode, 임시 프로젝트 안의 예상 경로를 확인합니다. 결과에 hash나 integrity 필드가 있어도 비교하지 않습니다. CLI가 임시 프로젝트에 생성하는 `skills-lock.json`도 pin·승인 근거로 사용하거나 설치 대상으로 복사하지 않습니다. CLI가 추가하는 보통 파일도 skill tree와 함께 갱신되며, 예를 들어 `brainstorming`의 추가 문서와 scripts가 포함될 수 있습니다.

두 설치 후보 위치는 다음과 같습니다.

```text
<selected CODEX_HOME>/skills/<skill-name>
<actual user home>/.agents/skills/<skill-name>
```

선택된 Codex home의 대상은 항상 갱신합니다. 실제 사용자 home의 `.agents/skills/<skill-name>`은 설치 시작 때 이미 존재하는 후보만 함께 갱신합니다. 없는 legacy 후보는 만들지 않습니다. 후보 root와 상위 경로의 symbolic link는 일반 설치에서 거부합니다. plugin cache, 프로젝트별 경로, 다른 사용자 경로는 찾지 않습니다.

`--check`와 `--dry-run`은 두 후보 위치에서 찾은 현재 필수 파일 구조를 검사합니다. 같은 실제 디렉터리를 가리키는 경로는 한 번만 확인합니다. 읽기 전용 검사는 전체 upstream 버전, 변경 여부 또는 source를 인증하지 않습니다. 일반 설치는 현재 외부 스킬이 오래됐거나 필수 파일이 빠져 있어도 새 트리로 복구할 수 있습니다.

네 결과를 모두 받은 뒤 acquired tree 전체를 검사합니다. 각 skill root는 실제 디렉터리여야 하고, 모든 항목은 일반 파일·디렉터리·root 내부를 가리키는 유효한 symbolic link여야 합니다. root 밖으로 나가는 link, dangling link, file 또는 directory link cycle, FIFO/socket 같은 특수 항목을 거부합니다. 내부 link는 최종 설치 tree 안의 상대 link로 다시 기록합니다. 다운로드와 검증은 선택된 Codex home의 실제 파일을 바꾸기 전에 끝납니다.

실패한 CLI 종료 코드, 잘못된 JSON, 누락·중복·skipped·failed 결과, source/ref/mode/path 불일치, 필수 파일 누락, timeout은 설치를 중단합니다. 각 결과가 완전히 검증되기 전에는 target, 백업 또는 target 옆 staging을 만들지 않습니다. 실패는 종료 코드 2입니다. 일반 설치에 Node.js/npm/npx, Git, 네트워크가 필요하지만 `--check`와 `--dry-run`에는 필요하지 않습니다.

## 모델 설정

모델 설정 파일은 `skill/models.toml`입니다. version 3은 `[roles.<role>]` 표만 사용하며, 각 역할의 `model`과 `model_reasoning_effort` 값이 그대로 적용됩니다. 모델별 허용 목록은 두지 않습니다.

다음은 작성 형식의 일부 예시이며, 실제 설정 파일에는 여섯 Harness 역할이 모두 있어야 합니다.

```toml
version = 3

[roles.yunho_team_coder]
model = "example-model-id"
model_reasoning_effort = "medium"
```

표준 설정은 Secretary, Planner, Scout, Coder, QA, Reviewer의 여섯 역할을 정확히 포함합니다. CEO는 현재 chat model을 사용하며 별도 모델 항목이나 프로필을 만들지 않습니다. 유효한 기존 version 3 설정이 이 여섯 역할과 알려진 `yunho_team_lead` 하나를 포함하면, 로더는 Lead 필드까지 검증한 뒤 해당 항목만 effective settings에서 제외하고 stderr로 알립니다. 다른 여섯 model/effort 선택은 보존합니다. 알 수 없는 추가 역할, 누락된 역할, 잘못된 필드나 version은 오류입니다. 원본 설정 파일은 수정하지 않습니다.

로더는 여섯 역할과 각 역할의 필수 문자열 필드를 검증하지만, 원격 서비스가 모델이나 effort를 지원하는지, 계정 접근 권한이나 현재 사용 가능 여부를 확인하지 않습니다. 이전 version 1·2 파일은 자동 변환되지 않습니다. version 3 형식으로 직접 갱신해야 합니다.

새 환경에 설치하면 `install.py`가 설정을 읽고 여섯 프로필을 생성합니다. 설치할 Harness의 staged copy 안에서만 `models.toml`을 표준 여섯 역할로 정규화하며 source payload는 보존합니다. 이전 설치의 사용자 모델 설정을 새 payload 위로 자동 병합하지 않습니다. 유효한 `models.toml` 역할 설정만 편집할 때 manifest를 다시 생성할 필요는 없습니다. 기존 설치에서 모델 설정만 바꾼 경우, 설치된 `models.toml`을 편집한 뒤 다음 스크립트를 실행해 프로필에 반영합니다.

```sh
python3 ~/.codex/skills/yunho-harness/scripts/apply-models.py
```

`CODEX_HOME`을 사용한다면 그 경로 아래의 `skills/yunho-harness/scripts/apply-models.py`를 실행합니다. `apply-models.py --check`는 모든 프로필이 설정과 일치하면 종료 코드 0, 차이가 있으면 1을 반환하며 파일을 수정하지 않습니다. `--dry-run`은 필요한 변경을 표시하고 파일을 수정하지 않습니다. 잘못된 설정, 프로필, 경로는 종료 코드 2입니다. 일반 실행은 여섯 프로필을 모두 읽고 생성 결과를 준비한 뒤 변경 파일을 반영합니다. 표준 및 legacy 설정 모두 지원하며 원본 설정을 다시 쓰거나 stale `yunho-team-lead.toml`을 수정·삭제하지 않습니다. 프로필 퇴역은 설치기가 담당합니다.

## 백업 및 transaction

스킬 취득과 전체 tree 검증이 성공한 뒤, 기존 대상은 첫 교체 전에 `$CODEX_HOME/backups/<timestamp>/` 아래에 복사합니다.

```text
skills/<skill-name>                  # 선택 Codex home의 외부 스킬
legacy-agents-skills/<skill-name>   # 실제 사용자 home의 기존 .agents 후보
skills/yunho-harness                # 기존 Harness skill
agents/<profile>.toml               # 기존 여섯 활성 프로필
agents/yunho-team-lead.toml         # 존재하는 퇴역 프로필
```

백업은 기존 파일과 symbolic link를 따라가지 않고 보존합니다. 새 upstream tree로 전체 디렉터리를 바꾸므로 개인 수정은 백업에 남고 설치 위치에서는 사라집니다. upstream에서 삭제된 파일도 설치 위치에서 제거됩니다. 설치 전 상태가 필요하면 해당 백업의 파일을 직접 복원하세요. 성공한 설치와 실패한 설치 모두 완성된 백업을 보존합니다.

설치기는 선택된 Codex home의 정확한 `agents/yunho-team-lead.toml`만 백업 후 퇴역시킵니다. 다른 home이나 이름의 프로필은 검색·삭제하지 않습니다. 대상이 없으면 no-op이고, 대상 또는 상위 경로의 symlink를 거부하며, 퇴역 대상이 directory나 FIFO 같은 특수 파일이어도 live 변경 전에 거부합니다. 백업 실패 시 live target을 바꾸지 않습니다. `--check`도 이 경로를 검사하며 `--dry-run`은 대상이 있을 때만 backup/removal 계획을 표시합니다.

각 target의 같은 filesystem에 staging을 준비한 뒤, 외부 스킬 갱신·Lead 퇴역·Harness와 활성 프로필 교체를 하나의 journal 순서로 수행합니다. 퇴역 뒤 다른 작업이 실패하면 이전 Lead의 bytes와 mode를 복원하며, 퇴역 자체가 실패하면 앞선 갱신도 rollback합니다. 원래 없던 Lead는 rollback 후에도 없습니다. 중간 오류에서는 완료된 교체를 역순으로 복구합니다. 전체 파일시스템에 걸친 원자성을 제공하지는 않으며, 복구 자체가 실패하면 error 출력에 백업과 보존한 recovery 경로를 표시합니다. 그 경우 표시된 경로를 삭제하지 말고 수동 복구에 사용하세요. 읽기 전용 옵션과 사전 검사 또는 취득·검증 실패는 실제 설치 대상을 변경하지 않습니다.

`skill/`, `agents/` 아래에서 일반 파일인 `.DS_Store`는 설치 파일, 무결성 목록의 포함 범위, 설치 복사에서 제외됩니다. 같은 이름의 symbolic link, directory 또는 특수 파일은 오류입니다.

## 수동 활성화

설치기는 전역 설정이나 `AGENTS.md`를 변경하지 않습니다. 적용할 `AGENTS.md`에 다음 안내를 직접 추가한 뒤 Codex를 다시 시작하거나 새 세션을 시작합니다.

```markdown
여러 단계의 조사, 분석, 문서 작성 또는 구현이 필요한 요청에는
`~/.codex/skills/yunho-harness/SKILL.md`를 읽고 따른다.
같은 대화의 관련 후속 요청에도 적용한다.
`~`는 현재 사용자의 홈 디렉터리로 해석한다.
```

`CODEX_HOME`이 기본 경로가 아니라면 loader의 skill 경로를 실제 설치 위치로 바꿉니다. 새 세션은 설치된 에이전트 프로필을 읽으며, 이미 실행 중인 에이전트 설정과 parent 관계는 자동으로 바뀌지 않습니다. 정책과 프로필의 구조 확인은 runtime parent 관계를 실행 검증한 근거가 아닙니다.

## 실행 흐름

CEO는 개발·설정·tests·구현 의존 문서·구현을 포함한 혼합 작업의 유일한 소유자이며 조율, 승인, 통합, 수락, 완료를 담당합니다. 실제 할당된 구현·설정·test-code 파일은 Coder가 편집합니다.

Secretary는 자료 기반 조사·분석(문서, 데이터, reference sources, static logs/reports 및 기술 자료 포함)과 독립 문서 작성을 담당합니다. 공개적으로 문서화된 운영 방법 조사는 범위 안입니다. 현재 disk/cache/system/filesystem/environment/app/process 상태 취득·검사와 operational cleanup은 범위 밖이며, 이 경계가 해당 작업의 소유자를 자동 지정하지 않습니다. 구현·설정·test-code가 섞인 요청과 findings는 CEO에게 반환합니다.

CEO는 depth 1이고 Secretary, Planner, Scout, Coder, QA, Reviewer는 모두 CEO 직속 depth 2입니다. 이 역할들은 agent를 생성하거나 다른 역할에 직접 위임하지 않습니다. 전체 트리의 동시 활성 subagent 상한은 Secretary를 포함해 4개이며 예약 slot은 없습니다. Secretary가 specialist 지원을 필요로 하면 질문·자료 경로·예상 결과를 CEO에게 전달하고, CEO가 specialist를 호출해 결과를 Secretary에게 전달합니다. 종속 handoff는 순차 진행하고 독립 작업만 병렬화하며 편집 scope는 겹치지 않게 할당합니다. `config.toml`의 runtime concurrent-thread 설정은 별도이며 변경하지 않습니다.

CEO는 종속 구현 task를 순차 조율하고, 승인된 범위·workspace·관련 맥락이 유효하면 Coder를 재사용할 수 있습니다. 설계·계획 깊이와 검증 위험도는 별도로 판단하며, architectural 작업은 written spec과 written plan 승인을 거칩니다. Bounded 작업의 계획 생략은 단일 국소 변경, 종속 단계·공유 상태·lifecycle·통합 순서 없음, 하나의 집중 검증 경로를 모두 만족할 때만 가능합니다.

| 변경 위험 | 최소 흐름 |
|---|---|
| 작은 저위험 | Coder → CEO 집중 확인 → 수락. 확인된 범위와 근거가 명확하면 QA·Reviewer를 자동 호출하지 않습니다. |
| 일반 행동 변경 | Coder → 독립 QA → 수락 |
| Significant/high-risk | Coder → QA → 최종 관련 상태의 전체 변경 독립 검토 → 수락 |

적용 지침이나 승인된 약속이 더 많은 확인을 요구하면 이를 유지합니다. 증거는 범위·실제 결과·관련 상태·독립성·필요한 freshness·흐름상 위치가 유효할 때만 재사용합니다. 관련 변경이나 실패는 영향받은 근거를 무효화합니다. 행동 변경에는 TDD를 적용합니다. 문서·설정의 예외는 brief에 구체적으로 승인된 범위만 따르며 구조 확인을 실제 runtime 동작의 증거로 표현하지 않습니다.

필요한 확인과 발견 사항 처리를 마치고 CEO가 task를 수락한 뒤, CEO는 그 task에 한정된 focused commit을 선택적으로 만들 수 있습니다. stage된 내용과 수락 범위를 대조하고, 미해결 기준이나 필수 확인이 있으면 커밋하지 않습니다. 커밋은 남은 전체 integration 확인을 대체하지 않습니다. Conventional Commits 형식과 간결한 한국어 description을 사용합니다. Push, merge, 배포, 설치는 별도 권한을 따릅니다.

활성 Harness adapter는 기존 설치 문서의 executor 요청과 별도 실행 방법 선택 질문을 현재 순차 흐름에 대응시킵니다. 실행 agent도 자동 reload되지 않습니다. 과거 brief·spec·plan은 당시 승인과 실행의 기록이고, 현재 실행은 활성 Harness 정책을 따릅니다.

## 무결성 범위

`MANIFEST.sha256`은 `install.py`, `install.command`, README, 선택된 `skill/` 및 `agents/` 파일의 변경 불가 내용을 검사합니다. 외부 skills lock이나 외부 skill SHA snapshot은 사용하지 않습니다. 외부 내용은 매 일반 설치에서 upstream에서 가져오며, CLI 결과의 source/ref/mode와 acquired tree의 경로·종류·link 안전성을 확인합니다. 이 검사는 원격 저장소 출처를 독립적으로 암호학적으로 인증하거나, 특정 upstream byte 버전을 고정하지 않습니다.

편집 가능한 `skill/models.toml`은 내부 manifest에서 제외되며, 대신 version 3 설정에서 여섯 역할이 모두 있는지와 각 역할의 필수 `model`, `model_reasoning_effort` 필드가 문자열인지 검증합니다. 유효한 설정을 편집해도 manifest를 다시 만들 필요는 없습니다. 내부 manifest는 포함 파일의 무결성을 검사하지만 manifest 자체의 진위나 원격 모델 지원을 증명하지 않습니다.
