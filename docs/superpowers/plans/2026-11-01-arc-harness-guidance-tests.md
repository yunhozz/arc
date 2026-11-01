# ARC 하네스 지침·문서 게이트·테스트 리팩터 계획

상태: Orchestrator 검토 완료, 사용자 승인 대기  
기준 명세: `docs/superpowers/specs/2026-11-01-arc-harness-guidance-tests-design.md` (승인 v2)  
대상: `/Users/yunho/Desktop/project/arc`, `refactor/arc-harness-guidance-tests`  
계획 승인 전에는 Implementer 배정, 코드 수정, 테스트 실행을 시작하지 않는다.

## 1. 목표와 승인 기록

승인된 명세 D1–D5에 따라 기존 ARC 흐름을 유지하면서 문서 의무 판정과 필수 승인·커밋 확인을 구현 진입점 앞에 둔다. ARC 지침을 간결하고 일관된 영어로 정리하고, 근거가 확인된 테스트 중복 코드만 줄인다.

- 기준 HEAD: `d901e807b2f12a3f8408279745dcfd9575cff3ab`; 현재 대상 branch는 위와 같고 저장 전 상태는 승인된 spec v2만 untracked다.
- 설계, target branch, spec v2가 승인되었다. spec 승인 원문은 `spec v2 승인`; 테스트·QA 승인 원문은 `예, 관련 테스트 실행과 QA 검증을 요청합니다`다. UI에 messageRef가 없어 해당 필드는 unavailable/unverified로 기록한다.
- spec v1 원문 승인 `spec 승인`과 저장 당시 SHA는 canonical handoff에 보존했다. v2가 구현 기준이다.
- 최초 `tests/README*` glob은 일치 경로를 찾지 못해 실패했다. 실패한 탐색은 반복하지 않았다. 승인된 한정 읽기로 runner 명령을 확인했으며 테스트는 실행하지 않았다.
- 계획 승인 및 spec·plan docs-only 커밋은 아직 완료되지 않았다.

## 2. 전역 범위와 보존 조건

### 편집 범위

- `README.md`, `docs/harness-operation.md`
- `codex/skill/SKILL.md`, `claude/skill/SKILL.md`
- Codex ARC references: `codex/skill/references/arc-visual-companion.md`, `commit.md`, `coordination.md`, `git-recovery.md`, `handoff-prep.md`, `handoff-worktree.md`, `handoff.md`, `limits.md`, `planning.md`, `verification.md`
- Claude ARC references: `claude/skill/references/arc-visual-companion.md`, `commit.md`, `coordination.md`, `git-recovery.md`, `handoff-prep.md`, `handoff.md`, `limits.md`, `planning.md`, `verification.md`
- Codex role profiles: `codex/agents/arc-orchestrator.toml`, `arc-scouter.toml`, `arc-planner.toml`, `arc-implementer.toml`, `arc-qa.toml`, `arc-reviewer.toml`
- Claude role profiles: `claude/agents/arc-orchestrator.md`, `arc-scouter.md`, `arc-planner.md`, `arc-implementer.md`, `arc-qa.md`, `arc-reviewer.md`
- managed policy source `lib/policy/role-policy.json` and existing generated targets listed in §5
- relevant existing test sources: `tests/test_arc_policy.py`, `tests/test_claude_payload.py`, `tests/test_harness_contract.py`, and the focused Node tests in §6
- `tests/workspace_document_contract.py` may be added as a helper module only; it must define no `TestCase` or test function.
- Update `tests/installer-parity.json` only if an actual test identity or destination changes, preserving migration history. Update `MANIFEST.sha256` through its existing script when covered payloads change.

### 제외와 보존

- Do not edit imported Superpowers sources: `brainstorming.md`, `writing-plans.md`, `test-driven-development.md`, `writing-good-tests.md`, `visual-companion.md`, `builder-check-prompt.md`, their helper scripts/templates, or either platform's `references/superpowers/**`.
- Do not edit pre-existing `docs/superpowers/**` material or provenance. The newly approved spec and this plan are the only additions there.
- Do not edit `docs/runtime/planner-hook-context.md`, installer behavior, generator behavior, or runtime modules unless an approved acceptance check proves a required change within the current scope.
- Preserve role ownership, authority, approvals, target/reuse, git and preservation rules, recovery, TDD, QA, Reviewer, commits, platform-specific conditions, and important anchors. Do not add runtime enforcement or approval stages.
- The authored guidance prose will be concise English. Keep Korean plan/spec prose and preserve identifiers, paths, commands, API names, code and literal values.

