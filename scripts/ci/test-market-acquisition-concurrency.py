#!/usr/bin/env python3
"""Real two-session races on the market acquisition job (ADR 0023), on the disposable CI database.

1. Two delegated workers claim at the same time: one job, one lease; the other session gets nothing.
2. A pause holding the transport switch makes a concurrent claim wait, then answer unclaimed.
3. A revocation holding the delegation makes a concurrent claim wait, then answer unclaimed.
4. A source revision that disables the source makes a concurrent renewal wait, then refuse.
5. A deletion of the attempt's object in progress makes the confirmation wait, then refuse; a
   confirmation in progress makes the deletion wait, then delete nothing.
6. An expired lease claimed again by another worker: the late confirmation is refused and the new
   lease confirms against its own allocation.
7. An upload whose storage check waits on the source lock until the lease expires is refused once
   the lock is released, although source and delegation are still valid.
8. Two confirmations of the same attempt at once: one records the receipt, the other replays it.
9. Two first acquisitions of the same Copom meeting at once, agreeing: one meeting row, one reference.
10. The same, disagreeing: the second waits for the first, then refuses and persists nothing.
11. A series confirmed while the communiqué of its change is still uncommitted: the evidence is
    invisible and the version is quarantined; two relinks of that tip at once make exactly one new
    version, which is approved, and the other is refused as not the tip.
12. A delegation revoked while a confirmation waits on it: the confirmation is refused.
13. A meeting's first insertion held until the second attempt's lease expires: after the wait the
    second confirmation refuses on the lease and persists nothing.
Every confirmation sends the bytes; the database reads them under the endpoint contract. The market
source is `bcb`, the only source the contracts belong to; the database may already hold the market
publisher from earlier steps of the same CI job, and the setup reuses it. Every row here is synthetic,
dated in 2025 and lives only in the disposable database.
"""
import json
import os
import queue
import subprocess
import threading
import time

URL = os.environ['DATABASE_URL']
P = '3a740000'
FOUNDER, OPERATOR, WORKER_A, WORKER_B = (f'{P}-0000-4000-8000-00000000000{n}' for n in range(1, 5))
TOKEN_A, TOKEN_B = f'synthetic-market-race-token-{P}-a', f'synthetic-market-race-token-{P}-b'
TOKEN_A_ID, TOKEN_B_ID = f'{P}-0000-4000-8000-000000000011', f'{P}-0000-4000-8000-000000000012'
SOURCE = 'bcb'


def psql(sql, check=True):
    done = subprocess.run(['psql', URL, '-v', 'ON_ERROR_STOP=1', '-At', '-q'], input=sql, text=True, capture_output=True)
    if check and done.returncode != 0:
        raise AssertionError(done.stdout + done.stderr)
    return done.stdout.strip() if check else (done.stdout + done.stderr).strip()


def definition(enabled, reason):
    return (f"jsonb_build_object('registryId','bcb_sgs','license',jsonb_build_object('kind','open','license','ODbL-1.0','attribution','Banco Central do Brasil',"
            f"'evidenceIds',jsonb_build_array('bcb-catalog-meta-selic-432','bcb-catalog-atas-comunicados-copom','bcb-site-termos-de-uso'),'retainAdoptedValues',true,"
            f"'storeDays',null),'allowedHosts',jsonb_build_array('api.bcb.gov.br','www.bcb.gov.br'),'calendar','br_business_days','expectedPublication','09:00',"
            f"'maximumAgeHours',30,'enabled',{str(enabled).lower()},'reason','{reason}')")


def communique_list(meeting):
    return json.dumps({'conteudo': [{'nro_reuniao': meeting, 'dataReferencia': '2025-09-16', 'titulo': f'{meeting}ª reunião'}]}, ensure_ascii=False).encode()


