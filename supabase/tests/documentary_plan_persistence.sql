-- Real compiler snapshots; every synthetic fixture and write rolls back.
begin;
\ir support/documentary_plan_snapshots.sql
create function pg_temp.documentary_plan_with_versions(p jsonb, registry text, method text) returns jsonb
language sql immutable set search_path='' as $versions$
  select jsonb_set(jsonb_set(p,'{registryVersion}',to_jsonb(registry)), '{taskSpecs}',
    (select jsonb_agg(jsonb_set(value,'{procedure,version}',to_jsonb(method)) order by ordinal)
      from jsonb_array_elements(p->'taskSpecs') with ordinality as t(value,ordinal)));
$versions$;
do $$
declare entry text; current_plan jsonb; prior_plan jsonb;
begin
  foreach entry in array array['structure_from_documents','review_existing_operation'] loop
    current_plan := pg_temp.documentary_plan_fixture(entry);
    prior_plan := pg_temp.documentary_plan_with_versions(current_plan,'2026.09.09-v9','2026.09.09-v6');
    if not private.is_released_documentary_plan_v1(current_plan,entry)
      or not private.is_released_documentary_plan_v1(prior_plan,entry)
      or not private.is_released_documentary_plan_v1(pg_temp.documentary_plan_with_versions(current_plan,'2026.09.09-v10','2026.09.09-v7'),entry)
      or not private.is_released_documentary_plan_v1(pg_temp.documentary_plan_with_versions(current_plan,'2026.09.09-v11','2026.09.09-v8'),entry) then
      raise exception 'current or previously approved documentary contract rejected';
    end if;
    if private.is_released_documentary_plan_v1(jsonb_set(current_plan,'{registryVersion}','"2026.09.09-v9"'),entry)
      or private.is_released_documentary_plan_v1(prior_plan,'review_market') then
      raise exception 'mixed or unrelated documentary contract accepted';
    end if;
  end loop;
end $$;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous) values
('10000000-0000-4000-8000-000000000971','authenticated','authenticated','document-plan-a@example.invalid','{"provider":"email","providers":["email"]}','{}',now(),now(),false,false),
('10000000-0000-4000-8000-000000000972','authenticated','authenticated','document-plan-b@example.invalid','{"provider":"email","providers":["email"]}','{}',now(),now(),false,false);
insert into public.organizations(id,organization_type,name,created_by) values
('20000000-0000-4000-8000-000000000971','originator','Synthetic documentary A','10000000-0000-4000-8000-000000000971'),
('20000000-0000-4000-8000-000000000972','originator','Synthetic documentary B','10000000-0000-4000-8000-000000000972');
insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values
('20000000-0000-4000-8000-000000000971','10000000-0000-4000-8000-000000000971','owner','active',now()),
('20000000-0000-4000-8000-000000000972','10000000-0000-4000-8000-000000000972','owner','active',now());
insert into public.onboarding_progress (organization_id,user_id,journey,current_step) values
('20000000-0000-4000-8000-000000000971','10000000-0000-4000-8000-000000000971','originator','organization');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000971","role":"authenticated"}',true);
do $$
declare p jsonb := pg_temp.documentary_plan_fixture('structure_from_documents'); result jsonb; replay jsonb;
  request_id uuid; entry text; before_count integer; mutation jsonb; project uuid;
