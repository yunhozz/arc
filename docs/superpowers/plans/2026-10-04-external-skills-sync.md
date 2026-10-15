# 필수 외부 스킬 최신 동기화 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> ARC adapter에 따라 실행 요청을 Lead의 순차 조정으로 적용한다. 별도 실행 방식 선택이나 추가 agent를 만들지 않는다. Coder가 지정 파일을 수정하며 설계·계획 승인, TDD, QA, 독립 리뷰 요구를 유지한다.

**Goal:** 일반 설치마다 네 필수 외부 스킬을 `obra/superpowers` 최신 upstream으로 동기화하고, 취득·설치 실패에서 이전 설치와 복구 자료를 보존한다.

**Architecture:** Python 설치기가 임시 project에서 `npx skills@latest add`로 네 스킬을 함께 취득한다. 취득 결과를 검증한 뒤 선택 `CODEX_HOME`과 이미 존재하는 사용자 `.agents` 후보, ARC, 일곱 프로필을 하나의 백업·교체·복구 transaction으로 반영한다. 읽기 전용 옵션은 네트워크와 subprocess를 실행하지 않는다.

**Tech Stack:** Python 3.11 이상, 표준 라이브러리 `unittest`, `subprocess`, `pathlib`, `tempfile`, `shutil`, Node.js/npm의 `npx`, Git, Bash wrapper.

