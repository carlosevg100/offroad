-- M07 context/retention transaction eval. Uses legitimate project/approval/lease commands.
-- Storage objects below are metadata fixtures; physical HTTP eval is a separate gate.

begin;
select set_config('request.jwt.claim.sub','',true);
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_persistent_work_fixture.sql
\ir support/execution_approval.sql

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values
  ('10000000-0000-4000-8000-000000000201', 'authenticated', 'authenticated',
   'origination-owner@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb,
   '{}'::jsonb, now(), now(), false, false),
  ('10000000-0000-4000-8000-000000000202', 'authenticated', 'authenticated',
   'other-tenant@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb,
   '{}'::jsonb, now(), now(), false, false);

insert into public.organizations (id, organization_type, name, created_by) values
  ('20000000-0000-4000-8000-000000000201', 'originator', 'Origination Workspace',
   '10000000-0000-4000-8000-000000000201'),
  ('20000000-0000-4000-8000-000000000202', 'originator', 'Other Workspace',
   '10000000-0000-4000-8000-000000000202');

insert into public.organization_memberships (organization_id, user_id, role, status, joined_at) values
  ('20000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000201', 'owner', 'active', now()),
  ('20000000-0000-4000-8000-000000000202', '10000000-0000-4000-8000-000000000202', 'owner', 'active', now());

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000201","role":"authenticated","aal":"aal1"}',
  true
);

do $$
declare
  request_id constant uuid := '30000000-0000-4000-8000-000000000201';
  plan_snapshot jsonb;
  first_result jsonb;
  replay_result jsonb;
  project_id uuid;
  session_id uuid;
  brief_id uuid;
  rejected boolean := false;
