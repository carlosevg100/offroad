begin;do $$begin if to_regclass('private.assessment_input_snapshots')is not null then raise exception 'assessment_candidate_already_installed';end if;end$$;
-- 3V preparation: prospective inputs only. No historical authority backfill.
-- Not a publishable complete cut until proposal/review/adoption consumers are integrated.
set search_path='';
create table private.assessment_input_snapshots(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 work_id uuid not null,job_id uuid not null,human_subject_id uuid not null references auth.users(id),
 origin text not null check(origin in ('case_input','case_effective_input','preliminary_input','retrieval','institutional_context','m07_final')),
 content_fingerprint text not null check(content_fingerprint~'^[a-f0-9]{64}$'),
 source_count integer not null check(source_count>=0),corpus_count integer not null check(corpus_count>=0),
 public_source_count integer not null check(public_source_count>=0),
 total_source_count integer generated always as(source_count+corpus_count+public_source_count) stored,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,work_id,id),unique(organization_id,job_id,origin,content_fingerprint),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,job_id) references public.processing_jobs(organization_id,id)
);
create index assessment_input_work_idx on private.assessment_input_snapshots(organization_id,work_id);
create index assessment_input_subject_idx on private.assessment_input_snapshots(human_subject_id);
create table private.assessment_input_source_links(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 snapshot_id uuid not null,source_version_id uuid not null,rights_version_id uuid not null,
 content_hash text not null check(content_hash~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,snapshot_id,source_version_id),
 foreign key(organization_id,snapshot_id) references private.assessment_input_snapshots(organization_id,id),
 foreign key(organization_id,source_version_id,rights_version_id) references private.source_rights_versions(organization_id,source_version_id,id)
);
create index assessment_source_rights_idx on private.assessment_input_source_links(organization_id,source_version_id,rights_version_id);

create table private.assessment_input_corpus_links(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),snapshot_id uuid not null,
 corpus_kind text not null check(corpus_kind in ('house_playbook','mandate_note','precedent')),
 chunk_id uuid not null,governance_id uuid not null,purpose text,
 content_hash text not null check(content_hash~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,snapshot_id,corpus_kind,chunk_id),
 foreign key(organization_id,snapshot_id) references private.assessment_input_snapshots(organization_id,id)
);
create index assessment_corpus_governance_idx on private.assessment_input_corpus_links(governance_id);

alter table private.assessment_input_snapshots add column m07_recipe_id uuid,
 add column m07_final_retained_payload_id uuid,
 add constraint assessment_snapshot_recipe_fk foreign key(organization_id,m07_recipe_id) references private.capital_m07_recipes(organization_id,id),
 add constraint assessment_snapshot_final_fk foreign key(organization_id,m07_final_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 add constraint assessment_snapshot_public_shape check((origin='m07_final' and num_nonnulls(m07_recipe_id,m07_final_retained_payload_id)=2)
  or(origin<>'m07_final' and num_nonnulls(m07_recipe_id,m07_final_retained_payload_id)=0));
create index assessment_snapshot_recipe_idx on private.assessment_input_snapshots(organization_id,m07_recipe_id);
create index assessment_snapshot_final_idx on private.assessment_input_snapshots(organization_id,m07_final_retained_payload_id);
create table private.assessment_input_public_links(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),snapshot_id uuid not null,
 recipe_component_id uuid not null,license_id uuid not null,retained_payload_id uuid not null,
 content_hash text not null check(content_hash~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,snapshot_id,recipe_component_id),
 foreign key(organization_id,snapshot_id) references private.assessment_input_snapshots(organization_id,id),
 foreign key(organization_id,recipe_component_id) references private.capital_m07_recipe_components(organization_id,id),
 foreign key(organization_id,license_id) references private.capital_public_delivery_licenses(organization_id,id),
 foreign key(organization_id,retained_payload_id) references private.capital_public_retained_payloads(organization_id,id)
);
create index assessment_public_component_idx on private.assessment_input_public_links(organization_id,recipe_component_id);
create index assessment_public_license_idx on private.assessment_input_public_links(organization_id,license_id);
create index assessment_public_payload_idx on private.assessment_input_public_links(organization_id,retained_payload_id);

-- No general JSON scanner guesses source provenance. Only the actual typed loaders
-- supply the source version IDs returned in their documents/sources/context.
create function private.capture_assessment_document_input_v1(p_job uuid,p_token text,p_origin text,p_delivered jsonb,p_versions uuid[],p_corpus_count integer default 0)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs;work uuid;sid uuid;fp text;versions uuid[];v public.source_versions;r private.source_rights_versions;version uuid;
begin
 j:=private.job_for_capability(p_job,p_token);
 if p_origin not in ('case_input','case_effective_input','preliminary_input','retrieval','institutional_context') or p_delivered is null or p_versions is null
  or p_corpus_count is null or p_corpus_count<0 or (p_origin not in ('retrieval','case_effective_input') and p_corpus_count<>0)
  or cardinality(p_versions)>1000 or j.authorization_subject_id is null then raise exception 'assessment_capture_invalid' using errcode='22023';end if;
 select capital_project_id into work from public.document_intake_sessions where organization_id=j.organization_id and id=j.intake_session_id;
 if work is null then raise exception 'assessment_capture_work_required' using errcode='42501';end if;
 perform 1 from public.capital_projects where organization_id=j.organization_id and id=work for no key update;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||j.organization_id::text,0));
 with recursive closure(id) as(select unnest(p_versions) union select d.source_version_id from closure c join private.resource_dependencies d
  on d.organization_id=j.organization_id and d.derived_version_id=c.id)
 select coalesce(array_agg(id order by id),'{}'::uuid[]) into versions from closure;
 if cardinality(versions)>1000 then raise exception 'assessment_capture_source_limit' using errcode='54000';end if;
 foreach version in array versions loop
  select * into v from public.source_versions where organization_id=j.organization_id and id=version for share;
  select * into r from private.source_rights_versions where organization_id=j.organization_id and source_version_id=version order by revision desc limit 1 for share;
  if v.id is null or v.declared_sha256 is null or not exists(select 1 from private.source_version_verifications vr where vr.organization_id=v.organization_id and vr.source_version_id=v.id and vr.observed_sha256=v.declared_sha256 and vr.observed_byte_size=v.byte_size) or r.id is null
   or not private.source_use_allowed_v1(j.organization_id,version,j.authorization_subject_id,'read','analysis')
   or not private.source_use_allowed_v1(j.organization_id,version,j.authorization_subject_id,'process','analysis')
   or not private.source_use_allowed_v1(j.organization_id,version,j.authorization_subject_id,'store','analysis')
   or not private.source_use_allowed_v1(j.organization_id,version,j.authorization_subject_id,'derive','analysis')
   then raise exception 'assessment_capture_source_denied' using errcode='42501';end if;
 end loop;
 fp:=encode(extensions.digest(convert_to(p_delivered::text,'utf8'),'sha256'),'hex');
 select id into sid from private.assessment_input_snapshots where organization_id=j.organization_id and job_id=j.id and origin=p_origin and content_fingerprint=fp;
 if sid is not null then
  if versions is distinct from array(select source_version_id from private.assessment_input_source_links where organization_id=j.organization_id and snapshot_id=sid order by source_version_id)
   or (select corpus_count from private.assessment_input_snapshots where id=sid)<>p_corpus_count
   then raise exception 'assessment_capture_replay_changed' using errcode='23505';end if;
  return sid;
 end if;
 insert into private.assessment_input_snapshots(organization_id,work_id,job_id,human_subject_id,origin,content_fingerprint,source_count,corpus_count,public_source_count)
 values(j.organization_id,work,j.id,j.authorization_subject_id,p_origin,fp,cardinality(versions),p_corpus_count,0) returning id into sid;
 foreach version in array versions loop
  select * into strict v from public.source_versions where organization_id=j.organization_id and id=version;
  select * into strict r from private.source_rights_versions where organization_id=j.organization_id and source_version_id=version order by revision desc limit 1;
  insert into private.assessment_input_source_links(organization_id,snapshot_id,source_version_id,rights_version_id,content_hash)
  values(j.organization_id,sid,version,r.id,v.declared_sha256);
 end loop;
 perform private.job_for_capability(p_job,p_token);
 return sid;
end $$;
revoke all on function private.capture_assessment_document_input_v1(uuid,text,text,jsonb,uuid[],integer) from public,anon,authenticated,service_role;

create function private.assessment_delivered_document_versions_v1(p_org uuid,p_input jsonb)
returns uuid[] language plpgsql volatile security definer set search_path='' as $$
declare document jsonb;v public.source_versions;result uuid[]:='{}';
begin
 if jsonb_typeof(p_input->'documents') is distinct from 'array' then raise exception 'assessment_document_manifest_missing' using errcode='42501';end if;
 for document in select value from jsonb_array_elements(p_input->'documents') loop
  if document->>'id' is null or document->>'document_version' is null or document->>'sha256' is null then
   raise exception 'assessment_document_manifest_unresolved' using errcode='42501';end if;
  select * into v from public.source_versions where organization_id=p_org and id=(document->>'id')::uuid
   and legacy_document_version=(document->>'document_version')::integer and declared_sha256=document->>'sha256' and exists(select 1 from private.source_version_verifications vr where vr.organization_id=p_org and vr.source_version_id=(document->>'id')::uuid and vr.observed_sha256=document->>'sha256') for share;
  if v.id is null then raise exception 'assessment_document_manifest_changed' using errcode='40001';end if;
  result:=array_append(result,v.id);
 end loop;
 return array(select distinct unnest(result) order by 1);
end $$;
revoke all on function private.assessment_delivered_document_versions_v1(uuid,jsonb) from public,anon,authenticated,service_role;

