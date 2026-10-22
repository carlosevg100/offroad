#!/usr/bin/env python3
"""Real two-session races on the RG-01 monitor (ADR 0023, M2 part 6), on the disposable CI database.

1. Two evaluations of one regime at once: the second answers busy at once and writes nothing; after the
   first commits, with no request left, a run is idle.
2. A version recorded before K whose transaction commits between the evaluation's discovery of its candidates
   and its snapshot: the evaluation waits at the source's read lock, sees a version outside the set it locked
   and answers retry without writing; the next run reads it. A version confirmed after K stays for the next run.
3. A request recorded after the snapshot stays pending.
4. A version revoked during an evaluation waits for it, and the next evaluation leaves it out.
5. An acquisition revoked during an evaluation waits at the door, without deadlock, and is left out next.
6. Two schedules of the same hour at once: the second waits on the first's request and adds nothing.
Every row here is synthetic and lives only in the disposable database. Dates are relative to the day of the
run and meetings 9301 to 9307 do not collide with the other market races. Runs before the outbox races, which
revoke the source at their end; the monitor's consumer is disabled when the races finish.
"""
import datetime
import hashlib
import json
import os
import queue
import subprocess
import threading
import time

URL = os.environ['DATABASE_URL']
P = '3a7f0000'
FOUNDER, OPERATOR, WORKER = (f'{P}-0000-4000-8000-00000000000{n}' for n in (1, 2, 4))
TOKEN, TOKEN_ID = f'synthetic-rg01-race-token-{P}-a', f'{P}-0000-4000-8000-000000000011'
DECLARATION = f'{P}-0000-4000-b000-000000000001'
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


def as_account(account):
    return f"select set_config('request.jwt.claim.sub','{account}',true);"


def claim_job(contract, request):
    """Enqueue and claim, deferring jobs other races left queued."""
    psql("update private.market_acquisition_jobs set available_at=clock_timestamp()+interval '1 day' where status='queued' and source_id='bcb';")
    job = psql(f"select private.enqueue_market_contract_acquisition_v1('{command()}','{contract}','{request}','Aquisição sintética da corrida do monitor','{OPERATOR}')->>'jobId';")
    for _ in range(10):
        c = json.loads(psql(f"begin;{as_account(WORKER)}select private.worker_claim_market_acquisition_v1('{TOKEN}')::text;commit;").splitlines()[-1])
        if not c.get('claimed') or c['jobId'] == job:
            break
    if c.get('jobId') != job:
        raise AssertionError(f'job not claimed: {c}')
    return c


def store(c, body):
    psql(f"insert into storage.objects(bucket_id,name,metadata,version) values('market-reference','{c['objectPath']}',"
         f"jsonb_build_object('size',{len(body)},'mimetype','application/json','eTag','\"{hashlib.md5(body).hexdigest()}\"'),'rg01-race');")


def commit_sql(c, body):
    return (f"{as_account(WORKER)}select private.worker_commit_market_version_v1('{c['jobId']}','{c['capability']}','{c['leaseId']}',"
            f"'\\x{body.hex()}'::bytea,'application/json',clock_timestamp())::text;")


def acquire(contract, request, body):
    c = claim_job(contract, request)
    store(c, body)
    return json.loads(psql(f"begin;{commit_sql(c, body)}commit;").splitlines()[-1])


def communique(meeting, reference, verb, pct):
    title = {'hold': f'Copom mantém a taxa Selic em {pct}% a.a.', 'cut': f'Copom reduz a taxa Selic para {pct}% a.a.'}[verb]
    text = {'hold': f'<p>O Copom decidiu manter a taxa Selic em {pct}% a.a.</p>',
            'cut': f'<p>O Copom decidiu reduzir a taxa Selic em 0,25 ponto percentual, para {pct}% a.a.</p>'}[verb]
    return json.dumps({'conteudo': [{'nro_reuniao': meeting, 'dataReferencia': reference.isoformat(), 'titulo': title, 'textoComunicado': text}]},
                      ensure_ascii=False).encode()


