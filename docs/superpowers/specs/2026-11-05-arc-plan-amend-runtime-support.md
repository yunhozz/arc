# ARC plan-amend runtime 지원 명세

| 항목 | 값 |
|---|---|
| 버전 | v1.2 |
| 상태 | Orchestrator 승인 — 사용자 위임 승인 권한에 따라 승인 |
| 승인 일시 | 2026-11-05 |
| 저장소 | `/Users/ma-24-007/Desktop/workspace/arc` |
| Branch / 기준 HEAD | `refactor/arc-instructions` / `0b46ffdd9b8ac0c146af3ecec1b184286c8bed04` |
| 본 명세 | `/Users/ma-24-007/Desktop/workspace/arc/docs/superpowers/specs/2026-11-05-arc-plan-amend-runtime-support.md` |
| 후속 계획 | `/Users/ma-24-007/Desktop/workspace/arc/docs/superpowers/plans/2026-11-05-arc-plan-amend-runtime-support.md` |
| 원래 계획 | `/Users/ma-24-007/Desktop/workspace/arc/docs/superpowers/plans/2026-11-05-arc-plan-amend-tdd-precedence.md` |

## 승인 근거

- 사용자는 2026-11-05에 별도 runtime 계획에서 cooperative CLI의 `prepare plan-amend` 및 동일 intent reconciliation을 추가하는 설계 방향을 승인했다. CLI는 Git 이력 재작성과 네트워크 조회를 수행하지 않는다. Remote refs는 관찰 후 5분 이내의 operator-attested snapshot으로 기록하며 publication이 불명확하면 보류한다. 기존 workflow는 자동 migration하지 않는다.
- 사용자는 별도 runtime task의 회귀 테스트 작성과 실행을 승인했다. 이는 원 TASK-01의 테스트 제한을 바꾸지 않는다.
- 사용자는 이후 ARC 승인 게이트를 Orchestrator가 대리 처리하도록 위임했다.
- Orchestrator는 descendant 비교, runtime task의 일반 ARC 수락·commit 절차, task-isolated manifest/index 증거, dirty primary checkout을 보존하는 detached helper worktree 재작성·branch 이동 절차를 보완해 승인했다. Review 중 shared manifest가 runtime commit 뒤 primary checkout에서 의도적으로 stale 상태가 되는 점을 반영해 T1 검증과 원 TASK-01 재개 시 갱신 시점을 분리했다.

## 목적

현재 cooperative CLI에는 실행 중 계획 문서 변경을 준비하고 결과와 같은 intent로 연결하는 `plan-amend` 작업이 없다. ARC 지침은 승인된 계획의 실행 중 변경을 원래 planning-document commit에 반영하도록 요구한다. 이 명세는 해당 절차에 필요한 runtime 지원을 추가한다.

CLI는 준비 증거를 검증하고 intent를 저장하며, 결과 reconciliation 때 실제 로컬 Git 상태를 다시 관찰한다. **이력 재작성은 Orchestrator만 수행한다.** 이 변경은 Superpowers나 원 TASK-01의 범위를 변경하지 않는다.

## 범위와 제외

포함한다.

- Cooperative `prepare plan-amend`와 같은 intent를 사용하는 결과 reconciliation.
- 승인 chronology, 변경 문서, branch/HEAD, recovery ref, writer 중지, remote observation, descendant mapping의 구조화된 증거.
- 읽기 전용 로컬 Git observer와 실패·부분 완료·unknown 상태 보존.
- Canonical runtime과 Codex/Claude runtime copy 정렬.
- 새 runtime 동작에 대한 TDD 회귀 테스트, 독립 QA, Orchestrator 수락·focused commit 및 최종 Reviewer.
- 원래 TASK-01의 변경을 보존하며 task별 manifest/index 내용을 분리하는 검증 절차.

제외한다.

