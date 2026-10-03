#!/usr/bin/env python3
"""Install frozen11 before every existing auto-enumerated SQL contract.
Dedicated fresh loopback Supabase only. No stamps, mocks or SQL weakening.
"""
import argparse,hashlib,json,os,pathlib,re,subprocess,sys
from urllib.parse import urlparse
ROOT=pathlib.Path(__file__).resolve().parents[2]
def validate(env):
 p=urlparse(env.get('DATABASE_URL',''))
 if p.scheme!='postgresql' or p.hostname not in('127.0.0.1','localhost','::1') or p.path in('','/') or p.query or p.fragment:raise ValueError('Dedicated loopback PostgreSQL only')
 if env.get('OFFROAD_CORE_CANONICAL_START_EVAL')!='isolated-loopback-ci':raise ValueError('Explicit disposable canonical-start evaluation required')
 return env['DATABASE_URL']
def diagnostic(stderr,sources):
 states=sorted(set(re.findall(r'(?:ERROR|FATAL):\s+([0-9A-Z]{5}):',stderr)))
 allowed=set()
 for text in sources:
  allowed.update(re.findall(r"raise exception '([a-zA-Z0-9_]+)'",text,re.I))
 literals=sorted(x for x in allowed if re.search(r'(?:ERROR|FATAL):\s+(?:[0-9A-Z]{5}:\s+)?'+re.escape(x)+r'(?=\s|$)',stderr))
 return {'sqlStates':states[:8],'checkedInExceptionLiterals':literals[:16]}
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--core-root',required=True);p.add_argument('--self-test',action='store_true');a=p.parse_args();core=pathlib.Path(a.core_root).resolve()
m=json.loads((ROOT/'CORE-CANONICAL-SOURCES.json').read_text())
for name,pin in m['drafts'].items():
 if hashlib.sha256((core/'supabase/pending'/(name+'.sql')).read_bytes()).hexdigest()!=pin:raise RuntimeError('Frozen core draft drift:'+name)
if a.self_test:
 good={'DATABASE_URL':'postgresql://127.0.0.1:54322/postgres','OFFROAD_CORE_CANONICAL_START_EVAL':'isolated-loopback-ci'};validate(good)
 for u in ('postgresql://remote.invalid/postgres','postgresql://localhost/','postgresql://localhost/db?host=remote','http://localhost/db'):
  try:validate({**good,'DATABASE_URL':u})
  except ValueError:pass
  else:raise AssertionError('Unsafe target admitted')
 try:validate({'DATABASE_URL':good['DATABASE_URL']})
 except ValueError:pass
 else:raise AssertionError('Implicit target admitted')
 d=diagnostic('ERROR: 22023: checked_assertion\nDETAIL: secret-body\nERROR: P0001: untrusted_body', ["raise exception 'checked_assertion';"])
 assert d=={'sqlStates':['22023','P0001'],'checkedInExceptionLiterals':['checked_assertion']}
 print('core canonical-start guards/hashes11/closed diagnostics PASS; no SQL');sys.exit(0)
url=validate(os.environ);env=dict(os.environ);psql=['psql',url,'-X','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-q']
preflight="""do $$begin
if to_regclass('private.capital_m07_recipes')is null or to_regclass('private.material_production_recipes')is null then raise exception 'core_canonical_baseline_missing';end if;
if to_regclass('private.capital_s11_recipes')is not null or to_regclass('private.capital_debt_recipes')is not null or to_regclass('private.assessment_input_snapshots')is not null then raise exception 'core_canonical_fresh_stack_required';end if;
end$$;"""
q=subprocess.run(psql,input=preflight,text=True,capture_output=True,cwd=core,timeout=90)
if q.returncode:raise RuntimeError('canonical_start_fresh_preflight_failed')
env['OFFROAD_NATIVE_CONSUMERS_DRAFT_INSTALL']='isolated-loopback-ci'
q=subprocess.run([sys.executable,str(core/'scripts/ci/install-capital-consumers-ci-drafts.py')],env=env,text=True,capture_output=True,cwd=core,timeout=300)
if q.returncode:raise RuntimeError('canonical_start_early_install11_failed')
print(json.dumps({'phase':'install11-before-autoSQL','result':'PASS'}),flush=True)
# Same root-only glob and lexical order as quality.yml. Each file retains its own
# transaction/rollback and psql session. A failed session closes/rolls back before
# the next file; never wrap/rewrite fixture SQL or disable a production guard.
files=sorted((core/'supabase/tests').glob('*.sql'));assert files,'No existing SQL contracts'
sources=[f.read_text()for f in list((core/'supabase/migrations').glob('*.sql'))+list((core/'supabase/tests').rglob('*.sql'))]+[(core/'supabase/pending'/(n+'.sql')).read_text()for n in m['drafts']]
results=[]
for f in files:
 try:
  q=subprocess.run(psql+['-f',str(f)],env=env,text=True,capture_output=True,cwd=core,timeout=180)
  entry={'file':'supabase/tests/'+f.name,'result':'PASS'if q.returncode==0 else 'FAIL'}
  if q.returncode:entry.update(diagnostic(q.stderr,sources))
 except subprocess.TimeoutExpired:
  entry={'file':'supabase/tests/'+f.name,'result':'TIMEOUT','sqlStates':[],'checkedInExceptionLiterals':[]}
 results.append(entry);print(json.dumps(entry),flush=True)
failed=[e for e in results if e['result']!='PASS'];report={'schemaVersion':'core-canonical-start-SQL-report.v1','coreHead':m['coreHead'],'baselineHead':m['baselineHead'],'installedBeforeTests':True,'tests':len(results),'passed':len(results)-len(failed),'failures':failed,'result':'FAIL'if failed else 'PASS','evidence':'real disposable Supabase SQL; no journal stamps, not deployment'}
print(json.dumps(report),flush=True)
if failed:raise SystemExit(1)
