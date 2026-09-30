-- Stage 20 / 3Q first slice. Transactional, synthetic and safe on staging.
begin;
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_persistent_work_fixture.sql
\ir support/provider_research_plan_snapshot.sql
\ir support/execution_approval.sql

do $$ declare name text; begin
 foreach name in array array['capital_public_input_snapshots','capital_public_deliveries','capital_public_delivery_licenses','capital_public_delivery_license_pins'] loop
  if to_regclass('private.'||name) is null then raise exception 'missing capture table %',name; end if;
  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid=to_regclass('private.'||name)) then
   raise exception 'capture table lacks forced RLS %',name; end if;
  if has_table_privilege('authenticated','private.'||name,'select') or has_table_privilege('authenticated','private.'||name,'insert')
   or has_table_privilege('authenticated','private.'||name,'update') or has_table_privilege('authenticated','private.'||name,'delete') then
   raise exception 'client table grant on %',name; end if;
 end loop;
 if exists(select 1 from information_schema.columns where table_schema='private'
  and table_name in ('capital_public_input_snapshots','capital_public_deliveries','capital_public_delivery_licenses','capital_public_delivery_license_pins')
  and column_name in ('context','payload','origin_refs','raw_body','content')) then
  raise exception 'capture foundation stores ungoverned bytes'; end if;
 if has_function_privilege('anon','public.worker_load_capital_project_capture_context_v1(uuid,text)','execute')
  or has_function_privilege('anon','public.worker_capture_capital_project_delivery_v1(uuid,text,uuid,text,jsonb,jsonb)','execute')
  or has_function_privilege('authenticated','private.capital_public_license_proof_v1(uuid,uuid,uuid,uuid,text,text,timestamptz,jsonb,text)','execute') then
  raise exception 'capture rpc or proof has an unauthorized grant'; end if;
end $$;

-- No fake worker or missing capability can manufacture a context or delivery row.
create temp table capture_test_counts(before_rows bigint);
insert into capture_test_counts select count(*) from private.capital_public_input_snapshots;
grant select on capture_test_counts to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ begin
 begin
  perform public.worker_load_capital_project_capture_context_v1(gen_random_uuid(),repeat('x',64));
  raise exception 'missing job accepted';
 exception when insufficient_privilege then null; end;
 begin
  perform public.worker_capture_capital_project_delivery_v1(gen_random_uuid(),repeat('x',64),gen_random_uuid(),'synthetic:missing-job','{}'::jsonb,'[]'::jsonb);
  raise exception 'missing delivery job accepted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
do $$ begin
 if (select count(*) from private.capital_public_input_snapshots)<>(select before_rows from pg_temp.capture_test_counts) then raise exception 'missing job wrote capture'; end if;
end $$;

