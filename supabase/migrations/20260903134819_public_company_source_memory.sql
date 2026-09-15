-- A company-centric index over reusable public sources. This is deliberately separate from every
-- tenant/project memory: it has no organization, user, project, conversation or document columns.
-- Only a live capability for a public-information capital project may read or update it.

create table private.public_company_source_memory (
  company_key text primary key,
  schema_version text not null,
  subject jsonb not null,
  query_ids jsonb not null,
  sources jsonb not null,
  stored_at timestamptz not null,
  valid_until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_accessed_at timestamptz,
  hit_count bigint not null default 0,
  constraint public_company_source_memory_key_check check (company_key ~ '^[0-9a-f]{64}$'),
  constraint public_company_source_memory_schema_check check (schema_version = 'public-company-memory.v1'),
  constraint public_company_source_memory_subject_check check (jsonb_typeof(subject) = 'object'),
  constraint public_company_source_memory_query_ids_check
    check (jsonb_typeof(query_ids) = 'array' and jsonb_array_length(query_ids) between 1 and 60),
  constraint public_company_source_memory_sources_check
    check (jsonb_typeof(sources) = 'array' and jsonb_array_length(sources) between 1 and 120),
  constraint public_company_source_memory_ttl_check
    check (valid_until > stored_at and valid_until <= stored_at + interval '90 days'),
  constraint public_company_source_memory_hit_count_check check (hit_count >= 0)
);

create index public_company_source_memory_expiry_idx
  on private.public_company_source_memory (valid_until);

revoke all privileges on table private.public_company_source_memory from public, anon, authenticated;

create or replace function private.worker_public_company_memory_job(
  p_job_id uuid,
  p_capability_token text
)
returns public.processing_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
begin
  if job_row.kind <> 'capital_project_analysis'
    or not exists (
      select 1 from public.capital_projects project
      where project.organization_id = job_row.organization_id
        and project.id::text = job_row.payload ->> 'capital_project_id'
        and project.access_basis = 'public_information'
    ) then
    raise exception 'public_company_memory_capability_required' using errcode = '42501';
  end if;
  return job_row;
end;
$$;

