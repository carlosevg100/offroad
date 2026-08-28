-- The receivables vertical needs the exact deterministic document representation, not a
-- model summary. The bytes remain private and are reachable only through a live worker
-- capability. They are also frozen into the controlled case input before analysis.

create table private.receivables_evidence_fragments (
  organization_id uuid not null,
  intake_session_id uuid not null,
  source_document_id uuid not null,
  document_version integer not null check (document_version > 0),
  processing_run_id uuid not null,
  content_kind text not null check (content_kind in ('document_layer', 'nfe_archive')),
  schema_version text not null check (length(trim(schema_version)) between 3 and 120),
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  codec text not null default 'gzip-json-v1' check (codec = 'gzip-json-v1'),
  uncompressed_bytes bigint not null check (uncompressed_bytes between 2 and 209715200),
  compressed_payload bytea not null check (octet_length(compressed_payload) between 2 and 33554432),
  created_at timestamptz not null default now(),
  primary key (organization_id, intake_session_id, source_document_id, document_version, processing_run_id),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions (organization_id, id) on delete cascade,
  foreign key (organization_id, source_document_id)
    references public.source_documents (organization_id, id) on delete cascade,
  foreign key (organization_id, processing_run_id)
    references public.processing_runs (organization_id, id) on delete cascade
);

create index receivables_evidence_fragments_session_idx
  on private.receivables_evidence_fragments
  (organization_id, intake_session_id, source_document_id, document_version, created_at desc);

revoke all privileges on private.receivables_evidence_fragments from public, anon, authenticated;

create function private.worker_record_receivables_evidence(
  p_job_id uuid,
  p_capability_token text,
  p_content_kind text,
  p_schema_version text,
  p_source_sha256 text,
  p_content_sha256 text,
  p_payload_sha256 text,
  p_uncompressed_bytes bigint,
  p_payload_base64 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  source_row public.source_documents;
  payload bytea;
  existing private.receivables_evidence_fragments;
begin
  if job_row.kind <> 'document_pipeline' then
    raise exception 'document_pipeline_capability_required' using errcode = '42501';
  end if;
  if p_content_kind not in ('document_layer', 'nfe_archive')
    or length(trim(coalesce(p_schema_version, ''))) not between 3 and 120
    or p_source_sha256 !~ '^[a-f0-9]{64}$'
    or p_content_sha256 !~ '^[a-f0-9]{64}$'
    or p_payload_sha256 !~ '^[a-f0-9]{64}$'
    or p_uncompressed_bytes not between 2 and 209715200 then
    raise exception 'invalid_receivables_evidence_contract' using errcode = '22023';
  end if;

  payload := decode(p_payload_base64, 'base64');
  if octet_length(payload) not between 2 and 33554432 then
    raise exception 'receivables_evidence_payload_size_invalid' using errcode = '22023';
  end if;
  if encode(extensions.digest(payload, 'sha256'), 'hex') <> p_payload_sha256 then
    raise exception 'receivables_evidence_payload_hash_mismatch' using errcode = '22023';
  end if;

  select * into source_row
  from public.source_documents source
  where source.organization_id = job_row.organization_id
    and source.intake_session_id = job_row.intake_session_id
    and source.id = (job_row.payload ->> 'source_document_id')::uuid
    and source.document_version = coalesce((job_row.payload ->> 'document_version')::integer, 1)
  for update;
  if not found then
    raise exception 'receivables_evidence_source_not_found' using errcode = 'P0002';
  end if;
  if source_row.sha256 is null or source_row.sha256 <> p_source_sha256 then
    raise exception 'receivables_evidence_source_hash_mismatch' using errcode = '22023';
  end if;

  select * into existing
  from private.receivables_evidence_fragments fragment
  where fragment.organization_id = job_row.organization_id
    and fragment.intake_session_id = job_row.intake_session_id
    and fragment.source_document_id = source_row.id
    and fragment.document_version = source_row.document_version
    and fragment.processing_run_id = job_row.processing_run_id;

  if found then
    if existing.content_kind <> p_content_kind
      or existing.schema_version <> p_schema_version
      or existing.source_sha256 <> p_source_sha256
      or existing.content_sha256 <> p_content_sha256
      or existing.payload_sha256 <> p_payload_sha256
      or existing.uncompressed_bytes <> p_uncompressed_bytes
      or existing.compressed_payload <> payload then
      raise exception 'receivables_evidence_immutable_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'written', false,
      'replayed', true,
      'source_document_id', source_row.id,
      'content_sha256', existing.content_sha256
    );
  end if;

  insert into private.receivables_evidence_fragments (
    organization_id, intake_session_id, source_document_id, document_version,
    processing_run_id, content_kind, schema_version, source_sha256, content_sha256,
    payload_sha256, uncompressed_bytes, compressed_payload
  ) values (
    job_row.organization_id, job_row.intake_session_id, source_row.id, source_row.document_version,
    job_row.processing_run_id, p_content_kind, p_schema_version, p_source_sha256,
    p_content_sha256, p_payload_sha256, p_uncompressed_bytes, payload
  );

  return jsonb_build_object(
    'written', true,
    'replayed', false,
    'source_document_id', source_row.id,
    'content_sha256', p_content_sha256
  );
end;
$$;

