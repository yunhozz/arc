# Yunho Harness

Codex와 Claude Code에서 조사·설계·구현을 역할별로 나누고, CEO가 작업을 조율하고 통합합니다.

![역할 흐름 그림](docs/images/role-flow.png)

> 작업마다 필요한 역할만 배정합니다. QA와 Reviewer는 변경 위험과 범위에 맞춰 참여합니다.

## 👥 역할

| 역할 | 담당 |
|---|---|
| CEO | 조율·승인·통합·수락 |
| Scouter | 읽기 전용 조사와 정적 탐색 |
| Planner | 설계와 구현 계획 |
| Coder | 승인된 범위의 파일 편집 |
| QA | 독립 검증 |
| Reviewer | 중요 변경의 독립 검토 |

## 🚀 설치

**필요:** Python 3.11+, Node.js/npm(`npx`), Git, 네트워크 연결.

저장소 루트에서 설치 대상을 하나 지정합니다.

```sh
./install.command --target codex
./install.command --target claude
```

`--target`은 필수입니다. 설치기는 `brainstorming`, `writing-plans`, `test-driven-development`를 [obra/superpowers](https://github.com/obra/superpowers)에서 가져옵니다.

| 대상 | 설치 위치 |
|---|---|
| Codex | `~/.codex` (또는 `CODEX_HOME`), `skills/`, `agents/`, `AGENTS.md`, `config.toml` |
| Claude Code | `~/.claude`, `skills/`, `agents/`, `CLAUDE.md` |

기존 관리 파일은 갱신 전에 백업합니다. 전역 안내와 설정을 건너뛰려면 `--skip-global`을 추가하세요.

Claude의 세 필수 외부 스킬이 각각 정확히 같은 이름의 기본 `~/.codex/skills/<name>` 디렉터리를 가리키는 마지막 심볼릭 링크라면, 설치기는 이를 검증된 upstream 내용의 독립 Claude 디렉터리로 전환합니다. Codex 파일과 사용자 수정은 보존되며 Claude로 복사하지 않습니다. Claude 부모·중간 경로 링크, 다른 목적지나 이름, 끊어진 링크, 순환 링크, 파일 목적지 및 Codex 목적지 경로의 링크는 거부합니다.

원래 링크 항목은 `~/.claude/backups/` 아래에 원본 링크 문자열로 백업하며 설치 실패 시 복원합니다. 상대 링크 백업은 원래 위치로 복원할 때 사용하며 백업 위치에서 역참조하지 않습니다. 복구가 실패하면 출력된 절대 recovery 경로의 자료를 보존합니다.

## 🔎 설치 전 확인

```sh
./install.command --target codex --check
./install.command --target codex --dry-run
```

`--check`는 설치 파일과 경로를 검사하고, `--dry-run`은 변경 대상을 보여줍니다. 둘 다 파일을 바꾸거나 네트워크에 접속하지 않습니다.
Claude 대상의 `--dry-run`은 허용 링크의 독립 upstream 디렉터리 전환 예정도 표시하며 금지 링크는 오류로 알립니다.

## ⚙️ 모델 설정

역할별 모델 설정은 [Codex](codex/skill/models.toml)와 [Claude Code](claude/skill/models.toml)에 있습니다.

## 📚 자세히 보기

- [Codex 운영 지침](codex/skill/SKILL.md) · [Claude Code 운영 지침](claude/skill/SKILL.md)
- [계획](codex/skill/references/planning.md) · [작업 인계](codex/skill/references/handoff.md) · [검증](codex/skill/references/verification.md)