begin
  select jsonb_build_object(
    'schemaVersion', 'capital-project-plan.v1',
    'compilerVersion', '2026.09.01-v2',
    'registryVersion', '2026.09.01-v2',
    'job', jsonb_build_object(
      'id', 'origination_thesis',
      'targetTaskIds', jsonb_build_array('M07', 'C02', 'K04'),
      'firstWorkProduct', 'meeting_brief',
      'confirmationGate', 'preliminary_understanding',
      'accessPolicy', 'public_or_private',
      'inputPolicy', jsonb_build_object(
        'company', 'required', 'documents', 'optional', 'capitalIntent', 'optional',
        'existingTransaction', 'not_applicable', 'publicResearch', 'required'
      )
    ),
    'taskSpecs', jsonb_agg(jsonb_build_object(
      'id', spec.id, 'label', spec.label, 'graph', spec.graph,
      'dependencies', to_jsonb(spec.dependencies), 'executionClass', spec.execution_class,
      'effect', spec.effect, 'maturity', 'specified', 'ordinal', spec.ordinal, 'batch', spec.batch
    ) order by spec.ordinal),
    'parallelBatches', jsonb_build_array(
      jsonb_build_array('M01', 'M02'),
      jsonb_build_array('M03', 'M04'),
      jsonb_build_array('M05', 'C02', 'K04'),
      jsonb_build_array('M06'),
      jsonb_build_array('M07')
    )
  ) into plan_snapshot
  from (values
    ('M01','Resolver companhia e grupo','case',array[]::text[],'extraction','propose_state',0,0),
    ('M02','Normalizar objetivo','case',array[]::text[],'extraction','propose_state',1,0),
    ('M03','Registrar restrições','case',array['M02'],'extraction','propose_state',2,1),
    ('M04','Inferir arquétipos candidatos','case',array['M01','M02'],'judgment','propose_state',3,1),
    ('M05','Definir entregáveis','case',array['M02','M03'],'deterministic','propose_state',4,2),
    ('M06','Compilar plano de tarefas','case',array['M04','M05'],'deterministic','commit',5,3),
    ('M07','Emitir entendimento corrigível','case',array['M06','C02','K04'],'compilation','propose_state',6,4),
    ('C02','Pesquisar setor e regulação','knowledge',array['M01','M04'],'research','none',7,2),
    ('K04','Pesquisar transações comparáveis','market',array['M01','M04'],'research','commit',8,2)
  ) spec(id,label,graph,dependencies,execution_class,effect,ordinal,batch);

  perform pg_temp.legacy_specialized_work(
    request_id, 'pt-BR', 'Projeto Farol', 'Companhia Farol S.A.',
    'https://farol.example',
    jsonb_build_object(
      'meetingContext', 'Preparar uma primeira conversa com a diretoria financeira sobre prioridades de dívida.',
      'audience', 'CFO e tesouraria',
      'thesisToTest', 'Testar se o perfil de vencimentos cria uma oportunidade de refinanciamento.'
    ),
    plan_snapshot
  );
  first_result := public.start_public_origination_thesis_v1(
    request_id, 'pt-BR', 'Projeto Farol', 'Companhia Farol S.A.',
    'https://farol.example',
    jsonb_build_object(
      'meetingContext', 'Preparar uma primeira conversa com a diretoria financeira sobre prioridades de dívida.',
      'audience', 'CFO e tesouraria',
      'thesisToTest', 'Testar se o perfil de vencimentos cria uma oportunidade de refinanciamento.'
    ),
    plan_snapshot
  );
  project_id := (first_result ->> 'capital_project_id')::uuid;
  session_id := (first_result ->> 'intake_session_id')::uuid;
  brief_id := (first_result ->> 'brief_id')::uuid;

  if first_result ->> 'replayed' <> 'false'
    or (select access_basis from public.capital_projects where id = project_id) <> 'public_information'
    or (select privacy_status from public.document_intake_sessions where id = session_id) <> 'public_information'
    or (select representation_status from public.document_intake_sessions where id = session_id) <> 'not_claimed'
    or (select count(*) from public.capital_project_briefs where id = brief_id and status = 'active') <> 1
    or (select count(*) from public.capital_project_plan_tasks task
        join public.capital_project_plans plan on plan.id = task.plan_id and plan.organization_id = task.organization_id
        where plan.capital_project_id = project_id) <> 9
    or (select dependencies from public.capital_project_plan_tasks task
        join public.capital_project_plans plan on plan.id = task.plan_id and plan.organization_id = task.organization_id
        where plan.capital_project_id = project_id and task.task_id = 'M07')
       is distinct from array['M06','C02','K04']::text[] then
    raise exception 'public origination start did not persist the exact bounded contract: %', first_result;
  end if;

  replay_result := public.start_public_origination_thesis_v1(
    request_id, 'pt-BR', 'Projeto Farol', 'Companhia Farol S.A.',
    'https://farol.example',
    jsonb_build_object(
      'meetingContext', 'Preparar uma primeira conversa com a diretoria financeira sobre prioridades de dívida.',
      'audience', 'CFO e tesouraria',
      'thesisToTest', 'Testar se o perfil de vencimentos cria uma oportunidade de refinanciamento.'
    ),
    plan_snapshot
  );
  if replay_result ->> 'replayed' <> 'true'
    or replay_result ->> 'capital_project_id' <> project_id::text
    or replay_result ->> 'job_id' <> first_result ->> 'job_id'
    or (select count(*) from public.capital_projects where id = project_id) <> 1 then
    raise exception 'origination request idempotency failed: %', replay_result;
  end if;

  begin
    insert into public.capital_project_briefs (
      organization_id, capital_project_id, request_id, brief_kind, brief_version,
      status, content, content_fingerprint, created_by
    ) values (
      '20000000-0000-4000-8000-000000000201', project_id, gen_random_uuid(),
      'origination_thesis', 2, 'active', '{}'::jsonb, repeat('a', 64),
      '10000000-0000-4000-8000-000000000201'
    );
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'tenant wrote project memory outside the command'; end if;
end;
$$;

-- A different organization cannot read the project brief or resolve the project through RLS.
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000202","role":"authenticated","aal":"aal1"}',
  true
);

do $$
begin
  if (select count(*) from public.capital_project_briefs
      where request_id = '30000000-0000-4000-8000-000000000201') <> 0
    or (select count(*) from public.capital_projects where project_name = 'Projeto Farol') <> 0 then
    raise exception 'origination project memory crossed tenant boundaries';
  end if;
end;
$$;

