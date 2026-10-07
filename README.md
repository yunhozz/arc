# Yunho Harness

This Harness coordinates Codex research, document writing, and development by role. CEO coordinates development, while Secretary and five specialist roles carry out their assigned work.

## 👥 역할과 작업 흐름

| 역할 | 담당 |
|---|---|
| CEO | 현재 채팅 모델로 조율·승인·통합·수락·완료 |
| Secretary | 자료 기반 조사·분석, 독립 문서 작성 |
| Planner | 설계·구현 계획 작성 |
| Scout | 범위를 정한 코드·자료 탐색 |
| Coder | 할당된 구현·설정·테스트 코드 편집 |
| QA | 독립 검증 |
| Reviewer | 독립 검토 |

- 개발·설정·테스트·구현 의존 문서와 구현이 섞인 작업은 CEO가 책임지고, 코드 편집은 Coder에게 맡깁니다.
- Secretary works with materials such as documents, data, and static logs. Researching publicly documented operational methods is also in scope. Inspecting current system, app, or process state and performing operational cleanup are outside scope. This boundary does not automatically assign another owner.
- All six roles report directly to CEO and may not create agents or delegate directly to other roles. The full tree is limited to four concurrent subagents, including Secretary. Parallelize only independent tasks; handle dependent tasks sequentially.

| 변경 위험 | 최소 검증 흐름 |
|---|---|
| 작은 저위험 변경 | Coder → CEO 집중 확인 → 수락 |
| 일반 행동 변경 | Coder → 독립 QA → 수락 |
| 중요하거나 위험이 큰 변경 | Coder → QA → 최종 전체 변경의 독립 검토 → 수락 |

QA는 모든 수락 기준에 확인 방법·범위, 실행 결과, 근거, 기준 판단과 미검증 사유를 연결합니다. 검사 실행 통과는 기준 입증과 구분하며, 일부 확인·검사 부재·환경 차단의 공백은 미검증으로 남깁니다. 구조 검사는 실제 행동·설치·실행 중인 에이전트의 준수를 입증하지 않습니다. 저위험 변경의 CEO 집중 확인에도 같은 근거 구분을 적용합니다.

QA 실행 실패나 기준 불충족은 CEO가 Coder 수정과 QA 재확인을 거친 뒤 Reviewer 단계로 전달합니다. Reviewer의 기준 연계 행동 발견도 CEO를 통해 Coder 수정·QA 재확인으로 이어지며, 중요·고위험 변경은 그 뒤 최종 전체 변경을 다시 검토합니다. Reviewer는 QA 검사를 실행하지 않으며 구조·설계·사실·보안 검토를 유지합니다. CEO가 증거 공백을 명시적으로 처분해도 미검증을 입증으로 바꾸지 않습니다.

UI 수락 기준이 배정되고 brief에 작업공간·기존 실행 명령 또는 URL·계정과 테스트 데이터 범위·허용 상호작용이 있으면, QA는 기존 승인 환경과 사용 가능한 승인 브라우저 도구로 확인합니다. 기준별 명령/URL, 테스트 상태·viewport(해당 없으면 해당 없음), 상호작용 단계, 기대·관찰 결과와 근거를 보고하며, 기동·로딩·정적 검사만으로 전체 UI 동작을 입증하지 않습니다. 전제조건·환경·도구가 부족하면 CEO에 제한을 보고하고 해당 기준은 미검증으로 둡니다. 편집·의존성 설치·환경 설정 변경 권한은 없으며, QA가 만든 프로세스·세션만 정리하고 기존 공유 서비스·세션은 보존합니다. 이 수락 검사는 CEO의 Visual companion 디자인 논의와 구분합니다.

설계·계획 깊이와 검증 위험도는 별도로 판단합니다. 행동 변경에는 기본적으로 TDD를 적용하며, 조건을 모두 만족하는 단일 국소 변경만 CEO가 근거를 기록해 실패 우선 절차를 면제할 수 있습니다. 상세 정책은 [Harness 지침](skill/SKILL.md)을 따릅니다.

## 조건별 필수 참조와 Coder 인계

핵심 [Harness 지침](skill/SKILL.md)을 읽고, 아래 조건이 발생하면 해당 참조를 종속 행동 전에 반드시 읽습니다.
CEO는 배정 역할의 brief에 접근 가능한 참조 경로를 전달합니다. 참조 누락·접근 불가·충돌 시 CEO에게 보고하고 해당 작업을 멈춥니다.
매 작업에 모든 참조를 읽을 필요는 없습니다. 설치기는 `skill/references/`도 재귀 복사하며 manifest로 검사합니다.

