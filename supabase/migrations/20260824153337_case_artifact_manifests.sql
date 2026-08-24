-- Immutable provenance for every persisted case snapshot.
--
-- The mutable session row keeps the latest snapshot for fast rendering. This table keeps the
-- append-only record of which source bytes, model calls and governed versions produced it.

create table public.case_artifact_manifests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  intake_session_id uuid not null,
  processing_run_id uuid,
  schema_version text not null,
  locale text not null check (locale in ('pt-BR', 'en-US')),
  input_fingerprint text not null check (input_fingerprint ~ '^[0-9a-f]{64}$'),
  manifest_fingerprint text not null check (manifest_fingerprint ~ '^[0-9a-f]{64}$'),
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, manifest_fingerprint),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions(organization_id, id) on delete cascade,
  foreign key (organization_id, processing_run_id)
    references public.processing_runs(organization_id, id) on delete restrict
);

create index case_artifact_manifests_session_created_idx
  on public.case_artifact_manifests (organization_id, intake_session_id, created_at desc);

alter table public.case_artifact_manifests enable row level security;
alter table public.case_artifact_manifests force row level security;

create policy case_artifact_manifests_select
  on public.case_artifact_manifests for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));

create trigger case_artifact_manifests_audit
  after insert or update or delete on public.case_artifact_manifests
  for each row execute function private.capture_audit_event();

revoke all privileges on public.case_artifact_manifests from anon, authenticated;
grant select on public.case_artifact_manifests to authenticated;

create or replace function private.read_processing_model_lineage(
  p_organization_id uuid,
  p_session_id uuid,
  p_processing_run_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  captured jsonb;
  expected_calls bigint;
begin
  if (select auth.uid()) is null
    or not (select private.is_org_type_member(p_organization_id, array['company', 'originator', 'offroad'])) then
    raise exception 'organization_access_denied' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.document_intake_sessions session
    where session.organization_id = p_organization_id and session.id = p_session_id
  ) then
    raise exception 'intake_session_not_found' using errcode = 'P0002';
  end if;

  if p_processing_run_id is not null and not exists (
    select 1 from public.processing_runs run
    where run.organization_id = p_organization_id
      and run.intake_session_id = p_session_id
      and run.id = p_processing_run_id
  ) then
    raise exception 'processing_run_not_in_session' using errcode = '22023';
  end if;

  select coalesce(
    jsonb_agg(call.value order by job.created_at, call.ordinality)
      filter (where call.value is not null),
    '[]'::jsonb
  )
  into captured
  from public.processing_jobs job
  left join lateral jsonb_array_elements(
    case
      when jsonb_typeof(job.result -> 'model_lineage') = 'array' then job.result -> 'model_lineage'
      when jsonb_typeof(job.last_error -> 'model_lineage') = 'array' then job.last_error -> 'model_lineage'
      else '[]'::jsonb
    end
  ) with ordinality as call(value, ordinality) on true
  where job.organization_id = p_organization_id
    and job.intake_session_id = p_session_id
    and (p_processing_run_id is null or job.processing_run_id = p_processing_run_id);

  select coalesce(sum(job.model_calls), 0)
  into expected_calls
  from public.processing_jobs job
  where job.organization_id = p_organization_id
    and job.intake_session_id = p_session_id
    and (p_processing_run_id is null or job.processing_run_id = p_processing_run_id);

  return jsonb_build_object(
    'calls', coalesce(captured, '[]'::jsonb),
    'expected_calls', coalesce(expected_calls, 0),
    'captured_calls', jsonb_array_length(coalesce(captured, '[]'::jsonb))
  );
end;
$$;

