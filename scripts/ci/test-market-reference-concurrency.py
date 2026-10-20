#!/usr/bin/env python3
"""Real two-session races on the market reference ledger (ADR 0023), on the disposable CI database.

1. A REPEATABLE READ writer whose snapshot predates a committed seal cannot add content: the locked
   version state was updated after its snapshot, so PostgreSQL raises a serialization failure.
2. A READ COMMITTED writer that reaches a version while its seal is in progress waits, then sees the
   committed seal and is refused.
3. A derived seal that reaches a dependency while that dependency is being purged waits, then sees
   the purge and is refused.
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
V_RR, V_RC, V_DEP, V_DERIVED = (f'{P}-0000-4000-c000-00000000001{n}' for n in range(4))


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
create function pg_temp.line(p_end text,p_avail timestamptz,p_acq timestamptz) returns text language sql as $$
 select concat_ws('|','',p_end,to_char(p_avail at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),to_char(p_acq at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'14.9','percent_per_year','1');
$$;
create function pg_temp.direct(p_version uuid) returns void language sql as $$
 insert into private.market_versions(id,logical_id,parser_version,sha256,license)
  select p_version,'market:bcb-sgs-cdi:daily:00000000000000aa','race.v1',encode(extensions.digest(convert_to(concat_ws(E'\\n','parser:race.v1','methodology:null','inputs:a:{ACQ}',pg_temp.line('2026-10-16',avail,at)),'UTF8'),'sha256'),'hex'),lic from t;
 insert into private.market_version_inputs(version_id,acquisition_id) values(p_version,'{ACQ}');
 insert into private.market_observations(version_id,period_end,available_at,acquired_at,value,unit,scale) select p_version,'2026-10-16',avail,at,14.9,'percent_per_year','1' from t;
$$;
select pg_temp.direct('{V_RR}'),pg_temp.direct('{V_RC}'),pg_temp.direct('{V_DEP}');
select private.seal_market_version_v1('{V_DEP}');
insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) values('version','{V_DEP}','approved','Synthetic approval','{OPERATOR}');
insert into private.market_versions(id,logical_id,parser_version,methodology,sha256,license)
 select '{V_DERIVED}','market:bcb-sgs-cdi:path:00000000000000aa','race.path.v1','{{"id":"race","version":"1"}}',
  encode(extensions.digest(convert_to(concat_ws(E'\\n','parser:race.path.v1','methodology:{{"id": "race", "version": "1"}}','inputs:v:{V_DEP}',
   concat_ws('|','','2027-12-31',to_char(avail at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),to_char(at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'13','percent_per_year','1')),'UTF8'),'sha256'),'hex'),lic from t;
insert into private.market_version_inputs(version_id,dependency_version_id) values('{V_DERIVED}','{V_DEP}');
insert into private.market_observations(version_id,period_end,available_at,acquired_at,value,unit,scale) select '{V_DERIVED}','2027-12-31',avail,at,13,'percent_per_year','1' from t;
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
    print('PASS: market reference version state serializes seal, content and purge across sessions')


if __name__ == '__main__':
    main()
