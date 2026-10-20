#!/usr/bin/env python3
"""Real two-session races on the market reference ledger (ADR 0023), on the disposable CI database.

The version state row is the anchor of every decision: content, quality events, seals and purges all
update it, and every writer locks it before deciding.
1. A REPEATABLE READ writer whose snapshot predates a committed seal cannot add content.
2. A READ COMMITTED writer that reaches a version while its seal is in progress waits, then is refused.
3. A derived seal that reaches a dependency while that dependency is being purged waits, then is refused.
4. A REPEATABLE READ seal whose snapshot predates committed content fails instead of sealing an
   incomplete version.
5. A derived seal that reaches a dependency while its revocation is in progress waits, then is refused.
6. A REPEATABLE READ derived seal whose snapshot predates a committed revocation of its dependency fails.
7. A derived seal that reaches a dependency while its quarantine is in progress waits, then is refused.
8. Events are ordered as they serialize: a revocation that waits behind a transaction approving twice
   is the latest event once both commit, so the version is no longer approved.
9. An unsealed version purged in one transaction takes no content in a later one.
Every row here is synthetic and lives only in the disposable database.
"""
import os
import select
import subprocess
import time
import uuid

URL = os.environ['DATABASE_URL']
P = '3a720000'
FOUNDER, OPERATOR = f'{P}-0000-4000-8000-000000000001', f'{P}-0000-4000-8000-000000000002'
ACQ = f'{P}-0000-4000-c000-000000000001'
(V_RR, V_RC, V_DEP, V_DERIVED, V_STALE, V_DEP2, V_DERIVED2, V_DEP3, V_DERIVED3, V_DEP4, V_DERIVED4, V_DEP5,
 V_OPEN) = (f'{P}-0000-4000-c000-0000000001{n:02d}' for n in range(13))


def psql(sql, check=True):
    done = subprocess.run(['psql', URL, '-v', 'ON_ERROR_STOP=1', '-At', '-q'], input=sql, text=True, capture_output=True)
    if check and done.returncode != 0:
        raise AssertionError(done.stdout + done.stderr)
    return done.stdout.strip()


