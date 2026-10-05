"""Negative controls for the read-only stage 21 publication comparison."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('installed', Path(__file__).with_name('compare-stage21-installed.py'))
installed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installed)


class InstalledComparisonTest(unittest.TestCase):
    def test_accepts_plain_sql_json_and_single_column_result(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'capture.json'
            for payload in ({'captured_at': 'now'}, [{'function_catalogue': {'captured_at': 'now'}}],
                            [{'catalogue': json.dumps({'captured_at': 'now'})}]):
                path.write_text(json.dumps(payload))
                self.assertEqual(installed.load_payload(path), {'captured_at': 'now'})

    def test_refuses_tool_envelope_and_ambiguous_result(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'capture.json'
            for payload in ({'content': [{'text': '{"objects":[]}'}]}, [{'catalogue': {}, 'other': {}}]):
                path.write_text(json.dumps(payload))
                with self.assertRaises(ValueError):
                    installed.load_payload(path)

    def run_comparison(self, *, environment='production', extra=None, remote_hash='a' * 64, project=None):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            migrations = root / 'supabase/migrations'
            migrations.mkdir(parents=True)
            for stamp, name in [('1', 'artifact_export_receipts'), ('2', 'artifact_import_candidates')]:
                (migrations / (stamp + '_' + name + '.sql')).write_text(
                    'create or replace function private.institutional_source_context(p_org uuid) returns jsonb;')
            function_id = 'function:private.institutional_source_context(p_org uuid)'
            replay = {'captured_at': 'actual', 'objects': [{'id': 'table:x', 'kind': 'table'}]}
            remote = {'captured_at': 'actual', 'objects': list(replay['objects']) + ([extra] if extra else [])}
            functions = {'captured_at': 'actual', 'functions': [{'id': function_id, 'definitionSha256': 'a' * 64}]}
            remote_functions = {'captured_at': 'actual', 'functions': [{'id': function_id, 'definitionSha256': remote_hash}]}
            manifest = {'objects': [{'id': 'table:archive', 'kind': 'table', 'sources': [],
                                     'catalogues': {'staging': {'id': 'table:archive', 'kind': 'table'}}}]}
            journal = {'captured_at': 'actual', 'project_id': project or installed.PROJECTS[environment],
                       'rows': [{'version': '1', 'name': 'artifact_export_receipts'},
                                {'version': '2', 'name': 'artifact_import_candidates'}]}
            return installed.compare(replay, functions, remote, remote_functions, journal, manifest, environment, root)

    def test_existing_rewritten_helper_is_in_hash_scope_before_anchor_refresh(self):
        result = self.run_comparison(remote_hash='b' * 64)
        self.assertEqual(result['stage21FunctionBodiesCompared'], 1)
        self.assertTrue(any(error.startswith('function_body_hash_drift:') for error in result['errors']))

    def test_staging_archive_requires_exact_reviewed_contract(self):
        self.assertEqual(self.run_comparison(environment='staging', extra={'id': 'table:archive', 'kind': 'table'})['errors'], [])
        result = self.run_comparison(environment='staging', extra={'id': 'table:archive', 'kind': 'table', 'rls': False})
        self.assertIn('remote_extra_contract_drift:table:archive', result['errors'])

    def test_archive_not_authorized_as_production_extra(self):
        self.assertIn('unreviewed_remote_extra:table:archive',
                      self.run_comparison(extra={'id': 'table:archive', 'kind': 'table'})['errors'])

    def test_wrong_live_project_fails_before_comparison(self):
        with self.assertRaises(ValueError):
            self.run_comparison(project=installed.PROJECTS['staging'])


if __name__ == '__main__':
    unittest.main()
