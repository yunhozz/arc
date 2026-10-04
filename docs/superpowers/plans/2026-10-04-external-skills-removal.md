# 외부 스킬 사전 검사 구현 계획

> **For agentic workers:** 승인된 계획을 task 단위로 진행한다. Lead가 순차 조율하고 Coder가 지정 파일을 수정한다. 진행 상태는 체크박스로 기록한다.

**목표:** `dependencies/` 번들을 제거하고, 검토된 외부 스킬 snapshot 검사에 통과한 경우에만 Harness와 일곱 프로필을 설치한다.

**구조:** `install.py`에 lock 파서와 외부 스킬 검사 함수를 추가한다. Manifest를 확인한 뒤 lock을 파싱하고, 설치 대상에 쓰기 전에 모든 외부 후보를 검사한다. 기존 Harness·프로필 transaction에서 dependency 전용 동작만 제거한다.

**기술:** Python 3.11 이상, `tomllib`, `hashlib`, `pathlib`, 표준 라이브러리 `unittest`, `unittest.mock`, `tempfile`.

**Spec:** `/Users/yunho/Desktop/project/yunho-harness/docs/superpowers/specs/2026-10-04-external-skills-removal-design.md`

## Global Constraints

- 외부 패키지를 추가하지 않는다. Python 최소 버전은 `3.11`이다.
- 필수 스킬은 `brainstorming`, `writing-plans`, `test-driven-development`, `using-git-worktrees`다.
- 초기 lock에는 승인된 spec의 스킬별 필수 파일과 SHA-256 11개를 그대로 기록한다. 초기 snapshot ID는 `local-reviewed-2026-10-04`, lock version은 `1`이다.
- 검색 위치는 `<selected CODEX_HOME>/skills/<skill-name>`과 `<actual user home>/.agents/skills/<skill-name>` 두 곳이다.
- 존재하는 모든 고유 실제 후보가 하나의 승인 snapshot 전체와 일치해야 한다.
- 외부 스킬은 읽기 전용 입력이다. 설치·복사·backup·staging·교체·삭제·권한 변경을 하지 않는다.
- 일반 설치, `--check`, `--dry-run`은 같은 검사를 수행한다. 성공 코드는 `0`, installer 오류 코드는 `2`다.
- 기존 Python 버전 확인, manifest 검증, 모델·프로필 생성, 설치 대상 symlink 차단, backup·rollback, 수동 활성화 동작을 유지한다.
- `skill/models.toml`의 mutable 예외를 유지한다.
- 저장소 설치 테스트는 임시 디렉터리만 사용한다. 실제 사용자 설치·push는 범위에 없다.
- 현재 checkout에서 in-place로 작업한다. 구현 전 worktree/submodule 상태와 시작 diff를 확인한다.
- 필요한 테스트 권한이 확인되기 전에는 테스트 파일을 만들거나 테스트를 실행하지 않는다. 승인 뒤에도 계획된 범위 밖의 검사는 추가하지 않는다.

## 공유 brief 및 실행 전 승인 상태

**후속 승인 기록:** 2026-10-04 사용자가 CEO의 계획 승인·테스트 작성 및 실행 요청 질문에 “ㅇㅇ”로 답했다. 아래 작성 시점의 pending 기록은 이 결정으로 해소되었다. 승인된 범위의 실패 먼저 테스트, 전체 unittest suite, 임시 home 설치·무변경·rollback, 독립 QA 및 전체 독립 Reviewer 검증을 진행한다. 실제 사용자 설치와 push는 포함하지 않는다. 시작 HEAD 및 staged 상태를 다시 확인한 결과 HEAD는 `2ea36bf95f33d400743dcf1fe47ebfa2a541514c`, staged 변경 없음, spec·plan 두 untracked 파일만이다. 작업공간은 동일한 in-place checkout이다.

**최종 수락 기록:** 2026-10-04 Coder는 누락 회귀 → parser → validator → dependency 없는 payload integration → production lock 계약의 실제 RED/GREEN을 기록했다. 전체 `python3 -B -m unittest discover -s tests -v`는 35개 통과(exit 0)했고, 독립 QA가 같은 suite와 최종 `--check`·`--dry-run`·`git diff --check`를 모두 exit 0으로 확인했다. 임시 home 정상 설치, 신규/기존 대상의 18개 무변경 실패 조합, 교체 실패 rollback·backup 유지·stage cleanup·외부 불변 검증이 통과했다. 11개 lock 항목은 spec과 정확히 같고 최종 14개 manifest hash가 일치하며 `skill/`·`agents/`·model policy는 baseline 그대로다. README의 총 11개 표현과 lock 변경 후 manifest 갱신 안내를 보정하고 QA가 최종 문서/hash 상태를 재확인했다. QA 이후 fresh 독립 Reviewer가 설치기·README·manifest·새 lock/tests·bundle 전체 제거·승인 문서를 검토해 substantive finding 없음을 반환했다. 이 review는 significant risk 전체 독립 review와 이번 승인된 최종 fresh review의 범위·증거·최종 관련 상태·독립성·freshness·QA 이후 위치를 모두 충족했다. Lead가 spec 수락 기준 1–11을 확인하여 수락한다. CRLF 한 사례만 사용하는 raw-byte mutation 테스트의 작은 coverage 한계는 직접 `read_bytes()` hash와 독립 검토를 근거로 비차단으로 disposition했다. 초기 baseline은 기존 tests 부재로 0 tests/exit 5였으며 통과로 주장하지 않는다. 실제 사용자 일반 설치와 push는 수행하지 않았다. 증거: `/private/tmp/external-preflight-coder-evidence.txt`, `/private/tmp/external-preflight-qa-evidence.txt`, `/private/tmp/external-preflight-review-evidence.txt`. 수락 후 승인된 하나의 focused commit을 만든다.

- **목표·수락 기준:** 승인된 spec의 수락 기준 1–11을 구현한다. 이 작업은 설치 transaction과 선행 조건을 함께 바꾸는 architectural 작업이므로 서면 계획과 승인이 필요하다. 한 구현 task 안에서 parser → 후보 검증 → 세 진입점 통합 → bundle·manifest·README 정리의 의존 순서를 지킨다.
- **작업공간 근거:** 2026-10-04 읽기 전용 확인 결과 절대 작업공간은 `/Users/yunho/Desktop/project/yunho-harness`, branch는 `master`, HEAD는 `2ea36bf95f33d400743dcf1fe47ebfa2a541514c`다. absolute git dir와 common dir는 모두 `/Users/yunho/Desktop/project/yunho-harness/.git`이며 `git rev-parse --show-superproject-working-tree` 출력은 비어 있다. 따라서 submodule이나 linked worktree가 아닌 기존 checkout이다. 사용자가 이미 승인한 in-place 선호를 유지한다. 새 worktree를 만들지 않았다.
- **시작 상태:** `git status --short`에는 이 plan과 spec 두 untracked 파일만 있었다. 구현·test·README·manifest·dependencies 변경은 없었다. 패키지 setup 대상 `package.json`, `requirements.txt`, `pyproject.toml`, `Cargo.toml`, `go.mod`는 없었다. baseline test는 아래 제약으로 실행하지 않았다.
- **정확한 제약:** 상위 개발 지침은 “Do not add or run tests unless the user asks you to test or verify implementation.”라고 규정한다. 사용자의 “ㅇㅇ 진행해”는 변경 범위 승인이며 현재 전달된 근거에는 테스트 작성·실행의 명시 요청이 없다. 설치 동작 변경에는 `/Users/yunho/.agents/skills/test-driven-development/SKILL.md`의 “NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST”와 RED/GREEN 및 전체 suite 확인이 적용된다. 상위 지침이 우선하므로 테스트·production code의 편집/실행을 시작할 수 없다. using-git-worktrees의 baseline test 요구도 같은 이유로 보류한다.
- **선택과 불확실성:** 권장 결정은 사용자가 이 계획을 검토하고 계획된 테스트 작성·실행 및 독립 QA 검증을 명시 요청하는 것이다. 그러면 Coder가 실패 먼저 확인하고 구현한다. 테스트 없는 진행은 자동 예외가 아니며 TDD를 수행했다고 주장할 수 없다. 이를 선택하려면 별도 인간 예외 결정과 범위·잔여 위험을 다시 기록해야 하고, 상위 테스트 금지 자체를 내부 승인으로 해제할 수 없다. 이 작업을 문서/configuration 예외로 취급하지 않는다.
- **실행 절차:** 사용자가 실행 방식 이름·선택 질문을 원하지 않는다는 기존 결정을 보존한다. 새 명칭 선택을 요청하지 않는다. 계획에는 Lead의 순차 Coder 조율 → 독립 QA → 구현에 참여하지 않은 fresh Reviewer의 전체 변경 검토 → Lead 수락 절차를 명시한다. 해당 절차와 계획 승인 근거를 구현 전 확인한다. QA는 significant risk 검증과 순차 절차의 QA checkpoint를 함께 충족하며, QA 뒤의 fresh 전체 review는 significant risk 독립 review와 순차 절차의 최종 review를 함께 충족할 수 있다. 실제 scope·state·evidence·independence·freshness·순서를 확인한 뒤에만 두 요구가 충족되었다고 기록한다.
- **정확한 다음 목표:** Planner의 구체화·self-review를 통합한 계획을 CEO에게 전달한다. CEO는 계획 검토 승인과 “계획대로 테스트를 작성·실행하고 검증해”라는 명시 요청을 받는다. 그 전에는 테스트 파일·production code를 수정하지 않는다. spec은 승인된 상태이며 다시 변경 승인을 요청하지 않는다.

