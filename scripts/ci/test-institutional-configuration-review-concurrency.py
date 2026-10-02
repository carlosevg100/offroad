#!/usr/bin/env python3
"""Real two-session native configuration review races, only on the disposable CI database."""
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
    raise SystemExit('Institutional concurrency requires the disposable local CI database')
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
        second.stdin.write("set application_name='offroad_configuration_review_contender';begin;" + auth(c, second_sql) + 'commit;\n')
        second.stdin.close()
        second.stdin = None
        if immediate:
            b = second.communicate(timeout=5)[0]
        else:
            deadline = time.monotonic() + 20
            while run("select count(*) from pg_stat_activity where application_name='offroad_configuration_review_contender' and wait_event_type='Lock';") != '1':
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
    # Separate from native projection (81..92) and setup/contribution closures.
    n += 120
    fixture = expand(ROOT / 'supabase/tests/support/institutional_setup_pending.sql')
    for suffix in ['881', '882', '883']:
        fixture = fixture.replace(f'-000000000{suffix}', f'-000000{n:03}{suffix}')
    fixture = fixture.replace('setup-owner@', f'review-{n}-owner@').replace('setup-worker@', f'review-{n}-worker@')
    c = {'actor': f'10000000-0000-4000-8000-000000{n:03}881',
         'org': f'20000000-0000-4000-8000-000000{n:03}881',
         'source': f'50000000-0000-4000-8000-000000{n:03}882',
         'work': f'30000000-0000-4000-8000-000000{n:03}881',
         'command': f'94000000-0000-4000-8000-000000{n:03}881'}
    producer = """
      set local role authenticated;
      select set_config('test.capture',public.worker_load_institutional_model_context_v3(current_setting('test.setup_job')::uuid,repeat('w',64))::text,true);
      select set_config('test.candidate',public.worker_record_initial_institutional_candidate_v2(current_setting('test.setup_job')::uuid,repeat('w',64),
       (current_setting('test.capture')::jsonb#>>'{pendingSetup,submissionId}')::uuid,current_setting('test.setup_candidate')::jsonb,current_setting('test.capture')::jsonb->'setupInputSnapshot')->>'candidateId',true);
      reset role;
    """
    policy = f"insert into public.organization_review_policies(organization_id,assignment_required,self_approval_allowed,updated_by) values('{c['org']}',false,true,'{c['actor']}');update public.agent_messages set status='completed' where organization_id='{c['org']}' and status in ('queued','processing');"
    cleanup = """do $$declare t record;begin
     for t in select tgname,tgrelid::regclass as rel from pg_trigger join pg_proc on pg_proc.oid=tgfoid
       where pronamespace=pg_my_temp_schema() and not tgisinternal loop
      execute format('drop trigger %I on %s',t.tgname,t.rel);
     end loop;end $$;"""
    data = run('\\o /dev/null\nbegin;\n' + fixture + producer + policy + cleanup + "\n\\o\nselect jsonb_build_object('candidate',current_setting('test.candidate'),'basis',public.read_institutional_configuration_review_basis_v2('"+c['work']+"',current_setting('test.candidate')::uuid));commit;")
    c.update(json.loads(data))
    assert c['basis']['sourceCount'] == 2, c
    return c


def write(c):
    b = c['basis']
    parent = 'null' if b['parentFingerprint'] is None else literal(b['parentFingerprint'])
    return f"set local role authenticated;select public.review_institutional_configuration_and_calculate_v2('{c['work']}','{c['candidate']}',{parent},'approved','{b['configurationFingerprint']}','{b['lineageFingerprint']}','{c['command']}','en-US',true);"


def revoke(c):
    return f"set local role authenticated;select public.set_source_rights_v1('{c['source']}',1,array['store'],array['analysis'],null,null,gen_random_uuid(),repeat('d',64));"


def count(c):
    return run(f"select count(*) from private.institutional_configuration_review_projections where command_id='{c['command']}';")


c = case(1)
compete(c, revoke(c), write(c), 'institutional_review_source_denied')
assert count(c) == '0'
print('configuration_review_uncited_revocation_first: PASS (wait, zero act)')

c = case(2)
compete(c, write(c), revoke(c))
denied(c, write(c), 'institutional_review_source_denied')
assert count(c) == '1'
print('configuration_review_before_uncited_revocation: PASS (revoke waits, replay denied)')

c = case(3)
compete(c, write(c), write(c))
assert count(c) == '1'
assert run(f"select count(*) from private.institutional_model_results where id='{c['command']}';") == '1'
assert run(f"select count(*) from public.processing_jobs where payload->>'message_id'='{c['command']}';") == '1'
print('configuration_review_concurrent_replay: PASS (one act/calculation/job)')

c = case(4)
suspend = f"update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id='{c['actor']}';"
compete(c, suspend, write(c), 'institutional_result_forbidden')
assert count(c) == '0'
print('configuration_review_suspension_first: PASS (account wait, zero act)')

c = case(5)
suspend = f"update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id='{c['actor']}';"
compete(c, write(c), suspend)
denied(c, write(c), 'institutional_result_forbidden')
assert count(c) == '1'
print('configuration_review_before_suspension: PASS (suspension waits, replay denied)')
