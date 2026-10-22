#!/usr/bin/env python3
"""Real two-session races on the market scheduler (ADR 0023, M2 part 2), on the disposable CI database.

1. Two firings at once: the second answers busy for the schedule the first holds; after the first commits, the
   day's list exists once and a new firing finds it already fired.
2. Revocation against a firing, in both orders: a revocation started during a firing waits for it, and a firing
   started during a revocation answers busy; afterwards the revoked schedule does not fire.
3. The authority door held exclusively: the firing gives up after its lock timeout instead of waiting.
4. Two lists that disagree on a meeting's date, committed at once: the second waits for the first and refuses.
5. A list against a detail and a detail against a list, at once and disagreeing: the second refuses.
6. A list acquisition revoked during a firing waits for it; the next firing reports the listing unavailable.
7. The series anchor's communiqué revoked in its own transaction: the series firing reports it unavailable.
Every row here is synthetic and lives only in the disposable database. Meetings 150 and 9320 to 9323 are dated
in 2023 and do not collide with the other market races. Runs after the RG-01 races and before the outbox races; the
schedule is revoked and its queued jobs are cancelled when the races finish.
"""
import hashlib
import json
import os
import queue
import subprocess
import threading
import time

URL = os.environ['DATABASE_URL']
P = '3a820000'
FOUNDER, OPERATOR, WORKER = (f'{P}-0000-4000-8000-00000000000{n}' for n in (1, 2, 4))
TOKEN, TOKEN_ID = f'synthetic-scheduler-race-token-{P}-a', f'{P}-0000-4000-8000-000000000011'
SESSIONS = []
counter = iter(range(100, 1000))


def command():
    return f'{P}-0000-4000-a000-000000000{next(counter)}'


def psql(sql, check=True):
    done = subprocess.run(['psql', URL, '-v', 'ON_ERROR_STOP=1', '-At', '-q'], input=sql, text=True, capture_output=True)
    if check and done.returncode != 0:
        raise AssertionError(done.stdout + done.stderr)
    return done.stdout.strip() if check else (done.stdout + done.stderr).strip()


def session(name, first=''):
    proc = subprocess.Popen(['psql', URL, '-v', 'ON_ERROR_STOP=1', '-At', '-q'], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, bufsize=1, env={**os.environ, 'PGAPPNAME': name})
    proc.lines = queue.Queue()
    proc.seen = []
    def pump():
        for line in proc.stdout:
            proc.lines.put(line)
        proc.lines.put(None)
    SESSIONS.append(proc)
    proc.reader = threading.Thread(target=pump, daemon=True)
    proc.reader.start()
    proc.stdin.write(f"set statement_timeout='15s';begin;{first}\n")
    return proc


def barrier(proc, mark):
    proc.stdin.write(f"\\echo {mark}\n"); proc.stdin.flush()
    deadline = time.monotonic() + 15
    while True:
        try:
            line = proc.lines.get(timeout=max(0.1, deadline - time.monotonic()))
        except queue.Empty:
            raise AssertionError(f'{mark} not reached')
        if line is None:
            raise AssertionError(f'{mark}: session ended: ' + ''.join(proc.seen))
        if line.strip() == mark:
            return
        proc.seen.append(line)


def wait_for_lock(name):
    deadline = time.monotonic() + 10
    while psql(f"select count(*) from pg_stat_activity where application_name='{name}' and wait_event_type='Lock';") != '1':
        if time.monotonic() >= deadline:
            raise AssertionError(f'{name} did not wait')
        time.sleep(.05)


def finish(proc, expect_ok=True, end_with='commit'):
    try:
        proc.stdin.write(f'{end_with};\n'); proc.stdin.close()
    except (BrokenPipeError, ValueError):
        pass
    code = proc.wait(timeout=15)
    proc.reader.join(timeout=15)
    lines = list(proc.seen)
    while True:
        line = proc.lines.get()
        if line is None:
            break
        lines.append(line)
    out = ''.join(lines)
    if expect_ok and code != 0:
        raise AssertionError(out)
    return out


def last(out):
    return json.loads(out.splitlines()[-1])


def as_account(account):
    return f"select set_config('request.jwt.claim.sub','{account}',true);"


