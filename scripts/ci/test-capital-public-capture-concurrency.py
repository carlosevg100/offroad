#!/usr/bin/env python3
"""Real two-session capture races, confined to the disposable local CI database.

This suite tests the metadata-only foundation, never claims byte/artifact replay.
Committed synthetic fixtures have their own UUIDs, token, names and emails and
are left for stack teardown. Temporary fixture triggers are removed before commit.
"""
import json
import os
from pathlib import Path
import re
import select
import subprocess
import sys
import time
from urllib.parse import urlparse


ROOT = Path(os.environ.get('OFFROAD_REPOSITORY_ROOT', Path(__file__).resolve().parents[2])).resolve()
ACTOR = 'a63c1000-0000-4000-8000-000000000001'
ORG = 'a63c1000-0000-4000-9000-000000000001'
TOKEN = 'synthetic-capital-capture-concurrency-worker-token-v1'
CAPTURE_TABLES = ('capital_public_input_snapshots', 'capital_public_deliveries',
                  'capital_public_delivery_licenses', 'capital_public_delivery_license_pins')


def expand(path):
    path = path.resolve()
    if ROOT not in path.parents:
        raise AssertionError('Fixture include escaped the repository')
    return re.sub(r'^\\ir (.+)$', lambda match: expand(path.parent / match[1].strip()),
                  path.read_text(), flags=re.M)


def fixture_sql():
    """Own bounded setup, using the base suite's real start/approval/claim helpers.

    Deliberately independent of the base test's DO blocks: its publisher/license
    and rollback-only fake snapshot are unrelated to these lock races. No extra
    publisher or fake snapshot is committed to the shared disposable stack.
    """
    support = ROOT / 'supabase/tests/support'
    includes = '\n'.join(expand(support / name) for name in
                         ('legacy_workspace_capabilities.sql', 'legacy_persistent_work_fixture.sql',
                          'provider_research_plan_snapshot.sql', 'execution_approval.sql'))
    setup = """
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous) values
('10000000-0000-4000-8000-000000000981','authenticated','authenticated','capture-owner@example.invalid','{"provider":"email","providers":["email"]}','{}',now(),now(),false,false);
insert into public.organizations(id,organization_type,name,created_by) values
('20000000-0000-4000-8000-000000000981','originator','Synthetic capture A','10000000-0000-4000-8000-000000000981');
insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values
('20000000-0000-4000-8000-000000000981','10000000-0000-4000-8000-000000000981','owner','active',now());
insert into public.onboarding_progress(organization_id,user_id,journey,current_step) values
('20000000-0000-4000-8000-000000000981','10000000-0000-4000-8000-000000000981','originator','organization');
insert into public.funds(id,organization_id,name,strategy,created_by) values
('40000000-0000-4000-8000-000000000981','20000000-0000-4000-8000-000000000981','Synthetic capture fund','credit','10000000-0000-4000-8000-000000000981');
insert into public.fund_directory(id,legal_name,kind,status,claimed_by_organization_id,claimed_at) values
('50000000-0000-4000-8000-000000000981','Synthetic capture directory','credit_fund','registered','20000000-0000-4000-8000-000000000981',now());
create temp table capture_job_fixture(job_id uuid, capability text, capture_id uuid);
grant all on capture_job_fixture to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000981","role":"authenticated"}',true);
do $$ declare plan jsonb:=pg_temp.provider_research_plan_fixture(); result jsonb; request uuid:=gen_random_uuid(); begin
 perform pg_temp.legacy_advisor_result(public.start_advisor_project_v1(request,'pt-BR','Synthetic capture',plan#>>'{job,id}',
  'Pesquise financiadores para a organização.','public_information',plan));
 result:=public.start_provider_research_project_v1(request,'pt-BR','Synthetic capture','Pesquise financiadores para a organização.',plan,null);
 insert into pg_temp.capture_job_fixture(job_id) values((result->>'research_job_id')::uuid);
end $$;
reset role;
insert into private.worker_tokens(label,token_sha256,execution_account_user_id) values
('synthetic-capture-worker',extensions.digest(repeat('z',64),'sha256'),'10000000-0000-4000-8000-000000000981');
do $$ declare job uuid; claim jsonb; begin
 select job_id into strict job from pg_temp.capture_job_fixture;
 perform pg_temp.fixture_approve_execution(job);
 update public.processing_jobs set available_at=now()-interval '1 day' where id=job;
 claim:=public.worker_claim_job_v3(repeat('z',64),600);
 if claim->>'job_id' is distinct from job::text then raise exception 'capture fixture claim mismatch'; end if;
 update pg_temp.capture_job_fixture set capability=claim->>'capability_token';
end $$;
"""
    namespace = {
        '10000000-0000-4000-8000-000000000981': ACTOR,
        '10000000-0000-4000-8000-000000000982': 'a63c1000-0000-4000-8000-000000000002',
        '20000000-0000-4000-8000-000000000981': ORG,
        '20000000-0000-4000-8000-000000000982': 'a63c2000-0000-4000-9000-000000000001',
        '40000000-0000-4000-8000-000000000981': 'a63c1000-0000-4000-9000-000000000003',
        '50000000-0000-4000-8000-000000000981': 'a63c1000-0000-4000-9000-000000000004',
        'a3300000': 'a63c9900',
        'synthetic-policy-worker-fixture-token-v1': 'synthetic-capital-capture-policy-token-v1',
        'Synthetic legacy policy worker': 'Synthetic capture concurrency legacy worker',
        'synthetic-capture-worker': 'synthetic-capture-concurrency-worker',
        "repeat('z',64)": "'" + TOKEN + "'",
        'capture-owner@example.invalid': 'capture-concurrency-owner@example.invalid',
        'capture-foreign@example.invalid': 'capture-concurrency-foreign@example.invalid',
        'Synthetic capture': 'Synthetic capture concurrency',
        'zz_synthetic_legacy_workspace_capabilities': 'zz_capture_concurrency_workspace_capabilities',
        'zz_synthetic_policy_lease': 'zz_capture_concurrency_policy_lease',
    }
    sql = includes + '\n' + setup
    for old, new in namespace.items():
        sql = sql.replace(old, new)
    if 'execution_account_user_id' not in setup:
        raise AssertionError('Capture setup must explicitly bind the worker account')
    return sql + """
reset role;
drop trigger zz_capture_concurrency_workspace_capabilities on public.organizations;
drop trigger zz_capture_concurrency_policy_lease on public.processing_jobs;
commit;
select jsonb_build_object('job',j.id,'work',j.payload->>'capital_project_id',
 'capability',f.capability) from pg_temp.capture_job_fixture f
 join public.processing_jobs j on j.id=f.job_id;
"""


