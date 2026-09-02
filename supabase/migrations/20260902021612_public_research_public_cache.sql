-- Cross-project reuse is deliberately limited to public raw research material. The cache has no
-- organization, user, conversation, document or project columns and is not exposed through the
-- Data API. A worker can reach it only while holding a live per-job capability.

create table private.public_research_query_cache (
  query_id text not null,
  schema_version text not null,
  query jsonb not null,
  sources jsonb not null,
  stored_at timestamptz not null,
  valid_until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_accessed_at timestamptz,
  hit_count bigint not null default 0,
  primary key (query_id, schema_version),
  constraint public_research_query_cache_query_id_check
    check (query_id ~ '^[0-9a-f]{64}$'),
  constraint public_research_query_cache_schema_check
    check (schema_version = 'public-research-cache.v1'),
  constraint public_research_query_cache_query_object_check
    check (jsonb_typeof(query) = 'object'),
  constraint public_research_query_cache_sources_array_check
    check (jsonb_typeof(sources) = 'array' and jsonb_array_length(sources) between 1 and 10),
  constraint public_research_query_cache_ttl_check
    check (valid_until > stored_at and valid_until <= stored_at + interval '90 days'),
  constraint public_research_query_cache_hit_count_check
    check (hit_count >= 0)
);

create index public_research_query_cache_expiry_idx
  on private.public_research_query_cache (valid_until);

revoke all privileges on table private.public_research_query_cache from public, anon, authenticated;

create or replace function private.worker_load_public_research_cache(
  p_job_id uuid,
  p_capability_token text,
  p_query_ids text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  query_id text;
  result jsonb;
begin
  if job_row.kind <> 'capital_project_analysis'
    or not exists (
      select 1 from public.capital_projects project
      where project.organization_id = job_row.organization_id
        and project.id::text = job_row.payload ->> 'capital_project_id'
        and project.access_basis = 'public_information'
    ) then
    raise exception 'research_capability_required' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_query_ids), 0) not between 1 and 12 then
    raise exception 'invalid_public_research_cache_query' using errcode = '22023';
  end if;
  foreach query_id in array p_query_ids loop
    if query_id !~ '^[0-9a-f]{64}$' then
      raise exception 'invalid_public_research_cache_query' using errcode = '22023';
    end if;
  end loop;

  with selected as (
    select cache.query_id, cache.schema_version, cache.query, cache.sources,
      cache.stored_at, cache.valid_until
    from private.public_research_query_cache cache
    where cache.schema_version = 'public-research-cache.v1'
      and cache.query_id = any(p_query_ids)
      and cache.valid_until > now()
    for update
  ), touched as (
    update private.public_research_query_cache cache
    set last_accessed_at = now(), hit_count = cache.hit_count + 1
    from selected
    where cache.query_id = selected.query_id
      and cache.schema_version = selected.schema_version
    returning selected.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'schemaVersion', touched.schema_version,
    'queryId', touched.query_id,
    'query', touched.query,
    'sources', touched.sources,
    'storedAt', to_char(touched.stored_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'validUntil', to_char(touched.valid_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'reusePolicy', 'public_raw_material_only'
  ) order by array_position(p_query_ids, touched.query_id)), '[]'::jsonb)
  into result
  from touched;
  return result;
end;
$$;

