# How the ARC harness operates

ARC combines an installation package with instructions for coordinating agents. The normative platform guides are [Codex](../codex/skill/SKILL.md) and [Claude Code](../claude/skill/SKILL.md); their linked references and role profiles define the actual obligations. This document explains those contracts and the current installer implementation. It adds no approval gate.

ARC scheduling and cumulative limits are **prompt-level policy**, not a spawn interceptor or sandbox. Native settings control their own platform sessions. Structural package checks do not prove live agent runtime compliance; configuration writes do not demonstrate native support in the current process. Verify native application in a supported new session.

## What ARC installs

The Node.js CLI validates and installs files. The conversation's Orchestrator then uses those files to route requests, obtain approvals, assign scoped work, and accept evidence. Installation itself does not launch that coordination workflow.

| Component | Codex | Claude Code |
|---|---|---|
| Installation root | `~/.codex`, or `CODEX_HOME` (relative values resolve against the CLI working directory) | Default `~/.claude`; a conflicting `CLAUDE_CONFIG_DIR` is rejected |
| ARC skill | `skills/arc/` | `skills/arc/` |
| Five specialist profiles | `agents/arc-*.toml` | `agents/arc-*.md` |
| Model and limit policy | `skills/arc/models.toml`, `skills/arc/limits.toml` | Same relative paths |
| Managed instruction block | `AGENTS.md` | `CLAUDE.md` |
| Native configuration | `config.toml` | `settings.json` |

The five installed roles are Scouter, Planner, Coder, QA, and Reviewer. The Orchestrator is the current conversation, not a sixth installed profile. Models retain economy, balanced, and smart variants with one selected preset; Codex uses `model_reasoning_effort`, while Claude uses `effort`.

Installation preserves content outside the `arc:begin` / `arc:end` block. Codex wait settings are merged for a supported standalone `[features.multi_agent_v2]` table; unsupported structure produces manual guidance. Native concurrency is written to Codex `[agents].max_concurrent_threads_per_session` as an integer and Claude `settings.json.env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` as a string, preserving unrelated settings.

ARC's local upstream reference tree contains brainstorming, writing-plans, test-driven-development, companion files, license, and provenance. Existing shared/global upstream skills and links remain separate. npm installation places the CLI and bundled files only; it does not acquire references or edit shell configuration. Harness installation adds zsh completion registration to its installation plan unless `--skip-global` is set; completion commands print zsh/bash scripts. See [installation commands](../README.md#-manage-arc), [model settings](../README.md#-models-and-language), and [shell completion](../README.md#-manage-arc).

## Installation and refresh lifecycle

1. The CLI parses target, preset, mode, and positive safe integer limits. Interactive selection fills omitted choices; non-interactive installation requires target, preset, and output language.
2. It verifies the distributed payload, reads target state, resolves preserved/default limits, builds plans including shared zsh completion registration unless `--skip-global` is set, and validates conflicting paths and configuration.
3. `--check` and `--dry-run` validate local included references and plans, then exit without applying installation changes or refreshing upstream. Dry run also prints proposed writes. Neither mode proves upstream freshness.
4. Actual installation acquires a fresh shallow default-branch snapshot from obra/superpowers for each target. Upstream scripts and hooks are not executed during collection. The installer snapshots skill content and validates required files, contained relative links, license, and provenance.
5. It revalidates the target snapshot before and after acquisition, applies the target transaction, disposes acquisition work, and reports per-target status, rollback outcome, and any `Residual path:`. Cleanup errors remain failures even when installation content was applied.

There are two distinct transaction scopes:

| Operation | Publication and recovery boundary |
|---|---|
| Manual package reference refresh: `node scripts/update-superpowers.mjs` | One acquired revision updates **both package reference trees** together. On transaction publication failure, restore the prior trees; cleanup can still report residual work. This maintenance operation does not register shell completion. |
| `arc --target all` | Codex then Claude are **independent target transactions**. A later target failure keeps earlier success; it does not roll back the successful Codex installation. Remaining targets may be not-started. Inspect each target's status and residual paths before resolving the failure. |

