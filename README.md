# ARC (Agent Role Coordination)

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

**필요:** Node.js 22 이상과 npm(`npx`), Git, 외부 스킬을 받을 네트워크 연결. npm 설치와 프리셋 적용에는 Python, 컴파일러, `node-gyp`가 필요하지 않습니다. 네 플랫폼의 사전 빌드 네이티브 파일을 패키지에 포함합니다.

지원 환경은 macOS 13 이상(arm64/x64), glibc 2.28 이상 Linux(arm64/x64)입니다. Windows와 musl Linux는 지원하지 않습니다. 미지원 환경이나 네이티브 파일 누락·변조는 파일을 바꾸기 전에 실패합니다.

저장소 checkout 없이 실행하거나, 저장소 루트의 shell 진입점을 사용합니다.

```sh
npx --yes github:yunhozz/arc
npx --yes github:yunhozz/arc --target codex --preset balanced
./install.command
./install.command --target claude --preset smart
./install.command --target all --preset economy
```

대화형 실행은 stdin과 stdout이 모두 TTY일 때 빠진 값만 영어로 묻습니다. 첫 질문은 `Select an installation target:`이며 `Claude`, `Codex`, `All` 중 직접 선택합니다(기본 대상 없음). 다음 질문은 `Select a performance preset:`이며 `Economy`, `Balanced (default)`, `Smart` 중 선택합니다. 프리셋에서 Enter를 누르면 Balanced가 적용됩니다. 잘못 입력하면 다시 묻고 별도 확인 질문은 없습니다. 비대화형 실행에서는 `--target`과 `--preset`을 모두 지정해야 합니다.

`All`은 양쪽 사전 검사 후 Codex, Claude 순서로 독립 설치합니다. Codex 성공 뒤 Claude가 실패하면 Codex 성공은 유지하고 Claude만 복구합니다. 출력된 플랫폼별 상태와 `Backup:`/`Recovery:` 경로를 확인한 뒤 실패한 대상만 같은 프리셋으로 다시 실행하세요.

| 대상 | 설치 위치 |
|---|---|
| Codex | `~/.codex` (또는 `CODEX_HOME`): `skills/`, `agents/`, `AGENTS.md`, `config.toml` |
| Claude Code | `~/.claude`: `skills/`, `agents/`, `CLAUDE.md` |

