#!/usr/bin/env python3
"""Two real sessions: execution-result source revocation through an adopted observation."""
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
    raise SystemExit('Execution closure concurrency requires the disposable local CI database')
command = ['psql', url, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1']
actor = 'a5209000-0000-4000-8000-000000000001'
other = 'a5209000-0000-4000-8000-000000000002'
org = 'a5209000-0000-4000-9000-000000000001'
work = 'a5209000-0000-4000-9000-000000000002'


def run(sql):
    result = subprocess.run(command, input=sql, text=True, capture_output=True, timeout=60)
    if result.returncode:
        raise AssertionError(result.stderr)
    return result.stdout.strip()


def expand(path):
    return re.sub(r'^\\ir (.+)$', lambda m: expand(path.parent / m[1].strip()), path.read_text(), flags=re.M)


def authorized(sql, subject=actor):
    return f"select set_config('request.jwt.claim.sub','{subject}',true);" + sql


def compete(first_sql, second_sql, expected_error=None, second_actor=actor):
    first = second = None
    try:
        first = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        first.stdin.write('\\o /dev/null\nbegin;' + authorized(first_sql) + '\n\\echo REVIEW_LOCK_HELD\n')
        first.stdin.flush()
        deadline = time.monotonic() + 20
        barrier_output = []
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0 or not select.select([first.stdout], [], [], remaining)[0]:
                raise AssertionError('First review transaction did not reach its barrier')
            line = first.stdout.readline().strip()
            barrier_output.append(line)
            if line == 'REVIEW_LOCK_HELD':
                break
            if first.poll() is not None:
                raise AssertionError('\n'.join(barrier_output))
        second = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        second.stdin.write("set application_name='offroad_closure_contender';begin;" + authorized(second_sql, second_actor) + 'commit;\n')
        second.stdin.close()
        second.stdin = None
        deadline = time.monotonic() + 20
        while run("select count(*) from pg_stat_activity where application_name='offroad_closure_contender' and wait_event_type='Lock';") != '1':
            if time.monotonic() >= deadline or second.poll() is not None:
                raise AssertionError('Second transaction did not visibly wait for recovery authority')
            time.sleep(.05)
        first.stdin.write('commit;\n')
        first.stdin.close()
        first.stdin = None
        a = first.communicate(timeout=20)[0]
        b = second.communicate(timeout=20)[0]
        assert first.returncode == 0, a
        if expected_error:
            assert second.returncode != 0 and expected_error in b, b
        else:
            assert second.returncode == 0, b
        return b
    finally:
        for process in (first, second):
            if process is not None and process.poll() is None:
                process.kill()
                process.wait(timeout=10)


# Dedicated synthetic namespace; only the disposable CI database is accepted above.
fixture = expand(ROOT / 'supabase/tests/support/execution_adopted_result_setup.sql')
setup = fixture + "select public.adopt_observation_for_work_v1(current_setting('test.adoption.payload')::jsonb);"
setup += "select pg_temp.commit_adopted('a4171000-0000-4000-9000-000000000002');"
for before, after in [('a11b0000','a5209000'),('a4171000','a5209100'),('a9990000','a5209200'),('a3300000','a5209300')]:
    setup = setup.replace(before,after)
setup = setup.replace('a11b-', 'a5209-').replace('synthetic-execution', 'synthetic-closure-execution')
setup = setup.replace('synthetic-policy-worker-fixture-token-v1', 'synthetic-closure-worker-token-v1')
run('begin;' + setup + 'commit;')
execution = 'a5209100-0000-4000-9000-000000000002'
source = 'a5209000-0000-4000-9000-000000000004'
revision = run(f"select extensions.uuid_generate_v5(extensions.uuid_ns_url(),'offroad:artifact-revision:execution_result:{execution}');")
fingerprint = run(f"select manifest_fingerprint from public.artifact_revisions where id='{revision}';")

def rights(operations):
    return f"select private.set_source_rights_v1('{source}',(select max(revision) from private.source_rights_versions where source_version_id='{source}'),array[{operations}],array['analysis','retrieval'],null,null,gen_random_uuid(),repeat('c',64));"

revoke = rights("'process','store','derive','export'")
restore = rights("'read','process','store','derive','export'")
def read(denied):
    expected = "'source_rights'" if denied else 'null'
    return f"do $$begin if (private.read_artifact_revision_v1('{revision}')#>>'{{restriction,kind}}') is distinct from {expected} then raise exception 'closure_read_unexpected';end if;end $$;"

review = f"select public.review_artifact_revision_v1('{revision}','{fingerprint}','comment',null,'Synthetic concurrent note',false,gen_random_uuid(),null);"
compete(revoke,read(True))
print('execution_closure_revoke_before_read: PASS (observed policy wait, source denied)')
run('begin;'+authorized(restore)+'commit;')
compete(read(False),revoke)
assert run('begin;'+authorized(f"select private.read_artifact_revision_v1('{revision}')#>>'{{restriction,kind}}';")+'rollback;').endswith('source_rights')
print('execution_closure_read_before_revoke: PASS (read completes before revocation, next read denied)')
run('begin;'+authorized(restore)+'commit;')
compete(revoke,review,'review_source_access_required')
print('execution_closure_revoke_before_review: PASS (observed policy wait, review denied)')
run('begin;'+authorized(restore)+'commit;')
compete(review,revoke)
assert run('begin;'+authorized(f"select private.read_artifact_revision_reviews_v1('{revision}')->>'withheld';")+'rollback;').endswith('true')
print('execution_closure_review_before_revoke: PASS (prior review retained, notes withheld)')