## Review Focus

다음 다섯 조건은 Task 1의 테스트와 Reviewer 확인에 연결한다.

1. 정상 후보가 하나 있어도 두 번째 후보의 hash mismatch·읽기 실패가 설치 전에 실패한다.
2. 누락 경로, dangling link, cycle을 같은 경우로 조용히 처리하지 않는다.
3. 필수 파일 symlink는 실제 root 안에서만 허용하고, root 밖 참조·디렉터리·특수 파일은 읽기 전에 거부한다.
4. 파일 한 개라도 snapshot을 섞거나 raw bytes를 바꾸면 실패한다.
5. 외부 preflight 실패가 새 대상과 기존 Harness·프로필을 모두 그대로 둔다.

## Task 1: Snapshot 검사로 설치 계약 전환

**Files:**

- Modify: `/Users/yunho/Desktop/project/yunho-harness/install.py` — lock schema, 후보·파일 안전성, snapshot 비교, 공통 preflight, dependency transaction 제거.
- Create: `/Users/yunho/Desktop/project/yunho-harness/external-skills.toml` — 승인된 네 스킬의 11개 파일 snapshot.
- Create: `/Users/yunho/Desktop/project/yunho-harness/tests/test_install.py` — parser, snapshot, no-write와 설치 회귀 확인.
- Modify: `/Users/yunho/Desktop/project/yunho-harness/README.md` — 외부 선행 조건, 검증 범위, 오류·유지보수·한계.
- Modify: `/Users/yunho/Desktop/project/yunho-harness/MANIFEST.sha256` — lock 추가, dependency 항목 제거, 변경 파일 hash 반영.
- Delete: `/Users/yunho/Desktop/project/yunho-harness/dependencies/` — 번들 전체.
- Include in the final focused commit: 이 계획과 승인된 spec. 두 문서는 installer payload manifest에 넣지 않는다.

`skill/`, `agents/`, `install.command`, `config.toml`은 구현 변경 대상이 아니다.

### Interfaces

다음 별칭과 함수 경계를 사용한다. 다른 설치 helper의 공개 동작은 바꾸지 않는다.

```python
# skill name -> snapshot id -> relative POSIX path -> lowercase SHA-256
SnapshotMap = dict[str, dict[str, dict[str, str]]]

def load_external_snapshots(root: Path) -> SnapshotMap:
    """Parse and validate root/external-skills.toml."""

def validate_external_skills(
    home: Path,
    user_home: Path,
    snapshots: SnapshotMap,
) -> None:
    """Read-only validation of all unique candidates in both supported roots."""
```

`REQUIRED_EXTERNAL_FILES`는 네 스킬 각각의 정확한 상대 파일 tuple을 정의한다. `install_plan(root, home)`은 사전 검사를 통과한 후 다음을 반환한다.

```python
tuple[Path, Path, Path, dict[str, Path]]
# skills_dir, agents_dir, backups_dir, profile_targets
```

`main`은 manifest를 먼저 검사한다. `install_plan`에서 lock을 파싱하고 외부 후보를 검사해 `--check`, `--dry-run`, 일반 설치가 같은 preflight를 거치게 한다. 외부 root alias만 `resolve(strict=True)`로 허용하고, 기존 설치 대상의 symlink 정책은 그대로 둔다.

테스트 파일에서 사용할 고정 경로, lock bytes 생성 및 임시 payload 구성 helper를 먼저 구현한다. 아래 코드는 테스트 fixture 전체의 공통 계약이다.

```python
from contextlib import redirect_stderr, redirect_stdout
import hashlib
import io
import os
from pathlib import Path
import shutil
import stat
import tempfile
import unittest
from unittest.mock import patch

import install as installer

REPO = Path(__file__).resolve().parents[1]
FILES = {
    "brainstorming": (
        "SKILL.md", "visual-companion.md", "scripts/start-server.sh",
        "scripts/stop-server.sh", "scripts/server.cjs", "scripts/helper.js",
        "scripts/frame-template.html",
    ),
    "writing-plans": ("SKILL.md",),
    "test-driven-development": ("SKILL.md", "writing-good-tests.md"),
    "using-git-worktrees": ("SKILL.md",),
}

def render_lock(records):
    lines = ["version = 1"]
    for skill, snapshot_id, variant in records:
        lines.extend(("", "[[snapshots]]", f'skill = "{skill}"',
                      f'id = "{snapshot_id}"', "[snapshots.files]"))
        for relative in FILES[skill]:
            content = variant + b":" + relative.encode("utf-8")
            digest = hashlib.sha256(content).hexdigest()
            lines.append(f'"{relative}" = "{digest}"')
    return "\n".join(lines) + "\n"

def write_candidate(base, skill, variant=b"A"):
    root = base / skill
    for relative in FILES[skill]:
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(variant + b":" + relative.encode("utf-8"))
    return root

def write_candidates(base, variant=b"A"):
    return {skill: write_candidate(base, skill, variant) for skill in FILES}

def legacy_root(base, records):
    root = base / "legacy-payload"
    for skill in ("brainstorming", "writing-plans"):
        path = root / "dependencies" / skill / "SKILL.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("legacy fixture\n", encoding="utf-8")
    (root / "external-skills.toml").write_text(render_lock(records), encoding="utf-8")
    return root

def installer_payload(base, records):
    root = base / "payload"
    for directory in ("skill", "agents"):
        shutil.copytree(REPO / directory, root / directory,
                        ignore=shutil.ignore_patterns(".DS_Store"))
    for filename in ("install.py", "install.command", "README.md"):
        shutil.copy2(REPO / filename, root / filename)
    (root / "external-skills.toml").write_text(render_lock(records), encoding="utf-8")
    required = {"install.py", "install.command", "README.md", "external-skills.toml"}
    payload = set(required)
    for directory in ("skill", "agents"):
        for path in (root / directory).rglob("*"):
            if path.is_file() and path.name != ".DS_Store":
                relative = path.relative_to(root).as_posix()
                if relative != "skill/models.toml":
                    payload.add(relative)
    entries = [f"{hashlib.sha256((root / name).read_bytes()).hexdigest()}  {name}"
               for name in sorted(payload)]
    (root / "MANIFEST.sha256").write_text("\n".join(entries) + "\n", encoding="utf-8")
    return root

def tree_state(root):
    if not os.path.lexists(root):
        return None
    root_mode = root.lstat().st_mode
    root_value = (os.readlink(root) if stat.S_ISLNK(root_mode)
                  else root.read_bytes() if stat.S_ISREG(root_mode) else None)
    state = {".": (root_mode, root_value)}
    if not stat.S_ISDIR(root_mode):
        return state
    for path in sorted(root.rglob("*")):
        mode = path.lstat().st_mode
        if stat.S_ISLNK(mode):
            value = os.readlink(path)
        elif stat.S_ISREG(mode):
            value = path.read_bytes()
        else:
            value = None
        state[path.relative_to(root).as_posix()] = (mode, value)
    return state

class ExternalSkillPreflightTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.records = [(skill, "test-a", b"A") for skill in FILES]
        self.legacy = legacy_root(self.base, self.records)
        self.payload = installer_payload(self.base, self.records)
        self.codex_home = self.base / "codex-home"
        self.user_home = self.base / "user-home"
        self.lock_path = self.payload / "external-skills.toml"

    @property
    def valid_lock(self):
        return render_lock(self.records)

    @property
    def snapshots(self):
        return installer.load_external_snapshots(self.payload)

    def write_lock(self, document):
        self.lock_path.write_text(document, encoding="utf-8")

    def install_candidates(self, base, variant=b"A"):
        return write_candidates(base, variant)

    def validate(self):
        return installer.validate_external_skills(
            self.codex_home, self.user_home, self.snapshots
        )

    def run_main(self, argv):
        stdout, stderr = io.StringIO(), io.StringIO()
        with (
            patch.object(installer, "__file__", str(self.payload / "install.py")),
            patch.object(installer.Path, "home", return_value=self.user_home),
            patch.dict(os.environ, {"CODEX_HOME": str(self.codex_home)}),
            redirect_stdout(stdout),
            redirect_stderr(stderr),
        ):
            status = installer.main(argv)
        return status, stdout.getvalue() + stderr.getvalue()

    def seed_existing_targets(self):
        harness = self.codex_home / "skills" / installer.INSTALL_NAME
        harness.mkdir(parents=True)
        (harness / "SKILL.md").write_bytes(b"previous harness")
        agents = self.codex_home / "agents"
        agents.mkdir(parents=True)
        for filename in installer.PROFILE_FILES:
            (agents / filename).write_bytes(b"previous profile")
```

