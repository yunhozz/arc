# 🤖 ARC (Agent Role Coordination)

ARC coordinates research, design, implementation, and verification in Codex and Claude Code.
The Orchestrator assigns work and accepts results.

![Task flow diagram](docs/images/role-flow.svg)

## 🚀 Install and manage ARC

Start interactive installation without a global CLI:

```sh
npx --yes @yunhozz/arc
```

Choose target → preset → total limit → concurrent limit → output language with Up/Down and Enter.
For non-interactive installation, supply target, preset, and language:

```sh
npx --yes @yunhozz/arc --target codex --preset balanced --language ko
```

The same package can manage an existing installation:

```sh
npx --yes @yunhozz/arc preset smart --target codex
npx --yes @yunhozz/arc uninstall --target codex
```

These npx commands do not install a global `arc` executable. To install the CLI globally:

```sh
npm i -g @yunhozz/arc
arc
arc preset smart --target codex
arc uninstall --target codex
```

The npm command installs the CLI only. Run bare `arc` to install the harness and register zsh
completion. For the current shell, run `eval "$(arc completion zsh)"`; for bash, use
`eval "$(arc completion bash)"`.

Bare `arc` starts installation; the `install` subcommand has been removed. A repository checkout
also supports `./install.command` with the same installation options.

### 🧰 Requirements and options

| Requirement | Supported |
|---|---|
| Runtime | Node.js 22+ with npm (`npx`), Git, network access |
| macOS | 13+, arm64/x64 |
| Linux | glibc 2.28+, arm64/x64 |
| Unsupported | Windows, musl Linux |

Bundled native files handle installation; Python, a compiler, and `node-gyp` are unnecessary.

| Installation option | Purpose |
|---|---|
| `--target <claude\|codex\|all>` | Installation target; interactive default: Claude |
| `--preset <economy\|balanced\|smart>` | Role model preset; interactive default: Balanced |
| `--language <en\|ko>` | English or 한국어; the final question |
| `--max-total-subagents <count>` | Created subagents per session/tree; initial default: 100 |
| `--max-concurrent-subagents <count>` | Simultaneous subagents; initial default: 5 |
| `--check` | Validate payload and paths without writing |
| `--dry-run` | Preview writes without applying them |
| `--skip-global` | Skip global instructions, native configuration, and `.zshrc` access |
| `--help`, `--version` | Show usage or version without loading native files |

Check and dry-run validate included references locally, without network access or upstream freshness checks.
For example:

```sh
npx --yes @yunhozz/arc --target all --preset smart --language en --check
./install.command --target claude --preset economy --language ko --dry-run
```

### 🌐 Output language

Each target stores `en` or `ko` in `skills/arc/settings.toml`. The language applies to the Orchestrator
and all five roles, including progress, reports, and planning documents. An explicit user language request
overrides this default; the input language alone does not change it. Code, commands, paths, identifiers,
literals, quotations, and actual tool output retain their original form. Open a new session to load changed policies.

For `all`, one selection applies to both targets. A common existing language is preselected; otherwise English
is selected. `--skip-global` omits the global instruction block while retaining skill and role language policies.

### 📁 Installed files and refreshes

| Target | Location and managed files |
|---|---|
| Codex | `~/.codex` (or `CODEX_HOME`): `skills/`, `agents/`, `AGENTS.md`, `config.toml` |
| Claude Code | `~/.claude`: `skills/`, `agents/`, `CLAUDE.md`, `settings.json` |

The installer preserves content outside the managed `arc:begin`/`arc:end` instruction block.
For Codex, it sets `min_wait_timeout_ms = 120000` and `default_wait_timeout_ms = 300000` when
`[features.multi_agent_v2]` is a standalone table; otherwise it prints manual guidance.
Claude requires the default `~/.claude` configuration directory.

