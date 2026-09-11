-- Making a pack revision available to named recipient organizations inside the product.
-- Nothing leaves Offroad here: there is no e-mail, no message and no external call. A share is
-- an in-product permission plus the record of who authorized it, on what basis, for which exact
-- pack revision, under which identity policy and inside the wave limit of the active market
-- distribution policy. A recipient organization never receives select privileges on the issuer's
-- pack tables; it reads a projection that logs every read and hides identity under a blind policy.

create table public.pack_distribution_authorizations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  intake_session_id uuid not null,
  capital_project_id uuid not null,
  pack_revision_id uuid not null,
  pack_fingerprint text not null check (pack_fingerprint ~ '^[0-9a-f]{64}$'),
  identity_policy text not null check (identity_policy in ('identified_restricted', 'blind_initial')),
  wave_limit integer not null check (wave_limit between 1 and 20),
  policy_version text not null check (length(trim(policy_version)) between 3 and 120),
  consent_basis text not null check (consent_basis in ('company_officer', 'advisor_representation')),
  consent_statement text not null check (length(trim(consent_statement)) between 20 and 2000),
  consented_by uuid not null references auth.users(id) on delete restrict,
  consented_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'revoked')),
  revoked_by uuid references auth.users(id) on delete restrict,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions(organization_id, id) on delete cascade,
  foreign key (organization_id, capital_project_id)
    references public.capital_projects(organization_id, id) on delete cascade,
  foreign key (organization_id, pack_revision_id)
    references public.information_pack_revisions(organization_id, id) on delete restrict,
  constraint pack_distribution_authorizations_revocation_paired check (
    (status = 'revoked') = (revoked_by is not null and revoked_at is not null)
  )
);

create unique index pack_distribution_authorizations_one_active_idx
  on public.pack_distribution_authorizations (organization_id, intake_session_id, pack_revision_id)
  where status = 'active';
create index pack_distribution_authorizations_session_idx
  on public.pack_distribution_authorizations (organization_id, intake_session_id, created_at desc);
create index pack_distribution_authorizations_project_idx
  on public.pack_distribution_authorizations (organization_id, capital_project_id);
create index pack_distribution_authorizations_revision_idx
  on public.pack_distribution_authorizations (organization_id, pack_revision_id);
create index pack_distribution_authorizations_consented_by_idx
  on public.pack_distribution_authorizations (consented_by);
create index pack_distribution_authorizations_revoked_by_idx
  on public.pack_distribution_authorizations (revoked_by) where revoked_by is not null;

-- A directory entry has no product access. It is recorded so the wave is honest about who was
-- named, and the row itself says that nothing was delivered to it.
create table public.pack_distribution_shares (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  intake_session_id uuid not null,
  authorization_id uuid not null,
  pack_revision_id uuid not null,
  position integer not null check (position between 1 and 20),
  recipient_kind text not null check (recipient_kind in ('registered_organization', 'directory_entry')),
  recipient_organization_id uuid references public.organizations(id) on delete restrict,
  recipient_directory_id uuid references public.fund_directory(id) on delete restrict,
  recipient_label text not null check (length(trim(recipient_label)) between 2 and 200),
  delivery_state text not null check (delivery_state in ('available', 'not_delivered_no_product_access')),
  issuer_identity_disclosed boolean not null,
  issuer_display_name text check (issuer_display_name is null or length(trim(issuer_display_name)) between 2 and 200),
  status text not null default 'active' check (status in ('active', 'revoked')),
  revoked_by uuid references auth.users(id) on delete restrict,
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, authorization_id, position),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions(organization_id, id) on delete cascade,
  foreign key (organization_id, authorization_id)
    references public.pack_distribution_authorizations(organization_id, id) on delete cascade,
  foreign key (organization_id, pack_revision_id)
    references public.information_pack_revisions(organization_id, id) on delete restrict,
  constraint pack_distribution_shares_recipient_shape check (
    (recipient_kind = 'registered_organization'
      and recipient_organization_id is not null
      and recipient_directory_id is null
      and delivery_state = 'available')
    or (recipient_kind = 'directory_entry'
      and recipient_directory_id is not null
      and recipient_organization_id is null
      and delivery_state = 'not_delivered_no_product_access')
  ),
  constraint pack_distribution_shares_identity_paired check (
    issuer_identity_disclosed = (issuer_display_name is not null)
  ),
  constraint pack_distribution_shares_revocation_paired check (
    (status = 'revoked') = (revoked_by is not null and revoked_at is not null)
  ),
  constraint pack_distribution_shares_not_self check (
    recipient_organization_id is null or recipient_organization_id <> organization_id
  )
);

