# bridge-fetch-tolerance 구현 계획

> **For agentic workers:** 이 계획은 ARC Bounded plan이다. task마다 Implementer → fresh QA → Orchestrator 수용·focused commit 순서로 진행하고, 모든 task를 수용한 뒤 최종 Reviewer 1회로 마친다. 진행 추적은 체크박스(`- [ ]`)로 한다.

**Goal:** bridge 실행 뒤 감지(post-run detection)에서 외부 Git 활동으로 생기는 오탐을 없앤다. 대상은 다음 세 가지다.
- T1: fetch로 생기는 remote-tracking ref, 새 tag, `info/refs`
- T2: 다른 등록 worktree의 branch
- T3: 대상 worktree의 제한적 fast-forward 커밋

허용한 변화는 dispatch record의 `tolerated`에 기록한다.

**Architecture:**
- `lib/runtime/role-observe.mjs`가 판정을 맡는다.
  - `detectViolations` 분류 확장
  - `snapshotWorktree`의 worktree 목록 수집
  - 새 함수 `observeHeadAdvance`, `toleratedRecord`
- `lib/runtime/role-supervisor.mjs`는 판정 결과를 record에 싣는다.
- 두 파일의 `shared/skill/runtime/` 미러는 바이트가 같아야 한다.
- observe와 lease는 바꾸지 않는다.

**Tech Stack:** Node.js ESM, `node:test`, git CLI.

**Spec:** 별도 spec은 없다(설계 승인 시 결정). 근거는 2026-11-20에 승인된 설계(사용자 결정 D1–D11)와 plan 단계 결정 P1–P4다. 핵심 규칙은 아래 "승인 설계 요약"에 옮겨 두었으므로 이 plan만 읽고 구현할 수 있다.

## 승인 설계 요약

### 사용자 결정
| ID | 결정 |
|---|---|
| D1 | 근본 수정(B 방안)으로 간다. VS Code 설정 변경은 범위 밖이다. |
| D2 | 실행 대상은 managed worktree `.claude/worktrees/bridge-fetch-tolerance`, branch `fix/bridge-fetch-tolerance`, base `12aa9a3bbf9dc30243d69cb85a10b685d1162328`이다. |
| D3 | tag는 실행 전에 없던 새 tag가 생기는 것만 허용한다. 기존 tag가 옮겨지거나 삭제되면 위반이다. |
| D4 | 다른 worktree의 branch는 규칙 W1에 따라 허용한다(아래 분류 4). |
| D5 | observe와 lease는 바꾸지 않는다. record의 `tolerated`에만 기록한다. |
| D6 | 형태는 `tolerated: {refs?, control?, commitPaths?, truncated?}`이다. 빈 목록은 키를 생략한다. 목록마다 상한은 100개다. |
| D7 | 이름만 기록하고 object id는 기록하지 않는다. |
| D8 | 3개 task를 T1 → T2 → T3 순서로 진행한다. |
| D9 | 대상 worktree의 커밋을 제한적으로 허용한다. 사용자는 역할의 무단 커밋을 감지하지 못하게 된다는 점을 알고 수용했다. |
| D10 | 읽기 역할(Scouter, Planner, Reviewer)과 `allowedPaths`가 없거나 빈 배열인 QA는 T3 경로 검사(조건 8)를 생략한다. 빈 QA를 포함한다는 해석은 사용자가 확인했다. |
| D11 | detached HEAD에서의 커밋은 허용하지 않는다. 커밋이 100개를 넘거나 경로가 10,000개를 넘으면 위반이다. |
| P1 | 조건 7(경로 수집과 10,000개 상한)은 모든 역할에 적용한다. 수집에 실패하거나 상한을 넘으면 D10 역할도 위반이다. 사용자가 확인했다. |
| P2 | 잘림 표시는 `tolerated.truncated: true` 하나로 한다. 목록 중 하나라도 100개를 넘으면 붙인다. 사용자가 확인했다. |
| P3 | 대상 루트를 식별하기 위해 `snapshotWorktree`가 `worktreeRoot`(realpath)를 반환한다. 사용자가 확인했다. |
| P4 | 내부 `why` 값은 record에 싣지 않는다. |