-- A real authorized synthetic job proves identity replay and that no complete
-- receipt or payload bytes are fabricated by the metadata-only foundation.
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous) values
('10000000-0000-4000-8000-000000000981','authenticated','authenticated','capture-owner@example.invalid','{"provider":"email","providers":["email"]}','{}',now(),now(),false,false),
('10000000-0000-4000-8000-000000000982','authenticated','authenticated','capture-foreign@example.invalid','{"provider":"email","providers":["email"]}','{}',now(),now(),false,false),
('10000000-0000-4000-8000-000000000983','authenticated','authenticated','capture-publisher@example.invalid','{"provider":"email","providers":["email"]}','{}',now(),now(),false,false);
insert into public.organizations(id,organization_type,name,created_by) values
('20000000-0000-4000-8000-000000000981','originator','Synthetic capture A','10000000-0000-4000-8000-000000000981'),
('20000000-0000-4000-8000-000000000982','originator','Synthetic capture B','10000000-0000-4000-8000-000000000982');
insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values
('20000000-0000-4000-8000-000000000981','10000000-0000-4000-8000-000000000981','owner','active',now()),
('20000000-0000-4000-8000-000000000982','10000000-0000-4000-8000-000000000982','owner','active',now());
insert into public.onboarding_progress(organization_id,user_id,journey,current_step) values
('20000000-0000-4000-8000-000000000981','10000000-0000-4000-8000-000000000981','originator','organization');
insert into public.funds(id,organization_id,name,strategy,created_by) values
('40000000-0000-4000-8000-000000000981','20000000-0000-4000-8000-000000000981','Synthetic capture fund','credit','10000000-0000-4000-8000-000000000981');
insert into public.fund_directory(id,legal_name,kind,status,claimed_by_organization_id,claimed_at) values
('50000000-0000-4000-8000-000000000981','Synthetic capture directory','credit_fund','registered','20000000-0000-4000-8000-000000000981',now());
-- The publisher is a separate Offroad organization. Its right never becomes a
-- consumer-tenant source row by virtue of the consumer's membership.
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000983","role":"authenticated"}',true);
insert into public.organizations(id,organization_type,name,created_by) values
('20000000-0000-4000-8000-000000000983','offroad','Synthetic capture publisher','10000000-0000-4000-8000-000000000983');
insert into public.organization_memberships(organization_id,user_id,role,status) values
('20000000-0000-4000-8000-000000000983','10000000-0000-4000-8000-000000000983','owner','active');
insert into public.capital_projects(id,organization_id,project_name,created_by) values
('30000000-0000-4000-8000-000000000983','20000000-0000-4000-8000-000000000983','Synthetic capture source','10000000-0000-4000-8000-000000000983');
select set_config('request.headers','{"x-offroad-workspace":"20000000-0000-4000-8000-000000000983"}',true);
create temp table capture_public_license_fixture(source_version_id uuid,source_binding_id uuid,rights_version_id uuid,payload jsonb);
grant select on capture_public_license_fixture to authenticated;
do $$ declare v uuid:=gen_random_uuid(); b uuid; r uuid; sample jsonb; begin
 sample:='{"url":"https://example.invalid/capture-licensed","title":"Synthetic licensed source","snippet":"Licensed excerpt only","contentHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}'::jsonb;
 insert into public.sources(id,organization_id,origin_resource_id,origin_resource_reference,created_by)
 values(v,'20000000-0000-4000-8000-000000000983','30000000-0000-4000-8000-000000000983','30000000-0000-4000-8000-000000000983','10000000-0000-4000-8000-000000000983');
 insert into public.source_versions(id,organization_id,source_id,version_no,legacy_document_version,bucket_id,object_path,original_name,initial_verification_state,created_by)
 values(v,'20000000-0000-4000-8000-000000000983',v,1,1,'opportunity-documents','20000000-0000-4000-8000-000000000983/synthetic/'||v,'Synthetic excerpt','pending_verification','10000000-0000-4000-8000-000000000983');
 insert into public.source_bindings(organization_id,source_version_id,resource_id,resource_reference,request_id,created_by)
 values('20000000-0000-4000-8000-000000000983',v,'30000000-0000-4000-8000-000000000983','30000000-0000-4000-8000-000000000983',gen_random_uuid(),'10000000-0000-4000-8000-000000000983') returning id into b;
 r:=public.declare_public_source_reuse_v1(v,0,sample->>'url',private.public_source_payload_sha256_v1(sample),now()+interval '60 days',now()+interval '60 days',v,repeat('b',64));
 insert into pg_temp.capture_public_license_fixture values(v,b,r,sample);
end $$;
select set_config('request.jwt.claims','{}',true);
select set_config('request.headers','{}',true);
create temp table capture_job_fixture(job_id uuid, capability text, capture_id uuid);
grant all on capture_job_fixture to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000981","role":"authenticated"}',true);
do $$ declare plan jsonb:=pg_temp.provider_research_plan_fixture(); result jsonb; request uuid:=gen_random_uuid(); begin
 perform pg_temp.legacy_advisor_result(public.start_advisor_project_v1(request,'pt-BR','Synthetic capture',plan#>>'{job,id}',
  'Pesquise financiadores para a organização.','public_information',plan));
 result:=public.start_provider_research_project_v1(request,'pt-BR','Synthetic capture','Pesquise financiadores para a organização.',plan,null);
 insert into pg_temp.capture_job_fixture(job_id) values((result->>'research_job_id')::uuid);
end $$;
reset role;
insert into private.worker_tokens(label,token_sha256,execution_account_user_id) values
('synthetic-capture-worker',extensions.digest(repeat('z',64),'sha256'),'10000000-0000-4000-8000-000000000981');
do $$ declare job uuid; claim jsonb; begin
 select job_id into strict job from pg_temp.capture_job_fixture;
 perform pg_temp.fixture_approve_execution(job);
 update public.processing_jobs set available_at=now()-interval '1 day' where id=job;
 claim:=public.worker_claim_job_v3(repeat('z',64),600);
 if claim->>'job_id' is distinct from job::text then raise exception 'capture fixture claim mismatch'; end if;
 update pg_temp.capture_job_fixture set capability=claim->>'capability_token';
