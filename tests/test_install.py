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


SIX_SETTINGS = {
    "harness_secretary": {"model": "gpt-6.1-sol", "model_reasoning_effort": "low"},
    "harness_planner": {"model": "gpt-6.1-sol", "model_reasoning_effort": "medium"},
    "harness_scout": {"model": "gpt-6-luna", "model_reasoning_effort": "high"},
    "harness_coder": {"model": "gpt-6.1-sol", "model_reasoning_effort": "low"},
    "harness_qa": {"model": "gpt-6-luna", "model_reasoning_effort": "max"},
    "harness_reviewer": {"model": "gpt-6.1-sol", "model_reasoning_effort": "medium"},
}


def settings_bytes(roles: dict, version=4) -> bytes:
    lines = [f"version = {str(version).lower()}"]
    for role, fields in roles.items():
        lines.append(f"[roles.{role}]")
        for key, value in fields.items():
            lines.append(f"{key} = {json.dumps(value)}")
    return ("\n".join(lines) + "\n").encode()


class ModelSettingsTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory(dir="/private/tmp")
        self.addCleanup(temporary.cleanup)
        self.config = Path(temporary.name) / "models.toml"
        self.module = installer.load_model_module(REPO)

    def load(self, roles: dict, version=4):
        self.config.write_bytes(settings_bytes(roles, version))
        return self.module.load_settings(self.config)

    def test_model_standard_six_roles(self) -> None:
        try:
            settings = self.load(SIX_SETTINGS)
        except self.module.ValidationError as exc:
            self.fail(f"standard six-role settings must be accepted: {exc}")
        self.assertEqual(settings, SIX_SETTINGS)
        self.assertEqual(set(self.module.ROLE_FILES), set(SIX_SETTINGS))
        self.assertEqual(self.module.load_settings(REPO / "skill/models.toml"), SIX_SETTINGS)

    def test_model_rejects_unknown_missing_or_invalid_version(self) -> None:
        for roles in ({**SIX_SETTINGS, "unknown": {"model": "x", "model_reasoning_effort": "low"}},
                      {role: fields for role, fields in SIX_SETTINGS.items() if role != "harness_coder"}):
            with self.subTest(roles=roles), self.assertRaises(self.module.ValidationError):
                self.load(roles)
        for version in (1, 2, 3, True):
            with self.subTest(version=version), self.assertRaises(self.module.ValidationError):
                self.load(SIX_SETTINGS, version)
        for content in (b'version = 4\nroles = "invalid"\n', b'version = 4\n[roles', b'roles = {}\n'):
            self.config.write_bytes(content)
            with self.subTest(content=content), self.assertRaises(self.module.ValidationError):
                self.module.load_settings(self.config)

    def test_model_profile_sets_match_six_roles(self) -> None:
        filenames = {f"{role.replace('_', '-')}.toml" for role in SIX_SETTINGS}
        self.assertEqual(set(self.module.ROLE_FILES.values()), filenames)
        self.assertEqual(set(installer.PROFILE_FILES), filenames)
        self.assertEqual({p.name for p in (REPO / "agents").glob("*.toml")}, filenames)

    def test_naming_v4_settings_and_serialization(self) -> None:
        try:
            loaded = self.load(SIX_SETTINGS)
        except self.module.ValidationError as exc:
            self.fail(f"version 4 settings must be accepted: {exc}")
        self.assertEqual(loaded, SIX_SETTINGS)
        serialized = self.module.serialize_settings(loaded)
        self.assertEqual(tomllib.loads(serialized.decode())["version"], 4)
        self.config.write_bytes(serialized)
        self.assertEqual(self.module.load_settings(self.config), SIX_SETTINGS)

    def test_naming_rejects_old_versions_and_keys(self) -> None:
        legacy_prefix = "_".join(("yunho", "team"))
        legacy_roles = {legacy_prefix + role.removeprefix("harness"): fields
                        for role, fields in SIX_SETTINGS.items()}
        for version, roles in ((1, SIX_SETTINGS), (2, SIX_SETTINGS), (3, legacy_roles),
                               (True, SIX_SETTINGS), (4, legacy_roles)):
            with self.subTest(version=version):
                original = settings_bytes(roles, version)
                self.config.write_bytes(original)
                with self.assertRaises(self.module.ValidationError):
                    self.module.load_settings(self.config)
                self.assertEqual(self.config.read_bytes(), original)

    def test_naming_profile_identity_and_mapping(self) -> None:
        expected = {
            "harness_secretary": "harness-secretary.toml",
            "harness_planner": "harness-planner.toml",
            "harness_scout": "harness-scout.toml",
            "harness_coder": "harness-coder.toml",
            "harness_qa": "harness-qa.toml",
            "harness_reviewer": "harness-reviewer.toml",
        }
        self.assertEqual(self.module.ROLE_FILES, expected)
        self.assertEqual(set(installer.PROFILE_FILES), set(expected.values()))
        self.assertEqual({p.name for p in (REPO / "agents").glob("*.toml")}, set(expected.values()))
        for role, filename in expected.items():
            profile = tomllib.loads((REPO / "agents" / filename).read_text())
            self.assertEqual(profile["name"], role)
            rendered = self.module.render_profile((REPO / "agents" / filename).read_bytes(),
                                                  role, SIX_SETTINGS[role], REPO / "agents" / filename)
            effective = tomllib.loads(rendered.decode())
            self.assertEqual({key: effective[key] for key in SIX_SETTINGS[role]}, SIX_SETTINGS[role])

    def test_naming_rejects_profile_name_mismatch(self) -> None:
        with self.assertRaises(self.module.ValidationError):
            self.module.validate_template(b'name = "unrelated"\n', "harness_coder", self.config)


class ApplyModelsTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory(dir="/private/tmp")
        self.addCleanup(temporary.cleanup)
        self.base = Path(temporary.name)
        self.config = self.base / "models.toml"
        self.agents = self.base / "agents"
        self.agents.mkdir()
        self.module = installer.load_model_module(REPO)

    def fixture(self, matching=False) -> None:
        roles = dict(SIX_SETTINGS)
        self.config.write_bytes(settings_bytes(roles))
        for role, settings in SIX_SETTINGS.items():
            filename = role.replace("_", "-") + ".toml"
            fields = settings if matching else {"model": "old-model", "model_reasoning_effort": "low"}
            content = (f'name = "{role}"\n' + "".join(
                f'{key} = {json.dumps(value)}\n' for key, value in fields.items())).encode()
            (self.agents / filename).write_bytes(content)

    def cli(self, *flags):
        return subprocess.run(
            [sys.executable, "-B", str(REPO / "skill/scripts/apply-models.py"),
             "--config", str(self.config), "--agents-dir", str(self.agents), *flags],
            capture_output=True, text=True, check=False,
        )

    def test_apply_models_check_standard(self) -> None:
        self.fixture(matching=True)
        before = tree_state(self.base)
        result = self.cli("--check")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("six", result.stdout)
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
        self.assertIn("six", result.stdout)
        self.assertNotIn("seven", result.stdout)

    def test_apply_models_applies_six_profiles_without_mutating_config(self) -> None:
        self.fixture()
        config_before = self.config.read_bytes()
        result = self.cli()
        self.assertEqual(result.returncode, 0, result.stderr)
        for role, settings in SIX_SETTINGS.items():
            profile = tomllib.loads((self.agents / (role.replace("_", "-") + ".toml")).read_text())
            self.assertEqual({key: profile[key] for key in settings}, settings)
        self.assertEqual(self.config.read_bytes(), config_before)
        self.assertIn("six", result.stdout)
        self.assertNotIn("seven", result.stdout)
        result = self.cli()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("six", result.stdout)

    def test_naming_apply_models_v4_contract(self) -> None:
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
        for version in (1, 2, 3):
            self.config.write_bytes(settings_bytes(SIX_SETTINGS, version))
            before = tree_state(self.base)
            self.assertEqual(self.cli().returncode, 2)
            self.assertEqual(tree_state(self.base), before)

    def test_naming_apply_models_failure_restores_profiles(self) -> None:
        self.fixture()
        for index, path in enumerate(sorted(self.agents.iterdir())):
            path.chmod(0o600 if index % 2 else 0o640)
        before = tree_state(self.base)
        import importlib.util
        spec = importlib.util.spec_from_file_location("apply_models_test", REPO / "skill/scripts/apply-models.py")
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


REFERENCE_NAMES = ("planning", "handoff", "verification", "git-recovery", "visual-companion")


