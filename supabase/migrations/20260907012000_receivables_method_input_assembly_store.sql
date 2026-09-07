-- Keep the exact input of the receivables specialist method outside the Data API. The public
-- case snapshot receives only readiness and execution metadata; title-level legal, cash,
-- accounting and structure data remain capability-bound to the worker.

create table private.receivables_method_input_assemblies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  capital_project_id uuid not null,
  intake_session_id uuid not null,
  processing_run_id uuid not null,
  processing_job_id uuid not null,
  source_dataset_hash text not null check (source_dataset_hash ~ '^[0-9a-f]{64}$'),
  schema_version text not null check (schema_version = 'receivables-pool-input-assembly.2026-09-07-v1'),
  assembly_fingerprint text not null check (assembly_fingerprint ~ '^[0-9a-f]{64}$'),
  assembly jsonb not null check (jsonb_typeof(assembly) = 'object'),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, intake_session_id, source_dataset_hash, assembly_fingerprint),
  foreign key (organization_id, capital_project_id)
    references public.capital_projects(organization_id, id) on delete cascade,
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions(organization_id, id) on delete cascade,
  foreign key (organization_id, processing_run_id)
    references public.processing_runs(organization_id, id) on delete restrict,
  foreign key (organization_id, processing_job_id)
    references public.processing_jobs(organization_id, id) on delete restrict
);

create index receivables_method_input_assemblies_session_idx
  on private.receivables_method_input_assemblies (
    organization_id, intake_session_id, created_at desc, id desc
  );
create index receivables_method_input_assemblies_project_idx
  on private.receivables_method_input_assemblies (
    organization_id, capital_project_id, created_at desc, id desc
  );

revoke all privileges on private.receivables_method_input_assemblies
  from public, anon, authenticated;

create table private.receivables_specialist_shadow_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  capital_project_id uuid not null,
  intake_session_id uuid not null,
  processing_run_id uuid not null,
  processing_job_id uuid not null,
  input_assembly_id uuid not null,
  task_id text not null check (task_id = 'R01'),
  executor_key text not null check (executor_key = '@offroad/receivables-analysis#underwriteReceivablesPool'),
  executor_version text not null check (length(trim(executor_version)) between 3 and 120),
  input_fingerprint text not null check (input_fingerprint ~ '^[0-9a-f]{64}$'),
  output_fingerprint text not null check (output_fingerprint ~ '^[0-9a-f]{64}$'),
  result_fingerprint text not null check (result_fingerprint ~ '^[0-9a-f]{64}$'),
  artifact jsonb not null check (jsonb_typeof(artifact) = 'object'),
  quality_results jsonb not null check (jsonb_typeof(quality_results) = 'array'),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, processing_job_id, task_id, input_fingerprint),
  foreign key (organization_id, capital_project_id)
    references public.capital_projects(organization_id, id) on delete cascade,
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions(organization_id, id) on delete cascade,
  foreign key (organization_id, processing_run_id)
    references public.processing_runs(organization_id, id) on delete restrict,
  foreign key (organization_id, processing_job_id)
    references public.processing_jobs(organization_id, id) on delete restrict,
  foreign key (organization_id, input_assembly_id)
    references private.receivables_method_input_assemblies(organization_id, id) on delete restrict
);

create index receivables_specialist_shadow_runs_session_idx
  on private.receivables_specialist_shadow_runs (
    organization_id, intake_session_id, created_at desc, id desc
  );
revoke all privileges on private.receivables_specialist_shadow_runs
  from public, anon, authenticated;

