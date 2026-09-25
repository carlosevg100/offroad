-- The outbox sweep (private.complete_event_outbox_v1) cancels every queued, leased or awaiting job of the
-- event's organization whose authority is not current. A governed evaluation binds no tenant subject or
-- resource: its authority is the registered evaluation organization and the live evaluator of its
-- identity row. private.job_authority_is_current_v1 knew only tenant bindings and answered false for every
-- evaluation job, so any domain event in an evaluation organization would have cancelled its evaluations
-- as if access had been revoked. Production never had an evaluation job; the defect never acted.
--
-- An evaluation job is now current exactly when the binding trigger would accept it again, and every
-- other job keeps the previous expression byte for byte: the sweep cancels an evaluation only once its
-- evaluator is no longer live. The legacy failure command refused evaluations only because their
-- authority was never current; it now refuses the kind itself, as job_for_capability already does.
set search_path='';

-- Both functions are restated from the bodies pinned here: a parallel change to either stops this
-- migration instead of being overwritten.
do $$begin
 if md5(pg_get_functiondef('private.job_authority_is_current_v1(uuid)'::regprocedure))<>'70f0bb8abb98b178456c607345a6f3c9'
 then raise exception 'job_authority_contract_changed';end if;
 if (select md5(prosrc) from pg_proc where oid='private.job_for_failure_capability(uuid,text)'::regprocedure)<>'7b4bb5d939d290e2d4b2b3104c65c2b1'
 then raise exception 'job_failure_capability_contract_changed';end if;
end $$;

-- Evaluation jobs: the conditions of private.bind_job_authority_v1 for the kind, read again. Every other
-- kind: the previous expression, unchanged.
create or replace function private.job_authority_is_current_v1(p_job_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from public.processing_jobs j where j.id=p_job_id and j.kind='governed_evaluation')
 then exists(select 1 from public.processing_jobs j
 join private.governed_evaluations e on e.organization_id=j.organization_id and e.id=j.evaluation_id and e.processing_run_id=j.processing_run_id
 join private.platform_evaluation_organizations o on o.organization_id=e.organization_id
 join public.processing_runs r on r.organization_id=e.organization_id and r.id=e.processing_run_id
 where j.id=p_job_id and j.work_id is null and j.intake_session_id is null
 and r.pipeline_version='governed-evaluation-v1' and r.created_by=e.requested_by_user_id
 and private.platform_evaluator_live_v1(e.requested_by_user_id))
 else exists(select 1 from public.processing_jobs j join private.authorization_revisions r
 on r.organization_id=j.organization_id and r.resource_id=j.authorization_resource_id and r.subject_user_id=j.authorization_subject_id
 where j.id=p_job_id and private.job_sources_rights_current_v1(j.id)
 and private.resource_access_as_subject_v1(j.organization_id,(case when j.kind in ('work_conversation','work_execution') then j.work_id else j.intake_session_id end),j.authorization_subject_id,'read')
 and not exists(select 1 from private.access_resources ar where ar.organization_id=j.organization_id and ar.id in(j.authorization_resource_id,(case when j.kind in ('work_conversation','work_execution') then j.work_id else j.intake_session_id end)) and not('analysis'=any(ar.allowed_purposes)))
 and not exists(select 1 from private.principals dp where dp.organization_id=j.organization_id and dp.processing_job_id=j.id and dp.revoked_at is not null)
 and (j.status<>'leased' or j.lease_expires_at<=now() or exists(select 1 from private.principals dp where dp.organization_id=j.organization_id and dp.processing_job_id=j.id and dp.kind='worker' and dp.account_user_id=j.leased_account_user_id and dp.worker_token_id=j.leased_by and dp.resource_id=j.authorization_resource_id and dp.expires_at>now())) and j.authorization_revision=r.revision
 and j.authorization_resource_id=private.resource_root_v1(j.organization_id,(case when j.kind in ('work_conversation','work_execution') then j.work_id else j.intake_session_id end))
 and (private.resource_access_as_subject_v1(j.organization_id,(case when j.kind in ('work_conversation','work_execution') then j.work_id else j.intake_session_id end),j.authorization_subject_id,'work') or (j.kind='agent_operation_brief' and j.review_execution_authorization_id::text=j.payload->>'message_id' and private.review_execution_authority_current_v1(j.review_execution_authorization_id,j.authorization_resource_id,j.authorization_subject_id))))
 end;
$$;

-- Restated from 20260915204116 as patched by 20260916163753. The only change is kind<>'governed_evaluation':
-- an evaluation lease ends through the evaluation commands, never through the legacy failure command.
create or replace function private.job_for_failure_capability(p_job_id uuid,p_capability_token text)
returns public.processing_jobs language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs;
begin
  if p_capability_token is null or char_length(p_capability_token)<32 then raise exception 'job_capability_invalid' using errcode='42501'; end if;
  select * into j from public.processing_jobs where id=p_job_id and kind<>'governed_evaluation' and status='leased'
    and capability_sha256=extensions.digest(p_capability_token,'sha256') and lease_expires_at>now() for update;
  if not found then raise exception 'job_capability_invalid' using errcode='42501'; end if;
  if auth.uid() is null or j.leased_account_user_id is distinct from auth.uid() or not exists(select 1 from private.worker_tokens wt where wt.id=j.leased_by and wt.revoked_at is null) or not exists(select 1 from auth.users wu where wu.id=auth.uid() and wu.deleted_at is null and (wu.banned_until is null or wu.banned_until<=now())) then raise exception 'job_capability_invalid' using errcode='42501'; end if; if not private.lock_job_authority_v1(j.id) then raise exception 'job_authorization_revoked' using errcode='42501'; end if;
  return j;
end;
$$;

-- create or replace keeps each function's owner and grants; nothing in this file grants or revokes.
