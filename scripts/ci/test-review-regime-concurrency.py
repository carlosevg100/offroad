#!/usr/bin/env python3
"""Two real sessions on the disposable CI stack: review authority and decision ordering."""
import os
from pathlib import Path
import re
import select
import subprocess
import time
from urllib.parse import urlparse

ROOT = Path(os.environ['OFFROAD_REPOSITORY_ROOT']).resolve()
url = os.environ['DATABASE_URL']
if urlparse(url).hostname not in ('localhost', '127.0.0.1', '::1'):
    raise SystemExit('Review concurrency requires the disposable local CI database')
command = ['psql', url, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose']
actor = 'a530c000-0000-4000-8000-000000000001'
other = 'a530c000-0000-4000-8000-000000000002'
org = 'a530c000-0000-4000-9000-000000000001'
work = 'a530c000-0000-4000-9000-000000000002'


def run(sql):
    result = subprocess.run(command, input=sql, text=True, capture_output=True, timeout=60)
    if result.returncode:
        raise AssertionError(result.stderr)
    return result.stdout.strip()


def expand(path):
    return re.sub(r'^\\ir (.+)$', lambda m: expand(path.parent / m[1].strip()), path.read_text(), flags=re.M)


def authorized(sql, subject=actor):
    return (f"select set_config('request.jwt.claim.sub','{subject}',true);"
            f"select set_config('request.jwt.claims','{{\"sub\":\"{subject}\",\"role\":\"authenticated\",\"aal\":\"aal1\"}}',true);"
            f"select set_config('request.headers','{{\"x-offroad-workspace\":\"{org}\"}}',true);" + sql)


def assert_error(output, message, state):
    assert message in output, output
    assert re.search(r'ERROR:\s+' + re.escape(state) + r':', output), output


def compete(first_sql, second_sql, expected_error=None, second_actor=actor, first_actor=actor, wait_required=True, expected_state=None):
    first = second = None
    try:
        first = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        first.stdin.write('\\o /dev/null\nbegin;' + authorized(first_sql, first_actor) + '\n\\echo REGIME_LOCK_HELD\n')
        first.stdin.flush()
        deadline = time.monotonic() + 20
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0 or not select.select([first.stdout], [], [], remaining)[0]:
                raise AssertionError('First review transaction did not reach its barrier')
            line = first.stdout.readline().strip()
            if line == 'REGIME_LOCK_HELD':
                break
            if first.poll() is not None:
                raise AssertionError(line)
        second = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        second.stdin.write("set application_name='offroad_regime_contender';begin;" + authorized(second_sql, second_actor) + 'commit;\n')
        second.stdin.close()
        second.stdin = None
        deadline = time.monotonic() + 20
        while (run("select count(*) from pg_stat_activity where application_name='offroad_regime_contender' and wait_event_type='Lock';") != '1') if wait_required else (second.poll() is None):
            if time.monotonic() >= deadline or (wait_required and second.poll() is not None):
                raise AssertionError('Second transaction did not visibly wait for review authority')
            time.sleep(.05)
        first.stdin.write('commit;\n')
        first.stdin.close()
        first.stdin = None
        a = first.communicate(timeout=20)[0]
        b = second.communicate(timeout=20)[0]
        assert first.returncode == 0, a
        if expected_error:
            assert second.returncode != 0, b
            state=expected_state or ('40001' if expected_error=='policy_changed' else 'P0002' if expected_error=='capital_project_not_found' else '42501')
            assert_error(b,expected_error,state)
        else:
            assert second.returncode == 0, b
        return b
    finally:
        for process in (first, second):
            if process is not None and process.poll() is None:
                process.kill()
                process.wait(timeout=10)



fixture = expand(ROOT / 'supabase/tests/support/artifact_revision_setup.sql')
for old, new in [('a11b0000','a530c000'),('a4192000','a530d000'),('a4191000','a530e000'),('a4171000','a530f000'),('a9990000','a530b000'),('a3300000','a530a000')]:
    fixture = fixture.replace(old, new)
fixture = fixture.replace('a11b-', 'a530c-').replace('synthetic-artifact', 'synthetic-regime-concurrency')
fixture = fixture.replace('synthetic-execution', 'synthetic-regime-execution')
fixture = fixture.replace('synthetic-policy-worker-fixture-token-v1', 'synthetic-regime-policy-worker-token-v1')
fixture = fixture.replace('offroad:test:artifact-source:', 'offroad:test:regime-concurrency-source:')
fixture = fixture.replace('artifact-foreign@example.invalid', 'regime-foreign@example.invalid')
setup = f"""
update public.organization_memberships set role='admin' where organization_id='{org}' and user_id='{actor}';
update public.organization_memberships set role='owner' where organization_id='{org}' and user_id='{other}';
select public.grant_resource_access_v1('{work}','{other}','read');
select public.grant_resource_access_v1('{work}','{actor}','read');
insert into public.organization_review_policies(organization_id,self_approval_allowed,assignment_required,updated_by) values('{org}',true,false,'{actor}');
insert into public.capital_project_review_policies(organization_id,capital_project_id,self_approval,assignment_required,updated_by) values('{org}','{work}','allowed','not_required','{actor}');
select pg_temp.person_write('answer','synthetic-regime-review','internal',pg_temp.manifest('answer','internal','[]','[]'),
 jsonb_build_array(pg_temp.block('paragraph','paragraph','{{"text":"Synthetic regime concurrency"}}')));
"""
run('begin;' + fixture + setup + 'commit;')

def context():
    import json
    return json.loads(run('begin;' + authorized('set local role authenticated;'
        + f"select public.read_capital_project_review_context_v2('{work}');") + 'commit;').splitlines()[-1])

def project(s, a, fp=None):
    return f"set local role authenticated;select public.set_capital_project_review_policy_v2('{work}','{s}','{a}','{fp or context()['policy_fingerprint']}');"

def organization(s, a, fp=None):
    return f"set local role authenticated;select public.set_organization_review_policy_v2('{org}',{str(s).lower()},{str(a).lower()},'{fp or context()['organization_policy_fingerprint']}');"

def execute(sql, subject=actor):
    return run('begin;' + authorized(sql, subject) + 'commit;')

def restore():
    # Synthetic CI fixture repair only; never run this against deployed environments.
    run(f"""begin;update auth.users set banned_until=null,deleted_at=null where id='{actor}';
    insert into public.organization_memberships(organization_id,user_id,role,status) values('{org}','{actor}','admin','active')
    on conflict(organization_id,user_id) do update set role='admin',status='active';
    update private.principals set revoked_at=null where organization_id='{org}' and user_id='{actor}';
    update private.resource_access_grants set effect='allow',revoked_at=null,revoked_by=null where organization_id='{org}' and subject_user_id='{actor}';
    update private.access_resources set allowed_purposes=array['analysis','retrieval','publication','export'] where organization_id='{org}' and id='{work}';commit;""")
    execute(project('allowed','not_required'))
    execute(organization(True,False))

def policy_audits():
    return run(f"select count(*) from public.audit_events where organization_id='{org}' and resource_type in ('capital_project_review_policies','organization_review_policies');")

def assert_denied_after_revocation():
    result = subprocess.run(command, input='begin;' + authorized('set local role authenticated;'
      + f"select public.read_capital_project_review_context_v2('{work}');") + 'commit;', text=True, capture_output=True, timeout=20)
    assert result.returncode != 0,result.stderr
    assert_error(result.stderr,'review_context_access_denied','42501')

# Rejected foreign callers must not wait for a foreign row or advisory lock.
foreign_work='a530d000-0000-4000-9000-000000000002'
foreign_org='a530d000-0000-4000-9000-000000000001'
compete(f"select 1 from public.capital_projects where id='{foreign_work}' for no key update;",
 f"set local role authenticated;select public.set_capital_project_review_policy_v2('{foreign_work}','inherit','inherit','{'a'*64}');",
 'capital_project_review_management_denied',wait_required=False)
print('foreign_project_locked_preflight_denied_immediately: PASS')
compete(f"select pg_advisory_xact_lock(hashtextextended('resource-policy:'||'{foreign_org}',0));",
 f"set local role authenticated;select public.set_organization_review_policy_v2('{foreign_org}',false,false,'{'a'*64}');",
 'capital_project_review_management_denied',wait_required=False)
print('foreign_organization_advisory_locked_preflight_denied_immediately: PASS')
compete(f"select pg_advisory_xact_lock(hashtextextended('resource-policy:'||'{foreign_org}',0));",
 f"set local role authenticated;select public.set_organization_review_policy_v1('{foreign_org}',false);",
 'capital_project_review_management_denied',wait_required=False)
print('v1_foreign_organization_locked_preflight_denied_immediately: PASS')
compete(f"select 1 from public.capital_projects where id='{foreign_work}' for no key update;",
 f"set local role authenticated;select public.set_capital_project_review_policy_v1('{foreign_work}','inherit');",
 'capital_project_not_found',wait_required=False)
print('v1_foreign_unreadable_project_locked_not_found_immediately: PASS')
# H is organization owner but has only explicit READ on A's work; role grants do
# not authorize content manage. A blocked project row must not delay refusal.
compete(f"select 1 from public.capital_projects where id='{work}' for no key update;",
 f"set local role authenticated;select public.set_capital_project_review_policy_v1('{work}','inherit');",
 'capital_project_review_management_denied',second_actor=other,wait_required=False)
print('v1_read_only_admin_locked_project_preflight_denied_immediately: PASS')


# V1-first invalidates V2's snapshot; V2-first cannot have assignment overwritten by V1.
for scope in ['organization','project']:
    restore()
    v1 = (f"set local role authenticated;select public.set_organization_review_policy_v1('{org}',false);" if scope=='organization'
      else f"set local role authenticated;select public.set_capital_project_review_policy_v1('{work}','forbidden');")
    v2 = organization(True,True) if scope=='organization' else project('allowed','required')
    compete(v1, v2, 'policy_changed')
    print(scope+'_v1_before_v2: PASS (observed wait, CAS refused, no deadlock)')
    restore()
    v2 = organization(True,True) if scope=='organization' else project('allowed','required')
    compete(v2, v1)
    c=context()
    assert c['assignment_required']['organization' if scope=='organization' else 'project'] == (True if scope=='organization' else 'required')
    print(scope+'_v2_before_v1: PASS (observed wait, assignment preserved)')

restore()
fp=context()['policy_fingerprint']
before=policy_audits()
# Separate committed transaction: same-value V1 write still updates row timestamp.
execute(f"set local role authenticated;select public.set_capital_project_review_policy_v1('{work}','allowed');")
assert context()['policy_fingerprint'] != fp
result=subprocess.run(command,input='begin;'+authorized(project('allowed','required',fp))+'commit;',text=True,capture_output=True,timeout=20)
assert result.returncode != 0,result.stderr
assert_error(result.stderr,'policy_changed','40001')
assert int(policy_audits())==int(before)+1
print('v1_same_value_committed_write_invalidates_cas: PASS (only V1 audit)')

restore()
fp=context()['policy_fingerprint']
compete(project('allowed','required',fp),project('forbidden','not_required',fp),'policy_changed')
assert context()['assignment_required']['project']=='required'
print('v2_stale_other_axis: PASS (CAS prevents overwrite)')
restore()
fp=context()['policy_fingerprint']
compete(organization(False,True),project('allowed','required',fp),'policy_changed')
print('organization_change_invalidates_project: PASS')

revision=run(f"select r.id from public.artifact_revisions r join public.artifacts a on a.id=r.artifact_id where a.work_id='{work}' and a.subject='synthetic-regime-review';")
fingerprint=run(f"select manifest_fingerprint from public.artifact_revisions where id='{revision}';")
review=f"set local role authenticated;select public.review_artifact_revision_v1('{revision}','{fingerprint}','approve',null,null,true,gen_random_uuid());"
restore()
compete(project('forbidden','not_required'),review,'capital_project_self_approval_forbidden')
print('regime_write_before_exact_approval: PASS (new policy enforced)')
restore()
compete(review,project('forbidden','not_required'))
assert run(f"select count(*) from public.artifact_reviews where revision_id='{revision}' and act='approve';")=='1'
print('exact_approval_before_regime_write: PASS (prior immutable act retained)')

# Four authority-changing setters share the remodeled lock protocol. Do not
# prove only project V2 while the existing V1 endpoints remain a separate path.
def make_writer(name):
    if name=='project_v1':
        return f"set local role authenticated;select public.set_capital_project_review_policy_v1('{work}','forbidden');"
    if name=='project_v2':
        return project('forbidden','required')
    if name=='organization_v1':
        return f"set local role authenticated;select public.set_organization_review_policy_v1('{org}',false);"
    if name=='organization_v2':
        return organization(False,True)
    raise AssertionError(name)

writers=['project_v1','project_v2','organization_v1','organization_v2']
# Identity changes use auth.users row locks, not the policy advisory.
identity_changes=[
 ('suspend',f"update auth.users set banned_until=now()+interval '1 day' where id='{actor}';"),
 ('soft_delete',f"update auth.users set deleted_at=now() where id='{actor}';")]
for writer_name in writers:
    for change_name,change in identity_changes:
        restore()
        before=int(policy_audits())
        compete(change,make_writer(writer_name),'capital_project_review_management_denied',expected_state='42501')
        assert int(policy_audits())==before
        assert_denied_after_revocation()
        print(change_name+'_before_'+writer_name+': PASS (auth wait, 42501, no policy audit)')
        restore()
        before=int(policy_audits())
        compete(make_writer(writer_name),change)
        assert int(policy_audits())==before+1
        assert_denied_after_revocation()
        print(writer_name+'_before_'+change_name+': PASS (first write retained, later read 42501)')

# A is admin; H is owner so the real product membership command may target A.
raw_suspend=f"update public.organization_memberships set status='suspended' where organization_id='{org}' and user_id='{actor}';"
raw_delete=f"delete from public.organization_memberships where organization_id='{org}' and user_id='{actor}';"
member_rpc=f"set local role authenticated;select public.set_workspace_member_v1('{actor}','admin','suspended');"
principal=run(f"select id from private.principals where organization_id='{org}' and user_id='{actor}';")
principal_rpc=f"set local role authenticated;select public.revoke_principal_access_v1('{principal}');"
membership_changes=[('direct_membership_suspend',raw_suspend,False),('direct_membership_delete',raw_delete,False),
 ('workspace_member_rpc',member_rpc,False),('principal_revocation_rpc',principal_rpc,True)]
for writer_name in writers:
    for name,revoke,uses_advisory in membership_changes:
        restore()
        before=int(policy_audits())
        compete(revoke,make_writer(writer_name),'capital_project_review_management_denied' if uses_advisory else 'policy_changed',
          first_actor=other,wait_required=uses_advisory,expected_state='42501' if uses_advisory else '40001')
        assert int(policy_audits())==before
        assert_denied_after_revocation()
        print(name+'_before_'+writer_name+': PASS (exact SQLSTATE, refused, no policy audit)')
        restore()
        before=int(policy_audits())
        compete(make_writer(writer_name),revoke,second_actor=other)
        assert int(policy_audits())==before+1
        assert_denied_after_revocation()
        assert run(f"select count(*) from public.organization_memberships where organization_id='{org}' and user_id='{actor}' and status='active';")=='0'
        print(writer_name+'_before_'+name+': PASS (observed wait, first write retained, membership revoked)')

# Resource authority is meaningful for the project setters. Organization policy
# is governed by organization administration, not by rights on this one project.
# READ can be removed through allowed purposes while MANAGE remains for analysis.
# Removing the MANAGE allow via the real product RPC preserves explicit READ.
resource_changes=[
 ('read_purpose_revocation',f"set local role authenticated;select public.set_resource_purposes_v1('{work}',array['analysis']);",False),
 ('manage_allow_revocation',f"set local role authenticated;select public.set_resource_policy_grant_v1('{work}','{actor}',null,'manage','allow',false,null);",True)]
for writer_name in ['project_v1','project_v2']:
    for name,revoke,read_survives in resource_changes:
        restore()
        before=int(policy_audits())
        compete(revoke,make_writer(writer_name),'capital_project_review_management_denied',first_actor=other,expected_state='42501')
        assert int(policy_audits())==before
        if read_survives:
            assert context()['can_manage'] is False
        else:
            assert_denied_after_revocation()
        print(name+'_before_'+writer_name+': PASS (observed advisory wait, 42501, no policy audit)')
        restore()
        before=int(policy_audits())
        compete(make_writer(writer_name),revoke,second_actor=other)
        assert int(policy_audits())==before+1
        if read_survives:
            assert context()['can_manage'] is False
        else:
            assert_denied_after_revocation()
        print(writer_name+'_before_'+name+': PASS (observed wait, write retained, resource restriction effective)')

restore()
print('regime concurrency suite: PASS (69 two-session cases, disposable local fixture only)')
