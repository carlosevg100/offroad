#!/usr/bin/env python3
"""Temporary loopback-only diagnostic; never a release/authorization proof."""
import json,os,re,signal,subprocess,sys,time
from pathlib import Path
from urllib.parse import urlparse
UUID=re.compile(r'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')
NUMERIC={'Planning Time','Execution Time','Actual Rows','Actual Loops','Shared Hit Blocks','Shared Read Blocks','Shared Dirtied Blocks','Shared Written Blocks','Temp Read Blocks','Temp Written Blocks'}
def numeric_summary(value):
 out={}
 def visit(v):
  if isinstance(v,dict):
   for k,x in v.items():
    if k=='JIT' and isinstance(x,dict):
     functions=x.get('Functions');timing=x.get('Timing',{})
     if isinstance(functions,(int,float))and not isinstance(functions,bool):out['JIT Functions']=out.get('JIT Functions',0)+functions
     if isinstance(timing,dict):
      for label in ('Generation','Inlining','Optimization','Emission','Total'):
       amount=timing.get(label)
       if isinstance(amount,(int,float))and not isinstance(amount,bool):out['JIT '+label+' ms']=out.get('JIT '+label+' ms',0)+amount
    elif k in NUMERIC and isinstance(x,(int,float))and not isinstance(x,bool):out[k]=out.get(k,0)+x
    elif isinstance(x,(dict,list)):visit(x)
  elif isinstance(v,list):
   for x in v:visit(x)
 visit(value);return out

def db_target():
 db=os.environ['DATABASE_URL'];assert urlparse(db).hostname in('localhost','127.0.0.1','::1');return db

def query(db,sql,timeout):
 r=subprocess.run(['psql',db,'-XAtq','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'],input=sql,text=True,capture_output=True,timeout=timeout)
 if r.returncode:
  m=re.search(r'ERROR:\s*([0-9A-Z]{5})\b',r.stderr);return None,m.group(1)if m else'unavailable'
 try:return json.loads(r.stdout.strip()),None
 except ValueError:return None,'invalid_json'

def write(path,body):
 tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(body)+'\n');tmp.chmod(0o600);tmp.replace(path)

def safe_wait_summary(value):
 assert set(value)=={'count','lock','blocked','idleBlocker','duration','waits'}
 assert isinstance(value['count'],int)and value['count']>=0
 assert all(type(value[k])is bool for k in('lock','blocked','idleBlocker'))
 assert isinstance(value['duration'],(int,float))and value['duration']>=0
 assert isinstance(value['waits'],list)and all(v in('Lock','IO','LWLock','Client','IPC','Timeout','BufferPin','Activity','ActiveOrOther')for v in value['waits'])
 return value

def sampler(path):
 db=db_target();assert path.parent.is_dir();stop=False
 def end(*_):
  nonlocal stop;stop=True
 signal.signal(signal.SIGTERM,end)
 summary={'diagnosticOnly':True,'samples':0,'dashboardSamples':0,'lockSamples':0,'blockedSamples':0,'idleTransactionBlockerSamples':0,'maxDurationMs':0,'queryFailures':0,'waitCounts':{}}
 started=time.monotonic()
 while not stop and time.monotonic()-started<185:
  try:
   value,error=query(db,"""select jsonb_build_object('count',count(*),'lock',coalesce(bool_or(wait_event_type='Lock'),false),'blocked',coalesce(bool_or(cardinality(pg_blocking_pids(pid))>0),false),'idleBlocker',coalesce(bool_or(exists(select 1 from pg_stat_activity b where b.pid=any(pg_blocking_pids(a.pid))and b.state='idle in transaction')),false),'duration',coalesce(max(extract(epoch from(clock_timestamp()-query_start))*1000),0),'waits',coalesce(jsonb_agg(case when wait_event_type in('Lock','IO','LWLock','Client','IPC','Timeout','BufferPin','Activity')then wait_event_type else'ActiveOrOther'end),'[]'::jsonb))from pg_stat_activity a where datname=current_database()and pid<>pg_backend_pid()and state='active'and query like'%read_work_review_dashboard_v1%';""",2)
   summary['samples']+=1
   if error:summary['queryFailures']+=1
   else:
    value=safe_wait_summary(value)
    summary['dashboardSamples']+=int(value['count']>0);summary['lockSamples']+=int(value['lock']);summary['blockedSamples']+=int(value['blocked']);summary['idleTransactionBlockerSamples']+=int(value['idleBlocker']);summary['maxDurationMs']=max(summary['maxDurationMs'],round(value['duration']))
    for wait in value['waits']:summary['waitCounts'][wait]=summary['waitCounts'].get(wait,0)+1
  except subprocess.TimeoutExpired:summary['queryFailures']+=1
  write(path,summary);time.sleep(.5)
 write(path,summary)