## 3. Implementer 배정 전 문서 게이트

Orchestrator completes this sequence after this plan is separately approved and before assigning T1:

1. Verify the approved spec and plan versions, paths, hashes, decisions, dependencies and user approval evidence in the canonical record `.git/arc/handoff/arc-harness-guidance-tests.md`.
2. Re-check the exact workspace, branch, HEAD, index, tracked/untracked changes, target validity, ownership and all affected files. Confirm the required document set is complete and no decision remains unresolved.
3. Confirm depth and risk separately. This task is Architectural and significant/high-risk; both spec and plan are required, and no omission applies.
4. Commit only the approved spec and plan together in one docs-only commit. Verify commit SHA, exact paths and contents, then verify the resulting branch and worktree state.
5. Record the post-commit evidence and full Implementer handoff in the canonical record. Assign T1 only after these checks pass.

The policy change must make the same gate apply before every Implementer assignment and every direct code edit. When ARC permits omitting a plan, record the applicable ARC condition, actual scope, evidence and decision in the canonical handoff; do not infer that omitting a plan also omits a spec. Missing approval, commit or state evidence holds the affected work. Do not treat a document's presence or approval alone as proof that the gate is complete.

## 4. One implementation task: T1

T1 is one cohesive task because the planning contract, managed role instructions, generated copies and their existing checks must agree. Do not split it into separate implementation commits.

### 4.1 Guidance and policy

- Make both `planning.md` files the clear reference for depth, spec/plan requirements, permitted omissions and implementation readiness.
- Add short checkpoints and direct links at each relevant entry point and role profile. Keep role-specific duties and platform differences where they apply.
- Require a recorded depth/risk decision, required document set and dependencies or ARC-backed omission evidence, explicit target or valid reuse, actual prepared state, individual approvals and versions, and a verified docs-only commit before implementation.
- Keep bounded plan omissions within the existing ARC conditions; a missing plan does not automatically remove a spec requirement. Preserve the existing distinction between preparation drafts and implementation approval.
- Express missing proof as a hold on the affected implementation. Do not create a new record system, runtime check, workflow role or approval stage.
- Edit managed blocks in `lib/policy/role-policy.json`, then use existing generators. Edit unmanaged ARC guidance directly. Do not rewrite imported Superpowers materials.

### 4.2 Test reduction, limited to established evidence

- Consolidate only the common assertion blocks in `WorkspaceBeforeDocumentsTests` from `tests/test_arc_policy.py:1479` and `tests/test_claude_payload.py:687` into the helper module. Keep the existing test methods and both platform paths. Leave Codex worktree-transfer checks and Claude worktree-unsupported checks in their respective suites.
- Remove only the exact duplicate assertion at `tests/test_arc_policy.py:1530` after confirming in the current file that the same input is already checked by the phrase loop.
- Keep `ARCPreactionGateTests` separate from `test_harness_contract.py`'s `DOCUMENT_ORDER` mutation checks. Keep generated-policy rendering/drift/failure atomicity, instruction layout/language, parity and platform-specific assertions.
- No complete test case has a supported deletion rationale. Do not add test functions or cases. Record baseline and final case/assertion counts and source line counts; describe the actual reduction without claiming a case-count reduction if no case was removed. If common extraction does not reduce repeated source code, report that and hold rather than deleting unique coverage.

### 4.3 Implementation sequence and evidence

1. After the docs-only planning commit, Implementer verifies the handoff target and baseline state. Run the focused existing checks in §6 on the baseline and record module discovery, counts and failures.
2. Modify existing assertions first to express the approved document gate, preserving test identities and unique conditions. Run the focused Python suites and record any relevant RED. A syntax/import or unrelated baseline failure is not RED.
3. Update guidance, role policy and helper consolidation to satisfy the approved contract. Generate managed copies and manifest using §5 commands. Run focused checks again and record GREEN or exact failures.
4. Compare source to generated targets, platform-specific clauses, exclusions, links/anchors, case counts and line counts. Report all changed files and limits to Orchestrator.

Do not weaken assertions to obtain a pass. An unexpected failure, scope expansion, ownership conflict or unclear contract returns to Orchestrator before dependent work continues.

## 5. Existing generation and consistency procedures

The policy source is `lib/policy/role-policy.json`. `npm run update:role-policy` updates the existing generated guidance blocks in:

