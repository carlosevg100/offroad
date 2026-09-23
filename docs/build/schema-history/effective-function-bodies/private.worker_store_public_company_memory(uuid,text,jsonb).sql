CREATE OR REPLACE FUNCTION private.worker_store_public_company_memory(p_job_id uuid, p_capability_token text, p_record jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  ignored_job public.processing_jobs := private.worker_public_company_memory_job(p_job_id, p_capability_token);
  subject_record jsonb := p_record -> 'subject';
  source_record jsonb;
  query_id_record jsonb;
  input_stored_at timestamptz;
  input_valid_until timestamptz;
begin
  if private.worker_read_public_entity_subject_v1(p_job_id,p_capability_token) is null or p_record->'subject' is distinct from private.worker_read_public_entity_subject_v1(p_job_id,p_capability_token) or p_record->>'companyKey' is distinct from encode(extensions.digest('public-entity:'||(p_record#>>'{subject,verifiedEntityId}'),'sha256'),'hex') then raise exception 'verified_public_identity_required' using errcode='42501'; end if;
  if jsonb_typeof(p_record) <> 'object'
    or p_record - array['schemaVersion','companyKey','subject','queryIds','sources','storedAt','validUntil','reusePolicy']::text[] <> '{}'::jsonb
    or p_record ->> 'schemaVersion' <> 'public-company-memory.v2'
    or p_record ->> 'reusePolicy' <> 'public_company_sources_only'
    or coalesce(p_record ->> 'companyKey', '') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(subject_record) <> 'object'
    or subject_record - array['legalName','verifiedEntityId']::text[] <> '{}'::jsonb
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

  if not private.public_cache_sources_licensed_v1(p_record->'sources',input_valid_until) then raise exception 'public_source_rights_required' using errcode='42501'; end if;
  insert into private.public_company_source_memory (
    company_key, schema_version, subject, query_ids, sources, stored_at, valid_until
  ) values (
    p_record ->> 'companyKey', 'public-company-memory.v2', subject_record,
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
$function$
