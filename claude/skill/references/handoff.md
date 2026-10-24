# Implementer handoff

## Instruction Sources, Bounded Read Recovery, Visual Evidence, and Resumption

Keep the existing brief field order and record provenance and status within each field. Distinguish four sources: user-provided instructions, discovered workspace instruction files, installed role references, and task inputs. Record each source, applicability, version or approval, and access state. A missing root AGENTS.md file does not imply missing instructions; applicable user-provided instructions remain valid. Missing required skills, references, or approved inputs and conflicting instructions hold dependent work.

An optional read alternative is allowed only when the brief specifies its exact locator, material identity, approved version, purpose, method, preconditions, equivalent evidence, and return conditions in advance. Any alternate locator must be explicit and verified as the same material and version. Only pre-authorized, side-effect-free reads are allowed. Do not chain searches, guess paths, retry mutations, or change the environment, dependencies, or permissions. Immediately return missing required inputs, permission/target/ownership mismatches, partial changes, unknown state, and unauthorized, ambiguous, or failed alternatives to the Orchestrator. Report the initial failure, any alternative used, observed evidence and limits, and the dependent and independent work placed on hold. Orchestrator checks scope and valid evidence before deciding whether independent work may resume; unresolved required check failures continue to block acceptance.

A visual brief records the exact approved visual source, version, approval and access state, criterion IDs, required properties and comparison method, actual-output identity, revision, and comparison basis. An Implementer report is separate from a fresh QA comparison. Report each result as pass, mismatch, or unverified with evidence locations and limitations. Return new UI interpretations or unapproved substitutions for visual sources to the Orchestrator.

The resume brief preserves valid approvals for unchanged scope, completed work, failures, resolution evidence, valid and invalid evidence, remaining holds, and the next objective. The Orchestrator records changed facts and revalidates affected gates using resolution evidence. Do not repeat completed work. Preserve role, Git, QA revalidation, final Reviewer, acceptance, and commit boundaries.


Orchestrator verifies the absolute workspace/repository, branch or detached HEAD, HEAD, staged/unstaged/untracked state,
ownership, document approvals and committed planning documents before first start and restart.
The approved execution target must remain valid. Claude v1 supports current checkout execution and does not support
ARC-managed worktrees.

Execution-target choice and actual preparation precede formal drafting and saving of required specs/plans.
Initial design proposals may precede choice. Initial target preparation does not authorize Implementer; all applicable
approvals, complete documents, verified batch docs commits or valid absence, and final Git verification remain required.
Record planned document scope/paths and actual preparation separately, followed by actual drafting/save/approval and
commit results; preserve actual order and evidence gaps. Reuse a valid choice during document drafting and subsequent
implementation while scope and target remain unchanged. Authorized HEAD and dirty-state changes alone do not invalidate
choice; verify preservation and ownership. A changed scope or target requires fresh explicit choice before dependent
drafting or preparation and does not require document completion. Never fall back automatically.

Resolve the Git common directory (`git rev-parse --path-format=absolute --git-common-dir`) and keep one canonical record
at `<git-common-dir>/arc/handoff/<plan-or-task-slug>.md`, outside the working tree.
The slug is unique per plan: the dated plan filename stem, or a spec/task slug when no plan exists; never overwrite
another plan's record. Never stage it or store secrets there. Orchestrator updates the record after each accepted task
commit (task ID, SHA, state). Record approved document paths/versions/coverage/dependencies and approval evidence;
explicit target choice; prior and resulting Git state; document commit SHA/subject/files; task scope, ownership,
checks and limits. If a gate or record was late, record actual order and resolve forward; never claim retroactive
compliance.

The Implementer brief supplies absolute workspace, verified branch/HEAD, canonical record path, approved task/criteria,
exact file ownership, expected tests, dependency limits and blocked conditions. Restart brief: supply only verified
deltas and mark unchanged fields; `unchanged` means unchanged relative to the record file the fresh Implementer reads,
and every other brief field is in full. Implementer trusts Orchestrator verified prep rather than independently repeating
approval/Git evidence checks, reads fields marked unchanged, and stops on an actual observed conflict.
Tell Implementer that others share the repository and unrelated work MUST be preserved.

Roles report directly to Orchestrator. Do not delegate at depth 2. Orchestrator sequences dependent work,
resolves actual blockers and revalidates affected gates before resume. No automatic retry after unexpected Git or tool
failure.

If the record write is denied or unavailable, Orchestrator carries the full record inline in every Implementer brief (no
delta, no record-file `unchanged`) and states why; that satisfies the accessible-record requirement.
Do not delete it automatically.

## Task readiness at every assignment

