#!/usr/bin/env python3
"""Full local migrated snapshot; genuine two-session races in a private clone.
Data must belong exclusively to disposable synthetic CI fixtures. No remote target.
"""
import os,subprocess,uuid,tempfile,re,select,time,json,sys,tomllib,shutil
from pathlib import Path
from urllib.parse import urlparse,urlunparse,unquote
ROOT=Path(__file__).resolve().parents[2]
def version_major(text):
 match=re.search(r'PostgreSQL\)?\s+(\d+)',text)
 assert match,'material_race_tool_version_unrecognized'
 return int(match.group(1))
def sanitized_failure(tool,stderr,code):
 # Do not echo SQL, fixture bodies, URLs, usernames, passwords or arbitrary stderr.
 text=stderr.decode('utf-8','replace') if isinstance(stderr,bytes) else stderr
 reason='operation_failed'
 for phrase,label in [('server version mismatch','server_version_mismatch'),('unsupported version','unsupported_version'),('permission denied','permission_denied'),('connection refused','connection_refused'),('could not connect','connection_failed'),('does not exist','object_missing'),('already exists','object_already_exists'),('can only create extension in database','extension_database_restriction'),('can only be created in database','extension_database_restriction'),('must be superuser','superuser_required'),('must be owner','ownership_required'),('unrecognized configuration parameter','configuration_parameter_unknown'),('could not open extension control file','extension_control_missing'),('invalid archive','archive_invalid'),('does not appear to be a valid archive','archive_invalid'),('unsupported version in file header','archive_version_unsupported')]:
  if phrase in text.lower():reason=label;break
 versions=re.findall(r'(?:server version|pg_dump version|pg_restore version):\s*([0-9]+(?:\.[0-9]+)*)',text)
 sqlstates=re.findall(r'^\s*SQLSTATE[: =]+([0-9A-Z]{5})\b',text,re.MULTILINE)
 error_lines='\n'.join(line for line in text.splitlines() if re.match(r'^\s*(?:pg_restore: error:|pg_dump: error:|ERROR:|FATAL:)',line))
 # Only catalogue identifiers immediately following a closed object-kind keyword.
 # Never include DETAIL, failing rows, SQL commands or arbitrary message content.
 objects=[]
 for kind,name in re.findall(r'\b(schema|extension|role|relation|table|constraint|function|database|parameter)\s+"([A-Za-z_][A-Za-z0-9_]{0,62})"',error_lines):
  item=kind+':'+name
  if item not in objects:objects.append(item)
 return 'material_race_tool_failed:'+Path(tool).name+':exit='+str(code)+':reason='+reason+':versions='+','.join(versions)+':sqlstates='+','.join(sqlstates)+':objects='+','.join(objects[:8])
def redacted_error_line(output):
 raw=output.encode('utf-8') if isinstance(output,str) else output
 if not raw:return '[empty]'
 if b'\x00' in raw[:1000] or raw.startswith(b'PGDMP'):return '[binary output suppressed]'
 text=raw.decode('utf-8','replace')
 lines=[line.strip() for line in text.splitlines() if line.strip()]
 if not lines:return '[empty]'
 # Only one diagnostic line; never emit following DETAIL/CONTEXT/SQL/data lines.
 line=lines[0][:2000]
 line=re.sub(r'\x1b\[[0-9;]*[A-Za-z]','',line)
 line=re.sub(r'[A-Za-z][A-Za-z0-9+.-]*://[^\s]+','[URL]',line)
 line=re.sub(r'\b(?:Bearer|Basic)\s+[^\s]+','[AUTH]',line,flags=re.I)
 line=re.sub(r'\b(?:password|passwd|pwd|token|secret|api[_-]?key|authorization)\s*[:=]\s*[^\s]+','[CREDENTIAL]',line,flags=re.I)
 line=re.sub(r'\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?','[TOKEN]',line)
 line=re.sub(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}','[EMAIL]',line)
 line=re.sub(r'\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b','[ID]',line,flags=re.I)
 line=re.sub(r"'(?:[^'\\]|\\.)*'|\"(?:[^\"\\]|\\.)*\"",'[QUOTED]',line)
 line=re.sub(r'\b[A-Za-z0-9_+/-]{32,}={0,2}\b','[OPAQUE]',line)
 line=re.sub(r'\b[0-9]+(?:\.[0-9]+)*\b','[NUMBER]',line)
 line=''.join(character if character.isprintable() else ' ' for character in line)
 return line[:600]

