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
    n += 60
    fixture = expand(ROOT / 'supabase/tests/support/institutional_closure_setup.sql')
    for suffix in ['881', '882', '883']:
        fixture = fixture.replace(f'-000000000{suffix}', f'-000000{n:03}{suffix}')
    fixture = fixture.replace('setup-owner@', f'closure-{n}-owner@').replace('setup-worker@', f'closure-{n}-worker@')
    builder = expand(ROOT / 'supabase/tests/support/institutional_contribution_builder.sql') + expand(ROOT / 'supabase/tests/support/institutional_closure_clone.sql')
    for suffix in ['881', '882', '883']:
        builder = builder.replace(f'-000000000{suffix}', f'-000000{n:03}{suffix}')
    capture = """set local role authenticated;
    select set_config('test.closure_capture',public.worker_load_institutional_model_context_v2(current_setting('test.result_job')::uuid,repeat('x',64))::text,true);
    select public.worker_record_institutional_model_result_v2(current_setting('test.result_job')::uuid,repeat('x',64),jsonb_build_object('status','completed','artifact',current_setting('test.result_artifact')::jsonb,'inputSnapshot',current_setting('test.closure_capture')::jsonb->'inputSnapshot'));
    reset role;""" + builder + """select set_config('test.concurrency_child',pg_temp.add_ancestry_contribution(current_setting('test.setup_candidate_id')::uuid,'25')::text,true);
    do $$declare ctx jsonb:=current_setting('test.closure_capture')::jsonb-'inputSnapshot';c private.institutional_model_configurations;begin
     select * into c from private.institutional_model_configurations where id=current_setting('test.concurrency_child')::uuid;
     ctx:=jsonb_set(ctx,'{approvedConfigurations}',ctx->'approvedConfigurations'||jsonb_build_array(jsonb_build_object('id',c.id,'configuration',c.configuration,'fingerprint',c.configuration_fingerprint,'revision',c.revision)));
     perform set_config('test.closure_race_job',pg_temp.clone_closure(ctx)::text,true);
    end $$;"""
    cleanup = """do $$declare t record;begin
     for t in select tgname,tgrelid::regclass as rel from pg_trigger join pg_proc on pg_proc.oid=tgfoid
       where pronamespace=pg_my_temp_schema() and not tgisinternal loop
      execute format('drop trigger %I on %s',t.tgname,t.rel);
     end loop;end $$;"""
    data = run('\\o /dev/null\nbegin;\n' + fixture + capture + cleanup + "\n\\o\nselect jsonb_build_object('job',current_setting('test.closure_race_job'),'message',(select answer_message_id from private.institutional_model_configurations where id=current_setting('test.concurrency_child')::uuid));commit;")
    return {'actor':f'10000000-0000-4000-8000-000000{n:03}881','source':f'50000000-0000-4000-8000-000000{n:03}882', **json.loads(data)}


def check(c, expected='closed'):
    return f"do $$declare r jsonb;begin r:=private.institutional_result_source_closure_v1('{c['job']}',repeat('x',64));if r->>'state' is distinct from '{expected}' then raise exception 'unexpected closure: %',r;end if;end $$;"


def revoke(c):
    return f"select public.set_source_rights_v1('{c['source']}',1,array['read','process','store'],array['analysis'],null,null,'{c['source']}',repeat('b',64));"

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
compete(c, revoke(c), check(c, 'denied'))
print('closure_revocation_first: PASS (wait, current derive denied)')
c = case(2)
compete(c, check(c), revoke(c))
run('begin;' + auth(c, check(c, 'denied')) + 'rollback;')
print('closure_before_revocation: PASS (revocation waits, recheck denied)')
c = case(3)
compete(c, check(c), check(c), 'institutional_capture_retry', immediate=True)
print('closure_job_contention: PASS (NOWAIT, no partial proof)')

c = case(4)
compete(c, f"update public.agent_messages set content='Synthetic concurrent edit' where id='{c['message']}';", check(c), 'institutional_capture_retry', immediate=True)
run('begin;' + auth(c, check(c, 'unresolved')) + 'rollback;')
print('closure_message_edit_first: PASS (NOWAIT, no stale proof)')
c = case(5)
compete(c, check(c), f"update public.agent_messages set content='Synthetic concurrent edit' where id='{c['message']}';")
run('begin;' + auth(c, check(c, 'unresolved')) + 'rollback;')
print('closure_before_message_edit: PASS (editor waits for closure transaction)')