FIRE = f"{as_account(WORKER)}select private.worker_fire_market_schedules_v1('{TOKEN}')::text;"


def fire():
    return last(psql(f"begin;{FIRE}commit;"))


def copom(result):
    return next((x for x in result['schedules'] if x['kind'] == 'copom_communiques'), None)


def grant():
    return last(psql(f"select private.grant_market_acquisition_schedule_v1('{command()}','copom_communiques','{{\"size\":20}}','00:00',false,"
                     f"'Agenda sintética das corridas','{OPERATOR}')::text;"))['scheduleId']


def revoke_sql(schedule):
    return f"select private.revoke_market_acquisition_schedule_v1('{command()}','{schedule}','Revogação sintética da corrida','{OPERATOR}')::text;"


def occurrence(schedule, contract, request):
    return last(psql(f"select private.record_market_schedule_occurrence_v1('{command()}','{schedule}','{contract}','{request}','{OPERATOR}')::text;"))['jobId']


def claim(job):
    """Claim this job, deferring the others left queued."""
    psql(f"update private.market_acquisition_jobs set available_at=clock_timestamp()+interval '1 day' where status='queued' and id<>'{job}';")
    c = last(psql(f"begin;{as_account(WORKER)}select private.worker_claim_market_acquisition_v1('{TOKEN}')::text;commit;"))
    if c.get('jobId') != job:
        raise AssertionError(f'job not claimed: {c}')
    return c


def store(c, body):
    psql(f"insert into storage.objects(bucket_id,name,metadata,version) values('market-reference','{c['objectPath']}',"
         f"jsonb_build_object('size',{len(body)},'mimetype','application/json','eTag','\"{hashlib.md5(body).hexdigest()}\"'),'scheduler-race');")


def commit_sql(c, body):
    return (f"{as_account(WORKER)}select private.worker_commit_market_version_v1('{c['jobId']}','{c['capability']}','{c['leaseId']}',"
            f"'\\x{body.hex()}'::bytea,'application/json',clock_timestamp())::text;")


def fail(c):
    psql(f"begin;{as_account(WORKER)}select private.worker_fail_market_acquisition_v1('{c['jobId']}','{c['capability']}','{c['leaseId']}',"
         f"'verification_failed',false,'Conflito sintético da corrida');commit;")


def listing(meetings):
    return json.dumps({'conteudo': [{'nro_reuniao': m, 'dataReferencia': d, 'titulo': f'{m}ª reunião'} for m, d in meetings]}, ensure_ascii=False).encode()


def communique(meeting, reference):
    return json.dumps({'conteudo': [{'nro_reuniao': meeting, 'dataReferencia': reference, 'titulo': 'Copom mantém a taxa Selic em 13,75% a.a.',
                                     'textoComunicado': '<p>O Copom decidiu manter a taxa Selic em 13,75% a.a.</p>'}]}, ensure_ascii=False).encode()


def prepared(job, body):
    c = claim(job)
    store(c, body)
    return c


def conflict(first, first_body, second, second_body, label):
    """Commit both at once: the first holds the meeting, the second waits for it and refuses."""
    a = session(f'market_scheduler_{label}_first', commit_sql(first, first_body)); barrier(a, 'A')
    b = session(f'market_scheduler_{label}_second', commit_sql(second, second_body))
    wait_for_lock(f'market_scheduler_{label}_second')
    finish(a)
    out = finish(b, expect_ok=False)
    if 'market_copom_list_conflict' not in out:
        raise AssertionError(f'{label}: the second confirmation did not refuse: {out}')
    fail(second)