설치기는 외부 스킬 `brainstorming`, `writing-plans`, `test-driven-development`를 [obra/superpowers](https://github.com/obra/superpowers)에서 가져옵니다. 버전을 고정하지 않은 `skills@latest`를 쓰므로 설치 시점마다 내용이 달라질 수 있습니다.

### 설치 전 확인

```sh
./install.command --target codex --preset balanced --check
./install.command --target all --preset smart --dry-run
```

- `--check`는 배포 파일(MANIFEST)과 설치 경로를 검사하고, `--dry-run`은 바뀔 파일을 보여줍니다.
- 둘 다 파일을 바꾸거나 subprocess·네트워크를 사용하지 않습니다. 외부 스킬이 아직 없는 새 환경에서도 통과합니다. 외부 스킬의 존재와 내용은 실제 설치 때 검증합니다.
- 외부 스킬 경로의 안전성은 실제 설치와 같은 기준으로 검사하므로, 결과가 실제 설치 결과를 예측합니다.

### 설치가 바꾸는 것

- **전역 지침:** `AGENTS.md`(Codex) 또는 `CLAUDE.md`(Claude) 끝에 `arc:begin`/`arc:end` 표식 사이의 관리 블록을 추가하거나 갱신합니다. 표식 밖 내용은 그대로 둡니다. 이전 설명형 관리 표식이 있으면 자동 이전하지 않고 쓰기 전에 거부합니다.
- **Codex `config.toml`:** `[features.multi_agent_v2]`의 `min_wait_timeout_ms = 120000`, `default_wait_timeout_ms = 300000`만 설정합니다. 이 항목이 독립 테이블이 아니면 수정하지 않고 수동 설정 안내를 출력합니다.
- **백업:** 기존 관리 파일은 `<home>/backups/arc-<UUID>/`에 백업한 뒤 갱신합니다(`<home>`은 `~/.codex` 또는 `~/.claude`). 새 설치에서는 백업 폴더가 비어 있을 수 있습니다.
- **Codex 외부 스킬:** `~/.agents/skills/<스킬>`의 기존 복사본은 백업 후 갱신합니다. 설치 대상이 아닌 사용자 프로필은 변경하지 않습니다.
- **Claude 경로:** 기본값이 아니거나 비었거나 상대 경로인 `CLAUDE_CONFIG_DIR`은 거부합니다. `~/.claude`를 사용하세요.
- **Claude 외부 스킬 링크:** 세 외부 스킬이 같은 이름의 `~/.codex/skills/<name>` 디렉터리를 가리키는 심볼릭 링크라면, 검증된 upstream 내용으로 된 독립 Claude 디렉터리로 바꿉니다. Codex 쪽 파일과 사용자 수정은 그대로 둡니다. 그 밖의 링크(부모·중간 경로 링크, 다른 목적지나 이름, 끊어진 링크, 순환 링크, 파일 목적지, Codex 목적지 경로 안의 링크)는 거부합니다. 원래 링크는 `~/.claude/backups/`에 백업하고 설치가 실패하면 복원합니다. 복구마저 실패하면 출력된 recovery 경로의 자료를 보존하세요.
- **`models.toml`:** 재설치하면 선택한 Economy/Balanced/Smart 프리셋으로 설정과 다섯 역할 프로필을 함께 갱신합니다(이전 파일은 백업에 남음).
- **복구 자료:** 출력의 `Backup:`은 이전 관리 파일 백업이고 `Recovery:`는 별도의 복구 자료 위치입니다. 대상 부모마다 비공개 `0700` 권한의 `.arc-stage-*` 디렉터리를 만들며 성공·복원된 롤백·실패 모두에서 유지합니다. 재실행도 이 디렉터리를 자동 삭제하지 않으므로 누적됩니다. 설치 결과와 백업·복구 내용을 직접 확인하고 더 이상 필요하지 않은 디렉터리만 사용자가 수동 정리하세요. 복구 실패 시에는 자료를 먼저 보존하세요. 부모 경로가 이동·교체된 경우 출력 경로는 마지막으로 확인한 위치이므로 수동 탐색이 필요할 수 있습니다.

`--skip-global`을 붙이면 전역 지침과 Codex `config.toml`을 건드리지 않습니다.

### `--skip-global` 수동 반영

대상 파일(`AGENTS.md` 또는 `CLAUDE.md`) 끝에 아래 블록을 붙이세요. `<SKILL>`은 Codex `~/.codex/skills/arc/SKILL.md`, Claude `~/.claude/skills/arc/SKILL.md`입니다.

````md
<!-- arc:begin -->
## Agent Role Coordination

- For requests requiring substantive multi-step research, analysis, or implementation, configuration, or test work (not standalone document writing), load and follow `<SKILL>`; keep following it in relevant follow-up turns of the same chat without re-reading it unless it changed. Resolve `~` to the current user's home directory. ARC subagents (depth 2) follow their role profile and brief instead and do not load `SKILL.md`.
- For repository implementation, configuration, or test work, CEO owns coordination and acceptance; assign file edits and other work to the other roles according to their defined responsibilities. CEO must not edit implementation, configuration, or test-code files directly, except under the ARC CEO direct path for small, low-risk tasks. The other roles stay within their assigned scopes and report to CEO.
<!-- arc:end -->
````

Codex는 `~/.codex/config.toml`에 다음도 추가합니다.

```toml
[features.multi_agent_v2]
min_wait_timeout_ms = 120000
default_wait_timeout_ms = 300000
```

## ⚙️ 모델 설정

역할별 모델과 추론 강도는 [Codex](codex/skill/models.toml)와 [Claude Code](claude/skill/models.toml)의 `models.toml`에 있습니다. CEO는 대화 중인 모델을 씁니다.

설치된 `models.toml`을 직접 고친 경우에만 선택 도구 `scripts/apply-models.py`로 역할 프로필에 반영할 수 있습니다. 이 수동 도구는 Python 3.11 이상이 필요하며 npm 설치·프리셋 적용의 의존성이 아닙니다. 기존 `python3 install.py` 진입점은 제거되었습니다.

```sh
python3 ~/.claude/skills/arc/scripts/apply-models.py
python3 ~/.codex/skills/arc/scripts/apply-models.py
```

## 🧑‍💻 개발

- 배포 파일을 고치면 `MANIFEST.sha256`을 갱신해야 합니다(`models.toml`은 제외).
- Node 테스트: `npm ci --ignore-scripts`, 호스트용 검증된 native 테스트 fixture 준비 후 `npm test`.
- 유지보수용 Python 회귀 테스트: `python3 -B -m unittest discover -s tests` (선택 도구·정책·payload 검증용).
- parity 검증: `node scripts/check-installer-parity.mjs --complete`; manifest 검증: `node scripts/update-manifest.mjs --check`.
- 격리된 실제 upstream 확인: `node tests/node/live-upstream.mjs`. 네트워크 실패는 검증되지 않은 결과로 보고합니다. 일반 `npm test`는 외부 npx만 결정적인 fixture로 대체합니다.

## 📚 자세히 보기

- [Codex 운영 지침](codex/skill/SKILL.md) · [Claude Code 운영 지침](claude/skill/SKILL.md)
- Codex: [계획](codex/skill/references/planning.md) · [작업 인계](codex/skill/references/handoff.md) · [검증](codex/skill/references/verification.md)
- Claude Code: [계획](claude/skill/references/planning.md) · [작업 인계](claude/skill/references/handoff.md) · [검증](claude/skill/references/verification.md)
- 선택 도구(설치되지 않음): Codex 역할별 토큰 사용량 집계 `python3 codex/tools/codex_token_usage.py --since YYYY-MM-DD`
