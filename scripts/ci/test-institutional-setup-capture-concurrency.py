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
    n += 20
    fixture = expand(ROOT / 'supabase/tests/support/institutional_setup_pending.sql')
    for suffix in ['881', '882', '883']:
        fixture = fixture.replace(f'-000000000{suffix}', f'-000000{n:03}{suffix}')
    fixture = fixture.replace('setup-owner@', f'capture-{n}-owner@').replace('setup-worker@', f'capture-{n}-worker@')
    c = {'actor': f'10000000-0000-4000-8000-000000{n:03}881',
         'source': f'50000000-0000-4000-8000-000000{n:03}881',
         'work': f'30000000-0000-4000-8000-000000{n:03}881',
         'result': f'90000000-0000-4000-8000-000000{n:03}881'}
    capture = "select set_config('test.capture',public.worker_load_institutional_model_context_v3(current_setting('test.setup_job')::uuid,repeat('w',64))::text,true);" if captured else "select set_config('test.capture','{}',true);"
    # Fixture-only global triggers reference this session's pg_temp helpers. Remove them
    # after provisioning so the next isolated namespace can use its own helpers.
    cleanup = """do $$declare t record;begin
     for t in select tgname,tgrelid::regclass as rel from pg_trigger join pg_proc on pg_proc.oid=tgfoid
       where pronamespace=pg_my_temp_schema() and not tgisinternal loop
      execute format('drop trigger %I on %s',t.tgname,t.rel);
     end loop;
    end $$;"""
    data = run('\\o /dev/null\nbegin;\n' + fixture + capture + cleanup + "\n\\o\nselect jsonb_build_object('job',current_setting('test.setup_job'),'artifact',current_setting('test.setup_candidate')::jsonb,'pin',current_setting('test.capture')::jsonb->'setupInputSnapshot');commit;")
    c.update(json.loads(data))
    return c


def load(c):
    return f"set local role authenticated;select public.worker_load_institutional_model_context_v3('{c['job']}',repeat('w',64));"


def write(c, legacy=False):
    pin = '' if legacy else ',' + literal(json.dumps(c['pin'])) + '::jsonb'
    return f"set local role authenticated;select public.worker_record_initial_institutional_candidate_v{1 if legacy else 2}('{c['job']}',repeat('w',64),'{c['result']}',{literal(json.dumps(c['artifact']))}::jsonb{pin});"


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


c = case(1, captured=False)
compete(c, load(c), load(c), 'institutional_capture_retry', immediate=True)
pin = run(f"select jsonb_build_object('id',id,'fingerprint',context_fingerprint) from private.institutional_setup_input_snapshots where job_id='{c['job']}';")
assert json.loads(run('begin;' + auth(c, load(c).replace('select public.', 'select (public.').replace("repeat('w',64));", "repeat('w',64)))->'setupInputSnapshot';")) + 'rollback;').splitlines()[-1]) == json.loads(pin)
assert run(f"select count(*) from private.institutional_setup_input_snapshots where job_id='{c['job']}';") == '1'
print('setup_capture_concurrent_retry: PASS (NOWAIT abort, original pin after retry, one snapshot)')

c = case(2)
compete(c, revoke(c), write(c), 'institutional_setup_capture_rights_revoked')
assert run(f"select status from private.institutional_model_setup_submissions where id='{c['result']}';") == 'queued'
print('setup_capture_revocation_first: PASS (observed policy wait, denied before result)')

c = case(3)
c['source'] = c['source'][:-3] + '882'  # consumed but never cited by the workbook
compete(c, write(c), revoke(c))
denied(c, load(c), 'institutional_setup_capture_rights_revoked')
denied(c, write(c), 'institutional_setup_capture_rights_revoked')
print('setup_capture_publication_first: PASS (revocation waits, both input and result replay denied afterwards)')

c = case(4)
compete(c, f"update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id='{c['actor']}';", write(c), 'institutional_capture_denied')
print('setup_capture_suspension_first: PASS (observed account wait, denied)')

c = case(5)
compete(c, write(c), f"update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id='{c['actor']}';")
print('setup_capture_publication_before_suspension: PASS (account suspension waits for publication)')

c = case(6)
compete(c, f"select 1 from public.capital_projects where id='{c['work']}' for update;", write(c), 'institutional_capture_retry', immediate=True)
assert run(f"select status from private.institutional_model_setup_submissions where id='{c['result']}';") == 'queued'
print('setup_capture_project_contention: PASS (NOWAIT abort, no result committed)')

c = case(7)
compete(c, write(c), write(c), 'institutional_capture_retry', immediate=True)
run('begin;' + auth(c, write(c)) + 'commit;')
assert run(f"select count(*) from private.institutional_setup_input_bindings where submission_id='{c['result']}';") == '1'
print('setup_capture_concurrent_result_retry: PASS (NOWAIT then exact replay, one binding)')

c = case(8, captured=False)
compete(c, load(c), write(c, legacy=True), 'institutional_setup_snapshot_requires_v2')
print('setup_capture_legacy_downgrade: PASS (v1 waits for job, then denies captured result)')
