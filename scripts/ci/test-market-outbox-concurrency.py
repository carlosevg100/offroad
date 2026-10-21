#!/usr/bin/env python3
"""Real two-session races on the market event outbox and the ODbL edition (ADR 0023, M2 part 3), on the
disposable CI database.

1. A consumer registration waits for an event transaction in flight: that event, committed first, has no row;
   an event that commits after the registration has one, even when its transaction started first.
2. Two events of one subject: the second waits on the subject's counter until the first commits, so ordinals
   follow commit order and the claim delivers them in that order.
3. Two delegated workers claim at once: two rows of different subjects, never the same row twice.
4. A revocation of a communiqué waits for a publication holding its anchor, and the edition then reads as
   withdrawn; a publication that starts while the revocation holds the anchor waits and leaves that version out.
Every row here is synthetic, dated in 2024, and lives only in the disposable database; meetings 9201 to 9203 and
their dates do not collide with the acquisition races.
"""
import json
import os
import queue
import subprocess
import threading
import time

URL = os.environ['DATABASE_URL']
P = '3a7d0000'
FOUNDER, OPERATOR, WORKER_A, WORKER_B = (f'{P}-0000-4000-8000-00000000000{n}' for n in range(1, 5))
TOKEN_A, TOKEN_B = f'synthetic-outbox-race-token-{P}-a', f'synthetic-outbox-race-token-{P}-b'
TOKEN_A_ID, TOKEN_B_ID = f'{P}-0000-4000-8000-000000000011', f'{P}-0000-4000-8000-000000000012'
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
    # One reader per session drains every line into a queue, so a marker buffered behind earlier
    # output is never missed by a readiness check on the descriptor.
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


def end(proc, end='commit'):
    try:
        proc.stdin.write(f'{end};\n'); proc.stdin.close()
    except (BrokenPipeError, ValueError):
        pass


def finish(proc, expect_ok=True, end_with='commit'):
    end(proc, end_with)
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


def event(subject='bcb', ev='released'):
    return (f"insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) "
            f"values('source','{subject}','{ev}','Evento sintético da corrida','{OPERATOR}');")


def outbox_row(seq, consumer='race-consumer'):
    out = psql(f"select coalesce(subject_ordinal::text,'') from private.market_event_outbox where consumer_id='{consumer}' and event_sequence={seq};")
    return out or None


SETUP = f"""
begin;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
select ('{P}-0000-4000-8000-00000000000'||n)::uuid,'authenticated','authenticated','{P}-'||n||'@example.invalid','{{}}','{{}}',now(),now(),false,false from generate_series(1,4) n;
insert into private.platform_principals(user_id,role,label) values('{FOUNDER}','founder','Synthetic outbox race founder'),('{OPERATOR}','operator','Synthetic outbox race operator');
insert into private.worker_tokens(id,label,token_sha256,execution_account_user_id) values
 ('{TOKEN_A_ID}','Synthetic outbox race worker A',extensions.digest('{TOKEN_A}','sha256'),'{WORKER_A}'),
 ('{TOKEN_B_ID}','Synthetic outbox race worker B',extensions.digest('{TOKEN_B}','sha256'),'{WORKER_B}');
do $$ begin
 if private.market_publisher_organization_v1() is null then
  perform private.register_market_publisher_v1('{P}-0000-4000-a000-000000000001','Offroad, referência de mercado','{FOUNDER}');
 end if;
end $$;
select private.record_market_source_revision_v1('{P}-0000-4000-a000-000000000011','bcb',jsonb_build_object('registryId','bcb_sgs','license',jsonb_build_object('kind','open',
 'license','ODbL-1.0','attribution','Banco Central do Brasil','evidenceIds',jsonb_build_array('bcb-catalog-meta-selic-432','bcb-catalog-atas-comunicados-copom',
 'bcb-site-termos-de-uso'),'retainAdoptedValues',true,'storeDays',null),'allowedHosts',jsonb_build_array('api.bcb.gov.br','www.bcb.gov.br'),'calendar','br_business_days',
 'expectedPublication','09:00','maximumAgeHours',30,'enabled',true,'reason','Fonte sintética da corrida da outbox'),'{OPERATOR}');
select private.record_market_source_revision_v1('{P}-0000-4000-a000-000000000012','bcb-outbox-race',jsonb_build_object('registryId','bcb_sgs','license',jsonb_build_object('kind','open',
 'license','ODbL-1.0','attribution','Banco Central do Brasil','evidenceIds',jsonb_build_array('bcb-catalog-meta-selic-432'),'retainAdoptedValues',true,'storeDays',null),
 'allowedHosts',jsonb_build_array('api.bcb.gov.br'),'calendar','br_business_days','expectedPublication','09:00','maximumAgeHours',30,'enabled',false,'reason','Segunda fonte sintética da corrida'),'{OPERATOR}');
select private.release_market_acquisition_transport_v1('{P}-0000-4000-a000-000000000021',true,'{OPERATOR}','Synthetic opening for the outbox races');
select private.grant_market_acquisition_delegation_v1('{P}-0000-4000-a000-000000000022','{TOKEN_A_ID}','bcb','Synthetic delegation for the outbox races','{OPERATOR}');
commit;
"""


