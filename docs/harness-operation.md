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

ARC's local upstream reference tree contains brainstorming, writing-plans, test-driven-development, companion files, license, and provenance. Existing shared/global upstream skills and links remain separate. Shell completion is shared CLI support: npm postinstall attempts zsh registration on supported configurations, and completion commands print zsh/bash scripts. Registration is best-effort. See [installation commands](../README.md#-install), [model settings](../README.md#-model-settings), and [shell completion](../README.md#-shell-completion).

## Installation and refresh lifecycle

1. The CLI parses target, preset, mode, and positive safe integer limits. Interactive selection fills omitted choices; non-interactive installation requires target and preset.
2. It verifies the distributed payload, reads target state, resolves preserved/default limits, builds plans, and validates conflicting paths and configuration.
3. `--check` and `--dry-run` validate local included references and plans, then exit without applying installation changes or refreshing upstream. Dry run also prints proposed writes. Neither mode proves upstream freshness.
4. Actual installation acquires a fresh shallow default-branch snapshot from obra/superpowers for each target. Upstream scripts and hooks are not executed during collection. The installer snapshots skill content and validates required files, contained relative links, license, and provenance.
5. It revalidates the target snapshot before and after acquisition, applies the target transaction, disposes acquisition work, and reports per-target status, rollback outcome, and any `Residual path:`. Cleanup errors remain failures even when installation content was applied.

There are two distinct transaction scopes:

| Operation | Publication and recovery boundary |
|---|---|
| npm `postinstall` package reference refresh | One acquired revision updates **both package reference trees** together. On transaction publication failure, restore the prior trees; cleanup can still report residual work. Completion registration follows required refresh and is best-effort. |
| `arc install --target all` | Codex then Claude are **independent target transactions**. A later target failure keeps earlier success; it does not roll back the successful Codex installation. Remaining targets may be not-started. Inspect each target's status and residual paths before resolving the failure. |

`provenance.json` records revision, collection time, file hashes, and relative links. This provenance provides local consistency evidence; it does not authenticate upstream or a malicious local rewrite. Acquisition needs Git and network access. `npm --ignore-scripts`, a ZIP download, or a plain clone does not run npm postinstall; the next actual install still acquires fresh references. Actual installation stages references separately and can use a read-only package. Concurrent package refreshes or installation/removal against the same target are unsupported.

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
| Spike | Approve question and method, perform bounded exploration, report findings, then reassess implementation and required documents |
| Bounded | Approve short design; add written spec if required and implementation plan when the scope requires one |
| Architectural | Approve design direction, then written spec, then implementation plan |

Planner authors each applicable document; Orchestrator obtains approval before the next dependent stage. Plan omission requires one local change, no dependent stages, shared-state/lifecycle/integration-order concerns, and one focused verification path. It is not a blanket shortcut for small-looking changes.

Before implementation, complete and approve the entire required document set. Then obtain the user's explicit execution-target choice, prepare that target, verify or create the required batch document commit, inspect final actual repository state, and hand off. Planning approval does not select an execution target. Preserve unrelated staged, unstaged, and untracked files and edit ownership throughout.

**Approved documents → platform preparation → handoff.** Codex can use the current checkout, a new branch there, or a managed worktree as permitted by its handoff contract. Claude v1 executes in the current checkout only; ARC-managed worktrees are unsupported. A branch shares checkout files; it is not directory isolation. A managed worktree is a separate directory with verified repository/common-directory identity, registration, source preservation, and document transfer evidence.

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

Significant planned work receives one final whole-change review after all task acceptances and required QA/checks. Reviewer is not a prerequisite for every task commit. Significant unplanned work receives independent review before acceptance. Plan-skip paths do not gain a new commit obligation merely from the planned-task rule. Task acceptance/commit is distinct from final plan verification and final acceptance; final findings can require a scoped correction, QA recheck, and new focused commit. Push, merge, publication, and deployment require separate authorization. See platform [verification](../codex/skill/references/verification.md) and [commit](../codex/skill/references/commit.md) contracts, with [Claude verification](../claude/skill/references/verification.md) and [commit](../claude/skill/references/commit.md).

## Failure, resume, and maintenance

On failure or partial completion, hold affected work and inspect actual path, branch/detached HEAD, HEAD, index, files, and completed steps. Update the canonical record, resolve the observed blocker, and revalidate affected gates before resuming. Do not automatically retry, fall back, repeat completed work, stash/reset/clean, delete locks, change permissions, or bypass the sandbox. Preserve unrelated work and ownership. Reuse a still-valid explicit target choice and verified document/task commits; record only changed preparation facts on restart.

Agent Git recovery governs checkout/index coordination. Installer rollback governs filesystem publication transactions and acquisition cleanup. A reported residual path is evidence requiring inspection; a rollback label is not proof that all cleanup succeeded. Neither mechanism promises a persistent backup. See [Codex recovery](../codex/skill/references/git-recovery.md) and [Claude recovery](../claude/skill/references/git-recovery.md).

Maintenance actions have distinct effects:

- **Model reapplication:** edit installed `models.toml` and run the optional Python apply-models tool to validate/render profiles. This does not refresh ARC or upstream references.
- **Manifest maintenance:** refresh `MANIFEST.sha256` after protected payload changes and check it. Models are intentionally excluded. Dynamic upstream trees carry their own provenance validation.
- **Reinstallation:** refreshes managed ARC and upstream material and replaces local model edits; valid omitted ARC limits are preserved under the rules above.
- **Harness removal:** `arc uninstall` removes the selected ARC skill, five role profiles, and managed instruction block, including edited ARC files. External skills/profiles, Codex wait settings, native concurrency keys, and shared shell completion registration remain. `--skip-global` preserves the instruction block for that invocation. Removal has its own dry run and transaction reporting.
- **CLI package removal:** `npm uninstall -g @yunhozz/arc` removes the CLI package separately; installed harness configuration and shared shell completion remain.

Use the existing [maintenance commands](../README.md#-maintenance), [model commands](../README.md#-model-settings), and [removal commands](../README.md#-remove-arc). New installed settings apply to new sessions; running structural checks alone cannot establish runtime support.

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
| Package refresh and collection | [Postinstall](../scripts/npm-postinstall.mjs), [package references](../lib/installer/package-references.mjs), [acquisition](../lib/installer/acquisition.mjs), [bundle validation](../lib/installer/superpowers.mjs) |
| Completion | [Registration](../lib/installer/shell-completion.mjs), [script generation](../lib/cli/completion.mjs) |
| Structural contracts and regressions | [Harness contracts](../tests/test_harness_contract.py), [Python tests](../tests), [Node tests](../tests/node) |
| Maintenance | [Manifest updater](../scripts/update-manifest.mjs), [reference updater](../scripts/update-superpowers.mjs), [README commands](../README.md#-maintenance) |

The [flow diagram](images/role-flow.svg) summarizes routing and order. Follow the platform sources for full normative gates and intentional platform differences.