### 수집
**T2: `snapshotWorktree(worktree)` 반환 필드 추가**
- `worktreeRoot`: `rev-parse --show-toplevel` 결과의 realpath다. realpath가 실패하면 원래 값을 쓴다.
- `worktreeBranches`: `{[realpath]: 'refs/heads/<b>' | null}` 형태다.
  - `git worktree list --porcelain -z` 출력을 파싱해 만든다(v4). 레코드는 `\0\0`, 속성은 `\0`로 나뉜다.
  - git이 `-z`를 지원하지 않으면(옵션 오류로 실패) `-z` 없는 `git worktree list --porcelain`의 줄 단위 출력을 파싱한다(v4). 레코드는 빈 줄, 속성은 개행으로 나뉜다. 이 대체 경로에서는 prunable이 아닌 레코드의 경로가 실제 디렉터리로 realpath되어야 하고, 하나라도 아니면 `null`로 둔다.
  - worktree 경로는 realpath로 정규화한다. 실패하면(prunable 등) 원래 경로를 쓴다.
  - 그 밖의 이유로 명령이 실패하면 기존 `git()` helper처럼 throw한다. 즉 스냅샷 전체가 실패한다.
  - 대상 branch 판정은 `git symbolic-ref --quiet HEAD`의 full ref(`branchRef`)로 한다(v4). short 이름은 같은 이름의 tag가 있으면 `heads/<b>`가 되어 오분류된다. before나 after에 `branchRef` 정보가 없으면 다른 worktree branch 허용을 끈다.
  - 파싱이 모호하면 `worktreeBranches: null`로 두어 worktree 허용을 끈다. 모호한 경우는 다음과 같다.
    - 레코드가 `worktree `로 시작하지 않음
    - `branch `/`detached`/`bare` 중 정확히 하나가 아님
    - 같은 realpath 키가 중복됨
    - 알 수 없는 형식의 줄이 있음
  - 값은 `branch` 줄이면 그 ref, `detached`·`bare`이면 `null`이다.
  - 허용하는 속성 줄은 `HEAD`, `locked[ reason]`, `prunable[ reason]`이다.

**T3: 새 함수 `export async function observeHeadAdvance(root, before, after, role, allowedPaths)`**
- 반환값은 다음 셋 중 하나다.
  - `{state:'none'}`
  - `{state:'advance', branch, commits, paths}`
  - `{state:'rejected', why, outOfScopePaths?}`
- 절대 throw하지 않는다. git 오류, timeout, 비정상 출력은 모두 `rejected`로 돌려준다.
- `before.branch !== after.branch`이면 `{state:'rejected', why:'branch_switched'}`, `before.head === after.head`이면 `{state:'none'}`이다.
- `why` 값: `branch_switched`, `detached`, `unborn`, `branch_ref_mismatch`, `not_fast_forward`, `merge_commit`, `too_many_commits`, `too_many_paths`, `out_of_scope`, `git_failed`, `invalid_output`. 내부 판정과 테스트에만 쓰고 record에는 싣지 않는다(P4).

### T3 허용 조건
모두 만족해야 `advance`다.
1. `before.branch !== null`이고 `before.branch === after.branch`다(detached 제외). 어기면 `detached`.
2. `before.head`와 `after.head`가 모두 non-null이고 서로 다르다(unborn 제외). 어기면 `unborn`.
3. `before.refs['refs/heads/<b>'] === before.head`이고 `after.refs['refs/heads/<b>'] === after.head`다. 어기면 `branch_ref_mismatch`.
4. `git merge-base --is-ancestor <before.head> <after.head>`의 종료 코드가 0이다. 1이면 `not_fast_forward`, 그 밖은 `git_failed`.
5. `git rev-list --min-parents=2 <before>..<after>` 결과가 비어 있다. 아니면 `merge_commit`.
6. `git rev-list --count <before>..<after>`가 100 이하다. 넘으면 `too_many_commits`, 숫자가 아니면 `invalid_output`.
7. 경로를 수집한다. 모든 역할에 적용한다(P1).
   - 명령: `git log --no-renames --name-only -z --format= <before>..<after>`
   - 커밋별 경로를 합집합으로 모은다.
   - rename은 delete와 add로 나뉘어 원래 경로와 새 경로가 모두 남는다. 삭제, 모드 변경, gitlink도 포함한다.
   - 파싱: `\0`로 나누고, 각 토큰 앞의 `\n`을 한 번만 제거하고, 빈 토큰은 버린다. 남은 토큰에 `\n`이 있으면 `invalid_output`이다.
   - 서로 다른 경로가 10,000개를 넘으면 `too_many_paths`다.
8. 경로 검사는 `arc_implementer`(allowedPaths가 배열이 아니면 `[]`로 본다)와, allowedPaths가 비어 있지 않은 `arc_qa`에만 적용한다.
   - 모든 경로가 `allowedBy(allowedPaths, file)`를 통과해야 한다.
   - 통과하지 못한 경로가 있으면 `{state:'rejected', why:'out_of_scope', outOfScopePaths}`를 돌려준다(정렬, 중복 제거).
   - 빈 커밋은 경로가 없으므로 항상 통과한다.

**성공과 공통 사항**
- 성공하면 `{state:'advance', branch:'refs/heads/<b>', commits:<count>, paths:<정렬된 합집합>}`을 돌려준다.
- git 호출에는 기존 `gitEnv()`와 `--no-pager -c core.fsmonitor=false`를 쓰고, timeout은 60000이다.
- 조건 4는 종료 코드가 필요하다. execFile 오류의 숫자 `code`를 돌려주는 내부 helper를 쓴다.

### 역할별 T3 결과
| 역할 | 적용 조건 |
|---|---|
| `arc_implementer` | 1–8 |
| `arc_qa`(allowedPaths가 비어 있지 않음) | 1–8 |
| `arc_qa`(allowedPaths가 없거나 빈 배열) | 1–7 |
| Scouter, Planner, Reviewer | 1–7 |

참고: D10 역할이 실행 전부터 dirty였던 파일을 커밋하면 status 차이가 생기므로 기존 `changedPaths` 위반이 된다. 실행 중에 새로 만들어 커밋한 파일은 status 차이가 없으므로 허용된다.

