from __future__ import annotations

import hashlib
import copy
import json
import os
from pathlib import Path
import shutil
import stat
import tempfile
import tomllib
import unittest
from unittest.mock import patch

import install as installer


FILES = {
    "brainstorming": (
        "SKILL.md",
        "visual-companion.md",
        "scripts/start-server.sh",
        "scripts/stop-server.sh",
        "scripts/server.cjs",
        "scripts/helper.js",
        "scripts/frame-template.html",
    ),
    "writing-plans": ("SKILL.md",),
    "test-driven-development": ("SKILL.md", "writing-good-tests.md"),
    "using-git-worktrees": ("SKILL.md",),
}


def render_lock(records: list[tuple[str, str, bytes]]) -> str:
    lines = ["version = 1"]
    for skill, snapshot_id, variant in records:
        lines.extend(("", "[[snapshots]]", f'skill = "{skill}"', f'id = "{snapshot_id}"', "[snapshots.files]"))
        for relative in FILES[skill]:
            content = variant + b":" + relative.encode("utf-8")
            digest = hashlib.sha256(content).hexdigest()
            lines.append(f'"{relative}" = "{digest}"')
    return "\n".join(lines) + "\n"


def toml_value(value: object) -> str:
    if isinstance(value, str):
        return json.dumps(value)
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, list):
        return "[" + ", ".join(toml_value(item) for item in value) + "]"
    return str(value)


def render_document(document: dict[str, object]) -> str:
    lines: list[str] = []
    for key, value in document.items():
        if key != "snapshots":
            lines.append(f"{key} = {toml_value(value)}")
    snapshots = document.get("snapshots")
    if not isinstance(snapshots, list):
        lines.append(f"snapshots = {toml_value(snapshots)}")
        return "\n".join(lines) + "\n"
    for entry in snapshots:
        if not isinstance(entry, dict):
            raise TypeError("snapshot fixture entries must be mappings")
        lines.extend(("", "[[snapshots]]"))
        for key, value in entry.items():
            if key != "files":
                lines.append(f"{key} = {toml_value(value)}")
        files = entry.get("files")
        if isinstance(files, dict):
            lines.extend(("", "[snapshots.files]"))
            for path, digest in files.items():
                lines.append(f"{toml_value(path)} = {toml_value(digest)}")
        elif "files" in entry:
            lines.append(f"files = {toml_value(files)}")
    return "\n".join(lines) + "\n"


def legacy_root(base: Path, records: list[tuple[str, str, bytes]]) -> Path:
    root = base / "legacy-payload"
    for skill in ("brainstorming", "writing-plans"):
        path = root / "dependencies" / skill / "SKILL.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("legacy fixture\n", encoding="utf-8")
    (root / "external-skills.toml").write_text(render_lock(records), encoding="utf-8")
    return root


def write_candidate(base: Path, skill: str, variant: bytes = b"A") -> Path:
    root = base / skill
    for relative in FILES[skill]:
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(variant + b":" + relative.encode("utf-8"))
    return root


def write_candidates(base: Path, variant: bytes = b"A") -> dict[str, Path]:
    return {skill: write_candidate(base, skill, variant) for skill in FILES}


REPO = Path(__file__).resolve().parents[1]


def refresh_manifest(root: Path) -> None:
    names = {"install.py", "install.command", "README.md", "external-skills.toml"}
    for directory in ("skill", "agents"):
        for path in (root / directory).rglob("*"):
            if path.is_file() and path.name != ".DS_Store":
                name = path.relative_to(root).as_posix()
                if name != "skill/models.toml":
                    names.add(name)
    contents = "\n".join(
        f"{hashlib.sha256((root / name).read_bytes()).hexdigest()}  {name}"
        for name in sorted(names)
    ) + "\n"
    (root / "MANIFEST.sha256").write_text(contents, encoding="utf-8")


def installer_payload(base: Path, records: list[tuple[str, str, bytes]]) -> Path:
    root = base / "payload"
    for directory in ("skill", "agents"):
        shutil.copytree(REPO / directory, root / directory, ignore=shutil.ignore_patterns(".DS_Store"))
    for filename in ("install.py", "install.command", "README.md"):
        shutil.copy2(REPO / filename, root / filename)
    (root / "external-skills.toml").write_text(render_lock(records), encoding="utf-8")
    refresh_manifest(root)
    return root


