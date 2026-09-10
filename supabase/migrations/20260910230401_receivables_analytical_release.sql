-- The released analytical result of R01. The organization that owns the session can read its own
-- calculation, with sources, gaps and limitations; external direction, financier recommendation and
-- credit approval stay closed and no effect leaves the analysis. Exposure is a per-organization
-- concession written by an operator, exactly like the integration_preview grant: it never travels in
-- source control and it never promotes the method. Everything here is additive; the internal shadow
-- run, its table and its RPC are untouched, so an organization without the grant keeps today's
-- behaviour.

-- ---------------------------------------------------------------------------------------------
-- 1. The grant
-- ---------------------------------------------------------------------------------------------
create table if not exists private.receivables_analytical_release_grants (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled boolean not null default true,
  note text check (note is null or char_length(note) <= 500),
  granted_by text not null check (char_length(trim(granted_by)) between 3 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table private.receivables_analytical_release_grants is
  'Organizations allowed to read their own released R01 receivables analysis. Written by operators, never through the Data API. The grant exposes a calculation; it never authorizes external direction, a financier recommendation or a credit approval.';

revoke all on table private.receivables_analytical_release_grants from public, anon, authenticated;

create or replace function private.receivables_analytical_release_enabled(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.receivables_analytical_release_grants grant_row
    where grant_row.organization_id = p_organization_id
      and grant_row.enabled
  );
$$;

revoke all on function private.receivables_analytical_release_enabled(uuid) from public, anon, authenticated;

-- What the worker may know about the job it holds: whether this organization is granted.
create or replace function private.worker_load_receivables_analytical_release_v1(
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
  grant_row private.receivables_analytical_release_grants;
begin
  if job_row.kind <> 'case_analysis' then
    raise exception 'case_analysis_capability_required' using errcode = '42501';
  end if;
  select stored.* into grant_row
  from private.receivables_analytical_release_grants stored
  where stored.organization_id = job_row.organization_id
    and stored.enabled;
  return jsonb_build_object(
    'granted', found,
    'organizationId', job_row.organization_id,
    'note', grant_row.note
  );
end;
$$;

revoke all on function private.worker_load_receivables_analytical_release_v1(uuid, text) from public, anon;
grant execute on function private.worker_load_receivables_analytical_release_v1(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. The released result, bound to the exact input assembly, dataset and confirmed scope
-- ---------------------------------------------------------------------------------------------
create table if not exists private.receivables_released_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  capital_project_id uuid not null,
  intake_session_id uuid not null,
  processing_run_id uuid not null,
  processing_job_id uuid not null,
  input_assembly_id uuid not null,
  evidence_scope_id uuid not null,
  evidence_scope_fingerprint text not null check (evidence_scope_fingerprint ~ '^[0-9a-f]{64}$'),
  source_dataset_hash text not null check (source_dataset_hash ~ '^[0-9a-f]{64}$'),
  task_id text not null check (task_id = 'R01'),
  executor_key text not null check (executor_key = '@offroad/receivables-analysis#underwriteReceivablesPool'),
  executor_version text not null check (length(trim(executor_version)) between 3 and 120),
  method_maturity text not null check (method_maturity in ('tested', 'ready_for_founder', 'production')),
  input_fingerprint text not null check (input_fingerprint ~ '^[0-9a-f]{64}$'),
  output_fingerprint text not null check (output_fingerprint ~ '^[0-9a-f]{64}$'),
  result_fingerprint text not null check (result_fingerprint ~ '^[0-9a-f]{64}$'),
  artifact jsonb not null check (jsonb_typeof(artifact) = 'object'),
  release jsonb not null check (jsonb_typeof(release) = 'object'),
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
    references private.receivables_method_input_assemblies(organization_id, id) on delete restrict,
  foreign key (organization_id, evidence_scope_id)
    references private.receivables_evidence_scopes(organization_id, id) on delete restrict
);

create index if not exists receivables_released_results_session_idx
  on private.receivables_released_results (
    organization_id, intake_session_id, created_at desc, id desc
  );
create index if not exists receivables_released_results_scope_idx
  on private.receivables_released_results (organization_id, evidence_scope_id);

alter table private.receivables_released_results enable row level security;
alter table private.receivables_released_results force row level security;
drop policy if exists receivables_released_results_deny on private.receivables_released_results;
create policy receivables_released_results_deny on private.receivables_released_results
  as restrictive for all to public using (false) with check (false);
revoke all on table private.receivables_released_results from public, anon, authenticated;

comment on table private.receivables_released_results is
  'Immutable released R01 results, bound to the input assembly, the dataset hash and the confirmed evidence scope. Read only through the tenant reader below; a result whose scope is no longer the confirmed one is reported as superseded and never returned as current.';

-- ---------------------------------------------------------------------------------------------
-- 3. The worker writes it; the database re-checks the policy, the grant and the scope
-- ---------------------------------------------------------------------------------------------
create or replace function private.worker_record_receivables_released_result_v1(
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
  scope_row private.receivables_evidence_scopes;
  inserted_row private.receivables_released_results;
  existing_row private.receivables_released_results;
  v_input_fingerprint text;
  v_output_fingerprint text;
  v_result_fingerprint text;
begin
  if job_row.kind <> 'case_analysis' then
    raise exception 'case_analysis_capability_required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_result) <> 'object'
    or p_result ->> 'mode' <> 'analytical_release'
    or p_result ->> 'taskId' <> 'R01'
    or p_result ->> 'executorKey' <> '@offroad/receivables-analysis#underwriteReceivablesPool'
    or coalesce(p_result ->> 'executorVersion', '') = ''
    or coalesce((p_result ->> 'externalEffectAllowed')::boolean, true)
    or jsonb_typeof(p_result -> 'release') <> 'object'
    or coalesce(p_result #>> '{release,maximumEffect}', '') <> 'none'
    or coalesce(p_result #>> '{release,methodMaturity}', '') not in ('tested', 'ready_for_founder', 'production')
    or jsonb_typeof(p_result #> '{release,allowedUses}') <> 'array'
    or exists (
      select 1 from jsonb_array_elements_text(p_result #> '{release,allowedUses}') use_row
      where use_row in ('external_material', 'external_action')
    )
    or coalesce(p_result #>> '{release,sourceDatasetHash}', '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_result #>> '{release,confirmedScope,fingerprint}', '') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_result -> 'artifact') <> 'object'
    or p_result #>> '{artifact,artifactType}' <> 'receivables_pool_underwriting'
    or p_result #>> '{artifact,status}' <> 'released'
    or coalesce(p_result #>> '{artifact,inputFingerprint}', '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_result #>> '{artifact,outputFingerprint}', '') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_result -> 'qualityResults') <> 'array'
    or jsonb_array_length(p_result -> 'qualityResults') < 1
    or exists (
      select 1 from jsonb_array_elements(p_result -> 'qualityResults') check_row
      where check_row ->> 'status' <> 'passed'
    )
    or octet_length(p_result::text) > 33554432 then
    raise exception 'receivables_released_result_contract_invalid' using errcode = '22023';
  end if;

  if not private.receivables_analytical_release_enabled(job_row.organization_id) then
    raise exception 'receivables_analytical_release_not_granted' using errcode = '42501';
  end if;
  if coalesce(p_result #>> '{release,organizationId}', '') <> job_row.organization_id::text then
    raise exception 'receivables_analytical_release_tenant_mismatch' using errcode = '42501';
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
  if assembly_row.source_dataset_hash <> p_result #>> '{release,sourceDatasetHash}' then
    raise exception 'receivables_analytical_release_dataset_mismatch' using errcode = '22023';
  end if;

  -- The confirmed scope is the only portfolio selection that may reach a released result.
  select stored.* into scope_row
  from private.receivables_evidence_scopes stored
  where stored.organization_id = job_row.organization_id
    and stored.intake_session_id = job_row.intake_session_id
  order by stored.confirmed_at desc, stored.id desc
  limit 1;
  if not found
    or scope_row.id::text <> coalesce(p_result #>> '{release,confirmedScope,id}', '')
    or scope_row.fingerprint <> p_result #>> '{release,confirmedScope,fingerprint}' then
    raise exception 'receivables_analytical_release_scope_mismatch' using errcode = '22023';
  end if;

  v_input_fingerprint := p_result #>> '{artifact,inputFingerprint}';
  v_output_fingerprint := p_result #>> '{artifact,outputFingerprint}';
  v_result_fingerprint := encode(
    extensions.digest(convert_to(p_result::text, 'UTF8'), 'sha256'), 'hex'
  );

  select stored.* into existing_row
  from private.receivables_released_results stored
  where stored.organization_id = job_row.organization_id
    and stored.processing_job_id = job_row.id
    and stored.task_id = 'R01'
    and stored.input_fingerprint = v_input_fingerprint;
  if found then
    if existing_row.result_fingerprint <> v_result_fingerprint then
      raise exception 'receivables_released_result_immutable_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'id', existing_row.id,
      'input_fingerprint', existing_row.input_fingerprint,
      'output_fingerprint', existing_row.output_fingerprint,
      'result_fingerprint', existing_row.result_fingerprint,
      'replayed', true
    );
  end if;

  insert into private.receivables_released_results (
    organization_id, capital_project_id, intake_session_id, processing_run_id, processing_job_id,
    input_assembly_id, evidence_scope_id, evidence_scope_fingerprint, source_dataset_hash,
    task_id, executor_key, executor_version, method_maturity,
    input_fingerprint, output_fingerprint, result_fingerprint, artifact, release, quality_results
  ) values (
    job_row.organization_id, session_row.capital_project_id, job_row.intake_session_id,
    job_row.processing_run_id, job_row.id, assembly_row.id, scope_row.id, scope_row.fingerprint,
    assembly_row.source_dataset_hash, 'R01', p_result ->> 'executorKey',
    p_result ->> 'executorVersion', p_result #>> '{release,methodMaturity}',
    v_input_fingerprint, v_output_fingerprint, v_result_fingerprint,
    p_result -> 'artifact', p_result -> 'release', p_result -> 'qualityResults'
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

create or replace function public.worker_record_receivables_released_result_v1(
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
  select private.worker_record_receivables_released_result_v1(
    p_job_id, p_capability_token, p_input_assembly_id, p_result
  );
$$;

revoke all on function private.worker_record_receivables_released_result_v1(uuid, text, uuid, jsonb)
  from public, anon;
revoke all on function public.worker_record_receivables_released_result_v1(uuid, text, uuid, jsonb)
  from public, anon;
grant execute on function private.worker_record_receivables_released_result_v1(uuid, text, uuid, jsonb)
  to authenticated;
grant execute on function public.worker_record_receivables_released_result_v1(uuid, text, uuid, jsonb)
  to authenticated;

comment on function public.worker_record_receivables_released_result_v1(uuid, text, uuid, jsonb) is
  'Capability-bound immutable persistence of a released R01 result. The database re-checks the organization grant, the tenant, the dataset hash and the confirmed evidence scope before storing anything.';

-- ---------------------------------------------------------------------------------------------
-- 4. The organization reads its own current result, or is told it was superseded
-- ---------------------------------------------------------------------------------------------
create or replace function private.read_receivables_released_result_v1(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  session_row public.document_intake_sessions;
  stored private.receivables_released_results;
  context jsonb;
  current_scope jsonb;
  reason text;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  select session.* into session_row
  from public.document_intake_sessions session
  where session.id = p_session_id
    and private.can_access_capital_project(session.organization_id, session.capital_project_id);
  if not found then
    raise exception 'receivables_released_result_access_denied' using errcode = '42501';
  end if;
  if not private.receivables_analytical_release_enabled(session_row.organization_id) then
    return jsonb_build_object('schemaVersion', 'receivables-released-result.v1', 'state', 'not_granted', 'result', null);
  end if;

  select released.* into stored
  from private.receivables_released_results released
  where released.organization_id = session_row.organization_id
    and released.intake_session_id = session_row.id
  order by released.created_at desc, released.id desc
  limit 1;
  if not found then
    return jsonb_build_object('schemaVersion', 'receivables-released-result.v1', 'state', 'absent', 'result', null);
  end if;

  context := private.receivables_evidence_scope_context(session_row.organization_id, session_row.id);
  current_scope := context -> 'scope';
  reason := case
    when session_row.current_run_id is distinct from stored.processing_run_id then 'run_replaced'
    when coalesce(context ->> 'state', '') <> 'current' then 'scope_stale'
    when coalesce(current_scope ->> 'fingerprint', '') <> stored.evidence_scope_fingerprint then 'scope_replaced'
    when coalesce(current_scope ->> 'sourceManifestFingerprint', '') <> coalesce(context #>> '{sourceManifest,fingerprint}', '') then 'sources_changed'
    else null
  end;
  if reason is not null then
    -- A result computed for another selection or another run is history, never the current answer.
    return jsonb_build_object(
      'schemaVersion', 'receivables-released-result.v1',
      'state', 'superseded',
      'supersededReason', reason,
      'previous', jsonb_build_object(
        'createdAt', stored.created_at,
        'outputFingerprint', stored.output_fingerprint,
        'evidenceScopeFingerprint', stored.evidence_scope_fingerprint,
        'sourceDatasetHash', stored.source_dataset_hash
      ),
      'result', null
    );
  end if;

  return jsonb_build_object(
    'schemaVersion', 'receivables-released-result.v1',
    'state', 'current',
    'supersededReason', null,
    'result', jsonb_build_object(
      'id', stored.id,
      'createdAt', stored.created_at,
      'taskId', stored.task_id,
      'executorKey', stored.executor_key,
      'executorVersion', stored.executor_version,
      'methodMaturity', stored.method_maturity,
      'evidenceScope', jsonb_build_object('id', stored.evidence_scope_id, 'fingerprint', stored.evidence_scope_fingerprint),
      'sourceDatasetHash', stored.source_dataset_hash,
      'inputFingerprint', stored.input_fingerprint,
      'outputFingerprint', stored.output_fingerprint,
      'release', stored.release,
      'artifact', stored.artifact,
      'qualityResults', stored.quality_results
    )
  );
end;
$$;

create or replace function public.read_receivables_released_result_v1(p_session_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.read_receivables_released_result_v1(p_session_id);
$$;

revoke all on function private.read_receivables_released_result_v1(uuid) from public, anon;
revoke all on function public.read_receivables_released_result_v1(uuid) from public, anon;
grant execute on function private.read_receivables_released_result_v1(uuid) to authenticated;
grant execute on function public.read_receivables_released_result_v1(uuid) to authenticated;

comment on function public.read_receivables_released_result_v1(uuid) is
  'The caller organization''s own current released R01 result, or the explicit superseded state when the confirmed scope, the sources or the run changed. Returns nothing about another organization and grants nothing.';

-- ---------------------------------------------------------------------------------------------
-- 5. The worker learns about its own grant with the rest of the case input
-- ---------------------------------------------------------------------------------------------
do $migration$
declare
  definition text;
  needle text := '    || jsonb_build_object(''match_provider_context'', private.worker_load_match_provider_context(p_job_id, p_capability_token))';
begin
  definition := pg_get_functiondef('private.worker_load_case_bundle_before_scope(uuid,text)'::regprocedure);
  if position('receivables_analytical_release' in definition) > 0 then
    return;
  end if;
  if position(needle in definition) = 0 then
    raise exception 'receivables_analytical_release_case_bundle_drift';
  end if;
  execute replace(
    definition,
    needle,
    needle || E'\n    || jsonb_build_object(''receivables_analytical_release'', private.worker_load_receivables_analytical_release_v1(p_job_id, p_capability_token))'
  );
end;
$migration$;
