# 워크트리와 작업 브랜치 생성 실행 선택지 설계 명세

**상태:** written spec 승인 완료  
**날짜:** 2026-10-08  
**경로 분류:** Architectural  
**검증 위험:** Significant/high

## 1. 목적과 승인 범위

Harness의 실행 대상 선택에 세 번째 경로를 추가한다.

> 새 worktree와 새 task branch를 함께 만들고, 생성한 worktree를 역할들의 실행 workspace로 사용한다.

기존 선택지는 유지한다: 현재 checkout 사용, 현재 checkout에서 새 task branch 생성·전환. 새 경로의 기본 후보는 원본 checkout의 sibling 경로 `../<repo>-<topic>-worktree`다. CEO는 branch 후보와 worktree의 실제 절대 경로를 함께 제시하고, 생성 전에 사용자의 명시 선택을 받는다. 사용자는 sibling 경로 제안과 구조 테스트 추가·수정·실행을 승인했다. 이 승인은 특정 실행 대상 선택이나 실제 Git 변경 승인을 대신하지 않는다.

## 2. 현재 계약 및 승인 순서

현재 [handoff 계약](/Users/ma-24-007/Desktop/workspace/yunho-harness/skill/references/handoff.md:42)은 현재 checkout 또는 같은 checkout의 새 branch만 허용한다. `New task branch`의 worktree 생성/fallback 금지는 그 기존 선택지에 계속 적용한다. 새 worktree는 새 선택지에서 명시 선택된 경우에만 허용한다. 세 선택지 모두 실패 후 자동 fallback을 금지한다.

적용 spec/plan 전체가 작성·개별 승인되고 문서 집합이 완결되기 전에는 실행 대상 선택과 Git 준비를 하지 않는다. Planning, [공통 handoff gate](/Users/ma-24-007/Desktop/workspace/yunho-harness/skill/SKILL.md:82), change preservation 및 choice lifetime 규칙을 유지한다. 이 작업은 workspace·shared Git state·handoff lifecycle을 바꾸므로 Architectural이며 written spec과 plan 승인이 필요하다.

## 3. 선택 대상과 후보

새 worktree 경로의 선택 대상에는 다음을 포함한다.

- 원본 checkout의 절대 경로와 intended repository/Git common directory.
- 원본 branch 또는 detached HEAD, 검증된 현재 HEAD의 전체 commit SHA.
- 유효하고 미사용인 task branch 후보.
- 충돌이 없는 worktree 절대 경로.
- 승인 문서만 대상의 동일 repository-relative path로 전달하고 대상에서 commit할 범위.

Base는 원본 checkout에서 확인한 현재 HEAD SHA다. `master`, `main`, remote default branch나 최신 remote HEAD로 바꾸거나 자동 fetch하지 않는다. Detached HEAD도 SHA를 확인하고 선택 대상에 포함하면 허용한다. Repository나 HEAD 확인에 실패하면 중단한다.

Branch 형식은 기존 `<type>/<short-kebab-case-topic>`을 유지한다. 이름 충돌 시 topic에 `-2`, `-3` 등 suffix를 붙여 첫 미사용 후보를 찾되 branch를 재사용·삭제·덮어쓰지 않는다. Lookup error와 branch 부재를 구분한다.

기본 경로 후보는 다음과 같다.

```text
../<repo>-<topic>-worktree
```

`<repo>`는 원본 checkout root의 이름이고 `<topic>`은 branch type과 slash를 뺀 kebab-case topic이다. 후보를 원본 root의 부모 아래 절대 경로로 해석한다. 실제 대상은 원본과 같은 부모 아래 sibling이어야 한다. 파일·디렉터리·symlink·기존 worktree와 충돌하면 사용하지 않는다. 빈 디렉터리도 재사용하지 않는다. 조회 오류나 불확실한 상태에서는 중단한다. 경로 충돌에는 `-worktree-2` 등 suffix 후보를 제시할 수 있지만, 최종 branch/path 쌍을 하나의 실행 대상으로 승인받는다. 기존 worktree/branch를 자동 선택하지 않는다.

선택 뒤 base, branch 후보, 원본 state 또는 path가 달라지거나 새 collision이 생기면 갱신한 대상을 제시하고 새 선택을 받는다. 무응답·모호한 답변·한 경로의 거절로 다른 경로를 선택했다고 추정하지 않는다.

## 4. Worktree 생성과 확인

대표 생성 명령은 다음과 같다.

```text
git worktree add -b <branch> <absolute-path> <base-sha>
```

승인된 값만 사용하고 `--force` 또는 `-B`를 쓰지 않는다. 외부 `using-git-worktrees`를 필수화하거나 app-specific API에 의존하지 않는다. 생성은 원본 branch, HEAD, index와 파일 변경을 보존한다. 공용 Git metadata에 branch 및 worktree 등록 정보가 추가되는 것은 승인된 범위다.