`provenance.json` records revision, collection time, file hashes, and relative links. This provenance provides local consistency evidence; it does not authenticate upstream or a malicious local rewrite. Acquisition needs Git and network access. The package has no npm lifecycle scripts. npm installation, including `npm --ignore-scripts`, a ZIP download, and a plain clone do not refresh upstream references; actual harness installation fetches fresh references. Actual installation stages references separately and can use a read-only package. Concurrent package refreshes or installation/removal against the same target are unsupported.

Reinstallation replaces managed ARC files, including edited role profiles and local model edits. It creates no persistent backup. Omitted limits preserve valid existing ARC policy, otherwise use initial defaults (100 total, 5 concurrent). Interactive Enter preserves each target's value; an explicit value applies to every selected target. Malformed policy/configuration stops installation. Existing native concurrency that differs from stored ARC concurrency requires explicit concurrency selection (flag or interactive confirmation) before replacement. `--skip-global` skips instruction/native configuration and shell access for that invocation; it does not undo earlier writes.

## Request routing and role responsibilities

Simple, self-contained questions stay with the Orchestrator. Material research or static repository exploration goes to Scouter. Design, spec, plan, and brainstorming drafts belong to Planner. Implementation, configuration, and test edits belong to Coder, except the narrowly permitted small, low-risk Orchestrator direct path. Mixed implementation and supporting-document work follows implementation ownership. Standalone document writing does not automatically become design/spec/plan work.

| Role | Assigned output returned to Orchestrator |
|---|---|
| Scouter | Source findings, evidence, uncertainty; no edits |
| Planner | Design/spec/plan drafts and acceptance criteria; no implementation edits |
| Coder | Scoped changes, focused check evidence, limitations; no self-acceptance |
| QA | Independent criterion-by-criterion checks and remaining gaps; no edits |
| Reviewer | Independent final source/diff findings for correctness, factual accuracy, and security; no edits |

Every specialist reports directly at depth 2 and cannot delegate. The Orchestrator keeps ownership of coordination, approval, integration, acceptance, and Git mutations. A role's return or completion notification is evidence to assess, not acceptance or permission to release a dependent task. Codex uses `arc_scouter` / `arc_planner` / `arc_coder` / `arc_qa` / `arc_reviewer` native agent types and wait facilities. Claude uses hyphenated profile names and its foreground calls or background completion notifications; these adapters are intentionally distinct.

## Design and preparation

Design depth and verification risk are separate decisions. Unclear risk requires investigation or stronger verification.

| Design path | Documents and approval sequence |
|---|---|
| Spike | Approve the probe question, method/scope, criteria and constraints; distinguish probe-only from a sufficiently specified combined probe and implementation request |
| Bounded | Approve short design; add written spec if required and implementation plan when the scope requires one |
| Architectural | Approve design direction, then written spec, then implementation plan |

Planner authors each applicable document; Orchestrator obtains approval before the next dependent stage. Plan omission requires one local change, no dependent stages, no cross-component shared state, lifecycle, or integration-order concerns, and one focused verification path. It is not a blanket shortcut for small-looking changes.

초기 설계 승인 → 명시적 실행 대상 선택 → 대상 준비·검증 → 필요한 정식 spec 작성·저장·자체 점검·개별 승인 → 필요한 plan 작성·저장·자체 점검·개별 승인 → 전체 필수 문서 집합 완료 → 기존 문서 커밋 검증과 남은 승인 문서의 한 번의 batch commit → 최종 Git 검증 → Coder 인계 순서입니다. 필요한 written spec 승인은 의존 plan 작성보다 먼저입니다. 문서 생략 경로는 해당하지 않는 문서 단계만 생략하고 유효한 문서 부재를 기록합니다. 문서 완성은 staging/commit과 Coder 시작의 조건이며 초기 대상 준비의 조건은 아닙니다. 계획 승인은 실행 대상 선택을 대신하지 않습니다.

