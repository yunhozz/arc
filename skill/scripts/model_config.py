"""Load Harness model settings and render model fields into TOML profiles."""

from __future__ import annotations

import json
import re
import sys
import tomllib
import unicodedata
from pathlib import Path
from typing import TypedDict


ROLE_FILES: dict[str, str] = {
    "yunho_team_secretary": "yunho-team-secretary.toml",
    "yunho_team_planner": "yunho-team-planner.toml",
    "yunho_team_scout": "yunho-team-scout.toml",
    "yunho_team_coder": "yunho-team-coder.toml",
    "yunho_team_qa": "yunho-team-qa.toml",
    "yunho_team_reviewer": "yunho-team-reviewer.toml",
}


class RoleSettings(TypedDict):
    model: str
    model_reasoning_effort: str


class ValidationError(Exception):
    """An invalid model settings file or agent profile."""


_MODEL_FIELDS = ("model", "model_reasoning_effort")
_BARE_KEY = re.compile(r"[A-Za-z0-9_-]+")
_STRING_ASSIGNMENT = re.compile(
    r"(?P<prefix>[ \t]*(?:model|model_reasoning_effort|\"model\"|\"model_reasoning_effort\"|"
    r"'model'|'model_reasoning_effort')[ \t]*=[ \t]*)"
    r'(?P<literal>"(?:\\.|[^"\\\r\n])*"|\x27[^\x27\r\n]*\x27)'
    r"(?P<tail>[ \t]*(?:\#[^\r\n]*)?)(?P<newline>\r?\n)?\Z"
)


def _error(path: Path, key: str, message: str) -> ValidationError:
    return ValidationError(f"{path}: {key}: {message}")


def _validated_string(value: object, path: Path, key: str) -> str:
    if not isinstance(value, str):
        raise _error(path, key, "must be a string")
    if not value or value != value.strip():
        raise _error(path, key, "must be nonempty and have no surrounding whitespace")
    if any(unicodedata.category(char) == "Cc" or char in "\u2028\u2029" for char in value):
        raise _error(path, key, "must not contain control characters or line breaks")
    return value


def _decode_toml(content: bytes, path: Path, label: str) -> tuple[str, dict]:
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise _error(path, label, f"is not valid UTF-8: {exc}") from exc
    try:
        parsed = tomllib.loads(text)
    except tomllib.TOMLDecodeError as exc:
        raise _error(path, label, f"is not valid TOML: {exc}") from exc
    return text, parsed


def _parse_file(path: Path, label: str) -> tuple[bytes, str, dict]:
    try:
        content = path.read_bytes()
    except OSError as exc:
        raise _error(path, label, f"cannot read file: {exc}") from exc
    text, parsed = _decode_toml(content, path, label)
    return content, text, parsed


def load_settings(config_path: Path) -> dict[str, RoleSettings]:
    """Read and validate the version 3 role settings."""
    _, _, config = _parse_file(config_path, "settings")
    version = config.get("version")
    if type(version) is int and version in (1, 2):
        raise _error(
            config_path,
            "version",
            f"must be integer 3; update version {version} settings to the version 3 role-only format",
        )
    if "version" in config and (type(version) is not int or version != 3):
        raise _error(config_path, "version", "must be integer 3")
    if set(config) != {"version", "roles"}:
        missing = sorted({"version", "roles"} - set(config))
        extra = sorted(set(config) - {"version", "roles"})
        raise _error(
            config_path,
            "top level",
            f"must contain exactly 'version' and 'roles' (missing={missing}, extra={extra})",
        )

    roles = config["roles"]
    if not isinstance(roles, dict) or set(roles) not in (set(ROLE_FILES), set(ROLE_FILES) | {"yunho_team_lead"}):
        actual_roles = set(roles) if isinstance(roles, dict) else set()
        missing = sorted(set(ROLE_FILES) - actual_roles)
        extra = sorted(actual_roles - set(ROLE_FILES))
        raise _error(config_path, "roles", f"must define the six Harness roles, optionally with known legacy yunho_team_lead (missing={missing}, extra={extra})")

    result: dict[str, RoleSettings] = {}
    for role in roles:
        role_settings = roles[role]
        if not isinstance(role_settings, dict) or set(role_settings) != set(_MODEL_FIELDS):
            keys = set(role_settings) if isinstance(role_settings, dict) else set()
            raise _error(
                config_path,
                f"roles.{role}",
                f"must contain only 'model' and 'model_reasoning_effort' (found={sorted(keys)})",
            )
        model = _validated_string(role_settings["model"], config_path, f"roles.{role}.model")
        effort = _validated_string(role_settings["model_reasoning_effort"], config_path, f"roles.{role}.model_reasoning_effort")
        if role in ROLE_FILES:
            result[role] = {"model": model, "model_reasoning_effort": effort}
    if "yunho_team_lead" in roles:
        print("Ignoring validated legacy yunho_team_lead settings; using six Harness roles.", file=sys.stderr)
    return result


