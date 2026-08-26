-- M9 governs red-flag signals and Offroad's own mandate decision. A finding is not
-- a credit opinion, and a mandate decline is not a lender underwriting decision.

create table public.red_flag_policies (
  id uuid primary key default gen_random_uuid(),
  version text not null unique check (length(trim(version)) between 3 and 120),
  status text not null default 'draft' check (status in ('draft', 'active', 'superseded', 'invalidated')),
  valid_from date not null,
  valid_until date,
  thresholds jsonb not null default '{}'::jsonb check (jsonb_typeof(thresholds) = 'object'),
  materiality jsonb not null default '{}'::jsonb check (jsonb_typeof(materiality) = 'object'),
  response_sla jsonb not null default '{}'::jsonb check (jsonb_typeof(response_sla) = 'object'),
  methodology_source text not null check (length(trim(methodology_source)) between 10 and 500),
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until is null or valid_until >= valid_from),
  check (status <> 'active' or (approved_by is not null and approved_at is not null))
);
create unique index red_flag_policies_one_active_idx
  on public.red_flag_policies (status) where status = 'active';
create index red_flag_policies_approved_by_fk_idx on public.red_flag_policies (approved_by);
create trigger red_flag_policies_set_updated_at before update on public.red_flag_policies
  for each row execute function private.set_updated_at();
alter table public.red_flag_policies enable row level security;
alter table public.red_flag_policies force row level security;
create policy red_flag_policies_service_only on public.red_flag_policies for all to authenticated
  using (false) with check (false);
revoke all on public.red_flag_policies from public, anon, authenticated;
grant select, insert, update, delete on public.red_flag_policies to service_role;

-- Reviews are append-only and bind to the exact fingerprint of one detected signal.
create table public.case_red_flag_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  intake_session_id uuid not null,
  flag_id text not null check (flag_id ~ '^RF-(0[1-9]|1[0-9]|20)$'),
  flag_fingerprint text not null check (flag_fingerprint ~ '^[0-9a-f]{64}$'),
  decision text not null check (decision in ('confirmed', 'false_positive', 'treated', 'accepted_risk')),
  rationale text not null check (length(trim(rationale)) between 20 and 2000),
  evidence_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence_ids) = 'array'),
  decided_by uuid not null references auth.users (id),
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions (organization_id, id) on delete cascade
);
create index case_red_flag_reviews_session_idx
  on public.case_red_flag_reviews (organization_id, intake_session_id, flag_id, decided_at desc);
create index case_red_flag_reviews_decided_by_fk_idx on public.case_red_flag_reviews (decided_by);

-- This is an Offroad mandate decision. It never states whether a lender should approve credit.
create table public.offroad_mandate_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  intake_session_id uuid not null,
  assessment_fingerprint text not null check (assessment_fingerprint ~ '^[0-9a-f]{64}$'),
  decision text not null check (decision in ('continue', 'continue_with_conditions', 'decline')),
  reason_codes jsonb not null default '[]'::jsonb check (jsonb_typeof(reason_codes) = 'array'),
  conditions jsonb not null default '[]'::jsonb check (jsonb_typeof(conditions) = 'array'),
  path_back text check (path_back is null or length(trim(path_back)) between 10 and 2000),
  decided_by uuid not null references auth.users (id),
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, intake_session_id, assessment_fingerprint),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions (organization_id, id) on delete cascade,
  check (decision <> 'decline' or path_back is not null)
);
create index offroad_mandate_decisions_session_idx
  on public.offroad_mandate_decisions (organization_id, intake_session_id, decided_at desc);
create index offroad_mandate_decisions_decided_by_fk_idx on public.offroad_mandate_decisions (decided_by);

create table public.decline_communications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  intake_session_id uuid not null,
  mandate_decision_id uuid not null,
  mandate_decision_fingerprint text not null check (mandate_decision_fingerprint ~ '^[0-9a-f]{64}$'),
  channel text not null check (channel in ('email', 'meeting', 'phone', 'platform')),
  recipient text not null check (length(trim(recipient)) between 2 and 320),
  message_fingerprint text not null check (message_fingerprint ~ '^[0-9a-f]{64}$'),
  sent_by uuid not null references auth.users (id),
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, mandate_decision_id, message_fingerprint),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions (organization_id, id) on delete cascade,
  foreign key (organization_id, mandate_decision_id)
    references public.offroad_mandate_decisions (organization_id, id)
);
create index decline_communications_session_idx
  on public.decline_communications (organization_id, intake_session_id, sent_at desc);