SETUP = f"""
begin;
select set_config('request.jwt.claims','{{}}',true);
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
select ('{P}-0000-4000-8000-00000000000'||n)::uuid,'authenticated','authenticated','{P}-'||n||'@example.invalid','{{}}','{{}}',now(),now(),false,false from generate_series(1,2) n;
insert into private.platform_principals(user_id,role,label) values('{FOUNDER}','founder','Synthetic race founder'),('{OPERATOR}','operator','Synthetic race operator');
select private.register_market_publisher_v1('{P}-0000-4000-a000-000000000001','Offroad, referência de mercado','{FOUNDER}');
select private.record_market_source_revision_v1('{P}-0000-4000-a000-000000000011','bcb-sgs-cdi',jsonb_build_object('registryId','bcb_sgs',
 'license',jsonb_build_object('kind','open','license','ODbL-1.0','attribution','Banco Central do Brasil, SGS','evidenceIds',jsonb_build_array('bcb-open-data'),'retainAdoptedValues',true,'storeDays',null),
 'allowedHosts',jsonb_build_array('api.bcb.gov.br'),'calendar','br_business_days','expectedPublication','09:00','maximumAgeHours',30,'enabled',true,'reason','Série do CDI realizado, aberta'),'{OPERATOR}');
insert into private.market_logical_objects(logical_id,source_id,family,kind,category,keys) values
 ('market:bcb-sgs-cdi:daily:00000000000000aa','bcb-sgs-cdi','daily','series','observed','{{}}'),
 ('market:bcb-sgs-cdi:path:00000000000000aa','bcb-sgs-cdi','path','series','consensus_scenario','{{}}');
commit;
begin;
create temp table t(at timestamptz,avail timestamptz,lic jsonb);
insert into t select clock_timestamp(),clock_timestamp()-interval '1 hour',(private.market_source_in_force_v1('bcb-sgs-cdi')).license;
insert into private.market_acquisitions(id,publisher_organization_id,source_id,source_revision,url,final_url,acquired_at,sha256,byte_size,content_type,object_path)
 select '{ACQ}',private.market_publisher_organization_v1(),'bcb-sgs-cdi',1,'https://api.bcb.gov.br/x','https://api.bcb.gov.br/x',at,repeat('a',64),1,'application/json','bcb-sgs-cdi/2026/10/{ACQ}.json' from t;
create function pg_temp.line(p_end text,p_avail timestamptz,p_acq timestamptz,p_value text) returns text language sql as $$
 select concat_ws('|','',p_end,to_char(p_avail at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),to_char(p_acq at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),p_value,'percent_per_year','1');
$$;
create function pg_temp.direct(p_version uuid,p_value text) returns void language sql as $$
 insert into private.market_versions(id,logical_id,parser_version,sha256,license)
  select p_version,'market:bcb-sgs-cdi:daily:00000000000000aa','race.v1',encode(extensions.digest(convert_to(concat_ws(E'\\n','parser:race.v1','methodology:null','inputs:a:{ACQ}',pg_temp.line('2026-10-16',avail,at,p_value)),'UTF8'),'sha256'),'hex'),lic from t;
 insert into private.market_version_inputs(version_id,acquisition_id) values(p_version,'{ACQ}');
 insert into private.market_observations(version_id,period_end,available_at,acquired_at,value,unit,scale) select p_version,'2026-10-16',avail,at,p_value::numeric,'percent_per_year','1' from t;
$$;
create function pg_temp.derived(p_version uuid,p_dep uuid) returns void language sql as $$
 insert into private.market_versions(id,logical_id,parser_version,methodology,sha256,license)
  select p_version,'market:bcb-sgs-cdi:path:00000000000000aa','race.path.v1','{{"id":"race","version":"1"}}',
   encode(extensions.digest(convert_to(concat_ws(E'\\n','parser:race.path.v1','methodology:{{"id": "race", "version": "1"}}','inputs:v:'||p_dep::text,
    pg_temp.line('2027-12-31',avail,at,'13')),'UTF8'),'sha256'),'hex'),lic from t;
 insert into private.market_version_inputs(version_id,dependency_version_id) values(p_version,p_dep);
 insert into private.market_observations(version_id,period_end,available_at,acquired_at,value,unit,scale) select p_version,'2027-12-31',avail,at,13,'percent_per_year','1' from t;
$$;
-- Distinct canonical content per direct version: one logical object never holds two equal versions.
select pg_temp.direct('{V_RR}','14.1'),pg_temp.direct('{V_RC}','14.2'),pg_temp.direct('{V_DEP}','14.3'),pg_temp.direct('{V_STALE}','14.4'),
 pg_temp.direct('{V_DEP2}','14.5'),pg_temp.direct('{V_DEP3}','14.6'),pg_temp.direct('{V_DEP4}','14.7'),pg_temp.direct('{V_DEP5}','14.8'),
 pg_temp.direct('{V_OPEN}','14.9');
select private.seal_market_version_v1(v) from unnest(array['{V_DEP}','{V_DEP2}','{V_DEP3}','{V_DEP4}','{V_DEP5}']::uuid[]) v;
insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id)
 select 'version',v,'approved','Synthetic approval','{OPERATOR}' from unnest(array['{V_DEP}','{V_DEP2}','{V_DEP3}','{V_DEP4}']) v;
select pg_temp.derived('{V_DERIVED}','{V_DEP}'),pg_temp.derived('{V_DERIVED2}','{V_DEP2}'),pg_temp.derived('{V_DERIVED3}','{V_DEP3}'),
 pg_temp.derived('{V_DERIVED4}','{V_DEP4}');
commit;
"""

INSERT_OBS = "insert into private.market_observations(version_id,period_end,available_at,acquired_at,value,unit,scale) select '{v}','2026-10-17',acquired_at-interval '1 hour',acquired_at,1,'percent_per_year','1' from private.market_acquisitions where id='" + ACQ + "';"


def session(app):
    proc = subprocess.Popen(['psql', URL, '-v', 'ON_ERROR_STOP=1', '-At', '-q'], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, bufsize=1, env={**os.environ, 'PGAPPNAME': app})
    proc.stdin.write('\\o /dev/null\n')
    return proc


def barrier(proc, mark):
    proc.stdin.write(f"\\echo {mark}\n"); proc.stdin.flush()
    if not select.select([proc.stdout], [], [], 15)[0]:
        raise AssertionError(f'{mark} not reached')
    line = proc.stdout.readline().strip()
    if line != mark:
        raise AssertionError(f'{mark}: {line}')