| 참조 | 필수 시점 |
|---|---|
| [계획](skill/references/planning.md) | 설계/계획 깊이 판단, spec/plan 작성·승인 전 |
| [인계](skill/references/handoff.md) | Coder 최초 시작·재개 준비와 독립 확인 전 |
| [검증](skill/references/verification.md) | 검증 설계, QA/Reviewer, 수정 재확인, UI 수락 검사 전 |
| [Git 복구](skill/references/git-recovery.md) | 브랜치 충돌, 준비 실패, 부분 완료, metadata 쓰기 거부 시 |
| [Visual companion](skill/references/visual-companion.md) | 시각 자료 제안·companion 운영 전 |

현재 승인 범위의 필요한 문서를 모두 작성·개별 승인받고 집합을 완결한 뒤 실행 대상을 선택합니다.
최초 시작에는 현재 체크아웃 또는 같은 체크아웃의 검증된 새 브랜치를 사용자가 명시 선택해야 합니다.
계획 승인·무응답·불명확한 답변은 선택이 아닙니다. 승인 문서 커밋 또는 유효한 문서 생략 근거와 최종 상태를 확인한 뒤 인계합니다.
문서 작성·승인 중에는 실행 준비 목적의 대상 선택·브랜치 전환·staging·커밋을 하지 않습니다.

동일 승인 범위·작업공간·저장소·실행 대상의 재개는 유효한 최초 명시 선택을 재사용합니다.
CEO와 Coder는 매 시작마다 실제 브랜치 또는 detached HEAD·HEAD·staged/unstaged/untracked 상태,
보존·편집 소유권, 승인 문서·커밋, 승인과 최종 확인을 다시 검증합니다.
범위·작업공간·저장소·대상·승인 branch 후보가 바뀌거나 실패 때문에 기존 대상을 신뢰할 수 없으면 새 명시 선택을 받습니다.
정상 승인 작업의 HEAD·dirty 변화만으로 선택이 무효화되지는 않습니다. 상태 불일치·미해결 실패·누락 증거는 편집을 차단합니다.

최초 인계 기록은 하나의 접근 가능한 정본으로 보존하고 재개 brief에는 그 위치, 다음 목표·소유권,
승인·문서·범위 변경분, 최신 Git 상태·차이, 선택 유효성·재사용 검증, CEO 최종 확인과 남은 문제를 전달합니다.
이전 대화나 접근 불가 링크로 증거를 대신하지 않습니다. 상세 승인 순서·문서 커밋·브랜치 보호와 기록 필드는 인계 참조를 따릅니다.
Git 복구에서는 lock 삭제·chmod/chown·권한 우회·작업공간 이동·자동 reset/stash/clean을 하지 않습니다.

정적 정책 계약 테스트는 문서 구조·계약을 확인하며 실제 에이전트 준수를 입증하지 않습니다.
설치 payload 복사와 manifest 실패 검사는 임시 환경에서 실제 설치기 동작을 확인합니다.
50% 절감 목표는 핵심 파일의 `wc -w` 기준이며 실제 모델 토큰·비용 또는 참조를 포함한 전체 사용량 절감을 보장하지 않습니다.

## 🚀 설치

**준비물:** Python 3.11 이상, Node.js/npm의 `npx`, Git, GitHub·npm에 접근할 네트워크, 전체 저장소.

저장소 루트에서 실행합니다.

```sh
python3 install.py
```

