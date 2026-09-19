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
    raise SystemExit('Method concurrency requires the disposable local CI database')
command = ['psql', url, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1']
org = 'a5141000-0000-4000-9000-000000000001'
work = 'a5141000-0000-4000-9000-000000000002'
a = 'a5141000-0000-4000-8000-000000000001'
b = 'a5141000-0000-4000-8000-000000000002'
def run(sql):
    result = subprocess.run(command, input=sql, text=True, capture_output=True, timeout=30)
    if result.returncode: raise AssertionError(result.stderr)
    return result.stdout.strip()
def expand(p):
    return '\n'.join(expand(p.parent / m.group(1)) if (m := re.match(r'\\ir\s+(.+)', line)) else line for line in p.read_text().splitlines())
def actor(user):
    return f"set local role authenticated; select set_config('request.jwt.claim.sub','{user}',true); select set_config('request.headers','{{\"x-offroad-workspace\":\"{org}\"}}',true);"
fixture = '\n'.join(expand(ROOT / 'supabase/tests/support' / name) for name in ['source_rights_fixture.sql','legacy_workspace_capabilities.sql','legacy_resource_fixture.sql']).replace('a11b0000','a5141000').replace('a11b-','a5141-')
release_a='a5141000-0000-4000-9000-000000000301'
release_b='a5141000-0000-4000-9000-000000000302'
pub_a='a5141000-0000-4000-9000-000000000305'
pub_b='a5141000-0000-4000-9000-000000000306'
run('begin;\n'+fixture+'\n'+actor(a)+f"""
select public.set_resource_policy_grant_v1((select id from public.vault_scopes where organization_id='{org}'),'{a}',null,'work','allow');
select public.set_resource_policy_grant_v1((select id from public.vault_scopes where organization_id='{org}'),'{a}',null,'publish','allow');
select public.set_method_publication_policy_v1(false);
select public.submit_method_candidate_v1('{release_a}','Synthetic contender A','r01-2026.09.06-v1','[]',null,'receivables_underwriting');
select public.submit_method_candidate_v1('{release_b}','Synthetic contender B','r01-2026.09.06-v1','[]',null,'receivables_underwriting');
select public.review_method_candidate_v1(id,gen_random_uuid(),manifest_fingerprint,evidence_fingerprint,'Synthetic reviewed composition, exact evidence.') from public.method_releases where organization_id='{org}';
commit;
""")
def publish(release, binding):
    return f"select public.publish_method_release_v1('{release}',(select id from public.method_review_records where release_id='{release}'),(select manifest_fingerprint from public.method_releases where id='{release}'));select public.bind_method_release_v1('{binding}','{release}',null,null,'receivables_underwriting');"
first = second = None
try:
    first = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    first.stdin.write("\\o /dev/null\nbegin;"+actor(a)+publish(release_a,pub_a)+"\n\\echo METHOD_LOCK_HELD\n")
    first.stdin.flush()
    deadline = time.monotonic()+20
    while True:
        remaining = deadline-time.monotonic()
        if remaining <= 0 or not select.select([first.stdout],[],[],remaining)[0]: raise AssertionError('First publisher did not acquire lock')
        if first.stdout.readline().strip() == 'METHOD_LOCK_HELD': break
        if first.poll() is not None: raise AssertionError('First publisher terminated')
    second = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    second.stdin.write("set application_name='offroad_method_contender';begin;"+actor(a)+publish(release_b,pub_b)+"commit;\n")
    second.stdin.close();second.stdin=None
    deadline=time.monotonic()+20
    while run("select count(*) from pg_stat_activity where application_name='offroad_method_contender' and wait_event_type='Lock';") != '1':
        if time.monotonic()>=deadline or second.poll() is not None: raise AssertionError('Competing publisher did not wait on the policy lock')
        time.sleep(.05)
    first.stdin.write('commit;\n');first.stdin.close();first.stdin=None
    first_output=first.communicate(timeout=20)[0];second_output=second.communicate(timeout=20)[0]
    assert first.returncode==0,first_output
    assert second.returncode != 0 and 'method_binding_stale' in second_output,second_output
    assert run(f"select count(*) from public.method_scope_bindings where organization_id='{org}' and retired_at is null;")=='1'
    assert run(f"select release_id from public.method_scope_bindings where organization_id='{org}' and retired_at is null;")==release_a
    assert run(f"select status from public.method_releases where id='{release_b}';")=='candidate'
    assert run(f"select count(*) from public.method_releases where organization_id='{org}' and manifest_fingerprint=encode(extensions.digest(manifest::text,'sha256'),'hex');")=='2'
    print('method_publication_concurrency: PASS (observed lock wait, exact first composition published and bound, second transaction rolled back without mixing)')

finally:
    for process in (first,second):
        if process is not None and process.poll() is None: process.kill();process.wait(timeout=10)
    # Immutable synthetic method publications remain only until local CI stack teardown.
