#!/usr/bin/env python3
"""Finite native preview through an isolated real Supabase stack, never remote."""
import os,subprocess,sys,json,base64,hashlib
from pathlib import Path
from native_canonical_install_state import canonical_group_installed, canonical_groups_installed
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parents[2]

# Exact immutable stage forward bodies; not migration-journal or production claims.
PREVIEW_FORWARD_HASHES = {'capital_preview_storage_job_authority': 'e3e22545f636799d8126fe5e0b11f8e8139c8f5b8c7bd506a6daadfbd621b56e', 'capital_preview_native_artifact_publication': 'c9624ab79ddc003a907ee50f23be0e579a743a953100de43f6800e7799147e93', 'capital_preview_physical_input_grammar': 'e3a736c5a519e44d6b6373c0e18428f27c38be5401032521669ef4e1e0d86c8e', 'capital_preview_boundary_validation': '8cbdd8f9b42bc7c6b317d7f6ea5892ca7ebc138ab4a7edb3bde5bb476547b7d0', 'capital_preview_review_projection': '378ddf723c5400f2d9da91ab9c416a664f7c001ca636d96fd6908f3aad2b526d', 'capital_preview_finalize_bounded_closure': '7436c04363d4f1b88df1cf3a51dff8dbd229cbdff8daa6a03489ec632d487539'}
def validate_preview_forward_source(name,content):
 if name not in PREVIEW_FORWARD_HASHES or hashlib.sha256(content).hexdigest()!=PREVIEW_FORWARD_HASHES[name]:
  raise ValueError("Preview stage forward source missing or changed")
def preview_draft_sql(files):
 sources=[]
 for name in files:
  content=(ROOT/"supabase/pending"/f"{name}.sql").read_bytes()
  if name in PREVIEW_FORWARD_HASHES:validate_preview_forward_source(name,content)
  sources.append(content.decode("utf-8"))
 return "begin;\n"+"\n".join(sources)+"\ncommit;"
def validate(env):
 for key,scheme in [('DATABASE_URL','postgresql'),('OFFROAD_E2E_API_URL','http')]:
  p=urlparse(env.get(key,''));assert p.scheme==scheme and p.hostname in ('localhost','127.0.0.1','::1'),'Loopback disposable stack required'
  assert not p.query and not p.fragment,'Closed target required'
  if scheme=='http':assert not p.username and not p.password and p.path in ('','/'),'Closed API root required'
 key=env.get('OFFROAD_E2E_PUBLISHABLE_KEY','');assert key and not key.startswith('sb_secret_'),'Publishable key required'
 if not key.startswith('sb_publishable_'):
  try:role=json.loads(base64.urlsafe_b64decode(key.split('.')[1]+'==='))['role']
  except Exception:raise AssertionError('Anonymous key required')from None
  assert role=='anon','Anonymous key required'
 assert not any(env.get(k)for k in ['S11_HTTP_FIXTURE','S11_FIXTURE_CONTINUATION','S11_FIXTURE_RENDERER','BRIEF_UI_FIXTURE','BRIEF_DRAFT_IN_TRANSACTION']),'Independent native bootstrap required'
def main():
 if sys.argv[1:]==['--self-test']:
  for db,api in [('postgresql://example.org/db','http://127.0.0.1:54321'),('postgresql://127.0.0.1:54322/postgres','https://example.supabase.co')]:
   try:validate({'DATABASE_URL':db,'OFFROAD_E2E_API_URL':api,'OFFROAD_E2E_PUBLISHABLE_KEY':'sb_publishable_fixture'})
   except AssertionError:pass
   else:raise AssertionError('Remote fixture admitted')
  for name in PREVIEW_FORWARD_HASHES:
   content=(ROOT/"supabase/pending"/f"{name}.sql").read_bytes();validate_preview_forward_source(name,content)
   try:validate_preview_forward_source(name,content+b"\n")
   except ValueError:pass
   else:raise AssertionError("Changed stage forward admitted")
  print('capital_preview_portable_target_guard_and_six_stage_sources: PASS (no SQL/HTTP)');return
 assert len(sys.argv)==1;env=os.environ.copy();validate(env)
 if env.get('PREVIEW_DRAFTS_IN_LOCAL_STACK')=='1' and not canonical_groups_installed(ROOT,env['DATABASE_URL'],('preview5','preview_storage_job_authority','preview_native_artifact_publication','preview_physical_input_grammar','preview_boundary_validation','preview_review_projection','preview_finalize_bounded_closure')):
  files=['capital_preview_consumed_sources','capital_preview_dispatch_policy','capital_preview_native_consumption','capital_preview_execution_ledger','capital_preview_native_commit','capital_preview_storage_job_authority','capital_preview_native_artifact_publication','capital_preview_physical_input_grammar','capital_preview_boundary_validation','capital_preview_review_projection','capital_preview_finalize_bounded_closure']
  sql=preview_draft_sql(files)
  subprocess.run(['psql',env['DATABASE_URL'],'-Xq','-v','ON_ERROR_STOP=1'],input=sql,text=True,env=env,cwd=ROOT,check=True)
 if env.get('PREVIEW_INTEGRATED_REVIEW_EVAL')=='1' and env.get('PREVIEW_REVIEW_DRAFT_IN_LOCAL_STACK')=='1' and not canonical_group_installed(ROOT,env['DATABASE_URL'],'review1'):
  draft=ROOT/'supabase/pending/work_review_dashboard.sql'
  assert draft.is_file(),'Frozen 3W review wrappers required'
  subprocess.run(['psql',env['DATABASE_URL'],'-Xq','-v','ON_ERROR_STOP=1'],input='begin;\n'+draft.read_text()+'\ncommit;',text=True,env=env,cwd=ROOT,check=True)
 for name in ('capital_preview_storage_job_authority','capital_preview_native_artifact_publication','capital_preview_dispatch_policy','capital_preview_boundary_validation','capital_preview_review_projection','capital_preview_finalize_bounded_closure'):
  subprocess.run(['psql',env['DATABASE_URL'],'-Xq','-v','ON_ERROR_STOP=1','-f',str(ROOT/'supabase/tests/support'/f'{name}.sql')],env=env,cwd=ROOT,check=True)
 env['PREVIEW_HTTP_FIXTURE']='1';env.setdefault('PREVIEW_HTTP_NAMESPACE','a8830001')
 loader=next((ROOT/'node_modules/.pnpm').glob('tsx@*/node_modules/tsx/dist/loader.mjs'))
 sdk=['node','--import',str(loader),str(ROOT/'apps/document-worker/scripts/capital-preview-native-sdk-eval.ts')]
 subprocess.run(['pnpm','exec','tsc','-p','apps/document-worker/scripts/tsconfig-capital-preview-sdk-eval.json'],env=env,cwd=ROOT,check=True)
 subprocess.run(sdk+['--self-test'],env=env,cwd=ROOT,check=True)
 subprocess.run([sys.executable,str(ROOT/'scripts/ci/test-execution-brief-native-agent.py')],env=env,cwd=ROOT,check=True)
 subprocess.run(sdk,env=env,cwd=ROOT,check=True)
if __name__=='__main__':main()
