-- Founder decision of 24/09/2026 (docs/build/arcabouco-stage0/FOUNDER-ACTS.md, recorded in
-- docs/security/provider-processing/2026-09-24/DECISION.md): the provider verification of 21/09/2026
-- stops expiring by date. An assurance now states validThrough either as a date, which expires exactly
-- as before, or as null: valid until it is revoked or superseded by a new identity. Nothing else about
-- eligibility changes. Account, project, credential binding, endpoint, region, model, resource,
-- purpose, classification, rights, training use and every retention category are still checked, a
-- combination without an assurance is still refused, and revocation still ends an assurance at once.
set search_path='';

-- The two functions restated below are pinned to the bodies they replace (or to the bodies this
-- migration installs, so a replay is a no-op): a parallel change to either stops this migration
-- instead of being overwritten.
do $$begin
 if (select md5(prosrc) from pg_proc where oid='private.record_provider_processing_assurance_v1(jsonb,text)'::regprocedure) not in ('3a085fcbfba8ed79fd2ef2564b86026d','b56758c40409b16b42a9993f2c16249b')
 or (select md5(prosrc) from pg_proc where oid='private.provider_resource_allowed_v1(jsonb,text,text,text,integer)'::regprocedure) not in ('5bdee3621f670de5e56162aa022a3d71','55827d6277cc8dcb212fc21c4fde746c')
 then raise exception 'provider_assurance_restated_contract_changed';end if;
end $$;

-- The table check (valid_through > reviewed_at) is kept unchanged: a stated date must still follow
-- the review, and a null valid_through satisfies it.
alter table private.provider_processing_assurances alter column valid_through drop not null;

-- Restated from 20260921155432. Changes: validThrough leaves the list of required strings and must be
-- a non-empty string or JSON null (an omitted key is still refused), and only a stated date is
-- compared with the clock.
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
 foreach k in array array['id','accountRef','projectRef','credentialBinding','provider','endpoint','resource','region','reviewedBy','reviewedAt','trainingUse','eligibility','zeroRetention'] loop
  if jsonb_typeof(p_document->k) is distinct from 'string' or length(p_document->>k) not between 1 and 200 then raise exception 'provider_assurance_field_invalid' using errcode='22023';end if;
 end loop;
 -- validThrough is always stated: a date expires exactly as before; null holds until revoked or superseded.
 if jsonb_typeof(p_document->'validThrough') is distinct from 'null'
 and (jsonb_typeof(p_document->'validThrough') is distinct from 'string' or length(p_document->>'validThrough') not between 1 and 200)
 then raise exception 'provider_assurance_field_invalid' using errcode='22023';end if;
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
 or (p_document->>'validThrough' is not null and (p_document->>'validThrough')::timestamptz<=clock_timestamp()) then raise exception 'provider_assurance_scope_invalid' using errcode='22023';end if;
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

-- Restated from 20260921155420. Change: only a stated valid_through is compared with the clock.
create or replace function private.provider_resource_allowed_v1(p_route jsonb,p_resource text,p_purpose text,p_classification text,p_retention_limit integer)
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
 -- A null valid_through has no date to pass; revocation, filtered above, still ends it at once.
 if a.reviewed_at>clock_timestamp() or (a.valid_through is not null and a.valid_through<=clock_timestamp())
 or a.document->>'eligibility'<>'supported' or a.document->>'trainingUse'<>'prohibited'
 or not (a.document->'purposes' ? p_purpose) or not (a.document->'classifications' ? p_classification)
 or not (a.document->'rights' ? 'process') then return null;end if;
 foreach k in array array['requestContentSeconds','abuseMonitoringSeconds','applicationStateSeconds','cacheSeconds','metadataSeconds'] loop
  if (a.document#>>array['retention',k])::numeric>p_retention_limit then return null;end if;
 end loop;
 return a.id;
end $$;
