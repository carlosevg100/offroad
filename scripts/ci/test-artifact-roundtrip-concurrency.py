#!/usr/bin/env python3
"""Observed two-session stage21 CAS and read/revocation races, disposable CI only.

Uses the SQL suites' real public-command fixture. SQL-only quarantine receipts are fixture
construction, not a claim that Office/antivirus passed; those run in the independent E2E.
"""
import json
import os
from pathlib import Path
import re
import select
import subprocess
import time
from urllib.parse import urlparse
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
URL = os.environ['DATABASE_URL']
if urlparse(URL).hostname not in ('localhost', '127.0.0.1', '::1'):
    raise SystemExit('Artifact roundtrip concurrency requires the disposable local CI database')
CMD = ['psql', URL, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose']


def run(sql):
    p = subprocess.run(CMD, input=sql, text=True, capture_output=True, timeout=60)
    if p.returncode:
        raise AssertionError(p.stderr)
    return p.stdout.strip()


def expand(path):
    return re.sub(r'^\\ir (.+)$', lambda m: expand(path.parent / m[1].strip()), path.read_text(), flags=re.M)


def auth(c, sql):
    claims = json.dumps({'sub': c['actor'], 'role': 'authenticated', 'aal': 'aal1'})
    return (f"select set_config('request.jwt.claim.sub','{c['actor']}',true);"
            f"select set_config('request.jwt.claims','{claims}',true);"
            f"select set_config('request.headers','{{\"x-offroad-workspace\":\"{c['org']}\"}}',true);"
            'set local role authenticated;' + sql)


def setup(number):
    # Reuse precisely the suites' setup, not their sequential eval/adoption assertions.
    path = ROOT / 'supabase/tests/artifact_import_candidates.sql'
    content = path.read_text()
    start = content.index('do $$declare request jsonb;')
    # Bound the setup by its own dollar-quoted block, never the next eval's declaration.
    # Later evals may declare variables without changing this preparation contract.
    terminator = '\nend;$$;'
    stop = content.index(terminator, start) + len(terminator)
    preparation = content[start:stop]
    # Only candidate/command IDs differ, never work/session IDs in the shared fixture.
    other = preparation.replace('a4210000-0000-4000-9000-000000000002', 'a4210000-0000-4000-9000-000000000012').replace('a4210000-0000-4000-9000-000000000003', 'a4210000-0000-4000-9000-000000000013').replace('roundtrip-upload', 'roundtrip-upload-second').replace('Human prose', 'Second human prose')
    fixture = expand(ROOT / 'supabase/tests/support/artifact_roundtrip_setup.sql') + preparation + other
    prefixes = ['a11b0000', 'a4210000', 'a4192000', 'a4191000', 'a4171000', 'a9990000', 'a3300000']
    mapping = {old: f'a54{number:x}{i:04x}' for i, old in enumerate(prefixes)}
    for old, new in mapping.items():
        fixture = fixture.replace(old, new)
    fixture = fixture.replace('offroad:test:artifact-source:', f'offroad:test:roundtrip-race:{number}:')
    fixture = fixture.replace('@example.invalid', f'-roundtrip-race-{number}@example.invalid')
    fixture = fixture.replace('synthetic-roundtrip-worker-token', f'synthetic-roundtrip-race-{number}-token')
    fixture = fixture.replace('synthetic-execution', f'synthetic-roundtrip-race-{number}-execution')
    fixture = fixture.replace('synthetic-policy-worker-fixture-token-v1', f'synthetic-roundtrip-race-{number}-policy-token')
    c = {'actor': mapping['a11b0000'] + '-0000-4000-8000-000000000001',
         'org': mapping['a11b0000'] + '-0000-4000-9000-000000000001',
         'work': mapping['a11b0000'] + '-0000-4000-9000-000000000002',
         'first': mapping['a4210000'] + '-0000-4000-9000-000000000002',
         'second': mapping['a4210000'] + '-0000-4000-9000-000000000012'}
    basis = f"""
    update public.agent_messages set status='completed' where organization_id='{c['org']}' and status in('queued','processing');
    insert into public.organization_review_policies(organization_id,assignment_required,self_approval_allowed,updated_by)
    values('{c['org']}',false,true,'{c['actor']}') on conflict(organization_id) do update set assignment_required=false,self_approval_allowed=true;
    select pg_temp.act_as('{c['actor']}');
    insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,status,pipeline_version,created_by)
    values('{uuid4()}','{c['org']}','{mapping['a11b0000']}-0000-4000-9000-000000000003',121,'manual','queued','approval-fixture-v1','{c['actor']}');
    insert into public.processing_jobs(organization_id,intake_session_id,processing_run_id,kind,status,payload)
    select '{c['org']}','{mapping['a11b0000']}-0000-4000-9000-000000000003',r.id,'case_analysis','queued','{{"analysis_scope":"full_case"}}'
    from public.processing_runs r where r.organization_id='{c['org']}' and r.run_no=121;
    select pg_temp.fixture_approve_execution(j.id) from public.processing_jobs j join public.processing_runs r on r.id=j.processing_run_id where r.organization_id='{c['org']}' and r.run_no=121 and j.kind='case_analysis';
    do $$declare t record;begin
     for t in select tgname,tgrelid::regclass as rel from pg_trigger join pg_proc on pg_proc.oid=tgfoid where pronamespace=pg_my_temp_schema() and not tgisinternal loop
      execute format('drop trigger %I on %s',t.tgname,t.rel);
     end loop;
    end;$$;
    """
    output = """select jsonb_build_object('revision',pg_temp.val('rt_revision','revision_id'),'artifact',pg_temp.val('rt_revision','artifact_id'),'receipt',pg_temp.val('rt_receipt','receiptId'),'source',pg_temp.val('source_a',''),
     'milestone',m.id,'decision',m.subject_id,'baseRevision',m.revision,
     'firstFingerprint',(select comparison_fingerprint from public.artifact_import_candidates where id='%s'),
     'secondFingerprint',(select comparison_fingerprint from public.artifact_import_candidates where id='%s'))
     from public.work_milestones m where m.work_id='%s' and m.subject_kind='execution_brief' and m.kind='decision';""" % (c['first'], c['second'], c['work'])
    result = run('\\o /dev/null\nbegin;\n' + fixture + basis + '\n\\o\n' + output + 'commit;')
    c.update(json.loads(result.splitlines()[-1]))
    return c


def adopt(c, which):
    fp = c['firstFingerprint'] if which == 'first' else c['secondFingerprint']
    return (f"select public.adopt_artifact_import_v1('{c[which]}','{c['revision']}','{fp}','[]','{uuid4()}','pt-BR',true,"
            f"'{c['milestone']}','{c['decision']}',{c['baseRevision']});")


def start(c, sql, barrier):
    p = subprocess.Popen(CMD, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    p.stdin.write('\\o /dev/null\nbegin;' + auth(c, sql) + f'\n\\echo {barrier}\n')
    p.stdin.flush()
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        if not select.select([p.stdout], [], [], max(0, deadline-time.monotonic()))[0]:
            break
        line = p.stdout.readline().strip()
        if line == barrier:
            return p
        if p.poll() is not None:
            raise AssertionError(line)
    p.kill()
    raise AssertionError('First real session failed to reach the transaction barrier')


def race(c, first_sql, second_sql):
    first = second = None
    try:
        first = start(c, first_sql, 'ROUNDTRIP_LOCK_HELD')
        second = subprocess.Popen(CMD, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        second.stdin.write("set application_name='offroad_roundtrip_contender';begin;" + auth(c, second_sql) + 'commit;\n')
        second.stdin.close()
        second.stdin = None
        deadline = time.monotonic() + 20
        while run("select count(*) from pg_stat_activity where application_name='offroad_roundtrip_contender' and wait_event_type='Lock';") != '1':
            if time.monotonic() > deadline or second.poll() is not None:
                raise AssertionError('Contender did not visibly wait: this was not a concurrent CAS eval')
            time.sleep(.05)
        first.stdin.write('commit;\n');first.stdin.close();first.stdin = None
        a = first.communicate(timeout=20)[0]
        b = second.communicate(timeout=20)[0]
        assert first.returncode == 0, a
        assert second.returncode != 0 and re.search(r'ERROR:\s+40001:', b) and 'artifact_import_stale' in b, b
    finally:
        for p in (first, second):
            if p is not None and p.poll() is None:
                p.kill();p.wait(timeout=10)


c = setup(1)
race(c, adopt(c, 'first'), adopt(c, 'second'))
state = json.loads(run(f"select jsonb_build_object('first',f.status,'second',s.status,'head',a.head_revision_id,'applied',f.applied_revision_id,'proposal',s.contributions#>>'{{blockProposals,0,content,text}}','adoptions',(select count(*) from private.artifact_import_events e where e.candidate_id in(f.id,s.id) and e.kind='adopted')) from public.artifact_import_candidates f join public.artifact_import_candidates s on s.id='{c['second']}' join public.artifacts a on a.id=f.artifact_id where f.id='{c['first']}';"))
assert state['applied'] is not None
assert state == {'first':'applied','second':'candidate','head':state['applied'],'applied':state['applied'],'proposal':'Second human prose','adoptions':1}, state
assert run(f"select content->>'text' from public.artifact_blocks where revision_id='{c['revision']}' and block_key='lead';") == 'Original prose'
assert run(f"select count(*) from public.artifact_revisions where artifact_id='{c['artifact']}';") == '2'
assert run(f"select content->>'text' from public.artifact_blocks where revision_id='{state['applied']}' and block_key='lead';") == 'Human prose'
print('competing_adoptions_observed_lock_one_revision_second_CAS_denied_contribution_preserved: PASS')
# Losing candidate cannot request comparison against the obsolete head either.
p = subprocess.run(CMD, input='begin;' + auth(c, f"select public.recompare_artifact_import_v1('{c['second']}','{c['revision']}','{uuid4()}');") + 'commit;', text=True, capture_output=True, timeout=20)
assert p.returncode != 0 and 'artifact_import_stale' in p.stderr and '40001' in p.stderr, p.stderr

c = setup(2)
race(c, f"select public.recompare_artifact_import_v1('{c['first']}','{c['revision']}','{uuid4()}');", adopt(c, 'first'))
state = run(f"select status||':'||(select count(*) from private.artifact_import_events where candidate_id=c.id and kind='adopted') from public.artifact_import_candidates c where id='{c['first']}';")
assert state == 'queued:0', state
assert run(f"select head_revision_id from public.artifacts where id='{c['artifact']}';") == c['revision']
print('recompare_before_adoption_observed_lock_invalidates_snapshot_without_head_write: PASS')
# Remove only this disposable fixture's pending task before the next fixture claims work.
run(f"update private.artifact_roundtrip_tasks set state='cancelled',capability_sha256=null,lease_expires_at=null where organization_id='{c['org']}' and state='queued';")

c = setup(3)
reader = None
try:
    reader = start(c, f"select public.read_artifact_export_receipt_v1('{c['receipt']}');", 'ROUNDTRIP_RECEIPT_READ')
    # A separate committed rights version arrives while the reader transaction stays open.
    run(f"begin;insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,evidence_kind,evidence_reference,evidence_sha256,created_by) values('{c['org']}','{c['source']}',(select max(revision)+1 from private.source_rights_versions where source_version_id='{c['source']}'),array['process'],array['analysis'],'authorized_workspace',clock_timestamp(),'human_declaration',gen_random_uuid(),repeat('d',64),'{c['actor']}');commit;")
    reader.stdin.write(f"select public.read_artifact_export_receipt_v1('{c['receipt']}');commit;\n")
    reader.stdin.close();reader.stdin = None
    output = reader.communicate(timeout=20)[0]
    assert reader.returncode != 0 and re.search(r'ERROR:\s+42501:',output),output
    # The work is still readable: the refusal came from source rights, not membership/project loss.
    project = run('begin;' + auth(c, f"select count(*) from public.capital_projects where id='{c['work']}';") + 'commit;').splitlines()[-1]
    assert project == '1', project
    print('source_revoked_between_receipt_reads_same_open_transaction_revalidation_denied_project_readable: PASS')
finally:
    if reader is not None and reader.poll() is None:
        reader.kill();reader.wait(timeout=10)
