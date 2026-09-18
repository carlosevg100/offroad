#!/usr/bin/env python3
"""Two actual publishers contend on the policy lock; one exact review wins.
Synthetic identities, only a disposable local CI database; never production.
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
    raise SystemExit('Vault concurrency requires the disposable local CI database')
command = ['psql', url, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1']
org = 'a5120000-0000-4000-9000-000000000001'
work = 'a5120000-0000-4000-9000-000000000002'
a = 'a5120000-0000-4000-8000-000000000001'
b = 'a5120000-0000-4000-8000-000000000002'
def run(sql):
    result = subprocess.run(command, input=sql, text=True, capture_output=True, timeout=30)
    if result.returncode: raise AssertionError(result.stderr)
    return result.stdout.strip()
def expand(p):
    return '\n'.join(expand(p.parent / m.group(1)) if (m := re.match(r'\\ir\s+(.+)', line)) else line for line in p.read_text().splitlines())
def actor(user):
    return f"set local role authenticated; select set_config('request.jwt.claim.sub','{user}',true); select set_config('request.headers','{{\"x-offroad-workspace\":\"{org}\"}}',true);"
fixture = '\n'.join(expand(ROOT / 'supabase/tests/support' / name) for name in ['source_rights_fixture.sql','legacy_workspace_capabilities.sql','legacy_resource_fixture.sql']).replace('a11b0000','a5120000').replace('a11b-','a512-')
entry='a5120000-0000-4000-9000-000000000301'
version='a5120000-0000-4000-9000-000000000302'
request_a='a5120000-0000-4000-9000-000000000303'
request_b='a5120000-0000-4000-9000-000000000304'
pub_a='a5120000-0000-4000-9000-000000000305'
pub_b='a5120000-0000-4000-9000-000000000306'
run('begin;\n'+fixture+'\n'+actor(a)+f"""
select public.submit_vault_entry_version_v1('{entry}','{version}',null,'directive','Synthetic contention','Synthetic reviewed content');
select public.set_resource_policy_grant_v1((select id from public.vault_scopes),'{a}',null,'publish','allow');
select public.set_resource_policy_grant_v1((select id from public.vault_scopes),'{b}',null,'read','allow');
select public.set_resource_policy_grant_v1((select id from public.vault_scopes),'{b}',null,'publish','allow');
select public.propose_vault_publication_v1('{request_a}','{version}',(select content_fingerprint from public.vault_entry_versions where id='{version}'),null,null,'analysis','Synthetic review A');
"""+actor(b)+f"""
select public.propose_vault_publication_v1('{request_b}','{version}',(select content_fingerprint from public.vault_entry_versions where id='{version}'),null,null,'analysis','Synthetic review B');commit;
""")
def publish(request, publication):
    return f"select public.publish_vault_entry_v1('{request}','{publication}',(select review_fingerprint from public.vault_publication_requests where id='{request}'));"
first = second = None
try:
    first = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    first.stdin.write("\\o /dev/null\nbegin;"+actor(a)+publish(request_a,pub_a)+"\n\\echo VAULT_LOCK_HELD\n")
    first.stdin.flush()
    deadline = time.monotonic()+20
    while True:
        remaining = deadline-time.monotonic()
        if remaining <= 0 or not select.select([first.stdout],[],[],remaining)[0]: raise AssertionError('First publisher did not acquire lock')
        if first.stdout.readline().strip() == 'VAULT_LOCK_HELD': break
        if first.poll() is not None: raise AssertionError('First publisher terminated')
    second = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    second.stdin.write("set application_name='offroad_vault_contender';begin;"+actor(b)+publish(request_b,pub_b)+"commit;\n")
    second.stdin.close();second.stdin=None
    deadline=time.monotonic()+20
    while run("select count(*) from pg_stat_activity where application_name='offroad_vault_contender' and wait_event_type='Lock';") != '1':
        if time.monotonic()>=deadline or second.poll() is not None: raise AssertionError('Competing publisher did not wait on the policy lock')
        time.sleep(.05)
    first.stdin.write('commit;\n');first.stdin.close();first.stdin=None
    first_output=first.communicate(timeout=20)[0];second_output=second.communicate(timeout=20)[0]
    assert first.returncode==0,first_output
    assert second.returncode != 0 and 'vault_review_stale' in second_output,second_output
    assert run(f"select count(*) from public.vault_publications where entry_id='{entry}' and withdrawn_at is null;")=='1'
    assert run(f"select id from public.vault_publications where entry_id='{entry}' and withdrawn_at is null;")==pub_a
    assert run(f"select count(*) from public.vault_publication_requests where entry_id='{entry}';")=='2'
    print('vault_publication_concurrency: PASS (observed lock wait, exact first publication preserved, second review rejected)')

finally:
    for process in (first,second):
        if process is not None and process.poll() is None: process.kill();process.wait(timeout=10)
    # Immutable synthetic publications remain only until local CI stack teardown.
