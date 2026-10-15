# 워크트리 실행 선택지 구현 계획

> **For agentic workers:** REQUIRED 실행 방식은 ARC의 CEO 순차 조정이다. Coder가 지정 파일을 수정하고, 독립 QA 이후 Reviewer가 최종 전체 변경을 검토한다. Executor subskill의 위임 방식과 별도 실행 방식 선택은 ARC adapter로 대체한다. 단계는 checkbox로 추적한다.

**Goal:** 실행 대상에 새 worktree와 새 task branch 생성 경로를 추가하고 승인·문서 전달·복구·역할 인계 계약과 구조 검사를 일치시킨다.

**Architecture:** handoff.md와 git-recovery.md가 세 실행 경로 및 worktree 준비·실패 처리를 규정한다. planning.md, skill/SKILL.md, README를 동기화하고 기존 절 단위 unittest 구조 검사로 계약을 확인한다. 설치기나 runtime provisioning API는 추가하지 않는다.

**Tech Stack:** Markdown 정책, Python 3 unittest, SHA-256 manifest.

**Spec:** /Users/ma-24-007/Desktop/workspace/arc/docs/superpowers/specs/2026-10-08-worktree-execution-target-design.md

## Global Constraints

- Architectural 경로다. 승인된 보완 written spec을 기준으로 이 계획도 별도 승인받는다.
- 사용자는 필요한 structural test 추가·수정·실행을 승인했다. Test-first RED/GREEN을 따른다.
- 조사 workspace는 /Users/ma-24-007/Desktop/workspace/arc다. Coder는 CEO가 최종 handoff에 공급한 절대 workspace에서만 수정한다.
- 마지막 제공 상태는 master, bf04e4b0c546a46974f693311eb6c9b26c42d4cb, 승인된 spec 하나만 untracked다. 계획 저장 후 실행 준비 직전에 재확인한다.
- 세 선택지는 현재 checkout, 같은 checkout의 새 task branch, 새 worktree와 새 task branch다.
- Base는 source checkout의 검증된 현재 HEAD SHA다. Remote/default branch 대체·자동 fetch를 하지 않는다.
- Branch 형식은 <type>/<short-kebab-case-topic>, 기본 경로 후보는 ../<repo>-<topic>-worktree다.
- 정책상 생성 명령은 git worktree add -b <branch> <absolute-path> <base-sha>다. 이 구현·검증 계획은 실제 worktree를 생성하지 않는다.
- 승인 후 base·branch/path 후보 변경에는 명시 재선택이 필요하다. 빈 디렉터리·기존 branch/worktree를 자동 재사용하지 않는다.
- Source branch·HEAD·index·파일을 보존한다. 승인 문서 이외의 dirty 파일을 이전하지 않는다.
- Untracked 승인 spec/plan은 index entry 없이 working-tree bytes를 검증한다. Tracked 승인 문서는 index bytes와 working-tree bytes가 모두 승인 버전과 같아야 한다.
- 문서 불일치, 무관 staged 변경, 불명확한 소유권, 필요한 미커밋 구현 변경은 준비를 차단한다. Source staging으로 불일치를 해결하지 않는다.
- 승인 spec/plan만 같은 상대 경로로 전달한다. 대상의 깨끗한 base 문서는 base bytes 확인 후 승인 버전으로 교체할 수 있다.
- 실패·부분 완료에는 handoff를 중단한다. 자동 fallback·delete·prune·force·상태 확인 없는 재시도를 금지한다.
- 기존 같은 checkout의 branch 선택에는 worktree 생성 금지를 유지한다.
- 모든 역할은 선택 workspace를 사용하고 choice lifetime과 시작·재개별 독립 확인을 유지한다.
- 수정 범위는 아래 7개 파일이다. Installer·외부 필수 스킬 집합·profiles·역사적 문서는 변경하지 않는다.
- 구조 검사는 정책 계약만 입증한다. 실제 Git provisioning이나 agent runtime 준수를 주장하지 않는다.
- Coder가 지정 파일을 수정한다. CEO는 계획 저장·승인·실행 준비·수락을 담당한다.

## Review Focus

