<a id="how-the-arc-harness-operates"></a>
# How the ARC harness operates

ARC combines an installation package and agent coordination instructions. Normative sources are [Codex](../codex/skill/SKILL.md), [Claude Code](../claude/skill/SKILL.md), linked references and role profiles. This guide explains contracts/current installer behavior without adding approval gates.

Scheduling/cumulative limits are **prompt-level policy**, not a spawn interceptor/sandbox. Native settings constrain their own sessions. Structural checks prove neither live compliance nor native settings taking effect in the current process. Verify application separately in supported new sessions.

<a id="what-arc-installs"></a>
## What ARC installs

The Node.js CLI validates/installs files. The conversation Orchestrator then routes requests, obtains approvals, assigns scope and accepts evidence. Installation itself starts no coordination workflow.

| Component | Codex | Claude Code |
|---|---|---|
| Root | `~/.codex` or `CODEX_HOME`; relative values resolve from CLI cwd | Default `~/.claude`; conflicting `CLAUDE_CONFIG_DIR` rejected |
| Skill | `skills/arc/` | `skills/arc/` |
| Five profiles | `agents/arc-*.toml` | `agents/arc-*.md` |
| Models/limits | `skills/arc/models.toml`, `skills/arc/limits.toml` | Same relative paths |
| Managed instructions | `AGENTS.md` | `CLAUDE.md` |
| Native configuration | `config.toml` | `settings.json` |

Installed roles are Scouter/Planner/Implementer/QA/Reviewer; Orchestrator is the current conversation, not a sixth profile. Models retain economy/balanced/smart variants and one selected preset. Codex uses `model_reasoning_effort`, Claude `effort`.

`Claude & Codex`는 역할별 플랫폼·모델·effort를 공통 활성 파일 `CODEX_HOME/arc-role-platform-routing.json`에 저장합니다. 각 하네스의 `arc-role-platform-routing.prepared.json`과 별도 `agents/arc-routing-*` 프로필은 같은 리비전의 설치 바이트를 식별합니다. 마커는 CLI 로그인이나 실제 실행 권한·모델·effort를 증명하지 않습니다.

홈 상태의 `Avaliable`, `Not Avaliable`, `Incomplete`, `Unauthorized`는 설치와 로컬 CLI 인증을 구분합니다. `Unauthorized`는 CLI가 명시적으로 미로그인을 반환한 경우입니다. Codex 모델·effort는 계정의 app-server 목록을 확인하고, Claude API 목록은 선택 보조 자료로만 사용합니다. Claude 모델과 effort는 API 키 없이 수동 입력할 수 있습니다.

현재 복합 역할 경로는 CLI와 두 Desktop 로컬 환경 모두에서 `held / unverified`입니다. 구성 게시가 역할 실행을 시작하거나 지원을 입증하지 않습니다. 로컬 CLI 검색 경로와 인증 홈, 같은 작업 트리, 새 세션의 프로필 재로드 및 실행 근거는 별도로 확인해야 합니다. 기존 Desktop 세션 연결은 가정하지 않습니다.

Installation preserves bytes outside `arc:begin` / `arc:end`. Codex wait settings merge into supported standalone `[features.multi_agent_v2]`; unsupported structure receives manual guidance. Native concurrency writes integer `[agents].max_concurrent_threads_per_session` for Codex and string `settings.json.env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` for Claude, preserving unrelated settings.

Static references include brainstorming/writing-plans/test-driven-development, related Markdown/mockups/license/provenance. Markdown lives in platform `skill/references/`, scripts/HTML in `references/scripts/`. Existing shared/global skills/links are separately preserved. Source packages have no npm install hook. Published artifacts have informational postinstall only. npm installation neither downloads/installs the harness nor connects TTY/changes shell. It prints `Run arc to install or manage the ARC harness.`

<a id="installation-and-refresh-lifecycle"></a>
## Installation and refresh lifecycle

