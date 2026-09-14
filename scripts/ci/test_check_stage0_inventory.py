"""Negative access-surface changes must be detected without rerunning a decision generator."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('checker', Path(__file__).with_name('check-stage0-inventory.py'))
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)
BASE = checker.ROOT / 'docs/build/arcabouco-stage0'

class CoverageTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads((BASE / 'object-decisions.json').read_text())
        cls.catalogue = json.loads((BASE / 'catalogue-production.json').read_text())

    def errors(self, catalogue=None, manifest=None):
        return checker.check(manifest or self.manifest, catalogue or self.catalogue)

    def test_reviewed_production_catalogue_is_covered(self):
        self.assertEqual(self.errors(), [])

    def test_new_public_overload_requires_its_own_decision(self):
        c = copy.deepcopy(self.catalogue)
        f = copy.deepcopy(next(x for x in c['objects'] if x['kind'] == 'function' and x['schema'] == 'public'))
        f['id'] += '_unreviewed_overload'
        c['objects'].append(f)
        self.assertIn('unreviewed_object:' + f['id'], self.errors(c))

    def test_anon_execute_grant_is_not_hidden_by_same_function_name(self):
        c = copy.deepcopy(self.catalogue)
        f = next(x for x in c['objects'] if x['kind'] == 'function')
        f['grants'].append(['anon', 'EXECUTE', False])
        self.assertIn('catalogue_contract_drift:' + f['id'], self.errors(c))

    def test_permissive_policy_rewrite_is_detected(self):
        c = copy.deepcopy(self.catalogue)
        f = next(x for x in c['objects'] if x['kind'] == 'policy' and x['qual'] != 'true')
        f['qual'] = 'true'
        self.assertIn('catalogue_contract_drift:' + f['id'], self.errors(c))

    def test_unlisted_trigger_is_detected(self):
        c = copy.deepcopy(self.catalogue)
        f = copy.deepcopy(next(x for x in c['objects'] if x['kind'] == 'trigger'))
        f['id'] += '_unlisted'
        c['objects'].append(f)
        self.assertIn('unreviewed_object:' + f['id'], self.errors(c))

    def test_staging_only_object_cannot_enter_production_replay(self):
        c = copy.deepcopy(self.catalogue)
        r = next(x for x in self.manifest['objects'] if 'production' not in x['catalogues'])
        c['objects'].append(r['catalogues']['staging'])
        self.assertIn('unapproved_environment:' + r['id'], self.errors(c))

    def test_removing_a_decision_fails_against_actual_catalogue(self):
        m = copy.deepcopy(self.manifest)
        r = next(x for x in m['objects'] if 'production' in x['catalogues'])
        m['objects'].remove(r)
        self.assertIn('unreviewed_object:' + r['id'], self.errors(manifest=m))

    def test_missing_entrypoint_decision_is_detected_from_repository(self):
        m = copy.deepcopy(self.manifest)
        m['repository_items'].remove(next(x for x in m['repository_items'] if x['kind'] == 'entrypoint'))
        self.assertIn('entrypoint_inventory_drift', self.errors(manifest=m))

    def test_reordering_acl_rows_is_not_a_permission_change(self):
        c = copy.deepcopy(self.catalogue)
        for f in c['objects']:
            if 'grants' in f:
                f['grants'].reverse()
        self.assertEqual(self.errors(c), [])

    def test_trigger_target_change_is_detected(self):
        c = copy.deepcopy(self.catalogue)
        f = next(x for x in c['objects'] if x['kind'] == 'trigger')
        f['function'] = 'private.unreviewed_trigger()'
        self.assertIn('catalogue_contract_drift:' + f['id'], self.errors(c))

if __name__ == '__main__':
    unittest.main()
