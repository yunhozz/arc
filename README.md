# Yunho Harness

Codex와 Claude Code에서 조사·설계·구현·검증을 역할별로 나눕니다. CEO가 작업을 판단하고 조율하며, 결과를 수락합니다.

![작업 흐름 그림](docs/images/role-flow.svg)

## 👥 역할

| 역할 | 담당 | 편집 |
|---|---|---|
| CEO | 작업 판단, 역할 배정, 승인 요청, 통합, 수락·커밋 | 작고 위험이 낮은 작업만 직접 |
| Scouter | 자료 조사, 코드·문서·로그 정적 탐색 | 없음 |
| Planner | 설계·스펙·계획 초안 | 없음 |
| Coder | 승인된 범위의 구현·설정·테스트 편집 | 배정된 파일만 |
| QA | 수락 기준별 독립 검증 | 없음 |
| Reviewer | 중요 변경의 최종 독립 검토 | 없음 |

- 모든 역할은 CEO에게만 보고하며 다른 에이전트를 만들거나 일을 넘기지 않습니다.
- 동시에 실행하는 하위 에이전트는 최대 4개입니다. 서로 의존하는 일은 순서대로 진행합니다.
- 간단한 질문이나 이미 아는 파일 몇 개만 보면 되는 확인은 CEO가 직접 처리합니다.

## 🧭 작업 흐름

CEO는 요청을 **설계 깊이**와 **위험도**의 두 기준으로 따로 판단합니다. 설계 깊이는 실행 전에 거칠 승인 단계를 정하고, 위험도는 실행 후 검증 강도를 정합니다.

### 설계 깊이

Planner가 경로와 초안을 제안하고, CEO가 통합해 사용자 승인을 받습니다.

| 경로 | 언제 | 승인 순서 |
|---|---|---|
| **Spike** | 가능한지부터 확인해야 할 때 | 질문·방법 승인 → 탐색 → 결과 보고 → 깊이를 다시 판단해 구현을 새로 승인 |
| **Bounded** | 범위가 분명한 변경 | 짧은 설계 승인 → (필요하면) 계획 승인 → 구현 |
| **Architectural** | 구조나 계약을 바꾸는 변경 | 설계 승인 → 스펙 승인 → 계획 승인 → 구현 |

- Bounded는 한 곳만 바꾸고, 의존 단계·공유 상태·통합 순서 문제가 없으며, 검증 경로가 하나일 때만 계획을 생략합니다.
- 승인된 설계·스펙·계획 문서는 구현 전에 한 번의 문서 커밋으로 묶습니다.
- 구현 전에 현재 브랜치를 그대로 쓸지 작업 브랜치를 만들지 사용자에게 고르게 합니다.

### 위험도별 검증

| 위험도 | 기준 | 흐름 |
|---|---|---|
| **작음·저위험** | 범위가 좁고, 이해되었고, 되돌리기 쉬우며, 집중 확인으로 검증 가능 | Coder 또는 CEO 직접 편집 → CEO 집중 확인 → 수락 |
| **일반** | 저위험 조건을 벗어난 동작 변경 | Coder → QA → 수락 |
| **중대·고위험** | 공유 역할 계약, 공유 상태, 생명주기·통합 순서, 보안·권한, 데이터 손실·마이그레이션, 공개 인터페이스, 비용이 큰 설치·배포 | Coder → QA → Reviewer → 수락 |

- 위험도가 불분명하면 먼저 조사하거나 더 높은 흐름을 따릅니다.
- 계획이 있으면 최상위 작업 하나가 커밋 하나입니다. CEO가 작업마다 검증하고 수락한 뒤 커밋합니다.
- Reviewer는 작업마다 참여하지 않습니다. 모든 작업을 수락한 뒤 최종 전체 변경을 한 번 검토합니다.
- CEO 직접 편집은 작고 위험이 낮으며 계획이 필요 없을 때만 가능합니다. 짧은 설계를 사용자에게 보여주고 승인을 받은 뒤 진행합니다.
- Coder는 기능·동작 변경에 TDD를 따릅니다. TDD 생략은 작고 위험이 낮으며 계획이 필요 없는 작업만 가능합니다.

두 기준은 서로 독립적입니다. Architectural이라고 단계마다 QA·Reviewer를 더하지 않고, Bounded라고 위험이 낮다는 뜻은 아닙니다. push·merge·배포는 언제나 따로 승인을 받습니다.

## 🚀 설치

**필요:** Python 3.11+, Node.js/npm(`npx`), Git, 네트워크 연결.

저장소 루트에서 설치 대상을 하나 지정합니다(`--target` 필수).

```sh
./install.command --target codex
./install.command --target claude
```

| 대상 | 설치 위치 |
|---|---|
| Codex | `~/.codex` (또는 `CODEX_HOME`): `skills/`, `agents/`, `AGENTS.md`, `config.toml` |
| Claude Code | `~/.claude`: `skills/`, `agents/`, `CLAUDE.md` |

