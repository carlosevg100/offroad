-- Resolve an approved market target into a named recipient without broadening the
-- qualified-introduction boundary. Contact resolution is an internal governed operation.
-- The borrower can review the result, but cannot enumerate Offroad's contact directory.

create table public.market_provider_contacts (
  id uuid primary key default gen_random_uuid(),
  fund_directory_id uuid not null references public.fund_directory (id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 2 and 160),
  job_title text,
  email text not null check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  phone text,
  routing_criteria jsonb not null default '{}'::jsonb
    check (jsonb_typeof(routing_criteria) = 'object'),
  source_kind text not null check (source_kind in ('declared', 'conversation', 'published', 'research')),
  source_note text not null check (length(trim(source_note)) between 3 and 1000),
  verified_at timestamptz not null,
  valid_until date,
  is_primary boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  recorded_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until is null or valid_until >= verified_at::date)
);

create unique index market_provider_contacts_fund_email_idx
  on public.market_provider_contacts (fund_directory_id, lower(email));
create index market_provider_contacts_routing_idx
  on public.market_provider_contacts (fund_directory_id, status, is_primary desc, verified_at desc);
create index market_provider_contacts_recorded_by_idx
  on public.market_provider_contacts (recorded_by)
  where recorded_by is not null;

create trigger market_provider_contacts_set_updated_at
before update on public.market_provider_contacts
for each row execute function private.set_updated_at();

alter table public.market_provider_contacts enable row level security;
alter table public.market_provider_contacts force row level security;
create policy market_provider_contacts_service_only
on public.market_provider_contacts
for all to service_role
using (true)
with check (true);
revoke all on public.market_provider_contacts from public, anon, authenticated;
grant select, insert, update, delete on public.market_provider_contacts to service_role;

comment on table public.market_provider_contacts is
  'Private, sourced and dated Offroad routing contacts for unregistered market-directory providers.';

alter table public.qualified_introduction_targets
  add column resolved_contact_source text
    check (resolved_contact_source is null or resolved_contact_source in ('directory_market', 'registered_provider')),
  add column resolved_contact_id uuid,
  add column resolved_contact_name text,
  add column resolved_contact_job_title text,
  add column resolved_contact_email text,
  add column resolved_at timestamptz,
  add column resolution_note text,
  add constraint qualified_introduction_targets_resolution_complete check (
    (
      contact_status = 'unresolved'
      and resolved_contact_source is null
      and resolved_contact_id is null
      and resolved_contact_name is null
      and resolved_contact_email is null
      and resolved_at is null
    )
    or (
      contact_status = 'unavailable'
      and resolved_contact_source is null
      and resolved_contact_id is null
      and resolved_contact_name is null
      and resolved_contact_email is null
      and resolved_at is not null
      and length(trim(resolution_note)) >= 3
    )
    or (
      contact_status = 'resolved'
      and resolved_contact_source is not null
      and resolved_contact_id is not null
      and length(trim(resolved_contact_name)) >= 2
      and resolved_contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
      and resolved_at is not null
    )
  ),
  add constraint qualified_introduction_targets_resolution_source check (
    resolved_contact_source is null
    or (provider_source = 'directory' and resolved_contact_source = 'directory_market')
    or (provider_source = 'registered' and resolved_contact_source = 'registered_provider')
  );

alter table public.qualified_introduction_recipients
  drop constraint qualified_introduction_recipi_organization_id_plan_id_fund__key,
  alter column fund_directory_id drop not null,
  add column target_id uuid,
  add column provider_source text not null default 'directory'
    check (provider_source in ('directory', 'registered')),
  add column provider_id uuid,
  add column provider_organization_id uuid,
  add column provider_fund_id uuid,
  add column contact_source text
    check (contact_source in ('directory_market', 'registered_provider')),
  add column contact_uuid uuid,
  add column contact_email text,
  add column contact_job_title text,
  add constraint qualified_introduction_recipients_target_fk
    foreign key (organization_id, target_id)
    references public.qualified_introduction_targets (organization_id, id) on delete cascade,
  add constraint qualified_introduction_recipients_registered_fund_fk
    foreign key (provider_organization_id, provider_fund_id)
    references public.funds (organization_id, id),
  add constraint qualified_introduction_recipients_provider_identity check (
    (provider_source = 'directory'
      and fund_directory_id = provider_id
      and provider_organization_id is null
      and provider_fund_id is null
      and contact_source = 'directory_market')
    or
    (provider_source = 'registered'
      and fund_directory_id is null
      and provider_organization_id is not null
      and provider_fund_id = provider_id
      and contact_source = 'registered_provider')
  ),
  add constraint qualified_introduction_recipients_contact_complete check (
    contact_uuid is null
    or (
      contact_id = contact_uuid::text
      and contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    )
  );