- CLI의 `amend`, `rebase`, `reset`, recovery ref 생성, force push 및 네트워크 조회.
- Actor의 실제 신원, 승인 사건, writer 중지 또는 모든 공유 사본 부재의 native 인증.
- 기존 workflow 자동 migration, runtime version 자동 갱신 또는 과거 intent 생성.
- Superpowers 원문·정책·provenance·license 수정.
- 원 TASK-01의 테스트 코드 수정 또는 테스트 실행.
- push, merge, 배포, 게시.

## 책임과 신뢰 경계

| 주체 | 책임 |
|---|---|
| Orchestrator | 승인·분류·소유권·writer 중지 기록, remote observation 입력, 외부 Git 준비와 재작성, 결과 입력, 수락·commit |
| Cooperative CLI | schema·revision·version 확인, 로컬 Git 관찰, durable intent 기록, 같은 intent reconciliation, hold 판정 |
| Implementer | 승인된 runtime 원본·복사본·회귀 테스트만 수정하고 증거 보고 |
| QA | 승인된 테스트와 비테스트 구조 검사를 독립 실행하고 기준별 verdict 보고 |
| Reviewer | 수락·commit 후 전체 변경을 독립 검토 |

`operator-attested`는 입력 출처이며 실제 사용자·플랫폼 사건의 인증을 뜻하지 않는다. Coverage는 `nativeVerified: false`를 유지한다. 로컬 Git 관찰과 operator 진술은 저장·보고에서 분리한다. 공개 CLI 입력으로 observer, Git runner, storage 결과를 주입할 수 없게 한다.

## `plan-amend` lifecycle

### 준비

기존 cooperative `prepare` 명령에 `operation: "plan-amend"`를 추가한다. 요청은 workflow ID, request ID, 현재 revision, target, policy/runtime 버전 및 fingerprint에 묶인다. Orchestrator 역할의 명시 진술과 아래 evidence를 검증하고, durable intent가 저장되었다고 확인된 뒤에만 `allow`한다. 저장 결과가 없거나 불명확하면 rewrite를 시작할 수 없다.

Intent에는 최소한 다음을 보존한다.

- 변경 분류(기계적 기록 또는 계약 변경), 이유, 변경 시각, 영향을 받는 task IDs.
- 원래 plan commit, 보호된 base/ref, branch와 prepare 시점 HEAD.
- 기존/새 승인 참조, 정확한 승인 문서 hash·version 및 실제 `approvedAt`.
- 기존/새 plan 문서 경로, 버전, hash와 복구 가능한 내용 또는 검증 가능한 object 참조.
- 이전 HEAD를 보존할 recovery-ref 이름과 예상 OID.
- 중지된 writer의 assignment IDs, 중지 시각과 근거 참조.
- 모든 configured remote의 완전한 ref snapshot, 관찰 시각과 publication/ownership 진술.
- Prepare 시점의 clean index OID, 승인 plan 경로를 제외한 tracked/untracked worktree fingerprint, 원 checkout/branch와 보존 owner.
- workflow target/version 및 요청 fingerprint.

Prepare는 index가 HEAD와 일치하고 staged path가 없으며, 수정 대상 plan 경로 자체가 clean함을 요구한다. Working tree의 다른 경로는 dirty여도 허용할 수 있지만, 승인 plan 경로를 제외한 tracked/untracked paths·modes·contents의 fingerprint를 intent에 고정한다. 이 fingerprint는 별도 helper worktree에서 rewrite하는 동안 보존할 기준이다.

Recovery ref는 intent에 이름과 예상 OID가 고정된 뒤 Orchestrator가 생성하고 로컬에서 확인한다. CLI는 ref를 만들지 않는다. Ref 생성이 실패하거나 OID가 다르면 rewrite 전에 중단하고 실제 상태를 같은 intent 결과에 기록한다.

### 외부 rewrite

