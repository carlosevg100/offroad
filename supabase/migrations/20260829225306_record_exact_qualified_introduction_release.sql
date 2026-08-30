-- Record, but never initiate, an externally completed qualified introduction.
-- Delivery stays an operational action outside this function. This command only writes
-- append-only evidence after the exact authorized package reached the exact named contact.

alter table public.qualified_introductions
  add column delivery_channel text,
  add column delivery_reference text,
  add constraint qualified_introductions_delivery_evidence check (
    (delivery_channel is null and delivery_reference is null)
    or (
      delivery_channel in ('email', 'secure_link', 'other')
      and length(trim(delivery_reference)) between 3 and 500
    )
  );

create function private.record_qualified_introduction_release(
  p_recipient_id uuid,
  p_introduced_by uuid,
  p_delivery_channel text,
  p_delivery_reference text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient public.qualified_introduction_recipients;
  target public.qualified_introduction_targets;
  plan public.qualified_introduction_plans;
  policy public.market_distribution_policies;
  existing public.qualified_introductions;
  introduction_id uuid;
begin
  if p_delivery_channel not in ('email', 'secure_link', 'other')
    or length(trim(p_delivery_reference)) not between 3 and 500
    or not exists (select 1 from auth.users where id = p_introduced_by)
  then
    raise exception 'qualified_introduction_delivery_evidence_invalid' using errcode = '22023';
  end if;

  select row.* into recipient
  from public.qualified_introduction_recipients row
  where row.id = p_recipient_id
  for share;
  if not found then
    raise exception 'qualified_introduction_recipient_not_found' using errcode = 'P0002';
  end if;

  select row.* into plan
  from public.qualified_introduction_plans row
  where row.organization_id = recipient.organization_id and row.id = recipient.plan_id
  for share;
  select row.* into target
  from public.qualified_introduction_targets row
  where row.organization_id = recipient.organization_id and row.id = recipient.target_id
  for share;
  if plan.status <> 'authorized'
    or target.contact_status <> 'resolved'
    or target.resolved_contact_id is distinct from recipient.contact_uuid
    or target.mandate_fingerprint is distinct from recipient.mandate_fingerprint
    or plan.authorization_snapshot is null
  then
    raise exception 'current_exact_qualified_introduction_authorization_required' using errcode = '42501';
  end if;

  select row.* into policy
  from public.market_distribution_policies row
  where row.status = 'active'
    and row.valid_from <= current_date
    and (row.valid_until is null or row.valid_until >= current_date)
  order by row.valid_from desc
  limit 1;
  if not found
    or target.mandate_revalidated_at is null
    or target.mandate_revalidated_at < now() - make_interval(months => policy.mandate_max_age_months)
  then
    raise exception 'current_market_distribution_attestation_required' using errcode = '42501';
  end if;

  if recipient.provider_source = 'directory' then
    if not exists (
      select 1
      from public.market_provider_contacts contact
      where contact.id = recipient.contact_uuid
        and contact.fund_directory_id = recipient.fund_directory_id
        and contact.status = 'active'
        and contact.email = recipient.contact_email
        and (contact.valid_until is null or contact.valid_until >= current_date)
    ) then
      raise exception 'current_exact_qualified_introduction_contact_required' using errcode = '42501';
    end if;
  elsif not exists (
    select 1
    from public.provider_contacts contact
    where contact.id = recipient.contact_uuid
      and contact.organization_id = recipient.provider_organization_id
      and contact.fund_id = recipient.provider_fund_id
      and contact.status = 'active'
      and contact.email = recipient.contact_email
  ) then
    raise exception 'current_exact_qualified_introduction_contact_required' using errcode = '42501';
  end if;

  select row.* into existing
  from public.qualified_introductions row
  where row.organization_id = recipient.organization_id and row.recipient_id = recipient.id;
  if found then
    if existing.delivery_channel = p_delivery_channel
      and existing.delivery_reference = trim(p_delivery_reference)
    then
      return existing.id;
    end if;
    raise exception 'qualified_introduction_release_already_recorded' using errcode = '23505';
  end if;

  insert into public.qualified_introductions (
    organization_id, intake_session_id, plan_id, recipient_id,
    provider_source, provider_id, fund_directory_id, provider_organization_id, provider_fund_id,
    contact_source, contact_uuid, contact_id, contact_name, contact_email, contact_job_title,
    case_fingerprint, material_fingerprint, mandate_fingerprint, rationale,
    material_manifest, authorization_snapshot, delivery_channel, delivery_reference, introduced_by
  ) values (
    recipient.organization_id, recipient.intake_session_id, recipient.plan_id, recipient.id,
    recipient.provider_source, recipient.provider_id, recipient.fund_directory_id,
    recipient.provider_organization_id, recipient.provider_fund_id,
    recipient.contact_source, recipient.contact_uuid, recipient.contact_id,
    recipient.contact_name, recipient.contact_email, recipient.contact_job_title,
    plan.case_fingerprint, plan.material_fingerprint, recipient.mandate_fingerprint, recipient.rationale,
    recipient.material_manifest, plan.authorization_snapshot,
    p_delivery_channel, trim(p_delivery_reference), p_introduced_by
  ) returning id into introduction_id;

  return introduction_id;
end;
$$;

revoke all on function private.record_qualified_introduction_release(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function private.record_qualified_introduction_release(uuid, uuid, text, text)
  to service_role;

