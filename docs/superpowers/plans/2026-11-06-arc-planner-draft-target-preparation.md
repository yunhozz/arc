# ARC Planner 작성 효율 및 target 준비 분리 구현 계획

> **실행 담당:** Orchestrator가 승인·의존성·소유권과 ARC handoff를 관리한다. Implementer가 승인된 task를 구현하고 필요한 QA가 검증한다. Planner는 이 최초 완전 plan 초안과 self-review를 작성했다.

**Goal:** 불필요한 Planner 호출과 자료 재확인을 줄이고, 첫 필수 문서 초안을 실제 target 준비 전에 작성한 뒤 cooperative CLI에서 source 이력과 prepared target을 안전하게 연결한다.

**Architecture:** 기존 workflow 안에서 source target, target intent, 준비 직전 checkpoint, 실제 target transition, destination 문서 연결을 구분한다. 기존 source stage와 호출 이력은 보존하고 일반 target gate를 유지하며, 검증된 준비 전이에만 좁은 예외를 둔다.

**Tech Stack:** Node.js ESM, `node:test`, 기존 cooperative runtime·정책/prompt renderer·Codex/Claude 배포 projection, 기존 Python 정책 계약 테스트.

- **Spec:** `/Users/yunho/Desktop/project/arc/docs/superpowers/specs/2026-11-06-arc-planner-draft-target-preparation-spec.md`
- **승인 spec SHA-256:** `6bbde0b1a1703945d2e65f766aa8976b53eae2c05880da041942cd7abb7f6065`
- **Plan 저장 경로:** `/Users/yunho/Desktop/project/arc/docs/superpowers/plans/2026-11-06-arc-planner-draft-target-preparation.md`
- **상태:** 정식 plan — 사용자 승인 완료
- **승인 기록:** 이 대화에서 사용자가 “승인”으로 응답 (2026-11-06).

## Global Constraints

- 승인 범위는 A(첫 필수 문서 초안만 실제 준비 전에 작성)와 R2(cooperative CLI runtime 지원)다.
- current checkout, new branch, managed worktree를 지원하며 기존 platform/tool 권한 제한을 유지한다.
- target choice와 실제 target 준비를 분리한다. 준비 전 save/stage/commit/Implementer handoff는 허용하지 않는다.
- 첫 required complete draft와 Planner self-review 후 focused preparation gate를 확인한다. Full Orchestrator review는 source↔prepared target 비교 뒤 save 전에 한다.
- required spec 승인 뒤 dependent plan을 작성한다. Spec이 불필요한 경우 새 spec 의무를 만들지 않는다.
- source stage/call/result/approval 및 과거 targetVersion을 다시 쓰지 않는다.
- source response bytes를 관측하지 못한 연결은 operator-attested로 유지한다. messageRef/hash만으로 byte equality나 native provider provenance를 증명하지 않는다.
- 새 persistent draft blob store, 자동 workflow reset/migration, 새 agent role, 자동 Git fallback/retry는 추가하지 않는다.
- 기존 QA/recheck, 최종 Reviewer, acceptance, focused commit, source preservation 및 외부 작업 권한을 유지한다.
- 이 plan 자체는 test 실행 권한이 아니다. 실행 brief에는 actor, workspace, 임시 경로와 정리 범위를 명시한다.

## 근거 및 검토 초점

| 근거 | 적용 내용 |
|---|---|
| 승인 spec §6, `:80–120` | 효율 규칙과 첫 draft→준비→비교→save 순서 |
| 승인 spec §7, `:122–154` | source stage, target transition, bytes와 attestation |
| 승인 spec §8–10, `:156–199` | AC-1–AC-15, verification·hold |
| `lib/runtime/bootstrap.mjs:7–35` | runtime inventory/hash, target 기반 초기화 |
| `lib/runtime/cooperative.mjs:16–62,179–207` | sameCheckout/lock, target 및 artifact 관측, history 조회 |
| `lib/runtime/evaluate.mjs:186–212,255–340` | target/version gate, Planner stage/result/review |
| `lib/runtime/schema.mjs:83–96`, `lib/runtime/cooperative-schema.mjs:32–76` | stage·artifact·ready 불변식 및 record envelope |
| `lib/runtime/scope.mjs:21–35`, `lib/runtime/git-evidence.mjs:59–98` | checkout/branch/HEAD, 고정 read-only Git 증거 |
| `codex/skill/references/handoff-worktree.md:9–53` | managed worktree 생성·등록·attachment·source 보존 |
| `scripts/update-role-policy.mjs`, `scripts/update-runtime-assets.mjs`, `scripts/update-manifest.mjs` | canonical source에서 projection 생성과 drift 확인 |

