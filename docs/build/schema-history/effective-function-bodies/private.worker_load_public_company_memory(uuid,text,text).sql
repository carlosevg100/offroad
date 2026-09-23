CREATE OR REPLACE FUNCTION private.worker_load_public_company_memory(p_job_id uuid, p_capability_token text, p_company_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  ignored_job public.processing_jobs := private.worker_public_company_memory_job(p_job_id, p_capability_token);
  result jsonb;
begin
  if p_company_key is distinct from encode(extensions.digest('public-entity:'||(private.worker_read_public_entity_subject_v1(p_job_id,p_capability_token)->>'verifiedEntityId'),'sha256'),'hex') then return null; end if;
  if p_company_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_public_company_key' using errcode = '22023';
  end if;

  with selected as (
    select memory.*
    from private.public_company_source_memory memory
    where memory.company_key = p_company_key
      and memory.schema_version = 'public-company-memory.v2'
      and memory.valid_until > now() and private.public_cache_sources_licensed_v1(memory.sources)
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
$function$