update public.qualified_introduction_recipients
set provider_id = fund_directory_id,
    contact_source = 'directory_market'
where provider_id is null;

alter table public.qualified_introduction_recipients
  alter column provider_id set not null,
  alter column contact_source set not null;

create unique index qualified_introduction_recipients_target_idx
  on public.qualified_introduction_recipients (organization_id, target_id)
  where target_id is not null;
create unique index qualified_introduction_recipients_provider_idx
  on public.qualified_introduction_recipients (organization_id, plan_id, provider_source, provider_id);
create index qualified_introduction_recipients_registered_provider_idx
  on public.qualified_introduction_recipients (provider_organization_id, provider_fund_id)
  where provider_fund_id is not null;
create index qualified_introduction_recipients_contact_uuid_idx
  on public.qualified_introduction_recipients (contact_uuid);

alter table public.qualified_introductions
  alter column fund_directory_id drop not null,
  add column provider_source text not null default 'directory'
    check (provider_source in ('directory', 'registered')),
  add column provider_id uuid,
  add column provider_organization_id uuid,
  add column provider_fund_id uuid,
  add column contact_source text,
  add column contact_uuid uuid,
  add column contact_name text,
  add column contact_email text,
  add column contact_job_title text,
  add constraint qualified_introductions_registered_fund_fk
    foreign key (provider_organization_id, provider_fund_id)
    references public.funds (organization_id, id),
  add constraint qualified_introductions_provider_identity check (
    (provider_source = 'directory'
      and fund_directory_id = provider_id
      and provider_organization_id is null
      and provider_fund_id is null
      and contact_source = 'directory_market')
    or
    (provider_source = 'registered'
      and fund_directory_id is null
      and provider_organization_id is not null
      and provider_fund_id = provider_id
      and contact_source = 'registered_provider')
  ),
  add constraint qualified_introductions_contact_complete check (
    contact_uuid is null
    or (
      contact_id = contact_uuid::text
      and length(trim(contact_name)) >= 2
      and contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    )
  );

update public.qualified_introductions
set provider_id = fund_directory_id,
    contact_source = 'directory_market'
where provider_id is null;

alter table public.qualified_introductions
  alter column provider_id set not null,
  alter column contact_source set not null;

create index qualified_introductions_registered_provider_idx
  on public.qualified_introductions (provider_organization_id, provider_fund_id)
  where provider_fund_id is not null;
create index qualified_introductions_contact_uuid_idx
  on public.qualified_introductions (contact_uuid);

