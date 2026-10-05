#!/usr/bin/env python3
"""Apply the bundled model settings to installed Codex agent profiles."""

from __future__ import annotations

import argparse
import importlib.util
import os
import stat
import sys
import tempfile
from pathlib import Path
from types import ModuleType


class ValidationError(Exception):
    """An invalid settings file, profile, or target path."""


def load_model_module() -> ModuleType:
    """Load the shared implementation from this script's resolved directory."""
    module_path = Path(__file__).resolve().with_name("model_config.py")
    try:
        spec = importlib.util.spec_from_file_location("_yunho_harness_model_config", module_path)
        if spec is None or spec.loader is None:
            raise ValidationError(f"cannot load shared model configuration module: {module_path}")
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
    except ValidationError:
        raise
    except Exception as exc:
        raise ValidationError(f"cannot load shared model configuration module at {module_path}: {exc}") from exc
    return module


def _regular_path_info(path: Path, label: str = "profile") -> tuple[Path, os.stat_result]:
    """Check every path component without following symlinks."""
    expanded = path.expanduser()
    absolute = expanded if expanded.is_absolute() else Path.cwd() / expanded
    parts = absolute.parts
    current = Path(absolute.anchor)
    info: os.stat_result | None = None
    for index, part in enumerate(parts[1:]):
        if part in ("", "."):
            continue
        current = current / part
        try:
            info = current.lstat()
        except OSError as exc:
            raise ValidationError(f"cannot inspect {label} path {current}: {exc}") from exc
        if stat.S_ISLNK(info.st_mode):
            raise ValidationError(f"{label} path contains a symlink: {current}")
        if index < len(parts[1:]) - 1 and not stat.S_ISDIR(info.st_mode):
            raise ValidationError(f"{label} path component is not a directory: {current}")
    if info is None or not stat.S_ISREG(info.st_mode):
        raise ValidationError(f"{label} must be a regular file: {absolute}")
    return absolute, info


def read_profile_safely(path: Path) -> bytes:
    """Read one regular profile after rejecting symlink path components."""
    absolute, _ = _regular_path_info(path)
    try:
        return absolute.read_bytes()
    except OSError as exc:
        raise ValidationError(f"cannot read profile {absolute}: {exc}") from exc


def resolve_agents_dir(explicit: Path | None) -> Path:
    if explicit is not None:
        return explicit.expanduser()
    codex_home = os.environ.get("CODEX_HOME")
    if codex_home is not None:
        if not codex_home.strip():
            raise ValidationError("CODEX_HOME must not be empty")
        return Path(codex_home).expanduser() / "agents"
    return Path.home() / ".codex" / "agents"


def _load_settings(model_config: ModuleType, config_path: Path) -> dict:
    settings_path, _ = _regular_path_info(config_path, "settings")
    try:
        return model_config.load_settings(settings_path)
    except model_config.ValidationError as exc:
        raise ValidationError(str(exc)) from exc


def prepare_updates(config_path: Path, agents_dir: Path) -> dict[Path, tuple[bytes, bytes, int]]:
    model_config = load_model_module()
    settings = _load_settings(model_config, config_path)
    updates: dict[Path, tuple[bytes, bytes, int]] = {}
    # Read, parse, and render every profile before the caller can write any file.
    for role, filename in model_config.ROLE_FILES.items():
        path = agents_dir / filename
        original = read_profile_safely(path)
        try:
            updated = model_config.render_profile(original, role, settings[role], path)
        except model_config.ValidationError as exc:
            raise ValidationError(str(exc)) from exc
        _, info = _regular_path_info(path)
        if original != updated:
            updates[path] = (original, updated, info.st_mode)
    return updates


def stage_file(directory: Path, target: Path, content: bytes, mode: int) -> Path:
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{target.name}.", suffix=".tmp", dir=directory)
    temporary = Path(temporary_name)
    try:
        os.fchmod(descriptor, stat.S_IMODE(mode))
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
    except BaseException:
        try:
            os.close(descriptor)
        except OSError:
            pass
        temporary.unlink(missing_ok=True)
        raise
    return temporary


def apply_updates(updates: dict[Path, tuple[bytes, bytes, int]]) -> None:
    staged_new: dict[Path, Path] = {}
    staged_old: dict[Path, Path] = {}
    replaced: list[Path] = []
    try:
        for path, (original, updated, mode) in updates.items():
            staged_new[path] = stage_file(path.parent, path, updated, mode)
            staged_old[path] = stage_file(path.parent, path, original, mode)
        for path in updates:
            os.replace(staged_new[path], path)
            replaced.append(path)
    except OSError as exc:
        rollback_errors = []
        for path in reversed(replaced):
            try:
                os.replace(staged_old[path], path)
            except OSError as rollback_exc:
                rollback_errors.append(f"{path}: {rollback_exc}")
        detail = f"failed to update profiles: {exc}"
        if rollback_errors:
            detail += "; rollback errors: " + "; ".join(rollback_errors)
        raise ValidationError(detail) from exc
    finally:
        for temporary in (*staged_new.values(), *staged_old.values()):
            temporary.unlink(missing_ok=True)


def build_parser() -> argparse.ArgumentParser:
    default_config = Path(__file__).resolve().parent.parent / "models.toml"
    parser = argparse.ArgumentParser(description="Validate and apply Harness model settings to Codex agent profiles.")
    parser.add_argument("--config", type=Path, default=default_config, help=f"TOML settings file (default: {default_config})")
    parser.add_argument("--agents-dir", type=Path, help="Codex agent profile directory")
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--dry-run", action="store_true", help="show required changes without writing files")
    action.add_argument("--check", action="store_true", help="exit 1 if agent profiles differ from the settings")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        agents_dir = resolve_agents_dir(args.agents_dir)
        updates = prepare_updates(args.config, agents_dir)
        if args.check:
            if updates:
                for path in updates:
                    print(f"out of sync: {path}")
                return 1
            print("all six agent profiles match models.toml")
            return 0
        if args.dry_run:
            if updates:
                print("checking six agent profiles; planned updates:")
                for path in updates:
                    print(f"would update: {path}")
            else:
                print("all six agent profiles already match models.toml")
            return 0
        if updates:
            apply_updates(updates)
            print("applied settings across six agent profiles")
            for path in updates:
                print(f"updated: {path}")
        else:
            print("all six agent profiles already match models.toml")
        return 0
    except ValidationError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
