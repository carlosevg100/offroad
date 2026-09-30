#!/usr/bin/env python3
"""Real two-session retention/publisher/claim races on the disposable local stack.

Storage cleanup uses the companion HTTP test helper; no fake object rows are used.
"""
import importlib.util
import json
import os
from pathlib import Path
import select
import subprocess
import sys
import time
import uuid

ROOT = Path(os.environ.get('OFFROAD_REPOSITORY_ROOT', Path(__file__).resolve().parents[2])).resolve()
spec = importlib.util.spec_from_file_location('retention_storage', ROOT / 'scripts/ci/test-capital-public-retention-storage.py')
storage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(storage)
# Entire fixture namespace is distinct from the companion committed HTTP suite.
for name in ('PREFIX', 'ACTOR', 'ORG', 'PUBLISHER', 'PUBLISHER_ORG', 'PUBLISHER_WORK', 'POLICY'):
    setattr(storage, name, getattr(storage, name).replace('a63d', 'a63e'))
storage.EMAIL = 'capture-retention-races-owner@example.invalid'
storage.PUBLISHER_EMAIL = 'capture-retention-races-publisher@example.invalid'
storage.TOKEN += '-races'
storage.POLICY_REVISION += 1


class Races(storage.RetentionStorage):
    def prepare_sql(self, delivery, request):
        return f"""set local role authenticated;select public.worker_prepare_capital_public_payload_v1(
'{self.job}',{storage.literal(self.capability)},'{delivery['deliveryId']}','{request}',{storage.json_literal(delivery['payload'])});"""

    def count(self):
        return self.sql(f"""select jsonb_build_array(
(select count(*) from private.capital_public_payload_allocations where organization_id='{storage.ORG}'),
(select count(*) from private.capital_public_retained_payloads where organization_id='{storage.ORG}'),
(select count(*) from public.audit_events where organization_id='{storage.ORG}' and resource_type='capital_public_payload_allocations'));""")

    def race(self, label, first_sql, second_sql, expected=None, first_publisher=False,
             second_publisher=False, second_empty=False):
        first = second = None
        before = self.count()
        app = 'capture_retention_' + uuid.uuid4().hex
        def authorize(query, publisher):
            return self.authorized(query, storage.PUBLISHER, storage.PUBLISHER_ORG) if publisher else self.authorized(query)
        try:
            first = subprocess.Popen(self.command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT, text=True, bufsize=1)
            first.stdin.write("\\o /dev/null\nset statement_timeout='10s';set lock_timeout='5s';begin;"
                + authorize(first_sql, first_publisher) + '\n\\echo RETENTION_LOCK_HELD\n')
            first.stdin.flush()
            if not select.select([first.stdout], [], [], 12)[0]:
                raise AssertionError('Holder did not reach its lock barrier')
            line = first.stdout.readline().strip()
            if line != 'RETENTION_LOCK_HELD':
                raise AssertionError(self.redact(line))
            second = subprocess.Popen(self.command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT, text=True)
            second.stdin.write(f"set application_name='{app}';set statement_timeout='10s';set lock_timeout='5s';begin;"
                + authorize(second_sql, second_publisher) + 'commit;\n')
            second.stdin.close(); second.stdin = None
            if expected is not None or second_empty:
                output = second.communicate(timeout=3)[0]
                self.assert_result(second.returncode, output, expected)
                if self.count() != before:
                    raise AssertionError('Refused capture wrote allocation/receipt/audit')
                if second_empty and json.loads(output.strip().splitlines()[-1])['items'] != []:
                    raise AssertionError('Two purgers claimed the same uncommitted queue row')
            else:
                deadline = time.monotonic() + 3
                while self.sql(f"select count(*) from pg_stat_activity where application_name='{app}' and wait_event_type='Lock';") != '1':
                    if second.poll() is not None or time.monotonic() >= deadline:
                        raise AssertionError('Contender did not visibly wait')
                    time.sleep(.05)
            first.stdin.write('commit;\n'); first.stdin.close(); first.stdin = None
            self.assert_result(first.wait(timeout=12), first.stdout.read())
            if expected is None and not second_empty:
                output = second.communicate(timeout=12)[0]
                self.assert_result(second.returncode, output)
            print(label + ': PASS (two sessions, observed ordering, no deadlock/timeout)')
        finally:
            for process in (first, second):
                if process is not None and process.poll() is None:
                    process.kill(); process.wait(timeout=5)

    def assert_result(self, code, output, expected=None):
        # Reuse the exact SQLSTATE parser, never treat a40P01/55P03 as safe retry.
        capture_spec = importlib.util.spec_from_file_location('capture_parser', ROOT / 'scripts/ci/test-capital-public-capture-concurrency.py')
        capture = importlib.util.module_from_spec(capture_spec); capture_spec.loader.exec_module(capture)
        capture.assert_result(code, self.redact(output), expected)

    def allocation(self, delivery, request):
        result = self.prepare(delivery, request)
        if result['replayed'] is not True:
            raise AssertionError('Committed race result was not recoverable by exact request')
        return result

    def main(self):
        self.setup()
        try:
            self.configure()
            for first_capture in (False, True):
                delivery = self.delivery('policy-race-' + str(first_capture)); request = str(uuid.uuid4())
                prepare = self.prepare_sql(delivery, request)
                policy = f"select pg_advisory_xact_lock(hashtextextended('resource-policy:'||'{storage.PUBLISHER_ORG}',0));"
                if first_capture:
                    self.race('prepare_before_publisher_policy', prepare, policy, second_publisher=True)
                else:
                    self.race('publisher_policy_before_prepare', policy, prepare,
                        ('40001', 'capital_capture_retry'), first_publisher=True)
                    self.prepare(delivery, request)
                allocation = self.allocation(delivery, request)
                self.clean(delivery, allocation)

            for first_capture in (False, True):
                delivery = self.delivery('binding-race-' + str(first_capture)); request = str(uuid.uuid4())
                prepare = self.prepare_sql(delivery, request)
                revoke = f"update public.source_bindings set revoked_at=clock_timestamp() where organization_id='{storage.PUBLISHER_ORG}' and id='{delivery['binding']}';"
                if first_capture:
                    self.race('prepare_before_binding_revocation', prepare, revoke, second_publisher=True)
                    self.prepare(delivery, request, ('42501', 'capital_capture_retention_denied'))
                    row = json.loads(self.sql(f"select jsonb_build_object('allocationId',id,'bucket',bucket_id,'path',object_path) from private.capital_public_payload_allocations where organization_id='{storage.ORG}' and request_id='{request}';"))
                    ticket = self.ticket(row); self.erase(ticket); self.ack(ticket)
                else:
                    self.race('binding_revocation_before_prepare', revoke, prepare,
                        ('40001', 'capital_capture_retry'), first_publisher=True)
                    self.prepare(delivery, request, ('42501', 'capital_capture_retention_denied'))

            other_token = storage.TOKEN + '-second'
            self.sql(f"insert into private.worker_tokens(label,token_sha256,execution_account_user_id) values('Synthetic retention second purger',extensions.digest({storage.literal(other_token)},'sha256'),'{storage.ACTOR}');")
            for first_token, second_token, label in [(storage.TOKEN, other_token, 'purger_A_before_B'), (other_token, storage.TOKEN, 'purger_B_before_A')]:
                delivery = self.delivery(label); allocation = self.prepare(delivery); self.revoke(delivery)
                first = 'set local role authenticated;select public.worker_claim_capital_capture_purge_v1(' + storage.literal(first_token) + ',20);'
                second = 'set local role authenticated;select public.worker_claim_capital_capture_purge_v1(' + storage.literal(second_token) + ',20);'
                self.race(label, first, second, second_empty=True)
                self.sql(f"update private.capital_public_payload_purge_queue set lease_expires_at=clock_timestamp()-interval '1 second',next_check_at=clock_timestamp() where organization_id='{storage.ORG}' and allocation_id='{allocation['allocationId']}';")
                ticket = self.ticket(allocation); self.erase(ticket); self.ack(ticket)
            print('capital_public_retention_concurrency: PASS (6 real two-session races; Storage cleanup separately verified)')
        finally:
            self.restore_control()


if __name__ == '__main__':
    if sys.argv[1:] == ['--self-test']:
        storage.self_test()
        assert storage.ACTOR.startswith('a63e') and storage.POLICY_REVISION == 76312002
        print('retention concurrency static namespace: PASS (no database/network executed)')
    elif sys.argv[1:]:
        raise SystemExit('Usage: test-capital-public-retention-concurrency.py [--self-test]')
    else:
        Races().main()