T2는 다섯 위험을 반드시 다룬다.

1. 같은 path에서 branch만 바뀌었는데 과거 Git 증거를 재사용하는 경우.
2. 같은 common directory의 무관한 worktree가 workflow를 가져가는 경우.
3. chat 완료 진술이나 hash를 실제 source bytes 관측으로 격상하는 경우.
4. replay·중단·save 실패로 targetVersion이나 최초 call history를 중복 변경하는 경우.
5. 준비 전 문서 save/approval 또는 required spec 승인 전 dependent plan이 통과하는 경우.

## 공통 구현 결정

### D1. 한 workflow의 명시적 전이

기존 `record` envelope에 다음 evidence kind를 추가한다. 새 workflow로 history를 복사하거나 source stage를 destination에서 발생한 것처럼 바꾸지 않는다.

| kind | 시점 | 의미 |
|---|---|---|
| `target-intent` | 첫 draft 전 | 사용자 선택과 관측된 source 연결 |
| `target-checkpoint` | complete draft/self-review 후, 실제 준비 직전 | source·candidate/base·보존 조건 재확인 |
| `target-transition` | 실제 준비 후 | source와 destination의 독립 관측 연결 |

Branch/worktree 생성은 기존 방식대로 Orchestrator가 수행한다. CLI는 Git 준비를 실행하지 않는다.

### D2. State와 result 계약

기존 state에 선택적 관계를 둔다.

- `targetIntents[]`: 선택 reference, kind, approved candidate/base, source identity/version, 승인 문서 set 및 relative paths.
- `targetCheckpoints[]`: intent, source stage/result/self-review refs, 준비 직전 source 관측과 focused gate ref.
- `targetTransitions[]`: intent/checkpoint, 이전·이후 identity/version, actual Git 및 worktree evidence refs, 결과와 관측 시각.
- source stage `draftContext`/`draftCompletion`: intent/path/sourceVersion, complete result/self-review와 provenance.
- destination `draftOrigin`: source stage/result/self-review, transition, destination full-review ref.

일반 stage의 `ready` 의미는 유지한다. 준비 전 draft completion은 `ready`를 의미하지 않으며, 문서 승인 또는 실행 준비 상태가 아니다. Missing field를 이유로 history를 초기화하지 않으며 기존 runtime/policy hash mismatch는 hold한다.

### D3. Chat result와 bytes 분리

준비 전 source stage는 pending call에 연결된 response reference와 Orchestrator의 completion/저작권/의미 판단을 `operator-attested`로 기록할 수 있다. 실제 source artifact bytes를 관측한 경우 별도 `local-bytes` evidence로 기록한다.

새 blob store나 예정 문서 파일은 만들지 않는다. Source bytes가 없으면 source→saved content 관계는 attested로 남긴다. Byte equality를 요구하는 주장·검증은 hold하되 모든 reference 연결을 금지하지 않는다. 실제 hash mismatch는 관련 연결·승인·dependent work를 hold한다.

### D4. Transition 이후

- Branch/worktree 변화는 fresh actual evidence로 확인하고, 성공한 transition만 targetVersion을 한 번 증가시킨다.
- 과거 source stage/version/call/result/approval은 보존한다. 자동 Planner 재호출, source stage 재작성, replay 전이는 금지한다.
- Destination full review, saved document와 개별 approval은 현재 targetVersion에 결합한다. Dependent plan은 destination에서 새 stage로 등록한다.
- Scope가 유지될 때만 기존 approval refs를 연결해 재사용하며, 이전 승인이 새 version에서 일어난 것으로 고치지 않는다.
- Active Implementer, 관련 미해결 execution intent 또는 ownership conflict가 있으면 전이를 hold한다.