create or replace function private.worker_store_public_research_cache(
  p_job_id uuid,
  p_capability_token text,
  p_entries jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  entry jsonb;
  query_record jsonb;
  source_record jsonb;
  query_text text;
  input_stored_at timestamptz;
  input_valid_until timestamptz;
  written integer := 0;
begin
  if job_row.kind <> 'capital_project_analysis'
    or not exists (
      select 1 from public.capital_projects project
      where project.organization_id = job_row.organization_id
        and project.id::text = job_row.payload ->> 'capital_project_id'
        and project.access_basis = 'public_information'
    ) then
    raise exception 'research_capability_required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_entries) <> 'array'
    or jsonb_array_length(p_entries) not between 1 and 12 then
    raise exception 'invalid_public_research_cache_contract' using errcode = '22023';
  end if;

  for entry in select value from jsonb_array_elements(p_entries) loop
    query_record := entry -> 'query';
    query_text := trim(coalesce(query_record ->> 'query', ''));
    if entry ->> 'schemaVersion' <> 'public-research-cache.v1'
      or entry ->> 'reusePolicy' <> 'public_raw_material_only'
      or coalesce(entry ->> 'queryId', '') !~ '^[0-9a-f]{64}$'
      or entry ->> 'queryId' <> query_record ->> 'id'
      or coalesce(jsonb_typeof(query_record), 'null') <> 'object'
      or query_record - array['id','topic','query','country','domainAllowlist']::text[] <> '{}'::jsonb
      or query_record ->> 'topic' not in ('identity', 'news', 'sector', 'regulation', 'market')
      or entry ->> 'queryId' <> encode(extensions.digest(
        convert_to((query_record ->> 'topic') || ':' || query_text, 'utf8'), 'sha256'
      ), 'hex')
      or char_length(query_text) not between 3 and 400
      or query_text ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}'
      or query_text ~* '(R[$]|US[$]|BRL|USD)[[:space:]]*[0-9]'
      or query_text ~ '[0-9]{11,14}'
      or jsonb_typeof(coalesce(query_record -> 'domainAllowlist', 'null'::jsonb)) <> 'array'
      or jsonb_array_length(query_record -> 'domainAllowlist') > 20
      or jsonb_typeof(coalesce(entry -> 'sources', 'null'::jsonb)) <> 'array'
      or jsonb_array_length(entry -> 'sources') not between 1 and 10 then
      raise exception 'invalid_public_research_cache_contract' using errcode = '22023';
    end if;

    begin
      input_stored_at := (entry ->> 'storedAt')::timestamptz;
      input_valid_until := (entry ->> 'validUntil')::timestamptz;
    exception when others then
      raise exception 'invalid_public_research_cache_time' using errcode = '22023';
    end;
    if input_stored_at > now() + interval '5 minutes'
      or input_stored_at < now() - interval '1 day'
      or input_valid_until <= input_stored_at
      or input_valid_until > input_stored_at + interval '90 days' then
      raise exception 'invalid_public_research_cache_time' using errcode = '22023';
    end if;

    for source_record in select value from jsonb_array_elements(entry -> 'sources') loop
      if jsonb_typeof(source_record) <> 'object'
        or source_record - array[
          'provider','topic','title','url','snippet','publishedAt','retrievedAt','contentHash'
        ]::text[] <> '{}'::jsonb
        or source_record ->> 'topic' <> query_record ->> 'topic'
        or source_record ->> 'provider' not in ('perplexity', 'openai', 'official', 'mcp')
        or coalesce(source_record ->> 'url', '') !~ '^https://'
        or coalesce(source_record ->> 'contentHash', '') !~ '^[0-9a-f]{64}$'
        or char_length(trim(coalesce(source_record ->> 'title', ''))) not between 1 and 500
        or char_length(coalesce(source_record ->> 'snippet', '')) > 8000 then
        raise exception 'invalid_public_research_cache_source' using errcode = '22023';
      end if;
      begin
        perform (source_record ->> 'retrievedAt')::timestamptz;
      exception when others then
        raise exception 'invalid_public_research_cache_source_time' using errcode = '22023';
      end;
    end loop;

    insert into private.public_research_query_cache (
      query_id, schema_version, query, sources, stored_at, valid_until
    ) values (
      entry ->> 'queryId', 'public-research-cache.v1', query_record, entry -> 'sources',
      input_stored_at, input_valid_until
    )
    on conflict (query_id, schema_version) do update
    set query = excluded.query,
        sources = excluded.sources,
        stored_at = excluded.stored_at,
        valid_until = excluded.valid_until,
        updated_at = now()
    where private.public_research_query_cache.stored_at <= excluded.stored_at;
    written := written + 1;
  end loop;
  return jsonb_build_object('written', written, 'reusePolicy', 'public_raw_material_only');
end;
$$;

create or replace function public.worker_load_public_research_cache(
  p_job_id uuid,
  p_capability_token text,
  p_query_ids text[]
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_load_public_research_cache(p_job_id, p_capability_token, p_query_ids);
$$;

create or replace function public.worker_store_public_research_cache(
  p_job_id uuid,
  p_capability_token text,
  p_entries jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_store_public_research_cache(p_job_id, p_capability_token, p_entries);
$$;

revoke all on function private.worker_load_public_research_cache(uuid, text, text[])
  from public, anon, authenticated;
revoke all on function private.worker_store_public_research_cache(uuid, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.worker_load_public_research_cache(uuid, text, text[])
  from public, anon;
revoke all on function public.worker_store_public_research_cache(uuid, text, jsonb)
  from public, anon;
grant execute on function private.worker_load_public_research_cache(uuid, text, text[])
  to authenticated;
grant execute on function private.worker_store_public_research_cache(uuid, text, jsonb)
  to authenticated;
grant execute on function public.worker_load_public_research_cache(uuid, text, text[])
  to authenticated;
grant execute on function public.worker_store_public_research_cache(uuid, text, jsonb)
  to authenticated;

comment on table private.public_research_query_cache is
  'Global cache of public raw research queries only. It contains no tenant, conversation, project or uploaded-document context and is reachable solely through a live worker capability.';