def tool_run(args,**kwargs):
 result=subprocess.run(args,capture_output=True,timeout=120,**kwargs)
 if result.returncode:
  logical_tool=next((arg for arg in args if arg in ('pg_dump','pg_restore','psql')),args[0])
  message=sanitized_failure(logical_tool,result.stderr,result.returncode)
  error_output=result.stderr if result.stderr.strip() else result.stdout
  error_channel='stderr' if result.stderr.strip() else 'stdout'
  # Full diagnostic stays private in the runner temporary directory, never echoed.
  descriptor,filename=tempfile.mkstemp(prefix='material-race-private-stderr-',suffix='.txt')
  os.fchmod(descriptor,0o600)
  with os.fdopen(descriptor,'wb') as diagnostic:
   diagnostic.write(error_output.encode('utf-8') if isinstance(error_output,str) else error_output)
  print(message+':private_diagnostic='+filename,file=sys.stderr)
  print('material_race_first_error:'+error_channel+':'+redacted_error_line(error_output),file=sys.stderr)
  raise RuntimeError(message)
 return result

def select_clone_tools():
 server=tool_run(['psql',origin,'-XAtq','-v','ON_ERROR_STOP=1'],input='show server_version_num;',text=True)
 server_major=int(server.stdout.strip())//10000
 local={}
 for tool in ('pg_dump','pg_restore'):
  executable=shutil.which(tool)
  if executable:
   result=tool_run([executable,'--version'],text=True);local[tool]=(executable,version_major(result.stdout))
 if len(local)==2 and all(value[1]>=server_major for value in local.values()) and local['pg_restore'][1]>=local['pg_dump'][1]:
  print('PASS material_race_clone_tools_host server_major='+str(server_major)+' dump_major='+str(local['pg_dump'][1])+' restore_major='+str(local['pg_restore'][1]))
  return {tool:[value[0]] for tool,value in local.items()},None
 # Only the exact CLI project container bound to this loopback database is eligible.
 config=tomllib.loads((ROOT/'supabase/config.toml').read_text())
 assert config['project_id']=='offroad' and config['db']['major_version']==17 and server_major==17,'material_race_container_project_version_required'
 container='supabase_db_offroad'
 inspected=tool_run(['docker','inspect',container],text=True)
 data=json.loads(inspected.stdout);assert len(data)==1
 instance=data[0]
 assert instance['Name']=='/'+container and instance['State']['Running'],'material_race_container_identity_required'
 assert 'supabase/postgres:' in instance['Config']['Image'],'material_race_container_postgres_image_required'
 bindings=instance['NetworkSettings']['Ports'].get('5432/tcp') or []
 assert parsed.port is not None and any(int(value['HostPort'])==parsed.port for value in bindings),'material_race_container_loopback_port_required'
 database=parsed.path.lstrip('/');username=parsed.username or 'postgres'
 assert re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*',database) and re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*',username),'material_race_container_database_identifier_required'
 env=os.environ.copy()
 if parsed.password is not None:env['PGPASSWORD']=unquote(parsed.password)
 base=['docker','exec','-i','-e','PGPASSWORD',container]
 connection=['--host=127.0.0.1','--port=5432','--username='+username]
 host_id=tool_run(['psql',origin,'-XAtq','-v','ON_ERROR_STOP=1'],input='select system_identifier from pg_control_system();',text=True).stdout.strip()
 container_id=tool_run(base+['psql']+connection+['--dbname='+database,'-XAtq','-v','ON_ERROR_STOP=1'],input='select system_identifier from pg_control_system();',text=True,env=env).stdout.strip()
 assert re.fullmatch(r'[0-9]+',host_id) and host_id==container_id,'material_race_container_database_instance_mismatch'
 tools={}
 for tool in ('pg_dump','pg_restore'):
  result=tool_run(base+[tool,'--version'],text=True,env=env)
  assert version_major(result.stdout)==server_major,'material_race_container_tool_version_required'
  tools[tool]=base+[tool]+connection
 print('PASS material_race_clone_tools_container project=offroad instance_verified=true server_major=17 dump_major=17 restore_major=17 host_dump_major='+str(local.get('pg_dump',('',0))[1]))
 return tools,env

