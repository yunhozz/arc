#!/usr/bin/env python3
"""Install the staged Yunho Harness files into a Codex home."""

from __future__ import annotations

import sys

if sys.version_info < (3, 11):
    print("Yunho Harness installer requires Python 3.11 or newer.", file=sys.stderr)
    raise SystemExit(2)

import argparse
import hashlib
import json
import importlib.util
import os
import re
import shutil
import shlex
import signal
import stat
import subprocess
import tempfile
from datetime import datetime, timezone
from types import ModuleType
from pathlib import Path, PurePosixPath


INSTALL_NAME = "yunho-harness"
PROFILE_FILES = (
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
}
MANIFEST_REQUIRED_ROOTS = ("skill", "agents")
MANIFEST_REQUIRED_FILES = ("install.py", "install.command", "README.md")
MUTABLE_PAYLOAD_FILES = {"skill/models.toml"}
MANIFEST_LINE = re.compile(r"^([0-9a-fA-F]{64})  (.+)$")
EXTERNAL_SOURCE = "https://github.com/obra/superpowers"
EXTERNAL_FETCH_TIMEOUT_SECONDS = 300
EXTERNAL_TERMINATION_GRACE_SECONDS = 5


class InstallerError(Exception):
    """A safely reported installation or payload validation error."""


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



def validate_required_external_files(root: Path, required_files: tuple[str, ...]) -> None:
    """Validate only required regular files beneath an external skill root."""
    candidate = absolute(root)
    try:
        resolved_root = candidate.resolve(strict=True)
        root_mode = resolved_root.stat().st_mode
    except (OSError, RuntimeError, ValueError) as exc:
        raise InstallerError(f"cannot resolve external skill root {candidate}: {exc}") from exc
    if not stat.S_ISDIR(root_mode):
        raise InstallerError(f"external skill root is not a directory: {candidate}")

    errors: list[str] = []
    for raw_relative in required_files:
        if (
            not isinstance(raw_relative, str)
            or not raw_relative
            or "\\" in raw_relative
            or "\x00" in raw_relative
        ):
            errors.append(f"unsafe required file path: {raw_relative!r}")
            continue
        relative = PurePosixPath(raw_relative)
        if (
            relative.is_absolute()
            or any(part in ("", ".", "..") for part in relative.parts)
            or relative.as_posix() != raw_relative
        ):
            errors.append(f"unsafe required file path: {raw_relative!r}")
            continue

        original = resolved_root.joinpath(*relative.parts)
        try:
            actual = original.resolve(strict=True)
            if not actual.is_relative_to(resolved_root):
                raise InstallerError(f"root 외부 참조: {raw_relative} -> {actual}")
            if not stat.S_ISREG(actual.stat().st_mode):
                raise InstallerError(f"일반 파일이 아님: {raw_relative} -> {actual}")
        except (InstallerError, OSError, RuntimeError, ValueError) as exc:
            errors.append(f"파일 {raw_relative}: {exc}")

    if errors:
        raise InstallerError("\n".join(errors))


def validate_external_skills(home: Path, user_home: Path) -> None:
    """Read-only validation of required files in supported external skill locations."""
    errors: list[str] = []
    bases = (absolute(home / "skills"), absolute(user_home / ".agents" / "skills"))
    for skill, required_files in REQUIRED_EXTERNAL_FILES.items():
        found = False
        seen: set[Path] = set()
        for base in bases:
            candidate = base / skill
            try:
                resolved = _external_candidate_root(candidate)
            except (InstallerError, OSError, RuntimeError, ValueError) as exc:
                found = True
                errors.append(f"{skill}: 후보 {candidate}: root 해석 오류: {exc}")
                continue
            if resolved is None:
                continue
            found = True
            if resolved in seen:
                continue
            seen.add(resolved)
            try:
                validate_required_external_files(resolved, required_files)
            except InstallerError as exc:
                errors.append(f"{skill}: 후보 {candidate}: {exc}")
        if not found:
            candidates = ", ".join(str(base / skill) for base in bases)
            errors.append(f"{skill}: 필수 외부 스킬 누락; 후보 {candidates}")

    if errors:
        raise InstallerError("\n".join(errors))