create unique index pack_distribution_shares_organization_idx
  on public.pack_distribution_shares (organization_id, authorization_id, recipient_organization_id)
  where recipient_organization_id is not null;
create unique index pack_distribution_shares_directory_idx
  on public.pack_distribution_shares (organization_id, authorization_id, recipient_directory_id)
  where recipient_directory_id is not null;
create index pack_distribution_shares_recipient_lookup_idx
  on public.pack_distribution_shares (recipient_organization_id, status)
  where recipient_organization_id is not null;
create index pack_distribution_shares_session_idx
  on public.pack_distribution_shares (organization_id, intake_session_id, position);
create index pack_distribution_shares_revision_idx
  on public.pack_distribution_shares (organization_id, pack_revision_id);
create index pack_distribution_shares_directory_fk_idx
  on public.pack_distribution_shares (recipient_directory_id) where recipient_directory_id is not null;
create index pack_distribution_shares_created_by_idx
  on public.pack_distribution_shares (created_by);
create index pack_distribution_shares_revoked_by_idx
  on public.pack_distribution_shares (revoked_by) where revoked_by is not null;

-- Append-only read log: who opened which artifact of which pack revision, and when.
create table public.pack_access_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  intake_session_id uuid not null,
  share_id uuid not null,
  pack_revision_id uuid not null,
  recipient_organization_id uuid not null references public.organizations(id) on delete cascade,
  pack_item_id uuid,
  access_kind text not null check (access_kind in ('pack_opened', 'item_opened')),
  accessed_by uuid not null references auth.users(id) on delete restrict,
  accessed_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions(organization_id, id) on delete cascade,
  foreign key (organization_id, share_id)
    references public.pack_distribution_shares(organization_id, id) on delete cascade,
  foreign key (organization_id, pack_revision_id)
    references public.information_pack_revisions(organization_id, id) on delete cascade,
  foreign key (organization_id, pack_item_id)
    references public.information_pack_items(organization_id, id) on delete cascade,
  constraint pack_access_events_item_paired check (
    (access_kind = 'item_opened') = (pack_item_id is not null)
  )
);

create index pack_access_events_share_idx
  on public.pack_access_events (organization_id, share_id, accessed_at desc);
create index pack_access_events_session_idx
  on public.pack_access_events (organization_id, intake_session_id, accessed_at desc);
create index pack_access_events_recipient_idx
  on public.pack_access_events (recipient_organization_id, accessed_at desc);
create index pack_access_events_revision_idx
  on public.pack_access_events (organization_id, pack_revision_id);
create index pack_access_events_item_idx
  on public.pack_access_events (organization_id, pack_item_id) where pack_item_id is not null;
create index pack_access_events_actor_idx
  on public.pack_access_events (accessed_by);

create trigger pack_distribution_authorizations_set_updated_at
  before update on public.pack_distribution_authorizations
  for each row execute function private.set_updated_at();
create trigger pack_distribution_shares_set_updated_at
  before update on public.pack_distribution_shares
  for each row execute function private.set_updated_at();
create trigger pack_distribution_authorizations_audit
  after insert or update or delete on public.pack_distribution_authorizations
  for each row execute function private.capture_audit_event();
create trigger pack_distribution_shares_audit
  after insert or update or delete on public.pack_distribution_shares
  for each row execute function private.capture_audit_event();
create trigger pack_access_events_audit
  after insert or update or delete on public.pack_access_events
  for each row execute function private.capture_audit_event();

alter table public.pack_distribution_authorizations enable row level security;
alter table public.pack_distribution_authorizations force row level security;
alter table public.pack_distribution_shares enable row level security;
alter table public.pack_distribution_shares force row level security;
alter table public.pack_access_events enable row level security;
alter table public.pack_access_events force row level security;

