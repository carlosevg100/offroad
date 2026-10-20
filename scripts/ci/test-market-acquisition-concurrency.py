#!/usr/bin/env python3
"""Real two-session races on the market acquisition job (ADR 0023), on the disposable CI database.

1. Two worker sessions claim at the same time: one job, one lease; the other session gets nothing.
2. A pause that holds the transport switch makes a concurrent claim wait, then answer unclaimed.
3. A worker whose lease expired and whose job was claimed again cannot confirm, and the new lease
   confirms only against its own allocation.
Every row here is synthetic and lives only in the disposable database.
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


def psql(sql, check=True):
    done = subprocess.run(['psql', URL, '-v', 'ON_ERROR_STOP=1', '-At', '-q'], input=sql, text=True, capture_output=True)
    if check and done.returncode != 0:
        raise AssertionError(done.stdout + done.stderr)
    return done.stdout.strip() if check else (done.stdout + done.stderr).strip()


SETUP = f"""
begin;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
select ('{P}-0000-4000-8000-00000000000'||n)::uuid,'authenticated','authenticated','{P}-'||n||'@example.invalid','{{}}','{{}}',now(),now(),false,false from generate_series(1,4) n;
insert into private.platform_principals(user_id,role,label) values('{FOUNDER}','founder','Synthetic race founder'),('{OPERATOR}','operator','Synthetic race operator');
insert into private.worker_tokens(id,label,token_sha256,execution_account_user_id) values
 ('{P}-0000-4000-8000-000000000011','Synthetic race worker A',extensions.digest('{TOKEN_A}','sha256'),'{WORKER_A}'),
 ('{P}-0000-4000-8000-000000000012','Synthetic race worker B',extensions.digest('{TOKEN_B}','sha256'),'{WORKER_B}');
select private.register_market_publisher_v1('{P}-0000-4000-a000-000000000001','Offroad, referência de mercado','{FOUNDER}');
select private.record_market_source_revision_v1('{P}-0000-4000-a000-000000000011','bcb-sgs-cdi',jsonb_build_object('registryId','bcb_sgs',
 'license',jsonb_build_object('kind','open','license','ODbL-1.0','attribution','Banco Central do Brasil, SGS','evidenceIds',jsonb_build_array('bcb-open-data'),'retainAdoptedValues',true,'storeDays',null),
 'allowedHosts',jsonb_build_array('api.bcb.gov.br'),'calendar','br_business_days','expectedPublication','09:00','maximumAgeHours',30,'enabled',true,'reason','Série sintética da corrida'),'{OPERATOR}');