**Approved documents → platform preparation → handoff.** 이 도식의 요약은 위 세부 순서를 대체하지 않습니다. Codex는 계약에 따라 현재 checkout, 그 checkout의 새 branch, managed worktree를 선택할 수 있습니다. Claude v1은 현재 checkout만 사용합니다. branch는 같은 파일을 공유하고 managed worktree는 별도 디렉터리이며 repository/common-directory identity, 등록, 원본 보존과 문서 이전 증거를 확인합니다. 관련 없는 staged·unstaged·untracked 변경과 편집 소유권을 보존합니다.

### 승인 재사용과 완료 연속성

충분히 구체적인 실행 요청 자체가 해당 범위의 승인일 수 있습니다. 요청 또는 사용자가 명시적으로 참조한 설명에서 결과·제약·문서 깊이·검증 위험을 확인하고 승인 근거와 기준을 기록합니다. 같은 범위의 재서술·역할 인계·재시작은 추가 승인을 만들지 않습니다. 침묵, 모호한 동의, 다른 작업의 승인, 범위가 불명확한 일괄 개선 요청은 승인 근거가 아닙니다. 필요한 written spec과 plan의 개별 승인은 유지합니다.

probe-only는 승인된 질문에 대한 findings·evidence·limits·remaining uncertainty로 끝납니다. 근거 있는 불가능 판정도 완료일 수 있으며 제품 유지나 후속 구현 권한은 포함하지 않습니다. probe+implementation을 명시적으로 함께 요청하고 전체 범위가 충분히 구체적이며 Bounded 조건을 충족하면 조사는 내부 단계입니다. 조사 보고 자체는 새 승인 경계가 아니므로 승인된 구현까지 계속합니다. 알려지지 않은 구현 전체가 자동 승인되지는 않습니다.

중대한 범위·방법·위험 변경, 미해결 새 결정, 대상 변경, 불명확한 소유권, 예상 밖 상태, 미해결 실패, 필수 입력 부재는 영향을 받는 작업을 보류하는 이유입니다. 기존 범위의 통상 수정과 재검증은 중복 승인을 요구하지 않습니다. 해결 후 영향받은 조건을 재검증합니다. 적용되는 승인·문서 깊이·대상·인계 조건이 충족되면 실행 → 수정 → 재검증 → 위험별 QA/Reviewer → findings 처리 → Orchestrator 수락 → 결과 보고까지 이어갑니다. 역할 완료 알림·조사 결과·명령 성공만으로 남은 승인 작업을 완료 처리하지 않습니다.

The canonical handoff records approved versions, actual absolute path, branch or detached HEAD, HEAD, index/worktree/untracked state, ownership, execution-target choice, document commit evidence, readiness, and checks. The assigned Coder trusts verified preparation facts and reads cited unchanged fields from that record; an inaccessible record or actual conflicting state blocks affected work. See [Codex handoff](../codex/skill/references/handoff.md), [worktree preparation](../codex/skill/references/handoff-worktree.md), and [Claude handoff](../claude/skill/references/handoff.md).

## Scheduling and limits

Before first dispatch, record explicit and implicit dependencies, input/output contracts, resource/file ownership, conflicts, checks/QA path, initial ready batch, and hold reasons. Different filenames alone do not establish independence. A task is ready only with approvals and preparation complete, available inputs/contracts, accepted predecessors with required evidence and verified focused commits or accepted no-change records, nonconflicting ownership, a defined check path, and available policy/runtime capacity.

For A → B → C plus independent D, two available slots allow A and D to start together. B becomes ready after A's required evidence, Orchestrator acceptance, and verified focused commit (or accepted no-change record); D may continue. C waits for B by the same rule. A failure holds B/C; unaffected D may continue. Coder completion alone releases neither B nor C. Reassess on evidence, acceptance, commit verification, completion/slot return, or new conflict. Serialize shared Git mutations and same-file Coder edits.

