-- Separate the first, corrigible understanding of the company and requested operation from the
-- later diagnostic understanding that supports structuring. Confirming this object only unlocks
-- the tailored information request; it never opens the structuring DAG.

alter table public.processing_jobs drop constraint processing_jobs_kind_check;
alter table public.processing_jobs add constraint processing_jobs_kind_check
  check (kind in ('document_pipeline', 'preliminary_analysis', 'case_analysis', 'agent_operation_brief'));

create table public.preliminary_understandings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  intake_session_id uuid not null,
  processing_run_id uuid not null,
  object_version integer not null check (object_version > 0),
  status text not null check (status in (
    'pending_confirmation', 'confirmed', 'changes_requested', 'superseded'
  )),
  input_fingerprint text not null check (input_fingerprint ~ '^[a-f0-9]{64}$'),
  object_fingerprint text not null check (object_fingerprint ~ '^[a-f0-9]{64}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  correction text check (correction is null or char_length(trim(correction)) between 3 and 4000),
  decided_by uuid references auth.users(id) on delete restrict,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, intake_session_id, object_version),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions(organization_id, id) on delete cascade,
  foreign key (organization_id, processing_run_id)
    references public.processing_runs(organization_id, id) on delete cascade,
  check (
    (status = 'pending_confirmation' and decided_by is null and decided_at is null and correction is null)
    -- A correction is a real, auditable decision even after a later version supersedes it.
    -- Superseding that row must not erase who requested the correction or why.
    or status = 'superseded'
    or (status in ('confirmed', 'changes_requested') and decided_by is not null and decided_at is not null)
  )
);

create index preliminary_understandings_current_idx
  on public.preliminary_understandings (
    organization_id, intake_session_id, object_version desc
  ) where status <> 'superseded';

create index preliminary_understandings_processing_run_idx
  on public.preliminary_understandings (organization_id, processing_run_id);

create index preliminary_understandings_decided_by_idx
  on public.preliminary_understandings (decided_by)
  where decided_by is not null;

alter table public.preliminary_understandings enable row level security;
alter table public.preliminary_understandings force row level security;

create policy preliminary_understandings_select
  on public.preliminary_understandings for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));

revoke all privileges on public.preliminary_understandings from anon, authenticated;
grant select on public.preliminary_understandings to authenticated;

create trigger preliminary_understandings_set_updated_at
  before update on public.preliminary_understandings
  for each row execute function private.set_updated_at();

create trigger preliminary_understandings_audit
  after insert or update or delete on public.preliminary_understandings
  for each row execute function private.capture_audit_event();

create or replace function private.invalidate_preliminary_understanding_on_input_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.company_profile is distinct from new.company_profile
    or old.archetype is distinct from new.archetype
    or old.capital_objective is distinct from new.capital_objective
    or old.requested_amount is distinct from new.requested_amount
    or old.capital_currency is distinct from new.capital_currency
    or old.capital_urgency is distinct from new.capital_urgency
    or old.requested_term_months is distinct from new.requested_term_months
    or old.requested_grace_months is distinct from new.requested_grace_months
    or old.capital_consequence is distinct from new.capital_consequence
    or old.sector is distinct from new.sector
    or old.geography is distinct from new.geography
    or old.instruments is distinct from new.instruments
    or old.collateral_kinds is distinct from new.collateral_kinds then
    update public.preliminary_understandings understanding
    set status = 'superseded'
    where understanding.organization_id = new.organization_id
      and understanding.intake_session_id = new.id
      and understanding.status in ('pending_confirmation', 'confirmed', 'changes_requested');
  end if;
  return new;
end;
$$;

create trigger document_intake_sessions_invalidate_preliminary_understanding
  after update of company_profile, archetype, capital_objective, requested_amount,
    capital_currency, capital_urgency, requested_term_months, requested_grace_months,
    capital_consequence, sector, geography, instruments, collateral_kinds
  on public.document_intake_sessions
  for each row execute function private.invalidate_preliminary_understanding_on_input_change();

revoke all on function private.invalidate_preliminary_understanding_on_input_change()
  from public, anon, authenticated;

-- A preliminary document added, replaced or removed before confirmation changes the evidence
-- behind the first read. Requested-document uploads after confirmation belong to the later
-- diagnostic loop and therefore do not invalidate the accepted orientation object.
create or replace function private.invalidate_pending_preliminary_on_source_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
  target_session_id uuid;
