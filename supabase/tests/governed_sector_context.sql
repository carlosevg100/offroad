-- Synthetic rollback-only consent boundary regression. Legacy metadata setup uses the
-- shared fixture helper; the owner calls the real public approval RPC directly.
begin;
\ir support/execution_approval.sql

insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values ('10000000-0000-4000-8000-000000000901','authenticated','authenticated','approval-owner@example.invalid','{}','{}',now(),now(),false,false);
insert into public.organizations (id,organization_type,name,created_by)
values ('20000000-0000-4000-8000-000000000901','company','Synthetic approval tenant','10000000-0000-4000-8000-000000000901');
insert into public.organization_memberships (organization_id,user_id,role,status,joined_at)
values ('20000000-0000-4000-8000-000000000901','10000000-0000-4000-8000-000000000901','owner','active',now());
insert into public.document_intake_sessions (id,organization_id,started_by,journey,locale)
values ('40000000-0000-4000-8000-000000000901','20000000-0000-4000-8000-000000000901','10000000-0000-4000-8000-000000000901','company','pt-BR');
insert into public.source_documents (id,organization_id,intake_session_id,object_path,original_name,sha256,processing_status,created_by)
values ('50000000-0000-4000-8000-000000000901','20000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901','20000000-0000-4000-8000-000000000901/40000000-0000-4000-8000-000000000901/source.pdf','synthetic-source.pdf',repeat('a',64),'ready','10000000-0000-4000-8000-000000000901');
insert into public.intake_field_candidates (id,organization_id,intake_session_id,source_document_id,extractor_key,field_path,field_group,label,normalized_value,value_type,information_class,evidence_rank,source_anchor,confidence,extraction_method,created_by)
values ('51000000-0000-4000-8000-000000000901','20000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901','50000000-0000-4000-8000-000000000901','sector-fact','company.sector','company','Synthetic sector','"energy"','text','company_document',6,'{}',1,'user_entry','10000000-0000-4000-8000-000000000901');
insert into public.processing_runs (id,organization_id,intake_session_id,run_no,trigger,status,pipeline_version,created_by)
values ('70000000-0000-4000-8000-000000000901','20000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901',1,'manual','queued','approval-fixture-v1','10000000-0000-4000-8000-000000000901');
insert into public.processing_jobs (id,organization_id,intake_session_id,processing_run_id,kind,status,payload)
values ('80000000-0000-4000-8000-000000000901','20000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901','70000000-0000-4000-8000-000000000901','case_analysis','queued','{"analysis_scope":"full_case"}');

-- Synthetic extraction lineage, not customer data. Original source binding stays explicit.
update public.intake_field_candidates set processing_run_id='70000000-0000-4000-8000-000000000901',
 review_state='accepted',is_primary=true,reviewed_by='10000000-0000-4000-8000-000000000901',reviewed_at=now(),anchor_verified=true
where id='51000000-0000-4000-8000-000000000901';
insert into public.processing_jobs(id,organization_id,intake_session_id,processing_run_id,source_document_id,kind,status,payload)
values('81000000-0000-4000-8000-000000000901','20000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901','70000000-0000-4000-8000-000000000901','50000000-0000-4000-8000-000000000901','document_pipeline','succeeded',jsonb_build_object('document_version',1,'sha256',repeat('a',64)));
do $$
declare planner uuid; first_context jsonb; second_context jsonb;
begin
  select id into planner from public.processing_jobs where organization_id='20000000-0000-4000-8000-000000000901' and kind='execution_brief_proposal' and payload->>'approval_target_job_id'='80000000-0000-4000-8000-000000000901';
  if planner is null then raise exception 'real pending job did not create proposal job'; end if;
  update public.processing_jobs set status='leased',capability_sha256=extensions.digest(repeat('c',64),'sha256'),lease_expires_at=now()+interval '10 minutes',created_at='2026-01-31T23:30:00Z' where id=planner;
  first_context:=public.worker_load_execution_brief_proposal_v2(planner,repeat('c',64));
  perform set_config('TimeZone','Pacific/Auckland',true);
  second_context:=public.worker_load_execution_brief_proposal_v2(planner,repeat('c',64));
  if first_context#>>'{governed_sector_context_inputs,as_of}'<>'2026-01-31'
    or first_context->'governed_sector_context_inputs' is distinct from second_context->'governed_sector_context_inputs' then raise exception 'job knowledge date drifted with clock/timezone'; end if;
  perform set_config('TimeZone','UTC',true);
