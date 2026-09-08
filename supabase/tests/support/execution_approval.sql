-- Test-only setup, included inside each suite's rollback transaction. These pg_temp
-- functions never ship as migrations. They seed bounded synthetic metadata, then use
-- the production binding and public approval RPC with the actual session owner's JWT.
-- No production guard, policy, capability check or accepted event is bypassed.
create or replace function pg_temp.fixture_execution_plan(p_session_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.document_intake_sessions; p public.capital_projects; plan_id uuid; targets text[];
begin
  select * into strict s from public.document_intake_sessions where id=p_session_id;
  select * into strict p from public.capital_projects where id=s.capital_project_id;
  select id into plan_id from public.capital_project_plans
    where organization_id=s.organization_id and capital_project_id=p.id and status='active';
  if plan_id is not null then return plan_id; end if;
  targets:=case p.entry_job
    when 'company_debt_view' then array['C11']
    when 'origination_thesis' then array['M07','S11','K04']
    when 'capital_planning' then array['S11']
    when 'structure_from_documents' then array['S11']
    when 'review_existing_operation' then array['S10','S12']
    when 'prepare_materials_and_process' then array['A11','K09'] end;
  plan_id:=gen_random_uuid();
  insert into public.capital_project_plans (
    id,organization_id,capital_project_id,plan_version,entry_job,schema_version,
    compiler_version,registry_version,plan_fingerprint,status,confirmation_gate,
    first_work_product,target_task_ids,input_policy,parallel_batches,task_count,snapshot,created_by
  ) values (
    plan_id,s.organization_id,p.id,
    (select coalesce(max(plan_version),0)+1 from public.capital_project_plans where capital_project_id=p.id),
    p.entry_job,'capital-project-plan.v1','approval-fixture-v1','approval-fixture-v1',
    encode(extensions.digest(plan_id::text,'sha256'),'hex'),'active','structure',
    'fixture_contract_result',targets,'{"synthetic":true}',
    jsonb_build_array(to_jsonb(targets)),cardinality(targets),
    jsonb_build_object('synthetic',true,'purpose','Bounded persistence contract fixture, not a compiled production workflow','targetTaskIds',targets),s.started_by
  );
  insert into public.capital_project_plan_tasks (
    organization_id,capital_project_id,plan_id,task_id,ordinal,batch_no,label,graph,
    dependencies,execution_class,effect,maturity_at_compile
  ) select s.organization_id,p.id,plan_id,targets[n],n-1,0,
    'Contrato sintético de persistência '||targets[n],
    'case','{}'::text[],
    'compilation','propose_state','specified' from generate_series(1,cardinality(targets)) n;
  return plan_id;
end;
$$;

create or replace function pg_temp.fixture_approve_execution(p_job_id uuid,p_restore_seeded_lease boolean default false,p_approve boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
declare
  j public.processing_jobs; s public.document_intake_sessions; fixture_plan_id uuid;
  brief_id uuid:=gen_random_uuid(); existing_brief uuid; fingerprint text; streams jsonb; task_ids jsonb;
  previous_claims text:=current_setting('request.jwt.claims',true);
begin
  select * into strict j from public.processing_jobs where id=p_job_id;
  if j.status<>'awaiting_approval' then raise exception 'fixture expected held execution job: %',j.status; end if;
  select * into strict s from public.document_intake_sessions where id=j.intake_session_id;
  select execution_brief_id into existing_brief from public.capital_project_execution_brief_dispatches where processing_job_id=j.id;
  if existing_brief is not null then
    brief_id:=existing_brief;
    select brief_fingerprint into strict fingerprint from public.capital_project_execution_briefs where id=brief_id;
  else
  fixture_plan_id:=case when j.kind='capital_project_analysis' then (j.payload->>'capital_project_plan_id')::uuid
    else pg_temp.fixture_execution_plan(s.id) end;
  if not exists(select 1 from public.capital_project_plans where id=fixture_plan_id and capital_project_id=s.capital_project_id and status='active') then
    raise exception 'fixture requires actual active dispatch plan';
  end if;
  select coalesce(jsonb_agg(task_id order by ordinal),'[]'::jsonb) into task_ids
    from public.capital_project_plan_tasks where organization_id=j.organization_id and capital_project_plan_tasks.plan_id=fixture_plan_id;
  fingerprint:=encode(extensions.digest(brief_id::text,'sha256'),'hex');
  streams:=jsonb_build_array(
    jsonb_build_object('key','scope','label','Fixar escopo sintético','purpose','Delimitar o contrato em teste','sourceTaskIds',task_ids,'sources',jsonb_build_array(),'analyses',jsonb_build_array(),'output','Escopo','dependencies',jsonb_build_array()),
    jsonb_build_object('key','evidence','label','Revisar fontes sintéticas','purpose','Preservar dados da fixture','sourceTaskIds',jsonb_build_array(),'sources',jsonb_build_array(),'analyses',jsonb_build_array(),'output','Fontes','dependencies',jsonb_build_array('scope')),
    jsonb_build_object('key','delivery','label','Preparar entrega sintética','purpose','Executar o contrato isolado','sourceTaskIds',jsonb_build_array(),'sources',jsonb_build_array(),'analyses',jsonb_build_array(),'output','Resultado','dependencies',jsonb_build_array('evidence'))
  );
  insert into public.capital_project_execution_briefs (
    id,organization_id,capital_project_id,plan_id,brief_version,schema_version,
    brief_fingerprint,storage_fingerprint,execution_mode,objective,proposed_deliverable,
    workstream_count,internal_snapshot,visible_snapshot,created_by
  ) values (
    brief_id,j.organization_id,s.capital_project_id,fixture_plan_id,
    (select coalesce(max(brief_version),0)+1 from public.capital_project_execution_briefs where capital_project_id=s.capital_project_id),
    'execution-brief.v1',fingerprint,fingerprint,'confirm_before_expensive_work',
    'Validar contrato com dados sintéticos','Resultado do contrato isolado',3,
    jsonb_build_object('schemaVersion','execution-brief.v1','fingerprint',fingerprint,'synthetic',true,'workstreams',streams),
    jsonb_build_object('schemaVersion','execution-brief.v1','fingerprint',fingerprint,'synthetic',true,'objective','Validar contrato com dados sintéticos','proposedDeliverable','Resultado do contrato isolado','workstreams',streams,'executionMode','confirm_before_expensive_work'),s.started_by
  );
  perform private.bind_execution_brief_dispatch(brief_id,j.id);
  end if;
  if not p_approve then return; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',s.started_by,'role','authenticated','aal','aal1')::text,true);
  perform public.approve_advisor_execution_brief_v1(s.capital_project_id,brief_id,fingerprint,gen_random_uuid());
  perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);
  if not private.execution_dispatch_is_current(j.id,true) then raise exception 'fixture approval did not authorize exact dispatch'; end if;
  -- Preserve each legacy suite's explicit queue ordering after the real approval
  -- sets available_at=now(). Identity, payload and authorization remain unchanged.
  update public.processing_jobs set available_at=j.available_at where id=j.id;
  if p_restore_seeded_lease then
    if j.capability_sha256 is null or j.lease_expires_at<=now() then raise exception 'fixture seeded lease is invalid'; end if;
    update public.processing_jobs set status='leased' where id=j.id;
  end if;
end;
$$;

create or replace function pg_temp.fixture_approve_pending_executions()
returns void language plpgsql security definer set search_path = '' as $$
declare pending record;
begin
  if exists (
    select s.capital_project_id from public.processing_jobs j
    join public.document_intake_sessions s on s.organization_id=j.organization_id and s.id=j.intake_session_id
    where j.kind in ('capital_project_analysis','case_analysis') and j.status='awaiting_approval'
    group by s.capital_project_id having count(*)>1
  ) then raise exception 'fixture must select an exact dispatch when a project has multiple pending jobs'; end if;
  for pending in select id from public.processing_jobs
    where kind in ('capital_project_analysis','case_analysis') and status='awaiting_approval'
    order by created_at,id
  loop
    perform pg_temp.fixture_approve_execution(pending.id);
  end loop;
end;
$$;
