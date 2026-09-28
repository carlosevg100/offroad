#!/usr/bin/env python3
"""Real two-session institutional capture races, only on the disposable CI database."""
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


def case(n):
    n += 40
    fixture = expand(ROOT / 'supabase/tests/support/institutional_contribution_pending.sql')
    for suffix in ['871', '872', '873']:
        fixture = fixture.replace(f'-000000000{suffix}', f'-000000{n:03}{suffix}')
    fixture = fixture.replace('binding-owner@', f'contribution-{n}-owner@').replace('binding-worker@', f'contribution-{n}-worker@')
    # IDs in the frozen application change, so regenerate its configuration hash.
    fixture += "select set_config('test.institutional_application',jsonb_set(current_setting('test.institutional_application')::jsonb,'{nextConfigurationFingerprint}',to_jsonb(private.institutional_config_hash(current_setting('test.institutional_application')::jsonb->'nextConfiguration')))::text,true);"
    cleanup = """do $$declare t record;begin
     for t in select tgname,tgrelid::regclass as rel from pg_trigger join pg_proc on pg_proc.oid=tgfoid
       where pronamespace=pg_my_temp_schema() and not tgisinternal loop
      execute format('drop trigger %I on %s',t.tgname,t.rel);
     end loop;
    end $$;"""
    data = run('\\o /dev/null\nbegin;\n' + fixture + cleanup + "\n\\o\nselect jsonb_build_object('application',current_setting('test.institutional_application')::jsonb);commit;")
    c = {'actor': f'10000000-0000-4000-8000-000000{n:03}872',
         'subject': f'10000000-0000-4000-8000-000000{n:03}871',
         'work': f'30000000-0000-4000-8000-000000{n:03}871',
         'message': f'90000000-0000-4000-8000-000000{n:03}871',
         'job': f'80000000-0000-4000-8000-000000{n:03}873'}
    c.update(json.loads(data))
    return c


def write(c):
    return f"set local role authenticated;select public.worker_apply_institutional_assumption_answer_v1('{c['job']}',repeat('v',64),{literal(json.dumps(c['application']))}::jsonb);"


def revoke(c):
    return f"select private.revoke_resource_access_v1('{c['work']}','{c['subject']}');"


def count(c):
    return run(f"select count(*) from private.institutional_contribution_receipts where job_id='{c['job']}';")


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
        second.stdin.write("set application_name='offroad_capture_contender';begin;" + auth(c, second_sql) + 'commit;\n')
        second.stdin.close()
        second.stdin = None
        if immediate:
            b = second.communicate(timeout=5)[0]
        else:
            deadline = time.monotonic() + 20
            while run("select count(*) from pg_stat_activity where application_name='offroad_capture_contender' and wait_event_type='Lock';") != '1':
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


c = case(1)
compete(c, write(c), write(c), 'institutional_capture_retry', immediate=True)
run('begin;' + auth(c, write(c)) + 'commit;')
assert count(c) == '1'
print('contribution_concurrent_retry: PASS (one immutable receipt)')

c = case(2)
compete(c, revoke(c), write(c), 'job_authorization_revoked')
assert count(c) == '0'
print('contribution_revocation_first: PASS (authority wait, no candidate receipt)')

c = case(3)
compete(c, write(c), revoke(c))
denied(c, write(c), 'job_authorization_revoked')
assert count(c) == '1'
print('contribution_write_before_revocation: PASS (revocation waits, replay denied)')

c = case(4)
compete(c, f"update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id='{c['subject']}';", write(c), 'institutional_capture_denied')
assert count(c) == '0'
print('contribution_suspension_first: PASS (account wait, denied)')

c = case(5)
compete(c, write(c), f"update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id='{c['subject']}';")
denied(c, write(c), 'institutional_capture_denied')
print('contribution_write_before_suspension: PASS (suspension waits, replay denied)')

c = case(6)
compete(c, f"select 1 from public.agent_messages where id='{c['message']}' for update;", write(c), 'institutional_capture_retry', immediate=True)
assert count(c) == '0'
print('contribution_message_contention: PASS (NOWAIT, no partial write)')

c = case(7)
compete(c, f"select 1 from private.institutional_information_request_bindings where information_request_id='{c['application']['answerEvidence']['requestId']}' for update;", write(c), 'institutional_capture_retry', immediate=True)
assert count(c) == '0'
print('contribution_binding_contention: PASS (NOWAIT, no partial write)')