def communique(meeting, reference, verb, pct):
    title = {'hold': f'Copom mantém a taxa Selic em {pct}% a.a.', 'cut': f'Copom reduz a taxa Selic para {pct}% a.a.'}[verb]
    text = {'hold': f'<p>O Copom decidiu manter a taxa Selic em {pct}% a.a.</p>',
            'cut': f'<p>O Copom decidiu reduzir a taxa Selic em 0,50 ponto percentual, para {pct}% a.a.</p>'}[verb]
    return json.dumps({'conteudo': [{'nro_reuniao': meeting, 'dataReferencia': reference, 'titulo': title, 'textoComunicado': text}]}, ensure_ascii=False).encode()


def series(start, days, change, before, after):
    import datetime
    first = datetime.date.fromisoformat(start)
    rows = []
    for n in range(days):
        d = first + datetime.timedelta(days=n)
        rows.append({'data': d.strftime('%d/%m/%Y'), 'valor': before if d.isoformat() < change else after})
    return json.dumps(rows).encode()


SETUP = f"""
begin;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
select ('{P}-0000-4000-8000-00000000000'||n)::uuid,'authenticated','authenticated','{P}-'||n||'@example.invalid','{{}}','{{}}',now(),now(),false,false from generate_series(1,4) n;
insert into private.platform_principals(user_id,role,label) values('{FOUNDER}','founder','Synthetic race founder'),('{OPERATOR}','operator','Synthetic race operator');
insert into private.worker_tokens(id,label,token_sha256,execution_account_user_id) values
 ('{TOKEN_A_ID}','Synthetic race worker A',extensions.digest('{TOKEN_A}','sha256'),'{WORKER_A}'),
 ('{TOKEN_B_ID}','Synthetic race worker B',extensions.digest('{TOKEN_B}','sha256'),'{WORKER_B}');
do $$ begin
 if private.market_publisher_organization_v1() is null then
  perform private.register_market_publisher_v1('{P}-0000-4000-a000-000000000001','Offroad, referência de mercado','{FOUNDER}');
 end if;
end $$;
select private.record_market_source_revision_v1('{P}-0000-4000-a000-000000000011','{SOURCE}',{definition(True, 'Fonte sintética da corrida habilitada')},'{OPERATOR}');
select private.grant_market_acquisition_delegation_v1('{P}-0000-4000-a000-000000000012','{TOKEN_A_ID}','{SOURCE}','Synthetic race delegation A','{OPERATOR}');
select private.grant_market_acquisition_delegation_v1('{P}-0000-4000-a000-000000000013','{TOKEN_B_ID}','{SOURCE}','Synthetic race delegation B','{OPERATOR}');
select private.release_market_acquisition_transport_v1('{P}-0000-4000-a000-000000000021',true,'{OPERATOR}','Synthetic opening for the races');
commit;
"""
counter = iter(range(100, 1000))


def command():
    return f'{P}-0000-4000-a000-000000000{next(counter)}'


def enqueue(contract='bcb-copom-comunicados-lista', request='{"size":5}'):
    psql(f"update private.market_acquisition_jobs set available_at=clock_timestamp()+interval '1 day' where status='queued' and source_id='{SOURCE}';")
    return psql(f"select private.enqueue_market_contract_acquisition_v1('{command()}','{contract}','{request}',"
                f"'Aquisição sintética da corrida','{OPERATOR}')->>'jobId';")


def as_account(account):
    return f"select set_config('request.jwt.claim.sub','{account}',true);"


def claim(account, token):
    return json.loads(psql(f"begin;{as_account(account)}select private.worker_claim_market_acquisition_v1('{token}')::text;commit;").splitlines()[-1])


SESSIONS = []


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


def put_object(path, body=communique_list(281)):
    import hashlib
    md5 = hashlib.md5(body).hexdigest()
    psql(f"insert into storage.objects(bucket_id,name,metadata,version) values('market-reference','{path}',"
         f"jsonb_build_object('size',{len(body)},'mimetype','application/json','eTag','\"{md5}\"'),'market-race');")
    return body