create index decline_communications_decision_fk_idx
  on public.decline_communications (organization_id, mandate_decision_id);
create index decline_communications_sent_by_fk_idx on public.decline_communications (sent_by);

create trigger case_red_flag_reviews_audit after insert or update or delete on public.case_red_flag_reviews
  for each row execute function private.capture_audit_event();
create trigger offroad_mandate_decisions_audit after insert or update or delete on public.offroad_mandate_decisions
  for each row execute function private.capture_audit_event();
create trigger decline_communications_audit after insert or update or delete on public.decline_communications
  for each row execute function private.capture_audit_event();

alter table public.case_red_flag_reviews enable row level security;
alter table public.case_red_flag_reviews force row level security;
alter table public.offroad_mandate_decisions enable row level security;
alter table public.offroad_mandate_decisions force row level security;
alter table public.decline_communications enable row level security;
alter table public.decline_communications force row level security;

create policy case_red_flag_reviews_select on public.case_red_flag_reviews for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));
create policy offroad_mandate_decisions_select on public.offroad_mandate_decisions for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));
create policy decline_communications_select on public.decline_communications for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));

revoke all on public.case_red_flag_reviews from public, anon, authenticated;
revoke all on public.offroad_mandate_decisions from public, anon, authenticated;
revoke all on public.decline_communications from public, anon, authenticated;
grant select on public.case_red_flag_reviews to authenticated;
grant select on public.offroad_mandate_decisions to authenticated;
grant select on public.decline_communications to authenticated;
grant select, insert, update, delete on public.case_red_flag_reviews to service_role;
grant select, insert, update, delete on public.offroad_mandate_decisions to service_role;
grant select, insert, update, delete on public.decline_communications to service_role;

create function private.review_case_red_flag(
  p_organization_id uuid,
  p_intake_session_id uuid,
  p_flag_id text,
  p_flag_fingerprint text,
  p_decision text,
  p_rationale text,
  p_evidence_ids jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare review_id uuid;
begin
  if not (select private.can_access_intake_session(p_organization_id, p_intake_session_id)) then
    raise exception 'red_flag_review_forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = p_organization_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role in ('owner', 'admin', 'analyst', 'compliance')
  ) then raise exception 'red_flag_reviewer_role_required' using errcode = '42501'; end if;
  insert into public.case_red_flag_reviews (
    organization_id, intake_session_id, flag_id, flag_fingerprint,
    decision, rationale, evidence_ids, decided_by
  ) values (
    p_organization_id, p_intake_session_id, p_flag_id, p_flag_fingerprint,
    p_decision, p_rationale, p_evidence_ids, (select auth.uid())
  ) returning id into review_id;
  return review_id;
end;
$$;

create function private.decide_offroad_mandate(
  p_organization_id uuid,
  p_intake_session_id uuid,
  p_assessment_fingerprint text,
  p_decision text,
  p_reason_codes jsonb default '[]'::jsonb,
  p_conditions jsonb default '[]'::jsonb,
  p_path_back text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare decision_id uuid;
begin
  if not (select private.can_access_intake_session(p_organization_id, p_intake_session_id)) then
    raise exception 'offroad_mandate_decision_forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = p_organization_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role in ('owner', 'admin', 'compliance')
  ) then raise exception 'offroad_mandate_decider_role_required' using errcode = '42501'; end if;
  insert into public.offroad_mandate_decisions (
    organization_id, intake_session_id, assessment_fingerprint, decision,
    reason_codes, conditions, path_back, decided_by
  ) values (
    p_organization_id, p_intake_session_id, p_assessment_fingerprint, p_decision,
    p_reason_codes, p_conditions, p_path_back, (select auth.uid())
  ) returning id into decision_id;
  return decision_id;