-- One definer predicate answers "may this person read this share as a recipient?". Policies call
-- it so a recipient never needs select privileges on the issuer's authorization table.
create or replace function private.pack_share_live_for_recipient(p_organization_id uuid, p_share_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.pack_distribution_shares live_share
    join public.pack_distribution_authorizations authorization_row
      on authorization_row.organization_id = live_share.organization_id
     and authorization_row.id = live_share.authorization_id
    join public.organization_memberships membership
      on membership.organization_id = live_share.recipient_organization_id
    where live_share.organization_id = p_organization_id
      and live_share.id = p_share_id
      and live_share.status = 'active'
      and live_share.delivery_state = 'available'
      and authorization_row.status = 'active'
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  );
$$;

revoke all on function private.pack_share_live_for_recipient(uuid, uuid) from public, anon;
grant execute on function private.pack_share_live_for_recipient(uuid, uuid) to authenticated;

create policy pack_distribution_authorizations_select
  on public.pack_distribution_authorizations for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));

create policy pack_distribution_shares_issuer_select
  on public.pack_distribution_shares for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));
create policy pack_distribution_shares_recipient_select
  on public.pack_distribution_shares for select to authenticated
  using ((select private.pack_share_live_for_recipient(organization_id, id)));

create policy pack_access_events_issuer_select
  on public.pack_access_events for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));
create policy pack_access_events_recipient_select
  on public.pack_access_events for select to authenticated
  using ((select private.is_org_member(recipient_organization_id)));

revoke all privileges on public.pack_distribution_authorizations from public, anon, authenticated;
revoke all privileges on public.pack_distribution_shares from public, anon, authenticated;
revoke all privileges on public.pack_access_events from public, anon, authenticated;
grant select on public.pack_distribution_authorizations to authenticated;
grant select on public.pack_distribution_shares to authenticated;
grant select on public.pack_access_events to authenticated;

