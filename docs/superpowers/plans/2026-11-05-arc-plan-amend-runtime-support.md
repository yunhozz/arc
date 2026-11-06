# ARC plan-amend runtime 지원 실행계획

| 항목 | 값 |
|---|---|
| 버전 | v1.1, Orchestrator 승인 — 사용자 위임 승인 권한 |
| 계획 승인 일시 | 2026-11-05 |
| 저장소 | `/Users/ma-24-007/Desktop/workspace/arc` |
| branch / 준비 기준 HEAD | `refactor/arc-instructions` / `0b46ffdd9b8ac0c146af3ecec1b184286c8bed04` |
| 설계 | 승인된 명세 v1.2 `/Users/ma-24-007/Desktop/workspace/arc/docs/superpowers/specs/2026-11-05-arc-plan-amend-runtime-support.md` |
| 계획 경로 | `/Users/ma-24-007/Desktop/workspace/arc/docs/superpowers/plans/2026-11-05-arc-plan-amend-runtime-support.md` |
| 원 TASK-01 | `/Users/ma-24-007/Desktop/workspace/arc/docs/superpowers/plans/2026-11-05-arc-plan-amend-tdd-precedence.md` |

## 목표와 범위

Cooperative CLI에 durable `prepare plan-amend` intent와 동일 intent reconciliation을 추가한다. CLI는 승인·안전 증거를 확인하고 로컬 Git 결과를 관찰한다. 실제 history rewrite는 계속 Orchestrator만 수행한다.

구현 대상은 canonical runtime, 기존 Codex/Claude runtime copy, runtime 회귀 테스트와 task-specific manifest/index 처리다. `prepare`, `reconcile` command envelope는 유지하고 새 runtime version `cooperative-5`를 사용한다. 새 runtime module은 만들지 않는다.

사용자 승인은 다음 범위에 한정되며, 이 대화에서 후속 ARC 승인 gate를 Orchestrator가 대리 처리하도록 위임받았다.

- Runtime task의 targeted 회귀 테스트를 작성하고 실행한다.
- Superpowers 원문은 수정하지 않는다.
- 원 TASK-01의 테스트 코드·assertion·test case 수정 및 테스트 실행은 금지한다. 그 작업의 C6는 테스트 코드 변경 여부와 prompt-only 실행 감사 한계로 분리한다.
- Push, merge, deploy, publish, 설치는 하지 않는다.

## 승인과 시작 조건

사용자가 bounded runtime 설계와 별도 runtime 회귀 테스트를 승인했고, 이후 이 대화의 ARC 승인 gate를 Orchestrator에게 위임했다. Orchestrator는 spec v1.2와 계획 v1.1을 검토해 해당 위임 권한으로 승인했다. 준비 문서 docs-only commit 및 최신 handoff gate 확인 전에는 구현이나 테스트를 시작하지 않는다.

계획 문서 commit 및 각 task handoff 직전에 실제 branch, HEAD, staged·unstaged·untracked 상태, 파일 소유권, workflow version과 writer 중지를 다시 확인한다. 위 기준 HEAD는 현재값으로 재사용하지 않는다.

## 현재 변경과 보존 경계

준비 시점 working tree에는 원 TASK-01 소유의 unstaged 변경이 11개 있다.

- `MANIFEST.sha256`
- `codex/skill/SKILL.md`, `claude/skill/SKILL.md`
- 양 플랫폼 `skill/references/{commit,coordination,handoff}.md`
- `lib/prompts/agent-fragments.json`
- `tests/node/fixtures/instruction-contracts.json`

기존 owner는 완료된 `/root/implementer_plan_amend_tdd_rules`이며 현재 active writer는 없다. 이 변경은 runtime plan·implementation commit에 포함하지 않는다. Stash, reset, discard, 임의 cleanup으로 정리하지 않는다.

`MANIFEST.sha256`는 두 task가 공유한다. Docs-only manifest input에서 `docs`와 `tests`를 제외한다. Runtime commit용 staged manifest는 runtime task 전용 snapshot에서 산출하며 원 TASK-01의 working-tree 값을 stage하지 않는다. 분리 증거를 만들 수 없으면 commit을 보류한다.

원 TASK-01의 C6에 대해 이미 승인된 amendment는 다음과 같다.

