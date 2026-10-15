"""Aggregate Codex rollout token usage by ARC role.

Compare arc_* rows across runs; main includes all Codex sessions in the window
and guardian is approval-review threads. Session dates are local dates.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import date, datetime
import json
import os
from pathlib import Path
import sys
from typing import Any


FIELDS = ("input_tokens", "cached_input_tokens", "output_tokens", "reasoning_output_tokens")


def classify_role(meta: dict[str, Any]) -> str:
    spawn = {}
    other = None
    source = meta.get("source")
    if isinstance(source, dict) and isinstance(source.get("subagent"), dict):
        spawn = source["subagent"].get("thread_spawn") or {}
        other = source["subagent"].get("other")
        if not isinstance(spawn, dict):
            spawn = {}
    role = meta.get("agent_role") or spawn.get("agent_role") or other
    if role:
        return str(role)
    return "subagent" if isinstance(source, dict) and "subagent" in source else "main"


def read_session(path: Path) -> tuple[date | None, str, dict[str, int] | None] | None:
    """Return (session date, role, usage); date or usage is None when unavailable.

    Returns None for unreadable files and files with malformed token values.
    """
    meta = None
    usage = None
    try:
        with path.open(encoding="utf-8", errors="replace") as handle:
            for line in handle:
                try:
                    item = json.loads(line)
                    payload = item["payload"]
                except (ValueError, KeyError, TypeError):
                    continue
                if not isinstance(payload, dict):
                    continue
                if meta is None and item.get("type") == "session_meta":
                    meta = payload
                elif payload.get("type") == "token_count":
                    info = payload.get("info")
                    if isinstance(info, dict) and isinstance(info.get("total_token_usage"), dict):
                        raw = info["total_token_usage"]
                        usage = {k: raw.get(k, 0) for k in FIELDS}
                        if any(not isinstance(v, int) or isinstance(v, bool) for v in usage.values()):
                            return None
    except OSError:
        return None
    if meta is None:
        return None, "", None
    try:
        day = datetime.fromisoformat(str(meta.get("timestamp"))).astimezone().date()
    except (ValueError, OverflowError, OSError):
        day = None
    return day, classify_role(meta), usage


def pct(part: int, whole: int) -> str:
    return f"{part * 100 / whole:.1f}%" if whole else "-"


def row(name: str, count: int, u: dict[str, int]) -> str:
    inp, cached = u["input_tokens"], u["cached_input_tokens"]
    return (
        f"{name:<20}{count:>9}{inp:>14}{pct(cached, inp):>10}{inp - cached:>14}"
        f"{u['output_tokens']:>12}{pct(u['reasoning_output_tokens'], u['output_tokens']):>12}"
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sessions-dir", type=Path)
    parser.add_argument("--since", type=date.fromisoformat, metavar="YYYY-MM-DD")
    parser.add_argument("--until", type=date.fromisoformat, metavar="YYYY-MM-DD")
    args = parser.parse_args(argv)
    if args.since and args.until and args.since > args.until:
        parser.error("--since must not be later than --until")

    sessions_dir = args.sessions_dir
    if sessions_dir is None:
        home = os.environ.get("CODEX_HOME") or str(Path.home() / ".codex")
        sessions_dir = Path(home) / "sessions"
    if not sessions_dir.is_dir():
        print(f"error: sessions directory not found: {sessions_dir}", file=sys.stderr)
        return 2

    roles: dict[str, dict[str, int]] = defaultdict(lambda: dict.fromkeys(FIELDS, 0))
    counts: dict[str, int] = defaultdict(int)
    skipped = 0
    for path in sorted(sessions_dir.rglob("*.jsonl")):
        session = read_session(path)
        if session is None:
            skipped += 1
            continue
        day, role, usage = session
        if day and ((args.since and day < args.since) or (args.until and day > args.until)):
            continue
        if usage is None or (day is None and (args.since or args.until)):
            skipped += 1
            continue
        counts[role] += 1
        for key, value in usage.items():
            roles[role][key] += value

    print(
        f"{'role':<20}{'sessions':>9}{'input':>14}{'cached %':>10}{'uncached in':>14}"
        f"{'output':>12}{'reasoning %':>12}"
    )
    for role in sorted(roles, key=lambda r: roles[r]["input_tokens"], reverse=True):
        print(row(role, counts[role], roles[role]))
    print(row("TOTAL", sum(counts.values()), {k: sum(r[k] for r in roles.values()) for k in FIELDS}))
    print(f"skipped {skipped} file(s) unreadable, malformed, or lacking session_meta/token data")
    return 0


if __name__ == "__main__":
    sys.exit(main())