end $$;
-- A pre-existing identity with a different context hash cannot be relabelled as
-- the current context, on either the load path or the delivery/replay path.
do $$ declare f record; j public.processing_jobs; fake uuid; begin
 select * into strict f from pg_temp.capture_job_fixture;
 select * into strict j from public.processing_jobs where id=f.job_id;
 perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000981","role":"authenticated"}',true);
 begin
  insert into private.capital_public_input_snapshots(organization_id,work_id,job_id,session_id,plan_id,brief_id,human_subject_id,analysis_scope,context_fingerprint)
  values(j.organization_id,(j.payload->>'capital_project_id')::uuid,j.id,j.intake_session_id,(j.payload->>'capital_project_plan_id')::uuid,
   (j.payload->>'capital_project_brief_id')::uuid,j.authorization_subject_id,j.payload->>'analysis_scope',repeat('0',64)) returning id into fake;
  begin
   perform public.worker_load_capital_project_capture_context_v1(f.job_id,f.capability);
   raise exception 'changed context reused old capture fingerprint';
  exception when sqlstate '40001' then null; end;
  begin
   perform public.worker_capture_capital_project_delivery_v1(f.job_id,f.capability,fake,'synthetic:stale:1',
    '{"url":"https://example.com/stale","title":"Stale","contentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'::jsonb,
    '[{"kind":"published_public_payload"}]'::jsonb);
   raise exception 'changed context accepted a delivery';
  exception when sqlstate '40001' then null; end;
  raise exception 'fixture_rollback' using errcode='P3091';
 exception when sqlstate 'P3091' then null; end;
 perform set_config('request.jwt.claims','{}',true);
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000981","role":"authenticated"}',true);
do $$ declare f record; license record; first jsonb; second jsonb; delivery jsonb; replay jsonb; sample jsonb;
 licensed jsonb; licensed_replay jsonb; licensed_origin jsonb;