| 입력·실패 조건 | 기대 계약 | 담당 검사 |
|---|---|---|
| 선택 뒤 branch/path 충돌 또는 조회 오류 | 실행 중단과 갱신 대상의 명시 재선택 | Task 1 collision 검사 |
| 승인 문서 목적지가 깨끗한 base 문서 또는 예상 밖 변경 | Base bytes 확인 후 교체 가능, 예상 밖 변경은 덮어쓰지 않음 | Task 1 document transfer 검사 |
| Source index/working bytes 불일치·무관 staged 변경 | 중단하며 staging·dirty 구현 이전으로 해결하지 않음 | Task 1 source dirty 검사 |
| Branch만 생성되거나 등록·실제 경로 불일치 | 부분 완료 기록·handoff 중단, 삭제·prune·fallback 금지 | Task 1 partial completion 검사 |
| 동일 worktree 재개와 대상 신뢰 상실 | 검증 후 선택 재사용, 신뢰 상실에는 새 선택 | Task 1 roles/restart 검사 |

## CEO의 구현 전 준비

- [ ] 승인된 보완 spec 버전과 사용자 승인 근거를 canonical brief에 기록한다.
- [ ] 이 계획을 통합·저장·자체 검토하고 계획 승인을 받는다.
- [ ] 적용 문서 전체 승인과 structural test 권한을 확인한다.
- [ ] 현재 설치된 handoff 계약에 따라 실행 대상 선택·승인 문서 준비·최종 확인을 수행한다. 구현 중인 새 정책을 이미 적용된 준비 권한으로 사용하지 않는다.
- [ ] 실행 workspace, 승인 artifact 절대 경로, Git 상태·소유권, docs commit 근거와 7개 파일 편집 범위를 Coder에게 전달한다.
- [ ] Coder는 supplied checkout과 brief를 독립 확인한다. 불일치하면 편집 없이 CEO에게 보고한다.

## Task 1: Worktree 실행·문서 전달·복구 계약을 test-first로 구현

**Files:**

- Modify: tests/test_install.py — RolePolicyTests, ARCPreactionGateTests
- Modify: skill/references/handoff.md
- Modify: skill/references/git-recovery.md

**Interfaces:**

- Consumes: 승인 spec §§2–6, 수용 기준 3–10.
- Reuses: policy_text(name: str) -> str, _workspace_handoff_section(title: str) -> str, _assert_workspace_handoff_contracts(title: str, contracts: tuple[str, ...]) -> None.
- Produces: handoff.md의 New worktree and task branch, Worktree document transfer 절과 git-recovery.md의 Worktree failures and partial completion 절.
- 기존 절 이름과 assertion-first 추출 방식을 유지한다.

### Step 1: 기존 assertion 확장

- [ ] RolePolicyTests.test_workspace_handoff_requires_scoped_checkout_approval에 세 번째 경로 phrase를 추가한다: explicit user choice.*current checkout.*new task branch.*new worktree and task branch
- [ ] test_workspace_handoff_preserves_existing_changes의 “either path” assertion을 세 경로 기준으로 교체한다: only the approved docs commit.*all three paths.*exception.*preserve all unrelated dirty files
- [ ] test_workspace_handoff_commits_approved_plan_docs_before_coder에 worktree 검증과 문서 전달이 commit보다 앞서는 assertion을 추가한다.
- [ ] ARCPreactionGateTests.test_preaction_git_evidence_and_batch_order의 Git mutation evidence gate 필수 phrase tuple에 worktree creation을 추가한다.
- [ ] 기존 current-checkout 명시 선택, branch collision·재승인, no-fallback, docs-only commit assertion을 유지한다.

### Step 2: 신규 절별 검사 추가