end;
$$;

create function private.record_decline_communication(
  p_organization_id uuid,
  p_intake_session_id uuid,
  p_mandate_decision_id uuid,
  p_mandate_decision_fingerprint text,
  p_channel text,
  p_recipient text,
  p_message_fingerprint text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare communication_id uuid;
begin
  if not (select private.can_access_intake_session(p_organization_id, p_intake_session_id)) then
    raise exception 'decline_communication_forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = p_organization_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role in ('owner', 'admin', 'relationship_manager', 'compliance')
  ) then raise exception 'decline_communicator_role_required' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.offroad_mandate_decisions decision_record
    where decision_record.organization_id = p_organization_id
      and decision_record.intake_session_id = p_intake_session_id
      and decision_record.id = p_mandate_decision_id
      and decision_record.decision = 'decline'
  ) then raise exception 'current_decline_decision_required' using errcode = '22023'; end if;
  insert into public.decline_communications (
    organization_id, intake_session_id, mandate_decision_id,
    mandate_decision_fingerprint, channel, recipient, message_fingerprint, sent_by
  ) values (
    p_organization_id, p_intake_session_id, p_mandate_decision_id,
    p_mandate_decision_fingerprint, p_channel, p_recipient, p_message_fingerprint, (select auth.uid())
  ) returning id into communication_id;
  return communication_id;
end;
$$;

revoke all on function private.review_case_red_flag(uuid, uuid, text, text, text, text, jsonb) from public, anon;
revoke all on function private.decide_offroad_mandate(uuid, uuid, text, text, jsonb, jsonb, text) from public, anon;
revoke all on function private.record_decline_communication(uuid, uuid, uuid, text, text, text, text) from public, anon;
grant execute on function private.review_case_red_flag(uuid, uuid, text, text, text, text, jsonb) to authenticated;
grant execute on function private.decide_offroad_mandate(uuid, uuid, text, text, jsonb, jsonb, text) to authenticated;
grant execute on function private.record_decline_communication(uuid, uuid, uuid, text, text, text, text) to authenticated;

create function public.review_case_red_flag(
  p_organization_id uuid, p_intake_session_id uuid, p_flag_id text,
  p_flag_fingerprint text, p_decision text, p_rationale text,
  p_evidence_ids jsonb default '[]'::jsonb
)
returns uuid language sql security invoker set search_path = '' as $$
  select private.review_case_red_flag(
    p_organization_id, p_intake_session_id, p_flag_id, p_flag_fingerprint,
    p_decision, p_rationale, p_evidence_ids
  );
$$;
create function public.decide_offroad_mandate(
  p_organization_id uuid, p_intake_session_id uuid, p_assessment_fingerprint text,
  p_decision text, p_reason_codes jsonb default '[]'::jsonb,
  p_conditions jsonb default '[]'::jsonb, p_path_back text default null
)
returns uuid language sql security invoker set search_path = '' as $$
  select private.decide_offroad_mandate(
    p_organization_id, p_intake_session_id, p_assessment_fingerprint,
    p_decision, p_reason_codes, p_conditions, p_path_back
  );
$$;
create function public.record_decline_communication(
  p_organization_id uuid, p_intake_session_id uuid, p_mandate_decision_id uuid,
  p_mandate_decision_fingerprint text, p_channel text, p_recipient text,
  p_message_fingerprint text
)
returns uuid language sql security invoker set search_path = '' as $$
  select private.record_decline_communication(
    p_organization_id, p_intake_session_id, p_mandate_decision_id,
    p_mandate_decision_fingerprint, p_channel, p_recipient, p_message_fingerprint
  );
$$;

revoke all on function public.review_case_red_flag(uuid, uuid, text, text, text, text, jsonb) from public, anon;
revoke all on function public.decide_offroad_mandate(uuid, uuid, text, text, jsonb, jsonb, text) from public, anon;
revoke all on function public.record_decline_communication(uuid, uuid, uuid, text, text, text, text) from public, anon;
grant execute on function public.review_case_red_flag(uuid, uuid, text, text, text, text, jsonb) to authenticated;
grant execute on function public.decide_offroad_mandate(uuid, uuid, text, text, jsonb, jsonb, text) to authenticated;
grant execute on function public.record_decline_communication(uuid, uuid, uuid, text, text, text, text) to authenticated;