### Step 1: 실패하는 행동 테스트 작성

- [ ] Installed `test-driven-development`의 test-first 절차를 따른다. 테스트 fixture는 실제 사용자 home이나 실제 스킬 파일에 쓰지 않는다.
- [ ] 임시 root에 현재 installer가 요구하는 최소 유효 `dependencies/brainstorming` 및 `dependencies/writing-plans` fixture를 만든다. 이 fixture는 현재 동작에서 기능 부재를 관찰하기 위한 것이며 production bundle로 남기지 않는다.
- [ ] 다음 method를 앞서 정의한 `ExternalSkillPreflightTests` class 안에 추가한다. Class를 다시 선언하지 않는다. 기존 `install_plan`은 bundle이 있으면 외부 스킬이 없어도 설치 계획을 반환하므로, 현재 코드에서 테스트가 assertion failure로 실패해야 한다.

```python
def test_missing_external_skill_fails_install_plan(self):
    with patch.object(installer.Path, "home", return_value=self.user_home):
        with self.assertRaises(installer.InstallerError) as caught:
            installer.install_plan(self.legacy, self.codex_home)

    self.assertIn("brainstorming", str(caught.exception))
    self.assertFalse(self.codex_home.exists())
```

- [ ] 위에 정의한 `setUp`이 temporary root와 홈을 만들고, `legacy_root`가 기존 installer가 통과할 수 있는 두 bundled skill fixture 및 유효한 테스트 lock을 만든다. 외부 후보는 생성하지 않는다.
- [ ] 신규 함수가 아직 없는 상황에서 AttributeError가 나도록 테스트하지 않는다. 이 RED 테스트는 기존 기능의 잘못된 통과를 assertion failure로 드러내야 한다.
- [ ] 다음 명령으로 의도한 실패를 확인한다.

```sh
cd /Users/yunho/Desktop/project/yunho-harness
python3 -B -m unittest discover -s tests -p 'test_install.py' -v
```

예상: `InstallerError`가 발생하지 않아 위 테스트가 실패한다. import·fixture 문제라면 그 문제를 먼저 고친 뒤 다시 실행한다.

### Step 2: TOML lock parser를 test-first로 구현

- [ ] parser 테스트를 더해 잘못된 lock이 `InstallerError`로 거부되는지 확인한다.

```python
def test_lock_rejects_unknown_or_incomplete_schema(self):
    documents = {
        "boolean-version": self.valid_lock.replace("version = 1", "version = true", 1),
        "wrong-version": self.valid_lock.replace("version = 1", "version = 2", 1),
        "extra-top-level-key": "extra = 1\n" + self.valid_lock,
        "unknown-skill": self.valid_lock.replace(
            'skill = "writing-plans"', 'skill = "other"', 1
        ),
        "missing-skill": render_lock(
            [record for record in self.records if record[0] != "using-git-worktrees"]
        ),
        "empty-snapshots": "version = 1\nsnapshots = []\n",
        "absolute-file": self.valid_lock.replace('"SKILL.md" =', '"/SKILL.md" =', 1),
        "dot-file": self.valid_lock.replace('"SKILL.md" =', '"./SKILL.md" =', 1),
        "parent-file": self.valid_lock.replace('"SKILL.md" =', '"../SKILL.md" =', 1),
        "backslash-file": self.valid_lock.replace('"SKILL.md" =', '"scripts\\SKILL.md" =', 1),
        "bad-digest": self.valid_lock.replace(
            hashlib.sha256(b"A:SKILL.md").hexdigest(), "xyz", 1
        ),
        "duplicate-id": render_lock(
            self.records + [("brainstorming", "test-a", b"B")]
        ),
        "duplicate-key": self.valid_lock.replace(
            "version = 1", "version = 1" + chr(10) + "version = 1", 1
        ),
        "malformed-toml": "version = [" + chr(10),
    }
    for label, document in documents.items():
        with self.subTest(label=label):
            self.write_lock(document)
            with self.assertRaises(installer.InstallerError):
                installer.load_external_snapshots(self.payload)
```

- [ ] 위 `render_lock` helper는 각 `[[snapshots]]` entry와 `[snapshots.files]` mapping을 실제 TOML으로 만들고 고정 테스트 bytes에서 digest를 계산한다. `valid_lock` property는 이 helper의 네 기본 record를 반환한다.
- [ ] 추가 사례: duplicate skill ID, duplicate TOML key, 잘못된 snapshot/file 유형, 누락·초과 file key, 빈/비문자열 ID, malformed TOML, 파일 읽기 실패, hexadecimal 아닌 hash, 대문자 hash 허용과 소문자 정규화를 각각 확인한다.
- [ ] `load_external_snapshots(root)`가 최상위 `version`, `snapshots`만 허용하고, 필수 네 이름 각각 하나 이상의 non-empty snapshot을 가지며, file set이 고정된 해당 스킬 경로와 정확히 일치하는지 구현한다.
- [ ] digest를 64자리 hexadecimal로 확인하고, path는 비어 있지 않은 상대 POSIX 문자열·`..` 없음·backslash 없음·정규화 동일성을 모두 검사한다.
- [ ] 같은 test 명령으로 parser 테스트가 통과하는지 확인한다.

### Step 3: 모든 후보의 파일 hash 및 경계 검증

- [ ] 다음 테스트를 추가해 후보 전체를 검사하지 않거나 snapshot 파일을 혼합하는 현재 동작을 실패시킨다.

