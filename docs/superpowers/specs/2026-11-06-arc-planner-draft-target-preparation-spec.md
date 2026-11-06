# ARC Planner 작성 효율 및 target 준비 분리 명세

## 0. 승인 및 초안 기준 state

- Source workspace/repository: /Users/yunho/Desktop/project/arc.
- 초안 기준 source: branch master, HEAD d81b12a7975c7fbb50b35393a14c41bf0daf7397. Orchestrator가 초안 작성 전 확인한 working tree는 clean이었다.
- User-selected target intent: 같은 checkout에서 local branch chore/arc-planner-efficiency를 base d81b12a7975c7fbb50b35393a14c41bf0daf7397에서 생성한다. 사용자가 명시적으로 선택했으며, draft 작성 시점에는 branch가 아직 생성되지 않았다.
- 설계 승인 scope: A (첫 필수 문서 초안만 actual target 준비 전에 작성) 및 R2 (cooperative CLI runtime 포함).
- 이 spec의 첫 완전 초안은 위 source snapshot에 근거해 actual branch preparation보다 먼저 작성되었다. Branch 생성 이후 Orchestrator는 실제 path/branch/HEAD, 준비 결과 및 source 보존을 별도 evidence로 기록한다. 준비 사실을 초안 작성 시점으로 소급하지 않는다.
- 이번 spec만 Orchestrator가 최초 작성하도록 사용자가 별도로 승인했다. 후속 plan의 최초 작성은 Planner가 맡는다.

### 초안 이후 target preparation evidence (2026-11-06)

- Verified repository root: /Users/yunho/Desktop/project/arc.
- Observed prepared target: local branch chore/arc-planner-efficiency at HEAD d81b12a7975c7fbb50b35393a14c41bf0daf7397, matching the user-selected base.
- git status --porcelain=v1 --untracked-files=all returned no changes.
- git worktree list --porcelain showed the selected branch attached to the same repository path; this target uses the current checkout, not a separate managed worktree.
- Source-to-target comparison: the recorded source was master at the same HEAD and path with a clean working tree; the selected branch is at that same HEAD/path and is clean. No source-file delta was found.
- These observations were collected after the complete chat draft and before saving this spec. At that time, the formal spec had not yet been saved or individually approved, and the dependent plan had not been drafted.
- Orchestrator completed the full review and source-to-target impact check before saving this spec. The prepared state is recorded separately from the earlier source snapshot and is not backdated.

- **상태:** 정식 spec — 사용자 승인 완료
- **승인 기록:** 이 대화에서 사용자가 “승인”으로 응답 (2026-11-06).
- **작성 권한:** 이번 spec의 최초 작성은 사용자가 Orchestrator 작성 예외를 승인함에 따른다. 후속 plan과 향후 문서의 Planner 저작권 규칙은 바꾸지 않는다.
- **설계 선택:** A — 첫 필수 문서 초안만 실제 target 준비 전에 작성. R2 — cooperative CLI runtime 포함.
- **계획 깊이:** Architectural. **검증 위험:** Significant.
- **문서 경로:** docs/superpowers/specs/2026-11-06-arc-planner-draft-target-preparation-spec.md
- **종속 plan 경로:** docs/superpowers/plans/2026-11-06-arc-planner-draft-target-preparation.md

## 1. 목적

ARC 작업에서 불필요한 Planner 호출, 자료 재확인, 준비 작업을 줄이고, target 선택 후 첫 필수 formal spec/plan 초안을 완성할 때까지 branch/worktree 생성·전환을 기다릴 수 있게 한다.

초안 작성, 실제 target 준비, 문서 저장·승인, cooperative runtime 증거를 분리해 기록한다. 준비 전 초안은 실행 target이 준비됐다는 증거가 아니며, 준비 전 저장·commit·구현 handoff를 허용하지 않는다.

## 2. 변경 범위

이 명세는 다음 계약을 다룬다.