select private.release_market_acquisition_transport_v1('{P}-0000-4000-a000-000000000021',true,'{OPERATOR}','Synthetic opening for the races');
commit;
"""


def enqueue(n):
    return psql(f"select private.enqueue_market_acquisition_v1('{P}-0000-4000-a000-0000000001{n:02d}','bcb-sgs-cdi','https://api.bcb.gov.br/{n}','json',"
                f"'Aquisição sintética da corrida','{OPERATOR}')->>'jobId';")


def session(account):
    proc = subprocess.Popen(['psql', URL, '-v', 'ON_ERROR_STOP=1', '-At', '-q'], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, bufsize=1,
                            env={**os.environ, 'PGAPPNAME': 'market_acq_' + account[-4:] + str(time.monotonic_ns())[-6:]})
    proc.stdin.write(f"set statement_timeout='15s';begin;select set_config('request.jwt.claim.sub','{account}',true);\n")
    return proc


def barrier(proc, mark):
    proc.stdin.write(f"\\echo {mark}\n"); proc.stdin.flush()
    while True:
        if not select.select([proc.stdout], [], [], 15)[0]:
            raise AssertionError(f'{mark} not reached')
        line = proc.stdout.readline().strip()
        if line == mark:
            return
        if not line:
            raise AssertionError(f'{mark}: session ended')


def finish(proc):
    proc.stdin.write('commit;\n'); proc.stdin.close()
    out = proc.stdout.read(); code = proc.wait(timeout=15)
    if code != 0:
        raise AssertionError(out)
    return out


def claim_line(token):
    return f"select private.worker_claim_market_acquisition_v1('{token}')->>'claimed';\n"


def main():
    psql(SETUP)
    # 1. Two claims at once: exactly one lease for the only job.
    job = enqueue(1)
    a, b = session(WORKER_A), session(WORKER_B)
    barrier(a, 'A_READY'); barrier(b, 'B_READY')
    a.stdin.write(claim_line(TOKEN_A)); b.stdin.write(claim_line(TOKEN_B)); a.stdin.flush(); b.stdin.flush()
    results = sorted([finish(a).splitlines()[-1], finish(b).splitlines()[-1]])
    if results != ['f', 't']:
        raise AssertionError(f'one job must give one lease: {results}')
    if psql(f"select count(*) from private.market_acquisition_allocations where job_id='{job}';") != '1':
        raise AssertionError('two allocations for one job')
    # 2. A pause holding the switch row: the concurrent claim waits and then claims nothing.
    enqueue(2)
    pause = subprocess.Popen(['psql', URL, '-v', 'ON_ERROR_STOP=1', '-At', '-q'], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.STDOUT, text=True, bufsize=1)
    pause.stdin.write(f"set statement_timeout='15s';begin;select private.release_market_acquisition_transport_v1('{P}-0000-4000-a000-000000000022',false,'{OPERATOR}','Synthetic pause during a claim');\n")
    barrier(pause, 'PAUSE_HELD')
    b = session(WORKER_B)
    barrier(b, 'B2_READY')
    b.stdin.write(claim_line(TOKEN_B)); b.stdin.flush()
    deadline = time.monotonic() + 10
    while psql("select count(*) from pg_stat_activity where application_name like 'market_acq_%' and wait_event_type='Lock';") != '1':
        if time.monotonic() >= deadline:
            raise AssertionError('the claim did not wait for the pause')
        time.sleep(.05)
    finish(pause)
    if finish(b).splitlines()[-1] != 'f':
        raise AssertionError('claimed after a committed pause')
    psql(f"select private.release_market_acquisition_transport_v1('{P}-0000-4000-a000-000000000023',true,'{OPERATOR}','Synthetic reopening after the pause');")
    # 3. An expired lease reclaimed by another worker: the late confirmation is refused.
    psql(f"update private.market_acquisition_jobs set available_at=clock_timestamp()+interval '1 hour' where status='queued';")
    job = enqueue(3)
    first = psql(f"begin;select set_config('request.jwt.claim.sub','{WORKER_A}',true);select private.worker_claim_market_acquisition_v1('{TOKEN_A}')::text;commit;").splitlines()[-1]
    psql(f"update private.market_acquisition_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id='{job}';")
    second = psql(f"begin;select set_config('request.jwt.claim.sub','{WORKER_B}',true);select private.worker_claim_market_acquisition_v1('{TOKEN_B}')::text;commit;").splitlines()[-1]
    first, second = json.loads(first), json.loads(second)
    if first['jobId'] != job or second['jobId'] != job or first['objectPath'] == second['objectPath']:
        raise AssertionError('reclaim did not allocate a new path for the same job')
    late = psql(f"begin;select set_config('request.jwt.claim.sub','{WORKER_A}',true);"
                f"select private.worker_commit_market_acquisition_v1('{job}','{first['capability']}','{first['leaseId']}','https://api.bcb.gov.br/3',"
                f"repeat('a',64),md5('x'),1,'application/json',clock_timestamp());commit;", check=False)
    if 'market_acquisition_lease_denied' not in late:
        raise AssertionError('late confirmation accepted: ' + late)
    print('PASS: market acquisition claims, pauses and lease expiry serialize across sessions')


if __name__ == '__main__':
    main()
