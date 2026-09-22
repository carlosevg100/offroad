#!/usr/bin/env python3
"""Two real connections, disposable CI only: competing claims, operations and revocation."""
import json
import os
from pathlib import Path
import re
import select
import subprocess
import time
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
url = os.environ['DATABASE_URL']
if urlparse(url).hostname not in ('localhost', '127.0.0.1', '::1'):
    raise SystemExit('Execution concurrency requires the disposable local CI database')
command = ['psql', url, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1']
actor = 'a4172000-0000-4000-8000-000000000001'
work = 'a4172000-0000-4000-9000-000000000002'
execution = 'a4173000-0000-4000-9000-000000000002'

def run(sql):
    r = subprocess.run(command, input=sql, text=True, capture_output=True, timeout=40)
    if r.returncode:
        raise AssertionError(r.stderr)
    return r.stdout.strip()

def expand(path):
    return re.sub(r'^\\ir (.+)$', lambda m: expand(path.parent / m[1].strip()), path.read_text(), flags=re.M)

def authorized(sql):
    return "select set_config('request.jwt.claim.sub','" + actor + "',true);" + sql

def compete(first_sql, second_sql, expected_error=None, first_receipt=False):
    """The second session must visibly wait for a lock, then complete after the first."""
    first = second = None
    try:
        first = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        first.stdin.write('\\o /dev/null\nbegin;' + authorized(first_sql) + '\n\\echo EXECUTION_LOCK_HELD\n')
        first.stdin.flush()
        deadline = time.monotonic() + 20
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0 or not select.select([first.stdout], [], [], remaining)[0]:
                raise AssertionError('First execution command did not reach its barrier')
            line = first.stdout.readline().strip()
            if line == 'EXECUTION_LOCK_HELD':
                break
            if first.poll() is not None:
                raise AssertionError(line)
        second = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        second.stdin.write("set application_name='offroad_execution_contender';begin;" + authorized(second_sql) + 'commit;\n')
        second.stdin.close()
        second.stdin = None
        deadline = time.monotonic() + 20
        while run("select count(*) from pg_stat_activity where application_name='offroad_execution_contender' and wait_event_type='Lock';") != '1':
            if time.monotonic() >= deadline or second.poll() is not None:
                raise AssertionError('Second execution command did not wait on the lock')
            time.sleep(.05)
        first.stdin.write('commit;\n' + ('\\o\nselect receipt from execution_claim_receipt;\n' if first_receipt else ''))
        first.stdin.close()
        first.stdin = None
        a = first.communicate(timeout=20)[0]
        b = second.communicate(timeout=20)[0]
        assert first.returncode == 0, a
        if expected_error:
            assert second.returncode != 0 and expected_error in b, b
        else:
            assert second.returncode == 0, b
        return (json.loads(a.strip()), b) if first_receipt else b
    finally:
        for process in (first, second):
            if process is not None and process.poll() is None:
                process.kill()
                process.wait(timeout=10)

fixture = expand(ROOT / 'supabase/tests/support/execution_commands_fixture.sql')
# Other concurrent suites retain their own immutable fixtures until stack teardown.
fixture = fixture.replace('a11b0000', 'a4172000').replace('a4171000', 'a4173000').replace('a11b-', 'a4172-')
run('begin;' + fixture + "update execution_fixture set request=private.request_work_execution_v1('a4173000-0000-4000-9000-000000000001',contract::text,'{}');"
    "insert into private.worker_tokens(id,label,token_sha256) values('a4173000-0000-4000-8000-000000000002','Synthetic second worker',extensions.digest('synthetic-second-execution-worker-token','sha256'));commit;")
job = run("select id from public.processing_jobs where execution_id='" + execution + "';")
a = "create temp table execution_claim_receipt as select private.claim_work_execution_v1('synthetic-policy-worker-fixture-token-v1','" + job + "',60) as receipt;"
b = "select private.claim_work_execution_v1('synthetic-second-execution-worker-token','" + job + "',60);"
claim, output = compete(a, b, first_receipt=True)
assert claim['claimed'] is True
assert '"claimed": false' in output, output
assert run("select attempts from public.processing_jobs where id='" + job + "';") == '1'
# Consume the actual claim receipt in memory; never replace queue authority in the test.
# These values originate in the disposable database and are not printed to CI logs.
lease = claim['leaseId']
capability = claim['capability'].replace("'", "''")
reserve = ("select private.reserve_execution_operation_v1('" + job + "','" + capability + "','" + lease
    + "','a4173000-0000-4000-9000-000000000003',repeat('a',64),'synthetic#calculate','test-v1','read_only',0,0);")
output = compete(reserve, reserve)
assert '"mayExecute": false' in output and '"replayed": true' in output, output
assert run("select count(*) from private.execution_operation_receipts where execution_id='" + execution + "';") == '1'
assert run("select reserved_microusd+spent_microusd+reserved_calls+spent_calls from private.execution_budget_accounts where execution_id='" + execution + "';") == '0'
revoke = "select private.revoke_resource_access_v1('" + work + "','" + actor + "');"
compete(revoke, reserve, 'execution_authority_denied')
assert run("select count(*) from private.execution_result_receipts where execution_id='" + execution + "';") == '0'
print('execution_concurrency: PASS (two worker tokens, one claim, one operation, observed policy wait, stale authority denied)')

def fresh_scope(number):
    """Independent work and release for each terminal race; no regrant of old authority."""
    global actor, work, execution
    org_prefix = f'a417{number}000'
    execution_prefix = f'a418{number}000'
    actor = org_prefix + '-0000-4000-8000-000000000001'
    work = org_prefix + '-0000-4000-9000-000000000002'
    execution = execution_prefix + '-0000-4000-9000-000000000002'
    profile = execution_prefix + '-0000-4000-9000-000000000001'
    fixture = expand(ROOT / 'supabase/tests/support/execution_commands_fixture.sql')
    fixture = fixture.replace('a11b0000', org_prefix).replace('a4171000', execution_prefix)
    fixture = fixture.replace('a11b-', org_prefix + '-').replace('synthetic-execution', 'synthetic-execution-' + str(number))
    run('begin;' + fixture + "select private.request_work_execution_v1('" + profile + "',contract::text,'{}') from execution_fixture;commit;")
    job = run("select id from public.processing_jobs where execution_id='" + execution + "';")
    output = run('begin;' + authorized("select private.claim_work_execution_v1('synthetic-policy-worker-fixture-token-v1','" + job + "',60);") + 'commit;')
    claim = json.loads(next(line for line in output.splitlines() if line.startswith('{')))
    assert claim['claimed'] is True
    contract = json.loads(claim['contractText'])
    commit = ("select private.commit_work_execution_result_v1('" + job + "','" + claim['capability'] + "','" + claim['leaseId']
              + "','" + claim['contractFingerprint'] + "','" + contract['inputs']['fingerprint'] + "','{}','succeeded','calculated');")
    revoke = "select private.revoke_resource_access_v1('" + work + "','" + actor + "');"
    return commit, revoke

commit, revoke = fresh_scope(4)
compete(revoke, commit, 'execution_authority_denied')
assert run("select count(*) from private.execution_result_receipts where execution_id='" + execution + "';") == '0'
print('execution_commit_revocation_first: PASS (observed wait, commit denied, no result)')

commit, revoke = fresh_scope(5)
compete(commit, revoke)
assert run("select count(*) from private.execution_result_receipts where execution_id='" + execution + "';") == '1'
denied = subprocess.run(command, input='begin;' + authorized(commit) + 'commit;', text=True, capture_output=True, timeout=20)
assert denied.returncode != 0 and 'execution_authority_denied' in denied.stderr
print('execution_commit_first: PASS (observed wait, one result before revocation, replay denied after)')

commit, _ = fresh_scope(6)
compete("update private.platform_capability_releases set released=false where capability_key='synthetic-execution-6';", commit, 'execution_method_unavailable')
assert run("select count(*) from private.execution_result_receipts where execution_id='" + execution + "';") == '0'
print('execution_release_withdrawal: PASS (observed release lock wait, commit denied, no result)')
# Immutable synthetic records exist only in the disposable local CI stack.