### `detectViolations({role, allowedPaths, before, after, headAdvance})` 판정
**branch와 HEAD**
- branch 전환(`before.branch !== after.branch`)은 항상 `headChanged: true`다.
- HEAD 이동(`before.head !== after.head`):
  - `headAdvance?.state === 'advance'`이면 `headChanged: false`다. 대상 branch ref(`refs/heads/<before.branch>`)가 `before.head`에서 `after.head`로 옮겨진 것도 허용하고 `toleratedRefs`에 넣는다. 이때 조건 3을 다시 확인한다.
  - 그 밖(`rejected`, 인자 없음, `none`인데 HEAD 차이가 있는 모순)은 `headChanged: true`다. 대상 branch ref 변경도 위반이다.
  - T1–T2 시점에는 `headAdvance`가 없으므로 HEAD 이동은 모두 위반이다.

**나머지 ref 차이**(before와 after 값이 다른 이름)는 다음 순서로 분류한다.
1. 대상 branch ref(`refs/heads/<before.branch>`)의 그 밖의 변경(생성, 삭제, 조건 밖 이동)은 위반이다. `before.branch`가 null이면 이 분류는 해당 없다.
2. `refs/remotes/**`의 생성·이동·삭제는 허용한다(T1).
3. `refs/tags/X` 중 before에 없던 것은 허용한다(T1). 기존 tag의 이동·삭제는 위반이다.
4. `refs/heads/X`가 `otherBranches`에 있으면 허용한다(T2).
   - `otherBranches`는 before와 after의 `worktreeBranches`를 합친 뒤, 키 `before.worktreeRoot`와 `after.worktreeRoot`를 빼고 남은 non-null 값의 집합이다.
   - 한쪽 `worktreeBranches`가 null이거나 없으면 빈 집합이다. 대상 루트가 before나 after 목록 중 하나에라도 없어도 빈 집합이다.
5. 그 밖은 모두 위반(`refsChanged: true`)이다. 예: 체크아웃되지 않은 `refs/heads/**`, `refs/arc*`, `refs/notes/*`, `refs/stash`.

**control**
- 차이가 난 라벨이 정확히 `git:info/refs`이면 허용하고 `toleratedControl`에 넣는다(T1).
- 그 밖은 모두 `controlChanged`에 넣는다. `git:info` 루트의 changed·overflow, `git:info/exclude`·`attributes`·`sparse-checkout`, hooks, config, `config.worktree`, `.claude/settings*.json`, `.codex/config.toml`, grok-home이 해당한다.

**changedPaths**
- status 차이로 계산하는 기존 방식을 그대로 둔다.
- 여기에 `headAdvance.state === 'rejected'`의 `outOfScopePaths`를 합치고, 중복을 제거해 정렬한다.

**반환값**
- `{reason, changedPaths, headChanged, refsChanged, controlChanged, toleratedRefs, toleratedControl}`이다. T3부터 `toleratedCommitPaths`가 붙는다.
- 배열은 정렬하고 기본값은 `[]`다.
- `headChanged`와 `refsChanged`는 "허용되지 않은 변경"을 뜻한다.
- `reason`은 위반이 하나라도 있을 때만 `'permission_violation_observed'`다.
- `toleratedCommitPaths`는 `advance`일 때의 `headAdvance.paths`다.

### record
- 새 export `toleratedRecord(violations)`(`role-observe.mjs`)는 `{refs?, control?, commitPaths?, truncated?}` 또는 `null`을 돌려준다.
  - 빈 목록은 키를 생략한다.
  - 목록이 100개를 넘으면 정렬된 앞 100개만 남기고 `truncated: true`를 붙인다(P2).
  - 허용 변화가 없으면 `null`이다.
- supervisor는 `writeRecord`에 `...(tolerated ? {tolerated} : {})`를 더한다. 기존 필드, `violations` 형태, `controlFiles`는 그대로 둔다.
- supervisor `:454`의 기본값 객체에 `toleratedRefs: [], toleratedControl: []`(T1)와 `toleratedCommitPaths: []`(T3)를 추가한다.
- T3 supervisor 흐름: after 스냅샷에 성공하면 바로 `headAdvance = await observeHeadAdvance(target.realpath, before, after, lease.role, lease.allowedPaths)`를 호출하고, 결과를 `detectViolations`에 넘긴다.

