-- Confirmed scope is authorization/input metadata, never a second financial ledger.
create table private.receivables_evidence_scopes (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 capital_project_id uuid not null, intake_session_id uuid not null,
 command_id uuid not null, request_fingerprint text not null,
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 scope jsonb not null check(jsonb_typeof(scope)='object'),
 confirmed_by uuid not null references auth.users(id) on delete restrict,
 confirmed_at timestamptz not null default now(),
 processing_run_id uuid,
 unique(organization_id,id), unique(organization_id,command_id),
 foreign key(organization_id,capital_project_id) references public.capital_projects(organization_id,id) on delete cascade,
 foreign key(organization_id,intake_session_id) references public.document_intake_sessions(organization_id,id) on delete cascade,
 foreign key(organization_id,processing_run_id) references public.processing_runs(organization_id,id) on delete restrict
);
create index receivables_scope_session_idx on private.receivables_evidence_scopes(organization_id,intake_session_id,confirmed_at desc,id desc);
create index receivables_scope_project_idx on private.receivables_evidence_scopes(organization_id,capital_project_id);
create index receivables_scope_run_idx on private.receivables_evidence_scopes(organization_id,processing_run_id);
create index receivables_scope_actor_idx on private.receivables_evidence_scopes(confirmed_by);
alter table private.receivables_evidence_scopes enable row level security;
alter table private.receivables_evidence_scopes force row level security;
create policy receivables_scope_deny on private.receivables_evidence_scopes as restrictive for all to public using(false) with check(false);
revoke all on private.receivables_evidence_scopes from public,anon,authenticated;

create table private.receivables_scope_sources (
 organization_id uuid not null, scope_id uuid not null, source_document_id uuid not null,
 primary key(organization_id,scope_id,source_document_id),
 foreign key(organization_id,scope_id) references private.receivables_evidence_scopes(organization_id,id) on delete cascade,
 foreign key(organization_id,source_document_id) references public.source_documents(organization_id,id) on delete cascade
);
create index receivables_scope_source_idx on private.receivables_scope_sources(organization_id,source_document_id);
alter table private.receivables_scope_sources enable row level security;
alter table private.receivables_scope_sources force row level security;
create policy receivables_scope_sources_deny on private.receivables_scope_sources as restrictive for all to public using(false) with check(false);
revoke all on private.receivables_scope_sources from public,anon,authenticated;

-- Check the exact current fragment, not just the source file hash. No payload leaves SQL.
create function private.receivables_scope_sources_current(p_org uuid,p_session uuid,p_sources jsonb)
returns boolean language sql stable security definer set search_path='' as $$
 select jsonb_typeof(p_sources)='array' and jsonb_array_length(p_sources)>0
 and not exists(select 1 from jsonb_array_elements(p_sources) src where not exists(
  select 1 from public.source_documents d
  join lateral (select f.* from private.receivables_evidence_fragments f
    where f.organization_id=d.organization_id and f.intake_session_id=d.intake_session_id
      and f.source_document_id=d.id and f.document_version=d.document_version
    order by f.created_at desc,f.processing_run_id desc limit 1) fragment on true
  where d.organization_id=p_org and d.intake_session_id=p_session
    and d.id::text=src->>'sourceDocumentId' and d.document_version::text=src->>'documentVersion'
    and d.sha256=src->>'sourceSha256' and d.processing_status='ready' and d.scan_result->>'verdict'='clean'
    and fragment.source_sha256=src->>'sourceSha256' and fragment.content_sha256=src->>'contentSha256'
    and fragment.content_kind=src->>'contentKind' and fragment.schema_version=src->>'schemaVersion'
  ));
$$;
revoke all on function private.receivables_scope_sources_current(uuid,uuid,jsonb) from public,anon,authenticated;

