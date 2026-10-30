"""Strict Claude ARC settings, frontmatter rendering and transactional updates."""
from __future__ import annotations

import os
from pathlib import Path
import re
import stat
import tempfile
import tomllib

ROLE_FILES = {f'arc_{role}': f'arc-{role}.md' for role in ('scouter', 'planner', 'implementer', 'qa', 'reviewer')}
ROLE_TOOLS = {
    'scouter': ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch'],
    'planner': ['Read', 'Grep', 'Glob'],
    'implementer': ['Read', 'Grep', 'Glob', 'Bash', 'Write', 'Edit'],
    'qa': ['Read', 'Grep', 'Glob', 'Bash'],
    'reviewer': ['Read', 'Grep', 'Glob'],
}
EFFORTS = {'low', 'medium', 'high', 'xhigh', 'max'}
MODEL = re.compile(r'[A-Za-z0-9][A-Za-z0-9._:/@+\-]*\Z')


class ValidationError(ValueError):
    """Invalid local settings, profile or target path."""


PRESETS = ('economy', 'balanced', 'smart')


def _validate_role(settings: dict, name: str) -> dict:
    if not isinstance(settings, dict) or set(settings) != {'model', 'effort'}:
        raise ValidationError(f'{name}: require model and effort only')
    model, effort = settings['model'], settings['effort']
    if not isinstance(model, str) or MODEL.fullmatch(model) is None:
        raise ValidationError(f'{name}: model must be a nonempty plain model identifier')
    if not isinstance(effort, str) or effort not in EFFORTS:
        raise ValidationError(f'{name}: unsupported effort')
    return dict(settings)


def validate_settings(data: dict) -> dict:
    if not isinstance(data, dict) or type(data.get('version')) is not int or data['version'] not in (1, 2):
        raise ValidationError('update to version 1 or 2 unified presets; reinstall ARC or edit models.toml to include preset and all role presets')
    has_custom = 'custom' in data
    allowed = {'version', 'preset', 'roles'} | ({'custom'} if data['version'] == 2 and has_custom else set())
    if set(data) != allowed:
        raise ValidationError('update to version 1 or 2 unified presets; reinstall ARC or edit models.toml to include preset and all role presets')
    if not isinstance(data['preset'], str) or data['preset'] not in (*PRESETS, 'custom') or (data['preset'] == 'custom' and not has_custom):
        raise ValidationError('preset must select an available preset')
    roles = data['roles']
    if not isinstance(roles, dict) or set(roles) != set(ROLE_FILES):
        raise ValidationError('settings require exactly the five ARC roles')
    result = {}
    for name, variants in roles.items():
        if not isinstance(variants, dict) or set(variants) != set(PRESETS):
            raise ValidationError(f'{name}: require exactly economy, balanced and smart')
        validated = {preset: _validate_role(settings, f'{name}.{preset}') for preset, settings in variants.items()}
        if data['preset'] != 'custom':
            result[name] = validated[data['preset']]
    if has_custom:
        custom = data['custom']
        if not isinstance(custom, dict) or set(custom) != set(ROLE_FILES):
            raise ValidationError('custom requires exactly the five ARC roles')
        validated_custom = {name: _validate_role(settings, f'custom.{name}') for name, settings in custom.items()}
        if data['preset'] == 'custom':
            result = validated_custom
    return result


def require_regular(path: Path) -> None:
    # Inspect every existing component without resolving symlinks.
    path = Path(os.path.abspath(path))
    for component in (path, *path.parents):
        if component.is_symlink():
            raise ValidationError(f'symlink is not supported: {component}')
    if not path.is_file():
        raise ValidationError(f'expected regular file: {path}')


def load_settings(path: Path) -> dict:
    require_regular(path)
    try:
        return validate_settings(tomllib.loads(path.read_text(encoding='utf-8')))
    except (UnicodeError, tomllib.TOMLDecodeError) as exc:
        raise ValidationError(f'{path}: invalid TOML: {exc}') from exc