## Task 순서

| Task | 선행 조건 | 산출물 |
|---|---|---|
| T1 | Plan 승인, 전체 문서 set·commit·handoff | 즉시 적용할 효율 규칙의 canonical policy와 projections |
| T2 | T1 acceptance·QA·Orchestrator commit | target preparation 분리의 policy/runtime/worktree 통합 계약 |

공유 policy/reference/manifest 때문에 T1→T2 순서로 진행한다. T2의 policy/schema/runtime/worktree/generated contract는 하나의 acceptance 단위다. 각 task는 acceptance 뒤 focused Orchestrator commit을 만든다. Reviewer는 task마다 배정하지 않고 최종 full change에 한 번 배정한다.

## T1 — 기존 효율 경로의 적용 규칙 명확화

**범위:** 승인 spec AC-1–AC-5 및 관련 AC-14/AC-15. 이 task에서는 drafting/preparation 순서를 바꾸지 않는다.

**Files**

- Modify: `lib/policy/role-policy.json`, `lib/prompts/agent-fragments.json`, Codex/Claude `coordination.md`와 `planning.md`, `tests/test_arc_policy.py`, `tests/node/agent-fragments.test.mjs`, `tests/node/role-policy.test.mjs`, `tests/node/fixtures/instruction-contracts.json`.
- Generated: `POLICY_TARGETS`가 지정한 실제 출력 파일의 managed policy blocks, `codex/skill/runtime/role-policy.json`, `claude/skill/runtime/role-policy.json`, `MANIFEST.sha256`.
- Read/verify: `lib/policy/render.mjs` (source renderer/registry), Codex/Claude `SKILL.md`, `lib/prompts/render.mjs`, `tests/node/instruction-layout.test.mjs`, 기존 profile renderer tests.

**Interfaces:** 기존 F1–F8, depth/omission, ownership, source fingerprint, 8-field brief 계약을 소비한다. 기존 계약의 적용 조건과 generated projection만 명확히 하며 runtime operation/schema/state는 바꾸지 않는다.

**Acceptance criteria**

- Direct path는 모든 기존 조건이 proven일 때만 사용하고 미검증 조건은 full evaluation으로 보낸다.
- Known-source 소수 파일 read와 넓은 Scouter 조사를 구분한다.
- 유효한 Planner context 재사용, complete stage brief와 delta follow-up, 같은 source 근거 재사용 및 changed source 재확인을 명시한다.
- 한 plan의 모든 task는 하나의 complete Planner plan draft에 포함하고 task별 재호출 의무를 만들지 않는다.
- 최초 저작권, 승인, 위험별 검증, fresh Implementer/QA 경계를 유지한다.
- Existing instruction-layout fixture는 실제로 바뀐 canonical/generated policy bytes 3개와 Planner 확장 profile 기준 2개만 갱신한다. 그 밖의 protected bytes와 profile 기준은 보존한다.

**Steps**

- [ ] AC-1–AC-5 및 보존 경계를 기존 policy tests/fixtures로 검증하는 cases를 추가한다. 새 호출 횟수 cap이나 파일 수 threshold는 만들지 않는다.
- [ ] Focused RED를 확인하고 환경/baseline 실패를 요구 규칙의 실패로 오인하지 않는다.
- [ ] Canonical policy/fragment 및 두 플랫폼 reference를 수정한다. Known-file read를 불필요하게 재설계하지 않고 기존 target-preparation gate를 T2까지 유지한다.
- [ ] 정본에 연결된 generated outputs를 갱신한다.

  ```sh
  node scripts/update-role-policy.mjs
  node scripts/update-runtime-assets.mjs
  node scripts/update-manifest.mjs
  ```

- [ ] Changed output bytes가 확정되면 `instruction-contracts.json`에서 실제 영향받은 세 policy JSON hash와 두 expanded Planner profile hash만 갱신한다. Raw profile templates와 다른 보호 항목을 유지하고 layout fixture를 확인한다.

