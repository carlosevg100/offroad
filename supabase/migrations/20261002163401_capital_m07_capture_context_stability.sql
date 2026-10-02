-- Prospective metadata capsule for native M07. Produced task artifacts are
-- outputs of the job, not additions to the input already retained by begin().
-- Existing snapshots remain immutable; changing the capsule basis fails closed.
set search_path='';
alter function private.capital_public_capture_context_v1(uuid,text) rename to capital_public_capture_context_before_native_m07_v1;
revoke all on function private.capital_public_capture_context_before_native_m07_v1(uuid,text) from public,anon,authenticated,service_role;
create function private.capital_public_capture_context_v1(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 r private.capital_m07_recipes;b private.capital_m07_body_bases;a private.capital_public_payload_allocations;
 physical private.capital_public_retained_payloads;deadline timestamptz;checked timestamptz;result jsonb;
begin
 select * into r from private.capital_m07_recipes where organization_id=j.organization_id and job_id=j.id;
 if r.id is null then
  return private.capital_public_capture_context_before_native_m07_v1(p_job_id,p_capability_token);
 end if;
 if j.payload->>'analysis_scope' is distinct from 'origination_thesis'
  or (r.work_id,r.plan_id,r.brief_id,r.session_id,r.human_subject_id,r.worker_account_id)
   is distinct from(coalesce(j.work_id,(j.payload->>'capital_project_id')::uuid),(j.payload->>'capital_project_plan_id')::uuid,
    (j.payload->>'capital_project_brief_id')::uuid,j.intake_session_id,j.authorization_subject_id,auth.uid())
 then raise exception 'capital_capture_denied' using errcode='42501';end if;
 -- No existence/status flag stands in for consumption. Resolve the context
 -- receipt actually committed from immutable canonical bytes under this recipe.
 select x.* into a from private.capital_m07_body_bases z
 join private.capital_public_payload_allocations x on(x.organization_id,x.m07_body_basis_id)=(z.organization_id,z.id)
 join private.capital_public_retained_payloads p on(p.organization_id,p.allocation_id)=(x.organization_id,x.id)
 where z.organization_id=j.organization_id and z.recipe_id=r.id and z.kind='context'
  and z.work_id=r.work_id and x.job_id=j.id and x.content_kind='m07_body'
 order by p.created_at,p.id limit 1;
 select * into b from private.capital_m07_body_bases where organization_id=j.organization_id and id=a.m07_body_basis_id;
 select * into physical from private.capital_public_retained_payloads where organization_id=j.organization_id and allocation_id=a.id;
 deadline:=private.capital_m07_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id);
 if a.id is null or b.id is null or physical.id is null
  or b.semantic_fingerprint is not null or a.payload_fingerprint is distinct from r.context_fingerprint
  or physical.verified_sha256 is distinct from r.context_fingerprint or physical.verified_size is distinct from a.byte_length
  or not private.capital_body_physical_receipt_v1(j.organization_id,physical.id)
  or deadline is null or least(deadline,a.purge_at,a.expires_at,r.expires_at)<=clock_timestamp()
 then raise exception 'capital_capture_denied' using errcode='42501';end if;
 perform private.require_capital_body_retention_ready_v1(a.policy_id,j.organization_id,a.id);
 result:=jsonb_build_object('schemaVersion','capital-m07-public-context-identity.v1','recipeId',r.id,'jobId',j.id,
  'workId',r.work_id,'planId',r.plan_id,'briefId',r.brief_id,'contextFingerprint',r.context_fingerprint,
  'planFingerprint',r.plan_fingerprint,'baseAuthorityFingerprint',r.base_authority_fingerprint,
  'retainedPayloadId',physical.id,'storageObjectId',physical.storage_object_id,'storageVersion',physical.storage_version,
  'verifiedSha256',physical.verified_sha256,'verifiedByteSize',physical.verified_size);
 -- Recheck after constructing the capsule. Metadata never contains the context
 -- body, and neither elapsed TTL nor revocation can escape via the fixed hash.
 checked:=private.capital_m07_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id);
 if checked is null or least(checked,a.purge_at,a.expires_at,r.expires_at)<=clock_timestamp()
  or not private.capital_body_physical_receipt_v1(j.organization_id,physical.id)
  or not private.capital_public_capture_clock_current_v1(j.id,p_capability_token)
 then raise exception 'capital_capture_denied' using errcode='42501';end if;
 if checked is distinct from deadline then raise exception 'capital_capture_retry' using errcode='40001';end if;
 return result;
end $$;
revoke all on function private.capital_public_capture_context_v1(uuid,text) from public,anon,authenticated,service_role;