```python
def test_every_existing_candidate_must_match(self):
    self.install_candidates(self.codex_home / "skills")
    self.install_candidates(self.user_home / ".agents" / "skills")
    changed = self.user_home / ".agents" / "skills" / "writing-plans" / "SKILL.md"
    changed.write_bytes(b"unreviewed bytes")

    with self.assertRaises(installer.InstallerError) as caught:
        installer.validate_external_skills(
            self.codex_home, self.user_home, self.snapshots
        )

    self.assertIn("writing-plans", str(caught.exception))
    self.assertIn(str(changed), str(caught.exception))
    self.assertIn("호환성이 확인되지 않음", str(caught.exception))

def test_files_from_different_snapshots_cannot_be_mixed(self):
    records = [record for record in self.records if record[0] != "brainstorming"]
    records.extend([
        ("brainstorming", "test-a", b"A"),
        ("brainstorming", "test-b", b"B"),
    ])
    self.write_lock(render_lock(records))
    self.install_candidates(self.codex_home / "skills", b"A")
    mixed = self.codex_home / "skills" / "brainstorming" / "visual-companion.md"
    mixed.write_bytes(b"B:visual-companion.md")

    with self.assertRaises(installer.InstallerError):
        installer.validate_external_skills(
            self.codex_home, self.user_home, self.snapshots
        )

def test_either_supported_location_can_supply_all_skills(self):
    codex_base = self.codex_home / "skills"
    user_base = self.user_home / ".agents" / "skills"
    for base in (codex_base, user_base):
        with self.subTest(base=base):
            self.install_candidates(base)
            self.validate()
            shutil.rmtree(base)

def test_two_complete_approved_snapshots_can_both_exist(self):
    records = [
        (skill, snapshot_id, variant)
        for skill in FILES
        for snapshot_id, variant in (("test-a", b"A"), ("test-b", b"B"))
    ]
    self.write_lock(render_lock(records))
    self.install_candidates(self.codex_home / "skills", b"A")
    self.install_candidates(self.user_home / ".agents" / "skills", b"B")
    self.validate()

def test_same_resolved_candidate_root_is_hashed_once(self):
    user_base = self.user_home / ".agents" / "skills"
    self.install_candidates(user_base)
    codex_base = self.codex_home / "skills"
    codex_base.mkdir(parents=True)
    for skill in FILES:
        (codex_base / skill).symlink_to(user_base / skill, target_is_directory=True)

    expected_hashes = sum(len(paths) for paths in FILES.values())
    with patch.object(installer.hashlib, "sha256", wraps=hashlib.sha256) as digest:
        self.validate()
    self.assertEqual(digest.call_count, expected_hashes)

def test_additional_file_does_not_change_snapshot_result(self):
    base = self.codex_home / "skills"
    self.install_candidates(base)
    extra = base / "brainstorming" / "extra.txt"
    extra.write_bytes(b"not in the fixed required file set")
    self.validate()

def test_missing_required_skill_or_file_is_rejected(self):
    base = self.codex_home / "skills"
    for skill in FILES:
        if skill != "using-git-worktrees":
            write_candidate(base, skill)
    with self.assertRaises(installer.InstallerError) as caught:
        self.validate()
    self.assertIn("using-git-worktrees", str(caught.exception))

def test_parent_symlink_to_valid_skill_root_is_allowed(self):
    backing = self.base / "backing" / "skills"
    self.install_candidates(backing)
    codex_home = self.base / "alias-home"
    codex_home.mkdir()
    (codex_home / "skills").symlink_to(backing, target_is_directory=True)
    self.assertIsNone(
        installer.validate_external_skills(codex_home, self.user_home, self.snapshots)
    )

def test_dangling_and_cyclic_candidate_roots_are_rejected(self):
    base = self.codex_home / "skills"
    base.mkdir(parents=True)
    dangling = base / "brainstorming"
    dangling.symlink_to(self.base / "missing-skill", target_is_directory=True)
    with self.assertRaises(installer.InstallerError):
        self.validate()

    dangling.unlink()
    cycle_a, cycle_b = self.base / "cycle-a", self.base / "cycle-b"
    cycle_a.symlink_to(cycle_b, target_is_directory=True)
    cycle_b.symlink_to(cycle_a, target_is_directory=True)
    dangling.symlink_to(cycle_a, target_is_directory=True)
    with self.assertRaises(installer.InstallerError):
        self.validate()

def test_required_file_symlink_must_resolve_inside_candidate_root(self):
    self.install_candidates(self.codex_home / "skills")
    root = self.codex_home / "skills" / "writing-plans"
    required = root / "SKILL.md"
    actual = root / "actual.md"
    required.rename(actual)
    required.symlink_to(actual.name)
    self.validate()

    outside = self.base / "outside.md"
    outside.write_bytes(b"A:SKILL.md")
    required.unlink()
    required.symlink_to(outside)
    with self.assertRaises(installer.InstallerError):
        self.validate()

def test_special_file_and_read_error_are_rejected_without_blocking(self):
    self.install_candidates(self.codex_home / "skills")
    required = self.codex_home / "skills" / "writing-plans" / "SKILL.md"
    required.unlink()
    os.mkfifo(required)
    with self.assertRaises(installer.InstallerError):
        self.validate()

    required.unlink()
    required.write_bytes(b"A:SKILL.md")
    real_read_bytes = Path.read_bytes
    def fail_one_read(path):
        if path == required:
            raise PermissionError("fixture denied")
        return real_read_bytes(path)
    with patch.object(Path, "read_bytes", fail_one_read):
        with self.assertRaises(installer.InstallerError):
            self.validate()
```

- [ ] `install_candidates`는 `REQUIRED_EXTERNAL_FILES`를 사용해 임시 skill root와 원시 bytes를 만들고, lock fixture hash도 같은 bytes에서 만든다.
- [ ] 다음 표의 사례를 각각 별도 테스트로 고정한다.

| 조건 | 기대 |
|---|---|
| Codex 위치만 유효 / `.agents` 위치만 유효 / 두 위치 모두 유효 | 통과 |
| 둘 다 없음 / 하나의 필수 skill 또는 file 없음 | 실패, skill·절대 후보 경로·상대 파일 표시 |
| 중복 후보 중 하나만 mismatch·읽기 실패 | 실패 |
| 고유 후보 둘이 각각 다른 승인 snapshot 전체와 일치 | 통과 |
| 두 경로가 같은 실제 root를 가리킴 | 통과, 같은 파일을 중복 읽지 않음 |
| 정상 root symlink / 정상 상위 디렉터리 alias | 내부 파일이 맞으면 통과 |
| dangling root·cycle·root가 일반 파일 | 실패 |
| 필수 파일이 root 밖 symlink·디렉터리·FIFO | 읽기 전에 실패 |
| 필수 파일 symlink가 root 안의 일반 파일로 해석됨 | 통과 |
| 추가 일반 파일 또는 외부 `.DS_Store` | 판정에서 무시 |
| 공백·줄바꿈 등 raw bytes 변경 | mismatch |
| file read가 `PermissionError`를 반환 | 실패, 다른 후보를 통과 조건으로 사용하지 않음 |
| snapshot 실패 진단 | skill/path/reason 표시, 외부 파일 내용 미출력 |

- [ ] `validate_external_skills(home, user_home, snapshots)`를 구현한다. 두 지원 root만 찾고, 원래 경로별 존재/오류를 구분하며 strict resolution으로 실제 root를 비교한다.
- [ ] 같은 resolved root는 한 번만 검증한다. 서로 다른 root는 모든 후보를 검사하고 그중 미확인·잘못된 후보가 있으면 실패한다.
- [ ] lock file 목록의 각 경로는 resolved root 내부인지 확인한다. 최종 항목이 일반 파일인지 확인한 후 raw bytes의 SHA-256을 계산한다.
- [ ] 한 후보의 모든 필수 파일이 하나의 snapshot 전체와 일치해야 한다. 서로 다른 snapshot 간 혼합은 허용하지 않는다.
- [ ] 사용 가능한 오류는 모아 반환하되 lock 손상 등 안전하게 검사할 수 없는 오류는 그 단계에서 종료한다.
- [ ] `python3 -B -m unittest discover -s tests -p 'test_install.py' -v`가 통과하는지 확인한다.

### Step 4: 세 진입점의 공통 preflight와 무변경 확인

- [ ] 임시 Codex home과 임시 actual user home을 만들고, `Path.home()`과 `CODEX_HOME`을 테스트 범위 안에서만 대체한다.
- [ ] 정상 저장소 payload fixture에서 `main([])`, `main(["--check"])`, `main(["--dry-run"])`이 같은 유효 외부 후보 검사를 수행하는지 테스트한다.
- [ ] 각 세 진입점에 대해 missing, mismatch, 잘못된 lock 중 하나를 넣고 다음 동작 테스트를 먼저 작성한다.

```python
def test_external_preflight_failure_does_not_write(self):
    self.seed_existing_targets()
    before = tree_state(self.codex_home), tree_state(self.user_home)

    for argv in ([], ["--check"], ["--dry-run"]):
        with self.subTest(argv=argv):
            status, output = self.run_main(argv)
            self.assertEqual(status, 2)
            self.assertIn("brainstorming", output)
            self.assertEqual(
                before,
                (tree_state(self.codex_home), tree_state(self.user_home)),
            )
            self.assertFalse(any(self.codex_home.glob("backups/*")))
            self.assertFalse(any(self.codex_home.glob("**/.yunho-harness-*-*")))
```

- [ ] 위 `tree_state`는 상대 경로별 mode, file bytes 또는 symlink target을 기록한다. `run_main`은 fixture payload로 root를 고정하고 `Path.home()`, `CODEX_HOME`, stdout/stderr만 격리하며 실제 manifest·model·profile preflight와 `installer.main(argv)`를 실행한다.
- [ ] 기존 Harness·일곱 profile sentinel을 포함한 경우와 home이 없는 경우를 각각 실행한다.
- [ ] manifest에서 lock digest가 틀린 경우 `load_external_snapshots`가 호출되지 않는지 확인한다.
- [ ] `--check`, `--dry-run`의 유효 경로는 시작 전후 tree가 같아야 한다. 일반 설치의 성공 사례는 임시 Codex home에만 실행하고 결과가 Harness skill 하나와 일곱 profile이며 외부 스킬 bytes·mode가 바뀌지 않는지 확인한다.
- [ ] 기존 Harness/profile 교체 중 하나가 실패하는 상황을 임시 root에서 재현해 이전 bytes 복원, stage cleanup, backup 유지, 외부 skill 불변을 확인한다.
- [ ] `install_plan`의 5개 반환 원소를 4개로 줄이고 `perform_install`의 staging·rollback에서 dependency source, dependency target, dependency 전용 메시지를 제거한다. 기존 Harness/profile backup·rollback은 보존한다.
- [ ] `MANIFEST_REQUIRED_ROOTS`를 `("skill", "agents")`로 바꾸고 `external-skills.toml`을 필수 immutable 파일로 둔다. `staged_root`는 bundle을 요구하지 않아야 한다.
- [ ] `dependency_sources`, dependency enumeration/copy/replace/rollback 호출을 제거하고 테스트가 통과하는지 확인한다.

