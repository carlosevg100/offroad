-- A complete R01 draft changes the case input and must trigger one bounded reanalysis. The
-- refresh is idempotent by immutable draft fingerprint and inherits the exact user's attribution.

create table private.receivables_method_refreshes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  capital_project_id uuid not null,
  intake_session_id uuid not null,
  supplement_draft_id uuid not null,
  draft_fingerprint text not null check (draft_fingerprint ~ '^[0-9a-f]{64}$'),
  compiled_supplement_fingerprint text not null check (compiled_supplement_fingerprint ~ '^[0-9a-f]{64}$'),
  caused_by_agent_job_id uuid not null,
  processing_run_id uuid not null,
  case_job_id uuid not null,
  created_at timestamptz not null default now(),
  unique (organization_id, intake_session_id, draft_fingerprint),
  foreign key (organization_id, capital_project_id)
    references public.capital_projects(organization_id, id) on delete cascade,
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions(organization_id, id) on delete cascade,
  foreign key (organization_id, supplement_draft_id)
    references private.receivables_method_supplement_drafts(organization_id, id) on delete restrict,
  foreign key (organization_id, caused_by_agent_job_id)
    references public.processing_jobs(organization_id, id) on delete restrict,
  foreign key (organization_id, processing_run_id)
    references public.processing_runs(organization_id, id) on delete restrict,
  foreign key (organization_id, case_job_id)
    references public.processing_jobs(organization_id, id) on delete restrict
);

revoke all privileges on private.receivables_method_refreshes from public, anon, authenticated;

