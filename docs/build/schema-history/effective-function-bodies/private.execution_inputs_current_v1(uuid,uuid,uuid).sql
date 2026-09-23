CREATE OR REPLACE FUNCTION private.execution_inputs_current_v1(p_org uuid, p_execution uuid, p_subject uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from private.execution_manifests m join private.execution_input_snapshots s on s.organization_id=m.organization_id and s.execution_id=m.execution_id where m.organization_id=p_org and m.execution_id=p_execution and private.execution_capital_payload_current_v1(m.payload,s.payload,p_subject))
 and not exists(
  select 1 from private.execution_source_bindings b
  join private.source_rights_versions r on r.organization_id=b.organization_id and r.id=b.rights_version_id
  where b.organization_id=p_org and b.execution_id=p_execution and not(
   private.execution_source_bytes_verified_v1(p_org,b.source_version_id,b.content_hash) and r.operations @> array['read','process','store','derive'] and 'analysis'=any(r.purposes) and r.valid_from<=clock_timestamp()
   and (r.expires_at is null or r.expires_at>clock_timestamp()) and (r.store_until is null or r.store_until>clock_timestamp())
   and private.source_use_allowed_v1(p_org,b.source_version_id,p_subject,'read','analysis') and private.source_use_allowed_v1(p_org,b.source_version_id,p_subject,'process','analysis')
   and private.source_use_allowed_v1(p_org,b.source_version_id,p_subject,'store','analysis')
   and private.source_use_allowed_v1(p_org,b.source_version_id,p_subject,'derive','analysis')
   and private.evaluate_resource_policy_v1(p_org,b.resource_id,p_subject,'read','analysis')
   and exists(select 1 from public.source_bindings s where s.organization_id=p_org and s.source_version_id=b.source_version_id and s.resource_id=b.resource_id and s.revoked_at is null)))
 and not exists(select 1 from private.execution_basis_bindings b
  join public.assumption_versions v on v.organization_id=b.organization_id and v.id=b.assumption_version_id
  join public.assumption_sets s on s.organization_id=v.organization_id and s.id=v.set_id
  where b.organization_id=p_org and b.execution_id=p_execution and not(
   v.content_fingerprint=b.content_fingerprint and s.work_id is not null
   and private.execution_basis_current_v1(p_org,b.decision_id,p_subject)
   and private.evaluate_resource_policy_v1(p_org,s.work_id,p_subject,'read','analysis')));
$function$