- [ ] Focused GREEN, 필수 QA 및 drift check를 수행한다.

  ```sh
  python3 -B -m unittest discover -s tests -p test_arc_policy.py
  node --test tests/node/agent-fragments.test.mjs tests/node/role-policy.test.mjs tests/node/profile-render.test.mjs tests/node/runtime-assets.test.mjs tests/node/runtime-versions.test.mjs
  node --test tests/node/instruction-layout.test.mjs
  node scripts/update-role-policy.mjs --check
  node scripts/update-runtime-assets.mjs --check
  node scripts/update-manifest.mjs --check
  ```

  Fresh QA는 승인된 임시 경로에서 command와 변경 계약을 확인한다. Prompt structure check를 실제 agent 행동의 독립 검증이라 보고하지 않는다.
- [ ] Orchestrator가 AC evidence·findings·보존 상태를 acceptance한 뒤 focused commit을 만든다. 권고 message: `refactor: clarify ARC planner efficiency paths`.

**Holds:** 기존 gate 약화, source 재사용 조건 누락, generated drift, 필수 check failure 또는 미해결 finding.

## T2 — 첫 초안과 실제 target 준비 분리

**범위:** 승인 spec AC-6–AC-15 및 runtime에 연결되는 omission 경계. Current checkout, new branch, managed worktree를 같은 source→prepared 모델로 지원하되 기존 platform/tool 권한은 유지한다.

**Files**

- Create: `lib/runtime/target-preparation.mjs`, `tests/node/runtime-target-preparation.test.mjs`, `tests/node/runtime-target-preparation.integration.test.mjs`.
- Modify: `lib/runtime/bootstrap.mjs`, `lib/runtime/cooperative-schema.mjs`, `lib/runtime/cooperative.mjs`, `lib/runtime/evaluate.mjs`, `lib/runtime/schema.mjs`, `lib/runtime/verification.mjs`, `lib/runtime/git-evidence.mjs`, `lib/runtime/store.mjs`, `lib/installer/runtime-assets.mjs`, `lib/policy/role-policy.json`, `lib/prompts/agent-fragments.json`, Codex/Claude `planning.md`, `coordination.md`, `handoff-prep.md`, `handoff.md`, Codex `handoff-worktree.md`, `docs/runtime/planner-hook-context.md`, `tests/node/runtime-cooperative.test.mjs`, `tests/node/runtime-schema.test.mjs`, `tests/node/runtime-store.test.mjs`, `tests/node/runtime-git-evidence.test.mjs`, `tests/node/runtime-cli.test.mjs`, `tests/node/runtime-codex.test.mjs`, `tests/node/runtime-claude.test.mjs`, `tests/node/runtime-versions.test.mjs`, `tests/node/runtime-assets.test.mjs`, `tests/node/fixtures/instruction-contracts.json`, `tests/test_arc_policy.py`.
- Read/verify: `lib/policy/render.mjs`, `lib/prompts/render.mjs`, `tests/node/instruction-layout.test.mjs`.
- Generated: changed policy blocks in configured `POLICY_TARGETS`, both platform copies of changed runtime modules and `target-preparation.mjs`, Codex/Claude runtime `role-policy.json`, `MANIFEST.sha256`.

`lib/runtime/store.mjs`는 일반 target 재결속 제한을 유지하면서, 같은 atomic revision의 유효한 `target-transition`만으로 target identity를 한 번 갱신하도록 검증한다. 이 좁은 경로 외에는 target rebind를 허용하지 않고 일반 operation allowlist도 완화하지 않는다. 새 top-level CLI command나 범용 migration API는 추가하지 않는다.

**Dependencies:** T1 acceptance/commit과 갱신된 handoff.

### Interfaces

새 module은 다음 책임을 제공한다.

```text
validateTargetPreparationRecord(kind, data)
  -> validated data / validation error

readTargetPreparationEvidence({
  state, targetIntent, destination, observe, readChanges, gitRunner
})
  -> separately observed source/destination Git and preservation evidence

evaluateTargetPreparation({state, request, evidence})
  -> GateDecision with a narrowly scoped proposedTransition

applyTargetPreparationTransition({state, decision})
  -> new cooperative state
```