1. `arc` opens the English TUI when both streams are TTYs. Public syntax: `arc`, `arc --help`, `arc --version`. No-argument non-TTY and other commands/options exit 2 without controlling-terminal reconnection. Help/version require no native installer.
2. Home actions: `Install / Update`, `Change Preset`, `Check Version`, `Uninstall`, `Exit`. Installation selects targets/preset/limits/language/global settings. A nonselectable blank line precedes `Execute`; Enter validates/executes once without review. `Change Preset` changes drafts until Enter on `Apply`, separated likewise. Preserve other settings; differing targets require explicit common values.
3. Preparation validates payload/settings/paths and snapshots them. Execution revalidates and stops on drift. Selected package determines reference revision.
4. Install verified platform-local bytes. Install/reinstall/upgrade never collects Superpowers, queries its latest revision or runs updater. Imported Markdown/mockups stay unchanged.
5. Report target transaction/rollback/residual recovery paths. Later target failure preserves earlier success. Settings apply in new agent sessions.

TUI stays English regardless of harness language. `Workflow`/automatic platform integration share the internal runtime endpoint. TUI inspection proves no workflow approval. `Check Version` displays `Current version`/`Latest version`. Only numerically newer versions offer `Version Upgrade`. Enter revalidates package identity/npm context/installed state then applies the exact displayed version without requerying latest. Equal/older/unavailable versions offer no upgrade. Escape returns home. Global replacement ends the session; npx runs pinned payload without replacing global CLI. Same-version refresh uses `Install / Update`. If CLI cannot start, run `npx --yes @yunhozz/arc@latest`.

Install/update/uninstall remove valid old ARC management completion blocks and add no registrations. Status never edits shell files. Preserve user settings and block-external content.

| Operation | Publication/recovery boundary |
|---|---|
| `bash scripts/update-superpowers-local.sh` | Ignored wrapper calls tracked `node scripts/update-superpowers.mjs`. One acquired revision updates both mapped platforms/static manifest together. Failure restores previous files/manifest; cleanup may report residuals. No completion registration |
| Both TUI targets | 설치는 Codex 다음 Claude, 제거는 Claude 다음 Codex 순서의 독립 트랜잭션입니다. 뒤 대상의 실패는 앞 대상의 성공을 유지합니다. 대상별 상태와 잔여 경로를 확인합니다 |
| `Claude & Codex` configuration | 두 설치 결과와 인증·카탈로그를 재확인한 뒤 공유 잠금 아래 프로필과 준비 마커를 게시하고 활성 파일을 마지막으로 교체합니다. 게시 전 실패는 새 활성 리비전을 게시하지 않으며 복구 상태가 불명확하면 경로를 보고합니다. 이전 활성 파일이 남아도 실제 파일과 맞지 않으면 역할 실행은 보류됩니다 |

`superpowers-provenance.json` records revision/time/original-path hashes/relative links. It proves local consistency, not upstream authenticity or protection from malicious local rewriting. Git/network are needed only for explicit maintainer updater use. npm/`npm --ignore-scripts`/ZIP/plain clones/harness install-upgrade use packaged static references. Read-only packages are supported.

`scripts/update-superpowers-local.sh` is current-worktree-only, ignored by exact `/scripts/update-superpowers-local.sh`, absent from Git/npm/releases and not created in other clones/worktrees. Tracked updater owns acquisition/validation/flat mapping/publication/manifest/recovery. Verified source checkouts may retain this exact local regular file outside protected/installed payload; packaged artifacts reject it. Concurrent refresh/install/remove against one target is unsupported.

Use executable `./scripts/update-superpowers-local.sh` to refresh both vendored platforms/manifest. It calls the adjacent tracked updater, also works by absolute path elsewhere and forwards arguments/stdout/stderr/status unchanged. Prepare the wrapper separately per clone/worktree.

Reinstallation replaces managed profiles/local model edits without persistent backup. Omitted limits preserve valid policy or use 100 total/5 concurrent. TUI preserves each target by default; explicit values apply to all selected targets. Malformed policy/config stops installation. Native/stored concurrency mismatch needs explicit TUI selection before replacement. Skipping global settings omits instructions/native settings/shell access for that operation, not earlier changes.