create function private.worker_load_receivables_evidence(
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
  fragments jsonb;
begin
  if job_row.kind <> 'case_analysis' then
    raise exception 'case_analysis_capability_required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'source_document_id', chosen.source_document_id::text,
    'document_version', chosen.document_version,
    'content_kind', chosen.content_kind,
    'schema_version', chosen.schema_version,
    'source_sha256', chosen.source_sha256,
    'content_sha256', chosen.content_sha256,
    'payload_sha256', chosen.payload_sha256,
    'codec', chosen.codec,
    'uncompressed_bytes', chosen.uncompressed_bytes,
    'payload_base64', encode(chosen.compressed_payload, 'base64')
  ) order by chosen.source_document_id), '[]'::jsonb)
  into fragments
  from (
    select distinct on (fragment.source_document_id, fragment.document_version) fragment.*
    from private.receivables_evidence_fragments fragment
    join public.source_documents source
      on source.organization_id = fragment.organization_id
     and source.id = fragment.source_document_id
     and source.intake_session_id = fragment.intake_session_id
     and source.document_version = fragment.document_version
    where fragment.organization_id = job_row.organization_id
      and fragment.intake_session_id = job_row.intake_session_id
    order by fragment.source_document_id, fragment.document_version, fragment.created_at desc
  ) chosen;

  return fragments;
end;
$$;

create function public.worker_record_receivables_evidence(
  p_job_id uuid,
  p_capability_token text,
  p_content_kind text,
  p_schema_version text,
  p_source_sha256 text,
  p_content_sha256 text,
  p_payload_sha256 text,
  p_uncompressed_bytes bigint,
  p_payload_base64 text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_record_receivables_evidence(
    p_job_id, p_capability_token, p_content_kind, p_schema_version, p_source_sha256,
    p_content_sha256, p_payload_sha256, p_uncompressed_bytes, p_payload_base64
  );
$$;

create function public.worker_load_receivables_evidence(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_load_receivables_evidence(p_job_id, p_capability_token);
$$;

create function private.worker_load_receivables_provider_context(
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
  programs jsonb;
  observations jsonb;
begin
  if job_row.kind <> 'case_analysis' then
    raise exception 'case_analysis_capability_required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', program.id,
    'provider_id', program.provider_id,
    'provider_legal_name', directory.legal_name,
    'program_name', program.program_name,
    'provider_kind', program.provider_kind,
    'route_ids', program.route_ids,
    'status', program.status,
    'created_at', program.created_at,
    'updated_at', program.updated_at
  ) order by directory.legal_name, program.program_name, program.id), '[]'::jsonb)
  into programs
  from public.capital_provider_programs program
  join public.fund_directory directory on directory.id = program.provider_id
  where program.status in ('mapped', 'confirming', 'active')
    and directory.status not in ('declined', 'inactive');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', observation.id,
    'provider_id', observation.fund_id,
    'program_id', observation.program_id,
    'criterion', observation.criterion,
    'value', observation.value,
    'provenance', observation.provenance,
    'observed_at', observation.observed_at,
    'valid_until', observation.valid_until,
    'note', observation.note,
    'source_url', observation.source_url,
    'recorded_by', observation.recorded_by
  ) order by observation.program_id, observation.criterion, observation.observed_at, observation.id), '[]'::jsonb)
  into observations
  from public.fund_mandate_observations observation
  join public.capital_provider_programs program
    on program.provider_id = observation.fund_id
   and program.id = observation.program_id
  where observation.program_id is not null
    and program.status in ('mapped', 'confirming', 'active');

  return jsonb_build_object('programs', programs, 'observations', observations);
end;
$$;

create function public.worker_load_receivables_provider_context(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_load_receivables_provider_context(p_job_id, p_capability_token);
$$;

create or replace function public.worker_load_case_input(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_load_case_input(p_job_id, p_capability_token)
    || jsonb_build_object('pricing_context', private.worker_load_pricing_context(p_job_id, p_capability_token))
    || jsonb_build_object('market_distribution_context', private.worker_load_market_distribution_context(p_job_id, p_capability_token))
    || jsonb_build_object('red_flag_context', private.worker_load_red_flag_context(p_job_id, p_capability_token))
    || jsonb_build_object('conduct_context', private.worker_load_conduct_context(p_job_id, p_capability_token))
    || jsonb_build_object('receivables_evidence', private.worker_load_receivables_evidence(p_job_id, p_capability_token))
    || jsonb_build_object('receivables_provider_context', private.worker_load_receivables_provider_context(p_job_id, p_capability_token));
$$;

revoke all on function private.worker_record_receivables_evidence(uuid, text, text, text, text, text, text, bigint, text) from public, anon;
revoke all on function private.worker_load_receivables_evidence(uuid, text) from public, anon;
revoke all on function private.worker_load_receivables_provider_context(uuid, text) from public, anon;
revoke all on function public.worker_record_receivables_evidence(uuid, text, text, text, text, text, text, bigint, text) from public, anon;
revoke all on function public.worker_load_receivables_evidence(uuid, text) from public, anon;
revoke all on function public.worker_load_receivables_provider_context(uuid, text) from public, anon;
revoke all on function public.worker_load_case_input(uuid, text) from public, anon;

grant execute on function private.worker_record_receivables_evidence(uuid, text, text, text, text, text, text, bigint, text) to authenticated;
grant execute on function private.worker_load_receivables_evidence(uuid, text) to authenticated;
grant execute on function private.worker_load_receivables_provider_context(uuid, text) to authenticated;
grant execute on function public.worker_record_receivables_evidence(uuid, text, text, text, text, text, text, bigint, text) to authenticated;
grant execute on function public.worker_load_receivables_evidence(uuid, text) to authenticated;
grant execute on function public.worker_load_receivables_provider_context(uuid, text) to authenticated;
grant execute on function public.worker_load_case_input(uuid, text) to authenticated;
