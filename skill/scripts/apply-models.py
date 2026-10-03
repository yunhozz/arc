#!/usr/bin/env python3
"""Apply Yunho Harness model settings to Codex agent profiles."""

from __future__ import annotations

import argparse
import json
import os
import re
import stat
import sys
import tempfile
import tomllib
from pathlib import Path


ROLE_FILES = {
    "yunho_team_lead": "yunho-team-lead.toml",
    "yunho_team_secretary": "yunho-team-secretary.toml",
    "yunho_team_planner": "yunho-team-planner.toml",
    "yunho_team_scout": "yunho-team-scout.toml",
    "yunho_team_coder": "yunho-team-coder.toml",
    "yunho_team_qa": "yunho-team-qa.toml",
    "yunho_team_reviewer": "yunho-team-reviewer.toml",
}
EFFORTS = ("none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra")
EFFORT_RANK = {effort: rank for rank, effort in enumerate(EFFORTS)}
SOL_MODEL = re.compile(r"(?:^|[-_/])sol(?:$|[-_/])", re.IGNORECASE)


class ValidationError(Exception):
    """An invalid settings file or target agent profile."""


def read_toml(path: Path, label: str) -> tuple[bytes, dict]:
    try:
        content = path.read_bytes()
        parsed = tomllib.loads(content.decode("utf-8"))
    except (OSError, UnicodeDecodeError, tomllib.TOMLDecodeError) as exc:
        raise ValidationError(f"{label}: cannot read valid UTF-8 TOML at {path}: {exc}") from exc
    return content, parsed


def validate_config(path: Path) -> dict[str, dict[str, str]]:
    _, config = read_toml(path, "config")
    if set(config) != {"version", "roles"}:
        raise ValidationError("config must contain only 'version' and 'roles' at the top level")
    if type(config["version"]) is not int or config["version"] != 1:
        raise ValidationError("config version must be integer 1")
    roles = config["roles"]
    if not isinstance(roles, dict) or set(roles) != set(ROLE_FILES):
        missing = sorted(set(ROLE_FILES) - set(roles) if isinstance(roles, dict) else set(ROLE_FILES))
        extra = sorted(set(roles) - set(ROLE_FILES) if isinstance(roles, dict) else set())
        raise ValidationError(f"config roles must define exactly the seven Harness roles (missing={missing}, extra={extra})")

    result = {}
    for role in ROLE_FILES:
        settings = roles[role]
        if not isinstance(settings, dict) or set(settings) != {"model", "model_reasoning_effort"}:
            raise ValidationError(f"roles.{role} must contain only 'model' and 'model_reasoning_effort'")
        model = settings["model"]
        effort = settings["model_reasoning_effort"]
        if not isinstance(model, str) or not model.strip() or model != model.strip() or any(ord(char) < 32 for char in model):
            raise ValidationError(f"roles.{role}.model must be a nonempty single-line string without surrounding whitespace")
        if not isinstance(effort, str) or effort not in EFFORTS:
            raise ValidationError(f"roles.{role}.model_reasoning_effort must be one of: {', '.join(EFFORTS)}")
        if SOL_MODEL.search(model) and EFFORT_RANK[effort] > EFFORT_RANK["high"]:
            raise ValidationError(f"roles.{role}: GPT-6 Sol reasoning effort cannot exceed 'high'")
        result[role] = {"model": model, "model_reasoning_effort": effort}
    return result