## Global Constraints
- **범위:** lib과 미러 각 2개, 4개 `coordination.md`, `docs/harness-operation.md`, `MANIFEST.sha256`, 테스트 2개 파일. observe·lease, 샌드박스, denyWrite, VS Code 설정은 범위 밖이다.
- **문서:** 영어, host 중립으로 쓰고 4개 `claude|codex|gemini|grok/skill/references/coordination.md`에 똑같은 문구를 넣는다. codex 파일은 행 번호가 2 작다(177/218행, 나머지는 179/220행).
- **미러:** `shared/skill/runtime/role-observe.mjs`와 `role-supervisor.mjs`는 lib과 바이트가 같아야 한다. 갱신은 `node scripts/update-runtime-assets.mjs`, 확인은 `node scripts/update-runtime-assets.mjs --check`로 한다.
- **MANIFEST:** `node scripts/update-manifest.mjs`로 갱신하고 `npm run check:manifest`로 확인한다. `docs/`는 MANIFEST 대상이 아니다.
- **수정 금지:** `.claude/worktrees/harness-doc-refactor-2`, `.claude/worktrees/watch-menu-upgrade-reapply`.
- **TDD:** 새 경우마다 RED 관찰 → 최소 구현 → GREEN → 전체 검사 순서로 진행한다(`references/test-driven-development.md`).
- **커밋:** task마다 하나씩 Orchestrator가 만든다. 형식은 `type(scope): 한국어 설명`이다(예: `fix(runtime): bridge 사후 감지에서 fetch 변화 허용`).
- **계약 테스트·golden 동반 갱신(v2):** runtime 모듈이나 `coordination.md`를 바꾸는 task는 다음 세 파일도 함께 갱신한다. 이전 runtime 변경(`7d3c795`, `d66bff6`)과 같은 방식이다.
  - `tests/node/runtime-versions.test.mjs`
    - `baselineHash`를 새 cooperative runtime 해시로 바꾼다.
    - `cooperative-9` 버전 문자열, `previousRuntimeHash`, `historicalRuntimeHash`는 바꾸지 않는다.
  - `tests/node/composite-instructions.test.mjs`
    - 옛 ref 감지 문구(예: "Branch, tag and other ref creation, deletion or movement during a run is a `permission_violation_observed`")를 고정한 정규식을 새 문구로 바꾼다.
    - 새 허용 규칙(`tolerated.refs`, `info/refs` 예외 등)을 확인하는 단언을 추가한다.
  - `tests/node/fixtures/installed-layout-golden.json`
    - `node tests/node/fixtures/installed-layout.mjs --write`로 다시 생성한다. 생성 전후의 diff는 이 task에서 바꾼 설치 파일의 해시로만 한정되어야 한다.
    - 이 명령과 `installed-layout-golden.test.mjs`는 worktree의 `build/native`가 있어야 돈다. `build/native`는 git이 무시하는 경로이며, Orchestrator가 source checkout에서 복사해 두었다.

### Implementer·QA 브리프 환경 규칙
Codex bridge(`workspace-write`, `approval_policy="never"`)에서 실행하므로 다음을 지킨다.
- heredoc, 임시 스크립트 파일, 프로세스 치환(`<(...)`)을 쓰지 않는다.
- Git 조회에는 `git --no-optional-locks`를 붙인다.
- 대상 worktree에서 `.git` 메타데이터를 바꾸는 명령을 쓰지 않는다. `git fetch`, `git gc`, `git add`, `git commit`, `git stash`, 그 밖의 stage·branch·worktree 조작이 해당한다. 테스트 코드가 tmpdir에 만든 repo 안의 조작은 예외다.
- Python은 `PYTHONDONTWRITEBYTECODE=1 python3 -B`, `npm test`는 `PYTHONDONTWRITEBYTECODE=1 npm test`로 실행한다.
- 테스트용 임시 git repo와 linked worktree는 테스트 코드 안에서 OS tmpdir(`os.tmpdir()`, 기존 `makeRepo`·`createRoutingFixture`)에 만들고 `t.after`로 정리한다. 대상 worktree 안에는 만들지 않는다.
- allowedPaths 밖 파일이 필요해지면 멈추고 보고한다.

### task별 필수 검사
task 검증과 재검증(recheck)에서는 수정한 부분과 관련 테스트만 실행한다. 아래 검사는 모두 기준선 대비 새 실패가 없어야 한다. `npm test` 전체 회귀는 task 검사에 넣지 않고 최종 검증에서 한 번만 실행한다(v3).
- 관련 테스트 단독 실행: `node --test tests/node/role-observe.test.mjs`, `node --test tests/node/role-bridge-run.test.mjs`
- 계약 테스트 단독 실행(v2): `node --test tests/node/runtime-versions.test.mjs tests/node/composite-instructions.test.mjs tests/node/installed-layout-golden.test.mjs`
- `node scripts/update-runtime-assets.mjs --check`
- `npm run check:manifest`
- `npm run check:role-policy`
- `node scripts/check-installer-parity.mjs`
- 4개 `coordination.md`의 대상 문단이 같은 문구인지 QA가 `git --no-optional-locks diff`로 비교한다.

## 검토 초점(최종 Reviewer)
- 판정 순서에서 대상 branch 규칙(분류 1)이 tag·worktree 허용(분류 3–4)보다 먼저 적용되는지. 대상 branch가 "다른 worktree" 쪽으로 잘못 분류되면 범위 밖 커밋이 가려진다.
- `observeHeadAdvance`가 어떤 git 오류에서도 throw하지 않고 `rejected`로 닫히는지.
- macOS `/var`→`/private/var`처럼 realpath가 달라지는 경우에도 `worktreeRoot`와 `worktreeBranches` 키가 일치하는지.
- 허용 변화가 없으면 `tolerated` 키가 생략되는지, `violations` 형태가 바뀌지 않았는지.
- D10 역할에서 경로 검사(조건 8)는 생략하되 P1 수집·상한(조건 7)은 적용되는지.
- 잔여 위험 R1–R9가 문서에 정확히 반영됐는지:
  - R1 주체 구분 불가
  - R2 위조 ref로 rebase·merge 기준 오염
  - R3 `--ff-only`로 남의 커밋 유입
  - R4 역할의 `git worktree add` 우회
  - R5 샌드박스 전제 미검증(D10으로 영향 확대)
  - R6 오탐 잔존
  - R7 비용
  - R8 `info/refs` 무조건 허용
  - R9 harness-doc-refactor-2와 문서 충돌