- CLI arguments의 자기 선언을 trusted observation으로 받지 않는다. Observer/Git runner injection은 코드 측 test boundary로만 제공한다.
- `readCooperativeChanges`는 기존 fingerprint를 유지하면서 transition comparison용 snapshot을 제공할 수 있다. Branch identity hash만으로 source contents 보존을 판정하지 않는다.
- Git reader의 fixed read-only query, 환경 override 제거, path/symlink/regular-file/read-race 검증을 보존한다.
- `COOPERATIVE_RUNTIME_MODULES`와 `RUNTIME_MODULE_PATHS`에 새 module을 등록한다. Runtime id는 `cooperative-6`으로 올리고 기존 hash state를 자동 갱신하지 않는다.

### 필수 validation 계약

**Intent:** Current source target/version, 선택 reference, target kind, candidate/base, 승인된 문서 set과 normalized relative paths에 결합한다. `..`, absolute/escape path, symlink escape, 무관한 stage/document를 reject한다. Plan-only 경로의 spec omission은 승인된 depth/document set에 결합해 caller boolean으로 prerequisite를 우회할 수 없게 한다.

**Checkpoint:** 같은 intent의 first required stage에 complete result와 self-review가 있어야 한다. Pending/unknown Planner call, stale source identity/input/preservation, changed candidate/base는 hold한다. 전체 내용 review를 요구하는 gate와 구분한다.

**Transition:**

- Workflow/state revision, runtime/policy version, intent/checkpoint를 일치시킨다.
- Source와 destination은 같은 repository common directory에 속해야 한다.
- New branch는 candidate/base/actual branch/HEAD와 source preservation을 확인한다.
- Managed worktree는 별도 realpath/gitDir, 실제 Git registration, base/branch, source preservation을 확인한다. App management/current-chat attachment는 별도 reference/provenance로 확인하며 Git registration만으로 추정하지 않는다.
- Current checkout은 Git mutation 없이 read-only revalidation한다.
- Active implementation/미해결 관련 execution intent가 있으면 전이를 막는다.
- 성공 전이는 targetVersion을 한 번만 올리고 replay는 hold한다. Source ledger·선택·과거 approval을 덮어쓰지 않는다.

**Destination document:** Prepared target 내부 actual regular-file bytes/path/mode/hash를 관측하고 source stage/result/self-review, transition, destination full review, 현재-version approval을 연결한다. Source bytes가 없으면 attested link로 남긴다. 양쪽 bytes를 관측했을 때만 해당 bytes의 equality를 proven으로 기록하며 semantic/native-source proof로 확대하지 않는다.

**Acceptance criteria**

- AC-6–AC-15를 충족하고 준비 전 complete chat result가 saved/approved/ready 상태가 되지 않는다.
- 일반 command의 sameCheckout/current-target gate를 유지하고 정확히 검증된 `target-transition`만 scoped exception으로 인정한다.
- Source history reset/overwrite, 자동 Planner 재호출, 새 workflow 우회를 금지한다.
- Managed worktree의 기존 app 전용 생성·registration/attachment·source preservation을 유지하며 Claude에 없는 host 권한/fallback을 추가하지 않는다.
- 실패 시 관측 사실과 불확정 범위를 기록하고 자동 Git recovery/retry/cleanup을 하지 않는다.

**Steps**

- [ ] Pure/injected tests를 먼저 추가한다. 최소 coverage: source draft attestation은 `ready`가 아님; checkpoint에는 완전 draft/self-review 필요; same-checkout branch 전이는 identity를 한 번 갱신; unrelated linked worktree는 hold; ordinary command는 foreign checkout을 거부; transition replay는 authority/version/calls를 바꾸지 않음; source refs는 byte equality를 증명하지 않음; 실제 destination bytes/hash 관측 및 mismatch/escape/mode hold; required spec approval이 plan을 gate; source stage/calls/approval 불변; unknown/partial/persistence failure에서 allow 없음.
- [ ] Focused RED를 확인한다.

  ```sh
  node --test tests/node/runtime-target-preparation.test.mjs tests/node/runtime-schema.test.mjs tests/node/runtime-cooperative.test.mjs
  ```

  여기서는 Git runner/observer 주입 fixture만 실행한다. Git을 실제로 만드는 integration suite는 실행하지 않는다.