- [ ] RolePolicyTests에 다음 named tests를 추가하고 각각 해당 절에서 조건을 검사한다.
  - test_workspace_handoff_worktree_scoped_choice_and_base: source 절대 경로·저장소/common directory·branch 또는 detached HEAD·base SHA·branch/path 후보·승인 문서 범위를 선택 대상으로 요구; verified source HEAD SHA를 base로 사용; remote/default branch 및 fetch 금지; 선택 전후 후보 재검증.
  - test_workspace_handoff_worktree_collisions_require_new_choice: ../<repo>-<topic>-worktree sibling 후보; file/directory/symlink/registered worktree 및 branch collision; 빈 디렉터리 재사용 금지; lookup error와 missing 구분; branch suffix -2/-3, 경로 suffix -worktree-2; collision 후 자동 재시도 금지와 새 선택.
  - test_workspace_handoff_worktree_creation_and_identity: 정확한 git worktree add -b <branch> <absolute-path> <base-sha> 명령, source 보존, linked-worktree 등록/common directory/branch/base/path/dirty 확인, .git 파일과 동일 top-level 경로를 저장소 동일성 기준으로 쓰지 않음.
  - test_workspace_handoff_worktree_source_dirty_states: untracked 문서는 index entry 부재를 허용하고 working-tree bytes를 확인; tracked 문서는 index와 working-tree bytes가 모두 승인 버전과 같아야 함; mismatch·무관 staged 변경·필요한 미커밋 구현 변경·불명확 소유권은 중단; 자동 stash/commit/reset/clean/unstage 금지.
  - test_workspace_handoff_worktree_document_transfer: 승인된 uncommitted spec/plan만 동일 repository-relative path로 전달; source 불변; worktree 밖 경로·탈출 symlink 거부; 대상 base bytes가 입증된 clean file만 교체; 예상 밖 변경은 덮어쓰지 않고 중단; 동일 내용 검증 후 재사용; 전달 뒤 approved bytes와 canonical record 확인.
  - test_workspace_handoff_worktree_docs_commit_order: 검증된 worktree와 승인 문서 전달 뒤 target에서 남은 문서만 1회 docs commit; source 자동 commit 금지; base SHA와 post-commit HEAD 기록.
  - test_workspace_handoff_worktree_partial_completion: 생성/등록/checkout/전달/staging/commit 실패와 branch-only·부분 경로·등록 불일치·잘못된 base·일부 문서 전달을 부분 완료로 규정; 조사할 source/target Git 상태를 기록; fallback/retry/delete/prune/force 금지; 재시도 전 실제 상태와 완료 작업 확인.
  - test_workspace_handoff_worktree_roles_and_restart: canonical source/target 기록, 모든 여섯 역할에 절대 worktree path 제공, 같은 대상 재개 시 재검증 후 최초 선택 재사용, 신뢰 상실 시 새 선택, 자동 recreate/cleanup/archive 금지.
  - test_workspace_handoff_worktree_keeps_in_place_prohibition: 기존 same-checkout new task branch 절에서 worktree 생성 금지와 failure fallback 금지를 유지하고, 명시된 세 번째 경로만 허용.
- [ ] test_workspace_handoff_worktree_creation_and_identity에서 policy_text의 소문자화 한계를 보완하는 raw, case-preserving assertion을 둔다. 정확한 문장 Do not use --force or -B. 를 확인해 uppercase -B 금지와 생성 명령의 lowercase -b를 구별한다.
- [ ] 실패 assertion은 절별 helper 추출 범위 안에서 유지해 서로 다른 절의 문구를 조합해 통과하지 않게 한다.

### Step 3: 정책 구현 전 RED 확인

- [ ] Step 4 전에 두 focused 명령을 실행한다.

    python3 -B -m unittest discover -s tests -p test_install.py -k workspace_handoff -v
    python3 -B -m unittest discover -s tests -p test_install.py -k preaction_git_evidence -v

기대 결과: 신규 worktree 절/transfer/failures 절 및 세 선택지 계약 부재로 handoff assertion이 실패한다. Mutation gate에 worktree creation이 없어 preaction assertion도 실패한다. Import·문법·discovery 오류는 RED가 아니며, 실패한 검사명과 누락 계약을 기록한다.

### Step 4: Handoff 계약 구현

