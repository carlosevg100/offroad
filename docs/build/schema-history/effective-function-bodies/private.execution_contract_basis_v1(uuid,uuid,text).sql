CREATE OR REPLACE FUNCTION private.execution_contract_basis_v1(p_work_id uuid, p_version_id uuid, p_method_id text DEFAULT 'prepare-capital-structure-decision'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w public.capital_projects;human private.principals;rev bigint;policy_hash text;p private.execution_method_profiles;
 v public.assumption_versions;s public.assumption_sets;basis jsonb;entry jsonb;adoptions jsonb:='[]';hypotheses jsonb:='[]';
 sources jsonb:='[]';unverified jsonb:='[]';src record;rights_rev integer;res uuid;hash text;
begin
 if auth.uid() is null then raise exception 'execution_subject_required' using errcode='42501';end if;
 select * into w from public.capital_projects where id=p_work_id;
 if not found then raise exception 'execution_access_denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||w.organization_id::text,0));
 select * into human from private.principals where organization_id=w.organization_id and user_id=auth.uid() and kind='human' and revoked_at is null;
 if not found or not private.evaluate_resource_policy_v1(w.organization_id,w.id,auth.uid(),'work','analysis') or w.status='archived'
 then raise exception 'execution_access_denied' using errcode='42501';end if;
 if not private.execution_producer_enabled_v1(w.organization_id) then raise exception 'execution_producer_denied' using errcode='42501';end if;
 p:=private.execution_released_profile_v1(p_method_id);
 perform private.require_execution_release_v1(p.id);
 insert into private.authorization_revisions(organization_id,resource_id,subject_user_id) values(w.organization_id,private.resource_root_v1(w.organization_id,w.id),auth.uid()) on conflict do nothing;
 select revision into strict rev from private.authorization_revisions where organization_id=w.organization_id and resource_id=private.resource_root_v1(w.organization_id,w.id) and subject_user_id=auth.uid();
 policy_hash:=private.execution_policy_fingerprint_v1(w.organization_id,w.id,human.id,rev);
 select av.* into v from public.assumption_versions av where av.organization_id=w.organization_id and av.id=p_version_id and av.classification='working_basis';
 if not found or not private.can_read_assumption_version_v1(w.organization_id,v.id) then raise exception 'execution_basis_denied' using errcode='42501';end if;
 select * into strict s from public.assumption_sets where organization_id=w.organization_id and id=v.set_id;
 if s.work_id is distinct from w.id then raise exception 'execution_basis_denied' using errcode='42501';end if;
 basis:=private.execution_json_projection_v1(v.canonical_snapshot);
 for entry in select value from jsonb_array_elements(basis->'entries') loop
  if entry->>'kind'='observation' then adoptions:=adoptions||jsonb_build_object('id',entry->>'decisionId','assumptionVersionId',v.id,'fingerprint',v.content_fingerprint);
  else hypotheses:=hypotheses||jsonb_build_object('id',entry->>'decisionId','assumptionVersionId',v.id,'fingerprint',v.content_fingerprint);end if;
 end loop;
 -- Every source the basis rests on: adopted observations and contractual definitions. A source is
 -- pinned only with retained bytes verified by the worker, its rights revision and a live binding
 -- to this work; anything else is reported, never pinned.
 for src in
  with refs as (
   select o.source_version_id,o.source_rights_version_id as rights_version_id
   from jsonb_array_elements(basis->'entries') e
   join public.adoption_decisions a on a.organization_id=w.organization_id and a.id=(e.value->>'decisionId')::uuid
   join public.observations o on o.organization_id=a.organization_id and o.id=a.reference_observation_id
   where o.source_version_id is not null
   union
   select d.contract_source_version_id,d.contract_rights_version_id
   from jsonb_array_elements(basis->'entries') e
   join public.adoption_decisions a on a.organization_id=w.organization_id and a.id=(e.value->>'decisionId')::uuid
   join public.definition_versions d on d.organization_id=a.organization_id and d.id=a.definition_version_id
   where d.contract_source_version_id is not null)
  select distinct source_version_id,rights_version_id from refs
 loop
  rights_rev:=null;res:=null;hash:=null;
  select r.revision into rights_rev from private.source_rights_versions r where r.organization_id=w.organization_id and r.id=src.rights_version_id and r.source_version_id=src.source_version_id;
  select x.observed_sha256 into hash from private.source_version_verifications x where x.organization_id=w.organization_id and x.source_version_id=src.source_version_id order by x.created_at desc limit 1;
  select sb.resource_id into res from public.source_bindings sb join private.access_resources ar on ar.organization_id=sb.organization_id and ar.id=sb.resource_id
   where sb.organization_id=w.organization_id and sb.source_version_id=src.source_version_id and sb.revoked_at is null and (ar.id=w.id or ar.parent_resource_id=w.id)
   order by (ar.id=w.id) desc limit 1;
  if rights_rev is null then unverified:=unverified||jsonb_build_object('sourceVersionId',src.source_version_id,'reason','rights_missing');
  elsif hash is null or not private.execution_source_bytes_verified_v1(w.organization_id,src.source_version_id,hash) then unverified:=unverified||jsonb_build_object('sourceVersionId',src.source_version_id,'reason','bytes_unverified');
  elsif res is null then unverified:=unverified||jsonb_build_object('sourceVersionId',src.source_version_id,'reason','binding_missing');
  else sources:=sources||jsonb_build_object('resourceId',res,'sourceVersionId',src.source_version_id,'contentHash',hash,'rightsRevision',rights_rev::text);end if;
 end loop;
 return jsonb_build_object('schemaVersion','execution-contract-basis.v1','organizationId',w.organization_id,'workId',w.id,'principalId',human.id,
  'authorityRevision',rev::text,'policyFingerprint',policy_hash,'purpose',s.purpose,'contextKey',s.context_key,'versionId',v.id,
  'envelope',jsonb_build_object('canonical',v.canonical_snapshot,'fingerprint',v.content_fingerprint),
  'adoptions',adoptions,'hypotheses',hypotheses,'sources',sources,'unverifiedSources',unverified,
  'profile',jsonb_build_object('id',p.id,'platformReleaseId',p.platform_release_id,'method',p.payload->'method','tools',p.payload->'tools',
   'allowedEffects',p.payload->'allowedEffects','limits',p.payload->'limits','fingerprint',p.payload->>'fingerprint'));
end $function$
