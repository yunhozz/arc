<a id="verification-and-acceptance"></a>
# Verification and acceptance

Behavior work follows meaningful failing test observation → minimal implementation → focused success → project suite. Report skill/test constraints before edits. Waivers need recorded narrow/understood/reversible scope, no dependent/cross-component lifecycle stages and one check path. Docs exceptions permit named structural checks only, never TDD claims. Report side effects within scope. Reviewer lacks Bash and requests runtime checks. Local tests prove neither remote models nor effort application. Policy prose needs independent role/approval review; text presence proves no compliance. Unexpected failure triggers diagnosis/holds; expected RED grants no unrelated repairs.

Read before verification design, QA/Reviewer assignment, correction rechecks or UI acceptance. QA/Reviewer use their profiles and brief-cited sections only. Design companions differ from UI acceptance.

**Evidence verdict:** Criteria are proven, unmet or unverified. Passing runs/reports/dispositions never convert unverified to proven; retain gaps.

<a id="visual-evidence-and-adjudication"></a>
## Visual evidence and adjudication

Each criterion needs exact approved source/version/approval/access, IDs/properties/method and output-revision linkage. Implementer reporting does not replace fresh QA. Record pass/mismatch/unverified and connect to criterion verdicts; pass needs accessible supporting evidence. Missing linkage is unverified; visible difference is mismatch, separately, without inferring current branch UI. Inaccessible materials/missing interpretation approval hold comparison.

Policy/generated/manifest checks prove structure, not role behavior, installed builds, Claude Code CLI compliance or fidelity. Report changes/exclusions/run-omitted checks/criterion evidence-limits/platform availability. Separate baseline failures; independent progress relaxes no checks.

<a id="risk-scaled-execution"></a>
## Risk-scaled execution