create function private.worker_load_case_assessment_input_v4(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs;answer jsonb;snapshot uuid;begin
 j:=private.job_for_capability(p_job_id,p_capability_token);
 answer:=private.worker_load_case_input_v3(p_job_id,p_capability_token);
 snapshot:=private.capture_assessment_document_input_v1(j.id,p_capability_token,'case_input',answer,
  private.assessment_delivered_document_versions_v1(j.organization_id,answer));
 return answer||jsonb_build_object('assessmentInputSnapshotId',snapshot);
end $$;
create function public.worker_load_case_assessment_input_v4(p_job_id uuid,p_capability_token text)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_load_case_assessment_input_v4(p_job_id,p_capability_token);$$;
create function private.worker_load_preliminary_assessment_input_v3(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs;answer jsonb;snapshot uuid;begin
 j:=private.job_for_capability(p_job_id,p_capability_token);
 answer:=private.worker_load_preliminary_input_v2(p_job_id,p_capability_token);
 snapshot:=private.capture_assessment_document_input_v1(j.id,p_capability_token,'preliminary_input',answer,
  private.assessment_delivered_document_versions_v1(j.organization_id,answer));
 return answer||jsonb_build_object('assessmentInputSnapshotId',snapshot);
end $$;
create function public.worker_load_preliminary_assessment_input_v3(p_job_id uuid,p_capability_token text)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_load_preliminary_assessment_input_v3(p_job_id,p_capability_token);$$;
revoke all on function private.worker_load_case_assessment_input_v4(uuid,text),public.worker_load_case_assessment_input_v4(uuid,text),
 private.worker_load_preliminary_assessment_input_v3(uuid,text),public.worker_load_preliminary_assessment_input_v3(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.worker_load_case_assessment_input_v4(uuid,text),public.worker_load_case_assessment_input_v4(uuid,text),
 private.worker_load_preliminary_assessment_input_v3(uuid,text),public.worker_load_preliminary_assessment_input_v3(uuid,text) to authenticated;

-- Once a primary input has entered the prospective regime, the existing
-- retrieval port captures every selected result too. It cannot bypass the new
-- source closure simply because a consumer still uses its old RPC name.
alter function private.worker_load_retrieval_context(uuid,text,text,uuid[],text,integer) rename to worker_load_retrieval_before_assessment_capture_v1;
revoke all on function private.worker_load_retrieval_before_assessment_capture_v1(uuid,text,text,uuid[],text,integer) from public,anon,authenticated,service_role;
create function private.worker_load_assessment_retrieval_v2(p_job_id uuid,p_capability_token text,p_query text,
 p_allowed_fund_ids uuid[] default '{}',p_precedent_purpose text default null,p_limit integer default 20)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs;answer jsonb;item jsonb;versions uuid[]:='{}';sid uuid;source uuid;governance uuid;house_count integer;
begin
 j:=private.job_for_capability(p_job_id,p_capability_token);
 answer:=private.worker_load_retrieval_before_assessment_capture_v1(p_job_id,p_capability_token,p_query,p_allowed_fund_ids,p_precedent_purpose,p_limit);
 if jsonb_typeof(answer) is distinct from 'object'
  or jsonb_typeof(answer->'results') is distinct from 'array'
  or jsonb_typeof(answer->'abstained') is distinct from 'boolean'
  or jsonb_typeof(answer->'playbook_version') not in ('string','null')
  or not(answer ? 'playbook_version') then
  raise exception 'assessment_retrieval_capture_invalid' using errcode='42501';
 end if;
 if (answer->>'abstained')::boolean is distinct from (jsonb_array_length(answer->'results')=0) then
  raise exception 'assessment_retrieval_capture_invalid' using errcode='42501';
 end if;
 for item in select value from jsonb_array_elements(answer->'results') loop
  source:=null;
  case item->>'source'
   when 'case' then
    select source_document_id into source from public.case_retrieval_chunks where organization_id=j.organization_id and id=(item->>'id')::uuid
     and intake_session_id=j.intake_session_id and content=item->>'content' for share;
   when 'mandate_note' then
    select r.source_version_id into source from public.mandate_note_embeddings n join private.source_rights_versions r
     on (r.organization_id,r.id)=(n.rights_organization_id,n.source_rights_version_id)
     where n.id=(item->>'id')::uuid and n.rights_organization_id=j.organization_id and n.content=item->>'content'
      and n.fund_id=any(p_allowed_fund_ids) for share of n,r;
   when 'precedent' then
    select r.source_version_id into source from public.governed_precedent_chunks c join private.source_rights_versions r
     on (r.organization_id,r.id)=(c.rights_organization_id,c.source_rights_version_id)
     where c.id=(item->>'id')::uuid and c.rights_organization_id=j.organization_id and c.content=item->>'content' for share of c,r;
   when 'house_playbook' then
    select playbook_version_id into governance from public.house_playbook_chunks where id=(item->>'id')::uuid
     and content=item->>'content' and private.house_usage_allowed_v1(playbook_version_id) for share;
    if governance is null then raise exception 'assessment_corpus_capture_denied' using errcode='42501';end if;
   else raise exception 'assessment_retrieval_capture_unknown_origin' using errcode='42501';
  end case;
  if item->>'source'<>'house_playbook' and source is null then raise exception 'assessment_retrieval_capture_denied' using errcode='42501';end if;
  if source is not null then versions:=array_append(versions,source);end if;
 end loop;
 select count(*) into house_count from jsonb_array_elements(answer->'results') i where i->>'source'='house_playbook';
 sid:=private.capture_assessment_document_input_v1(j.id,p_capability_token,'retrieval',
  jsonb_build_object('queryHash',encode(extensions.digest(convert_to(p_query,'utf8'),'sha256'),'hex'),'allowedFunds',to_jsonb(p_allowed_fund_ids),
   'precedentPurpose',p_precedent_purpose,'context',answer),versions,house_count);
 for item in select value from jsonb_array_elements(answer->'results') where value->>'source'<>'case' loop
  governance:=null;
  case item->>'source'
   when 'house_playbook' then select playbook_version_id into governance from public.house_playbook_chunks where id=(item->>'id')::uuid;
   when 'mandate_note' then select fund_id into governance from public.mandate_note_embeddings where id=(item->>'id')::uuid;
   when 'precedent' then select p.authorization_id into governance from public.governed_precedent_chunks c join public.governed_precedents p on p.id=c.precedent_id where c.id=(item->>'id')::uuid;
  end case;
  if governance is null then raise exception 'assessment_corpus_capture_unresolved' using errcode='42501';end if;
  insert into private.assessment_input_corpus_links(organization_id,snapshot_id,corpus_kind,chunk_id,governance_id,purpose,content_hash)
  values(j.organization_id,sid,item->>'source',(item->>'id')::uuid,governance,p_precedent_purpose,
   encode(extensions.digest(convert_to(item->>'content','utf8'),'sha256'),'hex')) on conflict(organization_id,snapshot_id,corpus_kind,chunk_id) do nothing;
 end loop;
 perform private.job_for_capability(p_job_id,p_capability_token);
 return answer;
end $$;
create function public.worker_load_assessment_retrieval_v2(p_job_id uuid,p_capability_token text,p_query text,
 p_allowed_fund_ids uuid[] default '{}',p_precedent_purpose text default null,p_limit integer default 20)
returns jsonb language sql security invoker set search_path='' as $$
 select private.worker_load_assessment_retrieval_v2(p_job_id,p_capability_token,p_query,p_allowed_fund_ids,p_precedent_purpose,p_limit);
$$;
revoke all on function private.worker_load_assessment_retrieval_v2(uuid,text,text,uuid[],text,integer),public.worker_load_assessment_retrieval_v2(uuid,text,text,uuid[],text,integer) from public,anon,authenticated,service_role;
grant execute on function private.worker_load_assessment_retrieval_v2(uuid,text,text,uuid[],text,integer),public.worker_load_assessment_retrieval_v2(uuid,text,text,uuid[],text,integer) to authenticated;

create function private.worker_load_retrieval_context(p_job_id uuid,p_capability_token text,p_query text,
 p_allowed_fund_ids uuid[] default '{}',p_precedent_purpose text default null,p_limit integer default 20)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs;begin
 j:=private.job_for_capability(p_job_id,p_capability_token);
 if exists(select 1 from private.assessment_input_snapshots where organization_id=j.organization_id and job_id=j.id) then
  return private.worker_load_assessment_retrieval_v2(p_job_id,p_capability_token,p_query,p_allowed_fund_ids,p_precedent_purpose,p_limit);
 end if;
 return private.worker_load_retrieval_before_assessment_capture_v1(p_job_id,p_capability_token,p_query,p_allowed_fund_ids,p_precedent_purpose,p_limit);
end $$;
revoke all on function private.worker_load_retrieval_context(uuid,text,text,uuid[],text,integer) from public,anon,authenticated,service_role;
grant execute on function private.worker_load_retrieval_context(uuid,text,text,uuid[],text,integer) to authenticated;

-- Explicit native M07 producer port. The legacy public v6 context does not call
-- this and never receives a fabricated zero-source assessment capture.
create function private.worker_capture_m07_assessment_inputs_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_final_retained_payload_id uuid)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs;r private.capital_m07_recipes;seal private.capital_m07_recipe_seals;
 a private.capital_public_payload_allocations;b private.capital_m07_body_bases;sid uuid;fp text;count_public integer;
begin
 j:=private.job_for_capability(p_job_id,p_capability_token);
 perform private.require_capital_m07_recipe_v1(j.id,p_capability_token,p_recipe_id);
 select * into strict r from private.capital_m07_recipes where organization_id=j.organization_id and id=p_recipe_id and job_id=j.id;
 select * into strict seal from private.capital_m07_recipe_seals where organization_id=j.organization_id and recipe_id=r.id;
 select x.* into a from private.capital_public_retained_payloads p join private.capital_public_payload_allocations x
  on (x.organization_id,x.id)=(p.organization_id,p.allocation_id) where p.organization_id=j.organization_id and p.id=p_final_retained_payload_id;
 select * into b from private.capital_m07_body_bases where organization_id=j.organization_id and id=a.m07_body_basis_id;
 if a.id is null or a.job_id<>j.id or b.recipe_id is distinct from r.id or b.kind is distinct from 'final'
  or not private.capital_body_physical_receipt_v1(j.organization_id,p_final_retained_payload_id)
  or private.capital_m07_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id) is null
  or not exists(select 1 from private.capital_public_payload_purge_queue where organization_id=j.organization_id and allocation_id=a.id and status='pending')
  or least(a.expires_at,a.purge_at)<=clock_timestamp() then raise exception 'assessment_m07_capture_denied' using errcode='42501';end if;
 fp:=encode(extensions.digest(jsonb_build_object('recipeId',r.id,'recipeFingerprint',seal.recipe_fingerprint,'finalRetainedPayloadId',p_final_retained_payload_id,
  'finalFingerprint',a.payload_fingerprint,'finalByteLength',a.byte_length)::text,'sha256'),'hex');
 select count(*) into count_public from private.capital_m07_recipe_components where organization_id=j.organization_id and recipe_id=r.id and slot='source';
 select id into sid from private.assessment_input_snapshots where organization_id=j.organization_id and job_id=j.id and origin='m07_final' and content_fingerprint=fp;
 if sid is not null then return sid;end if;
 insert into private.assessment_input_snapshots(organization_id,work_id,job_id,human_subject_id,origin,content_fingerprint,
  source_count,corpus_count,public_source_count,m07_recipe_id,m07_final_retained_payload_id)
 values(j.organization_id,r.work_id,j.id,j.authorization_subject_id,'m07_final',fp,0,0,count_public,r.id,p_final_retained_payload_id) returning id into sid;
 insert into private.assessment_input_public_links(organization_id,snapshot_id,recipe_component_id,license_id,retained_payload_id,content_hash)
 select j.organization_id,sid,c.id,c.license_id,c.retained_payload_id,c.body_fingerprint from private.capital_m07_recipe_components c
 where c.organization_id=j.organization_id and c.recipe_id=r.id and c.slot='source';
 perform private.job_for_capability(p_job_id,p_capability_token);
 return sid;
end $$;
create function public.worker_capture_m07_assessment_inputs_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_final_retained_payload_id uuid)
returns uuid language sql security invoker set search_path='' as $$select private.worker_capture_m07_assessment_inputs_v1(p_job_id,p_capability_token,p_recipe_id,p_final_retained_payload_id);$$;
revoke all on function private.worker_capture_m07_assessment_inputs_v1(uuid,text,uuid,uuid),public.worker_capture_m07_assessment_inputs_v1(uuid,text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.worker_capture_m07_assessment_inputs_v1(uuid,text,uuid,uuid),public.worker_capture_m07_assessment_inputs_v1(uuid,text,uuid,uuid) to authenticated;

create function private.assessment_input_snapshot_authority_v1(p_org uuid,p_snapshot uuid,p_actor uuid)
returns text language plpgsql volatile security definer set search_path='' as $$
declare s private.assessment_input_snapshots;link private.assessment_input_source_links;corpus private.assessment_input_corpus_links;
 v public.source_versions;r private.source_rights_versions;valid boolean;
begin
 select * into s from private.assessment_input_snapshots where organization_id=p_org and id=p_snapshot;
 if s.id is null then return 'unresolved';end if;
 if not private.resource_access_as_subject_v1(p_org,s.work_id,p_actor,'read') then return 'denied';end if;
 if s.origin='m07_final' then
  if s.public_source_count<>(select count(*) from private.assessment_input_public_links where organization_id=p_org and snapshot_id=s.id)
   or exists(select 1 from private.assessment_input_public_links l left join private.capital_m07_recipe_components c
    on(c.organization_id,c.id,c.recipe_id,c.license_id,c.retained_payload_id,c.body_fingerprint)=
      (l.organization_id,l.recipe_component_id,s.m07_recipe_id,l.license_id,l.retained_payload_id,l.content_hash)
    where l.organization_id=p_org and l.snapshot_id=s.id and c.id is null)
   or s.public_source_count<>(select count(*) from private.capital_m07_recipe_components where organization_id=p_org and recipe_id=s.m07_recipe_id and slot='source')
   then return 'unresolved';end if;
  if private.capital_m07_recipe_deadline_v1(p_org,s.m07_recipe_id,p_actor) is null
   or not private.capital_body_physical_receipt_v1(p_org,s.m07_final_retained_payload_id)
   or not exists(select 1 from private.capital_public_retained_payloads p join private.capital_public_payload_allocations a
    on(a.organization_id,a.id)=(p.organization_id,p.allocation_id) join private.capital_m07_body_bases b on(b.organization_id,b.id)=(a.organization_id,a.m07_body_basis_id)
    where p.organization_id=p_org and p.id=s.m07_final_retained_payload_id and b.recipe_id=s.m07_recipe_id and b.kind='final'
     and least(a.expires_at,a.purge_at)>clock_timestamp() and exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=p_org and q.allocation_id=a.id and q.status='pending'))
   then return 'denied';end if;
 elsif s.public_source_count<>0 then return 'unresolved';end if;
 if s.source_count<>(select count(*) from private.assessment_input_source_links where organization_id=p_org and snapshot_id=s.id)
  or s.corpus_count<>(select count(*) from private.assessment_input_corpus_links where organization_id=p_org and snapshot_id=s.id and corpus_kind='house_playbook')
  then return 'unresolved';end if;
 for link in select * from private.assessment_input_source_links where organization_id=p_org and snapshot_id=s.id loop
  select * into v from public.source_versions where organization_id=p_org and id=link.source_version_id;
  select * into r from private.source_rights_versions where organization_id=p_org and id=link.rights_version_id and source_version_id=v.id;
  if v.id is null or r.id is null or v.declared_sha256 is distinct from link.content_hash or not exists(select 1 from private.source_version_verifications vr where vr.organization_id=v.organization_id and vr.source_version_id=v.id and vr.observed_sha256=v.declared_sha256 and vr.observed_byte_size=v.byte_size) then return 'unresolved';end if;
  if not private.source_use_allowed_v1(p_org,v.id,p_actor,'read','analysis') or not private.source_use_allowed_v1(p_org,v.id,p_actor,'store','analysis')
   or r.valid_from>clock_timestamp() or r.expires_at<=clock_timestamp() or r.store_until<=clock_timestamp()
   or not(array['read','process','store','derive']::text[]<@r.operations) or not('analysis'=any(r.purposes)) then return 'denied';end if;
 end loop;
 for corpus in select * from private.assessment_input_corpus_links where organization_id=p_org and snapshot_id=s.id loop
  valid:=false;
  case corpus.corpus_kind
   when 'house_playbook' then
    perform 1 from public.house_playbook_chunks c join public.house_playbook_versions v on v.id=c.playbook_version_id join auth.users u on u.id=v.approved_by
     where c.id=corpus.chunk_id and v.id=corpus.governance_id for share of c,v,u nowait;
    if not found then return 'denied';end if;
    select exists(select 1 from public.house_playbook_chunks c where c.id=corpus.chunk_id and c.playbook_version_id=corpus.governance_id
     and encode(extensions.digest(convert_to(c.content,'utf8'),'sha256'),'hex')=corpus.content_hash and private.house_usage_allowed_v1(c.playbook_version_id)) into valid;
   when 'mandate_note' then
    perform 1 from public.mandate_note_embeddings where id=corpus.chunk_id for share nowait;
    if not found then return 'denied';end if;
    select exists(select 1 from public.mandate_note_embeddings n where n.id=corpus.chunk_id and n.fund_id=corpus.governance_id and n.rights_organization_id=p_org
     and encode(extensions.digest(convert_to(n.content,'utf8'),'sha256'),'hex')=corpus.content_hash
     and private.licensed_corpus_use_v1(p_org,n.source_rights_version_id,p_actor,'analysis')) into valid;
   when 'precedent' then
    perform 1 from public.governed_precedent_chunks c join public.governed_precedents p on p.id=c.precedent_id join public.precedent_authorizations a on a.id=p.authorization_id
     where c.id=corpus.chunk_id and a.id=corpus.governance_id for share of c,p,a nowait;
    if not found then return 'denied';end if;
    select exists(select 1 from public.governed_precedent_chunks c join public.governed_precedents p on p.id=c.precedent_id
     join public.precedent_authorizations a on a.id=p.authorization_id where c.id=corpus.chunk_id and c.rights_organization_id=p_org and a.id=corpus.governance_id
      and encode(extensions.digest(convert_to(c.content,'utf8'),'sha256'),'hex')=corpus.content_hash
      and p.anonymization_status='approved' and p.governance_status='approved' and a.status='active'
      and corpus.purpose=any(a.authorized_purposes) and (a.expires_at is null or a.expires_at>clock_timestamp())
      and private.licensed_corpus_use_v1(p_org,c.source_rights_version_id,p_actor,'analysis')) into valid;
  end case;
  if not coalesce(valid,false) then return 'denied';end if;
 end loop;
 return 'allowed';
end $$;
revoke all on function private.assessment_input_snapshot_authority_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

