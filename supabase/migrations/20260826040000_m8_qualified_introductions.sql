-- M8 ends at a qualified introduction. This schema deliberately does not model NDA,
-- diligence, indications, a book, allocation, documentation, funding or closing.

create table public.market_distribution_policies (
  id uuid primary key default gen_random_uuid(),
  version text not null unique check (length(trim(version)) between 3 and 120),
  status text not null default 'draft' check (status in ('draft', 'active', 'superseded', 'invalidated')),
  valid_from date not null,
  valid_until date,
  mandate_max_age_months integer not null check (mandate_max_age_months between 1 and 24),
  wave_limit integer not null check (wave_limit between 1 and 20),
  learning_gate_anchor_count integer not null default 2 check (learning_gate_anchor_count between 1 and wave_limit),
  methodology_source text not null check (length(trim(methodology_source)) between 10 and 500),
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until is null or valid_until >= valid_from),
  check (status <> 'active' or (approved_by is not null and approved_at is not null))
);
create unique index market_distribution_policies_one_active_idx on public.market_distribution_policies (status) where status = 'active';
create trigger market_distribution_policies_set_updated_at before update on public.market_distribution_policies
  for each row execute function private.set_updated_at();
alter table public.market_distribution_policies enable row level security;
alter table public.market_distribution_policies force row level security;
revoke all on public.market_distribution_policies from public, anon, authenticated;
grant select, insert, update, delete on public.market_distribution_policies to service_role;

create table public.qualified_introduction_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  intake_session_id uuid not null,
  case_fingerprint text not null check (case_fingerprint ~ '^[0-9a-f]{64}$'),
  material_fingerprint text not null check (material_fingerprint ~ '^[0-9a-f]{64}$'),
  wave_limit integer not null check (wave_limit between 1 and 20),
  status text not null default 'draft' check (status in ('draft', 'authorized', 'revoked')),
  technical_review_fingerprint text check (technical_review_fingerprint is null or technical_review_fingerprint ~ '^[0-9a-f]{64}$'),
  technical_reviewed_by uuid references auth.users (id),
  technical_reviewed_at timestamptz,
  authorized_by uuid references auth.users (id),
  authorized_at timestamptz,
  revoked_by uuid references auth.users (id),
  revoked_at timestamptz,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions (organization_id, id) on delete cascade,
  check ((status = 'authorized') = (authorized_by is not null and authorized_at is not null)),
  check ((status = 'revoked') = (revoked_by is not null and revoked_at is not null)),
  check ((technical_reviewed_by is null and technical_reviewed_at is null and technical_review_fingerprint is null)
    or (technical_reviewed_by is not null and technical_reviewed_at is not null and technical_review_fingerprint is not null))
);

create table public.qualified_introduction_recipients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  intake_session_id uuid not null,
  plan_id uuid not null,
  fund_directory_id uuid not null references public.fund_directory (id),
  recipient_name text not null check (length(trim(recipient_name)) between 2 and 200),
  contact_id text not null check (length(trim(contact_id)) between 2 and 200),
  contact_name text not null check (length(trim(contact_name)) between 2 and 200),
  mandate_fingerprint text not null check (mandate_fingerprint ~ '^[0-9a-f]{64}$'),
  rationale text not null check (length(trim(rationale)) between 20 and 2000),
  material_manifest jsonb not null check (jsonb_typeof(material_manifest) = 'array' and jsonb_array_length(material_manifest) > 0),
  position integer not null check (position > 0),
  is_anchor boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, plan_id, fund_directory_id),
  unique (organization_id, plan_id, position),
  foreign key (organization_id, plan_id)
    references public.qualified_introduction_plans (organization_id, id) on delete cascade,
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions (organization_id, id) on delete cascade
);