create or replace function private.worker_load_red_flag_context(
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
  policy public.red_flag_policies;
  review_payload jsonb := '[]'::jsonb;
  decision_record public.offroad_mandate_decisions;
  communication_record public.decline_communications;
begin
  if job_row.kind <> 'case_analysis' then
    raise exception 'case_analysis_capability_required' using errcode = '42501';
  end if;
  select * into policy from public.red_flag_policies row
  where row.status in ('active', 'invalidated')
    and row.valid_from <= current_date
    and (row.valid_until is null or row.valid_until >= current_date)
  order by row.valid_from desc, case row.status when 'invalidated' then 0 else 1 end
  limit 1;
  if not found then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'flagId', review.flag_id,
    'flagFingerprint', review.flag_fingerprint,
    'decision', review.decision,
    'rationale', review.rationale,
    'evidenceIds', review.evidence_ids,
    'decidedBy', review.decided_by::text,
    'decidedAt', review.decided_at
  ) order by review.flag_id), '[]'::jsonb)
  into review_payload
  from (
    select distinct on (entry.flag_id) entry.*
    from public.case_red_flag_reviews entry
    where entry.organization_id = job_row.organization_id
      and entry.intake_session_id = job_row.intake_session_id
    order by entry.flag_id, entry.decided_at desc, entry.id desc
  ) review;

  select * into decision_record from public.offroad_mandate_decisions row
  where row.organization_id = job_row.organization_id
    and row.intake_session_id = job_row.intake_session_id
  order by row.decided_at desc, row.id desc limit 1;

  if decision_record.id is not null then
    select * into communication_record from public.decline_communications row
    where row.organization_id = decision_record.organization_id
      and row.intake_session_id = decision_record.intake_session_id
      and row.mandate_decision_id = decision_record.id
    order by row.sent_at desc, row.id desc limit 1;
  end if;

  return jsonb_build_object(
    'policy', jsonb_build_object(
      'version', policy.version,
      'status', policy.status,
      'validFrom', policy.valid_from,
      'validUntil', policy.valid_until,
      'thresholds', policy.thresholds,
      'materiality', policy.materiality,
      'responseSla', policy.response_sla
    ),
    'reviews', review_payload,
    'mandateDecision', case when decision_record.id is null then null else jsonb_build_object(
      'id', decision_record.id::text,
      'assessmentFingerprint', decision_record.assessment_fingerprint,
      'decision', decision_record.decision,
      'reasonCodes', decision_record.reason_codes,
      'conditions', decision_record.conditions,
      'pathBack', decision_record.path_back,
      'decidedBy', decision_record.decided_by::text,
      'decidedAt', decision_record.decided_at
    ) end,
    'declineCommunication', case when communication_record.id is null then null else jsonb_build_object(
      'mandateDecisionFingerprint', communication_record.mandate_decision_fingerprint,
      'channel', communication_record.channel,
      'recipient', communication_record.recipient,
      'sentBy', communication_record.sent_by::text,
      'sentAt', communication_record.sent_at,
      'messageFingerprint', communication_record.message_fingerprint
    ) end
  );
end;
$$;

create or replace function public.worker_load_case_input(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_load_case_input(p_job_id, p_capability_token)
    || jsonb_build_object('pricing_context', private.worker_load_pricing_context(p_job_id, p_capability_token))
    || jsonb_build_object('market_distribution_context', private.worker_load_market_distribution_context(p_job_id, p_capability_token))
    || jsonb_build_object('red_flag_context', private.worker_load_red_flag_context(p_job_id, p_capability_token));
$$;

revoke all on function private.worker_load_red_flag_context(uuid, text) from public, anon;
revoke all on function public.worker_load_case_input(uuid, text) from public, anon;
grant execute on function private.worker_load_red_flag_context(uuid, text) to authenticated;
grant execute on function public.worker_load_case_input(uuid, text) to authenticated;