def series(start, end, points):
    rows, day = [], start
    while day <= end:
        rows.append({'data': day.strftime('%d/%m/%Y'), 'valor': [v for d, v in points if d <= day][-1]})
        day += datetime.timedelta(days=1)
    return json.dumps(rows).encode()


def day(today, offset):
    d = today - datetime.timedelta(days=offset)
    return d + datetime.timedelta(days=1) if (d.month, d.day) == (1, 1) else d


def run_sql():
    return f"select private.run_market_rg01_v1('{DECLARATION}')::text;"


def request_sql(key):
    return f"insert into private.market_rg01_requests(regime_id,trigger_id,key) select regime_id,trigger_id,'{key}' from private.market_regime_declarations where id='{DECLARATION}';"


def main():
    today = datetime.date.fromisoformat(psql("select private.market_sao_paulo_date_v1(clock_timestamp());"))
    e = [day(today, n) for n in (32, 26, 23, 20, 17, 14)]
    regime = f"brl-corrida-{(e[1] + datetime.timedelta(days=1)).isoformat()}"
    psql(f"""
begin;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
select ('{P}-0000-4000-8000-00000000000'||n)::uuid,'authenticated','authenticated','{P}-'||n||'@example.invalid','{{}}','{{}}',now(),now(),false,false from unnest(array[1,2,4]) n;
insert into private.platform_principals(user_id,role,label) values('{FOUNDER}','founder','Synthetic RG-01 race founder'),('{OPERATOR}','operator','Synthetic RG-01 race operator');
insert into private.worker_tokens(id,label,token_sha256,execution_account_user_id) values('{TOKEN_ID}','Synthetic RG-01 race worker',extensions.digest('{TOKEN}','sha256'),'{WORKER}');
do $$ begin
 if private.market_publisher_organization_v1() is null then
  perform private.register_market_publisher_v1('{P}-0000-4000-a000-000000000001','Offroad, referência de mercado','{FOUNDER}');
 end if;
end $$;
select private.record_market_source_revision_v1('{P}-0000-4000-a000-000000000011','bcb',jsonb_build_object('registryId','bcb_sgs','license',jsonb_build_object('kind','open',
 'license','ODbL-1.0','attribution','Banco Central do Brasil','evidenceIds',jsonb_build_array('bcb-catalog-meta-selic-432','bcb-catalog-atas-comunicados-copom',
 'bcb-site-termos-de-uso'),'retainAdoptedValues',true,'storeDays',null),'allowedHosts',jsonb_build_array('api.bcb.gov.br','www.bcb.gov.br'),'calendar','br_business_days',
 'expectedPublication','09:00','maximumAgeHours',30,'enabled',true,'reason','Fonte sintética da corrida do monitor'),'{OPERATOR}');
select private.release_market_acquisition_transport_v1('{P}-0000-4000-a000-000000000021',true,'{OPERATOR}','Synthetic opening for the RG-01 races');
select private.grant_market_acquisition_delegation_v1('{P}-0000-4000-a000-000000000022','{TOKEN_ID}','bcb','Synthetic delegation for the RG-01 races','{OPERATOR}');
select private.register_market_event_consumer_v2('{P}-0000-4000-a000-000000000023','rg01-race',array['released'],array['source'],'rg01','Monitor sintético da corrida','{FOUNDER}');
select private.grant_market_event_delegation_v1('{P}-0000-4000-a000-000000000024','{TOKEN_ID}','rg01-race','Synthetic monitor delegation','{OPERATOR}');
do $$ declare p jsonb;txt text;begin
 p:=jsonb_build_object('decidedBy','Operador sintético','easingCycle',jsonb_build_object('copomDecisions',jsonb_build_array({','.join(f"'{d.isoformat()}'" for d in e[1:])}),
  'cumulativeBps',-125,'cuts',5,'effectiveNextDay',true,'fromPct','15.00','startedOn','{(e[1] + datetime.timedelta(days=1)).isoformat()}','stepBps',25),
  'policyId','policy.pricing.regime','policyVersion','2099.01.01-race','regime','{regime}','reviewDeadlineBusinessDays',5,'selicTargetPct','13.75',
  'trigger',jsonb_build_object('action','revisao_obrigatoria','condition','condição sintética','id','RG-01','scope','corrida'),'validFrom','{(e[1] + datetime.timedelta(days=1)).isoformat()}');
 txt:=private.market_policy_canonical_v1(p)||chr(10);
 insert into private.market_regime_declarations(id,policy_id,policy_version,regime_id,trigger_id,rule,projection_text,projection_sha256,active)
 values('{DECLARATION}','policy.pricing.regime','2099.01.01-race','{regime}','RG-01','market-rg01.v1',txt,encode(extensions.digest(convert_to(txt,'UTF8'),'sha256'),'hex'),true);
end $$;
commit;
""")
    for year in range(e[1].year, today.year + 1):
        ends = [d for d in e[1:] if d.year == year] or [today + datetime.timedelta(days=10)]
        meetings = [{'ordinal': i + 1, 'firstDay': (d - datetime.timedelta(days=1)).isoformat(), 'secondDay': d.isoformat()} for i, d in enumerate(ends)]
        psql(f"select private.record_market_copom_calendar_v1('{command()}',{year},'{json.dumps(meetings)}','https://www.bcb.gov.br/controleinflacao/calendarioreunioescopom',"
             f"convert_to('<html>calendário sintético da corrida {year}</html>','UTF8'),'text/html','Calendário sintético da corrida','{OPERATOR}');")
    acquire('bcb-copom-comunicados-detalhe', '{"meeting":9301}', communique(9301, e[0], 'hold', '15,00'))
    for n in range(1, 6):
        acquire('bcb-copom-comunicados-detalhe', json.dumps({'meeting': 9301 + n}), communique(9301 + n, e[n], 'cut', f'{15 - .25 * n:.2f}'.replace('.', ',')))
    points = [(e[0] - datetime.timedelta(days=100), '15.00')] + [(e[n] + datetime.timedelta(days=1), f'{15 - .25 * n:.2f}') for n in range(1, 6)]
    end = today - datetime.timedelta(days=1)
    start = e[1] - datetime.timedelta(days=3)
    first = acquire('bcb-sgs-432-endpoint', json.dumps({'window': {'start': start.isoformat(), 'end': end.isoformat()}}), series(start, end, points))
    if first['quality']['status'] != 'approved':
        raise AssertionError(f'series not approved: {first}')

    # 1. Busy: the first evaluation holds the regime until it commits.
    psql(request_sql('hour:2099-01-02T01'))
    a = session('market_rg01_first', run_sql()); barrier(a, 'A')
    out = psql(run_sql())
    if json.loads(out.splitlines()[-1]).get('status') != 'busy':
        raise AssertionError('a second evaluation of the regime did not answer busy: ' + out)
    out = finish(a)
    if json.loads(out.splitlines()[-1]).get('status') != 'evaluated':
        raise AssertionError('the first evaluation did not evaluate: ' + out)
    if json.loads(psql(run_sql()).splitlines()[-1]).get('status') != 'idle':
        raise AssertionError('a run with no request was not idle')

    # 2. Retry: a version recorded before K but not yet committed, whose transaction holds the source, is
    # invisible when the evaluation discovers its candidates; it commits while the evaluation waits at the read
    # lock, the snapshot sees it outside the locked set, and the evaluation answers retry without writing.
    evaluations = psql(f"select count(*) from private.market_regime_evaluations where declaration_id='{DECLARATION}';")
    late_start = today - datetime.timedelta(days=5)
    late_body = series(late_start, end, points)
    late = claim_job('bcb-sgs-432-endpoint', json.dumps({'window': {'start': late_start.isoformat(), 'end': end.isoformat()}}))
    store(late, late_body)
    b = session('market_rg01_confirmation', "select pg_advisory_xact_lock(hashtextextended('market-authority:source:bcb',0));" + commit_sql(late, late_body))
    barrier(b, 'B')
    psql(request_sql('hour:2099-01-02T02'))
    a = session('market_rg01_retry', run_sql())
    wait_for_lock('market_rg01_retry')
    confirmed = json.loads(finish(b).splitlines()[-1])
    out = finish(a)
    if json.loads(out.splitlines()[-1]).get('status') != 'retry':
        raise AssertionError('an evaluation that read a version outside its locks did not answer retry: ' + out)
    if psql(f"select count(*) from private.market_regime_evaluations where declaration_id='{DECLARATION}';") != evaluations:
        raise AssertionError('a retry wrote an evaluation')
    if psql("select count(*) from private.market_rg01_requests where key='hour:2099-01-02T02' and satisfied_by is null;") != '1':
        raise AssertionError('a retry acknowledged its request')
    out = json.loads(psql(run_sql()).splitlines()[-1])
    if out.get('status') != 'evaluated' or psql(f"select (snapshot->'dependencies'->'versions') ? '{confirmed['versionId']}' from private.market_regime_evaluations "
                                                 f"where id='{out['evaluationId']}';") != 't':
        raise AssertionError(f'the next evaluation did not read the confirmed version: {out}')

    # 2b. A version confirmed after K, while the evaluation waits at the read lock, stays for the next one.
    after_start = today - datetime.timedelta(days=4)
    after_body = series(after_start, end, points)
    after = claim_job('bcb-sgs-432-endpoint', json.dumps({'window': {'start': after_start.isoformat(), 'end': end.isoformat()}}))
    store(after, after_body)
    b = session('market_rg01_after_k', "select pg_advisory_xact_lock(hashtextextended('market-authority:source:bcb',0));"); barrier(b, 'B')
    psql(request_sql('hour:2099-01-02T03'))
    a = session('market_rg01_before_confirmation', run_sql())
    wait_for_lock('market_rg01_before_confirmation')
    b.stdin.write(commit_sql(after, after_body) + "\n")
    later = json.loads(finish(b).splitlines()[-1])
    out = json.loads(finish(a).splitlines()[-1])
    if out.get('status') != 'evaluated' or psql(f"select (snapshot->'dependencies'->'versions') ? '{later['versionId']}' from private.market_regime_evaluations "
                                                 f"where id='{out['evaluationId']}';") != 'f':
        raise AssertionError(f'a version confirmed after K entered the evaluation: {out}')
    psql(request_sql('hour:2099-01-02T04'))
    out = json.loads(psql(run_sql()).splitlines()[-1])
    if out.get('status') != 'evaluated' or psql(f"select (snapshot->'dependencies'->'versions') ? '{later['versionId']}' from private.market_regime_evaluations "
                                                 f"where id='{out['evaluationId']}';") != 't':
        raise AssertionError(f'the next evaluation did not read the version confirmed after K: {out}')

    # 3. A request recorded after the snapshot, while the evaluation's transaction is open, stays pending.
    psql(request_sql('hour:2099-01-02T05'))
    a = session('market_rg01_snapshot_first', run_sql()); barrier(a, 'A')
    psql(request_sql('hour:2099-01-02T06'))
    finish(a)
    if psql("select string_agg(key||':'||(satisfied_by is not null)::text,',' order by key) from private.market_rg01_requests "
            "where key in ('hour:2099-01-02T05','hour:2099-01-02T06');") != 'hour:2099-01-02T05:true,hour:2099-01-02T06:false':
        raise AssertionError('a request recorded after the snapshot was acknowledged, or the one it saw was not')
    psql(f"select private.run_market_rg01_v1('{DECLARATION}');")

    # 4. A version revoked during an evaluation waits for it; the next evaluation leaves the version out.
    psql(request_sql('hour:2099-01-02T07'))
    a = session('market_rg01_reading', run_sql()); barrier(a, 'A')
    b = session('market_rg01_version_revoker', f"insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) "
                f"values('version','{later['versionId']}','revoked','Revogação sintética durante a avaliação','{OPERATOR}');")
    wait_for_lock('market_rg01_version_revoker')
    finish(a); finish(b)
    psql(request_sql('hour:2099-01-02T08'))
    out = json.loads(psql(run_sql()).splitlines()[-1])
    if out.get('status') != 'evaluated' or psql(f"select (snapshot->'dependencies'->'versions') ? '{later['versionId']}' from private.market_regime_evaluations "
                                                 f"where id='{out['evaluationId']}';") != 'f':
        raise AssertionError(f'a revoked version was still read: {out}')

    # 5. An acquisition revoked during an evaluation waits at the door; the next evaluation leaves it out.
    psql(request_sql('hour:2099-01-02T09'))
    a = session('market_rg01_reading_2', run_sql()); barrier(a, 'A')
    b = session('market_rg01_acquisition_revoker', f"insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) "
                f"values('acquisition','{confirmed['acquisitionId']}','revoked','Revogação sintética durante a avaliação','{OPERATOR}');")
    wait_for_lock('market_rg01_acquisition_revoker')
    finish(a); out_b = finish(b)
    if 'deadlock' in out_b:
        raise AssertionError('acquisition revocation deadlocked: ' + out_b)
    psql(request_sql('hour:2099-01-02T10'))
    out = json.loads(psql(run_sql()).splitlines()[-1])
    if out.get('status') != 'evaluated' or psql(f"select (snapshot->'dependencies'->'acquisitions') ? '{confirmed['acquisitionId']}' from private.market_regime_evaluations "
                                                 f"where id='{out['evaluationId']}';") != 'f':
        raise AssertionError(f'a revoked acquisition was still read: {out}')

    # 6. Two schedules at once: within one hour the second waits on the first's request and adds nothing for it.
    hour = "select to_char(clock_timestamp() at time zone 'America/Sao_Paulo','YYYY-MM-DD\"T\"HH24');"
    before = psql(hour)
    schedule = f"{as_account(WORKER)}select private.worker_schedule_rg01_v1('{TOKEN}')::text;"
    a = session('market_rg01_schedule_a', schedule); barrier(a, 'A')
    b = session('market_rg01_schedule_b', schedule)
    same_hour = psql(hour) == before
    if same_hour:
        wait_for_lock('market_rg01_schedule_b')
    first_schedule = json.loads(finish(a).splitlines()[-1])
    second_schedule = json.loads(finish(b).splitlines()[-1])
    if not first_schedule.get('active') or first_schedule.get('scheduled', 0) < 1 or not second_schedule.get('active'):
        raise AssertionError(f'concurrent schedules: {first_schedule} {second_schedule}')
    if same_hour and psql(hour) == before and second_schedule.get('scheduled') != 0:
        raise AssertionError(f'the second schedule of the same hour added requests: {second_schedule}')

    psql(f"select private.disable_market_event_consumer_v1('{command()}','rg01-race','Fim das corridas do monitor','{FOUNDER}');")
    print('PASS: RG-01 evaluations serialize per regime, refuse a reading outside their locks and schedule each hour once')


def cleanup():
    for proc in SESSIONS:
        if proc.poll() is None:
            proc.kill()
    psql("select pg_terminate_backend(pid) from pg_stat_activity where application_name like 'market_rg01_%' and pid<>pg_backend_pid();", check=False)


if __name__ == '__main__':
    try:
        main()
    finally:
        cleanup()
