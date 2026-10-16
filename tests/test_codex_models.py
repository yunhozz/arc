from __future__ import annotations
import hashlib, json, os, shutil, signal, subprocess, stat, sys, tempfile, tomllib, unittest
from pathlib import Path
from unittest.mock import patch
REPO = Path(__file__).resolve().parents[1]
TMP_ROOT = os.path.realpath(tempfile.gettempdir())
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

class ModelSettingsTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory(dir=TMP_ROOT)
        self.addCleanup(temporary.cleanup)
        self.config = Path(temporary.name) / "models.toml"
        self.module = load_model_module()

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
        self.assertEqual(set(node_profile_files()), filenames)
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
        self.assertEqual(set(node_profile_files()), set(expected.values()))
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
        self.module = load_model_module()

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

def load_model_module():
    import importlib.util
    spec = importlib.util.spec_from_file_location("_arc_retained_model_config", REPO / "codex/skill/scripts/model_config.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module

def node_profile_files():
    result = subprocess.run(["node", "--input-type=module", "-e", "import {resolveTarget} from './lib/installer/targets.mjs';console.log(JSON.stringify(resolveTarget('codex',{userHome:'/home/u',env:{}}).profileNames));"], cwd=REPO, capture_output=True, text=True, check=True)
    return json.loads(result.stdout)
