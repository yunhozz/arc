# Verification contract

Orchestrator reads before verification design, QA/Reviewer assignment, correction rechecks, or UI acceptance checks.
QA and
Reviewer contracts are in their profiles; they read this file only for sections the brief explicitly cites.
Visual companion design discussion is distinct from QA UI acceptance.

For Orchestrator, **Evidence verdict**: each criterion is proven, unmet, or unverified; passing runs, reports, or disposition never turn unverified into proven; reports keep unverified scope visible.

## Visual Evidence and Adjudication

Each visual criterion requires the exact location, version, approval, and access state of the approved visual source; criterion IDs, properties, and comparison method; and evidence linking the actual output to its revision. An Implementer report does not replace fresh QA's direct comparison. Record results as pass, mismatch, or unverified and connect them to the existing proven/unmet/unverified criterion verdicts. Use pass only when accessible evidence meets the visual criterion. Keep unsupported claims unverified. Missing output-to-revision linkage is unverified; a visible difference is a mismatch. Treat these as separate observations and do not infer the current branch UI state. Hold the comparison if the approved source or actual output is inaccessible or interpretation approval is missing.

Static policy, generated-file, and manifest checks are structural evidence. They do not prove actual role behavior, an installed build, Claude Code CLI runtime compliance, or visual fidelity. Reports include actual changes and exclusion rationale, checks run and omitted, evidence and limits by criterion, and platform availability. Preserve existing baseline failures separately; progress on independent work does not relax required checks or acceptance criteria.

## Risk-scaled execution