### Step 5: 실제 lock, 번들 제거, README와 manifest

- [ ] 승인 spec의 11개 경로와 digest로 네 개의 `local-reviewed-2026-10-04` snapshot을 `external-skills.toml`에 작성한다.
- [ ] 테스트가 승인 spec과 lock의 `(skill, id, path, hash)` 전체를 비교하는지 확인한다. 테스트 fixture용 임시 snapshot과 production lock 값은 분리한다.
- [ ] `dependencies/`의 tracked 파일과 `.DS_Store`를 포함한 디렉터리를 제거한다. 외부 설치 디렉터리는 접근·수정하지 않는다.
- [ ] README를 갱신한다. 네 필수 skill, 두 검색 위치, 모든 후보 검사, 지정 11개 파일과 추가 파일 무시, symlink 경계, 세 실행 옵션의 사전 검사, 실패 전 무변경, 외부 스킬 미수정, snapshot 갱신 절차와 검사 한계를 설명한다.
- [ ] manifest에서 모든 `dependencies/` entry를 제거하고 변경된 `install.py`, README, lock 및 기존 변경 불가 payload digest를 반영한다. `skill/models.toml`은 계속 제외한다. 테스트/spec/plan 파일도 manifest 대상이 아니다.
- [ ] `python3 -B -m unittest discover -s tests -p 'test_install.py' -v`를 실행해 통과시킨다.

### Step 6: Task 완료 확인과 반환

- [ ] 전체 테스트 suite를 실행한다.

```sh
python3 -B -m unittest discover -s tests -v
```

- [ ] 외부 설치본이 현재 승인 snapshot이면 다음 읽기 전용 검사를 실행한다. 사용자의 Codex home에 일반 설치를 실행하지 않는다.

```sh
cd /Users/yunho/Desktop/project/yunho-harness
python3 install.py --check
python3 install.py --dry-run
git diff --check
git status --short
rg -n 'dependency_sources|dependencies_to_install|dependency_stages|Would install dependency|Keeping existing dependency' install.py
rg -n '^.*  dependencies/' MANIFEST.sha256
```

마지막 두 검색은 결과가 없어야 한다. Installer는 실제 사용자 환경에서 `--check`와 `--dry-run`만 실행하며, 정상 설치는 임시 Codex home fixture 테스트에서만 확인한다.

- [ ] 결과에는 변경 경로, 명령별 종료 코드, 테스트 수, snapshot 검사 결과, no-write 비교, manifest 범위와 남은 한계를 적는다. 테스트를 실제로 수행한 경우에만 TDD·test pass를 주장한다.

## QA와 독립 Reviewer

이 설치 동작 및 dependency 정책 변경은 significant 위험이다. Lead는 Coder 완료 후 아래 순서를 적용한다.

### QA

- [ ] QA는 실제 테스트 suite와 installer read-only preflight를 독립 수행하고 파일을 수정하지 않는다.
- [ ] 네 스킬 각각, 두 후보 위치, 중복·alias 처리, malformed lock/manifest, no-write 실패, transaction rollback 및 dependency 없는 payload 검사를 확인한다.
- [ ] 실제 명령·exit code·파일 상태 비교를 보고한다. Coder의 결과만으로 QA 통과를 주장하지 않는다.

### 독립 Reviewer

- [ ] QA 이후, 구현에 참여하지 않은 Reviewer가 승인 spec과 전체 최종 diff를 검토한다.
- [ ] lock schema, snapshot 경계, candidate enumeration, symlink containment, hash comparison, 실패 전 write 여부, dependency transaction 제거, manifest/README 일치 및 기존 rollback 보존을 집중 검토한다.
- [ ] Reviewer는 QA를 대신 수행하거나 파일을 수정하지 않는다. 각 actionable finding은 Lead가 Coder에게 전달한다.
- [ ] 행동 수정 후 QA는 영향받은 확인을 반복한다. Reviewer는 무효화된 부분과 새 위험을 다시 확인한다.

## Lead acceptance와 선택적 focused commit

- [ ] Lead는 spec 수락 기준 1–11, 전체 범위, QA·review 완료, 발견 사항 disposition, 기존 payload 보존 및 검증 한계를 확인한다.
- [ ] Lead가 이 변경 단위를 수락한 뒤, 이전에 허용한 조건에 따라 focused commit을 선택할 수 있다. 미해결 필수 확인이나 수락 기준이 있으면 커밋하지 않는다.
- [ ] Stage 전 기존 staged 상태를 확인한다. 무관한 변경은 섞거나 임의로 해제하지 않는다. 승인된 변경 파일과 새 spec/plan만 명시적으로 stage한다.
- [ ] Staged diff가 수락 범위와 정확히 일치하는지 확인하고 다음 형식의 한국어 Conventional Commit을 사용한다.

```text
feat(installer): 외부 스킬 snapshot 사전 검사 전환
```

- [ ] commit ID와 최종 worktree 상태를 확인한다. Push, 일반 사용자 설치, 전역 설정 변경은 수행하지 않는다.

## 자체 검토와 남은 결정

- **Spec coverage:** Bundle 제거, 필수 4 skills/11 files, 두 후보, alias/symlink 경계, lock, 공통 preflight, no-write, transaction 유지, README/manifest가 Task 1에 포함됐다.
- **Review focus:** 다섯 위험 입력을 해당 테스트와 Reviewer checklist에 직접 연결했다.
- **Test-first:** 기존 bundle 동작 때문에 새 API 부재를 AttributeError로 확인하지 않는다. 첫 회귀 테스트가 현 동작의 부적절한 통과를 assertion failure로 보여 준다.
- **Type consistency:** `SnapshotMap`, parser·validator 시그니처, `install_plan` 반환 구조를 설치 호출부와 일치시켰다.
- **Scope:** 새 외부 검색 위치, bypass, 자동 설치, 설치된 Harness 정책 변경은 포함하지 않는다.
- **Evidence limits:** Hash 일치, 표준 라이브러리 테스트, `--check`는 runtime 전체 동작이나 검사 이후 외부 파일 불변성을 증명하지 않는다.
- **Approval:** 이 계획 자체와 실행 절차는 승인 전이다. 테스트 작성·실행 허가는 계획 승인과 분리해 확인한다. 현재까지 테스트·구현은 하지 않았다.

## Planner 구체화 통합본: 단계별 코드와 순서

이 절은 위 Step 1–4의 설명 중심 항목을 다음 구체 코드로 보완한다. 중복되거나 순서가 다른 경우 이 절의 단계별 순서를 적용한다. 코드 블록은 계획 자료이며 production/test 파일에 아직 작성하지 않았다. 테스트 허가 및 계획 승인은 pending이다.

### A. 첫 회귀 RED → 최소 GREEN → parser RED/GREEN → validator RED/GREEN

- [ ] 기존 fixture와 `test_missing_external_skill_fails_install_plan`만 작성하고 해당 테스트가 `InstallerError not raised`로 실패하는지 확인한다.
- [ ] 첫 RED 후 다음 최소 API를 추가하고 기존 `install_plan`의 dependency 열거 앞에서 두 API를 호출한다. 이 단계는 기존 5개 반환 구조를 유지한다.

```python
SnapshotMap = dict[str, dict[str, dict[str, str]]]

def load_external_snapshots(root: Path) -> SnapshotMap:
    return {}

def validate_external_skills(home: Path, user_home: Path, snapshots: SnapshotMap) -> None:
    raise InstallerError(
        f"brainstorming: 후보 {absolute(home / 'skills' / 'brainstorming')}: "
        "필수 외부 스킬 누락"
    )

# install_plan 내부, 기존 dependency 처리 앞:
snapshots = load_external_snapshots(root)
validate_external_skills(home, absolute(Path.home()), snapshots)
```

- [ ] 첫 회귀가 GREEN인지 확인한다. 정상 map 반환과 schema 오류 거부 테스트를 작성하면 최소 parser의 `{}` 반환 때문에 assertion failure가 난다. API 부재를 RED로 사용하지 않는다.
- [ ] B의 parser로 교체하고 parser 테스트·첫 회귀를 GREEN으로 만든다.
- [ ] Step 3의 정상 후보·오류 후보 테스트를 작성한다. 최소 validator가 정상 후보도 거부하므로 정상 후보 테스트가 실패한다.
- [ ] C의 validator로 교체해 후보 테스트와 앞선 테스트를 GREEN으로 만든다.
- [ ] D의 정상 `--check` integration 테스트를 먼저 작성한다. 실제 `staged_root`가 bundle 없는 fixture를 거부하므로 기대 status `0` assertion이 실패한다. E의 통합 변경 뒤 GREEN으로 만든다.