---

### T1: fetch 변화 허용(remote-tracking ref, 새 tag, `info/refs`)

**목표:** `refs/remotes/**` 변경, 새 tag 생성, `git:info/refs`만의 변경을 허용하고 `tolerated.refs`·`tolerated.control`에 기록한다.

**AC:**
- AC1: `refs/remotes/**`만 바뀌면 `reason === null`이고 `toleratedRefs`에 기록된다.
- AC2: 새 tag는 허용되고 기록된다. 기존 tag의 이동·삭제는 위반이다.
- AC3: `git:info/refs`만 바뀌면 허용되고 `toleratedControl`에 기록된다. 다른 control 변경은 위반이다.
- AC4(T1 부분): 허용 변화와 섞여 있어도 branch·notes·stash 변경과 기존 tag 이동은 위반이다.
- AC10: 허용 변화가 없으면 `tolerated`가 없다. 형태는 D6/P2를 따른다.
- AC11: 4개 문서와 `harness-operation.md`가 동작과 일치하고 문구가 같다. 미러가 lib과 같고 MANIFEST가 갱신됐다.
- AC12: 새 경우마다 RED→GREEN을 거쳤고 필수 검사에서 새 실패가 없다.

**선행:** 없음(base `12aa9a3`).

**allowedPaths:**
- `lib/runtime/role-observe.mjs`
- `lib/runtime/role-supervisor.mjs`
- `shared/skill/runtime/role-observe.mjs`
- `shared/skill/runtime/role-supervisor.mjs`
- `claude/skill/references/coordination.md`
- `codex/skill/references/coordination.md`
- `gemini/skill/references/coordination.md`
- `grok/skill/references/coordination.md`
- `docs/harness-operation.md`
- `MANIFEST.sha256`
- `tests/node/role-observe.test.mjs`
- `tests/node/role-bridge-run.test.mjs`
- `tests/node/runtime-versions.test.mjs` (v2)
- `tests/node/composite-instructions.test.mjs` (v2)
- `tests/node/fixtures/installed-layout-golden.json` (v2)

**범위:**
- `detectViolations`: 분류 2·3·5와 control `git:info/refs` 규칙을 넣고, 반환값에 `toleratedRefs`·`toleratedControl`을 추가한다. 이 시점에는 `refs/heads/**` 변경이 모두 위반이다.
- `toleratedRecord`를 export한다(refs, control, truncated).
- supervisor: `:454` 기본값에 빈 배열을 추가하고 `writeRecord`에 `tolerated`를 연결한다.
- 미러와 MANIFEST를 갱신한다.

**단계:**
- [ ] RED `role-observe`
  - (1) `update-ref refs/remotes/origin/main`의 생성·이동·삭제 → `reason === null`, `toleratedRefs`에 기록.
  - (2) 새 `git tag v1` → 허용. `:392-393`의 기대값을 `refsChanged === false`, `toleratedRefs === ['refs/tags/v1']`로 바꾼다.
  - (4) `git update-server-info`만 실행 → 허용, `toleratedControl === ['git:info/refs']`. `info/exclude`도 같이 바뀌면 `controlChanged === ['git:info/exclude']`.
  - (6) `:215`와 `:389`의 deepEqual에 `toleratedRefs: [], toleratedControl: []`를 추가한다.
- [ ] 회귀 테스트(기존 동작 유지)
  - (3) 기존 tag의 `tag -f`와 `tag -d` → 위반.
  - (5) `git notes add` → 위반. remote 생성과 `branch side`가 섞이면 위반이고, `toleratedRefs`에는 remote가 남는다.
  - `refs/stash` → 위반.
- [ ] RED `toleratedRecord`: 빈 입력 → `null`. refs만 있음 → `{refs:[...]}`. 101개 → 100개와 `truncated: true`.
- [ ] RED `role-bridge-run`: `:779`의 tag 사례(92)를 분리한다.
  - 새 tag → `completed`, `record.tolerated.refs === ['refs/tags/tag-by-role']`.
  - 기존 tag `tag -f` 이동 → `failed`, `permission_violation_observed`.
  - `update-ref refs/remotes/origin/x` → `completed`.
  - branch 사례(91)는 `failed` 그대로 둔다.
