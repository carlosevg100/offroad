#!/usr/bin/env python3
"""Install closed unpublished 3R/S11/C11 drafts only in an isolated loopback CI DB.
Does not mark migrations applied, change journals, deploy, or run fixtures.
Canonical migrations (including 3U/material) must already be installed.
"""
import os, subprocess, sys, json
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
# Prospective repair is mandatory even when all native consumer groups are already canonical.
# Removed from this list only with its real canonical journal/file publication.
REPAIRS = ('work_optional_capital_purpose.sql', 'work_archive_metadata.sql')
# Whole-function source identities: exact baseline -> exact already-installed forward.
# Each independent group is applied only from baseline; any unrelated drift fails closed.
REPAIR_CONTRACTS = (
 ('work_optional_capital_purpose.sql', 'private.record_intake_capital_need_command(uuid,uuid,uuid,text,text,numeric,text,text,integer,integer,text,text,text,text[],text[],text)', '134f7a72da756610d3ab11cdc30ce15d', '614c2e55d25d465d8ef990dc17e8d732'),
 ('work_archive_metadata.sql', 'private.manage_work_v1(uuid,text,text)', 'f8357632e01ad6cb189d1d31f028758f', 'f8dff144321d51c99c2a76b2f253b4d4'),
)
def select_repairs(hashes):
 if set(hashes) != set(REPAIRS): raise ValueError('Repair source identity set changed')
 selected=[]
 for file, signature, baseline, installed in REPAIR_CONTRACTS:
  if hashes[file] == baseline: selected.append(file)
  elif hashes[file] != installed: raise ValueError('Repair function source drift: '+file)
 return tuple(selected)
def repair_hashes(url):
 pairs=','.join("'"+file+"',(select md5(prosrc) from pg_proc where oid='"+signature+"'::regprocedure)" for file,signature,_,_ in REPAIR_CONTRACTS)
 result=subprocess.run(['psql',url,'-XAtq','-v','ON_ERROR_STOP=1'],input='select json_build_object('+pairs+')::text;',text=True,capture_output=True,check=True)
 return json.loads(result.stdout.strip())
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
  assert all((ROOT/'supabase/pending'/p).is_file() for p in REPAIRS)
  baseline={f:old for f,_,old,_ in REPAIR_CONTRACTS}; installed={f:new for f,_,_,new in REPAIR_CONTRACTS}
  assert select_repairs(baseline)==REPAIRS and select_repairs(installed)==()
  for file in REPAIRS:
   mixed={**installed,file:baseline[file]}; assert select_repairs(mixed)==(file,)
  for bad in ({}, {**baseline,REPAIRS[0]:'0'*32}, {**baseline,'unknown':'0'*32}):
   try: select_repairs(bad)
   except ValueError: pass
   else: raise AssertionError('Unknown/missing repair identity admitted')
  print('native_consumers_ci_draft_install_guards: PASS (no SQL executed)')
  return
 if len(sys.argv) != 1: raise ValueError('No positional target override')
 url=validate(os.environ)
 selected = select_repairs(repair_hashes(url))
 drafts = selected if canonical_groups_installed(ROOT,url,('core11','inherited_restriction')) else DRAFTS + selected
 if not drafts:
  print('native_consumers_ci_drafts: exact canonical/forward sources already installed; no SQL executed'); return
 sql='BEGIN;\n'+'\n'.join((ROOT/'supabase/pending'/p).read_text() for p in drafts)+'\nCOMMIT;\n'
 subprocess.run(['psql',url,'-X','-v','ON_ERROR_STOP=1'],input=sql,text=True,check=True)
 print('native_consumers_ci_drafts: installed atomically; no journal writes')
if __name__ == '__main__': main()