def profile():
 db=db_target();f=json.load(sys.stdin);assert set(f)=={'org','work','actor','revision'};assert all(UUID.fullmatch(v)for v in f.values())
 scope="select exists(select 1 from private.capital_preview_native_bindings b join public.artifact_revisions r on(r.organization_id,r.id)=(b.organization_id,b.revision_id)join public.artifacts a on(a.organization_id,a.id)=(r.organization_id,r.artifact_id)where b.organization_id='{org}'and b.revision_id='{revision}'and a.work_id='{work}');".format(**f)
 check,error=query(db,"select to_jsonb(x)from("+scope.rstrip(';').replace('select exists','select exists',1)+")q(x);",2)
 if error or check is not True:return {'diagnosticOnly':True,'scope':'denied','profiles':[]}
 statements=[('native_read',"select private.capital_preview_native_read_allowed_v1('{org}','{revision}','{actor}')",False),('sources',"select private.artifact_review_sources_allowed_v1('{org}','{revision}','{actor}')",False),('release',"select private.artifact_revision_release_v1(r)from public.artifact_revisions r where r.organization_id='{org}'and r.id='{revision}'",False),('run_deadline',"select private.capital_preview_run_deadline_v1(b.organization_id,b.run_id,'{actor}',true)from private.capital_preview_native_bindings b where b.organization_id='{org}'and b.revision_id='{revision}'",False),('projection_deadline',"select private.capital_preview_projection_deadline_v1(b.organization_id,b.run_id,'{actor}',p.task_id)from private.capital_preview_native_bindings b join private.capital_preview_task_projections p on(p.organization_id,p.id)=(b.organization_id,b.projection_id)where b.organization_id='{org}'and b.revision_id='{revision}'",False),('allocation_deadline',"select private.capital_preview_allocation_deadline_v1(b.organization_id,q.allocation_id,'{actor}')from private.capital_preview_native_bindings b join private.capital_public_retained_payloads q on(q.organization_id,q.id)=(b.organization_id,b.retained_payload_id)where b.organization_id='{org}'and b.revision_id='{revision}'",False),('reviews',"select public.read_artifact_revision_reviews_v1('{revision}')",True),('dashboard',"select public.read_work_review_dashboard_v1('{work}',null,null)",True)]
 started=time.monotonic();out=[]
 for name,statement,authenticated in statements:
  remaining=27-(time.monotonic()-started)
  if remaining<=0:out.append({'operation':name,'result':'total_bound'});break
  ctx="begin;do $$begin perform set_config('request.jwt.claim.sub','{actor}',true);perform set_config('request.jwt.claims',jsonb_build_object('sub','{actor}','role','authenticated','aal','aal1')::text,true);perform set_config('request.headers',jsonb_build_object('x-offroad-workspace','{org}')::text,true);end$$;".format(**f)
  if authenticated:ctx+='set local role authenticated;'
  try:
   value,error=query(db,ctx+'explain(analyze,buffers,format json)'+statement.format(**f)+';rollback;',min(8,remaining))
   out.append({'operation':name,'result':'error'if error else'plan','code':error,'metrics':numeric_summary(value)if not error else{}})
  except subprocess.TimeoutExpired:out.append({'operation':name,'result':'process_bound','metrics':{}})
 return {'diagnosticOnly':True,'scope':'own_bound_revision','profiles':out}

if __name__=='__main__':
 if sys.argv[1]=='--self-test':
  assert numeric_summary([{'Plan':{'Filter':'secret','Actual Rows':2,'Plans':[{'Actual Loops':3}],'Output':['secret']},'Execution Time':4,'JIT':{'Functions':5,'Options':{'raw':'secret'},'Timing':{'Generation':1,'Inlining':2,'Optimization':3,'Emission':4,'Total':10,'SQL':'secret'}}}])=={'Actual Rows':2,'Actual Loops':3,'Execution Time':4,'JIT Functions':5,'JIT Generation ms':1,'JIT Inlining ms':2,'JIT Optimization ms':3,'JIT Emission ms':4,'JIT Total ms':10};assert 'secret'not in json.dumps(safe_wait_summary({'count':1,'lock':False,'blocked':False,'idleBlocker':False,'duration':10,'waits':['ActiveOrOther']}));
  try:safe_wait_summary({'query':'secret'})
  except AssertionError:pass
  else:raise AssertionError('arbitrary sampler frame accepted')
  print('safe_profiler_static: PASS')
 elif sys.argv[1]=='--sample':sampler(Path(sys.argv[2]))
 elif sys.argv[1]=='--profile':print(json.dumps(profile()))
 else:raise SystemExit(2)