-- Append-only evidence that the current, authorized package was introduced to one named contact.
create table public.qualified_introductions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  intake_session_id uuid not null,
  plan_id uuid not null,
  recipient_id uuid not null,
  fund_directory_id uuid not null references public.fund_directory (id),
  contact_id text not null,
  case_fingerprint text not null check (case_fingerprint ~ '^[0-9a-f]{64}$'),
  material_fingerprint text not null check (material_fingerprint ~ '^[0-9a-f]{64}$'),
  mandate_fingerprint text not null check (mandate_fingerprint ~ '^[0-9a-f]{64}$'),
  rationale text not null,
  material_manifest jsonb not null check (jsonb_typeof(material_manifest) = 'array' and jsonb_array_length(material_manifest) > 0),
  authorization_snapshot jsonb not null check (jsonb_typeof(authorization_snapshot) = 'object'),
  introduced_by uuid not null references auth.users (id),
  introduced_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, recipient_id),
  foreign key (organization_id, plan_id)
    references public.qualified_introduction_plans (organization_id, id),
  foreign key (organization_id, recipient_id)
    references public.qualified_introduction_recipients (organization_id, id),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions (organization_id, id) on delete cascade
);

create index qualified_introduction_plans_session_idx on public.qualified_introduction_plans (organization_id, intake_session_id, created_at desc);
create index qualified_introduction_recipients_plan_idx on public.qualified_introduction_recipients (organization_id, plan_id, position);
create index qualified_introductions_session_idx on public.qualified_introductions (organization_id, intake_session_id, introduced_at);

create trigger qualified_introduction_plans_set_updated_at before update on public.qualified_introduction_plans
  for each row execute function private.set_updated_at();
create trigger qualified_introduction_plans_audit after insert or update or delete on public.qualified_introduction_plans
  for each row execute function private.capture_audit_event();
create trigger qualified_introduction_recipients_audit after insert or update or delete on public.qualified_introduction_recipients
  for each row execute function private.capture_audit_event();
create trigger qualified_introductions_audit after insert or update or delete on public.qualified_introductions
  for each row execute function private.capture_audit_event();

alter table public.qualified_introduction_plans enable row level security;
alter table public.qualified_introduction_plans force row level security;
alter table public.qualified_introduction_recipients enable row level security;
alter table public.qualified_introduction_recipients force row level security;
alter table public.qualified_introductions enable row level security;
alter table public.qualified_introductions force row level security;

create policy qualified_introduction_plans_select on public.qualified_introduction_plans for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));
create policy qualified_introduction_recipients_select on public.qualified_introduction_recipients for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));
create policy qualified_introductions_select on public.qualified_introductions for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));

revoke all on public.qualified_introduction_plans from public, anon, authenticated;
revoke all on public.qualified_introduction_recipients from public, anon, authenticated;
revoke all on public.qualified_introductions from public, anon, authenticated;
grant select on public.qualified_introduction_plans to authenticated;
grant select on public.qualified_introduction_recipients to authenticated;
grant select on public.qualified_introductions to authenticated;

create or replace function private.attest_qualified_introduction_plan_technical_review(
  p_plan_id uuid,
  p_material_fingerprint text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare plan public.qualified_introduction_plans;
begin
  select * into plan from public.qualified_introduction_plans row where row.id = p_plan_id for update;
  if not found then raise exception 'qualified_introduction_plan_not_found' using errcode = 'P0002'; end if;
  if not (select private.can_access_intake_session(plan.organization_id, plan.intake_session_id)) then
    raise exception 'qualified_introduction_plan_forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = plan.organization_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role in ('owner', 'admin')
  ) then raise exception 'qualified_introduction_reviewer_role_required' using errcode = '42501'; end if;
  if plan.status <> 'draft' then raise exception 'draft_qualified_introduction_plan_required' using errcode = '22023'; end if;
  if p_material_fingerprint is distinct from plan.material_fingerprint then
    raise exception 'qualified_introduction_material_fingerprint_changed' using errcode = '22023';
  end if;
  update public.qualified_introduction_plans
  set technical_review_fingerprint = p_material_fingerprint,
      technical_reviewed_by = (select auth.uid()),
      technical_reviewed_at = now()
  where id = plan.id;
  return plan.id;
end;
$$;