Every harness installation fetches fresh references per target from the
[obra/superpowers](https://github.com/obra/superpowers) default branch and publishes full
`brainstorming`, `writing-plans`, and `test-driven-development` trees under
`skills/arc/references/superpowers/`. Roles read this local Markdown and its companion files.
Existing global/shared copies and links remain untouched.

Git and network access are required for harness installation; collection never executes upstream
scripts or hooks. npm installation has no lifecycle hooks and does not fetch references or edit shell
configuration. Harness installation stages references without rewriting package files, so read-only
packages work. Collection or publication failure fails the target installation.

Bundled references retain their
[MIT license](https://github.com/obra/superpowers/blob/main/LICENSE), including Jesse Vincent's notice.
`provenance.json` records revision, timestamp, hashes, and relative links for local consistency checks;
it does not authenticate upstream or a malicious local rewrite.

Reinstallation replaces managed ARC files and local model edits, preserves ARC limits, and creates no
persistent backup. All selected target paths are checked before writing. Harness targets then install
independently in Codex → Claude order: a later failure retains earlier success. Inspect per-target status
and any `Residual path:` before recovery or retrying only the failed target. Concurrent installation,
preset changes, or removal against the same target are unsupported.

## ⚙️ Models and presets

The Orchestrator uses the current conversation's model. Other roles use `models.toml`:
[Codex](codex/skill/models.toml) · [Claude Code](claude/skill/models.toml).

Both schemas use `version = 1`, a root `preset`, and `roles.<role>.economy`, `.balanced`, and `.smart` variants.
Codex entries use `model` and `model_reasoning_effort`; Claude entries use `model` and `effort`.
Installation keeps all three variants and validates inactive ones too. Legacy schemas require migration
to the linked schema or reinstallation.

Switch presets without reinstalling or downloading references:

```sh
arc preset smart --target codex
arc preset balanced --target all --check
arc preset economy --target claude --dry-run
```

Use the npx form above if the CLI is not globally installed. In a terminal, omitted preset and target
are selected with arrow keys; non-interactive runs require both. Switching preserves custom model variants,
profile instructions, language, limits, and global settings. It also reapplies model fields that have drifted.
All targets are checked first, then each updates atomically in Codex → Claude order. A later failure keeps
earlier success; failed target writes are rolled back and any remaining recovery paths are reported.
Open a new session to load changed profiles.

After editing an installed model file, apply its active preset with `arc preset`, or use the optional
Python 3.11+ tool:

```sh
python3 ~/.claude/skills/arc/scripts/apply-models.py
python3 ~/.codex/skills/arc/scripts/apply-models.py
```

## 👥 Subagent limits

TTY installation prompts for omitted limits. Enter keeps each target's current value (or the initial defaults:
100 total and 5 concurrent); a typed value applies to all selected targets. Non-interactive installation
preserves omitted values.

The ARC policy counts every created agent in one session/tree, including completed agents. Reuse does not count;
fresh replacements do. This is prompt-level policy, not a hard runtime limit, and actual platform capacity may be
lower. New settings apply to new sessions. See the operating guides for platform-specific configuration details.

## 👥 Roles and workflow

Read [How the ARC harness operates](docs/harness-operation.md) for responsibilities, approval and preparation,
dependency scheduling, verification, commits, refresh boundaries, and recovery.

ARC scales the workflow to each task's depth and risk:

| Task depth and difficulty | Workflow |
|---|---|
| Simple, low risk: narrow scope and clear checks | When eligible, the Orchestrator handles the change directly and runs focused checks; otherwise, a Coder makes the change and the Orchestrator verifies it. |
| Ordinary implementation or behavior change | Approve any required design or plan documents, then assign a fresh Coder followed by fresh QA. The Orchestrator reviews the evidence and accepts the result. |
| Complex or significant risk: shared contracts, state or lifecycle; security; data loss; public interfaces; costly installation or deployment | Approve required documents and preparation. For planned work, each task follows Coder → fresh QA → acceptance and commit, followed by an independent Reviewer on the full change. For unplanned work, use Coder → fresh QA → Reviewer → acceptance. |

Design depth (Spike, Bounded, Architectural) determines which design documents are needed; task risk determines
verification strength. Ready independent tasks may run in parallel within policy and runtime capacity. Coder
completion alone does not release dependents. Codex supports managed worktrees; Claude v1 uses the current checkout.

승인된 범위의 실행 요청은 같은 범위의 인계·재시작에도 유효합니다. Spike가 조사만 요청된 경우에는
질문에 대한 증거·한계·불확실성을 보고하면 완료됩니다. 조사와 구현을 함께 요청했고 전체 범위가 충분히
구체적인 경우에는 조사 결과 이후에도 승인된 구현, 필요한 검증, 수락, 결과 보고까지 진행합니다.
중대한 범위·방법·위험 변경이나 새로운 결정이 생기면 영향을 받는 작업을 보류합니다.

Bounded의 spec/plan 생략은 검증 위험이나 완료 책임을 줄이지 않습니다. 단일 로컬 변경, 의존 단계와
공유 상태·수명주기·통합 순서 문제가 없음, 하나의 집중 검증 경로라는 plan 생략 조건을 기록합니다.
필요한 문서·대상 준비·인계 조건을 충족한 뒤에는 승인된 남은 작업을 사용자에게 다시 제안만 하고 멈추지 않습니다.
자세한 승인·완료 계약과 플랫폼별 책임 위치는 운영 문서에서 확인할 수 있습니다.

## 📚 Operating guides

| Environment | Guide | References |
|---|---|---|
| Codex | [Operating guide](codex/skill/SKILL.md) | [Planning](codex/skill/references/planning.md) · [Handoff](codex/skill/references/handoff.md) · [Verification](codex/skill/references/verification.md) |
| Claude Code | [Operating guide](claude/skill/SKILL.md) | [Planning](claude/skill/references/planning.md) · [Handoff](claude/skill/references/handoff.md) · [Verification](claude/skill/references/verification.md) |

## 🗑️ Remove ARC

```sh
arc uninstall --target codex
arc uninstall --target all --dry-run
arc uninstall --target claude --skip-global
```

Use the npx form above without a global CLI. A terminal prompts for an omitted target;
non-interactive removal requires `--target`. Removal deletes the selected ARC skill (including language
and limit settings), five role profiles, and managed instruction block, including edited ARC files.
It preserves external skills, other profiles, Codex wait settings, native concurrency keys, and shared
shell completion registration. No persistent backup is created.

Remove the global CLI separately:

```sh
npm uninstall -g @yunhozz/arc
```

npm package removal leaves the installed harness configuration and shared completion block in place.
`uninstall` remains available to remove that deployed configuration.


## 역할 정책과 권한 경계

ARC는 Orchestrator, Scouter, Planner, Coder, QA, Reviewer의 여섯 역할군을 정의합니다.
배포되는 전문 에이전트 프로필은 기존 다섯 개이며, Orchestrator는 최상위 세션 역할입니다.
`lib/policy/role-policy.json`이 공통 정책 원천입니다. `npm run update:role-policy`로 양 플랫폼의
관리 영역을 생성하고 `npm run check:role-policy`로 오래된 산출물을 확인합니다. 관리 영역 밖의
절차와 모델 설정은 보존하며, 모델 렌더러는 모델 관련 필드만 변경합니다.

전문 역할은 정상 작업과 복구 중에도 stage, commit, push, merge, rebase, reset, branch 생성·전환,
worktree 생성·제거를 실행할 수 없습니다. Orchestrator의 위임도 이 권한을 확대하지 않습니다.
Scouter는 정적 조사, Planner는 응답으로 초안 반환, Coder는 배정 파일 구현과 집중 검사,
QA는 승인된 검사와 제한된 임시 산출물, Reviewer는 독립적인 정적 검토를 담당합니다.
Orchestrator가 검사 증거와 기준을 확인해 수락하고 작업별 집중 커밋을 생성합니다.
push·merge·deploy·publish·외부 메시지는 해당 행위·범위·대상에 대한 명시적인 사용자 권한이 필요합니다.

유의미하거나 위험도가 높은 작업에 계획이 없으면 Coder → QA → 최종 전체 Reviewer → Orchestrator 수락을
따릅니다. 계획이 있으면 각 작업을 Coder → 필요한 fresh QA → Orchestrator 수락·커밋으로 진행하고,
모든 작업과 필요한 QA가 끝난 뒤 Reviewer가 최종 전체 변경을 한 번 검토합니다. Reviewer는 매 커밋의
필수 게이트가 아닙니다. 최종 계획 Reviewer 발견 사항은 Coder → Reviewer로 재검토합니다.

Codex의 역할 제한은 prompt 수준 계약이며 완전한 sandbox가 아닙니다. 역할별 Git hook이나 일반적인
custom-agent 도구 allowlist를 제공한다고 가정하지 않습니다. shell 축소 후 정적 읽기 유지가 검증되지
않았으므로 기존 shell 기능을 보존합니다. Claude는 기존 역할별 tools allowlist를 유지하며,
이 공통 정책 생성 단계만으로 Claude Git hook 보호가 설치됐다고 간주하지 않습니다.
설치·업데이트된 프로필은 새 에이전트를 시작할 때 적용됩니다. 이미 실행 중인 에이전트가 정책을
자동으로 다시 읽거나 강제 적용받는다고 보장하지 않습니다. native 플랫폼에서의 실제 준수 여부는
생성 일관성·프로필 파싱 같은 구조 검사와 구분해야 합니다.
