from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import stat
import sys
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
    for directory in ("codex/skill", "codex/agents", "claude/skill", "claude/agents"):
        for path in (root / directory).rglob("*"):
            if path.is_file() and path.name != ".DS_Store":
                name = path.relative_to(root).as_posix()
                if name not in {"codex/skill/models.toml", "claude/skill/models.toml"}:
                    names.add(name)
    contents = "\n".join(
        f"{hashlib.sha256((root / name).read_bytes()).hexdigest()}  {name}"
        for name in sorted(names)
    ) + "\n"
    (root / "MANIFEST.sha256").write_text(contents, encoding="utf-8")


def installer_payload(base: Path) -> Path:
    root = base / "payload"
    for directory in ("codex/skill", "codex/agents", "claude/skill", "claude/agents"):
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


FIVE_SETTINGS = {
    "arc_scouter": {"model": "gpt-6-luna", "model_reasoning_effort": "high"},
    "arc_planner": {"model": "gpt-6.1-sol", "model_reasoning_effort": "medium"},
    "arc_coder": {"model": "gpt-6.1-sol", "model_reasoning_effort": "low"},
    "arc_qa": {"model": "gpt-6-luna", "model_reasoning_effort": "high"},
    "arc_reviewer": {"model": "gpt-6.1-sol", "model_reasoning_effort": "medium"},
}


def settings_bytes(roles: dict, version=5) -> bytes:
    lines = [f"version = {json.dumps(version)}"]
    for role, fields in roles.items():
        lines.append(f"[roles.{role}]")
        for key, value in fields.items():
            lines.append(f"{key} = {json.dumps(value)}")
    return ("\n".join(lines) + "\n").encode()


# Resolve symlinks (e.g. macOS /var -> /private/var): the installer rejects symlinked paths.
TMP_ROOT = os.path.realpath(tempfile.gettempdir())


class ModelSettingsTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory(dir=TMP_ROOT)
        self.addCleanup(temporary.cleanup)
        self.config = Path(temporary.name) / "models.toml"
        self.module = installer.load_model_module(REPO)

    def load(self, roles: dict, version=5):
        self.config.write_bytes(settings_bytes(roles, version))
        return self.module.load_settings(self.config)

    def test_model_standard_five_roles(self) -> None:
        try:
            settings = self.load(FIVE_SETTINGS)
        except self.module.ValidationError as exc:
            self.fail(f"standard five-role settings must be accepted: {exc}")
        self.assertEqual(settings, FIVE_SETTINGS)
        self.assertEqual(set(self.module.ROLE_FILES), set(FIVE_SETTINGS))
        self.assertEqual(self.module.load_settings(REPO / "codex/skill/models.toml"), FIVE_SETTINGS)

    def test_model_rejects_unknown_missing_or_invalid_version(self) -> None:
        for roles in ({**FIVE_SETTINGS, "unknown": {"model": "x", "model_reasoning_effort": "low"}},
                      {role: fields for role, fields in FIVE_SETTINGS.items() if role != "arc_coder"}):
            with self.subTest(roles=roles), self.assertRaises(self.module.ValidationError):
                self.load(roles)
        for version in (1, 2, 3, 4, True, "5"):
            with self.subTest(version=version), self.assertRaises(self.module.ValidationError):
                self.load(FIVE_SETTINGS, version)
        for content in (b'version = 4\nroles = "invalid"\n', b'version = 4\n[roles', b'roles = {}\n'):
            self.config.write_bytes(content)
            with self.subTest(content=content), self.assertRaises(self.module.ValidationError):
                self.module.load_settings(self.config)

    def test_model_profile_sets_match_five_roles(self) -> None:
        filenames = {f"{role.replace('_', '-')}.toml" for role in FIVE_SETTINGS}
        self.assertEqual(set(self.module.ROLE_FILES.values()), filenames)
        self.assertEqual(set(installer.PROFILE_FILES), filenames)
        self.assertEqual({p.name for p in (REPO / "codex/agents").glob("*.toml")}, filenames)

    def test_naming_v5_settings_and_serialization(self) -> None:
        try:
            loaded = self.load(FIVE_SETTINGS)
        except self.module.ValidationError as exc:
            self.fail(f"version 5 settings must be accepted: {exc}")
        self.assertEqual(loaded, FIVE_SETTINGS)
        serialized = self.module.serialize_settings(loaded)
        self.assertEqual(tomllib.loads(serialized.decode())["version"], 5)
        self.config.write_bytes(serialized)
        self.assertEqual(self.module.load_settings(self.config), FIVE_SETTINGS)

    def test_naming_rejects_old_versions_and_keys(self) -> None:
        legacy_prefix = "_".join(("yunho", "team"))
        legacy_roles = {legacy_prefix + role.removeprefix("arc"): fields
                        for role, fields in FIVE_SETTINGS.items()}
        for version, roles in ((1, FIVE_SETTINGS), (2, FIVE_SETTINGS), (3, legacy_roles),
                               (True, FIVE_SETTINGS), (4, legacy_roles)):
            with self.subTest(version=version):
                original = settings_bytes(roles, version)
                self.config.write_bytes(original)
                with self.assertRaises(self.module.ValidationError):
                    self.module.load_settings(self.config)
                self.assertEqual(self.config.read_bytes(), original)

    def test_model_rejects_old_role_ids_and_invalid_fields_without_writes(self) -> None:
        for old in ("arc_secretary", "arc_scout"):
            roles = {key: dict(value) for key, value in FIVE_SETTINGS.items()}
            roles[old] = roles.pop("arc_scouter")
            original = settings_bytes(roles)
            self.config.write_bytes(original)
            with self.assertRaises(self.module.ValidationError):
                self.module.load_settings(self.config)
            self.assertEqual(self.config.read_bytes(), original)
        for value in ({"model": "x"}, {"model": "x", "model_reasoning_effort": "low", "extra": "x"},
                      {"model": "x\n", "model_reasoning_effort": "low"},
                      {"model": " x", "model_reasoning_effort": "low"},
                      {"model": "x", "model_reasoning_effort": True}):
            roles = {**FIVE_SETTINGS, "arc_scouter": value}
            original = settings_bytes(roles)
            self.config.write_bytes(original)
            with self.assertRaises(self.module.ValidationError):
                self.module.load_settings(self.config)
            self.assertEqual(self.config.read_bytes(), original)
        for version in (1, 2, 3, 4):
            with self.assertRaisesRegex(self.module.ValidationError, "update.*version 5"):
                self.load(FIVE_SETTINGS, version)

    def test_naming_profile_identity_and_mapping(self) -> None:
        expected = {
            "arc_scouter": "arc-scouter.toml",
            "arc_planner": "arc-planner.toml",
            "arc_coder": "arc-coder.toml",
            "arc_qa": "arc-qa.toml",
            "arc_reviewer": "arc-reviewer.toml",
        }
        self.assertEqual(self.module.ROLE_FILES, expected)
        self.assertEqual(set(installer.PROFILE_FILES), set(expected.values()))
        self.assertEqual({p.name for p in (REPO / "codex/agents").glob("*.toml")}, set(expected.values()))
        for role, filename in expected.items():
            profile = tomllib.loads((REPO / "codex/agents" / filename).read_text())
            self.assertEqual(profile["name"], role)
            rendered = self.module.render_profile((REPO / "codex/agents" / filename).read_bytes(),
                                                  role, FIVE_SETTINGS[role], REPO / "codex/agents" / filename)
            effective = tomllib.loads(rendered.decode())
            self.assertEqual({key: effective[key] for key in FIVE_SETTINGS[role]}, FIVE_SETTINGS[role])

    def test_naming_rejects_profile_name_mismatch(self) -> None:
        with self.assertRaises(self.module.ValidationError):
            self.module.validate_template(b'name = "unrelated"\n', "arc_coder", self.config)


class ApplyModelsTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory(dir=TMP_ROOT)
        self.addCleanup(temporary.cleanup)
        self.base = Path(temporary.name)
        self.config = self.base / "models.toml"
        self.agents = self.base / "agents"
        self.agents.mkdir()
        self.module = installer.load_model_module(REPO)

    def fixture(self, matching=False) -> None:
        roles = dict(FIVE_SETTINGS)
        self.config.write_bytes(settings_bytes(roles))
        for role, settings in FIVE_SETTINGS.items():
            filename = role.replace("_", "-") + ".toml"
            fields = settings if matching else {"model": "old-model", "model_reasoning_effort": "low"}
            content = (f'name = "{role}"\n' + "".join(
                f'{key} = {json.dumps(value)}\n' for key, value in fields.items())).encode()
            (self.agents / filename).write_bytes(content)

    def cli(self, *flags):
        return subprocess.run(
            [sys.executable, "-B", str(REPO / "codex/skill/scripts/apply-models.py"),
             "--config", str(self.config), "--agents-dir", str(self.agents), *flags],
            capture_output=True, text=True, check=False,
        )

    def test_apply_models_check_standard(self) -> None:
        self.fixture(matching=True)
        before = tree_state(self.base)
        result = self.cli("--check")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("five", result.stdout)
        self.assertNotIn("seven", result.stdout)
        self.assertEqual(tree_state(self.base), before)
        self.fixture()
        before = tree_state(self.base)
        result = self.cli("--check")
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(tree_state(self.base), before)
        self.config.write_bytes(b'version = 2\nroles = {}\n')
        before = tree_state(self.base)
        self.assertEqual(self.cli("--check").returncode, 2)
        self.assertEqual(tree_state(self.base), before)

    def test_apply_models_dry_run_preserves_config_profiles(self) -> None:
        self.fixture()
        before = tree_state(self.base)
        result = self.cli("--dry-run")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(tree_state(self.base), before)
        self.assertIn("five", result.stdout)
        self.assertNotIn("seven", result.stdout)

    def test_apply_models_applies_five_profiles_without_mutating_config(self) -> None:
        self.fixture()
        config_before = self.config.read_bytes()
        result = self.cli()
        self.assertEqual(result.returncode, 0, result.stderr)
        for role, settings in FIVE_SETTINGS.items():
            profile = tomllib.loads((self.agents / (role.replace("_", "-") + ".toml")).read_text())
            self.assertEqual({key: profile[key] for key in settings}, settings)
        self.assertEqual(self.config.read_bytes(), config_before)
        self.assertIn("five", result.stdout)
        self.assertNotIn("seven", result.stdout)
        result = self.cli()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("five", result.stdout)

    def test_naming_apply_models_v5_contract(self) -> None:
        self.fixture(matching=True)
        before = tree_state(self.base)
        self.assertEqual(self.cli("--check").returncode, 0)
        self.assertEqual(tree_state(self.base), before)
        self.fixture()
        before = tree_state(self.base)
        self.assertEqual(self.cli("--check").returncode, 1)
        self.assertEqual(self.cli("--dry-run").returncode, 0)
        self.assertEqual(tree_state(self.base), before)
        config_before = self.config.read_bytes()
        self.assertEqual(self.cli().returncode, 0)
        self.assertEqual(self.cli("--check").returncode, 0)
        self.assertEqual(self.config.read_bytes(), config_before)
        for version in (1, 2, 3, 4):
            self.config.write_bytes(settings_bytes(FIVE_SETTINGS, version))
            before = tree_state(self.base)
            self.assertEqual(self.cli().returncode, 2)
            self.assertEqual(tree_state(self.base), before)

    def test_naming_apply_models_failure_restores_profiles(self) -> None:
        self.fixture()
        for index, path in enumerate(sorted(self.agents.iterdir())):
            path.chmod(0o600 if index % 2 else 0o640)
        before = tree_state(self.base)
        import importlib.util
        spec = importlib.util.spec_from_file_location("apply_models_test", REPO / "codex/skill/scripts/apply-models.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        replacements = 0
        real_replace = os.replace

        def fail_second(source, target):
            nonlocal replacements
            replacements += 1
            if replacements == 2:
                raise OSError("injected second replacement failure")
            return real_replace(source, target)

        import contextlib
        import io
        error = io.StringIO()
        with patch.object(module.os, "replace", fail_second), contextlib.redirect_stderr(error):
            result = module.main(["--config", str(self.config), "--agents-dir", str(self.agents)])
        self.assertEqual(result, 2)
        self.assertIn("injected second replacement failure", error.getvalue())
        self.assertGreaterEqual(replacements, 3)
        self.assertEqual(tree_state(self.base), before)


REFERENCE_NAMES = ("planning", "handoff", "handoff-prep", "handoff-worktree", "verification", "git-recovery",
                   "visual-companion", "commit")
HANDOFF_FILES = ("handoff", "handoff-prep", "handoff-worktree")


def policy_text(name: str) -> str:
    # "handoff" covers the whole handoff contract, which is split by trigger across HANDOFF_FILES.
    names = HANDOFF_FILES if name == "handoff" else (name,)
    paths = [REPO / "codex/skill" / ("SKILL.md" if n == "core" else f"references/{n}.md") for n in names]
    return " ".join(" ".join(path.read_text().lower().split()) for path in paths)


class TaskCommitPolicyTests(unittest.TestCase):
    # TASK-01's user-approved structural exception: RED/GREEN checks of the
    # written contract only, not consuming-agent runtime compliance.
    def section(self, name: str, heading: str) -> str:
        text = policy_text(name)
        self.assertIn(heading, text)
        section = text.split(heading, 1)[1]
        for boundary in (" ## ", " ### "):
            section = section.split(boundary, 1)[0]
        return section

    def contracts(self, text: str, patterns: tuple[str, ...]) -> None:
        for pattern in patterns:
            with self.subTest(contract=pattern):
                self.assertRegex(text, pattern)

    def test_ceo_commits_accepted_top_level_task_without_user_approval(self) -> None:
        core = policy_text("core")
        self.assertRegex(core, r"ceo.*accept.*task.*commit")
        self.assertRegex(core, r"without.*(?:additional|separate).*user.*commit.*approval")
        self.assertRegex(core, r"top.level task.*commit")
        commit = self.section("commit", "## automatic commit after plan-task acceptance")
        self.contracts(commit, (
            r"ceo verifies.*acceptance criteria.*required checks.*findings.*accepts.*task.*immediately.*local.*commit",
            r"one approved top-level task.*one focused implementation commit",
            r"immediately means.*next action.*git.*checks.*staging.*commit",
            r"plan.skip.*no new plan obligation",
        ))
        self.assertNotIn("optionally create", commit)

    def test_planner_groups_inseparable_changes_and_defines_task_gates(self) -> None:
        planning = self.section("planning", "## top-level plan tasks")
        profile = tomllib.loads((REPO / "codex/agents/arc-planner.toml").read_text())
        self.assertEqual(profile["sandbox_mode"], "read-only")
        planner = " ".join(profile["developer_instructions"].lower().split())
        self.assertIn("for each top-level task", planner)
        task_draft = planner.split("for each top-level task", 1)[1].split("for a genuinely visual", 1)[0]
        self.contracts(planning, (
            r"planner profile holds the full top-level task rules",
            r"id.*title.*scope.*files.*dependencies.*acceptance criteria.*required qa/focused checks.*evidence.*hold conditions",
            r"never list reviewer as a per-task required check",
            r"cannot be independently verified.*one task from the outset",
            r"final overall plan verification stated separately from task acceptance prerequisites",
        ))
        commit = self.section("commit", "## automatic commit after plan-task acceptance")
        self.contracts(commit, (
            r"substeps.*checkboxes.*not.*commit units",
            r"ceo.*accept.*without.*additional user commit approval",
        ))
        for artifact, text in (("planner", task_draft),):
            with self.subTest(artifact=artifact):
                self.contracts(text, (
                    r"id.*title.*scope.*files.*dependencies.*acceptance criteria.*required qa/focused checks.*evidence.*hold conditions",
                    r"never list reviewer as a per-task required check",
                    r"final.*plan verification.*single independent reviewer review of the final full change after all tasks are accepted with their risk-scaled checks",
                    r"cannot be independently verified.*one top-level task",
                    r"substeps.*checkboxes.*not.*commit units",
                    r"ceo.*accept.*without.*additional user commit approval",
                    r"final.*plan.*verification.*task.*prerequisites",
                ))

    def test_substeps_and_reports_do_not_replace_acceptance(self) -> None:
        commit = self.section("commit", "## automatic commit after plan-task acceptance")
        self.contracts(commit, (
            r"substeps.*checkboxes.*not.*commit units",
            r"checkbox completion.*coder reports.*passing checks.*do not.*task acceptance",
            r"criteria.*conditions.*expected results.*actual evidence",
        ))

    def test_task_and_final_plan_verification_remain_distinct(self) -> None:
        verify = self.section("verification", "## task acceptance and final plan acceptance")
        self.contracts(verify, (
            r"task-local acceptance.*distinct from.*final plan.*acceptance",
            r"task acceptance and its focused commit require only.*risk-scaled coder/qa.*ceo focused checks",
            r"reviewer timing and task-boundary gates follow skill\.md risk-scaled execution",
            r"independently acceptable task.*do not delay.*later final plan verification",
            r"required.*task.*checks.*must not.*deferred",
            r"with a plan, the required final whole-change review is final plan verification",
            r"task commit.*does not.*unperformed.*verification.*complete",
        ))
        self.assertRegex(policy_text("core"), r"do not add per-task qa or review gates solely because a task boundary exists")

    def test_commit_blocks_on_scope_checks_findings_and_git_state(self) -> None:
        commit = self.section("commit", "## automatic commit after plan-task acceptance")
        hold = commit.split("hold the task commit", 1)[-1].split("for a no-change task", 1)[0]
        self.contracts(hold, (
            r"unmet.*criteria.*required checks.*failed.*not run.*unresolved findings.*evidence gaps",
            r"scope expansion.*ownership.*staged.*mismatch.*workspace.*branch.*head.*git state",
            r"failure.*partial completion.*record.*reason.*next action",
            r"do not waive.*criteria.*required checks.*commit",
            r"explicit disposition follows existing policy and the evidence verdict",
            r"git failure.*actual branch.*head.*index.*working tree.*before retrying",
        ))
        self.contracts(commit, (
            r"same file.*other tasks.*user changes.*safe separation.*before committing",
            r"unrelated staged changes stop the commit under the preservation rule",
        ))
        assert_term_defined(self, "evidence verdict")
        assert_term_defined(self, "preservation rule")

    def test_commit_evidence_no_change_and_resume_are_explicit(self) -> None:
        commit = self.section("commit", "## automatic commit after plan-task acceptance")
        self.contracts(commit, (
            r"before committing.*approved plan.*task id.*absolute workspace.*repository.*branch.*head.*staged/unstaged/untracked.*ownership",
            r"staged paths.*content.*finalized.*message",
            r"after committing.*sha.*actual message.*included paths.*content.*post-commit head.*branch.*remaining.*staged/unstaged/untracked",
            r"canonical record.*plan.*version.*task id.*acceptance evidence.*required checks.*findings.*commit.*remaining final plan verification",
            r"no-change task.*no empty commit.*acceptance evidence.*no change",
            r"resume.*verify.*sha.*content.*validity.*reuse.*do not duplicate",
            r"missing record.*actual result.*before.*retry",
        ))
        restart = self.section("handoff", "### choice lifetime and restart record")
        self.assertRegex(restart, r"normal authorized head and dirty-state changes, including accepted task commits.*do not by themselves invalidate the choice")
        gate = policy_text("handoff").split("### coder handoff gate", 1)[1].split("### handoff evidence", 1)[0]
        for item in (r"1\. all applicable design/spec/plan approvals are recorded",
                     r"2\. the user explicitly selected the execution target initially",
                     r"3\. the accessible absolute workspace is the intended git repository",
                     r"4\. actual branch or detached head, head, staged/unstaged/untracked state, preservation, and edit ownership are known",
                     r"5\. approved planning-document commits are verified",
                     r"6\. after any commit or branch operation, final path, branch, head, and change state are rechecked",
                     r"7\. the brief includes these preparation and final-verification facts"):
            with self.subTest(gate_item=item):
                self.assertRegex(gate, item)
        self.assertRegex(restart, r"task id.*commit sha.*current git state.*full handoff gate")

    def test_final_findings_use_followup_task_without_rewriting_commit(self) -> None:
        commit = self.section("commit", "## automatic commit after plan-task acceptance")
        followup = commit.split("if final qa/reviewer findings", 1)[-1].split("this local", 1)[0]
        self.contracts(followup, (
            r"already committed.*ceo.*follow-up task.*required planning.*approvals.*correction.*qa reverification.*new focused commit",
            r"reviewer then rechecks only the affected findings when warranted",
            r"do not automatically amend/reset.*rerun.*original task.*duplicate commit",
        ))

    def test_document_batch_and_external_action_boundaries_remain(self) -> None:
        commit = self.section("commit", "## automatic commit after plan-task acceptance")
        planning = self.section("planning", "### complete planning-document set")
        self.contracts(planning, (
            r"normal order: design approval.*written-spec approval.*individual approvals.*complete applicable set.*explicit execution-target choice.*batch commit.*final git verification.*coder handoff",
            r"while documents.*do not.*stage documents.*commit planning documents",
        ))
        self.contracts(commit, (
            r"local.*does not authorize early planning-document commits.*pre-coder.*batch.*unchanged",
            r"conventional commits.*korean description.*trailing period.*lowercase.*scope",
            r"historical spec/plan.*not.*retroactively",
            r"structural checks.*do not prove.*agent runtime",
        ))
        core = self.section("core", "## automatic commit after plan-task acceptance")
        self.assertRegex(core, r"push.*merge.*publish.*deploy.*install.*separate.*approval")


class ConditionalReferenceTests(unittest.TestCase):
    # User-approved static contract exception for this change only.
    # These checks do not establish consuming-agent runtime compliance.
    def test_core_requires_task_scoped_references(self) -> None:
        core = policy_text("core")
        self.assertRegex(core, r"must read.*before.*dependent")
        self.assertRegex(core, r"missing.*conflicting.*ceo.*stop")
        for name in REFERENCE_NAMES:
            with self.subTest(reference=name):
                self.assertIn(f"references/{name}.md", core)
                self.assertTrue((REPO / f"codex/skill/references/{name}.md").is_file())
        self.assertRegex(core, r"do not load all references")

    def test_reference_triggers_cover_dependent_stages(self) -> None:
        core = policy_text("core")
        for name, trigger in (
            ("planning", r"design/plan-depth judgments.*spec/plan drafting or approval"),
            ("handoff", r"every coder first start/restart.*coder trusts the ceo-verified brief.*only brief-cited sections"),
            ("verification", r"verification design.*qa/reviewer.*correction rechecks.*ui acceptance"),
            ("git-recovery", r"branch collision.*git preparation failure.*partial completion.*metadata write denial"),
            ("visual-companion", r"visual companion offer or operation"),
            ("commit", r"plan-task acceptance.*focused commit"),
            ("handoff-prep", r"execution-target choice request.*each preparation git mutation"),
            ("handoff-worktree", r"^[^|]*\|[^|]*\|\s*after explicit new managed worktree selection, before its creation, branch work or document transfer\s*\|?$"),
        ):
            with self.subTest(reference=name):
                row = next(line for line in (REPO / "codex/skill/SKILL.md").read_text().lower().splitlines()
                           if f"references/{name}.md" in line)
                self.assertRegex(row, trigger)
        worktree_row = next(line for line in (REPO / "codex/skill/SKILL.md").read_text().lower().splitlines()
                            if "references/handoff-worktree.md" in line)
        self.assertNotIn("choice request", worktree_row)
        self.assertNotIn("selection target", worktree_row)
        gate = policy_text("handoff-prep").split("### execution-target request gate", 1)[1].split("###", 1)[0]
        self.assertRegex(gate, r"new managed worktree.*selection target.*source absolute path.*repository.*git common directory.*branch or detached head.*verified full source head sha.*approved branch candidate.*collision status.*descriptive name.*approved document transfer/commit scope")
        self.assertRegex(gate, r"app chooses the actual destination path: do not ask the user for a destination path or propose one")
        self.assertRegex(gate, r"read \[handoff-worktree\.md\]\(handoff-worktree\.md\) only after the user explicitly selects that option and before its creation, branch work, or document transfer")
        self.assertNotRegex(policy_text("handoff-prep").split("## workspace handoff", 1)[0], r"choice request also read")
        self.assertRegex(policy_text("handoff-worktree").split("## workspace handoff", 1)[0], r"reads after the user explicitly selects the new managed worktree option, before its creation, branch work or document transfer")
        self.assertNotIn("before an execution-target choice request", policy_text("handoff-worktree").split("## workspace handoff", 1)[0])
        self.assertRegex(policy_text("handoff-worktree"),
                         r"verify final approved branch and head before document transfer, the batch docs commit, final git verification and coder handoff")
        self.assertRegex(policy_text("handoff"), r"new managed worktree and task branch \(selection target under handoff-prep\.md; contract in handoff-worktree\.md after selection\)")
        self.assertRegex(policy_text("planning").split("### managed worktree preparation", 1)[1], r"see \[handoff-worktree\.md\]\(handoff-worktree\.md\)")
        self.assertRegex(core, r"ceo.*each assigned role.*must read")
        self.assertRegex(core, r"ceo must include in the role brief the accessible path and section name of each reference section")

    def test_planning_order_and_recovery_protections_remain(self) -> None:
        planning = policy_text("planning")
        for contract in (
            r"normal order: design approval.*written-spec approval.*individual approvals.*complete applicable set.*explicit execution-target choice.*batch commit.*final git verification.*coder handoff",
            r"while documents.*do not request execution-checkout selection.*stage documents.*commit planning documents",
            r"architectural work always.*writing-plans.*written plan approval",
            r"skip planning only for one local change.*no dependent stages.*shared state.*lifecycle.*integration-order.*one focused verification path",
            r"changed approved documents require approval of the revised version",
            r"while documents.*do not.*worktree creation.*stage documents.*commit planning documents",
            r"normal order:.*complete applicable set.*explicit execution-target choice.*approved branch switch or worktree creation.*batch commit.*final git verification",
        ):
            self.assertRegex(planning, contract)
        recovery = policy_text("git-recovery")
        for contract in (
            r"denial of lock creation alone does not prove a stale lock",
            r"apply the preservation rule: do not delete lock files, use `chmod` or `chown`, bypass the sandbox, or move to another workspace",
            r"minimum escalation.*exact single git command and workspace.*never broad git access",
            r"before retrying.*branch.*head.*index.*partial completion",
            r"both operational failure and missing execution-target choice block handoff",
        ):
            self.assertRegex(recovery, contract)
        assert_term_defined(self, "preservation rule", "coder")

    def test_references_preserve_policy_contracts(self) -> None:
        contracts = {
            "planning": ("complete planning-document set", "written-spec approval", "individually approved"),
            "handoff": ("planning document commit", "unrelated staged", "approved-content verification"),
            "verification": ("criterion verdict", "ui browser acceptance checks", "whole-change review"),
            "git-recovery": ("git metadata write denial", "partial completion", "do not delete lock files"),
            "visual-companion": ("complete keyed url", "terminal text as primary", "waits for acceptance"),
        }
        for name, phrases in contracts.items():
            path = REPO / f"codex/skill/references/{name}.md"
            self.assertTrue(path.is_file(), name)
            for phrase in phrases:
                with self.subTest(reference=name, contract=phrase):
                    self.assertIn(phrase, policy_text(name))

    def test_core_preserves_role_and_risk_gates(self) -> None:
        core = policy_text("core")
        for contract in (r"all five roles.*directly to ceo.*depth 2",
                         r"coder.*independent qa", r"qa.*independent reviewer.*full change",
                         r"ordinary.*significant/high-risk.*not eligible",
                         r"explicit user or task-specific tdd request overrides"):
            self.assertRegex(core, contract)

    def test_coder_trusts_ceo_verified_brief(self) -> None:
        coder = " ".join(tomllib.loads((REPO / "codex/agents/arc-coder.toml").read_text())
                         ["developer_instructions"].lower().split())
        for contract in (
            r"trust the ceo-verified workspace, branch/head, approvals.*document-commit and handoff facts in the brief.*start editing",
            r"do not independently re-verify checkout, branch, head, approval, or document evidence or ask ceo to reconfirm them",
            r"supplied absolute workspace.*never create or switch workspaces or branches.*apply the preservation rule",
            r"report to ceo only a conflict you actually hit while working.*assigned file has unexpected changes you did not make"
            r".*path is missing or inaccessible.*git or tool command fails.*git output shows a branch or state different from the brief",
        ):
            with self.subTest(contract=contract):
                self.assertRegex(coder, contract)
        for absent in (r"independently verify", r"git common directory", r"every first start or restart",
                       r"fresh explicit choice", r"reuse the initial explicit choice", r"revalidates the full handoff gate"):
            with self.subTest(absent=absent):
                self.assertNotRegex(coder, absent)

    def test_coder_profile_holds_handoff_contract_without_full_reference_read(self) -> None:
        coder = " ".join(tomllib.loads((REPO / "codex/agents/arc-coder.toml").read_text())
                         ["developer_instructions"].lower().split())
        self.assertRegex(coder, r"profile is the complete coder handoff contract.*handoff.md.*only.*brief explicitly cites")
        self.assertNotRegex(coder, r"before every first start or restart, read")
        for phrase in ("trust the ceo-verified", "do not repair preparation"):
            self.assertIn(phrase, coder)
        self.assertRegex(policy_text("handoff"), r"coder trusts the ceo-verified facts in the brief.*coder profile.*brief explicitly cites")
        texts = {path.name: " ".join(path.read_text().lower().split()) for path in
                 [*(REPO / "codex/skill").rglob("*.md"), *(REPO / "codex/agents").glob("*.toml")]}
        for name, text in texts.items():
            for absent in (r"coder independently", r"coder's independent", r"coder independent check",
                           r"ceo and coder independently", r"independent checkout"):
                with self.subTest(file=name, absent=absent):
                    self.assertNotRegex(text, absent)

    def test_handoff_split_keeps_coder_start_file_to_start_and_restart_sections(self) -> None:
        def headings(name: str) -> list[str]:
            return [line[4:].strip().lower() for line in (REPO / f"codex/skill/references/{name}.md").read_text().splitlines()
                    if line.startswith("### ")]
        self.assertEqual(headings("handoff"), ["checkout approval", "coder handoff gate", "handoff evidence",
                                               "choice lifetime and restart record"])
        self.assertEqual(headings("handoff-prep"), ["execution-target request gate", "git mutation evidence gate",
                                                    "new task branch", "current checkout", "planning document commit",
                                                    "recovery prerequisite"])
        self.assertEqual(headings("handoff-worktree"), ["new managed worktree", "worktree document transfer"])
        core = (REPO / "codex/skill/references/handoff.md").read_text().lower()
        self.assertIn("handoff-prep.md", core)
        self.assertIn("handoff-worktree.md", core)

    def test_qa_and_reviewer_profiles_hold_contract_without_full_reference_read(self) -> None:
        for role in ("qa", "reviewer"):
            with self.subTest(role=role):
                text = " ".join(tomllib.loads((REPO / f"codex/agents/arc-{role}.toml").read_text())
                                ["developer_instructions"].lower().split())
                self.assertRegex(text, rf"profile is the complete {role} contract.*verification.md.*only.*brief explicitly cites")
        self.assertRegex(policy_text("verification"), r"qa and reviewer contracts.*profiles.*brief explicitly cites")
        reviewer = " ".join(tomllib.loads((REPO / "codex/agents/arc-reviewer.toml").read_text())
                            ["developer_instructions"].lower().split())
        self.assertRegex(reviewer, r"significant/high-risk.*final full change after the required qa/focused checks and any qa recheck")

    def test_restart_choice_lifetime_and_evidence(self) -> None:
        path = REPO / "codex/skill/references/handoff.md"
        self.assertTrue(path.is_file())
        handoff = policy_text("handoff")
        cases = {
            "first start": r"first start.*explicit user choice",
            "same target": r"same approved scope.*workspace.*repository.*execution target.*reuse.*initial explicit choice",
            "fresh state": r"every first start and restart, ceo rechecks actual git state",
            "changed target": r"scope.*workspace.*repository.*target.*approved branch candidate.*changes.*fresh explicit choice",
            "invalidating failure": r"failure.*old target cannot be trusted.*fresh explicit choice",
            "normal work": r"normal.*head.*dirty.*do not.*invalidate",
            "record": r"one canonical initial handoff record.*accessible",
            "delta": r"delta-only restart brief \(delta relative to the record file the fresh coder reads; every other brief field in full\).*initial record.*next objective.*ownership.*approvals.*documents.*current git state",
            "block": r"inaccessible.*record.*missing evidence.*unclear ownership.*block",
        }
        for case, contract in cases.items():
            with self.subTest(case=case):
                self.assertRegex(handoff, contract)
        self.assertNotRegex(handoff, r"ceo and coder independently recheck")
        self.assertNotRegex(handoff, r"full handoff gate and independent checks")


class ReviewerOncePerPlanTests(unittest.TestCase):
    # Structural checks of the written contract only, not consuming-agent runtime compliance.
    def test_final_single_reviewer_is_explicit(self) -> None:
        for name, text, contract in (
            ("core", policy_text("core"), r"reviewer is never a plan-task acceptance prerequisite; for significant work with a plan, it reviews the final full change once after all plan tasks are accepted with their risk-scaled checks, following the last plan task's required checks and any qa recheck at the final relevant state; significant work without a plan keeps reviewer after qa before acceptance"),
            ("verification", policy_text("verification"), r"reviewer timing and task-boundary gates follow skill\.md risk-scaled execution"),
            ("verification-cleanup", policy_text("verification"), r"verified ignore-pattern or metadata cleanup.*targets are unused.*required project materials are unaffected.*ignore patterns cover only intended paths.*diff matches the approved scope.*focused checks then suffice without automatically calling qa or reviewer"),
            ("verification-env", policy_text("verification"), r"an environment failure is distinct from a code failure.*report the exact limitation"),
            ("verification-pointer", policy_text("verification"), r"skill\.md risk-scaled execution holds the risk table, risk definitions, evidence-reuse rule, and role order"),
            ("planning", policy_text("planning"), r"never list reviewer as a per-task required check \(reviewer timing: skill\.md risk-scaled execution\)"),
            ("commit", policy_text("commit"), r"reviewer timing: skill\.md risk-scaled execution"),
            ("planner", profile_text("planner"), r"single independent reviewer review of the final full change after all tasks are accepted with their risk-scaled checks"),
        ):
            with self.subTest(artifact=name):
                self.assertRegex(text, contract)
        row = next(line for line in (REPO / "codex/skill/SKILL.md").read_text().lower().splitlines()
                   if line.startswith("| significant/high risk"))
        self.assertRegex(row, r"with a plan, each plan task risk-scaled coder → qa or ceo focused checks → acceptance/commit satisfies the qa step, then independent reviewer once on the final full change after all plan tasks")

    def test_no_per_task_reviewer_wording(self) -> None:
        paths = [*(REPO / "codex/skill").rglob("*.md"), *(REPO / "codex/agents").glob("*.toml")]
        for path in paths:
            text = " ".join(path.read_text().lower().split())
            with self.subTest(file=path.name, absent="accepted and qa'd"):
                self.assertNotIn("accepted and qa'd", text)
                self.assertNotIn("수락·QA된".lower(), text)
            for absent in (r"checks/reviews", r"in a multi-task plan", r"review as a task acceptance prerequisite",
                           r"expressly a task prerequisite", r"designated as that task's prerequisite",
                           r"qa/review at that dependency boundary", r"new reviewer for each task unless",
                           r"선행 조건으로 지정", r"검사/검토"):
                with self.subTest(file=path.name, absent=absent):
                    self.assertNotRegex(text, absent)

    def test_dependency_boundary_is_qa_only(self) -> None:
        core = policy_text("core")
        self.assertRegex(core, r"depends on a still-unverified risky contract, complete applicable qa at that dependency boundary")
        self.assertNotRegex(core, r"qa/review at that dependency boundary")

    def test_final_reviewer_findings_on_committed_work(self) -> None:
        for name in ("verification", "commit"):
            with self.subTest(reference=name):
                self.assertRegex(policy_text(name), r"follow-up task.*correction.*qa re(?:check|verification).*new focused commit"
                                                    r".*reviewer then rechecks only the affected findings when warranted")


class ResearchRoutingAndBriefTests(unittest.TestCase):
    def test_codex_spawn_fork_and_user_input_policy(self) -> None:
        skill = " ".join((REPO / "codex/skill/SKILL.md").read_text().split())
        self.assertRegex(skill, r"Every specialist spawn sets `fork_turns=\"none\"`; full-history forks are not allowed")
        self.assertNotIn("When supported, start specialists", skill)
        self.assertIn("`request_user_input` questions use only `title` and `options` fields, never `question`", skill)

    def test_claude_native_role_and_ask_user_question_policy(self) -> None:
        skill = " ".join((REPO / "claude/skill/SKILL.md").read_text().split())
        self.assertIn("Always start an ARC role by its installed native name (`arc-*`) with only the supplied scoped brief; never use a context-inheriting fork (such as the `fork` subagent type) for an ARC role", skill)
        self.assertIn("do not claim fresh context isolation without evidence", skill)
        self.assertNotIn("When supported, start specialists", skill)
        self.assertIn("`AskUserQuestion` questions use only `question`, a `header` of at most 12 characters, 2-4 `options` each with `label` and `description`, and `multiSelect`", skill)

    # Structural checks of the written contract only, not consuming-agent runtime compliance.
    def test_research_routing_tiers(self) -> None:
        opening = policy_text("core").split("## ownership", 1)[0]
        self.assertRegex(opening, r"quick read of a few known files.*all other material research/analysis and bounded exploration \(read-only, of static code, documents, data, and logs/reports\) goes to scouter with its configured settings.*narrow brief.*known paths.*specific facts.*no synthesis")
        for gone in ("lighter effort", "when unsure", "under models"):
            self.assertNotIn(gone, opening)
        claude = " ".join((REPO / "claude/skill/SKILL.md").read_text().lower().split()).split("## ownership", 1)[0]
        self.assertRegex(claude, r"quick read of a few known files.*narrow brief.*known paths.*specific facts.*no synthesis")
        for gone in ("when unsure", "under models"):
            self.assertNotIn(gone, claude)

    def test_models_scouter_lookup_exception(self) -> None:
        models = policy_text("core").split("## models", 1)[1].split("after editing", 1)[0]
        self.assertIn("use configured settings without substitution; report unavailable settings", models)
        self.assertNotIn("reasoning_effort", models)
        self.assertNotIn("bounded scouter lookup", models)
        self.assertNotIn('reasoning_effort="medium"', policy_text("core"))

    def test_skill_not_reread_and_agents_body_wording(self) -> None:
        tokens = policy_text("core").split("## token discipline and handoffs", 1)[1].split("## models", 1)[0]
        self.assertRegex(tokens, r"this skill file, once read in this context and unchanged, is not re-read on follow-up turns")
        body = installer.agents_block_body(Path("/home/u/.codex"), Path("/home/u"))
        self.assertIn("keep following it in relevant follow-up turns of the same chat without re-reading it unless it changed", body)
        self.assertNotIn("including relevant follow-up turns", body)

    def test_brief_template_field_order_and_delta(self) -> None:
        tokens = policy_text("core").split("## token discipline and handoffs", 1)[1].split("## models", 1)[0]
        self.assertRegex(tokens, r"goal; criteria \(ids\); exact scope/ownership \(absolute workspace, branch or detached head and head, handoff record path, when one exists, files\); constraints/decisions; evidence \(paths/lines, commands, artifact links\); prior findings; exact next objective \(one bounded objective\); return format")
        self.assertRegex(tokens, r"follow-ups and restarts send only changed fields and mark the rest `unchanged`")
        self.assertRegex(tokens, r"`unchanged` means unchanged relative to a cited artifact the recipient can read \(the handoff record file or a brief it received\); a fresh specialist, including a fresh restart coder, gets every other field in full")
        for kept in (r"self-contained subset.*omit full history, repeated instructions, and raw logs",
                     r"one bounded objective",
                     r"conclusion, evidence locations, unresolved points, next step",
                     r"no findings may be brief; requested deliverables such as complete plan drafts remain complete",
                     r"cite paths/lines/pages/commands/links instead of logs; investigate gaps only"):
            with self.subTest(kept=kept):
                self.assertRegex(tokens, kept)

    def test_handoff_record_file_location(self) -> None:
        handoff = policy_text("handoff")
        for contract in (
            r"ceo writes it as a markdown file at `<git-common-dir>/arc/handoff/<plan-or-task-slug>\.md`",
            r"`git rev-parse --path-format=absolute --git-common-dir`.*outside the working tree.*shared by linked worktrees",
            r"not a git mutation, never staged or committed.*no secrets",
            r"absolute path in every brief.*delta restart briefs cite it",
            r"slug unique to the plan.*dated plan filename stem, or a spec/task slug when no plan exists.*never overwrite another plan's record",
            r"write is denied or unavailable, every coder brief carries the full record inline \(no delta, no record-file `unchanged`\) and states why; that inline record satisfies the accessible record requirement",
            r"do not delete it automatically",
            r"do not create a separate storage service",
        ):
            with self.subTest(contract=contract):
                self.assertRegex(handoff, contract)
        self.assertRegex(policy_text("core"), r"records the canonical handoff state in the handoff record file")


SHARED_TERMS = {
    "preservation rule": "preserve unrelated staged, unstaged, and untracked changes and edit ownership; never "
                         "automatically stash, reset, clean, unstage, discard, amend, or delete branches/worktrees; "
                         "never change permissions, delete locks, or bypass the sandbox to proceed; stop and report to "
                         "ceo (ceo reports to the user)",
    "explicit choice": "only a clear user selection counts; planning approval, silence, refusal of another option, or "
                       "an ambiguous reply never does",
    "stop and inspect": "on failure or partial completion, stop dependent work; inspect and record the actual path, "
                        "branch or detached head, head, index, files, and completed steps; do not retry, fall back, or "
                        "repeat completed work automatically; revalidate affected gates after resolution",
    "evidence verdict": "each criterion is proven, unmet, or unverified; passing runs, reports, or disposition never "
                        "turn unverified into proven; reports keep unverified scope visible",
}


def assert_term_defined(case: unittest.TestCase, term: str, profile: str | None = None) -> None:
    # A replaced restatement is pinned by its term usage plus the term's full definition.
    case.assertIn(f"{term}: {SHARED_TERMS[term]}", policy_text("core").replace("*", ""))
    if profile:
        case.assertIn(f"{term}: {SHARED_TERMS[term]}", profile_text(profile))


def raw_policy_text(name: str) -> str:
    path = REPO / "codex/skill" / ("SKILL.md" if name == "core" else f"references/{name}.md")
    return " ".join(path.read_text().split())


def profile_text(role: str) -> str:
    return " ".join(tomllib.loads((REPO / f"codex/agents/arc-{role}.toml").read_text())
                    ["developer_instructions"].lower().split())


POLICY_WORD_CEILINGS = {
    "codex/skill/SKILL.md": 2850,
    "codex/skill/references/commit.md": 600,
    "codex/skill/references/git-recovery.md": 700,
    "codex/skill/references/handoff-prep.md": 1350,
    "codex/skill/references/handoff-worktree.md": 850,
    "codex/skill/references/handoff.md": 1300,
    "codex/skill/references/planning.md": 1850,
    "codex/skill/references/verification.md": 1150,
    "codex/skill/references/visual-companion.md": 200,
    "codex/agents/arc-coder.toml": 700,
    "codex/agents/arc-planner.toml": 600,
    "codex/agents/arc-qa.toml": 350,
    "codex/agents/arc-reviewer.toml": 250,
    "codex/agents/arc-scouter.toml": 250,
    "claude/skill/SKILL.md": 3300,
    "claude/skill/references/commit.md": 350,
    "claude/skill/references/git-recovery.md": 500,
    "claude/skill/references/handoff-prep.md": 600,
    "claude/skill/references/handoff.md": 500,
    "claude/skill/references/planning.md": 1500,
    "claude/skill/references/verification.md": 850,
    "claude/skill/references/visual-companion.md": 150,
    "claude/agents/arc-coder.md": 400,
    "claude/agents/arc-planner.md": 400,
    "claude/agents/arc-qa.md": 450,
    "claude/agents/arc-reviewer.md": 350,
    "claude/agents/arc-scouter.md": 300,
}
POLICY_WORD_TOTAL_CEILING = 12750
CLAUDE_POLICY_WORD_TOTAL_CEILING = 9250


def policy_word_counts(root: Path) -> dict[str, int]:
    paths = [root / "codex/skill/SKILL.md", *sorted((root / "codex/skill/references").glob("*.md")),
             *sorted((root / "codex/agents").glob("*.toml")),
             root / "claude/skill/SKILL.md", *sorted((root / "claude/skill/references").glob("*.md")),
             *sorted((root / "claude/agents").glob("*.md"))]

    def body(path: Path) -> str:
        if path.suffix == ".toml":
            return tomllib.loads(path.read_text())["developer_instructions"]
        text = path.read_text()
        if path.parent.name == "agents" and text.startswith("---"):
            return text.split("---", 2)[2]
        return text
    return {str(path.relative_to(root)): len(body(path).split()) for path in paths}


class WholeSystemReviewFollowUpTests(unittest.TestCase):
    # Structural checks of the written contract only, not consuming-agent runtime compliance.
    def test_plan_case_qa_requirement_is_satisfied_by_task_checks(self) -> None:
        core = policy_text("core")
        self.assertRegex(core, r"with a plan, each plan task risk-scaled coder → qa or ceo focused checks → acceptance/commit satisfies the qa step")
        verification = policy_text("verification")
        self.assertRegex(verification, r"significant/high-risk work requires independent review of the full change at the final relevant state after the required qa/focused checks and any qa recheck")
        self.assertNotIn("requires qa followed by independent review", verification)
        self.assertRegex(profile_text("reviewer"), r"review the final full change after the required qa/focused checks and any qa recheck")

    def test_planning_points_to_common_handoff_gate(self) -> None:
        planning = policy_text("planning")
        self.assertIn("the common handoff gate in skill.md and handoff.md", planning)
        self.assertNotIn("the complete the common handoff gate", planning)
        self.assertNotIn("`workspace handoff` gate below", planning)

    def test_config_comment_matches_subagent_limit(self) -> None:
        config = (REPO / "codex/config.toml").read_text()
        self.assertIn("at most four simultaneous subagents", config)
        self.assertNotIn("one owner plus three specialists", config)

    def test_reviewer_description_has_no_team_name(self) -> None:
        description = tomllib.loads((REPO / "codex/agents/arc-reviewer.toml").read_text())["description"]
        self.assertNotIn("Yunho Team", description)

    def test_fallback_record_inline_and_slug(self) -> None:
        handoff = policy_text("handoff")
        self.assertRegex(handoff, r"no delta, no record-file `unchanged`")
        self.assertRegex(handoff, r"or a spec/task slug when no plan exists")

    def test_coder_reads_record_for_unchanged_fields(self) -> None:
        self.assertRegex(profile_text("coder"), r"read the cited handoff record file for fields marked `unchanged`")


class PolicyWordBudgetTests(unittest.TestCase):
    def test_policy_text_stays_within_word_budget(self) -> None:
        counts = policy_word_counts(REPO)
        self.assertEqual(sorted(counts), sorted(POLICY_WORD_CEILINGS),
                         "every policy file needs a word ceiling in POLICY_WORD_CEILINGS")
        advice = "raise the ceiling only deliberately in the same change that justifies the growth"
        for name, words in counts.items():
            with self.subTest(file=name):
                self.assertLessEqual(words, POLICY_WORD_CEILINGS[name],
                                     f"{name}: {words} words exceeds ceiling {POLICY_WORD_CEILINGS[name]}; {advice}")
        for prefix, ceiling in (("codex/", POLICY_WORD_TOTAL_CEILING), ("claude/", CLAUDE_POLICY_WORD_TOTAL_CEILING)):
            total = sum(words for name, words in counts.items() if name.startswith(prefix))
            self.assertLessEqual(total, ceiling,
                                 f"{prefix} total: {total} words exceeds ceiling {ceiling}; {advice}")


class SharedTermsTests(unittest.TestCase):
    # Structural checks of the written contract only, not consuming-agent runtime compliance.
    def test_core_defines_shared_terms(self) -> None:
        core = policy_text("core").replace("*", "")
        self.assertIn("## shared terms", core)
        terms = core.split("## shared terms", 1)[1].split(" ## ", 1)[0]
        for term, body in SHARED_TERMS.items():
            with self.subTest(term=term):
                self.assertIn(f"{term}: {body}", terms)

    def test_profiles_carry_terms_used_in_citable_sections(self) -> None:
        for role, terms in (("coder", ("preservation rule", "explicit choice", "stop and inspect")),):
            for term in terms:
                with self.subTest(role=role, term=term):
                    self.assertIn(f"{term}: {SHARED_TERMS[term]}", profile_text(role))
        # QA/Reviewer (verification) and Planner (planning) profiles do not define the terms, so those
        # references must not use them.
        for name in ("verification", "planning"):
            for term in SHARED_TERMS:
                with self.subTest(reference=name, term=term):
                    self.assertNotIn(term.capitalize(), raw_policy_text(name))

    def test_qa_fix_restorations(self) -> None:
        coder = profile_text("coder")
        for phrase in ("do not repair preparation by changing permissions, deleting locks, bypassing the sandbox, "
                       "committing, creating/switching branches, or moving workspaces",
                       "if risk is or becomes unclear or scope expands, stop and ask ceo to reclassify",
                       "stop dependent work and report the observed state and required next action to ceo"):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, coder)
        core = policy_text("core")
        self.assertIn("substantial behavior or contract changes are significant regardless of file count", core)
        self.assertIn("coder repair limits are in the coder profile", core)
        self.assertRegex(policy_text("handoff"), r"one canonical initial handoff record.*repository/workspace identity")
        reviewer = profile_text("reviewer")
        self.assertIn("for development work, functional and test verification belongs to qa and completion remains with "
                      "ceo; ceo decides overall completion within its assigned scope", reviewer)

    def test_term_usage_sites(self) -> None:
        for name, heading, term in (
            ("handoff", "### checkout approval", "explicit choice"),
            ("handoff-prep", "### execution-target request gate", "explicit choice"),
            ("handoff-prep", "### git mutation evidence gate", "preservation rule"),
            ("handoff-prep", "### planning document commit", "preservation rule"),
            ("handoff-prep", "### planning document commit", "stop and inspect"),
            ("git-recovery", "### git metadata write denial", "preservation rule"),
            ("git-recovery", "### existing changes and failures", "preservation rule"),
            ("git-recovery", "### worktree failures and partial completion", "preservation rule"),
            ("git-recovery", "### worktree failures and partial completion", "stop and inspect"),
            ("commit", "## automatic commit after plan-task acceptance", "preservation rule"),
            ("commit", "## automatic commit after plan-task acceptance", "evidence verdict"),
            ("core", "## risk-scaled execution", "evidence verdict"),
        ):
            with self.subTest(reference=name, section=heading, term=term):
                text = raw_policy_text(name)
                self.assertIn(heading, text.lower())
                section = text[text.lower().index(heading) + len(heading):]
                for boundary in (" ## ", " ### "):
                    section = section.split(boundary, 1)[0]
                self.assertIn(f"the {term.capitalize()}", section)