<a id="request-routing-and-role-responsibilities"></a>
## Request routing and role responsibilities

Simple questions stay with Orchestrator; material/static research goes to Scouter; design/spec/plan/brainstorming drafts to Planner; implementation/configuration/tests to Implementer except approved low-risk direct edits. Mixed dependent documentation follows implementation ownership. Standalone writing is not automatically design/spec/plan.

| Role | Return to Orchestrator |
|---|---|
| Scouter | Sources/facts/evidence/uncertainty, no edits |
| Planner | Complete drafts/criteria, no implementation |
| Implementer | Scoped changes/checks/limits, no self-acceptance |
| QA | Independent criterion evidence/gaps, no edits |
| Reviewer | Final source/diff correctness/facts/security findings, no edits |

Specialists report at depth 2 without delegation. Orchestrator owns coordination/approval/integration/acceptance/Git. Returns/notifications are evidence, not acceptance/dependency release. Codex uses `arc_scouter` / `arc_planner` / `arc_implementer` / `arc_qa` / `arc_reviewer` and native waits. Claude uses hyphenated names and foreground/background completion. These differences are intentional.

<a id="design-and-preparation"></a>
## Design and preparation

Depth and verification risk are separate. Unclear risk needs investigation/stronger checks.

| Path | Approval |
|---|---|
| Spike | Question/method/scope/criteria/constraints; separate probe-only from specified combined implementation |
| Bounded | Short design, required spec by judgment, plan when scope needs it |
| Architectural | Design → written spec → implementation plan |

Planner drafts, Orchestrator obtains approval before dependencies. Plan omission requires one local change, no dependent stages/cross-component shared state/lifecycle/integration-order concerns and one focused path, not apparent smallness.

Order: initial design approval → explicit target → preparation/verification → required spec draft/save/self-review/individual approval → required plan draft/save/review/individual approval → full set → verify existing commits/batch remaining approvals → final Git → Implementer. Required specs precede dependent plans. Omissions skip inapplicable document stages only with reasons. Complete docs precede staging/commit/handoff, not initial preparation. Plan approval selects no target.

Approved-documents/preparation/handoff summaries never replace this order. Codex supports current checkout/new branch/managed worktree; Claude v1 current checkout only. Branches share files, worktrees separate directories. Verify repository/common directory/registration/source preservation/transfer evidence. Preserve unrelated changes/ownership.

<a id="instruction-provenance-and-visual-evidence"></a>
### Instruction provenance and visual evidence

Briefs separate user/discovered/installed/input sources, applicability/version-approval/access. Applicable user instructions remain valid without root AGENTS.md. Missing required material/conflicts hold dependencies.

Visual work gives Implementer/fresh QA exact approved source/version/approval/access, IDs/properties/method and actual output identity/revision/basis. Self-report never replaces comparison. Supported criteria are `pass`, visible differences `mismatch`, missing access/linkage `unverified`. Record historical differences/linkage separately without current-branch UI inference. Return unapproved interpretations/substitutions.

Approved TUI mockups/attachments in reliability review compare past examples only. ARC-mark differences and linkage limits are separate, neither UI-change authority. Static instruction parity is not execution. Synthetic `Claude.app` prompt observation is not `Claude Code CLI` verification. Unavailable tools/unobserved behavior stay unverified.

<a id="approval-reuse-and-completion-continuity"></a>
### Approval reuse and completion continuity

Specific requests may approve their scope. Confirm outcome/constraints/depth/risk from requests/explicitly referenced explanations; record basis/criteria. Restating/handoff/restart needs no duplicate. Silence/ambiguity/other-task/broad vague improvements are insufficient. Required spec/plan approvals remain separate.

Probe-only ends with evidence/limits/uncertainty, including supported infeasibility, never product retention/implementation authority. Explicit specified Bounded probe+implementation uses internal investigation without new report-time approval; continue already approved work. Unknown implementation is not automatic authorization.

Material scope/method/risk changes/new decisions/target/ownership/state/failure/missing inputs hold affected work. Routine corrections need no duplicate approval. Revalidate then continue execution→correction→checks→risk-scaled QA/Reviewer→disposition→acceptance→report. Notifications/findings/passing commands alone never complete remaining scope.