create or replace function private.authorize_qualified_introduction_plan(
  p_plan_id uuid,
  p_material_fingerprint text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan public.qualified_introduction_plans;
  recipient_count integer;
begin
  select * into plan from public.qualified_introduction_plans row where row.id = p_plan_id for update;
  if not found then raise exception 'qualified_introduction_plan_not_found' using errcode = 'P0002'; end if;
  if not (select private.can_access_intake_session(plan.organization_id, plan.intake_session_id)) then
    raise exception 'qualified_introduction_plan_forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = plan.organization_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role in ('owner', 'admin')
  ) then raise exception 'qualified_introduction_authorizer_role_required' using errcode = '42501'; end if;
  if plan.status <> 'draft' then raise exception 'draft_qualified_introduction_plan_required' using errcode = '22023'; end if;
  if p_material_fingerprint is distinct from plan.material_fingerprint then
    raise exception 'qualified_introduction_material_fingerprint_changed' using errcode = '22023';
  end if;
  if plan.technical_reviewed_by is null
    or plan.technical_reviewed_at is null
    or plan.technical_review_fingerprint is distinct from plan.material_fingerprint then
    raise exception 'qualified_introduction_technical_review_required' using errcode = '22023';
  end if;
  select count(*) into recipient_count from public.qualified_introduction_recipients recipient
  where recipient.organization_id = plan.organization_id and recipient.plan_id = plan.id;
  if recipient_count = 0 or recipient_count > plan.wave_limit then
    raise exception 'qualified_introduction_wave_invalid' using errcode = '22023';
  end if;
  update public.qualified_introduction_plans
  set status = 'authorized', authorized_by = (select auth.uid()), authorized_at = now()
  where id = plan.id;
  return plan.id;
end;
$$;