def serialize_settings(settings: dict[str, RoleSettings]) -> bytes:
    """Serialize effective settings as canonical version 3 six-role TOML."""
    path = Path("models.toml")
    if set(settings) != set(ROLE_FILES):
        raise _error(path, "roles", "must define exactly the six Harness roles")
    lines = [
        "# Single source for each role's exact model ID and reasoning-effort selection.",
        "# Each role is applied directly; model availability is not validated here.",
        "version = 3",
    ]
    for role in ROLE_FILES:
        values = _settings_for_profile(settings[role], role, path)
        lines.extend(["", f"[roles.{role}]"])
        lines.extend(f"{key} = {json.dumps(values[key], ensure_ascii=False)}" for key in _MODEL_FIELDS)
    return ("\n".join(lines) + "\n").encode("utf-8")


def _physical_lines(text: str) -> list[tuple[str, int]]:
    """Return physical LF/CRLF lines with their starting character offsets."""
    lines: list[tuple[str, int]] = []
    start = 0
    while start < len(text):
        newline = text.find("\n", start)
        end = len(text) if newline < 0 else newline + 1
        lines.append((text[start:end], start))
        start = end
    return lines


def _quoted_key_value(token: str) -> str | None:
    try:
        parsed = tomllib.loads(f"{token} = 0")
    except tomllib.TOMLDecodeError:
        return None
    if len(parsed) != 1:
        return None
    return next(iter(parsed))


def _assignment_key(line: str) -> str | None:
    """Read one root assignment key token from a line, if it is a plain assignment."""
    cursor = len(line) - len(line.lstrip(" \t"))
    if cursor >= len(line) or line[cursor] == "#":
        return None
    start = cursor
    first = line[cursor]
    if first in "\"'":
        quote = first
        cursor += 1
        while cursor < len(line):
            char = line[cursor]
            if quote == '"' and char == "\\":
                cursor += 2
                continue
            if char == quote:
                cursor += 1
                break
            if char in "\r\n":
                return None
            cursor += 1
        else:
            return None
    else:
        match = _BARE_KEY.match(line, cursor)
        if match is None:
            return None
        cursor = match.end()
    token = line[start:cursor]
    while cursor < len(line) and line[cursor] in " \t":
        cursor += 1
    if cursor >= len(line) or line[cursor] != "=":
        return None
    return token if token in _MODEL_FIELDS else _quoted_key_value(token)


def _multiline_close(line: str, quote: str, basic: bool) -> int | None:
    """Find a TOML multiline string terminator in a physical line."""
    cursor = 0
    while cursor < len(line):
        start = line.find(quote, cursor)
        if start < 0:
            return None
        end = start
        while end < len(line) and line[end] == quote[0]:
            end += 1
        count = end - start
        if count >= 3:
            close_start = end - 3
            if basic:
                slash_count = 0
                before = close_start - 1
                while before >= 0 and line[before] == "\\":
                    slash_count += 1
                    before -= 1
                if slash_count % 2:
                    cursor = end
                    continue
            return close_start
        cursor = end
    return None


def _scan_root(text: str) -> tuple[dict[str, list[int]], int | None]:
    """Locate model assignments before the first real table header."""
    assignments: dict[str, list[int]] = {key: [] for key in _MODEL_FIELDS}
    square_depth = 0
    brace_depth = 0
    multiline: str | None = None
    multiline_basic = False
    lines = _physical_lines(text)

    for index, (physical, offset) in enumerate(lines):
        body = physical[:-2] if physical.endswith("\r\n") else physical[:-1] if physical.endswith("\n") else physical
        if multiline is None and square_depth == 0 and brace_depth == 0:
            first = len(body) - len(body.lstrip(" \t"))
            if first < len(body) and body[first] == "[":
                return assignments, offset
            key = _assignment_key(body)
            if key in assignments:
                assignments[key].append(index)

        cursor = 0
        while cursor < len(body):
            if multiline is not None:
                close_at = _multiline_close(body[cursor:], multiline, multiline_basic)
                if close_at is None:
                    break
                cursor += close_at + 3
                multiline = None
                multiline_basic = False
                continue

            char = body[cursor]
            if char == "#":
                break
            if body.startswith('"""', cursor) or body.startswith("'''", cursor):
                multiline = body[cursor : cursor + 3]
                multiline_basic = multiline == '"""'
                cursor += 3
                continue
            if char == '"' or char == "'":
                quote = char
                cursor += 1
                while cursor < len(body):
                    if quote == '"' and body[cursor] == "\\":
                        cursor += 2
                    elif body[cursor] == quote:
                        cursor += 1
                        break
                    else:
                        cursor += 1
                continue
            if char == "[":
                square_depth += 1
            elif char == "]":
                square_depth = max(0, square_depth - 1)
            elif char == "{":
                brace_depth += 1
            elif char == "}":
                brace_depth = max(0, brace_depth - 1)
            cursor += 1

    return assignments, None