Canonical records include versions/path/branch-dettached HEAD/HEAD/index/worktree/untracked/ownership/choice/document commits/readiness/checks. Implementer trusts verified facts and reads `unchanged`; inaccessible records/actual conflicts block. Follow [Codex handoff](../codex/skill/references/handoff.md), [worktree](../codex/skill/references/handoff-worktree.md), [Claude handoff](../claude/skill/references/handoff.md). Reuse valid approvals/targets and record omissions. Material changes wait for revised approval.

<a id="scheduling-and-limits"></a>
## Scheduling and limits

Before dispatch record explicit/implicit dependencies, inputs/outputs/contracts/resources/files/conflicts/checks/ready batches/holds. File names prove no independence. Ready needs full approvals/preparation/inputs/contracts, predecessor evidence/acceptance/verified commit or no-change, ownership/check paths and policy/runtime capacity.

For A→B→C plus D/two slots, start A/D. A evidence/acceptance/commit may release B while D runs; similarly C. A failure holds B/C, not D. Reports alone release nothing. Reassess evidence/acceptance/commit/slot/conflicts immediately. Serialize shared Git and same-file edits.

Ledger excludes Orchestrator but counts every nested/non-ARC descendant. Completion frees active, never cumulative budget. Same-instance follow-up adds none; replacement does. Waiting/blocked/resumable idle consume concurrency until completion/termination.

Read/freeze valid installed limits; missing/unreadable/malformed blocks creation. Reserve whole batches under cumulative/concurrent/lower actual limits. Convert successes to IDs; release only proved no-creation failures, holding uncertainty until reconciled. No role reserves. Preserve across resume/compaction; unknown is not zero. Exhaustion holds creation/reports work, never waives role freshness/QA/Reviewer/ownership/approval. Sessions/accounts/platforms share no ledger; Teams/hosted APIs are outside. Follow [Codex](../codex/skill/references/limits.md)/[Claude](../claude/skill/references/limits.md).

<a id="verification-acceptance-and-commits"></a>
## Verification, acceptance and commits

| Risk | Flow |
|---|---|
| Narrow/understood/reversible/focused-verifiable | Implementer or approved direct edit → focused checks |
| Ordinary behavior | Implementer → fresh QA |
| Significant contracts/state/lifecycle/security/loss/interfaces/costly deployment | Implementer/fresh QA and independent final whole-change Reviewer at applicable time |

Each task gets fresh Implementer/required QA; same-task QA corrections may reuse. Behavior uses failure-first TDD. Recorded low-risk plan-skip waiver skips RED-GREEN only. Non-behavior exceptions permit named structural checks only.

QA reports every criterion's method/scope/run/evidence/verdict/gaps. Structure cannot prove compliance/installation/readability; source/render evidence differs. Orchestrator judges criteria/findings, not passes/self-report alone.

After required checks/acceptance promptly commit one task without separate approval, verifying SHA/content/state. No-change records no empty commit. Exclude unrelated work and never combine approved tasks. Resume verifies/reuses commits.

Significant plans receive one final Reviewer after task acceptance/QA, never each commit. No-plan review precedes acceptance. Omission gains no automatic commits. Task/final acceptance differ. Push/merge/publish/deploy need separate approval. Follow [Codex verification](../codex/skill/references/verification.md)/[commit](../codex/skill/references/commit.md) and [Claude verification](../claude/skill/references/verification.md)/[commit](../claude/skill/references/commit.md).

During approved execution, Orchestrator MUST amend the original planning-document commit for mechanical spec/plan progress and approved contract updates at a safe boundary; never create a separate docs/fixup commit. Preserve actual approval chronology, recoverable old/new contents, hashes, versions and SHA mappings. Rewrite only unpublished, unshared local linear history with no merges and clear ownership; unknown safety or replay conflicts stop the rewrite. This exception does not authorize amending implementation commits or general history rewriting.

