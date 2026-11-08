# ARC — Agent Role Coordination

ARC coordinates work in Codex and Claude Code through scoped roles, clear handoffs, and verification.

![ARC workflow](docs/images/role-flow.svg)

## Roles

| Role | Responsibility |
|---|---|
| Orchestrator | Routes work and accepts results |
| Scouter | Researches sources and explores the repository |
| Planner | Drafts designs, specs, and plans |
| Implementer | Makes assigned changes |
| QA | Runs assigned verification |
| Reviewer | Independently reviews changes |

## Install

**Requirements:** Node.js 22+, npm, Git, and network access. Supported platforms: macOS 13+ and Linux with glibc 2.28+ (arm64 or x64). Windows and musl Linux are not supported. Python, a compiler, and `node-gyp` are not required.

```sh
npm install --global @yunhozz/arc
arc
```

Package installation provides the CLI, not the harness. Install or manage the harness in the interactive TUI. To open it without a global install, run `npx --yes @yunhozz/arc`.

## Manage ARC

- **Install or update:** Choose Codex, Claude Code, or both in `Install / Update`, configure options, then select `Execute`. `Change Preset` changes only the preset.
- **Version:** `Check Version` shows installed and latest CLI versions. `Version Upgrade` appears when available and preserves settings; global upgrades exit ARC, while npx upgrades leave the global CLI unchanged.
- **Uninstall:** Removes selected harnesses; the global CLI is removed only if all succeed. Unselected harnesses and user files remain. To remove only the CLI, run `npm uninstall -g @yunhozz/arc`.

The TUI requires terminal input and output. It supports only `arc`, `arc --help`, and `arc --version`. Help and version also work without a TTY.

## Models and language

The Orchestrator uses the current conversation model. Specialist roles use the selected preset in [Codex](codex/skill/models.toml) or [Claude Code](claude/skill/models.toml). The TUI is in English; the selected response language applies to agents in new sessions.

`Install / Update`와 `Change Preset`의 `Claude & Codex`에서 역할마다 플랫폼·모델·effort를 설정할 수 있습니다. Codex 선택에는 로컬 CLI 계정의 모델 목록이 필요합니다. Claude는 API 카탈로그가 없어도 모델 식별자와 effort를 직접 입력할 수 있으며, API 목록은 CLI 계정의 접근 권한을 증명하지 않습니다. 로그인 확인은 각 로컬 CLI의 상태 명령을 사용하므로 별도 API 키가 필요하지 않습니다.

현재 복합 구성은 저장·활성화와 역할 실행 지원을 구분합니다. 신뢰된 실행 식별, 권한 강제, 실제 모델·effort 관측이 확인되지 않아 모든 역할 실행은 `held / unverified`로 보류됩니다. CLI와 Codex Desktop·Claude Desktop Code의 로컬 세션에서도 실행 지원을 추정하지 않습니다. 새 프로필이 적용되려면 해당 호스트의 새 세션과 별도 실행 근거가 필요합니다.

## Guides

[Harness operation](docs/harness-operation.md) · [Codex guide](codex/skill/SKILL.md) · [Claude Code guide](claude/skill/SKILL.md)
