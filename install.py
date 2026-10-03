#!/usr/bin/env python3
"""Install the staged Yunho Harness files into a Codex home."""

from __future__ import annotations

import sys

if sys.version_info < (3, 11):
    print("Yunho Harness installer requires Python 3.11 or newer.", file=sys.stderr)
    raise SystemExit(2)

import argparse
import hashlib
import os
import re
import shutil
import stat
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath


INSTALL_NAME = "yunho-harness"
PROFILE_FILES = (
    "yunho-team-lead.toml",
    "yunho-team-secretary.toml",
    "yunho-team-planner.toml",
    "yunho-team-scout.toml",
    "yunho-team-coder.toml",
    "yunho-team-qa.toml",
    "yunho-team-reviewer.toml",
)
MANIFEST_REQUIRED_ROOTS = ("skill", "agents", "dependencies")
MANIFEST_REQUIRED_FILES = ("install.py", "install.command")
MANIFEST_LINE = re.compile(r"^([0-9a-fA-F]{64})  (.+)$")


class InstallerError(Exception):
    """A safely reported installation or payload validation error."""


def absolute(path: Path) -> Path:
    return Path(os.path.abspath(os.fspath(path)))


def reject_symlink_components(path: Path) -> None:
    """Reject symlinks anywhere along a path, including its final component."""
    path = absolute(path)
    current = Path(path.anchor)
    for component in path.parts[1:]:
        current /= component
        try:
            mode = current.lstat().st_mode
        except FileNotFoundError:
            continue
        except OSError as exc:
            raise InstallerError(f"cannot inspect path {current}: {exc}") from exc
        if stat.S_ISLNK(mode):
            raise InstallerError(f"symlink path is unsafe: {current}")


def reject_symlinks_in_tree(root: Path) -> None:
    reject_symlink_components(root)
    if not root.is_dir():
        raise InstallerError(f"expected a directory: {root}")
    for directory, names, files in os.walk(root, followlinks=False):
        for name in (*names, *files):
            path = Path(directory) / name
            if path.is_symlink():
                raise InstallerError(f"symlink in payload or existing Harness directory is unsafe: {path}")


def require_regular_file(path: Path) -> None:
    reject_symlink_components(path)
    try:
        mode = path.lstat().st_mode
    except OSError as exc:
        raise InstallerError(f"required file is missing or unreadable: {path}: {exc}") from exc
    if not stat.S_ISREG(mode):
        raise InstallerError(f"expected a regular file: {path}")


def staged_root() -> Path:
    script = absolute(Path(__file__))
    reject_symlink_components(script)
    require_regular_file(script)
    root = script.parent
    for name in ("skill", "agents", "dependencies"):
        reject_symlinks_in_tree(root / name)
    require_regular_file(root / "skill" / "models.toml")
    require_regular_file(root / "skill" / "scripts" / "apply-models.py")
    for filename in PROFILE_FILES:
        require_regular_file(root / "agents" / filename)
    dependencies = root / "dependencies"
    if not any(path.is_dir() for path in dependencies.iterdir()):
        raise InstallerError(f"no dependency skills were found in {dependencies}")
    if any(not path.is_dir() for path in dependencies.iterdir()):
        raise InstallerError(f"dependency payload entries must all be skill directories: {dependencies}")
    return root


def verify_manifest(root: Path) -> None:
    manifest = root / "MANIFEST.sha256"
    if not manifest.exists():
        raise InstallerError(f"required SHA-256 manifest is missing: {manifest}")
    require_regular_file(manifest)
    try:
        lines = manifest.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeDecodeError) as exc:
        raise InstallerError(f"cannot read manifest {manifest}: {exc}") from exc

    listed: dict[str, str] = {}
    for number, line in enumerate(lines, start=1):
        if not line:
            continue
        match = MANIFEST_LINE.fullmatch(line)
        if match is None:
            raise InstallerError(f"malformed SHA-256 manifest entry at {manifest}:{number}")
        expected, raw_name = match.groups()
        if "\\" in raw_name:
            raise InstallerError(f"manifest paths must use relative POSIX paths: {raw_name!r}")
        if raw_name.startswith("./"):
            raw_name = raw_name[2:]
        relative = PurePosixPath(raw_name)
        if (
            not raw_name
            or relative.is_absolute()
            or any(part in ("", ".", "..") for part in relative.parts)
            or relative.as_posix() != raw_name
        ):
            raise InstallerError(f"unsafe manifest path: {raw_name!r}")
        name = relative.as_posix()
        if name == "MANIFEST.sha256" or name in listed:
            raise InstallerError(f"duplicate or self-referential manifest path: {name}")
        path = root.joinpath(*relative.parts)
        require_regular_file(path)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest.lower() != expected.lower():
            raise InstallerError(f"SHA-256 mismatch for {name}")
        listed[name] = expected.lower()

    required = {"/".join((directory, path.relative_to(root / directory).as_posix()))
                for directory in MANIFEST_REQUIRED_ROOTS
                for path in (root / directory).rglob("*")
                if path.is_file()}
    required.update(MANIFEST_REQUIRED_FILES)
    missing = sorted(required - set(listed))
    if missing:
        raise InstallerError("manifest does not cover required installer payload files: " + ", ".join(missing))
    print(f"Payload manifest verified ({len(listed)} files).")


