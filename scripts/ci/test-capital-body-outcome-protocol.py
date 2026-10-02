#!/usr/bin/env python3
"""Compare live SQL to the same independently generated gold consumed by Node.

Only the disposable local CI database is accepted. No provider, Storage fixture,
privileged remote access, or production data is needed for this pure protocol.
"""
import argparse
from decimal import Decimal, ROUND_CEILING
import hashlib
import json
import os
from pathlib import Path
import subprocess
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
GOLD = ROOT / 'scripts/ci/fixtures/capital-body-outcome-protocol.json'
HELPER = 'private.capital_body_attempt_outcome_fingerprint_v1'


def validate_gold():
    gold = json.loads(GOLD.read_text())
    assert gold['synthetic'] is True and len(gold['fields']) == 31
    assert len(gold['outcomes']) == 5
    for vector in gold['outcomes']:
        text = json.dumps([vector['dto'][key] for key in gold['fields']],
                          ensure_ascii=True, separators=(',', ':'))
        assert text == vector['canonicalTuple']
        assert hashlib.sha256(text.encode()).hexdigest() == vector['expectedFingerprint']
        assert vector['dto']['outcomeFingerprint'] == vector['expectedFingerprint']
    for vector in gold['moneyVectors']:
        micros = int((Decimal(vector['decimal']) * 1000000).to_integral_value(rounding=ROUND_CEILING))
        assert str(micros) == vector['expectedMicroUsd']
    for vector in gold['policyVectors']:
        assert len(vector['tuple']) == 21
        text = json.dumps(vector['tuple'], ensure_ascii=True, separators=(',', ':'))
        assert text == vector['canonicalTuple']
        assert hashlib.sha256(text.encode()).hexdigest() == vector['expectedFingerprint']
        schema_bytes = vector['tuple'][7]
        output_rate = vector['tuple'][13]
        numerator = ((vector['bodyByteLength'] + schema_bytes + 128 + 1024) * 2500000
                     + 1000 * output_rate) * 11
        assert (numerator + 9999999) // 10000000 == vector['expectedBoundMicroUsd']
    return gold


def literal(dto):
    return "'" + json.dumps(dto, separators=(',', ':')).replace("'", "''") + "'::jsonb"


def query(database_url, statement):
    result = subprocess.run(['psql', database_url, '-X', '-q', '-A', '-t',
                             '-v', 'ON_ERROR_STOP=1', '-c',
                             "begin read only; set local statement_timeout='10s'; "
                             + statement + '; rollback;'],
                            text=True, capture_output=True, timeout=20, check=False)
    if result.returncode:
        raise RuntimeError('outcome_protocol_sql_failed')
    return result.stdout.strip()


def run_sql(gold):
    database_url = os.environ.get('DATABASE_URL', '')
    if urlparse(database_url).hostname not in ('127.0.0.1', 'localhost', '::1'):
        raise RuntimeError('outcome_protocol_local_database_required')
    for vector in gold['outcomes']:
        observed = query(database_url, 'select ' + HELPER + '(' + literal(vector['dto']) + ')')
        if observed != vector['expectedFingerprint']:
            raise RuntimeError('outcome_protocol_fingerprint_mismatch')
        print('outcome_protocol_sql_node_' + vector['name'] + ': PASS')
    original = gold['outcomes'][0]['dto']
    negatives = [
        ('private_field', {**original, 'rawOutput': 'private_canary'}),
        ('unknown_version', {**original, 'fingerprintVersion': 'unknown.v1'}),
        ('unicode_schema', {**original, 'schemaName': 'private_\u00e9'}),
        ('fractional_micros', {**original, 'reservationMicroUsd': 0.1}),
        ('negative_latency', {**original, 'latencyMillis': -1}),
        ('wrong_failure', {**original, 'failureCode': 'provider_failure'}),
        ('missing_slot', {key: value for key, value in original.items() if key != 'inputTokens'}),
    ]
    for name, dto in negatives:
        statement = 'do $test$ begin begin perform ' + HELPER + '(' + literal(dto) + "); "
        statement += "raise exception 'outcome_protocol_negative_accepted'; "
        statement += 'exception when invalid_parameter_value then null; end; end $test$'
        query(database_url, statement)
        print('outcome_protocol_sql_negative_' + name + ': PASS')
    for vector in gold['policyVectors']:
        args = ','.join(("'" + vector['provider'] + "'", "'" + vector['configuredModel'] + "'",
                         str(vector['bodyByteLength'])))
        observed = json.loads(query(database_url, 'select private.capital_body_dispatch_policy_v1(' + args + ')'))
        if (observed.get('fingerprint') != vector['expectedFingerprint']
                or observed.get('serverBoundMicroUsd') != vector['expectedBoundMicroUsd']):
            raise RuntimeError('outcome_protocol_server_policy_mismatch')
        print('outcome_protocol_server_policy_' + vector['provider'] + '_'
              + str(vector['bodyByteLength']) + ': PASS')
    print('capital_body_outcome_protocol: PASS (five SQL/Node fingerprints, seven negatives, four server policy bounds)')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    gold = validate_gold()
    if args.self_test:
        print('capital_body_outcome_gold_integrity: PASS (fixture only; no live SQL claim)')
        return
    run_sql(gold)


if __name__ == '__main__':
    try:
        main()
    except (AssertionError, OSError, ValueError, RuntimeError, subprocess.TimeoutExpired):
        print('capital_body_outcome_protocol: FAIL (sanitized; no database URL or diagnostics)')
        raise SystemExit(1)
