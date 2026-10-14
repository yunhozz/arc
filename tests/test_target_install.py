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