create function private.receivables_evidence_scope_context(p_org uuid,p_session uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare report jsonb; manifest jsonb; candidates jsonb; latest private.receivables_evidence_scopes; fresh boolean; state text;
begin
 select result_summary#>'{case_state,receivablesVertical}' into report from public.document_intake_sessions where organization_id=p_org and id=p_session;
 manifest:=report->'sourceManifest'; candidates:=report->'candidates';
 if candidates is null then candidates:=report#>'{scopeIssue,candidates}'; end if;
 select * into latest from private.receivables_evidence_scopes where organization_id=p_org and intake_session_id=p_session order by confirmed_at desc,id desc limit 1;
 fresh:=coalesce(private.receivables_scope_sources_current(p_org,p_session,manifest->'sources'),false);
 state:=case when latest.id is not null then case when latest.scope->>'sourceManifestFingerprint'=manifest->>'fingerprint' and fresh and private.receivables_scope_sources_current(p_org,p_session,latest.scope->'sourceRevisions') then 'current' else 'stale' end
   when manifest is null or jsonb_typeof(candidates) is distinct from 'array' then 'unavailable'
   when not fresh then 'stale' else 'unconfirmed' end;
 return jsonb_build_object('sourceManifest',manifest,'candidates',coalesce(candidates,'[]'::jsonb),'scope',latest.scope,'state',state);
end;
$$;
revoke all on function private.receivables_evidence_scope_context(uuid,uuid) from public,anon,authenticated;

create function private.read_receivables_evidence_scope_v1(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.document_intake_sessions;
begin
 select * into s from public.document_intake_sessions where id=p_session_id
  and private.can_access_capital_project(organization_id,capital_project_id);
 if not found then raise exception 'receivables_scope_access_denied' using errcode='42501'; end if;
 return private.receivables_evidence_scope_context(s.organization_id,s.id);
end;
$$;
create function public.read_receivables_evidence_scope_v1(p_session_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.read_receivables_evidence_scope_v1(p_session_id); $$;
revoke all on function private.read_receivables_evidence_scope_v1(uuid),public.read_receivables_evidence_scope_v1(uuid) from public,anon,authenticated;
grant execute on function private.read_receivables_evidence_scope_v1(uuid),public.read_receivables_evidence_scope_v1(uuid) to authenticated;

create function private.confirm_receivables_evidence_scope_v1(p_session_id uuid,p_expected_manifest_fingerprint text,p_primary_tape jsonb,p_complement_document_ids uuid[],p_reporting_date date,p_command_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.document_intake_sessions; ctx jsonb; manifest jsonb; chosen jsonb; scope_body jsonb; stored private.receivables_evidence_scopes;
 request_hash text; scope_hash text; scope_id uuid:=gen_random_uuid(); actor uuid:=auth.uid(); at_time timestamptz:=clock_timestamp(); run_result jsonb; selected_ids uuid[];
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
create function public.confirm_receivables_evidence_scope_v1(p_session_id uuid,p_expected_manifest_fingerprint text,p_primary_tape jsonb,p_complement_document_ids uuid[],p_reporting_date date,p_command_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select private.confirm_receivables_evidence_scope_v1(p_session_id,p_expected_manifest_fingerprint,p_primary_tape,p_complement_document_ids,p_reporting_date,p_command_id);
$$;
revoke all on function private.confirm_receivables_evidence_scope_v1(uuid,text,jsonb,uuid[],date,uuid),public.confirm_receivables_evidence_scope_v1(uuid,text,jsonb,uuid[],date,uuid) from public,anon,authenticated;
grant execute on function private.confirm_receivables_evidence_scope_v1(uuid,text,jsonb,uuid[],date,uuid),public.confirm_receivables_evidence_scope_v1(uuid,text,jsonb,uuid[],date,uuid) to authenticated;

-- Add only confirmed scope authority, preserving all historical hashes without a scope.
alter function private.execution_approval_input_fingerprint(uuid,uuid) rename to execution_approval_input_fingerprint_before_receivables_scope;
create function private.execution_approval_input_fingerprint(p_organization_id uuid,p_session_id uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare previous text; ctx jsonb;
begin
 previous:=private.execution_approval_input_fingerprint_before_receivables_scope(p_organization_id,p_session_id);
 ctx:=private.receivables_evidence_scope_context(p_organization_id,p_session_id);
 if ctx->'scope'='null'::jsonb then return previous; end if;
 return encode(extensions.digest(convert_to(jsonb_build_object('previous',previous,'scopeFingerprint',ctx#>>'{scope,fingerprint}','scopeState',ctx->>'state')::text,'utf8'),'sha256'),'hex');
end;
$$;
revoke all on function private.execution_approval_input_fingerprint_before_receivables_scope(uuid,uuid),private.execution_approval_input_fingerprint(uuid,uuid) from public,anon,authenticated;

create function private.worker_load_case_input_v2(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token); base jsonb;
begin
 if j.kind<>'case_analysis' then raise exception 'case_analysis_capability_required' using errcode='42501'; end if;
 perform 1 from public.document_intake_sessions where organization_id=j.organization_id and id=j.intake_session_id for update;
 base:=public.worker_load_case_input(p_job_id,p_capability_token);
 return base||jsonb_build_object('confirmed_receivables_scope',private.receivables_evidence_scope_context(j.organization_id,j.intake_session_id));
end;
$$;
create function public.worker_load_case_input_v2(p_job_id uuid,p_capability_token text)
returns jsonb language sql security invoker set search_path='' as $$ select private.worker_load_case_input_v2(p_job_id,p_capability_token); $$;
revoke all on function private.worker_load_case_input_v2(uuid,text),public.worker_load_case_input_v2(uuid,text) from public,anon,authenticated;
grant execute on function private.worker_load_case_input_v2(uuid,text),public.worker_load_case_input_v2(uuid,text) to authenticated;

-- Once linked to its processing run, confirmation metadata is immutable.
create function private.guard_receivables_scope_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and old.processing_run_id is null and new.processing_run_id is not null
    and (to_jsonb(old)-'processing_run_id')=(to_jsonb(new)-'processing_run_id') then return new; end if;
 raise exception 'receivables_scope_immutable' using errcode='42501';
end;
$$;
revoke all on function private.guard_receivables_scope_immutable() from public,anon,authenticated;
create trigger receivables_scope_immutable before update on private.receivables_evidence_scopes
 for each row execute function private.guard_receivables_scope_immutable();

-- Fragment mutations participate in the same session/project order as approvals.
-- No payload bytes or other processing-job locks are read here.
create function private.lock_receivables_scope_fragment() returns trigger language plpgsql security definer set search_path='' as $$
declare org uuid; sess uuid; project uuid;
begin
 if tg_op='DELETE' then org:=old.organization_id; sess:=old.intake_session_id;
 else org:=new.organization_id; sess:=new.intake_session_id;
   if tg_op='UPDATE' and (new.organization_id,new.intake_session_id,new.source_document_id,new.document_version,new.processing_run_id)
     is distinct from (old.organization_id,old.intake_session_id,old.source_document_id,old.document_version,old.processing_run_id)
     then raise exception 'receivables_fragment_identity_immutable' using errcode='42501'; end if;
 end if;
 select capital_project_id into project from public.document_intake_sessions where organization_id=org and id=sess for update;
 perform 1 from public.capital_projects where organization_id=org and id=project for update;
 if tg_op='DELETE' then return old; end if; return new;
end;
$$;
revoke all on function private.lock_receivables_scope_fragment() from public,anon,authenticated;
create trigger receivables_scope_fragment_lock before insert or update or delete on private.receivables_evidence_fragments
 for each row execute function private.lock_receivables_scope_fragment();

create function private.worker_load_agent_context_v4(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token); base jsonb;
begin
 perform 1 from public.document_intake_sessions where organization_id=j.organization_id and id=j.intake_session_id for update;
 base:=private.worker_load_agent_context_v3(p_job_id,p_capability_token);
 return base||jsonb_build_object('confirmed_receivables_scope',private.receivables_evidence_scope_context(j.organization_id,j.intake_session_id));
end;
$$;
create function public.worker_load_agent_context_v4(p_job_id uuid,p_capability_token text)
returns jsonb language sql security invoker set search_path='' as $$ select private.worker_load_agent_context_v4(p_job_id,p_capability_token); $$;
revoke all on function private.worker_load_agent_context_v4(uuid,text),public.worker_load_agent_context_v4(uuid,text) from public,anon,authenticated;
grant execute on function private.worker_load_agent_context_v4(uuid,text),public.worker_load_agent_context_v4(uuid,text) to authenticated;
create function private.worker_load_execution_brief_proposal_v3(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token); base jsonb;
begin
 base:=private.worker_load_execution_brief_proposal_v2(p_job_id,p_capability_token);
 return base||jsonb_build_object('confirmed_receivables_scope',private.receivables_evidence_scope_context(j.organization_id,j.intake_session_id));
end;
$$;
create function public.worker_load_execution_brief_proposal_v3(p_job_id uuid,p_capability_token text)
returns jsonb language sql security invoker set search_path='' as $$ select private.worker_load_execution_brief_proposal_v3(p_job_id,p_capability_token); $$;
revoke all on function private.worker_load_execution_brief_proposal_v3(uuid,text),public.worker_load_execution_brief_proposal_v3(uuid,text) from public,anon,authenticated;
grant execute on function private.worker_load_execution_brief_proposal_v3(uuid,text),public.worker_load_execution_brief_proposal_v3(uuid,text) to authenticated;