- Planner dispatch 전 direct path, plan 생략 및 Scouter 경로를 기존 조건에 따라 선택한다.
- 관련 설계·문서 단계에서 유효한 Planner context를 재사용하고, 하나의 complete brief와 delta 후속 brief를 사용한다.
- 한 plan에 속한 task 전체를 하나의 complete plan draft로 작성한다.
- 명시적 target 선택 이후 첫 필수 문서의 완전한 초안을 채팅으로 작성하고 자체 검토한다.
- 사용자가 선택한 target의 실제 branch/worktree 준비는 첫 required document의 complete draft와 Planner self-review가 완료되고, target choice/base와 mutation preconditions를 focused check한 다음 수행한다. Full Orchestrator review는 source↔target 비교 이후 document save 전에 수행한다.
- 준비 전 cooperative CLI draft history와 실제 준비 후 target을 검증된 전이 기록으로 연결한다.
- Codex와 Claude 지침, Planner profile, canonical policy, cooperative runtime이 같은 경계를 표현한다.

이 변경은 current checkout, new task branch, managed worktree 경로에 일반적으로 적용한다. Managed worktree를 별도 예외로 두지 않는다.

## 3. 범위 밖

다음 동작은 바꾸지 않는다.

- F1–F8 direct path 및 Bounded plan omission의 기존 자격 조건.
- 명시적 target choice, scope approval, 새 제품 결정에 대한 사용자 결정.
- 향후 design/spec/plan 최초 저작권과 self-review 의무. 단, 이 spec의 최초 작성은 이번 사용자 승인으로만 예외 처리한다.
- 최초 complete spec/plan 이후 Orchestrator의 같은 문서 수정 책임.
- Spec과 plan의 개별 승인 및 필요한 spec 승인 후 dependent plan 작성 순서.
- 문서 저장·문서 commit·Implementer handoff가 실제 준비와 승인 후에만 가능하다는 원칙.
- Fresh Implementer/QA, TDD, risk-scaled QA/Reviewer, acceptance, task별 commit, 외부 작업 권한.
- 자동 branch/worktree 대체, fallback, retry, source 변경 덮어쓰기.
- CLI operator-attested evidence를 native role identity·실행 의미·remote state의 독립 검증이라고 표현하는 것.

B안, 즉 required spec과 plan 초안을 모두 준비 전에 완료하는 경로는 포함하지 않는다.

## 4. 현재 동작과 문제

현재 formal drafting gate는 complete pre-save chat draft에도 실제 prepared-target evidence를 요구한다. Target 선택 요청은 문서가 완성되기 전에 할 수 있지만, formal 문서 작성 전에 Git 준비를 끝내야 한다. Managed worktree는 등록·현재 chat 연결·branch/HEAD 검증까지 완료된 뒤에야 formal drafting을 허용한다.

Cooperative CLI는 workflow, Planner stage, draft artifacts, 승인 및 문서 경로를 관찰된 target identity와 version에 묶는다. Source checkout에서 초안을 작성한 후 새 branch나 worktree로 이동하면, source 증거를 prepared target 증거처럼 재사용할 수 없다. 현재 CLI에는 일반적인 source→prepared-target 전이와 초안 handoff 연결 계약이 없다.

## 5. 용어

- **Source target:** Planner가 초안을 작성할 때 실제로 관찰한 checkout/worktree와 branch/HEAD, 변경 상태, 입력 evidence.
- **Target intent:** 사용자가 명시적으로 선택한 목적 target의 종류, approved branch candidate/base 또는 current checkout 선택. 이 기록만으로 target이 준비됐다고 보지 않는다.
- **Prepared target:** 선택된 target이 실제 branch/worktree로 준비되고 path·repository·branch/HEAD·변경 보존을 확인한 상태.
- **Pre-preparation draft:** Target intent와 검증된 source snapshot에 근거해 Planner가 채팅으로 반환한 첫 필수 문서의 complete draft/self-review. 이 문서는 저장되거나 승인된 artifact가 아니다.
- **Target transition:** Source target과 prepared target을 두 개의 독립 관측으로 보존하고, 사용자 선택·준비 결과·draft stage를 명시적으로 연결하는 runtime 기록.

## 6. 필수 workflow

### 6.1 문서 필요성과 역할 분류