def acquire(contract, request, body):
    """Enqueue, claim (repeating past leases other races left to expire), store and confirm, as the worker would."""
    psql(f"update private.market_acquisition_jobs set available_at=clock_timestamp()+interval '1 day' where status='queued' and source_id='bcb';")
    job = psql(f"select private.enqueue_market_contract_acquisition_v1('{command()}','{contract}','{request}','Aquisição sintética da corrida','{OPERATOR}')->>'jobId';")
    for _ in range(10):
        c = json.loads(psql(f"begin;{as_account(WORKER_A)}select private.worker_claim_market_acquisition_v1('{TOKEN_A}')::text;commit;").splitlines()[-1])
        if not c.get('claimed') or c['jobId'] == job:
            break
    if c.get('jobId') != job:
        raise AssertionError(f'job not claimed: {c}')
    import hashlib
    psql(f"insert into storage.objects(bucket_id,name,metadata,version) values('market-reference','{c['objectPath']}',"
         f"jsonb_build_object('size',{len(body)},'mimetype','application/json','eTag','\"{hashlib.md5(body).hexdigest()}\"'),'outbox-race');")
    return json.loads(psql(f"begin;{as_account(WORKER_A)}select private.worker_commit_market_version_v1('{c['jobId']}','{c['capability']}','{c['leaseId']}',"
                           f"'\\x{body.hex()}'::bytea,'application/json',clock_timestamp())::text;commit;").splitlines()[-1])


def communique(meeting, reference, verb, pct):
    title = {'hold': f'Copom mantém a taxa Selic em {pct}% a.a.', 'cut': f'Copom reduz a taxa Selic para {pct}% a.a.'}[verb]
    text = {'hold': f'<p>O Copom decidiu manter a taxa Selic em {pct}% a.a.</p>',
            'cut': f'<p>O Copom decidiu reduzir a taxa Selic em 0,50 ponto percentual, para {pct}% a.a.</p>'}[verb]
    return json.dumps({'conteudo': [{'nro_reuniao': meeting, 'dataReferencia': reference, 'titulo': title, 'textoComunicado': text}]}, ensure_ascii=False).encode()


def series(start, days, change, before, after):
    import datetime
    first = datetime.date.fromisoformat(start)
    rows = [{'data': (first + datetime.timedelta(days=n)).strftime('%d/%m/%Y'),
             'valor': before if (first + datetime.timedelta(days=n)).isoformat() < change else after} for n in range(days)]
    return json.dumps(rows).encode()


