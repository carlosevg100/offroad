"""Read-only canonical replay gate, called only after each existing loopback guard."""
import hashlib,json,subprocess
from pathlib import Path
from urllib.parse import urlparse

def canonical_group_installed(root,db,group):
 p=urlparse(db)
 if p.scheme not in ('postgres','postgresql')or p.hostname not in ('127.0.0.1','localhost','::1')or p.query or p.fragment:raise ValueError('Canonical check requires isolated loopback')
 manifest=Path(root)/'docs/build/schema-history/stage20-native-canonical.json'
 if not manifest.exists():return False
 data=json.loads(manifest.read_text());groups={x['group']:x for x in data['groups']}
 if group not in groups:raise ValueError('Canonical group missing')
 row=groups[group];version=row['version'];name=row['name']
 if not(version.isdigit()and len(version)==14)or not all(c.isalnum()or c=='_'for c in name):raise ValueError('Canonical identity invalid')
 file=Path(root)/row['path']
 if not file.resolve().is_relative_to(Path(root).resolve())or not file.is_file()or hashlib.sha256(file.read_bytes()).hexdigest()!=row['sha256']:raise ValueError('Canonical source drift')
 sql="select coalesce(json_agg(json_build_object('version',version,'name',name)),'[]'::json)::text from supabase_migrations.schema_migrations where version='"+version+"';"
 result=subprocess.run(['psql',db,'-XAtq','-v','ON_ERROR_STOP=1'],input=sql,text=True,capture_output=True,check=True)
 records=json.loads(result.stdout.strip())
 if records!=[{'version':version,'name':name}]:raise ValueError('Canonical replay journal missing or mismatched; draft reinstall prohibited')
 print('canonical_native_group:'+group+': already applied; no draft SQL executed')
 return True


def canonical_groups_installed(root,db,groups):
 states=[canonical_group_installed(root,db,g)for g in groups]
 if len(set(states))>1:raise ValueError('Partial canonical group set; draft reinstall prohibited')
 return all(states)