- [ ] handoff.md에 지정된 두 신규 절을 추가하고 request/mutation/checkout/commit/evidence/restart 절을 연결한다.
- [ ] 세 선택지와 source/common-directory/branch/detached HEAD/base SHA/후보 branch/대상 절대 경로/문서 준비 범위를 규정한다.
- [ ] Source 현재 HEAD SHA 고정, sibling 후보와 collision·조회 오류·재선택을 규정한다.
- [ ] 생성 명령과 linked registration·common-directory·branch·base·dirty 확인을 규정한다.
- [ ] Git mutation evidence gate에 worktree creation을 포함한다.
- [ ] Source branch·HEAD·index·파일 보존과 공유 metadata 변경을 구분한다.
- [ ] Untracked 승인 문서는 index entry 없이 working-tree bytes를 검증한다. Tracked 승인 문서는 index 및 working-tree bytes 모두 승인 버전과 일치해야 한다. 불일치는 staging으로 해결하지 않고 중단한다.
- [ ] 무관 staged 변경·필요한 미커밋 구현 변경·불명확 소유권은 차단한다.
- [ ] 승인 문서만 같은 상대 경로로 전달한다. clean-base bytes를 확인한 기존 문서만 승인 버전으로 교체하고 예상 밖 변경·경로 이탈은 중단한다.
- [ ] 기존 commit 검증·target docs commit·source 자동 commit 금지를 규정한다.
- [ ] Canonical source/target 대응, 모든 역할의 workspace, choice lifetime·재개를 연결한다.
- [ ] 기존 in-place branch의 worktree 생성 금지와 모든 경로의 no-fallback을 유지한다.
- [ ] 생성 절에 정확한 case-sensitive 문장 Do not use --force or -B. 를 넣는다.

### Step 5: Recovery 계약 구현

- [ ] git-recovery.md에 Worktree failures and partial completion 절을 추가한다.
- [ ] 생성·등록·checkout·문서 전달·staging·commit 실패와 부분 완료, source/target의 실제 조사 데이터를 규정한다.
- [ ] 기존 lock·권한·변경 보존 규칙을 유지한다.
- [ ] 승인된 정상 worktree 준비와 실패 중 임의 workspace 이동을 구분한다.
- [ ] Docs commit 예외를 세 경로로 갱신하고 자동 fallback/delete/prune/force·상태 미확인 재실행을 금지한다.

### Step 6: 구현 후 GREEN 확인

- [ ] 같은 두 명령을 실행한다.

    python3 -B -m unittest discover -s tests -p test_install.py -k workspace_handoff -v
    python3 -B -m unittest discover -s tests -p test_install.py -k preaction_git_evidence -v

기대 결과: 신규·갱신 검사와 기존 assertion이 모두 통과하고 종료 코드가 0이다. 절별 검사 범위가 다른 절의 문구를 잘못 조합하지 않는지 확인한다.

## Task 2: Planning·공통 gate·README를 test-first로 동기화

**Files:**

- Modify: tests/test_install.py — ConditionalReferenceTests, RolePolicyTests
- Modify: skill/references/planning.md
- Modify: skill/SKILL.md
- Modify: README.md

**Interfaces:**

- Consumes: Task 1의 worktree 생성·문서 전달·recovery·mutation gate 계약.
- Produces: 승인 전 worktree 준비 금지, 공통 handoff gate와 한국어 안내의 일치.
- Reuses: policy_text()와 기존 검사 패턴.
- Task 1의 preaction assertion과 RED/GREEN 명령은 Task 2에 중복 배정하지 않는다.

### Step 1: Planning 기존 검사 확장

- [ ] ConditionalReferenceTests.test_planning_order_and_recovery_protections_remain에 두 assertion을 추가한다.
  - while documents.*do not.*worktree creation.*stage documents.*commit planning documents
  - normal order:.*complete applicable set.*explicit execution-target choice.*approved branch switch or worktree creation.*batch commit.*final git verification

### Step 2: 동기화 검사 추가

- [ ] RolePolicyTests.test_worktree_planning_and_core_preparation_gates를 추가한다. planning.md에서 문서 승인 중 worktree creation 금지와 승인 branch switch/worktree creation이 batch commit보다 앞서는 순서를 검사한다. skill/SKILL.md에서 selected worktree의 common directory·registration·source preservation 확인 및 depth-2 roles의 supplied workspace 사용을 검사한다.
- [ ] RolePolicyTests.test_worktree_readme_matches_selected_execution_paths를 추가한다. README에서 세 선택지, ../<repo>-<topic>-worktree, 승인/실행 순서, untracked·tracked 문서 bytes, mismatch 차단, 실패·재개·runtime 한계를 검사한다.

### Step 3: 동기화 전 RED 확인

