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


def case(n, captured=True):
    n += 80
    fixture = expand(ROOT / 'supabase/tests/support/institutional_closure_setup.sql')
    for suffix in ['881', '882', '883']:
        fixture = fixture.replace(f'-000000000{suffix}', f'-000000{n:03}{suffix}')
    fixture = fixture.replace('setup-owner@', f'capture-{n}-owner@').replace('setup-worker@', f'capture-{n}-worker@')
    c = {'actor': f'10000000-0000-4000-8000-000000{n:03}881',
         'source': f'50000000-0000-4000-8000-000000{n:03}881',
         'work': f'30000000-0000-4000-8000-000000{n:03}881',
         'result': f'90000000-0000-4000-8000-000000{n:03}883'}
    capture = "select set_config('test.capture',public.worker_load_institutional_model_context_v2(current_setting('test.result_job')::uuid,repeat('x',64))::text,true);" if captured else "select set_config('test.capture','{}',true);"
    # Fixture-only global triggers reference this session's pg_temp helpers. Remove them
    # after provisioning so the next isolated namespace can use its own helpers.
    cleanup = """do $$declare t record;begin
     for t in select tgname,tgrelid::regclass as rel from pg_trigger join pg_proc on pg_proc.oid=tgfoid
       where pronamespace=pg_my_temp_schema() and not tgisinternal loop
      execute format('drop trigger %I on %s',t.tgname,t.rel);
     end loop;
    end $$;"""
    data = run('\\o /dev/null\nbegin;\n' + fixture + capture + cleanup + "\n\\o\nselect jsonb_build_object('job',current_setting('test.result_job'),'artifact',current_setting('test.result_artifact')::jsonb,'pin',current_setting('test.capture')::jsonb->'inputSnapshot');commit;")
    c.update(json.loads(data))
    return c


def load(c):
    return f"set local role authenticated;select public.worker_load_institutional_model_context_v2('{c['job']}',repeat('x',64));"


def write(c):
    value = {'status': 'completed', 'artifact': c['artifact']}
    value['inputSnapshot'] = c['pin']
    return f"set local role authenticated;select public.worker_record_institutional_model_result_v3('{c['job']}',repeat('x',64),{literal(json.dumps(value))}::jsonb);"


def revoke(c):
    return f"set local role authenticated;select public.set_source_rights_v1('{c['source']}',1,array['read','process','store'],array['analysis'],null,null,'{c['source']}',repeat('b',64));"


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


def assert_unwritten(c):
    assert run(f"select status from private.institutional_model_results where id='{c['result']}';") == 'queued'
    assert run(f"select count(*) from private.institutional_native_bindings where result_id='{c['result']}';") == '0'

c = case(1)
compete(c, revoke(c), write(c), 'institutional_capture_rights_revoked')
assert_unwritten(c)
print('native_revocation_first: PASS (authority wait, no result or native revision)')
c = case(2)
compete(c, write(c), revoke(c))
assert run(f"select count(*) from private.institutional_native_bindings where result_id='{c['result']}';") == '1'
assert run('begin;'+auth(c,f"select private.institutional_native_read_allowed_v1(b.organization_id,b.revision_id,'{c['actor']}') from private.institutional_native_bindings b where result_id='{c['result']}';")+'rollback;').splitlines()[-1] == 't'
# Removing derive forbids a new projection/replay, while existing stored content remains readable.
denied(c, write(c), 'institutional_capture_rights_revoked')
print('native_publication_first: PASS (revocation waits, publication replay denied)')
c = case(3)
compete(c, write(c), write(c), 'institutional_capture_retry', immediate=True)
run('begin;'+auth(c,write(c))+'commit;')
assert run(f"select count(*) from private.institutional_native_bindings where result_id='{c['result']}';") == '1'
print('native_concurrent_retry: PASS (NOWAIT, exact replay, one binding)')
c = case(4)
compete(c, f"update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id='{c['actor']}';", write(c), 'institutional_capture_denied')
assert_unwritten(c)
print('native_suspension_first: PASS (account wait, no partial publication)')
c = case(5)
compete(c, f"select 1 from public.capital_projects where id='{c['work']}' for update;", write(c), 'institutional_capture_retry', immediate=True)
assert_unwritten(c)
print('native_project_contention: PASS (NOWAIT, no partial publication)')

def read_native(c, allowed):
    expected = 'true' if allowed else 'false'
    return f"do $$declare b private.institutional_native_bindings;begin select * into strict b from private.institutional_native_bindings where result_id='{c['result']}';if private.institutional_native_read_allowed_v1(b.organization_id,b.revision_id,'{c['actor']}') is distinct from {expected} then raise exception 'native_read_authority_mismatch';end if;end $$;"

def deny_read(c):
    return f"select public.set_source_rights_v1('{c['source']}',1,array['store'],array['analysis'],null,null,'{c['source']}',repeat('d',64));"

c = case(6)
run('begin;'+auth(c,write(c))+'commit;')
compete(c, deny_read(c), read_native(c, False))
print('native_read_revocation_first: PASS (wait, fresh rights deny)')
c = case(7)
run('begin;'+auth(c,write(c))+'commit;')
compete(c, read_native(c, True), deny_read(c))
run('begin;'+auth(c,read_native(c, False))+'rollback;')
print('native_read_before_revocation: PASS (revocation waits, next read denied)')
c = case(8)
run('begin;'+auth(c,write(c))+'commit;')
compete(c, f"update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id='{c['actor']}';", read_native(c, False), immediate=True)
print('native_read_account_contention: PASS (NOWAIT, read denied)')

def derivative_case(n):
    c=case(n)
    run('begin;'+auth(c,write(c))+'commit;')
    c['source']=c['source'][:-3]+'884'
    fixture=expand(ROOT/'supabase/tests/support/institutional_native_derivative.sql')
    c['derived']=run('begin;'+fixture+'\n'+auth(c,f"select pg_temp.native_derivative('{c['result']}','{c['source']}','{c['actor']}');")+'commit;').splitlines()[-1]
    return c

def read_derived(c, allowed, review=False):
    if review:
        check=f"private.artifact_review_sources_allowed_v1((select organization_id from public.artifact_revisions where id='{c['derived']}'),'{c['derived']}','{c['actor']}')"
    else:
        check=f"(private.read_artifact_revision_v1('{c['derived']}')->'restriction'='null'::jsonb)"
    return f"do $$begin if {check} is distinct from {'true' if allowed else 'false'} then raise exception 'native_derived_read_mismatch';end if;end $$;"

for n, review in [(9,False),(11,True)]:
    c=derivative_case(n)
    compete(c,deny_read(c),read_derived(c,False,review))
    print(f'native_derived_{"review" if review else "read"}_revocation_first: PASS (exclusive source, wait then deny)')
    c=derivative_case(n+1)
    compete(c,read_derived(c,True,review),deny_read(c))
    run('begin;'+auth(c,read_derived(c,False,review))+'rollback;')
    print(f'native_derived_{"review" if review else "read"}_before_revocation: PASS (exclusive source, writer waits)')
