#!/usr/bin/env python3
"""Read-only check of actual CI replay captures against an actual remote catalogue.

Save the SQL JSON payload (or its single result row), not the MCP text envelope.
This script does not apply migrations or update canonical environment evidence.
"""
from __future__ import annotations
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROJECTS = {'production': 'ifnogpksgdadruooqydi', 'staging': 'gjkkjtbfnssdsbmlhmwk'}
MIGRATIONS = ('artifact_export_receipts', 'artifact_import_candidates')


def load_payload(path: Path):
    value = json.loads(path.read_text())
    if isinstance(value, list) and len(value) == 1 and isinstance(value[0], dict):
        row = value[0]
        keys = [key for key in ('catalogue', 'function_catalogue', 'journal') if key in row]
        if len(keys) != 1 or len(row) != 1:
            raise ValueError('expected one SQL JSON result column')
        value = row[keys[0]]
        if isinstance(value, str):
            value = json.loads(value)
    if not isinstance(value, dict) or 'content' in value or 'isError' in value:
        raise ValueError('save the SQL payload separately from its untrusted tool envelope')
    return value


def index(items):
    result = {}
    for item in items:
        if item['id'] in result:
            raise ValueError('duplicate captured identity: ' + item['id'])
        result[item['id']] = item
    return result


def normalized(value):
    if isinstance(value, dict):
        return {key: normalized(item) for key, item in sorted(value.items())}
    if isinstance(value, list):
        return sorted((normalized(item) for item in value), key=lambda item: json.dumps(item, sort_keys=True))
    return value


def compare(replay, replay_functions, remote, remote_functions, journal, manifest, environment, root=ROOT):
    expected_project = PROJECTS[environment]
    if journal.get('project_id') != expected_project or not journal.get('captured_at'):
        raise ValueError('journal project identity or actual capture timestamp missing')
    for capture in (replay, replay_functions, remote, remote_functions):
        if not capture.get('captured_at'):
            raise ValueError('actual capture timestamp missing')
    for capture in (remote, remote_functions):
        if capture.get('project_id', expected_project) != expected_project:
            raise ValueError('capture project identity does not match the selected environment')
    ri, mi = index(replay['objects']), index(remote['objects'])
    reviewed = index(manifest['objects'])
    errors = ['missing_remote:' + key for key in sorted(ri.keys() - mi.keys())]
    errors += ['catalogue_contract_drift:' + key for key in sorted(ri.keys() & mi.keys())
               if normalized(ri[key]) != normalized(mi[key])]
    # Separate staging archive objects must match their reviewed installed contract.
    for key in sorted(mi.keys() - ri.keys()):
        expected = reviewed.get(key, {}).get('catalogues', {}).get(environment)
        if expected is None:
            errors.append('unreviewed_remote_extra:' + key)
        elif normalized(expected) != normalized(mi[key]):
            errors.append('remote_extra_contract_drift:' + key)
    rfi, mfi = index(replay_functions['functions']), index(remote_functions['functions'])
    scope = {row['id'] for row in manifest['objects'] if row['kind'] == 'function'
             and any(source['path'].startswith('supabase/migrations/20261005') for source in row['sources'])}
    versions = {row['version']: row for row in journal['rows']}
    if len(versions) != len(journal['rows']):
        errors.append('duplicate_journal_version')
    for name in MIGRATIONS:
        files = list((root / 'supabase/migrations').glob('*_' + name + '.sql'))
        if len(files) != 1:
            errors.append('ambiguous_file:' + name)
            continue
        file = files[0]
        version = file.stem.split('_', 1)[0]
        if environment == 'production' and versions.get(version, {}).get('name') != name:
            errors.append('file_stamp_missing_or_wrong:' + name)
        if environment == 'staging' and len([row for row in versions.values() if row['name'] == name]) != 1:
            errors.append('staging_stamp_missing_or_duplicate:' + name)
        # Include existing helpers rewritten in this increment even before inventory
        # source anchors are refreshed. Definitions/hashes still come only from SQL captures.
        names = {schema + '.' + name[:63] for schema, name in re.findall(
            r'\bcreate\s+(?:or\s+replace\s+)?function\s+(public|private)\.([a-zA-Z_0-9]+)',
            file.read_text(), re.I)}
        for function_name in names:
            matches = [key for key in rfi if key.startswith('function:' + function_name + '(')]
            if not matches:
                errors.append('missing_replay_function_capture:' + function_name)
            scope.update(matches)
    for key in sorted(scope):
        if key not in rfi or key not in mfi:
            errors.append('missing_function_capture:' + key)
        elif not re.fullmatch(r'[a-f0-9]{64}', rfi[key]['definitionSha256']):
            errors.append('invalid_replay_function_hash:' + key)
        elif rfi[key]['definitionSha256'] != mfi[key]['definitionSha256']:
            errors.append('function_body_hash_drift:' + key)
    return {'environment': environment, 'project_id': expected_project,
            'replayCapturedAt': replay['captured_at'], 'remoteCapturedAt': remote['captured_at'],
            'journalCapturedAt': journal['captured_at'], 'objectsCompared': len(ri),
            'stage21FunctionBodiesCompared': len(scope), 'errors': errors}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('replay', 'replay-functions', 'remote', 'remote-functions', 'journal'):
        parser.add_argument('--' + name, required=True, type=Path)
    parser.add_argument('--environment', required=True, choices=PROJECTS)
    parser.add_argument('--project-ref', required=True)
    args = parser.parse_args()
    if args.project_ref != PROJECTS[args.environment]:
        parser.error('unexpected project identity')
    try:
        result = compare(*(load_payload(getattr(args, name)) for name in
                           ('replay', 'replay_functions', 'remote', 'remote_functions', 'journal')),
                         load_payload(ROOT / 'docs/build/arcabouco-stage0/object-decisions.json'), args.environment)
    except (ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
        parser.error(str(error))
    print(json.dumps(result, ensure_ascii=False))
    return int(bool(result['errors']))


if __name__ == '__main__':
    raise SystemExit(main())