create or replace function public.read_processing_model_lineage(
  p_organization_id uuid,
  p_session_id uuid,
  p_processing_run_id uuid default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.read_processing_model_lineage(p_organization_id, p_session_id, p_processing_run_id);
$$;

create or replace function private.record_case_snapshot(
  p_organization_id uuid,
  p_session_id uuid,
  p_processing_run_id uuid,
  p_manifest jsonb,
  p_case_state jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
  manifest_id uuid;
  v_manifest_fingerprint text := p_manifest ->> 'manifestFingerprint';
  v_input_fingerprint text := p_manifest ->> 'inputFingerprint';
  v_schema_version text := p_manifest ->> 'schemaVersion';
begin
  session_row := private.intake_session_for_update(p_organization_id, p_session_id);
  if session_row.status = 'confirmed' then
    raise exception 'intake_session_already_confirmed' using errcode = '55000';
  end if;
  if jsonb_typeof(p_manifest) <> 'object' or jsonb_typeof(p_case_state) <> 'object' then
    raise exception 'case_snapshot_must_be_objects' using errcode = '22023';
  end if;
  if v_manifest_fingerprint !~ '^[0-9a-f]{64}$' or v_input_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'case_snapshot_invalid_fingerprint' using errcode = '22023';
  end if;
  if coalesce(v_schema_version, '') = '' then
    raise exception 'case_snapshot_schema_version_required' using errcode = '22023';
  end if;
  if p_manifest ->> 'caseId' <> p_session_id::text then
    raise exception 'case_snapshot_session_mismatch' using errcode = '22023';
  end if;
  if p_manifest ->> 'locale' <> session_row.locale then
    raise exception 'case_snapshot_locale_mismatch' using errcode = '22023';
  end if;
  if p_processing_run_id is not null and not exists (
    select 1 from public.processing_runs run
    where run.organization_id = p_organization_id
      and run.intake_session_id = p_session_id
      and run.id = p_processing_run_id
  ) then
    raise exception 'processing_run_not_in_session' using errcode = '22023';
  end if;
  if p_processing_run_id is not null and p_manifest ->> 'runId' <> p_processing_run_id::text then
    raise exception 'case_snapshot_run_mismatch' using errcode = '22023';
  end if;

  insert into public.case_artifact_manifests (
    organization_id, intake_session_id, processing_run_id, schema_version, locale,
    input_fingerprint, manifest_fingerprint, manifest, created_by
  ) values (
    p_organization_id, p_session_id, p_processing_run_id, v_schema_version, session_row.locale,
    v_input_fingerprint, v_manifest_fingerprint, p_manifest, actor_id
  )
  on conflict (organization_id, manifest_fingerprint) do nothing
  returning id into manifest_id;

  if manifest_id is null then
    select id into manifest_id
    from public.case_artifact_manifests stored
    where stored.organization_id = p_organization_id
      and stored.manifest_fingerprint = v_manifest_fingerprint;
  end if;

  update public.document_intake_sessions
  set result_summary = result_summary || jsonb_build_object(
    'case_state', p_case_state,
    'case_manifest', jsonb_build_object(
      'id', manifest_id,
      'fingerprint', v_manifest_fingerprint,
      'input_fingerprint', v_input_fingerprint,
      'schema_version', v_schema_version
    )
  )
  where organization_id = p_organization_id and id = p_session_id;

  return manifest_id;
end;
$$;

create or replace function public.record_case_snapshot(
  p_organization_id uuid,
  p_session_id uuid,
  p_processing_run_id uuid,
  p_manifest jsonb,
  p_case_state jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.record_case_snapshot(
    p_organization_id, p_session_id, p_processing_run_id, p_manifest, p_case_state
  );
$$;

revoke all on function private.read_processing_model_lineage(uuid, uuid, uuid) from public;
revoke all on function public.read_processing_model_lineage(uuid, uuid, uuid) from public;
revoke all on function private.record_case_snapshot(uuid, uuid, uuid, jsonb, jsonb) from public;
revoke all on function public.record_case_snapshot(uuid, uuid, uuid, jsonb, jsonb) from public;

grant execute on function private.read_processing_model_lineage(uuid, uuid, uuid) to authenticated;
grant execute on function public.read_processing_model_lineage(uuid, uuid, uuid) to authenticated;
grant execute on function private.record_case_snapshot(uuid, uuid, uuid, jsonb, jsonb) to authenticated;
grant execute on function public.record_case_snapshot(uuid, uuid, uuid, jsonb, jsonb) to authenticated;
