"""Regression checks for recovered SQL integrity and archive isolation."""
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import sys
import unittest

sys.dont_write_bytecode = True

SPEC = importlib.util.spec_from_file_location('recovered_schema', Path(__file__).with_name('verify-recovered-schema.py'))
CHECKER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECKER)


class RecoveredSchemaTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.manifest = json.loads((CHECKER.ROOT / CHECKER.MANIFEST).read_text())
        for file in [str(CHECKER.MANIFEST)] + [r['file'] for r in self.manifest['records']]:
            target = self.root / file
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(CHECKER.ROOT / file, target)

    def test_sixteen_recovered_files_pass(self):
        self.assertEqual(CHECKER.verify(self.root)['archived_outside_replay'], 9)

    def test_modified_production_sql_is_rejected(self):
        row = next(r for r in self.manifest['records'] if r['production_version'])
        with (self.root / row['file']).open('a') as handle:
            handle.write('\n-- unauthorized change\n')
        with self.assertRaisesRegex(ValueError, 'Changed recovered bytes'):
            CHECKER.verify(self.root)

    def test_staging_archive_in_replay_is_rejected(self):
        row = next(r for r in self.manifest['records'] if not r['production_version'])
        shutil.copyfile(self.root / row['file'], self.root / 'supabase/migrations' / f"{row['staging_version']}_{row['name']}.sql")
        with self.assertRaisesRegex(ValueError, 'Staging-only migration entered replay'):
            CHECKER.verify(self.root)

    def test_missing_archive_file_is_rejected(self):
        row = next(r for r in self.manifest['records'] if not r['production_version'])
        (self.root / row['file']).unlink()
        with self.assertRaisesRegex(ValueError, 'Missing regular file'):
            CHECKER.verify(self.root)

    def test_wrong_production_stamp_is_rejected(self):
        row = next(r for r in self.manifest['records'] if r['production_version'])
        row['production_version'] = '20000101000000'
        (self.root / CHECKER.MANIFEST).write_text(json.dumps(self.manifest))
        with self.assertRaisesRegex(ValueError, 'Incorrect production replay location'):
            CHECKER.verify(self.root)


if __name__ == '__main__':
    unittest.main()
