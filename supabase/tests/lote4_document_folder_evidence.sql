-- The folder method (C09) reads, through the job capability only, the work's files in arrival order with their
-- layer and why a file could not be opened, the registry of the work's dossiers, the company's other open works as
-- decisions and their documents as the vault, never a work or dossier outside the subject's reach; and the job may
-- read, never write, the layers of its own work. Synthetic and rolled back.
begin;
-- Modern synthetic lease: no legacy workspace capabilities or fixture trigger.
insert into private.worker_tokens(id,label,token_sha256) values
 ('a3300000-0000-4000-8000-000000000711','Ficha routing test worker',extensions.digest('synthetic-ficha-routing-worker-token','sha256'));

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values
  ('10000000-0000-4000-8000-000000000711', 'authenticated', 'authenticated',
   'preflight-owner@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false),
  ('10000000-0000-4000-8000-000000000712', 'authenticated', 'authenticated',
   'preflight-stranger@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false),
  ('10000000-0000-4000-8000-000000000713', 'authenticated', 'authenticated',
   'preflight-worker@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false);

insert into public.organizations (id, organization_type, name, created_by) values
  ('20000000-0000-4000-8000-000000000711', 'originator', 'Preflight Tenant A', '10000000-0000-4000-8000-000000000711'),
  ('20000000-0000-4000-8000-000000000712', 'originator', 'Preflight Tenant B', '10000000-0000-4000-8000-000000000712');
insert into public.organization_memberships (organization_id, user_id, role, status, joined_at) values
  ('20000000-0000-4000-8000-000000000711', '10000000-0000-4000-8000-000000000711', 'owner', 'active', now()),
  ('20000000-0000-4000-8000-000000000712', '10000000-0000-4000-8000-000000000712', 'owner', 'active', now());

insert into public.capital_projects (id, organization_id, project_name, entry_job, created_by) values (
  '30000000-0000-4000-8000-000000000711', '20000000-0000-4000-8000-000000000711',
  'Objective Preflight Test', 'capital_planning', '10000000-0000-4000-8000-000000000711'
);
insert into public.document_intake_sessions (
  id, organization_id, capital_project_id, started_by, journey, locale
) values (
  '40000000-0000-4000-8000-000000000711', '20000000-0000-4000-8000-000000000711',
  '30000000-0000-4000-8000-000000000711', '10000000-0000-4000-8000-000000000711',
  'company', 'pt-BR'
);
insert into public.agent_conversations (
  id, organization_id, intake_session_id, created_by
) values (
  '50000000-0000-4000-8000-000000000711', '20000000-0000-4000-8000-000000000711',
  '40000000-0000-4000-8000-000000000711', '10000000-0000-4000-8000-000000000711'
);
insert into public.agent_messages (
  id, organization_id, conversation_id, intake_session_id, role, status, content,
  locale, created_by
) values (
  '60000000-0000-4000-8000-000000000711', '20000000-0000-4000-8000-000000000711',
  '50000000-0000-4000-8000-000000000711', '40000000-0000-4000-8000-000000000711',
  'user', 'processing', 'Compare alternativas de estrutura de capital.', 'pt-BR',
  '10000000-0000-4000-8000-000000000711'
), (
  '60000000-0000-4000-8000-000000000712', '20000000-0000-4000-8000-000000000711',
  '50000000-0000-4000-8000-000000000711', '40000000-0000-4000-8000-000000000711',
  'user', 'processing', 'Prepare uma reunião de refinanciamento.', 'pt-BR',
  '10000000-0000-4000-8000-000000000711'
);
insert into public.processing_runs (
  id, organization_id, intake_session_id, run_no, trigger, status, pipeline_version, created_by
) values (
  '70000000-0000-4000-8000-000000000711', '20000000-0000-4000-8000-000000000711',
  '40000000-0000-4000-8000-000000000711', 1, 'manual', 'running', 'objective-preflight-test-v1',
  '10000000-0000-4000-8000-000000000711'
), (
  '70000000-0000-4000-8000-000000000712', '20000000-0000-4000-8000-000000000711',
  '40000000-0000-4000-8000-000000000711', 2, 'manual', 'running', 'objective-preflight-test-v1',
  '10000000-0000-4000-8000-000000000711'
);
-- A second work of the same company (linked to the first work's dossier) with a debt table objective and a
-- document; a third work with no relation.
insert into public.capital_projects (id, organization_id, project_name, entry_job, created_by) values
 ('30000000-0000-4000-8000-000000000721','20000000-0000-4000-8000-000000000711','Tabela de divida 2026','company_debt_view','10000000-0000-4000-8000-000000000711'),
 ('30000000-0000-4000-8000-000000000731','20000000-0000-4000-8000-000000000711','Outra companhia','company_debt_view','10000000-0000-4000-8000-000000000711');
insert into public.document_intake_sessions (id, organization_id, capital_project_id, started_by, journey, locale) values
 ('40000000-0000-4000-8000-000000000721','20000000-0000-4000-8000-000000000711','30000000-0000-4000-8000-000000000721','10000000-0000-4000-8000-000000000711','company','pt-BR'),
 ('40000000-0000-4000-8000-000000000731','20000000-0000-4000-8000-000000000711','30000000-0000-4000-8000-000000000731','10000000-0000-4000-8000-000000000711','company','pt-BR');
insert into public.work_dossiers(organization_id,work_id,dossier_id,linked_by)
select d.organization_id,'30000000-0000-4000-8000-000000000721',d.id,'10000000-0000-4000-8000-000000000711' from public.dossiers d where d.resource_id='30000000-0000-4000-8000-000000000711';
-- The registry of the first work's dossier: subject, parent, subsidiary, the economic group, and a withdrawn link.
insert into public.entities(id,organization_id,origin_dossier_id,kind,legal_name)
select x.id,d.organization_id,d.id,x.kind,x.name from public.dossiers d,(values
 ('e0000000-0000-4000-8000-000000000001'::uuid,'legal_entity','Aurora Alimentos S.A.'),('e0000000-0000-4000-8000-000000000002'::uuid,'legal_entity','Aurora Participacoes'),
 ('e0000000-0000-4000-8000-000000000003'::uuid,'legal_entity','Aurora Logistica'),('e0000000-0000-4000-8000-000000000004'::uuid,'economic_group','Grupo Aurora'),
 ('e0000000-0000-4000-8000-000000000005'::uuid,'legal_entity','Antiga Controlada')) x(id,kind,name) where d.resource_id='30000000-0000-4000-8000-000000000711';
insert into public.dossier_entity_links(organization_id,dossier_id,entity_id,relationship,perimeter,valid_from,withdrawn_at,withdrawn_by,withdrawal_reason,reviewed_by,review_reason,request_id,request_fingerprint)
select d.organization_id,d.id,x.e,x.r,x.p::jsonb,now()-interval '1 day',x.w,case when x.w is not null then '10000000-0000-4000-8000-000000000711'::uuid end,case when x.w is not null then 'Synthetic withdrawal' end,
 '10000000-0000-4000-8000-000000000711','Synthetic registry review',gen_random_uuid(),repeat('d',64)
from public.dossiers d,(values ('e0000000-0000-4000-8000-000000000001'::uuid,'subject','{"basis":"consolidated"}',null::timestamptz),('e0000000-0000-4000-8000-000000000002'::uuid,'parent','{"basis":"standalone"}',null),
 ('e0000000-0000-4000-8000-000000000003'::uuid,'subsidiary','{"basis":"standalone","ownership":"0.8"}',null),('e0000000-0000-4000-8000-000000000004'::uuid,'parent','{"basis":"consolidated"}',null),
 ('e0000000-0000-4000-8000-000000000005'::uuid,'subsidiary','{"basis":"standalone"}',now())) x(e,r,p,w) where d.resource_id='30000000-0000-4000-8000-000000000711';
-- Files: two of this work (one with a layer, one the pipeline could not open), one of the related work (the vault)
-- and one of the unrelated work, each with its source rights.
insert into public.source_documents(id,organization_id,intake_session_id,object_path,original_name,mime_type,byte_size,sha256,created_by,processing_status,created_at) values
 ('a0000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000711','40000000-0000-4000-8000-000000000711','20000000-0000-4000-8000-000000000711/40000000-0000-4000-8000-000000000711/a.pdf','balanco.pdf','application/pdf',10,repeat('1',64),'10000000-0000-4000-8000-000000000711','ready',now()-interval '2 minutes'),
 ('a0000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000711','40000000-0000-4000-8000-000000000711','20000000-0000-4000-8000-000000000711/40000000-0000-4000-8000-000000000711/b.pdf','protegido.pdf','application/pdf',10,repeat('2',64),'10000000-0000-4000-8000-000000000711','failed',now()-interval '1 minute'),
 ('a0000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000711','40000000-0000-4000-8000-000000000721','20000000-0000-4000-8000-000000000711/40000000-0000-4000-8000-000000000721/c.pdf','escritura.pdf','application/pdf',10,repeat('3',64),'10000000-0000-4000-8000-000000000711','ready',now()-interval '3 minutes'),
 ('a0000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000711','40000000-0000-4000-8000-000000000731','20000000-0000-4000-8000-000000000711/40000000-0000-4000-8000-000000000731/d.pdf','outra.pdf','application/pdf',10,repeat('4',64),'10000000-0000-4000-8000-000000000711','ready',now()-interval '3 minutes');
insert into private.source_version_verifications(organization_id,source_version_id,job_id,observed_sha256,observed_byte_size,receipt_id)
select organization_id,id,gen_random_uuid(),sha256,10,'synthetic-folder-'||id from public.source_documents where organization_id='20000000-0000-4000-8000-000000000711';
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000711","role":"authenticated","aal":"aal1"}', true);
select count(private.set_source_rights_v1(id,0,array['read','process','store','derive','export'],array['analysis','retrieval'],null,null,gen_random_uuid(),repeat('c',64)))
from public.source_documents where organization_id='20000000-0000-4000-8000-000000000711';
insert into public.document_layers(organization_id,source_document_id,layer_kind,object_path,sha256) values
 ('20000000-0000-4000-8000-000000000711','a0000000-0000-4000-8000-000000000001','pdf','20000000-0000-4000-8000-000000000711/layers/a.json',repeat('9',64)),
 ('20000000-0000-4000-8000-000000000711','a0000000-0000-4000-8000-000000000004','pdf','20000000-0000-4000-8000-000000000711/layers/d.json',repeat('8',64));
insert into public.processing_jobs(organization_id,processing_run_id,intake_session_id,source_document_id,kind,status,payload,attempts,last_error)
values('20000000-0000-4000-8000-000000000711','70000000-0000-4000-8000-000000000711','40000000-0000-4000-8000-000000000711','a0000000-0000-4000-8000-000000000002',
 'document_pipeline','failed','{}',1,'{"reason":"unreadable_document","message":"synthetic","code":"encrypted"}');
insert into public.processing_jobs (
  id, organization_id, processing_run_id, intake_session_id, kind, status, payload,
  attempts, leased_by, leased_account_user_id, lease_expires_at, capability_sha256
) values (
  '80000000-0000-4000-8000-000000000711', '20000000-0000-4000-8000-000000000711',
  '70000000-0000-4000-8000-000000000711', '40000000-0000-4000-8000-000000000711',
  'agent_operation_brief', 'leased',
  '{"message_id":"60000000-0000-4000-8000-000000000712","locale":"pt-BR"}'::jsonb,
  1, 'a3300000-0000-4000-8000-000000000711', '10000000-0000-4000-8000-000000000713', now() + interval '10 minutes', extensions.digest(repeat('r',64), 'sha256')
);
insert into public.capital_project_objective_preflights(organization_id,capital_project_id,source_message_id,processing_job_id,objective_kind,plan_schema_version,structural_identity,
 readiness_schema_version,readiness_fingerprint,readiness_status,terminal_reachable,objective_plan,preflight_decision,created_by)
values('20000000-0000-4000-8000-000000000711','30000000-0000-4000-8000-000000000721','60000000-0000-4000-8000-000000000711','80000000-0000-4000-8000-000000000711','debt_table',
 'objective-plan.v1',repeat('a',64),'objective-plan-readiness.v1',repeat('b',64),'ready',true,'{}','{}','10000000-0000-4000-8000-000000000711');
update public.profiles set full_name='Mariana Souza',job_title='Controller' where id='10000000-0000-4000-8000-000000000711';
insert into public.profiles(id,full_name,job_title) select '10000000-0000-4000-8000-000000000711','Mariana Souza','Controller'
 where not exists(select 1 from public.profiles where id='10000000-0000-4000-8000-000000000711');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000713","role":"authenticated","aal":"aal1"}', true);

-- 1. The evidence, as the worker reads it.
do $$
declare ev jsonb:=public.worker_document_folder_evidence_v1('80000000-0000-4000-8000-000000000711',repeat('r',64));
begin
 if ev->>'subjectEntityId' is distinct from 'e0000000-0000-4000-8000-000000000001' then raise exception 'subject wrong: %',ev->'subjectEntityId';end if;
 if (select jsonb_agg(e->>'label' order by n) from jsonb_array_elements(ev->'entities') with ordinality x(e,n))<>'["Aurora Alimentos S.A.","Aurora Participacoes","Aurora Logistica"]'::jsonb
  then raise exception 'registry wrong: %',ev->'entities';end if;
 if exists(select 1 from jsonb_array_elements(ev->'entities') e where e->>'groupId' is distinct from 'e0000000-0000-4000-8000-000000000004' or e->>'groupLabel' is distinct from 'Grupo Aurora')
  then raise exception 'group wrong';end if;
 if ev#>>'{entities,0,parentId}' is distinct from 'e0000000-0000-4000-8000-000000000002' or ev#>'{entities,1,parentId}'<>'null'::jsonb
  or ev#>>'{entities,2,parentId}' is distinct from 'e0000000-0000-4000-8000-000000000001' or ev#>>'{entities,2,ownership}' is distinct from '0.8' or ev#>'{entities,0,ownership}'<>'null'::jsonb
  then raise exception 'parents or ownership wrong: %',ev->'entities';end if;
 if ev->'decisions'<>'[{"id":"30000000-0000-4000-8000-000000000721","label":"Tabela de divida 2026","kind":"debt_discussion"}]'::jsonb then raise exception 'decisions wrong: %',ev->'decisions';end if;
 if ev->'vault'<>jsonb_build_array(jsonb_build_object('documentId','a0000000-0000-4000-8000-000000000003','sha256',repeat('3',64),'label','escritura.pdf','instrumentRef',null)) then raise exception 'vault wrong: %',ev->'vault';end if;
 if (select jsonb_agg(f->>'fileName' order by n) from jsonb_array_elements(ev->'files') with ordinality x(f,n))<>'["balanco.pdf","protegido.pdf"]'::jsonb then raise exception 'files wrong';end if;
 if ev#>>'{files,0,layerObjectPath}' is distinct from '20000000-0000-4000-8000-000000000711/layers/a.json' or ev#>>'{files,0,status}'<>'ready' or ev#>'{files,0,locked}'<>'null'::jsonb
  or ev#>>'{files,1,status}'<>'failed' or ev#>>'{files,1,locked}' is distinct from 'password_protected' or ev#>'{files,1,layerObjectPath}'<>'null'::jsonb or ev#>'{files,0,layer}'<>'null'::jsonb
  then raise exception 'file detail wrong: %',ev->'files';end if;
 -- The author and the date of the turn's message, for the answers to open questions.
 if ev->>'author' is distinct from 'Mariana Souza, Controller' or ev->>'messageDate' is null then raise exception 'author wrong: % %',ev->'author',ev->'messageDate';end if;
 raise notice 'PASS: folder evidence reads the work, its registry, open works and vault';
end $$;

-- 2. The readings: the conversation reads no layer. It asks for the readings of its work's files; a file without one gets
-- one reading job, never two, that names its target file (whose own rights its authority checks), and a file of another
-- work is refused.
do $$
declare r jsonb;
begin
 if private.worker_can_access_document_storage_v1('document-layers','20000000-0000-4000-8000-000000000711/layers/a.json',false) then raise exception 'the conversation reads a layer';end if;
 r:=public.worker_document_folder_readings_v1('80000000-0000-4000-8000-000000000711',repeat('r',64),'document-folder-reading.2026.10.27-v1',
  '{"registry":[{"id":"aurora","label":"Aurora","groupLabel":"Grupo Aurora"}]}'::jsonb,'[{"documentId":"a0000000-0000-4000-8000-000000000001"}]'::jsonb,null);
 if r#>>'{files,0,status}'<>'pending' or (r->>'queued')::int<>1 then raise exception 'reading not queued: %',r;end if;
 r:=public.worker_document_folder_readings_v1('80000000-0000-4000-8000-000000000711',repeat('r',64),'document-folder-reading.2026.10.27-v1',
  '{"registry":[{"id":"aurora","label":"Aurora","groupLabel":"Grupo Aurora"}]}'::jsonb,'[{"documentId":"a0000000-0000-4000-8000-000000000001"}]'::jsonb,null);
 if (r->>'queued')::int<>0 or (select count(*) from public.processing_jobs where organization_id='20000000-0000-4000-8000-000000000711' and kind='document_folder_reading')<>1
  then raise exception 'reading queued twice';end if;
 if (select payload->>'sha256' from public.processing_jobs where kind='document_folder_reading')<>repeat('1',64)
  or (select work_id from public.processing_jobs where kind='document_folder_reading')<>'30000000-0000-4000-8000-000000000711'
  or (select authorization_subject_id from public.processing_jobs where kind='document_folder_reading')<>'10000000-0000-4000-8000-000000000711'
  or (select source_document_id from public.processing_jobs where kind='document_folder_reading') is distinct from 'a0000000-0000-4000-8000-000000000001'
  then raise exception 'reading job wrong';end if;
 begin perform public.worker_document_folder_readings_v1('80000000-0000-4000-8000-000000000711',repeat('r',64),'document-folder-reading.2026.10.27-v1','{}'::jsonb,
  '[{"documentId":"a0000000-0000-4000-8000-000000000004"}]'::jsonb,null); raise exception 'another work file answered';
 exception when insufficient_privilege then null; end;
 raise notice 'PASS: readings asked by the conversation, one reading job per file';
end $$;

-- 3. The reading job: its input, the storage gate (its own file's ready layer, read-only, nothing else), and its record.
update public.processing_jobs set status='leased',attempts=1,leased_by='a3300000-0000-4000-8000-000000000711',leased_account_user_id='10000000-0000-4000-8000-000000000713',
 lease_expires_at=now()+interval '10 minutes',capability_sha256=extensions.digest(repeat('s',64),'sha256') where kind='document_folder_reading';
do $$
declare j uuid:=(select id from public.processing_jobs where kind='document_folder_reading');r jsonb;
begin
 r:=public.worker_document_folder_reading_input_v1(j,repeat('s',64));
 if r->>'layerObjectPath' is distinct from '20000000-0000-4000-8000-000000000711/layers/a.json' or r->>'sha256'<>repeat('1',64) or r#>>'{context,registry,0,id}'<>'aurora' then raise exception 'input wrong: %',r;end if;
 begin perform public.worker_document_folder_reading_input_v1('80000000-0000-4000-8000-000000000711',repeat('r',64)); raise exception 'the conversation read a reading input';
 exception when insufficient_privilege then null; end;
 if not private.worker_can_access_document_storage_v1('document-layers','20000000-0000-4000-8000-000000000711/layers/a.json',false) then raise exception 'own layer not readable';end if;
 if private.worker_can_access_document_storage_v1('document-layers','20000000-0000-4000-8000-000000000711/layers/a.json',true) then raise exception 'own layer writable';end if;
 if private.worker_can_access_document_storage_v1('document-layers','20000000-0000-4000-8000-000000000711/layers/d.json',false) then raise exception 'another work layer readable';end if;
 if private.worker_can_access_document_storage_v1('opportunity-documents','20000000-0000-4000-8000-000000000711/40000000-0000-4000-8000-000000000711/a.pdf',false) then raise exception 'original document readable';end if;
 begin perform public.worker_record_document_folder_reading_v1(j,repeat('s',64),'ready',null,null); raise exception 'empty reading recorded';
 exception when invalid_parameter_value then null; end;
 r:=public.worker_record_document_folder_reading_v1(j,repeat('s',64),'ready','{"extraction":{},"pageCount":3,"pagesWithoutText":[2]}'::jsonb,null);
 if r->>'recorded'<>'true' then raise exception 'reading not recorded';end if;
 r:=public.worker_record_document_folder_reading_v1(j,repeat('s',64),'refused',null,'reading');
 if r->>'recorded'<>'false' or (select status from private.document_folder_readings where sha256=repeat('1',64))<>'ready' then raise exception 'reading overwritten';end if;
 if has_table_privilege('authenticated','private.document_folder_readings','SELECT') or has_table_privilege('service_role','private.document_folder_readings','SELECT') then raise exception 'readings exposed';end if;
 raise notice 'PASS: the reading job reads its own file and records once';
end $$;
do $$
declare r jsonb;
begin
 r:=public.worker_document_folder_readings_v1('80000000-0000-4000-8000-000000000711',repeat('r',64),'document-folder-reading.2026.10.27-v1',
  '{"registry":[{"id":"aurora","label":"Aurora","groupLabel":"Grupo Aurora"}]}'::jsonb,'[{"documentId":"a0000000-0000-4000-8000-000000000001"}]'::jsonb,null);
 if r#>>'{files,0,status}'<>'ready' or r#>>'{files,0,reading,pageCount}'<>'3' then raise exception 'ready reading not returned: %',r;end if;
 -- Another registry is another reading.
 r:=public.worker_document_folder_readings_v1('80000000-0000-4000-8000-000000000711',repeat('r',64),'document-folder-reading.2026.10.27-v1',
  '{"registry":[]}'::jsonb,'[{"documentId":"a0000000-0000-4000-8000-000000000001"}]'::jsonb,null);
 if r#>>'{files,0,status}'<>'pending' then raise exception 'reading of another registry reused';end if;
 raise notice 'PASS: the conversation reads the stored reading';
end $$;

-- 3b. Every reading recorded carries on every open wait of the organization, of any work or session, under that wait's own
-- authority: two works sharing bytes are both served by one reading; a wait that got no job because another session took
-- the 50 places is queued when a place frees; a complete wait gets one continuation turn even while its own turn is still
-- running (that turn may end with reading_pending), and it closes only when a turn reads the complete set.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000711","role":"authenticated","aal":"aal1"}', true);
insert into public.source_documents(id,organization_id,intake_session_id,object_path,original_name,mime_type,byte_size,sha256,created_by,processing_status,created_at)
select x.id,'20000000-0000-4000-8000-000000000711'::uuid,x.s,'20000000-0000-4000-8000-000000000711/'||x.id||'.pdf',x.n,'application/pdf',10,x.h,'10000000-0000-4000-8000-000000000711'::uuid,'ready',now()
from (values ('a0000000-0000-4000-8000-000000000005'::uuid,'40000000-0000-4000-8000-000000000711'::uuid,'extrato.pdf',repeat('5',64)),
 ('a0000000-0000-4000-8000-000000000006'::uuid,'40000000-0000-4000-8000-000000000721'::uuid,'extrato-copia.pdf',repeat('5',64)),
 ('a0000000-0000-4000-8000-000000000007'::uuid,'40000000-0000-4000-8000-000000000721'::uuid,'contrato.pdf',repeat('6',64))) x(id,s,n,h)
union all
select ('b0000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,'20000000-0000-4000-8000-000000000711','40000000-0000-4000-8000-000000000711',
 '20000000-0000-4000-8000-000000000711/fill/'||g||'.pdf','fill'||g||'.pdf','application/pdf',10,encode(extensions.digest('fill'||g,'sha256'),'hex'),'10000000-0000-4000-8000-000000000711','ready',now()
from generate_series(1,47) g;
insert into private.source_version_verifications(organization_id,source_version_id,job_id,observed_sha256,observed_byte_size,receipt_id)
select organization_id,id,gen_random_uuid(),sha256,10,'synthetic-folder-'||id from public.source_documents d where organization_id='20000000-0000-4000-8000-000000000711'
 and not exists(select 1 from private.source_version_verifications v where v.source_version_id=d.id);
select count(private.set_source_rights_v1(id,0,array['read','process','store','derive','export'],array['analysis','retrieval'],null,null,gen_random_uuid(),repeat('c',64)))
from public.source_documents where organization_id='20000000-0000-4000-8000-000000000711' and (id::text like 'b0000000%' or id::text like 'a0000000-0000-4000-8000-00000000000_' and id>'a0000000-0000-4000-8000-000000000004');
insert into public.document_layers(organization_id,source_document_id,layer_kind,object_path,sha256) values
 ('20000000-0000-4000-8000-000000000711','a0000000-0000-4000-8000-000000000005','pdf','20000000-0000-4000-8000-000000000711/layers/e.json',repeat('7',64));
insert into public.agent_conversations(id,organization_id,intake_session_id,created_by) values
 ('50000000-0000-4000-8000-000000000721','20000000-0000-4000-8000-000000000711','40000000-0000-4000-8000-000000000721','10000000-0000-4000-8000-000000000711');
insert into public.agent_messages(id,organization_id,conversation_id,intake_session_id,role,status,content,locale,created_by) values
 ('60000000-0000-4000-8000-000000000721','20000000-0000-4000-8000-000000000711','50000000-0000-4000-8000-000000000721','40000000-0000-4000-8000-000000000721',
  'user','processing','Organiza a pasta da tabela de dívida.','pt-BR','10000000-0000-4000-8000-000000000711');
insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,status,pipeline_version,created_by) values
 ('70000000-0000-4000-8000-000000000721','20000000-0000-4000-8000-000000000711','40000000-0000-4000-8000-000000000721',1,'manual','running','objective-preflight-test-v1','10000000-0000-4000-8000-000000000711');
insert into public.processing_jobs(id,organization_id,processing_run_id,intake_session_id,kind,status,payload,attempts,leased_by,leased_account_user_id,lease_expires_at,capability_sha256) values
 ('80000000-0000-4000-8000-000000000721','20000000-0000-4000-8000-000000000711','70000000-0000-4000-8000-000000000721','40000000-0000-4000-8000-000000000721',
  'agent_operation_brief','leased','{"message_id":"60000000-0000-4000-8000-000000000721","locale":"pt-BR"}',1,'a3300000-0000-4000-8000-000000000711',
  '10000000-0000-4000-8000-000000000713',now()+interval '10 minutes',extensions.digest(repeat('w',64),'sha256'));
-- New files raise the session's revision; the brief job of work 711 is leased again under the current one.
update public.processing_jobs j set authorization_revision=r.revision from private.authorization_revisions r
 where j.id='80000000-0000-4000-8000-000000000711' and r.organization_id=j.organization_id and r.resource_id=j.authorization_resource_id and r.subject_user_id=j.authorization_subject_id;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000713","role":"authenticated","aal":"aal1"}', true);
create function pg_temp.lease(p_sha text,p_cap text) returns uuid language sql as $$
 update public.processing_jobs set status='leased',attempts=1,leased_by='a3300000-0000-4000-8000-000000000711',leased_account_user_id='10000000-0000-4000-8000-000000000713',
  lease_expires_at=now()+interval '10 minutes',capability_sha256=extensions.digest(p_cap,'sha256')
 where id=(select id from public.processing_jobs where kind='document_folder_reading' and status='queued' and payload->>'sha256'=p_sha
  and payload#>>'{context,registry,0,id}'='c3' limit 1) returning id; $$;
do $$
declare c jsonb:='{"registry":[{"id":"c3","label":"C","groupLabel":"G"}]}';fill jsonb:='{"registry":[{"id":"c3","label":"C","groupLabel":"G"}],"lote":"fila"}';
 f0 jsonb:='{"mode":{"value":"organize_only","origin":"informed","source":"Só organiza"},"decisions":[],"informed":[]}';r jsonb;j uuid;m public.agent_messages;w1 uuid;w2 uuid;
begin
 -- Work 711 asks for two files; a second wait of the same session takes the other 47 places (one is held since section 3).
 r:=public.worker_document_folder_readings_v1('80000000-0000-4000-8000-000000000711',repeat('r',64),'document-folder-reading.2026.10.27-v1',c,
  '[{"documentId":"a0000000-0000-4000-8000-000000000001"},{"documentId":"a0000000-0000-4000-8000-000000000005"}]',f0);
 if (r->>'queued')::int<>2 then raise exception 'work 711 not queued: %',r;end if;
 r:=public.worker_document_folder_readings_v1('80000000-0000-4000-8000-000000000711',repeat('r',64),'document-folder-reading.2026.10.27-v1',fill,
  (select jsonb_agg(jsonb_build_object('documentId',id)) from public.source_documents where original_name like 'fill%'),null);
 if (select count(*) from public.processing_jobs where kind='document_folder_reading' and status in ('queued','leased'))<50 then raise exception 'queue not full';end if;
 -- Work 721 shares the bytes of one file (no job of its own) and gets no place for the other.
 r:=public.worker_document_folder_readings_v1('80000000-0000-4000-8000-000000000721',repeat('w',64),'document-folder-reading.2026.10.27-v1',c,
  '[{"documentId":"a0000000-0000-4000-8000-000000000006"},{"documentId":"a0000000-0000-4000-8000-000000000007"}]',f0);
 if (r->>'queued')::int<>0 then raise exception 'work 721 got a place in a full queue';end if;
 select id into w2 from private.document_folder_reading_waits where work_id='30000000-0000-4000-8000-000000000721' and consumed_at is null;
 select id into w1 from private.document_folder_reading_waits where work_id='30000000-0000-4000-8000-000000000711' and context=c and consumed_at is null;
 -- The shared bytes are read: the place it frees goes to work 721's file, queued in that work's session and person.
 j:=pg_temp.lease(repeat('5',64),repeat('x',64));
 r:=public.worker_record_document_folder_reading_v1(j,repeat('x',64),'ready','{"extraction":{},"pageCount":1,"pagesWithoutText":[]}',null);
 if not exists(select 1 from public.processing_jobs where kind='document_folder_reading' and status='queued' and payload->>'sha256'=repeat('6',64)
   and payload->>'document_folder_wait_id'=w2::text and intake_session_id='40000000-0000-4000-8000-000000000721'
   and authorization_subject_id='10000000-0000-4000-8000-000000000711') then raise exception 'the waiting work was not served when a place freed';end if;
 -- Work 721's last file is read: its continuation turn is queued although its own turn is still running.
 j:=pg_temp.lease(repeat('6',64),repeat('y',64));
 r:=public.worker_record_document_folder_reading_v1(j,repeat('y',64),'ready','{"extraction":{},"pageCount":1,"pagesWithoutText":[]}',null);
 if (r->>'resumed')::int<1 then raise exception 'shared-bytes work not resumed: %',r;end if;
 select * into m from public.agent_messages where metadata->>'kind'='document_folder_resume' and metadata->>'waitId'=w2::text;
 if m.id is null or m.metadata->>'origin'<>'system' or m.created_by<>'10000000-0000-4000-8000-000000000713' or m.content<>'Leitura da pasta concluída.' then raise exception 'continuation of work 721 wrong';end if;
 if not exists(select 1 from public.processing_jobs where kind='agent_operation_brief' and payload->>'message_id'=m.id::text and status='queued'
   and intake_session_id='40000000-0000-4000-8000-000000000721' and authorization_subject_id='10000000-0000-4000-8000-000000000711'
   and payload#>>'{document_folder_resume,source_message_id}'='60000000-0000-4000-8000-000000000721' and payload#>'{document_folder_resume,framing}'=f0)
  then raise exception 'continuation turn of work 721 not queued with its resume';end if;
 if (select consumed_at from private.document_folder_reading_waits where id=w2) is not null then raise exception 'wait closed before a turn read the set';end if;
 -- Work 711's turn (its message still processing) got reading_pending; its last file is read now: the continuation is queued, once.
 j:=pg_temp.lease(repeat('1',64),repeat('z',64));
 r:=public.worker_record_document_folder_reading_v1(j,repeat('z',64),'refused',null,'unreadable');
 if (select count(*) from public.agent_messages where metadata->>'kind'='document_folder_resume' and metadata->>'waitId'=w1::text)<>1
  then raise exception 'work 711 not resumed once';end if;
 perform private.document_folder_reading_advance_v1('20000000-0000-4000-8000-000000000711');
 if (select count(*) from public.agent_messages where metadata->>'kind'='document_folder_resume' and metadata->>'waitId' in (w1::text,w2::text))<>2
  then raise exception 'continuation scheduled twice';end if;
 -- The original turn of work 711 ends with reading_pending: the wait stays open with its continuation.
 if (select consumed_at from private.document_folder_reading_waits where id=w1) is not null or (select resume_message_id from private.document_folder_reading_waits where id=w1) is null
  then raise exception 'durable resume lost';end if;
 raise notice 'PASS: the readings serve every waiting work and resume it durably, without a new message';
end $$;

-- 3c. The continuation reads the complete set: the wait closes as consumed; its evidence names the person of the original
-- message as the author, never the system's continuation.
update public.processing_jobs set status='leased',attempts=1,leased_by='a3300000-0000-4000-8000-000000000711',leased_account_user_id='10000000-0000-4000-8000-000000000713',
 lease_expires_at=now()+interval '10 minutes',capability_sha256=extensions.digest(repeat('v',64),'sha256')
 where kind='agent_operation_brief' and payload#>>'{document_folder_resume,wait_id}'=(select id::text from private.document_folder_reading_waits
  where work_id='30000000-0000-4000-8000-000000000711' and context='{"registry":[{"id":"c3","label":"C","groupLabel":"G"}]}' and consumed_at is null);
do $$
declare j uuid:=(select id from public.processing_jobs where kind='agent_operation_brief' and payload#>>'{document_folder_resume,wait_id}'=(select id::text from private.document_folder_reading_waits
  where work_id='30000000-0000-4000-8000-000000000711' and context='{"registry":[{"id":"c3","label":"C","groupLabel":"G"}]}' and consumed_at is null));
 ev jsonb;r jsonb;c jsonb:='{"registry":[{"id":"c3","label":"C","groupLabel":"G"}]}';
begin
 r:=public.worker_document_folder_readings_v1(j,repeat('v',64),'document-folder-reading.2026.10.27-v1',c,
  '[{"documentId":"a0000000-0000-4000-8000-000000000001"},{"documentId":"a0000000-0000-4000-8000-000000000005"}]',null);
 if exists(select 1 from jsonb_array_elements(r->'files') x where x->>'status'='pending') then raise exception 'set not complete: %',r;end if;
 if exists(select 1 from private.document_folder_reading_waits where work_id='30000000-0000-4000-8000-000000000711' and context=c and consumed_at is null)
  then raise exception 'wait not consumed by the turn that read the set';end if;
 ev:=public.worker_document_folder_evidence_v1(j,repeat('v',64));
 if ev->>'author' is distinct from 'Mariana Souza, Controller' then raise exception 'resumed turn author wrong: %',ev->'author';end if;
 -- Without the resume, a message of origin system names no author.
 update public.processing_jobs set payload=payload-'document_folder_resume' where id=j;
 ev:=public.worker_document_folder_evidence_v1(j,repeat('v',64));
 if ev->'author'<>'null'::jsonb then raise exception 'system continuation read as the person: %',ev->'author';end if;
 if has_table_privilege('authenticated','private.document_folder_reading_waits','SELECT') then raise exception 'waits exposed';end if;
 raise notice 'PASS: the continuation is never the person''s message, and the wait closes when the set is read';
end $$;

-- 3d. A file's own rights: a second session of the same work holds a file with bytes already read; once its rights are
-- withdrawn, the conversation of the first session is refused that file by name (the stored reading of the same bytes is
-- never given for it, nothing is queued), and a reading job queued for it reads neither its input nor its layer.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000711","role":"authenticated","aal":"aal1"}', true);
insert into public.document_intake_sessions (id, organization_id, capital_project_id, started_by, journey, locale) values
 ('40000000-0000-4000-8000-000000000712','20000000-0000-4000-8000-000000000711','30000000-0000-4000-8000-000000000711','10000000-0000-4000-8000-000000000711','company','pt-BR');
insert into public.source_documents(id,organization_id,intake_session_id,object_path,original_name,mime_type,byte_size,sha256,created_by,processing_status,created_at) values
 ('a0000000-0000-4000-8000-000000000008','20000000-0000-4000-8000-000000000711','40000000-0000-4000-8000-000000000712','20000000-0000-4000-8000-000000000711/40000000-0000-4000-8000-000000000712/h.pdf',
  'balanco-copia.pdf','application/pdf',10,repeat('1',64),'10000000-0000-4000-8000-000000000711','ready',now());
insert into private.source_version_verifications(organization_id,source_version_id,job_id,observed_sha256,observed_byte_size,receipt_id)
values('20000000-0000-4000-8000-000000000711','a0000000-0000-4000-8000-000000000008',gen_random_uuid(),repeat('1',64),10,'synthetic-folder-h');
select private.set_source_rights_v1('a0000000-0000-4000-8000-000000000008',0,array['read','process','store','derive','export'],array['analysis','retrieval'],null,null,gen_random_uuid(),repeat('c',64));
insert into public.document_layers(organization_id,source_document_id,layer_kind,object_path,sha256) values
 ('20000000-0000-4000-8000-000000000711','a0000000-0000-4000-8000-000000000008','pdf','20000000-0000-4000-8000-000000000711/layers/h.json',repeat('8',64));
update public.processing_jobs j set authorization_revision=r.revision from private.authorization_revisions r
 where j.id='80000000-0000-4000-8000-000000000711' and r.organization_id=j.organization_id and r.resource_id=j.authorization_resource_id and r.subject_user_id=j.authorization_subject_id;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000713","role":"authenticated","aal":"aal1"}', true);
do $$
declare r jsonb;
begin
 -- While the rights hold, the stored reading of the same bytes is given and another registry queues a job naming the file.
 r:=public.worker_document_folder_readings_v1('80000000-0000-4000-8000-000000000711',repeat('r',64),'document-folder-reading.2026.10.27-v1',
  '{"registry":[{"id":"aurora","label":"Aurora","groupLabel":"Grupo Aurora"}]}'::jsonb,'[{"documentId":"a0000000-0000-4000-8000-000000000008"}]'::jsonb,null);
 if r#>>'{files,0,status}'<>'ready' then raise exception 'held file not read: %',r;end if;
 perform public.worker_document_folder_readings_v1('80000000-0000-4000-8000-000000000711',repeat('r',64),'document-folder-reading.2026.10.27-v1',
  '{"registry":[{"id":"h3","label":"H","groupLabel":"G"}]}'::jsonb,'[{"documentId":"a0000000-0000-4000-8000-000000000008"}]'::jsonb,null);
 if not exists(select 1 from public.processing_jobs where kind='document_folder_reading' and source_document_id='a0000000-0000-4000-8000-000000000008' and status='queued')
  then raise exception 'job for the second session file not queued';end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000711","role":"authenticated","aal":"aal1"}', true);
select private.set_source_rights_v1('a0000000-0000-4000-8000-000000000008',(select max(revision) from private.source_rights_versions where source_version_id='a0000000-0000-4000-8000-000000000008'),
 array['read'],array['analysis','retrieval'],null,null,gen_random_uuid(),repeat('c',64));
update public.processing_jobs set status='leased',attempts=1,leased_by='a3300000-0000-4000-8000-000000000711',leased_account_user_id='10000000-0000-4000-8000-000000000713',
 lease_expires_at=now()+interval '10 minutes',capability_sha256=extensions.digest(repeat('h',64),'sha256')
 where kind='document_folder_reading' and source_document_id='a0000000-0000-4000-8000-000000000008' and status='queued';
-- The withdrawal raises the work's revision: the conversation's next turn and the reading job are taken under the current
-- one, so what refuses the file below is the file's own rights, not a stale revision.
update public.processing_jobs j set authorization_revision=r.revision from private.authorization_revisions r
 where (j.id='80000000-0000-4000-8000-000000000711' or j.source_document_id='a0000000-0000-4000-8000-000000000008')
  and r.organization_id=j.organization_id and r.resource_id=j.authorization_resource_id and r.subject_user_id=j.authorization_subject_id;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000713","role":"authenticated","aal":"aal1"}', true);
do $$
declare r jsonb;j uuid:=(select id from public.processing_jobs where kind='document_folder_reading' and source_document_id='a0000000-0000-4000-8000-000000000008');
begin
 r:=public.worker_document_folder_readings_v1('80000000-0000-4000-8000-000000000711',repeat('r',64),'document-folder-reading.2026.10.27-v1',
  '{"registry":[{"id":"aurora","label":"Aurora","groupLabel":"Grupo Aurora"}]}'::jsonb,
  '[{"documentId":"a0000000-0000-4000-8000-000000000001"},{"documentId":"a0000000-0000-4000-8000-000000000008"}]'::jsonb,null);
 if r#>>'{files,0,status}'<>'ready' then raise exception 'the first session file lost its reading';end if;
 if r#>>'{files,1,status}'<>'refused' or r#>>'{files,1,refusalCode}'<>'source_rights_revoked' or r#>'{files,1,reading}'<>'null'::jsonb or (r->>'queued')::int<>0
  then raise exception 'withdrawn file answered from the stored reading: %',r;end if;
 begin perform public.worker_document_folder_reading_input_v1(j,repeat('h',64)); raise exception 'withdrawn file input read';
 exception when insufficient_privilege then null; end;
 if private.worker_can_access_document_storage_v1('document-layers','20000000-0000-4000-8000-000000000711/layers/h.json',false) then raise exception 'withdrawn file layer readable';end if;
 raise notice 'PASS: a file whose own rights were withdrawn is refused by name, its reading and layer never given';
end $$;

-- 3e. Recovery without a recorded reading: a wait that got no place is queued when a place frees; a reading job that ends
-- without its reading (cancelled by the outbox, failed for good) queues the file again under the wait's own person, at
-- most three times, after which the file is refused by name and the wait completes; a continuation that fails is
-- scheduled again, at most three for a wait. Another session's jobs take every place first.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000711","role":"authenticated","aal":"aal1"}', true);
insert into public.processing_jobs(organization_id,processing_run_id,intake_session_id,kind,payload,max_attempts)
select '20000000-0000-4000-8000-000000000711','70000000-0000-4000-8000-000000000711','40000000-0000-4000-8000-000000000711','document_folder_reading',
 jsonb_build_object('sha256',encode(extensions.digest('pad'||g,'sha256'),'hex'),'reader_version','document-folder-reading.2026.10.27-v1','context_fingerprint',repeat('0',64)),2
from generate_series(1,50-(select count(*) from public.processing_jobs j where j.kind='document_folder_reading' and j.status in ('queued','leased')
 and not exists(select 1 from private.document_folder_readings r where r.organization_id=j.organization_id and r.sha256=j.payload->>'sha256'
  and r.reader_version=j.payload->>'reader_version' and r.context_fingerprint=j.payload->>'context_fingerprint'))::int) g;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000713","role":"authenticated","aal":"aal1"}', true);
do $$
declare c jsonb:='{"registry":[{"id":"r3e","label":"R","groupLabel":"G"}]}';r jsonb;w uuid;j uuid;k integer;
begin
 r:=public.worker_document_folder_readings_v1('80000000-0000-4000-8000-000000000721',repeat('w',64),'document-folder-reading.2026.10.27-v1',c,
  '[{"documentId":"a0000000-0000-4000-8000-000000000003"}]',null);
 select id into w from private.document_folder_reading_waits where work_id='30000000-0000-4000-8000-000000000721' and context=c and consumed_at is null;
 if (r->>'queued')::int<>0 or w is null then raise exception 'queue not full for the test: %',r;end if;
 -- Another session's job ends: the place goes to the waiting file, in its own wait and person.
 update public.processing_jobs set status='cancelled' where id=(select id from public.processing_jobs where kind='document_folder_reading' and status='queued'
  and payload->>'context_fingerprint'=repeat('0',64) limit 1);
 for k in 1..3 loop
  select id into j from public.processing_jobs where kind='document_folder_reading' and status='queued' and payload->>'document_folder_wait_id'=w::text
   and source_document_id='a0000000-0000-4000-8000-000000000003' and intake_session_id='40000000-0000-4000-8000-000000000721'
   and authorization_subject_id='10000000-0000-4000-8000-000000000711';
  if j is null then raise exception 'file not queued again after % ended jobs',k-1;end if;
  -- The first ends cancelled, as the outbox cancels it; the others fail for good.
  update public.processing_jobs set status=case when k=1 then 'cancelled' else 'failed' end,capability_sha256=null,lease_expires_at=null,leased_by=null where id=j;
 end loop;
 if exists(select 1 from public.processing_jobs where kind='document_folder_reading' and status='queued' and payload->>'document_folder_wait_id'=w::text)
  then raise exception 'file queued a fourth time';end if;
 if (select count(*) from public.agent_messages where metadata->>'waitId'=w::text)<>1 then raise exception 'completed wait not resumed';end if;
 -- The continuation fails: scheduled again, at most three for the wait.
 for k in 1..3 loop
  update public.processing_jobs set status='failed' where kind='agent_operation_brief' and status='queued' and payload#>>'{document_folder_resume,wait_id}'=w::text;
 end loop;
 if (select count(*) from public.agent_messages where metadata->>'waitId'=w::text)<>3 then raise exception 'failed continuation not scheduled again, or more than three';end if;
 raise notice 'PASS: ended reading jobs and failed continuations carry the wait on, bounded';
end $$;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000713","role":"authenticated","aal":"aal1"}', true);
do $$
declare st jsonb;
begin
 st:=private.document_folder_file_state_v1('20000000-0000-4000-8000-000000000711','a0000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000711',
  (select id from private.document_folder_reading_waits where work_id='30000000-0000-4000-8000-000000000721' and context='{"registry":[{"id":"r3e","label":"R","groupLabel":"G"}]}'),
  'document-folder-reading.2026.10.27-v1',encode(extensions.digest('{"registry": [{"id": "r3e", "label": "R", "groupLabel": "G"}]}','sha256'),'hex'));
 if st->>'refusalCode' is distinct from 'reading_failed' then raise exception 'exhausted file not refused by name: %',st;end if;
end $$;

-- 3f. A folder reading job ends while the document pipeline is still ingesting in the same session: its failure for good
-- or its completion moves neither the file it read nor the session, which only the run it follows may move.
-- The jobs that filled the queue in 3b and 3e end, freeing the places.
update public.processing_jobs set status='succeeded' where kind='document_folder_reading' and status='queued'
 and (payload->>'context_fingerprint'=repeat('0',64) or payload->'context' ? 'lote');
update public.document_intake_sessions set status='processing',current_run_id='70000000-0000-4000-8000-000000000712' where id='40000000-0000-4000-8000-000000000711';
update public.source_documents set processing_status='processing' where id in ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000005');
do $$
declare c jsonb:='{"registry":[{"id":"f3f","label":"F","groupLabel":"G"}]}';r jsonb;j1 uuid;j5 uuid;
begin
 r:=public.worker_document_folder_readings_v1('80000000-0000-4000-8000-000000000711',repeat('r',64),'document-folder-reading.2026.10.27-v1',c,
  '[{"documentId":"a0000000-0000-4000-8000-000000000001"},{"documentId":"a0000000-0000-4000-8000-000000000005"}]',null);
 if (r->>'queued')::int<>2 then raise exception 'reading jobs not queued for the ingestion test: %',r;end if;
end $$;
update public.processing_jobs set status='leased',attempts=2,max_attempts=2,leased_by='a3300000-0000-4000-8000-000000000711',leased_account_user_id='10000000-0000-4000-8000-000000000713',
 lease_expires_at=now()+interval '10 minutes',capability_sha256=extensions.digest(case source_document_id when 'a0000000-0000-4000-8000-000000000001' then repeat('k',64) else repeat('m',64) end,'sha256')
 where kind='document_folder_reading' and status='queued' and payload#>>'{context,registry,0,id}'='f3f';
do $$
declare j1 uuid:=(select id from public.processing_jobs where kind='document_folder_reading' and source_document_id='a0000000-0000-4000-8000-000000000001' and payload#>>'{context,registry,0,id}'='f3f');
 j5 uuid:=(select id from public.processing_jobs where kind='document_folder_reading' and source_document_id='a0000000-0000-4000-8000-000000000005' and payload#>>'{context,registry,0,id}'='f3f');r jsonb;
begin
 -- One reading completes; the last one of its run fails for good (the layer download), which ends the run failed.
 r:=public.worker_complete_job(j5,repeat('m',64),'{}'::jsonb);
 r:=public.worker_fail_job(j1,repeat('k',64),'{"code":"layer_download_failed","stage":"document_folder_reading","retryable":false,"cause":{"name":"StorageError","class":"transient","message":"layer download failed"}}'::jsonb,false,60);
 if r->>'retrying'<>'false' or (r->>'pending_jobs')::int<>0 or (select status from public.processing_jobs where id=j1)<>'failed' then raise exception 'reading failure not final: %',r;end if;
 if (select status from public.document_intake_sessions where id='40000000-0000-4000-8000-000000000711')<>'processing'
  then raise exception 'a folder reading moved the session the pipeline is ingesting';end if;
 if exists(select 1 from public.source_documents where id in ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000005') and processing_status<>'processing')
  then raise exception 'a folder reading moved the file the pipeline owns';end if;
 raise notice 'PASS: a folder reading job ends without moving the file or the session being ingested';
end $$;
update public.document_intake_sessions set status='review_ready',current_run_id=null where id='40000000-0000-4000-8000-000000000711';
update public.source_documents set processing_status='ready' where id in ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000005');

-- 3g. The person cancelled after the wait opened: the continuation turn closes the wait as cancelled, once, and only the
-- brief job carrying that wait's own resume may.
update public.processing_jobs set status='leased',attempts=1,leased_by='a3300000-0000-4000-8000-000000000711',leased_account_user_id='10000000-0000-4000-8000-000000000713',
 lease_expires_at=now()+interval '10 minutes',capability_sha256=extensions.digest(repeat('g',64),'sha256')
 where kind='agent_operation_brief' and status='queued' and payload#>>'{document_folder_resume,wait_id}'=(select id::text from private.document_folder_reading_waits
  where work_id='30000000-0000-4000-8000-000000000711' and context='{"registry":[{"id":"h3","label":"H","groupLabel":"G"}]}' and consumed_at is null);
do $$
declare j uuid:=(select id from public.processing_jobs where capability_sha256=extensions.digest(repeat('g',64),'sha256'));w private.document_folder_reading_waits;
begin
 if j is null then raise exception 'no continuation to cancel';end if;
 begin perform public.worker_cancel_document_folder_wait_v1('80000000-0000-4000-8000-000000000711',repeat('r',64)); raise exception 'a turn without the resume cancelled a wait';
 exception when insufficient_privilege then null; end;
 if not public.worker_cancel_document_folder_wait_v1(j,repeat('g',64)) then raise exception 'wait not cancelled';end if;
 select * into w from private.document_folder_reading_waits where work_id='30000000-0000-4000-8000-000000000711' and context='{"registry":[{"id":"h3","label":"H","groupLabel":"G"}]}';
 if w.consumed_at is null or w.cancelled_at is null then raise exception 'cancelled wait still open';end if;
 if public.worker_cancel_document_folder_wait_v1(j,repeat('g',64)) then raise exception 'wait cancelled twice';end if;
 -- A closed wait schedules nothing more.
 perform private.document_folder_reading_advance_v1('20000000-0000-4000-8000-000000000711');
 if (select count(*) from public.agent_messages where metadata->>'waitId'=w.id::text)<>1 then raise exception 'cancelled wait resumed again';end if;
 raise notice 'PASS: a wait the person cancelled closes as cancelled, without a card or another continuation';
end $$;

-- 4. The priors as the worker reads them: none yet; and every door refuses a forged capability.
do $$
begin
 if public.worker_document_folder_prior_v1('80000000-0000-4000-8000-000000000711',repeat('r',64))<>'{"prior":null}'::jsonb then raise exception 'folder prior invented';end if;
 if public.worker_board_material_priors_v1('80000000-0000-4000-8000-000000000711',repeat('r',64))<>'{"priors":[]}'::jsonb then raise exception 'board priors invented';end if;
 begin perform public.worker_document_folder_evidence_v1('80000000-0000-4000-8000-000000000711',repeat('x',64)); raise exception 'forged capability read the folder';
 exception when insufficient_privilege then null; end;
 begin perform public.worker_board_material_priors_v1('80000000-0000-4000-8000-000000000711',repeat('x',64)); raise exception 'forged capability read the board priors';
 exception when insufficient_privilege then null; end;
 raise notice 'PASS: priors read through the capability only';
end $$;

-- 5. Another account holding the token is refused.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000712","role":"authenticated","aal":"aal1"}', true);
do $$
begin
 begin perform public.worker_document_folder_evidence_v1('80000000-0000-4000-8000-000000000711',repeat('r',64)); raise exception 'another account read the folder';
 exception when insufficient_privilege then null; end;
 if private.worker_can_access_document_storage_v1('document-layers','20000000-0000-4000-8000-000000000711/layers/a.json',false) then raise exception 'another account reads the layer';end if;
 raise notice 'PASS: another account is refused';
end $$;

select 'lote4_document_folder_evidence_passed' as result;
rollback;