def main():
    psql(f"""
begin;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
select ('{P}-0000-4000-8000-00000000000'||n)::uuid,'authenticated','authenticated','{P}-'||n||'@example.invalid','{{}}','{{}}',now(),now(),false,false from unnest(array[1,2,4]) n;
insert into private.platform_principals(user_id,role,label) values('{FOUNDER}','founder','Synthetic scheduler race founder'),('{OPERATOR}','operator','Synthetic scheduler race operator');
insert into private.worker_tokens(id,label,token_sha256,execution_account_user_id) values('{TOKEN_ID}','Synthetic scheduler race worker',extensions.digest('{TOKEN}','sha256'),'{WORKER}');
do $$ begin
 if private.market_publisher_organization_v1() is null then
  perform private.register_market_publisher_v1('{P}-0000-4000-a000-000000000001','Offroad, referência de mercado','{FOUNDER}');
 end if;
end $$;
select private.record_market_source_revision_v1('{P}-0000-4000-a000-000000000011','bcb',jsonb_build_object('registryId','bcb_sgs','license',jsonb_build_object('kind','open',
 'license','ODbL-1.0','attribution','Banco Central do Brasil','evidenceIds',jsonb_build_array('bcb-catalog-meta-selic-432','bcb-catalog-atas-comunicados-copom',
 'bcb-site-termos-de-uso'),'retainAdoptedValues',true,'storeDays',null),'allowedHosts',jsonb_build_array('api.bcb.gov.br','www.bcb.gov.br'),'calendar','br_business_days',
 'expectedPublication','09:00','maximumAgeHours',30,'enabled',true,'reason','Fonte sintética das corridas do agendador'),'{OPERATOR}');
select private.release_market_acquisition_transport_v1('{P}-0000-4000-a000-000000000021',true,'{OPERATOR}','Synthetic opening for the scheduler races');
select private.grant_market_acquisition_delegation_v1('{P}-0000-4000-a000-000000000022','{TOKEN_ID}','bcb','Synthetic delegation for the scheduler races','{OPERATOR}');
commit;
""")
    schedule = grant()

    # 1. Two firings at once: the second answers busy; the day's list exists once.
    a = session('market_scheduler_fire_a', FIRE); barrier(a, 'A')
    second = copom(fire())
    if second.get('status') != 'busy':
        raise AssertionError(f'a second firing did not answer busy: {second}')
    first = copom(last(finish(a)))
    if first.get('list') != 'fired':
        raise AssertionError(f'the first firing did not fire the list: {first}')
    if copom(fire()).get('list') != 'already_fired' or psql(
            f"select count(*) from private.market_schedule_occurrences where schedule_id='{schedule}' and occurrence_key like 'list:%';") != '1':
        raise AssertionError('the day has more than one list occurrence')

    # 2a. A revocation started during a firing waits for it; then the schedule does not fire.
    a = session('market_scheduler_fire_held', FIRE); barrier(a, 'A')
    b = session('market_scheduler_revoker_waits', revoke_sql(schedule))
    wait_for_lock('market_scheduler_revoker_waits')
    finish(a); finish(b)
    if copom(fire()) is not None:
        raise AssertionError('a revoked schedule fired')
    # 2b. A firing started during a revocation answers busy; then the schedule does not fire.
    schedule = grant()
    b = session('market_scheduler_revoker_held', revoke_sql(schedule)); barrier(b, 'B')
    held = copom(fire())
    if held is None or held.get('status') != 'busy':
        raise AssertionError(f'a firing during a revocation did not answer busy: {held}')
    finish(b)
    if copom(fire()) is not None:
        raise AssertionError('a schedule revoked during a firing fired')
    schedule = grant()

    # 3. The authority door held exclusively: the firing gives up after its lock timeout.
    b = session('market_scheduler_door_holder', 'select pg_advisory_xact_lock(7340501,23);'); barrier(b, 'B')
    started = time.monotonic()
    out = psql(f"begin;{FIRE}commit;", check=False)
    elapsed = time.monotonic() - started
    finish(b, end_with='rollback')
    if 'lock timeout' not in out or elapsed > 10:
        raise AssertionError(f'a firing behind the exclusive door did not give up in time ({elapsed:.1f}s): {out}')

    # 4. Two lists that disagree on a meeting's date: the second waits and refuses.
    l1 = prepared(occurrence(schedule, 'bcb-copom-comunicados-lista', '{"size":20}'), listing([(9320, '2023-03-22')]))
    l2 = prepared(occurrence(schedule, 'bcb-copom-comunicados-lista', '{"size":20}'), listing([(9320, '2023-03-21')]))
    conflict(l1, listing([(9320, '2023-03-22')]), l2, listing([(9320, '2023-03-21')]), 'list_list')

    # 5a. A detail first, then a list naming its meeting with another date.
    d1 = prepared(occurrence(schedule, 'bcb-copom-comunicados-detalhe', '{"meeting":9322}'), communique(9322, '2023-05-03'))
    l3 = prepared(occurrence(schedule, 'bcb-copom-comunicados-lista', '{"size":20}'), listing([(9322, '2023-05-02')]))
    conflict(d1, communique(9322, '2023-05-03'), l3, listing([(9322, '2023-05-02')]), 'detail_list')
    # 5b. A list first, then a detail of the listed meeting with another date.
    l4 = prepared(occurrence(schedule, 'bcb-copom-comunicados-lista', '{"size":20}'), listing([(9323, '2023-06-21')]))
    d2 = prepared(occurrence(schedule, 'bcb-copom-comunicados-detalhe', '{"meeting":9323}'), communique(9323, '2023-06-20'))
    conflict(l4, listing([(9323, '2023-06-21')]), d2, communique(9323, '2023-06-20'), 'list_detail')

    # 6. The list that named 9320 is revoked during a firing: the revocation waits; the next firing reports it.
    acquisition = psql(f"select acquisition_id from private.market_acquisition_jobs where id='{l1['jobId']}';")
    a = session('market_scheduler_fire_reading', FIRE); barrier(a, 'A')
    b = session('market_scheduler_list_revoker', f"insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) "
                f"values('acquisition','{acquisition}','revoked','Revogação sintética da lista durante o disparo','{OPERATOR}');")
    wait_for_lock('market_scheduler_list_revoker')
    finish(a)
    out = finish(b)
    if 'deadlock' in out:
        raise AssertionError('the list revocation deadlocked: ' + out)
    blocked = copom(fire()).get('blocked', [])
    if {'meeting': 9320, 'reason': 'listing_unavailable'} not in blocked:
        raise AssertionError(f'a revoked listing was not reported: {blocked}')

    # 7. The anchor's communiqué revoked: the series cannot reuse it and reports it unavailable.
    anchor = prepared(occurrence(schedule, 'bcb-copom-comunicados-detalhe', '{"meeting":150}'), communique(150, '2023-02-01'))
    anchored = last(psql(f"begin;{commit_sql(anchor, communique(150, '2023-02-01'))}commit;"))
    psql(f"select private.grant_market_acquisition_schedule_v1('{command()}','series_432','{{\"coverageStart\":\"2023-02-10\"}}','00:00',false,"
         f"'Agenda sintética da série nas corridas','{OPERATOR}');")
    psql(f"insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) "
         f"values('acquisition','{anchored['acquisitionId']}','revoked','Revogação sintética do comunicado de âncora','{OPERATOR}');")
    series = next(x for x in fire()['schedules'] if x['kind'] == 'series_432')
    if series.get('reason') != 'communique_unavailable' or series.get('meeting') != 150:
        raise AssertionError(f'an unreadable anchor was not reported: {series}')
    psql(f"select private.revoke_market_acquisition_schedule_v1('{command()}',id,'Fim das corridas do agendador','{OPERATOR}') "
         f"from private.market_acquisition_schedules where kind='series_432' and revoked_at is null;")

    psql(revoke_sql(schedule))
    psql(f"""do $$ declare j uuid;begin
 for j in select o.job_id from private.market_schedule_occurrences o join private.market_acquisition_jobs q on q.id=o.job_id
  join private.market_acquisition_schedules s on s.id=o.schedule_id where s.granted_by='{OPERATOR}' and q.status='queued' loop
  perform private.cancel_market_acquisition_v1(gen_random_uuid(),j,'Fim das corridas do agendador','{OPERATOR}');
 end loop;
end $$;""")
    print('PASS: market schedules fire once per hold, yield to revocation and to the exclusive door, and refuse disagreeing lists and details')


def cleanup():
    for proc in SESSIONS:
        if proc.poll() is None:
            proc.kill()
    psql("select pg_terminate_backend(pid) from pg_stat_activity where application_name like 'market_scheduler_%' and pid<>pg_backend_pid();", check=False)


if __name__ == '__main__':
    try:
        main()
    finally:
        cleanup()
