-- Incremental evidence and user confirmations must survive across chat turns without becoming
-- unaudited facts. Store every patch and every resulting draft outside the Data API, bound to the
-- exact project, immutable pool dataset and live worker capability.

create table private.receivables_method_supplement_patches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  capital_project_id uuid not null,
  intake_session_id uuid not null,
  processing_run_id uuid not null,
  processing_job_id uuid not null,
  source_dataset_hash text not null check (source_dataset_hash ~ '^[0-9a-f]{64}$'),
  patch_id text not null check (length(trim(patch_id)) between 1 and 160),
  patch_fingerprint text not null check (patch_fingerprint ~ '^[0-9a-f]{64}$'),
  patch jsonb not null check (jsonb_typeof(patch) = 'object'),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, intake_session_id, source_dataset_hash, patch_id),
  foreign key (organization_id, capital_project_id)
    references public.capital_projects(organization_id, id) on delete cascade,
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions(organization_id, id) on delete cascade,
  foreign key (organization_id, processing_run_id)
    references public.processing_runs(organization_id, id) on delete restrict,
  foreign key (organization_id, processing_job_id)
    references public.processing_jobs(organization_id, id) on delete restrict
);

create table private.receivables_method_supplement_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  capital_project_id uuid not null,
  intake_session_id uuid not null,
  source_dataset_hash text not null check (source_dataset_hash ~ '^[0-9a-f]{64}$'),
  revision integer not null check (revision > 0),
  draft_fingerprint text not null check (draft_fingerprint ~ '^[0-9a-f]{64}$'),
  caused_by_patch_id uuid not null,
  draft jsonb not null check (jsonb_typeof(draft) = 'object'),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, intake_session_id, source_dataset_hash, revision),
  foreign key (organization_id, capital_project_id)
    references public.capital_projects(organization_id, id) on delete cascade,
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions(organization_id, id) on delete cascade,
  foreign key (organization_id, caused_by_patch_id)
    references private.receivables_method_supplement_patches(organization_id, id) on delete restrict
);

create index receivables_method_supplement_patches_session_idx
  on private.receivables_method_supplement_patches (
    organization_id, intake_session_id, source_dataset_hash, created_at, id
  );
create index receivables_method_supplement_drafts_latest_idx
  on private.receivables_method_supplement_drafts (
    organization_id, intake_session_id, source_dataset_hash, revision desc
  );

revoke all privileges on private.receivables_method_supplement_patches from public, anon, authenticated;
revoke all privileges on private.receivables_method_supplement_drafts from public, anon, authenticated;

