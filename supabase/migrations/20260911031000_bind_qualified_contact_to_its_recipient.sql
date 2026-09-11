-- A prepared contact and the pack share must name the same market participant. Without this, a
-- project could introduce one provider while the pack was made available to a different
-- organization. A directory target matches the registered organization that claimed it.

create or replace function private.enforce_qualified_contact_recipient_binding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.qualified_introduction_targets;
  share_row public.pack_distribution_shares;
begin
  if new.share_id is null then
    return new;
  end if;

  select row.* into target
  from public.qualified_introduction_targets row
  where row.organization_id = new.organization_id and row.id = new.target_id;
  select row.* into share_row
  from public.pack_distribution_shares row
  where row.organization_id = new.organization_id and row.id = new.share_id;
  if target.id is null or share_row.id is null then
    raise exception 'qualified_contact_recipient_mismatch' using errcode = '22023';
  end if;

  if target.provider_source = 'registered' then
    if share_row.recipient_organization_id is distinct from target.provider_organization_id then
      raise exception 'qualified_contact_recipient_mismatch' using errcode = '22023';
    end if;
    return new;
  end if;

  if share_row.recipient_directory_id is not distinct from target.fund_directory_id then
    return new;
  end if;
  if share_row.recipient_organization_id is not null and exists (
    select 1
    from public.fund_directory directory
    where directory.id = target.fund_directory_id
      and directory.claimed_by_organization_id = share_row.recipient_organization_id
  ) then
    return new;
  end if;

  raise exception 'qualified_contact_recipient_mismatch' using errcode = '22023';
end;
$$;

revoke all on function private.enforce_qualified_contact_recipient_binding()
  from public, anon, authenticated;

create trigger qualified_contact_preparations_recipient_binding
  before insert or update on public.qualified_contact_preparations
  for each row execute function private.enforce_qualified_contact_recipient_binding();

comment on function private.enforce_qualified_contact_recipient_binding() is
  'Keeps the prepared contact and the pack share pointing at the same market participant.';
