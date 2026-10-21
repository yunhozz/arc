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

ROOT = Path(__file__).resolve().parents[1]
PAYLOAD = ROOT / 'claude'
EXPECTED = {
    'scouter': ('sonnet', 'medium', ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch']),
    'planner': ('sonnet', 'high', ['Read', 'Grep', 'Glob']),
    'coder': ('sonnet', 'medium', ['Read', 'Grep', 'Glob', 'Bash', 'Write', 'Edit']),
    'qa': ('sonnet', 'medium', ['Read', 'Grep', 'Glob', 'Bash']),
    'reviewer': ('sonnet', 'high', ['Read', 'Grep', 'Glob']),
}
# models.toml selects the "balanced" preset; shipped profiles keep their own defaults until apply-models renders the preset.
BALANCED_PRESET = {
    'scouter': ('haiku', 'high'),
    'planner': ('sonnet', 'high'),
    'coder': ('sonnet', 'high'),
    'qa': ('haiku', 'max'),
    'reviewer': ('sonnet', 'high'),
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

    def test_generated_single_guard_profiles_parse_render_apply(self):
        module = self.module()
        settings = {f'arc_{role}': {'model': 'opus', 'effort': 'high'} for role in EXPECTED}
        with tempfile.TemporaryDirectory() as tmp:
            agents = Path(tmp).resolve() / 'agents'
            shutil.copytree(PAYLOAD / 'agents', agents)
            for role in EXPECTED:
                original = (agents / f'arc-{role}.md').read_bytes()
                try:
                    fields = module.parse_profile(original)
                except module.ValidationError as exc:
                    self.fail(f'generated single guard profile must parse: {exc}')
                self.assertEqual(fields['name'], f'arc-{role}')
                self.assertEqual(module.parse_profile(module.render_profile(original, settings[f'arc_{role}']))['model'], 'opus')
            before = {p: p.read_bytes() for p in agents.iterdir()}
            self.assertTrue(module.apply_models(settings, agents, check=True))
            self.assertTrue(module.apply_models(settings, agents, dry_run=True))
            self.assertEqual(before, {p: p.read_bytes() for p in agents.iterdir()})
            module.apply_models(settings, agents)
            self.assertEqual(module.apply_models(settings, agents, check=True), [])
            for profile in agents.iterdir():
                self.assertEqual(module.parse_profile(profile.read_bytes())['model'], 'opus')

    def test_hook_subset_preserves_unmanaged_data_and_rejects_managed_mutations(self):
        module = self.module()
        original = (PAYLOAD / 'agents/arc-coder.md').read_bytes()
        user = b'  PostToolUse:\n    - matcher: "Write|Edit"\n      hooks:\n        - type: command\n          command: "echo user"\n          onFailure: continue\n'
        enriched = original.replace(b'hooks:\n  PreToolUse:', b'extra: preserved\nhooks:\n' + user + b'  PreToolUse:', 1)
        for failure in (b'continue', b'block'):
            variant = enriched.replace(b'onFailure: continue', b'onFailure: ' + failure)
            for content in (variant, variant.replace(b'\n', b'\r\n')):
                with self.subTest(failure=failure, crlf=b'\r\n' in content):
                    try:
                        rendered = module.render_profile(content, {'model': 'opus', 'effort': 'high'})
                    except module.ValidationError as exc:
                        self.fail(f'supported unmanaged hooks must parse: {exc}')
                    self.assertEqual(rendered, content.replace(b'model: sonnet', b'model: opus').replace(b'effort: medium', b'effort: high'))
        import json
        custom = enriched.replace(b'command: "echo user"', b'command: ' + json.dumps("node -e \"Buffer.from('data')\"").encode())
        try:
            module.parse_profile(custom)
        except module.ValidationError as exc:
            self.fail(f'ordinary user Buffer command must remain data: {exc}')
        ordinary = "node -e \"eval(Buffer.from('Y29uc29sZS5sb2coMSk=','base64').toString('utf8'))\""
        custom_eval = enriched.replace(b'command: "echo user"', b'command: ' + json.dumps(ordinary).encode())
        for failure in (b'continue', b'block'):
            variant = custom_eval.replace(b'onFailure: continue', b'onFailure: ' + failure)
            for content in (variant, variant.replace(b'\n', b'\r\n')):
                with self.subTest(command=ordinary, failure=failure, crlf=b'\r\n' in content):
                    try:
                        module.parse_profile(content)
                        rendered = module.render_profile(content, {'model': 'opus', 'effort': 'high'})
                    except module.ValidationError as exc:
                        self.fail(f'ordinary eval Buffer command must remain data: {exc}')
                    self.assertEqual(rendered, content.replace(b'model: sonnet', b'model: opus').replace(b'effort: medium', b'effort: high'))
        start = original.index(b'    - matcher: Bash')
        end = original.index(b'          onFailure: block', start) + len(b'          onFailure: block\n')
        guard = original[start:end]
        mutations = [
            original[:end] + guard + original[end:],
            original.replace(b'  PreToolUse:', b'  PreToolUse:\n  PreToolUse:', 1),
            original.replace(b'hooks:\n', b'hooks:\nhooks:\n', 1),
            original.replace(b'onFailure: block', b'onFailure: continue'),
            original.replace(b'          onFailure: block\n', b''),
            original.replace(b'matcher: Bash', b'matcher: Read'),
            original.replace(b'type: command', b'type: prompt'),
            original.replace(b'node -e ', b'fake -e '),
        ]
        import base64
        import json
        command_line = next(line for line in original.splitlines() if line.startswith(b'          command: '))
        command = json.loads(command_line[19:])
        encoded = re.search(r'"([A-Za-z0-9+/]+={0,2})"$', command)[1]
        url = base64.b64decode(encoded).decode()
        for bad_url in (url.replace('/hooks/', '/wrong/'), url.replace('role-git-guard.mjs', 'runtime-gate.mjs')):
            forged = command.replace(encoded, base64.b64encode(bad_url.encode()).decode())
            mutations.append(original.replace(command_line, b'          command: ' + json.dumps(forged).encode()))
            # Keep the valid guard too: a forged extra entry must not pass as user data.
            mutations.append(original.replace(b'  PreToolUse:', b'  PreToolUse:\n' + guard.replace(command_line, b'          command: ' + json.dumps(forged).encode()), 1))
        bootstrap = re.search(r"Buffer.from\('([^']+)'", command)[1]
        forged = command.replace(bootstrap, base64.b64encode(b'console.log(1)').decode())
        mutations.append(original.replace(b'  PreToolUse:', b'  PreToolUse:\n' + guard.replace(command_line, b'          command: ' + json.dumps(forged).encode()), 1))
        for content in mutations:
            with self.subTest(content=content), self.assertRaises(module.ValidationError):
                module.parse_profile(content)

    def test_managed_hook_survives_model_render_and_rejects_other_yaml(self):
        module = self.module()
        content = (PAYLOAD / 'agents/arc-coder.md').read_bytes()
        fields = module.parse_profile(content)
        self.assertIn('hooks', fields)
        rendered = module.render_profile(content, {'model': 'opus', 'effort': 'high'})
        self.assertEqual(module.parse_profile(rendered)['hooks'], fields['hooks'])
        for old, new in ((b'matcher: Bash', b'matcher: Read'), (b'type: command', b'type: prompt')):
            with self.assertRaises(module.ValidationError):
                module.parse_profile(content.replace(old, new))

    def test_rejects_missing_extra_roles_and_invalid_settings(self):
        module = self.module()
        import tomllib
        valid = tomllib.loads((PAYLOAD / 'skill/models.toml').read_text())
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

    def test_frontmatter_names_and_required_fields(self):
        module = self.module()
        for role in EXPECTED:
            fields = module.parse_profile((PAYLOAD / f'agents/arc-{role}.md').read_bytes())
            self.assertEqual(fields['name'], 'arc-' + role)
            self.assertTrue(fields['description'])
            self.assertEqual(set(fields), {'name', 'description', 'model', 'effort', 'tools', 'hooks'})

    def test_renderer_preserves_body_and_non_model_fields(self):
        module = self.module()
        original = (PAYLOAD / 'agents/arc-coder.md').read_bytes().replace(b'\n', b'\r\n')
        updated = module.render_profile(original, {'model': 'opus', 'effort': 'xhigh'})
        self.assertEqual(updated, original.replace(b'model: sonnet', b'model: opus').replace(b'effort: medium', b'effort: xhigh'))

    def test_renderer_rejects_duplicate_or_malformed_frontmatter(self):
        module = self.module()
        original = (PAYLOAD / 'agents/arc-coder.md').read_bytes()
        for bad in (original.replace(b'model: sonnet', b'model: sonnet\nmodel: haiku'), original[4:], original.replace(b'---\n\n', b'\n\n', 1), original.replace(b'model: sonnet', b'model: [sonnet]'), original.replace(b'  - Bash', b'  - Agent')):
            with self.subTest(bad=bad), self.assertRaises(module.ValidationError):
                module.render_profile(bad, {'model': 'opus', 'effort': 'high'})

    def test_apply_models_check_and_dry_run_do_not_write(self):
        self.module()
        with tempfile.TemporaryDirectory() as tmp:
            target = self.fixture(Path(tmp).resolve())
            config = target / 'skills/arc/models.toml'
            config.write_text(config.read_text().replace('model = "sonnet"', 'model = "opus"'))
            before = {p.relative_to(target): (p.read_bytes(), p.stat().st_mode) for p in target.rglob('*') if p.is_file()}
            for flag in ('--check', '--dry-run'):
                result = subprocess.run([sys.executable, '-B', str(target / 'skills/arc/scripts/apply-models.py'), flag], capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(before, {p.relative_to(target): (p.read_bytes(), p.stat().st_mode) for p in target.rglob('*') if p.is_file()})

    def test_all_presets_apply_check_dry_run_and_invalid_input_without_writes(self):
        import tomllib
        module = self.module()
        source = (PAYLOAD / 'skill/models.toml').read_text()
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
                    profile = module.parse_profile((target / 'agents' / (role.replace('_', '-') + '.md')).read_bytes())
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
            config.write_text(config.read_text().replace('model = "sonnet"', 'model = "opus"'))
            profiles = list((target / 'agents').glob('*.md'))
            for profile in profiles:
                profile.chmod(0o640)
            result = subprocess.run([sys.executable, '-B', str(target / 'skills/arc/scripts/apply-models.py'), '--config', str(config), '--agents-dir', str(target / 'agents')], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(codex.read_bytes(), b'unchanged')
            for profile in profiles:
                self.assertEqual(profile.stat().st_mode & 0o777, 0o640)
                if profile.name not in ('arc-scouter.md', 'arc-qa.md'):
                    self.assertIn(b'model: opus', profile.read_bytes())

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
        required = {'coordination', 'planning', 'handoff', 'handoff-prep', 'commit', 'verification', 'git-recovery', 'visual-companion', 'limits'}
        self.assertEqual({p.stem for p in (PAYLOAD / 'skill/references').glob('*.md')}, required)
        # Policy semantics are independently reviewed by QA; executable tool authority is checked above.

    def test_ceo_direct_path_requires_pre_edit_approval_and_handoff_gates(self):
        # Static regression for the reviewed approval contract; does not prove agent compliance.
        handoff = (PAYLOAD / 'skill/references/handoff.md').read_text()  # the definition lives once in handoff.md
        self.assertIn('## Orchestrator direct path for small tasks', handoff)
        direct = handoff.split('## Orchestrator direct path for small tasks', 1)[1].split('\n## ', 1)[0]
        for clause in (
            r'Before editing.*scope record.*scope and files.*why every criterion holds.*acceptance criteria.*focused verification',
            r'authorization.*planning.*existing.*request.*no duplicate approval',
            r'Silence.*ambiguous.*approval of other work.*not approval',
            r'execution-target choice or valid reuse.*workspace and repository.*branch or detached HEAD.*HEAD.*staged/unstaged/untracked.*preservation and ownership.*unresolved failure or partial completion',
            r'only the approved files.*preserves.*edits',
            r'After editing.*changed files.*focused checks.*acceptance criterion.*evidence',
        ):
            self.assertRegex(' '.join(direct.split()), clause)
        planning = ' '.join((PAYLOAD / 'skill/references/planning.md').read_text().split())
        self.assertRegex(planning, r'direct path for small tasks is defined only in \[handoff\]\(handoff\.md#orchestrator-direct-path-for-small-tasks\)')
        self.assertNotIn('Edit only approved files', planning)

    def test_ceo_direct_path_excludes_every_significant_risk_trigger(self):
        # Reviewed policy structure only; runtime compliance requires separate evidence.
        # Triggers are defined once in verification.md; the direct path in handoff.md excludes them and planning.md points to them.
        text = ' '.join((PAYLOAD / 'skill/references/verification.md').read_text().split())
        for trigger in ('shared role/behavior contracts', 'shared state', 'lifecycle/integration order', 'security/permissions', 'data loss/migration', 'public interfaces', 'costly installation/deployment/rollback'):
            with self.subTest(trigger=trigger):
                self.assertIn(trigger, text)
        self.assertIn('Substantial behavior or contract changes are significant regardless of file count', text)
        self.assertIn('Unclear risk requires investigation or the higher flow', text)
        handoff = ' '.join((PAYLOAD / 'skill/references/handoff.md').read_text().split())
        self.assertRegex(handoff, r'Significant risk is defined in Risk-scaled execution and excludes')

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
            'Common handoff gate', 'Coder TDD and constraints', 'Orchestrator direct path for small tasks',
        ])
        self.assertIn('Risk-scaled execution', sections('skill/references/verification.md'))
        self.assertIn('Dependency and readiness record', sections('skill/references/planning.md'))
        texts = {name: ' '.join((PAYLOAD / 'skill' / name).read_text().split())
                 for name in ('SKILL.md', 'references/coordination.md', 'references/handoff.md',
                              'references/planning.md', 'references/commit.md', 'references/verification.md')}
        for name, clause in (
                ('references/coordination.md', 'fresh Coder for each top-level task'),
                ('references/coordination.md', 'After an approved plan or acceptance-criteria amendment'),
                ('SKILL.md', 'Preservation rule'), ('SKILL.md', 'Explicit choice'),
                ('SKILL.md', 'Stop and inspect'), ('SKILL.md', 'Evidence verdict'),
                ('references/planning.md', 'Record design and plan depth separately from verification risk'),
                ('references/handoff.md', 'RED-GREEN'),
                ('references/commit.md', 'Orchestrator creates the focused local commit without additional user commit approval'),
                ('references/planning.md', 'one approved top-level task is one focused commit'),
                ('references/verification.md', 'final full change once'),
                ('references/handoff.md', 'canonical handoff record'),
                ('references/coordination.md', 'Goal; Criteria'),
                ('references/handoff.md', 'current checkout only'),
                ('SKILL.md', 'execution-state investigation or cleanup')):
            with self.subTest(file=name, clause=clause):
                self.assertIn(clause, texts[name])

    def test_claude_native_adapter_matches_shipped_profiles_and_scripts(self):
        skill = (PAYLOAD / 'skill/SKILL.md').read_text()
        # Native names, settings keys and adapter boundaries live in coordination.md and handoff.md; SKILL.md indexes them.
        core = (PAYLOAD / 'skill/references/coordination.md').read_text()
        handoff = (PAYLOAD / 'skill/references/handoff.md').read_text()
        module = self.module()
        settings = module.load_settings(PAYLOAD / 'skill/models.toml')
        for role in EXPECTED:
            fields = module.parse_profile((PAYLOAD / f'agents/arc-{role}.md').read_bytes())
            self.assertIn('`' + fields['name'] + '`', core)
            self.assertIn('`arc_' + role + '`', core)
            self.assertIn('arc_' + role, settings)
        links = set(re.findall(r'references/([a-z-]+)\.md', skill))
        self.assertEqual(links, {'coordination', 'planning', 'handoff', 'handoff-prep', 'commit', 'verification', 'git-recovery', 'visual-companion', 'limits'})
        for name in links:
            self.assertTrue((PAYLOAD / f'skill/references/{name}.md').is_file())
        self.assertTrue((PAYLOAD / 'skill/scripts/apply-models.py').is_file())
        result = subprocess.run([sys.executable, '-B', str(PAYLOAD / 'skill/scripts/apply-models.py'), '--help'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        for flag in ('--config', '--agents-dir', '--check', '--dry-run'):
            self.assertIn(flag, result.stdout)
        self.assertIn('current checkout only', ' '.join(handoff.split()))
        for boundary in ('not a filesystem sandbox', 'Claude native subagent'):
            self.assertIn(boundary, ' '.join(core.split()))
        self.assertRegex(core, r'do(?:es)? not prove runtime.*provider support')

    def test_claude_skill_markdown_has_no_foreign_platform_contracts(self):
        forbidden = r'(?i)codex|spawn_agent|wait_agent|fork_turns|reasoning_effort|mcp__codex|/\.codex/'
        for path in list((PAYLOAD / 'skill').rglob('*.md')) + list((PAYLOAD / 'agents').glob('*.md')):
            if 'superpowers' in path.relative_to(PAYLOAD).parts:
                continue
            with self.subTest(path=path.relative_to(PAYLOAD)):
                self.assertNotRegex(path.read_text(), forbidden)

    def read_claude(self, *parts):
        return (PAYLOAD.joinpath(*parts)).read_text()

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
            '### UI browser acceptance checks', 'QA-created processes', 'cites this section with its path',
            'not proof', 'unavailable', '### Criterion evidence and finding handoff',
            'passed, failed, not run, or environment blocked', 'proven, unmet, or unverified',
            'PASS, if used, means only run status', 'Structural checks prove structure only',
            'source-inferred', 'execution-observed', 'never a plan-task acceptance prerequisite',
            'once on the final full change after all plan tasks', 'follow-up task',
            'Orchestrator decides when a Reviewer recheck is warranted',
            '<git-common-dir>/arc/review/<slug>.diff', 'changed-file list',
            'same slug as the handoff record', 'approved base HEAD recorded at handoff',
            'installed browser skill', 'existing approved test environment', 'exact limitation',
        ))

    def test_claude_agent_profiles_hold_acceptance_contracts(self):
        qa = self.read_claude('agents/arc-qa.md')
        self.assert_all(qa, ('UI browser acceptance checks', 'cites', 'unverified', 'environment blocked',
                             'proven, unmet, or unverified', 'only run status'))
        rev = self.read_claude('agents/arc-reviewer.md')
        self.assert_all(rev, ('source-inferred', 'execution-observed', 'criterion, expected behavior',
                              'after the required QA', 'diff artifact', 'limits'))
        plan = self.korean_policy(self.read_claude('agents/arc-planner.md'))
        self.assert_all(plan, ('Korean', 'ID and title', 'hold conditions', 'one focused implementation commit',
                               'never Reviewer as a per-task', 'single independent Reviewer', 'complete drafts'))
        sc = self.read_claude('agents/arc-scouter.md')
        self.assert_all(sc, ('live operational state', 'cleanup', 'Report mixed implementation work'))
        for role in ('scouter', 'planner', 'reviewer'):
            body = self.read_claude(f'agents/arc-{role}.md')
            with self.subTest(role=role):
                self.assertNotIn('Expected TDD RED', body)
                self.assertNotIn('do not poll long commands', body)

    def test_claude_planning_reference_ports_paths_and_gates(self):
        text = self.read_claude('skill/references/planning.md')
        self.assert_all(text, ('Spike', 'Bounded', 'Architectural', 'plan depth', 'must not substitute',
                               'Spec save', 'Plan save', 'Complete planning-document set', 'Normal order',
                               'current checkout', 'early spec commit', 'Evidence refresh', 'Top-level plan tasks',
                               'Orchestrator preserves that language when saving'))
        self.assertNotIn('Edit only approved files', text)

    def test_claude_handoff_prep_branch_naming_and_collisions(self):
        text = self.read_claude('skill/references/handoff-prep.md')
        self.assert_all(text, ('<type>/<short-kebab-case-topic>', '| feat/ |', '| fix/ |', '| chore/ |', '| revert/ |',
                               'never automatically substitute a suffix', 'present a new candidate for explicit approval',
                               'lookup error', 'missing branch', 'explicit approval'))
        self.assertNotIn('`-2`', ' '.join(text.split()))
        self.assertIn('A new collision suffix requires fresh user approval of the candidate',
                      ' '.join(self.read_claude('skill/references/git-recovery.md').split()))

    def test_claude_handoff_record_slug_fallback_and_reuse(self):
        text = self.read_claude('skill/references/handoff.md')
        self.assert_all(text, ('unique per plan', 'dated plan filename stem', 'spec/task slug',
                               'never overwrite another plan', 'after each accepted task commit',
                               'full record inline in every Coder brief', 'no delta', 'Choice lifetime',
                               'approved branch candidate'))

    def test_claude_commit_and_recovery_rules(self):
        commit = self.read_claude('skill/references/commit.md')
        self.assert_all(commit, ('Hold the task commit', 'no empty commit', 'existing commit', 'follow-up task',
                                 '<type>(<scope>): <description>', 'English description',
                                 'remaining final verification', 'hold/no-change/reuse reasons'))
        self.assertNotIn('when repository instructions require', commit)
        prep = self.read_claude('skill/references/handoff-prep.md')
        self.assert_all(prep, ('before the first commit', 'temporary message', 'uncommitted documents are not absent'))
        hand = self.read_claude('skill/references/handoff.md')
        self.assert_all(hand, ('before dependent drafting or preparation; reselection does not require document completion', 'never fall back automatically'))
        plan = self.read_claude('skill/references/planning.md')
        self.assert_all(plan, ('Administrative status updates must accurately describe actual progress',
                               'before Coder or a Orchestrator direct edit', 'regardless of locality, risk, or size',
                               'does not require written-spec approval; it requires valid execution-target choice and actual preparation',
                               'leave runtime compliance unverified', 'stops before edits dependent on new plans'))
        rec = self.read_claude('skill/references/git-recovery.md')
        self.assert_all(rec, ('never broad Git access', 'concurrent Git activity', 'remaining uncertainty'))
        rec = self.read_claude('skill/references/git-recovery.md')
        self.assert_all(rec, ('Branch collision', 'Git metadata write denial', 'lock', 'permission system',
                              'exact command', 'handoff record', 'inline'))

    def test_claude_skill_brief_requires_review_artifact_external_skills_and_waits(self):
        core = self.read_claude('skill/references/coordination.md')  # briefing and wait rules live here; SKILL.md indexes them
        self.assert_all(core, ('<git-common-dir>/arc/review/<slug>.diff', 'absolute path of each required local ARC reference',
                               'foreground Agent call', 'run_in_background', 'never sleep-poll',
                               'not a reason to poll', 'same slug as the handoff record'))
        self.assertIn('inline diff', self.read_claude('agents/arc-reviewer.md'))
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
        return ' '.join((PAYLOAD.joinpath(*parts)).read_text().split())

    def test_role_gate_planner_only_and_ceo_skill_ban(self):
        core = self.text('skill/SKILL.md')
        gate = next(p for p in (PAYLOAD / 'skill/SKILL.md').read_text().split('\n\n') if p.startswith('Role gate:'))
        gate = ' '.join(gate.split())
        self.assertLessEqual(len(re.findall(r'[.!?](?:\s|$)', gate)), 5)
        for needle in ('ONLY by Planner (`arc-planner`)', 'Orchestrator MUST NEVER author them',
                       'MUST NEVER invoke `brainstorming` or `writing-plans` through its own Skill tool',
                       'auto-triggers in Orchestrator context, Orchestrator stops and routes to Planner', "that skill's SKILL.md path",
                       'skip questions', 'never waives design or approval gates', 'returns questions to Orchestrator',
                       'FRESH Coder', 'FRESH QA'):
            with self.subTest(needle=needle):
                self.assertIn(' '.join(needle.split()), ' '.join(gate.split()))
        self.assertIn('Integrate means save, route, and obtain approval; never author', self.text('skill/references/planning.md'))
        self.assertIn('same-task rechecks may reuse', gate)
        self.assertIn('Coder and QA freshness follow the Role gate', self.text('skill/references/coordination.md'))

    def test_every_profile_has_stay_in_role_line(self):
        for role in EXPECTED:
            with self.subTest(role=role):
                body = self.text(f'agents/arc-{role}.md')
                self.assertRegex(body, r'Stay in your role: ONLY [^;]+; NEVER [^.]+\.')

    def test_qa_freshness_and_no_contradictory_substitution(self):
        core = self.text('skill/SKILL.md')
        self.assertNotIn('QA or Orchestrator focused checks', core)
        verification = self.text('skill/references/verification.md')  # the risk table and freshness rule live here
        self.assertRegex(verification, r'Ordinary and significant plan tasks.*FRESH QA')
        self.assertRegex(verification, r'small, low-risk tasks.*Orchestrator focused checks')
        self.assertNotIn('QA or Orchestrator focused checks', verification)
        self.assertIn('FRESH QA instance per task that needs QA', verification)

    def test_restart_brief_rule_lives_in_handoff_only(self):
        core = self.text('skill/SKILL.md')
        self.assertNotIn('delta-only restart brief', core)
        self.assertNotIn('unchanged` means unchanged relative to', core)
        handoff = self.text('skill/references/handoff.md')
        self.assertIn('Restart brief:', handoff)
        self.assertIn('`unchanged` means unchanged relative to the record file', handoff)
        self.assertEqual(handoff.count('full record inline'), 1)
        # git-recovery.md only points to the handoff.md fallback; it holds no delta/unchanged restart rule of its own.
        recovery = self.text('skill/references/git-recovery.md')
        self.assertIn('Use the inline-record fallback in [handoff.md](handoff.md)', recovery)
        self.assertNotIn('full record inline', recovery)
        self.assertNotIn('no delta', recovery)
        self.assertNotIn('Restart brief:', recovery)

    def test_dangling_references_removed_and_terms_defined(self):
        core = self.text('skill/SKILL.md')
        for gone in ('branch protection', 'Coder repair limits', 'existing CEO depth judgment', 'short design', 'QA or Orchestrator'):
            with self.subTest(gone=gone):
                self.assertNotIn(gone, core)
        handoff = (PAYLOAD / 'skill/references/handoff.md').read_text()
        direct = ' '.join(handoff.split('## Orchestrator direct path for small tasks', 1)[1].split('[ARC role policy: contract begin]', 1)[0].split())
        self.assertIn('scope record', direct)
        self.assertIn('not a brainstorming design', direct)
        self.assertIn('Significant risk is defined in Risk-scaled execution', direct)
        self.assertNotIn('Significant risk includes', self.text('skill/references/planning.md'))
        self.assertIn('simple, self-contained question', core)
        self.assertIn('and assigned dependent docs', self.text('skill/references/coordination.md'))

    def test_qa_browser_instructions_match_allowlist(self):
        for text in (self.text('skill/references/verification.md'), self.text('agents/arc-qa.md')):
            self.assertNotIn('allowlisted browser tools', text)
            self.assertNotIn('Use browsers', text)
        self.assertIn('through Bash only', self.text('skill/references/verification.md'))

    def test_ownership_and_prep_consistency(self):
        self.assertNotIn('detached HEAD is acceptable', self.text('skill/references/handoff-prep.md'))
        self.assertIn('Orchestrator performs read-only inspection of related processes and ACLs', self.text('skill/references/git-recovery.md'))
        self.assertIn('read the brief-cited `references/superpowers/test-driven-development/SKILL.md` path', self.text('agents/arc-coder.md'))
        self.assertIn('its named research skills', self.text('agents/arc-scouter.md'))


class Task4FollowUpTests(unittest.TestCase):
    """Static wording checks for the Task 4 reviewer findings."""

    def text(self, *parts):
        return ' '.join((PAYLOAD.joinpath(*parts)).read_text().split())

    def test_failed_check_or_qa_finding_routes_to_coder(self):
        core = self.text('skill/SKILL.md')
        self.assertNotIn('or corrects them within an eligible Orchestrator direct path', core)
        self.assertNotIn('or corrects them within an eligible Orchestrator direct path', self.text('skill/references/handoff.md'))
        self.assertRegex(self.text('skill/references/handoff.md'), r'failed focused check or a QA finding routes the correction to Coder')

    def test_design_drafts_are_not_standalone_document_writing(self):
        self.assertRegex(self.text('skill/SKILL.md'), r'Standalone document writing has no specialist auto-route\. Design, spec, plan, and brainstorming drafts are not standalone document writing \(see Role gate\)')

    def test_top_level_task_definition_in_role_gate(self):
        self.assertIn('top-level task (a plan task, or the whole request without a plan)', self.text('skill/SKILL.md'))

    def test_corrections_go_to_coder_and_bounded_uses_scope_record(self):
        core = self.text('skill/SKILL.md')
        self.assertNotIn('Recheck any approved-file correction', core)
        self.assertIn('routes the correction to Coder, and it is rechecked; Orchestrator does not self-correct',
                      self.text('skill/references/handoff.md'))
        self.assertIn('a direct edit uses only an approved scope record', self.text('skill/references/planning.md'))

    def test_plan_depth_judgment_defined_once(self):
        planning = self.text('skill/references/planning.md')
        self.assertEqual(planning.count('means this assessment'), 1)
        self.assertRegex(planning, r"3\. .*Orchestrator's recorded plan-depth judgment. means this assessment")



class InternalSuperpowersContractTests(unittest.TestCase):
    def test_local_superpowers_contract(self):
        core = ' '.join((PAYLOAD / 'skill/references/coordination.md').read_text().split())  # "Local superpowers references"
        for name in ('brainstorming', 'writing-plans', 'test-driven-development'):
            self.assertIn(f'references/superpowers/{name}/SKILL.md', core)
        self.assertIn('no global discovery, external Skill invocation, or automatic download', core)
        for role, names in [('planner', ('brainstorming', 'writing-plans')), ('coder', ('test-driven-development',))]:
            text = (PAYLOAD / f'agents/arc-{role}.md').read_text()
            for name in names:
                self.assertIn(f'references/superpowers/{name}/SKILL.md', text)

if __name__ == '__main__':
    unittest.main()


class WorkspaceBeforeDocumentsTests(unittest.TestCase):
    # Approved T1 structural checks; consuming-agent runtime compliance is unverified.
    def text(self, name):
        return " ".join((ROOT / "claude/skill" / ("SKILL.md" if name == "core" else f"references/{name}.md")).read_text().lower().split())

    def test_normal_order_selects_and_prepares_before_formal_drafting(self):
        planning = self.text("planning")
        self.assertIn("normal order:", planning)
        order = planning.split("normal order:", 1)[1].split("coder handoff", 1)[0]
        cursor = 0
        for marker in ("initial design approval", "execution-target choice", "target preparation and verification",
                       "formal spec drafting", "written-spec approval", "formal plan drafting", "individual plan approvals",
                       "complete applicable set", "batch docs commit", "final git verification"):
            found = order.find(marker, cursor)
            self.assertGreaterEqual(found, cursor, marker)
            cursor = found + len(marker)

    def test_choice_request_uses_planned_documents_and_verified_target(self):
        text = self.text("handoff-prep")
        request_heading = "### execution-target request gate"
        mutation_heading = "### git mutation evidence gate"
        self.assertIn(request_heading, text)
        self.assertIn(mutation_heading, text)
        gate = text.split(request_heading, 1)[1].split(mutation_heading, 1)[0]
        common = gate
        self.assertIn(
            "for every supported execution-target option, before obtaining the user's choice, "
            "present to the user:",
            common,
        )
        self.assertIn("obtain explicit choice", common)
        self.assertLess(common.index("present to the user:"), common.index("obtain explicit choice"))
        presentation = common.split("present to the user:", 1)[1].split("obtain explicit choice", 1)[0]
        for phrase in ("planned document list", "scope and coverage", "repository-relative expected paths",
                       "dependencies and order", "pending writing and approval status", "verified absolute workspace",
                       "repository", "current branch or detached head", "base head", "new-branch candidate",
                       "collision status", "staged/unstaged/untracked changes", "preservation and edit ownership"):
            self.assertIn(phrase, presentation)
        self.assertIn("does not require completed documents or individual approvals", gate)

    def test_formal_drafting_and_save_require_prepared_target(self):
        text = self.text("planning")
        for phrase in ("complete draft before saving", "initial design proposals", "before formal drafting and saving",
                       "actual absolute workspace", "choice and preparation evidence", "directly in the selected target"):
            self.assertIn(phrase, text)
        profile = " ".join((ROOT / "claude/agents/arc-planner.md").read_text().lower().split())
        for phrase in ("before formal drafting", "actual absolute workspace", "choice and preparation evidence", "document paths",
                       "initial design proposals"):
            self.assertIn(phrase, profile)
        self.assertIn("selection and initial target preparation happen before formal drafting", text)
        self.assertIn("execution-target choice and actual preparation precede formal drafting and saving", self.text("handoff"))

    def test_phase_specific_git_and_batch_gates(self):
        text = self.text("handoff-prep")
        for phrase in ("initial target preparation", "does not require the complete approved document set",
                       "staging and commit", "complete approved document set", "index", "ownership"):
            self.assertIn(phrase, text)
        self.assertIn("initial target preparation does not authorize coder", self.text("handoff"))

    def test_platform_targets_and_legacy_transfer_boundaries(self):
        text = self.text("handoff-prep")
        self.assertIn("current checkout", text)
        self.assertIn("task branch", text)
        self.assertIn("arc-managed worktree execution is unsupported", text)
        self.assertNotIn("mcp__codex_app__create_worktree", text)

    def test_choice_reuse_and_reselection_before_documents(self):
        text = self.text("handoff")
        for phrase in ("formal drafting", "authorized head", "fresh explicit choice", "before dependent drafting",
                       "does not require document completion"):
            self.assertIn(phrase, text)

    def test_document_omissions_and_coder_gate_remain(self):
        text = self.text("planning")
        for phrase in ("a required plan does not itself require a written spec", "spike", "bounded", "non-behavior",
                       "no new spec obligation"):
            self.assertIn(phrase, text)
        self.assertIn("coder", self.text("handoff"))
