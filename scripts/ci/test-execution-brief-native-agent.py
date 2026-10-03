#!/usr/bin/env python3
"""Actual agent-v7/compiler/human-review path in one local rollback transaction."""
import json,os,re,subprocess,sys
from pathlib import Path
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parents[2]
url=os.environ['DATABASE_URL']
assert urlparse(url).hostname in ('localhost','127.0.0.1','::1'), 'Local disposable database only'
preview_fixture=os.environ.get('PREVIEW_HTTP_FIXTURE')=='1'
assert not(preview_fixture and os.environ.get('S11_HTTP_FIXTURE')=='1'), 'Preview and S11 modes are distinct'
http_fixture=preview_fixture or os.environ.get('S11_HTTP_FIXTURE')=='1'
ui_namespace=os.environ.get('BRIEF_UI_NAMESPACE')
http_namespace=(os.environ.get('PREVIEW_HTTP_NAMESPACE','a8830001') if preview_fixture else os.environ.get('S11_HTTP_NAMESPACE','a8810001')) if http_fixture else None
if http_namespace:
 assert re.fullmatch(r'[0-9a-f]{8}',http_namespace), 'Closed S11 HTTP namespace required'
 assert not ui_namespace, 'HTTP and UI fixture modes are distinct'
if ui_namespace:
 assert os.environ.get('BRIEF_UI_FIXTURE')=='1' and re.fullmatch(r'[0-9a-f]{8}',ui_namespace), 'UI namespace must be local and explicit'
if http_fixture:
 assert not any(os.environ.get(k) for k in ('S11_FIXTURE_CONTINUATION','S11_FIXTURE_RENDERER','S11_FIXTURE_AFTER_RENDERER','S11_FIXTURE_SECOND_AFTER_RENDERER','S11_FIXTURE_REVISION_RENDERER_CONTINUATION')), 'HTTP bootstrap cannot fabricate native bodies'
def report(lines):
 if not http_fixture: print('\n'.join(lines))
