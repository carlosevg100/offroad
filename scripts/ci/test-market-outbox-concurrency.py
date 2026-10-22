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
5. Two publications at once: the second waits for the first and takes the next edition number.
6. Relink against the revocation of the communiqué it would link, both orders: a relink that waits refuses;
   a revocation that waits makes the relinked version unreadable.
7. Two version events of one series: the second waits on the series counter and takes the next ordinal.
8. Disabling against a completion in flight, both orders: no deadlock; the completion that held its lease
   keeps its receipt, and the one that waited is refused.
9. A revocation must precede every market read lock of its transaction: after an event on a version or a
   read lock with no event, revoking an acquisition is refused; a revoking transaction runs no market command.
10. Revocation effects across committed sessions: the revoked communique and its dependent version are
   unreadable in both modes, and a revoked source withdraws its acquisitions.
Every row here is synthetic, dated in 2024, and lives only in the disposable database; meetings 9201 to 9205 and
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
select private.record_market_source_revision_v1('{P}-0000-4000-a000-000000000013','bcb-outbox-race-2',jsonb_build_object('registryId','bcb_sgs','license',jsonb_build_object('kind','open',
 'license','ODbL-1.0','attribution','Banco Central do Brasil','evidenceIds',jsonb_build_array('bcb-catalog-meta-selic-432'),'retainAdoptedValues',true,'storeDays',null),
 'allowedHosts',jsonb_build_array('api.bcb.gov.br'),'calendar','br_business_days','expectedPublication','09:00','maximumAgeHours',30,'enabled',false,'reason','Terceira fonte sintética da corrida'),'{OPERATOR}');
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


def claim(token, account, consumer):
    return json.loads(psql(f"begin;{as_account(account)}select private.worker_claim_market_event_v1('{token}','{consumer}')::text;commit;").splitlines()[-1])


def complete_sql(consumer, c):
    return (f"select private.worker_complete_market_event_v1('{consumer}',{c['eventSequence']},'{c['capability']}','{c['leaseId']}','{{\"ok\":true}}')->>'replayed';")


def relink_sql(version):
    return f"select private.relink_market_version_v1('{command()}','{version}','{OPERATOR}')->>'versionId';"


def revoke_sql(kind, subject, reason):
    return (f"insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) "
            f"values('{kind}','{subject}','revoked','{reason}','{OPERATOR}');")


