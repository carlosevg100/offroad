#!/usr/bin/env python3
"""Verify immutable recovered SQL and optional read-only Supabase catalog exports.

No network, SQL execution, credentials, or business rows are required. The optional
exports must be collected with the documented catalog queries for both environments.
"""
import argparse
from datetime import datetime, timezone, timedelta
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = Path('docs/build/schema-history/recovered-wave1-manifest.json')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def load(path):
    return json.loads(path.read_text())


def executable_lines(sql):
    # The reconciled deltas are whole-line -- comments only. Do not normalize
    # SQL whitespace, identifiers, literals, inline comments or block comments.
    return '\n'.join(line for line in sql.splitlines() if not line.lstrip().startswith('--')).strip()


def keyed(rows, fields):
    result = {tuple(row[field] for field in fields): row for row in rows}
    require(len(result) == len(rows), 'Duplicate evidence object identity')
    return result


def verify(root, evidence=None, max_age_hours=24):
    manifest = load(root / MANIFEST)
    records = manifest['records']
    require(len(records) == 16, 'Expected sixteen recovery records')
    require(len({r['name'] for r in records}) == 16, 'Duplicate migration name')
    production = [r for r in records if r['production_version'] is not None]
    require(len(production) == 7, 'Expected seven production migrations')
    for row in records:
        path = root / row['file']
        require(path.resolve().is_relative_to(root.resolve()), 'Path outside checkout')
        require(path.is_file() and not path.is_symlink(), f'Missing regular file: {path}')
        require(hashlib.sha256(path.read_bytes()).hexdigest() == row['sha256'], f'Changed recovered bytes: {path}')
        if row['production_version']:
            expected = f"supabase/migrations/{row['production_version']}_{row['name']}.sql"
            require(row['file'] == expected, f'Incorrect production replay location: {path}')
        else:
            expected = f"docs/build/schema-history/staging-only-distribution/{row['staging_version']}_{row['name']}.sql"
            require(row['file'] == expected, f'Archive escaped quarantine: {path}')
            require(not list((root / 'supabase/migrations').glob(f"*_{row['name']}.sql")), f'Staging-only migration entered replay: {row["name"]}')
    if evidence is None:
        return {'files': 16, 'production_replay_files': 7, 'archived_outside_replay': 9, 'remote_evidence': 'not_requested'}
    meta = load(evidence / 'recovered-sixteen-evidence-meta.json')
    captured = datetime.fromisoformat(meta['captured_at'].replace('Z', '+00:00'))
    age = datetime.now(timezone.utc) - captured
    require(timedelta(0) <= age <= timedelta(hours=max_age_hours), 'Catalog evidence is stale or from the future; recollect read-only exports')
    environments = {}
    for env in ('production', 'staging'):
        require(meta[env] == manifest[env], f'Wrong {env} project')
        journals = keyed(load(evidence / f'recovered-sixteen-journal-{env}.json'), ['name'])
        expected_names = {r['name'] for r in records if env == 'staging' or r['production_version']}
        require({k[0] for k in journals} == expected_names, f'Unexpected {env} journal coverage')
        for row in records:
            if row['name'] not in expected_names:
                continue
            remote = journals[(row['name'],)]
            require(remote['version'] == row[f'{env}_version'], f'Changed {env} stamp: {row["name"]}')
            actual = '\n'.join(remote['statements']).strip()
            original = (root / row['file']).read_text().strip()
            require(actual == original or (env == 'staging' and row['production_version'] and executable_lines(actual) == executable_lines(original)), f'Journal SQL differs: {env}/{row["name"]}')
        environments[env] = {
            'functions': keyed(load(evidence / f'recovered-sixteen-functions-{env}.json'), ['schema', 'name', 'arguments']),
            'catalog': load(evidence / f'recovered-sixteen-tables-{env}.json')[0]['catalog'],
        }
    p, s = environments['production'], environments['staging']
    require(len(p['functions']) >= 19 and p['functions'].keys() == s['functions'].keys(), 'Function catalog coverage differs')
    comments_only = 0
    for key, function in p['functions'].items():
        other = s['functions'][key]
        require(executable_lines(function['definition']) == executable_lines(other['definition']), f'Installed function differs: {key}')
        comments_only += function['definition'] != other['definition']
    for kind, expected_count in [('tables', 4), ('policies', None)]:
        canonical = lambda rows: sorted(json.dumps(row, sort_keys=True) for row in rows)
        require(canonical(p['catalog'][kind]) == canonical(s['catalog'][kind]), f'Installed {kind} differ')
        if expected_count:
            require(len(p['catalog'][kind]) == expected_count, f'Incomplete {kind} catalog')
    return {'files': 16, 'production_replay_files': 7, 'archived_outside_replay': 9, 'journal_records': {'production': 7, 'staging': 16}, 'functions': len(p['functions']), 'functions_comment_only_difference': comments_only, 'tables': 4, 'catalog_captured_at': meta['captured_at'], 'remote_evidence': 'passed'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--evidence-dir', type=Path)
    parser.add_argument('--max-age-hours', type=float, default=24)
    args = parser.parse_args()
    try:
        print(json.dumps(verify(args.root, args.evidence_dir, args.max_age_hours), sort_keys=True))
    except (ValueError, KeyError, OSError) as error:
        print(f'Recovered schema verification FAILED: {error}', file=sys.stderr)
        sys.exit(1)
