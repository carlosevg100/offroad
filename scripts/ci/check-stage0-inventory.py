#!/usr/bin/env python3
"""Compare the reviewed object inventory with a real replay catalogue; never infer decisions."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / 'docs/build/arcabouco-stage0/object-decisions.json'
ALLOWED = {'preservar', 'consolidar', 'refatorar', 'substituir', 'apagar', 'congelar'}


def normalized(value):
    if isinstance(value, dict):
        return {k: normalized(v) for k, v in sorted(value.items())}
    if isinstance(value, list):
        return sorted((normalized(v) for v in value), key=lambda v: json.dumps(v, sort_keys=True))
    return value


def check(manifest, catalogue, root=ROOT, environment='replay'):
    errors = []
    decisions = manifest['objects']
    ids = [row['id'] for row in decisions]
    if len(ids) != len(set(ids)):
        errors.append('duplicate_object_decision')
    reviewed = {row['id']: row for row in decisions}
    actual_ids = [row['id'] for row in catalogue['objects']]
    if len(actual_ids) != len(set(actual_ids)):
        errors.append('duplicate_catalogue_object')
    actual = {row['id']: row for row in catalogue['objects']}
    target = 'production' if environment == 'replay' else environment
    for key, obj in actual.items():
        row = reviewed.get(key)
        if row is None:
            errors.append('unreviewed_object:' + key)
            continue
        expected = row['catalogues'].get(target)
        if expected is None:
            errors.append('unapproved_environment:' + key)
        elif normalized(expected) != normalized(obj):
            errors.append('catalogue_contract_drift:' + key)
    for key, row in reviewed.items():
        if target in row['catalogues'] and key not in actual:
            errors.append('missing_installed_object:' + key)
        if row['decision'] not in ALLOWED or not row['reason'].strip() or not row['owner'].strip() or not row['stage'].strip():
            errors.append('incomplete_decision:' + key)
        if not row['sources']:
            errors.append('missing_source_lineage:' + key)
        for source in row['sources']:
            path = (root / source['path']).resolve()
            if not path.is_relative_to(root.resolve()) or not path.is_file():
                errors.append('missing_source_file:' + key)
                continue
            lines = path.read_text().splitlines()
            at = source['line'] - 1
            if at < 0 or at >= len(lines) or lines[at].strip() != source['anchor'].strip():
                errors.append('source_anchor_drift:' + key)
    for item in manifest['repository_items']:
        if item['decision'] not in ALLOWED or not item['reason'].strip():
            errors.append('incomplete_repository_decision:' + item['path'])
        if not (root / item['path']).exists():
            errors.append('missing_repository_item:' + item['path'])
    packages = {str(p.parent.relative_to(root)) for parent in ['apps', 'packages'] for p in (root / parent).glob('*/package.json')}
    known_packages = {x['path'] for x in manifest['repository_items'] if x['kind'] in ['package', 'app']}
    if packages != known_packages:
        errors.append('package_inventory_drift')
    migrations = {str(p.relative_to(root)) for p in (root / 'supabase/migrations').glob('*.sql')}
    known_migrations = {x['path'] for x in manifest['repository_items'] if x['kind'] == 'migration'}
    if migrations != known_migrations:
        errors.append('migration_inventory_drift')
    entrypoints = {str(p.relative_to(root)) for p in (root / 'apps/web/src/app').rglob('*') if p.is_file() and (p.name in ['page.tsx', 'route.ts', 'layout.tsx'] or p.name.endswith('actions.ts'))}
    if (root / 'apps/web/src/proxy.ts').exists():
        entrypoints.add('apps/web/src/proxy.ts')
    known_entrypoints = {x['path'] for x in manifest['repository_items'] if x['kind'] == 'entrypoint'}
    if entrypoints != known_entrypoints:
        errors.append('entrypoint_inventory_drift')
    for source in manifest['staging_archive']:
        path = root / source['path']
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != source['sha256']:
            errors.append('archive_integrity_drift:' + source['path'])
        name = source['name']
        if any(p.name.endswith('_' + name + '.sql') for p in (root / 'supabase/migrations').glob('*.sql')):
            errors.append('staging_only_history_in_replay:' + name)
    return errors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--catalogue', required=True, type=Path)
    parser.add_argument('--environment', choices=['replay', 'production', 'staging'], default='replay')
    args = parser.parse_args()
    data = json.loads(args.catalogue.read_text())
    if isinstance(data, list):
        data = data[0]['catalogue']
    manifest = json.loads(MANIFEST.read_text())
    errors = check(manifest, data, environment=args.environment)
    target = 'production' if args.environment == 'replay' else args.environment
    reviewed = {row['id']: row for row in manifest['objects']}
    differences = []
    for actual in data['objects']:
        expected = reviewed.get(actual['id'], {}).get('catalogues', {}).get(target)
        if expected is not None and normalized(expected) != normalized(actual):
            differences.append({'id': actual['id'], 'fields': {
                key: {'expected': expected.get(key), 'actual': actual.get(key)}
                for key in sorted(set(expected) | set(actual))
                if normalized(expected.get(key)) != normalized(actual.get(key))
            }})
    print(json.dumps({'environment': args.environment, 'objects': len(data['objects']),
                      'errors': errors, 'differences': differences}, ensure_ascii=False))
    return bool(errors)

if __name__ == '__main__':
    raise SystemExit(main())
