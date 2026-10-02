#!/usr/bin/env python3
"""Two actual SQL sessions, the authenticated body fixture and rollback-only races.

Never production, never a bridge pretending to own two transactions. Shares the
existing physical body fixture/cleanup; no provider egress or fake Storage rows.
"""
import importlib.util
import json
import os
from pathlib import Path
import sys
import uuid

ROOT = Path(os.environ.get('OFFROAD_REPOSITORY_ROOT', Path(__file__).resolve().parents[2])).resolve()
spec = importlib.util.spec_from_file_location('body_races', ROOT / 'scripts/ci/test-capital-body-retention-concurrency.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
L = base.L


class AttemptRaces(base.Races):
    def __init__(self):
        super().__init__()
        for _ in range(10):
            if self.client.claim()['items']:
                raise AssertionError('Live attempt fixture prematurely selected for purge')
            if self.client.sql('select count(*) from private.capital_body_retention_wakes where organization_id='
                    + L(self.client.f['organizationId']) + '::uuid;') == '0':
                break
        else:
            raise AssertionError('Attempt fixture retention did not converge')

    def attempt(self, invocation):
        return {'adapterInputVersion': 'gateway-adapter-input.v1', 'task': 'preliminary_understanding',
            'schemaName': 'origination_senior_readout_v2', 'requestFingerprint': 'a' * 64,
            'inputFingerprint': 'b' * 64, 'promptFingerprint': 'c' * 64,
            'invocationId': invocation, 'retryOrdinal': 0, 'isSameModelRepair': False,
            'usedProviderFallback': False, 'reservationUsd': 0}

    def authorize(self, invocation):
        connection = self.client.f['providerConnections']['anthropic']
        route = {**connection, 'provider': 'anthropic', 'model': 'claude-sonnet-5',
            'endpoint': 'https://api.anthropic.com/v1/messages'}
        # This harness exercises locking metadata, not reconstruction of a model
        # request. The SDK eval separately proves actual builder/source parity.
        components = [{'kind': 'retained_payload', 'id': self.retained['retainedPayloadId']}]
        j = lambda x: L(json.dumps(x)) + '::jsonb'
        return self.rpc('worker_authorize_capital_body_processing_v1',
            j(self.attempt(invocation)) + ',' + j(route)
            + ",array['inference','prompt_cache','schema_cache'],'case_analysis'," + j(components))

    def legacy_input(self, invocation):
        return self.rpc('worker_record_capital_body_input_v1', L(invocation)
            + "::uuid,repeat('a',64),repeat('b',64),repeat('c',64),'anthropic','claude-sonnet-5',"
            + L(json.dumps([{'kind': 'retained_payload', 'id': self.retained['retainedPayloadId']}]))
            + '::jsonb,0,false,false,null')

    def counts(self):
        org = L(self.client.f['organizationId']) + '::uuid'
        return self.client.sql('select jsonb_build_array('
            + ','.join('(select count(*) from ' + table + ' where organization_id=' + org + ')'
                for table in ('private.capital_body_gateway_attempts',
                    'private.capital_body_gateway_attempt_components', 'private.processing_eligibility_decisions',
                    'private.capital_body_invocation_inputs', 'public.audit_events')) + ');')

    def main(self):
        f = self.client.f
        invocation = str(uuid.uuid4())
        authorize = self.authorize(invocation)
        legacy = self.legacy_input(invocation)
        retry = ('40001', 'capital_capture_retry')
        # A held job lock can mask the invocation barrier. Take only its exact
        # namespace in the holder so the legitimate command reaches that gate.
        invocation_barrier = ('select pg_advisory_xact_lock(hashtextextended('
            + L('capital-body-invocation:' + f['organizationId'] + ':' + invocation) + ',0));')
        self.race('body_attempt_invocation_barrier_no_job_lock', invocation_barrier,
            authorize, ('40001', 'capital_body_processing_retry'))
        self.race('body_legacy_input_invocation_barrier_no_job_lock', invocation_barrier,
            legacy, ('40001', 'capital_capture_retry'))
        self.race('body_attempt_same_invocation_nowait', authorize, authorize, retry)
        self.race('body_attempt_before_legacy_input_no_shortcut', authorize, legacy, retry)
        self.race('body_legacy_input_before_attempt_no_shortcut', legacy, authorize, retry)
        suspension = ("update public.organization_memberships set status='suspended' where organization_id="
            + L(f['organizationId']) + '::uuid and user_id=' + L(f['actorId']) + '::uuid;')
        self.race('body_attempt_membership_revocation_before_authorize', suspension, authorize, retry)
        self.race('body_attempt_authorize_before_membership_revocation', authorize, suspension, wait=True)
        binding = ('update public.source_bindings set revoked_at=clock_timestamp(),revoked_by=' + L(f['actorId'])
            + '::uuid where organization_id=' + L(f['organizationId']) + '::uuid and id=' + L(f['sourceBindingId']) + '::uuid;')
        self.race('body_attempt_binding_revocation_before_authorize', binding, authorize, retry)
        self.race('body_attempt_authorize_before_binding_revocation', authorize, binding, wait=True)
        queue = ('select id from private.capital_public_payload_purge_queue where allocation_id='
            + L(self.allocation['allocationId']) + '::uuid for update;')
        self.race('body_attempt_purge_queue_before_authorize', queue, authorize,
            ('40001', 'capital_body_processing_retry'))
        self.race('body_attempt_authorize_before_purge_queue', authorize, queue, wait=True)
        assurance_id = f['providerAssuranceIds'][0]
        revoke = ('select private.revoke_provider_processing_assurance_v1('
            + L(assurance_id) + "::uuid,'Synthetic concurrent body processing revocation');")
        self.race('body_attempt_assurance_revocation_before_authorize', revoke, authorize,
            ('40001', 'capital_body_processing_retry'))
        self.race('body_attempt_authorize_before_assurance_revocation', authorize, revoke, wait=True)
        # The eligible fact comes from the authenticated HTTP command, with the
        # same real body and provider fixture; no direct ledger insert is used.
        admitted_invocation = str(uuid.uuid4())
        route = {**f['providerConnections']['openai'], 'provider': 'openai', 'model': 'gpt-5.6-terra',
            'endpoint': 'https://api.openai.com/v1/responses'}
        admission = self.client.job_rpc('worker_authorize_capital_body_processing_v1', {
            'p_attempt': self.attempt(admitted_invocation), 'p_route': route,
            'p_resources': ['inference', 'prompt_cache', 'schema_cache'], 'p_purpose': 'case_analysis',
            'p_components': [{'kind': 'retained_payload', 'id': self.retained['retainedPayloadId']}]})
        if admission.get('allowed') is not True:
            raise AssertionError('Eligible fixture was not admitted')
        input_v2 = self.rpc('worker_record_capital_body_input_v2', L(admission['attemptReceiptId']) + '::uuid')
        v2_barrier = ('select pg_advisory_xact_lock(hashtextextended('
            + L('capital-body-invocation:' + f['organizationId'] + ':' + admitted_invocation) + ',0));')
        self.race('body_input_v2_invocation_barrier_no_job_lock', v2_barrier, input_v2,
            ('40001', 'capital_body_processing_retry'))
        self.race('body_input_v2_membership_revocation_before_admit', suspension, input_v2, retry)
        self.race('body_input_v2_admit_before_membership_revocation', input_v2, suspension, wait=True)
        self.race('body_input_v2_binding_revocation_before_admit', binding, input_v2, retry)
        self.race('body_input_v2_admit_before_binding_revocation', input_v2, binding, wait=True)
        self.race('body_input_v2_purge_queue_before_admit', queue, input_v2,
            ('40001', 'capital_body_processing_retry'))
        self.race('body_input_v2_admit_before_purge_queue', input_v2, queue, wait=True)
        fallback_assurance = f['providerAssuranceIds'][3]
        fallback_revoke = ('select private.revoke_provider_processing_assurance_v1('
            + L(fallback_assurance) + "::uuid,'Synthetic concurrent eligible assurance revocation');")
        self.race('body_input_v2_assurance_revocation_before_admit', fallback_revoke, input_v2,
            ('40001', 'capital_body_processing_retry'))
        self.race('body_input_v2_admit_before_assurance_revocation', input_v2, fallback_revoke, wait=True)
        self.client.physical_post(self.allocation)
        print('capital_body_attempt_concurrency: PASS (actual barriers, both orders, zero partial writes; no provider egress)')


if __name__ == '__main__':
    try:
        if len(sys.argv) != 1:
            raise AssertionError('Unsupported arguments')
        AttemptRaces().main()
    except Exception:
        sys.stderr.write('capital_body_attempt_concurrency_failed; scoped fixture cleanup required\n')
        sys.exit(1)
