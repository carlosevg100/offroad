-- Synthetic persistence/authorization proof only. No provider calls; all writes roll back.
begin;
\ir support/execution_approval.sql
\ir support/documentary_plan_snapshots.sql
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous) values
('10000000-0000-4000-8000-000000000981','authenticated','authenticated','revision-a@example.invalid','{}','{}',now(),now(),false,false),
('10000000-0000-4000-8000-000000000982','authenticated','authenticated','revision-b@example.invalid','{}','{}',now(),now(),false,false);
insert into public.organizations(id,organization_type,name,created_by,pipeline_enabled) values
('20000000-0000-4000-8000-000000000981','company','Synthetic revision A','10000000-0000-4000-8000-000000000981',true),
('20000000-0000-4000-8000-000000000982','company','Synthetic revision B','10000000-0000-4000-8000-000000000982',false);
insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values
('20000000-0000-4000-8000-000000000981','10000000-0000-4000-8000-000000000981','owner','active',now()),
('20000000-0000-4000-8000-000000000982','10000000-0000-4000-8000-000000000982','owner','active',now());
create temporary table revision_cases(entry text,project_id uuid,session_id uuid,brief_id uuid,fingerprint text,command_id uuid,old_plan uuid);
grant select on revision_cases to authenticated;
do $$
declare entry text; project uuid; session uuid; run uuid; job uuid; brief public.capital_project_execution_briefs;
begin
  foreach entry in array array['company_debt_view','origination_thesis','capital_planning','structure_from_documents','review_existing_operation','prepare_materials_and_process'] loop
    project:=gen_random_uuid(); session:=gen_random_uuid(); run:=gen_random_uuid(); job:=gen_random_uuid();
    if not private.is_released_documentary_plan_v1(pg_temp.documentary_plan_fixture(entry),entry) then raise exception 'missing exact entry contract: %',entry; end if;
    insert into public.capital_projects(id,organization_id,project_name,entry_job,access_basis,created_by)
      values(project,'20000000-0000-4000-8000-000000000981','Synthetic revision '||entry,entry,'authorized_private','10000000-0000-4000-8000-000000000981');
    insert into public.document_intake_sessions(id,organization_id,capital_project_id,started_by,journey,locale,status,pipeline_version)
      values(session,'20000000-0000-4000-8000-000000000981',project,'10000000-0000-4000-8000-000000000981','company','pt-BR','review_ready','f2-2026.08.24');
    insert into public.agent_conversations(organization_id,intake_session_id,state,created_by)
      values('20000000-0000-4000-8000-000000000981',session,'idle','10000000-0000-4000-8000-000000000981');
    insert into public.source_documents(organization_id,intake_session_id,object_path,original_name,sha256,processing_status,created_by)
      values('20000000-0000-4000-8000-000000000981',session,'20000000-0000-4000-8000-000000000981/'||session::text||'/synthetic.csv','synthetic.csv',repeat('a',64),'ready','10000000-0000-4000-8000-000000000981');
    insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,status,pipeline_version,created_by)
      values(run,'20000000-0000-4000-8000-000000000981',session,1,'manual','queued','f2-2026.08.24','10000000-0000-4000-8000-000000000981');
    update public.document_intake_sessions set current_run_id=run where id=session;
    insert into public.preliminary_understandings(organization_id,intake_session_id,processing_run_id,object_version,status,input_fingerprint,object_fingerprint,payload,decided_by,decided_at)
      values('20000000-0000-4000-8000-000000000981',session,run,1,'confirmed',repeat('b',64),repeat('c',64),'{}','10000000-0000-4000-8000-000000000981',now());
    insert into public.processing_jobs(id,organization_id,intake_session_id,processing_run_id,kind,status,payload)
      values(job,'20000000-0000-4000-8000-000000000981',session,run,'case_analysis','queued','{"analysis_scope":"full_case"}');
    perform pg_temp.fixture_approve_execution(job);
    select b.* into brief from public.capital_project_execution_briefs b where b.capital_project_id=project order by b.brief_version desc limit 1;
    insert into revision_cases values(entry,project,session,brief.id,brief.brief_fingerprint,gen_random_uuid(),brief.plan_id);
    update public.processing_jobs set status='cancelled' where intake_session_id=session and status in ('queued','awaiting_approval');
    update public.document_intake_sessions set status='review_ready' where id=session;
  end loop;
