import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('outbox_alarms', Path(__file__).with_name('configure-event-outbox-alarms.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

MONITORING = module.ROOT / 'apps/document-worker/monitoring'
FILES = {
    'outbox': (MONITORING / 'event-outbox-alarms.json', 'offroad-outbox-', 'Offroad stage 4 durable authority-event consumer'),
    'recompute': (MONITORING / 'dependency-recompute-alarms.json', 'offroad-recompute-',
                  'Offroad stage 18 dependency recompute: health, backlog, expired leases and loop errors'),
}
# Only reads, the two reviewed writes, and never an action that could notify, authenticate or change IAM.
READS = {'test-metric-filter', 'describe-metric-filters', 'describe-alarms'}
WRITES = {('logs', 'put-metric-filter'), ('cloudwatch', 'put-metric-alarm')}


class MonitoringBoundaryTests(unittest.TestCase):
    def run_operation(self, path=None, apply=False, corrupt=False, with_actions=False):
        config = json.loads((path or FILES['outbox'][0]).read_text())
        calls = []
        def fake_aws(region, service, operation, payload):
            self.assertEqual(region, 'sa-east-1')
            calls.append((service, operation, payload))
            if operation == 'test-metric-filter':
                return {'matches': [{'eventNumber': 0}]}
            if operation == 'describe-metric-filters':
                return {'metricFilters': [{'filterName': f['name'], 'filterPattern': f['pattern'],
                    'metricTransformations': [{'metricName': f['metric'], 'metricValue': f['value'],
                     'metricNamespace': config['namespace']}]} for f in config['filters']]}
            if operation == 'describe-alarms':
                return {'MetricAlarms': [{'AlarmName': a['name'], 'MetricName': a['metric'],
                    'Namespace': 'unrelated' if corrupt else config['namespace'],
                    'ComparisonOperator': a['comparison'], 'Threshold': a['threshold'],
                    'Statistic': a['statistic'], 'EvaluationPeriods': a['periods'],
                    'TreatMissingData': a['missing'], 'Period': 60, 'StateValue': 'OK',
                    **({'AlarmActions': ['arn:aws:sns:sa-east-1:000000000000:existing-test-topic'],
                        'OKActions': ['arn:aws:sns:sa-east-1:000000000000:existing-test-topic'], 'ActionsEnabled': False} if with_actions else {})}
                    for a in config['alarms']]}
            return {}
        argv = ([] if path is None else [str(path)]) + (['--apply'] if apply else [])
        with patch.object(module, 'aws', side_effect=fake_aws), contextlib.redirect_stdout(io.StringIO()):
            module.main(argv)
        return config, calls

    def test_default_is_the_outbox_file(self):
        config, calls = self.run_operation()
        self.assertEqual(config, json.loads(FILES['outbox'][0].read_text()))
        self.assertEqual(calls[0][2]['AlarmNames'][0], 'offroad-outbox-heartbeat-missing')

    def test_default_verification_never_writes_or_notifies(self):
        for name, (path, _, _) in FILES.items():
            with self.subTest(name):
                _, calls = self.run_operation(path)
                self.assertTrue(all(operation in READS for _, operation, _ in calls))

    def test_every_filter_is_tested_against_its_own_sample(self):
        for name, (path, prefix, _) in FILES.items():
            with self.subTest(name):
                config, calls = self.run_operation(path)
                tested = [payload for _, operation, payload in calls if operation == 'test-metric-filter']
                self.assertEqual(tested, [{'filterPattern': f['pattern'], 'logEventMessages': [json.dumps(f['sample'])]} for f in config['filters']])
                described = [payload for _, operation, payload in calls if operation == 'describe-metric-filters']
                self.assertEqual(described, [{'logGroupName': '/ecs/offroad-document-worker', 'filterNamePrefix': prefix}])

    def test_apply_writes_only_reviewed_filters_and_alarms(self):
        for name, (path, prefix, description) in FILES.items():
            with self.subTest(name):
                config, calls = self.run_operation(path, apply=True)
                mutations = [(service, operation, payload) for service, operation, payload in calls if operation not in READS]
                self.assertEqual(len(mutations), 8)
                self.assertEqual(sorted(p.get('filterName') or p['AlarmName'] for _, _, p in mutations),
                                 sorted([f['name'] for f in config['filters']] + [a['name'] for a in config['alarms']]))
                for service, operation, payload in mutations:
                    self.assertIn((service, operation), WRITES)
                    self.assertNotIn('AlarmActions', payload)
                    if service == 'logs':
                        self.assertEqual(payload['logGroupName'], '/ecs/offroad-document-worker')
                        self.assertTrue(payload['filterName'].startswith(prefix))
                    else:
                        self.assertTrue(payload['AlarmName'].startswith(prefix))
                        self.assertEqual(payload['AlarmDescription'], description)
                        self.assertEqual(payload['Period'], 60)
                        self.assertEqual(payload['DatapointsToAlarm'], payload['EvaluationPeriods'])

    def test_existing_notification_configuration_is_preserved(self):
        for name, (path, _, _) in FILES.items():
            with self.subTest(name):
                _, calls = self.run_operation(path, apply=True, with_actions=True)
                alarms = [payload for _, operation, payload in calls if operation == 'put-metric-alarm']
                self.assertEqual(len(alarms), 4)
                for payload in alarms:
                    self.assertEqual(payload['AlarmActions'], ['arn:aws:sns:sa-east-1:000000000000:existing-test-topic'])
                    self.assertEqual(payload['OKActions'], ['arn:aws:sns:sa-east-1:000000000000:existing-test-topic'])
                    self.assertIs(payload['ActionsEnabled'], False)

    def test_wrong_metric_namespace_is_not_reported_as_verified(self):
        for name, (path, _, _) in FILES.items():
            with self.subTest(name):
                with self.assertRaisesRegex(SystemExit, 'Existing alarm belongs to another metric'):
                    self.run_operation(path, corrupt=True)

    def test_recompute_errors_filter_and_alarm_are_the_measured_production_ones(self):
        config = json.loads(FILES['recompute'][0].read_text())
        self.assertIn({'name': 'offroad-recompute-errors', 'pattern': '{ $.event = "recompute.poll.failed" }', 'metric': 'RecomputeErrors', 'value': '1',
                       'sample': {'at': '2026-09-26T12:00:00.000Z', 'event': 'recompute.poll.failed', 'reason': 'health_failed'}}, config['filters'])
        self.assertIn({'name': 'offroad-recompute-errors', 'metric': 'RecomputeErrors', 'comparison': 'GreaterThanThreshold', 'threshold': 0,
                       'statistic': 'Sum', 'periods': 1, 'missing': 'notBreaching'}, config['alarms'])
        self.assertEqual((config['region'], config['logGroup'], config['namespace']), ('sa-east-1', '/ecs/offroad-document-worker', 'Offroad/DocumentWorker'))
        outbox = json.loads(FILES['outbox'][0].read_text())
        names = [item['name'] for item in outbox['filters'] + outbox['alarms']]
        self.assertFalse(set(names) & {item['name'] for item in config['filters'] + config['alarms']})

    def test_inconsistent_configuration_is_refused_before_any_aws_call(self):
        base = json.loads(FILES['recompute'][0].read_text())
        broken = {
            'no sample': lambda c: c['filters'][1].pop('sample'),
            'sample without the value': lambda c: c['filters'][1]['sample'].pop('oldestScheduledSeconds'),
            'sample of another event': lambda c: c['filters'][3]['sample'].update(event='recompute.health'),
            'alarm without filter': lambda c: c['alarms'][0].update(metric='RecomputeSomethingElse'),
            'foreign name': lambda c: c['alarms'][0].update(name='another-recompute-backlog'),
        }
        for label, damage in broken.items():
            with self.subTest(label), tempfile.TemporaryDirectory() as directory:
                config = json.loads(json.dumps(base))
                damage(config)
                path = Path(directory) / 'broken.json'
                path.write_text(json.dumps(config))
                with patch.object(module, 'aws', side_effect=AssertionError('AWS called')), self.assertRaises(SystemExit):
                    module.main([str(path), '--apply'])


if __name__ == '__main__':
    unittest.main()