테스트 권한 확인 후 단계별 명령:

```sh
python3 -B -m unittest discover -s tests -p 'test_install.py' -v -k test_missing_external_skill_fails_install_plan
python3 -B -m unittest discover -s tests -p 'test_install.py' -v -k test_lock
python3 -B -m unittest discover -s tests -p 'test_install.py' -v
```

### B. Parser 구현과 추가 테스트

`install.py`에 `import tomllib`을 추가한다. `REQUIRED_EXTERNAL_FILES`는 앞선 테스트 `FILES`와 같은 4개 tuple을 production 코드에 직접 정의한다. 테스트 모듈을 production에서 import하지 않는다. 다음 코드가 최소 parser를 교체한다.

```python
REQUIRED_EXTERNAL_FILES = {
    "brainstorming": (
        "SKILL.md", "visual-companion.md", "scripts/start-server.sh",
        "scripts/stop-server.sh", "scripts/server.cjs", "scripts/helper.js",
        "scripts/frame-template.html",
    ),
    "writing-plans": ("SKILL.md",),
    "test-driven-development": ("SKILL.md", "writing-good-tests.md"),
    "using-git-worktrees": ("SKILL.md",),
}
SnapshotMap = dict[str, dict[str, dict[str, str]]]
EXTERNAL_DIGEST = re.compile(r"[0-9a-fA-F]{64}")

def load_external_snapshots(root: Path) -> SnapshotMap:
    lock = root / "external-skills.toml"
    require_regular_file(lock)
    try:
        document = tomllib.loads(lock.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, tomllib.TOMLDecodeError) as exc:
        raise InstallerError(f"cannot read external skill lock {lock}: {exc}") from exc

    def invalid(reason: str) -> None:
        raise InstallerError(f"invalid external skill lock {lock}: {reason}")

    if set(document) != {"version", "snapshots"}:
        invalid("top-level keys must be exactly version and snapshots")
    if type(document["version"]) is not int or document["version"] != 1:
        invalid("version must be integer 1")
    entries = document["snapshots"]
    if not isinstance(entries, list) or not entries:
        invalid("snapshots must be a nonempty array of tables")
    snapshots: SnapshotMap = {skill: {} for skill in REQUIRED_EXTERNAL_FILES}
    for index, entry in enumerate(entries, start=1):
        label = f"snapshot {index}"
        if not isinstance(entry, dict) or set(entry) != {"skill", "id", "files"}:
            invalid(f"{label} must have exactly skill, id and files")
        skill, snapshot_id, files = entry["skill"], entry["id"], entry["files"]
        if not isinstance(skill, str) or skill not in REQUIRED_EXTERNAL_FILES:
            invalid(f"{label} has an unknown skill")
        if not isinstance(snapshot_id, str) or not snapshot_id.strip():
            invalid(f"{label} id must be a nonempty string")
        if snapshot_id in snapshots[skill]:
            invalid(f"{skill} has duplicate snapshot id {snapshot_id!r}")
        if not isinstance(files, dict) or not files:
            invalid(f"{label} files must be a nonempty mapping")
        checked: dict[str, str] = {}
        for raw_path, digest in files.items():
            if (not isinstance(raw_path, str) or not raw_path
                    or "\\" in raw_path or "\x00" in raw_path):
                invalid(f"{label} has an unsafe file path")
            relative = PurePosixPath(raw_path)
            if (relative.is_absolute()
                    or any(part in ("", ".", "..") for part in relative.parts)
                    or relative.as_posix() != raw_path):
                invalid(f"{label} has unsafe file path {raw_path!r}")
            if not isinstance(digest, str) or EXTERNAL_DIGEST.fullmatch(digest) is None:
                invalid(f"{label} has invalid SHA-256 for {raw_path!r}")
            checked[raw_path] = digest.lower()
        if set(checked) != set(REQUIRED_EXTERNAL_FILES[skill]):
            invalid(f"{label} file set does not match required files for {skill}")
        snapshots[skill][snapshot_id] = checked
    missing = [skill for skill, records in snapshots.items() if not records]
    if missing:
        invalid("missing required snapshots: " + ", ".join(missing))
    return snapshots
```

테스트 입력 생성 helper와 추가 import:

```python
import copy
import json
import tomllib

def toml_value(value):
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=True)
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, list):
        return "[" + ", ".join(toml_value(item) for item in value) + "]"
    if isinstance(value, dict):
        return "{ " + ", ".join(
            f"{toml_value(key)} = {toml_value(item)}"
            for key, item in value.items()
        ) + " }"
    raise TypeError(type(value))

def render_document(document):
    return "\n".join(
        f"{toml_value(key)} = {toml_value(value)}"
        for key, value in document.items()
    ) + "\n"
```

다음 각 `def test_...`는 기존 `ExternalSkillPreflightTests` class 안에 추가한다.

```python
def test_lock_returns_exact_normalized_snapshot_map(self):
    expected = {
        skill: {"test-a": {
            relative: hashlib.sha256(b"A:" + relative.encode("utf-8")).hexdigest()
            for relative in paths
        }} for skill, paths in FILES.items()
    }
    self.assertEqual(installer.load_external_snapshots(self.payload), expected)
    self.assertEqual(installer.REQUIRED_EXTERNAL_FILES, FILES)

def test_lock_rejects_wrong_types_and_fields(self):
    original = tomllib.loads(self.valid_lock)
    cases = []
    def changed(label, mutate):
        document = copy.deepcopy(original)
        mutate(document)
        cases.append((label, render_document(document)))
    changed("snapshot-not-table", lambda d: d["snapshots"].__setitem__(0, 1))
    changed("snapshots-not-array", lambda d: d.__setitem__("snapshots", {}))
    changed("entry-extra-field", lambda d: d["snapshots"][0].__setitem__("extra", 1))
    changed("entry-missing-id", lambda d: d["snapshots"][0].pop("id"))
    changed("skill-not-string", lambda d: d["snapshots"][0].__setitem__("skill", 1))
    changed("empty-id", lambda d: d["snapshots"][0].__setitem__("id", ""))
    changed("blank-id", lambda d: d["snapshots"][0].__setitem__("id", " "))
    changed("id-not-string", lambda d: d["snapshots"][0].__setitem__("id", 1))
    changed("files-not-mapping", lambda d: d["snapshots"][0].__setitem__("files", []))
    changed("empty-files", lambda d: d["snapshots"][0].__setitem__("files", {}))
    changed("missing-file", lambda d: d["snapshots"][0]["files"].pop("SKILL.md"))
    for label, path, digest in (
        ("extra-file", "extra.md", "0" * 64),
        ("digest-not-string", "SKILL.md", 1),
        ("digest-wrong-length", "SKILL.md", "a" * 63),
        ("digest-not-hex", "SKILL.md", "g" * 64),
    ):
        changed(label, lambda d, p=path, h=digest: d["snapshots"][0]["files"].__setitem__(p, h))
    for label, text in cases:
        with self.subTest(label=label):
            self.write_lock(text)
            with self.assertRaises(installer.InstallerError):
                installer.load_external_snapshots(self.payload)

def test_lock_uppercase_digest_is_normalized(self):
    document = tomllib.loads(self.valid_lock)
    for entry in document["snapshots"]:
        entry["files"] = {path: digest.upper() for path, digest in entry["files"].items()}
    self.write_lock(render_document(document))
    result = installer.load_external_snapshots(self.payload)
    self.assertTrue(all(digest == digest.lower()
        for records in result.values() for files in records.values()
        for digest in files.values()))

def test_lock_read_failure_is_installer_error(self):
    original = Path.read_text
    def fail_lock(path, *args, **kwargs):
        if path == self.lock_path:
            raise PermissionError("fixture denied")
        return original(path, *args, **kwargs)
    with patch.object(Path, "read_text", fail_lock):
        with self.assertRaises(installer.InstallerError):
            installer.load_external_snapshots(self.payload)

def test_lock_rejects_noncanonical_paths_after_toml_parse(self):
    for bad_path in ("/SKILL.md", "./SKILL.md", "../SKILL.md", "scripts\\SKILL.md",
                     "scripts//SKILL.md", "scripts/./SKILL.md", "SKILL.md/", ""):
        with self.subTest(path=bad_path):
            document = tomllib.loads(self.valid_lock)
            files = document["snapshots"][0]["files"]
            files[bad_path] = files.pop("SKILL.md")
            self.write_lock(render_document(document))
            with self.assertRaises(installer.InstallerError):
                installer.load_external_snapshots(self.payload)
```