end;
$$;
select pg_temp.fixture_approve_execution('80000000-0000-4000-8000-000000000901');
do $$
declare projection jsonb; original_hash text; rejected boolean:=false;
begin
  if has_function_privilege('authenticated','private.governed_sector_context_inputs(uuid,uuid)','EXECUTE')
    or has_function_privilege('anon','private.governed_sector_context_inputs(uuid,uuid)','EXECUTE') then
    raise exception 'unscoped sector helper became client callable';
  end if;
  projection:=private.governed_sector_context_inputs('20000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901');
  if jsonb_array_length(projection->'candidates')<>1 or jsonb_array_length(projection->'sources')<>1
    or projection#>>'{candidates,0,extraction_document_version}'<>'1'
    or projection#>>'{candidates,0,extraction_source_sha256}'<>repeat('a',64)
    or projection#>>'{candidates,0,review_state}'<>'accepted' then raise exception 'sector projection lost source/review lineage'; end if;
  begin perform private.governed_sector_context_inputs('20000000-0000-4000-8000-000000000902','40000000-0000-4000-8000-000000000901');
  exception when no_data_found then rejected:=true; end;
  if not rejected then raise exception 'cross tenant sector projection accepted'; end if;
  if not private.execution_dispatch_is_current('80000000-0000-4000-8000-000000000901',true) then raise exception 'fixture did not establish real approval'; end if;
  original_hash:=private.execution_approval_input_fingerprint('20000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901');
  update public.processing_jobs set status='failed' where id='81000000-0000-4000-8000-000000000901';
  if original_hash<>private.execution_approval_input_fingerprint('20000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901') then raise exception 'operational job status invalidated planning context'; end if;
  update public.source_documents set scan_result='{"verdict":"infected"}' where id='50000000-0000-4000-8000-000000000901';
  if private.execution_dispatch_is_current('80000000-0000-4000-8000-000000000901',true) then raise exception 'quarantined source retained approval'; end if;
  update public.source_documents set scan_result=null where id='50000000-0000-4000-8000-000000000901';
  update public.processing_jobs set payload=jsonb_set(payload,'{sha256}',to_jsonb(repeat('b',64))) where id='81000000-0000-4000-8000-000000000901';
  if private.execution_dispatch_is_current('80000000-0000-4000-8000-000000000901',true) then raise exception 'changed original extraction hash retained approval'; end if;
  update public.processing_jobs set payload=jsonb_set(payload,'{sha256}',to_jsonb(repeat('a',64))) where id='81000000-0000-4000-8000-000000000901';
  update public.intake_field_candidates set review_state='rejected' where id='51000000-0000-4000-8000-000000000901';
  if private.execution_approval_input_fingerprint('20000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901')
    <>private.execution_approval_input_fingerprint_before_sector('20000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901') then raise exception 'empty sector context changed legacy hash'; end if;
  update public.intake_field_candidates set review_state='accepted' where id='51000000-0000-4000-8000-000000000901';
  update public.intake_field_candidates set normalized_value='"transport"' where id='51000000-0000-4000-8000-000000000901';
  if original_hash=private.execution_approval_input_fingerprint('20000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901')
    or private.execution_dispatch_is_current('80000000-0000-4000-8000-000000000901',true) then raise exception 'sector change retained exact approval'; end if;
  update public.intake_field_candidates set normalized_value='"energy"' where id='51000000-0000-4000-8000-000000000901';
  update public.source_documents set document_version=2 where id='50000000-0000-4000-8000-000000000901';
  projection:=private.governed_sector_context_inputs('20000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901');
  if projection#>>'{sources,0,document_version}'<>'2' or projection#>>'{candidates,0,extraction_document_version}'<>'1'
    or private.execution_dispatch_is_current('80000000-0000-4000-8000-000000000901',true) then raise exception 'source replacement lost staleness evidence'; end if;
  update public.processing_jobs set payload='{}' where id='81000000-0000-4000-8000-000000000901';
  projection:=private.governed_sector_context_inputs('20000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901');
  if projection#>>'{candidates,0,extraction_document_version}' is not null or projection#>>'{candidates,0,extraction_source_sha256}' is not null then raise exception 'missing original source identity inferred from current source'; end if;
  rejected:=false;
  begin
    insert into public.intake_field_candidates(organization_id,intake_session_id,source_document_id,extractor_key,field_path,field_group,label,normalized_value,value_type,information_class,evidence_rank,source_anchor,confidence,extraction_method,created_by,is_primary)
    select '20000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901','50000000-0000-4000-8000-000000000901','sector-limit-'||n,'company.sector','company','Synthetic excess','"energy"','text','company_document',6,'{}',1,'user_entry','10000000-0000-4000-8000-000000000901',false from generate_series(1,100) n;
    perform private.governed_sector_context_inputs('20000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901');
  exception when invalid_parameter_value then rejected:=true; end;
  if not rejected then raise exception 'excess context silently truncated or accepted'; end if;
  rejected:=false;
  begin perform public.worker_load_agent_context_v3('80000000-0000-4000-8000-000000000901',repeat('x',64));
  exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'agent reader accepted invalid capability'; end if;
  rejected:=false;
  begin perform public.worker_load_execution_brief_proposal_v2('80000000-0000-4000-8000-000000000901',repeat('x',64));
  exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'proposal reader accepted invalid capability'; end if;