- **검증 가능한 조건:** 원 TASK-01에서 테스트 코드, assertion 또는 test case를 추가·수정하지 않았다. 전체 diff와 변경 경로로 확인한다. 기존 기대 fixture의 데이터 갱신은 테스트 코드 변경과 구분한다.
- **감사 한계:** 원 TASK-01 기간에 테스트를 실행하지 않았다는 사실은 Implementer 보고·명령 기록에 근거한다. Prompt-only 환경은 모든 외부 실행을 독립 감사하지 못하므로 이를 독립 검증으로 표시하지 않고 한계로 기록한다. 이 한계만으로 acceptance를 막지 않는다.

Runtime regression은 별도 runtime task의 증거로만 취급하며 원 TASK-01 테스트 제한을 바꾸지 않는다.

## 초기 계획 문서 준비 — Orchestrator

1. Spec 승인 version/hash와 계획 승인 참조를 기록한다.
2. 다음 두 문서만 stage한다.

   ```text
   docs/superpowers/specs/2026-11-05-arc-plan-amend-runtime-support.md
   docs/superpowers/plans/2026-11-05-arc-plan-amend-runtime-support.md
   ```

3. 기존 `MANIFEST.sha256`와 원 TASK-01 변경이 index에 없는지 확인한다.
4. 새 runtime 작업을 위한 별도의 docs-only planning commit을 만들고 SHA·parent·경로·내용을 기록한다.
5. 이 commit은 원 계획 commit의 fixup이나 대체물이 아니다. Runtime 구현 task의 독립된 계획 commit이다.

## 단일 구현 작업

### TASK-01 — plan-amend intent·관찰·reconciliation

한 fresh Implementer가 아래 승인 경로를 맡는다. Runtime source, generated copies, 회귀 tests와 version/manifest fixture는 하나의 불가분 변경으로 수용한다. Specialist는 stage·commit 및 다른 Git 변경을 하지 않는다.

**목표:** `prepare plan-amend`가 안전 증거와 승인 chronology를 검증하고 durable intent를 남기며, 동일 intent reconciliation만 실제 local Git 결과를 확인해 target을 갱신한다.

### Implementer가 수정할 canonical source

- `lib/runtime/cooperative-schema.mjs` — 새 operation·intent·checkpoint·result schema
- `lib/runtime/operations.mjs` — Orchestrator 전용 plan-amend operation 선언
- `lib/runtime/evaluate.mjs` — 준비·checkpoint·전용 reconciliation 판정
- `lib/runtime/git-evidence.mjs` — 읽기 전용 document/history/mapping/ref 관찰
- `lib/runtime/cooperative.mjs` — intent 저장·reconciliation·예상된 target HEAD 갱신
- `lib/runtime/store.mjs` — 검증된 amendment 전이 저장
- `lib/runtime/bootstrap.mjs` — `cooperative-5` version과 동일 module inventory 유지

`lib/runtime/command.mjs`, `lib/runtime/acceptance.mjs`, `lib/runtime/scope.mjs`, `lib/policy/role-policy.json`은 보호 대상이다. 이들이 실제로 필요해지면 해당 task를 중지하고 Orchestrator가 범위·승인·영향을 재평가한다. 일반 commit gate를 완화하지 않는다. 새 runtime module이나 module inventory 확대는 허용하지 않는다.

### Generated runtime copies

`scripts/update-runtime-assets.mjs`로 다음 canonical 파일을 두 플랫폼에 생성한다.

- `cooperative-schema.mjs`
- `operations.mjs`
- `evaluate.mjs`
- `git-evidence.mjs`
- `cooperative.mjs`
- `store.mjs`
- `bootstrap.mjs`

Target directories:

- `codex/skill/runtime/`
- `claude/skill/runtime/`

### 회귀 test 소유권과 실행 범위

새 test는 `tests/node/runtime-plan-amend.test.mjs`에 둔다. 필요한 기존 cases는 아래 파일에서만 수정한다. 기본 runtime regression 명령은 이 파일들과 새 test를 포함한다.

