# 신규 브랜치 checkout 승인과 현재 checkout 진행 구현 계획

**Goal:** 명시적 사용자 승인 시에만 신규 task branch를 생성·checkout하고, 승인이 없으면 현재 checkout에서 승인된 기획 문서 commit 후 Coder handoff를 진행하도록 하네스 계약과 구조 회귀 검사를 변경한다.

**Architecture:** `skill/SKILL.md`의 Workspace handoff를 승인 확인, 신규 branch 경로, 현재 checkout 경로, 경로별 docs commit 및 실패 처리로 나눈다. `tests/test_install.py`에서 절 단위 구조 회귀 검사를 먼저 추가해 RED를 확인한 뒤 지침을 수정하고 manifest digest를 갱신한다.

**Tech Stack:** Markdown 역할 계약, Python 3 `unittest`, SHA-256 manifest.

**Spec:** [`docs/superpowers/specs/2026-10-06-branch-checkout-approval-design.md`](../specs/2026-10-06-branch-checkout-approval-design.md)

## Global Constraints

- 실제 workspace: `/Users/yunho/Desktop/project/yunho-harness`.
- Coder 수정 범위는 다음 세 파일로 한정한다.
  - `tests/test_install.py`
  - `skill/SKILL.md`
  - `MANIFEST.sha256`
- 설계·명세·계획 승인은 신규 branch 생성·전환 승인을 대신하지 않는다.
- 신규 checkout에 명시적 승인이 없으면 branch를 만들거나 전환하지 않고 현재 checkout에서 docs commit 및 작업을 진행한다.
- 승인 대상은 workspace 절대 경로, 현재 branch 또는 detached HEAD, base HEAD, 후보 branch이며, 대상이 바뀌면 새 승인을 확인한다.
- branch 생성·전환 오류와 부분 완료는 승인 부재와 구분하고 기존대로 handoff를 중단한다. 현재 checkout으로 자동 fallback하지 않는다.
- 양 경로 모두 승인된 planning docs만 commit하고 SHA·포함 경로·post-commit HEAD를 기록한다. 문서가 없는 허용 경로는 기존 근거 기록 규칙에 따라 commit을 생략한다.
- 기존 staged, unstaged, untracked 변경을 보존하고 무관한 변경을 commit하지 않는다. 별도 요청 없이 push하거나 worktree/설치 동작을 바꾸지 않는다.
- 사용자 요청으로 관련 검사 추가·수정, focused RED/GREEN 및 전체 검사 실행이 승인됐다.
- 구조 회귀 검사는 정책 문구 계약만 입증하며 실제 에이전트 runtime 준수는 입증하지 않는다.

## Review Focus

1. 승인 요청이 없거나 거절·무응답·불명확한 답변이면 현재 checkout 경로를 쓴다: `test_workspace_handoff_without_approval_uses_current_checkout`.
2. planning document 승인만으로 checkout을 허용하지 않는다: `test_workspace_handoff_requires_scoped_checkout_approval`.
3. 승인 후 대상이 달라지면 변경된 workspace/base/candidate에 재승인을 요구한다: `test_workspace_handoff_reapproves_changed_targets`.
4. 생성·전환 오류와 부분 완료는 기록하고 handoff를 중단하며 현재 checkout으로 fallback하지 않는다: `test_workspace_handoff_failures_do_not_fallback`.
5. docs commit은 두 정상 경로에서 승인 문서만 포함하고, 문서 부재만 기존 생략 사유로 인정한다: 기존 `test_workspace_handoff_commits_approved_plan_docs_before_coder`.

---

## CEO의 사전 handoff 준비

계획 승인 후 Coder가 시작하기 전에 CEO는 실제 workspace, branch 또는 detached HEAD, HEAD와 staged/unstaged/untracked 변경을 다시 확인한다. CEO는 후보 task branch를 정하고 충돌을 확인한 뒤, 해당 workspace/base/candidate에 대한 명시적 사용자 승인을 요청한다.

- checkout을 명시적으로 승인하면 CEO는 새 branch를 만들고 확인한 뒤, 그 branch에서 승인된 spec/plan 문서만 stage·commit한다.
- checkout 승인이 없으면 현재 checkout을 유지하고 그곳에서 승인된 spec/plan 문서만 stage·commit한다.
- 어느 경로든 staged 경로가 정확한지 확인하고 commit SHA·경로·post-commit HEAD를 기록한 뒤 같은 실행 checkout을 Coder에게 전달한다.
- branch 생성·전환이 운영상 실패하면 CEO는 상태를 기록하고 handoff를 중단한다. 이는 승인 부재 경로가 아니다.