end;
$$;
do $$
declare b public.capital_project_execution_briefs; planning jsonb:=jsonb_build_object('schemaVersion','sector-planning-context.v1','mode','planning_only','contextFingerprint',repeat('a',64),'planFingerprint',repeat('b',64),'objects','[]'::jsonb); rejected boolean; scenario integer;
begin
  select * into b from public.capital_project_execution_briefs where organization_id='20000000-0000-4000-8000-000000000901' order by brief_version desc limit 1;
  for scenario in 1..4 loop
    rejected:=false;
    begin
      insert into public.capital_project_execution_briefs(organization_id,capital_project_id,plan_id,brief_version,schema_version,brief_fingerprint,storage_fingerprint,execution_mode,objective,proposed_deliverable,workstream_count,internal_snapshot,visible_snapshot,created_by)
      values(b.organization_id,b.capital_project_id,b.plan_id,b.brief_version+1,b.schema_version,repeat('e',64),repeat('f',64),b.execution_mode,b.objective,b.proposed_deliverable,b.workstream_count,
        b.internal_snapshot||jsonb_build_object('planningContext',case when scenario=2 then planning||'{"mode":"execute"}'::jsonb when scenario=4 then jsonb_set(planning,'{objects}',(select jsonb_agg('{}'::jsonb) from generate_series(1,51))) else planning end),
        case when scenario=1 then b.visible_snapshot else b.visible_snapshot||jsonb_build_object('planningContext',case when scenario=2 then planning||'{"mode":"execute"}'::jsonb when scenario=4 then jsonb_set(planning,'{objects}',(select jsonb_agg('{}'::jsonb) from generate_series(1,51))) else planning end) end,b.created_by);
    exception when invalid_parameter_value then rejected:=true; end;
    if (scenario<>3 and not rejected) or (scenario=3 and rejected) then raise exception 'planning context visibility/mode guard failed scenario %',scenario; end if;
  end loop;
end;
$$;
rollback;