create or replace function private.worker_apply_receivables_method_supplement_patch_v1(
  p_job_id uuid,
  p_capability_token text,
  p_patch jsonb,
  p_next_draft jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  session_row public.document_intake_sessions;
  prior_draft private.receivables_method_supplement_drafts;
  existing_patch private.receivables_method_supplement_patches;
  stored_patch private.receivables_method_supplement_patches;
  stored_draft private.receivables_method_supplement_drafts;
  dataset_hash text := p_patch ->> 'sourceDatasetHash';
  patch_key text := p_patch ->> 'patchId';
  patch_fingerprint text;
  draft_fingerprint text;
begin
  if job_row.kind not in ('case_analysis', 'agent_operation_brief') then
    raise exception 'receivables_supplement_capability_required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_patch) <> 'object'
    or p_patch ->> 'schemaVersion' <> '2026.09.07-v1'
    or coalesce(dataset_hash, '') !~ '^[0-9a-f]{64}$'
    or length(trim(coalesce(patch_key, ''))) not between 1 and 160
    or jsonb_typeof(p_patch -> 'suppliedBy') <> 'object'
    or jsonb_typeof(p_patch #> '{suppliedBy,evidence}') <> 'array'
    or jsonb_array_length(p_patch #> '{suppliedBy,evidence}') < 1
    or jsonb_typeof(p_patch -> 'sections') <> 'object'
    or jsonb_typeof(p_patch -> 'evidence') <> 'object'
    or octet_length(p_patch::text) > 33554432 then
    raise exception 'receivables_supplement_patch_contract_invalid' using errcode = '22023';
  end if;
  if jsonb_typeof(p_next_draft) <> 'object'
    or p_next_draft ->> 'schemaVersion' <> '2026.09.07-v1'
    or p_next_draft ->> 'sourceDatasetHash' <> dataset_hash
    or coalesce((p_next_draft ->> 'revision')::integer, -1) < 1
    or jsonb_typeof(p_next_draft -> 'appliedPatchIds') <> 'array'
    or not (p_next_draft -> 'appliedPatchIds' @> jsonb_build_array(patch_key))
    or jsonb_typeof(p_next_draft -> 'sections') <> 'object'
    or jsonb_typeof(p_next_draft -> 'evidence') <> 'object'
    or jsonb_typeof(p_next_draft -> 'conflicts') <> 'array'
    or octet_length(p_next_draft::text) > 67108864 then
    raise exception 'receivables_supplement_draft_contract_invalid' using errcode = '22023';
  end if;

  select session.* into session_row
  from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id
    and session.id = job_row.intake_session_id
  for update;
  if not found or session_row.capital_project_id is null then
    raise exception 'case_project_binding_required' using errcode = '55000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    job_row.organization_id::text || ':' || job_row.intake_session_id::text || ':' || dataset_hash, 0
  ));
  patch_fingerprint := encode(extensions.digest(convert_to(p_patch::text, 'UTF8'), 'sha256'), 'hex');
  draft_fingerprint := encode(extensions.digest(convert_to(p_next_draft::text, 'UTF8'), 'sha256'), 'hex');

  select patch.* into existing_patch
  from private.receivables_method_supplement_patches patch
  where patch.organization_id = job_row.organization_id
    and patch.intake_session_id = job_row.intake_session_id
    and patch.source_dataset_hash = dataset_hash
    and patch.patch_id = patch_key;
  if found then
    if existing_patch.patch_fingerprint <> patch_fingerprint then
      raise exception 'receivables_supplement_patch_immutable_conflict' using errcode = '23505';
    end if;
    select draft.* into stored_draft
    from private.receivables_method_supplement_drafts draft
    where draft.organization_id = job_row.organization_id
      and draft.caused_by_patch_id = existing_patch.id;
    if not found or stored_draft.draft_fingerprint <> draft_fingerprint then
      raise exception 'receivables_supplement_patch_replay_draft_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'patch_id', existing_patch.id, 'draft_id', stored_draft.id,
      'revision', stored_draft.revision, 'draft_fingerprint', stored_draft.draft_fingerprint,
      'replayed', true
    );
  end if;

  select draft.* into prior_draft
  from private.receivables_method_supplement_drafts draft
  where draft.organization_id = job_row.organization_id
    and draft.intake_session_id = job_row.intake_session_id
    and draft.source_dataset_hash = dataset_hash
  order by draft.revision desc
  limit 1;
  if found then
    if (p_next_draft ->> 'revision')::integer <> prior_draft.revision + 1
      or not ((prior_draft.draft -> 'appliedPatchIds') <@ (p_next_draft -> 'appliedPatchIds')) then
      raise exception 'receivables_supplement_draft_stale' using errcode = '40001';
    end if;
  elsif (p_next_draft ->> 'revision')::integer <> 1 then
    raise exception 'receivables_supplement_draft_stale' using errcode = '40001';
  end if;

  insert into private.receivables_method_supplement_patches (
    organization_id, capital_project_id, intake_session_id, processing_run_id,
    processing_job_id, source_dataset_hash, patch_id, patch_fingerprint, patch
  ) values (
    job_row.organization_id, session_row.capital_project_id, job_row.intake_session_id,
    job_row.processing_run_id, job_row.id, dataset_hash, patch_key, patch_fingerprint, p_patch
  ) returning * into stored_patch;

  insert into private.receivables_method_supplement_drafts (
    organization_id, capital_project_id, intake_session_id, source_dataset_hash,
    revision, draft_fingerprint, caused_by_patch_id, draft
  ) values (
    job_row.organization_id, session_row.capital_project_id, job_row.intake_session_id,
    dataset_hash, (p_next_draft ->> 'revision')::integer, draft_fingerprint,
    stored_patch.id, p_next_draft
  ) returning * into stored_draft;

  return jsonb_build_object(
    'patch_id', stored_patch.id, 'draft_id', stored_draft.id,
    'revision', stored_draft.revision, 'draft_fingerprint', stored_draft.draft_fingerprint,
    'replayed', false
  );
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'receivables_supplement_contract_invalid' using errcode = '22023';
end;
$$;

