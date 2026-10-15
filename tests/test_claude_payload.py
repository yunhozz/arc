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
    'scouter': ('haiku', 'high', ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch']),
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

    def test_ceo_direct_path_requires_pre_edit_approval_and_handoff_gates(self):
        # Static regression for the reviewed approval contract; does not prove agent compliance.
        core = (PAYLOAD / 'skill/SKILL.md').read_text()
        self.assertIn('## CEO direct path for small tasks', core)
        direct = core.split('## CEO direct path for small tasks', 1)[1].split('\n## ', 1)[0]
        for clause in (
            r'Before editing.*short design.*scope and files.*why every criterion holds.*acceptance criteria.*focused verification',
            r'presents.*user.*obtains explicit approval.*before the first edit',
            r'Silence.*ambiguous.*approval of other work.*not approval',
            r'execution-target choice or valid reuse.*workspace and repository.*branch or detached HEAD.*HEAD.*staged/unstaged/untracked.*preservation and ownership.*unresolved failure or partial completion',
            r'only the approved files.*preserves.*edits',
            r'After editing.*changed files.*focused checks.*acceptance criterion.*evidence',
        ):
            self.assertRegex(' '.join(direct.split()), clause)
        planning = ' '.join((PAYLOAD / 'skill/references/planning.md').read_text().split())
        self.assertRegex(planning, r'direct path.*defined only in SKILL\.md')
        self.assertNotIn('Edit only approved files', planning)

    def test_ceo_direct_path_excludes_every_significant_risk_trigger(self):
        # Reviewed policy structure only; runtime compliance requires separate evidence.
        for relative in ('SKILL.md', 'references/planning.md'):
            text = ' '.join((PAYLOAD / 'skill' / relative).read_text().split())
            with self.subTest(relative=relative):
                for trigger in ('shared role/behavior contracts', 'shared state', 'lifecycle/integration order', 'security/permissions', 'data loss/migration', 'public interfaces', 'costly installation/deployment/rollback'):
                    self.assertIn(trigger, text)
                self.assertRegex(text, r'Significant risk.*excludes?')
                self.assertIn('Substantial behavior or contract changes are significant regardless of file count', text)
                self.assertIn('Unclear risk requires investigation or the higher flow', text)

    def test_claude_shared_policy_sections_and_contracts_are_complete(self):
        # Approved structural contract only; independent review assesses meaning and runtime compliance.
        core = (PAYLOAD / 'skill/SKILL.md').read_text()
        sections = re.findall(r'^## (.+)$', core, re.M)
        self.assertEqual(sections, [
            'Ownership', 'Instruction and execution adapter', 'Shared terms',
            'Mandatory task references', 'Common handoff gate', 'Coder TDD and constraints',
            'Risk-scaled execution', 'CEO direct path for small tasks',
            'Automatic commit after plan-task acceptance', 'Token discipline and handoffs', 'Models',
        ])
        for clause in ('fresh Coder for each top-level task', 'After an approved plan or acceptance-criteria amendment',
                       'Preservation rule', 'Explicit choice', 'Stop and inspect', 'Evidence verdict',
                       'Design and plan depth are independent of verification risk', 'RED-GREEN',
                       'one focused local commit', 'final full change once', 'canonical handoff record',
                       'Goal; Criteria', 'current checkout only', 'execution-state investigation or cleanup'):
            with self.subTest(clause=clause):
                self.assertIn(clause, ' '.join(core.split()))

    def test_claude_native_adapter_matches_shipped_profiles_and_scripts(self):
        core = (PAYLOAD / 'skill/SKILL.md').read_text()
        module = self.module()
        settings = module.load_settings(PAYLOAD / 'skill/models.toml')
        for role in EXPECTED:
            fields = module.parse_profile((PAYLOAD / f'agents/harness-{role}.md').read_bytes())
            self.assertIn('`' + fields['name'] + '`', core)
            self.assertIn('`harness_' + role + '`', core)
            self.assertIn('harness_' + role, settings)
        links = set(re.findall(r'references/([a-z-]+)\.md', core))
        self.assertEqual(links, {'planning', 'handoff', 'handoff-prep', 'commit', 'verification', 'git-recovery', 'visual-companion'})
        for name in links:
            self.assertTrue((PAYLOAD / f'skill/references/{name}.md').is_file())
        self.assertIn('python3 ~/.claude/skills/yunho-harness/scripts/apply-models.py', core)
        self.assertEqual(set(re.findall(r'`(--[a-z-]+)`', core)), {'--config', '--agents-dir', '--check', '--dry-run'})
        result = subprocess.run([sys.executable, '-B', str(PAYLOAD / 'skill/scripts/apply-models.py'), '--help'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        for flag in ('--config', '--agents-dir', '--check', '--dry-run'):
            self.assertIn(flag, result.stdout)
        for boundary in ('current checkout only', 'not a filesystem sandbox', 'does not prove runtime', 'Claude native subagent'):
            self.assertIn(boundary, core)

    def test_claude_skill_markdown_has_no_foreign_platform_contracts(self):
        forbidden = r'(?i)codex|spawn_agent|wait_agent|fork_turns|reasoning_effort|mcp__codex|/\.codex/'
        for path in list((PAYLOAD / 'skill').rglob('*.md')) + list((PAYLOAD / 'agents').glob('*.md')):
            with self.subTest(path=path.relative_to(PAYLOAD)):
                self.assertNotRegex(path.read_text(), forbidden)

    def read_claude(self, *parts):
        return (PAYLOAD.joinpath(*parts)).read_text()

    def assert_all(self, text, needles):
        for needle in needles:
            with self.subTest(needle=needle):
                self.assertIn(needle, text)

    def test_claude_verification_ui_criterion_and_reviewer_rules(self):
        text = self.read_claude('skill/references/verification.md')
        self.assert_all(text, (
            '### UI browser acceptance checks', 'QA-created processes', 'cites this section with its path',
            'not proof', 'unavailable', '### Criterion evidence and finding handoff',
            'passed, failed, not run, or environment blocked', 'proven, unmet, or unverified',
            'PASS, if used, means only run status', 'Structural checks prove structure only',
            'source-inferred', 'execution-observed', 'never a plan-task acceptance prerequisite',
            'once on the final full change after all plan tasks', 'follow-up task',
            'CEO decides when a Reviewer recheck is warranted',
            '<git-common-dir>/yunho-harness/review/<slug>.diff', 'changed-file list',
            'same slug as the handoff record', 'approved base HEAD recorded at handoff',
            'installed browser skill', 'existing approved test environment', 'exact limitation',
        ))

    def test_claude_agent_profiles_hold_acceptance_contracts(self):
        qa = self.read_claude('agents/harness-qa.md')
        self.assert_all(qa, ('UI browser acceptance checks', 'cites', 'unverified', 'environment blocked',
                             'proven, unmet, or unverified', 'only run status'))
        rev = self.read_claude('agents/harness-reviewer.md')
        self.assert_all(rev, ('source-inferred', 'execution-observed', 'criterion, expected behavior',
                              'after the required QA', 'diff artifact', 'limits'))
        plan = self.read_claude('agents/harness-planner.md')
        self.assert_all(plan, ('Korean', 'ID and title', 'hold conditions', 'one focused implementation commit',
                               'never Reviewer as a per-task', 'single independent Reviewer', 'complete drafts'))
        sc = self.read_claude('agents/harness-scouter.md')
        self.assert_all(sc, ('live operational state', 'cleanup', 'Report mixed implementation work'))
        for role in ('scouter', 'planner', 'reviewer'):
            body = self.read_claude(f'agents/harness-{role}.md')
            with self.subTest(role=role):
                self.assertNotIn('Expected TDD RED', body)
                self.assertNotIn('do not poll long commands', body)

    def test_claude_planning_reference_ports_paths_and_gates(self):
        text = self.read_claude('skill/references/planning.md')
        self.assert_all(text, ('Spike', 'Bounded', 'Architectural', 'plan depth', 'must not substitute',
                               'Spec save', 'Plan save', 'Complete planning-document set', 'Normal order',
                               'current checkout', 'early spec commit', 'Evidence refresh', 'Top-level plan tasks',
                               'Korean'))
        self.assertNotIn('Edit only approved files', text)

    def test_claude_handoff_prep_branch_naming_and_collisions(self):
        text = self.read_claude('skill/references/handoff-prep.md')
        self.assert_all(text, ('<type>/<short-kebab-case-topic>', '| feat/ |', '| fix/ |', '| chore/ |', '| revert/ |',
                               '`-2`', '`-3`', 'lookup error', 'missing branch', 'explicit approval'))

    def test_claude_handoff_record_slug_fallback_and_reuse(self):
        text = self.read_claude('skill/references/handoff.md')
        self.assert_all(text, ('unique per plan', 'dated plan filename stem', 'spec/task slug',
                               'never overwrite another plan', 'after each accepted task commit',
                               'full record inline in every Coder brief', 'no delta', 'Choice lifetime',
                               'approved branch candidate'))

    def test_claude_commit_and_recovery_rules(self):
        commit = self.read_claude('skill/references/commit.md')
        self.assert_all(commit, ('Hold the task commit', 'no empty commit', 'existing commit', 'follow-up task',
                                 '<type>(<scope>): <description>', 'Korean description',
                                 'remaining final verification', 'hold/no-change/reuse reasons'))
        self.assertNotIn('when repository instructions require', commit)
        prep = self.read_claude('skill/references/handoff-prep.md')
        self.assert_all(prep, ('before the first commit', 'temporary message', 'uncommitted documents are not absent'))
        hand = self.read_claude('skill/references/handoff.md')
        self.assert_all(hand, ('after applicable approvals and document completeness', 'never fall back automatically'))
        plan = self.read_claude('skill/references/planning.md')
        self.assert_all(plan, ('Administrative status updates must accurately describe actual progress',
                               'before Coder or a CEO direct edit', 'regardless of locality, risk, or size',
                               'does not require written-spec approval or execution-target choice',
                               'leave runtime compliance unverified', 'stops before edits dependent on new plans'))
        rec = self.read_claude('skill/references/git-recovery.md')
        self.assert_all(rec, ('never broad Git access', 'concurrent Git activity', 'remaining uncertainty'))
        rec = self.read_claude('skill/references/git-recovery.md')
        self.assert_all(rec, ('Branch collision', 'Git metadata write denial', 'lock', 'permission system',
                              'exact command', 'handoff record', 'inline'))

    def test_claude_skill_brief_requires_review_artifact_external_skills_and_waits(self):
        core = self.read_claude('skill/SKILL.md')
        self.assert_all(core, ('<git-common-dir>/yunho-harness/review/<slug>.diff', 'absolute path of each required external skill',
                               'foreground Agent call', 'run_in_background', 'never sleep-poll',
                               'not a reason to poll', 'same slug as the handoff record'))
        self.assertIn('inline diff', self.read_claude('agents/harness-reviewer.md'))
        for stale in ('single blocking wait', 'yield', 'repeated short waits'):
            with self.subTest(stale=stale):
                self.assertNotIn(stale, core)

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