1. Orchestrator는 brief 준비 전에 direct path와 필요한 document depth를 기존 조건으로 평가한다.
2. F1–F8 모두 proven이면 기존 low-risk direct path를 선택할 수 있고, 적용되지 않는 Planner/Implementer/QA 호출이나 plan을 새로 만들지 않는다. 하나라도 unmet/unverified이면 full evaluation을 한다.
3. Bounded 작업은 기존 plan omission 조건을 모두 입증한 경우에만 plan을 생략하고 이유를 기록한다. Architectural 작업 및 다른 필수 plan은 생략하지 않는다.
4. 소수의 이미 식별된 파일에서 확인할 수 있는 사실은 Orchestrator가 필요한 범위만 직접 읽는다. 넓은 material research 또는 광범위한 정적 탐색에는 Scouter를 배정한다.
5. 한 top-level plan에 속한 모든 task, dependency, criteria, checks 및 holds는 하나의 Planner complete plan draft로 작성한다. 구현 task마다 Planner를 새로 부르지 않는다.

### 6.2 Brief, context 및 근거 재사용

1. 첫 Planner 호출에는 하나의 완전한 stage-specific brief와 해당 stage에서 필요한 source, approvals, criteria, dependencies, exclusions, verification 및 holds를 제공한다.
2. 관련 다음 단계에서 현재 role/context/source가 유효하면 같은 Planner instance를 재사용한다. 새 Planner를 task 개수만큼 만들지 않는다.
3. Follow-up은 변경 필드와 이전 brief의 접근 가능한 위치를 가리키는 unchanged 참조만 전달한다. 접근할 수 없는 대화나 hash만으로 required input을 대체하지 않는다.
4. 동일 source set·absolute locator·resolved path·내용 fingerprint·purpose·승인 scope·접근 가능한 같은 맥락에 대한 확인 결과는 재사용한다. 다른 target, version, scope, source 또는 영향받은 입력은 재확인한다.
5. Spec/plan의 complete first draft 이후에는 Orchestrator가 같은 문서를 직접 수정한다. Design/brainstorming에서는 누락을 전체 checklist로 모아 한 번에 전달하고, 현재 추가 호출 조건을 유지한다.
6. 저장·patch·표현 변경만으로 Planner를 다시 부르지 않는다. Planner progress는 stage/피드백/blocker/다음 단계로 제한하며 새 reporting 주기를 만들지 않는다.

### 6.3 Choice, 초안, 준비 및 저장 순서

1. **범위와 문서 set:** Orchestrator는 required docs, relative paths, coverage, depth, dependencies, omissions와 approval order를 기록한다.
2. **명시적 target choice:** 사용자는 지원되는 current checkout, approved new branch 또는 managed worktree target을 선택한다. 지원 option 제시에는 verified source workspace/repository, branch/HEAD/base SHA, 변경·ownership·preservation state, planned relative doc paths, dependencies/order 및 branch candidate collision 결과를 포함한다.
3. **Source snapshot:** 초안 brief에는 실제 source identity와 입력 evidence를 기록한다. 예정 candidate/path를 실제 branch/worktree/path가 존재하는 것처럼 기록하지 않는다. 아직 생성되지 않은 managed worktree의 absolute path는 예정 경로로만 쓴다.
4. **Complete first draft:** Planner가 첫 필수 문서 전체와 self-review를 채팅으로 반환한다. Required spec이 있으면 spec을 먼저 작성한다. Spec이 불필요하고 plan만 필요한 경우 plan 전체를 먼저 작성한다. 이 시점에는 branch/worktree preparation, document save, staging, commit 또는 implementation handoff를 하지 않는다.
5. **Preparation gate:** Orchestrator는 first required draft와 Planner self-review가 완성됐는지, selected target/candidate/base와 source scope가 바뀌지 않았는지, mutation gate/ownership/preservation 조건이 유효한지 focused check한다. 전체 내용 검토는 준비된 target과 source를 비교한 뒤 document save 전에 수행한다. 미해결 사용자 결정이나 변화가 있으면 영향 범위를 보류한다.
6. **Actual target preparation:** Complete first draft/self-review 및 focused preparation gate가 끝난 뒤 기존 Git mutation gate를 다시 통과한다. 그 뒤 선택된 target만 준비한다. 실패·collision·부분 준비·unexpected state는 자동 retry/fallback 없이 보류한다.
7. **Target comparison:** Preparation 전 source evidence와 실제 prepared target의 path/repository/branch/HEAD/state, input/source changes를 비교한다. 영향이 없음을 확인한 evidence만 재사용한다. 차이·불명확성은 영향받는 범위를 hold한다.
8. **Document save and approval:** Target comparison 후 Orchestrator가 draft 전체를 검토하고, 범위 안의 보완은 같은 문서에 반영한다. 검토한 버전을 verified prepared target의 planned relative path에 저장하고 실제 저장본의 경로와 내용을 확인한 뒤 개별 문서 승인에 제시한다. Save, approval, commit은 서로 다른 상태로 기록한다.
9. **Dependent document:** Required spec 저장본이 개별 승인된 뒤 dependent plan stage를 시작한다. 이때 target은 이미 준비됐으므로 plan은 기존 target-bound workflow를 쓴다. Plan의 complete first draft/self-review는 계속 Planner가 작성한다.
10. **Document set and implementation:** 모든 required docs가 승인되고 기존 document commit/Git/handoff 조건이 충족된 뒤에만 Implementer를 시작한다. 일부 승인, 준비 완료, source draft 또는 CLI transition만으로 구현을 시작하지 않는다.