- [ ] Schema와 pure evaluator를 구현해 draft completion과 일반 ready 불변식을 분리한다. 기존 state/history를 새 빈 history로 바꾸지 않는다.
- [ ] Source/destination을 따로 읽어 lock 아래 재관측하고, 일반 sameCheckout/target gate는 유지한다. 엄격한 transition request만 evaluator에 보낸다. 기존 revision/fingerprint/durable save/lock cleanup을 보존한다.
- [ ] Prepared-target document 저장 뒤 actual bytes를 관측하고 full review/approval을 current targetVersion에 결합한다. Source stage의 `ready`를 바꾸지 않는다.
- [ ] Policy/profiles/handoff 순서를 함께 갱신한다. Formal drafting gate는 source/intent 기준, save/handoff gate는 prepared target 기준으로 둔다. Worktree registration/attachment는 first chat draft 후에 허용하되 saving/transfer/staging/commit/Implementer 전에 요구한다. `planning.md`, `handoff.md`의 blanket prepared-target wording도 적용 범위에 맞춘다. Legacy transfer 규칙을 새 문서 저장에 재사용하지 않는다.
- [ ] Actual Git integration suite를 `ARC_RUN_GIT_INTEGRATION=1` gate로 만들고 Orchestrator-only라 표시한다. Independent temporary repository에서 source draft→checkpoint→same-checkout branch transition→destination spec save/approval→plan, linked-worktree registration/preservation, wrong branch/base/source drift/unrelated changes/other repository/symlink/missing app evidence holds, pre-transition save/approval/plan rejection, interruption/replay history preservation을 확인한다. App attachment mock은 operator-attested이며 live Codex app 검증으로 주장하지 않는다.
- [ ] Generated outputs와 `docs/runtime/planner-hook-context.md`를 갱신하고 policy/runtime/manifest drift를 확인한다. External skill 및 사용자별 설정은 수정하지 않는다.
- [ ] T2 변경 output이 안정된 뒤 `tests/node/fixtures/instruction-contracts.json`에서 실제로 바뀐 protected runtime/policy bytes와 expanded Planner profile hash만 갱신한다. T1 기록과 영향 없는 protected hash는 유지하고 `tests/node/instruction-layout.test.mjs`로 확인한다.
- [ ] Focused GREEN 및 fresh QA를 수행한다.

  ```sh
  node --test tests/node/runtime-target-preparation.test.mjs tests/node/runtime-cooperative.test.mjs tests/node/runtime-schema.test.mjs tests/node/runtime-store.test.mjs tests/node/runtime-git-evidence.test.mjs tests/node/runtime-cli.test.mjs tests/node/runtime-codex.test.mjs tests/node/runtime-claude.test.mjs tests/node/runtime-versions.test.mjs tests/node/runtime-assets.test.mjs tests/node/agent-fragments.test.mjs tests/node/role-policy.test.mjs tests/node/instruction-layout.test.mjs
  python3 -B -m unittest discover -s tests -p test_arc_policy.py
  node scripts/update-role-policy.mjs --check
  node scripts/update-runtime-assets.mjs --check
  node scripts/update-manifest.mjs --check
  ```

  Orchestrator-only:

  ```sh
  ARC_RUN_GIT_INTEGRATION=1 node --test tests/node/runtime-target-preparation.integration.test.mjs
  ```

  QA는 command·temporary target·결과·제한을 독립 report에 연결한다. 실패는 수정 및 필요한 QA 재검증으로 돌린다. App/native 미검증 범위는 unverified로 둔다.
- [ ] Orchestrator가 AC-6–AC-15, omission, 필수 check/QA/findings를 acceptance한 뒤 focused commit을 만든다. 권고 message: `feat: separate planner drafts from target preparation`.

**Holds:** 일반 target gate 확대 완화, source history rewrite, unrelated worktree 수용, hash/messageRef만의 `proven` 판정, 새 blob store/권한 요구, 미해결 Git/durability/ownership/scope/approval/input delta, 자동 migration/reset 요구, 또는 spec §10 bytes hold와 §7.4의 attested 연결 간 불일치.

