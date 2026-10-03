-- Load into the real HTTP SDK's connection, invoke with its actual freshly
-- allocated preview body BEFORE upload. No allocation/receipt is fabricated.
-- Execute as operator on the disposable stack only; caller passes identities
-- already checked by actual Auth SDK. Return contains fixed booleans/counts only.
create function pg_temp.prove_preview_storage_job_authority(p_job uuid,p_capability text,p_account uuid,p_allocation uuid)returns jsonb language plpgsql as $$
declare a private.capital_public_payload_allocations;headers jsonb;claims jsonb;old_headers text:=current_setting('request.headers',true);old_claims text:=current_setting('request.jwt.claims',true);other uuid;checks integer:=0;
begin
 select *into strict a from private.capital_public_payload_allocations where id=p_allocation and job_id=p_job and worker_account_id=p_account and content_kind='preview_body';
 headers:=jsonb_build_object('x-offroad-job-id',p_job,'x-offroad-capability',p_capability,'x-offroad-workspace',a.organization_id);
 claims:=jsonb_build_object('sub',p_account,'role','authenticated');
 perform set_config('request.jwt.claims',claims::text,true);perform set_config('request.headers',headers::text,true);
 if not private.capital_public_allocation_job_current_v1(a.id)or not private.capital_public_capture_clock_current_v1(p_job,p_capability)then raise exception 'preview_storage_actual_lease_invalid';end if;
 if private.capital_body_storage_job_authority_v1(a.id)then raise exception 'preview_storage_old_family_guard_changed';end if;
 if not private.capital_preview_storage_job_authority_v1(a.id)or not private.capital_preview_storage_allowed_v1(a.id,'upload')then raise exception 'preview_storage_actual_positive_denied';end if;
 checks:=checks+1;
 perform set_config('request.headers',(headers-'x-offroad-workspace')::text,true);
 if not private.capital_preview_storage_job_authority_v1(a.id)then raise exception 'preview_storage_optional_workspace_changed';end if;checks:=checks+1;
 perform set_config('request.headers',headers::text,true);
 perform set_config('request.headers',jsonb_set(headers,'{x-offroad-capability}',to_jsonb('forged'::text))::text,true);
 if private.capital_preview_storage_job_authority_v1(a.id)then raise exception 'preview_storage_forged_capability_allowed';end if;checks:=checks+1;
 perform set_config('request.headers',jsonb_set(headers,'{x-offroad-workspace}',to_jsonb(gen_random_uuid()::text))::text,true);
 if private.capital_preview_storage_job_authority_v1(a.id)then raise exception 'preview_storage_cross_organization_allowed';end if;checks:=checks+1;
 perform set_config('request.headers',jsonb_set(headers,'{x-offroad-job-id}',to_jsonb(gen_random_uuid()::text))::text,true);
 if private.capital_preview_storage_job_authority_v1(a.id)then raise exception 'preview_storage_wrong_job_allowed';end if;checks:=checks+1;
 perform set_config('request.headers',headers::text,true);perform set_config('request.jwt.claims',jsonb_set(claims,'{sub}',to_jsonb(gen_random_uuid()::text))::text,true);
 if private.capital_preview_storage_job_authority_v1(a.id)then raise exception 'preview_storage_wrong_account_allowed';end if;checks:=checks+1;
 perform set_config('request.jwt.claims',claims::text,true);
 select id into other from private.capital_public_payload_allocations where content_kind<>'preview_body'order by created_at limit 1;
 if other is null then raise exception 'preview_storage_other_family_fixture_required';end if;
 if private.capital_preview_storage_job_authority_v1(other)then raise exception 'preview_storage_other_family_allowed';end if;checks:=checks+1;
 begin
 update public.processing_jobs set lease_expires_at=clock_timestamp()-interval'1 second'where id=p_job;
 if private.capital_preview_storage_job_authority_v1(a.id)then raise exception 'preview_storage_expired_lease_allowed';end if;
 raise exception 'rollback expired fixture'using errcode='PZ001';
 exception when sqlstate 'PZ001'then null;end;checks:=checks+1;
 begin
 update private.worker_tokens set revoked_at=clock_timestamp()where id=a.worker_token_id;
 if private.capital_preview_storage_job_authority_v1(a.id)then raise exception 'preview_storage_revoked_worker_allowed';end if;
 raise exception 'rollback revoked fixture'using errcode='PZ001';
 exception when sqlstate 'PZ001'then null;end;checks:=checks+1;
 if not private.capital_preview_storage_job_authority_v1(a.id)then raise exception 'preview_storage_fixture_not_restored';end if;
 perform set_config('request.headers',coalesce(old_headers,''),true);perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 return jsonb_build_object('schemaVersion','capital-preview-storage-authority-proof.v1','beforeSharedAuthority',false,'actualLeaseAndAccount',true,'afterPreviewAuthority',true,'checksPassed',checks);
end;$$;