-- Authorizes one exact pack revision for named recipient organizations, with the consent of the
-- person who authorizes it. It promises nothing about approval or funding and sends nothing.
create or replace function private.authorize_pack_distribution(
  p_organization_id uuid,
  p_session_id uuid,
  p_pack_revision_id uuid,
  p_pack_fingerprint text,
  p_consent_statement text,
  p_recipients jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
  revision public.information_pack_revisions;
  policy public.market_distribution_policies;
  issuer_name text;
  recipient_count integer;
  new_authorization_id uuid;
  consent_basis text;
  disclosed boolean;
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not (select private.can_access_intake_session(p_organization_id, p_session_id)) then
    raise exception 'pack_distribution_forbidden' using errcode = '42501';
  end if;
  if not (select private.is_org_type_member(p_organization_id, array['company', 'originator', 'offroad'])) then
    raise exception 'pack_distribution_capability_required' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = p_organization_id
      and membership.user_id = actor_id
      and membership.status = 'active'
      and membership.role in ('owner', 'admin')
  ) then
    raise exception 'pack_distribution_authorizer_role_required' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_consent_statement, ''))) not between 20 and 2000 then
    raise exception 'pack_distribution_consent_required' using errcode = '22023';
  end if;

  select row.* into session_row
  from public.document_intake_sessions row
  where row.organization_id = p_organization_id and row.id = p_session_id
  for update;
  if not found or session_row.capital_project_id is null then
    raise exception 'intake_session_not_found' using errcode = 'P0002';
  end if;
  if session_row.representation_status <> 'verified' or session_row.representation_kind is null then
    raise exception 'verified_representation_required' using errcode = '42501';
  end if;
  consent_basis := case session_row.representation_kind
    when 'company' then 'company_officer'
    else 'advisor_representation'
  end;

  select row.* into revision
  from public.information_pack_revisions row
  where row.organization_id = p_organization_id
    and row.id = p_pack_revision_id
    and row.intake_session_id = p_session_id
  for share;
  if not found then
    raise exception 'information_pack_revision_not_found' using errcode = 'P0002';
  end if;
  if revision.pack_fingerprint is distinct from p_pack_fingerprint then
    raise exception 'information_pack_revision_changed' using errcode = '22023';
  end if;
  if revision.status <> 'current' then
    raise exception 'current_information_pack_revision_required' using errcode = '22023';
  end if;

  select row.* into policy
  from public.market_distribution_policies row
  where row.status = 'active'
    and row.valid_from <= current_date
    and (row.valid_until is null or row.valid_until >= current_date)
  order by row.valid_from desc
  limit 1;
  if not found then
    raise exception 'active_market_distribution_policy_required' using errcode = '22023';
  end if;

  if coalesce(jsonb_typeof(p_recipients), 'null') <> 'array' then
    raise exception 'pack_distribution_recipients_invalid' using errcode = '22023';
  end if;
  recipient_count := jsonb_array_length(p_recipients);
  if recipient_count < 1 then
    raise exception 'pack_distribution_recipients_invalid' using errcode = '22023';
  end if;
  if recipient_count > policy.wave_limit then
    raise exception 'pack_distribution_wave_limit_exceeded' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_recipients) entry(value)
    where jsonb_typeof(entry.value) <> 'object'
      or coalesce(entry.value ->> 'recipientKind', '') not in ('registered_organization', 'directory_entry')
      or length(trim(coalesce(entry.value ->> 'label', ''))) not between 2 and 200
  ) then
    raise exception 'pack_distribution_recipients_invalid' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_recipients) entry(value)
    where entry.value ->> 'recipientKind' = 'registered_organization'
      and not exists (
        select 1
        from public.organizations recipient
        where recipient.id = nullif(entry.value ->> 'recipientOrganizationId', '')::uuid
          and recipient.organization_type = 'capital_provider'
          and recipient.id <> p_organization_id
      )
  ) then
    raise exception 'pack_distribution_recipient_organization_invalid' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_recipients) entry(value)
    where entry.value ->> 'recipientKind' = 'directory_entry'
      and not exists (
        select 1
        from public.fund_directory directory
        where directory.id = nullif(entry.value ->> 'recipientDirectoryId', '')::uuid
      )
  ) then
    raise exception 'pack_distribution_recipient_directory_invalid' using errcode = '22023';
  end if;

  disclosed := session_row.identity_policy = 'identified_restricted';
  issuer_name := case when disclosed then coalesce(
    nullif(trim(session_row.company_profile ->> 'name'), ''),
    (select nullif(trim(organization.name), '') from public.organizations organization where organization.id = p_organization_id)
  ) else null end;
  if disclosed and issuer_name is null then
    raise exception 'pack_distribution_issuer_identity_missing' using errcode = '22023';
  end if;

  insert into public.pack_distribution_authorizations (
    organization_id, intake_session_id, capital_project_id, pack_revision_id, pack_fingerprint,
    identity_policy, wave_limit, policy_version, consent_basis, consent_statement, consented_by
  ) values (
    p_organization_id, p_session_id, session_row.capital_project_id, revision.id, revision.pack_fingerprint,
    session_row.identity_policy, policy.wave_limit, policy.version, consent_basis, trim(p_consent_statement), actor_id
  ) returning id into new_authorization_id;

  insert into public.pack_distribution_shares (
    organization_id, intake_session_id, authorization_id, pack_revision_id, position,
    recipient_kind, recipient_organization_id, recipient_directory_id, recipient_label,
    delivery_state, issuer_identity_disclosed, issuer_display_name, created_by
  )
  select
    p_organization_id,
    p_session_id,
    new_authorization_id,
    revision.id,
    entry.position::integer,
    entry.value ->> 'recipientKind',
    nullif(entry.value ->> 'recipientOrganizationId', '')::uuid,
    nullif(entry.value ->> 'recipientDirectoryId', '')::uuid,
    trim(entry.value ->> 'label'),
    case entry.value ->> 'recipientKind'
      when 'registered_organization' then 'available'
      else 'not_delivered_no_product_access'
    end,
    disclosed,
    issuer_name,
    actor_id
  from jsonb_array_elements(p_recipients) with ordinality entry(value, position);

  return jsonb_build_object(
    'authorization_id', new_authorization_id,
    'pack_revision_id', revision.id,
    'pack_fingerprint', revision.pack_fingerprint,
    'identity_policy', session_row.identity_policy,
    'wave_limit', policy.wave_limit,
    'policy_version', policy.version,
    'recipient_count', recipient_count
  );
