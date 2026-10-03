#!/usr/bin/env python3
"""Install only the five frozen preview drafts on declared disposable loopback CI; no SDK or journal."""
import hashlib,os,subprocess,sys
from pathlib import Path
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parents[2]
PINS={
 'capital_preview_consumed_sources':'dfb67b217e8a212b82ef97cab14eacf160fec2715bd7762fd57f2bde34cd197f',
 'capital_preview_dispatch_policy':'08752c9b68e54bcb190126a3aacb17e164d79f1bfcb4425c8a2b95d7b14a67ff',
 'capital_preview_native_consumption':'5f65364c7249aa2515a3b0f7bee3089638c7b3b944bd25ae1a354532b3455e5e',
 'capital_preview_execution_ledger':'716192bd5d734b3074fe90c92e70d658a1dddacabb5a2aa73c2d48a12f51fbcd',
 'capital_preview_native_commit':'721371d24d3c69e9f6f433e8bb1550a99eae76f20b4449080d71173443a2368a'}
def validate(env):
 p=urlparse(env.get('DATABASE_URL',''))
 if p.scheme!='postgresql' or p.hostname not in ('localhost','127.0.0.1','::1') or p.path in ('','/') or p.query or p.fragment:raise ValueError('Explicit isolated loopback PostgreSQL required')
 if env.get('OFFROAD_NATIVE_PREVIEW_DRAFT_INSTALL')!='isolated-loopback-ci':raise ValueError('Explicit isolated CI installation declaration required')
 return env['DATABASE_URL']
def main():
 if sys.argv[1:]==['--self-test']:
  good={'DATABASE_URL':'postgresql://127.0.0.1:54322/postgres','OFFROAD_NATIVE_PREVIEW_DRAFT_INSTALL':'isolated-loopback-ci'};validate(good)
  for value in ('postgresql://remote.invalid/db','postgresql://localhost/','postgresql://localhost/db?host=remote','http://localhost/db'):
   try:validate({**good,'DATABASE_URL':value})
   except ValueError:pass
   else:raise AssertionError('Unsafe target admitted')
  try:validate({'DATABASE_URL':good['DATABASE_URL']})
  except ValueError:pass
  else:raise AssertionError('Implicit installation admitted')
  print('preview five installer loopback/hashes interface PASS; no SQL or SDK');return
 if len(sys.argv)!=1:raise ValueError('No positional target override')
 db=validate(os.environ);parts=[]
 for name,pin in PINS.items():
  b=(ROOT/'supabase/pending'/(name+'.sql')).read_bytes()
  if hashlib.sha256(b).hexdigest()!=pin:raise RuntimeError('Frozen preview source drift:'+name)
  parts.append(b.decode())
 subprocess.run(['psql',db,'-X','-v','ON_ERROR_STOP=1','-q'],input='BEGIN;\n'+'\n'.join(parts)+'\nCOMMIT;\n',text=True,cwd=ROOT,check=True)
 print('preview five drafts installed atomically; no model, HTTP or journal writes')
if __name__=='__main__':main()
