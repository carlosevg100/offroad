CREATE OR REPLACE FUNCTION private.worker_load_public_research_cache(p_job_id uuid, p_capability_token text, p_query_ids text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    where cache.schema_version = 'public-research-cache.v2'
      and cache.query_id = any(p_query_ids)
      and cache.valid_until > now() and private.public_cache_sources_licensed_v1(cache.sources)
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
$function$