`prepare plan-amend`가 저장된 `allow`를 반환한 뒤 Orchestrator만 history를 재작성한다. 원 checkout의 dirty worktree를 건드리지 않도록 Orchestrator는 `create_worktree`로 old HEAD를 가리키는 별도 detached helper worktree를 만든다. 그곳에서 원래 plan commit을 amended bytes로 바꾸고 descendants를 순서대로 재적용한다. Helper worktree 생성·rewrite·branch/ref 반영은 모두 준비된 intent 뒤 Orchestrator가 수행하며 CLI는 실행하지 않는다.

Mapping 검증 후 Orchestrator는 원 checkout을 같은 old HEAD에서 detach하고 primary branch ref를 old OID compare-and-swap guard로 검증된 new HEAD로 옮긴 뒤 원 branch로 다시 switch한다. Branch switch는 승인된 plan 경로만 바꾸고, 다른 dirty/untracked state가 prepare fingerprint와 그대로 일치할 때만 성공이다. Implementation/task 경계를 합치지 않는다. Force push와 fallback docs/fixup commit은 사용하지 않는다.

Mapping, recovery ref, branch 반영 또는 원 worktree 보존 중 하나라도 실패·불명확하면 자동 cleanup하지 않는다. Helper worktree와 refs를 보존하고 실제 상태와 완료 단계를 같은 intent로 기록해 종속 작업을 hold한다. 성공 reconciliation 후 clean한 helper worktree는 `archive_worktree`로 보존·정리하고 결과를 기록한다. Primary recovery ref는 원 TASK-01 재수용 때까지 보존한다.

### 동일 intent reconciliation

Rewrite 후 같은 intent ID를 참조해 `reconcile`한다. CLI는 checkout realpath/Git common directory/Git directory가 같은지 확인하고, 예상된 HEAD 변경은 전용 `plan-amend` reconciliation 경로에서만 처리한다. 승인 plan 경로를 제외한 원 checkout의 tracked/untracked preservation fingerprint, clean index, branch/ref 관계가 prepare 증거와 맞아야 한다. 다른 checkout, 예기치 않은 변경 또는 stale/mismatched state는 hold한다.

Operator의 `succeeded` 진술만으로 성공 처리하지 않는다. 실제 HEAD·branch·plan bytes·Git objects·mapping·recovery ref를 다시 관찰한다. Mapping과 모든 검사가 일치할 때에만 target을 갱신하고, 그렇지 않으면 실제 결과를 `failed`, `unknown` 또는 `mismatch`로 보존한다.

Rewrite가 끝난 뒤 **동일 intent reconciliation과 영향을 받은 gate 갱신 전까지** 새 assignment, acceptance 또는 commit을 시작하지 않는다. 미해결 intent를 새 request로 우회하거나 자동 retry/rollback하지 않는다.

## Git 이력 대응 규칙

준비 단계에서 다음을 확인한다.

- 원래 plan commit이 현재 protected base의 ancestor인지.
- 재작성 구간이 완전한 로컬 linear history인지, merge가 없는지.
- 정확히 승인된 plan 경로만 계획 변경 대상으로 잡혔는지.
- branch/HEAD, clean index, working tree·untracked preservation fingerprint, ownership 및 recovery ref가 예상과 맞는지.
- remote snapshot·publication 진술이 freshness와 완전성 조건을 만족하는지.

결과 단계의 old→new mapping은 모든 descendant에 대해 1:1이며 원래 순서를 보존해야 한다. 각 new parent는 protected base 또는 직전 mapping의 new commit이어야 한다. 각 대응 commit의 tree에서 승인된 원래 plan 경로를 제외한 파일 경로·mode·blob은 정확히 같아야 한다. 승인된 plan 경로는 amended planning commit에서 승인된 새 bytes와 일치해야 하며, descendants가 추가로 변경하지 않아야 한다. Author, author date, commit message와 task 경계는 같아야 한다. Rebase/amend 때문에 달라지는 committer metadata와 commit SHA만 허용한다. 누락·중복 mapping, 예상 밖 commit/path/merge 또는 비-plan 파일 차이는 hold한다.