def wait_for_lock(app):
    deadline = time.monotonic() + 10
    while psql(f"select count(*) from pg_stat_activity where application_name='{app}' and wait_event_type='Lock';") != '1':
        if time.monotonic() >= deadline:
            raise AssertionError(f'{app} did not wait on the version state')
        time.sleep(.05)


def finish(proc, expected_state):
    # The refused session may already have stopped on its error; then there is nothing to commit.
    try:
        proc.stdin.write('commit;\n'); proc.stdin.close()
    except BrokenPipeError:
        pass
    out = proc.stdout.read(); code = proc.wait(timeout=15)
    if code == 0 or expected_state not in out:
        raise AssertionError(f'expected {expected_state}, got exit {code}: {out}')


def main():
    psql(SETUP)
    # 1. Stale REPEATABLE READ snapshot after a committed seal.
    b = session('market_rr_' + uuid.uuid4().hex[:8])
    b.stdin.write("set statement_timeout='15s';begin isolation level repeatable read;select count(*) from private.market_version_states;\n")
    barrier(b, 'SNAPSHOT_TAKEN')
    psql(f"select private.seal_market_version_v1('{V_RR}');")
    b.stdin.write(INSERT_OBS.format(v=V_RR) + '\n')
    finish(b, 'could not serialize access')
    # 2. READ COMMITTED writer waits on a seal in progress, then is refused.
    a = session('market_seal_' + uuid.uuid4().hex[:8])
    a.stdin.write(f"set statement_timeout='15s';begin;select private.seal_market_version_v1('{V_RC}');\n")
    barrier(a, 'SEAL_HELD')
    app = 'market_late_' + uuid.uuid4().hex[:8]
    b = session(app)
    b.stdin.write("set statement_timeout='15s';begin;" + INSERT_OBS.format(v=V_RC) + '\n'); b.stdin.flush()
    wait_for_lock(app)
    a.stdin.write('commit;\n'); a.stdin.close()
    if a.wait(timeout=15) != 0:
        raise AssertionError('seal failed: ' + a.stdout.read())
    finish(b, 'market_version_closed')
    # 3. Derived seal against a dependency purge in progress.
    a = session('market_purge_' + uuid.uuid4().hex[:8])
    a.stdin.write(f"set statement_timeout='15s';begin;insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) "
                  f"values('version','{V_DEP}','purged','Synthetic race purge','{OPERATOR}');delete from private.market_observations where version_id='{V_DEP}';\n")
    barrier(a, 'PURGE_HELD')
    app = 'market_derived_' + uuid.uuid4().hex[:8]
    b = session(app)
    b.stdin.write(f"set statement_timeout='15s';begin;select private.seal_market_version_v1('{V_DERIVED}');\n"); b.stdin.flush()
    wait_for_lock(app)
    a.stdin.write('commit;\n'); a.stdin.close()
    if a.wait(timeout=15) != 0:
        raise AssertionError('purge failed: ' + a.stdout.read())
    finish(b, 'market_version_dependency_invalid')
    if psql(f"select count(*) from private.market_version_seals where version_id='{V_DERIVED}';") != '0':
        raise AssertionError('derived version sealed over a purged dependency')
    # 4. Stale REPEATABLE READ snapshot before committed content: the seal fails, it does not omit content.
    b = session('market_stale_' + uuid.uuid4().hex[:8])
    b.stdin.write("set statement_timeout='15s';begin isolation level repeatable read;select count(*) from private.market_version_states;\n")
    barrier(b, 'STALE_SNAPSHOT_TAKEN')
    psql(INSERT_OBS.format(v=V_STALE))
    b.stdin.write(f"select private.seal_market_version_v1('{V_STALE}');\n")
    finish(b, 'could not serialize access')
    if psql(f"select count(*) from private.market_version_seals where version_id='{V_STALE}';") != '0':
        raise AssertionError('version sealed from a stale snapshot')
    # 5. Derived seal against a dependency revocation in progress.
    a = session('market_revoke_' + uuid.uuid4().hex[:8])
    a.stdin.write(f"set statement_timeout='15s';begin;insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) "
                  f"values('version','{V_DEP2}','revoked','Synthetic race revocation','{OPERATOR}');\n")
    barrier(a, 'REVOKE_HELD')
    app = 'market_derived2_' + uuid.uuid4().hex[:8]
    b = session(app)
    b.stdin.write(f"set statement_timeout='15s';begin;select private.seal_market_version_v1('{V_DERIVED2}');\n"); b.stdin.flush()
    wait_for_lock(app)
    a.stdin.write('commit;\n'); a.stdin.close()
    if a.wait(timeout=15) != 0:
        raise AssertionError('revocation failed: ' + a.stdout.read())
    finish(b, 'market_version_dependency_invalid')
    # 6. Stale REPEATABLE READ derived seal after a committed revocation of its dependency.
    b = session('market_derived3_' + uuid.uuid4().hex[:8])
    b.stdin.write("set statement_timeout='15s';begin isolation level repeatable read;select count(*) from private.market_version_states;\n")
    barrier(b, 'DERIVED_SNAPSHOT_TAKEN')
    psql(f"insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) values('version','{V_DEP3}','revoked','Synthetic race revocation','{OPERATOR}');")
    b.stdin.write(f"select private.seal_market_version_v1('{V_DERIVED3}');\n")
    finish(b, 'could not serialize access')
    if psql(f"select count(*) from private.market_version_seals where version_id in ('{V_DERIVED2}','{V_DERIVED3}');") != '0':
        raise AssertionError('derived version sealed over a revoked dependency')
    # 7. Derived seal against a dependency quarantine in progress.
    a = session('market_quarantine_' + uuid.uuid4().hex[:8])
    a.stdin.write(f"set statement_timeout='15s';begin;insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) "
                  f"values('version','{V_DEP4}','quarantined','Synthetic race quarantine','{OPERATOR}');\n")
    barrier(a, 'QUARANTINE_HELD')
    app = 'market_derived4_' + uuid.uuid4().hex[:8]
    b = session(app)
    b.stdin.write(f"set statement_timeout='15s';begin;select private.seal_market_version_v1('{V_DERIVED4}');\n"); b.stdin.flush()
    wait_for_lock(app)
    a.stdin.write('commit;\n'); a.stdin.close()
    if a.wait(timeout=15) != 0:
        raise AssertionError('quarantine failed: ' + a.stdout.read())
    finish(b, 'market_version_dependency_invalid')
    # 8. A revocation waiting behind two approvals is the latest event once both commit.
    approve = (f"insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) "
               f"values('version','{V_DEP5}','approved','Synthetic race approval','{OPERATOR}');")
    a = session('market_approve_' + uuid.uuid4().hex[:8])
    a.stdin.write("set statement_timeout='15s';begin;" + approve + '\n')
    barrier(a, 'FIRST_APPROVAL_HELD')
    app = 'market_revoke2_' + uuid.uuid4().hex[:8]
    b = session(app)
    b.stdin.write(f"set statement_timeout='15s';begin;insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) "
                  f"values('version','{V_DEP5}','revoked','Synthetic race revocation','{OPERATOR}');\n"); b.stdin.flush()
    wait_for_lock(app)
    a.stdin.write(approve + '\ncommit;\n'); a.stdin.close()
    if a.wait(timeout=15) != 0:
        raise AssertionError('approvals failed: ' + a.stdout.read())
    b.stdin.write('commit;\n'); b.stdin.close()
    if b.wait(timeout=15) != 0:
        raise AssertionError('revocation failed: ' + b.stdout.read())
    if psql(f"select private.market_version_quality_approved_v1('{V_DEP5}');") != 'f':
        raise AssertionError('a revocation serialized last did not decide the quality')
    if psql(f"select string_agg(event,',' order by version_ordinal) from private.market_events where subject_kind='version' and subject_id='{V_DEP5}';") != 'approved,approved,revoked':
        raise AssertionError('version events are not ordered as they serialized')
    # 9. An unsealed version purged and committed takes no content in a later transaction.
    psql(f"begin;insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) values('version','{V_OPEN}','purged','Synthetic race purge','{OPERATOR}');"
         f"delete from private.market_observations where version_id='{V_OPEN}';commit;")
    refill = subprocess.run(['psql', URL, '-v', 'ON_ERROR_STOP=1', '-At', '-q'], input=INSERT_OBS.format(v=V_OPEN), text=True, capture_output=True)
    if refill.returncode == 0 or 'market_version_closed' not in refill.stderr:
        raise AssertionError('content entered a purged version: ' + refill.stdout + refill.stderr)
    print('PASS: market reference version state serializes content, quality, seal and purge across sessions')


if __name__ == '__main__':
    main()
