#!/usr/bin/env python3
"""Real two-session metadata races through legitimate job/cap RPCs and Storage.

No production/serial MCP bridge/private ledger inserts/accepted_v1 success/purge ACK.
Outcome DTOs here are controlled synthetic metadata, NOT parsed/provider proof.
The separate Node SDK proves real core parsing, renderer and accepted body bytes.
Both SQL race sessions ROLLBACK. Committed isolated setup uses human contribution,
real upload/commit, authorize_v2 and input_v3; the final controlled metadata outcome,
child eligibility and synthetic assurance revocation remain committed for HTTP
negatives after revocation. Owner performs existing scoped fixture cleanup.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import uuid

ROOT = Path(os.environ.get('OFFROAD_REPOSITORY_ROOT', Path(__file__).resolve().parents[2])).resolve()
spec = importlib.util.spec_from_file_location('body_attempt_races', ROOT / 'scripts/ci/test-capital-body-attempt-concurrency.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
L = base.L
GOLD = json.loads((ROOT / 'scripts/ci/fixtures/capital-body-outcome-protocol.json').read_text())


def j(value):
    return L(json.dumps(value, separators=(',', ':'))) + '::jsonb'


def observation(admission, claim, invocation, kind, output_fingerprint=None):
    dto = dict(next(v['dto'] for v in GOLD['outcomes'] if v['name'] == kind))
    dto.update(invocationId=invocation, processingDecisionId=admission['decisionId'],
               inputAttestationReceiptId=claim['receiptId'], requestFingerprint='a' * 64,
               inputFingerprint='b' * 64, promptFingerprint='c' * 64,
               reservationMicroUsd=claim['reservationMicroUsd'], latencyMillis=1)
    if kind == 'accepted':
        dto.update(costMicroUsd=0, inputTokens=1, outputTokens=1, cachedInputTokens=0,
                   exposureMicroUsd=claim['reservationMicroUsd'])
        if output_fingerprint:
            dto['outputFingerprint'] = output_fingerprint
    else:
        dto.update(costMicroUsd=None, inputTokens=None, outputTokens=None, cachedInputTokens=None,
                   exposureMicroUsd=claim['reservationMicroUsd'])
    text = json.dumps([dto[key] for key in GOLD['fields']], separators=(',', ':'), ensure_ascii=True)
    dto['outcomeFingerprint'] = hashlib.sha256(text.encode()).hexdigest()
    return dto


class OutcomeRaces(base.AttemptRaces):
    def authorizer_args(self, invocation):
        connection = self.client.f['secondProviderConnections']['anthropic']
        return {'p_attempt': self.attempt(invocation), 'p_route': {**connection, 'provider': 'anthropic',
            'model': 'claude-sonnet-5', 'endpoint': 'https://api.anthropic.com/v1/messages'},
            'p_resources': ['inference', 'prompt_cache', 'schema_cache'], 'p_purpose': 'case_analysis',
            'p_components': [{'kind': 'retained_payload', 'id': self.retained['retainedPayloadId']}]}

    def authorize_v2(self, invocation):
        args = self.authorizer_args(invocation)
        return self.rpc('worker_authorize_capital_body_processing_v2', j(args['p_attempt']) + ',' + j(args['p_route'])
            + ",array['inference','prompt_cache','schema_cache'],'case_analysis'," + j(args['p_components']))

    def counts(self):
        org = L(self.client.f['organizationId']) + '::uuid'
        tables = ('private.capital_body_processing_operations', 'private.capital_body_operation_dispatches',
            'private.capital_body_attempt_outcomes', 'private.capital_body_gateway_attempts',
            'private.capital_body_gateway_attempt_components', 'private.processing_eligibility_decisions',
            'private.capital_body_invocation_inputs', 'private.capital_body_input_components',
            'private.capital_body_accepted_invocations',
            'private.capital_public_payload_allocations', 'private.capital_public_retained_payloads',
            'private.capital_public_payload_purge_queue', 'private.capital_body_retention_wakes', 'public.audit_events')
        return self.client.sql('select jsonb_build_array(' + ','.join('(select count(*) from ' + table
            + ' where organization_id=' + org + ')' for table in tables) + ');')

    def expect_denied_sql(self, command):
        prefix = 'set local role authenticated;select '
        if not command.startswith(prefix):
            raise AssertionError('Expected authenticated RPC command')
        expression = command[len(prefix):].rstrip(';')
        return ("set local role authenticated;do $denied$ begin begin perform " + expression
            + ";raise exception 'outcome_revocation_negative_allowed';exception when insufficient_privilege then "
            + "if sqlerrm<>'capital_body_processing_denied' then raise exception 'outcome_revocation_wrong_denial';end if;end;end $denied$;")

    def terminal_then_revoke(self, name, terminal, revoke, denied):
        before = self.counts()
        # Evaluate real revocation, not contention: this transaction owns both
        # sides and observes the changed row. Rollback preserves the fixture.
        self.client.sql('begin;' + self.auth(terminal + 'reset role;' + revoke
            + self.expect_denied_sql(denied)) + 'reset role;rollback;')
        if self.counts() != before:
            raise AssertionError('Controlled assurance ordering left metadata')
        print(name + ': PASS (real commands, changed assurance observed, denial after terminal, rollback)')

    def main(self):
        f = self.client.f
        if not f.get('secondProviderConnections') or len(f.get('secondProviderAssuranceIds', [])) != 6:
            raise AssertionError('Reviewed allowed provider fixture required')
        invocation = str(uuid.uuid4())
        authorize = self.authorize_v2(invocation)
        components = [{'kind': 'retained_payload', 'id': self.retained['retainedPayloadId']}]
        origin = self.client.sql('select to_jsonb(private.capital_body_operation_origins_v1('
            + L(f['organizationId']) + '::uuid,' + j(components) + '))->>0;')
        uuid.UUID(origin)
        operation_barrier = ('select pg_advisory_xact_lock(hashtextextended(' + L('capital-body-operation:'
            + f['organizationId'] + ':' + self.client.work + ':' + origin) + ',0));')
        invocation_barrier = ('select pg_advisory_xact_lock(hashtextextended(' + L('capital-body-invocation:'
            + f['organizationId'] + ':' + invocation) + ',0));')
        processing_retry = ('40001', 'capital_body_processing_retry')
        job_retry = ('40001', 'capital_capture_retry')
        self.race('outcome_operation_namespace_authorize_without_job_lock', operation_barrier, authorize, processing_retry)
        self.race('outcome_invocation_namespace_authorize_without_job_lock', invocation_barrier, authorize, processing_retry)
        self.race('outcome_two_roots_same_origin_no_budget_fork', authorize, self.authorize_v2(str(uuid.uuid4())), job_retry)
        legacy = self.legacy_input(str(uuid.uuid4()))
        self.race('outcome_operation_namespace_legacy_input_without_job_lock', operation_barrier, legacy, processing_retry)
        self.race('outcome_v2_root_before_legacy_input', authorize, legacy, job_retry)
        self.race('outcome_legacy_input_before_v2_root', legacy, authorize, job_retry)
        # An allowed legacy attempt without input predates the new operation;
        # its later input cannot become an alternate dispatch doorway.
        legacy_args = self.authorizer_args(str(uuid.uuid4()))
        old = self.client.job_rpc('worker_authorize_capital_body_processing_v1', legacy_args)
        if old.get('allowed') is not True:
            raise AssertionError('Legacy allowed fixture not admitted')
        old_input = self.rpc('worker_record_capital_body_input_v2', L(old['attemptReceiptId']) + '::uuid')
        self.race('outcome_legacy_allowed_input_before_operation', old_input, authorize, job_retry)
        self.race('outcome_operation_before_legacy_allowed_input', authorize, old_input, job_retry)
        admission = self.client.job_rpc('worker_authorize_capital_body_processing_v2', self.authorizer_args(invocation))
        if admission.get('allowed') is not True or admission['schemaVersion'] != 'capital-body-processing-decision.v2':
            raise AssertionError('Current allowed fixture not admitted')
        self.client.job_rpc('worker_record_capital_body_input_v2', {'p_attempt_receipt_id': old['attemptReceiptId']},
            ('42501', 'capital_body_processing_denied'))
        input_v3 = self.rpc('worker_record_capital_body_input_v3', L(admission['attemptReceiptId']) + '::uuid')
        suspension = ("update public.organization_memberships set status='suspended' where organization_id="
            + L(f['organizationId']) + '::uuid and user_id=' + L(f['actorId']) + '::uuid;')
        binding = ('update public.source_bindings set revoked_at=clock_timestamp(),revoked_by=' + L(f['actorId'])
            + '::uuid where organization_id=' + L(f['organizationId']) + '::uuid and id=' + L(f['sourceBindingId']) + '::uuid;')
        queue = ('select id from private.capital_public_payload_purge_queue where allocation_id='
            + L(self.allocation['allocationId']) + '::uuid for update;')
        self.race('outcome_operation_namespace_input_without_job_lock', operation_barrier, input_v3, processing_retry)
        self.race('outcome_invocation_namespace_input_without_job_lock', invocation_barrier, input_v3, processing_retry)
        self.race('outcome_input_one_time_claim_vs_same_claim', input_v3, input_v3, job_retry)
        for name, held, retry in [('membership', suspension, job_retry), ('binding', binding, job_retry), ('purge_queue', queue, processing_retry)]:
            self.race('outcome_' + name + '_before_initial_dispatch_claim', held, input_v3, retry)
            self.race('outcome_initial_dispatch_claim_before_' + name, input_v3, held, wait=True)
        claim = self.client.job_rpc('worker_record_capital_body_input_v3', {'p_attempt_receipt_id': admission['attemptReceiptId']})
        if claim.get('dispatchAllowed') is not True or claim.get('replayed') is not False:
            raise AssertionError('First dispatch claim not fresh')
        replay = self.client.job_rpc('worker_record_capital_body_input_v3', {'p_attempt_receipt_id': admission['attemptReceiptId']})
        if replay.get('dispatchAllowed') is not False or replay.get('replayed') is not True or replay['dispatchClaimId'] != claim['dispatchClaimId']:
            raise AssertionError('Dispatch replay renewed grant')
        self.race('outcome_committed_dispatch_replay_no_second_claim', input_v3, input_v3, job_retry)
        accepted_dto = observation(admission, claim, invocation, 'accepted', f.get('acceptedOutputFingerprint'))
        failure_dto = observation(admission, claim, invocation, 'provider_error')
        accepted = self.rpc('worker_record_capital_body_attempt_outcome_v1', L(admission['attemptReceiptId']) + '::uuid,' + j(accepted_dto))
        failure = self.rpc('worker_record_capital_body_attempt_outcome_v1', L(admission['attemptReceiptId']) + '::uuid,' + j(failure_dto))
        self.race('outcome_operation_namespace_terminal_without_job_lock', operation_barrier, accepted, processing_retry)
        self.race('outcome_invocation_namespace_terminal_without_job_lock', invocation_barrier, accepted, processing_retry)
        self.race('outcome_accepted_before_failure_single_conclusion', accepted, failure, job_retry)
        self.race('outcome_failure_before_accepted_single_conclusion', failure, accepted, job_retry)
        self.race('outcome_same_terminal_replay_no_partial_metadata', accepted, accepted, job_retry)
        suspension = ("update public.organization_memberships set status='suspended' where organization_id="
            + L(f['organizationId']) + '::uuid and user_id=' + L(f['actorId']) + '::uuid;')
        binding = ('update public.source_bindings set revoked_at=clock_timestamp(),revoked_by=' + L(f['actorId'])
            + '::uuid where organization_id=' + L(f['organizationId']) + '::uuid and id=' + L(f['sourceBindingId']) + '::uuid;')
        queue = ('select id from private.capital_public_payload_purge_queue where allocation_id='
            + L(self.allocation['allocationId']) + '::uuid for update;')
        for name, held, retry in [('membership', suspension, job_retry), ('binding', binding, job_retry), ('purge_queue', queue, processing_retry)]:
            self.race('outcome_' + name + '_before_terminal', held, accepted, retry)
            self.race('outcome_terminal_before_' + name, accepted, held, wait=True)
        assurance = f['secondProviderAssuranceIds'][0]
        revoke = ('select private.revoke_provider_processing_assurance_v1(' + L(assurance)
            + "::uuid,'Synthetic outcome concurrent revocation');")
        provider_barrier = "select pg_advisory_xact_lock(hashtextextended('provider-processing-assurances',0));"
        assurance_row = ('select id from private.provider_processing_assurances where id=' + L(assurance) + '::uuid for update;')
        self.race('outcome_provider_advisory_namespace_without_job_lock', provider_barrier, accepted, processing_retry)
        self.race('outcome_exact_assurance_row_without_job_lock', assurance_row, accepted, processing_retry)
        self.race('outcome_assurance_before_terminal', revoke, accepted, processing_retry)
        self.race('outcome_terminal_before_assurance', accepted, revoke, wait=True)
        fallback_args = self.authorizer_args(str(uuid.uuid4()))
        fallback_args['p_attempt'].update(usedProviderFallback=True, previousInvocationId=invocation)
        fallback_args['p_route'] = {**f['secondProviderConnections']['openai'], 'provider': 'openai',
            'model': 'gpt-5.6-terra', 'endpoint': 'https://api.openai.com/v1/responses'}
        fallback_sql = self.rpc('worker_authorize_capital_body_processing_v2', j(fallback_args['p_attempt']) + ',' + j(fallback_args['p_route'])
            + ",array['inference','prompt_cache','schema_cache'],'case_analysis'," + j(fallback_args['p_components']))
        accepted_identity = {key: accepted_dto[key] for key in ('invocationId', 'adapterInputVersion', 'outputFingerprintVersion',
            'outputFingerprint', 'inputFingerprint', 'promptFingerprint', 'provider', 'configuredModel', 'reportedModel', 'schemaName',
            'retryOrdinal', 'isSameModelRepair', 'usedProviderFallback', 'fromCassette', 'inputAttestationReceiptId')}
        accepted_identity.update(schemaVersion='gateway-accepted-invocation.v1', adapterRequestFingerprint=accepted_dto['requestFingerprint'])
        accepted_v1 = self.rpc('worker_record_capital_body_accepted_v1', L(claim['receiptId']) + '::uuid,' + j(accepted_identity))
        self.terminal_then_revoke('outcome_failure_then_assurance_revocation_blocks_fallback', failure, revoke, fallback_sql)
        self.terminal_then_revoke('outcome_accepted_then_assurance_revocation_blocks_accepted_v1', accepted, revoke, accepted_v1)
        # Commit only isolated fixture facts/revocation. A second HTTP request
        # observes committed revocation, not the advisory lock of the revoker.
        self.client.job_rpc('worker_record_capital_body_attempt_outcome_v1',
            {'p_attempt_receipt_id': admission['attemptReceiptId'], 'p_outcome': failure_dto})
        child = self.client.job_rpc('worker_authorize_capital_body_processing_v2', fallback_args)
        if child.get('allowed') is not True or child['operationId'] != admission['operationId']:
            raise AssertionError('Failure predecessor did not admit the controlled child before revocation')
        self.client.sql('begin;' + self.auth(revoke) + 'commit;')
        before_denials = self.counts()
        denied = ('42501', 'capital_body_processing_denied')
        for name, dto in [('failure_replay', failure_dto), ('new_accepted', accepted_dto)]:
            self.client.job_rpc('worker_record_capital_body_attempt_outcome_v1',
                {'p_attempt_receipt_id': admission['attemptReceiptId'], 'p_outcome': dto}, denied)
            print('outcome_committed_assurance_revocation_denies_' + name + ': PASS (HTTP after commit, no lock contention)')
        self.client.job_rpc('worker_authorize_capital_body_processing_v2', fallback_args, denied)
        self.client.job_rpc('worker_record_capital_body_input_v3', {'p_attempt_receipt_id': child['attemptReceiptId']}, denied)
        self.client.job_rpc('worker_record_capital_body_accepted_v1', {'p_input_receipt_id': claim['receiptId'], 'p_accepted': accepted_identity}, denied)
        if self.counts() != before_denials:
            raise AssertionError('Committed revocation denial wrote metadata')
        print('outcome_committed_primary_assurance_revocation_blocks_child_input_and_authorize_replay: PASS (child really allowed before commit, no dispatch claim)')
        print('outcome_committed_assurance_revocation_blocks_fallback_and_accepted: PASS (real RPC negatives, no new writes)')
        self.client.physical_post(self.allocation)
        print('capital_body_outcome_concurrency: PASS (actual RPC/Storage, two SQL sessions, observed barriers, rollback counts; metadata only, no provider/parsed-output claim)')


def self_test():
    for vector in GOLD['outcomes']:
        canonical = json.dumps([vector['dto'][key] for key in GOLD['fields']], separators=(',', ':'), ensure_ascii=True)
        if hashlib.sha256(canonical.encode()).hexdigest() != vector['expectedFingerprint']:
            raise AssertionError('Shared protocol fixture mismatch')
    admission = {'decisionId': str(uuid.uuid4())}
    claim = {'receiptId': str(uuid.uuid4()), 'reservationMicroUsd': 1}
    for kind in ('accepted', 'provider_error'):
        dto = observation(admission, claim, str(uuid.uuid4()), kind)
        if set(dto) != set(GOLD['outcomes'][0]['dto']) or len(GOLD['fields']) != 31:
            raise AssertionError('Observation keys differ')
        if any(k in dto for k in ('rawOutput', 'path', 'message', 'guidance', 'allowedValues')):
            raise AssertionError('Private outcome field')
    print('capital_body_outcome_concurrency_self_test: PASS (protocol/fixture only; no live SQL race claim)')


if __name__ == '__main__':
    try:
        parser = argparse.ArgumentParser()
        parser.add_argument('--self-test', action='store_true')
        args = parser.parse_args()
        if args.self_test:
            self_test()
        else:
            OutcomeRaces().main()
    except Exception:
        sys.stderr.write('capital_body_outcome_concurrency_failed; scoped fixture cleanup required\n')
        sys.exit(1)
