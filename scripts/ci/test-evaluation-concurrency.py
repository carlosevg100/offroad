#!/usr/bin/env python3
"""Two real connections, disposable CI only: a held evaluation reservation against assurance revocation.

Whatever the order, an evaluation whose assurance is revoked never publishes success: either the
reservation is denied and journaled with nothing reserved, or the reservation lands first and the
revalidation at publication turns the result into partial with transport_denied. The budget never
goes negative. Every session sets client_min_messages=warning, so no NOTICE can precede the barrier
marker or the JSON a session prints.
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
    raise SystemExit('Evaluation concurrency requires the disposable local CI database')
command = ['psql', url, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1']
QUIET = 'set client_min_messages=warning;'


def raw(sql):
    return subprocess.run(command, input=QUIET + sql, text=True, capture_output=True, timeout=40)


def run(sql):
    r = raw(sql)
    if r.returncode:
        raise AssertionError(r.stderr)
    return r.stdout.strip()


def json_line(output):
    return json.loads(next(line for line in output.splitlines() if line.startswith('{')))


def expand(path):
    return re.sub(r'^\\ir (.+)$', lambda m: expand(path.parent / m[1].strip()), path.read_text(), flags=re.M)


def compete(first_sql, second_sql):
    """The second session must visibly wait for a lock, then complete after the first commits."""
    first = second = None
    try:
        first = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        first.stdin.write(QUIET + '\\o /dev/null\nbegin;' + first_sql + '\n\\echo EVALUATION_LOCK_HELD\n')
        first.stdin.flush()
        deadline = time.monotonic() + 20
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0 or not select.select([first.stdout], [], [], remaining)[0]:
                raise AssertionError('First evaluation command did not reach its barrier')
            line = first.stdout.readline().strip()
            if line == 'EVALUATION_LOCK_HELD':
                break
            if first.poll() is not None:
                raise AssertionError(line)
        second = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        second.stdin.write(QUIET + "set application_name='offroad_evaluation_contender';begin;" + second_sql + 'commit;\n')
        second.stdin.close()
        second.stdin = None
        deadline = time.monotonic() + 20
        while run("select count(*) from pg_stat_activity where application_name='offroad_evaluation_contender' and wait_event_type='Lock';") != '1':
            if time.monotonic() >= deadline or second.poll() is not None:
                raise AssertionError('Second evaluation command did not wait on the lock')
            time.sleep(.05)
        first.stdin.write('commit;\n')
        first.stdin.close()
        first.stdin = None
        a = first.communicate(timeout=20)[0]
        b = second.communicate(timeout=20)[0]
        assert first.returncode == 0, a
        assert second.returncode == 0, b
        return b
    finally:
        for process in (first, second):
            if process is not None and process.poll() is None:
                process.kill()
                process.wait(timeout=10)


class Scope:
    """One committed synthetic evaluation, claimed by the synthetic worker, per race."""

    def __init__(self, number):
        prefix = f'e5a1{number}000'
        self.execution = prefix + '-0000-4000-c000-000000000001'
        self.operation = prefix + '-0000-4000-d000-000000000001'
        self.assurance = prefix + '-0000-4000-b000-000000000001'
        self.token = 'synthetic-evaluation-worker-token-' + prefix
        self.worker = prefix + '-0000-4000-8000-000000000006'
        self.route = json.dumps({'provider': 'openai', 'model': 'synthetic-evaluation-model', 'accountRef': 'synthetic-evaluation-account-' + prefix,
                                 'projectRef': 'synthetic-evaluation-project', 'credentialBinding': 'synthetic-evaluation-binding',
                                 'endpoint': 'https://api.openai.com/v1/responses', 'region': 'global', 'toolVersion': 'synthetic-gateway.v1'})
        fixture = expand(ROOT / 'supabase/tests/support/governed_evaluation_fixture.sql').replace('e5a10000', prefix)
        run('begin;' + fixture
            + f"select pg_temp.request_evaluation(pg_temp.evaluation_contract('{self.execution}'));"
            + f"select private.release_governed_evaluation_transport_v1('{prefix}-0000-4000-a000-000000000099',true,'{prefix}-0000-4000-8000-000000000002','Synthetic concurrency release of the evaluation transport');"
            + 'commit;')
        self.job = run(f"select id from public.processing_jobs where evaluation_id='{self.execution}';")
        self.claim = json_line(run('begin;' + self.as_worker() + f"select private.claim_governed_evaluation_v1('{self.token}','{self.job}',60);commit;"))
        assert self.claim['claimed'] is True, self.claim
        self.input_hash = run(f"select snapshot_fingerprint from private.governed_evaluations where id='{self.execution}';")

    def as_worker(self):
        return f"select set_config('request.jwt.claim.sub','{self.worker}',true);"

    def lease(self):
        return f"'{self.job}','{self.claim['capability']}','{self.claim['leaseId']}'"

    def reserve(self):
        return (self.as_worker() + f"select private.worker_reserve_evaluation_operation_v1({self.lease()},'{self.operation}',"
                + f"'{self.route}'::jsonb,'[\"inference\"]'::jsonb,400,1);")

    def revoke(self, reason):
        return f"select private.revoke_provider_processing_assurance_v1('{self.assurance}','{reason}');"

    def commit(self, outcome, reason):
        return (self.as_worker() + f"select private.worker_commit_evaluation_v1({self.lease()},'{self.claim['contractFingerprint']}',"
                + f"'{self.input_hash}','{{\"scores\":{{}}}}','{outcome}','{reason}');")

    def refuses_success(self):
        denied = raw('begin;' + self.commit('succeeded', 'evaluated') + 'commit;')
        assert denied.returncode != 0 and 'evaluation_partial_result_required' in denied.stderr, denied.stderr
        committed = json_line(run('begin;' + self.commit('partial', 'transport_denied') + 'commit;'))
        assert committed['committed'] is True and committed['outcome'] == 'partial' and committed['reason'] == 'transport_denied', committed
        assert run(f"select string_agg(outcome||':'||reason,',') from private.evaluation_result_receipts where evaluation_id='{self.execution}';") == 'partial:transport_denied'

    def budget(self):
        return run(f"select spent_microusd||':'||reserved_microusd||':'||spent_calls||':'||reserved_calls||':'||"
                   + f"(least(spent_microusd,reserved_microusd,spent_calls,reserved_calls)>=0 and spent_microusd+reserved_microusd<=1000)::text "
                   + f"from private.evaluation_budget_accounts where evaluation_id='{self.execution}';")

    def decisions(self):
        return run(f"select string_agg(allowed::text,',' order by created_at,id) from private.processing_eligibility_decisions where job_id='{self.job}';")


# 1. The reservation holds the shared assurance lock; the revocation waits for it and lands after.
first = Scope(1)
compete(first.reserve(), first.revoke('Synthetic withdrawal while a reservation is held'))
assert run(f"select state from private.evaluation_operation_receipts where evaluation_id='{first.execution}';") == 'reserved'
assert run(f"select revoked_at is not null from private.provider_processing_assurances where id='{first.assurance}';") == 't'
settled = json_line(run('begin;' + first.as_worker() + f"select private.worker_settle_evaluation_operation_v1({first.lease()},'{first.operation}','settled',300,1);commit;"))
assert settled['settled'] is True, settled
first.refuses_success()
assert first.budget() == '300:0:1:0:true', first.budget()
assert first.decisions() == 'true,false', first.decisions()
print('evaluation_reservation_first: PASS (observed assurance wait, reservation kept, publication revalidated to partial transport_denied, budget never negative)')

# 2. The revocation holds the exclusive assurance lock; the reservation waits and is denied, journaled.
second = Scope(2)
output = compete(second.revoke('Synthetic withdrawal held against a reservation'), second.reserve())
reservation = json_line(output)
assert reservation['allowed'] is False and reservation['mayExecute'] is False and reservation.get('decisionId'), reservation
assert run(f"select count(*) from private.evaluation_operation_receipts where evaluation_id='{second.execution}';") == '0'
assert second.budget() == '0:0:0:0:true', second.budget()
assert second.decisions() == 'false', second.decisions()
second.refuses_success()
print('evaluation_revocation_first: PASS (observed assurance wait, reservation denied and journaled, nothing reserved, partial transport_denied)')
