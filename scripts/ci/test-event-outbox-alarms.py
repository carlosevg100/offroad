import contextlib
import importlib.util
import io
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('outbox_alarms', Path(__file__).with_name('configure-event-outbox-alarms.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class MonitoringBoundaryTests(unittest.TestCase):
    def run_operation(self, apply=False, corrupt=False, with_actions=False):
        calls = []
        def fake_aws(service, operation, payload):
            calls.append((service, operation, payload))
            if operation == 'test-metric-filter':
                return {'matches': [{'eventNumber': 0}]}
            if operation == 'describe-metric-filters':
                return {'metricFilters': [{'filterName': f['name'], 'filterPattern': f['pattern'],
                    'metricTransformations': [{'metricName': f['metric'], 'metricValue': f['value'],
                     'metricNamespace': module.CONFIG['namespace']}]} for f in module.CONFIG['filters']]}
            if operation == 'describe-alarms':
                return {'MetricAlarms': [{'AlarmName': a['name'], 'MetricName': a['metric'],
                    'Namespace': 'unrelated' if corrupt else module.CONFIG['namespace'],
                    'ComparisonOperator': a['comparison'], 'Threshold': a['threshold'],
                    'Statistic': a['statistic'], 'EvaluationPeriods': a['periods'],
                    'TreatMissingData': a['missing'], 'Period': 60, 'StateValue': 'OK',
                    **({'AlarmActions': ['arn:aws:sns:sa-east-1:000000000000:existing-test-topic'], 'ActionsEnabled': False} if with_actions else {})} for a in module.CONFIG['alarms']]}
            return {}
        with patch.object(module, 'aws', side_effect=fake_aws), patch('sys.argv', ['monitor'] + (['--apply'] if apply else [])), contextlib.redirect_stdout(io.StringIO()):
            module.main()
        return calls

    def test_default_verification_never_writes_or_notifies(self):
        calls = self.run_operation()
        self.assertTrue(all(operation in ['test-metric-filter','describe-metric-filters','describe-alarms'] for _,operation,_ in calls))

    def test_apply_writes_only_reviewed_filters_and_alarms(self):
        calls = self.run_operation(apply=True)
        mutations = [(service,operation,payload) for service,operation,payload in calls if operation.startswith('put-')]
        self.assertEqual(len(mutations), 8)
        for service,operation,payload in mutations:
            self.assertIn((service,operation), [('logs','put-metric-filter'),('cloudwatch','put-metric-alarm')])
            self.assertNotIn('AlarmActions', payload)
            if service == 'logs': self.assertEqual(payload['logGroupName'], '/ecs/offroad-document-worker')
            else: self.assertTrue(payload['AlarmName'].startswith('offroad-outbox-'))

    def test_existing_notification_configuration_is_preserved(self):
        calls = self.run_operation(apply=True, with_actions=True)
        for _, operation, payload in calls:
            if operation == 'put-metric-alarm':
                self.assertEqual(payload['AlarmActions'], ['arn:aws:sns:sa-east-1:000000000000:existing-test-topic'])
                self.assertIs(payload['ActionsEnabled'], False)

    def test_wrong_metric_namespace_is_not_reported_as_verified(self):
        with self.assertRaisesRegex(SystemExit, 'Existing alarm belongs to another metric'):
            self.run_operation(corrupt=True)


if __name__ == '__main__':
    unittest.main()
