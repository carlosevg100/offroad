-- First executable Agent Offroad vertical.
--
-- A tenant message is queued atomically, the existing capability-bound worker produces either
-- one clarification or one typed operation-brief proposal, and a separate tenant command applies
-- an accepted proposal. The model never writes a session projection and acceptance never means
-- application by implication.

alter table public.processing_jobs drop constraint processing_jobs_kind_check;
alter table public.processing_jobs add constraint processing_jobs_kind_check
  check (kind in ('document_pipeline', 'case_analysis', 'agent_operation_brief'));

alter table public.agent_change_proposals alter column source_manifest_id drop not null;
alter table public.agent_change_proposals
  add column source_message_id uuid,
  add column base_projection_updated_at timestamptz;

create table public.agent_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  intake_session_id uuid not null,
  state text not null default 'idle' check (state in ('analyzing', 'asking', 'proposing', 'idle', 'failed')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, intake_session_id),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions(organization_id, id) on delete cascade
);

create table public.agent_messages (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null,
  intake_session_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  status text not null check (status in ('queued', 'processing', 'completed', 'failed')),
  content text not null check (char_length(trim(content)) between 1 and 8000),
  locale text not null check (locale in ('pt-BR', 'en-US')),
  reply_to_message_id uuid,
  proposal_id uuid,
  error_code text check (error_code is null or error_code ~ '^[a-z0-9_]{3,80}$'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, conversation_id)
    references public.agent_conversations(organization_id, id) on delete cascade,
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions(organization_id, id) on delete cascade,
  foreign key (organization_id, reply_to_message_id)
    references public.agent_messages(organization_id, id) on delete restrict,
  foreign key (organization_id, proposal_id)
    references public.agent_change_proposals(organization_id, id) on delete restrict
);

alter table public.agent_change_proposals
  add constraint agent_change_proposals_source_message_fkey
  foreign key (organization_id, source_message_id)
  references public.agent_messages(organization_id, id) on delete restrict;

create index agent_messages_conversation_created_idx
  on public.agent_messages (organization_id, conversation_id, created_at);
create index agent_messages_session_status_idx
  on public.agent_messages (organization_id, intake_session_id, status, created_at desc);
create index agent_messages_reply_to_idx
  on public.agent_messages (organization_id, reply_to_message_id)
  where reply_to_message_id is not null;
create index agent_messages_proposal_idx
  on public.agent_messages (organization_id, proposal_id)
  where proposal_id is not null;
create index agent_change_proposals_source_message_idx
  on public.agent_change_proposals (organization_id, source_message_id)
  where source_message_id is not null;
create unique index processing_jobs_agent_message_idx
  on public.processing_jobs (organization_id, ((payload ->> 'message_id')))
  where kind = 'agent_operation_brief';

alter table public.agent_conversations enable row level security;
alter table public.agent_conversations force row level security;
alter table public.agent_messages enable row level security;
alter table public.agent_messages force row level security;

create policy agent_conversations_select on public.agent_conversations for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));
create policy agent_messages_select on public.agent_messages for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));

create trigger agent_conversations_set_updated_at before update on public.agent_conversations
  for each row execute function private.set_updated_at();
create trigger agent_messages_set_updated_at before update on public.agent_messages
  for each row execute function private.set_updated_at();
create trigger agent_conversations_audit after insert or update or delete on public.agent_conversations
  for each row execute function private.capture_audit_event();
create trigger agent_messages_audit after insert or update or delete on public.agent_messages
  for each row execute function private.capture_audit_event();

revoke all privileges on public.agent_conversations from anon, authenticated;
revoke all privileges on public.agent_messages from anon, authenticated;
grant select on public.agent_conversations to authenticated;
grant select on public.agent_messages to authenticated;

