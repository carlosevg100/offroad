#!/usr/bin/env python3
"""Real two-session races on the market scheduler (ADR 0023, M2 part 2), on the disposable CI database.

1. Two firings at once: the second answers busy for the schedule the first holds; after the first commits, the
   day's list exists once and a new firing finds it already fired.
2. Revocation of the schedule against a firing, in both orders: the revocation waits for the firing, a firing
   during a revocation answers busy, and afterwards the revoked schedule does not fire.
3. Waits are bounded: behind the exclusive authority door, a locked worker token or a locked worker account the
   firing gives up after its lock timeout; outside READ COMMITTED it refuses at the door. The worker identity
   writes the token's row, so firings with one token serialize there; concurrent firings here use two tokens.
4. Revocation of the delegation, of the grantor's principal, of the worker token and a block of the worker
   account against a firing, in both orders: whichever commits first, the next decision sees it.
5. Lists and details that disagree on a meeting's date, at once and in both orders: only the first confirms.
6. A list acquisition revoked during a firing waits for it; the next firing reports the listing unavailable,
   and a valid list that names the meeting again rediscovers it.
7. The series anchor's communiqué revoked: the series firing reports it unavailable.
8. The series window under concurrent writes: an approved version that does not close the gap is no progress;
   a confirmation holds its source until it commits, so a decision meanwhile answers busy without writing; when a
   communiqué of the last version's closure is revoked the series reports it and is not replaced; a version
   revoked during a firing waits for it; a quarantine recorded while a decision reads the version is waited for,
   and a quarantine without its own evaluation holds the window for the operator.
9. A firing against the RG-01 monitor and against a publication: no deadlock.
Every row here is synthetic and lives only in the disposable database. Meetings 150 to 153 and 9320 to 9323 are
dated between February and early September 2025: after every window of the outbox races, which are in 2024, so
none of them anchors those versions, and before the meetings of the acquisition races. Runs after the RG-01 races and before the outbox
races; the schedules are revoked and their queued jobs are cancelled when the races finish.
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
FOUNDER, OPERATOR, WORKER, WORKER2, WORKER3, OP_B, OP_C, WORKER4 = (f'{P}-0000-4000-8000-00000000000{n}' for n in (1, 2, 4, 5, 6, 7, 8, 9))
TOKEN, TOKEN_ID = f'synthetic-scheduler-race-token-{P}-a', f'{P}-0000-4000-8000-000000000011'
TOKEN2, TOKEN2_ID = f'synthetic-scheduler-race-token-{P}-b', f'{P}-0000-4000-8000-000000000012'
TOKEN3, TOKEN3_ID = f'synthetic-scheduler-race-token-{P}-c', f'{P}-0000-4000-8000-000000000013'
TOKEN4, TOKEN4_ID = f'synthetic-scheduler-race-token-{P}-d', f'{P}-0000-4000-8000-000000000014'
SESSIONS = []
counter = iter(range(100, 1000))


def command():
    return f'{P}-0000-4000-a000-000000000{next(counter)}'


def psql(sql, check=True):
    done = subprocess.run(['psql', URL, '-v', 'ON_ERROR_STOP=1', '-At', '-q'], input=sql, text=True, capture_output=True)
    if check and done.returncode != 0:
        raise AssertionError(done.stdout + done.stderr)
    return done.stdout.strip() if check else (done.stdout + done.stderr).strip()


def session(name, first='', isolation=''):
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
    proc.stdin.write(f"set statement_timeout='15s';begin{isolation};{first}\n")
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


def waiting(name):
    return psql(f"select count(*) from pg_stat_activity where application_name='{name}' and wait_event_type='Lock';") == '1'


def wait_for_lock(name):
    deadline = time.monotonic() + 10
    while not waiting(name):
        if time.monotonic() >= deadline:
            raise AssertionError(f'{name} did not wait')
        time.sleep(.05)


def finish(proc, expect_ok=True, end_with='commit'):
    try:
        proc.stdin.write(f'{end_with};\n'); proc.stdin.close()
    except (BrokenPipeError, ValueError):
        pass
    code = proc.wait(timeout=20)
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
    return json.loads(out.strip().splitlines()[-1])


def as_account(account):
    return f"select set_config('request.jwt.claim.sub','{account}',true);"


def fire_sql(token=TOKEN, account=WORKER):
    return f"{as_account(account)}select private.worker_fire_market_schedules_v1('{token}')::text;"


FIRE = fire_sql()
# The worker identity writes the token's row, so concurrent firings in these races use a second token.
FIRE2 = fire_sql(TOKEN2, WORKER2)


def fire(token=TOKEN, account=WORKER):
    return last(psql(f"begin;{fire_sql(token, account)}commit;"))


def entry(result, kind):
    return next((x for x in result['schedules'] if x['kind'] == kind), None)


def copom(result):
    return entry(result, 'copom_communiques')


def grant(kind='copom_communiques', params='{"size":20}', actor=OPERATOR):
    return last(psql(f"select private.grant_market_acquisition_schedule_v1('{command()}','{kind}','{params}','00:00',false,"
                     f"'Agenda sintética das corridas','{actor}')::text;"))['scheduleId']


def revoke_sql(schedule):
    return f"select private.revoke_market_acquisition_schedule_v1('{command()}','{schedule}','Revogação sintética da corrida','{OPERATOR}')::text;"


def occurrence(schedule, contract, request):
    return last(psql(f"select private.record_market_schedule_occurrence_v1('{command()}','{schedule}','{contract}','{request}','{OPERATOR}')::text;"))['jobId']


def enqueue(contract, request):
    return last(psql(f"select private.enqueue_market_contract_acquisition_v1('{command()}','{contract}','{request}','Aquisição sintética das corridas do agendador','{OPERATOR}')::text;"))['jobId']


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


def acquire(job, body):
    c = prepared(job, body)
    return last(psql(f"begin;{commit_sql(c, body)}commit;"))


def fail(c):
    psql(f"begin;{as_account(WORKER)}select private.worker_fail_market_acquisition_v1('{c['jobId']}','{c['capability']}','{c['leaseId']}',"
         f"'verification_failed',false,'Conflito sintético da corrida');commit;")


def listing(meetings):
    return json.dumps({'conteudo': [{'nro_reuniao': m, 'dataReferencia': d, 'titulo': f'{m}ª reunião'} for m, d in meetings]}, ensure_ascii=False).encode()


def communique(meeting, reference):
    return json.dumps({'conteudo': [{'nro_reuniao': meeting, 'dataReferencia': reference, 'titulo': 'Copom mantém a taxa Selic em 13,75% a.a.',
                                     'textoComunicado': '<p>O Copom decidiu manter a taxa Selic em 13,75% a.a.</p>'}]}, ensure_ascii=False).encode()


def series_body(start, end, skip=None):
    import datetime
    first, final = datetime.date.fromisoformat(start), datetime.date.fromisoformat(end)
    rows = [{'data': (first + datetime.timedelta(days=n)).strftime('%d/%m/%Y'), 'valor': '13.75'} for n in range((final - first).days + 1)
            if (first + datetime.timedelta(days=n)).isoformat() != skip]
    return json.dumps(rows).encode()


def prepared(job, body):
    c = claim(job)
    store(c, body)
    return c


def revoke_event(kind, subject, reason):
    return (f"insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) "
            f"values('{kind}','{subject}','revoked','{reason}','{OPERATOR}');")


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


def gives_up(name, holder_sql, label):
    """A session holds a lock the firing needs: the firing gives up after its lock timeout."""
    b = session(f'market_scheduler_{name}_holder', holder_sql); barrier(b, 'B')
    started = time.monotonic()
    out = psql(f"begin;{FIRE}commit;", check=False)
    elapsed = time.monotonic() - started
    finish(b, end_with='rollback')
    if 'lock timeout' not in out or elapsed > 10:
        raise AssertionError(f'{label}: the firing did not give up in time ({elapsed:.1f}s): {out}')


def both_orders(name, change_sql, restore, observe, token=TOKEN, account=WORKER):
    """The change commits after a firing that holds what it changes, then before a firing that waits for it."""
    a = session(f'market_scheduler_{name}_fire_first', fire_sql(token, account)); barrier(a, 'A')
    b = session(f'market_scheduler_{name}_change_waits', change_sql())
    wait_for_lock(f'market_scheduler_{name}_change_waits')
    finish(a); finish(b)
    observe(psql(f"begin;{fire_sql(token, account)}commit;", check=False), 'after a change that waited')
    restore()
    b = session(f'market_scheduler_{name}_change_first', change_sql()); barrier(b, 'B')
    a = session(f'market_scheduler_{name}_fire_waits', fire_sql(token, account))
    wait_for_lock(f'market_scheduler_{name}_fire_waits')
    finish(b)
    observe(finish(a, expect_ok=False), 'after waiting for the change')
    restore()


def blocked_with(reason, kind='copom_communiques'):
    def observe(out, moment):
        try:
            got = entry(last(out), kind)
        except (ValueError, IndexError):
            raise AssertionError(f'{reason} {moment}: {out}')
        if got is None or got.get('reason') != reason:
            raise AssertionError(f'{reason} {moment}: {out}')
    return observe


def refused_with(code):
    def observe(out, moment):
        if code not in out:
            raise AssertionError(f'{code} {moment}: {out}')
    return observe


def main():
    psql(f"""
