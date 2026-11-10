<a id="handoff-contract"></a>
# Handoff contract

Orchestrator reads this before every first-start or restart preparation; Implementer trusts the verified brief and profile and reads only cited sections. Initial preparation follows [handoff-prep](handoff-prep.md).

<a id="instruction-sources-bounded-read-recovery-visual-evidence-and-resumption"></a>
## Instruction sources, bounded read recovery, visual evidence and resumption

Keep shared brief field order, recording source/status within fields. Distinguish user instructions, discovered workspace instructions, installed references and inputs by source/applicability/version or approval/access. A missing root AGENTS.md does not negate user instructions. Missing required skills/references/approved inputs and conflicts hold dependent work.

Optional alternatives need exact locator, material identity, approved version, purpose, method, preconditions, equivalent evidence and return conditions pre-authorized in the brief. Verify alternate locations identify the same material/version. Only side-effect-free reads; no chained search, guessed paths, mutation retries or environment/dependency/permission changes. Return required-input omissions, authority/target/ownership mismatches, partial changes, unknown states and unapproved/ambiguous/failed alternatives immediately. Report first failure/alternative/observations/limits and held dependent/independent work. Orchestrator validates scope/evidence before independent release; unresolved required checks still block acceptance.

Visual briefs include exact approved source/version/approval/access, criterion IDs/properties/method and actual-output identity/revision/basis. Implementer reports differ from fresh QA comparison. Report pass/mismatch/unverified with evidence/limits; return new UI interpretations/substitutions.

Resume briefs preserve valid approval for unchanged scope, completed work, failures and their resolution, valid and invalid evidence, holds and the next objective. Record changed facts and revalidate gates without repeating completed work. Preserve role/Git/QA/final Reviewer/acceptance/commit boundaries.

<a id="workspace-handoff"></a>
## Workspace handoff

<a id="checkout-approval"></a>
### Checkout approval

Before every Implementer start or restart, verify access to the supplied absolute workspace and its intended repository. Record the actual path, branch or detached HEAD, HEAD, and staged, unstaged and untracked state. An inaccessible or wrong repository or unresolved HEAD stops work; do not automatically initialize Git or switch repositories.

The first required spec/plan draft follows choice and verified source evidence and precedes actual preparation; saving follows verified preparation. Initial design may precede choice. Preparation alone authorizes no Implementer. All approvals/full documents/verified batch or valid absence/final Git checks remain. Separate planned scope/paths, actual preparation and drafting/save/approval/commit, recording chronology/gaps.

After initial design approval record explicit selection: current checkout, new task branch from verified base there, or managed worktree/task branch. Without choice/valid reuse, wait. Reuse through unchanged-scope/target drafting/implementation. Authorized HEAD/dirty changes alone do not invalidate choice; verify preservation/ownership. Changed scope/target requires fresh choice before dependent drafting/preparation without waiting for full documents. Never fall back automatically.

<a id="implementer-handoff-gate"></a>
### Implementer handoff gate

Orchestrator verifies all before start/restart:

1. Applicable design/spec/plan approvals/artifacts or valid omissions; for Spike, approved question/method/scope/criteria/constraints. Verify full current document set/versions/dependencies/order and no unfinished applicable documents. Future implementation artifacts are outside probe approval.
2. Explicit initial choice or verified valid reuse.
3. Accessible intended absolute workspace/repository.
4. Actual branch/detached HEAD/HEAD/change state/preservation/ownership. Preserve unrelated staged files; they block until preparation is resolved.
5. Verified planning-document commits or required-none/produced-none with depth reasons.
6. Final path/branch/HEAD/state after mutations; no unresolved failure/partial completion.
7. Brief preparation/final-verification facts/evidence.

Before the first direct edit, use approved scope records and the same gates. Any failure/missing condition blocks handoff, not authorized read-only investigation/preparation/recovery. Revalidate changes to approved content/target/branch/HEAD/state. Implementer reports actual conflicts under its profile; Orchestrator resolves and repasses gates.

<a id="handoff-evidence"></a>
### Handoff evidence