기존 malformed TOML·중복 key·중복 ID·불완전 skill 테스트는 유지한다. 기존 backslash 치환은 TOML 오류를 함께 유발하므로 위 별도 테스트는 parsing에 성공한 backslash 경로를 거부하는지 확인한다.

### C. Validator 구현과 추가 사례

```python
def _external_candidate_root(candidate: Path) -> Path | None:
    """Only ordinary absence returns None; aliases must resolve to directories."""
    candidate = absolute(candidate)
    current = Path(candidate.anchor)
    for component in candidate.parts[1:]:
        current /= component
        try:
            mode = current.lstat().st_mode
        except FileNotFoundError:
            return None
        if stat.S_ISLNK(mode):
            resolved = current.resolve(strict=True)
            resolved_mode = resolved.stat().st_mode
            if current != candidate and not stat.S_ISDIR(resolved_mode):
                raise InstallerError(f"parent is not a directory: {current}")
        elif current != candidate and not stat.S_ISDIR(mode):
            raise InstallerError(f"parent is not a directory: {current}")
    resolved = candidate.resolve(strict=True)
    if not stat.S_ISDIR(resolved.stat().st_mode):
        raise InstallerError(f"candidate root is not a directory: {resolved}")
    return resolved

def validate_external_skills(home: Path, user_home: Path, snapshots: SnapshotMap) -> None:
    errors: list[str] = []
    bases = (absolute(home / "skills"), absolute(user_home / ".agents" / "skills"))
    for skill, required_files in REQUIRED_EXTERNAL_FILES.items():
        seen: set[Path] = set()
        found = False
        for base in bases:
            candidate = base / skill
            prefix = f"{skill}: 후보 {candidate}"
            try:
                resolved = _external_candidate_root(candidate)
            except (InstallerError, OSError, RuntimeError, ValueError) as exc:
                found = True
                errors.append(f"{prefix}: root 해석 오류: {exc}")
                continue
            if resolved is None:
                continue
            found = True
            if resolved in seen:
                continue
            seen.add(resolved)
            if resolved != candidate:
                prefix += f" (실제 {resolved})"
            digests: dict[str, str] = {}
            candidate_errors: list[str] = []
            for relative in required_files:
                original = resolved.joinpath(*PurePosixPath(relative).parts)
                try:
                    actual = original.resolve(strict=True)
                    if not actual.is_relative_to(resolved):
                        raise InstallerError(f"root 외부 참조: {relative} -> {actual}")
                    if not stat.S_ISREG(actual.stat().st_mode):
                        raise InstallerError(f"일반 파일이 아님: {relative} -> {actual}")
                    digests[relative] = hashlib.sha256(actual.read_bytes()).hexdigest()
                except (InstallerError, OSError, RuntimeError, ValueError) as exc:
                    candidate_errors.append(f"{prefix}: 파일 {relative}: {exc}")
            if candidate_errors:
                errors.extend(candidate_errors)
                continue
            approved = snapshots[skill]
            if not any(digests == files for files in approved.values()):
                comparisons = []
                for snapshot_id, files in approved.items():
                    mismatches = [path for path in required_files if digests[path] != files[path]]
                    comparisons.append(f"{snapshot_id}: " + ", ".join(mismatches))
                errors.append(f"{prefix}: 호환성이 확인되지 않음; " + "; ".join(comparisons))
        if not found:
            candidates = ", ".join(str(base / skill) for base in bases)
            errors.append(f"{skill}: 필수 외부 스킬 누락; 후보 {candidates}")
    if errors:
        raise InstallerError("\n".join(errors))
```

기존 Step 3의 candidate·alias·혼합·FIFO·read error 테스트를 유지하고 다음 테스트를 class에 추가한다.

```python
def test_candidate_root_regular_file_is_rejected(self):
    base = self.codex_home / "skills"
    base.mkdir(parents=True)
    candidate = base / "brainstorming"
    candidate.write_bytes(b"not a directory")
    with self.assertRaises(installer.InstallerError) as caught:
        self.validate()
    self.assertIn(str(candidate), str(caught.exception))

def test_required_directory_is_rejected(self):
    self.install_candidates(self.codex_home / "skills")
    required = self.codex_home / "skills" / "writing-plans" / "SKILL.md"
    required.unlink()
    required.mkdir()
    with self.assertRaises(installer.InstallerError) as caught:
        self.validate()
    self.assertIn("SKILL.md", str(caught.exception))

def test_dangling_parent_alias_is_not_silent_absence(self):
    self.codex_home.mkdir()
    alias = self.codex_home / "skills"
    alias.symlink_to(self.base / "missing-parent", target_is_directory=True)
    self.install_candidates(self.user_home / ".agents" / "skills")
    with self.assertRaises(installer.InstallerError) as caught:
        self.validate()
    self.assertIn(str(alias), str(caught.exception))

def test_raw_byte_changes_are_rejected(self):
    self.install_candidates(self.codex_home / "skills")
    required = self.codex_home / "skills" / "writing-plans" / "SKILL.md"
    for content in (b"A:SKILL.md\n", b" A:SKILL.md", b"A:SKILL.md\r\n"):
        with self.subTest(content=content):
            required.write_bytes(content)
            with self.assertRaises(installer.InstallerError):
                self.validate()

def test_errors_for_multiple_skills_are_reported_without_file_contents(self):
    self.install_candidates(self.codex_home / "skills")
    secret = b"fixture-content-must-not-be-printed"
    for skill in ("writing-plans", "using-git-worktrees"):
        (self.codex_home / "skills" / skill / "SKILL.md").write_bytes(secret)
    with self.assertRaises(installer.InstallerError) as caught:
        self.validate()
    message = str(caught.exception)
    self.assertIn("writing-plans", message)
    self.assertIn("using-git-worktrees", message)
    self.assertNotIn(secret.decode(), message)

def test_second_candidate_read_failure_is_rejected(self):
    self.install_candidates(self.codex_home / "skills")
    self.install_candidates(self.user_home / ".agents" / "skills")
    denied = (self.user_home / ".agents" / "skills" / "writing-plans" / "SKILL.md").resolve()
    original = Path.read_bytes
    def fail_one(path):
        if path == denied:
            raise PermissionError("fixture denied")
        return original(path)
    with patch.object(Path, "read_bytes", fail_one):
        with self.assertRaises(installer.InstallerError) as caught:
            self.validate()
    self.assertIn(str(denied), str(caught.exception))
```

### D. Integration helper와 세 진입점·transaction 테스트

앞의 `run_main`은 실제 `staged_root`를 사용하도록 `installer.__file__`만 fixture 경로로 대체했다. 따라서 dependency 없는 payload 검사도 통과해야 하며, 공통 preflight를 mock으로 가리지 않는다. 다음 helper를 추가한다.

```python
def refresh_manifest(root):
    names = {"install.py", "install.command", "README.md", "external-skills.toml"}
    for directory in ("skill", "agents"):
        for path in (root / directory).rglob("*"):
            if path.is_file() and path.name != ".DS_Store":
                name = path.relative_to(root).as_posix()
                if name != "skill/models.toml":
                    names.add(name)
    text = "\n".join(
        f"{hashlib.sha256((root / name).read_bytes()).hexdigest()}  {name}"
        for name in sorted(names)
    ) + "\n"
    (root / "MANIFEST.sha256").write_text(text, encoding="utf-8")

# 다음 세 helper는 test class의 method다.
def reset_homes(self):
    for root in (self.codex_home, self.user_home):
        if root.exists():
            shutil.rmtree(root)

def external_state(self):
    return {str(base / skill): tree_state(base / skill)
        for base in (self.codex_home / "skills", self.user_home / ".agents" / "skills")
        for skill in FILES}

def assert_no_stages(self):
    self.assertEqual(list(self.codex_home.glob("**/.yunho-harness-*-*")), [])
```

다음 테스트를 class에 추가한다. malformed lock은 manifest를 재생성해 parser의 거부를 확인하고, manifest 손상은 parser보다 앞서 거부되는지 별도로 확인한다.

