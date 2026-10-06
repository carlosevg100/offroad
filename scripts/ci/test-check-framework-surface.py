import copy,importlib.util,json,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('surface',Path(__file__).with_name('check-framework-surface.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class FrameworkSurfaceTest(unittest.TestCase):
 def setUp(self):
  self.manifest=json.loads(m.MANIFEST.read_text());self.files=m.production_files(m.ROOT)
 def errors(self):
  with patch.object(m,'production_files',return_value=self.files):return m.check(self.manifest)
 def test_current_surface_is_reviewed(self):self.assertEqual(self.errors(),[])
 def test_new_route_requires_classification_and_negative_test(self):
  self.files['apps/web/src/app/api/unreviewed/route.ts']='export async function GET(){}'
  self.assertIn('unclassified_consumer:apps/web/src/app/api/unreviewed/route.ts',self.errors())
 def test_existing_rpc_consumer_cannot_change_under_old_review(self):
  path=self.manifest['consumers'][0]['path'];self.files[path]+='\n// changed'
  self.assertIn('consumer_changed_without_review:'+path,self.errors())
 def test_classification_without_access_test_is_refused(self):
  row=self.manifest['consumers'][0];row['negativeTests']=[]
  self.assertIn('incomplete_consumer_review:'+row['path'],self.errors())
 def test_test_reference_must_exist(self):
  self.manifest['consumers'][0]['negativeTests']=['absent-negative-test.ts']
  self.assertIn('missing_access_test:absent-negative-test.ts',self.errors())
 def test_new_rpc_needs_a_database_object_decision_even_after_source_review(self):
  path=self.manifest['consumers'][0]['path'];self.files[path]+='\nrpc("unclassified_financial_write",{});'
  with patch.object(m,'production_files',return_value=self.files):actual=m.surface()
  self.manifest['consumers'][0].update(actual[path])
  self.assertIn('unclassified_rpc:'+path+':unclassified_financial_write',self.errors())
 def test_technical_module_cannot_enter_production_dispatch(self):
  path='apps/document-worker/src/main.ts';self.files[path]+='\nimport {createPreviewNativeRuntime} from "./integration-preview-native-runtime";'
  self.assertIn('technical_module_in_production:'+path+':./integration-preview-native-runtime',self.errors())
 def test_new_file_cannot_borrow_the_name_of_an_isolated_module(self):
  path='apps/document-worker/src/integration-preview-unreviewed.ts';self.files[path]='import {createPreviewNativeRuntime} from "./integration-preview-native-runtime";'
  self.assertIn('technical_module_in_production:'+path+':./integration-preview-native-runtime',self.errors())
 def test_retired_dispatch_cannot_open_gateway_before_denial(self):
  path='apps/document-worker/src/main.ts';self.files[path]=self.files[path].replace('rejectRetiredFrameworkJob(job, queue)','removedBarrier(job, queue)')
  self.assertIn('retired_dispatch_barrier_missing',self.errors())
if __name__=='__main__':unittest.main()