def preflight_profiles(root: Path) -> None:
    validator = root / "skill" / "scripts" / "apply-models.py"
    result = subprocess.run(
        [
            sys.executable,
            str(validator),
            "--config",
            str(root / "skill" / "models.toml"),
            "--agents-dir",
            str(root / "agents"),
            "--check",
        ],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.stdout:
        print(result.stdout, end="" if result.stdout.endswith("\n") else "\n")
    if result.stderr:
        print(result.stderr, end="" if result.stderr.endswith("\n") else "\n", file=sys.stderr)
    if result.returncode != 0:
        raise InstallerError(f"staged model/profile preflight failed with exit code {result.returncode}")


def codex_home() -> Path:
    if "CODEX_HOME" in os.environ:
        raw = os.environ["CODEX_HOME"]
        if not raw.strip():
            raise InstallerError("CODEX_HOME is set but empty; unset it or provide a nonempty path")
        return absolute(Path(raw).expanduser())
    return absolute(Path.home() / ".codex")


def check_directory_or_missing(path: Path) -> bool:
    reject_symlink_components(path)
    if not path.exists():
        return False
    if not path.is_dir():
        raise InstallerError(f"expected a directory at install target: {path}")
    return True


def check_file_or_missing(path: Path) -> bool:
    reject_symlink_components(path)
    if not path.exists():
        return False
    if not path.is_file():
        raise InstallerError(f"expected a regular file at install target: {path}")
    return True


def install_plan(root: Path, home: Path) -> tuple[Path, Path, Path, dict[str, Path], list[tuple[Path, Path]]]:
    skills_dir = home / "skills"
    agents_dir = home / "agents"
    backups_dir = home / "backups"
    harness_target = skills_dir / INSTALL_NAME
    profile_targets = {filename: agents_dir / filename for filename in PROFILE_FILES}

    for path in (home, skills_dir, agents_dir, backups_dir, harness_target, *profile_targets.values()):
        reject_symlink_components(path)
    check_directory_or_missing(harness_target)
    for path in profile_targets.values():
        check_file_or_missing(path)
    if harness_target.exists():
        reject_symlinks_in_tree(harness_target)

    user_skills = absolute(Path.home() / ".agents" / "skills")
    dependencies_to_install: list[tuple[Path, Path]] = []
    for source in sorted((root / "dependencies").iterdir(), key=lambda path: path.name):
        selected_target = skills_dir / source.name
        user_target = user_skills / source.name
        reject_symlink_components(selected_target)
        reject_symlink_components(user_target)
        selected_exists = check_directory_or_missing(selected_target)
        user_exists = check_directory_or_missing(user_target)
        if selected_exists or user_exists:
            retained = selected_target if selected_exists else user_target
            print(f"Keeping existing dependency skill: {retained}")
        else:
            dependencies_to_install.append((source, selected_target))
    return skills_dir, agents_dir, backups_dir, profile_targets, dependencies_to_install


def make_backup_directory(parent: Path) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    for suffix in range(1000):
        name = f"yunho-harness-{stamp}" + (f"-{suffix}" if suffix else "")
        candidate = parent / name
        try:
            candidate.mkdir()
            return candidate
        except FileExistsError:
            continue
    raise InstallerError(f"could not allocate a unique backup directory under {parent}")


def backup_existing(harness_target: Path, profile_targets: dict[str, Path], backup_root: Path) -> None:
    if harness_target.exists():
        target = backup_root / "skills" / INSTALL_NAME
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(harness_target, target, copy_function=shutil.copy2)
    for filename, source in profile_targets.items():
        if source.exists():
            target = backup_root / "agents" / filename
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)


def create_stage_area(parent: Path, label: str) -> Path:
    return Path(tempfile.mkdtemp(prefix=f".yunho-harness-{label}-", dir=parent))


def remove_path(path: Path) -> None:
    if not path.exists():
        return
    if path.is_dir() and not path.is_symlink():
        shutil.rmtree(path)
    else:
        path.unlink()


