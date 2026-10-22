# Handoff contract

Orchestrator reads before every Coder first start or restart preparation. Coder trusts the Orchestrator-verified facts
in the brief under the Coder profile and reads this file only for sections the brief explicitly cites. First-start preparation
(execution-target choice request, preparation Git mutations, planning-document commit) is in
[handoff-prep.md](handoff-prep.md); the new managed worktree path is in [handoff-worktree.md](handoff-worktree.md).

## Workspace handoff

### Checkout approval

Before every Coder first start and restart, Orchestrator confirms the supplied absolute workspace is accessible and
belongs to the intended Git repository; record its actual absolute path, current branch or detached HEAD, HEAD, and staged,
unstaged, and untracked changes. Stop if the workspace is inaccessible, is not the intended repository, or HEAD
cannot be resolved. Do not initialize Git or switch to another repository automatically.

Execution-target choice and actual preparation precede formal drafting and saving of required specs/plans.
Initial design proposals may precede choice. Initial target preparation does not authorize Coder; all applicable
approvals, complete documents, verified batch docs commits or valid absence, and final Git verification remain required.
Record planned document scope/paths and actual preparation separately, followed by actual drafting/save/approval and
commit results; preserve actual order and evidence gaps. Reuse a valid choice during document drafting and subsequent
implementation while scope and target remain unchanged. Authorized HEAD and dirty-state changes alone do not invalidate
choice; verify preservation and ownership. A changed scope or target requires fresh explicit choice before dependent
drafting or preparation and does not require document completion. Never fall back automatically.

After initial design approval, obtain and record an explicit user choice for the first start under the
Explicit choice rule: use the current checkout, create a new task branch from the verified base HEAD in that same
checkout, or create a new managed worktree and task branch (selection target under handoff-prep.md; contract in
handoff-worktree.md after selection). Without an explicit execution-target choice or verified valid reuse under the
choice-lifetime rules below, wait and do not start or restart Coder.

### Coder handoff gate

Orchestrator may start or restart Coder only after all of these conditions are verified:

1. All applicable design/spec/plan approvals are recorded with approved artifact paths or valid depth-omission reasons.
   For a Coder Spike probe, record its approved question, method/scope, acceptance criteria, and constraints.
   The complete current-scope document list, approved versions, plan dependencies/order, and absence of unfinished
   applicable documents are verified. Future implementation artifacts are not part of the probe scope or approved by it.
2. The user explicitly selected the execution target initially, or that initial choice remains valid under the restart
   rules below.
3. The accessible absolute workspace is the intended Git repository.
4. Actual branch or detached HEAD, HEAD, staged/unstaged/untracked state, preservation, and edit ownership are known.
   Unrelated staged files are preserved and block handoff until Orchestrator resolves preparation.
5. Approved planning-document commits are verified, or no documents were required or produced and the valid depth
   rationale is recorded.
6. After any commit or branch operation, final path, branch, HEAD, and change state are rechecked with no unresolved
   failure or partial completion.
7. The brief includes these preparation and final-verification facts and evidence.

Before an Orchestrator direct edit, Orchestrator verifies the same conditions, with the approved scope record as the
applicable approval, and records them in the brief.

A missing or failed condition blocks handoff. Orchestrator may continue read-only investigation and authorized
preparation or recovery, but cannot start Coder early. Reverify affected evidence when approved content, execution target, branch,
HEAD, or relevant state changes. Coder's conflict reporting is in its profile; Orchestrator
resolves preparation and passes the gate again before Coder resumes.

### Handoff evidence

For the worktree path the canonical record maps source and target absolute paths, Git common directory, base SHA,
selected branch, descriptive name, returned actual path, app-managed current-chat attachment, operationId/result,
registration and preservation checks, and document transfer evidence. Do not automatically recreate, cleanup, or
archive a worktree.