def assert_result(code, output, expected=None):
    # Deadlock, untranslated NOWAIT and timeout are failures even if another error follows.
    if re.search(r'ERROR:\s+(40P01|55P03|57014):', output):
        raise AssertionError('Deadlock, untranslated lock error or timeout: ' + output)
    if expected is None:
        if code != 0:
            raise AssertionError(output)
    else:
        state, message = expected
        if code == 0 or message not in output or not re.search(r'ERROR:\s+' + re.escape(state) + ':', output):
            raise AssertionError('Wrong refusal: ' + output)


class Harness:
    def __init__(self, url):
        if urlparse(url).hostname not in ('localhost', '127.0.0.1', '::1'):
            raise SystemExit('Capture concurrency requires the disposable local CI database')
        self.command = ['psql', url, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose']
        self.capability = ''
        self.sequence = 0

    def redact(self, output):
        return output.replace(self.capability, '<synthetic-capability>') if self.capability else output

    def run(self, sql):
        result = subprocess.run(self.command, input=sql, text=True, capture_output=True, timeout=30)
        assert_result(result.returncode, self.redact(result.stderr))
        return result.stdout.strip()

    def authorized(self, sql):
        claims = json.dumps({'sub': ACTOR, 'role': 'authenticated', 'aal': 'aal1'})
        headers = json.dumps({'x-offroad-workspace': ORG})
        return (f"select set_config('request.jwt.claim.sub','{ACTOR}',true);"
                f"select set_config('request.jwt.claims','{claims}',true);"
                f"select set_config('request.headers','{headers}',true);" + sql)

    def loader(self):
        return ("set local role authenticated;select public.worker_load_capital_project_capture_context_v1('"
                + self.job + "','" + self.capability + "');")

    def counts(self):
        parts = [f"(select count(*) from private.{table} where organization_id='{ORG}')" for table in CAPTURE_TABLES]
        parts.append(f"(select count(*) from public.audit_events where organization_id='{ORG}' and resource_type in "
                     "('capital_public_input_snapshots','capital_public_deliveries','capital_public_delivery_licenses','capital_public_delivery_license_pins'))")
        return self.run('select jsonb_build_array(' + ','.join(parts) + ');')

    def assert_metadata(self):
        self.run(f"""do $$ begin
         if exists(select 1 from private.capital_public_input_snapshots where organization_id='{ORG}' and state<>'unresolved')
          or exists(select 1 from private.capital_public_deliveries where organization_id='{ORG}' and state<>'unresolved')
          then raise exception 'metadata capture promoted state'; end if;
         if exists(select 1 from information_schema.columns where table_schema='private'
          and table_name in ('capital_public_input_snapshots','capital_public_deliveries','capital_public_delivery_licenses','capital_public_delivery_license_pins')
          and column_name in ('context','payload','origin_refs','raw_body','content'))
          then raise exception 'metadata foundation retained bytes'; end if;
        end $$;""")

    def held(self, sql):
        process = subprocess.Popen(self.command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                   stderr=subprocess.STDOUT, text=True, bufsize=1)
        process.stdin.write("\\o /dev/null\nset statement_timeout='10s';set lock_timeout='5s';begin;"
                            + self.authorized(sql) + '\n\\echo CAPTURE_LOCK_HELD\n')
        process.stdin.flush()
        if not select.select([process.stdout], [], [], 12)[0]:
            process.kill()
            process.wait(timeout=5)
            raise AssertionError('Capture holder did not reach its barrier')
        line = process.stdout.readline().strip()
        if line != 'CAPTURE_LOCK_HELD':
            process.kill()
            rest = process.communicate(timeout=5)[0]
            raise AssertionError(self.redact(line + rest))
        return process

    @staticmethod
    def release(process, sql='commit;'):
        process.stdin.write(sql + '\n')
        process.stdin.close()
        process.stdin = None
        output = process.communicate(timeout=12)[0]
        return process.returncode, output

    def compete(self, name, first_sql, second_sql, expected=None, wait=False):
        first = second = None
        before = self.counts()
        self.sequence += 1
        application = f'offroad_capture_contender_{self.sequence}'
        try:
            first = self.held(first_sql)
            second = subprocess.Popen(self.command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                      stderr=subprocess.STDOUT, text=True)
            second.stdin.write(f"set application_name='{application}';set statement_timeout='10s';set lock_timeout='5s';begin;"
                               + self.authorized(second_sql) + 'commit;\n')
            second.stdin.close()
            second.stdin = None
            if wait:
                deadline = time.monotonic() + 3
                while self.run(f"select count(*) from pg_stat_activity where application_name='{application}' and wait_event_type='Lock';") != '1':
                    if second.poll() is not None or time.monotonic() >= deadline:
                        raise AssertionError('Contender did not visibly wait for the capture transaction')
                    time.sleep(.05)
            else:
                # It must refuse before the holder releases anything; waiting is a regression.
                output = second.communicate(timeout=3)[0]
                assert_result(second.returncode, self.redact(output), expected)
                if self.counts() != before:
                    raise AssertionError('Rejected capture persisted metadata or audit')
            code, output = self.release(first)
            assert_result(code, self.redact(output))
            if wait:
                output = second.communicate(timeout=12)[0]
                assert_result(second.returncode, self.redact(output), expected)
            self.assert_metadata()
            print(name + ': PASS (two sessions, observed ordering, no deadlock/timeout)')
        finally:
            for process in (first, second):
                if process is not None and process.poll() is None:
                    process.kill()
                    process.wait(timeout=5)

    def extend_lease(self, seconds):
        self.run(f"update public.processing_jobs set lease_expires_at=clock_timestamp()+interval '{seconds} seconds' "
                 f"where id='{self.job}' and organization_id='{ORG}';")

    def wait_for_expiration(self):
        deadline = time.monotonic() + 10
        while self.run(f"select lease_expires_at<=clock_timestamp() from public.processing_jobs where id='{self.job}';") != 't':
            if time.monotonic() > deadline:
                raise AssertionError('Synthetic lease did not expire')
            time.sleep(.05)

    def assert_captured(self):
        result = json.loads(self.run('begin;' + self.authorized(self.loader()) + 'commit;').splitlines()[-1])
        capture = result['capture']
        if result.get('context', 'missing') is not None or capture['state'] != 'unresolved' \
                or capture['schemaVersion'] != 'capital-public-capture.v1':
            raise AssertionError('Public loader did not return metadata-only unresolved capture')
        expected = [1, 0, 0, 0, 1]
        if json.loads(self.counts()) != expected:
            raise AssertionError('Loader/replay did not preserve one immutable snapshot and one audit')

    def expired_transaction(self):
        first = None
        before = self.counts()
        self.extend_lease(6)
        try:
            # Real public loader acquired its frontier while valid. Transaction now()
            # stays in the past; replay in that same transaction must still refuse.
            first = self.held(self.loader())
            self.wait_for_expiration()  # A second connection observes the real clock.
            code, output = self.release(first, self.loader() + 'commit;')
            assert_result(code, self.redact(output), ('42501', 'capital_capture_denied'))
            if self.counts() != before:
                raise AssertionError('Expired earlier-started transaction persisted metadata/audit')
            print('lease_expires_after_frontier_before_loader: PASS (real clock, old transaction denied)')
        finally:
            if first is not None and first.poll() is None:
                first.kill()
                first.wait(timeout=5)

    def main(self):
        data = json.loads(self.run('begin;' + fixture_sql()).splitlines()[-1])
        self.job, self.work, self.capability = data['job'], data['work'], data['capability']
        project_lock = f"select 1 from public.capital_projects where id='{self.work}' and organization_id='{ORG}' for no key update;"
        policy_lock = f"select pg_advisory_xact_lock(hashtextextended('resource-policy:'||'{ORG}',0));"
        for label, lock in [('project_row', project_lock), ('resource_policy', policy_lock)]:
            self.compete(label + '_before_loader', lock, self.loader(), ('40001', 'capital_capture_retry'))
            self.compete('loader_before_' + label, self.loader(), lock, wait=True)
        for version in (1, 2):
            if version == 1:
                setter = f"set local role authenticated;select public.set_capital_project_review_policy_v1('{self.work}','allowed');"
            else:
                context = json.loads(self.run('begin;' + self.authorized('set local role authenticated;'
                    + f"select public.read_capital_project_review_context_v2('{self.work}');") + 'commit;').splitlines()[-1])
                setter = (f"set local role authenticated;select public.set_capital_project_review_policy_v2('{self.work}',"
                          f"'allowed','not_required','{context['policy_fingerprint']}');")
            self.compete(f'project_policy_v{version}_before_loader', setter, self.loader(), ('40001', 'capital_capture_retry'))
            # Refresh CAS after the previous setter's committed write.
            if version == 2:
                context = json.loads(self.run('begin;' + self.authorized('set local role authenticated;'
                    + f"select public.read_capital_project_review_context_v2('{self.work}');") + 'commit;').splitlines()[-1])
                setter = (f"set local role authenticated;select public.set_capital_project_review_policy_v2('{self.work}',"
                          f"'allowed','not_required','{context['policy_fingerprint']}');")
            self.compete(f'loader_before_project_policy_v{version}', self.loader(), setter, wait=True)
        self.assert_captured()
        self.extend_lease(1)
        self.wait_for_expiration()
        self.compete('expired_lease_before_locked_project', project_lock, self.loader(), ('42501', 'capital_capture_denied'))
        self.expired_transaction()
        self.assert_metadata()
        # Stop this suite's expired lease from becoming a later suite's reclaimable job.
        self.run(f"update public.processing_jobs set status='cancelled',capability_sha256=null,lease_expires_at=null,leased_by=null "
                 f"where id='{self.job}' and organization_id='{ORG}';")
        print('capital_public_capture_concurrency: PASS (10 two-session cases, metadata only, local disposable fixture)')


def static_self_test():
    sql = fixture_sql()
    assert ACTOR in sql and ORG in sql and TOKEN in sql
    assert 'capture-owner@example.invalid' not in sql
    assert 'synthetic-policy-worker-fixture-token-v1' not in sql
    assert 'a3300000' not in sql
    assert '000000000983' not in sql  # No base-suite publisher or fake snapshot imported.
    assert '\\ir ' not in sql
    assert "pg_temp.fixture_approve_execution(job)" in sql
    assert 'public.worker_claim_job_v3' in sql
    assert 'drop trigger zz_capture_concurrency_workspace_capabilities' in sql
    assert 'drop trigger zz_capture_concurrency_policy_lease' in sql
    assert_result(1, 'ERROR:  40001: capital_capture_retry', ('40001', 'capital_capture_retry'))
    for output in ['ERROR:  40P01: deadlock detected', 'ERROR:  55P03: lock unavailable',
                   'ERROR:  57014: timeout', 'ERROR:  42501: capital_capture_retry']:
        try:
            assert_result(1, output, ('40001', 'capital_capture_retry'))
        except AssertionError:
            pass
        else:
            raise AssertionError('Error parser accepted a wrong SQLSTATE')
    for url in ['postgresql://localhost/db', 'postgresql://127.0.0.1/db', 'postgresql://[::1]/db']:
        Harness(url)
    try:
        Harness('postgresql://example.com/db')
    except SystemExit:
        pass
    else:
        raise AssertionError('Remote database accepted')
    print('capture concurrency static self-test: PASS (fixture namespace, SQLSTATE, local-only guard; no database executed)')


if __name__ == '__main__':
    if sys.argv[1:] == ['--self-test']:
        static_self_test()
    elif sys.argv[1:]:
        raise SystemExit('Usage: test-capital-public-capture-concurrency.py [--self-test]')
    else:
        Harness(os.environ['DATABASE_URL']).main()