Complete required QA and QA failure rechecks before the initial final overall Reviewer review. Once that review begins on plan work, every Reviewer finding, including behavior, repeats Implementer→Reviewer without QA reassignment until resolved. Define follow-up/approvals, keep fixes uncommitted and supply current committed state/diff/files, then accept/commit one focused follow-up. Separate QA findings remain Implementer→QA.

Conventional Commits follow user/repository instructions. This repository requires concise, specific Korean descriptions; upstream English defaults do not override user instructions.

<a id="failure-resume-and-maintenance"></a>
## Failure, resume and maintenance

Failures/partial completion hold affected work while inspecting path/branch-dettached HEAD/HEAD/index/files/completed steps. Update record, resolve/revalidate then resume. No automatic retries/fallback/repeats/stash/reset/clean/lock deletion/permission changes/sandbox bypass. Preserve unrelated work; reuse valid choices/commits and record changed preparation only.

Optional failed reads permit only brief-preauthorized side-effect-free alternatives with exact locator/material/version/purpose/authority/equivalent evidence. Same-version read methods are an example. Return missing inputs/mismatches/partial changes/unknown/unauthorized-ambiguous-failed alternatives immediately. No guessed paths/chained alternatives/mutation retries/environment changes.

After first-failure/alternative/evidence/limits reporting:

1. Record exact failed check, baseline/current revision, results/evidence/state.
2. Classify baseline/current impact/dependencies.
3. Hold affected/dependent or impact-unknown work only.
4. Orchestrator validates authority/target/inputs/ownership/gates and releases approved independent work without unrelated delays.
5. Keep acceptance held for required unresolved checks.

Roles never self-authorize release or hide failures/change criteria/waive checks. Resume preserves approvals/completed work/failure/resolution/valid-invalid evidence/holds/next goal. Restart adds no authority.

Agent Git recovery coordinates checkout/index; installer rollback handles publication/acquisition cleanup. Residual paths need inspection; rollback labels prove no cleanup. Neither guarantees persistent backup. Follow [Codex](../codex/skill/references/git-recovery.md)/[Claude](../claude/skill/references/git-recovery.md).

| Maintenance | Effect |
|---|---|
| Models | Edit installed `models.toml`, optional Python apply-models validation/render; no ARC/upstream refresh |
| Manifest | Update/check `MANIFEST.sha256` after protected changes; models excluded, dynamic upstream has provenance |
| Reinstall | Packaged static managed files replace local model edits; upstream needs explicit updater, valid omitted limits preserved |
| Harness removal | Below |
| CLI only | `npm uninstall -g @yunhozz/arc` leaves harness settings |

`Uninstall` removes selected skill/five profiles/managed blocks, including edited ARC files. Preserve other skills/profiles, Codex wait/native concurrency/workflow records. Global instructions can be retained and removal reviewed. Clean valid completion blocks. Only all-success harness removal permits npm removal of verified global `@yunhozz/arc`, including npx runs. Harness failure/cleanup/interruption skips CLI removal; identity/context failure blocks harness changes. Report separately; CLI failure preserves harness success. Once CLI removal begins, success/failure/interruption ends session. Preserve unselected harnesses/user files/other packages/shared npx cache.

복합 프로필과 준비 마커는 활성 구성 및 마커의 경로·해시가 일치할 때 선택한 하네스 범위에서 제거합니다. 소유 관계가 불명확한 파일은 보존하고 잔여 경로로 표시합니다. 한쪽을 제거하면 나머지 복합 구성도 준비 일치가 확인되지 않아 실행이 보류됩니다.

