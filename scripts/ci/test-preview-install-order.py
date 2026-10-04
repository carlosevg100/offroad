#!/usr/bin/env python3
"""Offline callbacks exercise actual launcher order; no SQL/HTTP/model execution."""
import importlib.util,os,re,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts/ci'))
spec=importlib.util.spec_from_file_location('preview_sdk_launcher',ROOT/'scripts/ci/test-capital-preview-sdk.py')
launcher=importlib.util.module_from_spec(spec);spec.loader.exec_module(launcher)
SUPPORT=('capital_preview_storage_job_authority','capital_preview_native_artifact_publication','capital_preview_dispatch_policy','capital_preview_boundary_validation','capital_preview_review_projection','capital_preview_finalize_bounded_closure')
FILES=('capital_preview_consumed_sources','capital_preview_dispatch_policy','capital_preview_native_consumption','capital_preview_execution_ledger','capital_preview_native_commit','capital_preview_storage_job_authority','capital_preview_native_artifact_publication','capital_preview_physical_input_grammar','capital_preview_boundary_validation','capital_preview_review_projection','capital_preview_finalize_bounded_closure')
def callback_order_sources():
 # Only this subprocess-mocked order harness uses declared fixture bytes.
 # A canonical tree has retired pending SQL: this is never a DDL replay proof.
 if (ROOT/'docs/build/schema-history/stage20-native-canonical.json').is_file():
  return {name:f'-- OFFLINE CALLBACK-ORDER-ONLY FIXTURE: {name}\n'for name in FILES}
 return {name:(ROOT/'supabase/pending'/f'{name}.sql').read_bytes()for name in FILES}

class InstallOrder(unittest.TestCase):
 def execute(self,canonical):
  calls=[]
  with tempfile.TemporaryDirectory(prefix='offroad-preview-offline-order-')as directory:
   root=Path(directory)
   loader=root/'node_modules/.pnpm/tsx@fixture/node_modules/tsx/dist/loader.mjs';loader.parent.mkdir(parents=True);loader.touch()
   for name in SUPPORT+('work_review_dashboard_metadata',):
    dest=root/'supabase/tests/support'/f'{name}.sql';dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes((ROOT/'supabase/tests/support'/f'{name}.sql').read_bytes())
   if not canonical:
    for name in FILES:
     dest=root/'supabase/pending'/f'{name}.sql';dest.parent.mkdir(parents=True,exist_ok=True);value=callback_order_sources()[name];dest.write_bytes(value.encode()if isinstance(value,str)else value)
   def observed(command,**kwargs):
    if command[0]=='psql'and'-f'in command:
     contents=Path(command[command.index('-f')+1]).read_text()
     self.assertNotRegex(contents,r'(?im)^\\i(?:r)?\s+.*pending/')
    if command[0]=='psql'and kwargs.get('input')and'OFFLINE CALLBACK-ORDER-ONLY'in kwargs['input']:
     self.assertFalse(canonical,'Canonical path must not install fixture SQL')
    calls.append((command,kwargs.get('input')))
   env={'DATABASE_URL':'postgresql://127.0.0.1:54322/postgres','OFFROAD_E2E_API_URL':'http://127.0.0.1:54321','OFFROAD_E2E_PUBLISHABLE_KEY':'sb_publishable_fixture','PREVIEW_DRAFTS_IN_LOCAL_STACK':'1'}
   validate_source=getattr(launcher,'validate_preview_forward_source',None)
   def validate_callback_source(name,content):
    if (ROOT/'docs/build/schema-history/stage20-native-canonical.json').is_file():
     self.assertEqual(content,callback_order_sources()[name].encode());return
    if validate_source is not None:validate_source(name,content)
   with patch.object(launcher,'validate_preview_forward_source',side_effect=validate_callback_source,create=True),patch.object(launcher,'ROOT',root),patch.object(launcher,'canonical_groups_installed',return_value=canonical),patch.object(launcher.subprocess,'run',side_effect=observed),patch.dict(os.environ,env,clear=True),patch.object(sys,'argv',['test-capital-preview-sdk.py']):
    launcher.main()
   return calls
 def test_no_manifest_prospective_install_once_before_all_evals(self):
  calls=self.execute(False);installs=[(i,sql)for i,(command,sql)in enumerate(calls)if command[0]=='psql'and sql is not None]
  self.assertEqual(len(installs),1);self.assertEqual(installs[0][0],0)
  sources=callback_order_sources();self.assertEqual(installs[0][1],'begin;\n'+'\n'.join(sources[name].decode()if isinstance(sources[name],bytes)else sources[name]for name in FILES)+'\ncommit;')
  evals=[Path(command[-1]).stem for command,_ in calls if command[0]=='psql'and'-f'in command];self.assertEqual(evals,['work_review_dashboard_metadata',*SUPPORT])
  metadata=next(i for i,(command,_) in enumerate(calls) if command[-1].endswith('install-work-review-dashboard-metadata-ci-draft.py'))
  self.assertGreater(metadata,installs[0][0]);self.assertEqual(Path(calls[metadata+1][0][-1]).stem,'work_review_dashboard_metadata')
 def test_canonical_retirement_needs_no_pending_sources_or_install(self):
  calls=self.execute(True);self.assertFalse(any(command[0]=='psql'and sql is not None for command,sql in calls))
  self.assertEqual(sum(command[0]=='psql'and'-f'in command for command,_ in calls),len(SUPPORT)+1)
  self.assertTrue(calls[0][0][-1].endswith('install-work-review-dashboard-metadata-ci-draft.py'));self.assertEqual(Path(calls[1][0][-1]).stem,'work_review_dashboard_metadata')
 def test_canonical_partial_journal_denies_before_any_subprocess(self):
  env={'DATABASE_URL':'postgresql://127.0.0.1:54322/postgres','OFFROAD_E2E_API_URL':'http://127.0.0.1:54321','OFFROAD_E2E_PUBLISHABLE_KEY':'sb_publishable_fixture','PREVIEW_DRAFTS_IN_LOCAL_STACK':'1'}
  with patch.object(launcher,'canonical_groups_installed',side_effect=ValueError('Canonical replay journal missing or mismatched; draft reinstall prohibited')),patch.object(launcher.subprocess,'run')as run,patch.dict(os.environ,env,clear=True),patch.object(sys,'argv',['test-capital-preview-sdk.py']):
   with self.assertRaisesRegex(ValueError,'Canonical replay journal missing or mismatched'):launcher.main()
   run.assert_not_called()
 def test_all_preview_support_files_never_reinstall_pending_ddl(self):
  files=list((ROOT/'supabase/tests/support').glob('capital_preview*.sql'));self.assertGreaterEqual(len(files),9)
  for file in files:self.assertNotRegex(file.read_text(),r'(?im)^\\i(?:r)?\s+.*pending/',file.name)
if __name__=='__main__':unittest.main()
