CREATE OR REPLACE FUNCTION private.worker_prepare_capital_s11_context_v1(p_job_id uuid, p_capability_token text, p_recipe_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 r private.capital_s11_recipes;a private.capital_public_payload_allocations;b private.capital_s11_body_bases;
 c jsonb;p private.capital_public_retention_policies;fp text;bytes bigint;deadline timestamptz;stamp timestamptz:=clock_timestamp();
begin
 if not pg_try_advisory_xact_lock(hashtextextended('capital-s11-recipe:'||j.organization_id::text||':'||p_recipe_id::text,0)) then raise exception 'capital_s11_retry' using errcode='40001';end if;
 select * into r from private.capital_s11_recipes where organization_id=j.organization_id and job_id=j.id and id=p_recipe_id;
 if r.id is null or r.worker_account_id<>auth.uid() or r.human_subject_id<>j.authorization_subject_id or p_request_id is null then raise exception 'capital_s11_denied' using errcode='42501';end if;
 c:=private.worker_load_capital_project_context_v6(j.id,p_capability_token);
 fp:=encode(extensions.digest(c::text,'sha256'),'hex');bytes:=octet_length(c::text);
 if fp<>r.context_fingerprint or bytes not between 1 and 1048576 then raise exception 'capital_s11_context_changed' using errcode='40001';end if;
 select * into strict p from private.capital_public_retention_policies where id=r.retention_policy_id;
 deadline:=private.capital_s11_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id);
 if deadline is null or deadline-make_interval(secs=>p.purge_margin_seconds)<=stamp or not private.capital_public_retention_healthy_v1(j.leased_by,p.id) then raise exception 'capital_s11_retention_denied' using errcode='42501';end if;
 select * into a from private.capital_public_payload_allocations where organization_id=j.organization_id and job_id=j.id and request_id=p_request_id and content_kind='s11_body';
 if a.id is not null then
 select * into b from private.capital_s11_body_bases where organization_id=j.organization_id and id=a.s11_body_basis_id;
 if b.recipe_id<>r.id or b.kind<>'context' or a.payload_fingerprint<>fp or a.byte_length<>bytes then raise exception 'capital_s11_context_conflict' using errcode='23505';end if;
 if private.capital_s11_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id) is null then raise exception 'capital_s11_retention_denied' using errcode='42501';end if;
 else
 insert into private.capital_s11_body_bases(organization_id,work_id,recipe_id,kind) values(j.organization_id,r.work_id,r.id,'context') returning * into b;
 insert into private.capital_public_payload_allocations(id,organization_id,request_id,job_id,worker_token_id,worker_account_id,capability_sha256,policy_id,
 payload_fingerprint,byte_length,object_path,retained_at,expires_at,purge_at,upload_expires_at,s11_body_basis_id,content_kind)
 values(b.id,j.organization_id,p_request_id,j.id,j.leased_by,auth.uid(),j.capability_sha256,p.id,fp,bytes,j.organization_id::text||'/'||b.id::text||'/payload.json',stamp,deadline,
 deadline-make_interval(secs=>p.purge_margin_seconds),least(stamp+interval '5 minutes',deadline-make_interval(secs=>p.purge_margin_seconds)),b.id,'s11_body') returning * into a;
 insert into private.capital_public_payload_purge_queue(organization_id,allocation_id,next_check_at,effective_purge_at) values(j.organization_id,a.id,least(a.upload_expires_at,a.purge_at),a.purge_at);
 end if;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_s11_denied' using errcode='42501';end if;
 return private.capital_s11_body_dto_v1(j.organization_id,a.id,deadline,true)||jsonb_build_object('canonicalBody',c::text);
end; $function$