exception
  when unique_violation then
    raise exception 'pack_distribution_authorization_exists' using errcode = '23505';
end;
$$;

create or replace function private.revoke_pack_distribution(p_authorization_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  authorization_row public.pack_distribution_authorizations;
begin
  select row.* into authorization_row
  from public.pack_distribution_authorizations row
  where row.id = p_authorization_id
  for update;
  if not found then
    raise exception 'pack_distribution_authorization_not_found' using errcode = 'P0002';
  end if;
  if not (select private.can_access_intake_session(authorization_row.organization_id, authorization_row.intake_session_id)) then
    raise exception 'pack_distribution_forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = authorization_row.organization_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role in ('owner', 'admin')
  ) then
    raise exception 'pack_distribution_authorizer_role_required' using errcode = '42501';
  end if;
  if authorization_row.status <> 'active' then
    return authorization_row.id;
  end if;

  update public.pack_distribution_shares
  set status = 'revoked', revoked_by = (select auth.uid()), revoked_at = now()
  where organization_id = authorization_row.organization_id
    and authorization_id = authorization_row.id
    and status = 'active';
  update public.pack_distribution_authorizations
  set status = 'revoked', revoked_by = (select auth.uid()), revoked_at = now()
  where organization_id = authorization_row.organization_id and id = authorization_row.id;
  return authorization_row.id;
end;
$$;

-- The recipient projection. It carries the pack identity and the exact files, never the issuer's
-- project, never free text written for the issuer, and never the issuer's identity under a blind
-- policy. Reading it is an event: the issuer sees who opened what and when.
create or replace function private.read_shared_information_pack(p_share_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  share_row public.pack_distribution_shares;
  revision public.information_pack_revisions;
  items jsonb;
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  select row.* into share_row
  from public.pack_distribution_shares row
  where row.id = p_share_id;
  if not found then
    raise exception 'shared_information_pack_not_available' using errcode = '42501';
  end if;
  if not (select private.pack_share_live_for_recipient(share_row.organization_id, share_row.id)) then
    raise exception 'shared_information_pack_not_available' using errcode = '42501';
  end if;

  select row.* into revision
  from public.information_pack_revisions row
  where row.organization_id = share_row.organization_id and row.id = share_row.pack_revision_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', item.id,
    'position', item.position,
    'deliverableId', item.deliverable_id,
    'format', item.format,
    'artifactFingerprint', item.artifact_fingerprint,
    'templateKey', item.template_key,
    'templateVersion', item.template_version,
    'templateOrigin', item.template_origin,
    'templateFingerprint', item.template_fingerprint
  ) order by item.position), '[]'::jsonb)
  into items
  from public.information_pack_items item
  where item.organization_id = share_row.organization_id and item.pack_revision_id = revision.id;

  insert into public.pack_access_events (
    organization_id, intake_session_id, share_id, pack_revision_id,
    recipient_organization_id, access_kind, accessed_by
  ) values (
    share_row.organization_id, share_row.intake_session_id, share_row.id, revision.id,
    share_row.recipient_organization_id, 'pack_opened', actor_id
  );

  return jsonb_build_object(
    'share_id', share_row.id,
    'pack_revision_id', revision.id,
    'revision_number', revision.revision_number,
    'pack_fingerprint', revision.pack_fingerprint,
    'revision_status', revision.status,
    'issued_at', revision.created_at,
    'identity_policy', case when share_row.issuer_identity_disclosed then 'identified_restricted' else 'blind_initial' end,
    'issuer_name', share_row.issuer_display_name,
    'items', items
  );
end;
$$;