begin;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
select ('{P}-0000-4000-8000-00000000000'||n)::uuid,'authenticated','authenticated','{P}-'||n||'@example.invalid','{{}}','{{}}',now(),now(),false,false from unnest(array[1,2,4,5,6,7,8,9]) n;
insert into private.platform_principals(user_id,role,label) values('{FOUNDER}','founder','Synthetic scheduler race founder'),('{OPERATOR}','operator','Synthetic scheduler race operator'),
 ('{OP_B}','operator','Synthetic scheduler race operator B'),('{OP_C}','operator','Synthetic scheduler race operator C');
insert into private.worker_tokens(id,label,token_sha256,execution_account_user_id) values('{TOKEN_ID}','Synthetic scheduler race worker',extensions.digest('{TOKEN}','sha256'),'{WORKER}'),
 ('{TOKEN2_ID}','Synthetic scheduler race worker B',extensions.digest('{TOKEN2}','sha256'),'{WORKER2}'),
 ('{TOKEN3_ID}','Synthetic scheduler race worker C',extensions.digest('{TOKEN3}','sha256'),'{WORKER3}'),
 ('{TOKEN4_ID}','Synthetic scheduler race worker D',extensions.digest('{TOKEN4}','sha256'),'{WORKER4}');
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
select private.grant_market_acquisition_delegation_v1('{P}-0000-4000-a000-000000000023','{TOKEN2_ID}','bcb','Synthetic delegation for the scheduler races B','{OPERATOR}');
select private.grant_market_acquisition_delegation_v1('{P}-0000-4000-a000-000000000024','{TOKEN3_ID}','bcb','Synthetic delegation for the scheduler races C','{OPERATOR}');
select private.grant_market_acquisition_delegation_v1('{P}-0000-4000-a000-000000000025','{TOKEN4_ID}','bcb','Synthetic delegation for the scheduler races D','{OPERATOR}');
commit;
""")
    schedule = grant()

    # 1. Two firings at once: the second answers busy; the day's list exists once.
    a = session('market_scheduler_fire_a', FIRE); barrier(a, 'A')
    second = copom(fire(TOKEN2, WORKER2))
    if second.get('status') != 'busy':
        raise AssertionError(f'a second firing did not answer busy: {second}')
    first = copom(last(finish(a)))
    if first.get('list') != 'fired':
        raise AssertionError(f'the first firing did not fire the list: {first}')
    # The same token in two workers: the second waits on the token's row, then finds the list already fired.
    a = session('market_scheduler_same_token_a', FIRE); barrier(a, 'A')
    b = session('market_scheduler_same_token_b', FIRE)
    wait_for_lock('market_scheduler_same_token_b')
    finish(a)
    if copom(last(finish(b))).get('list') != 'already_fired':
        raise AssertionError('a second worker with the same token fired the list again')
    replay = copom(fire())
    if replay.get('list') != 'already_fired' or replay.get('listJobId') != first.get('listJobId') or psql(
            f"select count(*) from private.market_schedule_occurrences where schedule_id='{schedule}' and occurrence_key like 'list:%';") != '1':
        raise AssertionError(f'the day has more than one list occurrence: {replay}')

    # 2. Revocation of the schedule against a firing, in both orders.
    a = session('market_scheduler_fire_held', FIRE); barrier(a, 'A')
    b = session('market_scheduler_revoker_waits', revoke_sql(schedule))
    wait_for_lock('market_scheduler_revoker_waits')
    finish(a); finish(b)
    if copom(fire()) is not None:
        raise AssertionError('a revoked schedule fired')
    schedule = grant()
    b = session('market_scheduler_revoker_held', revoke_sql(schedule)); barrier(b, 'B')
    held = copom(fire())
    if held is None or held.get('status') != 'busy':
        raise AssertionError(f'a firing during a revocation did not answer busy: {held}')
    finish(b)
    if copom(fire()) is not None:
        raise AssertionError('a schedule revoked during a firing fired')
    schedule = grant()

    # 3. Bounded waits and the isolation the door requires.
    gives_up('door', 'select pg_advisory_xact_lock(7340501,23);', 'exclusive door')
    gives_up('token', f"select 1 from private.worker_tokens where id='{TOKEN_ID}' for update;", 'locked worker token')
    gives_up('account', f"select 1 from auth.users where id='{WORKER}' for update;", 'locked worker account')
    a = session('market_scheduler_repeatable_read', FIRE, isolation=' isolation level repeatable read')
    out = finish(a, expect_ok=False)
    if 'market_isolation_unsupported' not in out:
        raise AssertionError('a firing outside READ COMMITTED was not refused: ' + out)

    # 4. Revocations and blocks of what the firing depends on, in both orders.
    def delegation():
        return psql(f"select id from private.market_acquisition_delegations where worker_token_id='{TOKEN_ID}' and revoked_at is null;")
    both_orders('delegation', lambda: f"select private.revoke_market_acquisition_delegation_v1('{command()}','{delegation()}','Revogação sintética durante o disparo','{OPERATOR}');",
                lambda: psql(f"select private.grant_market_acquisition_delegation_v1('{command()}','{TOKEN_ID}','bcb','Synthetic delegation after the race','{OPERATOR}');"),
                blocked_with('delegation_missing'))
    grantors = iter([OP_B, OP_C])
    state = {'grantor': None}
    def next_grantor():
        if schedule_holder['id']:
            psql(revoke_sql(schedule_holder['id']))
        state['grantor'] = next(grantors, OPERATOR)
        schedule_holder['id'] = grant(actor=state['grantor'])
    schedule_holder = {'id': schedule}
    next_grantor()
    both_orders('grantor', lambda: f"update private.platform_principals set revoked_at=clock_timestamp(),revoked_by='{FOUNDER}',"
                f"revoked_reason='Revogação sintética do concedente' where user_id='{state['grantor']}';",
                next_grantor, blocked_with('grantor_inactive'))
    schedule = schedule_holder['id']
    both_orders('grantor_account', lambda: f"update auth.users set banned_until=clock_timestamp()+interval '1 day' where id='{OPERATOR}';",
                lambda: psql(f"update auth.users set banned_until=null where id='{OPERATOR}';"), blocked_with('grantor_inactive'))
    both_orders('account', lambda: f"update auth.users set banned_until=clock_timestamp()+interval '1 day' where id='{WORKER}';",
                lambda: psql(f"update auth.users set banned_until=null where id='{WORKER}';"), refused_with('worker_account_binding_required'))
    tokens = iter([(TOKEN3, TOKEN3_ID, WORKER3), (TOKEN4, TOKEN4_ID, WORKER4)])
    current = {}
    def next_token():
        current['token'], current['id'], current['account'] = next(tokens, (TOKEN, TOKEN_ID, WORKER))
    next_token()
    for order in ('fire_first', 'change_first'):
        token, token_id, account = current['token'], current['id'], current['account']
        change = f"update private.worker_tokens set status='revoked',revoked_at=clock_timestamp() where id='{token_id}';"
        if order == 'fire_first':
            a = session('market_scheduler_token_fire_first', fire_sql(token, account)); barrier(a, 'A')
            b = session('market_scheduler_token_change_waits', change)
            wait_for_lock('market_scheduler_token_change_waits')
            finish(a); finish(b)
            out = psql(f"begin;{fire_sql(token, account)}commit;", check=False)
        else:
            b = session('market_scheduler_token_change_first', change); barrier(b, 'B')
            a = session('market_scheduler_token_fire_waits', fire_sql(token, account))
            wait_for_lock('market_scheduler_token_fire_waits')
            finish(b)
            out = finish(a, expect_ok=False)
        if 'worker_token_invalid' not in out:
            raise AssertionError(f'a revoked token fired ({order}): {out}')
        next_token()

    # 5. Lists and details that disagree on a meeting's date: only the first confirms.
    l1 = prepared(occurrence(schedule, 'bcb-copom-comunicados-lista', '{"size":20}'), listing([(9320, '2025-03-22')]))
    l2 = prepared(occurrence(schedule, 'bcb-copom-comunicados-lista', '{"size":20}'), listing([(9320, '2025-03-21')]))
    conflict(l1, listing([(9320, '2025-03-22')]), l2, listing([(9320, '2025-03-21')]), 'list_list')
    d1 = prepared(occurrence(schedule, 'bcb-copom-comunicados-detalhe', '{"meeting":9322}'), communique(9322, '2025-05-03'))
    l3 = prepared(occurrence(schedule, 'bcb-copom-comunicados-lista', '{"size":20}'), listing([(9322, '2025-05-02')]))
    conflict(d1, communique(9322, '2025-05-03'), l3, listing([(9322, '2025-05-02')]), 'detail_list')
    l4 = prepared(occurrence(schedule, 'bcb-copom-comunicados-lista', '{"size":20}'), listing([(9323, '2025-06-21')]))
    d2 = prepared(occurrence(schedule, 'bcb-copom-comunicados-detalhe', '{"meeting":9323}'), communique(9323, '2025-06-20'))
    conflict(l4, listing([(9323, '2025-06-21')]), d2, communique(9323, '2025-06-20'), 'list_detail')

    # 6. The list that named 9320 is revoked during a firing; a valid list rediscovers the meeting.
    acquisition = psql(f"select acquisition_id from private.market_acquisition_jobs where id='{l1['jobId']}';")
    a = session('market_scheduler_fire_reading', FIRE); barrier(a, 'A')
    b = session('market_scheduler_list_revoker', revoke_event('acquisition', acquisition, 'Revogação sintética da lista durante o disparo'))
    wait_for_lock('market_scheduler_list_revoker')
    finish(a)
    if 'deadlock' in finish(b):
        raise AssertionError('the list revocation deadlocked')
    blocked = copom(fire()).get('blocked', [])
    if {'meeting': 9320, 'reason': 'listing_unavailable'} not in blocked:
        raise AssertionError(f'a revoked listing was not reported: {blocked}')
    acquire(occurrence(schedule, 'bcb-copom-comunicados-lista', '{"size":20}'), listing([(9320, '2025-03-22')]))
    found = copom(fire())
    if {'meeting': 9320, 'reason': 'listing_unavailable'} in found.get('blocked', []) or (
            9320 not in found.get('inFlight', []) and 9320 not in [d['meeting'] for d in found.get('details', [])]):
        raise AssertionError(f'a valid list did not rediscover the meeting: {found}')

    # 7. The anchor's communiqué revoked: the series cannot reuse it and reports it unavailable.
    anchored = acquire(occurrence(schedule, 'bcb-copom-comunicados-detalhe', '{"meeting":150}'), communique(150, '2025-02-01'))
    grant('series_432', '{"coverageStart":"2025-02-10"}')
    psql(revoke_event('acquisition', anchored['acquisitionId'], 'Revogação sintética do comunicado de âncora'))
    series = entry(fire(), 'series_432')
    if series.get('reason') != 'communique_unavailable' or series.get('meeting') != 150:
        raise AssertionError(f'an unreadable anchor was not reported: {series}')
    psql(f"select private.revoke_market_acquisition_schedule_v1('{command()}',id,'Fim do cenário sintético','{OPERATOR}') "
         f"from private.market_acquisition_schedules where kind='series_432' and revoked_at is null;")

    # 8. The series window under concurrent writes; only the series schedule is active.
    psql(revoke_sql(schedule))
    acquire(enqueue('bcb-copom-comunicados-detalhe', '{"meeting":151}'), communique(151, '2025-08-01'))
    series_schedule = grant('series_432', '{"coverageStart":"2025-08-10"}')
    window = '{"window":{"start":"2025-08-10","end":"2025-08-20"}}'
    v = acquire(occurrence(series_schedule, 'bcb-sgs-432-endpoint', window), series_body('2025-08-10', '2025-08-20', skip='2025-08-10'))
    if v['quality']['status'] != 'approved':
        psql(f"insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) "
             f"values('version','{v['versionId']}','approved','Aprovação sintética do operador','{OPERATOR}');")
    decision = entry(fire(), 'series_432')
    if decision.get('reason') != 'no_progress' or decision.get('windowStart') != '2025-08-10':
        raise AssertionError(f'an approved version that leaves the gap was not reported: {decision}')
    late_body = series_body('2025-08-10', '2025-08-12')
    late = prepared(occurrence(series_schedule, 'bcb-sgs-432-endpoint', '{"window":{"start":"2025-08-10","end":"2025-08-12"}}'), late_body)
    # A confirmation holds its source through the attempt's gate until it commits: the decision answers busy
    # without writing, and only the next firing reads the confirmed version.
    b = session('market_scheduler_confirmation', commit_sql(late, late_body)); barrier(b, 'B')
    occurrences = psql(f"select count(*) from private.market_schedule_occurrences where schedule_id='{series_schedule}';")
    decision = entry(fire(TOKEN2, WORKER2), 'series_432')
    if decision.get('status') != 'busy' or psql(f"select count(*) from private.market_schedule_occurrences where schedule_id='{series_schedule}';") != occurrences:
        raise AssertionError(f'a decision during a confirmation did not answer busy without writing: {decision}')
    confirmed = last(finish(b))
    acquire(enqueue('bcb-copom-comunicados-detalhe', '{"meeting":152}'), communique(152, '2025-08-05'))
    first_anchor = psql("select reference_acquisition_id from private.market_copom_meetings where meeting=151;")
    psql(revoke_event('acquisition', first_anchor, 'Revogação sintética do comunicado do fecho'))
    a = session('market_scheduler_closure_reading', FIRE); barrier(a, 'A')
    b = session('market_scheduler_version_revoker', revoke_event('version', confirmed['versionId'], 'Revogação sintética da versão durante o disparo'))
    wait_for_lock('market_scheduler_version_revoker')
    decision = entry(last(finish(a)), 'series_432')
    if 'deadlock' in finish(b):
        raise AssertionError('the version revocation deadlocked')
    if decision.get('reason') != 'communique_unavailable' or decision.get('meeting') != 151:
        raise AssertionError(f'a communiqué of the closure was not reported: {decision}')
    decision = entry(fire(), 'series_432')
    if decision.get('reason') != 'communique_unavailable' or decision.get('meeting') != 151:
        raise AssertionError(f'a revoked version replaced its unavailable communiqué: {decision}')

    # 8b. The quality decision of the last version survives what happens to it later.
    def series_schedule_from(start):
        psql(f"select private.revoke_market_acquisition_schedule_v1('{command()}',id,'Troca sintética da agenda','{OPERATOR}') "
             f"from private.market_acquisition_schedules where kind='series_432' and revoked_at is null;")
        return grant('series_432', json.dumps({'coverageStart': start}))
    divergent_schedule = series_schedule_from('2025-08-25')
    divergent = acquire(occurrence(divergent_schedule, 'bcb-sgs-432-endpoint', '{"window":{"start":"2025-08-25","end":"2025-08-30"}}'),
                        series_body('2025-08-25', '2025-08-30').replace(b'13.75', b'13.50'))
    if divergent['quality']['status'] != 'quarantined' or entry(fire(), 'series_432').get('reason') != 'series_disagreement':
        raise AssertionError(f'a divergent version was not held for the operator: {divergent}')
    psql(revoke_event('version', divergent['versionId'], 'Revogação sintética da versão divergente'))
    decision = entry(fire(), 'series_432')
    if decision.get('reason') != 'series_disagreement':
        raise AssertionError(f'revoking a divergent quarantine released the window: {decision}')
    later_schedule = series_schedule_from('2025-09-01')
    later = acquire(occurrence(later_schedule, 'bcb-sgs-432-endpoint', '{"window":{"start":"2025-09-01","end":"2025-09-06"}}'), series_body('2025-09-01', '2025-09-06'))
    if later['quality']['status'] != 'approved':
        raise AssertionError(f'a clean version was not approved: {later}')
    # The operator quarantines the version while a decision reads it: the decision waits at the version's state
    # and then holds the window for the operator, since the quarantine has no evaluation of its own.
    b = session('market_scheduler_quarantine', f"insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) "
                f"values('version','{later['versionId']}','quarantined','Quarentena sintética do operador','{OPERATOR}');"); barrier(b, 'B')
    a = session('market_scheduler_decision_waits_quarantine', FIRE2)
    wait_for_lock('market_scheduler_decision_waits_quarantine')
    finish(b)
    decision = entry(last(finish(a)), 'series_432')
    if decision.get('reason') != 'series_quality_unclassified':
        raise AssertionError(f'a quarantine without its evaluation was classified: {decision}')
    internal_schedule = series_schedule_from('2025-09-08')
    internal = acquire(enqueue('bcb-copom-comunicados-detalhe', '{"meeting":153}'), communique(153, '2025-09-09'))
    gapped = acquire(occurrence(internal_schedule, 'bcb-sgs-432-endpoint', '{"window":{"start":"2025-09-08","end":"2025-09-14"}}'),
                     series_body('2025-09-08', '2025-09-14', skip='2025-09-11'))
    if gapped['quality']['status'] != 'quarantined':
        raise AssertionError(f'a gapped version was approved: {gapped}')
    psql(revoke_event('acquisition', internal['acquisitionId'], 'Revogação sintética do comunicado interno'))
    occurrences = psql(f"select count(*) from private.market_schedule_occurrences where schedule_id='{internal_schedule}';")
    decision = entry(fire(), 'series_432')
    if decision.get('reason') != 'communique_unavailable' or decision.get('meeting') != 153 or psql(
            f"select count(*) from private.market_schedule_occurrences where schedule_id='{internal_schedule}';") != occurrences:
        raise AssertionError(f'a revoked internal communiqué was replaced: {decision}')

    # 9. A firing against the RG-01 monitor and against a publication, which waits for the source: no deadlock.
    declaration = psql("select id from private.market_regime_declarations where active order by id limit 1;")
    if not declaration:
        raise AssertionError('no active RG-01 declaration to run against the firing')
    psql(f"insert into private.market_rg01_requests(regime_id,trigger_id,key) select regime_id,trigger_id,'hour:2099-03-01T01' "
         f"from private.market_regime_declarations where id='{declaration}';")
    a = session('market_scheduler_fire_monitor', FIRE); barrier(a, 'A')
    b = session('market_scheduler_monitor', f"select private.run_market_rg01_v1('{declaration}')::text;")
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline and not waiting('market_scheduler_monitor') and b.lines.empty():
        time.sleep(.05)
    first_out = finish(a)
    run = last(finish(b))
    if 'deadlock' in first_out or run.get('status') != 'evaluated':
        raise AssertionError(f'the monitor did not evaluate beside the firing: {run}')
    a = session('market_scheduler_fire_publication', FIRE); barrier(a, 'A')
    if entry(last(''.join(a.seen) or '{"schedules":[]}'), 'series_432') is None:
        raise AssertionError('no schedule held the source during the publication race')
    b = session('market_scheduler_publication', f"select private.publish_market_odbl_release_v1('{command()}',repeat('a',40),'{FOUNDER}')::text;")
    wait_for_lock('market_scheduler_publication')
    finish(a)
    published = finish(b, end_with='rollback')
    if 'deadlock' in published or 'releaseNumber' not in published:
        raise AssertionError('the publication did not complete after the firing: ' + published)

    psql(f"""do $$ declare j uuid;s uuid;begin
 for j in select o.job_id from private.market_schedule_occurrences o join private.market_acquisition_jobs q on q.id=o.job_id
  join private.market_acquisition_schedules s on s.id=o.schedule_id where s.granted_by in ('{OPERATOR}','{OP_B}','{OP_C}') and q.status='queued' loop
  perform private.cancel_market_acquisition_v1(gen_random_uuid(),j,'Fim das corridas do agendador','{OPERATOR}');
 end loop;
 for s in select id from private.market_acquisition_schedules where revoked_at is null and granted_by in ('{OPERATOR}','{OP_B}','{OP_C}') loop
  perform private.revoke_market_acquisition_schedule_v1(gen_random_uuid(),s,'Fim das corridas do agendador','{OPERATOR}');
 end loop;
end $$;""")
    print('PASS: market schedules fire once per hold, serialize with every revocation they depend on, bound their waits, '
          'refuse disagreeing lists and details, and never replace an unreadable communiqué')


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
