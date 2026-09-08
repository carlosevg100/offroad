-- Preserve serialized confirmation ordering and fence workers without scope support.
create or replace function private.confirm_receivables_evidence_scope_v1(p_session_id uuid,p_expected_manifest_fingerprint text,p_primary_tape jsonb,p_complement_document_ids uuid[],p_reporting_date date,p_command_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.document_intake_sessions; ctx jsonb; manifest jsonb; chosen jsonb; scope_body jsonb; stored private.receivables_evidence_scopes;
 request_hash text; scope_hash text; scope_id uuid:=gen_random_uuid(); actor uuid:=auth.uid(); at_time timestamptz; run_result jsonb; selected_ids uuid[];
begin
 if actor is null then raise exception 'receivables_scope_access_denied' using errcode='42501'; end if;
 if p_command_id is null or p_reporting_date is null or not isfinite(p_reporting_date) or p_reporting_date not between date '0001-01-01' and date '9999-12-31' or p_expected_manifest_fingerprint is null or p_expected_manifest_fingerprint !~ '^[a-f0-9]{64}$'
   or jsonb_typeof(p_primary_tape) is distinct from 'object' or p_complement_document_ids is null or cardinality(p_complement_document_ids)>100
   or cardinality(p_complement_document_ids)<>(select count(distinct x) from unnest(p_complement_document_ids) x)
 then raise exception 'receivables_scope_invalid' using errcode='22023'; end if;
 select * into s from public.document_intake_sessions where id=p_session_id and private.can_access_capital_project(organization_id,capital_project_id) for update;
 if not found then raise exception 'receivables_scope_access_denied' using errcode='42501'; end if;
 perform 1 from public.capital_projects where organization_id=s.organization_id and id=s.capital_project_id and status<>'archived' for update;
 if not found then raise exception 'receivables_scope_access_denied' using errcode='42501'; end if;
 -- Timestamp is assigned after serialization, never at request arrival.
 at_time:=greatest(clock_timestamp(),coalesce((select max(confirmed_at)+interval '1 microsecond' from private.receivables_evidence_scopes where organization_id=s.organization_id and intake_session_id=s.id),'-infinity'::timestamptz));
 request_hash:=encode(extensions.digest(convert_to(jsonb_build_object('session',s.id,'manifest',p_expected_manifest_fingerprint,'primary',p_primary_tape,'complements',(select coalesce(jsonb_agg(x order by x),'[]') from unnest(p_complement_document_ids)x),'date',p_reporting_date)::text,'utf8'),'sha256'),'hex');
 select * into stored from private.receivables_evidence_scopes where organization_id=s.organization_id and command_id=p_command_id;
 if found then
  if stored.request_fingerprint<>request_hash or stored.confirmed_by<>actor then raise exception 'receivables_scope_command_conflict' using errcode='23505'; end if;
  return jsonb_build_object('scope',stored.scope,'processingRunId',stored.processing_run_id,'replayed',true);
 end if;
 if s.status not in ('collecting','processing','review_ready','failed') or exists(
  select 1 from public.source_documents d where d.organization_id=s.organization_id and d.intake_session_id=s.id
    and (d.processing_status<>'ready' ))
 then raise exception 'receivables_scope_processing_unavailable' using errcode='55000'; end if;
 ctx:=private.receivables_evidence_scope_context(s.organization_id,s.id); manifest:=ctx->'sourceManifest';
 if manifest->>'fingerprint' is distinct from p_expected_manifest_fingerprint or not coalesce(private.receivables_scope_sources_current(s.organization_id,s.id,manifest->'sources'),false)
 then raise exception 'receivables_scope_stale' using errcode='40001'; end if;
 if not exists(select 1 from jsonb_array_elements(ctx->'candidates') c
   where jsonb_build_object('documentId',c->'documentId','sheet',c->'sheet','headerRow',c->'headerRow')=p_primary_tape)
   or (p_primary_tape->>'documentId')::uuid=any(p_complement_document_ids)
   or exists(select 1 from jsonb_array_elements(ctx->'candidates') c where (c->>'documentId')::uuid=any(p_complement_document_ids))
 then raise exception 'receivables_scope_invalid' using errcode='22023'; end if;
 selected_ids:=array_append(p_complement_document_ids,(p_primary_tape->>'documentId')::uuid);
 select jsonb_agg(src order by src->>'sourceDocumentId') into chosen from jsonb_array_elements(manifest->'sources')src where (src->>'sourceDocumentId')::uuid=any(selected_ids);
 if not exists(select 1 from jsonb_array_elements(chosen) src where src->>'sourceDocumentId'=p_primary_tape->>'documentId' and src->>'contentKind'='document_layer') or jsonb_array_length(chosen) is distinct from cardinality(selected_ids) then raise exception 'receivables_scope_invalid' using errcode='22023'; end if;
 scope_body:=jsonb_build_object('schemaVersion','receivables-evidence-scope.v1','sourceManifestFingerprint',p_expected_manifest_fingerprint,'primaryTape',p_primary_tape,
  'complementDocumentIds',(select coalesce(jsonb_agg(x order by x),'[]') from unnest(p_complement_document_ids)x),'reportingDate',p_reporting_date,'sourceRevisions',chosen);
 scope_hash:=encode(extensions.digest(convert_to(scope_body::text,'utf8'),'sha256'),'hex');
 scope_body:=scope_body||jsonb_build_object('id',scope_id,'fingerprint',scope_hash,'confirmedBy',actor,'confirmedAt',to_char(at_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
 insert into private.receivables_evidence_scopes(id,organization_id,capital_project_id,intake_session_id,command_id,request_fingerprint,fingerprint,scope,confirmed_by,confirmed_at)
 values(scope_id,s.organization_id,s.capital_project_id,s.id,p_command_id,request_hash,scope_hash,scope_body,actor,at_time);
 insert into private.receivables_scope_sources(organization_id,scope_id,source_document_id) select s.organization_id,scope_id,x from unnest(selected_ids)x;
 begin
  run_result:=private.begin_processing_run(s.organization_id,s.id,'answer','[]'::jsonb,s.pipeline_version,'{}'::jsonb);
 exception when object_not_in_prerequisite_state then raise exception 'receivables_scope_processing_unavailable' using errcode='55000'; end;
 update private.receivables_evidence_scopes set processing_run_id=(run_result->>'processing_run_id')::uuid where id=scope_id;
 return jsonb_build_object('scope',scope_body,'processingRunId',run_result->'processing_run_id','replayed',false);
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'receivables_scope_invalid' using errcode='22023';
end;
$$;

-- Copies are private and revoked; no caller-controlled flag can bypass the fence.
do $migration$
declare definition text;
begin
 definition:=pg_get_functiondef('private.worker_load_case_input(uuid,text)'::regprocedure);
 execute replace(definition,'FUNCTION private.worker_load_case_input(', 'FUNCTION private.worker_load_case_input_before_scope(');
 definition:=pg_get_functiondef('public.worker_load_case_input(uuid,text)'::regprocedure);
 definition:=replace(definition,'FUNCTION public.worker_load_case_input(', 'FUNCTION private.worker_load_case_bundle_before_scope(');
 definition:=replace(definition,'private.worker_load_case_input(p_job_id, p_capability_token)','private.worker_load_case_input_before_scope(p_job_id, p_capability_token)');
 execute definition;
 definition:=pg_get_functiondef('private.worker_load_agent_context(uuid,text)'::regprocedure);
 execute replace(definition,'FUNCTION private.worker_load_agent_context(', 'FUNCTION private.worker_load_agent_base_before_scope(');
 definition:=pg_get_functiondef('private.worker_load_agent_context_v2(uuid,text)'::regprocedure);
 definition:=replace(definition,'FUNCTION private.worker_load_agent_context_v2(', 'FUNCTION private.worker_load_agent_v2_before_scope(');
 definition:=replace(definition,'public.worker_load_agent_context(', 'private.worker_load_agent_base_before_scope(');
 execute definition;
 definition:=pg_get_functiondef('private.worker_load_execution_brief_proposal_v1(uuid,text)'::regprocedure);
 execute replace(definition,'FUNCTION private.worker_load_execution_brief_proposal_v1(', 'FUNCTION private.worker_load_proposal_v1_before_scope(');
 definition:=pg_get_functiondef('private.worker_load_agent_context_v3(uuid,text)'::regprocedure);
 execute replace(replace(definition,'FUNCTION private.worker_load_agent_context_v3(', 'FUNCTION private.worker_load_agent_context_before_scope('),'private.worker_load_agent_context_v2(', 'private.worker_load_agent_v2_before_scope(');
 definition:=pg_get_functiondef('private.worker_load_execution_brief_proposal_v2(uuid,text)'::regprocedure);
 execute replace(replace(definition,'FUNCTION private.worker_load_execution_brief_proposal_v2(', 'FUNCTION private.worker_load_execution_brief_proposal_before_scope('),'private.worker_load_execution_brief_proposal_v1(', 'private.worker_load_proposal_v1_before_scope(');
 definition:=pg_get_functiondef('private.worker_record_execution_brief_proposal_v1(uuid,text,jsonb,jsonb,text,jsonb)'::regprocedure);
 execute replace(definition,'private.worker_load_execution_brief_proposal_v1(', 'private.worker_load_proposal_v1_before_scope(');
end;
$migration$;
revoke all on function private.worker_load_case_input_before_scope(uuid,text),private.worker_load_case_bundle_before_scope(uuid,text),private.worker_load_agent_context_before_scope(uuid,text),private.worker_load_execution_brief_proposal_before_scope(uuid,text) from public,anon,authenticated;

create function private.require_receivables_scope_aware_reader(p_job_id uuid,p_capability_token text)
returns void language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);
begin
 if exists(select 1 from private.receivables_evidence_scopes where organization_id=j.organization_id and intake_session_id=j.intake_session_id) then
  raise exception 'confirmed_receivables_scope_reader_required' using errcode='55000';
 end if;
end;
$$;
revoke all on function private.require_receivables_scope_aware_reader(uuid,text) from public,anon,authenticated;

create or replace function private.worker_load_case_input(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_receivables_scope_aware_reader(p_job_id,p_capability_token);
 return private.worker_load_case_input_before_scope(p_job_id,p_capability_token);
end;
$$;

create or replace function public.worker_load_case_input(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_receivables_scope_aware_reader(p_job_id,p_capability_token);
 return private.worker_load_case_bundle_before_scope(p_job_id,p_capability_token);
end;
$$;

create or replace function private.worker_load_agent_context_v3(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_receivables_scope_aware_reader(p_job_id,p_capability_token);
 return private.worker_load_agent_context_before_scope(p_job_id,p_capability_token);
end;
$$;

create or replace function private.worker_load_execution_brief_proposal_v2(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_receivables_scope_aware_reader(p_job_id,p_capability_token);
 return private.worker_load_execution_brief_proposal_before_scope(p_job_id,p_capability_token);
end;
$$;
create or replace function private.worker_load_case_input_v2(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token); base jsonb;
begin
 if j.kind<>'case_analysis' then raise exception 'case_analysis_capability_required' using errcode='42501'; end if;
 perform 1 from public.document_intake_sessions where organization_id=j.organization_id and id=j.intake_session_id for update;
 base:=private.worker_load_case_bundle_before_scope(p_job_id,p_capability_token);
 return base||jsonb_build_object('confirmed_receivables_scope',private.receivables_evidence_scope_context(j.organization_id,j.intake_session_id));
end;
$$;
create or replace function private.worker_load_agent_context_v4(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token); base jsonb;
begin
 perform 1 from public.document_intake_sessions where organization_id=j.organization_id and id=j.intake_session_id for update;
 base:=private.worker_load_agent_context_before_scope(p_job_id,p_capability_token);
 return base||jsonb_build_object('confirmed_receivables_scope',private.receivables_evidence_scope_context(j.organization_id,j.intake_session_id));
end;
$$;
create or replace function private.worker_load_execution_brief_proposal_v3(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token); base jsonb;
begin
 base:=private.worker_load_execution_brief_proposal_before_scope(p_job_id,p_capability_token);
 return base||jsonb_build_object('confirmed_receivables_scope',private.receivables_evidence_scope_context(j.organization_id,j.intake_session_id));
end;
$$;

revoke all on function private.worker_load_agent_base_before_scope(uuid,text),private.worker_load_agent_v2_before_scope(uuid,text),private.worker_load_proposal_v1_before_scope(uuid,text),private.worker_load_agent_context_before_professional_context_v1(uuid,text) from public,anon,authenticated;

create or replace function private.worker_load_agent_context(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_receivables_scope_aware_reader(p_job_id,p_capability_token);
 return private.worker_load_agent_base_before_scope(p_job_id,p_capability_token);
end;
$$;

create or replace function private.worker_load_agent_context_v2(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_receivables_scope_aware_reader(p_job_id,p_capability_token);
 return private.worker_load_agent_v2_before_scope(p_job_id,p_capability_token);
end;
$$;

create or replace function private.worker_load_execution_brief_proposal_v1(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_receivables_scope_aware_reader(p_job_id,p_capability_token);
 return private.worker_load_proposal_v1_before_scope(p_job_id,p_capability_token);
end;
$$;