def _validate_backupable_tree(root: Path) -> None:
    """Reject special entries without following symlinks that backups preserve."""
    def raise_walk_error(exc: OSError) -> None:
        raise InstallerError(f"cannot inspect existing external skill tree {root}: {exc}") from exc

    for directory, directory_names, file_names in os.walk(
        root, topdown=True, followlinks=False, onerror=raise_walk_error
    ):
        parent = Path(directory)
        for name in (*directory_names, *file_names):
            entry = parent / name
            try:
                mode = entry.lstat().st_mode
            except OSError as exc:
                raise InstallerError(f"cannot inspect existing external skill entry {entry}: {exc}") from exc
            if not (stat.S_ISDIR(mode) or stat.S_ISREG(mode) or stat.S_ISLNK(mode)):
                raise InstallerError(f"existing external skill tree contains a special file: {entry}")


def external_candidate_paths(home: Path, user_home: Path) -> dict[str, tuple[Path, ...]]:
    """List selected and existing legacy paths for read-only dry-run reporting."""
    home = absolute(home)
    user_home = absolute(user_home)
    targets: dict[str, tuple[Path, ...]] = {}
    for skill in REQUIRED_EXTERNAL_FILES:
        selected = home / "skills" / skill
        paths = [selected]
        legacy = user_home / ".agents" / "skills" / skill
        if os.path.lexists(legacy):
            paths.append(legacy)
        targets[skill] = tuple(paths)
    return targets


def external_write_targets(home: Path, user_home: Path) -> dict[str, tuple[Path, ...]]:
    """Resolve safe selected-home targets and existing legacy targets without writing."""
    home = absolute(home)
    user_home = absolute(user_home)

    def validate_target(path: Path) -> bool:
        path = absolute(path)
        reject_symlink_components(path)
        for parent in reversed(path.parents):
            try:
                mode = parent.lstat().st_mode
            except FileNotFoundError:
                continue
            except OSError as exc:
                raise InstallerError(f"cannot inspect install target parent {parent}: {exc}") from exc
            if not stat.S_ISDIR(mode):
                raise InstallerError(f"install target parent is not a directory: {parent}")
        try:
            mode = path.lstat().st_mode
        except FileNotFoundError:
            return False
        except OSError as exc:
            raise InstallerError(f"cannot inspect install target {path}: {exc}") from exc
        if not stat.S_ISDIR(mode):
            raise InstallerError(f"expected a directory at external skill install target: {path}")
        _validate_backupable_tree(path)
        return True

    targets: dict[str, tuple[Path, ...]] = {}
    for skill in REQUIRED_EXTERNAL_FILES:
        selected = home / "skills" / skill
        paths = [selected]
        validate_target(selected)
        legacy = user_home / ".agents" / "skills" / skill
        if os.path.lexists(legacy):
            validate_target(legacy)
            paths.append(legacy)
        targets[skill] = tuple(dict.fromkeys(paths))
    return targets


