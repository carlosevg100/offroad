CREATE OR REPLACE FUNCTION private.worker_record_capital_project_execution_brief_v1(p_job_id uuid, p_capability_token text, p_internal_snapshot jsonb, p_visible_snapshot jsonb, p_parent_brief_id uuid DEFAULT NULL::uuid, p_change_summary jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);i private.execution_brief_write_intents;result jsonb;b public.capital_project_execution_briefs;p public.capital_project_plans;c private.execution_brief_input_captures;
begin
 select * into i from private.execution_brief_write_intents where organization_id=j.organization_id and producer_job_id=j.id and transaction_id=txid_current()
 and internal_fingerprint=encode(extensions.digest(p_internal_snapshot::text,'sha256'),'hex') and visible_fingerprint=encode(extensions.digest(p_visible_snapshot::text,'sha256'),'hex');
 if i.id is null then raise exception 'execution_brief_native_producer_required' using errcode='42501';end if;
 select * into strict c from private.execution_brief_input_captures where (organization_id,id)=(j.organization_id,i.capture_id);
 result:=private.write_execution_brief_before_native_capture_v1(j.id,p_capability_token,p_internal_snapshot,p_visible_snapshot,p_parent_brief_id,p_change_summary);
 if coalesce((result->>'replayed')::boolean,false) then raise exception 'execution_brief_new_capture_requires_new_product_revision' using errcode='40001';end if; -- Never attach a new precursor to an older product.
 select * into strict b from public.capital_project_execution_briefs where (organization_id,id)=(j.organization_id,(result->>'id')::uuid);
 select * into strict p from public.capital_project_plans where (organization_id,id)=(j.organization_id,b.plan_id);
 if b.capital_project_id<>c.work_id or b.internal_snapshot is distinct from p_internal_snapshot or b.visible_snapshot is distinct from p_visible_snapshot then raise exception 'execution_brief_native_output_mismatch' using errcode='23514';end if;
 insert into private.execution_brief_native_bindings(organization_id,work_id,capture_id,execution_brief_id,plan_id,brief_fingerprint,storage_fingerprint,plan_fingerprint,post_write_input_fingerprint,post_write_context_fingerprint)
 values(j.organization_id,c.work_id,c.id,b.id,p.id,b.brief_fingerprint,b.storage_fingerprint,p.plan_fingerprint,
 private.execution_approval_input_fingerprint(j.organization_id,c.session_id),
 private.execution_brief_post_write_context_fingerprint_v1(j.organization_id,c.session_id,c.work_id,p.id));
 if not private.execution_brief_capture_sources_current_v1(j.organization_id,c.id,c.human_subject_id) then raise exception 'execution_brief_capture_sources_changed' using errcode='42501';end if;
 return result||jsonb_build_object('captureId',c.id);
end $function$
