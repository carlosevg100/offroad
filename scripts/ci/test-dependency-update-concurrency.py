#!/usr/bin/env python3
"""Two real sessions, disposable CI only: two changes to one work end in one open dependency-update request.

Stage 18, increment 3A. One synthetic execution pins a platform release; two newer releases of the
same procedure are published, so the organization receives two method_release events. The first
session applies the dependency effect of one event and holds its transaction open; the second session
applies the other event and must visibly wait for the per-work lock; once the first commits, the
second merges into the request the first opened instead of opening another.
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
    raise SystemExit('Dependency update concurrency requires the disposable local CI database')
command = ['psql', url, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1']
org = 'a4192000-0000-4000-9000-000000000001'
work = 'a4192000-0000-4000-9000-000000000002'
execution = 'a4193000-0000-4000-9000-000000000002'
method = 'synthetic-execution-dependency'


def run(sql):
    result = subprocess.run(command, input=sql, text=True, capture_output=True, timeout=40)
    if result.returncode:
        raise AssertionError(result.stderr)
    return result.stdout.strip()


def expand(path):
    return re.sub(r'^\\ir (.+)$', lambda m: expand(path.parent / m[1].strip()), path.read_text(), flags=re.M)


def release(version):
    """A newer published platform release of the same procedure, as the operator records it."""
    return ("insert into private.platform_capability_releases(capability_key,released,exposure,method_id,method_version,method_maturity,approved_by,approved_at,approval_source)"
            f" values('{method}-{version}',false,'internal','{method}','{version}','tested','Synthetic approver',current_date,'Synthetic disposable CI fixture');"
            "insert into private.platform_method_releases(id,method_id,version,manifest_hash,manifest,components,evidence,approval,capability_key)"
            f" select '{method}-{version}','{method}','{version}',repeat('9',64),manifest,components,evidence,approval,'{method}-{version}'"
            f" from private.platform_method_releases where id='{method}-test-v1';")


# Other concurrent suites keep their own immutable fixtures until stack teardown.
fixture = expand(ROOT / 'supabase/tests/support/execution_commands_fixture.sql')
fixture = fixture.replace('a11b0000', 'a4192000').replace('a4171000', 'a4193000').replace('a11b-', 'a4192-').replace('synthetic-execution', method)
run('begin;' + fixture + "select private.request_work_execution_v1('a4193000-0000-4000-9000-000000000001',contract::text,'{}') from execution_fixture;"
    + release('test-v2') + release('test-v3') + 'commit;')
events = run(f"select string_agg(id::text,',' order by aggregate_version) from private.domain_events where organization_id='{org}' and aggregate_kind='method_release';").split(',')
assert len(events) == 2, events

first = second = None
try:
    first = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    first.stdin.write(f"\\o /dev/null\nbegin;select private.apply_dependency_event_v1('{org}','{events[0]}');\n\\echo DEPENDENCY_LOCK_HELD\n")
    first.stdin.flush()
    deadline = time.monotonic() + 20
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0 or not select.select([first.stdout], [], [], remaining)[0]:
            raise AssertionError('First dependency effect did not reach its barrier')
        line = first.stdout.readline().strip()
        if line == 'DEPENDENCY_LOCK_HELD':
            break
        if first.poll() is not None:
            raise AssertionError(line)
    second = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    second.stdin.write(f"set application_name='offroad_dependency_contender';begin;select private.apply_dependency_event_v1('{org}','{events[1]}');commit;\n")
    second.stdin.close()
    second.stdin = None
    deadline = time.monotonic() + 20
    while run("select count(*) from pg_stat_activity where application_name='offroad_dependency_contender' and wait_event_type='Lock';") != '1':
        if time.monotonic() >= deadline or second.poll() is not None:
            raise AssertionError('Second dependency effect did not wait on the work lock')
        time.sleep(.05)
    first.stdin.write('commit;\n')
    first.stdin.close()
    first.stdin = None
    first_output = first.communicate(timeout=20)[0]
    second_output = second.communicate(timeout=20)[0]
    assert first.returncode == 0, first_output
    assert second.returncode == 0, second_output
finally:
    for process in (first, second):
        if process is not None and process.poll() is None:
            process.kill()
            process.wait(timeout=10)

state = run(
    "select count(*)||':'||min(r.revision)||':'||min(jsonb_array_length(r.payload->'events'))||':'||min(r.payload->'affectedExecutionIds'->>0)"
    "||':'||bool_and(r.payload->'events' @> jsonb_build_array(jsonb_build_object('eventId','" + events[0] + "'),jsonb_build_object('eventId','" + events[1] + "')))"
    "||':'||bool_and(r.payload_fingerprint=private.continuation_fingerprint_v1(r.payload))"
    f" from public.work_continuation_requests r where r.organization_id='{org}' and r.work_id='{work}' and r.kind='dependency_update' and r.status='open';")
assert state == f'1:2:2:{execution}:true:true', state
facts = run(f"select count(*)||':'||count(distinct event_id) from private.execution_invalidations where organization_id='{org}' and execution_id='{execution}' and reason_class='method_update';")
assert facts == '2:2', facts
proposals = run(f"select count(*) from public.work_milestones where organization_id='{org}' and work_id='{work}' and kind='continuation_proposed';")
assert proposals == '1', proposals
print('dependency_update_concurrency: PASS (observed work lock wait, one open request with both events, one proposal, one fact per event)')