def validate_acquired_external_tree(root: Path, required_files: tuple[str, ...]) -> None:
    """Validate every acquired tree entry and all link targets before staging."""
    root = absolute(root)
    try:
        root_mode = root.lstat().st_mode
    except OSError as exc:
        raise InstallerError(f"cannot inspect acquired external skill root {root}: {exc}") from exc
    if stat.S_ISLNK(root_mode) or not stat.S_ISDIR(root_mode):
        raise InstallerError(f"acquired external skill root must be a real directory: {root}")
    resolved_root = root.resolve(strict=True)

    def raise_walk_error(exc: OSError) -> None:
        raise InstallerError(f"cannot inspect acquired external skill tree {root}: {exc}") from exc

    directory_graph: dict[Path, set[Path]] = {resolved_root: set()}
    for directory, directory_names, file_names in os.walk(
        resolved_root, topdown=True, followlinks=False, onerror=raise_walk_error
    ):
        parent = Path(directory)
        directory_graph.setdefault(parent, set())
        for name in (*directory_names, *file_names):
            entry = parent / name
            try:
                mode = entry.lstat().st_mode
            except OSError as exc:
                raise InstallerError(f"cannot inspect acquired external skill entry {entry}: {exc}") from exc
            if stat.S_ISDIR(mode):
                directory_graph[parent].add(entry)
                directory_graph.setdefault(entry, set())
                continue
            if stat.S_ISREG(mode):
                continue
            if not stat.S_ISLNK(mode):
                raise InstallerError(f"acquired external skill tree contains a special file: {entry}")
            try:
                target = entry.resolve(strict=True)
                if not target.is_relative_to(resolved_root):
                    raise InstallerError(f"acquired external skill link escapes its root: {entry} -> {target}")
                target_mode = target.stat().st_mode
                if not (stat.S_ISDIR(target_mode) or stat.S_ISREG(target_mode)):
                    raise InstallerError(f"acquired external skill link has an invalid target: {entry} -> {target}")
                if stat.S_ISDIR(target_mode):
                    directory_graph[parent].add(target)
                    directory_graph.setdefault(target, set())
                    if entry.parent.resolve(strict=True).is_relative_to(target):
                        raise InstallerError(f"acquired external skill directory link creates a cycle: {entry} -> {target}")
            except (InstallerError, OSError, RuntimeError, ValueError) as exc:
                raise InstallerError(f"invalid acquired external skill link {entry}: {exc}") from exc

    colors: dict[Path, int] = {}
    for start in directory_graph:
        if colors.get(start) == 2:
            continue
        colors[start] = 1
        stack = [(start, iter(sorted(directory_graph[start], key=os.fspath)))]
        while stack:
            directory, children = stack[-1]
            try:
                child = next(children)
            except StopIteration:
                colors[directory] = 2
                stack.pop()
                continue
            state = colors.get(child, 0)
            if state == 1:
                raise InstallerError(f"acquired external skill directory links create a cycle at {child}")
            if state == 2:
                continue
            colors[child] = 1
            stack.append((child, iter(sorted(directory_graph[child], key=os.fspath))))

    validate_required_external_files(resolved_root, required_files)



def stage_external_tree(source: Path, destination: Path) -> None:
    """Copy a validated skill tree and rewrite internal links as relative links."""
    source = absolute(source)
    required_files = REQUIRED_EXTERNAL_FILES.get(source.name)
    if required_files is None:
        raise InstallerError(f"unknown external skill tree: {source}")
    validate_acquired_external_tree(source, required_files)

    destination = absolute(destination)
    reject_symlink_components(destination)
    if os.path.lexists(destination):
        raise InstallerError(f"external skill staging destination already exists: {destination}")
    try:
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(source, destination, symlinks=True, copy_function=shutil.copy2)
        resolved_source = source.resolve(strict=True)
        for directory, directory_names, file_names in os.walk(
            destination, topdown=True, followlinks=False
        ):
            parent = Path(directory)
            for name in (*directory_names, *file_names):
                staged_link = parent / name
                if not staged_link.is_symlink():
                    continue
                relative_link = staged_link.relative_to(destination)
                source_link = source / relative_link
                resolved_target = source_link.resolve(strict=True)
                relative_target = resolved_target.relative_to(resolved_source)
                staged_target = destination / relative_target
                link_text = os.path.relpath(staged_target, staged_link.parent)
                staged_link.unlink()
                staged_link.symlink_to(
                    link_text,
                    target_is_directory=stat.S_ISDIR(resolved_target.stat().st_mode),
                )
        validate_acquired_external_tree(destination, required_files)
    except BaseException:
        if os.path.lexists(destination):
            try:
                mode = destination.lstat().st_mode
                if stat.S_ISDIR(mode) and not stat.S_ISLNK(mode):
                    shutil.rmtree(destination)
                else:
                    destination.unlink()
            except FileNotFoundError:
                pass
        raise