One canonical record includes:

- Document-save gate/results, choice readiness and each mutation's pre-evidence/post-result.
- Absolute workspace, prior branch/detached HEAD/base/state/preservation/ownership, checkout approval/evidence/selected path.
- Final branch, attempted creation/switch results and post-selection path/branch/HEAD/state.
- Document SHA/message/paths/approved content; reused versus batch commits or valid absence/depth rationale.
- Absolute approved artifacts, full set/versions/coverage/dependencies/order and no pending writing/approval.
- Final verification, failures/partial completion/recovery and each start/restart's approval/choice/reuse.
- Each plan task ID and current Implementer conversation ID, status, last result and reuse/replacement decision. Before same-task replacement, record the prior ID and status, allowed reason and supporting evidence; hold if the reason is not established. Record the returned ID after a successful initial or replacement call, and reconcile an uncertain call result before another assignment.
- Worktree source/target paths/common directory/base/branch/name/returned path/app attachment/operationId/registration/source preservation/transfer evidence. No automatic recreation/cleanup/archive.

Give all five roles the same actual workspace/selected checkout, preparation evidence and absolute artifacts. Roles stay there and report missing/inaccessible/conflicting paths/unexpected branches before dependent work, never create/switch workspaces/branches. Tell Implementer others share the repository and unrelated work MUST be preserved.

<a id="task-readiness-at-every-assignment"></a>
## Task readiness at every assignment

Link current approved-plan readiness in canonical record/brief before every start/restart. Valid omission records judgment/reasons, not a new plan/map solely for linking. Absence alone permits no omission or bypass of required-plan approval.