## 최종 검증과 Reviewer

T1·T2 acceptance/commit 및 필수 QA가 끝난 뒤 한 번 수행한다.

1. Orchestrator가 공통 영향 전체 회귀를 확인한다.

   ```sh
   npm test
   python3 -B -m unittest discover -s tests -p test_arc_policy.py
   node scripts/update-role-policy.mjs --check
   node scripts/update-runtime-assets.mjs --check
   node scripts/update-manifest.mjs --check
   node scripts/check-installer-parity.mjs
   ```

   이는 policy/runtime/installer 공통 영향의 최종 범위다. Task마다 전체 suite를 무조건 실행하지 않는다. Integration skip은 실제 Git 성공으로 세지 않는다.

2. 독립 Reviewer가 승인 spec, T1/T2 AC evidence, 전체 변경, scoped runtime transition, proven/attested 경계, managed worktree와 generated output을 한 번 검토한다.
3. 최종 Reviewer findings는 Implementer→Reviewer로 해결한다. 최종 단계 finding 수정에 QA를 재배정하지 않지만 첫 최종 review 전 필수 QA와 QA failure recheck는 유지한다.
4. Orchestrator가 residual unverified 범위, host/app 제한, baseline/current failure, commit과 approval version 관계를 보고한다. Push/publish/deploy는 제외한다.

## Evidence와 실패 처리

각 report는 task/AC, actor, command, actual target/version, 결과, artifact 위치 및 claim limits를 연결한다.

- 최초 실패를 기록하고 baseline/current를 구분한다.
- 영향 범위와 dependency를 기록하며 영향이 불명확하면 그 범위만 hold한다.
- 무관한 승인 작업은 기존 조건을 재확인한 뒤 진행할 수 있다.
- 필수 check unresolved 시 관련 acceptance를 hold한다.
- 실패를 이유로 required check를 제거하거나 미실행을 pass로 바꾸지 않는다.

## 전제·미해결 항목

- 사용자는 2026-11-06 이 대화에서 written spec을 승인했다. 현재 저장본 SHA-256은 `6bbde0b1a1703945d2e65f766aa8976b53eae2c05880da041942cd7abb7f6065`이다.
- 관측된 HEAD는 base와 같지만 문서/T1 commit 뒤 정상 이동한다. Base SHA에 영구 고정하지 않는다.
- 원 response bytes가 없어도 §7.4의 attested link를 사용하되 byte equality는 주장하지 않는다.
- Managed worktree는 기존 지원 platform/tool 경로에서만 준비한다. Shared runtime 지원을 새 host 권한으로 해석하지 않는다.
- 기존 Python contract assertion이 구 순서를 고정한 곳은 새 순서 및 save/approval 경계를 검증하도록 갱신하며 failing test 제거로 통과시키지 않는다.
- 시간 절감 측정 기반이나 수치 목표는 새로 만들지 않는다.

## Self-review

- **Spec coverage:** AC-1–AC-5는 T1, AC-6–AC-15 및 runtime prerequisite는 T2에 연결했다.
- **Task boundaries:** 효율 규칙은 독립 acceptance 가능하다. 준비 분리의 policy/schema/runtime/worktree/generated 계약은 T2에 통합했다.
- **Dependencies:** 공유 files/policy/manifest 때문에 T1→T2 순서를 명시했다.
- **Evidence:** source completion, actual preparation, destination bytes, review, approval을 분리하고 response ref를 byte 증명으로 격상하지 않는다.
- **Verification:** 다섯 Review Focus를 T2 coverage에 연결했으며 actual Git integration의 Orchestrator 전용 경계와 host/app 검증 한계를 명시했다.
- **Approval/review:** 승인 spec에 종속된 plan이다. Plan 개별 승인 및 전체 문서 set/handoff 전 구현하지 않으며 Reviewer는 final full change에 한 번 배정한다.
- **Worktree:** same-checkout branch에 국한하지 않고 기존 app 관리·attachment·source 보존과 platform 제약을 유지한다.
- **미수행:** 이 plan draft 작성 중 구현, test 실행, Git 변경은 하지 않았다.