def expand(p): return re.sub(r'^\\ir (.+)$',lambda m:expand(p.parent/m[1].strip()),p.read_text(),flags=re.M)
def literal(x): return "'"+str(x).replace("'","''")+"'"
p=subprocess.Popen(['psql',url,'-XAtq','-v','ON_ERROR_STOP=1'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,bufsize=1)
def phase(sql):
 if preview_fixture:
  sql=sql.replace('preview-http','preview-http-'+http_namespace).replace('preview-publisher@example.invalid','preview-publisher-'+http_namespace+'@example.invalid').replace('Synthetic capital planning','Synthetic finite preview').replace('Companhia Sintética Farol. Quero comparar opções de financiamento para crescimento, sem executar contato com credores.','Preparar material para reunião interna da Camil, somente validação sintética.').replace("'capital_planning','public_information'","'origination_thesis','public_information'")
 if ui_namespace:
  sql=sql.replace('a8800000',ui_namespace).replace('native-agent@example.invalid','native-agent-'+ui_namespace+'@example.invalid').replace('Synthetic native agent','Synthetic native agent '+ui_namespace).replace("repeat('d',64)","repeat('"+ui_namespace+"',8)")
 if http_namespace:
  sql=sql.replace('a8800000',http_namespace).replace('native-agent@example.invalid','native-agent-'+http_namespace+'@example.invalid').replace('s11-publisher@example.invalid','s11-publisher-'+http_namespace+'@example.invalid').replace("repeat('d',64)","repeat('"+http_namespace+"',8)").replace('https://example.invalid/capture-licensed','https://example.invalid/s11/'+http_namespace+'/capture-licensed').replace('s11-sql-account','s11-http-'+http_namespace+'-account').replace('s11-sql-project','s11-http-'+http_namespace+'-project').replace('s11-sql-key','s11-http-'+http_namespace+'-key')
  for old,new in [('10000000-0000-4000-8000-000000000994',http_namespace+'-0000-4000-8000-000000000994'),('20000000-0000-4000-8000-000000000994',http_namespace+'-0000-4000-8000-000000000995'),('30000000-0000-4000-8000-000000000994',http_namespace+'-0000-4000-8000-000000000996')]:sql=sql.replace(old,new)
 p.stdin.write(sql+'\n\\echo PHASE_DONE\n');p.stdin.flush();out=[]
 while True:
  line=p.stdout.readline()
  if not line: raise AssertionError('\n'.join(out))
  if line.strip()=='PHASE_DONE': return out
  out.append(line.rstrip())
try:
 compiler=['node',str(next((ROOT/'node_modules/.pnpm').glob('tsx@*/node_modules/tsx/dist/cli.mjs'))),str(ROOT/('apps/document-worker/scripts/execution-brief-native-preview-fixture.ts' if preview_fixture else 'apps/document-worker/scripts/execution-brief-native-agent-fixture.ts'))]
 plan_command=subprocess.run(compiler+['--plan'],text=True,capture_output=True,cwd=ROOT,timeout=30)
 assert plan_command.returncode==0,plan_command.stderr
 plan=json.loads(plan_command.stdout)
 prefix="""begin;
 insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous) values('a8800000-0000-4000-8000-000000000001','authenticated','authenticated','native-agent@example.invalid','{}','{}',now(),now(),false,false);
 insert into public.organizations(id,organization_type,name,created_by) values('a8800000-0000-4000-8000-000000000002','company','Synthetic native agent','a8800000-0000-4000-8000-000000000001');
 insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values('a8800000-0000-4000-8000-000000000002','a8800000-0000-4000-8000-000000000001','owner','active',now());
 insert into public.organization_review_policies(organization_id,self_approval_allowed,assignment_required,updated_by) values('a8800000-0000-4000-8000-000000000002',true,false,'a8800000-0000-4000-8000-000000000001');
 create temp table agent_fixture(k text primary key,v jsonb); grant all on agent_fixture to authenticated;
 """+expand(ROOT/'supabase/tests/support/legacy_persistent_work_fixture.sql')+"""
 set local role authenticated;
 select set_config('request.jwt.claims','{"sub":"a8800000-0000-4000-8000-000000000001","role":"authenticated"}',true);
 """
 # The preview's published entry is origination_thesis. Its fresh company
 # workspace needs the explicit owner act, not a worker/private capability grant.
 if preview_fixture:
  prefix+="select public.set_workspace_capability_v1('origination_representation',true,0);\n"
 prefix+="insert into agent_fixture values('start',public.start_work_v1('a8800000-0000-4000-8000-000000000010','pt-BR','Synthetic capital planning','Companhia Sintética Farol. Quero comparar opções de financiamento para crescimento, sem executar contato com credores.','capital_planning','public_information',"+literal(json.dumps(plan))+"::jsonb,null,false));"
 prefix+="""
 insert into agent_fixture values('session',to_jsonb(pg_temp.legacy_intake_for_work((select(v->>'workId')::uuid from agent_fixture where k='start'))));
 select public.queue_advisor_initial_turn_v1((select(v->>'workId')::uuid from agent_fixture where k='start'));
 reset role;
 do $$begin if (select company_profile from public.document_intake_sessions where id=(select(v#>>'{}')::uuid from agent_fixture where k='session'))<>'{}'::jsonb then raise exception 'fixture_profile_not_empty';end if;end$$;
 insert into private.worker_tokens(label,token_sha256,execution_account_user_id) values('Synthetic native agent',extensions.digest(repeat('d',64),'sha256'),'a8800000-0000-4000-8000-000000000001');
 update public.processing_jobs set available_at=(select coalesce(min(available_at),now())-interval '1 second' from public.processing_jobs where status='queued') where organization_id='a8800000-0000-4000-8000-000000000002' and kind='agent_operation_brief' and status='queued';
 set local role authenticated;
 insert into agent_fixture values('claim',public.worker_claim_job_v3(repeat('d',64),600));
 insert into agent_fixture select 'capture',public.worker_capture_execution_brief_inputs_v1((v->>'job_id')::uuid,v->>'capability_token',(v#>>'{payload,message_id}')::uuid) from agent_fixture where k='claim';
 select v->'context' from agent_fixture where k='capture';
 """
 if os.environ.get('BRIEF_DRAFT_IN_TRANSACTION')=='1': prefix=prefix.replace('begin;','begin;'+(ROOT/'supabase/pending/execution_brief_native_capture.sql').read_text(),1)
 if preview_fixture:
  prefix=prefix.replace(" create temp table agent_fixture", " insert into private.integration_preview_grants(organization_id,enabled,granted_by,note,mode)values('a8800000-0000-4000-8000-000000000002',true,'Local CI operator','Synthetic closed native preview eval','live');\n create temp table agent_fixture",1)
 lines=phase(prefix)
 contexts=[json.loads(x) for x in lines if x.startswith('{') and 'active_plan' in x]
 assert len(contexts)==1,lines
 compiled=subprocess.run(['node',str(next((ROOT/'node_modules/.pnpm').glob('tsx@*/node_modules/tsx/dist/cli.mjs'))),str(ROOT/('apps/document-worker/scripts/execution-brief-native-preview-fixture.ts' if preview_fixture else 'apps/document-worker/scripts/execution-brief-native-agent-fixture.ts'))],input=json.dumps(contexts[0]),text=True,capture_output=True,cwd=ROOT,timeout=30)
 assert compiled.returncode==0,compiled.stdout+compiled.stderr
 product=json.loads(compiled.stdout)
 sql="insert into agent_fixture values('product',"+literal(json.dumps(product))+"::jsonb);"
 sql+="""
 insert into agent_fixture select 'recorded',public.worker_record_agent_response_and_activate_v7((j.v->>'job_id')::uuid,j.v->>'capability_token',(c.v->>'captureId')::uuid,'a8800000-0000-4000-8000-000000000011','{"state":"idle","reply":"Vamos comparar as alternativas de financiamento."}',null,p.v->'activation',p.v->'internal',p.v->'visible',p.v->'changeSummary',p.v->>'expectedInputFingerprint') from agent_fixture j,agent_fixture c,agent_fixture p where j.k='claim' and c.k='capture' and p.k='product';
 reset role;
 select jsonb_build_object('recorded',(select v from agent_fixture where k='recorded'),'before',(select v->'context'->>'approval_input_fingerprint' from agent_fixture where k='capture'),'after',private.execution_approval_input_fingerprint('a8800000-0000-4000-8000-000000000002',(select(v#>>'{}')::uuid from agent_fixture where k='session')));
 set local role authenticated;
 """
 report(phase(sql))
 # Local UI proof stops before the human act. It retains the genuinely
 # compiled/captured product, not a fabricated brief or approval receipt.
 if os.environ.get('BRIEF_UI_FIXTURE')=='1':
  assert not http_fixture and not any(os.environ.get(k) for k in ('S11_FIXTURE_CONTINUATION','S11_FIXTURE_RENDERER','S11_FIXTURE_AFTER_RENDERER','S11_FIXTURE_SECOND_AFTER_RENDERER','S11_FIXTURE_REVISION_RENDERER_CONTINUATION')), 'UI bootstrap cannot fabricate native bodies'
  phase("""reset role;
   update auth.users set instance_id='00000000-0000-0000-0000-000000000000',encrypted_password=extensions.crypt('brief-isolated-local-ui-password',extensions.gen_salt('bf')),email_confirmed_at=clock_timestamp(),confirmation_token='',recovery_token='',email_change_token_new='',email_change='' where id='a8800000-0000-4000-8000-000000000001';
   insert into auth.identities(id,user_id,provider_id,provider,identity_data,created_at,updated_at) values(gen_random_uuid(),'a8800000-0000-4000-8000-000000000001','a8800000-0000-4000-8000-000000000001','email','{"sub":"a8800000-0000-4000-8000-000000000001","email":"native-agent@example.invalid"}',clock_timestamp(),clock_timestamp());
   insert into public.onboarding_progress(organization_id,user_id,journey,current_step,answers,completed_at) values('a8800000-0000-4000-8000-000000000002','a8800000-0000-4000-8000-000000000001','company','complete','{}',clock_timestamp());
   select jsonb_build_object('workId',v->>'workId','result','PASS','eval','execution_brief_native_ui_bootstrap') from agent_fixture where k='start';
  """)
  phase('commit;')
  print('PASS execution_brief_native_ui_unapproved_bootstrap')
  sys.exit(0)
 # Server lookup is fixture-only; human calls still use genuine JWT/resource authority.
 sql="""reset role;
 do $$declare c private.execution_brief_input_captures;n private.execution_brief_native_bindings;begin
 select * into strict c from private.execution_brief_input_captures where organization_id='a8800000-0000-4000-8000-000000000002';
 select * into strict n from private.execution_brief_native_bindings where organization_id=c.organization_id;
 if c.input_fingerprint=n.post_write_input_fingerprint or c.input_fingerprint is distinct from (select v#>>'{context,approval_input_fingerprint}' from agent_fixture where k='capture') or n.post_write_input_fingerprint<>private.execution_approval_input_fingerprint(c.organization_id,c.session_id) then raise exception 'immutable_precursor_or_post_write_proof_invalid';end if;end$$;
 insert into agent_fixture select 'brief',jsonb_build_object('id',id,'fingerprint',brief_fingerprint) from public.capital_project_execution_briefs where organization_id='a8800000-0000-4000-8000-000000000002';set local role authenticated;
 savepoint human_mutation;
 reset role;update public.document_intake_sessions set company_profile=company_profile||'{"name":"Alteração humana posterior"}'::jsonb where organization_id='a8800000-0000-4000-8000-000000000002';set local role authenticated;
 do $$begin
 begin perform public.approve_advisor_execution_brief_v2((select(v->>'workId')::uuid from agent_fixture where k='start'),(select(v->>'id')::uuid from agent_fixture where k='brief'),(select v->>'fingerprint' from agent_fixture where k='brief'),(select(v->>'captureId')::uuid from agent_fixture where k='capture'),'a8800000-0000-4000-8000-000000000012',true);raise exception 'human_mutation_was_accepted';exception when serialization_failure then null;end;end$$;
 rollback to human_mutation;
 select public.approve_advisor_execution_brief_v2((s.v->>'workId')::uuid,(b.v->>'id')::uuid,b.v->>'fingerprint',(c.v->>'captureId')::uuid,'a8800000-0000-4000-8000-000000000012',true) from agent_fixture s,agent_fixture b,agent_fixture c where s.k='start' and b.k='brief' and c.k='capture';
 """
 report(phase(sql))
 phase("reset role;do $$declare j uuid;begin select id into strict j from public.processing_jobs where organization_id='a8800000-0000-4000-8000-000000000002' and kind='capital_project_analysis';if not private.execution_dispatch_is_current(j,true) then raise exception 'legitimate_post_write_dispatch_denied';end if;end$$;")
 phase("savepoint dispatch_mutation;update public.document_intake_sessions set company_profile=company_profile||'{\"name\":\"Alteração posterior à aprovação\"}'::jsonb where organization_id='a8800000-0000-4000-8000-000000000002';do $$declare j uuid;begin select id into strict j from public.processing_jobs where organization_id='a8800000-0000-4000-8000-000000000002' and kind='capital_project_analysis';if private.execution_dispatch_is_current(j,true) then raise exception 'post_approval_mutation_kept_dispatch_current';end if;end$$;rollback to dispatch_mutation;")
 if os.environ.get('S11_FIXTURE_CONTINUATION'):
  print('\n'.join(phase(expand(Path(os.environ['S11_FIXTURE_CONTINUATION'])))))
 if os.environ.get('S11_FIXTURE_RENDERER'):
  # Optional S11 proof uses the existing transaction and actual human-approved
  # job. The renderer receives finite fixture context only, never capabilities.
  renderer=Path(os.environ['S11_FIXTURE_RENDERER']).resolve()
  assert renderer.is_relative_to(ROOT) and renderer.is_file(), 'Renderer must be a checked-in local project file'
  inputs=phase("reset role;select v from agent_fixture where k='s11_render_input';")
  objects=[json.loads(x) for x in inputs if x.startswith('{')]
  assert len(objects)==1,inputs
  rendered=subprocess.run(['node',str(next((ROOT/'node_modules/.pnpm').glob('tsx@*/node_modules/tsx/dist/cli.mjs'))),str(renderer)],input=json.dumps(objects[0]),text=True,capture_output=True,cwd=ROOT,timeout=30)
  assert rendered.returncode==0,rendered.stderr
  assert len(rendered.stdout.encode('utf8'))<=4*1024*1024,'S11 renderer output too large'
  product=json.loads(rendered.stdout)
  phase("insert into agent_fixture values('s11_render_product',"+literal(json.dumps(product))+"::jsonb);")
  continuation=Path(os.environ['S11_FIXTURE_AFTER_RENDERER']).resolve()
  assert continuation.is_relative_to(ROOT) and continuation.is_file(), 'Continuation must be a checked-in local project file'
  print('\n'.join(phase(expand(continuation))))
  if os.environ.get('S11_FIXTURE_SECOND_AFTER_RENDERER'):
   inputs=phase("reset role;select v from agent_fixture where k='s11_render_input_2';")
   objects=[json.loads(x) for x in inputs if x.startswith('{')]
   assert len(objects)==1,inputs
   rendered=subprocess.run(['node',str(next((ROOT/'node_modules/.pnpm').glob('tsx@*/node_modules/tsx/dist/cli.mjs'))),str(renderer)],input=json.dumps(objects[0]),text=True,capture_output=True,cwd=ROOT,timeout=30)
   assert rendered.returncode==0,rendered.stderr
   assert len(rendered.stdout.encode('utf8'))<=4*1024*1024,'S11 renderer output too large'
   product=json.loads(rendered.stdout)
   phase("insert into agent_fixture values('s11_render_product_2',"+literal(json.dumps(product))+"::jsonb);")
   continuation=Path(os.environ['S11_FIXTURE_SECOND_AFTER_RENDERER']).resolve()
   assert continuation.is_relative_to(ROOT) and continuation.is_file(), 'Continuation must be a checked-in local project file'
   print('\n'.join(phase(expand(continuation))))
 if os.environ.get('S11_FIXTURE_REVISION_RENDERER_CONTINUATION'):
  assert os.environ.get('S11_FIXTURE_SECOND_AFTER_RENDERER'), 'Revision renderer requires the genuine initial and human-return phases'
  inputs=phase("reset role;select v from agent_fixture where k='s11_revision_render_input';")
  objects=[json.loads(x) for x in inputs if x.startswith('{')]
  assert len(objects)==1, 'Exactly one finite revision renderer context is required'
  rendered=subprocess.run(['node',str(next((ROOT/'node_modules/.pnpm').glob('tsx@*/node_modules/tsx/dist/cli.mjs'))),str(renderer)],input=json.dumps(objects[0]),text=True,capture_output=True,cwd=ROOT,timeout=30)
  assert rendered.returncode==0,rendered.stderr
  assert len(rendered.stdout.encode('utf8'))<=4*1024*1024,'S11 renderer output too large'
  product=json.loads(rendered.stdout)
  phase("insert into agent_fixture values('s11_revision_render_product',"+literal(json.dumps(product))+"::jsonb);")
  continuation=Path(os.environ['S11_FIXTURE_REVISION_RENDERER_CONTINUATION']).resolve()
  assert continuation.is_relative_to(ROOT) and continuation.is_file(), 'Continuation must be a checked-in local project file'
  print('\n'.join(phase(expand(continuation))))
 if http_fixture:
  phase(expand(ROOT/('supabase/tests/support/capital_preview_native_http_setup.sql' if preview_fixture else 'supabase/tests/support/capital_s11_native_http_setup.sql')))
  phase('commit;')
  print(json.dumps({'eval':'capital_preview_http_human_bootstrap' if preview_fixture else 'capital_s11_http_human_bootstrap','result':'PASS','organizationId':http_namespace+'-0000-4000-8000-000000000002'}))
 else:
  phase('rollback;')
  print('PASS native_agent_activation_normalization_and_human_review')
finally:
 if p.poll() is None:
  try:
   p.stdin.write('rollback;\n\\q\n');p.stdin.flush();p.wait(timeout=10)
  except BrokenPipeError: p.wait(timeout=10)
