-- Stage 20 / 3G: private closure evaluation, no receipt or artifact publication.
set search_path='';
create function private.institutional_result_source_closure_v1(p_job uuid,p_capability text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 j public.processing_jobs; s private.institutional_input_snapshots; b private.institutional_result_input_bindings;
 r private.institutional_model_results; c private.institutional_model_configurations;
 config jsonb; lineage jsonb; pin jsonb; v public.source_versions; rights private.source_rights_versions;
 valid_until timestamptz; current_until timestamptz;
 pins jsonb:='[]'; configurations jsonb:='[]'; source jsonb; op text; reason text;
begin
 -- Accounts/token -> policy -> session/project/job; the existing gate also checks the live subject.
 j:=private.institutional_job_for_capture_v1(p_job,p_capability);
 select * into s from private.institutional_input_snapshots where organization_id=j.organization_id and job_id=j.id;
 select * into r from private.institutional_model_results where organization_id=j.organization_id and id=s.result_id for share nowait;
 select * into b from private.institutional_result_input_bindings where organization_id=j.organization_id and result_id=s.result_id;
 if s.id is null or r.id is null or b.id is null or b.snapshot_id is distinct from s.id
 or (r.capital_project_id,r.intake_session_id,r.id::text) is distinct from (s.work_id,s.intake_session_id,j.payload->>'message_id')
 or r.status is distinct from 'completed'
 or s.context_fingerprint is distinct from private.institutional_config_hash(s.context)
 or b.result_fingerprint is distinct from private.institutional_config_hash(jsonb_build_object('status','completed','artifact',r.artifact))
 or r.artifact->>'fingerprint' is distinct from private.institutional_config_hash(r.artifact-'fingerprint')
 then return jsonb_build_object('state','unresolved','reason','result_binding_mismatch');end if;
 if jsonb_typeof(s.context->'approvedConfigurations') is distinct from 'array'
 or jsonb_array_length(s.context->'approvedConfigurations') not between 1 and 12
 or jsonb_typeof(s.context->'currentSources') is distinct from 'array'
 then return jsonb_build_object('state','unresolved','reason','capture_shape');end if;
 if not exists(select 1 from jsonb_array_elements(s.context->'approvedConfigurations') x where x->>'id'=r.configuration_id::text and x->>'fingerprint'=r.configuration_fingerprint) then return jsonb_build_object('state','unresolved','reason','requested_configuration_missing');end if;
 -- Message changes must not invalidate a proved ancestor before a future atomic consumer commits.
 -- NOWAIT avoids reversing an editor's message -> policy lock order.
 perform m.id from public.agent_messages m join private.institutional_contribution_receipts cr
 on (cr.organization_id,cr.message_id)=(m.organization_id,m.id)
 where cr.organization_id=s.organization_id and cr.work_id=s.work_id order by m.id for share of m nowait;
 if (select count(distinct value->>'id') from jsonb_array_elements(s.context->'approvedConfigurations'))
 <>jsonb_array_length(s.context->'approvedConfigurations') then return jsonb_build_object('state','unresolved','reason','duplicate_configuration');end if;
 for config in select value from jsonb_array_elements(s.context->'approvedConfigurations') order by value->>'id' loop
  select * into c from private.institutional_model_configurations where organization_id=s.organization_id and id=(config->>'id')::uuid for share nowait;
  if c.id is null or c.capital_project_id is distinct from s.work_id
   or c.configuration is distinct from config->'configuration'
   or c.configuration_fingerprint is distinct from config->>'fingerprint'
   or c.revision::text is distinct from config->>'revision'
  then return jsonb_build_object('state','unresolved','reason','configuration_mismatch');end if;
  lineage:=private.institutional_configuration_ancestry_v1(s.organization_id,s.work_id,c.id);
  if lineage->>'state' is distinct from 'captured_lineage' then return jsonb_build_object('state','unresolved','reason','ancestry_unresolved');end if;
  pins:=pins||(lineage->'sources');
  configurations:=configurations||jsonb_build_array(jsonb_build_object('configurationId',c.id,'lineageFingerprint',private.institutional_config_hash(lineage)));
 end loop;
 -- Compare both sets; no missing or additional link may masquerade as full captured context.
 if exists(select 1 from jsonb_array_elements(s.context->'currentSources') x where not exists(
  select 1 from private.institutional_input_source_links l join public.source_versions sv on (sv.organization_id,sv.id)=(l.organization_id,l.source_version_id)
  where l.organization_id=s.organization_id and l.snapshot_id=s.id and sv.id::text=x->>'sourceDocument'
  and sv.legacy_document_version::text=x->>'version' and sv.declared_sha256=x->>'hash'))
 or exists(select 1 from private.institutional_input_source_links l where l.organization_id=s.organization_id and l.snapshot_id=s.id
  and not exists(select 1 from jsonb_array_elements(s.context->'currentSources') x where x->>'sourceDocument'=l.source_version_id::text))
 then return jsonb_build_object('state','unresolved','reason','calculation_source_mismatch');end if;
 select pins||coalesce(jsonb_agg(jsonb_build_object('sourceVersionId',l.source_version_id,'rightsVersionId',l.rights_version_id,'declaredSha256',sv.declared_sha256)),'[]') into pins
 from private.institutional_input_source_links l join public.source_versions sv on (sv.organization_id,sv.id)=(l.organization_id,l.source_version_id)
 where l.organization_id=s.organization_id and l.snapshot_id=s.id;
 select coalesce(jsonb_agg(value order by value->>'sourceVersionId',value->>'rightsVersionId'),'[]') into pins from (select distinct value from jsonb_array_elements(pins)) all_pins;
 -- DISTINCT includes rights ID: multiple fixed licenses for one version are all mandatory.
 for pin in select value from jsonb_array_elements(pins) loop
  select * into v from public.source_versions where organization_id=s.organization_id and id=(pin->>'sourceVersionId')::uuid;
  select * into rights from private.source_rights_versions where organization_id=s.organization_id and source_version_id=v.id and id=(pin->>'rightsVersionId')::uuid;
  if v.id is null or rights.id is null or v.declared_sha256 is distinct from pin->>'declaredSha256'
   then return jsonb_build_object('state','unresolved','reason','source_identity_mismatch');end if;
  if not (array['read','process','store','derive']::text[] <@ rights.operations) or not ('analysis'=any(rights.purposes))
   or rights.valid_from>clock_timestamp() or rights.expires_at<=clock_timestamp() or rights.store_until<=clock_timestamp()
   then return jsonb_build_object('state','denied','reason','fixed_rights');end if;
  valid_until:=least(valid_until,rights.expires_at,rights.store_until);
  foreach op in array array['read','process','store','derive'] loop
   if not private.source_use_allowed_v1(s.organization_id,v.id,j.authorization_subject_id,op,'analysis')
    then return jsonb_build_object('state','denied','reason','current_rights');end if;
  end loop;
 end loop;
 -- Track all current dependency deadlines as well as every historical fixed license.
 with recursive dependencies(id) as (
  select distinct (value->>'sourceVersionId')::uuid from jsonb_array_elements(pins)
  union select d.source_version_id from dependencies g join private.resource_dependencies d
   on d.organization_id=s.organization_id and d.derived_version_id=g.id
 ), all_rights as (
  select latest.expires_at,latest.store_until from dependencies g
   cross join lateral(select rr.expires_at,rr.store_until from private.source_rights_versions rr
    where rr.organization_id=s.organization_id and rr.source_version_id=g.id order by rr.revision desc limit 1) latest
  union all select rr.expires_at,rr.store_until from dependencies g
   join private.resource_dependencies d on d.organization_id=s.organization_id and d.derived_version_id=g.id
   join private.source_rights_versions rr on (rr.organization_id,rr.id)=(d.organization_id,d.source_rights_version_id)
 ) select min(least(expires_at,store_until)) into current_until from all_rights;
 -- Final current-authority check also covers ancestry-only sources, not just job inputs.
 for pin in select value from jsonb_array_elements(pins) loop
  foreach op in array array['read','process','store','derive'] loop
   if not private.source_use_allowed_v1(s.organization_id,(pin->>'sourceVersionId')::uuid,j.authorization_subject_id,op,'analysis')
    then return jsonb_build_object('state','denied','reason','current_rights');end if;
  end loop;
 end loop;
 -- A proof is scoped to this live execution subject and transaction, never a transferable grant.
 if j.lease_expires_at<=clock_timestamp() or not private.job_authority_is_current_v1(j.id)
 then return jsonb_build_object('state','denied','reason','execution_expired');end if;
 if least(valid_until,current_until)<=clock_timestamp() then return jsonb_build_object('state','denied','reason','rights_expired');end if;
 return jsonb_build_object('state','closed','authorization','current_execution_only','jobId',j.id,'subjectId',j.authorization_subject_id,
  'organizationId',s.organization_id,'workId',s.work_id,'resultId',r.id,'resultFingerprint',b.result_fingerprint,
  'snapshotId',s.id,'contextFingerprint',s.context_fingerprint,'configurations',configurations,'sources',pins);
exception when lock_not_available then raise exception 'institutional_capture_retry' using errcode='40001';
 when invalid_text_representation then return jsonb_build_object('state','unresolved','reason','malformed_identity');
end $$;
revoke all on function private.institutional_result_source_closure_v1(uuid,text) from public,anon,authenticated,service_role;
comment on function private.institutional_result_source_closure_v1(uuid,text) is 'Private complete source union and current execution authorization. No receipt, grant, approval or release. Future atomic consumer must re-evaluate immediately before persistence; elapsed time can expire rights despite held policy/message locks.';