def confirm_sql(account, c, body, at):
    return (f"{as_account(account)}select private.worker_commit_market_version_v1('{c['jobId']}','{c['capability']}','{c['leaseId']}',"
            f"'\\x{body.hex()}'::bytea,'application/json','{at}')::text;")


def commit_sql(account, c, body, at):
    return confirm_sql(account, c, body, at).replace(')::text;', ")->>'committed';")


def stored_claim(account, token, body, contract='bcb-copom-comunicados-lista', request='{"size":5}'):
    """Enqueues, claims and stores the bytes, as the worker would before confirming. Earlier races leave
    leases that expire; a claim takes those first, so it is repeated until it reaches the new job."""
    job = enqueue(contract, request)
    for _ in range(10):
        c = claim(account, token)
        if not c.get('claimed') or c['jobId'] == job:
            break
    if c.get('jobId') != job:
        raise AssertionError(f'the new job was not claimed: {c}')
    put_object(c['objectPath'], body)
    return c, psql("select clock_timestamp();")


def nothing_persisted(c):
    return psql(f"select count(*) from private.market_acquisitions a where a.processing_job_id='{c['jobId']}';") == '0' and psql(
        f"select count(*) from private.market_version_commits where job_id='{c['jobId']}';") == '0' and psql(
        f"select status from private.market_acquisition_jobs where id='{c['jobId']}';") == 'leased'