설치기는 내부 파일·모델 설정·프로필을 검사한 뒤, [obra/superpowers](https://github.com/obra/superpowers)에서 다음 세 스킬을 매번 `skills@latest`로 새로 가져옵니다. 별도 수동 설치는 필요하지 않습니다.

```text
brainstorming · writing-plans · test-driven-development
```

취득 결과를 검증한 뒤 외부 스킬, Harness, 여섯 역할 프로필을 백업하고 갱신합니다. 기본 설치 위치는 `~/.codex`이며, 다른 위치는 `CODEX_HOME`으로 지정합니다. 빈 `CODEX_HOME`은 오류입니다.

| 설치 대상 | 갱신 범위 |
|---|---|
| `<CODEX_HOME>/skills/` | 외부 스킬 세 개와 `yunho-harness` |
| `<CODEX_HOME>/agents/` | Harness 역할 프로필 여섯 개 |
| `~/.agents/skills/` | 설치 시작 시 이미 존재하는 외부 스킬 후보만 |

외부 스킬 취득은 임시 환경에서 실행하며 사용자 npm/Git 설정·자격 증명·프록시 환경 변수를 이어받지 않습니다. 해당 설정에 의존하는 네트워크에서는 설치가 실패할 수 있습니다. Node.js 최소 버전은 이 저장소에서 고정하지 않습니다.

### 설치 전 확인

```sh
python3 install.py --check    # 로컬 파일·설정·경로 검사
python3 install.py --dry-run  # 같은 검사와 갱신 대상 표시
```

두 옵션은 파일을 수정하거나 캐시·백업을 만들지 않고, subprocess·`npx`·네트워크도 실행하지 않습니다. Node.js/npm·Git 없이 사용할 수 있습니다. 현재 외부 스킬의 필수 파일 구조를 검사하지만, 최신 upstream이나 설치된 프로필과 모델 설정의 일치 여부를 확인하지는 않습니다. 설치기 오류의 종료 코드는 `2`입니다.

## 🔌 수동 활성화

설치 후 적용할 `AGENTS.md`에 아래 안내를 추가하고 Codex를 다시 시작하거나 새 세션을 엽니다.

```markdown
여러 단계의 조사, 분석, 문서 작성 또는 구현이 필요한 요청에는
`~/.codex/skills/yunho-harness/SKILL.md`를 읽고 따른다.
같은 대화의 관련 후속 요청에도 적용한다.
`~`는 현재 사용자의 홈 디렉터리로 해석한다.
```

`CODEX_HOME`을 지정했다면 위 경로를 실제 설치 위치로 바꿉니다. 설치기는 전역 설정과 `AGENTS.md`를 수정하지 않습니다. 저장소의 `config.toml`은 선택 참고 예시이며 자동 설치·병합하지 않습니다.

새 세션은 설치된 프로필을 읽습니다. 실행 중인 에이전트의 설정과 부모 관계는 자동으로 바뀌지 않으며, 정책·프로필의 구조 확인만으로 실제 실행 관계를 검증한 것은 아닙니다.

## ⚙️ 모델 변경

[skill/models.toml](skill/models.toml)이 여섯 역할의 모델과 추론 강도 설정 원본입니다. CEO는 현재 채팅 모델을 사용합니다.

```toml
version = 3

[roles.yunho_team_coder]
model = "example-model-id"
model_reasoning_effort = "medium"
```

위 예시는 일부만 보여줍니다. 실제 파일에는 여섯 역할과 각 역할의 두 문자열 필드가 모두 필요합니다. 이전 version 1·2는 자동 변환하지 않으며, 모델·추론 강도의 원격 지원이나 계정 접근 권한은 검사하지 않습니다.

새 설치는 저장소 설정을 사용하며 이전 사용자 설정을 자동 병합하지 않습니다. **기존 설치의 모델만 변경하려면** 설치된 `~/.codex/skills/yunho-harness/models.toml`을 편집한 뒤 실행합니다.

```sh
python3 ~/.codex/skills/yunho-harness/scripts/apply-models.py --check
python3 ~/.codex/skills/yunho-harness/scripts/apply-models.py --dry-run
python3 ~/.codex/skills/yunho-harness/scripts/apply-models.py
```

`CODEX_HOME`을 사용한다면 명령의 경로도 바꿉니다. `--check`는 프로필 일치 시 `0`, 차이 발견 시 `1`을 반환합니다. `--dry-run`은 변경 예정 내용을 표시하고, 일반 실행은 프로필에 반영합니다. 설정·프로필·경로 오류는 `2`입니다. 설정 원본은 다시 쓰지 않으며, 유효한 `models.toml` 변경에는 manifest 재생성이 필요하지 않습니다.

## 🛡️ 백업과 무결성

- 기존 대상은 선택한 Codex home의 `backups/<timestamp>/`에 보존합니다. 외부 스킬은 전체 트리를 교체하므로 개인 수정과 upstream에서 삭제된 파일은 설치 위치에서 사라집니다. 이전 내용은 백업에서 직접 복원하세요.
- 취득·검증을 마친 뒤 설치 대상을 교체하며, 중간 오류에서는 완료된 교체를 역순으로 복구합니다. 전체 파일시스템에 걸친 원자성은 보장하지 않습니다. 복구 실패 시 출력된 백업·recovery 경로를 보존해 수동 복구에 사용하세요.
- 외부 스킬 후보와 상위 경로의 심볼릭 링크는 일반 설치에서 거부합니다. 취득한 트리는 내부의 유효한 링크만 허용하고, 외부로 나가는 링크·끊어진 링크·순환 링크·특수 파일은 거부합니다.
- `MANIFEST.sha256`은 설치기·README·선택된 내부 스킬 및 프로필 파일의 무결성을 검사합니다. 편집 가능한 `skill/models.toml`은 제외하고 별도로 설정 형식을 검사합니다. `skill/`, `agents/` 아래 일반 파일인 `.DS_Store`는 제외하며 같은 이름의 다른 항목 유형은 오류입니다.
- 외부 스킬은 특정 버전이나 해시로 고정하지 않습니다. CLI 결과와 트리 구조를 검증하지만 원격 출처를 독립적으로 암호학적 인증하지는 않습니다. 내부 manifest 역시 자체 진위나 원격 모델 지원을 증명하지 않습니다.
