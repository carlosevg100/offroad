"""Published entries are append-only; every first-party snapshot byte has a Git origin."""
import hashlib,json,subprocess,re
from pathlib import Path
root=Path(__file__).resolve().parents[2]
path='packages/credit-playbook/knowledge/releases/method-release-lock.json'
def git(*args):return subprocess.check_output(['git',*args],cwd=root)
def verify(previous,current):
 before={r['platformReleaseId']:r for r in previous['releases']}
 after={r['platformReleaseId']:r for r in current['releases']}
 assert len(after)==len(current['releases']), 'duplicate released identity'
 for identity,release in before.items():
  assert after.get(identity)==release, 'published release cannot be removed or rewritten: '+identity
if __name__=='__main__':
 current=json.loads((root/path).read_text())
 exists=subprocess.run(['git','cat-file','-e','origin/main:'+path],cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0
 previous=json.loads(git('show','origin/main:'+path)) if exists else {'releases':[]}
 verify(previous,current)
 for release in current['releases']:
  commit=release['sourceCommit'];assert re.fullmatch(r'[a-f0-9]{40}',commit)
  subprocess.run(['git','merge-base','--is-ancestor',commit,'origin/main'],cwd=root,check=True)
  raw=(root/Path(path).parent/(release['snapshotHash']+'.sources.json')).read_bytes()
  assert hashlib.sha256(raw).hexdigest()==release['snapshotHash']
  snapshot=json.loads(raw)
  if not any(r['platformReleaseId']==release['platformReleaseId'] for r in previous['releases']):
   for source,file in snapshot['files'].items():
    if source.startswith('node_modules/'):
     assert '..' not in Path(source).parts
     assert (root/source).read_bytes()==file['content'].encode(), 'new snapshot vendor bytes differ from frozen install: '+source
  for source,content in snapshot['pinned'].items():
   assert git('show',commit+':'+source)==content.encode(), 'snapshot differs from committed source: '+source
 print('PASS: published releases immutable; all pinned sources match their main ancestor')