begin
 select * into strict f from pg_temp.capture_job_fixture;
 first:=public.worker_load_capital_project_capture_context_v1(f.job_id,f.capability);
 second:=public.worker_load_capital_project_capture_context_v1(f.job_id,f.capability);
 if first->'capture' is distinct from second->'capture' or first#>>'{capture,state}' is distinct from 'unresolved'
  or first->'context' is distinct from 'null'::jsonb then raise exception 'capture context falsely completed or replay changed'; end if;
 update pg_temp.capture_job_fixture set capture_id=(first#>>'{capture,id}')::uuid;
 sample:='{"url":"https://example.com/synthetic","title":"Synthetic source","snippet":"Not licensed for complete capture","contentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'::jsonb;
 delivery:=public.worker_capture_capital_project_delivery_v1(f.job_id,f.capability,(first#>>'{capture,id}')::uuid,'synthetic:source:1',sample,'[{"kind":"published_public_payload"}]'::jsonb);
 replay:=public.worker_capture_capital_project_delivery_v1(f.job_id,f.capability,(first#>>'{capture,id}')::uuid,'synthetic:source:1',sample,'[{"kind":"published_public_payload"}]'::jsonb);
 if delivery->>'state' is distinct from 'unresolved' or replay->>'state' is distinct from 'unresolved' or replay->>'replayed' is distinct from 'true'
  or replay->>'deliveryId' is distinct from delivery->>'deliveryId' then raise exception 'metadata delivery replay failed'; end if;
 begin
  perform public.worker_capture_capital_project_delivery_v1(f.job_id,f.capability,(first#>>'{capture,id}')::uuid,'synthetic:source:1',
   jsonb_set(sample,'{snippet}','"changed"'),'[{"kind":"published_public_payload"}]'::jsonb);
  raise exception 'changed delivery key accepted';
 exception when unique_violation then null; end;
 select * into strict license from pg_temp.capture_public_license_fixture;
 licensed_origin:=jsonb_build_array(jsonb_build_object('kind','published_public_payload',
  'licensingOrganizationId','20000000-0000-4000-8000-000000000983','sourceVersionId',license.source_version_id,
  'rightsVersionId',license.rights_version_id,'sourceBindingId',license.source_binding_id));
 licensed:=public.worker_capture_capital_project_delivery_v1(f.job_id,f.capability,(first#>>'{capture,id}')::uuid,
  'synthetic:licensed:1',license.payload,licensed_origin);
 licensed_replay:=public.worker_capture_capital_project_delivery_v1(f.job_id,f.capability,(first#>>'{capture,id}')::uuid,
  'synthetic:licensed:1',license.payload,licensed_origin);
 if licensed->>'state' is distinct from 'unresolved' or licensed#>>'{unresolvedReasons,0}' is distinct from 'retention_storage_not_resolved'
  or licensed_replay->>'deliveryId' is distinct from licensed->>'deliveryId' or licensed_replay->>'replayed' is distinct from 'true' then
  raise exception 'licensed metadata falsely completed or replay changed'; end if;
end $$;
reset role;
-- Possession of the capability by another account is insufficient.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000982","role":"authenticated"}',true);
do $$ declare f record; begin
 select * into strict f from pg_temp.capture_job_fixture;
 begin
  perform public.worker_load_capital_project_capture_context_v1(f.job_id,f.capability);
  raise exception 'foreign account used capture capability';
 exception when insufficient_privilege then null; end;
 begin
  perform public.worker_capture_capital_project_delivery_v1(f.job_id,f.capability,f.capture_id,'synthetic:foreign:1',
   '{"url":"https://example.com/foreign","title":"Foreign","contentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'::jsonb,
   '[{"kind":"published_public_payload"}]'::jsonb);
  raise exception 'foreign account used delivery capability';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Revocation of the human account reaches both the read and replay boundary.
update auth.users set banned_until=now()+interval '1 day' where id='10000000-0000-4000-8000-000000000981';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000981","role":"authenticated"}',true);
do $$ declare f record; begin
 select * into strict f from pg_temp.capture_job_fixture;
 begin
  perform public.worker_load_capital_project_capture_context_v1(f.job_id,f.capability);
  raise exception 'banned account loaded capture';
 exception when insufficient_privilege then null; end;
 begin
  perform public.worker_capture_capital_project_delivery_v1(f.job_id,f.capability,f.capture_id,'synthetic:source:1',
   '{"url":"https://example.com/synthetic","title":"Synthetic source","snippet":"Not licensed for complete capture","contentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'::jsonb,
   '[{"kind":"published_public_payload"}]'::jsonb);
  raise exception 'banned account replayed delivery';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
update auth.users set banned_until=null where id='10000000-0000-4000-8000-000000000981';
update private.worker_tokens set execution_account_user_id='10000000-0000-4000-8000-000000000982'
 where token_sha256=extensions.digest(repeat('z',64),'sha256');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000981","role":"authenticated"}',true);
do $$ declare f record; begin
 select * into strict f from pg_temp.capture_job_fixture;
 begin
  perform public.worker_load_capital_project_capture_context_v1(f.job_id,f.capability);
  raise exception 'reassociated worker token loaded capture';
 exception when insufficient_privilege then null; end;
 begin
  perform public.worker_capture_capital_project_delivery_v1(f.job_id,f.capability,f.capture_id,'synthetic:source:1',
   '{"url":"https://example.com/synthetic","title":"Synthetic source","snippet":"Not licensed for complete capture","contentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'::jsonb,
   '[{"kind":"published_public_payload"}]'::jsonb);
  raise exception 'reassociated worker token replayed delivery';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
update private.worker_tokens set execution_account_user_id='10000000-0000-4000-8000-000000000981'
 where token_sha256=extensions.digest(repeat('z',64),'sha256');
update public.processing_jobs set lease_expires_at=clock_timestamp()-interval '1 second'
 where id=(select job_id from pg_temp.capture_job_fixture);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000981","role":"authenticated"}',true);
do $$ declare f record; begin
 select * into strict f from pg_temp.capture_job_fixture;
 begin
  perform public.worker_load_capital_project_capture_context_v1(f.job_id,f.capability);
  raise exception 'expired lease loaded capture';
 exception when insufficient_privilege then null; end;
 begin
  perform public.worker_capture_capital_project_delivery_v1(f.job_id,f.capability,f.capture_id,'synthetic:source:1',
   '{"url":"https://example.com/synthetic","title":"Synthetic source","snippet":"Not licensed for complete capture","contentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'::jsonb,
   '[{"kind":"published_public_payload"}]'::jsonb);
  raise exception 'expired lease replayed delivery';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare f record; begin
 select * into strict f from pg_temp.capture_job_fixture;
 if (select state from private.capital_public_input_snapshots where id=f.capture_id) is distinct from 'unresolved' then raise exception 'capture state promoted'; end if;
 if exists(select 1 from private.capital_public_deliveries where capture_id=f.capture_id and state<>'unresolved') then raise exception 'delivery state promoted'; end if;
 if (select count(*) from private.capital_public_delivery_licenses l join private.capital_public_deliveries d on d.id=l.delivery_id
  where d.capture_id=f.capture_id)<>1 or not exists(select 1 from private.capital_public_delivery_license_pins p
  join private.capital_public_delivery_licenses l on l.id=p.license_id join private.capital_public_deliveries d on d.id=l.delivery_id
  where d.capture_id=f.capture_id and p.pin_role='delivery_latest') then
  raise exception 'exact publisher license bridge or source pin missing'; end if;
 if exists(select 1 from private.capital_public_delivery_licenses l join private.capital_public_deliveries d on d.id=l.delivery_id
  where d.capture_id=f.capture_id and d.unresolved_reasons<>array['retention_storage_not_resolved']::text[]) then
  raise exception 'license binding marked complete before retention'; end if;
end $$;

select 'capital_public_capture_foundation' as test,'PASS' as result;
rollback;