end $$;
-- All six entry shortcuts retain the same documentary private-access boundary, including
-- entries that ordinarily allow public company research. Both canonical writers reject it.
do $$ declare entry text; project uuid; begin
  perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000981","role":"authenticated"}',true);
  foreach entry in array array['company_debt_view','origination_thesis','capital_planning','structure_from_documents','review_existing_operation','prepare_materials_and_process'] loop
    project:=gen_random_uuid();
    insert into public.capital_projects(id,organization_id,project_name,entry_job,access_basis,created_by)
      values(project,'20000000-0000-4000-8000-000000000981','Synthetic public admission '||entry,entry,'public_information','10000000-0000-4000-8000-000000000981');
    begin
      perform private.record_capital_project_plan(project,pg_temp.documentary_plan_fixture(entry));
      raise exception 'documentary graph admitted public evidence authority';
    exception when insufficient_privilege then null; end;
    begin
      perform private.record_execution_proposal_plan_as_actor(project,pg_temp.documentary_plan_fixture(entry),'10000000-0000-4000-8000-000000000981');
      raise exception 'documentary actor graph admitted public evidence authority';
    exception when insufficient_privilege then null; end;
    if exists(select 1 from public.capital_project_plans where capital_project_id=project) then raise exception 'denied admission left partial plan'; end if;
    if entry='company_debt_view' then
      perform private.record_capital_project_plan(project,private.provider_research_plan_v1());
      if not exists(select 1 from public.capital_project_plans where capital_project_id=project and status='active') then
        raise exception 'documentary guard blocked public provider research';
      end if;
    end if;
  end loop;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000981","role":"authenticated","aal":"aal1"}',true);
do $$
declare c record; result jsonb; replay jsonb;
begin
  for c in select * from revision_cases loop
    begin
      perform public.request_documentary_work_revision_v1(c.project_id,c.brief_id,repeat('f',64),gen_random_uuid(),'pt-BR','Compare estas propostas.',pg_temp.documentary_plan_fixture(c.entry));
      raise exception 'stale revision accepted';
    exception when serialization_failure then null; end;
    begin
      perform public.request_documentary_work_revision_v1(c.project_id,c.brief_id,c.fingerprint,gen_random_uuid(),'pt-BR','Compare estas propostas.',jsonb_set(pg_temp.documentary_plan_fixture(c.entry),'{taskSpecs,0,effect}','"commit"'));
      raise exception 'tampered graph accepted';
    exception when insufficient_privilege then null; end;
    result:=public.request_documentary_work_revision_v1(c.project_id,c.brief_id,c.fingerprint,c.command_id,'pt-BR','Compare estas propostas.',pg_temp.documentary_plan_fixture(c.entry));
    begin
      perform public.request_documentary_work_revision_v1(c.project_id,c.brief_id,c.fingerprint,gen_random_uuid(),'pt-BR','Prepare a reunião.',pg_temp.documentary_plan_fixture(c.entry));
      raise exception 'overlapping revision accepted';
    exception when object_not_in_prerequisite_state then null; end;
    replay:=public.request_documentary_work_revision_v1(c.project_id,c.brief_id,c.fingerprint,c.command_id,'pt-BR','Compare estas propostas.',pg_temp.documentary_plan_fixture(c.entry));
    if replay->>'replayed'<>'true' or replay->>'processing_run_id' is distinct from result->>'processing_run_id' then raise exception 'revision duplicated work'; end if;
    begin
      perform public.request_documentary_work_revision_v1(c.project_id,c.brief_id,c.fingerprint,c.command_id,'en-US','Compare estas propostas.',pg_temp.documentary_plan_fixture(c.entry));
      raise exception 'replay changed locale';
    exception when unique_violation then null; end;
  end loop;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000982","role":"authenticated","aal":"aal1"}',true);
do $$ declare c record; begin
  select * into c from revision_cases limit 1;
  begin
    perform public.request_documentary_work_revision_v1(c.project_id,c.brief_id,c.fingerprint,c.command_id,'pt-BR','Compare estas propostas.',pg_temp.documentary_plan_fixture(c.entry));
    raise exception 'revision crossed tenant';
  exception when no_data_found then null; end;