Current checkout 선택은 실제 checkout이 이미 존재한다는 뜻이므로 초안 뒤의 확인은 read-only target revalidation으로 끝날 수 있다. New branch는 승인된 base에서 생성한다. Managed worktree는 Planner 초안이 완성된 뒤에만 생성하며, app management/current-chat attachment/base/branch/source preservation을 확인한 뒤 새 문서를 해당 target에 직접 저장한다. 승인된 기존 문서의 transfer 규칙은 계속 별도 적용한다.

### 6.4 Source/target 변경 판정

- Source와 prepared target의 identity/state가 같고 관련 input hashes와 semantics가 유효하면 해당 근거를 재사용한다.
- Branch, HEAD, files, instructions, shared contracts, scope, criteria, method 또는 risk 변화는 영향 분석 후 영향받는 문서/evidence만 재검토한다.
- Target/candidate 변경, expected base 불일치, path ownership conflict, evidence source mismatch, unresolved input 또는 unknown/partial Git state는 dependent save/approval/handoff를 hold한다.
- Source draft evidence를 target evidence로 덮어쓰거나, 이후 HEAD의 동일성만으로 과거 approval/draft의 target validity를 주장하지 않는다.
- 수정으로 새로운 제품 결정이 필요하면 먼저 사용자 결정을 받는다. 기존 승인 범위가 바뀌지 않은 routine correction은 재승인을 요구하지 않는다.

## 7. Cooperative CLI runtime 계약

### 7.1 분리된 target 상태

Runtime은 actual observed source target과 user-selected target intent를 별도 state로 표현한다. Target intent에는 최소한 choice/approval reference, target kind, approved candidate/base, source target version, planned relative document path, workflow/stage identity를 연결한다. Planned target은 실제 준비 전까지 filesystem target identity나 valid document absolute path가 아니다.

### 7.2 Source-bound Planner stage

준비 전 Planner call과 결과는 observed source target/version에 결합한다. Runtime은 source stage/call/result history를 불변으로 유지하고 target intent를 준비 완료 선택으로 승격하지 않는다.

Chat response 자체는 CLI가 native provider evidence로 확인했다고 표현하지 않는다. Response reference와 그 의미는 cooperative/operator-attested provenance를 가진다. CLI가 raw response bytes를 직접 관찰하지 못하는 경로에서는 message reference나 Orchestrator hash attestation만으로 byte equality가 proven이 되지 않는다.

Draft result/evidence는 pending call, source stage, source targetVersion, input/criteria/scope versions, Planner result/self-review reference와 연결한다. 기존 stage reset, 새 workflow로의 이력 초기화, 무관한 artifact 대체를 허용하지 않는다.

### 7.3 Target preparation transition

Actual target을 준비한 뒤 별도 transition evidence를 기록한다. Evidence는 source 및 target의 실제 identity/versions, 선택된 intent/approval, operation result, branch/base/HEAD/path, changed files/index/ownership/preservation, 그리고 적용되는 경우 managed-worktree registration/current-chat attachment/source preservation을 연결한다.

Transition은 target version을 갱신하고 immutable history로 남긴다. 이전 source stage/call/approval의 targetVersion을 수정하거나 이를 destination에서 발생한 증거라고 표시하지 않는다. Destination에서 이어지는 문서/save/approval/plan stage는 destination의 최신 target version에 등록한다.