- `tests/node/runtime-cooperative.test.mjs`
- `tests/node/runtime-evaluate.test.mjs`
- `tests/node/runtime-git-evidence.test.mjs`
- `tests/node/runtime-schema.test.mjs`
- `tests/node/runtime-store.test.mjs`
- `tests/node/runtime-workflow.integration.test.mjs`
- `tests/node/runtime-cli.test.mjs`
- `tests/node/runtime-assets.test.mjs`
- `tests/node/runtime-installed-entry.test.mjs`
- `tests/node/runtime-versions.test.mjs`

TDD 순서:

1. Implementer가 amendment prepare·result, evidence·mapping·freshness·target drift·failure cases를 먼저 추가한다.
2. Git-mutating opt-in을 요구하지 않는 단위/기본 integration RED를 Implementer가 실행한다.
3. `tests/node/runtime-workflow.integration.test.mjs`의 `ARC_RUN_GIT_INTEGRATION=1` cases는 임시 repository에서 `git init/add/commit` 등을 실행한다. Specialist는 이를 실행하지 않는다. Orchestrator가 RED와 GREEN을 대신 실행하고 그 결과를 독립 기록한다.
4. Implementer가 구현 후 기본 regression을 실행한다. Git-mutating opt-in은 계속 Orchestrator가 맡는다.
5. Fresh QA가 기본 regression을 재실행한다. Opt-in 결과는 Orchestrator 실행 기록과 source assertions를 독립 확인한다.

예상 RED 명령:

```sh
env -u ARC_RUN_GIT_INTEGRATION node --test \
  tests/node/runtime-plan-amend.test.mjs \
  tests/node/runtime-evaluate.test.mjs \
  tests/node/runtime-schema.test.mjs \
  tests/node/runtime-cooperative.test.mjs
```

예상 기본 GREEN/QA 명령:

```sh
env -u ARC_RUN_GIT_INTEGRATION node --test \
  tests/node/runtime-plan-amend.test.mjs \
  tests/node/runtime-cooperative.test.mjs \
  tests/node/runtime-evaluate.test.mjs \
  tests/node/runtime-git-evidence.test.mjs \
  tests/node/runtime-schema.test.mjs \
  tests/node/runtime-store.test.mjs \
  tests/node/runtime-workflow.integration.test.mjs \
  tests/node/runtime-cli.test.mjs \
  tests/node/runtime-assets.test.mjs \
  tests/node/runtime-installed-entry.test.mjs \
  tests/node/runtime-versions.test.mjs
```

Git-mutating real-repository cases:

```sh
ARC_RUN_GIT_INTEGRATION=1 node --test \
  tests/node/runtime-plan-amend.test.mjs \
  tests/node/runtime-workflow.integration.test.mjs
```

실제 Git case에는 문서 commit, 둘 이상의 descendants, plan 경로 amendment 성공, dirty tracked/untracked original checkout 보존, detached helper worktree branch 반영, compare-and-swap ref update 실패, non-plan content 보존, mapping 오류·merge·recovery-ref 오류의 hold, 부분 완료·재시도 방지를 포함한다. 필수 case가 skip되면 검증하지 않은 것으로 판정한다.

### 필수 행위 기준

- `prepare plan-amend`는 Orchestrator 진술, workflow revision/version/target, exact plan bytes/hashes, 변경 분류, 승인 참조와 시점, affected task IDs, writer-stop 증거, recovery-ref 계획, complete remote snapshot, clean index 및 non-plan worktree/untracked fingerprint를 검사한 뒤 durable intent를 저장한다.
- 계약 변경은 수정된 문서 bytes와 실제 승인 시각에 연결한다. 최신 bytes를 과거 승인으로 소급 승인하지 않는다.
- CLI는 history rewrite, recovery-ref 생성, network query를 실행하지 않는다.
- Rewrite 전 recovery ref는 준비 intent에 고정된 이름/OID와 일치해야 한다. Orchestrator가 `allow` 뒤 생성·검증하며, 실패 시 rewrite를 시작하지 않는다.
- Dirty worktree는 별도 detached helper worktree에서 rewrite한다. Primary checkout의 index는 prepare 전후 clean이고, 승인 plan 경로 외 worktree/untracked fingerprint는 동일해야 한다.
- Remote snapshot은 모든 configured remotes의 full refs와 관찰 source/time을 포함하고 5분 이내여야 한다. Publication/ownership unknown 또는 충돌은 hold한다. 이를 native proof로 표시하지 않는다.
- Reconciliation은 같은 intent에서만 checkout realpath/common dir/Git dir가 같은 상태의 예상된 HEAD drift를 처리한다. 일반 target drift를 허용하지 않는다.
- Mapping은 complete, one-to-one, ordered여야 한다. 각 parent는 protected base 또는 직전 mapped commit이다. 각 mapped tree에서 승인된 original plan 경로를 제외한 모든 path/mode/blob은 exact equality여야 한다. 승인 plan bytes는 새 planning commit과 일치해야 하고 descendants에서 추가 변경되지 않아야 한다. Author, author-date, message 및 task boundaries는 보존하고 committer metadata/hash만 rewrite consequence로 달라질 수 있다.
- 성공 전이는 모든 local object, document, mapping, remote freshness·hold, recovery ref 증거가 일치할 때만 target을 갱신한다. Failed/unknown/mismatch/partial 결과와 실제 state를 보존하고 automatic retry·rollback·fallback docs commit을 하지 않는다.
- 기존 workflow는 migration하거나 runtime version을 자동 갱신하지 않는다. Runtime version `cooperative-5`와 raw module hash를 사용한다.