class ARCPreactionGateTests(unittest.TestCase):
    # Specifically approved structural contract checks, not consuming-agent runtime tests.
    def test_preaction_role_precedence(self) -> None:
        core = policy_text("core").split("## instruction and execution adapter")[1].split("## mandatory task references")[0]
        self.assertRegex(core, r"brainstorming.*role.*save.*early.*commit.*arc")
        planning = policy_text("planning").split("### document-save evidence gates")[0]
        self.assertIn("ceo must not substitute an independently authored spec", planning)
        self.assertRegex(planning, r"planner.*complete spec draft and self-review.*ceo integrates, saves, self-reviews")
        self.assertRegex(planning, r"bounded written spec.*existing ceo depth judgment.*planner.*proportional complete spec draft.*self-review.*ceo.*individual written-spec approval")
        planner = " ".join(tomllib.loads((REPO / "codex/agents/arc-planner.toml").read_text())
                           ["developer_instructions"].lower().split())
        self.assertRegex(planner, r"complete spec draft and self-review.*ceo integrates/saves/self-reviews")

    def test_preaction_document_save_evidence(self) -> None:
        planning = policy_text("planning")
        self.assertIn("### document-save evidence gates", planning)
        gates = planning.split("### document-save evidence gates")[1].split("### complete planning-document set")[0]
        spec, plan = gates.split("**plan save:**")
        with self.subTest(path="architectural"):
            self.assertIn("first architectural spec save", spec)
            for phrase in ("approved design scope", "approval evidence", "planner's complete spec draft",
                           "self-review", "ceo's integration/save/review responsibility", "absolute save path"):
                self.assertIn(phrase, spec)
        with self.subTest(path="bounded_required_spec"):
            for phrase in ("first required bounded written spec save", "existing ceo depth judgment",
                           "approved short design", "spec-necessity rationale and scope", "proportional complete draft",
                           "self-review", "ceo's integration/save/review responsibility", "individual written-spec approval"):
                self.assertIn(phrase, spec)
        with self.subTest(path="short_design_distinction"):
            self.assertRegex(spec, r"saving or approving the short design does not replace.*required spec.*drafting.*self-review.*individual approval")
        with self.subTest(path="spec_approval_order"):
            self.assertRegex(spec, r"architectural and required bounded specs.*approved versions.*applicable document set")
            self.assertRegex(spec, r"written-spec approval.*before dependent plan drafting and execution preparation")
        with self.subTest(path="save_without_circular_approval"):
            self.assertIn("does not require written-spec approval or execution-target choice", spec)
        complete = planning.split("### complete planning-document set")[1].split("### evidence refresh and limits")[0]
        rows = {line.split("|")[1].strip().lower(): " ".join(line.lower().split())
                for line in (REPO / "codex/skill/references/planning.md").read_text().splitlines()
                if line.startswith("| ") and len(line.split("|")) >= 4}
        with self.subTest(path="bounded_plan_required_without_spec"):
            self.assertIn("a required plan does not itself require a written spec", complete)
            self.assertIn("only when the existing ceo depth judgment requires it", rows["bounded, plan required"])
        for path, row, contract in (
            ("spike", "spike probe", "do not force specs/plans for still-unknown implementation"),
            ("bounded_plan_skip", "bounded, plan skipped", "approve the short design"),
            ("nonbehavior", "non-behavior documentation/configuration", "why design/planning stages are inapplicable"),
        ):
            with self.subTest(path=path):
                self.assertIn(contract, rows[row])
                self.assertIn("no new spec obligation", rows[row])
        with self.subTest(path="plan_save"):
            for phrase in ("approved design", "approved written-spec version", "plan-depth", "dependencies",
                           "planner's complete plan draft", "self-review", "absolute save path"):
                self.assertIn(phrase, plan)
            self.assertRegex(plan, r"missing.*mismatched.*stop.*save.*ceo")

    def test_preaction_reference_and_choice_order(self) -> None:
        rows = (REPO / "codex/skill/SKILL.md").read_text().lower().splitlines()
        planning = next(row for row in rows if "references/planning.md" in row)
        handoff = next(row for row in rows if "references/handoff-prep.md" in row)
        self.assertIn("first spec/plan save", planning)
        for trigger in ("execution-target choice request", "each preparation git mutation"):
            self.assertIn(trigger, handoff)
        self.assertIn("### execution-target request gate", policy_text("handoff"))
        choice = policy_text("handoff").split("### execution-target request gate")[1].split("### git mutation evidence gate")[0]
        for phrase in ("complete document list", "absolute paths", "approved versions", "individual approval evidence",
                       "dependencies", "no unfinished applicable documents"):
            self.assertIn(phrase, choice)
        self.assertRegex(choice, r"unfinished.*missing approval.*stop.*request")
        self.assertIn("do not require choice evidence before asking for that choice", choice)
        self.assertIn("required artifacts, not a spec on every path", choice)

    def test_preaction_git_evidence_and_batch_order(self) -> None:
        handoff = policy_text("handoff")
        self.assertIn("### git mutation evidence gate", handoff)
        gate = handoff.split("### git mutation evidence gate")[1].split("### ", 1)[0]
        for phrase in ("before each", "branch creation/switch", "worktree creation", "staging", "commit", "complete approved document set",
                       "explicit execution-target choice", "absolute workspace", "repository", "branch or detached head",
                       "staged/unstaged/untracked", "preservation", "ownership", "command", "target paths",
                       "unresolved failure", "read-only"):
            with self.subTest(evidence=phrase):
                self.assertIn(phrase, gate)
        planning = policy_text("planning").split("### complete planning-document set")[1]
        self.assertRegex(planning, r"defers.*brainstorming.*commit the spec.*written-spec review")
        self.assertIn("spec steps apply only to architectural and required bounded specs", planning)
        commit = handoff.split("### planning document commit")[1].split("### recovery prerequisite")[0]
        for contract in (r"reuse valid commits without recommitting", r"batch all remaining uncommitted approved documents",
                         r"staged paths and staged diff match exactly", r"finalizes.*message before the first commit",
                         r"after success verify sha.*post-commit head.*final branch"):
            self.assertRegex(commit, contract)

    def test_preaction_stop_and_runtime_limits(self) -> None:
        planning = policy_text("planning")
        self.assertIn("### evidence refresh and limits", planning)
        limits = planning.split("### evidence refresh and limits")[1]
        for phrase in ("missing", "mismatched", "unfinished approvals", "failure", "stop", "reverify",
                       "do not retroactively", "structural checks", "runtime compliance", "unverified"):
            self.assertIn(phrase, limits)
        self.assertIn("do not modify external skills", planning)
        handoff = policy_text("handoff")
        self.assertRegex(handoff, r"unrelated staged files.*preserved.*block handoff")
        gate = handoff.split("### git mutation evidence gate", 1)[1].split("### ", 1)[0]
        self.assertIn("apply the preservation rule; unrelated staged files stop the mutation", gate)
        docs = handoff.split("### planning document commit", 1)[1].split("### ", 1)[0]
        self.assertIn("unrelated staged files stop the commit under the preservation rule", docs)
        assert_term_defined(self, "preservation rule", "coder")


