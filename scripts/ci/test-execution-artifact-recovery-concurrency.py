#!/usr/bin/env python3
"""Two real sessions: recover a persisted result without executing it again."""
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
    raise SystemExit('Recovery concurrency requires the disposable local CI database')
command = ['psql', url, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1']
actor = 'a5207000-0000-4000-8000-000000000001'
other = 'a5207000-0000-4000-8000-000000000002'
org = 'a5207000-0000-4000-9000-000000000001'
work = 'a5207000-0000-4000-9000-000000000002'


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
        barrier_output = []
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0 or not select.select([first.stdout], [], [], remaining)[0]:
                raise AssertionError('First review transaction did not reach its barrier')
            line = first.stdout.readline().strip()
            barrier_output.append(line)
            if line == 'REVIEW_LOCK_HELD':
                break
            if first.poll() is not None:
                raise AssertionError('\n'.join(barrier_output))
        second = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        second.stdin.write("set application_name='offroad_recovery_contender';begin;" + authorized(second_sql, second_actor) + 'commit;\n')
        second.stdin.close()
        second.stdin = None
        deadline = time.monotonic() + 20
        while run("select count(*) from pg_stat_activity where application_name='offroad_recovery_contender' and wait_event_type='Lock';") != '1':
            if time.monotonic() >= deadline or second.poll() is not None:
                raise AssertionError('Second transaction did not visibly wait for recovery authority')
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


# A separate synthetic namespace; never targets staging or production.
fixture = expand(ROOT / 'supabase/tests/support/execution_artifact_setup.sql')
for old, new in [('a11b0000', 'a5207000'), ('a4171000', 'a5207100'), ('a9990000', 'a5207200'), ('a3300000', 'a5207300')]:
    fixture = fixture.replace(old, new)
fixture = fixture.replace('a11b-', 'a5207-').replace('synthetic-execution', 'synthetic-recovery-execution')
fixture = fixture.replace('synthetic-policy-worker-fixture-token-v1', 'synthetic-recovery-worker-token-v1')
fixture = fixture.replace('offroad:test:artifact-producers-source:', 'offroad:test:artifact-recovery-source:')
setup = f"""
select public.grant_resource_access_v1('{work}','{other}','work');
create function pg_temp.fail_projection() returns trigger language plpgsql as $$begin raise exception 'synthetic_recovery_projection_failure';end $$;
create trigger synthetic_recovery_projection_failure before insert on public.artifact_revisions for each row execute function pg_temp.fail_projection();
"""
# Each race gets a separate immutable result and a separate logical source.
executions = [f'a5207400-0000-4000-9000-{n:012d}' for n in range(1, 9)]
for n, execution in enumerate(executions):
    setup += f"select pg_temp.commit_execution('{execution}',current_setting('test.producers.packet'),pg_temp.source_version('recovery-{n}'));"
setup += 'drop trigger synthetic_recovery_projection_failure on public.artifact_revisions;'
run('begin;' + fixture + setup + 'commit;')


def recover(execution, replay=False):
    fingerprint = run(f"select result_fingerprint from private.execution_result_receipts where execution_id='{execution}';")
    replay_check = " or result->>'replayed' is distinct from 'true'" if replay else ""
    return f"set local role authenticated;do $$declare result jsonb;begin result:=public.recover_execution_result_artifact_v1('{execution}','{fingerprint}');if result->>'recorded' is distinct from 'true'{replay_check} then raise exception 'recovery did not succeed: %',result;end if;end $$;"


def revisions(execution):
    return run(f"select count(*) from public.artifact_revisions where manifest#>>'{{execution,executionId}}'='{execution}';")


def rights_change(execution):
    source = run(f"select source_version_id from private.execution_source_bindings where execution_id='{execution}';")
    revision = run(f"select max(revision) from private.source_rights_versions where source_version_id='{source}';")
    return f"set local role authenticated;select public.set_source_rights_v1('{source}',{revision},array['process'],array['analysis'],null,null,'{source}',repeat('a',64));"


def counts():
    return run(f"select (select count(*) from public.processing_jobs where organization_id='{org}')||':'||(select count(*) from private.execution_result_receipts where organization_id='{org}')||':'||(select count(*) from private.execution_operation_receipts where organization_id='{org}')||':'||(select coalesce(sum(spent_microusd),0) from private.execution_budget_accounts where organization_id='{org}');")


before = counts()
compete(recover(executions[0]), recover(executions[0], replay=True), second_actor=other)
assert revisions(executions[0]) == '1'
assert run(f"select count(*) from public.audit_events where resource_id='{executions[0]}' and action='execution_artifact_recovered';") == '1'
print('recovery_concurrent_retries: PASS (observed work wait, one revision, one recovery audit)')

compete(rights_change(executions[1]), recover(executions[1]), 'execution_recovery_access_denied', second_actor=other)
assert revisions(executions[1]) == '0'
print('recovery_source_revocation_first: PASS (observed policy wait, denied, result retained)')
compete(recover(executions[2]), rights_change(executions[2]))
assert revisions(executions[2]) == '1'
state = run('begin;' + authorized(f"set local role authenticated;select public.read_work_execution_v2('{executions[2]}')#>>'{{artifactProjection,state}}';", other) + 'rollback;')
assert state.endswith('restricted'), state
print('recovery_first_source_revocation: PASS (revocation waited, stored projection restricted afterwards)')

compete(f"update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id='{other}';", recover(executions[3]), 'review_work_access_required', second_actor=other)
assert revisions(executions[3]) == '0'
run(f"update auth.users set banned_until=null where id='{other}';")  # isolated disposable fixture only
print('recovery_suspension_first: PASS (observed account wait, denied)')
compete(authorized(recover(executions[3]), other), f"update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id='{other}';")
assert revisions(executions[3]) == '1'
run(f"update auth.users set banned_until=null where id='{other}';")
print('recovery_first_suspension: PASS (suspension waited for recovery transaction)')

principal = run(f"select id from private.principals where organization_id='{org}' and user_id='{other}' and kind='human';")
revoke = f"set local role authenticated;select public.revoke_principal_access_v1('{principal}');"
compete(revoke, recover(executions[4]), 'review_work_access_required', second_actor=other)
assert revisions(executions[4]) == '0'
# Reset only these synthetic local rows to test the opposite interleaving; no production path.
run(f"update private.principals set revoked_at=null where id='{principal}';update public.organization_memberships set status='active' where organization_id='{org}' and user_id='{other}';")
# Membership suspension also revokes resource grants; restoring identity alone must not restore access.
assert run('begin;' + authorized(f"select private.can_access_resource_v1('{org}','{work}','work');", other) + 'rollback;').endswith('f')
run('begin;' + authorized(f"set local role authenticated;select public.grant_resource_access_v1('{work}','{other}','work');") + 'commit;')
compete(authorized(recover(executions[5]), other), revoke)
assert revisions(executions[5]) == '1'
print('recovery_principal_revocation_both_orders: PASS (policy wait, denial or prior projection preserved)')

# The commit producer and human recovery share the artifact lock and deterministic identity.
job = run(f"select id from public.processing_jobs where execution_id='{executions[6]}';")
compete(f"do $$begin if private.record_execution_result_artifact_v1('{org}','{executions[6]}','{job}')->>'recorded' is distinct from 'true' then raise exception 'commit producer failed';end if;end $$;", recover(executions[6], replay=True))
assert revisions(executions[6]) == '1'
print('recovery_commit_producer_race: PASS (observed artifact wait, one exact projection)')
assert counts() == before
print('recovery_accounting_unchanged: PASS (jobs, operations, result receipts and spend unchanged)')
