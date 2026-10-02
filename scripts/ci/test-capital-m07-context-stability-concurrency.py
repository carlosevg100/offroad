#!/usr/bin/env python3
"""Real output-producer/capture race. Requires a disposable local database.

The SQL fixture supplies actual claim/recipe/context retention commands; Storage
rows are metadata fixtures. The separate native SDK eval proves physical HTTP.
The committed fixture belongs to this disposable database, reset by its caller.
"""
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
    raise SystemExit('M07 stability concurrency requires the disposable local CI database')
command = [os.environ.get('PSQL', 'psql'), url, '-X', '-Atq', '-v', 'ON_ERROR_STOP=1']


def run(sql):
    p = subprocess.run(command, input=sql, text=True, capture_output=True, timeout=60)
    if p.returncode:
        # Do not expose job capabilities from a failed statement.
        raise AssertionError('M07 stability SQL failed: ' + p.stderr.split('CONTEXT:')[0])
    return p.stdout.splitlines()


def expand(path):
    return re.sub(r'^\\ir (.+)$', lambda m: expand(path.parent / m[1].strip()), path.read_text(), flags=re.M)


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def auth(sql):
    return "set role authenticated;select set_config('request.jwt.claims','{\"sub\":\"10000000-0000-4000-8000-000000000201\",\"role\":\"authenticated\"}',false);select set_config('request.headers','{\"x-offroad-workspace\":\"20000000-0000-4000-8000-000000000201\"}',false);" + sql


setup = expand(ROOT / 'supabase/tests/support/capital_m07_context_stability_setup.sql')
rows = run('begin;' + setup + "select row_to_json(f) from pg_temp.m07_recipe_fixture f;commit;")
f = next(json.loads(line) for line in reversed(rows) if line.startswith('{"job_id":'))
load = 'select public.worker_load_capital_project_capture_context_v1(' + literal(f['job_id']) + ',' + literal(f['capability']) + ');'
capsule = json.loads(run(auth(load))[-1])
assert capsule['context'] is None
ctx = json.loads(f['base']['canonicalContext'])
test = (ROOT / 'supabase/tests/capital_m07_capture_context_stability.sql').read_text()
producer = test[test.index('do $$declare f record;capsule'):test.index('reset role;')]
# The SQL producer computes the exact stable-JSON executor fingerprint.
fixture = "create temp table m07_recipe_fixture as select * from jsonb_to_record(" + literal(json.dumps(f)) + "::jsonb) as f(job_id uuid,capability text,base jsonb,allocation jsonb,retention jsonb,object_id uuid);grant all on m07_recipe_fixture to authenticated;"
first = None
try:
    first = subprocess.Popen(command,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
    first.stdin.write('\\o /dev/null\nbegin;' + fixture + auth(producer) + '\n\\echo M07_REAL_PRODUCER_READY\n')
    first.stdin.flush()
    deadline = time.monotonic()+20
    while True:
        remaining=deadline-time.monotonic()
        if remaining<=0 or not select.select([first.stdout],[],[],remaining)[0]:
            raise AssertionError('Real M01 producer did not reach barrier')
        line=first.stdout.readline().strip()
        if line=='M07_REAL_PRODUCER_READY':
            break
        if first.poll() is not None:
            raise AssertionError('Real M01 producer failed before barrier')
    probe="create temp table probe(state text,msg text);do $$declare s text;m text;begin begin perform public.worker_load_capital_project_capture_context_v1("+literal(f['job_id'])+','+literal(f['capability'])+");insert into probe values('00000','accepted');exception when others then get stacked diagnostics s=returned_sqlstate,m=message_text;insert into probe values(s,m);end;end $$;select jsonb_build_object('state',state,'message',msg) from probe;"
    contention=json.loads(run(auth(probe))[-1])
    assert contention=={'state':'40001','message':'capital_capture_retry'}, contention
    first.stdin.write('commit;\n');first.stdin.close();first.stdin=None
    _,errors=first.communicate(timeout=20)
    assert first.returncode==0,'Real M01 producer commit failed'
    again=json.loads(run(auth(load))[-1])
    assert again==capsule,'Outputs changed the retained input capsule'
    changed=json.loads(run(auth('select public.worker_load_capital_project_context_v6('+literal(f['job_id'])+','+literal(f['capability'])+');'))[-1])
    assert changed['completed_artifacts']!=ctx['completed_artifacts']
    print('PASS actual retained context committed before capsule')
    print('PASS actual M01 start/record/finish changes completed_artifacts')
    print('PASS concurrent producer/capture: 40001 capital_capture_retry only')
    print('PASS same capability after real producer commit: immutable capsule accepted')
finally:
    if first is not None and first.poll() is None:
        first.kill();first.wait(timeout=10)