begin
  if tg_op = 'DELETE' then
    target_organization_id := old.organization_id;
    target_session_id := old.intake_session_id;
  else
    target_organization_id := new.organization_id;
    target_session_id := new.intake_session_id;
  end if;

  if target_session_id is not null then
    update public.preliminary_understandings understanding
    set status = 'superseded'
    where understanding.organization_id = target_organization_id
      and understanding.intake_session_id = target_session_id
      and understanding.status in ('pending_confirmation', 'changes_requested');
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger source_documents_insert_invalidate_pending_preliminary
  after insert on public.source_documents
  for each row execute function private.invalidate_pending_preliminary_on_source_change();

create trigger source_documents_update_invalidate_pending_preliminary
  after update of object_path, original_name, byte_size, sha256, document_version,
    processing_status on public.source_documents
  for each row execute function private.invalidate_pending_preliminary_on_source_change();

create trigger source_documents_delete_invalidate_pending_preliminary
  after delete on public.source_documents
  for each row execute function private.invalidate_pending_preliminary_on_source_change();

revoke all on function private.invalidate_pending_preliminary_on_source_change()
  from public, anon, authenticated;

create or replace function private.worker_record_preliminary_understanding(
  p_job_id uuid,
  p_capability_token text,
  p_input_fingerprint text,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  next_version integer;
  object_id uuid;
  object_fingerprint text;
  latest_status text;
begin
  if job_row.kind <> 'preliminary_analysis'
    or job_row.payload ->> 'analysis_scope' <> 'preliminary_understanding' then
    raise exception 'preliminary_analysis_capability_required' using errcode = '42501';
  end if;
  if p_input_fingerprint !~ '^[a-f0-9]{64}$'
    or coalesce(jsonb_typeof(p_payload), 'null') <> 'object'
    or p_payload ->> 'schemaVersion' <> '2026.08.31-v1'
    or p_payload ->> 'caseId' <> job_row.intake_session_id::text then
    raise exception 'invalid_preliminary_understanding' using errcode = '22023';
  end if;

  perform 1
  from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id
    and session.id = job_row.intake_session_id
  for update;
  if not found then raise exception 'intake_session_not_found' using errcode = 'P0002'; end if;

  select understanding.status into latest_status
  from public.preliminary_understandings understanding
  where understanding.organization_id = job_row.organization_id
    and understanding.intake_session_id = job_row.intake_session_id
  order by understanding.object_version desc
  limit 1;

  -- A later deep-analysis run must not replace the exact preliminary understanding the user
  -- already confirmed. Corrections, however, explicitly ask the worker to publish a new version.
  if latest_status = 'confirmed' then
    select understanding.id into object_id
    from public.preliminary_understandings understanding
    where understanding.organization_id = job_row.organization_id
      and understanding.intake_session_id = job_row.intake_session_id
    order by understanding.object_version desc
    limit 1;
    return object_id;
  end if;

  select coalesce(max(understanding.object_version), 0) + 1 into next_version
  from public.preliminary_understandings understanding
  where understanding.organization_id = job_row.organization_id
    and understanding.intake_session_id = job_row.intake_session_id;

  object_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'organizationId', job_row.organization_id,
    'intakeSessionId', job_row.intake_session_id,
    'objectVersion', next_version,
    'inputFingerprint', p_input_fingerprint,
    'payload', p_payload
  )::text, 'utf8'), 'sha256'), 'hex');

  update public.preliminary_understandings understanding
  set status = 'superseded'
  where understanding.organization_id = job_row.organization_id
    and understanding.intake_session_id = job_row.intake_session_id
    and understanding.status in ('pending_confirmation', 'changes_requested');

  insert into public.preliminary_understandings (
    organization_id, intake_session_id, processing_run_id, object_version, status,
    input_fingerprint, object_fingerprint, payload
  ) values (
    job_row.organization_id, job_row.intake_session_id, job_row.processing_run_id,
    next_version, 'pending_confirmation', p_input_fingerprint, object_fingerprint, p_payload
  ) returning id into object_id;

  return object_id;
end;
$$;