-- The worker can load the exact project context only with the one-job capability returned by
-- the queue. A guessed or stale token is rejected.
reset role;
insert into private.worker_tokens (label, token_sha256,execution_account_user_id)
values ('origination-thesis-worker-test', extensions.digest(repeat('w', 64), 'sha256'),'10000000-0000-4000-8000-000000000201')
on conflict (token_sha256) do update set status = 'active', revoked_at = null;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000201","role":"authenticated","aal":"aal1"}',
  true
);


create temp table m07_recipe_fixture(job_id uuid,capability text,base jsonb,allocation jsonb,retention jsonb,object_id uuid);
grant all on m07_recipe_fixture to authenticated;
-- The staging queue can contain unrelated expired leases. Prioritize only
-- this rollback fixture; claim/capability and all installed guards remain real.
reset role;
do $$declare fixture_job uuid;begin
 select id into strict fixture_job from public.processing_jobs
 where organization_id='20000000-0000-4000-8000-000000000201'
 and kind='capital_project_analysis' and payload->>'analysis_scope'='origination_thesis' and status='awaiting_approval';
 perform pg_temp.fixture_approve_execution(fixture_job);
 update public.processing_jobs set available_at=(select coalesce(min(available_at),clock_timestamp())-interval '1 second' from public.processing_jobs where id<>fixture_job)
 where id=fixture_job and organization_id='20000000-0000-4000-8000-000000000201'
 and kind='capital_project_analysis' and payload->>'analysis_scope'='origination_thesis';
end $$;
set local role authenticated;
do $$declare claim jsonb;begin
 claim:=public.worker_claim_job_v3(repeat('w',64),600);
 if claim#>>'{payload,analysis_scope}' is distinct from 'origination_thesis' then raise exception 'm07_real_job_required';end if;
 insert into pg_temp.m07_recipe_fixture(job_id,capability) values((claim->>'job_id')::uuid,claim->>'capability_token');
end; $$;
reset role;
update private.capital_public_retention_controls set enabled=true;
-- Purger health comes from the actual authorized claim, not an invented timestamp.
set local role authenticated;
select public.worker_claim_capital_capture_purge_v1(repeat('w',64));
do $$declare f record;base_receipt jsonb;a jsonb;replay jsonb;begin
 select * into strict f from pg_temp.m07_recipe_fixture;
 begin perform public.worker_prepare_capital_m07_recipe_v1(f.job_id,repeat('x',64));raise exception 'm07_wrong_capability_admitted';exception when insufficient_privilege then null;end;
 base_receipt:=public.worker_prepare_capital_m07_recipe_v1(f.job_id,f.capability);
 if base_receipt->>'schemaVersion'<>'capital-m07-base-context.v1' or base_receipt->>'contextFingerprint'<>encode(extensions.digest(base_receipt->>'canonicalContext','sha256'),'hex') then raise exception 'm07_base_physical_identity_invalid';end if;
 replay:=public.worker_prepare_capital_m07_recipe_v1(f.job_id,f.capability);
 if replay<>base_receipt then raise exception 'm07_base_replay_changed';end if;
 a:=public.worker_prepare_capital_m07_context_v1(f.job_id,f.capability,(base_receipt->>'recipeId')::uuid,'ba770000-0000-4000-9000-000000000001');
 if a->>'canonicalBody'<>base_receipt->>'canonicalContext' or a->>'payloadFingerprint'<>base_receipt->>'contextFingerprint'
 or(a->>'byteLength')::bigint<>octet_length(a->>'canonicalBody') or split_part(a->>'path','/',2)<>a->>'allocationId' then raise exception 'm07_context_allocation_identity_invalid';end if;
 if(a->>'expiresAt')::timestamptz<=(a->>'purgeAt')::timestamptz or(a->>'purgeAt')::timestamptz<=clock_timestamp() then raise exception 'm07_context_ttl_invalid';end if;
 update pg_temp.m07_recipe_fixture set base=base_receipt,allocation=a;
 begin perform public.worker_finalize_capital_m07_recipe_v1(f.job_id,f.capability,(base_receipt->>'recipeId')::uuid,gen_random_uuid(),'[]',repeat('a',64),repeat('b',64),repeat('c',64),repeat('d',64),1000000,2,'abstained');raise exception 'm07_recipe_empty_unretained_admitted';exception when invalid_parameter_value or insufficient_privilege then null;end;
 begin perform public.worker_authorize_capital_m07_processing_v1(f.job_id,f.capability,(base_receipt->>'recipeId')::uuid,'{}','{}',array['inference','prompt_cache','schema_cache'],'case_analysis');raise exception 'm07_unsealed_dispatch_admitted';exception when invalid_parameter_value or insufficient_privilege then null;end;