승인된 기획 문서 commit은 Coder를 위한 준비이며 구현 수락을 뜻하지 않는다. 구현 파일은 포함하지 않는다.

## Task 1: 승인·경로별 계약을 TDD로 수정하고 manifest 갱신

**Files:**

- Modify: `tests/test_install.py` — `RolePolicyTests`
- Modify: `skill/SKILL.md` — `## Workspace handoff`
- Modify: `MANIFEST.sha256` — `skill/SKILL.md` checksum

**Interfaces:**

- Consumes: 승인 명세의 AC-1~AC-11, `REPO`, 기존 `RolePolicyTests`의 문구 정규화와 `assertRegex` 방식.
- Produces: 승인·현재 checkout·경로별 commit·실패 처리 계약, 구조 회귀 검사, 최종 skill에 맞는 manifest digest.
- Installer API, profile 형식, 외부 skill 집합은 변경하지 않는다.

### Step 1: 작업 상태 확인

- [ ] Coder는 승인된 명세와 계획을 읽고 CEO brief의 workspace, branch/HEAD, 변경 소유 범위와 실제 상태가 일치하는지 확인한다.

실행 위치: `/Users/yunho/Desktop/project/yunho-harness`

```bash
git status --short
git branch --show-current
git rev-parse HEAD
```

기대 결과: 경로와 실제 상태가 brief와 일치한다. 불일치하거나 변경 소유 범위가 불명확하면 CEO에게 보고하고 파일을 수정하지 않는다. Coder는 branch를 만들거나 전환하지 않는다.

### Step 2: 구조 회귀 검사를 먼저 추가·수정

- [ ] `RolePolicyTests`에 다음 helper를 추가한다. 소제목이 없을 때 `IndexError`가 아니라 assertion failure로 실패하도록 section 추출 전에 `assertIn`을 둔다.

```python
def _workspace_handoff_section(self, title: str) -> str:
    policy = " ".join((REPO / "skill/SKILL.md").read_text().lower().split())
    handoff = policy.split("## workspace handoff", 1)[1].split("## visual companion", 1)[0]
    self.assertIn(f"### {title.lower()}", handoff)
    return handoff.split(f"### {title.lower()}", 1)[1].split("### ", 1)[0]

def _assert_workspace_handoff_contracts(
    self, title: str, contracts: tuple[str, ...]
) -> None:
    section = self._workspace_handoff_section(title)
    for contract in contracts:
        with self.subTest(section=title, contract=contract):
            self.assertRegex(section, contract)
```

- [ ] 정책에 사용할 소제목은 `Checkout approval`, `New task branch`, `Current checkout`, `Planning document commit`, `Existing changes and failures`, `Handoff evidence`로 고정한다.
- [ ] 다음 검사를 추가한다.

| 테스트 | 계약 assertion |
|---|---|
| `test_workspace_handoff_requires_scoped_checkout_approval` | 관련 설계/spec/plan 승인 후, 생성·전환 전 명시적 사용자 승인, 승인에 workspace/current branch 또는 detached HEAD/base HEAD/candidate 포함, 문서 승인은 branch 승인이 아님 |
| `test_workspace_handoff_without_approval_uses_current_checkout` | 거절·무응답·불명확한 응답이면 branch 생성·전환 금지, 기존 checkout 유지, branch/HEAD/dirty state 확인, 승인 부재만으로 handoff 중단하지 않음 |
| `test_workspace_handoff_reapproves_changed_targets` | 실행 전 대상 재확인, 대상 변경 재승인, candidate 변경 시 승인 전 생성·전환 금지, lookup error와 missing branch를 구분 |
| `test_workspace_handoff_failures_do_not_fallback` | 생성·전환 오류와 partial completion 기록 후 handoff 중단, 현재 checkout 자동 fallback 금지, 기존 부분 완료 보존 |

검사는 위 계약을 다음처럼 절별 정규식으로 고정한다.

