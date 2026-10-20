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
The database may already hold the market publisher and the source from earlier steps of the same CI
job; the setup reuses them. Every row here is synthetic and lives only in the disposable database.
"""
import json
import os
import select
import subprocess
import time

URL = os.environ['DATABASE_URL']
P = '3a740000'
FOUNDER, OPERATOR, WORKER_A, WORKER_B = (f'{P}-0000-4000-8000-00000000000{n}' for n in range(1, 5))
TOKEN_A, TOKEN_B = f'synthetic-market-race-token-{P}-a', f'synthetic-market-race-token-{P}-b'
TOKEN_A_ID, TOKEN_B_ID = f'{P}-0000-4000-8000-000000000011', f'{P}-0000-4000-8000-000000000012'
SOURCE = 'race-market-source'


def psql(sql, check=True):
    done = subprocess.run(['psql', URL, '-v', 'ON_ERROR_STOP=1', '-At', '-q'], input=sql, text=True, capture_output=True)
    if check and done.returncode != 0:
        raise AssertionError(done.stdout + done.stderr)
    return done.stdout.strip() if check else (done.stdout + done.stderr).strip()


def definition(enabled, reason):
    return (f"jsonb_build_object('registryId','race_source','license',jsonb_build_object('kind','open','license','ODbL-1.0','attribution','Fonte sintética da corrida',"
            f"'evidenceIds',jsonb_build_array('race-evidence'),'retainAdoptedValues',true,'storeDays',null),'allowedHosts',jsonb_build_array('api.bcb.gov.br'),"
            f"'calendar','calendar_days','expectedPublication',null,'maximumAgeHours',30,'enabled',{str(enabled).lower()},'reason','{reason}')")


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


def enqueue(path):
    psql(f"update private.market_acquisition_jobs set available_at=clock_timestamp()+interval '1 day' where status='queued' and source_id='{SOURCE}';")
    return psql(f"select private.enqueue_market_acquisition_v1('{command()}','{SOURCE}','https://api.bcb.gov.br/{path}','json',"
                f"'Aquisição sintética da corrida','{OPERATOR}')->>'jobId';")


def as_account(account):
    return f"select set_config('request.jwt.claim.sub','{account}',true);"


def claim(account, token):
    return json.loads(psql(f"begin;{as_account(account)}select private.worker_claim_market_acquisition_v1('{token}')::text;commit;").splitlines()[-1])


def session(name, first=''):
    proc = subprocess.Popen(['psql', URL, '-v', 'ON_ERROR_STOP=1', '-At', '-q'], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, bufsize=1, env={**os.environ, 'PGAPPNAME': name})
    proc.stdin.write(f"set statement_timeout='15s';begin;{first}\n")
    return proc


def barrier(proc, mark):
    proc.stdin.write(f"\\echo {mark}\n"); proc.stdin.flush()
    while True:
        if not select.select([proc.stdout], [], [], 15)[0]:
            raise AssertionError(f'{mark} not reached')
        line = proc.stdout.readline()
        if line.strip() == mark:
            return
        if not line:
            raise AssertionError(f'{mark}: session ended')


def wait_for_lock(name):
    deadline = time.monotonic() + 10
    while psql(f"select count(*) from pg_stat_activity where application_name='{name}' and wait_event_type='Lock';") != '1':
        if time.monotonic() >= deadline:
            raise AssertionError(f'{name} did not wait')
        time.sleep(.05)


def finish(proc, expect_ok=True):
    try:
        proc.stdin.write('commit;\n'); proc.stdin.close()
    except BrokenPipeError:
        pass
    out = proc.stdout.read(); code = proc.wait(timeout=15)
    if expect_ok and code != 0:
        raise AssertionError(out)
    return out


def put_object(path, body=b'[1]'):
    import hashlib
    md5 = hashlib.md5(body).hexdigest()
    psql(f"insert into storage.objects(bucket_id,name,metadata,version) values('market-reference','{path}',"
         f"jsonb_build_object('size',{len(body)},'mimetype','application/json','eTag','\"{md5}\"'),'market-race');")
    return md5, len(body)


def commit_sql(account, c, md5, size, at):
    return (f"{as_account(account)}select private.worker_commit_market_acquisition_v1('{c['jobId']}','{c['capability']}','{c['leaseId']}',"
            f"'https://api.bcb.gov.br/x',repeat('a',64),'{md5}',{size},'application/json','{at}')->>'committed';")


def main():
    psql(SETUP)
    # 1. Two delegated workers claim at once: exactly one lease for the only job.
    job = enqueue('one')
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
    enqueue('two')
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
    enqueue('four')
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
    enqueue('five-a')
    c = claim(WORKER_A, TOKEN_A)
    md5, size = put_object(c['objectPath'])
    at = psql("select clock_timestamp();")
    delete = session('market_acq_delete', f"set local role authenticated;{as_account(WORKER_A)}select set_config('storage.operation','object.delete',true);"
                                          f"select set_config('storage.allow_delete_query','true',true);")
    delete.stdin.write(f"delete from storage.objects where bucket_id='market-reference' and name='{c['objectPath']}';\n")
    barrier(delete, 'DELETE')
    confirm = session('market_acq_confirm_after_delete')
    confirm.stdin.write(commit_sql(WORKER_A, c, md5, size, at) + '\n'); confirm.stdin.flush()
    wait_for_lock('market_acq_confirm_after_delete')
    finish(delete)
    out = finish(confirm, expect_ok=False)
    if 'market_acquisition_object_mismatch' not in out:
        raise AssertionError('confirmed an object deleted concurrently: ' + out)
    # 5b. A confirmation in progress: the deletion waits, then deletes nothing.
    enqueue('five-b')
    c = claim(WORKER_A, TOKEN_A)
    md5, size = put_object(c['objectPath'])
    at = psql("select clock_timestamp();")
    confirm = session('market_acq_confirm')
    confirm.stdin.write(commit_sql(WORKER_A, c, md5, size, at) + '\n')
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
    job = enqueue('six')
    first = claim(WORKER_A, TOKEN_A)
    psql(f"update private.market_acquisition_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id='{job}';")
    second = claim(WORKER_B, TOKEN_B)
    if first['jobId'] != job or second['jobId'] != job or first['objectPath'] == second['objectPath']:
        raise AssertionError('reclaim did not allocate a new path for the same job')
    md5, size = put_object(first['objectPath'])
    at = psql("select clock_timestamp();")
    late = psql(f"begin;{commit_sql(WORKER_A, first, md5, size, at)}commit;", check=False)
    if 'market_acquisition_lease_denied' not in late:
        raise AssertionError('late confirmation accepted: ' + late)
    md5, size = put_object(second['objectPath'], b'[2]')
    at = psql("select clock_timestamp();")
    if psql(f"begin;{commit_sql(WORKER_B, second, md5, size, at)}commit;").splitlines()[-1] != 'true':
        raise AssertionError('the current lease did not confirm')
    print('PASS: market acquisition claims, pauses, revocations, withdrawals, deletions and lease expiry serialize across sessions')


if __name__ == '__main__':
    main()
