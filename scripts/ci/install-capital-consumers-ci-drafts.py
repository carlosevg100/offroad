#!/usr/bin/env python3
"""Install closed unpublished 3R/S11/C11 drafts only in an isolated loopback CI DB.
Does not mark migrations applied, change journals, deploy, or run fixtures.
Canonical migrations (including 3U/material) must already be installed.
"""
import os, subprocess, sys
from pathlib import Path
from native_canonical_install_state import canonical_groups_installed
from urllib.parse import urlparse
ROOT = Path(__file__).resolve().parents[2]
DRAFTS = (
 'capital_public_artifact_review_cutover.sql',
 'capital_s11_native_consumption.sql', 'capital_s11_execution_ledger.sql',
 'capital_s11_task_projections.sql', 'capital_s11_native_commit.sql', 'capital_s11_native_revision.sql',
 'capital_debt_native_consumption.sql', 'capital_debt_execution_ledger.sql',
 'capital_debt_task_projections.sql', 'capital_debt_native_commit.sql', 'capital_debt_native_revision.sql',
 'artifact_native_inherited_restriction.sql',
)
def validate(env):
 p = urlparse(env.get('DATABASE_URL', ''))
 if p.scheme != 'postgresql' or p.hostname not in ('127.0.0.1', 'localhost', '::1') or p.path in ('', '/') or p.query or p.fragment:
  raise ValueError('Explicit isolated loopback PostgreSQL required')
 if env.get('OFFROAD_NATIVE_CONSUMERS_DRAFT_INSTALL') != 'isolated-loopback-ci':
  raise ValueError('Explicit isolated CI draft installation declaration required')
 return env['DATABASE_URL']
def main():
 if sys.argv[1:] == ['--self-test']:
  good={'DATABASE_URL':'postgresql://127.0.0.1:54322/postgres','OFFROAD_NATIVE_CONSUMERS_DRAFT_INSTALL':'isolated-loopback-ci'}
  validate(good)
  for url in ('postgresql://db.project.supabase.co/postgres','postgresql://localhost/', 'postgresql://127.0.0.1/postgres?host=remote', 'http://localhost/postgres'):
   try: validate({**good, 'DATABASE_URL':url})
   except ValueError: pass
   else: raise AssertionError('Remote/ambiguous target admitted')
  try: validate({'DATABASE_URL':good['DATABASE_URL']})
  except ValueError: pass
  else: raise AssertionError('Implicit draft install admitted')
  assert (ROOT/'docs/build/schema-history/stage20-native-canonical.json').is_file() or all((ROOT/'supabase/pending'/p).is_file() for p in DRAFTS)
  print('native_consumers_ci_draft_install_guards: PASS (no SQL executed)')
  return
 if len(sys.argv) != 1: raise ValueError('No positional target override')
 url=validate(os.environ)
 if canonical_groups_installed(ROOT,url,('core11','inherited_restriction')): return
 sql='BEGIN;\n'+'\n'.join((ROOT/'supabase/pending'/p).read_text() for p in DRAFTS)+'\nCOMMIT;\n'
 subprocess.run(['psql',url,'-X','-v','ON_ERROR_STOP=1'],input=sql,text=True,check=True)
 print('native_consumers_ci_drafts: installed atomically; no journal writes')
if __name__ == '__main__': main()
