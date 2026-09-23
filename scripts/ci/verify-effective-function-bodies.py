#!/usr/bin/env python3
"""Snapshot and verify the effective bodies of functions that migrations rewrite by text.

Dozens of migrations under supabase/migrations/ change a function by reading its current
definition with pg_get_functiondef('<schema>.<name>(<args>)'::regprocedure), applying
replace() to that text and executing the result. The body that actually runs is then
visible only in the database catalogue. This script keeps a byte-exact copy of every such
body under docs/build/schema-history/effective-function-bodies/ and fails when the
database it is pointed at differs from that committed snapshot.

    python3 scripts/ci/verify-effective-function-bodies.py            # compare (CI)
    python3 scripts/ci/verify-effective-function-bodies.py --write    # refresh the snapshot
    python3 scripts/ci/verify-effective-function-bodies.py --offline  # manifest only, no database

The target list is derived from the migrations themselves: every literal signature inside
pg_get_functiondef('...'::regprocedure), on one line or several. Only the standard library
is used; psql must be on PATH for the database modes. The script never writes to the database.
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / 'supabase/migrations'
SNAPSHOT = ROOT / 'docs/build/schema-history/effective-function-bodies'
MANIFEST = SNAPSHOT / 'MANIFEST.json'
TARGET = re.compile(r"pg_get_functiondef\s*\(\s*'([^']+)'\s*::\s*regprocedure", re.IGNORECASE)
SIGNATURE = re.compile(r'^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*\([a-z0-9_,\[\]]*\)$')
# Spellings that ::regprocedure accepts for the same type, folded to one short alias so that
# a function has exactly one signature and one file name without spaces.
TYPE_ALIASES = {
    'timestamp with time zone': 'timestamptz',
    'timestamp without time zone': 'timestamp',
    'time with time zone': 'timetz',
    'time without time zone': 'time',
    'double precision': 'float8',
    'character varying': 'varchar',
    'bit varying': 'varbit',
    'int': 'integer', 'int4': 'integer', 'int8': 'bigint', 'int2': 'smallint',
    'bool': 'boolean', 'float4': 'real',
}


def canonical(signature):
    """One spelling per function: lower case, no spaces, short type aliases."""
    head, _, args = signature.strip().lower().partition('(')
    types = []
    for arg in args.rstrip(')').split(','):
        arg = ' '.join(arg.split())
        if not arg:
            continue
        base, suffix = (arg[:-2], '[]') if arg.endswith('[]') else (arg, '')
        types.append(TYPE_ALIASES.get(base, base).replace(' ', '') + suffix)
    return f"{head.strip()}({','.join(types)})"


def migration_targets():
    """Every function a migration rewrites through a literal pg_get_functiondef signature."""
    targets = set()
    for path in sorted(MIGRATIONS.glob('*.sql')):
        for raw in TARGET.findall(path.read_text(encoding='utf-8')):
            signature = canonical(raw)
            if not SIGNATURE.match(signature):
                raise SystemExit(f'Unsupported pg_get_functiondef signature in {path.name}: {raw!r}')
            targets.add(signature)
    return targets


def psql(url, sql):
    command = ['psql', url, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1']
    env = dict(os.environ, PGCLIENTENCODING='UTF8')
    try:
        result = subprocess.run(command, input=sql, text=True, encoding='utf-8',
                                capture_output=True, env=env, timeout=120)
    except FileNotFoundError:
        raise SystemExit('psql must be on PATH')
    if result.returncode:
        raise SystemExit(f'psql failed: {result.stderr.strip()}')
    return result.stdout


def database_state(url, targets):
    """Effective bodies of the targets in the database, as UTF-8 bytes keyed by signature.

    Returns (found, absent, resolved): absent lists targets no longer in the catalogue; resolved
    maps each migration target to the signature the catalogue reports for it.
    """
    values = ',\n'.join(f"('{signature}')" for signature in sorted(targets))
    sql = f"""
