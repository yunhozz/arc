"""Claude payload contracts and real filesystem model reapplication."""
import copy
import hashlib
import importlib.util
import os
import re
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from tests.qa_model_cases import current_role

ROOT = Path(__file__).resolve().parents[1]
PAYLOAD = ROOT / 'claude'
EXPECTED = {
    'scouter': ('sonnet', 'medium', ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch']),
    'planner': ('sonnet', 'high', ['Read', 'Grep', 'Glob']),
    'implementer': ('sonnet', 'medium', ['Read', 'Grep', 'Glob', 'Bash', 'Write', 'Edit']),
    'tester': ('sonnet', 'medium', ['Read', 'Grep', 'Glob', 'Bash']),
    'reviewer': ('sonnet', 'high', ['Read', 'Grep', 'Glob']),
}
# Package models.toml defaults applied by apply-models.
BALANCED_PRESET = {
    'scouter': ('opus', 'medium'),
    'planner': ('opus', 'medium'),
    'implementer': ('opus', 'medium'),
    'tester': ('opus', 'medium'),
    'reviewer': ('opus', 'medium'),
}


def _document_parts(platform: str, name: str) -> tuple[str, ...]:
    skill = ROOT / platform / "skill"
    if name == "core":
        return ((skill / "SKILL.md").read_text(encoding="utf-8"),)
    local = (skill / "references" / f"{name}.md").read_text(encoding="utf-8")
    common = ROOT / "shared/skill/references" / f"{name}-common.md"
    if common.exists():
        return local, common.read_text(encoding="utf-8")
    return (local,)


def _effective(platform: str, name: str) -> str:
    return "\n".join(_document_parts(platform, name))


def _effective_section(platform: str, name: str, heading: str) -> str:
    level = len(heading.split()[0])
    boundary = re.compile(rf"(?m)^#{{1,{level}}}[ \t]+")
    sections = []
    for part in _document_parts(platform, name):
        headings = list(boundary.finditer(part))
        for idx, match in enumerate(headings):
            if part[match.start():].split("\n", 1)[0] == heading:
                end = headings[idx + 1].start() if idx + 1 < len(headings) else len(part)
                sections.append(part[match.start():end])
    if not sections:
        raise ValueError(f"Missing heading in {platform}/{name}: {heading}")
    return "\n".join(sections)

def read_payload_text(path):
    if path.parent == PAYLOAD / 'agents' and path.name in {f'arc-{role}.md' for role in EXPECTED}:
        result = subprocess.run(
            ['node', '--input-type=module', '-e',
             "import fs from 'node:fs';"
             "import {renderAgentProfile} from './lib/prompts/render.mjs';"
             "const path=process.argv[1];"
             "const registry=JSON.parse(fs.readFileSync('./lib/prompts/agent-fragments.json','utf8'));"
             "process.stdout.write(renderAgentProfile(path,fs.readFileSync(path),registry));",
             path.relative_to(ROOT).as_posix()],
            cwd=ROOT, capture_output=True, encoding='utf-8')
        if result.returncode:
            raise RuntimeError(f'Could not expand {path}: {result.stderr}')
        return result.stdout
    if path == PAYLOAD / 'skill/SKILL.md':
        return _effective('claude', 'core')
    if path.parent == PAYLOAD / 'skill/references' and path.suffix == '.md':
        return _effective('claude', path.stem)
    return path.read_text()


class ClaudePayloadTests(unittest.TestCase):
    def module(self):
        path = PAYLOAD / 'skill/scripts/model_config.py'
        self.assertTrue(path.is_file(), 'Claude model module must be shipped')
        spec = importlib.util.spec_from_file_location('claude_model_config', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_v4_rejects_arc_qa(self):
        module = self.module()
        original = (PAYLOAD / 'skill/models.toml').read_bytes()
        invalid = re.sub(rb'^version = \d+$', b'version = 4', original, flags=re.MULTILINE)
        invalid = invalid.replace(b'roles.arc_tester', b'roles.arc_qa')
        with tempfile.TemporaryDirectory() as temporary:
            config = Path(temporary).resolve() / 'models.toml'
            config.write_bytes(invalid)
            with self.assertRaisesRegex(module.ValidationError, 'arc_qa'):
                module.load_settings(config)
            self.assertEqual(config.read_bytes(), invalid)

    def test_v3_round_trip(self):
        import tomllib
        module = self.module()
        config = {'version': 4, 'roles': {f'arc_{role}': {'model': 'sonnet', 'effort': 'high'} for role in EXPECTED}}
        content = module.serialize_settings(config)
        self.assertEqual(tomllib.loads(content.decode()), config)
        self.assertNotIn(b'preset', content)
        self.assertEqual(module.validate_config(config, Path('models.toml')), config)
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp).resolve() / 'models.toml'; target.write_bytes(content)
            self.assertEqual(module.load_settings(target), config['roles'])

    def test_legacy_v1_v2_convert_to_active_roles(self):
        import tomllib
        module = self.module()
        legacy = tomllib.loads((ROOT / 'tests/fixtures/models-claude-v1.toml').read_text())
        for version in (1, 2):
            for preset in ('economy', 'balanced', 'smart', 'custom'):
                if version == 1 and preset == 'custom': continue
                config = copy.deepcopy(legacy); config.update(version=version, preset=preset)
                if preset == 'custom': config['custom'] = {f'arc_{role}': {'model': 'opus', 'effort': 'low'} for role in EXPECTED}
                expected = config['custom'] if preset == 'custom' else {current_role(role): variants[preset] for role, variants in config['roles'].items()}
                self.assertEqual(module.validate_config(config, Path('models.toml')), {'version': 4, 'roles': expected})

    def fixture(self, root):
        target = root / '.claude'
        shutil.copytree(PAYLOAD / 'skill', target / 'skills/arc')
        shutil.copytree(PAYLOAD / 'agents', target / 'agents')
        return target

    def test_exact_roles_models_efforts_and_tools(self):
        module = self.module()
        settings = module.load_settings(PAYLOAD / 'skill/models.toml')
        self.assertEqual(set(settings), {'arc_' + role for role in EXPECTED})
        for role, (model, effort, tools) in EXPECTED.items():
            preset_model, preset_effort = BALANCED_PRESET[role]
            self.assertEqual(settings['arc_' + role], {'model': preset_model, 'effort': preset_effort})
            fields = module.parse_profile((PAYLOAD / f'agents/arc-{role}.md').read_bytes())
            self.assertEqual(fields['tools'], tools)
            self.assertEqual((fields['model'], fields['effort']), (model, effort))

    def test_hook_removal_profiles_parse_render_apply(self):
        module = self.module()
        settings = {f'arc_{role}': {'model': 'opus', 'effort': 'high'} for role in EXPECTED}
        with tempfile.TemporaryDirectory() as tmp:
            agents = Path(tmp).resolve() / 'agents'
            shutil.copytree(PAYLOAD / 'agents', agents)
            for role in EXPECTED:
                profile = agents / f'arc-{role}.md'
                content = re.sub(rb'^hooks:\r?\n(?:[ \t].*(?:\r?\n|$))*', b'', profile.read_bytes(), flags=re.M)
                profile.write_bytes(content)
                fields = module.parse_profile(content)
                self.assertNotIn('hooks', fields)
                self.assertEqual(fields['name'], f'arc-{role}')
            before = {p: p.read_bytes() for p in agents.iterdir()}
            self.assertTrue(module.apply_models(settings, agents, check=True))
            self.assertTrue(module.apply_models(settings, agents, dry_run=True))
            self.assertEqual(before, {p: p.read_bytes() for p in agents.iterdir()})
            module.apply_models(settings, agents)
            self.assertEqual(module.apply_models(settings, agents, check=True), [])
            for profile in agents.iterdir():
                self.assertEqual(module.parse_profile(profile.read_bytes())['model'], 'opus')

    def test_hook_removal_preserves_optional_frontmatter(self):
        module = self.module()
        original = re.sub(rb'^hooks:\r?\n(?:[ \t].*(?:\r?\n|$))*', b'', (PAYLOAD / 'agents/arc-implementer.md').read_bytes(), flags=re.M)
        optional = b'hooks:\n  FutureEvent:\n    - matcher: Custom\n      hooks:\n        - type: command\n          command: "echo user"\n'
        content = original.replace(b'\n---\n', b'\n' + optional + b'---\n', 1)
        for content in (content, content.replace(b'\n', b'\r\n')):
            rendered = module.render_profile(content, {'model': 'opus', 'effort': 'high'})
            self.assertEqual(rendered, content.replace(b'model: sonnet', b'model: opus').replace(b'effort: medium', b'effort: high'))
            self.assertEqual(module.parse_profile(rendered)['hooks'], module.parse_profile(content)['hooks'])
            with self.assertRaises(module.ValidationError):
                module.parse_profile(content.replace(b'hooks:', b'hooks:\nhooks:', 1))

    def test_rejects_missing_extra_roles_and_invalid_settings(self):
        module = self.module()
        import tomllib
        valid = tomllib.loads((ROOT / 'tests/fixtures/models-claude-v1.toml').read_text())
        variants = []
        for mutate in (
            lambda d: d['roles'].pop('arc_qa'),
            lambda d: d['roles'].update(extra={'model': 'sonnet', 'effort': 'low'}),
            lambda d: d.update(version=True),
            lambda d: d.update(extra=1),
            lambda d: d.pop('preset'),
            lambda d: d.update(preset='fast'),
            lambda d: d['roles']['arc_qa'].pop('smart'),
            lambda d: d['roles']['arc_qa'].update(extra={}),
            lambda d: d['roles']['arc_qa']['economy'].update(effort='extreme'),
            lambda d: d['roles']['arc_qa']['economy'].update(model=2),
            lambda d: d['roles']['arc_qa']['economy'].update(model='bad\nmodel'),
            lambda d: d['roles']['arc_qa']['economy'].update(extra=1),
        ):
            data = copy.deepcopy(valid)
            mutate(data)
            variants.append(data)
        for data in variants:
            with self.subTest(data=data), self.assertRaises(module.ValidationError):
                module.validate_settings(data)
        custom = {f'arc_{role}': {'model': f'custom-{role}', 'effort': 'low'} for role in EXPECTED}
        selected = copy.deepcopy(valid)
        selected.update(version=2, preset='custom', custom=custom)
        before = copy.deepcopy(selected)
        self.assertEqual(module.validate_settings(selected), custom)
        self.assertEqual(selected, before)
        inactive = copy.deepcopy(selected); inactive['preset'] = 'balanced'
        self.assertEqual(module.validate_settings(inactive), module.validate_settings(valid))
        for active in ('custom', 'balanced'):
            for mutation in ('missing', 'extra', 'field'):
                invalid = copy.deepcopy(selected); invalid['preset'] = active
                if mutation == 'missing': invalid['custom'].pop('arc_tester')
                if mutation == 'extra': invalid['custom']['extra'] = {}
                if mutation == 'field': invalid['custom']['arc_tester']['effort'] = 'extreme'
                with self.subTest(active=active, mutation=mutation), self.assertRaises(module.ValidationError):
                    module.validate_settings(invalid)
        invalid = copy.deepcopy(selected); invalid.pop('custom')
        with self.assertRaises(module.ValidationError): module.validate_settings(invalid)
        legacy = copy.deepcopy(selected); legacy['version'] = 1
        with self.assertRaises(module.ValidationError): module.validate_settings(legacy)
        source = (ROOT / 'tests/fixtures/models-claude-v1.toml').read_text().replace('version = 1', 'version = 2').replace('preset = "balanced"', 'preset = "custom"')
        source += ''.join(f'\n[custom.{role}]\nmodel = "{values["model"]}"\neffort = "low"\n' for role, values in custom.items())
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp).resolve() / 'models.toml'; path.write_text(source)
            self.assertEqual(module.load_settings(path), custom)
            self.assertEqual(path.read_text(), source)

    def test_frontmatter_names_and_required_fields(self):
        module = self.module()
        for role in EXPECTED:
            fields = module.parse_profile((PAYLOAD / f'agents/arc-{role}.md').read_bytes())
            self.assertEqual(fields['name'], 'arc-' + role)
            self.assertTrue(fields['description'])
            self.assertEqual(set(fields), {'name', 'description', 'model', 'effort', 'tools'})

    def test_renderer_preserves_body_and_non_model_fields(self):
        module = self.module()
        original = (PAYLOAD / 'agents/arc-implementer.md').read_bytes().replace(b'\n', b'\r\n')
        updated = module.render_profile(original, {'model': 'opus', 'effort': 'xhigh'})
        self.assertEqual(updated, original.replace(b'model: sonnet', b'model: opus').replace(b'effort: medium', b'effort: xhigh'))

    def test_renderer_rejects_duplicate_or_malformed_frontmatter(self):
        module = self.module()
        original = (PAYLOAD / 'agents/arc-implementer.md').read_bytes()
        for bad in (original.replace(b'model: sonnet', b'model: sonnet\nmodel: haiku'), original[4:], original.replace(b'---\n\n', b'\n\n', 1), original.replace(b'model: sonnet', b'model: [sonnet]'), original.replace(b'  - Bash', b'  - Agent')):
            with self.subTest(bad=bad), self.assertRaises(module.ValidationError):
                module.render_profile(bad, {'model': 'opus', 'effort': 'high'})

    def test_apply_models_check_and_dry_run_do_not_write(self):
        self.module()
        with tempfile.TemporaryDirectory() as tmp:
            target = self.fixture(Path(tmp).resolve())
            config = target / 'skills/arc/models.toml'
            config.write_text(config.read_text().replace('model = "opus"', 'model = "haiku"'))
            before = {p.relative_to(target): (p.read_bytes(), p.stat().st_mode) for p in target.rglob('*') if p.is_file()}
            for flag in ('--check', '--dry-run'):
                result = subprocess.run([sys.executable, '-B', str(target / 'skills/arc/scripts/apply-models.py'), flag], capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(before, {p.relative_to(target): (p.read_bytes(), p.stat().st_mode) for p in target.rglob('*') if p.is_file()})

    def test_all_presets_apply_check_dry_run_and_invalid_input_without_writes(self):
        import tomllib
        module = self.module()
        source = (ROOT / 'tests/fixtures/models-claude-v1.toml').read_text()
        config = tomllib.loads(source)
        with tempfile.TemporaryDirectory() as tmp:
            target = self.fixture(Path(tmp).resolve())
            config_path = target / 'skills/arc/models.toml'
            command = [sys.executable, '-B', str(target / 'skills/arc/scripts/apply-models.py'), '--config', str(config_path), '--agents-dir', str(target / 'agents')]
            snapshot = lambda: {p.relative_to(target): p.read_bytes() for p in target.rglob('*') if p.is_file()}
            for preset in ('economy', 'balanced', 'smart'):
                config_path.write_text(source.replace('preset = "balanced"', f'preset = "{preset}"'))
                before = snapshot()
                result = subprocess.run(command + ['--dry-run'], capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(snapshot(), before)
                result = subprocess.run(command, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(subprocess.run(command + ['--check'], capture_output=True).returncode, 0)
                for role, variants in config['roles'].items():
                    profile = module.parse_profile((target / 'agents' / (current_role(role).replace('_', '-') + '.md')).read_bytes())
                    self.assertEqual({key: profile[key] for key in variants[preset]}, variants[preset])
            legacy = 'version = 1\n' + '\n'.join(f'[roles.{role}]\nmodel = "sonnet"\neffort = "low"' for role in config['roles'])
            for text in (legacy, source.replace('model = "haiku"', 'model = 3', 1)):
                config_path.write_text(text)
                before = snapshot()
                for flags in ([], ['--check'], ['--dry-run']):
                    result = subprocess.run(command + flags, capture_output=True, text=True)
                    self.assertEqual(result.returncode, 2, result.stderr)
                    self.assertEqual(snapshot(), before)

    def test_apply_models_updates_only_claude_profiles(self):
        self.module()
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp).resolve()
            target = self.fixture(base)
            codex = base / '.codex/agents/untouched.toml'
            codex.parent.mkdir(parents=True)
            codex.write_bytes(b'unchanged')
            config = target / 'skills/arc/models.toml'
            config.write_text(config.read_text().replace('model = "opus"', 'model = "haiku"'))
            profiles = list((target / 'agents').glob('*.md'))
            for profile in profiles:
                profile.chmod(0o640)
            result = subprocess.run([sys.executable, '-B', str(target / 'skills/arc/scripts/apply-models.py'), '--config', str(config), '--agents-dir', str(target / 'agents')], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(codex.read_bytes(), b'unchanged')
            for profile in profiles:
                self.assertEqual(profile.stat().st_mode & 0o777, 0o640)
                self.assertIn(b'model: haiku', profile.read_bytes())

    def test_apply_models_failure_restores_all_prior_profiles(self):
        module = self.module()
        with tempfile.TemporaryDirectory() as tmp:
            target = self.fixture(Path(tmp).resolve())
            settings = module.load_settings(target / 'skills/arc/models.toml')
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
        required = {'coordination', 'planning', 'handoff', 'handoff-prep', 'commit', 'verification', 'git-recovery', 'arc-visual-companion', 'limits', 'worktree-creation'}
        self.assertEqual({p.stem for p in (PAYLOAD / 'skill/references').glob('*.md')}, required)
        # Policy semantics are independently reviewed by Tester; executable tool authority is checked above.

    def test_ceo_direct_path_requires_pre_edit_approval_and_handoff_gates(self):
        # Static regression for the reviewed approval contract; does not prove agent compliance.
        handoff = _effective('claude', 'handoff')  # the definition lives once in handoff.md
        self.assertIn('## Orchestrator direct path for small tasks', handoff)
        planning = ' '.join(_effective('claude', 'planning').split())
        self.assertNotIn('Edit only approved files', planning)

    def test_claude_shared_policy_sections_and_contracts_are_complete(self):
        # Approved structural contract only; independent review assesses meaning and runtime compliance.
        # The sections are split by trigger: SKILL.md keeps terms, the reference index and pointers; references hold the rest.
        def sections(*parts):
            return re.findall(r'^## (.+)$', (PAYLOAD.joinpath(*parts)).read_text(), re.M)
        self.assertEqual(sections('skill/SKILL.md'), [
            'Shared terms', 'Mandatory task references', 'Ownership', 'Risk-scaled execution', 'Common handoff gate',
        ])
        self.assertEqual(sections('skill/references/coordination.md'), [
            'Ownership', 'Instruction and execution adapter', 'Token discipline and handoffs', 'Models',
        ])
        self.assertEqual(sections('skill/references/handoff.md'), [
            'Task readiness at every assignment', 'Choice lifetime and reuse', 'Authorization continuity',
            'Common handoff gate', 'Implementer TDD and constraints', 'Orchestrator direct path for small tasks',
        ])
        self.assertIn('Risk-scaled execution', sections('skill/references/verification.md'))
        self.assertIn('Dependency and readiness record', sections('skill/references/planning.md'))
        terms = _effective('claude', 'core')
        for term in ('Preservation rule', 'Explicit choice', 'Stop and inspect', 'Evidence verdict'):
            self.assertIn(f'**{term}:**', terms)
        handoff = _effective('claude', 'handoff')
        self.assertIn('RED-GREEN', handoff)
        self.assertNotIn('current checkout only', ' '.join(handoff.split()))

    def test_claude_native_adapter_matches_shipped_profiles_and_scripts(self):
        skill = _effective('claude', 'core')
        # Native names, settings keys and adapter boundaries live in coordination.md and handoff.md; SKILL.md indexes them.
        core = _effective('claude', 'coordination')
        handoff = _effective('claude', 'handoff')
        module = self.module()
        settings = module.load_settings(PAYLOAD / 'skill/models.toml')
        for role in EXPECTED:
            fields = module.parse_profile((PAYLOAD / f'agents/arc-{role}.md').read_bytes())
            self.assertIn('`' + fields['name'] + '`', core)
            self.assertIn('`arc_' + role + '`', core)
            self.assertIn('arc_' + role, settings)
        links = set(re.findall(r'references/([a-z-]+)\.md', skill))
        self.assertEqual(links, {'coordination', 'planning', 'handoff', 'handoff-prep', 'commit', 'verification', 'git-recovery', 'arc-visual-companion', 'limits', 'handoff-worktree'})
        for name in links:
            self.assertTrue((PAYLOAD / f'skill/references/{name}.md').is_file() or
                            (ROOT / f'shared/skill/references/{name}.md').is_file())
        self.assertTrue((PAYLOAD / 'skill/scripts/apply-models.py').is_file())
        result = subprocess.run([sys.executable, '-B', str(PAYLOAD / 'skill/scripts/apply-models.py'), '--help'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        for flag in ('--config', '--agents-dir', '--check', '--dry-run'):
            self.assertIn(flag, result.stdout)
        self.assertNotIn('current checkout only', ' '.join(handoff.split()))
        for option in ('current checkout', 'new task branch', 'managed worktree/task branch'):
            self.assertIn(option, handoff)

    def test_claude_skill_markdown_has_no_foreign_platform_contracts(self):
        forbidden = r'(?i)codex|spawn_agent|wait_agent|fork_turns|reasoning_effort|mcp__codex|/\.codex/'
        for path in list((PAYLOAD / 'skill').rglob('*.md')) + list((PAYLOAD / 'agents').glob('*.md')):
            if 'superpowers' in path.relative_to(PAYLOAD).parts:
                continue
            with self.subTest(path=path.relative_to(PAYLOAD)):
                self.assertNotRegex(read_payload_text(path), forbidden)

    def read_claude(self, *parts):
        return read_payload_text(PAYLOAD.joinpath(*parts))

    def korean_policy(self, text):
        # Check the installed language contract, not an obsolete literal in templates.
        result = subprocess.run(
            ["node", "--input-type=module", "-e",
             "import {renderLanguagePolicy} from './lib/installer/language.mjs';"
             "import fs from 'node:fs';process.stdout.write(renderLanguagePolicy(fs.readFileSync(0),'ko'));"],
            input=text, capture_output=True, text=True, cwd=ROOT)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout

    def assert_all(self, text, needles):
        text = ' '.join(text.split())
        for needle in needles:
            with self.subTest(needle=needle):
                self.assertIn(' '.join(needle.split()), text)

    def test_claude_verification_ui_criterion_and_reviewer_rules(self):
        text = self.read_claude('skill/references/verification.md')
        self.assert_all(text, (
            '### UI browser acceptance checks', 'Tester-created processes',
            '### Criterion evidence and finding handoff',
            'follow-up task',
            '<git-common-dir>/arc/review/<slug>.diff',
        ))

    def test_claude_agent_profiles_hold_acceptance_contracts(self):
        tester = self.read_claude('agents/arc-tester.md')
        self.assertIn('`UI browser acceptance checks`', tester)
        self.assertIn('environment blocked', tester)
        rev = self.read_claude('agents/arc-reviewer.md')
        self.assertIn('limits', rev)
        plan = self.korean_policy(self.read_claude('agents/arc-planner.md'))
        self.assertIn('Korean', plan)
        sc = self.read_claude('agents/arc-scouter.md')
        self.assertIn('cleanup', sc)
        for role in ('scouter', 'planner', 'reviewer'):
            body = self.read_claude(f'agents/arc-{role}.md')
            with self.subTest(role=role):
                self.assertNotIn('Expected TDD RED', body)
                self.assertNotIn('do not poll long commands', body)

    def test_claude_planning_reference_ports_paths_and_gates(self):
        text = self.read_claude('skill/references/planning.md')
        self.assert_all(text, ('Spike', 'Bounded', 'Architectural', 'plan depth',
                               'Complete planning-document set',
                               'current checkout', '## Top-level plan tasks'))
        self.assertRegex(text, r'(?m)^## Evidence refresh\b')
        self.assertNotIn('Edit only approved files', text)

    def test_claude_handoff_prep_branch_naming_and_collisions(self):
        text = self.read_claude('skill/references/handoff-prep.md')
        self.assert_all(text, ('<type>/<short-kebab-case-topic>', '| feat/ |', '| fix/ |', '| chore/ |', '| revert/ |',
                               'lookup error', 'explicit approval'))
        self.assertNotIn('`-2`', ' '.join(text.split()))

    def test_claude_handoff_record_slug_fallback_and_reuse(self):
        text = self.read_claude('skill/references/handoff.md')
        self.assert_all(text, ('spec/task slug',
                               'Choice lifetime'))

    def test_claude_commit_and_recovery_rules(self):
        commit = self.read_claude('skill/references/commit.md')
        self.assert_all(commit, ('follow-up task',
                                 '<type>(<scope>): <description>', '{{ARC_COMMIT_LANGUAGE_POLICY}}'))
        self.assertNotIn('when repository instructions require', commit)
        prep = self.read_claude('skill/references/handoff-prep.md')
        self.assert_all(prep, ('before the first commit', 'temporary message'))
        plan = self.read_claude('skill/references/planning.md')
        self.assert_all(plan, ('leave runtime compliance unverified',))
        rec = self.read_claude('skill/references/git-recovery.md')
        self.assert_all(rec, ('never broad Git access', 'concurrent Git activity'))
        rec = self.read_claude('skill/references/git-recovery.md')
        self.assert_all(rec, ('Branch collision', 'Git metadata write denial', 'lock',
                              'exact command', 'inline'))

    def test_claude_skill_brief_requires_review_artifact_external_skills_and_waits(self):
        core = self.read_claude('skill/references/coordination.md')  # briefing and wait rules live here; SKILL.md indexes them
        self.assert_all(core, ('<git-common-dir>/arc/review/<slug>.diff',
                               'run_in_background',
                               'not a reason to poll'))
        for stale in ('single blocking wait', 'yield', 'repeated short waits'):
            for relative in ('skill/SKILL.md', 'skill/references/coordination.md'):
                with self.subTest(stale=stale, relative=relative):
                    self.assertNotIn(stale, self.read_claude(relative))

    def test_manifest_covers_immutable_claude_payload(self):
        entries = dict(line.split('  ', 1)[::-1] for line in (ROOT / 'MANIFEST.sha256').read_text().splitlines())
        files = [p for p in PAYLOAD.rglob('*') if p.is_file() and '__pycache__' not in p.parts]
        self.assertTrue(files, 'Claude payload must be shipped')
        for path in files:
            relative = path.relative_to(ROOT).as_posix()
            if relative == 'claude/skill/models.toml' or relative.startswith('claude/skill/references/superpowers/'):
                self.assertNotIn(relative, entries)
            else:
                self.assertEqual(entries.get(relative), hashlib.sha256(path.read_bytes()).hexdigest())


class RoleHardeningTests(unittest.TestCase):
    """Static checks of the written role-boundary contract; not runtime agent compliance."""

    def text(self, *parts):
        return ' '.join(read_payload_text(PAYLOAD.joinpath(*parts)).split())

    def test_role_gate_planner_only_and_ceo_skill_ban(self):
        gate = next(p for p in _effective('claude', 'core').split('\n\n') if p.startswith(('Role gate:', '**Role gate:**')))
        self.assertLessEqual(len(re.findall(r'[.!?](?:\s|$)', ' '.join(gate.split()))), 5)

    def test_tester_freshness_and_no_contradictory_substitution(self):
        core = self.text('skill/SKILL.md')
        self.assertNotIn('Tester or Orchestrator focused checks', core)
        verification = self.text('skill/references/verification.md')  # the risk table and freshness rule live here
        self.assertNotIn('Tester or Orchestrator focused checks', verification)
        coordination = self.text('skill/references/coordination.md')

    def test_restart_brief_rule_lives_in_handoff_only(self):
        core = self.text('skill/SKILL.md')
        self.assertNotIn('delta-only restart brief', core)
        self.assertNotIn('unchanged` means unchanged relative to', core)
        handoff = self.text('skill/references/handoff.md')
        self.assertEqual(handoff.count('full record inline'), 1)
        # git-recovery.md only points to the handoff.md fallback; it holds no delta/unchanged restart rule of its own.
        recovery = self.text('skill/references/git-recovery.md')
        self.assertNotIn('full record inline', recovery)
        self.assertNotIn('no delta', recovery)
        self.assertNotIn('Restart brief:', recovery)

    def test_dangling_references_removed_and_terms_defined(self):
        core = self.text('skill/SKILL.md')
        for gone in ('branch protection', 'Implementer repair limits', 'existing CEO depth judgment', 'short design', 'Tester or Orchestrator'):
            with self.subTest(gone=gone):
                self.assertNotIn(gone, core)
        self.assertNotIn('Significant risk includes', self.text('skill/references/planning.md'))

    def test_tester_browser_instructions_match_allowlist(self):
        for text in (self.text('skill/references/verification.md'), self.text('agents/arc-tester.md')):
            self.assertNotIn('allowlisted browser tools', text)
            self.assertNotIn('Use browsers', text)

    def test_ownership_and_prep_consistency(self):
        self.assertNotIn('detached HEAD is acceptable', self.text('skill/references/handoff-prep.md'))


class Task4FollowUpTests(unittest.TestCase):
    """Static wording checks for the Task 4 reviewer findings."""

    def text(self, *parts):
        return ' '.join((PAYLOAD.joinpath(*parts)).read_text().split())

    def test_failed_check_or_tester_finding_routes_to_implementer(self):
        core = self.text('skill/SKILL.md')
        self.assertNotIn('or corrects them within an eligible Orchestrator direct path', core)
        handoff = ' '.join(_effective('claude', 'handoff').split())
        self.assertNotIn('or corrects them within an eligible Orchestrator direct path', handoff)

    def test_corrections_go_to_implementer_and_bounded_uses_scope_record(self):
        core = self.text('skill/SKILL.md')
        self.assertNotIn('Recheck any approved-file correction', core)

    def test_plan_depth_judgment_defined_once(self):
        planning = self.text('skill/references/planning.md')
        self.assertEqual(planning.count('means this assessment'), 1)



class InternalSuperpowersContractTests(unittest.TestCase):
    def test_local_superpowers_contract(self):
        core = ' '.join(_effective('claude', 'coordination').split())  # "Local superpowers references"
        for name in ('brainstorming', 'writing-plans', 'test-driven-development'):
            self.assertIn(f'references/superpowers/{name}/SKILL.md', core)
        for role, names in [('planner', ('brainstorming', 'writing-plans')), ('implementer', ('test-driven-development',))]:
            text = read_payload_text(PAYLOAD / f'agents/arc-{role}.md')
            for name in names:
                self.assertIn(f'references/superpowers/{name}/SKILL.md', text)

if __name__ == '__main__':
    unittest.main()


class WorkspaceBeforeDocumentsTests(unittest.TestCase):
    # Approved T1 structural checks; consuming-agent runtime compliance is unverified.
    def text(self, name):
        return " ".join(_effective("claude", name).lower().split())

    def test_normal_order_selects_and_prepares_before_formal_drafting(self):
        planning = _effective_section("claude", "planning", "## Complete planning-document set")
        order = next((line.lower() for line in planning.splitlines() if line.startswith("Order:")), "")
        self.assertTrue(order)
        cursor = 0
        for marker in ("initial design approval", "explicit target and source snapshot", "first required draft/self-review",
                       "focused preparation gate", "actual preparation/comparison", "save/review/revision",
                       "architectural: dependent plan drafting/save/review/revision", "spec↔plan consistency check",
                       "one combined approval; bounded: plan approval", "full set",
                       "verify existing commits/batch remaining approvals", "final git"):
            found = order.find(marker, cursor)
            self.assertGreaterEqual(found, cursor, marker)
            cursor = found + len(marker)

    def test_choice_request_uses_planned_documents_and_verified_target(self):
        text = _effective("claude", "handoff-prep")
        request_heading = "### Execution-target request gate"
        mutation_heading = "### Git mutation evidence gate"
        self.assertIn(request_heading, text)
        self.assertIn(mutation_heading, text)
        gate = text.split(request_heading, 1)[1].split(mutation_heading, 1)[0]
        option_fields = re.search(r"(?m)^- .+(?:\n- .+)*", gate)
        self.assertIsNotNone(option_fields)
        presentation = " ".join(gate[:option_fields.end()].lower().split())
        for phrase in ("dependencies and order", "verified absolute workspace", "repository", "base head"):
            self.assertIn(phrase, presentation)

    def test_phase_specific_git_and_batch_gates(self):
        text = self.text("handoff-prep")
        for field in ("index", "ownership"):
            self.assertIn(field, text)

    def test_platform_targets_and_legacy_transfer_boundaries(self):
        text = self.text("handoff-prep")
        self.assertIn("current checkout", text)
        self.assertIn("task branch", text)
        self.assertNotIn("arc-managed worktree execution is unsupported", text)
        self.assertNotIn("current checkout only", text)
        for option in ("current checkout", "new task branch", "new managed worktree and task branch", ".claude/worktrees/<name>"):
            self.assertIn(option, text)
        self.assertNotIn("mcp__codex_app__create_worktree", text)

    def test_document_omissions_and_implementer_gate_remain(self):
        text = self.text("planning")
        for phrase in ("spike", "bounded", "non-behavior"):
            self.assertIn(phrase, text)
        self.assertIn("## Implementer TDD and constraints", _effective("claude", "handoff").splitlines())

class ClaudeStrictRoleTests(unittest.TestCase):
    def test_unsupported_model_key_is_rejected(self):
        import tomllib
        module = ClaudePayloadTests().module()
        config = tomllib.loads((ROOT / 'tests/fixtures/models-claude-v1.toml').read_text())
        config['roles']['arc_unknown'] = config['roles'].pop('arc_implementer')
        before = copy.deepcopy(config)
        with self.assertRaises(module.ValidationError):
            module.validate_settings(config)
        self.assertEqual(config, before)


class FastDirectProofTests(unittest.TestCase):
    def test_fast_gate_retains_security_and_public_interface_exclusions(self):
        text = _effective('claude', 'handoff')
        section = text.split('### Fast gate', 1)[1].split('### Instruction fingerprint', 1)[0]
        self.assertRegex(section, r'(?s)F1.*F2.*F3.*F4.*F5.*F6.*F7.*F8')


class QASchemaEvidenceTests(unittest.TestCase):
    def test_qa_e2_claude_v1_v2_v3_load_serialize_and_apply_matrix(self):
        from tests.qa_model_cases import exercise_python_model_matrix
        module_path = PAYLOAD / 'skill/scripts/model_config.py'
        spec = importlib.util.spec_from_file_location('qa_claude_model_config', module_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        exercise_python_model_matrix(self, module, 'claude')