class CeoDirectPathTests(unittest.TestCase):
    # Structural checks of the written contract only, not consuming-agent runtime compliance.
    def direct(self) -> str:
        core = policy_text("core")
        self.assertIn("## ceo direct path for small tasks", core)
        return core.split("## ceo direct path for small tasks", 1)[1].split(" ## ", 1)[0]

    def test_direct_path_eligibility_is_small_low_risk_and_plan_skip(self) -> None:
        for contract in (
            r"without planner brainstorming or coder",
            r"every small, low-risk criterion holds",
            r"every plan-skip criterion.*one local change.*no dependent stages.*shared state.*lifecycle.*integration-order.*one focused verification path",
            r"no significant-risk trigger",
            r"spike, architectural, ordinary-behavior, significant/high-risk, unclear-risk.*not eligible",
            r"overlapping.*coder.*not eligible",
        ):
            with self.subTest(contract=contract):
                self.assertRegex(self.direct(), contract)
        self.assertRegex(policy_text("core"), r"small, low risk means narrow, understood, readily reversible, and verifiable by focused checks")

    def test_direct_path_keeps_approval_handoff_tdd_and_verification(self) -> None:
        for contract in (
            r"before editing.*records.*scope.*files.*why every criterion holds.*acceptance criteria.*focused verification",
            r"presents.*short design.*user.*explicit approval",
            r"silence.*not approval",
            r"passes the coder handoff gate in handoff, with the approved short design as the applicable approval, before the first edit",
            r"edits only the approved files, preserves others' edits.*surgical edits.*without unrelated refactoring.*does not install dependencies without authorization",
            r"records the changed files",
            r"corrections for a failed focused check or a qa finding stay within the approved files",
            r"behavior edits follow coder tdd and constraints; when tdd applies, ceo follows installed `test-driven-development`",
            r"focused checks.*each acceptance criterion.*evidence.*unverified scope",
            r"not independent of its own edit",
        ):
            with self.subTest(contract=contract):
                self.assertRegex(self.direct(), contract)
        tdd = policy_text("core").split("## coder tdd and constraints", 1)[1].split(" ## ", 1)[0]
        self.assertRegex(tdd, r"explicit user or task-specific tdd request overrides this waiver.*do not claim tdd was followed")
        self.assertRegex(policy_text("handoff"), r"before a ceo direct edit, ceo verifies the same conditions, with the approved short design as the applicable approval")

    def test_direct_path_stops_and_reclassifies_without_reverting(self) -> None:
        for contract in (
            r"scope expands.*risk becomes unclear.*criterion stops holding.*stops editing.*records the changes.*reclassif",
            r"normal planner/coder flow.*coder owning subsequent edits",
            r"do not automatically revert, reset, stash, or clean",
            r"no automatic task commit.*applicable guidance and user requests",
        ):
            with self.subTest(contract=contract):
                self.assertRegex(self.direct(), contract)

    def test_ownership_and_flows_name_the_direct_path_exception(self) -> None:
        core = policy_text("core")
        ownership = core.split("## ownership", 1)[1].split("## instruction", 1)[0]
        self.assertRegex(ownership, r"ceo does not edit them directly except under the ceo direct path")
        self.assertRegex(core, r"ceo assigns edits exclusively to coder except under the ceo direct path")
        row = next(line for line in (REPO / "codex/skill/SKILL.md").read_text().lower().splitlines()
                   if line.startswith("| small, low risk"))
        self.assertIn("ceo direct path", row)
        gate = core.split("## common handoff gate", 1)[1].split("## coder tdd", 1)[0]
        self.assertRegex(gate, r"same conditions.*before a ceo direct edit")
        planning = policy_text("planning")
        self.assertRegex(planning, r"never runs brainstorming itself except under the ceo direct path")
        self.assertRegex(planning, r"approve a short design before coder or a ceo direct edit")
        self.assertRegex(policy_text("verification"), r"exclusively to coder.*except under the ceo direct path")
        self.assertRegex(policy_text("handoff"), r"ceo direct edit.*same.*conditions")
        handoff_row = next(line for line in (REPO / "codex/skill/SKILL.md").read_text().lower().splitlines()
                           if "references/handoff.md" in line)
        self.assertIn("ceo direct edit", handoff_row)