begin
  -- Even the exact released graph cannot bypass confidentiality acceptance.
  begin
    perform public.start_advisor_project_in_group_v1(gen_random_uuid(),'pt-BR','Synthetic no terms','structure_from_documents','Compare os documentos sintéticos.','authorized_private',p,null);
    raise exception 'documentary start bypassed terms';
  exception when insufficient_privilege then null; end;
  perform public.accept_private_workspace_terms('pt-BR','Synthetic reviewer','Analista',true,true);
  foreach entry in array array['structure_from_documents','review_existing_operation'] loop
    p := pg_temp.documentary_plan_fixture(entry); request_id := gen_random_uuid();
    result := public.start_advisor_project_in_group_v1(request_id,'pt-BR','Synthetic '||entry,entry,'Compare os documentos sintéticos.','authorized_private',p,null);
    project := (result->>'capital_project_id')::uuid;
    if (select snapshot from public.capital_project_plans where capital_project_id=project and status='active') is distinct from p
      or (select array_agg(task_id order by ordinal) from public.capital_project_plan_tasks where capital_project_id=project) is distinct from array['Q01','Q02','Q03'] then
      raise exception 'documentary compiler graph not persisted exactly';
    end if;
    if (select count(*) from public.document_intake_sessions where capital_project_id=project)<>1 then raise exception 'documentary session missing'; end if;
    replay := public.start_advisor_project_in_group_v1(request_id,'pt-BR','Synthetic '||entry,entry,'Compare os documentos sintéticos.','authorized_private',p,null);
    if replay->>'capital_project_id' is distinct from result->>'capital_project_id'
      or (select count(*) from public.capital_project_plans where capital_project_id=project)<>1 then raise exception 'documentary start replay duplicated plan'; end if;
  end loop;
  p := pg_temp.documentary_plan_fixture('structure_from_documents');
  select count(*) into before_count from public.capital_projects;
  for mutation in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_set(p,'{taskSpecs,0,effect}','"commit"'),
    jsonb_set(p,'{taskSpecs,1,dependencies}','[]'),
    jsonb_set(p,'{taskSpecs,2,dependencies}','["Q01"]'),
    jsonb_set(p,'{taskSpecs,2,effect}','"none"'),
    jsonb_set(p,'{taskSpecs,1,ordinal}','0'),
    jsonb_set(p,'{taskSpecs,1,batch}','0'),
    jsonb_set(p,'{taskSpecs,1,executionClass}','"action"'),
    jsonb_set(p,'{taskSpecs,1,maturity}','"production"'),
    jsonb_set(p,'{taskSpecs,1,procedure,version}','"unreleased"'),
    jsonb_set(p,'{taskSpecs,1,readingStrategies}','[]'),
    jsonb_set(p,'{taskSpecs,1,id}','"S01"'),
    jsonb_set(p,'{taskSpecs}',(p->'taskSpecs')||jsonb_build_array(p#>'{taskSpecs,0}')),
    jsonb_set(p,'{parallelBatches}','[["Q01","Q02"],["Q03"]]'),
    jsonb_set(p,'{job,targetTaskIds}','["S11"]'),
    jsonb_set(p,'{job,confirmationGate}','"diagnostic"'),
    jsonb_set(p,'{registryVersion}','"2026.09.09-v8"'),
    jsonb_set(p,'{compilerVersion}','"unreleased"'),
    p || '{"approvedRequest":{"authority":"external_effect"}}'::jsonb
  )) loop
    begin
      perform public.start_advisor_project_in_group_v1(gen_random_uuid(),'pt-BR','Synthetic tampered plan','structure_from_documents','Compare os documentos sintéticos.','authorized_private',mutation,null);
      raise exception 'tampered documentary graph accepted';
    exception when invalid_parameter_value then null; end;
  end loop;
  if (select count(*) from public.capital_projects)<>before_count then raise exception 'rejected graph left partial project'; end if;
  begin
    perform public.start_advisor_project_in_group_v1(gen_random_uuid(),'pt-BR','Synthetic wrong access','structure_from_documents','Compare os documentos sintéticos.','public_information',p,null);
    raise exception 'documentary graph bypassed private access';
  exception when insufficient_privilege then null; end;
  -- Clients cannot impersonate an arbitrary actor or call the validator directly.
  begin
    perform private.record_execution_proposal_plan_as_actor(project,p,'10000000-0000-4000-8000-000000000971');
    raise exception 'authenticated actor bypass is callable';
  exception when insufficient_privilege then null; end;
  begin
    perform public.worker_record_execution_brief_proposal_v1(gen_random_uuid(),repeat('x',40),'{}','{}',repeat('a',64),p);
    raise exception 'invalid capability accepted';
  exception when insufficient_privilege or no_data_found then null; end;
end;
$$;
reset role;
-- Trusted capability path's private recorder uses the supplied actor and still enforces membership.
insert into public.capital_projects(id,organization_id,project_name,entry_job,access_basis,status,current_phase,created_by) values
('30000000-0000-4000-8000-000000000971','20000000-0000-4000-8000-000000000971','Synthetic actor plan','structure_from_documents','authorized_private','active','understand','10000000-0000-4000-8000-000000000971');
do $$
declare project uuid := '30000000-0000-4000-8000-000000000971'; p jsonb := pg_temp.documentary_plan_fixture('structure_from_documents'); plan uuid;
begin
  begin
    perform private.record_execution_proposal_plan_as_actor(project,p,'10000000-0000-4000-8000-000000000972');
    raise exception 'actor crossed tenant';
  exception when no_data_found then null; end;
  begin
    perform private.record_execution_proposal_plan_as_actor(project,jsonb_set(p,'{taskSpecs,1,effect}','"commit"'),'10000000-0000-4000-8000-000000000971');
    raise exception 'actor accepted altered graph';
  exception when invalid_parameter_value then null; end;
  plan := private.record_execution_proposal_plan_as_actor(project,p,'10000000-0000-4000-8000-000000000971');
  if (select snapshot from public.capital_project_plans where id=plan) is distinct from p then raise exception 'actor snapshot differs'; end if;
  if private.record_execution_proposal_plan_as_actor(project,p,'10000000-0000-4000-8000-000000000971') is distinct from plan then raise exception 'actor replay differs'; end if;
  perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000972","role":"authenticated"}',true);
  begin
    perform private.record_capital_project_plan(project,p);
    raise exception 'user recorder crossed tenant';
  exception when no_data_found then null; end;
end;
$$;
rollback;
