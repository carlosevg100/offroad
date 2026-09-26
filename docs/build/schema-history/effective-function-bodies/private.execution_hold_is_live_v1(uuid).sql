CREATE OR REPLACE FUNCTION private.execution_hold_is_live_v1(p_job_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.processing_jobs job
    where job.id = p_job_id
      and job.status = 'awaiting_approval'
      and private.requires_execution_brief_approval(job.id)
      and (
        -- Its dispatch is current: the person can approve it now.
        private.execution_dispatch_is_current(job.id, false)
        -- Its brief is being prepared.
        or exists (
          select 1
          from public.processing_jobs proposal
          where proposal.organization_id = job.organization_id
            and proposal.intake_session_id = job.intake_session_id
            and proposal.kind = 'execution_brief_proposal'
            and proposal.payload ->> 'approval_target_job_id' = job.id::text
            and proposal.status in ('queued', 'leased')
        )
        -- A conversation turn of its session, a brief edit included, may still bind a new brief to
        -- it: the condition under which the approval refuses with advisor_message_in_progress.
        or exists (
          select 1
          from public.agent_messages message
          where message.organization_id = job.organization_id
            and message.intake_session_id = job.intake_session_id
            and message.role = 'user'
            and message.status in ('queued', 'processing')
        )
      )
  );
$function$
