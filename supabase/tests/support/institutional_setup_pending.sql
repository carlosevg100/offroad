-- Synthetic institutional setup through an approved queued result. Caller owns transaction.
\ir source_rights_fixture.sql
\ir legacy_workspace_capabilities.sql
\ir execution_approval.sql
-- Rollback-only privileged fixture helper; production hash function grants stay private.
create function pg_temp.fixture_institutional_hash(value jsonb) returns text language sql security definer set search_path='' as $$select private.institutional_config_hash(value);$$;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values
  ('10000000-0000-4000-8000-000000000881', 'authenticated', 'authenticated',
   'setup-owner@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false),
  ('10000000-0000-4000-8000-000000000882', 'authenticated', 'authenticated',
   'setup-worker@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false);

insert into public.organizations (id, organization_type, name, created_by) values (
  '20000000-0000-4000-8000-000000000881', 'originator', 'Binding Tenant',
  '10000000-0000-4000-8000-000000000881'
);
insert into public.organization_memberships (organization_id, user_id, role, status, joined_at) values (
  '20000000-0000-4000-8000-000000000881', '10000000-0000-4000-8000-000000000881',
  'owner', 'active', now()
);
insert into public.capital_projects (id, organization_id, project_name, entry_job, created_by) values (
  '30000000-0000-4000-8000-000000000881', '20000000-0000-4000-8000-000000000881',
  'Institutional Configuration Test', 'capital_planning', '10000000-0000-4000-8000-000000000881'
);
insert into public.document_intake_sessions (
  id, organization_id, capital_project_id, started_by, journey, locale
) values (
  '40000000-0000-4000-8000-000000000881', '20000000-0000-4000-8000-000000000881',
  '30000000-0000-4000-8000-000000000881', '10000000-0000-4000-8000-000000000881',
  'company', 'pt-BR'
);
insert into public.processing_runs (
  id, organization_id, intake_session_id, run_no, trigger, status, pipeline_version, created_by
) values (
  '70000000-0000-4000-8000-000000000881', '20000000-0000-4000-8000-000000000881',
  '40000000-0000-4000-8000-000000000881', 1, 'manual', 'running', 'binding-test-v1',
  '10000000-0000-4000-8000-000000000881'
);
\ir institutional_setup_fixture.sql
insert into public.source_documents(id,organization_id,intake_session_id,object_path,original_name,sha256,sha256_verified_at,scan_result,processing_status,created_by)
values('50000000-0000-4000-8000-000000000881','20000000-0000-4000-8000-000000000881','40000000-0000-4000-8000-000000000881','20000000-0000-4000-8000-000000000881/40000000-0000-4000-8000-000000000881/accounts.xlsx','Synthetic accounts.xlsx',repeat('a',64),now(),' {"verdict":"clean"}','ready','10000000-0000-4000-8000-000000000881');
-- A delivered source with no selected field: capture must still inherit its rights.
insert into public.source_documents(id,organization_id,intake_session_id,object_path,original_name,sha256,sha256_verified_at,scan_result,processing_status,created_by)
values('50000000-0000-4000-8000-000000000882','20000000-0000-4000-8000-000000000881','40000000-0000-4000-8000-000000000881','20000000-0000-4000-8000-000000000881/40000000-0000-4000-8000-000000000881/uncited.txt','Synthetic uncited input.txt',repeat('d',64),now(),'{"verdict":"clean"}','ready','10000000-0000-4000-8000-000000000881');
insert into public.processing_jobs(id,organization_id,processing_run_id,intake_session_id,source_document_id,kind,status,payload)
values('80000000-0000-4000-8000-000000000881','20000000-0000-4000-8000-000000000881','70000000-0000-4000-8000-000000000881','40000000-0000-4000-8000-000000000881','50000000-0000-4000-8000-000000000881','document_pipeline','succeeded',jsonb_build_object('sha256',repeat('a',64),'document_version',1));
insert into public.intake_field_candidates(organization_id,intake_session_id,source_document_id,processing_run_id,extractor_key,field_path,field_group,label,normalized_value,value_type,information_class,evidence_rank,source_anchor,confidence,anchor_verified,period_start,period_end,entity_name,entity_scope,review_state,reviewed_by,reviewed_at,currency,unit,value_scale,extraction_method,created_by)
select '20000000-0000-4000-8000-000000000881','40000000-0000-4000-8000-000000000881','50000000-0000-4000-8000-000000000881','70000000-0000-4000-8000-000000000881',f#>>'{key,fieldPath}',f#>>'{key,fieldPath}','historical_financials',f#>>'{key,fieldPath}',(f->>'value')::jsonb,'number','audited',1,f#>'{accepted,anchor}',1,true,(f#>>'{accepted,periodStart}')::date,(f#>>'{accepted,periodEnd}')::date,f#>>'{accepted,entityName}',f#>>'{accepted,entityScope}','accepted','10000000-0000-4000-8000-000000000881',now(),'BRL','currency',1,'user_entry','10000000-0000-4000-8000-000000000881'
from jsonb_array_elements(current_setting('test.setup_facts')::jsonb) f;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000881","role":"authenticated"}',true);
set local role authenticated;
select set_config('test.setup_context',public.read_institutional_model_setup_v1('30000000-0000-4000-8000-000000000881')::text,true);
do $$declare result jsonb;accepted boolean:=false;begin
 if jsonb_array_length(current_setting('test.setup_context')::jsonb->'candidates')<>15 then raise exception 'Current anchored facts unavailable';end if;
 begin perform public.submit_institutional_model_setup_v1('30000000-0000-4000-8000-000000000881',repeat('f',64),current_setting('test.setup_configuration')::jsonb,current_setting('test.setup_sources')::jsonb,'90000000-0000-4000-8000-000000000881','en-US');accepted:=true;exception when serialization_failure then null;end;
 if accepted then raise exception 'Stale source manifest accepted';end if;
 result:=public.submit_institutional_model_setup_v1('30000000-0000-4000-8000-000000000881',current_setting('test.setup_context')::jsonb->>'sourceManifestFingerprint',current_setting('test.setup_configuration')::jsonb,current_setting('test.setup_sources')::jsonb,'90000000-0000-4000-8000-000000000881','en-US');
 if result->>'status'<>'queued' then raise exception 'Setup not queued';end if;
 result:=public.submit_institutional_model_setup_v1('30000000-0000-4000-8000-000000000881',current_setting('test.setup_context')::jsonb->>'sourceManifestFingerprint',current_setting('test.setup_configuration')::jsonb,current_setting('test.setup_sources')::jsonb,'90000000-0000-4000-8000-000000000881','en-US');
 if result->>'replayed'<>'true' then raise exception 'Setup replay duplicated';end if;
end $$;
reset role;
-- Lease the real queued deterministic job; no approval guard or financial validator is disabled.
update public.processing_jobs set status='leased',attempts=1,lease_expires_at=now()+interval '10 minutes',capability_sha256=extensions.digest(repeat('w',64),'sha256') where kind='agent_operation_brief' and payload->>'message_id'='90000000-0000-4000-8000-000000000881';
select set_config('test.setup_job',(select id::text from public.processing_jobs where kind='agent_operation_brief' and payload->>'message_id'='90000000-0000-4000-8000-000000000881'),true);
-- Match server-attested submission timestamps without changing fixture economics or source lineage.
do $$declare s private.institutional_model_setup_submissions;c jsonb;conf jsonb;assumptions jsonb;overrides jsonb;begin
 select * into strict s from private.institutional_model_setup_submissions where id='90000000-0000-4000-8000-000000000881';
 select jsonb_agg(value||jsonb_build_object('sourceType','offroad_scenario','confidence','low','evidence','[]'::jsonb) order by ord),jsonb_agg(jsonb_build_object('assumptionId',value->>'id','values',value->'values','rationale',value->>'rationale','requestedBy',s.submitted_by,'createdAt',s.submitted_at) order by ord) into assumptions,overrides from jsonb_array_elements(s.configuration#>'{assumptionBook,assumptions}') with ordinality a(value,ord);
 conf:=jsonb_set(jsonb_set(s.configuration,'{assumptionBook,assumptions}',assumptions),'{assumptionBook,overrides}',overrides,true);
 c:=current_setting('test.setup_candidate')::jsonb||jsonb_build_object('configuration',conf,'configurationFingerprint',pg_temp.fixture_institutional_hash(conf),'sourceBindings',s.source_reviews,'submission',jsonb_build_object('id',s.id,'actorId',s.submitted_by,'submittedAt',s.submitted_at));
 perform set_config('test.setup_candidate',c::text,true);
end $$;
