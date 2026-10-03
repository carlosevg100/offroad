#!/usr/bin/env python3
"""Only isolated loopback CI: install the closed provider draft atomically, no journal writes."""
import os, subprocess, sys
from pathlib import Path
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parents[2]
DRAFT=ROOT/'supabase/pending/capital_native_provider_consumption.sql'
def validate(env):
 p=urlparse(env.get('DATABASE_URL',''))
 if p.scheme!='postgresql' or p.hostname not in ('localhost','127.0.0.1','::1') or p.path in ('','/') or p.query or p.fragment:
  raise ValueError('Explicit isolated loopback PostgreSQL required')
 if env.get('OFFROAD_NATIVE_PROVIDER_DRAFT_INSTALL')!='isolated-loopback-ci':
  raise ValueError('Explicit isolated CI draft installation declaration required')
 return env['DATABASE_URL']
def main():
 if sys.argv[1:]==['--self-test']:
  good={'DATABASE_URL':'postgresql://127.0.0.1:54322/postgres','OFFROAD_NATIVE_PROVIDER_DRAFT_INSTALL':'isolated-loopback-ci'}
  validate(good)
  for bad in ('postgresql://remote.invalid/db','postgresql://localhost/','postgresql://localhost/db?host=remote','http://localhost/db'):
   try:validate({**good,'DATABASE_URL':bad})
   except ValueError:pass
   else:raise AssertionError('Unsafe target admitted')
  try:validate({'DATABASE_URL':good['DATABASE_URL']})
  except ValueError:pass
  else:raise AssertionError('Implicit installation admitted')
  assert DRAFT.is_file();print('native_provider_ci_draft_guards: PASS (no SQL)');return
 if len(sys.argv)!=1:raise ValueError('No positional target override')
 db=validate(os.environ)
 subprocess.run(['psql',db,'-X','-v','ON_ERROR_STOP=1'],input='BEGIN;\n'+DRAFT.read_text()+'\nCOMMIT;\n',text=True,check=True)
 print('native_provider_ci_draft: installed atomically; no journal writes')
if __name__=='__main__':main()