def tree_state(root: Path):
    if not os.path.lexists(root):
        return None
    root_mode = root.lstat().st_mode
    root_value = (
        os.readlink(root)
        if stat.S_ISLNK(root_mode)
        else root.read_bytes()
        if stat.S_ISREG(root_mode)
        else None
    )
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
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(dir="/private/tmp")
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.codex_home = self.base / "codex-home"
        self.user_home = self.base / "user-home"
        self.user_home.mkdir()
        self.records = [(skill, "test-a", b"A") for skill in FILES]
        self.legacy = legacy_root(self.base, self.records)
        self.lock_path = self.legacy / "external-skills.toml"

    @property
    def valid_lock(self) -> str:
        return render_lock(self.records)

    def write_lock(self, document: str) -> None:
        self.lock_path.write_text(document, encoding="utf-8")

    @property
    def snapshots(self) -> installer.SnapshotMap:
        return installer.load_external_snapshots(self.legacy)

    def set_snapshots(self, variants: tuple[tuple[str, bytes], ...]) -> None:
        self.records = [
            (skill, snapshot_id, variant)
            for snapshot_id, variant in variants
            for skill in FILES
        ]
        self.write_lock(render_lock(self.records))

    def install_candidates(self, base: Path, variant: bytes = b"A") -> dict[str, Path]:
        return write_candidates(base, variant)

    def validate(self, snapshots: installer.SnapshotMap | None = None) -> None:
        if snapshots is None:
            snapshots = self.snapshots
        installer.validate_external_skills(self.codex_home, self.user_home, snapshots)

    def assert_candidates_accepted(self) -> None:
        try:
            self.validate()
        except installer.InstallerError as exc:
            self.fail(f"approved external skill candidates were rejected: {exc}")

    def run_main(self, argv: list[str]) -> tuple[int, str]:
        import io
        from contextlib import redirect_stderr, redirect_stdout

        stdout, stderr = io.StringIO(), io.StringIO()
        with (
            patch.object(installer, "__file__", str(self.payload / "install.py")),
            patch.object(Path, "home", return_value=self.user_home),
            patch.dict(os.environ, {"CODEX_HOME": str(self.codex_home)}),
            redirect_stdout(stdout),
            redirect_stderr(stderr),
        ):
            status = installer.main(argv)
        return status, stdout.getvalue() + stderr.getvalue()

    def create_payload(self) -> Path:
        self.payload = installer_payload(self.base, self.records)
        self.lock_path = self.payload / "external-skills.toml"
        return self.payload

    def seed_existing_targets(self) -> None:
        harness = self.codex_home / "skills" / installer.INSTALL_NAME
        harness.mkdir(parents=True)
        (harness / "SKILL.md").write_bytes(b"previous harness")
        agents = self.codex_home / "agents"
        agents.mkdir(parents=True)
        for filename in installer.PROFILE_FILES:
            (agents / filename).write_bytes(b"previous profile")

    def reset_homes(self) -> None:
        for root in (self.codex_home, self.user_home):
            if root.exists():
                shutil.rmtree(root)
        self.user_home.mkdir()

    def external_state(self):
        return {
            str(base / skill): tree_state(base / skill)
            for base in (
                self.codex_home / "skills",
                self.user_home / ".agents" / "skills",
            )
            for skill in FILES
        }

    def assert_no_stages(self) -> None:
        self.assertEqual(list(self.codex_home.glob("**/.yunho-harness-*-*")), [])

    def test_missing_external_skill_fails_install_plan(self) -> None:
        with patch.object(Path, "home", return_value=self.user_home):
            with self.assertRaises(installer.InstallerError):
                installer.install_plan(self.legacy, self.codex_home)

    def test_lock_returns_exact_normalized_snapshot_map(self) -> None:
        expected = {
            skill: {
                "test-a": {
                    relative: hashlib.sha256(b"A:" + relative.encode("utf-8")).hexdigest()
                    for relative in paths
                }
            }
            for skill, paths in FILES.items()
        }

        self.assertEqual(installer.load_external_snapshots(self.legacy), expected)

    def test_production_lock_matches_reviewed_snapshot(self) -> None:
        expected = {
            "brainstorming": {
                "local-reviewed-2026-10-04": {
                    "SKILL.md": "a32d2255354775aa124855aa7100cf276bea096fff4ebb3a0edf57be216e6c72",
                    "visual-companion.md": "6ffcb038b53254bd31debaa15e12dcd4ff24bd63d690e0b644ac6396701cf2e2",
                    "scripts/start-server.sh": "a4e5ae84275bcaacd2f84345afeabe59cf7b00ba080e123da7cc1fb226f12847",
                    "scripts/stop-server.sh": "0b5ccbbd57f62d3ed88993f7940b5ee0e5c0fc9b21c550c623da4f6292e47daf",
                    "scripts/server.cjs": "2d2961ea8d11f56c5f4c3a1a68d22709efa5d7601a2246d8c880774e7e9e8412",
                    "scripts/helper.js": "43c6d69954a46ec34a2a262bcc62a9a7e83e839c739f199cb72646d397c686e3",
                    "scripts/frame-template.html": "6a8a4e58bd6a44b904e2e3c57de774481d909204597e1498de53f1b2fecc4c4e",
                }
            },
            "writing-plans": {
                "local-reviewed-2026-10-04": {
                    "SKILL.md": "0bc3d36590f7b2c323ed3ec18ff77e9f8ed57af42f5680a02b11a2d20de265cf",
                }
            },
            "test-driven-development": {
                "local-reviewed-2026-10-04": {
                    "SKILL.md": "64b03fce4aee5a97a93160cea8111f3ba13a17b7c001db4bd5836d67fd10705d",
                    "writing-good-tests.md": "51471c853306ff92ca8bb41dcaea05f31c0e46b03651f8f3c99754b7172f4ae1",
                }
            },
            "using-git-worktrees": {
                "local-reviewed-2026-10-04": {
                    "SKILL.md": "8cfb86f121269e8f7f12361e6795c4f6738828340e28964c9229d365666c9edd",
                }
            },
        }

        try:
            actual = installer.load_external_snapshots(REPO)
        except installer.InstallerError as exc:
            self.fail(f"reviewed production lock is missing or invalid: {exc}")

        self.assertEqual(actual, expected)

    def test_lock_rejects_invalid_schema(self) -> None:
        valid = tomllib.loads(self.valid_lock)
        cases: list[tuple[str, str]] = [
            ("malformed TOML", "version = [\nsnapshots = []\n"),
            ("duplicate TOML key", "version = 1\nversion = 1\nsnapshots = []\n"),
            ("snapshot is not a table", "version = 1\nsnapshots = [1]\n"),
        ]

        def changed(label: str, mutate) -> None:
            document = copy.deepcopy(valid)
            mutate(document)
            cases.append((label, render_document(document)))

        changed("unsupported version", lambda doc: doc.__setitem__("version", 2))
        changed("boolean version", lambda doc: doc.__setitem__("version", True))
        changed("extra top-level key", lambda doc: doc.__setitem__("extra", 1))
        changed("snapshots is not an array", lambda doc: doc.__setitem__("snapshots", {}))
        changed("empty snapshots", lambda doc: doc.__setitem__("snapshots", []))
        changed("entry has an extra key", lambda doc: doc["snapshots"][0].__setitem__("extra", 1))
        changed("entry has no id", lambda doc: doc["snapshots"][0].pop("id"))
        changed("unknown skill", lambda doc: doc["snapshots"][0].__setitem__("skill", "other"))
        changed("skill is not a string", lambda doc: doc["snapshots"][0].__setitem__("skill", 1))
        changed("empty id", lambda doc: doc["snapshots"][0].__setitem__("id", ""))
        changed("blank id", lambda doc: doc["snapshots"][0].__setitem__("id", " "))
        changed("id is not a string", lambda doc: doc["snapshots"][0].__setitem__("id", 1))
        changed("files is not a mapping", lambda doc: doc["snapshots"][0].__setitem__("files", []))
        changed("files is empty", lambda doc: doc["snapshots"][0].__setitem__("files", {}))
        changed("required file is missing", lambda doc: doc["snapshots"][0]["files"].pop("SKILL.md"))
        changed("unexpected file is listed", lambda doc: doc["snapshots"][0]["files"].__setitem__("extra.md", "0" * 64))
        changed("digest has invalid characters", lambda doc: doc["snapshots"][0]["files"].__setitem__("SKILL.md", "g" * 64))
        duplicate = copy.deepcopy(valid)
        duplicate["snapshots"].append(copy.deepcopy(duplicate["snapshots"][0]))
        cases.append(("duplicate snapshot id", render_document(duplicate)))
        incomplete = copy.deepcopy(valid)
        incomplete["snapshots"] = incomplete["snapshots"][:1]
        cases.append(("required skill has no snapshot", render_document(incomplete)))

        for label, document in cases:
            with self.subTest(case=label):
                self.write_lock(document)
                with self.assertRaises(installer.InstallerError):
                    installer.load_external_snapshots(self.legacy)

    def test_lock_normalizes_uppercase_sha256(self) -> None:
        document = tomllib.loads(self.valid_lock)
        for entry in document["snapshots"]:
            entry["files"] = {path: digest.upper() for path, digest in entry["files"].items()}
        self.write_lock(render_document(document))

        result = installer.load_external_snapshots(self.legacy)
        self.assertEqual(
            result,
            {
                skill: {
                    "test-a": {
                        relative: hashlib.sha256(b"A:" + relative.encode("utf-8")).hexdigest()
                        for relative in paths
                    }
                }
                for skill, paths in FILES.items()
            },
        )

    def test_lock_read_failure_is_reported(self) -> None:
        original = Path.read_text

        def fail_lock(path: Path, *args, **kwargs):
            if path == self.lock_path:
                raise PermissionError("fixture denied")
            return original(path, *args, **kwargs)

        with patch.object(Path, "read_text", fail_lock):
            with self.assertRaises(installer.InstallerError):
                installer.load_external_snapshots(self.legacy)

    def test_lock_rejects_noncanonical_paths_after_toml_parse(self) -> None:
        for bad_path in (
            "/SKILL.md",
            "./SKILL.md",
            "../SKILL.md",
            "scripts\\SKILL.md",
            "scripts//SKILL.md",
            "scripts/./SKILL.md",
            "SKILL.md/",
            "",
        ):
            with self.subTest(path=bad_path):
                document = tomllib.loads(self.valid_lock)
                files = document["snapshots"][0]["files"]
                files[bad_path] = files.pop("SKILL.md")
                self.write_lock(render_document(document))
                with self.assertRaises(installer.InstallerError):
                    installer.load_external_snapshots(self.legacy)

    def test_codex_home_candidates_are_accepted(self) -> None:
        self.install_candidates(self.codex_home / "skills")

        self.assert_candidates_accepted()

    def test_actual_home_agents_candidates_are_accepted(self) -> None:
        self.install_candidates(self.user_home / ".agents" / "skills")

        self.assert_candidates_accepted()

    def test_candidates_in_both_locations_are_accepted(self) -> None:
        self.install_candidates(self.codex_home / "skills")
        self.install_candidates(self.user_home / ".agents" / "skills")

        self.assert_candidates_accepted()

    def test_all_candidates_must_match_an_approved_snapshot(self) -> None:
        self.install_candidates(self.codex_home / "skills")
        self.install_candidates(self.user_home / ".agents" / "skills")
        changed = self.user_home / ".agents" / "skills" / "brainstorming" / "SKILL.md"
        changed.write_bytes(b"unreviewed bytes")

        with self.assertRaises(installer.InstallerError) as caught:
            self.validate()

        self.assertIn("brainstorming", str(caught.exception))
        self.assertIn("호환성이 확인되지 않음", str(caught.exception))

    def test_files_from_different_snapshots_cannot_be_mixed(self) -> None:
        self.set_snapshots((("test-a", b"A"), ("test-b", b"B")))
        self.install_candidates(self.codex_home / "skills")
        changed = self.codex_home / "skills" / "brainstorming" / "SKILL.md"
        changed.write_bytes(b"B:SKILL.md")

        with self.assertRaises(installer.InstallerError) as caught:
            self.validate()

        self.assertIn("호환성이 확인되지 않음", str(caught.exception))
        self.assertIn("brainstorming", str(caught.exception))

    def test_two_complete_approved_snapshots_can_both_exist(self) -> None:
        self.set_snapshots((("test-a", b"A"), ("test-b", b"B")))
        self.install_candidates(self.codex_home / "skills", b"A")
        self.install_candidates(self.user_home / ".agents" / "skills", b"B")

        self.assert_candidates_accepted()

    def test_additional_files_do_not_change_snapshot_result(self) -> None:
        candidates = self.install_candidates(self.codex_home / "skills")
        (candidates["brainstorming"] / "extra.txt").write_bytes(b"ignored")
        (candidates["brainstorming"] / ".DS_Store").write_bytes(b"ignored")

        self.assert_candidates_accepted()

    def test_missing_skills_report_both_absolute_candidate_paths(self) -> None:
        with self.assertRaises(installer.InstallerError) as caught:
            self.validate()

        message = str(caught.exception)
        self.assertIn("brainstorming", message)
        self.assertIn(str(self.codex_home / "skills" / "brainstorming"), message)
        self.assertIn(str(self.user_home / ".agents" / "skills" / "brainstorming"), message)

    def test_candidate_root_regular_file_is_rejected(self) -> None:
        base = self.codex_home / "skills"
        base.mkdir(parents=True)
        candidate = base / "brainstorming"
        candidate.write_bytes(b"not a directory")

        with self.assertRaises(installer.InstallerError) as caught:
            self.validate()

        self.assertIn(str(candidate), str(caught.exception))
        self.assertIn("root 해석 오류", str(caught.exception))

    def test_dangling_parent_alias_is_not_silent_absence(self) -> None:
        self.codex_home.mkdir()
        alias = self.codex_home / "skills"
        alias.symlink_to(self.base / "missing-parent", target_is_directory=True)
        self.install_candidates(self.user_home / ".agents" / "skills")

        with self.assertRaises(installer.InstallerError) as caught:
            self.validate()

        self.assertIn(str(alias), str(caught.exception))
        self.assertIn("root 해석 오류", str(caught.exception))

    def test_dangling_candidate_alias_is_not_silent_absence(self) -> None:
        base = self.codex_home / "skills"
        base.mkdir(parents=True)
        candidate = base / "brainstorming"
        candidate.symlink_to(self.base / "missing-skill", target_is_directory=True)
        self.install_candidates(self.user_home / ".agents" / "skills")

        with self.assertRaises(installer.InstallerError) as caught:
            self.validate()

        self.assertIn(str(candidate), str(caught.exception))
        self.assertIn("root 해석 오류", str(caught.exception))

    def test_candidate_symlink_cycle_is_rejected(self) -> None:
        base = self.codex_home / "skills"
        base.mkdir(parents=True)
        candidate = base / "brainstorming"
        candidate.symlink_to(candidate, target_is_directory=True)

        with self.assertRaises(installer.InstallerError) as caught:
            self.validate()

        self.assertIn(str(candidate), str(caught.exception))
        self.assertIn("root 해석 오류", str(caught.exception))

    def test_candidate_root_symlinks_to_a_directory_are_accepted(self) -> None:
        real_base = self.base / "real-skills"
        real = self.install_candidates(real_base)
        codex_skills = self.codex_home / "skills"
        codex_skills.mkdir(parents=True)
        for skill in FILES:
            (codex_skills / skill).symlink_to(real[skill], target_is_directory=True)

        self.assert_candidates_accepted()

    def test_candidate_parent_symlink_to_a_directory_is_accepted(self) -> None:
        real_base = self.base / "real-skills"
        self.install_candidates(real_base)
        self.codex_home.mkdir()
        (self.codex_home / "skills").symlink_to(real_base, target_is_directory=True)

        self.assert_candidates_accepted()

    def test_identical_real_candidate_roots_are_read_once(self) -> None:
        candidates = self.install_candidates(self.codex_home / "skills")
        agents = self.user_home / ".agents"
        agents.mkdir()
        (agents / "skills").symlink_to(self.codex_home / "skills", target_is_directory=True)
        snapshots = self.snapshots
        counts: dict[Path, int] = {}
        original = Path.read_bytes

        def count_reads(path: Path) -> bytes:
            counts[path] = counts.get(path, 0) + 1
            return original(path)

        with patch.object(Path, "read_bytes", count_reads):
            try:
                installer.validate_external_skills(self.codex_home, self.user_home, snapshots)
            except installer.InstallerError as exc:
                self.fail(f"approved aliased candidates were rejected: {exc}")

        expected = {
            (candidates[skill] / relative).resolve(): 1
            for skill, paths in FILES.items()
            for relative in paths
        }
        self.assertEqual(counts, expected)

    def test_required_internal_file_symlink_is_accepted(self) -> None:
        candidates = self.install_candidates(self.codex_home / "skills")
        skill_root = candidates["brainstorming"]
        required = skill_root / "SKILL.md"
        required.unlink()
        internal = skill_root / "reviewed-skill.md"
        internal.write_bytes(b"A:SKILL.md")
        required.symlink_to(internal)

        self.assert_candidates_accepted()

    def test_required_external_file_symlink_is_rejected(self) -> None:
        candidates = self.install_candidates(self.codex_home / "skills")
        required = candidates["brainstorming"] / "SKILL.md"
        outside = self.base / "outside.md"
        outside.write_bytes(b"A:SKILL.md")
        required.unlink()
        required.symlink_to(outside)

        with self.assertRaises(installer.InstallerError) as caught:
            self.validate()

        self.assertIn("root 외부 참조", str(caught.exception))
        self.assertIn("SKILL.md", str(caught.exception))

    def test_required_directory_is_rejected(self) -> None:
        self.install_candidates(self.codex_home / "skills")
        required = self.codex_home / "skills" / "writing-plans" / "SKILL.md"
        required.unlink()
        required.mkdir()

        with self.assertRaises(installer.InstallerError) as caught:
            self.validate()

        self.assertIn("일반 파일이 아님", str(caught.exception))

    def test_required_fifo_is_rejected_before_reading(self) -> None:
        self.install_candidates(self.codex_home / "skills")
        required = self.codex_home / "skills" / "writing-plans" / "SKILL.md"
        required.unlink()
        os.mkfifo(required)

        with self.assertRaises(installer.InstallerError) as caught:
            self.validate()

        self.assertIn("일반 파일이 아님", str(caught.exception))
        self.assertTrue(stat.S_ISFIFO(required.stat().st_mode))

    def test_raw_byte_changes_are_rejected(self) -> None:
        self.install_candidates(self.codex_home / "skills")
        required = self.codex_home / "skills" / "writing-plans" / "SKILL.md"
        required.write_bytes(b"A:SKILL.md\r\n")

        with self.assertRaises(installer.InstallerError) as caught:
            self.validate()

        self.assertIn("호환성이 확인되지 않음", str(caught.exception))
        self.assertIn("SKILL.md", str(caught.exception))

    def test_multiple_mismatches_are_reported_without_file_contents(self) -> None:
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

    def test_second_candidate_read_failure_is_rejected(self) -> None:
        self.install_candidates(self.codex_home / "skills")
        self.install_candidates(self.user_home / ".agents" / "skills")
        denied = (self.user_home / ".agents" / "skills" / "writing-plans" / "SKILL.md").resolve()
        original = Path.read_bytes

        def fail_one(path: Path) -> bytes:
            if path == denied:
                raise PermissionError("fixture denied")
            return original(path)

        with patch.object(Path, "read_bytes", fail_one):
            with self.assertRaises(installer.InstallerError) as caught:
                self.validate()

        self.assertIn(
            str(self.user_home / ".agents" / "skills" / "writing-plans"),
            str(caught.exception),
        )
        self.assertIn("SKILL.md", str(caught.exception))
        self.assertIn("fixture denied", str(caught.exception))

    def test_valid_check_accepts_payload_without_dependencies(self) -> None:
        self.create_payload()
        self.install_candidates(self.user_home / ".agents" / "skills")
        before = tree_state(self.codex_home), tree_state(self.user_home)

        status, output = self.run_main(["--check"])

        self.assertEqual(status, 0, output)
        self.assertEqual((tree_state(self.codex_home), tree_state(self.user_home)), before)
        self.assertFalse((self.payload / "dependencies").exists())

    def test_valid_dry_run_does_not_write(self) -> None:
        self.create_payload()
        self.install_candidates(self.user_home / ".agents" / "skills")
        self.seed_existing_targets()
        before = tree_state(self.codex_home), tree_state(self.user_home)

        status, output = self.run_main(["--dry-run"])

        self.assertEqual(status, 0, output)
        self.assertEqual((tree_state(self.codex_home), tree_state(self.user_home)), before)
        self.assertNotIn("dependency skill", output)
        self.assert_no_stages()

    def test_external_failure_does_not_write_for_all_entrypoints(self) -> None:
        self.create_payload()
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
                            changed = (
                                self.user_home
                                / ".agents"
                                / "skills"
                                / "brainstorming"
                                / "SKILL.md"
                            )
                            changed.write_bytes(b"unreviewed")
                        if failure == "malformed-lock":
                            self.write_lock("version = [\n")
                        refresh_manifest(self.payload)
                        before = tree_state(self.codex_home), tree_state(self.user_home)

                        status, output = self.run_main(argv)

                        self.assertEqual(status, 2, output)
                        if failure == "missing":
                            self.assertIn("필수 외부 스킬 누락", output)
                        elif failure == "mismatch":
                            self.assertIn("호환성이 확인되지 않음", output)
                        else:
                            self.assertIn("external skill lock", output)
                        self.assertEqual(
                            (tree_state(self.codex_home), tree_state(self.user_home)),
                            before,
                        )
                        self.assertEqual(list(self.codex_home.glob("backups/*")), [])
                        self.assert_no_stages()

    def test_manifest_failure_precedes_lock_parsing(self) -> None:
        self.create_payload()
        self.install_candidates(self.user_home / ".agents" / "skills")
        self.write_lock(self.valid_lock + "\n")
        before = tree_state(self.codex_home), tree_state(self.user_home)

        with patch.object(
            installer,
            "load_external_snapshots",
            side_effect=AssertionError("parser must not run"),
        ) as parser:
            status, output = self.run_main([])

        self.assertEqual(status, 2, output)
        self.assertIn("SHA-256 mismatch", output)
        parser.assert_not_called()
        self.assertEqual((tree_state(self.codex_home), tree_state(self.user_home)), before)

    def test_install_writes_only_harness_and_seven_profiles(self) -> None:
        self.create_payload()
        self.install_candidates(self.user_home / ".agents" / "skills")
        external_before = self.external_state()
        user_before = tree_state(self.user_home)
        model = installer.load_model_module(self.payload)
        expected_profiles = installer.preflight_profiles(self.payload, model)

        status, output = self.run_main([])

        self.assertEqual(status, 0, output)
        self.assertEqual(
            {path.name for path in (self.codex_home / "skills").iterdir()},
            {installer.INSTALL_NAME},
        )
        self.assertEqual(
            {path.name for path in (self.codex_home / "agents").iterdir()},
            set(installer.PROFILE_FILES),
        )
        harness = self.codex_home / "skills" / installer.INSTALL_NAME
        self.assertEqual(tree_state(harness), tree_state(self.payload / "skill"))
        for filename, expected in expected_profiles.items():
            target = self.codex_home / "agents" / filename
            source = self.payload / "agents" / filename
            self.assertEqual(target.read_bytes(), expected)
            self.assertEqual(
                stat.S_IMODE(target.stat().st_mode),
                stat.S_IMODE(source.stat().st_mode),
            )
        self.assertEqual(self.external_state(), external_before)
        self.assertEqual(tree_state(self.user_home), user_before)
        self.assertEqual(len(list(self.codex_home.glob("backups/*"))), 1)
        self.assert_no_stages()

    def test_replace_failure_restores_targets_and_keeps_backup(self) -> None:
        self.create_payload()
        self.install_candidates(self.user_home / ".agents" / "skills")
        self.seed_existing_targets()
        harness = self.codex_home / "skills" / installer.INSTALL_NAME
        agents = self.codex_home / "agents"
        harness_before = tree_state(harness)
        profiles_before = {
            filename: tree_state(agents / filename) for filename in installer.PROFILE_FILES
        }
        external_before = self.external_state()
        user_before = tree_state(self.user_home)
        failed_name = installer.PROFILE_FILES[1]
        real_replace = os.replace
        injected = False

        def fail_second_profile(source: Path, target: Path, *args, **kwargs) -> None:
            nonlocal injected
            source, target = Path(source), Path(target)
            if (
                not injected
                and target == agents / failed_name
                and source.name == failed_name
                and source.parent.name.startswith(".yunho-harness-profiles-")
            ):
                injected = True
                raise OSError("fixture replacement failure")
            real_replace(source, target, *args, **kwargs)

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
        self.assertEqual(
            tree_state(backup / "skills" / installer.INSTALL_NAME),
            harness_before,
        )
        for filename, before in profiles_before.items():
            self.assertEqual(tree_state(backup / "agents" / filename), before)
        self.assert_no_stages()


if __name__ == "__main__":
    unittest.main()