def main():
    psql(SETUP)
    # 1. Two delegated workers claim at once: exactly one lease for the only job.
    job = enqueue()
    a = session('market_acq_a', as_account(WORKER_A)); b = session('market_acq_b', as_account(WORKER_B))
    barrier(a, 'A'); barrier(b, 'B')
    a.stdin.write(f"select private.worker_claim_market_acquisition_v1('{TOKEN_A}')->>'claimed';\n")
    b.stdin.write(f"select private.worker_claim_market_acquisition_v1('{TOKEN_B}')->>'claimed';\n")
    a.stdin.flush(); b.stdin.flush()
    results = sorted([finish(a).splitlines()[-1], finish(b).splitlines()[-1]])
    if results != ['false', 'true']:
        raise AssertionError(f'one job must give one lease: {results}')
    if psql(f"select count(*) from private.market_acquisition_allocations where job_id='{job}';") != '1':
        raise AssertionError('two allocations for one job')
    # 2. A pause holding the switch row: the concurrent claim waits and then claims nothing.
    enqueue()
    pause = session('market_acq_pause')
    pause.stdin.write(f"select private.release_market_acquisition_transport_v1('{command()}',false,'{OPERATOR}','Synthetic pause during a claim');\n")
    barrier(pause, 'PAUSE')
    b = session('market_acq_paused_claim', as_account(WORKER_B)); barrier(b, 'B')
    b.stdin.write(f"select private.worker_claim_market_acquisition_v1('{TOKEN_B}')->>'claimed';\n"); b.stdin.flush()
    wait_for_lock('market_acq_paused_claim')
    finish(pause)
    if finish(b).splitlines()[-1] != 'false':
        raise AssertionError('claimed after a committed pause')
    psql(f"select private.release_market_acquisition_transport_v1('{command()}',true,'{OPERATOR}','Synthetic reopening after the pause');")
    # 3. A revocation holding the delegation: the concurrent claim of that worker waits and claims nothing.
    delegation_b = psql(f"select id from private.market_acquisition_delegations where worker_token_id='{TOKEN_B_ID}' and revoked_at is null;")
    revoke = session('market_acq_revoke')
    revoke.stdin.write(f"select private.revoke_market_acquisition_delegation_v1('{command()}','{delegation_b}','Synthetic revocation during a claim','{OPERATOR}');\n")
    barrier(revoke, 'REVOKE')
    b = session('market_acq_revoked_claim', as_account(WORKER_B)); barrier(b, 'B')
    b.stdin.write(f"select private.worker_claim_market_acquisition_v1('{TOKEN_B}')->>'claimed';\n"); b.stdin.flush()
    wait_for_lock('market_acq_revoked_claim')
    finish(revoke)
    if finish(b).splitlines()[-1] != 'false':
        raise AssertionError('claimed after a committed revocation')
    psql(f"select private.grant_market_acquisition_delegation_v1('{command()}','{TOKEN_B_ID}','{SOURCE}','Synthetic race delegation B again','{OPERATOR}');")
    # 4. A source revision disabling the source: the concurrent renewal waits and is refused.
    enqueue()
    c = claim(WORKER_A, TOKEN_A)
    disable = session('market_acq_disable')
    disable.stdin.write(f"select private.record_market_source_revision_v1('{command()}','{SOURCE}',{definition(False, 'Fonte sintética da corrida desabilitada')},'{OPERATOR}');\n")
    barrier(disable, 'DISABLE')
    r = session('market_acq_renew', as_account(WORKER_A)); barrier(r, 'R')
    r.stdin.write(f"select private.worker_renew_market_acquisition_v1('{c['jobId']}','{c['capability']}','{c['leaseId']}');\n"); r.stdin.flush()
    wait_for_lock('market_acq_renew')
    finish(disable)
    out = finish(r, expect_ok=False)
    if 'market_source_not_acquirable' not in out:
        raise AssertionError('renewed after the source was disabled: ' + out)
    psql(f"select private.record_market_source_revision_v1('{command()}','{SOURCE}',{definition(True, 'Fonte sintética da corrida reabilitada')},'{OPERATOR}');")
    # 5a. A deletion in progress: the confirmation waits, then finds no object.
    enqueue()
    c = claim(WORKER_A, TOKEN_A)
    body = put_object(c['objectPath'])
    at = psql("select clock_timestamp();")
    delete = session('market_acq_delete', f"set local role authenticated;{as_account(WORKER_A)}select set_config('storage.operation','object.delete',true);"
                                          f"select set_config('storage.allow_delete_query','true',true);")
    delete.stdin.write(f"delete from storage.objects where bucket_id='market-reference' and name='{c['objectPath']}';\n")
    barrier(delete, 'DELETE')
    confirm = session('market_acq_confirm_after_delete')
    confirm.stdin.write(commit_sql(WORKER_A, c, body, at) + '\n'); confirm.stdin.flush()
    wait_for_lock('market_acq_confirm_after_delete')
    finish(delete)
    out = finish(confirm, expect_ok=False)
    if 'market_acquisition_object_mismatch' not in out:
        raise AssertionError('confirmed an object deleted concurrently: ' + out)
    # 5b. A confirmation in progress: the deletion waits, then deletes nothing.
    enqueue()
    c = claim(WORKER_A, TOKEN_A)
    body = put_object(c['objectPath'])
    at = psql("select clock_timestamp();")
    confirm = session('market_acq_confirm')
    confirm.stdin.write(commit_sql(WORKER_A, c, body, at) + '\n')
    barrier(confirm, 'CONFIRM')
    delete = session('market_acq_late_delete', f"set local role authenticated;{as_account(WORKER_A)}select set_config('storage.operation','object.delete',true);"
                                               f"select set_config('storage.allow_delete_query','true',true);")
    barrier(delete, 'D')
    delete.stdin.write(f"delete from storage.objects where bucket_id='market-reference' and name='{c['objectPath']}';\n"); delete.stdin.flush()
    wait_for_lock('market_acq_late_delete')
    finish(confirm)
    finish(delete)
    if psql(f"select count(*) from storage.objects where bucket_id='market-reference' and name='{c['objectPath']}';") != '1':
        raise AssertionError('a confirmed receipt lost its object')
    if psql(f"select count(*) from private.market_acquisitions where object_path='{c['objectPath']}';") != '1':
        raise AssertionError('the confirmation in progress did not record the receipt')
    # 6. An expired lease reclaimed by another worker: the late confirmation is refused; the new one confirms.
    job = enqueue()
    first = claim(WORKER_A, TOKEN_A)
    psql(f"update private.market_acquisition_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id='{job}';")
    second = claim(WORKER_B, TOKEN_B)
    if first['jobId'] != job or second['jobId'] != job or first['objectPath'] == second['objectPath']:
        raise AssertionError('reclaim did not allocate a new path for the same job')
    body = put_object(first['objectPath'])
    at = psql("select clock_timestamp();")
    late = psql(f"begin;{commit_sql(WORKER_A, first, body, at)}commit;", check=False)
    if 'market_acquisition_lease_denied' not in late:
        raise AssertionError('late confirmation accepted: ' + late)
    body = put_object(second['objectPath'], communique_list(280))
    at = psql("select clock_timestamp();")
    if psql(f"begin;{commit_sql(WORKER_B, second, body, at)}commit;").splitlines()[-1] != 'true':
        raise AssertionError('the current lease did not confirm')
    # 7. Storage waits on the source lock until the lease expires: the upload is refused after the wait.
    job = enqueue()
    c = claim(WORKER_A, TOKEN_A)
    psql(f"update private.market_acquisition_jobs set lease_expires_at=clock_timestamp()+interval '2 seconds' where id='{c['jobId']}';")
    holder = session('market_acq_source_holder', f"select pg_advisory_xact_lock(hashtextextended('market-source:{SOURCE}',0));")
    barrier(holder, 'HOLD')
    upload = session('market_acq_waiting_upload', f"set local role authenticated;{as_account(WORKER_A)}select set_config('storage.operation','object.upload',true);")
    barrier(upload, 'U')
    upload.stdin.write(f"insert into storage.objects(bucket_id,name,metadata,version) values('market-reference','{c['objectPath']}',"
                       f"jsonb_build_object('size',3,'mimetype','application/json','eTag','\"x\"'),'market-race');\n"); upload.stdin.flush()
    wait_for_lock('market_acq_waiting_upload')
    time.sleep(3)
    finish(holder, end_with='rollback')
    out = finish(upload, expect_ok=False)
    if 'row-level security' not in out:
        raise AssertionError('upload accepted after the lease expired during the wait: ' + out)
    # 8. Two confirmations of the same attempt at once: one receipt, one replay, both succeed.
    enqueue()
    c = claim(WORKER_A, TOKEN_A)
    body = put_object(c['objectPath'], communique_list(279))
    at = psql("select clock_timestamp();")
    first, second = session('market_acq_confirm_1'), session('market_acq_confirm_2')
    barrier(first, 'F'); barrier(second, 'S')
    first.stdin.write(commit_sql(WORKER_A, c, body, at) + '\n'); first.stdin.flush()
    second.stdin.write(commit_sql(WORKER_A, c, body, at) + '\n'); second.stdin.flush()
    # Either session may hold the job lock while the other waits: both are told to commit before
    # either is awaited, so the waiting one is never the one the script blocks on.
    end(first); end(second)
    out_first, out_second = finish(first), finish(second)
    if out_first.splitlines()[-1] != 'true' or out_second.splitlines()[-1] != 'true':
        raise AssertionError('simultaneous confirmations did not both answer committed: ' + out_first + out_second)
    if psql(f"select count(*) from private.market_acquisitions where object_path='{c['objectPath']}';") != '1':
        raise AssertionError('simultaneous confirmations recorded more than one receipt')
    detail = 'bcb-copom-comunicados-detalhe'
    # 9. Two first acquisitions of one meeting at once, agreeing: the second waits, then is not the reference.
    hold = communique(9101, '2025-09-16', 'hold', '15,00')
    c1, at1 = stored_claim(WORKER_A, TOKEN_A, hold, detail, '{"meeting":9101}')
    c2, at2 = stored_claim(WORKER_B, TOKEN_B, hold, detail, '{"meeting":9101}')
    s1 = session('market_acq_meeting_1'); s1.stdin.write(confirm_sql(WORKER_A, c1, hold, at1) + '\n'); barrier(s1, 'M1')
    s2 = session('market_acq_meeting_2'); barrier(s2, 'M2')
    s2.stdin.write(confirm_sql(WORKER_B, c2, hold, at2) + '\n'); s2.stdin.flush()
    wait_for_lock('market_acq_meeting_2')
    out1, out2 = finish(s1), finish(s2)
    if '"reference": true' not in out1 or '"reference": false' not in out2:
        raise AssertionError('agreeing first acquisitions did not keep one reference: ' + out1 + out2)
    if psql("select count(*) from private.market_copom_communique_acquisitions where meeting=9101;") != '2' or psql(
            f"select count(*) from private.market_copom_meetings m join private.market_acquisitions a on a.id=m.reference_acquisition_id "
            f"where m.meeting=9101 and a.processing_job_id='{c1['jobId']}';") != '1':
        raise AssertionError('agreeing acquisitions did not leave one meeting row referencing the first')
    # 10. The same, disagreeing: the second waits, then refuses and persists nothing.
    first_cut, other_cut = communique(9102, '2025-10-07', 'cut', '14,50'), communique(9102, '2025-10-07', 'cut', '14,25')
    c1, at1 = stored_claim(WORKER_A, TOKEN_A, first_cut, detail, '{"meeting":9102}')
    c2, at2 = stored_claim(WORKER_B, TOKEN_B, other_cut, detail, '{"meeting":9102}')
    s1 = session('market_acq_disagree_1'); s1.stdin.write(confirm_sql(WORKER_A, c1, first_cut, at1) + '\n'); barrier(s1, 'D1')
    s2 = session('market_acq_disagree_2'); barrier(s2, 'D2')
    s2.stdin.write(confirm_sql(WORKER_B, c2, other_cut, at2) + '\n'); s2.stdin.flush()
    wait_for_lock('market_acq_disagree_2')
    finish(s1)
    out = finish(s2, expect_ok=False)
    if 'market_copom_meeting_disagreement' not in out or not nothing_persisted(c2):
        raise AssertionError('a disagreeing acquisition was not refused cleanly: ' + out)
    # 11. A series confirmed while its change's communiqué is uncommitted: quarantined; two relinks, one version.
    change = communique(9103, '2025-11-05', 'cut', '14,00')
    c1, at1 = stored_claim(WORKER_A, TOKEN_A, change, detail, '{"meeting":9103}')
    window = series('2025-10-15', 27, '2025-11-06', '14.50', '14.00')
    c2, at2 = stored_claim(WORKER_B, TOKEN_B, window, 'bcb-sgs-432-endpoint', '{"window":{"start":"2025-10-15","end":"2025-11-10"}}')
    s1 = session('market_acq_hidden_communique'); s1.stdin.write(confirm_sql(WORKER_A, c1, change, at1) + '\n'); barrier(s1, 'H1')
    answer = json.loads(psql(f"set statement_timeout='15s';begin;{confirm_sql(WORKER_B, c2, window, at2)}commit;").splitlines()[-1])
    finish(s1)
    if answer.get('quality', {}).get('status') != 'quarantined':
        raise AssertionError(f'a series saw an uncommitted communiqué: {answer}')
    tip = answer['versionId']
    r1 = session('market_acq_relink_1')
    r1.stdin.write(f"select private.relink_market_version_v1('{command()}','{tip}','{OPERATOR}')::text;\n"); barrier(r1, 'R1')
    r2 = session('market_acq_relink_2'); barrier(r2, 'R2')
    r2.stdin.write(f"select private.relink_market_version_v1('{command()}','{tip}','{OPERATOR}')::text;\n"); r2.stdin.flush()
    wait_for_lock('market_acq_relink_2')
    out1 = finish(r1)
    out2 = finish(r2, expect_ok=False)
    relinked = json.loads(out1.splitlines()[-1])
    if not relinked.get('relinked') or relinked.get('quality', {}).get('status') != 'approved' or 'market_relink_not_tip' not in out2:
        raise AssertionError('concurrent relinks of one tip did not make exactly one approved version: ' + out1 + out2)
    if psql(f"select count(*) from private.market_versions where supersedes='{tip}';") != '1':
        raise AssertionError('more than one successor of a tip')
    # 12. A delegation revoked while a confirmation waits on it: the confirmation is refused.
    body = communique_list(278)
    c, at = stored_claim(WORKER_B, TOKEN_B, body)
    delegation_b = psql(f"select id from private.market_acquisition_delegations where worker_token_id='{TOKEN_B_ID}' and revoked_at is null;")
    revoke = session('market_acq_revoke_confirm')
    revoke.stdin.write(f"select private.revoke_market_acquisition_delegation_v1('{command()}','{delegation_b}','Synthetic revocation during a confirmation','{OPERATOR}');\n")
    barrier(revoke, 'RC')
    confirm = session('market_acq_confirm_revoked'); barrier(confirm, 'C')
    confirm.stdin.write(confirm_sql(WORKER_B, c, body, at) + '\n'); confirm.stdin.flush()
    wait_for_lock('market_acq_confirm_revoked')
    finish(revoke)
    out = finish(confirm, expect_ok=False)
    if 'market_delegation_required' not in out or not nothing_persisted(c):
        raise AssertionError('confirmed after a concurrent revocation: ' + out)
    psql(f"select private.grant_market_acquisition_delegation_v1('{command()}','{TOKEN_B_ID}','{SOURCE}','Synthetic race delegation B after the confirmation race','{OPERATOR}');")
    # 13. A meeting's first insertion held until the second attempt's lease expires: refused, nothing persisted.
    hold = communique(9104, '2025-12-10', 'hold', '14,00')
    c1, at1 = stored_claim(WORKER_A, TOKEN_A, hold, detail, '{"meeting":9104}')
    c2, at2 = stored_claim(WORKER_B, TOKEN_B, hold, detail, '{"meeting":9104}')
    psql(f"update private.market_acquisition_jobs set lease_expires_at=clock_timestamp()+interval '2 seconds' where id='{c2['jobId']}';")
    s1 = session('market_acq_meeting_holder'); s1.stdin.write(confirm_sql(WORKER_A, c1, hold, at1) + '\n'); barrier(s1, 'MH')
    s2 = session('market_acq_meeting_expiring'); barrier(s2, 'ME')
    s2.stdin.write(confirm_sql(WORKER_B, c2, hold, at2) + '\n'); s2.stdin.flush()
    wait_for_lock('market_acq_meeting_expiring')
    time.sleep(3)
    finish(s1)
    out = finish(s2, expect_ok=False)
    if 'market_acquisition_lease_denied' not in out or not nothing_persisted(c2):
        raise AssertionError('a confirmation whose lease expired during the wait was not refused cleanly: ' + out)
    print('PASS: market acquisition claims, pauses, revocations, withdrawals, deletions, lease expiry, meetings, evidence and relinks serialize across sessions')


def cleanup():
    # A failed race must not leave sessions holding transactions or locks for the next CI steps.
    for proc in SESSIONS:
        if proc.poll() is None:
            proc.kill()
    psql("select pg_terminate_backend(pid) from pg_stat_activity where application_name like 'market_acq_%' and pid<>pg_backend_pid();", check=False)


if __name__ == '__main__':
    try:
        main()
    finally:
        cleanup()
