#!/usr/bin/env python3
"""Real two-session typed-body races on explicit local/staging synthetic fixture.

Uses the exact guarded fixture and real HTTP byte client from the Storage eval.
No DDL, global controls, service-role HTTP, or production execution. Both SQL
transactions ROLLBACK; a separate real typed allocation/upload/commit is retained
for the operator's fixture cleanup. No manifest/credential/body enters stdout.
Requires psql + DATABASE_URL (a single-call MCP bridge cannot emulate races).
"""
import importlib.util
import json
import os
from pathlib import Path
import re
import select
import subprocess
import sys
import time
import uuid

ROOT = Path(os.environ.get('OFFROAD_REPOSITORY_ROOT', Path(__file__).resolve().parents[2])).resolve()
spec = importlib.util.spec_from_file_location('body_storage', ROOT / 'scripts/ci/test-capital-body-retention-storage.py')
body = importlib.util.module_from_spec(spec)
spec.loader.exec_module(body)
L = body.base.literal


def result(code, output, expected=None):
    if re.search(r'ERROR:\s+(40P01|55P03|57014):', output):
        raise AssertionError('Deadlock, timeout or untranslated lock error')
    if expected is None:
        if code:
            raise AssertionError('Unexpected SQL failure')
    elif not code or not re.search(r'ERROR:\s+' + re.escape(expected[0]) + ':', output) or expected[1] not in output:
        raise AssertionError('Wrong SQLSTATE or refusal')


