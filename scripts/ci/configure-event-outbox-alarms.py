#!/usr/bin/env python3
"""Install/check the bounded outbox alarms using an already-authorized AWS session.
Does not create credentials, alter IAM, manufacture production events or send notifications.
"""
import argparse
import json
import re
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
CONFIG = json.loads((ROOT / 'apps/document-worker/monitoring/event-outbox-alarms.json').read_text())


def aws(service, operation, payload):
    result = subprocess.run(['aws', '--region', CONFIG['region'], service, operation,
                             '--cli-input-json', json.dumps(payload), '--output', 'json'],
                            capture_output=True, text=True, check=False)
    if result.returncode:
        # Do not relay arbitrary service/credential-provider stderr into a receipt.
        match = re.search(r'An error occurred \(([A-Za-z0-9]+)\)', result.stderr)
        code = match.group(1) if match else f'exit_{result.returncode}'
        raise SystemExit(f'AWS operation unavailable: {service}:{operation}; code={code}')
    return json.loads(result.stdout or '{}')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true', help='Install the reviewed configuration before checking it')
    args = parser.parse_args()
    prior = aws('cloudwatch', 'describe-alarms', {'AlarmNames': [item['name'] for item in CONFIG['alarms']]})
    prior_alarms = {item['AlarmName']: item for item in prior.get('MetricAlarms', [])}
    for alarm in CONFIG['alarms']:
        existing = prior_alarms.get(alarm['name'])
        if existing and (existing.get('Namespace') != CONFIG['namespace'] or existing.get('MetricName') != alarm['metric']):
            raise SystemExit(f'Existing alarm belongs to another metric: {alarm["name"]}')
    for item in CONFIG['filters']:
        sample = {'event': 'outbox.poll.failed'} if item['metric'] == 'OutboxErrors' else {
            'event': 'outbox.health', 'blockedCount': 2, 'oldestPendingSeconds': 360}
        tested = aws('logs', 'test-metric-filter', {'filterPattern': item['pattern'],
                                                  'logEventMessages': [json.dumps(sample)]})
        if len(tested.get('matches', [])) != 1:
            raise SystemExit(f'Metric filter did not match its synthetic in-memory sample: {item["name"]}')
        if args.apply:
            aws('logs', 'put-metric-filter', {
                'logGroupName': CONFIG['logGroup'], 'filterName': item['name'],
                'filterPattern': item['pattern'], 'metricTransformations': [{
                    'metricName': item['metric'], 'metricNamespace': CONFIG['namespace'],
                    'metricValue': item['value']}],
            })
    for alarm in CONFIG['alarms']:
        if args.apply:
            payload = {
                'AlarmName': alarm['name'], 'AlarmDescription': 'Offroad stage 4 durable authority-event consumer',
                'Namespace': CONFIG['namespace'], 'MetricName': alarm['metric'],
                'Statistic': alarm['statistic'], 'Period': 60,
                'EvaluationPeriods': alarm['periods'], 'DatapointsToAlarm': alarm['periods'],
                'Threshold': alarm['threshold'], 'ComparisonOperator': alarm['comparison'],
                'TreatMissingData': alarm['missing'],
            }
            previous = prior_alarms.get(alarm['name'], {})
            # PutMetricAlarm replaces configuration: preserve existing notifications.
            for key in ['AlarmActions', 'OKActions', 'InsufficientDataActions', 'ActionsEnabled']:
                if key in previous:
                    payload[key] = previous[key]
            aws('cloudwatch', 'put-metric-alarm', payload)
    filters = aws('logs', 'describe-metric-filters', {'logGroupName': CONFIG['logGroup'], 'filterNamePrefix': 'offroad-outbox-'})
    installed = {item['filterName']: item for item in filters.get('metricFilters', [])}
    for expected in CONFIG['filters']:
        actual = installed.get(expected['name'], {})
        transform = actual.get('metricTransformations', [{}])[0]
        if actual.get('filterPattern') != expected['pattern'] or transform.get('metricValue') != expected['value'] or transform.get('metricName') != expected['metric'] or transform.get('metricNamespace') != CONFIG['namespace']:
            raise SystemExit(f'Installed metric filter differs: {expected["name"]}')
    result = aws('cloudwatch', 'describe-alarms', {'AlarmNames': [item['name'] for item in CONFIG['alarms']]})
    alarms = {item['AlarmName']: item for item in result.get('MetricAlarms', [])}
    for expected in CONFIG['alarms']:
        actual = alarms.get(expected['name'], {})
        pairs = [('MetricName','metric'), ('ComparisonOperator','comparison'), ('Threshold','threshold'),
                 ('Statistic','statistic'), ('EvaluationPeriods','periods'), ('TreatMissingData','missing')]
        if any(actual.get(a) != expected[e] for a,e in pairs) or actual.get('Namespace') != CONFIG['namespace'] or actual.get('Period') != 60:
            raise SystemExit(f'Installed alarm differs: {expected["name"]}')
    print(json.dumps({'configuration': 'verified', 'alarms': [{'name': item['AlarmName'],
          'state': item['StateValue'], 'actionsConfigured': bool(item.get('AlarmActions'))} for item in alarms.values()]}))


if __name__ == '__main__':
    main()