Orchestrator assigns edits exclusively to Implementer except under the Orchestrator direct path in [handoff](handoff.md#orchestrator-direct-path-for-small-tasks), and determines affected
behavior, risk, and smallest meaningful verification.

| Risk | Minimum flow |
|---|---|
| Small, low risk | Implementer, or Orchestrator direct path → Orchestrator's focused checks → acceptance |
| Ordinary behavior | Implementer → independent QA → acceptance |
| Significant/high risk | Implementer → QA → independent Reviewer of the final full change → acceptance; with a plan, each plan task Implementer → FRESH QA → acceptance/commit satisfies the QA step, then independent Reviewer once on the final full change after all plan tasks |

Ordinary and significant plan tasks need a FRESH QA before acceptance; only small, low-risk tasks may be accepted on
Orchestrator focused checks. Small, low risk means narrow, understood, readily reversible, and verifiable by focused
checks. Ordinary behavior fails those conditions without a significant-risk trigger. Significant risk includes shared
role/behavior contracts, shared state, lifecycle/integration order, security/permissions, data loss/migration, public interfaces, or costly
installation/deployment/rollback. Substantial behavior or contract changes are significant regardless of file count.
When risk is unclear, investigate or use the higher flow. Environment failure does not waive checks or determine design depth.

Do not add per-task QA or review gates solely because a task boundary exists. Reviewer is never a plan-task acceptance
prerequisite; for significant work with a plan, it reviews the final full change once after all plan tasks are accepted
with their risk-scaled checks, following the last plan task's required checks and any QA recheck at the final relevant
state; significant work without a plan keeps Reviewer after QA before acceptance. Preserve specific approved
obligations. If the next task depends on a still-unverified risky contract, complete applicable QA at that dependency
boundary and resolve or explicitly disposition findings before dependent implementation.
Reuse evidence only when scope, relevant state, independence, freshness, and flow
position satisfy each covered requirement; changes, failures, or missing/conflicting evidence invalidate affected reuse.
QA checks independently without edits; Reviewer reviews without QA, planning, edits, delegation, or completion
decisions. Orchestrator routes fixes to Implementer (a failed direct-path check returns to the normal flow),
obtains affected QA rechecks outside the final plan Reviewer correction exception and required final review, and accepts after findings/evidence gaps are resolved or
explicitly dispositioned.

Criterion verdicts follow the Evidence verdict.

Fresh-per-task rules apply to Implementer and QA, not Reviewer. Orchestrator may reuse a Reviewer only while independent
of implementation and self-review, relevant assignment context remains valid, and refreshed review scope, target
state, and evidence are provided; otherwise assign another independent Reviewer. Reusing a Reviewer does not reuse
an earlier verdict or waive required review timing or coverage.

### Final plan Reviewer correction loop

For a plan's final overall Reviewer findings, including behavior findings, Orchestrator assigns
Implementer → Reviewer recheck with no QA reassignment. Repeat corrections and Reviewer rechecks until findings are resolved;
the initial single full review does not prohibit necessary rechecks. Before the initial final overall Reviewer,
risk-required checks and QA execution failures or unmet criteria still require Implementer correction → QA recheck.
This exception applies only to findings from the final overall Reviewer of work with a plan.
Work without a plan retains its existing verification flow. Scope expansion, separate mandatory obligations,
or unresolved evidence gaps hold affected work for Orchestrator to resolve and obtain required approvals.
Orchestrator assigns corrections/rechecks and decides acceptance. Reviewer remains read-only, must not run QA
checks or decide acceptance. Previous QA evidence must not be presented as post-fix execution evidence;
report only checks actually performed, their actor, target state, results and remaining limits.



Authorization evidence and probe/combined scope are owned by [planning](planning.md#authorization-and-scope);
valid reuse and actual-state refresh by [handoff](handoff.md#authorization-continuity).
After gates hold, continue approved scope without saved documents through required checks and Orchestrator acceptance under
Completion continuity below; a role report alone does not complete the work.



The Risk-scaled execution section above holds the risk table, risk definitions, evidence-reuse rule, and role order,
including Reviewer timing. Product/test edits belong exclusively to Implementer except under the Orchestrator direct path;
Orchestrator may inspect/run checks but routes code corrections to Implementer. Determine the minimum
flow from risk and any specific instruction or approved commitment, and record which requirements each check or review
satisfies. For small, low-risk work with clear scope and acceptance evidence and no such requirement,
Orchestrator's focused checks suffice; do not call QA or Reviewer automatically. Significant/high-risk work requires
independent review of the full change at the final relevant state after the required QA/focused checks and any QA recheck.

Many known metadata files are not significant solely because there are many, and a one-file permission or data-loss
rule may be. A vague request to delete unnecessary files does not establish low risk; reclassify when installer,
manifest, or other contracts are affected. For a verified ignore-pattern or metadata cleanup, confirm the targets are
unused, required project materials are unaffected, ignore patterns cover only intended paths, and the diff matches the
approved scope; Orchestrator's focused checks then suffice without automatically calling QA or Reviewer.
An environment failure is distinct from a code failure; report the exact limitation and any remaining evidence gap to Orchestrator.

Use additional Planner/Scouter only for unresolved planning/discovery questions. Reviewer covers substantial changes and
correctness, factual, security, data, or interface risks. Orchestrator may use Planner/Scouter/Reviewer when justified
and assigns all Implementer/QA work. Specialists report unresolved questions to Orchestrator, who assigns support only when needed.

QA runs applicable existing functional/test checks, or approved structural/consistency checks for policy and
configuration changes. Reviewer reads the assigned diff/source for correctness, factual accuracy, and security. Outside the final plan Reviewer correction exception, after a
behavior fix QA reruns affected checks, and Reviewer rechecks only when warranted. Reuse a Reviewer only when
independent of the work and self-review and when evidence meets required scope and freshness.
Before completion, resolve or explicitly disposition findings and confirm acceptance evidence. Claim checks only
with verified output.

## Evidence after plan history rewrite

After an approved execution-time plan rewrite, verify new HEAD, approved plan version/content and old-to-new SHA mapping;
descendant implementation content and task boundaries; and remaining staged/unstaged/untracked state. Preserve the actual
approval chronology and recoverable previous contents in the canonical handoff record. The latest version in the original
commit does not establish approval before its actual approval time.

SHA change alone does not invalidate all prior acceptance evidence. Check whether evidence bound to an exact HEAD,
document or policy can be linked to the new state. If it cannot be linked, or its meaning is affected, repeat affected
checks and required rechecks. Preserve existing runtime evidence invalidation and exact-state requirements; do not rewrite
old fingerprints to imply a run against the new HEAD. Refresh affected briefs and gates before dependent work.
Structural checks establish written-contract alignment, not live agent compliance or successful Git history replay.

## Task acceptance and final plan acceptance

Task-local acceptance is distinct from overall final plan verification and acceptance. Orchestrator connects each task's
acceptance criteria to actual evidence, currently required checks and findings before accepting it; checkbox
completion, a Implementer report or passing commands alone do not establish acceptance.

Task acceptance and its focused commit require only the task's risk-scaled evidence: a FRESH QA instance per task that
needs QA (default to the current QA for post-fix rechecks of the same task while the approved scope, workspace,
ownership, and relevant assignment context remain valid), or Orchestrator focused checks for small, low-risk tasks;
Reviewer timing and task-boundary gates follow the Risk-scaled execution section above. For an independently acceptable task,
do not delay its acceptance/commit solely for later final plan verification. Currently required task checks must not
be deferred to final verification to accept early. State the scope and timing of final-only integration criteria in
the plan; with a plan, the required final whole-change review is final plan verification.

A task commit record does not mark unperformed final verification complete. Orchestrator still decides final plan
acceptance using final QA/Reviewer/integration evidence and findings, preserving unverified scope and explicit dispositions.
Valid evidence may cover both task and plan requirements only under the existing scope/state/independence/freshness/flow
rules. For final Reviewer findings on already committed plan work, Orchestrator defines a follow-up task and required
planning/approvals. Implementer leaves corrections uncommitted during rechecks. Orchestrator refreshes the latest committed
state plus uncommitted diff and changed-file list in the Reviewer artifact/brief. Reuse an independent Reviewer or
assign another independent Reviewer as needed. Repeat Implementer → Reviewer without QA reassignment until findings are
resolved; Orchestrator then accepts the corrections and creates one focused follow-up commit.
Final QA findings retain Implementer correction and QA recheck before a new focused commit.
Do not automatically amend/reset or duplicate the original task commit. Scope expansion keeps existing new
planning and approval obligations.

### UI browser acceptance checks

Only when assigned UI acceptance criteria and the brief supplies the workspace, existing launch command or URL,
required account and test-data scope, and permitted interactions, QA may use the existing approved test environment
to launch the app or open the URL with available approved browser tools. Follow tool instructions and any applicable
installed browser skill. This permission does not authorize source/document/test/configuration editing, installing
dependencies, or changing environment configuration. Report missing prerequisites to Orchestrator and leave affected
criteria unverified. For each criterion record the command or URL, test state and viewport (or not applicable),
interaction steps, expected and observed results, and accessible evidence. App startup, page load, and static checks alone do not prove
complete UI behavior. For unavailable test environment or browser tools, report the exact limitation and affected
unverified criteria. Clean up only QA-created processes and sessions; preserve existing shared services and sessions.
When assigning UI acceptance criteria, Orchestrator cites this section with its accessible path in the QA brief.

### Criterion evidence and finding handoff

QA reports every acceptance criterion from the brief by identifier, or original wording when no identifier exists.
Each criterion records method and scope, run status, accessible evidence, criterion verdict, and unverified reason
and remaining scope. Run status is passed, failed, not run, or environment blocked; criterion verdict is proven,
unmet, or unverified. Passing a check alone does not prove a criterion: evidence must connect its conditions and
expected result to actual observations. Preserve partial confirmation and out-of-scope, missing-check, or environment
blocked gaps as unverified; omit no criteria. PASS, if used, means only run status and cannot replace criterion
verdicts.
Structural checks prove structural criteria only; they do not prove actual behavior, installation, or live agent runtime
compliance.

For QA execution failure or an unmet criterion within the current task, Orchestrator defaults to the current Implementer
for correction and the current QA for a post-fix recheck, subject to the context, task-boundary and amendment rules in
[coordination](coordination.md). The finding alone does not create a new task. QA reruns the
reproduction path and invalidated related checks before Reviewer, reporting the actual actor, target state, outcomes, and limitations,
and the prior finding resolved, unresolved, or unverified with evidence. Reusing QA does not reuse stale evidence.
An unresolved finding returns to Implementer correction and another QA recheck before Reviewer.
Environment blocks, missing checks, and out-of-scope criteria are evidence gaps, not presumed code defects; Orchestrator
handles those gaps under the existing disposition policy without substituting Reviewer review for QA evidence.

For an acceptance-linked behavior finding, Reviewer reports the criterion, expected behavior, observed problem, related
source, reproduction conditions and steps, and evidence to Orchestrator, distinguishing source-inferred reproduction
from execution-observed results without running QA tests. Outside the final plan Reviewer correction exception,
Orchestrator routes it to Implementer correction and QA post-fix recheck. Outside the required final plan correction loop,
Orchestrator decides when a Reviewer recheck is warranted by the changed scope and independence. Reviewer continues handling
structure, design, factual, and security findings that execution checks cannot settle; observable security/interface
issues may require both QA verification and Reviewer source review.

Orchestrator accepts using criterion verdicts, findings, recheck evidence, and remaining gaps, rather than an overall
run result.
Explicit disposition does not convert unverified to proven; completion reports preserve remaining unverified scope.
For low-risk work without QA, Orchestrator's focused checks likewise connect each criterion to evidence.


Read brief-cited `references/superpowers/test-driven-development/SKILL.md`; retain ARC exceptions.


## Completion continuity

Once applicable authorization, document-depth, execution-target, and handoff conditions hold for the approved scope,
continue through execution, correction, reverification, required QA and Reviewer, findings disposition, Orchestrator
acceptance, and the result report. Apply risk-scaled timing above; this adds no per-task Reviewer or new QA obligation.
A role completion report, probe findings, or passing commands are not overall completion when approved work remains.
Remaining approved execution is not an optional suggestion waiting for a user response. A probe-only scope
ends at its approved question's evidence and limits; a combined scope continues under planning's scope rules.
Document omission changes neither verification risk nor acceptance responsibility. Hold only affected work for an
actual unmet condition and report what is needed to resume. Structural evidence does not prove live agent compliance.

## Verification lifecycle in the cooperative CLI

The supported `workflow` path is an approved complete spec+plan. No-plan, small-task and document omission paths remain
`cooperative.unsupported`; this outcome does not imply a violation of existing ARC policy or a new obligation to write documents.
The CLI does not execute checks or invoke Reviewer. All actors, results and verdicts are `operator-attested`; they do not prove
identity, actual independence, semantic sufficiency or enforced execution.

An Orchestrator actor (`actor.role: "orchestrator"`) registers a verification contract by recording
`data: {kind: "task", task: {...}}` in `acceptance-evidence` through `record`. The task specifies `id`, absolute `paths`,
`criteria`, `requiredChecks`, `dependencies`, `approvalRef`, `approvalVersion`, `documentVersion`,
`scopeVersion` and `targetVersion`. Only pending tasks can be registered; this record is neither acceptance nor a commit.
Each requiredChecks descriptor is `{executable, args, cwd, env, outputs}`; executable, cwd and outputs are absolute paths.
cwd and outputs must be within the workspace. Do not include Reviewer in task requiredChecks.

`changeFingerprints.tasks[taskId]` and `changeFingerprints.final` in `status` are independent observations.
They include read-only Git inventory/index observations and current regular-file bytes, modes and deletions. Task fingerprints
cover owned paths; the final fingerprint covers the whole repository snapshot. Unsupported observations such as symlinks,
submodules and unmerged indexes cause a hold. This is not a sandbox that atomically locks observation and execution.
Leave runtimeHash drift as stale/hold; do not automatically update the stored version or convert it through migration or renewed approval.

`operation: "check"` in `prepare` accepts `taskId` and
`arguments: {scope: "task", actor: {id, role: "qa"}, descriptor, changeFingerprint, findingIds?}`.
Actor ID attestations must be independent of Implementer and Orchestrator; QA/Implementer reuse across tasks is rejected. The descriptor must
exactly match the registered requiredChecks. After the intent is persisted, the responsible role executes within its existing approved scope.
`result` or `reconcile` records `intentId` and `{status, messageRef, data}`. data specifies the same
`actor`, `descriptor` and `scope` as the intent, `taskId` for tasks, `changeFingerprint`, and
`verdict: "proven" | "unmet" | "unverified"`. Even a succeeded/proven result is valid only for that change version.
This is an operator verdict record; it does not replace semantic proof of a criterion or Orchestrator acceptance.
Failures, unknown, mismatch and unverified outcomes are not passing evidence. Preserve previous results and failure records.

A failed check/review leaves an open finding. Link a separate finding to an existing check/review through `record` with
`data: {action: "open", id, checkId, message}`. After a Implementer fix, record
`data: {action: "resolve", id, actor: {id, role: "implementer"}, changeFingerprint}` and the fix evidence messageRef.
The actor must be the Implementer assigned to that task, or a relevant task for an overall finding. This marks the finding resolved;
it becomes closed only when a subsequent prepare includes it in `findingIds` and revalidation passes for the same change version.
Earlier QA failures retain the Implementer→QA recheck requirement.

`operation: "review"` uses `scope: "final"`, `actor.role: "reviewer"` and
`descriptor: {kind: "source-review", paths: [...]}`, without taskId. The initial final review requires acceptance of all tasks
and current required task QA evidence. Reviewer is not a prerequisite gate for task acceptance or focused commits.
For final Reviewer findings in supported plan work, repeat Implementer resolution→Reviewer revalidation without QA reassignment.
Do not present earlier QA evidence as execution evidence for a subsequent fix. This exception does not omit separate unresolved QA failures.

Scope, document and approval change records do not overwrite history. Specifying `data.affectedTaskIds` invalidates task,
verification and acceptance evidence for those tasks and their dependency chain; omitting it holds all tasks. Final evidence also becomes stale.
Preserve evidence for unaffected independent tasks. Orchestrator determines semantic impact. Affected tasks require a new approval record
for the current scope and an updated task contract before preparation; earlier approvals cannot revive them. New checks/reviews and
finding revalidation are also required. Current evidence supersedes earlier failures without deleting them; acceptance, commits and final completion remain Orchestrator decisions.

### Task acceptance and focused commit reconciliation in the cooperative CLI

In the current plan mode, `prepare` supports `operation: "accept"` and `operation: "commit"`.
Acceptance is an Orchestrator attestation specifying `actor.role: "orchestrator"`, `taskId`, and, in `arguments`,
`messageRef`, the same `criteria` as the task, exact `checkIds` for current required QA, all task
`findingIds` and the current `changeFingerprint`. The latest QA result for each required descriptor must be
passed/proven, and findings must be closed through Implementer fixes and QA rechecks.
A successful attestation marks the task accepted; passing commands or Implementer reports alone do not constitute acceptance.
The provenance is `operator-attested`; the operator confirms semantic criterion satisfaction and actor identities.

At acceptance, the code pins the actual index tree, staged diff, paths and task fingerprint together. Orchestrator stages only
approved task paths beforehand and confirms required QA for that index state. Unrelated paths, changes from another registered
task, or unstaged/untracked changes within scope cause a hold. The code cannot automatically distinguish semantically unrelated
hunks within the same file; Orchestrator reads the actual diff to confirm them.

`operation: "commit"` in `prepare` references the exact acceptance through `arguments: {"acceptanceId": "acceptance requestId"}`.
The code checks that the current approval, task contract, QA, findings and index match acceptance, then persists a durable intent
with the expected parent, tree, paths and residual paths. The CLI does not stage or commit.
Orchestrator creates one focused implementation commit matching these expectations.

Then submit `intentId`, `actor.role: "orchestrator"`, and
`result: {"status": "succeeded", "messageRef": "actual result evidence", "data": {"commit": "full OID"}}`
through `reconcile` or result-form `result`. The CLI rereads the actual commit object, parent, tree, paths, HEAD, index and residual changes from local Git.
Only a complete match updates target HEAD and marks the task committed. Failure, unknown and mismatch observations and actual
history are preserved; the target is not updated arbitrarily. Reusing the same request or a completed intent does not authorize
a second effect. After a failure, read the actual state, resolve the cause and reconcile the existing intent.

Do not rewrite earlier QA fingerprints after a successful commit. Separate post-commit file/index observations detect subsequent
changes. Under the existing rules, final review requires current task evidence and the final fingerprint.
A changed runtimeHash follows the existing stale/hold rules; the stored version is not automatically updated.

[ARC role policy: contract begin]
Generated from lib/policy/role-policy.json; do not edit this managed section manually.
- [git.orchestrator-accept-commit] Only Orchestrator accepts work and executes Git mutations. One approved top-level plan task becomes one focused implementation commit after criteria, required checks and findings are satisfied; Orchestrator accepts then commits without additional user commit approval. Reports, passing checks and Reviewer opinions do not replace acceptance. Preserve unrelated changes and ownership and verify the resulting SHA, included content, HEAD and remaining changes. Existing small-task direct and plan-omission paths are unchanged.
- [review.significant-no-plan] For significant/high-risk work without a plan: Implementer → QA and required QA rechecks → Reviewer of the final full change → Orchestrator acceptance. MUST NOT omit Reviewer merely because no plan exists. This creates no new plan obligation.
- [review.significant-plan] For significant/high-risk plan work: each task uses Implementer → fresh QA as required → Orchestrator acceptance and focused commit. After all tasks are accepted and required QA is complete, Reviewer reviews the final full change once. Reviewer is NOT a per-task or per-commit required gate. Preserve required checks and necessary finding rechecks.
- [review.final-plan-recheck] For final overall Reviewer findings on plan work, including behavior findings, use Implementer → Reviewer without QA reassignment; repeat until resolved. This exception applies only at the final plan stage. Preserve required QA and QA failure rechecks before initial final review and outside this exception.
- [planning.plan-amend] During approved task execution, mechanical plan progress records need no new user approval; changed goals, scope, criteria, method, risk, dependencies or required verification require revised-version approval and preparation before affected work. In both cases Orchestrator amends the original planning-document commit at a safe boundary, without a separate document or fixup commit. Preserve actual approval chronology, recoverable old/new contents, hashes, versions and SHA mappings; never retroactively authorize earlier work. Rewrite only unpublished, unshared local linear history with clear ownership and no merges; stop on unknown publication, ownership, unexpected state or replay conflicts, without force push or a fallback document commit. Preserve implementation task boundaries and revalidate affected evidence. See planning, handoff-prep, commit and verification for the full contract.
- [platform.codex] Role restrictions are prompt-level contracts, not a filesystem sandbox. No documented role-specific Git hook or generic per-agent tool allowlist is assumed. Existing shell capabilities are retained because static read access after shell reduction has not been verified; Implementer and QA need shell for approved checks.
[ARC role policy: contract end]


## External operations and recovery in the cooperative CLI

The three phases support state, documents and assignment; scope, verification, acceptance and focused commits; and external approval, results and audit recovery.
Use `status.support` to inspect all nine areas and their limits. The supported mode is `plan` with spec+plan; no-plan and omission are unsupported. The CLI does not execute native/provider calls or push, merge, deploy or publish.
User approvals and execution results confirmed by the operator are `operator-attested`, with `nativeVerified: false` and
`remoteVerified: false`. Blocking direct calls outside the CLI and independent remote verification are not provided.

Orchestrator records an explicit approval it has already confirmed through `record` with
`evidence: {kind: "external-approval", messageRef, data: {operation, scope, descriptor}}`.
`scope` is an array of unique absolute paths within the checkout. Local commit approval does not authorize external operations.
Include the exact action, scope and target in the approval, and record every descriptor field below.

| operation | descriptor fields |
|---|---|
| push | repository, destination, refspec, sourceOid, expectedRemoteOid |
| merge | repository, changeRef, targetRef, expectedTargetOid |
| deploy | service, project, environment, artifactId, destination |
| publish | service, namespace, name, version, artifactHash, destination |

Git OIDs are full 40/64-character lowercase hex values; artifactHash is `sha256:<64-hex>`. Without a remote observation,
an OID is an expected value asserted by the user, not verified remote state. destination must be an identifier without secrets.
Do not submit URL userinfo, query or fragment components, or authentication information such as passwords, tokens or credentials.
The CLI rejects recognized credential inputs before persistence, but cannot determine whether every arbitrary string contains a secret.

Pass `{requestId, expectedRevision, actor: {id, role: "orchestrator"}, operation,
arguments: {approvalRef, scope, descriptor}}` to `prepare`. approvalRef matches the external approval messageRef.
An intent is persisted only when the exact approval, scope/target versions and runtime version match and no effect is unresolved.
After confirming `allow` and `persisted: true`, Orchestrator performs the external operation within its separately approved scope.
This CLI does not expand that execution authority.

`result`/`reconcile` accepts `{requestId, expectedRevision, actor, intentId,
result: {status, messageRef, data: {operation, scope, descriptor}}}`. intentId is the prepare requestId.
Target mismatches, unknown outcomes and stale results cause a hold while preserving earlier attestations. After an interruption,
use `status` to inspect the intent, `state.requests`, `state.audit` and `state.results`, and investigate whether the effect occurred.
Reconcile the investigation result against the same intent rather than preparing again or reusing the same approval to execute again.
Cancellation additionally requires a `notExecutedEvidence: {messageRef}` attestation that the operation was not executed.
The approval remains consumed after cancellation. Do not resolve version drift through automatic updates, migration or renewed permission.
Report the cause of the hold to Orchestrator.

Even succeeded results are operator attestations, not independent remote verification. `audit` retains the
request→decision→intent→result→resolution linkage, but is a locally editable record rather than tamper-proof security evidence.
Do not retry while the actual external outcome is uncertain.