def main():
    psql(SETUP)
    # 1. Registration against events in flight, both orders.
    e = session('market_outbox_event_first')
    e.stdin.write(event() + "\nselect max(sequence) from private.market_events where reason='Evento sintético da corrida';\n")
    barrier(e, 'E1')
    r = session('market_outbox_register')
    barrier(r, 'R0')
    r.stdin.write(f"select private.register_market_event_consumer_v1('{command()}','race-consumer',array['released'],array['source'],'Consumidor sintético da corrida','{FOUNDER}');\n")
    r.stdin.flush()
    wait_for_lock('market_outbox_register')
    first_seq = finish(e).splitlines()[-1]
    finish(r)
    if outbox_row(first_seq) is not None:
        raise AssertionError('an event committed before the registration received a row')
    # A registration in flight: the event that starts while it holds the lock waits and then sees the consumer.
    r = session('market_outbox_register_held')
    r.stdin.write(f"select private.register_market_event_consumer_v1('{command()}','race-consumer-2',array['released'],array['source'],'Segundo consumidor sintético','{FOUNDER}');\n")
    barrier(r, 'R1')
    e = session('market_outbox_event_waiting')
    barrier(e, 'E2')
    e.stdin.write(event() + "\nselect max(sequence) from private.market_events where reason='Evento sintético da corrida';\n")
    e.stdin.flush()
    wait_for_lock('market_outbox_event_waiting')
    finish(r)
    second_seq = finish(e).splitlines()[-1]
    if outbox_row(second_seq, 'race-consumer-2') is None or outbox_row(second_seq) is None:
        raise AssertionError('an event that committed after the registration has no row')
    psql(f"select private.grant_market_event_delegation_v1('{command()}','{TOKEN_A_ID}','race-consumer','Delegação sintética A','{OPERATOR}');")
    psql(f"select private.grant_market_event_delegation_v1('{command()}','{TOKEN_B_ID}','race-consumer','Delegação sintética B','{OPERATOR}');")
    # 2. Two events of one subject: the second waits on the counter and takes the next ordinal.
    s1 = session('market_outbox_subject_1')
    s1.stdin.write(event() + "\nselect max(sequence) from private.market_events;\n")
    barrier(s1, 'S1')
    s2 = session('market_outbox_subject_2')
    barrier(s2, 'S2')
    s2.stdin.write(event() + "\nselect max(sequence) from private.market_events where reason='Evento sintético da corrida';\n")
    s2.stdin.flush()
    wait_for_lock('market_outbox_subject_2')
    a_seq = finish(s1).splitlines()[-1]
    b_seq = finish(s2).splitlines()[-1]
    if int(outbox_row(b_seq)) != int(outbox_row(a_seq)) + 1:
        raise AssertionError(f'ordinals do not follow commit order: {outbox_row(a_seq)} {outbox_row(b_seq)}')
    # 3. Two workers claim at once: never the same row. A row of another subject makes two claimable.
    psql(event('bcb-outbox-race'))
    a = session('market_outbox_claim_a', as_account(WORKER_A)); b = session('market_outbox_claim_b', as_account(WORKER_B))
    barrier(a, 'A'); barrier(b, 'B')
    a.stdin.write(f"select private.worker_claim_market_event_v1('{TOKEN_A}','race-consumer')->>'eventSequence';\n")
    b.stdin.write(f"select private.worker_claim_market_event_v1('{TOKEN_B}','race-consumer')->>'eventSequence';\n")
    a.stdin.flush(); b.stdin.flush()
    end(a); end(b)
    got = [finish(a).splitlines()[-1], finish(b).splitlines()[-1]]
    if got[0] and got[0] == got[1]:
        raise AssertionError(f'one row leased twice: {got}')
    if len([x for x in got if x]) != 2:
        raise AssertionError(f'two claimable rows of different subjects were not both claimed: {got}')
    # 4. Publication and revocation of a communiqué, both orders.
    acquire('bcb-copom-comunicados-detalhe', '{"meeting":9201}', communique(9201, '2024-03-19', 'hold', '10,75'))
    d2 = acquire('bcb-copom-comunicados-detalhe', '{"meeting":9202}', communique(9202, '2024-05-07', 'cut', '10,50'))
    s = acquire('bcb-sgs-432-endpoint', '{"window":{"start":"2024-03-20","end":"2024-05-20"}}', series('2024-03-20', 62, '2024-05-08', '10.75', '10.50'))
    if s.get('quality', {}).get('status') != 'approved':
        raise AssertionError(f'race series not approved: {s}')
    p = session('market_outbox_publish')
    p.stdin.write(f"select private.publish_market_odbl_release_v1('{command()}',repeat('d',40),'{FOUNDER}')->>'releaseNumber';\n")
    barrier(p, 'P')
    rv = session('market_outbox_revoke')
    barrier(rv, 'RV')
    rv.stdin.write(f"insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) values('acquisition','{d2['acquisitionId']}','revoked','Revogação sintética da corrida','{OPERATOR}');\n")
    rv.stdin.flush()
    wait_for_lock('market_outbox_revoke')
    number = finish(p).splitlines()[-1]
    finish(rv)
    included = psql(f"select count(*) from private.market_odbl_release_dependencies x join private.market_odbl_releases r on r.id=x.release_id "
                    f"where r.release_number={number} and x.version_id='{s['versionId']}';")
    if included != '1':
        raise AssertionError('the publication that held the anchor did not include the version')
    if psql(f"select private.market_odbl_release_read_v1({number})->>'state';") != 'withdrawn':
        raise AssertionError('an edition whose evidence was revoked is still served')
    # Reverse: a revocation holds the anchor; the publication waits and leaves the dependent version out.
    d3 = acquire('bcb-copom-comunicados-detalhe', '{"meeting":9203}', communique(9203, '2024-06-18', 'hold', '10,50'))
    s3 = acquire('bcb-sgs-432-endpoint', '{"window":{"start":"2024-06-19","end":"2024-07-02"}}', series('2024-06-19', 14, '2024-07-03', '10.50', '10.50'))
    if s3.get('quality', {}).get('status') != 'approved':
        raise AssertionError(f'second race series not approved: {s3}')
    rv = session('market_outbox_revoke_first')
    rv.stdin.write(f"insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) values('acquisition','{d3['acquisitionId']}','revoked','Segunda revogação sintética','{OPERATOR}');\n")
    barrier(rv, 'RV2')
    p = session('market_outbox_publish_waiting')
    barrier(p, 'P2')
    p.stdin.write(f"select private.publish_market_odbl_release_v1('{command()}',repeat('d',40),'{FOUNDER}')->>'releaseNumber';\n")
    p.stdin.flush()
    wait_for_lock('market_outbox_publish_waiting')
    finish(rv)
    out = finish(p, expect_ok=False)
    number = out.splitlines()[-1] if out.splitlines() else ''
    if number.isdigit():
        if psql(f"select count(*) from private.market_odbl_release_dependencies x join private.market_odbl_releases r on r.id=x.release_id "
                f"where r.release_number={number} and x.version_id='{s3['versionId']}';") != '0':
            raise AssertionError('a publication that waited for a revocation included the revoked dependency')
    elif 'market_odbl_nothing_to_publish' not in out:
        raise AssertionError('publication after a concurrent revocation failed unexpectedly: ' + out)
    psql(f"select private.release_market_acquisition_transport_v1('{command()}',false,'{OPERATOR}','Synthetic closing after the outbox races');")
    print('PASS: market outbox registration, per-subject order, claims and ODbL publication against revocation serialize across sessions')


def cleanup():
    for proc in SESSIONS:
        if proc.poll() is None:
            proc.kill()
    psql("select pg_terminate_backend(pid) from pg_stat_activity where application_name like 'market_outbox_%' and pid<>pg_backend_pid();", check=False)


if __name__ == '__main__':
    try:
        main()
    finally:
        cleanup()
