"""Selected-target CLI, isolation, and transaction contracts."""
import contextlib
import io
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import install as installer
from test_install import installer_payload, write_candidates, tree_state

ROOT = Path(__file__).resolve().parents[1]


class TargetInstallTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path(tempfile.gettempdir()).resolve())
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.user = self.base / 'user'
        self.user.mkdir()
        self.payload = installer_payload(self.base)

    def run_main(self, flags, env=None):
        output = io.StringIO()
        with patch.dict(os.environ, {'HOME': str(self.user)}, clear=True), patch.object(installer.Path, 'home', return_value=self.user), patch.object(installer, '__file__', str(self.payload / 'install.py')), contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            if env:
                os.environ.update(env)
            try:
                result = installer.main(flags)
            except SystemExit as exc:
                result = exc.code
        return result, output.getvalue()

    def acquire(self, work):
        work.mkdir(parents=True, exist_ok=True)
        return write_candidates(work / 'upstream', b'new')

    def home(self, target):
        return self.user / ('.' + target)

    def seed(self, target):
        home = self.home(target)
        write_candidates(home / 'skills', b'old')
        harness = home / 'skills/yunho-harness'
        harness.mkdir()
        (harness / 'keep.txt').write_bytes(b'previous harness')
        agents = home / 'agents'
        agents.mkdir()
        suffix = 'toml' if target == 'codex' else 'md'
        for role in ('scouter', 'planner', 'coder', 'qa', 'reviewer'):
            path = agents / f'harness-{role}.{suffix}'
            path.write_bytes(b'previous profile')
            path.chmod(0o640)
        global_file = home / ('AGENTS.md' if target == 'codex' else 'CLAUDE.md')
        global_file.write_bytes(b'# User\r\n\r\nkeep user bytes\r\n')
        global_file.chmod(0o640)
        (home / 'settings.json').write_bytes(b'{"keep":true}')
        (agents / 'unmanaged.md').write_bytes(b'user agent')
        return home

    def target_snapshot(self, home):
        return {p.relative_to(home).as_posix(): (p.read_bytes(), p.stat().st_mode & 0o777) for p in home.rglob('*') if p.is_file() and 'backups' not in p.relative_to(home).parts and not any(part.startswith('.yunho-harness-') for part in p.relative_to(home).parts)}

    def test_successful_install_reports_selected_runtime(self):
        for target, shown in (('codex', 'Codex'), ('claude', 'Claude Code')):
            with patch.object(installer, 'acquire_external_skills', side_effect=self.acquire):
                status, output = self.run_main(['--target', target])
            self.assertEqual(status, 0, output)
            self.assertIn(shown + '를 다시 시작하거나 새 세션을 열어 적용하세요.', output)

    def test_read_only_modes_pass_without_external_skills(self):
        for target in ('codex', 'claude'):
            for flag in ('--check', '--dry-run'):
                with self.subTest(target=target, flag=flag):
                    before = tree_state(self.user)
                    status, output = self.run_main(['--target', target, flag])
                    self.assertEqual(status, 0, output)
                    self.assertEqual(tree_state(self.user), before)

    def test_read_only_modes_still_reject_unsafe_external_target(self):
        for target in ('codex', 'claude'):
            for flag in ('--check', '--dry-run'):
                with self.subTest(target=target, flag=flag):
                    skills = self.home(target) / 'skills'
                    skills.mkdir(parents=True, exist_ok=True)
                    outside = self.base / 'outside'
                    outside.mkdir(exist_ok=True)
                    link = skills / 'brainstorming'
                    if link.is_symlink() or link.exists():
                        link.unlink()
                    link.symlink_to(outside)
                    status, output = self.run_main(['--target', target, flag])
                    self.assertEqual(status, 2, output)
                    link.unlink()

    def snapshot_swap_case(self, directory):
        import io
        import stat
        outside = self.base / 'outside'
        outside.mkdir()
        secret = outside / 'outside-secret.txt'
        secret.write_bytes(b'outside secret must never be read')
        victim = self.base / 'victim'
        if directory:
            victim.mkdir()
            (victim / 'inside.txt').write_bytes(b'allowed')
        else:
            victim.write_bytes(b'allowed')
        original_stat, original_lstat, original_open = os.stat, os.lstat, io.open
        secret_identity = (secret.stat().st_dev, secret.stat().st_ino)
        swapped = False
        outside_reads = []
        def swap_after_check(path, *args, **kwargs):
            nonlocal swapped
            info = original_stat(path, *args, **kwargs)
            if not swapped and Path(path).name == 'victim' and kwargs.get('follow_symlinks') is False:
                swapped = True
                victim.rename(self.base / 'previous-victim')
                victim.symlink_to(outside if directory else secret, target_is_directory=directory)
            return info
        def lstat_after_check(path, *args, **kwargs):
            kwargs['follow_symlinks'] = False
            return swap_after_check(path, *args, **kwargs)
        def observe_read(file, *args, **kwargs):
            stream = original_open(file, *args, **kwargs)
            info = os.fstat(stream.fileno())
            if (info.st_dev, info.st_ino) == secret_identity:
                outside_reads.append(file)
            return stream
        snapshot = ()
        with patch.object(installer.os, 'stat', side_effect=swap_after_check), patch.object(installer.os, 'lstat', side_effect=lstat_after_check), patch.object(io, 'open', side_effect=observe_read):
            try:
                snapshot = installer.snapshot_managed_targets((victim,))
            except (installer.InstallerError, OSError):
                pass  # Rejecting a raced target is the required safe outcome.
        self.assertTrue(swapped, 'test must reach the metadata/use boundary')
        self.assertEqual(outside_reads, [], 'snapshot opened an outside secret through a swapped link')
        self.assertNotIn('outside-secret.txt', repr(snapshot))
        import hashlib
        self.assertNotIn(hashlib.sha256(b'outside secret must never be read').digest(), [entry[-1] for entry in snapshot])

    def test_snapshot_file_swap_never_reads_outside_bytes(self):
        self.snapshot_swap_case(directory=False)

    def test_snapshot_directory_swap_never_traverses_outside_tree(self):
        self.snapshot_swap_case(directory=True)

    def test_target_spec_is_immutable_and_selects_exact_payload(self):
        from dataclasses import FrozenInstanceError
        with patch.object(installer.Path, 'home', return_value=self.user), patch.dict(os.environ, {}, clear=True):
            selected = installer.resolve_target('claude', self.payload)
        self.assertEqual(selected.payload_root, self.payload / 'claude')
        self.assertEqual(selected.home, self.home('claude'))
        self.assertEqual(set(selected.profile_files), {'harness-scouter.md', 'harness-planner.md', 'harness-coder.md', 'harness-qa.md', 'harness-reviewer.md'})
        with self.assertRaises(FrozenInstanceError):
            selected.name = 'codex'

    def test_claude_root_symlink_is_rejected_without_following(self):
        outside = self.base / 'outside'
        outside.mkdir()
        self.home('claude').symlink_to(outside)
        before = tree_state(outside)
        with patch.object(installer, 'acquire_external_skills', side_effect=AssertionError('acquisition')):
            for flag in ('--check', '--dry-run'):
                status, output = self.run_main(['--target', 'claude', flag])
                self.assertEqual(status, 2, output)
                self.assertIn('symlink', output)
        self.assertEqual(tree_state(outside), before)

    def seed_claude_links(self):
        roots = write_candidates(self.home('codex') / 'skills', b'codex user bytes')
        skills = self.home('claude') / 'skills'
        skills.mkdir(parents=True)
        links = {}
        for index, (name, source) in enumerate(roots.items()):
            text = str(source) if index == 0 else os.path.relpath(source, skills)
            (skills / name).symlink_to(text)
            links[name] = text
        return links

    def test_claude_skill_links_convert_to_independent_upstream_copies(self):
        links = self.seed_claude_links()
        before = tree_state(self.home('codex'))
        with patch.object(installer, 'acquire_external_skills', side_effect=self.acquire):
            status, output = self.run_main(['--target', 'claude'])
        self.assertEqual(status, 0, output)
        for name, text in links.items():
            installed = self.home('claude') / 'skills' / name
            self.assertFalse(installed.is_symlink())
            self.assertEqual((installed / 'SKILL.md').read_bytes(), b'new:SKILL.md')
            backup = next((self.home('claude') / 'backups').glob('*/skills/' + name))
            self.assertTrue(backup.is_symlink())
            self.assertEqual(os.readlink(backup), text)
        self.assertEqual(tree_state(self.home('codex')), before)

    def test_claude_skill_links_reject_unsafe_targets_before_acquisition(self):
        self.seed_claude_links()
        victim = self.home('claude') / 'skills/brainstorming'
        outside = self.base / 'outside'
        outside.mkdir()
        (outside / 'sentinel').write_bytes(b'keep')
        canonical = self.home('codex') / 'skills/brainstorming'
        for case in ('outside', 'wrong-name', 'dangling', 'cycle', 'file', 'codex-root', 'claude-parent'):
            with self.subTest(case=case):
                victim.unlink()
                target = canonical
                if case == 'outside': target = outside
                if case == 'wrong-name': target = canonical.parent / 'writing-plans'
                if case == 'dangling': target = self.base / 'missing'
                if case == 'cycle': target = victim
                if case == 'file':
                    canonical.rename(canonical.with_name('saved'))
                    canonical.write_bytes(b'file')
                if case == 'codex-root':
                    canonical.rename(canonical.with_name('saved'))
                    canonical.symlink_to(outside)
                victim.symlink_to(target)
                if case == 'claude-parent':
                    victim.parent.rename(victim.parent.with_name('saved-skills'))
                    victim.parent.symlink_to(outside)
                before = tree_state(self.user), tree_state(outside)
                with patch.object(installer, 'acquire_external_skills', side_effect=AssertionError('acquisition')):
                    status, output = self.run_main(['--target', 'claude'])
                self.assertEqual(status, 2, output)
                self.assertEqual((tree_state(self.user), tree_state(outside)), before)
                if case == 'claude-parent':
                    victim.parent.unlink()
                    victim.parent.with_name('saved-skills').rename(victim.parent)
                if case in ('file', 'codex-root'):
                    canonical.unlink()
                    canonical.with_name('saved').rename(canonical)

    def test_claude_skill_links_reject_components_hidden_by_parent_traversal(self):
        self.seed_claude_links()
        victim = self.home('claude') / 'skills/brainstorming'
        canonical = self.home('codex') / 'skills/brainstorming'
        intermediate = canonical.parent / 'intermediate'
        intermediate.symlink_to(canonical, target_is_directory=True)
        for component in ('missing', 'intermediate'):
            with self.subTest(component=component):
                victim.unlink()
                victim.symlink_to(str(canonical.parent / component) + '/../brainstorming')
                before = tree_state(self.user)
                with self.assertRaises(installer.InstallerError):
                    installer.external_write_targets(
                        self.home('claude'), self.user,
                        include_shared=False, allow_claude_skill_links=True,
                    )
                self.assertEqual(tree_state(self.user), before)

    def test_claude_skill_links_changed_during_acquisition_abort(self):
        self.seed_claude_links()
        victim = self.home('claude') / 'skills/brainstorming'
        text = os.readlink(victim)
        codex_before = tree_state(self.home('codex'))
        for case in ('retarget', 'unlink', 'directory', 'same-link'):
            with self.subTest(case=case):
                if os.path.lexists(victim):
                    installer.remove_path(victim)
                victim.symlink_to(text)
                changed = []
                def acquire(work):
                    acquired = self.acquire(work)
                    victim.unlink()
                    if case == 'retarget': victim.symlink_to(self.base / 'missing')
                    if case == 'directory':
                        victim.mkdir()
                        (victim / 'user').write_bytes(b'new user data')
                    if case == 'same-link': victim.symlink_to(text)
                    changed.append(tree_state(victim))
                    return acquired
                with patch.object(installer, 'acquire_external_skills', side_effect=acquire), patch.object(installer, '_transactional_install', side_effect=AssertionError('transaction')):
                    status, output = self.run_main(['--target', 'claude'])
                self.assertEqual(status, 2, output)
                self.assertEqual(tree_state(victim), changed[0])
                self.assertEqual(tree_state(self.home('codex')), codex_before)

    def test_claude_skill_link_readonly_modes_and_conversion_output(self):
        self.seed_claude_links()
        for flag in ('--check', '--dry-run'):
            before = tree_state(self.base)
            with patch.object(installer, 'acquire_external_skills', side_effect=AssertionError('acquisition')), patch.object(installer, '_transactional_install', side_effect=AssertionError('transaction')), patch.object(installer, 'create_stage_area', side_effect=AssertionError('stage')):
                status, output = self.run_main(['--target', 'claude', flag])
            self.assertEqual(status, 0, output)
            self.assertEqual(tree_state(self.base), before)
            if flag == '--dry-run':
                self.assertIn('independent upstream directory', output)

    def test_claude_skill_link_backup_and_rollback_never_follow_target(self):
        self.seed('claude')
        shutil.rmtree(self.home('claude') / 'skills')
        links = self.seed_claude_links()
        before = self.target_snapshot(self.home('claude'))
        codex_before = tree_state(self.home('codex'))
        replace = installer._replace_claude_skill_leaf
        copytree = shutil.copytree
        def copy(source, *args, **kwargs):
            self.assertFalse(Path(source).is_symlink(), 'backup followed a link root')
            return copytree(source, *args, **kwargs)
        def fail(source, destination):
            if source.name == 'brainstorming' and source.parent.name.startswith('.yunho-harness-external-'):
                raise OSError('injected install failure after original link move')
            return replace(source, destination)
        with patch.object(installer, 'acquire_external_skills', side_effect=self.acquire), patch.object(installer.shutil, 'copytree', side_effect=copy), patch.object(installer, '_replace_claude_skill_leaf', side_effect=fail):
            status, output = self.run_main(['--target', 'claude'])
        self.assertEqual(status, 2, output)
        self.assertIn('prior files were restored', output)
        self.assertEqual(self.target_snapshot(self.home('claude')), before)
        self.assertEqual(tree_state(self.home('codex')), codex_before)
        for name, text in links.items():
            self.assertEqual(os.readlink(self.home('claude') / 'skills' / name), text)

    def test_claude_skill_link_rollback_failure_preserves_recovery(self):
        links = self.seed_claude_links()
        replace = installer._replace_claude_skill_leaf
        def fail(source, destination):
            if source.parent.name.startswith('.yunho-harness-external-'):
                raise OSError('injected install or rollback failure')
            return replace(source, destination)
        with patch.object(installer, 'acquire_external_skills', side_effect=self.acquire), patch.object(installer, '_replace_claude_skill_leaf', side_effect=fail):
            status, output = self.run_main(['--target', 'claude'])
        self.assertEqual(status, 2, output)
        self.assertIn('recovery data preserved at:', output)
        recovery = next((self.home('claude') / 'skills').glob('.yunho-harness-external-*/previous-brainstorming'))
        self.assertTrue(os.path.lexists(recovery))
        self.assertEqual(os.readlink(recovery), links['brainstorming'])
        self.assertIn(str(recovery), output)

    def test_claude_link_profile_failure_restores_original_entries(self):
        self.seed('claude')
        shutil.rmtree(self.home('claude') / 'skills')
        links = self.seed_claude_links()
        before = self.target_snapshot(self.home('claude'))
        original = os.replace
        def fail(source, destination, **kwargs):
            if Path(source).name == 'harness-coder.md' and Path(source).parent.name.startswith('.yunho-harness-profiles-'):
                raise OSError('injected later profile failure')
            return original(source, destination, **kwargs)
        with patch.object(installer, 'acquire_external_skills', side_effect=self.acquire), patch.object(installer.os, 'replace', side_effect=fail):
            status, output = self.run_main(['--target', 'claude'])
        self.assertEqual(status, 2, output)
        self.assertIn('prior files were restored', output)
        self.assertEqual(self.target_snapshot(self.home('claude')), before)
        for name, text in links.items():
            self.assertEqual(os.readlink(self.home('claude') / 'skills' / name), text)

    def test_claude_post_install_snapshot_failure_preserves_unverified_target(self):
        links = self.seed_claude_links()
        victim = self.home('claude') / 'skills/brainstorming'
        codex_before = tree_state(self.home('codex'))
        snapshot = installer.snapshot_managed_targets
        installed_state = []
        def fail_once(paths):
            result = snapshot(paths)
            if paths == (victim,) and not victim.is_symlink() and not installed_state:
                installed_state.append(tree_state(victim))
                raise installer.InstallerError('injected post-install snapshot failure')
            return result
        with patch.object(installer, 'acquire_external_skills', side_effect=self.acquire), patch.object(installer, 'snapshot_managed_targets', side_effect=fail_once):
            status, output = self.run_main(['--target', 'claude'])
        self.assertEqual(status, 2, output)
        self.assertIn('rollback failed:', output)
        self.assertIn('recovery data preserved at:', output)
        self.assertEqual(tree_state(victim), installed_state[0])
        self.assertEqual((victim / 'SKILL.md').read_bytes(), b'new:SKILL.md')
        recovery = next(victim.parent.glob('.yunho-harness-external-*/previous-brainstorming'))
        self.assertTrue(recovery.is_absolute())
        self.assertTrue(os.path.lexists(recovery))
        self.assertEqual(os.readlink(recovery), links['brainstorming'])
        self.assertIn(str(recovery), output)
        self.assertEqual(tree_state(self.home('codex')), codex_before)

    def test_claude_leaf_move_rejects_swapped_intermediate_parent(self):
        outside = self.base / 'outside'
        outside.mkdir()
        (outside / 'sentinel').write_bytes(b'keep')
        parent = self.base / 'parent'
        parent.mkdir()
        (parent / 'leaf').symlink_to('../outside')
        parent.rename(self.base / 'previous-parent')
        parent.symlink_to(outside)
        before = tree_state(outside)
        with self.assertRaises(OSError):
            installer._replace_claude_skill_leaf(parent / 'leaf', self.base / 'destination')
        self.assertEqual(tree_state(outside), before)
        self.assertTrue((self.base / 'previous-parent/leaf').is_symlink())

    def test_target_errors_precede_manifest_acquisition_and_writes(self):
        for flags in ([], ['--target', 'other'], ['--target','codex','--target','codex'], ['--target=claude','--target','codex'], ['--target=claude','--target=claude']):
            with self.subTest(flags=flags), patch.object(installer, 'verify_manifest', side_effect=AssertionError('manifest called')), patch.object(installer, 'acquire_external_skills', side_effect=AssertionError('acquisition called')), patch.object(installer, 'perform_install', side_effect=AssertionError('write called')):
                before = tree_state(self.user)
                status, output = self.run_main(flags)
                self.assertEqual(status, 2, output)
                self.assertEqual(tree_state(self.user), before)

    def test_help_works_without_target(self):
        with patch.object(installer, 'verify_manifest', side_effect=AssertionError('manifest called')):
            status, output = self.run_main(['--help'])
        self.assertEqual(status, 0, output)
        self.assertIn('--target', output)

    def test_install_command_preserves_target_and_other_arguments(self):
        launcher = self.base / 'bin'
        launcher.mkdir()
        fake = launcher / 'python3'
        fake.write_text('#!/bin/sh\nprintf "%s\\n" "$@"\n')
        fake.chmod(0o755)
        for target in ('codex', 'claude'):
            flags = ['--target', target, '--dry-run', '--skip-global']
            result = subprocess.run(['/bin/bash', str(ROOT / 'install.command'), *flags], env={'PATH': str(launcher) + ':/usr/bin:/bin'}, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.splitlines(), [str(ROOT / 'install.py'), *flags])

    def test_claude_config_dir_default_equivalent_and_rejected_values(self):
        write_candidates(self.home('claude') / 'skills')
        for value in (str(self.home('claude')), '~/.claude', str(self.user / 'scratch/../.claude')):
            status, output = self.run_main(['--target','claude','--check'], {'CLAUDE_CONFIG_DIR': value})
            self.assertEqual(status, 0, output)
        for value in ('', '   ', '.claude', str(self.user / '.other')):
            with patch.object(installer, 'verify_manifest', side_effect=AssertionError('manifest called')):
                before = tree_state(self.user)
                status, output = self.run_main(['--target','claude','--check'], {'CLAUDE_CONFIG_DIR': value})
            self.assertEqual(status, 2, output)
            self.assertIn('CLAUDE_CONFIG_DIR', output)
            self.assertEqual(tree_state(self.user), before)

    def test_target_ignores_other_platform_environment(self):
        for target, variable in (('claude','CODEX_HOME'), ('codex','CLAUDE_CONFIG_DIR')):
            write_candidates(self.home(target) / 'skills')
            status, output = self.run_main(['--target',target,'--check'], {variable: ''})
            self.assertEqual(status, 0, output)

    def test_both_dry_runs_show_target_neutral_temporary_acquisition(self):
        for target in ('codex', 'claude'):
            write_candidates(self.home(target) / 'skills')
            before = tree_state(self.base)
            status, output = self.run_main(['--target', target, '--dry-run'])
            self.assertEqual(status, 0, output)
            command = next(line for line in output.splitlines() if line.startswith('Would acquire with:'))
            self.assertIn('--agent universal ', command)
            self.assertNotIn('--agent codex', command)
            self.assertNotIn('--agent claude', command)
            self.assertEqual(tree_state(self.base), before)

    def test_read_only_modes_spawn_nothing_and_change_nothing(self):
        for target in ('codex','claude'):
            write_candidates(self.home(target) / 'skills')
            for flag in ('--check','--dry-run'):
                before = tree_state(self.base)
                with patch.object(installer.subprocess, 'Popen', side_effect=AssertionError('spawn')), patch.object(installer, 'acquire_external_skills', side_effect=AssertionError('acquisition')), patch.object(installer, '_transactional_install', side_effect=AssertionError('transaction')), patch.object(installer, 'create_stage_area', side_effect=AssertionError('stage')):
                    status, output = self.run_main(['--target',target,flag])
                self.assertEqual(status, 0, output)
                self.assertEqual(tree_state(self.base), before)

    def test_target_install_never_inspects_other_platform_candidates(self):
        for target in ('codex','claude'):
            other = self.home('claude' if target == 'codex' else 'codex')
            other.mkdir(exist_ok=True)
            (other / 'skills').symlink_to(self.base / 'missing')
            if target == 'claude':
                (self.user / '.agents').symlink_to(self.base / 'missing-shared')
            before = tree_state(other)
            with patch.object(installer, 'acquire_external_skills', side_effect=self.acquire):
                status, output = self.run_main(['--target',target])
            self.assertEqual(status, 0, output)
            self.assertEqual(tree_state(other), before)
            shutil.rmtree(other)
            shutil.rmtree(self.home(target))
            if (self.user / '.agents').is_symlink():
                (self.user / '.agents').unlink()

    def test_claude_global_block_preserves_user_bytes_and_is_idempotent(self):
        home = self.seed('claude')
        before = (home / 'CLAUDE.md').read_bytes()
        with patch.object(installer, 'acquire_external_skills', side_effect=self.acquire):
            status, output = self.run_main(['--target','claude'])
            self.assertEqual(status, 0, output)
            first = (home / 'CLAUDE.md').read_bytes()
            self.assertTrue(first.startswith(before))
            self.assertEqual(first.count(installer.GLOBAL_BEGIN.encode()), 1)
            status, output = self.run_main(['--target','claude'])
        self.assertEqual(status, 0, output)
        self.assertEqual((home / 'CLAUDE.md').read_bytes(), first)
        self.assertEqual((home / 'settings.json').read_bytes(), b'{"keep":true}')
        self.assertFalse((home / 'AGENTS.md').exists())
        self.assertFalse((home / 'config.toml').exists())

    def test_skip_global_leaves_claude_global_files_untouched(self):
        home = self.seed('claude')
        for name in ('CLAUDE.md','AGENTS.md','config.toml'):
            (home / name).write_bytes(b'\xff user bytes')
        before = {name: (home / name).read_bytes() for name in ('CLAUDE.md','AGENTS.md','config.toml','settings.json')}
        with patch.object(installer, 'acquire_external_skills', side_effect=self.acquire):
            status, output = self.run_main(['--target','claude','--skip-global'])
        self.assertEqual(status, 0, output)
        self.assertEqual({name: (home / name).read_bytes() for name in before}, before)

    def test_claude_acquisition_change_detection_stops_before_replacement(self):
        home = self.seed('claude')
        before = self.target_snapshot(home)
        def mutate(work):
            result = self.acquire(work)
            (home / 'CLAUDE.md').write_bytes(b'changed during acquisition')
            return result
        with patch.object(installer, 'acquire_external_skills', side_effect=mutate), patch.object(installer, '_transactional_install', side_effect=AssertionError('transaction started')):
            status, output = self.run_main(['--target','claude'])
        self.assertEqual(status, 2, output)
        self.assertIn('changed during acquisition', output)
        after = self.target_snapshot(home)
        before['CLAUDE.md'] = (b'changed during acquisition', before['CLAUDE.md'][1])
        self.assertEqual(after, before)

    def test_managed_content_changes_during_acquisition_stop_before_replacement(self):
        for target in ('codex', 'claude'):
            home = self.seed(target)
            suffix = 'toml' if target == 'codex' else 'md'
            for relative in ('skills/writing-plans/SKILL.md', f'agents/harness-coder.{suffix}', 'skills/yunho-harness/keep.txt'):
                path = home / relative
                previous = path.read_bytes()
                def mutate(work):
                    acquired = self.acquire(work)
                    path.write_bytes(b'concurrent user edit')
                    return acquired
                with self.subTest(target=target, relative=relative), patch.object(installer, 'acquire_external_skills', side_effect=mutate), patch.object(installer, '_transactional_install', side_effect=AssertionError('replacement attempted after edit')):
                    status, output = self.run_main(['--target', target])
                    self.assertEqual(status, 2, output)
                    self.assertIn('changed during acquisition', output)
                    self.assertEqual(path.read_bytes(), b'concurrent user edit')
                path.write_bytes(previous)
            shutil.rmtree(home)

    def test_each_replacement_failure_rolls_back_selected_target(self):
        for target in ('codex','claude'):
            home = self.seed(target)
            before = self.target_snapshot(home)
            suffix = 'toml' if target == 'codex' else 'md'
            names = ['brainstorming','writing-plans','test-driven-development','yunho-harness'] + [f'harness-{role}.{suffix}' for role in ('scouter','planner','coder','qa','reviewer')] + (['AGENTS.md','config.toml'] if target == 'codex' else ['CLAUDE.md'])
            for name in names:
                injected = False
                real = os.replace
                def fail(src, dst):
                    nonlocal injected
                    src, dst = Path(src), Path(dst)
                    if not injected and dst.name == name and src.name == name and src.parent.name.startswith('.yunho-harness-'):
                        injected = True
                        raise OSError('injected selected replacement failure')
                    return real(src, dst)
                with self.subTest(target=target, name=name), patch.object(installer, 'acquire_external_skills', side_effect=self.acquire), patch.object(installer.os, 'replace', side_effect=fail):
                    status, output = self.run_main(['--target',target])
                    self.assertTrue(injected, output)
                    self.assertEqual(status, 2, output)
                    self.assertEqual(self.target_snapshot(home), before)
                    self.assertTrue(list((home / 'backups').glob('*')))
                    self.assertFalse(list(home.rglob('.yunho-harness-*')))
            shutil.rmtree(home)

    def test_rollback_failure_retains_recovery_and_reports_absolute_paths(self):
        for target in ('codex','claude'):
            home = self.seed(target)
            real = os.replace
            failed = False
            recovery = []
            def fail(src, dst):
                nonlocal failed
                src, dst = Path(src), Path(dst)
                if not failed and dst.name.startswith('harness-planner.') and src.name == dst.name:
                    failed = True
                    raise OSError('injected install failure')
                if failed and src.name == 'previous-writing-plans':
                    recovery.append(src)
                    raise OSError('injected rollback failure')
                return real(src, dst)
            with patch.object(installer, 'acquire_external_skills', side_effect=self.acquire), patch.object(installer.os, 'replace', side_effect=fail):
                status, output = self.run_main(['--target',target])
            self.assertEqual(status, 2, output)
            self.assertTrue(recovery, output)
            self.assertTrue(recovery[0].is_absolute())
            self.assertTrue(recovery[0].exists())
            self.assertEqual((recovery[0] / 'SKILL.md').read_bytes(), b'old:SKILL.md')
            self.assertIn(str(recovery[0]), output)
            self.assertIn('rollback failed', output)
            shutil.rmtree(home)


if __name__ == '__main__':
    unittest.main()