def _prepare_acquisition_work(work: Path) -> Path:
    work = absolute(work)
    try:
        mode = work.lstat().st_mode
    except OSError as exc:
        raise InstallerError(f"cannot inspect temporary acquisition directory {work}: {exc}") from exc
    if stat.S_ISLNK(mode) or not stat.S_ISDIR(mode):
        raise InstallerError(f"temporary acquisition path must be a real directory: {work}")
    try:
        if next(work.iterdir(), None) is not None:
            raise InstallerError(f"temporary acquisition directory must be empty: {work}")
        return work.resolve(strict=True)
    except (OSError, RuntimeError, ValueError) as exc:
        raise InstallerError(f"cannot prepare temporary acquisition directory {work}: {exc}") from exc


def _clear_acquisition_work(work: Path) -> None:
    try:
        entries = tuple(work.iterdir())
    except FileNotFoundError:
        return
    except OSError as exc:
        raise InstallerError(f"cannot inspect temporary acquisition directory {work}: {exc}") from exc
    for entry in entries:
        try:
            mode = entry.lstat().st_mode
            if stat.S_ISDIR(mode) and not stat.S_ISLNK(mode):
                shutil.rmtree(entry)
            else:
                entry.unlink()
        except FileNotFoundError:
            pass
        except OSError as exc:
            raise InstallerError(f"cannot clean temporary acquisition entry {entry}: {exc}") from exc


def _stop_acquisition_process(process: subprocess.Popen[bytes]) -> None:
    def signal_group(signum: int) -> None:
        try:
            os.killpg(process.pid, signum)
        except ProcessLookupError:
            pass

    signal_group(signal.SIGTERM)
    try:
        process.communicate(timeout=EXTERNAL_TERMINATION_GRACE_SECONDS)
    except subprocess.TimeoutExpired:
        signal_group(signal.SIGKILL)
        process.communicate()


def _decode_cli_output(value: bytes | str | None, stream: str) -> str:
    if isinstance(value, str):
        return value
    if value is None:
        return ""
    try:
        return value.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise InstallerError(f"external skill CLI returned non-UTF-8 {stream}") from exc


def _validate_acquisition_records(stdout: str, work: Path) -> None:
    try:
        records = json.loads(stdout)
    except json.JSONDecodeError as exc:
        raise InstallerError(f"external skill CLI returned invalid JSON: {exc}") from exc
    if not isinstance(records, list):
        raise InstallerError("external skill CLI JSON must be a list of skill results")

    expected = set(REQUIRED_EXTERNAL_FILES)
    seen: set[str] = set()
    for record in records:
        if not isinstance(record, dict):
            raise InstallerError("external skill CLI result must be an object")
        skill = record.get("name")
        if not isinstance(skill, str) or skill not in expected:
            raise InstallerError(f"external skill CLI returned an unexpected skill: {skill!r}")
        if skill in seen:
            raise InstallerError(f"external skill CLI returned duplicate result for {skill}")
        seen.add(skill)
        if (
            record.get("status") != "installed"
            or record.get("source") != "obra/superpowers"
            or "ref" not in record
            or record["ref"] is not None
            or record.get("scope") != "project"
            or record.get("agents") != ["Codex"]
            or record.get("mode") != "copy"
        ):
            raise InstallerError(f"external skill CLI did not install {skill} in the required mode")
        expected_path = str(work / ".agents" / "skills" / skill)
        if record.get("path") != expected_path:
            raise InstallerError(f"external skill CLI returned an unexpected path for {skill}")

    if seen != expected:
        missing = sorted(expected - seen)
        raise InstallerError("external skill CLI omitted required results: " + ", ".join(missing))


def _validate_acquisition_path(work: Path, root: Path) -> None:
    try:
        relative = root.relative_to(work)
    except ValueError as exc:
        raise InstallerError(f"acquired skill path escapes temporary project: {root}") from exc
    current = work
    for index, component in enumerate(relative.parts):
        current = current / component
        try:
            mode = current.lstat().st_mode
        except OSError as exc:
            raise InstallerError(f"cannot inspect acquired skill path component {current}: {exc}") from exc
        if stat.S_ISLNK(mode):
            raise InstallerError(f"symlink in acquired skill path is unsafe: {current}")
        if index < len(relative.parts) - 1 and not stat.S_ISDIR(mode):
            raise InstallerError(f"acquired skill path parent is not a directory: {current}")


