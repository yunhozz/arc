"""Independent legacy model literals and real Python CLI evidence for I1 QA."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import tomllib

ROOT = Path(__file__).resolve().parents[1]
ROLES = ('arc_scouter', 'arc_planner', 'arc_implementer', 'arc_qa', 'arc_reviewer')
PAIRS = json.loads((ROOT / 'tests/fixtures/qa-legacy-model-values.json').read_text())


def model_case(platform, version, active):
    field = 'model_reasoning_effort' if platform == 'codex' else 'effort'
    expected = {role: {'model': PAIRS[platform][active][i][0], field: PAIRS[platform][active][i][1]}
                for i, role in enumerate(ROLES)}
    if version == 3:
        source = 'version = 3\n' + ''.join(
            f'\n[roles.{role}]\nmodel = "{value["model"]}"\n{field} = "{value[field]}"\n'
            for role, value in expected.items())
    else:
        source = (ROOT / f'tests/fixtures/models-{platform}-v1.toml').read_text()
        source = source.replace('version = 1', f'version = {version}').replace('preset = "balanced"', f'preset = "{active}"')
        if active == 'custom':
            source += ''.join(f'\n[custom.{role}]\nmodel = "{value["model"]}"\n{field} = "{value[field]}"\n'
                              for role, value in expected.items())
    return source.encode(), expected


def exercise_python_model_matrix(test, module, platform):
    """Catch skipped migration, wrong active selection, or CLI ignoring the loader."""
    field = 'model_reasoning_effort' if platform == 'codex' else 'effort'
    for version in (1, 2, 3):
        for active in ('economy', 'balanced', 'smart', 'custom'):
            if version == 1 and active == 'custom':
                continue  # Existing schema rejects this combination; clarification pending.
            with test.subTest(platform=platform, version=version, active=active), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary).resolve()
                source, expected = model_case(platform, version, active)
                original = root / 'models.toml'
                original.write_bytes(source)
                parsed = tomllib.loads(source.decode())
                before = json.loads(json.dumps(parsed))
                test.assertEqual(module.validate_config(parsed, original), {'version': 3, 'roles': expected})
                test.assertEqual(parsed, before)
                test.assertEqual(module.load_settings(original), expected)
                canonical = module.serialize_settings(parsed)
                test.assertEqual(tomllib.loads(canonical.decode()), {'version': 3, 'roles': expected})
                test.assertNotIn(b'preset', canonical)
                output = root / 'canonical.toml'
                output.write_bytes(canonical)
                test.assertEqual(module.load_settings(output), expected)
                # The CLI reads the old file and the serializer's actual v3 output.
                for filename in (original, output):
                    agents = root / ('agents-' + filename.stem)
                    shutil.copytree(ROOT / platform / 'agents', agents)
                    before_profiles = {path.name: path.read_bytes() for path in agents.iterdir()}
                    command = [sys.executable, '-B', str(ROOT / platform / 'skill/scripts/apply-models.py'),
                               '--config', str(filename), '--agents-dir', str(agents)]
                    env = {**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'}
                    dry = subprocess.run(command + ['--dry-run'], capture_output=True, text=True, env=env)
                    test.assertEqual(dry.returncode, 0, dry.stdout + dry.stderr)
                    test.assertEqual({path.name: path.read_bytes() for path in agents.iterdir()}, before_profiles)
                    applied = subprocess.run(command, capture_output=True, text=True, env=env)
                    test.assertEqual(applied.returncode, 0, applied.stdout + applied.stderr)
                    for role in ROLES:
                        profile = agents / (role.replace('_', '-') + ('.toml' if platform == 'codex' else '.md'))
                        text = profile.read_text()
                        values = tomllib.loads(text) if platform == 'codex' else dict(re.findall(r'^(model|effort): (.+)$', text, re.M))
                        test.assertEqual({key: values[key] for key in ('model', field)}, expected[role])
                    after = {path.name: path.read_bytes() for path in agents.iterdir()}
                    checked = subprocess.run(command + ['--check'], capture_output=True, text=True, env=env)
                    test.assertEqual(checked.returncode, 0, checked.stdout + checked.stderr)
                    test.assertEqual({path.name: path.read_bytes() for path in agents.iterdir()}, after)
                test.assertFalse(list(root.rglob('__pycache__')))