기존 state transition 함수와 schema에 대한 구체 변경은 후속 plan에서 결정하되, transition evidence가 없거나 두 identity를 일치시킬 수 없으면 hold한다. Branch 전환은 같은 path여도 branch/HEAD를 새로 관측한다. Managed worktree는 source와 다른 checkout identity/path를 명시한다.

### 7.4 Saved document 연결

Orchestrator가 prepared target에 문서를 저장한 뒤 runtime은 실제 destination file bytes/path/mode/hash를 관측한다. Saved document record는 source draft stage/result/message reference, target transition, actual prepared target/version, relative/absolute document paths, actual content hash, approval reference와 연결한다.

- Runtime이 source response bytes와 saved target bytes를 모두 실제로 관측하고 동일 hash를 비교한 경우에만 해당 byte equality를 proven으로 기록한다.
- Source bytes를 관측할 수 없고 Orchestrator 진술만 있으면 연결은 operator-attested로 남기며 실제 file bytes observation과 구분한다.
- Hash·messageRef는 semantic review, 사용자 승인 또는 target validity를 대신하지 않는다.
- Missing reference, hash mismatch, inaccessible artifact, path drift 또는 partial/unknown transition은 관련 artifact, approval, document save 및 dependent task를 hold한다.
- Draft content를 별도 persistent blob store에 복제하지 않는다. 그러한 저장소가 필요하다는 조사 결과가 나오면 별도 설계·승인을 요청한다.

Cooperative workflow는 actor identity와 semantic judgment의 독립 검증이 아니라는 기존 제한을 유지한다.

## 8. 기준 및 acceptance criteria

| ID | 기준 |
|---|---|
| AC-1 | Direct path는 F1–F8이 모두 proven일 때만 사용되고, Bounded plan omission은 기존 충분조건 충족과 기록을 요구한다. |
| AC-2 | 소수 known-source read는 Orchestrator가 처리할 수 있고 material/static exploration은 Scouter routing 기준을 따른다. |
| AC-3 | 관련 stage에서 유효한 Planner context를 재사용할 수 있고 구현 task마다 Planner를 재호출할 의무가 없다. |
| AC-4 | 최초 stage brief 하나와 delta/unchanged follow-up, 접근 가능한 동일-source evidence 재사용 규칙이 유지된다. |
| AC-5 | 한 plan의 모든 top-level task가 하나의 complete Planner plan draft에 포함된다. |
| AC-6 | Explicit target choice, scope approval, source snapshot 및 planned relative paths는 formal draft 이전에도 확인되지만 실제 preparation으로 오인되지 않는다. |
| AC-7 | 첫 필수 complete draft/self-review가 실제 branch/worktree preparation보다 앞서며, 준비 전 document save/stage/commit/Implementer handoff는 허용되지 않는다. |
| AC-8 | Source evidence와 target preparation evidence는 별도 identity/version/time 및 provenance로 보존된다. |
| AC-9 | Branch 및 managed worktree transition은 선택, actual Git/app state, base, branch/HEAD, ownership/preservation을 확인하며 mismatch는 hold한다. |
| AC-10 | Planner source stage/call history는 immutable하게 남고 target transition만으로 새 Planner call이 생기거나 old evidence가 target evidence로 재표시되지 않는다. |
| AC-11 | Draft result, self-review, target transition, destination file bytes/hash, document approval 및 approval provenance 사이의 연결이 기록된다. |
| AC-12 | Operator-attested source relationship은 proven byte equality나 native runtime enforcement로 보고되지 않는다. |
| AC-13 | Required spec approval 전에 dependent plan을 시작하지 않고 approved document set/commit/handoff 전 구현을 시작하지 않는다. |
| AC-14 | 두 플랫폼 prompt/reference/profile projection과 cooperative CLI가 같은 지원범위·hold 경계를 표현한다. |
| AC-15 | Existing QA/recheck, Reviewer timing, acceptance, focused commit, external authority, preservation 규칙이 유지된다. |

## 9. Verification criteria

Implementation/QA evidence는 최소한 다음 경우를 다룬다.