do $$declare t text;begin
 foreach t in array array['assessment_input_snapshots','assessment_input_source_links','assessment_input_corpus_links','assessment_input_public_links'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('create policy %I on private.%I for select to authenticated using(false)',t||'_deny_select',t);
  execute format('create policy %I on private.%I for insert to authenticated with check(false)',t||'_deny_insert',t);
  execute format('create policy %I on private.%I for update to authenticated using(false) with check(false)',t||'_deny_update',t);
  execute format('create policy %I on private.%I for delete to authenticated using(false)',t||'_deny_delete',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_review_history_mutation_v1()',t||'_immutable',t);
  execute format('create trigger %I before truncate on private.%I for each statement execute function private.reject_review_history_mutation_v1()',t||'_no_truncate',t);
  execute format('create trigger %I after insert on private.%I for each row execute function private.capture_audit_event()',t||'_audit',t);
 end loop;
end $$;

-- Requires assessment_input_capture.sql and 3P. Prospectively fixed producer
-- lineage; no promotion of old decisions lacking actual delivered inputs.
set search_path='';
create table private.assessment_proposal_receipts(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,
 assessment_decision_id uuid not null,decision_key text not null,decision_revision integer not null check(decision_revision>0),
 decision_fingerprint text not null check(decision_fingerprint~'^[a-f0-9]{64}$'),
 job_id uuid not null,prepared_by uuid not null references auth.users(id),assessment_ref text not null,
 assessment_fingerprint text not null check(assessment_fingerprint~'^[a-f0-9]{64}$'),
 input_fingerprint text not null check(input_fingerprint~'^[a-f0-9]{64}$'),snapshot_ids uuid[] not null check(cardinality(snapshot_ids)>0),
 source_count integer not null check(source_count>=0),corpus_count integer not null check(corpus_count>=0),public_source_count integer not null check(public_source_count>=0),
 total_source_count integer generated always as(source_count+corpus_count+public_source_count) stored,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,assessment_decision_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,assessment_decision_id) references public.capital_project_decisions(organization_id,id),
 foreign key(organization_id,job_id) references public.processing_jobs(organization_id,id)
);
create index assessment_proposal_work_idx on private.assessment_proposal_receipts(organization_id,work_id);
create index assessment_proposal_job_idx on private.assessment_proposal_receipts(organization_id,job_id);
create index assessment_proposal_preparer_idx on private.assessment_proposal_receipts(prepared_by);
create table private.assessment_review_projections(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,
 assessment_decision_id uuid not null,proposal_receipt_id uuid not null,basis_receipt_id uuid not null,decision_id uuid not null,command_id uuid not null,
 actor_id uuid not null references auth.users(id),prepared_by uuid not null references auth.users(id),self_approval_declared boolean not null,
 outcome text not null check(outcome in ('approved','rejected')),frozen boolean not null,
 proposal_fingerprint text not null check(proposal_fingerprint~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,assessment_decision_id),unique(organization_id,command_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,assessment_decision_id) references public.capital_project_decisions(organization_id,id),
 foreign key(organization_id,proposal_receipt_id) references private.assessment_proposal_receipts(organization_id,id),
 foreign key(organization_id,basis_receipt_id) references private.review_basis_receipts(organization_id,id),
 foreign key(organization_id,decision_id) references public.work_decisions(organization_id,id),
 check(outcome<>'approved' or frozen)
);
create index assessment_review_work_idx on private.assessment_review_projections(organization_id,work_id);
create index assessment_review_proposal_idx on private.assessment_review_projections(organization_id,proposal_receipt_id);
create index assessment_review_basis_idx on private.assessment_review_projections(organization_id,basis_receipt_id);
create index assessment_review_decision_idx on private.assessment_review_projections(organization_id,decision_id);
create index assessment_review_actor_idx on private.assessment_review_projections(actor_id);
create index assessment_review_preparer_idx on private.assessment_review_projections(prepared_by);

-- Open assessments can be rejected without inventing a financing recommendation.
-- The other checks, including confirmed needing reviewer, remain unchanged.
do $$declare target text;matches integer;begin
 select count(*),min(conname) into matches,target from pg_constraint where conrelid='public.capital_project_decisions'::regclass
  and contype='c' and pg_get_constraintdef(oid) ~ 'status.*open.*recommendation IS NOT NULL';
 if matches<>1 then raise exception 'assessment_recommendation_constraint_unresolved';end if;
 execute format('alter table public.capital_project_decisions drop constraint %I',target);
end $$;
alter table public.capital_project_decisions add constraint assessment_status_recommendation_required
 check(status in ('open','rejected') or recommendation is not null);

-- Preserve the installed worker body, including its complete specialist request
-- batch. Change only the placeholder in-place branch after a real capture.
alter function private.worker_record_agent_assessment_v1(uuid,text,jsonb) rename to worker_record_agent_assessment_before_native_v1;
revoke all on function private.worker_record_agent_assessment_before_native_v1(uuid,text,jsonb) from public,anon,authenticated,service_role;
do $$declare body text;needle text:='if found and prior_decision.status = ''open'' and prior_decision.recommendation is null then';begin
 body:=pg_get_functiondef('private.worker_record_agent_assessment_before_native_v1(uuid,text,jsonb)'::regprocedure);
 if position(needle in body)=0 then raise exception 'assessment_placeholder_guard_target_missing';end if;
 body:=replace(body,needle,'if found and prior_decision.status = ''open'' and prior_decision.recommendation is null
  and not exists(select 1 from private.assessment_proposal_receipts where organization_id=job_row.organization_id and assessment_decision_id=prior_decision.id) then');
 body:=replace(body,'if found and prior_decision.status in (''confirmed'', ''rejected'') then',
  'if found and prior_decision.status in (''confirmed'', ''rejected'') and private.assessment_worker_freeze_required_v1(job_row.organization_id,session_row.capital_project_id,prior_decision.id) then');
 body:=replace(body,'if found and prior_decision.reviewed_by is not null then',
  'if found and prior_decision.reviewed_by is not null and private.assessment_worker_freeze_required_v1(job_row.organization_id,session_row.capital_project_id,prior_decision.id) then');
 -- A later machine proposal may refer to the predecessor but never changes the
 -- human row. Null-recommendation predecessors also stay open as historical indices.
 body:=replace(body,'where decision.organization_id = job_row.organization_id' || chr(10) || '        and decision.id = prior_decision.id;',
  'where decision.organization_id = job_row.organization_id' || chr(10) || '        and decision.id = prior_decision.id and prior_decision.reviewed_by is null and prior_decision.recommendation is not null;');
 execute body;
end $$;

create function private.worker_record_agent_assessment_v1(p_job_id uuid,p_capability_token text,p_assessment jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs;begin
 j:=private.job_for_capability(p_job_id,p_capability_token);
 -- No product users rely on legacy case/preliminary experiments. Deny by
 -- server-owned kind even before capture or after a denied capture rolls back.
 if j.kind in('case_analysis','preliminary_analysis')
  or exists(select 1 from private.assessment_input_snapshots where organization_id=j.organization_id and job_id=j.id) then
  raise exception 'assessment_native_writer_required' using errcode='42501';end if;
 return private.worker_record_agent_assessment_before_native_v1(p_job_id,p_capability_token,p_assessment);
end $$;
revoke all on function private.worker_record_agent_assessment_v1(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.worker_record_agent_assessment_v1(uuid,text,jsonb) to authenticated;

create function private.assessment_proposal_authority_v1(p_org uuid,p_receipt uuid,p_actor uuid)
returns text language plpgsql volatile security definer set search_path='' as $$
declare p private.assessment_proposal_receipts;d public.capital_project_decisions;snapshot uuid;state text;counted integer;actual_fp text;actual_sources integer;actual_corpus integer;actual_public integer;
begin
 select * into p from private.assessment_proposal_receipts where organization_id=p_org and id=p_receipt;
 if p.id is null then return 'unresolved';end if;
 -- The documentary capture does not certify external research merely because
 -- metadata was saved by the old collector. Never convert those sources to zero.
 if exists(select 1 from public.processing_jobs j join public.public_research_runs r on(r.organization_id,r.processing_run_id)=(j.organization_id,j.processing_run_id)
  join public.public_research_sources rs on(rs.organization_id,rs.research_run_id)=(r.organization_id,r.id)
  where j.organization_id=p_org and j.id=p.job_id and j.kind in('case_analysis','preliminary_analysis')) then return 'unresolved';end if;
 select * into d from public.capital_project_decisions where organization_id=p_org and id=p.assessment_decision_id;
 if d.id is null or (d.capital_project_id,d.decision_key,d.revision,d.decision_fingerprint,d.assessment_ref)
  is distinct from (p.work_id,p.decision_key,p.decision_revision,p.decision_fingerprint,p.assessment_ref) then return 'unresolved';end if;
 select count(*) into counted from private.assessment_input_snapshots where organization_id=p_org and work_id=p.work_id and job_id=p.job_id
  and id=any(p.snapshot_ids) and human_subject_id=p.prepared_by;
 if counted<>cardinality(p.snapshot_ids) then return 'unresolved';end if;
 select encode(extensions.digest(jsonb_agg(jsonb_build_object('id',id,'fingerprint',content_fingerprint) order by id)::text,'sha256'),'hex')
 into actual_fp from private.assessment_input_snapshots where organization_id=p_org and id=any(p.snapshot_ids);
 select count(distinct source_version_id) into actual_sources from private.assessment_input_source_links where organization_id=p_org and snapshot_id=any(p.snapshot_ids);
 select count(distinct chunk_id) into actual_corpus from private.assessment_input_corpus_links where organization_id=p_org and snapshot_id=any(p.snapshot_ids) and corpus_kind='house_playbook';
 select count(*)into actual_public from(select distinct 'm07:'||recipe_component_id::text as id from private.assessment_input_public_links where organization_id=p_org and snapshot_id=any(p.snapshot_ids)union select distinct 'research:'||delivery_id::text from private.assessment_research_source_links where organization_id=p_org and snapshot_id=any(p.snapshot_ids))x;
 if(actual_fp,actual_sources,actual_corpus,actual_public) is distinct from(p.input_fingerprint,p.source_count,p.corpus_count,p.public_source_count)
 then return 'unresolved';end if;
 foreach snapshot in array p.snapshot_ids loop
  state:=private.assessment_input_snapshot_authority_v1(p_org,snapshot,p_actor);
  if state<>'allowed' then return state;end if;
 end loop;
 return 'allowed';
end $$;
revoke all on function private.assessment_proposal_authority_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.assessment_proposal_fingerprint_v1(p_org uuid,p_receipt uuid)
returns text language sql stable security definer set search_path='' as $$
 select encode(extensions.digest(jsonb_build_object('workId',p.work_id,'assessmentId',p.assessment_decision_id,
  'decisionKey',p.decision_key,'revision',p.decision_revision,'decisionFingerprint',p.decision_fingerprint,
  'assessmentFingerprint',p.assessment_fingerprint,'inputFingerprint',p.input_fingerprint,
  'preparedBy',p.prepared_by,'jobId',p.job_id,'assessmentRef',p.assessment_ref)::text,'sha256'),'hex')
 from private.assessment_proposal_receipts p where organization_id=p_org and id=p_receipt;
$$;
revoke all on function private.assessment_proposal_fingerprint_v1(uuid,uuid) from public,anon,authenticated,service_role;

create function private.assessment_review_effective_v1(p_org uuid,p_work uuid,p_assessment uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare projection private.assessment_review_projections;state jsonb;decision public.work_decisions;
begin
 select * into projection from private.assessment_review_projections where organization_id=p_org and work_id=p_work and assessment_decision_id=p_assessment;
 if projection.id is null then return false;end if;
 select * into decision from public.work_decisions where organization_id=p_org and id=projection.decision_id;
 if decision.id is null or(decision.work_id,decision.kind,decision.outcome,decision.decided_by,decision.command_id)
  is distinct from(p_work,'confirm_assessment'::text,projection.outcome,projection.actor_id,projection.command_id)
  or not exists(select 1 from private.review_basis_receipts r where(r.organization_id,r.id,r.work_id)=(p_org,projection.basis_receipt_id,p_work)
   and r.basis_kind='assessment' and jsonb_build_array(r.basis_reference)=decision.basis->'assessments'
   and r.source_count=(select count(*) from private.review_basis_source_links l where(l.organization_id,l.receipt_id)=(p_org,r.id))) then return false;end if;
 state:=private.work_decision_precedence_v1(p_org,p_work,'assessment:'||p_assessment::text);
 return coalesce(state->>'state'='current' and(state->>'currentId')::uuid=projection.decision_id,false);
end $$;
revoke all on function private.assessment_review_effective_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.assessment_worker_freeze_required_v1(p_org uuid,p_work uuid,p_assessment uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare projection private.assessment_review_projections;
begin
 select * into projection from private.assessment_review_projections where organization_id=p_org and work_id=p_work and assessment_decision_id=p_assessment;
 -- Uncaptured historical decisions retain the installed conservative behavior.
 if projection.id is null then return true;end if;
 return projection.frozen and private.assessment_review_effective_v1(p_org,p_work,p_assessment);
end $$;
revoke all on function private.assessment_worker_freeze_required_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.worker_record_agent_assessment_v2(p_job_id uuid,p_capability_token text,p_assessment jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs;work uuid;ids uuid[];source_count integer;corpus_count integer;public_count integer;fp text;inputs_fp text;
 result jsonb;d public.capital_project_decisions;old private.assessment_proposal_receipts;snapshot uuid;state text;dec jsonb;
begin
 j:=private.job_for_capability(p_job_id,p_capability_token);
 if j.kind='capital_project_analysis' then raise exception 'assessment_m07_index_producer_required' using errcode='42501';end if;
 if not exists(select 1 from private.assessment_input_snapshots where organization_id=j.organization_id and job_id=j.id and origin='public_research')then raise exception 'assessment_research_capture_required'using errcode='42501';end if;
 if exists(select 1 from public.public_research_runs r join public.public_research_sources s on(s.organization_id,s.research_run_id)=(r.organization_id,r.id)
  where r.organization_id=j.organization_id and r.processing_run_id=j.processing_run_id) then
  raise exception 'assessment_public_research_capture_required' using errcode='42501';end if;
 select capital_project_id into work from public.document_intake_sessions where organization_id=j.organization_id and id=j.intake_session_id;
 perform 1 from public.capital_projects where organization_id=j.organization_id and id=work for no key update;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||j.organization_id::text,0));
 if not exists(select 1 from private.assessment_input_snapshots where organization_id=j.organization_id and job_id=j.id
  and ((j.kind='case_analysis' and origin='case_effective_input') or(j.kind='preliminary_analysis' and origin='preliminary_input')
   or(j.kind='capital_project_analysis' and origin='m07_final'))) then raise exception 'assessment_primary_capture_required' using errcode='42501';end if;
 select array_agg(id order by id),encode(extensions.digest(coalesce(jsonb_agg(jsonb_build_object('id',id,'fingerprint',content_fingerprint) order by id),'[]')::text,'sha256'),'hex')
  into ids,inputs_fp from private.assessment_input_snapshots where organization_id=j.organization_id and work_id=work and job_id=j.id;
 foreach snapshot in array ids loop
  state:=private.assessment_input_snapshot_authority_v1(j.organization_id,snapshot,j.authorization_subject_id);
  if state<>'allowed' then raise exception 'assessment_input_authority_denied' using errcode='42501';end if;
 end loop;
 select count(distinct source_version_id) into source_count from private.assessment_input_source_links where organization_id=j.organization_id and snapshot_id=any(ids);
 select count(distinct chunk_id) into corpus_count from private.assessment_input_corpus_links where organization_id=j.organization_id and snapshot_id=any(ids) and corpus_kind='house_playbook';
 select count(*)into public_count from(select distinct 'm07:'||recipe_component_id::text as id from private.assessment_input_public_links where organization_id=j.organization_id and snapshot_id=any(ids)union select distinct 'research:'||delivery_id::text from private.assessment_research_source_links where organization_id=j.organization_id and snapshot_id=any(ids))x;
 fp:=encode(extensions.digest(convert_to(p_assessment::text,'utf8'),'sha256'),'hex');
 if exists(select 1 from private.assessment_proposal_receipts where organization_id=j.organization_id and work_id=work and job_id=j.id
  and assessment_ref=p_assessment->>'assessmentRef' and (assessment_fingerprint<>fp or input_fingerprint<>inputs_fp)) then
  raise exception 'assessment_proposal_replay_changed' using errcode='23505';end if;
 result:=private.worker_record_agent_assessment_before_native_v1(j.id,p_capability_token,p_assessment);
 for dec in select value from jsonb_array_elements(p_assessment->'decisions') loop
  select * into d from public.capital_project_decisions where organization_id=j.organization_id and capital_project_id=work
   and decision_key=dec->>'decisionKey' and decision_fingerprint=dec->>'fingerprint' and assessment_ref=p_assessment->>'assessmentRef';
  -- A frozen human predecessor makes the installed writer intentionally skip this
  -- proposal. It receives no receipt and is never relabelled as a native approval.
  if d.id is null then continue;end if;
  select * into old from private.assessment_proposal_receipts where organization_id=j.organization_id and assessment_decision_id=d.id;
  if old.id is not null then
   if old.assessment_fingerprint<>fp or old.input_fingerprint<>inputs_fp or old.prepared_by<>j.authorization_subject_id or old.job_id<>j.id then
    raise exception 'assessment_proposal_replay_changed' using errcode='23505';end if;
  else
   insert into private.assessment_proposal_receipts(organization_id,work_id,assessment_decision_id,decision_key,decision_revision,decision_fingerprint,
    job_id,prepared_by,assessment_ref,assessment_fingerprint,input_fingerprint,snapshot_ids,source_count,corpus_count,public_source_count)
   values(j.organization_id,work,d.id,d.decision_key,d.revision,d.decision_fingerprint,j.id,j.authorization_subject_id,d.assessment_ref,fp,inputs_fp,ids,source_count,corpus_count,public_count);
  end if;
 end loop;
 foreach snapshot in array ids loop
  if private.assessment_input_snapshot_authority_v1(j.organization_id,snapshot,j.authorization_subject_id)<>'allowed' then raise exception 'assessment_input_authority_denied' using errcode='42501';end if;
 end loop;
 perform private.job_for_capability(p_job_id,p_capability_token);
 return result;
end $$;
create function public.worker_record_agent_assessment_v2(p_job_id uuid,p_capability_token text,p_assessment jsonb)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_record_agent_assessment_v2(p_job_id,p_capability_token,p_assessment);$$;
revoke all on function private.worker_record_agent_assessment_v2(uuid,text,jsonb),public.worker_record_agent_assessment_v2(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.worker_record_agent_assessment_v2(uuid,text,jsonb),public.worker_record_agent_assessment_v2(uuid,text,jsonb) to authenticated;

-- M07 stores an index to the retained final only. No model-authored financial
-- recommendation, rationale, evidence or readout crosses into permanent rows.
create function private.worker_record_m07_assessment_index_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_final_retained_payload_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs;sid uuid;s private.assessment_input_snapshots;old public.capital_project_decisions;d public.capital_project_decisions;
 receipt private.assessment_proposal_receipts;fp text;inputs_fp text;native_assessment_ref text;new_id uuid;
begin
 j:=private.job_for_capability(p_job_id,p_capability_token);
 if j.kind<>'capital_project_analysis' then raise exception 'assessment_m07_job_required' using errcode='42501';end if;
 sid:=private.worker_capture_m07_assessment_inputs_v1(j.id,p_capability_token,p_recipe_id,p_final_retained_payload_id);
 select * into strict s from private.assessment_input_snapshots where organization_id=j.organization_id and id=sid;
 perform 1 from public.capital_projects where organization_id=j.organization_id and id=s.work_id for no key update;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||j.organization_id::text,0));
 if private.assessment_input_snapshot_authority_v1(j.organization_id,s.id,j.authorization_subject_id)<>'allowed' then
  raise exception 'assessment_input_authority_denied' using errcode='42501';end if;
 native_assessment_ref:='m07-index:'||p_recipe_id::text;
 fp:=encode(extensions.digest(jsonb_build_object('schema','m07-assessment-index.v1','recipeId',p_recipe_id,
  'finalRetainedPayloadId',p_final_retained_payload_id,'snapshotFingerprint',s.content_fingerprint)::text,'sha256'),'hex');
 inputs_fp:=encode(extensions.digest(jsonb_build_array(jsonb_build_object('id',s.id,'fingerprint',s.content_fingerprint))::text,'sha256'),'hex');
 select p.* into receipt from private.assessment_proposal_receipts p where p.organization_id=j.organization_id and p.work_id=s.work_id and p.assessment_ref=native_assessment_ref and p.job_id=j.id;
 if receipt.id is not null then
  if receipt.assessment_fingerprint<>fp or receipt.input_fingerprint<>inputs_fp or receipt.prepared_by<>j.authorization_subject_id then
   raise exception 'assessment_proposal_replay_changed' using errcode='23505';end if;
  perform private.job_for_capability(j.id,p_capability_token);
  return jsonb_build_object('assessmentId',receipt.assessment_decision_id,'proposalReceiptId',receipt.id,'replayed',true);
 end if;
 select * into old from public.capital_project_decisions where organization_id=j.organization_id and capital_project_id=s.work_id
  and decision_key='capital_strategy.assessment_review' order by revision desc limit 1 for update;
 if old.id is not null and old.reviewed_by is not null and private.assessment_worker_freeze_required_v1(j.organization_id,s.work_id,old.id) then
  return jsonb_build_object('skippedHumanFrozen',true,'assessmentId',old.id);end if;
 new_id:=gen_random_uuid();
 insert into public.capital_project_decisions(id,organization_id,capital_project_id,decision_key,revision,status,question,recommendation,
  alternatives,rationale_summary,evidence,assumptions,unresolved,confidence,proposed_by,reviewed_by,supersedes_decision_id,schema_version,
  decision_fingerprint,assessment_ref,created_by)
 values(new_id,j.organization_id,s.work_id,'capital_strategy.assessment_review',coalesce(old.revision,0)+1,'open',
  'A análise está pronta para confirmação humana?',null,'[]','Índice da análise; conteúdo sujeito à política de retenção.',
  '[]','[]','[]','insufficient','deal_captain',null,old.id,'dcm-decision.v1',fp,native_assessment_ref,j.authorization_subject_id)
 returning * into d;
 insert into private.assessment_proposal_receipts(organization_id,work_id,assessment_decision_id,decision_key,decision_revision,decision_fingerprint,
  job_id,prepared_by,assessment_ref,assessment_fingerprint,input_fingerprint,snapshot_ids,source_count,corpus_count,public_source_count)
 values(j.organization_id,s.work_id,d.id,d.decision_key,d.revision,d.decision_fingerprint,j.id,j.authorization_subject_id,native_assessment_ref,fp,inputs_fp,array[s.id],0,0,s.public_source_count)
 returning * into receipt;
 if private.assessment_proposal_authority_v1(j.organization_id,receipt.id,j.authorization_subject_id)<>'allowed' then
  raise exception 'assessment_input_authority_denied' using errcode='42501';end if;
 perform private.job_for_capability(j.id,p_capability_token);
 return jsonb_build_object('assessmentId',d.id,'proposalReceiptId',receipt.id,'replayed',false);
end $$;
create function public.worker_record_m07_assessment_index_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_final_retained_payload_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_record_m07_assessment_index_v1(p_job_id,p_capability_token,p_recipe_id,p_final_retained_payload_id);$$;
revoke all on function private.worker_record_m07_assessment_index_v1(uuid,text,uuid,uuid),public.worker_record_m07_assessment_index_v1(uuid,text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.worker_record_m07_assessment_index_v1(uuid,text,uuid,uuid),public.worker_record_m07_assessment_index_v1(uuid,text,uuid,uuid) to authenticated;

create function private.preserve_native_assessment_proposal_v1()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.assessment_proposal_receipts where organization_id=old.organization_id and assessment_decision_id=old.id) then
  if tg_op='DELETE' then raise exception 'assessment_proposal_immutable' using errcode='23514';end if;
  if (to_jsonb(new)-array['status','reviewed_by','updated_at']) is distinct from (to_jsonb(old)-array['status','reviewed_by','updated_at']) then
   raise exception 'assessment_proposal_immutable' using errcode='23514';end if;
  if (new.status,new.reviewed_by) is distinct from (old.status,old.reviewed_by)
   and (new.reviewed_by is not null or old.reviewed_by is not null)
   and not exists(select 1 from private.assessment_review_projections p join public.work_decisions d on(d.organization_id,d.id)=(p.organization_id,p.decision_id)
    where p.organization_id=old.organization_id and p.assessment_decision_id=old.id and p.actor_id=auth.uid()
     and d.decided_by=auth.uid() and d.outcome=p.outcome and (new.reviewed_by='user')
     and ((p.outcome='approved' and new.status=case when old.recommendation is null then 'open' else 'confirmed' end)
       or(p.outcome='rejected' and new.status='rejected'))) then
   raise exception 'assessment_native_review_required' using errcode='42501';end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function private.preserve_native_assessment_proposal_v1() from public,anon,authenticated,service_role;
create trigger assessment_proposal_preserve before update or delete on public.capital_project_decisions
 for each row execute function private.preserve_native_assessment_proposal_v1();

create function private.read_assessment_review_basis_v2(p_work_id uuid,p_assessment_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare p private.assessment_proposal_receipts;d public.capital_project_decisions;org uuid;actor uuid:=auth.uid();policy jsonb;state text;projection private.assessment_review_projections;
begin
 select organization_id into org from public.capital_projects where id=p_work_id and status<>'archived';
 if org is null or not private.can_access_resource_v1(org,p_work_id,'read') then raise exception 'assessment_review_denied' using errcode='42501';end if;
 perform 1 from auth.users where id=actor and deleted_at is null and(banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'assessment_review_denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||org::text,0));
 select * into p from private.assessment_proposal_receipts where organization_id=org and work_id=p_work_id and assessment_decision_id=p_assessment_id;
 if p.id is null then raise exception 'assessment_proposal_capture_required' using errcode='42501';end if;
 state:=private.assessment_proposal_authority_v1(org,p.id,actor);
 if state<>'allowed' then raise exception 'assessment_review_source_denied' using errcode='42501';end if;
 select * into strict d from public.capital_project_decisions where organization_id=org and id=p.assessment_decision_id;
 select * into projection from private.assessment_review_projections where organization_id=org and assessment_decision_id=d.id;
 policy:=private.review_policy_snapshot_v1(org,p_work_id,actor);
 return jsonb_build_object('workId',p_work_id,'assessmentId',d.id,'decisionKey',p.decision_key,'revision',p.decision_revision,
  'decisionFingerprint',p.decision_fingerprint,'proposalFingerprint',private.assessment_proposal_fingerprint_v1(org,p.id),'preparedBy',p.prepared_by,'viewerId',actor,
  'workAccess',private.can_access_resource_v1(org,p_work_id,'work'),'policy',policy,'totalSourceCount',p.total_source_count,
  'documentSourceCount',p.source_count,'houseSourceCount',p.corpus_count,'publicSourceCount',p.public_source_count,
  'status',d.status,'nativeOutcome',case when private.assessment_review_effective_v1(org,p_work_id,d.id) then projection.outcome else null end,'frozen',coalesce(projection.frozen,false) and private.assessment_review_effective_v1(org,p_work_id,d.id),'nativeDecisionId',projection.decision_id);
end $$;
create function public.read_assessment_review_basis_v2(p_work_id uuid,p_assessment_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select private.read_assessment_review_basis_v2(p_work_id,p_assessment_id);$$;
revoke all on function private.read_assessment_review_basis_v2(uuid,uuid),public.read_assessment_review_basis_v2(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.read_assessment_review_basis_v2(uuid,uuid),public.read_assessment_review_basis_v2(uuid,uuid) to authenticated;

create function private.review_assessment_v2(p_work_id uuid,p_assessment_id uuid,p_expected_revision integer,p_expected_decision_fingerprint text,
 p_expected_proposal_fingerprint text,p_command_id uuid,p_outcome text,p_freeze boolean,p_self_approval_declared boolean)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare org uuid;actor uuid:=auth.uid();p private.assessment_proposal_receipts;d public.capital_project_decisions;existing private.assessment_review_projections;
 policy jsonb;mode text;ref jsonb;basis jsonb;receipt uuid;versions uuid[];decision jsonb;effects text[];current_state jsonb;
begin
 if p_command_id is null or p_freeze is null or p_self_approval_declared is null or p_outcome not in ('approved','rejected') or p_outcome is null
  or p_expected_revision is null or p_expected_revision<1 or p_expected_decision_fingerprint is null or p_expected_decision_fingerprint!~'^[a-f0-9]{64}$'
  or p_expected_proposal_fingerprint is null or p_expected_proposal_fingerprint!~'^[a-f0-9]{64}$' or(p_outcome='approved' and not p_freeze)
  then raise exception 'assessment_review_invalid' using errcode='22023';end if;
 select organization_id into org from public.capital_projects where id=p_work_id and status<>'archived';
 if org is null or not private.can_access_resource_v1(org,p_work_id,'read') then raise exception 'assessment_review_denied' using errcode='42501';end if;
 perform 1 from auth.users where id=actor and deleted_at is null and(banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'assessment_review_denied' using errcode='42501';end if;
 perform 1 from public.capital_projects where organization_id=org and id=p_work_id and status<>'archived' for no key update;
 if not found then raise exception 'assessment_review_denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||org::text,0));
 perform 1 from public.organization_memberships where organization_id=org and user_id=actor and status='active' for share nowait;
 if not found or not private.can_access_resource_v1(org,p_work_id,'read') then raise exception 'assessment_review_denied' using errcode='42501';end if;
 policy:=private.review_policy_snapshot_v1(org,p_work_id,actor);
 if not private.can_access_resource_v1(org,p_work_id,'work')
  or ((policy->>'assignmentRequired')::boolean and not(policy->'roles'?'approver' or(p_outcome='rejected' and policy->'roles'?'reviewer')))
  or(not(policy->>'assignmentRequired')::boolean and not private.can_access_resource_v1(org,p_work_id,'work'))
  then raise exception 'review_assignment_required' using errcode='42501';end if;
 select * into p from private.assessment_proposal_receipts where organization_id=org and work_id=p_work_id and assessment_decision_id=p_assessment_id;
 if p.id is null then raise exception 'assessment_proposal_capture_required' using errcode='42501';end if;
 select * into d from public.capital_project_decisions where organization_id=org and id=p.assessment_decision_id for update;
 if(d.revision,d.decision_fingerprint,private.assessment_proposal_fingerprint_v1(org,p.id)) is distinct from(p_expected_revision,p_expected_decision_fingerprint,p_expected_proposal_fingerprint)
  then raise exception 'assessment_review_stale' using errcode='40001';end if;
 if private.assessment_proposal_authority_v1(org,p.id,actor)<>'allowed' then raise exception 'assessment_review_source_denied' using errcode='42501';end if;
 if p_outcome='approved' and p.prepared_by=actor and(not(policy->>'selfApprovalAllowed')::boolean or not p_self_approval_declared)
  then raise exception 'capital_project_self_approval_forbidden' using errcode='42501';end if;
 select * into existing from private.assessment_review_projections where organization_id=org and command_id=p_command_id;
 if existing.id is not null then
  if(existing.work_id,existing.assessment_decision_id,existing.proposal_receipt_id,existing.actor_id,existing.outcome,existing.frozen,existing.self_approval_declared,existing.proposal_fingerprint)
   is distinct from(p_work_id,d.id,p.id,actor,p_outcome,p_freeze,p_self_approval_declared,p_expected_proposal_fingerprint) then
   raise exception 'assessment_review_replay_changed' using errcode='23505';end if;
  current_state:=private.work_decision_precedence_v1(org,p_work_id,'assessment:'||d.id::text);
  if current_state->>'state' is distinct from 'current' or(current_state->>'currentId')::uuid is distinct from existing.decision_id then raise exception 'assessment_review_not_effective' using errcode='42501';end if;
  return jsonb_build_object('decisionId',existing.decision_id,'assessmentId',d.id,'outcome',existing.outcome,'frozen',existing.frozen,'replayed',true);
 end if;
 if d.status not in ('open','directional') or exists(select 1 from private.assessment_review_projections where organization_id=org and assessment_decision_id=d.id)
  or d.id is distinct from(select x.id from public.capital_project_decisions x where x.organization_id=org and x.capital_project_id=p_work_id and x.decision_key=d.decision_key order by revision desc limit 1)
  then raise exception 'assessment_review_stale' using errcode='40001';end if;
 select coalesce(array_agg(distinct source_version_id order by source_version_id),'{}'::uuid[]) into versions from private.assessment_input_source_links
  where organization_id=org and snapshot_id=any(p.snapshot_ids);
 ref:=jsonb_build_object('decisionKey',d.decision_key,'revision',d.revision,'decisionFingerprint',d.decision_fingerprint);
 receipt:=private.record_review_basis_receipt_v1(org,p_work_id,'assessment',ref,versions,'agent_assessment');
 basis:=jsonb_build_object('artifacts','[]'::jsonb,'milestones','[]'::jsonb,'assessments',jsonb_build_array(ref),'decisions','[]'::jsonb,'execution',null,'configuration',null);
 effects:=case when p_freeze then array['freeze_assessment']::text[] else array['none']::text[] end;
 mode:=case when(policy->>'assignmentRequired')::boolean then 'assigned' when(policy->>'selfApprovalAllowed')::boolean then 'individual' else 'open' end;
 decision:=private.append_work_decision_v1(org,p_work_id,'assessment:'||d.id::text,'confirm_assessment',basis,effects,'in_product',null,null,
  actor,null,p_command_id,mode,policy,jsonb_build_object('table','capital_project_decisions','id',d.id),p_outcome=>p_outcome);
 if(decision->>'contested')::boolean then raise exception 'assessment_native_review_contested' using errcode='40001';end if;
 insert into private.assessment_review_projections(organization_id,work_id,assessment_decision_id,proposal_receipt_id,basis_receipt_id,decision_id,command_id,
  actor_id,prepared_by,self_approval_declared,outcome,frozen,proposal_fingerprint)
 values(org,p_work_id,d.id,p.id,receipt,(decision->>'decisionId')::uuid,p_command_id,actor,p.prepared_by,p_self_approval_declared,p_outcome,p_freeze,p_expected_proposal_fingerprint);
 update public.capital_project_decisions set status=case when p_outcome='rejected' then 'rejected' when recommendation is null then 'open' else 'confirmed' end,
  reviewed_by='user' where organization_id=org and id=d.id;
 if private.assessment_proposal_authority_v1(org,p.id,actor)<>'allowed' then raise exception 'assessment_review_source_denied' using errcode='42501';end if;
 return jsonb_build_object('decisionId',decision->>'decisionId','assessmentId',d.id,'outcome',p_outcome,'frozen',p_freeze,'replayed',false);
end $$;
create function public.review_assessment_v2(p_work_id uuid,p_assessment_id uuid,p_expected_revision integer,p_expected_decision_fingerprint text,
 p_expected_proposal_fingerprint text,p_command_id uuid,p_outcome text,p_freeze boolean,p_self_approval_declared boolean)
returns jsonb language sql security invoker set search_path='' as $$select private.review_assessment_v2(p_work_id,p_assessment_id,p_expected_revision,p_expected_decision_fingerprint,p_expected_proposal_fingerprint,p_command_id,p_outcome,p_freeze,p_self_approval_declared);$$;
revoke all on function private.review_assessment_v2(uuid,uuid,integer,text,text,uuid,text,boolean,boolean),public.review_assessment_v2(uuid,uuid,integer,text,text,uuid,text,boolean,boolean) from public,anon,authenticated,service_role;
grant execute on function private.review_assessment_v2(uuid,uuid,integer,text,text,uuid,text,boolean,boolean),public.review_assessment_v2(uuid,uuid,integer,text,text,uuid,text,boolean,boolean) to authenticated;

do $$declare t text;begin
 foreach t in array array['assessment_proposal_receipts','assessment_review_projections'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('create policy %I on private.%I for select to authenticated using(false)',t||'_deny_select',t);
  execute format('create policy %I on private.%I for insert to authenticated with check(false)',t||'_deny_insert',t);
  execute format('create policy %I on private.%I for update to authenticated using(false) with check(false)',t||'_deny_update',t);
  execute format('create policy %I on private.%I for delete to authenticated using(false)',t||'_deny_delete',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_review_history_mutation_v1()',t||'_immutable',t);
  execute format('create trigger %I before truncate on private.%I for each statement execute function private.reject_review_history_mutation_v1()',t||'_no_truncate',t);
  execute format('create trigger %I after insert on private.%I for each row execute function private.capture_audit_event()',t||'_audit',t);
 end loop;
end $$;

-- Preserve all installed generic and M07 checks. The original recursive body
-- calls this name for dependency decisions, so supplementation reaches ancestors.
alter function private.work_decision_basis_authority_v1(uuid,uuid,jsonb,jsonb,uuid,uuid[])
 rename to work_decision_basis_authority_before_assessment_capture_v1;
revoke all on function private.work_decision_basis_authority_before_assessment_capture_v1(uuid,uuid,jsonb,jsonb,uuid,uuid[])
 from public,anon,authenticated,service_role;
create function private.work_decision_basis_authority_v1(p_org uuid,p_work uuid,p_basis jsonb,p_report jsonb,p_actor uuid,p_seen uuid[] default '{}')
returns text language plpgsql volatile security definer set search_path='' as $$
declare state text;ref jsonb;receipt private.assessment_proposal_receipts;
begin
 state:=private.work_decision_basis_authority_before_assessment_capture_v1(p_org,p_work,p_basis,p_report,p_actor,p_seen);
 if state='denied' then return state;end if;
 for ref in select value from jsonb_array_elements(p_basis->'assessments') loop
  select * into receipt from private.assessment_proposal_receipts where organization_id=p_org and work_id=p_work
   and decision_key=ref->>'decisionKey' and decision_revision=(ref->>'revision')::integer and decision_fingerprint=ref->>'decisionFingerprint';
  if receipt.id is not null then
   if private.assessment_proposal_authority_v1(p_org,receipt.id,p_actor)='denied' then return 'denied';end if;
   if private.assessment_proposal_authority_v1(p_org,receipt.id,p_actor)<>'allowed' then state:='unresolved';end if;
  end if;
 end loop;
 return state;
end $$;
revoke all on function private.work_decision_basis_authority_v1(uuid,uuid,jsonb,jsonb,uuid,uuid[]) from public,anon,authenticated,service_role;

-- Applied after assessment_review_projection.sql. The use of an earlier report
-- follows the typed controlled execution, never a prose classifier or UI flag.
set search_path='';
create function private.assessment_case_report_basis_v1(p_org uuid,p_execution uuid,p_intake uuid,p_actor uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare e public.controlled_case_executions;report jsonb;job uuid;receipts uuid[];snapshots uuid[];receipt uuid;
begin
 select * into e from public.controlled_case_executions where organization_id=p_org and id=p_execution and intake_session_id=p_intake
  and mode='primary' and status='succeeded' for share nowait;
 select r.report into report from private.case_execution_results r where r.organization_id=p_org and r.execution_id=p_execution for share nowait;
 if e.id is null or report is null or report->>'schemaVersion'='document-work-execution.v1' then return jsonb_build_object('state','unproven');end if;
 select x.id into job from public.processing_jobs x where x.organization_id=p_org and x.controlled_execution_id=p_execution and x.kind='case_analysis'
  order by x.created_at desc,x.id desc limit 1;
 select array_agg(p.id order by p.id) into receipts from private.assessment_proposal_receipts p where p.organization_id=p_org and p.job_id=job;
 if cardinality(receipts) is null then return jsonb_build_object('state','unproven','jobId',job);end if;
 foreach receipt in array receipts loop
  if private.assessment_proposal_authority_v1(p_org,receipt,p_actor)<>'allowed' then return jsonb_build_object('state','denied');end if;
 end loop;
 select array_agg(distinct x.id order by x.id) into snapshots from private.assessment_proposal_receipts p cross join lateral unnest(p.snapshot_ids)x(id)
  where p.organization_id=p_org and p.id=any(receipts);
 -- Until a prior report has a physical replay port for public bodies, never
 -- consume it with the public source closure silently omitted.
 if exists(select 1 from private.assessment_input_public_links where organization_id=p_org and snapshot_id=any(snapshots))
  or exists(select 1 from private.assessment_research_source_links where organization_id=p_org and snapshot_id=any(snapshots)) then
  return jsonb_build_object('state','unproven');end if;
 return jsonb_build_object('state','captured','jobId',job,'snapshotIds',to_jsonb(snapshots),
  'reportFingerprint',encode(extensions.digest(report::text,'sha256'),'hex'));
end $$;
revoke all on function private.assessment_case_report_basis_v1(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.worker_load_case_assessment_input_v5(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs;answer jsonb;prior jsonb;prior_execution uuid;basis jsonb;use_kind text;mode text;
 prior_snapshots uuid[]:='{}';versions uuid[];snapshot uuid;corpus_count integer:=0;gaps jsonb:='[]';report_fp text;
begin
 j:=private.job_for_capability(p_job_id,p_capability_token);
 if j.kind<>'case_analysis' then raise exception 'case_analysis_capability_required' using errcode='42501';end if;
 answer:=private.worker_load_case_input_v3(j.id,p_capability_token);
 answer:=answer||jsonb_build_object('claim_decisions',private.worker_load_claim_decisions(j.id,p_capability_token),
  'document_work_request',private.worker_load_document_work_request_v1(j.id,p_capability_token));
 answer:=private.worker_freeze_case_input(j.id,p_capability_token,answer);
 mode:=answer#>>'{_execution,mode}';
 if mode not in('primary','shadow','replay') or mode is null then raise exception 'assessment_prior_contract_unresolved' using errcode='42501';end if;
 if mode<>'primary' then
  -- case-analysis.ts compareCaseExecutions consumes this report as a required input.
  use_kind:='required_comparison';prior_execution:=(answer#>>'{_execution,baseline_execution_id}')::uuid;
  prior:=answer#>'{_execution,baseline_report}';
  if prior_execution is null or prior is null or jsonb_typeof(prior)='null' then
   raise exception 'assessment_baseline_basis_unproven' using errcode='42501';end if;
  basis:=private.assessment_case_report_basis_v1(j.organization_id,prior_execution,j.intake_session_id,j.authorization_subject_id);
  report_fp:=encode(extensions.digest(prior::text,'sha256'),'hex');
  if basis->>'state' is distinct from 'captured' or basis->>'reportFingerprint' is distinct from report_fp then
   raise exception 'assessment_baseline_basis_unproven' using errcode='42501';end if;
 elsif answer#>>'{document_work_request,executionScope}'='documentary_only' then
  -- Comparison of document passages uses the delivered sources, not a prior case report.
  use_kind:='not_consumed';prior:=null;basis:=jsonb_build_object('state','absent');
 else
  -- case-analysis.ts taskCacheFromReport is only an optimization; missing entries rerun.
  use_kind:='optional_task_cache';
  select e.id,r.report into prior_execution,prior from public.controlled_case_executions e
  join private.case_execution_results r on(r.organization_id,r.execution_id)=(e.organization_id,e.id)
  where e.organization_id=j.organization_id and e.intake_session_id=j.intake_session_id and e.mode='primary' and e.status='succeeded'
   and e.id::text is distinct from answer#>>'{_execution,id}' order by e.completed_at desc nulls last,e.created_at desc limit 1;
  if prior is null or prior->>'schemaVersion'='document-work-execution.v1' then
   prior:=null;basis:=jsonb_build_object('state','absent');
  else
   basis:=private.assessment_case_report_basis_v1(j.organization_id,prior_execution,j.intake_session_id,j.authorization_subject_id);
   if basis->>'state' is distinct from 'captured' then
    gaps:=jsonb_build_array(jsonb_build_object('code','prior_basis_unproven','controlledExecutionId',prior_execution,'jobId',basis->'jobId'));
    prior:=null;basis:=jsonb_build_object('state','unproven');
   else report_fp:=encode(extensions.digest(prior::text,'sha256'),'hex');
    if report_fp is distinct from basis->>'reportFingerprint' then raise exception 'assessment_prior_basis_changed' using errcode='40001';end if;
   end if;
  end if;
 end if;
 if basis->>'state'='captured' then
  prior_snapshots:=array(select(value#>>'{}')::uuid from jsonb_array_elements(basis->'snapshotIds'));
  select count(distinct chunk_id) into corpus_count from private.assessment_input_corpus_links where organization_id=j.organization_id
   and snapshot_id=any(prior_snapshots) and corpus_kind='house_playbook';
 end if;
 answer:=answer||jsonb_build_object('prior_case_report',case when use_kind='optional_task_cache' then prior else null end,'assessmentInputGaps',gaps,
  'priorBasis',jsonb_build_object('use',use_kind,'state',basis->'state','controlledExecutionId',prior_execution,
   'reportFingerprint',case when basis->>'state'='captured' then report_fp else null end));
 versions:=private.assessment_delivered_document_versions_v1(j.organization_id,answer);
 select coalesce(array_agg(distinct x.id order by x.id),'{}'::uuid[]) into versions from(
  select unnest(versions)id union select source_version_id from private.assessment_input_source_links
  where organization_id=j.organization_id and snapshot_id=any(prior_snapshots))x;
 snapshot:=private.capture_assessment_document_input_v1(j.id,p_capability_token,'case_effective_input',answer,versions,corpus_count);
 insert into private.assessment_input_corpus_links(organization_id,snapshot_id,corpus_kind,chunk_id,governance_id,purpose,content_hash)
 select distinct on(corpus_kind,chunk_id)j.organization_id,snapshot,corpus_kind,chunk_id,governance_id,purpose,content_hash
 from private.assessment_input_corpus_links where organization_id=j.organization_id and snapshot_id=any(prior_snapshots)
 order by corpus_kind,chunk_id,created_at desc,id desc on conflict(organization_id,snapshot_id,corpus_kind,chunk_id) do nothing;
 if private.assessment_input_snapshot_authority_v1(j.organization_id,snapshot,j.authorization_subject_id)<>'allowed' then
  raise exception 'assessment_input_authority_denied' using errcode='42501';end if;
 perform private.job_for_capability(j.id,p_capability_token);
 return answer||jsonb_build_object('assessmentInputSnapshotId',snapshot);
end $$;
create function public.worker_load_case_assessment_input_v5(p_job_id uuid,p_capability_token text)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_load_case_assessment_input_v5(p_job_id,p_capability_token);$$;
revoke all on function private.worker_load_case_assessment_input_v5(uuid,text),public.worker_load_case_assessment_input_v5(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.worker_load_case_assessment_input_v5(uuid,text),public.worker_load_case_assessment_input_v5(uuid,text) to authenticated;

-- Requires the 3V assessment supplement and installed 3U configuration guard.
-- Only future continuation requests enter this regime. No historical backfill.
set search_path='';
create table private.work_update_native_regimes(
 id uuid not null default gen_random_uuid(),organization_id uuid not null,work_id uuid not null,update_id uuid not null,updated_at timestamptz not null default clock_timestamp(),created_at timestamptz not null default clock_timestamp(),
 primary key(organization_id,update_id),foreign key(organization_id,work_id,update_id) references public.work_continuation_requests(organization_id,work_id,id)
);
create table private.work_update_review_captures(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,work_id uuid not null,update_id uuid not null,
 update_revision integer not null check(update_revision>0),update_payload_fingerprint text not null,
 adopted_milestone_ids uuid[] not null check(cardinality(adopted_milestone_ids)>0),replaced_milestone_ids uuid[] not null,
 basis_fingerprint text not null check(basis_fingerprint~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,update_id,update_revision),
 foreign key(organization_id,work_id,update_id) references public.work_continuation_requests(organization_id,work_id,id)
);
create table private.work_update_milestone_receipts(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,work_id uuid not null,capture_id uuid not null,milestone_id uuid not null,
 prepared_by uuid not null references auth.users(id),closure jsonb not null,closure_fingerprint text not null,
 basis_receipt_id uuid not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,capture_id,milestone_id),
 foreign key(organization_id,capture_id) references private.work_update_review_captures(organization_id,id),
 foreign key(organization_id,milestone_id) references public.work_milestones(organization_id,id),
 foreign key(organization_id,basis_receipt_id) references private.review_basis_receipts(organization_id,id),
 check(closure_fingerprint=encode(extensions.digest(closure::text,'sha256'),'hex'))
);
create table private.work_update_review_projections(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,work_id uuid not null,update_id uuid not null,capture_id uuid not null,
 decision_id uuid not null,command_id uuid not null,actor_id uuid not null references auth.users(id),self_approval_declared boolean not null,
 adoption_milestone_id uuid not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,update_id),unique(organization_id,command_id),
 foreign key(organization_id,work_id,update_id) references public.work_continuation_requests(organization_id,work_id,id),
 foreign key(organization_id,capture_id) references private.work_update_review_captures(organization_id,id),
 foreign key(organization_id,decision_id) references public.work_decisions(organization_id,id),
 foreign key(organization_id,adoption_milestone_id) references public.work_milestones(organization_id,id) deferrable initially deferred
);
create function private.mark_native_work_update_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.work_update_native_regimes(organization_id,work_id,update_id) values(new.organization_id,new.work_id,new.id);
 return new;
end $$;
revoke all on function private.mark_native_work_update_v1() from public,anon,authenticated,service_role;
create trigger work_update_native_regime after insert on public.work_continuation_requests for each row execute function private.mark_native_work_update_v1();

create function private.work_update_milestone_closure_v2(p_org uuid,p_work uuid,p_milestone uuid,p_actor uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare m public.work_milestones;closure jsonb;prepared_by uuid;b private.institutional_native_bindings;
begin
 select * into m from public.work_milestones where organization_id=p_org and work_id=p_work and id=p_milestone and kind='execution_result';
 if m.id is null then return null;end if;
 if m.subject_kind='work_execution' then
  closure:=private.execution_result_source_closure_v1(p_org,m.subject_id);
  if closure is null or not private.execution_closure_read_allowed_v1(p_org,closure,p_actor) then return null;end if;
  select p.user_id into prepared_by from public.work_executions e join private.principals p on(p.organization_id,p.id)=(e.organization_id,e.principal_id)
  where e.organization_id=p_org and e.work_id=p_work and e.id=m.subject_id and p.kind='human';
 elsif m.subject_kind='institutional_model_result' then
  select * into b from private.institutional_native_bindings where organization_id=p_org and work_id=p_work and result_id=m.subject_id;
  if b.id is null or not private.institutional_native_read_allowed_v1(p_org,b.revision_id,p_actor) then return null;end if;
  closure:=b.closure;
  select subject_id into prepared_by from private.institutional_input_snapshots where organization_id=p_org and id=b.snapshot_id;
 else return null;end if;
 if prepared_by is null then return null;end if;
 return jsonb_build_object('milestoneId',m.id,'subjectKind',m.subject_kind,'subjectId',m.subject_id,'preparedBy',prepared_by,'closure',closure);
end $$;
revoke all on function private.work_update_milestone_closure_v2(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.work_update_result_set_v2(p_org uuid,p_update uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r public.work_continuation_requests;adopted uuid[];replaced uuid[];link private.work_followup_executions;v_base uuid;
begin
 select * into r from public.work_continuation_requests where organization_id=p_org and id=p_update;
 if r.id is null or r.status<>'ready' then raise exception 'work_update_not_ready' using errcode='55000';end if;
 if r.kind='user_followup' then
  select * into link from private.work_followup_executions l where l.organization_id=p_org and l.request_id=r.id order by l.sequence desc limit 1;
  adopted:=array(select m.id from public.work_milestones m where m.organization_id=p_org and m.work_id=r.work_id and m.kind='execution_result'
   and m.subject_kind='work_execution' and m.subject_id=link.execution_id);
  v_base:=(r.payload#>>'{objective,baseMilestoneId}')::uuid;
  if not exists(select 1 from private.work_continuation_bases_v1(p_org,r.work_id) b where b.milestone_id=v_base) then
   raise exception 'work_continuation_base_superseded' using errcode='40001';end if;
  replaced:=array[v_base];
 else
  adopted:=array(select m.id from public.work_recompute_candidates c join public.work_milestones m on m.organization_id=c.organization_id and m.work_id=c.work_id
   and m.kind='execution_result' and m.subject_kind='work_execution' and m.subject_id=c.execution_id
   where c.organization_id=p_org and c.work_id=r.work_id and c.request_id=r.id and c.state='settled' order by c.created_at,c.id)
   ||array(select m.id from public.institutional_recompute_candidates c join public.work_milestones m on m.organization_id=c.organization_id and m.work_id=c.work_id
   and m.kind='execution_result' and m.subject_kind='institutional_model_result' and m.subject_id=c.result_id
   where c.organization_id=p_org and c.work_id=r.work_id and c.request_id=r.id and c.state='settled' order by c.sequence);
  replaced:=array(select x.id from(select distinct on(m.id) m.id,c.created_at,c.id as candidate,e.id as execution
   from public.work_recompute_candidates c cross join unnest(c.execution_ids) e(id)
   join public.work_milestones m on m.organization_id=c.organization_id and m.work_id=c.work_id and m.kind='execution_result' and m.subject_kind='work_execution' and m.subject_id=e.id
   where c.organization_id=p_org and c.work_id=r.work_id and c.request_id=r.id and c.state='settled' and not(m.id=any(adopted))
   order by m.id,c.created_at,c.id,e.id)x order by x.created_at,x.candidate,x.execution)
   ||array(select x.id from(select distinct on(m.id)m.id,c.sequence,res.position from public.institutional_recompute_candidates c
   cross join unnest(c.result_ids) with ordinality res(id,position) join public.work_milestones m on m.organization_id=c.organization_id and m.work_id=c.work_id
   and m.kind='execution_result' and m.subject_kind='institutional_model_result' and m.subject_id=res.id
   where c.organization_id=p_org and c.work_id=r.work_id and c.request_id=r.id and c.state='settled' and not(m.id=any(adopted))
   order by m.id,c.sequence,res.position)x order by x.sequence,x.position);
 end if;
 if cardinality(adopted)=0 then raise exception 'work_update_result_missing' using errcode='55000';end if;
 return jsonb_build_object('updateId',r.id,'workId',r.work_id,'revision',r.revision,'payloadFingerprint',r.payload_fingerprint,
  'adoptedResults',to_jsonb(adopted),'replacedResults',to_jsonb(replaced));
end $$;
revoke all on function private.work_update_result_set_v2(uuid,uuid) from public,anon,authenticated,service_role;

create function private.work_update_capture_authority_v2(p_org uuid,p_capture uuid,p_actor uuid)
returns text language plpgsql volatile security definer set search_path='' as $$
declare c private.work_update_review_captures;r private.work_update_milestone_receipts;current_proof jsonb;n integer;
begin
 select * into c from private.work_update_review_captures where organization_id=p_org and id=p_capture;
 if c.id is null then return 'unresolved';end if;
 if not private.resource_access_as_subject_v1(p_org,c.work_id,p_actor,'read') then return 'denied';end if;
 select count(*) into n from private.work_update_milestone_receipts where organization_id=p_org and capture_id=c.id;
 if n<>cardinality(c.adopted_milestone_ids) then return 'unresolved';end if;
 for r in select * from private.work_update_milestone_receipts where organization_id=p_org and capture_id=c.id loop
  if not(r.milestone_id=any(c.adopted_milestone_ids)) then return 'unresolved';end if;
  current_proof:=private.work_update_milestone_closure_v2(p_org,c.work_id,r.milestone_id,p_actor);
  if current_proof is null then return 'denied';end if;
  if current_proof is distinct from r.closure or(current_proof->>'preparedBy')::uuid<>r.prepared_by then return 'unresolved';end if;
 end loop;
 return 'allowed';
end $$;
revoke all on function private.work_update_capture_authority_v2(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.read_work_update_adoption_basis_v2(p_update_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r public.work_continuation_requests;c private.work_update_review_captures;actor uuid:=auth.uid();set_data jsonb;proofs jsonb:='[]';proof jsonb;
 milestone jsonb;mid uuid;versions uuid[];generic_receipt uuid;fp text;prepared uuid[];
begin
 perform 1 from auth.users where id=actor and deleted_at is null and(banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'work_update_review_denied' using errcode='42501';end if;
 select * into r from public.work_continuation_requests where id=p_update_id;
 if r.id is null or not private.can_access_resource_v1(r.organization_id,r.work_id,'read') then raise exception 'work_update_review_denied' using errcode='42501';end if;
 perform 1 from public.capital_projects where organization_id=r.organization_id and id=r.work_id and status<>'archived' for no key update;
 if not found then raise exception 'work_update_review_denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||r.organization_id::text,0));
 if not exists(select 1 from private.work_update_native_regimes where organization_id=r.organization_id and update_id=r.id) then
  raise exception 'work_update_native_capture_required' using errcode='42501';end if;
 select * into r from public.work_continuation_requests where organization_id=r.organization_id and id=r.id for update;
 select * into c from private.work_update_review_captures where organization_id=r.organization_id and update_id=r.id
  order by update_revision desc limit 1;
 if r.status='adopted' then
  if c.id is null or private.work_update_capture_authority_v2(r.organization_id,c.id,actor)<>'allowed' then
   raise exception 'work_update_basis_denied' using errcode='42501';end if;
 else
  set_data:=private.work_update_result_set_v2(r.organization_id,r.id);
  for milestone in select value from jsonb_array_elements(set_data->'adoptedResults') loop
   mid:=(milestone#>>'{}')::uuid;
   proof:=private.work_update_milestone_closure_v2(r.organization_id,r.work_id,mid,actor);
   if proof is null then raise exception 'work_update_milestone_closure_unproven' using errcode='42501';end if;
   proofs:=proofs||jsonb_build_array(proof);
  end loop;
  fp:=encode(extensions.digest(jsonb_build_object('resultSet',set_data,'proofs',proofs)::text,'sha256'),'hex');
  if c.id is not null and c.update_revision=r.revision then
   if c.basis_fingerprint<>fp then raise exception 'work_update_basis_changed' using errcode='40001';end if;
  else
   insert into private.work_update_review_captures(organization_id,work_id,update_id,update_revision,update_payload_fingerprint,
    adopted_milestone_ids,replaced_milestone_ids,basis_fingerprint)
   values(r.organization_id,r.work_id,r.id,r.revision,r.payload_fingerprint,
    array(select(value#>>'{}')::uuid from jsonb_array_elements(set_data->'adoptedResults')),
    array(select(value#>>'{}')::uuid from jsonb_array_elements(set_data->'replacedResults')),fp) returning * into c;
   for proof in select value from jsonb_array_elements(proofs) loop
    mid:=(proof->>'milestoneId')::uuid;
    select coalesce(array_agg(distinct(value->>'sourceVersionId')::uuid order by(value->>'sourceVersionId')::uuid),'{}'::uuid[]) into versions
    from jsonb_array_elements(proof#>'{closure,sources}');
    generic_receipt:=private.record_review_basis_receipt_v1(r.organization_id,r.work_id,'milestone',jsonb_build_object('milestoneId',mid),versions,'work_milestone');
    insert into private.work_update_milestone_receipts(organization_id,work_id,capture_id,milestone_id,prepared_by,closure,closure_fingerprint,basis_receipt_id)
    values(r.organization_id,r.work_id,c.id,mid,(proof->>'preparedBy')::uuid,proof,encode(extensions.digest(proof::text,'sha256'),'hex'),generic_receipt);
   end loop;
  end if;
  if private.work_update_capture_authority_v2(r.organization_id,c.id,actor)<>'allowed' then raise exception 'work_update_basis_denied' using errcode='42501';end if;
 end if;
 select array_agg(distinct prepared_by order by prepared_by) into prepared from private.work_update_milestone_receipts where organization_id=r.organization_id and capture_id=c.id;
 return jsonb_build_object('updateId',r.id,'workId',r.work_id,'revision',c.update_revision,'basisFingerprint',c.basis_fingerprint,
  'adoptedResults',to_jsonb(c.adopted_milestone_ids),'replacedResults',to_jsonb(c.replaced_milestone_ids),'preparedBy',to_jsonb(prepared),
  'viewerId',actor,'workAccess',private.can_access_resource_v1(r.organization_id,r.work_id,'work'),
  'policy',private.review_policy_snapshot_v1(r.organization_id,r.work_id,actor),'status',r.status);
end $$;
create function public.read_work_update_adoption_basis_v2(p_update_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select private.read_work_update_adoption_basis_v2(p_update_id);$$;
revoke all on function private.read_work_update_adoption_basis_v2(uuid),public.read_work_update_adoption_basis_v2(uuid) from public,anon,authenticated,service_role;
grant execute on function private.read_work_update_adoption_basis_v2(uuid),public.read_work_update_adoption_basis_v2(uuid) to authenticated;

alter function private.adopt_work_update_v1(uuid,uuid,integer) rename to adopt_work_update_before_native_v1;
revoke all on function private.adopt_work_update_before_native_v1(uuid,uuid,integer) from public,anon,authenticated,service_role;
create function private.adopt_work_update_v1(p_command_id uuid,p_update_id uuid,p_expected_revision integer)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
 if exists(select 1 from private.work_update_native_regimes where update_id=p_update_id) then
  raise exception 'work_update_native_command_required' using errcode='42501';end if;
 return private.adopt_work_update_before_native_v1(p_command_id,p_update_id,p_expected_revision);
end $$;
revoke all on function private.adopt_work_update_v1(uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function private.adopt_work_update_v1(uuid,uuid,integer) to authenticated;

create function private.adopt_work_update_v2(p_command_id uuid,p_update_id uuid,p_expected_revision integer,p_expected_basis_fingerprint text,p_self_approval_declared boolean)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid();r public.work_continuation_requests;c private.work_update_review_captures;existing private.work_update_review_projections;
 dto jsonb;policy jsonb;basis jsonb;decision jsonb;projection_result jsonb;precedence jsonb;mode text;
begin
 if p_command_id is null or p_update_id is null or p_expected_revision is null or p_expected_revision<1
  or p_expected_basis_fingerprint is null or p_expected_basis_fingerprint!~'^[a-f0-9]{64}$' or p_self_approval_declared is null then
  raise exception 'work_update_review_invalid' using errcode='22023';end if;
 dto:=private.read_work_update_adoption_basis_v2(p_update_id);
 select * into strict r from public.work_continuation_requests where id=p_update_id;
 select * into c from private.work_update_review_captures where organization_id=r.organization_id and update_id=r.id and update_revision=p_expected_revision;
 if c.id is null or c.basis_fingerprint<>p_expected_basis_fingerprint then raise exception 'work_update_review_stale' using errcode='40001';end if;
 perform 1 from public.organization_memberships where organization_id=r.organization_id and user_id=actor and status='active' for share nowait;
 if not found then raise exception 'work_update_review_denied' using errcode='42501';end if;
 policy:=private.review_policy_snapshot_v1(r.organization_id,r.work_id,actor);
 if not private.can_access_resource_v1(r.organization_id,r.work_id,'work')
  or ((policy->>'assignmentRequired')::boolean and not(policy->'roles'?'approver'))
  or(not(policy->>'assignmentRequired')::boolean and not private.can_access_resource_v1(r.organization_id,r.work_id,'work')) then
  raise exception 'review_assignment_required' using errcode='42501';end if;
 if exists(select 1 from private.work_update_milestone_receipts where organization_id=r.organization_id and capture_id=c.id and prepared_by=actor)
  and(not(policy->>'selfApprovalAllowed')::boolean or not p_self_approval_declared) then
  raise exception 'capital_project_self_approval_forbidden' using errcode='42501';end if;
 select * into existing from private.work_update_review_projections where organization_id=r.organization_id and command_id=p_command_id;
 if existing.id is not null then
  if(existing.update_id,existing.capture_id,existing.actor_id,existing.self_approval_declared)
   is distinct from(r.id,c.id,actor,p_self_approval_declared) then raise exception 'work_update_review_replay_changed' using errcode='23505';end if;
  precedence:=private.work_decision_precedence_v1(r.organization_id,r.work_id,'update:'||r.id::text);
  if precedence->>'state' is distinct from 'current' or(precedence->>'currentId')::uuid is distinct from existing.decision_id then
   raise exception 'work_update_review_not_effective' using errcode='42501';end if;
  return jsonb_build_object('decisionId',existing.decision_id,'updateId',r.id,'milestoneId',existing.adoption_milestone_id,'replayed',true);
 end if;
 if r.status<>'ready' or r.revision<>p_expected_revision then raise exception 'work_update_review_stale' using errcode='40001';end if;
 basis:=jsonb_build_object('artifacts','[]'::jsonb,'assessments','[]'::jsonb,'decisions','[]'::jsonb,'execution',null,'configuration',null,
  'milestones',(select jsonb_agg(jsonb_build_object('milestoneId',x.id) order by x.position) from unnest(c.adopted_milestone_ids) with ordinality x(id,position)));
 mode:=case when(policy->>'assignmentRequired')::boolean then 'assigned' when(policy->>'selfApprovalAllowed')::boolean then 'individual' else 'open' end;
 -- Adoption changes which existing results are current. It schedules neither
 -- execution nor recomputation; the native projection records that specific effect.
 decision:=private.append_work_decision_v1(r.organization_id,r.work_id,'update:'||r.id::text,'adopt_update',basis,array['none']::text[],'in_product',null,null,
  actor,null,p_command_id,mode,policy,jsonb_build_object('table','work_continuation_requests','id',r.id),p_outcome=>'approved');
 if(decision->>'contested')::boolean then raise exception 'work_update_review_contested' using errcode='40001';end if;
 insert into private.work_update_review_projections(organization_id,work_id,update_id,capture_id,decision_id,command_id,actor_id,self_approval_declared,adoption_milestone_id)
 values(r.organization_id,r.work_id,r.id,c.id,(decision->>'decisionId')::uuid,p_command_id,actor,p_self_approval_declared,
  private.work_command_milestone_id_v1(r.organization_id,p_command_id));
 projection_result:=private.adopt_work_update_before_native_v1(p_command_id,r.id,p_expected_revision);
 if array(select(value#>>'{}')::uuid from jsonb_array_elements(projection_result->'adoptedResults')) is distinct from c.adopted_milestone_ids
  or(projection_result->>'milestoneId')::uuid is distinct from private.work_command_milestone_id_v1(r.organization_id,p_command_id) then
  raise exception 'work_update_projection_changed' using errcode='40001';end if;
 if private.work_update_capture_authority_v2(r.organization_id,c.id,actor)<>'allowed' then raise exception 'work_update_basis_denied' using errcode='42501';end if;
 return projection_result||jsonb_build_object('decisionId',decision->>'decisionId');
end $$;
create function public.adopt_work_update_v2(p_command_id uuid,p_update_id uuid,p_expected_revision integer,p_expected_basis_fingerprint text,p_self_approval_declared boolean)
returns jsonb language sql security invoker set search_path='' as $$select private.adopt_work_update_v2(p_command_id,p_update_id,p_expected_revision,p_expected_basis_fingerprint,p_self_approval_declared);$$;
revoke all on function private.adopt_work_update_v2(uuid,uuid,integer,text,boolean),public.adopt_work_update_v2(uuid,uuid,integer,text,boolean) from public,anon,authenticated,service_role;
grant execute on function private.adopt_work_update_v2(uuid,uuid,integer,text,boolean),public.adopt_work_update_v2(uuid,uuid,integer,text,boolean) to authenticated;

create function private.preserve_native_work_update_adoption_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='adopted' and old.status is distinct from new.status
  and exists(select 1 from private.work_update_native_regimes where organization_id=old.organization_id and update_id=old.id)
  and not exists(select 1 from private.work_update_review_projections p join public.work_decisions d on(d.organization_id,d.id)=(p.organization_id,p.decision_id)
   where p.organization_id=old.organization_id and p.update_id=old.id and p.actor_id=auth.uid() and p.actor_id=d.decided_by
    and d.kind='adopt_update' and d.outcome='approved' and p.work_id=old.work_id) then
  raise exception 'work_update_native_command_required' using errcode='42501';end if;
 return new;
end $$;
revoke all on function private.preserve_native_work_update_adoption_v1() from public,anon,authenticated,service_role;
create trigger work_update_native_adoption_guard before update on public.work_continuation_requests for each row execute function private.preserve_native_work_update_adoption_v1();

-- Extend the generic receipt authority after M07 and 3V's assessment extension.
-- Preserve the installed body rather than re-emitting a historical definition.
alter function private.review_basis_receipt_authority_v1(uuid,uuid,text,jsonb,uuid) rename to review_basis_receipt_authority_before_work_update_v2;
revoke all on function private.review_basis_receipt_authority_before_work_update_v2(uuid,uuid,text,jsonb,uuid) from public,anon,authenticated,service_role;
create function private.review_basis_receipt_authority_v1(p_org uuid,p_work uuid,p_kind text,p_ref jsonb,p_actor uuid)
returns text language plpgsql volatile security definer set search_path='' as $$
declare state text;r private.work_update_milestone_receipts;current_proof jsonb;
begin
 state:=private.review_basis_receipt_authority_before_work_update_v2(p_org,p_work,p_kind,p_ref,p_actor);
 if state='denied' or p_kind<>'milestone' then return state;end if;
 for r in select * from private.work_update_milestone_receipts where organization_id=p_org and work_id=p_work and milestone_id=(p_ref->>'milestoneId')::uuid loop
  current_proof:=private.work_update_milestone_closure_v2(p_org,p_work,r.milestone_id,p_actor);
  if current_proof is null then return 'denied';end if;
  if current_proof is distinct from r.closure then state:='unresolved';end if;
 end loop;
 return state;
end $$;
revoke all on function private.review_basis_receipt_authority_v1(uuid,uuid,text,jsonb,uuid) from public,anon,authenticated,service_role;

do $$declare t text;begin
 foreach t in array array['work_update_native_regimes','work_update_review_captures','work_update_milestone_receipts','work_update_review_projections'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('create policy %I on private.%I for select to authenticated using(false)',t||'_deny_select',t);
  execute format('create policy %I on private.%I for insert to authenticated with check(false)',t||'_deny_insert',t);
  execute format('create policy %I on private.%I for update to authenticated using(false) with check(false)',t||'_deny_update',t);
  execute format('create policy %I on private.%I for delete to authenticated using(false)',t||'_deny_delete',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_review_history_mutation_v1()',t||'_immutable',t);
  execute format('create trigger %I before truncate on private.%I for each statement execute function private.reject_review_history_mutation_v1()',t||'_no_truncate',t);
  execute format('create trigger %I after insert on private.%I for each row execute function private.capture_audit_event()',t||'_audit',t);
 end loop;
end $$;
create index work_update_regime_work_idx on private.work_update_native_regimes(organization_id,work_id);
create index work_update_capture_work_idx on private.work_update_review_captures(organization_id,work_id);
create index work_update_milestone_work_idx on private.work_update_milestone_receipts(organization_id,work_id);
create index work_update_milestone_basis_idx on private.work_update_milestone_receipts(organization_id,basis_receipt_id);
create index work_update_milestone_ref_idx on private.work_update_milestone_receipts(organization_id,milestone_id);
create index work_update_milestone_preparer_idx on private.work_update_milestone_receipts(prepared_by);
create index work_update_projection_work_idx on private.work_update_review_projections(organization_id,work_id);
create index work_update_projection_capture_idx on private.work_update_review_projections(organization_id,capture_id);
create index work_update_projection_decision_idx on private.work_update_review_projections(organization_id,decision_id);
create index work_update_projection_actor_idx on private.work_update_review_projections(actor_id);
create index work_update_projection_milestone_idx on private.work_update_review_projections(organization_id,adoption_milestone_id);

-- 3V: capture the additional institutional input actually delivered to the case
-- engine. Metadata only; no historical closure or permission backfill.
set search_path='';
create table private.assessment_institutional_configuration_links(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),snapshot_id uuid not null,
 work_id uuid not null,configuration_id uuid not null,configuration_revision integer not null,
 configuration_fingerprint text not null check(configuration_fingerprint~'^[a-f0-9]{64}$'),
 lineage_fingerprint text not null check(lineage_fingerprint~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,snapshot_id,configuration_id),
 foreign key(organization_id,work_id,snapshot_id) references private.assessment_input_snapshots(organization_id,work_id,id),
 foreign key(organization_id,configuration_id) references private.institutional_model_configurations(organization_id,id)
);
create index assessment_institutional_configuration_fk on private.assessment_institutional_configuration_links(organization_id,configuration_id);
create table private.assessment_institutional_fixed_rights(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),snapshot_id uuid not null,
 source_version_id uuid not null,rights_version_id uuid not null,content_hash text not null check(content_hash~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,snapshot_id,source_version_id,rights_version_id),
 foreign key(organization_id,snapshot_id) references private.assessment_input_snapshots(organization_id,id),
 foreign key(organization_id,source_version_id,rights_version_id) references private.source_rights_versions(organization_id,source_version_id,id)
);
create index assessment_institutional_rights_fk on private.assessment_institutional_fixed_rights(organization_id,source_version_id,rights_version_id);
alter function private.assessment_input_snapshot_authority_v1(uuid,uuid,uuid) rename to assessment_input_snapshot_before_institutional_v1;
revoke all on function private.assessment_input_snapshot_before_institutional_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;
create function private.assessment_input_snapshot_authority_v1(p_org uuid,p_snapshot uuid,p_actor uuid)
returns text language plpgsql volatile security definer set search_path='' as $$
declare s private.assessment_input_snapshots;l private.assessment_institutional_configuration_links;
 pin private.assessment_institutional_fixed_rights;r private.source_rights_versions;proof jsonb;state text;op text;
begin
 state:=private.assessment_input_snapshot_before_institutional_v1(p_org,p_snapshot,p_actor);
 if state<>'allowed' then return state;end if;
 select * into strict s from private.assessment_input_snapshots where organization_id=p_org and id=p_snapshot;
 if s.origin<>'institutional_context' then return state;end if;
 for l in select * from private.assessment_institutional_configuration_links where organization_id=p_org and snapshot_id=s.id order by configuration_id loop
  perform 1 from private.institutional_model_configurations c where c.organization_id=p_org and c.id=l.configuration_id
   and c.capital_project_id=s.work_id and c.status='approved' and c.revision=l.configuration_revision
   and c.configuration_fingerprint=l.configuration_fingerprint and private.institutional_config_hash(c.configuration)=l.configuration_fingerprint for share nowait;
  if not found then return 'denied';end if;
  proof:=private.institutional_configuration_ancestry_v1(p_org,s.work_id,l.configuration_id);
  if proof->>'state' is distinct from 'captured_lineage' or private.institutional_config_hash(proof)<>l.lineage_fingerprint then return 'denied';end if;
 end loop;
 for pin in select * from private.assessment_institutional_fixed_rights where organization_id=p_org and snapshot_id=s.id loop
  select * into r from private.source_rights_versions where organization_id=p_org and id=pin.rights_version_id and source_version_id=pin.source_version_id for share nowait;
  if r.id is null or r.valid_from>clock_timestamp() or r.expires_at<=clock_timestamp() or r.store_until<=clock_timestamp()
   or not(array['read','process','store','derive']::text[]<@r.operations) or not('analysis'=any(r.purposes))
   or not exists(select 1 from public.source_versions where organization_id=p_org and id=pin.source_version_id and declared_sha256=pin.content_hash) then return 'denied';end if;
  foreach op in array array['read','process','store','derive']loop
   if not private.source_use_allowed_v1(p_org,pin.source_version_id,p_actor,op,'analysis')then return 'denied';end if;
  end loop;
 end loop;
 return 'allowed';
exception when lock_not_available then raise exception 'assessment_capture_retry'using errcode='40001';
end $$;
revoke all on function private.assessment_input_snapshot_authority_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;
-- Existing case consumers also cross the same capture boundary after their
-- primary input is captured; the original institutional authority stays intact.
alter function private.worker_load_institutional_model_context_v3(uuid,text) rename to worker_load_institutional_before_assessment_v3;
revoke all on function private.worker_load_institutional_before_assessment_v3(uuid,text)from public,anon,authenticated,service_role;
create function private.worker_load_assessment_institutional_context_v1(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs;body jsonb;item jsonb;proof jsonb;pins jsonb:='[]';versions uuid[]:='{}';sid uuid;work uuid;c private.institutional_model_configurations;v public.source_versions;
begin
 j:=private.job_for_capability(p_job_id,p_capability_token);
 if j.kind not in('case_analysis')then raise exception 'assessment_context_job_denied'using errcode='42501';end if;
 body:=private.worker_load_institutional_before_assessment_v3(j.id,p_capability_token);
 if jsonb_typeof(body->'currentSources')is distinct from 'array' or jsonb_typeof(body->'approvedConfigurations')is distinct from 'array'
 or jsonb_array_length(body->'approvedConfigurations')>12 then raise exception 'assessment_institutional_context_unresolved'using errcode='42501';end if;
 select capital_project_id into work from public.document_intake_sessions where organization_id=j.organization_id and id=j.intake_session_id;
 if body->>'projectId'is distinct from work::text then raise exception 'assessment_institutional_work_mismatch'using errcode='42501';end if;
 perform 1 from public.capital_projects where organization_id=j.organization_id and id=work for no key update;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||j.organization_id::text,0));
 for item in select value from jsonb_array_elements(body->'currentSources')loop
  select * into v from public.source_versions where organization_id=j.organization_id and id=(item->>'sourceDocument')::uuid
   and legacy_document_version::text=item->>'version' and declared_sha256=item->>'hash' for share nowait;
  if v.id is null then raise exception 'assessment_institutional_source_unresolved'using errcode='42501';end if;
  versions:=array_append(versions,v.id);
 end loop;
 for item in select value from jsonb_array_elements(body->'approvedConfigurations')order by value->>'id'loop
  select * into c from private.institutional_model_configurations where organization_id=j.organization_id and id=(item->>'id')::uuid
   and capital_project_id=work and status='approved' and revision::text=item->>'revision' and configuration_fingerprint=item->>'fingerprint'
   and configuration=item->'configuration' for share nowait;
  if c.id is null then raise exception 'assessment_institutional_configuration_unresolved'using errcode='42501';end if;
  proof:=private.institutional_configuration_ancestry_v1(j.organization_id,work,c.id);
  if proof->>'state'is distinct from 'captured_lineage'then raise exception 'assessment_institutional_ancestry_unresolved'using errcode='42501';end if;
  pins:=pins||(proof->'sources');
 end loop;
 versions:=versions||array(select(value->>'sourceVersionId')::uuid from jsonb_array_elements(pins));
 sid:=private.capture_assessment_document_input_v1(j.id,p_capability_token,'institutional_context',body,versions);
 for item in select value from jsonb_array_elements(body->'approvedConfigurations')loop
  proof:=private.institutional_configuration_ancestry_v1(j.organization_id,work,(item->>'id')::uuid);
  insert into private.assessment_institutional_configuration_links(organization_id,snapshot_id,work_id,configuration_id,configuration_revision,configuration_fingerprint,lineage_fingerprint)
   values(j.organization_id,sid,work,(item->>'id')::uuid,(item->>'revision')::integer,item->>'fingerprint',private.institutional_config_hash(proof))on conflict(organization_id,snapshot_id,configuration_id)do nothing;
 end loop;
 for item in select distinct value from jsonb_array_elements(pins)loop
  insert into private.assessment_institutional_fixed_rights(organization_id,snapshot_id,source_version_id,rights_version_id,content_hash)
   values(j.organization_id,sid,(item->>'sourceVersionId')::uuid,(item->>'rightsVersionId')::uuid,item->>'declaredSha256')on conflict(organization_id,snapshot_id,source_version_id,rights_version_id)do nothing;
 end loop;
 if private.assessment_input_snapshot_authority_v1(j.organization_id,sid,j.authorization_subject_id)<>'allowed'then raise exception 'assessment_institutional_authority_denied'using errcode='42501';end if;
 perform private.job_for_capability(j.id,p_capability_token);
 return body||jsonb_build_object('assessmentInputSnapshotId',sid);
exception when lock_not_available then raise exception 'assessment_capture_retry'using errcode='40001';
end $$;
create function public.worker_load_assessment_institutional_context_v1(p_job_id uuid,p_capability_token text)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_load_assessment_institutional_context_v1(p_job_id,p_capability_token);$$;
revoke all on function private.worker_load_assessment_institutional_context_v1(uuid,text),public.worker_load_assessment_institutional_context_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.worker_load_assessment_institutional_context_v1(uuid,text),public.worker_load_assessment_institutional_context_v1(uuid,text)to authenticated;
do $$declare t text;begin foreach t in array array['assessment_institutional_configuration_links','assessment_institutional_fixed_rights']loop
 execute format('alter table private.%I enable row level security',t);execute format('alter table private.%I force row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 execute format('create policy %I on private.%I for all to anon,authenticated using(false)with check(false)',t||'_deny',t);
 execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_review_history_mutation_v1()',t||'_immutable',t);
 execute format('create trigger %I before truncate on private.%I for each statement execute function private.reject_review_history_mutation_v1()',t||'_no_truncate',t);
 execute format('create trigger %I after insert on private.%I for each row execute function private.capture_audit_event()',t||'_audit',t);
 end loop;end $$;

create function private.worker_load_institutional_model_context_v3(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql volatile security definer set search_path=''as $$
declare j public.processing_jobs;begin
 j:=private.job_for_capability(p_job_id,p_capability_token);
 if j.kind='case_analysis'and exists(select 1 from private.assessment_input_snapshots where organization_id=j.organization_id and job_id=j.id and origin in('case_input','case_effective_input'))then
  return private.worker_load_assessment_institutional_context_v1(j.id,p_capability_token);
 end if;
 return private.worker_load_institutional_before_assessment_v3(j.id,p_capability_token);
end$$;
revoke all on function private.worker_load_institutional_model_context_v3(uuid,text)from public,anon,authenticated,service_role;
grant execute on function private.worker_load_institutional_model_context_v3(uuid,text)to authenticated;

-- Prospective 3V: consume only already licensed, physically retained public
-- sources in this work. Never collect raw URL content or create a publication.
set search_path='';
alter table private.assessment_input_snapshots drop constraint assessment_input_snapshots_origin_check;
alter table private.assessment_input_snapshots add constraint assessment_input_snapshots_origin_check check(origin in('case_input','case_effective_input','preliminary_input','retrieval','institutional_context','public_research','m07_final'));
create table private.assessment_research_source_links(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),snapshot_id uuid not null,
 delivery_id uuid not null,license_id uuid not null,retained_payload_id uuid not null,payload_fingerprint text not null check(payload_fingerprint~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,snapshot_id,delivery_id),unique(organization_id,snapshot_id,retained_payload_id),
 foreign key(organization_id,snapshot_id) references private.assessment_input_snapshots(organization_id,id),
 foreign key(organization_id,delivery_id) references private.capital_public_deliveries(organization_id,id),
 foreign key(organization_id,license_id) references private.capital_public_delivery_licenses(organization_id,id),
 foreign key(organization_id,retained_payload_id) references private.capital_public_retained_payloads(organization_id,id)
);
create index assessment_research_license_fk on private.assessment_research_source_links(organization_id,license_id);
create index assessment_research_retained_fk on private.assessment_research_source_links(organization_id,retained_payload_id);
create function private.assessment_research_source_scope_v1(p_org uuid,p_work uuid,p_delivery uuid,p_retained uuid,p_actor uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare d private.capital_public_deliveries;l private.capital_public_delivery_licenses;a private.capital_public_payload_allocations;r private.capital_public_retained_payloads;deadline timestamptz;margin integer;
begin
 if not private.resource_access_as_subject_v1(p_org,p_work,p_actor,'read')or not private.resource_access_as_subject_v1(p_org,p_work,p_actor,'work')then return null;end if;
 select x.* into d from private.capital_public_deliveries x join private.capital_public_input_snapshots s on(s.organization_id,s.id)=(x.organization_id,x.capture_id)
 where x.organization_id=p_org and x.id=p_delivery and s.work_id=p_work and x.origin_kind='published_public_payload';
 select * into l from private.capital_public_delivery_licenses where organization_id=p_org and delivery_id=d.id;
 select * into r from private.capital_public_retained_payloads where organization_id=p_org and id=p_retained;
 select * into a from private.capital_public_payload_allocations where organization_id=p_org and id=r.allocation_id and delivery_id=d.id and license_id=l.id;
 if d.id is null or l.id is null or r.id is null or a.id is null or a.payload_fingerprint<>d.payload_fingerprint or r.verified_sha256<>d.payload_fingerprint
 or not private.capital_body_physical_receipt_v1(p_org,r.id)or not private.capital_public_retention_healthy_v1(a.worker_token_id,a.policy_id)
 or not exists(select 1 from private.capital_public_payload_purge_queue where organization_id=p_org and allocation_id=a.id and status='pending')then return null;end if;
 deadline:=private.capital_public_retention_deadline_v1(l.id,p_org,a.retained_at,a.policy_id);
 select purge_margin_seconds into margin from private.capital_public_retention_policies where id=a.policy_id;
 if deadline is null or least(a.purge_at,deadline-make_interval(secs=>margin))<=clock_timestamp()then return null;end if;
 return jsonb_build_object('schemaVersion','capital-public-storage-scope.v1','retainedPayloadId',r.id,'allocationId',a.id,'bucket',a.bucket_id,'path',a.object_path,
 'payloadFingerprint',r.verified_sha256,'byteLength',r.verified_size,'storageObjectId',r.storage_object_id,'storageVersion',r.storage_version,'deliveryId',d.id,'retainedAt',a.retained_at,'uploadExpiresAt',a.upload_expires_at,
 'expiresAt',least(a.expires_at,deadline),'purgeAt',least(a.purge_at,deadline-make_interval(secs=>margin)),'state','complete');
end$$;
revoke all on function private.assessment_research_source_scope_v1(uuid,uuid,uuid,uuid,uuid)from public,anon,authenticated,service_role;
create function private.worker_prepare_assessment_research_v1(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs;work uuid;item record;scope jsonb;refs jsonb:='[]';body jsonb;sid uuid;fp text;s private.assessment_input_snapshots;
begin
 j:=private.job_for_capability(p_job_id,p_capability_token);
 if j.kind not in('case_analysis','preliminary_analysis')then raise exception 'assessment_research_job_denied'using errcode='42501';end if;
 select capital_project_id into work from public.document_intake_sessions where organization_id=j.organization_id and id=j.intake_session_id;
 perform 1 from public.capital_projects where organization_id=j.organization_id and id=work for no key update;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||j.organization_id::text,0));
 select * into s from private.assessment_input_snapshots where organization_id=j.organization_id and job_id=j.id and origin='public_research';
 if s.id is not null then
  for item in select * from private.assessment_research_source_links where organization_id=j.organization_id and snapshot_id=s.id order by delivery_id loop
   scope:=private.assessment_research_source_scope_v1(j.organization_id,work,item.delivery_id,item.retained_payload_id,j.authorization_subject_id);
   if scope is null or scope->>'payloadFingerprint'<>item.payload_fingerprint then raise exception 'assessment_research_source_denied'using errcode='42501';end if;
   refs:=refs||jsonb_build_array(jsonb_build_object('deliveryId',item.delivery_id,'retainedPayloadId',item.retained_payload_id,'payloadFingerprint',item.payload_fingerprint));
  end loop;
  if jsonb_array_length(refs)<>s.public_source_count then raise exception 'assessment_research_closure_unresolved'using errcode='42501';end if;
  perform private.job_for_capability(j.id,p_capability_token);
  return jsonb_build_object('schemaVersion','assessment-research-capture.v1','snapshotId',s.id,'status',case when s.public_source_count=0 then 'abstained'else 'succeeded'end,'sources',refs);
 end if;
 -- Only physical sources already admitted for this exact work are eligible. A
 -- URL found by an old collector is not a candidate for this query.
 for item in select d.id delivery_id,l.id license_id,r.id retained_payload_id,d.payload_fingerprint
 from private.capital_public_deliveries d join private.capital_public_input_snapshots c on(c.organization_id,c.id)=(d.organization_id,d.capture_id)
 join private.capital_public_delivery_licenses l on(l.organization_id,l.delivery_id)=(d.organization_id,d.id)
 join private.capital_public_payload_allocations a on(a.organization_id,a.delivery_id,a.license_id)=(d.organization_id,d.id,l.id)
 join private.capital_public_retained_payloads r on(r.organization_id,r.allocation_id)=(a.organization_id,a.id)
 where d.organization_id=j.organization_id and c.work_id=work order by d.delivered_at desc,d.id limit 25 loop
  scope:=private.assessment_research_source_scope_v1(j.organization_id,work,item.delivery_id,item.retained_payload_id,j.authorization_subject_id);
  if scope is not null then refs:=refs||jsonb_build_array(jsonb_build_object('deliveryId',item.delivery_id,'licenseId',item.license_id,'retainedPayloadId',item.retained_payload_id,'payloadFingerprint',item.payload_fingerprint));end if;
 end loop;
 select coalesce(jsonb_agg(value order by value->>'deliveryId'),'[]')into refs from jsonb_array_elements(refs);
 body:=jsonb_build_object('schemaVersion','assessment-research-capture.v1','status',case when jsonb_array_length(refs)=0 then'abstained'else'succeeded'end,'sources',refs);
 fp:=private.institutional_config_hash(body);
 insert into private.assessment_input_snapshots(organization_id,work_id,job_id,human_subject_id,origin,content_fingerprint,source_count,corpus_count,public_source_count)
 values(j.organization_id,work,j.id,j.authorization_subject_id,'public_research',fp,0,0,jsonb_array_length(refs))returning id into sid;
 insert into private.assessment_research_source_links(organization_id,snapshot_id,delivery_id,license_id,retained_payload_id,payload_fingerprint)
 select j.organization_id,sid,(value->>'deliveryId')::uuid,(value->>'licenseId')::uuid,(value->>'retainedPayloadId')::uuid,value->>'payloadFingerprint'from jsonb_array_elements(refs);
 perform private.job_for_capability(j.id,p_capability_token);
 return jsonb_build_object('schemaVersion','assessment-research-capture.v1','snapshotId',sid,'status',body->>'status','sources',coalesce((select jsonb_agg(value-'licenseId'order by value->>'deliveryId')from jsonb_array_elements(refs)),'[]'));
end$$;
create function public.worker_prepare_assessment_research_v1(p_job_id uuid,p_capability_token text)returns jsonb language sql security invoker set search_path=''as $$select private.worker_prepare_assessment_research_v1(p_job_id,p_capability_token);$$;
create function private.worker_read_assessment_research_source_v1(p_job_id uuid,p_capability_token text,p_snapshot_id uuid,p_retained_payload_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=''as $$
declare j public.processing_jobs;s private.assessment_input_snapshots;l private.assessment_research_source_links;answer jsonb;
begin
 j:=private.job_for_capability(p_job_id,p_capability_token);
 select * into s from private.assessment_input_snapshots where organization_id=j.organization_id and id=p_snapshot_id and job_id=j.id and origin='public_research'and human_subject_id=j.authorization_subject_id;
 select * into l from private.assessment_research_source_links where organization_id=j.organization_id and snapshot_id=s.id and retained_payload_id=p_retained_payload_id;
 if s.id is null or l.id is null then raise exception 'assessment_research_source_denied'using errcode='42501';end if;
 answer:=private.assessment_research_source_scope_v1(j.organization_id,s.work_id,l.delivery_id,l.retained_payload_id,j.authorization_subject_id);
 if answer is null or answer->>'payloadFingerprint'<>l.payload_fingerprint then raise exception 'assessment_research_source_denied'using errcode='42501';end if;
 perform private.job_for_capability(j.id,p_capability_token);return answer;
end$$;
create function public.worker_read_assessment_research_source_v1(p_job_id uuid,p_capability_token text,p_snapshot_id uuid,p_retained_payload_id uuid)returns jsonb language sql security invoker set search_path=''as $$select private.worker_read_assessment_research_source_v1(p_job_id,p_capability_token,p_snapshot_id,p_retained_payload_id);$$;
revoke all on function private.worker_prepare_assessment_research_v1(uuid,text),public.worker_prepare_assessment_research_v1(uuid,text),private.worker_read_assessment_research_source_v1(uuid,text,uuid,uuid),public.worker_read_assessment_research_source_v1(uuid,text,uuid,uuid)from public,anon,authenticated,service_role;
grant execute on function private.worker_prepare_assessment_research_v1(uuid,text),public.worker_prepare_assessment_research_v1(uuid,text),private.worker_read_assessment_research_source_v1(uuid,text,uuid,uuid),public.worker_read_assessment_research_source_v1(uuid,text,uuid,uuid)to authenticated;
-- Closed supplemental authority; retained source IDs can never be mistaken for
-- M07 components or omitted from proposal cardinalities.
alter function private.assessment_input_snapshot_authority_v1(uuid,uuid,uuid)rename to assessment_input_snapshot_before_research_v1;
revoke all on function private.assessment_input_snapshot_before_research_v1(uuid,uuid,uuid)from public,anon,authenticated,service_role;
create function private.assessment_input_snapshot_authority_v1(p_org uuid,p_snapshot uuid,p_actor uuid)returns text language plpgsql volatile security definer set search_path=''as $$
declare s private.assessment_input_snapshots;l private.assessment_research_source_links;scope jsonb;
begin
 select * into s from private.assessment_input_snapshots where organization_id=p_org and id=p_snapshot;
 if s.id is null then return'unresolved';end if;
 if s.origin<>'public_research'then return private.assessment_input_snapshot_before_research_v1(p_org,p_snapshot,p_actor);end if;
 if s.source_count<>0 or s.corpus_count<>0 or s.public_source_count<>(select count(*)from private.assessment_research_source_links where organization_id=p_org and snapshot_id=s.id)then return'unresolved';end if;
 if not private.resource_access_as_subject_v1(p_org,s.work_id,p_actor,'read')then return'denied';end if;
 for l in select * from private.assessment_research_source_links where organization_id=p_org and snapshot_id=s.id loop
  scope:=private.assessment_research_source_scope_v1(p_org,s.work_id,l.delivery_id,l.retained_payload_id,p_actor);
  if scope is null or scope->>'payloadFingerprint'<>l.payload_fingerprint then return'denied';end if;
 end loop;
 return'allowed';
end$$;
revoke all on function private.assessment_input_snapshot_authority_v1(uuid,uuid,uuid)from public,anon,authenticated,service_role;
alter table private.assessment_research_source_links enable row level security;alter table private.assessment_research_source_links force row level security;
revoke all on private.assessment_research_source_links from public,anon,authenticated,service_role;
create policy assessment_research_deny on private.assessment_research_source_links for all to anon,authenticated using(false)with check(false);
create trigger assessment_research_immutable before update or delete on private.assessment_research_source_links for each row execute function private.reject_review_history_mutation_v1();
create trigger assessment_research_no_truncate before truncate on private.assessment_research_source_links for each statement execute function private.reject_review_history_mutation_v1();
create trigger assessment_research_audit after insert on private.assessment_research_source_links for each row execute function private.capture_audit_event();

-- Native M07 publication and its review index are one transaction. A failed
-- index/authority check rolls back the artifact commit too. Recovery never
-- impersonates the original producer or manufactures an index for old releases.
create or replace function private.worker_commit_capital_m07_result_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_accepted_invocation_id uuid,
 p_parsed_retained_payload_id uuid,p_final_retained_payload_id uuid,p_final_fingerprint text,p_quality_results jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_m07_recipes:=private.require_capital_m07_recipe_v1(p_job_id,p_capability_token,p_recipe_id);result jsonb;
begin
 result:=private.capital_m07_commit_result_core_v1(r.organization_id,r.id,p_accepted_invocation_id,p_parsed_retained_payload_id,p_final_retained_payload_id,p_final_fingerprint,p_quality_results);
 if not private.capital_public_capture_clock_current_v1(p_job_id,p_capability_token)then raise exception 'capital_m07_denied'using errcode='42501';end if;
 perform private.worker_record_m07_assessment_index_v1(p_job_id,p_capability_token,p_recipe_id,p_final_retained_payload_id);
 return result;
end$$;
revoke all on function private.worker_commit_capital_m07_result_v1(uuid,text,uuid,uuid,uuid,uuid,text,jsonb)from public,anon,authenticated,service_role;
grant execute on function private.worker_commit_capital_m07_result_v1(uuid,text,uuid,uuid,uuid,uuid,text,jsonb)to authenticated;

commit;