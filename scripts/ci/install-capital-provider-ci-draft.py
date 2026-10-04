#!/usr/bin/env python3
"""Only isolated loopback CI: install the closed provider draft atomically, no journal writes."""
import os, subprocess, sys, hashlib
from pathlib import Path
from native_canonical_install_state import canonical_groups_installed
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parents[2]
DRAFT=ROOT/'supabase/pending/capital_native_provider_consumption.sql'
RESULT_CONTRACT=ROOT/'supabase/pending/capital_native_case_fit_result_contract.sql'
RESULT_CONTRACT_SHA256='55e51c79582f0189cf9d3efa04a28fd8aa5f775ed494235de74cc07fe01f41ff'
def candidate_sql():
 if hashlib.sha256(RESULT_CONTRACT.read_bytes()).hexdigest()!=RESULT_CONTRACT_SHA256:raise ValueError('Frozen provider result contract source drift')
 return 'BEGIN;\n'+DRAFT.read_text()+'\n'+RESULT_CONTRACT.read_text()+'\nCOMMIT;\n'
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
  canonical=(ROOT/'docs/build/schema-history/stage20-native-canonical.json').is_file()
  assert canonical or (DRAFT.is_file() and RESULT_CONTRACT.is_file())
  if not canonical:
   combined=candidate_sql();assert combined.startswith('BEGIN;\n') and combined.endswith('COMMIT;\n')
   assert combined.index('create function private.worker_prepare_capital_native_result_v1') < combined.index('capital_native_casefit_installed_definition_drift')
   for guard in ("p_content?'objective'","p_content->>'organizationId'","p_content->>'planFingerprint'","p_content->'caseCriteria'"):
    assert guard in RESULT_CONTRACT.read_text()
  print('native_provider_ci_draft_guards: PASS (target/auth, atomic base+group7 order, frozen source and four strict guards; no SQL)');return
 if len(sys.argv)!=1:raise ValueError('No positional target override')
 db=validate(os.environ)
 if canonical_groups_installed(ROOT,db,('provider1','case_fit_result_contract')):return
 subprocess.run(['psql',db,'-X','-v','ON_ERROR_STOP=1'],input=candidate_sql(),text=True,check=True)
 print('native_provider_ci_draft: provider1 and case_fit_result_contract installed atomically; no journal writes')
if __name__=='__main__':main()
