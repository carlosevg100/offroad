#!/usr/bin/env python3
"""Restore an actual owned logical backup under a later authority floor; local CI only.

The staging counterpart uses the same three committed phases. This is a scoped logical
restore, not a claim that a managed physical cluster restore has been exercised.
"""
import hashlib
import json
import os
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlparse

database = os.environ['DATABASE_URL']
assert urlparse(database).hostname in ('localhost', '127.0.0.1', '::1')
org = 'a422c100-0000-4000-9000-000000000001'
actor = 'a422c100-0000-4000-8000-000000000001'
work = 'a422c100-0000-4000-9000-000000000011'
title = 'Stage22 owned restore canary; expires 2026-10-07'


def sql(source):
    result = subprocess.run(['psql', database, '-XAtq', '-v', 'ON_ERROR_STOP=1'],
                            input=source, text=True, capture_output=True, timeout=60)
    if result.returncode:
        raise RuntimeError('lifecycle_logical_restore_sql_failed')
    return result.stdout.strip()


def exported_grants():
    return json.loads(sql(f"select coalesce(jsonb_agg(to_jsonb(g) order by id),'[]') from private.resource_access_grants g where organization_id='{org}' and resource_id='{work}';"))


def encoded(value):
    return "convert_from(decode('" + json.dumps(value).encode().hex() + "','hex'),'UTF8')::jsonb"


def read_allowed():
    return sql(f"select private.resource_access_as_subject_v1('{org}','{work}','{actor}','read');") == 't'


assert sql(f"select count(*) from public.capital_projects where id='{work}';") == '0'
sql(f"""begin;
select set_config('request.jwt.claim.sub','{actor}',true);
insert into public.capital_projects(id,organization_id,project_name,created_by)
values('{work}','{org}','{title}','{actor}');
commit;""")
assert read_allowed(), 'backup_canary_must_be_allowed_before_revocation'
with tempfile.TemporaryDirectory(prefix='offroad-owned-logical-restore-') as directory:
    backup_path = Path(directory) / 'backup.json'
    backup_path.write_text(json.dumps({'projectName': title, 'grants': exported_grants()}))
    backup_path.chmod(0o600)
    backup_hash = hashlib.sha256(backup_path.read_bytes()).hexdigest()
    sql(f"""begin;
select set_config('request.jwt.claim.sub','{actor}',true);
select set_config('request.jwt.claims','{{"sub":"{actor}","role":"authenticated"}}',true);
select set_config('request.headers','{{"x-offroad-workspace":"{org}"}}',true);
set local role authenticated;
select public.set_resource_policy_grant_v1('{work}','{actor}',null,'read','deny',true,null);
reset role;
update public.capital_projects set project_name='Stage22 post-backup synthetic marker' where id='{work}';
commit;""")
    assert not read_allowed(), 'committed_revocation_not_effective'
    floor_path = Path(directory) / 'authority-floor.json'
    floor_path.write_text(json.dumps(exported_grants()))
    floor_path.chmod(0o600)
    # Load real files saved outside the database; no rollback is represented as restore.
    assert hashlib.sha256(backup_path.read_bytes()).hexdigest() == backup_hash
    backup = json.loads(backup_path.read_text())
    floor = json.loads(floor_path.read_text())
    assert any(row['effect'] == 'deny' and row['revoked_at'] is None for row in floor)
    sql(f"""begin;
select pg_advisory_xact_lock(hashtextextended('resource-policy:{org}',0));
update public.capital_projects set project_name=({encoded(backup)}->>'projectName') where id='{work}';
delete from private.resource_access_grants where organization_id='{org}' and resource_id='{work}';
insert into private.resource_access_grants select * from jsonb_populate_recordset(null::private.resource_access_grants,{encoded(backup['grants'])});
-- The operator replays the separately retained later floor before a single COMMIT.
delete from private.resource_access_grants where organization_id='{org}' and resource_id='{work}';
insert into private.resource_access_grants select * from jsonb_populate_recordset(null::private.resource_access_grants,{encoded(floor)});
do $$begin
 if private.resource_access_as_subject_v1('{org}','{work}','{actor}','read') then
  raise exception 'restore_reactivated_revoked_object';
 end if;
end;$$;
commit;""")
    assert sql(f"select project_name from public.capital_projects where id='{work}';") == title
    assert not read_allowed(), 'restored_backup_exposed_revoked_object'
    print('PASS committed_logical_backup_restore_preserves_later_revocation')
