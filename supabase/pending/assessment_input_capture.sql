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