성공 후 CEO는 실제 대상 absolute root, linked-worktree 등록, 원본·대상의 동일한 Git common directory, 선택 branch, base SHA, 등록된 path/branch와 실제 상태 일치, 대상 dirty state를 확인한다. 원본 branch·HEAD·index·파일 변경도 보존됐는지 다시 확인한다. Linked worktree의 `.git`은 파일일 수 있으므로 같은 top-level path나 `.git` 디렉터리 존재를 저장소 동일성 기준으로 삼지 않는다.

## 5. Dirty 상태와 승인 문서

원본을 clean으로 만들지 않는다. 승인된 untracked spec/plan은 index entry가 없는 것이 정상이며, working-tree bytes가 승인 버전과 같은지 확인한다. Tracked 승인 문서는 index bytes와 working-tree bytes가 모두 승인 버전과 일치해야 한다. 두 버전이 다르거나 소유권이 불명확하면 중단한다. 명확히 무관한 unstaged/untracked 변경은 원본에 보존하고 이전하지 않을 수 있지만, 무관한 staged 변경과 작업에 필요한 미커밋 구현·설정·테스트 변경은 기존 규칙에 따라 중단 사유다. Dirty 구현 파일을 자동 이전하지 않으며 자동 stash·commit·reset·clean·unstage하지 않는다.

이미 commit된 승인 문서는 SHA, message, 경로, 승인 내용이 base/대상에서 유효한지 검증해 재사용한다. 미커밋 spec/plan만 대상의 같은 repository-relative path로 복사한다. 원본은 이동·삭제·수정하지 않는다. 대상 path가 worktree 밖을 가리키거나 symlink를 따라 이탈하면 중단한다. 목적지가 base commit에 있던 파일이면 대상이 새 worktree의 깨끗한 base 상태이며 해당 파일 bytes가 base 버전과 일치하는지 확인한 뒤 승인 버전으로 교체할 수 있다. 목적지에 예상과 다른 변경이 있거나 base 상태인지 입증할 수 없으면 덮어쓰지 않고 중단한다. 동일 내용은 검증 후 재사용할 수 있고, 전달 후 bytes가 승인 버전과 같은지 확인한다. 다른 파일은 복사하지 않는다.

Canonical record에는 각 문서의 승인 버전·근거, 원본/대상 absolute path, 공통 상대 경로와 내용 확인을 기록한다. 문서 내용이나 승인 scope가 바뀌면 새 버전을 승인받는다.

## 6. Docs commit, 실패와 역할 인계

새 worktree 경로의 준비 순서는 다음과 같다.

```text
적용 문서 전체 작성·개별 승인
→ 실행 대상 명시 선택
→ worktree/branch 생성·검증
→ 기존 문서 commit 검증·재사용
→ 미커밋 승인 문서 전달·내용 확인
→ 대상 index/diff 확인
→ 남은 승인 문서만 focused docs commit
→ 원본·대상 최종 상태 검증
→ Coder handoff
```

CEO는 첫 commit 전 구체적인 한국어 Conventional Commit message를 정한다. 대상에서 승인 문서만 stage하고 staged paths/diff가 정확히 일치하는지 확인한다. 무관 staged 변경이 있으면 보존하고 중단한다. 유효한 기존 commit은 재commit하지 않는다. 모두 commit됐으면 검증만 한다. 문서가 필요하지 않고 생성되지 않은 경로만 기존 depth 근거를 기록하고 commit을 생략한다. Commit 후 SHA·message·paths·승인 내용·branch·HEAD·dirty state를 확인한다. 원본 문서는 원본에서 자동 commit하지 않으며 push 권한은 추가하지 않는다.

Worktree 생성·등록·checkout, 문서 전달, staging, commit 실패 시 실제 상태를 기록하고 dependent work와 handoff를 중단한다. 부분 완료에는 branch만 생성, 일부 path 생성, 등록/실제 경로 불일치, 잘못된 base/branch, 일부 문서만 전달 등이 포함된다. 원본·대상의 정확한 명령/오류, branch·HEAD·common directory·등록·index·파일 상태를 확인하고 [git-recovery.md](/Users/ma-24-007/Desktop/workspace/yunho-harness/skill/references/git-recovery.md)를 적용한다.

자동 fallback, 다른 path/branch 재시도, branch/path/worktree 삭제, 강제 remove, `git worktree prune`, `--force`, `-B`, lock 삭제, 권한 변경, reset/stash/clean 및 상태 확인 없는 재실행을 금지한다. 승인된 worktree 경로는 recovery의 임의 workspace 이동 금지와 구분한다. 대상 신뢰가 무효화되거나 변경되면 새 선택을 받는다.

모든 역할(Coder, QA, Planner, Reviewer, Scout, Secretary)은 선택된 worktree absolute path를 공유한다. 역할은 독립적으로 workspace/branch를 만들거나 바꾸지 않는다. Coder는 매 시작·재개 전에 대상 repository/common directory·path·branch·HEAD·dirty state·문서 commit·승인·소유권을 독립 확인한다. 같은 승인 scope/repository/worktree/branch의 최초 선택 근거가 유효하면 선택은 재사용할 수 있으나 실제 상태를 매번 확인한다. 실패가 신뢰를 무효화하거나 scope/target이 바뀌면 새 선택이 필요하다. 자동 worktree cleanup/archive는 범위 밖이다.

