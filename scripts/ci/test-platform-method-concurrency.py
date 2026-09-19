#!/usr/bin/env python3
"""Competing platform publishers, using two real sessions in disposable local CI only."""
import os, select, subprocess, time
from pathlib import Path
from urllib.parse import urlparse
root=Path(__file__).resolve().parents[2]
url=os.environ['DATABASE_URL']
if urlparse(url).hostname not in ('localhost','127.0.0.1','::1'):
    raise SystemExit('Requires the disposable local CI database')
command=['psql',url,'-X','-A','-t','-q','-v','ON_ERROR_STOP=1']
def run(sql):
    r=subprocess.run(command,input=sql,text=True,capture_output=True,timeout=30)
    if r.returncode:raise AssertionError(r.stderr)
    return r.stdout.strip()
fixture=(root/'supabase/tests/support/platform_method_fixture.sql').read_text()
ready="""
select private.attest_platform_method_candidate_v1(gen_random_uuid(),id,fingerprint,'technical_review','Synthetic technical reviewer',jsonb_build_object('sourcePath','packages/credit-playbook/knowledge/reviews/synthetic-platform-technical.json','sourceHash',repeat('a',64),'occurredAt','2026-09-19T00:00:00Z','result','approved','manifestHash',bundle->'manifest'->>'manifestHash','sourceCommit',repeat('c',40),'humanApproval',false)) from platform_method_fixture;
select private.attest_platform_method_candidate_v1(gen_random_uuid(),id,fingerprint,'content_approval','Synthetic human approver',jsonb_build_object('sourcePath','packages/credit-playbook/knowledge/reviews/synthetic-platform-approval.json','sourceHash',repeat('b',64),'occurredAt','2026-09-19T00:00:00Z','result','approved','manifestHash',bundle->'manifest'->>'manifestHash','sourceCommit',repeat('c',40),'humanApproval',true)) from platform_method_fixture;
"""
run('begin;'+fixture+ready+'commit;')
publish="select private.publish_platform_method_v1(gen_random_uuid(),id,fingerprint,'Synthetic simultaneous publication') from private.platform_method_candidates where id='b5141000-0000-4000-9000-000000000001';"
first=second=None
try:
    first=subprocess.Popen(command,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,bufsize=1)
    first.stdin.write('\\o /dev/null\nbegin;'+publish+'\n\\echo PLATFORM_LOCK_HELD\n');first.stdin.flush()
    deadline=time.monotonic()+20
    while True:
        remaining=deadline-time.monotonic()
        if remaining<=0 or not select.select([first.stdout],[],[],remaining)[0]:raise AssertionError('First publisher did not acquire lock')
        if first.stdout.readline().strip()=='PLATFORM_LOCK_HELD':break
        if first.poll() is not None:raise AssertionError('First publisher exited')
    second=subprocess.Popen(command,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
    second.stdin.write("set application_name='offroad_platform_method_contender';begin;"+publish+'commit;\n');second.stdin.close();second.stdin=None
    deadline=time.monotonic()+20
    while run("select count(*) from pg_stat_activity where application_name='offroad_platform_method_contender' and wait_event_type='Lock';")!='1':
        if time.monotonic()>=deadline or second.poll() is not None:raise AssertionError('Second publisher did not wait on lock')
        time.sleep(.05)
    first.stdin.write('commit;\n');first.stdin.close();first.stdin=None
    a=first.communicate(timeout=20)[0];b=second.communicate(timeout=20)[0]
    assert first.returncode==0,a
    assert second.returncode!=0 and 'platform_method_already_decided' in b,b
    assert run("select count(*) from private.platform_method_publication_events where candidate_id='b5141000-0000-4000-9000-000000000001';")=='1'
    assert run("select released from private.platform_capability_releases where method_id='synthetic-platform-method';")=='f'
    print('platform_method_concurrency: PASS (observed lock wait, one immutable publication, executor disabled)')
finally:
    for p in (first,second):
        if p is not None and p.poll() is None:p.kill();p.wait(timeout=10)
    # Immutable synthetic records disappear with the disposable local CI stack, never remote.