def external_acquisition_command() -> list[str]:
    return [
        "npx", "--yes", "skills@latest", "add", EXTERNAL_SOURCE,
        "--skill", *REQUIRED_EXTERNAL_FILES,
        "--agent", "codex", "--yes", "--copy", "--json",
    ]


def acquire_external_skills(work: Path) -> dict[str, Path]:
    """Download and validate all required skills inside a dedicated temporary project."""
    work = _prepare_acquisition_work(work)
    temporary_home = work / "home"
    config_home = work / "config"
    codex_runtime = work / "codex-runtime"
    npm_cache = work / "npm-cache"
    state_home = work / "state"
    temp_dir = work / "tmp"
    npm_userconfig = work / "npm-userconfig"
    npm_globalconfig = work / "npm-globalconfig"
    gitconfig = work / "gitconfig"
    try:
        for directory in (temporary_home, config_home, codex_runtime, npm_cache, state_home, temp_dir):
            directory.mkdir()
        for config_file in (npm_userconfig, npm_globalconfig, gitconfig):
            config_file.touch()

        # Preserve only executable lookup and locale; credentials, proxies, user configs,
        # and Node injection flags must not reach the external package manager.
        env = {key: os.environ[key] for key in ("PATH", "LANG", "LC_ALL") if key in os.environ}
        env.update(
            {
                "CI": "1",
                "DO_NOT_TRACK": "1",
                "HOME": str(temporary_home),
                "XDG_CONFIG_HOME": str(config_home),
                "CODEX_HOME": str(codex_runtime),
                "TMPDIR": str(temp_dir),
                "XDG_STATE_HOME": str(state_home),
                "npm_config_cache": str(npm_cache),
                "npm_config_userconfig": str(npm_userconfig),
                "npm_config_globalconfig": str(npm_globalconfig),
                "npm_config_audit": "false",
                "npm_config_fund": "false",
                "npm_config_update_notifier": "false",
                "GIT_CONFIG_NOSYSTEM": "1",
                "GIT_CONFIG_GLOBAL": str(gitconfig),
                "GIT_TERMINAL_PROMPT": "0",
            }
        )
        command = external_acquisition_command()
        try:
            process = subprocess.Popen(
                command,
                cwd=work,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                start_new_session=True,
            )
        except OSError as exc:
            raise InstallerError(f"cannot start external skill CLI: {exc}") from exc

        try:
            stdout, stderr = process.communicate(timeout=EXTERNAL_FETCH_TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired as exc:
            _stop_acquisition_process(process)
            raise InstallerError(
                f"external skill acquisition timed out after {EXTERNAL_FETCH_TIMEOUT_SECONDS} seconds"
            ) from exc
        except KeyboardInterrupt:
            _stop_acquisition_process(process)
            raise

        stderr_text = _decode_cli_output(stderr, "stderr")
        if process.returncode != 0:
            detail = f": {stderr_text.strip()}" if stderr_text.strip() else ""
            raise InstallerError(f"external skill CLI failed with exit code {process.returncode}{detail}")
        _validate_acquisition_records(_decode_cli_output(stdout, "stdout"), work)

        acquired: dict[str, Path] = {}
        for skill, required_files in REQUIRED_EXTERNAL_FILES.items():
            root = work / ".agents" / "skills" / skill
            _validate_acquisition_path(work, root)
            validate_acquired_external_tree(root, required_files)
            acquired[skill] = root
        return acquired
    except KeyboardInterrupt:
        _clear_acquisition_work(work)
        raise
    except InstallerError:
        _clear_acquisition_work(work)
        raise
    except (OSError, RuntimeError, ValueError) as exc:
        _clear_acquisition_work(work)
        raise InstallerError(f"external skill acquisition failed: {exc}") from exc

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
        raise InstallerError("shared model configuration does not define exactly the six profile files")
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


def install_plan(
    root: Path,
    home: Path,
    *,
    user_home: Path | None = None,
    validate_external: bool = True,
) -> tuple[Path, Path, Path, dict[str, Path]]:
    user_home = absolute(Path.home() if user_home is None else user_home)
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

    if validate_external:
        validate_external_skills(home, user_home)
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


def backup_existing(
    harness_target: Path,
    profile_targets: dict[str, Path],
    backup_root: Path,
    external_targets: dict[str, tuple[Path, ...]],
) -> None:
    if harness_target.exists():
        target = backup_root / "skills" / INSTALL_NAME
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(harness_target, target, symlinks=True, copy_function=shutil.copy2)
    for skill, paths in external_targets.items():
        for source in paths:
            if not os.path.lexists(source):
                continue
            group = "skills" if source.parent == harness_target.parent else "legacy-agents-skills"
            target = backup_root / group / skill
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(source, target, symlinks=True, copy_function=shutil.copy2)
    for filename, source in profile_targets.items():
        if os.path.lexists(source):
            require_regular_file(source)
            target = backup_root / "agents" / filename
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)


