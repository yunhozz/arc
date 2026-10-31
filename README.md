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

- **Install or update:** Open `Install / Update`, choose Codex, Claude Code, or both, then set the preset, limits, language, and global settings. Select `Execute` and press Enter. To change only the preset, use `Change Preset`, select `Apply`, and press Enter. Blank lines are not selectable. ARC validates and executes these actions without a review screen.
- **Check version:** `Check Version` shows the current and latest CLI versions. `Version Upgrade` appears only when a newer version is available. Enter applies that version and preserves installed settings. A global upgrade replaces the CLI and ends the session; an npx upgrade uses the displayed payload without replacing the global CLI. Use `Install / Update` to reconfigure the same version.
- **Uninstall:** Choose the harness targets and global instructions, then review with `Edit` or `Cancel`. ARC removes the verified global CLI only after all selected harnesses are removed successfully, including in an npx session. A harness failure or interruption skips CLI removal. Results report partial removals and CLI failures. Unselected harnesses, user files, other npm packages, and the shared npx cache remain. To remove only the CLI, run `npm uninstall -g @yunhozz/arc`.

The TUI requires terminal input and output. It supports only `arc`, `arc --help`, and `arc --version`. Help and version also work without a TTY.

## Codex 진단 훅

Codex 대상 설치·갱신에서 Codex CLI가 감지되면 ARC는 진단 훅을 등록한다. 등록과 실제 실행은 별도 상태다. Codex CLI의 `/hooks`에서 현재 정의를 검토하고 신뢰해야 실행되며, 정의가 바뀌면 다시 검토해야 한다. ARC 상태는 등록, entrypoint 연결, callback 기록을 구분하며 확인되지 않은 trust는 `unknown`으로 표시한다.

훅은 제한된 운영 metadata만 `~/.arc/state/native-diagnostics/codex.jsonl`에 기록한다. 도구 입력, prompt, transcript, 환경 변수는 저장하지 않는다. 이 경로는 진단 전용이며 호출자를 식별하거나 도구 호출을 허용·차단하거나 역할별 Git 제한을 강제하지 않는다. 제거 시에는 확인된 ARC 소유 정의만 정리하고, 충돌이나 남은 참조가 있으면 자산을 보존해 보고한다.

## Models and language

The Orchestrator uses the current conversation model. Specialist roles use the selected preset in [Codex](codex/skill/models.toml) or [Claude Code](claude/skill/models.toml). The TUI is in English; the selected response language applies to agents in new sessions.

## Guides

[Harness operation](docs/harness-operation.md) · [Codex guide](codex/skill/SKILL.md) · [Claude Code guide](claude/skill/SKILL.md)
