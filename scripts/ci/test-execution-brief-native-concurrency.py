#!/usr/bin/env python3
"""Real two-session native execution brief review races, only on the disposable CI database."""
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
    raise SystemExit('Execution brief concurrency requires the disposable local CI database')
command = ['psql', url, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1']


def run(sql):
    p = subprocess.run(command, input=sql, text=True, capture_output=True, timeout=60)
    if p.returncode:
        raise AssertionError(p.stderr)
    return p.stdout.strip()


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def expand(path):
    return re.sub(r'^\\ir (.+)$', lambda m: expand(path.parent / m[1].strip()), path.read_text(), flags=re.M)


def auth(c, sql):
    return f"select set_config('request.jwt.claims', {literal(json.dumps({'sub':c['actor'],'role':'authenticated'}))},true);" + sql


def compete(c, first_sql, second_sql, expected_error=None, immediate=False):
    first = second = None
    try:
        first = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        first.stdin.write('\\o /dev/null\nbegin;' + auth(c, first_sql) + '\n\\echo CAPTURE_LOCK_HELD\n')
        first.stdin.flush()
        deadline = time.monotonic() + 20
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0 or not select.select([first.stdout], [], [], remaining)[0]:
                raise AssertionError('First transaction did not reach capture barrier')
            line = first.stdout.readline().strip()
            if line == 'CAPTURE_LOCK_HELD':
                break
            if first.poll() is not None:
                raise AssertionError(line)
        second = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        second.stdin.write("set application_name='offroad_brief_review_contender';begin;" + auth(c, second_sql) + 'commit;\n')
        second.stdin.close()
        second.stdin = None
        if immediate:
            b = second.communicate(timeout=5)[0]
        else:
            deadline = time.monotonic() + 20
            while run("select count(*) from pg_stat_activity where application_name='offroad_brief_review_contender' and wait_event_type='Lock';") != '1':
                if time.monotonic() >= deadline or second.poll() is not None:
                    raise AssertionError('Second transaction did not visibly wait for authority')
                time.sleep(.05)
        first.stdin.write('commit;\n')
        first.stdin.close()
        first.stdin = None
        a = first.communicate(timeout=20)[0]
        if not immediate:
            b = second.communicate(timeout=20)[0]
        assert first.returncode == 0, a
        if expected_error:
            assert second.returncode != 0 and expected_error in b, b
        else:
            assert second.returncode == 0, b
    finally:
        for p in (first, second):
            if p is not None and p.poll() is None:
                p.kill()
                p.wait(timeout=10)


def denied(c, sql, expected):
    p = subprocess.run(command, input='begin;' + auth(c, sql) + 'rollback;', text=True, capture_output=True, timeout=20)
    assert p.returncode != 0 and expected in p.stderr, p.stderr


def case(n):
    fixture = expand(ROOT / 'supabase/tests/execution_brief_native_capture.sql')
    marker = '  -- NATIVE_BRIEF_HUMAN_REVIEW_TESTS_BEGIN'
    assert fixture.count(marker) == 1, 'Native producer boundary marker drift'
    fixture = fixture[:fixture.index(marker)]
    n += 210
    for suffix in range(1, 13):
        fixture = fixture.replace(f'-000000000{suffix:03}', f'-000000{n:03}{suffix:03}')
    fixture = fixture.replace("repeat('b',64)", literal(f'{n:064x}'))
    fixture = fixture.replace('synthetic-policy-worker-fixture-token-v1',f'synthetic-brief-policy-worker-{n}')
    fixture = fixture.replace('bridge-owner@', f'brief-{n}-owner@')
    c = {'actor': f'a8000000-0000-4000-8000-000000{n:03}001',
         'org': f'a8000000-0000-4000-8000-000000{n:03}002',
         'work': f'a8000000-0000-4000-8000-000000{n:03}007',
         'source': f'a8000000-0000-4000-8000-000000{n:03}012',
         'job': f'a8000000-0000-4000-8000-000000{n:03}006',
         'command': f'94000000-0000-4000-8000-000000{n:03}001'}
    finish = """
      perform set_config('test.native_pending',jsonb_build_object('brief',brief.id,'capture',capture->>'captureId','fingerprint',brief.brief_fingerprint)::text,true);
      end $$;
      reset role;
      do $$declare t record;begin
       for t in select tgname,tgrelid::regclass as rel from pg_trigger join pg_proc on pg_proc.oid=tgfoid where pronamespace=pg_my_temp_schema() and not tgisinternal loop
        execute format('drop trigger %I on %s',t.tgname,t.rel);
       end loop;
      end $$;
    """
    data = run('\\o /dev/null\n' + fixture + finish + "\n\\o\nselect current_setting('test.native_pending');commit;")
    c.update(json.loads(data))
    return c


def write(c):
    return f"set local role authenticated;select public.approve_advisor_execution_brief_v2('{c['work']}','{c['brief']}','{c['fingerprint']}','{c['capture']}','{c['command']}',true);"


def revoke(c):
    return f"set local role authenticated;select public.set_source_rights_v1('{c['source']}',1,array['read'],array['analysis'],null,null,gen_random_uuid(),repeat('d',64));"


def count(c):
    return run(f"select count(*) from private.execution_brief_review_projections where command_id='{c['command']}';")


c = case(1)
compete(c, revoke(c), write(c), 'execution_brief_native_basis_changed')
assert count(c) == '0'
print('brief_review_uncited_revocation_first: PASS (wait, zero act)')

c = case(2)
compete(c, write(c), revoke(c))
denied(c, write(c), 'execution_brief_native_basis_changed')
assert count(c) == '1'
print('brief_review_before_uncited_revocation: PASS (revocation waits, replay denied)')

c = case(3)
compete(c, write(c), write(c))
assert count(c) == '1'
assert run(f"select count(*) from public.work_decisions where command_id='{c['command']}';") == '1'
assert run(f"select count(*) from public.capital_project_execution_brief_dispatches where processing_job_id='{c['job']}' and approval_command_id='{c['command']}' and accepted_at is not null;") == '1'
print('brief_review_concurrent_replay: PASS (one act, one exact dispatch)')

# Fixture jobs never escape into later CI worker-claim proofs. Preserve their
# rows for diagnosis while cancelling only the three synthetic race tenants.
run("update public.processing_jobs set status='cancelled',capability_sha256=null,lease_expires_at=null,leased_by=null where organization_id in ('a8000000-0000-4000-8000-000000211002','a8000000-0000-4000-8000-000000212002','a8000000-0000-4000-8000-000000213002') and status in ('queued','leased');")