### Runtime assets와 version

```sh
node scripts/update-runtime-assets.mjs
node scripts/update-runtime-assets.mjs --check
```

Platform copies는 생성기로만 갱신한다. `runtime-versions.test.mjs`의 새 baseline hash는 실제 raw module bytes에서 산출한다. 과거 version/hash는 보존한다.

### Task-isolated MANIFEST와 index 증거

Orchestrator가 현재 parent HEAD에서 runtime task snapshot을 만들고 승인된 source, generated runtime copies와 test 변경만 overlay한다. Snapshot 루트에서 기존 generator를 실행한다.

```sh
node scripts/update-manifest.mjs --root <absolute-task-snapshot>
node scripts/update-manifest.mjs --check --root <absolute-task-snapshot>
```

Index에는 승인된 runtime·test 경로와 snapshot에서 계산된 `MANIFEST.sha256` blob만 stage한다. 원 TASK-01의 `MANIFEST` working-tree bytes/hash와 나머지 10개 변경은 stage하지 않는다. Orchestrator가 다음을 기록·검증한다.

- Parent HEAD와 task snapshot의 파일 목록·blob·mode.
- Expected staged tree OID와 binary diff fingerprint.
- Staged paths가 task scope 안에만 있는지.
- Preflight 전체 working-tree manifest hash와 원 TASK-01 10개 파일의 bytes/hash.
- Commit 후 staged-tree 결과, 남은 working-tree manifest hash가 preflight와 같은지, 원 TASK-01 변경이 그대로 있는지.

기존 생성기·snapshot·index 내용이 일치하지 않거나 unowned staging이 발견되면 commit 전에 보류한다. `git add .`를 사용하지 않는다. 공유 MANIFEST 때문에 일반 cooperative gate 또는 preservation rule을 변경하지 않는다.

### Fresh QA

Fresh QA는 승인된 spec의 기준을 `proven`, `unmet`, `unverified`로 판정하고 다음 비테스트 구조 검사를 수행한다.

```sh
git diff --check
node scripts/update-runtime-assets.mjs --check
node scripts/update-manifest.mjs --check --root <absolute-task-snapshot>
```

Manifest check는 task snapshot과 그 snapshot에 대응하는 commit tree에서 수행하고 두 경로·목적을 기록한다. 원 TASK-01 변경이 남아 있는 primary working tree에서는 `--check`를 실행하지 않는다. 해당 checkout의 manifest는 새 runtime bytes를 반영하지 않는 기존 원 TASK-01 산출물이므로, 그 hash가 runtime task 전후 동일한지와 파일이 unstaged로 보존되는지를 확인한다. 이 상태를 T1의 검증 실패로 보고하지 않는다. QA는 원 TASK-01 파일 불변, staging/snapshot 분리, platform byte parity, runtime version hash, test skip·실패, operator-attested 제한을 확인한다. Finding 수정은 동일 Implementer에게 반환하고 해당 QA가 영향을 받은 검사를 재확인한다.

### T1 Acceptance와 구현 commit