- [ ] Task 2 정책·README 구현 전에 다음을 실행한다.

    python3 -B -m unittest discover -s tests -p test_install.py -k worktree -v
    python3 -B -m unittest discover -s tests -p test_install.py -k planning_order_and_recovery -v

기대 결과: Task 1 worktree 검사는 통과하고 planning/core/README의 신규·갱신 assertion이 실패한다. 기존 worktree 외부 스킬 검사는 계속 통과해야 한다.

### Step 4: Planning·core 구현

- [ ] planning.md의 정상 순서에 approved branch switch or worktree creation을 반영하고 문서 작성·승인 중 worktree creation을 금지한다.
- [ ] Spec 선행 commit 이연, 개별 승인, 문서 집합 완결, valid omissions, batch docs commit 규칙을 유지한다.
- [ ] skill/SKILL.md 공통 gate에 selected worktree의 common directory·registration·source preservation을 포함한다.
- [ ] 상세 계약은 기존 references에 두고 역할 권한·위험 흐름·외부 필수 스킬 집합을 유지한다.

### Step 5: README 구현

- [ ] 세 선택지와 승인·생성·문서 전달·실패·재개 순서를 한국어로 안내한다.
- [ ] README에 다음 규칙을 명시한다: 승인된 untracked spec/plan은 index entry 없이 working-tree bytes를 승인 버전과 비교한다. Tracked 승인 문서는 index bytes와 working-tree bytes가 모두 승인 버전과 같아야 한다. 불일치하면 중단하며 staging으로 해결하지 않는다.
- [ ] HEAD SHA, branch, commit, runtime identifiers와 구조 검사의 한계를 보존한다.

### Step 6: GREEN과 core budget 확인

- [ ] 다음을 실행하고 모두 종료 코드 0을 확인한다.

    python3 -B -m unittest discover -s tests -p test_install.py -k worktree -v
    python3 -B -m unittest discover -s tests -p test_install.py -k planning_order_and_recovery -v
    python3 -B -m unittest discover -s tests -p test_install.py -k core_word_count -v

기존 core word-count 제한 2788을 유지한다. 초과하면 상세를 references에 두고 core를 줄인다. 제한 완화나 범위 밖 파일 추가로 해결하지 않는다.

## Task 3: Manifest·전체 회귀·독립 수락

**Files:**

- Modify: MANIFEST.sha256
- Read: Task 1–2 최종 6개 파일과 승인 spec/plan
- Test: tests/test_install.py 전체 suite

**Interfaces:**

- Consumes: Task 1–2 focused GREEN과 최종 정책·README.
- Produces: Digest 일치·전체 회귀 결과·AC별 QA 근거·최종 Reviewer 결과.
- 테스트 파일과 spec/plan은 manifest 대상에 추가하지 않는다.

### Step 1: 변경된 관리 파일 digest 갱신

- [ ] 다음 다섯 파일의 raw bytes SHA-256을 계산하고 manifest에서 해당 행만 갱신한다. 경로 집합·정렬·형식·다른 digest는 유지한다.

    python3 -B -c 'from pathlib import Path; import hashlib; names = ("README.md", "skill/SKILL.md", "skill/references/handoff.md", "skill/references/git-recovery.md", "skill/references/planning.md"); print("\n".join(f"{hashlib.sha256(Path(name).read_bytes()).hexdigest()}  {name}" for name in names))'

### Step 2: 전체 검사

- [ ] 실행하고 종료 코드·결과를 기록한다.

    python3 -B -m unittest discover -s tests -v
    shasum -a 256 -c MANIFEST.sha256
    git diff --check
    git diff --name-only

기대 결과: 전체 suite 종료 코드 0, 모든 manifest 대상 OK, whitespace 오류 없음, 구현 변경이 승인된 7개 파일과 일치한다. CEO의 planning-document 준비 commit과 구현 diff는 구분해 기록한다. 전체 suite에는 기존 test_install_preserves_existing_using_git_worktrees와 test_acquisition_rejects_unrequested_using_git_worktrees_result가 포함되며 두 검사는 변경하지 않는다.

실패는 검사명·원인·환경/코드 구분을 보고한다. 수정 후 영향받은 focused 검사와 전체 suite·digest를 갱신한다.

