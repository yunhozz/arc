from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest import mock


SCRIPT = Path(__file__).resolve().parents[1] / "codex" / "tools" / "codex_token_usage.py"


def load_module():
    spec = importlib.util.spec_from_file_location("codex_token_usage", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def usage(inp, cached, out, reasoning):
    return {
        "input_tokens": inp,
        "cached_input_tokens": cached,
        "output_tokens": out,
        "reasoning_output_tokens": reasoning,
        "total_tokens": inp + out,
    }


def token_line(total, outer="event_msg"):
    info = None if total is None else {"total_token_usage": total}
    return {"type": outer, "payload": {"type": "token_count", "info": info}}


class TokenUsageTest(unittest.TestCase):
    def setUp(self):
        self.mod = load_module()
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name)
        self.addCleanup(self.set_tz, os.environ.get("TZ"))
        self.set_tz("UTC")

    @staticmethod
    def set_tz(name):
        if name is None:
            os.environ.pop("TZ", None)
        else:
            os.environ["TZ"] = name
        time.tzset()

    def write(self, name, lines, raw=()):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        body = [json.dumps(line) for line in lines] + list(raw)
        path.write_text("\n".join(body) + "\n", encoding="utf-8")
        return path

    def meta(self, timestamp="2026-10-13T23:50:06.020Z", **payload):
        return {"type": "session_meta", "payload": {"timestamp": timestamp, **payload}}

    def run_cli(self, *args):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = self.mod.main(list(args))
        return code, out.getvalue(), err.getvalue()

    def test_role_classification(self):
        cases = {
            "main": {"thread_source": "user", "source": "vscode"},
            "arc_implementer": {"thread_source": "subagent", "agent_role": "arc_implementer"},
            "arc_qa": {
                "thread_source": "subagent",
                "source": {"subagent": {"thread_spawn": {"agent_role": "arc_qa"}}},
            },
            "guardian": {"source": {"subagent": {"other": "guardian"}}},
            "subagent": {"thread_source": "subagent", "source": {"subagent": {"thread_spawn": {}}}},
        }
        for expected, payload in cases.items():
            with self.subTest(expected=expected):
                self.assertEqual(self.mod.classify_role(payload), expected)

    def test_last_non_null_token_count_wins_and_bad_lines_tolerated(self):
        self.write(
            "a.jsonl",
            [
                self.meta(thread_source="user"),
                token_line(usage(10, 5, 2, 1)),
                token_line(usage(100, 60, 20, 10)),
                token_line(None),
            ],
            raw=["{not json", ""],
        )
        code, out, _ = self.run_cli("--sessions-dir", str(self.root))
        self.assertEqual(code, 0)
        main_row = next(line for line in out.splitlines() if line.startswith("main"))
        self.assertEqual(main_row.split(), ["main", "1", "100", "60.0%", "40", "20", "50.0%"])

    def test_outer_type_is_ignored_and_files_without_data_are_skipped(self):
        self.write("ok.jsonl", [self.meta(), token_line(usage(7, 0, 1, 0), outer="other")])
        self.write("nometa.jsonl", [token_line(usage(9, 0, 1, 0))])
        self.write("notokens.jsonl", [self.meta(), token_line(None)])
        code, out, _ = self.run_cli("--sessions-dir", str(self.root))
        self.assertEqual(code, 0)
        self.assertIn("skipped 2", out)
        self.assertRegex(out, r"TOTAL\s+1\s+7\b")

    def test_aggregates_by_role_sorted_by_input_desc(self):
        self.write("m.jsonl", [self.meta(thread_source="user"), token_line(usage(10, 0, 1, 0))])
        for i in range(2):
            self.write(
                f"c{i}.jsonl",
                [self.meta(agent_role="arc_implementer"), token_line(usage(50, 0, 1, 0))],
            )
        _, out, _ = self.run_cli("--sessions-dir", str(self.root))
        rows = [line.split()[0] for line in out.splitlines()]
        self.assertLess(rows.index("arc_implementer"), rows.index("main"))
        self.assertRegex(out, r"arc_implementer\s+2\s+100\b")
        self.assertRegex(out, r"TOTAL\s+3\s+110\b")

    def test_non_numeric_token_value_skips_file(self):
        self.write("ok.jsonl", [self.meta(), token_line(usage(7, 0, 1, 0))])
        for i, bad in enumerate(("abc", "5", True, 1.5, None)):
            self.write(f"bad{i}.jsonl", [self.meta(), token_line({"input_tokens": bad})])
        code, out, _ = self.run_cli("--sessions-dir", str(self.root))
        self.assertEqual(code, 0)
        self.assertRegex(out, r"TOTAL\s+1\s+7\b")
        self.assertIn("skipped 5 file(s) unreadable, malformed, or lacking", out)

    def test_missing_token_field_counts_as_zero(self):
        self.write("a.jsonl", [self.meta(), token_line({"input_tokens": 4})])
        _, out, _ = self.run_cli("--sessions-dir", str(self.root))
        self.assertRegex(out, r"TOTAL\s+1\s+4\b")
        self.assertIn("skipped 0", out)

    def test_non_utf8_line_does_not_drop_file(self):
        path = self.write("a.jsonl", [self.meta(), token_line(usage(7, 0, 1, 0))])
        path.write_bytes(path.read_bytes() + b'{"bad": "\xff\xfe"}\n')
        _, out, _ = self.run_cli("--sessions-dir", str(self.root))
        self.assertRegex(out, r"TOTAL\s+1\s+7\b")
        self.assertIn("skipped 0", out)

    def test_invalid_date_arguments_exit_2(self):
        for flag, value in (("--since", "foo"), ("--until", "2026-1-5")):
            with self.subTest(flag=flag), contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as ctx:
                    self.mod.main(["--sessions-dir", str(self.root), flag, value])
                self.assertEqual(ctx.exception.code, 2)

    def test_out_of_range_files_are_not_counted_as_skipped(self):
        self.write("old.jsonl", [self.meta(timestamp="2026-09-01T00:00:00Z"), token_line(None)])
        self.write("new.jsonl", [self.meta(timestamp="2026-10-02T00:00:00Z"), token_line(None)])
        self.write("nometa.jsonl", [token_line(usage(9, 0, 1, 0))])
        _, out, _ = self.run_cli("--sessions-dir", str(self.root), "--since", "2026-10-01")
        self.assertIn("skipped 2", out)

    def test_undated_files_are_skipped_only_when_filtering(self):
        self.write("u.jsonl", [self.meta(timestamp="garbage"), token_line(usage(7, 0, 1, 0))])
        _, out, _ = self.run_cli("--sessions-dir", str(self.root))
        self.assertRegex(out, r"TOTAL\s+1\s+7\b")
        self.assertIn("skipped 0", out)
        _, out, _ = self.run_cli("--sessions-dir", str(self.root), "--until", "2026-12-31")
        self.assertRegex(out, r"TOTAL\s+0\s+0\b")
        self.assertIn("skipped 1", out)

    def test_session_date_uses_local_timezone(self):
        self.set_tz("Asia/Seoul")
        self.write("k.jsonl", [self.meta(timestamp="2026-10-13T20:00:00Z"), token_line(usage(1, 0, 1, 0))])
        _, out, _ = self.run_cli("--sessions-dir", str(self.root), "--since", "2026-10-14")
        self.assertRegex(out, r"TOTAL\s+1\b")
        _, out, _ = self.run_cli("--sessions-dir", str(self.root), "--until", "2026-10-13")
        self.assertRegex(out, r"TOTAL\s+0\b")

    def test_default_dir_uses_codex_home_or_home_fallback(self):
        codex_home = self.root / "ch"
        self.write("ch/sessions/a.jsonl", [self.meta(), token_line(usage(11, 0, 1, 0))])
        with mock.patch.dict(os.environ, {"CODEX_HOME": str(codex_home)}):
            _, out, _ = self.run_cli()
        self.assertRegex(out, r"TOTAL\s+1\s+11\b")
        home = self.root / "home"
        self.write("home/.codex/sessions/b.jsonl", [self.meta(), token_line(usage(22, 0, 1, 0))])
        with mock.patch.dict(os.environ, {"CODEX_HOME": ""}), mock.patch.object(
            Path, "home", return_value=home
        ):
            _, out, _ = self.run_cli()
        self.assertRegex(out, r"TOTAL\s+1\s+22\b")

    def test_since_after_until_exits_2(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as ctx:
            self.mod.main(["--sessions-dir", str(self.root), "--since", "2026-10-03", "--until", "2026-10-02"])
        self.assertEqual(ctx.exception.code, 2)

    def test_help_explains_role_rows(self):
        with contextlib.redirect_stdout(io.StringIO()) as out, self.assertRaises(SystemExit):
            self.mod.main(["--help"])
        self.assertIn("guardian", out.getvalue())
        self.assertIn("arc_*", out.getvalue())

    def test_since_until_inclusive(self):
        for day in ("2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"):
            self.write(
                f"{day}.jsonl",
                [self.meta(timestamp=f"{day}T12:00:00.000Z"), token_line(usage(1, 0, 1, 0))],
            )
        _, out, _ = self.run_cli(
            "--sessions-dir", str(self.root), "--since", "2026-10-02", "--until", "2026-10-03"
        )
        self.assertRegex(out, r"TOTAL\s+2\b")

    def test_missing_directory_exits_2(self):
        code, _, err = self.run_cli("--sessions-dir", str(self.root / "nope"))
        self.assertEqual(code, 2)
        self.assertIn("nope", err)


if __name__ == "__main__":
    unittest.main()