if sys.argv[1:]==['--self-test']:
 assert version_major('pg_dump (PostgreSQL) 17.6')==17
 assert version_major('pg_restore (PostgreSQL) 16.11')==16
 diagnostic=sanitized_failure('pg_dump',b'pg_dump: error: aborting because of server version mismatch\nserver version: 17.6; pg_dump version: 16.11\npostgresql://user:secret@host/db\nPRIVATE FIXTURE BODY',1)
 assert 'server_version_mismatch' in diagnostic and 'versions=17.6,16.11' in diagnostic
 assert all(value not in diagnostic for value in ('secret','host','user','FIXTURE','postgresql://'))
 generic=sanitized_failure('pg_restore','PRIVATE CONTENT could not connect to database password=secret',2)
 assert 'reason=connection_failed:versions=:sqlstates=:objects=' in generic and 'secret' not in generic
 catalog=sanitized_failure('pg_restore','ERROR: schema "public" already exists\nSQLSTATE: 42P06\nDETAIL: failing row contains (PRIVATE BODY)\nCommand was: CREATE SCHEMA public;',1)
 assert 'reason=object_already_exists' in catalog and 'sqlstates=42P06' in catalog and 'objects=schema:public' in catalog
 assert 'BODY' not in catalog and 'CREATE' not in catalog and 'DETAIL' not in catalog
 cron=sanitized_failure('pg_restore','ERROR: can only create extension in database postgres\nHINT: arbitrary private message',1)
 assert 'reason=extension_database_restriction' in cron and 'arbitrary' not in cron
 redacted=redacted_error_line("pg_restore: error: cannot read archive 'private-body' at postgresql://user:password@host/db token=supersecret 123\nDETAIL: PRIVATE ROW")
 assert 'cannot read archive' in redacted
 assert all(value not in redacted for value in ('private-body','postgresql://','user','password','host','supersecret','123','PRIVATE ROW','DETAIL'))
 assert redacted_error_line(b'PGDMP\x00binary-private')=='[binary output suppressed]'
 assert redacted_error_line(b'')=='[empty]'
 text=Path(__file__).read_text()
 for guard in ("config['project_id']=='offroad'", "config['db']['major_version']==17", "host_id==container_id", "parsed.port is not None", "archive.startswith(b'PGDMP')", "input=dump.read_bytes()", "MATERIAL_RACE_SYNTHETIC_LOCAL"):
  assert guard in text,guard
 print('PASS material_race_tool_version_binary_container_guards_and_sanitized_errors')
 raise SystemExit(0)
origin=os.environ['DATABASE_URL'];parsed=urlparse(origin)
assert parsed.hostname in('localhost','127.0.0.1','::1') and not parsed.query and not parsed.fragment
assert os.environ.get('MATERIAL_RACE_SYNTHETIC_LOCAL')=='1','explicit disposable synthetic local database required'
tag=uuid.uuid4().hex[:12];dbname='offroad_material_review_race_'+tag
url=urlunparse(parsed._replace(path='/'+dbname));created=False
# A separate fixture namespace survives pre-existing SDK d5/6/7 data.
prefix=None
for value in range(128,224):
 candidate=f'{value:02x}'
 probe=subprocess.run(['psql',origin,'-XAtq','-v','ON_ERROR_STOP=1'],input=f"select exists(select 1 from auth.users where id::text like '{candidate}%' union all select 1 from public.organizations where id::text like '{candidate}%');",text=True,capture_output=True,timeout=20)
 assert probe.returncode==0,'material_race_namespace_probe_failed'
 if probe.stdout.strip()=='f':prefix=candidate;break
assert prefix is not None,'material_race_namespace_exhausted'
org=prefix+'200000-0000-4000-8000-000000000001';actor=prefix+'100000-0000-4000-8000-000000000001'
def command(args,**kw):
 p=subprocess.run(args,text=True,capture_output=True,timeout=120,**kw)
 if p.returncode:
  diagnostic=Path(tempfile.gettempdir())/('material-race-diagnostic-'+tag+'.txt');diagnostic.write_text(p.stderr);diagnostic.chmod(0o600)
  raise RuntimeError('material_race_local_operation_failed:'+args[0]+':'+str(diagnostic))
 return p

def run(sql):return subprocess.run(['psql',url,'-XAtq','-v','ON_ERROR_STOP=1'],input=sql,text=True,capture_output=True,timeout=120)
def sqlvalue(sql):
 p=run(sql);assert p.returncode==0,p.stderr[-2000:];return p.stdout.strip()