create or replace function private.worker_record_receivables_method_input_assembly_v1(
  p_job_id uuid,
  p_capability_token text,
  p_assembly jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  session_row public.document_intake_sessions;
  inserted_row private.receivables_method_input_assemblies;
  existing_row private.receivables_method_input_assemblies;
  dataset_hash text;
  assembly_fingerprint text;
begin
  if job_row.kind <> 'case_analysis' then
    raise exception 'case_analysis_capability_required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_assembly) <> 'object'
    or p_assembly ->> 'schemaVersion' <> '2026.09.07-v1'
    or jsonb_typeof(p_assembly -> 'source') <> 'object'
    or coalesce(p_assembly #>> '{source,datasetHash}', '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_assembly #>> '{source,universeId}', '') = ''
    or jsonb_typeof(p_assembly #> '{source,titleMapping}') <> 'array'
    or jsonb_array_length(p_assembly #> '{source,titleMapping}') < 1
    or jsonb_typeof(p_assembly -> 'evidence') <> 'object'
    or jsonb_typeof(p_assembly -> 'findingResolutions') <> 'array'
    or jsonb_typeof(p_assembly -> 'input') <> 'object'
    or jsonb_typeof(p_assembly #> '{input,case,portfolio}') <> 'array'
    or jsonb_array_length(p_assembly #> '{input,case,portfolio}') < 1
    or octet_length(p_assembly::text) > 33554432 then
    raise exception 'receivables_method_input_assembly_contract_invalid' using errcode = '22023';
  end if;

  select session.* into session_row
  from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id
    and session.id = job_row.intake_session_id
  for update;
  if not found then
    raise exception 'intake_session_not_found' using errcode = 'P0002';
  end if;
  if session_row.capital_project_id is null then
    raise exception 'case_project_binding_required' using errcode = '55000';
  end if;

  dataset_hash := p_assembly #>> '{source,datasetHash}';
  assembly_fingerprint := encode(
    extensions.digest(convert_to(p_assembly::text, 'UTF8'), 'sha256'), 'hex'
  );

  select stored.* into existing_row
  from private.receivables_method_input_assemblies stored
  where stored.organization_id = job_row.organization_id
    and stored.intake_session_id = job_row.intake_session_id
    and stored.source_dataset_hash = dataset_hash
    and stored.assembly_fingerprint = assembly_fingerprint;
  if found then
    return jsonb_build_object(
      'id', existing_row.id,
      'source_dataset_hash', existing_row.source_dataset_hash,
      'assembly_fingerprint', existing_row.assembly_fingerprint,
      'replayed', true
    );
  end if;

  insert into private.receivables_method_input_assemblies (
    organization_id, capital_project_id, intake_session_id, processing_run_id,
    processing_job_id, source_dataset_hash, schema_version, assembly_fingerprint, assembly
  ) values (
    job_row.organization_id, session_row.capital_project_id, job_row.intake_session_id,
    job_row.processing_run_id, job_row.id, dataset_hash,
    'receivables-pool-input-assembly.2026-09-07-v1', assembly_fingerprint, p_assembly
  ) returning * into inserted_row;

  return jsonb_build_object(
    'id', inserted_row.id,
    'source_dataset_hash', inserted_row.source_dataset_hash,
    'assembly_fingerprint', inserted_row.assembly_fingerprint,
    'replayed', false
  );
end;
$$;

create or replace function private.worker_load_receivables_method_input_assembly_v1(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  stored private.receivables_method_input_assemblies;
begin
  if job_row.kind <> 'case_analysis' then
    raise exception 'case_analysis_capability_required' using errcode = '42501';
  end if;
  select assembly_row.* into stored
  from private.receivables_method_input_assemblies assembly_row
  where assembly_row.organization_id = job_row.organization_id
    and assembly_row.intake_session_id = job_row.intake_session_id
  order by assembly_row.created_at desc, assembly_row.id desc
  limit 1;
  if not found then return null; end if;
  return jsonb_build_object(
    'id', stored.id,
    'source_dataset_hash', stored.source_dataset_hash,
    'assembly_fingerprint', stored.assembly_fingerprint,
    'assembly', stored.assembly
  );
end;
$$;

create or replace function private.worker_record_receivables_specialist_shadow_run_v1(
  p_job_id uuid,
  p_capability_token text,
  p_input_assembly_id uuid,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  session_row public.document_intake_sessions;
  assembly_row private.receivables_method_input_assemblies;
  inserted_row private.receivables_specialist_shadow_runs;
  existing_row private.receivables_specialist_shadow_runs;
  input_fingerprint text;
  output_fingerprint text;
  result_fingerprint text;
begin
  if job_row.kind <> 'case_analysis' then
    raise exception 'case_analysis_capability_required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_result) <> 'object'
    or p_result ->> 'mode' <> 'internal_shadow'
    or p_result ->> 'taskId' <> 'R01'
    or p_result ->> 'executorKey' <> '@offroad/receivables-analysis#underwriteReceivablesPool'
    or coalesce(p_result ->> 'executorVersion', '') = ''
    or coalesce((p_result ->> 'externalEffectAllowed')::boolean, true)
    or jsonb_typeof(p_result -> 'artifact') <> 'object'
    or p_result #>> '{artifact,artifactType}' <> 'receivables_pool_underwriting'
    or p_result #>> '{artifact,status}' <> 'draft'
    or coalesce(p_result #>> '{artifact,inputFingerprint}', '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_result #>> '{artifact,outputFingerprint}', '') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_result -> 'qualityResults') <> 'array'
    or jsonb_array_length(p_result -> 'qualityResults') < 1
    or exists (
      select 1 from jsonb_array_elements(p_result -> 'qualityResults') check_row
      where check_row ->> 'status' <> 'passed'
    )
    or octet_length(p_result::text) > 33554432 then
    raise exception 'receivables_specialist_shadow_result_contract_invalid' using errcode = '22023';
  end if;

  select session.* into session_row
  from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id
    and session.id = job_row.intake_session_id;
  if not found or session_row.capital_project_id is null then
    raise exception 'case_project_binding_required' using errcode = '55000';
  end if;
  select stored.* into assembly_row
  from private.receivables_method_input_assemblies stored
  where stored.organization_id = job_row.organization_id
    and stored.id = p_input_assembly_id
    and stored.intake_session_id = job_row.intake_session_id;
  if not found then
    raise exception 'receivables_method_input_assembly_not_found' using errcode = 'P0002';
  end if;

  input_fingerprint := p_result #>> '{artifact,inputFingerprint}';
  output_fingerprint := p_result #>> '{artifact,outputFingerprint}';
  result_fingerprint := encode(
    extensions.digest(convert_to(p_result::text, 'UTF8'), 'sha256'), 'hex'
  );
  select run.* into existing_row
  from private.receivables_specialist_shadow_runs run
  where run.organization_id = job_row.organization_id
    and run.processing_job_id = job_row.id
    and run.task_id = 'R01'
    and run.input_fingerprint = input_fingerprint;
  if found then
    if existing_row.result_fingerprint <> result_fingerprint then
      raise exception 'receivables_specialist_shadow_run_immutable_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'id', existing_row.id,
      'input_fingerprint', existing_row.input_fingerprint,
      'output_fingerprint', existing_row.output_fingerprint,
      'result_fingerprint', existing_row.result_fingerprint,
      'replayed', true
    );
  end if;

  insert into private.receivables_specialist_shadow_runs (
    organization_id, capital_project_id, intake_session_id, processing_run_id,
    processing_job_id, input_assembly_id, task_id, executor_key, executor_version,
    input_fingerprint, output_fingerprint, result_fingerprint, artifact, quality_results
  ) values (
    job_row.organization_id, session_row.capital_project_id, job_row.intake_session_id,
    job_row.processing_run_id, job_row.id, assembly_row.id, 'R01',
    p_result ->> 'executorKey', p_result ->> 'executorVersion', input_fingerprint,
    output_fingerprint, result_fingerprint, p_result -> 'artifact', p_result -> 'qualityResults'
  ) returning * into inserted_row;

  return jsonb_build_object(
    'id', inserted_row.id,
    'input_fingerprint', inserted_row.input_fingerprint,
    'output_fingerprint', inserted_row.output_fingerprint,
    'result_fingerprint', inserted_row.result_fingerprint,
    'replayed', false
  );
end;
$$;

create or replace function public.worker_record_receivables_method_input_assembly_v1(
  p_job_id uuid,
  p_capability_token text,
  p_assembly jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_record_receivables_method_input_assembly_v1(
    p_job_id, p_capability_token, p_assembly
  );
$$;

create or replace function public.worker_load_receivables_method_input_assembly_v1(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_load_receivables_method_input_assembly_v1(
    p_job_id, p_capability_token
  );
$$;

create or replace function public.worker_record_receivables_specialist_shadow_run_v1(
  p_job_id uuid,
  p_capability_token text,
  p_input_assembly_id uuid,
  p_result jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_record_receivables_specialist_shadow_run_v1(
    p_job_id, p_capability_token, p_input_assembly_id, p_result
  );
$$;

revoke all on function private.worker_record_receivables_method_input_assembly_v1(uuid, text, jsonb)
  from public, anon;
revoke all on function private.worker_load_receivables_method_input_assembly_v1(uuid, text)
  from public, anon;
revoke all on function public.worker_record_receivables_method_input_assembly_v1(uuid, text, jsonb)
  from public, anon;
revoke all on function public.worker_load_receivables_method_input_assembly_v1(uuid, text)
  from public, anon;
revoke all on function private.worker_record_receivables_specialist_shadow_run_v1(uuid, text, uuid, jsonb)
  from public, anon;
revoke all on function public.worker_record_receivables_specialist_shadow_run_v1(uuid, text, uuid, jsonb)
  from public, anon;
grant execute on function private.worker_record_receivables_method_input_assembly_v1(uuid, text, jsonb)
  to authenticated;
grant execute on function private.worker_load_receivables_method_input_assembly_v1(uuid, text)
  to authenticated;
grant execute on function public.worker_record_receivables_method_input_assembly_v1(uuid, text, jsonb)
  to authenticated;
grant execute on function public.worker_load_receivables_method_input_assembly_v1(uuid, text)
  to authenticated;
grant execute on function private.worker_record_receivables_specialist_shadow_run_v1(uuid, text, uuid, jsonb)
  to authenticated;
grant execute on function public.worker_record_receivables_specialist_shadow_run_v1(uuid, text, uuid, jsonb)
  to authenticated;

-- Preserve the latest case-input composition and attach the private assembly only through the
-- live case capability. A stale assembly remains visible to the worker so the TypeScript
-- readiness gate can name the dataset conflict instead of silently falling back.
create or replace function public.worker_load_case_input(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  with base as (
    select private.worker_load_case_input(p_job_id, p_capability_token) as input
  )
  select base.input
    || jsonb_build_object(
      'session',
      (base.input -> 'session') || private.worker_load_case_project_binding(p_job_id, p_capability_token)
    )
    || jsonb_build_object('pricing_context', private.worker_load_pricing_context(p_job_id, p_capability_token))
    || jsonb_build_object('market_distribution_context', private.worker_load_market_distribution_context(p_job_id, p_capability_token))
    || jsonb_build_object('red_flag_context', private.worker_load_red_flag_context(p_job_id, p_capability_token))
    || jsonb_build_object('conduct_context', private.worker_load_conduct_context(p_job_id, p_capability_token))
    || jsonb_build_object('receivables_evidence', private.worker_load_receivables_evidence(p_job_id, p_capability_token))
    || jsonb_build_object('receivables_provider_context', private.worker_load_receivables_provider_context(p_job_id, p_capability_token))
    || jsonb_build_object('receivables_method_input_assembly', private.worker_load_receivables_method_input_assembly_v1(p_job_id, p_capability_token))
    || jsonb_build_object('deal_workflow', private.worker_load_deal_workflow_state(p_job_id, p_capability_token))
    || jsonb_build_object('deal_state_context', private.worker_load_deal_state_context(p_job_id, p_capability_token))
    || jsonb_build_object('match_provider_context', private.worker_load_match_provider_context(p_job_id, p_capability_token))
  from base;
$$;

revoke all on function public.worker_load_case_input(uuid, text)
  from public, anon;
grant execute on function public.worker_load_case_input(uuid, text)
  to authenticated;

comment on table private.receivables_method_input_assemblies is
  'Immutable, project-scoped specialist method inputs. Exact payloads never enter the Data API.';
comment on table private.receivables_specialist_shadow_runs is
  'Immutable internal-only specialist outputs with exact input binding and no external effect.';
comment on function public.worker_record_receivables_method_input_assembly_v1(uuid, text, jsonb) is
  'Capability-bound immutable persistence for a TypeScript-validated receivables method input assembly.';