```python
def test_workspace_handoff_requires_scoped_checkout_approval(self) -> None:
    self._assert_workspace_handoff_contracts(
        "Checkout approval",
        (
            r"after all applicable design/spec/plan approvals",
            r"before.*creat.*switch.*explicit user approval",
            r"approval.*absolute workspace.*current branch.*detached head.*base head.*candidate",
            r"planning document.*approval.*does not.*branch.*approval",
        ),
    )

def test_workspace_handoff_without_approval_uses_current_checkout(self) -> None:
    self._assert_workspace_handoff_contracts(
        "Current checkout",
        (
            r"no explicit approval.*refus.*no response.*unclear",
            r"do not create or switch.*branch",
            r"continue.*current checkout",
            r"confirm.*branch.*detached head.*head.*existing changes",
            r"lack of checkout approval alone.*does not.*stop coder handoff",
        ),
    )

def test_workspace_handoff_reapproves_changed_targets(self) -> None:
    self._assert_workspace_handoff_contracts(
        "New task branch",
        (
            r"recheck.*workspace.*branch.*base head.*candidate.*before",
            r"approval target.*changes.*explicit user approval",
            r"candidate.*changes.*approval.*before.*creat.*switch",
            r"without.*approval.*current checkout",
            r"lookup error.*missing branch",
        ),
    )

def test_workspace_handoff_failures_do_not_fallback(self) -> None:
    self._assert_workspace_handoff_contracts(
        "Existing changes and failures",
        (
            r"branch creation.*switch.*failure.*actual git state.*stop coder handoff",
            r"created.*without.*successful switch.*partial completion",
            r"do not.*automatically.*(?:fall back|fallback).*current checkout",
            r"operational failure.*distinct from.*lack of approval",
            r"do not.*automatically delete",
        ),
    )
```

- [ ] 기존 `test_workspace_handoff_commits_approved_plan_docs_before_coder`의 첫 정규식을 절별 helper로 바꾸어 두 정상 경로를 각각 확인한다.
  - 신규 branch 경로는 전환 성공과 branch/path 확인 이후 승인 문서를 commit한다.
  - 현재 checkout 경로는 현 상태 확인 이후 동일한 승인 문서를 commit한다.
  - 두 경로 모두 docs-only staging, SHA·경로 기록, commit 실패 시 handoff 중단을 유지한다.
  - 문서 없는 경로는 checkout 승인 여부와 독립적으로 기존 생략 규칙을 따른다.
- [ ] 기존 helper의 첫 단일 정규식은 다음 assertion으로 대체한다.

```python
self._assert_workspace_handoff_contracts(
    "Planning document commit",
    (
        r"new task branch.*successful switch.*branch.*path",
        r"current checkout.*confirm.*branch.*path.*existing changes",
        r"both paths.*planning documents.*written and approved",
        r"ceo.*stage and commit only those approved documents.*before coder handoff",
    ),
)
```

- [ ] 같은 기존 검사의 문서 없는 경로 assertion은 신규 checkout을 강제하지 않도록 다음 의미로 바꾼다.

```python
r"no planning documents.*existing design/plan depth rules.*skip.*docs commit.*record.*brief.*coder handoff.*confirmed.*(?:branch|detached head).*path"
```

- [ ] 기존 테스트의 구현 파일 제외, 별도 요청 없는 push 금지, 무관한 staged 변경 보존 assertion은 유지한다.

### Step 3: focused RED 확인

- [ ] `skill/SKILL.md`를 수정하기 전에 관련 검사만 실행한다.

```bash
python3 -B -m unittest discover -s tests -p test_install.py -k workspace_handoff -v
```

기대 결과: 새 소제목과 승인·현재 checkout 계약이 없어서 새 검사 또는 변경된 경로 검사가 assertion failure로 실패한다. import, 문법, test discovery 오류는 예상 RED로 인정하지 않는다. 실제 실패한 검사명과 원인을 기록한다. 새 검사가 모두 통과하면 매칭 범위를 바로잡고 구현 전에 다시 확인한다.

### Step 4: Workspace handoff 정책 구현

- [ ] `skill/SKILL.md`의 기존 `## Workspace handoff`에서 다음을 반영한다.

| 소제목 | 구현 내용 |
|---|---|
| `Checkout approval` | 기존 사전 상태 확인을 유지하고 신규 checkout의 실행 범위에 대한 명시적 승인과 문서 승인과의 구분을 규정 |
| `New task branch` | prefix, 충돌 suffix, 승인 직전 재확인, 생성·전환, 성공 검증과 실패·부분 완료 처리 유지 |
| `Current checkout` | 명시적 승인이 없거나 거절·무응답·불명확한 경우 branch 변경 없이 현 checkout으로 진행하고 상태를 기록 |
| `Planning document commit` | 신규 branch와 현재 checkout 양 경로에서 승인 문서만 commit하고, 문서 없는 경로·commit 실패를 처리 |
| `Existing changes and failures` | 기존 변경 보존, docs-only commit, operational failure 중단, 승인 부재와 오류 경로의 구분 |
| `Handoff evidence` | 선택한 경로, 승인 근거, branch/path/HEAD, commit SHA와 artifact를 brief 및 역할 handoff에 기록 |