def create_stage_area(parent: Path, label: str) -> Path:
    return Path(tempfile.mkdtemp(prefix=f".yunho-harness-{label}-", dir=parent))


def remove_path(path: Path) -> None:
    if not os.path.lexists(path):
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
        action["rollback_failed"] = False
        try:
            if installed:
                remove_path(target)
            if previous is not None and os.path.lexists(previous):
                os.replace(previous, target)
        except OSError as exc:
            action["rollback_failed"] = True
            errors.append(f"{target}: {exc}")
    return errors


def _remove_stage_areas(stage_areas: list[Path], retained: set[Path] | None = None) -> None:
    retained = set() if retained is None else retained
    for area in reversed(stage_areas):
        if area in retained:
            continue
        try:
            shutil.rmtree(area)
        except FileNotFoundError:
            pass
        except OSError as exc:
            print(f"Could not remove temporary staging directory {area}: {exc}", file=sys.stderr)


def _copy_harness_to_stage(source: Path, destination: Path) -> None:
    shutil.copytree(
        source,
        destination,
        copy_function=shutil.copy2,
        ignore=ignore_ds_store,
    )


def _transactional_install(
    root: Path,
    home: Path,
    rendered_profiles: dict[str, bytes],
    external_targets: dict[str, tuple[Path, ...]],
    acquired: dict[str, Path],
    skills_dir: Path,
    agents_dir: Path,
    backups_dir: Path,
    profile_targets: dict[str, Path],
) -> Path:
    harness_target = skills_dir / INSTALL_NAME
    directories = {home, skills_dir, agents_dir, backups_dir}
    directories.update(target.parent for paths in external_targets.values() for target in paths)
    for directory in sorted(directories, key=os.fspath):
        reject_symlink_components(directory)
        directory.mkdir(parents=True, exist_ok=True)
        reject_symlink_components(directory)

    backup_root = make_backup_directory(backups_dir)
    backup_existing(harness_target, profile_targets, backup_root, external_targets)

    stage_areas: list[Path] = []
    staged_targets: list[tuple[Path, Path, Path]] = []
    target_changes_started = False
    try:
        for skill, targets in external_targets.items():
            source = acquired[skill]
            for target in targets:
                area = create_stage_area(target.parent, "external")
                stage_areas.append(area)
                staged = area / skill
                stage_external_tree(source, staged)
                staged_targets.append((target, staged, area))

        skill_stage_area = create_stage_area(skills_dir, "stage")
        stage_areas.append(skill_stage_area)
        staged_harness = skill_stage_area / INSTALL_NAME
        _copy_harness_to_stage(root / "skill", staged_harness)
        model_config = load_model_module(root)
        try:
            settings = model_config.load_settings(root / "skill" / "models.toml")
            (staged_harness / "models.toml").write_bytes(model_config.serialize_settings(settings))
        except model_config.ValidationError as exc:
            raise InstallerError(str(exc)) from exc
        staged_targets.append((harness_target, staged_harness, skill_stage_area))

        profile_stage_area = create_stage_area(agents_dir, "profiles")
        stage_areas.append(profile_stage_area)
        for filename in PROFILE_FILES:
            source = root / "agents" / filename
            staged = profile_stage_area / filename
            try:
                with staged.open("xb") as handle:
                    handle.write(rendered_profiles[filename])
                shutil.copystat(source, staged)
            except OSError as exc:
                raise InstallerError(f"cannot stage generated profile {filename}: {exc}") from exc
            staged_targets.append((profile_targets[filename], staged, profile_stage_area))

        actions: list[dict[str, object]] = []
        target_changes_started = True
        try:
            for target, staged, area in staged_targets:
                action: dict[str, object] = {
                    "target": target,
                    "previous": None,
                    "installed": False,
                    "area": area,
                    "rollback_failed": False,
                }
                actions.append(action)
                if os.path.lexists(target):
                    previous = area / f"previous-{target.name}"
                    action["previous"] = previous
                    os.replace(target, previous)
                os.replace(staged, target)
                action["installed"] = True
        except BaseException as exc:
            rollback_errors = rollback(actions)
            retained_areas: set[Path] = set()
            recovery_paths: set[Path] = set()
            for action in actions:
                previous = action["previous"]
                area = action["area"]
                rollback_failed = action["rollback_failed"]
                assert previous is None or isinstance(previous, Path)
                assert isinstance(area, Path)
                if rollback_failed:
                    retained_areas.add(area)
                    if previous is not None and os.path.lexists(previous):
                        recovery_paths.add(previous)
                    else:
                        recovery_paths.add(action["target"])
                elif previous is not None and os.path.lexists(previous):
                    retained_areas.add(area)
                    recovery_paths.add(previous)
            _remove_stage_areas(stage_areas, retained_areas)
            if rollback_errors:
                recovery = ", ".join(str(path) for path in sorted(recovery_paths, key=os.fspath))
                raise InstallerError(
                    f"installation failed: {exc}; rollback failed: {'; '.join(rollback_errors)}; "
                    f"backup preserved at {backup_root}; recovery data preserved at: {recovery}"
                ) from exc
            if isinstance(exc, Exception):
                raise InstallerError(
                    f"installation failed; prior files were restored where possible: {exc}"
                ) from exc
            raise
        _remove_stage_areas(stage_areas)
    except BaseException:
        # The action-loop handler already chose which areas to retain after rollback.
        if not target_changes_started:
            _remove_stage_areas(stage_areas)
        raise

    return backup_root