def policy_text(name: str) -> str:
    path = REPO / "skill" / ("SKILL.md" if name == "core" else f"references/{name}.md")
    return " ".join(path.read_text().lower().split())


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
                self.assertTrue((REPO / f"skill/references/{name}.md").is_file())
        self.assertRegex(core, r"do not load all references")

    def test_reference_triggers_cover_dependent_stages(self) -> None:
        core = policy_text("core")
        for name, trigger in (
            ("planning", r"design/plan-depth judgments.*spec/plan drafting or approval"),
            ("handoff", r"every coder first start/restart.*independent checkout verification"),
            ("verification", r"verification design.*qa/reviewer.*correction rechecks.*ui acceptance"),
            ("git-recovery", r"branch collision.*git preparation failure.*partial completion.*metadata write denial"),
            ("visual-companion", r"visual companion offer or operation"),
        ):
            with self.subTest(reference=name):
                row = next(line for line in (REPO / "skill/SKILL.md").read_text().lower().splitlines()
                           if f"references/{name}.md" in line)
                self.assertRegex(row, trigger)
        self.assertRegex(core, r"ceo.*each assigned role.*must read")
        self.assertRegex(core, r"ceo must.*accessible paths.*role brief")

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
            r"do not delete lock files.*chmod.*chown.*bypass the sandbox.*move to another workspace.*reset/stash/clean",
            r"minimum escalation.*exact single git command and workspace.*never broad git access",
            r"before retrying.*branch.*head.*index.*partial completion",
            r"both operational failure and missing execution-target choice block handoff",
        ):
            self.assertRegex(recovery, contract)

    def test_core_word_count_meets_budget(self) -> None:
        result = subprocess.run(["wc", "-w", str(REPO / "skill/SKILL.md")],
                                capture_output=True, text=True, check=True)
        self.assertLessEqual(int(result.stdout.split()[0]), 2788)

    def test_references_preserve_policy_contracts(self) -> None:
        contracts = {
            "planning": ("complete planning-document set", "written-spec approval", "individually approved"),
            "handoff": ("planning document commit", "unrelated staged", "approved-content verification"),
            "verification": ("criterion verdict", "ui browser acceptance checks", "whole-change review"),
            "git-recovery": ("git metadata write denial", "partial completion", "do not delete lock files"),
            "visual-companion": ("complete keyed url", "terminal text as primary", "waits for acceptance"),
        }
        for name, phrases in contracts.items():
            path = REPO / f"skill/references/{name}.md"
            self.assertTrue(path.is_file(), name)
            for phrase in phrases:
                with self.subTest(reference=name, contract=phrase):
                    self.assertIn(phrase, policy_text(name))

    def test_core_preserves_role_and_risk_gates(self) -> None:
        core = policy_text("core")
        for contract in (r"all six roles.*directly to ceo.*depth 2",
                         r"coder.*independent qa", r"qa.*independent reviewer.*full change",
                         r"ordinary.*significant/high-risk.*not eligible",
                         r"explicit user or task-specific tdd request overrides"):
            self.assertRegex(core, contract)

    def test_coder_reuses_choice_but_rechecks_state(self) -> None:
        coder = " ".join(tomllib.loads((REPO / "agents/harness-coder.toml").read_text())
                         ["developer_instructions"].lower().split())
        self.assertRegex(coder, r"reuse.*initial explicit choice")
        self.assertRegex(coder, r"every first start or restart.*independently verify")
        self.assertRegex(coder, r"scope.*workspace.*repository.*target.*candidate.*changes.*fresh explicit choice")

    def test_restart_choice_lifetime_and_evidence(self) -> None:
        path = REPO / "skill/references/handoff.md"
        self.assertTrue(path.is_file())
        handoff = policy_text("handoff")
        cases = {
            "first start": r"first start.*explicit user choice",
            "same target": r"same approved scope.*workspace.*repository.*execution target.*reuse.*initial explicit choice",
            "fresh state": r"every first start and restart.*ceo.*coder.*actual.*git state",
            "changed target": r"scope.*workspace.*repository.*target.*approved branch candidate.*changes.*fresh explicit choice",
            "invalidating failure": r"failure.*old target cannot be trusted.*fresh explicit choice",
            "normal work": r"normal.*head.*dirty.*do not.*invalidate",
            "record": r"one canonical initial handoff record.*accessible",
            "delta": r"delta-only restart brief.*initial record.*next objective.*ownership.*approvals.*documents.*current git state",
            "block": r"inaccessible.*record.*missing evidence.*unclear ownership.*block",
        }
        for case, contract in cases.items():
            with self.subTest(case=case):
                self.assertRegex(handoff, contract)
        coder = " ".join(tomllib.loads((REPO / "agents/harness-coder.toml").read_text())
                         ["developer_instructions"].lower().split())
        self.assertRegex(coder, r"reuse.*initial explicit choice")
        self.assertRegex(coder, r"every first start or restart.*independently verify")
        self.assertRegex(coder, r"scope.*workspace.*repository.*target.*candidate.*changes.*fresh explicit choice")