Include the document-save gate evidence and results from planning.md, execution-target request readiness, and each
preparation Git mutation's pre-action evidence and post-action result in the same canonical record.
Record the actual absolute workspace, prior branch or detached HEAD and base HEAD, prior change state and preservation
and edit scope, checkout approval result and evidence, selected execution path, final branch or detached HEAD,
creation/switch result if attempted, and post-selection branch/path/HEAD/change checks in the brief. Include the docs
commit SHA, actual message, included paths, approved-content verification or valid no-document depth rationale,
final verification, and any failure/partial completion and recovery evidence, plus absolute approved artifact paths.
Record the Complete planning-document set fields from planning.md, confirming no applicable document awaits
writing/approval.
Distinguish reused commits from the batch preparation commit, or record valid document absence.
Record applicable approvals and the initial explicit execution-target choice or verified reuse for each first start or
restart. Give all five roles (Coder, QA, Planner, Reviewer, Scouter) the same actual workspace and selected execution checkout or absolute
worktree path, preparation evidence, and absolute artifact paths. Each role stays in the supplied workspace, reports
missing, inaccessible, or conflicting paths and unexpected branch state to Orchestrator before dependent work, and does
not create or switch workspaces or branches.

### Task readiness at every assignment

Before each first start or restart, if an approved plan exists, link its current dependency/readiness record
(planning.md) in the canonical record and brief. Where plan omission is valid under existing rules, do not create a
plan or map solely to satisfy this linking duty; record the applicable omission judgment and rationale in the
canonical record and brief. Plan absence alone does not qualify for omission, and an unapproved required plan
cannot bypass its approval gate.

