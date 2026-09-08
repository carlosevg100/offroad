-- Read existing reviewed facts; no second fact store or inferred review authority.
create or replace function private.governed_sector_context_inputs(p_organization_id uuid,p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare candidate_rows jsonb; source_rows jsonb;
begin
  if not exists(select 1 from public.document_intake_sessions where organization_id=p_organization_id and id=p_session_id) then
    raise exception 'governed_sector_session_unavailable' using errcode='P0002';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'field_path',c.field_path,'normalized_value',c.normalized_value,
    'review_state',c.review_state,'is_primary',c.is_primary,'reviewed_by',c.reviewed_by,'reviewed_at',to_char(c.reviewed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'entity_name',c.entity_name,'entity_scope',c.entity_scope,'period_start',c.period_start,'period_end',c.period_end,
    'source_anchor',c.source_anchor,'anchor_verified',c.anchor_verified,'extraction_method',c.extraction_method,
    'processing_run_id',c.processing_run_id,'source_document_id',c.source_document_id,
    'extraction_document_version',(
      select case when count(*)=count(valid_version) and count(distinct valid_version)=1 then min(valid_version) else null end
      from (select case when j.payload->>'document_version' ~ '^[1-9][0-9]{0,8}$' then (j.payload->>'document_version')::integer else null end valid_version
        from public.processing_jobs j where j.organization_id=c.organization_id and j.intake_session_id=c.intake_session_id
          and j.processing_run_id=c.processing_run_id and j.source_document_id=c.source_document_id and j.kind='document_pipeline') versions
    ),
    'extraction_source_sha256',(
      select case when count(*)=count(valid_hash) and count(distinct valid_hash)=1 then min(valid_hash) else null end
      from (select case when j.payload->>'sha256' ~ '^[a-f0-9]{64}$' then j.payload->>'sha256' else null end valid_hash
        from public.processing_jobs j where j.organization_id=c.organization_id and j.intake_session_id=c.intake_session_id
          and j.processing_run_id=c.processing_run_id and j.source_document_id=c.source_document_id and j.kind='document_pipeline') hashes
    )
  ) order by c.id),'[]'::jsonb) into candidate_rows
  from public.intake_field_candidates c
  where c.organization_id=p_organization_id and c.intake_session_id=p_session_id
    and c.field_path in ('company.sector','company.subsector','company.business_model','company.revenue_model','company.lifecycle','company.recourse','company.jurisdiction')
    and c.review_state not in ('rejected','superseded');
  if jsonb_array_length(candidate_rows)>100 then raise exception 'governed_sector_context_limit' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'original_name',d.original_name,'document_version',d.document_version,'sha256',d.sha256,'processing_status',d.processing_status,'scan_verdict',d.scan_result->>'verdict') order by d.id),'[]'::jsonb)
    into source_rows from public.source_documents d
    where d.organization_id=p_organization_id and d.intake_session_id=p_session_id
      and exists(select 1 from jsonb_array_elements(candidate_rows) c where c->>'source_document_id'=d.id::text);
  if jsonb_array_length(source_rows)>100 then raise exception 'governed_sector_context_limit' using errcode='22023'; end if;
  return jsonb_build_object('schema_version','governed-sector-context-inputs.v1','as_of',current_date,'candidates',candidate_rows,'sources',source_rows);
end;
$$;
revoke all on function private.governed_sector_context_inputs(uuid,uuid) from public,anon,authenticated;

