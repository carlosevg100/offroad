#!/usr/bin/env python3
"""Two real sessions, disposable CI only: two workers racing for one recompute candidate lease it once.

Stage 18, increment 3B. One synthetic execution pins a platform release; a newer release of the same
procedure is published with its profile and its capability released and universal, so the dependency
effect plans one zero-budget candidate. Two worker accounts, each bound to its own worker token, claim
at the same time: the first holds its claim transaction open; the second must visibly wait for the
per-work lock and, once the first commits, finds the candidate leased and claims nothing.
"""
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
    raise SystemExit('Dependency recompute concurrency requires the disposable local CI database')
command = ['psql', url, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1']
org = 'a4194000-0000-4000-9000-000000000001'
method = 'synthetic-execution-recompute'
workers = {
    'first': ('a4196000-0000-4000-8000-000000000001', 'a4196000-0000-4000-9000-000000000001', 'synthetic-recompute-race-worker-token-first-000000'),
    'second': ('a4196000-0000-4000-8000-000000000002', 'a4196000-0000-4000-9000-000000000002', 'synthetic-recompute-race-worker-token-second-00000'),
}


def run(sql):
    result = subprocess.run(command, input=sql, text=True, capture_output=True, timeout=60)
    if result.returncode:
        raise AssertionError(result.stderr)
    return result.stdout.strip()


def expand(path):
    return re.sub(r'^\\ir (.+)$', lambda m: expand(path.parent / m[1].strip()), path.read_text(), flags=re.M)


def claim(worker):
    account, _, token = workers[worker]
    return (f"select set_config('request.jwt.claim.sub','{account}',true),"
            f"set_config('request.jwt.claims',jsonb_build_object('sub','{account}','role','authenticated')::text,true);"
            f"select public.worker_claim_dependency_recompute_v1('{token}',120);")


# Other concurrent suites keep their own immutable fixtures until stack teardown.
fixture = expand(ROOT / 'supabase/tests/support/execution_commands_fixture.sql')
fixture = fixture.replace('a11b0000', 'a4194000').replace('a4171000', 'a4195000').replace('a11b-', 'a4194-').replace('synthetic-execution', method)
accounts = ''.join(
    f"insert into auth.users(id,email) values('{account}','recompute-race-{name}@example.invalid');"
    f"insert into private.worker_tokens(id,label,token_sha256,execution_account_user_id)"
    f" values('{token_id}','Synthetic recompute race worker {name}',extensions.digest('{token}','sha256'),'{account}');"
    for name, (account, token_id, token) in workers.items())
# A newer release of the procedure, its profile and its capability released and universal.
newer = (
    "insert into private.platform_capability_releases(capability_key,released,exposure,method_id,method_version,method_maturity,approved_by,approved_at,approval_source)"
    f" values('{method}-v2',true,'universal','{method}','test-v2','tested','Synthetic approver',current_date,'Synthetic disposable CI fixture');"
    "insert into private.platform_method_releases(id,method_id,version,manifest_hash,manifest,components,evidence,approval,capability_key)"
    f" select '{method}-test-v2','{method}','test-v2',repeat('9',64),manifest,components,evidence,approval,'{method}-v2'"
    f" from private.platform_method_releases where id='{method}-test-v1';"
    "insert into private.execution_method_profiles(id,platform_release_id,serialization_version,canonical_payload,payload_fingerprint,adapter_source_commit,review_evidence)"
    f" select 'a4195000-0000-4000-9000-0000000000b2','{method}-test-v2','offroad-execution-json-utf16-v1',payload::text,"
    " encode(extensions.digest(payload::text,'sha256'),'hex'),repeat('c',40),jsonb_build_object('result','approved','subjectCommit',repeat('c',40),'reviewer','Synthetic independent reviewer','sourceHash',repeat('d',64))"
    f" from (select jsonb_set(jsonb_set(jsonb_set(jsonb_set(p.payload,'{{method,platformReleaseId}}','\"{method}-test-v2\"'),'{{method,methodVersion}}','\"test-v2\"'),"
    " '{method,manifestHash}',to_jsonb(repeat('9',64))),'{method,baseManifestHash}',to_jsonb(repeat('9',64))) payload"
    " from private.execution_method_profiles p where p.id='a4195000-0000-4000-9000-000000000001') f;")
run('begin;' + fixture + accounts + "select private.request_work_execution_v1('a4195000-0000-4000-9000-000000000001',contract::text,'{}') from execution_fixture;"
    + newer + 'commit;')
# The dependency effect of every change event plans the candidate.
run(f"select private.apply_dependency_event_v1(organization_id,id) from private.domain_events where organization_id='{org}'"
    " and effect='propagate_dependencies' order by created_at,id;")
candidates = run(f"select count(*)||':'||min(state)||':'||min(action) from public.work_recompute_candidates where organization_id='{org}';")
assert candidates == '1:scheduled:recompute', candidates

first = second = None
try:
    first = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    first.stdin.write('begin;\n' + claim('first') + '\n\\echo RECOMPUTE_CLAIM_HELD\n')
    first.stdin.flush()
    first_claim = ''
    deadline = time.monotonic() + 20
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0 or not select.select([first.stdout], [], [], remaining)[0]:
            raise AssertionError('First claim did not reach its barrier')
        line = first.stdout.readline().strip()
        if line == 'RECOMPUTE_CLAIM_HELD':
            break
        if line.startswith('{'):
            first_claim = line
        if first.poll() is not None:
            raise AssertionError(line)
    assert '"claimed": true' in first_claim, first_claim
    second = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    second.stdin.write("set application_name='offroad_recompute_contender';begin;" + claim('second') + 'commit;\n')
    second.stdin.close()
    second.stdin = None
    deadline = time.monotonic() + 20
    while run("select count(*) from pg_stat_activity where application_name='offroad_recompute_contender' and wait_event_type='Lock';") != '1':
        if time.monotonic() >= deadline or second.poll() is not None:
            raise AssertionError('Second claim did not wait on the work lock')
        time.sleep(.05)
    first.stdin.write('commit;\n')
    first.stdin.close()
    first.stdin = None
    first_output = first.communicate(timeout=20)[0]
    second_output = second.communicate(timeout=20)[0]
    assert first.returncode == 0, first_output
    assert second.returncode == 0, second_output
    assert '"claimed": false' in second_output and '"claimed": true' not in second_output, second_output
finally:
    for process in (first, second):
        if process is not None and process.poll() is None:
            process.kill()
            process.wait(timeout=10)

lease = run(f"select count(*)||':'||max(attempts)||':'||bool_and(leased_by='{workers['first'][1]}')||':'||bool_and(lease_expires_at>clock_timestamp())"
            f" from private.work_recompute_leases where organization_id='{org}';")
assert lease == '1:1:true:true', lease
executions = run(f"select count(*) from public.work_executions where organization_id='{org}';")
assert executions == '1', executions
print('dependency_recompute_concurrency: PASS (observed work lock wait, one lease for the first worker, the second claimed nothing)')