Before assignment, apply every readiness condition in
[planning.md, Dependency and readiness record](planning.md#dependency-and-readiness-record), including predecessor
checks, Orchestrator acceptance and verified focused commit or accepted no-change evidence. A Coder completion report
alone is insufficient. Verify the linked record is current and capacity and file ownership permit assignment.
Readiness supplements the full handoff gate and execution-target restrictions; it never waives them.
For authorized HEAD or state changes, refresh this record and affected briefs, verify preservation and ownership,
revalidate affected gates, and reassess readiness under planning.md and [commit.md](commit.md#shared-checkout-coordination).
Unexpected HEAD or ownership changes stop affected work for Orchestrator resolution and revalidation.

### Choice lifetime and restart record

For the same approved scope, workspace, repository, and execution target, reuse the initial explicit choice only
when its evidence is accessible and still valid. On every first start and restart, Orchestrator rechecks actual Git
state against the current brief: absolute workspace and repository identity, branch or detached HEAD, HEAD,
staged/unstaged/untracked changes, preservation and edit ownership, applicable approvals and artifacts,
planning-document SHA/message/paths/content or valid no-document rationale, and Orchestrator's final state verification
(Coder handoff gate items 1-7); a reused choice never waives any gate. A restart without document changes reuses
verified valid planning-document commits without recommitting them and a still-valid initial choice, with fresh
actual-state checks. Normal authorized HEAD and dirty-state changes, including accepted task commits, docs commits,
implementation, and approved worktree document transfer, do not by themselves invalidate the choice; record them and
verify that they match approved work, ownership, and the intended target. A worktree's creation base SHA remains
evidence; target HEAD need not remain at that base; source preservation and unexpected-state checks still apply.
Link the approved plan version, task ID and commit SHA/content/validity with current Git state and edit ownership in
the restart brief under Orchestrator's full handoff gate. Verify/reuse successful task commits without duplication and
keep planning-document preparation evidence distinct; task commits do not require repeating valid document preparation.

If scope, workspace, repository, target, or approved branch candidate changes, obtain a fresh explicit choice before dependent drafting or preparation; reselection does not require document completion. If an invalidating failure means the old target cannot be trusted,
obtain a fresh explicit choice after Orchestrator resolves preparation. State mismatches and unresolved failures block
editing until Orchestrator resolves and revalidates the full gate; resolution does not automatically require a new
choice unless it invalidates the old target. Do not fall back automatically; apply the Explicit choice rule.

Keep one canonical initial handoff record accessible to each assigned role, containing the approved scope/version,
repository/workspace identity, and the Handoff evidence fields above; do not create a separate storage service.
Orchestrator writes it as a
Markdown file at `<git-common-dir>/arc/handoff/<plan-or-task-slug>.md` (slug unique to the plan, the dated plan filename
stem, or a spec/task slug when no plan exists; never overwrite another plan's record; resolve with
`git rev-parse --path-format=absolute --git-common-dir`; outside the working tree and shared by linked worktrees; not a
Git mutation, never staged or committed; contains no secrets), gives its absolute path in every brief, and restart
briefs cite it. If the write is denied or unavailable, each Coder brief states why and includes the full record inline, with no delta;
that inline record satisfies the accessible record requirement. Do not delete it automatically.

Restart brief: supply only verified deltas and mark unchanged fields; `unchanged` means unchanged relative to the record
file the fresh Coder reads, and every other brief field is in full. Include: initial record location,
next objective and edit ownership, changed decisions,
approvals, documents and scope (or explicit no-change confirmation), current Git state and differences, choice
validity and reuse verification, refreshed commit/artifact checks, Orchestrator final verification, and remaining
issues.
An inaccessible initial record, missing evidence, or unclear ownership blocks editing; a prior conversation or
inaccessible link cannot substitute for evidence. Include material needed for a self-contained role handoff, with
accessible canonical evidence instead of repeated history. Reverify revised documents/approvals and current state;
never retrospectively claim preparation of edits made before the gate passed.

## Authorization continuity

Use [planning](planning.md#authorization-and-scope) for approval evidence and scope classification. Record that evidence,
its scope, criteria, constraints, and valid document-depth omissions alongside execution-target choice and preparation.
Reuse valid authorization for the same approved scope and target. A restart or new role assignment does not require
repeat approval. Reuse never waives verification of actual workspace/repository, branch or detached HEAD, HEAD,
changes, preservation, ownership, applicable documents, and preparation evidence by Orchestrator. Refresh actual state
and affected briefs for authorized changes; they alone do not invalidate approval. Coder trusts the verified brief
under its profile. Material scope/method/risk changes and invalid target evidence hold affected work; resolve using
planning and the choice-lifetime rules above. Report the missing condition and resume evidence rather than asking
for an approval already valid for that scope.

Before any exception judgment, Orchestrator reads [Risk-scaled execution](verification.md#risk-scaled-execution) and [planning](planning.md) for the full risk and plan-depth conditions.

## Common handoff gate

Before every Coder first start/restart, Orchestrator passes the full gate:
applicable approvals/artifacts or valid omissions, explicit execution-target choice
or verified reuse, intended accessible repository/workspace, actual Git identity/state, preservation/ownership,
verified document commits or valid absence, and no unresolved failure/partial completion.
Missing evidence, mismatches, unclear ownership or unresolved preparation block handoff and require Orchestrator
resolution and full revalidation. Handoff owns the evidence fields, canonical handoff record, restart brief, choice lifetime
and reuse. Coder trusts the Orchestrator-verified brief and reports actual conflicts under its self-contained profile;
never replace its local guards with a requirement to load Orchestrator procedures.
Depth-2 roles use the supplied workspace and report path/state conflicts; they cannot create/switch workspaces or
branches. The same conditions apply before an Orchestrator direct edit.
For a selected worktree, handoff requires common directory, registration, app-managed current-chat attachment,
approved branch, and source preservation; prepare only through the selected managed-worktree contract.


## Coder TDD and constraints

Before feature, bug-fix, or behavior edits, Coder follows local `test-driven-development` unless the explicit
ARC exception applies; the Coder profile holds Coder's full TDD rules. TDD is waived only when every small,
low-risk criterion (Risk-scaled execution) and every plan-skip criterion (Orchestrator direct path) holds.
Before Coder starts,
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

Orchestrator may make a task's edits directly, without Planner brainstorming or Coder, only when every small,
low-risk criterion holds, every plan-skip criterion holds (one local change, no dependent stages, no cross-component shared state,
lifecycle, or integration-order concerns, and one focused verification path), and no significant-risk trigger applies.
Spike, architectural, ordinary-behavior, significant/high-risk, unclear-risk work, and edits overlapping files assigned
to a running Coder are not eligible.

Before editing, Orchestrator records a scope record (not a brainstorming design) with scope and files,
why every criterion holds, acceptance criteria, and focused verification. Apply authorization in
[planning](planning.md#authorization-and-scope): an existing sufficiently specific user request can approve
that scope; no duplicate approval is needed. Otherwise present the scope record to the user and obtain explicit
approval before editing. Silence, an ambiguous response, or approval of other work is not approval.
Orchestrator then passes the Coder handoff gate in handoff,
with the approved scope record as the applicable approval, before the first edit. Orchestrator edits only the approved files,
preserves others' edits, makes surgical edits in the local style without unrelated refactoring or speculative additions,
and does not install dependencies without authorization.

Behavior edits follow Coder TDD and constraints; when TDD applies, Orchestrator follows local
`test-driven-development`.
After editing, Orchestrator records the changed files, runs the focused checks, connects each acceptance criterion to
evidence, and preserves unverified scope. Orchestrator is not independent of its own edit; assign QA when the evidence is
incomplete.
After a failed focused check or a QA finding, Orchestrator routes the correction to Coder and obtains a recheck.

If scope expands, risk becomes unclear, or a criterion stops holding, Orchestrator stops editing, records the changes
already made, and reclassifies; further work follows the normal Planner/Coder flow with Coder owning subsequent edits. Do not
automatically revert, reset, stash, or clean those changes. Like other plan-skip paths, there is no automatic task
commit; commits follow applicable guidance and user requests.


## 협력 CLI 검증 인계

지원하는 spec+plan 경로의 검증 인계에는 등록된 task 계약과 정확한 check descriptor, task/final 구분,
`status.changeFingerprints`, 독립 actor 진술, intent ID, 결과 messageRef·verdict를 포함한다.
check/review는 `prepare` 이후 외부의 승인된 역할이 수행하고 `result`로 실제 결과를 기록한다.
CLI 기록은 신원 인증이나 실제 에이전트 정책 준수 증명이 아니다.

scope·문서·승인 변경 시 `affectedTaskIds`와 의존 chain을 확인하고, 기존 승인·결과 기록을 보존한 채
영향 task의 새 승인과 계약을 인계한다. 오래된 passing check는 다른 fingerprint에 재사용하지 않는다.
실패 finding은 배정된 Coder의 해결 근거와 해당 변경 버전의 QA 재확인을 연결한다. final 전체 Reviewer
finding만 Coder→Reviewer 재검증을 적용한다. Reviewer를 개별 task의 수용·commit 선행 조건으로 추가하지 않는다.
자세한 필드와 보류 조건은 [verification.md](verification.md#협력-cli의-검증-수명주기)를 따른다.
no-plan·생략 경로의 unsupported는 기존 정책 위반이나 문서 작성 요구로 바꾸지 않는다.

[ARC role policy: contract begin]
Generated from lib/policy/role-policy.json; do not edit this managed section manually.
- [git.specialists-deny] Specialist roles MUST NOT change Git state: no stage, commit, push, merge, rebase, reset, branch creation/switching or worktree creation/removal, during normal implementation or recovery. Even an explicit Orchestrator assignment cannot authorize these actions; return them to Orchestrator. Read-only Git inspection remains allowed within the assigned scope.
- [role.coder-implementation] Edit only assigned, approved files and run focused checks under the existing TDD contract. Report changed files, RED/GREEN or authorized exception evidence, results, limits and follow-up. Do not plan, independently QA/review your own work, accept the task or declare overall completion. Git changes remain forbidden even when implementation succeeds.
- [review.significant-no-plan] For significant/high-risk work without a plan: Coder → QA and required QA rechecks → Reviewer of the final full change → Orchestrator acceptance. MUST NOT omit Reviewer merely because no plan exists. This creates no new plan obligation.
- [review.significant-plan] For significant/high-risk plan work: each task uses Coder → fresh QA as required → Orchestrator acceptance and focused commit. After all tasks are accepted and required QA is complete, Reviewer reviews the final full change once. Reviewer is NOT a per-task or per-commit required gate. Preserve required checks and necessary finding rechecks.
- [review.final-plan-recheck] For final overall Reviewer findings on plan work, including behavior findings, use Coder → Reviewer without QA reassignment; repeat until resolved. This exception applies only at the final plan stage. Preserve required QA and QA failure rechecks before initial final review and outside this exception.
- [platform.codex] Role restrictions are prompt-level contracts, not a filesystem sandbox. No documented role-specific Git hook or generic per-agent tool allowlist is assumed. Existing shell capabilities are retained because static read access after shell reduction has not been verified; Coder and QA need shell for approved checks.
[ARC role policy: contract end]

## 협력 CLI의 최초 Coder 배정

승인된 plan mode에서 Orchestrator가 다음 순서를 수행한다. 모든 변경 명령은
`arc workflow <command> --cwd <absolute-checkout> --workflow <id> --input -`로 JSON을 stdin에 전달한다.
`status`는 `--input` 없이 조회한다.

1. 승인된 spec·plan의 docs-only 커밋을 준비하고 정확한 문서 집합·객체·현재 파일을 검증한다.
   사용자 승인이 문서 커밋 전에 이미 발생했더라도 `init`·승인 `record`·`prepare`는 이 커밋 검증 후에 수행한다.
2. 문서 커밋 검증 후 최종 대상 HEAD에서 `init`에 `mode: "plan"`, `actor: {id: "operator"}`, `selection: {messageRef, contentHash}`를 전달한다.
3. `record`로 이미 확인한 사용자 승인 진술을 저장한다. 입력은
   `{requestId, expectedRevision, actor, evidence: {kind: "approval", messageRef, data: {approvalVersion, documentVersion, documents}}}`이다.
   `documents`는 정확히 spec과 plan이며 각 항목은 `{kind, path, gitPath, contentHash, approvalRef, commit}`이다.
   `contentHash`는 `sha256:<hex>`이고 `approvalRef`는 승인 `messageRef`와 일치해야 한다.
   HEAD drift 시 과거 intent를 재연결하지 말고 대상 재관찰과 재승인을 기록한다.
4. `prepare`에 `{requestId, expectedRevision, actor, operation: "assign-agent", taskId, arguments: {role: "coder", paths, operations: ["edit"], documents, approvalRef, approvalVersion, documentVersion, correlation}}`을 전달한다.
   절대 경로 `paths`는 checkout 안에 있어야 한다. `allow`와 `persisted: true` 및 저장된 intent를 확인한다.
5. 저장된 intent의 task·scope·correlation에 맞춰 native 배정을 호출한다.
6. `result`에 `{requestId, expectedRevision, actor, intentId, result: {status, messageRef, data: {correlation, taskId, agentId}}}`를 전달한다.
   `intentId`는 prepare의 requestId이다. 성공은 `succeeded`, 실패는 `failed`, 실행 여부 불명은 `unknown`, 응답 불일치는 `mismatch`로 구별한다.
   성공에는 반환 agent ID가 필요하다. `unknown`/`mismatch`는 hold이며 중복 배정을 멈추고 실제 결과를 조사한다.

이 경로의 승인·배정 결과는 `operator-attested` 진술이다. native 신원 인증이나 플랫폼 이벤트 검증을 뜻하지 않는다.
CLI 밖 직접 호출을 막지 못하며, 생략된 과거 실행을 새 workflow로 정상화할 수 없다. 기존 trusted adapter의 provenance 조건은 유지한다.
