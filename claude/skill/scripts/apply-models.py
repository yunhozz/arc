#!/usr/bin/env python3
"""Reapply installed Claude ARC models without invoking a provider."""
import sys
sys.dont_write_bytecode = True
import argparse
from pathlib import Path
from model_config import ValidationError, apply_models, load_settings


def main():
    skill = Path(__file__).absolute().parent.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=skill / 'models.toml')
    parser.add_argument('--agents-dir', type=Path, default=skill.parent.parent / 'agents')
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    try:
        changed = apply_models(load_settings(args.config), args.agents_dir, check=args.check, dry_run=args.dry_run)
    except (ValidationError, OSError) as exc:
        print(f'error: {exc}', file=sys.stderr)
        return 2
    verb = 'Would update' if args.check or args.dry_run else 'Updated'
    print(f'{verb} {len(changed)} Claude profiles.')
    for path in changed:
        print(path)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
