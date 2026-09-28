#!/usr/bin/env python3
"""Two real sessions on the disposable CI stack: review authority and decision ordering."""
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
    raise SystemExit('Review concurrency requires the disposable local CI database')
command = ['psql', url, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1']
actor = 'a520c000-0000-4000-8000-000000000001'
other = 'a520c000-0000-4000-8000-000000000002'
org = 'a520c000-0000-4000-9000-000000000001'
work = 'a520c000-0000-4000-9000-000000000002'


def run(sql):
    result = subprocess.run(command, input=sql, text=True, capture_output=True, timeout=60)
    if result.returncode:
        raise AssertionError(result.stderr)
    return result.stdout.strip()


def expand(path):
    return re.sub(r'^\\ir (.+)$', lambda m: expand(path.parent / m[1].strip()), path.read_text(), flags=re.M)


def authorized(sql, subject=actor):
    return f"select set_config('request.jwt.claim.sub','{subject}',true);" + sql


def compete(first_sql, second_sql, expected_error=None, second_actor=actor):
    first = second = None
    try:
        first = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        first.stdin.write('\\o /dev/null\nbegin;' + authorized(first_sql) + '\n\\echo REVIEW_LOCK_HELD\n')
        first.stdin.flush()
        deadline = time.monotonic() + 20
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0 or not select.select([first.stdout], [], [], remaining)[0]:
                raise AssertionError('First review transaction did not reach its barrier')
            line = first.stdout.readline().strip()
            if line == 'REVIEW_LOCK_HELD':
                break
            if first.poll() is not None:
                raise AssertionError(line)
        second = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        second.stdin.write("set application_name='offroad_review_contender';begin;" + authorized(second_sql, second_actor) + 'commit;\n')
        second.stdin.close()
        second.stdin = None
        deadline = time.monotonic() + 20
        while run("select count(*) from pg_stat_activity where application_name='offroad_review_contender' and wait_event_type='Lock';") != '1':
            if time.monotonic() >= deadline or second.poll() is not None:
                raise AssertionError('Second transaction did not visibly wait for review authority')
            time.sleep(.05)
        first.stdin.write('commit;\n')
        first.stdin.close()
        first.stdin = None
        a = first.communicate(timeout=20)[0]
        b = second.communicate(timeout=20)[0]
        assert first.returncode == 0, a
        if expected_error:
            assert second.returncode != 0 and expected_error in b, b
        else:
            assert second.returncode == 0, b
        return b
    finally:
        for process in (first, second):
            if process is not None and process.poll() is None:
                process.kill()
                process.wait(timeout=10)


# Isolated synthetic tenant; immutable rows remain only until the disposable CI stack ends.
fixture = expand(ROOT / 'supabase/tests/support/artifact_revision_setup.sql')
fixture = fixture.replace('a11b0000', 'a520c000').replace('a4192000', 'a520d000').replace('a4191000', 'a520e000').replace('a4171000', 'a520f000')
fixture = fixture.replace('a11b-', 'a520c-').replace('synthetic-artifact', 'synthetic-review-concurrency').replace('synthetic-execution', 'synthetic-review-method')
setup = f"""
insert into public.organization_review_policies(organization_id,self_approval_allowed,updated_by) values('{org}',true,'{actor}');
select public.set_capital_project_review_assignment_v1('{work}','{actor}','approver',true);
select public.set_capital_project_review_assignment_v1('{work}','{other}','approver',true);
select public.grant_resource_access_v1('{work}','{other}','work');
select pg_temp.person_write('answer','synthetic-concurrent-review','internal',pg_temp.manifest('answer','internal','[]','[]'),
 jsonb_build_array(pg_temp.block('paragraph','paragraph','{{"text":"Synthetic concurrent review"}}')));
"""
setup += f"""
select pg_temp.person_write('answer','synthetic-source-concurrency','internal',
 pg_temp.manifest('answer','internal',jsonb_build_array(pg_temp.source_ref(pg_temp.val('source_a','')::uuid)),'[]'),
 jsonb_build_array(pg_temp.block('paragraph','paragraph','{{"text":"Synthetic source restricted content"}}')));
"""
run('begin;' + fixture + setup + 'commit;')
revision = run(f"select r.id from public.artifact_revisions r join public.artifacts a on a.id=r.artifact_id where a.work_id='{work}' and a.subject='synthetic-concurrent-review';")
fingerprint = run(f"select manifest_fingerprint from public.artifact_revisions where id='{revision}';")
review = f"select public.review_artifact_revision_v1('{revision}','{fingerprint}','approve',null,null,true,gen_random_uuid());"
basis = '{"artifacts":[],"milestones":[],"assessments":[],"decisions":[],"execution":null,"configuration":null}'
decision = f"select public.record_work_decision_v1('{work}','concurrent-choice','choose_alternative','{basis}',array['none'],'in_product',null,null,null,gen_random_uuid());"
compete('set local role authenticated;' + decision, 'set local role authenticated;' + decision, second_actor=other)
assert run(f"select count(*)||':'||count(*) filter(where contested) from public.work_decisions where work_id='{work}' and decision_key='concurrent-choice';") == '2:1'
assert run(f"select private.work_decision_precedence_v1('{org}','{work}','concurrent-choice')->>'state';") == 'contested'
assert run(f"select count(distinct decided_by) from public.work_decisions where work_id='{work}' and decision_key='concurrent-choice';") == '2'
run('begin;' + authorized(f"select public.set_capital_project_review_assignment_v1('{work}','{other}','approver',false);") + 'commit;')
print('review_concurrent_decisions: PASS (two people, observed wait, two immutable rows, contested precedence)')

compete(f"update auth.users set banned_until=now()+interval '1 day' where id='{actor}';", 'set local role authenticated;' + review, 'review_work_access_required')
run(f"update auth.users set banned_until=null where id='{actor}';")
print('review_suspension_first: PASS (observed identity wait, approval denied)')

remove_role = f"select public.set_capital_project_review_assignment_v1('{work}','{actor}','approver',false);"
compete('set local role authenticated;' + remove_role, 'set local role authenticated;' + review, 'review_assignment_required')
run('begin;' + authorized(f"select public.set_capital_project_review_assignment_v1('{work}','{actor}','approver',true);") + 'commit;')
print('review_assignment_removal_first: PASS (observed wait, empty assignment does not reopen approval)')

forbid = f"update public.capital_project_review_policies set self_approval='forbidden' where organization_id='{org}' and capital_project_id='{work}';"
compete(forbid, 'set local role authenticated;' + review, 'capital_project_self_approval_forbidden')
run(f"update public.capital_project_review_policies set self_approval='allowed' where organization_id='{org}' and capital_project_id='{work}';")
print('review_policy_change_first: PASS (observed policy wait, new policy enforced)')

compete('set local role authenticated;' + review, forbid)
assert run(f"select count(*) from public.artifact_reviews where revision_id='{revision}' and act='approve';") == '1'
result = subprocess.run(command, input='begin;' + authorized('set local role authenticated;' + review) + 'commit;', text=True, capture_output=True, timeout=20)
assert result.returncode != 0 and 'capital_project_self_approval_forbidden' in result.stderr
print('review_approval_first: PASS (policy change waited, prior act preserved, later approval denied)')

run(f"update public.capital_project_review_policies set self_approval='allowed' where organization_id='{org}' and capital_project_id='{work}';")
source_revision = run(f"select r.id from public.artifact_revisions r join public.artifacts a on a.id=r.artifact_id where a.work_id='{work}' and a.subject='synthetic-source-concurrency';")
source_fp = run(f"select manifest_fingerprint from public.artifact_revisions where id='{source_revision}';")
source = run(f"select source_version_id from private.artifact_dependency_links where revision_id='{source_revision}' and link_kind='source_version';")
rights_revision = run(f"select max(revision) from private.source_rights_versions where organization_id='{org}' and source_version_id='{source}';")
source_revoke = f"set local role authenticated;select public.set_source_rights_v1('{source}',{rights_revision},array['process'],array['analysis'],null,null,'{source}',repeat('a',64));"
source_review = f"select public.review_artifact_revision_v1('{source_revision}','{source_fp}','approve',null,null,true,gen_random_uuid());"
compete(source_revoke, 'set local role authenticated;' + source_review, 'review_source_access_required')
assert run(f"select count(*) from public.artifact_reviews where revision_id='{source_revision}';") == '0'
print('review_source_revocation_first: PASS (observed policy wait, no approval persisted)')

# A cosmetic successor is created through the production writer with the existing immutable blocks.
run('begin;' + authorized(f"""
select public.create_artifact_revision_v1('{work}','answer','synthetic-concurrent-review','internal',
 (select jsonb_set(manifest,'{{template}}','{{"templateVersionId":"cosmetic-next","fingerprint":"{'a'*64}"}}') from public.artifact_revisions where id='{revision}'),
 (select jsonb_agg(jsonb_build_object('blockKey',block_key,'kind',kind,'content',content,'claims',claims) order by block_no) from public.artifact_blocks where revision_id='{revision}'),'[]',null,null);
""") + 'commit;')
next_revision = run(f"select head_revision_id from public.artifacts where work_id='{work}' and subject='synthetic-concurrent-review';")
next_fp = run(f"select manifest_fingerprint from public.artifact_revisions where id='{next_revision}';")
base = run(f"select id from public.artifact_reviews where revision_id='{revision}' and act='approve';")
revoke_base = f"select public.review_artifact_revision_v1('{revision}','{fingerprint}','revoke_approval',null,null,false,gen_random_uuid(),'{base}');"
reaffirm = f"select public.review_artifact_revision_v1('{next_revision}','{next_fp}','reaffirm',null,null,true,gen_random_uuid(),'{base}');"
compete('set local role authenticated;' + revoke_base, 'set local role authenticated;' + reaffirm, 'artifact_review_basis_invalid')
assert run(f"select count(*) from public.artifact_reviews where revision_id='{next_revision}';") == '0'
print('review_base_revocation_first: PASS (observed work wait, reaffirmation denied)')
run('begin;' + authorized('set local role authenticated;' + review) + 'commit;')
new_base = run(f"select id from public.artifact_reviews where revision_id='{revision}' and act='approve' and id<>'{base}';")
compete('set local role authenticated;' + reaffirm.replace(base, new_base), 'set local role authenticated;' + revoke_base.replace(base, new_base))
assert run(f"select count(*) from public.artifact_reviews where revision_id='{next_revision}' and act='reaffirm';") == '1'
assert run(f"select private.artifact_review_is_active_v1('{org}',id) from public.artifact_reviews where revision_id='{next_revision}' and act='reaffirm';") == 'f'
print('review_reaffirmation_first: PASS (revocation waited, history retained, chain inactive after revocation)')
