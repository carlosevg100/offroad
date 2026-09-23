CREATE OR REPLACE FUNCTION private.submit_platform_method_candidate_v1(p_id uuid, p_release_id text, p_bundle jsonb, p_author text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare fp text; existing private.platform_method_candidates; pin jsonb; component jsonb;begin
 perform private.require_platform_method_operator_v1();
 if p_id is null or p_release_id is null or p_author is null or length(btrim(p_author)) not between 3 and 200
 or jsonb_typeof(p_bundle) is distinct from 'object' or octet_length(p_bundle::text)>2000000
 or not p_bundle ?& array['manifest','manifestText','components','evidence','sourceCommit']
 or (select count(*) from jsonb_object_keys(p_bundle))<>5
 or p_bundle->>'sourceCommit' is null or p_bundle->>'sourceCommit' !~ '^[a-f0-9]{40}$'
 or jsonb_typeof(p_bundle->'manifestText') is distinct from 'string'
 or jsonb_typeof(p_bundle->'manifest') is distinct from 'object'
 or jsonb_typeof(p_bundle->'components') is distinct from 'array'
 or jsonb_array_length(p_bundle->'components')=0
 or jsonb_typeof(p_bundle->'evidence') is distinct from 'array'
 or jsonb_array_length(p_bundle->'evidence')=0 then raise exception 'platform_method_bundle_invalid' using errcode='22023';end if;
 -- Manifest bytes are the compiler's stable JSON payload, before its manifestHash field.
 if (p_bundle->>'manifestText')::jsonb is distinct from (p_bundle->'manifest')-'manifestHash'
 or encode(extensions.digest(p_bundle->>'manifestText','sha256'),'hex') is distinct from p_bundle->'manifest'->>'manifestHash'
 or p_bundle->'manifest'->>'schemaVersion' is distinct from 'compiled-procedure-manifest.v1'
 or p_bundle->'manifest'->>'authoringStatus' is distinct from 'ready_for_review'
 or p_bundle->'manifest'->'pendingContent' is distinct from '[]'::jsonb
 or p_bundle->'manifest'->'grantsExecution' is distinct from 'false'::jsonb
 or coalesce(p_bundle->'manifest'->'procedure'->>'maturity','') not in ('tested','ready_for_founder','production')
 or p_bundle->'manifest'->'procedure'->>'id' is null
 or p_bundle->'manifest'->'procedure'->>'version' is null
 then raise exception 'platform_method_manifest_invalid' using errcode='22023';end if;
 if p_bundle->'components' is distinct from (select jsonb_agg(x->'component' order by ord) from jsonb_array_elements(p_bundle->'manifest'->'components') with ordinality t(x,ord))
 then raise exception 'platform_method_components_mismatch' using errcode='22023';end if;
 for component in select * from jsonb_array_elements(p_bundle->'components') loop
  if ((component->'invariants') @> '["law","contractual_definition","traceability","verification","access_barriers","deterministic_financial_math"]'::jsonb) is distinct from true
  or component->'rights'->'inheritSourceRestrictions' is distinct from 'true'::jsonb
  then raise exception 'platform_method_invariants_required' using errcode='22023';end if;
 end loop;
 for pin in select * from jsonb_array_elements(p_bundle->'evidence') loop
  if jsonb_typeof(pin) is distinct from 'object' or not pin ?& array['path','hash'] or (select count(*) from jsonb_object_keys(pin))<>2
  or pin->>'hash' is null or pin->>'hash' !~ '^[a-f0-9]{64}$' or pin->>'path' is null or pin->>'path' !~ '^packages/credit-playbook/knowledge/reviews/'
  or pin->>'path' like '%..%' then raise exception 'platform_method_evidence_invalid' using errcode='22023';end if;
 end loop;
 if (select count(distinct x->>'path') from jsonb_array_elements(p_bundle->'evidence') x)<>jsonb_array_length(p_bundle->'evidence') then raise exception 'platform_method_evidence_duplicate' using errcode='22023';end if;
 fp:=encode(extensions.digest(jsonb_build_object('releaseId',p_release_id,'bundle',p_bundle,'author',btrim(p_author))::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('platform-method:'||(p_bundle->'manifest'->'procedure'->>'id'),0));
 select * into existing from private.platform_method_candidates where id=p_id;
 if found then if existing.fingerprint is distinct from fp then raise exception 'platform_method_request_reused' using errcode='22023';end if;return fp;end if;
 if exists(select 1 from private.platform_method_releases where id=p_release_id or (method_id=p_bundle->'manifest'->'procedure'->>'id' and version=p_bundle->'manifest'->'procedure'->>'version')) then raise exception 'platform_method_identity_already_published' using errcode='22023';end if;
 insert into private.platform_method_candidates(id,release_id,method_id,version,bundle,fingerprint,author)
 values(p_id,p_release_id,p_bundle->'manifest'->'procedure'->>'id',p_bundle->'manifest'->'procedure'->>'version',p_bundle,fp,btrim(p_author));
 return fp;
end $function$