```python
def test_valid_check_accepts_payload_without_dependencies(self):
    self.install_candidates(self.user_home / ".agents" / "skills")
    before = tree_state(self.codex_home), tree_state(self.user_home)
    status, output = self.run_main(["--check"])
    self.assertEqual(status, 0, output)
    self.assertEqual((tree_state(self.codex_home), tree_state(self.user_home)), before)
    self.assertFalse((self.payload / "dependencies").exists())

def test_valid_dry_run_does_not_write(self):
    self.install_candidates(self.user_home / ".agents" / "skills")
    self.seed_existing_targets()
    before = tree_state(self.codex_home), tree_state(self.user_home)
    status, output = self.run_main(["--dry-run"])
    self.assertEqual(status, 0, output)
    self.assertEqual((tree_state(self.codex_home), tree_state(self.user_home)), before)
    self.assertNotIn("dependency skill", output)
    self.assert_no_stages()

def test_external_failure_does_not_write_for_all_entrypoints(self):
    for existing in (False, True):
        for failure in ("missing", "mismatch", "malformed-lock"):
            for argv in ([], ["--check"], ["--dry-run"]):
                with self.subTest(existing=existing, failure=failure, argv=argv):
                    self.reset_homes()
                    self.write_lock(self.valid_lock)
                    if existing:
                        self.seed_existing_targets()
                    if failure != "missing":
                        self.install_candidates(self.user_home / ".agents" / "skills")
                    if failure == "mismatch":
                        changed = self.user_home / ".agents" / "skills" / "brainstorming" / "SKILL.md"
                        changed.write_bytes(b"unreviewed")
                    if failure == "malformed-lock":
                        self.write_lock("version = [\n")
                    refresh_manifest(self.payload)
                    before = tree_state(self.codex_home), tree_state(self.user_home)
                    status, output = self.run_main(argv)
                    self.assertEqual(status, 2, output)
                    if failure != "malformed-lock":
                        self.assertIn("brainstorming", output)
                    self.assertEqual((tree_state(self.codex_home), tree_state(self.user_home)), before)
                    self.assertEqual(list(self.codex_home.glob("backups/*")), [])
                    self.assert_no_stages()

def test_manifest_failure_precedes_lock_parsing(self):
    self.install_candidates(self.user_home / ".agents" / "skills")
    self.write_lock(self.valid_lock + "\n")
    before = tree_state(self.codex_home), tree_state(self.user_home)
    with patch.object(installer, "load_external_snapshots",
                      side_effect=AssertionError("parser must not run")) as parser:
        status, output = self.run_main([])
    self.assertEqual(status, 2, output)
    self.assertIn("SHA-256 mismatch", output)
    parser.assert_not_called()
    self.assertEqual((tree_state(self.codex_home), tree_state(self.user_home)), before)

def test_install_writes_only_harness_and_seven_profiles(self):
    self.install_candidates(self.user_home / ".agents" / "skills")
    external_before = self.external_state()
    user_before = tree_state(self.user_home)
    model = installer.load_model_module(self.payload)
    expected_profiles = installer.preflight_profiles(self.payload, model)
    status, output = self.run_main([])
    self.assertEqual(status, 0, output)
    self.assertEqual({path.name for path in (self.codex_home / "skills").iterdir()},
                     {installer.INSTALL_NAME})
    self.assertEqual({path.name for path in (self.codex_home / "agents").iterdir()},
                     set(installer.PROFILE_FILES))
    harness = self.codex_home / "skills" / installer.INSTALL_NAME
    self.assertEqual(tree_state(harness), tree_state(self.payload / "skill"))
    for filename, expected in expected_profiles.items():
        target = self.codex_home / "agents" / filename
        source = self.payload / "agents" / filename
        self.assertEqual(target.read_bytes(), expected)
        self.assertEqual(stat.S_IMODE(target.stat().st_mode), stat.S_IMODE(source.stat().st_mode))
    self.assertEqual(self.external_state(), external_before)
    self.assertEqual(tree_state(self.user_home), user_before)
    self.assertEqual(len(list(self.codex_home.glob("backups/*"))), 1)
    self.assert_no_stages()

def test_replace_failure_restores_targets_and_keeps_backup(self):
    self.install_candidates(self.user_home / ".agents" / "skills")
    self.seed_existing_targets()
    harness = self.codex_home / "skills" / installer.INSTALL_NAME
    agents = self.codex_home / "agents"
    harness_before = tree_state(harness)
    profiles_before = {filename: tree_state(agents / filename) for filename in installer.PROFILE_FILES}
    external_before = self.external_state()
    user_before = tree_state(self.user_home)
    failed_name = installer.PROFILE_FILES[1]
    real_replace = os.replace
    injected = False
    def fail_second_profile(source, target, *args, **kwargs):
        nonlocal injected
        source, target = Path(source), Path(target)
        if (not injected and target == agents / failed_name and source.name == failed_name
                and source.parent.name.startswith(".yunho-harness-profiles-")):
            injected = True
            raise OSError("fixture replacement failure")
        return real_replace(source, target, *args, **kwargs)
    with patch.object(installer.os, "replace", fail_second_profile):
        status, output = self.run_main([])
    self.assertTrue(injected)
    self.assertEqual(status, 2, output)
    self.assertIn("fixture replacement failure", output)
    self.assertEqual(tree_state(harness), harness_before)
    for filename, before in profiles_before.items():
        self.assertEqual(tree_state(agents / filename), before)
    self.assertEqual(self.external_state(), external_before)
    self.assertEqual(tree_state(self.user_home), user_before)
    backups = list(self.codex_home.glob("backups/*"))
    self.assertEqual(len(backups), 1)
    backup = backups[0]
    self.assertEqual(tree_state(backup / "skills" / installer.INSTALL_NAME), harness_before)
    for filename, before in profiles_before.items():
        self.assertEqual(tree_state(backup / "agents" / filename), before)
    self.assert_no_stages()
```

`tree_state`의 root 항목은 일반 파일 root의 bytes도 기록하도록 Lead가 보완했다. 기존 helper가 mode만 기록하면 profile 복원 실패를 놓칠 수 있었다. 경로·type/mode·bytes·symlink target을 비교하며 atime 보존은 주장하지 않는다.

### E. Dependency 제거의 정확한 편집 경계

Integration RED를 확인한 뒤 다음 계약과 편집을 적용한다.

```python
MANIFEST_REQUIRED_ROOTS = ("skill", "agents")
MANIFEST_REQUIRED_FILES = ("install.py", "install.command", "README.md", "external-skills.toml")
```

- [ ] `dependency_sources` 함수 전체를 삭제한다.
- [ ] `staged_root`에서 `selected_tree_files(root / "dependencies")`와 `dependency_sources(root)`만 삭제하며 나머지 payload 검사는 유지한다.
- [ ] `install_plan`의 기존 `user_skills` 선언부터 dependency 열거 block까지 아래 코드로 교체하고 반환 annotation을 네 항목 tuple로 줄인다. A에서 먼저 삽입한 호출은 중복되지 않게 한 번만 둔다.

```python
snapshots = load_external_snapshots(root)
validate_external_skills(home, absolute(Path.home()), snapshots)
return skills_dir, agents_dir, backups_dir, profile_targets
```

- [ ] `perform_install`의 첫 줄과 dependency 전용 block을 변경한다.

```python
skills_dir, agents_dir, backups_dir, profile_targets = install_plan(root, home)
```

- [ ] dry-run의 dependency 출력 loop, `dependency_stages` 선언·staging block, profile replacement 뒤 dependency replacement loop를 삭제한다.
- [ ] Harness·profile action 기록, `rollback`, backup, stage cleanup은 보존한다.
- [ ] D와 기존 Step 3–4 테스트를 GREEN으로 확인한다. Step 5의 실제 lock·README·manifest·bundle 제거를 완료하고 전체 suite를 실행한다.

### 통합 자체 검토

- **Spec coverage:** Step 1–6 및 A–E가 수락 기준 1–11을 구현한다. 초기 11개 digest·snapshot ID는 spec 그대로 사용한다.
- **순서:** 기존 행동 assertion RED 이후 API가 존재하는 상태에서 parser 정상 반환/schema assertion과 validator 정상 후보 실패를 관찰한다. integration RED는 dependency 없는 실제 payload preflight 실패다.
- **Helper:** 기존 공통 fixture 외 `_external_candidate_root`, `toml_value`, `render_document`, `refresh_manifest`, `reset_homes`, `external_state`, `assert_no_stages`를 정의했다. 반환값과 실제 호출부는 네 항목으로 일치한다.
- **검사 정확성:** malformed lock은 manifest 재생성 뒤 parser에서 실패해야 한다. 손상 manifest는 parser 전에 실패해야 한다. `staged_root`를 mock하지 않는다.
- **보완:** 일반 파일 root의 bytes 기록을 추가해 profile rollback 검사가 실제 복원을 비교하도록 했다.
- **한계:** 후보 해석·stat·읽기 사이의 외부 변경은 spec의 검사 이후 변경 한계와 함께 남는다. 이 계획은 원자적 파일 접근을 보장하지 않는다.
- **상태:** 계획 자료만 수정했다. 테스트·production code 파일 작성, 테스트 실행, 실제 설치, commit, push는 하지 않았다. 테스트 권한과 이 통합 계획의 승인은 pending이다.
