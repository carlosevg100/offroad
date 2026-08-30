-- A project may only say that it is processing while its current run is actually active.
-- Terminal runs used to leave the intake session stuck on `processing` when an operator
-- cancelled a cost review directly. The UI then promised background work that did not exist.

create or replace function private.sync_intake_session_after_processing_run_terminal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.document_intake_sessions session
  set status = 'failed',
      processing_completed_at = coalesce(session.processing_completed_at, new.completed_at, now()),
      result_summary = coalesce(session.result_summary, '{}'::jsonb) || jsonb_build_object(
        'error', case new.status
          when 'cancelled' then 'processing_cancelled'
          else 'processing_failed'
        end,
        'processing_run_id', new.id
      )
  where session.organization_id = new.organization_id
    and session.id = new.intake_session_id
    and session.current_run_id = new.id
    and session.status = 'processing';

  return new;
end;
$$;

revoke all on function private.sync_intake_session_after_processing_run_terminal()
  from public, anon, authenticated;

create trigger processing_runs_sync_terminal_intake_session
  after update of status on public.processing_runs
  for each row
  when (
    old.status is distinct from new.status
    and new.status in ('failed', 'cancelled')
  )
  execute function private.sync_intake_session_after_processing_run_terminal();

-- Repair projects already stranded by a terminal current run. Superseded historical runs do
-- not qualify because the session must point to this exact run through `current_run_id`.
update public.document_intake_sessions session
set status = 'failed',
    processing_completed_at = coalesce(session.processing_completed_at, run.completed_at, now()),
    result_summary = coalesce(session.result_summary, '{}'::jsonb) || jsonb_build_object(
      'error', case run.status
        when 'cancelled' then 'processing_cancelled'
        else 'processing_failed'
      end,
      'processing_run_id', run.id
    )
from public.processing_runs run
where session.organization_id = run.organization_id
  and session.current_run_id = run.id
  and session.id = run.intake_session_id
  and session.status = 'processing'
  and run.status in ('failed', 'cancelled');