Orchestrator는 모든 기준·회귀·QA·재검사·finding을 보고 수락한 뒤 runtime 경로만 commit한다. Spec·plan 초기 docs-only commit과는 별도 한 개의 집중 구현 commit이다.

예상 message:

```text
feat(runtime): plan-amend 준비와 재조정 지원
```

Preflight에서 실제 parent·index·staged paths/tree·binary diff·task snapshot manifest·원 TASK-01 remainder hash·ownership을 확인한다. Commit 후 SHA, parent, tree, paths, content, HEAD, 잔여 변경과 manifest hash를 다시 확인한다. 예상 밖 staging, dirty task path, hash drift 또는 부분 결과가 있으면 재시도하지 않는다.

### 최종 독립 Reviewer

T1 QA·수락·commit 후 independent Reviewer가 initial docs-only commit부터 최신 HEAD까지 전체 변경을 검토한다. Reviewer는 다음을 확인한다.

- Intent가 rewrite 전 저장되고 동일 intent reconciliation만 success로 전이함.
- 예상된 HEAD drift가 plan-amend 전용이며 target 변경 검증이 제한됨.
- 승인된 plan 경로 밖의 descendant tree/metadata/task 경계가 보존됨.
- Remote snapshot 출처·freshness와 unknown publication hold.
- CLI가 Git mutation·network query를 하지 않음.
- Migration/version 자동 갱신, 원 TASK-01 혼입, manifest/index 분리 위험.
- Runtime regression의 positive/negative cases와 실제 Git test 증거.

Reviewer finding은 연결된 후속 task·필요한 QA/recheck를 먼저 등록한다. 수정은 미커밋 상태로 두고 동일 Reviewer가 최종 diff를 재검토한다. 해결 후 Orchestrator가 수락하고 하나의 focused follow-up commit을 만든다.

## Runtime commit 이후 원래 계획 amendment

이 절은 T1의 추가 구현 task가 아니다. Runtime Reviewer와 수정을 완료한 뒤 Orchestrator가 승인된 원 계획 수정 절차를 수행한다.

1. 최신 HEAD/runtime hash와 원 TASK-01 변경·writer-stop evidence를 재확인한다. Index가 HEAD와 일치하지 않거나 수정 대상 original plan 경로가 dirty이면 보류한다.
2. 새 CLI로 새 workflow를 명시적으로 초기화하고 원래 계획 승인, 새 C6 기준, exact plan content hash·version·`approvedAt`, affected task IDs, prior commit/base/ref, recovery-ref 계획 및 fresh remote snapshot을 기록한다.
3. `prepare plan-amend`가 durable `persisted:true allow`를 반환하는지 확인한다. Intent가 없거나 hold면 rewrite하지 않는다.
4. Orchestrator가 준비된 recovery ref를 생성·검증하고 같은 intent에 pre-rewrite checkpoint를 기록한다. Intent에는 clean index와 non-plan tracked/untracked preservation fingerprint가 들어 있어야 한다.
5. Orchestrator가 `create_worktree`로 old HEAD의 detached helper worktree를 만들고, 그곳에서 원래 planning-document commit을 수정한 뒤 descendants를 순서대로 재적용한다. CLI는 worktree 생성이나 rewrite를 하지 않는다. Mapping을 전부 검증하기 전에는 helper를 정리하지 않는다.
6. Mapping 검증 뒤 Orchestrator는 원 checkout에서 `git switch --detach <old-head>`로 primary branch 점유를 해제한다. 기존 branch ref는 compare-and-swap으로 옮긴다.

   ```sh
   git update-ref refs/heads/<branch> <verified-new-head> <old-head>
   ```

   이후 원 branch로 switch한다. Committed tree는 승인된 plan 경로 외에서 동일해야 한다. Branch switch 후 plan bytes·clean index·non-plan tracked/untracked fingerprint가 기대값과 다르면 hold한다.
