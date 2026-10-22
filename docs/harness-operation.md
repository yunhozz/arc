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

Use this sequence: approve the initial design → explicitly select the execution target → prepare and verify the target → write, save, self-check, and separately approve each required formal spec → write, save, self-check, and separately approve each required plan → complete the full required document set → verify commits for existing documents and commit the remaining approved documents in one batch → perform final Git verification → hand off to the Coder. Approve any required written spec before creating a plan that depends on it. The document-omission path skips only inapplicable document stages and records why each omitted document is not required. Completing the documents is a prerequisite for staging/committing them and for Coder handoff, but not for initial target preparation. Plan approval does not replace explicit execution-target selection.

**Approved documents → platform preparation → handoff.** This summary does not replace the detailed sequence above. Under the contract, Codex can use the current checkout, a new branch in that checkout, or a managed worktree. Claude v1 uses the current checkout only. A branch shares files with its checkout, while a managed worktree is a separate directory; verify repository/common-directory identity, registration, preservation of the source checkout, and evidence that planning documents were transferred. Preserve unrelated staged, unstaged, and untracked changes, along with edit ownership.

### Approval reuse and completion continuity

An execution request that is specific enough may itself approve its stated scope. Confirm the outcomes, constraints, required document depth, and verification risk from the request or any explanation the user explicitly references, then record the approval basis and acceptance criteria. Restating the same scope, handing work to another role, or restarting it does not require another approval. Silence, ambiguous assent, approval for a different task, and a broad improvement request with unclear scope do not constitute approval. Keep any required written-spec and plan approvals separate.

A probe-only task ends with findings, evidence, limits, and remaining uncertainty for the approved question. An evidence-backed conclusion that a probe is infeasible may count as completion; it does not authorize product maintenance or follow-up implementation. When the user explicitly asks for both a probe and implementation, the full scope is sufficiently specific, and the bounded path applies, investigation is an internal stage. The investigation report is not a new approval boundary, so continue through the implementation already approved. Unknown implementation work is not automatically approved.

Major changes in scope, method, or risk; an unresolved new decision; a target change; unclear ownership; unexpected state; an unresolved failure; or missing required input are reasons to hold the affected work. Routine corrections and re-verification within the approved scope do not require duplicate approval. After resolving a blocker, re-verify the affected conditions. Once applicable approval, document-depth, target, and handoff requirements are met, continue through execution → correction → re-verification → risk-based QA/Reviewer checks → finding disposition → Orchestrator acceptance → result report. A role completion notice, investigation result, or successful command alone does not mark remaining approved work complete.

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

Before the final overall Reviewer begins a plan review, QA execution failures and unmet criteria must go through Coder correction → QA recheck. For findings from the final overall Reviewer on an already-committed plan, including behavioral findings, repeat Coder → Reviewer rechecks without reassigning QA. The Orchestrator defines a follow-up task and required planning/approvals; corrections remain uncommitted during rechecks, and the Reviewer receives the latest committed state, uncommitted diff, and changed-file list. Once findings are resolved, the Orchestrator accepts the corrections and creates one focused follow-up commit. Final QA findings continue through Coder correction → QA recheck. This exception applies only to final overall Reviewer findings on plan work; it does not authorize automatically amending/resetting or duplicating the original commit.

Use the Conventional Commits format and follow applicable user and repository instructions. This repository requires commit descriptions to be concise, specific Korean phrases. Do not let an upstream English default override a user-specific instruction.

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

### File-by-file scope of responsibility review

T1 compared the following 29 non-Superpowers runtime guidance files (2 shared core files, 9 Codex references, 8 Claude references, and 10 role profiles). Paired files share responsibilities, while each source owns its platform-adapter differences. Repeated policy meaning was consolidated around its source of truth and links, while role-specific local safety contracts were preserved.

| Responsibilities retained, condensed, moved, or revised | Sources reviewed |
|---|---|
| Preserve routing, risk, and approval-continuity summaries; link to references for details | Both platforms' `skill/SKILL.md` |
| Approval, probe, document depth, dependencies, and canonical writing order | Both platforms' `skill/references/planning.md` |
| Common handoff and preparation/document-commit evidence | Both platforms' `skill/references/handoff.md`, `handoff-prep.md` |
| Codex-specific worktree target-preparation contract | [Codex handoff-worktree](../codex/skill/references/handoff-worktree.md) |
| Retain cumulative/concurrent limits and platform adapters | Both platforms' `skill/references/limits.md` |
| Risk-based checks, acceptance, final correction paths, and completion continuity | Both platforms' `skill/references/verification.md` |
| Task commits, no-change tasks, and correction-commit responsibilities | Both platforms' `skill/references/commit.md` |
| Inspect and resume after failure or partial completion | Both platforms' `skill/references/git-recovery.md` |
| Retain existing visual-tool responsibilities | Both platforms' `skill/references/visual-companion.md` |
| Retain each role's scope, reporting, delegation prohibition, and verification responsibilities | `codex/agents/arc-{scouter,planner,coder,qa,reviewer}.toml`, `claude/agents/arc-{scouter,planner,coder,qa,reviewer}.md` |

T2 aligned bootstrap role routing in [global configuration](../lib/installer/global-config.mjs) with its source of truth. [language](../lib/installer/language.mjs), [installation plan](../lib/installer/plan.mjs), [profile rendering](../lib/models/profiles.mjs), [manifest validation](../lib/installer/manifest.mjs), [package metadata](../package.json), and [manifest updater](../scripts/update-manifest.mjs) were checked for compatibility with existing interfaces, language behavior, bytes outside markers, and package/license contracts. Model configuration and the apply-models script retain their existing responsibilities and are linked from the [model guide](../README.md#-models-and-language). T3 aligned the README, this operations guide, and document contract checks with those responsibilities. The runtime Superpowers bundle remained outside this refactor.

This source map and the structural, package, and manifest checks provide evidence that authored files and package contents are consistent. Whether approval continuity was followed in a real session, whether installed native settings took effect, and whether visual output is readable remain unverified without direct observation. Content from reference conversations or reproduction of an interrupted run is not, by itself, evidence supporting this document's claims.
