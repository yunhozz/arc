from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import stat
import tempfile
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
REPO = Path(__file__).resolve().parents[1]


def write_candidate(base: Path, skill: str, variant: bytes = b"A") -> Path:
    root = base / skill
    for relative in FILES[skill]:
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(variant + b":" + relative.encode("utf-8"))
    return root


def write_candidates(base: Path, variant: bytes = b"A") -> dict[str, Path]:
    return {skill: write_candidate(base, skill, variant) for skill in FILES}


def refresh_manifest(root: Path) -> None:
    names = {"install.py", "install.command", "README.md"}
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


def installer_payload(base: Path) -> Path:
    root = base / "payload"
    for directory in ("skill", "agents"):
        shutil.copytree(REPO / directory, root / directory, ignore=shutil.ignore_patterns(".DS_Store"))
    for filename in ("install.py", "install.command", "README.md"):
        shutil.copy2(REPO / filename, root / filename)
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

    def install_candidates(self, base: Path, variant: bytes = b"A") -> dict[str, Path]:
        return write_candidates(base, variant)

    def validate(self) -> None:
        try:
            installer.validate_external_skills(self.codex_home, self.user_home)
        except TypeError as exc:
            self.fail(f"snapshot-free external validation API is missing: {exc}")

    def write_targets(self) -> dict[str, tuple[Path, ...]]:
        try:
            return installer.external_write_targets(self.codex_home, self.user_home)
        except AttributeError as exc:
            self.fail(f"external write target API is missing: {exc}")

    def run_main(self, argv: list[str], codex_home: str | None = None) -> tuple[int, str]:
        import io
        from contextlib import redirect_stderr, redirect_stdout

        stdout, stderr = io.StringIO(), io.StringIO()
        selected_home = str(self.codex_home) if codex_home is None else codex_home
        with (
            patch.object(installer, "__file__", str((self.payload / "install.py"))),
            patch.object(Path, "home", return_value=self.user_home),
            patch.dict(os.environ, {"CODEX_HOME": selected_home}),
            redirect_stdout(stdout),
            redirect_stderr(stderr),
        ):
            status = installer.main(argv)
        return status, stdout.getvalue() + stderr.getvalue()

    def create_payload(self) -> Path:
        self.payload = installer_payload(self.base)
        return self.payload

    def seed_existing_targets(self) -> None:
        harness = self.codex_home / "skills" / installer.INSTALL_NAME
        harness.mkdir(parents=True)
        (harness / "SKILL.md").write_bytes(b"previous harness")
        agents = self.codex_home / "agents"
        agents.mkdir(parents=True)
        for filename in installer.PROFILE_FILES:
            (agents / filename).write_bytes(b"previous profile")

    def assert_no_stages(self) -> None:
        self.assertEqual(list(self.codex_home.glob("**/.yunho-harness-*-*")), [])

    def acquisition_stub(self, variants: tuple[bytes, ...] = (b"latest",)):
        calls: list[Path] = []

        def acquire(work: Path) -> dict[str, Path]:
            work = Path(work)
            calls.append(work)
            variant = variants[min(len(calls) - 1, len(variants) - 1)]
            return write_candidates(work / ".agents" / "skills", variant=variant)

        return acquire, calls

    def test_structurally_valid_changed_bytes_are_accepted(self) -> None:
        self.install_candidates(self.codex_home / "skills", variant=b"new upstream")

        self.validate()

    def test_required_only_validation_ignores_unrelated_special_entries(self) -> None:
        candidates = self.install_candidates(self.codex_home / "skills")
        extra = candidates["writing-plans"] / "extra.fifo"
        os.mkfifo(extra)

        self.validate()

        self.assertTrue(stat.S_ISFIFO(extra.lstat().st_mode))

    def test_missing_required_file_is_rejected(self) -> None:
        candidates = self.install_candidates(self.codex_home / "skills")
        (candidates["writing-plans"] / "SKILL.md").unlink()

        with self.assertRaises(installer.InstallerError) as caught:
            self.validate()

        self.assertIn("SKILL.md", str(caught.exception))

    def test_required_internal_file_symlink_is_accepted(self) -> None:
        candidates = self.install_candidates(self.codex_home / "skills")
        skill_root = candidates["brainstorming"]
        required = skill_root / "SKILL.md"
        required.unlink()
        internal = skill_root / "reviewed-skill.md"
        internal.write_bytes(b"new upstream")
        required.symlink_to(internal)

        self.validate()

    def test_required_external_file_symlink_is_rejected(self) -> None:
        candidates = self.install_candidates(self.codex_home / "skills")
        required = candidates["brainstorming"] / "SKILL.md"
        outside = self.base / "outside.md"
        outside.write_bytes(b"not part of the skill")
        required.unlink()
        required.symlink_to(outside)

        with self.assertRaises(installer.InstallerError) as caught:
            self.validate()

        self.assertIn("root 외부 참조", str(caught.exception))

    def test_required_fifo_is_rejected_without_reading_it(self) -> None:
        candidates = self.install_candidates(self.codex_home / "skills")
        required = candidates["writing-plans"] / "SKILL.md"
        required.unlink()
        os.mkfifo(required)

        with self.assertRaises(installer.InstallerError) as caught:
            self.validate()

        self.assertIn("일반 파일이 아님", str(caught.exception))
        self.assertTrue(stat.S_ISFIFO(required.lstat().st_mode))

    def test_missing_skill_reports_both_absolute_candidates(self) -> None:
        with self.assertRaises(installer.InstallerError) as caught:
            self.validate()

        message = str(caught.exception)
        self.assertIn(str(self.codex_home / "skills" / "brainstorming"), message)
        self.assertIn(str(self.user_home / ".agents" / "skills" / "brainstorming"), message)

    def test_readonly_validation_accepts_candidate_root_alias(self) -> None:
        candidates = self.install_candidates(self.base / "real-skills")
        codex_skills = self.codex_home / "skills"
        codex_skills.mkdir(parents=True)
        for skill in FILES:
            (codex_skills / skill).symlink_to(candidates[skill], target_is_directory=True)

        self.validate()

    def test_readonly_validation_accepts_parent_alias(self) -> None:
        self.install_candidates(self.base / "real-skills")
        self.codex_home.mkdir()
        (self.codex_home / "skills").symlink_to(self.base / "real-skills", target_is_directory=True)

        self.validate()

    def test_write_targets_reject_root_alias_without_touching_target(self) -> None:
        upstream = write_candidate(self.base / "upstream", "brainstorming")
        skills = self.codex_home / "skills"
        skills.mkdir(parents=True)
        (skills / "brainstorming").symlink_to(upstream, target_is_directory=True)
        before = tree_state(upstream)

        with self.assertRaises(installer.InstallerError):
            self.write_targets()

        self.assertEqual(tree_state(upstream), before)

    def test_write_targets_reject_parent_alias_without_touching_target(self) -> None:
        upstream = self.base / "upstream"
        candidates = write_candidates(upstream)
        self.codex_home.mkdir()
        (self.codex_home / "skills").symlink_to(upstream, target_is_directory=True)
        before = {skill: tree_state(root) for skill, root in candidates.items()}

        with self.assertRaises(installer.InstallerError):
            self.write_targets()

        self.assertEqual({skill: tree_state(root) for skill, root in candidates.items()}, before)

    def test_write_targets_reject_regular_file_root(self) -> None:
        skills = self.codex_home / "skills"
        skills.mkdir(parents=True)
        candidate = skills / "brainstorming"
        candidate.write_text("not a directory", encoding="utf-8")

        with self.assertRaises(installer.InstallerError):
            self.write_targets()

    def test_write_targets_reject_special_tree_entries(self) -> None:
        for entry_type in ("fifo", "socket"):
            with self.subTest(entry_type=entry_type):
                self.codex_home.mkdir(exist_ok=True)
                candidate = self.codex_home / "skills" / "brainstorming"
                candidate.mkdir(parents=True, exist_ok=True)
                special = candidate / f"extra.{entry_type}"
                if entry_type == "fifo":
                    os.mkfifo(special)
                else:
                    special.write_bytes(b"synthetic socket entry")
                original_lstat = Path.lstat

                def with_socket_type(path: Path, *args, **kwargs):
                    result = original_lstat(path, *args, **kwargs)
                    if entry_type == "socket" and path == special:
                        fields = list(result)
                        fields[0] = stat.S_IFSOCK | stat.S_IMODE(fields[0])
                        return os.stat_result(fields)
                    return result

                with (
                    patch.object(Path, "lstat", with_socket_type),
                    self.assertRaises(installer.InstallerError),
                ):
                    self.write_targets()
                special.unlink()

    def test_write_targets_allow_backupable_internal_links(self) -> None:
        candidate = self.codex_home / "skills" / "brainstorming"
        candidate.mkdir(parents=True)
        (candidate / "SKILL.md").write_text("previous", encoding="utf-8")
        (candidate / "alias.md").symlink_to(candidate / "SKILL.md")

        targets = self.write_targets()

        self.assertEqual(targets["brainstorming"], (candidate,))
        self.assertEqual(os.readlink(candidate / "alias.md"), str(candidate / "SKILL.md"))

    def test_write_targets_include_existing_legacy_candidates(self) -> None:
        selected = self.codex_home / "skills"
        legacy = self.user_home / ".agents" / "skills"
        legacy_candidate = legacy / "writing-plans"
        legacy_candidate.mkdir(parents=True)

        targets = self.write_targets()

        self.assertEqual(targets["writing-plans"], (selected / "writing-plans", legacy_candidate))
        self.assertFalse((legacy / "brainstorming").exists())

    def test_write_targets_do_not_create_missing_legacy_candidates(self) -> None:
        targets = self.write_targets()

        for skill, paths in targets.items():
            self.assertEqual(paths, (self.codex_home / "skills" / skill,))
        self.assertFalse((self.user_home / ".agents").exists())

    def seed_alias_with_unrelated_fifo(self, alias_kind: str) -> tuple[Path, ...]:
        self.create_payload()
        selected = self.install_candidates(self.codex_home / "skills")
        os.mkfifo(selected["writing-plans"] / "extra.fifo")
        state_roots = [
            self.codex_home,
            self.user_home,
            self.base / "actual-selected",
            self.base / "actual-legacy",
        ]
        if alias_kind == "candidate-root":
            real_root = write_candidate(
                self.base / "actual-selected", "brainstorming", variant=b"alias target"
            )
            shutil.rmtree(selected["brainstorming"])
            selected["brainstorming"].symlink_to(real_root, target_is_directory=True)
        elif alias_kind == "legacy-parent":
            write_candidates(self.base / "actual-legacy", variant=b"legacy target")
            agents = self.user_home / ".agents"
            agents.mkdir()
            (agents / "skills").symlink_to(self.base / "actual-legacy", target_is_directory=True)
        else:
            raise AssertionError(f"unexpected alias kind: {alias_kind}")
        return tuple(state_roots)

    def assert_readonly_main_accepts_alias(self, argv: list[str], alias_kind: str) -> None:
        state_roots = self.seed_alias_with_unrelated_fifo(alias_kind)
        before = tuple(tree_state(path) for path in state_roots)
        with patch.object(installer, "acquire_external_skills") as acquire:
            status, output = self.run_main(argv)
        self.assertEqual(status, 0, output)
        if argv == ["--check"]:
            self.assertIn("Installer payload preflight passed.", output)
        else:
            self.assertIn("Would update external skills:", output)
            self.assertIn(str(self.codex_home / "skills" / "brainstorming"), output)
            if alias_kind == "legacy-parent":
                self.assertIn(
                    str(self.user_home / ".agents" / "skills" / "brainstorming"),
                    output,
                )
        acquire.assert_not_called()
        self.assertEqual(tuple(tree_state(path) for path in state_roots), before)
        self.assert_no_stages()

    def test_check_accepts_required_files_through_candidate_root_alias_with_fifo(self) -> None:
        self.assert_readonly_main_accepts_alias(["--check"], "candidate-root")

    def test_check_accepts_required_files_through_legacy_parent_alias_with_fifo(self) -> None:
        self.assert_readonly_main_accepts_alias(["--check"], "legacy-parent")

    def test_dry_run_accepts_required_files_through_candidate_root_alias_with_fifo(self) -> None:
        self.assert_readonly_main_accepts_alias(["--dry-run"], "candidate-root")

    def test_dry_run_accepts_required_files_through_legacy_parent_alias_with_fifo(self) -> None:
        self.assert_readonly_main_accepts_alias(["--dry-run"], "legacy-parent")

    def test_install_rejects_candidate_root_alias_before_acquisition(self) -> None:
        self.create_payload()
        selected = self.install_candidates(self.codex_home / "skills")
        real_root = write_candidate(self.base / "actual-selected", "brainstorming")
        shutil.rmtree(selected["brainstorming"])
        selected["brainstorming"].symlink_to(real_root, target_is_directory=True)
        before = (tree_state(self.codex_home), tree_state(self.user_home), tree_state(self.base / "actual-selected"))

        with patch.object(installer, "acquire_external_skills") as acquire:
            status, output = self.run_main([])

        self.assertEqual(status, 2, output)
        acquire.assert_not_called()
        self.assertEqual(
            (tree_state(self.codex_home), tree_state(self.user_home), tree_state(self.base / "actual-selected")),
            before,
        )

    def test_install_rejects_unrelated_special_entry_before_acquisition(self) -> None:
        self.create_payload()
        selected = self.install_candidates(self.codex_home / "skills")
        os.mkfifo(selected["writing-plans"] / "extra.fifo")
        before = (tree_state(self.codex_home), tree_state(self.user_home))

        with patch.object(installer, "acquire_external_skills") as acquire:
            status, output = self.run_main([])

        self.assertEqual(status, 2, output)
        acquire.assert_not_called()
        self.assertEqual((tree_state(self.codex_home), tree_state(self.user_home)), before)

    def test_check_validates_structure_and_does_not_write(self) -> None:
        self.create_payload()
        self.install_candidates(self.user_home / ".agents" / "skills", variant=b"changed upstream")
        before = tree_state(self.codex_home), tree_state(self.user_home)

        status, output = self.run_main(["--check"])

        self.assertEqual(status, 0, output)
        self.assertEqual((tree_state(self.codex_home), tree_state(self.user_home)), before)
        self.assertFalse((self.payload / "dependencies").exists())

    def test_dry_run_validates_structure_and_does_not_write(self) -> None:
        self.create_payload()
        self.install_candidates(self.user_home / ".agents" / "skills")
        self.seed_existing_targets()
        before = tree_state(self.codex_home), tree_state(self.user_home)

        status, output = self.run_main(["--dry-run"])

        self.assertEqual(status, 0, output)
        self.assertIn(
            "npx --yes skills@latest add https://github.com/obra/superpowers --skill "
            "brainstorming writing-plans test-driven-development using-git-worktrees "
            "--agent codex --yes --copy --json",
            output,
        )
        self.assertEqual((tree_state(self.codex_home), tree_state(self.user_home)), before)
        self.assert_no_stages()

    def test_check_and_dry_run_reject_missing_candidates_without_writes(self) -> None:
        self.create_payload()
        before = tree_state(self.codex_home), tree_state(self.user_home)

        for argv in (["--check"], ["--dry-run"]):
            with self.subTest(argv=argv):
                status, output = self.run_main(list(argv))
                self.assertEqual(status, 2, output)
                self.assertIn("필수 외부 스킬 누락", output)
                self.assertEqual((tree_state(self.codex_home), tree_state(self.user_home)), before)

    def test_install_writes_harness_profiles_and_four_external_skills(self) -> None:
        self.create_payload()
        candidates = self.install_candidates(self.user_home / ".agents" / "skills")
        acquire, _calls = self.acquisition_stub((b"current upstream",))
        model = installer.load_model_module(self.payload)
        expected_profiles = installer.preflight_profiles(self.payload, model)

        with patch.object(installer, "acquire_external_skills", side_effect=acquire):
            status, output = self.run_main([])

        self.assertEqual(status, 0, output)
        self.assertEqual(
            {path.name for path in (self.codex_home / "skills").iterdir()},
            {installer.INSTALL_NAME, *FILES},
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
            self.assertEqual(stat.S_IMODE(target.stat().st_mode), stat.S_IMODE(source.stat().st_mode))
        for skill in FILES:
            expected = {relative: b"current upstream:" + relative.encode() for relative in FILES[skill]}
            self.assertEqual(
                {path.relative_to(self.codex_home / "skills" / skill).as_posix(): path.read_bytes()
                 for path in (self.codex_home / "skills" / skill).rglob("*") if path.is_file()},
                expected,
            )
            self.assertEqual(
                (candidates[skill] / "SKILL.md").read_bytes(),
                b"current upstream:SKILL.md",
            )
        self.assertEqual(len(list(self.codex_home.glob("backups/*"))), 1)
        self.assert_no_stages()

    def test_install_syncs_all_four_on_every_run(self) -> None:
        self.create_payload()
        acquire, calls = self.acquisition_stub((b"upstream one", b"upstream two"))

        with patch.object(installer, "acquire_external_skills", side_effect=acquire):
            first_status, first_output = self.run_main([])
            self.assertEqual(first_status, 0, first_output)
            installed = self.codex_home / "skills"
            self.assertEqual(
                {skill: (installed / skill / "SKILL.md").read_bytes() for skill in FILES},
                {skill: b"upstream one:SKILL.md" for skill in FILES},
            )
            (installed / "writing-plans" / "SKILL.md").write_bytes(b"local edit")
            second_status, second_output = self.run_main([])

        self.assertEqual(second_status, 0, second_output)
        self.assertEqual(len(calls), 2)
        self.assertEqual(
            {skill: (installed / skill / "SKILL.md").read_bytes() for skill in FILES},
            {skill: b"upstream two:SKILL.md" for skill in FILES},
        )

    def test_install_updates_existing_legacy_only(self) -> None:
        self.create_payload()
        legacy = self.user_home / ".agents" / "skills"
        write_candidate(legacy, "writing-plans", variant=b"old legacy")
        acquire, _calls = self.acquisition_stub()

        with patch.object(installer, "acquire_external_skills", side_effect=acquire):
            status, output = self.run_main([])

        self.assertEqual(status, 0, output)
        self.assertEqual(
            (legacy / "writing-plans" / "SKILL.md").read_bytes(),
            b"latest:SKILL.md",
        )
        self.assertEqual(
            {path.name for path in legacy.iterdir()},
            {"writing-plans"},
        )
        for skill in set(FILES) - {"writing-plans"}:
            self.assertFalse((legacy / skill).exists())

    def test_sync_removes_deleted_upstream_files(self) -> None:
        self.create_payload()
        installed = self.codex_home / "skills" / "brainstorming"
        installed.mkdir(parents=True)
        (installed / "SKILL.md").write_bytes(b"old")
        (installed / "removed-upstream.md").write_bytes(b"obsolete local copy")
        acquire, _calls = self.acquisition_stub()

        with patch.object(installer, "acquire_external_skills", side_effect=acquire):
            status, output = self.run_main([])

        self.assertEqual(status, 0, output)
        self.assertFalse((installed / "removed-upstream.md").exists())
        self.assertEqual((installed / "SKILL.md").read_bytes(), b"latest:SKILL.md")

    def test_read_only_options_never_acquire_or_write(self) -> None:
        self.create_payload()
        write_candidates(self.user_home / ".agents" / "skills", variant=b"existing")
        before = tree_state(self.base)

        with patch.object(installer, "acquire_external_skills") as acquire:
            for argv in (["--check"], ["--dry-run"]):
                with self.subTest(argv=argv):
                    status, output = self.run_main(list(argv))
                    self.assertEqual(status, 0, output)
            acquire.assert_not_called()

        self.assertEqual(tree_state(self.base), before)

    def test_manifest_preflight_fails_before_acquisition(self) -> None:
        payload = self.create_payload()
        (payload / "MANIFEST.sha256").write_text("broken\n", encoding="utf-8")
        before = tree_state(self.base)

        with patch.object(installer, "acquire_external_skills") as acquire:
            status, output = self.run_main([])

        self.assertEqual(status, 2, output)
        acquire.assert_not_called()
        self.assertEqual(tree_state(self.base), before)

    def test_acquisition_failure_leaves_targets_and_backup_unchanged(self) -> None:
        self.create_payload()
        self.seed_existing_targets()
        write_candidates(self.codex_home / "skills", variant=b"old external")
        before = tree_state(self.codex_home)

        with patch.object(
            installer,
            "acquire_external_skills",
            side_effect=installer.InstallerError("synthetic acquisition failure"),
        ) as acquire:
            status, output = self.run_main([])

        self.assertEqual(status, 2, output)
        acquire.assert_called_once()
        self.assertEqual(tree_state(self.codex_home), before)
        self.assert_no_stages()

    def test_external_replace_failure_restores_all_targets(self) -> None:
        self.create_payload()
        self.seed_existing_targets()
        write_candidates(self.codex_home / "skills", variant=b"old external")
        before = tree_state(self.codex_home)
        external_before = {
            skill: tree_state(self.codex_home / "skills" / skill) for skill in FILES
        }
        harness_before = tree_state(self.codex_home / "skills" / installer.INSTALL_NAME)
        profiles_before = {
            filename: tree_state(self.codex_home / "agents" / filename)
            for filename in installer.PROFILE_FILES
        }
        acquire, _calls = self.acquisition_stub((b"new external",))
        selected = self.codex_home / "skills" / "writing-plans"
        real_replace = os.replace
        injected = False

        def fail_writing_plans_stage(source: Path, target: Path, *args, **kwargs) -> None:
            nonlocal injected
            if not injected and Path(target) == selected and Path(source) != selected:
                injected = True
                raise OSError("injected external replacement failure")
            real_replace(source, target, *args, **kwargs)

        with (
            patch.object(installer, "acquire_external_skills", side_effect=acquire) as acquisition,
            patch.object(installer.os, "replace", fail_writing_plans_stage),
        ):
            status, output = self.run_main([])

        self.assertTrue(injected)
        acquisition.assert_called_once()
        self.assertEqual(status, 2, output)
        self.assertEqual(
            {skill: tree_state(self.codex_home / "skills" / skill) for skill in FILES},
            external_before,
        )
        self.assertEqual(
            tree_state(self.codex_home / "skills" / installer.INSTALL_NAME),
            harness_before,
        )
        for filename in installer.PROFILE_FILES:
            self.assertEqual(
                tree_state(self.codex_home / "agents" / filename),
                profiles_before[filename],
            )

    def test_successful_sync_backs_up_selected_and_legacy_external_trees(self) -> None:
        self.create_payload()
        selected = write_candidates(
            self.codex_home / "skills", variant=b"old selected"
        )["brainstorming"]
        selected_link = selected / "old-link.md"
        selected_link.symlink_to(selected / "SKILL.md")
        selected_link_text = os.readlink(selected_link)
        legacy = write_candidate(
            self.user_home / ".agents" / "skills", "writing-plans", variant=b"old legacy"
        )
        acquire, _calls = self.acquisition_stub((b"new external",))

        with patch.object(installer, "acquire_external_skills", side_effect=acquire):
            status, output = self.run_main([])

        self.assertEqual(status, 0, output)
        backup_roots = list((self.codex_home / "backups").iterdir())
        self.assertEqual(len(backup_roots), 1)
        backup = backup_roots[0]
        selected_backup = backup / "skills" / "brainstorming"
        legacy_backup = backup / "legacy-agents-skills" / "writing-plans"
        self.assertTrue(selected_backup.is_dir(), "selected external skill backup is missing")
        self.assertTrue(legacy_backup.is_dir(), "legacy external skill backup is missing")
        self.assertEqual(
            (selected_backup / "SKILL.md").read_bytes(),
            b"old selected:SKILL.md",
        )
        self.assertTrue((selected_backup / "old-link.md").is_symlink())
        self.assertEqual(
            os.readlink(selected_backup / "old-link.md"),
            selected_link_text,
        )
        self.assertEqual(
            (legacy_backup / "SKILL.md").read_bytes(),
            b"old legacy:SKILL.md",
        )
        self.assertTrue(legacy.exists())

    def test_profile_failure_restores_external_targets_too(self) -> None:
        self.create_payload()
        self.seed_existing_targets()
        write_candidates(self.codex_home / "skills", variant=b"old external")
        before = tree_state(self.codex_home)
        external_before = {
            skill: tree_state(self.codex_home / "skills" / skill) for skill in FILES
        }
        harness_before = tree_state(self.codex_home / "skills" / installer.INSTALL_NAME)
        profiles_before = {
            filename: tree_state(self.codex_home / "agents" / filename)
            for filename in installer.PROFILE_FILES
        }
        acquire, _calls = self.acquisition_stub((b"new external",))
        agents = self.codex_home / "agents"
        failed_name = installer.PROFILE_FILES[1]
        real_replace = os.replace
        injected = False

        def fail_profile_stage(source: Path, target: Path, *args, **kwargs) -> None:
            nonlocal injected
            if not injected and Path(target) == agents / failed_name:
                injected = True
                raise OSError("injected profile replacement failure")
            real_replace(source, target, *args, **kwargs)

        with (
            patch.object(installer, "acquire_external_skills", side_effect=acquire) as acquisition,
            patch.object(installer.os, "replace", fail_profile_stage),
        ):
            status, output = self.run_main([])

        self.assertTrue(injected)
        acquisition.assert_called_once()
        self.assertEqual(status, 2, output)
        self.assertEqual(
            {skill: tree_state(self.codex_home / "skills" / skill) for skill in FILES},
            external_before,
        )
        self.assertEqual(
            tree_state(self.codex_home / "skills" / installer.INSTALL_NAME),
            harness_before,
        )
        for filename in installer.PROFILE_FILES:
            self.assertEqual(
                tree_state(self.codex_home / "agents" / filename),
                profiles_before[filename],
            )

    def test_failed_install_removes_new_external_targets(self) -> None:
        self.create_payload()
        self.seed_existing_targets()
        acquire, _calls = self.acquisition_stub((b"new external",))
        agents = self.codex_home / "agents"
        failed_name = installer.PROFILE_FILES[1]
        real_replace = os.replace
        injected = False

        def fail_profile_stage(source: Path, target: Path, *args, **kwargs) -> None:
            nonlocal injected
            if not injected and Path(target) == agents / failed_name:
                injected = True
                raise OSError("injected profile replacement failure")
            real_replace(source, target, *args, **kwargs)

        with (
            patch.object(installer, "acquire_external_skills", side_effect=acquire) as acquisition,
            patch.object(installer.os, "replace", fail_profile_stage),
        ):
            status, output = self.run_main([])

        self.assertTrue(injected)
        acquisition.assert_called_once()
        self.assertEqual(status, 2, output)
        for skill in FILES:
            self.assertFalse((self.codex_home / "skills" / skill).exists())

    def test_rollback_failure_preserves_previous_and_reports_recovery_path(self) -> None:
        self.create_payload()
        self.seed_existing_targets()
        write_candidates(self.codex_home / "skills", variant=b"old external")
        acquire, _calls = self.acquisition_stub((b"new external",))
        selected = self.codex_home / "skills" / "writing-plans"
        agents = self.codex_home / "agents"
        failed_name = installer.PROFILE_FILES[1]
        real_replace = os.replace
        profile_failed = False
        recovery_source: Path | None = None

        def fail_install_and_restore(source: Path, target: Path, *args, **kwargs) -> None:
            nonlocal profile_failed, recovery_source
            source, target = Path(source), Path(target)
            if not profile_failed and target == agents / failed_name:
                profile_failed = True
                raise OSError("injected profile replacement failure")
            if profile_failed and target == selected and source.name == "previous-writing-plans":
                recovery_source = source
                raise OSError("injected external rollback failure")
            real_replace(source, target, *args, **kwargs)

        with (
            patch.object(installer, "acquire_external_skills", side_effect=acquire) as acquisition,
            patch.object(installer.os, "replace", fail_install_and_restore),
        ):
            status, output = self.run_main([])

        self.assertTrue(profile_failed)
        acquisition.assert_called_once()
        self.assertEqual(status, 2, output)
        self.assertIsNotNone(recovery_source)
        assert recovery_source is not None
        self.assertTrue(recovery_source.is_absolute())
        self.assertTrue(recovery_source.exists())
        self.assertIn(str(recovery_source), output)
        self.assertEqual(
            (recovery_source / "SKILL.md").read_bytes(),
            b"old external:SKILL.md",
        )
        self.assertIn("rollback", output.lower())

    def test_replace_failure_restores_targets_and_keeps_backup(self) -> None:
        self.create_payload()
        self.install_candidates(self.user_home / ".agents" / "skills")
        harness = self.codex_home / "skills" / installer.INSTALL_NAME
        self.seed_existing_targets()
        agents = self.codex_home / "agents"
        harness_before = tree_state(harness)
        profiles_before = {filename: tree_state(agents / filename) for filename in installer.PROFILE_FILES}
        acquire, _calls = self.acquisition_stub((b"current upstream",))
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

        with (
            patch.object(installer, "acquire_external_skills", side_effect=acquire),
            patch.object(installer.os, "replace", fail_second_profile),
        ):
            status, output = self.run_main([])

        self.assertTrue(injected)
        self.assertEqual(status, 2, output)
        self.assertIn("fixture replacement failure", output)
        self.assertEqual(tree_state(harness), harness_before)
        for filename, before in profiles_before.items():
            self.assertEqual(tree_state(agents / filename), before)
        backups = list(self.codex_home.glob("backups/*"))
        self.assertEqual(len(backups), 1)
        backup = backups[0]
        self.assertEqual(tree_state(backup / "skills" / installer.INSTALL_NAME), harness_before)
        for filename, before in profiles_before.items():
            self.assertEqual(tree_state(backup / "agents" / filename), before)
        self.assert_no_stages()


if __name__ == "__main__":
    unittest.main()


class FakeProcess:
    def __init__(
        self,
        stdout: bytes = b"",
        stderr: bytes = b"",
        returncode: int = 0,
        communicate_outcomes=None,
    ):
        self.stdout = stdout
        self.stderr = stderr
        self.returncode = returncode
        self.pid = 48271
        self.communicate_timeouts: list[float | None] = []
        self.communicate_outcomes = list(communicate_outcomes or ())

    def communicate(self, timeout: float | None = None) -> tuple[bytes, bytes]:
        self.communicate_timeouts.append(timeout)
        if self.communicate_outcomes:
            outcome = self.communicate_outcomes.pop(0)
            if isinstance(outcome, BaseException):
                raise outcome
            return outcome
        return self.stdout, self.stderr


class AcquiredTreeValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(dir="/private/tmp")
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)

    def skill_root(self) -> Path:
        return write_candidate(self.base / "acquired", "writing-plans", variant=b"latest")

    def validate(self, root: Path) -> None:
        installer.validate_acquired_external_tree(root, FILES["writing-plans"])

    def test_acquired_tree_accepts_required_files_and_unrelated_regular_files(self) -> None:
        root = self.skill_root()
        (root / "notes.txt").write_text("extra upstream file", encoding="utf-8")

        self.validate(root)

    def test_acquired_tree_accepts_absolute_internal_file_link(self) -> None:
        root = self.skill_root()
        reference = root / "reference.md"
        reference.write_bytes(b"internal reference")
        (root / "reference-link.md").symlink_to(reference)

        self.validate(root)

    def test_acquired_tree_accepts_internal_directory_link(self) -> None:
        root = self.skill_root()
        shared = root / "shared"
        shared.mkdir()
        (shared / "guide.md").write_bytes(b"guide")
        (root / "shared-link").symlink_to(shared, target_is_directory=True)

        self.validate(root)

    def test_acquired_tree_rejects_link_outside_root(self) -> None:
        root = self.skill_root()
        outside = self.base / "outside.md"
        outside.write_bytes(b"outside")
        (root / "escape.md").symlink_to(outside)

        with self.assertRaises(installer.InstallerError) as caught:
            self.validate(root)

        self.assertIn("escapes its root", str(caught.exception))

    def test_acquired_tree_rejects_dangling_and_cyclic_links(self) -> None:
        for kind in ("dangling", "cycle"):
            with self.subTest(kind=kind):
                root = write_candidate(self.base / kind, "writing-plans", variant=b"latest")
                first = root / "link-a"
                if kind == "dangling":
                    first.symlink_to(root / "missing")
                else:
                    second = root / "link-b"
                    first.symlink_to(second)
                    second.symlink_to(first)

                with self.assertRaises(installer.InstallerError):
                    self.validate(root)

    def test_acquired_tree_rejects_directory_link_cycle(self) -> None:
        root = self.skill_root()
        child = root / "nested"
        child.mkdir()
        (child / "back-to-root").symlink_to(root, target_is_directory=True)

        with self.assertRaises(installer.InstallerError) as caught:
            self.validate(root)

        self.assertIn("cycle", str(caught.exception))

    def test_acquired_tree_rejects_sibling_directory_link_cycle(self) -> None:
        root = self.skill_root()
        left = root / "left"
        right = root / "right"
        left.mkdir()
        right.mkdir()
        (left / "to-right").symlink_to(right, target_is_directory=True)
        (right / "to-left").symlink_to(left, target_is_directory=True)

        with self.assertRaises(installer.InstallerError) as caught:
            self.validate(root)

        self.assertIn("cycle", str(caught.exception))

    def test_acquired_tree_rejects_root_symlink(self) -> None:
        root = self.skill_root()
        alias = self.base / "alias"
        alias.symlink_to(root, target_is_directory=True)

        with self.assertRaises(installer.InstallerError):
            self.validate(alias)

    def test_acquired_tree_rejects_fifo_and_socket_entries(self) -> None:
        for kind in ("fifo", "socket"):
            with self.subTest(kind=kind):
                root = write_candidate(self.base / kind, "writing-plans", variant=b"latest")
                entry = root / f"extra.{kind}"
                if kind == "fifo":
                    os.mkfifo(entry)
                else:
                    entry.write_bytes(b"synthetic socket entry")
                original_lstat = Path.lstat

                def with_socket_type(path: Path, *args, **kwargs):
                    result = original_lstat(path, *args, **kwargs)
                    if kind == "socket" and path == entry:
                        fields = list(result)
                        fields[0] = stat.S_IFSOCK | stat.S_IMODE(fields[0])
                        return os.stat_result(fields)
                    return result

                with patch.object(Path, "lstat", with_socket_type):
                    with self.assertRaises(installer.InstallerError):
                        self.validate(root)

    def test_acquired_tree_rejects_missing_required_file(self) -> None:
        root = self.skill_root()
        (root / "SKILL.md").unlink()

        with self.assertRaises(installer.InstallerError):
            self.validate(root)


class ExternalSkillAcquisitionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(dir="/private/tmp")
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.user_home = self.base / "user home with spaces"
        self.user_home.mkdir()

    def records(self, work: Path, names=None, status: str = "installed", path_overrides=None) -> str:
        selected_names = tuple(FILES) if names is None else tuple(names)
        path_overrides = {} if path_overrides is None else path_overrides
        rows = [
            {
                "name": skill,
                "status": status,
                "source": "obra/superpowers",
                "ref": None,
                "path": path_overrides.get(skill, str(work / ".agents" / "skills" / skill)),
                "scope": "project",
                "agents": ["Codex"],
                "mode": "copy",
            }
            for skill in selected_names
        ]
        return json.dumps(rows)

    def make_runner(
        self,
        output,
        *,
        returncode: int = 0,
        stderr: bytes = b"",
        setup=None,
        communicate_outcomes=None,
    ):
        calls = []

        def spawn(command, **kwargs):
            work = Path(kwargs["cwd"])
            if setup is not None:
                setup(work)
            stdout = output(work) if callable(output) else output
            process = FakeProcess(
                stdout=stdout,
                stderr=stderr,
                returncode=returncode,
                communicate_outcomes=communicate_outcomes,
            )
            calls.append((command, kwargs, process))
            return process

        return spawn, calls

    def acquire(self, work: Path) -> dict[str, Path]:
        method = getattr(installer, "acquire_external_skills", None)
        if method is None:
            self.fail("external acquisition API is missing")
        return method(work)

    def stage(self, source: Path, destination: Path) -> None:
        method = getattr(installer, "stage_external_tree", None)
        if method is None:
            self.fail("external tree staging API is missing")
        method(source, destination)

    def test_acquisition_uses_exact_four_skill_command(self) -> None:
        work = self.base / "work"
        work.mkdir()

        def setup(cwd: Path) -> None:
            write_candidates(cwd / ".agents" / "skills", variant=b"latest")

        spawn, calls = self.make_runner(lambda cwd: self.records(cwd), setup=setup)
        with (
            patch.dict(os.environ, {"HOME": str(self.user_home), "CODEX_HOME": "/parent/codex"}),
            patch.object(subprocess, "Popen", side_effect=spawn),
        ):
            result = self.acquire(work)

        self.assertEqual(set(result), set(FILES))
        self.assertEqual(
            result,
            {skill: work / ".agents" / "skills" / skill for skill in FILES},
        )
        self.assertEqual(len(calls), 1)
        command, kwargs, process = calls[0]
        self.assertEqual(
            command,
            [
                "npx", "--yes", "skills@latest", "add", "https://github.com/obra/superpowers",
                "--skill", "brainstorming", "writing-plans", "test-driven-development",
                "using-git-worktrees", "--agent", "codex", "--yes", "--copy", "--json",
            ],
        )
        self.assertEqual(kwargs["cwd"], work)
        self.assertEqual(kwargs["env"]["HOME"], str(work / "home"))
        self.assertEqual(kwargs["env"]["CODEX_HOME"], str(work / "codex-runtime"))
        self.assertEqual(kwargs["env"]["npm_config_cache"], str(work / "npm-cache"))
        self.assertEqual(kwargs["env"]["XDG_STATE_HOME"], str(work / "state"))
        self.assertEqual(kwargs["env"]["TMPDIR"], str(work / "tmp"))
        self.assertTrue(kwargs["start_new_session"])
        self.assertIs(kwargs["stdout"], subprocess.PIPE)
        self.assertIs(kwargs["stderr"], subprocess.PIPE)
        self.assertEqual(process.communicate_timeouts, [300])
        for path in ("codex-runtime", "npm-cache", "state", "tmp"):
            self.assertTrue((work / path).is_dir())

    def test_acquisition_passes_only_isolated_nonsecret_environment(self) -> None:
        work = self.base / "isolated-work"
        work.mkdir()
        setup = lambda cwd: write_candidates(cwd / ".agents" / "skills", variant=b"latest")
        spawn, calls = self.make_runner(lambda cwd: self.records(cwd), setup=setup)
        inherited = {
            "HOME": str(self.user_home),
            "CODEX_HOME": "/parent/codex",
            "PATH": "/trusted/node/bin:/usr/bin",
            "LANG": "C.UTF-8",
            "LC_ALL": "C.UTF-8",
            "CI": "false",
            "GITHUB_TOKEN": "sentinel-github",
            "GH_TOKEN": "sentinel-gh",
            "AWS_ACCESS_KEY_ID": "sentinel-aws-key",
            "AWS_SECRET_ACCESS_KEY": "sentinel-aws-secret",
            "OPENAI_API_KEY": "sentinel-api-key",
            "API_TOKEN": "sentinel-api-token",
            "NODE_OPTIONS": "--require=/untrusted/inject.js",
            "HTTP_PROXY": "http://user:secret@proxy.invalid:8080",
            "HTTPS_PROXY": "http://user:secret@proxy.invalid:8080",
            "ALL_PROXY": "http://user:secret@proxy.invalid:8080",
            "http_proxy": "http://user:secret@proxy.invalid:8080",
            "npm_config_userconfig": "/parent/.npmrc",
            "NPM_CONFIG_USERCONFIG": "/parent/.npmrc",
            "npm_config_globalconfig": "/parent/npmrc",
            "npm_config_cache": "/parent/npm-cache",
            "GIT_CONFIG_GLOBAL": "/parent/.gitconfig",
            "GIT_CONFIG_NOSYSTEM": "0",
            "GIT_TERMINAL_PROMPT": "1",
        }

        with (
            patch.dict(os.environ, inherited, clear=True),
            patch.object(subprocess, "Popen", side_effect=spawn),
        ):
            self.acquire(work)

        command, kwargs, _process = calls[0]
        env = kwargs["env"]
        for key in (
            "GITHUB_TOKEN", "GH_TOKEN", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY",
            "OPENAI_API_KEY", "API_TOKEN", "NODE_OPTIONS", "HTTP_PROXY", "HTTPS_PROXY",
            "ALL_PROXY", "http_proxy", "NPM_CONFIG_USERCONFIG",
        ):
            self.assertNotIn(key, set(env), f"sensitive inherited variable {key} must be excluded")
        self.assertEqual(
            set(env),
            {
                "PATH", "LANG", "LC_ALL", "CI", "DO_NOT_TRACK", "HOME", "XDG_CONFIG_HOME",
                "CODEX_HOME", "TMPDIR", "XDG_STATE_HOME", "npm_config_cache",
                "npm_config_userconfig", "npm_config_globalconfig", "npm_config_audit",
                "npm_config_fund", "npm_config_update_notifier", "GIT_CONFIG_NOSYSTEM",
                "GIT_CONFIG_GLOBAL", "GIT_TERMINAL_PROMPT",
            },
            "child environment keys must match the explicit allowlist",
        )
        self.assertEqual(env["PATH"], inherited["PATH"])
        self.assertEqual(env["LANG"], inherited["LANG"])
        self.assertEqual(env["LC_ALL"], inherited["LC_ALL"])
        self.assertEqual(env["CI"], "1")
        self.assertEqual(env["DO_NOT_TRACK"], "1")
        self.assertEqual(env["HOME"], str(work / "home"))
        self.assertEqual(env["XDG_CONFIG_HOME"], str(work / "config"))
        self.assertEqual(env["CODEX_HOME"], str(work / "codex-runtime"))
        self.assertEqual(env["TMPDIR"], str(work / "tmp"))
        self.assertEqual(env["XDG_STATE_HOME"], str(work / "state"))
        self.assertEqual(env["npm_config_cache"], str(work / "npm-cache"))
        self.assertEqual(env["npm_config_userconfig"], str(work / "npm-userconfig"))
        self.assertEqual(env["npm_config_globalconfig"], str(work / "npm-globalconfig"))
        self.assertEqual(env["npm_config_audit"], "false")
        self.assertEqual(env["npm_config_fund"], "false")
        self.assertEqual(env["npm_config_update_notifier"], "false")
        self.assertEqual(env["GIT_CONFIG_NOSYSTEM"], "1")
        self.assertEqual(env["GIT_CONFIG_GLOBAL"], str(work / "gitconfig"))
        self.assertEqual(env["GIT_TERMINAL_PROMPT"], "0")
        self.assertEqual(kwargs["cwd"], work)
        self.assertEqual(command[0], "npx")
        self.assertTrue((work / "npm-userconfig").is_file())
        self.assertTrue((work / "npm-globalconfig").is_file())
        self.assertTrue((work / "gitconfig").is_file())

    def test_acquisition_accepts_deployed_cli_record_shape(self) -> None:
        work = self.base / "deployed-shape"
        work.mkdir()

        def setup(cwd: Path) -> None:
            write_candidates(cwd / ".agents" / "skills", variant=b"latest")

        rows = [
            {
                "name": skill,
                "status": "installed",
                "source": "obra/superpowers",
                "ref": None,
                "scope": "project",
                "agents": ["Codex"],
                "mode": "copy",
                "path": str(work / ".agents" / "skills" / skill),
            }
            for skill in FILES
        ]
        spawn, _calls = self.make_runner(json.dumps(rows), setup=setup)

        with patch.object(subprocess, "Popen", side_effect=spawn):
            try:
                acquired = self.acquire(work)
            except installer.InstallerError as exc:
                self.fail(f"deployed skills@latest JSON record was rejected: {exc}")

        self.assertEqual(
            acquired,
            {skill: work / ".agents" / "skills" / skill for skill in FILES},
        )

    def test_acquisition_rejects_unexpected_source_or_pinned_ref(self) -> None:
        work = self.base / "wrong-source"
        work.mkdir()
        rows = json.loads(self.records(work))
        rows[0].update(source="untrusted/fork", ref="deadbeef")
        spawn, _calls = self.make_runner(json.dumps(rows))

        with patch.object(subprocess, "Popen", side_effect=spawn):
            with self.assertRaises(installer.InstallerError):
                self.acquire(work)

    def test_acquisition_rejects_missing_ref_field(self) -> None:
        work = self.base / "missing-ref"
        work.mkdir()
        rows = json.loads(self.records(work))
        del rows[0]["ref"]

        def setup(cwd: Path) -> None:
            write_candidates(cwd / ".agents" / "skills", variant=b"latest")

        spawn, _calls = self.make_runner(json.dumps(rows), setup=setup)

        with patch.object(subprocess, "Popen", side_effect=spawn):
            try:
                self.acquire(work)
            except installer.InstallerError:
                return
            self.fail("deployed CLI result without explicit null ref was accepted")

    def test_acquisition_rejects_partial_json(self) -> None:
        work = self.base / "work"
        work.mkdir()
        spawn, _ = self.make_runner(lambda cwd: self.records(cwd, names=tuple(FILES)[:-1]))

        with patch.object(subprocess, "Popen", side_effect=spawn):
            with self.assertRaises(installer.InstallerError):
                self.acquire(work)

    def test_acquisition_rejects_failed_or_skipped_results(self) -> None:
        for status in ("failed", "skipped"):
            with self.subTest(status=status):
                work = self.base / status
                work.mkdir()
                spawn, _ = self.make_runner(lambda cwd: self.records(cwd, status=status))
                with patch.object(subprocess, "Popen", side_effect=spawn):
                    with self.assertRaises(installer.InstallerError):
                        self.acquire(work)

    def test_acquisition_rejects_missing_required_file(self) -> None:
        work = self.base / "work"
        work.mkdir()

        def setup(cwd: Path) -> None:
            candidates = write_candidates(cwd / ".agents" / "skills", variant=b"latest")
            (candidates["writing-plans"] / "SKILL.md").unlink()

        spawn, _ = self.make_runner(lambda cwd: self.records(cwd), setup=setup)
        with patch.object(subprocess, "Popen", side_effect=spawn):
            with self.assertRaises(installer.InstallerError) as caught:
                self.acquire(work)
        self.assertIn("SKILL.md", str(caught.exception))

    def test_acquisition_rejects_path_mismatch_and_duplicate_names(self) -> None:
        for case in ("path", "duplicate"):
            with self.subTest(case=case):
                work = self.base / case
                work.mkdir()
                names = tuple(FILES)
                overrides = {"brainstorming": str(self.base / "other-skill")} if case == "path" else None
                output = self.records(work, path_overrides=overrides)
                if case == "duplicate":
                    rows = json.loads(output)
                    output = json.dumps([*rows, rows[0]])
                spawn, _ = self.make_runner(output)
                with patch.object(subprocess, "Popen", side_effect=spawn):
                    with self.assertRaises(installer.InstallerError):
                        self.acquire(work)

    def test_acquisition_rejects_malformed_json(self) -> None:
        work = self.base / "work"
        work.mkdir()
        spawn, _ = self.make_runner(b"[not json")

        with patch.object(subprocess, "Popen", side_effect=spawn):
            with self.assertRaises(installer.InstallerError):
                self.acquire(work)

    def test_acquisition_rejects_nonzero_exit(self) -> None:
        work = self.base / "work"
        work.mkdir()
        spawn, _ = self.make_runner(self.records(work), returncode=1, stderr=b"network failed")

        with patch.object(subprocess, "Popen", side_effect=spawn):
            with self.assertRaises(installer.InstallerError) as caught:
                self.acquire(work)
        self.assertIn("network failed", str(caught.exception))

    def test_acquisition_reports_missing_npx(self) -> None:
        work = self.base / "work"
        work.mkdir()

        with patch.object(subprocess, "Popen", side_effect=FileNotFoundError("npx not found")):
            with self.assertRaises(installer.InstallerError) as caught:
                self.acquire(work)
        self.assertIn("npx not found", str(caught.exception))

    def test_acquisition_timeout_terminates_process_group_and_cleans_work(self) -> None:
        work = self.base / "timeout"
        work.mkdir()

        def setup(cwd: Path) -> None:
            write_candidates(cwd / ".agents" / "skills", variant=b"partial")

        outcomes = [
            subprocess.TimeoutExpired("npx", 300),
            subprocess.TimeoutExpired("npx", 5),
            (b"", b""),
        ]
        spawn, calls = self.make_runner(
            lambda cwd: self.records(cwd), setup=setup, communicate_outcomes=outcomes
        )
        with (
            patch.object(subprocess, "Popen", side_effect=spawn),
            patch.object(installer.os, "killpg") as killpg,
        ):
            try:
                self.acquire(work)
            except subprocess.TimeoutExpired as exc:
                self.fail(f"timed out child must be stopped and reported as InstallerError: {exc}")
            except installer.InstallerError as exc:
                self.assertIn("timed out", str(exc))
            else:
                self.fail("timed out acquisition unexpectedly succeeded")

        process = calls[0][2]
        self.assertEqual(process.communicate_timeouts, [300, 5, None])
        self.assertEqual(
            [call.args for call in killpg.call_args_list],
            [(process.pid, signal.SIGTERM), (process.pid, signal.SIGKILL)],
        )
        self.assertEqual(list(work.iterdir()), [])

    def test_acquisition_interrupt_terminates_process_group_and_cleans_work(self) -> None:
        work = self.base / "interrupt"
        work.mkdir()

        def setup(cwd: Path) -> None:
            write_candidates(cwd / ".agents" / "skills", variant=b"partial")

        spawn, calls = self.make_runner(
            lambda cwd: self.records(cwd),
            setup=setup,
            communicate_outcomes=[KeyboardInterrupt(), (b"", b"")],
        )
        with (
            patch.object(subprocess, "Popen", side_effect=spawn),
            patch.object(installer.os, "killpg") as killpg,
        ):
            with self.assertRaises(KeyboardInterrupt):
                self.acquire(work)

        process = calls[0][2]
        self.assertEqual(process.communicate_timeouts, [300, 5])
        self.assertEqual([call.args for call in killpg.call_args_list], [(process.pid, signal.SIGTERM)])
        self.assertEqual(list(work.iterdir()), [])

    def test_staging_rewrites_absolute_internal_link(self) -> None:
        source = write_candidate(self.base / "source", "writing-plans", variant=b"latest")
        reference = source / "reference.md"
        reference.write_bytes(b"reference")
        (source / "reference-link.md").symlink_to(reference)
        destination = self.base / "staged" / "writing-plans"
        destination.parent.mkdir()

        self.stage(source, destination)

        self.assertFalse(Path(os.readlink(destination / "reference-link.md")).is_absolute())
        self.assertEqual((destination / "reference-link.md").read_bytes(), b"reference")

    def test_staging_preserves_internal_directory_link_as_relative(self) -> None:
        source = write_candidate(self.base / "source", "writing-plans", variant=b"latest")
        shared = source / "shared"
        shared.mkdir()
        (shared / "guide.md").write_bytes(b"guide")
        (source / "shared-link").symlink_to(shared, target_is_directory=True)
        destination = self.base / "staged" / "writing-plans"
        destination.parent.mkdir()

        self.stage(source, destination)

        self.assertFalse(Path(os.readlink(destination / "shared-link")).is_absolute())
        self.assertEqual((destination / "shared-link" / "guide.md").read_bytes(), b"guide")

    def test_staging_rejects_escape_link_before_copy(self) -> None:
        source = write_candidate(self.base / "source", "writing-plans", variant=b"latest")
        outside = self.base / "outside.md"
        outside.write_bytes(b"outside")
        (source / "escape.md").symlink_to(outside)
        destination = self.base / "staged" / "writing-plans"
        destination.parent.mkdir()

        with self.assertRaises(installer.InstallerError):
            self.stage(source, destination)

        self.assertFalse(os.path.lexists(destination))

    def test_staging_rejects_existing_destination(self) -> None:
        source = write_candidate(self.base / "source", "writing-plans", variant=b"latest")
        destination = self.base / "staged" / "writing-plans"
        destination.mkdir(parents=True)
        (destination / "stale.txt").write_bytes(b"stale")
        before = tree_state(destination)

        with self.assertRaises(installer.InstallerError):
            self.stage(source, destination)

        self.assertEqual(tree_state(destination), before)

    def test_blank_codex_home_fails_before_acquisition(self) -> None:
        payload = installer_payload(self.base)
        import io
        from contextlib import redirect_stderr, redirect_stdout

        stdout, stderr = io.StringIO(), io.StringIO()
        with (
            patch.object(installer, "__file__", str(payload / "install.py")),
            patch.object(Path, "home", return_value=self.user_home),
            patch.dict(os.environ, {"CODEX_HOME": ""}),
            patch.object(installer, "acquire_external_skills", create=True) as acquire,
            redirect_stdout(stdout),
            redirect_stderr(stderr),
        ):
            status = installer.main([])

        self.assertEqual(status, 2, stdout.getvalue() + stderr.getvalue())
        self.assertIn("CODEX_HOME is set but empty", stderr.getvalue())
        acquire.assert_not_called()