class CoderBriefAndReuseTests(unittest.TestCase):
    # Structural checks of the written contract only, not consuming-agent runtime compliance.
    def test_fresh_coder_per_top_level_task(self) -> None:
        core = policy_text("core")
        self.assertRegex(core, r"starts? a fresh coder for\s*each top-level task")
        self.assertRegex(core, r"reuse the current coder only for corrections, rework, or rechecks of the same task")
        self.assertNotRegex(core, r"may reuse coder while the approved scope")
        self.assertRegex(core, r"coder reuse follows the per-task rule")
        self.assertRegex(core, r"fresh coder for the next task in the same approved scope is a restart under handoff.*reuses a still-valid initial execution-target choice.*fresh state checks.*delta-only restart brief \(delta relative to the record file the fresh coder reads; every other brief field in full\)")
        self.assertRegex(core, r"before sending corrections or rework to a reused coder, ceo rechecks workspace, branch/head and change state against the brief")

    def test_coder_briefs_cite_sections_instead_of_whole_documents(self) -> None:
        core = policy_text("core")
        self.assertRegex(core, r"coder briefs.*plan/spec path.*task section's line range.*needed excerpts.*do not ask coder to read whole plans or specs")
        coder = " ".join(tomllib.loads((REPO / "codex/agents/arc-coder.toml").read_text())
                         ["developer_instructions"].lower().split())
        self.assertRegex(coder, r"read plan/spec documents only in the sections the brief cites")

    def test_loader_keeps_subagents_on_profiles(self) -> None:
        body = installer.agents_block_body(Path("/home/u/.codex"), Path("/home/u"))
        self.assertIn("ARC subagents (depth 2) follow their role profile and brief instead and do not load `SKILL.md`.", body)


class LongTaskTokenTests(unittest.TestCase):
    # Structural checks of the written contract only, not consuming-agent runtime compliance.
    def test_plan_amendment_restarts_coder(self) -> None:
        self.assertRegex(policy_text("core"), r"after an approved plan or acceptance-criteria amendment, start a fresh coder for the remaining work even within the same task.*restart under handoff.*delta brief")

    def test_long_running_commands_are_not_polled_with_sleep(self) -> None:
        self.assertRegex(policy_text("core"), r"do not poll long-running commands with repeated `sleep`.*single blocking wait")
        coder = " ".join(tomllib.loads((REPO / "codex/agents/arc-coder.toml").read_text())
                         ["developer_instructions"].lower().split())
        self.assertRegex(coder, r"do not poll long-running commands with repeated `sleep`.*single blocking wait.*longest.*report.*ceo")

    def test_ceo_recommends_new_session_per_plan(self) -> None:
        self.assertRegex(policy_text("core"), r"when a plan completes or before starting another plan.*records the canonical handoff state.*recommends.*new session")


class TokenDisciplineTests(unittest.TestCase):
    # Structural checks of the written contract only, not consuming-agent runtime compliance.
    def test_core_waits_without_polling_and_batches_messages(self) -> None:
        tokens = policy_text("core").split("## token discipline and handoffs", 1)[1].split("## models", 1)[0]
        for contract in (
            r"wait_agent.*maximum supported timeout.*until.*completes",
            r"timeout.*not a reason to poll",
            r"do not poll.*list_agents.*sleep.*repeated short waits",
            r"list_agents`? only.*unknown agent",
            r"one complete brief.*batch related.*one message",
        ):
            with self.subTest(contract=contract):
                self.assertRegex(tokens, contract)

    def test_core_reads_targeted_ranges_without_weakening_references(self) -> None:
        tokens = policy_text("core").split("## token discipline and handoffs", 1)[1].split("## models", 1)[0]
        for contract in (
            r"read only the needed ranges.*rg -n.*sed -n",
            r"cap long command output",
            r"do not re-read.*unchanged",
            r"mandatory reference.*already read in this context.*unchanged.*need not be re-read",
            r"does not shorten.*triggered mandatory reference",
        ):
            with self.subTest(contract=contract):
                self.assertRegex(tokens, contract)

    def test_role_profiles_read_targeted_ranges(self) -> None:
        for role in ("scouter", "planner", "coder", "qa", "reviewer"):
            with self.subTest(role=role):
                text = " ".join(tomllib.loads((REPO / f"codex/agents/arc-{role}.toml").read_text())
                                ["developer_instructions"].lower().split())
                self.assertRegex(text, r"read only needed file ranges.*keep command output short.*do not re-read unchanged files")


class RolePolicyTests(unittest.TestCase):
    # Approved package-consistency checks; these do not execute agent runtime behavior.
    def test_role_profiles_report_to_ceo_without_nested_delegation(self) -> None:
        for role in ("scouter", "planner", "coder", "qa", "reviewer"):
            with self.subTest(role=role):
                profile = tomllib.loads((REPO / "codex/agents" / f"arc-{role}.toml").read_text())
                self.assertEqual(profile["name"], f"arc_{role}")
                instructions = " ".join(profile["developer_instructions"].lower().split())
                self.assertRegex(instructions, r"report(?:s)? directly to (?:the )?ceo")
                self.assertRegex(instructions, r"(?:do not|never|cannot) (?:create|spawn) (?:agents|subagents)")
                self.assertRegex(instructions, r"(?:do not|never|cannot) (?:delegate|assign) (?:work|tasks)")
    def test_role_policy_assigns_development_to_ceo(self) -> None:
        policy = " ".join((REPO / "codex/skill/SKILL.md").read_text().lower().split())
        ownership = policy.split("## ownership", 1)[1].split("## instruction", 1)[0]
        self.assertRegex(ownership, r"ceo.*sole owner.*development, configuration, tests")
        self.assertRegex(ownership, r"coder.*(?:edits|implements).*assigned.*files")
        self.assertRegex(ownership, r"all five roles.*directly to ceo.*depth 2")
        self.assertRegex(ownership, r"at most four.*subagents.*including scouter")
        self.assertRegex(ownership, r"scouter.*read.only")

    def test_scouter_read_only_scope_and_reporting(self) -> None:
        profile = tomllib.loads((REPO / "codex/agents/arc-scouter.toml").read_text())
        self.assertEqual(profile["name"], "arc_scouter")
        self.assertEqual(profile["sandbox_mode"], "read-only")
        instructions = " ".join(profile["developer_instructions"].lower().split())
        for phrase in ("research", "analysis", "static", "code", "documents", "data", "evidence",
                       "unresolved", "do not edit files", "standalone document", "operational cleanup"):
            self.assertIn(phrase, instructions)

    def test_standalone_document_writing_has_no_specialist_auto_route(self) -> None:
        self.assertIn("standalone document writing has no specialist auto-route", policy_text("core"))

    def test_active_references_use_five_role_contract(self) -> None:
        for name in ("core", "handoff", "planning", "verification"):
            text = policy_text(name)
            for old in ("arc_secretary", "arc_scout`", "secretary", "all six roles"):
                self.assertNotIn(old, text)

    def test_qa_ui_browser_acceptance_contract(self) -> None:
        qa = " ".join(tomllib.loads(
            (REPO / "codex/agents/arc-qa.toml").read_text()
        )["developer_instructions"].lower().split())
        policy = policy_text("verification")
        ui_section = policy.split("### ui browser acceptance checks", 1)[1].split("###", 1)[0]
        for contract in (
            r"only when.*assigned ui.*brief.*workspace.*existing launch command or url.*account.*test.data.*permitted interactions",
            r"approved test environment.*launch.*open.*approved browser tools",
            r"tool instructions.*applicable installed browser skill",
            r"does not authorize.*editing.*dependencies.*environment configuration",
            r"missing prerequisites.*ceo.*unverified",
            r"command or url.*test state.*viewport.*not applicable.*interaction steps.*expected.*observed.*accessible evidence",
            r"startup.*page load.*static checks.*do not prove.*ui behavior",
            r"unavailable.*environment.*browser tools.*exact limitation.*unverified",
            r"clean up only.*created.*processes.*sessions.*preserve.*shared",
        ):
            with self.subTest(contract=contract):
                self.assertRegex(ui_section, contract)
        self.assertRegex(ui_section, r"when assigning ui acceptance criteria, ceo cites this section with its accessible path in the qa brief")
        for contract in (
            r"only when assigned ui acceptance criteria and the brief cites the `ui browser acceptance checks` section of the installed arc `references/verification\.md`, read that section and follow it before launching an app or using browser tools",
            r"otherwise do not launch apps or operate browsers for ui acceptance",
            r"report the missing citation/prerequisites to ceo.*affected criteria unverified",
        ):
            with self.subTest(qa_contract=contract):
                self.assertRegex(qa, contract)
        for removed in ("viewport", "interaction steps", "clean up only"):
            self.assertNotIn(removed, qa)
        self.assertRegex(policy, r"visual companion.*design discussion.*distinct from.*qa.*ui acceptance")

    def test_qa_reporting_contract(self) -> None:
        instructions = " ".join(tomllib.loads(
            (REPO / "codex/agents/arc-qa.toml").read_text()
        )["developer_instructions"].lower().split())
        for contract in (
            r"every acceptance criterion.*identifier.*original wording",
            r"method.*scope.*run status.*accessible evidence.*criterion verdict.*unverified reason",
            r"run status.*passed.*failed.*not run.*environment blocked",
            r"criterion verdict.*proven.*unmet.*unverified",
            r"passing.*alone.*does not prove",
            r"partial.*out.of.scope.*missing checks.*environment.*unverified",
            r"after a fix.*defect reproduction path.*invalidated.*resolved.*unresolved.*unverified",
        ):
            with self.subTest(contract=contract):
                self.assertRegex(instructions, contract)

    def test_reviewer_finding_handoff(self) -> None:
        instructions = " ".join(tomllib.loads(
            (REPO / "codex/agents/arc-reviewer.toml").read_text()
        )["developer_instructions"].lower().split())
        for contract in (
            r"behavior.*finding.*criterion.*expected behavior.*observed problem.*source.*reproduction conditions.*steps.*evidence",
            r"source.inferred.*execution.observed",
            r"ceo.*coder.*qa.*recheck",
            r"do not.*run qa tests",
            r"structure.*design.*factual.*security",
        ):
            with self.subTest(contract=contract):
                self.assertRegex(instructions, contract)

    def _workspace_handoff_section(self, title: str) -> str:
        handoff = policy_text("handoff") + " " + policy_text("git-recovery")
        self.assertIn(f"### {title.lower()}", handoff)
        return handoff.split(f"### {title.lower()}", 1)[1].split("### ", 1)[0]

    def _assert_workspace_handoff_contracts(
        self, title: str, contracts: tuple[str, ...]
    ) -> None:
        section = self._workspace_handoff_section(title)
        for contract in contracts:
            with self.subTest(section=title, contract=contract):
                self.assertRegex(section, contract)

    def test_workspace_handoff_requires_scoped_checkout_approval(self) -> None:
        self._assert_workspace_handoff_contracts(
            "Checkout approval",
            (
                r"before every coder first start and restart",
                r"after applicable design/spec/plan approvals.*explicit user choice.*current checkout.*new task branch.*new managed worktree and task branch",
                r"explicit user choice for the first start under the explicit choice rule: use the current checkout",
            ),
        )
        assert_term_defined(self, "explicit choice", "coder")
        self.assertRegex(policy_text("handoff"), r"\(selection target under handoff-prep\.md;")
        gate = policy_text("handoff-prep").split("### execution-target request gate", 1)[1].split("###", 1)[0]
        self.assertRegex(gate, r"present the verified absolute workspace, current branch or detached head, base head, and any validated new-branch candidate")

    def test_workspace_handoff_current_checkout_requires_explicit_choice(self) -> None:
        self._assert_workspace_handoff_contracts(
            "Current checkout",
            (
                r"only after the user explicitly selects the current checkout for this handoff",
                r"confirm.*absolute workspace.*branch.*detached head.*head.*existing changes",
                r"preservation and edit ownership.*choice evidence.*brief",
                r"missing choice.*unconfirmed state.*unclear ownership blocks handoff",
            ),
        )

    def test_workspace_handoff_reapproves_changed_targets(self) -> None:
        self._assert_workspace_handoff_contracts(
            "New task branch",
            (
                r"recheck.*workspace.*branch.*base head.*candidate.*before",
                r"approval target.*changes.*explicit user approval",
                r"candidate.*changes.*approval.*before.*creat.*switch",
                r"without that approval, block handoff.*current checkout only after the user explicitly selects it for this handoff",
                r"lookup error.*missing branch",
            ),
        )

    def test_workspace_handoff_preserves_branch_collision_rules(self) -> None:
        self._assert_workspace_handoff_contracts(
            "New task branch",
            (
                r"valid git branch name.*`<type>/<short-kebab-case-topic>`",
                r"lowercase prefix.*lowercase kebab-case topic with no spaces",
                r"validate the name.*check for collisions before creation",
                r"base name exists.*append `-2`, `-3`.*increasing numeric suffixes.*first unused name",
                r"never reuse, delete, or overwrite an existing branch",
            ),
        )

    def test_managed_branch_selection_order_and_collision_reuse(self) -> None:
        section = self._workspace_handoff_section("New managed worktree")
        self.assertRegex(section, r"before.*create_worktree.*approved branch candidate.*collision")
        self.assertRegex(section, r"registration.*attachment.*base.*before.*approved branch")
        self.assertRegex(section, r"same base.*not checked out in any worktree.*reuse")
        self.assertRegex(section, r"collision.*new explicit choice")

    def test_workspace_handoff_preserves_existing_changes(self) -> None:
        self._assert_workspace_handoff_contracts(
            "Existing changes and failures",
            (
                r"existing staged, unstaged, and untracked changes.*preservation and edit ownership.*brief",
                r"apply the preservation rule and do not automatically commit or delete changes",
                r"only the approved docs commit.*all three paths.*exception.*preserve all unrelated dirty files",
                r"existing changes prevent switching.*stop handoff until ceo resolves the state and scope",
            ),
        )
        assert_term_defined(self, "preservation rule")

    def test_workspace_handoff_failures_do_not_fallback(self) -> None:
        self._assert_workspace_handoff_contracts(
            "Existing changes and failures",
            (
                r"branch creation.*switch.*failure.*actual git state.*stop coder handoff",
                r"created.*without.*successful switch.*partial completion",
                r"do not.*automatically.*(?:fall back|fallback).*current checkout",
                r"both operational failure and missing execution-target choice block handoff",
                r"do not.*automatically delete",
            ),
        )

    def test_workspace_handoff_commits_approved_plan_docs_before_coder(self) -> None:
        handoff = policy_text("handoff") + " " + policy_text("git-recovery")
        self._assert_workspace_handoff_contracts(
            "Planning document commit",
            (
                r"new task branch.*successful switch.*branch.*path",
                r"new worktree.*verify.*worktree.*document transfer.*before.*commit",
                r"current checkout.*verify.*selected branch.*detached head.*path.*existing changes",
                r"ceo verifies each approved spec/plan already committed.*sha.*message.*paths.*content.*approved version.*reuse.*without recommitting",
                r"approved documents still uncommitted.*ceo.*finalizes.*message before the first commit.*stages only those documents.*before handoff",
            ),
        )
        for contract in (
            r"include the docs commit sha.*actual message.*included paths.*approved-content verification",
            r"never include implementation files.*this commit is not implementation acceptance",
            r"do not push.*separate.*user.*request",
            r"docs commit fails or staged content differs.*stop handoff.*branch.*head.*index.*partial completion",
            r"skip this commit only when no planning documents were required and none were produced.*design/plan depth rules.*record.*depth rationale.*uncommitted documents cannot be treated as absent",
            r"do not automatically.*(?:unstage|reset).*unrelated",
            r"only.*approved.*docs commit.*exception",
        ):
            with self.subTest(contract=contract):
                self.assertRegex(handoff, contract)

    def test_workspace_handoff_worktree_scoped_choice_and_base(self) -> None:
        gate = policy_text("handoff-prep").split("### execution-target request gate", 1)[1].split("###", 1)[0]
        self.assertRegex(gate, r"selection target.*source absolute path.*repository.*common directory.*branch or detached head.*full.*sha.*approved branch candidate.*collision.*name.*approved document")
        self.assertRegex(gate, r"verif.*validates the approved branch candidate and collision status.*new task branch naming rules.*unrelated staged changes.*head/index/working-tree state.*before offering")
        self.assertRegex(gate, r"do not ask the user for a destination path.*do not fetch or substitute a remote head or default branch")
        self._assert_workspace_handoff_contracts("New managed worktree", (
            r"selection target is the one verified under the execution-target request gate in handoff-prep\.md",
            r"verified source head.*do not.*remote.*default branch.*fetch",
            r"recheck.*source state.*base sha.*approved branch.*name.*after choice.*immediately before the tool call",
            r"after selection and before creation.*changes.*fresh explicit choice",
        ))
        section = self._workspace_handoff_section("New managed worktree")
        self.assertNotIn("before and after choice", section)
        self.assertNotIn("descriptive name, and approved document transfer/commit scope", section)

    def test_workspace_handoff_managed_worktree_inputs_and_results(self) -> None:
        section = self._workspace_handoff_section("New managed worktree")
        for phrase in ("mcp__codex_app__create_worktree", "allowasync: true", "name", "ref",
                       "full sha", "descriptive", "no destination path or branch", "collision",
                       "git switch -c <approved-branch> <ref>", "git switch <approved-branch>",
                       "same base", "not checked out in any worktree"):
            self.assertIn(phrase, section)
        self.assertNotIn("../<repo>-<topic>-worktree", section)
        self.assertNotIn("git worktree add -b <branch> <absolute-path> <base-sha>", section)
        self.assertRegex(section, r"registration.*attachment.*base.*before.*approved branch")

    def test_workspace_handoff_worktree_creation_and_identity(self) -> None:
        self._assert_workspace_handoff_contracts("New managed worktree", (
            r"mcp__codex_app__create_worktree.*allowasync: true.*name.*ref",
            r"returned.*absolute.*path.*current.chat.*attachment",
            r"initial branch or detached head.*approved branch.*final branch.*head.*ref",
            r"linked-worktree registration.*common directory.*dirty state.*source.*branch.*head.*index.*files",
            r"\.git.*file.*do not.*same top-level.*identity",
            r"unexpected branch.*stop",
        ))

    def test_workspace_handoff_managed_worktree_async_attachment_and_no_fallback(self) -> None:
        self._assert_workspace_handoff_contracts("New managed worktree", (
            r"operationid.*mcp__codex_app__get_worktree_creation_status.*completed",
            r"progress.*not.*success",
            r"registration failure.*only.*returned workspace.*mcp__codex_app__attach_worktree",
            r"before.*managed.*current.chat attachment.*approved branch.*no document transfer.*staging.*commit.*coder",
            r"unavailable.*reattachment.*mismatch.*stop.*record",
            r"do not.*raw git.*other name/ref/path/branch.*cleanup.*delete.*prune.*archive",
        ))

    def test_workspace_handoff_worktree_source_dirty_states(self) -> None:
        self._assert_workspace_handoff_contracts("New managed worktree", (
            r"untracked approved.*source head.*index.*absent.*working-tree bytes.*latest approved",
            r"tracked approved.*index blob and mode.*source head.*working-tree bytes.*latest approved",
            r"approved working-tree revisions may differ.*head/index.*do not.*staging",
            r"unrelated staged.*required uncommitted implementation.*unclear ownership.*block",
            r"do not automatically.*stash.*commit.*reset.*clean.*unstage.*dirty implementation",
        ))

    def test_workspace_handoff_worktree_document_transfer(self) -> None:
        self._assert_workspace_handoff_contracts("Worktree document transfer", (
            r"target head.*selected source base sha",
            r"only uncommitted approved spec/plan.*same repository-relative path",
            r"do not move, delete, or modify.*source",
            r"outside.*worktree.*symlink.*stop",
            r"clean base.*index.*working-tree bytes.*base version.*replace.*approved version",
            r"absent from base.*absent.*destination",
            r"unexpected changes.*do not overwrite.*stop",
            r"after transfer.*bytes.*approved version.*canonical record.*source.*target.*relative path",
        ))

    def test_workspace_handoff_worktree_docs_commit_order(self) -> None:
        self._assert_workspace_handoff_contracts(
            'Planning document commit',
            (
                r'new worktree.*verify.*worktree.*document transfer.*before.*commit',
                r'target.*remaining.*once.*do not.*source.*commit',
                r'base sha.*post-commit head',
            ),
        )

    def test_workspace_handoff_worktree_partial_completion(self) -> None:
        self._assert_workspace_handoff_contracts(
            'Worktree failures and partial completion',
            (
                r'creation.*registration.*attachment.*identity.*checkout.*document transfer.*staging.*commit.*failure.*stop.*handoff',
                r'branch-only.*partial path.*registration.*wrong base.*partial document',
                r'source.*target.*command.*error.*branch.*head.*common directory.*registration.*index.*files',
                r'do not.*fallback.*retry.*delete.*prune.*--force.*-b',
                r'before.*retry.*actual state.*completed work',
            ),
        )

    def test_workspace_handoff_worktree_roles_and_restart(self) -> None:
        self._assert_workspace_handoff_contracts(
            'Handoff evidence',
            (
                r'canonical.*source.*target.*common directory.*base sha',
                r'all five roles \(coder, qa, planner, reviewer, scouter\).*selected execution checkout or absolute worktree path',
                r'do not automatically.*recreate.*cleanup.*archive',
            ),
        )

        self._assert_workspace_handoff_contracts(
            'Choice lifetime and restart record',
            (
                r'reuse the initial explicit choice only when.*still valid.*rechecks actual git state.*old target cannot be trusted.*fresh explicit choice',
                r'normal authorized head and dirty-state changes, including accepted task commits, docs commits, implementation, and approved worktree document transfer, do not by themselves invalidate the choice',
                r'rechecks actual git state against the current brief: absolute workspace and repository identity, branch or detached head, head, staged/unstaged/untracked changes, preservation and edit ownership, applicable approvals and artifacts, planning-document sha/message/paths/content or valid no-document rationale, and ceo.s final state verification',
                r'restart without document changes reuses verified valid planning-document commits without recommitting them and a still-valid initial choice, with fresh actual-state checks',
                r'creation base sha.*evidence.*target head need not remain.*base',
                r'every first start and restart.*recheck.*actual git state.*ownership',
                r'scope, workspace, repository, target, or approved branch candidate.*changes.*fresh explicit choice',
                r'state mismatches and unresolved failures block.*editing',
                r'source preservation and unexpected-state checks still apply',
            ),
        )

    def test_workspace_handoff_worktree_keeps_in_place_prohibition(self) -> None:
        self._assert_workspace_handoff_contracts(
            'New task branch',
            (
                r'do not create a worktree.*failure',
                r'only.*explicit.*new managed worktree and task branch.*permits.*worktree',
            ),
        )

    def test_worktree_planning_and_core_preparation_gates(self) -> None:
        planning = policy_text("planning").split("### complete planning-document set", 1)[1].split("### evidence refresh", 1)[0]
        self.assertRegex(planning, r"while documents.*do not.*worktree creation.*stage documents.*commit planning documents")
        self.assertRegex(planning, r"normal order:.*complete applicable set.*explicit execution-target choice.*approved branch switch or worktree creation.*batch commit")
        core = policy_text("core").split("## common handoff gate", 1)[1].split("## coder tdd", 1)[0]
        self.assertRegex(core, r"selected worktree.*common directory.*registration.*source preservation")
        self.assertRegex(core, r"depth-2 roles use the supplied workspace")

    def test_worktree_contract_matches_selected_execution_paths(self) -> None:
        text = policy_text("handoff-worktree")
        for phrase in ("mcp__codex_app__create_worktree", "allowasync: true", "operationid", "attach_worktree",
                       "the app determines the actual destination path", "approved branch", "source head",
                       "index blob and mode", "working-tree bytes", "latest approved version", "base sha",
                       "staging", "registration", "do not fall back to raw git worktree creation"):
            self.assertIn(phrase, text)
        self.assertNotIn("../<repo>-<topic>-worktree", text)
        self.assertNotIn("git worktree add -b", text)
        self.assertRegex(text, r"only an explicit user choice of this third path authorizes preparation")
        self.assertRegex(text, r"any mismatch means stop.*do not automatically stash, commit, reset, clean, or unstage")
        self.assertRegex(text, r"do not repair or verify them by staging source documents")

    def test_distribution_manifest_matches_scouter_payload(self) -> None:
        installer.verify_manifest(REPO)
        names = {line.split("  ", 1)[1] for line in (REPO / "MANIFEST.sha256").read_text().splitlines()}
        self.assertIn("codex/agents/arc-scouter.toml", names)
        self.assertNotIn("codex/agents/user-notes.toml", names)
        self.assertNotIn("codex/agents/user-research.toml", names)
        self.assertNotIn("codex/skill/models.toml", names)

    def test_acceptance_evidence_flow(self) -> None:
        policy = policy_text("verification")
        for contract in (
            r"qa.*failure.*ceo.*coder.*correction.*qa recheck.*before reviewer",
            r"do not enter reviewer.*qa.*resolved.*unresolved.*unverified",
            r"disposition.*does not.*unverified.*proven",
            r"low.risk.*ceo.*criterion.*evidence.*unverified",
            r"structural checks.*do not prove.*runtime",
        ):
            with self.subTest(contract=contract):
                self.assertRegex(policy, contract)