def rollback(actions: list[dict[str, object]]) -> list[str]:
    errors: list[str] = []
    for action in reversed(actions):
        target = action["target"]
        previous = action["previous"]
        installed = action["installed"]
        assert isinstance(target, Path)
        assert previous is None or isinstance(previous, Path)
        try:
            if installed:
                remove_path(target)
            if previous is not None and previous.exists():
                os.replace(previous, target)
        except OSError as exc:
            errors.append(f"{target}: {exc}")
    return errors


def perform_install(root: Path, home: Path, dry_run: bool = False) -> None:
    skills_dir, agents_dir, backups_dir, profile_targets, dependencies = install_plan(root, home)
    if dry_run:
        print(f"Would install Harness skill: {skills_dir / INSTALL_NAME}")
        print(f"Would install seven profiles: {agents_dir}")
        for _, target in dependencies:
            print(f"Would install dependency skill: {target}")
        return

    for directory in (home, skills_dir, agents_dir, backups_dir):
        reject_symlink_components(directory)
        directory.mkdir(parents=True, exist_ok=True)
        reject_symlink_components(directory)

    harness_target = skills_dir / INSTALL_NAME
    backup_root = make_backup_directory(backups_dir)
    try:
        backup_existing(harness_target, profile_targets, backup_root)
    except BaseException:
        raise

    stage_areas: list[Path] = []
    actions: list[dict[str, object]] = []
    try:
        skill_stage_area = create_stage_area(skills_dir, "stage")
        stage_areas.append(skill_stage_area)
        staged_harness = skill_stage_area / INSTALL_NAME
        shutil.copytree(root / "skill", staged_harness, copy_function=shutil.copy2)

        profile_stage_area = create_stage_area(agents_dir, "profiles")
        stage_areas.append(profile_stage_area)
        staged_profiles: dict[str, Path] = {}
        for filename in PROFILE_FILES:
            staged = profile_stage_area / filename
            shutil.copy2(root / "agents" / filename, staged)
            staged_profiles[filename] = staged

        dependency_stages: list[tuple[Path, Path]] = []
        if dependencies:
            dependency_stage_area = create_stage_area(skills_dir, "dependencies")
            stage_areas.append(dependency_stage_area)
            for index, (source, target) in enumerate(dependencies):
                staged = dependency_stage_area / f"{index}-{source.name}"
                shutil.copytree(source, staged, copy_function=shutil.copy2)
                dependency_stages.append((staged, target))

        old_harness = skill_stage_area / "previous-harness"
        harness_action: dict[str, object] = {"target": harness_target, "previous": None, "installed": False}
        if harness_target.exists():
            os.replace(harness_target, old_harness)
            harness_action["previous"] = old_harness
        actions.append(harness_action)
        os.replace(staged_harness, harness_target)
        harness_action["installed"] = True

        for filename in PROFILE_FILES:
            target = profile_targets[filename]
            previous = profile_stage_area / f"previous-{filename}"
            action: dict[str, object] = {"target": target, "previous": None, "installed": False}
            if target.exists():
                os.replace(target, previous)
                action["previous"] = previous
            actions.append(action)
            os.replace(staged_profiles[filename], target)
            action["installed"] = True

        for staged, target in dependency_stages:
            reject_symlink_components(target)
            if target.exists():
                raise InstallerError(f"dependency target appeared during installation: {target}")
            action = {"target": target, "previous": None, "installed": False}
            actions.append(action)
            os.replace(staged, target)
            action["installed"] = True

    except BaseException as exc:
        rollback_errors = rollback(actions)
        if rollback_errors:
            print("Rollback had errors: " + "; ".join(rollback_errors), file=sys.stderr)
        if isinstance(exc, Exception):
            raise InstallerError(f"installation failed; prior files were restored where possible: {exc}") from exc
        raise
    finally:
        for area in reversed(stage_areas):
            try:
                shutil.rmtree(area, ignore_errors=False)
            except FileNotFoundError:
                pass
            except OSError as exc:
                print(f"Could not remove temporary staging directory {area}: {exc}", file=sys.stderr)

    print(f"Installed Harness skill and profiles under: {home}")
    print(f"Backups: {backup_root}")
    print("Manual activation: add the loader from AGENTS.harness.md to an applicable AGENTS.md, then restart Codex.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Install the staged Yunho Harness into a Codex home.")
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--check", action="store_true", help="validate the staged manifest and all seven profiles without installing")
    action.add_argument("--dry-run", action="store_true", help="show planned targets without writing files")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        root = staged_root()
        verify_manifest(root)
        preflight_profiles(root)
        if args.check:
            print("Installer payload preflight passed.")
            return 0
        perform_install(root, codex_home(), dry_run=args.dry_run)
        return 0
    except (InstallerError, OSError, subprocess.SubprocessError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
