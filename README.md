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

`--check`는 배포 파일(MANIFEST)과 설치 경로를 검사하고, `--dry-run`은 변경 대상을 보여줍니다. 둘 다 파일을 바꾸거나 네트워크에 접속하지 않으며, 외부 스킬이 아직 없는 새 환경에서도 통과합니다(외부 스킬 존재·내용 검증은 실제 설치 때 수행). 외부 스킬 경로 안전성은 실제 설치와 같은 기준으로 검사하므로(예: 심볼릭 링크된 외부 스킬 디렉터리는 거부) 결과가 실제 설치를 예측합니다.
Claude 대상의 `--dry-run`은 허용 링크의 독립 upstream 디렉터리 전환 예정도 표시하며 금지 링크는 오류로 알립니다.

## 🛠 설치가 바꾸는 것

- 전역 지침: Codex는 `AGENTS.md`, Claude는 `CLAUDE.md` 끝에 `yunho-harness:begin`/`yunho-harness:end` 표식 사이의 관리 블록을 추가하거나 갱신합니다. 표식 밖의 내용은 그대로 둡니다.
- Codex `config.toml`에는 `[features.multi_agent_v2]`의 `min_wait_timeout_ms = 120000`, `default_wait_timeout_ms = 300000`만 설정합니다. `features.multi_agent_v2`가 독립 테이블이 아니면 수정하지 않고 수동 설정 안내를 출력합니다.
- 백업은 `<home>/backups/yunho-harness-<UTC시각>/`에 저장합니다(`<home>`은 `~/.codex` 또는 `~/.claude`). 설치할 때마다 만들어지며 새 설치에서는 비어 있을 수 있습니다.
- Codex 설치는 폐기된 프로필 `harness-secretary.toml`, `harness-scout.toml`이 있으면 백업 후 제거하고, `~/.agents/skills/<스킬>`에 기존 복사본이 있으면 백업 후 갱신합니다.
- Claude는 기본값이 아니거나 비었거나 상대 경로인 `CLAUDE_CONFIG_DIR`을 거부합니다. `~/.claude`를 사용하세요.
- 재설치하면 설치된 `models.toml`이 배포 기본값으로 덮어써집니다(이전 파일은 백업에 남음). 설치된 `models.toml`을 고친 뒤에는 해당 스킬의 `scripts/apply-models.py`를 실행해 프로필에 반영하세요.
- 외부 스킬은 고정되지 않은 `skills@latest`로 가져오므로 설치 시점마다 upstream 내용이 달라질 수 있습니다.
- 배포 파일을 고치면 `MANIFEST.sha256`을 갱신해야 합니다(`models.toml`은 제외).

### `--skip-global` 수동 반영

`--skip-global`을 쓰면 위 전역 파일을 건드리지 않습니다. 직접 반영하려면 대상 파일(`AGENTS.md` 또는 `CLAUDE.md`) 끝에 아래 블록을 붙이세요. `<SKILL>`은 Codex `~/.codex/skills/yunho-harness/SKILL.md`, Claude `~/.claude/skills/yunho-harness/SKILL.md`입니다.

````md
<!-- yunho-harness:begin (managed by install.py; content between these markers is replaced on install) -->
## Yunho's Harness

- For requests requiring substantive multi-step research, analysis, or implementation, configuration, or test work (not standalone document writing), load and follow `<SKILL>`; keep following it in relevant follow-up turns of the same chat without re-reading it unless it changed. Resolve `~` to the current user's home directory. Harness subagents (depth 2) follow their role profile and brief instead and do not load `SKILL.md`.
- For repository implementation, configuration, or test work, CEO owns coordination and acceptance; assign file edits and other work to the other roles according to their defined responsibilities. CEO must not edit implementation, configuration, or test-code files directly, except under the Harness CEO direct path for small, low-risk tasks. The other roles stay within their assigned scopes and report to CEO.
<!-- yunho-harness:end -->
````

Codex는 `~/.codex/config.toml`에 다음도 추가합니다.

```toml
[features.multi_agent_v2]
min_wait_timeout_ms = 120000
default_wait_timeout_ms = 300000
```

## ⚙️ 모델 설정

역할별 모델 설정은 [Codex](codex/skill/models.toml)와 [Claude Code](claude/skill/models.toml)에 있습니다.

## 📚 자세히 보기

- [Codex 운영 지침](codex/skill/SKILL.md) · [Claude Code 운영 지침](claude/skill/SKILL.md)
- Codex: [계획](codex/skill/references/planning.md) · [작업 인계](codex/skill/references/handoff.md) · [검증](codex/skill/references/verification.md)
- Claude Code: [계획](claude/skill/references/planning.md) · [작업 인계](claude/skill/references/handoff.md) · [검증](claude/skill/references/verification.md)
- 선택 도구(설치되지 않음): Codex 역할별 토큰 사용량 집계 `python3 codex/tools/codex_token_usage.py --since YYYY-MM-DD`
