<a id="role-assignment-and-coordination"></a>
# Role assignment and coordination

Shared text for this section: [coordination-common.md#role-assignment-and-coordination](coordination-common.md#role-assignment-and-coordination). It applies here exactly as if written in place.

<a id="ownership"></a>
## Ownership

Shared text for this section: [coordination-common.md#ownership](coordination-common.md#ownership). It applies here exactly as if written in place.

### Execution mode

Before the first specialist creation or assignment, check whether `arc-role-platform-routing.prepared.json` exists in the platform home that contains this skill (`../../arc-role-platform-routing.prepared.json` relative to this skill directory). If it exists, ARC runs in `Mixed routing` mode: follow [Composite Platform Role Dispatch](#composite-platform-role-dispatch) for every role, starting with `routing-status`, and use only the profile or bridge it returns. NEVER invoke `arc-<role>` or `arc_<role>` names in this mode, even if they are listed. Otherwise use the standalone names below.

Standalone native names: Scouter=`arc-scouter`, Planner=`arc-planner`, Implementer=`arc-implementer`, Tester=`arc-tester`, Reviewer=`arc-reviewer`.

Composite native names (`Mixed routing`): Markdown-profile platforms use `arc-routing-<suffix>`; Codex uses `arc_routing_<suffix>`; the suffix is the role name. NEVER pass a model argument when spawning them.

Shared text for this section: [coordination-common.md#coordination-execution-mode](coordination-common.md#coordination-execution-mode). It applies here exactly as if written in place.

ARC limits do not prove native concurrency/depth support. Invoke installed native names and receive results; report unavailable execution. Scouter/Planner/Reviewer cannot edit, execute commands or save documents. Tester verifies without edits. Use only actually available, authorized tools; prompt contracts are not filesystem sandboxes.

After each read-only role return (Scouter/Planner/Reviewer), compare `git status` with the pre-spawn snapshot. Unexpected changes stop under Preservation rule. Concurrent Implementer edits and ignored/out-of-repository paths cannot be attributed/detected. Read-only is prompt policy, not sandbox enforcement.

<a id="instruction-and-execution-adapter"></a>
## Instruction and execution adapter

Gemini profiles use scalar YAML frontmatter (`name`, `description`, `model`) and body instructions. Effort is `default` in ARC model settings and is not rendered into native profiles. No native tool restriction fields or settings.json keys are verified; ARC does not write settings.json. Role contracts are prompt-level restrictions, not a filesystem sandbox.

Shared text for this section: [coordination-common.md#instruction-and-execution-adapter](coordination-common.md#instruction-and-execution-adapter). It applies here exactly as if written in place.

Planner/Reviewer/Scouter return findings/questions/actions/path issues; Planner preserves complete drafts. Task boundaries alone add no Tester/review. Unverified risky dependencies require boundary Tester and resolved/explicitly dispositioned findings before implementation, not blanket task gates.

<a id="local-superpowers-references"></a>
### Local Superpowers references

Shared text for this section: [coordination-common.md#local-superpowers-references](coordination-common.md#local-superpowers-references). It applies here exactly as if written in place.

<a id="token-discipline-and-handoffs"></a>
Shared text for this section: [coordination-common.md#token-discipline-and-handoffs](coordination-common.md#token-discipline-and-handoffs). It applies here exactly as if written in place.

## Context discipline and handoffs

Only Orchestrator invokes/assigns Gemini roles. Describe role and bounded objective. Installed native profiles determine role/local models.

Shared text for this section: [coordination-common.md#coordination-context-discipline-and-handoffs](coordination-common.md#coordination-context-discipline-and-handoffs). It applies here exactly as if written in place.

- Follow-ups send changed fields only; mark others `unchanged` relative to a received brief. Restarts follow handoff; fresh specialists receive other fields in full.
- Send a self-contained needed subset and accessible artifacts. Omit full history/repeated instructions/raw logs. No-findings reports MAY be brief; requested full drafts remain complete. Cite locations/commands/links, investigating gaps only.
- Use only an actually available user-question tool and its verified input schema; Gemini user-question APIs are unverified.
- Start installed `arc-*` names with scoped briefs only, never inheriting the parent conversation history; claim fresh isolation only with evidence. Reuse valid related context, not unrelated/bloated context. Role gate governs Implementer/Tester freshness.
- Brief absolute local ARC SKILL.md paths: `test-driven-development` for Implementer, `brainstorming`/`writing-plans` for Planner. Read before dependent work.
- Write final base..HEAD diff/changed-file list to `<git-common-dir>/arc/review/<slug>.diff`, using handoff slug/approved base HEAD. Inline if small or write denied. Reviewer reads and states limits; follow verification.
- Implementer briefs cite spec/plan task-section line ranges and needed excerpts/criteria/constraints; NEVER request whole-document reading.
- Follow [Planner preparation/feedback](planning.md#planner-drafting-preparation-and-consolidated-feedback). Complete the initial brief and whole-draft checklist; directly revise the same spec or plan after Planner returns its complete first draft and self-review. Preserve the Planner path for design/brainstorming revisions.
- Before optional calls name the unresolved question/expected artifact. Skip questions already resolved by evidence/direct inspection.
- Wait for actual role results or completion notifications from the available tool. Report unavailable execution; invent no API. NEVER poll/sleep-poll for timeout/delay. Batch corrections in one brief. Long shell commands use a sufficient timeout or the available background mode plus completion notification.
- Read needed file/output ranges only (`rg -n`, `sed -n`, `head`/`tail`) and cap output. DO NOT reread unchanged context material. Already-read unchanged mandatory references/SKILL.md need no follow-up reread; newly triggered mandatory reads remain required.
- At plan completion or before another plan in a long session, record canonical handoff and recommend a new session.
- Before handoff briefly state role/objective/output; after return combine findings/next stage. NEVER expose hidden reasoning/raw prompts.

Shared text for this section: [coordination-common.md#coordination-context-discipline-and-handoffs-2](coordination-common.md#coordination-context-discipline-and-handoffs-2). It applies here exactly as if written in place.

## Planner dispatch efficiency

Shared text for this section: [coordination-common.md#coordination-planner-dispatch-efficiency](coordination-common.md#coordination-planner-dispatch-efficiency). It applies here exactly as if written in place.

<a id="models"></a>
## Models

Shared text for this section: [coordination-common.md#models](coordination-common.md#models). It applies here exactly as if written in place.

`arc_scouter`, `arc_planner`, `arc_implementer`, `arc_tester`, `arc_reviewer` settings map to hyphenated native names, not tool calls. For visualization read [visual companion](arc-visual-companion.md), use only actual allowlisted tools and report unavailable/unverified scope. Shipped `model` defaults are replaced with active `models.toml` role settings at installation.

<a id="instruction-and-input-provenance"></a>
## Instruction and input provenance

Shared text for this section: [coordination-common.md#instruction-and-input-provenance](coordination-common.md#instruction-and-input-provenance). It applies here exactly as if written in place.

[ARC role policy: contract begin]
Generated from lib/policy/role-policy.json; do not edit this managed section manually.
- [git.specialists-deny] Specialists MUST NOT change Git state during implementation or recovery: no stage, commit, push, merge, rebase, reset, branch creation/switching or worktree creation/removal. Explicit Orchestrator assignment cannot authorize these actions; return them to Orchestrator. Read-only Git inspection remains allowed within the assigned scope.
- [role.scouter-read-only] Research assigned static sources and report findings, evidence and limits. DO NOT edit, install, execute checks, prepare targets, inspect live operational state or change external state. DO NOT decide design, verification, review or acceptance.
- [role.planner-draft-only] Return design/brainstorming drafts and complete first spec/plan drafts with dependencies, criteria, holds and verification needs in the response. During initial drafting and revisions, report progress only to Orchestrator: briefly state the stage, feedback being applied, actual blocker or next step, without draft prose or excerpts. Return the complete first draft and self-review for Orchestrator review; Orchestrator directly revises the same spec or plan when needed. Raw responses may appear in app/tool surfaces; prompt policy cannot hide them. DO NOT save documents, implement, run checks, prepare targets, request user approval or decide acceptance. The first required document draft uses the verified source and selected target intent before target preparation. Require a verified prepared target before saving or handoff. Route decisions to Orchestrator.
- [role.implementer-implementation] Edit only assigned, approved files and run focused checks under the existing TDD contract. Report changed files, RED/GREEN or approved exception evidence, results, limits and follow-up. DO NOT plan, perform Tester or Reviewer verification of your own work, accept the task or declare overall completion. Git mutations remain forbidden after successful implementation. Implementer and fresh Tester handoffs include the exact approved visual source, version, approval and access state; criterion IDs, required properties and comparison method; and actual-output identity, revision and comparison basis. Record pass, mismatch or unverified with accessible evidence and limits. Implementer self-report does not replace fresh Tester and its actual comparison. A missing output-to-revision link is unverified; record a visible difference separately as mismatch without inferring current branch UI state. Missing source/output, inaccessible evidence or unapproved interpretation holds the affected visual claim for Orchestrator. DO NOT silently substitute or redesign.
- [role.tester-verification] Run approved checks and report commands, observations, reproduction, evidence and limits. Create only essential temporary data/logs/reports within brief-authorized locations and lifetimes. DO NOT edit product source, tests, fixtures or configuration to pass checks, deploy or accept work. Persistent product-state checks need explicit scope and cleanup ownership. Return failures for Implementer correction and required Tester recheck. Implementer and fresh Tester handoffs include the exact approved visual source, version, approval and access state; criterion IDs, required properties and comparison method; and actual-output identity, revision and comparison basis. Record pass, mismatch or unverified with accessible evidence and limits. Implementer self-report does not replace fresh Tester and its actual comparison. A missing output-to-revision link is unverified; record a visible difference separately as mismatch without inferring current branch UI state. Missing source/output, inaccessible evidence or unapproved interpretation holds the affected visual claim for Orchestrator. DO NOT silently substitute or redesign.
- [role.reviewer-independent] Independently inspect assigned final changes and evidence, and report actionable findings and limits. Remain read-only: DO NOT execute Tester tests, edit files, perform Git mutations or decide acceptance.
- [platform.gemini] Role restrictions are prompt-level contracts, not a filesystem sandbox. Native tool restriction fields, observer hooks and Git guards are unverified. Use only available authorized tools; ARC does not write Gemini settings.json.
[ARC role policy: contract end]

## Composite Platform Role Dispatch

Shared text for this section: [coordination-common.md#coordination-composite-platform-role-dispatch](coordination-common.md#coordination-composite-platform-role-dispatch). It applies here exactly as if written in place.

### Host rules

Shared text for this section: [coordination-common.md#coordination-host-rules](coordination-common.md#coordination-host-rules). It applies here exactly as if written in place.

#### Shared host rules

Shared text for this section: [coordination-common.md#coordination-shared-host-rules](coordination-common.md#coordination-shared-host-rules). It applies here exactly as if written in place.

### Bridge target rules

Shared text for this section: [coordination-common.md#coordination-bridge-target-rules](coordination-common.md#coordination-bridge-target-rules). It applies here exactly as if written in place.

### Bridge tool access

Shared text for this section: [coordination-common.md#coordination-bridge-tool-access](coordination-common.md#coordination-bridge-tool-access). It applies here exactly as if written in place.

<a id="coordination-shared-dispatch-rules"></a>
### Shared dispatch rules

- Bridge children receive the profile instructions only and NEVER load ARC `SKILL.md`. Role instructions forbid re-delegation.
- Fixed timeouts: `arc_implementer` 60 minutes, `arc_tester` 60 minutes, others 20 minutes. At timeout the child group is terminated; `failed` is recorded only after observed exit, otherwise `unknown`.
- `unknown` (`terminal_state_unverified`) keeps its slot and is never released or re-run automatically. After a supervisor loss, inspect the dispatch in `<anchor home>/arc-role-dispatch/` and its artifacts under `<gitCommonDir>/arc/workflows/<workflowId>/dispatches/<dispatchId>/` and perform manual cleanup. ARC does not delete or release such leases, nor residual lock files, automatically; it reports them. Only leases in `completed`, `failed` or `cancelled` for more than 30 days are pruned.
- Active bridge dispatches block publishing the composite configuration (`Active bridge dispatches: <ids>`); finish or cancel them first. Native leases do not block.
- `execution_identity_unverified` (no session ID was obtained) is recorded by the supervisor after exit and exposed by `observe`; `resume` holds with it for a dispatch without a session ID. The `run-dispatch` response and `prepare-dispatch` never carry it.
- A leftover orphaned process group after the child leader exits by itself is reaped (SIGTERM, grace, then SIGKILL) before the post-run snapshot is taken, and `orphanGroupReaped` is recorded; if the group cannot be observed gone the dispatch is `unknown` (`terminal_state_unverified`) and keeps its slot.
- Post-run detection compares the changed paths, `HEAD`, the branch and every Git ref. These ref changes are not violations and are recorded in the dispatch record under `tolerated.refs`, because Git activity outside the dispatch produces them and detection cannot tell who made them: remote-tracking refs (`refs/remotes/**`), tags that did not exist before the run, and branches checked out by another registered worktree before or after the run. If the worktree list cannot be parsed, does not include the dispatch worktree, or lists it on a different branch than its `HEAD`, no branch is tolerated this way. Any other ref creation, deletion or movement is a `permission_violation_observed` for every role, including any other change to the dispatch worktree's own branch, branches checked out by no worktree, and moving or deleting an existing tag. A fast-forward of the dispatch worktree's own branch is not a violation, and is recorded under `tolerated.refs` with its committed paths under `tolerated.commitPaths`, when the branch did not change, the new commits include no merge commit, there are at most 100 of them touching at most 10,000 paths, and, for `arc_implementer` and for `arc_tester` with non-empty `allowedPaths`, every path they add, modify, delete or rename is within the role's `allowedPaths`. For read-only roles and for `arc_tester` without `allowedPaths` the path check is skipped, so their fast-forward commits pass on the other conditions alone. Detection cannot tell who made these commits. A rejected fast-forward is a `permission_violation_observed`, and its out-of-scope paths are listed in `changedPaths`. Switching the branch, rewriting history, a detached `HEAD` move or a move on an unborn branch remains a violation. Each `tolerated` list keeps at most 100 sorted names, and `tolerated.truncated` is set when a list is longer. Changes to Git-ignored paths are outside post-run detection, except the control files listed above.
- `ARC_BRIDGE_CHILD` is set in the environment of every bridge child; routing commands are denied in a process that has it. Re-running `codex exec`, `claude -p`, `gemini` or `grok` through a shell is outside `delegation_observed` detection.
- CLI versions are not restricted. `routing-status` and bridge `prepare-dispatch` report the parsed `<cli> --version` result (`cliVersion.version`, or `null` with a `reason`) for information only; no version holds a native or bridge route.
- There is no automatic fallback, substitution or retry. On any hold, deny or failure, report the reasons and release conditions and DO NOT use another model or platform. Run `routing-status` again only after the condition changed. Bridge dispatches count in the instance ledger; see [limits](limits.md).
- After an ARC upgrade that changes the cooperative runtime version, run Configure again; until then routing holds as `activation_unverified`.

Gemini host capability remains off until live verification. Installed payload alone verifies no native invocation, bridge, authentication or concurrency behavior. Hold unavailable routes; DO NOT invent native tool calls. Dispatch history created before an anchor move stays in the old anchor home.