create or replace function private.agent_operation_brief_snapshot(
  p_session public.document_intake_sessions
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'objective', p_session.capital_objective,
    'requestedAmount', p_session.requested_amount,
    'currency', p_session.capital_currency,
    'urgency', p_session.capital_urgency,
    'requestedTermMonths', p_session.requested_term_months,
    'requestedGraceMonths', p_session.requested_grace_months,
    'consequenceIfNotExecuted', p_session.capital_consequence,
    'sector', p_session.sector,
    'geography', p_session.geography,
    'instruments', coalesce(to_jsonb(p_session.instruments), '[]'::jsonb),
    'collateralKinds', coalesce(to_jsonb(p_session.collateral_kinds), '[]'::jsonb),
    'expectedRate', p_session.expected_rate,
    'useOfProceeds', p_session.archetype
  ));
$$;

create or replace function private.agent_snapshot_fingerprint(
  p_session public.document_intake_sessions
)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(
    convert_to(private.agent_operation_brief_snapshot(p_session)::text, 'utf8'), 'sha256'
  ), 'hex');
$$;

revoke all on function private.agent_operation_brief_snapshot(public.document_intake_sessions)
  from public, anon, authenticated;
revoke all on function private.agent_snapshot_fingerprint(public.document_intake_sessions)
  from public, anon, authenticated;

create or replace function private.submit_agent_message(
  p_organization_id uuid,
  p_session_id uuid,
  p_message_id uuid,
  p_content text,
  p_locale text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
  conversation_row public.agent_conversations;
  existing_message public.agent_messages;
  run_id uuid := gen_random_uuid();
  run_no_value integer;
  job_id uuid := gen_random_uuid();
begin
  session_row := private.intake_session_for_update(p_organization_id, p_session_id);
  if session_row.status in ('cancelled', 'confirmed') then
    raise exception 'agent_session_not_editable' using errcode = '55000';
  end if;
  if session_row.archetype is null then
    raise exception 'agent_operation_not_selected' using errcode = '55000';
  end if;
  if p_message_id is null
    or p_locale not in ('pt-BR', 'en-US')
    or char_length(trim(coalesce(p_content, ''))) not between 1 and 4000 then
    raise exception 'invalid_agent_message' using errcode = '22023';
  end if;

  select * into existing_message
  from public.agent_messages message
  where message.organization_id = p_organization_id and message.id = p_message_id;
  if found then
    if existing_message.intake_session_id is distinct from p_session_id
      or existing_message.role <> 'user'
      or existing_message.content <> trim(p_content)
      or existing_message.locale <> p_locale
      or existing_message.created_by is distinct from actor_id then
      raise exception 'agent_message_idempotency_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'message_id', existing_message.id,
      'conversation_id', existing_message.conversation_id,
      'status', existing_message.status,
      'replayed', true
    );
  end if;

  select * into conversation_row
  from public.agent_conversations conversation
  where conversation.organization_id = p_organization_id
    and conversation.intake_session_id = p_session_id
  for update;
  if not found then
    insert into public.agent_conversations (
      organization_id, intake_session_id, state, created_by
    ) values (
      p_organization_id, p_session_id, 'idle', actor_id
    ) returning * into conversation_row;
  end if;

  if exists (
    select 1 from public.agent_messages message
    where message.organization_id = p_organization_id
      and message.conversation_id = conversation_row.id
      and message.role = 'user'
      and message.status in ('queued', 'processing')
  ) then
    raise exception 'agent_message_in_progress' using errcode = '55000';
  end if;

  select coalesce(max(run.run_no), 0) + 1 into run_no_value
  from public.processing_runs run
  where run.organization_id = p_organization_id and run.intake_session_id = p_session_id;

  insert into public.processing_runs (
    id, organization_id, intake_session_id, run_no, trigger, status,
    pipeline_version, budget, versions, created_by
  ) values (
    run_id, p_organization_id, p_session_id, run_no_value, 'answer', 'queued',
    'agent-operation-brief-v1',
    jsonb_build_object('maxCalls', 1, 'maxCostUsd', 2),
    jsonb_build_object('agentContract', '2026.08.26-v1'),
    actor_id
  );

  insert into public.agent_messages (
    id, organization_id, conversation_id, intake_session_id, role, status,
    content, locale, created_by
  ) values (
    p_message_id, p_organization_id, conversation_row.id, p_session_id,
    'user', 'queued', trim(p_content), p_locale, actor_id
  );

  insert into public.processing_jobs (
    id, organization_id, processing_run_id, intake_session_id, kind, payload
  ) values (
    job_id, p_organization_id, run_id, p_session_id, 'agent_operation_brief',
    jsonb_build_object('message_id', p_message_id, 'locale', p_locale)
  );

  update public.agent_conversations set state = 'analyzing'
  where organization_id = p_organization_id and id = conversation_row.id;

  return jsonb_build_object(
    'message_id', p_message_id,
    'conversation_id', conversation_row.id,
    'job_id', job_id,
    'status', 'queued',
    'replayed', false
  );