- [ ] 최소 구현 → GREEN → `node scripts/update-runtime-assets.mjs` → `node scripts/update-manifest.mjs`.
- [ ] 문서(4개 `coordination.md`에 같은 문구)
  - 179행(codex 177행): `hooks or info` 바로 뒤에 다음 구절을 넣는다.
    ` (except `info/refs`, which `git update-server-info` may rewrite after a fetch or gc; that change alone is recorded under `tolerated.control`)`
  - 220행(codex 218행)을 다음으로 바꾼다.
    "- Post-run detection compares the changed paths, `HEAD`, the branch and every Git ref. These ref changes are not violations and are recorded in the dispatch record under `tolerated.refs`, because Git activity outside the dispatch produces them and detection cannot tell who made them: remote-tracking refs (`refs/remotes/**`) and tags that did not exist before the run. Any other ref creation, deletion or movement is a `permission_violation_observed` for every role, including any branch and moving or deleting an existing tag, assuming no other Git activity changes local branches during the run. Each `tolerated` list keeps at most 100 sorted names, and `tolerated.truncated` is set when a list is longer. Changes to Git-ignored paths are outside post-run detection, except the control files listed above."
  - `docs/harness-operation.md` 122행 bullet 끝에 다음을 덧붙인다.
    "A change to `git:info/refs` alone is not a violation; it is recorded under `tolerated.control`."
  - `docs/harness-operation.md` 128행 첫 문장을 다음으로 바꾼다.
    "Detection takes place after execution and treats legitimate changes as violations too, except the Git activity recorded under `tolerated` in the dispatch record. When `tolerated.refs` lists a ref such as `refs/remotes/origin/*`, check its source with `git log` and `git reflog` before you rebase, merge or accept."
- [ ] 필수 검사를 실행한다.

**보류 조건:**
- RED가 예상한 이유로 실패하지 않는다.
- 관련 테스트 파일에 기준선 실패가 있어 판단할 수 없다.
- `check:role-policy`나 parity 실패가 `coordination.md`의 관리 구간과 충돌한다.
- allowedPaths 밖 파일이 필요하다.

---

### T2: 다른 등록 worktree의 branch 허용

**목표:** 실행 전이나 후에 다른 등록 worktree가 checkout하고 있던 branch의 생성·이동·삭제를 허용하고 기록한다.

**AC:**
- AC4(T2 부분): 체크아웃되지 않은 branch와 대상 branch의 변경은 위반이다.
- AC5: 실행 전이나 후에 다른 등록 worktree가 checkout한 branch의 생성·이동·삭제는 허용하고 기록한다. 실행 중 worktree가 추가·삭제되는 경우도 포함한다.
- AC6: worktree 목록을 가져오지 못하면 스냅샷이 실패한다. 대상 루트를 식별할 수 없거나 파싱이 모호하면 worktree 허용을 끈다.
- AC10, AC11, AC12.

**선행:** T1 수용과 커밋.

**allowedPaths:**
- `lib/runtime/role-observe.mjs`
- `shared/skill/runtime/role-observe.mjs`
- `claude/skill/references/coordination.md`
- `codex/skill/references/coordination.md`
- `gemini/skill/references/coordination.md`
- `grok/skill/references/coordination.md`
- `docs/harness-operation.md`
- `MANIFEST.sha256`
- `tests/node/role-observe.test.mjs`
- `tests/node/role-bridge-run.test.mjs`
- `tests/node/runtime-versions.test.mjs` (v2)
- `tests/node/composite-instructions.test.mjs` (v2)
- `tests/node/fixtures/installed-layout-golden.json` (v2)

supervisor는 바꿀 필요가 없다. 필요해지면 보류한다.

**범위:** `snapshotWorktree`에 `worktreeRoot`·`worktreeBranches`를 추가하고, `detectViolations`에 분류 1·4를 넣는다.

**단계:**
- [ ] RED `role-observe`(linked worktree는 tmpdir에 `git worktree add`로 만든다)
  - (7) 다른 worktree에서 커밋 → 허용, `toleratedRefs`에 그 branch.
  - (8) 대상이 main일 때 linked 쪽 커밋 → 허용. main branch를 `update-ref`로 옮기면 → 위반.
  - (9) 대상이 linked일 때 main 쪽 커밋 → 허용.
  - (10) 실행 중 `worktree add -b`, 그리고 `worktree remove` 후 `branch -D` → 허용.
  - (12) 대상이 detached일 때 다른 worktree의 커밋 → 허용.
- [ ] 회귀 테스트
  - (11) 체크아웃되지 않은 branch의 생성·이동·삭제 → 위반(`:390-401` 유지).
  - (13) 합성 입력으로 fail closed 확인: `worktreeBranches: null`이거나 대상 루트 키가 없으면 다른 branch 변경 → 위반.
  - `worktree list` 실패가 스냅샷 throw로 이어지는지 확인한다. 직접 재현할 수 없으면 helper 단위로 확인한다.
- [ ] `snapshotWorktree` 반환 확인: `worktreeRoot`가 realpath이고 `worktreeBranches[worktreeRoot]`가 `refs/heads/<branch>`다.
- [ ] RED `role-bridge-run`
  - `:779` branch 사례(91)는 `failed`를 유지하고, 테스트 이름을 "unchecked-out branch creation …"으로 바꾼다.
  - 새 사례: prepare 전에 `gitIn(f, 'worktree', 'add', '-b', 'other-wt', <tmpdir 경로>)`로 linked worktree를 만든다. fake codex가 `git -C <그 경로> commit --allow-empty -m x`를 실행하면 `completed`이고 `record.tolerated.refs === ['refs/heads/other-wt']`다. fixture repo에는 초기 커밋과 로컬 `user.*` 설정이 있다(`tests/node/role-fixtures.mjs:49`).
