-- Human account revocation participates in the common execution authority lock order.
create or replace function private.lock_execution_authority_v1(p_job uuid) returns public.processing_jobs
language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs;b private.execution_control_bindings;begin
 select * into j from public.processing_jobs where id=p_job and kind='work_execution';
 if not found then raise exception 'execution_authority_denied' using errcode='42501';end if;
 -- Serialize the persisted human subject with suspension/deletion, before policy and job locks.
 perform 1 from auth.users where id=j.authorization_subject_id and deleted_at is null
  and (banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'execution_authority_denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||j.organization_id::text,0));
 select * into strict b from private.execution_control_bindings where organization_id=j.organization_id and execution_id=j.execution_id;
 perform private.require_execution_release_v1(b.profile_id);
 -- The existing authority predicate also checks the persisted human/delegated principal.
 perform 1 from private.authorization_revisions where organization_id=j.organization_id and resource_id=j.authorization_resource_id and subject_user_id=j.authorization_subject_id for share;
 select * into strict j from public.processing_jobs where id=p_job for update;
 if not private.job_authority_is_current_v1(j.id) then raise exception 'execution_authority_denied' using errcode='42501';end if;
 if not exists(select 1 from public.work_executions e join public.processing_runs r on r.organization_id=e.organization_id and r.id=e.processing_run_id
 where e.id=j.execution_id and e.organization_id=j.organization_id and e.work_id=j.work_id and e.processing_run_id=j.processing_run_id
 and r.work_id=j.work_id and r.pipeline_version='pinned-work-execution-v1')
 then raise exception 'execution_run_mismatch' using errcode='42501';end if;
 return j;
end $$;
