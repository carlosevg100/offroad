#!/usr/bin/env python3
"""Two actual sessions preserve competing candidates and compare the changed shared base.
Synthetic identities, only a disposable local CI database; never production.
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
    raise SystemExit('Contribution concurrency requires the disposable local CI database')
command = ['psql', url, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1']
org = 'a4130000-0000-4000-9000-000000000001'
work = 'a4130000-0000-4000-9000-000000000002'
a = 'a4130000-0000-4000-8000-000000000001'
b = 'a4130000-0000-4000-8000-000000000002'
def run(sql):
    result = subprocess.run(command, input=sql, text=True, capture_output=True, timeout=30)
    if result.returncode: raise AssertionError(result.stderr)
    return result.stdout.strip()
def expand(p):
    return '\n'.join(expand(p.parent / m.group(1)) if (m := re.match(r'\\ir\s+(.+)', line)) else line for line in p.read_text().splitlines())
def actor(user):
    return f"set local role authenticated; select set_config('request.jwt.claim.sub','{user}',true); select set_config('request.headers','{{\"x-offroad-workspace\":\"{org}\"}}',true);"
fixture = '\n'.join(expand(ROOT / 'supabase/tests/support' / name) for name in ['source_rights_fixture.sql','legacy_workspace_capabilities.sql','legacy_resource_fixture.sql']).replace('a11b0000','a4130000').replace('a11b-','a413-')
run('begin;\n'+fixture+'\n'+actor(a)+f"""
select public.add_work_participant_v1('{work}','{b}');
select public.submit_work_contribution_v1('{work}','a4130000-0000-4000-9000-000000000010','a4130000-0000-4000-9000-000000000011',null,null,'Synthetic common base');
select public.promote_contribution_to_work_v1('a4130000-0000-4000-9000-000000000011','a4130000-0000-4000-9000-000000000012');
select public.submit_work_contribution_v1('{work}','a4130000-0000-4000-9000-000000000020','a4130000-0000-4000-9000-000000000021',null,'a4130000-0000-4000-9000-000000000012','Synthetic competing A');
"""+actor(b)+f"""
select public.submit_work_contribution_v1('{work}','a4130000-0000-4000-9000-000000000030','a4130000-0000-4000-9000-000000000031',null,'a4130000-0000-4000-9000-000000000012','Synthetic competing B');commit;
""")
first = second = None
try:
    first = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    first.stdin.write("\\o /dev/null\nbegin;"+actor(a)+"select public.promote_contribution_to_work_v1('a4130000-0000-4000-9000-000000000021','a4130000-0000-4000-9000-000000000022','a4130000-0000-4000-9000-000000000012');\n\\echo CONTRIBUTION_LOCK_HELD\n")
    first.stdin.flush()
    deadline = time.monotonic()+20
    while True:
        remaining = deadline-time.monotonic()
        if remaining <= 0 or not select.select([first.stdout],[],[],remaining)[0]: raise AssertionError('First contributor did not acquire lock')
        if first.stdout.readline().strip() == 'CONTRIBUTION_LOCK_HELD': break
        if first.poll() is not None: raise AssertionError('First contributor terminated')
    second = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    second.stdin.write("set application_name='offroad_contribution_contender';begin;"+actor(b)+"select public.promote_contribution_to_work_v1('a4130000-0000-4000-9000-000000000031','a4130000-0000-4000-9000-000000000032','a4130000-0000-4000-9000-000000000012');commit;\n")
    second.stdin.close();second.stdin=None
    deadline=time.monotonic()+20
    while run("select count(*) from pg_stat_activity where application_name='offroad_contribution_contender' and wait_event_type='Lock';") != '1':
        if time.monotonic()>=deadline or second.poll() is not None: raise AssertionError('Competing contributor did not wait on the policy lock')
        time.sleep(.05)
    first.stdin.write('commit;\n');first.stdin.close();first.stdin=None
    first_output=first.communicate(timeout=20)[0];second_output=second.communicate(timeout=20)[0]
    assert first.returncode==0,first_output
    assert second.returncode==0,second_output
    result=json.loads(next(line for line in second_output.splitlines() if line.startswith('{') and '"status"' in line))
    assert result['status']=='conflict' and result['base']['content']=='Synthetic common base' and result['current']['content']=='Synthetic competing A' and result['candidate']['content']=='Synthetic competing B',result
    assert run("select count(*) from public.contribution_revisions where id in ('a4130000-0000-4000-9000-000000000021','a4130000-0000-4000-9000-000000000031');")=='2'
    assert run("select count(*) from public.contribution_revisions where id='a4130000-0000-4000-9000-000000000032';")=='0'
    print('contribution_concurrency: PASS (observed lock wait, two candidates preserved, authorized three-way conflict)')
finally:
    for process in (first,second):
        if process is not None and process.poll() is None: process.kill();process.wait(timeout=10)
    # Immutable synthetic revisions remain only until local CI stack teardown.
