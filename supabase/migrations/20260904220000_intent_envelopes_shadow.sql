-- Shadow routing: the Intent Envelope is recorded beside every advisor turn without touching the
-- production route. Nothing reads this table to decide anything; it exists so the envelope can
-- be measured against gold turn by turn (composite intent, correction, abstention) before it is
-- allowed to route. ADR 0021 and ADR 0022.

create table public.intent_envelopes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  message_id uuid not null,
  capital_project_id uuid,
  processing_job_id uuid not null,
  envelope jsonb not null check (jsonb_typeof(envelope) = 'object' and envelope ->> 'schemaVersion' = 'intent-envelope.v1'),
  classifier jsonb not null default '{}'::jsonb check (jsonb_typeof(classifier) = 'object'),
  model text not null,
  cost_usd numeric(12, 6) not null default 0 check (cost_usd >= 0),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, message_id),
  foreign key (organization_id, message_id) references public.agent_messages (organization_id, id) on delete cascade,
  foreign key (organization_id, capital_project_id) references public.capital_projects (organization_id, id) on delete cascade,
  foreign key (organization_id, processing_job_id) references public.processing_jobs (organization_id, id) on delete cascade
);

create index intent_envelopes_project_idx on public.intent_envelopes (organization_id, capital_project_id, created_at desc);
create index intent_envelopes_job_idx on public.intent_envelopes (organization_id, processing_job_id);

alter table public.intent_envelopes enable row level security;
alter table public.intent_envelopes force row level security;

create policy intent_envelopes_select on public.intent_envelopes for select to authenticated
  using ((select private.is_org_member(organization_id)));

-- Only the worker writes, through the capability-scoped command below.
grant select on public.intent_envelopes to authenticated;

comment on table public.intent_envelopes is
  'Shadow Intent Envelope per advisor turn. Measured against gold; never consulted by the production router.';

create or replace function private.worker_record_intent_envelope(
  p_job_id uuid,
  p_capability_token text,
  p_envelope jsonb,
  p_classifier jsonb,
  p_model text,
  p_cost_usd numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  message_id uuid;
  project_id uuid;
  recorded uuid;
begin
  if job_row.kind <> 'agent_operation_brief' then
    raise exception 'agent_operation_brief_capability_required' using errcode = '42501';
  end if;
  if p_envelope is null or jsonb_typeof(p_envelope) <> 'object'
    or p_envelope ->> 'schemaVersion' <> 'intent-envelope.v1'
    or p_envelope #>> '{executionContext,organizationId,value}' <> job_row.organization_id::text
    or p_envelope #>> '{executionContext,organizationId,state}' <> 'system'
    or p_envelope #>> '{executionContext,authority,state}' <> 'system'
    or p_envelope #>> '{executionContext,evidenceRegime,state}' <> 'system' then
    raise exception 'invalid_intent_envelope' using errcode = '22023';
  end if;
  if p_model !~ '^[a-z0-9._-]{3,80}$' then
    raise exception 'invalid_intent_envelope_model' using errcode = '22023';
  end if;

  message_id := (job_row.payload ->> 'message_id')::uuid;
  select conversation.capital_project_id into project_id
  from public.agent_messages message
  join public.agent_conversations conversation
    on conversation.organization_id = message.organization_id and conversation.id = message.conversation_id
  where message.organization_id = job_row.organization_id and message.id = message_id;

  insert into public.intent_envelopes (
    organization_id, message_id, capital_project_id, processing_job_id, envelope, classifier, model, cost_usd
  ) values (
    job_row.organization_id, message_id, project_id, job_row.id, p_envelope, coalesce(p_classifier, '{}'::jsonb), p_model, coalesce(p_cost_usd, 0)
  )
  on conflict (organization_id, message_id) do update set
    envelope = excluded.envelope,
    classifier = excluded.classifier,
    model = excluded.model,
    cost_usd = excluded.cost_usd,
    processing_job_id = excluded.processing_job_id
  returning id into recorded;

  return recorded;
end;
$$;

revoke all on function private.worker_record_intent_envelope(uuid, text, jsonb, jsonb, text, numeric) from public, anon;

create or replace function public.worker_record_intent_envelope(
  p_job_id uuid,
  p_capability_token text,
  p_envelope jsonb,
  p_classifier jsonb,
  p_model text,
  p_cost_usd numeric
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.worker_record_intent_envelope(p_job_id, p_capability_token, p_envelope, p_classifier, p_model, p_cost_usd);
$$;

revoke all on function public.worker_record_intent_envelope(uuid, text, jsonb, jsonb, text, numeric) from public, anon;
grant execute on function public.worker_record_intent_envelope(uuid, text, jsonb, jsonb, text, numeric) to authenticated;
grant execute on function private.worker_record_intent_envelope(uuid, text, jsonb, jsonb, text, numeric) to authenticated;