end; $$;
reset role;
do $$declare f record;o uuid:=gen_random_uuid();begin
 select * into strict f from pg_temp.m07_recipe_fixture;
 insert into storage.objects(id,bucket_id,name,version,metadata) values(o,f.allocation->>'bucket',f.allocation->>'path','m07-synthetic-storage-version',jsonb_build_object('size',(f.allocation->>'byteLength')::bigint,'mimetype','application/json'));
 update pg_temp.m07_recipe_fixture set object_id=o;
end; $$;
set local role authenticated;
do $$declare f record;r jsonb;begin
 select * into strict f from pg_temp.m07_recipe_fixture;
 begin perform public.worker_commit_capital_m07_body_v1(f.job_id,f.capability,(f.allocation->>'allocationId')::uuid,f.object_id,'wrong-version',f.allocation->>'payloadFingerprint',(f.allocation->>'byteLength')::bigint);raise exception 'm07_wrong_physical_version_admitted';exception when invalid_parameter_value then null;end;
 r:=public.worker_commit_capital_m07_body_v1(f.job_id,f.capability,(f.allocation->>'allocationId')::uuid,f.object_id,'m07-synthetic-storage-version',f.allocation->>'payloadFingerprint',(f.allocation->>'byteLength')::bigint);
 if r->>'retentionState'<>'retained' or r->>'bodyBasisId'<>f.allocation->>'bodyBasisId' then raise exception 'm07_context_physical_commit_invalid';end if;
 if(public.worker_read_capital_m07_allocation_v1(f.job_id,f.capability,(f.allocation->>'allocationId')::uuid))->>'retainedPayloadId'<>r->>'retainedPayloadId' then raise exception 'm07_context_scope_drift';end if;
 update pg_temp.m07_recipe_fixture set retention=r;
end; $$;
reset role;
-- No context body entered permanent metadata or audit. Company profile changes
-- invalidate the old captured base without changing the receipt or its TTL.
do $$declare f record;old_fp text;begin
 select * into strict f from pg_temp.m07_recipe_fixture;
 select context_fingerprint into old_fp from private.capital_m07_recipes where id=(f.base->>'recipeId')::uuid;
 if old_fp<>f.base->>'contextFingerprint' then raise exception 'm07_recipe_hash_changed';end if;
 if exists(select 1 from private.capital_m07_recipes where to_jsonb(capital_m07_recipes)::text like '%meetingContext%') then raise exception 'm07_raw_context_in_metadata';end if;
 update public.document_intake_sessions set company_profile=company_profile||'{"name":"Changed company"}' where id=(((f.base->>'canonicalContext')::jsonb)#>>'{session,id}')::uuid;
end; $$;
set local role authenticated;
do $$declare f record;begin
 select * into strict f from pg_temp.m07_recipe_fixture;
 begin perform public.worker_read_capital_m07_allocation_v1(f.job_id,f.capability,(f.allocation->>'allocationId')::uuid);raise exception 'm07_changed_company_read_admitted';exception when insufficient_privilege then null;end;
 begin perform public.read_capital_m07_result_v1(gen_random_uuid());raise exception 'm07_unbound_human_revision_admitted';exception when insufficient_privilege then null;end;
end; $$;
reset role;
do $$declare p record;begin
 for p in select oid,proname from pg_proc where pronamespace='private'::regnamespace and proname in ('capital_m07_commit_result_core_v1','worker_prepare_capital_m07_output_core_v1','require_capital_m07_recipe_v1','read_artifact_revision_pre_m07_v1','decide_capital_project_artifact_pre_m07') loop
 if has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('service_role',p.oid,'EXECUTE') then raise exception 'm07_internal_command_exposed:%',p.proname;end if;
 end loop;
end; $$;
rollback;