def _profile(content: bytes) -> tuple[list[str], dict, dict]:
    try:
        lines = content.decode('utf-8').splitlines(keepends=True)
    except UnicodeError as exc:
        raise ValidationError('profile must be UTF-8') from exc
    if not lines or lines[0].rstrip('\r\n') != '---':
        raise ValidationError('missing opening frontmatter delimiter')
    fields, indices = {}, {}
    current = None
    closed = False
    skip_until = 0
    for index, line in enumerate(lines[1:], 1):
        if index < skip_until:
            continue
        text = line.rstrip('\r\n')
        if text == '---':
            closed = True
            break
        if text == 'hooks:':
            if 'hooks' in fields:
                raise ValidationError('duplicate hooks')
            end = index + 1
            while end < len(lines) and lines[end].startswith((' ', '\t')):
                end += 1
            fields['hooks'] = ''.join(lines[index:end])
            indices['hooks'] = index
            skip_until = end
            current = 'hooks'
            continue
        item = re.fullmatch(r'  - ([A-Za-z][A-Za-z0-9]*)', text)
        if item and current == 'tools':
            fields['tools'].append(item[1])
            continue
        match = re.fullmatch(r'([a-z][a-zA-Z0-9_-]*):(?: (.+))?', text)
        if not match or match[1] in fields:
            raise ValidationError('malformed or duplicate frontmatter field')
        key, value = match.groups()
        current = key
        indices[key] = index
        if key == 'tools':
            if value is not None:
                raise ValidationError('tools must be an explicit YAML list')
            fields[key] = []
        else:
            if value is None or value != value.strip() or any(c in value for c in '\t\x00{}[]#&*!|>\"\'') or ': ' in value:
                raise ValidationError(f'{key}: expected a plain YAML scalar')
            fields[key] = value
    if not closed or not {'name', 'description', 'model', 'effort', 'tools'} <= set(fields):
        raise ValidationError('incomplete frontmatter')
    name = fields['name']
    role = name.removeprefix('arc-')
    if name != f'arc-{role}' or role not in ROLE_TOOLS or fields['tools'] != ROLE_TOOLS[role]:
        raise ValidationError('invalid native name or role tool allowlist')
    if MODEL.fullmatch(fields['model']) is None or fields['effort'] not in EFFORTS:
        raise ValidationError('invalid model or effort declaration')
    return lines, fields, indices


def parse_profile(content: bytes) -> dict:
    return _profile(content)[1]


def render_profile(content: bytes, settings: dict) -> bytes:
    validated = _validate_role(settings, 'profile')
    lines, _, indices = _profile(content)
    for field, value in validated.items():
        index = indices[field]
        newline = '\r\n' if lines[index].endswith('\r\n') else '\n' if lines[index].endswith('\n') else ''
        lines[index] = f'{field}: {value}{newline}'
    return ''.join(lines).encode('utf-8')


def apply_models(settings: dict, agents_dir: Path, *, check: bool = False, dry_run: bool = False) -> list[Path]:
    if not isinstance(settings, dict) or set(settings) != set(ROLE_FILES):
        raise ValidationError('settings require exactly the five ARC roles')
    settings = {role: _validate_role(values, role) for role, values in settings.items()}
    plans = []
    for role, filename in ROLE_FILES.items():
        path = agents_dir / filename
        require_regular(path)
        content = path.read_bytes()
        if parse_profile(content)['name'] != filename[:-3]:
            raise ValidationError(f'{path}: name does not match filename')
        updated = render_profile(content, settings[role])
        plans.append((path, content, updated, stat.S_IMODE(path.stat().st_mode)))
    changed = [path for path, old, new, _ in plans if old != new]
    if check or dry_run or not changed:
        return changed
    # Stage *all* new and rollback files before replacing any destination.
    staged, backups, replaced = {}, {}, []
    try:
        for path, old, new, mode in plans:
            if old == new:
                continue
            for data, bucket in ((new, staged), (old, backups)):
                fd, temporary = tempfile.mkstemp(prefix='.arc-models-', dir=agents_dir)
                temporary = Path(temporary)
                bucket[path] = temporary
                with os.fdopen(fd, 'wb') as stream:
                    stream.write(data)
                    os.fchmod(stream.fileno(), mode)
        for path in staged:
            os.replace(staged[path], path)
            replaced.append(path)
    except BaseException as exc:
        failures = []
        for path in reversed(replaced):
            try:
                os.replace(backups[path], path)
            except OSError as recovery:
                failures.append(f'{path}: {recovery}; recovery file {backups[path]}')
        if failures:
            # Keep every available backup for manual recovery.
            backups = {}
            raise OSError(f'model update failed ({exc}); rollback failed: ' + '; '.join(failures)) from exc
        raise
    finally:
        for temporary in (*staged.values(), *backups.values()):
            temporary.unlink(missing_ok=True)
    return changed