class GlobalSettingsTests(unittest.TestCase):
    BODY = "- managed rule one\n- managed rule two\n"
    OLD = (
        "# AGENTS.md\n\n## 1. ARC\n\n- CEO must not edit files directly.\n\n"
        "## 2. Git Commit Message Guidelines\n\nkeep me\n"
    )

    def render_agents(self, text):
        return installer.render_agents_md(text, self.BODY, Path("AGENTS.md"))

    def test_agents_md_created_when_missing(self) -> None:
        text, action = self.render_agents(None)
        self.assertIn(installer.GLOBAL_BEGIN, text)
        self.assertIn(installer.GLOBAL_END, text)
        self.assertIn("## Agent Role Coordination", text)
        self.assertIn(self.BODY, text)
        self.assertIn("create", action)

    def block(self) -> str:
        return f"{installer.GLOBAL_BEGIN}\n## Agent Role Coordination\n\n{self.BODY}{installer.GLOBAL_END}\n"

    def test_agents_md_keeps_existing_content_and_appends_block_at_end(self) -> None:
        text, action = self.render_agents(self.OLD)
        self.assertEqual(text, self.OLD + "\n" + self.block())
        self.assertIn("append", action)
        self.assertEqual(self.render_agents(text)[0], text)

    def test_agents_md_moves_managed_block_to_the_end(self) -> None:
        stale = f"intro\n\n{installer.GLOBAL_BEGIN}\n## 1. ARC\n\n- stale\n{installer.GLOBAL_END}\n\noutro\n"
        text, action = self.render_agents(stale)
        self.assertEqual(text, "intro\n\noutro\n\n" + self.block())
        self.assertIn("managed", action)
        self.assertEqual(self.render_agents(text)[0], text)

    def test_agents_md_appends_when_no_section_exists(self) -> None:
        text, action = self.render_agents("# AGENTS.md\n\n## Other\n\nkeep\n")
        self.assertEqual(text, "# AGENTS.md\n\n## Other\n\nkeep\n\n" + self.block())
        self.assertIn("append", action)
        text, _ = self.render_agents("no trailing newline")
        self.assertEqual(text, "no trailing newline\n\n" + self.block())

    def test_agents_md_rejects_malformed_markers(self) -> None:
        for bad in (f"{installer.GLOBAL_BEGIN}\nno end\n",
                    f"{installer.GLOBAL_END}\n{installer.GLOBAL_BEGIN}\n",
                    f"{installer.GLOBAL_BEGIN}\n{installer.GLOBAL_END}\n{installer.GLOBAL_BEGIN}\n{installer.GLOBAL_END}\n"):
            with self.subTest(bad=bad):
                with self.assertRaises(installer.InstallerError):
                    self.render_agents(bad)

    def test_agents_md_keeps_numbers_fences_crlf_and_duplicate_sections_verbatim(self) -> None:
        source = ("# AGENTS.md\r\n\r\n## 1. ARC\r\n\r\na\r\n\r\n## ARC\r\n\r\nb\r\n\r\n"
                  "## 2. Git Commit Message Guidelines\r\n\r\n```text\r\n## 3. fenced\r\n```\r\n")
        text, action = self.render_agents(source)
        self.assertTrue(text.startswith(source))
        self.assertTrue(text.endswith(self.block()))

    def test_unmanaged_arc_section_is_kept_and_reported(self) -> None:
        with tempfile.TemporaryDirectory(dir=TMP_ROOT) as directory:
            home = Path(directory)
            (home / "AGENTS.md").write_text(self.OLD)
            updates, notes = installer.plan_global_updates(home, home)
            self.assertTrue(updates[0][1].decode().startswith(self.OLD))
            self.assertTrue(any("ARC" in note and "AGENTS.md" in note for note in notes))

    def test_non_utf8_global_file_is_reported_not_crashed(self) -> None:
        with tempfile.TemporaryDirectory(dir=TMP_ROOT) as directory:
            home = Path(directory)
            (home / "AGENTS.md").write_bytes(b"\xff\xfe broken")
            with self.assertRaises(installer.InstallerError):
                installer.plan_global_updates(home, home)

    def test_agents_body_carries_arc_rules(self) -> None:
        body = installer.agents_block_body(Path("/home/u/.codex"), Path("/home/u"))
        self.assertIn("`~/.codex/skills/arc/SKILL.md`", body)
        self.assertIn("Resolve `~` to the current user's home directory.", body)
        self.assertIn("ARC subagents (depth 2) follow their role profile and brief instead and do not load `SKILL.md`.", body)
        self.assertIn("except under the ARC CEO direct path for small, low-risk tasks", body)
        self.assertIn("(not standalone document writing)", body)
        other = installer.agents_block_body(Path("/opt/codex"), Path("/home/u"))
        self.assertIn("`/opt/codex/skills/arc/SKILL.md`", other)
        self.assertNotIn("Resolve `~`", other)

    def render_config(self, text):
        return installer.render_config_toml(text, Path("config.toml"))

    def wait(self, text):
        return tomllib.loads(text)["features"]["multi_agent_v2"]

    def test_config_created_or_appended_when_missing(self) -> None:
        for source in (None, "", 'model = "x"\n', 'model = "x"'):
            with self.subTest(source=source):
                text, action = self.render_config(source)
                self.assertEqual(self.wait(text), {"min_wait_timeout_ms": 120000, "default_wait_timeout_ms": 300000})
                if source:
                    self.assertEqual(tomllib.loads(text)["model"], "x")

    def test_config_overwrites_values_and_keeps_other_keys(self) -> None:
        source = ("[features]\nhooks = true\n\n[features.multi_agent_v2]\nmin_wait_timeout_ms = 1000\n"
                  "max_concurrent_threads_per_session = 3\n\n[mcp_servers.x]\ncommand = \"y\"\n")
        text, action = self.render_config(source)
        self.assertEqual(self.wait(text), {"min_wait_timeout_ms": 120000, "max_concurrent_threads_per_session": 3,
                                           "default_wait_timeout_ms": 300000})
        data = tomllib.loads(text)
        self.assertEqual(data["features"]["hooks"], True)
        self.assertEqual(data["mcp_servers"]["x"]["command"], "y")
        again, action = self.render_config(text)
        self.assertEqual(again, text)
        self.assertIn("unchanged", action)

    def test_config_skips_non_table_feature_forms(self) -> None:
        for source in ("[features]\nmulti_agent_v2 = true\n",
                       "[features]\nmulti_agent_v2 = { min_wait_timeout_ms = 1 }\n",
                       "features = { multi_agent_v2 = true }\n"):
            with self.subTest(source=source):
                text, action = self.render_config(source)
                self.assertIsNone(text)
                self.assertIn("skip", action)

    def test_config_rejects_invalid_toml(self) -> None:
        with self.assertRaises(installer.InstallerError):
            self.render_config("[features\n")


class ExternalSkillPreflightTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(dir=TMP_ROOT)
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
            status = installer.main(["--target", "codex", *argv])
        return status, stdout.getvalue() + stderr.getvalue()

    def create_payload(self) -> Path:
        self.payload = installer_payload(self.base)
        return self.payload

    def seed_existing_targets(self) -> None:
        arc = self.codex_home / "skills" / installer.INSTALL_NAME
        arc.mkdir(parents=True)
        (arc / "SKILL.md").write_bytes(b"previous arc")
        agents = self.codex_home / "agents"
        agents.mkdir(parents=True)
        for filename in installer.PROFILE_FILES:
            (agents / filename).write_bytes(b"previous profile")

    GLOBAL_OLD_AGENTS = (
        "# AGENTS.md\n\n## 1. ARC\n\n- CEO must not edit files directly.\n\n"
        "## 2. Git Commit Message Guidelines\n\nkeep me\n"
    )
    GLOBAL_OLD_CONFIG = 'model = "m"\n\n[features.multi_agent_v2]\nmin_wait_timeout_ms = 1000\n'

    def seed_global(self) -> tuple[Path, Path]:
        self.codex_home.mkdir(parents=True, exist_ok=True)
        agents, config = self.codex_home / "AGENTS.md", self.codex_home / "config.toml"
        agents.write_text(self.GLOBAL_OLD_AGENTS)
        config.write_text(self.GLOBAL_OLD_CONFIG)
        config.chmod(0o600)
        return agents, config

    def test_install_updates_global_files_with_backup(self) -> None:
        self.create_payload()
        agents, config = self.seed_global()
        acquire, _ = self.acquisition_stub()
        with patch.object(installer, "acquire_external_skills", side_effect=acquire):
            status, output = self.run_main([])
        self.assertEqual(status, 0, output)
        text = agents.read_text()
        self.assertTrue(text.startswith(self.GLOBAL_OLD_AGENTS + "\n" + installer.GLOBAL_BEGIN))
        self.assertTrue(text.endswith(installer.GLOBAL_END + "\n"))
        self.assertIn("do not load `SKILL.md`", text)
        self.assertIn("ARC", output)
        data = tomllib.loads(config.read_text())
        self.assertEqual(data["model"], "m")
        self.assertEqual(data["features"]["multi_agent_v2"], {"min_wait_timeout_ms": 120000, "default_wait_timeout_ms": 300000})
        self.assertEqual(stat.S_IMODE(config.stat().st_mode), 0o600)
        backup = next((self.codex_home / "backups").iterdir())
        self.assertEqual((backup / "global" / "AGENTS.md").read_text(), self.GLOBAL_OLD_AGENTS)
        self.assertEqual((backup / "global" / "config.toml").read_text(), self.GLOBAL_OLD_CONFIG)
        self.assert_no_stages()
        with patch.object(installer, "acquire_external_skills", side_effect=acquire):
            status, output = self.run_main([])
        self.assertEqual(status, 0, output)
        self.assertEqual(agents.read_text(), text)

    def test_install_creates_missing_global_files(self) -> None:
        self.create_payload()
        acquire, _ = self.acquisition_stub()
        with patch.object(installer, "acquire_external_skills", side_effect=acquire):
            status, output = self.run_main([])
        self.assertEqual(status, 0, output)
        self.assertIn(installer.GLOBAL_BEGIN, (self.codex_home / "AGENTS.md").read_text())
        self.assertIn("multi_agent_v2", tomllib.loads((self.codex_home / "config.toml").read_text())["features"])

    def test_skip_global_leaves_global_files_untouched(self) -> None:
        self.create_payload()
        agents, config = self.seed_global()
        acquire, _ = self.acquisition_stub()
        with patch.object(installer, "acquire_external_skills", side_effect=acquire):
            status, output = self.run_main(["--skip-global"])
        self.assertEqual(status, 0, output)
        self.assertEqual(agents.read_text(), self.GLOBAL_OLD_AGENTS)
        self.assertEqual(config.read_text(), self.GLOBAL_OLD_CONFIG)

    def test_global_replace_failure_restores_all_targets(self) -> None:
        self.create_payload()
        self.seed_existing_targets()
        agents, config = self.seed_global()
        before = (self.installed_target_state(), agents.read_bytes(), config.read_bytes())
        acquire, _ = self.acquisition_stub()
        real_replace = os.replace
        injected = []
        def fail(source, target):
            if Path(target) == config and Path(source).name == "config.toml" and ".arc-global-" in str(source):
                injected.append(True)
                raise OSError("injected global replace failure")
            return real_replace(source, target)
        with patch.object(installer, "acquire_external_skills", side_effect=acquire), patch.object(installer.os, "replace", fail):
            status, output = self.run_main([])
        self.assertEqual(status, 2, output)
        self.assertTrue(injected)
        self.assertEqual((self.installed_target_state(), agents.read_bytes(), config.read_bytes()), before)
        self.assert_no_stages()

    def test_dry_run_and_check_report_global_changes_without_writing(self) -> None:
        self.create_payload()
        self.install_candidates(self.user_home / ".agents" / "skills")
        self.seed_existing_targets()
        self.seed_global()
        before = tree_state(self.codex_home), tree_state(self.user_home)
        status, output = self.run_main(["--dry-run"])
        self.assertEqual(status, 0, output)
        self.assertIn("Would update global file", output)
        self.assertIn("AGENTS.md", output)
        self.assertIn("config.toml", output)
        status, output = self.run_main(["--check"])
        self.assertEqual(status, 0, output)
        self.assertEqual((tree_state(self.codex_home), tree_state(self.user_home)), before)

    def test_invalid_global_config_blocks_install_before_changes(self) -> None:
        self.create_payload()
        self.seed_existing_targets()
        agents, config = self.seed_global()
        config.write_text("[features\n")
        before = (self.installed_target_state(), agents.read_bytes(), config.read_bytes())
        acquire, calls = self.acquisition_stub()
        with patch.object(installer, "acquire_external_skills", side_effect=acquire):
            status, output = self.run_main([])
        self.assertEqual(status, 2, output)
        self.assertEqual(calls, [])
        self.assertEqual((self.installed_target_state(), agents.read_bytes(), config.read_bytes()), before)

    def assert_no_stages(self) -> None:
        self.assertEqual(list(self.codex_home.glob("**/.arc-*-*")), [])

    def acquisition_stub(self, variants: tuple[bytes, ...] = (b"latest",)):
        calls: list[Path] = []

        def acquire(work: Path) -> dict[str, Path]:
            work = Path(work)
            calls.append(work)
            variant = variants[min(len(calls) - 1, len(variants) - 1)]
            return write_candidates(work / ".agents" / "skills", variant=variant)

        return acquire, calls

    def retired_paths(self) -> list[Path]:
        return [self.codex_home / "agents" / name
                for name in ("user-notes.toml", "user-research.toml")]

    def seed_retired(self, count=2) -> list[Path]:
        paths = self.retired_paths()[:count]
        for index, path in enumerate(paths):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(f"custom retired {index}".encode())
            path.chmod(0o640)
        return paths

    def installed_target_state(self):
        return (tree_state(self.codex_home / "agents"), tree_state(self.codex_home / "skills"),
                tree_state(self.user_home / ".agents"))

    def test_user_profiles_preserved_on_new_partial_full_and_repeat_install(self) -> None:
        self.create_payload()
        acquire, _ = self.acquisition_stub()
        for count in (0, 1, 2):
            with self.subTest(count=count):
                paths = self.seed_retired(count)
                originals = {path.name: (path.read_bytes(), stat.S_IMODE(path.stat().st_mode))
                             for path in paths}
                backups_before = set(self.codex_home.glob("backups/*"))
                with patch.object(installer, "acquire_external_skills", side_effect=acquire):
                    status, output = self.run_main([])
                self.assertEqual(status, 0, output)
                new_backups = set(self.codex_home.glob("backups/*")) - backups_before
                self.assertEqual(len(new_backups), 1)
                backup = new_backups.pop()
                for filename, (content, mode) in originals.items():
                    saved = self.codex_home / "agents" / filename
                    self.assertTrue(saved.is_file(), str(saved))
                    self.assertEqual(saved.read_bytes(), content)
                    self.assertEqual(stat.S_IMODE(saved.stat().st_mode), mode)
                self.assertTrue(all(path.exists() for path in self.retired_paths()))
                for filename in installer.PROFILE_FILES:
                    profile = tomllib.loads((self.codex_home / "agents" / filename).read_text())
                    role = filename.removesuffix(".toml").replace("-", "_")
                    self.assertEqual(profile["name"], role)
                    self.assertEqual({key: profile[key] for key in FIVE_SETTINGS[role]}, FIVE_SETTINGS[role])
        with patch.object(installer, "acquire_external_skills", side_effect=acquire):
            status, output = self.run_main([])
        self.assertEqual(status, 0, output)

    def test_active_profiles_backup_bytes_and_mode_preserves_user_profiles(self) -> None:
        self.create_payload()
        self.seed_existing_targets()
        paths = self.seed_retired(2)
        originals = {p.name: (p.read_bytes(), stat.S_IMODE(p.stat().st_mode))
                     for p in (self.codex_home / "agents" / f for f in installer.PROFILE_FILES)}
        acquire, _ = self.acquisition_stub()
        with patch.object(installer, "acquire_external_skills", side_effect=acquire):
            status, output = self.run_main([])
        self.assertEqual(status, 0, output)
        backup = next((self.codex_home / "backups").iterdir())
        for name, (content, mode) in originals.items():
            target = backup / "agents" / name
            self.assertTrue(target.is_file(), str(target))
            self.assertEqual(target.read_bytes(), content)
            self.assertEqual(stat.S_IMODE(target.stat().st_mode), mode)
        settings = tomllib.loads((self.codex_home / "skills" / installer.INSTALL_NAME / "models.toml").read_text())
        self.assertEqual(settings["version"], 5)

    def test_user_profiles_preserved_during_active_profile_replace(self) -> None:
        self.create_payload()
        paths = self.seed_retired()
        acquire, _ = self.acquisition_stub()
        real_replace = os.replace
        observed = []
        def observe(source, target):
            if Path(target).name in installer.PROFILE_FILES:
                observed.append(True)
                self.assertTrue(all(p.exists() for p in paths))
            return real_replace(source, target)
        with patch.object(installer, "acquire_external_skills", side_effect=acquire), patch.object(installer.os, "replace", observe):
            status, output = self.run_main([])
        self.assertEqual(status, 0, output)
        self.assertTrue(observed)

    def test_user_profiles_not_moved_during_install(self) -> None:
        self.create_payload()
        self.seed_existing_targets()
        paths = self.seed_retired()
        before = {p: tree_state(p) for p in paths}
        acquire, _ = self.acquisition_stub()
        real_replace = os.replace
        injected = []
        def fail(source, target):
            if Path(source) == paths[1]:
                injected.append(True)
                raise OSError("injected retired move failure")
            return real_replace(source, target)
        with patch.object(installer, "acquire_external_skills", side_effect=acquire), patch.object(installer.os, "replace", fail):
            status, output = self.run_main([])
        self.assertEqual(status, 0, output)
        self.assertFalse(injected)
        self.assertEqual({p: tree_state(p) for p in paths}, before)
        self.assert_no_stages()

    def test_profile_failure_restores_targets_and_preserves_user_profiles(self) -> None:
        self.create_payload()
        self.seed_existing_targets()
        missing = self.codex_home / "agents" / installer.PROFILE_FILES[-1]
        missing.unlink()
        paths = self.seed_retired()
        write_candidates(self.codex_home / "skills", b"old")
        write_candidates(self.user_home / ".agents" / "skills", b"old user")
        before = self.installed_target_state()
        acquire, _ = self.acquisition_stub()
        real_replace = os.replace
        failed = False
        def fail(source, target):
            nonlocal failed
            if not failed and Path(target).name == installer.PROFILE_FILES[1]:
                failed = True
                self.assertTrue(all(p.exists() for p in paths))
                raise OSError("injected new profile failure")
            return real_replace(source, target)
        with patch.object(installer, "acquire_external_skills", side_effect=acquire), patch.object(installer.os, "replace", fail):
            status, output = self.run_main([])
        self.assertEqual(status, 2, output)
        self.assertTrue(failed)
        self.assertEqual(self.installed_target_state(), before)
        self.assertFalse(missing.exists())
        backup = next((self.codex_home / "backups").iterdir())
        for path in paths:
            self.assertFalse((backup / "agents" / path.name).exists())
            self.assertEqual(path.read_bytes(), f"custom retired {paths.index(path)}".encode())
        self.assert_no_stages()

    def test_active_profile_rollback_failure_preserves_recovery_and_user_profiles(self) -> None:
        self.create_payload()
        paths = self.seed_retired(2)
        self.seed_existing_targets()
        active = self.codex_home / "agents" / installer.PROFILE_FILES[0]
        original = active.read_bytes()
        acquire, _ = self.acquisition_stub()
        real_replace = os.replace
        failed = False
        recovery = None
        def fail(source, target):
            nonlocal failed, recovery
            source, target = Path(source), Path(target)
            if not failed and target.name == installer.PROFILE_FILES[1]:
                failed = True
                raise OSError("injected profile failure")
            if failed and target == active:
                recovery = source
                raise OSError("injected retired restore failure")
            return real_replace(source, target)
        with patch.object(installer, "acquire_external_skills", side_effect=acquire), patch.object(installer.os, "replace", fail):
            status, output = self.run_main([])
        self.assertEqual(status, 2, output)
        self.assertIsNotNone(recovery)
        self.assertTrue(recovery.is_absolute())
        self.assertEqual(recovery.read_bytes(), original)
        self.assertIn(str(recovery), output)
        self.assertIn("rollback failed", output)
        backup = next((self.codex_home / "backups").iterdir())
        self.assertEqual((backup / "agents" / active.name).read_bytes(), original)
        self.assertTrue(paths[1].exists())

    def test_preparation_failure_preserves_user_profiles_and_targets(self) -> None:
        from contextlib import ExitStack
        self.create_payload()
        self.seed_existing_targets()
        paths = self.seed_retired()
        paths[1].chmod(0o600)
        write_candidates(self.codex_home / "skills", b"old external")
        write_candidates(self.user_home / ".agents" / "skills", b"old user")
        unrelated = self.codex_home / "agents/custom.toml"
        unrelated.write_bytes(b"unmanaged")
        before = self.installed_target_state()
        acquire, _ = self.acquisition_stub()
        for point in ("backup_start", "arc_stage", "profile_stage"):
            with self.subTest(point=point), ExitStack() as stack:
                reached = []
                replacements = []
                def fail(*args, **kwargs):
                    reached.append(True)
                    raise OSError("injected preparation failure")
                real_replace = os.replace
                def observe_replace(source, target):
                    replacements.append((source, target))
                    return real_replace(source, target)
                stack.enter_context(patch.object(installer.os, "replace", observe_replace))
                stack.enter_context(patch.object(installer, "acquire_external_skills", side_effect=acquire))
                if point == "backup_start":
                    stack.enter_context(patch.object(installer, "backup_existing", side_effect=fail))
                elif point == "arc_stage":
                    stack.enter_context(patch.object(installer, "_copy_arc_to_stage", side_effect=fail))
                else:
                    real_stat = shutil.copystat
                    def copystat(source, target, *args, **kwargs):
                        if Path(source) == self.payload / "codex/agents" / installer.PROFILE_FILES[1] and ".arc-profiles-" in str(target):
                            return fail()
                        return real_stat(source, target, *args, **kwargs)
                    stack.enter_context(patch.object(installer.shutil, "copystat", copystat))
                status, output = self.run_main([])
                self.assertEqual(status, 2, output)
                self.assertTrue(reached, point)
                self.assertIn("injected preparation failure", output)
                self.assertEqual(replacements, [])
                self.assertEqual(self.installed_target_state(), before)
                self.assertEqual(unrelated.read_bytes(), b"unmanaged")
                self.assert_no_stages()

    def test_unmanaged_user_profile_leaves_preserved_and_unsafe_parent_rejected(self) -> None:
        self.create_payload()
        (self.codex_home / "agents").mkdir(parents=True)
        for path in self.retired_paths():
            for kind in ("symlink", "directory", "fifo"):
                with self.subTest(kind=kind):
                    if kind == "symlink":
                        path.symlink_to(self.base / "missing")
                    elif kind == "directory":
                        path.mkdir()
                    else:
                        os.mkfifo(path)
                    before = tree_state(path)
                    acquire, calls = self.acquisition_stub()
                    try:
                        with patch.object(installer, "acquire_external_skills", side_effect=acquire):
                            status, output = self.run_main([])
                        after = tree_state(path)
                    finally:
                        installer.remove_path(path)
                        # An incorrect install must not contaminate the next unsafe fixture.
                        for child in list(self.codex_home.iterdir()):
                            if child != path.parent:
                                installer.remove_path(child)
                        for child in list(path.parent.iterdir()):
                            installer.remove_path(child)
                    self.assertEqual(status, 0, output)
                    self.assertEqual(len(calls), 1)
                    self.assertEqual(after, before)
        path.parent.rmdir()
        outside = self.base / "outside-agents"
        outside.mkdir()
        path.parent.symlink_to(outside, target_is_directory=True)
        before = tree_state(self.codex_home)
        with patch.object(installer, "acquire_external_skills") as acquire:
            status, output = self.run_main([])
        self.assertEqual(status, 2, output)
        acquire.assert_not_called()
        self.assertEqual(tree_state(self.codex_home), before)

    def test_user_profiles_and_other_unrelated_profiles_preserved(self) -> None:
        self.create_payload()
        self.seed_retired()
        prefix = "-".join(("yunho", "team"))
        agents = self.codex_home / "agents"
        unrelated = [agents / "custom.toml", agents / f"{prefix}-lead.toml",
                     agents / f"{prefix}-coder-extra.toml", agents / "arc-lead.toml"]
        for path in unrelated:
            path.write_bytes(b"unrelated")
            path.chmod(0o600)
        before = {p: tree_state(p) for p in unrelated}
        acquire, _ = self.acquisition_stub()
        with patch.object(installer, "acquire_external_skills", side_effect=acquire):
            status, output = self.run_main([])
        self.assertEqual(status, 0, output)
        self.assertEqual({p: tree_state(p) for p in unrelated}, before)
        self.assertTrue(all(p.exists() for p in self.retired_paths()))

    def test_user_profiles_check_and_dry_run_are_read_only(self) -> None:
        self.create_payload()
        self.install_candidates(self.codex_home / "skills")
        paths = self.seed_retired(2)
        before = tree_state(self.base)
        with patch.object(installer, "acquire_external_skills") as acquire, patch.object(installer.subprocess, "run") as process:
            for flags in (["--check"], ["--dry-run"]):
                status, output = self.run_main(flags)
                self.assertEqual(status, 0, output)
                self.assertEqual(tree_state(self.base), before)
                if flags == ["--dry-run"]:
                    self.assertIn("five", output)
                    for path in paths:
                        self.assertNotIn(str(path), output)
            acquire.assert_not_called()
            process.assert_not_called()

    def test_user_profile_changes_during_acquisition_preserved(self) -> None:
        self.create_payload()
        acquire, _ = self.acquisition_stub()
        for change in ("add", "delete", "bytes", "identity", "mode"):
            with self.subTest(change=change):
                paths = self.seed_retired(1)
                other = self.retired_paths()[1]
                if other.exists():
                    other.unlink()
                expected = []
                def changed(work):
                    result = acquire(work)
                    if change == "add":
                        other.write_bytes(b"added")
                    elif change == "delete":
                        paths[0].unlink()
                    elif change == "bytes":
                        paths[0].write_bytes(b"changed")
                    elif change == "mode":
                        paths[0].chmod(0o600)
                    else:
                        replacement = self.base / "replacement"
                        replacement.write_bytes(paths[0].read_bytes())
                        replacement.chmod(0o640)
                        os.replace(replacement, paths[0])
                    expected.append({p: tree_state(p) for p in self.retired_paths()})
                    return result
                with patch.object(installer, "acquire_external_skills", side_effect=changed):
                    status, output = self.run_main([])
                self.assertEqual(status, 0, output)
                self.assertNotIn("changed during acquisition", output)
                self.assertEqual({p: tree_state(p) for p in self.retired_paths()}, expected[0])
                self.assertTrue((self.codex_home / "backups").exists())

    def test_unmanaged_old_profiles_are_not_inspected_or_changed(self) -> None:
        from contextlib import ExitStack
        self.create_payload()
        write_candidates(self.codex_home / "skills")
        agents = self.codex_home / "agents"
        agents.mkdir()
        paths = [agents / f"yunho-team-{role}.toml"
                 for role in ("secretary", "planner", "scout", "coder", "qa", "reviewer")]
        for index, path in enumerate(paths):
            if index in (0, 4, 5):
                path.write_bytes(b"unmanaged")
            elif index == 1:
                path.symlink_to(self.base / "missing")
            elif index == 2:
                path.mkdir()
            else:
                os.mkfifo(path)
        unrelated = agents / "custom.toml"
        unrelated.write_bytes(b"custom")
        before = {p: tree_state(p) for p in [*paths, unrelated]}
        acquire, _ = self.acquisition_stub()
        def guarded(method, original):
            def call(path, *args, **kwargs):
                self.assertNotIn(Path(path), paths, f"unmanaged access: {method} {path}")
                if method in ("iterdir", "glob", "rglob"):
                    self.assertNotEqual(Path(path), agents, f"target enumeration: {method}")
                return original(path, *args, **kwargs)
            return call
        with ExitStack() as stack:
            for method in ("lstat", "stat", "open", "iterdir", "glob", "rglob"):
                stack.enter_context(patch.object(Path, method, guarded(method, getattr(Path, method))))
            for module, method in ((installer.os, "replace"), (installer.shutil, "copy2")):
                original = getattr(module, method)
                def guard_move(source, target, *args, _original=original, **kwargs):
                    self.assertNotIn(Path(source), paths)
                    self.assertNotIn(Path(target), paths)
                    return _original(source, target, *args, **kwargs)
                stack.enter_context(patch.object(module, method, guard_move))
            stack.enter_context(patch.object(installer, "acquire_external_skills", side_effect=acquire))
            for flags in (["--check"], ["--dry-run"], []):
                status, output = self.run_main(flags)
                self.assertEqual(status, 0, output)
                for path in paths:
                    self.assertNotIn(str(path), output)
        self.assertEqual({p: tree_state(p) for p in [*paths, unrelated]}, before)
        self.assertFalse(any("yunho-team-" in p.name for p in (self.codex_home / "backups").rglob("*")))

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

    def seed_alias_with_unrelated_fifo(self, alias_kind: str, fifo: bool = True) -> tuple[Path, ...]:
        self.create_payload()
        selected = self.install_candidates(self.codex_home / "skills")
        if fifo:
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

    def assert_readonly_main_rejects_alias(self, argv: list[str], alias_kind: str) -> None:
        # Read-only modes skip content validation but keep external write-target path safety.
        state_roots = self.seed_alias_with_unrelated_fifo(alias_kind, fifo=False)
        before = tuple(tree_state(path) for path in state_roots)
        with patch.object(installer, "acquire_external_skills") as acquire:
            status, output = self.run_main(argv)
        self.assertEqual(status, 2, output)
        self.assertIn("symlink", output)
        acquire.assert_not_called()
        self.assertEqual(tuple(tree_state(path) for path in state_roots), before)
        self.assert_no_stages()

    def test_check_rejects_alias_through_candidate_root_alias_with_fifo(self) -> None:
        self.assert_readonly_main_rejects_alias(["--check"], "candidate-root")

    def test_check_rejects_alias_through_legacy_parent_alias_with_fifo(self) -> None:
        self.assert_readonly_main_rejects_alias(["--check"], "legacy-parent")

    def test_dry_run_rejects_alias_through_candidate_root_alias_with_fifo(self) -> None:
        self.assert_readonly_main_rejects_alias(["--dry-run"], "candidate-root")

    def test_dry_run_rejects_alias_through_legacy_parent_alias_with_fifo(self) -> None:
        self.assert_readonly_main_rejects_alias(["--dry-run"], "legacy-parent")

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
            "brainstorming writing-plans test-driven-development "
            "--agent universal --yes --copy --json",
            output,
        )
        self.assertEqual((tree_state(self.codex_home), tree_state(self.user_home)), before)
        self.assert_no_stages()

    def test_check_and_dry_run_accept_missing_external_skills_without_writes(self) -> None:
        self.create_payload()
        before = tree_state(self.codex_home), tree_state(self.user_home)

        for argv in (["--check"], ["--dry-run"]):
            with self.subTest(argv=argv):
                status, output = self.run_main(list(argv))
                self.assertEqual(status, 0, output)
                self.assertEqual((tree_state(self.codex_home), tree_state(self.user_home)), before)

    def test_manifest_rejects_missing_reference_entry(self) -> None:
        self.create_payload()
        for name in REFERENCE_NAMES:
            with self.subTest(reference=name):
                path = self.payload / f"codex/skill/references/{name}.md"
                self.assertTrue(path.is_file(), str(path))
                refresh_manifest(self.payload)
                manifest = self.payload / "MANIFEST.sha256"
                manifest.write_text("".join(line for line in manifest.read_text().splitlines(True)
                                            if not line.endswith(f"  codex/skill/references/{name}.md\n")))
                with self.assertRaisesRegex(installer.InstallerError, "does not cover.*references"):
                    installer.verify_manifest(self.payload)

    def test_manifest_rejects_reference_hash_mismatch(self) -> None:
        self.create_payload()
        for name in REFERENCE_NAMES:
            with self.subTest(reference=name):
                path = self.payload / f"codex/skill/references/{name}.md"
                self.assertTrue(path.is_file(), str(path))
                refresh_manifest(self.payload)
                original = path.read_bytes()
                path.write_bytes(original + b"\nchanged contract\n")
                with self.assertRaisesRegex(installer.InstallerError, "SHA-256 mismatch.*references"):
                    installer.verify_manifest(self.payload)
                path.write_bytes(original)

    def test_codex_repository_layout_preserves_installed_destinations(self) -> None:
        # A source move must not leak the repository namespace into CODEX_HOME.
        for relative in ("agents/arc-coder.toml", "skill/SKILL.md",
                         "skill/scripts/apply-models.py", "skill/references/handoff.md",
                         "skill/models.toml", "config.toml", "tools/codex_token_usage.py"):
            self.assertTrue((REPO / "codex" / relative).is_file(), relative)
        for old in ("agents", "skill", "config.toml", "tools/codex_token_usage.py"):
            self.assertFalse((REPO / old).exists(), old)
        self.create_payload()
        self.install_candidates(self.user_home / ".agents" / "skills")
        acquire, _calls = self.acquisition_stub((b"current upstream",))
        with patch.object(installer, "acquire_external_skills", side_effect=acquire):
            status, output = self.run_main([])
        self.assertEqual(status, 0, output)
        self.assertTrue((self.codex_home / "skills/arc/SKILL.md").is_file())
        self.assertTrue((self.codex_home / "agents/arc-coder.toml").is_file())
        self.assertFalse((self.codex_home / "codex").exists())

    def test_install_writes_arc_profiles_and_three_external_skills(self) -> None:
        self.create_payload()
        candidates = self.install_candidates(self.user_home / ".agents" / "skills")
        acquire, _calls = self.acquisition_stub((b"current upstream",))
        model = installer.load_model_module(self.payload)
        expected_profiles = installer.preflight_profiles(self.payload, model)

        with patch.object(installer, "acquire_external_skills", side_effect=acquire):
            status, output = self.run_main([])

        self.assertEqual(status, 0, output)
        self.assertIn("Installed three external skills", output)
        self.assertEqual(
            {path.name for path in (self.codex_home / "skills").iterdir()},
            {installer.INSTALL_NAME, *FILES},
        )
        self.assertEqual(
            {path.name for path in (self.codex_home / "agents").iterdir()},
            set(installer.PROFILE_FILES),
        )
        arc = self.codex_home / "skills" / installer.INSTALL_NAME
        self.assertEqual(tree_state(arc), tree_state(self.payload / "codex/skill"))
        for name in REFERENCE_NAMES:
            relative = f"references/{name}.md"
            self.assertTrue((arc / relative).is_file(), relative)
            self.assertEqual((arc / relative).read_bytes(), (self.payload / "codex/skill" / relative).read_bytes())
        for filename, expected in expected_profiles.items():
            target = self.codex_home / "agents" / filename
            source = self.payload / "codex/agents" / filename
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

    def test_install_preserves_existing_using_git_worktrees(self) -> None:
        self.create_payload()
        roots = (
            self.codex_home / "skills" / "using-git-worktrees",
            self.user_home / ".agents" / "skills" / "using-git-worktrees",
        )
        for root in roots:
            root.mkdir(parents=True)
            (root / "SKILL.md").write_bytes(b"existing obsolete skill")
            (root / "sentinel.txt").write_bytes(b"preserve me")
        before = [tree_state(root) for root in roots]
        self.assertNotIn("using-git-worktrees", self.write_targets())
        acquire, _calls = self.acquisition_stub()

        with patch.object(installer, "acquire_external_skills", side_effect=acquire):
            status, output = self.run_main([])

        self.assertEqual(status, 0, output)
        self.assertEqual([tree_state(root) for root in roots], before)

    def test_install_syncs_all_three_on_every_run(self) -> None:
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
        paths = self.seed_retired()
        paths[0].write_bytes(b"old secretary")
        paths[0].chmod(0o640)
        paths[1].write_bytes(b"old scout")
        paths[1].chmod(0o600)
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
        arc_before = tree_state(self.codex_home / "skills" / installer.INSTALL_NAME)
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
            arc_before,
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
        arc_before = tree_state(self.codex_home / "skills" / installer.INSTALL_NAME)
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
            arc_before,
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
        arc = self.codex_home / "skills" / installer.INSTALL_NAME
        self.seed_existing_targets()
        agents = self.codex_home / "agents"
        arc_before = tree_state(arc)
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
                and source.parent.name.startswith(".arc-profiles-")
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
        self.assertEqual(tree_state(arc), arc_before)
        for filename, before in profiles_before.items():
            self.assertEqual(tree_state(agents / filename), before)
        backups = list(self.codex_home.glob("backups/*"))
        self.assertEqual(len(backups), 1)
        backup = backups[0]
        self.assertEqual(tree_state(backup / "skills" / installer.INSTALL_NAME), arc_before)
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
        self.temporary = tempfile.TemporaryDirectory(dir=TMP_ROOT)
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
        self.temporary = tempfile.TemporaryDirectory(dir=TMP_ROOT)
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
                "agents": ["Universal"],
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

    def test_acquisition_uses_exact_three_skill_command(self) -> None:
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
                "--agent", "universal", "--yes", "--copy", "--json",
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
                "agents": ["Universal"],
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

    def test_acquisition_rejects_platform_specific_agent_records(self) -> None:
        work = self.base / "platform-record"
        rows = json.loads(self.records(work))
        for row in rows:
            row["agents"] = ["Codex"]
        with self.assertRaises(installer.InstallerError):
            installer._validate_acquisition_records(json.dumps(rows), work)

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

    def test_acquisition_rejects_unrequested_using_git_worktrees_result(self) -> None:
        work = self.base / "work"
        work.mkdir()
        records = self.records(work, names=(*FILES, "using-git-worktrees"))

        with self.assertRaisesRegex(installer.InstallerError, "unexpected skill"):
            installer._validate_acquisition_records(records, work)

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
            status = installer.main(["--target", "codex"])

        self.assertEqual(status, 2, stdout.getvalue() + stderr.getvalue())
        self.assertIn("CODEX_HOME is set but empty", stderr.getvalue())
        acquire.assert_not_called()
