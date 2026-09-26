#!/usr/bin/env python3
"""Install/check a reviewed set of worker log alarms using an already-authorized AWS session.
Does not create credentials, alter IAM, manufacture production events or send notifications.

    python3 scripts/ci/configure-event-outbox-alarms.py                  # verify the outbox alarms
    python3 scripts/ci/configure-event-outbox-alarms.py FILE             # verify the alarms of FILE
    python3 scripts/ci/configure-event-outbox-alarms.py [FILE] --apply   # install, then verify

FILE is a reviewed configuration under apps/document-worker/monitoring/ (default:
event-outbox-alarms.json). Every metric filter is first tested against the synthetic sample the
file declares for it, in memory; installing replaces the filters and alarms of the file only and
keeps the notification actions an alarm already has.
"""
import argparse
import json
import os
import re
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIGURATION = ROOT / 'apps/document-worker/monitoring/event-outbox-alarms.json'
FIELD = re.compile(r'^\$\.([A-Za-z][A-Za-z0-9]*)$')
EVENT = re.compile(r'\$\.event = "([a-z][a-z.]*)"')


def load_configuration(path):
    """The reviewed file, refused before any AWS call when it is not internally consistent."""
    config = json.loads(Path(path).read_text())
    filters, alarms = config['filters'], config['alarms']
    prefix = os.path.commonprefix([item['name'] for item in filters + alarms])
    if not re.fullmatch(r'offroad-[a-z]+-', prefix) or not config.get('description'):
        raise SystemExit(f'Configuration names need one offroad-<area>- prefix and a description: {path}')
    metrics = {item['metric'] for item in filters}
    for item in filters:
        sample = item.get('sample')
        field = FIELD.match(item['value'])
        if not isinstance(sample, dict) or sample.get('event') not in EVENT.findall(item['pattern']) or (
                item['value'] != '1' and not (field and isinstance(sample.get(field.group(1)), (int, float)))):
            raise SystemExit(f'Metric filter has no synthetic sample that carries its event and value: {item["name"]}')
    for alarm in alarms:
        if alarm['metric'] not in metrics:
            raise SystemExit(f'Alarm reads a metric no filter of this file produces: {alarm["name"]}')
    return {**config, 'prefix': prefix}


def aws(region, service, operation, payload):
    result = subprocess.run(['aws', '--region', region, service, operation,
                             '--cli-input-json', json.dumps(payload), '--output', 'json'],
                            capture_output=True, text=True, check=False)
    if result.returncode:
        # Do not relay arbitrary service/credential-provider stderr into a receipt.
        match = re.search(r'An error occurred \(([A-Za-z0-9]+)\)', result.stderr)
        code = match.group(1) if match else f'exit_{result.returncode}'
        raise SystemExit(f'AWS operation unavailable: {service}:{operation}; code={code}')
    return json.loads(result.stdout or '{}')


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('configuration', nargs='?', default=str(DEFAULT_CONFIGURATION),
                        help='Reviewed alarm configuration (default: the event outbox file)')
    parser.add_argument('--apply', action='store_true', help='Install the reviewed configuration before checking it')
    args = parser.parse_args(argv)
    path = Path(args.configuration)
    if not path.is_absolute() and not path.exists():
        path = ROOT / path
    config = load_configuration(path)

    def call(service, operation, payload):
        return aws(config['region'], service, operation, payload)

    prior = call('cloudwatch', 'describe-alarms', {'AlarmNames': [item['name'] for item in config['alarms']]})
    prior_alarms = {item['AlarmName']: item for item in prior.get('MetricAlarms', [])}
    for alarm in config['alarms']:
        existing = prior_alarms.get(alarm['name'])
        if existing and (existing.get('Namespace') != config['namespace'] or existing.get('MetricName') != alarm['metric']):
            raise SystemExit(f'Existing alarm belongs to another metric: {alarm["name"]}')
    for item in config['filters']:
        tested = call('logs', 'test-metric-filter', {'filterPattern': item['pattern'],
                                                    'logEventMessages': [json.dumps(item['sample'])]})
        if len(tested.get('matches', [])) != 1:
            raise SystemExit(f'Metric filter did not match its synthetic in-memory sample: {item["name"]}')
        if args.apply:
            call('logs', 'put-metric-filter', {
                'logGroupName': config['logGroup'], 'filterName': item['name'],
                'filterPattern': item['pattern'], 'metricTransformations': [{
                    'metricName': item['metric'], 'metricNamespace': config['namespace'],
                    'metricValue': item['value']}],
            })
    for alarm in config['alarms']:
        if args.apply:
            payload = {
                'AlarmName': alarm['name'], 'AlarmDescription': config['description'],
                'Namespace': config['namespace'], 'MetricName': alarm['metric'],
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
            call('cloudwatch', 'put-metric-alarm', payload)
    filters = call('logs', 'describe-metric-filters', {'logGroupName': config['logGroup'], 'filterNamePrefix': config['prefix']})
    installed = {item['filterName']: item for item in filters.get('metricFilters', [])}
    for expected in config['filters']:
        actual = installed.get(expected['name'], {})
        transform = actual.get('metricTransformations', [{}])[0]
        if actual.get('filterPattern') != expected['pattern'] or transform.get('metricValue') != expected['value'] or transform.get('metricName') != expected['metric'] or transform.get('metricNamespace') != config['namespace']:
            raise SystemExit(f'Installed metric filter differs: {expected["name"]}')
    result = call('cloudwatch', 'describe-alarms', {'AlarmNames': [item['name'] for item in config['alarms']]})
    alarms = {item['AlarmName']: item for item in result.get('MetricAlarms', [])}
    for expected in config['alarms']:
        actual = alarms.get(expected['name'], {})
        pairs = [('MetricName','metric'), ('ComparisonOperator','comparison'), ('Threshold','threshold'),
                 ('Statistic','statistic'), ('EvaluationPeriods','periods'), ('TreatMissingData','missing')]
        if any(actual.get(a) != expected[e] for a,e in pairs) or actual.get('Namespace') != config['namespace'] or actual.get('Period') != 60:
            raise SystemExit(f'Installed alarm differs: {expected["name"]}')
    print(json.dumps({'configuration': 'verified', 'file': path.name, 'alarms': [{'name': item['AlarmName'],
          'state': item['StateValue'], 'actionsConfigured': bool(item.get('AlarmActions'))} for item in alarms.values()]}))


if __name__ == '__main__':
    main()