def literal(v):return "'"+str(v).replace("'","''")+"'"
try:
 with tempfile.TemporaryDirectory(prefix='material-race-')as temp:
  dump=Path(temp)/'database.dump';os.umask(0o077)
  clone_tools,clone_env=select_clone_tools()
  if clone_env is None:
   tool_run(clone_tools['pg_dump']+[origin,'--format=custom','--file',str(dump)],text=True)
  else:
   # Custom archive is binary: never pass through text decoding or a shell.
   archive=tool_run(clone_tools['pg_dump']+['--dbname='+parsed.path.lstrip('/'),'--format=custom'],env=clone_env).stdout
   assert archive.startswith(b'PGDMP'),'material_race_custom_archive_required'
   dump.write_bytes(archive)
  command(['createdb','--maintenance-db',origin,'--template=template0','--encoding=UTF8',dbname]);created=True
  if clone_env is None:
   tool_run(clone_tools['pg_restore']+['--dbname',url,'--exit-on-error',str(dump)],text=True)
  else:
   tool_run(clone_tools['pg_restore']+['--dbname='+dbname,'--exit-on-error'],input=dump.read_bytes(),env=clone_env)
 if sys.argv[1:]==['--clone-only']:
  print('PASS material_race_full_native_clone_dump_restore')
  raise SystemExit(0)
 # Setup operates only the private clone; no body/receipt/approval seeded.
 source=(ROOT/'scripts/ci/test-material-production-plan-native.py').read_text()
 source=source.replace("'material_production_terminal.sql']","'material_production_terminal.sql','material_package_native_review.sql','material_retire_experimental_approvals.sql']")
 source=source.replace("consumer+=expand(ROOT/'supabase/tests/support/material_production_native_denials.sql')", "consumer+='''set local role authenticated;select pg_temp.as_worker();do $$declare j jsonb;begin select value::jsonb into strict j from route_proof where label='native_claim';perform public.worker_complete_job((j->>'job_id')::uuid,j->>'capability_token','{}'::jsonb);end$$;select pg_temp.as_owner();do $$declare c jsonb;begin select value::jsonb into strict c from route_proof where label='native_material_commit';perform public.set_capital_project_review_policy_v1((c->>'workId')::uuid,'allowed');end$$;reset role;'''")
 source=source.replace("+'\\nrollback;\\n'","+'\\ncommit;\\n'")
 source=source[:source.index('p=subprocess.run(')]
 os.environ['DATABASE_URL']=url;os.environ['MATERIAL_FIXTURE_PREFIX']=prefix;os.environ['MATERIAL_FIXTURE_TAG']=tag
 namespace={'__file__':str(ROOT/'scripts/ci/test-material-production-plan-native.py')};exec(compile(source,'material-race-setup','exec'),namespace)
 p=run(namespace['s']);assert p.returncode==0,p.stderr[-2000:]
 work,rev,fp=sqlvalue(f"select b.work_id,b.revision_id,r.manifest_fingerprint from private.material_production_bindings b join public.artifact_revisions r on(r.organization_id,r.id)=(b.organization_id,b.revision_id) where b.organization_id='{org}';").split('|')
 header="begin;set local role authenticated;select set_config('request.jwt.claims',"+literal(json.dumps({'sub':actor,'role':'authenticated','aal':'aal1'}))+",true);"
 def approve(command):return header+f"select public.decide_material_package_v1('{work}','{rev}','{fp}','approve','Concurrent human command',true,'{command}',null);"
 def compete(a,b):
  first=second=None
  try:
   first=subprocess.Popen(['psql',url,'-XAtq','-v','ON_ERROR_STOP=1'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,bufsize=1)
   first.stdin.write('\\o /dev/null\n'+approve(a)+'\n\\echo MATERIAL_LOCK_HELD\n');first.stdin.flush()
   deadline=time.monotonic()+20
   while True:
    left=deadline-time.monotonic();assert left>0 and select.select([first.stdout],[],[],left)[0],'first barrier timeout'
    line=first.stdout.readline().strip()
    if line=='MATERIAL_LOCK_HELD':break
    assert first.poll()is None,line
   name='material_review_contender_'+tag
   second=subprocess.Popen(['psql',url,'-XAtq','-v','ON_ERROR_STOP=1'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
   second.stdin.write('set application_name='+literal(name)+';'+approve(b)+'commit;\n');second.stdin.close();second.stdin=None
   deadline=time.monotonic()+20
   while sqlvalue('select count(*) from pg_stat_activity where application_name='+literal(name)+" and wait_event_type='Lock';")!='1':
    assert time.monotonic()<deadline and second.poll()is None,'contender did not visibly wait';time.sleep(.05)
   first.stdin.write('commit;\n');first.stdin.close();first.stdin=None
   out1=first.communicate(timeout=20)[0];out2=second.communicate(timeout=20)[0]
   assert first.returncode==0 and second.returncode==0,out1[-2000:]+out2[-2000:]
   return out2
  finally:
   for p in(first,second):
    if p is not None and p.poll()is None:p.kill();p.wait(timeout=10)
 def counts():return sqlvalue(f"select count(*),count(distinct effect_job_id)from private.material_package_review_projections where organization_id='{org}';select count(*)from public.work_decisions where organization_id='{org}'and kind='approve_material_package';select count(*)from public.processing_jobs where organization_id='{org}'and payload->>'incremental_trigger'='material_package_approved'and kind='case_analysis';").splitlines()
 c=uuid.uuid4();assert '"replayed": true'in compete(c,c);assert counts()==['1|1','1','1'];print('PASS material_package_two_sessions_observed_lock_one_review_decision_followup')
 compete(uuid.uuid4(),uuid.uuid4());assert counts()==['3|1','3','1'];print('PASS material_package_two_distinct_human_commands_observed_lock_one_followup')
finally:
 if created:command(['dropdb','--maintenance-db',origin,dbname])