- [ ] 최소 구현 → GREEN → 미러와 MANIFEST 갱신.
- [ ] 문서(4개 같은 문구)
  - 220행(codex 218행)을 다음으로 바꾼다.
    "- Post-run detection compares the changed paths, `HEAD`, the branch and every Git ref. These ref changes are not violations and are recorded in the dispatch record under `tolerated.refs`, because Git activity outside the dispatch produces them and detection cannot tell who made them: remote-tracking refs (`refs/remotes/**`), tags that did not exist before the run, and branches checked out by another registered worktree before or after the run. If the worktree list cannot be parsed or does not include the dispatch worktree, no branch is tolerated this way. Any other ref creation, deletion or movement is a `permission_violation_observed` for every role, including the dispatch worktree's own branch, branches checked out by no worktree, and moving or deleting an existing tag. Each `tolerated` list keeps at most 100 sorted names, and `tolerated.truncated` is set when a list is longer. Changes to Git-ignored paths are outside post-run detection, except the control files listed above."
  - `docs/harness-operation.md` 128행 두 번째 문장의 예시를 다음으로 바꾼다.
    "such as another branch (for example `refs/heads/master`) or `refs/remotes/origin/*`"
- [ ] 필수 검사를 실행한다.

**보류 조건:**
- fixture에서 linked worktree를 만들 수 없거나, prepare가 linked worktree 때문에 hold한다.
- realpath 불일치로 대상 루트를 식별하지 못한다.
- 그 밖에는 T1과 같다.

---

### T3: 대상 worktree의 제한적 fast-forward 커밋 허용

**목표:** 역할별 조건(1–8, D10·P1 반영)을 만족하는 대상 branch fast-forward를 허용하고, `tolerated.refs`·`tolerated.commitPaths`에 기록한다. 거부된 경우의 범위 밖 경로는 `changedPaths`에 넣는다.

**AC:**
- AC4(T3 부분): 조건 밖의 HEAD·branch 변경은 위반이다.
- AC7: 조건을 충족한 fast-forward는 `headChanged: false`이고, `tolerated.refs`에 `refs/heads/<b>`, `tolerated.commitPaths`에 경로가 기록된다.
- AC8: 다음은 위반이다.
  - detached HEAD 이동
  - unborn branch
  - amend, reset, rebase
  - merge 커밋 포함
  - 커밋 101개 이상, 경로 10,000개 초과
  - git 조회 실패, `headAdvance` 인자 없음
  - 경로 검사 대상 역할에서 범위 밖 커밋 경로. rename 양쪽 경로와, 고쳤다가 되돌린 경로도 포함한다. 해당 경로는 `changedPaths`에 한 번만 나온다.
- AC9: D10 역할은 조건 1–7만으로 판정한다.
- AC10(commitPaths), AC11, AC12.

**선행:** T2 수용과 커밋.

**allowedPaths:** T1과 같은 15개(v2 3개 포함).

**범위:**
- `observeHeadAdvance`를 export한다.
- `detectViolations`에 `headAdvance` 인자, `toleratedCommitPaths`, `outOfScopePaths` 병합을 넣는다.
- `toleratedRecord`에 commitPaths를 추가한다.
- supervisor에서 `observeHeadAdvance`를 호출하고, `:454` 기본값에 `toleratedCommitPaths: []`를 추가한다.

**단계:**
- [ ] RED `role-observe`(`observeHeadAdvance` 결과를 `detectViolations`에 넘기는 경로)
  - (14) Implementer `['src/']`가 `src/a.txt`를 커밋 → 허용. `headChanged: false`, `toleratedRefs`에 `refs/heads/<b>`, `toleratedCommitPaths === ['src/a.txt']`.
  - (15) `src/a.txt`와 `docs/b.txt`를 커밋 → 위반, `changedPaths === ['docs/b.txt']`(한 번만).
  - (16) 범위 밖 커밋 후 revert → 위반.
  - (17) `src/a`→`src/b` rename → 허용. `src/a`→`docs/a` → 위반. `src/a` 삭제 → 허용.
  - (18) `--no-ff` merge, amend, `reset --hard HEAD~1`, 커밋 101개 → 각각 위반.
  - (19) detached 상태 커밋, unborn 첫 커밋, `checkout -b` → 각각 위반.
  - (20, D10) Reviewer와, `allowedPaths`가 `[]`·`undefined`인 QA가 실행 중 새 파일을 커밋 → 허용, commitPaths 기록. amend와 merge → 위반.
  - (21) Implementer가 실행 전부터 dirty였던 범위 밖 파일을 커밋 → 위반, `changedPaths`에 한 번만.
  - (22) 합성 `{state:'rejected', why:'git_failed'}`, 그리고 `headAdvance` 없음 → `headChanged: true`, 위반.
  - 기존 `:235-236`(인자 없음 → `headChanged: true`)은 그대로 둔다.