Apply all [planning](planning.md#dependency-and-readiness-record) conditions: predecessor checks/Orchestrator acceptance/verified commit or accepted no-change. Reports alone are insufficient. Verify current records/capacity/ownership. Readiness supplements, never replaces handoff/target gates. Authorized HEAD/state changes refresh records/briefs/preservation/gates and [shared-checkout](commit.md#shared-checkout-coordination) readiness. Unexpected HEAD/ownership stops affected work for resolution.

<a id="choice-lifetime-and-restart-record"></a>
<a id="choice-lifetime-and-reuse"></a>
## Choice lifetime and restart record

Reuse only for unchanged approved scope/workspace/repository/target with accessible valid evidence. Every start/restart compares actual identity/branch/detached HEAD/HEAD/changes/preservation/ownership, approvals/artifacts, document SHA/message/paths/content or absence and final state with the brief. Reuse waives none of gates 1–7.

Unchanged-document restarts reuse valid commits/choice with fresh state checks. Accepted task/docs commits and authorized implementation/dirty changes alone invalidate no choice; record matching work/ownership/target. Authorized worktree transfers also preserve reuse. Creation base remains evidence, not a permanent target HEAD constraint; source-preservation/unexpected-state checks remain. Link plan version/task ID/commit content-validity/current Git/ownership in restart brief. Never duplicate successful commits or confuse task commits with document preparation; do not repeat valid docs preparation.

Changed scope/workspace/repository/target/candidate needs fresh choice before dependent work. Failures invalidating target trust need new choice after resolution. Resolution alone needs none if choice remains valid. Mismatches/unresolved failures hold edits through full revalidation; never fallback.

Maintain one accessible initial canonical record, not a separate service. Resolve `git rev-parse --path-format=absolute --git-common-dir`; write `<git-common-dir>/arc/handoff/<plan-or-task-slug>.md` with scope/version/identity/evidence. Use a unique dated-plan stem or no-plan spec/task slug; never overwrite another record. It is outside working tree, shared by linked worktrees, not a Git mutation, never staged/committed, secret-free. Give every brief its absolute path; update task ID/SHA/state after accepted commits. Never delete automatically.

Unavailable/denied record writes require reason/full inline record in every Implementer brief, without deltas or record-file `unchanged`; inline satisfies accessibility.

Restart briefs send verified deltas and record-relative `unchanged`; fresh Implementer reads it and gets other fields fully. Include record location, next goal/ownership, changed decisions/approvals/docs/scope or no-change, current Git/differences, choice/reuse validation, refreshed commit/artifact checks, final verification/issues. Inaccessible records, missing evidence or unclear ownership block edits. Prior conversation/inaccessible links are no substitute. Revalidate revised docs/approvals/state; never backdate pre-gate preparation.

<a id="authorization-continuity"></a>
## Authorization continuity

Use [planning](planning.md#authorization-and-scope), recording scope/criteria/constraints/valid omissions with target/preparation. Reuse valid unchanged approvals across role restarts without duplicates. Orchestrator still verifies actual workspace/Git/preservation/ownership/docs/preparation; Implementer trusts verified brief. Material scope/method/risk changes or invalid target evidence hold affected work; report missing condition/resume evidence. Before exceptions read full [risk](verification.md#risk-scaled-execution)/[depth](planning.md) conditions.

<a id="common-handoff-gate"></a>
## Common handoff gate

Before every start/restart verify approvals/artifacts or omissions, explicit target/reuse, accessible intended repository/workspace, actual Git identity/state, preservation/ownership, docs commits or absence and no unresolved failure/partial completion. Missing/mismatched/unclear evidence blocks until resolution/full revalidation. This reference owns records/restarts/lifetime. Implementer uses self-contained guards, not mandatory Orchestrator-procedure loading. Depth 2 never creates/switches workspace/branches. Direct edits require the same.
Selected worktrees require common directory, registration, app-managed current-chat attachment, approved branch and source preservation through [managed preparation](handoff-worktree.md) only.

<a id="implementer-tdd-and-constraints"></a>
## Implementer TDD and constraints

Before feature/bug/behavior edits use local `test-driven-development` except explicit ARC exceptions. Full rules live in the profile. Waiver requires all low-risk and plan-skip/direct conditions, recorded scope/justification/criteria/checks before work. User/task-specific TDD overrides it; only qualifying tasks override local generic triggers without changing skills. Ordinary multistep/significant/high-risk work is ineligible.

Waiver skips RED-GREEN only, preserving focused checks/risk-scaled QA/Reviewer; never claim TDD. Follow an applicable higher-priority prohibition on adding or running tests; when precedence and scope are clear, do not report a conflict on that basis or ask permission to violate it. TDD remains applicable to permitted test work. Record unperformed verification and its limits; if precedence or scope is genuinely unclear, or required verification is blocked, hold only affected work and acceptance and report the evidence. Other blocked required steps need recorded decision/required human approval, not internal substitutes. Non-behavior docs/config use specifically approved exceptions only, never generalize to behavior.

<a id="orchestrator-direct-path-for-small-tasks"></a>
## Orchestrator direct path for small tasks

Record target choice/reuse before first edit; scope approval alone selects no target. Direct edits without Planner/Implementer need every low-risk/plan-skip condition: one local change, no dependent stages/cross-component shared state/lifecycle/integration-order concerns, one check path and no significant trigger. Exclude Spike/Architectural, ordinary behavior/significant/high/unclear risk and active Implementer file overlaps. File count proves no eligibility.

1. Record scope/files, every condition's justification, criteria/checks, not brainstorming. A specific existing request may authorize under [planning](planning.md#authorization-and-scope); otherwise obtain explicit approval. Silence/ambiguity/other approvals are insufficient.
2. Read this/[preparation](handoff-prep.md), pass full gate before edit and edit approved files surgically, preserving others. No unrelated refactoring/unapproved dependencies.
3. Follow Implementer TDD/recorded waivers; explicit TDD still requires local skill. Record files/checks/criterion evidence/gaps. Orchestrator is not independent; assign QA for incomplete evidence.
4. Failed checks/QA findings route to Implementer/recheck, never self-correction. Scope/risk/condition changes stop edits, record work/reclassify and return subsequent edits to normal Planner/Implementer flow.

Add no plans/automatic commits to omission paths; follow guidance/user requests.


### Fast gate

Select the existing direct path only when all eight conditions are `proven`. Record each as `proven`, `unmet`, or `unverified` with evidence; any `unmet`, `unverified`, missing or ambiguous condition requires full evaluation. Missing required inputs or operational failure also holds dependent work; full evaluation is no bypass.

- **F1**: Scope authorization identifies outcome, scope, criteria and edit boundaries, with no unresolved material behavior, method or risk decision.
- **F2**: One local, understood, reversible change with understood impact and outcome.
- **F3**: No dependent stages, cross-component shared state, lifecycle or integration-order concerns.
- **F4**: Meets [risk-scaled execution](verification.md#risk-scaled-execution) low-risk conditions and no existing direct-path exclusion applies.
- **F5**: One focused verification path covers criteria and identifies required independent QA/Reviewer.
- **F6**: Explicit target choice or valid reuse, current workspace and change state, preservation and no active ownership conflict are established.
- **F7**: Applicable TDD is identified; any waiver or non-behavior exception meets existing conditions and is recorded beforehand. Explicit user/task TDD overrides waiver.
- **F8**: Applicable instruction source-set and approval, target, criteria and verification evidence are accessible, consistent and unambiguous.

Security/permissions and public-interface changes are never eligible under the existing significant-risk exclusions. File count, LOC and apparent simplicity prove none of F2–F5. This gate does not replace the first direct edit gate, Implementer start/restart gate, target choice, TDD, independent QA and Reviewer, acceptance or commit; existing triggers determine whether each gate applies. The fast path does not add untriggered role, QA/Reviewer, acceptance or commit obligations. Preserve all existing platform restrictions.

### Instruction fingerprint

Record the actual applicable source-set: platform ARC SKILL, these initial reference sections, applicable workspace instructions, and triggered references/skills; record user/platform messages by message and approval reference, not invented file hashes. Record native role profile source/version when assigned; a new role receives actual instructions, profile, needed paths and criteria, not merely a hash. Do not assume disk profile changes updated an active role.

Distinguish user-provided instructions, workspace instructions, installed references and task inputs by source, applicability and access state: available, absent, inaccessible, conflicting or unverified. For every file record source kind, absolute and resolved path, read sections, available revision, SHA-256 of entire file bytes, access state, observation and read-context references. Neither HEAD nor installer manifest substitutes for actual installed-source hash. Use only already identified source paths; do not search or guess. An uncertain source-set makes F8 `unverified`.

Reuse read content only for the same source-set, absolute source locators, resolved paths, hashes, scope and same conversation context with meaning still available. Different absolute locators cannot be reused even if they resolve to the same path. New context, inaccessible record or context loss requires rereading; changed source/hash requires rereading and reassessing affected judgments. Verify the current source-set/hash at a new fast judgment, first-edit or assignment/restart/resumption gate, before acceptance, and on known source changes; reuse observations within the same gate. If hashing fails, do not reuse; follow existing read recovery and hold required inaccessible inputs. When Node is already available, batch identified absolute paths with built-in `node:fs` realpath/readFileSync and `node:crypto` SHA-256; install nothing and print no source content.


For identified absolute sources only, when Node is already available, this read-only example prints paths and hashes, not contents:

```sh
node --input-type=module -e '
import fs from "node:fs";
import crypto from "node:crypto";
const sources = process.argv.slice(1);
if (!sources.length) throw new Error("No instruction sources");
for (const source of sources) {
  const resolvedPath = fs.realpathSync(source);
  const contentHash = "sha256:" + crypto.createHash("sha256").update(fs.readFileSync(resolvedPath)).digest("hex");
  process.stdout.write(JSON.stringify({source, resolvedPath, contentHash}) + "\n");
}
' -- '/absolute/identified/source-1' '/absolute/identified/source-2'
```
A new conversation or lost context requires reread; unchanged HEAD alone does not prove instruction, file or check evidence current.

### Task envelope

Place the compact envelope in the existing canonical handoff record or existing inline scope record, not a new file, store or API. Record task path and outcome; instructions; target; approval; scope and criteria; risk and depth; TDD; verification; refresh. Specifically include task ID/path, source fingerprint/read context, workspace/branch/HEAD/change state/preservation/ownership, scope approval and target choice, edit boundaries/criteria, F1–F8 evidence/risk/depth, TDD or recorded exception, criterion checks/QA/Reviewer/acceptance, and observations/changes/revalidation/holds. Link accessible records; inaccessible references do not replace required content. Embed it in the existing eight specialist brief fields in their fixed order, without a ninth field or full history.

The nine fields are `task`, `instructions`, `target`, `authorization`, `scopeCriteria`, `riskDepth`, `tdd`, `verification`, and `refresh`; task records the task ID/path and selected path `fast-direct` or `full`, and verification includes criteria-specific checks and their evidence.

### Evidence refresh

Evaluate target choice validity separately from evidence validity. Approved HEAD or expected dirty changes do not invalidate target choice by themselves: record current state, preservation and ownership, and assess affected criteria/checks. Revalidate only affected evidence; a related file change after a check leaves that check unverified until repeated as needed. Changed instructions require reassessing linked fast/risk/TDD/authorization judgments. Preserve unaffected evidence and valid approvals. Unclear impact, missing or inaccessible evidence, ownership conflict, failure or partial/unknown state requires existing hold and recovery; workspace/target change or loss of trust follows target-choice rules. For a target change, obtain a new choice where required and state confirmation before dependent edit. Scope/criteria/method/risk changes follow existing approval and fresh-role rules. A failed direct check or QA finding returns to existing Implementer/recheck ownership.

<a id="cooperative-cli-verification-handoff"></a>
## Cooperative CLI verification handoff

Supported spec+plan handoffs include registered task contract, exact check descriptor, task/final scope, `status.changeFingerprints`, independent actor attestations, intent ID/result messageRef/verdict. Authorized roles execute after `prepare` and record through `result`; CLI records prove no identity/compliance.

On scope/docs/approval changes inspect `affectedTaskIds`/dependencies, preserve history and supply current approval/contracts. Never reuse checks across fingerprints. Link findings to same-version Implementer resolution/QA rechecks; only plan-final Reviewer findings use Implementer→Reviewer. No task-level Reviewer prerequisite. Detailed fields/holds follow [verification](verification.md#verification-lifecycle-in-the-cooperative-cli); unsupported omission is no policy violation/document obligation.

[ARC role policy: contract begin]
Generated from lib/policy/role-policy.json; do not edit this managed section manually.
- [git.specialists-deny] Specialists MUST not change Git state during implementation or recovery: no stage, commit, push, merge, rebase, reset, branch creation/switching or worktree creation/removal. Explicit Orchestrator assignment cannot authorize these actions; return them to Orchestrator. Read-only Git inspection remains allowed within the assigned scope.
- [role.implementer-implementation] Edit only assigned, approved files and run focused checks under the existing TDD contract. Report changed files, RED/GREEN or approved exception evidence, results, limits and follow-up. Do not plan, independently QA/review your own work, accept the task or declare overall completion. Git mutations remain forbidden after successful implementation. Implementer and fresh QA handoffs include the exact approved visual source, version, approval and access state; criterion IDs, required properties and comparison method; and actual-output identity, revision and comparison basis. Record pass, mismatch or unverified with accessible evidence and limits. Implementer self-report does not replace fresh QA and its actual comparison. A missing output-to-revision link is unverified; record a visible difference separately as mismatch without inferring current branch UI state. Missing source/output, inaccessible evidence or unapproved interpretation holds the affected visual claim for Orchestrator. Do not silently substitute or redesign.
- [review.significant-no-plan] Significant/high-risk work without a plan follows Implementer → QA and required QA rechecks → Reviewer of the final full change → Orchestrator acceptance. Do not omit Reviewer because no plan exists. This adds no plan obligation.
- [review.significant-plan] Significant/high-risk plan work follows Implementer → required fresh QA → Orchestrator acceptance and focused commit for each task. After all tasks are accepted and required QA is complete, Reviewer reviews the final full change once. Reviewer is not a per-task or per-commit gate. Preserve required checks and necessary finding rechecks.
- [review.final-plan-recheck] Complete required QA and QA failure rechecks before the initial final overall Reviewer review. Once that review begins on plan work, every final Reviewer finding, including behavior, follows Implementer → Reviewer without QA reassignment until resolved. Keep corrections uncommitted through Reviewer rechecks, then accept and create one focused follow-up commit. Separate QA findings follow Implementer → QA. Preserve required QA outside this final Reviewer exception.
- [platform.codex] Role restrictions are prompt-level contracts, not a filesystem sandbox. ARC supplies no native observer hook or role-specific Git guard. Existing shell capabilities are retained because static read access after shell reduction has not been verified; Implementer and QA need shell for approved checks.
[ARC role policy: contract end]

<a id="initial-implementer-assignment-through-the-cooperative-cli"></a>
## Initial Implementer assignment through the cooperative CLI

In approved plan mode all mutations pass stdin JSON through `node "$ARC_RUNTIME_ENTRY" <command> --cwd "$ARC_CHECKOUT" --workflow "$ARC_WORKFLOW_ID" --input -`. Resolve `ARC_RUNTIME_ENTRY` as `<target-home>/skills/arc/runtime/cli.mjs` from the actual installer-selected loaded skill, including custom homes, never guessed home/package/checkout/cache entries. Use separate argv for path/checkout/workflow. Safely assign/double-quote shell variables; never interpolate executable paths or `eval`. Query `status` without `--input`.

Entry installation/update migrates no common-directory state or approvals. Preserve runtime/hash/target/actor/revision gates; drift holds evidence for current recovery/approval. New workflows prove no historical compliance.

1. Verify approved spec/plan docs-only commit, exact set/Git objects/current bytes. Only then run `init`, approval `record`, `prepare`, even if approval preceded commit.
2. At final HEAD `init` with `mode: "plan"`, `actor: {id: "operator"}`, `selection: {messageRef, contentHash}`.
3. Record confirmed approval as `{requestId, expectedRevision, actor, evidence: {kind: "approval", messageRef, data: {approvalVersion, documentVersion, documents}}}`. `documents` is exactly spec/plan with `{kind, path, gitPath, contentHash, approvalRef, commit}`; `contentHash`=`sha256:<hex>`, `approvalRef` matches approval `messageRef`. HEAD drift needs fresh observation/renewed approval, not reconnection to old intent.
4. `prepare` with `{requestId, expectedRevision, actor, operation: "assign-agent", taskId, arguments: {role: "implementer", paths, operations: ["edit"], documents, approvalRef, approvalVersion, documentVersion, correlation}}`. Absolute `paths` remain in checkout. Confirm `allow`, `persisted: true` and saved intent.
5. Invoke native assignment with saved task/scope/correlation.
6. Record `{requestId, expectedRevision, actor, intentId, result: {status, messageRef, data: {correlation, taskId, agentId}}}`. `intentId` is prepare requestId. Distinguish `succeeded`, `failed`, `unknown`, `mismatch`. Success needs returned agent ID; unknown/mismatch holds duplicate assignment for investigation.

Approval/assignment are `operator-attested`, not native identity/event authentication. CLI blocks no outside direct call; new workflow legitimizes no historical omission. Preserve trusted-adapter provenance.

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

<a id="composite-bridge-results-and-briefs"></a>
## Composite bridge results and briefs

For a bridge dispatch the result is the child's final message, saved at the `resultPath` returned by `run-dispatch` and `observe`; read it from there and treat it as `operator-attested` text, not as acceptance. The brief sent to `run-dispatch` or `resume` keeps the fixed brief order from [coordination](coordination.md#token-discipline-and-handoffs) and is delivered on stdin only: never put it in argv, environment variables or a positional prompt, and keep it at most 256 KiB. For audit ARC also stores the brief in `<gitCommonDir>/arc/workflows/<workflowId>/dispatches/<dispatchId>/brief.md` (mode 0600); the child still receives it on stdin only. Do not include secrets or raw CLI output.