Use [maintenance](../README.md#manage-arc)/[models](../README.md#models-and-language)/[removal](../README.md#manage-arc). New settings need new sessions; structure alone proves no support.

<a id="source-map"></a>
## Source map

| Concern | Source |
|---|---|
| Platform contracts | [Codex](../codex/skill/SKILL.md), [Claude](../claude/skill/SKILL.md) |
| Planning/readiness | [Codex](../codex/skill/references/planning.md), [Claude](../claude/skill/references/planning.md) |
| Preparation/docs commits | [Codex](../codex/skill/references/handoff-prep.md), [Claude](../claude/skill/references/handoff-prep.md) |
| Profiles | [Codex](../codex/agents), [Claude](../claude/agents) |
| CLI/lifecycle | [Root](../lib/cli/root.mjs), [TUI](../lib/tui/app.mjs), [management](../lib/management/operations.mjs) |
| Paths/plans/settings | [Targets](../lib/installer/targets.mjs), [plans](../lib/installer/plan.mjs), [merge](../lib/installer/runtime-config.mjs) |
| Install/remove | [Install](../lib/installer/install.mjs), [uninstall](../lib/installer/uninstall.mjs) |
| Publication/rollback | [Transactions](../lib/installer/transaction.mjs) |
| Refresh | [Updater](../scripts/update-superpowers.mjs), [references](../lib/installer/package-references.mjs), [acquisition](../lib/installer/acquisition.mjs), [validation](../lib/installer/superpowers.mjs) |
| Completion | [Cleanup](../lib/installer/shell-completion.mjs) |
| Structural regressions | [Harness](../tests/test_harness_contract.py), [Python](../tests), [Node](../tests/node) |
| Maintenance | [Manifest](../scripts/update-manifest.mjs), [updater](../scripts/update-superpowers.mjs), [commands](../README.md#manage-arc) |

The [flow diagram](images/role-flow.svg) summarizes routing/order; normative sources retain full gates/platform differences.

<a id="file-by-file-scope-of-responsibility-review"></a>
### File-by-file responsibility review

Earlier T1 compared 29 non-Superpowers runtime guides (2 core, 9 Codex references, 8 Claude references, 10 profiles). Paired sources shared responsibilities while retaining adapter differences. Consolidation used sources/links without removing local safeguards.

| Responsibility | Reviewed source |
|---|---|
| Routing/risk/continuity/detail links | Both `skill/SKILL.md` |
| Approvals/probes/depth/dependencies/order | Both `skill/references/planning.md` |
| Handoff/preparation/commit evidence | Both `handoff.md`, `handoff-prep.md` |
| Codex worktree preparation | [handoff-worktree](../codex/skill/references/handoff-worktree.md) |
| Limits/adapters | Both `limits.md` |
| Risk/acceptance/final corrections/continuity | Both `verification.md` |
| Task/no-change/correction commits | Both `commit.md` |
| Failure/partial-state recovery | Both `git-recovery.md` |
| Visual tools | Both `arc-visual-companion.md`; imported `references/visual-companion.md` |
| Scope/reporting/no-delegation/check duties | `codex/agents/arc-{scouter,planner,implementer,qa,reviewer}.toml`, `claude/agents/arc-{scouter,planner,implementer,qa,reviewer}.md` |

Earlier T2 aligned [bootstrap routing](../lib/installer/global-config.mjs). [Language](../lib/installer/language.mjs), [plans](../lib/installer/plan.mjs), [profiles](../lib/models/profiles.mjs), [manifest validation](../lib/installer/manifest.mjs), [metadata](../package.json), [manifest updater](../scripts/update-manifest.mjs) were checked for interface/language/marker-external/package-license compatibility. Models/apply-models retained responsibilities linked in [model guidance](../README.md#models-and-language). T3 aligned README/operations/document contracts. Runtime Superpowers remained excluded.

Source maps and structural/package/manifest checks establish authored/package consistency only. Actual approval continuity/native application/visual readability need direct observation. Reference conversations or interrupted-run reproduction alone do not prove these claims.


## Fast Path and task evidence

Select the existing small direct path only when all F1–F8 in the platform handoff's `Orchestrator direct path for small tasks` are proven. Initial judgment reads the direct path, planning authorization and depth, and verification risk sections, plus the TDD section when applicable. All subsequent action gates remain in force. Reuse instruction reading only after verifying the actual source-set and hashes and the same conversation context; place the task envelope in the existing handoff or inline scope record. Approved HEAD or expected dirty changes alone do not invalidate target choice: separately refresh current state and affected evidence. Missing, conflicting, inaccessible or ambiguous evidence requires full evaluation and the existing hold procedure.
