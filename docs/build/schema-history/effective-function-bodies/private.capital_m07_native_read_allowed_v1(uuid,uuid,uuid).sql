CREATE OR REPLACE FUNCTION private.capital_m07_native_read_allowed_v1(p_org uuid, p_revision uuid, p_actor uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b private.capital_m07_native_bindings;a private.capital_public_payload_allocations;d timestamptz;r public.artifact_revisions;
begin
 select * into b from private.capital_m07_native_bindings where organization_id=p_org and revision_id=p_revision;
 if b.id is null then return true;end if;
 if not private.capital_body_subject_allowed_v1(p_org,b.work_id,p_actor) then return false;end if;
 select * into r from public.artifact_revisions where organization_id=p_org and id=p_revision;
 select x.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=p_org and q.id=b.final_retained_payload_id;
 d:=private.capital_m07_allocation_deadline_v1(p_org,a.id,p_actor);
 if r.id is null or a.id is null or d is null or not exists(select 1 from public.capital_project_artifacts c where c.organization_id=p_org and c.id=b.capital_artifact_id )
 or r.content_sha256 is distinct from a.payload_fingerprint or r.byte_length is distinct from a.byte_length
 or not private.capital_body_physical_receipt_v1(p_org,b.final_retained_payload_id)
 or not private.capital_body_physical_receipt_v1(p_org,b.parsed_retained_payload_id)
 or not private.capital_body_retention_healthy_v1(a.policy_id,p_org,a.id) then return false;end if;
 return least(d,a.purge_at)>clock_timestamp();
end; $function$