create or replace function private.worker_enqueue_receivables_method_refresh_v1(
  p_job_id uuid,
  p_capability_token text,
  p_draft_fingerprint text,
  p_compiled_supplement_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  session_row public.document_intake_sessions;
  draft_row private.receivables_method_supplement_drafts;
  existing private.receivables_method_refreshes;
  source_message public.agent_messages;
  refresh_run_id uuid;
  refresh_job_id uuid;
  next_run_no integer;
  monthly_ceiling numeric;
  refresh_budget jsonb := jsonb_build_object(
    'max_cost_usd',1.5,'max_calls',8,
    'document_max_cost_usd',0.75,'document_max_calls',4,
    'case_max_cost_usd',1,'case_max_calls',4
  );
begin
  if job_row.kind <> 'agent_operation_brief'
    or coalesce(p_draft_fingerprint,'') !~ '^[0-9a-f]{64}$'
    or coalesce(p_compiled_supplement_fingerprint,'') !~ '^[0-9a-f]{64}$' then
    raise exception 'receivables_method_refresh_capability_invalid' using errcode = '42501';
  end if;
  select session.* into session_row
  from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id
    and session.id = job_row.intake_session_id
    and session.capital_project_id is not null
  for update;
  if not found or session_row.pipeline_version is null then
    raise exception 'receivables_method_refresh_session_invalid' using errcode = '55000';
  end if;

  select draft.* into draft_row
  from private.receivables_method_supplement_drafts draft
  where draft.organization_id = job_row.organization_id
    and draft.intake_session_id = job_row.intake_session_id
    and draft.draft_fingerprint = p_draft_fingerprint
    and not exists (
      select 1 from private.receivables_method_supplement_drafts newer
      where newer.organization_id = draft.organization_id
        and newer.intake_session_id = draft.intake_session_id
        and newer.revision > draft.revision
    );
  if not found then
    raise exception 'receivables_method_refresh_draft_not_current' using errcode = '40001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    job_row.organization_id::text || ':' || job_row.intake_session_id::text || ':' || p_draft_fingerprint, 0
  ));
  select refresh.* into existing
  from private.receivables_method_refreshes refresh
  where refresh.organization_id = job_row.organization_id
    and refresh.intake_session_id = job_row.intake_session_id
    and refresh.draft_fingerprint = p_draft_fingerprint;
  if found then
    if existing.compiled_supplement_fingerprint <> p_compiled_supplement_fingerprint then
      raise exception 'receivables_method_refresh_compilation_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'processing_run_id', existing.processing_run_id,
      'job_id', existing.case_job_id,
      'compiled_supplement_fingerprint', existing.compiled_supplement_fingerprint,
      'replayed', true
    );
  end if;

  select message.* into source_message
  from public.agent_messages message
  where message.organization_id = job_row.organization_id
    and message.id = nullif(job_row.payload ->> 'message_id','')::uuid
    and message.role = 'user';
  if not found then raise exception 'receivables_method_refresh_source_message_missing' using errcode = 'P0002'; end if;

  if session_row.status not in ('collecting', 'processing', 'review_ready', 'failed') then
    raise exception 'receivables_method_refresh_session_not_processable' using errcode = '22023';
  end if;
  select organization.model_monthly_ceiling_usd into monthly_ceiling
  from public.organizations organization where organization.id = job_row.organization_id;
  if monthly_ceiling is not null
    and private.month_spend_usd(job_row.organization_id) >= monthly_ceiling then
    raise exception 'model_month_ceiling_reached' using errcode = '53400';
  end if;

  -- This is an internal transition, not a tenant command. The leased job capability already
  -- binds organization, session and caller; impersonating the source user would weaken that
  -- boundary. Create only the reuse-only run here, then let the canonical case enqueue helper
  -- create its controlled execution and budgeted job.
  select coalesce(max(run.run_no), 0) + 1 into next_run_no
  from public.processing_runs run
  where run.organization_id = job_row.organization_id
    and run.intake_session_id = job_row.intake_session_id;

  insert into public.processing_runs (
    organization_id, intake_session_id, run_no, trigger, status, pipeline_version,
    budget, versions, created_by
  ) values (
    job_row.organization_id, job_row.intake_session_id, next_run_no, 'answer', 'queued',
    session_row.pipeline_version, refresh_budget,
    jsonb_build_object(
      'activatedBy', 'receivables_complete_draft_refresh_v1',
      'supplementDraftId', draft_row.id,
      'draftFingerprint', p_draft_fingerprint,
      'compiledSupplementFingerprint', p_compiled_supplement_fingerprint,
      'causedByAgentJobId', job_row.id
    ),
    source_message.created_by
  ) returning id into refresh_run_id;

  update public.document_intake_sessions session
  set status = 'processing', current_run_id = refresh_run_id,
      processing_started_at = now(), processing_completed_at = null,
      updated_at = now()
  where session.organization_id = job_row.organization_id
    and session.id = job_row.intake_session_id;

  refresh_job_id := private.enqueue_primary_case_analysis(
    job_row.organization_id, refresh_run_id, job_row.intake_session_id
  );
  if refresh_run_id is null or refresh_job_id is null
    or not exists (
      select 1 from public.processing_jobs queued
      where queued.organization_id = job_row.organization_id
        and queued.id = refresh_job_id and queued.kind = 'case_analysis'
    ) then
    raise exception 'receivables_method_refresh_case_job_not_created' using errcode = '55000';
  end if;

  insert into private.receivables_method_refreshes (
    organization_id, capital_project_id, intake_session_id, supplement_draft_id,
    draft_fingerprint, compiled_supplement_fingerprint, caused_by_agent_job_id,
    processing_run_id, case_job_id
  ) values (
    job_row.organization_id, session_row.capital_project_id, job_row.intake_session_id,
    draft_row.id, p_draft_fingerprint, p_compiled_supplement_fingerprint,
    job_row.id, refresh_run_id, refresh_job_id
  );
  return jsonb_build_object(
    'processing_run_id', refresh_run_id,
    'job_id', refresh_job_id,
    'compiled_supplement_fingerprint', p_compiled_supplement_fingerprint,
    'replayed', false
  );
exception when invalid_text_representation then
  raise exception 'receivables_method_refresh_contract_invalid' using errcode = '22023';
end;
$$;

create or replace function public.worker_enqueue_receivables_method_refresh_v1(
  p_job_id uuid, p_capability_token text, p_draft_fingerprint text,
  p_compiled_supplement_fingerprint text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_enqueue_receivables_method_refresh_v1(
    p_job_id, p_capability_token, p_draft_fingerprint, p_compiled_supplement_fingerprint
  );
$$;

revoke all on function private.worker_enqueue_receivables_method_refresh_v1(uuid,text,text,text) from public, anon;
revoke all on function public.worker_enqueue_receivables_method_refresh_v1(uuid,text,text,text) from public, anon;
grant execute on function private.worker_enqueue_receivables_method_refresh_v1(uuid,text,text,text) to authenticated;
grant execute on function public.worker_enqueue_receivables_method_refresh_v1(uuid,text,text,text) to authenticated;

comment on table private.receivables_method_refreshes is
  'Idempotent link from one complete immutable R01 draft to the bounded case run it triggered.';
