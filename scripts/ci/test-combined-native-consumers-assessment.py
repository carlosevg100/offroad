#!/usr/bin/env python3
"""17-draft proof on a dedicated disposable loopback Supabase baseline only.
No stack startup/reset, remote target, migration journal, or privileged fake receipt.
Run once on a fresh CI stack, separate from other fixture consumers.
"""
import argparse,hashlib,json,os,pathlib,re,subprocess,sys
from urllib.parse import urlparse
ROOT=pathlib.Path(__file__).resolve().parents[2]
CONSUMERS=('capital_public_artifact_review_cutover','capital_s11_native_consumption','capital_s11_execution_ledger','capital_s11_task_projections','capital_s11_native_commit','capital_s11_native_revision','capital_debt_native_consumption','capital_debt_execution_ledger','capital_debt_task_projections','capital_debt_native_commit','capital_debt_native_revision')
ASSESSMENT=('assessment_input_capture','assessment_review_projection','assessment_effective_case_input','work_update_native_adoption','assessment_institutional_capture','assessment_research_capture')
def validate(env):
 p=urlparse(env.get('DATABASE_URL',''))
 if p.scheme!='postgresql' or p.hostname not in('127.0.0.1','localhost','::1') or p.path in('', '/') or p.query or p.fragment:raise ValueError('Dedicated disposable loopback PostgreSQL only')
 if env.get('OFFROAD_COMBINED_NATIVE_EVAL')!='isolated-loopback-ci':raise ValueError('Explicit combined disposable evaluation required')
 return env['DATABASE_URL']
def run(command,env,phase,input=None):
 result=subprocess.run(command,env=env,input=input,text=True,capture_output=True,timeout=300)
 if result.returncode:
  # Existing fixture output stays synthetic and local; report a bounded phase,
  # never the connection URL, credentials or arbitrary SQL error/body text.
  diagnostic=result.stdout+'\n'+result.stderr
  states=sorted(set(re.findall(r'(?:ERROR|FATAL):\s+([0-9A-Z]{5}):',diagnostic)))
  allowed=set()
  for test in (v/'supabase/tests/support').glob('*.sql'):
   allowed.update(re.findall(r"raise exception '([a-zA-Z0-9_]+)'",test.read_text(),re.I))
  allowed.update(re.findall(r"raise exception '([a-zA-Z0-9_]+)'",(ROOT/'supabase/tests/support/combined_native_wrapper_chain.sql').read_text(),re.I))
  literals=sorted(name for name in allowed if re.search(r'(?:ERROR|FATAL):\s+(?:[0-9A-Z]{5}:\s+)?'+re.escape(name)+r'(?=\s|$)',diagnostic))
  print(json.dumps({'eval':'combined_native_sql','phase':phase,'result':'FAIL','sqlStates':states[:8],'staticTestAssertions':literals[:8]}))
  raise RuntimeError('combined_native_phase_failed:'+phase)
 print(json.dumps({'eval':'combined_native_sql','phase':phase,'result':'PASS'}))
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--consumers-root',required=True);p.add_argument('--assessment-root',required=True);p.add_argument('--self-test',action='store_true');a=p.parse_args()
c=pathlib.Path(a.consumers_root).resolve();v=pathlib.Path(a.assessment_root).resolve()
manifest=json.loads((ROOT/'COMBINED-SOURCES.json').read_text())
for group,folder,names in [('consumers',c,CONSUMERS),('assessment',v,ASSESSMENT)]:
 for name in names:
  source=folder/'supabase/pending'/(name+'.sql')
  if hashlib.sha256(source.read_bytes()).hexdigest()!=manifest[group][name]:raise RuntimeError('Frozen combined source drift:'+name)
if a.self_test:
 good={'DATABASE_URL':'postgresql://127.0.0.1:54322/postgres','OFFROAD_COMBINED_NATIVE_EVAL':'isolated-loopback-ci'};validate(good)
 for url in ('postgresql://db.production.invalid/postgres','postgresql://localhost/', 'postgresql://127.0.0.1/postgres?host=remote','http://localhost/postgres'):
  try:validate({**good,'DATABASE_URL':url})
  except ValueError:pass
  else:raise AssertionError('Unsafe target admitted')
 try:validate({'DATABASE_URL':good['DATABASE_URL']})
 except ValueError:pass
 else:raise AssertionError('Implicit fixture target admitted')
 print('combined_native_harness_guard: PASS; hashes17 confirmed; no SQL executed');sys.exit(0)
url=validate(os.environ);env=dict(os.environ)
psql=['psql',url,'-X','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose']
# Do not reuse any root/WB stack with already installed candidates. The canonical
# M07/material baseline is a prerequisite and never fabricated by this harness.
preflight="""do $$begin
if to_regclass('private.capital_m07_recipes')is null or to_regclass('private.material_production_recipes')is null then raise exception 'combined_baseline_missing';end if;
if to_regclass('private.capital_s11_recipes')is not null or to_regclass('private.capital_debt_recipes')is not null or to_regclass('private.assessment_input_snapshots')is not null then raise exception 'combined_requires_fresh_dedicated_stack';end if;
end$$;"""
run(psql,env,'fresh-baseline',preflight)
env['OFFROAD_NATIVE_CONSUMERS_DRAFT_INSTALL']='isolated-loopback-ci'
run([sys.executable,str(c/'scripts/ci/install-capital-consumers-ci-drafts.py')],env,'install11-consumers')
run([sys.executable,str(v/'scripts/ci/install-assessment-native-local.py')],env,'install6-assessment')
run(psql+['-f',str(ROOT/'supabase/tests/support/combined_native_wrapper_chain.sql')],env,'wrapper-chain-and-ACL')
for name in ('capital_debt_execution_ledger','capital_s11_task_projections'):
 run(psql+['-f',str(c/'supabase/tests/support'/(name+'.sql'))],env,name+'-catalogue-hostile-commands')
# Reuse the exact four checked-in rollback inputs and include expansion used by
# test-assessment-native.py, but separate phases and SQLSTATE diagnostics.
# All six drafts are already installed; no test/query semantic changes.
def expand(path):
 return re.sub(r'^\\ir (.+)$',lambda m:expand(path.parent/m[1].strip()),path.read_text(),flags=re.M)
for name in ('assessment_review_projection','assessment_rejection_and_revision','assessment_public_research_denial','work_update_native_adoption'):
 test=v/'supabase/tests/support'/('assessment_native_'+name+'.sql')
 run(psql,env,'assessment-'+name,expand(test))
print(json.dumps({'eval':'combined_native_install_and_SQL','result':'PASS','drafts':17,'order':'11-consumers-then6-assessment','evidence':'real disposable SQL; not SDK HTTP or production'}))
