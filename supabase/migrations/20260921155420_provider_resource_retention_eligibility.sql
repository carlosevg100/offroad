-- Stage 16. Platform attestations are operator-owned, not tenant data or worker assertions.
set search_path='';
create table private.provider_processing_assurances (
 id uuid primary key,
 document jsonb not null check(jsonb_typeof(document)='object'),
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 provider text not null check(provider in ('openai','anthropic','perplexity','firecrawl')),
 account_ref text not null, project_ref text not null, credential_binding text not null,
 endpoint text not null, resource text not null, region text not null,
 reviewed_at timestamptz not null, valid_through timestamptz not null,
 revoked_at timestamptz, created_at timestamptz not null default clock_timestamp(),
 check(valid_through>reviewed_at)
);
create index provider_processing_assurance_lookup_idx on private.provider_processing_assurances
 (provider,account_ref,project_ref,credential_binding,endpoint,resource,region) where revoked_at is null;
create table private.provider_processing_assurance_events (
 id uuid primary key default gen_random_uuid(), assurance_id uuid not null references private.provider_processing_assurances(id),
 action text not null check(action in ('recorded','revoked')), fingerprint text not null,
 operator_name name not null default current_user, change_reference text not null,
 created_at timestamptz not null default clock_timestamp()
);
create index provider_processing_assurance_events_parent_idx on private.provider_processing_assurance_events(assurance_id,created_at);
create table private.processing_eligibility_decisions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 job_id uuid not null, route jsonb not null, resources text[] not null,
 purpose text not null, classification text not null, allowed boolean not null,
 assurance_ids uuid[] not null, reasons text[] not null,
 policy_version text not null check(policy_version='offroad-provider-retention-v2'),
 created_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),
 foreign key(organization_id,job_id) references public.processing_jobs(organization_id,id)
);
create index processing_eligibility_job_idx on private.processing_eligibility_decisions(organization_id,job_id,created_at);
do $$ declare t text;begin
 foreach t in array array['provider_processing_assurances','provider_processing_assurance_events','processing_eligibility_decisions'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('alter table private.%I force row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 execute format('create policy deny_clients on private.%I as restrictive for all to anon,authenticated using(false) with check(false)',t);
 end loop;
end $$;
create trigger provider_processing_events_immutable before update or delete on private.provider_processing_assurance_events
 for each row execute function private.reject_source_version_mutation_v1();
create trigger processing_eligibility_decisions_immutable before update or delete on private.processing_eligibility_decisions
 for each row execute function private.reject_source_version_mutation_v1();

create function private.guard_provider_processing_assurance_v1() returns trigger
language plpgsql security invoker set search_path='' as $$begin
 if tg_op='DELETE' or old.revoked_at is not null or new.revoked_at is null
 or (to_jsonb(old)-'revoked_at') is distinct from (to_jsonb(new)-'revoked_at') then
 raise exception 'provider_assurance_immutable' using errcode='42501';end if;
 return new;
end $$;
revoke all on function private.guard_provider_processing_assurance_v1() from public,anon,authenticated,service_role;
create trigger provider_processing_assurance_immutable before update or delete on private.provider_processing_assurances
 for each row execute function private.guard_provider_processing_assurance_v1();

create function private.record_provider_processing_assurance_v1(p_document jsonb,p_change_reference text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_fingerprint text; v_existing private.provider_processing_assurances; k text; e jsonb;begin
 if current_user<>'postgres' then raise exception 'provider_assurance_operator_required' using errcode='42501';end if;
 if p_document is null or jsonb_typeof(p_document)<>'object' or p_document->>'policyVersion' is distinct from 'offroad-provider-retention-v2'
 or length(coalesce(p_change_reference,'')) not between 10 and 1000
 or p_document->>'trainingUse' not in ('prohibited','permitted','unknown')
 or p_document->>'eligibility' not in ('supported','prohibited','unknown')
 or p_document->>'zeroRetention' not in ('verified','not_contracted','ineligible','unknown')
 or p_document->'revokedAt' is distinct from 'null'::jsonb then raise exception 'provider_assurance_invalid' using errcode='22023';end if;
 foreach k in array array['id','accountRef','projectRef','credentialBinding','provider','endpoint','resource','region','reviewedBy','reviewedAt','validThrough'] loop
  if jsonb_typeof(p_document->k) is distinct from 'string' or length(p_document->>k) not between 1 and 200 then raise exception 'provider_assurance_field_invalid' using errcode='22023';end if;
 end loop;
 foreach k in array array['models','purposes','classifications','rights','evidence'] loop
  if jsonb_typeof(p_document->k) is distinct from 'array' or jsonb_array_length(p_document->k) not between 1 and 50 then raise exception 'provider_assurance_array_invalid' using errcode='22023';end if;
 end loop;
 if p_document->>'resource' not in ('inference','inline_document','file_upload','prompt_cache','schema_cache','batch','background','external_search','external_tool','embedding','persisted_state')
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
  if jsonb_typeof(e)<>'object' or coalesce(e->>'sha256','') !~ '^[a-f0-9]{64}$'
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
create function private.revoke_provider_processing_assurance_v1(p_id uuid,p_change_reference text) returns void
language plpgsql security invoker set search_path='' as $$declare a private.provider_processing_assurances;begin
 if current_user<>'postgres' then raise exception 'provider_assurance_operator_required' using errcode='42501';end if;
 if length(coalesce(p_change_reference,'')) not between 10 and 1000 then raise exception 'provider_assurance_change_required' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('provider-processing-assurances',0));
 select * into strict a from private.provider_processing_assurances where id=p_id for update;
 if a.revoked_at is not null then return;end if;
 update private.provider_processing_assurances set revoked_at=clock_timestamp() where id=p_id;
 insert into private.provider_processing_assurance_events(assurance_id,action,fingerprint,change_reference) values(p_id,'revoked',a.fingerprint,p_change_reference);
end $$;
revoke all on function private.record_provider_processing_assurance_v1(jsonb,text),private.revoke_provider_processing_assurance_v1(uuid,text) from public,anon,authenticated,service_role;

-- Identical dimensions to the pure TypeScript evaluator, exercised by SQL parity cases.
-- No client or worker has EXECUTE on this unscoped predicate.
create function private.provider_resource_allowed_v1(p_route jsonb,p_resource text,p_purpose text,p_classification text,p_retention_limit integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare a private.provider_processing_assurances; k text; count_matches integer;begin
 select count(*) into count_matches from private.provider_processing_assurances x where x.revoked_at is null
 and x.provider=p_route->>'provider' and x.account_ref=p_route->>'accountRef' and x.project_ref=p_route->>'projectRef'
 and x.credential_binding=p_route->>'credentialBinding' and x.endpoint=p_route->>'endpoint' and x.region=p_route->>'region'
 and x.resource=p_resource and x.document->'models' ? (p_route->>'model');
 if count_matches<>1 then return null;end if;
 select * into a from private.provider_processing_assurances x where x.revoked_at is null
 and x.provider=p_route->>'provider' and x.account_ref=p_route->>'accountRef' and x.project_ref=p_route->>'projectRef'
 and x.credential_binding=p_route->>'credentialBinding' and x.endpoint=p_route->>'endpoint' and x.region=p_route->>'region'
 and x.resource=p_resource and x.document->'models' ? (p_route->>'model');
 if a.reviewed_at>clock_timestamp() or a.valid_through<=clock_timestamp()
 or a.document->>'eligibility'<>'supported' or a.document->>'trainingUse'<>'prohibited'
 or not (a.document->'purposes' ? p_purpose) or not (a.document->'classifications' ? p_classification)
 or not (a.document->'rights' ? 'process') then return null;end if;
 foreach k in array array['requestContentSeconds','abuseMonitoringSeconds','applicationStateSeconds','cacheSeconds','metadataSeconds'] loop
  if (a.document#>>array['retention',k])::numeric>p_retention_limit then return null;end if;
 end loop;
 return a.id;
end $$;
revoke all on function private.provider_resource_allowed_v1(jsonb,text,text,text,integer) from public,anon,authenticated,service_role;

create function private.worker_authorize_provider_processing_v1(p_job_id uuid,p_capability_token text,p_route jsonb,p_resources text[],p_purpose text)
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
 select min(least(r.expires_at,r.store_until)) into rights_deadline
 from public.source_documents d join lateral(select x.* from private.source_rights_versions x
 where x.organization_id=d.organization_id and x.source_version_id=d.id order by x.revision desc limit 1) r on true
 where d.organization_id=j.organization_id and d.intake_session_id=j.intake_session_id;
 if rights_deadline is not null and classification<>'public' then retention_limit:=greatest(0,least(retention_limit,floor(extract(epoch from rights_deadline-clock_timestamp()))::integer));end if;
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
create function public.worker_authorize_provider_processing_v1(p_job_id uuid,p_capability_token text,p_route jsonb,p_resources text[],p_purpose text)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_authorize_provider_processing_v1(p_job_id,p_capability_token,p_route,p_resources,p_purpose);$$;
revoke all on function private.worker_authorize_provider_processing_v1(uuid,text,jsonb,text[],text),public.worker_authorize_provider_processing_v1(uuid,text,jsonb,text[],text) from public,anon,authenticated,service_role;
grant execute on function private.worker_authorize_provider_processing_v1(uuid,text,jsonb,text[],text),public.worker_authorize_provider_processing_v1(uuid,text,jsonb,text[],text) to authenticated;

-- Boot proof: an old database cannot silently serve an image requiring the new authority.
do $$ declare body text;begin
 select pg_get_functiondef('public.worker_runtime_schema_contract_v1()'::regprocedure) into body;
 if position('domain-event-outbox.v1' in body)=0 then raise exception 'worker_runtime_contract_changed';end if;
 body:=replace(body,'domain-event-outbox.v1','domain-event-outbox.v1","provider-resource-retention.v2');
 execute body;
end $$;