The ledger covers one ARC coordination session/tree, excludes the Orchestrator, and counts all created descendants including non-ARC/nested instances. Completion frees confirmed active capacity but never refunds cumulative creation. Follow-up on the same instance costs no additional creation; replacement does. Waiting, blocked, or resumable idle instances still consume concurrency until completion/termination is confirmed.

Read and freeze valid installed limits before creation; missing/unreadable/malformed policy blocks creation. Reserve the entire proposed batch before dispatch against both total and concurrent limits and any lower actual runtime capacity. Convert confirmed creations to instance IDs; release reservations only when failure proves no creation occurred. Uncertain creation keeps capacity reserved until reconciled. There are no role-reserved slots. Preserve the ledger on resume/compaction; unknown budget must not reset to zero. Exhaustion holds new creation and reports remaining work; it never waives fresh-role, QA, Reviewer, ownership, or approval obligations.

Independent sessions, accounts, and platforms do not share the ledger. Native Agent Teams/hosted APIs are outside this contract. Consult [Codex limits](../codex/skill/references/limits.md) and [Claude limits](../claude/skill/references/limits.md).

## Verification, acceptance, and commits

| Verification risk | Required path |
|---|---|
| Small, low risk: narrow, understood, readily reversible; focused checks suffice | Coder or approved Orchestrator direct edit, then Orchestrator focused checks |
| Ordinary behavior work | Coder, then fresh QA |
| Significant/high risk: contracts, shared state, lifecycle, security, data loss, public interfaces, costly installation/deployment | Coder and fresh QA, plus independent full-change Reviewer at the applicable final stage |

Each top-level task receives a fresh Coder and, when required, fresh QA. Same-task correction rechecks may reuse QA. Feature/behavior work follows failure-first TDD. A narrowly recorded small, low-risk, plan-skip waiver only skips RED/GREEN and retains focused evidence and appropriate verification. A specifically recorded non-behavior documentation/configuration exception permits approved structural checks; it does not extend to behavior work.

QA reports each criterion's method/scope, run status, evidence, verdict (proven, unmet, unverified), and remaining gaps. Structural checks prove authored package consistency; they do not prove actual agent runtime compliance, actual installation, or visual readability. Source comparison and rendered inspection cover different evidence needs. Orchestrator resolves findings and judges criteria, not just a passing command or Coder report.

**Required checks → Orchestrator acceptance.** For each accepted top-level plan task, create one focused commit promptly without another commit approval, then verify its SHA/content and remaining state. A no-change task gets a record only, never an empty commit. Keep unrelated changes out and do not combine different approved tasks. Resume verifies and reuses valid existing commits rather than duplicating them.

Significant planned work receives one final whole-change review after all task acceptances and required QA/checks. Reviewer is not a prerequisite for every task commit. Significant unplanned work receives independent review before acceptance. Plan-skip paths do not gain a new commit obligation merely from the planned-task rule. Task acceptance/commit is distinct from final plan verification and final acceptance; final findings follow the correction paths below. Push, merge, publication, and deployment require separate authorization. See platform [verification](../codex/skill/references/verification.md) and [commit](../codex/skill/references/commit.md) contracts, with [Claude verification](../claude/skill/references/verification.md) and [commit](../claude/skill/references/commit.md).

최종 전체 plan Reviewer 진입 전 QA의 실행 실패나 미충족 기준은 Coder 수정 → QA 재검증을 거칩니다. 이미 커밋된 plan의 최종 전체 Reviewer findings는 동작 문제를 포함해 Coder → Reviewer 재검토로 반복하며 QA를 재배정하지 않습니다. Orchestrator는 후속 task와 필요한 계획·승인을 정하고, 수정은 재검토 동안 uncommitted로 두며 최신 committed 상태·uncommitted diff·변경 파일 목록을 Reviewer에 제공합니다. 해결 후 수락하고 하나의 focused follow-up commit을 만듭니다. 최종 QA findings는 Coder 수정 → QA 재검증 경로를 유지합니다. 이 예외는 plan의 최종 전체 Reviewer findings에만 적용되며 원래 커밋의 자동 amend/reset이나 중복 커밋을 허용하지 않습니다.

