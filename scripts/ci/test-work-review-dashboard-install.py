#!/usr/bin/env python3
"""Offline installer contracts; no database, HTTP or migration journal writes."""
import hashlib,importlib.util,json,os,subprocess,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts/ci'))
import native_canonical_install_state as canonical
spec=importlib.util.spec_from_file_location('review_installer',ROOT/'scripts/ci/install-work-review-dashboard-metadata-ci-draft.py')
installer=importlib.util.module_from_spec(spec);spec.loader.exec_module(installer)
DB='postgresql://127.0.0.1:54322/postgres'
ENV={'DATABASE_URL':DB,'OFFROAD_WORK_REVIEW_DRAFT_INSTALL':'isolated-loopback-ci'}
class ReviewInstall(unittest.TestCase):
 def fixture(self,root,manifest=False):
  for name in ('work_review_dashboard','work_review_dashboard_metadata'):
   path=root/'supabase/pending'/f'{name}.sql';path.parent.mkdir(parents=True,exist_ok=True);path.write_text('-- '+name+'\n')
  if manifest:
   groups=[]
   for version,group,name in (('20261004000001','review1','work_review_dashboard'),('20261004000002','review_metadata','work_review_dashboard_metadata')):
    path=root/'supabase/migrations'/f'{version}_{name}.sql';path.parent.mkdir(parents=True,exist_ok=True);path.write_text('-- canonical '+group+'\n')
    groups.append({'group':group,'version':version,'name':name,'path':str(path.relative_to(root)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
   path=root/'docs/build/schema-history/stage20-native-canonical.json';path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps({'groups':groups}))
 def execute(self,root,observed):
  with patch.object(installer,'ROOT',root),patch.dict(os.environ,ENV,clear=True),patch.object(subprocess,'run',side_effect=observed):installer.main()
 def test_prospective_metadata_only_one_transaction(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);self.fixture(root);calls=[];self.execute(root,lambda command,**kw:calls.append((command,kw)))
   self.assertEqual(len(calls),1);self.assertEqual(calls[0][1]['input'],'begin;\n-- work_review_dashboard_metadata\n\ncommit;');self.assertTrue(calls[0][1]['check'])
 def test_complete_canonical_reads_two_journals_no_draft_needed(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);self.fixture(root,True)
   for path in (root/'supabase/pending').glob('*.sql'):path.unlink()
   calls=[]
   def observed(command,**kw):
    calls.append((command,kw));sql=kw['input'];group='review_metadata' if '20261004000002' in sql else 'review1';name='work_review_dashboard_metadata' if group=='review_metadata' else 'work_review_dashboard';version='20261004000002' if group=='review_metadata' else '20261004000001';return subprocess.CompletedProcess(command,0,json.dumps([{'version':version,'name':name}]))
   self.execute(root,observed);self.assertEqual(len(calls),2);self.assertTrue(all('-XAtq' in command for command,_ in calls))
 def test_partial_canonical_missing_second_journal_fails_closed(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);self.fixture(root,True);calls=[]
   def observed(command,**kw):
    calls.append((command,kw));return subprocess.CompletedProcess(command,0,'[]' if '20261004000002' in kw['input'] else '[{"version":"20261004000001","name":"work_review_dashboard"}]')
   with self.assertRaisesRegex(ValueError,'journal missing or mismatched'):self.execute(root,observed)
   self.assertEqual(len(calls),2);self.assertTrue(all('-XAtq' in command for command,_ in calls))
 def test_partial_canonical_manifest_missing_metadata_fails_closed(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);self.fixture(root,True);path=root/'docs/build/schema-history/stage20-native-canonical.json';data=json.loads(path.read_text());data['groups']=data['groups'][:1];path.write_text(json.dumps(data));calls=[]
   def observed(command,**kw):
    calls.append(command);return subprocess.CompletedProcess(command,0,'[{"version":"20261004000001","name":"work_review_dashboard"}]')
   with self.assertRaisesRegex(ValueError,'Canonical group missing'):self.execute(root,observed)
   self.assertEqual(len(calls),1);self.assertIn('-XAtq',calls[0])
 def test_group_mixed_states_are_rejected(self):
  with patch.object(canonical,'canonical_group_installed',side_effect=[True,False]):
   with self.assertRaisesRegex(ValueError,'Partial canonical group set'):canonical.canonical_groups_installed(ROOT,DB,('review1','review_metadata'))
 def test_remote_query_fragment_and_unapproved_mode_rejected_before_subprocess(self):
  for env in ({**ENV,'DATABASE_URL':'postgresql://example.org/postgres'},{**ENV,'DATABASE_URL':DB+'?host=example.org'},{**ENV,'DATABASE_URL':DB+'#outside'},{**ENV,'OFFROAD_WORK_REVIEW_DRAFT_INSTALL':'other'}):
   with self.subTest(env=env),patch.dict(os.environ,env,clear=True),patch.object(subprocess,'run') as run:
    with self.assertRaises(AssertionError):installer.main()
    run.assert_not_called()
 def test_postgres_localhost_and_ipv6_loopback_allowed(self):
  for db in ('postgres://localhost/postgres','postgresql://[::1]:54322/postgres',DB):installer.validate({**ENV,'DATABASE_URL':db})
if __name__=='__main__':unittest.main()
