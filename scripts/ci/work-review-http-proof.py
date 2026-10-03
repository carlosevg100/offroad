#!/usr/bin/env python3
"""Temporary source-free browser diagnostic; installation is isolated loopback only."""
import os,sys,subprocess
from pathlib import Path
from urllib.parse import urlparse
PREVIEW=('capital_preview_consumed_sources.sql','capital_preview_dispatch_policy.sql','capital_preview_native_consumption.sql','capital_preview_execution_ledger.sql','capital_preview_native_commit.sql')
def validate(env):
 p=urlparse(env.get('DATABASE_URL',''))
 if p.scheme!='postgresql' or p.hostname not in ('localhost','127.0.0.1','::1') or p.path in ('','/') or p.query or p.fragment:raise ValueError('Explicit disposable loopback database required')
 if env.get('OFFROAD_REVIEW_HTTP_PROOF')!='isolated-loopback-ci':raise ValueError('Explicit temporary proof declaration required')
 return env['DATABASE_URL']
def main():
 if sys.argv[1:]==['--self-test']:
  good={'DATABASE_URL':'postgresql://postgres:postgres@127.0.0.1:54322/postgres','OFFROAD_REVIEW_HTTP_PROOF':'isolated-loopback-ci'};validate(good)
  for bad in ('postgresql://db.remote.invalid/postgres','postgresql://localhost/','postgresql://localhost/postgres?host=remote','http://localhost/postgres'):
   try:validate({**good,'DATABASE_URL':bad})
   except ValueError:pass
   else:raise AssertionError('Nonlocal target admitted')
  try:validate({'DATABASE_URL':good['DATABASE_URL']})
  except ValueError:pass
  else:raise AssertionError('Implicit installation admitted')
  assert len(PREVIEW)==5 and len(set(PREVIEW))==5
  print('work_review_http_proof_target_guards: PASS (no SQL/HTTP)');return
 if sys.argv[1:]!=['--install-preview']:raise ValueError('Closed command required')
 db=validate(os.environ);root=Path.cwd();files=[root/'supabase/pending'/f for f in PREVIEW]
 if not all(p.is_file()for p in files):raise ValueError('Frozen preview drafts missing')
 sql='BEGIN;\n'+'\n'.join(p.read_text()for p in files)+'\nCOMMIT;\n'
 subprocess.run(['psql',db,'-Xq','-v','ON_ERROR_STOP=1'],input=sql,text=True,check=True)
 print('work_review_http_preview_install: PASS (atomic; no journal writes)')
if __name__=='__main__':main()