with target(sig) as (values {values})
select coalesce(json_agg(json_build_object(
  'target', t.sig,
  'signature', case when p.oid is null then null else format('%s.%s(%s)', n.nspname, p.proname,
    (select coalesce(string_agg(format_type(a.t, null), ',' order by a.o), '')
     from unnest(p.proargtypes::oid[]) with ordinality as a(t, o))) end,
  'definition', pg_get_functiondef(p.oid)
) order by t.sig), '[]')
from target t
left join pg_proc p on p.oid = to_regprocedure(t.sig)
left join pg_namespace n on n.oid = p.pronamespace;
"""
    found, absent, resolved = {}, set(), {}
    for row in json.loads(psql(url, sql).strip()):
        if row['signature'] is None:
            absent.add(row['target'])
            continue
        signature = canonical(row['signature'])
        resolved[row['target']] = signature
        found[signature] = row['definition'].encode('utf-8')
    if targets and not found:
        raise SystemExit('No target function exists in this database; is DATABASE_URL the migrated stack?')
    return found, absent, resolved


def snapshot_state():
    """Committed bodies keyed by signature, the recorded missing set and manifest problems."""
    if not MANIFEST.is_file():
        raise SystemExit(f'{MANIFEST.relative_to(ROOT)} is missing; run --write against a migrated database')
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    files, problems, listed = {}, [], set()
    for entry in manifest['functions']:
        listed.add(entry['file'])
        path = SNAPSHOT / entry['file']
        if entry['file'] != f"{entry['signature']}.sql" or not SIGNATURE.match(entry['signature']):
            problems.append(f"manifest    {entry['signature']} (file name does not match the signature)")
        if not path.is_file():
            problems.append(f"missing     {entry['signature']} (file {entry['file']} is not in the snapshot)")
            continue
        data = path.read_bytes()
        if hashlib.sha256(data).hexdigest() != entry['sha256']:
            problems.append(f"stale hash  {entry['signature']} (MANIFEST.json sha256 does not match {entry['file']})")
        files[entry['signature']] = data
    for path in sorted(SNAPSHOT.glob('*.sql')):
        if path.name not in listed:
            problems.append(f"unlisted    {path.name} (file in the snapshot, not in MANIFEST.json)")
    return files, set(manifest['missing']), problems


def verify(url, offline):
    targets = migration_targets()
    files, listed_missing, problems = snapshot_state()
    found, absent, resolved = ({}, set(), {}) if offline else database_state(url, targets)
    covered = {resolved.get(target, target) for target in targets}
    for signature in sorted(covered - set(files) - listed_missing):
        problems.append(f"unsnapshot  {signature} (rewritten by a migration, not in the snapshot)")
    for signature in sorted((set(files) | listed_missing) - covered):
        problems.append(f"not target  {signature} (in the snapshot, no migration rewrites it)")
    for signature in sorted(found):
        if signature in files and files[signature] != found[signature]:
            problems.append(f"differs     {signature} (database {len(found[signature])} bytes, snapshot {len(files[signature])} bytes)")
        elif signature in listed_missing:
            problems.append(f"present     {signature} (recorded as missing, exists in the database)")
    for signature in sorted(absent):
        if signature in files:
            problems.append(f"absent      {signature} (in the snapshot, not in the database)")
        elif signature not in listed_missing:
            problems.append(f"absent      {signature} (not in the database and not recorded as missing)")
    return problems, len(files), len(listed_missing)


def write(url, source):
    targets = migration_targets()
    found, absent, _ = database_state(url, targets)
    SNAPSHOT.mkdir(parents=True, exist_ok=True)
    for path in SNAPSHOT.glob('*.sql'):
        if path.name[:-4] not in found:
            path.unlink()
    functions = []
    for signature in sorted(found):
        (SNAPSHOT / f'{signature}.sql').write_bytes(found[signature])
        functions.append({'signature': signature, 'file': f'{signature}.sql',
                          'sha256': hashlib.sha256(found[signature]).hexdigest()})
    manifest = {
        'capturedAt': datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
        'source': source,
        'functions': functions,
        'missing': sorted(absent),
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'Wrote {len(functions)} effective function bodies and {len(absent)} missing signatures '
          f'to {SNAPSHOT.relative_to(ROOT)} from {source}')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--write', action='store_true',
                        help='regenerate the snapshot files and MANIFEST.json from the database')
    parser.add_argument('--offline', action='store_true',
                        help='check MANIFEST.json, file hashes and migration coverage without a database')
    parser.add_argument('--source', help='label recorded by --write, for example "staging gjkkjtbfnssdsbmlhmwk"')
    parser.add_argument('--database-url', default=os.environ.get('DATABASE_URL'),
                        help='connection string (default: DATABASE_URL)')
    args = parser.parse_args(argv)
    if args.write and args.offline:
        parser.error('--write needs a database; drop --offline')
    if not args.offline and not args.database_url:
        parser.error('DATABASE_URL is required, or pass --offline')
    if args.write:
        parsed = urlparse(args.database_url)
        write(args.database_url, args.source or f'{parsed.hostname}:{parsed.port}')
        return 0
    problems, functions, missing = verify(args.database_url, args.offline)
    if problems:
        print('Effective function bodies diverge from the committed snapshot:')
        for problem in problems:
            print(f'  {problem}')
        print('Refresh with: python3 scripts/ci/verify-effective-function-bodies.py --write '
              '(against the database that applied the legitimate migration), then review the diff.')
        return 1
    mode = 'manifest and migration coverage' if args.offline else 'database bodies'
    print(f'Effective function bodies: {mode} match the committed snapshot '
          f'({functions} functions, {missing} recorded as missing).')
    return 0


if __name__ == '__main__':
    sys.exit(main())
