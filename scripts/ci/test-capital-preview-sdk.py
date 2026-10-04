#!/usr/bin/env python3
"""Finite native preview through an isolated real Supabase stack, never remote."""
import os,subprocess,sys,json,base64
from pathlib import Path
from native_canonical_install_state import canonical_group_installed, canonical_groups_installed
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parents[2]
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
  print('capital_preview_portable_target_guard: PASS (no SQL/HTTP)');return
 assert len(sys.argv)==1;env=os.environ.copy();validate(env)
 if env.get('PREVIEW_DRAFTS_IN_LOCAL_STACK')=='1' and not canonical_groups_installed(ROOT,env['DATABASE_URL'],('preview5','preview_storage_job_authority','preview_native_artifact_publication','preview_physical_input_grammar','preview_boundary_validation','preview_review_projection','preview_finalize_bounded_closure')):
  files=['capital_preview_consumed_sources','capital_preview_dispatch_policy','capital_preview_native_consumption','capital_preview_execution_ledger','capital_preview_native_commit','capital_preview_storage_job_authority','capital_preview_native_artifact_publication','capital_preview_physical_input_grammar','capital_preview_boundary_validation','capital_preview_review_projection','capital_preview_finalize_bounded_closure']
  sql='begin;\n'+'\n'.join((ROOT/'supabase/pending'/f'{name}.sql').read_text()for name in files)+'\ncommit;'
  subprocess.run(['psql',env['DATABASE_URL'],'-Xq','-v','ON_ERROR_STOP=1'],input=sql,text=True,env=env,cwd=ROOT,check=True)
 if env.get('PREVIEW_INTEGRATED_REVIEW_EVAL')=='1' and env.get('PREVIEW_REVIEW_DRAFT_IN_LOCAL_STACK')=='1' and not canonical_group_installed(ROOT,env['DATABASE_URL'],'review1'):
  draft=ROOT/'supabase/pending/work_review_dashboard.sql'
  assert draft.is_file(),'Frozen 3W review wrappers required'
  subprocess.run(['psql',env['DATABASE_URL'],'-Xq','-v','ON_ERROR_STOP=1'],input='begin;\n'+draft.read_text()+'\ncommit;',text=True,env=env,cwd=ROOT,check=True)
 # Source16 requires the current complete preview closure, installed above.
 # Canonical stacks skip DDL through the same two-group journal guard; eval never skips.
 metadata_env={**env,'OFFROAD_WORK_REVIEW_DRAFT_INSTALL':'isolated-loopback-ci'}
 subprocess.run([sys.executable,str(ROOT/'scripts/ci/install-work-review-dashboard-metadata-ci-draft.py')],env=metadata_env,cwd=ROOT,check=True)
 subprocess.run(['psql',env['DATABASE_URL'],'-Xq','-v','ON_ERROR_STOP=1','-f',str(ROOT/'supabase/tests/support/work_review_dashboard_metadata.sql')],env=env,cwd=ROOT,check=True)
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