전체 repository tree equality는 plan 변경과 양립하지 않으므로 사용하지 않는다. Plan 경로만 허용된 새 bytes로 비교하고 나머지 tree 전체를 정확히 대조한다.

## Remote observation

CLI는 network fetch나 remote query를 수행하지 않는다. Orchestrator가 각 configured remote의 식별 정보와 **전체 ref snapshot**을 외부에서 관찰해 입력한다. 자격 증명 포함 URL은 저장·출력하지 않는다. snapshot은 실행 직전 기준 5분 이내여야 하며, remote 누락·불완전 refs·미래/해석 불가 시각·상충하는 진술은 hold한다. Reconciliation 시 필요한 새 snapshot은 이전 값을 덮어쓰지 않고 같은 intent에 추가한다.

Local tracking ref는 remote의 현재 상태 증거가 아니다. Snapshot과 publication/ownership 진술은 operator-attested이며 independent/native proof가 아니다. Publication이나 exclusive ownership이 unknown·충돌 상태이면 rewrite를 보류한다. Freshness만으로 안전을 입증했다고 표현하지 않는다.

## Bootstrap과 실행 순서

미지원 CLI를 우회하지 않는다. `plan-amend` runtime 자체는 별도 계획과 독립 task로 만든다.

1. 승인된 spec v1.2와 formal plan v1.1을 새 문서만 포함하는 정상 docs-only planning commit으로 기록한다. 이는 원래 plan 변경을 대체하는 fixup commit이 아니다.
2. Runtime task를 ARC Implementer→TDD 회귀 검증→fresh QA→Orchestrator 수락·focused commit→독립 Reviewer 절차로 완료한다.
3. 새 runtime으로 새 workflow를 명시적으로 초기화한다. 기존 workflow를 migration하지 않는다.
4. 새 CLI의 `prepare plan-amend`가 저장된 `allow`를 반환한 뒤 원래 plan amendment를 실행하고 같은 intent로 reconcile한다.
5. Reconciliation 및 재검증 후 원래 plan의 승인된 C6 분리를 원래 planning-document commit에 반영하고, 변경된 기준으로 fresh Implementer/QA를 배정해 원 TASK-01을 재개한다. 이때 원 TASK-01 Implementer는 새 runtime HEAD와 기존 변경을 포함해 `MANIFEST.sha256`를 재생성한다.

원 checkout의 dirty working tree를 직접 rebase하지 않는다. Prepare fingerprint를 만든 뒤 helper detached worktree에서 history를 재작성한다. Mapping이 입증되면 원 checkout의 old HEAD에서 branch를 잠시 detach하고 검증된 branch tip을 반영한 다음 원 branch에 복귀한다. 새 branch tree에서 승인된 plan 경로 외의 committed tree는 같아야 하므로, 다른 dirty file을 덮는 전이가 없어야 한다. 실제 switch가 snapshot을 바꾸거나 path를 덮으면 즉시 중단한다. Helper worktree는 reconciliation 전 자동 정리하지 않고, 성공한 동일 intent reconciliation 뒤 clean한 상태를 확인해 제거한다.

Runtime task 동안의 assignment·QA·acceptance·implementation commit은 정상 ARC task 계약으로 관리한다. `plan-amend` intent가 준비되기 전 이 변경을 사용해 원래 plan을 수정하지 않는다. Rewrite 후에는 reconciliation 이전에 후속 작업·commit을 하지 않는다.

## 원 TASK-01 변경과 shared manifest 보존

기준 HEAD에는 원 TASK-01 소유의 unstaged 변경 11개가 있다.

- `MANIFEST.sha256`
- `codex/skill/SKILL.md`, `claude/skill/SKILL.md`
- 양 플랫폼 `skill/references/{commit,coordination,handoff}.md`
- `lib/prompts/agent-fragments.json`
- `tests/node/fixtures/instruction-contracts.json`