def main():
    psql(SETUP)
    # Two series confirmed before their communiqués exist: both quarantined, to be relinked in race 6.
    q4 = acquire('bcb-sgs-432-endpoint', '{"window":{"start":"2024-08-07","end":"2024-08-20"}}', series('2024-08-07', 14, '2024-08-21', '10.50', '10.50'))
    q5 = acquire('bcb-sgs-432-endpoint', '{"window":{"start":"2024-09-18","end":"2024-09-30"}}', series('2024-09-18', 13, '2024-10-01', '10.50', '10.50'))
    if q4.get('quality', {}).get('status') != 'quarantined' or q5.get('quality', {}).get('status') != 'quarantined':
        raise AssertionError(f'series without communiques were not quarantined: {q4} {q5}')
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
    # 5. Two publications at once: the second waits on the publication lock and takes the next number.
    p1 = session('market_outbox_publish_first')
    p1.stdin.write(f"select private.publish_market_odbl_release_v1('{command()}',repeat('d',40),'{FOUNDER}')->>'releaseNumber';\n")
    barrier(p1, 'PP1')
    p2 = session('market_outbox_publish_second')
    barrier(p2, 'PP2')
    p2.stdin.write(f"select private.publish_market_odbl_release_v1('{command()}',repeat('e',40),'{FOUNDER}')->>'releaseNumber';\n")
    p2.stdin.flush()
    wait_for_lock('market_outbox_publish_second')
    n1 = int(finish(p1).splitlines()[-1]); n2 = int(finish(p2).splitlines()[-1])
    if n2 != n1 + 1:
        raise AssertionError(f'concurrent publications did not take consecutive numbers: {n1} {n2}')
    if psql(f"select (payload_text::jsonb#>>'{{alterations,previous,release}}') from private.market_odbl_releases where release_number={n2};") != str(n1):
        raise AssertionError('the second publication did not record the first as its previous edition')
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
    if psql(f"select private.market_acquisition_readable_v1('{d2['acquisitionId']}')::text||':'||private.market_version_readable_v1('{s['versionId']}','consume')::text"
            f"||':'||private.market_version_readable_v1('{s['versionId']}','reprocess')::text;") != 'false:false:false':
        raise AssertionError('a revoked communique or the version that depends on it is still readable')
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
    # 6. Relink against the revocation of the communiqué it would link. A revocation holds the anchor: the
    # relink materialized the evidence, waits for it, and then refuses it.
    d4 = acquire('bcb-copom-comunicados-detalhe', '{"meeting":9204}', communique(9204, '2024-08-06', 'hold', '10,50'))
    rv = session('market_outbox_revoke_before_relink')
    rv.stdin.write(revoke_sql('acquisition', d4['acquisitionId'], 'Revogação sintética antes do relink') + "\n")
    barrier(rv, 'RV4')
    rl = session('market_outbox_relink_waiting')
    barrier(rl, 'RL4')
    rl.stdin.write(relink_sql(q4['versionId']) + "\n"); rl.stdin.flush()
    wait_for_lock('market_outbox_relink_waiting')
    finish(rv)
    out = finish(rl, expect_ok=False)
    if 'market_version_not_readable' not in out:
        raise AssertionError('a relink that waited for the revocation of its evidence did not refuse: ' + out)
    # A relink holds the anchor: the revocation waits and then makes the relinked version unreadable.
    d5 = acquire('bcb-copom-comunicados-detalhe', '{"meeting":9205}', communique(9205, '2024-09-17', 'hold', '10,50'))
    rl = session('market_outbox_relink_first')
    rl.stdin.write(relink_sql(q5['versionId']) + "\n")
    barrier(rl, 'RL5')
    rv = session('market_outbox_revoke_after_relink')
    barrier(rv, 'RV5')
    rv.stdin.write(revoke_sql('acquisition', d5['acquisitionId'], 'Revogação sintética depois do relink') + "\n"); rv.stdin.flush()
    wait_for_lock('market_outbox_revoke_after_relink')
    relinked = finish(rl).splitlines()[-1]
    finish(rv)
    if psql(f"select (select count(*) from private.market_version_evidence where version_id='{relinked}' and meeting=9205)::text||':'||"
            f"private.market_version_readable_v1('{relinked}','consume')::text;") != '1:false':
        raise AssertionError('the relinked version did not link the communique or stayed readable after its revocation')
    # 7. Two version events of one series: the second waits on the series counter.
    psql(f"select private.register_market_event_consumer_v1('{command()}','race-consumer-3',array['revoked'],array['version'],'Consumidor sintético de versões','{FOUNDER}');")
    v1 = session('market_outbox_series_1')
    v1.stdin.write(revoke_sql('version', q4['versionId'], 'Revogação sintética da versão 4') + "\nselect max(sequence) from private.market_events;\n")
    barrier(v1, 'V1')
    v2 = session('market_outbox_series_2')
    barrier(v2, 'V2')
    v2.stdin.write(revoke_sql('version', q5['versionId'], 'Revogação sintética da versão 5') + "\nselect max(sequence) from private.market_events where reason like 'Revogação sintética da versão%';\n")
    v2.stdin.flush()
    wait_for_lock('market_outbox_series_2')
    a_seq = finish(v1).splitlines()[-1]
    b_seq = finish(v2).splitlines()[-1]
    keys = psql(f"select string_agg(subject_key||'#'||subject_ordinal,',' order by event_sequence) from private.market_event_outbox "
                f"where consumer_id='race-consumer-3' and event_sequence in ({a_seq},{b_seq});").split(',')
    if len(keys) != 2 or not keys[0].startswith('series:') or keys[0].split('#')[0] != keys[1].split('#')[0] \
            or int(keys[1].split('#')[1]) != int(keys[0].split('#')[1]) + 1:
        raise AssertionError(f'version events of one series out of order: {keys}')
    # 8. Disabling against a completion in flight. The completion holds its lease: disabling waits, the
    # receipt stands, and nothing deadlocks.
    psql(event('bcb-outbox-race-2'))
    c = claim(TOKEN_A, WORKER_A, 'race-consumer')
    if not c.get('claimed'):
        raise AssertionError(f'no row to complete: {c}')
    cp = session('market_outbox_complete_first', as_account(WORKER_A))
    cp.stdin.write(complete_sql('race-consumer', c) + "\n")
    barrier(cp, 'C1')
    ds = session('market_outbox_disable_waiting')
    barrier(ds, 'D1')
    ds.stdin.write(f"select private.disable_market_event_consumer_v1('{command()}','race-consumer','Desligamento sintético da corrida','{FOUNDER}')->>'cancelled';\n")
    ds.stdin.flush()
    wait_for_lock('market_outbox_disable_waiting')
    finish(cp); finish(ds)
    if psql(f"select count(*) from private.market_event_receipts where consumer_id='race-consumer' and event_sequence={c['eventSequence']};") != '1':
        raise AssertionError('the completion that held its lease lost its receipt')
    # Disabling holds the consumer: the completion waits and is refused, with no receipt.
    psql(f"select private.grant_market_event_delegation_v1('{command()}','{TOKEN_A_ID}','race-consumer-2','Delegação sintética do segundo consumidor','{OPERATOR}');")
    c = claim(TOKEN_A, WORKER_A, 'race-consumer-2')
    if not c.get('claimed'):
        raise AssertionError(f'no row of the second consumer to complete: {c}')
    ds = session('market_outbox_disable_first')
    ds.stdin.write(f"select private.disable_market_event_consumer_v1('{command()}','race-consumer-2','Desligamento sintético do segundo consumidor','{FOUNDER}');\n")
    barrier(ds, 'D2')
    cp = session('market_outbox_complete_waiting', as_account(WORKER_A))
    barrier(cp, 'C2')
    cp.stdin.write(complete_sql('race-consumer-2', c) + "\n"); cp.stdin.flush()
    wait_for_lock('market_outbox_complete_waiting')
    finish(ds)
    out = finish(cp, expect_ok=False)
    if 'market_event_delegation_required' not in out or 'deadlock' in out:
        raise AssertionError('a completion that waited for disabling was not refused cleanly: ' + out)
    if psql(f"select count(*) from private.market_event_receipts where consumer_id='race-consumer-2' and event_sequence={c['eventSequence']};") != '0':
        raise AssertionError('a refused completion left a receipt')
    # 9. The writer protocol: an event on a version that existed before the transaction locks its state, so a
    # later acquisition revocation in the same transaction is refused instead of closing a cycle with a reader.
    out = psql(f"begin;{revoke_sql('version', s['versionId'], 'Revogação sintética de versão existente')}"
               f"{revoke_sql('acquisition', s3['acquisitionId'], 'Revogação sintética depois da versão')}commit;", check=False)
    if 'market_authority_order' not in out:
        raise AssertionError('an acquisition revocation after an event on an existing version was accepted: ' + out)
    # A read lock with no event (what a relink that finds nothing to change leaves held) also comes first.
    out = psql(f"begin;select private.lock_market_read_authority_v1(array['{s['versionId']}'::uuid],'{{}}');"
               f"{revoke_sql('acquisition', s3['acquisitionId'], 'Revogação sintética depois de leitura')}commit;", check=False)
    if 'market_authority_order' not in out:
        raise AssertionError('an acquisition revocation after a read lock was accepted: ' + out)
    # A revoking transaction holds the authority exclusively and runs no market command.
    out = psql(f"begin;{revoke_sql('acquisition', s3['acquisitionId'], 'Revogação sintética seguida de comando')}"
               f"select private.publish_market_odbl_release_v1('{command()}',repeat('f',40),'{FOUNDER}');commit;", check=False)
    if 'market_authority_order' not in out:
        raise AssertionError('a market command ran in a revoking transaction: ' + out)
    psql(f"select private.release_market_acquisition_transport_v1('{command()}',false,'{OPERATOR}','Synthetic closing after the outbox races');")
    # A revoked source withdraws every acquisition it holds.
    if psql(f"select private.market_acquisition_readable_v1('{q5['acquisitionId']}')::text;") != 'true':
        raise AssertionError('the acquisition used to prove source revocation was already unreadable')
    psql(revoke_sql('source', 'bcb', 'Revogação sintética da fonte ao fim das corridas'))
    if psql(f"select private.market_acquisition_readable_v1('{q5['acquisitionId']}')::text;") != 'false':
        raise AssertionError('an acquisition of a revoked source is still readable')
    print('PASS: market outbox registration, per-subject and per-series order, claims, publications, relink and disabling serialize across sessions')


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
