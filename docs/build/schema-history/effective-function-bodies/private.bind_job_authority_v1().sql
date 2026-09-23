CREATE OR REPLACE FUNCTION private.bind_job_authority_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare subject_id uuid := auth.uid(); root_id uuid; parent_subject uuid;
begin
 root_id := private.resource_root_v1(new.organization_id,case when new.kind in ('work_conversation','work_execution') then new.work_id else new.intake_session_id end);

 if new.kind='work_execution' then
  select p.user_id into subject_id from public.work_executions e
  join private.principals p on p.organization_id=e.organization_id and p.id=e.principal_id and p.kind='human' and p.revoked_at is null
  join public.processing_runs r on r.organization_id=e.organization_id and r.id=e.processing_run_id and r.created_by=p.user_id
  join private.execution_manifests m on m.organization_id=e.organization_id and m.execution_id=e.id
  where e.organization_id=new.organization_id and e.id=new.execution_id and e.work_id=new.work_id and e.processing_run_id=new.processing_run_id
  and r.work_id=e.work_id and r.pipeline_version='pinned-work-execution-v1'
  and m.payload->>'principalId'=p.id::text and m.payload->>'workId'=e.work_id::text;
  if subject_id is null then raise exception 'job_authorization_denied' using errcode='42501';end if;
 elsif new.kind='agent_operation_brief' and private.review_execution_authority_current_v1(nullif(new.payload->>'message_id','')::uuid,root_id,subject_id) then
 new.review_execution_authorization_id:=(new.payload->>'message_id')::uuid;
 elsif subject_id is null then
  select created_by into subject_id from public.processing_runs where organization_id=new.organization_id and id=new.processing_run_id;
 elsif not private.resource_access_as_subject_v1(new.organization_id,root_id,subject_id,'work') then
  -- Follow-up work inherits a currently leased parent or the parent just completed
  -- by this transaction. A completed job from an earlier transaction confers nothing.
  select j.authorization_subject_id into parent_subject from public.processing_jobs j
  where j.organization_id=new.organization_id and j.authorization_resource_id=root_id
  and exists(select 1 from public.processing_runs r where r.organization_id=new.organization_id and r.id=new.processing_run_id and r.created_by=j.authorization_subject_id)
  and j.leased_account_user_id=subject_id
  and ((j.status='leased' and j.lease_expires_at>now()) or (j.status='succeeded' and j.xmin=pg_current_xact_id()::xid))
  and private.job_authority_is_current_v1(j.id) order by j.created_at desc limit 1;
  subject_id:=parent_subject;
 end if;
 if new.review_execution_authorization_id is null and not private.resource_access_as_subject_v1(new.organization_id,root_id,subject_id,'work') then raise exception 'job_authorization_denied' using errcode='42501'; end if;
 insert into private.authorization_revisions(organization_id,resource_id,subject_user_id) values(new.organization_id,root_id,subject_id) on conflict do nothing;
 new.authorization_subject_id:=subject_id;
 new.authorization_resource_id:=root_id;
 select revision into new.authorization_revision from private.authorization_revisions
 where organization_id=new.organization_id and resource_id=root_id and subject_user_id=subject_id for share;
 return new;
end $function$
