# 🤖 ARC — Agent Role Coordination

ARC brings clear roles, scoped handoffs, and verification to work in Codex and Claude Code.

![ARC workflow](docs/images/role-flow.svg)

## 👥 Roles

| Role | Responsibility |
|---|---|
| Orchestrator | Routes work and accepts results |
| Scouter | Researches and explores sources |
| Planner | Drafts designs, specs, and plans |
| Implementer | Implements assigned changes |
| QA | Runs assigned verification |
| Reviewer | Independently reviews changes |

## 🚀 Quick start

**Requirements:** Node.js 22+, npm, Git, and network access. Supported platforms are macOS 13+ and Linux with glibc 2.28+ (arm64 or x64). Windows and musl Linux are not supported. Python, a compiler, and `node-gyp` are not required.

전역 CLI를 설치한 뒤 터미널에서 ARC 관리 화면을 엽니다.

```sh
npm i -g @yunhozz/arc
arc
```

npm 설치는 CLI와 안내만 제공합니다. Harness 설치는 `arc`의 영어 TUI에서 진행합니다. 전역 설치 없이 `npx --yes @yunhozz/arc`로 같은 관리 화면을 열 수도 있습니다.

## ⚙️ 공개 명령

```sh
arc
arc --help
arc --version
```

`arc`는 입력과 출력이 모두 TTY인 터미널에서 실행해야 합니다. 파이프·CI·비TTY에서는 종료 코드 2로 끝납니다. `--help`와 `--version`은 터미널 없이 사용할 수 있습니다. 그 밖의 명령과 옵션은 지원하지 않습니다.

## Manage ARC

홈 메뉴는 `Configure`, `Update`, `Uninstall`, `Exit`입니다. `Configure`에서 `Install / Reconfigure` 또는 `Change Preset`을 선택합니다. 설치 대상(Codex·Claude·둘 다), 모델 preset, agent 수 제한, harness 언어, 전역 설정 적용 여부를 조정하고 검토한 뒤 `Apply`로 실행합니다.

검토의 기본 선택은 `Cancel`입니다. `Details`는 작업·대상·준비된 목록의 건수·주요 영향을 먼저 보여주고 전체 변경·삭제·보존 목록을 표시합니다. `Apply`는 전체 상세를 순서대로 확인하고 마지막으로 다시 선택해야 실행됩니다. `Edit`와 검토 화면의 Escape는 설치·Preset·제거 설정으로 돌아가며 입력을 유지합니다. Update에는 `Edit`가 없고 Escape는 홈으로 돌아갑니다. 홈의 Escape와 `Exit`는 종료합니다. 작은 화면에서 필수 정보가 잘리면 터미널을 키워야 적용할 수 있습니다.

TUI 표시 언어는 영어입니다. 선택한 harness 언어(`en` 또는 `ko`)는 설치 후 agent 응답에 적용되며 화면 언어와 별개입니다. 변경한 설정은 새 agent 세션에서 적용됩니다.

Codex와 Claude의 자동 Workflow runtime·연동은 유지됩니다. 수동 Workflow 메뉴·명령·숨겨진 단축키는 제공하지 않습니다.

`Update`는 설치 설정을 보존합니다. 전역 CLI 교체를 시작하면 현재 관리 세션이 종료되므로 이후에는 `arc`를 다시 실행합니다. CLI 교체나 harness 갱신이 실패하면 표시된 대상별 결과와 복구 경로를 확인하고 `arc`를 다시 열어 `Update`를 선택합니다. CLI가 실행되지 않으면 `npx --yes @yunhozz/arc@latest`로 화면을 열어 복구합니다. npx의 업데이트는 전역 CLI를 교체하지 않습니다.

`Uninstall`은 선택한 harness와 관리 profile을 제거하며 CLI는 유지합니다. 전역 ARC 지침을 보존할 수 있고 사용자 파일·다른 skill·workflow 기록은 유지합니다. `npm uninstall -g @yunhozz/arc`는 CLI만 제거하며 설치된 harness를 남깁니다.

기존 ARC 관리 shell completion 블록은 harness 설치·업데이트·제거 시 정상 marker가 확인되는 경우에만 정리합니다. 상태 조회는 shell 파일을 바꾸지 않습니다. 사용자가 직접 작성한 shell 설정은 직접 확인해 정리해야 합니다.

## Models and language

The Orchestrator uses the current conversation's model. The five specialist roles use the selected preset from their platform model file: [Codex](codex/skill/models.toml) · [Claude Code](claude/skill/models.toml). The configured language applies across ARC; an explicit user language request takes precedence.

## 📚 Guides

[How the ARC harness operates](docs/harness-operation.md) · [Codex guide](codex/skill/SKILL.md) · [Claude Code guide](claude/skill/SKILL.md)