def _profile_parts(profile_bytes: bytes, role: str, source_path: Path) -> tuple[str, dict, dict[str, list[int]], int | None, list[tuple[str, int]]]:
    if role not in ROLE_FILES:
        raise _error(source_path, "role", f"unknown Harness role {role!r}")
    text, profile = _decode_toml(profile_bytes, source_path, "profile")
    if profile.get("name") != role:
        raise _error(source_path, "name", f"expected profile name {role!r}, found {profile.get('name')!r}")
    assignments, first_table = _scan_root(text)
    return text, profile, assignments, first_table, _physical_lines(text)


def validate_template(profile_bytes: bytes, role: str, source_path: Path) -> None:
    """Validate a model-free source profile template without modifying it."""
    _, profile, assignments, _, _ = _profile_parts(profile_bytes, role, source_path)
    for key in _MODEL_FIELDS:
        if key in profile or assignments[key]:
            raise _error(source_path, key, "must be absent from the root of a source template")


def _settings_for_profile(settings: RoleSettings, role: str, source_path: Path) -> RoleSettings:
    if not isinstance(settings, dict) or set(settings) != set(_MODEL_FIELDS):
        raise _error(source_path, f"roles.{role}", "must contain only 'model' and 'model_reasoning_effort'")
    return {
        "model": _validated_string(settings["model"], source_path, f"roles.{role}.model"),
        "model_reasoning_effort": _validated_string(
            settings["model_reasoning_effort"], source_path, f"roles.{role}.model_reasoning_effort"
        ),
    }


def _newline(text: str) -> str:
    match = re.search(r"\r\n|\n", text)
    return match.group(0) if match else "\n"


def _replace_line_literal(line: str, key: str, value: str, source_path: Path) -> str:
    match = _STRING_ASSIGNMENT.fullmatch(line)
    if match is None:
        raise _error(source_path, key, "must be a one-line quoted string assignment")
    prefix = match.group("prefix")
    # A quoted key may resolve to this name while using a noncanonical escape;
    # that form is valid TOML but not safe to edit textually.
    key_text = prefix.split("=", 1)[0].strip()
    if key_text not in (key, f'"{key}"', f"'{key}'"):
        raise _error(source_path, key, "uses an unsupported quoted key spelling")
    try:
        current = tomllib.loads(f"{key} = {match.group('literal')}\n")[key]
    except tomllib.TOMLDecodeError as exc:
        raise _error(source_path, key, f"cannot parse quoted string assignment: {exc}") from exc
    if not isinstance(current, str):
        raise _error(source_path, key, "must be a quoted string assignment")
    if current == value:
        return line
    return prefix + json.dumps(value, ensure_ascii=False) + match.group("tail") + (match.group("newline") or "")


def render_profile(profile_bytes: bytes, role: str, settings: RoleSettings, source_path: Path) -> bytes:
    """Return valid profile TOML bytes with the role's model fields rendered."""
    text, profile, assignments, first_table, lines = _profile_parts(profile_bytes, role, source_path)
    validated_settings = _settings_for_profile(settings, role, source_path)
    line_values = [line for line, _ in lines]
    missing: list[str] = []

    for key in _MODEL_FIELDS:
        present = key in profile
        found = assignments[key]
        if not present:
            if found:
                raise _error(source_path, key, "root assignment could not be matched to the parsed TOML value")
            missing.append(key)
            continue
        if not isinstance(profile[key], str):
            raise _error(source_path, key, "root value must be a one-line quoted string assignment")
        if len(found) != 1:
            raise _error(source_path, key, f"expected one safe root assignment, found {len(found)}")
        index = found[0]
        updated = _replace_line_literal(line_values[index], key, validated_settings[key], source_path)
        line_values[index] = updated

    rendered = "".join(line_values)
    if missing:
        newline = _newline(text)
        addition = newline.join(f"{key} = {json.dumps(validated_settings[key], ensure_ascii=False)}" for key in missing)
        addition += newline
        if first_table is not None:
            table_line = next(index for index, (_, offset) in enumerate(lines) if offset == first_table)
            insertion = sum(len(line) for line in line_values[:table_line])
            prefix = rendered[:insertion]
            if prefix and not prefix.endswith(("\n", "\r")):
                addition = newline + addition
            rendered = rendered[:insertion] + addition + rendered[insertion:]
        else:
            if rendered and not rendered.endswith(("\n", "\r")):
                addition = newline + addition
            rendered += addition

    try:
        checked = tomllib.loads(rendered)
    except tomllib.TOMLDecodeError as exc:
        raise _error(source_path, "rendered profile", f"is not valid TOML: {exc}") from exc
    if checked.get("name") != role or any(checked.get(key) != value for key, value in validated_settings.items()):
        raise _error(source_path, "rendered profile", "does not match the validated role and model settings")
    return rendered.encode("utf-8")
