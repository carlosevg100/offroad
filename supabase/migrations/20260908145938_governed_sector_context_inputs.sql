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
    'review_state',c.review_state,'is_primary',c.is_primary,'reviewed_by',c.reviewed_by,'reviewed_at',c.reviewed_at,
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

create or replace function private.worker_load_agent_context_v3(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token); context jsonb;
begin
  context:=private.worker_load_agent_context_v2(p_job_id,p_capability_token);
  return context||jsonb_build_object('governed_sector_context_inputs',private.governed_sector_context_inputs(j.organization_id,j.intake_session_id));
end;
$$;
create or replace function public.worker_load_agent_context_v3(p_job_id uuid,p_capability_token text)
returns jsonb language sql security invoker set search_path='' as $$
  select private.worker_load_agent_context_v3(p_job_id,p_capability_token);
$$;
revoke all on function private.worker_load_agent_context_v3(uuid,text) from public,anon,authenticated;
revoke all on function public.worker_load_agent_context_v3(uuid,text) from public,anon,authenticated;
grant execute on function private.worker_load_agent_context_v3(uuid,text) to authenticated;
grant execute on function public.worker_load_agent_context_v3(uuid,text) to authenticated;

create or replace function private.worker_load_execution_brief_proposal_v2(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token); context jsonb;
begin
  context:=private.worker_load_execution_brief_proposal_v1(p_job_id,p_capability_token);
  return context||jsonb_build_object('governed_sector_context_inputs',private.governed_sector_context_inputs(j.organization_id,j.intake_session_id));
end;
$$;
create or replace function public.worker_load_execution_brief_proposal_v2(p_job_id uuid,p_capability_token text)
returns jsonb language sql security invoker set search_path='' as $$
  select private.worker_load_execution_brief_proposal_v2(p_job_id,p_capability_token);
$$;
revoke all on function private.worker_load_execution_brief_proposal_v2(uuid,text) from public,anon,authenticated;
revoke all on function public.worker_load_execution_brief_proposal_v2(uuid,text) from public,anon,authenticated;
grant execute on function private.worker_load_execution_brief_proposal_v2(uuid,text) to authenticated;
grant execute on function public.worker_load_execution_brief_proposal_v2(uuid,text) to authenticated;

-- Preserve every historical approval hash when the new context has no relevant facts.
alter function private.execution_approval_input_fingerprint(uuid,uuid) rename to execution_approval_input_fingerprint_before_sector;
create or replace function private.execution_approval_input_fingerprint(p_organization_id uuid,p_session_id uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare previous text; sector jsonb;
begin
  previous:=private.execution_approval_input_fingerprint_before_sector(p_organization_id,p_session_id);
  sector:=private.governed_sector_context_inputs(p_organization_id,p_session_id)-'as_of';
  if jsonb_array_length(sector->'candidates')=0 then return previous; end if;
  return encode(extensions.digest(convert_to(jsonb_build_object('previous',previous,'governed_sector_context_inputs',sector)::text,'utf8'),'sha256'),'hex');
end;
$$;
revoke all on function private.execution_approval_input_fingerprint_before_sector(uuid,uuid) from public,anon,authenticated;
revoke all on function private.execution_approval_input_fingerprint(uuid,uuid) from public,anon,authenticated;

-- Do not lock other job rows while reading lineage. Writers serialize on the same
-- session/project locks as approval. Ordinary status/lease/output churn is excluded.
create or replace function private.lock_governed_sector_lineage()
returns trigger language plpgsql security definer set search_path='' as $$
declare org_id uuid; session_id uuid;
begin
  if tg_op='UPDATE' then
    if old.kind<>'document_pipeline' and new.kind<>'document_pipeline' then return new; end if;
    if row(old.organization_id,old.intake_session_id,old.processing_run_id,old.source_document_id,old.kind)
      is distinct from row(new.organization_id,new.intake_session_id,new.processing_run_id,new.source_document_id,new.kind) then
      raise exception 'document_lineage_identity_immutable' using errcode='42501';
    end if;
    if row(old.payload->'document_version',old.payload->'sha256') is not distinct from row(new.payload->'document_version',new.payload->'sha256') then return new; end if;
    org_id:=new.organization_id; session_id:=new.intake_session_id;
  elsif tg_op='DELETE' then
    if old.kind<>'document_pipeline' then return old; end if;
    org_id:=old.organization_id; session_id:=old.intake_session_id;
  else
    if new.kind<>'document_pipeline' then return new; end if;
    org_id:=new.organization_id; session_id:=new.intake_session_id;
  end if;
  perform 1 from public.document_intake_sessions where organization_id=org_id and id=session_id for update;
  perform 1 from public.capital_projects p join public.document_intake_sessions s on s.organization_id=p.organization_id and s.capital_project_id=p.id
    where s.organization_id=org_id and s.id=session_id for update of p;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.lock_governed_sector_lineage() from public,anon,authenticated;
create trigger governed_sector_lineage_lock before insert or update or delete on public.processing_jobs
  for each row execute function private.lock_governed_sector_lineage();

-- Planning context is visible review material, never an execution authorization.
create or replace function private.validate_execution_brief_planning_context()
returns trigger language plpgsql set search_path='' as $$
declare planning jsonb;
begin
  if not (new.internal_snapshot ? 'planningContext' or new.visible_snapshot ? 'planningContext') then return new; end if;
  planning:=new.internal_snapshot->'planningContext';
  if planning is distinct from new.visible_snapshot->'planningContext'
    or coalesce(jsonb_typeof(planning),'null')<>'object'
    or planning->>'schemaVersion' is distinct from 'sector-planning-context.v1'
    or planning->>'mode' is distinct from 'planning_only'
    or coalesce(planning->>'contextFingerprint','') !~ '^[a-f0-9]{64}$'
    or coalesce(planning->>'planFingerprint','') !~ '^[a-f0-9]{64}$'
    or coalesce(jsonb_typeof(planning->'objects'),'null')<>'array' then
    raise exception 'execution_brief_planning_context_invalid' using errcode='22023';
  end if;
  if jsonb_array_length(planning->'objects')>200 then raise exception 'execution_brief_planning_context_invalid' using errcode='22023'; end if;
  return new;
end;
$$;
revoke all on function private.validate_execution_brief_planning_context() from public,anon,authenticated;
create trigger execution_brief_planning_context_check before insert or update of internal_snapshot,visible_snapshot on public.capital_project_execution_briefs
  for each row execute function private.validate_execution_brief_planning_context();