- [ ] RED P1: 경로 10,001개 fast-forward → `too_many_paths`로 위반. Reviewer에도 적용된다. 생성 비용이 크면 커밋 1개에 경로 10,001개로 만든다.
- [ ] RED `toleratedRecord`: commitPaths를 포함하고, 101개면 100개와 `truncated: true`.
- [ ] RED `role-bridge-run`(fake codex가 대상 worktree에서 `git add`·`git commit`을 실행)
  - Implementer `['src/']`가 허용 파일을 커밋 → `completed`, `tolerated.refs`·`tolerated.commitPaths` 기록.
  - 범위 밖 파일 커밋 → `failed`, `violations.changedPaths`에 해당 경로, `violations.headChanged === true`.
  - amend → `failed`.
- [ ] 최소 구현 → GREEN → 미러와 MANIFEST 갱신.
- [ ] 문서(4개 같은 문구)
  - 220행(codex 218행)의 "Each `tolerated` list" 문장 바로 앞에 다음을 넣는다.
    "A fast-forward of the dispatch worktree's own branch is not a violation, and is recorded under `tolerated.refs` with its committed paths under `tolerated.commitPaths`, when the branch did not change, the new commits include no merge commit, there are at most 100 of them touching at most 10,000 paths, and, for `arc_implementer` and for `arc_qa` with non-empty `allowedPaths`, every path they add, modify, delete or rename is within the role's `allowedPaths`. For read-only roles and for `arc_qa` without `allowedPaths` the path check is skipped, so their fast-forward commits pass on the other conditions alone. Detection cannot tell who made these commits. A rejected fast-forward is a `permission_violation_observed`, and its out-of-scope paths are listed in `changedPaths`. Switching the branch, rewriting history, a detached `HEAD` move or a move on an unborn branch remains a violation."
  - 같은 행의 "including the dispatch worktree's own branch"를 "including any other change to the dispatch worktree's own branch"로 바꾼다.
  - `docs/harness-operation.md` 128행 예시에 "or the dispatch branch"를 덧붙인다.
  - `docs/harness-operation.md` 130행을 다음으로 바꾼다.
    "While a bridge is running, commit in the dispatch worktree only as fast-forward commits on its current branch, and for `arc_implementer` or `arc_qa` with `allowedPaths` only when every committed path is within those `allowedPaths`; read-only roles and QA without `allowedPaths` skip the path check. Do not amend, rebase, reset or switch branches there, and do not run host commands that write `.git/config`, such as `git config` writes or `git push -u`."
- [ ] 필수 검사를 실행한다.

**보류 조건:**
- `git log -z` 출력이 위의 파싱 규칙과 다르다. 관찰한 형식을 보고하고 멈춘다.
- 조건 4의 종료 코드를 구분할 수 없다.
- 그 밖에는 T1과 같다.

---

## 최종 검증
모든 task를 수용한 뒤에 하며, task의 선행 조건이 아니다.
- 전체 회귀(v3): Orchestrator가 호스트에서 `PYTHONDONTWRITEBYTECODE=1 node --test --test-reporter=spec tests/node/*.test.mjs`를 한 번 실행한다. 실패 이름을 기준선 목록(`<git-common-dir>/arc/handoff/bridge-fetch-tolerance-baseline-fail.txt`)과 대조한다. 기준선에 없는 실패는 단독 실행으로 flake인지 확인한 뒤 결함이면 Implementer에 돌려보낸다.
- 독립 최종 Reviewer가 전체 변경(`12aa9a3..HEAD`)을 1회 검토한다. 위 "검토 초점"과 R1–R9 잔여 위험을 문서와 대조한다.
- Reviewer finding은 Implementer → Reviewer로 재확인한다. 수정은 Reviewer 재확인이 끝날 때까지 커밋하지 않고, 해결 후 follow-up 커밋 1개로 만든다.

## Revision history
| Version | Approval time | Classification | Affected tasks | Reason |
|---|---|---|---|---|
| v1 | 2026-11-20T22:11:11+0900 | 최초 승인 | T1, T2, T3 | 최초 plan |
| v2 | 2026-11-20T22:35:54+0900 | contract | T1, T2, T3 | 계약 테스트(`runtime-versions`, `composite-instructions`)와 golden fixture가 runtime·문서 해시와 문구를 고정하고 있어서 동반 갱신이 필요함. 세 파일을 allowedPaths와 필수 검사에 추가 |
| v3 | 2026-11-20T22:45:50+0900 | contract | T1, T2, T3 | 사용자 지시: 재검증은 수정 부분과 관련 테스트만 실행하고, `npm test` 전체 회귀는 최종 검증에서 한 번만 실행. task 필수 검사에서 전체 테스트를 빼고 최종 검증에 추가 |
| v4 | 2026-11-20T23:17:57+0900 | contract | T2 | QA F1·F2 대응. worktree 목록은 `-z` 우선 파싱, `-z`를 지원하지 않는 git에서만 줄 단위로 대체(경로 존재 확인 포함). 대상 branch는 full ref(`branchRef`)로 판정. prunable 경로는 원래 경로 사용 유지 |