create or replace function private.open_shared_information_pack_item(p_share_id uuid, p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  share_row public.pack_distribution_shares;
  item public.information_pack_items;
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  select row.* into share_row
  from public.pack_distribution_shares row
  where row.id = p_share_id;
  if not found then
    raise exception 'shared_information_pack_not_available' using errcode = '42501';
  end if;
  if not (select private.pack_share_live_for_recipient(share_row.organization_id, share_row.id)) then
    raise exception 'shared_information_pack_not_available' using errcode = '42501';
  end if;

  select row.* into item
  from public.information_pack_items row
  where row.organization_id = share_row.organization_id
    and row.id = p_item_id
    and row.pack_revision_id = share_row.pack_revision_id;
  if not found then
    raise exception 'shared_information_pack_item_not_found' using errcode = 'P0002';
  end if;

  insert into public.pack_access_events (
    organization_id, intake_session_id, share_id, pack_revision_id,
    recipient_organization_id, pack_item_id, access_kind, accessed_by
  ) values (
    share_row.organization_id, share_row.intake_session_id, share_row.id, share_row.pack_revision_id,
    share_row.recipient_organization_id, item.id, 'item_opened', actor_id
  );

  return jsonb_build_object(
    'id', item.id,
    'deliverableId', item.deliverable_id,
    'format', item.format,
    'artifactFingerprint', item.artifact_fingerprint,
    'templateKey', item.template_key,
    'templateVersion', item.template_version,
    'templateOrigin', item.template_origin,
    'templateFingerprint', item.template_fingerprint
  );
end;
$$;

create or replace function public.authorize_pack_distribution(
  p_organization_id uuid,
  p_session_id uuid,
  p_pack_revision_id uuid,
  p_pack_fingerprint text,
  p_consent_statement text,
  p_recipients jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.authorize_pack_distribution(
    p_organization_id, p_session_id, p_pack_revision_id, p_pack_fingerprint,
    p_consent_statement, p_recipients
  );
$$;

create or replace function public.revoke_pack_distribution(p_authorization_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.revoke_pack_distribution(p_authorization_id);
$$;

create or replace function public.read_shared_information_pack(p_share_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.read_shared_information_pack(p_share_id);
$$;

create or replace function public.open_shared_information_pack_item(p_share_id uuid, p_item_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.open_shared_information_pack_item(p_share_id, p_item_id);
$$;

revoke all on function private.authorize_pack_distribution(uuid, uuid, uuid, text, text, jsonb) from public, anon;
revoke all on function private.revoke_pack_distribution(uuid) from public, anon;
revoke all on function private.read_shared_information_pack(uuid) from public, anon;
revoke all on function private.open_shared_information_pack_item(uuid, uuid) from public, anon;
revoke all on function public.authorize_pack_distribution(uuid, uuid, uuid, text, text, jsonb) from public, anon;
revoke all on function public.revoke_pack_distribution(uuid) from public, anon;
revoke all on function public.read_shared_information_pack(uuid) from public, anon;
revoke all on function public.open_shared_information_pack_item(uuid, uuid) from public, anon;
grant execute on function private.authorize_pack_distribution(uuid, uuid, uuid, text, text, jsonb) to authenticated;
grant execute on function private.revoke_pack_distribution(uuid) to authenticated;
grant execute on function private.read_shared_information_pack(uuid) to authenticated;
grant execute on function private.open_shared_information_pack_item(uuid, uuid) to authenticated;
grant execute on function public.authorize_pack_distribution(uuid, uuid, uuid, text, text, jsonb) to authenticated;
grant execute on function public.revoke_pack_distribution(uuid) to authenticated;
grant execute on function public.read_shared_information_pack(uuid) to authenticated;
grant execute on function public.open_shared_information_pack_item(uuid, uuid) to authenticated;

comment on table public.pack_distribution_authorizations is
  'Issuer-side authorization to make one exact pack revision available inside the product, with the consent record of the person who authorized it.';
comment on table public.pack_distribution_shares is
  'One named recipient of an authorization. A directory entry has no product access and the row records that nothing was delivered to it.';
comment on table public.pack_access_events is
  'Append-only log of every read of a shared pack by a recipient organization.';
comment on function public.authorize_pack_distribution(uuid, uuid, uuid, text, text, jsonb) is
  'Authorizes an exact pack revision for named recipient organizations inside the product. It sends nothing and promises no approval or funding.';