1. Complete draft 이후 same-checkout approved branch 준비 및 branch/HEAD 재관측.
2. Complete draft 이후 managed-worktree 생성, registration/attachment/base/source-preservation 확인.
3. Draft result와 self-review를 source version에 보존하고 target transition에 immutable하게 연결.
4. Wrong branch/base, unknown identity, changed inputs, ownership conflict, missing source/destination artifact, hash mismatch, partial transition에서 hold.
5. Target transition만으로 stage/call history가 reset/rewrite되지 않고 Planner가 불필요하게 재호출되지 않는지.
6. Prepared target에 저장된 spec만 current version approval을 받고 approved spec 전에 plan stage가 hold되는지.
7. Source bytes를 관측하지 못한 경우 operator-attested로 표시되고 proven으로 격상되지 않는지.
8. Direct/Bounded omit 경로, relevant-read routing, Planner context reuse 및 Codex/Claude 생성 parity.

Acceptance는 기준별 관찰 결과, unresolved gaps, scope 변경 및 unverified 제한을 기준으로 한다. 정확한 check/test 경로와 명령은 후속 plan에서 실제 저장소를 확인해 정한다. 실패/환경 제한은 성공으로 간주하지 않는다.

## 10. Dependencies and holds

- 첫 formal draft 전: explicit target choice, verified source snapshot, settled scope/depth/document set, required preceding design approval.
- 실제 preparation 전: complete first draft와 Planner self-review, focused target/candidate/base/source-state check, current Git state, ownership/preservation 및 mutation gate.
- Save/individual approval 전: prepared target identity, source↔target impact review, exact draft/save version, actual path/content evidence.
- Dependent plan 전: required spec가 prepared target에 저장·검토되고 별도 승인되어야 한다.
- Implementation 전: required documents 개별 승인, document commit/selection validity, final Git/readiness, full Implementer handoff.
- Unresolved target transition, unverified source bytes, change in scope/method/risk, missing approval, inaccessible evidence, worktree registration/attachment mismatch, unexpected dirty/index state 또는 partial operation은 영향받는 다음 단계만 hold한다. Unknown impact는 그 영향을 받는 dependent 범위만 hold한다.

## 11. 구현 surface 및 plan 경계

예상 source/projection 영역은 아래와 같다. 정확한 파일·task 분해는 승인 spec 이후 Planner가 작성하는 plan에서 확인한다.

- Canonical role policy: lib/policy/role-policy.json의 role.planner-draft-only, planning.planner-brief, 필요한 target-preparation policy.
- Planner prompt fragments: lib/prompts/agent-fragments.json의 planner.target-evidence와 workflow projection.
- Codex/Claude references: planning.md, coordination.md, handoff-prep.md, handoff-worktree.md.
- Generated role profiles 및 managed policy projection.
- Cooperative runtime: workflow initialization/state schema, Planner stage/evidence/result, target observation/transition, save/approval evidence 및 current target gate.
- Existing manifest/generated-output documentation은 변경 projection에 한해 후속 plan에서 정한다.

공통 requirement를 만족하는 최소 변경을 사용한다. Unrelated runtime operations, new profile count limits, new agent roles, independent artifact storage, external services, auto branch/worktree fallback은 포함하지 않는다.

## 12. Approval order

1. 이 written spec의 정확한 저장본을 검토하고 개별 승인한다.
2. 승인 spec에 종속된 complete implementation plan을 Planner가 작성한다.
3. Plan을 저장·검토하고 별도로 승인한다.
4. Complete approved document set, selected/prepared target, target evidence와 handoff를 확인한다.
5. Plan task별 Implementer/필수 QA/acceptance/commit 및 최종 Reviewer 절차를 수행한다.

## Self-review

- AC-1–AC-5는 즉시 적용 가능한 호출·읽기·근거 재사용 규칙을 실행 조건으로 명시한다.
- AC-6–AC-10은 target choice/source/prepared target 및 runtime source-stage 전이를 분리한다.
- AC-11–AC-12는 실제 bytes, hash, operator attestation과 native proof를 구분한다.
- AC-13–AC-15는 document approval 순서, QA/Reviewer, acceptance, commit 및 external authority 경계를 보존한다.
- Target transition의 exact data schema와 generated files의 범위는 승인 후 plan에서 확정한다. Managed worktree 경로를 포함한다.
- 이 spec의 최초 Orchestrator authorship은 사용자가 이번 문서에 한해 승인했다. 후속 plan 초안은 Planner가 작성한다.