커밋은 Conventional Commits 형식과 적용되는 사용자·저장소 지시를 따릅니다. 이 저장소는 설명을 구체적인 한국어 구절로 작성합니다. upstream의 일반 영문 기본 안내로 사용자 지정 규칙을 덮어쓰지 않습니다.

## Failure, resume, and maintenance

On failure or partial completion, hold affected work and inspect actual path, branch/detached HEAD, HEAD, index, files, and completed steps. Update the canonical record, resolve the observed blocker, and revalidate affected gates before resuming. Do not automatically retry, fall back, repeat completed work, stash/reset/clean, delete locks, change permissions, or bypass the sandbox. Preserve unrelated work and ownership. Reuse a still-valid explicit target choice and verified document/task commits; record only changed preparation facts on restart.

Agent Git recovery governs checkout/index coordination. Installer rollback governs filesystem publication transactions and acquisition cleanup. A reported residual path is evidence requiring inspection; a rollback label is not proof that all cleanup succeeded. Neither mechanism promises a persistent backup. See [Codex recovery](../codex/skill/references/git-recovery.md) and [Claude recovery](../claude/skill/references/git-recovery.md).

Maintenance actions have distinct effects:

- **Model reapplication:** edit installed `models.toml` and run the optional Python apply-models tool to validate/render profiles. This does not refresh ARC or upstream references.
- **Manifest maintenance:** refresh `MANIFEST.sha256` after protected payload changes and check it. Models are intentionally excluded. Dynamic upstream trees carry their own provenance validation.
- **Reinstallation:** refreshes managed ARC and upstream material and replaces local model edits; valid omitted ARC limits are preserved under the rules above.
- **Harness removal:** `arc uninstall` removes the selected ARC skill, five role profiles, and managed instruction block, including edited ARC files. External skills/profiles, Codex wait settings, native concurrency keys, and shared shell completion registration remain. `--skip-global` preserves the instruction block for that invocation. Removal has its own dry run and transaction reporting.
- **CLI package removal:** `npm uninstall -g @yunhozz/arc` removes the CLI package separately; installed harness configuration and shared shell completion remain.