7. 같은 intent를 `reconcile`하고 new HEAD·branch·local tree comparison·complete mapping·recovery ref·fresh remote snapshot과 original worktree preservation을 확인한다.
8. Reconciliation과 영향받은 gate 갱신 전에는 새 assignment, acceptance, commit을 시작하지 않는다. 성공 후 clean helper worktree를 `archive_worktree`로 보존·정리하고 결과를 기록한다. Failure/unknown이면 helper와 refs를 보존한다.
9. Reconciliation 성공 후 원 TASK-01을 새 plan version·SHA·mapping·C6로 fresh handoff한다. Fresh Implementer는 기존 task 범위의 생성 산출물 단계에서 `node scripts/update-manifest.mjs`를 실행해 새 runtime HEAD와 원 TASK-01 변경을 함께 반영한다. QA는 그 뒤 현재 working tree에서 `node scripts/update-manifest.mjs --check`를 확인한다. 원 TASK-01에는 테스트 제한이 계속 적용되며 runtime regression은 그 acceptance의 test evidence로 사용하지 않는다.

## 수용 기준

| ID | 기준 |
|---|---|
| R1 | `prepare plan-amend`가 엄격한 schema·approval/evidence 검증 후 durable intent를 저장함 |
| R2 | 같은 intent reconciliation과 실제 local observation이 일치할 때만 성공·target 전이가 됨 |
| R3 | CLI에 Git rewrite·recovery ref 생성·network query가 없음 |
| R4 | 승인 chronology, 이전/새 문서 내용·version·hash, writer/recovery evidence와 full mapping이 보존됨 |
| R5 | 5분 remote snapshot 및 operator-attested 출처를 구별하고 unknown publication을 hold함 |
| R6 | Plan 경로만 예외로 descendant를 검증하고 나머지 tree·parent·author/message/task 경계를 보존함 |
| R7 | 기존 workflow migration·자동 version 갱신·소급 intent가 없음 |
| R8 | Partial/unknown/failure/mismatch가 자동 retry·rollback·fallback·success로 바뀌지 않음 |
| R9 | Runtime source·platform copies·tests가 한 focused task commit으로 분리됨 |
| R10 | Task snapshot manifest와 staged tree가 일치하고 원 TASK-01 remainder hash가 보존됨 |
| R11 | Runtime regression·fresh QA·필요한 재검사·independent final Reviewer가 완료됨 |
| R12 | 원 TASK-01 C6가 test-code 변경 확인과 prompt-only 실행 감사 한계로 분리되고 Superpowers 불변 |
| R13 | Detached helper worktree rewrite 뒤 primary branch 갱신이 원 checkout의 non-plan dirty/untracked fingerprint를 보존함 |

필수 기준이 `unmet` 또는 `unverified`면 해당 acceptance/commit을 보류한다. Report-only 제한은 native 검증으로 과장하지 않는다.

## 보류 조건과 제외

- 사용자 승인, checkout·branch·HEAD, writer·ownership, runtime version 또는 계획 hash 불일치.
- 예기치 않은 tracked/untracked/index 변경, task snapshot 생성·manifest·index 비교 실패.
- 승인 범위 밖 파일·role policy·Superpowers 변경.
- Remote 누락·상충·만료, publication 또는 ownership unknown.
- Mapping·parent·tree·metadata mismatch, merge, recovery ref 오류, 관찰 중 변경.
- 필수 runtime test 실패·skip, QA finding, 미해결 acceptance criterion.
- 저장 실패, CLI 결과 불명, Git rewrite partial/unknown outcome.

실패 후 실제 HEAD·index·files·ref·completed steps를 기록한다. 자동 retry·rollback·cleanup하지 않는다. 영향받는 작업만 hold하고 independent scope는 현재 owner/gate 확인 후 별도 판단한다.

## 계획 자체 검토

- 승인된 spec 기준과 bootstrap·rewrite·reconcile 순서를 criteria, evidence, hold에 연결했다.
- 원 작업과 runtime task의 test·scope·owner·manifest 분리를 명시했다.
- Initial spec/plan commit, T1 implementation commit, Reviewer/follow-up boundaries를 구별했다.
- 기존 cooperative commit gate, role-policy, Superpowers와 global preservation rule을 넓히지 않는다.
- Runtime snapshot의 manifest 검증과 보존된 TASK-01 working manifest의 후속 갱신 시점을 구분했다.
- Runtime 동작을 구현하거나 테스트를 실행하지 않았다.

이 계획은 Planner가 작성한 전체 초안을 Orchestrator가 review하고 사용자 위임 권한으로 v1.1을 승인한 문서다. 계획 문서 docs-only commit 뒤 최신 TASK-01 handoff 조건을 확인하고 runtime 구현을 시작한다.