Edits belong to Implementer except the [small direct path](handoff.md#orchestrator-direct-path-for-small-tasks). Orchestrator determines behavior/risk/minimum meaningful checks.

| Risk | Minimum flow |
|---|---|
| Small, low risk | Implementer or direct edit → Orchestrator focused checks → acceptance |
| Ordinary behavior | Implementer → independent QA → acceptance |
| Significant/high risk, no plan | Implementer → QA/rechecks → final full-change Reviewer → acceptance |
| Significant/high risk, plan | Per task Implementer → required fresh QA → acceptance/commit; final independent whole-change Reviewer once after all accepted tasks/required checks/rechecks |

Ordinary/significant tasks need fresh QA before acceptance. Low risk requires narrow/understood/reversible/focused-verifiable work. Ordinary behavior fails these without significant triggers. Shared role/behavior contracts/state, lifecycle/integration order, security/permissions, data loss/migration, public interfaces and costly install/deploy/rollback are significant. Substantial behavior/contracts are significant regardless of file count. Unclear risk requires investigation/higher flow. Environment failure waives no check or depth judgment.

- Task boundaries alone add no QA/review. Reviewer is never a plan-task/commit prerequisite. Plans review once at final relevant state after task acceptances/checks; no-plan Reviewer follows QA before acceptance.
- Preserve specific commitments. Risky unverified dependencies need QA/resolved or explicitly dispositioned findings before implementation.
- Reuse evidence only for matching scope/state/independence/freshness/flow position. Changes/failures/missing-conflicting evidence invalidate affected reuse.
- QA independently checks without edits. Reviewer performs no QA/planning/editing/delegation/completion decisions. Orchestrator routes fixes to Implementer and required QA rechecks; direct-check failures return to normal flow. Accept after findings/gaps resolved or dispositioned.
- Fresh-per-task applies to Implementer/QA, not Reviewer. Reuse Reviewer only with independence, valid context and refreshed scope/target/evidence, never an old verdict or waived timing/coverage.

Record which risk/instruction/approved obligations each check satisfies. Do not automatically assign QA/Reviewer for clear low-risk scope with sufficient evidence and no requirement. Metadata counts alone prove no significance; one permission/loss rule may. Vague file deletion is not low-risk evidence; reclassify installer/manifest impacts. Confirm cleanup targets unused, required materials intact, ignore patterns scoped and diff approved before focused-check-only acceptance.

Separate environment/code failure and report exact limits/gaps. Use Planner/Scouter only for unresolved planning/discovery. Reviewer covers substantial correctness/factual/security/data/interface risks. Orchestrator assigns support as needed. Claim only verified outputs. Read cited `references/test-driven-development.md`, preserving exceptions.

<a id="final-plan-reviewer-correction-loop"></a>
### Final plan Reviewer correction loop

Only final overall Reviewer findings on plan work, including behavior, follow Implementer → Reviewer without QA reassignment until resolved. One initial full review permits necessary rechecks. Before it, risk checks/QA failures/unmet criteria still need Implementer → QA. No-plan flow remains unchanged.

Expanded scope/separate obligations/gaps hold affected work for resolution/approval. Orchestrator assigns/accepts; Reviewer stays read-only without QA/acceptance. Never present old QA as post-fix execution. Report actual actor/target/check/result/limits only.

<a id="evidence-after-plan-history-rewrite"></a>
## Evidence after plan history rewrite

Verify new HEAD/approved plan content-version/old→new SHAs, descendant implementation/task boundaries and remaining staged/unstaged/untracked state. Preserve chronology/recoverable contents. New content in old commits proves no early approval.

SHA change alone invalidates no entire evidence set. Determine whether exact-HEAD/document/policy evidence links to new state. If not or semantically affected, repeat affected checks/rechecks. Preserve runtime/exact-state rules; never rewrite old fingerprints to suggest execution at new HEAD. Refresh briefs/gates before dependencies. Structure proves neither live compliance nor successful replay.

<a id="task-acceptance-and-final-plan-acceptance"></a>
<a id="reviewer-timing-and-task-acceptance"></a>
## Task acceptance and final plan acceptance

Task acceptance differs from final verification/acceptance. Connect criteria/observations/current checks/findings, not checkboxes/reports/passing commands alone. Use fresh QA where required or low-risk focused checks. Same-task rechecks default to current QA while scope/workspace/ownership/context remain valid.

Do not delay independently acceptable tasks solely for final-only checks or defer currently required checks to accept early. State final integration scope/timing separately. Whole-plan Reviewer is final verification; task commits prove no unperformed final checks. Orchestrator decides final acceptance with QA/Reviewer/integration evidence/findings and unverified/disposition records. Shared evidence must satisfy all reuse rules.

Committed-plan final Reviewer findings need a follow-up task/planning/approvals. Keep corrections uncommitted; refresh committed state plus uncommitted diff/files in Reviewer artifacts/briefs. Reuse/assign independent Reviewer and repeat Implementer → Reviewer until resolved, then accept/commit one focused follow-up. Final QA findings still use Implementer → QA. No automatic amend/reset/duplicate originals; scope growth retains planning/approvals.

Orchestrator writes approved-base final base..HEAD diff/changed-file list to `<git-common-dir>/arc/review/<slug>.diff`, using handoff slug and absolute brief citation; inline if small/write denied. Reviewer reads artifact, not Git commands, stating limits.

<a id="ui-browser-acceptance-checks"></a>
### UI browser acceptance checks

QA has no browser tool: launch/exercise apps/URLs through Bash only with assigned criteria/cited prerequisites, following installed browser-skill CLI guidance.

Briefs must supply workspace, existing launch command/URL, account/test-data scope, allowed interactions and this section's accessible citation. Use existing approved environment/tool/browser-skill instructions. No source/docs/tests/config edits, dependencies or environment changes. Missing prerequisites/tools/environment leave exact reported limits/unverified criteria.

For each criterion record command/URL, test state/viewport or inapplicability, interactions, expected/observed results and evidence. Startup/page-load/static checks alone prove no complete UI. Clean only QA-created processes/sessions; preserve shared services/sessions.

<a id="criterion-evidence-and-finding-handoff"></a>
### Criterion evidence and finding handoff

Report every criterion by ID or wording: method/scope, run status, evidence, verdict, unverified reason/remaining scope. Run status: passed/failed/not run/environment blocked. Verdict: proven/unmet/unverified. Connect conditions/expectations to actual observations; partial/out-of-scope/missing/environment gaps stay unverified. PASS means run status only. Structure proves structure only.

Current-task failures/unmet criteria default to current Implementer/current QA under coordination context/boundary/amendment rules; findings alone create no task. Before Reviewer, rerun reproduction/invalidated checks, reporting actor/target/results/limits and prior finding resolved/unresolved/unverified with evidence. Repeat Implementer→QA if unresolved; QA reuse is no stale-evidence reuse. Environment/missing/out-of-scope are gaps, not presumed code defects; Reviewer cannot replace QA.

Reviewer behavior findings report criterion/expectation/problem/source/reproduction/evidence, separating source inference/execution. No QA execution. Outside final-plan exception route Implementer→QA; other Reviewer rechecks depend on scope/independence. Continue source review of structure/design/facts/security; observable security/interfaces may need both QA/Reviewer.

Accept from criterion verdicts/findings/rechecks/gaps, not overall run status. Disposition never proves unverified. Low-risk work also links each criterion to focused evidence.

<a id="completion-continuity"></a>
## Completion continuity

Once approval/depth/target/handoff hold, continue execution/correction/reverification/required QA-Reviewer/disposition/acceptance/report. Preserve timing without new task-level gates. Reports/probes/commands never complete remaining approved scope. Do not make authorized execution an optional offer awaiting response. Probe-only ends at question/evidence/limits; combined work follows planning. Omission changes neither risk nor acceptance. Hold only actual affected conditions and report resume requirements. Structure proves no live compliance.

<a id="verification-lifecycle-in-the-cooperative-cli"></a>
## Verification lifecycle in the cooperative CLI

Supported `workflow` is approved complete spec+plan. No-plan/small-task/omission is `cooperative.unsupported`, not policy violation/new documents. CLI executes no checks/Reviewer. Actors/results/verdicts are `operator-attested`, not identity/independence/semantic/enforcement proof.

1. Orchestrator (`actor.role: "orchestrator"`) registers through `record`/`acceptance-evidence` with `data: {kind: "task", task: {...}}`. Task includes `id`, absolute `paths`, `criteria`, `requiredChecks`, `dependencies`, `approvalRef`, `approvalVersion`, `documentVersion`, `scopeVersion`, `targetVersion`. Pending-only registration is not acceptance/commit. Descriptor: `{executable, args, cwd, env, outputs}`; executable/cwd/outputs absolute, cwd/outputs inside workspace. No Reviewer in task checks.
2. `status` observes `changeFingerprints.tasks[taskId]`/`changeFingerprints.final` independently from read-only Git inventory/index and current regular-file bytes/modes/deletions. Task covers owned paths, final the repository. Symlinks/submodules/unmerged indexes hold. This is no atomic observation/execution sandbox. RuntimeHash drift stays stale/hold without automatic stored-version update/migration/reapproval.
3. Check preparation: `operation: "check"`, `taskId`, `arguments: {scope: "task", actor: {id, role: "qa"}, descriptor, changeFingerprint, findingIds?}`. QA identity attestation must differ from Implementer/Orchestrator; cross-task QA/Implementer reuse is rejected. Descriptor exactly matches registration. After durable intent, execute only existing authorized scope.
4. `result`/`reconcile` records `intentId`, `{status, messageRef, data}` with same actor/descriptor/scope, taskId where applicable, fingerprint and `verdict: "proven" | "unmet" | "unverified"`. Even succeeded/proven applies only to that version. It replaces neither semantic proof nor acceptance. Failed/unknown/mismatch/unverified is not passing evidence. Preserve history.

Failed checks/reviews leave findings. Open separately via `data: {action: "open", id, checkId, message}`. After fixes record `data: {action: "resolve", id, actor: {id, role: "implementer"}, changeFingerprint}` plus evidence messageRef. Actor must be assigned to the task or relevant overall task. Resolved becomes closed only after later prepare `findingIds` and same-version successful revalidation. Prior QA failures retain Implementer→QA.

Final review uses `operation: "review"`, `scope: "final"`, `actor.role: "reviewer"`, `descriptor: {kind: "source-review", paths: [...]}` without taskId. Initial final review needs all tasks accepted/current required QA, never task acceptance/commit prerequisite. Plan-final findings repeat Implementer resolution→Reviewer without QA reassignment; old QA is not subsequent-fix execution. Separate unresolved QA remains.

Scope/document/approval records preserve history. `data.affectedTaskIds` invalidates those tasks/dependents and task/check/acceptance evidence; omitted IDs hold all. Final evidence becomes stale. Preserve unaffected independent evidence. Orchestrator determines semantic impact. Affected tasks need new current-scope approval/contracts before preparation, not revived old approvals; fresh checks/reviews/revalidation too. Current evidence supersedes failures without deletion. Acceptance/commit/completion stay Orchestrator decisions.

<a id="task-acceptance-and-focused-commit-reconciliation-in-the-cooperative-cli"></a>
### Task acceptance and focused commit reconciliation in the cooperative CLI

Plan-mode `prepare` supports `operation: "accept"`/`operation: "commit"`. Acceptance attests `actor.role: "orchestrator"`, taskId and arguments messageRef/same criteria/current exact QA checkIds/all findingIds/current fingerprint. Latest required descriptors must be passed/proven and findings closed by fixes/QA. Successful attestation marks accepted; reports/checks alone do not. `operator-attested` means operator confirms semantics/identity.

Acceptance pins actual index tree/staged diff/paths/fingerprint. Stage approved paths beforehand and confirm QA for that index. Unrelated/other-task paths or in-scope unstaged/untracked changes hold. Code cannot identify semantically unrelated same-file hunks; Orchestrator reads diff.

Commit preparation references `arguments: {"acceptanceId": "acceptance requestId"}`. Check current approval/contract/QA/findings/index match acceptance and persist expected parent/tree/paths/residual paths. CLI stages/commits nothing. Orchestrator makes one matching focused commit.

Submit intentId/`actor.role: "orchestrator"` and `result: {"status": "succeeded", "messageRef": "actual result evidence", "data": {"commit": "full OID"}}` through reconcile/result. CLI rereads local object/parent/tree/paths/HEAD/index/residual changes. Only complete match updates target HEAD/committed. Preserve failed/unknown/mismatch/history; never arbitrary target updates. Same request/completed intent permits no repeated effect. Inspect/resolve/reconcile existing intent after failure.

Never rewrite QA fingerprints after commit. Separate post-commit observations detect changes. Final review needs current task evidence/final fingerprint. RuntimeHash drift keeps existing stale/hold without automatic version update.

[ARC role policy: contract begin]
Generated from lib/policy/role-policy.json; do not edit this managed section manually.
- [git.orchestrator-accept-commit] Only Orchestrator accepts work and performs Git mutations. One approved top-level plan task becomes one focused implementation commit after criteria, required checks and findings are satisfied. Orchestrator accepts, then commits without separate user commit approval. Reports, passing checks and Reviewer opinions do not replace acceptance. Preserve unrelated changes and ownership; verify the resulting SHA, content, HEAD and remaining changes. Existing small-task direct and plan-omission paths remain unchanged.
- [review.significant-no-plan] Significant/high-risk work without a plan follows Implementer → QA and required QA rechecks → Reviewer of the final full change → Orchestrator acceptance. Do not omit Reviewer because no plan exists. This adds no plan obligation.
- [review.significant-plan] Significant/high-risk plan work follows Implementer → required fresh QA → Orchestrator acceptance and focused commit for each task. After all tasks are accepted and required QA is complete, Reviewer reviews the final full change once. Reviewer is not a per-task or per-commit gate. Preserve required checks and necessary finding rechecks.
- [review.final-plan-recheck] Final overall Reviewer findings on plan work, including behavior findings, follow Implementer → Reviewer without QA reassignment until resolved. This exception applies only at the final plan stage. Preserve required QA and QA failure rechecks before the initial final review and outside this exception.
- [planning.plan-amend] Mechanical plan progress records during approved execution need no new user approval. Changes to goals, scope, criteria, method, risk, dependencies or required verification need revised-version approval and preparation before affected work. In both cases Orchestrator amends the original planning-document commit at a safe boundary, with no separate document or fixup commit. Preserve actual approval chronology, recoverable old/new content, hashes, versions and SHA mappings; never authorize past work retroactively. Rewrite only unpublished, unshared local linear history with clear ownership and no merges. Unknown publication/ownership, unexpected state or replay conflicts stop rewriting; no force push or fallback document commit. Preserve implementation task boundaries and revalidate affected evidence. Follow planning, handoff-prep, commit and verification for the full contract.
- [platform.claude] Existing per-role tool allowlists reduce available tools; Bash and role contracts are not a filesystem sandbox. ARC supplies no native observer hook or Bash Git guard; Git restrictions remain prompt-level role contracts.
[ARC role policy: contract end]

<a id="external-operations-and-recovery-in-the-cooperative-cli"></a>
## External operations and recovery in the cooperative CLI

Three phases cover state/documents/assignment; scope/verification/acceptance/focused commits; external approval/results/audit recovery. Inspect nine areas/limits with `status.support`. Support is spec+plan `plan`, not no-plan/omission. CLI executes no native/provider/push/merge/deploy/publish calls.

Operator-confirmed approvals/results are `operator-attested`, `nativeVerified: false`, `remoteVerified: false`; no outside-call blocking or independent remote verification.

Record already confirmed external approval using `evidence: {kind: "external-approval", messageRef, data: {operation, scope, descriptor}}`. `scope` is unique absolute checkout paths. Local commit approval grants no external approval. Record exact action/scope/target and all descriptor fields:

| operation | descriptor fields |
|---|---|
| push | repository, destination, refspec, sourceOid, expectedRemoteOid |
| merge | repository, changeRef, targetRef, expectedTargetOid |
| deploy | service, project, environment, artifactId, destination |
| publish | service, namespace, name, version, artifactHash, destination |

Git OIDs are full lowercase 40/64-character hex; artifactHash is `sha256:<64-hex>`. Without remote observation OIDs are asserted expectations, not verified state. Destination is secret-free. No URL userinfo/query/fragment/password/token/credentials. Recognized secrets are rejected before persistence, but arbitrary-string secrecy cannot be guaranteed.

`prepare` accepts `{requestId, expectedRevision, actor: {id, role: "orchestrator"}, operation, arguments: {approvalRef, scope, descriptor}}`; approvalRef matches external approval messageRef. Persist only exact approval/scope/target/runtime versions with no unresolved effects. After `allow`/`persisted: true`, Orchestrator executes separately approved scope; CLI expands no authority.

`result`/`reconcile` accept `{requestId, expectedRevision, actor, intentId, result: {status, messageRef, data: {operation, scope, descriptor}}}`, with prepare requestId as intentId. Mismatch/unknown/stale outcomes hold while preserving attestations. After interruption inspect intent/`state.requests`/`state.audit`/`state.results` through `status` and investigate actual effects. Reconcile that same intent, not fresh preparation or replayed approvals.

Cancellation also requires `notExecutedEvidence: {messageRef}`; approval remains consumed. No automatic update/migration/renewed permission to fix drift. Report holds. Succeeded results remain attestations, not remote proof. `audit` links request→decision→intent→result→resolution but is locally editable, not tamper-proof. Never retry uncertain external outcomes.
