-- Explicit same-workbook support sheets are authority metadata, never inferred consent.
create function private.receivables_support_sheets_valid(p_context jsonb,p_primary jsonb,p_sheets jsonb)
returns boolean language sql immutable set search_path='' as $$
 select case when jsonb_typeof(p_sheets) is distinct from 'array' then false else
 not exists(select 1 from jsonb_array_elements_text(p_sheets) s where
   s=p_primary->>'sheet' or
   (select count(*) from jsonb_array_elements(coalesce(p_context->'supportSheetCandidates','[]')) c
     where c->>'documentId'=p_primary->>'documentId' and c->>'sheet'=s)<>1 or
   exists(select 1 from jsonb_array_elements(coalesce(p_context->'candidates','[]')) c
     where c->>'documentId'=p_primary->>'documentId' and c->>'sheet'=s)) end;
$$;
revoke all on function private.receivables_support_sheets_valid(jsonb,jsonb,jsonb) from public,anon,authenticated;

create or replace function private.receivables_evidence_scope_context(p_org uuid,p_session uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare report jsonb; manifest jsonb; candidates jsonb; latest private.receivables_evidence_scopes; fresh boolean; state text;
begin
 select result_summary#>'{case_state,receivablesVertical}' into report from public.document_intake_sessions where organization_id=p_org and id=p_session;
 manifest:=report->'sourceManifest'; candidates:=report->'candidates';
 if candidates is null then candidates:=report#>'{scopeIssue,candidates}'; end if;
 select * into latest from private.receivables_evidence_scopes where organization_id=p_org and intake_session_id=p_session order by confirmed_at desc,id desc limit 1;
 fresh:=coalesce(private.receivables_scope_sources_current(p_org,p_session,manifest->'sources'),false);
 state:=case when latest.id is not null then case when latest.scope->>'sourceManifestFingerprint'=manifest->>'fingerprint' and fresh and private.receivables_scope_sources_current(p_org,p_session,latest.scope->'sourceRevisions') and exists(select 1 from jsonb_array_elements(coalesce(candidates,'[]')) c
      where jsonb_build_object('documentId',c->'documentId','sheet',c->'sheet','headerRow',c->'headerRow')=latest.scope->'primaryTape')
    and not exists(select 1 from jsonb_array_elements(coalesce(candidates,'[]')) c
      where latest.scope->'complementDocumentIds' ? (c->>'documentId'))
    and (latest.scope->>'schemaVersion'<>'receivables-evidence-scope.v2' or
      private.receivables_support_sheets_valid(jsonb_build_object('candidates',candidates,'supportSheetCandidates',coalesce(report->'supportSheetCandidates','[]')),latest.scope->'primaryTape',latest.scope->'primarySupportSheets'))
    then 'current' else 'stale' end
   when manifest is null or jsonb_typeof(candidates) is distinct from 'array' then 'unavailable'
   when not fresh then 'stale' else 'unconfirmed' end;
 return jsonb_build_object('sourceManifest',manifest,'candidates',coalesce(candidates,'[]'::jsonb),'supportSheetCandidates',coalesce(report->'supportSheetCandidates','[]'::jsonb),'scope',latest.scope,'state',state);
end;
$$;


create or replace function private.confirm_receivables_evidence_scope_v2(p_session_id uuid,p_expected_manifest_fingerprint text,p_primary_tape jsonb,p_complement_document_ids uuid[],p_reporting_date date,p_command_id uuid,p_primary_support_sheets text[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.document_intake_sessions; ctx jsonb; manifest jsonb; chosen jsonb; scope_body jsonb; stored private.receivables_evidence_scopes;
 request_hash text; scope_hash text; scope_id uuid:=gen_random_uuid(); actor uuid:=auth.uid(); at_time timestamptz; run_result jsonb; selected_ids uuid[];
begin
 if actor is null then raise exception 'receivables_scope_access_denied' using errcode='42501'; end if;
 if p_command_id is null or p_reporting_date is null or not isfinite(p_reporting_date) or p_reporting_date not between date '0001-01-01' and date '9999-12-31' or p_expected_manifest_fingerprint is null or p_expected_manifest_fingerprint !~ '^[a-f0-9]{64}$'
   or p_primary_support_sheets is null or cardinality(p_primary_support_sheets)>100
   or cardinality(p_primary_support_sheets)<>(select count(distinct x) from unnest(p_primary_support_sheets)x)
   or exists(select 1 from unnest(p_primary_support_sheets)x where x is null or length(btrim(x))=0 or length(x)>255)
   or jsonb_typeof(p_primary_tape) is distinct from 'object' or p_complement_document_ids is null or cardinality(p_complement_document_ids)>100
   or cardinality(p_complement_document_ids)<>(select count(distinct x) from unnest(p_complement_document_ids) x)
 then raise exception 'receivables_scope_invalid' using errcode='22023'; end if;
 select * into s from public.document_intake_sessions where id=p_session_id and private.can_access_capital_project(organization_id,capital_project_id) for update;
 if not found then raise exception 'receivables_scope_access_denied' using errcode='42501'; end if;
 perform 1 from public.capital_projects where organization_id=s.organization_id and id=s.capital_project_id and status<>'archived' for update;
 if not found then raise exception 'receivables_scope_access_denied' using errcode='42501'; end if;
 -- Timestamp is assigned after serialization, never at request arrival.
 at_time:=greatest(clock_timestamp(),coalesce((select max(confirmed_at)+interval '1 microsecond' from private.receivables_evidence_scopes where organization_id=s.organization_id and intake_session_id=s.id),'-infinity'::timestamptz));
 request_hash:=encode(extensions.digest(convert_to(jsonb_build_object('session',s.id,'manifest',p_expected_manifest_fingerprint,'primary',p_primary_tape,'complements',(select coalesce(jsonb_agg(x order by x),'[]') from unnest(p_complement_document_ids)x),'date',p_reporting_date,'primarySupportSheets',(select coalesce(jsonb_agg(x order by x collate "C"),'[]') from unnest(p_primary_support_sheets)x))::text,'utf8'),'sha256'),'hex');
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
 if not private.receivables_support_sheets_valid(ctx,p_primary_tape,to_jsonb(p_primary_support_sheets)) then raise exception 'receivables_scope_invalid' using errcode='22023'; end if;
 selected_ids:=array_append(p_complement_document_ids,(p_primary_tape->>'documentId')::uuid);
 select jsonb_agg(src order by src->>'sourceDocumentId') into chosen from jsonb_array_elements(manifest->'sources')src where (src->>'sourceDocumentId')::uuid=any(selected_ids);
 if not exists(select 1 from jsonb_array_elements(chosen) src where src->>'sourceDocumentId'=p_primary_tape->>'documentId' and src->>'contentKind'='document_layer') or jsonb_array_length(chosen) is distinct from cardinality(selected_ids) then raise exception 'receivables_scope_invalid' using errcode='22023'; end if;
 scope_body:=jsonb_build_object('schemaVersion','receivables-evidence-scope.v2','sourceManifestFingerprint',p_expected_manifest_fingerprint,'primaryTape',p_primary_tape,
  'complementDocumentIds',(select coalesce(jsonb_agg(x order by x),'[]') from unnest(p_complement_document_ids)x),'reportingDate',p_reporting_date,'sourceRevisions',chosen,'primarySupportSheets',(select coalesce(jsonb_agg(x order by x collate "C"),'[]') from unnest(p_primary_support_sheets)x));
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

create function public.confirm_receivables_evidence_scope_v2(p_session_id uuid,p_expected_manifest_fingerprint text,p_primary_tape jsonb,p_complement_document_ids uuid[],p_reporting_date date,p_command_id uuid,p_primary_support_sheets text[])
returns jsonb language sql security invoker set search_path='' as $$
 select private.confirm_receivables_evidence_scope_v2(p_session_id,p_expected_manifest_fingerprint,p_primary_tape,p_complement_document_ids,p_reporting_date,p_command_id,p_primary_support_sheets);
$$;
revoke all on function private.confirm_receivables_evidence_scope_v2(uuid,text,jsonb,uuid[],date,uuid,text[]),public.confirm_receivables_evidence_scope_v2(uuid,text,jsonb,uuid[],date,uuid,text[]) from public,anon,authenticated;
grant execute on function private.confirm_receivables_evidence_scope_v2(uuid,text,jsonb,uuid[],date,uuid,text[]),public.confirm_receivables_evidence_scope_v2(uuid,text,jsonb,uuid[],date,uuid,text[]) to authenticated;

-- New readers retain the installed implementations. Older binaries must not ignore
-- explicitly selected support sheets; no caller-controlled compatibility flag exists.
create function private.require_receivables_support_sheet_reader(p_job_id uuid,p_capability_token text)
returns void language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token); selected jsonb;
begin
 perform 1 from public.document_intake_sessions where organization_id=j.organization_id and id=j.intake_session_id for update;
 select scope into selected from private.receivables_evidence_scopes where organization_id=j.organization_id and intake_session_id=j.intake_session_id order by confirmed_at desc,id desc limit 1;
 if selected->>'schemaVersion'='receivables-evidence-scope.v2' then
  raise exception 'confirmed_receivables_support_sheet_reader_required' using errcode='55000';
 end if;
end;
$$;
revoke all on function private.require_receivables_support_sheet_reader(uuid,text) from public,anon,authenticated;
do $migration$
declare old_name text; new_name text; names text[]; definition text; original text;
begin
 foreach names slice 1 in array array[
  ['worker_load_case_input_v2','worker_load_case_input_v3'],
  ['worker_load_agent_context_v4','worker_load_agent_context_v5'],
  ['worker_load_execution_brief_proposal_v3','worker_load_execution_brief_proposal_v4']]
 loop
  old_name:=names[1]; new_name:=names[2];
  definition:=pg_get_functiondef(format('private.%s(uuid,text)',old_name)::regprocedure);
  original:='FUNCTION private.'||old_name||'(';
  if position(original in definition)=0 then raise exception 'support_sheet_reader_definition_drift'; end if;
  execute replace(definition,original,'FUNCTION private.'||new_name||'(');
  definition:=pg_get_functiondef(format('public.%s(uuid,text)',old_name)::regprocedure);
  execute replace(replace(definition,'FUNCTION public.'||old_name||'(','FUNCTION public.'||new_name||'('),'private.'||old_name||'(','private.'||new_name||'(');
  execute format('create or replace function private.%I(p_job_id uuid,p_capability_token text) returns jsonb language plpgsql security definer set search_path='''' as $body$ begin perform private.require_receivables_support_sheet_reader(p_job_id,p_capability_token); return private.%I(p_job_id,p_capability_token) #- array[''confirmed_receivables_scope'',''supportSheetCandidates'']; end; $body$;',old_name,new_name);
  execute format('revoke all on function private.%I(uuid,text),public.%I(uuid,text) from public,anon,authenticated',new_name,new_name);
  execute format('grant execute on function private.%I(uuid,text),public.%I(uuid,text) to authenticated',new_name,new_name);
 end loop;
end;
$migration$;
-- Publish only after every versioned reader exists; preserve all installed capabilities.
do $migration$
declare definition text;
begin
 definition:=pg_get_functiondef('public.worker_runtime_schema_contract_v1()'::regprocedure);
 execute replace(definition,'FUNCTION public.worker_runtime_schema_contract_v1(', 'FUNCTION private.worker_runtime_schema_contract_before_support_sheets(');
end;
$migration$;
revoke all on function private.worker_runtime_schema_contract_before_support_sheets() from public,anon,authenticated;
create or replace function public.worker_runtime_schema_contract_v1()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_set(c,'{capabilities}',(c->'capabilities')||'["confirmed-receivables-support-sheets.v1"]'::jsonb)
 from (select private.worker_runtime_schema_contract_before_support_sheets() c) contract;
$$;
revoke all on function public.worker_runtime_schema_contract_v1() from public,anon;
grant execute on function public.worker_runtime_schema_contract_v1() to authenticated;

-- Both approval snapshots bind the full selected list via scope fingerprint and its count.
do $migration$
declare definition text; needle text:=E'and basis->''selectedSourceCount''=to_jsonb(jsonb_array_length(scope->''sourceRevisions'')) then matched:=true;';
begin
 definition:=pg_get_functiondef('private.validate_receivables_scope_brief(uuid,uuid,jsonb,jsonb)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'support_sheet_brief_validator_drift'; end if;
 execute replace(definition,needle,E'and basis->''selectedSourceCount''=to_jsonb(jsonb_array_length(scope->''sourceRevisions''))\n   and (scope->>''schemaVersion''<>''receivables-evidence-scope.v2'' or basis->''primarySupportSheetCount''=to_jsonb(jsonb_array_length(scope->''primarySupportSheets''))) then matched:=true;');
end;
$migration$;

-- Keep legacy web context structurally compatible; the new reader exposes inventory.
do $migration$
declare definition text;
begin
 definition:=pg_get_functiondef('private.read_receivables_evidence_scope_v1(uuid)'::regprocedure);
 execute replace(definition,'FUNCTION private.read_receivables_evidence_scope_v1(', 'FUNCTION private.read_receivables_evidence_scope_v2(');
end;
$migration$;
create function public.read_receivables_evidence_scope_v2(p_session_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.read_receivables_evidence_scope_v2(p_session_id); $$;
revoke all on function private.read_receivables_evidence_scope_v2(uuid),public.read_receivables_evidence_scope_v2(uuid) from public,anon,authenticated;
grant execute on function private.read_receivables_evidence_scope_v2(uuid),public.read_receivables_evidence_scope_v2(uuid) to authenticated;
create or replace function private.read_receivables_evidence_scope_v1(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ctx jsonb;
begin
 ctx:=private.read_receivables_evidence_scope_v2(p_session_id);
 if ctx#>>'{scope,schemaVersion}'='receivables-evidence-scope.v2' then raise exception 'confirmed_receivables_support_sheet_reader_required' using errcode='55000'; end if;
 return ctx-'supportSheetCandidates';
end;
$$;