### Step 3: 독립 QA

- [ ] CEO가 최종 workspace/state·승인 artifacts·테스트 권한을 전달한다. QA는 전체 suite·manifest·diff를 최종 상태에서 독립 확인하고 각 기준에 method/scope·run status·evidence·criterion verdict·unverified reason을 연결한다.

| Spec 기준 | 주요 근거 |
|---|---|
| 1 | Scoped checkout·README 검사 |
| 2 | Planning/core/preaction 검사 |
| 3–4 | Scoped choice/base 검사 |
| 5 | Collision·재선택 및 기존 branch collision 검사 |
| 6 | Creation/identity·raw -B·in-place prohibition 검사 |
| 7 | Source dirty·기존 preservation 검사 |
| 8 | Document transfer·docs order·기존 commit 검사 |
| 9 | Partial completion·기존 no-fallback 검사 |
| 10 | Roles/restart·기존 choice lifetime 검사 |
| 11 | 전체 suite·manifest·7개 파일 scope |
| 12 | Structural evidence와 실제 Git/runtime 미검증 구분 |

구조 기준의 입증을 실제 provisioning/runtime 입증으로 확대하지 않는다.

### Step 4: QA 이후 독립 Reviewer

- [ ] CEO가 QA 결과와 최종 전체 7개 파일 diff를 전달한다.
- [ ] 기존 금지가 새 명시 worktree 경로까지 금지하지 않는지 확인한다.
- [ ] 무응답·운영 실패가 다른 경로로 fallback하지 않고 branch/path/base 변경의 재선택이 유지되는지 확인한다.
- [ ] Raw uppercase -B 금지 검사가 생성 명령의 lowercase -b와 구분되는지 확인한다.
- [ ] Tracked/untracked bytes 규칙·clean-base 교체·예상 밖 변경 중단이 일치하는지 확인한다.
- [ ] 문서 승인 완결·target docs commit·source 보존·choice lifetime이 일관적인지 확인한다.
- [ ] 정규식이 다른 절의 문구를 조합해 우연히 통과하지 않는지 확인한다.
- [ ] Installer·외부 스킬·profiles·역사적 문서가 변경되지 않았는지 확인한다.
- [ ] 기준 관련 finding은 Coder 수정과 QA 재확인 후 최종 전체 변경 재검토로 처리한다. Reviewer로 QA 실행 근거를 대신하지 않는다.

### Step 5: CEO 수락

- [ ] RED/GREEN·전체 suite·digest·AC별 판단·Reviewer findings를 확인한다.
- [ ] Applicable findings 해결 또는 disposition과 미검증 범위를 확인한 뒤 수락한다.
- [ ] 구현 commit은 수락 후 기존 optional commit 규칙에 따른다. Task별 commit·push·merge·설치를 의무화하지 않는다.

## 의존성·남은 결정·자체 검토

**의존 순서:** 계획 승인과 기존 handoff 준비 → Task 1 → Task 2 → Task 3 → QA → Reviewer → CEO 수락.

**남은 결정:** 없음. 실제 실행 branch/workspace는 계획 승인 후 현재 handoff 계약으로 선택한다. 이 계획에서 새 worktree를 실제 생성하지 않는다.

**자체 검토 결과:**

- 승인 보완 spec의 12개 수용 기준을 구현·QA coverage에 연결했다.
- 세 신규 heading의 소유 파일을 고정했다.
- Source untracked/index 부재와 tracked 양쪽 bytes 일치·불일치 중단을 정책·검사·README에 반영했다.
- Uppercase -B 금지는 case-preserving raw assertion으로 검증한다.
- Handoff mutation gate의 worktree creation 검사와 RED/GREEN을 Task 1로 이동했다. Task 2에는 중복 preaction 단계가 없다.
- 변경 파일 7개와 manifest 갱신 대상 5개를 구분했다.
- Review Focus 5개를 각각 test-first 검사에 배정했다.
- 실제 worktree provisioning·외부 executor·추가 실행 방식 질문·scope 밖 변경을 포함하지 않았다.
- Significant/high의 독립 QA → 최종 Reviewer 순서와 structural/runtime evidence 구분을 유지했다.