설치기는 외부 스킬 `brainstorming`, `writing-plans`, `test-driven-development`를 [obra/superpowers](https://github.com/obra/superpowers)에서 가져옵니다. 버전을 고정하지 않은 `skills@latest`를 쓰므로 설치 시점마다 내용이 달라질 수 있습니다.

### 설치 전 확인

```sh
./install.command --target codex --check
./install.command --target codex --dry-run
```

- `--check`는 배포 파일(MANIFEST)과 설치 경로를 검사하고, `--dry-run`은 바뀔 파일을 보여줍니다.
- 둘 다 파일을 바꾸거나 네트워크에 접속하지 않습니다. 외부 스킬이 아직 없는 새 환경에서도 통과합니다. 외부 스킬의 존재와 내용은 실제 설치 때 검증합니다.
- 외부 스킬 경로의 안전성은 실제 설치와 같은 기준으로 검사하므로, 결과가 실제 설치 결과를 예측합니다.

### 설치가 바꾸는 것

- **전역 지침:** `AGENTS.md`(Codex) 또는 `CLAUDE.md`(Claude) 끝에 `yunho-harness:begin`/`yunho-harness:end` 표식 사이의 관리 블록을 추가하거나 갱신합니다. 표식 밖 내용은 그대로 둡니다.
- **Codex `config.toml`:** `[features.multi_agent_v2]`의 `min_wait_timeout_ms = 120000`, `default_wait_timeout_ms = 300000`만 설정합니다. 이 항목이 독립 테이블이 아니면 수정하지 않고 수동 설정 안내를 출력합니다.
- **백업:** 기존 관리 파일은 `<home>/backups/yunho-harness-<UTC시각>/`에 백업한 뒤 갱신합니다(`<home>`은 `~/.codex` 또는 `~/.claude`). 새 설치에서는 백업 폴더가 비어 있을 수 있습니다.
- **Codex 정리:** 폐기된 프로필 `harness-secretary.toml`, `harness-scout.toml`은 백업 후 제거합니다. `~/.agents/skills/<스킬>`의 기존 복사본은 백업 후 갱신합니다.
- **Claude 경로:** 기본값이 아니거나 비었거나 상대 경로인 `CLAUDE_CONFIG_DIR`은 거부합니다. `~/.claude`를 사용하세요.
- **Claude 외부 스킬 링크:** 세 외부 스킬이 같은 이름의 `~/.codex/skills/<name>` 디렉터리를 가리키는 심볼릭 링크라면, 검증된 upstream 내용으로 된 독립 Claude 디렉터리로 바꿉니다. Codex 쪽 파일과 사용자 수정은 그대로 둡니다. 그 밖의 링크(부모·중간 경로 링크, 다른 목적지나 이름, 끊어진 링크, 순환 링크, 파일 목적지, Codex 목적지 경로 안의 링크)는 거부합니다. 원래 링크는 `~/.claude/backups/`에 백업하고 설치가 실패하면 복원합니다. 복구마저 실패하면 출력된 recovery 경로의 자료를 보존하세요.
- **`models.toml`:** 재설치하면 배포 기본값으로 덮어씁니다(이전 파일은 백업에 남음).

`--skip-global`을 붙이면 전역 지침과 Codex `config.toml`을 건드리지 않습니다.

### `--skip-global` 수동 반영

대상 파일(`AGENTS.md` 또는 `CLAUDE.md`) 끝에 아래 블록을 붙이세요. `<SKILL>`은 Codex `~/.codex/skills/yunho-harness/SKILL.md`, Claude `~/.claude/skills/yunho-harness/SKILL.md`입니다.

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

역할별 모델과 추론 강도는 [Codex](codex/skill/models.toml)와 [Claude Code](claude/skill/models.toml)의 `models.toml`에 있습니다. CEO는 대화 중인 모델을 씁니다.

설치된 `models.toml`을 고친 뒤에는 해당 스킬의 `scripts/apply-models.py`를 실행해 역할 프로필에 반영하세요.

```sh
python3 ~/.claude/skills/yunho-harness/scripts/apply-models.py
python3 ~/.codex/skills/yunho-harness/scripts/apply-models.py
```

## 🧑‍💻 개발

- 배포 파일을 고치면 `MANIFEST.sha256`을 갱신해야 합니다(`models.toml`은 제외).
- 테스트: `python3 -m unittest discover -s tests`

## 📚 자세히 보기

- [Codex 운영 지침](codex/skill/SKILL.md) · [Claude Code 운영 지침](claude/skill/SKILL.md)
- Codex: [계획](codex/skill/references/planning.md) · [작업 인계](codex/skill/references/handoff.md) · [검증](codex/skill/references/verification.md)
- Claude Code: [계획](claude/skill/references/planning.md) · [작업 인계](claude/skill/references/handoff.md) · [검증](claude/skill/references/verification.md)
- 선택 도구(설치되지 않음): Codex 역할별 토큰 사용량 집계 `python3 codex/tools/codex_token_usage.py --since YYYY-MM-DD`
