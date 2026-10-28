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
 raise notice 'PASS: folder evidence reads the work, its registry, open works and vault';
end $$;

-- 2. The storage gate: the job reads the layer of its own work, never writes it, never reads another work's.
do $$
begin
 if not private.worker_can_access_document_storage_v1('document-layers','20000000-0000-4000-8000-000000000711/layers/a.json',false) then raise exception 'own layer not readable';end if;
 if private.worker_can_access_document_storage_v1('document-layers','20000000-0000-4000-8000-000000000711/layers/a.json',true) then raise exception 'own layer writable';end if;
 if private.worker_can_access_document_storage_v1('document-layers','20000000-0000-4000-8000-000000000711/layers/d.json',false) then raise exception 'another work layer readable';end if;
 if private.worker_can_access_document_storage_v1('opportunity-documents','20000000-0000-4000-8000-000000000711/40000000-0000-4000-8000-000000000711/a.pdf',false) then raise exception 'original document readable';end if;
 raise notice 'PASS: storage gate reads only the own work layers';
end $$;

-- 3. The priors as the worker reads them: none yet; and every door refuses a forged capability.
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

-- 4. Another account holding the token is refused.
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