- `codex/skill/SKILL.md` and `claude/skill/SKILL.md`
- `codex/agents/arc-orchestrator.toml`, `arc-scouter.toml`, `arc-planner.toml`, `arc-implementer.toml`, `arc-qa.toml`, `arc-reviewer.toml`
- `claude/agents/arc-orchestrator.md`, `arc-scouter.md`, `arc-planner.md`, `arc-implementer.md`, `arc-qa.md`, `arc-reviewer.md`
- `codex/skill/references/coordination.md`, `planning.md`, `handoff.md`, `handoff-prep.md`, `commit.md`, `verification.md`
- `claude/skill/references/coordination.md`, `planning.md`, `handoff.md`, `handoff-prep.md`, `commit.md`, `verification.md`

The runtime policy copies are `codex/skill/runtime/role-policy.json` and `claude/skill/runtime/role-policy.json`. Use `node scripts/update-runtime-assets.mjs` for the existing runtime copy procedure; do not alter runtime modules unless the approved scope and findings require it. Refresh `MANIFEST.sha256` with `node scripts/update-manifest.mjs` when covered files change.

After changes, verify generated consistency using `npm run check:role-policy`, `node scripts/update-runtime-assets.mjs --check`, and `npm run check:manifest`. Do not hand-edit generated files to mask drift.

## 6. Focused existing checks

Working directory for every command: `/Users/yunho/Desktop/project/arc`. These are planned commands, not executed results.

### Python `unittest` modules

```bash
python3 -m unittest discover -s tests -p 'test_arc_policy.py'
python3 -m unittest discover -s tests -p 'test_claude_payload.py'
python3 -m unittest discover -s tests -p 'test_harness_contract.py'
```

Use discovery for all three modules. In particular, `test_claude_payload.py` calls `unittest.main()` before later test classes, so direct script execution can miss those classes.

### Node policy, layout, language and parity checks

```bash
node --test tests/node/role-policy.test.mjs tests/node/instruction-layout.test.mjs tests/node/instruction-language.test.mjs tests/node/parity-check.test.mjs
```

### Generator and payload checks

```bash
npm run check:role-policy
node scripts/update-runtime-assets.mjs --check
npm run check:manifest
```

These checks cover different contracts and do not replace each other. `npm test` runs all existing Node tests (`node --test tests/node/*.test.mjs`); run it only if focused results or changed dependencies leave broader Node coverage necessary, and record why. Do not add tests. The user authorized relevant existing test runs and QA; there are no test results yet.

## 7. QA, acceptance and commits

- After T1 implementation, assign a fresh QA using the approved spec/plan, docs-only planning commit, current Git state, criteria, changed-file map, test comparison and Implementer results.
- QA independently reruns relevant §6 checks, reviews document-gate flow, omissions, generated copies, excluded materials, links/anchors and platform-specific assertions, and reports each criterion as pass, mismatch or unverified with commands and limits.
- For initial QA findings, the current Implementer fixes them and the current QA reruns reproduction and invalidated related checks. Acceptance remains held until required checks and findings are resolved.
- Orchestrator accepts T1 only after evidence and criteria are satisfied, then makes one focused implementation commit and verifies its SHA, content and remaining changes. Keep it separate from the planning-doc commit.
- After T1 acceptance and QA, assign one independent final Reviewer for the full change. Resolve final plan-review findings through Implementer then Reviewer, without assigning QA in that final-review exception. Orchestrator makes the final acceptance decision.
- Push, merge, publish and deploy are out of scope.

### T1 acceptance criteria

- All implementation entry points require the documented depth/risk, scope/documents or omission evidence, target/preparation, approval and docs-commit proof before assignment or direct code edit.
- ARC omission reasons and supporting conditions/evidence are recorded in the canonical handoff; current task has no omission.
- English guidance is concise and consistent while preserving the existing ARC flow, roles, exceptions, anchors and platform-specific behavior. Imported Superpowers materials remain untouched.
- The one exact duplicate assertion is removed, mirrored assertion code is consolidated where it lowers repeated source, and existing unique coverage and test identities remain. No new test case is added.
- Required existing checks and fresh QA pass, or every limitation is explicit and the relevant acceptance remains held.
- The docs-only planning commit predates all implementation and test execution; the implementation commit contains only the accepted T1 change.

## 8. Holds and current verification limits

Plan approval is pending. Therefore the docs-only planning commit, Implementer assignment, baseline tests, implementation, QA and final Reviewer remain held. No test command has been executed. The Python runner commands were established by the authorized bounded read; the initial failed glob remains recorded in the canonical handoff. This plan makes no claim about passing tests, case-count reduction or implementation results.
