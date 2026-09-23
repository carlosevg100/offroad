import importlib.util,unittest,copy
from pathlib import Path
spec=importlib.util.spec_from_file_location('lock',Path(__file__).with_name('verify-published-method-lock.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class PublishedLockTests(unittest.TestCase):
 def setUp(self):self.before={'releases':[{'platformReleaseId':'published','manifest':'fixed','artifact':'fixed'}]}
 def test_append_preserves_old_identity(self):
  after=copy.deepcopy(self.before);after['releases'].append({'platformReleaseId':'new','manifest':'new','artifact':'new'});module.verify(self.before,after)
 def test_deleted_or_modified_release_is_rejected(self):
  with self.assertRaises(AssertionError):module.verify(self.before,{'releases':[]})
  changed=copy.deepcopy(self.before);changed['releases'][0]['artifact']='changed'
  with self.assertRaises(AssertionError):module.verify(self.before,changed)
 def test_duplicate_identity_is_rejected(self):
  with self.assertRaises(AssertionError):module.verify(self.before,{'releases':self.before['releases']*2})
 def test_technical_preparer_identity_is_append_only(self):
  before={'releases':[{'id':'preparer-v1','artifactHash':'fixed'}]}
  module.verify(before,{'releases':before['releases']+[{'id':'preparer-v2','artifactHash':'new'}]},'id')
  with self.assertRaises(AssertionError):module.verify(before,{'releases':[{'id':'preparer-v1','artifactHash':'changed'}]},'id')
if __name__=='__main__':unittest.main()