기존 owner는 `/root/implementer_plan_amend_tdd_rules`의 완료된 TASK-01이며 현재 활성 writer는 없다. 이 변경은 새 runtime plan/implementation commit에 들어가지 않는다. 새 spec/plan docs-only commit은 위 목록에 없는 새 문서만 stage한다. Manifest 생성기는 `docs`와 `tests`를 package input에서 제외하므로 docs-only commit에는 MANIFEST를 stage하지 않는다.

Runtime commit의 MANIFEST는 현재 working tree 전체에서 생성한 값을 그대로 stage하지 않는다. Orchestrator는 parent HEAD에서 task-isolated payload snapshot을 만들고 승인된 runtime source/copy 변경만 overlay한 뒤 기존 `scripts/update-manifest.mjs`를 그 snapshot에서 실행한다. Index에는 승인된 runtime paths와 이 snapshot에서 산출한 manifest blob만 stage한다.

Preflight는 snapshot의 exact paths, blobs, modes, index tree와 staged fingerprint를 기록하고, runtime 작업 전부터 존재한 전체 working-tree `MANIFEST.sha256`의 hash도 별도로 기록한다. Runtime commit 직후 Orchestrator가 실제 Git/index/tree를 확인하고 working-tree manifest hash가 preflight 값과 같은지 확인한다. 이 시점의 primary checkout manifest는 새 runtime bytes를 아직 반영하지 않는 원 TASK-01 산출물이므로, 루트 전체 manifest `--check`는 실행하지 않는다. 이는 검증 실패가 아니라 의도적으로 보존한 미완료 task manifest다. T1은 task snapshot 및 commit tree에서 생성 manifest를 검증하고, working-tree 값은 보존 hash로 확인한다. 원 TASK-01 amendment reconciliation 후 fresh handoff에서 Implementer가 새 runtime HEAD와 원 TASK-01 변경을 함께 포함해 manifest를 다시 생성한다. 남은 원 TASK-01 변경을 보존하고, 다른 파일 remainder는 stage하지 않는다. Index snapshot 생성·비교가 실패하거나 task payload가 섞이면 commit을 보류한다. 일반 cooperative commit gate 또는 preservation 규칙을 완화하지 않는다.

## 원 TASK-01의 C6 amendment

원래 계획의 테스트 제한은 유지하며 runtime task의 테스트 승인을 확대 적용하지 않는다. 승인된 C6 변경은 다음 둘을 분리한다.

- **검증 가능한 조건:** 원 TASK-01에서 테스트 코드, assertion 또는 test case를 추가·수정하지 않았다. 전체 diff와 변경 경로로 확인한다. 기존 기대 fixture의 데이터 갱신은 테스트 코드 변경과 구분한다.
- **감사 한계:** 원 TASK-01 기간에 테스트를 실행하지 않았다는 사실은 Implementer 보고·명령 기록에 근거한다. Prompt-only 환경은 모든 외부 실행을 독립 감사하지 못하므로, 이 사실을 “독립 검증됨”으로 표시하지 않는다. 이 한계만으로 기준을 unmet 처리하지 않으며 보고에 한계로 기록한다.

Runtime 회귀 테스트는 별도 runtime task의 증거로만 취급한다. 전체 대화에서 테스트가 전혀 실행되지 않았다고 표현하지 않는다.

## 회귀 테스트와 QA 범위

사용자는 runtime task에 한해 TDD 회귀 테스트 작성·실행을 승인했다. Implementer는 plan-amend 전처리·동일 intent reconciliation·target drift·mapping·remote freshness·hold/failure 경계의 회귀 케이스를 먼저 추가하고 해당 실패를 실행한 뒤 구현한다. 이는 기존 Superpowers TDD 절차를 변경하지 않는다.

기존 관련 테스트 파일:

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