end $$;
reset role;
do $$ declare c record; target uuid; planner uuid; token text:=repeat('r',64); context jsonb; begin
  for c in select * from revision_cases loop
    if (select count(*) from public.capital_project_plans where capital_project_id=c.project_id)<>2
      or (select status from public.capital_project_plans where id=c.old_plan)<>'superseded'
      or not exists(select 1 from public.capital_project_execution_brief_events where execution_brief_id=c.brief_id and event_type='accepted')
      or (select count(*) from public.source_documents where intake_session_id=c.session_id)<>1 then
      raise exception 'revision lost history or duplicated sources';
    end if;
    select j.id into target from public.processing_jobs j join public.document_intake_sessions s on s.current_run_id=j.processing_run_id
      where s.id=c.session_id and j.kind='case_analysis';
    if (select status from public.processing_jobs where id=target)<>'awaiting_approval'
      or exists(select 1 from public.capital_project_execution_brief_dispatches where processing_job_id=target and accepted_at is not null)
      or exists(select 1 from public.processing_jobs j join public.document_intake_sessions s on s.current_run_id=j.processing_run_id where s.id=c.session_id and j.kind='document_pipeline') then
      raise exception 'revision executed without fresh consent or reparsed ready documents';
    end if;
    select id into planner from public.processing_jobs where kind='execution_brief_proposal' and payload->>'approval_target_job_id'=target::text;
    if planner is null then raise exception 'new approval proposal missing'; end if;
    update public.processing_jobs set status='leased',attempts=1,lease_expires_at=now()+interval '10 minutes',capability_sha256=extensions.digest(token,'sha256') where id=planner;
    context:=private.worker_load_execution_brief_proposal_v3(planner,token);
    if context#>>'{initial_work_request,text}'<>'Compare estas propostas.' or context#>>'{initial_work_request,message_id}'<>c.command_id::text
      or context->'plan' is distinct from pg_temp.documentary_plan_fixture(c.entry) then
      raise exception 'new work objective not bound to existing source project';
    end if;
  end loop;
  -- A lost response may be retried after a newer brief exists. The old command must replay,
  -- not submit again and not reject merely because its predecessor is no longer latest.
  for c in select * from revision_cases loop
    insert into public.capital_project_execution_briefs(organization_id,capital_project_id,plan_id,brief_version,schema_version,
      brief_fingerprint,storage_fingerprint,execution_mode,objective,proposed_deliverable,workstream_count,internal_snapshot,visible_snapshot,created_by)
      select organization_id,capital_project_id,plan_id,brief_version+1,schema_version,
        repeat('e',64),repeat('e',64),execution_mode,objective,proposed_deliverable,workstream_count,internal_snapshot,visible_snapshot,created_by
      from public.capital_project_execution_briefs where id=c.brief_id;
    perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000981","role":"authenticated","aal":"aal1"}',true);
    context:=public.request_documentary_work_revision_v1(c.project_id,c.brief_id,c.fingerprint,c.command_id,'pt-BR','Compare estas propostas.',pg_temp.documentary_plan_fixture(c.entry));
    if context->>'replayed'<>'true' then raise exception 'retry after successor did not replay'; end if;
    update public.processing_jobs set status='cancelled' where intake_session_id=c.session_id and status in ('queued','leased','awaiting_approval');
    update public.document_intake_sessions set status='review_ready' where id=c.session_id;
    -- Simulate an explicitly selected financial graph between two documentary requests.
    update public.capital_project_plans set status='superseded' where capital_project_id=c.project_id and status='active';
    update public.capital_project_plans set status='active' where id=c.old_plan;
    select id into planner from public.capital_project_execution_briefs where capital_project_id=c.project_id order by brief_version desc limit 1;
    context:=public.request_documentary_work_revision_v1(c.project_id,planner,repeat('e',64),gen_random_uuid(),'pt-BR','Prepare a reunião.',pg_temp.documentary_plan_fixture(c.entry));
    if (select count(*) from public.capital_project_plans where capital_project_id=c.project_id)<>2
      or (select snapshot from public.capital_project_plans where capital_project_id=c.project_id and status='active') is distinct from pg_temp.documentary_plan_fixture(c.entry) then
      raise exception 'historical documentary graph could not be explicitly resumed';
    end if;
  end loop;
  if has_function_privilege('anon','public.request_documentary_work_revision_v1(uuid,uuid,text,uuid,text,text,jsonb)','execute') then raise exception 'anon may revise work'; end if;
end $$;
rollback;