## 7. 파일 범위와 수용 기준

| 파일 | 변경 범위 |
|---|---|
| `skill/references/handoff.md` | 세 선택지, 생성·확인, dirty/docs 처리, 기록·재개 |
| `skill/references/git-recovery.md` | 부분 완료 및 recovery 적용 범위 |
| `skill/references/planning.md` | 승인 중 생성 금지와 준비 순서 |
| `skill/SKILL.md` | 공통 handoff gate |
| `README.md` | 실행 대상 안내 |
| `tests/test_install.py` | 구조 계약 검사 갱신·추가 |
| `MANIFEST.sha256` | 변경된 관리 파일 digest |

수용 기준:

1. 활성 정책과 README가 세 선택지를 동일하게 명시한다.
2. 적용 문서 전체 승인 전 대상 선택·worktree/Git 준비가 금지된다.
3. 새 선택 대상에 원본·common directory·branch/detached HEAD·base SHA·branch 후보·절대 path·문서 준비 범위가 포함된다.
4. 검증된 원본 HEAD SHA를 base로 쓰고 remote/default branch로 대체하지 않는다.
5. Branch/path collision, lookup error와 승인 후 후보 변경을 구분하고 재승인 없이 값을 바꾸지 않는다.
6. 새 선택에서만 `git worktree add -b`를 허용하고 common directory·등록·path·branch·base·dirty state를 확인한다.
7. 원본 변경을 보존하고 구현 파일을 이전하지 않는다. Untracked 승인 문서는 index entry 부재를 허용하고 working bytes로 검증하며, tracked 문서는 index와 working-tree bytes가 승인 버전과 일치해야 한다. 무관 staged 변경과 불명확 소유권은 차단한다.
8. 승인된 spec/plan만 같은 상대 경로로 전달·검증하고 남은 문서만 대상에서 한 번 commit한다.
9. 실패·부분 완료는 handoff를 막고 자동 fallback·삭제·prune·force를 금지한다.
10. 모든 역할이 선택 workspace를 공유하고 choice lifetime 및 매 시작/재개 검증을 유지한다.
11. 활성 정책·README·테스트·manifest가 맞고 installer, external-skill set, profiles, 역사적 문서는 바뀌지 않는다.
12. 구조 검사와 실제 Git/runtime 증거를 구분한다.

구현은 written-spec 승인 뒤 `writing-plans` 계획 작성·승인에 의존한다. 구조 테스트는 정책 텍스트 관계만 검증한다. Coder는 신규·갱신 계약을 먼저 테스트하고 RED를 확인한 뒤 정책을 수정한다. README/manifest를 동기화하고 focused unittest, 전체 unittest, manifest digest와 `git diff --check`를 검증한다. Shared role/workspace/lifecycle 정책의 significant/high 위험 흐름에 따라 독립 QA 이후 Reviewer가 최종 변경을 검토한다. 실제 worktree 생성이나 agent runtime 준수를 테스트 통과로 주장하지 않는다.

## 8. 근거와 자체 검토

설계 시점 workspace 근거:

```text
/Users/ma-24-007/Desktop/workspace/yunho-harness
branch: master
HEAD: bf04e4b0c546a46974f693311eb6c9b26c42d4cb
state: clean
```

Spec/plan 작성으로 상태가 바뀌었으므로 실행 준비 직전에 다시 확인한다. 과거 문서의 `/Users/yunho/Desktop/project/yunho-harness`는 역사적 경로다.

자체 검토: 원본 HEAD SHA와 branch/path 후보 및 재승인 조건을 고정했다. 기존 worktree 금지는 현재 checkout의 새 branch 경로에 유지하고 명시 worktree 선택만 추가한다. Untracked 승인 문서의 index entry 부재와 tracked 문서의 index/working-tree 일치를 구분했다. 원본 보존, 승인 문서의 제한적 전달, target docs commit, 실패 중단과 역할 재개가 수용 기준에 포함됐다. Placeholder와 미결 설계 결정은 없다. 실제 branch/path 값은 승인 후 collision 확인 및 명시 선택으로 확정한다.

**승인 기록:** 2026-10-08 사용자 `ㅇㅇ`를 sibling 경로 제안 및 구조 테스트 추가·수정·실행을 포함한 설계 승인으로, 같은 날 사용자 `ㄱㄱ`와 `ㅇㅋ ㄱㄱ`를 각각 written-spec 최초본 및 untracked/index 구분을 명시한 보완본의 승인으로 기록한다.  
**현재 상태:** written spec 승인 완료. Plan 승인을 포함한 나머지 실행 게이트가 끝나기 전에는 실행 대상 선택, Git 준비 또는 Coder 구현을 시작하지 않는다.