def replace_root_string(content: bytes, key: str, value: str, path: Path) -> bytes:
    text = content.decode("utf-8")
    lines = text.splitlines(keepends=True)
    in_table = False
    found = []
    prefix = re.compile(rf"^[ \t]*{re.escape(key)}[ \t]*=")
    assignment = re.compile(
        rf"(?P<prefix>[ \t]*{re.escape(key)}[ \t]*=[ \t]*)"
        r'(?P<literal>"(?:\\.|[^"\\])*"|\x27[^\x27]*\x27)'
        r"(?P<tail>[ \t]*(?:\#.*)?)?(?P<newline>\r?\n)?"
    )
    for index, line in enumerate(lines):
        if re.match(r"^[ \t]*\[", line):
            in_table = True
        if not in_table and prefix.match(line):
            found.append(index)
    if len(found) != 1:
        raise ValidationError(f"{path}: expected exactly one root '{key}' assignment, found {len(found)}")

    index = found[0]
    match = assignment.fullmatch(lines[index])
    if match is None:
        raise ValidationError(f"{path}: root '{key}' must be a single-line quoted string assignment")
    current_literal = match.group("literal")
    try:
        current_value = tomllib.loads(f"{key} = {current_literal}\n")[key]
    except tomllib.TOMLDecodeError as exc:
        raise ValidationError(f"{path}: cannot parse root '{key}' assignment: {exc}") from exc
    if current_value == value:
        return content
    replacement = (
        match.group("prefix")
        + json.dumps(value, ensure_ascii=False)
        + (match.group("tail") or "")
        + (match.group("newline") or "")
    )
    lines[index] = replacement
    return "".join(lines).encode("utf-8")


def validate_profile(path: Path, role: str, settings: dict[str, str]) -> tuple[bytes, bytes]:
    if path.is_symlink():
        raise ValidationError(f"profile must be a regular file, not a symlink: {path}")
    original, profile = read_toml(path, "profile")
    if profile.get("name") != role:
        raise ValidationError(f"{path}: expected profile name {role!r}, found {profile.get('name')!r}")
    for key in ("model", "model_reasoning_effort"):
        if not isinstance(profile.get(key), str):
            raise ValidationError(f"{path}: root '{key}' must be a string")

    updated = replace_root_string(original, "model", settings["model"], path)
    updated = replace_root_string(updated, "model_reasoning_effort", settings["model_reasoning_effort"], path)
    try:
        checked = tomllib.loads(updated.decode("utf-8"))
    except (UnicodeDecodeError, tomllib.TOMLDecodeError) as exc:
        raise ValidationError(f"{path}: generated profile is invalid TOML: {exc}") from exc
    if checked.get("name") != role or any(checked.get(key) != value for key, value in settings.items()):
        raise ValidationError(f"{path}: generated profile does not match the validated settings")
    return original, updated


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


def prepare_updates(config_path: Path, agents_dir: Path) -> dict[Path, tuple[bytes, bytes, int]]:
    settings = validate_config(config_path)
    if not agents_dir.is_dir():
        raise ValidationError(f"agent profile directory does not exist: {agents_dir}")
    updates = {}
    # Read, parse, and validate every profile before the caller can write any file.
    for role, filename in ROLE_FILES.items():
        path = agents_dir / filename
        if not path.is_file():
            raise ValidationError(f"missing agent profile for {role}: {path}")
        original, updated = validate_profile(path, role, settings[role])
        if original != updated:
            updates[path] = (original, updated, path.stat().st_mode)
    return updates


def apply_updates(updates: dict[Path, tuple[bytes, bytes, int]]) -> None:
    staged_new = {}
    staged_old = {}
    replaced = []
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
    parser = argparse.ArgumentParser(description="Validate and apply Yunho Harness role models to Codex agent profiles.")
    parser.add_argument("--config", type=Path, default=default_config, help=f"TOML settings file (default: {default_config})")
    parser.add_argument("--agents-dir", type=Path, default=Path.home() / ".codex" / "agents", help="Codex agent profile directory")
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--dry-run", action="store_true", help="show required changes without writing files")
    action.add_argument("--check", action="store_true", help="exit 1 if agent profiles differ from the settings")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        updates = prepare_updates(args.config, args.agents_dir)
        if args.check:
            if updates:
                for path in updates:
                    print(f"out of sync: {path}")
                return 1
            print("all seven agent profiles match models.toml")
            return 0
        if args.dry_run:
            if updates:
                for path in updates:
                    print(f"would update: {path}")
            else:
                print("all seven agent profiles already match models.toml")
            return 0
        if updates:
            apply_updates(updates)
            for path in updates:
                print(f"updated: {path}")
        else:
            print("all seven agent profiles already match models.toml")
        return 0
    except ValidationError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