class HarnessPreactionGateTests(unittest.TestCase):
    # Specifically approved structural contract checks, not consuming-agent runtime tests.
    def test_preaction_role_precedence(self) -> None:
        core = policy_text("core").split("## instruction and execution adapter")[1].split("## mandatory task references")[0]
        self.assertRegex(core, r"brainstorming.*role.*save.*early.*commit.*harness")
        planning = policy_text("planning").split("### document-save evidence gates")[0]
        self.assertIn("ceo must not substitute an independently authored spec", planning)
        self.assertRegex(planning, r"planner.*complete spec draft and self-review.*ceo integrates, saves, self-reviews")
        self.assertRegex(planning, r"bounded written spec.*existing ceo depth judgment.*planner.*proportional complete spec draft.*self-review.*ceo.*individual written-spec approval")
        planner = " ".join(tomllib.loads((REPO / "agents/harness-planner.toml").read_text())
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
                for line in (REPO / "skill/references/planning.md").read_text().splitlines()
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
        rows = (REPO / "skill/SKILL.md").read_text().lower().splitlines()
        planning = next(row for row in rows if "references/planning.md" in row)
        handoff = next(row for row in rows if "references/handoff.md" in row)
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
        gate = handoff.split("### git mutation evidence gate")[1].split("### checkout approval")[0]
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
        self.assertRegex(handoff, r"do not automatically unstage, reset, stash, clean, or discard")


class RolePolicyTests(unittest.TestCase):
    # Approved package-consistency checks; these do not execute agent runtime behavior.
    def test_role_profiles_report_to_ceo_without_nested_delegation(self) -> None:
        for role in ("secretary", "planner", "scout", "coder", "qa", "reviewer"):
            with self.subTest(role=role):
                profile = tomllib.loads((REPO / "agents" / f"harness-{role}.toml").read_text())
                self.assertEqual(profile["name"], f"harness_{role}")
                instructions = " ".join(profile["developer_instructions"].lower().split())
                self.assertRegex(instructions, r"report(?:s)? directly to (?:the )?ceo")
                self.assertRegex(instructions, r"(?:do not|never|cannot) (?:create|spawn) (?:agents|subagents)")
                self.assertRegex(instructions, r"(?:do not|never|cannot) (?:delegate|assign) (?:work|tasks)")
        secretary = " ".join(tomllib.loads(
            (REPO / "agents/harness-secretary.toml").read_text()
        )["developer_instructions"].lower().split())
        for contract in (r"research/analysis.*documents, data, reference sources.*static.*logs/reports",
                         r"standalone document writing", r"operational cleanup.*outside secretary scope",
                         r"do not edit implementation/configuration/test code"):
            self.assertRegex(secretary, contract)

    def test_role_policy_assigns_development_to_ceo(self) -> None:
        policy = " ".join((REPO / "skill/SKILL.md").read_text().lower().split())
        ownership = policy.split("## ownership", 1)[1].split("## instruction", 1)[0]
        self.assertRegex(ownership, r"ceo.*sole owner.*development, configuration, tests")
        self.assertRegex(ownership, r"coder.*(?:edits|implements).*assigned.*files")
        self.assertRegex(ownership, r"all six roles.*directly to ceo.*depth 2")
        self.assertRegex(ownership, r"at most four.*subagents.*including secretary")
        self.assertRegex(ownership, r"ceo.*specialist.*results.*secretary")

    def test_qa_ui_browser_acceptance_contract(self) -> None:
        qa = " ".join(tomllib.loads(
            (REPO / "agents/harness-qa.toml").read_text()
        )["developer_instructions"].lower().split())
        policy = policy_text("verification")
        for artifact, text in (("qa", qa), ("policy", policy)):
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
                with self.subTest(artifact=artifact, contract=contract):
                    self.assertRegex(text, contract)
        self.assertRegex(policy, r"visual companion.*design discussion.*distinct from.*qa.*ui acceptance")
        readme = (REPO / "README.md").read_text()
        for term in ("UI 수락 기준", "브라우저", "화면 표시 영역", "공유", "Visual companion"):
            with self.subTest(readme_term=term):
                self.assertIn(term, readme)

    def test_qa_reporting_contract(self) -> None:
        instructions = " ".join(tomllib.loads(
            (REPO / "agents/harness-qa.toml").read_text()
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
            (REPO / "agents/harness-reviewer.toml").read_text()
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
                r"after applicable design/spec/plan approvals.*explicit user choice.*current checkout.*new task branch.*new worktree and task branch",
                r"present.*absolute workspace.*current branch.*detached head.*base head.*validated candidate",
                r"planning approval alone, no response, refusal of a new branch alone, or an unclear response.*does not select.*current checkout",
            ),
        )

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

    def test_workspace_handoff_preserves_existing_changes(self) -> None:
        self._assert_workspace_handoff_contracts(
            "Existing changes and failures",
            (
                r"existing staged, unstaged, and untracked changes.*preservation and edit ownership.*brief",
                r"do not automatically stash, commit, reset, clean, or delete changes",
                r"only the approved docs commit.*all three paths.*exception.*preserve all unrelated dirty files",
                r"existing changes prevent switching.*stop handoff until ceo resolves the state and scope",
            ),
        )

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
        self._assert_workspace_handoff_contracts(
            'New worktree and task branch',
            (
                r'selection target.*source absolute path.*repository.*common directory.*branch or detached head.*base sha.*branch candidate.*absolute path.*approved document',
                r'verified source head sha.*base.*do not.*remote.*default branch.*fetch',
                r'recheck.*source state.*base sha.*branch/path candidates.*before.*after.*choice',
                r'after selection and before creation.*changes.*fresh explicit choice.*pre-creation candidate rule',
                r'after successful creation and verification.*choice lifetime and restart record',
            ),
        )

    def test_workspace_handoff_worktree_collisions_require_new_choice(self) -> None:
        self._assert_workspace_handoff_contracts(
            'New worktree and task branch',
            (
                r'\.\./<repo>-<topic>-worktree.*sibling.*same parent',
                r'file.*directory.*symlink.*registered worktree.*collision',
                r'empty director.*do not reuse',
                r'lookup error.*missing',
                r'`-2`, `-3`.*first unused.*-worktree-2',
                r'collision.*stop.*new explicit choice.*do not automatically retry',
            ),
        )

    def test_workspace_handoff_worktree_creation_and_identity(self) -> None:
        self._assert_workspace_handoff_contracts(
            'New worktree and task branch',
            (
                r'git worktree add -b <branch> <absolute-path> <base-sha>',
                r'preserve.*source branch.*head.*index.*files.*shared git metadata',
                r'linked-worktree registration.*common directory.*branch.*base sha.*registered path.*dirty state',
                r'\.git.*file.*do not.*same top-level.*identity',
            ),
        )
        raw = (REPO / "skill/references/handoff.md").read_text()
        section = raw.split("### New worktree and task branch", 1)[1].split("### ", 1)[0]
        self.assertIn("Do not use --force or -B.", section)

    def test_workspace_handoff_worktree_source_dirty_states(self) -> None:
        self._assert_workspace_handoff_contracts(
            'New worktree and task branch',
            (
                r'untracked approved.*no index entry.*working-tree bytes.*approved version',
                r'tracked approved.*index bytes.*working-tree bytes.*both.*approved version',
                r'mismatch.*stop.*do not.*staging',
                r'unrelated staged.*required uncommitted implementation.*unclear ownership.*block',
                r'do not automatically.*stash.*commit.*reset.*clean.*unstage.*dirty implementation',
            ),
        )

    def test_workspace_handoff_worktree_document_transfer(self) -> None:
        self._assert_workspace_handoff_contracts(
            'Worktree document transfer',
            (
                r'only uncommitted approved spec/plan.*same repository-relative path',
                r'do not move, delete, or modify.*source',
                r'outside.*worktree.*symlink.*stop',
                r'clean base.*bytes.*base version.*replace.*approved version',
                r'unexpected changes.*do not overwrite.*stop',
                r'identical content.*verify.*reuse',
                r'after transfer.*bytes.*approved version.*canonical record.*source.*target.*relative path',
            ),
        )

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
                r'creation.*registration.*checkout.*document transfer.*staging.*commit.*failure.*stop.*handoff',
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
                r'all six roles.*absolute worktree path.*coder.*qa.*planner.*reviewer.*scout.*secretary',
                r'same.*worktree.*recheck.*reuse.*initial.*choice.*trust.*new explicit choice',
                r'do not automatically.*recreate.*cleanup.*archive',
            ),
        )

        self._assert_workspace_handoff_contracts(
            'Choice lifetime and restart record',
            (
                r'after successful worktree creation and verification.*selected target.*authorized head and dirty-state changes.*approved document transfer.*docs commits.*implementation.*do not.*invalidate.*initial choice',
                r'creation base sha.*evidence.*target head need not remain.*base',
                r'every first start and restart.*recheck.*actual git state.*ownership',
                r'scope, workspace, repository, target, or approved branch candidate.*changes.*fresh explicit choice',
                r'state mismatches and unresolved failures block.*editing',
                r'does not waive source preservation or unexpected-state checks',
            ),
        )

    def test_workspace_handoff_worktree_keeps_in_place_prohibition(self) -> None:
        self._assert_workspace_handoff_contracts(
            'New task branch',
            (
                r'do not create a worktree.*failure',
                r'only.*explicit.*new worktree and task branch.*permits.*worktree',
            ),
        )

    def test_worktree_planning_and_core_preparation_gates(self) -> None:
        planning = policy_text("planning").split("### complete planning-document set", 1)[1].split("### evidence refresh", 1)[0]
        self.assertRegex(planning, r"while documents.*do not.*worktree creation.*stage documents.*commit planning documents")
        self.assertRegex(planning, r"normal order:.*complete applicable set.*explicit execution-target choice.*approved branch switch or worktree creation.*batch commit")
        core = policy_text("core").split("## common handoff gate", 1)[1].split("## coder tdd", 1)[0]
        self.assertRegex(core, r"selected worktree.*common directory.*registration.*source preservation")
        self.assertRegex(core, r"depth-2 roles use the supplied workspace")

    def test_worktree_readme_matches_selected_execution_paths(self) -> None:
        readme = " ".join((REPO / "README.md").read_text().split())
        section = readme.split("현재 승인 범위의 필요한 문서를", 1)[1].split("최초 인계 기록", 1)[0]
        for phrase in ("현재 체크아웃", "같은 체크아웃", "새 worktree와 새 task branch", "../<repo>-<topic>-worktree",
                       "생성·검증", "문서 전달", "대상에서", "untracked", "index entry", "working-tree bytes",
                       "Tracked", "index bytes", "불일치", "staging", "부분 완료", "재개", "runtime"):
            with self.subTest(contract=phrase):
                self.assertIn(phrase, section)
        self.assertRegex(section, r"개별 승인.*명시 선택.*생성·검증.*문서 전달.*대상에서.*커밋.*최종.*인계")
        self.assertRegex(section, r"untracked.*index entry 없이.*working-tree bytes.*승인 버전")
        self.assertRegex(section, r"Tracked.*index bytes.*working-tree bytes.*모두.*승인 버전")
        self.assertRegex(section, r"불일치.*중단.*staging.*해결하지")
        candidate = section.split("새 worktree의 기본 후보", 1)[1].split("개별 승인 완료", 1)[0]
        self.assertRegex(candidate, r"생성 전.*원본 상태.*base SHA.*branch/path 후보.*선택 후 생성 전에.*바뀌면.*새 명시 선택")
        self.assertRegex(candidate, r"생성 전 후보 규칙.*생성·검증 성공 후.*재개 선택 재사용")
        restart = section.split("동일 승인 범위·작업공간", 1)[1]
        self.assertRegex(restart, r"생성·검증 성공 후.*선택된 대상.*승인 문서 전달.*문서 커밋.*구현.*HEAD·dirty 변경.*최초 선택.*무효화하지")
        self.assertRegex(restart, r"생성 base SHA.*증거.*대상 HEAD.*base에 머물.*요구하지")
        self.assertRegex(restart, r"매 시작·재개마다.*상태.*소유권")
        self.assertRegex(restart, r"원본 보존.*예상 밖 상태 확인.*면제하지")

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

    def migration_paths(self) -> list[Path]:
        prefix = "-".join(("yunho", "team"))
        return [self.codex_home / "agents" / f"{prefix}-{role}.toml"
                for role in ("secretary", "planner", "scout", "coder", "qa", "reviewer")]

    def seed_migration(self, count=6) -> list[Path]:
        paths = self.migration_paths()[:count]
        for index, path in enumerate(paths):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(f"custom legacy {index}".encode())
            path.chmod(0o640)
        return paths

    def migration_active_state(self):
        return (tree_state(self.codex_home / "agents"), tree_state(self.codex_home / "skills"),
                tree_state(self.user_home / ".agents"))

    def test_migration_new_partial_full_and_repeat_install(self) -> None:
        self.create_payload()
        acquire, _ = self.acquisition_stub()
        for count in (0, 2, 6):
            with self.subTest(count=count):
                paths = self.seed_migration(count)
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
                    saved = backup / "agents" / filename
                    self.assertTrue(saved.is_file(), str(saved))
                    self.assertEqual(saved.read_bytes(), content)
                    self.assertEqual(stat.S_IMODE(saved.stat().st_mode), mode)
                self.assertFalse(any(path.exists() for path in self.migration_paths()))
                for filename in installer.PROFILE_FILES:
                    profile = tomllib.loads((self.codex_home / "agents" / filename).read_text())
                    role = filename.removesuffix(".toml").replace("-", "_")
                    self.assertEqual(profile["name"], role)
                    self.assertEqual({key: profile[key] for key in SIX_SETTINGS[role]}, SIX_SETTINGS[role])
        with patch.object(installer, "acquire_external_skills", side_effect=acquire):
            status, output = self.run_main([])
        self.assertEqual(status, 0, output)

    def test_migration_partial_and_existing_new_profiles(self) -> None:
        self.create_payload()
        self.seed_existing_targets()
        paths = self.seed_migration(2)
        originals = {p.name: (p.read_bytes(), stat.S_IMODE(p.stat().st_mode))
                     for p in [*paths, *(self.codex_home / "agents" / f for f in installer.PROFILE_FILES)]}
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
        self.assertEqual(settings["version"], 4)

    def test_migration_removes_candidates_before_new_profiles(self) -> None:
        self.create_payload()
        paths = self.seed_migration()
        acquire, _ = self.acquisition_stub()
        real_replace = os.replace
        observed = []
        def observe(source, target):
            if Path(target).name in installer.PROFILE_FILES:
                observed.append(True)
                self.assertFalse(any(p.exists() for p in paths))
            return real_replace(source, target)
        with patch.object(installer, "acquire_external_skills", side_effect=acquire), patch.object(installer.os, "replace", observe):
            status, output = self.run_main([])
        self.assertEqual(status, 0, output)
        self.assertTrue(observed)

    def test_migration_move_failure_restores_profiles(self) -> None:
        self.create_payload()
        self.seed_existing_targets()
        paths = self.seed_migration()
        before = self.migration_active_state()
        acquire, _ = self.acquisition_stub()
        real_replace = os.replace
        def fail(source, target):
            if Path(source) == paths[1]:
                raise OSError("injected legacy move failure")
            return real_replace(source, target)
        with patch.object(installer, "acquire_external_skills", side_effect=acquire), patch.object(installer.os, "replace", fail):
            status, output = self.run_main([])
        self.assertEqual(status, 2, output)
        self.assertEqual(self.migration_active_state(), before)
        self.assert_no_stages()

    def test_migration_profile_failure_restores_all_targets(self) -> None:
        self.create_payload()
        self.seed_existing_targets()
        missing = self.codex_home / "agents" / installer.PROFILE_FILES[-1]
        missing.unlink()
        paths = self.seed_migration()
        write_candidates(self.codex_home / "skills", b"old")
        write_candidates(self.user_home / ".agents" / "skills", b"old user")
        before = self.migration_active_state()
        acquire, _ = self.acquisition_stub()
        real_replace = os.replace
        failed = False
        def fail(source, target):
            nonlocal failed
            if not failed and Path(target).name == installer.PROFILE_FILES[1]:
                failed = True
                self.assertFalse(any(p.exists() for p in paths))
                raise OSError("injected new profile failure")
            return real_replace(source, target)
        with patch.object(installer, "acquire_external_skills", side_effect=acquire), patch.object(installer.os, "replace", fail):
            status, output = self.run_main([])
        self.assertEqual(status, 2, output)
        self.assertTrue(failed)
        self.assertEqual(self.migration_active_state(), before)
        self.assertFalse(missing.exists())
        backup = next((self.codex_home / "backups").iterdir())
        for path in paths:
            self.assertTrue((backup / "agents" / path.name).is_file())
            self.assertEqual((backup / "agents" / path.name).read_bytes(), path.read_bytes())
        self.assert_no_stages()

    def test_migration_rollback_failure_preserves_recovery(self) -> None:
        self.create_payload()
        paths = self.seed_migration(2)
        original = paths[0].read_bytes()
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
            if failed and target == paths[0]:
                recovery = source
                raise OSError("injected legacy restore failure")
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
        self.assertEqual((backup / "agents" / paths[0].name).read_bytes(), original)
        self.assertTrue(paths[1].exists())

    def test_migration_preparation_failure_preserves_active_targets(self) -> None:
        self.create_payload()
        self.seed_existing_targets()
        self.seed_migration()
        before = self.migration_active_state()
        acquire, _ = self.acquisition_stub()
        for method in ("backup_existing", "_copy_harness_to_stage"):
            with self.subTest(method=method), patch.object(installer, "acquire_external_skills", side_effect=acquire), patch.object(installer, method, side_effect=OSError("injected preparation failure")):
                status, output = self.run_main([])
                self.assertEqual(status, 2, output)
                self.assertEqual(self.migration_active_state(), before)
                self.assert_no_stages()

    def test_migration_rejects_unsafe_candidates(self) -> None:
        self.create_payload()
        path = self.migration_paths()[0]
        path.parent.mkdir(parents=True)
        for kind in ("symlink", "directory", "fifo"):
            with self.subTest(kind=kind):
                if kind == "symlink":
                    path.symlink_to(self.base / "missing")
                elif kind == "directory":
                    path.mkdir()
                else:
                    os.mkfifo(path)
                before = tree_state(self.codex_home)
                acquire, calls = self.acquisition_stub()
                try:
                    with patch.object(installer, "acquire_external_skills", side_effect=acquire):
                        status, output = self.run_main([])
                    after = tree_state(self.codex_home)
                finally:
                    installer.remove_path(path)
                    # An incorrect install must not contaminate the next unsafe fixture.
                    for child in list(self.codex_home.iterdir()):
                        if child != path.parent:
                            installer.remove_path(child)
                    for child in list(path.parent.iterdir()):
                        installer.remove_path(child)
                self.assertEqual(status, 2, output)
                self.assertEqual(calls, [])
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

    def test_migration_preserves_unrelated_profiles(self) -> None:
        self.create_payload()
        self.seed_migration()
        prefix = "-".join(("yunho", "team"))
        agents = self.codex_home / "agents"
        unrelated = [agents / "custom.toml", agents / f"{prefix}-lead.toml",
                     agents / f"{prefix}-coder-extra.toml", agents / "harness-lead.toml"]
        for path in unrelated:
            path.write_bytes(b"unrelated")
            path.chmod(0o600)
        before = {p: tree_state(p) for p in unrelated}
        acquire, _ = self.acquisition_stub()
        with patch.object(installer, "acquire_external_skills", side_effect=acquire):
            status, output = self.run_main([])
        self.assertEqual(status, 0, output)
        self.assertEqual({p: tree_state(p) for p in unrelated}, before)
        self.assertFalse(any(p.exists() for p in self.migration_paths()))

    def test_migration_check_and_dry_run_are_read_only(self) -> None:
        self.create_payload()
        self.install_candidates(self.codex_home / "skills")
        paths = self.seed_migration(2)
        before = tree_state(self.base)
        with patch.object(installer, "acquire_external_skills") as acquire, patch.object(installer.subprocess, "run") as process:
            for flags in (["--check"], ["--dry-run"]):
                status, output = self.run_main(flags)
                self.assertEqual(status, 0, output)
                self.assertEqual(tree_state(self.base), before)
                if flags == ["--dry-run"]:
                    for path in paths:
                        self.assertIn(str(path), output)
            acquire.assert_not_called()
            process.assert_not_called()

    def test_migration_candidates_changed_during_acquisition(self) -> None:
        self.create_payload()
        paths = self.seed_migration(1)
        acquire, _ = self.acquisition_stub()
        def changed(work):
            result = acquire(work)
            self.seed_migration(2)
            return result
        with patch.object(installer, "acquire_external_skills", side_effect=changed):
            status, output = self.run_main([])
        self.assertEqual(status, 2, output)
        self.assertIn("changed during acquisition", output)
        self.assertTrue(paths[0].exists())
        self.assertFalse((self.codex_home / "skills").exists())
        self.assertFalse((self.codex_home / "backups").exists())

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
            "brainstorming writing-plans test-driven-development "
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

    def test_manifest_rejects_missing_reference_entry(self) -> None:
        self.create_payload()
        for name in REFERENCE_NAMES:
            with self.subTest(reference=name):
                path = self.payload / f"skill/references/{name}.md"
                self.assertTrue(path.is_file(), str(path))
                refresh_manifest(self.payload)
                manifest = self.payload / "MANIFEST.sha256"
                manifest.write_text("".join(line for line in manifest.read_text().splitlines(True)
                                            if not line.endswith(f"  skill/references/{name}.md\n")))
                with self.assertRaisesRegex(installer.InstallerError, "does not cover.*references"):
                    installer.verify_manifest(self.payload)

    def test_manifest_rejects_reference_hash_mismatch(self) -> None:
        self.create_payload()
        for name in REFERENCE_NAMES:
            with self.subTest(reference=name):
                path = self.payload / f"skill/references/{name}.md"
                self.assertTrue(path.is_file(), str(path))
                refresh_manifest(self.payload)
                original = path.read_bytes()
                path.write_bytes(original + b"\nchanged contract\n")
                with self.assertRaisesRegex(installer.InstallerError, "SHA-256 mismatch.*references"):
                    installer.verify_manifest(self.payload)
                path.write_bytes(original)

    def test_install_writes_harness_profiles_and_three_external_skills(self) -> None:
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
        harness = self.codex_home / "skills" / installer.INSTALL_NAME
        self.assertEqual(tree_state(harness), tree_state(self.payload / "skill"))
        for name in REFERENCE_NAMES:
            relative = f"references/{name}.md"
            self.assertTrue((harness / relative).is_file(), relative)
            self.assertEqual((harness / relative).read_bytes(), (self.payload / "skill" / relative).read_bytes())
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
                "--agent", "codex", "--yes", "--copy", "--json",
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
            status = installer.main([])

        self.assertEqual(status, 2, stdout.getvalue() + stderr.getvalue())
        self.assertIn("CODEX_HOME is set but empty", stderr.getvalue())
        acquire.assert_not_called()
