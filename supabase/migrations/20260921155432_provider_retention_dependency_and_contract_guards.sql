-- Stage 16 review: close null-valued attestations and inherit every source retention deadline.
set search_path='';
create or replace function private.record_provider_processing_assurance_v1(p_document jsonb,p_change_reference text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_fingerprint text; v_existing private.provider_processing_assurances; k text; e jsonb;begin
 if current_user<>'postgres' then raise exception 'provider_assurance_operator_required' using errcode='42501';end if;
 if p_document is null or jsonb_typeof(p_document)<>'object' or p_document->>'policyVersion' is distinct from 'offroad-provider-retention-v2'
 or length(coalesce(p_change_reference,'')) not between 10 and 1000
 or p_document->>'trainingUse' not in ('prohibited','permitted','unknown')
 or p_document->>'eligibility' not in ('supported','prohibited','unknown')
 or p_document->>'zeroRetention' not in ('verified','not_contracted','ineligible','unknown')
 or p_document->'revokedAt' is distinct from 'null'::jsonb then raise exception 'provider_assurance_invalid' using errcode='22023';end if;
 foreach k in array array['id','accountRef','projectRef','credentialBinding','provider','endpoint','resource','region','reviewedBy','reviewedAt','validThrough','trainingUse','eligibility','zeroRetention'] loop
  if jsonb_typeof(p_document->k) is distinct from 'string' or length(p_document->>k) not between 1 and 200 then raise exception 'provider_assurance_field_invalid' using errcode='22023';end if;
 end loop;
 foreach k in array array['models','purposes','classifications','rights','evidence'] loop
  if jsonb_typeof(p_document->k) is distinct from 'array' or jsonb_array_length(p_document->k) not between 1 and 50 then raise exception 'provider_assurance_array_invalid' using errcode='22023';end if;
 end loop;
 if p_document-array['id','policyVersion','accountRef','projectRef','credentialBinding','provider','models','endpoint','resource','region','eligibility','purposes','classifications','rights','trainingUse','retention','zeroRetention','evidence','reviewedBy','reviewedAt','validThrough','revokedAt']<>'{}'::jsonb
 or exists(select 1 from jsonb_array_elements(p_document->'rights') x where jsonb_typeof(x)<>'string' or length(x#>>'{}') not between 1 and 200)
 or p_document->>'resource' not in ('inference','inline_document','file_upload','prompt_cache','schema_cache','batch','background','external_search','external_tool','embedding','persisted_state')
 or p_document->>'endpoint' !~ '^https://[a-z0-9.-]+/[^?#]*$'
 or exists(select 1 from jsonb_array_elements(p_document->'models') x where jsonb_typeof(x)<>'string' or x#>>'{}' ~ '[*%]')
 or not (p_document->'classifications' <@ '["public","internal","confidential","restricted"]'::jsonb)
 or not (p_document->'purposes' <@ '["public_research","document_processing","case_analysis","artifact_generation","localization","evaluation"]'::jsonb)
 or (p_document->>'reviewedAt')::timestamptz>clock_timestamp()
 or (p_document->>'validThrough')::timestamptz<=clock_timestamp() then raise exception 'provider_assurance_scope_invalid' using errcode='22023';end if;
 foreach k in array array['requestContentSeconds','abuseMonitoringSeconds','applicationStateSeconds','cacheSeconds','metadataSeconds'] loop
  if jsonb_typeof(p_document#>array['retention',k]) is distinct from 'number'
  or (p_document#>>array['retention',k]) !~ '^[0-9]+$'
  or (p_document#>>array['retention',k])::numeric>315360000 then raise exception 'provider_assurance_retention_invalid' using errcode='22023';end if;
 end loop;
 if jsonb_typeof(p_document#>'{retention,exceptions}') is distinct from 'array'
 or not (p_document#>'{retention,exceptions}' <@ '["legal_hold","security_investigation","policy_enforcement"]'::jsonb) then raise exception 'provider_assurance_retention_invalid' using errcode='22023';end if;
 foreach k in array array['provider_terms','account_configuration','credential_binding'] loop
  if not exists(select 1 from jsonb_array_elements(p_document->'evidence') x where x->>'kind'=k) then raise exception 'provider_assurance_evidence_missing' using errcode='22023';end if;
 end loop;
 for e in select value from jsonb_array_elements(p_document->'evidence') loop
  if jsonb_typeof(e)<>'object' or e-array['kind','reference','sha256']<>'{}'::jsonb or coalesce(e->>'kind','') not in ('provider_terms','account_configuration','credential_binding')
 or coalesce(e->>'sha256','') !~ '^[a-f0-9]{64}$'
  or length(coalesce(e->>'reference','')) not between 1 and 1000 then raise exception 'provider_assurance_evidence_invalid' using errcode='22023';end if;
 end loop;
 v_id:=(p_document->>'id')::uuid;
 v_fingerprint:=encode(extensions.digest(p_document::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('provider-processing-assurances',0));
 select * into v_existing from private.provider_processing_assurances where id=v_id;
 if found then
  if v_existing.fingerprint<>v_fingerprint or v_existing.revoked_at is not null then raise exception 'provider_assurance_identity_reused' using errcode='22023';end if;
  return v_id;
 end if;
 if exists(select 1 from private.provider_processing_assurances a where a.revoked_at is null
 and a.provider=p_document->>'provider' and a.account_ref=p_document->>'accountRef' and a.project_ref=p_document->>'projectRef'
 and a.credential_binding=p_document->>'credentialBinding' and a.endpoint=p_document->>'endpoint' and a.resource=p_document->>'resource' and a.region=p_document->>'region'
 and exists(select 1 from jsonb_array_elements_text(p_document->'models') m where a.document->'models' ? m)) then
 raise exception 'provider_assurance_overlap' using errcode='23505';end if;
 insert into private.provider_processing_assurances(id,document,fingerprint,provider,account_ref,project_ref,credential_binding,endpoint,resource,region,reviewed_at,valid_through)
 values(v_id,p_document,v_fingerprint,p_document->>'provider',p_document->>'accountRef',p_document->>'projectRef',p_document->>'credentialBinding',p_document->>'endpoint',p_document->>'resource',p_document->>'region',(p_document->>'reviewedAt')::timestamptz,(p_document->>'validThrough')::timestamptz);
 insert into private.provider_processing_assurance_events(assurance_id,action,fingerprint,change_reference) values(v_id,'recorded',v_fingerprint,p_change_reference);
 return v_id;
end $$;

create or replace function private.worker_authorize_provider_processing_v1(p_job_id uuid,p_capability_token text,p_route jsonb,p_resources text[],p_purpose text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);
 ids uuid[]:='{}';reasons text[]:='{}';resource text;assurance uuid;decision_id uuid;
 classification text:='restricted';retention_limit integer:=2592000;rights_deadline timestamptz;begin
 -- Only route metadata reaches the audit store. Neither prompts, URLs to company documents,
 -- content, credentials nor arbitrary model-supplied fields are accepted here.
 if p_route is null or jsonb_typeof(p_route)<>'object'
 or p_route-array['provider','model','accountRef','projectRef','credentialBinding','endpoint','region']<>'{}'::jsonb
 or not (p_route ?& array['provider','model','accountRef','projectRef','credentialBinding','endpoint','region'])
 or octet_length(p_route::text)>2000 or p_resources is null or cardinality(p_resources) not between 1 and 11
 or not (p_resources <@ array['inference','inline_document','file_upload','prompt_cache','schema_cache','batch','background','external_search','external_tool','embedding','persisted_state'])
 or p_purpose is null or p_purpose not in ('public_research','document_processing','case_analysis','artifact_generation','localization','evaluation')
 then raise exception 'processing_route_invalid' using errcode='22023';end if;
 if 'external_search'=any(p_resources) then
  if p_purpose<>'public_research' or not (p_resources <@ array['external_search','inference','prompt_cache','schema_cache']) then raise exception 'processing_public_route_invalid' using errcode='22023';end if;
  classification:='public';
 end if;
 -- Current source rights and responsibility are checked again on each attempt.
 if not private.job_sources_rights_current_v1(j.id) then raise exception 'processing_source_rights_denied' using errcode='42501';end if;
 -- Include current and pinned rights throughout the same dependency closure used by authorization.
 with recursive dependencies(id) as (
 select d.id from public.source_documents d where d.organization_id=j.organization_id
 and ((j.source_document_id is not null and d.id=j.source_document_id)
 or (j.source_document_id is null and d.intake_session_id=j.intake_session_id))
 union select d.source_version_id from dependencies g join private.resource_dependencies d
 on d.organization_id=j.organization_id and d.derived_version_id=g.id
 ), obligations as (
 select r.expires_at,r.store_until from dependencies g join lateral(select x.* from private.source_rights_versions x
 where x.organization_id=j.organization_id and x.source_version_id=g.id order by x.revision desc limit 1) r on true
 union all
 select r.expires_at,r.store_until from dependencies g join private.resource_dependencies d
 on d.organization_id=j.organization_id and d.derived_version_id=g.id
 join private.source_rights_versions r on r.organization_id=d.organization_id and r.id=d.source_rights_version_id
 ) select min(least(expires_at,store_until)) into rights_deadline from obligations;
 if rights_deadline is not null and classification<>'public' then retention_limit:=greatest(0,least(retention_limit,floor(extract(epoch from rights_deadline-clock_timestamp()))));end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('provider-processing-assurances',0));
 foreach resource in array p_resources loop
  assurance:=private.provider_resource_allowed_v1(p_route,resource,p_purpose,classification,retention_limit);
  if assurance is null then reasons:=array_append(reasons,'processing_resource_ineligible:'||resource);
  else ids:=array_append(ids,assurance);end if;
 end loop;
 insert into private.processing_eligibility_decisions(organization_id,job_id,route,resources,purpose,classification,allowed,assurance_ids,reasons,policy_version)
 values(j.organization_id,j.id,p_route,p_resources,p_purpose,classification,cardinality(reasons)=0,ids,reasons,'offroad-provider-retention-v2') returning id into decision_id;
 return jsonb_build_object('allowed',cardinality(reasons)=0,'policyVersion','offroad-provider-retention-v2','assuranceId',case when cardinality(ids)=1 then ids[1] else null end,'assuranceIds',ids,'decisionId',decision_id,'classification',classification,'reasons',to_jsonb(reasons));
end $$;