기존의 모든 작업에 branch를 강제하는 문장, docs commit이 신규 checkout 뒤에만 가능하다는 문장, 문서 없는 경로에 신규 branch를 강제하는 문장, 변경된 collision 후보를 승인 없이 즉시 쓰는 문장을 제거하거나 경로 조건으로 한정한다. 승인된 명세의 의미를 정규식에 맞추기 위해 약화하지 않는다.

### Step 5: focused GREEN 확인

- [ ] 같은 focused 명령을 다시 실행한다.

```bash
python3 -B -m unittest discover -s tests -p test_install.py -k workspace_handoff -v
```

기대 결과: 신규 및 기존 handoff 검사가 모두 통과하고 종료 코드가 0이다. 실패 시 정책 구현과 assertion 오류를 구분해 수정한다.

### Step 6: manifest digest 갱신

- [ ] 최종 `skill/SKILL.md`의 SHA-256을 계산하고 manifest의 해당 행에 digest만 반영한다.

```bash
python3 -B -c 'from pathlib import Path; import hashlib; print(hashlib.sha256(Path("skill/SKILL.md").read_bytes()).hexdigest())'
```

기대 결과: `skill/SKILL.md` 항목의 digest만 달라지고 manifest 경로 집합·정렬·형식과 다른 항목은 유지된다. `tests/test_install.py`는 manifest 대상이 아니므로 항목을 추가하지 않는다.

---

## Task 2: 전체 회귀 검증과 독립 수락

**Files:** 수정 없음. finding 수정은 Task 1의 세 파일에서만 한다.

### Step 1: 전체 검사

- [ ] 다음 명령을 실행한다.

```bash
python3 -B -m unittest discover -s tests -v
```

기대 결과: 전체 suite가 통과하고 종료 코드가 0이다. 실패 또는 환경 차단이 있으면 실제 검사명과 원인을 기록하고 해결하기 전 완료로 처리하지 않는다.

### Step 2: manifest와 diff 확인

- [ ] manifest의 모든 경로를 실제 파일 SHA-256과 비교해 일치 여부를 확인한다.
- [ ] `git diff --check`로 whitespace 오류를 확인하고 변경 파일이 계획의 세 파일과 일치하는지 확인한다.
- [ ] 최종 diff가 승인된 명세 및 AC-1~AC-11을 충족하는지 계약별로 확인한다.

기대 결과: 모든 digest가 일치하고 whitespace 오류가 없으며 승인 범위 밖 파일 수정이 없다.

### Step 3: 독립 QA와 Reviewer

- [ ] CEO는 QA에게 AC별 구조 검사 및 실행 evidence를 검토하도록 한다. QA 결론은 문구 구조와 실제 unittest 결과로 확인된 범위로 제한한다.
- [ ] QA 결과 후 독립 Reviewer가 최종 세 파일 diff와 명세를 검토한다. 반대되는 잔존 지시, 경로별 commit 전제, 승인 부재와 운영 오류의 혼동, 테스트가 다른 절의 문구를 잘못 조합하는 문제를 확인한다.
- [ ] 수용 기준 관련 finding이 있으면 Coder 수정 후 영향을 받은 focused 검사, 전체 suite, manifest 확인을 다시 수행한다.

## 완료 기준

- AC-1~AC-11에 대한 증거를 각각 기록한다.
- RED/GREEN, 전체 검사, manifest 확인, QA와 Reviewer의 finding을 정리한다.
- 구조 검사로 실제 runtime 준수를 입증했다고 표현하지 않는다.
- 별도 commit이나 push는 계획된 의무 단계가 아니다. Push는 별도 명시 요청 없이 하지 않는다.

## 가정 및 자체 검토

- 사용자가 관련 구조 검사 추가·수정과 focused 및 전체 unittest 실행을 승인했다.
- branch 준비는 CEO가 계획 승인 후 실제 Git 상태를 재확인해 처리한다. Coder는 workspace나 branch를 독립적으로 만들거나 바꾸지 않는다.
- docs artifact 저장과 필요한 pre-Coder docs commit은 CEO 책임이며 Coder의 세 파일 scope 밖이다.
- 테스트는 agent runtime이 아니라 정책 문구 계약을 검증한다.

자체 검토에서 AC-1~AC-11을 구현·검증 단계에 연결했고, 기존 helper/정규식 스타일과 `unittest` 명령을 따랐다. RED 원인을 구조 계약 부재로 제한하고, 운영 실패의 no-fallback, 현재 checkout 경로, docs-only commit, manifest 범위 및 독립 검토를 구분했다. 외부 executor 지시와 불필요한 설치·worktree 변경은 포함하지 않았다.
