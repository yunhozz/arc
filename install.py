#!/usr/bin/env python3
"""Install the staged Yunho Harness files into a Codex home."""

from __future__ import annotations

import sys

if sys.version_info < (3, 11):
    print("Yunho Harness installer requires Python 3.11 or newer.", file=sys.stderr)
    raise SystemExit(2)

import argparse
import hashlib
import importlib.util
import os
import re
import shutil
import stat
import tempfile
import tomllib
from datetime import datetime, timezone
from types import ModuleType
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
REQUIRED_EXTERNAL_FILES = {
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
MANIFEST_REQUIRED_ROOTS = ("skill", "agents")
MANIFEST_REQUIRED_FILES = ("install.py", "install.command", "README.md", "external-skills.toml")
MUTABLE_PAYLOAD_FILES = {"skill/models.toml"}
MANIFEST_LINE = re.compile(r"^([0-9a-fA-F]{64})  (.+)$")
EXTERNAL_DIGEST = re.compile(r"[0-9a-fA-F]{64}")


class InstallerError(Exception):
    """A safely reported installation or payload validation error."""


SnapshotMap = dict[str, dict[str, dict[str, str]]]


def load_external_snapshots(root: Path) -> SnapshotMap:
    """Parse the reviewed external skill snapshots from the staged payload."""
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
            if (
                not isinstance(raw_path, str)
                or not raw_path
                or "\\" in raw_path
                or "\x00" in raw_path
            ):
                invalid(f"{label} has an unsafe file path")
            relative = PurePosixPath(raw_path)
            if (
                relative.is_absolute()
                or any(part in ("", ".", "..") for part in relative.parts)
                or relative.as_posix() != raw_path
            ):
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


def validate_external_skills(home: Path, user_home: Path, snapshots: SnapshotMap) -> None:
    """Read-only validation of the supported external skill locations."""
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


def _external_candidate_root(candidate: Path) -> Path | None:
    """Resolve an external skill root; return None only for ordinary absence."""
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


def require_directory(path: Path) -> None:
    reject_symlink_components(path)
    try:
        mode = path.lstat().st_mode
    except OSError as exc:
        raise InstallerError(f"required directory is missing or unreadable: {path}: {exc}") from exc
    if not stat.S_ISDIR(mode):
        raise InstallerError(f"expected a directory: {path}")


def selected_tree_files(tree: Path) -> tuple[Path, ...]:
    """Validate a payload tree and return regular files except regular .DS_Store files."""
    tree = absolute(tree)
    require_directory(tree)
    selected: list[Path] = []

    def raise_walk_error(exc: OSError) -> None:
        raise InstallerError(f"cannot inspect payload tree {tree}: {exc}") from exc

    for directory, directory_names, file_names in os.walk(
        tree, topdown=True, followlinks=False, onerror=raise_walk_error
    ):
        parent = Path(directory)
        for name in sorted(directory_names):
            path = parent / name
            try:
                mode = path.lstat().st_mode
            except OSError as exc:
                raise InstallerError(f"cannot inspect payload entry {path}: {exc}") from exc
            if stat.S_ISLNK(mode):
                raise InstallerError(f"symlink in payload is unsafe: {path}")
            if name == ".DS_Store":
                raise InstallerError(f".DS_Store payload entry must be a regular file: {path}")
            if not stat.S_ISDIR(mode):
                raise InstallerError(f"unexpected payload entry type: {path}")
        for name in sorted(file_names):
            path = parent / name
            try:
                mode = path.lstat().st_mode
            except OSError as exc:
                raise InstallerError(f"cannot inspect payload entry {path}: {exc}") from exc
            if stat.S_ISLNK(mode):
                raise InstallerError(f"symlink in payload is unsafe: {path}")
            if name == ".DS_Store":
                if not stat.S_ISREG(mode):
                    raise InstallerError(f".DS_Store payload entry must be a regular file: {path}")
                continue
            if not stat.S_ISREG(mode):
                raise InstallerError(f"unexpected payload entry type: {path}")
            selected.append(path)
    return tuple(sorted(selected))


def staged_root() -> Path:
    script = absolute(Path(__file__))
    reject_symlink_components(script)
    require_regular_file(script)
    root = script.parent
    selected_tree_files(root / "skill")
    selected_tree_files(root / "agents")
    require_regular_file(root / "skill" / "models.toml")
    require_regular_file(root / "skill" / "scripts" / "apply-models.py")
    require_regular_file(root / "skill" / "scripts" / "model_config.py")
    for filename in PROFILE_FILES:
        require_regular_file(root / "agents" / filename)
    for filename in MANIFEST_REQUIRED_FILES:
        require_regular_file(root / filename)
    return root


def verify_manifest(root: Path) -> None:
    manifest = root / "MANIFEST.sha256"
    require_regular_file(manifest)
    selected_payload = {
        path.relative_to(root).as_posix()
        for directory in MANIFEST_REQUIRED_ROOTS
        for path in selected_tree_files(root / directory)
    }
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
        if name == "MANIFEST.sha256" or name in MUTABLE_PAYLOAD_FILES or ".DS_Store" in relative.parts:
            raise InstallerError(f"manifest must not list mutable or excluded payload path: {name}")
        if name in listed:
            raise InstallerError(f"duplicate or self-referential manifest path: {name}")
        path = root.joinpath(*relative.parts)
        require_regular_file(path)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest.lower() != expected.lower():
            raise InstallerError(f"SHA-256 mismatch for {name}")
        listed[name] = expected.lower()

    required = set(MANIFEST_REQUIRED_FILES)
    required.update(selected_payload - MUTABLE_PAYLOAD_FILES)
    missing = sorted(required - set(listed))
    if missing:
        raise InstallerError("manifest does not cover required installer payload files: " + ", ".join(missing))
    print(f"Immutable payload manifest verified ({len(listed)} files).")


def load_model_module(root: Path) -> ModuleType:
    module_path = absolute(root / "skill" / "scripts" / "model_config.py")
    try:
        spec = importlib.util.spec_from_file_location("_yunho_harness_model_config", module_path)
        if spec is None or spec.loader is None:
            raise InstallerError(f"cannot load shared model configuration module: {module_path}")
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        write_bytecode = sys.dont_write_bytecode
        sys.dont_write_bytecode = True
        try:
            try:
                spec.loader.exec_module(module)
            except Exception:
                sys.modules.pop(spec.name, None)
                raise
        finally:
            sys.dont_write_bytecode = write_bytecode
    except InstallerError:
        raise
    except Exception as exc:
        raise InstallerError(f"cannot load shared model configuration module at {module_path}: {exc}") from exc
    return module


def preflight_profiles(root: Path, module: ModuleType) -> dict[str, bytes]:
    config_path = root / "skill" / "models.toml"
    try:
        settings = module.load_settings(config_path)
    except module.ValidationError as exc:
        raise InstallerError(str(exc)) from exc

    rendered: dict[str, bytes] = {}
    for role, filename in module.ROLE_FILES.items():
        source = root / "agents" / filename
        try:
            require_regular_file(source)
            content = source.read_bytes()
            module.validate_template(content, role, source)
            rendered[filename] = module.render_profile(content, role, settings[role], source)
        except module.ValidationError as exc:
            raise InstallerError(str(exc)) from exc
        except OSError as exc:
            raise InstallerError(f"cannot read source profile {source}: {exc}") from exc
    if set(rendered) != set(PROFILE_FILES):
        raise InstallerError("shared model configuration does not define exactly the seven profile files")
    return rendered


def ignore_ds_store(directory: str, names: list[str]) -> set[str]:
    """Exclude only validated regular .DS_Store files from staged tree copies."""
    excluded: set[str] = set()
    for name in names:
        if name != ".DS_Store":
            continue
        path = Path(directory) / name
        try:
            mode = path.lstat().st_mode
        except OSError as exc:
            raise InstallerError(f"cannot inspect .DS_Store payload entry {path}: {exc}") from exc
        if not stat.S_ISREG(mode):
            raise InstallerError(f".DS_Store payload entry must be a regular file: {path}")
        excluded.add(name)
    return excluded


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


def install_plan(root: Path, home: Path) -> tuple[Path, Path, Path, dict[str, Path]]:
    skills_dir = home / "skills"
    agents_dir = home / "agents"
    backups_dir = home / "backups"
    harness_target = skills_dir / INSTALL_NAME
    profile_targets = {filename: agents_dir / filename for filename in PROFILE_FILES}

    for path in (home, skills_dir, agents_dir, backups_dir, harness_target, *profile_targets.values()):
        reject_symlink_components(path)
    for path in (home, skills_dir, agents_dir, backups_dir):
        check_directory_or_missing(path)
    check_directory_or_missing(harness_target)
    for path in profile_targets.values():
        check_file_or_missing(path)
    if harness_target.exists():
        reject_symlinks_in_tree(harness_target)

    snapshots = load_external_snapshots(root)
    validate_external_skills(home, absolute(Path.home()), snapshots)
    return skills_dir, agents_dir, backups_dir, profile_targets


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


def perform_install(root: Path, home: Path, rendered_profiles: dict[str, bytes], dry_run: bool = False) -> None:
    skills_dir, agents_dir, backups_dir, profile_targets = install_plan(root, home)
    if dry_run:
        print(f"Would install Harness skill: {skills_dir / INSTALL_NAME}")
        print(f"Would install seven profiles: {agents_dir}")
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
        shutil.copytree(
            root / "skill",
            staged_harness,
            copy_function=shutil.copy2,
            ignore=ignore_ds_store,
        )

        profile_stage_area = create_stage_area(agents_dir, "profiles")
        stage_areas.append(profile_stage_area)
        staged_profiles: dict[str, Path] = {}
        for filename in PROFILE_FILES:
            source = root / "agents" / filename
            staged = profile_stage_area / filename
            try:
                with staged.open("xb") as handle:
                    handle.write(rendered_profiles[filename])
                shutil.copystat(source, staged)
            except OSError as exc:
                raise InstallerError(f"cannot stage generated profile {filename}: {exc}") from exc
            staged_profiles[filename] = staged

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
    print(f"설치 안내: {root / 'README.md'}")
    print(f"설치된 Harness skill: {skills_dir / INSTALL_NAME / 'SKILL.md'}")
    print("수동 활성화: README.md의 loader를 해당 AGENTS.md에 추가하고 Codex를 다시 시작하세요.")


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
        model_config = load_model_module(root)
        rendered_profiles = preflight_profiles(root, model_config)
        home = codex_home()
        if args.check:
            install_plan(root, home)
            print("Installer payload preflight passed.")
            return 0
        perform_install(root, home, rendered_profiles, dry_run=args.dry_run)
        return 0
    except (InstallerError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