def perform_install(
    root: Path,
    home: Path,
    rendered_profiles: dict[str, bytes],
    dry_run: bool = False,
    *,
    user_home: Path | None = None,
) -> None:
    user_home = absolute(Path.home() if user_home is None else user_home)
    skills_dir, agents_dir, backups_dir, profile_targets = install_plan(
        root,
        home,
        user_home=user_home,
        validate_external=dry_run,
    )
    external_targets = (
        external_candidate_paths(home, user_home)
        if dry_run
        else external_write_targets(home, user_home)
    )
    if dry_run:
        print(f"Would acquire with: {shlex.join(external_acquisition_command())}")
        print(f"Would update external skills: {', '.join(str(path) for paths in external_targets.values() for path in paths)}")
        print(f"Would install Harness skill: {skills_dir / INSTALL_NAME}")
        print(f"Would install six profiles: {agents_dir}")
        return

    with tempfile.TemporaryDirectory(prefix="yunho-harness-acquire-") as temporary:
        acquired = acquire_external_skills(Path(temporary))
        if external_write_targets(home, user_home) != external_targets:
            raise InstallerError("external skill targets changed during acquisition; refusing to install")
        backup_root = _transactional_install(
            root,
            home,
            rendered_profiles,
            external_targets,
            acquired,
            skills_dir,
            agents_dir,
            backups_dir,
            profile_targets,
        )

    print(f"Installed three external skills, Harness skill and profiles under: {home}")
    print(f"Backups: {backup_root}")
    print(f"설치 안내: {root / 'README.md'}")
    print(f"설치된 Harness skill: {skills_dir / INSTALL_NAME / 'SKILL.md'}")
    print("수동 활성화: README.md의 loader를 해당 AGENTS.md에 추가하고 Codex를 다시 시작하세요.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Install the staged Yunho Harness into a Codex home.")
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--check", action="store_true", help="validate the staged manifest and all six profiles without installing")
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
