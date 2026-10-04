import hashlib,json,shutil
from pathlib import Path
a=Path(__file__).resolve().parents[2];r=Path.cwd();m=json.loads((a/'REVIEW-PERFORMANCE-OVERLAYS.json').read_text())
assert m['base']=='23106724c9a510f1cf89c6ac662a94fe0b4a91c3'and len(m['files'])==4
for x in m['files']:
 p=x['path'];s=a/p;t=r/p;assert hashlib.sha256(s.read_bytes()).hexdigest()==x['sha256']
 if x.get('baseSha256'):assert hashlib.sha256(t.read_bytes()).hexdigest()==x['baseSha256']
 elif x.get('baseBlob') is None:assert not t.exists()
 t.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(s,t)
print('exact diagnostic overlays installed; not a release or production change')
