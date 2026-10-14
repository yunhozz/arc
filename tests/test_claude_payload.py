"""Claude payload contracts and real filesystem model reapplication."""
import copy
import hashlib
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
PAYLOAD = ROOT / 'claude'
EXPECTED = {
    'scouter': ('haiku', 'max', ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch']),
    'planner': ('sonnet', 'medium', ['Read', 'Grep', 'Glob']),
    'coder': ('sonnet', 'low', ['Read', 'Grep', 'Glob', 'Bash', 'Write', 'Edit']),
    'qa': ('haiku', 'high', ['Read', 'Grep', 'Glob', 'Bash']),
    'reviewer': ('sonnet', 'medium', ['Read', 'Grep', 'Glob']),
}


class ClaudePayloadTests(unittest.TestCase):
    def module(self):
        path = PAYLOAD / 'skill/scripts/model_config.py'
        self.assertTrue(path.is_file(), 'Claude model module must be shipped')
        spec = importlib.util.spec_from_file_location('claude_model_config', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def fixture(self, root):
        target = root / '.claude'
        shutil.copytree(PAYLOAD / 'skill', target / 'skills/yunho-harness')
        shutil.copytree(PAYLOAD / 'agents', target / 'agents')
        return target

    def test_exact_roles_models_efforts_and_tools(self):
        module = self.module()
        settings = module.load_settings(PAYLOAD / 'skill/models.toml')
        self.assertEqual(set(settings), {'harness_' + role for role in EXPECTED})
        for role, (model, effort, tools) in EXPECTED.items():
            self.assertEqual(settings['harness_' + role], {'model': model, 'effort': effort})
            fields = module.parse_profile((PAYLOAD / f'agents/harness-{role}.md').read_bytes())
            self.assertEqual(fields['tools'], tools)
            self.assertEqual((fields['model'], fields['effort']), (model, effort))

    def test_rejects_missing_extra_roles_and_invalid_settings(self):
        module = self.module()
        import tomllib
        valid = tomllib.loads((PAYLOAD / 'skill/models.toml').read_text())
        variants = []
        for mutate in (
            lambda d: d['roles'].pop('harness_qa'),
            lambda d: d['roles'].update(extra={'model': 'sonnet', 'effort': 'low'}),
            lambda d: d.update(version=True),
            lambda d: d.update(extra=1),
            lambda d: d['roles']['harness_qa'].update(effort='extreme'),
            lambda d: d['roles']['harness_qa'].update(model=2),
            lambda d: d['roles']['harness_qa'].update(model='bad\nmodel'),
            lambda d: d['roles']['harness_qa'].update(extra=1),
        ):
            data = copy.deepcopy(valid)
            mutate(data)
            variants.append(data)
        for data in variants:
            with self.subTest(data=data), self.assertRaises(module.ValidationError):
                module.validate_settings(data)

    def test_frontmatter_names_and_required_fields(self):
        module = self.module()
        for role in EXPECTED:
            fields = module.parse_profile((PAYLOAD / f'agents/harness-{role}.md').read_bytes())
            self.assertEqual(fields['name'], 'harness-' + role)
            self.assertTrue(fields['description'])
            self.assertEqual(set(fields), {'name', 'description', 'model', 'effort', 'tools'})

    def test_renderer_preserves_body_and_non_model_fields(self):
        module = self.module()
        original = (PAYLOAD / 'agents/harness-coder.md').read_bytes().replace(b'\n', b'\r\n')
        updated = module.render_profile(original, {'model': 'opus', 'effort': 'xhigh'})
        self.assertEqual(updated, original.replace(b'model: sonnet', b'model: opus').replace(b'effort: low', b'effort: xhigh'))

    def test_renderer_rejects_duplicate_or_malformed_frontmatter(self):
        module = self.module()
        original = (PAYLOAD / 'agents/harness-coder.md').read_bytes()
        for bad in (original.replace(b'model: sonnet', b'model: sonnet\nmodel: haiku'), original[4:], original.replace(b'---\n\n', b'\n\n', 1), original.replace(b'model: sonnet', b'model: [sonnet]'), original.replace(b'  - Bash', b'  - Agent')):
            with self.subTest(bad=bad), self.assertRaises(module.ValidationError):
                module.render_profile(bad, {'model': 'opus', 'effort': 'high'})

    def test_apply_models_check_and_dry_run_do_not_write(self):
        self.module()
        with tempfile.TemporaryDirectory() as tmp:
            target = self.fixture(Path(tmp).resolve())
            config = target / 'skills/yunho-harness/models.toml'
            config.write_text(config.read_text().replace('model = "sonnet"', 'model = "opus"'))
            before = {p.relative_to(target): (p.read_bytes(), p.stat().st_mode) for p in target.rglob('*') if p.is_file()}
            for flag in ('--check', '--dry-run'):
                result = subprocess.run([sys.executable, '-B', str(target / 'skills/yunho-harness/scripts/apply-models.py'), flag], capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(before, {p.relative_to(target): (p.read_bytes(), p.stat().st_mode) for p in target.rglob('*') if p.is_file()})

    def test_apply_models_updates_only_claude_profiles(self):
        self.module()
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp).resolve()
            target = self.fixture(base)
            codex = base / '.codex/agents/untouched.toml'
            codex.parent.mkdir(parents=True)
            codex.write_bytes(b'unchanged')
            config = target / 'skills/yunho-harness/models.toml'
            config.write_text(config.read_text().replace('model = "sonnet"', 'model = "opus"'))
            profiles = list((target / 'agents').glob('*.md'))
            for profile in profiles:
                profile.chmod(0o640)
            result = subprocess.run([sys.executable, '-B', str(target / 'skills/yunho-harness/scripts/apply-models.py'), '--config', str(config), '--agents-dir', str(target / 'agents')], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(codex.read_bytes(), b'unchanged')
            for profile in profiles:
                self.assertEqual(profile.stat().st_mode & 0o777, 0o640)
                if profile.name not in ('harness-scouter.md', 'harness-qa.md'):
                    self.assertIn(b'model: opus', profile.read_bytes())

    def test_apply_models_failure_restores_all_prior_profiles(self):
        module = self.module()
        with tempfile.TemporaryDirectory() as tmp:
            target = self.fixture(Path(tmp).resolve())
            settings = module.load_settings(target / 'skills/yunho-harness/models.toml')
            for setting in settings.values():
                setting['model'] = 'opus'
            before = {p: (p.read_bytes(), p.stat().st_mode) for p in (target / 'agents').glob('*.md')}
            replace = os.replace
            calls = 0
            def failing_replace(src, dst):
                nonlocal calls
                calls += 1
                if calls == 2:
                    raise OSError('injected replacement failure')
                return replace(src, dst)
            with patch.object(module.os, 'replace', side_effect=failing_replace):
                with self.assertRaisesRegex(OSError, 'injected replacement failure'):
                    module.apply_models(settings, target / 'agents')
            self.assertEqual(before, {p: (p.read_bytes(), p.stat().st_mode) for p in (target / 'agents').glob('*.md')})
            self.assertEqual(set(p.name for p in (target / 'agents').iterdir()), set(p.name for p in before))

    def test_claude_policy_preserves_role_and_approval_contracts(self):
        self.assertTrue((PAYLOAD / 'skill/SKILL.md').is_file(), 'Claude CEO adapter must be shipped')
        required = {'planning', 'handoff', 'handoff-prep', 'commit', 'verification', 'git-recovery', 'visual-companion'}
        self.assertEqual({p.stem for p in (PAYLOAD / 'skill/references').glob('*.md')}, required)
        # Policy semantics are independently reviewed by QA; executable tool authority is checked above.

    def test_manifest_covers_immutable_claude_payload(self):
        entries = dict(line.split('  ', 1)[::-1] for line in (ROOT / 'MANIFEST.sha256').read_text().splitlines())
        files = [p for p in PAYLOAD.rglob('*') if p.is_file()]
        self.assertTrue(files, 'Claude payload must be shipped')
        for path in files:
            relative = path.relative_to(ROOT).as_posix()
            if relative == 'claude/skill/models.toml':
                self.assertNotIn(relative, entries)
            else:
                self.assertEqual(entries.get(relative), hashlib.sha256(path.read_bytes()).hexdigest())


if __name__ == '__main__':
    unittest.main()