create or replace function private.worker_load_public_company_memory(
  p_job_id uuid,
  p_capability_token text,
  p_company_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ignored_job public.processing_jobs := private.worker_public_company_memory_job(p_job_id, p_capability_token);
  result jsonb;
begin
  if p_company_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_public_company_key' using errcode = '22023';
  end if;

  with selected as (
    select memory.*
    from private.public_company_source_memory memory
    where memory.company_key = p_company_key
      and memory.schema_version = 'public-company-memory.v1'
      and memory.valid_until > now()
    for update
  ), touched as (
    update private.public_company_source_memory memory
    set last_accessed_at = now(), hit_count = memory.hit_count + 1
    from selected
    where memory.company_key = selected.company_key
    returning selected.*
  )
  select jsonb_build_object(
    'schemaVersion', touched.schema_version,
    'companyKey', touched.company_key,
    'subject', touched.subject,
    'queryIds', touched.query_ids,
    'sources', touched.sources,
    'storedAt', to_char(touched.stored_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'validUntil', to_char(touched.valid_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'reusePolicy', 'public_company_sources_only'
  ) into result from touched;
  return result;
end;
$$;

create or replace function private.worker_store_public_company_memory(
  p_job_id uuid,
  p_capability_token text,
  p_record jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ignored_job public.processing_jobs := private.worker_public_company_memory_job(p_job_id, p_capability_token);
  subject_record jsonb := p_record -> 'subject';
  source_record jsonb;
  query_id_record jsonb;
  input_stored_at timestamptz;
  input_valid_until timestamptz;
begin
  if jsonb_typeof(p_record) <> 'object'
    or p_record - array['schemaVersion','companyKey','subject','queryIds','sources','storedAt','validUntil','reusePolicy']::text[] <> '{}'::jsonb
    or p_record ->> 'schemaVersion' <> 'public-company-memory.v1'
    or p_record ->> 'reusePolicy' <> 'public_company_sources_only'
    or coalesce(p_record ->> 'companyKey', '') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(subject_record) <> 'object'
    or subject_record - array['legalName','website','sector','geography']::text[] <> '{}'::jsonb
    or char_length(trim(coalesce(subject_record ->> 'legalName', ''))) not between 2 and 200
    or coalesce(subject_record ->> 'legalName', '') ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}'
    or coalesce(subject_record ->> 'legalName', '') ~ '[0-9]{11,14}'
    or (subject_record ? 'website' and coalesce(subject_record ->> 'website', '') !~ '^https://')
    or jsonb_typeof(coalesce(p_record -> 'queryIds', 'null'::jsonb)) <> 'array'
    or jsonb_array_length(p_record -> 'queryIds') not between 1 and 60
    or jsonb_typeof(coalesce(p_record -> 'sources', 'null'::jsonb)) <> 'array'
    or jsonb_array_length(p_record -> 'sources') not between 1 and 120 then
    raise exception 'invalid_public_company_memory_contract' using errcode = '22023';
  end if;

  for query_id_record in select value from jsonb_array_elements(p_record -> 'queryIds') loop
    if jsonb_typeof(query_id_record) <> 'string'
      or trim(both '"' from query_id_record::text) !~ '^[0-9a-f]{64}$' then
      raise exception 'invalid_public_company_memory_query_id' using errcode = '22023';
    end if;
  end loop;

  for source_record in select value from jsonb_array_elements(p_record -> 'sources') loop
    if jsonb_typeof(source_record) <> 'object'
      or source_record - array[
        'provider','topic','title','url','snippet','publishedAt','retrievedAt','contentHash','contentAcquisition'
      ]::text[] <> '{}'::jsonb
      or coalesce(source_record ->> 'provider', '') not in ('perplexity', 'openai', 'official', 'mcp')
      or coalesce(source_record ->> 'topic', '') not in ('identity', 'news', 'sector', 'regulation', 'market')
      or coalesce(source_record ->> 'url', '') !~ '^https://'
      or coalesce(source_record ->> 'contentHash', '') !~ '^[0-9a-f]{64}$'
      or char_length(trim(coalesce(source_record ->> 'title', ''))) not between 1 and 500
      or char_length(coalesce(source_record ->> 'snippet', '')) > 8000
      or (
        source_record ? 'contentAcquisition'
        and (
          jsonb_typeof(source_record -> 'contentAcquisition') <> 'object'
          or (source_record -> 'contentAcquisition') - array[
            'acquiredBy','finalUrl','retrievedAt','byteSize','contentHash'
          ]::text[] <> '{}'::jsonb
          or coalesce(source_record #>> '{contentAcquisition,acquiredBy}', '') not in ('direct_https', 'firecrawl')
          or coalesce(source_record #>> '{contentAcquisition,finalUrl}', '') !~ '^https://'
          or coalesce(source_record #>> '{contentAcquisition,contentHash}', '') !~ '^[0-9a-f]{64}$'
          or coalesce(source_record #>> '{contentAcquisition,byteSize}', '') !~ '^[0-9]+$'
        )
      ) then
      raise exception 'invalid_public_company_memory_source' using errcode = '22023';
    end if;
    begin
      perform (source_record ->> 'retrievedAt')::timestamptz;
      if source_record ? 'contentAcquisition' then
        perform (source_record #>> '{contentAcquisition,retrievedAt}')::timestamptz;
      end if;
    exception when others then
      raise exception 'invalid_public_company_memory_source_time' using errcode = '22023';
    end;
  end loop;

  begin
    input_stored_at := (p_record ->> 'storedAt')::timestamptz;
    input_valid_until := (p_record ->> 'validUntil')::timestamptz;
  exception when others then
    raise exception 'invalid_public_company_memory_time' using errcode = '22023';
  end;
  if input_stored_at > now() + interval '5 minutes'
    or input_stored_at < now() - interval '1 day'
    or input_valid_until <= input_stored_at
    or input_valid_until > input_stored_at + interval '90 days' then
    raise exception 'invalid_public_company_memory_time' using errcode = '22023';
  end if;

  insert into private.public_company_source_memory (
    company_key, schema_version, subject, query_ids, sources, stored_at, valid_until
  ) values (
    p_record ->> 'companyKey', 'public-company-memory.v1', subject_record,
    p_record -> 'queryIds', p_record -> 'sources', input_stored_at, input_valid_until
  )
  on conflict (company_key) do update
  set subject = excluded.subject,
      query_ids = excluded.query_ids,
      sources = excluded.sources,
      stored_at = excluded.stored_at,
      valid_until = excluded.valid_until,
      updated_at = now()
  where private.public_company_source_memory.stored_at <= excluded.stored_at;

  return jsonb_build_object(
    'companyKey', p_record ->> 'companyKey',
    'reusePolicy', 'public_company_sources_only'
  );
end;
$$;

create or replace function public.worker_load_public_company_memory(
  p_job_id uuid,
  p_capability_token text,
  p_company_key text
)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.worker_load_public_company_memory(p_job_id, p_capability_token, p_company_key); $$;

create or replace function public.worker_store_public_company_memory(
  p_job_id uuid,
  p_capability_token text,
  p_record jsonb
)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.worker_store_public_company_memory(p_job_id, p_capability_token, p_record); $$;

revoke all on function private.worker_public_company_memory_job(uuid, text) from public, anon, authenticated;
revoke all on function private.worker_load_public_company_memory(uuid, text, text) from public, anon, authenticated;
revoke all on function private.worker_store_public_company_memory(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.worker_load_public_company_memory(uuid, text, text) from public, anon;
revoke all on function public.worker_store_public_company_memory(uuid, text, jsonb) from public, anon;
grant execute on function private.worker_load_public_company_memory(uuid, text, text) to authenticated;
grant execute on function private.worker_store_public_company_memory(uuid, text, jsonb) to authenticated;
grant execute on function public.worker_load_public_company_memory(uuid, text, text) to authenticated;
grant execute on function public.worker_store_public_company_memory(uuid, text, jsonb) to authenticated;

comment on table private.public_company_source_memory is
  'Global, company-centric catalog of public source material only. It never contains tenant, project, conversation, upload, conclusion or user context.';