class Races:
    def __init__(self):
        if os.environ.get('OFFROAD_BODY_SQL_BRIDGE_DIR'):
            raise AssertionError('Single-call SQL bridge cannot prove simultaneous sessions')
        self.client = body.BodyStorage()
        self.client.login()
        self.client.claim()
        self.client.select_job('baseline')
        self.command = self.client.command
        self.revision = self.client.contribution()
        self.allocation = self.client.prepare(self.revision)
        self.retained = self.client.commit(self.allocation, self.client.upload(self.allocation))
        self.sequence = 0

    def auth(self, query):
        f = self.client.f
        return ("select set_config('request.jwt.claim.sub'," + L(f['actorId']) + ",true);"
                + "select set_config('request.jwt.claims'," + L(json.dumps({'sub': f['actorId'], 'role': 'authenticated'})) + ",true);"
                + "select set_config('request.headers'," + L(json.dumps({'x-offroad-workspace': f['organizationId']})) + ",true);" + query)

    def rpc(self, name, args):
        return ('set local role authenticated;select public.' + name + '(' + L(self.client.job)
                + '::uuid,' + L(self.client.capability) + ',' + args + ');')

    def read(self):
        # Exercise the actual server POST's before/after authority command under
        # the same policy/membership/queue frontier, not only the legacy receipt.
        return self.rpc('worker_read_capital_body_allocation_v1', L(self.allocation['allocationId']) + '::uuid')

    def prepare(self, request):
        return self.rpc('worker_prepare_capital_body_v1', L(request) + "::uuid,'contribution_input'," + L(self.revision) + '::uuid')

    def commit(self):
        identity = self.client.storage_identity(self.allocation)
        return self.rpc('worker_commit_capital_body_v1', L(self.allocation['allocationId']) + '::uuid,'
                        + L(identity['id']) + '::uuid,' + L(identity['version']) + ','
                        + L(self.allocation['payloadFingerprint']) + ',' + str(self.allocation['byteLength']))

    def counts(self):
        return self.client.sql("select jsonb_build_array("
            + '(select count(*) from private.capital_public_payload_allocations where organization_id=' + L(self.client.f['organizationId']) + '::uuid),'
            + '(select count(*) from private.capital_body_retention_wakes where organization_id=' + L(self.client.f['organizationId']) + '::uuid),'
            + '(select count(*) from public.audit_events where organization_id=' + L(self.client.f['organizationId']) + '::uuid));')

    def held(self, sql):
        p = subprocess.Popen(self.command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        p.stdin.write("\\o /dev/null\nset statement_timeout='12s';set lock_timeout='8s';begin;" + self.auth(sql) + '\n\\echo BODY_RACE_HELD\n')
        p.stdin.flush()
        if not select.select([p.stdout], [], [], 14)[0] or p.stdout.readline().strip() != 'BODY_RACE_HELD':
            p.kill(); p.communicate(timeout=5)
            raise AssertionError('Holder did not reach observed barrier')
        return p

    def race(self, name, holder_sql, contender_sql, expected=None, wait=False):
        holder = contender = None
        before = self.counts()
        self.sequence += 1
        app = 'offroad_body_race_' + str(self.sequence)
        try:
            holder = self.held(holder_sql)
            contender = subprocess.Popen(self.command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            contender.stdin.write("\\o /dev/null\nset application_name='" + app + "';set statement_timeout='12s';set lock_timeout='8s';begin;"
                + self.auth(contender_sql) + 'rollback;\n')
            contender.stdin.close(); contender.stdin = None
            if wait:
                deadline = time.monotonic() + 3
                while self.client.sql("select count(*) from pg_stat_activity where application_name='" + app + "' and wait_event_type='Lock';") != '1':
                    if contender.poll() is not None or time.monotonic() >= deadline:
                        raise AssertionError('Contender did not visibly wait')
                    time.sleep(.05)
            else:
                output = contender.communicate(timeout=3)[0]
                result(contender.returncode, self.client.redact(output), expected)
            holder.stdin.write('rollback;\n'); holder.stdin.close(); holder.stdin = None
            output = holder.communicate(timeout=14)[0]
            result(holder.returncode, self.client.redact(output))
            if wait:
                output = contender.communicate(timeout=14)[0]
                result(contender.returncode, self.client.redact(output), expected)
            if before != self.counts():
                raise AssertionError('Rollback race left metadata or audit')
            print(name + ': PASS (two sessions, observed ordering, rollback)')
        finally:
            for p in (holder, contender):
                if p is not None and p.poll() is None:
                    p.kill(); p.communicate(timeout=5)

    def main(self):
        f = self.client.f
        prepare = self.prepare(str(uuid.uuid4()))
        self.race('body_prepare_same_request_nowait', prepare, prepare, ('40001', 'capital_capture_retry'))
        # Actual source declaration command takes policy exclusive and appends a
        # rights version; rollback means no retroactive synthetic row mutation.
        rights = ("set local role authenticated;select public.set_source_rights_v1(" + L(f['sourceVersionId'])
            + "::uuid,(select max(revision) from private.source_rights_versions where source_version_id=" + L(f['sourceVersionId'])
            + "::uuid),array['read','store','derive'],array['analysis'],clock_timestamp()+interval '30 days',"
            + "clock_timestamp()+interval '29 days'," + L(f['sourceVersionId']) + "::uuid,repeat('b',64));")
        # Resolve revision under fixture-owner privilege before entering auth role.
        rights = rights.replace('(select max(revision) from private.source_rights_versions where source_version_id=' + L(f['sourceVersionId']) + '::uuid)',
            self.client.sql('select max(revision) from private.source_rights_versions where source_version_id=' + L(f['sourceVersionId']) + '::uuid;'))
        self.race('body_rights_command_before_read', rights, self.read(), ('40001', 'capital_capture_retry'))
        self.race('body_read_before_rights_command', self.read(), rights, wait=True)
        binding = ('update public.source_bindings set revoked_at=clock_timestamp(),revoked_by=' + L(f['actorId'])
                   + '::uuid where organization_id=' + L(f['organizationId']) + '::uuid and id=' + L(f['sourceBindingId']) + '::uuid;')
        self.race('body_binding_revocation_before_read', binding, self.read(), ('40001', 'capital_capture_retry'))
        self.race('body_read_before_binding_revocation', self.read(), binding, wait=True)
        suspension = ("update public.organization_memberships set status='suspended' where organization_id=" + L(f['organizationId'])
                      + '::uuid and user_id=' + L(f['actorId']) + '::uuid;')
        self.race('body_suspension_before_read', suspension, self.read(), ('40001', 'capital_capture_retry'))
        self.race('body_read_before_suspension', self.read(), suspension, wait=True)
        queue = ('select id from private.capital_public_payload_purge_queue where allocation_id=' + L(self.allocation['allocationId']) + '::uuid for update;')
        self.race('body_purge_queue_before_commit', queue, self.commit(), ('40001', 'capital_capture_retry'))
        self.race('body_commit_before_purge_queue', self.commit(), queue, wait=True)
        # Append-only notifications may coexist with a drain holding an earlier
        # wake. No UNIQUE wait may resurrect the old parent/child deadlock.
        wake = ('insert into private.capital_body_retention_wakes(organization_id,allocation_id) values('
                + L(f['organizationId']) + '::uuid,' + L(self.allocation['allocationId']) + '::uuid);')
        self.race('body_duplicate_wake_append_no_wait', wake, wake)
        # A real derived response and a shorter, still-valid human declaration
        # make the drain update a parent while appending child notifications.
        self.client.cascade_output(self.retained)
        revision = self.client.sql('select max(revision) from private.source_rights_versions where source_version_id=' + L(f['sourceVersionId']) + '::uuid;')
        shorten = ("set local role authenticated;select public.set_source_rights_v1(" + L(f['sourceVersionId']) + '::uuid,' + revision
                   + ",array['read','process','store','derive'],array['analysis'],clock_timestamp()+interval '10 days',clock_timestamp()+interval '8 days',"
                   + L(f['sourceVersionId']) + "::uuid,repeat('c',64));")
        self.client.sql('begin;' + self.auth(shorten) + 'commit;')
        revision = self.client.sql('select max(revision) from private.source_rights_versions where source_version_id=' + L(f['sourceVersionId']) + '::uuid;')
        deny = ("set local role authenticated;select public.set_source_rights_v1(" + L(f['sourceVersionId']) + '::uuid,' + revision
                + ",array['read','store','derive'],array['analysis'],clock_timestamp()+interval '10 days',clock_timestamp()+interval '8 days',"
                + L(f['sourceVersionId']) + "::uuid,repeat('d',64));")
        drain = 'select private.drain_capital_body_retention_wakes_v1(' + L(f['purgeToken']) + ',100);'
        self.race('body_parent_child_revoker_before_drain', deny, drain)
        self.race('body_parent_child_drain_before_revoker', drain, deny, wait=True)
        started = time.monotonic()
        for _ in range(4):
            self.client.sql('begin;' + self.auth(drain) + 'commit;')
            if self.client.sql('select count(*) from private.capital_body_retention_wakes where organization_id=' + L(f['organizationId']) + '::uuid;') == '0':
                break
        else:
            raise AssertionError('Notification drain left a perpetual backlog')
        print('body_parent_child_notification_recovery_seconds=' + format(time.monotonic() - started, '.3f'))
        self.client.read(self.retained['retainedPayloadId'])
        print('body_duplicate_wake_drain_recovery_bounded: PASS')
        print('capital_body_retention_concurrency: PASS')


if __name__ == '__main__':
    try:
        if sys.argv[1:] == ['--self-test']:
            result(1, 'ERROR: 40001: capital_capture_retry', ('40001', 'capital_capture_retry'))
            for state in ('40P01', '55P03', '57014'):
                try:
                    result(1, 'ERROR: ' + state + ': capital_capture_retry', ('40001', 'capital_capture_retry'))
                except AssertionError:
                    pass
                else:
                    raise AssertionError('Unsafe lock failure accepted')
            print('body_concurrency_static_self_test: PASS (no SQL/HTTP)')
        elif sys.argv[1:]:
            raise SystemExit('Usage: test-capital-body-retention-concurrency.py [--self-test]')
        else:
            Races().main()
    except Exception:
        raise SystemExit('capital_body_retention_concurrency: FAILED; inspect secret-safe local evidence; operator cleanup required') from None