create or replace function private.worker_load_receivables_method_supplement_draft_v1(
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
  stored private.receivables_method_supplement_drafts;
begin
  if job_row.kind not in ('case_analysis', 'agent_operation_brief') then
    raise exception 'receivables_supplement_capability_required' using errcode = '42501';
  end if;
  select draft.* into stored
  from private.receivables_method_supplement_drafts draft
  where draft.organization_id = job_row.organization_id
    and draft.intake_session_id = job_row.intake_session_id
  order by draft.created_at desc, draft.revision desc, draft.id desc
  limit 1;
  if not found then return null; end if;
  return jsonb_build_object(
    'id', stored.id, 'source_dataset_hash', stored.source_dataset_hash,
    'revision', stored.revision, 'draft_fingerprint', stored.draft_fingerprint,
    'draft', stored.draft
  );
end;
$$;

create or replace function public.worker_apply_receivables_method_supplement_patch_v1(
  p_job_id uuid, p_capability_token text, p_patch jsonb, p_next_draft jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_apply_receivables_method_supplement_patch_v1(
    p_job_id, p_capability_token, p_patch, p_next_draft
  );
$$;

create or replace function public.worker_load_receivables_method_supplement_draft_v1(
  p_job_id uuid, p_capability_token text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_load_receivables_method_supplement_draft_v1(p_job_id, p_capability_token);
$$;

revoke all on function private.worker_apply_receivables_method_supplement_patch_v1(uuid, text, jsonb, jsonb) from public, anon;
revoke all on function private.worker_load_receivables_method_supplement_draft_v1(uuid, text) from public, anon;
revoke all on function public.worker_apply_receivables_method_supplement_patch_v1(uuid, text, jsonb, jsonb) from public, anon;
revoke all on function public.worker_load_receivables_method_supplement_draft_v1(uuid, text) from public, anon;
grant execute on function private.worker_apply_receivables_method_supplement_patch_v1(uuid, text, jsonb, jsonb) to authenticated;
grant execute on function private.worker_load_receivables_method_supplement_draft_v1(uuid, text) to authenticated;
grant execute on function public.worker_apply_receivables_method_supplement_patch_v1(uuid, text, jsonb, jsonb) to authenticated;
grant execute on function public.worker_load_receivables_method_supplement_draft_v1(uuid, text) to authenticated;

-- Attach only the latest private draft to the already capability-scoped case input.
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
    || jsonb_build_object('receivables_method_supplement_draft', private.worker_load_receivables_method_supplement_draft_v1(p_job_id, p_capability_token))
    || jsonb_build_object('deal_workflow', private.worker_load_deal_workflow_state(p_job_id, p_capability_token))
    || jsonb_build_object('deal_state_context', private.worker_load_deal_state_context(p_job_id, p_capability_token))
    || jsonb_build_object('match_provider_context', private.worker_load_match_provider_context(p_job_id, p_capability_token))
  from base;
$$;

revoke all on function public.worker_load_case_input(uuid, text) from public, anon;
grant execute on function public.worker_load_case_input(uuid, text) to authenticated;

comment on table private.receivables_method_supplement_patches is
  'Append-only, capability-bound evidence and confirmation patches for the R01 method input.';
comment on table private.receivables_method_supplement_drafts is
  'Immutable revisions of the reconciled R01 supplement draft; only complete, conflict-free drafts may compile.';