create or replace function public.worker_record_preliminary_understanding(
  p_job_id uuid,
  p_capability_token text,
  p_input_fingerprint text,
  p_payload jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.worker_record_preliminary_understanding(
    p_job_id, p_capability_token, p_input_fingerprint, p_payload
  );
$$;

revoke all on function private.worker_record_preliminary_understanding(uuid, text, text, jsonb)
  from public, anon;
revoke all on function public.worker_record_preliminary_understanding(uuid, text, text, jsonb)
  from public, anon;
grant execute on function private.worker_record_preliminary_understanding(uuid, text, text, jsonb)
  to authenticated;
grant execute on function public.worker_record_preliminary_understanding(uuid, text, text, jsonb)
  to authenticated;

create or replace function private.decide_preliminary_understanding(
  p_organization_id uuid,
  p_session_id uuid,
  p_object_fingerprint text,
  p_decision text,
  p_correction text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  current_object public.preliminary_understandings;
  correction_value text := nullif(trim(coalesce(p_correction, '')), '');
begin
  if actor_id is null
    or not (select private.can_access_intake_session(p_organization_id, p_session_id)) then
    raise exception 'preliminary_understanding_access_denied' using errcode = '42501';
  end if;
  if p_decision not in ('confirmed', 'changes_requested')
    or p_object_fingerprint !~ '^[a-f0-9]{64}$'
    or (p_decision = 'changes_requested' and (
      correction_value is null or char_length(correction_value) not between 3 and 4000
    )) then
    raise exception 'invalid_preliminary_understanding_decision' using errcode = '22023';
  end if;

  select understanding.* into current_object
  from public.preliminary_understandings understanding
  where understanding.organization_id = p_organization_id
    and understanding.intake_session_id = p_session_id
  order by understanding.object_version desc
  limit 1
  for update;

  if not found
    or current_object.status <> 'pending_confirmation'
    or current_object.object_fingerprint <> p_object_fingerprint then
    raise exception 'current_preliminary_understanding_required' using errcode = '55000';
  end if;

  update public.preliminary_understandings understanding
  set status = p_decision,
      correction = case when p_decision = 'changes_requested' then correction_value else null end,
      decided_by = actor_id,
      decided_at = now()
  where understanding.id = current_object.id;

  -- The first processing run left the session in review_ready. Confirmation opens only the next
  -- evidence-collection loop; it does not confirm the case or any diagnostic/structuring object.
  update public.document_intake_sessions session
  set status = 'collecting'
  where session.organization_id = p_organization_id
    and session.id = p_session_id
    and session.status = 'review_ready';

  return current_object.id;
end;
$$;

create or replace function public.decide_preliminary_understanding(
  p_organization_id uuid,
  p_session_id uuid,
  p_object_fingerprint text,
  p_decision text,
  p_correction text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.decide_preliminary_understanding(
    p_organization_id, p_session_id, p_object_fingerprint, p_decision, p_correction
  );
$$;

revoke all on function private.decide_preliminary_understanding(uuid, uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.decide_preliminary_understanding(uuid, uuid, text, text, text)
  from public, anon;
grant execute on function private.decide_preliminary_understanding(uuid, uuid, text, text, text)
  to authenticated;
grant execute on function public.decide_preliminary_understanding(uuid, uuid, text, text, text)
  to authenticated;

-- Creating the formal opportunity is not the next button after extraction. It is the terminal
-- action of the diagnostic loop. Require (a) the confirmed, corrigible first understanding and
-- (b) a ready case snapshot published by the case worker. `result_summary` alone is insufficient:
-- older clients can write narrow analysis patches, whereas a worker-created Deal State object
-- cannot be forged through the tenant API.
-- Preserve the previously shipped atomic projection as a private base command. The governed
-- command keeps the canonical private/public name pair used by the privilege-parity audit.
alter function private.confirm_document_intake(uuid, uuid, text)
  rename to confirm_document_intake_base;

create or replace function private.confirm_document_intake(
  p_organization_id uuid,
  p_session_id uuid,
  p_output_locale text default 'pt-BR'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.document_intake_sessions;
  case_input_fingerprint text;
  diagnostic_snapshot public.deal_state_objects;
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null
    or not (select private.can_access_intake_session(p_organization_id, p_session_id)) then
    raise exception 'intake_session_access_denied' using errcode = '42501';
  end if;

  select session.* into session_row
  from public.document_intake_sessions session
  where session.organization_id = p_organization_id
    and session.id = p_session_id
  for update;
  if not found then raise exception 'intake_session_not_found' using errcode = 'P0002'; end if;

  -- Preserve the original command's exact idempotency after a successful confirmation.
  if session_row.status = 'confirmed' and session_row.opportunity_id is not null then
    return private.confirm_document_intake_base(p_organization_id, p_session_id, p_output_locale);
  end if;

  if not exists (
    select 1
    from public.preliminary_understandings understanding
    where understanding.organization_id = p_organization_id
      and understanding.intake_session_id = p_session_id
      and understanding.status = 'confirmed'
  ) then
    raise exception 'preliminary_understanding_not_confirmed' using errcode = '55000';
  end if;

  if coalesce(session_row.result_summary #>> '{case_state,readiness,state}', '') <> 'ready' then
    raise exception 'diagnostic_case_not_ready' using errcode = '55000';
  end if;
  case_input_fingerprint := session_row.result_summary #>> '{case_manifest,input_fingerprint}';
  select understanding.* into diagnostic_snapshot
    from public.deal_state_objects understanding
    where understanding.organization_id = p_organization_id
      and understanding.intake_session_id = p_session_id
      and understanding.object_type = 'understanding_snapshot'
      and understanding.status = 'pending_confirmation'
      and understanding.created_by_kind = 'worker'
      and understanding.input_fingerprint = case_input_fingerprint
      and understanding.payload #>> '{readiness,state}' = 'ready'
    order by understanding.object_version desc
    limit 1
    for update;
  if case_input_fingerprint !~ '^[a-f0-9]{64}$' or not found then
    raise exception 'governed_diagnostic_snapshot_required' using errcode = '55000';
  end if;

  -- The review checkbox approves one exact diagnostic case. Countersign that worker snapshot
  -- in the same transaction that creates the opportunity. If either operation fails, neither
  -- survives; an opportunity can never exist without the case the company actually approved.
  perform private.record_deal_state_object(
    p_organization_id,
    p_session_id,
    'understanding_snapshot',
    'confirmed',
    diagnostic_snapshot.input_fingerprint,
    diagnostic_snapshot.payload || jsonb_build_object('confirmation', jsonb_build_object(
      'actorId', actor_id,
      'confirmedAt', now(),
      'scope', 'approved_diagnostic_case_for_structuring'
    )),
    '[]'::jsonb
  );

  return private.confirm_document_intake_base(p_organization_id, p_session_id, p_output_locale);
end;
$$;

create or replace function public.confirm_document_intake(
  p_organization_id uuid,
  p_session_id uuid,
  p_output_locale text default 'pt-BR'
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.confirm_document_intake(
    p_organization_id, p_session_id, p_output_locale
  );
$$;

revoke all on function private.confirm_document_intake_base(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function private.confirm_document_intake(uuid, uuid, text)
  from public, anon;
revoke all on function public.confirm_document_intake(uuid, uuid, text)
  from public, anon;
grant execute on function private.confirm_document_intake(uuid, uuid, text)
  to authenticated;
grant execute on function public.confirm_document_intake(uuid, uuid, text)
  to authenticated;

comment on table public.preliminary_understandings is
  'Corrigible company-and-operation understanding produced before the tailored evidence request. It is not a credit opinion or the diagnostic understanding gate.';

-- A user does not author a diagnostic understanding. The only permitted confirmation is an
-- exact countersignature of the current worker-produced snapshot: same governed input, same
-- payload, readiness already `ready`, with only the auditable confirmation envelope added.
-- Replacing the public wrapper is also important: the original wrapper called `append` directly
-- and therefore bypassed later validation added to `private.record_deal_state_object`.
create or replace function private.record_deal_state_object(
  p_organization_id uuid,
  p_session_id uuid,
  p_object_type text,
  p_status text,
  p_input_fingerprint text,
  p_payload jsonb,
  p_dependencies jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  existing_id uuid;
  pending_worker public.deal_state_objects;
begin
  if actor_id is null
    or not (select private.can_access_intake_session(p_organization_id, p_session_id)) then
    raise exception 'deal_state_access_denied' using errcode = '42501';
  end if;

  if not (
    (p_object_type = 'understanding_snapshot' and p_status = 'confirmed')
    or (p_object_type = 'structure_decision' and p_status in ('confirmed', 'changes_requested', 'declined'))
    or (p_object_type = 'production_plan' and p_status = 'approved')
    or (p_object_type = 'package_review' and p_status = 'approved')
    or (p_object_type = 'release_authorization' and p_status = 'approved')
  ) then
    raise exception 'user_deal_state_transition_denied' using errcode = '42501';
  end if;

  select state_object.id into existing_id
  from public.deal_state_objects state_object
  where state_object.organization_id = p_organization_id
    and state_object.intake_session_id = p_session_id
    and state_object.object_type = p_object_type
    and state_object.status = p_status
    and state_object.input_fingerprint = p_input_fingerprint
    and state_object.payload = p_payload
    and state_object.dependencies = p_dependencies
  order by state_object.object_version desc
  limit 1;
  if existing_id is not null then return existing_id; end if;

  if p_object_type = 'understanding_snapshot' then
    select state_object.* into pending_worker
    from public.deal_state_objects state_object
    where state_object.organization_id = p_organization_id
      and state_object.intake_session_id = p_session_id
      and state_object.object_type = 'understanding_snapshot'
      and state_object.status = 'pending_confirmation'
      and state_object.created_by_kind = 'worker'
    order by state_object.object_version desc
    limit 1
    for update;

    if not found
      or pending_worker.input_fingerprint <> p_input_fingerprint
      or pending_worker.payload #>> '{readiness,state}' <> 'ready'
      or p_dependencies <> '[]'::jsonb
      or (p_payload - 'confirmation') <> pending_worker.payload
      or p_payload #>> '{confirmation,actorId}' <> actor_id::text then
      raise exception 'current_worker_diagnostic_snapshot_required' using errcode = '55000';
    end if;
  end if;

  return private.append_deal_state_object(
    p_organization_id, p_session_id, p_object_type, p_status,
    p_input_fingerprint, p_payload, p_dependencies, actor_id, 'user'
  );
end;
$$;

create or replace function public.record_deal_state_object(
  p_organization_id uuid,
  p_session_id uuid,
  p_object_type text,
  p_status text,
  p_input_fingerprint text,
  p_payload jsonb,
  p_dependencies jsonb default '[]'::jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.record_deal_state_object(
    p_organization_id, p_session_id, p_object_type, p_status,
    p_input_fingerprint, p_payload, p_dependencies
  );
$$;

revoke all on function private.record_deal_state_object(uuid, uuid, text, text, text, jsonb, jsonb)
  from public, anon;
revoke all on function public.record_deal_state_object(uuid, uuid, text, text, text, jsonb, jsonb)
  from public, anon;
grant execute on function private.record_deal_state_object(uuid, uuid, text, text, text, jsonb, jsonb)
  to authenticated;
grant execute on function public.record_deal_state_object(uuid, uuid, text, text, text, jsonb, jsonb)
  to authenticated;

-- The same durable queue serves two deliberately different computations. Before the first
-- understanding is confirmed, the terminal job is a narrow, one-call preliminary read. Once
-- confirmed, subsequent evidence runs enqueue the full case DAG. A separate job kind ensures
-- every RPC reserved for `case_analysis` rejects the preliminary capability by construction.
create or replace function private.enqueue_primary_case_analysis(
  p_organization_id uuid,
  p_processing_run_id uuid,
  p_intake_session_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_row public.processing_runs;
  session_locale text;
  execution_id uuid;
  case_job_id uuid;
  preliminary_required boolean;
begin
  select run.* into run_row
  from public.processing_runs run
  where run.organization_id = p_organization_id
    and run.id = p_processing_run_id
    and run.intake_session_id = p_intake_session_id
  for update;

  if not found or run_row.status in ('cancelled', 'failed', 'partial') then return null; end if;

  select session.locale into session_locale
  from public.document_intake_sessions session
  where session.organization_id = p_organization_id
    and session.id = p_intake_session_id
    and session.current_run_id = p_processing_run_id
    and session.status = 'processing';
  if not found then return null; end if;

  if exists (
    select 1 from public.processing_jobs document_job
    where document_job.organization_id = p_organization_id
      and document_job.processing_run_id = p_processing_run_id
      and document_job.kind = 'document_pipeline'
      and document_job.status <> 'succeeded'
  ) then return null; end if;

  if not exists (
    select 1 from public.processing_jobs document_job
    where document_job.organization_id = p_organization_id
      and document_job.processing_run_id = p_processing_run_id
      and document_job.kind = 'document_pipeline'
  ) and exists (
    select 1 from public.source_documents source
    where source.organization_id = p_organization_id
      and source.intake_session_id = p_intake_session_id
      and source.processing_status <> 'ready'
  ) then return null; end if;

  preliminary_required := not exists (
    select 1
    from public.preliminary_understandings understanding
    where understanding.organization_id = p_organization_id
      and understanding.intake_session_id = p_intake_session_id
      and understanding.status = 'confirmed'
  );

  if preliminary_required then
    insert into public.processing_jobs (
      organization_id, processing_run_id, intake_session_id, kind, payload, max_attempts
    ) values (
      p_organization_id,
      p_processing_run_id,
      p_intake_session_id,
      'preliminary_analysis',
      jsonb_build_object(
        'locale', session_locale,
        'execution_mode', 'primary',
        'analysis_scope', 'preliminary_understanding',
        'model_budget', jsonb_build_object('max_cost_usd', 0.60, 'max_calls', 1)
      ),
      2
    ) returning id into case_job_id;
    return case_job_id;
  end if;

  select execution.id into execution_id
  from public.controlled_case_executions execution
  where execution.organization_id = p_organization_id
    and execution.processing_run_id = p_processing_run_id;

  if execution_id is null then
    insert into public.controlled_case_executions (
      organization_id, intake_session_id, processing_run_id, mode, status,
      pipeline_version, model_policy_version, created_by
    ) values (
      p_organization_id, p_intake_session_id, p_processing_run_id, 'primary', 'queued',
      run_row.pipeline_version,
      coalesce((select policy.target_model_policy_version
        from public.organization_rollout_policies policy
        where policy.organization_id = p_organization_id), '2026.08.24-v1'),
      run_row.created_by
    ) returning id into execution_id;
  end if;

  insert into public.processing_jobs (
    organization_id, processing_run_id, intake_session_id, kind, payload,
    controlled_execution_id, max_attempts
  ) values (
    p_organization_id,
    p_processing_run_id,
    p_intake_session_id,
    'case_analysis',
    jsonb_build_object(
      'locale', session_locale,
      'execution_id', execution_id,
      'execution_mode', 'primary',
      'analysis_scope', 'full_case',
      'model_budget', jsonb_build_object(
        'max_cost_usd', coalesce((run_row.budget->>'case_max_cost_usd')::numeric, 1),
        'max_calls', coalesce((run_row.budget->>'case_max_calls')::integer, 4)
      )
    ),
    execution_id,
    2
  ) on conflict (organization_id, controlled_execution_id)
    where kind = 'case_analysis' and controlled_execution_id is not null do nothing
  returning id into case_job_id;

  if case_job_id is null then
    select job.id into case_job_id
    from public.processing_jobs job
    where job.organization_id = p_organization_id
      and job.controlled_execution_id = execution_id
      and job.kind = 'case_analysis';
  end if;
  return case_job_id;
end;
$$;

revoke all on function private.enqueue_primary_case_analysis(uuid, uuid, uuid)
  from public, anon, authenticated;

-- A preliminary read must not load the lender directory, pricing registry, house playbook,
-- distribution state or controlled-execution payload. It receives only the company/operation
-- declaration and the evidence extracted from the preliminary documents.
create or replace function private.worker_load_preliminary_input(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  session_row public.document_intake_sessions;
  candidates jsonb;
  documents jsonb;
begin
  if job_row.kind <> 'preliminary_analysis'
    or job_row.payload ->> 'analysis_scope' <> 'preliminary_understanding' then
    raise exception 'preliminary_analysis_capability_required' using errcode = '42501';
  end if;

  select * into session_row
  from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id
    and session.id = job_row.intake_session_id
    and session.current_run_id = job_row.processing_run_id;
  if not found then raise exception 'intake_session_not_found' using errcode = 'P0002'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', candidate.id,
    'field_path', candidate.field_path,
    'label', candidate.label,
    'raw_value', candidate.raw_value,
    'normalized_value', candidate.normalized_value,
    'value_type', candidate.value_type,
    'source_document_id', candidate.source_document_id,
    'evidence_rank', candidate.evidence_rank,
    'information_class', candidate.information_class,
    'confidence', candidate.confidence,
    'anchor_verified', candidate.anchor_verified,
    'source_anchor', candidate.source_anchor
  ) order by candidate.evidence_rank, candidate.field_path, candidate.id), '[]'::jsonb)
  into candidates
  from public.intake_field_candidates candidate
  where candidate.organization_id = job_row.organization_id
    and candidate.intake_session_id = job_row.intake_session_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', source.id,
    'original_name', source.original_name,
    'document_version', source.document_version,
    'sha256', source.sha256,
    'sha256_verified_at', source.sha256_verified_at,
    'byte_size', source.byte_size,
    'document_kind', profile.document_kind
  ) order by source.created_at, source.id), '[]'::jsonb)
  into documents
  from public.source_documents source
  left join public.document_profiles profile
    on profile.organization_id = source.organization_id
   and profile.source_document_id = source.id
   and profile.document_version = source.document_version
  where source.organization_id = job_row.organization_id
    and source.intake_session_id = job_row.intake_session_id;

  return jsonb_build_object(
    'session', jsonb_build_object(
      'id', session_row.id,
      'archetype', session_row.archetype,
      'locale', session_row.locale,
      'company_profile', session_row.company_profile,
      'capital_objective', session_row.capital_objective,
      'capital_currency', session_row.capital_currency,
      'capital_urgency', session_row.capital_urgency,
      'capital_consequence', session_row.capital_consequence,
      'requested_amount', session_row.requested_amount,
      'requested_grace_months', session_row.requested_grace_months,
      'requested_term_months', session_row.requested_term_months,
      'sector', session_row.sector,
      'geography', session_row.geography,
      'instruments', session_row.instruments,
      'collateral_kinds', session_row.collateral_kinds
    ),
    'candidates', candidates,
    'documents', documents
  );
end;
$$;

create or replace function public.worker_load_preliminary_input(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_load_preliminary_input(p_job_id, p_capability_token);
$$;

revoke all on function private.worker_load_preliminary_input(uuid, text)
  from public, anon;
revoke all on function public.worker_load_preliminary_input(uuid, text)
  from public, anon;
grant execute on function private.worker_load_preliminary_input(uuid, text)
  to authenticated;
grant execute on function public.worker_load_preliminary_input(uuid, text)
  to authenticated;

-- The local/CI content-hash extractor has no long-running worker, but it must still cross the
-- same preliminary-understanding gate as production. This command records that deterministic
-- read with explicit fixture lineage. It is unavailable once an organization is promoted to the
-- real pipeline, validates the complete public object contract, and derives the object hash
-- inside Postgres so a caller cannot choose the identity of what the user later confirms.
create or replace function private.record_fallback_preliminary_understanding(
  p_organization_id uuid,
  p_session_id uuid,
  p_input_fingerprint text,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
  run_id uuid;
  next_run_no integer;
  next_version integer;
  object_id uuid;
  object_fingerprint text;
begin
  if actor_id is null
    or not (select private.can_access_intake_session(p_organization_id, p_session_id)) then
    raise exception 'preliminary_understanding_access_denied' using errcode = '42501';
  end if;
  if coalesce((select organization.pipeline_enabled
    from public.organizations organization
    where organization.id = p_organization_id), false)
    and coalesce((select policy.state
      from public.organization_rollout_policies policy
      where policy.organization_id = p_organization_id), 'active') in ('shadow', 'canary', 'active') then
    raise exception 'fallback_preliminary_pipeline_enabled' using errcode = '55000';
  end if;
  if p_input_fingerprint !~ '^[a-f0-9]{64}$'
    or coalesce(jsonb_typeof(p_payload), 'null') <> 'object'
    or p_payload ->> 'schemaVersion' <> '2026.08.31-v1'
    or p_payload ->> 'caseId' <> p_session_id::text
    or p_payload ->> 'locale' not in ('pt-BR', 'en-US')
    or coalesce(jsonb_typeof(p_payload -> 'company'), 'null') <> 'object'
    or coalesce(jsonb_typeof(p_payload -> 'operation'), 'null') <> 'object'
    or coalesce(jsonb_typeof(p_payload -> 'basis'), 'null') <> 'object'
    or coalesce(jsonb_typeof(p_payload -> 'preliminaryAssessment'), 'null') <> 'object'
    or coalesce(p_payload #>> '{basis,publicResearch,status}', '') <> 'abstained'
    or coalesce((p_payload #>> '{basis,publicResearch,sourceCount}')::integer, -1) <> 0 then
    raise exception 'invalid_fallback_preliminary_understanding' using errcode = '22023';
  end if;

  select session.* into session_row
  from public.document_intake_sessions session
  where session.organization_id = p_organization_id
    and session.id = p_session_id
  for update;
  if not found then raise exception 'intake_session_not_found' using errcode = 'P0002'; end if;
  if session_row.status <> 'review_ready' then
    raise exception 'fallback_preliminary_session_not_ready' using errcode = '55000';
  end if;

  select understanding.id into object_id
  from public.preliminary_understandings understanding
  where understanding.organization_id = p_organization_id
    and understanding.intake_session_id = p_session_id
    and understanding.status in ('pending_confirmation', 'confirmed')
  order by understanding.object_version desc
  limit 1;
  if object_id is not null then return object_id; end if;

  select coalesce(max(run.run_no), 0) + 1 into next_run_no
  from public.processing_runs run
  where run.organization_id = p_organization_id
    and run.intake_session_id = p_session_id;

  insert into public.processing_runs (
    organization_id, intake_session_id, run_no, trigger, status, pipeline_version,
    stages, budget, usage, versions, started_at, completed_at, created_by
  ) values (
    p_organization_id, p_session_id, next_run_no, 'manual', 'succeeded',
    'fixture-preliminary-2026.08.31',
    jsonb_build_array(
      jsonb_build_object('stage', 'preliminary_understanding', 'status', 'started'),
      jsonb_build_object('stage', 'preliminary_understanding', 'status', 'succeeded')
    ),
    jsonb_build_object('max_cost_usd', 0, 'max_calls', 0),
    jsonb_build_object('cost_usd', 0, 'calls', 0),
    jsonb_build_object('source', 'verified_content_hash_fixture'),
    now(), now(), actor_id
  ) returning id into run_id;

  select coalesce(max(understanding.object_version), 0) + 1 into next_version
  from public.preliminary_understandings understanding
  where understanding.organization_id = p_organization_id
    and understanding.intake_session_id = p_session_id;

  object_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'organizationId', p_organization_id,
    'intakeSessionId', p_session_id,
    'objectVersion', next_version,
    'inputFingerprint', p_input_fingerprint,
    'payload', p_payload
  )::text, 'utf8'), 'sha256'), 'hex');

  update public.preliminary_understandings understanding
  set status = 'superseded'
  where understanding.organization_id = p_organization_id
    and understanding.intake_session_id = p_session_id
    and understanding.status in ('pending_confirmation', 'changes_requested');

  insert into public.preliminary_understandings (
    organization_id, intake_session_id, processing_run_id, object_version, status,
    input_fingerprint, object_fingerprint, payload
  ) values (
    p_organization_id, p_session_id, run_id, next_version, 'pending_confirmation',
    p_input_fingerprint, object_fingerprint, p_payload
  ) returning id into object_id;

  update public.document_intake_sessions session
  set current_run_id = run_id,
      pipeline_version = 'fixture-preliminary-2026.08.31'
  where session.organization_id = p_organization_id
    and session.id = p_session_id;

  return object_id;
end;
$$;

create or replace function public.record_fallback_preliminary_understanding(
  p_organization_id uuid,
  p_session_id uuid,
  p_input_fingerprint text,
  p_payload jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.record_fallback_preliminary_understanding(
    p_organization_id, p_session_id, p_input_fingerprint, p_payload
  );
$$;

revoke all on function private.record_fallback_preliminary_understanding(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.record_fallback_preliminary_understanding(uuid, uuid, text, jsonb)
  from public, anon;
grant execute on function private.record_fallback_preliminary_understanding(uuid, uuid, text, jsonb)
  to authenticated;
grant execute on function public.record_fallback_preliminary_understanding(uuid, uuid, text, jsonb)
  to authenticated;