계획에서 명시한 범위만 실행한다. Runtime copies는 `scripts/update-runtime-assets.mjs`와 `--check`로 관리한다. Manifest는 task snapshot과 그 snapshot에 대응하는 commit tree에서 생성·확인한다. 원 TASK-01 변경이 남아 있는 primary working tree에서는 검사를 실행하지 않고, 기존 manifest hash가 runtime commit 전후 동일한지만 확인한다. 원 TASK-01 재개 시 새 runtime HEAD를 포함해 manifest를 재생성하고 해당 task의 QA가 최종 현재 tree를 확인한다. `git diff --check`, staged index/tree 비교, 원 TASK-01의 변경 경로 불변성도 QA evidence다. QA는 테스트를 독립 재실행하고 task-specific manifest/snapshot 및 C1–C12를 판정한다. 최종 Reviewer는 수락·commit 뒤 전체 diff를 검토한다.

## 수용 기준

1. 준비 전용 `plan-amend` operation은 명시된 입력을 검증하고 durable allow intent를 저장한다.
2. 정상 성공 전이는 동일 intent의 reconciliation과 실제 local Git 관찰이 모두 일치할 때만 발생한다.
3. CLI는 Git rewrite·recovery ref 생성·network query를 하지 않는다.
4. 승인 chronology, old/new document bytes/version/hash, affected tasks, writer-stop 진술, recovery ref와 전체 mapping이 보존된다.
5. Remote snapshot freshness ≤5분을 검사하고 source를 operator-attested로 명시하며 unknown publication을 hold한다.
6. Old/new descendant mapping은 승인된 plan 경로만 예외로 정확히 검증한다.
7. 기존 workflow migration, runtime version 자동 갱신 및 과거 intent의 재구성이 없다.
8. Failure, unknown, mismatch, partial completion은 보존되고 자동 retry/rollback/fallback으로 이어지지 않는다.
9. Runtime source/copies/tests는 정상 ARC task commit으로 분리되며 원 TASK-01 파일은 staged/committed되지 않는다.
10. Shared MANIFEST의 task-isolated index blob과 preflight/post-commit remainder hash가 일치한다.
11. 승인된 runtime TDD 회귀 테스트와 구조 검증, fresh QA 및 최종 Reviewer를 완료한다.
12. Original TASK-01의 C6는 검증 가능한 조건과 prompt-only 실행 감사 한계를 분리한다. Superpowers 변경과 push/merge/publish가 없다.

기준별로 `proven`, `unmet`, `unverified`와 근거를 기록한다. 필수 기준을 입증할 수 없으면 해당 수용이나 commit을 보류한다. Operator-attested 신원·공유·publication 주장을 native proof로 격상하지 않는다.

## 승인된 설계 선택

1. Remote network 조회를 CLI에 추가하지 않고 외부 관찰을 operator-attested로 기록한다.
2. Publication/ownership이 unknown이면 history rewrite를 하지 않는다.
3. 기존 workflow를 migration하지 않으며, 새 runtime에는 새 workflow를 명시적으로 초기화한다.
4. Descendant 비교는 승인된 plan 경로만 제외하고 나머지 파일 tree를 정확히 유지한다.
5. Runtime 변경은 정상 ARC task commit으로 먼저 완료하고, 새 CLI는 이후 원 계획 amendment intent에 사용한다.
6. Shared manifest는 task-isolated snapshot과 index/remainder hash로 분리하며 일반 commit gate를 약화하지 않는다.
7. Runtime 회귀 테스트 허용은 별도 runtime task에 한정한다.
8. Dirty primary checkout은 저장된 intent 뒤 detached helper worktree에서 재작성하고, 원 checkout의 clean index와 non-plan fingerprint를 동일하게 보존한다.

Planner가 실행계획 전체 초안을 작성했다. Orchestrator는 manifest 검증 단계의 일관성, 파일 경계, 회귀 범위와 hold 조건을 함께 검토하고 delegated approval authority로 승인한다. 문서 전용 계획 commit 이후에만 구현이나 테스트를 시작한다.