create function private.resolve_qualified_introduction_target(
  p_target_id uuid,
  p_contact_source text,
  p_contact_id uuid,
  p_material_manifest jsonb,
  p_is_anchor boolean default false,
  p_resolution_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.qualified_introduction_targets;
  plan public.qualified_introduction_plans;
  directory_contact public.market_provider_contacts;
  registered_contact public.provider_contacts;
  contact_name text;
  contact_title text;
  contact_email text;
  recipient_id uuid;
begin
  select row.* into target
  from public.qualified_introduction_targets row
  where row.id = p_target_id
  for update;
  if not found then
    raise exception 'qualified_introduction_target_not_found' using errcode = 'P0002';
  end if;

  select row.* into plan
  from public.qualified_introduction_plans row
  where row.organization_id = target.organization_id and row.id = target.plan_id
  for update;
  if plan.status <> 'draft' then
    raise exception 'draft_qualified_introduction_plan_required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_material_manifest) <> 'array' or jsonb_array_length(p_material_manifest) = 0 then
    raise exception 'qualified_introduction_material_manifest_required' using errcode = '22023';
  end if;

  if target.provider_source = 'directory' then
    if p_contact_source <> 'directory_market' then
      raise exception 'directory_market_contact_required' using errcode = '22023';
    end if;
    select row.* into directory_contact
    from public.market_provider_contacts row
    where row.id = p_contact_id
      and row.fund_directory_id = target.fund_directory_id
      and row.status = 'active'
      and (row.valid_until is null or row.valid_until >= current_date)
    for share;
    if not found then
      raise exception 'current_directory_contact_not_found' using errcode = 'P0002';
    end if;
    contact_name := directory_contact.full_name;
    contact_title := directory_contact.job_title;
    contact_email := directory_contact.email;
  else
    if p_contact_source <> 'registered_provider' then
      raise exception 'registered_provider_contact_required' using errcode = '22023';
    end if;
    select row.* into registered_contact
    from public.provider_contacts row
    where row.id = p_contact_id
      and row.organization_id = target.provider_organization_id
      and row.fund_id = target.provider_fund_id
      and row.status = 'active'
    for share;
    if not found then
      raise exception 'current_registered_contact_not_found' using errcode = 'P0002';
    end if;
    contact_name := registered_contact.full_name;
    contact_title := registered_contact.job_title;
    contact_email := registered_contact.email;
  end if;

  insert into public.qualified_introduction_recipients (
    organization_id,
    intake_session_id,
    plan_id,
    target_id,
    provider_source,
    provider_id,
    fund_directory_id,
    provider_organization_id,
    provider_fund_id,
    recipient_name,
    contact_source,
    contact_uuid,
    contact_id,
    contact_name,
    contact_email,
    contact_job_title,
    mandate_fingerprint,
    rationale,
    material_manifest,
    position,
    is_anchor
  ) values (
    target.organization_id,
    target.intake_session_id,
    target.plan_id,
    target.id,
    target.provider_source,
    target.provider_id,
    target.fund_directory_id,
    target.provider_organization_id,
    target.provider_fund_id,
    target.provider_name,
    p_contact_source,
    p_contact_id,
    p_contact_id::text,
    contact_name,
    contact_email,
    contact_title,
    target.mandate_fingerprint,
    target.rationale,
    p_material_manifest,
    target.position,
    p_is_anchor
  )
  on conflict (organization_id, target_id) where target_id is not null
  do update set
    contact_source = excluded.contact_source,
    contact_uuid = excluded.contact_uuid,
    contact_id = excluded.contact_id,
    contact_name = excluded.contact_name,
    contact_email = excluded.contact_email,
    contact_job_title = excluded.contact_job_title,
    material_manifest = excluded.material_manifest,
    is_anchor = excluded.is_anchor
  returning id into recipient_id;

  update public.qualified_introduction_targets
  set contact_status = 'resolved',
      resolved_contact_source = p_contact_source,
      resolved_contact_id = p_contact_id,
      resolved_contact_name = contact_name,
      resolved_contact_job_title = contact_title,
      resolved_contact_email = contact_email,
      resolved_at = now(),
      resolution_note = nullif(trim(p_resolution_note), '')
  where organization_id = target.organization_id and id = target.id;

  return recipient_id;
end;
$$;

create function private.mark_qualified_introduction_target_unavailable(
  p_target_id uuid,
  p_resolution_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.qualified_introduction_targets;
  plan_status text;
begin
  if length(trim(p_resolution_note)) < 3 then
    raise exception 'contact_resolution_note_required' using errcode = '22023';
  end if;
  select row.* into target
  from public.qualified_introduction_targets row
  where row.id = p_target_id
  for update;
  if not found then
    raise exception 'qualified_introduction_target_not_found' using errcode = 'P0002';
  end if;
  select status into plan_status
  from public.qualified_introduction_plans
  where organization_id = target.organization_id and id = target.plan_id
  for update;
  if plan_status <> 'draft' then
    raise exception 'draft_qualified_introduction_plan_required' using errcode = '22023';
  end if;
  delete from public.qualified_introduction_recipients
  where organization_id = target.organization_id and target_id = target.id;
  update public.qualified_introduction_targets
  set contact_status = 'unavailable',
      resolved_contact_source = null,
      resolved_contact_id = null,
      resolved_contact_name = null,
      resolved_contact_job_title = null,
      resolved_contact_email = null,
      resolved_at = now(),
      resolution_note = trim(p_resolution_note)
  where organization_id = target.organization_id and id = target.id;
  return target.id;
end;
$$;

revoke all on function private.resolve_qualified_introduction_target(uuid, text, uuid, jsonb, boolean, text)
  from public, anon, authenticated;
revoke all on function private.mark_qualified_introduction_target_unavailable(uuid, text)
  from public, anon, authenticated;
grant execute on function private.resolve_qualified_introduction_target(uuid, text, uuid, jsonb, boolean, text)
  to service_role;
grant execute on function private.mark_qualified_introduction_target_unavailable(uuid, text)
  to service_role;

comment on function private.resolve_qualified_introduction_target(uuid, text, uuid, jsonb, boolean, text) is
  'Service-only resolution of one approved target to one current, named contact and exact material manifest. It does not authorize or send anything.';