**Spec:** [승인된 짧은 설계](#승인된-짧은-설계). 별도 standalone spec은 없다. 이전 external-skills-removal 문서는 현재 구현의 역사적 참고이며 이번 승인 계약을 대체하지 않는다.

## 승인된 짧은 설계

일반 `install.command`와 `install.py` 실행은 이미 설치된 스킬도 포함해 `brainstorming`, `writing-plans`, `test-driven-development`, `using-git-worktrees` 전체를 다시 취득한다. 외부 버전·commit pin과 외부 다운로드 snapshot SHA-256 검증을 제거하고 내부 `MANIFEST.sha256` 검증은 유지한다.

새 임시 project에서 다음 명령을 argument 배열로 실행한다.

```sh
npx --yes skills@latest add https://github.com/obra/superpowers \
  --skill brainstorming writing-plans test-driven-development using-git-worktrees \
  --agent codex --yes --copy --json
```

네 스킬 모두 취득·검증된 뒤 `<selected CODEX_HOME>/skills/<name>`에 설치한다. 실제 사용자 home의 `.agents/skills/<name>`은 이미 존재하는 후보만 같은 내용으로 갱신한다. 누락된 legacy 후보는 만들지 않는다. 기존 개인 수정과 upstream에서 삭제된 파일은 백업 후 전체 디렉터리 교체로 갱신된다.

일반 설치의 변경 대상 root 또는 parent symlink는 거부한다. 링크를 따라 임의 upstream을 수정하거나 root link를 독립 디렉터리로 바꾸지 않는다. 읽기 전용 검사에서는 기존 strict resolution과 필수 파일 containment 정책을 유지한다.

`--check`와 `--dry-run`은 파일·디렉터리·cache·백업·staging을 만들지 않고 `npx`와 네트워크를 실행하지 않는다. 기존 후보의 필수 파일 구조를 확인하며 최신 여부를 확인했다고 주장하지 않는다. 누락·잘못된 후보는 종료 코드 `2`다. 정상 dry-run은 취득 명령과 갱신 예정 경로를 출력한다.

## 공통 제약

- Python version floor는 `3.11`이다. `CODEX_HOME`이 빈 값이면 종료 코드 `2`로 실패한다.
- 내부 manifest·모델·일곱 프로필 생성·설치 경로 검증은 upstream 취득보다 먼저 수행한다.
- 외부 snapshot hash 비교와 pin을 제거한다. CLI의 임시 hash metadata나 npm package integrity를 ARC의 외부 승인 검증으로 사용하지 않는다.
- 일반 실행의 취득 단계에는 별도 임시 영역 쓰기만 허용한다. 네 결과 검증 전 실제 설치 파일·백업·target 옆 staging을 생성하거나 변경하지 않는다.
- 기존 외부 내용의 변경·필수 파일 누락은 일반 sync로 복구할 수 있다. 취득 전에는 경로·entry type·백업 가능성을 검사한다.
- 취득 tree는 필수 파일 11개뿐 아니라 전체 entry type과 containment를 검사한다. 읽기 전용 기존 후보 검사는 필수 파일만 확인한다.
- 취득 tree의 안전한 내부 link는 staging에서 상대 link로 정규화한다. root 밖 참조·dangling·cycle·특수 파일은 거부한다.
- rollback 실패 시 previous/recovery 자료를 삭제하지 않는다. 실패 target·백업·보존 staging의 절대 경로를 보고한다.
- 제품·테스트 편집은 Coder만 수행한다. TDD는 failing-first로 실행하고 전체 suite를 확인한다.
- significant 위험 흐름은 Coder → QA → 최종 전체 변경 독립 Reviewer → Lead 수락이다. 작업 경계만을 이유로 별도 QA/review gate를 추가하지 않는다.
- 실제 사용자 설치, push, merge, 배포는 이번 구현·검증 범위가 아니다. 격리된 임시 target의 실제 취득 검증만 포함한다.
- commit은 모든 수락 기준과 필요한 검증이 충족된 뒤 선택적으로 수행한다.

## 공유 brief 및 승인 상태

- **목표:** 매 일반 설치에서 네 외부 스킬 최신 동기화, custom home 지원, read-only 옵션 유지, 취득 실패와 교체 실패의 복구.
- **승인:** 2026-10-04 사용자가 CEO의 직전 설계와 TDD 테스트 작업을 함께 승인하는 질문에 `ㅇ`로 답했다. 테스트 추가·RED/GREEN 실행·전체 suite·독립 QA를 수행할 수 있다. 이 구현 계획은 아직 승인되지 않았다.
- **계획 깊이:** bounded 설계지만 취득 → 검증 → 백업 → 여러 대상 교체 → rollback의 단계 의존성과 lifecycle·integration order가 있으므로 written plan이 필요하다.
- **위험:** 설치 경로·공유 스킬 상태·백업·복구 계약 변경으로 significant다.
- **현재 절대 작업공간:** `/Users/yunho/Desktop/project/arc`. 계획 작성 시 `git status --short` 출력은 비어 있었다. 코드·테스트 수정·실행과 worktree 생성은 하지 않았다.
- **isolation 상태:** 이번 실행을 위한 worktree/submodule/preference/consent/setup 검증은 아직 수행하지 않았다. 계획 승인 후 Coder 전에 Lead가 installed `using-git-worktrees`를 적용한다. 기존 문서의 과거 in-place 선택을 이번 실행 근거로 자동 재사용하지 않는다.
- **경로 전달:** 실제 isolation 경로가 바뀌면 Lead가 본 문서의 workspace prefix와 모든 specialist brief를 동일한 절대 경로로 갱신한다. 사용자 요청에 따라 이번 계획 단계에서는 작업공간을 생성·전환하지 않는다.
- **다음 목표:** CEO에게 저장된 계획을 보고하고 계획 승인을 기다린다. 승인 전 구현·테스트 실행·worktree 생성은 시작하지 않는다.

## 근거와 파일 책임

공식 소스의 Codex `globalSkillsDir`는 `CODEX_HOME`을 읽지만 universal global 분기는 사용자 `.agents/skills`로 보낼 수 있다. 따라서 `--global`에 실제 target 관리를 맡기지 않는다. 취득은 project scope로 수행하고 Python이 승인된 target에 반영한다.

- [agents.ts](https://github.com/vercel-labs/skills/blob/main/src/agents.ts)
- [installer.ts](https://github.com/vercel-labs/skills/blob/main/src/installer.ts)
- [add.ts](https://github.com/vercel-labs/skills/blob/main/src/add.ts)
- [local-lock.ts](https://github.com/vercel-labs/skills/blob/main/src/local-lock.ts)
- [git.ts](https://github.com/vercel-labs/skills/blob/main/src/git.ts)

조사한 upstream `main`과 배포된 `skills@latest`의 일치는 격리된 실제 취득으로 확인한다. 확인 전 일치를 주장하지 않는다.

| 파일 | Coder 책임 |
|---|---|
| `install.py` | 구조 검사, 취득 subprocess, 임시 환경, 외부 staging, 통합 transaction |
| `tests/test_install.py` | snapshot fixture 제거, 구조·취득·복구 TDD, 내부 계약 회귀 |
| `README.md` | 최신 sync·필요 도구·옵션·교체 영향·복구 계약 |
| `external-skills.toml` | 삭제 |
| `MANIFEST.sha256` | 내부 payload 목록과 변경 hash 갱신 |
| `install.command` | 기존 wrapper 유지; 변경할 필요가 생기면 Lead에게 범위 보고 |

모든 상대 경로의 기준은 위 절대 작업공간이다. 새 production module과 무관한 역할/profile 변경을 추가하지 않는다.

## 리뷰 초점

| 조건 | 기대 동작 | 테스트 소유 |
|---|---|---|
| 일반 설치의 root/parent alias | 취득 전에 실패하고 link target 불변 | 작업 1 |
| 취득 tree의 절대 내부 link·directory link | 설치 뒤 임시 경로 참조 없이 내부 대상 유지 | 작업 2 |
| CLI 부분 JSON·누락된 스킬·skipped | 실제 설치 변경 없이 실패 | 작업 2 |
| 취득 timeout·interrupt | 자식 process group 회수 후 임시 자료 정리 | 작업 2 |
| 교체 실패와 rollback 실패의 조합 | previous와 백업 보존, 경로 보고 | 작업 3 |

## 작업 1: snapshot 정책을 구조 검사와 쓰기 대상 사전 검사로 교체

**Files:** `install.py`, `tests/test_install.py`, `external-skills.toml`, `MANIFEST.sha256`.

**Consumes:** 기존 `REQUIRED_EXTERNAL_FILES`, `_external_candidate_root`, `require_regular_file`, `reject_symlink_components`, `verify_manifest`.

**Produces:**

```python
def validate_required_external_files(root: Path, required_files: tuple[str, ...]) -> None:
    """지정된 필수 파일만 strict resolution·regular file·containment로 검사한다."""

def validate_acquired_external_tree(root: Path, required_files: tuple[str, ...]) -> None:
    """취득/staging tree 전체의 타입·strict resolution·containment를 검사한다."""

def validate_external_skills(home: Path, user_home: Path) -> None:
    """읽기 전용 기존 후보의 필수 파일 구조만 검사한다."""

def external_write_targets(home: Path, user_home: Path) -> dict[str, tuple[Path, ...]]:
    """선택 home의 네 대상과 존재하는 legacy 후보를 안전하게 확정한다."""
```

- [ ] **1. 구조 검사 failing test 작성.** 기존 `write_candidate`, `write_candidates`, `tree_state`, `ExternalSkillPreflightTests`의 temp home과 `run_main`을 재사용한다. `setUp`, `legacy_root`, `installer_payload`, `create_payload`, `validate`의 lock/records 의존성을 제거하고 fixture manifest에서 lock을 제외한다. parser/hash 승인 테스트는 구조·sync 계약 테스트로 대체한다.

```python
def test_structurally_valid_changed_bytes_are_accepted(self):
    self.install_candidates(self.codex_home / "skills", variant=b"new upstream")
    installer.validate_external_skills(self.codex_home, self.user_home)

def test_write_targets_reject_root_alias_without_touching_target(self):
    upstream = self.base / "upstream"
    write_candidate(upstream, "brainstorming")
    base = self.codex_home / "skills"
    base.mkdir(parents=True)
    (base / "brainstorming").symlink_to(upstream / "brainstorming")
    before = tree_state(upstream)
    with self.assertRaises(installer.InstallerError):
        installer.external_write_targets(self.codex_home, self.user_home)
    self.assertEqual(tree_state(upstream), before)

def test_write_targets_do_not_create_missing_legacy_candidates(self):
    targets = installer.external_write_targets(self.codex_home, self.user_home)
    for skill, paths in targets.items():
        self.assertEqual(paths, (self.codex_home / "skills" / skill,))
    self.assertFalse((self.user_home / ".agents").exists())
```

같은 테스트 그룹에 `test_write_targets_reject_parent_alias`, `test_write_targets_include_existing_legacy`, `test_blank_codex_home_fails_before_acquisition`을 추가한다. default/custom home, 공백 경로, root regular file, 기존 tree의 FIFO/socket, 백업 가능한 내부 link도 확인한다. 기존 read-only alias·필수 파일 containment·읽기 실패 테스트를 유지한다.

- [ ] **2. RED 실행.**

```sh
python3 -B -m unittest discover -s tests -p test_install.py -k structurally_valid_changed_bytes -v
python3 -B -m unittest discover -s tests -p test_install.py -k write_targets -v
```

기대: 새 API 부재 또는 기존 snapshot 인자 요구 때문에 실패한다. fixture 오류에 의한 실패는 고친 뒤 다시 RED를 확인한다.

- [ ] **3. 최소 구현.** `SnapshotMap`, `EXTERNAL_DIGEST`, `load_external_snapshots`, 외부 raw-byte digest 비교를 제거한다. `external-skills.toml`을 삭제하고 manifest required files와 fixture에서 제외한다. 내부 manifest SHA 검증은 유지한다.

```python
targets = {}
for skill in REQUIRED_EXTERNAL_FILES:
    selected = home / "skills" / skill
    legacy = user_home / ".agents" / "skills" / skill
    paths = [selected]
    if os.path.lexists(legacy):
        paths.append(legacy)
    for path in paths:
        reject_symlink_components(path)
        check_directory_or_missing(path)
    targets[skill] = tuple(dict.fromkeys(paths))
```

기존 target tree를 `lstat`으로 사전 검사한다. 백업은 내부 link 자체를 보존하며 link target을 따라가지 않는다. 특수 파일은 취득 전에 거부한다. 기존 내용이 오래되거나 필수 파일이 빠졌다는 이유만으로 일반 sync를 막지 않는다.

- [ ] **4. GREEN 확인.**

```sh
python3 -B -m unittest discover -s tests -p test_install.py -k write_targets -v
python3 -B -m unittest discover -s tests -p test_install.py -k symlink -v
python3 -B -m unittest discover -s tests -p test_install.py -k required -v
```

기대: 모두 PASS. snapshot 삭제에 따른 회귀는 이름과 원인을 기록하고 수정한다. 내부 manifest는 이 단계의 payload 변경과 일치하도록 갱신한다.

## 작업 2: 네 스킬 일괄 취득과 안전한 staging

**Files:** `install.py`, `tests/test_install.py`.

**Consumes:** 작업 1의 `validate_acquired_external_tree`, `validate_required_external_files`, `REQUIRED_EXTERNAL_FILES`.

**Produces:**

```python
EXTERNAL_SOURCE = "https://github.com/obra/superpowers"
EXTERNAL_FETCH_TIMEOUT_SECONDS = 300

def acquire_external_skills(work: Path) -> dict[str, Path]:
    """work에서 CLI를 실행하고 검증된 네 source root를 반환한다."""

def stage_external_tree(source: Path, destination: Path) -> None:
    """검증된 tree를 복사하고 내부 link를 상대 link로 정규화한다."""
```

- [ ] **1. subprocess 계약 failing tests 작성.** 실 네트워크를 사용하지 않고 fake runner가 지정 cwd의 `.agents/skills`에 fixture를 만든다. 실제 CLI의 JSON contract에 맞춰 결과를 제공한다.

```python
def successful_cli_output(cwd: Path) -> str:
    write_candidates(cwd / ".agents" / "skills", variant=b"latest")
    return json.dumps([
        {"name": skill, "status": "installed",
         "path": str(cwd / ".agents" / "skills" / skill),
         "scope": "project", "agents": ["codex"], "mode": "copy"}
        for skill in FILES
    ])
```

`test_acquisition_uses_exact_four_skill_command`는 argv/cwd/env/timeout을 확인한다. `test_acquisition_rejects_partial_json`, `test_acquisition_rejects_failed_or_skipped_json`, `test_acquisition_rejects_missing_required_file`는 각각 이름 누락, failed/skipped, 성공 JSON 뒤 실제 파일 누락에 `InstallerError`를 기대한다. nonzero exit, JSON 오류·중복 이름·path mismatch·npx 부재도 포함한다.

- [ ] **2. RED 실행.**

```sh
python3 -B -m unittest discover -s tests -p test_install.py -k acquisition -v
```

기대: 취득 API 부재로 실패한다. fake 자체의 오류는 수정하고 RED를 다시 확인한다.

- [ ] **3. CLI 취득 최소 구현.** 부모가 실제 user home과 선택 target을 먼저 고정하고, 자식에만 임시 환경을 전달한다. `HOME`은 유지한다. env 변수 이름은 기존 시스템 변수의 부모 값을 덮어쓰기 위한 shell 변수로 재사용하지 않는다.

```python
command = [
    "npx", "--yes", "skills@latest", "add", EXTERNAL_SOURCE,
    "--skill", *REQUIRED_EXTERNAL_FILES,
    "--agent", "codex", "--yes", "--copy", "--json",
]
env = os.environ.copy()
env.update({
    "CODEX_HOME": str(work / "codex-runtime"),
    "npm_config_cache": str(work / "npm-cache"),
    "XDG_STATE_HOME": str(work / "state"),
    "TMPDIR": str(work / "tmp"),
})
```

임시 tmp/cache/state 디렉터리를 work 안에 준비한다. `Popen`에 `cwd=work`, `env=env`, `start_new_session=True`, stdout/stderr pipe를 전달하고 `communicate(timeout=300)`으로 회수한다. timeout/interrupt 시 process group에 SIGTERM, 5초 뒤에도 남으면 SIGKILL을 보내고 `communicate()`로 회수한 뒤 임시 자료를 정리한다. npx 부재·시작 실패·nonzero·JSON decode 오류를 installer 오류로 보고한다.

JSON은 정확한 네 이름 각 한 건, installed/project/codex/copy와 기대 path를 요구한다. CLI의 hash field는 비교하지 않는다. JSON 성공과 별개로 실제 `.agents/skills/<name>`의 필수 파일 11개와 전체 tree를 검사한다. 불명확하거나 부분 성공인 결과는 transaction에 넘기지 않는다.

- [ ] **4. full tree/link failing tests 작성.**

```python
def test_staging_rewrites_absolute_internal_link(self):
    source = write_candidate(self.base / "source", "writing-plans")
    (source / "reference.md").write_bytes(b"reference")
    (source / "reference-link.md").symlink_to(source / "reference.md")
    target = self.base / "staged" / "writing-plans"
    installer.stage_external_tree(source, target)
    self.assertFalse(Path(os.readlink(target / "reference-link.md")).is_absolute())
    self.assertEqual((target / "reference-link.md").read_bytes(), b"reference")
```

`test_staging_accepts_internal_directory_link`, `test_acquisition_rejects_escape_link`, `test_acquisition_rejects_dangling_or_cycle_link`, `test_acquisition_rejects_extra_fifo`를 추가한다. timeout/interrupt의 process group 회수와 임시 자료 정리도 failure injection으로 확인한다.

- [ ] **5. 안전한 copy 구현 및 GREEN 확인.** `os.walk(..., followlinks=False)`와 `lstat`으로 전체 entry를 검사한다. strict resolved link가 source root 내부의 regular file/directory인지 확인한다. 실제 파일·디렉터리를 먼저 복사하고 link를 destination root 내부의 상대 link로 만든다.

```python
resolved_relative = link.resolve(strict=True).relative_to(source.resolve(strict=True))
destination_link = destination / link.relative_to(source)
destination_target = destination / resolved_relative
destination_link.symlink_to(os.path.relpath(destination_target, destination_link.parent))
```

root 밖 참조·dangling·cycle·특수 entry는 복사 전에 실패한다. 복사 후 전체 destination tree와 필수 파일을 다시 확인한다.

```sh
python3 -B -m unittest discover -s tests -p test_install.py -k acquisition -v
python3 -B -m unittest discover -s tests -p test_install.py -k staging -v
```

기대: 모두 PASS.

### 위험한 의존 계약 검증 경계

작업 3은 경로 확정·취득 결과·안전한 copy를 신뢰해 실제 설치 파일을 교체한다. 이 계약은 containment와 install order를 다루므로 작업 1·2의 독립 QA를 완료하고 actionable findings를 Coder가 해결한 뒤 작업 3으로 진행한다. QA는 해당 focused tests와 격리된 실제 `skills@latest` 취득을 확인한다. 이 검증은 risky dependency boundary를 충족하며 최종 전체 QA와 QA 후 전체 Reviewer를 대체하지 않는다. 상태가 바뀌면 affected evidence를 재확인한다.

## 작업 3: 통합 transaction, 읽기 전용 옵션, 문서 완성

**Files:** `install.py`, `tests/test_install.py`, `README.md`, `MANIFEST.sha256`.

**Consumes:** 작업 1·2의 검증된 API, 기존 `backup_existing`, `create_stage_area`, `rollback`.

**Produces:** 일반 sync, read-only 옵션, 외부/ARC/profile 통합 rollback, recovery 보존, 정확한 README와 내부 manifest.

- [ ] **1. 통합 failing tests 작성.** lock 없는 payload fixture와 fake 취득을 사용한다. `test_install_syncs_all_four_on_every_run`는 두 번 일반 설치 각각에서 취득 호출과 네 대상 최신 bytes를 확인한다. `test_install_updates_existing_legacy_only`는 존재하던 legacy만 갱신되고 나머지는 생기지 않음을 확인한다. `test_sync_removes_deleted_upstream_files`는 기존 obsolete file 제거를 확인한다.

```python
def test_read_only_options_never_acquire_or_write(self):
    self.create_payload()
    self.install_candidates(self.user_home / ".agents" / "skills")
    before = tree_state(self.base)
    for argv in (["--check"], ["--dry-run"]):
        with patch.object(installer, "acquire_external_skills") as acquire:
            status, output = self.run_main(argv)
        self.assertEqual(status, 0, output)
        acquire.assert_not_called()
        self.assertEqual(tree_state(self.base), before)
```

read-only 실패도 상태 불변을 확인한다. 내부 manifest/model/path 실패가 취득 호출보다 먼저 발생하는지 assert한다. 취득 실패·timeout·부분 결과는 기존 targets와 backup/staging이 불변임을 확인한다.

- [ ] **2. RED 실행.**

```sh
python3 -B -m unittest discover -s tests -p test_install.py -k install_syncs -v
python3 -B -m unittest discover -s tests -p test_install.py -k read_only_options -v
```

기대: 일반 설치가 취득·외부 교체를 하지 않는 현재 구현 때문에 실패한다. 이미 통과하는 read-only 테스트는 회귀 검사로 기록하며 RED의 대체 근거로 사용하지 않는다.

- [ ] **3. main/transaction 순서 구현.**

```text
payload manifest / models / profiles preflight
→ parent user_home / selected home 확정
→ check/dry-run: 필수 파일 구조 검사·출력 후 return
→ 일반 실행: 전체 write path·backup 가능성 검사
→ 별도 임시 취득 + 네 source 구조 검증
→ 백업 / target filesystem별 stage 준비
→ 네 외부 스킬 및 기존 legacy 대상 교체
→ ARC / 일곱 profiles 교체
→ 성공 또는 역순 rollback
→ 복구 완료 자료만 cleanup
```

기존 외부 root의 오래된 bytes·누락 파일은 일반 sync로 복구한다. 백업은 `copytree(..., symlinks=True)`로 내부 link를 따라가지 않고 보존한다. backup layout은 selected home과 legacy를 구분한다.

```text
backups/<stamp>/skills/<name>
backups/<stamp>/legacy-agents-skills/<name>
backups/<stamp>/skills/arc
backups/<stamp>/agents/<profile>
```

모든 백업과 stage 준비가 성공한 뒤 첫 target 교체를 시작한다. 각 target parent filesystem에 stage/previous를 준비하고 기존 target 이동 전에 action을 journal에 등록한다. 원래 없던 target도 실패 시 제거한다. stage helper의 destination parent를 준비하고 stale 파일 없이 전체 tree를 교체한다.

- [ ] **4. rollback/recovery RED 작성 및 실행.** 기존 os.replace 실패 주입 방식을 재사용해 `test_external_replace_failure_restores_all_targets`, `test_profile_failure_restores_external_targets_too`, `test_failed_install_removes_new_external_targets`를 만든다. 이전 external/ARC/profile bytes와 상태 복원을 확인한다.

`test_rollback_failure_preserves_previous_and_reports_recovery_path`는 설치 replace와 해당 previous 복원을 별개로 실패시킨다. 보고된 절대 recovery 경로가 존재하고 old bytes가 남는지 확인한다.

```sh
python3 -B -m unittest discover -s tests -p test_install.py -k failure -v
```

기대: 기존 cleanup이 recovery를 삭제하거나 외부 journal이 없어 신규 테스트가 실패한다.

- [ ] **5. rollback/cleanup 최소 수정 및 GREEN 확인.** rollback 실패 target에 대응하는 area와 남은 previous를 포함하는 area를 cleanup에서 제외한다. 모든 previous를 유실 없이 보존하고 미복구 target, 백업, 보존 area 절대 경로를 보고한다. 성공 또는 전체 복원 때만 stage를 정리한다. 오류는 종료 코드 `2`로 반환한다.

```python
retained_areas = {
    area for area in stage_areas
    if any(
        isinstance(action["previous"], Path)
        and action["previous"].is_relative_to(area)
        and os.path.lexists(action["previous"])
        for action in actions
    )
}
```

이 판정에 복원 실패 target의 area를 더한다. backup은 성공·실패 모두 유지한다. 임시 취득은 process 회수 후 정리하되 복구에 필요한 previous area와 혼동하지 않는다.

```sh
python3 -B -m unittest discover -s tests -p test_install.py -k failure -v
python3 -B -m unittest discover -s tests -p test_install.py -k read_only -v
python3 -B -m unittest discover -s tests -p test_install.py -k install_syncs -v
```

기대: 모두 PASS.

- [ ] **6. README와 내부 manifest 갱신.** 사전 수동 설치 필수·reviewed snapshot·외부 불변 설명을 교체한다. 매번 최신 sync, 정확 CLI, Node/npm/npx·Git·네트워크 요구, custom/legacy 경로, 개인 수정 상실과 백업, write alias 거부와 read-only 차이, 임시 취득 쓰기와 실제 target 보호 경계, rollback/recovery 한계, 외부 SHA 폐지와 내부 SHA 유지를 명시한다. `skills@latest`의 runtime 요구는 배포 metadata로 확인하고 불확실한 최소 Node 버전을 단정하지 않는다.

manifest는 기존 목록에서 삭제 lock을 제외하고 각 남은 path의 hash를 갱신한다. mutable `skill/models.toml`, `.DS_Store`, plans는 새로 포함하지 않는다. Coder가 갱신 스크립트를 임시 파일에 작성할 수 있으나 production helper로 추가하지 않는다.

- [ ] **7. 전체 프로젝트 suite와 structural checks.**

```sh
python3 -B -m unittest discover -s tests -v
git diff --check
bash -n install.command
```

기대: 전체 suite PASS, diff/shell checks exit `0`. 실패가 발생하면 이름·원인·영향을 보고하고 해당 계약을 수정한 뒤 affected checks와 필요한 전체 suite를 다시 수행한다.

## 최종 QA, 리뷰, 수락

- [ ] QA가 마지막 관련 상태에서 전체 suite와 structural checks를 독립 실행한다.
- [ ] QA가 default/custom/공백 경로의 임시 target에서 일반 설치와 check/dry-run을 확인한다. 실제 user skills에 설치하지 않는다.
- [ ] 작업 2 경계의 실제 취득 증거는 CLI argv/env/source·관련 코드·배포 상태·검증 위치가 유효할 때만 재사용한다. 변경이나 증거 공백이 있으면 격리 취득을 재확인한다.
- [ ] 실제 취득은 전용 임시 cwd와 계획의 자식 env로 정확한 npx 명령을 실행한다. JSON 계약과 네 tree를 검사하고 staging 이후 임시 path를 참조하는 link가 없는지 확인한다.
- [ ] CLI 배포가 조사한 main과 다르면 Coder에게 반환한다. JSON을 무시하는 fallback으로 성공 처리하지 않는다. network/environment 실패는 코드 실패와 구분하며 missing acceptance evidence를 기록한다.
- [ ] Reviewer가 QA 이후 최종 전체 변경을 독립 확인한다. preflight 순서, alias, 부분 취득, process cleanup, full-tree copy, backup/rollback, read-only, SHA 구분과 README 정확성을 검토한다.
- [ ] 행동 수정이 생기면 QA가 affected checks를 재실행하고 Reviewer가 영향에 따라 재확인한다. 요구별 scope/state/evidence/independence/freshness/flow position을 brief에 기록한다.
- [ ] Lead가 수락 기준과 findings를 해결 또는 명시적으로 disposition한 뒤 수락한다. 확인한 출력만 완료 근거로 보고한다.
- [ ] 선택적 commit 전에 accepted scope만 stage됐는지 확인한다. unresolved criteria나 필요한 checks가 남으면 commit하지 않는다.

```sh
git commit -m "feat(installer): 필수 외부 스킬의 최신 동기화"
```

## 계획 승인에 포함되는 세부 결정

1. 취득 timeout `300`초, process 종료 유예 `5`초. 별도 설정 flag는 추가하지 않는다.
2. 자식 `CODEX_HOME`, npm cache, `XDG_STATE_HOME`, `TMPDIR`을 임시 공간으로 지정한다. 부모 실제 user home/target은 유지한다.
3. 취득 tree의 안전한 내부 link를 상대 link로 정규화한다. 기존 read-only 검사의 전체 tree 범위를 확대하지 않는다.
4. 작업 1·2의 위험한 경로/취득 계약을 독립 QA로 확인한 뒤 transaction 구현으로 진행한다. 최종 QA 후 전체 리뷰는 별도로 필요하다.

isolation과 배포 CLI 일치는 실행 단계 확인사항이며 확인된 사실로 취급하지 않는다. latest는 ref 없는 default branch의 취득 시 내용이다. upstream 이동과 스킬의 의미적 호환성까지 보장하지 않는다.

## Lead 자기검토

- 승인된 매회 네 종 sync, SHA/pin 제거, 내부 manifest 유지, custom/기존 legacy, read-only, 경로 보호, rollback/recovery를 작업 1~3과 수락 절차에 연결했다.
- root symlink 독립 교체와 기존 link target 수정은 포함하지 않았다.
- 기존 fixture helper를 확인했으며 lock 의존 fixture만 변경하도록 명시했다.
- 읽기 전용 필수 파일 검사와 취득/stage 전체 tree 검사를 분리했다.
- RED/GREEN 명령과 전체 project suite를 명시했다. 이미 통과하는 회귀 검사를 failing-first 증거로 취급하지 않는다.
- 취득·복구 관련 위험한 의존 경계와 최종 significant 흐름을 기록했다.
- 한국어 설명을 유지하고 API·명령·literal identifier는 원문을 보존했다.
- 계획 작성 중 코드·테스트·설치·worktree 작업은 하지 않았다. 이번 문서는 승인 대기 초안이다.
# 2026-10-15 Claude leaf-link 예외 addendum

기존 Codex 링크 거부 계약은 유지한다. Claude 설치만 세 필수 skill의 마지막 링크가 정확히 같은 이름의 기본 `~/.codex/skills/<name>` 실제 디렉터리를 가리킬 때 독립 upstream 취득본으로 전환한다. Claude 부모·중간 경로 링크, 다른 목적지·이름, dangling·cycle·file 목적지와 Codex 목적지 경로의 링크는 취득 전에 거부한다.

Codex tree와 사용자 수정은 변경하거나 Claude로 복사하지 않는다. 원래 링크 항목은 문자열 그대로 백업하고 실패 시 복원하며, 상대 링크 백업은 원래 위치로 되돌릴 때만 사용한다. 백업 위치에서는 역참조하지 않는다. 복구 실패 자료는 절대 recovery 경로와 함께 보존·보고한다. `--check`와 `--dry-run`은 쓰기·취득을 하지 않으며 dry-run은 허용 링크의 독립 디렉터리 전환을 알린다.