create or replace function private.revoke_qualified_introduction_plan(p_plan_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare plan public.qualified_introduction_plans;
begin
  select * into plan from public.qualified_introduction_plans row where row.id = p_plan_id for update;
  if not found then raise exception 'qualified_introduction_plan_not_found' using errcode = 'P0002'; end if;
  if not (select private.can_access_intake_session(plan.organization_id, plan.intake_session_id)) then
    raise exception 'qualified_introduction_plan_forbidden' using errcode = '42501';
  end if;
  if plan.status <> 'authorized' or exists (
    select 1 from public.qualified_introductions introduction
    where introduction.organization_id = plan.organization_id and introduction.plan_id = plan.id
  ) then raise exception 'qualified_introduction_plan_cannot_be_revoked' using errcode = '22023'; end if;
  update public.qualified_introduction_plans
  set status = 'revoked', authorized_by = null, authorized_at = null,
      revoked_by = (select auth.uid()), revoked_at = now()
  where id = plan.id;
  return plan.id;
end;
$$;

revoke all on function private.attest_qualified_introduction_plan_technical_review(uuid, text) from public, anon;
revoke all on function private.authorize_qualified_introduction_plan(uuid, text) from public, anon;
revoke all on function private.revoke_qualified_introduction_plan(uuid) from public, anon;
grant execute on function private.attest_qualified_introduction_plan_technical_review(uuid, text) to authenticated;
grant execute on function private.authorize_qualified_introduction_plan(uuid, text) to authenticated;
grant execute on function private.revoke_qualified_introduction_plan(uuid) to authenticated;

create function public.attest_qualified_introduction_plan_technical_review(p_plan_id uuid, p_material_fingerprint text)
returns uuid language sql security invoker set search_path = '' as $$
  select private.attest_qualified_introduction_plan_technical_review(p_plan_id, p_material_fingerprint);
$$;
create function public.authorize_qualified_introduction_plan(p_plan_id uuid, p_material_fingerprint text)
returns uuid language sql security invoker set search_path = '' as $$
  select private.authorize_qualified_introduction_plan(p_plan_id, p_material_fingerprint);
$$;
create function public.revoke_qualified_introduction_plan(p_plan_id uuid)
returns uuid language sql security invoker set search_path = '' as $$
  select private.revoke_qualified_introduction_plan(p_plan_id);
$$;

revoke all on function public.attest_qualified_introduction_plan_technical_review(uuid, text) from public, anon;
revoke all on function public.authorize_qualified_introduction_plan(uuid, text) from public, anon;
revoke all on function public.revoke_qualified_introduction_plan(uuid) from public, anon;
grant execute on function public.attest_qualified_introduction_plan_technical_review(uuid, text) to authenticated;
grant execute on function public.authorize_qualified_introduction_plan(uuid, text) to authenticated;
grant execute on function public.revoke_qualified_introduction_plan(uuid) to authenticated;

create or replace function private.worker_load_market_distribution_context(
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
  policy public.market_distribution_policies;
  plan public.qualified_introduction_plans;
  recipient_payload jsonb := '[]'::jsonb;
  introduction_payload jsonb := '[]'::jsonb;
  recipient_ids jsonb := '[]'::jsonb;
begin
  if job_row.kind <> 'case_analysis' then
    raise exception 'case_analysis_capability_required' using errcode = '42501';
  end if;
  select * into policy from public.market_distribution_policies row
  where row.status in ('active', 'invalidated')
    and row.valid_from <= current_date
    and (row.valid_until is null or row.valid_until >= current_date)
  order by row.valid_from desc, case row.status when 'invalidated' then 0 else 1 end
  limit 1;
  if not found then return null; end if;
  select * into plan from public.qualified_introduction_plans row
  where row.organization_id = job_row.organization_id
    and row.intake_session_id = job_row.intake_session_id
    and row.status in ('draft', 'authorized')
  order by case row.status when 'authorized' then 0 else 1 end, row.updated_at desc
  limit 1;
  if found then
    select coalesce(jsonb_agg(jsonb_build_object(
      'fundId', recipient.fund_directory_id::text,
      'contactId', recipient.contact_id,
      'rationale', recipient.rationale,
      'materialKinds', recipient.material_manifest,
      'materialFingerprint', plan.material_fingerprint,
      'mandateFingerprint', recipient.mandate_fingerprint,
      'order', recipient.position,
      'anchor', recipient.is_anchor
    ) order by recipient.position), '[]'::jsonb),
    coalesce(jsonb_agg(to_jsonb(recipient.fund_directory_id::text) order by recipient.position), '[]'::jsonb)
    into recipient_payload, recipient_ids
    from public.qualified_introduction_recipients recipient
    where recipient.organization_id = plan.organization_id and recipient.plan_id = plan.id;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', introduction.id::text,
      'fundId', introduction.fund_directory_id::text,
      'contactId', introduction.contact_id,
      'materialFingerprint', introduction.material_fingerprint,
      'authorizationId', introduction.plan_id::text,
      'introducedBy', introduction.introduced_by::text,
      'introducedAt', introduction.introduced_at
    ) order by introduction.introduced_at), '[]'::jsonb)
    into introduction_payload
    from public.qualified_introductions introduction
    where introduction.organization_id = plan.organization_id and introduction.plan_id = plan.id;
  end if;
  return jsonb_build_object(
    'version', policy.version,
    'status', policy.status,
    'mandateMaxAgeMonths', policy.mandate_max_age_months,
    'waveLimit', policy.wave_limit,
    'learningGateAnchorCount', policy.learning_gate_anchor_count,
    'recipients', recipient_payload,
    'authorization', case when plan.id is not null and plan.status = 'authorized' then jsonb_build_object(
      'id', plan.id::text,
      'caseFingerprint', plan.case_fingerprint,
      'materialFingerprint', plan.material_fingerprint,
      'authorizedBy', plan.authorized_by::text,
      'authorizedAt', plan.authorized_at,
      'recipientIds', recipient_ids,
      'scope', jsonb_build_array('qualified_introduction'),
      'revokedAt', plan.revoked_at
    ) else null end,
    'introductions', introduction_payload,
    'materialRelease', jsonb_build_object(
      'technicalReview', jsonb_build_object(
        'approved', plan.technical_reviewed_by is not null,
        'fingerprint', plan.technical_review_fingerprint,
        'reviewedBy', plan.technical_reviewed_by::text,
        'reviewedAt', plan.technical_reviewed_at
      ),
      'companyAuthorization', jsonb_build_object(
        'authorized', plan.id is not null and plan.status = 'authorized',
        'fingerprint', case when plan.status = 'authorized' then plan.material_fingerprint else null end,
        'scope', case when plan.status = 'authorized' then jsonb_build_array('qualified_introduction') else '[]'::jsonb end,
        'recipientIds', case when plan.status = 'authorized' then recipient_ids else '[]'::jsonb end
      )
    )
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
    || jsonb_build_object('market_distribution_context', private.worker_load_market_distribution_context(p_job_id, p_capability_token));
$$;

revoke all on function private.worker_load_market_distribution_context(uuid, text) from public, anon;
revoke all on function public.worker_load_case_input(uuid, text) from public, anon;
grant execute on function private.worker_load_market_distribution_context(uuid, text) to authenticated;
grant execute on function public.worker_load_case_input(uuid, text) to authenticated;