end;
$$;

create or replace function public.submit_agent_message(
  p_organization_id uuid,
  p_session_id uuid,
  p_message_id uuid,
  p_content text,
  p_locale text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.submit_agent_message(
    p_organization_id, p_session_id, p_message_id, p_content, p_locale
  );
$$;

create or replace function private.worker_load_agent_context(
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
  message_row public.agent_messages;
  manifest_id uuid;
begin
  if job_row.kind <> 'agent_operation_brief' then
    raise exception 'agent_operation_brief_capability_required' using errcode = '42501';
  end if;
  select * into session_row from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id and session.id = job_row.intake_session_id;
  select * into message_row from public.agent_messages message
  where message.organization_id = job_row.organization_id
    and message.id = (job_row.payload ->> 'message_id')::uuid
    and message.role = 'user'
  for update;
  if not found then raise exception 'agent_source_message_not_found' using errcode = 'P0002'; end if;

  update public.agent_messages set status = 'processing'
  where organization_id = job_row.organization_id and id = message_row.id and status = 'queued';
  begin
    manifest_id := nullif(session_row.result_summary #>> '{case_manifest,id}', '')::uuid;
  exception when invalid_text_representation then manifest_id := null;
  end;

  return jsonb_build_object(
    'session_id', session_row.id,
    'message_id', message_row.id,
    'locale', message_row.locale,
    'message', message_row.content,
    'brief', private.agent_operation_brief_snapshot(session_row),
    'snapshot_fingerprint', private.agent_snapshot_fingerprint(session_row),
    'projection_updated_at', session_row.updated_at,
    'manifest_id', manifest_id,
    'recent_messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', recent.id, 'role', recent.role, 'content', recent.content, 'created_at', recent.created_at
      ) order by recent.created_at)
      from (
        select message.id, message.role, message.content, message.created_at
        from public.agent_messages message
        where message.organization_id = job_row.organization_id
          and message.conversation_id = message_row.conversation_id
          and message.id <> message_row.id
          and message.status = 'completed'
        order by message.created_at desc limit 12
      ) recent
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.worker_load_agent_context(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.worker_load_agent_context(p_job_id, p_capability_token); $$;

create or replace function private.worker_record_agent_response(
  p_job_id uuid,
  p_capability_token text,
  p_assistant_message_id uuid,
  p_response jsonb,
  p_proposal jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  source_message public.agent_messages;
  session_row public.document_intake_sessions;
  proposal_id uuid;
  manifest_id uuid;
  patch_record jsonb;
  evidence_record jsonb;
  actor_id uuid := (select auth.uid());
  state_value text := p_response ->> 'state';
begin
  if job_row.kind <> 'agent_operation_brief' then
    raise exception 'agent_operation_brief_capability_required' using errcode = '42501';
  end if;
  if p_assistant_message_id is null or jsonb_typeof(p_response) <> 'object'
    or state_value not in ('asking', 'proposing', 'idle')
    or char_length(trim(coalesce(p_response ->> 'reply', ''))) not between 1 and 4000 then
    raise exception 'invalid_agent_response' using errcode = '22023';
  end if;
  select * into source_message from public.agent_messages message
  where message.organization_id = job_row.organization_id
    and message.id = (job_row.payload ->> 'message_id')::uuid
    and message.role = 'user'
  for update;
  if not found then raise exception 'agent_source_message_not_found' using errcode = 'P0002'; end if;
  select * into session_row from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id and session.id = job_row.intake_session_id
  for share;

  if p_proposal is not null then
    if state_value <> 'proposing'
      or p_proposal ->> 'schemaVersion' <> '2026.08.26-v1'
      or p_proposal ->> 'caseId' <> job_row.intake_session_id::text
      or p_proposal ->> 'target' <> 'operation_brief'
      or p_proposal ->> 'proposedBy' <> 'offroad_agent'
      or p_proposal ->> 'baseManifestFingerprint' <> private.agent_snapshot_fingerprint(session_row)
      or jsonb_typeof(p_proposal -> 'patches') <> 'array'
      or jsonb_array_length(p_proposal -> 'patches') not between 1 and 12
      or jsonb_typeof(p_proposal -> 'evidence') <> 'array'
      or jsonb_array_length(p_proposal -> 'evidence') not between 1 and 50 then
      raise exception 'invalid_agent_operation_brief_proposal' using errcode = '22023';
    end if;
    for patch_record in select value from jsonb_array_elements(p_proposal -> 'patches') loop
      if patch_record ->> 'operation' <> 'set'
        or patch_record ->> 'path' not in (
          '/objective', '/requestedAmount', '/currency', '/urgency', '/requestedTermMonths',
          '/requestedGraceMonths', '/consequenceIfNotExecuted', '/sector', '/geography',
          '/instruments', '/collateralKinds', '/expectedRate'
        ) or not (patch_record ? 'value') then
        raise exception 'invalid_agent_operation_brief_patch' using errcode = '22023';
      end if;
    end loop;
    if not exists (
      select 1 from jsonb_array_elements(p_proposal -> 'evidence') evidence
      where evidence ->> 'kind' = 'user_statement' and evidence ->> 'id' = source_message.id::text
    ) then
      raise exception 'agent_proposal_missing_user_statement' using errcode = '22023';
    end if;
    for evidence_record in select value from jsonb_array_elements(p_proposal -> 'evidence') loop
      if evidence_record ->> 'kind' not in (
        'user_statement', 'document_anchor', 'reconciled_fact', 'calculation',
        'public_source', 'procedure', 'mandate_criterion'
      ) or char_length(trim(coalesce(evidence_record ->> 'id', ''))) not between 1 and 300 then
        raise exception 'invalid_agent_change_evidence' using errcode = '22023';
      end if;
    end loop;
    begin
      proposal_id := (p_proposal ->> 'id')::uuid;
      manifest_id := nullif(session_row.result_summary #>> '{case_manifest,id}', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid_agent_proposal_id' using errcode = '22023';
    end;
    insert into public.agent_change_proposals (
      id, organization_id, intake_session_id, source_manifest_id, source_message_id,
      base_manifest_fingerprint, base_projection_updated_at, proposal_fingerprint,
      target, title, rationale, impact_summary, proposal, proposed_by_kind, proposed_by,
      proposed_at, expires_at
    ) values (
      proposal_id, job_row.organization_id, job_row.intake_session_id, manifest_id, source_message.id,
      p_proposal ->> 'baseManifestFingerprint', session_row.updated_at,
      p_proposal ->> 'proposalFingerprint', 'operation_brief', p_proposal ->> 'title',
      p_proposal ->> 'rationale', p_proposal ->> 'impactSummary', p_proposal,
      'offroad_agent', actor_id, (p_proposal ->> 'proposedAt')::timestamptz,
      (p_proposal ->> 'expiresAt')::timestamptz
    ) on conflict (organization_id, proposal_fingerprint) do update
      set proposal_fingerprint = excluded.proposal_fingerprint
    returning id into proposal_id;
  elsif state_value = 'proposing' then
    raise exception 'agent_response_missing_proposal' using errcode = '22023';
  end if;

  insert into public.agent_messages (
    id, organization_id, conversation_id, intake_session_id, role, status, content,
    locale, reply_to_message_id, proposal_id, metadata, created_by
  ) values (
    p_assistant_message_id, job_row.organization_id, source_message.conversation_id,
    job_row.intake_session_id, 'assistant', 'completed', trim(p_response ->> 'reply'),
    source_message.locale, source_message.id, proposal_id,
    jsonb_strip_nulls(jsonb_build_object(
      'state', state_value, 'clarification', p_response -> 'clarification'
    )), actor_id
  ) on conflict (organization_id, id) do nothing;

  update public.agent_messages set status = 'completed'
  where organization_id = job_row.organization_id and id = source_message.id;
  update public.agent_conversations set state = state_value
  where organization_id = job_row.organization_id and id = source_message.conversation_id;
  return jsonb_build_object('message_id', p_assistant_message_id, 'proposal_id', proposal_id);
end;
$$;

create or replace function public.worker_record_agent_response(
  p_job_id uuid, p_capability_token text, p_assistant_message_id uuid,
  p_response jsonb, p_proposal jsonb default null
)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.worker_record_agent_response(
  p_job_id, p_capability_token, p_assistant_message_id, p_response, p_proposal
); $$;

create or replace function private.worker_record_agent_failure(
  p_job_id uuid, p_capability_token text, p_error_code text
)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  source_message public.agent_messages;
begin
  if job_row.kind <> 'agent_operation_brief'
    or p_error_code !~ '^[a-z0-9_]{3,80}$' then
    raise exception 'invalid_agent_failure' using errcode = '22023';
  end if;
  update public.agent_messages set status = 'failed', error_code = p_error_code
  where organization_id = job_row.organization_id
    and id = (job_row.payload ->> 'message_id')::uuid
  returning * into source_message;
  update public.agent_conversations set state = 'failed'
  where organization_id = job_row.organization_id and id = source_message.conversation_id;
end;
$$;

create or replace function public.worker_record_agent_failure(
  p_job_id uuid, p_capability_token text, p_error_code text
)
returns void language sql security invoker set search_path = ''
as $$ select private.worker_record_agent_failure(p_job_id, p_capability_token, p_error_code); $$;

create or replace function private.apply_agent_operation_brief_proposal(
  p_organization_id uuid,
  p_proposal_id uuid,
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  proposal_row public.agent_change_proposals;
  session_row public.document_intake_sessions;
  brief jsonb;
  patch_record jsonb;
  result jsonb;
begin
  select * into proposal_row from public.agent_change_proposals proposal
  where proposal.organization_id = p_organization_id and proposal.id = p_proposal_id
  for update;
  if not found then raise exception 'agent_proposal_not_found' using errcode = 'P0002'; end if;
  if actor_id is null or not (select private.can_access_intake_session(
    proposal_row.organization_id, proposal_row.intake_session_id
  )) then raise exception 'agent_proposal_access_denied' using errcode = '42501'; end if;
  if proposal_row.status <> 'accepted' or proposal_row.target <> 'operation_brief' then
    raise exception 'agent_proposal_not_applicable' using errcode = '55000';
  end if;
  if proposal_row.expires_at <= now() then
    update public.agent_change_proposals set status = 'stale', decision_reason = 'proposal_expired'
    where organization_id = p_organization_id and id = p_proposal_id;
    return jsonb_build_object('proposal_id', p_proposal_id, 'status', 'stale', 'reason', 'proposal_expired');
  end if;
  session_row := private.intake_session_for_update(p_organization_id, proposal_row.intake_session_id);
  if session_row.status in ('confirmed', 'cancelled')
    or session_row.updated_at is distinct from proposal_row.base_projection_updated_at
    or private.agent_snapshot_fingerprint(session_row) <> proposal_row.base_manifest_fingerprint then
    update public.agent_change_proposals set status = 'stale', decision_reason = 'case_changed_after_preview'
    where organization_id = p_organization_id and id = p_proposal_id;
    return jsonb_build_object('proposal_id', p_proposal_id, 'status', 'stale', 'reason', 'case_changed_after_preview');
  end if;

  brief := private.agent_operation_brief_snapshot(session_row);
  for patch_record in select value from jsonb_array_elements(proposal_row.proposal -> 'patches') loop
    if patch_record ->> 'operation' <> 'set'
      or patch_record ->> 'path' not in (
        '/objective', '/requestedAmount', '/currency', '/urgency', '/requestedTermMonths',
        '/requestedGraceMonths', '/consequenceIfNotExecuted', '/sector', '/geography',
        '/instruments', '/collateralKinds', '/expectedRate'
      ) then raise exception 'invalid_agent_operation_brief_patch' using errcode = '22023'; end if;
    brief := jsonb_set(
      brief,
      array[substring(patch_record ->> 'path' from 2)],
      patch_record -> 'value',
      true
    );
  end loop;

  result := private.record_intake_capital_need_command(
    p_organization_id,
    proposal_row.intake_session_id,
    p_event_id,
    session_row.archetype,
    brief ->> 'objective',
    nullif(brief ->> 'requestedAmount', '')::numeric,
    brief ->> 'currency',
    brief ->> 'urgency',
    nullif(brief ->> 'requestedTermMonths', '')::integer,
    nullif(brief ->> 'requestedGraceMonths', '')::integer,
    brief ->> 'consequenceIfNotExecuted',
    brief ->> 'sector',
    brief ->> 'geography',
    array(select jsonb_array_elements_text(coalesce(brief -> 'instruments', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(brief -> 'collateralKinds', '[]'::jsonb))),
    brief ->> 'expectedRate'
  );
  update public.agent_change_proposals set status = 'applied'
  where organization_id = p_organization_id and id = p_proposal_id;
  return jsonb_build_object('proposal_id', p_proposal_id, 'status', 'applied', 'event', result);
end;
$$;

create or replace function public.apply_agent_operation_brief_proposal(
  p_organization_id uuid, p_proposal_id uuid, p_event_id uuid
)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.apply_agent_operation_brief_proposal(
  p_organization_id, p_proposal_id, p_event_id
); $$;

revoke all on function private.submit_agent_message(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.submit_agent_message(uuid, uuid, uuid, text, text) from public, anon;
grant execute on function private.submit_agent_message(uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.submit_agent_message(uuid, uuid, uuid, text, text) to authenticated;

revoke all on function private.worker_load_agent_context(uuid, text) from public, anon;
revoke all on function public.worker_load_agent_context(uuid, text) from public, anon;
revoke all on function private.worker_record_agent_response(uuid, text, uuid, jsonb, jsonb) from public, anon;
revoke all on function public.worker_record_agent_response(uuid, text, uuid, jsonb, jsonb) from public, anon;
revoke all on function private.worker_record_agent_failure(uuid, text, text) from public, anon;
revoke all on function public.worker_record_agent_failure(uuid, text, text) from public, anon;
grant execute on function private.worker_load_agent_context(uuid, text) to authenticated;
grant execute on function public.worker_load_agent_context(uuid, text) to authenticated;
grant execute on function private.worker_record_agent_response(uuid, text, uuid, jsonb, jsonb) to authenticated;
grant execute on function public.worker_record_agent_response(uuid, text, uuid, jsonb, jsonb) to authenticated;
grant execute on function private.worker_record_agent_failure(uuid, text, text) to authenticated;
grant execute on function public.worker_record_agent_failure(uuid, text, text) to authenticated;

revoke all on function private.apply_agent_operation_brief_proposal(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.apply_agent_operation_brief_proposal(uuid, uuid, uuid) from public, anon;
grant execute on function private.apply_agent_operation_brief_proposal(uuid, uuid, uuid) to authenticated;
grant execute on function public.apply_agent_operation_brief_proposal(uuid, uuid, uuid) to authenticated;

comment on table public.agent_conversations is
  'One tenant-visible Agent Offroad conversation per intake session. State mirrors real queued work.';
comment on table public.agent_messages is
  'Append-only user and assistant messages. Assistant proposals are previewed and applied separately.';