Before each first start or restart, if an approved plan exists, link its current dependency/readiness record
(planning.md) in the canonical record and brief. Where plan omission is valid under existing rules, do not create a
plan or map solely to satisfy this linking duty; record the applicable omission judgment and rationale in the
canonical record and brief. Plan absence alone does not qualify for omission, and an unapproved required plan
cannot bypass its approval gate.

Before assignment, apply every readiness condition in
[planning.md, Dependency and readiness record](planning.md#dependency-and-readiness-record), including predecessor
checks, Orchestrator acceptance and verified focused commit or accepted no-change evidence. An Implementer completion report alone is insufficient. Verify the linked record is current and capacity and file ownership permit assignment.
Readiness supplements the full handoff gate and execution-target restrictions; it never waives them.
For authorized HEAD or state changes, refresh this record and affected briefs, verify preservation and ownership,
revalidate affected gates, and reassess readiness under planning.md and [commit.md](commit.md#shared-checkout-coordination).
Unexpected HEAD or ownership changes stop affected work for Orchestrator resolution and revalidation.

## Choice lifetime and reuse

Accepted task commits do not by themselves invalidate the initial execution-target choice for the same approved scope,
workspace, repository, and target; verify and reuse successful task commits without duplication.
On every first start and restart recheck actual state against the brief (workspace/repository identity,
branch or detached HEAD, HEAD, changes, ownership, approvals, document commits or valid absence); reuse never waives a
gate. Reuse the choice only while its evidence is accessible and valid. If scope, workspace, repository, target,
or approved branch candidate changes, or a failure means the old target cannot be trusted, obtain a fresh explicit
choice before dependent drafting or preparation; reselection does not require document completion. Authorized HEAD and dirty-state changes alone do not
invalidate it; record them and verify they match approved work. State mismatches block editing until Orchestrator
revalidates the gate; resolution does not by itself require a new choice unless it invalidates the old target;
never fall back automatically (apply the Explicit choice rule). Inaccessible records or unclear ownership block editing;
prior conversation cannot substitute for evidence.

## Authorization continuity

Use [planning](planning.md#authorization-and-scope) for approval evidence and scope classification. Record that evidence,
its scope, criteria, constraints, and valid document-depth omissions alongside execution-target choice and preparation.
Reuse valid authorization for the same approved scope and target. A restart or new role assignment does not require
repeat approval. Reuse never waives verification of actual workspace/repository, branch or detached HEAD, HEAD,
changes, preservation, ownership, applicable documents, and preparation evidence by Orchestrator. Refresh actual state
and affected briefs for authorized changes; they alone do not invalidate approval. Implementer trusts the verified brief
under its profile. Material scope/method/risk changes and invalid target evidence hold affected work; resolve using
planning and the choice-lifetime rules above. Report the missing condition and resume evidence rather than asking
for an approval already valid for that scope.

Before any exception judgment, Orchestrator reads [Risk-scaled execution](verification.md#risk-scaled-execution) and [planning](planning.md) for the full risk and plan-depth conditions.

## Common handoff gate

Before every Implementer first start/restart, Orchestrator passes the full gate:
applicable approvals/artifacts or valid omissions, explicit execution-target choice
or verified reuse, intended accessible repository/workspace, actual Git identity/state, preservation/ownership,
verified document commits or valid absence, and no unresolved failure/partial completion.
Missing evidence, mismatches, unclear ownership or unresolved preparation block handoff and require Orchestrator
resolution and full revalidation. Handoff owns the evidence fields, canonical handoff record, restart brief, choice lifetime
and reuse. Implementer trusts the Orchestrator-verified brief and reports actual conflicts under its self-contained profile;
never replace its local guards with a requirement to load Orchestrator procedures.
Depth-2 roles use the supplied workspace and report path/state conflicts; they cannot create/switch workspaces or
branches. The same conditions apply before an Orchestrator direct edit.
Claude v1 supports the current checkout only; obtain the explicit current-branch or task-branch choice and complete
approved document preparation under [handoff-prep](handoff-prep.md).
ARC-managed worktree execution is unsupported; report an isolated worktree request before dependent work.


## Implementer TDD and constraints

Before feature, bug-fix, or behavior edits, Implementer follows local `test-driven-development` unless the explicit
ARC exception applies; the Implementer profile holds Implementer's full TDD rules. TDD is waived only when every small,
low-risk criterion (Risk-scaled execution) and every plan-skip criterion (Orchestrator direct path) holds.
Before Implementer starts,
Orchestrator records the scope, why every criterion is met, acceptance criteria, and focused verification in the brief.
An explicit user or task-specific TDD request overrides
this waiver. For qualifying tasks only, this exception takes precedence over the generic trigger in the local reference;
do not change that skill. Ordinary multi-step or significant/high-risk work is not eligible. The waiver skips only
RED-GREEN steps; focused checks and risk-appropriate QA/Reviewer remain, and do not claim TDD was followed.
If a constraint blocks a required TDD step, Orchestrator records the
decision in the brief/plan and obtains any required human approval; internal approval is not a substitute.
Non-behavior documentation/configuration uses only a specifically authorized exception recorded in the brief; do not
generalize it to behavior work.


## Orchestrator direct path for small tasks

This path does not waive explicit execution-target choice: before the first edit, record the user's choice or verified valid reuse. Approval of the edit scope alone does not select the execution target.

Orchestrator may edit directly only when every small, low-risk criterion (Risk-scaled execution) holds.
Every plan-skip criterion must also hold: one local change, no dependent stages, no cross-component shared state,
lifecycle, or integration-order concerns, and one focused verification path. Significant, architectural,
ordinary-behavior, unclear-risk work and edits overlapping a running Implementer's assigned files are ineligible.

Significant risk is defined in Risk-scaled execution and excludes work from the Orchestrator direct path;
do not infer eligibility from a small file count.

Before editing, Orchestrator records a scope record (not a brainstorming design) with scope and files,
why every criterion holds, acceptance criteria, and focused verification. Apply authorization in
[planning](planning.md#authorization-and-scope): an existing sufficiently specific user request can approve
that scope; no duplicate approval is needed. Otherwise present the scope record to the user and obtain explicit
approval before editing. Silence, an ambiguous response, or approval of other work is not approval.
Orchestrator then verifies the same handoff gate as a Implementer first start: explicit execution-target choice or valid
reuse, accessible intended workspace and repository, branch or detached HEAD, HEAD, staged/unstaged/untracked state,
preservation and ownership, and no unresolved failure or partial completion. Read this reference
and [handoff preparation](handoff-prep.md) before checking this gate.

Orchestrator edits only the approved files, preserves others' edits, and makes surgical changes without unrelated
refactoring or unapproved dependencies. Behavior edits follow the Implementer TDD rules and applicable recorded waiver
criteria; an explicit user or task-specific TDD request still requires test-driven-development.
Do not claim TDD under a waiver. After editing, Orchestrator records changed files, runs focused checks,
connects each acceptance criterion to evidence, and reports unverified scope. Orchestrator is not an independent
reviewer of its own edits; assign QA when evidence is incomplete. If scope expands, risk becomes unclear,
or any criterion fails, stop editing, record completed changes, and return subsequent edits to the normal Planner/Implementer
flow. A failed focused check or a QA finding routes the correction to Implementer, and it is rechecked; Orchestrator does not
self-correct.

Like other plan-skip paths, there is no automatic task commit; commits follow applicable guidance and user requests.


## Cooperative CLI verification handoff

For the supported spec+plan path, the verification handoff includes the registered task contract, exact check descriptor,
task/final scope, `status.changeFingerprints`, independent actor attestations, intent ID, result messageRef and verdict.
An externally authorized role performs each check/review after `prepare`, and records the actual result through `result`.
CLI records do not authenticate identities or prove actual agent policy compliance.

When scope, documents or approvals change, inspect `affectedTaskIds` and the dependency chain, preserve earlier approval and
result records, and hand off new approvals and contracts for affected tasks. Do not reuse an old passing check for a different fingerprint.
Link failed findings to the assigned Implementer's resolution evidence and QA rechecks for that change version. Only final overall Reviewer
findings use Implementer→Reviewer revalidation. Do not add Reviewer as a prerequisite for individual task acceptance or commits.
Follow [verification.md](verification.md#verification-lifecycle-in-the-cooperative-cli) for detailed fields and hold conditions.
An unsupported no-plan/omission path does not imply a policy violation or a requirement to write documents.

[ARC role policy: contract begin]
Generated from lib/policy/role-policy.json; do not edit this managed section manually.
- [git.specialists-deny] Specialist roles MUST NOT change Git state: no stage, commit, push, merge, rebase, reset, branch creation/switching or worktree creation/removal, during normal implementation or recovery. An explicit Orchestrator assignment cannot authorize these actions; return them to Orchestrator. Read-only Git inspection remains allowed within the assigned scope.
- [role.implementer-implementation] Edit only assigned, approved files and run focused checks under the existing TDD contract. Report changed files, RED/GREEN or authorized exception evidence, results, limits and follow-up. Do not plan, independently QA/review your own work, accept the task or declare overall completion. Git changes remain forbidden even when implementation succeeds. Include the exact approved visual source, version, approval and access state, criterion IDs, required properties and comparison method, and actual-output identity, revision and comparison basis in Implementer and fresh QA handoffs. Record each visual result as pass, mismatch or unverified with accessible evidence and limits. Implementer self-report does not replace fresh QA and its actual comparison. A missing output-to-revision link is unverified; record a visible difference separately as mismatch, without inferring current branch UI status. Hold the affected visual claim for Orchestrator if source/output is missing, evidence is inaccessible or an interpretation is unapproved; do not silently substitute or redesign.
- [review.significant-no-plan] For significant/high-risk work without a plan: Implementer → QA and required QA rechecks → Reviewer of the final full change → Orchestrator acceptance. MUST NOT omit Reviewer because no plan exists. This creates no new plan obligation.
- [review.significant-plan] For significant/high-risk plan work: each task uses Implementer → fresh QA as required → Orchestrator acceptance and focused commit. Reviewer reviews the final full change once after all tasks are accepted and required QA is complete. Reviewer is NOT a per-task or per-commit required gate. Preserve required checks and necessary finding rechecks.
- [review.final-plan-recheck] For final overall Reviewer findings on plan work, including behavior findings, use Implementer → Reviewer without QA reassignment; repeat until resolved. This exception applies only at the final plan stage. Preserve required QA and QA failure rechecks before initial final review and outside this exception.
- [platform.claude] Existing per-role tool allowlists reduce available tools; Bash and role contracts are not a filesystem sandbox. A role-scoped Git guard is a separate integration and is not supplied by these policy sections alone.
[ARC role policy: contract end]

## Initial Implementer assignment through the cooperative CLI

In approved plan mode, Orchestrator performs the following sequence. All mutation commands pass JSON through stdin with
`node "$ARC_RUNTIME_ENTRY" <command> --cwd "$ARC_CHECKOUT" --workflow "$ARC_WORKFLOW_ID" --input -`.
Resolve `ARC_RUNTIME_ENTRY` from the actual ARC skill directory selected by the installation resolver:
`<target-home>/skills/arc/runtime/cli.mjs`. Use the loaded skill's location, including a custom target home;
do not guess the default home or use a package, checkout or cache entry. Pass the resolved path, checkout and
workflow ID as separate argv values when using a process API. In a shell, assign values safely and double-quote
these variables; never interpolate paths into executable shell text or use `eval`.
Query `status` without `--input`.

The entry preserves the cooperative state path in the selected checkout's Git common directory. Installing or
updating the entry does not migrate state or renew approvals. Runtime/hash, target, actor and revision checks still
apply: runtime drift holds existing evidence; obtain the required current evidence and approval through the
existing recovery procedure. A new workflow cannot retroactively validate earlier execution.

1. Prepare the docs-only commit of the approved spec and plan, and verify the exact document set, objects and current files.
   Perform `init`, approval `record` and `prepare` only after this commit verification, even when user approval preceded the document commit.
2. After document commit verification, pass `mode: "plan"`, `actor: {id: "operator"}` and `selection: {messageRef, contentHash}` to `init` at the final target HEAD.
3. Use `record` to persist the user approval attestation already confirmed. The input is
   `{requestId, expectedRevision, actor, evidence: {kind: "approval", messageRef, data: {approvalVersion, documentVersion, documents}}}`.
   `documents` contains exactly the spec and plan, each with `{kind, path, gitPath, contentHash, approvalRef, commit}`.
   `contentHash` is `sha256:<hex>`, and `approvalRef` must match the approval `messageRef`.
   On HEAD drift, record a fresh target observation and renewed approval instead of reconnecting an earlier intent.
4. Pass `{requestId, expectedRevision, actor, operation: "assign-agent", taskId, arguments: {role: "implementer", paths, operations: ["edit"], documents, approvalRef, approvalVersion, documentVersion, correlation}}` to `prepare`.
   Absolute `paths` must be inside the checkout. Confirm `allow`, `persisted: true` and the persisted intent.
5. Invoke the native assignment with the task, scope and correlation from the persisted intent.
6. Pass `{requestId, expectedRevision, actor, intentId, result: {status, messageRef, data: {correlation, taskId, agentId}}}` to `result`.
   `intentId` is the prepare requestId. Distinguish success as `succeeded`, failure as `failed`, uncertain execution as `unknown` and a response mismatch as `mismatch`.
   Success requires the returned agent ID. `unknown`/`mismatch` causes a hold; stop duplicate assignments and investigate the actual result.

Approval and assignment results on this path are `operator-attested`. They do not authenticate native identities or verify platform events.
The CLI cannot block direct calls outside it, and a new workflow cannot legitimize omitted past execution. Existing trusted adapter provenance requirements remain in force.


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