Use the existing [maintenance commands](../README.md#-manage-arc), [model commands](../README.md#-models-and-language), and [removal commands](../README.md#-manage-arc). New installed settings apply to new sessions; running structural checks alone cannot establish runtime support.

## Source map

| Concern | Maintained source |
|---|---|
| Platform rules and native role adapters | [Codex core](../codex/skill/SKILL.md), [Claude core](../claude/skill/SKILL.md) |
| Planning and readiness | [Codex planning](../codex/skill/references/planning.md), [Claude planning](../claude/skill/references/planning.md) |
| Preparation and document commits | [Codex preparation](../codex/skill/references/handoff-prep.md), [Claude preparation](../claude/skill/references/handoff-prep.md) |
| Role-local safeguards | [Codex profiles](../codex/agents), [Claude profiles](../claude/agents) |
| CLI parsing and lifecycle | [Install entrypoint](../lib/cli/index.mjs), [uninstall entrypoint](../lib/cli/uninstall.mjs) |
| Target paths, plans, and native configuration | [Targets](../lib/installer/targets.mjs), [plans](../lib/installer/plan.mjs), [runtime merge](../lib/installer/runtime-config.mjs) |
| Independent target installation and removal | [Install coordinator](../lib/installer/install.mjs), [uninstall coordinator](../lib/installer/uninstall.mjs) |
| Filesystem publication/rollback | [Transactions](../lib/installer/transaction.mjs) |
| Package refresh and collection | [Manual reference updater](../scripts/update-superpowers.mjs), [package references](../lib/installer/package-references.mjs), [acquisition](../lib/installer/acquisition.mjs), [bundle validation](../lib/installer/superpowers.mjs) |
| Completion | [Registration](../lib/installer/shell-completion.mjs), [script generation](../lib/cli/completion.mjs) |
| Structural contracts and regressions | [Harness contracts](../tests/test_harness_contract.py), [Python tests](../tests), [Node tests](../tests/node) |
| Maintenance | [Manifest updater](../scripts/update-manifest.mjs), [reference updater](../scripts/update-superpowers.mjs), [README commands](../README.md#-manage-arc) |

The [flow diagram](images/role-flow.svg) summarizes routing and order. Follow the platform sources for full normative gates and intentional platform differences.

### 파일별 책임 점검 범위

T1은 아래 비-superpowers runtime 지침 파일 29개(공통 core 2, Codex references 9, Claude references 8, 역할 profile 10)를 대조했습니다. 대칭 파일은 같은 책임을 공유하되 플랫폼 adapter 차이는 각 원본이 소유합니다. 정책 의미의 중복은 책임 원본과 링크로 정리하고 역할별 로컬 안전 계약은 유지했습니다.

| 유지·축약·이관·수정 책임 | 점검한 원본 |
|---|---|
| 라우팅·위험·승인 연속성 요약을 유지하고 상세 책임을 references로 연결 | 양 플랫폼 `skill/SKILL.md` |
| 승인·probe·문서 깊이·의존성과 정식 작성 순서 | 양 플랫폼 `skill/references/planning.md` |
| 공통 인계와 준비·문서 커밋 증거 | 양 플랫폼 `skill/references/handoff.md`, `handoff-prep.md` |
| Codex worktree 대상 준비의 고유 계약 유지 | [Codex handoff-worktree](../codex/skill/references/handoff-worktree.md) |
| 누적·동시 한도와 플랫폼 adapter 유지 | 양 플랫폼 `skill/references/limits.md` |
| 위험별 검사·수락·최종 수정 경로와 완료 연속성 | 양 플랫폼 `skill/references/verification.md` |
| task commit·no-change·수정 커밋 책임 | 양 플랫폼 `skill/references/commit.md` |
| 실패·부분 완료의 상태 점검과 재개 | 양 플랫폼 `skill/references/git-recovery.md` |
| 시각 도구의 기존 책임 유지 | 양 플랫폼 `skill/references/visual-companion.md` |
| 각 역할의 범위·보고·위임 금지·검증 책임 유지 | `codex/agents/arc-{scouter,planner,coder,qa,reviewer}.toml`, `claude/agents/arc-{scouter,planner,coder,qa,reviewer}.md` |

T2의 [global configuration](../lib/installer/global-config.mjs)은 bootstrap 역할 라우팅을 책임 원본과 맞췄습니다. [language](../lib/installer/language.mjs), [installation plan](../lib/installer/plan.mjs), [profile rendering](../lib/models/profiles.mjs), [manifest validation](../lib/installer/manifest.mjs), [package metadata](../package.json), [manifest updater](../scripts/update-manifest.mjs)는 기존 인터페이스·언어·marker 밖 bytes·패키지/라이선스 계약의 호환성 점검 대상입니다. 모델 설정·apply-models 스크립트는 기존 책임을 유지하며 [모델 안내](../README.md#-models-and-language)에서 연결합니다. T3는 README·이 운영 설명·문서 계약 검사를 이 책임에 정합화합니다. runtime superpowers bundle은 이번 리팩토링 대상에서 제외됩니다.

이 source map과 구조·package·manifest 검사는 작성된 파일과 패키지의 일관성 증거입니다. 실제 세션에서 승인 연속성을 지켰는지, 설치한 native 설정이 적용됐는지, 시각 결과를 읽을 수 있는지는 별도 관찰 없이는 미검증입니다. 참고 대화의 내용이나 중단 재현도 이 문서의 검증 근거로 단정하지 않습니다.
