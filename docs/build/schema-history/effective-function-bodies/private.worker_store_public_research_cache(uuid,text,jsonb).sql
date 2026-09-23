CREATE OR REPLACE FUNCTION private.worker_store_public_research_cache(p_job_id uuid, p_capability_token text, p_entries jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    if entry ->> 'schemaVersion' <> 'public-research-cache.v2'
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

    if not private.public_cache_sources_licensed_v1(entry->'sources',input_valid_until) then raise exception 'public_source_rights_required' using errcode='42501'; end if;
    insert into private.public_research_query_cache (
      query_id, schema_version, query, sources, stored_at, valid_until
    ) values (
      entry ->> 'queryId', 'public-research-cache.v2', query_record, entry -> 'sources',
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
$function$
